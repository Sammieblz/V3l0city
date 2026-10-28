import type { FastifyInstance } from 'fastify';

import { buildServer } from './app';
import type { RuntimeConfig } from './config';

type RuntimeOptions = {
  logger?: boolean;
  build?: typeof buildServer;
};

export const startRuntime = async (config: RuntimeConfig, options: RuntimeOptions = {}) => {
  const { app, store, observability } = await (options.build ?? buildServer)({
    dbPath: config.dbPath,
    publicWsUrl: config.publicWsUrl,
    logger: options.logger ?? true,
    metricsToken: config.metricsToken,
  });
  let stopping = false;
  let closing: Promise<void> | undefined;
  const close = () => {
    stopping = true;
    if (!closing) {
      app.log.info({ code: 'server_stopping' });
      closing = app.close().then(() => { app.log.info({ code: 'server_stopped' }); });
    }
    return closing;
  };
  try {
    app.get('/health/live', async () => ({ status: 'live', service: 'telemetry' }));
    app.get('/health/ready', async (_request, reply) => {
      const storeReady = store.isReady();
      observability.storeReadiness(storeReady);
      if (stopping || !storeReady) return reply.code(503).send({ status: 'not_ready', service: 'telemetry' });
      return { status: 'ready', service: 'telemetry', apiVersions: [1], productApiEnabled: false };
    });
    await app.listen({ host: config.host, port: config.port });
    app.log.info({ code: 'server_started' });
  } catch (error) {
    await close();
    throw error;
  }
  return { app, store, observability, close };
};

/** One deadline for all signals; a stuck connection cannot defer shutdown forever. */
export const createShutdownHandler = (
  app: Pick<FastifyInstance, 'log'>,
  close: () => Promise<void>,
  timeoutMs: number,
  forceExit: (code: number) => void
) => {
  let pending: Promise<void> | undefined;
  return () => {
    if (pending) return pending;
    const deadline = setTimeout(() => {
      app.log.error({ code: 'shutdown_timeout' }, 'Server shutdown exceeded its deadline.');
      forceExit(1);
    }, timeoutMs);
    deadline.unref();
    pending = Promise.resolve().then(close).catch(() => {
      app.log.error({ code: 'shutdown_failed' }, 'Server shutdown failed.');
      forceExit(1);
    }).finally(() => clearTimeout(deadline));
    return pending;
  };
};
