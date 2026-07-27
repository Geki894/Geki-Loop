---
name: geki-spec
description: Run Geki's interactive BMAD-derived planning workflow to create durable business, product, UX, architecture, Epic, and Story artifacts. Use for greenfield ideas, major brownfield features, or when the user asks to clarify and specify a product before coding.
---

# Geki Spec

Keep the user in the decision loop. Do not create application code, coding branches, or start autonomous execution.

1. Read `.geki/state/planning.json` and existing planning artifacts. Infer a delivery profile from purpose, deadline, team size, risk, and operating context; ask the user to confirm it without asking them to choose architecture or tools. Apply [references/planning-profiles.md](references/planning-profiles.md), then persist it with `node .geki/runtime/planning.mjs profile <id>`.
2. Discover the problem, users, outcomes, constraints, and explicit technology preferences. Infer reliable facts before asking. Ask unresolved related decisions as one numbered question batch using [references/question-batching.md](references/question-batching.md). Record completed decisions with stable IDs through `planning.mjs decision`.
3. Create only the profile-justified artifacts under `_bmad-output/` using [references/artifact-contract.md](references/artifact-contract.md). Update their durable status with `planning.mjs artifact`; update the planning stage when moving between packages.
4. For brownfield work, inspect the repository and document existing conventions before proposing architecture.
5. Review only three checkpoints: Product/UX package, Architecture, and the selected delivery slice. Invoke `geki-spec-review` with risk-routed lenses and its bounded baseline/delta policy. A high-risk payment, authentication, privacy, or migration decision may trigger an earlier targeted review.
6. Enter Architecture only after product goal, primary user, outcome, and out-of-scope boundary are stable. Recommend one practical option with reasons and record alternatives. Preserve baseline authorization, data integrity, failure, migration, and test safety for every profile; move nonessential hardening to `future-hardening.md`. Prefer a modular monolith and framework-native conventions unless requirements prove otherwise. Before approval, run `node .geki/runtime/architecture-check.mjs`; resolve provisioning-module, deployment/free-tier, CI, lockfile, and dependency/peer compatibility errors in the draft.
7. Split work into delivery lanes and elaborate Story Contracts just in time using [references/delivery-policy.md](references/delivery-policy.md). Keep future work at capability/title level. Treat selected Story YAML as canonical; do not create duplicate human Story files unless requested.
8. Run `node .geki/runtime/spec-validator.mjs` and `node .geki/runtime/contract-compiler.mjs --stories <ids>` before semantic review. The compiler fails closed unless ownership, Given/When/Then acceptance, evidence, dependencies, and migration predecessor rules are complete. Produce `.geki/architecture.json`, the current delivery slice, and only the next 1–3 canonical Story Contracts. After explicit approval, run `node .geki/runtime/contracts.mjs approve <contract>` for each selected contract.
9. Invoke `geki-readiness` for only the selected delivery slice. When it passes, prepare an automatic module sync proposal. Still require explicit user confirmation for file changes.
10. End by suggesting the exact `geki-run --stories <ids>` scope. Never start it automatically.

Writing and refining planning artifacts is part of the approved interactive workflow and does not require a confirmation for each file. The explicit file-change confirmation in this phase applies to the module diff performed by provisioning. Never invent credentials, recipients, API keys, or pretend configuration exists; record named environment placeholders and ask only when the workflow reaches the integration that needs them.

Do not rewrite an artifact after every individual answer. Wait until the current question batch is answered or explicitly deferred, then apply one coherent update and record the batch decisions together. If the user answers partially, preserve the answers and ask all remaining material items together in one compact follow-up batch. Ask a single question only when its answer determines which other questions are relevant or when an immediate safety decision blocks all further reasoning.

Read [references/architecture-policy.md](references/architecture-policy.md) before Architecture work.
