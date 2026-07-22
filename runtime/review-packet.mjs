#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = process.cwd();
const realRoot = await fs.realpath(root);
const args = process.argv.slice(2);
const command = args[0] === "verify" ? args.shift() : "create";
function flag(name, fallback = undefined) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : true;
}
async function existingInside(file, label) {
  const real = await fs.realpath(file);
  const relative = path.relative(realRoot, real);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} escapes the real project boundary.`);
  return real;
}
async function prepareOutputDirectory(directory) {
  let ancestor = directory;
  while (true) {
    try { await fs.realpath(ancestor); break; }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw error;
      ancestor = parent;
    }
  }
  await existingInside(ancestor, "Review output ancestor");
  await fs.mkdir(directory, { recursive: true });
  await existingInside(directory, "Review packet directory");
}
const gitRaw = (parts) => {
  const result = spawnSync("git", parts, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${parts.join(" ")} failed`);
  return result.stdout;
};
const git = (parts) => gitRaw(parts).trim();
if (command === "verify") {
  const packetArg = args[0];
  if (!packetArg) throw new Error("Usage: review-packet.mjs verify <packet.json>");
  const file = await existingInside(path.resolve(root, packetArg), "Packet");
  const relative = path.relative(realRoot, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Packet must be inside the project.");
  const packet = JSON.parse(await fs.readFile(file, "utf8"));
  const claimed = packet.packetHash;
  delete packet.packetHash;
  if (createHash("sha256").update(JSON.stringify(packet)).digest("hex") !== claimed) throw new Error("Review packet hash is invalid.");
  if (git(["rev-parse", "HEAD"]) !== packet.git.head) throw new Error("Implementation HEAD changed after review packet creation.");
  git(["rev-parse", "--verify", packet.git.base]);
  const currentDiff = gitRaw(["diff", "--binary", `${packet.git.base}...HEAD`]);
  if (createHash("sha256").update(currentDiff).digest("hex") !== packet.git.diffSha256) throw new Error("Implementation diff changed after review packet creation.");
  const dirty = gitRaw(["status", "--porcelain", "--untracked-files=all"]).split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).replace(/^"|"$/g, "")).filter((file) => !file.replace(/\\/g, "/").startsWith(".geki/"));
  if (dirty.length) throw new Error(`Implementation worktree is not clean: ${dirty.join(", ")}`);
  for (const source of [packet.sources.architecture, packet.sources.storyContract, packet.sources.storyApproval, packet.sources.state, ...(packet.sources.gates || [])]) {
    const sourceFile = await existingInside(path.resolve(root, source.path), "Review source");
    const sourceRelative = path.relative(realRoot, sourceFile);
    if (sourceRelative.startsWith("..") || path.isAbsolute(sourceRelative)) throw new Error("Review source escapes the project.");
    const data = await fs.readFile(sourceFile);
    if (createHash("sha256").update(data).digest("hex") !== source.sha256) throw new Error(`Review source changed: ${source.path}`);
  }
  console.log(JSON.stringify({ valid: true, packet: relative.split(path.sep).join("/"), story: packet.story }, null, 2));
  process.exit(0);
}
const story = flag("story");
if (!story || story === true) throw new Error("Usage: review-packet.mjs --story <id> [--base <ref>]");
if (!/^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/.test(story)) throw new Error("Story ID contains unsafe characters.");
const base = flag("base", "HEAD~1");
const hashFile = async (file) => {
  file = await existingInside(file, "Review source");
  const relative = path.relative(realRoot, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Review source escapes the project.");
  const data = await fs.readFile(file);
  return { path: relative.split(path.sep).join("/"), sha256: createHash("sha256").update(data).digest("hex"), bytes: data.length };
};
const storyFile = path.join(root, ".geki", "spec", "stories", `${story}.yaml`);
const storyApprovalFile = `${storyFile}.sha256.json`;
const architectureFile = path.join(root, ".geki", "architecture.json");
const stateFile = path.join(root, ".geki", "state", "current-run.json");
const activeState = JSON.parse(await fs.readFile(stateFile, "utf8"));
const evidenceFiles = [...new Set(Object.values(activeState.storyGates?.[story] || {}).map((entry) => entry?.evidence?.path).filter(Boolean))];
git(["rev-parse", "--verify", base]);
const dirty = gitRaw(["status", "--porcelain", "--untracked-files=all"]).split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).replace(/^"|"$/g, "")).filter((file) => !file.replace(/\\/g, "/").startsWith(".geki/"));
if (dirty.length) throw new Error(`Commit implementation changes before independent review: ${dirty.join(", ")}`);
const storyData = await fs.readFile(storyFile);
const storyApproval = JSON.parse(await fs.readFile(storyApprovalFile, "utf8"));
const storyRelative = path.relative(root, storyFile).split(path.sep).join("/");
if (storyApproval.contract !== storyRelative || storyApproval.sha256 !== createHash("sha256").update(storyData).digest("hex") || !/^status:\s*approved\s*$/m.test(storyData.toString("utf8"))) throw new Error("Story Contract is unapproved or changed.");
const implementationDiff = gitRaw(["diff", "--binary", `${base}...HEAD`]);
const packet = {
  schemaVersion: 1,
  story,
  createdAt: new Date().toISOString(),
  cleanContextRequired: true,
  instructions: [
    "Open this packet in a new Codex subagent or a clean Antigravity context.",
    "Review spec compliance before code quality; do not trust the implementer's summary.",
    "Return findings with severity, evidence, requirement, and suggested correction."
  ],
  sources: {
    architecture: await hashFile(architectureFile),
    storyContract: await hashFile(storyFile),
    storyApproval: await hashFile(storyApprovalFile),
    state: await hashFile(stateFile),
    gates: await Promise.all(evidenceFiles.map((name) => hashFile(path.resolve(root, name))))
  },
  git: {
    head: git(["rev-parse", "HEAD"]),
    base,
    diffSha256: createHash("sha256").update(implementationDiff).digest("hex"),
    changedFiles: git(["diff", "--name-only", `${base}...HEAD`]).split(/\r?\n/).filter(Boolean)
  }
};
packet.packetHash = createHash("sha256").update(JSON.stringify(packet)).digest("hex");
const output = path.join(root, ".geki", "review", `${story}.json`);
await prepareOutputDirectory(path.dirname(output));
await fs.writeFile(output, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
console.log(path.relative(root, output));
