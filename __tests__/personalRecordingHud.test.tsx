import React from 'react';
import { Text } from 'react-native';
import { Button } from 'react-native-paper';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import Speedometer from '../src/components/speedometer';
import PressableScale from '../src/components/PressableScale';
import { RecordingNotice } from '../src/recording/RecordingNotice';
import { getPreferences, savePreferences } from '../src/database/preferencesRepository';
import * as repository from '../src/database/tripRepository';
import { startLiveDriveSession, stopLiveDriveSession } from '../src/driveSurface/driveSurfaceStore';
import { tripTelemetryService } from '../src/api/tripTelemetryService';
import { scheduleTripSavedNotification } from '../src/utils/notifications';
import { registerCarTripController } from '../src/car/carActions';
import type { RecordingSession, Trip } from '../src/domain/trip';
import type { VelocitySensorsState } from '../src/hooks/useVelocitySensors';

jest.mock('../src/components/AverageSpeedDisplay', () => () => null);
jest.mock('../src/components/AccountSyncScreen', () => () => null);
jest.mock('../src/components/AppToast', () => ({ __esModule: true, default: ({ toast }: { toast: unknown }) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text: MockText } = require('react-native'); return <MockText>{JSON.stringify(toast)}</MockText>;
} }));
jest.mock('../src/components/BrandMark', () => () => null);
jest.mock('../src/components/DebugOverlay', () => () => null);
jest.mock('../src/components/FindFriendsScreen', () => () => null);
jest.mock('../src/components/HorizontalCompass', () => () => null);
jest.mock('../src/components/InsightsScreen', () => () => null);
jest.mock('../src/components/LeaderboardsScreen', () => () => null);
jest.mock('../src/components/MiniCompass', () => () => null);
jest.mock('../src/components/OnboardingScreen', () => () => null);
jest.mock('../src/components/PrivacyPolicyScreen', () => () => null);
jest.mock('../src/components/SideDrawer', () => () => null);
jest.mock('../src/components/SpeedDial', () => () => null);
jest.mock('../src/components/TripHistory', () => () => null);
jest.mock('react-native-paper', () => ({ ...jest.requireActual('react-native-paper'),
  Portal: ({ children }: { children: React.ReactNode }) => children, Modal: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, left: 0, bottom: 0 }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'synthetic-trip' }));
jest.mock('expo-screen-orientation', () => ({
  OrientationLock: { PORTRAIT_UP: 1, LANDSCAPE: 2 }, Orientation: { LANDSCAPE_LEFT: 3, LANDSCAPE_RIGHT: 4 },
  lockAsync: jest.fn(async () => undefined), unlockAsync: jest.fn(async () => undefined),
  getOrientationAsync: jest.fn(async () => 1), addOrientationChangeListener: jest.fn(), removeOrientationChangeListener: jest.fn(),
}));
jest.mock('../src/database/preferencesRepository', () => ({ getPreferences: jest.fn(), savePreferences: jest.fn(async () => undefined) }));
jest.mock('../src/database/tripRepository', () => ({
  getTrips: jest.fn(), clearTrips: jest.fn(), getPendingSyncChangeCount: jest.fn(async () => 0),
  recoverRecordings: jest.fn(), createDraftTrip: jest.fn(), appendTripSpeedSample: jest.fn(),
  checkpointRecording: jest.fn(), setRecordingPaused: jest.fn(), openRecordingGap: jest.fn(),
  closeRecordingGap: jest.fn(), saveTrip: jest.fn(),
}));
jest.mock('../src/database/exportService', () => ({ exportAsCsv: jest.fn(), exportAsJson: jest.fn(), pickAndImportJsonExport: jest.fn() }));
jest.mock('../src/driveSurface/driveSurfaceStore', () => ({
  startLiveDriveSession: jest.fn(), stopLiveDriveSession: jest.fn(), updateLiveDriveSession: jest.fn(async () => undefined),
}));
jest.mock('../src/api/tripTelemetryService', () => ({ tripTelemetryService: {
  startTrip: jest.fn(), recordSample: jest.fn(), completeTrip: jest.fn(),
} }));
jest.mock('../src/cloud/cloudService', () => ({
  cloudAuth: {}, isCloudConfigured: () => false, syncLocalChanges: jest.fn(),
}));
jest.mock('../src/utils/notifications', () => ({
  scheduleTripSavedNotification: jest.fn(), registerForPushNotifications: jest.fn(),
  getNotificationPermissionState: jest.fn(async () => 'undetermined'),
}));
jest.mock('../src/onboarding/onboardingStorage', () => ({
  hasCompletedLocalOnboarding: jest.fn(async () => true), markLocalOnboardingComplete: jest.fn(),
}));
jest.mock('../src/car/carActions', () => ({ registerCarTripController: jest.fn(() => () => undefined) }));
jest.mock('../src/utils/logging', () => ({ logAppWarning: jest.fn() }));
jest.mock('../src/hooks/useVelocitySensors', () => ({
  useVelocitySensors: jest.fn(() => ({ state: mockSensor, reset: jest.fn() })),
}));

let mockSensor: VelocitySensorsState;
const now = Date.parse('2026-10-01T12:00:00Z');
const prefs = { units: 'km/h' as const, mountIndex: 0, autoStart: false, autoSave: false,
  orientationMode: 'portrait' as const, themePreference: 'dark' as const };
const session = (): RecordingSession => ({
  trip: { id: 'recovered', startedAt: new Date(now - 10000).toISOString(), endedAt: new Date(now - 1000).toISOString(),
    totalDistanceMeters: 1250, maxSpeedMps: 25, averageSpeedMps: 10, units: 'MPH', mountLabel: 'right', recordStatus: 'draft' },
  state: 'paused', checkpointAt: new Date(now).toISOString(), lastSampleSequence: 2,
  lastSampleRecordedAt: new Date(now - 1000).toISOString(), lastSampleElapsedMs: 9000,
  gaps: [{ id: 'restart', tripId: 'recovered', reason: 'restart', startedAt: new Date(now - 1000).toISOString(), endedAt: null }],
});
const renderText = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());
const startButton = (renderer: ReactTestRenderer) => renderer.root.findAllByType(PressableScale)
  .find((node) => node.findAllByType(Text).some((text) => ['Start Trip', 'Saving changes…', 'Save & end', 'Stop & Save'].includes(text.props.children)))!;
const noticeButton = (renderer: ReactTestRenderer, label: string) => renderer.root.findAllByType(Button)
  .find((node) => node.props.children === label)!;

describe('personal recording HUD wiring', () => {
  let renderer: ReactTestRenderer | undefined;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    mockSensor = { timestampMs: now, speedMps: 10, averageSpeedMps: 10, maxSpeedMps: 10, distanceMeters: 0,
      units: 'km/h', headingDegrees: 20, headingSource: 'course', headingAccuracyDegrees: 2,
      headingQuality: 'good', headingReasons: [], permission: 'granted', status: 'ready', quality: 'good',
      source: 'gps', errorMessage: null, stale: false, qualityScore: 1, qualityReasons: [],
      gpsAccuracyMeters: 3, fixAgeMs: 0, nativeSpeedUsed: true, motionAvailable: true,
      gpsAvailable: true, headingAvailable: true, isMoving: false, isStopped: true };
    jest.mocked(getPreferences).mockResolvedValue(prefs);
    jest.mocked(repository.getTrips).mockResolvedValue([]);
    jest.mocked(repository.recoverRecordings).mockResolvedValue([]);
    jest.mocked(repository.createDraftTrip).mockImplementation(async (trip) => ({
      trip, state: 'recording', checkpointAt: trip.startedAt, lastSampleSequence: 0,
      lastSampleRecordedAt: null, lastSampleElapsedMs: 0, gaps: [],
    }));
    jest.mocked(repository.saveTrip).mockImplementation(async (trip) => ({ ...session(), trip, state: 'completed' }));
    jest.mocked(startLiveDriveSession).mockImplementation(() => new Promise(() => undefined));
    jest.mocked(stopLiveDriveSession).mockImplementation(() => new Promise(() => undefined));
    jest.mocked(tripTelemetryService.startTrip).mockImplementation(() => new Promise(() => undefined));
    jest.mocked(tripTelemetryService.completeTrip).mockImplementation(() => new Promise(() => undefined));
    jest.mocked(scheduleTripSavedNotification).mockImplementation(() => new Promise(() => undefined));
  });
  afterEach(async () => { if (renderer) await act(async () => renderer?.unmount()); renderer = undefined; jest.restoreAllMocks(); });
  const render = async () => { await act(async () => { renderer = create(<Speedometer themePreference="dark" onThemePreferenceChange={() => undefined} />); }); return renderer!; };

  it('shows persistent recovery, restores trip units/mount and exposes explicit Resume and Save & end', async () => {
    const recovered = session();
    jest.mocked(repository.recoverRecordings).mockResolvedValue([recovered]);
    jest.mocked(repository.setRecordingPaused).mockResolvedValue({ ...recovered, state: 'recording' });
    const ui = await render();
    expect(renderText(ui)).toContain('Recovered unfinished trip. Recording is paused.');
    expect(renderText(ui)).toContain('Save & end');
    expect(ui.root.findByType(RecordingNotice).props.allowResume).toBe(true);
    expect(jest.mocked(savePreferences).mock.calls.at(-1)?.[0]).toMatchObject({ units: 'MPH', mountIndex: 1 });
    expect(repository.setRecordingPaused).not.toHaveBeenCalled();
    await act(async () => noticeButton(ui, 'Resume recording').props.onPress());
    expect(repository.setRecordingPaused).toHaveBeenCalledWith('recovered', false, new Date(now).toISOString());
    expect(renderText(ui)).toContain('Stop & Save');
    expect(renderText(ui)).not.toContain('Recovered unfinished trip. Recording is paused.');
  });

  it('keeps Save & end available with denied permission and commits before hung native/network/notification work', async () => {
    jest.mocked(repository.recoverRecordings).mockResolvedValue([session()]);
    mockSensor = { ...mockSensor, status: 'permission_denied', permission: 'denied' };
    const ui = await render();
    expect(renderText(ui)).toContain('Location Permission Required');
    expect(noticeButton(ui, 'Resume recording').props.disabled).toBe(true);
    expect(startButton(ui).props.disabled).toBe(false);
    await act(async () => startButton(ui).props.onPress());
    expect(repository.saveTrip).toHaveBeenCalledTimes(1);
    expect(renderText(ui)).not.toContain('Save & end');
    expect(renderText(ui)).toContain('Trip saved');
    expect(startButton(ui).props.disabled).toBe(true);
    expect(stopLiveDriveSession).toHaveBeenCalled();
    expect(tripTelemetryService.completeTrip).toHaveBeenCalled();
    expect(scheduleTripSavedNotification).toHaveBeenCalled();
  });

  it('shows read failure and retries without persisting default preferences or claiming readiness', async () => {
    jest.mocked(getPreferences).mockRejectedValueOnce(new Error('SQLITE_IOERR'));
    const ui = await render();
    expect(renderText(ui)).toContain('Personal data could not be read.');
    expect(savePreferences).not.toHaveBeenCalled();
    expect(startButton(ui).props.disabled).toBe(true);
    await act(async () => noticeButton(ui, 'Retry device data').props.onPress());
    expect(renderText(ui)).not.toContain('Personal data could not be read.');
    expect(startButton(ui).props.disabled).toBe(false);
  });

  it('retains the unfinished trip and visible retry after a failed save, with no success toast', async () => {
    jest.mocked(repository.recoverRecordings).mockResolvedValue([session()]);
    jest.mocked(repository.saveTrip).mockRejectedValueOnce(new Error('SQLITE_FULL'));
    const ui = await render();
    await act(async () => startButton(ui).props.onPress());
    expect(renderText(ui)).toContain('Recent recording changes could not be saved.');
    expect(renderText(ui)).not.toContain('Trip saved');
    expect(startButton(ui).props.disabled).toBe(true);
    await act(async () => noticeButton(ui, 'Retry recording').props.onPress());
    expect(repository.saveTrip).toHaveBeenCalledTimes(2);
    expect(renderText(ui)).not.toContain('Save & end');
    expect(renderText(ui)).not.toContain('Recent recording changes could not be saved.');
  });

  it('uses the same immediate operation guard for phone and car start commands', async () => {
    let resolve!: (session: RecordingSession) => void;
    let trip!: Trip;
    jest.mocked(repository.createDraftTrip).mockImplementation((value) => {
      trip = value; return new Promise((yes) => { resolve = yes; });
    });
    const ui = await render();
    const car = jest.mocked(registerCarTripController).mock.calls.at(-1)![0];
    await act(async () => { void startButton(ui).props.onPress(); void car.startTrip(); });
    expect(repository.createDraftTrip).toHaveBeenCalledTimes(1);
    expect(startButton(ui).props.disabled).toBe(true);
    expect(renderText(ui)).toContain('Saving changes…');
    await act(async () => resolve({ ...session(), trip, state: 'recording', gaps: [] }));
    expect(renderText(ui)).toContain('Stop & Save');
  });

  it.each(['hung', 'rejected'])('saves an active phone trip when native live bridge and completion effects are %s', async (mode) => {
    const result = () => mode === 'hung' ? new Promise<void>(() => undefined) : Promise.reject(new Error('bridge unavailable'));
    jest.mocked(startLiveDriveSession).mockImplementation(result);
    jest.mocked(stopLiveDriveSession).mockImplementation(result);
    jest.mocked(tripTelemetryService.completeTrip).mockImplementation(result);
    jest.mocked(scheduleTripSavedNotification).mockImplementation(result);
    const ui = await render();
    jest.mocked(Date.now).mockReturnValue(now + 1500);
    await act(async () => startButton(ui).props.onPress());
    expect(startLiveDriveSession).toHaveBeenCalled();
    expect(renderText(ui)).toContain('Stop & Save');
    jest.mocked(Date.now).mockReturnValue(now + 3000);
    await act(async () => startButton(ui).props.onPress());
    expect(repository.saveTrip).toHaveBeenCalledTimes(1);
    expect(renderText(ui)).toContain('Start Trip');
    expect(renderText(ui)).toContain('Trip saved');
    expect(renderText(ui)).not.toContain('Recent recording changes could not be saved.');
  });
});
