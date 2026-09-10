import { existsSync, readFileSync } from "node:fs";
import type { CliRenderer } from "@opentui/core";
import {
  ensureDatabase,
  extractConnectTargets,
  replaceDbInUrl,
  requireBin,
  run,
  wipePublicSchema,
} from "../utils.js";
import {
  promptDbUrl,
  promptSelect,
  promptText,
  showStatus,
  withSpinner,
  BACK,
  type FlowResult,
} from "../tui/shared.js";

export async function runRestoreFlow(renderer: CliRenderer): Promise<FlowResult> {
  requireBin("psql");

  let dbUrl: string;
  try {
    dbUrl = await promptDbUrl(renderer, "pgsqlio · restore");
  } catch {
    return "back";
  }

  let file: string;
  try {
    file = await promptText(renderer, {
      title: "pgsqlio · restore",
      label: "SQL backup file path",
      placeholder: "backup_mydb_20250924_121530.sql",
      validate: (value) =>
        existsSync(value) ? null : "File not found — check the path",
    });
  } catch {
    return "back";
  }

  let sql = "";
  try {
    sql = readFileSync(file, "utf8");
  } catch {
    await showStatus(renderer, {
      title: "pgsqlio · restore",
      message: "❌ Could not read backup file",
      ok: false,
    });
    return "fail";
  }

  const targets = extractConnectTargets(sql);
  const isCombined = targets.length > 0;
  const adminUrl = replaceDbInUrl(dbUrl, "postgres");

  const confirm = await promptSelect(renderer, {
    title: "pgsqlio · restore",
    message: isCombined
      ? `Restore ${targets.length} database(s) from ${file}?`
      : `Restore into this database from ${file}?`,
    allowBack: true,
    choices: [
      {
        name: "Wipe schemas, then restore",
        description:
          "DROP SCHEMA public CASCADE on target DB(s) first (fixes “already exists”)",
        value: "wipe",
      },
      {
        name: "Restore as-is",
        description: "Do not wipe — fails if objects already exist",
        value: "asis",
      },
      { name: "Cancel", description: "Return to main menu", value: "no" },
    ],
  });

  if (confirm === BACK || confirm === "no") return "back";
  const wipeFirst = confirm === "wipe";

  const result = await withSpinner(
    renderer,
    "pgsqlio · restore",
    wipeFirst ? "Wiping + restoring…" : "Restoring…",
    () => {
      const logs: string[] = [];

      if (isCombined) {
        for (const db of targets) {
          const created = ensureDatabase(adminUrl, db);
          if (!created.ok) {
            return {
              ok: false,
              output: [`Failed creating database "${db}"`, created.output]
                .filter(Boolean)
                .join("\n"),
            };
          }
          if (created.output) logs.push(created.output);

          if (wipeFirst) {
            const wiped = wipePublicSchema(replaceDbInUrl(adminUrl, db));
            if (!wiped.ok) {
              return {
                ok: false,
                output: [`Failed wiping database "${db}"`, wiped.output]
                  .filter(Boolean)
                  .join("\n"),
              };
            }
            if (wiped.output) logs.push(wiped.output);
          }
        }
      } else if (wipeFirst) {
        const wiped = wipePublicSchema(dbUrl);
        if (!wiped.ok) {
          return {
            ok: false,
            output: ["Failed wiping target database", wiped.output]
              .filter(Boolean)
              .join("\n"),
          };
        }
        if (wiped.output) logs.push(wiped.output);
      }

      // Combined dumps switch DB via \\connect — start on postgres so meta-commands work
      const restoreUrl = isCombined ? adminUrl : dbUrl;
      const restored = run("psql", [
        restoreUrl,
        "-v",
        "ON_ERROR_STOP=1",
        "-f",
        file,
      ]);
      if (restored.output) logs.push(restored.output);
      return {
        ok: restored.ok,
        output: logs.join("\n").trim(),
      };
    },
  );

  await showStatus(renderer, {
    title: "pgsqlio · restore",
    message: result.ok ? "✅ Restore successful" : "❌ Restore failed",
    ok: result.ok,
    detail: result.ok ? undefined : result.output || undefined,
  });

  return result.ok ? "ok" : "fail";
}
