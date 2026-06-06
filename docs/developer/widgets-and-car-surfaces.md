# Widgets and Car Surfaces

V3l0city exposes live active-trip speed/trip data to native OS surfaces without
turning widget extensions into speed engines. A user-started trip owns a native
live drive session: native sensors feed the C++ speed engine, the app records
trips, and widgets read the latest state produced by that engine.

## Shared Snapshot

`src/driveSurface/snapshot.ts` builds a `DriveSurfaceSnapshot` from
`VelocitySensorsState` plus active trip state. The snapshot contains raw values
and preformatted widget text:

- speed, units, distance, elapsed time, average, max, and heading
- trip active/paused state
- signal quality and permission state
- `updatedAtMs`, `stale`, and `simulationActive`

The app starts a native live drive session when a trip starts and stops it when
the trip is saved. JavaScript starts and stops the trip, but native owns the
continuous sensor loop after that. The native speed engine publishes
drive-surface state at about 1 Hz while active. Snapshots older than five
seconds are treated as stale and tell the user to open V3l0city.

In development builds, the app-level Drive Simulator marks snapshots with
`simulationActive`. Native iOS and Android code then continues the same
city/highway simulated speed curve for widgets and Live Activities after the
React screen is backgrounded. This makes widget testing possible without moving
a device. It still does not validate the real GPS/motion collectors.

## iOS

The iOS native module writes the snapshot to the App Group
`group.com.v3l0city.app`. `ios/V3l0cityDriveWidget` contains the WidgetKit
extension:

- small, medium, and large widgets read the shared live state
- stale/missing snapshots show an open-app message
- ActivityKit shows an active-trip Live Activity on supported iOS versions

The app target and widget extension both have the App Group entitlement. The app
also declares Live Activity and background-location support in `Info.plist`.
iOS home-screen widgets are still timeline-based and reload-budgeted, so they
must be presented as latest-state views. The Live Activity is the primary
real-time iOS surface during active trips and in CarPlay-capable glances.

For simulated active trips, `V3l0citySpeedEngineModule.swift` runs a native
timer and updates the shared App Group snapshot plus ActivityKit state. The
home-screen widget can still be throttled by WidgetKit, but the Live Activity is
updated from native state rather than from React.

## Android

The Android side stores the live state in shared preferences owned by the app
and updates `V3l0cityDriveWidgetProvider`.

The home-screen widget uses native `RemoteViews` because React Native views
cannot be embedded directly in Android widgets. While a trip is active,
`LiveDriveSessionManager` owns fused location, raw GPS, motion sensors, the C++
engine handle, stale checks, widget publishing, and notification updates. The
Expo module only subscribes to manager events for the dashboard. A native
foreground location service keeps the OS aware of active tracking and lets the
manager continue publishing widget state when the React screen is backgrounded.

The Android widget has three size paths:

- compact: speed/status only for very small launcher cells
- medium: cockpit card with a Canvas-rendered speed dial, stats, compact
  compass, time, and status
- expanded: larger iOS-style card with centered dial, AVG/MAX/DIST, compass,
  elapsed time, and signal status

`DriveSurfaceWidget.kt` renders the dial arc and compass into native `Bitmap`s
for `RemoteViews`. This avoids depending on React Native views inside the widget
and gives the widget a richer visual style than plain TextViews.

Android declares `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`,
`ACCESS_FINE_LOCATION`, and `ACCESS_BACKGROUND_LOCATION`. Background location is
only for user-started active trips and resume/restart reliability; widgets do
not passively start GPS by themselves.

## CarPlay and Android Auto

The production-oriented car glance path is still iOS Live Activity/widgets and
Android widgets/active-trip notification. These surfaces are active-trip only
and read the same native live-drive state as the phone dashboard.

There are also simulator POCs for car surfaces:

- iOS uses scene-based CarPlay setup, a debug-only CarPlay maps entitlement,
  and an experimental full-screen native `CPWindow` dashboard in debug builds.
  The dashboard reads the app-group `DriveSurfaceSnapshot` directly at about
  1 Hz and updates UIKit labels/layers in place. It deliberately does not mount
  a second React Native root inside CarPlay. It also avoids `CPMapTemplate`
  because the current simulator runtime crashes `CarPlayTemplateUIHost` inside
  the map-template share-button path. A `CPListTemplate`/`CPInformationTemplate`
  fallback remains available for simulator runtimes that refuse the custom
  window path. Release builds keep the safer `CPInformationTemplate` summary
  unless an explicit production entitlement/category decision is made.
- Android advertises a template app for Android Auto/DHU and keeps the
  `react-native-carplay@2.4.1-beta.0` rich surface POC. The Android Auto
  dashboard is also display-only and uses the same fullscreen cockpit hierarchy
  as the iOS debug surface.
- Car surfaces are display-only in this POC. Start, pause, resume, and save
  trips from the phone dashboard; the car dashboard mirrors speed,
  AVG/MAX/DIST, heading, elapsed time, and signal.
- Release builds should keep the safer/non-car-approved paths unless explicit
  entitlement/category approval is in place.

This POC is not App Store or Play Store approval by itself. Full production
CarPlay and Android Auto remain gated by Apple/Google category, entitlement,
and template rules. A generic speedometer dashboard is not a safe assumption for
store approval; if V3l0city adds route guidance, revisit this work as a
production car-app feature.

## Testing

- `npx tsc --noEmit`
- `npm run lint`
- `npx jest --runInBand __tests__/driveSurfaceSnapshot.test.ts`
- iOS simulator widget gallery and Live Activity simulator checks
- iOS Simulator: `I/O > External Displays > CarPlay` for the template POC
- Android launcher widget picker and active-trip notification checks
- Android Desktop Head Unit for the Android Auto template POC
