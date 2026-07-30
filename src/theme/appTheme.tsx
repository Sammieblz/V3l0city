import React, { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import type { ColorSchemeName } from 'react-native';

import { colors, type AppColorScheme, type AppColors } from './paperTheme';

export type ThemeSelection = 'system' | AppColorScheme;

export const resolveAppColorScheme = (
  preference: ThemeSelection,
  systemColorScheme: ColorSchemeName,
): AppColorScheme => {
  if (preference === 'light' || preference === 'dark') {
    return preference;
  }

  return systemColorScheme === 'light' ? 'light' : 'dark';
};

type AppThemeContextValue = {
  colorScheme: AppColorScheme;
  colors: AppColors;
};

const AppThemeContext = createContext<AppThemeContextValue>({
  colorScheme: 'dark',
  colors,
});

type AppThemeProviderProps = PropsWithChildren<{
  colorScheme: AppColorScheme;
}>;

export const AppThemeProvider: React.FC<AppThemeProviderProps> = ({
  colorScheme,
  children,
}) => {
  const value = useMemo(
    () => ({ colorScheme, colors }),
    [colorScheme],
  );

  return (
    <AppThemeContext.Provider value={value}>
      {children}
    </AppThemeContext.Provider>
  );
};

export const useAppTheme = (): AppThemeContextValue =>
  useContext(AppThemeContext);

/**
 * Most native screens use StyleSheet objects for performance. Recreate them
 * when the color scheme changes so light mode updates custom surfaces as well
 * as React Native Paper controls.
 */
export const useThemedStyles = <T,>(
  factory: (colorScheme: AppColorScheme) => T,
): T => {
  const { colorScheme } = useAppTheme();
  return useMemo(() => factory(colorScheme), [colorScheme, factory]);
};
