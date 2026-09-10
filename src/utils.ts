import { spawnSync } from "node:child_process";

export function requireBin(name: string): void {
  const result = spawnSync(name, ["--version"], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    console.error(`❌ Missing required binary: ${name} (install PostgreSQL client tools)`);
    process.exit(1);
  }
}

export function run(
  cmd: string,
  args: string[],
  options?: { input?: string },
): { ok: boolean; output: string } {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    input: options?.input,
    stdio: options?.input !== undefined ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  return { ok: result.status === 0, output };
}

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Create database if it does not exist (connect via adminUrl, usually …/postgres). */
export function ensureDatabase(adminUrl: string, name: string): { ok: boolean; output: string } {
  const lit = name.replace(/'/g, "''");
  const { ok: checkOk, stdout } = runCapture("psql", [
    adminUrl,
    "-Atc",
    `SELECT 1 FROM pg_database WHERE datname = '${lit}'`,
  ]);
  if (checkOk && stdout.trim() === "1") {
    return { ok: true, output: "" };
  }
  return run("psql", [adminUrl, "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${quoteIdent(name)}`]);
}

/** Reset public schema so a plain dump can restore without "already exists" errors. */
export function wipePublicSchema(dbUrl: string): { ok: boolean; output: string } {
  return run("psql", [
    dbUrl,
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public; GRANT ALL ON SCHEMA public TO CURRENT_USER;",
  ]);
}

/** Parse \\connect targets from a dump (for combined backups). */
export function extractConnectTargets(sql: string): string[] {
  const found = new Set<string>();
  for (const m of sql.matchAll(/\\connect\s+"((?:\\.|[^"\\])*)"/gi)) {
    found.add(m[1]!.replace(/""/g, '"'));
  }
  for (const m of sql.matchAll(/\\connect\s+([^\s"]+)/gi)) {
    const name = m[1]!.replace(/;$/, "");
    if (name.toLowerCase() !== "postgres") found.add(name);
  }
  found.delete("postgres");
  return [...found];
}

export function runCapture(
  cmd: string,
  args: string[],
): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync(cmd, args, { encoding: "utf8" });
  return {
    ok: result.status === 0,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}

/** Ensure URL has a database path (defaults to postgres). */
export function normalizeConnUrl(url: string): string {
  const [base, query] = url.split("?");
  let next = base ?? url;
  if (/^postgres(?:ql)?:\/\/[^/]+$/i.test(next)) {
    next = `${next}/postgres`;
  } else if (/^postgres(?:ql)?:\/\/[^/]+\/$/i.test(next)) {
    next = `${next}postgres`;
  }
  return query !== undefined ? `${next}?${query}` : next;
}

export function replaceDbInUrl(url: string, newDb: string): string {
  const normalized = normalizeConnUrl(url);
  const [base, query] = normalized.split("?");
  const match = (base ?? normalized).match(/^(postgres(?:ql)?:\/\/[^/]+)/i);
  const authority = match?.[1] ?? (base ?? normalized).replace(/\/[^/]*$/, "");
  const replaced = `${authority}/${newDb}`;
  return query !== undefined ? `${replaced}?${query}` : replaced;
}

export function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

export function listDatabases(dbUrl: string): { ok: boolean; databases: string[]; error?: string } {
  const url = normalizeConnUrl(dbUrl);
  const { ok, stdout, stderr } = runCapture("psql", [
    url,
    "-Atc",
    "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname;",
  ]);
  if (!ok) {
    return { ok: false, databases: [], error: stderr || stdout || "Connection failed" };
  }
  return { ok: true, databases: stdout.split("\n").filter(Boolean) };
}

export function listTables(
  dbUrl: string,
  schema = "public",
): { ok: boolean; tables: string[]; error?: string } {
  const url = normalizeConnUrl(dbUrl);
  const lit = schema.replace(/'/g, "''");
  const { ok, stdout, stderr } = runCapture("psql", [
    url,
    "-Atc",
    `SELECT tablename FROM pg_tables WHERE schemaname = '${lit}' ORDER BY tablename;`,
  ]);
  if (!ok) {
    return { ok: false, tables: [], error: stderr || stdout || "Connection failed" };
  }
  return { ok: true, tables: stdout.split("\n").filter(Boolean) };
}

export function dropTables(
  dbUrl: string,
  tables: string[],
  schema = "public",
): { ok: boolean; output: string } {
  if (tables.length === 0) return { ok: true, output: "" };
  const qualified = tables
    .map((t) => `${quoteIdent(schema)}.${quoteIdent(t)}`)
    .join(", ");
  return run("psql", [
    dbUrl,
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `DROP TABLE IF EXISTS ${qualified} CASCADE;`,
  ]);
}

/** Drop databases (connects via /postgres). Terminates backends when possible. */
export function dropDatabases(
  connUrl: string,
  names: string[],
): { ok: boolean; output: string } {
  const adminUrl = replaceDbInUrl(normalizeConnUrl(connUrl), "postgres");
  const logs: string[] = [];

  for (const name of names) {
    if (name === "postgres" || name.startsWith("template")) {
      return {
        ok: false,
        output: `Refusing to drop protected database: ${name}`,
      };
    }

    const lit = name.replace(/'/g, "''");
    // Kick connections so DROP DATABASE can proceed
    const terminate = run("psql", [
      adminUrl,
      "-c",
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${lit}' AND pid <> pg_backend_pid();`,
    ]);
    if (terminate.output) logs.push(terminate.output);

    const dropped = run("psql", [
      adminUrl,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `DROP DATABASE IF EXISTS ${quoteIdent(name)};`,
    ]);
    if (dropped.output) logs.push(dropped.output);
    if (!dropped.ok) {
      return {
        ok: false,
        output: [`Failed dropping "${name}"`, ...logs].filter(Boolean).join("\n"),
      };
    }
  }

  return { ok: true, output: logs.join("\n").trim() };
}

export function printUsage(bin = "pgsqlio"): void {
  console.log(`Usage:
  ${bin}

Interactive menu: Dump · Restore · Cleanup · Drop databases`);
}
