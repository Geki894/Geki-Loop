# Execution loop

## Story states

`ready -> implementing -> local-verification -> independent-review -> system-verification -> integrated`

Any material product/architecture gap becomes `spec-reopened`. Missing user decisions become `waiting-clarification`. Environment failures become `blocked` only with evidence.

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

## Parallel safety

Parallelize only independent graph nodes. Do not parallelize Stories sharing migrations, contracts under active change, authentication middleware, root dependency/config files, or the same write surface. Re-check actual diffs before integration.

## Completion evidence

Every acceptance criterion links to a passing test or an explicit verified artifact. A build exit code, review finding disposition, API report, Playwright trace, and GitHub check conclusion are evidence; an agent statement is not.
