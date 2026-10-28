import websocketPlugin from '@fastify/websocket';
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';

import {
  completeTripSchema,
  registerDeviceSchema,
  sampleBatchSchema,
  startTripSchema,
  wsMessageSchema,
} from './contracts';
import { TelemetryStore, TelemetryStoreError } from './store';
import { createWritableObservationWriter, metricsAuthorized, TelemetryObservability, validateMetricsToken, type ObservationWriter } from './observability';

type BuildServerOptions = {
  dbPath?: string;
  logger?: boolean;
  loggerStream?: ObservationWriter;
  observationClock?: () => number;
  metricsToken?: string;
  now?: () => number;
  liveSessionTtlMs?: number;
  publicWsUrl?: string;
};

const storeErrorBody = (error: TelemetryStoreError) => ({
  code: error.code,
  message: error.message,
  recoverable: false,
});

const bearerToken = (request: FastifyRequest): string | null => {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return null;
  }
  return header.slice('Bearer '.length).trim();
};

const zodErrorBody = (error: z.ZodError) => ({
  code: 'invalid_payload',
  message: 'Request payload failed validation.',
  recoverable: false,
  issues: error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  })),
});

const authenticate = (
  store: TelemetryStore,
  request: FastifyRequest,
  reply: FastifyReply
): string | null => {
  const token = bearerToken(request);
  const deviceId = token ? store.authenticateDevice(token) : null;
  if (!deviceId) {
    void reply.code(401).send({
      code: 'unauthorized',
      message: 'A valid device token is required.',
      recoverable: true,
    });
    return null;
  }
  return deviceId;
};

const publicWsBaseUrl = (request: FastifyRequest, options: BuildServerOptions) => {
  const configured = options.publicWsUrl ?? process.env.V3L0CITY_PUBLIC_WS_URL;
  if (configured) {
    return configured.replace(/\/$/, '');
  }
  const host = request.headers.host ?? 'localhost:8787';
  return `ws://${host}`;
};

export const buildServer = async (
  options: BuildServerOptions = {}
): Promise<{ app: FastifyInstance; store: TelemetryStore; observability: TelemetryObservability }> => {
  validateMetricsToken(options.metricsToken);
  const observability = new TelemetryObservability({
    writer: options.logger ? options.loggerStream ?? createWritableObservationWriter(process.stdout) : undefined,
    clock: options.observationClock,
  });
  const now = options.now ?? Date.now;
  const store = new TelemetryStore(options.dbPath, {
    now,
    liveSessionTtlMs: options.liveSessionTtlMs,
  });
  const app = Fastify({
    ...(options.logger ? { loggerInstance: observability.frameworkLogger() } : { logger: false }),
    disableRequestLogging: true,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
  });
  const started = new WeakMap<FastifyRequest, number>();
  app.addHook('onRequest', async (request, reply) => {
    started.set(request, observability.timestamp());
    reply.header('x-request-id', request.id);
  });
  app.addHook('onResponse', async (request, reply) => {
    observability.httpCompleted(request.id, request.method, request.routeOptions.url, reply.statusCode,
      started.get(request) ?? observability.timestamp());
  });
  observability.storeReadiness(store.isReady());

  if (options.metricsToken) {
    app.get('/internal/metrics', async (request, reply) => {
      reply.header('cache-control', 'no-store');
      if (!metricsAuthorized(request.headers.authorization, options.metricsToken!)) {
        return reply.code(401).send({ code: 'unauthorized', message: 'Metrics authorization required.' });
      }
      try {
        observability.storeReadiness(store.isReady());
        return reply.type('text/plain; version=0.0.4; charset=utf-8').send(observability.prometheus());
      } catch {
        return reply.code(503).send({ code: 'metrics_unavailable', message: 'Metrics are unavailable.' });
      }
    });
  }

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof TelemetryStoreError) {
      return reply.code(error.code === 'trip_not_found' ? 404 : 409).send(storeErrorBody(error));
    }
    const candidate = typeof error === 'object' && error !== null && 'statusCode' in error
      ? error.statusCode : undefined;
    const statusCode = typeof candidate === 'number' && candidate >= 400 && candidate <= 599
      ? candidate : 500;
    // Parser/validation errors can include excerpts of credential-bearing input.
    request.log.error({ statusCode }, 'Request failed.');
    return reply.code(statusCode).send({
      code: 'request_failed',
      message: 'Request could not be completed.',
      recoverable: statusCode >= 500,
    });
  });

  await app.register(websocketPlugin);

  app.post('/v1/devices/register', async (request, reply) => {
    const parsed = registerDeviceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(zodErrorBody(parsed.error));
    }
    return store.registerDevice(parsed.data);
  });

  app.post('/v1/trips', async (request, reply) => {
    const deviceId = authenticate(store, request, reply);
    if (!deviceId) {
      return reply;
    }

    const parsed = startTripSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(zodErrorBody(parsed.error));
    }

    const session = store.createTrip(deviceId, parsed.data);
    return {
      ...session,
      wsUrl: `${publicWsBaseUrl(request, options)}/v1/trips/${encodeURIComponent(
        session.tripId
      )}/live?sessionToken=${encodeURIComponent(session.sessionToken)}`,
    };
  });

  app.post('/v1/trips/:tripId/samples/batch', async (request, reply) => {
    const deviceId = authenticate(store, request, reply);
    if (!deviceId) {
      return reply;
    }
    const { tripId } = request.params as { tripId: string };
    if (!store.validateTripAccess(deviceId, tripId)) {
      return reply.code(404).send({
        code: 'trip_not_found',
        message: 'Trip was not found for this device.',
        recoverable: false,
      });
    }

    const parsed = sampleBatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(zodErrorBody(parsed.error));
    }

    const result = store.insertBatch(tripId, parsed.data);
    return { batchId: parsed.data.batchId, ...result };
  });

  app.post('/v1/trips/:tripId/complete', async (request, reply) => {
    const deviceId = authenticate(store, request, reply);
    if (!deviceId) {
      return reply;
    }
    const { tripId } = request.params as { tripId: string };
    if (!store.validateTripAccess(deviceId, tripId)) {
      return reply.code(404).send({
        code: 'trip_not_found',
        message: 'Trip was not found for this device.',
        recoverable: false,
      });
    }

    const parsed = completeTripSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(zodErrorBody(parsed.error));
    }

    store.completeTrip(tripId, parsed.data);
    return { tripId, completed: true };
  });

  app.get('/v1/trips/:tripId', async (request, reply) => {
    const deviceId = authenticate(store, request, reply);
    if (!deviceId) {
      return reply;
    }
    const { tripId } = request.params as { tripId: string };
    if (!store.validateTripAccess(deviceId, tripId)) {
      return reply.code(404).send({
        code: 'trip_not_found',
        message: 'Trip was not found for this device.',
        recoverable: false,
      });
    }
    const trip = store.getTripSummary(tripId);
    return trip ?? reply.code(404).send({
      code: 'trip_not_found',
      message: 'Trip was not found.',
      recoverable: false,
    });
  });

  app.get('/v1/trips/:tripId/live', { websocket: true }, (socket, request) => {
    const observeClose = observability.socketOpened(request.id);
    socket.on('close', (code) => observeClose(code));
    const { tripId } = request.params as { tripId: string };
    const { sessionToken } = request.query as { sessionToken?: unknown };
    const validateSession = () => {
      try {
        return typeof sessionToken !== 'string' ? null : store.validateLiveSession(tripId, sessionToken);
      } catch {
        observability.storeValidationFailed();
        observability.storeReadiness(store.isReady());
        return null;
      }
    };
    const liveSession = validateSession();

    const closeUnauthorized = () => {
      if (socket.readyState !== socket.OPEN) return;
      socket.send(JSON.stringify({
        type: 'error',
        code: 'unauthorized',
        message: 'A valid live session token is required.',
        recoverable: false,
      }));
      socket.close(1008, 'Live session is no longer authorized.');
    };

    if (!liveSession) {
      closeUnauthorized();
      return;
    }

    const authorized = () => validateSession() != null;
    const unsubscribe = store.onLiveSessionsRevoked((event) => {
      if (event.tripId === tripId && (!event.sessionId || event.sessionId === liveSession.id)) {
        // A WS completion must send its durable acknowledgement before closing.
        queueMicrotask(closeUnauthorized);
      }
    });
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    const checkSession = () => {
      if (socket.readyState !== socket.OPEN) return;
      if (!authorized()) {
        closeUnauthorized();
        return;
      }
      expiryTimer = setTimeout(checkSession,
        Math.max(1, Math.min(1000, Date.parse(liveSession.expires_at) - now())));
      expiryTimer.unref();
    };
    checkSession();
    socket.on('close', () => {
      clearTimeout(expiryTimer);
      unsubscribe();
    });

    socket.on('message', (raw) => {
      if (!authorized()) {
        observability.socketMessage('unauthorized', 'rejected');
        closeUnauthorized();
        return;
      }
      let kind: 'ping' | 'hello' | 'sample_batch' | 'trip_complete' | 'invalid' = 'invalid';
      try {
        const json = JSON.parse(raw.toString());
        const parsed = wsMessageSchema.parse(json);
        kind = parsed.type;

        if (parsed.type === 'ping') {
          observability.socketMessage(kind, 'accepted');
          socket.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        if (parsed.type === 'hello') {
          if (parsed.tripId !== tripId) {
            observability.socketMessage(kind, 'rejected');
            closeUnauthorized();
            return;
          }
          observability.socketMessage(kind, 'accepted');
          socket.send(
            JSON.stringify({
              type: 'ack',
              batchId: 'hello',
              lastSequence: parsed.lastKnownSequence,
            })
          );
          return;
        }

        if (parsed.type === 'sample_batch') {
          const result = store.insertBatch(tripId, {
            batchId: parsed.batchId,
            samples: parsed.samples,
          });
          observability.socketMessage(kind, 'accepted');
          socket.send(
            JSON.stringify({
              type: 'ack',
              batchId: parsed.batchId,
              lastSequence: result.lastSequence,
            })
          );
          return;
        }

        store.completeTrip(tripId, parsed.payload);
        observability.socketMessage(kind, 'accepted');
        socket.send(
          JSON.stringify({
            type: 'ack',
            batchId: 'trip_complete',
            lastSequence: parsed.payload.finalSequence,
          })
        );
      } catch (error) {
        observability.socketMessage(kind, kind === 'invalid' ? 'rejected' : 'error');
        socket.send(
          JSON.stringify({
            type: 'error',
            ...(error instanceof TelemetryStoreError ? storeErrorBody(error) : {
              code: 'invalid_message',
              message: 'Invalid WebSocket message.',
              recoverable: true,
            }),
          })
        );
      }
    });
  });

  app.addHook('onClose', async () => {
    store.close();
    observability.storeReadiness(store.isReady());
  });

  return { app, store, observability };
};
