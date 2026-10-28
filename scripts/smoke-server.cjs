/* global __dirname */
const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const { createServer } = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: pause } = require('node:timers/promises');

const root = path.resolve(__dirname, '..');
const entry = path.join(root, 'dist/server/src/index.js');
const startupTimeout = 15000;
const shutdownTimeout = 5000;

async function freshBuild(directory) {
  for (const item of await fs.readdir(directory, { withFileTypes: true })) {
    const source = path.join(directory, item.name);
    if (item.isDirectory()) await freshBuild(source);
    else if (item.name.endsWith('.ts') && !/\.(test|d)\.ts$/.test(item.name)) {
      const compiled = path.join(root, 'dist', path.relative(root, source).replace(/\.ts$/, '.js'));
      const [before, after] = await Promise.all([fs.stat(source), fs.stat(compiled)]);
      assert.ok(after.isFile() && after.mtimeMs >= before.mtimeMs,
        'Compiled server is stale. Run npm run server:build before server:smoke.');
    }
  }
}

async function availablePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const port = listener.address().port;
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function deadline(promise, milliseconds, message) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

async function smoke() {
  await freshBuild(path.join(root, 'server/src'));
  await freshBuild(path.join(root, 'shared'));
  const parent = await fs.realpath(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(parent, 'v3l0city-server-smoke-'));
  const identity = await fs.lstat(directory);
  let child;
  let closed;
  let outcome;
  let stopping = false;
  let failure;
  let logs = '';
  let processTimer;
  const forbidden = [`smoke-install-${randomUUID()}`, `smoke-trip-${randomUUID()}`];
  try {
    const port = await deadline(availablePort(), 2000, 'Could not allocate a loopback smoke port.');
    const origin = `http://127.0.0.1:${port}`;
    // No inherited provider URLs, NODE_OPTIONS, credentials or service config.
    const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      /^(PATH|SystemRoot|WINDIR|TEMP|TMP|TMPDIR|HOME|USERPROFILE|LANG|LC_ALL)$/i.test(key)));
    child = spawn(process.execPath, [entry], {
      cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...environment, NODE_ENV: 'test', V3L0CITY_ENV: 'test', HOST: '127.0.0.1',
        PORT: String(port), V3L0CITY_SERVER_DB: path.join(directory, 'telemetry.sqlite'),
        V3L0CITY_PUBLIC_WS_URL: `ws://127.0.0.1:${port}`, SHUTDOWN_TIMEOUT_MS: '2000',
        V3L0CITY_METRICS_ENABLED: 'false' },
    });
    const capture = (chunk) => {
      if (Buffer.byteLength(logs) + chunk.length > 1024 * 1024) {
        failure ??= new Error('Compiled server exceeded the bounded smoke log buffer.');
        child.kill('SIGKILL');
      } else logs += chunk.toString();
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.once('error', () => { failure ??= new Error('Compiled server process could not start.'); });
    child.once('exit', (code, signal) => {
      outcome = { code, signal };
      if (!stopping) failure ??= new Error(`Compiled server exited unexpectedly (code ${code}, signal ${signal}).`);
    });
    closed = new Promise((resolve) => child.once('close', resolve));
    processTimer = setTimeout(() => {
      failure ??= new Error('Compiled server smoke exceeded its process deadline.');
      child.kill('SIGKILL');
    }, 40000);
    const alive = () => {
      if (failure) throw failure;
      assert.ok(!outcome && child.exitCode === null && child.signalCode === null,
        'Compiled server exited before the smoke completed.');
    };
    const request = async (label, route, body, token) => {
      alive();
      const response = await fetch(origin + route, {
        method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(2000),
        headers: { connection: 'close', ...(body ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      alive();
      assert.equal(response.status, 200, `${label} must succeed over HTTP.`);
      try { return await response.json(); } catch { throw new Error(`${label} returned invalid JSON.`); }
    };
    const started = Date.now();
    while (!logs.includes('"server_started"')) {
      alive();
      assert.ok(Date.now() - started < startupTimeout, 'Compiled server startup deadline exceeded.');
      await pause(50);
    }
    // Only probe after this child reports a successful bind; never accept a stale listener.
    assert.deepEqual(await request('readiness', '/health/ready'), {
      status: 'ready', service: 'telemetry', apiVersions: [1], productApiEnabled: false,
    });
    assert.equal((await request('liveness', '/health/live')).status, 'live');
    const device = await request('registration', '/v1/devices/register', {
      installId: forbidden[0], platform: 'smoke', appVersion: '0.0.0-smoke', buildNumber: '1',
    });
    assert.ok(typeof device.deviceToken === 'string' && device.deviceToken.length > 0);
    const trip = await request('trip start', '/v1/trips', {
      clientTripId: forbidden[1], startedAt: '2026-10-28T12:00:00.000Z', units: 'MPH',
    }, device.deviceToken);
    assert.ok(trip.tripId === forbidden[1] && typeof trip.sessionToken === 'string');
    forbidden.push(device.deviceId, device.deviceToken, trip.sessionToken, trip.liveSessionId);
    const complete = await request('trip save', `/v1/trips/${encodeURIComponent(trip.tripId)}/complete`, {
      endedAt: '2026-10-28T12:01:00.000Z', totalDistanceMeters: 0,
      maxSpeedMps: 0, averageSpeedMps: 0, finalSequence: 0,
    }, device.deviceToken);
    assert.equal(complete.completed, true);
    const saved = await request('saved trip', `/v1/trips/${encodeURIComponent(trip.tripId)}`, undefined, device.deviceToken);
    assert.ok(saved.ended_at === '2026-10-28T12:01:00.000Z' && saved.sampleCount === 0,
      'Saved legacy summary must retain completion and sample count.');
    assert.ok((await fs.stat(path.join(directory, 'telemetry.sqlite'))).size > 0);
    alive();
    stopping = true;
    assert.equal(child.kill('SIGTERM'), true, 'Could not request compiled server shutdown.');
    await deadline(closed, shutdownTimeout, 'Compiled server shutdown deadline exceeded.');
    if (failure) throw failure;
    if (process.platform === 'win32') {
      assert.equal(outcome.signal, 'SIGTERM', 'Unexpected Windows process termination.');
    } else {
      assert.deepEqual(outcome, { code: 0, signal: null }, 'SIGTERM must finish gracefully.');
    }
    for (const value of forbidden) {
      assert.ok(typeof value === 'string' && value.length > 0);
      assert.ok(!logs.includes(value), 'Default compiled server logs exposed a synthetic credential or raw identifier.');
    }
  } catch (error) { failure ??= error; } finally {
    clearTimeout(processTimer);
    if (child && !outcome) {
      child.kill('SIGKILL');
      try { await deadline(closed, shutdownTimeout, 'Compiled server cleanup deadline exceeded.'); }
      catch (error) { failure ??= error; }
    }
    try {
      const current = await fs.lstat(directory);
      assert.ok(!current.isSymbolicLink() && current.dev === identity.dev && current.ino === identity.ino);
      assert.equal(await fs.realpath(directory), directory);
      assert.equal(path.dirname(directory), parent);
      assert.ok(path.basename(directory).startsWith('v3l0city-server-smoke-'));
      await fs.rm(directory, { recursive: true, force: false, maxRetries: 2, retryDelay: 100 });
    } catch (error) { failure ??= error; }
  }
  if (failure) throw failure;
  console.log(`Compiled server HTTP/save/redaction smoke passed; ${process.platform === 'win32'
    ? 'Windows process termination checked (not Unix graceful-signal evidence).'
    : 'SIGTERM exited gracefully with code 0.'}`);
}

smoke().catch((error) => {
  // Child logs are deliberately retained in memory, never dumped on failure.
  console.error(error.message);
  process.exitCode = 1;
});
