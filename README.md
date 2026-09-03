![Montador de PC](./banner.svg)

# buildpcserve

Backend (Node/Express) do Montador de PC. Busca preços em tempo real na
Kabum e na Terabyte e expõe duas rotas:

- `GET /api/build?budget=<valor>` — monta automaticamente a melhor
  configuração de PC dentro do orçamento informado.
- `GET /api/search?q=<termo>` — busca livre num termo, usada pelo modo
  "peça por peça" do frontend ([buildpcclient](https://github.com/GuilhermeFernando82/buildpcclient)).

## Como funciona

- **Kabum** (`kabum.js`): busca via HTTP simples e extrai os dados do JSON
  `__NEXT_DATA__` embutido no HTML — sem navegador, rápido.
- **Terabyte** (`stores/terabyte.js`): a loja usa um desafio JS da
  Cloudflare que bloqueia requisições HTTP simples, então essa busca roda
  num Chromium headless (Playwright, `browser.js`) e extrai os dados direto
  dos atributos `data-tss-*` de cada card de produto.
- `stores/index.js` busca as duas lojas em paralelo e junta tudo num único
  pool de produtos por categoria.
- `builder.js` distribui o orçamento entre 8 categorias (GPU, CPU,
  placa-mãe, RAM, SSD, fonte, gabinete, water cooler), escolhendo o melhor
  preço disponível em qualquer uma das lojas. Aplica heurísticas de
  compatibilidade (socket CPU↔placa-mãe, DDR da RAM↔placa-mãe, wattagem da
  fonte↔GPU) e recalcula essas dependências em cascata sempre que CPU ou GPU
  trocam de item durante o ajuste de orçamento.

## Rodando localmente

```bash
npm install
npx playwright install chromium   # baixa o Chromium do scraper da Terabyte (uma vez só)
npm start
```

Sobe em `http://localhost:3001`. Veja o
[buildpcclient](https://github.com/GuilhermeFernando82/buildpcclient) para
rodar o frontend apontando pra cá.

## Deploy (Railway ou Render)

1. Crie um serviço a partir deste repositório. O `Dockerfile` incluído usa a
   imagem oficial do Playwright (já traz o Chromium e as bibliotecas de
   sistema necessárias) e é detectado automaticamente — não precisa
   configurar build/start command na mão.
2. Nenhuma variável é obrigatória para funcionar; a porta vem de `PORT`,
   injetada pela plataforma.
3. Depois que o frontend estiver publicado (Vercel), defina a variável de
   ambiente `CORS_ORIGIN` com a URL dele (ex.:
   `https://seu-projeto.vercel.app`; aceita várias URLs separadas por
   vírgula) e faça redeploy.

A tag da imagem no `Dockerfile` (`v1.62.1-noble`) precisa bater com a versão
do pacote `playwright` no `package.json`. Se atualizar um, atualize o outro.

## Sobre Pichau e Shopee (não incluídas)

- **Pichau**: também usa Cloudflare, mas com detecção de bot mais agressiva
  — mesmo o Chromium headless com patches de stealth
  (`navigator.webdriver`, plugins, etc.) é identificado como automação e
  recebe uma página de bloqueio disfarçada de "Site em Manutenção". O
  scraper está escrito em `stores/pichau.js` e funciona se a proteção mudar,
  mas hoje não passa. Não fui além disso (fingerprint de canvas/WebGL,
  proxies residenciais etc.) porque o site está deliberadamente sinalizando
  que não quer esse tipo de acesso automatizado.
- **Shopee**: a busca exige sessão logada e os Termos de Uso proíbem
  scraping explicitamente; além disso, por ser marketplace de vendedores
  variados, a nomenclatura dos anúncios é inconsistente demais para a lógica
  de compatibilidade deste projeto. Não tentei contornar o login.

## Limitações conhecidas

- **Duas fontes**: Kabum e Terabyte. Pode haver preço melhor em outras lojas
  não cobertas.
- **Scraping, não API oficial**: ambos os sites podem mudar a estrutura da
  página a qualquer momento e quebrar o parser. Não há SLA.
- **Compatibilidade por heurística**: como as listagens não trazem specs
  estruturadas, socket/DDR/wattagem são inferidos por palavras-chave no nome
  do produto.
- **Cache de 10 minutos** por categoria/termo/loja, em memória do processo
  (não persiste entre deploys nem é compartilhado entre instâncias).
- **Mais lento que só-Kabum**: a busca na Terabyte roda um navegador
  headless por categoria (até 4 em paralelo), então uma consulta "fria"
  (fora do cache) leva bem mais que uma busca só na Kabum.
