export const logSensorWarning = (message: string): void => {
  if (__DEV__) {
    console.warn(`[V3l0city][sensor] ${message}`);
  }
};

export const logSensorDebug = (message: string): void => {
  if (__DEV__) {
    console.debug(`[V3l0city][sensor] ${message}`);
  }
};
