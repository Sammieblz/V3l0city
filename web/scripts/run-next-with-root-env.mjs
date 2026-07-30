import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const webDirectory = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(webDirectory, "..");

// Let the standalone web project reuse the native app's local public Supabase
// configuration. This happens before Next/Turbopack starts, which is required
// for NEXT_PUBLIC_* values to be embedded in browser code. Existing web or
// deployment values always take precedence, and no private credential is read.
loadEnvConfig(repositoryRoot);

function applyExpoPublicFallback(nextName, expoName) {
  if (process.env[nextName]?.trim()) return;

  const fallback = process.env[expoName]?.trim();
  if (fallback) process.env[nextName] = fallback;
}

applyExpoPublicFallback("NEXT_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_URL");
applyExpoPublicFallback(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
);

const [nextCommand, ...nextArgs] = process.argv.slice(2);
if (!nextCommand) {
  throw new Error("Provide a Next.js command, for example: dev, build, or start.");
}

const nextCli = resolve(webDirectory, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextCli, nextCommand, ...nextArgs], {
  cwd: webDirectory,
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exitCode = code ?? 1;
});
