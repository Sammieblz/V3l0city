import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import AverageSpeedDisplay from '../src/components/AverageSpeedDisplay';
import {
  AppThemeProvider,
  resolveAppColorScheme,
} from '../src/theme/appTheme';
import {
  colors,
  darkColors,
  lightColors,
  setActiveColors,
} from '../src/theme/paperTheme';

describe('native application theme', () => {
  afterEach(() => {
    setActiveColors('dark');
  });

  it('rebuilds custom Speedometer child styles when the palette changes', async () => {
    let renderer: ReactTestRenderer | undefined;

    setActiveColors('dark');
    await act(async () => {
      renderer = create(
        <AppThemeProvider colorScheme="dark">
          <AverageSpeedDisplay averageSpeed={47} unitLabel="MPH" />
        </AppThemeProvider>,
      );
    });

    if (!renderer) {
      throw new Error('Theme test renderer was not created');
    }

    const valueText = () =>
      renderer!.root
        .findAllByType(Text)
        .find(
          (node) =>
            StyleSheet.flatten(node.props.style)?.fontFamily ===
            'Rajdhani-Medium',
        );

    const darkValueText = valueText();
    if (!darkValueText) {
      throw new Error('Average speed value was not rendered');
    }

    expect(StyleSheet.flatten(darkValueText.props.style).color).toBe(
      darkColors.textPrimary,
    );

    setActiveColors('light');
    await act(async () => {
      renderer!.update(
        <AppThemeProvider colorScheme="light">
          <AverageSpeedDisplay averageSpeed={47} unitLabel="MPH" />
        </AppThemeProvider>,
      );
    });

    const lightValueText = valueText();
    if (!lightValueText) {
      throw new Error('Average speed value was not rendered after theme update');
    }

    expect(StyleSheet.flatten(lightValueText.props.style).color).toBe(
      lightColors.textPrimary,
    );
    expect(colors.background).toBe(lightColors.background);
  });

  it('uses the system appearance unless the local preference overrides it', () => {
    expect(resolveAppColorScheme('system', 'light')).toBe('light');
    expect(resolveAppColorScheme('system', 'dark')).toBe('dark');
    expect(resolveAppColorScheme('light', 'dark')).toBe('light');
    expect(resolveAppColorScheme('dark', 'light')).toBe('dark');
  });
});
