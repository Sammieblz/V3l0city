import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  PRIVACY_POLICY_SECTIONS,
  PRIVACY_POLICY_UPDATED_AT,
} from '../content/privacyPolicy';
import { colors, fontFamilies, radii, spacing } from '../theme/paperTheme';

const PrivacyPolicyScreen: React.FC = () => (
  <ScrollView
    contentContainerStyle={styles.content}
    showsVerticalScrollIndicator={false}
  >
    <View style={styles.hero}>
      <Text style={styles.eyebrow}>Privacy Policy</Text>
      <Text style={styles.title}>Your data stays yours first.</Text>
      <Text style={styles.updated}>Last updated {PRIVACY_POLICY_UPDATED_AT}</Text>
    </View>

    {PRIVACY_POLICY_SECTIONS.map((section) => (
      <View key={section.title} style={styles.panel}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        {section.body.map((paragraph) => (
          <Text key={paragraph} style={styles.body}>
            {paragraph}
          </Text>
        ))}
      </View>
    ))}
  </ScrollView>
);

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  hero: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
  },
  eyebrow: {
    color: colors.accent,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.displayBold,
    fontSize: 24,
    fontWeight: '900',
    marginTop: spacing.xs,
  },
  updated: {
    color: colors.textMuted,
    fontFamily: fontFamilies.body,
    fontSize: 12,
    marginTop: spacing.sm,
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.display,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  body: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.body,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.xs,
  },
});

export default PrivacyPolicyScreen;
