---
name: geki-frontend
description: Route and implement approved web UI Stories with surface-appropriate design and production-quality React/web practices. Use for landing pages, portfolios, dashboards, product interfaces, responsive UI, accessibility, performance, and Playwright journeys.
---

# Geki Frontend

Read Architecture, UX/UI artifacts, design tokens, and the Story Contract. Preserve the repository framework and visual language. Do not silently replace an established component system.

## Route by surface

- Landing page or portfolio: apply the curated Taste route for strong visual direction and deliberate composition.
- Dashboard, application, or product UI: apply the curated Impeccable route for information hierarchy, interaction audit, and polish.
- React/Next.js work: apply the pinned Vercel engineering overlay for composition, rendering, accessibility, and performance.
- Mixed surface: choose per route/component and document the split; do not blend incompatible visual systems accidentally.

Pinned upstream inspirations and reviewed versions live in `.geki/distribution/third-party-lock.json`. Geki's wrapper remains authoritative when upstream advice conflicts with approved Architecture or Story scope.

## Definition of done

Implement loading, empty, error, success, validation, permission, and responsive states that apply. Verify keyboard use, labels, focus, contrast, semantic structure, layout stability, and realistic data. Run lint/typecheck/build/unit or component tests, then Playwright for critical user-visible behavior. Prefer stable role/label locators and assert user-observable outcomes; screenshots alone are not proof.

Do not add a new state library, design system, component abstraction, or rendering strategy without demonstrated need and Architecture approval.
