// Estimativa de gargalo (bottleneck) entre processador e placa de vídeo em
// 1080p, 1440p e 4K.
//
// As tabelas abaixo guardam FPS MÉDIO REAL, curado a partir de médias de
// reviews públicas (numa suíte de jogos AAA, preset alto/ultra, nativo, sem
// upscaling) — mesma ideia da tabela de TDP em builder.js: valor de referência
// por modelo, não um número buscado ao vivo. Não existe API pública e gratuita
// de benchmark por jogo.
//
// Guardar FPS em vez de um índice relativo 0-100 é o que torna a comparação
// possível: gargalo é a razão entre dois tetos de FPS, então os dois lados
// precisam estar na MESMA escala e na mesma ordem de grandeza da realidade.
// Com índices normalizados por conta própria (CPU e GPU cada uma com o seu
// "100"), a razão entre elas não significa nada — era o que fazia um
// i5-14400F aparecer com teto de 301 FPS e nenhum gargalo com uma RTX 5070 Ti.
//
// Modelagem por resolução, seguindo o comportamento medido em reviews:
//
//   - O teto da CPU é ~constante entre resoluções: o trabalho dela (lógica do
//     jogo, física, draw calls) não depende da quantidade de pixels. Por isso
//     é um número só.
//   - O teto da GPU cai conforme a resolução sobe, aí sim proporcional aos
//     pixels — e a queda não é igual para todas: placas de topo seguram melhor
//     4K que placas de entrada (banda e VRAM). Por isso cada placa tem os três
//     valores medidos, em vez de um fator único aplicado a todas.
//
// Daí sai o efeito conhecido: o gargalo de processador é maior em 1080p (onde
// a placa entregaria muito mais FPS do que a CPU consegue alimentar) e vai
// sumindo conforme a resolução sobe, porque em 4K a própria placa passa a ser
// o limite — e aí não há potencial desperdiçado.
//
// O resultado é uma estimativa de tendência, não um FPS garantido: o gargalo
// real varia bastante com jogo, engine e preset.

// FPS médio por resolução [1080p, 1440p, 4K]. Mais específico antes do mais
// genérico — a lista é testada em ordem e o primeiro padrão que bater vence
// (senão "RTX 5070" casaria antes de "RTX 5070 Ti").
const GPU_FPS_TABLE = [
  // NVIDIA RTX 50 (Blackwell)
  [/RTX\s?5090/i, [260, 215, 145]],
  [/RTX\s?5080/i, [215, 172, 112]],
  [/RTX\s?5070\s?TI/i, [190, 150, 95]],
  [/RTX\s?5070/i, [158, 120, 72]],
  [/RTX\s?5060\s?TI/i, [125, 92, 52]],
  [/RTX\s?5060/i, [105, 75, 42]],
  [/RTX\s?5050/i, [82, 58, 31]],
  // NVIDIA RTX 40 (Ada)
  [/RTX\s?4090/i, [245, 205, 138]],
  [/RTX\s?4080\s?SUPER/i, [205, 165, 108]],
  [/RTX\s?4080/i, [198, 158, 103]],
  [/RTX\s?4070\s?TI\s?SUPER/i, [178, 142, 90]],
  [/RTX\s?4070\s?TI/i, [168, 132, 82]],
  [/RTX\s?4070\s?SUPER/i, [158, 122, 74]],
  [/RTX\s?4070/i, [140, 105, 62]],
  [/RTX\s?4060\s?TI/i, [115, 84, 48]],
  [/RTX\s?4060/i, [98, 70, 38]],
  // NVIDIA RTX 30 (Ampere)
  [/RTX\s?3090\s?TI/i, [165, 132, 85]],
  [/RTX\s?3090/i, [155, 124, 80]],
  [/RTX\s?3080\s?TI/i, [158, 126, 81]],
  [/RTX\s?3080/i, [148, 118, 74]],
  [/RTX\s?3070\s?TI/i, [128, 98, 58]],
  [/RTX\s?3070/i, [120, 92, 54]],
  [/RTX\s?3060\s?TI/i, [108, 82, 47]],
  [/RTX\s?3060/i, [85, 62, 34]],
  [/RTX\s?3050/i, [58, 41, 22]],
  // NVIDIA GTX 16 / 10
  [/GTX\s?1660\s?TI/i, [62, 44, 23]],
  [/GTX\s?1660/i, [58, 41, 21]],
  [/GTX\s?1650/i, [42, 29, 15]],
  [/GTX\s?1630/i, [28, 19, 10]],
  [/GTX\s?1080\s?TI/i, [85, 65, 38]],
  [/GTX\s?1080/i, [70, 52, 29]],
  [/GTX\s?1070/i, [60, 44, 24]],
  [/GTX\s?1060/i, [45, 32, 17]],
  [/GTX\s?1050/i, [30, 21, 11]],
  [/GT\s?1030/i, [16, 11, 5]],
  [/GT\s?7[13]0/i, [9, 6, 3]],
  // AMD RX 9000 (RDNA4)
  [/RX\s?9070\s?XT/i, [185, 148, 94]],
  [/RX\s?9070/i, [165, 130, 80]],
  [/RX\s?9060\s?XT/i, [118, 87, 49]],
  [/RX\s?9060/i, [100, 72, 40]],
  // AMD RX 7000 (RDNA3)
  [/RX\s?7900\s?XTX/i, [205, 168, 110]],
  [/RX\s?7900\s?XT/i, [182, 148, 95]],
  [/RX\s?7900\s?GRE/i, [158, 125, 78]],
  [/RX\s?7800\s?XT/i, [148, 116, 71]],
  [/RX\s?7700\s?XT/i, [130, 100, 60]],
  [/RX\s?7600\s?XT/i, [98, 71, 39]],
  [/RX\s?7600/i, [95, 68, 37]],
  // AMD RX 6000 (RDNA2)
  [/RX\s?6950/i, [165, 132, 82]],
  [/RX\s?6900/i, [155, 124, 77]],
  [/RX\s?6800\s?XT/i, [148, 118, 73]],
  [/RX\s?6800/i, [132, 104, 64]],
  [/RX\s?6750/i, [118, 90, 53]],
  [/RX\s?6700/i, [112, 85, 50]],
  [/RX\s?6650/i, [95, 68, 38]],
  [/RX\s?6600\s?XT/i, [90, 65, 36]],
  [/RX\s?6600/i, [78, 55, 30]],
  [/RX\s?6500/i, [45, 31, 16]],
  [/RX\s?6400/i, [38, 26, 13]],
  // AMD RX 5000 (RDNA), Vega e Polaris
  [/RX\s?5700\s?XT/i, [95, 70, 39]],
  [/RX\s?5700/i, [88, 64, 35]],
  [/RX\s?5600/i, [78, 56, 30]],
  [/RX\s?5500/i, [55, 39, 20]],
  [/VEGA\s?64/i, [75, 55, 30]],
  [/VEGA\s?56/i, [68, 50, 27]],
  [/RX\s?590/i, [55, 39, 20]],
  [/RX\s?580/i, [50, 35, 18]],
  [/RX\s?570/i, [44, 31, 16]],
  [/RX\s?560/i, [28, 19, 10]],
  [/RX\s?550/i, [20, 14, 7]],
  // Intel Arc
  [/ARC\s?B580/i, [105, 78, 44]],
  [/ARC\s?B570/i, [92, 67, 37]],
  [/ARC\s?A770/i, [92, 68, 38]],
  [/ARC\s?A750/i, [85, 62, 34]],
  [/ARC\s?A580/i, [72, 52, 28]],
  [/ARC\s?A380/i, [38, 26, 14]],
];

// FPS médio que o processador sustenta com a GPU fora da equação — que é
// exatamente o que as reviews de CPU medem (jogo em 1080p com uma placa de
// topo, justamente pra isolar a CPU). Valor único: não muda com a resolução.
//
// Pesa IPC, clock por núcleo e cache, não contagem de threads: um Ryzen 9 de
// 16 núcleos não rende proporcionalmente mais FPS que um Ryzen 7 da mesma
// geração. Os X3D lideram porque o cache 3D é o que mais move o ponteiro
// em jogos.
const CPU_FPS_TABLE = [
  // AMD X3D (cache 3D — melhores em jogos)
  [/9950\s?X3D/i, 200],
  [/9900\s?X3D/i, 195],
  [/9800\s?X3D/i, 200],
  [/7950\s?X3D/i, 185],
  [/7900\s?X3D/i, 180],
  [/7800\s?X3D/i, 185],
  [/5800\s?X3D/i, 145],
  [/5700\s?X3D/i, 138],
  // AMD Ryzen 9000 (Zen 5)
  [/9950X/i, 175],
  [/9900X/i, 172],
  [/9700X/i, 170],
  [/9600X/i, 165],
  // AMD Ryzen 7000 (Zen 4)
  [/7950X/i, 168],
  [/7900X/i, 165],
  [/7800X/i, 163],
  [/7700X/i, 162],
  [/7700\b/i, 158],
  [/7600X/i, 158],
  [/7600\b/i, 152],
  [/7500F/i, 150],
  // AMD Ryzen 5000 (Zen 3)
  [/5950X/i, 135],
  [/5900X/i, 133],
  [/5800X/i, 130],
  [/5700X/i, 125],
  [/5700G/i, 108],
  [/5600X/i, 122],
  [/5600G/i, 105],
  [/5600\b/i, 120],
  [/5500/i, 100],
  // AMD Ryzen 3000 (Zen 2) e anteriores
  [/3900X/i, 105],
  [/3700X/i, 102],
  [/3600X/i, 98],
  [/3600/i, 95],
  [/3500X/i, 88],
  [/3300X/i, 85],
  [/3200G/i, 62],
  [/2600/i, 72],
  [/1600/i, 60],
  // Intel Core Ultra (Arrow Lake, LGA1851)
  [/ULTRA\s?9\s?285/i, 178],
  [/ULTRA\s?7\s?265/i, 172],
  [/ULTRA\s?5\s?245/i, 162],
  [/ULTRA\s?5\s?225/i, 150],
  // Intel 14ª geração
  [/149\d\dK/i, 185],
  [/147\d\dK/i, 178],
  [/146\d\dK/i, 168],
  [/145\d\d/i, 152],
  [/144\d\d/i, 143],
  [/141\d\d/i, 120],
  // Intel 13ª geração
  [/139\d\dK/i, 182],
  [/137\d\dK/i, 175],
  [/136\d\dK/i, 166],
  [/135\d\d/i, 150],
  [/134\d\d/i, 140],
  [/131\d\d/i, 118],
  // Intel 12ª geração
  [/129\d\dK/i, 165],
  [/127\d\dK/i, 158],
  [/126\d\dK/i, 152],
  [/124\d\d/i, 132],
  [/121\d\d/i, 110],
  // Intel 11ª / 10ª geração
  [/119\d\d/i, 135],
  [/117\d\d/i, 130],
  [/116\d\d/i, 122],
  [/114\d\d/i, 115],
  [/109\d\d/i, 130],
  [/107\d\d/i, 125],
  [/106\d\d/i, 115],
  [/104\d\d/i, 105],
  [/101\d\d/i, 85],
  // Intel 9ª geração e anteriores
  [/99\d\d/i, 115],
  [/97\d\d/i, 115],
  [/96\d\d/i, 100],
  [/94\d\d/i, 95],
  [/87\d\d/i, 110],
  [/86\d\d/i, 100],
  [/84\d\d/i, 92],
  [/77\d\d/i, 95],
  [/76\d\d/i, 85],
  [/74\d\d/i, 72],
];

// Faixa média — usada quando o modelo não é reconhecido, pra ainda dar uma
// resposta útil em vez de erro. A UI avisa que foi estimativa.
const DEFAULT_CPU_FPS = 110;
const DEFAULT_GPU_FPS = [90, 65, 36];

function matchValue(table, name) {
  const n = String(name).toUpperCase();
  for (const [pattern, value] of table) {
    if (pattern.test(n)) return value;
  }
  return null;
}

const RESOLUTIONS = [
  { key: "1080p", label: "1080p (Full HD)" },
  { key: "1440p", label: "1440p (Quad HD)" },
  { key: "4k", label: "4K (Ultra HD)" },
];

// Gargalo aqui é sempre o do PROCESSADOR — é o único que representa
// desperdício. Quando a placa de vídeo é a peça mais lenta, ela está sendo
// 100% usada, que é justamente o cenário ideal em jogos: não há potencial
// jogado fora, o FPS é simplesmente o que aquela placa entrega. Chamar isso
// de "gargalo da GPU" faria um PC bem montado parecer pior em 4K, quando na
// prática é o contrário: quanto maior a resolução, menos a CPU atrapalha.
const CPU_BOTTLENECK_HIGH = 20; // desperdício relevante
const CPU_BOTTLENECK_MILD = 10; // perceptível, mas pequeno

function computeBottleneck(cpuName, gpuName) {
  const cpuMatch = matchValue(CPU_FPS_TABLE, cpuName);
  const gpuMatch = matchValue(GPU_FPS_TABLE, gpuName);

  const cpuCeiling = cpuMatch ?? DEFAULT_CPU_FPS;
  const gpuCeilings = gpuMatch ?? DEFAULT_GPU_FPS;

  const byResolution = RESOLUTIONS.map(({ key, label }, i) => {
    const gpuCeiling = gpuCeilings[i];

    // Quanto do potencial da placa de vídeo se perde porque o processador não
    // acompanha. Zero quando a placa é a peça mais lenta.
    const cpuBottleneck =
      gpuCeiling > cpuCeiling
        ? Math.round(((gpuCeiling - cpuCeiling) / gpuCeiling) * 100)
        : 0;

    // Folga do processador: quanto de FPS a mais ele ainda aguentaria se a
    // placa fosse mais forte — dá pra saber se compensa trocar só a GPU.
    const cpuHeadroom =
      cpuCeiling > gpuCeiling
        ? Math.round(((cpuCeiling - gpuCeiling) / gpuCeiling) * 100)
        : 0;

    return {
      key,
      label,
      // A peça mais lenta é quem dita o FPS — a outra fica esperando.
      estimatedFps: Math.min(cpuCeiling, gpuCeiling),
      cpuCeiling,
      gpuCeiling,
      cpuBottleneck,
      cpuHeadroom,
      verdict:
        cpuBottleneck >= CPU_BOTTLENECK_HIGH
          ? "cpu-high"
          : cpuBottleneck >= CPU_BOTTLENECK_MILD
            ? "cpu-mild"
            : cpuBottleneck > 0
              ? "balanced"
              : "gpu-bound",
    };
  });

  return {
    cpu: { name: cpuName, fpsCeiling: cpuCeiling, matched: cpuMatch !== null },
    gpu: { name: gpuName, fpsCeilings: gpuCeilings, matched: gpuMatch !== null },
    byResolution,
  };
}

module.exports = { computeBottleneck };
