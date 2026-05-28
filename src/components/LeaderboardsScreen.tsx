import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, SegmentedButtons } from 'react-native-paper';

import {
  cloudAuth,
  cloudSocial,
  isCloudConfigured,
  syncLocalChanges,
} from '../cloud/cloudService';
import type {
  CloudAuthSession,
  CloudProfile,
  LeaderboardEntry,
} from '../cloud/types';
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

type Scope = LeaderboardEntry['scope'];
type Metric = LeaderboardEntry['metric'];
type Period = LeaderboardEntry['period'];

const formatLeaderboardValue = (
  entry: LeaderboardEntry,
  units: Units,
): string => {
  if (entry.metric === 'trip_count') {
    return `${Math.round(entry.value)} trip${
      Math.round(entry.value) === 1 ? '' : 's'
    }`;
  }

  if (entry.metric === 'distance') {
    const value = displayDistance(entry.value, units);
    return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${distanceUnitLabel(units)}`;
  }

  return `${Math.round(displaySpeed(entry.value, units))} ${units}`;
};

const emptyMessageFor = (
  profile: CloudProfile | null,
  scope: Scope,
): string => {
  if (profile && !profile.leaderboardOptIn) {
    return 'Turn on leaderboards in Account / Sync to appear here.';
  }
  if (profile && !profile.syncEnabled) {
    return 'Turn on online backup so completed trips can be ranked.';
  }
  if (scope === 'friends') {
    return 'Add friends and back up trips to build this board.';
  }
  if (scope === 'nearby') {
    return 'Save your nearby area and back up trips to build this board.';
  }
  return 'Backed-up trips from opted-in drivers will appear here.';
};

const LeaderboardsScreen: React.FC<Props> = ({ units }) => {
  const [session, setSession] = useState<CloudAuthSession | null>(null);
  const [profile, setProfile] = useState<CloudProfile | null>(null);
  const [scope, setScope] = useState<Scope>('friends');
  const [metric, setMetric] = useState<Metric>('distance');
  const [period, setPeriod] = useState<Period>('week');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const configured = isCloudConfigured();

  const refreshAccount = useCallback(async () => {
    if (!configured) return null;
    const nextSession = await cloudAuth.getSession();
    setSession(nextSession);
    if (!nextSession) {
      setProfile(null);
      return null;
    }
    const nextProfile = await cloudAuth.getProfile();
    setProfile(nextProfile);
    return nextProfile;
  }, [configured]);

  useEffect(() => {
    if (!configured) return;
    void refreshAccount().catch((error) => {
      logAppWarning('leaderboards', error);
      setSession(null);
      setProfile(null);
    });
  }, [configured, refreshAccount]);

  const load = useCallback(async () => {
    if (!configured || !session) return;
    setLoading(true);
    setMessage(null);
    try {
      const currentProfile = profile ?? (await refreshAccount());
      if (currentProfile?.syncEnabled) {
        await syncLocalChanges();
      }
      setEntries(await cloudSocial.getLeaderboards({ scope, metric, period }));
    } catch (error) {
      logAppWarning('leaderboards', error);
      setMessage(getUserFacingErrorMessage(error, 'leaderboards'));
    } finally {
      setLoading(false);
    }
  }, [configured, metric, period, profile, refreshAccount, scope, session]);

  useEffect(() => {
    void load();
  }, [load]);

  const statusNotes = useMemo(() => {
    const notes: string[] = [];
    if (profile && !profile.syncEnabled) {
      notes.push('Online backup is off.');
    }
    if (profile && !profile.leaderboardOptIn) {
      notes.push('Leaderboard sharing is off.');
    }
    if (scope === 'nearby' && profile && !profile.nearbyOptIn) {
      notes.push('Nearby discovery is off.');
    }
    return notes;
  }, [profile, scope]);

  if (!configured) {
    return <Gate title="Leaderboards offline" body="Online leaderboards are not available in this build. Local insights still work offline." />;
  }

  if (!session) {
    return <Gate title="Sign in to compare" body="Leaderboards show summary totals and require an optional V3l0city account." />;
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.panel}>
        <Text style={styles.title}>Leaderboards</Text>
        <Text style={styles.body}>
          Compare aggregate driving stats. Detailed trips, samples, and routes
          are not visible to other users.
        </Text>
        {statusNotes.length > 0 && (
          <View style={styles.notePanel}>
            {statusNotes.map((note) => (
              <Text key={note} style={styles.noteText}>
                {note}
              </Text>
            ))}
          </View>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.label}>Scope</Text>
        <SegmentedButtons
          value={scope}
          onValueChange={(value) => setScope(value as Scope)}
          buttons={[
            { value: 'friends', label: 'Friends' },
            { value: 'nearby', label: 'Nearby' },
            { value: 'global', label: 'Global' },
          ]}
        />
        <Text style={styles.label}>Metric</Text>
        <SegmentedButtons
          value={metric}
          onValueChange={(value) => setMetric(value as Metric)}
          buttons={[
            { value: 'distance', label: 'Distance' },
            { value: 'average_speed', label: 'Avg' },
            { value: 'max_speed', label: 'Max' },
            { value: 'trip_count', label: 'Trips' },
          ]}
        />
        <Text style={styles.label}>Period</Text>
        <SegmentedButtons
          value={period}
          onValueChange={(value) => setPeriod(value as Period)}
          buttons={[
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
            { value: 'all_time', label: 'All' },
          ]}
        />
        <Button
          mode="contained-tonal"
          loading={loading}
          disabled={loading}
          onPress={load}
          style={styles.refreshButton}
        >
          Refresh
        </Button>
        {message && <Text style={styles.message}>{message}</Text>}
      </View>

      <View style={styles.panel}>
        {entries.length === 0 ? (
          <Text style={styles.empty}>{emptyMessageFor(profile, scope)}</Text>
        ) : (
          entries.map((entry) => (
            <View key={`${entry.scope}-${entry.metric}-${entry.userId}`} style={styles.row}>
              <Text style={styles.rank}>#{entry.rank}</Text>
              <View style={styles.rowBody}>
                <Text style={styles.name}>{entry.displayName}</Text>
                <Text style={styles.username}>@{entry.username}</Text>
              </View>
              <Text style={styles.value}>{formatLeaderboardValue(entry, units)}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
};

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
  body: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.body,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  notePanel: {
    backgroundColor: colors.brandGoldDim,
    borderColor: colors.brandGold,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.md,
    padding: spacing.sm,
  },
  noteText: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  label: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  refreshButton: {
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
    lineHeight: 19,
    textAlign: 'center',
  },
  row: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rank: {
    color: colors.accent,
    fontFamily: fontFamilies.numeric,
    fontSize: 17,
    fontWeight: '900',
    width: 42,
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
  value: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.numeric,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
  },
});

export default LeaderboardsScreen;
