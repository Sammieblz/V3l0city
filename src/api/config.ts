export type TelemetryConfig = {
  enabled: boolean;
  apiUrl: string | null;
  wsUrl: string | null;
};

const normalizeUrl = (
  value: string | undefined,
  allowedProtocols: string[]
): string | null => {
  if (!value?.trim()) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.includes('<') || trimmed.includes('>')) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (!allowedProtocols.includes(url.protocol)) {
      return null;
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
};

export const getTelemetryConfig = (): TelemetryConfig => {
  const apiUrl = normalizeUrl(process.env.EXPO_PUBLIC_V3L0CITY_API_URL, [
    'http:',
    'https:',
  ]);
  const wsUrl = normalizeUrl(process.env.EXPO_PUBLIC_V3L0CITY_WS_URL, [
    'ws:',
    'wss:',
  ]);
  return {
    enabled: apiUrl != null && wsUrl != null,
    apiUrl,
    wsUrl,
  };
};
