
import React from 'react';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import CustomStatusBar from './components/CustomStatusBar';
import Speedometer from './components/speedometer';
import { darkTheme } from './theme/paperTheme';

export default function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={darkTheme}>
        <CustomStatusBar barStyle="light-content" backgroundColor="#1A1A1A" />
        <Speedometer />
      </PaperProvider>
    </SafeAreaProvider>
  );
}
