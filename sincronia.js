// Sincronização do estudo entre aparelhos (PC, celular, tablet…).
// Cada informação é um item "chave › id" (ex.: leiMatUser › e-lei-11107-2005 = "Administrativo").
// O aparelho envia só o que ELE mudou desde a última sincronização (inclusive o que apagou); o servidor aplica
// essas mudanças sobre a versão da nuvem e devolve a versão completa, que passa a valer aqui.
// Assim uma mudança feita no PC não é desfeita por um celular com dados antigos.

const SYNC_MAPAS = ["leiMatUser", "leiEmenta", "leiMarc", "prog", "prov-resultados"];   // objetos { id: valor }
const SYNC_LISTAS = { leisExtras: l => l.id, leisRemovidas: id => id };                 // listas (cada item vira um id)
const SYNC_TODAS = [...SYNC_MAPAS, ...Object.keys(SYNC_LISTAS), "hist"];
let sincro = { rodando: false, deNovo: false, ultima: 0, versao: null };

// ---------- formato comum (tudo vira { id: valor }) ----------
function hashSync(t) { let h = 0; for (const c of String(t)) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); }
function estadoLocal() {
  const e = {};
  SYNC_MAPAS.forEach(k => e[k] = { ...(lerEst(k, {}) || {}) });
  Object.entries(SYNC_LISTAS).forEach(([k, idDe]) => { e[k] = {}; (lerEst(k, []) || []).forEach(x => { const id = idDe(x); if (id) e[k][id] = x; }); });
  // estatística dos informativos: lista de respostas; cada uma ganha um id estável
  e.hist = {}; const vistos = {};
  (lerEst("hist", []) || []).forEach(x => { let id = x.t ? "t" + x.t : "o" + hashSync(JSON.stringify(x)); vistos[id] = (vistos[id] || 0) + 1; if (vistos[id] > 1) id += "_" + vistos[id]; e.hist[id] = x; });
  return e;
}
function gravarEstado(e) {
  SYNC_MAPAS.forEach(k => gravarEst(k, e[k] || {}));
  gravarEst("leisExtras", Object.values(e.leisExtras || {}));
  gravarEst("leisRemovidas", Object.keys(e.leisRemovidas || {}));
  gravarEst("hist", Object.values(e.hist || {}).sort((a, b) => String(a.d).localeCompare(String(b.d)) || (a.t || 0) - (b.t || 0)).slice(-3000));
  if (typeof leiMatUser !== "undefined") leiMatUser = null;   // cache da matéria escolhida
}
// mudanças entre dois estados: [chave, id, valor] (valor null = apagado)
function diferencas(de, para) {
  const ops = [];
  SYNC_TODAS.forEach(k => {
    const a = (de && de[k]) || {}, b = (para && para[k]) || {};
    new Set([...Object.keys(a), ...Object.keys(b)]).forEach(id => {
      if (!(id in b)) ops.push([k, id, null]);
      else if (!(id in a) || JSON.stringify(a[id]) !== JSON.stringify(b[id])) ops.push([k, id, b[id]]);
    });
  });
  return ops;
}
function aplicar(estado, ops) {
  const e = JSON.parse(JSON.stringify(estado || {}));
  ops.forEach(([k, id, v]) => { e[k] = e[k] || {}; if (v === null) delete e[k][id]; else e[k][id] = v; });
  return e;
}

// ---------- sincronizar ----------
async function sincronizarEstudo(forcar) {
  if (typeof usuarioAtual === "undefined" || !usuarioAtual || !usuarioAtual.sessao) return;
  if (sincro.rodando) { sincro.deNovo = true; return sincro.promessa; }
  sincro.rodando = true;
  sincro.promessa = (async () => {
    try {
      const base = lerEst("syncBase", null), enviado = estadoLocal();
      // primeira vez neste aparelho: só acrescenta o que a nuvem ainda não tem (não sobrescreve o que veio de outro aparelho)
      const primeira = !base, ops = primeira ? diferencas({}, enviado) : diferencas(base, enviado);
      if (!ops.length && !forcar && sincro.versao && Date.now() - sincro.ultima < 55000) return;
      const r = await postLongo({ acao: "estudoSync", ops, soNovos: primeira, versao: ops.length ? null : sincro.versao }, 120000);
      if (!r.ok) throw new Error(/desconhecida/i.test(r.erro || "") ? "atualize o Apps Script" : r.erro);
      sincro.ultima = Date.now();
      if (!r.mesmo) {
        // o que mudou aqui enquanto o pedido ia e voltava continua valendo
        const durante = diferencas(enviado, estadoLocal());
        const final = aplicar(r.estado, durante);
        const antes = JSON.stringify(estadoLocal());
        gravarEstado(final); gravarEst("syncBase", r.estado); sincro.versao = r.versao;
        if (durante.length) sincro.deNovo = true;
        if (JSON.stringify(estadoLocal()) !== antes) redesenharAposSync();
      }
      if (typeof sincronizarTextosLeis === "function") sincronizarTextosLeis(r.textos);
    } catch (e) { console.warn("sincronizar estudo", e); sincro.falhaEm = Date.now(); }
    finally {
      sincro.rodando = false;
      if (sincro.deNovo) { sincro.deNovo = false; setTimeout(() => sincronizarEstudo(), 500); }
    }
  })();
  return sincro.promessa;
}
function redesenharAposSync() {
  const d = $("dlgEstudo");
  if (d && d.open && typeof estudoAba === "string" && estudoAba && !(typeof estudo !== "undefined" && estudo)) desenharEstudo(estudoAba);
  if (typeof renderEstudoPagina === "function") renderEstudoPagina();
}
// mudanças daqui sobem em poucos segundos; mudanças de outros aparelhos chegam a cada minuto e sempre que o app volta para a tela
setInterval(() => {
  if (typeof usuarioAtual === "undefined" || !usuarioAtual || !usuarioAtual.sessao || document.visibilityState === "hidden") return;
  if (sincro.falhaEm && Date.now() - sincro.falhaEm < 30000) return;   // sem conexão: tenta de novo daqui a pouco
  const base = lerEst("syncBase", null);
  if (!base || diferencas(base, estadoLocal()).length || Date.now() - sincro.ultima > 60000) sincronizarEstudo();
}, 4000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sincronizarEstudo(true); });
