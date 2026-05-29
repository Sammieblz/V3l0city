export type ProfileRow = {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  coarse_location_hash?: string | null;
  leaderboard_opt_in?: boolean;
};

export type FriendshipRow = {
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'blocked';
};

export const relationshipFor = (
  userId: string,
  targetId: string,
  friendships: FriendshipRow[]
) => {
  const row = friendships.find(
    (friendship) =>
      (friendship.requester_id === userId &&
        friendship.addressee_id === targetId) ||
      (friendship.requester_id === targetId &&
        friendship.addressee_id === userId)
  );
  if (!row) return 'none';
  if (row.status === 'accepted') return 'friends';
  if (row.status === 'blocked') return 'blocked';
  if (row.requester_id === userId) return 'pending_sent';
  return 'pending_received';
};

export const toFriendProfile = (
  userId: string,
  profile: ProfileRow,
  friendships: FriendshipRow[],
  coarseDistanceLabel?: string | null
) => ({
  userId: profile.user_id,
  username: profile.username,
  displayName: profile.display_name,
  avatarUrl: profile.avatar_url,
  relationship: relationshipFor(userId, profile.user_id, friendships),
  coarseDistanceLabel: coarseDistanceLabel ?? null,
});

export type TripAggregateRow = {
  user_id: string;
  started_at: string;
  ended_at: string | null;
  total_distance_meters: number | null;
  max_speed_mps: number | null;
  average_speed_mps: number | null;
};

export const emptyFriendStats = () => ({
  tripCount: 0,
  totalDistanceMeters: 0,
  totalDriveTimeMs: 0,
  bestMaxSpeedMps: 0,
  overallAverageSpeedMps: 0,
  lastTripAt: null as string | null,
});

export const buildFriendStats = (trips: TripAggregateRow[]) => {
  if (trips.length === 0) {
    return emptyFriendStats();
  }

  const totalDistanceMeters = trips.reduce(
    (sum, trip) => sum + Number(trip.total_distance_meters ?? 0),
    0,
  );
  const totalDriveTimeMs = trips.reduce((sum, trip) => {
    const started = new Date(trip.started_at).getTime();
    const ended = new Date(trip.ended_at ?? trip.started_at).getTime();
    return sum + Math.max(0, ended - started);
  }, 0);
  const bestMaxSpeedMps = trips.reduce(
    (best, trip) => Math.max(best, Number(trip.max_speed_mps ?? 0)),
    0,
  );
  const fallbackAverage =
    trips.reduce(
      (sum, trip) => sum + Number(trip.average_speed_mps ?? 0),
      0,
    ) / trips.length;

  return {
    tripCount: trips.length,
    totalDistanceMeters,
    totalDriveTimeMs,
    bestMaxSpeedMps,
    overallAverageSpeedMps:
      totalDriveTimeMs > 0
        ? totalDistanceMeters / (totalDriveTimeMs / 1000)
        : fallbackAverage,
    lastTripAt: trips
      .map((trip) => trip.started_at)
      .sort()
      .at(-1) ?? null,
  };
};

export const buildFriendStatsByUser = (trips: TripAggregateRow[]) => {
  const grouped = new Map<string, TripAggregateRow[]>();
  for (const trip of trips) {
    grouped.set(trip.user_id, [...(grouped.get(trip.user_id) ?? []), trip]);
  }
  return grouped;
};
