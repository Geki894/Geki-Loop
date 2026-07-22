import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, csv } from "../../src/args.mjs";
import { modulesForArchitecture, validateArchitecture } from "../../src/architecture.mjs";
import { detectRepository } from "../../src/detect.mjs";
import { loadCatalog, resolveModules } from "../../src/catalog.mjs";
import { checkbox, confirm } from "../../src/prompt.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("CLI parser handles positional values, csv, and camel-case flags", () => {
  assert.deepEqual(parseArgs(["install", "extra", "--target", "C:\\work", "--remove-unselected"]), {
    command: "install", positional: ["extra"], flags: { target: "C:\\work", removeUnselected: true }
  });
  assert.deepEqual(csv("a, b,,c"), ["a", "b", "c"]);
});

test("non-TTY prompts preserve default checkboxes and confirmation", async () => {
  assert.deepEqual(await checkbox("modules", [{ value: "a", checked: true }, { value: "b", checked: false }]), ["a"]);
  assert.equal(await confirm("continue", true), true);
});

test("architecture composes .NET and PostgreSQL without forcing SQL Server", () => {
  const modules = modulesForArchitecture({
    status: "approved",
    backend: { runtime: "dotnet", framework: "aspnet-core-web-api", targetFramework: "net8.0" },
    database: { engine: "postgresql", hosting: "supabase", orm: "ef-core", driver: "npgsql", migrationTool: "ef-core" },
    frontend: { surface: null },
    deployment: { provider: "render" }
  });
  for (const expected of ["backend-dotnet", "database-postgres", "execution-loop", "testing", "github-ci", "render"]) assert.ok(modules.includes(expected));
  assert.ok(!modules.includes("database-sqlserver"));
});

test("architecture validation fails closed on contradictory or vague database choices", () => {
  assert.throws(() => modulesForArchitecture({ backend: { runtime: "dotnet", framework: "aspnet-core-web-api" }, database: { engine: "sqlserver", hosting: "supabase" } }), /Supabase/);
  assert.throws(() => validateArchitecture({ database: { engine: "PostgreSQL 16" } }), /Unsupported database.engine/);
  assert.throws(() => validateArchitecture({ database: { engine: "postgresql", driver: "sqlserver" } }), /cannot use/);
  assert.equal(validateArchitecture({ backend: { runtime: "dotnet", framework: "aspnet-core-web-api" }, database: { engine: "postgresql", hosting: "docker", orm: "ef-core", driver: "npgsql", migrationTool: "ef-core" } }), true);
  assert.throws(() => validateArchitecture({ status: "approved" }), /requires a backend.runtime or frontend.surface/);
  assert.throws(() => validateArchitecture({ backend: { runtime: "dotnet", framework: "nestjs" } }), /ASP.NET/);
  assert.throws(() => validateArchitecture({ backend: { runtime: "node", framework: "aspnet-core-web-api" } }), /NestJS/);
  assert.throws(() => validateArchitecture({ backend: { runtime: "dotnet", framework: "aspnet-core-web-api" }, database: { engine: "postgresql", orm: "typeorm", driver: "pg", migrationTool: "typeorm" } }), /incompatible/);
  assert.throws(() => validateArchitecture({ status: "approved", backend: { runtime: "dotnet", framework: "aspnet-core-web-api", targetFramework: "net8.0" }, database: { engine: "postgresql", orm: "ef-core", migrationTool: "ef-core" } }), /requires hosting, orm, driver/);
  assert.throws(() => validateArchitecture({ backend: { runtime: "dotnet", framework: "aspnet-core-web-api" }, database: { engine: "postgresql", orm: "ef-core", driver: "Microsoft.EntityFrameworkCore.SqlServer", migrationTool: "ef-core" } }), /cannot use/);
  assert.throws(() => validateArchitecture({ status: "approved", backend: { runtime: "dotnet", framework: "aspnet-core-web-api", targetFramework: "net8.0" }, database: { engine: "postgresql", orm: "ef-core", driver: "npgsql", migrationTool: "ef-core" } }), /requires hosting/);
  assert.throws(() => validateArchitecture({ backend: { runtime: "node", framework: "nestjs" }, database: { engine: "postgresql", hosting: "docker", orm: "prisma", driver: "npgsql", migrationTool: "prisma" } }), /driver prisma/);
  assert.throws(() => validateArchitecture({ backend: { runtime: "dotnet", framework: "aspnet-core-web-api" }, database: { engine: "postgresql", hosting: "docker", orm: "ef-core", driver: "npgsql", migrationTool: "prisma" } }), /EF Core requires/);
  assert.throws(() => validateArchitecture({ frontend: { surface: "desktop", framework: "react" } }), /Unsupported frontend.surface/);
  assert.ok(modulesForArchitecture({ frontend: { surface: "spa", framework: "react" } }).includes("frontend"));
});

test("module dependency closure is deterministic", async () => {
  const catalog = await loadCatalog();
  const resolved = resolveModules(catalog, ["backend-dotnet", "database-postgres"]);
  for (const expected of ["core", "planning-bmad", "spec-council", "provisioning", "execution-loop", "testing", "backend-dotnet", "database-postgres"]) assert.ok(resolved.includes(expected));
  assert.equal(new Set(resolved).size, resolved.length);
});

test("repository detector recognizes both supported backend fixtures", async () => {
  const dotnet = await detectRepository(path.join(root, "fixtures", "dotnet8-postgres-api"));
  assert.ok(dotnet.runtimes.includes("dotnet"));
  assert.ok(dotnet.databases.includes("postgresql"));
  assert.equal(dotnet.recommendedPreset, "dotnet-postgres-api");
  const nest = await detectRepository(path.join(root, "fixtures", "nestjs-prisma-postgres"));
  assert.ok(nest.frameworks.includes("nestjs"));
  assert.ok(nest.orm.includes("prisma"));
  assert.equal(nest.recommendedPreset, "nestjs-prisma-postgres");
});
