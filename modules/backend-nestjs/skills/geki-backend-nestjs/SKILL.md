---
name: geki-backend-nestjs
description: Implement or review approved NestJS REST API Stories while preserving the repository's ORM and conventions. Use for NestJS modules, controllers, providers, Prisma, TypeORM, validation, authentication, migrations, and Node backend tests.
---

# Geki Backend NestJS

Start from the approved Architecture and Story Contract. Detect and continue the current ORM/database client and repository conventions. For greenfield NestJS plus PostgreSQL, default to Prisma only when Architecture does not establish a better fit; TypeORM or another client is valid when its capabilities match the domain or existing code.

## Implementation policy

1. Map acceptance criteria to REST contracts, DTO validation, authorization, persistence, error semantics, and tests.
2. Use Nest modules/providers/controllers directly and keep features cohesive. Prefer the smallest modular-monolith design that satisfies the spec.
3. Use native ORM transactions, migrations, test utilities, and lifecycle. Do not hide the ORM behind Repository or Unit of Work wrappers that add no business value.
4. Do not add CQRS, Mediator, event bus, generic base services, or similar abstractions without a concrete approved need. Record the reason in Architecture first.
5. Preserve strict TypeScript settings, structured error responses, OpenAPI behavior when selected, cancellation/timeouts for external calls, and redacted logs.
6. Validate migrations and queries against real PostgreSQL/Supabase or the selected database, not an incompatible in-memory substitute.

Run repository lint/typecheck/build, unit tests, real integration/API tests, migration checks, dependency/security checks, and independent review. Use Playwright for observable browser journeys. Reopen Architecture instead of inventing a structural decision while coding.
