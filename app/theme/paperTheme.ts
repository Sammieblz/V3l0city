import { MD3DarkTheme } from 'react-native-paper';

export const colors = {
  accent: '#00E5FF',
  accentDim: 'rgba(0, 229, 255, 0.15)',
  accentMuted: 'rgba(0, 229, 255, 0.5)',
  background: '#0F1114',
  surface: '#1A1D23',
  surfaceVariant: '#22262E',
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
