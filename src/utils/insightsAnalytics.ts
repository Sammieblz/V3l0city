import type {
  TripSignalQuality,
  TripSpeedSource,
  TripWithSpeedSamples,
} from '../domain/trip';
import { colors } from '../theme/paperTheme';
import type { Units } from './speedMath';

export type TripChartPoint = {
  tripId: string;
  label: string;
  value: number;
  rawMps?: number;
  rawMeters?: number;
};

export type BreakdownPoint = {
  key: string;
  label: string;
  count: number;
  value: number;
  color: string;
};

export type HeatmapCell = {
  key: string;
  dayIndex: number;
  dayLabel: string;
  hour: number;
  activityMs: number;
  tripCount: number;
  sampleCount: number;
  averageSpeedMps: number;
  intensity: number;
};

export type InsightsSummary = {
  tripCount: number;
  totalDistanceMeters: number;
  totalDurationMs: number;
  bestMaxSpeedMps: number;
  overallAverageSpeedMps: number;
};

export type InsightsModel = {
  summary: InsightsSummary;
  averageSpeedPerTrip: TripChartPoint[];
  maxSpeedPerTrip: TripChartPoint[];
  distancePerTrip: TripChartPoint[];
  qualityBreakdown: BreakdownPoint[];
  sourceBreakdown: BreakdownPoint[];
  heatmapCells: HeatmapCell[];
  maxHeatmapActivityMs: number;
};

type MutableHeatmapCell = Omit<
  HeatmapCell,
  'activityMs' | 'tripCount' | 'sampleCount' | 'averageSpeedMps' | 'intensity'
> & {
  activityMs: number;
  sampleCount: number;
  speedWeightedMs: number;
  tripIds: Set<string>;
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SPEED_BY_UNIT: Record<Units, number> = {
  'km/h': 3.6,
  MPH: 2.2369362921,
};
const DISTANCE_BY_UNIT: Record<Units, number> = {
  'km/h': 1000,
  MPH: 1609.344,
};
const SAMPLE_DURATION_FALLBACK_MS = 500;
const MAX_SAMPLE_GAP_MS = 5000;

const QUALITY_COLORS: Record<TripSignalQuality, string> = {
  good: colors.accent,
  medium: colors.brandGold,
  poor: colors.danger,
};

const SOURCE_COLORS: Record<TripSpeedSource, string> = {
  gps: colors.accent,
  blended: colors.brandTeal,
  'motion-only': colors.brandGold,
  none: colors.textMuted,
};

export const displaySpeed = (speedMps: number, units: Units): number =>
  speedMps * SPEED_BY_UNIT[units];

export const displayDistance = (distanceMeters: number, units: Units): number =>
  distanceMeters / DISTANCE_BY_UNIT[units];

export const distanceUnitLabel = (units: Units): string =>
  units === 'km/h' ? 'km' : 'mi';

export const getTripDurationMs = (trip: {
  startedAt: string;
  endedAt: string;
}): number => {
  const started = new Date(trip.startedAt).getTime();
  const ended = new Date(trip.endedAt).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(ended)) {
    return 0;
  }
  return Math.max(0, ended - started);
};

const formatTripLabel = (startedAt: string): string => {
  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

const createHeatmapCells = (): MutableHeatmapCell[] => {
  const cells: MutableHeatmapCell[] = [];
  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      cells.push({
        key: `${dayIndex}-${hour}`,
        dayIndex,
        dayLabel: DAY_LABELS[dayIndex],
        hour,
        activityMs: 0,
        sampleCount: 0,
        speedWeightedMs: 0,
        tripIds: new Set<string>(),
      });
    }
  }
  return cells;
};

const cellIndex = (date: Date): number => date.getDay() * 24 + date.getHours();

const addHeatmapDuration = (
  cells: MutableHeatmapCell[],
  tripId: string,
  startMs: number,
  durationMs: number,
  speedMps: number,
  sampleCount = 0,
): void => {
  if (durationMs <= 0 || !Number.isFinite(startMs)) {
    return;
  }

  let cursor = startMs;
  const endMs = startMs + durationMs;
  while (cursor < endMs) {
    const currentDate = new Date(cursor);
    const nextHour = new Date(currentDate);
    nextHour.setMinutes(60, 0, 0);
    const sliceEnd = Math.min(endMs, nextHour.getTime());
    const sliceMs = Math.max(0, sliceEnd - cursor);
    const cell = cells[cellIndex(currentDate)];

    cell.activityMs += sliceMs;
    cell.speedWeightedMs += speedMps * sliceMs;
    cell.sampleCount += sampleCount;
    cell.tripIds.add(tripId);
    cursor = sliceEnd;
  }
};

const buildHeatmap = (trips: TripWithSpeedSamples[]) => {
  const cells = createHeatmapCells();

  for (const trip of trips) {
    const samples = trip.speedSamples;
    if (samples.length > 0) {
      samples.forEach((sample, index) => {
        if (!sample.isMoving || sample.speedMps <= 0.5) {
          return;
        }
        const currentMs = new Date(sample.recordedAt).getTime();
        const nextMs =
          samples[index + 1] == null
            ? currentMs + SAMPLE_DURATION_FALLBACK_MS
            : new Date(samples[index + 1].recordedAt).getTime();
        const rawDurationMs = nextMs - currentMs;
        const durationMs =
          rawDurationMs > 0 && rawDurationMs <= MAX_SAMPLE_GAP_MS
            ? rawDurationMs
            : SAMPLE_DURATION_FALLBACK_MS;

        addHeatmapDuration(
          cells,
          trip.id,
          currentMs,
          durationMs,
          sample.speedMps,
          1,
        );
      });
    } else {
      addHeatmapDuration(
        cells,
        trip.id,
        new Date(trip.startedAt).getTime(),
        getTripDurationMs(trip),
        trip.averageSpeedMps,
      );
    }
  }

  const maxHeatmapActivityMs = Math.max(
    0,
    ...cells.map((cell) => cell.activityMs),
  );

  return {
    cells: cells.map<HeatmapCell>((cell) => ({
      key: cell.key,
      dayIndex: cell.dayIndex,
      dayLabel: cell.dayLabel,
      hour: cell.hour,
      activityMs: cell.activityMs,
      tripCount: cell.tripIds.size,
      sampleCount: cell.sampleCount,
      averageSpeedMps:
        cell.activityMs > 0 ? cell.speedWeightedMs / cell.activityMs : 0,
      intensity:
        maxHeatmapActivityMs > 0
          ? cell.activityMs / maxHeatmapActivityMs
          : 0,
    })),
    maxHeatmapActivityMs,
  };
};

const buildBreakdown = <T extends string>(
  keys: readonly T[],
  counts: Map<T, number>,
  labels: Record<T, string>,
  colors: Record<T, string>,
): BreakdownPoint[] => {
  const total = keys.reduce((sum, key) => sum + (counts.get(key) ?? 0), 0);
  if (total === 0) {
    return [];
  }

  return keys
    .map((key) => {
      const count = counts.get(key) ?? 0;
      return {
        key,
        label: labels[key],
        count,
        value: count,
        color: colors[key],
      };
    })
    .filter((item) => item.count > 0);
};

export const buildInsightsModel = (
  trips: TripWithSpeedSamples[],
  units: Units,
): InsightsModel => {
  const chronological = [...trips].sort(
    (a, b) =>
      new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  const totalDistanceMeters = trips.reduce(
    (sum, trip) => sum + trip.totalDistanceMeters,
    0,
  );
  const totalDurationMs = trips.reduce(
    (sum, trip) => sum + getTripDurationMs(trip),
    0,
  );
  const bestMaxSpeedMps = trips.reduce(
    (best, trip) => Math.max(best, trip.maxSpeedMps),
    0,
  );
  const fallbackAverage =
    trips.length > 0
      ? trips.reduce((sum, trip) => sum + trip.averageSpeedMps, 0) /
        trips.length
      : 0;
  const overallAverageSpeedMps =
    totalDurationMs > 0
      ? totalDistanceMeters / (totalDurationMs / 1000)
      : fallbackAverage;

  const qualityCounts = new Map<TripSignalQuality, number>();
  const sourceCounts = new Map<TripSpeedSource, number>();
  trips.forEach((trip) => {
    trip.speedSamples.forEach((sample) => {
      qualityCounts.set(sample.quality, (qualityCounts.get(sample.quality) ?? 0) + 1);
      sourceCounts.set(sample.source, (sourceCounts.get(sample.source) ?? 0) + 1);
    });
  });

  const heatmap = buildHeatmap(trips);

  return {
    summary: {
      tripCount: trips.length,
      totalDistanceMeters,
      totalDurationMs,
      bestMaxSpeedMps,
      overallAverageSpeedMps,
    },
    averageSpeedPerTrip: chronological.map((trip) => ({
      tripId: trip.id,
      label: formatTripLabel(trip.startedAt),
      value: Math.round(displaySpeed(trip.averageSpeedMps, units)),
      rawMps: trip.averageSpeedMps,
    })),
    maxSpeedPerTrip: chronological.map((trip) => ({
      tripId: trip.id,
      label: formatTripLabel(trip.startedAt),
      value: Math.round(displaySpeed(trip.maxSpeedMps, units)),
      rawMps: trip.maxSpeedMps,
    })),
    distancePerTrip: chronological.map((trip) => ({
      tripId: trip.id,
      label: formatTripLabel(trip.startedAt),
      value: Number(displayDistance(trip.totalDistanceMeters, units).toFixed(1)),
      rawMeters: trip.totalDistanceMeters,
    })),
    qualityBreakdown: buildBreakdown(
      ['good', 'medium', 'poor'] as const,
      qualityCounts,
      { good: 'Good', medium: 'Medium', poor: 'Poor' },
      QUALITY_COLORS,
    ),
    sourceBreakdown: buildBreakdown(
      ['gps', 'blended', 'motion-only', 'none'] as const,
      sourceCounts,
      {
        gps: 'GPS',
        blended: 'Blended',
        'motion-only': 'Motion',
        none: 'None',
      },
      SOURCE_COLORS,
    ),
    heatmapCells: heatmap.cells,
    maxHeatmapActivityMs: heatmap.maxHeatmapActivityMs,
  };
};

export const downsampleSpeedSamples = <
  T extends { elapsedMs: number; speedMps: number },
>(
  samples: T[],
  maxPoints = 120,
): T[] => {
  if (samples.length <= maxPoints) {
    return samples;
  }
  if (maxPoints <= 2) {
    return [samples[0], samples[samples.length - 1]].slice(0, maxPoints);
  }

  const sampled: T[] = [samples[0]];
  const bucketSize = (samples.length - 2) / (maxPoints - 2);
  let anchor = samples[0];

  for (let bucket = 0; bucket < maxPoints - 2; bucket += 1) {
    const rangeStart = Math.floor(bucket * bucketSize) + 1;
    const rangeEnd = Math.floor((bucket + 1) * bucketSize) + 1;
    const nextStart = Math.floor((bucket + 1) * bucketSize) + 1;
    const nextEnd = Math.floor((bucket + 2) * bucketSize) + 1;
    const currentBucket = samples.slice(rangeStart, rangeEnd);
    const nextBucket = samples.slice(
      nextStart,
      Math.min(nextEnd, samples.length - 1),
    );

    const average =
      nextBucket.length > 0
        ? nextBucket.reduce(
            (acc, sample) => ({
              elapsedMs: acc.elapsedMs + sample.elapsedMs,
              speedMps: acc.speedMps + sample.speedMps,
            }),
            { elapsedMs: 0, speedMps: 0 },
          )
        : samples[samples.length - 1];
    const avgX =
      nextBucket.length > 0
        ? average.elapsedMs / nextBucket.length
        : average.elapsedMs;
    const avgY =
      nextBucket.length > 0
        ? average.speedMps / nextBucket.length
        : average.speedMps;

    let selected = currentBucket[0] ?? samples[rangeStart];
    let selectedArea = -1;
    for (const point of currentBucket) {
      const area = Math.abs(
        (anchor.elapsedMs - avgX) * (point.speedMps - anchor.speedMps) -
          (anchor.elapsedMs - point.elapsedMs) * (avgY - anchor.speedMps),
      );
      if (area > selectedArea) {
        selectedArea = area;
        selected = point;
      }
    }

    sampled.push(selected);
    anchor = selected;
  }

  sampled.push(samples[samples.length - 1]);
  return sampled;
};

export const buildSpeedTrace = (
  samples: TripWithSpeedSamples['speedSamples'],
  units: Units,
  maxPoints = 120,
): TripChartPoint[] =>
  downsampleSpeedSamples(samples, maxPoints).map((sample) => ({
    tripId: sample.tripId,
    label: `${Math.round(sample.elapsedMs / 60000)}m`,
    value: Number(displaySpeed(sample.speedMps, units).toFixed(1)),
    rawMps: sample.speedMps,
  }));
