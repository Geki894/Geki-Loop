---
name: geki-spec-review
description: Pressure-test a planning artifact with independent, risk-selected reviewers and structured findings. Use after material BRD, PRD, UX, Architecture, Epic, or Story changes and before implementation readiness.
---

# Geki Spec Review

Read [references/review-routing.md](references/review-routing.md). Select only lenses that can materially change the artifact.

1. Give each reviewer fresh artifact context without the author's reasoning or desired conclusion.
2. Require concrete omissions, contradictions, feasibility risks, or edge cases. Reject generic praise.
3. Require evidence and confidence for each finding.
4. Use an integrator separate from reviewers to deduplicate and classify findings as `accepted`, `rejected`, `deferred`, or `needs-user-decision`.
5. Automatically apply only high-confidence improvements that do not change product intent.
6. Deduplicate all `needs-user-decision` findings, group related decisions, and ask them as one numbered batch of 3–7 questions. Include a concise recommendation where evidence supports one. If fewer than three material decisions remain, ask only those; ask a single question only when its answer controls which other questions are relevant.
7. Re-run only affected lenses after revision; stop when remaining findings are low-value or speculative.

Write findings under `.geki/findings/` and never claim zero risk merely because no issue was found.

Create a clean-context packet with `node .geki/runtime/spec-review-packet.mjs --artifact <path> --lens <lens>`. If the harness cannot dispatch an independent reviewer, stop and require a new session invoking `geki-spec-review current` with that exact packet path. The reviewer must first run `spec-review-packet.mjs verify <packet>` and refuse stale/invalid hashes. Never route a planning artifact through the implementation-only `geki-review` skill.
