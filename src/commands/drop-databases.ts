import type { CliRenderer } from "@opentui/core";
import { dropDatabases, requireBin } from "../utils.js";
import {
  BACK,
  promptDbUrlAndDatabases,
  promptMultiSelect,
  promptSelect,
  showStatus,
  withSpinner,
  type FlowResult,
} from "../tui/shared.js";

export async function runDropDatabasesFlow(
  renderer: CliRenderer,
): Promise<FlowResult> {
  requireBin("psql");

  let connUrl: string;
  let droppable: string[];
  try {
    const listed = await promptDbUrlAndDatabases(
      renderer,
      "pgsqlio · drop databases",
      {
        filter: (name) => name !== "postgres" && !name.startsWith("template"),
        emptyMessage:
          "No droppable databases found (postgres / template* are protected)",
      },
    );
    connUrl = listed.url;
    droppable = listed.databases;
  } catch {
    return "back";
  }

  const selected = await promptMultiSelect(renderer, {
    title: "select databases to drop",
    items: droppable,
  });

  if (selected === BACK) return "back";
  if (selected.length === 0) return "back";

  const confirm = await promptSelect(renderer, {
    title: "pgsqlio · drop databases",
    message: `Permanently drop ${selected.length} database(s)? This cannot be undone.`,
    allowBack: true,
    choices: [
      {
        name: "Yes, drop selected databases",
        description:
          selected.slice(0, 5).join(", ") + (selected.length > 5 ? "…" : ""),
        value: "yes",
      },
      { name: "Cancel", description: "Return to main menu", value: "no" },
    ],
  });

  if (confirm === BACK || confirm === "no") return "back";

  const result = await withSpinner(
    renderer,
    "pgsqlio · drop databases",
    `Dropping ${selected.length} database(s)…`,
    () => dropDatabases(connUrl, selected),
  );

  await showStatus(renderer, {
    title: "pgsqlio · drop databases",
    message: result.ok
      ? `✅ Dropped ${selected.length} database(s)`
      : "❌ Drop databases failed",
    ok: result.ok,
    detail: result.ok ? selected.join(", ") : result.output || undefined,
  });

  return result.ok ? "ok" : "fail";
}
