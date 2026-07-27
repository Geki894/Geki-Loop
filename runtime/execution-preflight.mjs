#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { controlPath, relativeControl, resolveProjectContext } from "./project-context.mjs";

const context = resolveProjectContext();
const args = process.argv.slice(2);
function flag(name, fallback = undefined) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const next = args[index + 1];
  return next && !next.startsWith("--") ? next : true;
}
const stories = String(flag("stories", "")).split(",").map((item) => item.trim()).filter(Boolean);
if (!stories.length) throw new Error("Usage: execution-preflight.mjs --stories <ids> [--apply]");
const apply = args.includes("--apply") || args.includes("--apply-sync");
const runtimeDirectory = path.dirname(fileURLToPath(import.meta.url));
const checks = [];
const add = (id, ok, detail, fixable = false) => checks.push({ id, ok, detail, fixable });
function run(command, commandArgs, cwd = context.workspaceRoot, timeout = 60_000) {
  return spawnSync(command, commandArgs, { cwd, encoding: "utf8", timeout });
}
const architecture = JSON.parse(await fs.readFile(controlPath(context, "architecture.json"), "utf8"));
const lock = JSON.parse(await fs.readFile(controlPath(context, "lock.json"), "utf8"));
add("architecture-approved", architecture.status === "approved", `status=${architecture.status}`);
let architectureCheck = run(process.execPath, [path.join(runtimeDirectory, "architecture-check.mjs")]);
if (architectureCheck.status !== 0 && apply && /not synchronized/i.test(architectureCheck.stdout)) {
  const cli = controlPath(context, "distribution", "bin", "geki.js");
  const sync = run(process.execPath, [cli, "sync", "--target", context.controlRoot, "--yes"], context.controlRoot, 120_000);
  add("module-sync", sync.status === 0, sync.stdout || sync.stderr, true);
  architectureCheck = run(process.execPath, [path.join(runtimeDirectory, "architecture-check.mjs")]);
}
if (architectureCheck.status !== 0 && apply && /dependency\/peer compatibility failed/i.test(architectureCheck.stdout)) {
  const packageLock = path.join(context.workspaceRoot, "package-lock.json");
  try {
    await fs.access(packageLock);
    const install = run("npm", ["ci"], context.workspaceRoot, 180_000);
    add("node-dependencies", install.status === 0, install.stdout || install.stderr, true);
    architectureCheck = run(process.execPath, [path.join(runtimeDirectory, "architecture-check.mjs")]);
  } catch {
    add("node-dependencies", false, "package-lock.json is required for autonomous dependency installation.", true);
  }
}
if (apply) {
  const dotnet = run("git", ["ls-files", "*.sln", "*.csproj"]);
  const entry = (dotnet.stdout || "").split(/\r?\n/).find(Boolean);
  if (entry) {
    const restore = run("dotnet", ["restore", entry], context.workspaceRoot, 180_000);
    add("dotnet-restore", restore.status === 0, restore.stdout || restore.stderr, true);
  }
}
add("architecture-provisioning", architectureCheck.status === 0, architectureCheck.stdout || architectureCheck.stderr, true);
const compilation = run(process.execPath, [path.join(runtimeDirectory, "contract-compiler.mjs"), "--stories", stories.join(","), "--execution"]);
add("contract-compilation", compilation.status === 0, compilation.stdout || compilation.stderr);
const gitRepository = run("git", ["rev-parse", "--show-toplevel"]);
add("git", gitRepository.status === 0, gitRepository.stdout || gitRepository.stderr);
const dirty = run("git", ["status", "--porcelain", "--untracked-files=all"]);
const dirtyApplication = (dirty.stdout || "").split(/\r?\n/).filter(Boolean).filter((line) => {
  const file = line.slice(3).replace(/^"|"$/g, "").replace(/\\/g, "/");
  return !file.startsWith(".geki/");
});
add("clean-workspace", !dirtyApplication.length, dirtyApplication.length ? dirtyApplication.join(", ") : "clean");
const remote = run("git", ["remote", "get-url", "origin"]);
add("git-remote", remote.status === 0, remote.stdout || remote.stderr, Object.keys(lock.modules || {}).includes("github-ci"));
const probe = controlPath(context, "preflight-write-probe.tmp");
try {
  await fs.writeFile(probe, "ok", "utf8");
  await fs.rm(probe);
  add("control-root-write", true, context.controlRoot);
} catch (error) { add("control-root-write", false, error.message); }
if (Object.keys(lock.modules || {}).includes("github-ci")) {
  const gh = run("gh", ["--version"]);
  add("github-cli", gh.status === 0, gh.stdout || gh.stderr);
  const auth = run("gh", ["auth", "status"]);
  add("github-auth", auth.status === 0, auth.stdout || auth.stderr);
}
const doctor = run(process.execPath, [controlPath(context, "distribution", "bin", "geki.js"), "doctor", "--target", context.controlRoot]);
add("doctor", doctor.status === 0, doctor.stdout || doctor.stderr, true);
const inputHash = createHash("sha256");
const storyFiles = stories.map((id) => controlPath(context, "spec", "stories", `${id}.yaml`));
const epicIds = new Set();
for (const file of storyFiles) {
  const content = await fs.readFile(file, "utf8");
  const match = content.match(/^epicId:\s*["']?([^"'\r\n]+)["']?\s*$/m);
  if (match) epicIds.add(match[1].trim());
}
for (const file of [
  controlPath(context, "architecture.json"),
  controlPath(context, "lock.json"),
  controlPath(context, "gates.json"),
  ...storyFiles,
  ...[...epicIds].sort().map((id) => controlPath(context, "spec", "epics", `${id}.json`))
]) inputHash.update(await fs.readFile(file)).update("\0");
const report = {
  schemaVersion: 1,
  kind: "execution-preflight",
  createdAt: new Date().toISOString(),
  scope: { stories },
  workspaceRoot: context.workspaceRoot,
  controlRoot: context.controlRoot,
  linkedWorktree: context.linkedWorktree,
  inputHash: inputHash.digest("hex"),
  outcome: checks.every((check) => check.ok) ? "passed" : "failed",
  checks
};
const directory = controlPath(context, "evidence", "preflight");
await fs.mkdir(directory, { recursive: true });
const output = path.join(directory, `${report.inputHash}.json`);
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (report.outcome === "failed") {
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} else console.log(relativeControl(context, output));
