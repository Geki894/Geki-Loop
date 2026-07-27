import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

function canonical(input) {
  const resolved = path.resolve(input);
  try { return fs.realpathSync.native(resolved); }
  catch { return resolved; }
}

export function resolveProjectContext(workspace = process.cwd()) {
  const workspaceRoot = canonical(workspace);
  const result = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: workspaceRoot,
    encoding: "utf8"
  });
  if (result.status !== 0) return { workspaceRoot, controlRoot: workspaceRoot, commonGitDir: null, linkedWorktree: false };
  const commonGitDir = canonical(path.resolve(workspaceRoot, result.stdout.trim()));
  const controlRoot = path.basename(commonGitDir).toLowerCase() === ".git" ? canonical(path.dirname(commonGitDir)) : workspaceRoot;
  return {
    workspaceRoot,
    controlRoot,
    commonGitDir,
    linkedWorktree: path.normalize(controlRoot).toLowerCase() !== path.normalize(workspaceRoot).toLowerCase()
  };
}

export function controlPath(context, ...parts) {
  return path.join(context.controlRoot, ".geki", ...parts);
}

export function relativeControl(context, file) {
  return path.relative(context.controlRoot, file).split(path.sep).join("/");
}
