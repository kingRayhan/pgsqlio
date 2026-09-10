import type { CliRenderer } from "@opentui/core";
import { requireBin, run } from "../utils.js";
import {
  BACK,
  promptDbUrl,
  promptSelect,
  showStatus,
  withSpinner,
  type FlowResult,
} from "../tui/shared.js";

export async function runCleanupFlow(renderer: CliRenderer): Promise<FlowResult> {
  requireBin("psql");

  let dbUrl: string;
  try {
    dbUrl = await promptDbUrl(renderer, "pgsqlio · cleanup");
  } catch {
    return "back";
  }

  const confirm = await promptSelect(renderer, {
    title: "pgsqlio · cleanup",
    message: "Drop and recreate the public schema? This is destructive.",
    allowBack: true,
    choices: [
      {
        name: "Yes, clean database",
        description: "DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
        value: "yes",
      },
      { name: "Cancel", description: "Return to main menu", value: "no" },
    ],
  });

  if (confirm === BACK || confirm === "no") return "back";

  const result = await withSpinner(renderer, "pgsqlio · cleanup", "Cleaning…", () =>
    run("psql", [
      dbUrl,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
    ]),
  );

  await showStatus(renderer, {
    title: "pgsqlio · cleanup",
    message: result.ok
      ? "✅ Cleanup successful (database is empty)"
      : "❌ Cleanup failed",
    ok: result.ok,
    detail: result.ok ? undefined : result.output || undefined,
  });

  return result.ok ? "ok" : "fail";
}
