// Lei seca: texto vigente das leis do Planalto, leitura artigo por artigo com revisão, questões da letra da lei
// (no app ou no papel) e PDF da lei limpa. O Apps Script baixa a página no planalto.gov.br; se o site recusar,
// o usuário cola o texto copiado da página (o app recebe a formatação e tira o que está riscado = revogado).

const LEIS_PADRAO = [
  { id: "cf", sigla: "CF", nome: "Constituição Federal", url: "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm" },
  { id: "cp", sigla: "CP", nome: "Código Penal", url: "https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848compilado.htm" },
  { id: "cpp", sigla: "CPP", nome: "Código de Processo Penal", url: "https://www.planalto.gov.br/ccivil_03/decreto-lei/del3689compilado.htm" },
  { id: "cc", sigla: "CC", nome: "Código Civil", url: "https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm" },
  { id: "cpc", sigla: "CPC", nome: "Código de Processo Civil", url: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm" },
  { id: "lep", sigla: "LEP", nome: "Lei de Execução Penal (Lei 7.210/1984)", url: "https://www.planalto.gov.br/ccivil_03/leis/l7210.htm" },
  { id: "drogas", sigla: "Lei de Drogas", nome: "Lei de Drogas (Lei 11.343/2006)", url: "https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2006/lei/l11343.htm" },
  { id: "eca", sigla: "ECA", nome: "Estatuto da Criança e do Adolescente (Lei 8.069/1990)", url: "https://www.planalto.gov.br/ccivil_03/leis/l8069.htm" },
  { id: "mariapenha", sigla: "Maria da Penha", nome: "Lei Maria da Penha (Lei 11.340/2006)", url: "https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2006/lei/l11340.htm" },
  { id: "improbidade", sigla: "LIA", nome: "Lei de Improbidade Administrativa (Lei 8.429/1992)", url: "https://www.planalto.gov.br/ccivil_03/leis/l8429.htm" },
  { id: "abuso", sigla: "Abuso de Autoridade", nome: "Lei de Abuso de Autoridade (Lei 13.869/2019)", url: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2019/lei/l13869.htm" },
  { id: "orcrim", sigla: "Org. Criminosas", nome: "Lei das Organizações Criminosas (Lei 12.850/2013)", url: "https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/lei/l12850.htm" },
  { id: "intercept", sigla: "Interceptação", nome: "Lei de Interceptação Telefônica (Lei 9.296/1996)", url: "https://www.planalto.gov.br/ccivil_03/leis/l9296.htm" },
  { id: "ce", sigla: "Cód. Eleitoral", nome: "Código Eleitoral (Lei 4.737/1965)", url: "https://www.planalto.gov.br/ccivil_03/leis/l4737compilado.htm" }
];
let leis = {};          // id -> { meta, artigos: [{ id, rot, txt, cap }], quando, fonte }
let leiUi = { baixando: {}, colar: null, msg: {} };
const lerLeiCfg = () => ({ lei: "", cap: "", busca: "", soDificeis: false, pos: {}, ...lerEst("leiRev", {}) });
const leiCatalogo = () => [...LEIS_PADRAO, ...lerEst("leisExtras", [])];
const marcasLei = () => lerEst("leiMarc", {});   // artigoId -> { rev: data, dif: true }

// ---------- limpeza do texto do Planalto ----------
const RE_NOTA = /\s*\((?:\s*(?:Reda[çc][ãa]o dada|Inclu[íi]d[oa]|Acrescid[oa]|Acrescentad[oa]|Revogad[oa]|Vide|Vig[êe]ncia|Renumerad[oa]|Regulamento|Regulamenta[çc][ãa]o|Produ[çc][ãa]o de efeito|Alterad[oa]|Suprimid[oa]|Express[ãa]o|Promulga[çc][ãa]o|Retificad[oa]|Mantid[oa]|Restabelecid[oa]|Convers[ãa]o|Em vigor|Declara[çc][ãa]o|Execu[çc][ãa]o suspensa|Revoga[çc][ãa]o)[^()]*(?:\([^()]*\)[^()]*)*)\)/gi;
const RE_ART = /^Art\.?\s*(\d+(?:\.\d+)*)\s*(?:º|°|o\b|ª)?(?:\s*[-–]\s*([A-Z]{1,2}))?\s*[.\-–]?/;
const RE_TIT = /^(PARTE|LIVRO|T[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|Se[çc][ãa]o|SUBSE[ÇC][ÃA]O|Subse[çc][ãa]o|DISPOSI[ÇC][ÕO]ES|ATO DAS DISPOSI)\b/;
function textoLimpo(t) { return String(t || "").replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim(); }
function artigosDoHtml(html) {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  doc.querySelectorAll("script,style,strike,s,del,head").forEach(e => e.remove());
  doc.querySelectorAll("[style]").forEach(e => { if (/line-through/i.test(e.getAttribute("style"))) e.remove(); });
  // um parágrafo por bloco (o Planalto usa <p>; textos colados podem vir em <div> ou <br>)
  doc.querySelectorAll("br").forEach(b => b.replaceWith("\n"));
  let blocos = [...doc.querySelectorAll("p,h1,h2,h3,h4,h5,h6,li,td")].filter(e => !e.querySelector("p,div,li,td")).map(e => e.textContent);
  if (blocos.length < 5) blocos = (doc.body ? doc.body.textContent : String(html)).split(/\n+/);
  const linhas = blocos.flatMap(b => textoLimpo(b).split("\n")).map(l => l.replace(RE_NOTA, "").replace(/\s{2,}/g, " ").trim()).filter(Boolean);
  const arts = []; let cap = [], atual = null, comecou = false, espera = "";
  for (const l of linhas) {
    if (/^(Bras[íi]lia,|Este texto n[ãa]o substitui|Rio de Janeiro,\s*\d)/i.test(l) && comecou) { atual = null; espera = "fim"; continue; }
    if (espera === "fim") continue;
    const m = l.match(RE_ART);
    if (m) {
      comecou = true;
      const rot = `Art. ${m[1]}${+m[1].replace(/\./g, "") < 10 && !m[2] ? "º" : ""}${m[2] ? "-" + m[2] : ""}`;
      const corpo = l.slice(m[0].length).trim();
      const pt = +m[1].replace(/\./g, "") >= 10 || m[2] ? "." : "";   // o Planalto escreve "Art. 1º" e "Art. 10."
      atual = { rot, txt: corpo ? `${rot}${pt} ${corpo}` : rot, cap: cap.filter(Boolean).join(" · ") };
      arts.push(atual); continue;
    }
    if (espera === "nome" && l === l.toUpperCase() && l.length < 160 && !/^Art/.test(l) && !/^(PARTE|LIVRO|T[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|SUBSE[ÇC][ÃA]O)\b/.test(l)) { const k = cap.length - 1; cap[k] = `${cap[k]} – ${l.charAt(0) + l.slice(1).toLowerCase()}`; espera = ""; continue; }
    if (RE_TIT.test(l) && l.length < 140) { const nivel = /^(PARTE|LIVRO)/.test(l) ? 0 : /^T[ÍI]TULO/.test(l) ? 1 : /^CAP/i.test(l) ? 2 : 3; cap = cap.slice(0, nivel); cap[nivel] = l; atual = null; espera = "nome"; continue; }
    espera = espera === "nome" ? "" : espera;
    if (atual && comecou) atual.txt += "\n" + l;
  }
  // artigo sem texto (só "revogado") sai da lista
  return arts.filter(a => a.txt.replace(a.rot, "").replace(/[\s.()–-]|revogad[oa]|vetad[oa]/gi, "").length > 3);
}

// ---------- guardar / carregar ----------
async function guardarLei(meta, html, info) {
  // id estável: rótulo do artigo + ordem entre os de mesmo rótulo (a CF repete "Art. 1º" no ADCT)
  const vistos = {};
  const artigos = artigosDoHtml(html).map(a => { const r = a.rot.replace(/\W+/g, ""); vistos[r] = (vistos[r] || 0) + 1; return { ...a, id: `lei:${meta.id}:${r}${vistos[r] > 1 ? "_" + vistos[r] : ""}` }; });
  if (artigos.length < 3) throw new Error("não encontrei artigos nesse texto");
  const reg = { meta, artigos, quando: info.quando || new Date().toISOString(), fonte: info.fonte || "" };
  await arq("gravar", "lei:" + meta.id, reg).catch(() => {});
  leis[meta.id] = reg;
  const idx = lerEst("leisBaixadas", {}); idx[meta.id] = { n: artigos.length, quando: reg.quando, fonte: reg.fonte }; gravarEst("leisBaixadas", idx);
  return reg;
}
async function carregarLeisLocais() {
  const idx = lerEst("leisBaixadas", {});
  for (const id of Object.keys(idx)) if (!leis[id]) { const r = await arq("ler", "lei:" + id).catch(() => null); if (r) leis[id] = r; }
}
function artigoPorId(id) {
  const m = String(id || "").match(/^lei:([^:]+):/); if (!m || !leis[m[1]]) return null;
  const a = leis[m[1]].artigos.find(x => x.id === id); return a ? objetoEstudo(leis[m[1]].meta, a) : null;
}
// o artigo no mesmo formato dos julgados (para a sessão de questões, a revisão espaçada e o histórico)
function objetoEstudo(meta, a) { return { id: a.id, lei: true, trib: meta.sigla, info: "", disc: meta.nome, titulo: `${a.rot} – ${meta.sigla}${a.cap ? " · " + a.cap : ""}`, texto: a.txt, tese: a.txt, cit: `${a.rot}, ${meta.nome}` }; }
async function baixarLei(id, forcar) {
  const meta = leiCatalogo().find(l => l.id === id); if (!meta || leiUi.baixando[id]) return;
  leiUi.baixando[id] = true; leiUi.msg[id] = ""; desenharEstudo(estudoAba);
  try {
    const r = await postLongo({ acao: "lei", url: meta.url, forcar: !!forcar }, 180000);
    if (!r.ok) { if (r.bloqueado) { leiUi.colar = id; leiUi.msg[id] = "O site do Planalto recusou o acesso automático. Cole o texto da página (passo a passo abaixo)."; } else throw new Error(/desconhecida/i.test(r.erro || "") ? "atualize o Apps Script" : r.erro); }
    else { const reg = await guardarLei(meta, r.html, r); leiUi.msg[id] = `${reg.artigos.length} artigos${r.aviso ? " · " + r.aviso : ""}`; }
  } catch (e) { leiUi.msg[id] = "Não foi possível: " + e.message; }
  delete leiUi.baixando[id]; desenharEstudo(estudoAba);
}
async function colarLei(id, html) {
  const meta = leiCatalogo().find(l => l.id === id); if (!meta) return;
  try {
    const reg = await guardarLei(meta, html, { fonte: "colado" });
    leiUi.colar = null; leiUi.msg[id] = `${reg.artigos.length} artigos (texto colado)`;
    postScript({ acao: "leiSalvar", sessao: usuarioAtual.sessao, url: meta.url, html: String(html).slice(0, 8000000) }).catch(() => {});   // para os outros aparelhos
    toast(`${meta.sigla}: ${reg.artigos.length} artigos prontos.`);
  } catch (e) { leiUi.msg[id] = "Não reconheci a lei no texto colado: " + e.message + ". Copie a página inteira (Ctrl+A, Ctrl+C)."; }
  desenharEstudo(estudoAba);
}

// ---------- telas ----------
function htmlLei(aba) {
  if (!leiUi.carregou) { leiUi.carregou = true; carregarLeisLocais().then(() => desenharEstudo(estudoAba)); }
  if (aba === "lei-leis") return htmlMinhasLeis();
  if (aba === "lei-ler") return htmlLerLei();
  if (aba === "lei-hist") { hist.info.tipo = "lei"; const h = htmlHistInfo(); hist.info.tipo = "info"; return h; }
  // praticar
  if (typeof cartao !== "undefined" && cartao && cartao.info) return htmlCartao();
  if (typeof papelInfo !== "undefined" && papelInfo.disc) return htmlDiscPapel();
  if (estudo && estudo.lei) return htmlSessao();
  return htmlPrepLei();
}
const leisProntas = () => leiCatalogo().filter(l => leis[l.id]);
function htmlMinhasLeis() {
  const idx = lerEst("leisBaixadas", {});
  let h = `<p class="note">Baixe as leis que você vai estudar. O app pega o texto vigente no site do Planalto, tira o que está revogado (riscado no site) e separa os artigos. Fica guardado neste aparelho e na nuvem do app.</p>`;
  h += leiCatalogo().map(l => {
    const b = idx[l.id], ok = !!leis[l.id] || !!b, d = b && new Date(b.quando);
    return `<div class="lei-item"><div class="lei-tit"><b>${esc(l.nome)}</b><span class="note">${ok ? `✓ ${b ? b.n : leis[l.id].artigos.length} artigos · ${b && b.fonte === "colado" ? "texto colado" : "do Planalto"}${d && !isNaN(d) ? " em " + d.toLocaleDateString("pt-BR") : ""}` : "ainda não baixada"}${leiUi.msg[l.id] ? ` · <span class="lei-msg">${esc(leiUi.msg[l.id])}</span>` : ""}</span></div>
      <div class="prov-acoes">${leiUi.baixando[l.id] ? `<span class="note est-gerando">Baixando do Planalto…</span>` : `${ok ? `<button type="button" class="primary" data-leiler="${l.id}">Ler</button><button type="button" data-leibaixar="${l.id}" data-forcar="1">Atualizar</button>` : `<button type="button" class="primary" data-leibaixar="${l.id}">Baixar do Planalto</button>`}<button type="button" data-leicolar="${l.id}">Colar o texto</button>${l.extra ? `<button type="button" class="link-x" data-leiremover="${l.id}">remover</button>` : ""}`}</div>
      ${leiUi.colar === l.id ? htmlColarLei(l) : ""}</div>`;
  }).join("");
  h += `<details class="est-det"><summary>+ Adicionar outra lei</summary><div class="env-grid"><label class="env-l2">Nome<input id="leiNovaNome" placeholder="ex.: Lei de Lavagem de Dinheiro (Lei 9.613/1998)"></label><label>Sigla curta<input id="leiNovaSigla" placeholder="ex.: Lavagem"></label><label>Link no planalto.gov.br<input id="leiNovaUrl" placeholder="https://www.planalto.gov.br/ccivil_03/leis/l9613.htm"></label></div><div class="actions" style="justify-content:flex-start"><button type="button" class="primary" id="leiNovaAdd">Adicionar</button></div></details>`;
  return h;
}
function htmlColarLei(l) {
  return `<div class="lei-colar"><p class="note"><b>Como colar:</b> 1) <a href="${esc(l.url)}" target="_blank" rel="noopener">abra a lei no site do Planalto</a>; 2) clique na página e aperte <b>Ctrl+A</b> e depois <b>Ctrl+C</b> (no celular: tocar e segurar › Selecionar tudo › Copiar); 3) clique no quadro abaixo e aperte <b>Ctrl+V</b> (ou tocar e segurar › Colar). O texto riscado (revogado) é removido sozinho.</p>
    <div class="lei-cola" id="leiCola" data-leiid="${l.id}" contenteditable="true" aria-label="Cole aqui o texto da lei"></div><div class="actions" style="justify-content:flex-start"><button type="button" class="mini" data-leicolarfechar="1">Cancelar</button></div></div>`;
}
function listaFiltrada(c) {
  const L = leis[c.lei]; if (!L) return [];
  const b = semAcentoEst(c.busca || "").trim(), mk = marcasLei();
  return L.artigos.filter(a => (!c.cap || a.cap.startsWith(c.cap)) && (!b || semAcentoEst(a.txt).includes(b)) && (!c.soDificeis || (mk[a.id] && mk[a.id].dif)));
}
function capitulosDe(L) { const s = new Set(); L.artigos.forEach(a => { const p = a.cap.split(" · "); for (let k = 1; k <= Math.min(p.length, 3); k++) s.add(p.slice(0, k).join(" · ")); }); return [...s]; }
function htmlLerLei() {
  const prontas = leisProntas();
  if (!prontas.length) return `<p class="note">Nenhuma lei baixada ainda. Vá em <b>Minhas leis</b> e baixe as que vai estudar.</p><div class="actions" style="justify-content:flex-start"><button type="button" class="primary" data-estaba="lei-leis">Minhas leis</button></div>`;
  const c = lerLeiCfg(); if (!leis[c.lei]) c.lei = prontas[0].id;
  const L = leis[c.lei], lista = listaFiltrada(c), mk = marcasLei(), chave = [c.lei, c.cap, c.busca, c.soDificeis ? 1 : 0].join("|");
  const pos = Math.min((c.pos || {})[chave] || 0, Math.max(0, lista.length - 1)), a = lista[pos];
  const revisados = L.artigos.filter(x => mk[x.id] && mk[x.id].rev).length, dificeis = L.artigos.filter(x => mk[x.id] && mk[x.id].dif).length;
  let h = `<div class="sim-grid"><label>Lei<select id="leiSel">${prontas.map(l => `<option value="${l.id}"${l.id === c.lei ? " selected" : ""}>${esc(l.nome)}</option>`).join("")}</select></label>
    <label>Parte da lei<select id="leiCap"><option value="">A lei inteira</option>${capitulosDe(L).map(x => `<option${x === c.cap ? " selected" : ""}>${esc(x.length > 110 ? x.slice(0, 110) + "…" : x)}</option>`).join("")}</select></label></div>
    <div class="lei-busca"><input id="leiBusca" type="search" placeholder="Buscar no texto (ex.: flagrante, prazo, 48 horas)" value="${esc(c.busca)}"><label class="chk"><input type="checkbox" id="leiSoDif"${c.soDificeis ? " checked" : ""}> só os difíceis (${dificeis})</label></div>
    <p class="note">${lista.length} artigo(s) · ${revisados} de ${L.artigos.length} revisados nesta lei${L.fonte === "colado" ? " · texto colado" : ""}</p>`;
  if (!a) return h + `<p class="note">Nada encontrado com esses filtros.</p>`;
  const m = mk[a.id] || {};
  h += `<div class="lei-art">${a.cap ? `<p class="note lei-cap">${esc(a.cap)}</p>` : ""}<p class="pre lei-txt">${destacar(a.txt, c.busca)}</p>
      <div class="lei-acoes"><button type="button" class="${m.rev ? "on " : ""}chip-sel" data-leimarca="rev">${m.rev ? "✓ Revisado" : "Marcar como revisado"}</button><button type="button" class="${m.dif ? "on " : ""}chip-sel" data-leimarca="dif">${m.dif ? "★ Difícil" : "☆ Difícil"}</button><button type="button" class="chip-sel" data-leipraticar="${esc(a.id)}">Praticar este artigo</button></div></div>
    <div class="actions"><button type="button" id="leiAnt" ${pos ? "" : "disabled"}>‹ Anterior</button><span class="note">${pos + 1} de ${lista.length}</span><button type="button" class="primary" id="leiProx" ${pos + 1 < lista.length ? "" : "disabled"}>Próximo ›</button></div>
    <div class="actions" style="justify-content:flex-start"><button type="button" class="link-x" id="leiPdf" style="color:var(--brand)">Gerar PDF para leitura (${lista.length} artigos destes filtros)</button></div>`;
  return h;
}
function destacar(t, b) { const e = esc(t); if (!b || b.trim().length < 2) return e; const re = new RegExp("(" + b.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi"); return e.replace(re, "<mark>$1</mark>"); }
function moverLei(d) { const c = lerLeiCfg(), chave = [c.lei, c.cap, c.busca, c.soDificeis ? 1 : 0].join("|"), n = listaFiltrada(c).length; c.pos = { ...(c.pos || {}), [chave]: Math.max(0, Math.min(n - 1, ((c.pos || {})[chave] || 0) + d)) }; gravarEst("leiRev", c); desenharEstudo("lei-ler"); $("estudoConteudo").scrollTop = 0; }
function imprimirLei() {
  const c = lerLeiCfg(), L = leis[c.lei]; if (!L) return;
  const lista = listaFiltrada(c); let cap = null, h = `<div class="pr-capa"><h1>${esc(L.meta.nome)}</h1><p>Texto vigente${L.fonte === "colado" ? "" : " (planalto.gov.br)"}, sem os dispositivos revogados · ${lista.length} artigos${c.cap ? " · " + esc(c.cap) : ""}${c.soDificeis ? " · só os marcados como difíceis" : ""}</p></div><div class="pr-lei">`;
  lista.forEach(a => { if (a.cap !== cap) { cap = a.cap; if (cap) h += `<h2 class="pr-lei-cap">${esc(cap)}</h2>`; } h += `<div class="pr-lei-art"><p class="pre">${esc(a.txt)}</p><div class="pr-lei-nota"></div></div>`; });
  $("impressao").innerHTML = h + "</div>"; setTimeout(() => window.print(), 80);
}

// ---------- praticar ----------
const MODOS_LEI = { ce: "Certo ou errado (troca de uma palavra, prazo ou exceção)", me: "Múltipla escolha", lacuna: "Complete a lacuna (prazo, quórum, pena…)" };
const lerLeiPrat = () => ({ leis: [], cap: "", modo: "ce", n: 10, so: "", onde: "app", banca: "Cebraspe", ...lerEst("leiPrat", {}) });
function htmlPrepLei() {
  const prontas = leisProntas(), c = lerLeiPrat();
  let h = htmlImpressasInfo("lei");
  if (!prontas.length) return h + `<p class="note">Baixe primeiro as leis em <b>Minhas leis</b>.</p><div class="actions" style="justify-content:flex-start"><button type="button" class="primary" data-estaba="lei-leis">Minhas leis</button></div>`;
  const sel = c.leis.filter(id => leis[id]); const usa = sel.length ? sel : [prontas[0].id];
  const caps = usa.length === 1 ? capitulosDe(leis[usa[0]]) : [];
  const chip = (attr, v, n, on) => `<button type="button" class="chip-sel${on ? " on" : ""}" data-${attr}="${esc(String(v))}">${n}</button>`;
  const base = artigosParaPraticar(c);
  h += `<div class="est-sec"><h4>Leis</h4><div class="est-chips">${prontas.map(l => chip("leipl", l.id, esc(l.sigla), usa.includes(l.id))).join("")}</div></div>
    ${caps.length ? `<div class="est-sec"><h4>Parte da lei</h4><select id="leiPratCap"><option value="">A lei inteira</option>${caps.map(x => `<option${x === c.cap ? " selected" : ""}>${esc(x.length > 110 ? x.slice(0, 110) + "…" : x)}</option>`).join("")}</select></div>` : ""}
    <div class="est-sec"><h4>Quais artigos</h4><div class="est-chips">${chip("leiso", "", "Todos", !c.so)}${chip("leiso", "dif", "Só os difíceis", c.so === "dif")}${chip("leiso", "rev", "Só os já revisados", c.so === "rev")}${chip("leiso", "nao", "Ainda não revisados", c.so === "nao")}</div></div>
    <div class="est-sec"><h4>Formato</h4><div class="est-opts">${Object.entries(MODOS_LEI).map(([k, n]) => `<button type="button" class="opt${c.modo === k ? " on" : ""}" data-leimodo="${k}">${n}</button>`).join("")}</div></div>
    <div class="est-sec"><h4>Banca</h4><select id="leiBanca">${(typeof bancasDisponiveis === "function" ? bancasDisponiveis() : ["Cebraspe", "FGV"]).map(b => `<option${b === c.banca ? " selected" : ""}>${esc(b)}</option>`).join("")}</select></div>
    <div class="est-sec"><h4>Quantidade de questões</h4><div class="est-chips">${[10, 20, 30, 50, 100].map(n => chip("leiqn", n, n, c.n === n)).join("")}</div></div>
    <div class="est-sec"><h4>Como responder</h4><div class="est-chips">${chip("leionde", "app", "No app", c.onde === "app")}${chip("leionde", "papel", "No papel (PDF para imprimir)", c.onde === "papel")}</div></div>
    <p class="note">Artigos que entram com esses filtros: <b>${base.length}</b>. As questões cobram a letra da lei, como fazem as bancas. ${c.onde === "papel" ? "Todas são criadas antes de abrir a impressão (de 5 em 5)." : "Elas vão sendo criadas enquanto você responde."}</p>
    <div class="actions"><button type="button" class="primary" id="leiComecar" ${papelInfo.gerando || !base.length ? "disabled" : ""}>${papelInfo.gerando ? `Criando: ${papelInfo.gerando.k} de ${papelInfo.gerando.n}…` : c.onde === "papel" ? "Gerar prova para imprimir" : "Começar"}</button></div>`;
  return h;
}
function artigosParaPraticar(c) {
  const prontas = leisProntas(), usa = c.leis.filter(id => leis[id]).length ? c.leis.filter(id => leis[id]) : prontas.length ? [prontas[0].id] : [];
  const mk = marcasLei();
  return usa.flatMap(id => leis[id].artigos.filter(a => (usa.length > 1 || !c.cap || a.cap.startsWith(c.cap)) && (!c.so || (c.so === "dif" ? mk[a.id] && mk[a.id].dif : c.so === "rev" ? mk[a.id] && mk[a.id].rev : !(mk[a.id] && mk[a.id].rev)))).map(a => objetoEstudo(leis[id].meta, a)));
}
// prioridade: revisões vencidas, nunca praticados, depois o resto (mesma regra dos julgados)
function escolherArtigos(base, n) {
  const prog = lerEst("prog", {}), hoje = hojeISO();
  const vencidos = embaralhar(base.filter(j => prog[j.id] && prog[j.id].prox && prog[j.id].prox <= hoje));
  const novos = embaralhar(base.filter(j => !prog[j.id] || !prog[j.id].prox));
  const resto = embaralhar(base.filter(j => prog[j.id] && prog[j.id].prox > hoje));
  return [...vencidos, ...novos, ...resto].slice(0, n);
}
function promptLei(js, modo, banca) {
  const fmt = modo === "ce" ? `{"assertiva": string, "gabarito": "C" ou "E", "comentario": string curto citando o artigo}` : `{"enunciado": string, "alternativas": [5 strings sem a letra], "gabarito": "A"|"B"|"C"|"D"|"E", "comentario": string curto citando o artigo}`;
  const regra = modo === "ce" ? "Itens de certo ou errado de LEI SECA: reproduza ou parafraseie de perto o dispositivo; sorteie certo ou errado (cerca de metade de cada); no errado, troque UM detalhe da letra da lei (prazo, número, quórum, sujeito, verbo como 'poderá'/'deverá', exceção, pena, competência), como fazem as bancas."
    : modo === "lacuna" ? "Questões de COMPLETAR A LACUNA: copie o trecho do dispositivo trocando a expressão-chave (prazo, número, quórum, pena, autoridade, condição) por '______'; as 5 alternativas são candidatas para a lacuna, só uma é a do texto legal."
    : "Questões de múltipla escolha de LEI SECA: alternativas que reproduzem dispositivos com pequenas alterações; só uma conforme a letra da lei.";
  return `Você é examinador da banca ${banca || "Cebraspe"} e elabora questões de LEI SECA (literalidade da lei), cobrando exatamente o texto vigente abaixo.\n\n` +
    js.map((j, k) => `=== DISPOSITIVO ${k + 1}: ${j.cit} ===\n${j.texto.slice(0, 3500)}`).join("\n\n") +
    `\n\n${regra} Crie ${js.length} questão(ões), UMA para cada dispositivo, na mesma ordem, usando SOMENTE o texto dado. Responda em JSON: {"questoes": [${fmt}, …]} com exatamente ${js.length} itens.`;
}
function geradorLei(lista, modo, banca) {
  const mapa = {}, md = modo === "ce" ? "ce" : "me";
  const um = async grupo => {
    let r = []; try { r = (await gemini(promptLei(grupo, modo, banca), { ms: 240000 })).questoes || []; } catch (e) { r = []; }
    return grupo.map((j, k) => {
      const q = r[k];
      if (md === "ce" && q && q.assertiva) return { tipo: "ce", ...q, gabarito: /^e/i.test(q.gabarito) ? "E" : "C", ia: true };
      if (md === "me" && q && q.enunciado && (q.alternativas || []).length >= 4) return { tipo: "me", ...q, gabarito: String(q.gabarito || "A").trim().charAt(0).toUpperCase(), alternativas: q.alternativas.map(a => String(a).replace(/^\s*\(?[A-E][).]\s*/, "")), ia: true };
      return questaoLocal(j, md);
    });
  };
  return j => {
    if (!mapa[j.id]) { const i = lista.indexOf(j), grupo = lista.slice(i, i + 5).filter(x => !mapa[x.id]); const pr = iaLigada() ? um(grupo) : Promise.resolve(grupo.map(x => questaoLocal(x, md))); grupo.forEach((x, k) => { mapa[x.id] = pr.then(r => r[k]); }); }
    return mapa[j.id];
  };
}
function comecarLei() {
  const c = lerLeiPrat(), base = artigosParaPraticar(c); if (!base.length) return;
  const lista = escolherArtigos(base, c.n), siglas = [...new Set(lista.map(j => j.trib))].join(", ");
  const nome = `Lei seca · ${siglas} · ${TITULO_MODO[c.modo] || c.modo} · ${lista.length} questões`;
  const gerador = geradorLei(lista, c.modo, c.banca);
  if (c.onde === "papel") { gerarProvaInfoPapel({ lista, modo: c.modo === "ce" ? "ce" : "me", gerador, nome, titulo: "Simulado de lei seca", subtitulo: siglas, lei: true }); return; }
  registrarSessaoInfo();
  estudo = { modo: c.modo === "ce" ? "ce" : "me", lista, i: 0, qs: {}, resp: {}, notas: [], gerador, lei: true, simulado: nome };
  prepararQuestao(0); desenharEstudo("lei-praticar"); $("estudoConteudo").scrollTop = 0;
}

// ---------- eventos ----------
document.addEventListener("click", e => {
  if (!e.target.closest("#estudoConteudo")) return;
  const t = e.target.closest("button"); if (!t) return;
  const d = t.dataset;
  if (d.leibaixar) { baixarLei(d.leibaixar, !!d.forcar); return; }
  if (d.leicolar) { leiUi.colar = leiUi.colar === d.leicolar ? null : d.leicolar; desenharEstudo(estudoAba); setTimeout(() => { const el = $("leiCola"); if (el) el.focus(); }, 50); return; }
  if (d.leicolarfechar) { leiUi.colar = null; desenharEstudo(estudoAba); return; }
  if (d.leiler) { const c = lerLeiCfg(); c.lei = d.leiler; c.cap = ""; c.busca = ""; gravarEst("leiRev", c); desenharEstudo("lei-ler"); return; }
  if (d.leiremover) { gravarEst("leisExtras", lerEst("leisExtras", []).filter(l => l.id !== d.leiremover)); desenharEstudo(estudoAba); return; }
  if (t.id === "leiNovaAdd") {
    const nome = $("leiNovaNome").value.trim(), url = $("leiNovaUrl").value.trim(), sigla = $("leiNovaSigla").value.trim() || nome.slice(0, 20);
    if (!nome || !/^https?:\/\/(www\.)?planalto\.gov\.br\//i.test(url)) { toast("Informe o nome e um link do planalto.gov.br."); return; }
    gravarEst("leisExtras", [...lerEst("leisExtras", []), { id: "x" + Date.now().toString(36), sigla, nome, url, extra: true }]); desenharEstudo(estudoAba); return;
  }
  if (t.id === "leiAnt") { moverLei(-1); return; }
  if (t.id === "leiProx") { moverLei(1); return; }
  if (t.id === "leiPdf") { imprimirLei(); return; }
  if (d.leimarca) {
    const c = lerLeiCfg(), lista = listaFiltrada(c), chave = [c.lei, c.cap, c.busca, c.soDificeis ? 1 : 0].join("|"), a = lista[Math.min((c.pos || {})[chave] || 0, lista.length - 1)]; if (!a) return;
    const mk = marcasLei(), m = mk[a.id] || {};
    if (d.leimarca === "rev") { if (m.rev) delete m.rev; else m.rev = hojeISO(); } else m.dif = !m.dif;
    mk[a.id] = m; gravarEst("leiMarc", mk);
    if (d.leimarca === "rev" && m.rev && !c.soDificeis) moverLei(1); else desenharEstudo("lei-ler");
    return;
  }
  if (d.leipraticar) { const j = artigoPorId(d.leipraticar); if (!j) return; registrarSessaoInfo(); const md = lerLeiPrat().modo; estudo = { modo: md === "ce" ? "ce" : "me", lista: [j], i: 0, qs: {}, resp: {}, notas: [], gerador: geradorLei([j], md, lerLeiPrat().banca), lei: true }; prepararQuestao(0); desenharEstudo("lei-praticar"); return; }
  const c = lerLeiPrat();
  if (d.leipl) { const prontas = leisProntas(), atual = c.leis.filter(id => leis[id]).length ? c.leis.filter(id => leis[id]) : [prontas[0].id]; c.leis = atual.includes(d.leipl) ? atual.filter(x => x !== d.leipl) : [...atual, d.leipl]; if (!c.leis.length) c.leis = [d.leipl]; c.cap = ""; gravarEst("leiPrat", c); desenharEstudo("lei-praticar"); return; }
  if (d.leiso !== undefined && t.closest(".est-chips")) { c.so = d.leiso; gravarEst("leiPrat", c); desenharEstudo("lei-praticar"); return; }
  if (d.leimodo) { c.modo = d.leimodo; gravarEst("leiPrat", c); desenharEstudo("lei-praticar"); return; }
  if (d.leiqn) { c.n = +d.leiqn; gravarEst("leiPrat", c); desenharEstudo("lei-praticar"); return; }
  if (d.leionde) { c.onde = d.leionde; gravarEst("leiPrat", c); desenharEstudo("lei-praticar"); return; }
  if (t.id === "leiComecar") { comecarLei(); return; }
});
document.addEventListener("change", e => {
  const id = e.target.id;
  if (id === "leiSel" || id === "leiCap" || id === "leiSoDif") { const c = lerLeiCfg(); if (id === "leiSel") { c.lei = e.target.value; c.cap = ""; } else if (id === "leiCap") c.cap = e.target.value; else c.soDificeis = e.target.checked; gravarEst("leiRev", c); desenharEstudo("lei-ler"); }
  if (id === "leiPratCap" || id === "leiBanca") { const c = lerLeiPrat(); c[id === "leiPratCap" ? "cap" : "banca"] = e.target.value; gravarEst("leiPrat", c); desenharEstudo("lei-praticar"); }
});
let leiBuscaT = null;
document.addEventListener("input", e => {
  if (e.target.id === "leiBusca") { clearTimeout(leiBuscaT); const v = e.target.value; leiBuscaT = setTimeout(() => { const c = lerLeiCfg(); c.busca = v; gravarEst("leiRev", c); desenharEstudo("lei-ler"); const el = $("leiBusca"); if (el) { el.focus(); el.setSelectionRange(v.length, v.length); } }, 400); }
});
// colar: a área de transferência traz o HTML da página (com o riscado), que o app limpa
document.addEventListener("paste", e => {
  const el = e.target.closest && e.target.closest("#leiCola"); if (!el) return;
  e.preventDefault();
  const dt = e.clipboardData, html = dt.getData("text/html") || esc(dt.getData("text/plain")).replace(/\n/g, "<br>");
  el.textContent = "Lendo o texto colado…"; colarLei(el.dataset.leiid, html);
});
