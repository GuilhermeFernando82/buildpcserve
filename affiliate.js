// Monetização por afiliado: acrescenta o seu código de parceiro nos links de
// produto antes de eles chegarem no usuário.
//
// Nada de código de afiliado fica escrito aqui — cada loja é configurada por
// variável de ambiente. Assim o repositório (que é público) não carrega os
// seus códigos, e dá pra ligar, trocar ou desligar cada loja sem mexer no
// código. Sem a variável, o link sai exatamente como veio da loja — que é o
// estado atual, enquanto nenhum programa está aprovado.
//
// Formatos aceitos, um por loja:
//
//   param:<nome>:<valor>
//     Acrescenta um parâmetro na própria URL do produto. É o formato dos
//     programas próprios das lojas e o da Amazon.
//     Ex.: AFFILIATE_KABUM="param:ref:guilherme123"
//          AFFILIATE_AMAZON="param:tag:meusite-20"
//
//   awin:<awinmid>:<awinaffid>
//     Deep link da Awin, rede que intermedia várias lojas brasileiras. O
//     awinmid é o id do anunciante (a loja) e o awinaffid é o seu id de
//     afiliado; os dois aparecem no painel da Awin.
//     Ex.: AFFILIATE_TERABYTE="awin:12345:987654"
//
//   template:<url>
//     Saída pra qualquer outra rede: cole o modelo de deep link que o painel
//     dela fornecer, com {encoded} no lugar onde entra a URL do produto (ou
//     {url}, se aquela rede não exigir encode).
//     Ex.: AFFILIATE_PATOLOCO="template:https://redir.rede.com/?u={encoded}&id=42"

const ENV_BY_STORE = {
  kabum: "AFFILIATE_KABUM",
  terabyte: "AFFILIATE_TERABYTE",
  patoloco: "AFFILIATE_PATOLOCO",
};

function parseSpec(spec) {
  const raw = String(spec || "").trim();
  const sep = raw.indexOf(":");
  if (sep === -1) return null;

  const mode = raw.slice(0, sep).toLowerCase();
  const rest = raw.slice(sep + 1);

  if (mode === "param") {
    // Só o primeiro ":" separa nome de valor — o valor pode conter ":".
    const nameEnd = rest.indexOf(":");
    if (nameEnd === -1) return null;
    const name = rest.slice(0, nameEnd).trim();
    const value = rest.slice(nameEnd + 1).trim();
    if (!name || !value) return null;
    return { mode, name, value };
  }

  if (mode === "awin") {
    const [mid, affid] = rest.split(":").map((s) => s.trim());
    if (!mid || !affid) return null;
    return { mode, mid, affid };
  }

  if (mode === "template") {
    const template = rest.trim();
    if (!template.includes("{encoded}") && !template.includes("{url}")) return null;
    return { mode, template };
  }

  return null;
}

// Lido uma vez na subida do processo. Um erro de digitação aqui viraria link
// sem comissão silenciosamente, então avisa alto no log em vez de ignorar.
const CONFIG = {};
for (const [storeId, envName] of Object.entries(ENV_BY_STORE)) {
  const spec = process.env[envName];
  if (!spec) continue;

  const parsed = parseSpec(spec);
  if (parsed) {
    CONFIG[storeId] = parsed;
    console.log(`Afiliado ativo para ${storeId} (modo "${parsed.mode}").`);
  } else {
    console.warn(`${envName} ignorada: formato inválido. Ver server/affiliate.js.`);
  }
}

// Devolve a URL já com o código de afiliado, ou a URL original se aquela loja
// não estiver configurada. Nunca lança: link cru é melhor que link quebrado.
function withAffiliate(url, storeId) {
  const cfg = CONFIG[storeId];
  if (!cfg || !url) return url;

  try {
    if (cfg.mode === "param") {
      const parsed = new URL(url);
      parsed.searchParams.set(cfg.name, cfg.value);
      return parsed.toString();
    }

    if (cfg.mode === "awin") {
      const params = new URLSearchParams({
        awinmid: cfg.mid,
        awinaffid: cfg.affid,
        ued: url,
      });
      return `https://www.awin1.com/cread.php?${params}`;
    }

    if (cfg.mode === "template") {
      return cfg.template
        .replaceAll("{encoded}", encodeURIComponent(url))
        .replaceAll("{url}", url);
    }
  } catch (err) {
    console.warn(`Não foi possível montar link de afiliado (${storeId}):`, err.message);
  }

  return url;
}

// Usado pela UI pra só exibir o aviso de afiliado quando ele for verdade.
function isAffiliateActive() {
  return Object.keys(CONFIG).length > 0;
}

module.exports = { withAffiliate, isAffiliateActive };
