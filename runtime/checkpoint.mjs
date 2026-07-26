#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const stateFile = path.join(root, ".geki", "state", "current-run.json");
const planningFile = path.join(root, ".geki", "state", "planning.json");
const handoffFile = path.join(root, ".geki", "handoff", "current.yaml");
const args = process.argv.slice(2);
const flag = (name, fallback = undefined) => {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : true;
};

const state = JSON.parse(await fs.readFile(stateFile, "utf8"));
let planning = {};
try { planning = JSON.parse(await fs.readFile(planningFile, "utf8")); } catch {}
const git = (...gitArgs) => execFileSync("git", gitArgs, { cwd: root, encoding: "utf8" }).trim();
const branch = git("branch", "--show-current");
let commit = git("rev-parse", "HEAD");
const secretPatterns = [
  /(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"']{12,}["']/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /sk-[A-Za-z0-9_-]{20,}/
];

const yamlString = (value) => value === null || value === undefined ? "null" : JSON.stringify(String(value));
const completed = String(flag("completed", "")).split("|").filter(Boolean);
const remaining = String(flag("remaining", "")).split("|").filter(Boolean);
const yamlList = (items) => items.length ? items.map((item) => `  - ${yamlString(item)}`).join("\n") : "  []";
const shouldCommit = Boolean(flag("commit", false));
const content = `schema_version: 1
status: ${yamlString(state.status)}
phase: ${yamlString(state.phase)}
planning_profile: ${yamlString(planning.profile?.id || null)}
planning_stage: ${yamlString(planning.stage || null)}
epic: ${yamlString(state.currentEpic)}
story: ${yamlString(state.currentStory)}
branch: ${yamlString(branch)}
checkpoint_commit: ${yamlString(shouldCommit ? "SELF" : commit)}
last_agent: ${yamlString(flag("agent", "unknown"))}
completed:
${yamlList(completed)}
remaining:
${yamlList(remaining)}
known_failure: ${yamlString(state.failure?.signature || null)}
next_action: ${yamlString(flag("next", "Run geki-resume and reconcile Git with this packet."))}
`;
await fs.mkdir(path.dirname(handoffFile), { recursive: true });
await fs.writeFile(handoffFile, content, "utf8");

const changed = new Set([
  ...git("diff", "HEAD", "--name-only", "-z").split("\0").filter(Boolean),
  ...git("ls-files", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean)
]);
const safeBinaryExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".mp4", ".webm"]);
let scanText = "";
for (const relative of changed) {
  const file = path.join(root, relative);
  const stat = await fs.stat(file).catch(() => null);
  if (!stat?.isFile()) continue;
  if (stat.size > 5_000_000 && !safeBinaryExtensions.has(path.extname(file).toLowerCase())) throw new Error(`Cannot safely scan large changed file: ${relative}`);
  const data = await fs.readFile(file);
  if (data.includes(0)) {
    if (!safeBinaryExtensions.has(path.extname(file).toLowerCase())) throw new Error(`Cannot safely scan binary changed file: ${relative}`);
  } else scanText += `\nCHANGED:${relative}\n${data.toString("utf8")}`;
}
if (secretPatterns.some((pattern) => pattern.test(scanText))) throw new Error("Potential secret detected in staged, unstaged, or untracked changes; checkpoint refused.");

if (shouldCommit) {
  git("add", "-A");
  const label = state.currentStory || state.currentEpic || "run";
  git("commit", "-m", `chore(geki): checkpoint ${label} before agent handoff`);
  commit = git("rev-parse", "HEAD");
}
console.log(`Checkpoint written for ${branch}@${commit.slice(0, 8)}`);
