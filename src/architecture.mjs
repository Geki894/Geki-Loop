const value = (object, keys) => keys.reduce((current, key) => current?.[key], object);
const normalized = (input) => String(input || "").toLowerCase().replace(/[_\s]+/g, "-");

export function modulesForArchitecture(architecture) {
  validateArchitecture(architecture);
  const recommended = new Set(["execution-loop", "testing", "github-ci"]);
  const runtime = normalized(value(architecture, ["backend", "runtime"]) || architecture.runtime);
  const framework = normalized(value(architecture, ["backend", "framework"]) || architecture.framework);
  const database = normalized(value(architecture, ["database", "engine"]) || architecture.database);
  const hosting = normalized(value(architecture, ["database", "hosting"]) || value(architecture, ["database", "provider"]));
  const surface = normalized(value(architecture, ["frontend", "surface"]));
  const deployment = normalized(value(architecture, ["deployment", "provider"]) || architecture.deployment);
  if (runtime === "dotnet" || framework.includes("aspnet")) recommended.add("backend-dotnet");
  if (runtime === "node" || runtime === "nodejs" || framework === "nestjs") recommended.add("backend-nestjs");
  if (["postgres", "postgresql"].includes(database) || hosting === "supabase") recommended.add("database-postgres");
  if (["sqlserver", "sql-server", "mssql"].includes(database)) recommended.add("database-sqlserver");
  if (["web", "frontend", "fullstack", "spa", "dashboard", "landing", "product-ui"].includes(surface)) recommended.add("frontend");
  if (deployment === "render") recommended.add("render");
  return [...recommended];
}

export function validateArchitecture(architecture) {
  const runtime = normalized(value(architecture, ["backend", "runtime"]) || architecture.runtime);
  const framework = normalized(value(architecture, ["backend", "framework"]) || architecture.framework);
  const database = normalized(value(architecture, ["database", "engine"]) || architecture.database);
  const hosting = normalized(value(architecture, ["database", "hosting"]) || value(architecture, ["database", "provider"]));
  const orm = normalized(value(architecture, ["database", "orm"]));
  const driver = normalized(value(architecture, ["database", "driver"]));
  const migrationTool = normalized(value(architecture, ["database", "migrationTool"]));
  const surface = normalized(value(architecture, ["frontend", "surface"]));
  const frontendFramework = normalized(value(architecture, ["frontend", "framework"]));
  const targetFramework = normalized(value(architecture, ["backend", "targetFramework"]));
  const approved = architecture.status === "approved";
  if (approved && !runtime && !surface) throw new Error("Approved Architecture requires a backend.runtime or frontend.surface.");
  if (approved && runtime === "dotnet" && !targetFramework) throw new Error("Approved .NET Architecture requires backend.targetFramework; use net8.0 when no requirement says otherwise.");
  if (surface && !["web", "frontend", "fullstack", "spa", "dashboard", "landing", "product-ui"].includes(surface)) throw new Error(`Unsupported frontend.surface '${surface}'.`);
  if (approved && surface && !frontendFramework) throw new Error("Approved frontend Architecture requires frontend.framework.");
  if ((runtime && !framework) || (!runtime && framework)) throw new Error("backend.runtime and backend.framework must be selected together.");
  if (runtime && !["dotnet", "node", "nodejs"].includes(runtime)) throw new Error(`Unsupported backend.runtime '${runtime}'. Use a documented Architecture enum.`);
  if (framework && !["aspnet-core", "aspnet-core-web-api", "nestjs"].includes(framework)) throw new Error(`Unsupported backend.framework '${framework}'.`);
  if (runtime === "dotnet" && !framework.startsWith("aspnet")) throw new Error(".NET runtime requires an ASP.NET Core framework.");
  if (["node", "nodejs"].includes(runtime) && framework !== "nestjs") throw new Error("Node backend runtime requires NestJS.");
  if (database && !["postgres", "postgresql", "sqlserver", "sql-server", "mssql"].includes(database)) throw new Error(`Unsupported database.engine '${database}'. Use postgresql or sqlserver.`);
  if (approved && database && (!hosting || !orm || !driver || !migrationTool)) throw new Error("Approved database Architecture requires hosting, orm, driver, and migrationTool.");
  if (!database && (hosting || orm || driver || migrationTool)) throw new Error("Database hosting/ORM/driver/migrationTool requires database.engine.");
  if (hosting && !["docker", "supabase", "managed", "local", "external"].includes(hosting)) throw new Error(`Unsupported database.hosting '${hosting}'.`);
  if (hosting === "supabase" && !["postgres", "postgresql"].includes(database)) throw new Error("Supabase hosting requires database.engine postgresql.");
  if (runtime === "dotnet" && ["prisma", "typeorm"].includes(orm)) throw new Error(`${orm} is incompatible with the .NET backend profile.`);
  if (["node", "nodejs"].includes(runtime) && ["ef-core", "entity-framework-core", "dapper", "ado-net"].includes(orm)) throw new Error(`${orm} is incompatible with the NestJS backend profile.`);
  const postgres = ["postgres", "postgresql"].includes(database);
  const sqlserver = ["sqlserver", "sql-server", "mssql"].includes(database);
  if (postgres && driver && /(sqlserver|mssql|localdb)/.test(driver)) throw new Error("PostgreSQL cannot use a SQL Server driver.");
  if (sqlserver && driver && /(npgsql|postgres|supabase)/.test(driver)) throw new Error("SQL Server cannot use a PostgreSQL driver.");
  if (postgres && ["ef-core", "entity-framework-core"].includes(orm) && !/npgsql/.test(driver)) throw new Error("EF Core + PostgreSQL requires an Npgsql driver.");
  if (sqlserver && ["ef-core", "entity-framework-core"].includes(orm) && !/sqlserver/.test(driver)) throw new Error("EF Core + SQL Server requires a SQL Server driver.");
  if (orm === "prisma" && driver !== "prisma") throw new Error("Prisma ORM requires driver prisma in the Geki Architecture contract.");
  if (orm === "prisma" && migrationTool !== "prisma") throw new Error("Prisma ORM requires migrationTool prisma.");
  if (orm === "typeorm" && migrationTool !== "typeorm") throw new Error("TypeORM requires migrationTool typeorm.");
  if (["ef-core", "entity-framework-core"].includes(orm) && !["ef-core", "dotnet-ef"].includes(migrationTool)) throw new Error("EF Core requires migrationTool ef-core or dotnet-ef.");
  return true;
}
