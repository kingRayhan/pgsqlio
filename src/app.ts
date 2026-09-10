import { createCliRenderer } from "@opentui/core";
import { runDumpFlow } from "./commands/dump.js";
import { runRestoreFlow } from "./commands/restore.js";
import { runCleanupFlow } from "./commands/cleanup.js";
import { runDropDatabasesFlow } from "./commands/drop-databases.js";
import { mountShell } from "./tui/branding.js";
import { BACK, promptSelect } from "./tui/shared.js";

export async function runApp(): Promise<void> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    backgroundColor: "#0C0C0C",
  });

  renderer.start();
  mountShell(renderer);

  try {
    while (true) {
      const action = await promptSelect(renderer, {
        title: "pgsqlio",
        message: "What do you want to do?",
        choices: [
          {
            name: "Dump",
            description: "Backup one or more databases",
            value: "dump",
          },
          {
            name: "Restore",
            description: "Import a .sql backup into a database",
            value: "restore",
          },
          {
            name: "Cleanup",
            description: "Drop and recreate the public schema",
            value: "cleanup",
          },
          {
            name: "Drop databases",
            description: "Select and permanently drop databases",
            value: "drop-databases",
          },
          {
            name: "Quit",
            description: "Exit pgsqlio",
            value: "quit",
          },
        ],
      });

      if (action === BACK || action === "quit") break;

      if (action === "dump") await runDumpFlow(renderer);
      else if (action === "restore") await runRestoreFlow(renderer);
      else if (action === "cleanup") await runCleanupFlow(renderer);
      else if (action === "drop-databases") await runDropDatabasesFlow(renderer);
    }
  } finally {
    renderer.destroy();
  }
}
