---
name: geki-status
description: Produce an evidence-backed status snapshot for a Geki project or run. Use when the user asks for progress, current Epic/Story, gate results, repair attempts, GitHub checks, or cross-agent handoff status.
---

# Geki Status

Read state, events, lock, architecture, handoff, Git, and available GitHub status. Do not change them.

Report:

- Phase and run status.
- Selected Epic/Story scope and current gate.
- Current branch and whether the worktree is clean.
- Passed, failed, and missing evidence.
- Repair attempts grouped by failure signature.
- Pull request and GitHub Actions state when `gh` is available.
- Pending clarification or external blocker.

Distinguish `unknown` from `failed`. Never turn absent evidence into success.
