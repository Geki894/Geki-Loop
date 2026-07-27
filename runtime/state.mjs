#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fingerprintPaths } from "./gate-input.mjs";
import { controlPath, relativeControl, resolveProjectContext } from "./project-context.mjs";

const context = resolveProjectContext();
const root = context.workspaceRoot;
const controlRoot = context.controlRoot;
const stateFile = controlPath(context, "state", "current-run.json");
const eventsFile = controlPath(context, "state", "events.jsonl");
const architectureFile = controlPath(context, "architecture.json");
const gatesFile = controlPath(context, "gates.json");
const runtimeDirectory = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const command = args.shift() || "status";
const realControlRoot = await fs.realpath(controlRoot);

const transitions = {
  planning: ["spec-review"],
  "spec-review": ["planning", "readiness"],
  readiness: ["planning", "spec-review", "ready"],
  ready: ["provisioning", "executing", "planning"],
  provisioning: ["ready"],
  executing: ["executing", "waiting-clarification", "spec-reopened", "verifying", "blocked"],
  "waiting-clarification": ["executing", "spec-reopened"],
  "spec-reopened": ["planning"],
  verifying: ["executing", "complete", "blocked"],
  blocked: ["executing", "planning"],
  complete: ["planning", "ready"]
};

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function appendEvent(type, payload = {}) {
  const event = { id: randomUUID(), type, at: new Date().toISOString(), ...payload };
  await fs.mkdir(path.dirname(eventsFile), { recursive: true });
  await fs.appendFile(eventsFile, `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

async function loadState() {
  const state = await readJson(stateFile, null);
  if (!state) throw new Error("Geki state is missing. Run `geki install` first.");
  return state;
}

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}
function ensureEpicBranches(epics) {
  const branches = {};
  const base = git(["rev-parse", "--verify", "coding"]) ? "coding" : "HEAD";
  for (const epic of epics) {
    const slug = String(epic).toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
    const branch = `geki/epic-${slug}`;
    if (!git(["rev-parse", "--verify", branch])) {
      const created = spawnSync("git", ["branch", branch, base], { cwd: root, encoding: "utf8" });
      if (created.status !== 0) throw new Error(created.stderr.trim() || `Cannot create Epic integration branch '${branch}'.`);
    }
    branches[epic] = branch;
  }
  return branches;
}

async function workspaceFingerprint() {
  const result = spawnSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error("Git repository is required for execution evidence.");
  const files = result.stdout.split("\0").filter(Boolean).filter((file) => !file.replace(/\\/g, "/").startsWith(".geki/")).sort();
  const hash = createHash("sha256");
  for (const relative of files) {
    const file = path.join(root, relative);
    const stat = await fs.stat(file).catch(() => null);
    if (!stat?.isFile()) continue;
    hash.update(relative.replace(/\\/g, "/")).update("\0").update(await fs.readFile(file)).update("\0");
  }
  return hash.digest("hex");
}

function evidenceSupportsGate(id, payload, binding = {}) {
  if (id === "github") return payload?.kind === "epic-github" && payload?.epicId === binding.epic && payload?.state === "MERGED" && payload?.baseRefName === "coding" && Boolean(payload?.headRefOid) && payload?.autoMergeRequest?.kind === "epic-auto-merge-request" && payload.autoMergeRequest.headRefOid === payload.headRefOid && Array.isArray(payload?.requiredChecks) && payload.requiredChecks.length > 0 && payload.requiredChecks.every((check) => check?.bucket === "pass");
  if (id === "independent-review") return payload?.kind === "independent-review" && payload?.storyId === binding.story && payload?.gate === id && payload?.outcome === "passed" && Number(payload?.unresolvedHighCritical || 0) === 0 && Boolean(payload?.reviewerContextId) && Boolean(payload?.reviewedCommit);
  const results = payload?.results || payload?.gateResults || [];
  if (payload?.kind === "gate-report" && payload?.scope?.story === binding.story && Array.isArray(results) && results.some((item) => (item.id === id || item.gate === id) && item.outcome === "passed" && item.exitCode === 0 && Boolean(item.command) && Boolean(item.startedAt) && Boolean(item.completedAt))) return true;
  return false;
}

async function evidenceMetadata(input, expectedGate = null, binding = {}) {
  if (!input || input === true) throw new Error("A project-local --evidence file is required for a passing gate.");
  const file = path.resolve(controlRoot, input);
  const realFile = await fs.realpath(file);
  const realRelative = path.relative(realControlRoot, realFile);
  if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) throw new Error("Evidence escapes the real project boundary.");
  const relativeUnix = realRelative.split(path.sep).join("/");
  if (expectedGate) {
    const prefix = expectedGate === "github" ? ".geki/evidence/github/" : expectedGate === "independent-review" ? ".geki/evidence/review/" : ".geki/evidence/gates/";
    if (!relativeUnix.startsWith(prefix)) throw new Error(`Evidence for '${expectedGate}' must be written under ${prefix}`);
  }
  const data = await fs.readFile(realFile);
  let payload;
  try { payload = JSON.parse(data.toString("utf8")); } catch { throw new Error("Evidence must be JSON."); }
  if (expectedGate && !evidenceSupportsGate(expectedGate, payload, binding)) throw new Error(`Evidence does not contain a passing result for gate '${expectedGate}' in the active Story/Epic.`);
  const sourceCommit = git(["rev-parse", "HEAD"]);
  if (expectedGate === "independent-review" && payload.reviewedCommit !== sourceCommit) throw new Error("Independent review must target the current implementation commit.");
  if (expectedGate === "github" && payload.headRefOid !== sourceCommit) throw new Error("GitHub Epic evidence must target the current verified commit.");
  const gateResult = expectedGate && payload?.kind === "gate-report"
    ? (payload.results || payload.gateResults || []).find((item) => (item.id === expectedGate || item.gate === expectedGate) && item.outcome === "passed")
    : null;
  return {
    path: relativeUnix,
    sha256: createHash("sha256").update(data).digest("hex"),
    bytes: data.length,
    sourceCommit,
    workspaceFingerprint: gateResult?.inputFingerprint ? null : await workspaceFingerprint(),
    inputFingerprint: gateResult?.inputFingerprint || null,
    inputPaths: gateResult?.inputPaths || null,
    policyHash: gateResult?.policyHash || null,
    kind: payload.kind || "gate-report"
  };
}

async function preflightMetadata(input, stories) {
  if (!input || input === true) throw new Error("Execution requires --preflight <passed-report> from execution-preflight.mjs.");
  const file = path.resolve(controlRoot, input);
  const realFile = await fs.realpath(file);
  const realRelative = path.relative(realControlRoot, realFile);
  if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) throw new Error("Preflight evidence must be inside the project.");
  const data = await fs.readFile(realFile);
  const payload = JSON.parse(data.toString("utf8"));
  if (payload.kind !== "execution-preflight" || payload.outcome !== "passed") throw new Error("Preflight evidence is not a passing execution-preflight report.");
  if (JSON.stringify(payload.scope?.stories || []) !== JSON.stringify(stories)) throw new Error("Preflight scope does not match the requested Story scope.");
  const inputHash = createHash("sha256");
  const storyFiles = stories.map((id) => controlPath(context, "spec", "stories", `${id}.yaml`));
  const epicIds = new Set();
  for (const storyFile of storyFiles) {
    const content = await fs.readFile(storyFile, "utf8");
    const match = content.match(/^epicId:\s*["']?([^"'\r\n]+)["']?\s*$/m);
    if (match) epicIds.add(match[1].trim());
  }
  for (const inputFile of [
    architectureFile,
    controlPath(context, "lock.json"),
    gatesFile,
    ...storyFiles,
    ...[...epicIds].sort().map((id) => controlPath(context, "spec", "epics", `${id}.json`))
  ]) inputHash.update(await fs.readFile(inputFile)).update("\0");
  if (payload.inputHash !== inputHash.digest("hex")) throw new Error("Preflight evidence is stale for the current Architecture, modules, gates, or Story Contracts.");
  return {
    path: realRelative.split(path.sep).join("/"),
    sha256: createHash("sha256").update(data).digest("hex"),
    inputHash: payload.inputHash,
    createdAt: payload.createdAt
  };
}

async function validateEvidence(id, entry, binding) {
  if (!entry?.evidence?.path || !entry.evidence.sha256) return "missing evidence metadata";
  try {
    const data = await fs.readFile(path.join(controlRoot, entry.evidence.path));
    if (createHash("sha256").update(data).digest("hex") !== entry.evidence.sha256) return "evidence hash changed";
    let payload;
    try { payload = JSON.parse(data.toString("utf8")); } catch { return "evidence is not JSON"; }
    if (!evidenceSupportsGate(id, payload, binding)) return `evidence is not bound to gate '${id}' and the active Story/Epic`;
    if (id === "independent-review" && payload.reviewedCommit !== entry.evidence.sourceCommit) return "reviewed commit does not match evidence source commit";
    if (id === "github" && payload.headRefOid !== entry.evidence.sourceCommit) return "GitHub head SHA does not match evidence source commit";
  } catch { return "evidence file is missing"; }
  if (entry.evidence.sourceCommit) {
    const result = spawnSync("git", ["merge-base", "--is-ancestor", entry.evidence.sourceCommit, "HEAD"], { cwd: root });
    if (result.status !== 0) return "evidence commit is not an ancestor of HEAD";
  }
  if (entry.evidence.inputFingerprint && Array.isArray(entry.evidence.inputPaths)) {
    if (entry.evidence.inputFingerprint !== await fingerprintPaths(root, entry.evidence.inputPaths)) return "gate inputs changed since evidence was recorded";
  } else if (!entry.evidence.workspaceFingerprint || entry.evidence.workspaceFingerprint !== await workspaceFingerprint()) return "workspace changed since evidence was recorded";
  return null;
}

function yamlList(content, key) {
  const inline = content.match(new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]`, "m"));
  if (inline) return inline[1].split(",").map((item) => item.trim().replace(/^['\"]|['\"]$/g, "")).filter(Boolean);
  const block = content.match(new RegExp(`^${key}:\\s*\\r?\\n((?:\\s+-\\s+.*(?:\\r?\\n|$))*)`, "m"));
  return block ? [...block[1].matchAll(/^\s+-\s+(.+)$/gm)].map((match) => match[1].trim().replace(/^['\"]|['\"]$/g, "")) : [];
}
function yamlScalar(content, key, fallback = "") {
  const match = content.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  return match ? match[1].trim().replace(/^['"]|['"]$/g, "") : fallback;
}

async function verifyApprovedContract(file, expectedId, format) {
  const data = await fs.readFile(file);
  const approval = await readJson(`${file}.sha256.json`, null);
  const relative = path.relative(controlRoot, file).split(path.sep).join("/");
  const hash = createHash("sha256").update(data).digest("hex");
  if (!approval || approval.contract !== relative || approval.sha256 !== hash) throw new Error(`Contract is missing approval or changed: ${relative}`);
  if (format === "json") {
    const contract = JSON.parse(data.toString("utf8"));
    if (String(contract.id) !== String(expectedId) || contract.status !== "approved") throw new Error(`Epic Contract is not approved: ${relative}`);
    return { contract, hash };
  }
  const content = data.toString("utf8");
  if (!new RegExp(`^id:\\s*[\"']?${String(expectedId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\"']?\\s*$`, "m").test(content) || !/^status:\s*approved\s*$/m.test(content)) throw new Error(`Story Contract is not approved: ${relative}`);
  return {
    contract: {
      id: expectedId,
      epicId: yamlScalar(content, "epicId"),
      dependencies: yamlList(content, "dependencies"),
      testObligations: yamlList(content, "testObligations")
    },
    hash
  };
}

async function scopeContracts(epics, stories) {
  const allStories = new Set(stories);
  const allEpics = new Set(epics);
  const storyToEpic = {};
  const epicObligations = {};
  const storyObligations = {};
  const contractHashes = { epics: {}, stories: {} };
  const epicContracts = new Map();
  async function loadEpic(epic) {
    if (epicContracts.has(epic)) return epicContracts.get(epic);
    const file = controlPath(context, "spec", "epics", `${epic}.json`);
    const approved = await verifyApprovedContract(file, epic, "json");
    const contract = approved.contract;
    epicContracts.set(epic, contract);
    contractHashes.epics[epic] = approved.hash;
    if (!Array.isArray(contract.stories) || !contract.stories.length) throw new Error(`Epic Contract ${epic} must list approved Stories.`);
    contract.stories.forEach((story) => {
      const id = String(story);
      if (storyToEpic[id] && storyToEpic[id] !== epic) throw new Error(`Story ${id} belongs to more than one selected Epic.`);
      storyToEpic[id] = epic;
    });
    epicObligations[epic] = [...new Set((contract.testObligations || []).map(String))];
    return contract;
  }
  for (const epic of epics) {
    const contract = await loadEpic(epic);
    contract.stories.forEach((story) => allStories.add(String(story)));
  }
  for (const story of allStories) {
    if (!/^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/.test(story)) throw new Error(`Unsafe Story ID in contract: ${story}`);
    const file = controlPath(context, "spec", "stories", `${story}.yaml`);
    const approved = await verifyApprovedContract(file, story, "yaml");
    contractHashes.stories[story] = approved.hash;
    storyObligations[story] = [...new Set((approved.contract.testObligations || []).map(String))];
    const epicId = String(approved.contract.epicId || storyToEpic[story] || "");
    if (!epicId) throw new Error(`Story Contract ${story} must declare epicId.`);
    if (storyToEpic[story] && storyToEpic[story] !== epicId) throw new Error(`Story ${story} epicId '${epicId}' conflicts with selected Epic '${storyToEpic[story]}'.`);
    const epicContract = await loadEpic(epicId);
    if (!epicContract.stories.map(String).includes(story)) throw new Error(`Epic Contract ${epicId} does not include Story ${story}.`);
    storyToEpic[story] = epicId;
    allEpics.add(epicId);
  }
  return { epics: [...allEpics], stories: [...allStories], storyToEpic, epicObligations, storyObligations, contractHashes };
}

function hashesChanged(started, current) {
  return JSON.stringify(started || {}) !== JSON.stringify(current || {});
}

function flag(name, fallback = undefined) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : true;
}

async function transition(nextPhase, status = "active", details = {}) {
  const state = await loadState();
  if (state.status === "needs-review") throw new Error("Repair limit reached. Record independent review with `failure-clear` before continuing.");
  if (!(transitions[state.phase] || []).includes(nextPhase)) throw new Error(`Invalid Geki transition: ${state.phase} -> ${nextPhase}`);
  const previous = state.phase;
  Object.assign(state, details, { phase: nextPhase, status, updatedAt: new Date().toISOString() });
  await writeJson(stateFile, state);
  await appendEvent("PHASE_TRANSITIONED", { from: previous, to: nextPhase, status });
  return state;
}

if (command === "status") {
  console.log(JSON.stringify(await loadState(), null, 2));
} else if (command === "transition") {
  const next = args[0];
  if (!next) throw new Error("Usage: state.mjs transition <phase> [status]");
  console.log(JSON.stringify(await transition(next, args[1] || "active"), null, 2));
} else if (command === "start") {
  const epicsInput = flag("epics", "");
  const storiesInput = flag("stories", "");
  if (epicsInput === true || storiesInput === true) throw new Error("Scope flags require explicit values.");
  const epics = String(epicsInput).split(",").map((item) => item.trim()).filter(Boolean);
  const stories = String(storiesInput).split(",").map((item) => item.trim()).filter(Boolean);
  for (const id of [...epics, ...stories]) if (!/^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/.test(id)) throw new Error(`Unsafe scope ID: ${id}`);
  const obligationsInput = flag("obligations", "");
  if (obligationsInput === true) throw new Error("--obligations requires comma-separated gate IDs.");
  const requestedObligations = String(obligationsInput).split(",").map((item) => item.trim()).filter(Boolean);
  if (!epics.length && !stories.length) throw new Error("Explicit scope required: --epics 1,2 or --stories 1.1,1.2");
  const architectureData = await fs.readFile(architectureFile);
  const architecture = JSON.parse(architectureData.toString("utf8"));
  if (architecture.status !== "approved") throw new Error("Architecture is not approved; run the planning/readiness workflow first.");
  const state = await loadState();
  if (state.phase !== "ready") throw new Error(`Execution can start only from ready; current phase is ${state.phase}.`);
  const contracts = await scopeContracts(epics, stories);
  const preflightEvidence = await preflightMetadata(flag("preflight"), contracts.stories);
  const specificationValidation = spawnSync(process.execPath, [path.join(runtimeDirectory, "spec-validator.mjs"), "--stories", contracts.stories.join(",")], { cwd: root, encoding: "utf8" });
  if (specificationValidation.status !== 0) throw new Error(`Static specification validation failed before execution:\n${specificationValidation.stdout || specificationValidation.stderr}`);
  const deliverySlice = await readJson(controlPath(context, "planning", "delivery-slice.json"), null);
  if (deliverySlice?.status === "approved") {
    const approvedStories = new Set((deliverySlice.storyIds || []).map(String));
    const outside = contracts.stories.filter((story) => !approvedStories.has(story));
    if (outside.length) throw new Error(`Execution scope is outside the approved current delivery slice: ${outside.join(", ")}`);
  }
  const firstStory = contracts.stories[0] || null;
  const epicBranches = ensureEpicBranches(contracts.epics);
  const storyObligations = Object.fromEntries(contracts.stories.map((story) => [story, [...new Set([...(contracts.storyObligations[story] || []), ...requestedObligations])]]));
  const started = await transition("executing", "running", {
    scope: { epics, stories: contracts.stories },
    integrationEpics: contracts.epics,
    currentEpic: contracts.storyToEpic[firstStory] || contracts.epics[0] || null,
    currentStory: firstStory,
    currentGate: "story-contract",
    architectureHash: createHash("sha256").update(architectureData).digest("hex"),
    gatePolicyHash: createHash("sha256").update(await fs.readFile(gatesFile)).digest("hex"),
    contractHashes: contracts.contractHashes,
    storyToEpic: contracts.storyToEpic,
    storyObligations,
    epicObligations: contracts.epicObligations,
    storyGates: Object.fromEntries(contracts.stories.map((story) => [story, {}])),
    epicGates: Object.fromEntries(contracts.epics.map((epic) => [epic, {}])),
    storyStatus: Object.fromEntries(contracts.stories.map((story) => [story, story === firstStory ? "active" : "pending"])),
    epicStatus: Object.fromEntries(contracts.epics.map((epic) => [epic, "pending"])),
    epicBranches,
    epicBranchMode: Object.fromEntries(contracts.epics.map((epic) => [epic, "auto"])),
    storyVerification: {},
    storyIntegration: {},
    storyRepairAttempts: Object.fromEntries(contracts.stories.map((story) => [story, {}])),
    preflightEvidence,
    pendingReview: null,
    impactedGates: [],
    failure: null
  });
  await appendEvent("EXECUTION_STARTED", { scope: started.scope, explicit: true });
  console.log(JSON.stringify(started, null, 2));
} else if (command === "failure") {
  const signature = flag("signature");
  if (!signature || signature === true) throw new Error("A stable --signature is required.");
  const state = await loadState();
  if (state.status === "needs-review") {
    console.error(`Repair is locked after signature '${state.failure?.signature}'. Independent review is required before any further repair.`);
    process.exitCode = 2;
  } else {
    const story = state.currentStory;
    if (!story) throw new Error("Failure repair requires an active Story.");
    state.storyRepairAttempts ||= {};
    state.storyRepairAttempts[story] ||= {};
    const previous = state.storyRepairAttempts[story][signature] || 0;
    if (previous >= 3) {
      console.error(`Repair limit already reached for '${signature}'. Independent review is required.`);
      process.exitCode = 2;
    } else {
      const count = previous + 1;
      state.storyRepairAttempts[story][signature] = count;
      state.failure = { story, signature, attempt: count, summary: flag("summary", null), at: new Date().toISOString() };
      state.status = count >= 3 ? "needs-review" : "repairing";
      state.updatedAt = new Date().toISOString();
      await writeJson(stateFile, state);
      await appendEvent("GATE_FAILED", { failure: state.failure });
      if (count >= 3) {
        await appendEvent("REPAIR_LIMIT_REACHED", { signature, attempts: count });
        process.exitCode = 2;
      }
      console.log(JSON.stringify(state.failure, null, 2));
    }
  }
} else if (command === "failure-clear") {
  const signature = flag("signature");
  if (!signature || signature === true) throw new Error("--signature is required.");
  const state = await loadState();
  const story = state.currentStory;
  if (state.status !== "needs-review" || state.failure?.story !== story || state.failure?.signature !== signature || (state.storyRepairAttempts?.[story]?.[signature] || 0) < 3) throw new Error("failure-clear must match the locked failure signature and Story.");
  const reviewPath = flag("evidence");
  const reviewFile = path.resolve(controlRoot, reviewPath === true ? "" : reviewPath || "");
  const reviewPayload = await readJson(reviewFile, null);
  const currentCommit = git(["rev-parse", "HEAD"]);
  if (reviewPayload?.kind !== "repair-review" || reviewPayload?.outcome !== "passed" || reviewPayload?.signature !== signature || Number(reviewPayload?.unresolvedHighCritical || 0) !== 0 || !reviewPayload?.reviewerContextId || !reviewPayload?.approvedStrategy || reviewPayload?.reviewedCommit !== currentCommit) {
    throw new Error("failure-clear requires independent repair-review JSON for the same signature with no unresolved high/critical findings.");
  }
  const review = await evidenceMetadata(reviewPath);
  state.storyRepairAttempts[story][signature] = 0;
  state.failure = null;
  state.status = "running";
  state.updatedAt = new Date().toISOString();
  await writeJson(stateFile, state);
  await appendEvent("REPAIR_LIMIT_CLEARED", { signature, review });
  console.log(JSON.stringify({ signature, cleared: true, review }, null, 2));
} else if (command === "review-result") {
  const state = await loadState();
  const story = String(flag("story", state.currentStory) || "");
  if (!story || !state.scope?.stories?.includes(story)) throw new Error("review-result requires --story in the active scope.");
  const reviewPath = flag("evidence");
  const reviewFile = path.resolve(controlRoot, reviewPath === true ? "" : reviewPath || "");
  const payload = await readJson(reviewFile, null);
  const currentCommit = git(["rev-parse", "HEAD"]);
  if (payload?.kind !== "independent-review" || payload?.storyId !== story || !payload?.reviewerContextId || payload?.reviewedCommit !== currentCommit) {
    throw new Error("review-result requires independent-review JSON for the active Story and current commit.");
  }
  const reviewRealFile = await fs.realpath(reviewFile);
  const reviewRelative = path.relative(realControlRoot, reviewRealFile).split(path.sep).join("/");
  if (!reviewRelative.startsWith(".geki/evidence/review/")) throw new Error("Independent review evidence must be stored under .geki/evidence/review.");
  if (payload.outcome === "passed") {
    if (Number(payload.unresolvedHighCritical || 0) !== 0) throw new Error("A passing review cannot contain unresolved high/critical findings.");
    const evidence = await evidenceMetadata(reviewPath, "independent-review", { story });
    state.storyGates ||= {};
    state.storyGates[story] ||= {};
    state.storyGates[story]["independent-review"] = { outcome: "passed", evidence, at: new Date().toISOString() };
    state.status = "running";
    state.currentGate = "independent-review";
    state.pendingReview = null;
    state.impactedGates = [];
    state.failure = null;
    state.updatedAt = new Date().toISOString();
    await writeJson(stateFile, state);
    await appendEvent("INDEPENDENT_REVIEW_PASSED", { story, evidence });
    console.log(JSON.stringify({ story, outcome: "passed" }, null, 2));
  } else if (payload.outcome === "failed") {
    const findings = Array.isArray(payload.findings) ? payload.findings : [];
    if (!findings.length || findings.some((finding) => !finding.id)) throw new Error("A failed review requires findings with stable IDs.");
    const findingIds = [...new Set(findings.map((finding) => String(finding.id)))].sort();
    const impactedGates = [...new Set(findings.flatMap((finding) => finding.affectedGates || []))].sort();
    const stopReasons = [...new Set(findings.map((finding) => finding.stopReason).filter(Boolean))];
    const actionable = findings.every((finding) => finding.actionable === true && !finding.requiresUserDecision);
    const allowedStops = new Set(["product-intent", "scope", "credential", "cost", "destructive", "safety", "architecture"]);
    if (stopReasons.some((reason) => !allowedStops.has(reason))) throw new Error(`Unsupported review stopReason: ${stopReasons.join(", ")}`);
    const signature = `review:${findingIds.join("+")}`;
    state.storyRepairAttempts ||= {};
    state.storyRepairAttempts[story] ||= {};
    const count = (state.storyRepairAttempts[story][signature] || 0) + 1;
    state.storyRepairAttempts[story][signature] = count;
    const reviewEvidence = await evidenceMetadata(reviewPath);
    state.pendingReview = { story, findingIds, impactedGates, signature, evidence: reviewEvidence, reviewedCommit: currentCommit };
    state.impactedGates = impactedGates;
    state.failure = { story, signature, attempt: count, summary: `${findings.length} independent review finding(s)`, at: new Date().toISOString() };
    if (!actionable || stopReasons.length) {
      state.phase = "waiting-clarification";
      state.status = "user-decision-required";
      state.pendingClarification = { story, findingIds, stopReasons };
      await appendEvent("REVIEW_REQUIRES_USER_DECISION", { story, findingIds, stopReasons });
    } else if (count >= 3) {
      state.status = "needs-review";
      await appendEvent("REPAIR_LIMIT_REACHED", { story, signature, attempts: count });
    } else {
      state.status = "repairing";
      state.currentGate = "repair";
      await appendEvent("AUTONOMOUS_REPAIR_STARTED", { story, findingIds, impactedGates, attempt: count });
    }
    state.updatedAt = new Date().toISOString();
    await writeJson(stateFile, state);
    console.log(JSON.stringify({ story, outcome: "failed", action: state.status, findingIds, impactedGates, attempt: count }, null, 2));
    if (state.status === "needs-review") process.exitCode = 2;
  } else throw new Error("review-result outcome must be passed or failed.");
} else if (command === "repair-complete") {
  const state = await loadState();
  const story = String(flag("story", state.currentStory) || "");
  if (!story || state.status !== "repairing" || state.pendingReview?.story !== story) throw new Error("repair-complete requires an autonomously repairing Story.");
  const idsInput = flag("findings");
  const ids = String(idsInput === true ? "" : idsInput || "").split(",").map((item) => item.trim()).filter(Boolean).sort();
  if (JSON.stringify(ids) !== JSON.stringify([...(state.pendingReview.findingIds || [])].sort())) throw new Error("repair-complete must name every pending finding ID exactly.");
  const commit = String(flag("commit", "") || "");
  const currentCommit = git(["rev-parse", "HEAD"]);
  if (!commit || git(["rev-parse", `${commit}^{commit}`]) !== currentCommit) throw new Error("repair-complete requires --commit equal to the current implementation commit.");
  if (currentCommit === state.pendingReview.reviewedCommit) throw new Error("repair-complete requires a new implementation commit after the failed review.");
  state.status = "running";
  state.currentGate = state.impactedGates?.[0] || "independent-review";
  state.failure = null;
  state.updatedAt = new Date().toISOString();
  await writeJson(stateFile, state);
  await appendEvent("AUTONOMOUS_REPAIR_COMPLETED", { story, findingIds: ids, impactedGates: state.impactedGates, commit: currentCommit });
  console.log(JSON.stringify({ story, reRunGates: state.impactedGates, reReviewFindings: ids }, null, 2));
} else if (command === "gate") {
  const id = flag("id");
  const outcome = flag("outcome");
  if (!id || !["passed", "failed", "skipped"].includes(outcome)) throw new Error("Usage: gate --id <gate> --outcome passed|failed|skipped [--evidence path]");
  const state = await loadState();
  const level = flag("level", id === "github" ? "epic" : "story");
  if (!['story', 'epic'].includes(level)) throw new Error("--level must be story or epic.");
  const binding = level === "story" ? { story: String(flag("story", state.currentStory) || "") } : { epic: String(flag("epic", state.currentEpic) || "") };
  if (level === "story" && (!binding.story || !state.scope?.stories?.includes(binding.story))) throw new Error("Gate requires a Story in the active scope.");
  if (level === "epic" && (!binding.epic || !(state.integrationEpics || state.scope?.epics || []).includes(binding.epic))) throw new Error("Gate requires an Epic in the active integration context.");
  const evidence = outcome === "passed" ? await evidenceMetadata(flag("evidence"), id, binding) : null;
  const collection = level === "story" ? (state.storyGates ||= {}) : (state.epicGates ||= {});
  const scopeId = binding.story || binding.epic;
  collection[scopeId] ||= {};
  collection[scopeId][id] = { outcome, evidence, summary: flag("summary", null), at: new Date().toISOString() };
  state.currentGate = id;
  state.updatedAt = new Date().toISOString();
  await writeJson(stateFile, state);
  await appendEvent("GATE_RECORDED", { gate: id, level, ...binding, outcome, evidence });
} else if (command === "advance") {
  const story = flag("story");
  if (!story || story === true) throw new Error("advance requires --story <id>.");
  const state = await loadState();
  if (state.phase !== "executing" || !state.scope?.stories?.includes(story)) throw new Error(`Story '${story}' is not in the active execution scope.`);
  const requiredStatus = state.storyToEpic?.[state.currentStory] ? "integrated" : "verified";
  if (state.currentStory && state.storyStatus?.[state.currentStory] !== requiredStatus) throw new Error(`Current Story '${state.currentStory}' must be ${requiredStatus} before advance.`);
  const contracts = await scopeContracts(state.scope?.epics || [], state.scope?.stories || []);
  if (hashesChanged(state.contractHashes, contracts.contractHashes)) throw new Error("Active contracts changed after execution start; reopen spec and start a new run.");
  state.currentStory = story;
  state.currentEpic = state.storyToEpic?.[story] || state.currentEpic;
  state.storyStatus ||= {};
  state.storyStatus[story] = "active";
  state.currentGate = "story-contract";
  state.failure = null;
  state.updatedAt = new Date().toISOString();
  await writeJson(stateFile, state);
  await appendEvent("STORY_ACTIVATED", { story });
  console.log(JSON.stringify({ story, active: true }, null, 2));
} else if (command === "bind-epic") {
  const state = await loadState();
  const epic = String(flag("epic") || "");
  const branch = String(flag("branch") || "");
  if (!epic || !(state.integrationEpics || state.scope?.epics || []).includes(epic) || !branch) throw new Error("bind-epic requires --epic <id> --branch <integration-branch> in the active integration context.");
  if (["main", "coding"].includes(branch)) throw new Error("An Epic integration branch cannot be main or coding.");
  const resolvedBranch = git(["rev-parse", "--verify", branch]);
  if (!resolvedBranch) throw new Error(`Epic integration branch '${branch}' does not exist.`);
  state.epicBranches ||= {};
  if (state.epicBranches[epic] && state.epicBranches[epic] !== branch) {
    const integrated = Object.values(state.storyIntegration || {}).some((entry) => entry?.epic === epic);
    if (integrated || state.epicBranchMode?.[epic] !== "auto") throw new Error(`Epic '${epic}' is already bound to '${state.epicBranches[epic]}'.`);
  }
  state.epicBranches[epic] = branch;
  state.epicBranchMode ||= {};
  state.epicBranchMode[epic] = "explicit";
  state.updatedAt = new Date().toISOString();
  await writeJson(stateFile, state);
  await appendEvent("EPIC_BRANCH_BOUND", { epic, branch, head: resolvedBranch });
  console.log(JSON.stringify({ epic, branch, head: resolvedBranch }, null, 2));
} else if (command === "integrate") {
  const state = await loadState();
  const story = String(flag("story", state.currentStory) || "");
  const commit = flag("commit");
  if (!story || !state.scope?.stories?.includes(story)) throw new Error("integrate requires --story in the active scope.");
  if (!commit || commit === true) throw new Error("integrate requires the verified Story --commit <sha>.");
  if (state.storyStatus?.[story] !== "verified") throw new Error(`Story '${story}' must pass Story verification before integration.`);
  const epic = state.storyToEpic?.[story];
  if (!epic) throw new Error(`Story '${story}' is not attached to an Epic; Epic integration proof is not applicable.`);
  const integrationBranch = state.epicBranches?.[epic];
  if (!integrationBranch) throw new Error(`Epic '${epic}' has no bound integration branch. Run bind-epic first.`);
  const verification = state.storyVerification?.[story];
  if (!verification?.verifiedCommit) throw new Error(`Story '${story}' has no exact verified commit.`);
  const exactCommit = git(["rev-parse", `${commit}^{commit}`]);
  const integrationHead = git(["rev-parse", "HEAD"]);
  if (!exactCommit || !integrationHead) throw new Error("Integration proof requires a Git repository and valid commits.");
  if (exactCommit !== verification.verifiedCommit) throw new Error(`Integration commit must equal Story '${story}' verified commit '${verification.verifiedCommit}'.`);
  const currentBranch = git(["branch", "--show-current"]);
  if (currentBranch !== integrationBranch) throw new Error(`Integration proof must run on bound Epic branch '${integrationBranch}', not '${currentBranch || "detached HEAD"}'.`);
  if (verification.verifiedBranch === integrationBranch) throw new Error("Story verification and Epic integration must occur on different branches.");
  const merged = spawnSync("git", ["merge-base", "--is-ancestor", exactCommit, integrationHead], { cwd: root });
  if (merged.status !== 0) throw new Error(`Verified Story commit '${exactCommit}' is not integrated into HEAD '${integrationHead}'.`);
  state.storyStatus[story] = "integrated";
  state.storyIntegration ||= {};
  state.storyIntegration[story] = { epic, storyCommit: exactCommit, storyBranch: verification.verifiedBranch, integrationBranch, integrationHead, at: new Date().toISOString() };
  state.updatedAt = new Date().toISOString();
  await writeJson(stateFile, state);
  await appendEvent("STORY_INTEGRATED", { story, ...state.storyIntegration[story] });
  console.log(JSON.stringify(state.storyIntegration[story], null, 2));
} else if (command === "verify") {
  const state = await loadState();
  const policy = await readJson(gatesFile, { requiredEvidence: [] });
  const contracts = await scopeContracts(state.scope?.epics || [], state.scope?.stories || []);
  const architectureHash = createHash("sha256").update(await fs.readFile(architectureFile)).digest("hex");
  const gatePolicyHash = createHash("sha256").update(await fs.readFile(gatesFile)).digest("hex");
  if (state.architectureHash !== architectureHash || state.gatePolicyHash !== gatePolicyHash || hashesChanged(state.contractHashes, contracts.contractHashes)) {
    state.phase = "spec-reopened";
    state.status = "contract-changed";
    state.updatedAt = new Date().toISOString();
    await writeJson(stateFile, state);
    await appendEvent("SPEC_REOPENED", { reason: "execution-input-hash-changed" });
    throw new Error("Architecture, gate policy, or active Epic/Story Contract changed after execution start; evidence is invalidated and spec review must reopen.");
  }
  const epic = flag("epic", null);
  const story = flag("story", epic ? null : state.currentStory);
  if (epic) {
    if (!(state.integrationEpics || state.scope?.epics || []).includes(epic)) throw new Error(`Epic '${epic}' is not in the active integration context.`);
    const epicStories = contracts.stories.filter((id) => contracts.storyToEpic[id] === epic);
    const incomplete = epicStories.filter((id) => state.storyStatus?.[id] !== "integrated");
    if (incomplete.length) throw new Error(`Epic '${epic}' cannot verify until Stories are verified and integrated: ${incomplete.join(", ")}`);
    const required = [...new Set([...(contracts.epicObligations[epic] || []), "github"])];
    const invalid = [];
    for (const id of required) {
      const entry = state.epicGates?.[epic]?.[id];
      if (entry?.outcome !== "passed") invalid.push(`${id}: not passed`);
      else {
        const problem = await validateEvidence(id, entry, { epic });
        if (problem) invalid.push(`${id}: ${problem}`);
      }
    }
    if (invalid.length) {
      console.error(`Invalid required Epic evidence:\n${invalid.join("\n")}`);
      process.exitCode = 1;
    } else {
      state.epicStatus[epic] = "verified";
      state.updatedAt = new Date().toISOString();
      await writeJson(stateFile, state);
      await appendEvent("EPIC_VERIFIED", { epic, gates: required });
      console.log(`Epic ${epic} evidence is recorded as passed.`);
    }
    process.exit(process.exitCode || 0);
  }
  if (!story || !state.scope?.stories?.includes(story)) throw new Error("Story verification requires an active scoped Story.");
  const required = [...new Set([...(policy.requiredEvidence || []), ...(state.storyObligations?.[story] || [])])].filter((id) => id !== "github");
  const invalid = [];
  for (const id of required) {
    const entry = state.storyGates?.[story]?.[id];
    if (entry?.outcome !== "passed") invalid.push(`${id}: not passed`);
    else {
      const problem = await validateEvidence(id, entry, { story });
      if (problem) invalid.push(`${id}: ${problem}`);
    }
  }
  if (invalid.length) {
    console.error(`Invalid required evidence:\n${invalid.join("\n")}`);
    process.exitCode = 1;
  } else {
    state.storyStatus[story] = "verified";
    const verifiedCommit = git(["rev-parse", "HEAD"]);
    const verifiedBranch = git(["branch", "--show-current"]);
    if (!verifiedCommit || !verifiedBranch) throw new Error("Story verification requires a named Git branch and exact commit.");
    state.storyVerification ||= {};
    state.storyVerification[story] = { verifiedCommit, verifiedBranch, at: new Date().toISOString() };
    state.updatedAt = new Date().toISOString();
    await writeJson(stateFile, state);
    await appendEvent("STORY_VERIFIED", { story, gates: required, ...state.storyVerification[story] });
    console.log(`Story ${story} evidence is recorded as passed.`);
  }
} else if (command === "event") {
  const type = args[0];
  if (!type) throw new Error("Usage: state.mjs event <TYPE> [JSON]");
  const payload = args[1] ? JSON.parse(args[1]) : {};
  console.log(JSON.stringify(await appendEvent(type, payload), null, 2));
} else {
  throw new Error(`Unknown state command: ${command}`);
}
