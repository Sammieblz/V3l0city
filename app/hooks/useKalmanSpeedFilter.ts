import { useCallback, useRef } from 'react';
import { updateKalmanNoise } from '../utils/speedMath';
import {
  createKalmanFilter,
  filterValue,
  predictValue,
  resetKalmanFilter,
  type KalmanOptions,
} from '../utils/kalmanAdapter';

export const useKalmanSpeedFilter = (options: KalmanOptions) => {
  const initialOptionsRef = useRef(options);
  const filterRef = useRef(createKalmanFilter(options));

  const filterSpeed = useCallback(
    (
      speedMps: number,
      accuracyMeters: number | null | undefined,
      timeDiffSeconds: number
    ) => {
      updateKalmanNoise(filterRef.current, accuracyMeters, timeDiffSeconds);
      return filterValue(filterRef.current, speedMps);
    },
    []
  );

  const predictSpeed = useCallback((deltaSpeedMps: number) => {
    return predictValue(filterRef.current, deltaSpeedMps);
  }, []);

  const resetFilter = useCallback(() => {
    filterRef.current = resetKalmanFilter(
      filterRef.current,
      initialOptionsRef.current
    );
  }, []);

  return { filterSpeed, predictSpeed, resetFilter };
};
