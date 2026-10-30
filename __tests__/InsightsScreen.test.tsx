import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import InsightsScreen, { InsightsContent } from '../src/components/InsightsScreen';
import { getRecentTripsWithSpeedSamples } from '../src/database/tripRepository';
import type { TripSpeedSample, TripWithSpeedSamples } from '../src/domain/trip';

jest.mock('react-native-gifted-charts', () => ({
  BarChart: () => {
    const { Text: MockText } = require('react-native');
    return <MockText>BarChart</MockText>;
  },
  LineChart: jest.fn(() => {
    const { Text: MockText } = require('react-native');
    return <MockText>LineChart</MockText>;
  }),
  PieChart: () => {
    const { Text: MockText } = require('react-native');
    return <MockText>PieChart</MockText>;
  },
}));

jest.mock('../src/database/tripRepository', () => ({
  getRecentTripsWithSpeedSamples: jest.fn(),
}));

const sample: TripSpeedSample = {
  tripId: 'trip-1',
  sequence: 1,
  recordedAt: '2026-05-18T14:00:01.000Z',
  elapsedMs: 1000,
  speedMps: 10,
  distanceMeters: 10,
  headingDegrees: 90,
  headingSource: 'course',
  headingAccuracyDegrees: 4,
  headingQuality: 'good',
  headingReasons: ['course-used'],
  source: 'blended',
  quality: 'good',
  qualityScore: 0.9,
  qualityReasons: ['native-speed-used'],
  gpsAccuracyMeters: 5,
  fixAgeMs: 100,
  nativeSpeedUsed: true,
  isMoving: true,
  isStopped: false,
  stale: false,
};

const trip: TripWithSpeedSamples = {
  id: 'trip-1',
  startedAt: '2026-05-18T14:00:00.000Z',
  endedAt: '2026-05-18T14:05:00.000Z',
  totalDistanceMeters: 2000,
  maxSpeedMps: 20,
  averageSpeedMps: 8,
  units: 'km/h',
  mountLabel: 'top',
  speedSamples: [
    sample,
    {
      ...sample,
      sequence: 2,
      recordedAt: '2026-05-18T14:00:02.000Z',
      elapsedMs: 2000,
      speedMps: 12,
    },
  ],
};

it('offers retry for unreadable history instead of claiming there are no trips', async () => {
  jest.mocked(getRecentTripsWithSpeedSamples)
    .mockRejectedValueOnce(new Error('SQLITE_IOERR'))
    .mockResolvedValueOnce([trip]);
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<InsightsScreen units="MPH" />); });
  expect(renderer.root.findAllByProps({ testID: 'insights-empty' })).toHaveLength(0);
  expect(renderer.root.findAllByType(Text).some((node) => node.props.children === 'Trip insights couldn’t be opened')).toBe(true);
  await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Try opening saved trips again' }).props.onPress());
  expect(renderer.root.findByProps({ testID: 'insights-content' })).toBeTruthy();
  await act(async () => renderer.unmount());
});

it('shows a gap notice and observed points without connecting or filling missing intervals', async () => {
  const { LineChart: chart } = jest.requireMock('react-native-gifted-charts');
  chart.mockClear();
  const interrupted = { ...trip, recordingGaps: [{ id: 'gap', tripId: trip.id,
    reason: 'restart' as const, startedAt: trip.startedAt, endedAt: trip.endedAt }] };
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<InsightsContent units="MPH" trips={[interrupted]} />); });
  expect(chart.mock.calls.at(-1)[0]).toMatchObject({ areaChart: false, curved: false, color: 'transparent', thickness: 0 });
  expect(renderer.root.findAllByType(Text).some((node) =>
    typeof node.props.children === 'string' && node.props.children.includes('heatmap time excludes known gaps'))).toBe(true);
  await act(async () => renderer.unmount());
});

describe('InsightsContent', () => {
  it('renders an empty state', async () => {
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(<InsightsContent trips={[]} units="km/h" />);
    });

    expect(renderer?.root.findByProps({ testID: 'insights-empty' })).toBeTruthy();
  });

  it('renders analytics sections with recorded trips', async () => {
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(<InsightsContent trips={[trip]} units="MPH" />);
    });

    expect(renderer?.root.findByProps({ testID: 'insights-content' })).toBeTruthy();
    expect(renderer?.root.findAllByType(Text).some((node) => node.props.children === 'Average Speed')).toBe(true);
    expect(renderer?.root.findAllByType(Text).some((node) => node.props.children === 'Activity Heatmap')).toBe(true);
    expect(renderer?.root.findAllByProps({ testID: 'responsive-bar-chart' }).length).toBeGreaterThanOrEqual(3);
  });
});
