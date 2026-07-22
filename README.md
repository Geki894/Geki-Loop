# Geki Loop

Geki is a project-local engineering workflow for Codex and Google Antigravity. It keeps planning interactive, turns approved epics into an explicit autonomous execution loop, and requires evidence before completion.

> Status: `0.1.0` is an initial, Windows-first release. Codex and Antigravity are the supported harnesses.

## Install

From the package source or a future npm release:

```powershell
npx geki@latest install
```

Version `0.1.0` is not published to npm. Install the public repository directly:

```powershell
npx github:Geki894/Geki-Loop install
```

For a local package during development:

```powershell
npm pack
npx .\geki-0.1.0.tgz install
```

The installer bootstraps planning capabilities first. Architecture-dependent modules are proposed only after `geki-readiness` passes, then synchronized with `geki-sync` after one user confirmation.

`npx` downloads/runs a package command without requiring a global installation; `npm install` adds a package to a project. Geki uses `npx` for its one-time project-local installer, while the installed skills/runtime remain inside that repository. In the interactive picker, use Arrow keys to move, Space to toggle modules, and Enter to continue.

## Core flow

```text
geki-spec
  -> interactive product, UX, and architecture planning
  -> independent Spec Council review
  -> geki-readiness
  -> automatic sync proposal

geki-run epic 1,2,3
  -> the user explicitly starts the autonomous loop
  -> implementation, build, review, tests, GitHub checks
  -> auto-merge the epic PR into coding
```

Use `geki-help` whenever the next action is unclear. It reads durable state from the repository instead of relying on chat history.

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
- The same failure signature is repaired at most three times.
- Material architecture gaps reopen the specification and invalidate affected downstream artifacts.
- Story evidence, repair attempts, and contract hashes are isolated per Story; an Epic cannot complete until every Story commit is integrated and its required GitHub checks pass.
- Destructive database reset, production deployment, and merge into `main` require explicit user authority.
- No telemetry is collected.

See [README.vi.md](README.vi.md) for the Vietnamese overview and [docs/architecture.md](docs/architecture.md) for the system design.
