const express = require("express");
const cors = require("cors");

const categories = require("./categories");
const { fetchFromAllStores } = require("./stores");
const { buildConfiguration } = require("./builder");

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

  if (!Number.isFinite(budget) || budget < 500 || budget > 200000) {
    return res.status(400).json({
      error: "Informe um orçamento válido entre R$ 500 e R$ 200.000.",
    });
  }

  const results = await Promise.all(
    categories.map(async (cat) => {
      try {
        const { products, failedStores } = await fetchFromAllStores(cat.term);
        return { ...cat, products, failedStores };
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

  const { items, total, warnings } = buildConfiguration(budget, results);

  if (items.every((i) => !i.product)) {
    return res.status(502).json({
      error:
        "Não foi possível obter dados de preços agora. Tente novamente em instantes.",
    });
  }

  res.json({
    budget,
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

  if (!q) {
    return res.status(400).json({ error: "Informe um termo de busca." });
  }
  if (q.length > 100) {
    return res.status(400).json({ error: "Termo de busca muito longo." });
  }

  try {
    const { products, failedStores } = await fetchFromAllStores(q);
    products.sort((a, b) => a.price - b.price);
    res.json({ products, failedStores });
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
