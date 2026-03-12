# V3l0city

Digital speedometer built with Expo and React Native.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- development build
- Android emulator
- iOS simulator
- Expo Go

You can start developing by editing the files inside the `app` directory.

## Architecture

- Entry: `index.js` → `expo-router/entry` → `app/index.tsx`.
- Root screen: `app/index.tsx` renders `CustomStatusBar` and the main `Speedometer` screen.
- Core sensor logic lives in the hook `app/hooks/useVelocitySensors.ts`:
  - Subscribes to `expo-location` for GPS + heading and `expo-sensors` `DeviceMotion` for motion.
  - Uses a Kalman filter (via `app/hooks/useKalmanSpeedFilter.ts` and `app/utils/kalmanAdapter.ts`) plus helpers in `app/utils/speedMath.ts` and `app/utils/motionMath.ts`.
  - Exposes derived state: speed, distance, average/max speed, heading, permission/status, signal quality, and sensor availability.
- UI components in `app/components/`:
  - `speedometer.tsx`: dashboard UI, units and mount selection, trip controls, history toggle, and settings panel.
  - `Compass.tsx`, `AverageSpeedDisplay.tsx`, `ResetButton.tsx`, `TripHistory.tsx`, `DebugOverlay.tsx`.
- Domain and storage:
  - Trip model: `app/domain/trip.ts`.
  - Trip storage: `app/storage/tripStorage.ts` (AsyncStorage).
  - User preferences (units, mount): `app/storage/preferencesStorage.ts` (AsyncStorage).

## Sensors and limitations

- The app relies on foreground location permission and motion sensors. If permission is denied or sensors are unavailable, the UI will show a clear error state.
- Speed is computed from GPS deltas and refined with a Kalman filter; motion data is used to predict speed between GPS updates.
- GPS accuracy and update rate affect signal quality; when quality is poor, the main speed dial visually indicates degraded trustworthiness.

## Testing

- Unit tests live under `__tests__/` and are run with:

  ```bash
  npm test
  ```

- Math-focused tests cover `speedMath`, `motionMath`, and the Kalman adapter. Additional tests can be added for hooks and UI states as needed.
