const express = require("express");
const cors = require("cors");

const { getCategories } = require("./categories");
const { fetchFromAllStores } = require("./stores");
const { buildConfiguration } = require("./builder");
const { CATEGORY_NAME_FILTERS, filterByCategory, filterByRelevance } = require("./categoryFilters");
const { recordSnapshot, getHistory } = require("./priceHistory");
const { computeBottleneck } = require("./bottleneck");
const { ensureSchema, pool } = require("./db");
const { isAffiliateActive } = require("./affiliate");
const { verifyProducts } = require("./productPage");

const app = express();
const PORT = process.env.PORT || 3001;

// Em produção, defina CORS_ORIGIN com a URL do frontend na Vercel (ex.:
// https://seu-projeto.vercel.app) para restringir quem pode chamar a API.
// Sem a variável, libera geral — ok para uso local/pessoal.
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(corsOrigin ? { origin: corsOrigin.split(",") } : {}));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    priceHistoryStorage: pool ? "postgres" : "memory",
    // A UI usa isso pra só mostrar o aviso de link de afiliado quando algum
    // programa estiver de fato configurado.
    affiliate: isAffiliateActive(),
  });
});

// Quantas vezes vale remontar depois de descobrir preço/estoque errado nas
// peças escolhidas. Duas resolve os casos reais: a primeira troca o item com
// problema, a segunda confirma o substituto. Mais que isso só somaria espera.
const MAX_VERIFY_ROUNDS = 2;

// Monta a configuração conferindo, na página de cada peça escolhida, se o
// preço e o estoque da listagem ainda valem (ver productPage.js). Peça
// esgotada sai do páreo e preço errado é corrigido; nos dois casos a montagem
// é refeita, já que uma peça mais cara ou ausente muda o que cabe no
// orçamento. Só as ~8 peças escolhidas são conferidas — o pool inteiro seria
// inviável.
async function buildVerified(budget, categoryResults, options) {
  let pools = categoryResults;
  let build = buildConfiguration(budget, pools, options);

  // Guarda o que já foi conferido entre as rodadas: um item reescolhido na
  // remontagem não precisa de nova requisição. A chave é o anúncio de origem,
  // porque a RAM pode vir embrulhada em um pacote de N unidades, com id e
  // preço próprios (ver toRamPackage) — o que se confere na loja é sempre o
  // anúncio, com o preço de uma unidade.
  const checked = new Map();
  const originId = (p) => p.sourceId || p.id;
  const unitPrice = (p) => p.unitPrice ?? p.price;

  for (let round = 0; round < MAX_VERIFY_ROUNDS; round++) {
    const chosen = build.items.map((i) => i.product).filter(Boolean);
    const pending = chosen.filter((p) => !checked.has(originId(p)));

    const results = await verifyProducts(pending);
    // Registra também os que não deram retorno, como null, pra não tentar de
    // novo o mesmo produto na próxima rodada.
    for (const product of pending) {
      checked.set(originId(product), results.get(product) || null);
    }

    const soldOut = new Set();
    const priceFixes = new Map();
    for (const product of chosen) {
      const check = checked.get(originId(product));
      if (!check) continue; // não deu para conferir: mantém o dado da busca
      if (check.available === false) soldOut.add(originId(product));
      else if (Math.abs(check.price - unitPrice(product)) > 0.01) {
        priceFixes.set(originId(product), check.price);
      }
    }

    if (!soldOut.size && !priceFixes.size) break; // listagem confere

    pools = pools.map((cat) => ({
      ...cat,
      products: cat.products
        .filter((p) => !soldOut.has(p.id))
        .map((p) => (priceFixes.has(p.id) ? { ...p, price: priceFixes.get(p.id) } : p)),
    }));

    build = buildConfiguration(budget, pools, options);
  }

  return build;
}

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
  const storageTypeRaw = String(req.query.storageType || "").toLowerCase();
  const storageType = ["nvme", "sata"].includes(storageTypeRaw) ? storageTypeRaw : null;
  const ddrTypeRaw = String(req.query.ddrType || "").toLowerCase();
  const ddrType = ["ddr4", "ddr5"].includes(ddrTypeRaw) ? ddrTypeRaw : null;

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

  const { items, total, warnings } = await buildVerified(budget, results, {
    gpuBrand,
    cpuBrand,
    ramGb,
    dualChannel,
    storageGb,
    storageType,
    ddrType,
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
    storageType,
    ddrType,
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

    // A busca dos sites é "fuzzy" (ex.: "rtx 5070" trazendo "Ryzen 7
    // 5700X"); exige que as palavras digitadas apareçam de fato no nome.
    const relevant = filterByRelevance(products, q);
    const base = relevant.length ? relevant : products;

    // Filtra pra categoria pedida (ex.: busca de "processador" não deve
    // trazer cooler de processador). Se o filtro zerar tudo — termo digitado
    // não bate com o padrão de nome esperado pra essa categoria — melhor
    // mostrar os resultados sem filtro do que uma lista vazia.
    const filtered = category ? filterByCategory(base, category) : base;
    const result = filtered.length ? filtered : base;

    result.sort((a, b) => a.price - b.price);
    // Não espera terminar de gravar pra responder — a gravação roda em
    // segundo plano, alimentando o histórico de preço pra próxima vez.
    recordSnapshot(result).catch((err) =>
      console.error("Erro ao gravar histórico de preço:", err.message)
    );
    res.json({ products: result, failedStores });
  } catch (err) {
    console.error(`Erro ao buscar "${q}":`, err.message);
    res.status(502).json({
      error: "Não foi possível buscar agora. Tente novamente em instantes.",
    });
  }
});

app.get("/api/bottleneck", (req, res) => {
  const cpu = String(req.query.cpu || "").trim();
  const gpu = String(req.query.gpu || "").trim();

  if (!cpu || !gpu) {
    return res
      .status(400)
      .json({ error: "Informe o processador e a placa de vídeo." });
  }
  if (cpu.length > 200 || gpu.length > 200) {
    return res.status(400).json({ error: "Nome de peça muito longo." });
  }

  res.json(computeBottleneck(cpu, gpu));
});

app.get("/api/price-history", async (req, res) => {
  const id = String(req.query.id || "");
  if (!id) {
    return res.status(400).json({ error: "Informe o id do produto." });
  }
  try {
    res.json({ points: await getHistory(id) });
  } catch (err) {
    console.error("Erro ao buscar histórico de preço:", err.message);
    res.status(502).json({ error: "Não foi possível buscar o histórico agora." });
  }
});

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Erro ao preparar o banco de dados:", err.message);
    // Sobe mesmo assim — priceHistory.js cai pro fallback em memória se o
    // banco falhar, o resto da aplicação não depende dele.
    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
  });
