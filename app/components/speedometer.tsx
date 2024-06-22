
import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import KalmanFilter from 'kalmanjs';
import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';

import AverageSpeedDisplay from './AverageSpeedDisplay';
import Compass from './Compass';
import ResetButton from './ResetButton';
import { Dimensions } from 'react-native';
const { width, height } = Dimensions.get('window');
import CustomStatusBar from './CustomStatusBar';
import { Platform } from 'react-native';

interface Coordinates {
  latitude: number;
  longitude: number;
}

export default function Speedometer() {
  const [speed, setSpeed] = useState(0);
  const [units, setUnits] = useState<'km/h' | 'MPH'>('km/h');
  const [error, setError] = useState<string | null>(null);
  const [averageSpeed, setAverageSpeed] = useState(0);
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [distance, setDistance] = useState(0);

  const filterRef = useRef<KalmanFilter>(new KalmanFilter({ R: 0.01, Q: 3 }));
  let lastLocation: Location.LocationObjectCoords | null = null;
  let lastTimestamp: number | null = null;

  // Accumulate values for average speed calculation
  let totalSpeed = 0;
  let speedCount = 0;

  useEffect(() => {
    let locationSubscription: Location.LocationSubscription | null = null;
    let accelerometerSubscription: any = null;

    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Permission to access location was denied');
        return;
      }

      locationSubscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 1000 },
        (location) => {
          const { coords, timestamp } = location;

          if (lastLocation && lastTimestamp) {
            const distanceDelta = calculateDistance(lastLocation, coords);
            const timeDiff = (timestamp - lastTimestamp) / 1000;
            const gpsSpeed = coords.speed ?? 0;

            // Apply Kalman Filter
            const predictedState = filterRef.current.predict(gpsSpeed);
            const filteredState = filterRef.current.filter(gpsSpeed);
            const filteredSpeedMetersPerSecond = filteredState.x;

            // Convert speed back to km/h or MPH
            const currentSpeed = units === 'km/h' ? filteredSpeedMetersPerSecond * 3.6 : filteredSpeedMetersPerSecond * 3.6 / 1.609344;
            setSpeed(currentSpeed);

            // Update average and max speed, distance
            totalSpeed += currentSpeed;
            speedCount++;
            setAverageSpeed(totalSpeed / speedCount);
            setMaxSpeed(Math.max(maxSpeed, currentSpeed));
            setDistance(distance + (units === 'km/h' ? distanceDelta / 1000 : distanceDelta / 1609.34)); // Add to total distance (in kilometers)
          }

          lastLocation = coords;
          lastTimestamp = timestamp;
        }
      );

      accelerometerSubscription = Accelerometer.addListener((accelerometerData) => {
        if (accelerometerData.x != null) {
          const acceleration = accelerometerData.x;
          filterRef.current.predict(acceleration);
        }
      });
    })();

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
      if (accelerometerSubscription) {
        accelerometerSubscription.remove();
      }
    };
  }, [units]); // Re-run effect if units change

  function calculateDistance(coords1: Location.LocationObjectCoords, coords2: Location.LocationObjectCoords): number {
    const R = 6371e3; // Earth radius in meters
    const φ1 = (coords1.latitude * Math.PI) / 180;
    const φ2 = (coords2.latitude * Math.PI) / 180;
    const Δφ = ((coords2.latitude - coords1.latitude) * Math.PI) / 180;
    const Δλ = ((coords2.longitude - coords1.longitude) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; 
  }

  const handleReset = () => {
    setAverageSpeed(0);
    setMaxSpeed(0);
    setDistance(0);
    totalSpeed = 0; // Reset accumulator
    speedCount = 0;
  };


  return (
    <SafeAreaView style={styles.container}>
      
      <StatusBar 
        barStyle="dark-content"
        backgroundColor="#1A1A1A" // Match background color to app
        translucent={true}   
        hidden    // Make it translucent for content to go underneath
      />
      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <>
          <View style={styles.speedometerContainer}>
            <View style={styles.speedometer}>
              <Text style={styles.speed}>{speed.toFixed(1)}</Text>
              <Text style={styles.unitsLabel}>{units}</Text>
            </View>
          </View>
        
          {/* Button Container */}
          <View style={styles.buttonContainer}> 
            <TouchableOpacity
              style={styles.button}
              onPress={() => {
               
                setUnits(units === 'km/h' ? 'MPH' : 'km/h'); // Toggle the units
           
              }}
            >
              <Text style={styles.buttonText}>{units}</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.infoContainer}>
            <View style={styles.infoRow}>
              <AverageSpeedDisplay averageSpeed={averageSpeed} />
              <View>
                <Text style={styles.infoLabel}>max</Text>
                <Text style={styles.infoValue}>{maxSpeed.toFixed(1)}</Text>
              </View>
            </View>
            <View style={styles.unitContainer}>
              <View style={{marginTop: 20, alignItems: 'center'}}>
                <Text style={styles.infoValue}>{distance.toFixed(1)}</Text>
                <Text style={styles.infoLabel}> {units === 'km/h' ? 'km' : 'mi'}</Text>
              </View>
            </View>

          </View>
          

          <Compass />
          <ResetButton onPress={handleReset} />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'space-between'
     
  },
  infoContainer: { // New style for compass and distance container
    alignItems: 'center', 
    flex: 1,
    flexDirection: 'row',
    padding: 50,
    paddingRight: 70
   
  },

  distanceContainer: {
    flex: 1, 
    flexDirection: 'row',
    alignItems: 'baseline', // Align text to baseline
    marginTop: 10,
  },
  speedometerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20, // Add some padding around the speedometer
  },
  speedometer: {
    width: 250, // Adjust the size to your liking
    height: 250,
    borderRadius: 125,
    borderWidth: 15,
    borderColor: '#333333', // Slightly darker border
    backgroundColor: 'black', // Inner circle background
    alignItems: 'center',
    justifyContent: 'center',
  },
  speed: {
    fontSize: 80,
    fontWeight: 'bold',
    color: 'white',
  },
  unitsLabel: {
    fontSize: 24,
    color: '#AAAAAA', // Light gray
    marginTop: 5,
  },
  errorText: {
    color: '#FF4500',      // Orange-red color for visibility
    backgroundColor: '#111', // Dark background for contrast
    padding: 10,
    borderRadius: 5,
    marginTop: 20,
    textAlign: 'center',  // Center the text horizontally
    fontSize: 18,          
    fontWeight: 'bold',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '80%',
    marginTop: -300,
    marginLeft: 100,
  },
  unitContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '30%',
    marginTop: 40,

  },
  
  infoLabel: {
    color: '#AAAAAA',
    fontSize: 16,
    textAlign: 'center',
  },
  infoValue: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  compass: {
    marginTop: 20, // Adjust spacing
    flex: 1,
  },
  resetButton: {
    backgroundColor: '#FF3B30', // Red color for reset button
    padding: 35,
    borderRadius: 10, // Circular button
    position: 'absolute',
    bottom: 30, // Adjust position
    right: 30,
  },
  resetButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  buttonContainer: {  // New style for better button positioning
    marginTop: 20,     // Adjust as needed
  },
  button: {
    backgroundColor: '#007bff', 
    paddingHorizontal: 20,   // Add horizontal padding
    paddingVertical: 10,    // Add vertical padding
    borderRadius: 5,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,  // Slightly smaller font size for the button text
  },
});


// (rest of the styles are same)

