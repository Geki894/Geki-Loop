---
name: geki-help
description: Inspect durable Geki state and explain the current phase, blockers, and safest next action. Use whenever the user is lost, asks what to do next, resumes a project, or invokes geki-help; never rely on chat memory alone.
---

# Geki Help

1. Read `.geki/config.json`, `.geki/state/current-run.json`, `.geki/architecture.json`, `.geki/lock.json`, and `.geki/handoff/current.yaml` when present.
2. Reconcile them with the current Git branch, working tree, and latest commit. Report disagreement instead of guessing.
3. Read only the current artifact or Story Contract needed to explain the next action.
4. State: current phase, completed milestone, active scope, blocker, and exactly one recommended next command/skill.
5. Never mutate files, start coding, create branches, or invoke `geki-run` on behalf of the user.

Follow [references/phase-map.md](references/phase-map.md) for phase-specific guidance.
