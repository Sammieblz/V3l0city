// Distance and time units
export const METERS_PER_KILOMETER = 1000;
export const METERS_PER_MILE = 1609.344;
export const SECONDS_PER_HOUR = 3600;
export const EARTH_RADIUS_METERS = 6371e3;

// Kalman filter tuning
export const MIN_KALMAN_R = 0.01;
export const MAX_KALMAN_R = 25;
export const DEFAULT_KALMAN_OPTIONS = { R: 0.01, Q: 3 } as const;

// GPS update strategy
export const LOCATION_UPDATE_INTERVAL_MS = 1000;
export const LOCATION_DISTANCE_INTERVAL_METERS = 0;
export const MAX_GPS_ACCURACY_METERS = 25;
export const MIN_MOVING_SPEED_MPS = 0.5;

// Motion sampling and integration
export const MOTION_UPDATE_INTERVAL_MS = 200;
export const MAX_MOTION_SAMPLE_GAP_SECONDS = 1;
export const MAX_FORWARD_ACCELERATION_MPS2 = 6;

// Speed statistics sampling
export const MAX_SPEED_SAMPLE_GAP_SECONDS = 2;

// Auto-start: require sustained speed above threshold for this long (seconds)
export const AUTO_START_MOTION_SUSTAIN_SECONDS = 2.5;

// Auto-pause: require sustained speed below threshold for this long before pausing (seconds)
export const AUTO_STOP_MOTION_SUSTAIN_SECONDS = 2.5;

// Math helpers
export const TWO_PI = Math.PI * 2;
