import { createPersonalRecordingController, type RecordingEffects, type RecordingStore } from '../src/recording/controller';
import type { RecordingSession, Trip, TripSpeedSample } from '../src/domain/trip';
import type { VelocitySensorsState } from '../src/hooks/useVelocitySensors';

const epoch = Date.parse('2026-10-01T12:00:00Z');
const iso = (offset = 0) => new Date(epoch + offset).toISOString();
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const recovered = (id = 'recovered'): RecordingSession => ({
  trip: { id, startedAt: iso(-10000), endedAt: iso(-1000), units: 'MPH', mountLabel: 'right',
    maxSpeedMps: 25, averageSpeedMps: 10, totalDistanceMeters: 100, recordStatus: 'draft' },
  state: 'paused', checkpointAt: iso(), lastSampleSequence: 4,
  lastSampleRecordedAt: iso(-1000), lastSampleElapsedMs: 9000,
  gaps: [{ id: 'restart', tripId: id, reason: 'restart', startedAt: iso(-1000), endedAt: null }],
});
const reading = (offset: number, distanceMeters = 0, patch: Partial<VelocitySensorsState> = {}): VelocitySensorsState => ({
  timestampMs: epoch + offset, speedMps: 10, averageSpeedMps: 10, maxSpeedMps: 10, distanceMeters,
  units: 'km/h', headingDegrees: 20, headingSource: 'course', headingAccuracyDegrees: 2,
  headingQuality: 'good', headingReasons: [], permission: 'granted', status: 'ready', quality: 'good',
  source: 'gps', errorMessage: null, stale: false, qualityScore: 1, qualityReasons: [],
  gpsAccuracyMeters: 3, fixAgeMs: 0, nativeSpeedUsed: true, motionAvailable: true,
  gpsAvailable: true, headingAvailable: true, isMoving: true, isStopped: false, ...patch,
});

/** Contract double only: SQL rollback, reopen, validation and constraints have
 * separate real-SQLite tests. This exercises controller scheduling and effects. */
function fixture(initial: RecordingSession[] = [], effects: RecordingEffects = {}) {
  let now = epoch;
  let nextId = 0;
  const sessions = new Map(initial.map((session) => [session.trip.id, clone(session)]));
  const samples: TripSpeedSample[] = [];
  const get = (id: string) => {
    const result = sessions.get(id);
    if (!result) throw new Error('missing draft');
    return result;
  };
  const store: jest.Mocked<RecordingStore> = {
    recoverRecordings: jest.fn(async () => clone(initial)),
    createDraftTrip: jest.fn(async (trip: Trip) => {
      const existing = sessions.get(trip.id);
      if (existing) return clone(existing);
      const session: RecordingSession = { trip: clone(trip), state: 'recording', checkpointAt: trip.startedAt,
        lastSampleSequence: 0, lastSampleRecordedAt: null, lastSampleElapsedMs: 0, gaps: [] };
      sessions.set(trip.id, session);
      return clone(session);
    }),
    appendTripSpeedSample: jest.fn(async (sample) => {
      const session = get(sample.tripId);
      if (session.state !== 'recording') throw new Error('not recording');
      if (!samples.some((item) => item.tripId === sample.tripId && item.sequence === sample.sequence)) samples.push(clone(sample));
      session.trip = { ...session.trip, endedAt: sample.recordedAt, totalDistanceMeters: sample.distanceMeters,
        maxSpeedMps: Math.max(session.trip.maxSpeedMps, sample.speedMps) };
      session.lastSampleSequence = sample.sequence;
      session.lastSampleRecordedAt = sample.recordedAt;
      session.lastSampleElapsedMs = sample.elapsedMs;
      session.checkpointAt = sample.recordedAt;
      return clone(session);
    }),
    checkpointRecording: jest.fn(async (trip) => {
      const session = get(trip.id);
      if (session.state !== 'recording') throw new Error('not recording');
      session.trip = clone(trip); session.checkpointAt = trip.endedAt;
      return clone(session);
    }),
    setRecordingPaused: jest.fn(async (id, paused, at, reason = 'paused') => {
      const session = get(id);
      session.state = paused ? 'paused' : 'recording';
      if (paused) session.gaps.push({ id: `gap-${session.gaps.length}`, tripId: id, reason, startedAt: at, endedAt: null });
      else session.gaps.forEach((gap) => { if (!gap.endedAt) gap.endedAt = at; });
      return clone(session);
    }),
    openRecordingGap: jest.fn(async (id, reason, at) => {
      const session = get(id);
      if (session.state === 'completed') throw new Error('completed');
      if (!session.gaps.some((gap) => gap.reason === reason && !gap.endedAt)) {
        session.gaps.forEach((gap) => { if (!gap.endedAt) gap.endedAt = at; });
        session.gaps.push({ id: `gap-${session.gaps.length}`, tripId: id, reason, startedAt: at, endedAt: null });
      }
      return clone(session);
    }),
    closeRecordingGap: jest.fn(async (id, at) => {
      const session = get(id);
      session.gaps.forEach((gap) => { if (!gap.endedAt) gap.endedAt = at; });
      return clone(session);
    }),
    saveTrip: jest.fn(async (trip) => {
      const session = get(trip.id);
      session.trip = clone(trip); session.state = 'completed';
      return clone(session);
    }),
  };
  const controller = createPersonalRecordingController({ store, now: () => now,
    newId: () => `trip-${++nextId}`, effects });
  const observe = (offset: number, distance = 0, patch: Partial<VelocitySensorsState> = {}) => {
    now = epoch + offset;
    return controller.observe(reading(offset, distance, patch));
  };
  return { controller, store, samples, sessions, observe, time: (offset: number) => { now = epoch + offset; } };
}

describe('personal recording controller', () => {
  it('claims hydration and Start immediately; retries a failed read before allowing writes', async () => {
    const f = fixture();
    const gate = deferred<RecordingSession[]>();
    f.store.recoverRecordings.mockReturnValueOnce(gate.promise);
    const hydration = f.controller.hydrate();
    expect(await f.controller.start({ units: 'km/h' })).toBe(false);
    gate.reject(new Error('read failed'));
    expect(await hydration).toBe(false);
    expect(f.controller.getSnapshot()).toMatchObject({ ready: false, busy: false, error: expect.any(String) });
    expect(f.store.createDraftTrip).not.toHaveBeenCalled();
    expect(await f.controller.retry()).toBe(true);
    const first = f.controller.start({ units: 'MPH' });
    expect(await f.controller.start({ units: 'MPH' })).toBe(false);
    expect(await first).toBe(true);
    expect(f.store.createDraftTrip).toHaveBeenCalledTimes(1);
  });

  it.each([0, 100])('recovers paused metadata and totals without double counting native counter %s', async (counter) => {
    const f = fixture([recovered()]);
    await f.controller.hydrate();
    expect(f.controller.getSnapshot()).toMatchObject({ recovered: true, session: {
      state: 'paused', trip: { units: 'MPH', mountLabel: 'right', totalDistanceMeters: 100, maxSpeedMps: 25 },
    } });
    await f.observe(0, counter);
    expect(f.samples).toHaveLength(0);
    expect(await f.controller.resume()).toBe(true);
    await f.observe(600, counter + 10);
    expect(f.samples[0]).toMatchObject({ sequence: 5, recordedAt: iso(600), distanceMeters: 110 });
    expect(f.controller.getSnapshot().session?.trip.maxSpeedMps).toBe(25);
  });

  it('rejects stale, old, future, invalid and out-of-order native events without rewriting their time', async () => {
    const f = fixture(); await f.controller.hydrate();
    await f.observe(0); await f.controller.start({ units: 'km/h' });
    expect(await f.observe(600, 10, { stale: true })).toBe(false);
    await tick();
    expect(await f.observe(700, 10, { fixAgeMs: 3000 })).toBe(false);
    expect(await f.observe(800, 10, { speedMps: NaN })).toBe(false);
    f.time(4000);
    expect(await f.controller.observe(reading(900, 10))).toBe(false);
    expect(await f.controller.observe(reading(5000, 10))).toBe(false);
    await tick();
    expect(f.samples).toHaveLength(0);
    await f.observe(4100, 20);
    f.time(4200);
    expect(await f.controller.observe(reading(4000, 99))).toBe(false);
    expect(await f.observe(4300, 30)).toBe(false); // native event is fresh but below sample cadence
    await f.observe(4700, 40);
    expect(f.samples.map((sample) => [sample.recordedAt, sample.distanceMeters])).toEqual([[iso(4100), 20], [iso(4700), 40]]);
    expect(f.controller.getSnapshot().session?.gaps.some((gap) => gap.reason === 'sampling' && gap.endedAt != null)).toBe(true);
  });

  it('requires a fresh reading to resume rather than reusing a previously ready status', async () => {
    const f = fixture([recovered()]); await f.controller.hydrate();
    await f.observe(0); f.time(3001);
    expect(await f.controller.resume()).toBe(false);
    await f.observe(4000, 0, { stale: true });
    expect(await f.controller.resume()).toBe(false);
    await f.observe(4100);
    expect(await f.controller.resume()).toBe(true);
  });

  it('serializes iOS fractional native time at Date millisecond precision without using receipt time', async () => {
    const f = fixture(); await f.controller.hydrate(); await f.observe(0);
    await f.controller.start({ units: 'km/h' });
    f.time(610);
    expect(await f.controller.observe(reading(600.25, 10))).toBe(true);
    expect(f.samples[0]).toMatchObject({ recordedAt: iso(600), elapsedMs: 600 });
  });

  it('keeps native background aggregates, marks a gap and never fills in unseen samples', async () => {
    const f = fixture(); await f.controller.hydrate();
    await f.observe(0, 100); await f.controller.start({ units: 'km/h' });
    await f.observe(600, 110);
    f.time(1000); f.controller.background(); await tick();
    expect(f.controller.getSnapshot()).toMatchObject({ background: true, session: { state: 'recording' } });
    await f.observe(5000, 150);
    expect(f.samples).toHaveLength(1);
    f.time(5100); f.controller.foreground(); await tick();
    await f.observe(5200, 152);
    expect(f.samples.map((sample) => sample.distanceMeters)).toEqual([10, 52]);
    expect(f.controller.getSnapshot().session?.gaps).toEqual([expect.objectContaining({
      reason: 'background', startedAt: iso(1000), endedAt: iso(5100),
    })]);
  });

  it('does not close a permission or sampling interval just because the app becomes active', async () => {
    const f = fixture(); await f.controller.hydrate(); await f.controller.start({ units: 'km/h' });
    await f.observe(100, 0, { stale: true }); await tick();
    f.controller.foreground(); await tick();
    expect(f.store.closeRecordingGap).not.toHaveBeenCalled();
  });

  it('serializes append before finish and refuses duplicate save, background and late sensor mutations', async () => {
    const f = fixture([recovered('next')]); await f.controller.hydrate();
    await f.observe(0); await f.controller.resume();
    const appendGate = deferred<RecordingSession>();
    const originalAppend = f.store.appendTripSpeedSample.getMockImplementation()!;
    f.store.appendTripSpeedSample.mockImplementationOnce(async (sample) => { await appendGate.promise; return originalAppend(sample); });
    const sample = f.observe(600, 10);
    const finish = f.controller.finish();
    expect(await f.controller.finish()).toBe(false);
    f.controller.background();
    await f.observe(700, 10, { status: 'permission_denied' });
    expect(f.store.saveTrip).not.toHaveBeenCalled();
    appendGate.resolve(recovered());
    expect(await sample).toBe(true); expect(await finish).toBe(true);
    await tick();
    expect(f.store.saveTrip).toHaveBeenCalledTimes(1);
    expect(f.store.saveTrip.mock.calls[0][0].totalDistanceMeters).toBe(110);
    expect(f.store.openRecordingGap).not.toHaveBeenCalled();
    expect(f.controller.getSnapshot()).toMatchObject({ session: null, error: null });
  });

  it('skips queued gap callbacks after a pending pause or save changes the phase', async () => {
    const f = fixture(); await f.controller.hydrate(); await f.controller.start({ units: 'km/h' });
    const saveGate = deferred<RecordingSession>();
    const originalSave = f.store.saveTrip.getMockImplementation()!;
    f.store.saveTrip.mockImplementationOnce(async (trip) => { await saveGate.promise; return originalSave(trip); });
    const finish = f.controller.finish(); await tick();
    f.controller.background(); f.controller.foreground();
    await f.observe(100, 0, { stale: true });
    saveGate.resolve(recovered()); await finish; await tick();
    expect(f.store.openRecordingGap).not.toHaveBeenCalled();
    expect(f.store.closeRecordingGap).not.toHaveBeenCalled();
    expect(f.controller.getSnapshot().error).toBeNull();
  });

  it('records a background boundary if the app backgrounds while draft creation is pending', async () => {
    const f = fixture(); await f.controller.hydrate();
    const gate = deferred<RecordingSession>();
    const create = f.store.createDraftTrip.getMockImplementation()!;
    f.store.createDraftTrip.mockImplementationOnce(async (trip) => { await gate.promise; return create(trip); });
    const started = f.controller.start({ units: 'km/h' });
    f.controller.background(); gate.resolve(recovered());
    expect(await started).toBe(true);
    expect(f.controller.getSnapshot().session?.gaps).toEqual([expect.objectContaining({ reason: 'background' })]);
  });

  it('blocks new samples and saving after a failed append, then retries the exact original sample', async () => {
    const f = fixture(); await f.controller.hydrate(); await f.observe(0); await f.controller.start({ units: 'km/h' });
    f.store.appendTripSpeedSample.mockRejectedValueOnce(new Error('disk full'));
    expect(await f.observe(600, 10)).toBe(false);
    expect(f.controller.getSnapshot().session?.lastSampleSequence).toBe(0);
    await f.observe(1000, 20);
    expect(await f.controller.finish()).toBe(false);
    f.time(2000); expect(await f.controller.retry()).toBe(true);
    const [first, retry] = f.store.appendTripSpeedSample.mock.calls;
    expect(retry[0]).toEqual(first[0]);
    expect(f.samples).toHaveLength(1);
    expect(f.samples[0]).toMatchObject({ recordedAt: iso(600), sequence: 1, distanceMeters: 10 });
    expect(f.controller.getSnapshot()).toMatchObject({ error: null, session: { gaps: [
      expect.objectContaining({ reason: 'storage', startedAt: iso(600), endedAt: iso(2000) }),
    ] } });
  });

  it('retains a stable finalization identity and timestamp across a failed save retry', async () => {
    const f = fixture(); await f.controller.hydrate(); await f.controller.start({ units: 'km/h' });
    f.time(1000); f.store.saveTrip.mockRejectedValueOnce(new Error('disk full'));
    expect(await f.controller.finish()).toBe(false);
    expect(f.controller.getSnapshot().session).not.toBeNull();
    f.time(5000); expect(await f.controller.retry()).toBe(true);
    expect(f.store.saveTrip.mock.calls[1][0]).toEqual(f.store.saveTrip.mock.calls[0][0]);
    expect(f.controller.getSnapshot()).toMatchObject({ session: null, lastCompleted: { endedAt: iso(1000) } });
  });

  it('uses wall duration when finalizing and does not import a stale pre-start native counter', async () => {
    const f = fixture(); await f.controller.hydrate(); await f.observe(0, 500);
    f.time(5000); await f.controller.start({ units: 'km/h' });
    await f.observe(5500, 600); // unknown movement before Start is excluded
    await f.observe(7500, 620);
    expect(f.samples.map((sample) => sample.distanceMeters)).toEqual([0, 20]);
    f.time(25000); await f.controller.finish();
    expect(f.controller.getSnapshot().lastCompleted).toMatchObject({ totalDistanceMeters: 20, averageSpeedMps: 1 });
  });

  it('does not let queued background/foreground work advance past a failed sample before its exact retry', async () => {
    const f = fixture(); await f.controller.hydrate(); await f.observe(0);
    await f.controller.start({ units: 'km/h' });
    const gate = deferred<RecordingSession>();
    f.store.appendTripSpeedSample.mockReturnValueOnce(gate.promise);
    const append = f.observe(600, 10);
    f.time(1000); f.controller.background();
    f.time(2000); f.controller.foreground();
    gate.reject(new Error('disk full')); expect(await append).toBe(false); await tick();
    expect(f.store.checkpointRecording).not.toHaveBeenCalled();
    expect(f.store.closeRecordingGap).not.toHaveBeenCalled();
    expect(await f.controller.retry()).toBe(true);
    expect(f.samples[0]).toMatchObject({ sequence: 1, recordedAt: iso(600) });
    expect(f.controller.getSnapshot().error).toBeNull();
  });

  it('presents every recovered draft in order and never automatically resumes the next one', async () => {
    const f = fixture([recovered('one'), recovered('two')]); await f.controller.hydrate();
    expect(f.controller.getSnapshot().remainingRecovered).toBe(1);
    await f.controller.finish();
    expect(f.controller.getSnapshot()).toMatchObject({ recovered: true, remainingRecovered: 0,
      session: { state: 'paused', trip: { id: 'two' } } });
    await f.controller.finish();
    expect(f.controller.getSnapshot()).toMatchObject({ recovered: false, session: null });
  });

  it('does not await rejected or permanently hung native, notification or network effects', async () => {
    const effects: RecordingEffects = { started: jest.fn(() => new Promise(() => undefined)),
      sample: jest.fn(() => Promise.reject(new Error('offline'))),
      completed: jest.fn(() => new Promise(() => undefined)) };
    const f = fixture([], effects); await f.controller.hydrate(); await f.observe(0);
    expect(await f.controller.start({ units: 'km/h' })).toBe(true);
    expect(await f.observe(600, 10)).toBe(true);
    expect(await f.controller.finish()).toBe(true); await tick();
    expect(f.controller.getSnapshot()).toMatchObject({ busy: false, error: null, session: null });
    expect(effects.completed).toHaveBeenCalledTimes(1);
  });
});
