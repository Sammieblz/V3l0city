export type CarTripAction = 'start' | 'pause' | 'resume' | 'stop-save';

export type CarTripControllerStatus = {
  available: boolean;
  tripActive: boolean;
  tripPaused: boolean;
  canStart: boolean;
  canPause: boolean;
  canResume: boolean;
  canStop: boolean;
  unavailableReason?: string;
};

export type CarTripActionResult = {
  ok: boolean;
  message: string;
};

export type CarTripController = {
  getStatus: () => CarTripControllerStatus;
  startTrip: () => Promise<void>;
  pauseTrip: () => Promise<void>;
  resumeTrip: () => Promise<void>;
  stopAndSaveTrip: () => Promise<void>;
};

const listeners = new Set<() => void>();
let controller: CarTripController | null = null;

const unavailableStatus: CarTripControllerStatus = {
  available: false,
  tripActive: false,
  tripPaused: false,
  canStart: false,
  canPause: false,
  canResume: false,
  canStop: false,
  unavailableReason: 'Open V3l0city on your phone to control trips.',
};

const emitChange = (): void => {
  listeners.forEach((listener) => listener());
};

export const registerCarTripController = (
  nextController: CarTripController,
): (() => void) => {
  controller = nextController;
  emitChange();

  return () => {
    if (controller === nextController) {
      controller = null;
      emitChange();
    }
  };
};

export const subscribeCarTripController = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getCarTripControllerStatus = (): CarTripControllerStatus =>
  controller?.getStatus() ?? unavailableStatus;

export const requestCarTripAction = async (
  action: CarTripAction,
): Promise<CarTripActionResult> => {
  if (!controller) {
    return {
      ok: false,
      message: unavailableStatus.unavailableReason ?? 'Trip controls unavailable.',
    };
  }

  const status = controller.getStatus();
  if (!status.available) {
    return {
      ok: false,
      message: status.unavailableReason ?? 'Trip controls unavailable.',
    };
  }

  try {
    if (action === 'start' && status.canStart) {
      await controller.startTrip();
      emitChange();
      return { ok: true, message: 'Trip started' };
    }
    if (action === 'pause' && status.canPause) {
      await controller.pauseTrip();
      emitChange();
      return { ok: true, message: 'Trip paused' };
    }
    if (action === 'resume' && status.canResume) {
      await controller.resumeTrip();
      emitChange();
      return { ok: true, message: 'Trip resumed' };
    }
    if (action === 'stop-save' && status.canStop) {
      await controller.stopAndSaveTrip();
      emitChange();
      return { ok: true, message: 'Trip saved' };
    }

    return {
      ok: false,
      message: 'That action is not available right now.',
    };
  } catch {
    return {
      ok: false,
      message: 'Trip action failed. Check V3l0city on your phone.',
    };
  }
};
