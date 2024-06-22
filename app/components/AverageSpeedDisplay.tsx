import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface AverageSpeedDisplayProps {
  averageSpeed: number;
}

const AverageSpeedDisplay: React.FC<AverageSpeedDisplayProps> = ({ averageSpeed }) => (
  <View>
    <Text style={styles.infoLabel}>average</Text>
    <Text style={styles.infoValue}>{averageSpeed.toFixed(1)}</Text>
  </View>
);

const styles = StyleSheet.create({
  infoLabel: {
    color: '#ccc',
    fontSize: 16,
  },
  infoValue: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default AverageSpeedDisplay;
