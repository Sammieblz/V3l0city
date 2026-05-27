import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Button, Card } from 'react-native-paper';
import { colors } from '../theme/paperTheme';
import type { Trip } from '../domain/trip';

type Props = {
  trips: Trip[];
  onClear: () => void;
};

const TripHistory: React.FC<Props> = ({ trips, onClear }) => {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Trip History</Text>
        {trips.length > 0 && (
          <Button
            mode="text"
            textColor={colors.danger}
            compact
            onPress={onClear}
          >
            Clear All
          </Button>
        )}
      </View>
      {trips.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No trips recorded yet.</Text>
          <Text style={styles.emptyHint}>
            Start a trip from the dashboard to track your speed and distance.
          </Text>
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const start = new Date(item.startedAt);
            const end = new Date(item.endedAt);
            const durationMs = end.getTime() - start.getTime();
            const durationMin = Math.round(durationMs / 60000);
            const distanceKm = item.totalDistanceMeters / 1000;
            const avgSpeedDisplay =
              item.units === 'km/h'
                ? item.averageSpeedMps * 3.6
                : item.averageSpeedMps * 2.23694;
            const maxSpeedDisplay =
              item.units === 'km/h'
                ? item.maxSpeedMps * 3.6
                : item.maxSpeedMps * 2.23694;

            return (
              <Card style={styles.tripCard} mode="contained">
                <Card.Content>
                  <View style={styles.tripHeader}>
                    <Text style={styles.tripDate}>
                      {start.toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </Text>
                    <Text style={styles.tripDuration}>
                      {durationMin > 0 ? `${durationMin} min` : '< 1 min'}
                    </Text>
                  </View>
                  <View style={styles.tripStats}>
                    <View style={styles.tripStat}>
                      <Text style={styles.statValue}>
                        {distanceKm.toFixed(1)}
                      </Text>
                      <Text style={styles.statLabel}>
                        {item.units === 'km/h' ? 'km' : 'mi'}
                      </Text>
                    </View>
                    <View style={styles.tripStat}>
                      <Text style={styles.statValue}>
                        {Math.round(avgSpeedDisplay)}
                      </Text>
                      <Text style={styles.statLabel}>avg {item.units}</Text>
                    </View>
                    <View style={styles.tripStat}>
                      <Text style={styles.statValue}>
                        {Math.round(maxSpeedDisplay)}
                      </Text>
                      <Text style={styles.statLabel}>max {item.units}</Text>
                    </View>
                  </View>
                  <Text style={styles.tripTime}>
                    {start.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    -{' '}
                    {end.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </Card.Content>
              </Card>
            );
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 80,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '500',
  },
  emptyHint: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  listContent: {
    paddingBottom: 24,
  },
  tripCard: {
    backgroundColor: colors.surfaceVariant,
    marginBottom: 10,
    borderRadius: 12,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  tripDate: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  tripDuration: {
    color: colors.textMuted,
    fontSize: 12,
  },
  tripStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  tripStat: {
    alignItems: 'center',
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  tripTime: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },
});

export default TripHistory;
