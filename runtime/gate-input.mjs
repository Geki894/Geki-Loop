import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

function gitFiles(root) {
  const result = spawnSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error("Git repository is required for gate input evidence.");
  return result.stdout.split("\0").filter(Boolean).filter((file) => {
    const normalized = file.replace(/\\/g, "/");
    return !normalized.startsWith(".geki/") && !normalized.startsWith(".git/");
  }).sort();
}

function globRegex(pattern) {
  const normalized = String(pattern).replace(/\\/g, "/");
  let output = "^";
  for (let index = 0; index < normalized.length; index++) {
    const char = normalized[index];
    if (char === "*" && normalized[index + 1] === "*") { output += ".*"; index++; }
    else if (char === "*") output += "[^/]*";
    else if (char === "?") output += "[^/]";
    else output += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`${output}$`, "i");
}

export function selectInputPaths(root, patterns = []) {
  const files = gitFiles(root);
  if (!patterns?.length) return files;
  const matchers = patterns.map(globRegex);
  const always = /(^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|packages\.lock\.json|global\.json|[^/]+\.(?:sln|csproj|props|targets))$/i;
  return files.filter((file) => always.test(file.replace(/\\/g, "/")) || matchers.some((matcher) => matcher.test(file.replace(/\\/g, "/"))));
}

export async function fingerprintPaths(root, inputPaths) {
  const hash = createHash("sha256");
  for (const relative of [...new Set(inputPaths)].sort()) {
    const file = path.join(root, relative);
    const stat = await fs.stat(file).catch(() => null);
    hash.update(relative.replace(/\\/g, "/")).update("\0");
    if (stat?.isFile()) hash.update(await fs.readFile(file));
    else hash.update("<missing>");
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function gateInput(root, command, policyHash) {
  const inputPaths = selectInputPaths(root, command.paths || []);
  const inputFingerprint = await fingerprintPaths(root, inputPaths);
  const key = createHash("sha256")
    .update(String(command.id))
    .update("\0")
    .update(String(command.command))
    .update("\0")
    .update(String(policyHash))
    .update("\0")
    .update(inputFingerprint)
    .digest("hex");
  return { key, inputPaths, inputFingerprint, policyHash };
}
