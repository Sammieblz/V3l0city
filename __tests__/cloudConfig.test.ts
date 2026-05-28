jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { getCloudConfig } from '../src/cloud/config';
import { isCloudConfigured, syncLocalChanges } from '../src/cloud/cloudService';

describe('cloud configuration', () => {
  const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  afterEach(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
  });

  it('keeps cloud features disabled when Supabase env vars are missing', async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    expect(getCloudConfig()).toEqual({
      enabled: false,
      supabaseUrl: null,
      supabasePublishableKey: null,
    });
    expect(isCloudConfigured()).toBe(false);
    await expect(syncLocalChanges()).resolves.toMatchObject({
      ok: false,
      message: 'Online sync is not available in this build.',
    });
  });

  it('normalizes valid Supabase config', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co/';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_123';

    expect(getCloudConfig()).toEqual({
      enabled: true,
      supabaseUrl: 'https://example.supabase.co',
      supabasePublishableKey: 'sb_publishable_123',
    });
  });
});
