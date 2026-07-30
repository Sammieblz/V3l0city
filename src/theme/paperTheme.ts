import {
  MD3DarkTheme,
  MD3LightTheme,
  configureFonts,
} from 'react-native-paper';

export const darkColors = {
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

/**
 * The light palette keeps the V3l0city instrument-panel identity while
 * providing appropriate contrast on a light canvas. Accent and warning hues
 * are intentionally darker than their dark-mode counterparts.
 */
export const lightColors: typeof darkColors = {
  accent: '#007F92',
  accentBright: '#009DB5',
  accentDim: 'rgba(0, 127, 146, 0.14)',
  accentMuted: 'rgba(0, 127, 146, 0.54)',
  brandGold: '#936000',
  brandGoldDim: 'rgba(147, 96, 0, 0.15)',
  brandTeal: '#007C8F',
  brandTealDim: 'rgba(0, 124, 143, 0.14)',
  heatmapLow: 'rgba(0, 124, 143, 0.32)',
  heatmapMid: 'rgba(0, 127, 146, 0.52)',
  background: '#F4F7F8',
  backgroundElevated: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceVariant: '#E7EEF0',
  surfaceGlass: 'rgba(255, 255, 255, 0.96)',
  surfaceSoft: '#EDF3F4',
  toastWarningBg: '#FFF7DE',
  toastErrorBg: '#FFF0F3',
  textPrimary: '#10191C',
  textSecondary: '#45555C',
  textMuted: '#68787E',
  onAccent: '#FFFFFF',
  onDanger: '#FFFFFF',
  danger: '#C72345',
  dangerDim: 'rgba(199, 35, 69, 0.14)',
  warning: '#936000',
  warningDim: 'rgba(147, 96, 0, 0.16)',
  border: '#C9D6DA',
  north: '#D42C36',
  gaugeTrack: '#C7D5D8',
  gaugeFill: '#007F92',
};

export type AppColorScheme = 'light' | 'dark';
export type AppColors = typeof darkColors;

/**
 * Existing screens import this stable object directly. Keeping its identity
 * while updating its semantic values lets dynamic JSX colors and regenerated
 * StyleSheets follow the active application theme.
 */
export const colors: AppColors = { ...darkColors };

export const setActiveColors = (colorScheme: AppColorScheme): void => {
  Object.assign(colors, colorScheme === 'light' ? lightColors : darkColors);
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

const createPaperTheme = (
  baseTheme: typeof MD3DarkTheme,
  themeColors: AppColors,
) => ({
  ...baseTheme,
  colors: {
    ...baseTheme.colors,
    primary: themeColors.accent,
    onPrimary: themeColors.onAccent,
    primaryContainer: themeColors.accentDim,
    onPrimaryContainer: themeColors.textPrimary,
    secondary: themeColors.brandGold,
    onSecondary: themeColors.onAccent,
    secondaryContainer: themeColors.brandGoldDim,
    onSecondaryContainer: themeColors.textPrimary,
    tertiary: themeColors.brandTeal,
    onTertiary: themeColors.onAccent,
    tertiaryContainer: themeColors.brandTealDim,
    onTertiaryContainer: themeColors.textPrimary,
    background: themeColors.background,
    surface: themeColors.surface,
    surfaceVariant: themeColors.surfaceVariant,
    onSurface: themeColors.textPrimary,
    onSurfaceVariant: themeColors.textSecondary,
    surfaceDisabled:
      baseTheme.dark ? 'rgba(234, 237, 242, 0.10)' : 'rgba(16, 25, 28, 0.10)',
    onSurfaceDisabled:
      baseTheme.dark ? 'rgba(234, 237, 242, 0.42)' : 'rgba(16, 25, 28, 0.42)',
    outline: themeColors.border,
    outlineVariant: themeColors.surfaceVariant,
    error: themeColors.danger,
    onError: themeColors.onDanger,
    errorContainer: themeColors.dangerDim,
    onErrorContainer: themeColors.textPrimary,
  },
  fonts: configureFonts({ config: paperFontConfig }),
});

export const darkTheme = createPaperTheme(MD3DarkTheme, darkColors);
export const lightTheme = createPaperTheme(MD3LightTheme, lightColors);
