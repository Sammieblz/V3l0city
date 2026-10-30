import { mkdtempSync, readdirSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

import { migrateLocalDatabase } from '../src/database/sqliteMigrations';
import {
  appendTripSpeedSample, checkpointRecording, clearTrips, closeRecordingGap, createDraftTrip,
  getLocalExportSnapshot, getRecordingGaps, getTrips, getTripSpeedSamples, importTripsMergeOnly,
  openRecordingGap, recoverRecordings, saveTrip, setRecordingPaused, softDeleteTrip,
} from '../src/database/tripRepository';
import type { Trip, TripSpeedSample } from '../src/domain/trip';

let mockConnection: Database.Database;
const mockDatabase = {
  execSync: (sql: string) => { mockConnection.exec(sql); },
  runSync: (sql: string, ...parameters: (string | number | null | Uint8Array)[]) => {
    const result = mockConnection.prepare(sql).run(...parameters);
    return { changes: result.changes, lastInsertRowId: Number(result.lastInsertRowid) };
  },
  getAllSync: <T,>(sql: string, ...parameters: (string | number | null | Uint8Array)[]): T[] => mockConnection.prepare(sql).all(...parameters) as T[],
  getFirstSync: <T,>(sql: string, ...parameters: (string | number | null | Uint8Array)[]): T | null => (mockConnection.prepare(sql).get(...parameters) as T | undefined) ?? null,
  withTransactionSync: (callback: () => void) => mockConnection.transaction(callback).immediate(),
};

// Bridge only Expo's platform boundary; production migrations, queries,
// constraints, journaling and rollback execute on a real file-backed database.
jest.mock('../src/database/database', () => ({ getDatabase: () => mockDatabase }));

const start = '2026-10-28T12:00:00.000Z';
const at = (seconds: number) => new Date(Date.parse(start) + seconds * 1000).toISOString();
const draft = (id = 'local-recording'): Trip => ({
  id, startedAt: start, endedAt: start, totalDistanceMeters: 0, maxSpeedMps: 0,
  averageSpeedMps: 0, units: 'MPH', mountLabel: 'dashboard', recordStatus: 'draft',
});
const sample = (sequence = 1, tripId = 'local-recording', overrides: Partial<TripSpeedSample> = {}): TripSpeedSample => ({
  tripId, sequence, recordedAt: at(sequence), elapsedMs: sequence * 1000,
  speedMps: sequence === 1 ? 20 : 10, distanceMeters: sequence * 10,
  headingDegrees: null, headingSource: 'none', headingAccuracyDegrees: null,
  headingQuality: 'poor', headingReasons: ['no-heading'], source: 'gps', quality: 'good',
  qualityScore: 1, qualityReasons: [], gpsAccuracyMeters: 5, fixAgeMs: 0,
  nativeSpeedUsed: true, isMoving: true, isStopped: false, stale: false, ...overrides,
});
const count = (table: string) => mockConnection.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number };
const rawTrip = (id = 'local-recording') => mockConnection.prepare('SELECT * FROM trips WHERE id=?').get(id) as Record<string, unknown>;
const rawState = (id = 'local-recording') => mockConnection.prepare('SELECT * FROM recording_states WHERE trip_id=?').get(id) as Record<string, unknown>;

describe('durable personal recording on actual file-backed SQLite', () => {
  let directory: string;
  let filename: string;
  const reopen = () => {
    mockConnection.close();
    mockConnection = new Database(filename);
    mockConnection.pragma('foreign_keys=ON');
    migrateLocalDatabase(mockDatabase, at(0));
  };

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'v3l0city-personal-recording-'));
    filename = join(directory, 'personal.sqlite');
    mockConnection = new Database(filename);
    mockConnection.pragma('foreign_keys=ON');
    migrateLocalDatabase(mockDatabase, at(0));
  });
  afterEach(() => {
    if (mockConnection.open) mockConnection.close();
    for (const name of readdirSync(directory)) {
      expect(['personal.sqlite', 'personal.sqlite-journal', 'personal.sqlite-wal', 'personal.sqlite-shm']).toContain(name);
      rmSync(join(directory, name), { force: true });
    }
    rmdirSync(directory);
  });

  it('preserves canonical draft metadata, samples, upload markers and ownership children on retries and finalization', async () => {
    await createDraftTrip(draft());
    await appendTripSpeedSample(sample());
    mockConnection.exec(`CREATE TABLE ownership_fixture(trip_id TEXT PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,owner TEXT);
      INSERT INTO ownership_fixture VALUES('local-recording','confirmed-owner');`);
    mockConnection.prepare('UPDATE trip_speed_samples SET uploaded_at=?,upload_error=?').run(at(2), 'preserved-marker');
    const before = rawTrip();
    const retried = await createDraftTrip({ ...draft(), totalDistanceMeters: 999 });
    expect(retried.trip.totalDistanceMeters).toBe(10);
    expect(rawTrip()).toEqual(before);
    reopen();
    const completed = await saveTrip({ ...retried.trip, endedAt: at(10), averageSpeedMps: 1 });
    expect(completed.state).toBe('completed');
    expect(completed.trip.maxSpeedMps).toBe(20);
    expect(await getTripSpeedSamples(draft().id)).toEqual([expect.objectContaining({ uploadedAt: at(2), uploadError: 'preserved-marker', recordedAt: at(1) })]);
    expect(mockConnection.prepare('SELECT owner FROM ownership_fixture').get()).toEqual({ owner: 'confirmed-owner' });
    expect(count('sync_outbox').count).toBe(1);
    reopen();
    const retriedSave = await saveTrip({ ...completed.trip, endedAt: at(30), totalDistanceMeters: 999 });
    expect(retriedSave).toEqual(completed);
    expect(count('sync_outbox').count).toBe(1);
    await expect(createDraftTrip(draft())).rejects.toMatchObject({ code: 'completed' });
    await expect(appendTripSpeedSample(sample(2))).rejects.toMatchObject({ code: 'completed' });
    await expect(saveTrip(completed.trip, [sample(2)])).rejects.toMatchObject({ code: 'completed' });
    expect(count('trip_speed_samples').count).toBe(1);
  });

  it('rejects another active start and refuses same-ID metadata changes and tombstone resurrection', async () => {
    await createDraftTrip(draft());
    await expect(createDraftTrip(draft('second'))).rejects.toMatchObject({ code: 'active_recording' });
    await expect(createDraftTrip({ ...draft(), units: 'km/h' })).rejects.toMatchObject({ code: 'invalid_recording' });
    await softDeleteTrip(draft().id);
    await expect(createDraftTrip(draft())).rejects.toMatchObject({ code: 'deleted' });
    await expect(saveTrip({ ...draft(), endedAt: at(10) })).rejects.toMatchObject({ code: 'deleted' });
    expect(rawTrip().deleted_at).not.toBeNull();
    await expect(saveTrip(draft('never-started'))).rejects.toMatchObject({ code: 'not_found' });
  });

  it('commits sample and aggregate checkpoint together and rolls both back on a storage failure', async () => {
    await createDraftTrip(draft());
    const beforeTrip = rawTrip(); const beforeState = rawState();
    mockConnection.exec(`CREATE TRIGGER fail_checkpoint BEFORE UPDATE ON trips BEGIN SELECT RAISE(ABORT,'synthetic checkpoint failure'); END`);
    await expect(appendTripSpeedSample(sample())).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_TRIGGER', message: 'synthetic checkpoint failure' });
    expect(count('trip_speed_samples').count).toBe(0);
    expect(rawTrip()).toEqual(beforeTrip); expect(rawState()).toEqual(beforeState);
    mockConnection.exec('DROP TRIGGER fail_checkpoint');
    const result = await appendTripSpeedSample(sample());
    expect(result.lastSampleSequence).toBe(1); expect(result.trip.totalDistanceMeters).toBe(10);
    expect(result.trip.maxSpeedMps).toBe(20);
    const duplicate = await appendTripSpeedSample(sample());
    expect(duplicate).toEqual(result);
    expect(count('trip_speed_samples').count).toBe(1);
    reopen();
    const recovered = (await recoverRecordings(at(10)))[0];
    expect(recovered.trip).toMatchObject({ totalDistanceMeters: 10, maxSpeedMps: 20 });
  });

  it('keeps draft, open gap and samples recoverable when the completion outbox write fails', async () => {
    await createDraftTrip(draft()); const recorded = await appendTripSpeedSample(sample());
    await setRecordingPaused(draft().id, true, at(3));
    const before = { trip: rawTrip(), state: rawState(), gaps: await getRecordingGaps(draft().id) };
    mockConnection.exec(`CREATE TRIGGER fail_outbox BEFORE INSERT ON sync_outbox BEGIN SELECT RAISE(ABORT,'synthetic outbox failure'); END`);
    const final = { ...recorded.trip, endedAt: at(10), averageSpeedMps: 1 };
    await expect(saveTrip(final)).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_TRIGGER', message: 'synthetic outbox failure' });
    expect(rawTrip()).toEqual(before.trip); expect(rawState()).toEqual(before.state);
    expect(await getRecordingGaps(draft().id)).toEqual(before.gaps);
    expect(count('sync_outbox').count).toBe(0); expect(count('trip_speed_samples').count).toBe(1);
    mockConnection.exec('DROP TRIGGER fail_outbox'); reopen();
    expect((await saveTrip(final)).state).toBe('completed');
    await saveTrip(final);
    expect(count('sync_outbox').count).toBe(1);
    expect((await getRecordingGaps(draft().id))[0].endedAt).toBe(at(10));
  });

  it('recovers every legacy draft, derives persisted peaks and totals, and records restart gaps without fake samples', async () => {
    await createDraftTrip(draft()); await appendTripSpeedSample(sample()); await appendTripSpeedSample(sample(2));
    mockConnection.exec(`DELETE FROM recording_states;
      UPDATE trips SET max_speed_mps=0,total_distance_meters=0;
      INSERT INTO trips(id,started_at,ended_at,record_status,units,mount_label)
        VALUES('legacy-second','2026-10-28T12:00:00.000Z','2026-10-28T12:00:00.000Z','draft','km/h','old mount');`);
    const beforeSamples = await getTripSpeedSamples(draft().id);
    reopen();
    const recovered = await recoverRecordings(at(10));
    expect(recovered).toHaveLength(2);
    const first = recovered.find((item) => item.trip.id === draft().id)!;
    expect(first).toMatchObject({ state: 'paused', lastSampleSequence: 2, lastSampleRecordedAt: at(2),
      trip: { totalDistanceMeters: 20, maxSpeedMps: 20, units: 'MPH', mountLabel: 'dashboard' },
      gaps: [expect.objectContaining({ reason: 'restart', startedAt: at(2), endedAt: null })] });
    expect(await getTripSpeedSamples(draft().id)).toEqual(beforeSamples);
    expect(await recoverRecordings(at(20))).toEqual(recovered);
    await expect(createDraftTrip(draft('new'))).rejects.toMatchObject({ code: 'active_recording' });
    for (const item of recovered) await saveTrip({ ...item.trip, endedAt: at(20) });
    expect((await createDraftTrip(draft('new'))).state).toBe('recording');
  });

  it('persists idempotent pause/resume and explicit background gaps through close/reopen', async () => {
    await createDraftTrip(draft()); await appendTripSpeedSample(sample());
    const paused = await setRecordingPaused(draft().id, true, at(3));
    expect(await setRecordingPaused(draft().id, true, at(4))).toEqual(paused);
    await expect(appendTripSpeedSample(sample(2))).rejects.toMatchObject({ code: 'paused' });
    reopen();
    const resumed = await setRecordingPaused(draft().id, false, at(5));
    expect(await setRecordingPaused(draft().id, false, at(6))).toEqual(resumed);
    expect(resumed.gaps).toEqual([expect.objectContaining({ reason: 'paused', startedAt: at(3), endedAt: at(5) })]);
    expect((await openRecordingGap(draft().id, 'background', at(7))).state).toBe('recording');
    await openRecordingGap(draft().id, 'background', at(8));
    const foreground = await closeRecordingGap(draft().id, at(9));
    expect(foreground.gaps).toHaveLength(2);
    expect(foreground.gaps[1]).toMatchObject({ reason: 'background', startedAt: at(7), endedAt: at(9) });
    expect(count('trip_speed_samples').count).toBe(1);
  });

  it('rejects conflicting, nonfinite, regressing and malformed samples without changing original times', async () => {
    await createDraftTrip(draft()); await appendTripSpeedSample(sample());
    for (const invalid of [sample(1, undefined, { speedMps: 50 }), sample(2, undefined, { speedMps: NaN }),
      sample(2, undefined, { elapsedMs: 1.2 }), sample(2, undefined, { recordedAt: at(0) }),
      sample(2, undefined, { distanceMeters: 1 }), sample(2, undefined, { recordedAt: 'not-a-date' })]) {
      await expect(appendTripSpeedSample(invalid)).rejects.toThrow();
    }
    expect(count('trip_speed_samples').count).toBe(1);
    expect((await getTripSpeedSamples(draft().id))[0].recordedAt).toBe(at(1));
    await appendTripSpeedSample(sample(3));
    expect(await getRecordingGaps(draft().id)).toEqual([expect.objectContaining({ reason: 'sampling', startedAt: at(1), endedAt: at(3) })]);
    expect((await getTripSpeedSamples(draft().id)).map((item) => item.sequence)).toEqual([1, 3]);
  });

  it('rejects a new sample or checkpoint from before the durable resume boundary while preserving exact retries', async () => {
    await createDraftTrip(draft()); const original = sample(); await appendTripSpeedSample(original);
    await setRecordingPaused(draft().id, true, at(3));
    const resumed = await setRecordingPaused(draft().id, false, at(5));
    await expect(appendTripSpeedSample(sample(2, undefined, { recordedAt: at(4), elapsedMs: 4000 }))).rejects.toThrow();
    await expect(checkpointRecording({ ...resumed.trip, endedAt: at(4) })).rejects.toMatchObject({ code: 'invalid_recording' });
    await expect(checkpointRecording({ ...resumed.trip, endedAt: at(6), totalDistanceMeters: 20 },
      sample(2, undefined, { recordedAt: at(4), elapsedMs: 4000 }))).rejects.toMatchObject({ code: 'invalid_sample' });
    expect(await appendTripSpeedSample(original)).toEqual(resumed);
    expect(count('trip_speed_samples').count).toBe(1);
    expect((await appendTripSpeedSample(sample(2, undefined, { recordedAt: at(6), elapsedMs: 6000 }))).lastSampleSequence).toBe(2);
  });

  it('cannot bypass durable pause by supplying unseen buffered samples to finalization', async () => {
    await createDraftTrip(draft()); const recorded = await appendTripSpeedSample(sample());
    const paused = await setRecordingPaused(draft().id, true, at(3));
    const final = { ...recorded.trip, endedAt: at(10), averageSpeedMps: 1 };
    await expect(saveTrip(final, [sample(), sample(2, undefined, { recordedAt: at(4), elapsedMs: 4000 })])).rejects.toMatchObject({ code: 'paused' });
    expect(rawTrip().record_status).toBe('draft');
    expect(count('trip_speed_samples').count).toBe(1); expect(count('sync_outbox').count).toBe(0);
    expect(await getRecordingGaps(draft().id)).toEqual(paused.gaps);
    // A retry of already confirmed data is still safe while paused.
    expect((await saveTrip(final, [sample()])).state).toBe('completed');
    expect(count('trip_speed_samples').count).toBe(1); expect(count('sync_outbox').count).toBe(1);
  });

  it('acknowledges an old exact sample replay after newer commits without changing canonical totals or upload markers', async () => {
    await createDraftTrip(draft()); await appendTripSpeedSample(sample());
    const latest = await appendTripSpeedSample(sample(2));
    mockConnection.prepare('UPDATE trip_speed_samples SET uploaded_at=? WHERE sequence=1').run(at(3));
    expect(await appendTripSpeedSample(sample())).toEqual(latest);
    expect(count('trip_speed_samples').count).toBe(2);
    expect((await getTripSpeedSamples(draft().id))[0].uploadedAt).toBe(at(3));
    await expect(appendTripSpeedSample(sample(1, undefined, { speedMps: 99 }))).rejects.toMatchObject({ code: 'conflicting_sample' });
  });

  it.each(['background', 'paused'] as const)('preserves a known %s interval through restart rather than erasing it', async (reason) => {
    await createDraftTrip(draft()); await appendTripSpeedSample(sample());
    if (reason === 'paused') await setRecordingPaused(draft().id, true, at(3));
    else await openRecordingGap(draft().id, reason, at(3));
    reopen();
    const recovered = (await recoverRecordings(at(10)))[0];
    expect(recovered.gaps).toEqual([
      expect.objectContaining({ reason, startedAt: at(3), endedAt: at(10) }),
      expect.objectContaining({ reason: 'restart', startedAt: at(10), endedAt: null }),
    ]);
    expect(recovered.state).toBe('paused');
    expect(count('trip_speed_samples').count).toBe(1);
  });

  it('keeps a recording recoverable after actual SQLITE_FULL and retries the unchanged sample', async () => {
    await createDraftTrip(draft());
    const pages = mockConnection.pragma('page_count', { simple: true }) as number;
    mockConnection.pragma(`max_page_count=${pages}`);
    const original = sample(1, undefined, { qualityReasons: Array.from({ length: 400 }, (_, index) => `diagnostic-${index}-${'x'.repeat(100)}`) });
    await expect(appendTripSpeedSample(original)).rejects.toMatchObject({ code: 'SQLITE_FULL' });
    expect(count('trip_speed_samples').count).toBe(0); expect(rawState().last_sample_sequence).toBe(0);
    expect(rawTrip().record_status).toBe('draft');
    mockConnection.pragma(`max_page_count=${pages + 256}`);
    await appendTripSpeedSample(original); reopen();
    expect(await getTripSpeedSamples(draft().id)).toEqual([expect.objectContaining({ recordedAt: original.recordedAt, sequence: 1, qualityReasons: original.qualityReasons })]);
  });

  it('clears only completed history and leaves active samples/recovery intact', async () => {
    const first = await createDraftTrip(draft('saved'));
    await saveTrip({ ...first.trip, endedAt: at(1) });
    await createDraftTrip(draft()); await appendTripSpeedSample(sample());
    await clearTrips();
    expect(await getTrips()).toEqual([]);
    expect(rawTrip().deleted_at).toBeNull(); expect(rawTrip('saved').deleted_at).not.toBeNull();
    expect(count('trip_speed_samples').count).toBe(1);
    expect((await recoverRecordings(at(10)))[0].trip.id).toBe(draft().id);
    const before = count('sync_outbox').count; await clearTrips(); expect(count('sync_outbox').count).toBe(before);
  });

  it('exports one coherent completed snapshot with gaps and cannot import over local draft/tombstone/history', async () => {
    await createDraftTrip(draft()); const recorded = await appendTripSpeedSample(sample());
    await openRecordingGap(draft().id, 'background', at(2));
    await saveTrip({ ...recorded.trip, endedAt: at(10) });
    const exported = await getLocalExportSnapshot();
    expect(exported[0].speedSamples).toHaveLength(1);
    expect(exported[0].recordingGaps).toEqual([expect.objectContaining({ reason: 'background', endedAt: at(10) })]);
    const imported = { ...exported[0], speedSamples: [sample(2)] };
    const skipped = await importTripsMergeOnly([imported]);
    expect(skipped).toMatchObject({ tripsSkipped: 1, samplesSkipped: 1, samplesImported: 0 });
    expect(count('trip_speed_samples').count).toBe(1);
    await softDeleteTrip(draft().id); await importTripsMergeOnly([exported[0]]);
    expect(rawTrip().deleted_at).not.toBeNull();
    const second = { ...exported[0], id: 'imported', speedSamples: exported[0].speedSamples.map((item) => ({ ...item, tripId: 'imported' })),
      recordingGaps: exported[0].recordingGaps!.map((gap) => ({ ...gap, id: 'imported-gap', tripId: 'imported' })) };
    await importTripsMergeOnly([second]);
    expect(await getRecordingGaps('imported')).toEqual(second.recordingGaps);
  });

  it('propagates read/recovery/export failures instead of claiming empty history', async () => {
    await createDraftTrip(draft()); mockConnection.close();
    await expect(getTrips()).rejects.toThrow();
    await expect(getTripSpeedSamples(draft().id)).rejects.toThrow();
    await expect(recoverRecordings(at(10))).rejects.toThrow();
    await expect(getLocalExportSnapshot()).rejects.toThrow();
  });

  it('rejects draft imports before writing any completed record or outbox operation', async () => {
    await expect(importTripsMergeOnly([
      { ...draft('completed-import'), recordStatus: 'completed', speedSamples: [] },
      { ...draft('hidden-draft'), speedSamples: [] },
    ])).rejects.toThrow('Finish and save recordings before importing this file.');
    expect(count('trips').count).toBe(0);
    expect(count('sync_outbox').count).toBe(0);
    expect(count('recording_states').count).toBe(0);
  });

  it('does not let an imported opaque gap ID block a new local pause', async () => {
    await importTripsMergeOnly([{ ...draft('imported-history'), endedAt: at(10), recordStatus: 'completed', speedSamples: [],
      recordingGaps: [{ id: 'local-recording:gap:1', tripId: 'imported-history', reason: 'background', startedAt: at(1), endedAt: at(2) }] }]);
    await createDraftTrip(draft());
    const paused = await setRecordingPaused(draft().id, true, at(3));
    expect(paused.gaps).toEqual([expect.objectContaining({ id: 'local-recording:gap:2', reason: 'paused', startedAt: at(3) })]);
    expect((await getRecordingGaps('imported-history'))[0].id).toBe('local-recording:gap:1');
  });

  it('accepts a native aggregate checkpoint during an explicit JS gap without fabricating samples', async () => {
    const started = await createDraftTrip(draft());
    await openRecordingGap(draft().id, 'background', at(1));
    const measured = await checkpointRecording({ ...started.trip, endedAt: at(10), totalDistanceMeters: 150, maxSpeedMps: 20, averageSpeedMps: 15 });
    expect(measured.trip.totalDistanceMeters).toBe(150);
    expect(count('trip_speed_samples').count).toBe(0);
    expect(measured.gaps[0].endedAt).toBeNull();
  });
});
