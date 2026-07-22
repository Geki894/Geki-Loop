---
name: geki-review
description: Review an implementation independently from the author for specification compliance, code quality, architecture, data integrity, security, and test strength. Use as a mandatory Story gate or from a clean fallback session via geki-review current.
---

# Geki Review

Do not read the author's reasoning. Read only the approved Story Contract, relevant Architecture/ADR, the diff, and test evidence.

Perform two ordered passes:

1. **Spec compliance:** verify each acceptance criterion, forbidden scope, contract, and required behavior.
2. **Engineering quality:** inspect correctness, maintainability, framework conventions, data/security risks, error paths, and whether tests prove behavior rather than implementation details.

Write findings with severity, file/location, evidence, impact, and required correction. Reject vague preferences and abstraction-by-fashion. The author cannot approve their own work.

Write machine evidence as JSON. A passing Story review uses `kind: independent-review`, the exact `storyId`, `gate: independent-review`, `outcome: passed`, a distinct `reviewerContextId`, exact `reviewedCommit`, `unresolvedHighCritical: 0`, and findings. A repair-limit review uses `kind: repair-review`, the exact failure `signature`, exact `reviewedCommit`, `outcome: passed`, a distinct reviewer context, no unresolved high/critical finding, and a non-empty `approvedStrategy`. Never turn an arbitrary file into review evidence.

Create the packet with `node .geki/runtime/review-packet.mjs --story <id> --base <ref>`. The independent context must first run `review-packet.mjs verify <packet>` and refuse stale/invalid sources. If the harness cannot create an independent context, require a new session invoking `geki-review current` with that exact packet path. Antigravity must use this clean-context route when it has no subagent facility.
