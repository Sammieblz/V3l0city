import {
  DRIVE_SURFACE_STALE_AFTER_MS,
  isDriveSurfaceSnapshotStale,
  type DriveSurfaceSnapshot,
} from '../driveSurface/snapshot';
import type { CarTripAction, CarTripControllerStatus } from './carActions';

export type CarActionModel = {
  action: CarTripAction;
  label: string;
  kind: 'primary' | 'secondary';
  enabled: boolean;
};

export type CarDisplayModel = {
  live: boolean;
  stale: boolean;
  tripActive: boolean;
  tripPaused: boolean;
  title: string;
  statusText: string;
  speedText: string;
  units: string;
  averageSpeedText: string;
  maxSpeedText: string;
  distanceText: string;
  elapsedText: string;
  headingText: string;
  headingDegrees: number | null;
  headingSourceText: string;
  headingQuality: DriveSurfaceSnapshot['headingQuality'];
  signalQuality: DriveSurfaceSnapshot['signalQuality'];
  signalText: string;
  controlMessage: string | null;
  actions: CarActionModel[];
};

const isBlockingPermissionState = (
  permissionStatus: DriveSurfaceSnapshot['permissionStatus'] | undefined,
): boolean =>
  permissionStatus === 'permission_denied' ||
  permissionStatus === 'precise_location_required' ||
  permissionStatus === 'sensor_unavailable';

const headingSourceText = (
  source: DriveSurfaceSnapshot['headingSource'] | undefined,
): string => {
  if (source === 'course') return 'course';
  if (source === 'device') return 'device';
  return 'heading';
};

const actionEnabled = (
  status: CarTripControllerStatus,
  action: CarTripAction,
  blockedByPermission: boolean,
): boolean => {
  if (!status.available || blockedByPermission) return false;
  if (action === 'start') return status.canStart;
  if (action === 'pause') return status.canPause;
  if (action === 'resume') return status.canResume;
  return status.canStop;
};

export const buildCarDisplayModel = (
  snapshot: DriveSurfaceSnapshot | null,
  controllerStatus: CarTripControllerStatus,
  nowMs = Date.now(),
): CarDisplayModel => {
  const stale = isDriveSurfaceSnapshotStale(snapshot, nowMs);
  const live = Boolean(snapshot && !stale);
  const active = Boolean(snapshot?.tripActive);
  const paused = Boolean(snapshot?.tripPaused);
  const blockedByPermission = isBlockingPermissionState(snapshot?.permissionStatus);

  const title = !snapshot
    ? 'Start a trip on your phone'
    : stale
      ? `Latest state is older than ${DRIVE_SURFACE_STALE_AFTER_MS / 1000}s`
      : paused
        ? 'Trip paused'
        : active
          ? snapshot.simulationActive
            ? 'Simulated trip active'
            : 'Trip active'
          : 'Ready';

  const controlMessage = !controllerStatus.available
    ? controllerStatus.unavailableReason ?? 'Open V3l0city on your phone to control trips.'
    : blockedByPermission
      ? snapshot?.signalText ?? 'Location or sensors need attention.'
      : null;

  const primaryAction: CarActionModel = paused
    ? {
        action: 'resume',
        label: 'Resume',
        kind: 'primary',
        enabled: actionEnabled(controllerStatus, 'resume', blockedByPermission),
      }
    : active
      ? {
          action: 'pause',
          label: 'Pause',
          kind: 'primary',
          enabled: actionEnabled(controllerStatus, 'pause', blockedByPermission),
        }
      : {
          action: 'start',
          label: 'Start Trip',
          kind: 'primary',
          enabled: actionEnabled(controllerStatus, 'start', blockedByPermission),
        };

  const actions = [primaryAction];
  if (active || paused) {
    actions.push({
      action: 'stop-save',
      label: 'Stop & Save',
      kind: 'secondary',
      enabled: actionEnabled(controllerStatus, 'stop-save', false),
    });
  }

  return {
    live,
    stale,
    tripActive: active,
    tripPaused: paused,
    title,
    statusText: snapshot?.signalText ?? 'Open V3l0city',
    speedText: live ? snapshot?.speedText ?? '0' : '--',
    units: snapshot?.units ?? 'MPH',
    averageSpeedText: live ? snapshot?.averageSpeedText ?? '0' : '--',
    maxSpeedText: live ? snapshot?.maxSpeedText ?? '0' : '--',
    distanceText: live ? snapshot?.distanceText ?? '--' : '--',
    elapsedText: live ? snapshot?.elapsedText ?? '00:00:00' : '--:--:--',
    headingText: live ? snapshot?.headingText ?? '--' : '--',
    headingDegrees: live ? snapshot?.headingDegrees ?? null : null,
    headingSourceText: headingSourceText(snapshot?.headingSource),
    headingQuality: snapshot?.headingQuality ?? 'poor',
    signalQuality: snapshot?.signalQuality ?? 'poor',
    signalText: snapshot?.signalText ?? 'No live drive session',
    controlMessage,
    actions,
  };
};

export const numericSpeedForCarModel = (model: CarDisplayModel): number => {
  const parsed = Number(model.speedText);
  return Number.isFinite(parsed) ? parsed : 0;
};
