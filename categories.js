// Categorias de componentes de PC, mapeadas para termos de busca da Kabum.
// `pct` é a fatia inicial do orçamento reservada para cada categoria (soma = 1).
// GPU puxa a maior fatia de propósito — pra jogos, ela pesa mais no
// desempenho final do que gastar mais em CPU/placa-mãe, então CPU e
// placa-mãe ficam com fatias mais enxutas (mas ainda o bastante pra bater
// com a GPU escolhida).
module.exports = [
  { key: "gpu", label: "Placa de Vídeo", term: "placa-de-video", pct: 0.48 },
  { key: "cpu", label: "Processador", term: "processador", pct: 0.13 },
  { key: "motherboard", label: "Placa-Mãe", term: "placa-mae", pct: 0.06 },
  { key: "ram", label: "Memória RAM", term: "memoria-ram", pct: 0.09 },
  { key: "storage", label: "SSD", term: "ssd", pct: 0.07 },
  { key: "psu", label: "Fonte", term: "fonte", pct: 0.06 },
  { key: "case", label: "Gabinete", term: "gabinete", pct: 0.06 },
  { key: "cooler", label: "Water Cooler", term: "water-cooler", pct: 0.05 },
];
