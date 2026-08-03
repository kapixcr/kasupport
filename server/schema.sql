-- Kasupport — esquema PostgreSQL
-- Sistema tipo Slack + widget de soporte embebible

CREATE TABLE IF NOT EXISTS agents (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT UNIQUE,
  color      TEXT NOT NULL DEFAULT '#4f46e5',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
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
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
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
