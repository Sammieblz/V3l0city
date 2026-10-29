import type { RecordingGapReason, RecordingSession, Trip, TripSpeedSample } from '../domain/trip';
import type { VelocitySensorsState } from '../hooks/useVelocitySensors';

export type RecordingStore = {
  createDraftTrip(trip: Trip): Promise<RecordingSession>;
  appendTripSpeedSample(sample: TripSpeedSample): Promise<RecordingSession>;
  checkpointRecording(trip: Trip): Promise<RecordingSession>;
  setRecordingPaused(id: string, paused: boolean, at: string, reason?: RecordingGapReason): Promise<RecordingSession>;
  openRecordingGap(id: string, reason: RecordingGapReason, at: string): Promise<RecordingSession>;
  closeRecordingGap(id: string, at: string): Promise<RecordingSession>;
  recoverRecordings(at?: string): Promise<RecordingSession[]>;
  saveTrip(trip: Trip): Promise<RecordingSession>;
};

export type RecordingEffects = {
  started?(trip: Trip): unknown;
  sample?(sample: TripSpeedSample): unknown;
  completed?(trip: Trip): unknown;
  failed?(error: unknown): unknown;
};

export type PersonalRecordingState = {
  ready: boolean;
  busy: boolean;
  session: RecordingSession | null;
  lastCompleted: Trip | null;
  recovered: boolean;
  remainingRecovered: number;
  autoPaused: boolean;
  background: boolean;
  error: string | null;
};

const storageMessage = 'Recent recording changes could not be saved. Free up storage if needed, then retry before closing the app.';

/** SQLite owns confirmed data. This controller owns one serialized stream of
 * user intent; native counters and external services never replace that data. */
export function createPersonalRecordingController(options: {
  store: RecordingStore;
  now: () => number;
  newId: () => string;
  effects?: RecordingEffects;
}) {
  const { store } = options;
  let state: PersonalRecordingState = { ready: false, busy: false, session: null,
    lastCompleted: null, recovered: false, remainingRecovered: 0, autoPaused: false,
    background: false, error: null };
  const listeners = new Set<() => void>();
  let queue = Promise.resolve();
  let recoveredQueue: RecordingSession[] = [];
  let latest: VelocitySensorsState | null = null;
  let lastObservedAt = 0;
  let anchorCounter: number | null = null;
  let anchorTotal = 0;
  let segmentStartedAt = 0;
  let samplePending = false;
  let retryOperation: (() => Promise<void>) | null = null;
  let gapQueued = false;

  const update = (patch: Partial<PersonalRecordingState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const iso = () => new Date(options.now()).toISOString();
  const active = () => state.session != null && state.session.state !== 'completed';
  const commit = (session: RecordingSession) => update({ session });
  const effect = (name: keyof RecordingEffects, value: unknown) => {
    // Separate from the durable queue: a rejected or never-resolving network /
    // native notification promise cannot block recording, recovery or saving.
    void Promise.resolve().then(() => options.effects?.[name]?.(value as never)).catch(() => undefined);
  };
  const failed = (error: unknown, retry: () => Promise<void>) => {
    retryOperation = retry;
    update({ error: storageMessage, autoPaused: false });
    effect('failed', error);
  };
  const serial = <T>(action: () => Promise<T>): Promise<T> => {
    const result = queue.then(action);
    queue = result.then(() => undefined, () => undefined);
    return result;
  };
  const run = (action: () => Promise<void>, allowUnready = false): Promise<boolean> => {
    if (state.busy || (!state.ready && !allowUnready)) return Promise.resolve(false);
    update({ busy: true }); // Immediate, before any await or React render.
    return serial(async () => {
      try {
        if (state.error && !allowUnready) return false;
        await action();
        retryOperation = null;
        update({ error: null });
        return true;
      } catch (error) {
        failed(error, action);
        return false;
      } finally { update({ busy: false }); }
    });
  };
  const fresh = (reading: VelocitySensorsState) => reading.status === 'ready' && !reading.stale
    && reading.timestampMs <= options.now() && options.now() - reading.timestampMs <= 3000
    && (reading.fixAgeMs == null || reading.fixAgeMs < 3000);
  const rebase = () => {
    anchorTotal = state.session?.trip.totalDistanceMeters ?? 0;
    segmentStartedAt = options.now();
    // A cached counter from before this segment cannot identify distance at
    // Start/Resume. The first actual post-boundary event establishes a baseline.
    anchorCounter = latest && fresh(latest) && latest.timestampMs >= segmentStartedAt
      ? latest.distanceMeters : null;
  };
  const hydrate = () => run(async () => {
    const recordings = await store.recoverRecordings(iso());
    recoveredQueue = recordings.slice(1);
    update({ ready: true, session: recordings[0] ?? null,
      recovered: recordings.length > 0, remainingRecovered: recoveredQueue.length, autoPaused: false });
    rebase();
  }, true);

  const start = (input: { units: Trip['units']; mountLabel?: string }) => {
    if (active() || state.error) return Promise.resolve(false);
    const startedAt = iso();
    const trip: Trip = { id: options.newId(), startedAt, endedAt: startedAt,
      totalDistanceMeters: 0, maxSpeedMps: 0, averageSpeedMps: 0,
      units: input.units, mountLabel: input.mountLabel, recordStatus: 'draft' };
    return run(async () => {
      commit(await store.createDraftTrip(trip));
      if (state.background) commit(await store.openRecordingGap(trip.id, 'background', iso()));
      update({ recovered: false, autoPaused: false });
      rebase();
      effect('started', state.session!.trip);
    });
  };
  const pause = (reason: RecordingGapReason = 'paused', automatic = false) => {
    if (!active() || state.session!.state === 'paused' || state.error) return Promise.resolve(false);
    const id = state.session!.trip.id;
    const at = iso();
    return run(async () => {
      commit(await store.setRecordingPaused(id, true, at, reason));
      update({ autoPaused: automatic });
    });
  };
  const resume = () => {
    if (!active() || state.session!.state !== 'paused' || state.error || !latest
      || !fresh(latest) || state.background) return Promise.resolve(false);
    const id = state.session!.trip.id;
    const at = iso();
    return run(async () => {
      commit(await store.setRecordingPaused(id, false, at));
      if (state.background) commit(await store.openRecordingGap(id, 'background', iso()));
      update({ recovered: false, autoPaused: false });
      rebase();
    });
  };
  const finish = () => {
    if (!active() || state.error) return Promise.resolve(false);
    const id = state.session!.trip.id;
    let finalTrip: Trip | null = null;
    return run(async () => {
      if (state.session?.trip.id !== id || state.session.state === 'completed') return;
      // Earlier append operations have committed before this queued action.
      if (!finalTrip) {
        const endedAt = iso();
        finalTrip = { ...state.session.trip, endedAt, recordStatus: 'completed',
          averageSpeedMps: state.session.trip.totalDistanceMeters
            / Math.max(1, (Date.parse(endedAt) - Date.parse(state.session.trip.startedAt)) / 1000) };
      }
      const completed = await store.saveTrip(finalTrip);
      update({ lastCompleted: completed.trip, session: recoveredQueue.shift() ?? null,
        recovered: recoveredQueue.length > 0 || state.remainingRecovered > 0,
        remainingRecovered: recoveredQueue.length, autoPaused: false });
      rebase();
      effect('completed', completed.trip);
    });
  };
  const openGap = (reason: RecordingGapReason, at = iso()) => {
    if (!active() || state.busy || gapQueued || state.error
      || state.session!.gaps.some((gap) => gap.endedAt == null && gap.reason === reason)) return;
    const id = state.session!.trip.id;
    gapQueued = true;
    void serial(async () => {
      const action = async () => {
        if (state.session?.trip.id !== id || state.session.state !== 'recording') return;
        commit(await store.openRecordingGap(id, reason, at));
      };
      try { if (!state.error) await action(); } catch (error) { failed(error, action); }
      finally { gapQueued = false; }
    });
  };
  const background = () => {
    update({ background: true });
    if (!active() || state.busy || state.session!.state !== 'recording' || state.error) return;
    const id = state.session!.trip.id;
    const at = iso();
    const reading = latest;
    void serial(async () => {
      const action = async () => {
        if (state.session?.trip.id !== id || state.session.state !== 'recording') return;
        const trip = state.session!.trip;
        const total = reading && anchorCounter != null && reading.distanceMeters >= anchorCounter
          ? Math.max(trip.totalDistanceMeters, anchorTotal + reading.distanceMeters - anchorCounter)
          : trip.totalDistanceMeters;
        commit(await store.checkpointRecording({ ...trip, endedAt: at, totalDistanceMeters: total,
          averageSpeedMps: total / Math.max(1, (Date.parse(at) - Date.parse(trip.startedAt)) / 1000),
          maxSpeedMps: Math.max(trip.maxSpeedMps, reading?.speedMps ?? 0) }));
        commit(await store.openRecordingGap(id, 'background', at));
      };
      try { if (!state.error) await action(); } catch (error) { failed(error, action); }
    });
  };
  const foreground = () => {
    update({ background: false });
    if (!active() || state.busy || state.session!.state !== 'recording' || state.error) return;
    const id = state.session!.trip.id;
    const at = iso();
    void serial(async () => {
      const action = async () => {
        if (state.session?.trip.id !== id || state.session.state !== 'recording') return;
        if (state.session.gaps.some((gap) => gap.endedAt == null && gap.reason === 'background')) {
          commit(await store.closeRecordingGap(id, at));
        }
      };
      try { if (!state.error) await action(); } catch (error) { failed(error, action); }
    });
    // Keep the native counter anchor: a fresh foreground event may contain
    // actual background aggregate movement, while the missing sample gap stays.
    segmentStartedAt = options.now();
  };

  const observe = (reading: VelocitySensorsState): Promise<boolean> => {
    if (reading.status !== 'ready') {
      latest = null;
      if (active() && !state.background && reading.status !== 'initializing') void pause(
        reading.status === 'permission_denied' || reading.status === 'precise_location_required' ? 'permission' : 'sensor');
      return Promise.resolve(false);
    }
    const numbers = [reading.timestampMs, reading.speedMps, reading.distanceMeters,
      reading.qualityScore, ...[reading.headingDegrees, reading.headingAccuracyDegrees,
        reading.gpsAccuracyMeters, reading.fixAgeMs].filter((value): value is number => value != null)];
    // Match the existing native engine's three-second stale contract. This is
    // sample admission, not a newly invented connected-product latency budget.
    if (reading.stale || options.now() - reading.timestampMs > 3000
      || (reading.fixAgeMs != null && reading.fixAgeMs >= 3000)
      || !numbers.every(Number.isFinite) || reading.timestampMs <= 0 || reading.timestampMs > options.now()
      || reading.speedMps < 0 || reading.distanceMeters < 0 || reading.qualityScore < 0 || reading.qualityScore > 1
      || [reading.headingDegrees, reading.headingAccuracyDegrees, reading.gpsAccuracyMeters,
        reading.fixAgeMs].some((value) => value != null && value < 0)) {
      latest = null;
      openGap('sampling');
      return Promise.resolve(false);
    }
    if (reading.timestampMs <= lastObservedAt) return Promise.resolve(false);
    lastObservedAt = reading.timestampMs;
    latest = reading;
    if (!active() || state.session!.state !== 'recording' || state.busy || state.background
      || state.error || samplePending || reading.timestampMs < segmentStartedAt) return Promise.resolve(false);
    const session = state.session!;
    const previousAt = session.lastSampleRecordedAt == null ? null : Date.parse(session.lastSampleRecordedAt);
    if (previousAt != null && reading.timestampMs - previousAt < 500) return Promise.resolve(false);
    if (anchorCounter == null || reading.distanceMeters < anchorCounter) {
      anchorCounter = reading.distanceMeters;
      anchorTotal = session.trip.totalDistanceMeters;
    }
    const recordedAt = new Date(reading.timestampMs).toISOString();
    const sample: TripSpeedSample = { tripId: session.trip.id, sequence: session.lastSampleSequence + 1,
      recordedAt,
      // iOS emits fractional milliseconds; ISO/SQLite telemetry use millisecond
      // precision. Derive both fields from the same real event, never receipt time.
      elapsedMs: Date.parse(recordedAt) - Date.parse(session.trip.startedAt),
      speedMps: reading.speedMps,
      distanceMeters: Math.max(session.trip.totalDistanceMeters, anchorTotal + reading.distanceMeters - anchorCounter),
      headingDegrees: reading.headingDegrees, headingSource: reading.headingSource,
      headingAccuracyDegrees: reading.headingAccuracyDegrees, headingQuality: reading.headingQuality,
      headingReasons: [...reading.headingReasons], source: reading.source, quality: reading.quality,
      qualityScore: reading.qualityScore, qualityReasons: [...reading.qualityReasons],
      gpsAccuracyMeters: reading.gpsAccuracyMeters, fixAgeMs: reading.fixAgeMs,
      nativeSpeedUsed: reading.nativeSpeedUsed, isMoving: reading.isMoving,
      isStopped: reading.isStopped, stale: reading.stale };
    if (sample.elapsedMs < 0) return Promise.resolve(false);
    samplePending = true;
    return serial(async () => {
      let appended = false;
      const action = async () => {
        commit(await store.appendTripSpeedSample(sample));
        appended = true;
        if (state.session?.gaps.some((gap) => gap.endedAt == null && gap.reason === 'sampling')) {
          commit(await store.closeRecordingGap(sample.tripId, iso()));
        }
        effect('sample', sample);
      };
      try { await action(); return true; }
      catch (error) {
        failed(error, async () => {
          if (!appended) commit(await store.openRecordingGap(sample.tripId, 'storage', sample.recordedAt));
          await action();
          commit(await store.closeRecordingGap(sample.tripId, iso()));
        });
        return false;
      } finally { samplePending = false; }
    });
  };
  const retry = () => {
    if (!retryOperation) return Promise.resolve(false);
    const operation = retryOperation;
    return run(async () => {
      await operation();
      // A failed sample suppresses queued background work. If recovery happens
      // before foregrounding, the remaining unseen interval still needs a gap.
      if (state.background && state.session?.state === 'recording'
        && !state.session.gaps.some((gap) => gap.reason === 'background' && gap.endedAt == null)) {
        commit(await store.openRecordingGap(state.session.trip.id, 'background', iso()));
      }
    }, true);
  };
  return { getSnapshot: () => state, subscribe: (listener: () => void) => {
    listeners.add(listener); return () => { listeners.delete(listener); };
  }, hydrate, start, pause, resume, finish, observe, background, foreground, retry,
  clearLastCompleted: () => update({ lastCompleted: null }) };
}
