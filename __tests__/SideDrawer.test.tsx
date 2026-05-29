import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import SideDrawer from '../src/components/SideDrawer';

const groups = [
  {
    key: 'drive',
    title: 'Drive',
    description: 'History and analytics',
    icon: 'steering',
    items: [
      {
        key: 'history',
        title: 'History',
        description: 'View trip history',
        icon: 'history',
        onPress: jest.fn(),
      },
      {
        key: 'insights',
        title: 'Insights',
        description: 'Charts and trends',
        icon: 'chart-line',
        onPress: jest.fn(),
      },
    ],
  },
  {
    key: 'social',
    title: 'Social',
    description: 'Friends and rankings',
    icon: 'account-group-outline',
    items: [
      {
        key: 'leaderboards',
        title: 'Leaderboards',
        description: 'Compare aggregate stats',
        icon: 'trophy-outline',
        onPress: jest.fn(),
      },
    ],
  },
];

const titleProps = (renderer: ReactTestRenderer) =>
  renderer.root.findAll((node) => typeof node.props.title === 'string');

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, right: 0, bottom: 34, left: 0 },
};

describe('SideDrawer', () => {
  it('renders group rows at root and drills into a submenu', async () => {
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <SafeAreaProvider initialMetrics={safeAreaMetrics}>
          <SideDrawer visible groups={groups} onDismiss={jest.fn()} />
        </SafeAreaProvider>,
      );
    });

    if (!renderer) {
      throw new Error('SideDrawer renderer was not created');
    }

    expect(titleProps(renderer).map((node) => node.props.title)).toEqual(
      expect.arrayContaining(['Drive', 'Social']),
    );
    expect(titleProps(renderer).map((node) => node.props.title)).not.toContain(
      'History',
    );

    const driveRow = titleProps(renderer).find(
      (node) => node.props.title === 'Drive',
    );
    if (!driveRow) {
      throw new Error('Drive row was not rendered');
    }

    await act(async () => {
      driveRow.props.onPress();
    });

    expect(titleProps(renderer).map((node) => node.props.title)).toEqual(
      expect.arrayContaining(['Back', 'History', 'Insights']),
    );
    expect(titleProps(renderer).map((node) => node.props.title)).not.toContain(
      'Social',
    );

    const backRow = titleProps(renderer).find(
      (node) => node.props.title === 'Back',
    );
    if (!backRow) {
      throw new Error('Back row was not rendered');
    }

    await act(async () => {
      backRow.props.onPress();
    });

    expect(titleProps(renderer).map((node) => node.props.title)).toEqual(
      expect.arrayContaining(['Drive', 'Social']),
    );
  });
});
