---
name: geki-readiness
description: Decide whether selected Epics and Stories are safe for autonomous implementation by checking cross-artifact consistency, testability, architecture, dependencies, and unresolved decisions. Use immediately before Geki module sync or any geki-run.
---

# Geki Readiness

Read [references/readiness-gates.md](references/readiness-gates.md) and inspect the selected scope plus every upstream artifact it references.

Return exactly one decision: `PASS`, `CONCERNS`, or `FAIL`.

- `PASS`: no material ambiguity remains; set Architecture status to `approved`, transition state to `ready`, and prepare the module sync proposal.
- `CONCERNS`: implementation may proceed only after explicitly recorded, bounded risks are accepted by the user.
- `FAIL`: route missing or contradictory decisions back through `geki-spec` or `geki-correct-course`.

After `PASS`, invoke `node .geki/distribution/bin/geki.js sync` and let the user confirm the module diff. Do not invoke `geki-run`; show the recommended explicit command instead.

Before `PASS`, populate `.geki/gates.json` with executable commands for every required evidence ID supported by the selected scope. Do not rely on inferred commands when integration/API/migration/Playwright behavior is required. Add conditional gate IDs to the recommended `geki-run --obligations` scope.
