
import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import Speedometer from './components/speedometer';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'

export default function App() {
  const isDarkMode = true
  return (
    <SafeAreaProvider>
    <CustomStatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={'red'}
    />
    <Speedometer/>
    <SafeAreaView style={{ flex: 1 }}>

        
    </SafeAreaView>
</SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1A1A1A", 

  },
});

const CustomStatusBar = ({backgroundColor, ...props}) => {
  const { top } = useSafeAreaInsets()

  return (
      <View style={{ height: (StatusBar.currentHeight || top), backgroundColor }}>
          <SafeAreaView style={{ backgroundColor }}>
              <StatusBar translucent backgroundColor={backgroundColor} {...props} />
          </SafeAreaView>
      </View>
  )
}