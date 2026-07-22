import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { copyFile, exists, hashFile, readJson, relativeUnix, removeEmptyParents, walkFiles, writeJson } from "./files.mjs";
import { loadCatalog, resolveModules } from "./catalog.mjs";
import { packageRoot, projectPaths, runtimeRoot, templatesRoot } from "./paths.mjs";

const VERSION = "0.1.0";
const AGENTS_START = "<!-- geki:start -->";
const AGENTS_END = "<!-- geki:end -->";
const AGENTS_BLOCK = `${AGENTS_START}\n## Geki Loop\n\nUse project-local skills under \`.agents/skills\`. Start with \`geki-help\` whenever phase or next action is unclear. Treat \`.geki/state/current-run.json\`, \`.geki/architecture.json\`, approved Story Contracts, and Git evidence as authoritative. Never begin autonomous coding without an explicit \`geki-run\` scope.\n${AGENTS_END}`;

async function createSnapshot(paths, candidates) {
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const directory = path.join(paths.backups, id);
  const snapshot = { schemaVersion: 1, id, createdAt: new Date().toISOString(), files: [], created: [] };
  await fs.mkdir(directory, { recursive: true });
  for (const relative of [...new Set(candidates)].sort()) {
    const target = path.join(paths.root, relative);
    if (await exists(target)) {
      const backup = path.join(directory, "files", relative);
      await copyFile(target, backup);
      snapshot.files.push({ path: relative, backup: relativeUnix(directory, backup), beforeHash: await hashFile(target) });
    } else snapshot.created.push(relative);
  }
  await writeJson(path.join(directory, "snapshot.json"), snapshot);
  return { directory, snapshot };
}

async function collectModuleFiles(catalog, moduleIds) {
  const plan = [];
  for (const id of moduleIds) {
    const module = catalog.modules.get(id);
    const skillsRoot = path.join(module.root, "skills");
    for (const source of await walkFiles(skillsRoot)) {
      const relative = path.relative(skillsRoot, source);
      plan.push({ source, destination: path.join(".agents", "skills", relative), module: id, kind: "skill" });
    }
  }
  return plan;
}

async function collectRuntimeFiles() {
  return (await walkFiles(runtimeRoot)).map((source) => ({ source, destination: path.join(".geki", "runtime", path.relative(runtimeRoot, source)), module: "core", kind: "runtime" }));
}

async function collectDistributionFiles() {
  const roots = ["bin", "src", "modules", "presets", "templates", "runtime"];
  const plan = [];
  for (const relativeRoot of roots) {
    const sourceRoot = path.join(packageRoot, relativeRoot);
    for (const source of await walkFiles(sourceRoot)) {
      plan.push({ source, destination: path.join(".geki", "distribution", relativeRoot, path.relative(sourceRoot, source)), module: "core", kind: "distribution" });
    }
  }
  for (const file of ["package.json", "LICENSE", "THIRD_PARTY_NOTICES.md", "third-party-lock.json"]) {
    plan.push({ source: path.join(packageRoot, file), destination: path.join(".geki", "distribution", file), module: "core", kind: "distribution" });
  }
  return plan;
}

async function staticPlan(moduleIds, tools) {
  const plan = [
    { source: path.join(templatesRoot, "project", "gates.json"), destination: path.join(".geki", "gates.json"), module: "core", kind: "config", createOnly: true }
  ];
  if (tools.includes("antigravity")) {
    plan.push(
      { source: path.join(templatesRoot, "adapters", "antigravity-rule.md"), destination: path.join(".agents", "rules", "geki.md"), module: "core", kind: "adapter" },
      { source: path.join(templatesRoot, "adapters", "geki-help-workflow.md"), destination: path.join(".agents", "workflows", "geki-help.md"), module: "core", kind: "adapter" },
      { source: path.join(templatesRoot, "adapters", "geki-run-workflow.md"), destination: path.join(".agents", "workflows", "geki-run.md"), module: "execution-loop", kind: "adapter", whenModule: "execution-loop" },
      { source: path.join(templatesRoot, "adapters", "geki-resume-workflow.md"), destination: path.join(".agents", "workflows", "geki-resume.md"), module: "execution-loop", kind: "adapter", whenModule: "execution-loop" }
    );
  }
  if (moduleIds.includes("github-ci")) plan.push({ source: path.join(templatesRoot, "github", "geki-quality.yml"), destination: path.join(".github", "workflows", "geki-quality.yml"), module: "github-ci", kind: "workflow" });
  return plan.filter((entry) => !entry.whenModule || moduleIds.includes(entry.whenModule));
}

async function initializeProjectFiles(paths, tools, moduleIds) {
  if (!(await exists(paths.config))) {
    const config = await readJson(path.join(templatesRoot, "project", "config.json"));
    config.tools = tools;
    config.modules = moduleIds;
    await writeJson(paths.config, config);
  } else {
    const config = await readJson(paths.config);
    config.gekiVersion = VERSION;
    config.tools = tools;
    config.modules = moduleIds;
    await writeJson(paths.config, config);
  }
  if (!(await exists(paths.architecture))) await copyFile(path.join(templatesRoot, "project", "architecture.json"), paths.architecture);
  if (!(await exists(paths.state))) {
    const state = await readJson(path.join(templatesRoot, "project", "current-run.json"));
    state.updatedAt = new Date().toISOString();
    await writeJson(paths.state, state);
  }
  if (!(await exists(paths.events))) {
    await fs.mkdir(path.dirname(paths.events), { recursive: true });
    await fs.writeFile(paths.events, `${JSON.stringify({ id: randomUUID(), type: "GEKI_INSTALLED", at: new Date().toISOString(), version: VERSION })}\n`, "utf8");
  }
  if (!(await exists(paths.handoff))) await copyFile(path.join(templatesRoot, "project", "current-handoff.yaml"), paths.handoff);
}

async function updateAgentsFile(paths) {
  const file = path.join(paths.root, "AGENTS.md");
  let content = await exists(file) ? await fs.readFile(file, "utf8") : "";
  const pattern = new RegExp(`${AGENTS_START}[\\s\\S]*?${AGENTS_END}`, "m");
  content = pattern.test(content) ? content.replace(pattern, AGENTS_BLOCK) : `${content.trimEnd()}${content.trim() ? "\n\n" : ""}${AGENTS_BLOCK}\n`;
  await fs.writeFile(file, content, "utf8");
}

export async function installProject({ target, requestedModules, tools, force = false, removeUnselected = false }) {
  const paths = projectPaths(target);
  await fs.mkdir(paths.root, { recursive: true });
  const catalog = await loadCatalog();
  const moduleIds = resolveModules(catalog, requestedModules);
  const existingManifest = await readJson(paths.manifest, { files: [], modules: [] });
  const modulePlan = await collectModuleFiles(catalog, moduleIds);
  const plan = [...modulePlan, ...await collectRuntimeFiles(), ...await collectDistributionFiles(), ...await staticPlan(moduleIds, tools)];
  const plannedPaths = plan.map((entry) => relativeUnix(paths.root, path.join(paths.root, entry.destination)));
  const foundational = ["AGENTS.md", ".geki/config.json", ".geki/lock.json", ".geki/manifest.json", ".geki/architecture.json", ".geki/state/current-run.json", ".geki/state/events.jsonl", ".geki/handoff/current.yaml"];
  const removalEntries = removeUnselected ? existingManifest.files.filter((entry) => entry.module && !moduleIds.includes(entry.module) && entry.kind !== "shared") : [];
  for (const entry of plan) {
    const destination = path.join(paths.root, entry.destination);
    if (!(await exists(destination)) || entry.createOnly) continue;
    const relative = relativeUnix(paths.root, destination);
    const previous = existingManifest.files.find((file) => file.path === relative);
    if (previous && await hashFile(destination) !== previous.hash && !force) {
      throw new Error(`Refusing to overwrite user-modified Geki file: ${previous.path}. Re-run with --force after reviewing it.`);
    }
  }
  const snapshot = await createSnapshot(paths, [...plannedPaths, ...foundational, ...removalEntries.map((entry) => entry.path)]);
  const nextFiles = [];
  for (const entry of plan) {
    const destination = path.join(paths.root, entry.destination);
    if (entry.createOnly && await exists(destination)) {
      const previous = existingManifest.files.find((file) => file.path === relativeUnix(paths.root, destination));
      if (previous) nextFiles.push(previous);
      continue;
    }
    await copyFile(entry.source, destination);
    nextFiles.push({ path: relativeUnix(paths.root, destination), hash: await hashFile(destination), module: entry.module, kind: entry.kind });
  }
  for (const entry of removalEntries) {
    const file = path.join(paths.root, entry.path);
    if (!(await exists(file))) continue;
    if (await hashFile(file) === entry.hash) {
      await fs.rm(file);
      await removeEmptyParents(file, paths.root);
    } else nextFiles.push(entry);
  }
  await initializeProjectFiles(paths, tools, moduleIds);
  await updateAgentsFile(paths);
  const agentsHash = await hashFile(path.join(paths.root, "AGENTS.md"));
  nextFiles.push({ path: "AGENTS.md", hash: agentsHash, module: "core", kind: "shared" });
  const configHash = await hashFile(paths.config);
  nextFiles.push({ path: ".geki/config.json", hash: configHash, module: "core", kind: "config" });
  for (const [file, kind] of [[paths.architecture, "architecture"], [paths.state, "state"], [paths.events, "events"], [paths.handoff, "handoff"]]) {
    nextFiles.push({ path: relativeUnix(paths.root, file), hash: await hashFile(file), module: "core", kind });
  }
  const modules = Object.fromEntries(moduleIds.map((id) => [id, { version: catalog.modules.get(id).version }]));
  const lock = { schemaVersion: 1, gekiVersion: VERSION, installedAt: new Date().toISOString(), tools, modules };
  await writeJson(paths.lock, lock);
  nextFiles.push({ path: ".geki/lock.json", hash: await hashFile(paths.lock), module: "core", kind: "lock" });
  const deduped = [...new Map(nextFiles.map((entry) => [entry.path, entry])).values()].sort((a, b) => a.path.localeCompare(b.path));
  const manifest = { schemaVersion: 1, gekiVersion: VERSION, installId: randomUUID(), updatedAt: new Date().toISOString(), modules: moduleIds, files: deduped, lastSnapshot: relativeUnix(paths.root, path.join(snapshot.directory, "snapshot.json")) };
  await writeJson(paths.manifest, manifest);
  return { paths, moduleIds, files: deduped.length, snapshot: snapshot.snapshot.id };
}

export async function rollbackProject(target, force = false) {
  const paths = projectPaths(target);
  if (!(await exists(paths.backups))) throw new Error("No Geki backups exist.");
  const entries = (await fs.readdir(paths.backups, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse();
  if (!entries.length) throw new Error("No Geki backup snapshots exist.");
  const directory = path.join(paths.backups, entries[0]);
  const snapshot = await readJson(path.join(directory, "snapshot.json"));
  const manifest = await readJson(paths.manifest, { files: [] });
  const currentHashes = new Map(manifest.files.map((entry) => [entry.path, entry.hash]));
  const skipped = [];
  for (const relative of snapshot.created) {
    const targetFile = path.join(paths.root, relative);
    if (!(await exists(targetFile))) continue;
    const expected = currentHashes.get(relative);
    if (!force && expected && await hashFile(targetFile) !== expected) { skipped.push(relative); continue; }
    await fs.rm(targetFile, { force: true });
  }
  for (const entry of snapshot.files) {
    const targetFile = path.join(paths.root, entry.path);
    const expected = currentHashes.get(entry.path);
    if (!force && await exists(targetFile) && expected && await hashFile(targetFile) !== expected) { skipped.push(entry.path); continue; }
    await copyFile(path.join(directory, entry.backup), targetFile);
  }
  if (skipped.length) throw new Error(`Rollback preserved modified files: ${skipped.join(", ")}`);
  return { snapshot: snapshot.id };
}

export async function uninstallProject(target, force = false) {
  const paths = projectPaths(target);
  const manifest = await readJson(paths.manifest, null);
  if (!manifest) throw new Error("Geki is not installed in this project.");
  const preserved = [];
  for (const entry of [...manifest.files].sort((a, b) => b.path.length - a.path.length)) {
    if (entry.kind === "shared" || entry.path === "AGENTS.md") continue;
    const file = path.join(paths.root, entry.path);
    if (!(await exists(file))) continue;
    if (!force && await hashFile(file) !== entry.hash) { preserved.push(entry.path); continue; }
    await fs.rm(file, { force: true });
    await removeEmptyParents(file, paths.root);
  }
  const agentsFile = path.join(paths.root, "AGENTS.md");
  if (await exists(agentsFile)) {
    let content = await fs.readFile(agentsFile, "utf8");
    content = content.replace(new RegExp(`\\n?${AGENTS_START}[\\s\\S]*?${AGENTS_END}\\n?`, "m"), "\n").trim();
    if (content) await fs.writeFile(agentsFile, `${content}\n`, "utf8"); else await fs.rm(agentsFile);
  }
  if (!preserved.length || force) {
    await fs.rm(paths.manifest, { force: true });
    await fs.rm(paths.lock, { force: true });
  }
  return { preserved };
}
