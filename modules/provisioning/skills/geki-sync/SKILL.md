---
name: geki-sync
description: Reconcile project-local Geki modules with an approved architecture after readiness or an architecture change. Use automatically after readiness passes, when architecture.json changes, or when geki-help reports module drift.
---

# Geki Sync

1. Require `.geki/architecture.json` status `approved`.
2. Run `node .geki/distribution/bin/geki.js sync` from the project root.
3. Explain the proposed module diff in terms of architecture evidence, not user expertise.
4. Let the user toggle modules and confirm once. Never silently add or remove modules.
5. Preserve modified files, snapshot overwritten files, and record exact module versions in `.geki/lock.json`.
6. Run `node .geki/distribution/bin/geki.js doctor` afterward.
7. If Architecture changed, revalidate affected Story Contracts before execution.

Presets only preselect composable capabilities. They never lock ORM, database, authentication, or architectural style.
