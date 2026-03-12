import React from 'react';
import { create } from 'react-test-renderer';

import TripHistory from '../app/components/TripHistory';
import type { Trip } from '../app/domain/trip';

describe('TripHistory', () => {
  it('renders empty state and a list of trips', () => {
    const empty = create(<TripHistory trips={[]} onClear={jest.fn()} />);
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

    const withTrips = create(
      <TripHistory trips={trips} onClear={jest.fn()} />
    );
    expect(withTrips.toJSON()).toMatchSnapshot();
  });
});

