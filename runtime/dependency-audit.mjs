#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { controlPath, relativeControl, resolveProjectContext } from "./project-context.mjs";

const context = resolveProjectContext();
const ecosystem = process.argv[2] || "npm";
if (ecosystem !== "npm") throw new Error("Usage: dependency-audit.mjs npm");
const policy = JSON.parse(await fs.readFile(controlPath(context, "toolchain-policy.json"), "utf8"));
const audit = spawnSync("npm", ["audit", "--json"], { cwd: context.workspaceRoot, encoding: "utf8", timeout: 120_000 });
let payload;
try { payload = JSON.parse(audit.stdout || "{}"); }
catch { throw new Error(audit.stderr.trim() || "npm audit returned invalid JSON."); }
const failures = [];
const concerns = [];
for (const [name, vulnerability] of Object.entries(payload.vulnerabilities || {})) {
  const severity = String(vulnerability.severity || "unknown");
  if (!(policy.audit?.failOn || ["high", "critical"]).includes(severity)) continue;
  const item = { name, severity, direct: Boolean(vulnerability.isDirect), fixAvailable: vulnerability.fixAvailable };
  if (vulnerability.fixAvailable === false && policy.audit?.noFixAvailable === "record-risk") concerns.push(item);
  else failures.push(item);
}
const report = {
  schemaVersion: 1,
  kind: "dependency-audit",
  ecosystem,
  createdAt: new Date().toISOString(),
  outcome: failures.length ? "failed" : concerns.length ? "concerns" : "passed",
  failures,
  concerns,
  policy: policy.audit
};
const directory = controlPath(context, "evidence", "security");
await fs.mkdir(directory, { recursive: true });
const output = path.join(directory, `npm-${report.createdAt.replace(/[:.]/g, "-")}.json`);
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`${report.outcome}: ${relativeControl(context, output)}`);
if (failures.length) process.exitCode = 1;
