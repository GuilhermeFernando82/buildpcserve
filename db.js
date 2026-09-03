// Conexão com Postgres, só ativa se DATABASE_URL estiver definida (o
// Railway injeta isso sozinho quando você adiciona um serviço de banco de
// dados Postgres no mesmo projeto). Sem essa variável, `pool` fica null e
// quem usa (priceHistory.js) cai de volta pra guardar em memória.
const { Pool } = require("pg");

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : null;

async function ensureSchema() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS price_snapshots (
      id SERIAL PRIMARY KEY,
      product_id TEXT NOT NULL,
      price NUMERIC NOT NULL,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_price_snapshots_product_id
      ON price_snapshots (product_id, recorded_at);
  `);
}

module.exports = { pool, ensureSchema };
