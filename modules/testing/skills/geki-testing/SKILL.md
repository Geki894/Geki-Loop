---
name: geki-testing
description: Plan and execute evidence-driven tests for Geki Stories across unit, integration, REST API, database, external sandbox, email, and Playwright layers. Use while implementing, repairing, reviewing, or verifying any Story.
---

# Geki Testing

Derive tests from acceptance criteria and risk, not implementation shape. Start with the smallest failing test that proves the intended behavior, implement the slice, then expand to boundary and regression coverage.

## Test ladder

1. Static checks: formatting, lint/analyzers, typecheck, secret scan.
2. Focused unit tests for business rules and failure boundaries.
3. Integration tests against the real selected database/ORM and migrations.
4. REST contract/API tests through the application boundary, including authentication, authorization, validation, idempotency where relevant, and failure responses.
5. Real calls to explicitly configured third-party sandbox services and real test email delivery to the allowlisted `GEKI_TEST_EMAIL`; never invent credentials or recipients.
6. Playwright for critical browser journeys when UI behavior exists. Use role/label locators and API-assisted setup when it reduces UI fragility/token use without bypassing the behavior being tested.
7. Full regression, dependency/security checks, independent review, and GitHub Actions.

Mocks are acceptable for focused fault injection, but cannot replace a required real integration. Use unique run IDs for persistent fixtures and preserve database data by default. Never globally clean a shared/non-disposable target; only an exactly identified disposable database/schema owned by the run may be reset after explicit confirmation.

On failure, record a stable signature from gate, command, error class, and relevant location. Repair that signature at most three times; then stop the repair loop and request review/clarification with collected evidence.
