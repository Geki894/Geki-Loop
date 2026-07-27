import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { exists, hashFile, readJson } from "./files.mjs";
import { projectPaths } from "./paths.mjs";

const execFileAsync = promisify(execFile);
async function command(name, args = ["--version"]) {
  try { const result = await execFileAsync(name, args, { timeout: 5000 }); return { ok: true, value: (result.stdout || result.stderr).trim().split(/\r?\n/)[0] }; }
  catch (error) { return { ok: false, value: error.message }; }
}

export async function doctor(target) {
  const paths = projectPaths(target);
  const checks = [];
  const lock = await readJson(paths.lock, { modules: {} });
  const installed = new Set(Object.keys(lock.modules || {}));
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  checks.push({ id: "node", ok: nodeMajor >= 20, detail: process.version });
  for (const [id, name, args] of [["git", "git", ["--version"]], ["github", "gh", ["--version"]], ["docker", "docker", ["--version"]]]) {
    const result = await command(name, args);
    const required = id === "git" || (id === "github" && installed.has("github-ci")) || (id === "docker" && (installed.has("database-postgres") || installed.has("database-sqlserver")));
    checks.push({ id, ok: result.ok, detail: result.value, optional: !required });
  }
  const manifest = await readJson(paths.manifest, null);
  checks.push({ id: "manifest", ok: Boolean(manifest), detail: manifest ? `Geki ${manifest.gekiVersion}` : "missing" });
  if (manifest) {
    const drift = [];
    const mutableKinds = new Set(["state", "planning-state", "events", "decisions", "delivery-slice", "finding-registry", "handoff", "architecture", "config", "lock"]);
    for (const entry of manifest.files) {
      const file = path.join(paths.root, entry.path);
      if (!(await exists(file))) drift.push(`${entry.path}: missing`);
      else if (entry.kind !== "shared" && !mutableKinds.has(entry.kind) && await hashFile(file) !== entry.hash) drift.push(`${entry.path}: modified`);
    }
    checks.push({ id: "managed-files", ok: !drift.length, detail: drift.length ? drift.join("; ") : `${manifest.files.length} files verified` });
  }
  checks.push({ id: "state", ok: await exists(paths.state), detail: paths.state });
  checks.push({ id: "architecture", ok: await exists(paths.architecture), detail: paths.architecture });
  return { ok: checks.every((check) => check.ok || check.optional), checks };
}
