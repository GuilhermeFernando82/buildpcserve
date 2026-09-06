// Confere preço e disponibilidade na PÁGINA do produto, não na listagem.
//
// Por que isso existe: a listagem de busca das lojas às vezes serve dado
// velho. Na Terabyte isso é visível — depois que um produto esgota, a busca
// continua devolvendo o último preço e `estoque=1`, e o card fica idêntico ao
// de um produto disponível (comparei os dois: mesmas classes, mesmos
// atributos), então não há como perceber pela listagem. Um caso real: uma RAM
// aparecia por R$ 1.699,99 na busca enquanto a página dizia R$ 2.319,99 e
// esgotado.
//
// Conferir os milhares de produtos de uma busca seria inviável, mas conferir
// só as 8 peças que a montagem escolheu é barato — e é exatamente onde o dado
// errado chega no usuário.
//
// Cada loja precisa de um caminho próprio: a Terabyte bloqueia requisição
// simples com 403 (só passa pelo navegador do Playwright, o mesmo já usado
// para a busca dela), enquanto Kabum e Pato Loco respondem a HTTP comum.

const axios = require("axios");
const cheerio = require("cheerio");
const { withPage } = require("./browser");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Curto de propósito: as conferências rodam em lote e uma página travada
// segura o lote inteiro. Quem não responde nesse tempo simplesmente fica sem
// conferir, e a montagem segue com o dado da busca.
const TIMEOUT_MS = 9000;

// A mesma peça costuma ser escolhida em montagens seguidas (e reaparece entre
// as rodadas de uma mesma montagem), então vale guardar o que já foi
// conferido. TTL curto porque o ponto aqui é justamente pegar preço fresco.
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // url -> { expires, value }

function fromCache(url) {
  const hit = cache.get(url);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    cache.delete(url);
    return undefined;
  }
  return hit.value;
}

function toCache(url, value) {
  cache.set(url, { value, expires: Date.now() + CACHE_TTL_MS });
}

function toCents(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

// Preço em formato brasileiro ("4.263,38") para número.
function parseBRL(text) {
  const m = String(text).match(/([\d.]+,\d{2})/);
  if (!m) return null;
  return toCents(m[1].replace(/\./g, "").replace(",", "."));
}

async function verifyKabum(url) {
  const { data } = await axios.get(url, {
    headers: { "User-Agent": UA },
    timeout: TIMEOUT_MS,
  });
  // O HTML embute JSON com as aspas escapadas; desescapar deixa os dois
  // formatos (JSON-LD e estado da página) pesquisáveis do mesmo jeito.
  const txt = String(data).replace(/\\"/g, '"');

  // Na página do produto — ao contrário da listagem de categoria — os campos
  // já vêm com a promoção aplicada, então o primeiro preço encontrado é o que
  // a loja cobra à vista.
  const priceMatch = txt.match(/"priceWithDiscount":\s*([0-9.]+)/);
  const price = priceMatch ? toCents(priceMatch[1]) : null;

  const soldOut =
    /"availability":\s*"[^"]*OutOfStock/i.test(txt) ||
    /"available":\s*false/.test(txt);

  return { price, available: soldOut ? false : true };
}

// Extrai preço e disponibilidade da página já carregada. Separado do goto
// porque as verificações da Terabyte reaproveitam a mesma página do
// navegador — abrir um contexto por produto era o que fazia a conferência
// custar mais do que a busca inteira.
function readTerabytePage(page) {
  return page.evaluate(() => {
    let price = null;
    for (const tag of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const json = JSON.parse(tag.textContent);
        const product = json["@type"] === "Product" ? json : null;
        if (product?.offers?.price) {
          price = Number(product.offers.price);
          break;
        }
      } catch {
        // bloco de dados estruturados quebrado: tenta o próximo
      }
    }

    // `availability` do JSON-LD da Terabyte diz "InStock" mesmo em produto
    // esgotado, então não serve. O sinal confiável é visual: na página de um
    // produto esgotado o preço à vista some e entra o bloco .prodEsgPreco no
    // lugar. Precisa checar visibilidade — o elemento existe no HTML dos dois
    // casos, só fica oculto quando há estoque.
    const esgotado = document.querySelector(".prodEsgPreco");
    const available = !(esgotado && esgotado.offsetParent !== null);

    return { price, available };
  });
}

async function verifyPatoLoco(url) {
  const { data } = await axios.get(url, {
    headers: { "User-Agent": UA },
    timeout: TIMEOUT_MS,
  });
  const $ = cheerio.load(data);
  const price = parseBRL($(".price-new .h1").first().text());

  // A marca de indisponível do Pato Loco aparece nos cards de produtos
  // relacionados da mesma página, então não dá para procurá-la no HTML
  // inteiro sem falso positivo. A listagem dele já exclui indisponível, e o
  // preço da listagem bateu com o da página nos testes — aqui só o preço é
  // conferido, e a disponibilidade fica como a busca informou.
  return { price, available: null };
}

// Lojas que respondem a HTTP comum — dá para conferir todas em paralelo.
const HTTP_VERIFIERS = {
  Kabum: verifyKabum,
  "Pato Loco": verifyPatoLoco,
};

function normalize(result) {
  if (!result || !(result.price > 0)) return null;
  return { price: toCents(result.price), available: result.available };
}

function logFailure(product, err) {
  console.error(
    `Não foi possível conferir "${product.name?.slice(0, 40)}" (${product.store}):`,
    err.message
  );
}

// Confere uma lista de produtos e devolve um Map de produto -> { price,
// available }. Produto ausente do Map é o que não deu para conferir (loja sem
// verificador, página fora do ar, layout mudou); quem chama trata isso como
// "sem informação" e mantém o dado da busca — a conferência é uma melhoria,
// não pode derrubar a montagem.
async function verifyProducts(products) {
  const found = new Map();

  const pending = [];
  for (const product of products) {
    if (!product.url) continue;
    const cached = fromCache(product.url);
    if (cached === undefined) pending.push(product);
    else if (cached) found.set(product, cached);
  }

  const viaHttp = pending.filter((p) => HTTP_VERIFIERS[p.store]);
  const viaBrowser = pending.filter((p) => p.store === "Terabyte");

  const httpWork = viaHttp.map(async (product) => {
    try {
      const result = normalize(await HTTP_VERIFIERS[product.store](product.url));
      if (result) {
        found.set(product, result);
        toCache(product.url, result);
      }
    } catch (err) {
      logFailure(product, err);
    }
  });

  // A Terabyte responde 403 a requisição simples, então só dá para conferir
  // pelo navegador — um contexto por produto, em paralelo (o próprio
  // browser.js limita quantos rodam ao mesmo tempo).
  //
  // Reaproveitar uma aba só para várias páginas seria mais barato, mas a
  // Terabyte corta navegações seguidas no mesmo contexto: da terceira em
  // diante ela devolve uma página sem os dados, sem erro nenhum — o que faz a
  // conferência falhar em silêncio, que é pior que ser lenta.
  const browserWork = viaBrowser.map(async (product) => {
    try {
      const result = await withPage(async (page) => {
        // Imagem, fonte e vídeo não influenciam preço nem visibilidade e são
        // o grosso do peso da página. CSS fica: a checagem de esgotado depende
        // de o elemento estar de fato visível.
        await page.route("**/*", (route) => {
          const type = route.request().resourceType();
          if (type === "image" || type === "font" || type === "media") route.abort();
          else route.continue();
        });
        await page.goto(product.url, {
          waitUntil: "domcontentloaded",
          timeout: TIMEOUT_MS,
        });
        return readTerabytePage(page);
      });
      const normalized = normalize(result);
      if (normalized) {
        found.set(product, normalized);
        toCache(product.url, normalized);
      }
    } catch (err) {
      logFailure(product, err);
    }
  });

  await Promise.all([...httpWork, ...browserWork]);
  return found;
}

module.exports = { verifyProducts };
