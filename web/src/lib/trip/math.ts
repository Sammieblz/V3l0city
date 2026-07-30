export type Coordinate = { latitude: number; longitude: number; timestamp: number };

const earthRadiusMeters = 6_371_000;
const radians = (value: number) => (value * Math.PI) / 180;

export function distanceBetween(first: Coordinate, second: Coordinate) {
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const firstLatitude = radians(first.latitude);
  const secondLatitude = radians(second.latitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function derivedSpeed(previous: Coordinate | null, next: Coordinate, reportedSpeed: number | null) {
  if (typeof reportedSpeed === "number" && Number.isFinite(reportedSpeed) && reportedSpeed >= 0) return reportedSpeed;
  if (!previous) return 0;
  const elapsedSeconds = Math.max(0.001, (next.timestamp - previous.timestamp) / 1000);
  return distanceBetween(previous, next) / elapsedSeconds;
}

export function coarseLocationCell(latitude: number, longitude: number) {
  // 0.1 degree rounding is intentionally coarse (~11 km latitude) and avoids retaining precise coordinates.
  return `${(Math.round(latitude * 10) / 10).toFixed(1)},${(Math.round(longitude * 10) / 10).toFixed(1)}`;
}

export function tripInsights(trips: Array<{ totalDistanceMeters: number; maxSpeedMps: number; averageSpeedMps: number; startedAt: string; endedAt: string }>) {
  const totalDistanceMeters = trips.reduce((total, trip) => total + trip.totalDistanceMeters, 0);
  const totalDurationMs = trips.reduce((total, trip) => total + Math.max(0, new Date(trip.endedAt).getTime() - new Date(trip.startedAt).getTime()), 0);
  return {
    tripCount: trips.length,
    totalDistanceMeters,
    totalDurationMs,
    maxSpeedMps: Math.max(0, ...trips.map((trip) => trip.maxSpeedMps)),
    averageSpeedMps: totalDurationMs > 0 ? totalDistanceMeters / (totalDurationMs / 1000) : 0,
  };
}
