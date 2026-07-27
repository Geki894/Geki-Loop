#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { controlPath, relativeControl, resolveProjectContext } from "./project-context.mjs";

const context = resolveProjectContext();
const args = process.argv.slice(2);
const storiesIndex = args.indexOf("--stories");
const stories = storiesIndex >= 0 ? String(args[storiesIndex + 1] || "").split(",").map((item) => item.trim()).filter(Boolean) : [];
const execution = args.includes("--execution");
if (!stories.length) throw new Error("Usage: contract-compiler.mjs --stories <ids> [--execution]");
const runtimeDirectory = path.dirname(fileURLToPath(import.meta.url));
const validation = spawnSync(process.execPath, [path.join(runtimeDirectory, "spec-validator.mjs"), "--stories", stories.join(",")], {
  cwd: context.workspaceRoot,
  encoding: "utf8"
});
const errors = [];
if (validation.status !== 0) {
  try { errors.push(...JSON.parse(validation.stdout).errors); }
  catch { errors.push(validation.stderr.trim() || "Static specification validation failed."); }
}

function scalar(content, key, fallback = "") {
  const match = content.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  return match ? match[1].trim().replace(/^['"]|['"]$/g, "") : fallback;
}
function list(content, key) {
  const inline = content.match(new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]`, "m"));
  if (inline) return inline[1].split(",").map((item) => item.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
  const block = content.match(new RegExp(`^${key}:\\s*\\r?\\n((?:\\s+-\\s+.*(?:\\r?\\n|$))*)`, "m"));
  return block ? [...block[1].matchAll(/^\s+-\s+(.+)$/gm)].map((match) => match[1].trim().replace(/^['"]|['"]$/g, "")).filter(Boolean) : [];
}
function bool(content, key) {
  return scalar(content, key, "false").toLowerCase() === "true";
}

const compiled = [];
const inputHash = createHash("sha256");
for (const id of stories) {
  const file = controlPath(context, "spec", "stories", `${id}.yaml`);
  let content;
  try { content = await fs.readFile(file, "utf8"); }
  catch { errors.push(`Story ${id}: contract is missing`); continue; }
  inputHash.update(id).update("\0").update(content).update("\0");
  const contract = {
    id: scalar(content, "id"),
    epicId: scalar(content, "epicId"),
    status: scalar(content, "status", "draft"),
    dependencies: list(content, "dependencies"),
    acceptanceCriteria: list(content, "acceptanceCriteria"),
    ownedPaths: list(content, "ownedPaths"),
    ownedSchemas: list(content, "ownedSchemas"),
    evidenceRequirements: list(content, "evidenceRequirements"),
    testObligations: list(content, "testObligations"),
    openQuestions: list(content, "openQuestions"),
    migrationRequired: bool(content, "migrationRequired"),
    migrationPredecessor: scalar(content, "migrationPredecessor")
  };
  if (contract.id !== id) errors.push(`Story ${id}: id does not match filename`);
  if (!contract.epicId) errors.push(`Story ${id}: epicId is required`);
  if (!contract.ownedPaths.length && !contract.ownedSchemas.length) errors.push(`Story ${id}: at least one ownedPaths or ownedSchemas entry is required`);
  const acceptanceText = contract.acceptanceCriteria.join(" ");
  for (const keyword of ["Given", "When", "Then"]) if (!new RegExp(`\\b${keyword}\\b`, "i").test(acceptanceText)) errors.push(`Story ${id}: acceptance criteria must contain ${keyword}`);
  if (!contract.evidenceRequirements.length) errors.push(`Story ${id}: evidenceRequirements is required`);
  if (!contract.testObligations.length) errors.push(`Story ${id}: testObligations is required`);
  if (contract.openQuestions.length) errors.push(`Story ${id}: openQuestions must be empty before compilation`);
  if (contract.migrationRequired) {
    if (!contract.migrationPredecessor) errors.push(`Story ${id}: migrationPredecessor is required when migrationRequired is true`);
    else if (!contract.dependencies.includes(contract.migrationPredecessor)) errors.push(`Story ${id}: migrationPredecessor must be listed in dependencies`);
  }
  if (execution) {
    if (contract.status !== "approved") errors.push(`Story ${id}: execution compilation requires approved status`);
    const sidecar = `${file}.sha256.json`;
    try {
      const approvalData = await fs.readFile(sidecar);
      inputHash.update(approvalData);
      const approval = JSON.parse(approvalData.toString("utf8"));
      const relative = relativeControl(context, file);
      const sha256 = createHash("sha256").update(content).digest("hex");
      if (approval.contract !== relative || approval.sha256 !== sha256) errors.push(`Story ${id}: approval sidecar is stale`);
    } catch { errors.push(`Story ${id}: approval sidecar is missing`); }
  }
  compiled.push(contract);
}

const architecture = await fs.readFile(controlPath(context, "architecture.json")).catch(() => Buffer.from(""));
inputHash.update(architecture);
const report = {
  schemaVersion: 1,
  kind: "contract-compilation",
  mode: execution ? "execution" : "review",
  createdAt: new Date().toISOString(),
  scope: { stories },
  inputHash: inputHash.digest("hex"),
  outcome: errors.length ? "failed" : "passed",
  errors,
  compiled: compiled.map((story) => ({ id: story.id, epicId: story.epicId, dependencies: story.dependencies }))
};
const directory = controlPath(context, "evidence", "contracts");
await fs.mkdir(directory, { recursive: true });
const output = path.join(directory, `${report.inputHash}.json`);
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (errors.length) {
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} else console.log(relativeControl(context, output));
