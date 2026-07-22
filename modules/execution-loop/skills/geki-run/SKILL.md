---
name: geki-run
description: Start and drive the autonomous engineering loop for an explicit Epic or Story scope after planning, readiness, and module sync. Use only when the user deliberately invokes geki-run with scopes such as epic 1 or epic 1,2,3.
---

# Geki Run

Never infer consent or scope. Require the user's explicit Epic/Story list. Runtime verifies approved contract sidecars and derives conditional gates from their `testObligations`; pass only additional obligations with `--obligations`. Run `node .geki/runtime/state.mjs start --epics <ids>` or `--stories <ids>`. Examples are `database-migration`, `playwright`, `sandbox-api`, `email`, and Epic `github` proof.

Read [references/execution-loop.md](references/execution-loop.md) completely. For each Story:

1. Verify its contract hash and dependencies with `node .geki/runtime/contracts.mjs verify <story-contract>`.
2. Create an isolated Story branch/worktree from the current Epic integration branch.
3. Select only the coding/profile skills required by approved Architecture.
4. Implement in vertical slices with targeted tests.
5. Run cheap gates before expensive gates.
6. Obtain independent spec-compliance review, then code-quality/security review.
7. Run real API/database tests and Playwright when UI behavior exists.
8. Repair a stable failure signature at most three times.
9. Checkpoint stable progress and create a handoff packet before switching agents.
10. Integrate passing Stories into the Epic branch; run Epic regression; open an Epic PR to `coding`; request auto-merge and wait for required GitHub checks.

For each selected Epic, create and check out its isolated integration branch, then bind it once with `state.mjs bind-epic --epic <id> --branch <name>`. Work on a different Story branch/worktree. Verify the Story with `state.mjs verify --story <id>`; runtime stores the exact commit and branch. Merge that commit into the bound Epic branch and prove it with `state.mjs integrate --story <id> --commit <verified-sha>` before moving with `state.mjs advance --story <id>`. Evidence and repair attempts are isolated per Story. After every Story in an Epic is integrated, record GitHub evidence at Epic level and run `state.mjs verify --epic <id>`.

For a clean reviewer context, run `node .geki/runtime/review-packet.mjs --story <id> --base <ref>`. For an Epic delivery, run `node .geki/runtime/github.mjs epic-pr --head <branch> --title <title>`, then `verify-epic --epic <id> --pr <url> --head-sha <verified-sha>`. Record that file with `state.mjs gate --level epic --epic <id> --id github --outcome passed --evidence <file>`. The verifier waits for required checks, proves the base/head and merged state, and binds proof to the Epic. Do not report completion earlier.

Never auto-merge `coding` into `main` and never make Render/Vercel deployment an Epic completion gate.

After three failures with the same signature, do not invoke `failure` again or continue by transition. Obtain independent evidence, change the strategy or clarify the spec, then explicitly run `failure-clear --signature <id> --evidence <review-file>` before another attempt.
