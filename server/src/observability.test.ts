import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import test from 'node:test';
import WebSocket from 'ws';

import { buildServer } from './app';
import { ConfigurationError, loadRuntimeConfig } from './config';
import { startRuntime } from './runtime';
import { createWritableObservationWriter, type ObservationWriter } from './observability';

const token = 'metrics-secret-'.padEnd(48, 'x');
const startedAt = '2026-10-28T12:00:00.000Z';
const completion = { endedAt: '2026-10-28T12:01:00.000Z', totalDistanceMeters: 5,
  maxSpeedMps: 10, averageSpeedMps: 5, finalSequence: 1 };
const sample = { sequence: 1, recordedAt: startedAt, elapsedMs: 500, speedMps: 8,
  distanceMeters: 4, headingDegrees: null, headingSource: 'none', headingAccuracyDegrees: null,
  headingQuality: 'poor', headingReasons: [], source: 'gps', quality: 'good', qualityScore: 0.9,
  qualityReasons: [], gpsAccuracyMeters: 5, fixAgeMs: 100, nativeSpeedUsed: true,
  isMoving: true, isStopped: false, stale: false };

async function within<T>(promise: Promise<T>, deadlineMs = 3000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Expected telemetry observation was not received.')), deadlineMs);
    })]);
  } finally { clearTimeout(timer); }
}

async function until(check: () => boolean): Promise<void> {
  await within((async () => { while (!check()) await new Promise((resolve) => setTimeout(resolve, 2)); })());
}

async function drain(): Promise<void> {
  for (let turn = 0; turn < 30; turn++) await new Promise<void>((resolve) => setImmediate(resolve));
}

async function recording(server: Awaited<ReturnType<typeof buildServer>>, clientTripId = 'private-personal-trip') {
  const registered = await server.app.inject({ method: 'POST', url: '/v1/devices/register',
    payload: { installId: 'private-install-id', platform: 'ios', appVersion: 'private-version', buildNumber: '1' } });
  assert.equal(registered.statusCode, 200);
  const device = registered.json<{ deviceToken: string }>();
  const created = await server.app.inject({ method: 'POST', url: '/v1/trips',
    headers: { authorization: `Bearer ${device.deviceToken}` },
    payload: { clientTripId, startedAt, units: 'MPH', mountLabel: 'private-mount-label' } });
  assert.equal(created.statusCode, 200);
  return { device, trip: created.json<{ tripId: string; sessionToken: string }>() };
}

async function live(address: string, tripId: string, sessionToken: string) {
  const socket = new WebSocket(`${address.replace('http:', 'ws:')}/v1/trips/${encodeURIComponent(tripId)}/live?sessionToken=${encodeURIComponent(sessionToken)}`);
  const closed = new Promise<number>((resolve) => socket.once('close', resolve));
  await within(once(socket, 'open'));
  const send = async (payload: unknown) => {
    const incoming = once(socket, 'message');
    socket.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
    const [raw] = await within(incoming);
    return JSON.parse(raw.toString()) as Record<string, unknown>;
  };
  return { socket, closed, send };
}

test('HTTP correlation, template metrics and default logs omit hostile request and error data', async () => {
  const logs: string[] = [];
  let clock = 0;
  const server = await buildServer({ dbPath: ':memory:', logger: true,
    loggerStream: { write: (line) => { logs.push(line); } }, observationClock: () => { clock += 25; return clock; } });
  const secret = 'private-request-secret';
  server.app.get('/fault/:id', async () => { throw new Error(`private-database-error ${secret}`); });
  try {
    const { device, trip } = await recording(server);
    const address = await server.app.listen({ port: 0, host: '127.0.0.1' });
    const headers = { authorization: `Bearer ${device.deviceToken}`, 'x-request-id': secret,
      'request-id': secret, traceparent: secret, cookie: `session=${secret}` };
    const first = await server.app.inject({ method: 'GET', url: `/v1/trips/${trip.tripId}?secret=${secret}`, headers });
    const second = await fetch(`${address}/v1/trips/${trip.tripId}?secret=${secret}`, { headers });
    assert.equal(first.statusCode, 200);
    assert.equal(second.status, 200);
    const ids = [first.headers['x-request-id'], second.headers.get('x-request-id')];
    for (const id of ids) assert.match(String(id), /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    assert.notEqual(ids[0], ids[1]);
    assert.equal((await server.app.inject({ method: 'GET', url: `/missing-${secret}?token=${secret}`, headers })).statusCode, 404);
    assert.equal((await server.app.inject({ method: 'GET', url: `/fault/${secret}`, headers })).statusCode, 500);
    assert.equal((await server.app.inject({ method: 'POST', url: '/v1/trips', headers: { ...headers, 'content-type': 'application/json' },
      payload: `{"location":"${secret}", invalid}` })).statusCode, 400);
    await drain();
    const output = logs.join('');
    const metrics = server.observability.prometheus();
    for (const sensitive of [secret, 'private-personal-trip', 'private-install-id', 'private-version', 'private-mount-label',
      'private-database-error', device.deviceToken, trip.sessionToken, address, 'traceparent', 'authorization', 'sessionToken=']) {
      assert.equal(output.includes(sensitive), false, 'Default logs must contain only approved fields.');
      assert.equal(metrics.includes(sensitive), false, 'Metric dimensions must never contain request data.');
    }
    const events = logs.map((line) => JSON.parse(line) as Record<string, unknown>);
    for (const id of ids) assert.ok(events.some((event) => event.requestId === id && event.route === '/v1/trips/:tripId'));
    const series = server.observability.snapshot().http.find((row) => row.route === '/v1/trips/:tripId');
    assert.equal(series?.count, 2);
    assert.equal(series?.status, '2xx');
    assert.equal(series?.durationSeconds, 0.05);
    assert.equal(series?.buckets[1], 2);
    assert.ok(server.observability.snapshot().http.some((row) => row.route === 'unmatched' && row.status === '5xx'));
    assert.equal((await server.app.inject('/v2/trips')).statusCode, 404);
  } finally { await server.app.close(); }
});

test('real sockets record bounded protocol/close outcomes without retaining payloads or close reasons', async () => {
  const logs: string[] = [];
  const server = await buildServer({ dbPath: ':memory:', logger: true, loggerStream: { write: (line) => { logs.push(line); } } });
  const sockets: WebSocket[] = [];
  try {
    const { device, trip } = await recording(server);
    const address = await server.app.listen({ port: 0, host: '127.0.0.1' });
    const connection = await live(address, trip.tripId, trip.sessionToken);
    sockets.push(connection.socket);
    assert.equal(server.observability.snapshot().websocket.active, 1);
    assert.equal((await connection.send({ type: 'ping', privateLocation: 'private-message-location' })).type, 'pong');
    assert.equal((await connection.send('private-malformed-message')).code, 'invalid_message');
    assert.equal((await connection.send({ type: 'sample_batch', batchId: 'private-batch-id', samples: [sample] })).type, 'ack');
    assert.equal(server.store.getTripSummary(trip.tripId)!.sampleCount, 1);
    await server.app.inject({ method: 'POST', url: `/v1/trips/${trip.tripId}/complete`,
      headers: { authorization: `Bearer ${device.deviceToken}` }, payload: completion });
    assert.equal(await within(connection.closed), 1008);
    await until(() => server.observability.snapshot().websocket.active === 0);
    const normal = await recording(server, 'private-next-trip');
    const next = await live(address, normal.trip.tripId, normal.trip.sessionToken);
    sockets.push(next.socket);
    next.socket.close(1000, 'private-close-reason');
    assert.equal(await within(next.closed), 1000);
    await until(() => server.observability.snapshot().websocket.active === 0);
    const snapshot = server.observability.snapshot().websocket;
    assert.equal(snapshot.connections, 2);
    assert.deepEqual(snapshot.messages, { 'ping|accepted': 1, 'invalid|rejected': 1, 'sample_batch|accepted': 1 });
    assert.deepEqual(snapshot.closes, { normal: 1, policy: 1, abnormal: 0, other: 0 });
    await drain();
    const observed = `${logs.join('')}${server.observability.prometheus()}`;
    for (const value of [trip.tripId, trip.sessionToken, device.deviceToken, 'private-message-location',
      'private-malformed-message', 'private-batch-id', 'private-close-reason']) assert.equal(observed.includes(value), false);
    const socketEvents = logs.map((line) => JSON.parse(line)).filter((event) => event.event.startsWith('ws_'));
    assert.equal(socketEvents.length, 4);
    assert.equal(socketEvents[0].requestId, socketEvents[1].requestId);
    assert.notEqual(socketEvents[0].requestId, socketEvents[2].requestId);
  } finally {
    sockets.forEach((socket) => socket.terminate());
    await server.app.close();
  }
});

test('export requires explicit enablement and a bounded secret; failures never echo configuration', () => {
  assert.equal(loadRuntimeConfig({ V3L0CITY_METRICS_TOKEN: token }).metricsToken, undefined);
  assert.equal(loadRuntimeConfig({ V3L0CITY_METRICS_ENABLED: 'true', V3L0CITY_METRICS_TOKEN: token }).metricsToken, token);
  for (const env of [{ V3L0CITY_METRICS_ENABLED: 'true' },
    { V3L0CITY_METRICS_ENABLED: 'true', V3L0CITY_METRICS_TOKEN: 'private-short-secret' },
    { V3L0CITY_METRICS_ENABLED: 'yes' }]) {
    assert.throws(() => loadRuntimeConfig(env), (error: unknown) => {
      assert.ok(error instanceof ConfigurationError);
      assert.doesNotMatch(error.message, /private-short-secret/);
      return true;
    });
  }
});

test('metrics route is absent by default, authenticated when enabled, and SQLite readiness stays truthful', async () => {
  const disabled = await buildServer({ dbPath: ':memory:' });
  try { assert.equal((await disabled.app.inject('/internal/metrics')).statusCode, 404); }
  finally { await disabled.app.close(); }
  const runtime = await startRuntime({ environment: 'test', host: '127.0.0.1', port: 0, dbPath: ':memory:', shutdownTimeoutMs: 1000, metricsToken: token }, { logger: false });
  try {
    for (const request of [
      { url: '/internal/metrics' }, { url: `/internal/metrics?token=${token}` },
      { url: '/internal/metrics', headers: { authorization: 'Bearer incorrect' } },
    ]) assert.equal((await runtime.app.inject(request)).statusCode, 401);
    const fetchMetrics = () => runtime.app.inject({ method: 'GET', url: '/internal/metrics', headers: { authorization: `Bearer ${token}` } });
    const ready = await fetchMetrics();
    assert.equal(ready.statusCode, 200);
    assert.match(String(ready.headers['content-type']), /text\/plain/);
    assert.equal(ready.headers['cache-control'], 'no-store');
    assert.match(ready.body, /v3l0city_telemetry_sqlite_ready 1/);
    const health = (await runtime.app.inject('/health/ready')).json();
    assert.equal(health.productApiEnabled, false);
    assert.deepEqual(health.apiVersions, [1]);
    runtime.store.close();
    assert.equal((await runtime.app.inject('/health/ready')).statusCode, 503);
    const unavailable = await fetchMetrics();
    assert.equal(unavailable.statusCode, 200);
    assert.match(unavailable.body, /v3l0city_telemetry_sqlite_ready 0/);
    assert.doesNotMatch(unavailable.body, /Redis|PostgreSQL|LiveKit|voice|metrics-secret/);
    assert.equal((await runtime.app.inject('/health/live')).statusCode, 200);
  } finally { await runtime.close(); }
});

test('throwing, rejecting and hung observation writers cannot block durable HTTP or live acknowledgements', async () => {
  const writers: ObservationWriter[] = [
    { write: () => { throw new Error('private-sync-observer-secret'); } },
    { write: async () => { throw new Error('private-async-observer-secret'); } },
    { write: () => new Promise(() => {}) },
    createWritableObservationWriter(new Writable({ write(_chunk, _encoding, callback) {
      setImmediate(() => callback(new Error('private-async-stream-secret')));
    } })),
  ];
  for (const writer of writers) {
    const server = await buildServer({ dbPath: ':memory:', logger: true, loggerStream: writer });
    let socket: WebSocket | undefined;
    try {
      const { trip } = await within(recording(server));
      const address = await server.app.listen({ port: 0, host: '127.0.0.1' });
      const connection = await live(address, trip.tripId, trip.sessionToken);
      socket = connection.socket;
      assert.equal((await connection.send({ type: 'sample_batch', batchId: 'survives-monitoring-failure', samples: [sample] })).type, 'ack');
      assert.equal(server.store.getTripSummary(trip.tripId)!.sampleCount, 1);
      await until(() => server.observability.snapshot().monitoring.sinkFailures === 1);
      assert.equal((await connection.send({ type: 'ping' })).type, 'pong');
      assert.equal((await server.app.inject('/still-serving')).statusCode, 404);
      assert.equal(server.observability.snapshot().monitoring.queuedLogs, 0);
    } finally { socket?.terminate(); await server.app.close(); }
  }
});

test('a backpressured Writable completes asynchronously without opening the failure circuit', async () => {
  const entries: string[] = [];
  let drains = 0;
  const stream = new Writable({ highWaterMark: 1, write(chunk, _encoding, callback) {
    entries.push(chunk.toString());
    setImmediate(callback);
  } });
  stream.on('drain', () => { drains++; });
  const writer = createWritableObservationWriter(stream);
  assert.equal(createWritableObservationWriter(stream), writer);
  assert.equal(stream.listenerCount('error'), 1);
  const server = await buildServer({ dbPath: ':memory:', logger: true, loggerStream: writer });
  try {
    for (let index = 0; index < 12; index++) assert.equal((await server.app.inject('/unknown')).statusCode, 404);
    await until(() => entries.length === 12 && server.observability.snapshot().monitoring.queuedLogs === 0);
    assert.ok(drains > 0, 'The fixture must exercise actual Writable backpressure.');
    assert.equal(server.observability.snapshot().monitoring.sinkFailures, 0);
    assert.equal(server.observability.snapshot().monitoring.droppedLogs, 0);
  } finally { await server.app.close(); stream.destroy(); }
});

test('SQLite outage refuses incoming and idle sockets while liveness, readiness and metrics remain available', async () => {
  const runtime = await startRuntime({ environment: 'test', host: '127.0.0.1', port: 0,
    dbPath: ':memory:', shutdownTimeoutMs: 1000, metricsToken: token }, { logger: false });
  const sockets: WebSocket[] = [];
  try {
    const address = runtime.app.server.address();
    assert.ok(address && typeof address !== 'string');
    const origin = `http://127.0.0.1:${address.port}`;
    const { trip } = await recording(runtime);
    const incoming = await live(origin, trip.tripId, trip.sessionToken);
    const idle = await live(origin, trip.tripId, trip.sessionToken);
    sockets.push(incoming.socket, idle.socket);
    runtime.store.close();
    incoming.socket.send(JSON.stringify({ type: 'ping' }));
    assert.equal(await within(incoming.closed), 1008);
    assert.equal(await within(idle.closed), 1008);
    await until(() => runtime.observability.snapshot().websocket.active === 0);
    assert.ok(runtime.observability.snapshot().sqlite.validationFailures >= 2);
    assert.equal(runtime.observability.snapshot().sqlite.ready, 0);
    assert.equal((await runtime.app.inject('/health/ready')).statusCode, 503);
    assert.equal((await runtime.app.inject('/health/live')).statusCode, 200);
    const metrics = await runtime.app.inject({ method: 'GET', url: '/internal/metrics', headers: { authorization: `Bearer ${token}` } });
    assert.equal(metrics.statusCode, 200);
    assert.match(metrics.body, /v3l0city_telemetry_sqlite_ready 0/);
    assert.doesNotMatch(metrics.body, /database connection|private-personal-trip/);
  } finally { sockets.forEach((socket) => socket.terminate()); await runtime.close(); }
});

test('isolated runtime survives a real broken stdout pipe and SQLite outage on message and idle paths', async () => {
  const program = `
    const { startRuntime } = require(process.argv[1]);
    const WebSocket = require(process.argv[2]);
    (async () => {
      const runtime = await startRuntime({ environment:'test',host:'127.0.0.1',port:0,dbPath:':memory:',shutdownTimeoutMs:1000 });
      try {
        const address = runtime.app.server.address();
        const origin = 'http://127.0.0.1:' + address.port;
        const post = async (path, body, token) => (await fetch(origin + path, { method:'POST',
          headers:{'content-type':'application/json', ...(token ? {authorization:'Bearer '+token} : {})}, body:JSON.stringify(body) })).json();
        const device = await post('/v1/devices/register',{installId:'private-child-device',platform:'ios',appVersion:'1',buildNumber:'1'});
        const trip = await post('/v1/trips',{clientTripId:'private-child-trip',startedAt:'2026-10-28T12:00:00Z',units:'MPH',mountLabel:'private-child-mount'},device.deviceToken);
        const connect = () => new Promise((resolve,reject) => {
          const socket = new WebSocket(origin.replace('http:','ws:')+'/v1/trips/'+trip.tripId+'/live?sessionToken='+trip.sessionToken);
          const closed = new Promise(done => socket.once('close',done));
          socket.once('error',reject); socket.once('open',() => resolve({socket,closed}));
        });
        const incoming = await connect(); const idle = await connect();
        runtime.store.close(); incoming.socket.send(JSON.stringify({type:'ping'}));
        const closes = await Promise.all([incoming.closed,idle.closed]);
        const ready = await fetch(origin+'/health/ready'); await ready.text();
        const live = await fetch(origin+'/health/live'); await live.text();
        const stats = runtime.observability.snapshot();
        process.stderr.write(JSON.stringify({ready:ready.status,live:live.status,closes,
          sinkFailures:stats.monitoring.sinkFailures,validationFailures:stats.sqlite.validationFailures}));
      } finally { await runtime.close(); }
    })().catch(() => { process.stderr.write(JSON.stringify({code:'isolated_regression_failed'})); process.exitCode=1; });
  `;
  const child = spawn(process.execPath, ['-e', program, join(__dirname, 'runtime.js'), require.resolve('ws')],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  let errors = '';
  child.stderr.on('data', (chunk: Buffer) => { errors += chunk.toString(); });
  const exited = once(child, 'exit');
  // Closing the actual pipe creates an asynchronous EPIPE in the child's default stdout sink.
  child.stdout.destroy();
  try {
    const [code] = await within(exited, 15_000);
    assert.equal(code, 0, 'Monitoring or SQLite failure must not terminate the runtime.');
    const evidence = JSON.parse(errors);
    assert.equal(evidence.ready, 503);
    assert.equal(evidence.live, 200);
    assert.deepEqual(evidence.closes, [1008, 1008]);
    assert.equal(evidence.sinkFailures, 1);
    assert.ok(evidence.validationFailures >= 2);
    assert.doesNotMatch(errors, /EPIPE|database connection|private-child/);
  } finally { if (child.exitCode === null) child.kill(); }
});

test('bounded pending observation queue drops excess logs while HTTP keeps serving', async () => {
  const server = await buildServer({ dbPath: ':memory:', logger: true, loggerStream: { write: () => new Promise(() => {}) } });
  try {
    for (let index = 0; index < 140; index++) assert.equal((await server.app.inject(`/unknown-private-${index}`)).statusCode, 404);
    const stats = server.observability.snapshot();
    assert.ok(stats.monitoring.queuedLogs <= 100);
    assert.ok(stats.monitoring.droppedLogs > 0);
    assert.equal(stats.http.length, 1);
    assert.equal(stats.http[0].route, 'unmatched');
    assert.equal(stats.http[0].count, 140);
  } finally { await server.app.close(); }
});

test('observation clock failures are isolated and lifecycle diagnostics keep only approved codes', async () => {
  const logs: string[] = [];
  const server = await buildServer({ dbPath: ':memory:', logger: true,
    loggerStream: { write: (line) => { logs.push(line); } },
    observationClock: () => { throw new Error('private-clock-failure'); } });
  try {
    assert.equal((await server.app.inject('/private-url')).statusCode, 404);
    server.app.log.error({ code: 'shutdown_failed', err: new Error('private-runtime-error') }, 'private-runtime-message');
    server.app.log.error({ code: 'private-code' }, 'private-log-message');
    await drain();
    assert.equal(server.observability.snapshot().monitoring.clockFailures, 2);
    assert.match(logs.join(''), /shutdown_failed/);
    assert.match(logs.join(''), /framework_error/);
    assert.doesNotMatch(logs.join(''), /private-/);
  } finally { await server.app.close(); }
});
