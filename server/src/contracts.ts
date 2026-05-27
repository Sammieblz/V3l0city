import { z } from 'zod';

export const speedSourceSchema = z.enum(['none', 'gps', 'blended', 'motion-only']);
export const signalQualitySchema = z.enum(['good', 'medium', 'poor']);
export const headingSourceSchema = z.enum(['none', 'course', 'device']);

export const registerDeviceSchema = z.object({
  installId: z.string().min(8).max(128),
  platform: z.string().min(2).max(32),
  appVersion: z.string().min(1).max(64),
  buildNumber: z.string().min(1).max(64),
  expoPushToken: z.string().min(8).max(256).nullable().optional(),
  nativePushToken: z.string().min(8).max(4096).nullable().optional(),
  pushPlatform: z.enum(['ios', 'android']).nullable().optional(),
});

export const startTripSchema = z.object({
  clientTripId: z.string().min(1).max(128),
  startedAt: z.string().datetime(),
  units: z.enum(['km/h', 'MPH']),
  mountLabel: z.string().max(64).nullable().optional(),
});

export const telemetrySampleSchema = z.object({
  sequence: z.number().int().positive(),
  recordedAt: z.string().datetime(),
  elapsedMs: z.number().int().nonnegative(),
  speedMps: z.number().nonnegative().max(120),
  distanceMeters: z.number().nonnegative(),
  headingDegrees: z.number().min(0).max(360).nullable(),
  headingSource: headingSourceSchema.default('none'),
  headingAccuracyDegrees: z.number().nonnegative().nullable().default(null),
  headingQuality: signalQualitySchema.default('poor'),
  headingReasons: z.array(z.string().min(1).max(64)).max(12).default([]),
  source: speedSourceSchema,
  quality: signalQualitySchema,
  qualityScore: z.number().min(0).max(1),
  qualityReasons: z.array(z.string().min(1).max(64)).max(12),
  gpsAccuracyMeters: z.number().nonnegative().nullable(),
  fixAgeMs: z.number().int().nonnegative().nullable(),
  nativeSpeedUsed: z.boolean(),
  isMoving: z.boolean(),
  isStopped: z.boolean(),
  stale: z.boolean(),
});

export const sampleBatchSchema = z.object({
  batchId: z.string().min(1).max(128),
  samples: z.array(telemetrySampleSchema).max(120),
});

export const completeTripSchema = z.object({
  endedAt: z.string().datetime(),
  totalDistanceMeters: z.number().nonnegative(),
  maxSpeedMps: z.number().nonnegative().max(120),
  averageSpeedMps: z.number().nonnegative().max(120),
  finalSequence: z.number().int().nonnegative(),
});

export const wsMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    protocolVersion: z.literal(1),
    tripId: z.string().min(1),
    lastKnownSequence: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('sample_batch'),
    batchId: z.string().min(1).max(128),
    samples: z.array(telemetrySampleSchema).max(120),
  }),
  z.object({
    type: z.literal('trip_complete'),
    payload: completeTripSchema,
  }),
  z.object({
    type: z.literal('ping'),
  }),
]);

export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
export type StartTripInput = z.infer<typeof startTripSchema>;
export type TelemetrySampleInput = z.infer<typeof telemetrySampleSchema>;
export type SampleBatchInput = z.infer<typeof sampleBatchSchema>;
export type CompleteTripInput = z.infer<typeof completeTripSchema>;
