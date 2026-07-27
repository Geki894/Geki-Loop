---
name: geki-verify
description: Prove Story or Epic completion from fresh command, review, API, Playwright, migration, and GitHub evidence. Use before marking work complete, integrating a Story, or auto-merging an Epic PR into coding.
---

# Geki Verify

1. Read the active Story/Epic contract and `.geki/gates.json`.
2. Map every acceptance criterion to direct evidence.
3. Run `node .geki/runtime/run-gates.mjs`. After repair, use `--ids <affected-gates>`; unchanged passing inputs are cacheable.
4. Confirm independent review has no unresolved critical/high finding.
5. Require database migration evidence when schema changed and Playwright evidence when UI behavior changed.
6. Record command gates only from JSON reports produced by `run-gates.mjs` under `.geki/evidence/gates`; reports and independent review must identify the active Story. GitHub evidence is recorded separately against its Epic. Then run `node .geki/runtime/state.mjs verify --story <id>`; it stores and validates the exact verified commit/branch, gate binding, hashes, reviewed commit, workspace fingerprint, and contract hashes captured when the run started. After merging that exact commit from the Story branch into the bound Epic branch, use `state.mjs integrate --story <id> --commit <verified-sha>`. Do not create assertion-only evidence or fill gaps with assumptions.
7. For Epic completion, additionally verify the pull request targets `coding`, required GitHub Actions passed, auto-merge completed, and a `coding -> main` release PR remains human-controlled.

Use `node .geki/runtime/github.mjs verify-epic --epic <id> --pr <number-or-url> --head-sha <verified-sha>` for required checks plus merged/base/SHA proof, then `state.mjs verify --epic <id>` only after all its Stories are verified. A release PR may be opened with `release-pr`, but that command intentionally cannot auto-merge it.

Missing, stale, skipped without justification, or indirect evidence means incomplete. Metadata-only `.geki` changes do not invalidate application gate evidence.
