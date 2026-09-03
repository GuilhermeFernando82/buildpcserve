const axios = require("axios");

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos
const cache = new Map(); // term -> { expires, products }

const client = axios.create({
  timeout: 20000,
  maxRedirects: 5,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  },
  validateStatus: (status) => status < 500,
});

// Localiza o índice do fechamento correspondente a um '{' ou '[' em openIdx,
// ignorando chaves/colchetes que estejam dentro de strings JSON.
function findMatchingBracket(str, openIdx) {
  const openChar = str[openIdx];
  const closeChar = openChar === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = openIdx; i < str.length; i++) {
    const ch = str[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === openChar) {
      depth++;
    } else if (ch === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// A Kabum usa dois templates diferentes dependendo do termo buscado:
// - Termo que casa com uma categoria: redireciona para /hardware/<slug> e
//   embute os produtos como uma string estilo React Flight
//   (pageProps.data é string, produtos em `"data":[{"code":...`).
// - Busca livre sem categoria correspondente: fica em /busca/<termo> e
//   embute os produtos como JSON já estruturado em
//   pageProps.data.catalogServer.data (array pronto).
// As duas variantes usam os mesmos campos por produto.
function extractRawProducts(nextData) {
  const payload = nextData?.props?.pageProps?.data;

  if (Array.isArray(payload?.catalogServer?.data)) {
    return payload.catalogServer.data;
  }

  if (typeof payload === "string") {
    const marker = '"data":[{"code":';
    const markerIdx = payload.indexOf(marker);
    if (markerIdx === -1) return []; // categoria sem resultados

    const arrStart = markerIdx + '"data":'.length; // aponta para o '['
    const arrEnd = findMatchingBracket(payload, arrStart);
    if (arrEnd === -1) {
      throw new Error("Não foi possível delimitar o array de produtos");
    }
    return JSON.parse(payload.slice(arrStart, arrEnd + 1));
  }

  throw new Error("Formato inesperado de pageProps.data");
}

function extractProductsFromHtml(html) {
  const scriptMatch = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!scriptMatch) {
    throw new Error("__NEXT_DATA__ não encontrado na página");
  }

  const nextData = JSON.parse(scriptMatch[1]);
  const rawProducts = extractRawProducts(nextData);

  return rawProducts
    .map((p) => {
      const price = p.priceWithDiscount > 0 ? p.priceWithDiscount : p.price;
      return {
        code: p.code,
        name: p.name,
        brand: p.manufacturer?.name || "",
        price: Number(price) || 0,
        originalPrice: Number(p.price) || 0,
        available: !!p.available && (p.quantity ?? 0) > 0,
        rating: p.averageRating || 0,
        image: p.image || "",
        url: `https://www.kabum.com.br/produto/${p.code}/${p.friendlyName || ""}`,
        store: "Kabum",
      };
    })
    .filter((p) => p.available && p.price > 0);
}

async function fetchCategoryProducts(term) {
  const cached = cache.get(term);
  if (cached && cached.expires > Date.now()) {
    return cached.products;
  }

  const response = await client.get(
    `https://www.kabum.com.br/busca/${encodeURIComponent(term)}`
  );

  if (response.status !== 200 || typeof response.data !== "string") {
    throw new Error(`Falha ao buscar categoria "${term}" (status ${response.status})`);
  }

  const products = extractProductsFromHtml(response.data);
  cache.set(term, { products, expires: Date.now() + CACHE_TTL_MS });
  return products;
}

module.exports = { fetchCategoryProducts };
