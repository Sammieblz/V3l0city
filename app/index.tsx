import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { StyleSheet, View } from 'react-native';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Speedometer from '../src/components/speedometer';
import { colors, darkTheme } from '../src/theme/paperTheme';
import { initDatabase } from '../src/database/database';

export default function App() {
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background).catch(() => undefined);
    initDatabase().then(() => setDbReady(true));
  }, []);

  if (!dbReady) {
    return <View style={styles.root} />;
  }

  return (
    <SafeAreaProvider style={styles.root}>
      <PaperProvider theme={darkTheme}>
        <StatusBar style="light" backgroundColor={colors.background} />
        <Speedometer />
      </PaperProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
