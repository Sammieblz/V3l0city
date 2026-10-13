import { z } from 'zod';
import {
  coordinatesSchema, errorResponseSchema, idSchema, maxRealtimeFrameBytes, reactionKindSchema,
  realtimeProtocolVersion, sharingStateSchema, timestampSchema, tripMembershipStateSchema,
} from './primitives';

const envelope = { protocolVersion: z.literal(realtimeProtocolVersion), requestId: idSchema };
const tripEnvelope = { ...envelope, tripId: idSchema };
const sequenceSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const locationUpdateSchema = z.strictObject({
  type: z.literal('LOCATION_UPDATE'), ...tripEnvelope, connectionEpoch: idSchema, seq: sequenceSchema,
  location: coordinatesSchema, heading: z.number().finite().min(0).lt(360).nullable(),
  speedMps: z.number().finite().nonnegative().max(120), accuracyMeters: z.number().finite().nonnegative().max(100_000),
  moving: z.boolean(), clientTimestamp: timestampSchema, privacyState: z.literal('sharing'),
});
export const clientRealtimeSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('CONNECT'), ...envelope, accessToken: z.string().min(32).max(4_096), connectionEpoch: idSchema }),
  z.strictObject({ type: z.literal('JOIN_TRIP'), ...tripEnvelope }),
  locationUpdateSchema,
  z.strictObject({ type: z.literal('LOCATION_SHARING_CHANGE'), ...tripEnvelope, privacyState: sharingStateSchema }),
  z.strictObject({ type: z.literal('REACTION_SEND'), ...tripEnvelope, id: idSchema, reaction: reactionKindSchema,
    createdAt: timestampSchema, expiresAt: timestampSchema }),
  z.strictObject({ type: z.literal('PING'), ...envelope }),
]);
export const acceptedMemberLocationSchema = z.strictObject({
  memberId: idSchema, connectionEpoch: idSchema, seq: sequenceSchema,
  location: coordinatesSchema, heading: z.number().finite().min(0).lt(360).nullable(),
  speedMps: z.number().finite().nonnegative().max(120), accuracyMeters: z.number().finite().nonnegative().max(100_000),
  moving: z.boolean(), acceptedAt: timestampSchema, privacyState: z.literal('sharing'),
});
export const serverRealtimeSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('CONNECTED'), ...envelope, connectionEpoch: idSchema }),
  z.strictObject({ type: z.literal('PRESENCE_SNAPSHOT'), ...tripEnvelope, snapshotVersion: sequenceSchema,
    serverTimestamp: timestampSchema, members: z.array(acceptedMemberLocationSchema).max(50) }),
  z.strictObject({ type: z.literal('MEMBER_LOCATION_DELTA'), ...tripEnvelope, member: acceptedMemberLocationSchema }),
  z.strictObject({ type: z.literal('REACTION_RECEIVED'), ...tripEnvelope, id: idSchema, senderId: idSchema,
    reaction: reactionKindSchema, createdAt: timestampSchema, expiresAt: timestampSchema }),
  z.strictObject({ type: z.literal('WAYPOINT_EVENT'), ...tripEnvelope, waypointId: idSchema,
    action: z.enum(['upserted', 'deleted']), revision: sequenceSchema }),
  z.strictObject({ type: z.literal('MEMBER_STATE'), ...tripEnvelope, memberId: idSchema,
    state: tripMembershipStateSchema, presence: z.enum(['online', 'stale', 'disconnected']), privacyState: sharingStateSchema }),
  z.strictObject({ type: z.literal('PONG'), ...envelope, serverTimestamp: timestampSchema }),
  z.strictObject({ type: z.literal('ERROR'), protocolVersion: z.literal(realtimeProtocolVersion), error: errorResponseSchema }),
]);

export type ClientRealtimeMessage = z.infer<typeof clientRealtimeSchema>;
export type ServerRealtimeMessage = z.infer<typeof serverRealtimeSchema>;
export type LocationSequence = { connectionEpoch: string; lastSequence: number };

/** Epoch changes require an authenticated CONNECT; a location frame cannot reset the watermark. */
export function acceptsLocationSequence(current: LocationSequence, incoming: { connectionEpoch: string; seq: number }): boolean {
  return idSchema.safeParse(current.connectionEpoch).success
    && incoming.connectionEpoch === current.connectionEpoch
    && Number.isSafeInteger(current.lastSequence) && current.lastSequence >= 0
    && sequenceSchema.safeParse(incoming.seq).success && incoming.seq > current.lastSequence;
}

export function withinTimestampWindow(timestamp: string, nowMs: number, policy: { maxPastAgeMs: number; maxFutureSkewMs: number }): boolean {
  if (!timestampSchema.safeParse(timestamp).success || !Number.isFinite(nowMs)
    || !Number.isFinite(policy.maxPastAgeMs) || policy.maxPastAgeMs < 0
    || !Number.isFinite(policy.maxFutureSkewMs) || policy.maxFutureSkewMs < 0) return false;
  const value = Date.parse(timestamp);
  return value >= nowMs - policy.maxPastAgeMs && value <= nowMs + policy.maxFutureSkewMs;
}

export function utf8ByteLength(value: string): number {
  let size = 0;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    size += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return size;
}

export function decodeClientRealtime(raw: unknown):
  | { ok: true; message: ClientRealtimeMessage }
  | { ok: false; code: 'FRAME_TOO_LARGE' | 'BAD_REQUEST' | 'UNSUPPORTED_VERSION' } {
  if (typeof raw !== 'string') return { ok: false, code: 'BAD_REQUEST' };
  if (utf8ByteLength(raw) > maxRealtimeFrameBytes) return { ok: false, code: 'FRAME_TOO_LARGE' };
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return { ok: false, code: 'BAD_REQUEST' }; }
  if (typeof value === 'object' && value !== null && 'protocolVersion' in value
    && value.protocolVersion !== realtimeProtocolVersion) return { ok: false, code: 'UNSUPPORTED_VERSION' };
  const parsed = clientRealtimeSchema.safeParse(value);
  return parsed.success ? { ok: true, message: parsed.data } : { ok: false, code: 'BAD_REQUEST' };
}
