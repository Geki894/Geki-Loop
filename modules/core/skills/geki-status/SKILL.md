---
name: geki-status
description: Produce an evidence-backed planning and execution status snapshot for a Geki project or run. Use when the user asks for planning stage, delivery scope, current Epic/Story, gate results, repair attempts, GitHub checks, or cross-agent handoff status.
---

# Geki Status

Read planning state, execution state, current delivery slice, finding registry, events, lock, architecture, handoff, Git, and available GitHub status. Do not change them.

Report:

- Delivery profile, planning stage, artifact status, review round, pending decisions, and next action.
- Current delivery slice, open findings by severity, execution phase, and run status.
- Selected Epic/Story scope and current gate.
- Current branch and whether the worktree is clean.
- Passed, failed, and missing evidence.
- Repair attempts grouped by failure signature.
- Pull request and GitHub Actions state when `gh` is available.
- Pending clarification or external blocker.

Distinguish `unknown` from `failed`. Never turn absent evidence into success.
