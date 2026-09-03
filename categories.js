// Categorias de componentes de PC, mapeadas para termos de busca da Kabum.
// `pct` é a fatia inicial do orçamento reservada para cada categoria (soma
// de cada perfil = 1).
//
// Dois perfis de distribuição de orçamento:
// - "gpu": prioriza a placa de vídeo (o que mais pesa em desempenho de
//   jogos), com CPU/placa-mãe mais enxutos porém ainda compatíveis. Perfil
//   padrão.
// - "balanced": reparte de forma mais tradicional entre GPU e CPU, pra quem
//   quer um processador mais robusto também (produtividade, streaming,
//   jogos que dependem mais de CPU etc.).
const PROFILES = {
  gpu: [
    { key: "gpu", label: "Placa de Vídeo", term: "placa-de-video", pct: 0.48 },
    { key: "cpu", label: "Processador", term: "processador", pct: 0.13 },
    { key: "motherboard", label: "Placa-Mãe", term: "placa-mae", pct: 0.06 },
    { key: "ram", label: "Memória RAM", term: "memoria-ram", pct: 0.09 },
    { key: "storage", label: "SSD", term: "ssd", pct: 0.07 },
    { key: "psu", label: "Fonte", term: "fonte", pct: 0.06 },
    { key: "case", label: "Gabinete", term: "gabinete", pct: 0.06 },
    { key: "cooler", label: "Water Cooler", term: "water-cooler", pct: 0.05 },
  ],
  balanced: [
    { key: "gpu", label: "Placa de Vídeo", term: "placa-de-video", pct: 0.35 },
    { key: "cpu", label: "Processador", term: "processador", pct: 0.2 },
    { key: "motherboard", label: "Placa-Mãe", term: "placa-mae", pct: 0.1 },
    { key: "ram", label: "Memória RAM", term: "memoria-ram", pct: 0.09 },
    { key: "storage", label: "SSD", term: "ssd", pct: 0.08 },
    { key: "psu", label: "Fonte", term: "fonte", pct: 0.07 },
    { key: "case", label: "Gabinete", term: "gabinete", pct: 0.06 },
    { key: "cooler", label: "Water Cooler", term: "water-cooler", pct: 0.05 },
  ],
};

function getCategories(profile) {
  return PROFILES[profile] || PROFILES.gpu;
}

module.exports = { getCategories, PROFILES };
