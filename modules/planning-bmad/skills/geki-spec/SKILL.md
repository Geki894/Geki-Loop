---
name: geki-spec
description: Run Geki's interactive BMAD-derived planning workflow to create durable business, product, UX, architecture, Epic, and Story artifacts. Use for greenfield ideas, major brownfield features, or when the user asks to clarify and specify a product before coding.
---

# Geki Spec

Keep the user in the decision loop. Do not create application code, coding branches, or start autonomous execution.

1. Discover the problem, users, outcomes, constraints, and explicit technology preferences. Before asking, infer everything supported by the user's message, existing artifacts, and repository; separate confirmed facts from unresolved decisions. Ask unresolved, related decisions as one numbered question batch using [references/question-batching.md](references/question-batching.md). Product goal, primary user, observable outcome, out-of-scope boundary, and material security/cost constraints are non-delegable; never treat “pick everything” as permission to invent them. Reversible technical defaults may be recommended later with reasons.
2. Create or update artifacts under `_bmad-output/` using [references/artifact-contract.md](references/artifact-contract.md).
3. For brownfield work, inspect the repository and document existing conventions before proposing architecture.
4. After each material artifact, invoke `geki-spec-review` with risk-routed independent lenses. Do not manufacture an artifact merely to trigger review. Automatically integrate high-confidence findings; ask the user only for product, UX, cost, security, or scope decisions.
5. Enter Architecture only after product goal, primary user, outcome, and out-of-scope boundary are stable. Recommend one practical option with reasons and briefly record alternatives. Prefer a modular monolith and framework-native conventions unless requirements prove otherwise.
6. Produce `.geki/architecture.json` plus machine-readable Epic/Story Contracts only after the corresponding human-readable documents stabilize. Epic Contracts list their Story IDs and Epic obligations; Story Contracts list test obligations. After explicit approval, run `node .geki/runtime/contracts.mjs approve <contract>` to create each immutable hash sidecar.
7. Invoke `geki-readiness`. When it passes, prepare an automatic module sync proposal. Still require explicit user confirmation for file changes.
8. End by suggesting the exact `geki-run` scope. Never start it automatically.

Writing and refining planning artifacts is part of the approved interactive workflow and does not require a confirmation for each file. The explicit file-change confirmation in this phase applies to the module diff performed by provisioning. Never invent credentials, recipients, API keys, or pretend configuration exists; record named environment placeholders and ask only when the workflow reaches the integration that needs them.

Do not rewrite an artifact after every individual answer. Wait until the current question batch is answered or explicitly deferred, then apply one coherent update and record the batch decisions together. If the user answers partially, preserve the answers and ask all remaining material items together in one compact follow-up batch. Ask a single question only when its answer determines which other questions are relevant or when an immediate safety decision blocks all further reasoning.

Read [references/architecture-policy.md](references/architecture-policy.md) before Architecture work.
