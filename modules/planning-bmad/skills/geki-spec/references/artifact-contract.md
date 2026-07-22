# Planning artifacts

Maintain only artifacts justified by project complexity:

```text
_bmad-output/
  product-brief.md
  brd.md                     when business processes warrant it
  prd.md
  DESIGN.md                  when UI exists
  EXPERIENCE.md              when user flows matter
  architecture.md
  epics/epic-<id>.md
  stories/story-<id>.md
```

Every artifact includes status, source decisions, open questions, and links to upstream/downstream artifacts. Business content may be Vietnamese; schema keys, IDs, APIs, filenames, and code identifiers remain English.

Each Story Contract must include: stable ID, goal, dependencies, acceptance criteria, forbidden scope, architecture constraints, affected surfaces, expected tests, required gates, and source artifact hashes.
