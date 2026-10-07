import { ConfigurationError, loadRuntimeConfig } from './config';
import { createShutdownHandler, startRuntime } from './runtime';

export const main = async () => {
  const config = loadRuntimeConfig();
  const runtime = await startRuntime(config);
  let requestShutdown: () => void;
  const close = () => runtime.close().finally(() => {
    process.off('SIGINT', requestShutdown);
    process.off('SIGTERM', requestShutdown);
  });
  const shutdown = createShutdownHandler(runtime.app, close, config.shutdownTimeoutMs, (code) => process.exit(code));
  requestShutdown = () => { void shutdown(); };
  process.on('SIGINT', requestShutdown);
  process.on('SIGTERM', requestShutdown);
  return { ...runtime, close };
};

if (require.main === module) {
  void main().catch((error: unknown) => {
    // Driver locations, credentials and raw database errors never belong in startup logs.
    const details = error instanceof ConfigurationError ? { fields: error.fields } : {};
    process.stderr.write(`${JSON.stringify({ level: 'error', code: 'startup_failed', ...details })}\n`);
    process.exitCode = 1;
  });
}
