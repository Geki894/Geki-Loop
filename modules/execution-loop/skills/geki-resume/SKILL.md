---
name: geki-resume
description: Resume an interrupted Geki Story or Epic across Codex and Antigravity using durable state, Git, evidence, and a handoff packet. Use after context loss, token exhaustion, a tool switch, or a paused execution run.
---

# Geki Resume

1. Resolve the Git common directory and read shared state/evidence first. Treat `.geki/handoff/current.yaml` as a rendered convenience view, never a second source of truth.
2. Reconcile branch, HEAD, worktree diff, and checkpoint commit. Shared run state plus Git are authoritative when the handoff disagrees.
3. Confirm the approved artifact hashes are still current with `contracts.mjs verify` for the active Story.
4. Re-run the cheapest command that validates the claimed checkpoint.
5. Continue the recorded `next_action`; do not restart the Story or repeat passed expensive gates without cause.
6. If there is no reliable checkpoint, reconstruct from source artifacts and diff, record uncertainty, then create a new checkpoint.

Use `node .geki/runtime/checkpoint.mjs --agent <codex|antigravity>` to refresh handoff state. Add `--commit` only after its secret scan passes and a cross-agent handoff needs a durable WIP commit.

When a committed packet says `checkpoint_commit: SELF`, the containing Git commit is the checkpoint. Verify that `current.yaml` at HEAD matches the working copy before resuming.
