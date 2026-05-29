import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getCloudConfig } from '../config';
import { secureStorage } from './secureStorage';

let client: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient | null => {
  const config = getCloudConfig();
  if (!config.enabled || !config.supabaseUrl || !config.supabasePublishableKey) {
    return null;
  }

  client ??= createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return client;
};
