import type { TripSpeedSample } from '../domain/trip';
import { toWireSample } from './telemetryClient';

type TelemetrySocketOptions = {
  wsUrl: string;
  tripId: string;
  onAck: (batchId: string, lastSequence: number) => void;
  onClose: () => void;
  onError: (message: string) => void;
};

export class TelemetrySocket {
  private socket: WebSocket | null = null;

  constructor(private readonly options: TelemetrySocketOptions) {}

  connect(lastKnownSequence = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.options.wsUrl);
      this.socket = socket;

      const timeout = setTimeout(() => {
        reject(new Error('Telemetry WebSocket connection timed out.'));
        socket.close();
      }, 5000);

      socket.onopen = () => {
        clearTimeout(timeout);
        socket.send(
          JSON.stringify({
            type: 'hello',
            protocolVersion: 1,
            tripId: this.options.tripId,
            lastKnownSequence,
          })
        );
        resolve();
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data));
          if (message.type === 'ack') {
            this.options.onAck(
              String(message.batchId),
              Number(message.lastSequence)
            );
          } else if (message.type === 'error') {
            this.options.onError(String(message.message ?? 'Telemetry error'));
          }
        } catch {
          this.options.onError('Invalid telemetry WebSocket message.');
        }
      };

      socket.onerror = () => {
        clearTimeout(timeout);
        this.options.onError('Telemetry WebSocket error.');
      };

      socket.onclose = () => {
        clearTimeout(timeout);
        this.options.onClose();
      };
    });
  }

  isOpen() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  sendSampleBatch(batchId: string, samples: TripSpeedSample[]) {
    if (!this.isOpen()) {
      return false;
    }
    this.socket?.send(
      JSON.stringify({
        type: 'sample_batch',
        batchId,
        samples: samples.map(toWireSample),
      })
    );
    return true;
  }

  sendTripComplete(payload: {
    endedAt: string;
    totalDistanceMeters: number;
    maxSpeedMps: number;
    averageSpeedMps: number;
    finalSequence: number;
  }) {
    if (!this.isOpen()) {
      return false;
    }
    this.socket?.send(
      JSON.stringify({
        type: 'trip_complete',
        payload,
      })
    );
    return true;
  }

  close() {
    this.socket?.close();
    this.socket = null;
  }
}
