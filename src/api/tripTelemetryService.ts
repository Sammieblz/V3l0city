import type { Trip, TripSpeedSample } from '../domain/trip';
import {
  getPendingTripSpeedSamples,
  markTripSpeedSamplesUploaded,
  markTripSpeedSamplesUploadError,
} from '../database/tripRepository';
import { logSensorWarning } from '../utils/logging';
import { getTelemetryConfig } from './config';
import {
  getLocalInstallIdentity,
  getRegisteredDeviceIdentity,
  saveRegisteredDeviceIdentity,
} from './deviceIdentity';
import { HttpClient } from './httpClient';
import { TelemetryClient } from './telemetryClient';
import { TelemetrySocket } from './telemetrySocket';

type ActiveTelemetryTrip = {
  trip: Trip;
  deviceToken: string;
  remoteTripId: string;
  socket: TelemetrySocket | null;
  pendingSamples: TripSpeedSample[];
  lastAckedSequence: number;
  reconnectAttempts: number;
};

const LIVE_BATCH_SIZE = 5;

class TripTelemetryService {
  private active: ActiveTelemetryTrip | null = null;
  private client: TelemetryClient | null = null;

  isEnabled() {
    return getTelemetryConfig().enabled;
  }

  async startTrip(trip: Trip): Promise<void> {
    const config = getTelemetryConfig();
    if (!config.enabled || !config.apiUrl) {
      return;
    }

    try {
      this.client = new TelemetryClient(new HttpClient(config.apiUrl));
      const identity = await this.ensureRegisteredDevice();
      const remote = await this.client.startTrip(identity.deviceToken, trip);
      const active: ActiveTelemetryTrip = {
        trip,
        deviceToken: identity.deviceToken,
        remoteTripId: remote.tripId,
        socket: null,
        pendingSamples: [],
        lastAckedSequence: 0,
        reconnectAttempts: 0,
      };
      this.active = active;
      const wsUrl = `${config.wsUrl}/v1/trips/${encodeURIComponent(
        remote.tripId
      )}/live?sessionToken=${encodeURIComponent(remote.sessionToken)}`;
      await this.openSocket(active, wsUrl);
    } catch (error) {
      logSensorWarning(
        `Telemetry start failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  recordSample(sample: TripSpeedSample): void {
    const active = this.active;
    if (!active || sample.tripId !== active.trip.id) {
      return;
    }

    active.pendingSamples.push(sample);
    this.flushLiveBatch(active);
  }

  async completeTrip(trip: Trip): Promise<void> {
    const active = this.active;
    if (!active || !this.client || active.trip.id !== trip.id) {
      return;
    }

    try {
      if (active.lastAckedSequence > 0) {
        await markTripSpeedSamplesUploaded(trip.id, active.lastAckedSequence);
      }

      const pending = await getPendingTripSpeedSamples(trip.id);
      if (pending.length > 0) {
        await this.uploadHttpBatches(active, pending);
      }

      const finalSequence = Math.max(
        active.lastAckedSequence,
        pending.at(-1)?.sequence ?? 0
      );
      active.socket?.sendTripComplete({
        endedAt: trip.endedAt,
        totalDistanceMeters: trip.totalDistanceMeters,
        maxSpeedMps: trip.maxSpeedMps,
        averageSpeedMps: trip.averageSpeedMps,
        finalSequence,
      });
      await this.client.completeTrip(active.deviceToken, trip, finalSequence);
    } catch (error) {
      await markTripSpeedSamplesUploadError(
        trip.id,
        active.lastAckedSequence + 1,
        error instanceof Error ? error.message : String(error)
      ).catch(() => undefined);
      logSensorWarning(
        `Telemetry completion failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      active.socket?.close();
      this.active = null;
    }
  }

  stop(): void {
    this.active?.socket?.close();
    this.active = null;
  }

  private async ensureRegisteredDevice() {
    const local = await getLocalInstallIdentity();
    const existing = await getRegisteredDeviceIdentity();
    const pushRegistrationCurrent =
      (existing?.registeredExpoPushToken ?? null) ===
        (local.expoPushToken ?? null) &&
      (existing?.registeredNativePushToken ?? null) ===
        (local.nativePushToken ?? null);

    if (existing && pushRegistrationCurrent) {
      return existing;
    }

    if (!this.client) {
      throw new Error('Telemetry client is not configured.');
    }
    const registered = await this.client.registerDevice(local);
    await saveRegisteredDeviceIdentity(
      registered.deviceId,
      registered.deviceToken,
      {
        expoPushToken: local.expoPushToken,
        nativePushToken: local.nativePushToken,
      }
    );
    return { ...local, ...registered };
  }

  private async openSocket(active: ActiveTelemetryTrip, wsUrl: string) {
    const socket = new TelemetrySocket({
      wsUrl,
      tripId: active.remoteTripId,
      onAck: (batchId, lastSequence) => {
        active.lastAckedSequence = Math.max(
          active.lastAckedSequence,
          lastSequence
        );
        active.pendingSamples = active.pendingSamples.filter(
          (sample) => sample.sequence > lastSequence
        );
        if (batchId !== 'hello') {
          void markTripSpeedSamplesUploaded(active.trip.id, lastSequence).catch(
            () => undefined
          );
        }
      },
      onClose: () => {
        if (this.active === active) {
          void this.scheduleReconnect(active, wsUrl);
        }
      },
      onError: (message) => {
        logSensorWarning(`Telemetry WebSocket error: ${message}`);
      },
    });

    active.socket = socket;
    await socket.connect(active.lastAckedSequence);
  }

  private flushLiveBatch(active: ActiveTelemetryTrip) {
    if (active.pendingSamples.length < LIVE_BATCH_SIZE || !active.socket?.isOpen()) {
      return;
    }

    const samples = active.pendingSamples.slice(0, LIVE_BATCH_SIZE);
    const batchId = `${active.trip.id}-ws-${samples[0].sequence}-${samples.at(-1)?.sequence}`;
    const sent = active.socket.sendSampleBatch(batchId, samples);
    if (!sent) {
      void this.scheduleReconnect(active);
    }
  }

  private async scheduleReconnect(active: ActiveTelemetryTrip, wsUrl?: string) {
    if (active.reconnectAttempts >= 3 || !wsUrl) {
      return;
    }

    active.reconnectAttempts += 1;
    await new Promise((resolve) =>
      setTimeout(resolve, active.reconnectAttempts * 1000)
    );
    if (this.active !== active) {
      return;
    }

    try {
      await this.openSocket(active, wsUrl);
      active.reconnectAttempts = 0;
      this.flushLiveBatch(active);
    } catch (error) {
      logSensorWarning(
        `Telemetry reconnect failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private async uploadHttpBatches(
    active: ActiveTelemetryTrip,
    samples: TripSpeedSample[]
  ) {
    if (!this.client) {
      return;
    }

    for (let index = 0; index < samples.length; index += 60) {
      const batch = samples.slice(index, index + 60);
      const batchId = `${active.trip.id}-http-${batch[0].sequence}-${batch.at(-1)?.sequence}`;
      const result = await this.client.uploadSampleBatch(
        active.deviceToken,
        active.remoteTripId,
        batchId,
        batch
      );
      await markTripSpeedSamplesUploaded(active.trip.id, result.lastSequence);
      active.lastAckedSequence = Math.max(
        active.lastAckedSequence,
        result.lastSequence
      );
    }
  }
}

export const tripTelemetryService = new TripTelemetryService();
