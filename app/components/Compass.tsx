import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const Compass: React.FC = () => (
  <View style={styles.compass}>
    <Text style={styles.compassText}>N</Text> 
  </View>
);

const styles = StyleSheet.create({
  compass: {
    // Add styles for the compass here (e.g., border, background color)
  },
  compassText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
});

export default Compass;
