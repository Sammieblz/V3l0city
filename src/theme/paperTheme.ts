import { MD3DarkTheme } from 'react-native-paper';

export const colors = {
  accent: '#00E5FF',
  accentDim: 'rgba(0, 229, 255, 0.15)',
  accentMuted: 'rgba(0, 229, 255, 0.5)',
  background: '#0F1114',
  backgroundElevated: '#12151A',
  surface: '#1A1D23',
  surfaceVariant: '#22262E',
  surfaceGlass: 'rgba(26, 29, 35, 0.92)',
  surfaceSoft: '#171A20',
  textPrimary: '#EAEDF2',
  textSecondary: '#8A8F98',
  textMuted: '#585E68',
  danger: '#FF4C6B',
  dangerDim: 'rgba(255, 76, 107, 0.15)',
  warning: '#FFAA00',
  border: '#2A2E36',
  north: '#FF3B30',
  gaugeTrack: '#2A2E36',
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

export const motion = {
  fastMs: 160,
  normalMs: 240,
  headingMs: 420,
  drawerMs: 260,
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: colors.accent,
    onPrimary: '#000000',
    background: colors.background,
    surface: colors.surface,
    surfaceVariant: colors.surfaceVariant,
    onSurface: colors.textPrimary,
    onSurfaceVariant: colors.textSecondary,
    outline: colors.border,
    error: colors.danger,
  },
};
