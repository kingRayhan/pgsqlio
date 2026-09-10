import {
  BoxRenderable,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import { SpinnerRenderable } from "opentui-spinner";
import {
  dropDatabases,
  listDatabases,
  normalizeConnUrl,
  requireBin,
} from "../utils.js";
import {
  BACK,
  clearContent,
  promptDbUrl,
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
  try {
    connUrl = await promptDbUrl(renderer, "pgsqlio · drop databases");
  } catch {
    return "back";
  }
  connUrl = normalizeConnUrl(connUrl);

  const loadingWrap = clearContent(renderer);
  const spin = new SpinnerRenderable(renderer, {
    id: "db-spin",
    name: "dots",
    color: "#88CCFF",
  });
  const loading = new BoxRenderable(renderer, {
    id: "db-loading",
    flexDirection: "row",
    alignItems: "center",
    padding: 1,
    flexGrow: 1,
  });
  loading.add(spin);
  loading.add(
    new TextRenderable(renderer, {
      content: " Fetching databases…",
      fg: "#CCCCCC",
      marginLeft: 1,
    }),
  );
  loadingWrap.add(loading);

  const listed = listDatabases(connUrl);
  spin.stop();

  if (!listed.ok) {
    await showStatus(renderer, {
      title: "pgsqlio · drop databases",
      message: "❌ Could not list databases",
      ok: false,
      detail: listed.error,
    });
    return "fail";
  }

  // Never offer to drop postgres / template DBs from this UI
  const droppable = listed.databases.filter(
    (name) => name !== "postgres" && !name.startsWith("template"),
  );

  if (droppable.length === 0) {
    await showStatus(renderer, {
      title: "pgsqlio · drop databases",
      message: "No droppable databases found",
      ok: false,
      detail: "postgres / template* are protected",
    });
    return "fail";
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
