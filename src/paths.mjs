import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
export const packageRoot = path.resolve(sourceDir, "..");
export const modulesRoot = path.join(packageRoot, "modules");
export const presetsRoot = path.join(packageRoot, "presets");
export const templatesRoot = path.join(packageRoot, "templates");
export const runtimeRoot = path.join(packageRoot, "runtime");

export function projectPaths(target) {
  const root = path.resolve(target);
  return {
    root,
    agentsSkills: path.join(root, ".agents", "skills"),
    antigravityRules: path.join(root, ".agents", "rules"),
    antigravityWorkflows: path.join(root, ".agents", "workflows"),
    geki: path.join(root, ".geki"),
    config: path.join(root, ".geki", "config.json"),
    lock: path.join(root, ".geki", "lock.json"),
    manifest: path.join(root, ".geki", "manifest.json"),
    architecture: path.join(root, ".geki", "architecture.json"),
    state: path.join(root, ".geki", "state", "current-run.json"),
    planningState: path.join(root, ".geki", "state", "planning.json"),
    events: path.join(root, ".geki", "state", "events.jsonl"),
    decisions: path.join(root, ".geki", "planning", "decisions.json"),
    deliverySlice: path.join(root, ".geki", "planning", "delivery-slice.json"),
    findingRegistry: path.join(root, ".geki", "findings", "registry.json"),
    handoff: path.join(root, ".geki", "handoff", "current.yaml"),
    backups: path.join(root, ".geki", "backups"),
    runtime: path.join(root, ".geki", "runtime")
  };
}
