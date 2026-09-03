// Guarda um retrato (snapshot) de preço por produto a cada busca, formando
// um histórico ao longo do tempo.
//
// Com DATABASE_URL configurada (Postgres no Railway), grava lá — sobrevive
// a redeploys e reinícios. Sem banco configurado, cai de volta pra guardar
// em memória do processo (funciona, mas some a cada redeploy).
const { pool } = require("./db");

const MAX_POINTS_PER_PRODUCT = 1000;
const memory = new Map(); // usado só no fallback sem banco

async function recordOne(p) {
  if (pool) {
    try {
      const { rows } = await pool.query(
        `SELECT price FROM price_snapshots WHERE product_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
        [p.id]
      );
      // Não duplica ponto se o preço não mudou desde o último registro.
      if (rows[0] && Number(rows[0].price) === p.price) return;
      await pool.query(`INSERT INTO price_snapshots (product_id, price) VALUES ($1, $2)`, [
        p.id,
        p.price,
      ]);
    } catch (err) {
      console.error("Erro ao gravar histórico de preço:", err.message);
    }
    return;
  }

  let points = memory.get(p.id);
  if (!points) {
    points = [];
    memory.set(p.id, points);
  }
  const last = points[points.length - 1];
  if (!last || last.price !== p.price) {
    points.push({ price: p.price, date: new Date().toISOString() });
    if (points.length > MAX_POINTS_PER_PRODUCT) points.shift();
  }
}

// Roda em paralelo (não é fila) — uma busca pode trazer 100+ produtos, e
// gravar um por vez seria lento. O pool do pg enfileira sozinho se faltar
// conexão livre, então não estoura nada, só faz mais devagar.
async function recordSnapshot(products) {
  await Promise.all(
    products.filter((p) => p.id && p.price > 0).map((p) => recordOne(p))
  );
}

async function getHistory(id) {
  if (pool) {
    try {
      const { rows } = await pool.query(
        `SELECT price, recorded_at FROM price_snapshots
         WHERE product_id = $1 ORDER BY recorded_at ASC LIMIT $2`,
        [id, MAX_POINTS_PER_PRODUCT]
      );
      return rows.map((r) => ({ price: Number(r.price), date: r.recorded_at }));
    } catch (err) {
      console.error("Erro ao buscar histórico de preço:", err.message);
      return [];
    }
  }
  return memory.get(id) || [];
}

module.exports = { recordSnapshot, getHistory };
