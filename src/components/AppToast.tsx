import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Snackbar } from 'react-native-paper';

import { colors, radii, spacing } from '../theme/paperTheme';

export type AppToastVariant = 'info' | 'success' | 'warning' | 'error';

export type AppToastMessage = {
  message: string;
  variant?: AppToastVariant;
};

type AppToastProps = {
  toast: AppToastMessage | null;
  bottom: number;
  onDismiss: () => void;
};

const variantStyle: Record<
  AppToastVariant,
  {
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    accent: string;
    background: string;
  }
> = {
  info: {
    icon: 'information-outline',
    accent: colors.accent,
    background: 'rgba(12, 14, 18, 0.98)',
  },
  success: {
    icon: 'check-circle-outline',
    accent: colors.accent,
    background: 'rgba(10, 20, 24, 0.98)',
  },
  warning: {
    icon: 'alert-outline',
    accent: colors.warning,
    background: 'rgba(27, 21, 10, 0.98)',
  },
  error: {
    icon: 'alert-circle-outline',
    accent: colors.danger,
    background: 'rgba(30, 13, 18, 0.98)',
  },
};

export default function AppToast({ toast, bottom, onDismiss }: AppToastProps) {
  const variant = toast?.variant ?? 'info';
  const visual = variantStyle[variant];

  return (
    <Snackbar
      visible={toast != null}
      onDismiss={onDismiss}
      duration={2600}
      wrapperStyle={[styles.wrapper, { bottom }] as StyleProp<ViewStyle>}
      style={[
        styles.container,
        {
          backgroundColor: visual.background,
          borderColor: visual.accent,
        },
      ]}
    >
      <View style={styles.content}>
        <MaterialCommunityIcons
          name={visual.icon}
          size={18}
          color={visual.accent}
        />
        <Text style={styles.message}>{toast?.message}</Text>
      </View>
    </Snackbar>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    left: spacing.md,
    right: spacing.md,
  },
  container: {
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  message: {
    color: '#F8FAFC',
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
  },
});
