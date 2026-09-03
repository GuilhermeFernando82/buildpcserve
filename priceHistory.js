// Guarda um retrato (snapshot) de preço por produto a cada busca, formando
// um histórico ao longo do tempo. Em memória do processo — some a cada
// redeploy/reinício do servidor. Pra sobreviver a isso precisaria de um
// banco de dados persistente (ver README).
const MAX_POINTS_PER_PRODUCT = 1000;
const history = new Map(); // id -> [{ price, date }]

function recordSnapshot(products) {
  const now = new Date().toISOString();
  for (const p of products) {
    if (!p.id || !(p.price > 0)) continue;
    let points = history.get(p.id);
    if (!points) {
      points = [];
      history.set(p.id, points);
    }
    const last = points[points.length - 1];
    // Não duplica ponto se o preço não mudou desde a última busca.
    if (!last || last.price !== p.price) {
      points.push({ price: p.price, date: now });
      if (points.length > MAX_POINTS_PER_PRODUCT) points.shift();
    }
  }
}

function getHistory(id) {
  return history.get(id) || [];
}

module.exports = { recordSnapshot, getHistory };
