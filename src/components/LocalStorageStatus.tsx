import React from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { colors, radii, spacing } from '../theme/paperTheme';
import { useThemedStyles } from '../theme/appTheme';

type Props = {
  title: string;
  message: string;
  onRetry?: () => void;
};

/** Uses system fonts so storage failures remain readable before font loading. */
export default function LocalStorageStatus({ title, message, onRetry }: Props) {
  const styles = useThemedStyles(createStyles);
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.content} accessibilityLiveRegion="polite">
        {!onRetry && <ActivityIndicator color={colors.accent} size="large" />}
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        {onRetry && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try opening saved trips again"
            onPress={onRetry}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const createStyles = () => StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  content: { width: '100%', maxWidth: 480, gap: spacing.md },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: '700', textAlign: 'center' },
  message: { color: colors.textSecondary, fontSize: 16, textAlign: 'center' },
  button: {
    minHeight: 48,
    padding: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  pressed: { opacity: 0.7 },
  buttonText: { color: colors.onAccent, fontSize: 16, fontWeight: '700' },
});
