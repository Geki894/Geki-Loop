#!/usr/bin/env node
import { spawn } from "node:child_process";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const policyFile = path.join(root, ".geki", "gates.json");
const evidenceDir = path.join(root, ".geki", "evidence", "gates");
const isCi = process.argv.includes("--ci");

async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function workspaceFingerprint() {
  const result = spawnSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error("Git repository is required for gate evidence.");
  const files = result.stdout.split("\0").filter(Boolean).filter((file) => !file.replace(/\\/g, "/").startsWith(".geki/")).sort();
  const hash = createHash("sha256");
  for (const relative of files) {
    const file = path.join(root, relative);
    const stat = await fs.stat(file).catch(() => null);
    if (!stat?.isFile()) continue;
    hash.update(relative.replace(/\\/g, "/")).update("\0").update(await fs.readFile(file)).update("\0");
  }
  return hash.digest("hex");
}
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
      commands.push({ id: "security", command: "npm audit --audit-level=high", required: true });
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

const policy = JSON.parse(await fs.readFile(policyFile, "utf8"));
const commands = policy.commands?.length ? policy.commands : await inferredCommands();
if (!commands.length) throw new Error("No quality gate commands are configured or detectable.");
await fs.mkdir(evidenceDir, { recursive: true });
const results = [];
for (const command of commands) {
  console.log(`\n[geki:${command.id}] ${command.command}`);
  const result = await run(command);
  results.push(result);
  if (result.outcome === "failed" && command.required !== false) break;
}
const stateFile = path.join(root, ".geki", "state", "current-run.json");
const activeState = await exists(stateFile) ? JSON.parse(await fs.readFile(stateFile, "utf8")) : null;
if (activeState && !activeState.currentStory) throw new Error("Gate execution requires an active Story.");
const report = { schemaVersion: 1, kind: "gate-report", createdAt: new Date().toISOString(), ci: isCi, scope: activeState ? { story: activeState.currentStory, epic: activeState.currentEpic || null } : null, results };
const reportFile = path.join(evidenceDir, `${report.createdAt.replace(/[:.]/g, "-")}.json`);
await fs.writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
const reportData = await fs.readFile(reportFile);
const evidence = {
  path: path.relative(root, reportFile).split(path.sep).join("/"),
  sha256: createHash("sha256").update(reportData).digest("hex"),
  bytes: reportData.length,
  sourceCommit: (() => {
    const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
    return result.status === 0 ? result.stdout.trim() : null;
  })(),
  workspaceFingerprint: await workspaceFingerprint(),
  kind: "gate-report"
};
if (activeState) {
  const state = activeState;
  state.storyGates ||= {};
  state.storyGates[state.currentStory] ||= {};
  for (const result of results) {
    state.storyGates[state.currentStory][result.id] = { outcome: result.outcome, evidence, at: result.completedAt, command: result.command };
  }
  state.updatedAt = new Date().toISOString();
  await fs.writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
const failed = results.filter((result) => result.outcome === "failed" && result.required !== false);
console.log(`\nGeki evidence: ${path.relative(root, reportFile)}`);
if (failed.length) process.exitCode = 1;
