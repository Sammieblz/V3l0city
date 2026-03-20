import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/paperTheme';

import type { VelocitySensorsState } from '../hooks/useVelocitySensors';

type Props = {
  state: VelocitySensorsState;
  enabled: boolean;
};

const DebugOverlay: React.FC<Props> = ({ state, enabled }) => {
  const [collapsed, setCollapsed] = useState(true);

  if (!__DEV__ || !enabled) {
    return null;
  }

  const toggle = () => setCollapsed((prev) => !prev);

  if (collapsed) {
    return (
      <TouchableOpacity style={styles.collapsedContainer} onPress={toggle}>
        <Text style={styles.collapsedText}>
          {state.status} | {state.quality} | {state.source}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={toggle} activeOpacity={0.9}>
      <View style={styles.container}>
        <Text style={styles.line}>status: {state.status}</Text>
        <Text style={styles.line}>permission: {state.permission}</Text>
        <Text style={styles.line}>quality: {state.quality}</Text>
        <Text style={styles.line}>source: {state.source}</Text>
        <Text style={styles.line}>
          speed: {state.speedMps.toFixed(2)} m/s
        </Text>
        <Text style={styles.line}>
          avg: {state.averageSpeedMps.toFixed(2)} m/s
        </Text>
        <Text style={styles.line}>
          max: {state.maxSpeedMps.toFixed(2)} m/s
        </Text>
        <Text style={styles.line}>
          distance: {state.distanceMeters.toFixed(1)} m
        </Text>
        <Text style={styles.line}>
          heading:{' '}
          {state.headingDegrees != null
            ? state.headingDegrees.toFixed(0)
            : 'null'}
        </Text>
        <Text style={styles.hint}>Tap to collapse</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  collapsedContainer: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  collapsedText: {
    color: colors.textMuted,
    fontSize: 10,
  },
  container: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  line: {
    color: colors.textSecondary,
    fontSize: 10,
    lineHeight: 14,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 9,
    marginTop: 4,
  },
});

export default DebugOverlay;
