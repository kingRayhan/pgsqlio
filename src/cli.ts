function isBun(): boolean {
  return typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
}

function nodeSupportsFfi(): boolean {
  const major = Number(process.versions.node?.split(".")[0] ?? 0);
  // OpenTUI requires Node >= 26.4 with node:ffi
  return major >= 26;
}

function printRuntimeHelp(): void {
  console.error(`pgsqlio needs Bun (≥1.3) or Node.js (≥26.4 with --experimental-ffi).

You're on Node ${process.versions.node ?? "unknown"}.

Run with Bun instead:
  bun dist/cli.js
  bun src/cli.ts

Install Bun: https://bun.sh`);
}

async function main(): Promise<void> {
  if (!isBun() && !nodeSupportsFfi()) {
    printRuntimeHelp();
    process.exit(1);
  }

  const { runApp } = await import("./app.js");
  await runApp();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
