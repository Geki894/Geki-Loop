#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const root = process.cwd();
const stateFile = path.join(root, ".geki", "state", "planning.json");
const decisionsFile = path.join(root, ".geki", "planning", "decisions.json");
const eventsFile = path.join(root, ".geki", "state", "events.jsonl");
const args = process.argv.slice(2);
const command = args.shift() || "status";

const profiles = {
  "course-demo": {
    documentMode: "unified",
    uxMode: "unified",
    reviewMaxRounds: 2,
    storyContractBatchSize: 3,
    recommendedCurrentStories: 12,
    productionHardeningRequired: false
  },
  "startup-mvp": {
    documentMode: "streamlined",
    uxMode: "unified",
    reviewMaxRounds: 2,
    storyContractBatchSize: 3,
    recommendedCurrentStories: 20,
    productionHardeningRequired: false
  },
  "institutional-production": {
    documentMode: "full",
    uxMode: "full",
    reviewMaxRounds: 2,
    storyContractBatchSize: 3,
    recommendedCurrentStories: null,
    productionHardeningRequired: true
  },
  custom: {
    documentMode: "adaptive",
    uxMode: "adaptive",
    reviewMaxRounds: 2,
    storyContractBatchSize: 3,
    recommendedCurrentStories: null,
    productionHardeningRequired: null
  }
};

const stages = new Set([
  "intake",
  "discovery",
  "product-spec",
  "ux-spec",
  "architecture",
  "architecture-review",
  "delivery-scope",
  "story-elaboration",
  "readiness",
  "complete"
]);
const artifactStatuses = new Set(["draft", "in-review", "approved", "needs-revalidation", "deferred"]);
const decisionStatuses = new Set(["confirmed", "defaulted", "deferred", "superseded"]);

function flag(name, fallback = undefined) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const next = args[index + 1];
  return next && !next.startsWith("--") ? next : true;
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, file);
}

async function event(type, payload = {}) {
  await fs.mkdir(path.dirname(eventsFile), { recursive: true });
  await fs.appendFile(eventsFile, `${JSON.stringify({ id: randomUUID(), type, at: new Date().toISOString(), ...payload })}\n`, "utf8");
}

async function state() {
  const value = await readJson(stateFile, null);
  if (!value) throw new Error("Planning state is missing. Update or install Geki 0.2.0 first.");
  return value;
}

function positiveInteger(value, label) {
  if (value === undefined) return null;
  if (value === true || !/^\d+$/.test(String(value)) || Number(value) < 1) throw new Error(`${label} must be a positive integer.`);
  return Number(value);
}

if (command === "status") {
  console.log(JSON.stringify(await state(), null, 2));
} else if (command === "profile") {
  const id = args[0];
  if (!profiles[id]) throw new Error(`Profile must be one of: ${Object.keys(profiles).join(", ")}`);
  const current = await state();
  const now = new Date().toISOString();
  current.profile = {
    id,
    rationale: flag("rationale", null),
    deadlineDays: positiveInteger(flag("deadline-days"), "--deadline-days"),
    teamSize: positiveInteger(flag("team-size"), "--team-size"),
    selectedAt: now
  };
  current.policy = { ...profiles[id] };
  current.stage = current.stage === "intake" ? "discovery" : current.stage;
  current.status = "active";
  current.nextAction = "Continue batched discovery under the confirmed delivery profile.";
  current.updatedAt = now;
  await writeJsonAtomic(stateFile, current);
  await event("PLANNING_PROFILE_CONFIRMED", { profile: current.profile, policy: current.policy });
  console.log(JSON.stringify(current.profile, null, 2));
} else if (command === "stage") {
  const next = args[0];
  if (!stages.has(next)) throw new Error(`Unknown planning stage: ${next || "(missing)"}`);
  const current = await state();
  current.stage = next;
  current.status = String(flag("status", next === "complete" ? "complete" : "active"));
  current.nextAction = flag("next", current.nextAction);
  current.updatedAt = new Date().toISOString();
  await writeJsonAtomic(stateFile, current);
  await event("PLANNING_STAGE_CHANGED", { stage: next, status: current.status, nextAction: current.nextAction });
  console.log(JSON.stringify({ stage: current.stage, status: current.status, nextAction: current.nextAction }, null, 2));
} else if (command === "artifact") {
  const id = String(flag("id", ""));
  const status = String(flag("status", ""));
  if (!/^[a-z][a-zA-Z0-9-]{1,63}$/.test(id)) throw new Error("--id must be a stable lower-camel or kebab identifier.");
  if (!artifactStatuses.has(status)) throw new Error(`--status must be one of: ${[...artifactStatuses].join(", ")}`);
  const current = await state();
  current.artifacts ||= {};
  current.artifacts[id] = {
    path: flag("path", current.artifacts[id]?.path || null),
    status,
    sha256: flag("sha256", current.artifacts[id]?.sha256 || null),
    updatedAt: new Date().toISOString()
  };
  current.updatedAt = new Date().toISOString();
  await writeJsonAtomic(stateFile, current);
  await event("PLANNING_ARTIFACT_UPDATED", { id, ...current.artifacts[id] });
  console.log(JSON.stringify({ id, ...current.artifacts[id] }, null, 2));
} else if (command === "decision") {
  const id = String(flag("id", ""));
  const status = String(flag("status", ""));
  const summary = flag("summary");
  if (!/^[A-Z][A-Z0-9_-]{1,63}$/.test(id)) throw new Error("--id must be a stable uppercase decision ID.");
  if (!decisionStatuses.has(status)) throw new Error(`--status must be one of: ${[...decisionStatuses].join(", ")}`);
  if (!summary || summary === true) throw new Error("--summary is required.");
  const ledger = await readJson(decisionsFile, { schemaVersion: 1, decisions: [] });
  const now = new Date().toISOString();
  const existing = ledger.decisions.find((item) => item.id === id);
  const next = {
    id,
    status,
    summary: String(summary),
    rationale: flag("rationale", existing?.rationale || null),
    source: flag("source", existing?.source || null),
    affectedArtifacts: String(flag("affects", "")).split(",").map((item) => item.trim()).filter(Boolean),
    updatedAt: now
  };
  if (existing) Object.assign(existing, next); else ledger.decisions.push({ ...next, createdAt: now });
  await writeJsonAtomic(decisionsFile, ledger);
  const current = await state();
  const pending = new Set(current.pendingDecisions || []);
  if (status === "deferred") pending.add(id); else pending.delete(id);
  current.pendingDecisions = [...pending].sort();
  current.updatedAt = now;
  await writeJsonAtomic(stateFile, current);
  await event("PLANNING_DECISION_RECORDED", { id, status, source: next.source });
  console.log(JSON.stringify(next, null, 2));
} else if (command === "review") {
  const checkpoint = String(flag("checkpoint", ""));
  const round = positiveInteger(flag("round"), "--round");
  const outcome = String(flag("outcome", ""));
  if (!/^[a-z0-9-]{2,64}$/.test(checkpoint)) throw new Error("--checkpoint is required and must use lowercase kebab-case.");
  if (!round || round > 3) throw new Error("--round must be 1, 2, or 3.");
  if (!["pass", "changes-required", "concerns"].includes(outcome)) throw new Error("--outcome must be pass, changes-required, or concerns.");
  const current = await state();
  const previous = current.reviewCheckpoints?.[checkpoint];
  const openCritical = Number(flag("open-critical", 0));
  const openHigh = Number(flag("open-high", 0));
  if (round === 1 && previous) throw new Error("This checkpoint already has a baseline review; use delta round two or a new checkpoint ID for materially new scope.");
  if (round > 1 && Number(previous?.round || 0) !== round - 1) throw new Error(`Review round ${round} requires recorded round ${round - 1} for the same checkpoint.`);
  if (round > Number(current.policy?.reviewMaxRounds || 2) && !(previous && Number(previous.openCritical || 0) + Number(previous.openHigh || 0) > 0)) {
    throw new Error("Round three is allowed only when the previous round still had critical/high findings.");
  }
  current.reviewCheckpoints ||= {};
  current.reviewCheckpoints[checkpoint] = {
    round,
    outcome,
    openCritical,
    openHigh,
    artifactHash: flag("artifact-hash", null),
    updatedAt: new Date().toISOString()
  };
  current.updatedAt = new Date().toISOString();
  await writeJsonAtomic(stateFile, current);
  await event("SPEC_REVIEW_RECORDED", { checkpoint, ...current.reviewCheckpoints[checkpoint] });
  console.log(JSON.stringify({ checkpoint, ...current.reviewCheckpoints[checkpoint] }, null, 2));
} else {
  throw new Error("Usage: planning.mjs status|profile|stage|artifact|decision|review");
}
