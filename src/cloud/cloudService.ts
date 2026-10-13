import * as tripRepository from '../database/tripRepository';
import type { AuthProvider, CloudProfileInput, CloudSyncResult, SocialProvider } from './types';
import { getCloudConfig } from './config';
import { defaultCloudProviderFactory, type CloudProviderFactory } from './providers';
import { logAppWarning } from '../utils/logging';
import { getUserFacingErrorMessage } from '../utils/userFacingErrors';

export type RecordingOwnershipPort = {
  canUpload(recordingId: string, userId: string): Promise<boolean>;
  canRestore(recordingId: string, userId: string): Promise<boolean>;
};

type TripStore = Pick<typeof tripRepository,
  'getPendingSyncOperations' | 'getUnsyncedTrips' | 'acknowledgeCloudSync' | 'restoreCloudTrips'>;

const noAdoption: RecordingOwnershipPort = {
  canUpload: async () => false, canRestore: async () => false,
};

const unavailable = (message = 'Online sync is not available in this build.'): CloudSyncResult => ({
  ok: false, syncedTripIds: [], restoredTrips: [], message,
});

export const createCloudService = (options: {
  factory: CloudProviderFactory;
  isConfigured: () => boolean;
  store?: TripStore;
  ownership?: RecordingOwnershipPort;
}) => {
  const store = options.store ?? tripRepository;
  const ownership = options.ownership ?? noAdoption;
  let accountEpoch = 0;
  let authTransitions = 0;
  let syncInFlight = false;
  const withAuthTransition = async <T>(action: () => Promise<T>): Promise<T> => {
    authTransitions++;
    accountEpoch++;
    try { return await action(); } finally {
      // Completion/failure is another boundary: a sync must not capture the old
      // account under the transition's new epoch while login is still pending.
      accountEpoch++;
      authTransitions--;
    }
  };
  const providers = async () => {
    if (!options.isConfigured()) throw new Error('Cloud features are not configured.');
    const result = await options.factory();
    if (!result) throw new Error('Cloud provider is not available.');
    return result;
  };
  const auth: AuthProvider = {
    isConfigured: options.isConfigured,
    getSession: async () => options.isConfigured() ? (await providers()).auth.getSession() : null,
    getProfile: async () => options.isConfigured() ? (await providers()).auth.getProfile() : null,
    signUpWithEmail: (input) => withAuthTransition(async () => (await providers()).auth.signUpWithEmail(input)),
    signInWithEmail: (email, password) => withAuthTransition(async () => (await providers()).auth.signInWithEmail(email, password)),
    signOut: () => withAuthTransition(async () => { if (options.isConfigured()) await (await providers()).auth.signOut(); }),
    upsertProfile: async (input) => (await providers()).auth.upsertProfile(input),
  };
  const social: SocialProvider = {
    searchFriends: async (query) => (await providers()).social.searchFriends(query),
    getNearbyUsers: async (hash) => (await providers()).social.getNearbyUsers(hash),
    getFriendSuggestions: async () => (await providers()).social.getFriendSuggestions(),
    getFriendRequests: async () => (await providers()).social.getFriendRequests(),
    getFriendProfile: async (id) => (await providers()).social.getFriendProfile(id),
    sendFriendRequest: async (id) => (await providers()).social.sendFriendRequest(id),
    respondToFriendRequest: async (id, action) => (await providers()).social.respondToFriendRequest(id, action),
    cancelFriendRequest: async (id) => (await providers()).social.cancelFriendRequest(id),
    removeFriend: async (id) => (await providers()).social.removeFriend(id),
    getLeaderboards: async (input) => (await providers()).social.getLeaderboards(input),
  };

  const syncLocalChanges = async (): Promise<CloudSyncResult> => {
    if (!options.isConfigured()) return unavailable();
    if (authTransitions > 0) return unavailable('Account change is in progress. Retry sync after it finishes.');
    if (syncInFlight) return unavailable('Personal backup is already in progress. Retry after it finishes.');
    // Claim synchronously before the first await. Returning the old promise
    // could expose a previous account's result to a newly logged-in caller.
    syncInFlight = true;
    const epoch = accountEpoch;
    try {
      const adapter = await providers();
      const currentSession = await adapter.auth.getSession();
      const session = currentSession ? Object.freeze({ ...currentSession }) : null;
      const profile = await adapter.auth.getProfile();
      if (!session || profile?.userId !== session.userId || !profile.syncEnabled) {
        return unavailable('Sign in and enable backup before syncing personal recordings.');
      }
      const stillCurrent = async () => {
        if (authTransitions > 0 || accountEpoch !== epoch || !options.isConfigured()) return false;
        const current = await adapter.auth.getSession();
        return authTransitions === 0 && accountEpoch === epoch && options.isConfigured()
          && current?.userId === session.userId && current.accessToken === session.accessToken;
      };
      // Capture the whole outbox before recording versions. A mutation added
      // afterward must cause the repository's atomic compare-and-set to fail.
      const pending = await store.getPendingSyncOperations(null);
      const unsynced = await store.getUnsyncedTrips();
      const selected = [] as typeof unsynced;
      for (const trip of unsynced) if (await ownership.canUpload(trip.id, session.userId)) selected.push(trip);
      if (selected.length === 0) {
        return unavailable('No account-owned recordings selected for backup. Local history stays on this device.');
      }
      if (!await stillCurrent()) return unavailable('Account changed. Retry sync from the current account.');
      const trips = selected.filter((trip) => trip.deletedAt == null);
      const deletedTripIds = selected.filter((trip) => trip.deletedAt != null).map((trip) => trip.id);
      const result = await adapter.sync.syncLocalChanges({ trips, deletedTripIds }, session);
      if (!await stillCurrent()) return unavailable('Account changed. Sync results were not applied to local history.');
      if (!result.ok) return result;
      const uploaded = result.syncedTripIds.filter((id) => trips.some((trip) => trip.id === id));
      const deleted = (result.deletedTripIds ?? []).filter((id) => deletedTripIds.includes(id));
      const acknowledged = new Set([...uploaded, ...deleted]);
      const restored = [] as typeof result.restoredTrips;
      for (const trip of result.restoredTrips) {
        if (await ownership.canRestore(trip.id, session.userId)) restored.push(trip);
      }
      if (!await stillCurrent()) return unavailable('Account changed. Sync results were not applied to local history.');
      const applied = await store.acknowledgeCloudSync(
        selected.filter((trip) => acknowledged.has(trip.id)),
        pending.filter((operation) =>
          (operation.operationType === 'sync_trip' || operation.operationType === 'delete_trip')
          && acknowledged.has(operation.entityId)),
      );
      if (!await stillCurrent()) return unavailable('Account changed. Remote history was not restored.');
      await store.restoreCloudTrips(restored);
      return { ...result, syncedTripIds: uploaded.filter((id) => applied.includes(id)),
        deletedTripIds: deleted.filter((id) => applied.includes(id)), restoredTrips: restored };
    } catch (error) {
      // Authentication/provider failure must not stamp every account's local outbox.
      logAppWarning('sync', error);
      return unavailable(getUserFacingErrorMessage(error, 'sync'));
    } finally {
      syncInFlight = false;
    }
  };

  const restoreCloudTrips = async (): Promise<number> => {
    if (!options.isConfigured() || authTransitions > 0) return 0;
    const epoch = accountEpoch;
    const adapter = await providers();
    const currentSession = await adapter.auth.getSession();
    const session = currentSession ? Object.freeze({ ...currentSession }) : null;
    if (!session) return 0;
    const preflight = await adapter.auth.getSession();
    if (authTransitions > 0 || epoch !== accountEpoch || !options.isConfigured()
      || preflight?.userId !== session.userId || preflight.accessToken !== session.accessToken) return 0;
    const trips = await adapter.sync.restoreCloudTrips(session);
    const selected = [] as typeof trips;
    for (const trip of trips) if (await ownership.canRestore(trip.id, session.userId)) selected.push(trip);
    const current = await adapter.auth.getSession();
    if (authTransitions > 0 || epoch !== accountEpoch || !options.isConfigured() || current?.userId !== session.userId
      || current.accessToken !== session.accessToken) return 0;
    return store.restoreCloudTrips(selected);
  };
  const saveCloudProfile = (input: CloudProfileInput) => auth.upsertProfile({ ...input, completeOnboarding: false });
  const completeCloudOnboarding = async (input: CloudProfileInput) => {
    // Choosing backup at signup is not consent to claim every local recording.
    return auth.upsertProfile({ ...input, completeOnboarding: true });
  };
  return { auth, social, syncLocalChanges, restoreCloudTrips, saveCloudProfile, completeCloudOnboarding };
};

const service = createCloudService({
  factory: defaultCloudProviderFactory, isConfigured: () => getCloudConfig().enabled,
});
export const isCloudConfigured = () => getCloudConfig().enabled;
export const cloudAuth = service.auth;
export const cloudSocial = service.social;
export const syncLocalChanges = service.syncLocalChanges;
export const restoreCloudTrips = service.restoreCloudTrips;
export const saveCloudProfile = service.saveCloudProfile;
export const completeCloudOnboarding = service.completeCloudOnboarding;
