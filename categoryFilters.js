// Filtra ruído da busca livre por categoria: os sites nomeiam o produto
// sempre começando pelo tipo dele ("Processador ...", "Placa de Vídeo ...",
// "Fonte ..."), então um prefixo é suficiente pra separar, por exemplo, um
// cooler de processador (que também bate na busca por "processador") do
// processador em si.
const CATEGORY_NAME_FILTERS = {
  gpu: /^placa\s+de\s+v[ií]deo\b/i,
  cpu: /^processador\b/i,
  motherboard: /^placa[\s-]?m[ãa]e\b/i,
  ram: /^mem[oó]ria\b/i,
  storage: /^ssd\b/i,
  psu: /^fonte\b/i,
  case: /^gabinete\b/i,
  cooler: /^(water\s?)?cooler\b/i,
};

function filterByCategory(products, categoryKey) {
  const pattern = CATEGORY_NAME_FILTERS[categoryKey];
  if (!pattern) return products;
  return products.filter((p) => pattern.test(p.name));
}

module.exports = { CATEGORY_NAME_FILTERS, filterByCategory };
