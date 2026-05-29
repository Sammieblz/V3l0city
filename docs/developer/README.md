# Developer Documentation

These docs explain V3l0city from a technical point of view. They are organized
by subsystem rather than by chronology.

## Guides

- [System Architecture](system-architecture.md): product constraints, runtime
  boundaries, repository layout, data flows, and the local-first rule.
- [Mobile Frontend](mobile-frontend.md): Expo app boot, first-install
  onboarding, dashboard composition, hook state, trip controls, settings,
  orientation, notifications, privacy UI, and UI code.
- [Native Speed Engine](native-speed-engine.md): Expo Module shape, JS API, iOS
  collector, Android collector, C++ core, quality diagnostics, and simulator
  behavior.
- [Local Data and Export](local-data-and-export.md): SQLite schema, migrations,
  repositories, trip sample timeline, JSON/CSV export, and local data rules.
- [Telemetry and Backend](telemetry-and-backend.md): mobile telemetry pipeline,
  anonymous identity, WebSocket streaming, HTTP retries, Fastify backend, and
  SQLite server store.
- [Cloud Sync and Social](cloud-sync-and-social.md): optional Supabase auth,
  signed-in onboarding, local-wins sync, friends, nearby discovery, and
  aggregate leaderboards.
- [Widgets and Car Surfaces](widgets-and-car-surfaces.md): native live drive
  sessions, iOS WidgetKit/Live Activity support, Android home-screen widgets,
  simulated drive surfaces, and CarPlay/Android Auto constraints.
- [Testing and Operations](testing-and-operations.md): validation commands,
  simulator workflows, native builds, environment variables, and troubleshooting.
- [Code Ownership Map](code-ownership.md): where to make changes by feature
  area, plus review checklists.

## External Entry Points

- [Project README](../../README.md)
- [User Guide](../user-guide.md)
- [Native Speed Engine Deep Dive](../speed-engine.md)
- [Telemetry API Contract](../telemetry-api.md)
