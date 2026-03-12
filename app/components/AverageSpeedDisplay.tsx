import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface AverageSpeedDisplayProps {
  averageSpeed: number;
  unitLabel?: string;
}

const AverageSpeedDisplay: React.FC<AverageSpeedDisplayProps> = ({
  averageSpeed,
  unitLabel,
}) => (
  <View>
    <Text style={styles.infoLabel}>average</Text>
    <Text style={styles.infoValue}>{averageSpeed.toFixed(1)}</Text>
    {unitLabel ? <Text style={styles.infoUnit}>{unitLabel}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  infoLabel: {
    color: '#ccc',
    fontSize: 14,
    textAlign: 'center',
  },
  infoValue: {
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  infoUnit: {
    color: '#AAAAAA',
    fontSize: 12,
    marginTop: 2,
    textAlign: 'center',
  },
});

export default AverageSpeedDisplay;
