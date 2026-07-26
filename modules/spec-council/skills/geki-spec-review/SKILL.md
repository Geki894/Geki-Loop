---
name: geki-spec-review
description: Pressure-test a planning artifact with independent, risk-selected reviewers and structured findings. Use after material BRD, PRD, UX, Architecture, Epic, or Story changes and before implementation readiness.
---

# Geki Spec Review

Read [references/review-routing.md](references/review-routing.md). Select only lenses that can materially change the artifact.

1. Run `node .geki/runtime/spec-validator.mjs` first. Resolve deterministic errors before spending an LLM review.
2. Review only a Product/UX package, Architecture, or selected delivery-slice checkpoint. Give each reviewer fresh artifact context without the author's reasoning or desired conclusion.
3. Freeze the checkpoint rubric and selected lenses for the baseline round. Require concrete omissions, contradictions, feasibility risks, or edge cases with evidence.
4. Use one integrator to deduplicate findings and record stable IDs through `node .geki/runtime/findings.mjs record`. Use severity `critical`, `high`, `medium`, or `low` and disposition `open`, `closed`, `deferred`, or `rejected`.
5. Apply only high-confidence improvements that do not change product intent. Group all unresolved user decisions into one numbered batch of 3–7 questions.
6. Allow one baseline round and one delta closure round. The delta round checks prior finding IDs, changed surfaces, and direct regressions only; it must not introduce a new rubric. Allow round three only when round two still has open critical/high findings.
7. Record Medium/Low findings instead of silently ignoring them. Defer them when they do not block the current delivery profile or acceptance outcome.
8. Persist checkpoint results with `node .geki/runtime/planning.mjs review`.

The canonical finding registry is `.geki/findings/registry.json`. Never create free-floating finding files or claim zero risk merely because no issue was found.

Create a baseline packet with `node .geki/runtime/spec-review-packet.mjs --artifact <path> --lens <lens> --checkpoint <id> --round 1 --mode baseline`. Use `--round 2 --mode delta` for closure. If the harness cannot dispatch an independent reviewer, stop and require a new session invoking `geki-spec-review current` with that exact packet path. The reviewer must first run `spec-review-packet.mjs verify <packet>` and refuse stale/invalid hashes. Never route a planning artifact through the implementation-only `geki-review` skill.
