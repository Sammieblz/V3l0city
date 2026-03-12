import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface CompassProps {
  heading: number | null;
}

const getCardinalDirection = (heading: number): string => {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(heading / 45) % directions.length;
  return directions[index];
};

const Compass: React.FC<CompassProps> = ({ heading }) => {
  const hasHeading = heading != null && !Number.isNaN(heading);
  const displayHeading = hasHeading ? heading : 0;
  const direction = hasHeading ? getCardinalDirection(displayHeading) : '--';

  return (
    <View style={styles.container}>
      <View style={styles.dial}>
        <Text style={styles.northLabel}>N</Text>
        <View
          style={[
            styles.needleContainer,
            { transform: [{ rotate: `${displayHeading}deg` }] },
          ]}
        >
          <View style={styles.needle} />
        </View>
      </View>
      <Text style={styles.headingText}>
        {hasHeading ? `${Math.round(displayHeading)} deg` : '--'} {direction}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    alignItems: 'center',
  },
  dial: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  northLabel: {
    position: 'absolute',
    top: 6,
    color: 'white',
    fontWeight: 'bold',
  },
  needleContainer: {
    width: 4,
    height: 48,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  needle: {
    width: 4,
    height: 32,
    borderRadius: 2,
    backgroundColor: '#FF3B30',
  },
  headingText: {
    marginTop: 8,
    fontSize: 14,
    color: '#AAAAAA',
  },
});

export default Compass;
