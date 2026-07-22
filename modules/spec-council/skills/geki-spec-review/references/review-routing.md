# Risk-routed review lenses

- Product/BRD: value, stakeholder, domain rules, scope/YAGNI, feasibility.
- UX: flows, accessibility, responsive behavior, empty/loading/error/permission states, content.
- Architecture: data integrity, security/privacy, reliability, observability, cost, simplicity, testability.
- Epic/Story: acceptance testability, dependency graph, sizing, API/data contract, failure paths, parallel safety.
- Payment/authentication: threat model, abuse, authorization, audit, sandbox behavior.
- Migration/concurrency: rollback/forward-fix, locking, idempotency, races, compatibility.

Use independent subagents when supported. Otherwise run `node .geki/runtime/spec-review-packet.mjs --artifact <path> --lens <lens>` and require a clean session invoking `geki-spec-review current`. Do not use the implementation-only `geki-review` workflow for specifications.
