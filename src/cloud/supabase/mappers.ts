import type { TripWithSpeedSamples } from '../../domain/trip';
import type { CloudAuthSession, CloudProfile } from '../types';

type SupabaseSessionLike = {
  access_token: string;
  expires_at?: number | null;
  user: {
    id: string;
    email?: string | null;
  };
};

export const toCloudSession = (
  session: SupabaseSessionLike | null
): CloudAuthSession | null => {
  if (!session) {
    return null;
  }
  return {
    userId: session.user.id,
    email: session.user.email ?? null,
    accessToken: session.access_token,
    expiresAt: session.expires_at,
  };
};

export const toCloudProfile = (row: Record<string, unknown>): CloudProfile => ({
  userId: String(row.user_id),
  username: String(row.username),
  displayName: String(row.display_name),
  avatarUrl: (row.avatar_url as string | null | undefined) ?? null,
  syncEnabled: Boolean(row.sync_enabled),
  leaderboardOptIn: Boolean(row.leaderboard_opt_in),
  nearbyOptIn: Boolean(row.nearby_opt_in),
  coarseLocationHash:
    (row.coarse_location_hash as string | null | undefined) ?? null,
  onboardingCompletedAt:
    (row.onboarding_completed_at as string | null | undefined) ?? null,
});

export const toCloudTripPayload = (trip: TripWithSpeedSamples) => ({
  id: trip.id,
  startedAt: trip.startedAt,
  endedAt: trip.endedAt,
  totalDistanceMeters: trip.totalDistanceMeters,
  maxSpeedMps: trip.maxSpeedMps,
  averageSpeedMps: trip.averageSpeedMps,
  units: trip.units,
  mountLabel: trip.mountLabel ?? null,
  recordStatus: trip.recordStatus ?? 'completed',
  localUpdatedAt: trip.localUpdatedAt ?? new Date().toISOString(),
  deletedAt: trip.deletedAt ?? null,
  samples: trip.speedSamples.map((sample) => ({
    sequence: sample.sequence,
    recordedAt: sample.recordedAt,
    elapsedMs: Math.round(sample.elapsedMs),
    speedMps: sample.speedMps,
    distanceMeters: sample.distanceMeters,
    headingDegrees: sample.headingDegrees,
    headingSource: sample.headingSource,
    headingAccuracyDegrees: sample.headingAccuracyDegrees,
    headingQuality: sample.headingQuality,
    headingReasons: sample.headingReasons,
    source: sample.source,
    quality: sample.quality,
    qualityScore: sample.qualityScore,
    qualityReasons: sample.qualityReasons,
    gpsAccuracyMeters: sample.gpsAccuracyMeters,
    fixAgeMs: sample.fixAgeMs,
    nativeSpeedUsed: sample.nativeSpeedUsed,
    isMoving: sample.isMoving,
    isStopped: sample.isStopped,
    stale: sample.stale,
  })),
});
