import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

interface ResetButtonProps {
  onPress: () => void;
}

const ResetButton: React.FC<ResetButtonProps> = ({ onPress }) => (
  <TouchableOpacity style={styles.resetButton} onPress={onPress}>
    <Text style={styles.resetButtonText}>reset</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  resetButton: {
    backgroundColor: 'red',
    padding: 10,
    borderRadius: 20, // Make it circular
    position: 'absolute', // Position it absolutely
    top: 20, 
    right: 20,
  },
  resetButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});

export default ResetButton;
