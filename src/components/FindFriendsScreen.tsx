import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Modal, Portal, TextInput } from 'react-native-paper';

import { cloudAuth, cloudSocial, isCloudConfigured } from '../cloud/cloudService';
import type {
  CloudAuthSession,
  FriendProfile,
  FriendProfileDetail,
  FriendRequests,
  FriendStats,
} from '../cloud/types';
import { getCoarseLocation } from '../cloud/utils/coarseLocation';
import { colors, fontFamilies, radii, spacing } from '../theme/paperTheme';
import {
  displayDistance,
  displaySpeed,
  distanceUnitLabel,
} from '../utils/insightsAnalytics';
import { logAppWarning } from '../utils/logging';
import type { Units } from '../utils/speedMath';
import { getUserFacingErrorMessage } from '../utils/userFacingErrors';

type Props = {
  units: Units;
};

type FriendAction = 'accept' | 'decline' | 'cancel' | 'remove' | 'block';

const emptyRequests: FriendRequests = {
  incoming: [],
  outgoing: [],
  friends: [],
};

const formatDuration = (durationMs: number): string => {
  const totalMinutes = Math.round(durationMs / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
};

const formatLastTrip = (value?: string | null): string =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : 'No trips yet';

const relationshipCopy = (relationship: FriendProfile['relationship']) => {
  if (relationship === 'friends') return 'Friends';
  if (relationship === 'pending_sent') return 'Request sent';
  if (relationship === 'pending_received') return 'Wants to connect';
  if (relationship === 'blocked') return 'Blocked';
  return 'Not connected';
};

const FindFriendsScreen: React.FC<Props> = ({ units }) => {
  const [session, setSession] = useState<CloudAuthSession | null>(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FriendProfile[]>([]);
  const [nearbyUsers, setNearbyUsers] = useState<FriendProfile[]>([]);
  const [suggestions, setSuggestions] = useState<FriendProfile[]>([]);
  const [requests, setRequests] = useState<FriendRequests>(emptyRequests);
  const [selectedProfile, setSelectedProfile] =
    useState<FriendProfileDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const configured = isCloudConfigured();

  useEffect(() => {
    if (!configured) return;
    void cloudAuth.getSession().then(setSession).catch(() => setSession(null));
  }, [configured]);

  const refreshLists = useCallback(async () => {
    if (!configured || !session) return;
    const [nextRequests, nextSuggestions] = await Promise.all([
      cloudSocial.getFriendRequests(),
      cloudSocial.getFriendSuggestions(),
    ]);
    setRequests(nextRequests);
    setSuggestions(nextSuggestions);
  }, [configured, session]);

  useEffect(() => {
    void refreshLists().catch(() => {
      setRequests(emptyRequests);
      setSuggestions([]);
    });
  }, [refreshLists]);

  const run = async (task: () => Promise<void>) => {
    setLoading(true);
    setMessage(null);
    try {
      await task();
    } catch (error) {
      logAppWarning('friends', error);
      setMessage(getUserFacingErrorMessage(error, 'social'));
    } finally {
      setLoading(false);
    }
  };

  const refreshDiscovery = useCallback(async () => {
    if (query.trim().length >= 2) {
      setSearchResults(await cloudSocial.searchFriends(query.trim()));
    }
  }, [query]);

  const search = () =>
    run(async () => {
      if (query.trim().length < 2) {
        setSearchResults([]);
        return;
      }
      setSearchResults(await cloudSocial.searchFriends(query.trim()));
    });

  const loadNearby = () =>
    run(async () => {
      const result = await getCoarseLocation();
      if (!result.ok) {
        setMessage(
          result.reason === 'permission_denied'
            ? 'Enable location permission to find nearby people.'
            : 'We could not find your location yet. Try again in a moment.',
        );
        return;
      }
      setNearbyUsers(await cloudSocial.getNearbyUsers(result.hash));
    });

  const openProfile = (userId: string) =>
    run(async () => {
      setSelectedProfile(await cloudSocial.getFriendProfile(userId));
    });

  const requestFriend = (userId: string) =>
    run(async () => {
      await cloudSocial.sendFriendRequest(userId);
      setMessage('Friend request sent.');
      await refreshLists();
      await refreshDiscovery();
    });

  const respondToFriend = (userId: string, action: FriendAction) =>
    run(async () => {
      await cloudSocial.respondToFriendRequest(userId, action);
      await refreshLists();
      await refreshDiscovery();
      setSelectedProfile(await cloudSocial.getFriendProfile(userId).catch(() => null));
      setMessage(
        action === 'accept'
          ? 'Friend added.'
          : action === 'remove'
            ? 'Friend removed.'
            : action === 'cancel'
              ? 'Friend request cancelled.'
              : action === 'decline'
                ? 'Friend request declined.'
                : 'Profile blocked.',
      );
    });

  if (!configured) {
    return (
      <Gate
        title="Find friends offline"
        body="Friend discovery is not available in this build. Your local speedometer and trips still work."
      />
    );
  }

  if (!session) {
    return (
      <Gate
        title="Sign in to find friends"
        body="Friend search, nearby discovery, and suggestions require an optional V3l0city account."
      />
    );
  }

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.panel}>
          <Text style={styles.title}>Find Friends</Text>
          <Text style={styles.body}>
            Search usernames, accept requests, and compare basic stats with
            accepted friends. Exact locations and trip details are not shared.
          </Text>
        </View>

        <View style={styles.panel}>
          <TextInput
            mode="outlined"
            label="Search username"
            value={query}
            autoCapitalize="none"
            onChangeText={setQuery}
            style={styles.input}
          />
          <View style={styles.buttonRow}>
            <Button mode="contained-tonal" loading={loading} onPress={search}>
              Search
            </Button>
            <Button
              mode="contained-tonal"
              icon="map-marker-radius-outline"
              loading={loading}
              onPress={loadNearby}
            >
              Nearby
            </Button>
          </View>
          {message && <Text style={styles.message}>{message}</Text>}
        </View>

        <FriendSection
          title="Requests"
          users={requests.incoming}
          empty="No incoming requests."
          onOpen={openProfile}
          actions={(user) => (
            <>
              <Button compact mode="contained-tonal" onPress={() => respondToFriend(user.userId, 'accept')}>
                Accept
              </Button>
              <Button compact mode="text" textColor={colors.textSecondary} onPress={() => respondToFriend(user.userId, 'decline')}>
                Decline
              </Button>
            </>
          )}
        />
        <FriendSection
          title="Sent"
          users={requests.outgoing}
          empty="No outgoing requests."
          onOpen={openProfile}
          actions={(user) => (
            <Button compact mode="contained-tonal" onPress={() => respondToFriend(user.userId, 'cancel')}>
              Cancel
            </Button>
          )}
        />
        <FriendSection
          title="Friends"
          users={requests.friends}
          empty="No friends yet."
          onOpen={openProfile}
          actions={(user) => (
            <Button compact mode="text" textColor={colors.danger} onPress={() => respondToFriend(user.userId, 'remove')}>
              Remove
            </Button>
          )}
        />
        <FriendSection
          title="Search results"
          users={searchResults}
          empty="Search for a username to add someone."
          onOpen={openProfile}
          actions={(user) => renderDiscoveryAction(user, requestFriend, respondToFriend, openProfile)}
        />
        <FriendSection
          title="Nearby"
          users={nearbyUsers}
          empty="Use Nearby to find people in your general area."
          onOpen={openProfile}
          actions={(user) => renderDiscoveryAction(user, requestFriend, respondToFriend, openProfile)}
        />
        <FriendSection
          title="Suggestions"
          users={suggestions}
          empty="Friend suggestions will appear after you connect with people."
          onOpen={openProfile}
          actions={(user) => renderDiscoveryAction(user, requestFriend, respondToFriend, openProfile)}
        />
      </ScrollView>

      <Portal>
        <Modal
          visible={selectedProfile != null}
          onDismiss={() => setSelectedProfile(null)}
          contentContainerStyle={styles.profileModal}
        >
          {selectedProfile && (
            <ProfileDetail
              profile={selectedProfile}
              units={units}
              onClose={() => setSelectedProfile(null)}
              onRequest={() => requestFriend(selectedProfile.userId)}
              onAccept={() => respondToFriend(selectedProfile.userId, 'accept')}
              onCancel={() => respondToFriend(selectedProfile.userId, 'cancel')}
              onRemove={() => respondToFriend(selectedProfile.userId, 'remove')}
            />
          )}
        </Modal>
      </Portal>
    </>
  );
};

const renderDiscoveryAction = (
  user: FriendProfile,
  onRequest: (userId: string) => void,
  onRespond: (userId: string, action: FriendAction) => void,
  onOpen: (userId: string) => void,
) => {
  if (user.relationship === 'none') {
    return (
      <Button compact mode="contained-tonal" onPress={() => onRequest(user.userId)}>
        Add
      </Button>
    );
  }
  if (user.relationship === 'pending_sent') {
    return (
      <Button compact mode="contained-tonal" onPress={() => onRespond(user.userId, 'cancel')}>
        Cancel
      </Button>
    );
  }
  if (user.relationship === 'pending_received') {
    return (
      <Button compact mode="contained-tonal" onPress={() => onRespond(user.userId, 'accept')}>
        Accept
      </Button>
    );
  }
  if (user.relationship === 'friends') {
    return (
      <Button compact mode="contained-tonal" onPress={() => onOpen(user.userId)}>
        View
      </Button>
    );
  }
  return (
    <Button compact mode="text" disabled>
      Blocked
    </Button>
  );
};

const FriendSection: React.FC<{
  title: string;
  users: FriendProfile[];
  empty: string;
  onOpen: (userId: string) => void;
  actions: (user: FriendProfile) => React.ReactNode;
}> = ({ title, users, empty, onOpen, actions }) => (
  <View style={styles.panel}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {users.length === 0 ? (
      <Text style={styles.empty}>{empty}</Text>
    ) : (
      users.map((user) => (
        <View key={`${title}-${user.userId}`} style={styles.row}>
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpen(user.userId)}
            style={styles.rowBody}
          >
            <Text style={styles.name}>{user.displayName}</Text>
            <Text style={styles.username}>
              @{user.username}
              {user.coarseDistanceLabel ? ` · ${user.coarseDistanceLabel}` : ''}
            </Text>
            <Text style={styles.relationship}>{relationshipCopy(user.relationship)}</Text>
          </Pressable>
          <View style={styles.actionGroup}>{actions(user)}</View>
        </View>
      ))
    )}
  </View>
);

const ProfileDetail: React.FC<{
  profile: FriendProfileDetail;
  units: Units;
  onClose: () => void;
  onRequest: () => void;
  onAccept: () => void;
  onCancel: () => void;
  onRemove: () => void;
}> = ({ profile, units, onClose, onRequest, onAccept, onCancel, onRemove }) => (
  <View>
    <View style={styles.profileHeader}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{profile.displayName.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={styles.profileTitleBlock}>
        <Text style={styles.profileName}>{profile.displayName}</Text>
        <Text style={styles.username}>@{profile.username}</Text>
        <Text style={styles.relationship}>{relationshipCopy(profile.relationship)}</Text>
      </View>
    </View>

    {profile.statsVisible && profile.stats ? (
      <StatsGrid stats={profile.stats} units={units} />
    ) : (
      <View style={styles.privateStatsPanel}>
        <Text style={styles.empty}>
          Basic stats are visible after you become friends.
        </Text>
      </View>
    )}

    <View style={styles.profileActions}>
      {profile.relationship === 'none' && (
        <Button mode="contained" onPress={onRequest}>
          Add friend
        </Button>
      )}
      {profile.relationship === 'pending_received' && (
        <Button mode="contained" onPress={onAccept}>
          Accept request
        </Button>
      )}
      {profile.relationship === 'pending_sent' && (
        <Button mode="contained-tonal" onPress={onCancel}>
          Cancel request
        </Button>
      )}
      {profile.relationship === 'friends' && !profile.isSelf && (
        <Button mode="text" textColor={colors.danger} onPress={onRemove}>
          Remove friend
        </Button>
      )}
      <Button mode="text" textColor={colors.textSecondary} onPress={onClose}>
        Close
      </Button>
    </View>
  </View>
);

const StatsGrid: React.FC<{ stats: FriendStats; units: Units }> = ({
  stats,
  units,
}) => (
  <View style={styles.statsGrid}>
    <StatCard label="Trips" value={String(stats.tripCount)} />
    <StatCard
      label="Distance"
      value={displayDistance(stats.totalDistanceMeters, units).toFixed(1)}
      helper={distanceUnitLabel(units)}
    />
    <StatCard
      label="Best Max"
      value={String(Math.round(displaySpeed(stats.bestMaxSpeedMps, units)))}
      helper={units}
    />
    <StatCard
      label="Average"
      value={String(Math.round(displaySpeed(stats.overallAverageSpeedMps, units)))}
      helper={units}
    />
    <StatCard label="Drive Time" value={formatDuration(stats.totalDriveTimeMs)} />
    <StatCard label="Last Trip" value={formatLastTrip(stats.lastTripAt)} />
  </View>
);

const StatCard: React.FC<{ label: string; value: string; helper?: string }> = ({
  label,
  value,
  helper,
}) => (
  <View style={styles.statCard}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
    {helper && <Text style={styles.statHelper}>{helper}</Text>}
  </View>
);

const Gate: React.FC<{ title: string; body: string }> = ({ title, body }) => (
  <View style={styles.gate}>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.body}>{body}</Text>
  </View>
);

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  gate: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  panel: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.displayBold,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.display,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },
  body: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.body,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  input: {
    backgroundColor: colors.surface,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  message: {
    color: colors.warning,
    fontFamily: fontFamilies.body,
    fontSize: 12,
    marginTop: spacing.sm,
  },
  empty: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.body,
    lineHeight: 18,
    textAlign: 'center',
  },
  row: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 15,
    fontWeight: '800',
  },
  username: {
    color: colors.textMuted,
    fontFamily: fontFamilies.body,
    fontSize: 12,
  },
  relationship: {
    color: colors.accent,
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 11,
    marginTop: 2,
  },
  actionGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: spacing.xs,
  },
  profileModal: {
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 380,
    padding: spacing.md,
    width: '92%',
  },
  profileHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.accentDim,
    borderColor: colors.accent,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  avatarText: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.displayBold,
    fontSize: 24,
    fontWeight: '900',
  },
  profileTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.displayBold,
    fontSize: 20,
    fontWeight: '800',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  statCard: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 72,
    padding: spacing.sm,
    width: '47.5%',
  },
  statValue: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.numeric,
    fontSize: 18,
    fontWeight: '900',
  },
  statLabel: {
    color: colors.textMuted,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 10,
    fontWeight: '700',
    marginTop: spacing.xxs,
    textTransform: 'uppercase',
  },
  statHelper: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.body,
    fontSize: 11,
    marginTop: 2,
  },
  privateStatsPanel: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: radii.sm,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  profileActions: {
    gap: spacing.xs,
    marginTop: spacing.md,
  },
});

export default FindFriendsScreen;
