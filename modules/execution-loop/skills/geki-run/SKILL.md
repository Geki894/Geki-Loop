---
name: geki-run
description: Start and drive the autonomous engineering loop for an explicit Epic or Story scope after planning, readiness, and module sync. Use only when the user deliberately invokes geki-run with scopes such as epic 1 or epic 1,2,3.
---

# Geki Run

Never infer consent or scope. Require the user's explicit Epic/Story list. A direct Story remains a single-Story run: runtime reads its `epicId`, validates membership, and creates its Epic integration context without adding sibling Stories. First run `node .geki/runtime/execution-preflight.mjs --stories <resolved-ids> --apply`, then pass its report to `state.mjs start --epics <ids> --preflight <report>` or `--stories <ids> --preflight <report>`. Preflight consolidates module sync, lockfile install, Architecture/toolchain compatibility, contract compilation, Git/remote/GitHub auth, doctor, and shared-state writability.

Read [references/execution-loop.md](references/execution-loop.md) completely. For each Story:

1. Verify its contract hash and dependencies with `node .geki/runtime/contracts.mjs verify <story-contract>`.
2. Create an isolated Story branch/worktree from the current Epic integration branch.
3. Select only the coding/profile skills required by approved Architecture.
4. Implement in vertical slices with targeted tests.
5. Run cheap gates before expensive gates. Reuse cached passing gates only when their command, policy, and actual input paths are unchanged.
6. Obtain independent spec-compliance review, then code-quality/security review.
7. Run real API/database tests and Playwright when UI behavior exists.
8. Feed review JSON to `state.mjs review-result`. For actionable findings, continue automatically through repair, `repair-complete`, impacted gates, and delta re-review. Do not pause merely to report a repairable failure.
9. Checkpoint stable progress and create a handoff packet before switching agents.
10. Integrate passing Stories into the Epic branch; run Epic regression; open an Epic PR to `coding`; request auto-merge and wait for required GitHub checks.

Runtime creates a safe default `geki/epic-<id>` integration branch from `coding` (or HEAD). Override it only with an existing branch through `state.mjs bind-epic`. Work on a different Story branch/worktree. State, evidence, and handoff commands resolve the shared Git common directory automatically. Verify the Story, merge that exact commit into its Epic branch, prove it with `state.mjs integrate`, then advance.

For a clean reviewer context, run `node .geki/runtime/review-packet.mjs --story <id> --base <ref>`. For an Epic delivery, run `node .geki/runtime/github.mjs epic-pr --head <branch> --title <title>`, then `verify-epic --epic <id> --pr <url> --head-sha <verified-sha>`. Record that file with `state.mjs gate --level epic --epic <id> --id github --outcome passed --evidence <file>`. The verifier waits for required checks, proves the base/head and merged state, and binds proof to the Epic. Do not report completion earlier.

Never auto-merge `coding` into `main` and never make Render/Vercel deployment an Epic completion gate.

Pause for the user only when scope/product intent must change, a credential or new cost is required, an operation is destructive/safety-sensitive, or the same stable failure reaches three attempts. Architecture gaps reopen planning instead of being patched by coding inference. Never run `npm audit fix --force`; record unfixable upstream advisories as bounded risk and fail only actionable high/critical dependency findings.
