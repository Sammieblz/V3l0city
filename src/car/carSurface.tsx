import { useEffect } from 'react';
import { AppRegistry, NativeModules, Platform } from 'react-native';

import CarDashboardSurface from './CarDashboardSurface';
import {
  getCarTripControllerStatus,
  requestCarTripAction,
  type CarTripAction,
} from './carActions';
import {
  readDriveSurfaceSnapshot,
} from '../driveSurface/driveSurfaceStore';
import {
  isDriveSurfaceSnapshotStale,
  type DriveSurfaceSnapshot,
} from '../driveSurface/snapshot';
import { colors, lightColors } from '../theme/paperTheme';

type CarPlayLibrary = typeof import('react-native-carplay');
type ListCarTemplate = InstanceType<CarPlayLibrary['ListTemplate']>;
type MapCarTemplate = InstanceType<CarPlayLibrary['MapTemplate']>;
type CarTemplate = ListCarTemplate | MapCarTemplate;
type CarTemplateMode = 'list' | 'rich';

let loadedCarPlay: Promise<CarPlayLibrary | null> | null = null;
let rootTemplate: CarTemplate | null = null;
let rootTemplateMode: CarTemplateMode | null = null;
let updateInterval: ReturnType<typeof setInterval> | null = null;
let initialRenderTimeout: ReturnType<typeof setTimeout> | null = null;
let registered = false;
let androidAutoRegistered = false;
let richDashboardRegistered = false;
let carButtonSubscription: { remove: () => void } | null = null;

const RICH_TEMPLATE_ID = 'V3l0cityCarDashboard';
const LIST_TEMPLATE_ID = 'v3l0city-car-dashboard';
const CAR_TOGGLE_ACTION_ID = 'v3l0city-car-toggle-trip';
const CAR_STOP_ACTION_ID = 'v3l0city-car-stop-save';

const richCarSurfaceEnabled =
  __DEV__ || process.env.EXPO_PUBLIC_V3L0CITY_RICH_CAR_SURFACE === '1';

const logCarSurface = (message: string): void => {
  if (__DEV__) {
    console.log(`[V3l0city][car] ${message}`);
  }
};

const loadCarPlay = async (): Promise<CarPlayLibrary | null> => {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return null;
  }
  if (!NativeModules.RNCarPlay) {
    logCarSurface('native module unavailable');
    return null;
  }
  if (loadedCarPlay) {
    return loadedCarPlay;
  }

  // react-native-carplay constructs a NativeEventEmitter at import time, so
  // keep this lazy for web/tests and builds without the native module.
  loadedCarPlay = import('react-native-carplay').catch(() => null);

  return loadedCarPlay;
};

const displaySnapshot = (
  snapshot: DriveSurfaceSnapshot | null,
): DriveSurfaceSnapshot | null => {
  if (!snapshot || isDriveSurfaceSnapshotStale(snapshot)) {
    return null;
  }
  return snapshot;
};

const statusFor = (snapshot: DriveSurfaceSnapshot | null): string => {
  if (!snapshot) {
    return 'Start a trip on your phone';
  }
  if (snapshot.tripPaused) {
    return 'Trip paused';
  }
  if (snapshot.tripActive) {
    return snapshot.simulationActive ? 'Simulated trip active' : 'Trip active';
  }
  return 'Ready';
};

const sourceLabel = (snapshot: DriveSurfaceSnapshot | null): string => {
  if (!snapshot) {
    return 'No live drive session';
  }
  if (snapshot.headingSource === 'course') {
    return 'GPS course';
  }
  if (snapshot.headingSource === 'device') {
    return 'Device compass';
  }
  return 'No heading';
};

const buildSections = (snapshot: DriveSurfaceSnapshot | null) => {
  const live = displaySnapshot(snapshot);
  const speed = live ? `${live.speedText} ${live.units}` : '--';
  const signal = live?.signalText ?? 'Open V3l0city';
  const heading = live?.headingText ?? '--';

  return [
    {
      header: 'Drive',
      items: [
        {
          text: speed,
          detailText: live
            ? `${statusFor(live)} • ${signal}`
            : 'Start or resume a trip in V3l0city.',
          enabled: false,
        },
        {
          text: 'Elapsed',
          detailText: live?.elapsedText ?? '--',
          enabled: false,
        },
      ],
    },
    {
      header: 'Stats',
      items: [
        {
          text: 'Average',
          detailText: live ? `${live.averageSpeedText} ${live.units}` : '--',
          enabled: false,
        },
        {
          text: 'Maximum',
          detailText: live ? `${live.maxSpeedText} ${live.units}` : '--',
          enabled: false,
        },
        {
          text: 'Distance',
          detailText: live?.distanceText ?? '--',
          enabled: false,
        },
      ],
    },
    {
      header: 'Direction',
      items: [
        {
          text: heading,
          detailText: `${sourceLabel(live)} • ${live?.headingQuality ?? 'poor'}`,
          enabled: false,
        },
      ],
    },
  ];
};

const buildTemplateConfig = (snapshot: DriveSurfaceSnapshot | null) => {
  const sections = buildSections(snapshot);
  const items = sections.flatMap((section) => section.items);
  return {
    id: LIST_TEMPLATE_ID,
    title: 'V3l0city',
    sections,
    items,
    emptyViewTitleVariants: ['Start a trip on your phone'],
    emptyViewSubtitleVariants: ['Live speed appears here during active trips.'],
    headerAction: {
      type: 'appIcon' as const,
    },
  };
};

const resolveNativeCarAction = (buttonId: string): CarTripAction | null => {
  if (buttonId === CAR_STOP_ACTION_ID) {
    return 'stop-save';
  }
  if (buttonId !== CAR_TOGGLE_ACTION_ID) {
    return null;
  }

  const status = getCarTripControllerStatus();
  if (!status.tripActive) {
    return 'start';
  }
  return status.tripPaused ? 'resume' : 'pause';
};

const handleNativeCarAction = (buttonId: string): void => {
  const action = resolveNativeCarAction(buttonId);
  if (!action) {
    return;
  }
  void requestCarTripAction(action);
};

const buildRichTemplateConfig = () => ({
  id: RICH_TEMPLATE_ID,
  component: CarDashboardSurface,
  guidanceBackgroundColor: colors.background,
  tripEstimateStyle:
    colors.background === lightColors.background ? ('light' as const) : ('dark' as const),
  automaticallyHidesNavigationBar: true,
  hidesButtonsWithNavigationBar: true,
  onDidAppear: () => {
    logCarSurface('rich map template appeared');
  },
  actions: [
    {
      id: CAR_TOGGLE_ACTION_ID,
      title: 'Trip',
      type: 'custom' as const,
      visibility: 'primary' as const,
      backgroundColor: colors.accent,
    },
    {
      id: CAR_STOP_ACTION_ID,
      title: 'Save',
      type: 'custom' as const,
      visibility: 'persistent' as const,
      backgroundColor: colors.surfaceVariant,
    },
  ],
});

const renderCarSurface = async (): Promise<void> => {
  try {
    const car = await loadCarPlay();
    if (!car) {
      return;
    }

    const snapshot = await readDriveSurfaceSnapshot().catch((error) => {
      logCarSurface(`snapshot read failed: ${String(error)}`);
      return null;
    });

    if (!rootTemplate) {
      if (richCarSurfaceEnabled) {
        logCarSurface('setting rich map root template');
        rootTemplate = new car.MapTemplate(buildRichTemplateConfig());
        rootTemplateMode = 'rich';
        car.CarPlay.setRootTemplate(rootTemplate, false);
        return;
      }

      const config = buildTemplateConfig(snapshot);
      logCarSurface('setting list root template');
      rootTemplate = new car.ListTemplate(config);
      rootTemplateMode = 'list';
      car.CarPlay.setRootTemplate(rootTemplate, false);
      return;
    }

    if (rootTemplateMode === 'list') {
      const config = buildTemplateConfig(snapshot);
      (rootTemplate as ListCarTemplate).updateSections(config.sections);
    }
  } catch (error) {
    logCarSurface(`render failed: ${String(error)}`);
  }
};

const startCarSurfaceLoop = (): void => {
  if (updateInterval) {
    return;
  }

  if (initialRenderTimeout) {
    clearTimeout(initialRenderTimeout);
  }
  initialRenderTimeout = setTimeout(() => {
    initialRenderTimeout = null;
    void renderCarSurface();
  }, 150);

  updateInterval = setInterval(() => {
    void renderCarSurface();
  }, 1000);
};

const stopCarSurfaceLoop = (): void => {
  if (initialRenderTimeout) {
    clearTimeout(initialRenderTimeout);
    initialRenderTimeout = null;
  }
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
  rootTemplate = null;
  rootTemplateMode = null;
};

const AndroidAuto = () => {
  useEffect(() => {
    startCarSurfaceLoop();
    return stopCarSurfaceLoop;
  }, []);

  return null;
};

export const registerCarSurfaces = (): void => {
  if (Platform.OS === 'ios') {
    // iOS CarPlay uses a native UIKit dashboard from AppDelegate. Starting a
    // second React Native root inside CPWindow crashes CarPlayTemplateUIHost on
    // current iOS simulators, so keep this JS surface Android-only.
    return;
  }

  if (Platform.OS !== 'android') {
    return;
  }

  if (!androidAutoRegistered) {
    androidAutoRegistered = true;
    AppRegistry.registerComponent('AndroidAuto', () => AndroidAuto);
  }
  if (!richDashboardRegistered) {
    richDashboardRegistered = true;
    AppRegistry.registerComponent(RICH_TEMPLATE_ID, () => CarDashboardSurface);
  }

  void loadCarPlay().then((car) => {
    if (!car || registered) {
      return;
    }

    registered = true;
    if (!carButtonSubscription) {
      carButtonSubscription = car.CarPlay.emitter.addListener(
        'buttonPressed',
        (event: { buttonId?: string; id?: string }) => {
          const buttonId = event.buttonId ?? event.id;
          if (buttonId) {
            handleNativeCarAction(buttonId);
          }
        },
      );
    }

    car.CarPlay.registerOnConnect(() => {
      logCarSurface('connected');
      startCarSurfaceLoop();
    });
    car.CarPlay.registerOnDisconnect(() => {
      logCarSurface('disconnected');
      stopCarSurfaceLoop();
    });

    // The library checks for an existing CarPlay connection during import,
    // before our callbacks are registered. Re-check now so simulator launches
    // that connected first still receive a template.
    car.CarPlay.bridge.checkForConnection?.();
    setTimeout(() => {
      car.CarPlay.bridge.checkForConnection?.();
    }, 250);

    if (car.CarPlay.connected) {
      startCarSurfaceLoop();
    }
  });
};
