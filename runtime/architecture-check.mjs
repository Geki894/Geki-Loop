#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { controlPath, resolveProjectContext } from "./project-context.mjs";

const context = resolveProjectContext();
const architectureFile = controlPath(context, "architecture.json");
const lockFile = controlPath(context, "lock.json");
const errors = [];
const warnings = [];
const architecture = JSON.parse(await fs.readFile(architectureFile, "utf8"));
const lock = JSON.parse(await fs.readFile(lockFile, "utf8"));
const candidates = [
  controlPath(context, "distribution", "src", "architecture.mjs"),
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "architecture.mjs")
];
let architectureModule = null;
for (const candidate of candidates) {
  try { await fs.access(candidate); architectureModule = await import(pathToFileURL(candidate)); break; }
  catch {}
}
if (!architectureModule) throw new Error("Architecture validator is unavailable.");
const checkValue = architecture.status === "approved" ? architecture : { ...architecture, status: "approved" };
let requiredModules = [];
try {
  architectureModule.validateArchitecture(checkValue);
  requiredModules = architectureModule.modulesForArchitecture(checkValue);
} catch (error) { errors.push(error.message); }
const installed = new Set(Object.keys(lock.modules || {}));
const missingModules = requiredModules.filter((id) => !installed.has(id));
if (missingModules.length) errors.push(`Architecture-required modules are not synchronized: ${missingModules.join(", ")}`);
const deployment = architecture.deployment || {};
if (deployment.plan === "free" && (!deployment.constraintsVerifiedAt || !deployment.constraintsSource)) {
  errors.push("Free-tier deployment assumptions require constraintsVerifiedAt and constraintsSource.");
}
if (deployment.constraintsVerifiedAt) {
  const ageDays = (Date.now() - Date.parse(deployment.constraintsVerifiedAt)) / 86_400_000;
  if (!Number.isFinite(ageDays)) errors.push("deployment.constraintsVerifiedAt is invalid.");
  else if (ageDays > 30) warnings.push("Deployment constraints were verified more than 30 days ago.");
}
const packageFile = path.join(context.workspaceRoot, "package.json");
try {
  await fs.access(packageFile);
  const npmLs = spawnSync("npm", ["ls", "--all", "--json"], { cwd: context.workspaceRoot, encoding: "utf8", timeout: 60_000 });
  if (npmLs.status !== 0) {
    let details = npmLs.stderr.trim();
    try {
      const payload = JSON.parse(npmLs.stdout || "{}");
      details = payload.problems?.join("; ") || details;
    } catch {}
    errors.push(`Node dependency/peer compatibility failed: ${details || "npm ls failed"}`);
  }
} catch {}
const report = {
  schemaVersion: 1,
  kind: "architecture-provisioning-check",
  checkedAt: new Date().toISOString(),
  outcome: errors.length ? "failed" : warnings.length ? "concerns" : "passed",
  requiredModules,
  installedModules: [...installed],
  missingModules,
  errors,
  warnings
};
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;
