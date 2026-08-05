const { Pool, Client } = require('pg');
const fs = require('fs');
const path = require('path');
const os = require('os');

const connectionString =
  process.env.DATABASE_URL ||
  `postgres://${os.userInfo().username}@localhost:5432/kasupport`;

const pool = new Pool({
  connectionString,
});

pool.on('error', (err) => {
  console.error('× Error en cliente inactivo de PostgreSQL:', err.message);
});

async function applyMigrations() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  if (!fs.existsSync(migrationsDir)) return;

  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  const files = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
  for (const name of files) {
    const alreadyApplied = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
    if (alreadyApplied.rows.length) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, name), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.log(`✓ Migración aplicada: ${name}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

async function ensureMeetingColumns() {
  const alterStatements = [
    "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS public_id TEXT",
    "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS code TEXT",
    "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS livekit_room_name TEXT",
    "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS created_by_agent_id INT REFERENCES agents(id) ON DELETE SET NULL",
    "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS host_agent_id INT REFERENCES agents(id) ON DELETE SET NULL",
    "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS lobby_enabled BOOLEAN NOT NULL DEFAULT true",
    "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS recording_enabled BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS max_participants INT NOT NULL DEFAULT 15",
    "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb",
    "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ",
    "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ",
    "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ",
    "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ",
    "ALTER TABLE meetings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()",
    "UPDATE meetings SET public_id = code WHERE public_id IS NULL AND code IS NOT NULL",
    "UPDATE meetings SET code = public_id WHERE code IS NULL AND public_id IS NOT NULL",
    "UPDATE meetings SET created_by_agent_id = host_agent_id WHERE created_by_agent_id IS NULL AND host_agent_id IS NOT NULL",
    "UPDATE meetings SET host_agent_id = created_by_agent_id WHERE host_agent_id IS NULL AND created_by_agent_id IS NOT NULL",
    `CREATE TABLE IF NOT EXISTS meeting_participants (
      id SERIAL PRIMARY KEY, meeting_id INT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      participant_type TEXT NOT NULL DEFAULT 'agent', agent_id INT REFERENCES agents(id) ON DELETE SET NULL,
      guest_token_hash TEXT, guest_token_expires_at TIMESTAMPTZ, guest_token_revoked_at TIMESTAMPTZ,
      display_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'participant', status TEXT NOT NULL DEFAULT 'pending',
      livekit_identity TEXT NOT NULL, hand_raised BOOLEAN NOT NULL DEFAULT false, admitted_at TIMESTAMPTZ,
      joined_at TIMESTAMPTZ, left_at TIMESTAMPTZ, rejected_at TIMESTAMPTZ, kicked_at TIMESTAMPTZ,
      last_seen_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_meeting_participants_agent ON meeting_participants(meeting_id, agent_id) WHERE agent_id IS NOT NULL`,
    `CREATE TABLE IF NOT EXISTS meeting_messages (
      id SERIAL PRIMARY KEY, meeting_id INT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      participant_id INT NOT NULL REFERENCES meeting_participants(id) ON DELETE CASCADE,
      body TEXT NOT NULL, idempotency_key TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS meeting_recordings (
      id SERIAL PRIMARY KEY, meeting_id INT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      started_by_agent_id INT REFERENCES agents(id) ON DELETE SET NULL, egress_id TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'starting', storage_key TEXT, mime_type TEXT, size_bytes BIGINT,
      duration_seconds DOUBLE PRECISION, started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ, error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS meeting_events (
      id SERIAL PRIMARY KEY, meeting_id INT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      actor_participant_id INT REFERENCES meeting_participants(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb, external_event_id TEXT UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  ];

  for (const stmt of alterStatements) {
    try {
      await pool.query(stmt);
    } catch {
      // Ignorar avisos de alter
    }
  }
}


async function initDb() {
  const schemaPath = path.join(__dirname, '..', 'schema.sql');
  if (!fs.existsSync(schemaPath)) return;

  try {
    const sql = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(sql);
    await ensureMeetingColumns();
    await applyMigrations();
    console.log('✓ Base de datos, migraciones e índices inicializados');
  } catch (err) {
    console.error('× Intento inicial en DB falló:', err.message);


    // Si la base de datos 'kasupport' no existe en PostgreSQL (código SQL Standard 3D000)
    if (err.code === '3D000') {

      console.log('→ Intentando crear la base de datos "kasupport"...');
      try {
        const postgresUrl = connectionString.replace(/\/([^/?]+)(\?.*)?$/, '/postgres$2');
        const adminClient = new Client({ connectionString: postgresUrl });
        await adminClient.connect();
        await adminClient.query('CREATE DATABASE kasupport;');
        await adminClient.end();
        console.log('✓ Base de datos "kasupport" creada con éxito. Aplicando esquema...');

        const sql = fs.readFileSync(schemaPath, 'utf8');
        await pool.query(sql);
        await applyMigrations();
        console.log('✓ Esquema y migraciones aplicados exitosamente');
      } catch (createErr) {
        console.error('× No se pudo auto-crear la base de datos:', createErr.message);
        throw createErr;
      }
      return;
    }
    throw err;
  }
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  initDb,
};


