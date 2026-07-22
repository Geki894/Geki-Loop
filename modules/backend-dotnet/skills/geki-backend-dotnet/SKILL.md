---
name: geki-backend-dotnet
description: Implement or review approved backend Stories in .NET and ASP.NET Core Web API. Use for C# projects, .csproj or .sln files, REST endpoints, EF Core or another detected data client, and greenfield .NET services selected by Geki Architecture.
---

# Geki Backend .NET

Read the approved Architecture and Story Contract before editing. For an existing repository, preserve its target framework, ORM, layout, and conventions unless the approved spec explicitly changes them. For greenfield work without a stronger constraint, use .NET 8, ASP.NET Core Web API, REST/OpenAPI, nullable reference types, dependency injection, and async cancellation-aware I/O.

Treat database engine and hosting as independent from .NET. Never switch approved PostgreSQL/Supabase work to SQL Server or LocalDB merely because the backend is .NET; use the approved native driver, normally Npgsql for EF Core + PostgreSQL.

## Implementation policy

1. Trace every acceptance criterion to endpoint behavior, validation, authorization, persistence, and tests.
2. Prefer a modular monolith and cohesive feature/vertical-slice organization. Keep domain rules out of controllers and persistence-specific details out of business decisions.
3. Use the selected ORM/client directly through its native lifetime, migration, and transaction mechanisms.
4. Do not introduce Repository, Unit of Work, Mediator, CQRS, event bus, generic service wrappers, or framework wrappers merely as “best practice.” Add an abstraction only for a demonstrated requirement such as multiple implementations, infrastructure isolation required by the domain, a transaction spanning aggregates, shared pipeline behavior, or substantial business complexity. Record the reason in Architecture before coding.
5. Use Problem Details consistently, explicit DTOs at public boundaries, server-side validation, authorization policies, and safe logging that excludes secrets and sensitive data.
6. Make database migrations reviewable and test upgrades against a real disposable container when database behavior changes.

## Required evidence

Run formatting/analyzers configured by the repository, `dotnet restore`, Release build, unit tests, real integration/API tests, migration checks when applicable, secret/security checks, and independent review. UI Stories additionally require the Playwright journey. Do not claim success from mocks alone when persistence, authentication, email, payment sandbox, or external API behavior is in scope.

If Architecture is insufficient or a proposed abstraction changes it materially, stop coding, reopen Architecture through `geki-correct-course`, and revalidate affected contracts.
