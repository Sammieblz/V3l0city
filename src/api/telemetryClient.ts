import type { Trip, TripSpeedSample } from '../domain/trip';
import { HttpClient } from './httpClient';

export type RegisteredDeviceResponse = {
  deviceId: string;
  deviceToken: string;
};

export type StartTripResponse = {
  tripId: string;
  liveSessionId: string;
  sessionToken: string;
  wsUrl: string;
};

export type BatchUploadResponse = {
  batchId: string;
  inserted: number;
  lastSequence: number;
  duplicate: boolean;
};

export class TelemetryClient {
  constructor(private readonly http: HttpClient) {}

  registerDevice(input: {
    installId: string;
    platform: string;
    appVersion: string;
    buildNumber: string;
    expoPushToken?: string | null;
    nativePushToken?: string | null;
    pushPlatform?: string | null;
  }) {
    return this.http.requestWithRetry<RegisteredDeviceResponse>(
      '/v1/devices/register',
      {
        method: 'POST',
        body: input,
      }
    );
  }

  startTrip(token: string, trip: Trip) {
    return this.http.requestWithRetry<StartTripResponse>('/v1/trips', {
      method: 'POST',
      token,
      body: {
        clientTripId: trip.id,
        startedAt: trip.startedAt,
        units: trip.units,
        mountLabel: trip.mountLabel ?? null,
      },
    });
  }

  uploadSampleBatch(
    token: string,
    tripId: string,
    batchId: string,
    samples: TripSpeedSample[]
  ) {
    return this.http.requestWithRetry<BatchUploadResponse>(
      `/v1/trips/${encodeURIComponent(tripId)}/samples/batch`,
      {
        method: 'POST',
        token,
        body: {
          batchId,
          samples: samples.map(toWireSample),
        },
      },
      3
    );
  }

  completeTrip(token: string, trip: Trip, finalSequence: number) {
    return this.http.requestWithRetry<{ tripId: string; completed: boolean }>(
      `/v1/trips/${encodeURIComponent(trip.id)}/complete`,
      {
        method: 'POST',
        token,
        body: {
          endedAt: trip.endedAt,
          totalDistanceMeters: trip.totalDistanceMeters,
          maxSpeedMps: trip.maxSpeedMps,
          averageSpeedMps: trip.averageSpeedMps,
          finalSequence,
        },
      },
      3
    );
  }
}

export const toWireSample = (sample: TripSpeedSample) => ({
  sequence: sample.sequence,
  recordedAt: sample.recordedAt,
  elapsedMs: Math.round(sample.elapsedMs),
  speedMps: sample.speedMps,
  distanceMeters: sample.distanceMeters,
  headingDegrees: sample.headingDegrees,
  headingSource: sample.headingSource,
  headingAccuracyDegrees: sample.headingAccuracyDegrees,
  headingQuality: sample.headingQuality,
  headingReasons: sample.headingReasons,
  source: sample.source,
  quality: sample.quality,
  qualityScore: sample.qualityScore,
  qualityReasons: sample.qualityReasons,
  gpsAccuracyMeters: sample.gpsAccuracyMeters,
  fixAgeMs: sample.fixAgeMs == null ? null : Math.round(sample.fixAgeMs),
  nativeSpeedUsed: sample.nativeSpeedUsed,
  isMoving: sample.isMoving,
  isStopped: sample.isStopped,
  stale: sample.stale,
});
