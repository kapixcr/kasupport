const { Pool } = require('pg');
const os = require('os');

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    `postgres://${os.userInfo().username}@localhost:5432/kasupport`,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
