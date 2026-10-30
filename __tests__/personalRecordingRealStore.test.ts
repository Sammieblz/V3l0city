import { mkdtempSync, readdirSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

import * as repository from '../src/database/tripRepository';
import { migrateLocalDatabase } from '../src/database/sqliteMigrations';
import { createPersonalRecordingController, type RecordingStore } from '../src/recording/controller';
import type { VelocitySensorsState } from '../src/hooks/useVelocitySensors';
import type { TripSpeedSample } from '../src/domain/trip';

let mockConnection: Database.Database;
const mockDatabase = {
  execSync: (sql: string) => { mockConnection.exec(sql); },
  runSync: (sql: string, ...args: (string | number | null | Uint8Array)[]) => {
    const result = mockConnection.prepare(sql).run(...args);
    return { changes: result.changes, lastInsertRowId: Number(result.lastInsertRowid) };
  },
  getAllSync: <T,>(sql: string, ...args: (string | number | null | Uint8Array)[]): T[] => mockConnection.prepare(sql).all(...args) as T[],
  getFirstSync: <T,>(sql: string, ...args: (string | number | null | Uint8Array)[]): T | null => (mockConnection.prepare(sql).get(...args) as T | undefined) ?? null,
  withTransactionSync: (callback: () => void) => mockConnection.transaction(callback).immediate(),
};
jest.mock('../src/database/database', () => ({ getDatabase: () => mockDatabase }));

const start = Date.parse('2026-10-28T12:00:00.000Z');
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};

describe('personal recording controller integrated with durable SQLite', () => {
  let directory: string;
  let filename: string;
  let clock: number;
  let nextId: number;
  const open = () => {
    mockConnection = new Database(filename);
    mockConnection.pragma('foreign_keys=ON');
    migrateLocalDatabase(mockDatabase, new Date(start).toISOString());
  };
  const reading = (distanceMeters: number, speedMps = 10): VelocitySensorsState => ({
    distanceMeters, speedMps, maxSpeedMps: speedMps, averageSpeedMps: speedMps,
    timestampMs: clock, headingDegrees: null, headingSource: 'none', headingAccuracyDegrees: null,
    headingQuality: 'poor', headingReasons: ['no-heading'], permission: 'granted', status: 'ready',
    quality: 'good', source: 'gps', errorMessage: null, units: 'km/h', stale: false,
    qualityScore: 1, qualityReasons: [], gpsAccuracyMeters: 5, fixAgeMs: 0,
    nativeSpeedUsed: true, motionAvailable: true, gpsAvailable: true, headingAvailable: false,
    isMoving: true, isStopped: false,
  });
  const controller = (store: RecordingStore = repository) => createPersonalRecordingController({
    store, now: () => clock, newId: () => `real-controller-${++nextId}`,
    effects: { started: () => new Promise(() => {}), sample: () => new Promise(() => {}), completed: () => new Promise(() => {}) },
  });
  const begin = async (instance: ReturnType<typeof controller>) => {
    expect(await instance.hydrate()).toBe(true);
    await instance.observe(reading(100));
    expect(await instance.start({ units: 'MPH', mountLabel: 'original mount' })).toBe(true);
    clock += 1000; expect(await instance.observe(reading(110, 20))).toBe(true);
    clock += 1000; expect(await instance.observe(reading(120, 10))).toBe(true);
  };

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'v3l0city-real-controller-'));
    filename = join(directory, 'recording.sqlite'); clock = start; nextId = 0; open();
  });
  afterEach(() => {
    if (mockConnection.open) mockConnection.close();
    for (const name of readdirSync(directory)) {
      expect(['recording.sqlite', 'recording.sqlite-journal', 'recording.sqlite-wal', 'recording.sqlite-shm']).toContain(name);
      rmSync(join(directory, name), { force: true });
    }
    rmdirSync(directory);
  });

  it('finishes with a consistent frozen wall-duration average while external promises remain pending', async () => {
    const instance = controller(); await begin(instance);
    clock = start + 20000;
    expect(await instance.finish()).toBe(true);
    expect(instance.getSnapshot().lastCompleted).toMatchObject({
      totalDistanceMeters: 20, maxSpeedMps: 20, averageSpeedMps: 1, units: 'MPH', mountLabel: 'original mount',
      endedAt: new Date(clock).toISOString(),
    });
    mockConnection.close(); open();
    const [exported] = await repository.getLocalExportSnapshot();
    expect(exported.averageSpeedMps).toBe(1);
    expect(exported.speedSamples.map((item) => item.sequence)).toEqual([1, 2]);
  });

  it.each([0, 150])('rebases recovered SQLite totals against native counter %s without counting old movement twice', async (nativeCounter) => {
    const original = controller(); await begin(original);
    mockConnection.close(); open(); clock = start + 10000;
    const restarted = controller(); expect(await restarted.hydrate()).toBe(true);
    expect(restarted.getSnapshot()).toMatchObject({ recovered: true, session: { state: 'paused', trip: { totalDistanceMeters: 20, maxSpeedMps: 20 } } });
    await restarted.observe(reading(nativeCounter));
    expect(await restarted.resume()).toBe(true);
    clock += 1000; expect(await restarted.observe(reading(nativeCounter + 5))).toBe(true);
    expect(restarted.getSnapshot().session!.trip.totalDistanceMeters).toBe(25);
    expect((await repository.getTripSpeedSamples('real-controller-1')).map((item) => item.distanceMeters)).toEqual([10, 20, 25]);
    expect(await restarted.finish()).toBe(true);
  });

  it('does not advance a checkpoint past a failed pending sample when background/foreground actions were queued', async () => {
    const entered = deferred(); const release = deferred();
    const store: RecordingStore = { ...repository, appendTripSpeedSample: async (sample) => {
      entered.resolve(); await release.promise; return repository.appendTripSpeedSample(sample);
    } };
    const instance = controller(store); await instance.hydrate(); await instance.observe(reading(100));
    await instance.start({ units: 'MPH', mountLabel: 'original mount' });
    mockConnection.exec(`CREATE TRIGGER fail_append BEFORE INSERT ON trip_speed_samples BEGIN SELECT RAISE(ABORT,'deferred sample failure'); END`);
    clock += 1000; const originalTime = clock; const result = instance.observe(reading(110));
    await entered.promise;
    clock += 1000; instance.background();
    clock += 1000; instance.foreground();
    release.resolve(); expect(await result).toBe(false);
    expect(instance.getSnapshot().error).not.toBeNull();
    mockConnection.exec('DROP TRIGGER fail_append'); clock += 1000;
    expect(await instance.retry()).toBe(true);
    expect(instance.getSnapshot().error).toBeNull();
    const samples = await repository.getTripSpeedSamples('real-controller-1');
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({ sequence: 1, recordedAt: new Date(originalTime).toISOString(), distanceMeters: 10 });
    expect((await repository.getRecordingGaps('real-controller-1')).every((gap) => gap.endedAt !== null)).toBe(true);
  });

  it('retries an ambiguously acknowledged completion using the already committed canonical summary and single outbox', async () => {
    let first = true;
    const store: RecordingStore = { ...repository, saveTrip: async (trip) => {
      const result = await repository.saveTrip(trip);
      if (first) { first = false; throw new Error('Synthetic lost completion acknowledgement.'); }
      return result;
    } };
    const instance = controller(store); await begin(instance); clock = start + 10000;
    expect(await instance.finish()).toBe(false);
    expect((await repository.getTrips())[0].recordStatus).toBe('completed');
    clock = start + 20000;
    expect(await instance.retry()).toBe(true);
    expect(instance.getSnapshot().lastCompleted).toMatchObject({ endedAt: new Date(start + 10000).toISOString(), averageSpeedMps: 2 });
    expect(mockConnection.prepare('SELECT count(*) AS count FROM sync_outbox').get()).toEqual({ count: 1 });
    mockConnection.close(); open();
    const restarted = controller(); await restarted.hydrate();
    expect(restarted.getSnapshot().session).toBeNull();
    expect((await repository.getTrips())[0].totalDistanceMeters).toBe(20);
  });

  it('restores a truthful background gap after retrying a failed sample while still backgrounded', async () => {
    const entered = deferred(); const release = deferred();
    const store: RecordingStore = { ...repository, appendTripSpeedSample: async (sample) => {
      entered.resolve(); await release.promise; return repository.appendTripSpeedSample(sample);
    } };
    const instance = controller(store); await instance.hydrate(); await instance.observe(reading(100));
    await instance.start({ units: 'MPH' });
    mockConnection.exec(`CREATE TRIGGER fail_append BEFORE INSERT ON trip_speed_samples BEGIN SELECT RAISE(ABORT,'background sample failure'); END`);
    clock = start + 1000; const pending = instance.observe(reading(110));
    await entered.promise;
    clock = start + 2000; instance.background();
    release.resolve(); expect(await pending).toBe(false);
    mockConnection.exec('DROP TRIGGER fail_append');
    clock = start + 4000; expect(await instance.retry()).toBe(true);
    expect(instance.getSnapshot()).toMatchObject({ background: true, error: null });
    expect(await repository.getRecordingGaps('real-controller-1')).toEqual([
      expect.objectContaining({ reason: 'storage', startedAt: new Date(start + 1000).toISOString(), endedAt: new Date(start + 4000).toISOString() }),
      expect.objectContaining({ reason: 'background', startedAt: new Date(start + 4000).toISOString(), endedAt: null }),
    ]);
    clock = start + 6000; instance.foreground();
    clock = start + 7000; expect(await instance.observe(reading(150))).toBe(true);
    const gaps = await repository.getRecordingGaps('real-controller-1');
    expect(gaps[1]).toMatchObject({ reason: 'background', endedAt: new Date(start + 6000).toISOString() });
    expect((await repository.getTripSpeedSamples('real-controller-1')).map((item) => ({ sequence: item.sequence, recordedAt: item.recordedAt }))).toEqual([
      { sequence: 1, recordedAt: new Date(start + 1000).toISOString() },
      { sequence: 2, recordedAt: new Date(start + 7000).toISOString() },
    ]);
  });

  it('replays an already committed sample when closing its gap failed, preserving the original timestamp', async () => {
    let failClose = true;
    const store: RecordingStore = { ...repository, closeRecordingGap: async (id, at) => {
      if (failClose) { failClose = false; throw new Error('Synthetic gap closure failure.'); }
      return repository.closeRecordingGap(id, at);
    } };
    const instance = controller(store); await instance.hydrate(); await instance.observe(reading(100));
    await instance.start({ units: 'MPH' });
    clock += 1000;
    await instance.observe({ ...reading(100), stale: true });
    // A fresh event is queued after the explicit sampling gap was opened.
    clock += 1000;
    expect(await instance.observe(reading(110))).toBe(false);
    expect((await repository.getTripSpeedSamples('real-controller-1'))).toHaveLength(1);
    const first: TripSpeedSample = (await repository.getTripSpeedSamples('real-controller-1'))[0];
    clock += 1000; expect(await instance.retry()).toBe(true);
    expect((await repository.getTripSpeedSamples('real-controller-1'))[0]).toEqual(first);
    expect(instance.getSnapshot().error).toBeNull();
  });

  it('stores a fractional native iOS event at its original JavaScript Date precision without substituting receipt time', async () => {
    const instance = controller(); await instance.hydrate(); await instance.observe(reading(100));
    await instance.start({ units: 'MPH' });
    clock = start + 1010;
    expect(await instance.observe({ ...reading(110), timestampMs: start + 1000.25 })).toBe(true);
    expect(await repository.getTripSpeedSamples('real-controller-1')).toEqual([
      expect.objectContaining({ sequence: 1, recordedAt: new Date(start + 1000).toISOString(), elapsedMs: 1000, distanceMeters: 10 }),
    ]);
    expect(instance.getSnapshot().error).toBeNull();
  });
});
