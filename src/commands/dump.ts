import { createWriteStream, unlinkSync, type WriteStream } from "node:fs";
import { spawn } from "node:child_process";
import { finished, pipeline } from "node:stream/promises";
import {
  BoxRenderable,
  TextRenderable,
  type CliRenderer,
  type KeyEvent,
} from "@opentui/core";
import { SpinnerRenderable } from "opentui-spinner";
import { listDatabases, replaceDbInUrl, requireBin, timestamp } from "../utils.js";
import {
  BACK,
  clearContent,
  promptDbUrl,
  promptMultiSelect,
  promptSelect,
  type FlowResult,
} from "../tui/shared.js";

type OutputMode = "separate" | "single";

const PG_DUMP_ARGS = ["--clean", "--if-exists"] as const;

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function sqlString(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

async function waitExit(child: ReturnType<typeof spawn>): Promise<number | null> {
  if (child.exitCode !== null) return child.exitCode;
  return new Promise((resolve) => child.once("close", resolve));
}

async function dumpOne(url: string, outFile: string): Promise<boolean> {
  const child = spawn("pg_dump", [...PG_DUMP_ARGS, url], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const out = createWriteStream(outFile);

  try {
    await pipeline(child.stdout!, out);
  } catch {
    return false;
  }

  return (await waitExit(child)) === 0;
}

/** Append one database dump into an open stream (does not end the stream). */
async function dumpAppend(
  url: string,
  out: WriteStream,
  dbName: string,
): Promise<boolean> {
  // Create DB if missing, then connect — required for restore onto empty servers
  const header =
    `\n--\n-- Database: ${dbName}\n--\n` +
    `\\connect postgres\n` +
    `SELECT format('CREATE DATABASE %I', ${sqlString(dbName)})\n` +
    `WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = ${sqlString(dbName)})\\gexec\n` +
    `\\connect ${quoteIdent(dbName)}\n\n`;

  await new Promise<void>((resolve, reject) => {
    out.write(header, (err) => (err ? reject(err) : resolve()));
  });

  const child = spawn("pg_dump", [...PG_DUMP_ARGS, url], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  child.stdout!.pipe(out, { end: false });

  try {
    await finished(child.stdout!);
  } catch {
    return false;
  }

  return (await waitExit(child)) === 0;
}

async function runProgress(
  renderer: CliRenderer,
  dbUrl: string,
  selected: string[],
  outputMode: OutputMode,
): Promise<number> {
  const content = clearContent(renderer);

  const ts = timestamp();
  let failed = 0;
  const combinedFile =
    outputMode === "single" ? `backup_combined_${ts}.sql` : null;

  const panel = new BoxRenderable(renderer, {
    id: "progress-panel",
    border: true,
    borderColor: "#555555",
    title:
      outputMode === "single"
        ? ` dumping ${selected.length} database(s) → one file `
        : ` dumping ${selected.length} database(s) `,
    flexDirection: "column",
    padding: 1,
    width: "100%",
    flexGrow: 1,
  });

  const status = new TextRenderable(renderer, {
    id: "progress-status",
    content: combinedFile ? `Writing ${combinedFile}…` : "Starting…",
    fg: "#AAAAAA",
    marginBottom: 1,
  });
  panel.add(status);

  type Row = {
    spinner: SpinnerRenderable;
    label: TextRenderable;
  };

  const rows = new Map<string, Row>();

  for (const db of selected) {
    const box = new BoxRenderable(renderer, {
      id: `row-${db}`,
      flexDirection: "row",
      alignItems: "center",
      height: 1,
      width: "100%",
    });
    const spinner = new SpinnerRenderable(renderer, {
      id: `spin-${db}`,
      name: "dots",
      color: "#88CCFF",
      autoplay: false,
    });
    const label = new TextRenderable(renderer, {
      id: `label-${db}`,
      content: ` ${db}  pending`,
      fg: "#888888",
      marginLeft: 1,
    });
    box.add(spinner);
    box.add(label);
    panel.add(box);
    rows.set(db, { spinner, label });
  }

  content.add(panel);

  const combined = combinedFile ? createWriteStream(combinedFile) : null;
  if (combined) {
    combined.write(
      `-- pgsqlio combined dump\n-- databases: ${selected.join(", ")}\n-- created: ${ts}\n`,
    );
  }

  for (let i = 0; i < selected.length; i++) {
    const db = selected[i]!;
    const url = replaceDbInUrl(dbUrl, db);
    const row = rows.get(db)!;
    const outLabel = combinedFile ?? `backup_${db}_${ts}.sql`;

    status.content = `Dumping ${i + 1}/${selected.length}: ${db}`;
    row.label.content = ` ${db}  →  ${outLabel}`;
    row.label.fg = "#FFFFFF";
    row.spinner.start();

    const ok = combined
      ? await dumpAppend(url, combined, db)
      : await dumpOne(url, outLabel);

    row.spinner.stop();
    row.spinner.visible = false;

    if (ok) {
      row.label.content = `✓ ${db}  →  ${outLabel}`;
      row.label.fg = "#66DD88";
    } else {
      row.label.content = `✗ ${db}  failed`;
      row.label.fg = "#FF6666";
      failed += 1;
      if (!combined) {
        try {
          unlinkSync(outLabel);
        } catch {
          /* ignore */
        }
      }
    }
  }

  if (combined) {
    await new Promise<void>((resolve, reject) => {
      combined.end(() => resolve());
      combined.on("error", reject);
    });
    if (failed > 0) {
      try {
        unlinkSync(combinedFile!);
      } catch {
        /* ignore */
      }
    }
  }

  status.content =
    failed === 0
      ? combinedFile
        ? `Done — ${selected.length} database(s) → ${combinedFile}`
        : `Done — ${selected.length} database(s) dumped`
      : `Finished with ${failed} failure(s)`;
  status.fg = failed === 0 ? "#66DD88" : "#FFAA66";

  panel.add(
    new TextRenderable(renderer, {
      id: "progress-done",
      content: "Press Enter to continue",
      fg: "#888888",
      marginTop: 1,
    }),
  );

  await new Promise<void>((resolve) => {
    const onKey = (key: KeyEvent) => {
      if (key.name === "return" || key.name === "enter" || key.name === "q") {
        renderer.keyInput.off("keypress", onKey);
        resolve();
      }
    };
    renderer.keyInput.on("keypress", onKey);
  });

  return failed;
}

export async function runDumpFlow(renderer: CliRenderer): Promise<FlowResult> {
  requireBin("psql");
  requireBin("pg_dump");

  let dbUrl: string;
  try {
    dbUrl = await promptDbUrl(renderer, "pgsqlio · dump");
  } catch {
    return "back";
  }

  const content = clearContent(renderer);
  const loading = new BoxRenderable(renderer, {
    id: "loading",
    flexDirection: "row",
    alignItems: "center",
    padding: 1,
    flexGrow: 1,
  });
  const spin = new SpinnerRenderable(renderer, {
    id: "loading-spin",
    name: "dots",
    color: "#88CCFF",
  });
  loading.add(spin);
  loading.add(
    new TextRenderable(renderer, {
      id: "loading-text",
      content: " Fetching database list…",
      fg: "#CCCCCC",
      marginLeft: 1,
    }),
  );
  content.add(loading);

  const listed = listDatabases(dbUrl);
  spin.stop();
  const databases = listed.databases;

  if (!listed.ok || databases.length === 0) {
    const failContent = clearContent(renderer);
    failContent.add(
      new TextRenderable(renderer, {
        content: listed.ok
          ? "❌ No databases found"
          : `❌ Connection failed: ${listed.error ?? "unknown error"}`,
        fg: "#FF6666",
        padding: 1,
      }),
    );
    await new Promise((r) => setTimeout(r, 2000));
    return "fail";
  }

  let selected: string[] | undefined;
  let outputMode: OutputMode = "separate";

  while (!selected) {
    const mode = await promptSelect(renderer, {
      title: "pgsqlio · dump",
      message: "What do you want to dump?",
      allowBack: true,
      choices: [
        {
          name: `All databases (${databases.length})`,
          description: "Dump every non-template database",
          value: "all",
        },
        {
          name: "Select databases",
          description: "Pick databases with checkboxes",
          value: "select",
        },
      ],
    });

    if (mode === BACK) return "back";

    if (mode === "all") {
      selected = [...databases];
    } else {
      const picks = await promptMultiSelect(renderer, {
        title: "select databases",
        items: databases,
      });
      if (picks === BACK) continue;
      if (picks.length === 0) continue;
      selected = picks;
    }

    if (selected.length > 1) {
      const fileMode = await promptSelect(renderer, {
        title: "pgsqlio · dump",
        message: `How should ${selected.length} databases be written?`,
        allowBack: true,
        choices: [
          {
            name: "Separate files",
            description: "One backup_<db>_….sql file per database",
            value: "separate" as const,
          },
          {
            name: "Single file",
            description: "One backup_combined_….sql with \\connect between DBs",
            value: "single" as const,
          },
        ],
      });

      if (fileMode === BACK) {
        selected = undefined;
        continue;
      }
      outputMode = fileMode;
    } else {
      outputMode = "separate";
    }
  }

  const failed = await runProgress(renderer, dbUrl, selected, outputMode);
  return failed === 0 ? "ok" : "fail";
}
