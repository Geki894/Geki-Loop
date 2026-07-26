---
name: geki-dashboard
description: Launch or explain Geki's read-only local dashboard showing planning profile and stage, delivery scope, Epics, Stories, gates, events, pull requests, and GitHub Actions. Use when the user wants progress visibility without controlling the workflow.
---

# Geki Dashboard

Run:

```powershell
node .geki/runtime/dashboard.mjs --port 4178
```

The server binds only to `127.0.0.1`, exposes GET endpoints, reads local state and read-only `gh` results, and never retries, merges, edits state, or controls an agent. If GitHub authentication is unavailable, show local progress and label GitHub state unavailable.
