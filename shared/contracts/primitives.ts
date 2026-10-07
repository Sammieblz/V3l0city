import { z } from 'zod';

/** Product declarations are separate from the existing telemetry /v1 runtime. */
export const apiVersion = 'v2' as const;
export const realtimeProtocolVersion = 2 as const;
export const maxRealtimeFrameBytes = 8_192;

export const idSchema = z.string().uuid();
/** Existing personal recordings use timestamp strings; retain their opaque identity. */
export const localRecordingIdSchema = z.string().min(1).max(128);
export const timestampSchema = z.string().datetime({ offset: true });
export const revisionSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const cursorSchema = z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/);
export const paginationSchema = z.strictObject({
  cursor: cursorSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
export const coordinatesSchema = z.strictObject({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});
export const sharedTripStateSchema = z.enum(['scheduled', 'lobby', 'active', 'ended', 'cancelled']);
export const tripMembershipStateSchema = z.enum(['invited', 'joined', 'left', 'removed']);
export const tripRoleSchema = z.enum(['host', 'member']);
export const crewRoleSchema = z.enum(['owner', 'admin', 'member']);
export const sharingStateSchema = z.enum(['sharing', 'paused']);
export const waypointKindSchema = z.enum([
  'destination', 'fuel', 'food', 'meetup', 'regroup', 'parking', 'mechanical', 'custom',
]);
export const reactionKindSchema = z.enum(['thanks', 'wait', 'fuel', 'food', 'regroup', 'all_good', 'need_help']);
export const errorCodeSchema = z.enum([
  'BAD_REQUEST', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT',
  'CURSOR_EXPIRED', 'RATE_LIMITED', 'UNSUPPORTED_VERSION', 'SERVICE_UNAVAILABLE',
  'FRAME_TOO_LARGE', 'INTERNAL_ERROR',
]);
export const errorResponseSchema = z.strictObject({
  code: errorCodeSchema,
  message: z.string().min(1).max(256),
  requestId: z.string().min(1).max(128),
  details: z.array(z.strictObject({ field: z.string().max(128), code: z.string().max(64) })).max(20).optional(),
});

const telemetryHealthFields = {
  service: z.literal('telemetry'),
  apiVersions: z.tuple([z.literal(1)]),
  productApiEnabled: z.literal(false),
  environment: z.enum(['local', 'development', 'staging', 'production']).optional(),
};
export const liveHealthSchema = z.strictObject({ status: z.literal('live'), ...telemetryHealthFields });
export const readinessHealthSchema = z.strictObject({ status: z.literal('ready'), ...telemetryHealthFields });

export type SharedTripState = z.infer<typeof sharedTripStateSchema>;
export type TripMembershipState = z.infer<typeof tripMembershipStateSchema>;
export type TripRole = z.infer<typeof tripRoleSchema>;
export type SharingState = z.infer<typeof sharingStateSchema>;
export type ContractErrorCode = z.infer<typeof errorCodeSchema>;

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.strictObject({ items: z.array(item).max(100), nextCursor: cursorSchema.nullable() });
}
