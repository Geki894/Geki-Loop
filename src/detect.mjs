import fs from "node:fs/promises";
import path from "node:path";
import { exists, readJson, walkFiles, relativeUnix } from "./files.mjs";

export async function detectRepository(root) {
  const files = (await walkFiles(root))
    .map((file) => relativeUnix(root, file))
    .filter((file) => !file.startsWith(".git/") && !file.startsWith("node_modules/") && !file.startsWith(".geki/backups/"));
  const result = { brownfield: files.length > 0, runtimes: [], frameworks: [], databases: [], orm: [], recommendedPreset: "bootstrap", evidence: [] };
  const csproj = files.filter((file) => file.endsWith(".csproj"));
  if (csproj.length) {
    result.runtimes.push("dotnet");
    result.frameworks.push("aspnet-core-web-api");
    result.evidence.push(...csproj.slice(0, 5));
  }
  if (files.includes("nest-cli.json")) {
    result.runtimes.push("node");
    result.frameworks.push("nestjs");
    result.evidence.push("nest-cli.json");
  }
  if (files.includes("prisma/schema.prisma")) {
    result.orm.push("prisma");
    result.evidence.push("prisma/schema.prisma");
  }
  const packageFile = path.join(root, "package.json");
  if (await exists(packageFile)) {
    const pkg = await readJson(packageFile, {});
    const dependencies = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    if (dependencies["@nestjs/core"] && !result.frameworks.includes("nestjs")) result.frameworks.push("nestjs");
    if (dependencies.typeorm) result.orm.push("typeorm");
    if (dependencies["@prisma/client"] && !result.orm.includes("prisma")) result.orm.push("prisma");
    result.evidence.push("package.json");
  }
  const textFiles = files.filter((file) => /\.(csproj|json|toml|ya?ml|env\.example)$/i.test(file)).slice(0, 100);
  for (const relative of textFiles) {
    let content = "";
    try { content = await fs.readFile(path.join(root, relative), "utf8"); } catch { continue; }
    if (/Npgsql|postgres(?:ql)?|supabase/i.test(content) && !result.databases.includes("postgresql")) result.databases.push("postgresql");
    if (/SqlServer|mssql/i.test(content) && !result.databases.includes("sqlserver")) result.databases.push("sqlserver");
  }
  if (result.frameworks.includes("nestjs") && result.databases.includes("postgresql")) result.recommendedPreset = "nestjs-prisma-postgres";
  if (result.runtimes.includes("dotnet") && result.databases.includes("postgresql")) result.recommendedPreset = "dotnet-postgres-api";
  return result;
}
