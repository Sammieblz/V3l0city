import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import TripHistory from '../src/components/TripHistory';
import type { Trip } from '../src/domain/trip';

describe('TripHistory', () => {
  it('renders empty state and a list of trips', async () => {
    let empty: ReactTestRenderer | undefined;
    await act(async () => {
      empty = create(<TripHistory trips={[]} onClear={jest.fn()} />);
    });
    if (!empty) {
      throw new Error('Empty TripHistory renderer was not created');
    }
    expect(empty.toJSON()).toMatchSnapshot();

    const trips: Trip[] = [
      {
        id: '1',
        startedAt: new Date(0).toISOString(),
        endedAt: new Date(1000).toISOString(),
        totalDistanceMeters: 1000,
        maxSpeedMps: 10,
        averageSpeedMps: 5,
        units: 'km/h',
        mountLabel: 'top',
      },
    ];

    let withTrips: ReactTestRenderer | undefined;
    await act(async () => {
      withTrips = create(<TripHistory trips={trips} onClear={jest.fn()} />);
    });
    if (!withTrips) {
      throw new Error('TripHistory renderer was not created');
    }
    expect(withTrips.toJSON()).toMatchSnapshot();
  });
});
