#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

const root = process.cwd();
const realRoot = await fs.realpath(root);
const registryFile = path.join(root, ".geki", "findings", "registry.json");
const args = process.argv.slice(2);
const command = args.shift() || "list";
const severities = new Set(["critical", "high", "medium", "low"]);
const dispositions = new Set(["closed", "deferred", "rejected"]);

function flag(name, fallback = undefined) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const next = args[index + 1];
  return next && !next.startsWith("--") ? next : true;
}
async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}
async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, file);
}
function normalized(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}
async function artifactMetadata(input) {
  if (!input || input === true) throw new Error("--artifact is required.");
  const file = await fs.realpath(path.resolve(root, input));
  const relative = path.relative(realRoot, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Finding artifact escapes the project.");
  const data = await fs.readFile(file);
  return {
    path: relative.split(path.sep).join("/"),
    sha256: createHash("sha256").update(data).digest("hex")
  };
}

const registry = await readJson(registryFile, { schemaVersion: 1, findings: [] });
if (command === "list") {
  const status = flag("status", null);
  console.log(JSON.stringify(status ? registry.findings.filter((item) => item.status === status) : registry.findings, null, 2));
} else if (command === "record") {
  const artifact = await artifactMetadata(flag("artifact"));
  const lens = String(flag("lens", ""));
  const severity = String(flag("severity", ""));
  const requirement = flag("requirement");
  const evidence = flag("evidence");
  const risk = flag("risk");
  const recommendation = flag("recommendation");
  const reviewRound = Number(flag("round", 1));
  if (!/^[a-z0-9-]{2,40}$/.test(lens)) throw new Error("--lens must use lowercase kebab-case.");
  if (!severities.has(severity)) throw new Error(`--severity must be one of: ${[...severities].join(", ")}`);
  for (const [name, value] of Object.entries({ requirement, evidence, risk, recommendation })) if (!value || value === true) throw new Error(`--${name} is required.`);
  if (![1, 2, 3].includes(reviewRound)) throw new Error("--round must be 1, 2, or 3.");
  const stableKey = flag("key", `${lens}|${normalized(requirement)}|${normalized(risk)}`);
  const fingerprint = createHash("sha256").update(`${artifact.path}|${normalized(stableKey)}`).digest("hex");
  const now = new Date().toISOString();
  let finding = registry.findings.find((item) => item.fingerprint === fingerprint);
  if (finding) {
    if (finding.status === "closed") finding.reopenCount = Number(finding.reopenCount || 0) + 1;
    finding = Object.assign(finding, {
      reviewerLens: lens,
      severity,
      status: "open",
      artifact: artifact.path,
      artifactHash: artifact.sha256,
      requirement: String(requirement),
      evidence: String(evidence),
      risk: String(risk),
      recommendation: String(recommendation),
      needsUserDecision: flag("user-decision", false) === true || flag("user-decision", "false") === "true",
      reviewRound,
      occurrences: Number(finding.occurrences || 1) + 1,
      updatedAt: now,
      closureHash: null
    });
  } else {
    finding = {
      schemaVersion: 1,
      id: `GF-${fingerprint.slice(0, 10).toUpperCase()}`,
      fingerprint,
      reviewerLens: lens,
      severity,
      status: "open",
      artifact: artifact.path,
      artifactHash: artifact.sha256,
      requirement: String(requirement),
      evidence: String(evidence),
      risk: String(risk),
      recommendation: String(recommendation),
      needsUserDecision: flag("user-decision", false) === true || flag("user-decision", "false") === "true",
      reviewRound,
      occurrences: 1,
      reopenCount: 0,
      closureHash: null,
      createdAt: now,
      updatedAt: now
    };
    registry.findings.push(finding);
  }
  await writeJsonAtomic(registryFile, registry);
  console.log(JSON.stringify(finding, null, 2));
} else if (command === "resolve") {
  const id = String(flag("id", ""));
  const status = String(flag("status", ""));
  const resolution = flag("resolution");
  if (!dispositions.has(status)) throw new Error(`--status must be one of: ${[...dispositions].join(", ")}`);
  if (!resolution || resolution === true) throw new Error("--resolution is required.");
  const finding = registry.findings.find((item) => item.id === id);
  if (!finding) throw new Error(`Unknown finding: ${id}`);
  finding.status = status;
  finding.resolution = String(resolution);
  finding.updatedAt = new Date().toISOString();
  finding.closureHash = createHash("sha256").update(`${finding.fingerprint}|${status}|${normalized(resolution)}`).digest("hex");
  await writeJsonAtomic(registryFile, registry);
  console.log(JSON.stringify(finding, null, 2));
} else {
  throw new Error("Usage: findings.mjs list|record|resolve");
}
