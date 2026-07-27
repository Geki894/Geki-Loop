#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { controlPath, resolveProjectContext } from "./project-context.mjs";

const context = resolveProjectContext();
const root = context.controlRoot;
const realRoot = await fs.realpath(root);
const storyDirectory = controlPath(context, "spec", "stories");
const epicDirectory = controlPath(context, "spec", "epics");
const sliceFile = controlPath(context, "planning", "delivery-slice.json");
const planningFile = controlPath(context, "state", "planning.json");
const errors = [];
const warnings = [];
const args = process.argv.slice(2);

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
async function files(directory, extension) {
  try {
    return (await fs.readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && extension.test(entry.name))
      .map((entry) => path.join(directory, entry.name))
      .sort();
  } catch (error) { if (error.code === "ENOENT") return []; throw error; }
}
function hasKey(content, key) {
  return new RegExp(`^${key}:`, "m").test(content);
}
function scalar(content, key, fallback = "") {
  const match = content.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  if (!match) return fallback;
  return match[1].trim().replace(/^['"]|['"]$/g, "");
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
function safeId(id) {
  return /^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/.test(id);
}
function duplicates(values) {
  const seen = new Set();
  return [...new Set(values.filter((value) => seen.has(value) || !seen.add(value)))];
}
async function sourceProblem(entry) {
  const separator = entry.lastIndexOf("#");
  if (separator < 1) return "must use path#sha256";
  const relative = entry.slice(0, separator);
  const claimed = entry.slice(separator + 1);
  if (!/^[a-f0-9]{64}$/.test(claimed)) return "has an invalid sha256";
  try {
    const file = await fs.realpath(path.resolve(root, relative));
    const inside = path.relative(realRoot, file);
    if (inside.startsWith("..") || path.isAbsolute(inside)) return "escapes the project";
    const actual = createHash("sha256").update(await fs.readFile(file)).digest("hex");
    if (actual !== claimed) return "is stale";
  } catch { return "is missing"; }
  return null;
}

const slice = await readJson(sliceFile, null);
const planning = await readJson(planningFile, null);
const requestedInput = flag("stories", null);
if (requestedInput === true) throw new Error("--stories requires comma-separated Story IDs.");
const requestedIds = requestedInput
  ? new Set(String(requestedInput).split(",").map((item) => item.trim()).filter(Boolean))
  : slice?.storyIds?.length
    ? new Set(slice.storyIds.map(String))
    : null;
const stories = new Map();
for (const file of await files(storyDirectory, /\.ya?ml$/i)) {
  const content = await fs.readFile(file, "utf8");
  const id = scalar(content, "id");
  const relative = path.relative(root, file).split(path.sep).join("/");
  if (!safeId(id)) { errors.push(`${relative}: invalid or missing Story id`); continue; }
  if (requestedIds && !requestedIds.has(id)) continue;
  if (stories.has(id)) { errors.push(`${relative}: duplicate Story id ${id}`); continue; }
  const story = {
    id,
    file: relative,
    content,
    epicId: scalar(content, "epicId"),
    status: scalar(content, "status", "draft"),
    goal: scalar(content, "goal"),
    dependencies: list(content, "dependencies"),
    requirementIds: list(content, "requirementIds"),
    acceptanceCriteria: list(content, "acceptanceCriteria"),
    outOfScope: list(content, "outOfScope"),
    architectureConstraints: list(content, "architectureConstraints"),
    affectedSurfaces: list(content, "affectedSurfaces"),
    ownedPaths: list(content, "ownedPaths"),
    ownedSchemas: list(content, "ownedSchemas"),
    parallelSafe: bool(content, "parallelSafe"),
    dataChanges: list(content, "dataChanges"),
    migrationRequired: bool(content, "migrationRequired"),
    migrationPredecessor: scalar(content, "migrationPredecessor"),
    evidenceRequirements: list(content, "evidenceRequirements"),
    testObligations: list(content, "testObligations"),
    producesGates: list(content, "producesGates"),
    openQuestions: list(content, "openQuestions"),
    sourceArtifacts: list(content, "sourceArtifacts")
  };
  stories.set(id, story);
  if (path.basename(file).replace(/\.ya?ml$/i, "") !== id) errors.push(`${relative}: filename must match Story id ${id}`);
  for (const key of ["goal", "dependencies", "requirementIds", "acceptanceCriteria", "outOfScope", "architectureConstraints", "affectedSurfaces", "ownedPaths", "ownedSchemas", "parallelSafe", "evidenceRequirements", "testObligations", "producesGates", "sourceArtifacts"]) {
    if (!hasKey(content, key)) errors.push(`${relative}: missing required key ${key}`);
  }
  for (const value of [...story.dependencies, ...story.requirementIds, ...story.ownedPaths, ...story.ownedSchemas]) {
    if (value.includes("*")) errors.push(`${relative}: wildcard is forbidden in dependency/ownership fields (${value})`);
  }
  for (const duplicate of duplicates(story.dependencies)) errors.push(`${relative}: duplicate dependency ${duplicate}`);
  for (const gate of story.producesGates.filter((item) => story.testObligations.includes(item))) errors.push(`${relative}: gate producer cannot require its own gate ${gate}`);
  if (story.migrationRequired && !story.testObligations.includes("database-migration")) errors.push(`${relative}: migrationRequired needs database-migration test obligation`);
  if (story.migrationRequired && (!story.migrationPredecessor || !story.dependencies.includes(story.migrationPredecessor))) errors.push(`${relative}: migrationRequired needs migrationPredecessor listed in dependencies`);
  if (story.dataChanges.length && !story.migrationRequired) warnings.push(`${relative}: dataChanges exist while migrationRequired is false`);
  if (story.status === "approved") {
    if (!story.goal) errors.push(`${relative}: approved Story needs goal`);
    if (!story.epicId) errors.push(`${relative}: approved Story needs epicId`);
    if (!story.acceptanceCriteria.length) errors.push(`${relative}: approved Story needs acceptanceCriteria`);
    if (!story.outOfScope.length) errors.push(`${relative}: approved Story needs an explicit outOfScope boundary`);
    if (!story.affectedSurfaces.length) errors.push(`${relative}: approved Story needs affectedSurfaces`);
    if (!story.testObligations.length) errors.push(`${relative}: approved Story needs testObligations`);
    if (!story.evidenceRequirements.length) errors.push(`${relative}: approved Story needs evidenceRequirements`);
    if (story.openQuestions.length) errors.push(`${relative}: approved Story has openQuestions`);
    if (!story.sourceArtifacts.length) errors.push(`${relative}: approved Story needs sourceArtifacts`);
  }
  for (const source of story.sourceArtifacts) {
    const problem = await sourceProblem(source);
    if (problem) errors.push(`${relative}: source artifact '${source}' ${problem}`);
  }
}

for (const story of stories.values()) {
  for (const dependency of story.dependencies) if (!stories.has(dependency)) errors.push(`${story.file}: unknown dependency ${dependency}`);
}
for (const id of requestedIds || []) if (!stories.has(id)) errors.push(`Selected delivery references missing Story Contract ${id}`);

const visiting = new Set();
const visited = new Set();
function visit(id, trail = []) {
  if (visiting.has(id)) {
    errors.push(`Story dependency cycle: ${[...trail, id].join(" -> ")}`);
    return;
  }
  if (visited.has(id)) return;
  visiting.add(id);
  for (const dependency of stories.get(id)?.dependencies || []) if (stories.has(dependency)) visit(dependency, [...trail, id]);
  visiting.delete(id);
  visited.add(id);
}
for (const id of stories.keys()) visit(id);

const requirementOwner = new Map();
for (const story of stories.values()) {
  for (const requirement of story.requirementIds) {
    const owner = requirementOwner.get(requirement);
    if (owner && owner !== story.id) errors.push(`Requirement ${requirement} has multiple owners: ${owner}, ${story.id}`);
    else requirementOwner.set(requirement, story.id);
  }
}

for (const field of ["ownedPaths", "ownedSchemas"]) {
  const ownership = new Map();
  for (const story of stories.values()) {
    for (const surface of story[field]) {
      const owners = ownership.get(surface) || [];
      for (const owner of owners) {
        const other = stories.get(owner);
        const message = `${field} collision '${surface}' between ${owner} and ${story.id}`;
        if (other?.parallelSafe && story.parallelSafe) errors.push(`${message} while both Stories claim parallelSafe`);
        else warnings.push(message);
      }
      owners.push(story.id);
      ownership.set(surface, owners);
    }
  }
}

const storyToEpic = new Map();
for (const file of await files(epicDirectory, /^(?!.*\.sha256\.json$).*\.json$/i)) {
  const relative = path.relative(root, file).split(path.sep).join("/");
  let epic;
  try { epic = JSON.parse(await fs.readFile(file, "utf8")); }
  catch { errors.push(`${relative}: invalid JSON`); continue; }
  const id = String(epic.id || "");
  if (!safeId(id)) { errors.push(`${relative}: invalid or missing Epic id`); continue; }
  if (path.basename(file, ".json") !== id) errors.push(`${relative}: filename must match Epic id ${id}`);
  if (epic.status === "approved" && (!Array.isArray(epic.stories) || !epic.stories.length)) errors.push(`${relative}: approved Epic needs Stories`);
  for (const storyValue of epic.stories || []) {
    const story = String(storyValue);
    if (requestedIds && !requestedIds.has(story)) continue;
    if (!stories.has(story)) errors.push(`${relative}: unknown Story ${story}`);
    const owner = storyToEpic.get(story);
    if (owner && owner !== id) errors.push(`Story ${story} belongs to multiple Epics: ${owner}, ${id}`);
    else storyToEpic.set(story, id);
    if (stories.get(story)?.epicId && stories.get(story).epicId !== id) errors.push(`${stories.get(story).file}: epicId disagrees with Epic ${id}`);
  }
}

if (slice) {
  for (const id of slice.storyIds || []) {
    const story = stories.get(String(id));
    if (!story) errors.push(`Delivery slice references unknown Story ${id}`);
    else if (story.status !== "approved") errors.push(`Delivery slice Story ${id} is not approved`);
  }
  const recommended = planning?.policy?.recommendedCurrentStories;
  if (recommended && (slice.storyIds || []).length > recommended) warnings.push(`Current delivery has ${slice.storyIds.length} Stories; profile recommends at most ${recommended} before explicit scope confirmation`);
}

const report = {
  schemaVersion: 1,
  kind: "spec-validation",
  outcome: errors.length ? "failed" : warnings.length ? "concerns" : "passed",
  checkedAt: new Date().toISOString(),
  counts: { stories: stories.size, errors: errors.length, warnings: warnings.length },
  errors,
  warnings
};
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;
