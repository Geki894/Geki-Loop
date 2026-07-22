#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const stateFile = path.join(root, ".geki", "state", "current-run.json");
const eventsFile = path.join(root, ".geki", "state", "events.jsonl");
const architectureFile = path.join(root, ".geki", "architecture.json");
const gatesFile = path.join(root, ".geki", "gates.json");
const args = process.argv.slice(2);
const command = args.shift() || "status";
const realRoot = await fs.realpath(root);

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
  const file = path.resolve(root, input);
  const relative = path.relative(root, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Evidence must be inside the project.");
  const relativeUnix = relative.split(path.sep).join("/");
  if (expectedGate) {
    const prefix = expectedGate === "github" ? ".geki/evidence/github/" : expectedGate === "independent-review" ? ".geki/evidence/review/" : ".geki/evidence/gates/";
    if (!relativeUnix.startsWith(prefix)) throw new Error(`Evidence for '${expectedGate}' must be written under ${prefix}`);
  }
  const realFile = await fs.realpath(file);
  const realRelative = path.relative(realRoot, realFile);
  if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) throw new Error("Evidence escapes the real project boundary.");
  const data = await fs.readFile(realFile);
  let payload;
  try { payload = JSON.parse(data.toString("utf8")); } catch { throw new Error("Evidence must be JSON."); }
  if (expectedGate && !evidenceSupportsGate(expectedGate, payload, binding)) throw new Error(`Evidence does not contain a passing result for gate '${expectedGate}' in the active Story/Epic.`);
  const sourceCommit = git(["rev-parse", "HEAD"]);
  if (expectedGate === "independent-review" && payload.reviewedCommit !== sourceCommit) throw new Error("Independent review must target the current implementation commit.");
  if (expectedGate === "github" && payload.headRefOid !== sourceCommit) throw new Error("GitHub Epic evidence must target the current verified commit.");
  return {
    path: relativeUnix,
    sha256: createHash("sha256").update(data).digest("hex"),
    bytes: data.length,
    sourceCommit,
    workspaceFingerprint: await workspaceFingerprint(),
    kind: payload.kind || "gate-report"
  };
}

async function validateEvidence(id, entry, binding) {
  if (!entry?.evidence?.path || !entry.evidence.sha256) return "missing evidence metadata";
  try {
    const data = await fs.readFile(path.join(root, entry.evidence.path));
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
  if (!entry.evidence.workspaceFingerprint || entry.evidence.workspaceFingerprint !== await workspaceFingerprint()) return "workspace changed since evidence was recorded";
  return null;
}

function yamlList(content, key) {
  const inline = content.match(new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]`, "m"));
  if (inline) return inline[1].split(",").map((item) => item.trim().replace(/^['\"]|['\"]$/g, "")).filter(Boolean);
  const block = content.match(new RegExp(`^${key}:\\s*\\r?\\n((?:\\s+-\\s+.*(?:\\r?\\n|$))*)`, "m"));
  return block ? [...block[1].matchAll(/^\s+-\s+(.+)$/gm)].map((match) => match[1].trim().replace(/^['\"]|['\"]$/g, "")) : [];
}

async function verifyApprovedContract(file, expectedId, format) {
  const data = await fs.readFile(file);
  const approval = await readJson(`${file}.sha256.json`, null);
  const relative = path.relative(root, file).split(path.sep).join("/");
  const hash = createHash("sha256").update(data).digest("hex");
  if (!approval || approval.contract !== relative || approval.sha256 !== hash) throw new Error(`Contract is missing approval or changed: ${relative}`);
  if (format === "json") {
    const contract = JSON.parse(data.toString("utf8"));
    if (String(contract.id) !== String(expectedId) || contract.status !== "approved") throw new Error(`Epic Contract is not approved: ${relative}`);
    return { contract, hash };
  }
  const content = data.toString("utf8");
  if (!new RegExp(`^id:\\s*[\"']?${String(expectedId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\"']?\\s*$`, "m").test(content) || !/^status:\s*approved\s*$/m.test(content)) throw new Error(`Story Contract is not approved: ${relative}`);
  return { contract: { id: expectedId, testObligations: yamlList(content, "testObligations") }, hash };
}

async function scopeContracts(epics, stories) {
  const allStories = new Set(stories);
  const storyToEpic = {};
  const epicObligations = {};
  const storyObligations = {};
  const contractHashes = { epics: {}, stories: {} };
  for (const epic of epics) {
    const file = path.join(root, ".geki", "spec", "epics", `${epic}.json`);
    const approved = await verifyApprovedContract(file, epic, "json");
    const contract = approved.contract;
    contractHashes.epics[epic] = approved.hash;
    if (!Array.isArray(contract.stories) || !contract.stories.length) throw new Error(`Epic Contract ${epic} must list approved Stories.`);
    contract.stories.forEach((story) => {
      const id = String(story);
      if (storyToEpic[id] && storyToEpic[id] !== epic) throw new Error(`Story ${id} belongs to more than one selected Epic.`);
      storyToEpic[id] = epic;
      allStories.add(id);
    });
    epicObligations[epic] = [...new Set((contract.testObligations || []).map(String))];
  }
  for (const story of allStories) {
    if (!/^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/.test(story)) throw new Error(`Unsafe Story ID in contract: ${story}`);
    const file = path.join(root, ".geki", "spec", "stories", `${story}.yaml`);
    const approved = await verifyApprovedContract(file, story, "yaml");
    contractHashes.stories[story] = approved.hash;
    storyObligations[story] = [...new Set((approved.contract.testObligations || []).map(String))];
  }
  return { stories: [...allStories], storyToEpic, epicObligations, storyObligations, contractHashes };
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
  const firstStory = contracts.stories[0] || null;
  const storyObligations = Object.fromEntries(contracts.stories.map((story) => [story, [...new Set([...(contracts.storyObligations[story] || []), ...requestedObligations])]]));
  const started = await transition("executing", "running", {
    scope: { epics, stories: contracts.stories },
    currentEpic: contracts.storyToEpic[firstStory] || epics[0] || null,
    currentStory: firstStory,
    currentGate: "story-contract",
    architectureHash: createHash("sha256").update(architectureData).digest("hex"),
    gatePolicyHash: createHash("sha256").update(await fs.readFile(gatesFile)).digest("hex"),
    contractHashes: contracts.contractHashes,
    storyToEpic: contracts.storyToEpic,
    storyObligations,
    epicObligations: contracts.epicObligations,
    storyGates: Object.fromEntries(contracts.stories.map((story) => [story, {}])),
    epicGates: Object.fromEntries(epics.map((epic) => [epic, {}])),
    storyStatus: Object.fromEntries(contracts.stories.map((story) => [story, story === firstStory ? "active" : "pending"])),
    epicStatus: Object.fromEntries(epics.map((epic) => [epic, "pending"])),
    epicBranches: {},
    storyVerification: {},
    storyIntegration: {},
    storyRepairAttempts: Object.fromEntries(contracts.stories.map((story) => [story, {}])),
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
  const reviewFile = path.resolve(root, reviewPath === true ? "" : reviewPath || "");
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
} else if (command === "gate") {
  const id = flag("id");
  const outcome = flag("outcome");
  if (!id || !["passed", "failed", "skipped"].includes(outcome)) throw new Error("Usage: gate --id <gate> --outcome passed|failed|skipped [--evidence path]");
  const state = await loadState();
  const level = flag("level", id === "github" ? "epic" : "story");
  if (!['story', 'epic'].includes(level)) throw new Error("--level must be story or epic.");
  const binding = level === "story" ? { story: String(flag("story", state.currentStory) || "") } : { epic: String(flag("epic", state.currentEpic) || "") };
  if (level === "story" && (!binding.story || !state.scope?.stories?.includes(binding.story))) throw new Error("Gate requires a Story in the active scope.");
  if (level === "epic" && (!binding.epic || !state.scope?.epics?.includes(binding.epic))) throw new Error("Gate requires an Epic in the active scope.");
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
  if (!epic || !state.scope?.epics?.includes(epic) || !branch) throw new Error("bind-epic requires --epic <id> --branch <integration-branch> in the active scope.");
  if (["main", "coding"].includes(branch)) throw new Error("An Epic integration branch cannot be main or coding.");
  const currentBranch = git(["branch", "--show-current"]);
  const resolvedBranch = git(["rev-parse", "--verify", branch]);
  if (!currentBranch || currentBranch !== branch || !resolvedBranch) throw new Error(`Check out existing Epic integration branch '${branch}' before binding it.`);
  state.epicBranches ||= {};
  if (state.epicBranches[epic] && state.epicBranches[epic] !== branch) throw new Error(`Epic '${epic}' is already bound to '${state.epicBranches[epic]}'.`);
  state.epicBranches[epic] = branch;
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
    if (!state.scope?.epics?.includes(epic)) throw new Error(`Epic '${epic}' is not in the active scope.`);
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
