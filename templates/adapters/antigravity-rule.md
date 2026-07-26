# Geki project rule

Treat `.geki/state/planning.json`, `.geki/state/current-run.json`, `.geki/planning/delivery-slice.json`, `.geki/architecture.json`, `_bmad-output`, and the active Story Contract as authoritative. Use the matching `geki-*` skill before acting. Never start autonomous implementation unless the user explicitly invokes `geki-run` with a scope.

When a material architecture gap appears during coding, stop implementation, record a finding, and route through `geki-correct-course`. Do not invent Repository, Unit of Work, Mediator, CQRS, or other abstractions without approved evidence.
