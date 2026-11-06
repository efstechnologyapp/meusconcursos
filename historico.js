// Histórico das respostas (subjetivas, peças e simulados objetivos), guardado na nuvem do usuário (Apps Script)
// para aparecer em todos os aparelhos. Cada tentativa é um registro próprio, com a data; refazer não apaga nada.

let hist = { lista: null, carregando: false, aberto: false, filtro: "tudo", periodo: 90, det: null, fotos: {}, analise: null, analisando: false, excluir: "",
  info: { filtro: "tudo", periodo: 90, det: null, analise: null, analisando: false } };   // "info": sessões dos informativos de jurisprudência

const histNum = v => (Math.round(v * 10) / 10).toFixed(1).replace(".", ",");
const histData = d => { const x = new Date(d); return isNaN(x) ? "" : x.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }); };
const histDataLonga = d => { const x = new Date(d); return isNaN(x) ? "" : x.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }); };
const histCor = n => n >= 6.5 ? "n-ok" : n >= 5 ? "n-m" : "n-b";
function histHash(t) { let h = 0; for (const c of String(t || "")) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); }

// ---------- nuvem ----------
async function carregarHistorico(forcar) {
  if (!usuarioAtual || !usuarioAtual.sessao || hist.carregando || (hist.lista && !forcar)) return;
  if (!hist.lista) hist.lista = lerProv("historico", null);
  hist.carregando = true;
  try {
    // registros que não chegaram ao servidor (sem conexão na hora) vão agora
    const fila = lerProv("histFila", []);
    for (const e of fila) { const r = await postScript({ acao: "historicoAdd", sessao: usuarioAtual.sessao, entrada: e }); if (!r.ok) throw new Error(r.erro); }
    if (fila.length) gravarProv("histFila", []);
    const r = await postScript({ acao: "historico", sessao: usuarioAtual.sessao });
    if (r.ok) {
      hist.lista = r.itens || []; gravarProv("historico", hist.lista);
      // junta a lista da nuvem com a deste aparelho, tirando as que foram removidas em qualquer aparelho
      // (a remoção vai para a nuvem como um "removida", para não ser trazida de volta por outro aparelho)
      const nuvem = r.impressas || [], remL = [...nuvem.filter(x => x.removida), ...lerProv("impressasRemovidas", [])];
      // removida só se a remoção for mais nova que a impressão (a mesma prova pode ser impressa de novo depois)
      const apagada = x => remL.some(t => t.chave === x.chave && String(t.quando || "") >= String(x.quando || ""));
      const ativas = nuvem.filter(x => !x.removida), local = lerProv("impressas", []);
      const junta = [...ativas, ...local.filter(x => !ativas.some(y => y.chave === x.chave))].filter(x => !apagada(x));
      gravarProv("impressasRemovidas", [...new Map([...nuvem.filter(x => x.removida), ...lerProv("impressasRemovidas", [])].map(x => [x.chave, x])).values()]);
      gravarProv("impressas", junta); gravarProv("impressasConhecidas", junta.map(x => x.chave));
      if (junta.length !== ativas.length || ativas.some(apagada)) salvarImpressasNuvem();
    }
  } catch (e) { /* sem conexão: fica com a cópia deste aparelho */ }
  hist.carregando = false;
  if ((["provas", "pecas"].includes(estudoAba) && (hist.aberto || !sim)) || estudoAba === "desempenho") desenharEstudo(estudoAba);
}
function salvarImpressasNuvem() {
  if (!usuarioAtual || !usuarioAtual.sessao) return;
  const atuais = lerProv("impressas", []), agora = new Date().toISOString();
  // o que sumiu desde a última vez foi removido aqui: vira "removida" na nuvem (guarda as 20 mais recentes)
  const sumiram = lerProv("impressasConhecidas", []).filter(c => !atuais.some(x => x.chave === c)).map(chave => ({ chave, removida: true, quando: agora }));
  const rem = [...new Map([...lerProv("impressasRemovidas", []), ...sumiram].filter(x => !atuais.some(y => y.chave === x.chave)).map(x => [x.chave, x])).values()]
    .sort((a, b) => String(b.quando).localeCompare(String(a.quando))).slice(0, 20);
  gravarProv("impressasRemovidas", rem); gravarProv("impressasConhecidas", atuais.map(x => x.chave));
  postScript({ acao: "impressasSalvar", sessao: usuarioAtual.sessao, impressas: [...atuais.slice(0, 30), ...rem] }).catch(() => {});
}
// ao voltar para o app (celular que ficou aberto em segundo plano), busca de novo o histórico e as provas impressas
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || typeof usuarioAtual === "undefined" || !usuarioAtual || !usuarioAtual.sessao) return;
  carregarHistorico(true).then(() => { if (typeof renderEstudoPagina === "function") renderEstudoPagina(); });
});
// cópia das folhas que fica no Drive: bem mais leve que a enviada para a IA corrigir (até 1600 px, tons de cinza,
// JPEG mais compactado — cerca de 150 a 300 KB por folha, com a letra ainda legível). PDF vira uma imagem por página.
const LADO_GUARDAR = 1600, QUALIDADE_GUARDAR = 0.6;
function canvasLeve(origem, w, h) {
  const k = Math.min(1, LADO_GUARDAR / Math.max(w, h)), c = document.createElement("canvas");
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.filter = "grayscale(1)"; ctx.drawImage(origem, 0, 0, c.width, c.height);
  return { mime_type: "image/jpeg", data: c.toDataURL("image/jpeg", QUALIDADE_GUARDAR).split(",")[1] };
}
async function fotosParaGuardar(fotos) {
  const saida = [];
  for (const f of fotos) {
    const d = f.inline_data || f;
    try {
      if (/pdf/.test(d.mime_type)) {
        const pdfjs = await carregarPdfJs(), bin = atob(d.data), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const pdf = await pdfjs.getDocument({ data: u8 }).promise;
        for (let i = 1; i <= Math.min(pdf.numPages, 12 - saida.length); i++) {
          const pg = await pdf.getPage(i), v0 = pg.getViewport({ scale: 1 }), v = pg.getViewport({ scale: LADO_GUARDAR / Math.max(v0.width, v0.height) });
          const c = document.createElement("canvas"); c.width = Math.round(v.width); c.height = Math.round(v.height);
          await pg.render({ canvasContext: c.getContext("2d"), viewport: v }).promise;
          saida.push(canvasLeve(c, c.width, c.height));
        }
      } else {
        const img = await new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = falha; i.src = "data:" + d.mime_type + ";base64," + d.data; });
        const leve = canvasLeve(img, img.width, img.height);
        saida.push(leve.data.length < d.data.length ? leve : d);
      }
    } catch (e) { saida.push(d); }   // se não der para reduzir, guarda como veio
    if (saida.length >= 12) break;
  }
  return saida.slice(0, 12);
}
async function registrarHist(e, fotos) {
  e.id = e.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6); e.data = e.data || new Date().toISOString();
  hist.lista = [...(hist.lista || lerProv("historico", []) || []).filter(x => x.id !== e.id), e]; gravarProv("historico", hist.lista);
  try {
    const guardar = fotos && fotos.length ? await fotosParaGuardar(fotos) : [];
    const r = await postScript({ acao: "historicoAdd", sessao: usuarioAtual.sessao, entrada: e, ...(guardar.length ? { fotos: guardar } : {}) });
    if (!r.ok) throw new Error(r.erro);
    const k = hist.lista.findIndex(x => x.id === e.id); if (k >= 0) hist.lista[k] = r.entrada; gravarProv("historico", hist.lista);
  } catch (err) { gravarProv("histFila", [...lerProv("histFila", []).filter(x => x.id !== e.id), e]); }
}
function registrarEscrita(q, c, modo, texto, fotos) {
  if (!sim || !q || !c) return;
  const { transcricao, ...corr } = c;
  registrarHist({
    tipo: sim.it.tipo, prova: sim.it.id, nome: sim.it.nome, numero: q.numero || sim.i + 1, i: sim.i, novas: !!sim.novas,
    chave: sim.novas ? "n:" + histHash(String(q.enunciado || "").slice(0, 300)) : sim.it.id + ":" + sim.i,
    disciplina: q.disciplina || q.tipo_peca || "", modo, nota: +c.nota || 0, caligrafia: c.caligrafia && c.caligrafia.nota != null ? +c.caligrafia.nota : null,
    correcao: corr, texto: texto || "",
    q: { numero: q.numero, enunciado: q.enunciado, espelho: q.espelho || [], resposta_esperada: q.resposta_esperada || "", linhas: q.linhas || 0, disciplina: q.disciplina || "", tipo_peca: q.tipo_peca || "", inedita: !!q.inedita }
  }, fotos);
}
function registrarObjetiva() {
  if (!sim || sim.it.tipo !== "objetiva" || sim.registrado) return;
  const qs = [];
  Object.entries(sim.resp).forEach(([k, r]) => {
    const q = sim.novas ? (sim.geradas[k] || {}).q : sim.qs[k]; if (!q || !r || r.marcada === undefined) return;
    const gab = String(q.gabarito || "").toUpperCase();
    qs.push({ n: sim.novas ? +k + 1 : q.numero || +k + 1, disc: q.disciplina || "Outras", marcada: r.marcada, gab, ok: !!r.ok, anulada: gab === "ANULADA", ...(!r.ok && gab !== "ANULADA" ? { enun: String(q.enunciado || "").slice(0, 400) } : {}) });
  });
  const val = qs.filter(x => !x.anulada); if (!val.length) return;
  sim.registrado = true;
  const ac = val.filter(x => x.ok).length;
  registrarHist({ tipo: "objetiva", prova: sim.it.id, nome: sim.it.nome, novas: !!sim.novas, chave: sim.it.id + (sim.novas ? ":n" : ""), acertos: ac, total: val.length, nota: ac / val.length * 10, questoes: qs.sort((a, b) => a.n - b.n) });
}

// ---------- tela ----------
function botaoHistorico(area) {
  const n = (hist.lista || lerProv("historico", []) || []).filter(e => e.tipo !== "info" && e.tipo !== "lei").length;
  return `<div class="actions" style="justify-content:flex-start;margin:0"><button type="button" id="histAbrir" data-histarea="${area}">Meu histórico${n ? ` (${n})` : ""}</button></div>`;
}
function histFiltrada() {
  const lim = hist.periodo ? Date.now() - hist.periodo * 864e5 : 0;
  return (hist.lista || []).filter(e => e.tipo !== "info" && e.tipo !== "lei" && (hist.filtro === "tudo" || e.tipo === hist.filtro) && new Date(e.data).getTime() >= lim).sort((a, b) => new Date(a.data) - new Date(b.data));
}
function histTentativas(e) { return (hist.lista || []).filter(x => x.chave === e.chave && x.tipo === e.tipo).sort((a, b) => new Date(a.data) - new Date(b.data)); }
function htmlHistorico() {
  if (hist.det) return htmlHistDetalhe();
  if (!hist.lista) { carregarHistorico(); return `<p class="note est-gerando">Carregando o seu histórico…</p>`; }
  const topo = `<div class="est-prog"><button type="button" class="mini" id="histFechar">‹ Voltar</button><b>Meu histórico</b>${hist.carregando ? `<span class="note">atualizando…</span>` : ""}</div>
    <div class="h-filtros">${[["tudo", "Tudo"], ["subjetiva", "Subjetivas"], ["peca", "Peças"], ["objetiva", "Objetivas"]].map(([k, n]) => `<button type="button" class="chip-sel${hist.filtro === k ? " on" : ""}" data-histfiltro="${k}">${n}</button>`).join("")}
      <select id="histPeriodo" class="h-per">${[[30, "Últimos 30 dias"], [90, "Últimos 90 dias"], [365, "Último ano"], [0, "Todo o período"]].map(([v, n]) => `<option value="${v}"${hist.periodo === v ? " selected" : ""}>${n}</option>`).join("")}</select></div>`;
  const L = histFiltrada();
  if (!L.length) return topo + `<p class="note">${(hist.lista || []).length ? "Nada neste filtro e período." : "Ainda não há respostas no histórico. A partir de agora, cada questão corrigida e cada simulado objetivo entram aqui, com a data."}</p>`;
  // resumo
  const notas = L.map(e => e.nota), media = notas.reduce((a, b) => a + b, 0) / notas.length;
  const ult = notas.slice(-5), ant = notas.slice(0, -5), mUlt = ult.reduce((a, b) => a + b, 0) / ult.length, mAnt = ant.length ? ant.reduce((a, b) => a + b, 0) / ant.length : null;
  const cal = L.filter(e => e.caligrafia != null).map(e => e.caligrafia), mCal = cal.length ? cal.reduce((a, b) => a + b, 0) / cal.length : null;
  const calT = cal.length >= 4 ? (cal.slice(-2).reduce((a, b) => a + b, 0) / 2) - (cal.slice(0, 2).reduce((a, b) => a + b, 0) / 2) : 0;
  const acima = notas.filter(n => n >= 6).length;
  const seta = d => d > 0.05 ? `<div class="h-up">▲ +${histNum(d)} sobre as anteriores</div>` : d < -0.05 ? `<div class="h-down">▼ ${histNum(d)} sobre as anteriores</div>` : `<div class="l">estável</div>`;
  let h = topo + `<div class="h-cards">
    <div class="h-card"><div class="l">Média geral</div><div class="v">${histNum(media)}</div><div class="l">${L.length} registro(s)</div></div>
    <div class="h-card"><div class="l">Últimos ${ult.length}</div><div class="v">${histNum(mUlt)}</div>${mAnt != null ? seta(mUlt - mAnt) : `<div class="l">poucos registros para comparar</div>`}</div>
    <div class="h-card"><div class="l">Caligrafia</div><div class="v">${mCal != null ? histNum(mCal) : "—"}</div><div class="${calT > 0.2 ? "h-up" : calT < -0.2 ? "h-down" : "l"}">${mCal == null ? "só nas respostas manuscritas" : calT > 0.2 ? "▲ melhorando" : calT < -0.2 ? "▼ piorando" : "estável"}</div></div>
    <div class="h-card"><div class="l">Nota 6 ou mais</div><div class="v">${acima} de ${L.length}</div><div class="l">${Math.round(acima / L.length * 100)}% dos registros</div></div></div>`;
  h += `<div class="h-sec"><h4>Evolução</h4><div class="h-leg"><span style="color:var(--brand)">Nota (objetivas: % de acertos ÷ 10)</span>${cal.length ? `<span class="tr" style="color:#9aa6c2">Caligrafia</span>` : ""}</div>${svgEvolucao(L)}</div>`;
  // por disciplina / tipo de peça
  const g = {};
  const soma = (k, v, w, rot) => { const x = g[k] = g[k] || { s: 0, w: 0, resp: 0, qs: 0 }; x.s += v * w; x.w += w; if (rot === "q") x.qs += w; else x.resp++; };
  L.forEach(e => { if (e.tipo === "objetiva") { const d = {}; e.questoes.filter(q => !q.anulada).forEach(q => { (d[q.disc] = d[q.disc] || [0, 0])[1]++; if (q.ok) d[q.disc][0]++; }); Object.entries(d).forEach(([k, [a, t]]) => soma(k, a / t * 10, t, "q")); } else soma(e.disciplina || (e.tipo === "peca" ? "Peça prática" : "Outras"), e.nota, 1, "r"); });
  const barras = Object.entries(g).map(([k, x]) => [k, x.s / x.w, x]).sort((a, b) => a[1] - b[1]);
  h += `<div class="h-sec"><h4>Por disciplina e tipo de peça <span class="note">(do mais fraco para o mais forte)</span></h4>${barras.map(([k, v, x]) => `<div class="h-bar"><span>${esc(k)}</span><span class="t"><i class="${histCor(v)}" style="width:${Math.max(3, v * 10)}%"></i></span><span><b>${histNum(v)}</b> <span class="note">(${[x.resp ? x.resp + (x.resp > 1 ? " respostas" : " resposta") : "", x.qs ? x.qs + " questões" : ""].filter(Boolean).join(" · ")})</span></span></div>`).join("")}</div>`;
  // erros que se repetem (itens do espelho não atendidos nas respostas escritas)
  const err = {};
  L.filter(e => e.tipo !== "objetiva").forEach(e => ((e.correcao || {}).itens || []).filter(t => t.atendido !== "sim").forEach(t => { const k = semAcentoEst(t.item).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 70); const x = err[k] = err[k] || { n: 0, txt: t.item, parc: 0 }; x.n++; x.txt = t.item; if (t.atendido === "parcial") x.parc++; }));
  const errs = Object.values(err).sort((a, b) => b.n - a.n).slice(0, 8);
  const objErr = L.filter(e => e.tipo === "objetiva").reduce((a, e) => a + e.questoes.filter(q => !q.ok && !q.anulada).length, 0);
  if (errs.length || objErr) {
    h += `<div class="h-sec"><h4>Erros que se repetem</h4>${errs.length ? `<ul class="h-err">${errs.map(x => `<li><b>${x.n}×</b> ${esc(x.txt)}${x.parc ? ` <span class="note">(${x.parc} parcial)</span>` : ""}</li>`).join("")}</ul>` : ""}
      ${objErr ? `<p class="note">${objErr} questão(ões) objetiva(s) errada(s) no período: veja quais em cada simulado da lista abaixo.</p>` : ""}
      ${hist.analise ? `<div class="est-det"><p class="est-sub">Análise da IA</p>${(hist.analise.padroes || []).map(p => `<p><b>${esc(p.titulo)}</b> — ${esc(p.explicacao)}${p.como_corrigir ? `<br><span class="note">Como corrigir: ${esc(p.como_corrigir)}</span>` : ""}</p>`).join("")}${(hist.analise.prioridades || []).length ? `<p><b>Prioridades de estudo:</b> ${esc(hist.analise.prioridades.join("; "))}</p>` : ""}</div>` : ""}
      <div class="actions" style="justify-content:flex-start"><button type="button" id="histAnalisar" ${hist.analisando ? "disabled" : ""}>${hist.analisando ? "A IA está analisando…" : hist.analise ? "Analisar de novo com a IA" : "Analisar meus erros com a IA"}</button></div></div>`;
  }
  // lista
  h += `<div class="h-sec"><h4>Minhas respostas</h4><div class="h-row h-cab"><span>Data</span><span>Prova</span><span>Nota</span><span>Caligrafia</span></div>${L.slice().reverse().map(e => {
    const t = histTentativas(e), n = t.indexOf(e) + 1;
    const tit = e.tipo === "objetiva" ? (e.novas ? "Questões inéditas" : e.papel ? "Prova no papel" : "Simulado objetivo") : e.tipo === "peca" ? "Peça prática" : "Questão " + e.numero;
    const bco = e.tipo === "objetiva" ? e.questoes.filter(q => q.branco).length : 0;
    const sub = e.tipo === "objetiva" ? `${e.acertos} certa(s) · ${e.total - e.acertos - bco} errada(s)${bco ? ` · ${bco} em branco` : ""} de ${e.total}` : [e.disciplina, e.modo, e.novas ? "caso inédito" : ""].filter(Boolean).join(" · ");
    return `<button type="button" class="h-row" data-histdet="${esc(e.id)}"><span class="note">${histData(e.data)}</span><span><b>${esc(e.nome)} · ${esc(tit)}</b>${t.length > 1 ? ` <span class="chip">${n}ª tentativa</span>` : ""}<br><span class="note">${esc(sub)}</span></span><span class="h-nota ${histCor(e.nota)}">${e.tipo === "objetiva" ? Math.round(e.nota * 10) + "%" : histNum(e.nota)}</span><span class="note" style="text-align:center">${e.caligrafia != null ? "✍ " + histNum(e.caligrafia) : "—"}</span></button>`;
  }).join("")}</div>`;
  return h;
}
function svgEvolucao(L) {
  const W = 760, H = 200, l = 34, T = 10, B = 26, n = L.length;
  const x = i => n === 1 ? (l + W - 14) / 2 : l + i * (W - l - 14) / (n - 1), y = v => T + (10 - v) * (H - T - B) / 10;
  let s = [0, 2, 4, 6, 8, 10].map(v => `<line x1="${l}" x2="${W - 10}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${l - 8}" y="${y(v) + 4}" font-size="11" text-anchor="end" fill="var(--muted)">${v}</text>`).join("");
  s += `<line x1="${l}" x2="${W - 10}" y1="${y(6)}" y2="${y(6)}" stroke="var(--danger)" stroke-dasharray="4 4" opacity=".6"/><text x="${W - 12}" y="${y(6) - 4}" font-size="10" text-anchor="end" fill="var(--danger)">nota 6</text>`;
  const passo = Math.max(1, Math.ceil(n / 10));
  s += L.map((e, i) => i % passo === 0 || i === n - 1 ? `<text x="${x(i)}" y="${H - 6}" font-size="11" text-anchor="middle" fill="var(--muted)">${histData(e.data)}</text>` : "").join("");
  const linha = (pts, cor, tr) => pts.length ? (pts.length > 1 ? `<polyline fill="none" stroke="${cor}" stroke-width="2.5" ${tr ? 'stroke-dasharray="5 4"' : ""} points="${pts.map(([i, v]) => `${x(i)},${y(v)}`).join(" ")}"/>` : "") + pts.map(([i, v]) => `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="${cor}"/>`).join("") : "";
  s += linha(L.map((e, i) => [i, e.caligrafia]).filter(p => p[1] != null), "#9aa6c2", true);
  s += linha(L.map((e, i) => [i, e.nota]), "var(--brand)");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Evolução das notas">${s}</svg>`;
}
function htmlHistDetalhe() {
  const e = (hist.lista || []).find(x => x.id === hist.det); if (!e) { hist.det = null; return htmlHistorico(); }
  const t = histTentativas(e);
  const tit = e.tipo === "objetiva" ? (e.novas ? "Questões inéditas" : e.papel ? "Prova no papel" : "Simulado objetivo") : e.tipo === "peca" ? "Peça prática" : "Questão " + e.numero;
  let h = `<div class="est-prog"><button type="button" class="mini" id="histVoltar">‹ Histórico</button><b>${esc(e.nome)} · ${esc(tit)}</b><span class="chip">${histDataLonga(e.data)}${e.modo ? " · " + esc(e.modo) : ""}</span></div>`;
  if (t.length > 1) h += `<p class="h-tent"><b>Suas tentativas:</b> ${t.map((x, k) => `<button type="button" class="link-x${x.id === e.id ? " on" : ""}" data-histdet="${esc(x.id)}">${histData(x.data)} → <b>${x.tipo === "objetiva" ? Math.round(x.nota * 10) + "%" : histNum(x.nota)}</b></button>`).join(" · ")}${(() => { const d = t[t.length - 1].nota - t[0].nota; return Math.abs(d) > 0.05 ? ` <span class="${d > 0 ? "h-up" : "h-down"}">(${d > 0 ? "▲ +" : "▼ "}${e.tipo === "objetiva" ? Math.round(d * 10) + " pontos percentuais" : histNum(d)})</span>` : ""; })()}</p>`;
  if (e.tipo === "objetiva") {
    const anul = e.questoes.filter(q => q.anulada).length;
    h += `<p class="est-res ${e.nota >= 7 ? "ok" : e.nota >= 5 ? "" : "bad"}"><b>${e.acertos}</b> certa(s) e <b>${e.total - e.acertos - e.questoes.filter(q => q.branco).length}</b> errada(s)${e.questoes.some(q => q.branco) ? ` e ${e.questoes.filter(q => q.branco).length} em branco` : ""} de ${e.total} · ${Math.round(e.nota * 10)}%${anul ? ` · ${anul} anulada(s)` : ""}</p>
      <div class="h-tab"><div class="h-trow h-cab"><span>Nº</span><span>Disciplina</span><span>Você</span><span>Gabarito</span><span></span></div>${e.questoes.map(q => `<div class="h-trow ${q.anulada || q.branco ? "" : q.ok ? "ok" : "bad"}"><span>${esc(String(q.n))}</span><span>${esc(q.disc)}</span><span>${esc(q.marcada)}</span><span>${esc(q.gab)}</span><span>${q.anulada ? "anulada" : q.branco ? "em branco" : q.ok ? "✓" : "✗"}</span></div>${q.enun ? `<details class="h-enun"><summary>ver o enunciado da questão ${esc(String(q.n))}</summary><p class="pre note">${esc(q.enun)}${q.enun.length >= 400 ? "…" : ""}</p></details>` : ""}`).join("")}</div>`;
  } else {
    const q = e.q || {};
    h += htmlCorrecao(e.correcao || { nota: e.nota }, q);
    h += `<details class="est-det"><summary>Enunciado</summary><p class="pre">${esc(q.enunciado || "")}</p></details>`;
    if ((q.espelho || []).length) h += `<details class="est-det"><summary>Espelho ${q.inedita ? "" : "oficial "}de correção</summary><ul class="est-itens">${q.espelho.map(x => `<li>${esc(x.item)} <span class="note">(${esc(String(x.pontos))} pts)</span></li>`).join("")}</ul></details>`;
    if (q.resposta_esperada) h += `<details class="est-det"><summary>Resposta esperada</summary><p class="pre">${esc(q.resposta_esperada)}</p></details>`;
    if (e.texto) h += `<details class="est-det"><summary>${e.modo === "manuscrita" ? "Sua resposta (transcrição da IA)" : "Sua resposta"}</summary><p class="pre">${esc(e.texto)}</p></details>`;
    if ((e.fotos || []).length) {
      const fs = e.fotos.map(id => hist.fotos[id]);
      h += `<details class="est-det" id="histFotosDet" data-histfotos="${esc(e.id)}"${fs.some(Boolean) ? " open" : ""}><summary>Fotos enviadas (${e.fotos.length} ${e.fotos.length > 1 ? "folhas" : "folha"})</summary>${fs.every(Boolean) ? `<div class="h-fotos">${fs.map((f, k) => f.erro ? `<p class="note">Folha ${k + 1}: ${esc(f.erro)}</p>` : /pdf/.test(f.tipo) ? `<a href="${f.url}" target="_blank" rel="noopener">Abrir o PDF (folha ${k + 1})</a>` : `<a href="${f.url}" target="_blank" rel="noopener"><img src="${f.url}" alt="Folha ${k + 1}"></a>`).join("")}</div>` : `<p class="note est-gerando">Abra para carregar as fotos…</p>`}</details>`;
    }
  }
  h += `<div class="actions"><button type="button" id="histExcluir" data-histid="${esc(e.id)}">${hist.excluir === e.id ? "Clique de novo para excluir" : "Excluir do histórico"}</button><button type="button" class="primary" id="histRefazer" data-histid="${esc(e.id)}">${e.tipo === "objetiva" ? "Refazer este simulado" : "Refazer esta questão"}</button></div>`;
  return h;
}
async function carregarFotosHist(id) {
  const e = (hist.lista || []).find(x => x.id === id); if (!e) return;
  const faltam = (e.fotos || []).filter(f => !hist.fotos[f]); if (!faltam.length) return;   // sem isso, redesenhar reabriria o quadro e entraria em laço
  for (const f of faltam) {
    try {
      const r = await postScript({ acao: "historicoFoto", sessao: usuarioAtual.sessao, foto: f });
      if (!r.ok) throw new Error(r.erro);
      const b = await (await fetch(`data:${r.tipo};base64,${r.base64}`)).blob();
      hist.fotos[f] = { tipo: r.tipo, url: URL.createObjectURL(b) };
    } catch (err) { hist.fotos[f] = { erro: "não foi possível carregar (" + err.message + ")" }; }
  }
  if (hist.det === id) { const sc = $("estudoConteudo").scrollTop; desenharEstudo(estudoAba); $("estudoConteudo").scrollTop = sc; }
}
async function analisarErrosIA() {
  const L = histFiltrada(); if (!L.length) return;
  hist.analisando = true; desenharEstudo(estudoAba);
  const escritas = L.filter(e => e.tipo !== "objetiva").slice(-15).map(e => `- ${e.disciplina || e.tipo} (nota ${histNum(e.nota)}): não atendidos: ${((e.correcao || {}).itens || []).filter(t => t.atendido !== "sim").map(t => t.item + (t.comentario ? " [" + t.comentario + "]" : "")).join("; ") || "nenhum"}; melhorias: ${((e.correcao || {}).melhorias || []).join("; ")}${e.correcao && e.correcao.caligrafia ? "; caligrafia: " + (e.correcao.caligrafia.comentario || "") : ""}`).join("\n");
  const obj = {}; L.filter(e => e.tipo === "objetiva").forEach(e => e.questoes.filter(q => !q.anulada).forEach(q => { (obj[q.disc] = obj[q.disc] || [0, 0])[1]++; if (q.ok) obj[q.disc][0]++; }));
  const p = `Você é um mentor de candidatos a concursos jurídicos (carreiras policiais e jurídicas). Abaixo está o histórico recente de correções de um candidato.\n\nRESPOSTAS ESCRITAS:\n${escritas || "(nenhuma)"}\n\nOBJETIVAS (acertos por disciplina):\n${Object.entries(obj).map(([d, [a, t]]) => `- ${d}: ${a}/${t}`).join("\n") || "(nenhuma)"}\n\nIdentifique os padrões de erro que se repetem (conteúdo jurídico, técnica de resposta, estrutura das peças, gestão de linhas e caligrafia), de forma concreta e acionável. Responda em JSON: {"padroes": [{"titulo": string curto, "explicacao": string, "como_corrigir": string}] (até 5), "prioridades": [string] (até 4 temas para estudar primeiro)}`;
  try { hist.analise = await gemini(p); } catch (e) { toast("A IA não respondeu agora (" + e.message + ")."); }
  hist.analisando = false; desenharEstudo(estudoAba);
}
function refazerHist(id) {
  const e = (hist.lista || []).find(x => x.id === id); if (!e) return;
  if (!repo || !repo.itens) { toast("Aguarde a lista de provas carregar."); return; }
  hist.aberto = false; hist.det = null;
  if (e.tipo === "objetiva") { iniciarSimulado(e.prova, e.novas); return; }
  if (e.novas) iniciarSimulado(e.prova, true, { i: 0, geradas: { 0: { q: { ...e.q, inedita: true } } } });
  else iniciarSimulado(e.prova, false, { i: e.i || 0 });
}

// ---------- informativos de jurisprudência: cada sessão de questões é um registro ----------
const MODOS_CURTO = { ce: "Certo ou errado", me: "Múltipla escolha", disc: "Discursiva", lacuna: "Complete a lacuna" };
function registrarSessaoInfo() {
  const s = estudo; if (!s) return;
  const qs = [];
  s.lista.forEach((j, i) => {
    const r = s.resp[i], q = s.qs[i] && s.qs[i].pronta; if (!r || r.nota === undefined || !q) return;
    qs.push({ n: i + 1, jid: j.id, trib: j.trib, info: j.info || "", disc: j.disc, tit: String(j.titulo || "").slice(0, 200), modo: q.tipo, nota: r.nota, marcada: r.marcada || "", gab: q.gabarito || "",
      enun: String(q.assertiva || q.enunciado || "").slice(0, 900), ...(q.tipo === "me" ? { alts: (q.alternativas || []).map(a => String(a).slice(0, 240)) } : {}), coment: String(q.comentario || "").slice(0, 900),
      ...(r.correcao ? { corr: { nota: r.correcao.nota, itens: r.correcao.itens || [], melhorias: r.correcao.melhorias || [] } } : {}), ...(r.texto ? { texto: String(r.texto).slice(0, 4000) } : {}) });
  });
  if (!qs.length || qs.length === s.registradas) return;   // nada novo desde o último registro desta sessão
  s.registradas = qs.length; s.histId = s.histId || Date.now().toString(36) + Math.random().toString(36).slice(2, 6); s.histData = s.histData || new Date().toISOString();
  const ac = qs.filter(x => x.nota >= 1).length, pa = qs.filter(x => x.nota > 0 && x.nota < 1).length;
  registrarHist({ id: s.histId, data: s.histData, tipo: s.lei ? "lei" : "info", ...(s.simulado ? { nome: s.simulado } : {}), modo: s.modo, chave: (s.lei ? "lei:" : "info:") + s.modo + ":" + histHash(s.lista.map(j => j.id).sort().join(",")), jids: s.lista.map(j => j.id),
    total: qs.length, acertos: ac, parciais: pa, erros: qs.length - ac - pa, nota: qs.reduce((a, x) => a + x.nota, 0) / qs.length * 10, questoes: qs });
}
function htmlHistInfo() {
  const H = hist.info, T = H.tipo || "info";
  if (H.det) return htmlHistInfoDet();
  if (!hist.lista) { carregarHistorico(); return `<p class="note est-gerando">Carregando o seu histórico…</p>`; }
  const lim = H.periodo ? Date.now() - H.periodo * 864e5 : 0;
  const L = hist.lista.filter(e => e.tipo === T && (H.filtro === "tudo" || e.modo === H.filtro) && new Date(e.data).getTime() >= lim).sort((a, b) => new Date(a.data) - new Date(b.data));
  const prog = lerEst("prog", {}), vistos = Object.values(prog).filter(p => p.prox).length, dom = Object.values(prog).filter(p => p.caixa >= 3).length;
  let h = `<div class="h-filtros">${[["tudo", "Tudo"], ["ce", "Certo ou errado"], ["me", "Múltipla escolha"], ["disc", "Discursiva"]].map(([k, n]) => `<button type="button" class="chip-sel${H.filtro === k ? " on" : ""}" data-hinfofiltro="${k}">${n}</button>`).join("")}
    <select id="hInfoPeriodo" class="h-per">${[[30, "Últimos 30 dias"], [90, "Últimos 90 dias"], [365, "Último ano"], [0, "Todo o período"]].map(([v, n]) => `<option value="${v}"${H.periodo === v ? " selected" : ""}>${n}</option>`).join("")}</select>${hist.carregando ? `<span class="note">atualizando…</span>` : ""}</div>`;
  if (!L.length) {
    const ant = T === "lei" ? [] : lerEst("hist", []);
    return h + `<p class="note">${hist.lista.some(e => e.tipo === T) ? "Nada neste filtro e período." : (T === "lei" ? "Ainda não há sessões de lei seca no histórico. Cada sessão de questões entra aqui, com a data, os artigos e o que você acertou e errou." : "Ainda não há sessões no histórico. A partir de agora, cada sessão de questões dos informativos entra aqui, com a data, as questões e o que você acertou e errou.")}</p>${ant.length ? `<p class="note">Antes do histórico você respondeu ${ant.length} questões (${Math.round(ant.reduce((a, x) => a + x.nota, 0) / ant.length * 100)}% de aproveitamento) · ${vistos} de ${julgados.length} julgados já vistos · ${dom} dominados.</p>` : ""}`;
  }
  const qsT = L.flatMap(e => e.questoes), pct = l => l.length ? l.reduce((a, x) => a + x.nota, 0) / l.length * 100 : 0;
  const notas = L.map(e => e.nota), ult = notas.slice(-5), ant = notas.slice(0, -5);
  const mU = ult.reduce((a, b) => a + b, 0) / ult.length, mA = ant.length ? ant.reduce((a, b) => a + b, 0) / ant.length : null;
  const seta = d => d > 0.5 ? `<div class="h-up">▲ +${Math.round(d * 10)} pontos sobre as anteriores</div>` : d < -0.5 ? `<div class="h-down">▼ ${Math.round(d * 10)} pontos sobre as anteriores</div>` : `<div class="l">estável</div>`;
  h += `<div class="h-cards">
    <div class="h-card"><div class="l">Aproveitamento</div><div class="v">${Math.round(pct(qsT))}%</div><div class="l">${qsT.length} questões em ${L.length} sessão(ões)</div></div>
    <div class="h-card"><div class="l">Últimas ${ult.length} sessões</div><div class="v">${Math.round(mU * 10)}%</div>${mA != null ? seta(mU - mA) : `<div class="l">poucas sessões para comparar</div>`}</div>
    <div class="h-card"><div class="l">Certas · parciais · erradas</div><div class="v" style="font-size:20px">${qsT.filter(x => x.nota >= 1).length} · ${qsT.filter(x => x.nota > 0 && x.nota < 1).length} · ${qsT.filter(x => x.nota === 0).length}</div><div class="l">no período</div></div>
    <div class="h-card"><div class="l">Julgados dominados</div><div class="v">${dom}</div><div class="l">${vistos} de ${julgados.length} já vistos</div></div></div>`;
  h += `<div class="h-sec"><h4>Evolução</h4><div class="h-leg"><span style="color:var(--brand)">Aproveitamento da sessão (÷ 10)</span></div>${svgEvolucao(L.map(e => ({ ...e, caligrafia: null })))}</div>`;
  const grupo = campo => { const g = {}; qsT.forEach(x => (g[x[campo]] = g[x[campo]] || []).push(x)); return Object.entries(g).map(([k, l]) => [k, pct(l) / 10, l.length]).sort((a, b) => a[1] - b[1]); };
  const barras = (lista) => lista.map(([k, v, n]) => `<div class="h-bar"><span>${esc(k)}</span><span class="t"><i class="${histCor(v)}" style="width:${Math.max(3, v * 10)}%"></i></span><span><b>${Math.round(v * 10)}%</b> <span class="note">(${n} ${n > 1 ? "questões" : "questão"})</span></span></div>`).join("");
  h += `<div class="h-sec"><h4>Por disciplina <span class="note">(do mais fraco para o mais forte)</span></h4>${barras(grupo("disc"))}<h4 style="margin-top:12px">Por tribunal</h4>${barras(grupo("trib"))}</div>`;
  // julgados que mais erra
  const err = {}; qsT.filter(x => x.nota < 1).forEach(x => { const e = err[x.jid] = err[x.jid] || { n: 0, x }; e.n++; e.x = x; });
  const errs = Object.values(err).sort((a, b) => b.n - a.n).slice(0, 8);
  if (errs.length) h += `<div class="h-sec"><h4>${T === "lei" ? "Artigos que você mais erra" : "Julgados que você mais erra"}</h4><ul class="h-err">${errs.map(({ n, x }) => `<li><b>${n}×</b> ${esc(x.tit)} <span class="note">(${esc(x.trib)}${x.info ? " · Info " + esc(String(x.info).split(",")[0]) : ""} · ${esc(x.disc)})</span></li>`).join("")}</ul>
    ${H.analise ? `<div class="est-det"><p class="est-sub">Análise da IA</p>${(H.analise.padroes || []).map(p => `<p><b>${esc(p.titulo)}</b> — ${esc(p.explicacao)}${p.como_corrigir ? `<br><span class="note">Como corrigir: ${esc(p.como_corrigir)}</span>` : ""}</p>`).join("")}${(H.analise.prioridades || []).length ? `<p><b>Prioridades de estudo:</b> ${esc(H.analise.prioridades.join("; "))}</p>` : ""}</div>` : ""}
    <div class="actions" style="justify-content:flex-start"><button type="button" class="primary" id="hInfoErros">${T === "lei" ? "Praticar estes artigos" : "Praticar estes julgados"}</button><button type="button" id="hInfoAnalisar" ${H.analisando ? "disabled" : ""}>${H.analisando ? "A IA está analisando…" : "Analisar meus erros com a IA"}</button></div></div>`;
  h += `<div class="h-sec"><h4>Minhas sessões</h4><div class="h-row h-cab"><span>Data</span><span>Sessão</span><span>Acertos</span><span></span></div>${L.slice().reverse().map(e => {
    const t = histTentativas(e), n = t.indexOf(e) + 1, tribs = [...new Set(e.questoes.map(x => x.trib))].join("/");
    return `<button type="button" class="h-row" data-hinfodet="${esc(e.id)}"><span class="note">${histData(e.data)}</span><span><b>${e.nome ? esc(e.nome) : esc(MODOS_CURTO[e.modo] || e.modo) + " · " + e.total + (e.total > 1 ? " questões" : " questão")}</b>${t.length > 1 ? ` <span class="chip">${n}ª tentativa</span>` : ""}<br><span class="note">${e.acertos} certa(s)${e.parciais ? ` · ${e.parciais} parcial(is)` : ""} · ${e.erros} errada(s) · ${esc(tribs)}</span></span><span class="h-nota ${histCor(e.nota)}">${Math.round(e.nota * 10)}%</span><span></span></button>`;
  }).join("")}</div>`;
  return h;
}
function htmlHistInfoDet() {
  const H = hist.info, T = H.tipo || "info", e = (hist.lista || []).find(x => x.id === H.det); if (!e) { H.det = null; return htmlHistInfo(); }
  const t = histTentativas(e);
  let h = `<div class="est-prog"><button type="button" class="mini" id="hInfoVoltar">‹ Histórico</button><b>${e.nome ? esc(e.nome) : esc(MODOS_CURTO[e.modo] || e.modo) + " · " + e.total + (e.total > 1 ? " questões" : " questão")}</b><span class="chip">${histDataLonga(e.data)}</span></div>`;
  if (t.length > 1) h += `<p class="h-tent"><b>Suas tentativas com estes julgados:</b> ${t.map(x => `<button type="button" class="link-x${x.id === e.id ? " on" : ""}" data-hinfodet="${esc(x.id)}">${histData(x.data)} → <b>${Math.round(x.nota * 10)}%</b></button>`).join(" · ")}</p>`;
  h += `<p class="est-res ${e.nota >= 7 ? "ok" : e.nota >= 5 ? "" : "bad"}"><b>${e.acertos}</b> certa(s)${e.parciais ? `, <b>${e.parciais}</b> parcial(is)` : ""} e <b>${e.erros}</b> errada(s) · ${Math.round(e.nota * 10)}%</p>
    <div class="h-tab">${e.questoes.map(x => {
      const res = x.nota >= 1 ? "ok" : x.nota > 0 ? "parc" : "bad", marca = x.nota >= 1 ? "✓" : x.nota > 0 ? "½" : "✗";
      const resp = x.modo === "ce" ? `Você: <b>${x.marcada === "C" ? "Certo" : "Errado"}</b> · gabarito: <b>${x.gab === "C" ? "Certo" : "Errado"}</b>` : x.modo === "me" ? `Você: <b>${esc(x.marcada)}</b> · gabarito: <b>${esc(x.gab)}</b>` : x.corr ? `Nota da IA: <b>${esc(String(x.corr.nota))}</b> de 10` : "autoavaliação";
      return `<details class="h-qinfo ${res}"><summary><span class="h-qn">${x.n}</span><span><b>${esc(x.tit)}</b><br><span class="note">${esc(x.trib)}${x.info ? " · Info " + esc(String(x.info).split(",")[0]) : ""} · ${esc(x.disc)} · ${resp}</span></span><span class="h-qr">${marca}</span></summary>
        <div class="h-qcorpo"><p class="pre">${esc(x.enun)}</p>${(x.alts || []).length ? `<ol type="A" class="h-alts">${x.alts.map((a, k) => `<li class="${"ABCDE"[k] === x.gab ? "ok" : "ABCDE"[k] === x.marcada ? "bad" : ""}">${esc(a)}</li>`).join("")}</ol>` : ""}
        ${x.corr ? `<ul class="est-itens">${(x.corr.itens || []).map(i => `<li class="${i.atendido === "sim" ? "ok" : i.atendido === "parcial" ? "parc" : "bad"}"><b>${esc(i.item)}</b> — ${esc(i.atendido)}${i.comentario ? ": " + esc(i.comentario) : ""}</li>`).join("")}</ul>${(x.corr.melhorias || []).length ? `<p><b>Para melhorar:</b> ${esc(x.corr.melhorias.join("; "))}</p>` : ""}` : ""}
        ${x.texto ? `<details class="est-det"><summary>Sua resposta</summary><p class="pre">${esc(x.texto)}</p></details>` : ""}${x.coment ? `<p class="note">${esc(x.coment)}</p>` : ""}</div></details>`;
    }).join("")}</div>
    <div class="actions"><button type="button" id="hInfoExcluir" data-histid="${esc(e.id)}">${hist.excluir === e.id ? "Clique de novo para excluir" : "Excluir do histórico"}</button>${e.erros + e.parciais ? `<button type="button" id="hInfoRefazerErros" data-histid="${esc(e.id)}">Praticar só os que errei (${e.erros + e.parciais})</button>` : ""}<button type="button" class="primary" id="hInfoRefazer" data-histid="${esc(e.id)}">Refazer estes julgados</button></div>
    <p class="note">Ao refazer, a IA cria questões novas sobre os mesmos julgados, na mesma modalidade.</p>`;
  return h;
}
const acharItemEstudo = id => julgados.find(j => j.id === id) || (typeof artigoPorId === "function" ? artigoPorId(id) : null);
function praticarJulgados(ids, modo) {
  const lista = ids.map(acharItemEstudo).filter(Boolean);
  if (!lista.length) { toast("Esses julgados não estão mais no caderno."); return; }
  registrarSessaoInfo();
  const lei = !!(lista[0] && lista[0].lei), md = modo || (lei ? "ce" : lerEst("filtro", { modo: "ce" }).modo);
  estudo = { modo: md, lista, i: 0, qs: {}, resp: {}, notas: [], ...(lei ? { lei: true, gerador: geradorLei(lista, md) } : {}) };
  hist.info.det = null; prepararQuestao(0); desenharEstudo("praticar"); $("estudoConteudo").scrollTop = 0;
}
async function analisarErrosInfo() {
  const H = hist.info, lim = H.periodo ? Date.now() - H.periodo * 864e5 : 0;
  const qs = (hist.lista || []).filter(e => e.tipo === T && new Date(e.data).getTime() >= lim).flatMap(e => e.questoes);
  const erradas = qs.filter(x => x.nota < 1).slice(-40);
  if (!erradas.length) return;
  H.analisando = true; desenharEstudo("desempenho");
  const p = `Você é um mentor de candidatos a concursos jurídicos. O candidato estuda jurisprudência dos informativos do STF, STJ e TSE com questões. Questões que ele errou ou acertou só em parte:\n${erradas.map(x => `- [${x.trib} · ${x.disc}] ${x.tit}${x.modo !== "disc" ? ` (marcou ${x.marcada}, gabarito ${x.gab})` : ""}${x.corr && (x.corr.melhorias || []).length ? " — melhorar: " + x.corr.melhorias.join("; ") : ""}`).join("\n")}\n\nAproveitamento geral no período: ${Math.round(qs.reduce((a, x) => a + x.nota, 0) / qs.length * 100)}%.\n\nIdentifique os padrões de erro (temas, tipos de tese, pegadinhas, confusões entre tribunais) de forma concreta e acionável. Responda em JSON: {"padroes": [{"titulo": string curto, "explicacao": string, "como_corrigir": string}] (até 5), "prioridades": [string] (até 4 temas para revisar primeiro)}`;
  try { H.analise = await gemini(p); } catch (e) { toast("A IA não respondeu agora (" + e.message + ")."); }
  H.analisando = false; desenharEstudo("desempenho");
}

// ---------- eventos ----------
document.addEventListener("click", e => {
  if (!e.target.closest("#estudoConteudo")) return;
  const t = e.target.closest("button"); if (!t) return;
  if (t.id === "histAbrir") { hist.aberto = true; hist.det = null; hist.filtro = t.dataset.histarea === "pecas" ? "peca" : "tudo"; carregarHistorico(true); desenharEstudo(estudoAba); $("estudoConteudo").scrollTop = 0; return; }
  if (t.id === "histFechar") { hist.aberto = false; desenharEstudo(estudoAba); return; }
  if (t.dataset.histfiltro) { hist.filtro = t.dataset.histfiltro; desenharEstudo(estudoAba); return; }
  if (t.dataset.histdet) { hist.det = t.dataset.histdet; hist.excluir = ""; desenharEstudo(estudoAba); $("estudoConteudo").scrollTop = 0; return; }
  if (t.id === "histVoltar") { hist.det = null; desenharEstudo(estudoAba); return; }
  if (t.id === "histAnalisar") { analisarErrosIA(); return; }
  if (t.id === "histRefazer") { refazerHist(t.dataset.histid); return; }
  if (t.id === "histExcluir") {
    const id = t.dataset.histid;
    if (hist.excluir !== id) { hist.excluir = id; desenharEstudo(estudoAba); return; }
    hist.excluir = ""; hist.det = null; hist.lista = hist.lista.filter(x => x.id !== id); gravarProv("historico", hist.lista);
    gravarProv("histFila", lerProv("histFila", []).filter(x => x.id !== id));
    postScript({ acao: "historicoDel", sessao: usuarioAtual.sessao, id }).catch(() => {});
    toast("Registro excluído do histórico."); desenharEstudo(estudoAba); return;
  }
});
document.addEventListener("click", e => {
  if (!e.target.closest("#estudoConteudo")) return;
  const t = e.target.closest("button"); if (!t) return;
  const H = hist.info;
  if (t.dataset.hinfofiltro) { H.filtro = t.dataset.hinfofiltro; desenharEstudo("desempenho"); return; }
  if (t.dataset.hinfodet) { H.det = t.dataset.hinfodet; hist.excluir = ""; desenharEstudo("desempenho"); $("estudoConteudo").scrollTop = 0; return; }
  if (t.id === "hInfoVoltar") { H.det = null; desenharEstudo("desempenho"); return; }
  if (t.id === "hInfoAnalisar") { analisarErrosInfo(); return; }
  if (t.id === "hInfoErros") {
    const lim = H.periodo ? Date.now() - H.periodo * 864e5 : 0, cont = {};
    (hist.lista || []).filter(x => x.tipo === (H.tipo || "info") && new Date(x.data).getTime() >= lim).flatMap(x => x.questoes).filter(x => x.nota < 1).forEach(x => cont[x.jid] = (cont[x.jid] || 0) + 1);
    praticarJulgados(Object.keys(cont).sort((a, b) => cont[b] - cont[a]).slice(0, 20)); return;
  }
  const e2 = t.dataset.histid && (hist.lista || []).find(x => x.id === t.dataset.histid);
  if (t.id === "hInfoRefazer" && e2) { praticarJulgados(e2.jids || e2.questoes.map(x => x.jid), e2.modo); return; }
  if (t.id === "hInfoRefazerErros" && e2) { praticarJulgados(e2.questoes.filter(x => x.nota < 1).map(x => x.jid), e2.modo); return; }
  if (t.id === "hInfoExcluir" && e2) {
    if (hist.excluir !== e2.id) { hist.excluir = e2.id; desenharEstudo("desempenho"); return; }
    hist.excluir = ""; H.det = null; hist.lista = hist.lista.filter(x => x.id !== e2.id); gravarProv("historico", hist.lista);
    if (estudo && estudo.histId === e2.id) { estudo.histId = null; estudo.histData = null; estudo.registradas = 0; }
    gravarProv("histFila", lerProv("histFila", []).filter(x => x.id !== e2.id));
    postScript({ acao: "historicoDel", sessao: usuarioAtual.sessao, id: e2.id }).catch(() => {});
    toast("Sessão excluída do histórico."); desenharEstudo("desempenho"); return;
  }
});
document.addEventListener("close", e => { if (e.target.id === "dlgEstudo") registrarSessaoInfo(); }, true);
document.addEventListener("toggle", e => { if (e.target.id === "histFotosDet" && e.target.open) carregarFotosHist(e.target.dataset.histfotos); }, true);
document.addEventListener("change", e => {
  if (e.target.id === "histPeriodo") { hist.periodo = +e.target.value; desenharEstudo(estudoAba); }
  if (e.target.id === "hInfoPeriodo") { hist.info.periodo = +e.target.value; desenharEstudo("desempenho"); }
});
