# Imagem oficial do Playwright: já vem com o Chromium e todas as bibliotecas
# de sistema que ele precisa para rodar headless em Linux. Evita o problema
# de "npx playwright install --with-deps" exigir apt-get/root em builds sem
# privilégio (comum em Railway/Render).
#
# A tag da imagem PRECISA bater com a versão do pacote "playwright" no
# package.json (hoje fixada em 1.62.1, sem "^", por causa disso). Se atualizar
# o pacote, atualize a tag da imagem junto.
FROM mcr.microsoft.com/playwright:v1.62.1-noble

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "index.js"]
