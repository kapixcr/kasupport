-- 0001_meetings.sql — Dominio de reuniones (Meet-like) para Kasupport.
-- Requiere el esquema base (agents, channels, messages, reactions).

CREATE TABLE IF NOT EXISTS meetings (
  id                       SERIAL PRIMARY KEY,
  public_id                TEXT NOT NULL UNIQUE,
  title                    TEXT NOT NULL,
  livekit_room_name        TEXT NOT NULL UNIQUE,
  created_by_agent_id      INT REFERENCES agents(id) ON DELETE SET NULL,
  status                   TEXT NOT NULL DEFAULT 'waiting',  -- waiting | active | ended | expired | revoked
  locked                   BOOLEAN NOT NULL DEFAULT false,
  lobby_enabled            BOOLEAN NOT NULL DEFAULT true,
  recording_enabled        BOOLEAN NOT NULL DEFAULT false,
  max_participants         INT NOT NULL DEFAULT 15,
  settings                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  starts_at                TIMESTAMPTZ,
  started_at               TIMESTAMPTZ,
  ended_at                 TIMESTAMPTZ,
  expires_at               TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('waiting', 'active', 'ended', 'expired', 'revoked')),
  CHECK (max_participants BETWEEN 2 AND 15)
);

CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_created_by ON meetings(created_by_agent_id);

CREATE TABLE IF NOT EXISTS meeting_participants (
  id                 SERIAL PRIMARY KEY,
  meeting_id         INT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  participant_type   TEXT NOT NULL,                       -- agent | guest
  agent_id           INT REFERENCES agents(id) ON DELETE SET NULL,
  guest_token_hash   TEXT,
  guest_token_expires_at TIMESTAMPTZ,
  guest_token_revoked_at TIMESTAMPTZ,
  display_name       TEXT NOT NULL,
  role               TEXT NOT NULL DEFAULT 'participant',  -- host | moderator | participant
  status             TEXT NOT NULL DEFAULT 'pending',     -- pending | admitted | joined | rejected | kicked | left | ended
  livekit_identity   TEXT NOT NULL,
  hand_raised        BOOLEAN NOT NULL DEFAULT false,
  admitted_at        TIMESTAMPTZ,
  joined_at          TIMESTAMPTZ,
  left_at            TIMESTAMPTZ,
  rejected_at        TIMESTAMPTZ,
  kicked_at          TIMESTAMPTZ,
  last_seen_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, livekit_identity),
  CHECK (participant_type IN ('agent', 'guest')),
  CHECK (role IN ('host', 'moderator', 'participant')),
  CHECK (status IN ('pending', 'admitted', 'joined', 'rejected', 'kicked', 'left', 'ended'))
);

CREATE INDEX IF NOT EXISTS idx_meeting_participants_meeting ON meeting_participants(meeting_id, status);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_identity ON meeting_participants(livekit_identity);
CREATE UNIQUE INDEX IF NOT EXISTS uq_meeting_participants_agent
  ON meeting_participants(meeting_id, agent_id) WHERE agent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_meeting_participants_guest_token
  ON meeting_participants(meeting_id, guest_token_hash) WHERE guest_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS meeting_messages (
  id                SERIAL PRIMARY KEY,
  meeting_id        INT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  participant_id    INT NOT NULL REFERENCES meeting_participants(id) ON DELETE CASCADE,
  body              TEXT NOT NULL,
  idempotency_key   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meeting_messages_meeting ON meeting_messages(meeting_id, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_meeting_messages_idempotency
  ON meeting_messages(meeting_id, participant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS meeting_recordings (
  id                SERIAL PRIMARY KEY,
  meeting_id        INT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  started_by_agent_id INT REFERENCES agents(id) ON DELETE SET NULL,
  egress_id         TEXT UNIQUE,
  status            TEXT NOT NULL DEFAULT 'starting', -- starting | recording | stopping | complete | failed | aborted
  storage_key       TEXT,
  mime_type         TEXT,
  size_bytes        BIGINT,
  duration_seconds  DOUBLE PRECISION,
  started_at        TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,
  error             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('starting', 'recording', 'stopping', 'complete', 'failed', 'aborted'))
);

CREATE INDEX IF NOT EXISTS idx_meeting_recordings_meeting ON meeting_recordings(meeting_id, id DESC);

CREATE TABLE IF NOT EXISTS meeting_events (
  id                  SERIAL PRIMARY KEY,
  meeting_id          INT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  actor_participant_id INT REFERENCES meeting_participants(id) ON DELETE SET NULL,
  event_type          TEXT NOT NULL,
  payload            JSONB NOT NULL DEFAULT '{}'::jsonb,
  external_event_id  TEXT UNIQUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meeting_events_meeting ON meeting_events(meeting_id, id DESC);
