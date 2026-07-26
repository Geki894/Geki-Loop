# Delivery lanes and just-in-time contracts

Maintain three horizons:

- `current-delivery`: explicitly approved outcomes intended for the next run.
- `next`: likely follow-up capabilities without implementation contracts.
- `future`: institutional hardening, experiments, or ideas kept at capability/title level.

Only `current-delivery` becomes executable Stories. Elaborate and approve 1–3 Story Contracts at a time. A larger batch is allowed only when the Stories are small, share a stable decision horizon, and the user explicitly selected the larger scope.

The current delivery slice lives at `.geki/planning/delivery-slice.json`. Its `storyIds` must reference approved canonical Story YAML files under `.geki/spec/stories/`. Epic execution contracts list only current-delivery Stories; `next` and `future` capabilities never appear as required Epic completion work.

Before elaboration:

1. Confirm the delivery outcome and deadline.
2. Select the smallest vertical Stories that visibly prove that outcome.
3. Keep cross-cutting setup inside a vertical Story unless it independently delivers testable value.
4. Move optional hardening to `future-hardening.md`.

Before approving each batch:

1. Run `node .geki/runtime/spec-validator.mjs`.
2. Review only the selected delivery slice and its upstream deltas.
3. Approve each Story Contract hash.
4. Run readiness for the selected IDs.

Prefer `geki-run --stories <ids>` for JIT batches. Do not materialize contracts for the full backlog merely so a future Epic can be reviewed.
