// Categorias de componentes de PC, mapeadas para termos de busca da Kabum.
// `pct` é a fatia inicial do orçamento reservada para cada categoria (soma = 1).
module.exports = [
  { key: "gpu", label: "Placa de Vídeo", term: "placa-de-video", pct: 0.35 },
  { key: "cpu", label: "Processador", term: "processador", pct: 0.2 },
  { key: "motherboard", label: "Placa-Mãe", term: "placa-mae", pct: 0.1 },
  { key: "ram", label: "Memória RAM", term: "memoria-ram", pct: 0.08 },
  { key: "storage", label: "SSD", term: "ssd", pct: 0.08 },
  { key: "psu", label: "Fonte", term: "fonte", pct: 0.07 },
  { key: "case", label: "Gabinete", term: "gabinete", pct: 0.07 },
  { key: "cooler", label: "Water Cooler", term: "water-cooler", pct: 0.05 },
];
