-- Kasupport — esquema PostgreSQL completo
-- Sistema tipo Slack + widget de soporte embebible

CREATE TABLE IF NOT EXISTS agents (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE,
  password_hash TEXT,
  role          TEXT NOT NULL DEFAULT 'agent',  -- admin | agent
  color         TEXT NOT NULL DEFAULT '#4f46e5',
  avatar        TEXT,
  status_emoji  TEXT,
  status_text   TEXT,
  theme         JSONB,
  dark_mode     BOOLEAN NOT NULL DEFAULT false,
  bg_image      TEXT,
  notif_enabled BOOLEAN NOT NULL DEFAULT true,
  notif_sound   BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migraciones seguras para tablas existentes
ALTER TABLE agents ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'agent';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS avatar TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS status_emoji TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS status_text TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS theme JSONB;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS dark_mode BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS bg_image TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS notif_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS notif_sound BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS departments (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS channels (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'channel',  -- channel | dm | support
  department_id INT REFERENCES departments(id) ON DELETE SET NULL,
  is_private    BOOLEAN NOT NULL DEFAULT false,
  post_policy   TEXT NOT NULL DEFAULT 'all',      -- all | admin
  archived      BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE channels ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS post_policy TEXT NOT NULL DEFAULT 'all';
ALTER TABLE channels ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
UPDATE channels SET archived = false WHERE archived IS NULL;


CREATE TABLE IF NOT EXISTS channel_members (
  channel_id INT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  agent_id   INT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  PRIMARY KEY (channel_id, agent_id)
);

CREATE TABLE IF NOT EXISTS visitors (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT,
  phone      TEXT,
  token      UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversations (
  id            SERIAL PRIMARY KEY,
  visitor_id    INT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  department_id INT REFERENCES departments(id) ON DELETE SET NULL,
  channel_id    INT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'open',       -- open | pending | closed
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id              SERIAL PRIMARY KEY,
  channel_id      INT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  conversation_id INT REFERENCES conversations(id) ON DELETE CASCADE,
  author_type     TEXT NOT NULL,                    -- agent | visitor
  author_id       INT,
  author_name     TEXT NOT NULL,
  body            TEXT NOT NULL,
  kind            TEXT NOT NULL DEFAULT 'text',     -- text | sticker | image | file
  parent_id       INT REFERENCES messages(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'text';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS parent_id INT REFERENCES messages(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS reactions (
  id         SERIAL PRIMARY KEY,
  message_id INT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  agent_id   INT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  UNIQUE (message_id, agent_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_dept ON conversations(department_id, status);

CREATE TABLE IF NOT EXISTS meetings (
  id                       SERIAL PRIMARY KEY,
  public_id                TEXT UNIQUE,
  code                     TEXT UNIQUE,
  title                    TEXT NOT NULL,
  livekit_room_name        TEXT UNIQUE,
  created_by_agent_id      INT REFERENCES agents(id) ON DELETE SET NULL,
  host_agent_id            INT REFERENCES agents(id) ON DELETE SET NULL,
  status                   TEXT NOT NULL DEFAULT 'active',
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
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Asegurar columnas si la tabla ya existia en PostgreSQL con esquema previo
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS livekit_room_name TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS created_by_agent_id INT REFERENCES agents(id) ON DELETE SET NULL;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS host_agent_id INT REFERENCES agents(id) ON DELETE SET NULL;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS lobby_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS recording_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS max_participants INT NOT NULL DEFAULT 15;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

UPDATE meetings SET public_id = code WHERE public_id IS NULL AND code IS NOT NULL;
UPDATE meetings SET code = public_id WHERE code IS NULL AND public_id IS NOT NULL;
UPDATE meetings SET created_by_agent_id = host_agent_id WHERE created_by_agent_id IS NULL AND host_agent_id IS NOT NULL;
UPDATE meetings SET host_agent_id = created_by_agent_id WHERE host_agent_id IS NULL AND created_by_agent_id IS NOT NULL;
UPDATE meetings SET livekit_room_name = COALESCE(public_id, code, 'meet-' || id) WHERE livekit_room_name IS NULL;

CREATE INDEX IF NOT EXISTS idx_meetings_code ON meetings(code);
CREATE INDEX IF NOT EXISTS idx_meetings_public_id ON meetings(public_id);
CREATE INDEX IF NOT EXISTS idx_meetings_created_by ON meetings(created_by_agent_id);



-- Seed: departamentos
INSERT INTO departments (name, slug) VALUES
  ('Ventas', 'ventas'),
  ('Soporte Técnico', 'soporte'),
  ('Facturación', 'facturacion')
ON CONFLICT (slug) DO NOTHING;

-- Seed: canales internos (idempotente incluso en instalaciones antiguas sin índice único)
INSERT INTO channels (name, type)
SELECT seed.name, seed.type
FROM (VALUES
  ('general', 'channel'),
  ('anuncios', 'channel'),
  ('random', 'channel')
) AS seed(name, type)
WHERE NOT EXISTS (
  SELECT 1 FROM channels c WHERE c.name = seed.name AND c.type = seed.type
);

-- Seed: agente demo
INSERT INTO agents (name, email, color) VALUES
  ('Agente Demo', 'demo@kasupport.local', '#4f46e5')
ON CONFLICT (email) DO NOTHING;

-- Cuenta administrativa inicial. En instalaciones nuevas se recomienda crearla
-- mediante un proceso seguro y cambiar la contraseña inmediatamente.
INSERT INTO agents (name, email, password_hash, role, color)
VALUES ('Kenneth', 'kenneth@kapix.co.cr', '$2b$10$qb8Q4gRsl1HMHYXhrMPl7.ASUq02/c054aRCwNasGsDQFjceY4Ug2', 'admin', '#4f46e5')
ON CONFLICT (email) DO NOTHING;
