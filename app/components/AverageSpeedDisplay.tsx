import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/paperTheme';

interface AverageSpeedDisplayProps {
  averageSpeed: number;
  unitLabel?: string;
}

const AverageSpeedDisplay: React.FC<AverageSpeedDisplayProps> = ({
  averageSpeed,
  unitLabel,
}) => (
  <View>
    <Text style={styles.label}>AVG</Text>
    <Text style={styles.value}>{Math.round(averageSpeed)}</Text>
    {unitLabel ? <Text style={styles.unit}>{unitLabel}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  label: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  value: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
  },
  unit: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
});

export default AverageSpeedDisplay;
