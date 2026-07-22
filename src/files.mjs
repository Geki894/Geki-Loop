import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

export async function readJson(file, fallback = undefined) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) {
    if (fallback !== undefined && error.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function hashFile(file) {
  const data = await fs.readFile(file);
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function hashText(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export async function walkFiles(root) {
  if (!(await exists(root))) return [];
  const output = [];
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(full);
      else output.push(full);
    }
  }
  await visit(root);
  return output;
}

export function relativeUnix(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

export async function copyFile(source, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
}

export async function removeEmptyParents(start, stop) {
  let current = path.dirname(start);
  const boundary = path.resolve(stop);
  while (current.startsWith(boundary) && current !== boundary) {
    try { await fs.rmdir(current); } catch { break; }
    current = path.dirname(current);
  }
}
