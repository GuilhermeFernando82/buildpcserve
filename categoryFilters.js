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

// O buscador dos sites é "fuzzy" — buscar "rtx 5070" pode trazer um
// "Ryzen 7 5700X" só porque os números se parecem. Exige que cada pedaço
// digitado apareça de fato no nome do produto.
//
// Separa em blocos de letras e blocos de números (não só por espaço) — por
// isso "5070ti" (sem espaço) vira ["5070", "ti"], os mesmos dois pedaços que
// "5070 Ti" tem no nome do produto. Sem isso, "5070ti" de um jeito só batia
// como substring literal contra nomes que também não tivessem espaço aí, o
// que praticamente nunca acontece — daí "RTX 5070 Ti" nunca era reconhecido
// e a busca caía pros resultados fuzzy do site (RX 550, RX 580 etc.).
function filterByRelevance(products, query) {
  const tokens = (query.toLowerCase().match(/[a-zà-ú]+|[0-9]+/gi) || []).filter(
    (t) => t.length >= 2
  );
  if (!tokens.length) return products;
  return products.filter((p) => {
    const name = p.name.toLowerCase();
    return tokens.every((t) => name.includes(t));
  });
}

module.exports = { CATEGORY_NAME_FILTERS, filterByCategory, filterByRelevance };
