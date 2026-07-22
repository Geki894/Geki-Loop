#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const root = process.cwd();
const realRoot = await fs.realpath(root);
const args = process.argv.slice(2);
const command = args[0] === "verify" ? args.shift() : "create";
function flag(name) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return null;
  const next = args[index + 1];
  return next && !next.startsWith("--") ? next : null;
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
if (command === "verify") {
  const packetArg = args[0];
  if (!packetArg) throw new Error("Usage: spec-review-packet.mjs verify <packet.json>");
  const packetFile = await existingInside(path.resolve(root, packetArg), "Packet");
  const packetRelative = path.relative(root, packetFile);
  if (packetRelative.startsWith("..") || path.isAbsolute(packetRelative)) throw new Error("Packet must be inside the project.");
  const packet = JSON.parse(await fs.readFile(packetFile, "utf8"));
  const claimed = packet.packetHash;
  delete packet.packetHash;
  if (createHash("sha256").update(JSON.stringify(packet)).digest("hex") !== claimed) throw new Error("Spec review packet hash is invalid.");
  const artifactFile = await existingInside(path.resolve(root, packet.artifact.path), "Packet artifact");
  const artifactRelative = path.relative(root, artifactFile);
  if (artifactRelative.startsWith("..") || path.isAbsolute(artifactRelative)) throw new Error("Packet artifact escapes the project.");
  const content = await fs.readFile(artifactFile);
  if (createHash("sha256").update(content).digest("hex") !== packet.artifact.sha256) throw new Error("Spec artifact changed after packet creation.");
  console.log(JSON.stringify({ valid: true, packet: packetRelative.split(path.sep).join("/"), artifact: packet.artifact.path }, null, 2));
  process.exit(0);
}
const artifactArg = flag("artifact");
const lens = flag("lens");
if (!artifactArg || !lens) throw new Error("Usage: spec-review-packet.mjs --artifact <path> --lens <lens>");
if (!/^[a-z0-9-]{1,40}$/.test(lens)) throw new Error("Lens must use lowercase letters, numbers, and hyphens only.");
const artifact = await existingInside(path.resolve(root, artifactArg), "Artifact");
const relative = path.relative(root, artifact).split(path.sep).join("/");
if (relative.startsWith("../") || path.isAbsolute(relative)) throw new Error("Artifact must be inside the project.");
const content = await fs.readFile(artifact);
const sha256 = createHash("sha256").update(content).digest("hex");
const packet = {
  schemaVersion: 1,
  kind: "spec-review",
  createdAt: new Date().toISOString(),
  lens,
  cleanContextRequired: true,
  artifact: { path: relative, sha256, bytes: content.length },
  instructions: [
    "Read the artifact without the author's chain of thought or desired conclusion.",
    "Return only concrete omissions, contradictions, feasibility risks, and edge cases.",
    "For every finding include severity, requirement, evidence, risk, recommendation, and whether a user decision is required."
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
