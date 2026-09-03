const { withPage } = require("../browser");

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // term -> { expires, products }

async function scrape(term) {
  return withPage(async (page) => {
    const url = `https://www.terabyteshop.com.br/busca?str=${encodeURIComponent(term)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    try {
      await page.waitForSelector(".product-item", { timeout: 15000 });
    } catch {
      return []; // sem resultados para esse termo
    }

    return page.evaluate(() => {
      const cards = [...document.querySelectorAll(".product-item")];
      return cards.map((card) => {
        const nameEl = card.querySelector(".product-item__name h2");
        const linkEl = card.querySelector("a.product-item__name");
        const imgEl = card.querySelector("img");
        return {
          name: nameEl ? nameEl.textContent.trim() : "",
          brand: card.dataset.tssBrand || "",
          price: card.dataset.tssPrice ? Number(card.dataset.tssPrice) : null,
          available: card.dataset.tssEstoque === "1",
          url: linkEl ? new URL(linkEl.getAttribute("href"), location.origin).href : "",
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
    .filter((p) => p.available && p.price > 0 && p.name)
    .map((p) => ({ ...p, store: "Terabyte" }));

  cache.set(term, { products, expires: Date.now() + CACHE_TTL_MS });
  return products;
}

module.exports = { fetchCategoryProducts };
