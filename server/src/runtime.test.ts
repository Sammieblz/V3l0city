import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { join } from 'node:path';
import test from 'node:test';

import { buildServer } from './app';
import { ConfigurationError, loadRuntimeConfig, type RuntimeConfig } from './config';
import { createShutdownHandler, startRuntime } from './runtime';

const config: RuntimeConfig = {
  environment: 'test', host: '127.0.0.1', port: 0, dbPath: ':memory:', shutdownTimeoutMs: 1000,
};

test('configuration rejects malformed values and deployment omissions without echoing input', () => {
  for (const env of [
    { PORT: '8787junk' }, { PORT: '-1' }, { PORT: '65536' }, { HOST: ' ' },
    { SHUTDOWN_TIMEOUT_MS: 'NaN' }, { V3L0CITY_ENV: 'prod' },
    { V3L0CITY_PUBLIC_WS_URL: 'https://example.com' },
    { V3L0CITY_PUBLIC_WS_URL: 'wss://user:super-secret@example.com' },
    { V3L0CITY_PUBLIC_WS_URL: 'wss://example.com/live?sessionToken=secret' },
    { V3L0CITY_ENV: 'staging' },
    { NODE_ENV: 'production', V3L0CITY_PUBLIC_WS_URL: 'ws://example.com' },
    { V3L0CITY_ENV: 'production', V3L0CITY_PUBLIC_WS_URL: 'wss://example.com', V3L0CITY_SERVER_DB: ':memory:' },
  ]) {
    assert.throws(() => loadRuntimeConfig(env), (error: unknown) => {
      assert.ok(error instanceof ConfigurationError);
      assert.ok(error.fields.length > 0);
      assert.doesNotMatch(error.message, /super-secret|sessionToken|example\.com/);
      return true;
    });
  }
  assert.equal(loadRuntimeConfig({}).port, 8787);
  assert.equal(loadRuntimeConfig({ PORT: '9000', V3L0CITY_PUBLIC_WS_URL: 'ws://localhost:9000/' }).publicWsUrl, 'ws://localhost:9000');
});

test('runtime serves truthful health over HTTP and closes its store once', async () => {
  const runtime = await startRuntime(config, { logger: false });
  try {
    const address = runtime.app.server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/health/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: 'ready', service: 'telemetry', apiVersions: [1], productApiEnabled: false,
    });
    assert.equal((await runtime.app.inject('/health/live')).json().status, 'live');
    const first = runtime.close();
    assert.equal(runtime.close(), first);
    await first;
    assert.equal(runtime.app.server.listening, false);
    assert.throws(() => runtime.store.getTripSummary('missing'), /not open|closed/);
  } finally {
    await runtime.close();
  }
});

test('failed bind releases the database and server resources', async () => {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const address = listener.address();
  assert.ok(address && typeof address !== 'string');
  let closed = false;
  try {
    await assert.rejects(startRuntime({ ...config, port: address.port }, {
      logger: false,
      build: async (options) => {
        const runtime = await buildServer(options);
        runtime.app.addHook('onClose', async () => { closed = true; });
        return runtime;
      },
    }), { code: 'EADDRINUSE' });
    assert.equal(closed, true);
  } finally {
    await new Promise<void>((resolve) => listener.close(() => resolve()));
  }
});

test('readiness fails closed when its actual telemetry store is unavailable', async () => {
  const runtime = await startRuntime(config, { logger: false });
  try {
    runtime.store.close();
    const response = await runtime.app.inject('/health/ready');
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), { status: 'not_ready', service: 'telemetry' });
    assert.equal((await runtime.app.inject('/health/live')).statusCode, 200);
  } finally { await runtime.close(); }
});

test('operational route registration failures also close the built store', async () => {
  let store: Awaited<ReturnType<typeof buildServer>>['store'] | undefined;
  await assert.rejects(startRuntime(config, {
    logger: false,
    build: async (options) => {
      const built = await buildServer(options);
      store = built.store;
      built.app.get('/health/live', async () => ({}));
      return built;
    },
  }), /already declared/);
  assert.equal(store?.isReady(), false);
});

test('repeated shutdown signals share one close and a stuck close reaches the deadline', async () => {
  const runtime = await buildServer({ dbPath: ':memory:' });
  let closeCalls = 0;
  let finish!: () => void;
  const forced: number[] = [];
  const close = new Promise<void>((resolve) => { finish = resolve; });
  const shutdown = createShutdownHandler(runtime.app, () => { closeCalls++; return close; }, 15, (code) => forced.push(code));
  const pending = shutdown();
  assert.equal(shutdown(), pending);
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(closeCalls, 1);
  assert.deepEqual(forced, [1]);
  finish();
  await pending;
  await runtime.app.close();
});

test('compiled entrypoint fails fast with redacted structured configuration error', async () => {
  const child = spawn(process.execPath, [join(__dirname, 'index.js')], {
    env: { ...process.env, V3L0CITY_ENV: 'test', PORT: 'secret-token' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); });
  const [code] = await once(child, 'exit');
  assert.equal(code, 1);
  assert.deepEqual(JSON.parse(output), { level: 'error', code: 'startup_failed', fields: ['PORT'] });
  assert.doesNotMatch(output, /secret-token/);
});
