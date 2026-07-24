# Question batching

Use batches to reduce chat turns and repeated artifact rewrites without overwhelming the user.

## Prepare a batch

1. Read the current user message, upstream artifacts, open questions, findings, and repository evidence.
2. Resolve questions that already have reliable answers. Do not ask the user to repeat known information.
3. Group unresolved decisions by the same planning stage and decision horizon.
4. Remove speculative questions that do not materially affect requirements, UX, architecture, scope, cost, security, or acceptance criteria.

## Ask the batch

- Ask 3–7 related questions in one turn. A smaller batch is valid when fewer material decisions remain.
- Number every question so the user can answer with `1. ...`, `2. ...`.
- State a concise recommendation or default when the decision is reversible and enough evidence exists.
- Offer short options only when they are genuinely distinct; allow free-form answers and `chưa biết` or `để sau`.
- Explain a question only when the consequence is not obvious.
- Do not combine questions whose later options depend on an unanswered earlier decision. Ask the dependency first, then batch the newly relevant questions.
- Do not mix product discovery, detailed UX, and architecture selection in one oversized questionnaire.

Suggested batches:

1. **Discovery:** problem, primary user, desired outcome, scope boundary, hard constraints.
2. **Product and workflow:** roles, main journeys, business rules, failure/edge cases, acceptance signals.
3. **UX:** surfaces, navigation, interaction priorities, accessibility, responsive behavior.
4. **Architecture:** workload and NFRs, integrations, authentication, data constraints, deployment and operational limits.
5. **Delivery:** Epic boundaries, dependencies, release constraints, external test data or sandbox needs.

## Process answers

- Accept answers in any order and preserve partial answers durably.
- If material answers are missing, ask only the remaining items as one compact batch; do not repeat answered questions.
- If an answer creates a contradiction, include all related contradictions in one reconciliation batch.
- Update affected artifacts once after the batch is complete or explicitly deferred.
- Summarize the decisions applied and name the next batch before asking it.
