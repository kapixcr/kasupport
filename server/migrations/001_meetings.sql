-- Kasupport meeting foundation (LiveKit-backed rooms, lobby, chat and recordings)

DO $$ BEGIN
  CREATE TYPE meeting_status AS ENUM ('scheduled', 'active', 'ended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE meeting_participant_type AS ENUM ('agent', 'guest');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE meeting_participant_role AS ENUM ('host', 'participant');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE meeting_participant_status AS ENUM ('waiting', 'admitted', 'joined', 'left', 'rejected', 'kicked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE meeting_recording_status AS ENUM ('starting', 'active', 'ending', 'complete', 'failed', 'aborted', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS meetings (
  id                  BIGSERIAL PRIMARY KEY,
  public_id           TEXT NOT NULL UNIQUE,
  title               TEXT NOT NULL,
  created_by_agent_id INT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  livekit_room_name   TEXT NOT NULL UNIQUE,
  status              meeting_status NOT NULL DEFAULT 'scheduled',
  locked              BOOLEAN NOT NULL DEFAULT false,
  lobby_enabled       BOOLEAN NOT NULL DEFAULT true,
  recording_enabled   BOOLEAN NOT NULL DEFAULT false,
  max_participants    SMALLINT NOT NULL DEFAULT 15 CHECK (max_participants BETWEEN 2 AND 15),
  starts_at           TIMESTAMPTZ,
  started_at          TIMESTAMPTZ,
  ended_at            TIMESTAMPTZ,
  settings            JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT meetings_end_consistency CHECK (status <> 'ended' OR ended_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS meeting_participants (
  id                   BIGSERIAL PRIMARY KEY,
  meeting_id           BIGINT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  participant_type     meeting_participant_type NOT NULL,
  agent_id              INT REFERENCES agents(id) ON DELETE SET NULL,
  display_name          TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  role                  meeting_participant_role NOT NULL DEFAULT 'participant',
  status                meeting_participant_status NOT NULL DEFAULT 'waiting',
  guest_token_hash      CHAR(64),
  livekit_identity      TEXT NOT NULL,
  hand_raised           BOOLEAN NOT NULL DEFAULT false,
  admitted_at           TIMESTAMPTZ,
  joined_at             TIMESTAMPTZ,
  left_at               TIMESTAMPTZ,
  rejected_at           TIMESTAMPTZ,
  kicked_at             TIMESTAMPTZ,
  last_seen_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, livekit_identity),
  UNIQUE (meeting_id, id),
  CONSTRAINT meeting_participant_identity CHECK (
    (participant_type = 'agent' AND agent_id IS NOT NULL AND guest_token_hash IS NULL) OR
    (participant_type = 'guest' AND agent_id IS NULL AND guest_token_hash IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_meeting_participants_agent
  ON meeting_participants (meeting_id, agent_id)
  WHERE agent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_meeting_participants_guest_token
  ON meeting_participants (meeting_id, guest_token_hash)
  WHERE guest_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meeting_participants_lobby
  ON meeting_participants (meeting_id, status, created_at);

CREATE TABLE IF NOT EXISTS meeting_messages (
  id                BIGSERIAL PRIMARY KEY,
  meeting_id        BIGINT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  participant_id    BIGINT NOT NULL REFERENCES meeting_participants(id) ON DELETE RESTRICT,
  body              TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  idempotency_key   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT meeting_message_participant_matches
    FOREIGN KEY (meeting_id, participant_id)
    REFERENCES meeting_participants(meeting_id, id)
    DEFERRABLE INITIALLY IMMEDIATE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_meeting_messages_idempotency
  ON meeting_messages (meeting_id, participant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meeting_messages_page
  ON meeting_messages (meeting_id, id DESC);

CREATE TABLE IF NOT EXISTS meeting_recordings (
  id               BIGSERIAL PRIMARY KEY,
  meeting_id       BIGINT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  requested_by_agent_id INT REFERENCES agents(id) ON DELETE SET NULL,
  egress_id        TEXT UNIQUE,
  status           meeting_recording_status NOT NULL DEFAULT 'starting',
  storage_provider TEXT NOT NULL DEFAULT 's3',
  storage_bucket   TEXT,
  storage_key      TEXT,
  mime_type        TEXT NOT NULL DEFAULT 'video/mp4',
  size_bytes       BIGINT CHECK (size_bytes IS NULL OR size_bytes >= 0),
  duration_seconds NUMERIC(14, 3) CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  started_at       TIMESTAMPTZ,
  ended_at         TIMESTAMPTZ,
  error            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meeting_recordings_meeting
  ON meeting_recordings (meeting_id, id DESC);

CREATE TABLE IF NOT EXISTS meeting_events (
  id                   BIGSERIAL PRIMARY KEY,
  meeting_id           BIGINT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  actor_participant_id BIGINT REFERENCES meeting_participants(id) ON DELETE SET NULL,
  event_type           TEXT NOT NULL,
  payload              JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  external_event_id    TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_meeting_events_external
  ON meeting_events (external_event_id)
  WHERE external_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meeting_events_page
  ON meeting_events (meeting_id, id DESC);

CREATE OR REPLACE FUNCTION set_meeting_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_meetings_updated_at ON meetings;
CREATE TRIGGER trg_meetings_updated_at
BEFORE UPDATE ON meetings
FOR EACH ROW EXECUTE FUNCTION set_meeting_updated_at();

DROP TRIGGER IF EXISTS trg_meeting_participants_updated_at ON meeting_participants;
CREATE TRIGGER trg_meeting_participants_updated_at
BEFORE UPDATE ON meeting_participants
FOR EACH ROW EXECUTE FUNCTION set_meeting_updated_at();

DROP TRIGGER IF EXISTS trg_meeting_recordings_updated_at ON meeting_recordings;
CREATE TRIGGER trg_meeting_recordings_updated_at
BEFORE UPDATE ON meeting_recordings
FOR EACH ROW EXECUTE FUNCTION set_meeting_updated_at();
