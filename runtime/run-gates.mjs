#!/usr/bin/env node
import { spawn } from "node:child_process";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { gateInput } from "./gate-input.mjs";
import { controlPath, relativeControl, resolveProjectContext } from "./project-context.mjs";

const context = resolveProjectContext();
const root = context.workspaceRoot;
const policyFile = controlPath(context, "gates.json");
const evidenceDir = controlPath(context, "evidence", "gates");
const cacheFile = path.join(evidenceDir, "cache.json");
const stateFile = controlPath(context, "state", "current-run.json");
const isCi = process.argv.includes("--ci");
const idsIndex = process.argv.indexOf("--ids");
const selectedIds = idsIndex >= 0 ? new Set(String(process.argv[idsIndex + 1] || "").split(",").map((item) => item.trim()).filter(Boolean)) : null;

async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function run(entry) {
  const startedAt = new Date().toISOString();
  return new Promise((resolve) => {
    const child = spawn(entry.command, { cwd: path.resolve(root, entry.cwd || "."), shell: true, stdio: "inherit", env: { ...process.env, CI: isCi ? "true" : process.env.CI } });
    child.on("exit", (code) => resolve({ ...entry, startedAt, completedAt: new Date().toISOString(), exitCode: code ?? 1, outcome: code === 0 ? "passed" : "failed" }));
    child.on("error", (error) => resolve({ ...entry, startedAt, completedAt: new Date().toISOString(), exitCode: 1, outcome: "failed", error: error.message }));
  });
}

function inferredCommands() {
  const commands = [];
  return Promise.all([
    exists(path.join(root, "package.json")),
    exists(path.join(root, "package-lock.json")),
    findDotnetEntry(root)
  ]).then(async ([hasPackage, hasLock, dotnetEntry]) => {
    if (hasPackage) {
      const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
      const scripts = pkg.scripts || {};
      commands.push({ id: "dependencies", command: hasLock ? "npm ci" : "npm install", required: true });
      for (const [id, script] of [["format", "format:check"], ["lint", "lint"], ["typecheck", "typecheck"], ["build", "build"], ["unit", "test"], ["integration", "test:integration"], ["api", "test:e2e"]]) {
        if (scripts[script]) commands.push({ id, command: `npm run ${script}`, required: true });
      }
      commands.push({ id: "security", command: "node .geki/runtime/dependency-audit.mjs npm", required: true, paths: ["package.json", "package-lock.json", "npm-shrinkwrap.json"] });
    }
    if (dotnetEntry) {
      const quoted = `\"${path.relative(root, dotnetEntry)}\"`;
      commands.push({ id: "restore", command: `dotnet restore ${quoted}`, required: true });
      commands.push({ id: "format", command: `dotnet format ${quoted} --verify-no-changes --no-restore`, required: true });
      commands.push({ id: "build", command: `dotnet build ${quoted} --no-restore --configuration Release`, required: true });
      commands.push({ id: "unit", command: `dotnet test ${quoted} --no-build --configuration Release`, required: true });
      commands.push({ id: "security", command: `dotnet list ${quoted} package --vulnerable --include-transitive`, required: true });
    }
    return commands;
  });
}

async function findDotnetEntry(directory) {
  const ignored = new Set([".git", ".geki", "node_modules", "bin", "obj"]);
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = entries.filter((entry) => entry.isFile());
  const solution = files.find((entry) => entry.name.endsWith(".sln"));
  if (solution) return path.join(directory, solution.name);
  const project = files.find((entry) => entry.name.endsWith(".csproj"));
  if (project) return path.join(directory, project.name);
  for (const entry of entries) {
    if (entry.isDirectory() && !ignored.has(entry.name)) {
      const found = await findDotnetEntry(path.join(directory, entry.name));
      if (found) return found;
    }
  }
  return null;
}

const policyData = await fs.readFile(policyFile);
const policy = JSON.parse(policyData.toString("utf8"));
const policyHash = createHash("sha256").update(policyData).digest("hex");
const availableCommands = policy.commands?.length ? policy.commands : await inferredCommands();
const commands = selectedIds ? availableCommands.filter((entry) => selectedIds.has(entry.id)) : availableCommands;
if (selectedIds) {
  const missing = [...selectedIds].filter((id) => !availableCommands.some((entry) => entry.id === id));
  if (missing.length) throw new Error(`Unknown requested gate IDs: ${missing.join(", ")}`);
}
if (!commands.length) throw new Error("No quality gate commands are configured or detectable.");
await fs.mkdir(evidenceDir, { recursive: true });
const cache = await fs.readFile(cacheFile, "utf8").then(JSON.parse).catch(() => ({ schemaVersion: 1, entries: {} }));
const results = [];
for (const command of commands) {
  const input = await gateInput(root, command, policyHash);
  const cached = cache.entries?.[input.key];
  let result;
  if (cached?.outcome === "passed") {
    console.log(`\n[geki:${command.id}] cached (${input.key.slice(0, 10)})`);
    result = { ...cached, ...command, ...input, cached: true, reusedAt: new Date().toISOString() };
  } else {
    console.log(`\n[geki:${command.id}] ${command.command}`);
    result = { ...await run(command), ...input, cached: false };
    if (result.outcome === "passed") cache.entries[input.key] = result;
  }
  results.push(result);
  if (result.outcome === "failed" && command.required !== false) break;
}
await fs.writeFile(cacheFile, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
const activeState = await exists(stateFile) ? JSON.parse(await fs.readFile(stateFile, "utf8")) : null;
if (activeState && !activeState.currentStory) throw new Error("Gate execution requires an active Story.");
const report = {
  schemaVersion: 2,
  kind: "gate-report",
  createdAt: new Date().toISOString(),
  ci: isCi,
  workspaceRoot: root,
  controlRoot: context.controlRoot,
  scope: activeState ? { story: activeState.currentStory, epic: activeState.currentEpic || null } : null,
  policyHash,
  results
};
const reportFile = path.join(evidenceDir, `${report.createdAt.replace(/[:.]/g, "-")}.json`);
await fs.writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
const reportData = await fs.readFile(reportFile);
const reportHash = createHash("sha256").update(reportData).digest("hex");
const sourceCommit = (() => {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
})();
if (activeState) {
  const state = activeState;
  state.storyGates ||= {};
  state.storyGates[state.currentStory] ||= {};
  for (const result of results) {
    const evidence = {
      path: relativeControl(context, reportFile),
      sha256: reportHash,
      bytes: reportData.length,
      sourceCommit,
      workspaceFingerprint: null,
      inputFingerprint: result.inputFingerprint,
      inputPaths: result.inputPaths,
      policyHash: result.policyHash,
      gateId: result.id,
      kind: "gate-report"
    };
    state.storyGates[state.currentStory][result.id] = { outcome: result.outcome, evidence, at: result.completedAt, command: result.command, cached: result.cached };
  }
  state.updatedAt = new Date().toISOString();
  await fs.writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
const failed = results.filter((result) => result.outcome === "failed" && result.required !== false);
console.log(`\nGeki evidence: ${relativeControl(context, reportFile)}`);
if (failed.length) process.exitCode = 1;
