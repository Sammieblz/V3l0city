import { getCloudConfig } from '../src/cloud/config';
import { defaultCloudProviderFactory } from '../src/cloud/providers';
import { isCloudConfigured, syncLocalChanges } from '../src/cloud/cloudService';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../src/cloud/supabase/authProvider', () => {
  throw new Error('Local startup must not load the legacy auth SDK.');
});

describe('cloud configuration', () => {
  const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const originalProvider = process.env.EXPO_PUBLIC_V3L0CITY_CLOUD_PROVIDER;

  afterEach(() => {
    if (originalProvider == null) delete process.env.EXPO_PUBLIC_V3L0CITY_CLOUD_PROVIDER;
    else process.env.EXPO_PUBLIC_V3L0CITY_CLOUD_PROVIDER = originalProvider;
    if (originalUrl == null) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    else process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey == null) delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
  });

  it('keeps cloud features disabled when Supabase env vars are missing', async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    expect(getCloudConfig()).toEqual({
      provider: 'local',
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
    process.env.EXPO_PUBLIC_V3L0CITY_CLOUD_PROVIDER = 'legacy-supabase';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co/';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_123';

    expect(getCloudConfig()).toEqual({
      provider: 'legacy-supabase',
      enabled: true,
      supabaseUrl: 'https://example.supabase.co',
      supabasePublishableKey: 'sb_publishable_123',
    });
  });

  it('does not enable legacy cloud just because old environment keys exist', () => {
    delete process.env.EXPO_PUBLIC_V3L0CITY_CLOUD_PROVIDER;
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_123';
    expect(getCloudConfig()).toMatchObject({ provider: 'local', enabled: false });
  });

  it('does not load the legacy SDK for local startup with old env values', async () => {
    delete process.env.EXPO_PUBLIC_V3L0CITY_CLOUD_PROVIDER;
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_123';
    await expect(defaultCloudProviderFactory()).resolves.toBeNull();
  });
});
