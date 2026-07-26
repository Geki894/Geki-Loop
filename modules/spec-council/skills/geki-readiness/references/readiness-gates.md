# Readiness gates

- Stable product goal and out-of-scope boundary.
- Confirmed delivery profile and approved current delivery slice.
- Acceptance criteria are observable and testable.
- UX states exist where a UI is in scope.
- Architecture decisions support the requirements and NFRs.
- REST contracts, authorization, data ownership, transaction, and failure behavior are defined where applicable.
- Epic/Story dependencies form a valid graph and parallel candidates do not share unsafe write surfaces.
- Migration and rollback/forward-fix strategy exists for data changes.
- Required local and GitHub gates can be executed with known commands.
- `.geki/gates.json` maps required evidence IDs to real repository commands; conditional migration, Playwright, sandbox API, and email obligations are explicit.
- No unresolved high/critical Spec Council finding remains.
- Story Contracts link to current source artifact hashes.
- Static spec validation passes for the selected slice.
- `next` and `future` capabilities are not materialized as current execution contracts.
