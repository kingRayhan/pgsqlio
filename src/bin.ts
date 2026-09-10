import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "cli.js");
const args = process.argv.slice(2);

function run(command: string, commandArgs: string[]): void {
  const child = spawn(command, commandArgs, {
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}

if (!existsSync(cli)) {
  console.error("pgsqlio: missing dist/cli.js — run npm run build");
  process.exit(1);
}

const probe = spawn("bun", ["--version"], { stdio: "ignore" });

probe.on("error", () => {
  console.error(`pgsqlio: Bun is required (Node ${process.versions.node} cannot load OpenTUI).

Install Bun: https://bun.sh
Then run: bun dist/cli.js`);
  process.exit(1);
});

probe.on("exit", (code) => {
  if (code === 0) {
    run("bun", [cli, ...args]);
    return;
  }
  console.error(`pgsqlio: Bun is required (Node ${process.versions.node} cannot load OpenTUI).

Install Bun: https://bun.sh
Then run: bun dist/cli.js`);
  process.exit(1);
});
