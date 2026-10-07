import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import WebSocket from 'ws';

import { buildServer } from './app';
import { TelemetryStore, type RegisteredDevice, type TripSession } from './store';
import type { TelemetrySampleInput } from './contracts';

let server: Awaited<ReturnType<typeof buildServer>>;
let address: string | undefined;
const sockets = new Set<WebSocket>();
const startedAt = '2026-10-06T12:00:00.000Z';
const completion = {
  endedAt: '2026-10-06T12:05:00.000Z',
  totalDistanceMeters: 500,
  maxSpeedMps: 18,
  averageSpeedMps: 8,
  finalSequence: 1,
};
const sample: TelemetrySampleInput = {
  sequence: 1, recordedAt: startedAt, elapsedMs: 500, speedMps: 8,
  distanceMeters: 4, headingDegrees: null, headingSource: 'none',
  headingAccuracyDegrees: null, headingQuality: 'poor', headingReasons: [],
  source: 'gps', quality: 'good', qualityScore: 0.9, qualityReasons: [],
  gpsAccuracyMeters: 5, fixAgeMs: 100, nativeSpeedUsed: true,
  isMoving: true, isStopped: false, stale: false,
};

const register = async (installId = 'security-owner-device'): Promise<RegisteredDevice> => {
  const response = await server.app.inject({
    method: 'POST', url: '/v1/devices/register',
    payload: { installId, platform: 'ios', appVersion: '1', buildNumber: '1' },
  });
  assert.equal(response.statusCode, 200);
  return response.json<RegisteredDevice>();
};

const create = (device: RegisteredDevice, overrides: Record<string, unknown> = {}) =>
  server.app.inject({
    method: 'POST', url: '/v1/trips',
    headers: { authorization: `Bearer ${device.deviceToken}` },
    payload: { clientTripId: 'security-trip', startedAt, units: 'MPH', mountLabel: 'dashboard', ...overrides },
  });

const start = async (device: RegisteredDevice): Promise<TripSession> => {
  const response = await create(device);
  assert.equal(response.statusCode, 200);
  return response.json<TripSession>();
};

const complete = (device: RegisteredDevice, payload = completion) => server.app.inject({
  method: 'POST', url: '/v1/trips/security-trip/complete',
  headers: { authorization: `Bearer ${device.deviceToken}` }, payload,
});

const within = async <T>(promise: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([promise, new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Timed out waiting for WebSocket event.')), 2000);
    })]);
  } finally {
    clearTimeout(timer!);
  }
};

const connect = async (sessionToken: string, tripId = 'security-trip', extraQuery = '') => {
  address ??= await server.app.listen({ port: 0, host: '127.0.0.1' });
  const socket = new WebSocket(`${address.replace('http:', 'ws:')}/v1/trips/${tripId}/live?sessionToken=${encodeURIComponent(sessionToken)}${extraQuery}`);
  sockets.add(socket);
  const messages: Record<string, unknown>[] = [];
  socket.on('message', (data) => messages.push(JSON.parse(data.toString())));
  const closed = new Promise<number>((resolve) => socket.once('close', (code) => resolve(code)));
  await within(once(socket, 'open'));
  const message = async (type: string) => {
    const existing = messages.find((entry) => entry.type === type);
    if (existing) return existing;
    return within(new Promise<Record<string, unknown>>((resolve) => {
      const listener = (data: WebSocket.RawData) => {
        const entry = JSON.parse(data.toString()) as Record<string, unknown>;
        if (entry.type === type) {
          socket.off('message', listener);
          resolve(entry);
        }
      };
      socket.on('message', listener);
    }));
  };
  return { socket, messages, closed, message };
};

describe('Telemetry ownership and live authorization regressions', () => {
  beforeEach(async () => {
    address = undefined;
    server = await buildServer({ dbPath: ':memory:' });
  });

  afterEach(async () => {
    for (const socket of sockets) socket.terminate();
    sockets.clear();
    await server.app.close();
  });

  it('reports a closed SQLite handle as unready and allows repeated cleanup', () => {
    const store = new TelemetryStore(':memory:');
    assert.equal(store.isReady(), true);
    store.close();
    assert.equal(store.isReady(), false);
    assert.doesNotThrow(() => store.close());
  });

  it('rejects cross-device trip collisions without changing metadata or issuing a grant', async () => {
    const owner = await register();
    const other = await register('security-other-device');
    const original = await start(owner);
    const denied = await create(other, { units: 'km/h', mountLabel: 'attacker' });
    assert.equal(denied.statusCode, 409);
    assert.equal(denied.json().code, 'trip_id_conflict');
    assert.equal(denied.json().sessionToken, undefined);
    const summary = server.store.getTripSummary(original.tripId)!;
    assert.equal(summary.device_id, owner.deviceId);
    assert.equal(summary.units, 'MPH');
    assert.equal(summary.mount_label, 'dashboard');
    assert.ok(server.store.validateLiveSession(original.tripId, original.sessionToken));

    for (const request of [
      { method: 'GET' as const, url: '/v1/trips/security-trip' },
      { method: 'POST' as const, url: '/v1/trips/security-trip/samples/batch', payload: { batchId: 'denied', samples: [sample] } },
      { method: 'POST' as const, url: '/v1/trips/security-trip/complete', payload: completion },
    ]) {
      const result = await server.app.inject({ ...request, headers: { authorization: `Bearer ${other.deviceToken}` } });
      assert.equal(result.statusCode, 404);
    }
    assert.equal(server.store.getTripSummary(original.tripId)!.sampleCount, 0);
    const live = await connect(original.sessionToken);
    live.socket.send(JSON.stringify({ type: 'ping' }));
    assert.equal((await live.message('pong')).type, 'pong');
  });

  it('preserves original metadata and grants on same-owner active-trip retries', async () => {
    const owner = await register();
    const original = await start(owner);
    const retry = await create(owner, { startedAt: '2026-10-06T13:00:00.000Z', units: 'km/h', mountLabel: 'changed' });
    assert.equal(retry.statusCode, 200);
    const fresh = retry.json<TripSession>();
    assert.equal(fresh.tripId, original.tripId);
    assert.notEqual(fresh.sessionToken, original.sessionToken);
    assert.ok(server.store.validateLiveSession(original.tripId, original.sessionToken));
    assert.ok(server.store.validateLiveSession(fresh.tripId, fresh.sessionToken));
    const summary = server.store.getTripSummary(original.tripId)!;
    assert.equal(summary.started_at, startedAt);
    assert.equal(summary.units, 'MPH');
    assert.equal(summary.mount_label, 'dashboard');
  });

  it('rejects missing/invalid device authorization and wrong-trip live grants', async () => {
    const owner = await register();
    const trip = await start(owner);
    for (const token of ['', 'invalid-token']) {
      const result = await server.app.inject({ method: 'GET', url: '/v1/trips/security-trip', headers: token ? { authorization: `Bearer ${token}` } : {} });
      assert.equal(result.statusCode, 401);
    }
    const wrongTrip = await connect(trip.sessionToken, 'different-trip');
    assert.equal(await within(wrongTrip.closed), 1008);
    assert.equal(wrongTrip.messages[0].code, 'unauthorized');
    const malformed = await connect(trip.sessionToken, trip.tripId, '&sessionToken=second-token');
    assert.equal(await within(malformed.closed), 1008);
  });

  it('closes live access on HTTP completion, rejects reconnect/new writes, and preserves retries', async () => {
    const owner = await register();
    const trip = await start(owner);
    const batch = { batchId: 'before-completion', samples: [sample] };
    const upload = () => server.app.inject({ method: 'POST', url: '/v1/trips/security-trip/samples/batch', headers: { authorization: `Bearer ${owner.deviceToken}` }, payload: batch });
    assert.equal((await upload()).statusCode, 200);
    const live = await connect(trip.sessionToken);
    assert.equal((await complete(owner)).statusCode, 200);
    assert.equal(await within(live.closed), 1008);
    assert.equal(server.store.validateLiveSession(trip.tripId, trip.sessionToken), null);
    const reconnect = await connect(trip.sessionToken);
    assert.equal(await within(reconnect.closed), 1008);
    assert.equal((await create(owner)).json().code, 'trip_completed');
    assert.equal((await create(owner)).statusCode, 409);
    const late = await server.app.inject({ method: 'POST', url: '/v1/trips/security-trip/samples/batch', headers: { authorization: `Bearer ${owner.deviceToken}` }, payload: { batchId: 'after-completion', samples: [{ ...sample, sequence: 2 }] } });
    assert.equal(late.statusCode, 409);
    assert.equal((await upload()).json().duplicate, true);
    assert.equal((await complete(owner)).statusCode, 200);
    assert.equal((await complete(owner, { ...completion, totalDistanceMeters: 999 })).statusCode, 409);
    assert.equal(server.store.getTripSummary(trip.tripId)!.sampleCount, 1);
    assert.equal(server.store.getTripSummary(trip.tripId)!.total_distance_meters, 500);
  });

  it('acknowledges durable WebSocket completion before revoking the connection', async () => {
    const owner = await register();
    const trip = await start(owner);
    const live = await connect(trip.sessionToken);
    live.socket.send(JSON.stringify({ type: 'trip_complete', payload: completion }));
    const ack = await live.message('ack');
    assert.equal(ack.batchId, 'trip_complete');
    assert.equal(await within(live.closed), 1008);
    assert.equal((await complete(owner)).statusCode, 200);
    assert.equal(server.store.getTripSummary(trip.tripId)!.ended_at, completion.endedAt);
  });

  it('revokes one grant immediately while another owner grant remains usable', async () => {
    const owner = await register();
    const first = await start(owner);
    const second = await start(owner);
    const revoked = await connect(first.sessionToken);
    const retained = await connect(second.sessionToken);
    server.store.revokeLiveSession(first.liveSessionId);
    assert.equal(await within(revoked.closed), 1008);
    const retry = await connect(first.sessionToken);
    assert.equal(await within(retry.closed), 1008);
    retained.socket.send(JSON.stringify({ type: 'ping' }));
    assert.equal((await retained.message('pong')).type, 'pong');
    server.store.revokeTripLiveSessions(first.tripId);
    assert.equal(await within(retained.closed), 1008);
  });

  it('revokes all old live grants and bearer authorization on device token rotation', async () => {
    const old = await register();
    const trip = await start(old);
    const live = await connect(trip.sessionToken);
    const rotated = await register();
    assert.equal(rotated.deviceId, old.deviceId);
    assert.equal(await within(live.closed), 1008);
    assert.equal(server.store.authenticateDevice(old.deviceToken), null);
    assert.equal((await create(old)).statusCode, 401);
    const reconnect = await connect(trip.sessionToken);
    assert.equal(await within(reconnect.closed), 1008);
    assert.equal((await create(rotated)).statusCode, 200);
  });

  it('checks expiry at the exact boundary before processing any incoming frame', async () => {
    await server.app.close();
    let clock = Date.parse(startedAt);
    server = await buildServer({ dbPath: ':memory:', now: () => clock, liveSessionTtlMs: 10_000 });
    const owner = await register();
    const trip = await start(owner);
    const live = await connect(trip.sessionToken);
    clock += 10_000;
    live.socket.send(JSON.stringify({ type: 'sample_batch', batchId: 'expired-write', samples: [sample] }));
    assert.equal(await within(live.closed), 1008);
    assert.equal(server.store.getTripSummary(trip.tripId)!.sampleCount, 0);
    assert.equal(live.messages.some((entry) => entry.type === 'ack'), false);
    const reconnect = await connect(trip.sessionToken);
    assert.equal(await within(reconnect.closed), 1008);
  });

  it('closes an idle socket at expiry without waiting for a client message', async () => {
    await server.app.close();
    server = await buildServer({ dbPath: ':memory:', liveSessionTtlMs: 1000 });
    const owner = await register();
    const trip = await start(owner);
    const live = await connect(trip.sessionToken);
    live.socket.send(JSON.stringify({ type: 'ping' }));
    assert.equal((await live.message('pong')).type, 'pong');
    assert.equal(await within(live.closed), 1008);
    assert.equal(live.messages.find((message) => message.type === 'error')?.code, 'unauthorized');
  });

  it('detects persisted revocation through another SQLite connection while idle', async () => {
    await server.app.close();
    const directory = mkdtempSync(join(tmpdir(), 'v3l0city-sec01-'));
    const dbPath = join(directory, 'telemetry.sqlite');
    let external: TelemetryStore | undefined;
    try {
      server = await buildServer({ dbPath });
      const owner = await register();
      const trip = await start(owner);
      const live = await connect(trip.sessionToken);
      external = new TelemetryStore(dbPath);
      external.revokeLiveSession(trip.liveSessionId);
      assert.equal(await within(live.closed), 1008);
      const reconnect = await connect(trip.sessionToken);
      assert.equal(await within(reconnect.closed), 1008);
      const other = await register('other-after-reopen');
      assert.equal((await create(other)).statusCode, 409);
    } finally {
      external?.close();
      for (const socket of sockets) socket.terminate();
      await server.app.close();
      // Remove only the exact database we created, then its empty temp directory.
      rmSync(dbPath, { force: true });
      rmdirSync(directory);
    }
  });

  it('rejects a hello for another trip and avoids echoing malformed payload secrets', async () => {
    const owner = await register();
    const trip = await start(owner);
    const malformed = await connect(trip.sessionToken);
    malformed.socket.send('secret-payload-that-is-not-json');
    const error = await malformed.message('error');
    assert.equal(error.code, 'invalid_message');
    assert.equal(JSON.stringify(error).includes('secret-payload'), false);
    malformed.socket.send(JSON.stringify({ type: 'hello', protocolVersion: 1, tripId: 'another-trip', lastKnownSequence: 500 }));
    assert.equal(await within(malformed.closed), 1008);
    assert.equal(malformed.messages.some((entry) => entry.type === 'ack'), false);
  });

  it('keeps bearer credentials, cookies, and live query tokens out of application logs', async () => {
    await server.app.close();
    const logs: string[] = [];
    server = await buildServer({ dbPath: ':memory:', logger: true, loggerStream: { write: (entry) => { logs.push(entry); } } });
    const owner = await register();
    const trip = await start(owner);
    await server.app.inject({ method: 'GET', url: '/v1/trips/security-trip?other=secret-query-value', headers: { authorization: `Bearer ${owner.deviceToken}`, cookie: 'secret-cookie-value' } });
    const invalidJson = await server.app.inject({ method: 'POST', url: '/v1/trips', headers: { 'content-type': 'application/json', authorization: `Bearer ${owner.deviceToken}` }, payload: '{"secret":"secret-parser-payload", invalid}' });
    assert.equal(invalidJson.statusCode, 400);
    const live = await connect(trip.sessionToken);
    live.socket.send(JSON.stringify({ type: 'ping' }));
    await live.message('pong');
    const combined = logs.join('');
    assert.ok(combined.includes('/v1/trips/security-trip/live'));
    for (const secret of [owner.deviceToken, trip.sessionToken, 'secret-cookie-value', 'secret-query-value', 'secret-parser-payload', 'sessionToken=']) {
      assert.equal(combined.includes(secret), false, 'Application logs must not include credentials or query values.');
    }
  });
});
