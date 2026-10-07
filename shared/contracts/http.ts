import { z } from 'zod';
import {
  coordinatesSchema, crewRoleSchema, cursorSchema, idSchema, localRecordingIdSchema, pageSchema, revisionSchema,
  sharingStateSchema, sharedTripStateSchema, timestampSchema, tripMembershipStateSchema,
  tripRoleSchema, waypointKindSchema,
} from './primitives';

export const publicUserSchema = z.strictObject({
  id: idSchema, handle: z.string().min(2).max(32), displayName: z.string().min(1).max(80),
  avatarUrl: z.string().url().max(2_048).nullable(), revision: revisionSchema,
});
export const profilePatchSchema = z.strictObject({
  displayName: z.string().min(1).max(80).optional(),
  handle: z.string().min(2).max(32).regex(/^[a-z0-9_]+$/).optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one profile field is required');
export const registerSchema = z.discriminatedUnion('method', [
  z.strictObject({ method: z.literal('password'), email: z.string().email().max(254),
    password: z.string().min(12).max(128), displayName: z.string().min(1).max(80) }),
  z.strictObject({ method: z.literal('magic_link'), email: z.string().email().max(254),
    displayName: z.string().min(1).max(80) }),
]);
export const loginSchema = z.discriminatedUnion('method', [
  z.strictObject({ method: z.literal('password'), email: z.string().email().max(254), password: z.string().min(1).max(128) }),
  z.strictObject({ method: z.literal('magic_link'), email: z.string().email().max(254) }),
]);
export const tokenSchema = z.string().min(32).max(4_096);
export const tokenInputSchema = z.strictObject({ token: tokenSchema });
export const emailInputSchema = z.strictObject({ email: z.string().email().max(254) });
export const passwordResetSchema = z.strictObject({ token: tokenSchema, password: z.string().min(12).max(128) });
export const acceptedSchema = z.strictObject({ accepted: z.literal(true) });
export const sessionSchema = z.strictObject({
  accessToken: tokenSchema, refreshToken: tokenSchema, expiresAt: timestampSchema, user: publicUserSchema,
});
export const authResultSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('verification_required') }),
  z.strictObject({ status: z.literal('link_requested') }),
  z.strictObject({ status: z.literal('authenticated'), session: sessionSchema }),
]);
export const sessionInventorySchema = z.strictObject({
  id: idSchema, deviceId: idSchema, createdAt: timestampSchema, lastSeenAt: timestampSchema,
  expiresAt: timestampSchema, current: z.boolean(),
});
export const vehicleInputSchema = z.strictObject({
  id: idSchema, nickname: z.string().min(1).max(80), type: z.enum(['car', 'motorcycle', 'other']),
  make: z.string().max(80).nullable(), model: z.string().max(80).nullable(), markerKey: z.string().min(1).max(64),
});
export const vehicleSchema = vehicleInputSchema.extend({ ownerId: idSchema, revision: revisionSchema, deletedAt: timestampSchema.nullable() });
export const buddyRequestInputSchema = z.strictObject({ addresseeId: idSchema });
export const buddyRequestSchema = z.strictObject({
  id: idSchema, requesterId: idSchema, addresseeId: idSchema,
  status: z.enum(['pending', 'accepted', 'declined', 'cancelled']), createdAt: timestampSchema, revision: revisionSchema,
});
export const blockInputSchema = z.strictObject({ blockedId: idSchema });
export const crewInputSchema = z.strictObject({
  name: z.string().min(1).max(100), description: z.string().max(2_000), imageId: idSchema.nullable(),
});
export const crewSchema = crewInputSchema.extend({ id: idSchema, ownerId: idSchema, revision: revisionSchema });
export const crewMembershipSchema = z.strictObject({
  crewId: idSchema, userId: idSchema, role: crewRoleSchema, state: tripMembershipStateSchema, revision: revisionSchema,
});
export const crewMemberPatchSchema = z.strictObject({ role: crewRoleSchema, expectedRevision: revisionSchema });
export const inviteInputSchema = z.strictObject({ userId: idSchema.optional(), expiresAt: timestampSchema });
export const inviteSchema = z.strictObject({ id: idSchema, code: z.string().min(8).max(32), expiresAt: timestampSchema });
export const meetupInputSchema = z.strictObject({
  title: z.string().min(1).max(100), description: z.string().max(2_000), crewId: idSchema.nullable(),
  location: coordinatesSchema, startsAt: timestampSchema, timeZone: z.string().min(1).max(80),
  rsvpClosesAt: timestampSchema.nullable(), capacity: z.number().int().positive().max(10_000).nullable(),
});
export const meetupSchema = meetupInputSchema.extend({
  id: idSchema, creatorId: idSchema, state: z.enum(['scheduled', 'cancelled', 'completed']),
  tripId: idSchema.nullable(), revision: revisionSchema,
});
export const rsvpInputSchema = z.strictObject({ status: z.enum(['going', 'maybe', 'declined']) });
export const rsvpSchema = rsvpInputSchema.extend({ meetupId: idSchema, userId: idSchema, revision: revisionSchema });
export const routePlanSchema = z.strictObject({
  destination: coordinatesSchema.nullable(), provider: z.literal('mapbox'),
  routeReference: z.string().min(1).max(512).nullable(), revision: revisionSchema,
});
export const tripInputSchema = z.strictObject({
  title: z.string().min(1).max(100), scheduledAt: timestampSchema.nullable(),
  visibility: z.enum(['invite_only', 'crew']), crewId: idSchema.nullable(), route: routePlanSchema,
});
export const sharedTripSchema = tripInputSchema.extend({
  id: idSchema, hostId: idSchema, state: sharedTripStateSchema, startedAt: timestampSchema.nullable(),
  endedAt: timestampSchema.nullable(), revision: revisionSchema,
});
export const tripJoinSchema = z.strictObject({ code: z.string().min(8).max(32), vehicleId: idSchema.nullable() });
export const tripMembershipSchema = z.strictObject({
  tripId: idSchema, userId: idSchema, role: tripRoleSchema, state: tripMembershipStateSchema,
  ready: z.boolean(), vehicleId: idSchema.nullable(), sharingState: sharingStateSchema, revision: revisionSchema,
});
export const membershipPatchSchema = z.strictObject({
  ready: z.boolean().optional(), vehicleId: idSchema.nullable().optional(), sharingState: sharingStateSchema.optional(),
  expectedRevision: revisionSchema,
});
export const waypointInputSchema = z.strictObject({
  id: idSchema, kind: waypointKindSchema, title: z.string().min(1).max(100),
  location: coordinatesSchema, ordinal: z.number().int().nonnegative().max(10_000), expectedRouteRevision: revisionSchema,
});
export const waypointSchema = waypointInputSchema.extend({ tripId: idSchema, creatorId: idSchema, revision: revisionSchema, deletedAt: timestampSchema.nullable() });
export const chatInputSchema = z.strictObject({ id: idSchema, body: z.string().min(1).max(2_000) });
export const chatMessageSchema = chatInputSchema.extend({
  tripId: idSchema, authorId: idSchema.nullable(), kind: z.enum(['user', 'system']),
  createdAt: timestampSchema, revision: revisionSchema, deletedAt: timestampSchema.nullable(),
});
export const syncMutationSchema = z.discriminatedUnion('operation', [
  z.strictObject({ idempotencyKey: idSchema, operation: z.literal('profile.patch'), payload: profilePatchSchema }),
  z.strictObject({ idempotencyKey: idSchema, operation: z.literal('vehicle.upsert'), payload: vehicleInputSchema }),
  z.strictObject({ idempotencyKey: idSchema, operation: z.literal('chat.send'), tripId: idSchema, payload: chatInputSchema }),
  z.strictObject({ idempotencyKey: idSchema, operation: z.literal('waypoint.upsert'), tripId: idSchema, payload: waypointInputSchema }),
]);
export const syncPushSchema = z.strictObject({ mutations: z.array(syncMutationSchema).min(1).max(50) });
export const mutationReceiptSchema = z.strictObject({
  idempotencyKey: idSchema, status: z.enum(['accepted', 'duplicate', 'rejected']),
  entityId: idSchema.nullable(), revision: revisionSchema.nullable(), errorCode: z.string().min(1).max(64).nullable(),
});
export const syncReceiptSchema = z.strictObject({ receipts: z.array(mutationReceiptSchema).max(50) });
export const voiceInputSchema = z.strictObject({ mode: z.enum(['crew', 'proximity']) });
export const voiceGrantSchema = z.strictObject({
  token: tokenSchema, room: z.string().min(1).max(128), serverUrl: z.string().url().max(2_048), expiresAt: timestampSchema,
});
export const pushInputSchema = z.strictObject({
  id: idSchema, deviceId: idSchema, platform: z.enum(['ios', 'android']), token: z.string().min(8).max(4_096),
});
export const entitlementSchema = z.strictObject({
  name: z.literal('v3l0city_plus'), active: z.boolean(), expiresAt: timestampSchema.nullable(), checkedAt: timestampSchema,
});
export const backupInputSchema = z.strictObject({
  id: idSchema, localTripId: localRecordingIdSchema, mediaObjectId: idSchema,
  formatVersion: z.number().int().positive().max(2_147_483_647),
  consent: z.literal('backup_personal_recording'),
});
export const backupSchema = z.strictObject({
  id: idSchema, localTripId: localRecordingIdSchema, mediaObjectId: idSchema,
  formatVersion: z.number().int().positive().max(2_147_483_647),
  consentedAt: timestampSchema, expiresAt: timestampSchema.nullable(),
  revision: revisionSchema, deletedAt: timestampSchema.nullable(),
});
const changeEnvelope = { cursor: cursorSchema, entityId: idSchema, revision: revisionSchema };
export const syncChangeSchema = z.discriminatedUnion('entityType', [
  z.strictObject({ ...changeEnvelope, entityType: z.literal('profile'), record: publicUserSchema }),
  z.strictObject({ ...changeEnvelope, entityType: z.literal('vehicle'), record: vehicleSchema }),
  z.strictObject({ ...changeEnvelope, entityType: z.literal('buddy_request'), record: buddyRequestSchema }),
  z.strictObject({ ...changeEnvelope, entityType: z.literal('crew'), record: crewSchema }),
  z.strictObject({ ...changeEnvelope, entityType: z.literal('crew_membership'), record: crewMembershipSchema }),
  z.strictObject({ ...changeEnvelope, entityType: z.literal('meetup'), record: meetupSchema }),
  z.strictObject({ ...changeEnvelope, entityType: z.literal('trip'), record: sharedTripSchema }),
  z.strictObject({ ...changeEnvelope, entityType: z.literal('trip_membership'), record: tripMembershipSchema }),
  z.strictObject({ ...changeEnvelope, entityType: z.literal('waypoint'), record: waypointSchema }),
  z.strictObject({ ...changeEnvelope, entityType: z.literal('message'), record: chatMessageSchema }),
  z.strictObject({ ...changeEnvelope, entityType: z.literal('entitlement'), record: entitlementSchema }),
  z.strictObject({ ...changeEnvelope, entityType: z.literal('tombstone'), deletedEntityType: z.string().min(1).max(64), deletedAt: timestampSchema }),
]);
export const revenueCatWebhookSchema = z.strictObject({
  api_version: z.string().min(1).max(32),
  event: z.looseObject({ id: z.string().min(1).max(128), type: z.string().min(1).max(80),
    app_user_id: z.string().min(1).max(128), environment: z.enum(['SANDBOX', 'PRODUCTION']),
    event_timestamp_ms: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }),
});
export const reportInputSchema = z.strictObject({
  id: idSchema, targetType: z.enum(['user', 'trip', 'message']), targetId: idSchema,
  reason: z.enum(['spam', 'harassment', 'privacy', 'unsafe', 'other']),
  description: z.string().max(2_000), evidenceIds: z.array(idSchema).max(5),
});
export const exportSchema = z.strictObject({ id: idSchema, status: z.enum(['queued', 'ready', 'failed']), downloadUrl: z.string().url().max(2_048).nullable() });

export interface DeclaredRoute {
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  operationId: string;
  tag: string;
  body?: z.ZodType;
  response?: z.ZodType;
  paginated?: boolean;
  unauthenticated?: boolean;
  idempotentMutation?: boolean;
  status?: 200 | 201 | 202 | 204;
}
/** Declarations ONLY: registration does not mount any /v2 Fastify endpoint. */
export const declaredRoutes: readonly DeclaredRoute[] = [
  { method: 'post', path: '/v2/auth/register', operationId: 'register', tag: 'auth', body: registerSchema, response: authResultSchema, unauthenticated: true, status: 202 },
  { method: 'post', path: '/v2/auth/login', operationId: 'login', tag: 'auth', body: loginSchema, response: authResultSchema, unauthenticated: true },
  { method: 'post', path: '/v2/auth/verify-email', operationId: 'verifyEmail', tag: 'auth', body: tokenInputSchema, response: acceptedSchema, unauthenticated: true },
  { method: 'post', path: '/v2/auth/refresh', operationId: 'refreshSession', tag: 'auth', body: z.strictObject({ refreshToken: tokenSchema }), response: sessionSchema, unauthenticated: true },
  { method: 'post', path: '/v2/auth/logout', operationId: 'logout', tag: 'auth', status: 204 },
  { method: 'post', path: '/v2/auth/logout-all', operationId: 'logoutAll', tag: 'auth', status: 204 },
  { method: 'get', path: '/v2/auth/sessions', operationId: 'listSessions', tag: 'auth', response: pageSchema(sessionInventorySchema), paginated: true },
  { method: 'delete', path: '/v2/auth/sessions/{id}', operationId: 'revokeSession', tag: 'auth', status: 204 },
  { method: 'post', path: '/v2/auth/request-password-reset', operationId: 'requestPasswordReset', tag: 'auth', body: emailInputSchema, response: acceptedSchema, unauthenticated: true, status: 202 },
  { method: 'post', path: '/v2/auth/reset-password', operationId: 'resetPassword', tag: 'auth', body: passwordResetSchema, response: acceptedSchema, unauthenticated: true },
  { method: 'get', path: '/v2/me', operationId: 'getProfile', tag: 'profile', response: publicUserSchema },
  { method: 'patch', path: '/v2/me', operationId: 'patchProfile', tag: 'profile', body: profilePatchSchema, response: publicUserSchema, idempotentMutation: true },
  { method: 'delete', path: '/v2/me', operationId: 'deleteAccount', tag: 'profile', body: z.strictObject({ confirmation: z.literal('delete_account') }), response: acceptedSchema, status: 202, idempotentMutation: true },
  { method: 'post', path: '/v2/me/export', operationId: 'requestExport', tag: 'profile', response: exportSchema, status: 202, idempotentMutation: true },
  { method: 'get', path: '/v2/me/vehicles', operationId: 'listVehicles', tag: 'profile', response: pageSchema(vehicleSchema), paginated: true },
  { method: 'post', path: '/v2/me/vehicles', operationId: 'createVehicle', tag: 'profile', body: vehicleInputSchema, response: vehicleSchema, status: 201, idempotentMutation: true },
  { method: 'patch', path: '/v2/me/vehicles/{id}', operationId: 'patchVehicle', tag: 'profile', body: vehicleInputSchema, response: vehicleSchema, idempotentMutation: true },
  { method: 'delete', path: '/v2/me/vehicles/{id}', operationId: 'deleteVehicle', tag: 'profile', status: 204, idempotentMutation: true },
  { method: 'get', path: '/v2/buddies', operationId: 'listBuddies', tag: 'buddies', response: pageSchema(publicUserSchema), paginated: true },
  { method: 'post', path: '/v2/buddy-requests', operationId: 'requestBuddy', tag: 'buddies', body: buddyRequestInputSchema, response: buddyRequestSchema, status: 201, idempotentMutation: true },
  { method: 'post', path: '/v2/buddy-requests/{id}/accept', operationId: 'acceptBuddy', tag: 'buddies', response: buddyRequestSchema, idempotentMutation: true },
  { method: 'post', path: '/v2/buddy-requests/{id}/decline', operationId: 'declineBuddy', tag: 'buddies', response: buddyRequestSchema, idempotentMutation: true },
  { method: 'delete', path: '/v2/buddies/{id}', operationId: 'removeBuddy', tag: 'buddies', status: 204, idempotentMutation: true },
  { method: 'post', path: '/v2/blocks', operationId: 'blockUser', tag: 'buddies', body: blockInputSchema, response: acceptedSchema, idempotentMutation: true },
  { method: 'delete', path: '/v2/blocks/{id}', operationId: 'unblockUser', tag: 'buddies', status: 204, idempotentMutation: true },
  { method: 'get', path: '/v2/crews', operationId: 'listCrews', tag: 'crews', response: pageSchema(crewSchema), paginated: true },
  { method: 'post', path: '/v2/crews', operationId: 'createCrew', tag: 'crews', body: crewInputSchema, response: crewSchema, status: 201, idempotentMutation: true },
  { method: 'get', path: '/v2/crews/{id}', operationId: 'getCrew', tag: 'crews', response: crewSchema },
  { method: 'patch', path: '/v2/crews/{id}', operationId: 'patchCrew', tag: 'crews', body: crewInputSchema, response: crewSchema, idempotentMutation: true },
  { method: 'post', path: '/v2/crews/{id}/invites', operationId: 'inviteCrewMember', tag: 'crews', body: inviteInputSchema, response: inviteSchema, status: 201, idempotentMutation: true },
  { method: 'patch', path: '/v2/crews/{id}/members/{userId}', operationId: 'patchCrewMember', tag: 'crews', body: crewMemberPatchSchema, response: crewMembershipSchema, idempotentMutation: true },
  { method: 'delete', path: '/v2/crews/{id}/members/{userId}', operationId: 'removeCrewMember', tag: 'crews', status: 204, idempotentMutation: true },
  { method: 'get', path: '/v2/meetups', operationId: 'listMeetups', tag: 'meetups', response: pageSchema(meetupSchema), paginated: true },
  { method: 'post', path: '/v2/meetups', operationId: 'createMeetup', tag: 'meetups', body: meetupInputSchema, response: meetupSchema, status: 201, idempotentMutation: true },
  { method: 'get', path: '/v2/meetups/{id}', operationId: 'getMeetup', tag: 'meetups', response: meetupSchema },
  { method: 'patch', path: '/v2/meetups/{id}', operationId: 'patchMeetup', tag: 'meetups', body: meetupInputSchema, response: meetupSchema, idempotentMutation: true },
  { method: 'post', path: '/v2/meetups/{id}/rsvp', operationId: 'rsvpMeetup', tag: 'meetups', body: rsvpInputSchema, response: rsvpSchema, idempotentMutation: true },
  { method: 'post', path: '/v2/meetups/{id}/trip', operationId: 'launchMeetupTrip', tag: 'meetups', response: sharedTripSchema, idempotentMutation: true },
  { method: 'post', path: '/v2/trips', operationId: 'createSharedTrip', tag: 'trips', body: tripInputSchema, response: sharedTripSchema, status: 201, idempotentMutation: true },
  { method: 'get', path: '/v2/trips/{id}', operationId: 'getSharedTrip', tag: 'trips', response: sharedTripSchema },
  { method: 'patch', path: '/v2/trips/{id}', operationId: 'patchSharedTrip', tag: 'trips', body: tripInputSchema, response: sharedTripSchema, idempotentMutation: true },
  { method: 'post', path: '/v2/trips/{id}/join', operationId: 'joinSharedTrip', tag: 'trips', body: tripJoinSchema, response: tripMembershipSchema, idempotentMutation: true },
  { method: 'patch', path: '/v2/trips/{id}/members/me', operationId: 'patchMyMembership', tag: 'trips', body: membershipPatchSchema, response: tripMembershipSchema, idempotentMutation: true },
  ...(['start', 'end'] as const).map((action): DeclaredRoute => ({ method: 'post', path: `/v2/trips/{id}/${action}`, operationId: `${action}SharedTrip`, tag: 'trips', response: sharedTripSchema, idempotentMutation: true })),
  { method: 'post', path: '/v2/trips/{id}/leave', operationId: 'leaveSharedTrip', tag: 'trips', response: tripMembershipSchema, idempotentMutation: true },
  { method: 'get', path: '/v2/trips/{id}/waypoints', operationId: 'listWaypoints', tag: 'waypoints', response: pageSchema(waypointSchema), paginated: true },
  { method: 'post', path: '/v2/trips/{id}/waypoints', operationId: 'createWaypoint', tag: 'waypoints', body: waypointInputSchema, response: waypointSchema, status: 201, idempotentMutation: true },
  { method: 'patch', path: '/v2/trips/{id}/waypoints/{waypointId}', operationId: 'patchWaypoint', tag: 'waypoints', body: waypointInputSchema, response: waypointSchema, idempotentMutation: true },
  { method: 'delete', path: '/v2/trips/{id}/waypoints/{waypointId}', operationId: 'deleteWaypoint', tag: 'waypoints', status: 204, idempotentMutation: true },
  { method: 'get', path: '/v2/trips/{id}/messages', operationId: 'listMessages', tag: 'chat', response: pageSchema(chatMessageSchema), paginated: true },
  { method: 'post', path: '/v2/trips/{id}/messages', operationId: 'sendMessage', tag: 'chat', body: chatInputSchema, response: chatMessageSchema, status: 201, idempotentMutation: true },
  { method: 'post', path: '/v2/sync/push', operationId: 'pushSync', tag: 'sync', body: syncPushSchema, response: syncReceiptSchema, idempotentMutation: true },
  { method: 'get', path: '/v2/sync/pull', operationId: 'pullSync', tag: 'sync', response: pageSchema(syncChangeSchema), paginated: true },
  { method: 'post', path: '/v2/trips/{id}/livekit-token', operationId: 'requestVoiceGrant', tag: 'voice', body: voiceInputSchema, response: voiceGrantSchema },
  { method: 'post', path: '/v2/devices/push-token', operationId: 'registerPushToken', tag: 'push', body: pushInputSchema, response: acceptedSchema, idempotentMutation: true },
  { method: 'delete', path: '/v2/devices/push-token/{id}', operationId: 'deletePushToken', tag: 'push', status: 204, idempotentMutation: true },
  { method: 'get', path: '/v2/me/entitlements', operationId: 'getEntitlement', tag: 'billing', response: entitlementSchema },
  { method: 'get', path: '/v2/me/backups', operationId: 'listPersonalBackups', tag: 'backups', response: pageSchema(backupSchema), paginated: true },
  { method: 'post', path: '/v2/me/backups', operationId: 'createPersonalBackup', tag: 'backups', body: backupInputSchema, response: backupSchema, status: 201, idempotentMutation: true },
  { method: 'get', path: '/v2/me/backups/{id}', operationId: 'getPersonalBackup', tag: 'backups', response: backupSchema },
  { method: 'delete', path: '/v2/me/backups/{id}', operationId: 'deletePersonalBackup', tag: 'backups', status: 204, idempotentMutation: true },
  { method: 'post', path: '/v2/webhooks/revenuecat', operationId: 'receiveRevenueCat', tag: 'billing', body: revenueCatWebhookSchema, response: acceptedSchema, unauthenticated: true },
  { method: 'post', path: '/v2/reports', operationId: 'createReport', tag: 'reports', body: reportInputSchema, response: acceptedSchema, status: 201, idempotentMutation: true },
];

export type PublicUser = z.infer<typeof publicUserSchema>;
export type SharedTrip = z.infer<typeof sharedTripSchema>;
export type TripMembership = z.infer<typeof tripMembershipSchema>;
export type SyncMutation = z.infer<typeof syncMutationSchema>;
