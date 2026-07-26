# Geki Architecture

## Boundaries

Geki has three layers:

1. **Installer/runtime:** deterministic Node.js code for files, state, module resolution, checkpoints, gates, and dashboard.
2. **Skills:** concise agent workflows installed into `.agents/skills` with references loaded progressively.
3. **Project artifacts:** `_bmad-output` and `.geki` contracts that survive model, session, and harness changes.

The agent reasons and writes application code. The runtime never pretends that a command passed or a requirement was met; it records evidence supplied by actual commands and GitHub checks.

## Two-stage provisioning

`geki install` installs only bootstrap modules. For an existing repository it may recommend detected profiles. After Architecture is approved, `geki-readiness` prepares an architecture contract and prompts `geki sync` to reconcile execution modules. The user confirms the module diff once.

## Installed layout

```text
.agents/skills/                 Canonical skills for Codex and Antigravity
.agents/rules/geki.md           Antigravity bootstrap rule
.agents/workflows/              Antigravity slash workflows
.geki/config.json               User/project policy
.geki/lock.json                 Installed module versions and hashes
.geki/manifest.json             Geki-owned files and backups
.geki/architecture.json         Machine-readable approved architecture
.geki/state/planning.json       Durable planning profile, stage, artifacts, and review checkpoints
.geki/state/current-run.json    Durable execution state
.geki/state/events.jsonl        Append-only event stream
.geki/planning/decisions.json   Stable cross-artifact decision ledger
.geki/planning/delivery-slice.json  Current, next, and future delivery boundary
.geki/findings/registry.json    Deduplicated review findings and closure history
.geki/handoff/current.yaml      Cross-agent checkpoint summary
.geki/runtime/                  Dependency-free deterministic runtime
.geki/review/                   Hash-bound clean-context review packets
.geki/evidence/                 Command, review, and GitHub proof
_bmad-output/                   Human-readable planning artifacts
```

## State invariants

- Planning depth follows a confirmed delivery profile; the profile never weakens execution gates.
- Only current-delivery Stories receive canonical contracts; next/future capabilities remain unelaborated.
- Static contract and graph validation passes before semantic review and readiness.
- Planning review has one baseline and one delta closure; round three requires an unresolved critical/high finding.
- Planning cannot transition directly to executing.
- Readiness must pass before provisioning execution modules.
- Only explicit `geki-run` intent may create an execution run.
- Story completion requires every configured gate and independent review. Gate evidence and repair attempts are namespaced by Story.
- A Story may advance only after its verified commit is proven to be integrated into the Epic branch.
- Epic completion additionally requires every scoped Story to be integrated, non-empty passing GitHub required checks, a matching auto-merge request, exact head SHA, and merge into `coding`.
- A material spec change invalidates affected artifacts and returns to readiness.
- A failure signature may be repaired at most three times.

## Module model

Modules are composable capabilities, not architecture decisions. Presets only preselect modules and remain editable. The approved architecture is authoritative; existing repository conventions win over greenfield defaults.

## Cross-agent review

Codex uses an independent subagent when available. A harness without subagents produces a hash-bound packet and requires a clean session. Planning artifacts resume through `geki-spec-review current`; implementations resume through `geki-review current`. Planning packets bind the artifact hash, checkpoint, fixed lens, review round, mode, and prior finding IDs. Implementation packets bind the current Architecture, Story Contract, state, diff base, and evidence hashes rather than trusting the author's summary.

## Adaptive planning

`course-demo`, `startup-mvp`, `institutional-production`, and `custom` profiles select an artifact policy and soft delivery guardrail. They do not select frameworks or databases. Product and UX documents may be unified for small scopes; production scopes may split them when ownership, compliance, or operational complexity justifies the split.

Story/Epic YAML/JSON is canonical only for the selected execution slice. Human Product, UX, and Architecture documents remain Markdown. The decision ledger prevents repeated business-rule prose from becoming independent sources of truth.

## Git flow

Story work occurs on isolated branches/worktrees. Story results integrate into an Epic branch. The Epic branch opens a pull request into protected `coding`, requests auto-merge, and waits for required checks. `coding -> main` remains a human-reviewed release pull request.

## Architecture contract

Database selection records `engine`, `hosting`, `orm`, `driver`, and `migrationTool` independently. For example, .NET 8 + EF Core + PostgreSQL in Docker uses `engine: postgresql`, `hosting: docker`, and `driver: npgsql`; Supabase changes hosting/platform capabilities, not the .NET runtime. Contradictory or unknown enum combinations fail closed during sync.

## Evidence model

A gate cannot be marked passed without a project-local evidence file. Geki records its SHA-256, Story/Epic binding, workspace fingerprint, and source Git commit, then verifies the file remains unchanged and that its source commit is still an ancestor of HEAD. The run captures exact approved Architecture, gate-policy, Epic, and Story hashes; changing or re-approving these inputs reopens specification instead of preserving stale evidence. Conditional Story obligations include Playwright or migrations. GitHub proof is mandatory at Epic level, waits for non-empty required checks, and verifies auto-merge request, PR base, head SHA, and merged state.
