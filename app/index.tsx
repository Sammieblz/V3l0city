import React, { useEffect, useMemo, useState } from 'react';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useColorScheme, View } from 'react-native';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Speedometer from '../src/components/speedometer';
import {
  colors, darkTheme, lightTheme, setActiveColors,
} from '../src/theme/paperTheme';
import { AppThemeProvider, resolveAppColorScheme } from '../src/theme/appTheme';
import { initDatabase } from '../src/database/database';
import {
  getPreferences,
  type ThemePreference,
} from '../src/database/preferencesRepository';

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [themePreference, setThemePreference] =
    useState<ThemePreference>('system');
  const systemColorScheme = useColorScheme();
  const colorScheme = resolveAppColorScheme(
    themePreference,
    systemColorScheme,
  );
  const paperTheme = useMemo(
    () => (colorScheme === 'light' ? lightTheme : darkTheme),
    [colorScheme],
  );

  // Update the stable palette object before descendants render. Existing
  // screens import that object directly, while their themed StyleSheets are
  // rebuilt by AppThemeProvider when the scheme changes.
  setActiveColors(colorScheme);

  const [fontsLoaded, fontLoadError] = useFonts({
    'Barlow-Regular': require('../assets/fonts/Barlow-Regular.ttf'),
    'Barlow-Medium': require('../assets/fonts/Barlow-Medium.ttf'),
    'Barlow-SemiBold': require('../assets/fonts/Barlow-SemiBold.ttf'),
    'Barlow-Bold': require('../assets/fonts/Barlow-Bold.ttf'),
    'Rajdhani-Medium': require('../assets/fonts/Rajdhani-Medium.ttf'),
    'Rajdhani-SemiBold': require('../assets/fonts/Rajdhani-SemiBold.ttf'),
    'Rajdhani-Bold': require('../assets/fonts/Rajdhani-Bold.ttf'),
  });

  useEffect(() => {
    const prepare = async () => {
      await initDatabase();
      const preferences = await getPreferences();
      setThemePreference(preferences?.themePreference ?? 'system');
      setDbReady(true);
    };

    void prepare();
  }, []);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background).catch(
      () => undefined,
    );
  }, [colorScheme]);

  if (!dbReady || (!fontsLoaded && !fontLoadError)) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: colors.background }}>
      <AppThemeProvider colorScheme={colorScheme}>
        <PaperProvider theme={paperTheme}>
          <StatusBar
            style={colorScheme === 'dark' ? 'light' : 'dark'}
            backgroundColor={colors.background}
          />
          <Speedometer
            themePreference={themePreference}
            onThemePreferenceChange={setThemePreference}
          />
        </PaperProvider>
      </AppThemeProvider>
    </SafeAreaProvider>
  );
}
