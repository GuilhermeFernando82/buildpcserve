const axios = require("axios");
const cheerio = require("cheerio");
const { parseBRLPrice } = require("../priceUtils");

const CACHE_TTL_MS = 10 * 60 * 1000;
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

async function scrape(term) {
  const url = `https://patoloco.com.br/busca/?buscar-por=${encodeURIComponent(term)}`;
  const response = await client.get(url);

  if (response.status !== 200 || typeof response.data !== "string") {
    throw new Error(`Falha ao buscar "${term}" (status ${response.status})`);
  }

  const $ = cheerio.load(response.data);
  const products = [];

  $("article.product").each((_i, el) => {
    const card = $(el);
    if (card.hasClass("product-unavailable")) return; // sem estoque

    const name = card.find("h3.tit").first().text().trim();
    const link = card.find("a[href]").first().attr("href");
    const image = card.find(".product-image img").first().attr("src");
    const priceText = card.find(".price-new .h1").first().text();
    const price = parseBRLPrice(priceText);

    if (!name || !link || !(price > 0)) return;

    products.push({
      name,
      brand: "",
      price,
      available: true,
      url: link,
      image: image || "",
      store: "Pato Loco",
    });
  });

  return products;
}

async function fetchCategoryProducts(term) {
  const cached = cache.get(term);
  if (cached && cached.expires > Date.now()) {
    return cached.products;
  }

  const products = await scrape(term.replace(/-/g, " "));
  cache.set(term, { products, expires: Date.now() + CACHE_TTL_MS });
  return products;
}

module.exports = { fetchCategoryProducts };
