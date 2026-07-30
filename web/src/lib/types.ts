export type Units = "km/h" | "MPH";

export type SpeedSample = {
  tripId: string;
  sequence: number;
  recordedAt: string;
  elapsedMs: number;
  speedMps: number;
  distanceMeters: number;
  headingDegrees?: number | null;
  headingSource: "none" | "gps";
  headingAccuracyDegrees?: number | null;
  headingQuality: "poor" | "fair" | "good";
  headingReasons: string[];
  source: "browser-geolocation";
  quality: "poor" | "fair" | "good";
  qualityScore: number;
  qualityReasons: string[];
  gpsAccuracyMeters?: number | null;
  fixAgeMs?: number | null;
  nativeSpeedUsed: false;
  isMoving: boolean;
  isStopped: boolean;
  stale: boolean;
};

export type WebTrip = {
  id: string;
  userId: string;
  startedAt: string;
  endedAt: string;
  totalDistanceMeters: number;
  maxSpeedMps: number;
  averageSpeedMps: number;
  units: Units;
  mountLabel: null;
  recordStatus: "completed";
  localUpdatedAt: string;
  deletedAt: string | null;
  cloudSyncedAt: string | null;
  cloudSyncError: string | null;
  syncStatus: "pending" | "synced" | "failed";
};

export type TripWithSamples = WebTrip & { speedSamples: SpeedSample[] };

export type Profile = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  syncEnabled: boolean;
  leaderboardOptIn: boolean;
  nearbyOptIn: boolean;
  coarseLocationHash: string | null;
  onboardingCompletedAt: string | null;
};

export type FriendProfile = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  relationship: "none" | "pending_sent" | "pending_received" | "friends" | "blocked";
};

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  metric: "distance" | "average_speed" | "max_speed" | "trip_count";
  period: "week" | "month" | "all_time";
  scope: "global" | "friends" | "nearby";
  value: number;
  unit: string;
};
