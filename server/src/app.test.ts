import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import WebSocket from 'ws';

import { buildServer } from './app';
import type { TelemetrySampleInput } from './contracts';

let server: Awaited<ReturnType<typeof buildServer>>;

const sample = (sequence = 1): TelemetrySampleInput => ({
  sequence,
  recordedAt: new Date(1_800_000_000_000 + sequence * 500).toISOString(),
  elapsedMs: sequence * 500,
  speedMps: 12.5,
  distanceMeters: 20 + sequence,
  headingDegrees: 91,
  headingSource: 'course',
  headingAccuracyDegrees: 4,
  headingQuality: 'good',
  headingReasons: ['course-used'],
  source: 'blended',
  quality: 'good',
  qualityScore: 0.95,
  qualityReasons: ['native-speed-used'],
  gpsAccuracyMeters: 5,
  fixAgeMs: 100,
  nativeSpeedUsed: true,
  isMoving: true,
  isStopped: false,
  stale: false,
});

const registerAndCreateTrip = async () => {
  const register = await server.app.inject({
    method: 'POST',
    url: '/v1/devices/register',
    payload: {
      installId: 'test-install-123',
      platform: 'ios',
      appVersion: '1.0.0',
      buildNumber: '1',
    },
  });
  assert.equal(register.statusCode, 200);
  const device = register.json<{ deviceId: string; deviceToken: string }>();

  const trip = await server.app.inject({
    method: 'POST',
    url: '/v1/trips',
    headers: {
      authorization: `Bearer ${device.deviceToken}`,
    },
    payload: {
      clientTripId: 'trip-1',
      startedAt: '2026-05-19T12:00:00.000Z',
      units: 'km/h',
      mountLabel: 'top',
    },
  });
  assert.equal(trip.statusCode, 200);
  return {
    device,
    trip: trip.json<{
      tripId: string;
      liveSessionId: string;
      sessionToken: string;
      wsUrl: string;
    }>(),
  };
};

describe('V3l0city telemetry server', () => {
  beforeEach(async () => {
    server = await buildServer({ dbPath: ':memory:' });
  });

  afterEach(async () => {
    await server.app.close();
  });

  it('registers devices and creates live trip sessions', async () => {
    const { device, trip } = await registerAndCreateTrip();

    assert.ok(device.deviceId);
    assert.ok(device.deviceToken);
    assert.equal(trip.tripId, 'trip-1');
    assert.ok(trip.liveSessionId);
    assert.ok(trip.sessionToken);
  });

  it('accepts optional push tokens during device registration', async () => {
    const register = await server.app.inject({
      method: 'POST',
      url: '/v1/devices/register',
      payload: {
        installId: 'test-install-push-123',
        platform: 'android',
        appVersion: '1.0.0',
        buildNumber: '1',
        expoPushToken: 'ExponentPushToken[test-token]',
        nativePushToken: 'native-fcm-token-123',
        pushPlatform: 'android',
      },
    });

    assert.equal(register.statusCode, 200);
    const device = register.json<{ deviceId: string; deviceToken: string }>();
    assert.ok(device.deviceId);
    assert.ok(device.deviceToken);
  });

  it('validates and de-duplicates HTTP sample batches', async () => {
    const { device } = await registerAndCreateTrip();
    const payload = {
      batchId: 'batch-1',
      samples: [sample(1), sample(2)],
    };

    const first = await server.app.inject({
      method: 'POST',
      url: '/v1/trips/trip-1/samples/batch',
      headers: { authorization: `Bearer ${device.deviceToken}` },
      payload,
    });
    assert.equal(first.statusCode, 200);
    assert.equal(first.json<{ inserted: number; lastSequence: number }>().inserted, 2);

    const duplicate = await server.app.inject({
      method: 'POST',
      url: '/v1/trips/trip-1/samples/batch',
      headers: { authorization: `Bearer ${device.deviceToken}` },
      payload,
    });
    assert.equal(duplicate.statusCode, 200);
    assert.equal(duplicate.json<{ duplicate: boolean; inserted: number }>().duplicate, true);
    assert.equal(duplicate.json<{ duplicate: boolean; inserted: number }>().inserted, 0);
  });

  it('accepts older sample payloads without compass diagnostics', async () => {
    const { device } = await registerAndCreateTrip();
    const legacySample = { ...sample(1) } as Record<string, unknown>;
    delete legacySample.headingSource;
    delete legacySample.headingAccuracyDegrees;
    delete legacySample.headingQuality;
    delete legacySample.headingReasons;

    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/trips/trip-1/samples/batch',
      headers: { authorization: `Bearer ${device.deviceToken}` },
      payload: { batchId: 'legacy-batch-1', samples: [legacySample] },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json<{ inserted: number }>().inserted, 1);
  });

  it('completes trips and returns debug summaries', async () => {
    const { device } = await registerAndCreateTrip();
    await server.app.inject({
      method: 'POST',
      url: '/v1/trips/trip-1/samples/batch',
      headers: { authorization: `Bearer ${device.deviceToken}` },
      payload: { batchId: 'batch-1', samples: [sample(1)] },
    });

    const complete = await server.app.inject({
      method: 'POST',
      url: '/v1/trips/trip-1/complete',
      headers: { authorization: `Bearer ${device.deviceToken}` },
      payload: {
        endedAt: '2026-05-19T12:05:00.000Z',
        totalDistanceMeters: 500,
        maxSpeedMps: 18,
        averageSpeedMps: 8,
        finalSequence: 1,
      },
    });
    assert.equal(complete.statusCode, 200);

    const summary = await server.app.inject({
      method: 'GET',
      url: '/v1/trips/trip-1',
      headers: { authorization: `Bearer ${device.deviceToken}` },
    });
    assert.equal(summary.statusCode, 200);
    assert.equal(summary.json<{ sampleCount: number }>().sampleCount, 1);
  });

  it('accepts WebSocket sample batches and sends acknowledgements', async () => {
    const { trip } = await registerAndCreateTrip();
    const address = await server.app.listen({ port: 0 });
    const wsUrl = `${address.replace('http://', 'ws://')}/v1/trips/${
      trip.tripId
    }/live?sessionToken=${encodeURIComponent(trip.sessionToken)}`;

    const ack = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            type: 'sample_batch',
            batchId: 'ws-batch-1',
            samples: [sample(1)],
          })
        );
      });
      ws.on('message', (message) => {
        const parsed = JSON.parse(message.toString()) as Record<string, unknown>;
        ws.close();
        resolve(parsed);
      });
      ws.on('error', reject);
    });

    assert.equal(ack.type, 'ack');
    assert.equal(ack.batchId, 'ws-batch-1');
    assert.equal(ack.lastSequence, 1);
  });
});
