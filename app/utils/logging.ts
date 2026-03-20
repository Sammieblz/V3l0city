export const logSensorWarning = (message: string): void => {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn(`[V3locity][sensor] ${message}`);
  }
};

export const logSensorDebug = (message: string): void => {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.debug(`[V3locity][sensor] ${message}`);
  }
};

