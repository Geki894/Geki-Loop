---
name: geki-correct-course
description: Reopen approved specifications when implementation exposes a material product or architecture gap, propagate the change, and revalidate downstream artifacts. Use when coding cannot proceed safely without changing contracts, data, security, NFRs, or cross-cutting architecture.
---

# Geki Correct Course

1. Stop implementation and checkpoint the active Story branch.
2. Record a structured finding with evidence, affected artifacts, severity, and the smallest decision needed.
3. Ask the user only when existing artifacts cannot determine the answer safely.
4. Update the authoritative human-readable artifact, ADR, and machine contract together.
5. Run impact analysis over UX, Architecture, Epics, Stories, tests, and installed modules.
6. Mark only affected downstream artifacts and selected JIT contracts `needs-revalidation` through `planning.mjs artifact`; never silently preserve a stale `approved` status or materialize future backlog contracts.
7. Run `spec-validator.mjs`, bounded `geki-spec-review`, `geki-readiness`, and module sync when needed.
8. Resume from the checkpoint only after the revised scope returns to `ready`.

Minor implementation details do not reopen Architecture. Material examples include public contracts, data ownership, authentication/authorization, transaction semantics, NFRs, or major abstractions.
