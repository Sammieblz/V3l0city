import React from 'react';
import { act, create } from 'react-test-renderer';

import { useKalmanSpeedFilter } from '../src/hooks/useKalmanSpeedFilter';
import { DEFAULT_KALMAN_OPTIONS } from '../src/utils/constants';

type Props = {
  callback: (api: {
    filter: (v: number, accuracy: number | null, dt: number) => number;
    predict: (dv: number) => number;
    reset: () => void;
  }) => void;
};

const Harness: React.FC<Props> = ({ callback }) => {
  const { filterSpeed, predictSpeed, resetFilter } =
    useKalmanSpeedFilter(DEFAULT_KALMAN_OPTIONS);

  callback({
    filter: (v, accuracy, dt) => filterSpeed(v, accuracy, dt),
    predict: (dv) => predictSpeed(dv),
    reset: () => resetFilter(),
  });

  return null;
};

describe('useKalmanSpeedFilter', () => {
  it('filters and predicts values without throwing', () => {
    let apiRef:
      | {
          filter: (v: number, accuracy: number | null, dt: number) => number;
          predict: (dv: number) => number;
          reset: () => void;
        }
      | undefined;

    act(() => {
      create(
        <Harness
          callback={(api) => {
            apiRef = api;
          }}
        />
      );
    });

    if (!apiRef) {
      throw new Error('Harness did not expose API');
    }

    const filtered = apiRef.filter(10, 5, 1);
    const predicted = apiRef.predict(2);

    expect(filtered).toBeGreaterThanOrEqual(0);
    expect(predicted).toBeGreaterThanOrEqual(0);

    expect(() => apiRef?.reset()).not.toThrow();
  });
});

