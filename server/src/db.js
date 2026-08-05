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

async function initDb() {
  const schemaPath = path.join(__dirname, '..', 'schema.sql');
  if (!fs.existsSync(schemaPath)) return;

  try {
    const sql = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(sql);
    await applyMigrations();
    console.log('✓ Base de datos, migraciones e índices inicializados');
  } catch (err) {
    console.error('× Intento inicial en DB falló:', err.message);

    // Si la base de datos 'kasupport' no existe (código 3D000)
    if (err.code === '3D000' || err.message.includes('does not exist')) {
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


