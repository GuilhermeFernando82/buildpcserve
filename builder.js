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

// TDP (consumo de placa) de referência por modelo, em watts — valores
// públicos de fabricante. Mais específico primeiro (ex.: "5070 TI" antes de
// "5070") já que é checado em ordem e o primeiro que bater vence.
const GPU_TDP_TABLE = [
  // NVIDIA RTX 50 (Blackwell)
  [/RTX\s?5090/i, 575],
  [/RTX\s?5080/i, 360],
  [/RTX\s?5070\s?TI/i, 300],
  [/RTX\s?5070/i, 250],
  [/RTX\s?5060\s?TI/i, 180],
  [/RTX\s?5060/i, 145],
  [/RTX\s?5050/i, 130],
  // NVIDIA RTX 40 (Ada)
  [/RTX\s?4090/i, 450],
  [/RTX\s?4080/i, 320],
  [/RTX\s?4070\s?TI/i, 285],
  [/RTX\s?4070/i, 200],
  [/RTX\s?4060\s?TI/i, 160],
  [/RTX\s?4060/i, 115],
  // NVIDIA RTX 30 (Ampere)
  [/RTX\s?3090/i, 380],
  [/RTX\s?3080/i, 320],
  [/RTX\s?3070\s?TI/i, 290],
  [/RTX\s?3070/i, 220],
  [/RTX\s?3060\s?TI/i, 200],
  [/RTX\s?3060/i, 170],
  [/RTX\s?3050/i, 130],
  // NVIDIA GTX 16 / entrada
  [/GTX\s?1660/i, 125],
  [/GTX\s?1650/i, 75],
  [/GTX\s?1630/i, 75],
  [/GT\s?1030/i, 30],
  [/GT\s?730/i, 25],
  [/GT\s?710/i, 20],
  // AMD RX 9000 (RDNA4)
  [/RX\s?9070\s?XT/i, 304],
  [/RX\s?9070/i, 220],
  [/RX\s?9060\s?XT/i, 160],
  [/RX\s?9060/i, 150],
  // AMD RX 7000 (RDNA3)
  [/RX\s?7900\s?XTX/i, 355],
  [/RX\s?7900\s?XT/i, 315],
  [/RX\s?7900\s?GRE/i, 260],
  [/RX\s?7800\s?XT/i, 263],
  [/RX\s?7700\s?XT/i, 245],
  [/RX\s?7600\s?XT/i, 190],
  [/RX\s?7600/i, 165],
  // AMD RX 6000 (RDNA2) e anteriores
  [/RX\s?6950/i, 335],
  [/RX\s?6900/i, 300],
  [/RX\s?6800\s?XT/i, 300],
  [/RX\s?6800/i, 250],
  [/RX\s?6750/i, 250],
  [/RX\s?6700/i, 230],
  [/RX\s?6650/i, 180],
  [/RX\s?6600\s?XT/i, 160],
  [/RX\s?6600/i, 132],
  [/RX\s?6500/i, 107],
  [/RX\s?5700/i, 225],
  [/RX\s?5600/i, 150],
  [/RX\s?5500/i, 130],
  [/RX\s?580/i, 185],
  [/RX\s?550/i, 50],
  // Intel Arc
  [/ARC\s?B580/i, 190],
  [/ARC\s?B570/i, 150],
  [/ARC\s?A770/i, 225],
  [/ARC\s?A750/i, 225],
  [/ARC\s?A580/i, 175],
  [/ARC\s?A380/i, 75],
];

function estimateGpuWatts(name) {
  const n = name.toUpperCase();
  for (const [pattern, watts] of GPU_TDP_TABLE) {
    if (pattern.test(n)) return watts;
  }
  return null; // modelo não reconhecido — quem chama decide o fallback
}

// TDP de CPU é mais variável que o de GPU (PBP vs. limites configurados
// pela placa-mãe), então isso é só uma estimativa por faixa/linha — o
// suficiente pra não subdimensionar a fonte.
function estimateCpuWatts(name) {
  const n = name.toUpperCase();
  if (/RYZEN\s?9|CORE\s?I9|CORE\s?ULTRA\s?9/.test(n)) return 145;
  if (/RYZEN\s?7|CORE\s?I7|CORE\s?ULTRA\s?7/.test(n)) return 105;
  if (/RYZEN\s?5|CORE\s?I5|CORE\s?ULTRA\s?5/.test(n)) return 80;
  if (/RYZEN\s?3|CORE\s?I3/.test(n)) return 60;
  return 80; // desconhecido: assume uma faixa intermediária
}

const STANDARD_PSU_WATTAGES = [450, 500, 550, 600, 650, 700, 750, 850, 1000, 1200];

function roundUpToStandardWattage(watts) {
  for (const std of STANDARD_PSU_WATTAGES) {
    if (std >= watts) return std;
  }
  return STANDARD_PSU_WATTAGES[STANDARD_PSU_WATTAGES.length - 1];
}

// Wattagem mínima de fonte pra configuração inteira: TDP estimado da GPU +
// CPU + ~120W pro resto (placa-mãe, RAM, armazenamento, fans/AIO), com 30%
// de margem (curva de eficiência da fonte + headroom pra picos/upgrades),
// arredondado pra cima até um valor comercial comum de fonte. Sem
// reconhecer o modelo da GPU, cai de volta numa estimativa por faixa de
// preço (proxy grosseiro, mas melhor que nada).
function minWattsForBuild(gpuProduct, cpuProduct) {
  const gpuWatts =
    (gpuProduct && estimateGpuWatts(gpuProduct.name)) ??
    (gpuProduct && gpuProduct.price > 3000
      ? 300
      : gpuProduct && gpuProduct.price > 1500
        ? 200
        : 130);
  const cpuWatts = cpuProduct ? estimateCpuWatts(cpuProduct.name) : 80;
  const restOfSystem = 120;
  const raw = (gpuWatts + cpuWatts + restOfSystem) * 1.3;
  return roundUpToStandardWattage(raw);
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

function extractRamCapacityGb(name) {
  const m = name.match(/(\d{1,3})\s?GB/i);
  return m ? Number(m[1]) : null;
}

const MIN_RAM_GB = 16;
const MAX_RAM_STICKS = 4;

// Embrulha um anúncio de RAM num "pacote": quantas unidades dele (1 a 4)
// são necessárias pra bater os 16GB mínimos, com o preço já multiplicado
// pela quantidade. Isso deixa o resto do algoritmo (que só entende "escolha
// 1 item pelo preço") funcionar sem mudança nenhuma — ele passa a comparar
// pacotes de RAM pelo preço total, do mesmo jeito que compara qualquer
// outra categoria.
function toRamPackage(p, quantity) {
  const gbEach = extractRamCapacityGb(p.name);
  const totalGb = gbEach ? gbEach * quantity : null;
  return {
    ...p,
    id: `${p.id}:x${quantity}`,
    price: p.price * quantity,
    unitPrice: p.price,
    quantity,
    name:
      quantity > 1
        ? `${quantity}x ${p.name}${totalGb ? ` — total ${totalGb}GB` : ""}`
        : p.name,
  };
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

  // Monta pacotes de 1 a 4 pentes iguais até fechar pelo menos 16GB.
  // Anúncios sem capacidade reconhecível, ou que precisariam de mais de 4
  // pentes pra chegar lá, ficam de fora.
  const packages = [];
  for (const p of candidates) {
    const gbEach = extractRamCapacityGb(p.name);
    if (!gbEach) continue;
    const quantity = Math.ceil(MIN_RAM_GB / gbEach);
    if (quantity > MAX_RAM_STICKS) continue;
    packages.push(toRamPackage(p, quantity));
  }

  if (!packages.length) {
    warnings.push(
      "Não encontramos memória RAM que alcance 16GB com até 4 pentes; exibindo opções abaixo de 16GB."
    );
    return candidates.map((p) => toRamPackage(p, 1));
  }

  return packages;
}

function computePsuCandidates(raw, gpuProduct, cpuProduct, warnings) {
  if (!gpuProduct && !cpuProduct) return raw;
  const minWatts = minWattsForBuild(gpuProduct, cpuProduct);
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
//
// `preferPredicate`, quando informado, dá vantagem aos itens que batem nele
// (a "distância" desses itens conta como só 60% do valor real) — usado pra
// puxar a escolha de placa-mãe pra DDR4 quando o preço for parecido: DDR5
// tem um piso de preço de pente bem mais alto (~R$900 vs ~R$300 do DDR4),
// então uma placa DDR5 escolhida só por estar R$10 mais perto do alvo pode
// custar centenas de reais a mais no fim das contas, via RAM, dinheiro que
// devia ter ido pra GPU/CPU.
function pickClosestByPrice(sorted, targetPrice, preferPredicate) {
  if (!sorted.length) return null;
  const distance = (p) => {
    const d = Math.abs(p.price - targetPrice);
    return preferPredicate && preferPredicate(p) ? d * 0.6 : d;
  };
  return sorted.reduce((best, p) => (distance(p) < distance(best) ? p : best));
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
  function setCategory(key, sorted, preferredPrice, preferPredicate) {
    sortedByCategory[key] = sorted;
    if (!sorted.length) {
      selection[key] = null;
      return;
    }
    selection[key] = pickClosestByPrice(
      sorted,
      preferredPrice ?? budget * pctByKey[key],
      preferPredicate
    );
  }

  // DDR4 tem um piso de preço de pente bem mais baixo que DDR5 (~R$300 vs
  // ~R$900). Preferir placa-mãe DDR4 quando o preço for parecido evita que
  // a plataforma escolhida "imponha" um gasto bem maior em RAM mais adiante
  // (ver pickClosestByPrice).
  const preferDdr4 = (p) => detectDdr(p.name) === "DDR4";

  // Ao reencaixar uma categoria dependente (placa-mãe/RAM/fonte) depois de
  // uma troca de CPU/GPU, usa o preço anterior como alvo — mas nunca acima
  // do teto da própria categoria, pra uma troca de socket/marca não poder
  // "reencaixar" num item bem mais caro só por ser o mais próximo do preço
  // antigo num pool agora diferente.
  function cappedTarget(key, prevPrice) {
    const ceiling = budget * pctByKey[key] * CEILING_MULT;
    return Math.min(prevPrice ?? budget * pctByKey[key], ceiling);
  }

  // Recalcula placa-mãe (a partir da CPU atual), em cascata a RAM (a partir
  // da placa-mãe resultante) e a fonte (o consumo da CPU também entra na
  // conta). Chamada sempre que a CPU muda.
  function refreshFromCpu() {
    if (rawByKey.motherboard) {
      const prevPrice = selection.motherboard?.price;
      const candidates = computeMotherboardCandidates(rawByKey.motherboard, selection.cpu, warnings);
      const sorted = [...candidates].sort((a, b) => a.price - b.price);
      setCategory("motherboard", sorted, cappedTarget("motherboard", prevPrice), preferDdr4);
      refreshFromMotherboard();
    }
    refreshPsu();
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

  // Recalcula fonte a partir da GPU+CPU atuais (consumo somado dos dois é o
  // que determina a wattagem mínima). Chamada sempre que a GPU ou a CPU mudam.
  function refreshPsu() {
    if (!rawByKey.psu) return;
    const prevPrice = selection.psu?.price;
    const candidates = computePsuCandidates(rawByKey.psu, selection.gpu, selection.cpu, warnings);
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
    if (cat.key === "gpu") refreshPsu();
  }
  // Caso alguma dessas categorias não exista no pedido, garante que fiquem
  // resolvidas mesmo sem cpu/gpu correspondente.
  if (!("motherboard" in sortedByCategory) && rawByKey.motherboard) refreshFromCpu();
  if (!("psu" in sortedByCategory) && rawByKey.psu) refreshPsu();

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
    if (key === "cpu") refreshFromCpu(); // já recalcula placa-mãe, RAM e fonte em cascata
    else if (key === "motherboard") refreshFromMotherboard(); // motherboard pode subir direto (não só via CPU)
    if (key === "gpu") refreshPsu();
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
