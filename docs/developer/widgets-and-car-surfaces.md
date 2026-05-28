# Widgets and Car Surfaces

V3l0city exposes glanceable speed/trip data to native OS surfaces without
turning those surfaces into speed engines. The phone app remains the source of
truth: native sensors feed the C++ speed engine, React Native records trips,
and widgets read a small shared snapshot.

## Shared Snapshot

`src/driveSurface/snapshot.ts` builds a `DriveSurfaceSnapshot` from
`VelocitySensorsState` plus active trip state. The snapshot contains raw values
and preformatted widget text:

- speed, units, distance, elapsed time, average, max, and heading
- trip active/paused state
- signal quality and permission state
- `updatedAtMs` and `stale`

`speedometer.tsx` publishes the snapshot at most every 500 ms. Snapshots older
than five seconds are treated as stale and tell the user to open V3l0city.

## iOS

The iOS native module writes the snapshot to the App Group
`group.com.v3l0city.app`. `ios/V3l0cityDriveWidget` contains the WidgetKit
extension:

- small and medium widgets read the shared snapshot
- stale/missing snapshots show an open-app message
- ActivityKit shows an active-trip Live Activity on supported iOS versions

The app target and widget extension both have the App Group entitlement. The app
also declares Live Activity support in `Info.plist`.

## Android

The Android side stores the snapshot in shared preferences owned by the app and
updates `V3l0cityDriveWidgetProvider`.

The home-screen widget uses native `RemoteViews` because React Native views
cannot be embedded directly in Android widgets. While a trip is active, the
native layer also posts a low-priority ongoing notification when notification
permission is granted.

## CarPlay and Android Auto

CarPlay v1 is handled through the iOS widget and Live Activity path. This keeps
the experience glanceable and avoids pretending that the app has a full CarPlay
entitlement.

Full CarPlay and Android Auto apps remain gated by Apple/Google category and
template rules. A generic speedometer dashboard is not a safe assumption for
store approval. If V3l0city later adds a navigation/route-guidance mode, the
car app work should be revisited with native CarPlay templates and the Android
for Cars App Library.

## Testing

- `npx tsc --noEmit`
- `npm run lint`
- `npx jest --runInBand __tests__/driveSurfaceSnapshot.test.ts`
- iOS simulator widget gallery and Live Activity simulator checks
- Android launcher widget picker and active-trip notification checks
