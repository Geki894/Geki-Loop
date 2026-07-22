---
name: geki-database-sqlserver
description: Design, implement, migrate, and verify SQL Server persistence selected by Geki Architecture. Use for SQL Server schemas, EF Core or detected clients, migrations, transactions, and Docker-backed integration tests.
---

# Geki Database SQL Server

Preserve the existing ORM/client and its native migrations and transaction model. For greenfield work, select SQL Server only through Architecture evidence; .NET with PostgreSQL remains fully supported and must not be redirected here merely because the backend is .NET.

- Run persistence and migration tests against a real SQL Server container or explicitly configured test instance.
- Isolate fixtures with a unique run ID. Never clean globally on a shared/non-disposable target. A reset/drop is allowed only for a disposable database/schema owned by the run after the exact target is displayed and explicitly confirmed.
- Model constraints, indexes, nullability, precision, collation, concurrency, and cascade behavior intentionally.
- Avoid Repository/Unit of Work wrappers without a documented architectural need beyond wrapping EF Core or another client.
- Keep credentials out of source, output, and evidence; stop for clarification when required configuration is absent.

Record real migration, integration, and API evidence before the Story can pass.
