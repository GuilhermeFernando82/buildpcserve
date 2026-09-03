// Converte "R$ 2.399,99" (ou com &nbsp;) em 2399.99
function parseBRLPrice(text) {
  if (!text) return null;
  const clean = text
    .replace(/ /g, " ")
    .replace(/[^\d.,]/g, "")
    .trim();
  if (!clean) return null;
  const normalized = clean.replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

module.exports = { parseBRLPrice };
