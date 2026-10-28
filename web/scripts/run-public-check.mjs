import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { publicCheckEnvironment } from "./public-check-environment.mjs";

const webDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buildIdPath = resolve(webDirectory, ".next/BUILD_ID");
const [command, ...args] = process.argv.slice(2);

async function verifyPublicBuild() {
  try {
    const buildId = (await readFile(buildIdPath, "utf8")).trim();
    if (buildId) return;
  } catch { /* Report one actionable error without reading/logging local env. */ }
  throw new Error("Run npm run build:ci before test:e2e; a production .next/BUILD_ID is required.");
}

async function run() {
  if (!["build", "start", "e2e"].includes(command)) {
    throw new Error("Use build, start, or e2e for the public production smoke.");
  }
  if (command !== "build") await verifyPublicBuild();

  const cli = command === "e2e" ? "node_modules/@playwright/test/cli.js" : "scripts/run-next-with-root-env.mjs";
  const cliArguments = command === "e2e" ? ["test", ...args]
    : command === "start" ? ["start", "--hostname", "127.0.0.1", "--port", "3100"] : ["build", ...args];
  const code = await new Promise((done, reject) => {
    const child = spawn(process.execPath, [resolve(webDirectory, cli), ...cliArguments], {
      cwd: webDirectory, env: publicCheckEnvironment(), stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (status) => done(status ?? 1));
  });
  process.exitCode = code;
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
