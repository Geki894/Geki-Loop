#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { controlPath, relativeControl, resolveProjectContext } from "./project-context.mjs";

const args = process.argv.slice(2);
const command = args.shift();
const context = resolveProjectContext();

function flag(name, fallback = undefined) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : true;
}

function gh(parts, allowFailure = false) {
  const binary = process.env.GEKI_GH_BIN || "gh";
  const prefix = process.env.GEKI_GH_SCRIPT ? [process.env.GEKI_GH_SCRIPT] : [];
  const result = spawnSync(binary, [...prefix, ...parts], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const stderr = result.stderr?.trim() || result.error?.message || "";
  const stdout = result.stdout?.trim() || "";
  if (result.status !== 0 && !allowFailure) throw new Error(stderr || `gh ${parts.join(" ")} failed`);
  return { status: result.status, stdout, stderr };
}

function requireText(value, message) {
  if (!value || value === true) throw new Error(message);
  return value;
}

function view(pr) {
  const result = gh(["pr", "view", pr, "--json", "number,url,state,baseRefName,headRefName,headRefOid,mergeStateStatus,autoMergeRequest,statusCheckRollup"]);
  return JSON.parse(result.stdout);
}

function writeEvidence(pr, data, suffix = "") {
  const directory = controlPath(context, "evidence", "github");
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `pr-${pr}${suffix}.json`);
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return relativeControl(context, file);
}

if (command === "epic-pr") {
  const head = requireText(flag("head"), "--head <epic-branch> is required");
  const title = requireText(flag("title"), "--title <title> is required");
  const bodyFile = flag("body-file");
  const create = ["pr", "create", "--base", "coding", "--head", head, "--title", title];
  if (bodyFile && bodyFile !== true) create.push("--body-file", bodyFile); else create.push("--body", "Geki Epic delivery. See committed evidence and Story Contracts.");
  const created = gh(create);
  const url = created.stdout.split(/\r?\n/).find((line) => line.startsWith("http")) || created.stdout;
  const beforeMerge = view(url);
  if (beforeMerge.baseRefName !== "coding" || beforeMerge.headRefName !== head) throw new Error("Created Epic PR does not match the required head -> coding policy.");
  gh(["pr", "merge", url, "--auto", "--squash"]);
  const requested = view(url);
  const requestEvidence = writeEvidence(requested.number, { schemaVersion: 1, kind: "epic-auto-merge-request", requestedAt: new Date().toISOString(), number: requested.number, url: requested.url, baseRefName: requested.baseRefName, headRefName: requested.headRefName, headRefOid: requested.headRefOid }, "-auto-request");
  console.log(JSON.stringify({ kind: "epic", base: "coding", head, url, autoMerge: true, evidence: requestEvidence }, null, 2));
} else if (command === "release-pr") {
  const head = flag("head", "coding");
  if (head !== "coding") throw new Error("Release PR head must be coding.");
  const title = requireText(flag("title"), "--title <title> is required");
  const created = gh(["pr", "create", "--base", "main", "--head", "coding", "--title", title, "--body", "Human-reviewed Geki release candidate. Auto-merge is intentionally disabled."]);
  const url = created.stdout.split(/\r?\n/).find((line) => line.startsWith("http")) || created.stdout;
  const release = view(url);
  if (release.baseRefName !== "main" || release.headRefName !== "coding") throw new Error("Release PR must be coding -> main.");
  console.log(JSON.stringify({ kind: "release", base: "main", head: "coding", url, autoMerge: false }, null, 2));
} else if (command === "checks") {
  const pr = requireText(flag("pr"), "--pr <number-or-url> is required");
  const result = gh(["pr", "checks", pr, "--required"]);
  process.stdout.write(`${result.stdout}\n`);
} else if (command === "verify-epic") {
  const pr = requireText(flag("pr"), "--pr <number-or-url> is required");
  const epicId = requireText(flag("epic"), "--epic <id> is required");
  const expectedHead = requireText(flag("head-sha"), "--head-sha <verified-sha> is required");
  gh(["pr", "checks", pr, "--required", "--watch", "--interval", "10"]);
  const checksResult = gh(["pr", "checks", pr, "--required", "--json", "name,state,bucket,link,workflow"]);
  const checks = JSON.parse(checksResult.stdout || "[]");
  if (!Array.isArray(checks) || !checks.length) throw new Error("Epic PR has no required GitHub checks; branch protection is not proven.");
  const failedChecks = checks.filter((check) => check.bucket !== "pass");
  if (failedChecks.length) throw new Error(`Required GitHub checks did not pass: ${failedChecks.map((check) => check.name).join(", ")}`);
  const result = view(pr);
  if (result.baseRefName !== "coding") throw new Error(`Epic PR base is '${result.baseRefName}', expected 'coding'.`);
  if (result.state !== "MERGED") throw new Error(`Epic PR is '${result.state}', expected 'MERGED' after required checks.`);
  if (result.headRefOid !== expectedHead) throw new Error("Epic PR head SHA does not match the verified commit.");
  const requestFile = controlPath(context, "evidence", "github", `pr-${result.number}-auto-request.json`);
  const request = JSON.parse(fs.readFileSync(requestFile, "utf8"));
  if (request.kind !== "epic-auto-merge-request" || request.headRefOid !== expectedHead || request.baseRefName !== "coding") throw new Error("Matching auto-merge request evidence is missing or invalid.");
  const evidence = { schemaVersion: 1, kind: "epic-github", epicId, verifiedAt: new Date().toISOString(), requiredChecks: checks, autoMergeRequest: request, ...result };
  const file = writeEvidence(result.number, evidence);
  console.log(JSON.stringify({ passed: true, evidence: file, pullRequest: result }, null, 2));
} else {
  throw new Error("Usage: github.mjs epic-pr|release-pr|checks|verify-epic [options]");
}
