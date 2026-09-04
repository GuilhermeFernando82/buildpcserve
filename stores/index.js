const kabum = require("../kabum");
const terabyte = require("./terabyte");
const patoloco = require("./patoloco");
const { withAffiliate } = require("../affiliate");

// Pichau não entrou: o site detecta o Chromium headless (mesmo com patches
// de stealth em navigator.webdriver/plugins/chrome) e serve uma página de
// bloqueio disfarçada de "Site em Manutenção" para esse tráfego. Ver
// stores/pichau.js — o scraper está pronto, só não passa pela proteção.
//
// Amazon não entrou: as Condições de Uso proíbem explicitamente "a obtenção
// ou uso de quaisquer listas de produtos, descrições ou preços" e "qualquer
// coleta de dados, robôs ou quaisquer outras ferramentas de extração de
// dados". Diferente da Pichau (barreira técnica), aqui é uma proibição
// escrita — não é algo que dá pra contornar de forma legítima.
const STORES = [
  { id: "kabum", label: "Kabum", ...kabum },
  { id: "terabyte", label: "Terabyte", ...terabyte },
  { id: "patoloco", label: "Pato Loco", ...patoloco },
];

// Busca uma categoria em todas as lojas em paralelo e devolve o pool
// combinado de produtos (cada um já marcado com `store`). Uma loja que falhe
// (fora do ar, bloqueou o scraper, etc.) não derruba as demais.
async function fetchFromAllStores(term) {
  const results = await Promise.allSettled(
    STORES.map((store) => store.fetchCategoryProducts(term))
  );

  const products = [];
  const failedStores = [];

  results.forEach((result, i) => {
    const store = STORES[i];
    if (result.status === "fulfilled") {
      products.push(
        ...result.value.map((p) => ({
          ...p,
          // id único entre lojas: nem toda loja expõe um código de produto,
          // mas a URL sempre serve como chave estável. Vem da URL LIMPA, de
          // propósito: o histórico de preço é indexado por ele, e ligar ou
          // trocar o código de afiliado não pode reiniciar o histórico do
          // produto do zero.
          id: `${p.store}:${p.url}`,
          url: withAffiliate(p.url, store.id),
        }))
      );
    } else {
      failedStores.push(store.label);
      console.error(`Erro ao buscar em ${store.label} (termo "${term}"):`, result.reason?.message);
    }
  });

  return { products, failedStores };
}

module.exports = { STORES, fetchFromAllStores };
