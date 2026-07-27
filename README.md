# Geki Loop

Geki is a project-local engineering workflow for Codex and Google Antigravity. It keeps planning interactive, turns approved epics into an explicit autonomous execution loop, and requires evidence before completion.

> Status: `0.3.0` is a Windows-first release. Codex and Antigravity are the supported harnesses.

## Install

From the package source or a future npm release:

```powershell
npx geki@latest install
```

Version `0.3.0` is not published to npm. Install the public repository directly:

```powershell
npx github:Geki894/Geki-Loop install
```

For a local package during development:

```powershell
npm pack
npx .\geki-0.3.0.tgz install
```

The installer bootstraps planning capabilities first. Architecture-dependent modules are proposed only after `geki-readiness` passes, then synchronized with `geki-sync` after one user confirmation.

`npx` downloads/runs a package command without requiring a global installation; `npm install` adds a package to a project. Geki uses `npx` for its one-time project-local installer, while the installed skills/runtime remain inside that repository. In the interactive picker, use Arrow keys to move, Space to toggle modules, and Enter to continue.

## Core flow

```text
geki-spec
  -> confirm course-demo, startup-mvp, institutional-production, or custom profile
  -> batched discovery and an adaptive Product/UX document set
  -> Architecture with required-now and future-hardening boundaries
  -> static validation, one baseline review, and one delta closure
  -> select current delivery and elaborate only the next 1-3 Story Contracts
  -> geki-readiness for the selected slice
  -> automatic sync proposal

geki-run stories 1.1,1.2,1.3
  -> the user explicitly starts the autonomous loop
  -> one consolidated execution preflight
  -> implementation, cached/impacted gates, independent review
  -> automatic repair and delta re-review for actionable findings
  -> real API/Playwright tests and GitHub checks
  -> auto-merge the epic PR into coding
```

Use `geki-help` whenever the next action is unclear. It reads durable state from the repository instead of relying on chat history.

Planning profiles adjust document depth and scope guardrails, not engineering correctness. Course demos avoid enterprise artifact ceremony; production products keep risk-appropriate business, security, reliability, and operational analysis. Build, test, independent review, API/Playwright obligations, and GitHub evidence remain driven by the actual selected surfaces.

Before the first execution run, protect `coding` and `main` in GitHub and make the installed Geki quality workflow a required check. The GitHub CLI (`gh`) must be authenticated for Epic PR automation; `geki doctor` reports this prerequisite after the GitHub module is synchronized.

In Codex chat, invoke skills such as `$geki-help`, `$geki-spec`, and `$geki-run` with an explicit scope. In Antigravity, use `/geki-help` or `/geki-run epic 1,2,3`. These are agent workflows, not terminal commands; terminal `geki` commands install, sync, inspect, or remove the toolkit.

## CLI

```text
geki install       Bootstrap Geki in a project
geki add           Add selected modules
geki sync          Reconcile modules with an approved architecture
geki doctor        Validate installation and local prerequisites
geki status        Print durable workflow state
geki dashboard     Launch the read-only local dashboard
geki rollback      Restore the previous installer snapshot
geki uninstall     Remove only files still owned by Geki
```

## Language policy

Business decisions and user-facing specifications may be Vietnamese. File names, schema keys, state values, APIs, branches, and code identifiers remain English. Geki does not maintain duplicate translated specifications.

## Safety boundaries

- Planning never starts coding automatically.
- `geki-run` requires explicit user invocation.
- A direct Story run automatically validates and binds its Epic integration context without expanding scope.
- Run state and evidence are shared through Git's common directory across linked worktrees.
- Actionable findings continue through autonomous repair; the agent does not pause just to report them.
- The same failure signature is repaired at most three times.
- Passing gates are cached by command, policy, and application inputs; Geki metadata cannot invalidate them.
- Material architecture gaps reopen the specification and invalidate affected downstream artifacts.
- Static validation runs before semantic review; planning review is bounded to a baseline and delta closure, with a third round only for unresolved critical/high findings.
- Full backlogs remain at capability/title level; only the current delivery slice receives executable Story Contracts.
- Story evidence, repair attempts, and contract hashes are isolated per Story; an Epic cannot complete until every Story commit is integrated and its required GitHub checks pass.
- Destructive database reset, production deployment, and merge into `main` require explicit user authority.
- No telemetry is collected.

See [README.vi.md](README.vi.md) for the Vietnamese overview and [docs/architecture.md](docs/architecture.md) for the system design.
