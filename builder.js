// Monta a melhor configuração possível dentro do orçamento informado,
// a partir das listas de produtos já buscadas por categoria (potencialmente
// de várias lojas combinadas).
//
// Como as listagens não expõem specs estruturadas (socket, chipset,
// wattagem), a compatibilidade é inferida por palavras-chave no nome do
// produto. É uma heurística best-effort, não uma checagem de specs real.
//
// CPU e GPU são "âncoras": placa-mãe depende do socket da CPU, RAM depende
// do DDR da placa-mãe, e fonte depende da wattagem da GPU. Sempre que CPU ou
// GPU mudam de item (nas fases de downgrade/upgrade, que otimizam por preço
// e podem trocar de marca/geração), as categorias dependentes são
// recalculadas — do contrário uma troca de CPU pode deixar a placa-mãe já
// escolhida incompatível.

function detectCpuBrand(name) {
  const n = name.toLowerCase();
  if (n.includes("amd")) return "AMD";
  if (n.includes("intel")) return "Intel";
  return null;
}

// Socket é mais específico que marca: gerações recentes da Intel trocaram de
// soquete (ex.: Core Ultra 200 é LGA1851, incompatível com placas LGA1700).
function detectSocket(name) {
  const n = name.toUpperCase();
  let m = n.match(/\bAM[45]\b/);
  if (m) return m[0];
  m = n.match(/\bTR4\b|\bSTRX4\b|\bSP3\b/);
  if (m) return m[0];
  m = n.match(/LGA\s?-?\s?(\d{3,4})/);
  if (m) return "LGA" + m[1];
  return null;
}

function detectDdr(name) {
  const n = name.toLowerCase();
  if (n.includes("ddr5")) return "DDR5";
  if (n.includes("ddr4")) return "DDR4";
  if (n.includes("ddr3")) return "DDR3";
  return null;
}

function extractWatts(name) {
  const m = name.match(/(\d{3,4})\s?w\b/i);
  return m ? Number(m[1]) : null;
}

function minWattsForGpu(gpuPrice) {
  if (gpuPrice > 3000) return 650;
  if (gpuPrice > 1500) return 550;
  return 450;
}

// Itens que aparecem misturados nas categorias de armazenamento mas não são
// SSDs em si (adaptadores, gavetas, docks, leitores...).
const STORAGE_ACCESSORY_PATTERN =
  /adaptador|gaveta|dock\b|leitor de cart|case externo|caixa externa|bracket|capa para|cabo sata/i;

// Filtra `products` por um predicado; se o resultado ficar vazio, mantém a
// lista original (best-effort) e registra um aviso.
function filterWithFallback(products, predicate, warnings, warningMsg) {
  const filtered = products.filter(predicate);
  if (filtered.length) return filtered;
  if (warningMsg) warnings.push(warningMsg);
  return products;
}

function computeMotherboardCandidates(raw, cpuProduct, warnings) {
  if (!cpuProduct) return raw;
  const socket = detectSocket(cpuProduct.name);
  if (socket) {
    return filterWithFallback(
      raw,
      (p) => detectSocket(p.name) === socket,
      warnings,
      `Não encontramos placa-mãe com soquete ${socket} (compatível com o processador escolhido); exibindo outras opções.`
    );
  }
  const brand = detectCpuBrand(cpuProduct.name);
  if (brand) {
    return filterWithFallback(
      raw,
      (p) => detectCpuBrand(p.name) === brand,
      warnings,
      `Não encontramos placa-mãe compatível com processadores ${brand}; exibindo outras opções.`
    );
  }
  return raw;
}

function computeRamCandidates(raw, motherboardProduct, warnings) {
  // A categoria mistura pentes de notebook (SO-DIMM) com os de desktop
  // (DIMM); só os de desktop encaixam na placa-mãe escolhida.
  let candidates = filterWithFallback(
    raw,
    (p) => !p.name.toLowerCase().includes("notebook"),
    warnings,
    null
  );

  if (motherboardProduct) {
    const ddr = detectDdr(motherboardProduct.name);
    if (ddr) {
      candidates = filterWithFallback(
        candidates,
        (p) => detectDdr(p.name) === ddr,
        warnings,
        `Não encontramos memória ${ddr} compatível com a placa-mãe escolhida; exibindo outras opções.`
      );
    }
  }
  return candidates;
}

function computePsuCandidates(raw, gpuProduct, warnings) {
  if (!gpuProduct) return raw;
  const minWatts = minWattsForGpu(gpuProduct.price);
  return filterWithFallback(
    raw,
    (p) => (extractWatts(p.name) ?? 0) >= minWatts,
    warnings,
    null
  );
}

function computeStorageCandidates(raw, warnings) {
  return filterWithFallback(
    raw,
    (p) => !STORAGE_ACCESSORY_PATTERN.test(p.name) && p.price >= 60,
    warnings,
    null
  );
}

// Teto usado tanto na fase de upgrade quanto nos recálculos em cascata:
// nenhuma categoria sobe (ou é "reencaixada" após uma troca de CPU/GPU)
// além de N vezes o que o próprio peso dela no orçamento sugere. Sem isso,
// uma categoria com degraus de preço miúdos (RAM, por exemplo) engole toda
// a folga que deveria ir pra GPU/CPU, e um recálculo em cascata pode
// "reencaixar" a placa-mãe/RAM/fonte num preço bem mais alto sem checar o
// orçamento total.
const CEILING_MULT = 1.6;

// Escolhe, numa lista já ordenada por preço, o item mais próximo de
// targetPrice. É o critério de escolha usado em toda categoria (inicial e
// nos recálculos em cascata após trocar CPU/GPU).
function pickClosestByPrice(sorted, targetPrice) {
  if (!sorted.length) return null;
  return sorted.reduce((best, p) =>
    Math.abs(p.price - targetPrice) < Math.abs(best.price - targetPrice) ? p : best
  );
}

function nextCheaper(sorted, current) {
  const idx = sorted.findIndex((p) => p.id === current.id);
  if (idx <= 0) return null;
  return sorted[idx - 1];
}

function nextPricier(sorted, current, maxPrice) {
  const idx = sorted.findIndex((p) => p.id === current.id);
  if (idx === -1 || idx === sorted.length - 1) return null;
  const candidate = sorted[idx + 1];
  return candidate.price <= maxPrice ? candidate : null;
}

function buildConfiguration(budget, categoryResults) {
  const rawByKey = {};
  const pctByKey = {};
  const labelByKey = {};
  for (const cat of categoryResults) {
    rawByKey[cat.key] = cat.products;
    pctByKey[cat.key] = cat.pct;
    labelByKey[cat.key] = cat.label;
  }

  const sortedByCategory = {};
  const selection = {};
  const warnings = [];

  // Escolhe, dentro de cada categoria, o item mais próximo do valor-alvo
  // (preço-alvo informado, ou o peso da categoria vezes o orçamento por
  // padrão). Usar "mais próximo" em vez de "o mais caro que ainda cabe"
  // faz a soma das 8 categorias já convergir perto do orçamento total desde
  // a primeira passada — sem isso, várias categorias escolhendo cada uma o
  // máximo que sua própria tolerância permite somava bem mais que o
  // orçamento, e a correção (cortar sempre o item mais caro entre todos)
  // penalizava desproporcionalmente a GPU, que normalmente é a peça mais
  // cara e portanto a primeira a ser cortada repetidas vezes.
  function setCategory(key, sorted, preferredPrice) {
    sortedByCategory[key] = sorted;
    if (!sorted.length) {
      selection[key] = null;
      return;
    }
    selection[key] = pickClosestByPrice(sorted, preferredPrice ?? budget * pctByKey[key]);
  }

  // Ao reencaixar uma categoria dependente (placa-mãe/RAM/fonte) depois de
  // uma troca de CPU/GPU, usa o preço anterior como alvo — mas nunca acima
  // do teto da própria categoria, pra uma troca de socket/marca não poder
  // "reencaixar" num item bem mais caro só por ser o mais próximo do preço
  // antigo num pool agora diferente.
  function cappedTarget(key, prevPrice) {
    const ceiling = budget * pctByKey[key] * CEILING_MULT;
    return Math.min(prevPrice ?? budget * pctByKey[key], ceiling);
  }

  // Recalcula placa-mãe (a partir da CPU atual) e, em cascata, a RAM
  // (a partir da placa-mãe resultante). Chamada sempre que a CPU muda.
  function refreshFromCpu() {
    if (!rawByKey.motherboard) return;
    const prevPrice = selection.motherboard?.price;
    const candidates = computeMotherboardCandidates(rawByKey.motherboard, selection.cpu, warnings);
    const sorted = [...candidates].sort((a, b) => a.price - b.price);
    setCategory("motherboard", sorted, cappedTarget("motherboard", prevPrice));
    refreshFromMotherboard();
  }

  // Recalcula RAM a partir da placa-mãe atual. Chamada sempre que a placa-mãe
  // muda (diretamente ou em cascata a partir de uma troca de CPU).
  function refreshFromMotherboard() {
    if (!rawByKey.ram) return;
    const prevPrice = selection.ram?.price;
    const candidates = computeRamCandidates(rawByKey.ram, selection.motherboard, warnings);
    const sorted = [...candidates].sort((a, b) => a.price - b.price);
    setCategory("ram", sorted, cappedTarget("ram", prevPrice));
  }

  // Recalcula fonte a partir da GPU atual. Chamada sempre que a GPU muda.
  function refreshFromGpu() {
    if (!rawByKey.psu) return;
    const prevPrice = selection.psu?.price;
    const candidates = computePsuCandidates(rawByKey.psu, selection.gpu, warnings);
    const sorted = [...candidates].sort((a, b) => a.price - b.price);
    setCategory("psu", sorted, cappedTarget("psu", prevPrice));
  }

  // --- Seleção inicial, na ordem das categorias (gpu, cpu, motherboard,
  // ram, storage, psu, case, cooler) para que cpu/gpu já estejam definidos
  // quando as categorias dependentes forem processadas pela primeira vez.
  for (const cat of categoryResults) {
    if (["motherboard", "ram", "psu"].includes(cat.key)) continue; // via refresh*
    let candidates = cat.products;
    if (cat.key === "storage") {
      candidates = computeStorageCandidates(candidates, warnings);
    }
    const sorted = [...candidates].sort((a, b) => a.price - b.price);
    setCategory(cat.key, sorted);

    if (cat.key === "cpu") refreshFromCpu();
    if (cat.key === "gpu") refreshFromGpu();
  }
  // Caso alguma dessas categorias não exista no pedido, garante que fiquem
  // resolvidas mesmo sem cpu/gpu correspondente.
  if (!("motherboard" in sortedByCategory) && rawByKey.motherboard) refreshFromCpu();
  if (!("psu" in sortedByCategory) && rawByKey.psu) refreshFromGpu();

  if (categoryResults.every((c) => !rawByKey[c.key]?.length)) {
    return { items: categoryResults.map((c) => ({ key: c.key, label: c.label, product: null })), total: 0, warnings };
  }

  for (const cat of categoryResults) {
    if (!sortedByCategory[cat.key]?.length && rawByKey[cat.key]) {
      warnings.push(`Não encontramos itens disponíveis para "${cat.label}".`);
    }
  }

  const activeCats = () => categoryResults.filter((c) => selection[c.key]);

  const total = () =>
    activeCats().reduce((sum, c) => sum + selection[c.key].price, 0);

  function applySwap(key, product) {
    selection[key] = product;
    if (key === "cpu") refreshFromCpu();
    if (key === "gpu") refreshFromGpu();
  }

  // Downgrade: enquanto estourar o orçamento, troca o item de maior preço
  // (entre os que ainda têm opção mais barata) pelo próximo mais barato.
  function downgradePass() {
    let guard = 0;
    while (total() > budget && guard < 200) {
      guard++;
      let swap = null;
      for (const cat of [...activeCats()].sort(
        (a, b) => selection[b.key].price - selection[a.key].price
      )) {
        const cheaper = nextCheaper(sortedByCategory[cat.key], selection[cat.key]);
        if (cheaper) {
          swap = { key: cat.key, product: cheaper };
          break;
        }
      }
      if (!swap) break; // todas as categorias já estão no item mais barato
      applySwap(swap.key, swap.product);
    }
  }

  downgradePass();

  if (total() > budget) {
    warnings.push(
      "Mesmo com os itens mais baratos disponíveis, o orçamento informado não é suficiente para montar um PC completo nessas categorias."
    );
  }

  // Upgrade: se sobrar folga, tenta melhorar as categorias de maior peso
  // primeiro. Roda em duas levas: a primeira respeita um teto por categoria
  // (CEILING_MULT vezes o peso dela no orçamento), pra RAM/fonte/etc. não
  // engolirem a folga que deveria ir pra GPU/CPU; a segunda leva libera
  // qualquer sobra que ainda reste (ex.: orçamento bem acima do necessário
  // pra encher todo mundo até o teto) sem limite, também em ordem de peso.
  function upgradePass(useCeiling) {
    let guard = 0;
    while (guard < 200) {
      guard++;
      let upgraded = false;
      const priorityOrder = [...activeCats()].sort((a, b) => b.pct - a.pct);
      for (const cat of priorityOrder) {
        const room = budget - total();
        if (room <= 0) break;
        let maxPrice = selection[cat.key].price + room;
        if (useCeiling) {
          const ceiling = budget * pctByKey[cat.key] * CEILING_MULT;
          maxPrice = Math.min(maxPrice, ceiling);
        }
        const better = nextPricier(sortedByCategory[cat.key], selection[cat.key], maxPrice);
        if (better) {
          applySwap(cat.key, better);
          upgraded = true;
        }
      }
      if (!upgraded) break;
    }
  }

  upgradePass(true);
  upgradePass(false);

  // Rede de segurança: um recálculo em cascata (troca de CPU/GPU que muda
  // socket/marca) pode, em tese, reencaixar uma categoria dependente acima
  // do teto dela mesma. Garante que nada saia do ar acima do orçamento.
  downgradePass();

  const items = categoryResults.map((cat) => ({
    key: cat.key,
    label: cat.label,
    product: selection[cat.key] || null,
  }));

  return {
    items,
    total: total(),
    warnings,
  };
}

module.exports = { buildConfiguration };
