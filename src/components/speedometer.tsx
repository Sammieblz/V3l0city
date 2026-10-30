import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
  BackHandler,
  Easing,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Appbar,
  Button,
  IconButton,
  Modal,
  Portal,
  SegmentedButtons,
} from 'react-native-paper';
import Svg, { Line, Rect } from 'react-native-svg';

import AverageSpeedDisplay from './AverageSpeedDisplay';
import AccountSyncScreen, { type AccountEntryStep } from './AccountSyncScreen';
import AppToast, { type AppToastMessage, type AppToastVariant } from './AppToast';
import BrandMark from './BrandMark';
import DebugOverlay from './DebugOverlay';
import FindFriendsScreen from './FindFriendsScreen';
import HorizontalCompass from './HorizontalCompass';
import InsightsScreen from './InsightsScreen';
import LeaderboardsScreen from './LeaderboardsScreen';
import MiniCompass from './MiniCompass';
import OnboardingScreen from './OnboardingScreen';
import PressableScale from './PressableScale';
import PrivacyPolicyScreen from './PrivacyPolicyScreen';
import SideDrawer, { type DrawerAccountSummary } from './SideDrawer';
import SpeedDial from './SpeedDial';
import TripHistory from './TripHistory';
import { tripTelemetryService } from '../api/tripTelemetryService';
import {
  cloudAuth,
  isCloudConfigured,
  syncLocalChanges,
} from '../cloud/cloudService';
import {
  exportAsCsv,
  exportAsJson,
  pickAndImportJsonExport,
} from '../database/exportService';
import {
  getPreferences,
  savePreferences,
  type OrientationMode,
  type ThemePreference,
} from '../database/preferencesRepository';
import {
  clearTrips,
  getPendingSyncChangeCount,
  getTrips,
} from '../database/tripRepository';
import {
  startLiveDriveSession,
  stopLiveDriveSession,
  updateLiveDriveSession,
} from '../driveSurface/driveSurfaceStore';
import { registerCarTripController } from '../car/carActions';
import { buildDriveSurfaceSnapshot } from '../driveSurface/snapshot';
import type { Trip } from '../domain/trip';
import { useVelocitySensors } from '../hooks/useVelocitySensors';
import { usePersonalRecording } from '../recording/usePersonalRecording';
import { RecordingNotice } from '../recording/RecordingNotice';
import {
  hasCompletedLocalOnboarding,
  markLocalOnboardingComplete,
} from '../onboarding/onboardingStorage';
import { colors, fontFamilies, radii, spacing } from '../theme/paperTheme';
import { useThemedStyles } from '../theme/appTheme';
import {
  getNotificationPermissionState,
  registerForPushNotifications,
  scheduleTripSavedNotification,
  type NotificationPermissionState,
} from '../utils/notifications';
import {
  getSpeedometerScreenTitle,
  SPEEDOMETER_DRAWER_GROUPS,
  type SpeedometerScreen,
} from '../utils/speedometerMenu';
import { logAppWarning } from '../utils/logging';
import { toDisplayDistance, toDisplaySpeed, type Units } from '../utils/speedMath';

const MOUNT_OPTIONS = [
  { label: 'top', offset: 0 },
  { label: 'right', offset: 90 },
  { label: 'bottom', offset: 180 },
  { label: 'left', offset: -90 },
] as const;

const DRIVE_SURFACE_UPDATE_INTERVAL_MS = 1000;
const SIMULATED_DRIVE_ENABLED_BY_ENV =
  process.env.EXPO_PUBLIC_V3L0CITY_SIMULATED_DRIVE === '1';
const HEADER_HEIGHT = 56;
const LANDSCAPE_HEADER_HEIGHT = 48;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

type OrientationToggleIconProps = {
  target: 'portrait' | 'landscape';
  color: string;
  size?: number;
};

const OrientationToggleIcon = React.memo(
  function OrientationToggleIcon({
    target,
    color,
    size = 18,
  }: OrientationToggleIconProps) {
    const portrait = target === 'portrait';

    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {portrait ? (
          <>
            <Rect
              x={8}
              y={4}
              width={8}
              height={16}
              rx={2.4}
              fill="none"
              stroke={color}
              strokeWidth={2}
            />
            <Line
              x1={11}
              y1={17}
              x2={13}
              y2={17}
              stroke={color}
              strokeLinecap="round"
              strokeWidth={1.6}
            />
          </>
        ) : (
          <>
            <Rect
              x={4}
              y={8}
              width={16}
              height={8}
              rx={2.4}
              fill="none"
              stroke={color}
              strokeWidth={2}
            />
            <Line
              x1={17}
              y1={11}
              x2={17}
              y2={13}
              stroke={color}
              strokeLinecap="round"
              strokeWidth={1.6}
            />
          </>
        )}
      </Svg>
    );
  },
);

type SpeedometerProps = {
  themePreference: ThemePreference;
  onThemePreferenceChange: (preference: ThemePreference) => void;
};

export default function Speedometer({
  themePreference,
  onThemePreferenceChange,
}: SpeedometerProps) {
  const styles = useThemedStyles(createStyles);
  const [units, setUnits] = useState<Units>('km/h');
  const [mountIndex, setMountIndex] = useState(0);
  const [autoStart, setAutoStart] = useState(false);
  const [autoSave, setAutoSave] = useState(false);
  const [orientationMode, setOrientationMode] =
    useState<OrientationMode>('portrait');
  const [currentOrientation, setCurrentOrientation] = useState<
    'portrait' | 'landscape'
  >('portrait');
  const [dataHydrated, setDataHydrated] = useState(false);
  const [storageReadError, setStorageReadError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeScreen, setActiveScreen] =
    useState<SpeedometerScreen>('dashboard');
  const [accountEntryStep, setAccountEntryStep] =
    useState<AccountEntryStep>('landing');
  const [drawerAccountSummary, setDrawerAccountSummary] =
    useState<DrawerAccountSummary>({
      signedIn: false,
      title: 'Offline mode',
      subtitle: 'Local trips stay on this device',
    });
  const [localOnboardingComplete, setLocalOnboardingComplete] = useState<
    boolean | null
  >(null);
  const [showSettings, setShowSettings] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState<boolean>(__DEV__);
  const [simulationEnabled, setSimulationEnabled] = useState<boolean>(
    __DEV__ && SIMULATED_DRIVE_ENABLED_BY_ENV,
  );
  const [toastMessage, setToastMessage] = useState<AppToastMessage | null>(
    null,
  );
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermissionState>('undetermined');

  const dimensions = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pulseAnim = useRef(new RNAnimated.Value(1)).current;
  const prevStatus = useRef<string | null>(null);
  const orientationListener = useRef<ScreenOrientation.Subscription | null>(
    null,
  );
  const hasAutoStartedThisSession = useRef(false);
  const lastDriveSurfaceWriteAt = useRef(0);
  const liveDriveSessionActive = useRef(false);
  const surfaceGeneration = useRef(0);
  const latestSurfaceSnapshot = useRef<ReturnType<typeof buildDriveSurfaceSnapshot> | null>(null);
  const recording = usePersonalRecording({
    started: (trip) => tripTelemetryService.startTrip(trip),
    sample: (sample) => tripTelemetryService.recordSample(sample),
    completed: (trip) => {
      // Each side effect is independent of the committed local save and of the
      // other effects. Hung native/network promises cannot strand the HUD.
      surfaceGeneration.current++;
      liveDriveSessionActive.current = false;
      const snapshot = latestSurfaceSnapshot.current;
      if (snapshot) void stopLiveDriveSession({ ...snapshot, tripActive: false, tripPaused: false,
        stale: true, signalText: 'Trip saved', updatedAtMs: Date.now() })
        .catch((error) => logAppWarning('drive-surface', error));
      void syncSavedTripIfAllowed();
      void tripTelemetryService.completeTrip(trip).catch((error) => logAppWarning('telemetry', error));
      void scheduleTripSavedNotification(trip).catch((error) => logAppWarning('notifications', error));
      void getTrips().then(setTrips).catch((error) => {
        logAppWarning('storage', error);
        setStorageReadError('Saved trip history could not be loaded. Retry reading this device.');
      });
    },
    failed: (error) => logAppWarning('storage', error),
  });
  const isTripActive = recording.active;
  const isTripPaused = recording.active && (recording.session?.state === 'paused' || recording.error != null);
  const recordedStartedAt = recording.session?.trip.startedAt;
  const currentTripStart = useMemo(() => recording.active && recordedStartedAt
    ? new Date(recordedStartedAt) : null, [recording.active, recordedStartedAt]);

  useEffect(() => {
    if (isTripActive) {
      const loop = RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(pulseAnim, {
            toValue: 0.38,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          RNAnimated.timing(pulseAnim, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    pulseAnim.setValue(1);
  }, [isTripActive, pulseAnim]);

  const mountOffset = MOUNT_OPTIONS[mountIndex].offset;
  const mountLabel = MOUNT_OPTIONS[mountIndex].label;
  const { state, reset } = useVelocitySensors({
    mountOffsetDegrees: mountOffset,
    accumulateTrip: recording.accumulating,
    simulationEnabled: __DEV__ && simulationEnabled,
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
  } = useMemo(
    () => ({
      speedMps: state.speedMps,
      averageSpeedMps: state.averageSpeedMps,
      maxSpeedMps: state.maxSpeedMps,
      distanceMeters: state.distanceMeters,
      headingDegrees: state.headingDegrees,
      errorMessage: state.errorMessage,
      quality: state.quality,
      status: state.status,
    }),
    [state],
  );

  const isLandscapeLayout =
    orientationMode === 'landscape' ||
    (orientationMode === 'auto' && currentOrientation === 'landscape');
  const headerHeight = isLandscapeLayout
    ? LANDSCAPE_HEADER_HEIGHT
    : HEADER_HEIGHT;
  const bodyHeight = Math.max(
    280,
    dimensions.height - insets.top - insets.bottom - headerHeight,
  );
  const portraitDialSize = clamp(
    Math.min(dimensions.width * 0.68, bodyHeight * 0.38),
    212,
    272,
  );
  const portraitCompassWidth = clamp(dimensions.width - spacing.xl, 280, 392);
  const portraitMiniCompassSize = clamp(dimensions.width * 0.29, 98, 126);
  const landscapeDialSize = clamp(
    Math.min(dimensions.width * 0.36, bodyHeight - spacing.lg),
    156,
    236,
  );
  const landscapeCompassWidth = clamp(dimensions.width * 0.42, 250, 392);
  const landscapeMiniCompassSize = clamp(bodyHeight * 0.28, 72, 104);
  const settingsMaxHeight = Math.max(
    320,
    dimensions.height - insets.top - spacing.lg,
  );

  const displayedTrip = isTripActive ? recording.session?.trip : recording.lastCompleted;
  const effectiveDistanceMeters = displayedTrip?.totalDistanceMeters ?? distanceMeters;
  const effectiveMaxSpeedMps = displayedTrip?.maxSpeedMps ?? maxSpeedMps;
  const effectiveAverageSpeedMps = displayedTrip?.averageSpeedMps ?? averageSpeedMps;

  const speedDisplay = toDisplaySpeed(speedMps, units);
  const averageDisplay = toDisplaySpeed(effectiveAverageSpeedMps, units);
  const maxDisplay = toDisplaySpeed(effectiveMaxSpeedMps, units);
  const distanceDisplay = toDisplayDistance(effectiveDistanceMeters, units);
  const maxDisplayRounded = Math.round(maxDisplay);
  const formattedElapsed = new Date(Math.max(0, elapsedMs)).toISOString().substring(11, 19);
  const driveSurfaceSnapshot = useMemo(
    () =>
      buildDriveSurfaceSnapshot({
        state,
        units,
        tripId: isTripActive ? recording.session?.trip.id ?? null : null,
        tripActive: isTripActive,
        tripPaused: isTripPaused,
        distanceMeters: effectiveDistanceMeters,
        averageSpeedMps: effectiveAverageSpeedMps,
        maxSpeedMps: effectiveMaxSpeedMps,
        elapsedMs,
        simulationActive: __DEV__ && simulationEnabled,
      }),
    [
      elapsedMs,
      effectiveAverageSpeedMps,
      effectiveDistanceMeters,
      effectiveMaxSpeedMps,
      isTripActive,
      isTripPaused,
      simulationEnabled,
      state,
      units,
      recording.session?.trip.id,
    ],
  );
  latestSurfaceSnapshot.current = driveSurfaceSnapshot;

  const isPoorSignal = quality === 'poor';
  const isPermissionError = status === 'permission_denied';
  const isPreciseLocationError = status === 'precise_location_required';
  const isSensorUnavailable = status === 'sensor_unavailable';

  const applyOrientation = useCallback(async (mode: OrientationMode) => {
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
        const landscape =
          orientationInfo === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
          orientationInfo === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
        setCurrentOrientation(landscape ? 'landscape' : 'portrait');
      }
    } catch {
      // Ignore orientation errors on unsupported platforms.
    }
  }, []);

  const refreshDrawerAccountSummary = useCallback(async () => {
    try {
      const pendingCount = await getPendingSyncChangeCount();
      if (!isCloudConfigured()) {
        setDrawerAccountSummary({
          signedIn: false,
          title: 'Offline build',
          subtitle:
            pendingCount > 0
              ? `${pendingCount} local change${
                  pendingCount === 1 ? '' : 's'
                } saved`
              : 'Cloud backup is not configured',
        });
        return;
      }

      const session = await cloudAuth.getSession();
      if (!session) {
        setDrawerAccountSummary({
          signedIn: false,
          title: 'Offline mode',
          subtitle:
            pendingCount > 0
              ? `${pendingCount} local change${
                  pendingCount === 1 ? '' : 's'
                } saved`
              : 'Sign in for cloud backup',
        });
        return;
      }

      const profile = await cloudAuth.getProfile();
      const title = profile?.displayName || profile?.username || session.email;
      const backupText = profile?.syncEnabled
        ? 'Automatic backup on'
        : 'Automatic backup off';
      setDrawerAccountSummary({
        signedIn: true,
        title: title ?? 'Signed in',
        subtitle:
          pendingCount > 0
            ? `${backupText} • ${pendingCount} pending`
            : backupText,
      });
    } catch (error) {
      logAppWarning('account', error);
      setDrawerAccountSummary({
        signedIn: false,
        title: 'Offline mode',
        subtitle: 'Account status unavailable',
      });
    }
  }, []);

  const loadPersonalData = useCallback(async () => {
    setDataHydrated(false);
    try {
      const [prefs, storedTrips, completedLocalOnboarding] = await Promise.all([
        getPreferences(),
        getTrips(),
        hasCompletedLocalOnboarding(),
      ]);
      setLocalOnboardingComplete(completedLocalOnboarding);
      if (!completedLocalOnboarding) {
        setActiveScreen('onboarding');
      }
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
      setStorageReadError(null);
      setDataHydrated(true);
    } catch (error) {
      logAppWarning('storage', error);
      setStorageReadError('Personal data could not be read. Retry before starting a recording.');
    }
  }, [applyOrientation]);
  useEffect(() => {
    void loadPersonalData();
    void refreshDrawerAccountSummary();
  }, [loadPersonalData, refreshDrawerAccountSummary]);
  const recoveredUnits = recording.session?.trip.units;
  const recoveredMountLabel = recording.session?.trip.mountLabel;
  useEffect(() => {
    if (!dataHydrated || !recording.recovered || !recoveredUnits) return;
    setUnits(recoveredUnits);
    const index = MOUNT_OPTIONS.findIndex((option) => option.label === recoveredMountLabel);
    if (index >= 0) setMountIndex(index);
  }, [dataHydrated, recording.recovered, recoveredUnits, recoveredMountLabel]);

  useEffect(() => {
    if (drawerOpen) {
      void refreshDrawerAccountSummary();
    }
  }, [drawerOpen, refreshDrawerAccountSummary]);

  useEffect(() => {
    if (!dataHydrated) return;
    const persist = async () => {
      try { await savePreferences({
        units,
        mountIndex,
        autoStart,
        autoSave,
        orientationMode,
        themePreference,
      }); } catch (error) {
        logAppWarning('storage', error);
        setStorageReadError('Preferences could not be saved. Retry reading this device.');
        setDataHydrated(false);
      }
    };
    void persist();
  }, [
    units,
    mountIndex,
    autoStart,
    autoSave,
    orientationMode,
    themePreference,
    dataHydrated,
  ]);

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
        const landscape =
          info === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
          info === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
        setCurrentOrientation(landscape ? 'landscape' : 'portrait');

        const sub = ScreenOrientation.addOrientationChangeListener((event) => {
          const orientation = event.orientationInfo.orientation;
          const nextLandscape =
            orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
            orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
          setCurrentOrientation(nextLandscape ? 'landscape' : 'portrait');
        });
        orientationListener.current = sub;
      } catch {
        // Ignore orientation errors on unsupported platforms.
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

  const showToast = useCallback(
    (message: string, variant: AppToastVariant = 'info') => {
      setToastMessage({ message, variant });
    },
    [],
  );

  const refreshNotificationPermission = useCallback(async () => {
    const permission = await getNotificationPermissionState();
    setNotificationPermission(permission);
  }, []);

  useEffect(() => {
    void refreshNotificationPermission();
  }, [refreshNotificationPermission]);

  const handleEnableNotifications = useCallback(async () => {
    const result = await registerForPushNotifications();
    setNotificationPermission(result.permission);
    showToast(
      result.message,
      result.ok
        ? result.expoPushToken
          ? 'success'
          : 'warning'
        : 'error',
    );
  }, [showToast]);

  const syncSavedTripIfAllowed = useCallback(async () => {
    if (!isCloudConfigured()) {
      return;
    }

    try {
      const session = await cloudAuth.getSession();
      if (!session) {
        return;
      }
      const profile = await cloudAuth.getProfile();
      if (!profile?.syncEnabled) {
        return;
      }
      const result = await syncLocalChanges();
      if (!result.ok) {
        logAppWarning('sync', result.message);
      }
      await refreshDrawerAccountSummary();
    } catch (error) {
      logAppWarning('sync', error);
    }
  }, [refreshDrawerAccountSummary]);

  const startTrip = useCallback(async () => {
    if (!dataHydrated || isPermissionError || isPreciseLocationError || isSensorUnavailable) return false;
    const started = await recording.controller.start({ units, mountLabel });
    if (started) hasAutoStartedThisSession.current = true;
    return started;
  }, [dataHydrated, isPermissionError, isPreciseLocationError, isSensorUnavailable, recording.controller, units, mountLabel]);

  const stopAndSaveTrip = useCallback(() => recording.controller.finish(), [recording.controller]);

  const handleTripToggle = async () => {
    if (!isTripActive) {
      if (await startTrip()) showToast('Trip started', 'success');
      return;
    }

    if (await stopAndSaveTrip()) showToast('Trip saved', 'success');
  };

  const handleReset = () => {
    reset();
    recording.controller.clearLastCompleted();
    setElapsedMs(0);
  };

  const pauseTripFromCar = useCallback(async () => {
    if (await recording.controller.pause()) showToast('Trip paused', 'warning');
  }, [recording.controller, showToast]);

  const resumeTripFromCar = useCallback(async () => {
    if (isPermissionError || isPreciseLocationError || isSensorUnavailable) {
      return;
    }
    if (await recording.controller.resume()) showToast('Trip resumed', 'success');
  }, [
    isPermissionError,
    isPreciseLocationError,
    isSensorUnavailable,
    recording.controller,
    showToast,
  ]);

  useEffect(
    () =>
      registerCarTripController({
        getStatus: () => {
          const blocked =
            isPermissionError || isPreciseLocationError || isSensorUnavailable;
          return {
            available: dataHydrated && recording.ready && !recording.busy && !recording.error,
            tripActive: isTripActive,
            tripPaused: isTripPaused,
            canStart: dataHydrated && recording.ready && !recording.busy && !recording.error && !isTripActive && !blocked,
            canPause: isTripActive && !isTripPaused && !recording.busy && !recording.error,
            canResume: isTripActive && isTripPaused && !blocked && !recording.busy && !recording.error,
            canStop: isTripActive && !recording.busy && !recording.error,
            unavailableReason: blocked
              ? 'Check location and sensor permissions on your phone.'
              : undefined,
          };
        },
        startTrip: async () => {
          if (await startTrip()) showToast('Trip started', 'success');
        },
        pauseTrip: pauseTripFromCar,
        resumeTrip: resumeTripFromCar,
        stopAndSaveTrip: async () => {
          if (await stopAndSaveTrip()) showToast('Trip saved', 'success');
        },
      }),
    [
      isPermissionError,
      isPreciseLocationError,
      isSensorUnavailable,
      isTripActive,
      isTripPaused,
      pauseTripFromCar,
      resumeTripFromCar,
      showToast,
      startTrip,
      stopAndSaveTrip,
      dataHydrated,
      recording.ready,
      recording.busy,
      recording.error,
    ],
  );

  const handleSimulationToggle = (enabled: boolean) => {
    setSimulationEnabled(enabled);
    reset();
    setElapsedMs(0);
    showToast(
      enabled ? 'Drive simulator started' : 'Drive simulator stopped',
      'info',
    );
  };

  const handleClearHistory = async () => {
    try {
      await clearTrips();
      setTrips(await getTrips());
      setStorageReadError(null);
    } catch (error) {
      logAppWarning('storage', error);
      setStorageReadError('History could not be cleared or refreshed. Retry reading this device.');
    }
  };

  const openDrawer = () => setDrawerOpen(true);
  const closeDrawer = () => setDrawerOpen(false);
  const returnToDashboard = useCallback(() => {
    setActiveScreen(
      localOnboardingComplete === false ? 'onboarding' : 'dashboard',
    );
  }, [localOnboardingComplete]);

  const completeLocalOnboarding = useCallback(
    async (nextScreen: SpeedometerScreen = 'dashboard') => {
      await markLocalOnboardingComplete();
      setLocalOnboardingComplete(true);
      setActiveScreen(nextScreen);
    },
    [],
  );

  const handleDrawerHistory = () => {
    setActiveScreen('history');
    closeDrawer();
  };

  const handleDrawerInsights = () => {
    setActiveScreen('insights');
    closeDrawer();
  };

  const handleDrawerLeaderboards = () => {
    setActiveScreen('leaderboards');
    closeDrawer();
  };

  const handleDrawerFriends = () => {
    setActiveScreen('friends');
    closeDrawer();
  };

  const handleDrawerAccount = () => {
    setAccountEntryStep('landing');
    setActiveScreen('account');
    closeDrawer();
  };

  const handleDrawerPrivacy = () => {
    setActiveScreen('privacy');
    closeDrawer();
  };

  const handleOnboardingAccountChoice = useCallback(
    async (entryStep: AccountEntryStep) => {
      setAccountEntryStep(entryStep);
      await completeLocalOnboarding('account');
    },
    [completeLocalOnboarding],
  );

  const handleDrawerSettings = () => {
    setShowSettings(true);
    closeDrawer();
  };

  const handleExportJson = async () => {
    closeDrawer();
    try {
      await exportAsJson();
    } catch {
      showToast('Export failed', 'error');
    }
  };

  const handleExportCsv = async () => {
    closeDrawer();
    try {
      await exportAsCsv();
    } catch {
      showToast('Export failed', 'error');
    }
  };

  const handleImportJson = async () => {
    closeDrawer();
    try {
      const result = await pickAndImportJsonExport();
      if (!result) {
        return;
      }

      const [storedTrips, prefs] = await Promise.all([
        getTrips(),
        getPreferences(),
      ]);
      setTrips(storedTrips);
      if (prefs) {
        setUnits(prefs.units);
        if (prefs.mountIndex >= 0 && prefs.mountIndex < MOUNT_OPTIONS.length) {
          setMountIndex(prefs.mountIndex);
        }
        setAutoStart(prefs.autoStart);
        setAutoSave(prefs.autoSave);
        setOrientationMode(prefs.orientationMode);
        onThemePreferenceChange(prefs.themePreference);
        await applyOrientation(prefs.orientationMode);
      }

      showToast(result.message, 'success');
      void syncSavedTripIfAllowed();
      void refreshDrawerAccountSummary();
    } catch (error) {
      logAppWarning('import', error);
      showToast('Import failed. Choose a valid V3l0city JSON export.', 'error');
    }
  };

  const drawerItemHandlers = {
    history: handleDrawerHistory,
    insights: handleDrawerInsights,
    leaderboards: handleDrawerLeaderboards,
    friends: handleDrawerFriends,
    account: handleDrawerAccount,
    privacy: handleDrawerPrivacy,
    settings: handleDrawerSettings,
    importJson: handleImportJson,
    json: handleExportJson,
    csv: handleExportCsv,
  };
  const drawerGroups = SPEEDOMETER_DRAWER_GROUPS.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      description:
        item.key === 'account'
          ? drawerAccountSummary.subtitle
          : item.description,
      onPress: drawerItemHandlers[item.key],
    })),
  }));

  const canReset = !isTripActive && effectiveDistanceMeters > 0;

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (showSettings) {
          setShowSettings(false);
          return true;
        }

        if (drawerOpen) {
          return false;
        }

        if (activeScreen !== 'dashboard') {
          returnToDashboard();
          return true;
        }

        return false;
      },
    );

    return () => subscription.remove();
  }, [activeScreen, drawerOpen, returnToDashboard, showSettings]);

  const toggleOrientationMode = useCallback(() => {
    const nextMode: OrientationMode = isLandscapeLayout
      ? 'portrait'
      : 'landscape';
    setOrientationMode(nextMode);
    void applyOrientation(nextMode);
  }, [applyOrientation, isLandscapeLayout]);

  const renderLandscapeOrientationButton = () => {
    if (isDetailScreen || !isLandscapeLayout) {
      return null;
    }

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Switch to portrait"
        onPress={toggleOrientationMode}
        style={[
          styles.landscapeOrientationButton,
          {
            top: insets.top + LANDSCAPE_HEADER_HEIGHT + spacing.sm,
            right: Math.max(insets.right, spacing.sm),
          },
        ]}
      >
        <OrientationToggleIcon
          target="portrait"
          color={colors.textPrimary}
          size={22}
        />
      </Pressable>
    );
  };

  useEffect(() => {
    void recording.controller.observe(state);
  }, [recording.controller, state]);

  useEffect(() => {
    if (!isTripActive || !currentTripStart) {
      setElapsedMs(0);
      return;
    }

    const update = () => {
      setElapsedMs(Math.max(0, Date.now() - currentTripStart.getTime()));
    };

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [isTripActive, currentTripStart]);

  useEffect(() => {
    if (!isTripActive && state.isStopped) hasAutoStartedThisSession.current = false;
  }, [isTripActive, state.isStopped]);

  useEffect(() => {
    if (
      autoStart &&
      !isTripActive &&
      !isPermissionError &&
      !isPreciseLocationError &&
      !isSensorUnavailable &&
      dataHydrated && recording.ready && !recording.busy && !recording.error &&
      state.isMoving &&
      !hasAutoStartedThisSession.current
    ) {
      void startTrip().then((started) => { if (started) showToast('Trip autostarted', 'success'); });
    }
  }, [
    autoStart,
    isTripActive,
    isPermissionError,
    isPreciseLocationError,
    isSensorUnavailable,
    showToast,
    startTrip,
    state.isMoving,
    dataHydrated, recording.ready, recording.busy, recording.error,
  ]);

  useEffect(() => {
    if (
      autoStart &&
      isTripActive &&
      !isTripPaused &&
      !isPermissionError &&
      !isPreciseLocationError &&
      !isSensorUnavailable &&
      state.isStopped
    ) {
      void recording.controller.pause('paused', true).then((paused) => { if (paused) showToast('Trip paused', 'warning'); });
    }
  }, [
    autoStart,
    isTripActive,
    isTripPaused,
    isPermissionError,
    isPreciseLocationError,
    isSensorUnavailable,
    showToast,
    state.isStopped,
    recording.controller,
  ]);

  useEffect(() => {
    if (
      autoStart &&
      isTripActive &&
      isTripPaused &&
      recording.autoPaused &&
      !isPermissionError &&
      !isPreciseLocationError &&
      !isSensorUnavailable &&
      state.isMoving
    ) {
      void recording.controller.resume().then((resumed) => { if (resumed) showToast('Trip resumed', 'success'); });
    }
  }, [
    autoStart,
    isTripActive,
    isTripPaused,
    isPermissionError,
    isPreciseLocationError,
    isSensorUnavailable,
    showToast,
    state.isMoving,
    recording.controller, recording.autoPaused,
  ]);

  useEffect(() => {
    const now = Date.now();
    if (now - lastDriveSurfaceWriteAt.current < DRIVE_SURFACE_UPDATE_INTERVAL_MS) {
      return;
    }
    lastDriveSurfaceWriteAt.current = now;
    const generation = ++surfaceGeneration.current;

    const publish = async () => {
      try {
        if (driveSurfaceSnapshot.tripActive && !driveSurfaceSnapshot.tripPaused) {
          if (liveDriveSessionActive.current) {
            await updateLiveDriveSession(driveSurfaceSnapshot);
          } else {
            liveDriveSessionActive.current = true;
            await startLiveDriveSession(driveSurfaceSnapshot);
          }
        } else if (liveDriveSessionActive.current) {
          liveDriveSessionActive.current = false;
          await stopLiveDriveSession(driveSurfaceSnapshot);
        } else {
          await updateLiveDriveSession(driveSurfaceSnapshot);
        }
        // A slow native start/update must not revive an already-saved session.
        const desired = latestSurfaceSnapshot.current;
        if (generation !== surfaceGeneration.current && desired
          && (!desired.tripActive || desired.tripPaused)) {
          await stopLiveDriveSession(desired);
        }
      } catch (error) {
        logAppWarning('drive-surface', error);
      }
    };

    void publish();
  }, [driveSurfaceSnapshot]);

  useEffect(() => {
    if (prevStatus.current === status) {
      return;
    }
    if (status === 'permission_denied') {
      showToast('Location permission denied', 'error');
    } else if (status === 'precise_location_required') {
      showToast('Precise location required', 'warning');
    } else if (status === 'sensor_unavailable') {
      showToast('Required sensors unavailable on this device', 'error');
    } else if (status === 'ready') {
      showToast('Sensors ready', 'success');
    }
    prevStatus.current = status;
  }, [showToast, status]);

  const renderStateMessage = () => {
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

    if (isPreciseLocationError) {
      return (
        <View style={styles.messageContainer}>
          <Text style={styles.messageTitle}>Precise Location Required</Text>
          <Text style={styles.messageBody}>
            Enable Precise Location on iOS, or precise/high accuracy location
            on Android, so V3l0city can calculate speed and vehicle direction.
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
            for V3l0city.
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

    return null;
  };

  const recordingNotice = <RecordingNotice recording={recording} readError={storageReadError}
    allowResume={dataHydrated && status === 'ready' && !isPermissionError && !isPreciseLocationError && !isSensorUnavailable}
    onResume={() => { void resumeTripFromCar(); }}
    onRetry={() => { void recording.controller.retry(); }}
    onReadRetry={() => { void loadPersonalData(); }} />;
  const tripActionDisabled = !dataHydrated || !recording.ready || recording.busy || !!recording.error
    || (!isTripActive && (isPermissionError || isPreciseLocationError || isSensorUnavailable));

  const renderTripButton = (compact = false) => (
    <View
      style={compact ? styles.landscapeTripButtonRow : styles.tripSection}
    >
      {isTripPaused && <Text style={styles.tripPausedLabel}>Trip paused</Text>}
      {recordingNotice}
      <PressableScale
        style={[
          compact ? styles.landscapeTripButton : styles.tripButton,
          isTripActive
            ? compact
              ? styles.landscapeTripButtonActive
              : styles.tripButtonActive
            : compact
              ? styles.landscapeTripButtonIdle
              : styles.tripButtonIdle,
        ]}
        onPress={handleTripToggle}
        disabled={tripActionDisabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: tripActionDisabled, busy: recording.busy }}
        pressedScale={compact ? 0.96 : 0.97}
      >
        {isTripActive && !isTripPaused && (
          <RNAnimated.View style={[styles.recordDot, { opacity: pulseAnim }]} />
        )}
        <Text
          style={[
            compact ? styles.landscapeTripButtonText : styles.tripButtonText,
            isTripActive && styles.tripButtonTextActive,
          ]}
        >
          {recording.busy ? 'Saving changes…' : isTripPaused
            ? 'Save & end'
            : isTripActive
              ? compact
                ? 'Stop & Save'
                : 'Stop & Save'
              : compact
                ? 'Start'
                : 'Start Trip'}
        </Text>
      </PressableScale>
      {isTripActive && !isTripPaused && <Button mode="text" onPress={() => { void pauseTripFromCar(); }}
        disabled={recording.busy || !!recording.error}>Pause recording</Button>}

      {!compact && canReset && (
        <PressableScale style={styles.resetButton} onPress={handleReset}>
          <Text style={styles.resetText}>Reset</Text>
        </PressableScale>
      )}
    </View>
  );

  const renderPortraitDashboard = () => {
    const stateMessage = renderStateMessage();
    if (stateMessage) return <ScrollView>{stateMessage}{renderTripButton(false)}</ScrollView>;

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
            size={portraitDialSize}
          />
        </View>

        {(!autoStart || isTripActive) ? renderTripButton(false) : recordingNotice}

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
            <Text style={[styles.statValue, styles.statValueMax]}>
              {maxDisplayRounded}
            </Text>
            <Text style={styles.statUnit}>{units}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>DIST</Text>
            <Text style={[styles.statValue, styles.statValueDistance]}>
              {distanceDisplay.toFixed(1)}
            </Text>
            <Text style={styles.statUnit}>
              {units === 'km/h' ? 'km' : 'mi'}
            </Text>
          </View>
        </View>

        <View style={styles.compassSection}>
          <HorizontalCompass
            heading={headingDegrees}
            width={portraitCompassWidth}
            headingAvailable={state.headingAvailable}
            headingSource={state.headingSource}
            headingQuality={state.headingQuality}
          />
          <View style={styles.miniCompassRow}>
            <MiniCompass
              heading={headingDegrees}
              size={portraitMiniCompassSize}
              headingAvailable={state.headingAvailable}
              headingSource={state.headingSource}
              headingQuality={state.headingQuality}
            />
          </View>
        </View>
      </ScrollView>
    );
  };

  const renderLandscapeDashboard = () => {
    const stateMessage = renderStateMessage();
    if (stateMessage) return <ScrollView>{stateMessage}{renderTripButton(true)}</ScrollView>;

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
            size={landscapeDialSize}
          />
        </View>

        <View style={styles.landscapeRight}>
          <View style={styles.landscapeStatsGrid}>
            <View style={styles.landscapeStat}>
              <Text style={styles.landscapeStatLabel}>Duration</Text>
              <Text style={styles.landscapeStatValue}>{formattedElapsed}</Text>
            </View>
            <View style={styles.landscapeStat}>
              <Text style={styles.landscapeStatLabel}>Maximum</Text>
              <Text style={[styles.landscapeStatValue, styles.statValueMax]}>
                {maxDisplayRounded} {units}
              </Text>
            </View>
            <View style={styles.landscapeStat}>
              <Text style={styles.landscapeStatLabel}>Distance</Text>
              <Text
                style={[
                  styles.landscapeStatValue,
                  styles.statValueDistance,
                ]}
              >
                {distanceDisplay.toFixed(1)} {units === 'km/h' ? 'km' : 'mi'}
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
            <HorizontalCompass
              heading={headingDegrees}
              width={landscapeCompassWidth}
              headingAvailable={state.headingAvailable}
              headingSource={state.headingSource}
              headingQuality={state.headingQuality}
            />
            <View style={styles.landscapeMiniCompassRow}>
              <MiniCompass
                heading={headingDegrees}
                size={landscapeMiniCompassSize}
                headingAvailable={state.headingAvailable}
                headingSource={state.headingSource}
                headingQuality={state.headingQuality}
              />
            </View>
          </View>

          {(!autoStart || isTripActive) ? renderTripButton(true) : recordingNotice}
        </View>
      </View>
    );
  };

  const renderSettings = () => (
    <Modal
      visible={showSettings}
      onDismiss={() => setShowSettings(false)}
      contentContainerStyle={[
        styles.settingsSheet,
        {
          maxHeight: settingsMaxHeight,
          paddingBottom: insets.bottom + spacing.lg,
        },
      ]}
    >
      <View style={styles.settingsHandle} />
      <View style={styles.settingsHeader}>
        <Text style={styles.settingsTitle}>Settings</Text>
        <IconButton
          accessibilityLabel="Close settings"
          icon="close"
          iconColor={colors.textSecondary}
          size={22}
          onPress={() => setShowSettings(false)}
          style={styles.sheetCloseButton}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.settingsContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.settingsRow}>
          <Text style={styles.settingsLabel}>Appearance</Text>
          <SegmentedButtons
            value={themePreference}
            onValueChange={(value) =>
              onThemePreferenceChange(value as ThemePreference)
            }
            buttons={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
          <Text style={styles.settingsHelper}>
            System follows your phone’s Light or Dark appearance. This setting
            stays on this device and does not require a device permission.
          </Text>
        </View>

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
          <Text style={styles.settingsLabel}>Trip recovery</Text>
          <Text style={styles.settingsHelper}>
            Native live tracking can continue in the background. Missing sample
            intervals are marked. After reopening, unfinished trips return paused
            with the last data saved on this device; review them before resuming.
          </Text>
        </View>

        <View style={styles.settingsRow}>
          <Text style={styles.settingsLabel}>Live widgets</Text>
          <Button
            mode="contained-tonal"
            icon="cellphone-cog"
            compact
            onPress={() => void Linking.openSettings()}
            style={styles.notificationButton}
          >
            Open app permissions
          </Button>
          <Text style={styles.settingsHelper}>
            Live surfaces need location access. iPhone uses Live Activities for
            true live speed; home-screen widgets show the latest state. Android
            keeps a quiet active-trip notification running so widgets can keep
            updating.
          </Text>
        </View>

        <View style={styles.settingsRow}>
          <View style={styles.settingsRowHeader}>
            <Text style={styles.settingsLabel}>Notifications</Text>
            <Text style={styles.settingsStatus}>
              {notificationPermission === 'granted'
                ? 'Enabled'
                : notificationPermission === 'denied'
                  ? 'Blocked'
                  : notificationPermission === 'unsupported'
                    ? 'Unavailable'
                    : 'Off'}
            </Text>
          </View>
          <Button
            mode="contained-tonal"
            icon="bell-outline"
            compact
            disabled={notificationPermission === 'granted'}
            onPress={handleEnableNotifications}
            style={styles.notificationButton}
          >
            {notificationPermission === 'granted'
              ? 'Notifications enabled'
              : 'Enable notifications'}
          </Button>
          <Text style={styles.settingsHelper}>
            Enables themed trip-saved alerts and registers this install for push
            notifications in development or production builds.
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
              { value: 'auto', label: 'Auto' },
            ]}
          />
          <Text style={styles.settingsHelper}>
            Lock V3l0city to a specific orientation or follow device
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

        {__DEV__ && (
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Drive Simulator</Text>
            <SegmentedButtons
              value={simulationEnabled ? 'on' : 'off'}
              onValueChange={(value) => handleSimulationToggle(value === 'on')}
              buttons={[
                { value: 'off', label: 'Off' },
                { value: 'on', label: 'On' },
              ]}
            />
          </View>
        )}

        <Button
          mode="contained-tonal"
          style={styles.settingsClose}
          onPress={() => setShowSettings(false)}
        >
          Done
        </Button>
      </ScrollView>
    </Modal>
  );

  const isOnboardingScreen = activeScreen === 'onboarding';
  const isBlockingOnboarding =
    isOnboardingScreen && localOnboardingComplete === false;
  const isDetailScreen = activeScreen !== 'dashboard';
  const screenTitle = getSpeedometerScreenTitle(activeScreen);

  return (
    <View style={styles.container}>
      <View style={[styles.headerWrapper, { paddingTop: insets.top }]}>
        <Appbar.Header
          style={[
            styles.appbar,
            { height: headerHeight },
            isLandscapeLayout && styles.appbarCompact,
          ]}
          mode="center-aligned"
        >
          {isBlockingOnboarding ? (
            <View style={styles.appbarActionSpacer} />
          ) : isDetailScreen ? (
            <Appbar.BackAction
              onPress={returnToDashboard}
              accessibilityLabel="Back to dashboard"
              color={colors.textSecondary}
            />
          ) : (
            <Appbar.Action
              icon="menu"
              iconColor={colors.textSecondary}
              onPress={openDrawer}
            />
          )}
          {isDetailScreen ? (
            <Appbar.Content
              title={screenTitle}
              titleStyle={styles.appbarTitle}
            />
          ) : (
            <View style={styles.appbarCenter}>
              <BrandMark size={isLandscapeLayout ? 30 : 34} />
            </View>
          )}
          {isBlockingOnboarding ? (
            <View style={styles.appbarActionSpacer} />
          ) : isDetailScreen ? (
            <Appbar.Action
              icon="close"
              iconColor={colors.textSecondary}
              accessibilityLabel="Close screen"
              onPress={returnToDashboard}
            />
          ) : isLandscapeLayout ? (
            <View style={styles.appbarActionSpacer} />
          ) : (
            <Pressable
              accessibilityLabel="Switch to landscape"
              accessibilityRole="button"
              onPress={toggleOrientationMode}
              style={styles.headerOrientationButton}
            >
              <OrientationToggleIcon
                target="landscape"
                color={colors.textSecondary}
                size={22}
              />
            </Pressable>
          )}
        </Appbar.Header>
      </View>

      <View style={styles.body}>
        {activeScreen === 'onboarding' ? (
          <OnboardingScreen
            cloudConfigured={isCloudConfigured()}
            onContinueOffline={() => void completeLocalOnboarding('dashboard')}
            onSignIn={() => void handleOnboardingAccountChoice('sign-in')}
            onSignUp={() => void handleOnboardingAccountChoice('sign-up')}
            onOpenPrivacy={() => setActiveScreen('privacy')}
          />
        ) : activeScreen === 'history' ? (
          <View style={{ flex: 1 }}>
            {recordingNotice}
            <TripHistory trips={trips} onClear={handleClearHistory} />
          </View>
        ) : activeScreen === 'insights' ? (
          <InsightsScreen units={units} />
        ) : activeScreen === 'leaderboards' ? (
          <LeaderboardsScreen units={units} />
        ) : activeScreen === 'friends' ? (
          <FindFriendsScreen units={units} />
        ) : activeScreen === 'account' ? (
          <AccountSyncScreen
            initialStep={accountEntryStep}
            onAuthenticated={() => {
              setActiveScreen('dashboard');
              showToast('Signed in', 'success');
              void refreshDrawerAccountSummary();
            }}
            onAccountChanged={() => void refreshDrawerAccountSummary()}
            onOpenPrivacy={() => setActiveScreen('privacy')}
          />
        ) : activeScreen === 'privacy' ? (
          <PrivacyPolicyScreen />
        ) : isLandscapeLayout ? (
          renderLandscapeDashboard()
        ) : (
          renderPortraitDashboard()
        )}
      </View>
      {renderLandscapeOrientationButton()}

      <Portal>
        <SideDrawer
          visible={drawerOpen}
          groups={drawerGroups}
          accountSummary={drawerAccountSummary}
          onDismiss={closeDrawer}
        />
        {renderSettings()}
        <AppToast
          toast={toastMessage}
          onDismiss={() => setToastMessage(null)}
          bottom={insets.bottom + spacing.sm}
        />
      </Portal>

      <DebugOverlay state={state} enabled={debugEnabled} />
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerWrapper: {
    backgroundColor: colors.background,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  appbar: {
    backgroundColor: 'transparent',
    elevation: 0,
  },
  appbarCompact: {
    minHeight: LANDSCAPE_HEADER_HEIGHT,
  },
  appbarActionSpacer: {
    height: 48,
    width: 48,
  },
  appbarCenter: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  headerOrientationButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 48,
  },
  appbarTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.displayBold,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  messageContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  messageTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.display,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  messageBody: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  errorText: {
    color: colors.danger,
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  dialContainer: {
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  tripSection: {
    alignItems: 'center',
    marginTop: spacing.xs,
    minHeight: 58,
  },
  tripPausedLabel: {
    color: colors.textMuted,
    fontFamily: fontFamilies.body,
    fontSize: 13,
    marginBottom: spacing.xs,
  },
  tripButton: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flexDirection: 'row',
    justifyContent: 'center',
    minWidth: 178,
    paddingHorizontal: spacing.xl,
    paddingVertical: 12,
  },
  tripButtonIdle: {
    backgroundColor: colors.accent,
  },
  tripButtonActive: {
    backgroundColor: colors.danger,
  },
  recordDot: {
    backgroundColor: colors.textPrimary,
    borderRadius: 4,
    height: 8,
    marginRight: spacing.sm,
    width: 8,
  },
  tripButtonText: {
    color: colors.onAccent,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0,
  },
  tripButtonTextActive: {
    color: colors.onDanger,
  },
  resetButton: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  resetText: {
    color: colors.textMuted,
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 13,
    fontWeight: '600',
  },
  statsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.lg,
    maxWidth: 440,
    paddingHorizontal: spacing.md,
    width: '100%',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statDivider: {
    backgroundColor: colors.border,
    height: 40,
    width: 1,
  },
  statLabel: {
    color: colors.textMuted,
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  statValue: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.numeric,
    fontSize: 26,
    fontWeight: '700',
  },
  statValueMax: {
    color: colors.brandGold,
  },
  statValueDistance: {
    color: colors.brandTeal,
  },
  statUnit: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.body,
    fontSize: 11,
    letterSpacing: 0,
    marginTop: 2,
  },
  compassSection: {
    alignItems: 'center',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.sm,
    width: '100%',
  },
  miniCompassRow: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  landscapeRoot: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  landscapeOrientationButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceVariant,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 42,
    justifyContent: 'center',
    position: 'absolute',
    width: 42,
    zIndex: 20,
  },
  landscapeLeft: {
    alignItems: 'center',
    flex: 0.95,
    justifyContent: 'center',
    minWidth: 0,
  },
  landscapeRight: {
    flex: 1.15,
    gap: spacing.sm,
    justifyContent: 'center',
    minWidth: 0,
  },
  landscapeStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'space-between',
  },
  landscapeStat: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    width: '48%',
  },
  landscapeStatLabel: {
    color: colors.textMuted,
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 10,
    marginBottom: 1,
  },
  landscapeStatValue: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.numeric,
    fontSize: 15,
    fontWeight: '700',
  },
  landscapeCompassBlock: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  landscapeMiniCompassRow: {
    alignItems: 'center',
  },
  landscapeTripButtonRow: {
    alignItems: 'center',
    minHeight: 42,
  },
  landscapeTripButton: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flexDirection: 'row',
    justifyContent: 'center',
    minWidth: 132,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
  },
  landscapeTripButtonIdle: {
    backgroundColor: colors.accent,
  },
  landscapeTripButtonActive: {
    backgroundColor: colors.danger,
  },
  landscapeTripButtonText: {
    color: colors.onAccent,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
  },
  settingsSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    bottom: 0,
    left: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    position: 'absolute',
    right: 0,
  },
  settingsHandle: {
    alignSelf: 'center',
    backgroundColor: colors.textMuted,
    borderRadius: 2,
    height: 4,
    marginBottom: spacing.sm,
    width: 36,
  },
  settingsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  settingsTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.display,
    fontSize: 19,
    fontWeight: '700',
  },
  sheetCloseButton: {
    margin: -spacing.xs,
  },
  settingsContent: {
    paddingBottom: spacing.sm,
  },
  settingsRow: {
    marginBottom: spacing.lg,
  },
  settingsRowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  settingsLabel: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
    marginBottom: spacing.xs,
  },
  settingsStatus: {
    color: colors.accent,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  settingsHelper: {
    color: colors.textMuted,
    fontFamily: fontFamilies.body,
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
  notificationButton: {
    alignSelf: 'flex-start',
    borderRadius: radii.sm,
  },
  settingsClose: {
    alignSelf: 'center',
    marginTop: spacing.xs,
    minWidth: 140,
  },
});
