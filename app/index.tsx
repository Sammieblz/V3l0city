import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Speedometer from './components/speedometer';
import { darkTheme } from './theme/paperTheme';
import { initDatabase } from './database/database';

export default function App() {
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    initDatabase().then(() => setDbReady(true));
  }, []);

  if (!dbReady) return null;

  return (
    <SafeAreaProvider>
      <PaperProvider theme={darkTheme}>
        <StatusBar style="light" translucent backgroundColor="transparent" />
        <Speedometer />
      </PaperProvider>
    </SafeAreaProvider>
  );
}
