import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { Pressable, Text, useColorScheme, View } from 'react-native';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import Speedometer from '../src/components/speedometer';
import LocalStorageStatus from '../src/components/LocalStorageStatus';
import {
  colors, darkTheme, lightTheme, setActiveColors,
} from '../src/theme/paperTheme';
import { AppThemeProvider, resolveAppColorScheme } from '../src/theme/appTheme';
import { getLegacyImportResults, initDatabase } from '../src/database/database';
import { LocalStorageError } from '../src/database/storageErrors';
import {
  getPreferences,
  type ThemePreference,
} from '../src/database/preferencesRepository';

export default function App() {
  const [storageState, setStorageState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [newerData, setNewerData] = useState(false);
  const [legacyNotice, setLegacyNotice] = useState(false);
  const preparing = useRef(false);
  const mounted = useRef(false);
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

  const prepare = useCallback(async () => {
    if (preparing.current) return;
    preparing.current = true;
    setStorageState('loading');
    try {
      await initDatabase();
      const preferences = await getPreferences();
      if (mounted.current) {
        setThemePreference(preferences?.themePreference ?? 'system');
        setLegacyNotice(getLegacyImportResults().some((result) => result.status === 'retained'));
        setStorageState('ready');
      }
    } catch (error) {
      if (mounted.current) {
        setNewerData(error instanceof LocalStorageError && error.code === 'unsupported_schema');
        setStorageState('error');
      }
    } finally {
      preparing.current = false;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void prepare();
    return () => { mounted.current = false; };
  }, [prepare]);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background).catch(
      () => undefined,
    );
  }, [colorScheme]);

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: colors.background }}>
      <AppThemeProvider colorScheme={colorScheme}>
        <PaperProvider theme={paperTheme}>
          <StatusBar
            style={colorScheme === 'dark' ? 'light' : 'dark'}
            backgroundColor={colors.background}
          />
          {storageState === 'ready' && (fontsLoaded || fontLoadError) ? (
            <View style={{ flex: 1 }}>
              {legacyNotice && (
                <SafeAreaView edges={['top']} style={{ backgroundColor: colors.surface }}>
                  <View style={{ paddingHorizontal: 16, paddingBottom: 8 }} accessibilityLiveRegion="polite">
                    <Text style={{ color: colors.textPrimary, fontSize: 15 }}>
                      Some older data couldn’t be imported. It remains on this device; current trips are available.
                    </Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="Dismiss older data notice"
                      onPress={() => setLegacyNotice(false)}
                      style={({ pressed }) => ({ minHeight: 48, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                      <Text style={{ color: colors.accent, fontSize: 16 }}>Dismiss</Text>
                    </Pressable>
                  </View>
                </SafeAreaView>
              )}
              <Speedometer
                themePreference={themePreference}
                onThemePreferenceChange={setThemePreference}
              />
            </View>
          ) : (
            <SafeAreaView style={{ flex: 1 }}>
              <LocalStorageStatus
                title={storageState === 'error' ? 'Saved trips couldn’t be opened' : 'Opening V3l0city'}
                message={storageState === 'error'
                  ? newerData
                    ? 'Your saved trips need a newer version of V3l0city. Update the app, then try again.'
                    : 'Check available device storage, then try again. Your saved data has not been reset.'
                  : 'Preparing your saved trips and settings.'}
                onRetry={storageState === 'error' ? () => { void prepare(); } : undefined}
              />
            </SafeAreaView>
          )}
        </PaperProvider>
      </AppThemeProvider>
    </SafeAreaProvider>
  );
}
