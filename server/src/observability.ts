import { createHash, timingSafeEqual } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { Writable } from 'node:stream';
import type { FastifyBaseLogger } from 'fastify';

const routes = new Set([
  '/v1/devices/register', '/v1/trips', '/v1/trips/:tripId',
  '/v1/trips/:tripId/samples/batch', '/v1/trips/:tripId/complete', '/v1/trips/:tripId/live',
  '/health/live', '/health/ready', '/internal/metrics',
]);
const methods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const lifecycleCodes = new Set(['server_started', 'server_stopping', 'server_stopped', 'shutdown_timeout', 'shutdown_failed']);
const durationBounds = [0.005, 0.025, 0.1, 0.5, 2.5, 10] as const;
const maxLogQueue = 100;
const maxHttpSeries = 256;
const sinkDeadlineMs = 1000;

type MessageKind = 'ping' | 'hello' | 'sample_batch' | 'trip_complete' | 'invalid' | 'unauthorized';
type MessageResult = 'accepted' | 'rejected' | 'error';
type CloseKind = 'normal' | 'policy' | 'abnormal' | 'other';
type LogEvent = {
  level: 'info' | 'warn' | 'error'; event: 'http_completed' | 'ws_opened' | 'ws_closed' | 'runtime';
  requestId?: string; method?: string; route?: string; status?: number; durationMs?: number;
  close?: CloseKind; code?: string;
};
export type ObservationWriter = { write(message: string): void | boolean | Promise<void | boolean> };
const writableAdapters = new WeakMap<Writable, ObservationWriter>();

/** One error listener per stream; await write completion without blocking API paths. */
export function createWritableObservationWriter(stream: Writable): ObservationWriter {
  const existing = writableAdapters.get(stream);
  if (existing) return existing;
  let failed = false;
  stream.on('error', () => { failed = true; });
  const writer: ObservationWriter = {
    write: (message) => new Promise<void>((resolve, reject) => {
      if (failed || stream.destroyed) { reject(new Error('Observation stream is unavailable.')); return; }
      try {
        // false means accepted backpressure; the callback signals completion/error.
        stream.write(message, (error) => {
          if (error) reject(new Error('Observation stream write failed.'));
          else resolve();
        });
      } catch { reject(new Error('Observation stream write failed.')); }
    }),
  };
  writableAdapters.set(stream, writer);
  return writer;
}
type HttpSeries = {
  method: string; route: string; status: string; count: number; durationSeconds: number; buckets: number[];
};

/** No request object, exception, client identifier or arbitrary label enters this collector. */
export class TelemetryObservability {
  private readonly http = new Map<string, HttpSeries>();
  private readonly messages = new Map<string, number>();
  private readonly closes: Record<CloseKind, number> = { normal: 0, policy: 0, abnormal: 0, other: 0 };
  private connections = 0;
  private active = 0;
  private ready = 0;
  private readinessChecks = 0;
  private readinessFailures = 0;
  private storeValidationFailures = 0;
  private sinkFailures = 0;
  private droppedLogs = 0;
  private droppedSeries = 0;
  private clockFailures = 0;
  private readonly queue: string[] = [];
  private sinkBusy = false;
  private sinkDisabled = false;

  constructor(private readonly options: { writer?: ObservationWriter; clock?: () => number } = {}) {}

  timestamp(): number {
    try {
      const value = (this.options.clock ?? (() => performance.now()))();
      if (Number.isFinite(value) && value >= 0) return value;
    } catch { /* Observation failure must not change the request result. */ }
    this.clockFailures++;
    return performance.now();
  }

  httpCompleted(requestId: string, method: string, route: string | undefined, status: number, started: number): void {
    const safeMethod = methods.has(method) ? method : 'OTHER';
    const safeRoute = route && routes.has(route) ? route : 'unmatched';
    const safeStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? status : 500;
    const statusClass = `${Math.floor(safeStatus / 100)}xx`;
    const elapsed = Math.max(0, this.timestamp() - started) / 1000;
    const key = `${safeMethod}|${safeRoute}|${statusClass}`;
    let series = this.http.get(key);
    if (!series && this.http.size < maxHttpSeries) {
      series = { method: safeMethod, route: safeRoute, status: statusClass, count: 0, durationSeconds: 0, buckets: durationBounds.map(() => 0) };
      this.http.set(key, series);
    }
    if (series) {
      series.count++;
      series.durationSeconds += elapsed;
      durationBounds.forEach((bound, index) => { if (elapsed <= bound) series!.buckets[index]++; });
    } else this.droppedSeries++;
    this.log({ level: safeStatus >= 500 ? 'error' : 'info', event: 'http_completed', requestId,
      method: safeMethod, route: safeRoute, status: safeStatus, durationMs: Math.round(elapsed * 1000) });
  }

  socketOpened(requestId: string): (code?: number) => void {
    this.connections++;
    this.active++;
    this.log({ level: 'info', event: 'ws_opened', requestId, route: '/v1/trips/:tripId/live' });
    let closed = false;
    return (code?: number) => {
      if (closed) return;
      closed = true;
      this.active = Math.max(0, this.active - 1);
      const close: CloseKind = code === 1000 ? 'normal' : code === 1008 ? 'policy' : code === 1006 ? 'abnormal' : 'other';
      this.closes[close]++;
      this.log({ level: 'info', event: 'ws_closed', requestId, route: '/v1/trips/:tripId/live', close });
    };
  }

  socketMessage(kind: MessageKind, result: MessageResult): void {
    const key = `${kind}|${result}`;
    this.messages.set(key, (this.messages.get(key) ?? 0) + 1);
  }

  storeReadiness(ready: boolean): void {
    this.ready = ready ? 1 : 0;
    this.readinessChecks++;
    if (!ready) this.readinessFailures++;
  }

  storeValidationFailed(): void { this.storeValidationFailures++; }

  frameworkLogger(): FastifyBaseLogger {
    const record = (level: LogEvent['level'], args: unknown[]) => {
      const input = args[0];
      const code = typeof input === 'object' && input !== null && 'code' in input && typeof input.code === 'string'
        && lifecycleCodes.has(input.code) ? input.code : undefined;
      if (code || level !== 'info') this.log({ level, event: 'runtime', code: code ?? (level === 'error' ? 'framework_error' : 'framework_warning') });
    };
    const logger: FastifyBaseLogger = {
      level: 'info', info: (...args: unknown[]) => record('info', args),
      error: (...args: unknown[]) => record('error', args), fatal: (...args: unknown[]) => record('error', args),
      warn: (...args: unknown[]) => record('warn', args), debug: () => {}, trace: () => {}, silent: () => {},
      // Fastify's request bindings and arbitrary child fields never enter our output.
      child: () => logger,
    };
    return logger;
  }

  snapshot() {
    return {
      http: [...this.http.values()].map((value) => ({ ...value, buckets: [...value.buckets] })),
      websocket: { connections: this.connections, active: this.active,
        messages: Object.fromEntries(this.messages), closes: { ...this.closes } },
      sqlite: { ready: this.ready, checks: this.readinessChecks, failures: this.readinessFailures,
        validationFailures: this.storeValidationFailures },
      monitoring: { sinkFailures: this.sinkFailures, droppedLogs: this.droppedLogs,
        queuedLogs: this.queue.length, droppedSeries: this.droppedSeries, clockFailures: this.clockFailures },
    };
  }

  prometheus(): string {
    const output = [
      '# TYPE v3l0city_telemetry_http_requests_total counter',
      '# TYPE v3l0city_telemetry_http_duration_seconds histogram',
    ];
    for (const row of this.snapshot().http) {
      const labels = `method="${row.method}",route="${row.route}",status="${row.status}"`;
      output.push(`v3l0city_telemetry_http_requests_total{${labels}} ${row.count}`);
      durationBounds.forEach((bound, index) => output.push(`v3l0city_telemetry_http_duration_seconds_bucket{${labels},le="${bound}"} ${row.buckets[index]}`));
      output.push(`v3l0city_telemetry_http_duration_seconds_bucket{${labels},le="+Inf"} ${row.count}`,
        `v3l0city_telemetry_http_duration_seconds_count{${labels}} ${row.count}`,
        `v3l0city_telemetry_http_duration_seconds_sum{${labels}} ${row.durationSeconds}`);
    }
    output.push('# TYPE v3l0city_telemetry_ws_connections_total counter', `v3l0city_telemetry_ws_connections_total ${this.connections}`,
      '# TYPE v3l0city_telemetry_ws_active gauge', `v3l0city_telemetry_ws_active ${this.active}`,
      '# TYPE v3l0city_telemetry_ws_messages_total counter');
    for (const [key, value] of this.messages) {
      const [kind, result] = key.split('|');
      output.push(`v3l0city_telemetry_ws_messages_total{kind="${kind}",result="${result}"} ${value}`);
    }
    output.push('# TYPE v3l0city_telemetry_ws_closes_total counter');
    for (const [kind, value] of Object.entries(this.closes)) output.push(`v3l0city_telemetry_ws_closes_total{kind="${kind}"} ${value}`);
    output.push('# TYPE v3l0city_telemetry_sqlite_ready gauge', `v3l0city_telemetry_sqlite_ready ${this.ready}`);
    const counters = { sqlite_checks: this.readinessChecks, sqlite_not_ready: this.readinessFailures,
      sqlite_ws_validation_failures: this.storeValidationFailures,
      log_sink_failures: this.sinkFailures, logs_dropped: this.droppedLogs,
      metric_series_dropped: this.droppedSeries, observation_clock_failures: this.clockFailures };
    for (const [name, value] of Object.entries(counters)) output.push(`# TYPE v3l0city_telemetry_${name}_total counter`, `v3l0city_telemetry_${name}_total ${value}`);
    return `${output.join('\n')}\n`;
  }

  private log(event: LogEvent): void {
    if (!this.options.writer) return;
    if (this.sinkDisabled || this.queue.length >= maxLogQueue) { this.droppedLogs++; return; }
    this.queue.push(`${JSON.stringify({ time: new Date().toISOString(), service: 'telemetry', ...event })}\n`);
    this.schedule();
  }

  private schedule(): void {
    if (this.sinkBusy || this.sinkDisabled || !this.queue.length) return;
    this.sinkBusy = true;
    const scheduled = setImmediate(() => {
      const line = this.queue.shift()!;
      let finished = false;
      const finish = (failed: boolean) => {
        if (finished) return;
        finished = true;
        clearTimeout(deadline);
        this.sinkBusy = false;
        if (failed) {
          this.sinkFailures++;
          this.sinkDisabled = true;
          this.droppedLogs += this.queue.length + 1;
          this.queue.length = 0;
        } else this.schedule();
      };
      const deadline = setTimeout(() => finish(true), sinkDeadlineMs);
      deadline.unref();
      try {
        Promise.resolve(this.options.writer!.write(line)).then((result) => finish(result === false), () => finish(true));
      } catch { finish(true); }
    });
    scheduled.unref();
  }
}

/** Hash both values to a fixed size before timing-safe comparison; never accept query credentials. */
export function metricsAuthorized(header: unknown, token: string): boolean {
  if (typeof header !== 'string' || !header.startsWith('Bearer ') || header.length > 263) return false;
  return timingSafeEqual(createHash('sha256').update(header.slice(7)).digest(), createHash('sha256').update(token).digest());
}

export function validateMetricsToken(token: string | undefined): void {
  if (token !== undefined && !/^[A-Za-z0-9_-]{32,256}$/.test(token)) throw new Error('Invalid metrics authentication configuration.');
}
