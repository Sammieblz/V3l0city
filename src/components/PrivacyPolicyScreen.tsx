import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  mobileLegalContactDetails,
  mobileLegalDocuments,
} from '../content/legalDocuments';
import { LEGAL_DOCUMENT_ORDER, type LegalDocumentId } from '../../legal/legalDocuments';
import { colors, fontFamilies, radii, spacing } from '../theme/paperTheme';
import { useThemedStyles } from '../theme/appTheme';

/**
 * A single in-app legal center deliberately renders the same shared documents
 * as the web release. Cookie language remains visible for clarity, while
 * explaining that cookies are a browser-only concern.
 */
const PrivacyPolicyScreen: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const [activeDocumentId, setActiveDocumentId] =
    useState<LegalDocumentId>('privacy');
  const activeDocument = mobileLegalDocuments[activeDocumentId];

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Legal & privacy</Text>
        <Text style={styles.title}>Clear terms. Clear choices.</Text>
        <Text style={styles.updated}>
          Effective {mobileLegalContactDetails.legalEffectiveDate} · Version{' '}
          {mobileLegalContactDetails.termsVersion}
        </Text>
      </View>

      <ScrollView
        horizontal
        contentContainerStyle={styles.documentTabs}
        showsHorizontalScrollIndicator={false}
      >
        {LEGAL_DOCUMENT_ORDER.map((documentId) => {
          const document = mobileLegalDocuments[documentId];
          const selected = documentId === activeDocumentId;

          return (
            <Pressable
              key={documentId}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={`Open ${document.navigationLabel}`}
              onPress={() => setActiveDocumentId(documentId)}
              style={[styles.documentTab, selected && styles.documentTabActive]}
            >
              <Text
                style={[
                  styles.documentTabText,
                  selected && styles.documentTabTextActive,
                ]}
              >
                {document.navigationLabel}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.documentIntro}>
        <Text style={styles.documentEyebrow}>{activeDocument.eyebrow}</Text>
        <Text style={styles.documentTitle}>{activeDocument.title}</Text>
        <Text style={styles.body}>{activeDocument.intro}</Text>
      </View>

      {activeDocument.sections.map((section) => (
        <View key={section.title} style={styles.panel}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {section.paragraphs.map((paragraph) => (
            <Text key={paragraph} style={styles.body}>
              {paragraph}
            </Text>
          ))}
        </View>
      ))}
    </ScrollView>
  );
};

const createStyles = () => StyleSheet.create({
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
  documentTabs: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  documentTab: {
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  documentTabActive: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accent,
  },
  documentTabText: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 12,
    fontWeight: '700',
  },
  documentTabTextActive: {
    color: colors.accent,
  },
  documentIntro: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  documentEyebrow: {
    color: colors.accent,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  documentTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.displayBold,
    fontSize: 22,
    fontWeight: '900',
    marginTop: spacing.xxs,
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
