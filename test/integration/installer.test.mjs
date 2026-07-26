import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { installProject, rollbackProject, uninstallProject } from "../../src/installer.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const bootstrap = ["core", "planning-bmad", "spec-council", "provisioning", "dashboard"];
async function temp(name) { return fs.mkdtemp(path.join(os.tmpdir(), `geki-${name}-`)); }
async function readJson(file) { return JSON.parse(await fs.readFile(file, "utf8")); }

test("project-local install and architecture sync install both harness adapters", async () => {
  const target = await temp("sync");
  await installProject({ target, requestedModules: bootstrap, tools: ["codex", "antigravity"] });
  await fs.access(path.join(target, ".agents", "skills", "geki-help", "SKILL.md"));
  await fs.access(path.join(target, ".agents", "rules", "geki.md"));
  await fs.access(path.join(target, ".agents", "workflows", "geki-help.md"));
  await fs.access(path.join(target, ".geki", "state", "planning.json"));
  await fs.access(path.join(target, ".geki", "planning", "decisions.json"));
  await fs.access(path.join(target, ".geki", "planning", "delivery-slice.json"));
  await fs.access(path.join(target, ".geki", "findings", "registry.json"));
  const architecture = await readJson(path.join(root, "fixtures", "dotnet8-postgres-api", "architecture.approved.json"));
  await fs.writeFile(path.join(target, ".geki", "architecture.json"), `${JSON.stringify(architecture, null, 2)}\n`);
  const sync = spawnSync(process.execPath, [path.join(root, "bin", "geki.js"), "sync", "--target", target, "--yes"], { encoding: "utf8" });
  assert.equal(sync.status, 0, sync.stderr);
  const lock = await readJson(path.join(target, ".geki", "lock.json"));
  for (const id of ["backend-dotnet", "database-postgres", "testing", "github-ci", "render"]) assert.ok(lock.modules[id], `missing ${id}`);
  assert.ok(!lock.modules["database-sqlserver"]);
  await fs.access(path.join(target, ".github", "workflows", "geki-quality.yml"));
});

test("update preflight refuses a user-modified managed skill before copying", async () => {
  const target = await temp("preserve");
  await installProject({ target, requestedModules: bootstrap, tools: ["codex"] });
  const modified = path.join(target, ".agents", "skills", "geki-help", "SKILL.md");
  const sentinel = path.join(target, ".geki", "runtime", "runtime-version.json");
  const before = await fs.readFile(sentinel, "utf8");
  await fs.appendFile(modified, "\nuser modification\n");
  await assert.rejects(() => installProject({ target, requestedModules: bootstrap, tools: ["codex"] }), /user-modified/);
  assert.equal(await fs.readFile(sentinel, "utf8"), before);
});

test("0.2 upgrade preserves in-progress specifications and backfills adaptive planning state", async () => {
  const target = await temp("adaptive-upgrade");
  await installProject({ target, requestedModules: bootstrap, tools: ["codex", "antigravity"] });
  const productSpec = path.join(target, "_bmad-output", "prd.md");
  await fs.mkdir(path.dirname(productSpec), { recursive: true });
  await fs.writeFile(productSpec, "# In-progress product specification\n");
  const architectureFile = path.join(target, ".geki", "architecture.json");
  const executionFile = path.join(target, ".geki", "state", "current-run.json");
  const architecture = await readJson(architectureFile);
  architecture.status = "draft";
  architecture.project = "preserve-me";
  await fs.writeFile(architectureFile, `${JSON.stringify(architecture, null, 2)}\n`);
  const execution = await readJson(executionFile);
  execution.status = "in-progress-spec";
  await fs.writeFile(executionFile, `${JSON.stringify(execution, null, 2)}\n`);
  for (const file of [
    path.join(target, ".geki", "state", "planning.json"),
    path.join(target, ".geki", "planning", "decisions.json"),
    path.join(target, ".geki", "planning", "delivery-slice.json"),
    path.join(target, ".geki", "findings", "registry.json")
  ]) await fs.rm(file);
  const configFile = path.join(target, ".geki", "config.json");
  const config = await readJson(configFile);
  delete config.planning;
  config.gekiVersion = "0.1.1";
  await fs.writeFile(configFile, `${JSON.stringify(config, null, 2)}\n`);

  await installProject({ target, requestedModules: bootstrap, tools: ["codex", "antigravity"] });

  assert.equal(await fs.readFile(productSpec, "utf8"), "# In-progress product specification\n");
  assert.equal((await readJson(architectureFile)).project, "preserve-me");
  assert.equal((await readJson(executionFile)).status, "in-progress-spec");
  assert.equal((await readJson(path.join(target, ".geki", "state", "planning.json"))).stage, "intake");
  assert.equal((await readJson(configFile)).planning.justInTimeStoryContracts, true);
});

test("uninstall removes owned files and preserves modified files", async () => {
  const target = await temp("uninstall");
  await installProject({ target, requestedModules: bootstrap, tools: ["codex"] });
  const modified = path.join(target, ".agents", "skills", "geki-help", "SKILL.md");
  await fs.appendFile(modified, "\nkeep me\n");
  const result = await uninstallProject(target);
  assert.ok(result.preserved.includes(".agents/skills/geki-help/SKILL.md"));
  assert.match(await fs.readFile(modified, "utf8"), /keep me/);
  await assert.rejects(() => fs.access(path.join(target, ".agents", "skills", "geki-status", "SKILL.md")));
});

test("rollback restores files that existed before install", async () => {
  const target = await temp("rollback");
  await fs.writeFile(path.join(target, "AGENTS.md"), "# Existing instructions\n");
  await installProject({ target, requestedModules: bootstrap, tools: ["codex"] });
  assert.match(await fs.readFile(path.join(target, "AGENTS.md"), "utf8"), /geki:start/);
  await rollbackProject(target);
  assert.equal(await fs.readFile(path.join(target, "AGENTS.md"), "utf8"), "# Existing instructions\n");
});

test("CLI bootstrap refuses execution modules and presets before Architecture", async () => {
  const target = await temp("two-stage");
  let result = spawnSync(process.execPath, [path.join(root, "bin", "geki.js"), "install", "--target", target, "--modules", "backend-dotnet", "--yes"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot be installed before approved Architecture/);
  result = spawnSync(process.execPath, [path.join(root, "bin", "geki.js"), "install", "--target", target, "--preset", "dotnet-postgres-api", "--yes"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /only after Architecture is approved/);
});

test("sync cannot omit or replace Architecture-required stack modules with a preset", async () => {
  const target = await temp("preset-guard");
  await installProject({ target, requestedModules: bootstrap, tools: ["codex"] });
  const architecture = await readJson(path.join(root, "fixtures", "dotnet8-postgres-api", "architecture.approved.json"));
  await fs.writeFile(path.join(target, ".geki", "architecture.json"), `${JSON.stringify(architecture, null, 2)}\n`);
  let result = spawnSync(process.execPath, [path.join(root, "bin", "geki.js"), "sync", "--target", target, "--preset", "nestjs-prisma-postgres", "--yes"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /conflicts with approved Architecture/);
  result = spawnSync(process.execPath, [path.join(root, "bin", "geki.js"), "sync", "--target", target, "--modules", "core,planning-bmad,spec-council,provisioning,dashboard", "--yes"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Cannot remove modules required by approved Architecture/);
  result = spawnSync(process.execPath, [path.join(root, "bin", "geki.js"), "add", "backend-nestjs", "database-sqlserver", "--target", target, "--yes"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /conflict with approved Architecture/);
});
