---
name: geki-help
description: Inspect durable Geki state and explain the current phase, blockers, and safest next action. Use whenever the user is lost, asks what to do next, resumes a project, or invokes geki-help; never rely on chat memory alone.
---

# Geki Help

1. Resolve Git's common directory, then read the shared `.geki/config.json`, planning/run state, Architecture, lock, and evidence. Read `.geki/handoff/current.yaml` only as a derived view.
2. Reconcile shared state with the current worktree branch, diff, and latest commit. Report disagreement instead of guessing.
3. Read only the current artifact or Story Contract needed to explain the next action.
4. State: delivery profile, current phase/stage, completed milestone, active delivery slice, review round, preflight status, active Story/Epic integration branch, repair/finding IDs, blocker, and exactly one recommended next command/skill.
5. Never mutate files, start coding, create branches, or invoke `geki-run` on behalf of the user.

Follow [references/phase-map.md](references/phase-map.md) for phase-specific guidance.
