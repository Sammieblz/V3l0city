import { getTelemetryConfig } from '../src/api/config';
import { HttpClient } from '../src/api/httpClient';
import { TelemetryClient, toWireSample } from '../src/api/telemetryClient';
import { TelemetrySocket } from '../src/api/telemetrySocket';
import type { TripSpeedSample } from '../src/domain/trip';

const sample: TripSpeedSample = {
  tripId: 'trip-1',
  sequence: 1,
  recordedAt: '2026-05-19T12:00:01.000Z',
  elapsedMs: 1000,
  speedMps: 12.5,
  distanceMeters: 12,
  headingDegrees: 91,
  headingSource: 'course',
  headingAccuracyDegrees: 4,
  headingQuality: 'good',
  headingReasons: ['course-used'],
  source: 'blended',
  quality: 'good',
  qualityScore: 0.95,
  qualityReasons: ['native-speed-used'],
  gpsAccuracyMeters: 5,
  fixAgeMs: 100,
  nativeSpeedUsed: true,
  isMoving: true,
  isStopped: false,
  stale: false,
  uploadedAt: null,
  uploadError: null,
};

describe('telemetry API client', () => {
  const originalApiUrl = process.env.EXPO_PUBLIC_V3L0CITY_API_URL;
  const originalWsUrl = process.env.EXPO_PUBLIC_V3L0CITY_WS_URL;

  afterEach(() => {
    process.env.EXPO_PUBLIC_V3L0CITY_API_URL = originalApiUrl;
    process.env.EXPO_PUBLIC_V3L0CITY_WS_URL = originalWsUrl;
    jest.restoreAllMocks();
  });

  it('disables telemetry when API env vars are missing', () => {
    delete process.env.EXPO_PUBLIC_V3L0CITY_API_URL;
    delete process.env.EXPO_PUBLIC_V3L0CITY_WS_URL;

    expect(getTelemetryConfig()).toEqual({
      enabled: false,
      apiUrl: null,
      wsUrl: null,
    });
  });

  it('disables telemetry when API env vars still contain placeholders', () => {
    process.env.EXPO_PUBLIC_V3L0CITY_API_URL = 'http://<lan-ip>:8787 \\';
    process.env.EXPO_PUBLIC_V3L0CITY_WS_URL = 'ws://<lan-ip>:8787 \\';

    expect(getTelemetryConfig()).toEqual({
      enabled: false,
      apiUrl: null,
      wsUrl: null,
    });
  });

  it('normalizes valid telemetry URLs', () => {
    process.env.EXPO_PUBLIC_V3L0CITY_API_URL = 'http://localhost:8787/';
    process.env.EXPO_PUBLIC_V3L0CITY_WS_URL = 'ws://localhost:8787/';

    expect(getTelemetryConfig()).toEqual({
      enabled: true,
      apiUrl: 'http://localhost:8787',
      wsUrl: 'ws://localhost:8787',
    });
  });

  it('registers devices through the HTTP client', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({ deviceId: 'device-1', deviceToken: 'token-1' })
        ),
    } as Response);
    const client = new TelemetryClient(new HttpClient('https://api.example.test'));

    const response = await client.registerDevice({
      installId: 'install-123',
      platform: 'ios',
      appVersion: '1.0.0',
      buildNumber: '1',
    });

    expect(response).toEqual({ deviceId: 'device-1', deviceToken: 'token-1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/v1/devices/register',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          installId: 'install-123',
          platform: 'ios',
          appVersion: '1.0.0',
          buildNumber: '1',
        }),
      })
    );
  });

  it('serializes telemetry samples for HTTP and WebSocket payloads', () => {
    expect(toWireSample(sample)).toMatchObject({
      sequence: 1,
      speedMps: 12.5,
      qualityScore: 0.95,
      qualityReasons: ['native-speed-used'],
      headingSource: 'course',
      headingAccuracyDegrees: 4,
      headingQuality: 'good',
      headingReasons: ['course-used'],
      nativeSpeedUsed: true,
    });
  });
});

describe('telemetry WebSocket manager', () => {
  class MockWebSocket {
    static OPEN = 1;
    static last: MockWebSocket | null = null;
    readyState = MockWebSocket.OPEN;
    sent: string[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;

    constructor(readonly url: string) {
      MockWebSocket.last = this;
    }

    send(message: string) {
      this.sent.push(message);
    }

    close() {
      this.onclose?.();
    }
  }

  const originalWebSocket = global.WebSocket;

  beforeEach(() => {
    global.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    global.WebSocket = originalWebSocket;
    MockWebSocket.last = null;
  });

  it('opens a socket, sends hello, and processes ack messages', async () => {
    const onAck = jest.fn();
    const socket = new TelemetrySocket({
      wsUrl: 'ws://localhost/v1/trips/trip-1/live?sessionToken=token',
      tripId: 'trip-1',
      onAck,
      onClose: jest.fn(),
      onError: jest.fn(),
    });

    const connect = socket.connect(0);
    MockWebSocket.last?.onopen?.();
    await connect;

    expect(MockWebSocket.last?.sent[0]).toContain('"type":"hello"');
    expect(socket.sendSampleBatch('batch-1', [sample])).toBe(true);
    MockWebSocket.last?.onmessage?.({
      data: JSON.stringify({
        type: 'ack',
        batchId: 'batch-1',
        lastSequence: 1,
      }),
    });

    expect(onAck).toHaveBeenCalledWith('batch-1', 1);
  });
});
