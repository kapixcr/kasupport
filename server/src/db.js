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

async function initDb() {
  const schemaPath = path.join(__dirname, '..', 'schema.sql');
  if (!fs.existsSync(schemaPath)) return;

  try {
    const sql = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(sql);
    console.log('✓ Base de datos e índices inicializados (schema.sql)');
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
        console.log('✓ Esquema aplicado exitosamente');
      } catch (createErr) {
        console.error('× No se pudo auto-crear la base de datos:', createErr.message);
      }
    }
  }
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  initDb,
};


