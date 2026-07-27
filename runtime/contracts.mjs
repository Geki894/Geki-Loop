#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { resolveProjectContext } from "./project-context.mjs";

const context = resolveProjectContext();
const root = context.controlRoot;
const realRoot = await fs.realpath(root);
const args = process.argv.slice(2);
const command = args.shift();
const fileArg = args[0];
if (!fileArg || !["approve", "verify"].includes(command)) throw new Error("Usage: contracts.mjs approve|verify <story-contract>");
const file = path.resolve(root, fileArg);
const relative = path.relative(root, file);
if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Contract must be inside the project.");
const realFile = await fs.realpath(file);
const realRelative = path.relative(realRoot, realFile);
if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) throw new Error("Contract escapes the real project boundary.");
const data = await fs.readFile(realFile);
const sha256 = createHash("sha256").update(data).digest("hex");
const sidecar = `${file}.sha256.json`;
if (command === "approve") {
  const approval = { schemaVersion: 1, contract: relative.split(path.sep).join("/"), sha256, approvedAt: new Date().toISOString() };
  await fs.writeFile(sidecar, `${JSON.stringify(approval, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(approval, null, 2));
} else {
  const approval = JSON.parse(await fs.readFile(sidecar, "utf8"));
  if (approval.contract !== relative.split(path.sep).join("/") || approval.sha256 !== sha256) {
    throw new Error(`Story Contract changed after approval: ${relative}`);
  }
  console.log(JSON.stringify({ valid: true, ...approval }, null, 2));
}
