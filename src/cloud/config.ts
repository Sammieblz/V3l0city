export type CloudConfig = {
  enabled: boolean;
  supabaseUrl: string | null;
  supabasePublishableKey: string | null;
};

const normalizeUrl = (value: string | undefined): string | null => {
  if (!value?.trim()) {
    return null;
  }
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
};

const normalizeKey = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.includes('<') || trimmed.includes('>')) {
    return null;
  }
  return trimmed;
};

export const getCloudConfig = (): CloudConfig => {
  const supabaseUrl = normalizeUrl(process.env.EXPO_PUBLIC_SUPABASE_URL);
  const supabasePublishableKey = normalizeKey(
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
  return {
    enabled: supabaseUrl != null && supabasePublishableKey != null,
    supabaseUrl,
    supabasePublishableKey,
  };
};
