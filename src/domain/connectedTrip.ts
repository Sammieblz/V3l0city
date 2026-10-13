import type {
  SharedTripState, TripMembershipState, TripRole,
} from '../../shared/contracts';
import type { Trip } from './trip';

/** Cached facts are display data. Only an online server grant can enable sharing. */
export type ConnectedTripSnapshot = {
  tripId: string;
  userId: string;
  revision: number;
  state: SharedTripState;
  membership: TripMembershipState;
  role: TripRole;
};

export type SharingGrant = {
  tripId: string;
  userId: string;
  connectionEpoch: string;
  expiresAtMs: number;
};

export type TravelSession = {
  personalRecording: Trip | null;
  connected: ConnectedTripSnapshot | null;
  /** Cache rendering never replaces authenticated revision/terminal history. */
  authoritativeSnapshots: readonly ConnectedTripSnapshot[];
  sharingGrant: SharingGrant | null;
  invalidatedGrantKeys: readonly string[];
  /** The transport captures this when requesting a new sharing grant. */
  consentGeneration: number;
  sharingRequested: boolean;
  connection: 'offline' | 'joining' | 'online';
};

export type TravelEvent =
  | { type: 'personal-recording'; recording: Trip | null }
  | { type: 'cached-snapshot'; snapshot: ConnectedTripSnapshot }
  | { type: 'join-requested' }
  | { type: 'server-snapshot'; snapshot: ConnectedTripSnapshot; grant: SharingGrant | null;
      consentGeneration: number }
  | { type: 'sharing-preference'; enabled: boolean }
  | { type: 'leave-requested' | 'end-requested' | 'access-revoked' | 'disconnected' };

export const createTravelSession = (personalRecording: Trip | null = null): TravelSession => ({
  personalRecording, connected: null, authoritativeSnapshots: [], sharingGrant: null,
  invalidatedGrantKeys: [], consentGeneration: 0,
  sharingRequested: false, connection: 'offline',
});

const sameIdentity = (first: ConnectedTripSnapshot, second: ConnectedTripSnapshot) =>
  first.tripId === second.tripId && first.userId === second.userId;

const grantKey = (grant: SharingGrant) => JSON.stringify([
  grant.tripId, grant.userId, grant.connectionEpoch, grant.expiresAtMs,
]);

const invalidatedKeys = (state: TravelSession, grant = state.sharingGrant): readonly string[] =>
  grant && !state.invalidatedGrantKeys.includes(grantKey(grant))
    ? [...state.invalidatedGrantKeys, grantKey(grant)] : state.invalidatedGrantKeys;

export const canShareLocation = (
  session: TravelSession,
  userId: string,
  connectionEpoch: string,
  nowMs: number,
): boolean => {
  const { connected, sharingGrant: grant } = session;
  return session.connection === 'online' && session.sharingRequested
    && connected?.state === 'active' && connected.membership === 'joined'
    && connected.userId === userId && grant?.userId === userId
    && grant.tripId === connected.tripId && grant.connectionEpoch === connectionEpoch
    && connectionEpoch.length > 0 && Number.isFinite(nowMs) && nowMs >= 0
    && Number.isFinite(grant.expiresAtMs)
    && nowMs < grant.expiresAtMs;
};

/** Call server-snapshot only after the typed, authenticated transport validates it.
 * This reducer is a client safety gate, never backend authorization. */
export const reduceTravelSession = (state: TravelSession, event: TravelEvent): TravelSession => {
  switch (event.type) {
    case 'personal-recording':
      return { ...state, personalRecording: event.recording };
    case 'cached-snapshot': {
      const authoritative = state.authoritativeSnapshots.find((old) => sameIdentity(old, event.snapshot));
      // A cached newer revision is still only display data; authenticated facts win
      // whenever this identity already has a known high-water mark.
      return { ...state, connected: authoritative ?? event.snapshot, sharingGrant: null,
        invalidatedGrantKeys: invalidatedKeys(state), connection: 'offline' };
    }
    case 'join-requested':
      return { ...state, sharingGrant: null, invalidatedGrantKeys: invalidatedKeys(state),
        consentGeneration: state.consentGeneration + 1, connection: 'joining', sharingRequested: true };
    case 'server-snapshot': {
      const old = state.authoritativeSnapshots.find((known) => sameIdentity(known, event.snapshot));
      if (!Number.isSafeInteger(event.snapshot.revision) || event.snapshot.revision < 1
        || (old && event.snapshot.revision < old.revision)) return state;
      if (old) {
        if ((old.state === 'ended' || old.state === 'cancelled') && event.snapshot.state !== old.state) return state;
        if (event.snapshot.revision === old.revision
          && (event.snapshot.state !== old.state || event.snapshot.membership !== old.membership
            || event.snapshot.role !== old.role)) return state;
      }
      const active = event.snapshot.state === 'active' && event.snapshot.membership === 'joined';
      const terminal = event.snapshot.state === 'ended' || event.snapshot.state === 'cancelled'
        || event.snapshot.membership === 'left' || event.snapshot.membership === 'removed';
      const grant = event.grant?.tripId === event.snapshot.tripId
        && event.grant.userId === event.snapshot.userId ? event.grant : null;
      const eligible = active && state.sharingRequested
        && event.consentGeneration === state.consentGeneration
        && grant && !state.invalidatedGrantKeys.includes(grantKey(grant));
      const authoritativeSnapshots = [
        ...state.authoritativeSnapshots.filter((known) => !sameIdentity(known, event.snapshot)),
        { ...event.snapshot },
      ];
      let invalidatedGrantKeys = eligible ? state.invalidatedGrantKeys : invalidatedKeys(state);
      if (grant && (!state.sharingRequested || event.consentGeneration !== state.consentGeneration)
        && !invalidatedGrantKeys.includes(grantKey(grant))) {
        invalidatedGrantKeys = [...invalidatedGrantKeys, grantKey(grant)];
      }
      return { ...state, connected: event.snapshot, authoritativeSnapshots,
        sharingGrant: eligible ? { ...grant } : null,
        invalidatedGrantKeys,
        consentGeneration: state.consentGeneration + (terminal && state.sharingRequested ? 1 : 0),
        connection: 'online', sharingRequested: !terminal && state.sharingRequested };
    }
    case 'sharing-preference':
      return { ...state, sharingRequested: event.enabled,
        consentGeneration: state.consentGeneration + (event.enabled !== state.sharingRequested ? 1 : 0),
        invalidatedGrantKeys: event.enabled ? state.invalidatedGrantKeys : invalidatedKeys(state),
        sharingGrant: event.enabled ? state.sharingGrant : null };
    case 'leave-requested':
    case 'end-requested':
    case 'access-revoked':
      return { ...state, sharingGrant: null, invalidatedGrantKeys: invalidatedKeys(state),
        consentGeneration: state.consentGeneration + 1, sharingRequested: false, connection: 'offline' };
    case 'disconnected':
      return { ...state, sharingGrant: null, invalidatedGrantKeys: invalidatedKeys(state),
        consentGeneration: state.consentGeneration + 1, connection: 'offline' };
  }
};
