import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, SegmentedButtons, TextInput } from 'react-native-paper';

import BrandMark from './BrandMark';
import {
  cloudAuth,
  completeCloudOnboarding,
  isCloudConfigured,
  restoreCloudTrips,
  saveCloudProfile,
  syncLocalChanges,
} from '../cloud/cloudService';
import type { CloudAuthSession, CloudProfile } from '../cloud/types';
import { getCoarseLocation } from '../cloud/utils/coarseLocation';
import { getPendingSyncChangeCount } from '../database/tripRepository';
import { colors, fontFamilies, radii, spacing } from '../theme/paperTheme';
import { logAppWarning } from '../utils/logging';
import { getUserFacingErrorMessage } from '../utils/userFacingErrors';

export type AccountEntryStep = 'landing' | 'sign-in' | 'sign-up';

type AccountStep =
  | AccountEntryStep
  | 'account-unavailable'
  | 'check-email'
  | 'cloud-onboarding'
  | 'loading'
  | 'settings';

type AccountSyncScreenProps = {
  initialStep?: AccountEntryStep;
  onAuthenticated?: () => void;
  onAccountChanged?: () => void;
  onOpenPrivacy?: () => void;
};

const AccountSyncScreen: React.FC<AccountSyncScreenProps> = ({
  initialStep = 'landing',
  onAuthenticated,
  onAccountChanged,
  onOpenPrivacy,
}) => {
  const [session, setSession] = useState<CloudAuthSession | null>(null);
  const [profile, setProfile] = useState<CloudProfile | null>(null);
  const [step, setStep] = useState<AccountStep>(
    initialStep === 'landing' ? 'loading' : initialStep,
  );

  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(false);
  const [nearbyOptIn, setNearbyOptIn] = useState(false);
  const [coarseLocationHash, setCoarseLocationHash] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  const configured = isCloudConfigured();

  const hydrateProfile = useCallback((nextProfile: CloudProfile | null) => {
    setProfile(nextProfile);
    if (!nextProfile) return;
    setUsername(nextProfile.username);
    setDisplayName(nextProfile.displayName);
    setSyncEnabled(
      nextProfile.onboardingCompletedAt == null ? true : nextProfile.syncEnabled,
    );
    setLeaderboardOptIn(nextProfile.leaderboardOptIn);
    setNearbyOptIn(nextProfile.nearbyOptIn);
    setCoarseLocationHash(nextProfile.coarseLocationHash ?? null);
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const nextProfile = await cloudAuth.getProfile();
      return { profile: nextProfile, unavailable: false };
    } catch (error) {
      logAppWarning('account', error);
      return { profile: null, unavailable: true };
    }
  }, []);

  const refresh = useCallback(
    async (nextStep?: AccountStep) => {
      try {
        if (!configured) return;
        const nextSession = await cloudAuth.getSession();
        setPendingSyncCount(await getPendingSyncChangeCount());
        setSession(nextSession);
        if (!nextSession) {
          hydrateProfile(null);
          setStep(nextStep ?? initialStep);
          return;
        }

        const { profile: nextProfile, unavailable } = await loadProfile();
        hydrateProfile(nextProfile);
        if (unavailable || nextProfile == null) {
          setStep(unavailable ? 'account-unavailable' : 'cloud-onboarding');
          return;
        }
        if (nextStep) {
          setStep(nextStep);
          return;
        }
        setStep(
          nextProfile?.onboardingCompletedAt == null
            ? 'cloud-onboarding'
            : 'settings',
        );
      } catch (error) {
        logAppWarning('account', error);
        setMessage(getUserFacingErrorMessage(error, 'auth'));
      }
    },
    [configured, hydrateProfile, initialStep, loadProfile],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (task: () => Promise<void>) => {
    setLoading(true);
    setMessage(null);
    try {
      await task();
    } catch (error) {
      logAppWarning('account', error);
      setMessage(getUserFacingErrorMessage(error, 'auth'));
    } finally {
      setLoading(false);
    }
  };

  const submitSignUp = () =>
    run(async () => {
      const result = await cloudAuth.signUpWithEmail({
        displayName,
        email: signUpEmail,
        password: signUpPassword,
        username,
      });
      setSignInEmail(result.email);
      if (result.session) {
        setSession(result.session);
        await refresh('cloud-onboarding');
        onAccountChanged?.();
        setMessage('Account created. Choose your online preferences.');
        return;
      }

      setStep('check-email');
      setMessage('Check your email to confirm your account, then sign in.');
    });

  const submitSignIn = () =>
    run(async () => {
      const nextSession = await cloudAuth.signInWithEmail(
        signInEmail.trim(),
        signInPassword,
      );
      setSession(nextSession);
      const { profile: nextProfile, unavailable } = await loadProfile();
      hydrateProfile(nextProfile);
      onAccountChanged?.();
      if (unavailable) {
        setStep('account-unavailable');
        setMessage('Signed in. Online account setup is not ready yet.');
        return;
      }
      if (!nextProfile) {
        setStep('cloud-onboarding');
        setMessage('Finish account setup to enable online features.');
        return;
      }
      if (nextProfile.onboardingCompletedAt == null) {
        setStep('cloud-onboarding');
        setMessage('Finish account setup to enable online features.');
        return;
      }
      onAuthenticated?.();
    });

  const buildProfileInput = (nextCoarseLocationHash = coarseLocationHash) => ({
    coarseLocationHash: nextCoarseLocationHash,
    displayName,
    leaderboardOptIn,
    nearbyOptIn,
    syncEnabled,
    username,
  });

  const saveProfile = (completeOnboarding: boolean) =>
    run(async () => {
      const input = buildProfileInput();
      const saved = completeOnboarding
        ? await completeCloudOnboarding(input)
        : await saveCloudProfile(input);
      hydrateProfile(saved);
      setPendingSyncCount(await getPendingSyncChangeCount());
      onAccountChanged?.();
      setStep('settings');
      setMessage(
        completeOnboarding
          ? 'Account setup complete.'
          : 'Account settings saved.',
      );
      if (completeOnboarding) {
        onAuthenticated?.();
      }
    });

  const captureCoarseLocation = () =>
    run(async () => {
      const result = await getCoarseLocation();
      if (!result.ok) {
        setMessage(
          result.reason === 'permission_denied'
            ? 'Enable location permission to save your nearby area.'
            : 'We could not find your location yet. Try again in a moment.',
        );
        return;
      }

      setCoarseLocationHash(result.hash);

      if (!session) {
        setMessage(
          'Nearby area found. Finish creating your account to save it online.',
        );
        return;
      }

      if (displayName.trim().length < 1 || username.trim().length < 3) {
        setMessage('Add your name and username before saving your nearby area.');
        return;
      }

      const saved = await saveCloudProfile(buildProfileInput(result.hash));
      hydrateProfile(saved);
      onAccountChanged?.();
      setStep(
        saved.onboardingCompletedAt == null ? 'cloud-onboarding' : 'settings',
      );
      setMessage(
        saved.onboardingCompletedAt == null
          ? 'Nearby area saved. Finish setup when you are ready.'
          : 'Nearby area saved.',
      );
    });

  const syncNow = () =>
    run(async () => {
      const result = await syncLocalChanges();
      setPendingSyncCount(await getPendingSyncChangeCount());
      onAccountChanged?.();
      setMessage(result.message);
    });

  const restoreNow = () =>
    run(async () => {
      const count = await restoreCloudTrips();
      setPendingSyncCount(await getPendingSyncChangeCount());
      onAccountChanged?.();
      setMessage(`Restored ${count} online trip${count === 1 ? '' : 's'}.`);
    });

  const signOut = () =>
    run(async () => {
      await cloudAuth.signOut();
      setSession(null);
      hydrateProfile(null);
      setPendingSyncCount(await getPendingSyncChangeCount());
      onAccountChanged?.();
      setStep('landing');
      setMessage('Signed out. Local trips stay on this device.');
    });

  if (!configured) {
    return (
      <View style={styles.centerState}>
        <BrandMark size={70} style={styles.centerMark} />
        <Text style={styles.title}>Offline mode</Text>
        <Text style={styles.body}>
          Online account features are not available in this build. V3l0city
          will keep working locally.
        </Text>
        {onOpenPrivacy && (
          <Button
            mode="contained-tonal"
            icon="shield-lock-outline"
            onPress={onOpenPrivacy}
            style={styles.primaryButton}
          >
            Privacy policy
          </Button>
        )}
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {message && (
        <View style={styles.messagePanel}>
          <Text style={styles.message}>{message}</Text>
        </View>
      )}

      {step === 'loading' ? (
        <AuthPanel title="Account / Sync" body="Checking your account status." />
      ) : step === 'landing' ? (
        <Landing
          onSignUp={() => setStep('sign-up')}
          onSignIn={() => setStep('sign-in')}
          onOpenPrivacy={onOpenPrivacy}
        />
      ) : step === 'sign-up' ? (
        <AuthPanel title="Create account" body="Choose your public profile, then confirm your email if required.">
          <TextInput
            mode="outlined"
            label="Name"
            value={displayName}
            onChangeText={setDisplayName}
            style={styles.input}
          />
          <TextInput
            mode="outlined"
            label="Username"
            value={username}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setUsername}
            style={styles.input}
          />
          <TextInput
            mode="outlined"
            label="Email"
            value={signUpEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setSignUpEmail}
            style={styles.input}
          />
          <TextInput
            mode="outlined"
            label="Password"
            value={signUpPassword}
            secureTextEntry
            onChangeText={setSignUpPassword}
            style={styles.input}
          />
          <Button
            mode="contained"
            loading={loading}
            disabled={
              loading ||
              displayName.trim().length < 1 ||
              username.trim().length < 3 ||
              signUpEmail.trim().length === 0 ||
              signUpPassword.length < 6
            }
            onPress={submitSignUp}
            style={styles.primaryButton}
          >
            Create account
          </Button>
          <Button mode="text" onPress={() => setStep('sign-in')}>
            I already have an account
          </Button>
        </AuthPanel>
      ) : step === 'sign-in' ? (
        <AuthPanel title="Sign in" body="Sign in to back up trips, restore data, find friends, and view leaderboards.">
          <TextInput
            mode="outlined"
            label="Email"
            value={signInEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setSignInEmail}
            style={styles.input}
          />
          <TextInput
            mode="outlined"
            label="Password"
            value={signInPassword}
            secureTextEntry
            onChangeText={setSignInPassword}
            style={styles.input}
          />
          <Button
            mode="contained"
            loading={loading}
            disabled={
              loading || signInEmail.trim().length === 0 || signInPassword.length < 6
            }
            onPress={submitSignIn}
            style={styles.primaryButton}
          >
            Sign in
          </Button>
          <Button mode="text" onPress={() => setStep('sign-up')}>
            Create an account
          </Button>
        </AuthPanel>
      ) : step === 'check-email' ? (
        <AuthPanel title="Confirm your email" body="Open the confirmation link we sent you. After confirming, return here and sign in.">
          <Text style={styles.emailText}>{signInEmail || signUpEmail}</Text>
          <Button
            mode="contained"
            onPress={() => {
              setSignInEmail(signInEmail || signUpEmail);
              setStep('sign-in');
            }}
            style={styles.primaryButton}
          >
            Continue to sign in
          </Button>
        </AuthPanel>
      ) : step === 'account-unavailable' ? (
        <AuthPanel
          title="Signed in"
          body="Your account is signed in, but online account setup is not ready yet. Local trips still work."
        >
          <Button
            mode="contained-tonal"
            loading={loading}
            disabled={loading}
            onPress={() => void refresh()}
            style={styles.primaryButton}
          >
            Try again
          </Button>
          <Button
            mode="text"
            icon="logout"
            textColor={colors.textSecondary}
            disabled={loading}
            onPress={signOut}
          >
            Sign out
          </Button>
        </AuthPanel>
      ) : (
        <>
          <ProfilePanel
            completeMode={step === 'cloud-onboarding'}
            displayName={displayName}
            username={username}
            syncEnabled={syncEnabled}
            leaderboardOptIn={leaderboardOptIn}
            nearbyOptIn={nearbyOptIn}
            coarseLocationHash={coarseLocationHash}
            loading={loading}
            onDisplayNameChange={setDisplayName}
            onUsernameChange={setUsername}
            onSyncEnabledChange={setSyncEnabled}
            onLeaderboardOptInChange={setLeaderboardOptIn}
            onNearbyOptInChange={setNearbyOptIn}
            onCaptureCoarseLocation={captureCoarseLocation}
            onSave={() => void saveProfile(step === 'cloud-onboarding')}
          />

          {step === 'settings' && profile && (
            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>Automatic cloud backup</Text>
              <Text style={styles.body}>
                Trips on this phone stay in control. Backup sends local changes
                first and restore only adds trips missing from this phone.
              </Text>
              <Text style={styles.syncState}>
                Automatic cloud backup is {profile.syncEnabled ? 'on' : 'off'}.
                {` ${pendingSyncCount} local change${
                  pendingSyncCount === 1 ? '' : 's'
                } pending.`}
              </Text>
              <View style={styles.buttonRow}>
                <Button
                  mode="contained-tonal"
                  disabled={loading}
                  onPress={syncNow}
                >
                  Back up now
                </Button>
                <Button
                  mode="contained-tonal"
                  disabled={loading}
                  onPress={restoreNow}
                >
                  Restore
                </Button>
              </View>
            </View>
          )}

          {session && (
            <Button
              mode="text"
              icon="logout"
              textColor={colors.textSecondary}
              disabled={loading}
              onPress={signOut}
            >
              Sign out
            </Button>
          )}
        </>
      )}
    </ScrollView>
  );
};

const Landing: React.FC<{
  onSignUp: () => void;
  onSignIn: () => void;
  onOpenPrivacy?: () => void;
}> = ({ onSignUp, onSignIn, onOpenPrivacy }) => (
  <View style={styles.panel}>
    <BrandMark size={70} style={styles.landingMark} />
    <Text style={styles.title}>Account / Sync</Text>
        <Text style={styles.body}>
      Online features are optional. Your speedometer and local trips already
      work without an account.
    </Text>
    <Button mode="contained" onPress={onSignUp} style={styles.primaryButton}>
      Sign up
    </Button>
    <Button mode="contained-tonal" onPress={onSignIn}>
      Sign in
    </Button>
    {onOpenPrivacy && (
      <Button
        mode="text"
        icon="shield-lock-outline"
        onPress={onOpenPrivacy}
      >
        Privacy policy
      </Button>
    )}
  </View>
);

const AuthPanel: React.FC<{
  title: string;
  body: string;
  children?: React.ReactNode;
}> = ({ title, body, children }) => (
  <View style={styles.panel}>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.body}>{body}</Text>
    {children}
  </View>
);

const ProfilePanel: React.FC<{
  completeMode: boolean;
  displayName: string;
  username: string;
  syncEnabled: boolean;
  leaderboardOptIn: boolean;
  nearbyOptIn: boolean;
  coarseLocationHash: string | null;
  loading: boolean;
  onDisplayNameChange: (value: string) => void;
  onUsernameChange: (value: string) => void;
  onSyncEnabledChange: (value: boolean) => void;
  onLeaderboardOptInChange: (value: boolean) => void;
  onNearbyOptInChange: (value: boolean) => void;
  onCaptureCoarseLocation: () => void;
  onSave: () => void;
}> = ({
  completeMode,
  displayName,
  username,
  syncEnabled,
  leaderboardOptIn,
  nearbyOptIn,
  coarseLocationHash,
  loading,
  onDisplayNameChange,
  onUsernameChange,
  onSyncEnabledChange,
  onLeaderboardOptInChange,
  onNearbyOptInChange,
  onCaptureCoarseLocation,
  onSave,
}) => (
  <View style={styles.panel}>
    <Text style={styles.sectionTitle}>
      {completeMode ? 'Online feature setup' : 'Profile settings'}
    </Text>
    <Text style={styles.body}>
      {completeMode
        ? 'Choose what can be backed up or shown online. You can change this later.'
        : 'Edit your name, username, and online feature preferences.'}
    </Text>
    <TextInput
      mode="outlined"
      label="Name"
      value={displayName}
      onChangeText={onDisplayNameChange}
      style={styles.input}
    />
    <TextInput
      mode="outlined"
      label="Username"
      value={username}
      autoCapitalize="none"
      autoCorrect={false}
      onChangeText={onUsernameChange}
      style={styles.input}
    />
    <SettingToggle
      label="Automatic cloud backup"
      value={syncEnabled}
      onChange={onSyncEnabledChange}
    />
    <SettingToggle
      label="Leaderboards"
      value={leaderboardOptIn}
      onChange={onLeaderboardOptInChange}
    />
    <SettingToggle
      label="Nearby discovery"
      value={nearbyOptIn}
      onChange={onNearbyOptInChange}
    />
    <Button
      mode="contained-tonal"
      icon="map-marker-radius-outline"
      disabled={!nearbyOptIn || loading}
      onPress={onCaptureCoarseLocation}
      style={styles.secondaryButton}
    >
      {coarseLocationHash ? 'Update nearby area' : 'Save nearby area'}
    </Button>
    <Text style={styles.helper}>
      Nearby discovery stores only your general area. Exact routes and trip
      details are never shared for friend discovery.
    </Text>
    <Button
      mode="contained"
      loading={loading}
      disabled={
        loading || username.trim().length < 3 || displayName.trim().length < 1
      }
      onPress={onSave}
      style={styles.primaryButton}
    >
      {completeMode ? 'Finish setup' : 'Save changes'}
    </Button>
  </View>
);

const SettingToggle: React.FC<{
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}> = ({ label, value, onChange }) => (
  <View style={styles.toggleRow}>
    <Text style={styles.toggleLabel}>{label}</Text>
    <SegmentedButtons
      value={value ? 'on' : 'off'}
      onValueChange={(next) => onChange(next === 'on')}
      buttons={[
        { value: 'off', label: 'Off' },
        { value: 'on', label: 'On' },
      ]}
      style={styles.toggleButtons}
    />
  </View>
);

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  centerState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  centerMark: {
    marginBottom: spacing.md,
  },
  panel: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  landingMark: {
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  messagePanel: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accentMuted,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.displayBold,
    fontSize: 22,
    fontWeight: '800',
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.display,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },
  body: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.body,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.xs,
  },
  helper: {
    color: colors.textMuted,
    fontFamily: fontFamilies.body,
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
  syncState: {
    color: colors.accent,
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: spacing.sm,
  },
  message: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 13,
    fontWeight: '700',
  },
  emailText: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 15,
    fontWeight: '800',
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    marginTop: spacing.md,
  },
  primaryButton: {
    marginTop: spacing.md,
  },
  secondaryButton: {
    marginTop: spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  toggleRow: {
    marginTop: spacing.md,
  },
  toggleLabel: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  toggleButtons: {
    maxWidth: 220,
  },
});

export default AccountSyncScreen;
