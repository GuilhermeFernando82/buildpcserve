// Estimativa de gargalo (bottleneck) entre processador e placa de vídeo em
// 1080p, 1440p e 4K.
//
// Os índices abaixo são de desempenho RELATIVO em jogos (0-100), curados a
// partir de médias de benchmarks públicos por modelo — mesma ideia da tabela
// de TDP em builder.js: valor real de referência por modelo, não um número
// buscado ao vivo. Não existe API pública e gratuita de benchmark por jogo, e
// o gargalo real varia com jogo, engine, preset e resolução de render — por
// isso o resultado é uma estimativa de tendência, não um FPS garantido.
//
// A modelagem por resolução segue o comportamento real medido em reviews:
//
//   - O teto da CPU é ~constante entre resoluções. O trabalho da CPU (lógica
//     do jogo, física, draw calls) não depende da quantidade de pixels.
//   - O teto da GPU cai conforme a resolução sobe, porque aí sim o trabalho
//     é proporcional aos pixels. Na média das reviews, 1440p entrega ~70% do
//     FPS de 1080p e 4K ~42%, na mesma GPU.
//
// Daí sai o efeito conhecido: em 1080p costuma sobrar GPU e faltar CPU
// (gargalo de CPU), e em 4K acontece o contrário (gargalo de GPU).

// Referência: RTX 5090 = 100. Mais específico antes do mais genérico — a
// lista é testada em ordem e o primeiro padrão que bater vence (senão
// "RTX 5070" casaria antes de "RTX 5070 Ti").
const GPU_SCORE_TABLE = [
  // NVIDIA RTX 50 (Blackwell)
  [/RTX\s?5090/i, 100],
  [/RTX\s?5080/i, 78],
  [/RTX\s?5070\s?TI/i, 68],
  [/RTX\s?5070/i, 58],
  [/RTX\s?5060\s?TI/i, 42],
  [/RTX\s?5060/i, 34],
  [/RTX\s?5050/i, 26],
  // NVIDIA RTX 40 (Ada)
  [/RTX\s?4090/i, 96],
  [/RTX\s?4080/i, 74],
  [/RTX\s?4070\s?TI/i, 63],
  [/RTX\s?4070/i, 52],
  [/RTX\s?4060\s?TI/i, 40],
  [/RTX\s?4060/i, 32],
  // NVIDIA RTX 30 (Ampere)
  [/RTX\s?3090/i, 66],
  [/RTX\s?3080\s?TI/i, 63],
  [/RTX\s?3080/i, 58],
  [/RTX\s?3070\s?TI/i, 50],
  [/RTX\s?3070/i, 47],
  [/RTX\s?3060\s?TI/i, 40],
  [/RTX\s?3060/i, 33],
  [/RTX\s?3050/i, 22],
  // NVIDIA GTX 16 / entrada
  [/GTX\s?1660/i, 26],
  [/GTX\s?1650/i, 15],
  [/GTX\s?1630/i, 8],
  [/GT\s?1030/i, 5],
  [/GT\s?7[13]0/i, 3],
  // AMD RX 9000 (RDNA4)
  [/RX\s?9070\s?XT/i, 72],
  [/RX\s?9070/i, 65],
  [/RX\s?9060\s?XT/i, 40],
  [/RX\s?9060/i, 33],
  // AMD RX 7000 (RDNA3)
  [/RX\s?7900\s?XTX/i, 82],
  [/RX\s?7900\s?XT/i, 74],
  [/RX\s?7900\s?GRE/i, 65],
  [/RX\s?7800\s?XT/i, 58],
  [/RX\s?7700\s?XT/i, 48],
  [/RX\s?7600\s?XT/i, 36],
  [/RX\s?7600/i, 32],
  // AMD RX 6000 (RDNA2)
  [/RX\s?6950/i, 62],
  [/RX\s?6900/i, 58],
  [/RX\s?6800\s?XT/i, 55],
  [/RX\s?6800/i, 50],
  [/RX\s?6750/i, 45],
  [/RX\s?6700/i, 43],
  [/RX\s?6650/i, 36],
  [/RX\s?6600\s?XT/i, 34],
  [/RX\s?6600/i, 30],
  [/RX\s?6500/i, 18],
  [/RX\s?6400/i, 13],
  // AMD RX 5000 (RDNA) e Polaris
  [/RX\s?5700\s?XT/i, 38],
  [/RX\s?5700/i, 34],
  [/RX\s?5600/i, 30],
  [/RX\s?5500/i, 22],
  [/RX\s?590/i, 22],
  [/RX\s?580/i, 20],
  [/RX\s?570/i, 17],
  [/RX\s?560/i, 10],
  [/RX\s?550/i, 8],
  // Intel Arc
  [/ARC\s?B580/i, 38],
  [/ARC\s?B570/i, 33],
  [/ARC\s?A770/i, 34],
  [/ARC\s?A750/i, 31],
  [/ARC\s?A580/i, 25],
  [/ARC\s?A380/i, 12],
];

// Referência: Ryzen 7 9800X3D / Core i9 14900K ≈ 100. Índice ponderado pra
// JOGOS — por isso pesa IPC e clock por núcleo, e não contagem de threads:
// um Ryzen 9 de 16 núcleos não rende proporcionalmente mais FPS que um
// Ryzen 7 da mesma geração. Os X3D aparecem no topo porque o cache 3D é o
// que mais move o ponteiro em jogos.
const CPU_SCORE_TABLE = [
  // AMD X3D (cache 3D — melhores em jogos)
  [/9950\s?X3D/i, 100],
  [/9900\s?X3D/i, 98],
  [/9800\s?X3D/i, 99],
  [/7950\s?X3D/i, 92],
  [/7900\s?X3D/i, 89],
  [/7800\s?X3D/i, 90],
  [/5800\s?X3D/i, 82],
  [/5700\s?X3D/i, 78],
  // AMD Ryzen 9000 (Zen 5)
  [/9950X/i, 88],
  [/9900X/i, 85],
  [/9700X/i, 83],
  [/9600X/i, 80],
  // AMD Ryzen 7000 (Zen 4)
  [/7950X/i, 84],
  [/7900X/i, 81],
  [/7800X/i, 80],
  [/7700X/i, 79],
  [/7700\b/i, 77],
  [/7600X/i, 75],
  [/7600\b/i, 73],
  [/7500F/i, 72],
  // AMD Ryzen 5000 (Zen 3)
  [/5950X/i, 70],
  [/5900X/i, 68],
  [/5800X/i, 65],
  [/5700X/i, 60],
  [/5700G/i, 55],
  [/5600X/i, 58],
  [/5600G/i, 52],
  [/5600\b/i, 56],
  [/5500/i, 48],
  // AMD Ryzen 3000 (Zen 2) e anteriores
  [/3700X/i, 48],
  [/3600X/i, 46],
  [/3600/i, 44],
  [/3300X/i, 38],
  [/3200G/i, 30],
  [/2600/i, 34],
  [/1600/i, 28],
  // Intel Core Ultra (Arrow Lake, LGA1851)
  [/ULTRA\s?9\s?285/i, 92],
  [/ULTRA\s?7\s?265/i, 86],
  [/ULTRA\s?5\s?245/i, 78],
  [/ULTRA\s?5\s?225/i, 72],
  // Intel 14ª geração
  [/149\d\dK/i, 97],
  [/147\d\dK/i, 89],
  [/146\d\dK/i, 83],
  [/145\d\d/i, 74],
  [/144\d\d/i, 70],
  [/141\d\d/i, 58],
  // Intel 13ª geração
  [/139\d\dK/i, 95],
  [/137\d\dK/i, 87],
  [/136\d\dK/i, 81],
  [/135\d\d/i, 72],
  [/134\d\d/i, 68],
  [/131\d\d/i, 55],
  // Intel 12ª geração
  [/129\d\dK/i, 90],
  [/127\d\dK/i, 82],
  [/126\d\dK/i, 78],
  [/124\d\d/i, 65],
  [/121\d\d/i, 50],
  // Intel 11ª / 10ª geração
  [/119\d\d/i, 75],
  [/117\d\d/i, 70],
  [/116\d\d/i, 63],
  [/114\d\d/i, 58],
  [/109\d\d/i, 72],
  [/107\d\d/i, 66],
  [/106\d\d/i, 58],
  [/104\d\d/i, 52],
  [/101\d\d/i, 38],
  // Intel 9ª geração e anteriores
  [/99\d\d/i, 62],
  [/97\d\d/i, 56],
  [/96\d\d/i, 48],
  [/94\d\d/i, 40],
  [/87\d\d/i, 50],
  [/86\d\d/i, 44],
  [/84\d\d/i, 36],
  [/77\d\d/i, 38],
  [/76\d\d/i, 34],
];

// Faixa média — usada quando o modelo não é reconhecido, pra ainda dar uma
// resposta útil em vez de erro. A UI avisa que foi estimativa.
const DEFAULT_SCORE = 45;

function matchScore(table, name) {
  const n = String(name).toUpperCase();
  for (const [pattern, score] of table) {
    if (pattern.test(n)) return score;
  }
  return null;
}

function scoreFor(table, name) {
  const score = matchScore(table, name);
  return { score: score ?? DEFAULT_SCORE, matched: score !== null };
}

// Quanto do FPS de 1080p a mesma GPU entrega em cada resolução (média de
// reviews em jogos AAA). A CPU não entra aqui de propósito: o teto dela é
// praticamente o mesmo nas três resoluções.
const RESOLUTIONS = [
  { key: "1080p", label: "1080p (Full HD)", gpuFactor: 1 },
  { key: "1440p", label: "1440p (Quad HD)", gpuFactor: 0.7 },
  { key: "4k", label: "4K (Ultra HD)", gpuFactor: 0.42 },
];

// Converte índice relativo (0-100) no teto aproximado de FPS que a peça
// sustenta sozinha, numa média de jogos AAA em preset alto.
function cpuFpsCeiling(score) {
  return 70 + score * 3.3;
}

function gpuFpsCeiling(score, factor) {
  return (40 + score * 3.6) * factor;
}

// Abaixo disso a diferença entre os dois tetos está dentro da margem de erro
// de uma estimativa por modelo — não faz sentido apontar culpado.
const BALANCED_THRESHOLD = 8;

function computeBottleneck(cpuName, gpuName) {
  const cpu = scoreFor(CPU_SCORE_TABLE, cpuName);
  const gpu = scoreFor(GPU_SCORE_TABLE, gpuName);

  const cpuCeiling = cpuFpsCeiling(cpu.score);

  const byResolution = RESOLUTIONS.map(({ key, label, gpuFactor }) => {
    const gpuCeiling = gpuFpsCeiling(gpu.score, gpuFactor);
    const higher = Math.max(cpuCeiling, gpuCeiling);
    const lower = Math.min(cpuCeiling, gpuCeiling);
    const bottleneckPercent = Math.round(((higher - lower) / higher) * 100);

    return {
      key,
      label,
      // A peça mais lenta é quem dita o FPS — a outra fica esperando.
      estimatedFps: Math.round(lower),
      cpuCeiling: Math.round(cpuCeiling),
      gpuCeiling: Math.round(gpuCeiling),
      bottleneckPercent,
      limitedBy:
        bottleneckPercent < BALANCED_THRESHOLD
          ? "balanced"
          : cpuCeiling < gpuCeiling
            ? "cpu"
            : "gpu",
    };
  });

  return {
    cpu: { name: cpuName, score: cpu.score, matched: cpu.matched },
    gpu: { name: gpuName, score: gpu.score, matched: gpu.matched },
    byResolution,
  };
}

module.exports = { computeBottleneck };
