# Cloud Sync and Social

V3l0city is offline-first. Supabase adds optional accounts, cloud backup,
restore, friends, nearby discovery, and aggregate leaderboards, but the app must
keep working without Supabase configuration, sign-in, or network.

## Configuration

Mobile cloud features are enabled only when both public variables are present:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Never put a Supabase secret or service-role key in the mobile app.

The Supabase project scaffold lives in:

```text
supabase/
```

Project id:

```text
V3l0city
```

## Client Architecture

Provider-neutral contracts live in `src/cloud/types.ts`.

The app consumes:

- `AuthProvider`
- `CloudSyncProvider`
- `SocialProvider`

The first implementation is the Supabase adapter under `src/cloud/supabase`.
This keeps the UI and local repositories portable if V3l0city later moves to
AWS, GCP, Azure, Firebase, or a custom backend.

## Onboarding

There are two onboarding states:

- Local first-install onboarding is anonymous and stored only on the device via
  `src/onboarding/onboardingStorage.ts`. It appears once per install and does
  not require Supabase configuration or network.
- Signed-in onboarding is stored on the Supabase `profiles` row through
  `onboarding_completed_at`. The sign-up screen collects name, username, email,
  and password. New signed-up users then see online feature setup. Once saved,
  Account / Sync becomes a normal settings screen.

These states are intentionally separate. A user can complete local onboarding,
stay anonymous forever, and later sign in without losing local trips. A user can
also sign out after cloud onboarding; local data remains and sync pauses.

Sign-up profile bootstrap:

- The mobile client sends `username` and `display_name` as Supabase Auth
  metadata during email sign-up.
- The migration installs `private.handle_new_auth_user()`, an auth trigger that
  creates the initial `profiles` row from that metadata.
- The trigger lives in the private schema, not the exposed public schema.
- Profile edits later use explicit update/insert logic in the Supabase auth
  adapter, preserving `onboarding_completed_at` instead of resetting setup.

## Local Source of Truth

SQLite remains the durable source on the current device.

Important local behavior:

- Starting a trip creates a draft trip row.
- Active-trip samples are appended to SQLite every 500 ms.
- Saving a trip marks it `completed`.
- Deletes are tombstones until sync can confirm them.
- Sync errors never delete local trips or samples.
- Restore inserts cloud trips only when they are missing locally.

Local-wins is the conflict rule. Cloud data does not silently overwrite newer or
unsynced local rows.

## Supabase Data Model

The migration creates:

- `profiles`
- `user_devices`
- `cloud_trips`
- `cloud_trip_samples`
- `sync_batches`
- `friendships`
- `leaderboard_entries`

All public tables have RLS enabled and explicit authenticated grants. Friendship
rows are visible only to participants. Trip and sample rows are visible only to
their owner. Leaderboards expose aggregate values only.

## Edge Functions

Authenticated functions:

- `sync-trips`
- `search-friends`
- `nearby-users`
- `friend-suggestions`
- `friend-request`
- `friend-respond`
- `leaderboards`

Functions use user JWT auth. Admin access is used only inside Edge Functions,
never in the mobile bundle.

Deploy them before testing Find Friends, Nearby, Leaderboards, or cloud sync
against the hosted Supabase project:

```bash
npx supabase login
cd supabase
npx supabase functions deploy \
  --project-ref mostpzdrhspgaiwgepyr \
  --use-api \
  sync-trips search-friends nearby-users friend-suggestions \
  friend-request friend-respond leaderboards
```

## Privacy Rules

Social features are opt-in.

- Nearby discovery stores a coarse location hash only.
- Exact coordinates and trip routes are not stored for nearby discovery.
- Leaderboards return rank, profile display fields, metric, period, and value.
- Detailed trips and samples are not returned in leaderboard responses.
- The in-app privacy policy is maintained in `src/content/privacyPolicy.ts` and
  rendered by `PrivacyPolicyScreen`.
- SecureStore holds Supabase sessions; SQLite remains the durable local trip
  store; AsyncStorage holds non-secret app flags and identifiers.

## Validation

Run:

```bash
npx tsc --noEmit
npm run lint
npx jest --runInBand
```

For Supabase local validation:

```bash
npx supabase migration list --local
npx supabase db reset
```

Use Supabase MCP or CLI advisors before deploying schema changes.
