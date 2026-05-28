import type {
  AuthProvider,
  CloudProfile,
  CloudProfileInput,
  CloudSignUpInput,
} from '../types';
import { getCloudConfig } from '../config';
import { getSupabaseClient } from './client';
import { toCloudProfile, toCloudSession } from './mappers';

const normalizeUsername = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);

const normalizeDisplayName = (value: string) => value.trim().slice(0, 80);

export class SupabaseAuthProvider implements AuthProvider {
  isConfigured(): boolean {
    return getCloudConfig().enabled;
  }

  async getSession() {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return toCloudSession(data.session);
  }

  async signUpWithEmail(input: CloudSignUpInput) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Cloud sync is not configured.');
    const username = normalizeUsername(input.username);
    const displayName = normalizeDisplayName(input.displayName);
    if (username.length < 3) {
      throw new Error('Username must be at least 3 letters or numbers.');
    }
    if (displayName.length < 1) {
      throw new Error('Name is required.');
    }

    const email = input.email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: input.password,
      options: {
        data: {
          username,
          display_name: displayName,
        },
      },
    });
    if (error) throw error;
    const session = toCloudSession(data.session);
    return {
      email,
      emailConfirmationRequired: session == null,
      session,
    };
  }

  async signInWithEmail(email: string, password: string) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Cloud sync is not configured.');
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    const session = toCloudSession(data.session);
    if (!session) {
      throw new Error('Sign-in succeeded without a session.');
    }
    return session;
  }

  async signOut(): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  async getProfile(): Promise<CloudProfile | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const session = await this.getSession();
    if (!session) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', session.userId)
      .maybeSingle();
    if (error) throw error;
    return data ? toCloudProfile(data) : null;
  }

  async upsertProfile(input: CloudProfileInput): Promise<CloudProfile> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Cloud sync is not configured.');
    const session = await this.getSession();
    if (!session) throw new Error('Sign in before updating your profile.');
    const existing = await this.getProfile();

    const username = normalizeUsername(input.username);
    const displayName = normalizeDisplayName(input.displayName);
    if (username.length < 3) {
      throw new Error('Username must be at least 3 letters or numbers.');
    }
    if (displayName.length < 1) {
      throw new Error('Name is required.');
    }

    const row = {
      user_id: session.userId,
      username,
      display_name: displayName,
      avatar_url: existing?.avatarUrl ?? null,
      sync_enabled: input.syncEnabled,
      leaderboard_opt_in: input.leaderboardOptIn,
      nearby_opt_in: input.nearbyOptIn,
      coarse_location_hash: input.coarseLocationHash ?? null,
      onboarding_completed_at:
        input.completeOnboarding
          ? existing?.onboardingCompletedAt ?? new Date().toISOString()
          : existing?.onboardingCompletedAt ?? null,
      updated_at: new Date().toISOString(),
    };

    const query = existing
      ? supabase
          .from('profiles')
          .update(row)
          .eq('user_id', session.userId)
          .select()
          .single()
      : supabase.from('profiles').insert(row).select().single();
    const { data, error } = await query;
    if (error) throw error;
    return toCloudProfile(data);
  }
}
