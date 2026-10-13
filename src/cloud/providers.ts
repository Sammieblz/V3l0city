import { getCloudConfig } from './config';
import type { AuthProvider, CloudSyncProvider, SocialProvider } from './types';

export type CloudProviders = { auth: AuthProvider; sync: CloudSyncProvider; social: SocialProvider };
export type CloudProviderFactory = () => Promise<CloudProviders | null>;

let legacyProviders: Promise<CloudProviders> | null = null;

/** Importing the local app does not import or instantiate the legacy SDK. */
export const defaultCloudProviderFactory: CloudProviderFactory = async () => {
  const config = getCloudConfig();
  if (config.provider !== 'legacy-supabase' || !config.enabled) return null;
  legacyProviders ??= Promise.all([
    import('./supabase/authProvider'), import('./supabase/syncProvider'),
    import('./supabase/socialProvider'),
  ]).then(([auth, sync, social]) => ({ auth: new auth.SupabaseAuthProvider(),
    sync: new sync.SupabaseSyncProvider(), social: new social.SupabaseSocialProvider() }))
    .catch((error: unknown) => { legacyProviders = null; throw error; });
  return legacyProviders;
};
