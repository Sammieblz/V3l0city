import type { TripSpeedSample, TripWithSpeedSamples } from '../src/domain/trip';
import {
  buildInsightsModel,
  buildSpeedTrace,
  displayDistance,
  displaySpeed,
  downsampleSpeedSamples,
} from '../src/utils/insightsAnalytics';

const makeTrip = (
  id: string,
  overrides: Partial<TripWithSpeedSamples> = {},
): TripWithSpeedSamples => ({
  id,
  startedAt: '2026-05-18T14:00:00.000Z',
  endedAt: '2026-05-18T14:10:00.000Z',
  totalDistanceMeters: 1000,
  maxSpeedMps: 20,
  averageSpeedMps: 10,
  units: 'km/h',
  mountLabel: 'top',
  speedSamples: [],
  ...overrides,
});

const makeSample = (
  sequence: number,
  overrides: Partial<TripSpeedSample> = {},
): TripSpeedSample => ({
  tripId: 'trip-1',
  sequence,
  recordedAt: `2026-05-18T14:00:0${sequence}.000Z`,
  elapsedMs: sequence * 1000,
  speedMps: 12,
  distanceMeters: sequence * 12,
  headingDegrees: 90,
  headingSource: 'course',
  headingAccuracyDegrees: 3,
  headingQuality: 'good',
  headingReasons: ['course-used'],
  source: 'blended',
  quality: 'good',
  qualityScore: 0.9,
  qualityReasons: ['native-speed-used'],
  gpsAccuracyMeters: 5,
  fixAgeMs: 100,
  nativeSpeedUsed: true,
  isMoving: true,
  isStopped: false,
  stale: false,
  ...overrides,
});

describe('insightsAnalytics', () => {
  it('builds an empty analytics model', () => {
    const model = buildInsightsModel([], 'km/h');

    expect(model.summary).toEqual({
      tripCount: 0,
      totalDistanceMeters: 0,
      totalDurationMs: 0,
      bestMaxSpeedMps: 0,
      overallAverageSpeedMps: 0,
    });
    expect(model.averageSpeedPerTrip).toEqual([]);
    expect(model.heatmapCells).toHaveLength(168);
    expect(model.maxHeatmapActivityMs).toBe(0);
  });

  it('creates trip-level chart points in the selected display unit', () => {
    const trips = [
      makeTrip('trip-2', {
        startedAt: '2026-05-19T14:00:00.000Z',
        totalDistanceMeters: 1609.344,
        averageSpeedMps: 10,
        maxSpeedMps: 20,
        units: 'km/h',
      }),
      makeTrip('trip-1', {
        startedAt: '2026-05-18T14:00:00.000Z',
        totalDistanceMeters: 1000,
        averageSpeedMps: 5,
        maxSpeedMps: 12,
        units: 'MPH',
      }),
    ];

    const model = buildInsightsModel(trips, 'MPH');

    expect(model.averageSpeedPerTrip.map((point) => point.tripId)).toEqual([
      'trip-1',
      'trip-2',
    ]);
    expect(model.averageSpeedPerTrip.map((point) => point.value)).toEqual([
      Math.round(displaySpeed(5, 'MPH')),
      Math.round(displaySpeed(10, 'MPH')),
    ]);
    expect(model.distancePerTrip.map((point) => point.value)).toEqual([
      Number(displayDistance(1000, 'MPH').toFixed(1)),
      1,
    ]);
  });

  it('buckets moving samples into the activity heatmap', () => {
    const sample = makeSample(1, {
      recordedAt: '2026-05-18T14:20:00.000Z',
    });
    const model = buildInsightsModel(
      [
        makeTrip('trip-1', {
          speedSamples: [sample],
        }),
      ],
      'km/h',
    );
    const date = new Date(sample.recordedAt);
    const cell = model.heatmapCells.find(
      (item) => item.dayIndex === date.getDay() && item.hour === date.getHours(),
    );

    expect(cell?.activityMs).toBe(500);
    expect(cell?.sampleCount).toBe(1);
    expect(cell?.tripCount).toBe(1);
    expect(cell?.intensity).toBe(1);
  });

  it('falls back to trip duration when older trips do not have samples', () => {
    const model = buildInsightsModel(
      [
        makeTrip('legacy', {
          startedAt: '2026-05-18T14:30:00.000Z',
          endedAt: '2026-05-18T16:00:00.000Z',
          speedSamples: [],
        }),
      ],
      'km/h',
    );

    const totalHeatmapMs = model.heatmapCells.reduce(
      (sum, cell) => sum + cell.activityMs,
      0,
    );
    expect(totalHeatmapMs).toBe(90 * 60 * 1000);
  });

  it('downsamples speed traces while keeping endpoints and spikes', () => {
    const samples = Array.from({ length: 20 }, (_, index) => ({
      elapsedMs: index * 1000,
      speedMps: index === 10 ? 50 : index,
    }));

    const reduced = downsampleSpeedSamples(samples, 6);

    expect(reduced[0]).toBe(samples[0]);
    expect(reduced[reduced.length - 1]).toBe(samples[samples.length - 1]);
    expect(reduced.some((sample) => sample.speedMps === 50)).toBe(true);
    expect(reduced.length).toBeLessThanOrEqual(6);
  });

  it('builds speed trace chart points in display units', () => {
    const trace = buildSpeedTrace([makeSample(1, { speedMps: 10 })], 'km/h');

    expect(trace).toEqual([
      {
        tripId: 'trip-1',
        label: '0m',
        value: 36,
        rawMps: 10,
      },
    ]);
  });
});
