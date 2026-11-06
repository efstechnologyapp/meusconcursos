// Lei seca: texto vigente das leis do Planalto, leitura artigo por artigo com revisão, questões da letra da lei
// (no app ou no papel) e PDF da lei limpa. O Apps Script baixa a página no planalto.gov.br; se o site recusar,
// o usuário cola o texto copiado da página (o app recebe a formatação e tira o que está riscado = revogado).

const LEIS_PADRAO = [
  { id: "cf", materia: "Constitucional", sigla: "CF", nome: "Constituição Federal", url: "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm" },
  { id: "cp", materia: "Penal", sigla: "CP", nome: "Código Penal", url: "https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848compilado.htm" },
  { id: "cpp", materia: "Processo Penal", sigla: "CPP", nome: "Código de Processo Penal", url: "https://www.planalto.gov.br/ccivil_03/decreto-lei/del3689compilado.htm" },
  { id: "cc", materia: "Civil", sigla: "CC", nome: "Código Civil", url: "https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm" },
  { id: "cpc", materia: "Processo Civil", sigla: "CPC", nome: "Código de Processo Civil", url: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm" },
  { id: "lep", materia: "Execução Penal", sigla: "LEP", nome: "Lei de Execução Penal (Lei 7.210/1984)", url: "https://www.planalto.gov.br/ccivil_03/leis/l7210.htm" },
  { id: "drogas", materia: "Penal", sigla: "Lei de Drogas", nome: "Lei de Drogas (Lei 11.343/2006)", url: "https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2006/lei/l11343.htm" },
  { id: "eca", materia: "Criança e Adolescente", sigla: "ECA", nome: "Estatuto da Criança e do Adolescente (Lei 8.069/1990)", url: "https://www.planalto.gov.br/ccivil_03/leis/l8069.htm" },
  { id: "mariapenha", materia: "Penal", sigla: "Maria da Penha", nome: "Lei Maria da Penha (Lei 11.340/2006)", url: "https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2006/lei/l11340.htm" },
  { id: "improbidade", materia: "Administrativo", sigla: "LIA", nome: "Lei de Improbidade Administrativa (Lei 8.429/1992)", url: "https://www.planalto.gov.br/ccivil_03/leis/l8429.htm" },
  { id: "abuso", materia: "Penal", sigla: "Abuso de Autoridade", nome: "Lei de Abuso de Autoridade (Lei 13.869/2019)", url: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2019/lei/l13869.htm" },
  { id: "orcrim", materia: "Penal", sigla: "Org. Criminosas", nome: "Lei das Organizações Criminosas (Lei 12.850/2013)", url: "https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/lei/l12850.htm" },
  { id: "intercept", materia: "Processo Penal", sigla: "Interceptação", nome: "Lei de Interceptação Telefônica (Lei 9.296/1996)", url: "https://www.planalto.gov.br/ccivil_03/leis/l9296.htm" },
  { id: "ce", materia: "Eleitoral", sigla: "Cód. Eleitoral", nome: "Código Eleitoral (Lei 4.737/1965)", url: "https://www.planalto.gov.br/ccivil_03/leis/l4737compilado.htm" }
];
let leis = {};          // id -> { meta, artigos: [{ id, rot, txt, cap }], quando, fonte }
let leiUi = { baixando: {}, colar: null, msg: {} };
const MATERIAS_LEI = ["Constitucional", "Penal", "Processo Penal", "Execução Penal", "Civil", "Processo Civil", "Consumidor", "Criança e Adolescente", "Administrativo", "Eleitoral", "Tributário", "Empresarial", "Ambiental", "Financeiro", "Orçamentário", "Direitos Humanos", "Digital", "Humanística", "Institucional", "Trabalho", "Outras"];
const MATERIAS_SEMPRE = ["Financeiro", "Orçamentário", "Direitos Humanos", "Digital", "Humanística"];   // balões que aparecem mesmo sem lei
let leiMatUser = null;   // matéria escolhida pelo usuário (sobrepõe a do catálogo/edital)
const materiaDe = l => (leiMatUser = leiMatUser || lerEst("leiMatUser", {}))[l.id] || l.materia || "Outras";
// do que trata a lei: a ementa oficial (tirada do texto baixado) ou, antes de baixar, um resumo pela IA
const ementaDe = l => (lerEst("leiEmenta", {})[l.id] || {}).txt || "";
const RE_EMENTA = /^(Disp[õo]e|Institui|Estabelece|Regulamenta|Regula|Define|Altera|Cria|Aprova|Trata|Organiza|Torna|Codifica|Consolida|Introduz|Acrescenta|Modifica)\b/i;
async function buscarEmentasIA() {
  if (leiUi.ementaPedida || typeof iaLigada !== "function" || !iaLigada()) return;
  const em = lerEst("leiEmenta", {}), faltam = leiCatalogo().filter(l => !em[l.id]);
  if (!faltam.length) return;
  leiUi.ementaPedida = true;
  try {
    const r = await gemini(`Para cada lei brasileira abaixo, escreva em uma frase curta (até 18 palavras) do que ela trata, seguindo a ementa oficial da lei (ex.: "Dispõe sobre normas gerais de contratação de consórcios públicos"). Não invente: se não souber, deixe vazio.\n${faltam.map(l => `${l.id}: ${l.nome}`).join("\n")}\nResponda só com JSON: {"ementas":{"<id>":"<frase>"}}`);
    const e2 = lerEst("leiEmenta", {});
    Object.entries((r && r.ementas) || {}).forEach(([id, t]) => { if (t && !e2[id] && faltam.some(l => l.id === id)) e2[id] = { txt: String(t).trim().replace(/\.$/, ""), fonte: "ia" }; });
    gravarEst("leiEmenta", e2); if (estudoAba === "lei-leis") desenharEstudo("lei-leis");
  } catch (e) { console.warn("ementas", e); }
}
const materiasUsadas = lista => MATERIAS_LEI.filter(m => lista.some(l => materiaDe(l) === m));
// select de leis agrupado por matéria
const optsLeis = (lista, atual) => materiasUsadas(lista).map(m => `<optgroup label="${esc(m)}">${lista.filter(l => materiaDe(l) === m).map(l => `<option value="${l.id}"${l.id === atual ? " selected" : ""}>${esc(l.nome)}</option>`).join("")}</optgroup>`).join("");
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
  const arts = []; let cap = [], atual = null, comecou = false, espera = "", ementa = "";
  for (const l of linhas) {
    if (/^(Bras[íi]lia,|Este texto n[ãa]o substitui|Rio de Janeiro,\s*\d)/i.test(l) && comecou) { atual = null; espera = "fim"; continue; }
    if (espera === "fim") continue;
    if (!comecou && !ementa && RE_EMENTA.test(l) && l.length < 600) ementa = l.replace(/\.$/, "");
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
  const r = arts.filter(a => a.txt.replace(a.rot, "").replace(/[\s.()–-]|revogad[oa]|vetad[oa]/gi, "").length > 3);
  r.ementa = ementa; return r;
}

// ---------- guardar / carregar ----------
async function guardarLei(meta, html, info) {
  // id estável: rótulo do artigo + ordem entre os de mesmo rótulo (a CF repete "Art. 1º" no ADCT)
  const brutos = artigosDoHtml(html);
  if (brutos.ementa) { const em = lerEst("leiEmenta", {}); em[meta.id] = { txt: brutos.ementa, fonte: "lei" }; gravarEst("leiEmenta", em); }
  const artigos = comIds(meta.id, brutos);
  if (artigos.length < 3) throw new Error("não encontrei artigos nesse texto");
  const reg = { meta, artigos, quando: info.quando || new Date().toISOString(), fonte: info.fonte || "" };
  await arq("gravar", "lei:" + meta.id, reg).catch(() => {});
  leis[meta.id] = reg;
  const idx = lerEst("leisBaixadas", {}); idx[meta.id] = { n: artigos.length, quando: reg.quando, fonte: reg.fonte }; gravarEst("leisBaixadas", idx);
  if (!info.daNuvem) enviarTextoLei(meta.id, reg);
  return reg;
}
function comIds(id, arts) { const vistos = {}; return arts.map(a => { const r = a.rot.replace(/\W+/g, ""); vistos[r] = (vistos[r] || 0) + 1; return { ...a, id: `lei:${id}:${r}${vistos[r] > 1 ? "_" + vistos[r] : ""}` }; }); }
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
    const r = await postLongo({ acao: "lei", url: meta.url, alternativas: meta.alts || [], forcar: !!forcar }, 240000);
    if (r.ok && r.url && r.url !== meta.url && meta.extra) gravarEst("leisExtras", lerEst("leisExtras", []).map(l => l.id === meta.id ? { ...l, url: r.url } : l));   // guarda o endereço que funcionou
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
    toast(`${meta.sigla}: ${reg.artigos.length} artigos prontos.`);
  } catch (e) { leiUi.msg[id] = "Não reconheci a lei no texto colado: " + e.message + ". Copie a página inteira (Ctrl+A, Ctrl+C)."; }
  desenharEstudo(estudoAba);
}

// ---------- mesma lista de leis em qualquer aparelho ----------
// A lista (leis adicionadas e removidas, matéria escolhida, resumos, marcas) vai pela sincronização geral do estudo
// (sincronia.js). Aqui fica só o texto de cada lei já separado em artigos, na pasta do usuário (leis/lei_<id>.json.gz).
let leiNuvem = { textos: null, rodando: false };
// formato enxuto para a nuvem: sem ids (refeitos aqui), sem os dados da lei (já estão na lista) e com cada título guardado uma vez só; o servidor ainda compacta (gzip)
function empacotarLei(reg) { const caps = [], pos = {}; return { q: reg.quando, f: reg.fonte, c: caps, a: reg.artigos.map(a => { if (!(a.cap in pos)) { pos[a.cap] = caps.length; caps.push(a.cap); } return [a.rot, a.txt, pos[a.cap]]; }) }; }
function desempacotarLei(id, p) { const meta = leiCatalogo().find(l => l.id === id); return { meta, quando: p.q, fonte: p.f, artigos: comIds(id, p.a.map(([rot, txt, c]) => ({ rot, txt, cap: p.c[c] || "" }))) }; }
async function enviarTextoLei(id, reg) {
  if (!usuarioAtual || !usuarioAtual.sessao) return;
  try { const r = await postLongo({ acao: "leiTextoSalvar", id, lei: empacotarLei(reg) }, 240000); if (r.ok && leiNuvem.textos && !leiNuvem.textos.includes(id)) leiNuvem.textos.push(id); } catch (e) { console.warn("lei nuvem", e); }
}
// chamada pela sincronização geral com a lista de textos que estão na nuvem
async function sincronizarTextosLeis(textos) {
  if (leiNuvem.rodando || !Array.isArray(textos)) return;
  leiNuvem.rodando = true; leiNuvem.textos = textos.slice();
  try {
    await carregarLeisLocais();
    // textos que só este aparelho tem sobem; os que só a nuvem tem descem
    const idx = lerEst("leisBaixadas", {});
    for (const id of Object.keys(idx)) if (leis[id] && !leiNuvem.textos.includes(id)) await enviarTextoLei(id, leis[id]);
    let mudou = false;
    for (const id of leiNuvem.textos) {
      if (leis[id] || !leiCatalogo().some(l => l.id === id)) continue;
      leiUi.baixando[id] = true; if (String(estudoAba).startsWith("lei")) desenharEstudo(estudoAba);
      try {
        const t = await postLongo({ acao: "leiTexto", id }, 240000);
        if (t.ok && t.lei && t.lei.a) {
          const reg = desempacotarLei(id, t.lei); await arq("gravar", "lei:" + id, reg).catch(() => {}); leis[id] = reg; mudou = true;
          const ix = lerEst("leisBaixadas", {}); ix[id] = { n: reg.artigos.length, quando: reg.quando, fonte: reg.fonte }; gravarEst("leisBaixadas", ix);
        }
      } catch (e) { console.warn("lei", id, e); }
      delete leiUi.baixando[id];
    }
    if (mudou && String(estudoAba).startsWith("lei") && ($("dlgEstudo") || {}).open) desenharEstudo(estudoAba);
    if (mudou && typeof renderEstudoPagina === "function") renderEstudoPagina();
  } catch (e) { console.warn("textos das leis", e); }
  leiNuvem.rodando = false;
}
const sincronizarLeis = () => typeof sincronizarEstudo === "function" ? sincronizarEstudo() : Promise.resolve();

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
  if (!leiUi.editaisLidos) { leiUi.editaisLidos = true; setTimeout(async () => { await sincronizarLeis(); await procurarLeisNosEditais(); buscarEmentasIA(); }, 0); }   // inclui na lista as leis citadas nos editais
  const fm = lerEst("leiMat", ""), cat = leiCatalogo();
  let h = `<div class="est-chips lei-mats"><button type="button" class="chip-sel${!fm ? " on" : ""}" data-leimat="">Todas</button>${MATERIAS_LEI.filter(m => m !== "Outras" || materiasUsadas(cat).includes(m)).map(m => `<button type="button" class="chip-sel${fm === m ? " on" : ""}" data-leimat="${esc(m)}">${esc(m)} <span class="ct">${cat.filter(l => materiaDe(l) === m).length}</span></button>`).join("")}</div>
    <p class="note">Baixe as leis que você vai estudar. O app pega o texto vigente no site do Planalto, tira o que está revogado (riscado no site) e separa os artigos. Fica guardado neste aparelho e na nuvem do app.</p>`;
  h += cat.filter(l => !fm || materiaDe(l) === fm).map(l => {
    const b = idx[l.id], ok = !!leis[l.id] || !!b, d = b && new Date(b.quando);
    return `<div class="lei-item"><div class="lei-tit"><span><b>${esc(l.nome)}</b>${ementaDe(l) ? `<span class="lei-ementa"> — ${esc(ementaDe(l))}</span>` : ""}</span><span class="note"><select class="lei-matsel" data-leimatsel="${l.id}" title="Mudar a matéria desta lei">${MATERIAS_LEI.map(m => `<option${m === materiaDe(l) ? " selected" : ""}>${esc(m)}</option>`).join("")}</select> ${ok ? `✓ ${b ? b.n : leis[l.id].artigos.length} artigos · ${b && b.fonte === "colado" ? "texto colado" : "do Planalto"}${d && !isNaN(d) ? " em " + d.toLocaleDateString("pt-BR") : ""}` : "ainda não baixada"}${leiUi.msg[l.id] ? ` · <span class="lei-msg">${esc(leiUi.msg[l.id])}</span>` : ""}</span></div>
      <div class="prov-acoes">${leiUi.baixando[l.id] ? `<span class="note est-gerando">Baixando do Planalto…</span>` : `${ok ? `<button type="button" class="primary" data-leiler="${l.id}">Ler</button><button type="button" data-leibaixar="${l.id}" data-forcar="1">Atualizar</button>` : `<button type="button" class="primary" data-leibaixar="${l.id}">Baixar do Planalto</button>`}<button type="button" data-leicolar="${l.id}">Colar o texto</button>${l.extra ? `<button type="button" class="link-x" data-leiremover="${l.id}">remover</button>` : ""}`}</div>
      ${leiUi.colar === l.id ? htmlColarLei(l) : ""}</div>`;
  }).join("");
  if (fm && !cat.some(l => materiaDe(l) === fm)) h += `<p class="note" style="text-align:center;padding:16px 0">Nenhuma lei em ${esc(fm)} ainda. Para trazer uma lei para cá, escolha esta matéria na listinha do cartão da lei, ou adicione uma lei nova abaixo.</p>`;
  h += `<details class="est-det"><summary>+ Adicionar outra lei</summary><div class="env-grid"><label class="env-l2">Nome<input id="leiNovaNome" placeholder="ex.: Lei de Lavagem de Dinheiro (Lei 9.613/1998)"></label><label>Sigla curta<input id="leiNovaSigla" placeholder="ex.: Lavagem"></label><label>Matéria<select id="leiNovaMat">${MATERIAS_LEI.map(m => `<option>${esc(m)}</option>`).join("")}</select></label><label>Link no planalto.gov.br<input id="leiNovaUrl" placeholder="https://www.planalto.gov.br/ccivil_03/leis/l9613.htm"></label></div><div class="actions" style="justify-content:flex-start"><button type="button" class="primary" id="leiNovaAdd">Adicionar</button></div></details>`;
  return h;
}
function htmlColarLei(l) {
  return `<div class="lei-colar"><p class="note"><b>Como colar:</b> 1) <a href="${esc(l.url)}" target="_blank" rel="noopener">abra a lei no site do Planalto</a>; 2) clique na página e aperte <b>Ctrl+A</b> e depois <b>Ctrl+C</b> (no celular: tocar e segurar › Selecionar tudo › Copiar); 3) clique no quadro abaixo e aperte <b>Ctrl+V</b> (ou tocar e segurar › Colar). O texto riscado (revogado) é removido sozinho.</p>
    <div class="lei-cola" id="leiCola" data-leiid="${l.id}" contenteditable="true" aria-label="Cole aqui o texto da lei"></div><div class="actions" style="justify-content:flex-start"><button type="button" class="primary" data-leicolaragora="${l.id}">Colar o que copiei</button><button type="button" class="mini" data-leicolarfechar="1">Cancelar</button></div></div>`;
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
  let h = `<div class="sim-grid"><label>Lei<select id="leiSel">${optsLeis(prontas, c.lei)}</select></label>
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
  h += `<div class="est-sec"><h4>Leis <span class="note">(toque na matéria para marcar todas as leis dela)</span></h4>${materiasUsadas(prontas).map(m => { const ls = prontas.filter(l => materiaDe(l) === m), todas = ls.every(l => usa.includes(l.id)); return `<div class="lei-mat-linha"><button type="button" class="chip-sel mat${todas ? " on" : ""}" data-leiplmat="${esc(m)}">${esc(m)}</button>${ls.map(l => chip("leipl", l.id, esc(l.sigla), usa.includes(l.id))).join("")}</div>`; }).join("")}</div>
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

// ---------- leis citadas nos editais dos concursos cadastrados ----------
// número/ano -> [sigla, nome, matéria, id do catálogo (quando já está na lista padrão)]
const LEIS_CONHECIDAS = {
  "lei:7210:1984": ["LEP", "Lei de Execução Penal", "Execução Penal", "lep"], "lei:8069:1990": ["ECA", "Estatuto da Criança e do Adolescente", "Criança e Adolescente", "eca"],
  "lei:11343:2006": ["Lei de Drogas", "Lei de Drogas", "Penal", "drogas"], "lei:11340:2006": ["Maria da Penha", "Lei Maria da Penha", "Penal", "mariapenha"],
  "lei:8429:1992": ["LIA", "Lei de Improbidade Administrativa", "Administrativo", "improbidade"], "lei:13869:2019": ["Abuso de Autoridade", "Lei de Abuso de Autoridade", "Penal", "abuso"],
  "lei:12850:2013": ["Org. Criminosas", "Lei das Organizações Criminosas", "Penal", "orcrim"], "lei:9296:1996": ["Interceptação", "Lei de Interceptação Telefônica", "Processo Penal", "intercept"],
  "lei:4737:1965": ["Cód. Eleitoral", "Código Eleitoral", "Eleitoral", "ce"], "lei:10406:2002": ["CC", "Código Civil", "Civil", "cc"], "lei:13105:2015": ["CPC", "Código de Processo Civil", "Processo Civil", "cpc"],
  "dl:2848:1940": ["CP", "Código Penal", "Penal", "cp"], "dl:3689:1941": ["CPP", "Código de Processo Penal", "Processo Penal", "cpp"],
  "lei:8072:1990": ["Hediondos", "Lei dos Crimes Hediondos", "Penal"], "lei:8078:1990": ["CDC", "Código de Defesa do Consumidor", "Consumidor"],
  "lei:8112:1990": ["Servidores", "Regime Jurídico dos Servidores Públicos Federais", "Administrativo"], "lei:14133:2021": ["Licitações", "Lei de Licitações e Contratos", "Administrativo"],
  "lei:8666:1993": ["Licitações (antiga)", "Lei 8.666/1993 (licitações)", "Administrativo"], "lei:9099:1995": ["Juizados", "Lei dos Juizados Especiais", "Processo Civil"],
  "lei:9455:1997": ["Tortura", "Lei de Tortura", "Penal"], "lei:9503:1997": ["CTB", "Código de Trânsito Brasileiro", "Penal"], "lei:9605:1998": ["Crimes Ambientais", "Lei de Crimes Ambientais", "Ambiental"],
  "lei:9613:1998": ["Lavagem", "Lei de Lavagem de Dinheiro", "Penal"], "lei:9784:1999": ["Proc. Administrativo", "Lei do Processo Administrativo", "Administrativo"],
  "lei:9868:1999": ["ADI/ADC", "Lei da ADI e da ADC", "Constitucional"], "lei:9882:1999": ["ADPF", "Lei da ADPF", "Constitucional"], "lei:10741:2003": ["Pessoa Idosa", "Estatuto da Pessoa Idosa", "Civil"],
  "lei:10826:2003": ["Desarmamento", "Estatuto do Desarmamento", "Penal"], "lei:12016:2009": ["Mandado de Segurança", "Lei do Mandado de Segurança", "Processo Civil"],
  "lei:12037:2009": ["Identificação Criminal", "Lei de Identificação Criminal", "Processo Penal"], "lei:12153:2009": ["Juizados Fazenda", "Juizados Especiais da Fazenda Pública", "Processo Civil"],
  "lei:13146:2015": ["Pessoa com Deficiência", "Estatuto da Pessoa com Deficiência", "Civil"], "lei:13964:2019": ["Pacote Anticrime", "Pacote Anticrime", "Penal"],
  "lei:7347:1985": ["Ação Civil Pública", "Lei da Ação Civil Pública", "Processo Civil"], "lei:4717:1965": ["Ação Popular", "Lei da Ação Popular", "Processo Civil"],
  "lei:6830:1980": ["Execução Fiscal", "Lei de Execução Fiscal", "Tributário"], "lei:5172:1966": ["CTN", "Código Tributário Nacional", "Tributário"],
  "lei:9504:1997": ["Lei das Eleições", "Lei das Eleições", "Eleitoral"], "lei:9096:1995": ["Partidos", "Lei dos Partidos Políticos", "Eleitoral"],
  "lc:64:1990": ["Inelegibilidades", "Lei das Inelegibilidades (LC 64/1990)", "Eleitoral"], "lc:35:1979": ["LOMAN", "Lei Orgânica da Magistratura Nacional (LC 35/1979)", "Institucional"],
  "lc:101:2000": ["LRF", "Lei de Responsabilidade Fiscal (LC 101/2000)", "Financeiro"], "lei:4320:1964": ["Lei 4.320", "Normas Gerais de Direito Financeiro (Lei 4.320/1964)", "Orçamentário"], "lei:12965:2014": ["Marco Civil", "Marco Civil da Internet", "Digital"], "lei:12737:2012": ["Carolina Dieckmann", "Lei Carolina Dieckmann (crimes informáticos)", "Digital"], "dec:678:1992": ["Pacto de San José", "Convenção Americana sobre Direitos Humanos (Decreto 678/1992)", "Direitos Humanos"], "lei:13709:2018": ["LGPD", "Lei Geral de Proteção de Dados", "Digital"],
  "lei:12527:2011": ["LAI", "Lei de Acesso à Informação", "Administrativo"], "lei:12846:2013": ["Anticorrupção", "Lei Anticorrupção", "Administrativo"],
  "lei:8137:1990": ["Crimes Tributários", "Crimes contra a Ordem Tributária", "Penal"], "lei:7716:1989": ["Racismo", "Lei dos Crimes de Racismo", "Penal"],
  "lei:11101:2005": ["Falências", "Lei de Falências e Recuperação", "Empresarial"], "lei:6015:1973": ["Registros Públicos", "Lei de Registros Públicos", "Civil"],
  "lei:8245:1991": ["Locações", "Lei de Locações", "Civil"], "lei:9307:1996": ["Arbitragem", "Lei de Arbitragem", "Processo Civil"],
  "dl:4657:1942": ["LINDB", "Lei de Introdução às Normas do Direito Brasileiro", "Civil"], "dl:3688:1941": ["Contravenções", "Lei das Contravenções Penais", "Penal"],
  "dl:201:1967": ["DL 201", "Crimes de Responsabilidade de Prefeitos (DL 201/1967)", "Penal"], "lei:8038:1990": ["Lei 8.038", "Processos no STF e no STJ (Lei 8.038/1990)", "Processo Penal"],
  "lei:9714:1998": ["Penas Alternativas", "Penas Restritivas de Direitos (Lei 9.714/1998)", "Penal"], "lei:7960:1989": ["Prisão Temporária", "Lei da Prisão Temporária", "Processo Penal"],
  "lei:12830:2013": ["Investigação Criminal", "Investigação Criminal pelo Delegado (Lei 12.830/2013)", "Processo Penal"], "lei:13431:2017": ["Depoimento Especial", "Escuta e Depoimento Especial (Lei 13.431/2017)", "Processo Penal"],
  "lei:11079:2004": ["PPP", "Lei das Parcerias Público-Privadas", "Administrativo"], "lei:8987:1995": ["Concessões", "Lei de Concessões", "Administrativo"],
  "lei:6938:1981": ["PNMA", "Política Nacional do Meio Ambiente", "Ambiental"], "lei:12651:2012": ["Código Florestal", "Código Florestal", "Ambiental"]
};
// nomes que aparecem no edital sem o número
const NOMES_LEIS = [
  [/constitui[çc][ãa]o (federal|da rep[úu]blica)/i, "cf"], [/c[óo]digo de processo penal/i, "dl:3689:1941"], [/c[óo]digo penal(?! militar)/i, "dl:2848:1940"],
  [/c[óo]digo de processo civil/i, "lei:13105:2015"], [/c[óo]digo civil/i, "lei:10406:2002"], [/c[óo]digo eleitoral/i, "lei:4737:1965"], [/c[óo]digo de defesa do consumidor/i, "lei:8078:1990"],
  [/c[óo]digo tribut[áa]rio nacional/i, "lei:5172:1966"], [/estatuto da crian[çc]a e do adolescente/i, "lei:8069:1990"], [/lei de execu[çc][ãa]o penal/i, "lei:7210:1984"],
  [/lei maria da penha/i, "lei:11340:2006"], [/lei de drogas|lei antidrogas/i, "lei:11343:2006"], [/lei de improbidade/i, "lei:8429:1992"], [/lei org[âa]nica da magistratura/i, "lc:35:1979"],
  [/c[óo]digo de tr[âa]nsito/i, "lei:9503:1997"], [/estatuto do desarmamento/i, "lei:10826:2003"], [/lei de introdu[çc][ãa]o [àa]s normas/i, "dl:4657:1942"]
];
const RE_LEI_NUM = /\b(lei\s+complementar|lei|decreto[\s-]+lei|decreto)\s+(?:federal\s+)?(?:n[º°o.]*\s*|n[úu]mero\s+)?(\d{1,2}(?:\.\d{3})+|\d{1,5})(?:\s*[,/]\s*(?:de\s+\d{1,2}(?:º|°)?\s+de\s+[a-zç]+\s+de\s+)?|\s+de\s+\d{1,2}(?:º|°)?\s+de\s+[a-zç]+\s+de\s+|\s*\/\s*)(\d{4}|\d{2})\b/gi;
function chaveLei(tipo, num, ano) {
  const t = /complementar/i.test(tipo) ? "lc" : /decreto[\s-]+lei/i.test(tipo) ? "dl" : /decreto/i.test(tipo) ? "dec" : "lei";
  let a = +ano; if (a < 100) a += a > 30 ? 1900 : 2000;
  return `${t}:${String(num).replace(/\D/g, "")}:${a}`;
}
// endereço no Planalto pelo padrão de pastas do site (com variações "compilado"/"compilada")
function urlsPlanalto(k) {
  const [t, n, a] = k.split(":"), ano = +a, B = "https://www.planalto.gov.br/ccivil_03/";
  const faixa = [[2004, 2006], [2007, 2010], [2011, 2014], [2015, 2018], [2019, 2022], [2023, 2026], [2027, 2030]].find(([i, f]) => ano >= i && ano <= f);
  let base;
  if (t === "lc") base = `${B}leis/lcp/lcp${n}.htm`;
  else if (t === "dl") base = `${B}decreto-lei/del${n}.htm`;
  else if (t === "dec") base = ano <= 2000 ? `${B}decreto/d${n}.htm` : ano <= 2003 ? `${B}decreto/${ano}/d${n}.htm` : `${B}_ato${faixa[0]}-${faixa[1]}/${ano}/decreto/d${n}.htm`;
  else base = ano <= 2000 ? `${B}leis/l${n}.htm` : ano <= 2003 ? `${B}leis/${ano}/l${n}.htm` : `${B}_ato${faixa[0]}-${faixa[1]}/${ano}/lei/l${n}.htm`;
  return [base.replace(/\.htm$/, "compilado.htm"), base.replace(/\.htm$/, "compilada.htm"), base];
}
// matéria pela seção do edital onde a lei aparece ("DIREITO PROCESSUAL PENAL: … Lei nº 9.296/1996 …")
function materiaPeloContexto(trecho) {
  const t = semAcentoEst(trecho), achados = [...t.matchAll(/(direito|nocoes de direito)\s+(processual\s+(penal|civil)|penal|civil|constitucional|administrativo|eleitoral|tributario|empresarial|comercial|ambiental|do consumidor|da crianca|financeiro|do trabalho|processual do trabalho|digital|orcamentario)|direitos humanos|orcamento publico|formacao humanistica|humanistica|execucao penal|legislacao (penal|criminal) especial/g)];
  if (!achados.length) return "";
  const u = achados[achados.length - 1][0];
  return /processual penal/.test(u) ? "Processo Penal" : /processual civil/.test(u) ? "Processo Civil" : /penal|criminal/.test(u) ? (/execucao/.test(u) ? "Execução Penal" : "Penal") : /civil/.test(u) ? "Civil" : /constitucional/.test(u) ? "Constitucional"
    : /direitos humanos/.test(u) ? "Direitos Humanos" : /humanistica/.test(u) ? "Humanística" : /orcament/.test(u) ? "Orçamentário" : /financeiro/.test(u) ? "Financeiro" : /digital/.test(u) ? "Digital" : /administrativo/.test(u) ? "Administrativo" : /eleitoral/.test(u) ? "Eleitoral" : /tributario/.test(u) ? "Tributário" : /empresarial|comercial/.test(u) ? "Empresarial" : /ambiental/.test(u) ? "Ambiental" : /consumidor/.test(u) ? "Consumidor" : /crianca/.test(u) ? "Criança e Adolescente" : /trabalho/.test(u) ? "Trabalho" : "";
}
function leisDoTexto(texto) {
  const achadas = {};
  const soma = (k, pos, rotulo) => { const a = achadas[k] = achadas[k] || { k, n: 0, rotulo, mats: {} }; a.n++; const m = materiaPeloContexto(texto.slice(Math.max(0, pos - 3000), pos)); if (m) a.mats[m] = (a.mats[m] || 0) + 1; };
  for (const m of texto.matchAll(RE_LEI_NUM)) { const k = chaveLei(m[1], m[2], m[3]); if (+k.split(":")[2] < 1850 || +k.split(":")[2] > new Date().getFullYear() + 1) continue; soma(k, m.index, m[0].replace(/\s+/g, " ").trim()); }
  for (const [re, k] of NOMES_LEIS) { const g = new RegExp(re.source, "gi"); for (const m of texto.matchAll(g)) soma(k, m.index, m[0]); }
  return achadas;
}
function metaDaChave(k, a) {
  if (k === "cf") return LEIS_PADRAO.find(l => l.id === "cf");
  const conhecida = LEIS_CONHECIDAS[k];
  if (conhecida && conhecida[3]) return LEIS_PADRAO.find(l => l.id === conhecida[3]);
  const [t, n, ano] = k.split(":"), num = n.length > 3 ? n.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : n;
  const tipo = { lc: "Lei Complementar", dl: "Decreto-Lei", dec: "Decreto", lei: "Lei" }[t];
  const mat = conhecida ? conhecida[2] : (Object.entries(a.mats || {}).sort((x, y) => y[1] - x[1])[0] || ["Outras"])[0];
  const urls = urlsPlanalto(k);
  return { id: "e-" + k.replace(/:/g, "-"), sigla: conhecida ? conhecida[0] : `${tipo === "Lei" ? "Lei" : tipo === "Lei Complementar" ? "LC" : tipo === "Decreto-Lei" ? "DL" : "Dec."} ${num}/${ano}`,
    nome: conhecida ? (/\d\/\d{4}/.test(conhecida[1]) ? conhecida[1] : `${conhecida[1]} (${tipo} ${num}/${ano})`) : `${tipo} nº ${num}/${ano}`, materia: mat, url: urls[0], alts: urls.slice(1), extra: true, doEdital: true };
}
async function procurarLeisNosEditais() {
  if (leiUi.procurando) return;
  const conc = itens.filter(x => x.edital_arquivo && andamento(x).ativo);
  if (!conc.length) return;
  leiUi.procurando = true;
  const cache = lerEst("leisEditais", {}), total = {};
  for (const x of conc) {
    try {
      const marca = x.edital_arquivo.nome + "|" + (x.edital_arquivo.tamanho || x.edital_arquivo.size || "");
      let achadas = cache[x.id] && cache[x.id].marca === marca ? cache[x.id].achadas : null;
      if (!achadas) {
        const blob = await arq("ler", `${x.id}:edital`).catch(() => null) || await baixarDaNuvem(`${x.id}:edital`).catch(() => null);
        if (!blob) continue;
        achadas = leisDoTexto(await textoDoPdf(blob, 400));
        cache[x.id] = { marca, achadas }; gravarEst("leisEditais", cache);
      }
      Object.values(achadas).forEach(a => { const t = total[a.k] = total[a.k] || { k: a.k, n: 0, mats: {} }; t.n += a.n; Object.entries(a.mats).forEach(([m, c]) => t.mats[m] = (t.mats[m] || 0) + c); });
    } catch (e) { console.warn("edital", x.nome, e); }
  }
  leiUi.procurando = false;
  // as leis encontradas entram na lista normal (as já existentes e as que você removeu ficam como estão)
  const ext = lerEst("leisExtras", []), fora = lerEst("leisRemovidas", []), cat = leiCatalogo();
  let novas = 0;
  Object.values(total).sort((a, b) => b.n - a.n).forEach(t => { const m = metaDaChave(t.k, t); if (m && !fora.includes(m.id) && !cat.some(l => l.id === m.id) && !ext.some(l => l.id === m.id)) { ext.push(m); novas++; } });
  if (novas) { gravarEst("leisExtras", ext); if (estudoAba === "lei-leis") desenharEstudo("lei-leis"); }
}
// ---------- eventos ----------
document.addEventListener("click", e => {
  if (!e.target.closest("#estudoConteudo")) return;
  const t = e.target.closest("button"); if (!t) return;
  const d = t.dataset;
  if (d.leibaixar) { baixarLei(d.leibaixar, !!d.forcar); return; }
  if (d.leicolar) { leiUi.colar = leiUi.colar === d.leicolar ? null : d.leicolar; desenharEstudo(estudoAba); setTimeout(() => { const el = $("leiCola"); if (el) el.focus(); }, 50); return; }
  if (d.leicolaragora) { colarDaAreaDeTransferencia(d.leicolaragora); return; }
  if (d.leicolarfechar) { leiUi.colar = null; desenharEstudo(estudoAba); return; }
  if (d.leiler) { const c = lerLeiCfg(); c.lei = d.leiler; c.cap = ""; c.busca = ""; gravarEst("leiRev", c); desenharEstudo("lei-ler"); return; }
  if (d.leiremover) { gravarEst("leisRemovidas", [...lerEst("leisRemovidas", []), d.leiremover]); gravarEst("leisExtras", lerEst("leisExtras", []).filter(l => l.id !== d.leiremover)); desenharEstudo(estudoAba); return; }
  if (t.id === "leiNovaAdd") {
    const nome = $("leiNovaNome").value.trim(), url = $("leiNovaUrl").value.trim(), sigla = $("leiNovaSigla").value.trim() || nome.slice(0, 20);
    if (!nome || !/^https?:\/\/(www\.)?planalto\.gov\.br\//i.test(url)) { toast("Informe o nome e um link do planalto.gov.br."); return; }
    gravarEst("leisExtras", [...lerEst("leisExtras", []), { id: "x" + Date.now().toString(36), sigla, nome, url, materia: $("leiNovaMat").value, extra: true }]); desenharEstudo(estudoAba); return;
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
  if (d.leimat !== undefined && t.closest(".lei-mats")) { gravarEst("leiMat", d.leimat); desenharEstudo("lei-leis"); return; }
  if (d.leiplmat) { const ls = leisProntas().filter(l => materiaDe(l) === d.leiplmat).map(l => l.id), atual = c.leis.filter(id => leis[id]); const todas = ls.every(id => atual.includes(id)); c.leis = todas ? atual.filter(id => !ls.includes(id)) : [...new Set([...atual, ...ls])]; if (!c.leis.length) c.leis = [ls[0]]; c.cap = ""; gravarEst("leiPrat", c); desenharEstudo("lei-praticar"); return; }
  if (d.leipl) { const prontas = leisProntas(), atual = c.leis.filter(id => leis[id]).length ? c.leis.filter(id => leis[id]) : [prontas[0].id]; c.leis = atual.includes(d.leipl) ? atual.filter(x => x !== d.leipl) : [...atual, d.leipl]; if (!c.leis.length) c.leis = [d.leipl]; c.cap = ""; gravarEst("leiPrat", c); desenharEstudo("lei-praticar"); return; }
  if (d.leiso !== undefined && t.closest(".est-chips")) { c.so = d.leiso; gravarEst("leiPrat", c); desenharEstudo("lei-praticar"); return; }
  if (d.leimodo) { c.modo = d.leimodo; gravarEst("leiPrat", c); desenharEstudo("lei-praticar"); return; }
  if (d.leiqn) { c.n = +d.leiqn; gravarEst("leiPrat", c); desenharEstudo("lei-praticar"); return; }
  if (d.leionde) { c.onde = d.leionde; gravarEst("leiPrat", c); desenharEstudo("lei-praticar"); return; }
  if (t.id === "leiComecar") { comecarLei(); return; }
});
document.addEventListener("change", e => {
  const id = e.target.id;
  if (e.target.dataset && e.target.dataset.leimatsel) { const mu = lerEst("leiMatUser", {}); mu[e.target.dataset.leimatsel] = e.target.value; gravarEst("leiMatUser", mu); leiMatUser = mu; toast(`Lei movida para ${e.target.value}.`); desenharEstudo("lei-leis"); return; }
  if (id === "leiSel" || id === "leiCap" || id === "leiSoDif") { const c = lerLeiCfg(); if (id === "leiSel") { c.lei = e.target.value; c.cap = ""; } else if (id === "leiCap") c.cap = e.target.value; else c.soDificeis = e.target.checked; gravarEst("leiRev", c); desenharEstudo("lei-ler"); }
  if (id === "leiPratCap" || id === "leiBanca") { const c = lerLeiPrat(); c[id === "leiPratCap" ? "cap" : "banca"] = e.target.value; gravarEst("leiPrat", c); desenharEstudo("lei-praticar"); }
});
let leiBuscaT = null;
document.addEventListener("input", e => {
  if (e.target.id === "leiBusca") { clearTimeout(leiBuscaT); const v = e.target.value; leiBuscaT = setTimeout(() => { const c = lerLeiCfg(); c.busca = v; gravarEst("leiRev", c); desenharEstudo("lei-ler"); const el = $("leiBusca"); if (el) { el.focus(); el.setSelectionRange(v.length, v.length); } }, 400); }
});
// botão "Colar o que copiei": lê a área de transferência direto (o navegador pede permissão na primeira vez)
async function colarDaAreaDeTransferencia(id) {
  try {
    let html = "";
    if (navigator.clipboard && navigator.clipboard.read) {
      for (const it of await navigator.clipboard.read()) {
        if (it.types.includes("text/html")) { html = await (await it.getType("text/html")).text(); break; }
        if (!html && it.types.includes("text/plain")) html = esc(await (await it.getType("text/plain")).text()).replace(/\n/g, "<br>");
      }
    } else if (navigator.clipboard && navigator.clipboard.readText) html = esc(await navigator.clipboard.readText()).replace(/\n/g, "<br>");
    if (!html.trim()) { toast("A área de transferência está vazia. Copie a página da lei primeiro (Ctrl+A, Ctrl+C)."); return; }
    const el = $("leiCola"); if (el) el.textContent = "Lendo o texto colado…";
    colarLei(id, html);
  } catch (e) { toast("O navegador não deixou ler o que você copiou. Clique no quadro tracejado e aperte Ctrl+V."); }
}
// colar: a área de transferência traz o HTML da página (com o riscado), que o app limpa
document.addEventListener("paste", e => {
  const el = e.target.closest && e.target.closest("#leiCola"); if (!el) return;
  e.preventDefault();
  const dt = e.clipboardData, html = dt.getData("text/html") || esc(dt.getData("text/plain")).replace(/\n/g, "<br>");
  el.textContent = "Lendo o texto colado…"; el.blur(); colarLei(el.dataset.leiid, html);
});
