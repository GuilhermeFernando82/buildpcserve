const { withPage } = require("../browser");
const { parseBRLPrice } = require("../priceUtils");

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // term -> { expires, products }

async function scrape(term) {
  return withPage(async (page) => {
    const url = `https://www.pichau.com.br/search?q=${encodeURIComponent(term)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    try {
      await page.waitForSelector('a[data-cy="list-product"]', { timeout: 15000 });
    } catch {
      return []; // sem resultados para esse termo
    }

    return page.evaluate(() => {
      const cards = [...document.querySelectorAll('a[data-cy="list-product"]')];
      return cards.map((card) => {
        const nameEl = card.querySelector("h2");
        const imgEl = card.querySelector("img");
        const priceEl = [...card.querySelectorAll("div,span")].find((el) =>
          el.className && typeof el.className === "string" && el.className.endsWith("-price_vista")
        );
        const outOfStock = /indispon[ií]vel|esgotado|avise-me/i.test(card.textContent);
        return {
          name: nameEl ? nameEl.textContent.trim() : "",
          priceText: priceEl ? priceEl.textContent : "",
          available: !outOfStock,
          url: card.href,
          image: imgEl ? imgEl.src : "",
        };
      });
    });
  });
}

async function fetchCategoryProducts(term) {
  const cached = cache.get(term);
  if (cached && cached.expires > Date.now()) {
    return cached.products;
  }

  const raw = await scrape(term.replace(/-/g, " "));
  const products = raw
    .map((p) => ({
      name: p.name,
      brand: "",
      price: parseBRLPrice(p.priceText),
      available: p.available,
      url: p.url,
      image: p.image,
      store: "Pichau",
    }))
    .filter((p) => p.available && p.price > 0 && p.name);

  cache.set(term, { products, expires: Date.now() + CACHE_TTL_MS });
  return products;
}

module.exports = { fetchCategoryProducts };
