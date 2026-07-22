# Contributing to Geki Loop

Geki is Windows-first and supports Codex and Google Antigravity in v0.1.0. Contributions should preserve the invariant that planning is interactive and autonomous coding begins only after an explicit scoped `geki-run`.

## Add a module or harness

1. Add a versioned `modules/<id>/module.json` with explicit dependencies and detection/architecture signals.
2. Put focused Agent Skills under `modules/<id>/skills/<skill>/SKILL.md`; keep details in references and validate every skill.
3. Add project-local adapter files only—never write to a user's global profile.
4. Add a fixture and evaluation case that proves discovery, path conventions, state continuity, and refusal behavior.
5. Add installer integration coverage for install, update, rollback, and uninstall with user-modified file preservation.
6. Pin reviewed upstream revisions and licenses in `third-party-lock.json`; do not resolve floating versions during execution.

Run `npm run ci` before opening a pull request. New harnesses are unsupported until their fixtures and behavioral evaluations pass.
