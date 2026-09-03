const express = require("express");
const cors = require("cors");

const { getCategories } = require("./categories");
const { fetchFromAllStores } = require("./stores");
const { buildConfiguration } = require("./builder");
const { CATEGORY_NAME_FILTERS, filterByCategory } = require("./categoryFilters");

const app = express();
const PORT = process.env.PORT || 3001;

// Em produção, defina CORS_ORIGIN com a URL do frontend na Vercel (ex.:
// https://seu-projeto.vercel.app) para restringir quem pode chamar a API.
// Sem a variável, libera geral — ok para uso local/pessoal.
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(corsOrigin ? { origin: corsOrigin.split(",") } : {}));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/build", async (req, res) => {
  const budget = Number(req.query.budget);
  const profile = req.query.profile === "balanced" ? "balanced" : "gpu";
  const gpuBrandRaw = String(req.query.gpuBrand || "").toLowerCase();
  const gpuBrand = ["nvidia", "amd"].includes(gpuBrandRaw) ? gpuBrandRaw : null;
  const cpuBrandRaw = String(req.query.cpuBrand || "").toLowerCase();
  const cpuBrand = ["intel", "amd"].includes(cpuBrandRaw) ? cpuBrandRaw : null;
  const dualChannel = ["1", "true"].includes(String(req.query.dualChannel || "").toLowerCase());

  const ramGbRaw = Number(req.query.ramGb);
  const ramGb =
    Number.isFinite(ramGbRaw) && ramGbRaw >= 4 && ramGbRaw <= 256 ? ramGbRaw : null;

  const storageGbRaw = Number(req.query.storageGb);
  const storageGb =
    Number.isFinite(storageGbRaw) && storageGbRaw >= 60 && storageGbRaw <= 16000
      ? storageGbRaw
      : null;

  if (!Number.isFinite(budget) || budget < 500 || budget > 200000) {
    return res.status(400).json({
      error: "Informe um orçamento válido entre R$ 500 e R$ 200.000.",
    });
  }

  const categories = getCategories(profile);

  const results = await Promise.all(
    categories.map(async (cat) => {
      try {
        const { products, failedStores } = await fetchFromAllStores(cat.term);
        // Mesmo filtro por nome do /api/search: a busca por "processador"
        // também traz cooler de processador, "fonte" traz cabo, etc. Sem
        // isso o algoritmo podia escolher um acessório pensando que era o
        // componente em si.
        const filtered = filterByCategory(products, cat.key);
        return { ...cat, products: filtered.length ? filtered : products, failedStores };
      } catch (err) {
        console.error(`Erro ao buscar "${cat.label}" (${cat.term}):`, err.message);
        return { ...cat, products: [], failedStores: [] };
      }
    })
  );

  const failedCategories = results
    .filter((r) => r.products.length === 0)
    .map((r) => r.label);

  const storeIssues = [
    ...new Set(results.flatMap((r) => r.failedStores || [])),
  ];

  const { items, total, warnings } = buildConfiguration(budget, results, {
    gpuBrand,
    cpuBrand,
    ramGb,
    dualChannel,
    storageGb,
  });

  if (items.every((i) => !i.product)) {
    return res.status(502).json({
      error:
        "Não foi possível obter dados de preços agora. Tente novamente em instantes.",
    });
  }

  res.json({
    budget,
    profile,
    gpuBrand,
    cpuBrand,
    ramGb: ramGb ?? 16,
    dualChannel,
    storageGb,
    total,
    remaining: budget - total,
    items,
    warnings,
    failedCategories,
    storeIssues,
    fetchedAt: new Date().toISOString(),
  });
});

app.get("/api/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  const category = String(req.query.category || "").trim();

  if (!q) {
    return res.status(400).json({ error: "Informe um termo de busca." });
  }
  if (q.length > 100) {
    return res.status(400).json({ error: "Termo de busca muito longo." });
  }
  if (category && !CATEGORY_NAME_FILTERS[category]) {
    return res.status(400).json({ error: "Categoria desconhecida." });
  }

  try {
    const { products, failedStores } = await fetchFromAllStores(q);

    // Filtra pra categoria pedida (ex.: busca de "processador" não deve
    // trazer cooler de processador). Se o filtro zerar tudo — termo digitado
    // não bate com o padrão de nome esperado pra essa categoria — melhor
    // mostrar os resultados sem filtro do que uma lista vazia.
    const filtered = category ? filterByCategory(products, category) : products;
    const result = filtered.length ? filtered : products;

    result.sort((a, b) => a.price - b.price);
    res.json({ products: result, failedStores });
  } catch (err) {
    console.error(`Erro ao buscar "${q}":`, err.message);
    res.status(502).json({
      error: "Não foi possível buscar agora. Tente novamente em instantes.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
