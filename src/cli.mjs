import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs, csv } from "./args.mjs";
import { modulesForArchitecture } from "./architecture.mjs";
import { bootstrapModules, loadCatalog } from "./catalog.mjs";
import { detectRepository } from "./detect.mjs";
import { doctor } from "./doctor.mjs";
import { exists, readJson } from "./files.mjs";
import { installProject, rollbackProject, uninstallProject } from "./installer.mjs";
import { projectPaths } from "./paths.mjs";
import { checkbox, confirm } from "./prompt.mjs";

const help = `Geki 0.1.0 — project-local engineering loop

Usage:
  geki install [--target PATH] [--tools codex,antigravity] [--modules IDS] [--yes]
  geki add [MODULES] [--target PATH] [--yes]
  geki sync [--target PATH] [--preset ID] [--modules IDS] [--yes]
  geki doctor [--target PATH]
  geki status [--target PATH]
  geki dashboard [--target PATH] [--port 4178]
  geki rollback [--target PATH] [--force]
  geki uninstall [--target PATH] [--force] [--yes]
  geki list

Planning is interactive. Autonomous coding starts only when the user explicitly invokes the installed geki-run skill with an Epic/Story scope.`;

function targetOf(flags) { return path.resolve(flags.target || process.cwd()); }

async function chooseTools(flags) {
  const requested = csv(flags.tools);
  if (requested.length) return requested;
  if (flags.yes) return ["codex", "antigravity"];
  return checkbox("Select coding tools", [
    { value: "codex", label: "Codex", checked: true },
    { value: "antigravity", label: "Google Antigravity", checked: true }
  ]);
}

async function chooseModules(catalog, recommended, flags, message = "Select Geki modules", allowed = null) {
  const explicit = csv(flags.modules);
  if (explicit.length) return explicit;
  if (flags.yes) return recommended;
  return checkbox(message, [...catalog.modules.values()].filter((module) => !allowed || allowed.includes(module.id)).sort((a, b) => Number(b.bootstrap) - Number(a.bootstrap) || a.id.localeCompare(b.id)).map((module) => ({
    value: module.id,
    label: `${module.id} — ${module.description}`,
    checked: recommended.includes(module.id)
  })));
}

async function install(args) {
  const target = targetOf(args.flags);
  const catalog = await loadCatalog();
  const detection = await detectRepository(target);
  const recommended = bootstrapModules(catalog);
  if (args.flags.preset) throw new Error("Stack presets are applied by `geki sync --preset <id>` only after Architecture is approved.");
  if (detection.brownfield) {
    console.log(`Detected existing repository; stack evidence will inform planning and later sync: ${detection.recommendedPreset}`);
    console.log(`Evidence: ${detection.evidence.join(", ") || "none"}`);
  }
  const tools = await chooseTools(args.flags);
  if (!tools.length) throw new Error("At least one coding tool must be selected.");
  const modules = await chooseModules(catalog, recommended, args.flags, "Select bootstrap capabilities", recommended);
  const invalid = modules.filter((id) => !recommended.includes(id));
  if (invalid.length) throw new Error(`Execution modules cannot be installed before approved Architecture: ${invalid.join(", ")}`);
  if (!modules.includes("core")) modules.unshift("core");
  const result = await installProject({ target, requestedModules: modules, tools, force: Boolean(args.flags.force) });
  console.log(`\nGeki ${"0.1.0"} installed in ${target}`);
  console.log(`Modules: ${result.moduleIds.join(", ")}`);
  console.log(`Managed files: ${result.files}`);
  console.log("Next: invoke geki-help in Codex or Antigravity, then run geki-spec.");
}

async function add(args) {
  const target = targetOf(args.flags);
  const paths = projectPaths(target);
  const lock = await readJson(paths.lock, null);
  if (!lock) throw new Error("Geki is not installed. Run `geki install` first.");
  const catalog = await loadCatalog();
  const requested = [...new Set([...Object.keys(lock.modules), ...args.positional, ...csv(args.flags.modules)])];
  const architecture = await readJson(paths.architecture, {});
  const nonBootstrap = requested.filter((id) => !bootstrapModules(catalog).includes(id));
  if (nonBootstrap.length && architecture.status !== "approved") throw new Error(`Approve Architecture before adding execution modules: ${nonBootstrap.join(", ")}`);
  let architectureRequired = [];
  if (architecture.status === "approved") {
    architectureRequired = modulesForArchitecture(architecture);
    const incompatibleRequested = requested.filter((id) => /^(backend-|database-|frontend$|render$)/.test(id) && !architectureRequired.includes(id));
    if (incompatibleRequested.length) throw new Error(`Requested modules conflict with approved Architecture: ${incompatibleRequested.join(", ")}`);
    requested.push(...architectureRequired);
  }
  const modules = await chooseModules(catalog, requested, args.flags, "Select modules to keep or add");
  const missingRequired = architectureRequired.filter((id) => !modules.includes(id));
  if (missingRequired.length) throw new Error(`Cannot remove modules required by approved Architecture: ${missingRequired.join(", ")}`);
  const incompatibleSelected = modules.filter((id) => /^(backend-|database-|frontend$|render$)/.test(id) && !architectureRequired.includes(id));
  if (architecture.status === "approved" && incompatibleSelected.length) throw new Error(`Selected modules conflict with approved Architecture: ${incompatibleSelected.join(", ")}`);
  const result = await installProject({ target, requestedModules: modules, tools: lock.tools, force: Boolean(args.flags.force), removeUnselected: false });
  console.log(`Installed modules: ${result.moduleIds.join(", ")}`);
}

async function sync(args) {
  const target = targetOf(args.flags);
  const paths = projectPaths(target);
  const [lock, architecture] = await Promise.all([readJson(paths.lock, null), readJson(paths.architecture, null)]);
  if (!lock) throw new Error("Geki is not installed.");
  if (!architecture || architecture.status !== "approved") throw new Error("Architecture must be approved before Geki can synchronize execution modules.");
  const catalog = await loadCatalog();
  const architectureRecommended = modulesForArchitecture(architecture);
  let recommended = [...new Set([...bootstrapModules(catalog), ...architectureRecommended])];
  if (args.flags.preset) {
    const preset = catalog.presets.get(args.flags.preset);
    if (!preset) throw new Error(`Unknown preset '${args.flags.preset}'.`);
    const stackModules = (preset.modules || []).filter((id) => /^(backend-|database-|frontend$|render$)/.test(id));
    const incompatible = stackModules.filter((id) => !architectureRecommended.includes(id));
    if (incompatible.length) throw new Error(`Preset conflicts with approved Architecture: ${incompatible.join(", ")}`);
    recommended = [...new Set([...bootstrapModules(catalog), ...architectureRecommended, ...preset.modules])];
  }
  console.log("Architecture-driven module proposal:");
  for (const id of recommended) console.log(`  + ${id}`);
  const modules = await chooseModules(catalog, recommended, args.flags, "Confirm architecture modules");
  const missing = architectureRecommended.filter((id) => !modules.includes(id));
  if (missing.length) throw new Error(`Cannot remove modules required by approved Architecture: ${missing.join(", ")}`);
  const incompatible = modules.filter((id) => /^(backend-|database-|frontend$|render$)/.test(id) && !architectureRecommended.includes(id));
  if (incompatible.length) throw new Error(`Selected modules conflict with approved Architecture: ${incompatible.join(", ")}`);
  if (!args.flags.yes && !(await confirm("Apply this module diff?", true))) {
    console.log("Sync cancelled; no files changed.");
    return;
  }
  const result = await installProject({ target, requestedModules: modules, tools: lock.tools, force: Boolean(args.flags.force), removeUnselected: true });
  console.log(`Geki synchronized: ${result.moduleIds.join(", ")}`);
  console.log("Planning is complete. Autonomous coding still requires an explicit geki-run scope.");
}

async function showDoctor(args) {
  const result = await doctor(targetOf(args.flags));
  for (const check of result.checks) console.log(`${check.ok ? "PASS" : check.optional ? "WARN" : "FAIL"} ${check.id}: ${check.detail}`);
  if (!result.ok) process.exitCode = 1;
}

async function showStatus(args) {
  const paths = projectPaths(targetOf(args.flags));
  const state = await readJson(paths.state, null);
  if (!state) throw new Error("Geki state not found.");
  console.log(JSON.stringify(state, null, 2));
}

async function dashboard(args) {
  const target = targetOf(args.flags);
  const script = path.join(target, ".geki", "runtime", "dashboard.mjs");
  if (!(await exists(script))) throw new Error("Dashboard runtime is not installed.");
  const child = spawn(process.execPath, [script, "--port", String(args.flags.port || 4178)], { cwd: target, stdio: "inherit" });
  await new Promise((resolve, reject) => { child.on("exit", resolve); child.on("error", reject); });
}

async function rollback(args) {
  const result = await rollbackProject(targetOf(args.flags), Boolean(args.flags.force));
  console.log(`Restored Geki snapshot ${result.snapshot}.`);
}

async function uninstall(args) {
  if (!args.flags.yes && !(await confirm("Remove Geki-owned project files? Modified files will be preserved.", false))) return;
  const result = await uninstallProject(targetOf(args.flags), Boolean(args.flags.force));
  console.log(result.preserved.length ? `Geki removed; preserved modified files: ${result.preserved.join(", ")}` : "Geki removed.");
}

async function list() {
  const catalog = await loadCatalog();
  console.log("Presets:");
  for (const preset of catalog.presets.values()) console.log(`  ${preset.id}: ${preset.description}`);
  console.log("\nModules:");
  for (const module of catalog.modules.values()) console.log(`  ${module.id}: ${module.description}`);
}

export async function runCli(argv) {
  const args = parseArgs([...argv]);
  if (["help", "--help", "-h"].includes(args.command)) return console.log(help);
  if (args.command === "install" || args.command === "init") return install(args);
  if (args.command === "add") return add(args);
  if (args.command === "sync") return sync(args);
  if (args.command === "doctor") return showDoctor(args);
  if (args.command === "status") return showStatus(args);
  if (args.command === "dashboard") return dashboard(args);
  if (args.command === "rollback") return rollback(args);
  if (args.command === "uninstall") return uninstall(args);
  if (args.command === "list") return list();
  throw new Error(`Unknown command '${args.command}'.\n\n${help}`);
}
