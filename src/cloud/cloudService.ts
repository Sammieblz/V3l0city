import {
  getPendingSyncOperations,
  getUnsyncedTrips,
  markSyncOperationDone,
  markSyncOperationError,
  markTripSyncError,
  markTripsSynced,
  restoreCloudTrips as restoreCloudTripsLocally,
} from '../database/tripRepository';
import type { CloudProfile, CloudProfileInput, LeaderboardEntry } from './types';
import { getCloudConfig } from './config';
import { SupabaseAuthProvider } from './supabase/authProvider';
import { SupabaseSocialProvider } from './supabase/socialProvider';
import { SupabaseSyncProvider } from './supabase/syncProvider';
import { logAppWarning } from '../utils/logging';
import { getUserFacingErrorMessage } from '../utils/userFacingErrors';

const authProvider = new SupabaseAuthProvider();
const syncProvider = new SupabaseSyncProvider();
const socialProvider = new SupabaseSocialProvider();

export const isCloudConfigured = () => getCloudConfig().enabled;

export const cloudAuth = authProvider;

export const completeCloudOnboarding = async (
  profile: CloudProfileInput,
): Promise<CloudProfile> => {
  const saved = await authProvider.upsertProfile({
    ...profile,
    completeOnboarding: true,
  });
  if (saved.syncEnabled) {
    await syncLocalChanges();
  }
  return saved;
};

export const saveCloudProfile = async (
  profile: CloudProfileInput,
): Promise<CloudProfile> =>
  authProvider.upsertProfile({
    ...profile,
    completeOnboarding: false,
  });

export const syncLocalChanges = async () => {
  if (!isCloudConfigured()) {
    return {
      ok: false,
      syncedTripIds: [],
      restoredTrips: [],
      message: 'Online sync is not available in this build.',
    };
  }

  const pendingOperations = await getPendingSyncOperations();
  const unsynced = await getUnsyncedTrips();
  const deletedTripIds = unsynced
    .filter((trip) => trip.deletedAt != null)
    .map((trip) => trip.id);
  const trips = unsynced.filter((trip) => trip.deletedAt == null);

  try {
    const result = await syncProvider.syncLocalChanges({
      trips,
      deletedTripIds,
    });
    await markTripsSynced([...result.syncedTripIds, ...deletedTripIds]);
    const restored = await restoreCloudTripsLocally(result.restoredTrips);
    for (const operation of pendingOperations) {
      await markSyncOperationDone(operation.id);
    }
    return {
      ...result,
      message:
        restored > 0
          ? `${result.message} Restored ${restored} cloud trip${
              restored === 1 ? '' : 's'
            }.`
          : result.message,
    };
  } catch (error) {
    logAppWarning('sync', error);
    const message = getUserFacingErrorMessage(error, 'sync');
    for (const operation of pendingOperations) {
      await markSyncOperationError(operation.id, message);
    }
    for (const trip of unsynced) {
      await markTripSyncError(trip.id, message);
    }
    return {
      ok: false,
      syncedTripIds: [],
      restoredTrips: [],
      message,
    };
  }
};

export const restoreCloudTrips = async () => {
  if (!isCloudConfigured()) {
    return 0;
  }
  const remoteTrips = await syncProvider.restoreCloudTrips();
  return restoreCloudTripsLocally(remoteTrips);
};

export const cloudSocial = {
  searchFriends: (query: string) => socialProvider.searchFriends(query),
  getNearbyUsers: (coarseLocationHash: string) =>
    socialProvider.getNearbyUsers(coarseLocationHash),
  getFriendSuggestions: () => socialProvider.getFriendSuggestions(),
  getFriendRequests: () => socialProvider.getFriendRequests(),
  getFriendProfile: (userId: string) =>
    socialProvider.getFriendProfile(userId),
  sendFriendRequest: (userId: string) =>
    socialProvider.sendFriendRequest(userId),
  respondToFriendRequest: (
    userId: string,
    action: 'accept' | 'decline' | 'cancel' | 'remove' | 'block'
  ) => socialProvider.respondToFriendRequest(userId, action),
  cancelFriendRequest: (userId: string) =>
    socialProvider.cancelFriendRequest(userId),
  removeFriend: (userId: string) => socialProvider.removeFriend(userId),
  getLeaderboards: (input: {
    scope: LeaderboardEntry['scope'];
    metric: LeaderboardEntry['metric'];
    period: LeaderboardEntry['period'];
  }) => socialProvider.getLeaderboards(input),
};
