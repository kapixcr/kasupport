const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const os = require('os');

const connectionString =
  process.env.DATABASE_URL ||
  `postgres://${os.userInfo().username}@localhost:5432/kasupport`;

const pool = new Pool({
  connectionString,
});

async function initDb() {
  try {
    const schemaPath = path.join(__dirname, '..', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(sql);
      console.log('✓ Base de datos e índices inicializados (schema.sql)');
    }
  } catch (err) {
    console.error('× Error al inicializar la base de datos:', err.message);
  }
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  initDb,
};

