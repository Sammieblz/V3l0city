import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
  AppState,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Appbar,
  Button,
  List,
  Modal,
  Portal,
  Snackbar,
  SegmentedButtons,
} from 'react-native-paper';

import AverageSpeedDisplay from './AverageSpeedDisplay';
import SpeedDial from './SpeedDial';
import HorizontalCompass from './HorizontalCompass';
import MiniCompass from './MiniCompass';
import DebugOverlay from './DebugOverlay';
import TripHistory from './TripHistory';
import { useVelocitySensors } from '../hooks/useVelocitySensors';
import { toDisplayDistance, toDisplaySpeed, type Units } from '../utils/speedMath';
import type { Trip } from '../domain/trip';
import { clearTrips, getTrips, saveTrip } from '../database/tripRepository';
import {
  getPreferences,
  savePreferences,
  type OrientationMode,
} from '../database/preferencesRepository';
import { colors } from '../theme/paperTheme';
import { scheduleTripSavedNotification } from '../utils/notifications';
import { exportAsJson, exportAsCsv } from '../database/exportService';
import * as ScreenOrientation from 'expo-screen-orientation';

const MOUNT_OPTIONS = [
  { label: 'top', offset: 0 },
  { label: 'right', offset: 90 },
  { label: 'bottom', offset: 180 },
  { label: 'left', offset: -90 },
] as const;

export default function Speedometer() {
  const [units, setUnits] = useState<Units>('km/h');
  const [mountIndex, setMountIndex] = useState(0);
  const [autoStart, setAutoStart] = useState(false);
  const [autoSave, setAutoSave] = useState(false);
  const [orientationMode, setOrientationMode] =
    useState<OrientationMode>('portrait');
  const [currentOrientation, setCurrentOrientation] = useState<
    'portrait' | 'landscape'
  >('portrait');
  const [isTripActive, setIsTripActive] = useState(false);
  const [isTripPaused, setIsTripPaused] = useState(false);
  const [currentTripStart, setCurrentTripStart] = useState<Date | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState<boolean>(__DEV__);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const pulseAnim = useRef(new RNAnimated.Value(1)).current;
  const appState = useRef(AppState.currentState);
  const prevStatus = useRef<string | null>(null);
  const orientationListener = useRef<ScreenOrientation.Subscription | null>(
    null,
  );
  // When auto-start is on, we only start once per "trip ended"; reset when trip stops/saves so next motion can auto-start again.
  const hasAutoStartedThisSession = useRef(false);

  useEffect(() => {
    if (isTripActive) {
      const loop = RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          RNAnimated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    pulseAnim.setValue(1);
  }, [isTripActive]);

  const mountOffset = MOUNT_OPTIONS[mountIndex].offset;
  const mountLabel = MOUNT_OPTIONS[mountIndex].label;
  const { state, reset } = useVelocitySensors({
    mountOffsetDegrees: mountOffset,
    accumulateTrip: isTripActive && !isTripPaused,
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
    source,
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
      source: state.source,
    };
  }, [state]);

  const applyOrientation = async (mode: OrientationMode) => {
    try {
      if (mode === 'portrait') {
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.PORTRAIT_UP,
        );
        setCurrentOrientation('portrait');
      } else if (mode === 'landscape') {
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.LANDSCAPE,
        );
        setCurrentOrientation('landscape');
      } else {
        await ScreenOrientation.unlockAsync();
        const orientationInfo = await ScreenOrientation.getOrientationAsync();
        const isLandscape =
          orientationInfo === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
          orientationInfo === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
        setCurrentOrientation(isLandscape ? 'landscape' : 'portrait');
      }
    } catch {
      // Ignore orientation errors (e.g., web or unsupported platforms).
    }
  };

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
        setAutoStart(prefs.autoStart ?? false);
        setAutoSave(prefs.autoSave ?? false);
          setOrientationMode(prefs.orientationMode ?? 'portrait');
      }
      setTrips(storedTrips);
      await applyOrientation(prefs?.orientationMode ?? 'portrait');
    };
    void load();
  }, []);

  useEffect(() => {
    const persist = async () => {
      await savePreferences({
        units,
        mountIndex,
        autoStart,
        autoSave,
        orientationMode,
      });
    };
    void persist();
  }, [units, mountIndex, autoStart, autoSave, orientationMode]);

  // Listen to device orientation when in auto mode.
  useEffect(() => {
    const setupListener = async () => {
      if (orientationMode !== 'auto') {
        if (orientationListener.current) {
          ScreenOrientation.removeOrientationChangeListener(
            orientationListener.current,
          );
          orientationListener.current = null;
        }
        return;
      }

      try {
        const info = await ScreenOrientation.getOrientationAsync();
        const isLandscape =
          info === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
          info === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
        setCurrentOrientation(isLandscape ? 'landscape' : 'portrait');

        const sub = await ScreenOrientation.addOrientationChangeListener(
          (event) => {
            const o = event.orientationInfo.orientation;
            const landscape =
              o === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
              o === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
            setCurrentOrientation(landscape ? 'landscape' : 'portrait');
          },
        );
        orientationListener.current = sub;
      } catch {
        // Ignore.
      }
    };

    void setupListener();

    return () => {
      if (orientationListener.current) {
        ScreenOrientation.removeOrientationChangeListener(
          orientationListener.current,
        );
        orientationListener.current = null;
      }
    };
  }, [orientationMode]);

  const speedDisplay = toDisplaySpeed(speedMps, units);
  const averageDisplay = toDisplaySpeed(averageSpeedMps, units);
  const maxDisplay = toDisplaySpeed(maxSpeedMps, units);
  const distanceDisplay = toDisplayDistance(distanceMeters, units);
  const maxDisplayRounded = Math.round(maxDisplay);

  const isPoorSignal = quality === 'poor';
  const isPermissionError = status === 'permission_denied';
  const isSensorUnavailable = status === 'sensor_unavailable';

  const showToast = (message: string) => {
    setToastMessage(message);
  };

  const startTrip = () => {
    if (isTripActive) return;
    reset();
    setIsTripActive(true);
    setIsTripPaused(false);
    setCurrentTripStart(new Date());
  };

  const stopAndSaveTrip = async () => {
    if (!isTripActive) return;
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
    setIsTripPaused(false);
    setCurrentTripStart(null);
    hasAutoStartedThisSession.current = false;

    // Fire a local notification for manual saves.
    void scheduleTripSavedNotification(trip);
  };

  const handleTripToggle = async () => {
    if (!isTripActive) {
      startTrip();
      showToast('Trip started');
      return;
    }

    await stopAndSaveTrip();
    showToast('Trip saved');
  };

  const handleReset = () => {
    reset();
    setElapsedMs(0);
  };

  const handleClearHistory = async () => {
    await clearTrips();
    setTrips([]);
  };

  const canReset = !isTripActive && distanceMeters > 0;

  // Track elapsed time for the current trip.
  useEffect(() => {
    if (!isTripActive || !currentTripStart) {
      setElapsedMs(0);
      return;
    }

    const update = () => {
      setElapsedMs(Date.now() - currentTripStart.getTime());
    };

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [isTripActive, currentTripStart]);

  // Auto-start when motion is detected (sustained speed above threshold), only when auto-start is enabled.
  useEffect(() => {
    if (
      autoStart &&
      !isTripActive &&
      !isPermissionError &&
      !isSensorUnavailable &&
      state.isMoving &&
      !hasAutoStartedThisSession.current
    ) {
      hasAutoStartedThisSession.current = true;
      startTrip();
      showToast('Trip autostarted');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, isTripActive, isPermissionError, isSensorUnavailable, state.isMoving]);

  // Auto-pause when stopped (sustained speed below threshold); only when auto-start is on.
  useEffect(() => {
    if (
      autoStart &&
      isTripActive &&
      !isTripPaused &&
      !isPermissionError &&
      !isSensorUnavailable &&
      state.isStopped
    ) {
      setIsTripPaused(true);
      showToast('Trip paused');
    }
  }, [autoStart, isTripActive, isTripPaused, isPermissionError, isSensorUnavailable, state.isStopped]);

  // Auto-resume when motion detected again after a pause.
  useEffect(() => {
    if (
      autoStart &&
      isTripActive &&
      isTripPaused &&
      !isPermissionError &&
      !isSensorUnavailable &&
      state.isMoving
    ) {
      setIsTripPaused(false);
      showToast('Trip resumed');
    }
  }, [autoStart, isTripActive, isTripPaused, isPermissionError, isSensorUnavailable, state.isMoving]);

  // Autosave / autostop when app goes to background.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState) => {
      const prevState = appState.current;
      appState.current = nextState;
      if (
        prevState === 'active' &&
        (nextState === 'background' || nextState === 'inactive') &&
        isTripActive &&
        (autoStart || autoSave)
      ) {
        try {
          await stopAndSaveTrip();
          showToast('Trip auto-saved');
          // Background autosave notification; details were handled inside stopAndSaveTrip.
        } catch {
          // Ignore autosave failures; trip will simply end without history update.
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [autoStart, autoSave, isTripActive, stopAndSaveTrip]);

  // Sensor / permission status toasts.
  useEffect(() => {
    if (prevStatus.current === status) {
      return;
    }
    if (status === 'permission_denied') {
      showToast('Location permission denied');
    } else if (status === 'sensor_unavailable') {
      showToast('Required sensors unavailable on this device');
    } else if (status === 'ready') {
      showToast('Sensors ready');
    }
    prevStatus.current = status;
  }, [status]);

  const renderPortraitDashboard = () => {
    if (isPermissionError) {
      return (
        <View style={styles.messageContainer}>
          <Text style={styles.messageTitle}>Location Permission Required</Text>
          <Text style={styles.messageBody}>
            Enable location access in your device settings to see speed and
            distance.
          </Text>
        </View>
      );
    }

    if (isSensorUnavailable) {
      return (
        <View style={styles.messageContainer}>
          <Text style={styles.messageTitle}>Sensors Unavailable</Text>
          <Text style={styles.messageBody}>
            This device does not expose the motion or location sensors required
            for V3locity.
          </Text>
        </View>
      );
    }

    if (errorMessage) {
      return (
        <View style={styles.messageContainer}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      );
    }

    const maxScale =
      speedDisplay > 160 ? 300 : speedDisplay > 80 ? 200 : 160;

    return (
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.dialContainer}>
          <SpeedDial
            speed={speedDisplay}
            maxScale={maxScale}
            units={units}
            isPoorSignal={isPoorSignal}
          />
        </View>

        {(!autoStart || isTripActive) && (
          <View style={styles.tripSection}>
            {isTripPaused && (
              <Text style={styles.tripPausedLabel}>Trip paused</Text>
            )}
            <TouchableOpacity
              style={[
                styles.tripButton,
                isTripActive ? styles.tripButtonActive : styles.tripButtonIdle,
              ]}
              onPress={handleTripToggle}
              activeOpacity={0.8}
            >
              {isTripActive && !isTripPaused && (
                <RNAnimated.View
                  style={[styles.recordDot, { opacity: pulseAnim }]}
                />
              )}
              <Text
                style={[
                  styles.tripButtonText,
                  isTripActive && styles.tripButtonTextActive,
                ]}
              >
                {isTripPaused
                  ? 'Save & end'
                  : isTripActive
                    ? 'Stop & Save'
                    : 'Start Trip'}
              </Text>
            </TouchableOpacity>
            {canReset && (
              <TouchableOpacity
                style={styles.resetButton}
                onPress={handleReset}
                activeOpacity={0.7}
              >
                <Text style={styles.resetText}>Reset</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <AverageSpeedDisplay
              averageSpeed={averageDisplay}
              unitLabel={units}
            />
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>MAX</Text>
            <Text style={styles.statValue}>{maxDisplayRounded}</Text>
            <Text style={styles.statUnit}>{units}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>DIST</Text>
            <Text style={styles.statValue}>
              {distanceDisplay.toFixed(1)}
            </Text>
            <Text style={styles.statUnit}>
              {units === 'km/h' ? 'km' : 'mi'}
            </Text>
          </View>
        </View>

        <View style={styles.compassSection}>
          <HorizontalCompass heading={headingDegrees} />
          <View style={styles.miniCompassRow}>
            <MiniCompass heading={headingDegrees} />
          </View>
        </View>
      </ScrollView>
    );
  };

  const renderLandscapeDashboard = () => {
    const maxScale =
      speedDisplay > 160 ? 300 : speedDisplay > 80 ? 200 : 160;

    return (
      <View style={styles.landscapeRoot}>
        <View style={styles.landscapeLeft}>
          <SpeedDial
            speed={speedDisplay}
            maxScale={maxScale}
            units={units}
            isPoorSignal={isPoorSignal}
          />
        </View>
        <View style={styles.landscapeRight}>
          <View style={styles.landscapeStatsGrid}>
            <View style={styles.landscapeStat}>
              <Text style={styles.landscapeStatLabel}>Duration</Text>
              <Text style={styles.landscapeStatValue}>
                {new Date(elapsedMs).toISOString().substring(11, 19)}
              </Text>
            </View>
            <View style={styles.landscapeStat}>
              <Text style={styles.landscapeStatLabel}>Maximum</Text>
              <Text style={styles.landscapeStatValue}>
                {maxDisplayRounded} {units}
              </Text>
            </View>
            <View style={styles.landscapeStat}>
              <Text style={styles.landscapeStatLabel}>Distance</Text>
              <Text style={styles.landscapeStatValue}>
                {distanceDisplay.toFixed(1)}{' '}
                {units === 'km/h' ? 'km' : 'mi'}
              </Text>
            </View>
            <View style={styles.landscapeStat}>
              <Text style={styles.landscapeStatLabel}>Average</Text>
              <Text style={styles.landscapeStatValue}>
                {Math.round(averageDisplay)} {units}
              </Text>
            </View>
          </View>

          <View style={styles.landscapeCompassBlock}>
            <HorizontalCompass heading={headingDegrees} />
            <View style={styles.landscapeMiniCompassRow}>
              <MiniCompass heading={headingDegrees} />
            </View>
          </View>

          {(!autoStart || isTripActive) && (
            <View style={styles.landscapeTripButtonRow}>
              {isTripPaused && (
                <Text style={styles.tripPausedLabel}>Trip paused</Text>
              )}
              <TouchableOpacity
                style={[
                  styles.landscapeTripButton,
                  isTripActive
                    ? styles.landscapeTripButtonActive
                    : styles.landscapeTripButtonIdle,
                ]}
                onPress={handleTripToggle}
                activeOpacity={0.85}
              >
                {isTripActive && !isTripPaused && (
                  <RNAnimated.View
                    style={[styles.recordDot, { opacity: pulseAnim }]}
                  />
                )}
                <Text style={styles.landscapeTripButtonText}>
                  {isTripPaused
                    ? 'Save & end'
                    : isTripActive
                      ? 'Stop & Save'
                      : 'Start'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  const isLandscapeLayout =
    orientationMode === 'landscape' ||
    (orientationMode === 'auto' && currentOrientation === 'landscape');

  const openDrawer = () => setDrawerOpen(true);
  const closeDrawer = () => setDrawerOpen(false);

  const handleDrawerHistory = () => {
    setShowHistory(true);
    closeDrawer();
  };

  const handleDrawerSettings = () => {
    setShowSettings(true);
    closeDrawer();
  };

  const handleExportJson = async () => {
    closeDrawer();
    try {
      await exportAsJson();
    } catch {
      showToast('Export failed');
    }
  };

  const handleExportCsv = async () => {
    closeDrawer();
    try {
      await exportAsCsv();
    } catch {
      showToast('Export failed');
    }
  };

  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={styles.headerWrapper}>
        <Appbar.Header
          style={[styles.appbar, { paddingTop: insets.top }]}
          mode="center-aligned"
        >
        {showHistory ? (
          <Appbar.BackAction
            onPress={() => setShowHistory(false)}
            color={colors.textSecondary}
          />
        ) : (
          <Appbar.Action
            icon="menu"
            iconColor={colors.textSecondary}
            onPress={openDrawer}
          />
        )}
        <Appbar.Content
          title={showHistory ? 'History' : 'V3locity'}
          titleStyle={styles.appbarTitle}
        />
        <Appbar.Action
          icon={isLandscapeLayout ? 'tablet' : 'cellphone'}
          iconColor={colors.textSecondary}
          onPress={() => {
            const nextMode: OrientationMode = isLandscapeLayout
              ? 'portrait'
              : 'landscape';
            setOrientationMode(nextMode);
            void applyOrientation(nextMode);
          }}
        />
      </Appbar.Header>
      </View>

      {showHistory ? (
        <TripHistory trips={trips} onClear={handleClearHistory} />
      ) : (
        isLandscapeLayout
          ? renderLandscapeDashboard()
          : renderPortraitDashboard()
      )}

      <Portal>
        <Modal
          visible={drawerOpen}
          onDismiss={closeDrawer}
          contentContainerStyle={styles.drawerOverlay}
        >
          <View style={styles.drawerPanel}>
            <Text style={styles.drawerTitle}>Menu</Text>
            <List.Item
              title="History"
              description="View trip history"
              left={(props) => <List.Icon {...props} icon="history" />}
              onPress={handleDrawerHistory}
              style={styles.drawerItem}
              titleStyle={styles.drawerItemTitle}
            />
            <List.Item
              title="Settings"
              description="Units, orientation, and more"
              left={(props) => <List.Icon {...props} icon="cog" />}
              onPress={handleDrawerSettings}
              style={styles.drawerItem}
              titleStyle={styles.drawerItemTitle}
            />
            <List.Item
              title="Export as JSON"
              description="Trips and preferences"
              left={(props) => <List.Icon {...props} icon="code-json" />}
              onPress={handleExportJson}
              style={styles.drawerItem}
              titleStyle={styles.drawerItemTitle}
            />
            <List.Item
              title="Export as CSV"
              description="Trip data as spreadsheet"
              left={(props) => <List.Icon {...props} icon="file-delimited" />}
              onPress={handleExportCsv}
              style={styles.drawerItem}
              titleStyle={styles.drawerItemTitle}
            />
          </View>
          <TouchableWithoutFeedback onPress={closeDrawer}>
            <View style={styles.drawerBackdrop} />
          </TouchableWithoutFeedback>
        </Modal>

        <Modal
          visible={showSettings}
          onDismiss={() => setShowSettings(false)}
          contentContainerStyle={styles.settingsSheet}
        >
          <View style={styles.settingsHandle} />
          <Text style={styles.settingsTitle}>Settings</Text>

          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Units</Text>
            <SegmentedButtons
              value={units}
              onValueChange={(value) => setUnits(value as Units)}
              buttons={[
                { value: 'km/h', label: 'km/h' },
                { value: 'MPH', label: 'MPH' },
              ]}
            />
          </View>

          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Mount Position</Text>
            <SegmentedButtons
              value={String(mountIndex)}
              onValueChange={(value) =>
                setMountIndex(Number.parseInt(value, 10) || 0)
              }
              buttons={MOUNT_OPTIONS.map((option, index) => ({
                value: String(index),
                label: option.label.toUpperCase(),
              }))}
            />
            <Text style={styles.settingsHelper}>
              Select where the phone is mounted in your vehicle.
            </Text>
          </View>

          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Autostart trip</Text>
            <SegmentedButtons
              value={autoStart ? 'on' : 'off'}
              onValueChange={(value) => setAutoStart(value === 'on')}
              buttons={[
                { value: 'off', label: 'Off' },
                { value: 'on', label: 'On' },
              ]}
            />
            <Text style={styles.settingsHelper}>
              Start a trip automatically when motion is detected.
            </Text>
          </View>

          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Autosave on exit</Text>
            <SegmentedButtons
              value={autoSave ? 'on' : 'off'}
              onValueChange={(value) => setAutoSave(value === 'on')}
              buttons={[
                { value: 'off', label: 'Off' },
                { value: 'on', label: 'On' },
              ]}
            />
            <Text style={styles.settingsHelper}>
              When enabled, active trips are saved automatically when the app
              goes to background.
            </Text>
          </View>

          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Orientation</Text>
            <SegmentedButtons
              value={orientationMode}
              onValueChange={(value) => {
                const mode = value as OrientationMode;
                setOrientationMode(mode);
                void applyOrientation(mode);
              }}
              buttons={[
                { value: 'portrait', label: 'Portrait' },
                { value: 'landscape', label: 'Landscape' },
                { value: 'auto', label: 'Auto (device)' },
              ]}
            />
            <Text style={styles.settingsHelper}>
              Lock V3locity to a specific orientation or follow device
              auto-rotate.
            </Text>
          </View>

          {__DEV__ && (
            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>Debug Overlay</Text>
              <SegmentedButtons
                value={debugEnabled ? 'on' : 'off'}
                onValueChange={(value) => setDebugEnabled(value === 'on')}
                buttons={[
                  { value: 'off', label: 'Off' },
                  { value: 'on', label: 'On' },
                ]}
              />
            </View>
          )}

          <Button
            mode="text"
            style={styles.settingsClose}
            onPress={() => setShowSettings(false)}
          >
            Done
          </Button>
        </Modal>

        <Snackbar
          visible={toastMessage != null}
          onDismiss={() => setToastMessage(null)}
          duration={2500}
          wrapperStyle={styles.toastWrapper}
          style={styles.toast}
        >
          {toastMessage}
        </Snackbar>
      </Portal>

      <DebugOverlay state={state} enabled={debugEnabled} />
      <View style={[styles.footer, { paddingBottom: insets.bottom }]}>
        <View style={styles.footerLeft}>
          <Text style={styles.footerLabel}>STATUS</Text>
          <Text style={styles.footerValue}>
            {isPermissionError
              ? 'Permission required'
              : isSensorUnavailable
              ? 'Sensors unavailable'
              : isTripActive
              ? 'Recording'
              : status === 'ready'
              ? 'Ready'
              : 'Initializing'}
          </Text>
        </View>
        <View style={styles.footerCenter}>
          <Text style={styles.footerLabel}>SESSION</Text>
          <Text style={styles.footerValue}>
            {new Date(elapsedMs).toISOString().substring(11, 19)}
          </Text>
        </View>
        <View style={styles.footerRight}>
          <Text style={styles.footerLabel}>SIGNAL</Text>
          <Text style={styles.footerValue}>
            {quality ?? 'unknown'} • {source ?? 'none'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerWrapper: {
    backgroundColor: colors.background,
  },
  appbar: {
    backgroundColor: 'transparent',
    elevation: 0,
  },
  appbarTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.textPrimary,
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  drawerPanel: {
    width: 280,
    backgroundColor: colors.surface,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
    paddingTop: 16,
  },
  drawerTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  drawerItem: {
    backgroundColor: 'transparent',
  },
  drawerItemTitle: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 32,
  },
  messageContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  messageTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  messageBody: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorText: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },

  dialContainer: {
    marginTop: 8,
    alignItems: 'center',
  },

  tripSection: {
    alignItems: 'center',
    marginTop: 4,
    minHeight: 56,
  },
  tripPausedLabel: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 6,
  },
  tripButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 36,
    borderRadius: 28,
    minWidth: 180,
  },
  tripButtonIdle: {
    backgroundColor: colors.accent,
  },
  tripButtonActive: {
    backgroundColor: colors.danger,
  },
  recordDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginRight: 10,
  },
  tripButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    letterSpacing: 0.5,
  },
  tripButtonTextActive: {
    color: '#fff',
  },
  resetButton: {
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 16,
  },
  resetText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    paddingHorizontal: 20,
    width: '100%',
  },

  // Landscape layout
  landscapeRoot: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  landscapeLeft: {
    flex: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  landscapeRight: {
    flex: 2,
    paddingLeft: 12,
    justifyContent: 'space-between',
  },
  landscapeStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  landscapeStat: {
    width: '48%',
  },
  landscapeStatLabel: {
    color: colors.textMuted,
    fontSize: 11,
    marginBottom: 2,
  },
  landscapeStatValue: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  landscapeCompassBlock: {
    marginTop: 12,
  },
  landscapeMiniCompassRow: {
    marginTop: 12,
    alignItems: 'center',
  },
  landscapeTripButtonRow: {
    marginTop: 16,
    alignItems: 'flex-end',
  },
  landscapeTripButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 32,
    borderRadius: 28,
  },
  landscapeTripButtonIdle: {
    backgroundColor: colors.accent,
  },
  landscapeTripButtonActive: {
    backgroundColor: colors.danger,
  },
  landscapeTripButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    letterSpacing: 0.5,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '700',
  },
  statUnit: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
    letterSpacing: 0.5,
  },

  compassSection: {
    marginTop: 28,
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  miniCompassRow: {
    marginTop: 16,
    alignItems: 'center',
  },

  settingsSheet: {
    backgroundColor: colors.surface,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 12,
  },
  settingsHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
    alignSelf: 'center',
    marginBottom: 16,
  },
  settingsTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
  },
  settingsRow: {
    marginBottom: 20,
  },
  settingsLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  settingsHelper: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 6,
  },
  settingsClose: {
    marginTop: 8,
    alignSelf: 'center',
  },
  toastWrapper: {
    bottom: 56,
  },
  toast: {
    backgroundColor: colors.surfaceVariant,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  footerLeft: {
    flex: 1,
  },
  footerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  footerRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  footerLabel: {
    color: colors.textMuted,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  footerValue: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
});
