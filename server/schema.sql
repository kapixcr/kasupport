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
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE channels ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS post_policy TEXT NOT NULL DEFAULT 'all';

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

-- Seed: departamentos
INSERT INTO departments (name, slug) VALUES
  ('Ventas', 'ventas'),
  ('Soporte Técnico', 'soporte'),
  ('Facturación', 'facturacion')
ON CONFLICT (slug) DO NOTHING;

-- Seed: canales internos
INSERT INTO channels (name, type) VALUES
  ('general', 'channel'),
  ('anuncios', 'channel'),
  ('random', 'channel')
ON CONFLICT DO NOTHING;

-- Seed: agente demo
INSERT INTO agents (name, email, color) VALUES
  ('Agente Demo', 'demo@kasupport.local', '#4f46e5')
ON CONFLICT (email) DO NOTHING;
