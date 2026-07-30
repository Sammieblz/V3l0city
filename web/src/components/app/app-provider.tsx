"use client";

import type { User } from "@supabase/supabase-js";
import { useCallback, createContext, useContext, useEffect, useMemo, useState } from "react";

import { appConfig } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

type LegalState = "loading" | "accepted" | "missing" | "unavailable";
type AppContextValue = { user: User | null; profile: Profile | null; loading: boolean; legalState: LegalState; refresh: () => Promise<void>; updateProfile: (input: Partial<Omit<Profile, "userId">>) => Promise<void>; acceptTerms: () => Promise<void>; signOut: () => Promise<void> };
const AppContext = createContext<AppContextValue | null>(null);

const profileFromRow = (row: Record<string, unknown>): Profile => ({
  userId: String(row.user_id), username: String(row.username ?? ""), displayName: String(row.display_name ?? ""), avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
  syncEnabled: Boolean(row.sync_enabled), leaderboardOptIn: Boolean(row.leaderboard_opt_in), nearbyOptIn: Boolean(row.nearby_opt_in), coarseLocationHash: row.coarse_location_hash ? String(row.coarse_location_hash) : null,
  onboardingCompletedAt: row.onboarding_completed_at ? String(row.onboarding_completed_at) : null,
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [legalState, setLegalState] = useState<LegalState>("loading");

  const refresh = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) { setLoading(false); setLegalState("unavailable"); return; }
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const currentUser = userData.user;
    setUser(currentUser ?? null);
    if (!currentUser) { setProfile(null); setLegalState("unavailable"); setLoading(false); return; }
    const { data: profileRow } = await supabase.from("profiles").select("*").eq("user_id", currentUser.id).maybeSingle();
    setProfile(profileRow ? profileFromRow(profileRow) : null);
    const { data: acceptances, error: acceptanceError } = await supabase.from("legal_acceptances").select("document_type").in("document_type", ["terms", "privacy_notice"]).eq("document_version", appConfig.termsVersion);
    const acceptedTypes = new Set((acceptances ?? []).map((acceptance) => acceptance.document_type));
    setLegalState(acceptanceError ? "unavailable" : acceptedTypes.has("terms") && acceptedTypes.has("privacy_notice") ? "accepted" : "missing");
    setLoading(false);
  }, []);

  useEffect(() => {
    const initialize = window.setTimeout(() => { void refresh(); }, 0);
    const supabase = createClient();
    if (!supabase) return () => window.clearTimeout(initialize);
    const { data: listener } = supabase.auth.onAuthStateChange(() => { void refresh(); });
    return () => { window.clearTimeout(initialize); listener.subscription.unsubscribe(); };
  }, [refresh]);

  const updateProfile = useCallback(async (input: Partial<Omit<Profile, "userId">>) => {
    if (!user || !profile) throw new Error("Sign in before updating your profile.");
    const supabase = createClient();
    if (!supabase) throw new Error("Cloud features are not configured.");
    const row = { user_id: user.id, username: input.username ?? profile.username, display_name: input.displayName ?? profile.displayName, avatar_url: input.avatarUrl !== undefined ? input.avatarUrl : profile.avatarUrl, sync_enabled: input.syncEnabled ?? profile.syncEnabled, leaderboard_opt_in: input.leaderboardOptIn ?? profile.leaderboardOptIn, nearby_opt_in: input.nearbyOptIn ?? profile.nearbyOptIn, coarse_location_hash: input.coarseLocationHash !== undefined ? input.coarseLocationHash : profile.coarseLocationHash, onboarding_completed_at: input.onboardingCompletedAt !== undefined ? input.onboardingCompletedAt : profile.onboardingCompletedAt, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("profiles").update(row).eq("user_id", user.id);
    if (error) throw error;
    setProfile(profileFromRow(row));
  }, [profile, user]);

  const acceptTerms = useCallback(async () => {
    if (!user) throw new Error("Sign in before accepting terms.");
    const supabase = createClient();
    if (!supabase) throw new Error("Cloud features are not configured.");
    const { error } = await supabase.from("legal_acceptances").upsert([
      { user_id: user.id, document_type: "terms", document_version: appConfig.termsVersion },
      { user_id: user.id, document_type: "privacy_notice", document_version: appConfig.termsVersion },
    ], { onConflict: "user_id,document_type,document_version", ignoreDuplicates: true });
    if (error) throw error;
    setLegalState("accepted");
  }, [user]);

  const signOut = useCallback(async () => { const supabase = createClient(); if (supabase) await supabase.auth.signOut(); setUser(null); setProfile(null); }, []);
  const value = useMemo(() => ({ user, profile, loading, legalState, refresh, updateProfile, acceptTerms, signOut }), [user, profile, loading, legalState, refresh, updateProfile, acceptTerms, signOut]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() { const context = useContext(AppContext); if (!context) throw new Error("useApp must be used inside AppProvider."); return context; }
