# Adaptive planning profiles

Profiles control planning depth, not technology or execution quality. Infer one from project evidence, explain the recommendation, and require one confirmation. Do not ask the user to select frameworks, authentication, ORM, or deployment during intake.

## Profiles

| Profile | Use when | Default artifacts | Scope guardrail |
| --- | --- | --- | --- |
| `course-demo` | Coursework, prototype, hackathon, or a days-long deadline | `PRODUCT-SPEC.md`, optional `UX-SPEC.md`, Architecture, delivery slice | Warn above 12 current-delivery Stories |
| `startup-mvp` | A real MVP with a small team and evolving market evidence | Product brief + PRD, `UX-SPEC.md` when UI exists, Architecture, delivery slice | Warn above 20 current-delivery Stories |
| `institutional-production` | Multiple stakeholders, compliance, revenue, sensitive data, complex operations, or production SLOs | Split business/product/experience/design artifacts only where justified | Risk-based, no numeric Story default |
| `custom` | Evidence does not fit a preset | Explicitly record the chosen artifact and review policy | User-approved |

Numeric Story limits are warnings, never architecture laws. If a current scope exceeds a guardrail, propose a smaller delivery slice and require explicit scope confirmation; do not silently discard requirements.

## Invariants across profiles

- Keep product goal, primary user, observable outcome, current out-of-scope boundary, and acceptance signals explicit.
- Keep authorization, data ownership/integrity, failure semantics, migration safety, privacy/security, and executable testing proportional to actual risk.
- Separate `required now` from `future hardening`; do not turn future hardening into current Stories.
- Preserve the same build, test, independent review, Playwright/API obligations, and GitHub checks when those surfaces exist.
- Reclassify the profile when deadline, stakeholders, compliance, payment, data sensitivity, or operating expectations materially change.
