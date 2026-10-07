import websocketPlugin from '@fastify/websocket';
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

type BuildServerOptions = {
  dbPath?: string;
  logger?: boolean;
  loggerStream?: { write(message: string): void };
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
): Promise<{ app: FastifyInstance; store: TelemetryStore }> => {
  const now = options.now ?? Date.now;
  const store = new TelemetryStore(options.dbPath, {
    now,
    liveSessionTtlMs: options.liveSessionTtlMs,
  });
  const app = Fastify({
    logger: options.logger ? {
      stream: options.loggerStream,
      // Live grants remain in the legacy URL contract, so log only its path.
      serializers: { req: (request) => ({ method: request.method, url: request.url?.split('?')[0] }) },
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    } : false,
  });

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
    const { tripId } = request.params as { tripId: string };
    const { sessionToken } = request.query as { sessionToken?: unknown };
    const liveSession =
      typeof sessionToken !== 'string' ? null : store.validateLiveSession(tripId, sessionToken);

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

    const authorized = () => typeof sessionToken === 'string' &&
      store.validateLiveSession(tripId, sessionToken) != null;
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
        closeUnauthorized();
        return;
      }
      try {
        const json = JSON.parse(raw.toString());
        const parsed = wsMessageSchema.parse(json);

        if (parsed.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        if (parsed.type === 'hello') {
          if (parsed.tripId !== tripId) {
            closeUnauthorized();
            return;
          }
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
        socket.send(
          JSON.stringify({
            type: 'ack',
            batchId: 'trip_complete',
            lastSequence: parsed.payload.finalSequence,
          })
        );
      } catch (error) {
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
  });

  return { app, store };
};
