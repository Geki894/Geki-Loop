# Phase map

| Phase | Meaning | Recommended action |
| --- | --- | --- |
| `planning` | Product/spec work remains interactive; use `.geki/state/planning.json.stage` for the exact milestone | Continue `geki-spec` at that stage |
| `spec-review` | Independent reviewers are evaluating artifacts | Continue `geki-spec-review` |
| `readiness` | Cross-artifact gate is running | Resolve findings through `geki-readiness` |
| `ready` | Planning is approved | Confirm module sync, then let the user explicitly invoke `geki-run` |
| `provisioning` | Installed modules are being reconciled | Run `node .geki/distribution/bin/geki.js sync` |
| `executing` | Explicit autonomous scope is active | Continue `geki-resume` if interrupted |
| `waiting-clarification` | A material decision is missing | Ask one focused question, then resume |
| `spec-reopened` | Coding exposed a material spec/architecture gap | Run `geki-correct-course` |
| `verifying` | Completion evidence is being assembled | Run `geki-verify` |
| `blocked` | Environment or external state prevents progress | Explain evidence and required change |
| `complete` | Required evidence and merge conditions passed | Present milestone report |
