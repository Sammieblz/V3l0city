import React from 'react';
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Snackbar } from 'react-native-paper';

import { colors, fontFamilies, radii, spacing } from '../theme/paperTheme';

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
    background: colors.surfaceGlass,
  },
  success: {
    icon: 'check-circle-outline',
    accent: colors.brandTeal,
    background: colors.surfaceGlass,
  },
  warning: {
    icon: 'alert-outline',
    accent: colors.brandGold,
    background: colors.toastWarningBg,
  },
  error: {
    icon: 'alert-circle-outline',
    accent: colors.danger,
    background: colors.toastErrorBg,
  },
};

export default function AppToast({ toast, bottom, onDismiss }: AppToastProps) {
  const variant = toast?.variant ?? 'info';
  const visual = variantStyle[variant];
  const { width } = useWindowDimensions();
  const toastWidth = Math.min(Math.max(width - spacing.md * 2, 0), 420);

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
          width: toastWidth,
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
    alignItems: 'center',
    left: 0,
    paddingHorizontal: spacing.md,
    right: 0,
  },
  container: {
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 8,
    marginHorizontal: 0,
    shadowColor: colors.background,
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
    color: colors.textPrimary,
    flex: 1,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
  },
});
