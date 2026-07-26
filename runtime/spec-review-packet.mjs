#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const root = process.cwd();
const realRoot = await fs.realpath(root);
const planningFile = path.join(root, ".geki", "state", "planning.json");
const findingsFile = path.join(root, ".geki", "findings", "registry.json");
const args = process.argv.slice(2);
const command = args[0] === "verify" ? args.shift() : "create";
function flag(name) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return null;
  const next = args[index + 1];
  return next && !next.startsWith("--") ? next : null;
}
async function json(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
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
async function contextSource(file) {
  try {
    const real = await existingInside(file, "Review context");
    const data = await fs.readFile(real);
    return {
      path: path.relative(realRoot, real).split(path.sep).join("/"),
      sha256: createHash("sha256").update(data).digest("hex"),
      bytes: data.length
    };
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
if (command === "verify") {
  const packetArg = args[0];
  if (!packetArg) throw new Error("Usage: spec-review-packet.mjs verify <packet.json>");
  const packetFile = await existingInside(path.resolve(root, packetArg), "Packet");
  const packetRelative = path.relative(realRoot, packetFile);
  if (packetRelative.startsWith("..") || path.isAbsolute(packetRelative)) throw new Error("Packet must be inside the project.");
  const packet = JSON.parse(await fs.readFile(packetFile, "utf8"));
  const claimed = packet.packetHash;
  delete packet.packetHash;
  if (createHash("sha256").update(JSON.stringify(packet)).digest("hex") !== claimed) throw new Error("Spec review packet hash is invalid.");
  const artifactFile = await existingInside(path.resolve(root, packet.artifact.path), "Packet artifact");
  const artifactRelative = path.relative(realRoot, artifactFile);
  if (artifactRelative.startsWith("..") || path.isAbsolute(artifactRelative)) throw new Error("Packet artifact escapes the project.");
  const content = await fs.readFile(artifactFile);
  if (createHash("sha256").update(content).digest("hex") !== packet.artifact.sha256) throw new Error("Spec artifact changed after packet creation.");
  for (const source of Object.values(packet.context?.sources || {}).filter(Boolean)) {
    const sourceFile = await existingInside(path.resolve(root, source.path), "Packet context");
    const sourceContent = await fs.readFile(sourceFile);
    if (createHash("sha256").update(sourceContent).digest("hex") !== source.sha256) throw new Error(`Spec review context changed after packet creation: ${source.path}`);
  }
  console.log(JSON.stringify({ valid: true, packet: packetRelative.split(path.sep).join("/"), artifact: packet.artifact.path }, null, 2));
  process.exit(0);
}
const artifactArg = flag("artifact");
const lens = flag("lens");
const checkpoint = flag("checkpoint") || "artifact-review";
const mode = flag("mode") || "baseline";
const round = Number(flag("round") || 1);
if (!artifactArg || !lens) throw new Error("Usage: spec-review-packet.mjs --artifact <path> --lens <lens> --checkpoint <id> --round <1|2|3> --mode <baseline|delta>");
if (!/^[a-z0-9-]{1,40}$/.test(lens)) throw new Error("Lens must use lowercase letters, numbers, and hyphens only.");
if (!/^[a-z0-9-]{2,64}$/.test(checkpoint)) throw new Error("Checkpoint must use lowercase letters, numbers, and hyphens only.");
if (![1, 2, 3].includes(round)) throw new Error("Review round must be 1, 2, or 3.");
if (!["baseline", "delta"].includes(mode) || (round === 1 && mode !== "baseline") || (round > 1 && mode !== "delta")) throw new Error("Round one uses baseline mode; later rounds use delta mode.");
const artifact = await existingInside(path.resolve(root, artifactArg), "Artifact");
const relative = path.relative(realRoot, artifact).split(path.sep).join("/");
if (relative.startsWith("../") || path.isAbsolute(relative)) throw new Error("Artifact must be inside the project.");
const content = await fs.readFile(artifact);
const sha256 = createHash("sha256").update(content).digest("hex");
const planning = await json(planningFile, {});
const registry = await json(findingsFile, { findings: [] });
const decisionsFile = path.join(root, ".geki", "planning", "decisions.json");
const deliverySliceFile = path.join(root, ".geki", "planning", "delivery-slice.json");
const priorFindings = registry.findings.filter((item) => item.artifact === relative && !["rejected"].includes(item.status));
const openBlocking = priorFindings.filter((item) => item.status === "open" && ["critical", "high"].includes(item.severity));
const maxRounds = Number(planning.policy?.reviewMaxRounds || 2);
const previousCheckpoint = planning.reviewCheckpoints?.[checkpoint];
if (round === 1 && previousCheckpoint) throw new Error("This checkpoint already has a baseline review; use delta mode or a new checkpoint ID.");
if (round > 1 && Number(previousCheckpoint?.round || 0) !== round - 1) throw new Error(`Round ${round} requires recorded round ${round - 1} for this checkpoint.`);
if (round > maxRounds && !openBlocking.length) throw new Error("Round three requires an existing open critical/high finding for this artifact.");
const packet = {
  schemaVersion: 1,
  kind: "spec-review",
  createdAt: new Date().toISOString(),
  lens,
  checkpoint,
  round,
  mode,
  maxRounds,
  cleanContextRequired: true,
  artifact: { path: relative, sha256, bytes: content.length },
  context: {
    profile: planning.profile || null,
    policy: planning.policy || null,
    stage: planning.stage || null,
    sources: {
      planning: await contextSource(planningFile),
      decisions: await contextSource(decisionsFile),
      deliverySlice: await contextSource(deliverySliceFile)
    }
  },
  priorFindings: mode === "delta" ? priorFindings.map((item) => ({
    id: item.id,
    severity: item.severity,
    status: item.status,
    requirement: item.requirement,
    evidence: item.evidence,
    recommendation: item.recommendation
  })) : [],
  instructions: mode === "baseline" ? [
    "Read the artifact without the author's chain of thought or desired conclusion.",
    "Honor the confirmed delivery profile and current-delivery boundary; do not turn optional future hardening into current scope.",
    "Return only concrete omissions, contradictions, feasibility risks, and edge cases within the selected lens.",
    "For every finding include severity critical/high/medium/low, requirement, evidence, risk, recommendation, and whether a user decision is required."
  ] : [
    "Verify prior finding IDs against the changed artifact.",
    "Check only changed surfaces and direct regressions; do not introduce a new rubric or expand scope.",
    "Return each prior finding as closed, still-open, deferred, or rejected, plus any direct regression with evidence."
  ]
};
const packetHash = createHash("sha256").update(JSON.stringify(packet)).digest("hex");
packet.packetHash = packetHash;
const output = path.join(root, ".geki", "review", "spec", `${path.basename(artifact).replace(/[^a-z0-9_.-]/gi, "-")}-${lens}.json`);
const outputRelative = path.relative(root, output);
if (outputRelative.startsWith("..") || path.isAbsolute(outputRelative)) throw new Error("Review packet output escapes the project.");
await prepareOutputDirectory(path.dirname(output));
await fs.writeFile(output, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
console.log(path.relative(root, output));
