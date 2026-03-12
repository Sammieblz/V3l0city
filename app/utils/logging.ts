export const logSensorWarning = (message: string): void => {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn(`[Velocity][sensor] ${message}`);
  }
};

export const logSensorDebug = (message: string): void => {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.debug(`[Velocity][sensor] ${message}`);
  }
};

