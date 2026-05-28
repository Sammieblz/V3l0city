# V3l0city Developer Guide

This is the developer entry point for V3l0city. The detailed technical docs are
split by subsystem so new contributors can read only the part they need without
digging through one huge file.

## Reading Order

1. [System Architecture](developer/system-architecture.md)
2. [Mobile Frontend](developer/mobile-frontend.md)
3. [Native Speed Engine](developer/native-speed-engine.md)
4. [Local Data and Export](developer/local-data-and-export.md)
5. [Telemetry and Backend](developer/telemetry-and-backend.md)
6. [Cloud Sync and Social](developer/cloud-sync-and-social.md)
7. [Testing and Operations](developer/testing-and-operations.md)
8. [Code Ownership Map](developer/code-ownership.md)

## Quick Project Summary

V3l0city is a foreground digital speedometer and trip recorder for iOS and
Android. The app is local-first: speed calculation, trip recording, trip saving,
history, and export all work without a network. Telemetry and Supabase-powered
cloud/social features are optional and must never block the local speedometer.

Core implementation:

- Mobile UI: Expo SDK 54, React Native 0.81, React 19, Expo Router, React Native
  Paper, React Native SVG.
- Native speed engine: local Expo Module in `modules/v3l0city-speed-engine`,
  with Swift and Kotlin platform collectors feeding a shared C++ core.
- Local storage: `expo-sqlite` database named `velocity.db`.
- Backend: Node TypeScript, Fastify, WebSocket, SQLite, Zod.
- Cloud/social: optional Supabase Auth, Postgres/RLS, and Edge Functions behind
  provider-neutral mobile interfaces.
- Validation: TypeScript, Jest, C++ tests, server tests, lint, iOS build,
  Android debug build.

## Related Docs

- [Documentation Index](README.md)
- [User Guide](user-guide.md)
- [Native Speed Engine Deep Dive](speed-engine.md)
- [Telemetry API Contract](telemetry-api.md)
