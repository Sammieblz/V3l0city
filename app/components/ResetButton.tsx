import React from 'react';
import { StyleSheet } from 'react-native';
import { FAB } from 'react-native-paper';

interface ResetButtonProps {
  onPress: () => void;
}

const ResetButton: React.FC<ResetButtonProps> = ({ onPress }) => (
  <FAB
    style={styles.fab}
    icon="restore"
    label="Reset"
    onPress={onPress}
    small
  />
);

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
  },
});

export default ResetButton;
