import fs from "node:fs/promises";
import path from "node:path";
import { modulesRoot, presetsRoot } from "./paths.mjs";
import { readJson } from "./files.mjs";

export async function loadCatalog() {
  const modules = new Map();
  for (const entry of await fs.readdir(modulesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifest = await readJson(path.join(modulesRoot, entry.name, "module.json"), null);
    if (!manifest) continue;
    manifest.root = path.join(modulesRoot, entry.name);
    if (modules.has(manifest.id)) throw new Error(`Duplicate module id: ${manifest.id}`);
    modules.set(manifest.id, manifest);
  }
  const presets = new Map();
  for (const entry of await fs.readdir(presetsRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const preset = await readJson(path.join(presetsRoot, entry.name));
    presets.set(preset.id, preset);
  }
  return { modules, presets };
}

export function resolveModules(catalog, requested) {
  const selected = new Set();
  function add(id, trail = []) {
    const module = catalog.modules.get(id);
    if (!module) throw new Error(`Unknown module '${id}'${trail.length ? ` required by ${trail.join(" -> ")}` : ""}`);
    if (selected.has(id)) return;
    for (const dependency of module.requires || []) add(dependency, [...trail, id]);
    selected.add(id);
  }
  for (const id of requested) add(id);
  return [...selected];
}

export function bootstrapModules(catalog) {
  return [...catalog.modules.values()].filter((module) => module.bootstrap).map((module) => module.id);
}
