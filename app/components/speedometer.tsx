import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import {
  Appbar,
  Button,
  Modal,
  Portal,
  SegmentedButtons,
  Surface,
} from 'react-native-paper';

import AverageSpeedDisplay from './AverageSpeedDisplay';
import Compass from './Compass';
import DebugOverlay from './DebugOverlay';
import TripHistory from './TripHistory';
import ResetButton from './ResetButton';
import { useVelocitySensors } from '../hooks/useVelocitySensors';
import { toDisplayDistance, toDisplaySpeed, type Units } from '../utils/speedMath';
import type { Trip } from '../domain/trip';
import { clearTrips, getTrips, saveTrip } from '../storage/tripStorage';
import { getPreferences, savePreferences } from '../storage/preferencesStorage';

const MOUNT_OPTIONS = [
  { label: 'top', offset: 0 },
  { label: 'right', offset: 90 },
  { label: 'bottom', offset: 180 },
  { label: 'left', offset: -90 },
] as const;

export default function Speedometer() {
  const [units, setUnits] = useState<Units>('km/h');
  const [mountIndex, setMountIndex] = useState(0);
  const [isTripActive, setIsTripActive] = useState(false);
  const [currentTripStart, setCurrentTripStart] = useState<Date | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState<boolean>(__DEV__);

  const mountOffset = MOUNT_OPTIONS[mountIndex].offset;
  const mountLabel = MOUNT_OPTIONS[mountIndex].label;
  const { state, reset } = useVelocitySensors({
    mountOffsetDegrees: mountOffset,
  });

  const {
    speedMps,
    averageSpeedMps,
    maxSpeedMps,
    distanceMeters,
    headingDegrees,
    errorMessage,
    quality,
    status,
  } = useMemo(() => {
    return {
      speedMps: state.speedMps,
      averageSpeedMps: state.averageSpeedMps,
      maxSpeedMps: state.maxSpeedMps,
      distanceMeters: state.distanceMeters,
      headingDegrees: state.headingDegrees,
      errorMessage: state.errorMessage,
      quality: state.quality,
      status: state.status,
    };
  }, [state]);

  useEffect(() => {
    const load = async () => {
      const [prefs, storedTrips] = await Promise.all([
        getPreferences(),
        getTrips(),
      ]);
      if (prefs) {
        setUnits(prefs.units);
        if (prefs.mountIndex >= 0 && prefs.mountIndex < MOUNT_OPTIONS.length) {
          setMountIndex(prefs.mountIndex);
        }
      }
      setTrips(storedTrips);
    };
    void load();
  }, []);

  useEffect(() => {
    const persist = async () => {
      await savePreferences({ units, mountIndex });
    };
    void persist();
  }, [units, mountIndex]);

  const handleReset = () => {
    reset();
  };

  const speedDisplay = toDisplaySpeed(speedMps, units);
  const averageDisplay = toDisplaySpeed(averageSpeedMps, units);
  const maxDisplay = toDisplaySpeed(maxSpeedMps, units);
  const distanceDisplay = toDisplayDistance(distanceMeters, units);

  const isPoorSignal = quality === 'poor';
  const isPermissionError = status === 'permission_denied';
  const isSensorUnavailable = status === 'sensor_unavailable';

  const handleStartTrip = () => {
    if (isTripActive) {
      return;
    }
    setIsTripActive(true);
    setCurrentTripStart(new Date());
  };

  const handleStopTrip = async () => {
    if (!isTripActive) {
      return;
    }
    const end = new Date();
    const start = currentTripStart ?? end;

    const trip: Trip = {
      id: `${start.getTime()}-${end.getTime()}`,
      startedAt: start.toISOString(),
      endedAt: end.toISOString(),
      totalDistanceMeters: distanceMeters,
      maxSpeedMps: maxSpeedMps,
      averageSpeedMps: averageSpeedMps,
      units,
      mountLabel,
    };

    await saveTrip(trip);
    const stored = await getTrips();
    setTrips(stored);
    setIsTripActive(false);
    setCurrentTripStart(null);
  };

  const handleClearHistory = async () => {
    await clearTrips();
    setTrips([]);
  };

  const renderDashboard = () => {
    if (isPermissionError) {
      return (
        <View style={styles.messageContainer}>
          <Text style={styles.messageTitle}>Location permission required</Text>
          <Text style={styles.messageBody}>
            Enable location access in your device settings to see speed and distance.
          </Text>
        </View>
      );
    }

    if (isSensorUnavailable) {
      return (
        <View style={styles.messageContainer}>
          <Text style={styles.messageTitle}>Sensors unavailable</Text>
          <Text style={styles.messageBody}>
            This device does not expose the motion or location sensors required for
            Velocity.
          </Text>
        </View>
      );
    }

    if (errorMessage) {
      return <Text style={styles.errorText}>{errorMessage}</Text>;
    }

    return (
      <>
        <View style={styles.speedometerContainer}>
          <Surface style={styles.speedometerSurface} elevation={3}>
            <View
              style={[
                styles.speedometer,
                isPoorSignal && styles.speedometerDegraded,
              ]}
            >
              <Text
                style={[
                  styles.speed,
                  isPoorSignal && styles.speedDegradedText,
                ]}
              >
                {speedDisplay.toFixed(1)}
              </Text>
              <Text style={styles.unitsLabel}>{units}</Text>
            </View>
          </Surface>
        </View>

        <View style={styles.buttonContainer}>
          <SegmentedButtons
            style={styles.unitSegment}
            value={units}
            onValueChange={(value) => setUnits(value as Units)}
            buttons={[
              { value: 'km/h', label: 'km/h' },
              { value: 'MPH', label: 'MPH' },
            ]}
          />
          <View style={styles.tripButtonsRow}>
            <Button
              mode="contained"
              style={styles.tripPrimaryButton}
              onPress={handleStartTrip}
              disabled={isTripActive}
            >
              Start
            </Button>
            <Button
              mode="outlined"
              style={styles.tripSecondaryButton}
              onPress={handleStopTrip}
              disabled={!isTripActive}
            >
              Stop &amp; Save
            </Button>
          </View>
        </View>

        <Surface style={styles.statsSurface} elevation={2}>
          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <AverageSpeedDisplay
                averageSpeed={averageDisplay}
                unitLabel={units}
              />
            </View>
            <View style={styles.metric}>
              <Text style={styles.infoLabel}>max</Text>
              <Text style={styles.infoValue}>{maxDisplay.toFixed(1)}</Text>
              <Text style={styles.infoUnit}>{units}</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.infoLabel}>distance</Text>
              <Text style={styles.infoValue}>{distanceDisplay.toFixed(1)}</Text>
              <Text style={styles.infoUnit}>
                {units === 'km/h' ? 'km' : 'mi'}
              </Text>
            </View>
          </View>
        </Surface>

        <Surface style={styles.mountSurface} elevation={2}>
          <Text style={styles.mountLabel}>Mount position</Text>
          <SegmentedButtons
            style={styles.mountSegment}
            value={String(mountIndex)}
            onValueChange={(value) =>
              setMountIndex(Number.parseInt(value, 10) || 0)
            }
            buttons={MOUNT_OPTIONS.map((option, index) => ({
              value: String(index),
              label: option.label.toUpperCase(),
            }))}
          />
        </Surface>

        <Surface style={styles.compassSurface} elevation={2}>
          <Text style={styles.compassTitle}>Compass</Text>
          <Compass heading={headingDegrees} />
        </Surface>
        <ResetButton onPress={handleReset} />
        <DebugOverlay state={state} enabled={debugEnabled} />
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Appbar.Header mode="center-aligned">
        <Appbar.Content title="Velocity" />
        <Appbar.Action
          icon="cog-outline"
          onPress={() => setShowSettings((prev) => !prev)}
        />
      </Appbar.Header>
      <View style={styles.tabRow}>
        <SegmentedButtons
          value={showHistory ? 'history' : 'dashboard'}
          onValueChange={(value) => setShowHistory(value === 'history')}
          buttons={[
            { value: 'dashboard', label: 'Dashboard' },
            { value: 'history', label: 'History' },
          ]}
        />
      </View>
      {showHistory ? (
        <TripHistory trips={trips} onClear={handleClearHistory} />
      ) : (
        renderDashboard()
      )}
      <Portal>
        <Modal
          visible={showSettings}
          onDismiss={() => setShowSettings(false)}
          contentContainerStyle={styles.settingsPanel}
        >
          <Text style={styles.settingsTitle}>Settings</Text>
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Units</Text>
            <SegmentedButtons
              style={styles.settingsButtonsRow}
              value={units}
              onValueChange={(value) => setUnits(value as Units)}
              buttons={[
                { value: 'km/h', label: 'km/h' },
                { value: 'MPH', label: 'MPH' },
              ]}
            />
            <Text style={styles.settingsHelper}>
              Affects how speed and distance are displayed.
            </Text>
          </View>
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Mount position</Text>
            <SegmentedButtons
              style={styles.settingsButtonsRow}
              value={String(mountIndex)}
              onValueChange={(value) =>
                setMountIndex(Number.parseInt(value, 10) || 0)
              }
              buttons={MOUNT_OPTIONS.map((option, index) => ({
                value: String(index),
                label: option.label.toUpperCase(),
              }))}
            />
          </View>
          {__DEV__ && (
            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>Debug overlay</Text>
              <SegmentedButtons
                style={styles.settingsButtonsRow}
                value={debugEnabled ? 'on' : 'off'}
                onValueChange={(value) => setDebugEnabled(value === 'on')}
                buttons={[
                  { value: 'off', label: 'Off' },
                  { value: 'on', label: 'On' },
                ]}
              />
              <Text style={styles.settingsHelper}>
                Shows raw sensor values for debugging; for development only.
              </Text>
            </View>
          )}
        </Modal>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  tabRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  messageContainer: {
    marginTop: 40,
    paddingHorizontal: 24,
  },
  messageTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  messageBody: {
    color: '#CCCCCC',
    fontSize: 14,
    textAlign: 'center',
  },
  speedometerContainer: {
    marginTop: 24,
    alignItems: 'center',
  },
  speedometer: {
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 12,
    borderColor: '#333333',
    backgroundColor: 'black',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedometerDegraded: {
    borderColor: '#665500',
    backgroundColor: '#111111',
  },
  speed: {
    fontSize: 72,
    fontWeight: 'bold',
    color: 'white',
  },
  speedDegradedText: {
    color: '#FFDD66',
  },
  unitsLabel: {
    fontSize: 22,
    color: '#AAAAAA',
    marginTop: 6,
  },
  buttonContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  unitSegment: {
    width: '80%',
    marginBottom: 8,
  },
  metricsRow: {
    marginTop: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '90%',
  },
  tripButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  tripPrimaryButton: {
    minWidth: 120,
  },
  tripSecondaryButton: {
    minWidth: 140,
  },
  settingsPanel: {
    position: 'absolute',
    right: 12,
    top: 40,
    backgroundColor: '#111111',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333333',
    maxWidth: 260,
  },
  settingsTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  settingsRow: {
    marginBottom: 8,
  },
  settingsLabel: {
    color: '#CCCCCC',
    fontSize: 12,
    marginBottom: 4,
  },
  settingsButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  settingsChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#555555',
  },
  settingsChipActive: {
    borderColor: '#007bff',
    backgroundColor: '#003366',
  },
  settingsChipText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  mountContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  mountLabel: {
    color: '#AAAAAA',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  mountButton: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#444444',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  mountButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  metric: {
    alignItems: 'center',
    flex: 1,
  },
  infoLabel: {
    color: '#AAAAAA',
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
  errorText: {
    color: '#FF4500',
    backgroundColor: '#111',
    padding: 10,
    borderRadius: 5,
    marginTop: 20,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
