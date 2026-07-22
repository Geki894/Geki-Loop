---
name: geki-database-postgres
description: Design, implement, migrate, and verify PostgreSQL, Docker Postgres, or Supabase persistence selected by Geki Architecture. Use for schemas, migrations, RLS, SQL, ORM mappings, transactions, integration tests, and Supabase-backed Stories.
---

# Geki Database PostgreSQL

Use the ORM/client and migration mechanism approved in Architecture. Existing repositories keep their current tool. Greenfield NestJS normally uses Prisma/PostgreSQL; .NET commonly uses EF Core with the approved PostgreSQL driver, normally Npgsql. Supabase is PostgreSQL hosting plus platform capabilities—not an ORM driver and not a reason to replace sound database boundaries.

## Safety and correctness

- Test schema, constraints, transactions, concurrency-sensitive behavior, and migrations against real PostgreSQL: Docker locally or the explicitly configured Supabase test project.
- Give every test run a unique run ID and scope fixtures/queries to it. Preserve test data by default. Never perform global cleanup on a shared or non-disposable target, even from a broad instruction. A reset/drop is allowed only for a disposable database/schema owned by the run after showing the exact resolved target and receiving explicit confirmation.
- Use native transactions and migrations. Do not add Repository or Unit of Work wrappers merely to conceal the selected ORM.
- When Supabase Auth or Row Level Security is selected, test both allowed and denied paths with representative roles against a configured local Supabase stack or test project; a generic PostgreSQL container cannot prove Supabase-specific behavior. Never use a service-role key in browser code.
- Check indexes and query plans for hot or unbounded paths, define ownership/cascade behavior deliberately, and verify rollback or forward-fix strategy for material migrations.
- Keep credentials in environment variables and redact connection strings from evidence.

Missing test credentials are an interactive clarification, not permission to invent values. Record migration, integration, and API evidence before passing the Story.
