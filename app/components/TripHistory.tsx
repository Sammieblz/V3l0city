import React from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { Trip } from '../domain/trip';

type Props = {
  trips: Trip[];
  onClear: () => void;
};

const TripHistory: React.FC<Props> = ({ trips, onClear }) => {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Trip history</Text>
        {trips.length > 0 && (
          <TouchableOpacity style={styles.clearButton} onPress={onClear}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>
      {trips.length === 0 ? (
        <Text style={styles.emptyText}>No trips recorded yet.</Text>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const start = new Date(item.startedAt);
            const end = new Date(item.endedAt);
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
              <View style={styles.tripCard}>
                <Text style={styles.tripDate}>
                  {start.toLocaleDateString()} {start.toLocaleTimeString()}
                </Text>
                <Text style={styles.tripLine}>
                  Distance: {distanceKm.toFixed(1)} km
                </Text>
                <Text style={styles.tripLine}>
                  Avg: {avgSpeedDisplay.toFixed(1)} {item.units}
                </Text>
                <Text style={styles.tripLine}>
                  Max: {maxSpeedDisplay.toFixed(1)} {item.units}
                </Text>
                <Text style={styles.tripMeta}>
                  Mount: {item.mountLabel ?? 'unknown'}
                </Text>
                <Text style={styles.tripMeta}>
                  Ended: {end.toLocaleTimeString()}
                </Text>
              </View>
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
    paddingTop: 24,
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
  },
  clearButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#555',
  },
  clearText: {
    color: '#FF6666',
    fontSize: 12,
  },
  emptyText: {
    marginTop: 16,
    color: '#CCCCCC',
    fontSize: 14,
  },
  listContent: {
    paddingVertical: 8,
  },
  tripCard: {
    backgroundColor: '#111111',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  tripDate: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  tripLine: {
    color: '#DDDDDD',
    fontSize: 13,
  },
  tripMeta: {
    color: '#999999',
    fontSize: 11,
  },
});

export default TripHistory;

