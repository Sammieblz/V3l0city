import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'node:test';
import { Worker } from 'node:worker_threads';
import Database from 'better-sqlite3';

import { TelemetryStore, type RegisteredDevice, type TripSession } from './store';
import type { StartTripInput } from './contracts';

type Contender = { device: RegisteredDevice; input: StartTripInput };
type RaceResult = {
  actor: number;
  session?: TripSession;
  errorCode?: string;
};

// The workers load the actual compiled store and independent native SQLite
// connections. Shared memory releases both calls only after both are ready.
// Keeping this fixture in the test avoids packaging test workers in production.
const workerSource = `
  const { parentPort, workerData } = require('node:worker_threads');
  const { TelemetryStore, TelemetryStoreError } = require(workerData.storeModule);
  const gate = new Int32Array(workerData.gate);
  let store;
  try {
    store = new TelemetryStore(workerData.dbPath);
    if (store.authenticateDevice(workerData.contender.device.deviceToken) !== workerData.contender.device.deviceId) {
      throw new Error('Contender failed its registered device authentication.');
    }
    parentPort.postMessage({ type: 'ready' });
    const wait = Atomics.wait(gate, 0, 0, 10000);
    if (wait === 'timed-out' || Atomics.load(gate, 0) !== 1) {
      throw new Error('Contender barrier was not released.');
    }
    let result;
    try {
      result = { actor: workerData.actor, session: store.createTrip(workerData.contender.device.deviceId, workerData.contender.input) };
    } catch (error) {
      if (!(error instanceof TelemetryStoreError)) throw error;
      result = { actor: workerData.actor, errorCode: error.code };
    }
    store.close();
    store = undefined;
    parentPort.postMessage({ type: 'result', result });
  } finally {
    if (store) store.close();
  }
`;

it('serializes two device contenders on the same SQLite trip without leaking grants or overwriting the winner', { timeout: 20000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'v3l0city-ownership-race-'));
  const dbPath = join(directory, 'telemetry.sqlite');
  const workers: Worker[] = [];
  let observer: TelemetryStore | undefined;
  let inspection: Database.Database | undefined;
  try {
    observer = new TelemetryStore(dbPath);
    const contenders: Contender[] = [0, 1].map((actor) => ({
      device: observer!.registerDevice({
        installId: `race-registered-device-${actor}`,
        platform: actor === 0 ? 'ios' : 'android', appVersion: 'race', buildNumber: '1',
      }),
      input: {
        clientTripId: 'same-client-trip-id',
        startedAt: actor === 0 ? '2026-10-28T12:00:00.000Z' : '2026-10-28T13:00:00.000Z',
        units: actor === 0 ? 'MPH' : 'km/h', mountLabel: `actor-${actor}`,
      },
    }));
    observer.close();
    observer = undefined;
    const gate = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
    let readyCount = 0;
    const results = await Promise.all(contenders.map((contender, actor) => new Promise<RaceResult>((resolve, reject) => {
      const worker = new Worker(workerSource, {
        eval: true,
        workerData: { actor, contender, dbPath, gate, storeModule: require.resolve('./store') },
      });
      workers.push(worker);
      let result: RaceResult | undefined;
      worker.on('error', reject);
      worker.on('message', (message: { type: string; result?: RaceResult }) => {
        if (message.type === 'ready') {
          readyCount += 1;
          if (readyCount === contenders.length) {
            const barrier = new Int32Array(gate);
            Atomics.store(barrier, 0, 1);
            Atomics.notify(barrier, 0, contenders.length);
          }
        } else if (message.type === 'result') {
          result = message.result;
        }
      });
      worker.on('exit', (code) => {
        if (code !== 0 || !result) reject(new Error(`Contender ${actor} exited without a result (exit ${code}).`));
        else resolve(result);
      });
    })));
    assert.equal(readyCount, 2, 'Both native connections must be ready before release.');
    const winners = results.filter((result) => result.session);
    const losers = results.filter((result) => result.errorCode);
    assert.equal(winners.length, 1);
    assert.equal(losers.length, 1);
    assert.equal(losers[0].errorCode, 'trip_id_conflict');
    assert.equal(losers[0].session, undefined);
    const winner = contenders[winners[0].actor];
    const loser = contenders[losers[0].actor];
    const session = winners[0].session!;

    // Reopen independently: successful return alone cannot prove persistence or
    // that the rejected transaction left no extra live grant behind.
    observer = new TelemetryStore(dbPath);
    const summary = observer.getTripSummary(session.tripId)!;
    assert.equal(summary.device_id, winner.device.deviceId);
    assert.equal(summary.started_at, winner.input.startedAt);
    assert.equal(summary.units, winner.input.units);
    assert.equal(summary.mount_label, winner.input.mountLabel);
    assert.equal(summary.sampleCount, 0);
    assert.equal(summary.ended_at, null);
    assert.equal(observer.validateTripAccess(winner.device.deviceId, session.tripId), true);
    assert.equal(observer.validateTripAccess(loser.device.deviceId, session.tripId), false);
    assert.ok(observer.validateLiveSession(session.tripId, session.sessionToken));
    inspection = new Database(dbPath, { readonly: true });
    assert.equal((inspection.prepare('SELECT count(*) AS count FROM trips').get() as { count: number }).count, 1);
    assert.equal((inspection.prepare('SELECT count(*) AS count FROM live_sessions').get() as { count: number }).count, 1);
    assert.equal((inspection.prepare('SELECT id FROM live_sessions').get() as { id: string }).id, session.liveSessionId);
    assert.throws(() => observer!.createTrip(loser.device.deviceId, loser.input), { code: 'trip_id_conflict' });
    assert.equal((inspection.prepare('SELECT count(*) AS count FROM live_sessions').get() as { count: number }).count, 1);
    assert.ok(observer.validateLiveSession(session.tripId, session.sessionToken));
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
    inspection?.close();
    observer?.close();
    // Only this test's exact database and native journal files may be removed.
    for (const name of readdirSync(directory)) {
      assert.ok(['telemetry.sqlite', 'telemetry.sqlite-journal', 'telemetry.sqlite-wal', 'telemetry.sqlite-shm'].includes(name));
      rmSync(join(directory, name), { force: true });
    }
    rmdirSync(directory);
  }
});
