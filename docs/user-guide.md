# V3l0city User Guide

V3l0city is a digital speedometer and trip recorder for iPhone and Android. It
shows your current speed, direction, average speed, maximum speed, distance, and
signal quality while the app is open.

## What V3l0city Does

Use V3l0city when you want a clean dashboard-style speed display and a simple
record of your trips.

The app can:

- Show live speed in `km/h` or `MPH`.
- Show heading and compass direction.
- Track trip distance, average speed, and maximum speed.
- Save trips to history.
- Export trip data as JSON or CSV.
- Auto-start and pause trips when movement is detected.
- Save active trips when the app is closed or sent to the background, if you
  enable that setting.

V3l0city is designed for foreground use. Keep the app open while using it as a
speedometer.

## Safety

Do not interact with the app while driving. Set your units, mount position, and
trip options before you start moving. Mount your phone securely where it does not
block your view or controls.

V3l0city depends on your phone's GPS and sensors. Speed and signal quality can
be affected by tunnels, parking garages, tall buildings, weather, device
placement, and low-power device modes.

## First Launch

When you open V3l0city for the first time, your phone may ask for location
permission.

Choose **Allow While Using App** so V3l0city can calculate speed, distance, and
heading while the app is open.

V3l0city also needs precise location. If iPhone offers a **Precise Location**
switch, keep it on. If Android asks for approximate or precise location, choose
precise. Approximate location is not accurate enough for the speedometer and
vehicle-direction compass.

On iPhone, the app may also request motion permission. Motion access helps the
speedometer stay responsive between GPS updates.

If you deny permission, V3l0city will show a permission message instead of the
speed dashboard. You can enable permission later in your device settings.

## Main Dashboard

The dashboard shows:

- **Current speed**: the large central number.
- **Units**: `km/h` or `MPH`, selected in settings.
- **AVG**: average speed for the current trip.
- **MAX**: highest speed recorded for the current trip.
- **DIST**: distance for the current trip.
- **Compass**: heading and direction.
- **Status**: current app state, such as Initializing, Ready, or Recording.
- **Session**: active trip duration.
- **Signal**: speed source and quality, such as `good - gps` or
  `poor - none`.

The compass shows vehicle direction while you are moving. When you are stopped
or moving very slowly, it falls back to the phone compass. If no reliable
heading is available, it shows `--`.

The speed dial or compass may show degraded quality when GPS confidence is
poor. If signal is poor, move outdoors or wait a few moments for a better GPS
fix.

## Starting and Saving Trips

To record a trip manually:

1. Open V3l0city.
2. Wait for the status to show ready.
3. Tap **Start Trip**.
4. Leave the app open while you travel.
5. Tap **Stop & Save** when you are done.

After saving, the trip appears in History.

If the trip is paused through auto-start behavior, the button changes to
**Save & end**.

## Resetting

When no trip is active, the dashboard may show a **Reset** button after distance
has been accumulated. Tap it to clear the current unsaved speed statistics.

Reset does not delete saved trip history.

## Menu

Tap the menu icon in the top-left corner to open:

- **History**
- **Settings**
- **Export as JSON**
- **Export as CSV**

Tap outside the menu to close it.

## Trip History

History shows saved trips with:

- Date
- Duration
- Distance
- Average speed
- Maximum speed
- Start and end time

Tap **Clear All** to remove all saved trips from the device.

Clearing history is local to the app data stored on your device.

## Exporting Data

Use the menu to export trips:

- **Export as JSON**: best for backups, diagnostics, or developers.
- **Export as CSV**: best for spreadsheets.

Your phone will open the share sheet so you can save or send the file.

Exports include saved trips. JSON also includes detailed speed samples when
available.

## Settings

Open **Menu > Settings**.

### Units

Choose:

- `km/h`
- `MPH`

This changes how speed and distance are displayed.

### Mount Position

Choose where your phone is mounted:

- **Top**
- **Right**
- **Bottom**
- **Left**

This helps the compass and heading display line up with your phone orientation.
If your phone is mounted sideways, choose the side that matches the mount.

### Autostart Trip

When enabled, V3l0city starts a trip automatically after movement is detected.

With autostart on:

- Movement can start a trip.
- Stopping for long enough can pause the trip.
- Moving again can resume the trip.

Autostart is useful when you want V3l0city to begin recording without pressing
Start Trip every time.

### Autosave on Exit

When enabled, V3l0city saves an active trip if the app goes to the background.

This helps avoid losing a trip if you switch apps or lock the phone. Because the
speed engine is foreground-only, keep V3l0city open for live speed tracking.

### Orientation

Choose:

- **Portrait**
- **Landscape**
- **Auto (device)**

Portrait gives the standard dashboard. Landscape shows a wider dashboard with
large stats beside the speed dial.

### Debug Overlay

In development builds, Settings may show a Debug Overlay option. This is for
testing. It displays sensor state, quality, source, and speed diagnostics.

Production users should not need this option.

### Drive Simulator

In development builds, Settings may show Drive Simulator. This is a testing tool
that simulates a drive without moving the phone.

Production users should not need this option.

## iPhone Notes

Recommended setup:

1. Install and open V3l0city.
2. Allow location while using the app.
3. Allow motion access if prompted.
4. Keep the app open while using the speedometer.
5. Use Settings to choose units and mount position.

If speed stays at zero:

- Confirm location permission is enabled.
- Move outdoors or near a window.
- Wait a few moments for GPS to lock.
- Turn off Low Power Mode if sensor updates feel delayed.
- Make sure the phone is not in airplane mode.

## Android Notes

Recommended setup:

1. Install and open V3l0city.
2. Allow location while using the app.
3. Set Location Accuracy to high accuracy if your Android version exposes that
   setting.
4. Keep the app open while using the speedometer.
5. Use Settings to choose units and mount position.

If speed stays at zero:

- Confirm location permission is enabled.
- Confirm system location is turned on.
- Move outdoors or near a window.
- Disable battery restrictions for V3l0city if updates are delayed.
- Wait a few moments for GPS to lock.

## Status and Signal Meanings

### Status

- **Initializing**: V3l0city is waiting for permissions or the first sensor fix.
- **Ready**: sensors are available and the app is ready.
- **Recording**: a trip is currently active.
- **Permission required**: location access is missing.
- **Precise location required**: location access exists, but approximate or
  reduced accuracy is enabled.
- **Sensors unavailable**: the device does not expose required sensor data.

### Signal

Signal has a quality and a source.

Quality:

- **Good**: GPS and sensor data are fresh and accurate.
- **Medium**: usable data, but not ideal.
- **Poor**: stale, inaccurate, missing, or rejected data.

Source:

- **gps**: speed comes from GPS or GPS-derived movement.
- **blended**: GPS plus motion prediction.
- **motion-only**: motion prediction without a current GPS speed.
- **none**: no reliable speed source.

If signal is poor, the displayed speed may be less reliable.

### Heading Quality

Heading quality describes the compass direction, not the speed number.

- **Good**: GPS course or compass heading is accurate enough for normal use.
- **Medium**: usable direction, but accuracy is not ideal.
- **Poor**: missing, stale, inaccurate, or approximate-location data.

Heading source:

- **course**: direction comes from GPS travel bearing while moving.
- **device**: direction comes from the phone compass while stopped/slow or when
  GPS course is missing.
- **none**: no reliable heading source.

## Notifications

V3l0city can show a themed in-app toast while you are using the app and an
optional system notification when a trip is saved.

To enable push notifications, open **Settings > Notifications** and choose
**Enable notifications**. If you deny notification permission, trip saving,
history, export, speed, and compass features still work.

Android and iOS push notifications require a development or production build.
Expo Go is not the intended runtime for V3l0city notifications.

## Privacy and Data

V3l0city saves trips locally on your device.

If telemetry is not configured by the developer or organization that built the
app, trip data stays local except when you export or share it yourself.

When telemetry is configured, V3l0city may send active trip samples to a server
for diagnostics or analysis. The app uses an anonymous device identity rather
than a user account in the current version.

Network issues do not stop the local speedometer or local trip saving.

## Troubleshooting

### The app says Location Permission Required

Enable location permission in system settings:

- iPhone: Settings > Privacy & Security > Location Services > V3l0city.
- Android: Settings > Apps > V3l0city > Permissions > Location.

Choose permission while using the app.

### The app says Precise Location Required

Enable precise location:

- iPhone: Settings > Privacy & Security > Location Services > V3l0city, then
  turn on **Precise Location**.
- Android: Settings > Apps > V3l0city > Permissions > Location, then choose
  **Precise** or disable approximate location. Some devices also have Location
  Accuracy or Google Location Accuracy under system Location settings.

### Speed does not change

- Make sure location is enabled.
- Keep V3l0city open in the foreground.
- Wait for GPS to lock.
- Move outdoors.
- Check that the app is not in Drive Simulator mode unless you are testing.
- Restart the app if the phone recently changed permissions.

### Distance is not recording

Start a trip first. The dashboard can show speed without recording a saved trip.
Distance history is saved only while a trip is active and not paused.

### Trip did not save

Use **Stop & Save** before closing the app, or enable **Autosave on exit**.

### Heading looks rotated

Open Settings and change **Mount Position** to match how the phone is mounted.

Mount Position affects the phone-compass fallback. While moving, V3l0city
prefers GPS course, so the heading should follow vehicle travel direction even
if the phone is mounted sideways.

### Signal says poor

Poor signal usually means GPS accuracy is weak, stale, or temporarily
unavailable. Move outdoors, wait for a stronger fix, or avoid locations with
heavy obstruction.
