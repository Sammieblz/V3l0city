import { MD3DarkTheme, configureFonts } from 'react-native-paper';

export const colors = {
  accent: '#00E5FF',
  accentBright: '#33F7FF',
  accentDim: 'rgba(0, 229, 255, 0.14)',
  accentMuted: 'rgba(0, 229, 255, 0.5)',
  brandGold: '#FFD21A',
  brandGoldDim: 'rgba(255, 210, 26, 0.16)',
  brandTeal: '#00AFC7',
  brandTealDim: 'rgba(0, 175, 199, 0.16)',
  heatmapLow: 'rgba(0, 175, 199, 0.36)',
  heatmapMid: 'rgba(0, 229, 255, 0.56)',
  background: '#0F1114',
  backgroundElevated: '#111719',
  surface: '#151A1D',
  surfaceVariant: '#1E2528',
  surfaceGlass: 'rgba(21, 26, 29, 0.94)',
  surfaceSoft: '#12191B',
  toastWarningBg: 'rgba(30, 27, 16, 0.98)',
  toastErrorBg: 'rgba(30, 13, 18, 0.98)',
  textPrimary: '#EAEDF2',
  textSecondary: '#8A8F98',
  textMuted: '#5D6A70',
  onAccent: '#031013',
  onDanger: '#FFFFFF',
  danger: '#FF4C6B',
  dangerDim: 'rgba(255, 76, 107, 0.15)',
  warning: '#FFD21A',
  warningDim: 'rgba(255, 210, 26, 0.16)',
  border: '#283137',
  north: '#FF3B30',
  gaugeTrack: '#283137',
  gaugeFill: '#00E5FF',
};

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radii = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

export const typography = {
  label: 11,
  body: 14,
  title: 18,
  appTitle: 20,
};

export const fontFamilies = {
  body: 'Barlow-Regular',
  bodyMedium: 'Barlow-Medium',
  bodySemiBold: 'Barlow-SemiBold',
  bodyBold: 'Barlow-Bold',
  display: 'Rajdhani-SemiBold',
  displayMedium: 'Rajdhani-Medium',
  displayBold: 'Rajdhani-Bold',
  numeric: 'Rajdhani-Medium',
};

export const motion = {
  fastMs: 160,
  normalMs: 240,
  headingMs: 420,
  drawerMs: 260,
};

const paperFontConfig = {
  displayLarge: { fontFamily: fontFamilies.displayBold, fontWeight: '700' },
  displayMedium: { fontFamily: fontFamilies.displayBold, fontWeight: '700' },
  displaySmall: { fontFamily: fontFamilies.display, fontWeight: '600' },
  headlineLarge: { fontFamily: fontFamilies.displayBold, fontWeight: '700' },
  headlineMedium: { fontFamily: fontFamilies.displayBold, fontWeight: '700' },
  headlineSmall: { fontFamily: fontFamilies.display, fontWeight: '600' },
  titleLarge: { fontFamily: fontFamilies.bodyBold, fontWeight: '700' },
  titleMedium: { fontFamily: fontFamilies.bodySemiBold, fontWeight: '600' },
  titleSmall: { fontFamily: fontFamilies.bodySemiBold, fontWeight: '600' },
  labelLarge: { fontFamily: fontFamilies.bodySemiBold, fontWeight: '600' },
  labelMedium: { fontFamily: fontFamilies.bodySemiBold, fontWeight: '600' },
  labelSmall: { fontFamily: fontFamilies.bodyMedium, fontWeight: '500' },
  bodyLarge: { fontFamily: fontFamilies.body, fontWeight: '400' },
  bodyMedium: { fontFamily: fontFamilies.body, fontWeight: '400' },
  bodySmall: { fontFamily: fontFamilies.body, fontWeight: '400' },
} as const;

export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: colors.accent,
    onPrimary: colors.onAccent,
    primaryContainer: colors.accentDim,
    onPrimaryContainer: colors.textPrimary,
    secondary: colors.brandGold,
    onSecondary: colors.onAccent,
    secondaryContainer: colors.brandGoldDim,
    onSecondaryContainer: colors.textPrimary,
    tertiary: colors.brandTeal,
    onTertiary: colors.onAccent,
    tertiaryContainer: colors.brandTealDim,
    onTertiaryContainer: colors.textPrimary,
    background: colors.background,
    surface: colors.surface,
    surfaceVariant: colors.surfaceVariant,
    onSurface: colors.textPrimary,
    onSurfaceVariant: colors.textSecondary,
    surfaceDisabled: 'rgba(234, 237, 242, 0.10)',
    onSurfaceDisabled: 'rgba(234, 237, 242, 0.42)',
    outline: colors.border,
    outlineVariant: colors.surfaceVariant,
    error: colors.danger,
    onError: colors.onDanger,
    errorContainer: colors.dangerDim,
    onErrorContainer: colors.textPrimary,
  },
  fonts: configureFonts({ config: paperFontConfig }),
};
