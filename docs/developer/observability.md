# Telemetry observability

This is the first OPS03 slice for the existing telemetry service. It observes
the `/v1` HTTP/WebSocket service and its actual SQLite store. The product `/v2`
API remains declared and unmounted. PostgreSQL, Redis, voice, maps, billing,
mobile consent and cloud providers are not reported as monitored services.

## Structured logs and correlation

`startRuntime` enables JSON logs to stdout. Direct `buildServer` callers retain
the existing explicit `logger:true` opt-in. Every HTTP request gets a fresh
server-generated UUID and an `x-request-id` response header. Incoming
`x-request-id`, `request-id`, trace headers and other client correlation values
are ignored. Socket open/close events use that upgrade request's generated ID;
IDs identify one request/connection, not a driver, device or trip.

`server/src/observability.ts` owns an explicit log vocabulary. Completed HTTP
events contain only a service name, timestamp, level, generated request ID,
normalized method, approved route template, numeric status and elapsed duration.
Socket events contain the same generated connection correlation, a static route
template and a bounded close classification. Runtime diagnostics retain approved
codes such as `server_started`, `server_stopping`, `server_stopped`,
`shutdown_failed` and `shutdown_timeout`. Other framework warnings/errors become
generic `framework_warning`/`framework_error` events.

Framework request/response/error serializers and child logger bindings do not
enter the output. Default logs never contain raw URLs, query strings, path
parameters, request/response headers or bodies, exception messages/stacks,
tokens, user/device/trip IDs, socket close reasons or location/sensor content.
Unknown routes, including routes later registered by a plugin, use `unmatched`
until explicitly reviewed and added to the fixed route allowlist. Raw framework
listen URLs are replaced by `server_started`. Do not reintroduce arbitrary
payload logging to troubleshoot an incident; use generated correlation IDs and
approved aggregate outcomes.

The existing stable public error bodies and telemetry protocol are preserved.
Request IDs appear in logs and response headers, never metric labels.

## Aggregate metrics

The collector is in process, needs no SDK, and performs no network export. Values
reset when the process restarts; multiple instances must be aggregated by the
monitoring deployment. Request/sensor payloads are neither buffered nor retained
by the collector.

| Metric | Meaning and bounded dimensions |
| --- | --- |
| `v3l0city_telemetry_http_requests_total` | Completed HTTP count by approved route template, normalized method and status class (`2xx`, `4xx`, etc.) |
| `v3l0city_telemetry_http_duration_seconds` | Cumulative histogram/count/sum using the same dimensions |
| `v3l0city_telemetry_ws_connections_total` | Upgraded telemetry socket count, including connections subsequently rejected by authorization |
| `v3l0city_telemetry_ws_active` | Currently open upgraded sockets; decremented once per close |
| `v3l0city_telemetry_ws_messages_total` | Protocol messages by fixed kind and accepted/rejected/error result |
| `v3l0city_telemetry_ws_closes_total` | Close count classified normal (1000), policy (1008), abnormal (1006), or other; no reasons/IDs |
| `v3l0city_telemetry_sqlite_ready` | Latest actual SQLite readiness probe, 1 or 0 |
| `v3l0city_telemetry_sqlite_checks_total` / `sqlite_not_ready_total` | Actual probe count and unsuccessful probes |
| `v3l0city_telemetry_sqlite_ws_validation_failures_total` | Store exceptions during initial/message/idle socket authorization, without exception content |
| `v3l0city_telemetry_log_sink_failures_total` / `logs_dropped_total` | Logging failures and discarded best-effort log entries |
| `v3l0city_telemetry_metric_series_dropped_total` | New HTTP series discarded after the fixed collector limit |
| `v3l0city_telemetry_observation_clock_failures_total` | Invalid/throwing observation clock calls replaced with the monotonic system clock |

HTTP durations use a monotonic clock. Histogram boundaries are 0.005, 0.025,
0.1, 0.5, 2.5, 10 and positive infinity seconds. They are engineering observation
boundaries, not agreed latency targets. HTTP status labels use classes to bound
cardinality, while logs retain numeric status. HTTP series are capped at 256.
Unmatched paths share one series per method/status class rather than creating a
series per path. Socket message kinds are ping, hello, sample batch, trip
completion, invalid and unauthorized; results are accepted, rejected and error.
An accepted sample message means the existing durable handler accepted it, not
proof that a client received the acknowledgement. A 1008 close may represent
expiry, revocation or protocol rejection and does not identify which driver.

WebSocket upgrades have their own connection/message/close counters. Do not
assume all upgrades appear as completed HTTP responses. Counter changes support
scraper-side rate calculations; no polling timer or unbounded time-series
history is kept in the application.

Readiness is sampled when the store is built, by `/health/ready`, by an
authenticated metrics scrape and after store closure. It is a sampled store
signal, not continuous monitoring or a claim about future dependencies. Service
readiness also accounts for shutdown. `/health/ready` continues to report
`service:telemetry`, `apiVersions:[1]`, `productApiEnabled:false`; store failure
returns 503. Liveness remains independent of store availability.
Socket store revalidation fails closed on exceptions, including an unavailable
SQLite handle. Initial upgrades, incoming messages and idle timer checks share
the same guarded validation path. Existing authorization error/1008 close shapes
are preserved; the failure counter and readiness probe expose the outage without
throwing from an event callback and terminating the runtime.

## Optional authenticated scrape

By default `/internal/metrics` is absent (404). To expose the Prometheus text
endpoint, explicitly set both variables before startup:

```text
V3L0CITY_METRICS_ENABLED=true
V3L0CITY_METRICS_TOKEN=<dedicated random token from operator secret tooling>
```

The token must contain 32–256 ASCII letters, digits, underscores or hyphens.
Enabling export without a valid token rejects startup with field names only.
Supplying a token while export is disabled does not mount the route. Runtime
configuration and secrets must never be logged or committed. The `.env.example`
is a reference; the service does not automatically load it.

The scraper sends `Authorization: Bearer <token>` to `GET /internal/metrics`.
Missing/incorrect authorization returns 401; query-string tokens are not
accepted. Comparison hashes both values to fixed sizes before a timing-safe
comparison. Successful text responses and authentication failures have
`Cache-Control:no-store`. Export uses the existing HTTP listener; configure
operational ingress access and TLS or loopback transport accordingly. Rotate the
dedicated secret through operator tooling and restart the service. No public
discovery endpoint or external exporter is installed.

An unavailable SQLite store is exposed as readiness 0 while the authenticated
scrape still works. An export-generation failure returns a generic 503 for the
metrics request; it does not change telemetry routes. Scrapes themselves count
as completed HTTP requests, with their effects visible in subsequent scrapes.

## Failure isolation and resource limits

Observation updates are synchronous bounded in-memory counters. They perform no
external IO. Log writes run after request/socket handling through a queue capped
at 100 entries, with at most one write in flight. Requests never await the writer.
A thrown/rejected write, a backpressure (`false`) result, or a write unresolved
for one second opens the log sink circuit until restart. Pending/subsequent log
entries are dropped and counted. A full queue drops entries immediately. No
exception content is logged when monitoring fails; the metrics counters provide
the failure signal.

The default stdout destination uses `createWritableObservationWriter`, which
waits for the Node Writable completion callback and handles asynchronous stream
errors such as EPIPE. Normal Writable backpressure (`write` returning false)
means the chunk was accepted; this adapter waits for completion rather than
opening the circuit. It caches one adapter/error listener per stream. Use this
adapter for Node Writable destinations; a simple `ObservationWriter` returning
false explicitly requests that its output circuit stop. A slow/unresolved
completion still reaches the bounded deadline without blocking API work.

Queue scheduling and writer deadlines are unreferenced so monitoring work cannot
keep the process alive. Logs are best effort and may be dropped at shutdown;
there is no blocking final flush. The internal collector remains available if
the log sink fails. `loggerStream` is a trusted local adapter and must return
promptly; no JavaScript timeout can preempt a synchronous CPU-blocking writer.
Remote monitoring integrations must use nonblocking local transport or a
separate process/worker and preserve these bounds. No network exporter is called
inside a recorder or API path in this implementation.

## Verification and remaining OPS03 work

`npm run server:test` includes real HTTP, actual WebSocket, SQLite and log-writer
failure regressions. They verify hostile request IDs, paths, queries, headers,
parser/handler errors and socket payloads cannot enter default output; correlation
IDs remain generated; template/status histograms and socket outcomes reflect
actual traffic; unavailable SQLite changes readiness; export is absent or
authenticated as configured; and throwing, rejecting or hung writers leave
durable sample writes and acknowledgements working. A 140-path request fixture
proves unmatched paths do not create new labels and pending logs remain bounded.
An isolated child regression closes the real stdout pipe and makes SQLite
unavailable with both an active-message socket and an idle socket. It verifies
normal process exit after both 1008 closes, live=200, ready=503 and a recorded
sink failure, without raw driver/stream errors in diagnostic output. A separate
Writable fixture exercises actual backpressure and asynchronous error events.

This is instrumentation evidence, not a production alerting sign-off. Remaining
work includes deployment-specific scraping/log transport and retention, access
and secret rotation drills, service objectives and actionable alert thresholds,
on-call dashboards and notifications, load/capacity/cost budgets, fleet restart
and multi-instance aggregation, real stage/prod incident drills, client consent
and telemetry opt-out verification, and provider-specific monitoring when those
components exist. Any new domain metric must be reviewed for consent, sensitive
fields, bounded labels, failure behavior and operating cost. No alerts, pager
integration or full OPS03 completion are claimed by this slice.

References: [Fastify server logging and request-ID options](https://fastify.dev/docs/latest/Reference/Server/),
[lifecycle hooks](https://fastify.dev/docs/latest/Reference/Hooks/), and
[logging integration](https://fastify.dev/docs/latest/Reference/Logging/).
