import type { TripWithSpeedSamples } from '../domain/trip';

export type CloudAuthSession = {
  userId: string;
  email: string | null;
  accessToken: string;
  expiresAt?: number | null;
};

export type CloudProfile = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  syncEnabled: boolean;
  leaderboardOptIn: boolean;
  nearbyOptIn: boolean;
  coarseLocationHash?: string | null;
  onboardingCompletedAt?: string | null;
};

export type CloudSignUpInput = {
  email: string;
  password: string;
  username: string;
  displayName: string;
};

export type CloudSignUpResult = {
  email: string;
  emailConfirmationRequired: boolean;
  session: CloudAuthSession | null;
};

export type CloudProfileInput = {
  username: string;
  displayName: string;
  syncEnabled: boolean;
  leaderboardOptIn: boolean;
  nearbyOptIn: boolean;
  coarseLocationHash?: string | null;
  completeOnboarding?: boolean;
};

export type CloudTripSyncPayload = {
  trips: TripWithSpeedSamples[];
  deletedTripIds: string[];
};

export type CloudSyncResult = {
  ok: boolean;
  syncedTripIds: string[];
  restoredTrips: TripWithSpeedSamples[];
  message: string;
};

export type FriendProfile = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  relationship:
    | 'none'
    | 'pending_sent'
    | 'pending_received'
    | 'friends'
    | 'blocked';
  coarseDistanceLabel?: string | null;
  statsPreview?: FriendStats | null;
};

export type FriendStats = {
  tripCount: number;
  totalDistanceMeters: number;
  totalDriveTimeMs: number;
  bestMaxSpeedMps: number;
  overallAverageSpeedMps: number;
  lastTripAt?: string | null;
};

export type FriendProfileDetail = FriendProfile & {
  isSelf: boolean;
  statsVisible: boolean;
  stats: FriendStats | null;
};

export type FriendRequests = {
  incoming: FriendProfile[];
  outgoing: FriendProfile[];
  friends: FriendProfile[];
};

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  metric: 'distance' | 'average_speed' | 'max_speed' | 'trip_count';
  period: 'week' | 'month' | 'all_time';
  value: number;
  unit: string;
  scope: 'global' | 'friends' | 'nearby';
};

export type AuthProvider = {
  isConfigured(): boolean;
  getSession(): Promise<CloudAuthSession | null>;
  signUpWithEmail(input: CloudSignUpInput): Promise<CloudSignUpResult>;
  signInWithEmail(email: string, password: string): Promise<CloudAuthSession>;
  signOut(): Promise<void>;
  getProfile(): Promise<CloudProfile | null>;
  upsertProfile(input: CloudProfileInput): Promise<CloudProfile>;
};

export type CloudSyncProvider = {
  syncLocalChanges(payload: CloudTripSyncPayload): Promise<CloudSyncResult>;
  restoreCloudTrips(): Promise<TripWithSpeedSamples[]>;
};

export type SocialProvider = {
  searchFriends(query: string): Promise<FriendProfile[]>;
  getNearbyUsers(coarseLocationHash: string): Promise<FriendProfile[]>;
  getFriendSuggestions(): Promise<FriendProfile[]>;
  getFriendRequests(): Promise<FriendRequests>;
  getFriendProfile(userId: string): Promise<FriendProfileDetail>;
  sendFriendRequest(userId: string): Promise<void>;
  respondToFriendRequest(
    userId: string,
    action: 'accept' | 'decline' | 'cancel' | 'remove' | 'block'
  ): Promise<void>;
  cancelFriendRequest(userId: string): Promise<void>;
  removeFriend(userId: string): Promise<void>;
  getLeaderboards(input: {
    scope: LeaderboardEntry['scope'];
    metric: LeaderboardEntry['metric'];
    period: LeaderboardEntry['period'];
  }): Promise<LeaderboardEntry[]>;
};
