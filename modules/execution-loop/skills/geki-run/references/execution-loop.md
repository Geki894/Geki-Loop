# Execution loop

## Story states

`ready -> implementing -> local-verification -> independent-review -> [repairing -> impacted-gates -> delta-review]* -> system-verification -> integrated`

Any material product/architecture gap becomes `spec-reopened`. Missing user decisions become `waiting-clarification`. Environment failures become `blocked` only with evidence.

An actionable review finding is not a communication stop. Record stable finding IDs and affected gate IDs, repair automatically, run only those gates, then re-review only the old findings and direct regressions. Stop after the third occurrence of the same stable signature.

## Gate order

1. Scope/diff boundary.
2. Format, lint, compile/type-check.
3. Targeted unit and integration tests.
4. Full build and regression tests.
5. Database migration tests.
6. Independent review and security checks.
7. Real REST API scenarios.
8. Playwright against the real application stack when UI exists.
9. GitHub Actions required checks.

## Change risk routing

- `mechanical`: formatting, wording, generated metadata, or a UI polish change already inside approved acceptance criteria. Run static/affected gates; do not start a new full review round.
- `behavioral`: business behavior, API contract, persistence, migration, or observable state changes. Run the owning contract checks, affected integration/E2E gates, and targeted independent review.
- `architecture-security`: authentication, authorization, secrets, trust boundaries, data ownership, provider topology, or an Architecture decision. Reopen the relevant specification/Architecture checkpoint and invalidate downstream evidence before coding continues.

Batch related changes and review the resulting delta once. Never run a stop-check after each tiny edit.

## Parallel safety

Parallelize only independent graph nodes. Do not parallelize Stories sharing migrations, contracts under active change, authentication middleware, root dependency/config files, or the same write surface. Re-check actual diffs before integration.

## Completion evidence

Every acceptance criterion links to a passing test or an explicit verified artifact. A build exit code, review finding disposition, API report, Playwright trace, and GitHub check conclusion are evidence; an agent statement is not.

Gate cache keys use the command, gate-policy hash, and selected input paths. Geki metadata, reports, handoff files, and generated build output cannot invalidate a gate.
