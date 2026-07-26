# Planning artifacts

Maintain only artifacts justified by the confirmed delivery profile:

```text
_bmad-output/
  PRODUCT-SPEC.md            unified course-demo product artifact
  product-brief.md           startup/production when separately useful
  brd.md                     multi-stakeholder/compliance/operations only
  prd.md                     startup/production when separately useful
  UX-SPEC.md                 unified UI/experience artifact
  DESIGN.md                  independent design system or designer handoff only
  EXPERIENCE.md              multi-platform or separately owned research only
  architecture.md
  future-hardening.md        deferred architecture/operational work
  epics/epic-<id>.md
  backlog.md                 next/future capability titles
```

Every artifact includes status, source decisions, open questions, and links to upstream/downstream artifacts. Business content may be Vietnamese; schema keys, IDs, APIs, filenames, and code identifiers remain English.

Use `.geki/planning/decisions.json` as the stable decision ledger; reference decision IDs instead of copying the same rule into every artifact.

Canonical Story Contracts live only under `.geki/spec/stories/<id>.yaml`. Each selected Story Contract includes: stable ID, Epic ID, goal, dependencies, requirement ownership, acceptance criteria, forbidden scope, architecture constraints, affected and owned surfaces, parallel-safety claim, data/migration changes, expected tests, produced gates, required environment, open questions, and source artifact `path#sha256` entries. Do not maintain a second hand-edited Story Markdown file.
