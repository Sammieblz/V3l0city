import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';

import BrandMark from './BrandMark';
import { colors, fontFamilies, radii, spacing } from '../theme/paperTheme';

type OnboardingScreenProps = {
  cloudConfigured: boolean;
  onContinueOffline: () => void;
  onSignIn: () => void;
  onSignUp: () => void;
  onOpenPrivacy: () => void;
};

const OnboardingScreen: React.FC<OnboardingScreenProps> = ({
  cloudConfigured,
  onContinueOffline,
  onSignIn,
  onSignUp,
  onOpenPrivacy,
}) => (
  <ScrollView
    contentContainerStyle={styles.content}
    showsVerticalScrollIndicator={false}
  >
    <View style={styles.hero}>
      <BrandMark size={74} style={styles.heroMark} />
      <Text style={styles.eyebrow}>Welcome to V3l0city</Text>
      <Text style={styles.title}>How do you want to start?</Text>
      <Text style={styles.body}>
        Use V3l0city offline, create an account, or sign in to restore an
        online backup.
      </Text>
    </View>

    <View style={styles.actions}>
      <Button mode="contained" disabled={!cloudConfigured} onPress={onSignUp}>
        Sign up
      </Button>
      <Button
        mode="contained-tonal"
        disabled={!cloudConfigured}
        onPress={onSignIn}
      >
        Sign in
      </Button>
      <Button mode="outlined" onPress={onContinueOffline}>
        Continue offline
      </Button>
      <Button mode="text" onPress={onOpenPrivacy}>
        Privacy policy
      </Button>
      {!cloudConfigured && (
        <Text style={styles.helper}>
          Online account features are not available in this build.
        </Text>
      )}
    </View>
  </ScrollView>
);

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  hero: {
    alignItems: 'center',
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
  },
  heroMark: {
    marginBottom: spacing.sm,
  },
  eyebrow: {
    color: colors.accent,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.displayBold,
    fontSize: 26,
    fontWeight: '900',
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  body: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.body,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  actions: {
    gap: spacing.sm,
  },
  helper: {
    color: colors.textMuted,
    fontFamily: fontFamilies.body,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
});

export default OnboardingScreen;
