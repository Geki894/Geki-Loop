import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = "0.1.0";
const failures = [];
const fail = (message) => failures.push(message);
async function read(relative) { return fs.readFile(path.join(root, relative), "utf8"); }
async function json(relative) { return JSON.parse(await read(relative)); }
async function walk(directory) {
  const output = [];
  for (const entry of await fs.readdir(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    const alwaysIgnored = new Set([".git", ".tmp", ".npm-cache", "node_modules"]);
    const fixtureBuild = directory.startsWith("fixtures") && new Set(["bin", "obj"]).has(entry.name);
    if (entry.isDirectory() && (alwaysIgnored.has(entry.name) || fixtureBuild)) continue;
    if (entry.isDirectory()) output.push(...await walk(relative)); else output.push(relative);
  }
  return output;
}

const pkg = await json("package.json");
if (pkg.version !== version || pkg.name !== "geki") fail("package identity/version mismatch");
for (const item of ["presets/", "runtime/", "third-party-lock.json", "THIRD_PARTY_NOTICES.md"]) {
  if (!pkg.files.includes(item)) fail(`package files omits ${item}`);
}

const allFiles = (await walk(".")).filter((file) => !file.startsWith(`.git${path.sep}`) && !file.includes(`${path.sep}node_modules${path.sep}`));
for (const file of allFiles.filter((file) => /\.(?:md|json|mjs|js|ya?ml)$/i.test(file))) {
  if (file === path.join("scripts", "validate-repository.mjs")) continue;
  const content = await read(file);
  if (/PIN_DURING_RELEASE|VERIFY_DURING_RELEASE|\*\*\* Add File|\[TODO|TODO:/i.test(content)) fail(`${file} contains a release placeholder or patch marker`);
}

const moduleFiles = allFiles.filter((file) => file.endsWith(`module.json`));
const moduleIds = new Set();
for (const file of moduleFiles) {
  const manifest = await json(file);
  if (!manifest.id || moduleIds.has(manifest.id)) fail(`${file} has missing/duplicate id`);
  moduleIds.add(manifest.id);
  if (manifest.version !== version) fail(`${file} is not version ${version}`);
}
for (const file of moduleFiles) {
  const manifest = await json(file);
  for (const dependency of manifest.requires || []) if (!moduleIds.has(dependency)) fail(`${file} requires unknown ${dependency}`);
}

const skillFiles = allFiles.filter((file) => file.endsWith(`${path.sep}SKILL.md`));
const skillNames = new Set();
if (skillFiles.length < 16) fail("expected at least 16 Geki skills");
for (const file of skillFiles) {
  const content = await read(file);
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) { fail(`${file} lacks YAML frontmatter`); continue; }
  const name = match[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = match[1].match(/^description:\s*(.+)$/m)?.[1]?.trim();
  if (!name || !/^[a-z0-9-]+$/.test(name)) fail(`${file} has invalid name`);
  if (!description || description.length < 40 || !/Use|use|when/i.test(description)) fail(`${file} has weak description`);
  if (path.basename(path.dirname(file)) !== name) fail(`${file} name does not match its folder`);
  if (skillNames.has(name)) fail(`${file} duplicates skill ${name}`); else skillNames.add(name);
  if (content.split(/\r?\n/).length > 500) fail(`${file} exceeds 500 lines`);
  const agentFile = path.join(path.dirname(file), "agents", "openai.yaml");
  try {
    const agent = await read(agentFile);
    for (const key of ["display_name:", "short_description:", "default_prompt:"]) if (!agent.includes(key)) fail(`${agentFile} misses ${key}`);
  } catch { fail(`${file} lacks agents/openai.yaml`); }
}

const lock = await json("third-party-lock.json");
for (const source of lock.sources) {
  if (!/^[a-f0-9]{40}$/.test(source.ref)) fail(`upstream ${source.id} is not commit-pinned`);
  if (!source.license) fail(`upstream ${source.id} lacks license`);
}

const evalIds = new Set();
for (const file of allFiles.filter((file) => file.startsWith(`evals${path.sep}cases${path.sep}`) && file.endsWith(".json"))) {
  const value = await json(file);
  for (const key of ["id", "skill", "prompt", "must", "mustNot"]) if (!(key in value)) fail(`${file} misses ${key}`);
  if (evalIds.has(value.id)) fail(`${file} duplicates eval id ${value.id}`); else evalIds.add(value.id);
  if (!skillNames.has(value.skill)) fail(`${file} references unknown skill ${value.skill}`);
  if (!Array.isArray(value.must) || !value.must.length || !Array.isArray(value.mustNot) || !value.mustNot.length) fail(`${file} needs non-empty must/mustNot arrays`);
  if (value.fixture) {
    try { await fs.access(path.join(root, value.fixture)); } catch { fail(`${file} references missing fixture ${value.fixture}`); }
  }
  if (value.turns) {
    if (!Array.isArray(value.turns) || value.turns.length < 2) fail(`${file} multi-turn eval needs at least two turns`);
    for (const turn of value.turns || []) {
      if (!turn.prompt || !Array.isArray(turn.must) || !turn.must.length) fail(`${file} has an invalid eval turn`);
      if (turn.fixture) {
        try { await fs.access(path.join(root, turn.fixture)); } catch { fail(`${file} turn references missing fixture ${turn.fixture}`); }
      }
    }
  }
}

const workflow = await read("templates/github/geki-quality.yml");
if (!workflow.includes("branches: [coding, main]") || !workflow.includes("run-gates.mjs --ci")) fail("installed GitHub workflow misses protected integration gates");
const githubRuntime = await read("runtime/github.mjs");
if (!githubRuntime.includes('"--base", "coding"') || !githubRuntime.includes('"--base", "main"')) fail("GitHub runtime misses branch policy");
if (/release-pr[\s\S]{0,1200}--auto/.test(githubRuntime)) fail("release PR path may auto-merge main");
const dashboard = await read("runtime/dashboard.mjs");
if (!dashboard.includes('request.method !== "GET"') || /request\.method\s*===\s*"(?:POST|PUT|PATCH|DELETE)"/.test(dashboard)) fail("dashboard is not demonstrably read-only");

for (const required of ["README.md", "README.vi.md", "LICENSE", "CONTRIBUTING.md", "docs/acceptance-matrix.md"]) {
  try { assert.ok((await read(required)).length > 100); } catch { fail(`${required} is missing or empty`); }
}

if (failures.length) {
  console.error(failures.map((item) => `FAIL ${item}`).join("\n"));
  process.exitCode = 1;
} else console.log(`Validated ${moduleFiles.length} modules, ${skillFiles.length} skills, ${lock.sources.length} pinned upstream references, and ${allFiles.length} files.`);
