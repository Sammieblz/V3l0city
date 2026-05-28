export type UserErrorContext =
  | 'auth'
  | 'cloud'
  | 'leaderboards'
  | 'sensor'
  | 'social'
  | 'sync'
  | 'generic';

const rawMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return '';
};

export const getUserFacingErrorMessage = (
  error: unknown,
  context: UserErrorContext = 'generic',
): string => {
  const message = rawMessage(error).toLowerCase();

  if (
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('abort') ||
    message.includes('timeout')
  ) {
    return 'Check your connection and try again.';
  }

  if (
    message.includes('invalid login credentials') ||
    message.includes('invalid credentials')
  ) {
    return 'Email or password is incorrect.';
  }

  if (
    message.includes('email not confirmed') ||
    message.includes('email confirmation')
  ) {
    return 'Please confirm your email, then sign in.';
  }

  if (
    message.includes('already registered') ||
    message.includes('user already exists') ||
    message.includes('already exists')
  ) {
    return 'An account with that email already exists. Sign in instead.';
  }

  if (
    message.includes('weak password') ||
    message.includes('password should be') ||
    message.includes('password must')
  ) {
    return 'Use a password with at least 6 characters.';
  }

  if (
    message.includes('profiles_username_unique') ||
    (message.includes('duplicate') && message.includes('username')) ||
    (message.includes('unique') && message.includes('username'))
  ) {
    return 'That username is already taken.';
  }

  if (
    message.includes('row-level security') ||
    message.includes('permission denied') ||
    message.includes('not authorized') ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('401') ||
    message.includes('403')
  ) {
    return 'You do not have permission to do that.';
  }

  if (
    message.includes('rate limit') ||
    message.includes('too many') ||
    message.includes('429')
  ) {
    return 'Too many attempts. Please wait a moment and try again.';
  }

  if (
    message.includes('not configured') ||
    message.includes('function not found') ||
    message.includes('404')
  ) {
    return 'Online features are not available right now.';
  }

  if (context === 'auth') {
    return 'We could not complete that account action. Please try again.';
  }

  if (context === 'sync') {
    return 'Sync did not finish. Your local trips are still saved.';
  }

  if (context === 'social') {
    return 'Friend features are not available right now.';
  }

  if (context === 'leaderboards') {
    return 'Leaderboards are not available right now.';
  }

  if (context === 'sensor') {
    return 'Sensors could not start. Check permissions and try again.';
  }

  if (context === 'cloud') {
    return 'Cloud features are not available right now.';
  }

  return 'Something went wrong. Please try again.';
};

export const getNativeSpeedErrorMessage = (code?: string): string => {
  if (code === 'permission_denied') {
    return 'Enable location access to use the speedometer.';
  }
  if (code === 'precise_location_required') {
    return 'Enable Precise Location for accurate speed and compass readings.';
  }
  if (code === 'sensor_unavailable') {
    return 'This device does not support the required sensors.';
  }
  return 'Sensors could not start. Check permissions and try again.';
};
