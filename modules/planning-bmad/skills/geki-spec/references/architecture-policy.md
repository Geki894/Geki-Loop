# Architecture policy

- Existing repository conventions and architecture win unless a documented defect requires change.
- Greenfield .NET defaults to `net8.0` and ASP.NET Core Web API when no requirement forces another target.
- Database is an independent decision from backend runtime. .NET does not imply SQL Server: approved PostgreSQL/Supabase uses its native driver such as Npgsql with EF Core.
- Record database `engine`, `hosting`, `orm`, `driver`, and `migrationTool` separately. `docker` or `supabase` is hosting, not an ORM driver.
- Greenfield NestJS defaults to Prisma + PostgreSQL only when Architecture has no stronger reason for another native ORM.
- Prefer modular monolith and vertical slices. Do not propose microservices without measurable NFR or ownership boundaries.
- Do not add Repository, Unit of Work, Mediator, CQRS, event bus, or generic service wrappers because they are fashionable.
- Add an abstraction only when it creates demonstrated value: multiple implementations, real domain/infrastructure isolation, cross-aggregate transaction needs, shared pipeline behavior, or sufficient domain complexity.
- Record material decisions as ADRs and include trade-offs, not just selections.
