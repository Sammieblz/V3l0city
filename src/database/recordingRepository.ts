import type { RecordingGap, RecordingGapReason, RecordingSession, RecordingState, Trip, TripSpeedSample } from '../domain/trip';
import { getDatabase } from './database';

type LocalDatabase = ReturnType<typeof getDatabase>;
type TripRow = {
  id: string; started_at: string; ended_at: string; total_distance_meters: number;
  max_speed_mps: number; average_speed_mps: number; units: string; mount_label: string | null;
  record_status: string; local_updated_at: string; deleted_at: string | null;
  cloud_synced_at: string | null; cloud_sync_error: string | null; sync_status: string;
};
type StateRow = {
  trip_id: string; state: RecordingState; checkpoint_at: string; last_sample_sequence: number;
  last_sample_recorded_at: string | null; last_sample_elapsed_ms: number;
};
type GapRow = { id: string; trip_id: string; reason: RecordingGapReason; started_at: string; ended_at: string | null };
type SampleRow = Record<string, unknown> & {
  sequence: number; recorded_at: string; elapsed_ms: number; distance_meters: number; speed_mps: number;
};

export class RecordingStoreError extends Error {
  constructor(readonly code: 'not_found' | 'deleted' | 'completed' | 'active_recording' | 'paused' | 'invalid_recording' | 'invalid_sample' | 'conflicting_sample' | 'invalid_transition', message: string) {
    super(message);
    this.name = 'RecordingStoreError';
  }
}

const fail = (code: RecordingStoreError['code'], message: string): never => { throw new RecordingStoreError(code, message); };
const time = (value: string): number => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return fail('invalid_recording', 'A valid recording timestamp is required.');
  return Date.parse(value);
};
const finiteNonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const now = () => new Date().toISOString();
const mapTrip = (row: TripRow): Trip => ({
  id: row.id, startedAt: row.started_at, endedAt: row.ended_at,
  totalDistanceMeters: row.total_distance_meters, maxSpeedMps: row.max_speed_mps,
  averageSpeedMps: row.average_speed_mps, units: row.units as Trip['units'], mountLabel: row.mount_label ?? undefined,
  recordStatus: row.record_status as Trip['recordStatus'], localUpdatedAt: row.local_updated_at,
  deletedAt: row.deleted_at, cloudSyncedAt: row.cloud_synced_at,
  cloudSyncError: row.cloud_sync_error, syncStatus: row.sync_status as Trip['syncStatus'],
});
const readTrip = (db: LocalDatabase, id: string): TripRow => {
  const row = db.getFirstSync<TripRow>('SELECT * FROM trips WHERE id = ?', id);
  if (!row) return fail('not_found', 'The local recording was not found.');
  if (row.deleted_at != null) return fail('deleted', 'A deleted recording cannot be changed.');
  return row;
};
const readState = (db: LocalDatabase, row: TripRow): StateRow => {
  const existing = db.getFirstSync<StateRow>('SELECT * FROM recording_states WHERE trip_id = ?', row.id);
  if (existing) return existing;
  const last = db.getFirstSync<SampleRow>('SELECT * FROM trip_speed_samples WHERE trip_id = ? ORDER BY sequence DESC LIMIT 1', row.id);
  const state: StateRow = { trip_id: row.id, state: row.record_status === 'completed' ? 'completed' : 'paused',
    checkpoint_at: row.ended_at, last_sample_sequence: last?.sequence ?? 0,
    last_sample_recorded_at: last?.recorded_at ?? null, last_sample_elapsed_ms: last?.elapsed_ms ?? 0 };
  db.runSync(`INSERT INTO recording_states
    (trip_id,state,checkpoint_at,last_sample_sequence,last_sample_recorded_at,last_sample_elapsed_ms) VALUES (?,?,?,?,?,?)`,
  row.id, state.state, state.checkpoint_at, state.last_sample_sequence, state.last_sample_recorded_at, state.last_sample_elapsed_ms);
  return state;
};
const gapsIn = (db: LocalDatabase, id: string): RecordingGap[] => db.getAllSync<GapRow>(
  'SELECT * FROM recording_gaps WHERE trip_id = ? ORDER BY started_at ASC, id ASC', id,
).map((row) => ({ id: row.id, tripId: row.trip_id, reason: row.reason, startedAt: row.started_at, endedAt: row.ended_at }));
export const readRecordingGaps = gapsIn;

/** Import only into a newly inserted personal recording, in its caller's transaction. */
export const importRecordingGaps = (db: LocalDatabase, trip: Trip, gaps: RecordingGap[]): void => {
  const reasons: RecordingGapReason[] = ['restart', 'background', 'paused', 'permission', 'sensor', 'storage', 'sampling'];
  for (const gap of gaps) {
    if (!gap.id || gap.tripId !== trip.id || !reasons.includes(gap.reason)
      || time(gap.startedAt) < time(trip.startedAt)
      || (gap.endedAt !== null && (time(gap.endedAt) < time(gap.startedAt) || time(gap.endedAt) > time(trip.endedAt)))
      || ((trip.recordStatus ?? 'completed') === 'completed' && gap.endedAt === null)) {
      fail('invalid_recording', 'Imported continuity information does not match its recording.');
    }
    db.runSync('INSERT INTO recording_gaps (id,trip_id,reason,started_at,ended_at) VALUES (?,?,?,?,?)',
      gap.id, gap.tripId, gap.reason, gap.startedAt, gap.endedAt);
  }
};

const sessionIn = (db: LocalDatabase, id: string): RecordingSession => {
  const row = readTrip(db, id);
  const state = readState(db, row);
  const gaps = gapsIn(db, id);
  return { trip: { ...mapTrip(row), recordingGaps: gaps }, state: state.state,
    checkpointAt: state.checkpoint_at, lastSampleSequence: state.last_sample_sequence,
    lastSampleRecordedAt: state.last_sample_recorded_at, lastSampleElapsedMs: state.last_sample_elapsed_ms, gaps };
};
const active = (row: TripRow, state: StateRow): void => {
  if (row.record_status !== 'draft' || state.state === 'completed') fail('completed', 'This recording is already saved.');
};
const metadata = (row: TripRow, trip: Trip): void => {
  if (row.started_at !== trip.startedAt || row.units !== trip.units || row.mount_label !== (trip.mountLabel ?? null)) {
    fail('invalid_recording', 'Recording identity, units and mount must match the original recording.');
  }
};
const validateTrip = (trip: Trip): void => {
  if (!trip.id || !['km/h', 'MPH'].includes(trip.units) || time(trip.endedAt) < time(trip.startedAt)
    || ![trip.totalDistanceMeters, trip.maxSpeedMps, trip.averageSpeedMps].every(finiteNonnegative)) {
    fail('invalid_recording', 'Recording totals and timestamps must be valid.');
  }
};
const validateSample = (sample: TripSpeedSample, row: TripRow): void => {
  if (sample.tripId !== row.id || !Number.isSafeInteger(sample.sequence) || sample.sequence < 1
    || !Number.isSafeInteger(sample.elapsedMs) || sample.elapsedMs < 0
    || ![sample.speedMps, sample.distanceMeters, sample.qualityScore].every(finiteNonnegative)
    || sample.qualityScore > 1 || time(sample.recordedAt) < time(row.started_at)
    || ![sample.headingDegrees, sample.headingAccuracyDegrees, sample.gpsAccuracyMeters, sample.fixAgeMs]
      .every((value) => value === null || finiteNonnegative(value))
    || (sample.headingDegrees !== null && sample.headingDegrees >= 360)
    || !['gps', 'none', 'blended', 'motion-only'].includes(sample.source)
    || !['good', 'medium', 'poor'].includes(sample.quality)
    || !['none', 'course', 'device'].includes(sample.headingSource)
    || !['good', 'medium', 'poor'].includes(sample.headingQuality)
    || ![sample.headingReasons, sample.qualityReasons].every((values) => Array.isArray(values) && values.every((value) => typeof value === 'string'))
    || ![sample.nativeSpeedUsed, sample.isMoving, sample.isStopped, sample.stale].every((value) => typeof value === 'boolean')) {
    fail('invalid_sample', 'The sample is invalid; its original time and sequence were not changed.');
  }
};
const sampleValues = (sample: TripSpeedSample): unknown[] => [
  sample.tripId, sample.sequence, sample.recordedAt, sample.elapsedMs, sample.speedMps, sample.distanceMeters,
  sample.headingDegrees, sample.headingSource, sample.headingAccuracyDegrees, sample.headingQuality, JSON.stringify(sample.headingReasons),
  sample.source, sample.quality, sample.qualityScore, JSON.stringify(sample.qualityReasons), sample.gpsAccuracyMeters, sample.fixAgeMs,
  Number(sample.nativeSpeedUsed), Number(sample.isMoving), Number(sample.isStopped), Number(sample.stale),
];
const sampleColumns = ['trip_id', 'sequence', 'recorded_at', 'elapsed_ms', 'speed_mps', 'distance_meters',
  'heading_degrees', 'heading_source', 'heading_accuracy_degrees', 'heading_quality', 'heading_reasons',
  'source', 'quality', 'quality_score', 'quality_reasons', 'gps_accuracy_meters', 'fix_age_ms', 'native_speed_used', 'is_moving', 'is_stopped', 'stale'];

const insertSample = (db: LocalDatabase, row: TripRow, state: StateRow, sample: TripSpeedSample): boolean => {
  validateSample(sample, row);
  const existing = db.getFirstSync<SampleRow>('SELECT * FROM trip_speed_samples WHERE trip_id = ? AND sequence = ?', row.id, sample.sequence);
  const values = sampleValues(sample);
  if (existing) {
    if (sampleColumns.some((column, index) => existing[column] !== values[index])) {
      fail('conflicting_sample', 'A different sample already occupies that sequence.');
    }
    return false;
  }
  if (sample.sequence <= state.last_sample_sequence || sample.elapsedMs < state.last_sample_elapsed_ms
    || time(sample.recordedAt) < time(state.checkpoint_at)
    || (state.last_sample_recorded_at !== null && time(sample.recordedAt) <= time(state.last_sample_recorded_at))
    || sample.distanceMeters < row.total_distance_meters) {
    fail('invalid_sample', 'The sample moved behind the last confirmed recording checkpoint.');
  }
  if (sample.sequence > state.last_sample_sequence + 1) {
    const start = state.last_sample_recorded_at ?? row.started_at;
    insertGap(db, row.id, 'sampling', start, sample.recordedAt);
  }
  db.runSync(`INSERT INTO trip_speed_samples (${sampleColumns.join(',')},uploaded_at,upload_error)
    VALUES (${sampleColumns.map(() => '?').join(',')},NULL,NULL)`, ...(values as (string | number | null)[]));
  return true;
};

function insertGap(db: LocalDatabase, tripId: string, reason: RecordingGapReason, startedAt: string, endedAt: string | null): void {
  let ordinal = db.getFirstSync<{ count: number }>('SELECT count(*) AS count FROM recording_gaps WHERE trip_id = ?', tripId)?.count ?? 0;
  // Imported gap IDs are opaque and globally unique; another recording's
  // imported ID must not make a later local pause or restart impossible.
  let id: string;
  do { id = `${tripId}:gap:${++ordinal}`; }
  while (db.getFirstSync('SELECT id FROM recording_gaps WHERE id=?', id));
  db.runSync('INSERT INTO recording_gaps (id,trip_id,reason,started_at,ended_at) VALUES (?,?,?,?,?)',
    id, tripId, reason, startedAt, endedAt);
}
const validateEvent = (row: TripRow, state: StateRow, at: string): void => {
  if (time(at) < Math.max(time(row.started_at), time(state.checkpoint_at), state.last_sample_recorded_at ? time(state.last_sample_recorded_at) : 0)) {
    fail('invalid_transition', 'The transition predates confirmed recording data.');
  }
};
const closeGapIn = (db: LocalDatabase, id: string, at: string): void => {
  const gap = db.getFirstSync<GapRow>('SELECT * FROM recording_gaps WHERE trip_id = ? AND ended_at IS NULL', id);
  if (!gap) return;
  if (time(at) < time(gap.started_at)) fail('invalid_transition', 'A sampling gap cannot end before it starts.');
  db.runSync('UPDATE recording_gaps SET ended_at = ? WHERE id = ?', at, gap.id);
};
const openGapIn = (db: LocalDatabase, id: string, reason: RecordingGapReason, at: string): void => {
  if (!['restart', 'background', 'paused', 'permission', 'sensor', 'storage', 'sampling'].includes(reason)) fail('invalid_transition', 'A supported gap reason is required.');
  const gap = db.getFirstSync<GapRow>('SELECT * FROM recording_gaps WHERE trip_id = ? AND ended_at IS NULL', id);
  if (gap?.reason === reason) return;
  closeGapIn(db, id, at);
  insertGap(db, id, reason, at, null);
};

export const getRecordingGaps = async (tripId: string): Promise<RecordingGap[]> => gapsIn(getDatabase(), tripId);

export const createDraftTrip = async (trip: Trip): Promise<RecordingSession> => {
  validateTrip(trip);
  const db = getDatabase();
  let result!: RecordingSession;
  db.withTransactionSync(() => {
    const existing = db.getFirstSync<TripRow>('SELECT * FROM trips WHERE id = ?', trip.id);
    if (existing) {
      const row = readTrip(db, trip.id);
      const state = readState(db, row);
      active(row, state);
      metadata(row, trip);
      result = sessionIn(db, trip.id);
      return;
    }
    if (db.getFirstSync('SELECT id FROM trips WHERE deleted_at IS NULL AND record_status = ? LIMIT 1', 'draft')) {
      fail('active_recording', 'Finish or recover the unfinished recording before starting another.');
    }
    db.runSync(`INSERT INTO trips (id,started_at,ended_at,total_distance_meters,max_speed_mps,average_speed_mps,
      units,mount_label,record_status,local_updated_at,deleted_at,cloud_sync_error,sync_status)
      VALUES (?,?,?,?,?,?,?,?,'draft',?,NULL,NULL,'local')`,
    trip.id, trip.startedAt, trip.endedAt, trip.totalDistanceMeters, trip.maxSpeedMps, trip.averageSpeedMps, trip.units, trip.mountLabel ?? null, now());
    db.runSync(`INSERT INTO recording_states (trip_id,state,checkpoint_at,last_sample_sequence,last_sample_recorded_at,last_sample_elapsed_ms)
      VALUES (?,'recording',?,0,NULL,0)`, trip.id, trip.endedAt);
    result = sessionIn(db, trip.id);
  });
  return result;
};

export const checkpointRecording = async (trip: Trip, sample?: TripSpeedSample): Promise<RecordingSession> => {
  validateTrip(trip);
  const db = getDatabase();
  let result!: RecordingSession;
  db.withTransactionSync(() => {
    const row = readTrip(db, trip.id);
    const state = readState(db, row);
    metadata(row, trip);
    if (sample) {
      validateSample(sample, row);
      const existing = db.getFirstSync<SampleRow>('SELECT * FROM trip_speed_samples WHERE trip_id=? AND sequence=?', trip.id, sample.sequence);
      if (existing) {
        const values = sampleValues(sample);
        if (sampleColumns.some((column, index) => existing[column] !== values[index])) fail('conflicting_sample', 'A different sample already occupies that sequence.');
        // A replay may be older than subsequent confirmed checkpoints. It must
        // acknowledge the canonical current state rather than rewind it.
        result = sessionIn(db, trip.id);
        return;
      }
    }
    active(row, state);
    if (state.state === 'paused') fail('paused', 'Resume the recording before adding samples.');
    if (trip.totalDistanceMeters < row.total_distance_meters || time(trip.endedAt) < Math.max(time(row.ended_at), time(state.checkpoint_at))
      || (sample && (time(trip.endedAt) < time(sample.recordedAt) || trip.totalDistanceMeters < sample.distanceMeters))) {
      fail('invalid_recording', 'A checkpoint cannot reduce confirmed recording totals or time.');
    }
    const inserted = sample ? insertSample(db, row, state, sample) : false;
    const peak = Math.max(row.max_speed_mps, trip.maxSpeedMps, sample?.speedMps ?? 0);
    const changed = inserted || row.ended_at !== trip.endedAt || row.total_distance_meters !== trip.totalDistanceMeters || row.max_speed_mps !== peak;
    if (changed) {
      db.runSync(`UPDATE trips SET ended_at=?,total_distance_meters=?,max_speed_mps=?,average_speed_mps=?,local_updated_at=? WHERE id=?`,
        trip.endedAt, trip.totalDistanceMeters, peak, trip.averageSpeedMps, now(), trip.id);
      db.runSync(`UPDATE recording_states SET checkpoint_at=?,last_sample_sequence=?,last_sample_recorded_at=?,last_sample_elapsed_ms=? WHERE trip_id=?`,
        trip.endedAt, inserted ? sample!.sequence : state.last_sample_sequence,
        inserted ? sample!.recordedAt : state.last_sample_recorded_at,
        inserted ? sample!.elapsedMs : state.last_sample_elapsed_ms, trip.id);
    }
    result = sessionIn(db, trip.id);
  });
  return result;
};

export const appendTripSpeedSample = async (sample: TripSpeedSample): Promise<RecordingSession> => {
  const row = readTrip(getDatabase(), sample.tripId);
  const duration = Math.max(1, (time(sample.recordedAt) - time(row.started_at)) / 1000);
  return checkpointRecording({ ...mapTrip(row), endedAt: sample.recordedAt,
    totalDistanceMeters: sample.distanceMeters, maxSpeedMps: Math.max(row.max_speed_mps, sample.speedMps),
    averageSpeedMps: sample.distanceMeters / duration }, sample);
};

export const setRecordingPaused = async (tripId: string, paused: boolean, at: string, reason: RecordingGapReason = 'paused'): Promise<RecordingSession> => {
  const db = getDatabase();
  let result!: RecordingSession;
  db.withTransactionSync(() => {
    const row = readTrip(db, tripId); const state = readState(db, row); active(row, state);
    const desired = paused ? 'paused' : 'recording';
    if (state.state !== desired) {
      validateEvent(row, state, at);
      if (paused) openGapIn(db, tripId, reason, at); else closeGapIn(db, tripId, at);
      db.runSync('UPDATE recording_states SET state=?,checkpoint_at=? WHERE trip_id=?', desired, at, tripId);
    }
    result = sessionIn(db, tripId);
  });
  return result;
};

export const openRecordingGap = async (tripId: string, reason: RecordingGapReason, at: string): Promise<RecordingSession> => {
  const db = getDatabase(); let result!: RecordingSession;
  db.withTransactionSync(() => {
    const row = readTrip(db, tripId); const state = readState(db, row); active(row, state);
    validateEvent(row, state, at); openGapIn(db, tripId, reason, at); result = sessionIn(db, tripId);
  });
  return result;
};
export const closeRecordingGap = async (tripId: string, at: string): Promise<RecordingSession> => {
  const db = getDatabase(); let result!: RecordingSession;
  db.withTransactionSync(() => {
    const row = readTrip(db, tripId); const state = readState(db, row); active(row, state);
    validateEvent(row, state, at); closeGapIn(db, tripId, at); result = sessionIn(db, tripId);
  });
  return result;
};

export const recoverRecordings = async (at = now()): Promise<RecordingSession[]> => {
  time(at);
  const db = getDatabase(); const results: RecordingSession[] = [];
  db.withTransactionSync(() => {
    const drafts = db.getAllSync<TripRow>("SELECT * FROM trips WHERE deleted_at IS NULL AND record_status='draft' ORDER BY started_at ASC,id ASC");
    for (const row of drafts) {
      const state = readState(db, row);
      const aggregates = db.getFirstSync<{ distance: number | null; peak: number | null }>(
        'SELECT max(distance_meters) AS distance,max(speed_mps) AS peak FROM trip_speed_samples WHERE trip_id=?', row.id);
      const last = db.getFirstSync<SampleRow>('SELECT * FROM trip_speed_samples WHERE trip_id=? ORDER BY sequence DESC LIMIT 1', row.id);
      const endedAt = time(last?.recorded_at ?? row.ended_at) > time(row.ended_at) ? last!.recorded_at : row.ended_at;
      const distance = Math.max(row.total_distance_meters, aggregates?.distance ?? 0);
      const peak = Math.max(row.max_speed_mps, aggregates?.peak ?? 0);
      if (distance !== row.total_distance_meters || peak !== row.max_speed_mps || endedAt !== row.ended_at) {
        db.runSync('UPDATE trips SET ended_at=?,total_distance_meters=?,max_speed_mps=?,average_speed_mps=?,local_updated_at=? WHERE id=?',
          endedAt, distance, peak, distance / Math.max(1, (time(endedAt) - time(row.started_at)) / 1000), now(), row.id);
      }
      const open = db.getFirstSync<GapRow>('SELECT * FROM recording_gaps WHERE trip_id=? AND ended_at IS NULL', row.id);
      if (state.state !== 'paused' || open?.reason !== 'restart') {
        const receipt = new Date(Math.max(time(at), time(endedAt), time(state.checkpoint_at))).toISOString();
        const boundary = open ? receipt : last?.recorded_at ?? state.checkpoint_at;
        // Retain an existing known interval, then identify restart uncertainty.
        if (open) closeGapIn(db, row.id, boundary);
        insertGap(db, row.id, 'restart', boundary, null);
        db.runSync(`UPDATE recording_states SET state='paused',checkpoint_at=?,last_sample_sequence=?,last_sample_recorded_at=?,last_sample_elapsed_ms=? WHERE trip_id=?`,
          receipt, last?.sequence ?? state.last_sample_sequence, last?.recorded_at ?? state.last_sample_recorded_at,
          last?.elapsed_ms ?? state.last_sample_elapsed_ms, row.id);
      }
      results.push(sessionIn(db, row.id));
    }
  });
  return results;
};

export const saveTrip = async (trip: Trip, samples: TripSpeedSample[] = []): Promise<RecordingSession> => {
  validateTrip(trip);
  const db = getDatabase(); let result!: RecordingSession;
  db.withTransactionSync(() => {
    const row = readTrip(db, trip.id); metadata(row, trip); const state = readState(db, row);
    if (row.record_status === 'completed' || state.state === 'completed') {
      for (const sample of samples) {
        validateSample(sample, row);
        const existing = db.getFirstSync<SampleRow>('SELECT * FROM trip_speed_samples WHERE trip_id=? AND sequence=?', trip.id, sample.sequence);
        if (!existing) fail('completed', 'A saved recording cannot accept new samples.');
        const values = sampleValues(sample);
        if (sampleColumns.some((column, index) => existing![column] !== values[index])) fail('conflicting_sample', 'A different sample already occupies that sequence.');
      }
      result = sessionIn(db, trip.id); return;
    }
    active(row, state);
    if (time(trip.endedAt) < Math.max(time(row.ended_at), time(state.checkpoint_at)) || trip.totalDistanceMeters < row.total_distance_meters) {
      fail('invalid_recording', 'A saved summary cannot reduce confirmed recording totals or time.');
    }
    // Compatibility callers may supply their existing sample buffer. Merge only;
    // never replace durable samples or reset their upload/error markers.
    for (const sample of samples) {
      const current = readState(db, readTrip(db, trip.id));
      if (current.state === 'paused' && !db.getFirstSync('SELECT sequence FROM trip_speed_samples WHERE trip_id=? AND sequence=?', trip.id, sample.sequence)) {
        fail('paused', 'A paused recording cannot accept unseen samples during finalization.');
      }
      const inserted = insertSample(db, row, current, sample);
      if (inserted) db.runSync('UPDATE recording_states SET last_sample_sequence=?,last_sample_recorded_at=?,last_sample_elapsed_ms=? WHERE trip_id=?',
        sample.sequence, sample.recordedAt, sample.elapsedMs, trip.id);
    }
    const aggregates = db.getFirstSync<{ distance: number | null; peak: number | null }>(
      'SELECT max(distance_meters) AS distance,max(speed_mps) AS peak FROM trip_speed_samples WHERE trip_id=?', trip.id);
    const current = readState(db, row);
    if (trip.totalDistanceMeters < (aggregates?.distance ?? 0)
      || (current.last_sample_recorded_at && time(trip.endedAt) < time(current.last_sample_recorded_at))) fail('invalid_recording', 'The summary must include every confirmed sample.');
    closeGapIn(db, trip.id, trip.endedAt);
    db.runSync(`UPDATE trips SET ended_at=?,total_distance_meters=?,max_speed_mps=?,average_speed_mps=?,record_status='completed',
      local_updated_at=?,cloud_sync_error=NULL,sync_status='pending' WHERE id=?`,
      trip.endedAt, trip.totalDistanceMeters, Math.max(row.max_speed_mps, trip.maxSpeedMps, aggregates?.peak ?? 0), trip.averageSpeedMps, now(), trip.id);
    db.runSync("UPDATE recording_states SET state='completed',checkpoint_at=? WHERE trip_id=?", trip.endedAt, trip.id);
    const timestamp = now();
    db.runSync(`INSERT INTO sync_outbox (id,operation_type,entity_type,entity_id,payload_json,status,attempt_count,created_at,updated_at)
      VALUES (?,'sync_trip','trip',?,?,'pending',0,?,?)`,
      `recording-complete:${trip.id}`, trip.id, JSON.stringify({ tripId: trip.id }), timestamp, timestamp);
    result = sessionIn(db, trip.id);
  });
  return result;
};
