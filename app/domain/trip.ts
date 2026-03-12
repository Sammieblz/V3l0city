import type { Units } from '../utils/speedMath';

export type Trip = {
  id: string;
  startedAt: string;
  endedAt: string;
  totalDistanceMeters: number;
  maxSpeedMps: number;
  averageSpeedMps: number;
  units: Units;
  mountLabel?: string;
};

