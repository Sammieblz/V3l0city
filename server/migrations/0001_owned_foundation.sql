-- Ordinary PostgreSQL foundation. UUIDs are supplied by trusted application code.
-- This schema is not API authorization, working product routes, or Supabase parity.
CREATE TABLE v3l0city.users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  handle text NOT NULL UNIQUE CHECK (handle ~ '^[a-z0-9_]{2,32}$'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  verified_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','deleted')),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz
);

CREATE TABLE v3l0city.devices (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES v3l0city.users(id),
  platform text NOT NULL CHECK (platform IN ('ios','android','web')),
  label text CHECK (length(label) <= 100),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  UNIQUE (user_id,id)
);

CREATE TABLE v3l0city.auth_credentials (
  user_id uuid PRIMARY KEY REFERENCES v3l0city.users(id),
  password_hash text CHECK (password_hash IS NULL OR length(password_hash) BETWEEN 20 AND 4096),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE v3l0city.auth_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES v3l0city.users(id),
  device_id uuid NOT NULL,
  refresh_token_hash text NOT NULL UNIQUE CHECK (refresh_token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  FOREIGN KEY (user_id,device_id) REFERENCES v3l0city.devices(user_id,id),
  CHECK (expires_at > created_at)
);
CREATE INDEX auth_sessions_user_active ON v3l0city.auth_sessions(user_id,expires_at) WHERE revoked_at IS NULL;
CREATE TABLE v3l0city.email_tokens (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES v3l0city.users(id),
  purpose text NOT NULL CHECK (purpose IN ('verification','password_reset','magic_link')),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > created_at)
);

CREATE TABLE v3l0city.vehicles (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES v3l0city.users(id),
  nickname text NOT NULL CHECK (length(nickname) BETWEEN 1 AND 80),
  type text NOT NULL CHECK (type IN ('car','motorcycle','other')),
  make text CHECK (length(make) <= 80),
  model text CHECK (length(model) <= 80),
  marker_key text NOT NULL CHECK (length(marker_key) BETWEEN 1 AND 64),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  UNIQUE (owner_id,id)
);
CREATE INDEX vehicles_owner_live ON v3l0city.vehicles(owner_id,id) WHERE deleted_at IS NULL;

CREATE TABLE v3l0city.buddy_requests (
  id uuid PRIMARY KEY,
  requester_id uuid NOT NULL REFERENCES v3l0city.users(id),
  addressee_id uuid NOT NULL REFERENCES v3l0city.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  CHECK (requester_id <> addressee_id)
);
CREATE UNIQUE INDEX buddy_requests_one_pending_pair ON v3l0city.buddy_requests(least(requester_id,addressee_id),greatest(requester_id,addressee_id)) WHERE status = 'pending' AND deleted_at IS NULL;
CREATE INDEX buddy_requests_addressee ON v3l0city.buddy_requests(addressee_id,created_at,id);
CREATE TABLE v3l0city.buddy_edges (
  user_low uuid NOT NULL REFERENCES v3l0city.users(id),
  user_high uuid NOT NULL REFERENCES v3l0city.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_low,user_high),
  CHECK (user_low < user_high)
);
CREATE INDEX buddy_edges_reverse ON v3l0city.buddy_edges(user_high,user_low);
CREATE TABLE v3l0city.blocks (
  blocker_id uuid NOT NULL REFERENCES v3l0city.users(id),
  blocked_id uuid NOT NULL REFERENCES v3l0city.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (blocker_id,blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TABLE v3l0city.crews (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES v3l0city.users(id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  image_id uuid,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz
);
CREATE TABLE v3l0city.crew_memberships (
  crew_id uuid NOT NULL REFERENCES v3l0city.crews(id),
  user_id uuid NOT NULL REFERENCES v3l0city.users(id),
  role text NOT NULL CHECK (role IN ('owner','admin','member')),
  state text NOT NULL CHECK (state IN ('invited','joined','left','removed')),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  PRIMARY KEY (crew_id,user_id)
);
CREATE UNIQUE INDEX crew_one_joined_owner ON v3l0city.crew_memberships(crew_id) WHERE role = 'owner' AND state = 'joined' AND deleted_at IS NULL;
CREATE INDEX crew_memberships_user ON v3l0city.crew_memberships(user_id,crew_id) WHERE state = 'joined' AND deleted_at IS NULL;
ALTER TABLE v3l0city.crews ADD CONSTRAINT crew_owner_membership FOREIGN KEY (id,owner_id) REFERENCES v3l0city.crew_memberships(crew_id,user_id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE v3l0city.trips (
  id uuid PRIMARY KEY,
  host_id uuid NOT NULL REFERENCES v3l0city.users(id),
  crew_id uuid REFERENCES v3l0city.crews(id),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  state text NOT NULL DEFAULT 'lobby' CHECK (state IN ('scheduled','lobby','active','ended','cancelled')),
  visibility text NOT NULL DEFAULT 'invite_only' CHECK (visibility IN ('invite_only','crew')),
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  route_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(route_metadata) = 'object'),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  CHECK (visibility <> 'crew' OR crew_id IS NOT NULL),
  CHECK (state <> 'scheduled' OR scheduled_at IS NOT NULL),
  CHECK (state NOT IN ('active','ended') OR started_at IS NOT NULL),
  CHECK (state <> 'ended' OR ended_at IS NOT NULL),
  CHECK (ended_at IS NULL OR (started_at IS NOT NULL AND ended_at >= started_at))
);
CREATE TABLE v3l0city.trip_memberships (
  trip_id uuid NOT NULL REFERENCES v3l0city.trips(id),
  user_id uuid NOT NULL REFERENCES v3l0city.users(id),
  role text NOT NULL CHECK (role IN ('host','member')),
  state text NOT NULL CHECK (state IN ('invited','joined','left','removed')),
  vehicle_id uuid,
  ready boolean NOT NULL DEFAULT false,
  sharing_state text NOT NULL DEFAULT 'paused' CHECK (sharing_state IN ('sharing','paused')),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  PRIMARY KEY (trip_id,user_id),
  FOREIGN KEY (user_id,vehicle_id) REFERENCES v3l0city.vehicles(owner_id,id)
);
CREATE UNIQUE INDEX trip_one_joined_host ON v3l0city.trip_memberships(trip_id) WHERE role = 'host' AND state = 'joined' AND deleted_at IS NULL;
CREATE INDEX trip_memberships_user ON v3l0city.trip_memberships(user_id,trip_id) WHERE state = 'joined' AND deleted_at IS NULL;
ALTER TABLE v3l0city.trips ADD CONSTRAINT trip_host_membership FOREIGN KEY (id,host_id) REFERENCES v3l0city.trip_memberships(trip_id,user_id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX trips_host_history ON v3l0city.trips(host_id,created_at DESC,id) WHERE deleted_at IS NULL;

CREATE TABLE v3l0city.invitations (
  id uuid PRIMARY KEY,
  creator_id uuid NOT NULL REFERENCES v3l0city.users(id),
  addressee_id uuid REFERENCES v3l0city.users(id),
  trip_id uuid REFERENCES v3l0city.trips(id),
  crew_id uuid REFERENCES v3l0city.crews(id),
  code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK ((trip_id IS NULL) <> (crew_id IS NULL)),
  CHECK (expires_at > created_at)
);
CREATE TABLE v3l0city.meetups (
  id uuid PRIMARY KEY,
  creator_id uuid NOT NULL REFERENCES v3l0city.users(id),
  crew_id uuid REFERENCES v3l0city.crews(id),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  starts_at timestamptz NOT NULL,
  time_zone text NOT NULL CHECK (length(time_zone) BETWEEN 1 AND 80),
  rsvp_closes_at timestamptz,
  capacity integer CHECK (capacity > 0),
  state text NOT NULL DEFAULT 'scheduled' CHECK (state IN ('scheduled','cancelled','completed')),
  trip_id uuid UNIQUE REFERENCES v3l0city.trips(id),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  CHECK (rsvp_closes_at IS NULL OR rsvp_closes_at <= starts_at)
);
CREATE INDEX meetups_crew_time ON v3l0city.meetups(crew_id,starts_at,id) WHERE deleted_at IS NULL;
CREATE TABLE v3l0city.meetup_rsvps (
  meetup_id uuid NOT NULL REFERENCES v3l0city.meetups(id),
  user_id uuid NOT NULL REFERENCES v3l0city.users(id),
  status text NOT NULL CHECK (status IN ('going','maybe','declined')),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  PRIMARY KEY (meetup_id,user_id)
);

CREATE TABLE v3l0city.trip_waypoints (
  id uuid PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES v3l0city.trips(id),
  creator_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('destination','fuel','food','meetup','regroup','parking','mechanical','custom')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  ordinal integer CHECK (ordinal >= 0),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  FOREIGN KEY (trip_id,creator_id) REFERENCES v3l0city.trip_memberships(trip_id,user_id),
  UNIQUE (trip_id,ordinal) DEFERRABLE INITIALLY IMMEDIATE,
  CHECK ((deleted_at IS NULL AND ordinal IS NOT NULL) OR (deleted_at IS NOT NULL AND ordinal IS NULL))
);
CREATE TABLE v3l0city.trip_messages (
  id uuid PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES v3l0city.trips(id),
  author_id uuid,
  kind text NOT NULL CHECK (kind IN ('user','system')),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  FOREIGN KEY (trip_id,author_id) REFERENCES v3l0city.trip_memberships(trip_id,user_id),
  CHECK ((kind = 'user' AND author_id IS NOT NULL) OR (kind = 'system' AND author_id IS NULL)),
  UNIQUE (trip_id,id)
);
CREATE INDEX trip_messages_cursor ON v3l0city.trip_messages(trip_id,created_at,id) WHERE deleted_at IS NULL;
CREATE TABLE v3l0city.trip_events (
  id uuid PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES v3l0city.trips(id),
  actor_id uuid REFERENCES v3l0city.users(id),
  kind text NOT NULL CHECK (length(kind) BETWEEN 1 AND 64),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX trip_events_cursor ON v3l0city.trip_events(trip_id,created_at,id);
CREATE TABLE v3l0city.trip_summaries (
  trip_id uuid PRIMARY KEY REFERENCES v3l0city.trips(id),
  summary jsonb NOT NULL CHECK (jsonb_typeof(summary) = 'object'),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz
);

CREATE TABLE v3l0city.media_objects (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES v3l0city.users(id),
  object_key text NOT NULL UNIQUE CHECK (length(object_key) BETWEEN 1 AND 512),
  purpose text NOT NULL CHECK (purpose IN ('avatar','crew_image','trip_backup','export')),
  state text NOT NULL CHECK (state IN ('pending','ready','deleted')),
  size_bytes bigint CHECK (size_bytes >= 0),
  checksum_sha256 text CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  UNIQUE (owner_id,id)
);
ALTER TABLE v3l0city.crews ADD CONSTRAINT crew_image_object FOREIGN KEY (image_id) REFERENCES v3l0city.media_objects(id);
CREATE TABLE v3l0city.cloud_trip_backups (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES v3l0city.users(id),
  local_trip_id text NOT NULL CHECK (length(local_trip_id) BETWEEN 1 AND 128),
  media_object_id uuid NOT NULL,
  format_version integer NOT NULL CHECK (format_version > 0),
  consented_at timestamptz NOT NULL,
  expires_at timestamptz,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  FOREIGN KEY (owner_id,media_object_id) REFERENCES v3l0city.media_objects(owner_id,id),
  UNIQUE (owner_id,local_trip_id)
);
CREATE INDEX cloud_trip_backups_owner ON v3l0city.cloud_trip_backups(owner_id,created_at,id) WHERE deleted_at IS NULL;

CREATE TABLE v3l0city.subscription_events (
  provider_event_id text NOT NULL CHECK (length(provider_event_id) BETWEEN 1 AND 128),
  environment text NOT NULL CHECK (environment IN ('SANDBOX','PRODUCTION')),
  user_id uuid REFERENCES v3l0city.users(id),
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 80),
  provider_timestamp timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  processed_at timestamptz,
  PRIMARY KEY (environment,provider_event_id)
);
CREATE TABLE v3l0city.subscriptions (
  user_id uuid NOT NULL REFERENCES v3l0city.users(id),
  environment text NOT NULL CHECK (environment IN ('SANDBOX','PRODUCTION')),
  entitlement text NOT NULL CHECK (entitlement = 'v3l0city_plus'),
  active boolean NOT NULL,
  expires_at timestamptz,
  last_provider_timestamp timestamptz NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  PRIMARY KEY (user_id,environment,entitlement)
);
CREATE TABLE v3l0city.push_tokens (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES v3l0city.users(id),
  device_id uuid NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ios','android')),
  token text NOT NULL CHECK (length(token) BETWEEN 8 AND 4096),
  environment text NOT NULL CHECK (environment IN ('development','staging','production')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  FOREIGN KEY (user_id,device_id) REFERENCES v3l0city.devices(user_id,id),
  UNIQUE (environment,platform,token)
);
CREATE INDEX push_tokens_active_user ON v3l0city.push_tokens(user_id,id) WHERE revoked_at IS NULL;
CREATE TABLE v3l0city.reports (
  id uuid PRIMARY KEY,
  reporter_id uuid NOT NULL REFERENCES v3l0city.users(id),
  target_type text NOT NULL CHECK (target_type IN ('user','trip','message')),
  target_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('spam','harassment','privacy','unsafe','other')),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  evidence_ids uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(evidence_ids) <= 5),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','closed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE v3l0city.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES v3l0city.users(id),
  action text NOT NULL CHECK (length(action) BETWEEN 1 AND 80),
  entity_type text CHECK (length(entity_type) <= 64),
  entity_id uuid,
  request_id text NOT NULL CHECK (length(request_id) BETWEEN 1 AND 128),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE v3l0city.idempotency_receipts (
  owner_id uuid NOT NULL REFERENCES v3l0city.users(id),
  idempotency_key uuid NOT NULL,
  operation text NOT NULL CHECK (length(operation) BETWEEN 1 AND 80),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (owner_id,idempotency_key),
  CHECK (expires_at > created_at)
);
CREATE TABLE v3l0city.sync_changes (
  cursor bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES v3l0city.users(id),
  entity_type text NOT NULL CHECK (length(entity_type) BETWEEN 1 AND 64),
  entity_id uuid NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX sync_changes_user_cursor ON v3l0city.sync_changes(user_id,cursor);

-- Revision changes are explicit optimistic writes; failed guards roll back the write.
CREATE FUNCTION v3l0city.enforce_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.revision <= OLD.revision THEN
    RAISE EXCEPTION 'revision must increase' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
DO $$
DECLARE entity text;
BEGIN
  FOREACH entity IN ARRAY ARRAY['users','vehicles','buddy_requests','crews','crew_memberships','trips','trip_memberships','meetups','meetup_rsvps','trip_waypoints','trip_messages','trip_summaries','cloud_trip_backups','subscriptions'] LOOP
    EXECUTE format('CREATE TRIGGER revision_guard BEFORE UPDATE ON v3l0city.%I FOR EACH ROW EXECUTE FUNCTION v3l0city.enforce_revision()', entity);
  END LOOP;
END;
$$;

REVOKE ALL ON SCHEMA v3l0city FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA v3l0city FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA v3l0city FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA v3l0city FROM PUBLIC;
