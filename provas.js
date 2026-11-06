// Provas anteriores e peças práticas, a partir da pasta "Provas Jurídicas" no Drive do projeto.
// O Apps Script lista a pasta e o Gemini lê os PDFs (prova + gabarito/espelho), devolvendo as questões fiéis à prova.
// O resultado fica guardado (no Drive e neste aparelho) para não reprocessar.

let repo = null, repoCarregando = false, sim = null, pecaEstr = {};
const LOTE = 15;   // questões objetivas extraídas por vez
const ESTRUTURAS_PADRAO = {
  "Juiz de Direito": ["Sentença cível", "Sentença criminal"],
  "Promotor de Justiça": ["Denúncia", "Alegações finais (Ministério Público)", "Parecer do Ministério Público"],
  "Delegado de Polícia": ["Relatório final de inquérito policial", "Representação por prisão preventiva", "Auto de prisão em flagrante"],
  "Analista Judiciário": ["Certidão", "Mandado judicial"]
};
const CARGOS = Object.keys(ESTRUTURAS_PADRAO);
function cargoPadrao(nome) {
  const n = semAcentoEst(nome);
  if (/delegad/.test(n)) return "Delegado de Polícia";
  if (/juiz|juiza|magistr/.test(n)) return "Juiz de Direito";
  if (/promot|ministerio publico|\bmp\b|procurador/.test(n)) return "Promotor de Justiça";
  if (/servent|analista|tecnico|oficial de justica|escrevente|escriv|cartor/.test(n)) return "Analista Judiciário";
  return nome;
}
// filtros gravados com os nomes antigos ("Juiz", "Delegado"…) passam para os nomes novos
const lerProv = (b, p) => { const v = lerEst("prov-" + b, p); if (v && typeof v.cargo === "string" && v.cargo) v.cargo = cargoPadrao(v.cargo); return v; }, gravarProv = (b, v) => gravarEst("prov-" + b, v);

async function postLongo(obj, ms) {
  return Promise.race([postScript({ sessao: usuarioAtual.sessao, ...obj }), new Promise((_, f) => setTimeout(() => f(new Error("o servidor demorou demais")), ms || 300000))]);
}
// da prova mais antiga para a mais recente (ano do nome: "PCPB/2021 - …"); sem ano vão para o fim; empate: órgão, depois parte/número
const anoDoNome = n => { const m = String(n || "").match(/(?:^|[\/\s_-])((?:19|20)\d{2})(?!\d)/); return m ? +m[1] : 9999; };
const ordemCronologica = (a, b) => anoDoNome(a.nome) - anoDoNome(b.nome) || String(a.nome).localeCompare(String(b.nome), "pt-BR", { numeric: true });
// selo na lista: "respondida em 06/11 · nota 7,5" (do histórico, que vale para todos os aparelhos); só as questões originais da prova
function seloRespondida(i) {
  const L = (typeof hist !== "undefined" && hist.lista || []).filter(e => e.prova === i.id && !e.novas && e.tipo !== "info").sort((a, b) => new Date(a.data) - new Date(b.data));
  if (!L.length) return typeof hist !== "undefined" && hist.lista && !(lerProv("resultados", {})[i.id]) ? ` · <span class="selo-nao">○ ainda não respondida</span>` : "";
  const u = L[L.length - 1], d = new Date(u.data), data = isNaN(d) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  let txt;
  if (i.tipo === "objetiva") txt = `${u.acertos}/${u.total} (${Math.round(u.nota * 10)}%)`;
  else if (i.tipo === "peca") txt = "nota " + String(Math.round(u.nota * 10) / 10).replace(".", ",");
  else {   // subjetiva: média das questões respondidas na data da última resposta
    const dia = u.data.slice(0, 10), mesmas = L.filter(e => e.data.slice(0, 10) === dia), porQ = {};
    mesmas.forEach(e => porQ[e.numero] = e.nota);
    const ns = Object.values(porQ); txt = `${ns.length} ${ns.length > 1 ? "questões" : "questão"} · média ${String(Math.round(ns.reduce((a, b) => a + b, 0) / ns.length * 10) / 10).replace(".", ",")}`;
  }
  const vezes = i.tipo === "subjetiva" ? new Set(L.map(e => e.data.slice(0, 10))).size : L.length;
  return ` · <span class="selo-resp">✓ respondida em ${data} · ${txt}${vezes > 1 ? ` · ${vezes}ª vez` : ""}</span>`;
}
async function carregarRepo(forcar) {
  if (repoCarregando || (repo && !forcar)) return;
  repoCarregando = true;
  try {
    const r = await postLongo({ acao: "repositorio" }, 120000);
    // o nome da pasta do cargo pode variar ("Delegado de Polícia", "Magistratura", "Ministério Público"…): agrupa no cargo-padrão
    if (r.ok) (r.itens || []).forEach(i => { i.pastaCargo = i.cargo; i.cargo = cargoPadrao(i.cargo); });
    if (r.ok) { r.soltos = (r.itens || []).filter(i => i.soGab); r.itens = (r.itens || []).filter(i => !i.soGab).sort(ordemCronologica); }
    repo = r.ok ? r : { erro: /desconhecida/i.test(r.erro || "") ? "O Apps Script ainda não tem o repositório de provas: atualize o script (veja CONFIGURAR-LOGIN.md)." : r.erro, itens: [] };
  } catch (e) { repo = { erro: "Sem conexão com o servidor.", itens: [] }; }
  repoCarregando = false;
  if (["provas", "pecas"].includes(estudoAba)) desenharEstudo(estudoAba);
}

// questões de uma prova: guardadas no aparelho; o que faltar é pedido ao servidor em lotes
async function questoesGuardadas(it) { try { const g = await arq("ler", "prova:" + it.id); return g && g.modificado === it.modificado ? g : null; } catch (e) { return null; } }
async function extrairLote(it, de, ate) {
  const r = await postLongo({ acao: "extrairProva", prova: it.id, gab: it.gab, tipo: it.tipo, de, ate, modificado: it.modificado });
  if (!r.ok) throw new Error(r.erro || "falha ao ler a prova");
  let g = (await questoesGuardadas(it)) || { modificado: it.modificado, total: 0, banca: "", questoes: [], feitos: [] };
  g.total = Math.max(g.total, r.total || 0); g.banca = g.banca || r.banca;
  for (const q of r.questoes) if (!g.questoes.some(x => x.numero === q.numero)) g.questoes.push(q);
  g.questoes.sort((a, b) => a.numero - b.numero); g.feitos.push(`${de}-${ate}`);
  if (!g.total && r.questoes.length < ate - de + 1) g.total = g.questoes.length;
  await arq("gravar", "prova:" + it.id, g).catch(() => {});
  return g;
}
async function garantirQuestoes(it, aoProgredir) {
  let g = await questoesGuardadas(it);
  if (it.tipo !== "objetiva") { if (!g) g = await extrairLote(it, 1, 30); return g; }
  if (!g) { aoProgredir && aoProgredir(`Lendo a prova com a IA (questões 1 a ${LOTE})…`); g = await extrairLote(it, 1, LOTE); }
  return g;
}
async function completarProva(it) {   // em segundo plano, lote por lote
  let g = await questoesGuardadas(it);
  while (g && g.total && g.questoes.length < g.total) {
    const de = Math.max(...g.questoes.map(q => q.numero)) + 1, ate = Math.min(g.total, de + LOTE - 1);
    if (de > g.total || g.feitos.includes(`${de}-${ate}`)) break;
    try { g = await extrairLote(it, de, ate); } catch (e) { break; }
    if (sim && sim.it.id === it.id) { sim.qs = g.questoes.filter(q => q.enunciado); sim.total = g.total; if (estudoAba === "provas") desenharEstudo("provas"); }
  }
}

// ---------- enviar provas para o Drive ----------
let envio = { aberto: false, enviando: false, msg: "" };
function htmlEnvio(tipoPadrao) {
  const cargos = CARGOS;
  const fc = (tipoPadrao === "peca" ? lerProv("filtroPeca", {}) : lerProv("filtro", {})).cargo || "";
  return `<details class="est-det env-box" id="envBox"${envio.aberto ? " open" : ""}><summary>+ Enviar prova para o Drive</summary>
    <div class="env-grid">
      <label>Tipo<select id="envTipo">${[["objetiva", "Prova objetiva"], ["subjetiva", "Prova subjetiva"], ["peca", "Peça prática"]].map(([k, n]) => `<option value="${k}"${k === tipoPadrao ? " selected" : ""}>${n}</option>`).join("")}</select></label>
      <label>Cargo<select id="envCargo">${cargos.map(c => `<option${c === fc ? " selected" : ""}>${c}</option>`).join("")}</select></label>
      <label>Órgão (sigla)<input id="envOrgao" placeholder="ex.: PCBA" autocapitalize="characters"></label>
      <label>Ano<input id="envAno" inputmode="numeric" maxlength="4" placeholder="ex.: 2022"></label>
      <label>Banca<input id="envBanca" placeholder="ex.: IBFC" list="dlBancas"><datalist id="dlBancas">${["Cebraspe", "FGV", "Vunesp", "FCC", "IBFC", "Consulplan", "Instituto AOCP", "Fumarc", "Nucepe", "Ibade", "Idecan", "Instituto Acesso"].map(b => `<option value="${b}">`).join("")}</datalist></label>
      <label>Parte <span class="note">(opcional)</span><input id="envParte" placeholder="ex.: conhecimentos gerais"></label>
      <p class="note env-l2" id="envPrev">${previaEnvio(tipoPadrao)}</p>
      <label class="env-l2">Arquivo da prova<input id="envProva" type="file" accept="application/pdf,.pdf,.doc,.docx,image/*"></label>
      <label class="env-l2">Gabarito / espelho / padrão de resposta <span class="note">(opcional)</span><input id="envGab" type="file" accept="application/pdf,.pdf,.doc,.docx,image/*"></label>
    </div>
    <p class="note">Os arquivos vão para <b>Provas Jurídicas / tipo / cargo</b> já com o nome no padrão, e o app forma o par prova + gabarito sozinho. Até uns 15 MB por arquivo.</p>
    <div class="actions" style="justify-content:flex-start"><button type="button" class="primary" id="envEnviar" ${envio.enviando ? "disabled" : ""}>${envio.enviando ? "Enviando…" : "Enviar para o Drive"}</button><span class="note" id="envMsg">${esc(envio.msg)}</span></div>
  </details>`;
}
// nome no padrão "PCBA/2022 - IBFC - prova objetiva (conhecimentos gerais)"
function nomesEnvio(tipo) {
  const v = id => (($(id) || {}).value || "").trim();
  const org = v("envOrgao").toUpperCase().replace(/[\s\-_.\/]+/g, ""), ano = v("envAno").replace(/\D/g, "").slice(0, 4), banca = v("envBanca"), parte = v("envParte").toLowerCase().replace(/[()\/]+/g, " ").trim();
  if (!org) return null;
  const base = [[org, ano].filter(Boolean).join("/"), banca].filter(Boolean).join(" - "), pt = parte ? ` (${parte})` : "";
  return { prova: `${base} - ${PAPEL[tipo][0]}${pt}`, gab: `${base} - ${PAPEL[tipo][1]}${pt}` };
}
function previaEnvio(tipo) { const n = $("envOrgao") && nomesEnvio(tipo); return n ? `Nome no Drive: <b>${esc(n.prova)}</b> e <b>${esc(n.gab)}</b>` : "Preencha órgão, ano e banca: o app monta o nome no padrão (ex.: PCBA/2022 - IBFC - prova objetiva)."; }
document.addEventListener("input", e => { if (/^env(Orgao|Ano|Banca|Parte)$/.test(e.target.id)) { const p = $("envPrev"); if (p) p.innerHTML = previaEnvio($("envTipo").value); } });
document.addEventListener("change", e => { if (e.target.id === "envTipo") { const p = $("envPrev"); if (p) p.innerHTML = previaEnvio(e.target.value); } });
const lerBase64 = f => new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = falha; r.readAsDataURL(f); });
async function enviarParaDrive() {
  const tipo = $("envTipo").value, cargo = $("envCargo").value, nomes = nomesEnvio(tipo), fp = $("envProva").files[0], fg = $("envGab").files[0];
  const msg = t => { envio.msg = t; const el = $("envMsg"); if (el) el.textContent = t; };
  if (!nomes || !$("envAno").value.trim() || !$("envBanca").value.trim()) return msg("Informe órgão, ano e banca.");
  if (!fp) return msg("Escolha o arquivo da prova.");
  for (const f of [fp, fg].filter(Boolean)) if (f.size > 18 * 1024 * 1024) return msg(`"${f.name}" tem ${(f.size / 1048576).toFixed(1)} MB; o limite é de uns 15 MB.`);
  envio.enviando = true; envio.aberto = true; msg("Enviando a prova…"); desenharEstudo(estudoAba);
  try {
    const partes = [["prova", fp], ["gabarito", fg]].filter(x => x[1]);
    let destino = "";
    for (const [papel, f] of partes) {
      msg(papel === "prova" ? "Enviando a prova…" : "Enviando o gabarito…");
      const r = await postLongo({ acao: "enviarProva", tipo, cargo, nome: nomes.prova, nomeFinal: papel === "prova" ? nomes.prova : nomes.gab, papel, nomeArquivo: f.name, mime: f.type || "application/pdf", base64: await lerBase64(f) }, 300000);
      if (!r.ok) throw new Error(/desconhecida/i.test(r.erro || "") ? "o Apps Script ainda não tem o envio de provas: atualize o script." : r.erro);
      destino = r.pasta;
    }
    envio = { aberto: false, enviando: false, msg: "" };
    toast(`Enviado para ${destino}.`);
    const fl = tipo === "peca" ? lerProv("filtroPeca", {}) : lerProv("filtro", {});
    if (tipo === "peca") gravarProv("filtroPeca", { ...fl, cargo, aba: "praticar" }); else gravarProv("filtro", { ...fl, tipo, cargo });
    repo = null; carregarRepo(true); desenharEstudo(tipo === "peca" ? "pecas" : "provas");
  } catch (e) { envio.enviando = false; envio.msg = "Não foi possível enviar: " + e.message; desenharEstudo(estudoAba); }
}

// ---------- separar prova e gabarito (arquivo que já vem com as respostas) ----------
let separando = {};
const botaoSeparar = i => i.gab ? "" : `<button type="button" data-provsep="${esc(i.id)}" ${separando[i.id] ? "disabled" : ""} title="Gera, na subpasta Para imprimir, um PDF só com as questões e outro com ${i.tipo === "objetiva" ? "o gabarito" : "o padrão de resposta"}">${separando[i.id] ? "Separando…" : "Separar prova e " + (i.tipo === "objetiva" ? "gabarito" : "resposta")}</button>`;
async function separarProvaGabarito(id) {
  const it = repo.itens.find(i => i.id === id); if (!it || separando[id]) return;
  separando[id] = 1; desenharEstudo(estudoAba);
  toast("Lendo a prova com a IA para separar as questões das respostas… pode levar alguns minutos.");
  try {
    await garantirQuestoes(it); if (it.tipo === "objetiva") await completarProva(it);
    const g = await questoesGuardadas(it);
    const qs = (g && g.questoes || []).filter(q => q.enunciado);
    if (!qs.length) throw new Error("a IA não encontrou as questões");
    if (it.tipo === "objetiva" && g.total && qs.length < g.total) throw new Error(`a leitura parou em ${qs.length} de ${g.total} questões; tente de novo`);
    const temResp = it.tipo === "objetiva" ? qs.some(q => q.gabarito) : qs.some(q => (q.espelho || []).length || q.resposta_esperada);
    if (!temResp) throw new Error("a IA não encontrou respostas dentro deste arquivo");
    const m = it.nome.match(/^(.*?)\s*-\s*(?:prova objetiva|prova subjetiva|pe[çc]a pr[áa]tica)((?:\s*\([^)]*\))*)\s*$/i);
    const base = m ? m[1] : it.nome, suf = m && m[2].trim() ? " " + m[2].trim() : "";
    const r = await postLongo({ acao: "separarProva", prova: it.id, tipo: it.tipo, titulo: it.nome, questoes: qs,
      nomeProva: `${base} - ${PAPEL[it.tipo][0]}${suf} (sem respostas)`, nomeGab: `${base} - ${PAPEL[it.tipo][1]}${suf}` }, 300000);
    if (!r.ok) throw new Error(/desconhecida/i.test(r.erro || "") ? "atualize o Apps Script" : r.erro);
    toast(`Pronto: 2 PDFs em ${r.pasta}.`);
  } catch (e) { toast("Não foi possível separar: " + e.message); }
  delete separando[id]; if (["provas", "pecas"].includes(estudoAba)) desenharEstudo(estudoAba);
}

// ---------- padronizar nomes dos arquivos ----------
// "PCDF/2026 - Cebraspe - prova objetiva" e "PCDF/2026 - Cebraspe - gabarito prova objetiva"
let padr = null;   // { itens: [{it, ident, nomeProva, nomeGab, erro}], i, fase }
const PAPEL = { objetiva: ["prova objetiva", "gabarito prova objetiva"], subjetiva: ["prova subjetiva", "padrão de resposta prova subjetiva"], peca: ["peça prática", "padrão de resposta peça prática"] };
function baseIdent(x) { const d = x.ident || {}; return [[d.orgao, d.ano].filter(Boolean).join("/"), d.banca].filter(Boolean).join(" - ") || x.it.nome; }
// monta os nomes de todos os arquivos: o nome da peça a redigir não entra (seria "spoiler");
// arquivo sem par que a IA reconheceu como gabarito/espelho vira gabarito e se junta à prova do mesmo concurso;
// provas repetidas do mesmo concurso na mesma pasta ganham (2), (3)…
function ajustarNomes(itens) {
  const prontos = itens.filter(x => x.ident || x.erro);
  const ehGab = x => !x.it.gab && (x.it.soGab || (x.ident && x.ident.papel === "gabarito"));
  // prova dividida em partes (ex.: conhecimentos gerais × específicos): a parte vai no nome, igual na prova e no gabarito
  const parte = x => x.ident && x.ident.parte ? ` (${x.ident.parte})` : "";
  const nome = (x, base, papel, n, pt) => `${base} - ${PAPEL[x.it.tipo][papel]}${pt}${n > 1 ? ` (${n})` : ""}`;
  const cont = {};
  prontos.filter(x => !ehGab(x)).forEach(x => {
    const base = baseIdent(x), pt = parte(x), k = x.it.tipo + "|" + x.it.pastaCargo + "|" + base + pt;
    x.n = cont[k] = (cont[k] || 0) + 1; x.base = base; x.pt = pt; x.gabSolto = null;
    x.nomeProva = nome(x, base, 0, x.n, pt); x.nomeGab = x.it.gab ? nome(x, base, 1, x.n, pt) : "";
  });
  const contG = {};
  prontos.filter(ehGab).forEach(g => {
    const base = baseIdent(g);
    const par = prontos.find(p => !ehGab(p) && !p.it.gab && !p.gabSolto && p.it.tipo === g.it.tipo && p.it.pastaCargo === g.it.pastaCargo && p.ident && g.ident && p.ident.orgao === g.ident.orgao && p.ident.ano === g.ident.ano && (!p.pt || !parte(g) || p.pt === parte(g)));
    if (par) { par.gabSolto = g; g.parDe = par.base + par.pt; g.nomeProva = nome(g, par.base, 1, par.n, par.pt); return; }
    const pt = parte(g), k = g.it.tipo + "|" + g.it.pastaCargo + "|" + base + pt; contG[k] = (contG[k] || 0) + 1;
    g.parDe = ""; g.nomeProva = nome(g, base, 1, contG[k], pt); g.nomeGab = "";
  });
}
// nome já no padrão "ÓRGÃO/ANO - Banca - prova objetiva (parte) (2)"
const RE_PADRAO = /^[A-Z0-9]+\/\d{4}( - [^/]+?)? - (prova objetiva|prova subjetiva|pe[çc]a pr[áa]tica|gabarito prova objetiva|padr[ãa]o de resposta (prova subjetiva|pe[çc]a pr[áa]tica))( \([^)]*\))*$/;
const noPadrao = it => RE_PADRAO.test(it.nome) && (!it.gab || RE_PADRAO.test(String(it.gabNome || "").replace(/\.(pdf|docx?|jpe?g|png)$/i, "")));
// 1º passo: o usuário escolhe os arquivos (já vêm marcados os que estão fora do padrão)
function iniciarPadronizacao(area) {
  if (!repo || !repo.itens) return;
  padr = { area, fase: "escolher", itens: [...repo.itens, ...(repo.soltos || [])].map(it => ({ it, sel: !noPadrao(it), ren: true })), i: 0 };
  desenharEstudo(area);
}
async function identificarSelecionados() {
  const sel = padr.itens.filter(x => x.sel); if (!sel.length) return;
  padr.fase = "identificando"; padr.i = 0; padr.total = sel.length; desenharEstudo(estudoAba);
  for (const x of sel) {
    if (!padr) return;
    try {
      const r = await postLongo({ acao: "identificarProva", prova: x.it.id, gab: x.it.gab, tipo: x.it.tipo }, 180000);
      if (!r.ok) throw new Error(/desconhecida/i.test(r.erro || "") ? "atualize o Apps Script" : r.erro);
      x.ident = r;
    } catch (e) { x.erro = e.message; }
    if (!padr) return;
    padr.i++; ajustarNomes(padr.itens); evitarNomesExistentes();
    if (padr && ["provas", "pecas"].includes(estudoAba)) desenharEstudo(estudoAba);
  }
  if (padr) { padr.fase = "conferir"; desenharEstudo(estudoAba); }
}
// um nome novo não pode repetir o de um arquivo que ficou de fora (na mesma pasta): ganha (2), (3)…
function evitarNomesExistentes() {
  const usados = {};
  padr.itens.filter(x => !x.sel).forEach(x => { const k = x.it.tipo + "|" + x.it.pastaCargo; (usados[k] = usados[k] || new Set()).add(x.it.nome); if (x.it.gab) usados[k].add(String(x.it.gabNome).replace(/\.(pdf|docx?|jpe?g|png)$/i, "")); });
  padr.itens.filter(x => x.sel && x.nomeProva).forEach(x => {
    const u = usados[x.it.tipo + "|" + x.it.pastaCargo]; if (!u || !u.has(x.nomeProva)) return;
    const base = x.nomeProva.replace(/ \(\d+\)$/, ""), gbase = (x.nomeGab || "").replace(/ \(\d+\)$/, "");
    for (let n = 2; n < 20; n++) if (!u.has(`${base} (${n})`)) { x.nomeProva = `${base} (${n})`; if (x.nomeGab) x.nomeGab = `${gbase} (${n})`; break; }
  });
}
function htmlPadronizar() {
  const p = padr;
  const TIPOS = { objetiva: "Provas objetivas", subjetiva: "Provas subjetivas", peca: "Peças jurídicas" };
  const topo = `<div class="est-prog"><button type="button" class="mini" id="padrSair">‹ Voltar</button><b>Padronizar nomes dos arquivos</b></div>`;
  const gabNome = x => String(x.it.gabNome || "").replace(/\.(pdf|docx?|jpe?g|png)$/i, "");
  if (p.fase === "escolher") {
    const n = p.itens.filter(x => x.sel).length, fora = p.itens.filter(x => !noPadrao(x.it)).length;
    return topo + `<p class="note">Escolha os arquivos que a IA deve ler e renomear. Já vêm marcados os que estão fora do padrão (${fora}).</p>
      <div class="actions" style="justify-content:flex-start;margin:0"><button type="button" class="mini" data-padrmarcar="fora">Só os fora do padrão</button><button type="button" class="mini" data-padrmarcar="todos">Marcar todos</button><button type="button" class="mini" data-padrmarcar="nenhum">Desmarcar todos</button></div>
      ${p.itens.map((x, k) => `<label class="padr-esc${x.sel ? " on" : ""}"><input type="checkbox" data-padrsel="${k}"${x.sel ? " checked" : ""}><span><b>${esc(x.it.nome)}</b>${x.it.gab ? `<br><span class="note">+ ${esc(gabNome(x))}</span>` : ""}${x.it.soGab ? `<br><span class="note">gabarito sem prova correspondente</span>` : ""}<br><span class="note">${esc(TIPOS[x.it.tipo])} / ${esc(x.it.pastaCargo || x.it.cargo)}</span></span>${noPadrao(x.it) ? `<span class="chip">no padrão</span>` : `<span class="chip chip-alerta">fora do padrão</span>`}</label>`).join("")}
      <div class="actions"><button type="button" id="padrSair">Cancelar</button><button type="button" class="primary" id="padrIdentificar" ${n ? "" : "disabled"}>Ler com a IA (${n} ${n === 1 ? "arquivo" : "arquivos"})</button></div>`;
  }
  const sel = p.itens.map((x, k) => [x, k]).filter(([x]) => x.sel), nRen = sel.filter(([x]) => x.ren && x.nomeProva).length;
  return topo + `<p class="note">${p.fase === "identificando" ? `A IA está lendo as provas para identificar órgão, ano e banca: ${p.i} de ${p.total}… (só na primeira vez; depois fica guardado)` : p.fase === "renomeando" ? "Renomeando no Drive…" : "Confira e corrija os nomes. Desmarque o que não quiser renomear. Formato: ÓRGÃO/ANO - Banca - tipo."}</p>
    ${sel.map(([x, k]) => `<div class="padr-item">${p.fase === "conferir" && x.nomeProva !== undefined ? `<label class="padr-ren"><input type="checkbox" data-padrren="${k}"${x.ren ? " checked" : ""}> renomear</label>` : ""}<p class="note">${esc(TIPOS[x.it.tipo])} / ${esc(x.it.pastaCargo || x.it.cargo)}${x.erro ? ` · <span style="color:var(--danger)">não identificado (${esc(x.erro)})</span>` : ""}${x.parDe !== undefined ? ` · <b>a IA viu que é gabarito/espelho</b>${x.parDe ? " de " + esc(x.parDe) : " (prova correspondente não encontrada)"}` : ""}</p>
      ${x.nomeProva === undefined ? `<p class="note">${esc(x.it.nome)} · aguardando…</p>` : `
      <label class="padr-l"><span class="note">${esc(x.it.nome)} →</span><input data-padr="${k}" data-papel="p" value="${esc(x.nomeProva)}"${x.ren ? "" : " disabled"}></label>
      ${x.it.gab ? `<label class="padr-l"><span class="note">${esc(gabNome(x))} →</span><input data-padr="${k}" data-papel="g" value="${esc(x.nomeGab)}"${x.ren ? "" : " disabled"}></label>` : ""}`}</div>`).join("")}
    <div class="actions"><button type="button" id="padrSair">Cancelar</button>${p.fase === "renomeando" ? `<span class="note est-gerando">Renomeando no Drive…</span>` : ""}<button type="button" class="primary" id="padrRenomear" ${p.fase !== "conferir" || !nRen ? "disabled" : ""}>${p.fase === "renomeando" ? "Renomeando…" : `Renomear no Drive (${nRen})`}</button></div>`;
}
async function renomearPadronizados() {
  const lista = [];
  padr.itens.filter(x => x.sel && x.ren).forEach(x => { if (x.nomeProva) lista.push({ id: x.it.id, nome: x.nomeProva }); if (x.it.gab && x.nomeGab) lista.push({ id: x.it.gab, nome: x.nomeGab }); });
  padr.fase = "renomeando"; desenharEstudo(estudoAba);
  try {
    const r = await postLongo({ acao: "renomear", lista }, 300000);
    if (!r.ok) throw new Error(r.erro);
    toast((r.feitos ? `Pronto: ${r.feitos} arquivo(s) renomeado(s) no Drive` : "Os arquivos já estavam com esses nomes no Drive") + (r.erros.length ? `; ${r.erros.length} com problema: ${r.erros.join("; ")}` : ".") + " A lista foi atualizada.");
    const area = padr.area; padr = null; repo = null; carregarRepo(true); desenharEstudo(area);
  } catch (e) { padr.fase = "conferir"; toast("Não foi possível renomear: " + e.message); desenharEstudo(estudoAba); }
}

// ---------- telas ----------
function htmlProvas() {
  if (padr) return htmlPadronizar();
  if (hist.aberto && !sim) return htmlHistorico();
  if (!hist.lista && !hist.carregando) carregarHistorico();
  if (sim && sim.it.tipo !== "peca") return htmlSimulado();
  if (cartao) return htmlCartao();
  if (!repo) { carregarRepo(); return `<p class="note est-gerando">Abrindo a pasta Provas Jurídicas no Drive…</p>`; }
  if (repo.erro) return `<p class="note">${esc(repo.erro)}</p><div class="actions" style="justify-content:flex-start"><button type="button" id="provRecarregar">Tentar de novo</button></div>`;
  const f = lerProv("filtro", { tipo: "objetiva", cargo: "" });
  const itens = repo.itens.filter(i => i.tipo === f.tipo);
  const cargos = [...new Set([...CARGOS, ...repo.itens.filter(i => i.tipo !== "peca").map(i => i.cargo)])];
  const lista = itens.filter(i => !f.cargo || i.cargo === f.cargo);
  const res = lerProv("resultados", {});
  return `${htmlImpressas("provas")}${botaoHistorico("provas")}${htmlEnvio(f.tipo)}<div class="est-opts"><button type="button" class="opt${f.tipo === "objetiva" ? " on" : ""}" data-provtipo="objetiva">Provas objetivas</button><button type="button" class="opt${f.tipo === "subjetiva" ? " on" : ""}" data-provtipo="subjetiva">Provas subjetivas</button></div>
    ${seletorCargo("provCargoSel", cargos, f.cargo)}
    ${lista.length ? lista.map(i => {
      const r = res[i.id];
      return `<div class="prov-item"><div class="prov-tit"><b>${esc(i.nome)}</b><span class="note">${esc(i.pastaCargo || i.cargo)}${i.gab ? " · gabarito: " + esc(i.gabNome) : " · sem gabarito separado"}${seloRespondida(i) || (r ? ` · última vez: ${r.acertos}/${r.total} (${Math.round(r.acertos / Math.max(1, r.total) * 100)}%)` : "")}</span></div>
        <div class="prov-acoes"><button type="button" class="primary" data-provsim="${esc(i.id)}">${i.tipo === "objetiva" ? "Simulado com as questões originais" : "Responder as questões originais"}</button><button type="button" data-provnovas="${esc(i.id)}">Questões novas no estilo desta prova</button>${i.tipo === "objetiva" ? `<button type="button" data-provimpr="${esc(i.id)}" ${imprimindo[i.id] ? "disabled" : ""}>${imprimindo[i.id] ? esc(imprimindo[i.id]) : "Imprimir prova + cartão-resposta"}</button>` : ""}${botaoSeparar(i)}</div></div>`;
    }).join("") : `<p class="note">Nenhuma prova ${f.tipo === "objetiva" ? "objetiva" : "subjetiva"}${f.cargo ? " de " + esc(f.cargo) : ""} na pasta. Coloque os PDFs em <b>Provas Jurídicas / ${f.tipo === "objetiva" ? "Provas objetivas" : "Provas subjetivas"} / ${esc(f.cargo || "cargo")}</b>.</p>`}
    <p class="note">Pasta no Drive: <b>${esc(repo.raiz || "Provas Jurídicas")}</b>. Prova e gabarito são reconhecidos pelo nome (ex.: "TJMG 2022 - prova.pdf" e "TJMG 2022 - gabarito.pdf"). <button type="button" class="link-x" id="provRecarregar" style="color:var(--brand)">Atualizar lista</button> · <button type="button" class="link-x" id="padrIniciar" style="color:var(--brand)">Padronizar nomes dos arquivos</button></p>`;
}

async function iniciarSimulado(id, novas, ret) {
  const it = repo.itens.find(i => i.id === id); if (!it) { toast("Esta prova não está mais na pasta do Drive."); return; }
  // ret: retomar uma prova impressa (vai direto à questão e reaproveita o caso inédito que foi impresso)
  sim = { it, novas, i: ret ? ret.i : 0, qs: [], total: 0, resp: {}, geradas: ret && ret.geradas ? ret.geradas : {}, impressa: ret ? ret.chave : "", carregando: "Preparando…" };
  desenharEstudo(it.tipo === "peca" ? "pecas" : "provas");
  try {
    const g = await garantirQuestoes(it, t => { sim.carregando = t; desenharEstudo(estudoAba); });
    sim.carregando = ""; sim.qs = g.questoes.filter(q => q.enunciado); sim.total = g.total || sim.qs.length; sim.banca = g.banca;
    if (novas) sim.modelos = embaralhar(sim.qs.slice()).slice(0, 10);
    desenharEstudo(estudoAba);
    if (it.tipo === "objetiva") completarProva(it);
    if (novas && it.tipo !== "peca") { gerarNova(sim.i); gerarNova(sim.i + 1); }
  } catch (e) { sim.carregando = ""; sim.erro = e.message; desenharEstudo(estudoAba); }
}
// questão inédita no estilo da prova (a partir de uma questão original como modelo)
async function gerarNova(k) {
  if (!sim || sim.geradas[k]) return;
  const m = sim.modelos[k % sim.modelos.length]; if (!m) return;
  const t = sim.it.tipo;
  sim.geradas[k] = { carregando: true };
  const p = `Você é examinador de concursos (banca ${sim.banca || "da prova"}). QUESTÃO ORIGINAL DE MODELO (${m.disciplina || ""}):\n${m.texto_base ? m.texto_base + "\n" : ""}${m.enunciado}\n${(m.alternativas || []).map(a => a.letra + ") " + a.texto).join("\n")}\nGabarito oficial: ${m.gabarito || "-"}\n\n` +
    (t === "objetiva"
      ? `Crie UMA questão INÉDITA no mesmo estilo, formato (${m.tipo === "ce" ? "certo/errado" : "múltipla escolha com o mesmo número de alternativas"}), disciplina e nível, sobre o mesmo tema ou tema vizinho, com base no direito brasileiro vigente. Responda em JSON: {"disciplina": string, "texto_base": string ou "", "enunciado": string, "tipo": "me" ou "ce", "alternativas": [{"letra": "A", "texto": string}] (vazio se certo/errado), "gabarito": letra ou "C"/"E", "comentario": string explicando a correta e os erros das demais}`
      : `Crie UMA questão discursiva INÉDITA no mesmo estilo e nível, sobre o mesmo tema ou tema vizinho. Responda em JSON: {"disciplina": string, "enunciado": string (caso concreto e comando), "linhas": number, "espelho": [{"item": string, "pontos": number}] (somando 10), "resposta_esperada": string}`);
  try { sim.geradas[k] = { q: { ...(await gemini(p)), numero: k + 1, inedita: true } }; }
  catch (e) { sim.geradas[k] = { erro: e.message }; }
  if (sim && estudoAba === "provas" && sim.i === k) desenharEstudo("provas");
}
function questaoAtual() {
  if (!sim) return null;
  if (sim.novas) { const g = sim.geradas[sim.i]; return g && g.q ? g.q : null; }
  return sim.qs[sim.i] || null;
}
function htmlSimulado() {
  const s = sim, nTotal = s.novas ? 10 : (s.total || s.qs.length);
  const topo = `<div class="est-prog"><button type="button" class="mini" id="provSair">‹ Voltar às provas</button><span><b>${esc(s.it.nome)}</b></span>${s.novas ? `<span class="chip">questões inéditas no estilo da prova</span>` : ""}</div>`;
  if (s.erro) return topo + `<p class="note">Não consegui ler esta prova: ${esc(s.erro)}</p>`;
  if (s.carregando) return topo + `<p class="note est-gerando">${esc(s.carregando)}<br>A primeira leitura de cada prova pela IA pode levar até 1 ou 2 minutos; depois fica guardada.</p>`;
  if (s.i >= nTotal) return topo + htmlFimSimulado();
  const q = questaoAtual();
  const cab = `<div class="est-prog">Questão ${s.i + 1} de ${nTotal}${q && q.disciplina ? `<span class="chip">${esc(q.disciplina)}</span>` : ""}${!s.novas && q && q.numero ? `<span class="chip">nº ${q.numero} na prova</span>` : ""}</div>`;
  if (!q) {
    const g = s.novas && s.geradas[s.i];
    if (g && g.erro) return topo + cab + `<p class="note">A IA não respondeu (${esc(g.erro)}).</p><div class="actions"><button type="button" id="provTentar">Tentar de novo</button><button type="button" id="provProx">Pular</button></div>`;
    if (s.novas) gerarNova(s.i);
    return topo + cab + `<p class="note est-gerando">${s.novas ? "Criando questão inédita com a IA Gemini…" : "Carregando as próximas questões da prova…"}</p>`;
  }
  const r = s.resp[s.i];
  let h = topo + cab + (q.texto_base ? `<details class="est-det" open><summary>Texto de apoio</summary><p class="pre">${esc(q.texto_base)}</p></details>` : "") + `<p class="est-enun pre">${esc(q.enunciado)}</p>`;
  if (s.it.tipo === "objetiva") {
    const gab = String(q.gabarito || "").toUpperCase();
    if (gab === "ANULADA") h += `<p class="note">Esta questão foi <b>anulada</b> pela banca e não conta no resultado.</p>`;
    if ((q.tipo === "ce") || !(q.alternativas || []).length) {
      h += r ? "" : `<div class="est-opts"><button type="button" class="opt" data-provresp="C">Certo</button><button type="button" class="opt" data-provresp="E">Errado</button></div>`;
    } else {
      h += `<div class="est-alts">${q.alternativas.map(a => { const L = String(a.letra).toUpperCase(); const cls = r ? (L === gab ? "ok" : (L === r.marcada ? "bad" : "")) : ""; return `<button type="button" class="est-alt ${cls}" data-provresp="${esc(L)}" ${r ? "disabled" : ""}><b>${esc(L)}</b> ${esc(a.texto)}</button>`; }).join("")}</div>`;
    }
    if (r) {
      h += gab && gab !== "ANULADA" ? `<p class="est-res ${r.ok ? "ok" : "bad"}">${r.ok ? "Você acertou" : "Você errou"}: gabarito ${s.novas ? "" : "oficial "}<b>${esc(gab === "C" ? "CERTO" : gab === "E" ? "ERRADO" : gab)}</b>.</p>` : (gab === "ANULADA" ? "" : `<p class="note">Sem gabarito oficial para esta questão.</p>`);
      if (q.comentario) h += `<p class="pre">${esc(q.comentario)}</p>`;
      else if (r.explicacao) h += `<div class="est-det"><p class="est-sub">Explicação da IA</p><p class="pre">${esc(r.explicacao)}</p></div>`;
      else h += `<div class="actions" style="justify-content:flex-start"><button type="button" id="provExplicar">${r.explicando ? "Explicando…" : "Explicar o gabarito com a IA"}</button></div>`;
      h += `<div class="actions"><button type="button" class="primary" id="provProx">${s.i + 1 < nTotal ? "Próxima" : "Ver resultado"}</button></div>`;
    }
  } else h += htmlRespostaEscrita(q, r, "prov");
  return h;
}
// resposta escrita (questão subjetiva ou peça) com correção pela IA
function rascunhoKey() { return "rasc-" + sim.it.id + "-" + sim.i + (sim.novas ? "n" : ""); }
function htmlRespostaEscrita(q, r, pref) {
  let h = "";
  if (!r || r.corrigindo) {
    const rasc = lerProv(rascunhoKey(), "");
    h += `${r && r.corrigindo ? "" : `<div class="est-det manu-box"><p class="est-sub">Treino no papel, como na prova</p>${sim.impressa ? `<p class="impr-aviso">Você já imprimiu esta ${sim.it.tipo === "peca" ? "peça" : "questão"}. Terminou de escrever? Envie as fotos das folhas.</p>` : ""}
        <p class="note">Imprima a prova com a folha de resposta pautada, escreva à mão e depois envie as fotos (ou o PDF escaneado) das folhas: a IA transcreve, corrige, dá a nota e avalia a caligrafia.</p>
        <div class="actions" style="justify-content:flex-start;flex-wrap:wrap"><button type="button" id="provImprimir">Imprimir prova + folha de resposta</button>
        <button type="button" class="primary" id="provFotosBtn">Enviar fotos da resposta manuscrita</button><input type="file" id="provFotos" accept="image/*,application/pdf" multiple hidden></div></div>`}
      <label>Sua resposta digitada <span class="note" id="provLinhas">${q.linhas ? `(até ${q.linhas} linhas)` : ""}</span><textarea id="provTexto" rows="${sim.it.tipo === "peca" ? 22 : 12}" ${r && r.corrigindo ? "disabled" : ""}>${esc(r ? r.texto : rasc)}</textarea></label>
      <p class="note">O rascunho fica salvo neste aparelho enquanto você escreve.</p>
      <div class="actions">${r && r.corrigindo ? `<span class="note est-gerando">${r.manuscrito ? "A IA está lendo a sua letra e corrigindo… pode levar 1 ou 2 minutos." : "Corrigindo com a IA Gemini…"}</span>` : `<button type="button" id="provEspelho">Ver o espelho sem corrigir</button><button type="button" class="primary" id="provCorrigir">Enviar texto digitado para correção</button>`}</div>`;
    return h;
  }
  if (r.correcao) h += htmlCorrecao(r.correcao, q);
  if ((q.espelho || []).length) h += `<details class="est-det"${r.correcao ? "" : " open"}><summary>Espelho ${q.inedita ? "" : "oficial "}de correção</summary><ul class="est-itens">${q.espelho.map(t => `<li>${esc(t.item)} <span class="note">(${esc(String(t.pontos))} pts)</span></li>`).join("")}</ul></details>`;
  if (q.resposta_esperada) h += `<details class="est-det"><summary>Resposta esperada ${q.inedita ? "" : "(padrão oficial)"}</summary><p class="pre">${esc(q.resposta_esperada)}</p></details>`;
  if (!(q.espelho || []).length && !q.resposta_esperada) h += `<p class="note">Esta prova não trouxe espelho oficial; a correção usa a legislação e a jurisprudência.</p>`;
  if (r.texto) h += `<details class="est-det"><summary>${r.manuscrito ? "Sua resposta (transcrição da IA)" : "Sua resposta"}</summary><p class="pre">${esc(r.texto)}</p></details>`;
  h += `<div class="actions"><button type="button" class="primary" id="provProx">${sim.it.tipo === "peca" ? "Concluir" : (sim.i + 1 < (sim.novas ? 10 : (sim.total || sim.qs.length)) ? "Próxima" : "Ver resultado")}</button></div>`;
  return h;
}
function htmlCorrecao(c, q) {
  return `<p class="est-res ${c.nota >= 7 ? "ok" : c.nota >= 5 ? "" : "bad"}">Nota <b>${esc(String(c.nota))}</b> de 10</p>
      <ul class="est-itens">${(c.itens || []).map(t => `<li class="${t.atendido === "sim" ? "ok" : t.atendido === "parcial" ? "parc" : "bad"}"><b>${esc(t.item)}</b> — ${esc(t.atendido)}${t.comentario ? ": " + esc(t.comentario) : ""}</li>`).join("")}</ul>
      ${(c.estrutura || []).length ? `<p class="est-sub">Estrutura da peça</p><ul class="est-itens">${c.estrutura.map(t => `<li class="${t.presente === "sim" ? "ok" : t.presente === "parcial" ? "parc" : "bad"}"><b>${esc(t.elemento)}</b> — ${esc(t.presente)}${t.comentario ? ": " + esc(t.comentario) : ""}</li>`).join("")}</ul>` : ""}
      ${c.caligrafia ? `<div class="est-det"><p class="est-sub">Caligrafia${c.caligrafia.nota != null ? `: <b>${esc(String(c.caligrafia.nota))}</b> de 10` : ""}${c.caligrafia.legibilidade ? ` · legibilidade ${esc(c.caligrafia.legibilidade)}` : ""}${c.linhas_usadas ? ` · ${esc(String(c.linhas_usadas))} linhas usadas${q.linhas ? " de " + q.linhas : ""}` : ""}</p>${c.caligrafia.comentario ? `<p>${esc(c.caligrafia.comentario)}</p>` : ""}${(c.caligrafia.trechos_ilegiveis || []).length ? `<p class="note"><b>Trechos que a IA não conseguiu ler</b> (a banca também os desconsideraria): ${esc(c.caligrafia.trechos_ilegiveis.join(" · "))}</p>` : ""}${(c.caligrafia.dicas || []).length ? `<p class="note"><b>Dicas:</b> ${esc(c.caligrafia.dicas.join("; "))}</p>` : ""}</div>` : ""}
      ${c.pontos_fortes && c.pontos_fortes.length ? `<p><b>Pontos fortes:</b> ${esc(c.pontos_fortes.join("; "))}</p>` : ""}${c.melhorias && c.melhorias.length ? `<p><b>Para melhorar:</b> ${esc(c.melhorias.join("; "))}</p>` : ""}${c.feedback ? `<p class="note">${esc(c.feedback)}</p>` : ""}`;
}
function htmlFimSimulado() {
  registrarObjetiva();
  const vals = Object.values(sim.resp).filter(r => r.conta);
  const ac = vals.filter(r => r.ok).length;
  const porD = {}; Object.entries(sim.resp).forEach(([k, r]) => { if (!r.conta) return; const q = sim.novas ? (sim.geradas[k] || {}).q : sim.qs[k]; const d = (q && q.disciplina) || "Outras"; (porD[d] = porD[d] || [0, 0])[1]++; if (r.ok) porD[d][0]++; });
  if (!sim.novas && sim.it.tipo === "objetiva") { const res = lerProv("resultados", {}); res[sim.it.id] = { acertos: ac, total: vals.length, d: hojeISO() }; gravarProv("resultados", res); }
  return `<div class="est-fim"><div class="vb-n">${vals.length ? Math.round(ac / vals.length * 100) : 0}%</div><p>${ac} acerto(s) em ${vals.length} questão(ões) válidas.</p></div>
    ${Object.keys(porD).length ? `<div class="est-sec"><h4>Por disciplina</h4>${Object.entries(porD).sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1]).map(([d, [a, t]]) => `<div class="est-barra"><span class="est-b-nome">${esc(d)}</span><span class="est-b-tr"><span style="width:${Math.round(a / t * 100)}%"></span></span><span class="est-b-v">${a}/${t}</span></div>`).join("")}</div>` : ""}
    <div class="actions" style="justify-content:center"><button type="button" class="primary" id="provSair">Voltar às provas</button></div>`;
}

// ---------- peças práticas ----------
function htmlPecas() {
  if (padr) return htmlPadronizar();
  if (hist.aberto && !sim) return htmlHistorico();
  if (!hist.lista && !hist.carregando) carregarHistorico();
  if (sim && sim.it.tipo === "peca") return htmlPecaAtiva();
  if (!repo) { carregarRepo(); return `<p class="note est-gerando">Abrindo a pasta Provas Jurídicas no Drive…</p>`; }
  const f = lerProv("filtroPeca", { cargo: "", aba: "estrutura" });
  const pecas = (repo.itens || []).filter(i => i.tipo === "peca");
  const cargos = [...new Set([...CARGOS, ...pecas.map(i => i.cargo).filter(c => c !== "Geral")])];
  const tipos = [...new Set([...(f.cargo ? ESTRUTURAS_PADRAO[f.cargo] || [] : Object.values(ESTRUTURAS_PADRAO).flat()), ...Object.values(lerProv("tiposVistos", {})).filter(x => !f.cargo || cargoPadrao(x.cargo || "") === f.cargo).map(x => x.tipo)])];
  let h = `${htmlImpressas("pecas")}${botaoHistorico("pecas")}<div class="est-opts"><button type="button" class="opt${f.aba === "estrutura" ? " on" : ""}" data-pecaaba="estrutura">Estrutura das peças</button><button type="button" class="opt${f.aba === "praticar" ? " on" : ""}" data-pecaaba="praticar">Praticar peças</button></div>
    ${seletorCargo("pecaCargoSel", cargos, f.cargo)}`;
  if (f.aba === "estrutura") {
    const aberto = f.tipoAberto;
    h += `<p class="note">Escolha a peça para ver os elementos que a banca espera, com o fundamento legal, o que cada parte deve conter, os erros mais comuns e um esqueleto para treinar.</p>
      <div class="est-chips">${tipos.map(t => `<button type="button" class="chip-sel${aberto === t ? " on" : ""}" data-pecatipo="${esc(t)}">${esc(t)}</button>`).join("")}</div>`;
    if (aberto) h += htmlEstrutura(aberto);
    return h;
  }
  const lista = pecas.filter(i => !f.cargo || i.cargo === f.cargo);
  h += htmlEnvio("peca");
  if (repo.erro) return h + `<p class="note">${esc(repo.erro)}</p>`;
  h += lista.length ? lista.map(i => `<div class="prov-item"><div class="prov-tit"><b>${esc(i.nome)}</b><span class="note">${esc(i.pastaCargo || i.cargo)}${i.gab ? " · espelho: " + esc(i.gabNome) : " · sem espelho separado"}${seloRespondida(i)}</span></div>
      <div class="prov-acoes"><button type="button" class="primary" data-provsim="${esc(i.id)}">Fazer esta peça</button><button type="button" data-pecanova="${esc(i.id)}">Caso novo no estilo desta peça</button>${botaoSeparar(i)}</div></div>`).join("")
    : `<p class="note">Nenhuma peça${f.cargo ? " de " + esc(f.cargo) : ""} na pasta. Coloque os PDFs em <b>Provas Jurídicas / Peças jurídicas / ${esc(f.cargo || "cargo")}</b>.</p>`;
  h += `<p class="note"><button type="button" class="link-x" id="provRecarregar" style="color:var(--brand)">Atualizar lista</button> · <button type="button" class="link-x" id="padrIniciar" style="color:var(--brand)">Padronizar nomes dos arquivos</button></p>`;
  return h;
}
function htmlEstrutura(tipo) {
  const e = pecaEstr[tipo];
  if (!e) { carregarEstrutura(tipo); return `<p class="note est-gerando">Montando a estrutura de "${esc(tipo)}" com a IA Gemini…</p>`; }
  if (e.erro) return `<p class="note">${esc(e.erro)}</p><div class="actions" style="justify-content:flex-start"><button type="button" data-pecarefazer="${esc(tipo)}">Tentar de novo</button></div>`;
  if (e.carregando) return `<p class="note est-gerando">Montando a estrutura de "${esc(tipo)}" com a IA Gemini…</p>`;
  const s = e.estrutura || {};
  return `<div class="pec-estr">
    ${s.resumo ? `<p class="pre">${esc(s.resumo)}</p>` : ""}
    <ol class="pec-elem">${(s.elementos || []).map(el => `<li><div class="pec-el-tit"><b>${esc(el.nome)}</b>${el.obrigatorio ? `<span class="chip">obrigatório</span>` : `<span class="chip">recomendado</span>`}${el.fundamento ? `<span class="note">${esc(el.fundamento)}</span>` : ""}</div>
      ${(el.o_que_conter || []).length ? `<ul>${el.o_que_conter.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}${el.dica ? `<p class="note"><b>Dica:</b> ${esc(el.dica)}</p>` : ""}</li>`).join("")}</ol>
    ${(s.erros_comuns || []).length ? `<div class="est-sec"><h4>Erros comuns</h4><ul class="est-itens">${s.erros_comuns.map(x => `<li class="bad">${esc(x)}</li>`).join("")}</ul></div>` : ""}
    ${s.esqueleto ? `<details class="est-det"><summary>Esqueleto da peça para treinar</summary><p class="pre">${esc(s.esqueleto)}</p><div class="actions" style="justify-content:flex-start"><button type="button" data-copiaresq="${esc(tipo)}">Copiar esqueleto</button></div></details>` : ""}
    <p class="note">Gerado pela IA Gemini${e.gerado ? " em " + esc(new Date(e.gerado).toLocaleDateString("pt-BR")) : ""} com base na legislação e na prática das bancas; confira sempre com a lei. <button type="button" class="link-x" data-pecarefazer="${esc(tipo)}" style="color:var(--brand)">Gerar de novo</button></p></div>`;
}
async function carregarEstrutura(tipo, refazer) {
  if (pecaEstr[tipo] && pecaEstr[tipo].carregando) return;
  const local = !refazer && lerProv("estr-" + tipo, null);
  if (local) { pecaEstr[tipo] = local; return; }
  pecaEstr[tipo] = { carregando: true };
  try {
    // espelhos já lidos de peças desse tipo ajudam a IA a seguir o padrão das bancas
    const esp = []; for (const it of (repo && repo.itens || []).filter(i => i.tipo === "peca")) { const g = await questoesGuardadas(it); const q = g && g.questoes[0]; if (q && semAcentoEst(q.tipo_peca) === semAcentoEst(tipo)) esp.push((q.espelho || []).map(e => e.item).join("; ") + " " + (q.resposta_esperada || "")); }
    const r = await postLongo({ acao: "estruturaPeca", tipo, refazer: !!refazer, espelhos: esp.join("\n---\n") }, 180000);
    pecaEstr[tipo] = r.ok ? r : { erro: r.erro || "A IA não respondeu." };
    if (r.ok) gravarProv("estr-" + tipo, r);
  } catch (e) { pecaEstr[tipo] = { erro: e.message }; }
  if (estudoAba === "pecas") desenharEstudo("pecas");
}
function htmlPecaAtiva() {
  const s = sim;
  const topo = `<div class="est-prog"><button type="button" class="mini" id="provSair">‹ Voltar às peças</button><span><b>${esc(s.it.nome)}</b></span>${s.novas ? `<span class="chip">caso inédito</span>` : ""}</div>`;
  if (s.erro) return topo + `<p class="note">Não consegui ler esta peça: ${esc(s.erro)}</p>`;
  if (s.carregando) return topo + `<p class="note est-gerando">${esc(s.carregando)}<br>A primeira leitura de cada peça pela IA pode levar até 1 ou 2 minutos; depois fica guardada.</p>`;
  const q = questaoAtual();
  if (!q) {
    const g = s.novas && s.geradas[0];
    if (g && g.erro) return topo + `<p class="note">A IA não respondeu (${esc(g.erro)}).</p><div class="actions"><button type="button" id="provTentar">Tentar de novo</button></div>`;
    if (s.novas) gerarPecaNova();
    return topo + `<p class="note est-gerando">Criando um caso inédito com a IA Gemini…</p>`;
  }
  if (q.tipo_peca) { const tv = lerProv("tiposVistos", {}); if (!tv[q.tipo_peca]) { tv[q.tipo_peca] = { tipo: q.tipo_peca, cargo: s.it.cargo }; gravarProv("tiposVistos", tv); } }
  const e = q.tipo_peca && pecaEstr[q.tipo_peca];
  if (q.tipo_peca && !e) carregarEstrutura(q.tipo_peca);
  const els = e && e.estrutura && e.estrutura.elementos || [];
  const r = s.resp[0];
  return topo + `${q.linhas ? `<div class="est-prog"><span class="chip">até ${q.linhas} linhas</span></div>` : ""}
    <details class="est-det" open><summary>Enunciado</summary><p class="pre">${esc(q.enunciado)}</p></details>
    ${els.length ? `<details class="est-det"><summary>Roteiro da estrutura (revela qual é a peça)</summary><ol class="pec-roteiro">${els.map(x => `<li><b>${esc(x.nome)}</b>${x.fundamento ? ` <span class="note">${esc(x.fundamento)}</span>` : ""}</li>`).join("")}</ol></details>` : ""}
    ${htmlRespostaEscrita(q, r, "peca")}`;
}
async function gerarPecaNova() {
  if (!sim || sim.geradas[0]) return;
  const m = sim.qs[0]; if (!m) return;
  sim.geradas[0] = { carregando: true };
  const p = `Você é examinador de prova prática de concurso (banca ${sim.banca || "da prova"}). PEÇA ORIGINAL DE MODELO (${m.tipo_peca || ""}):\n${m.enunciado.slice(0, 12000)}\n\nCrie UM caso INÉDITO para a mesma peça (${m.tipo_peca || "mesmo tipo"}), com o mesmo nível de complexidade, fatos, provas e questões processuais e de mérito para o candidato resolver, com base no direito brasileiro vigente. Responda em JSON: {"tipo_peca": string, "enunciado": string (caso completo e comando), "linhas": number, "espelho": [{"item": string, "pontos": number}] (somando 10), "resposta_esperada": string (os pontos principais da peça esperada)}`;
  try { sim.geradas[0] = { q: { ...(await gemini(p)), inedita: true } }; } catch (e) { sim.geradas[0] = { erro: e.message }; }
  if (sim && estudoAba === "pecas") desenharEstudo("pecas");
}
async function corrigirEscrita(q, texto, partes) {
  const tipo = sim.it.tipo, e = q.tipo_peca && pecaEstr[q.tipo_peca], els = e && e.estrutura && e.estrutura.elementos || [];
  const p = `Você é examinador de concurso (banca ${sim.banca || ""}). Corrija com rigor e justiça a resposta do candidato.\n\n${tipo === "peca" ? "PEÇA PRÁTICA (" + (q.tipo_peca || "") + ")" : "QUESTÃO DISCURSIVA"}:\n${q.enunciado}\n\n` +
    ((q.espelho || []).length ? `ESPELHO ${q.inedita ? "" : "OFICIAL "}DE CORREÇÃO:\n${q.espelho.map(x => `- ${x.item} (${x.pontos} pts)`).join("\n")}\n\n` : "") +
    (q.resposta_esperada ? `RESPOSTA ESPERADA:\n${q.resposta_esperada}\n\n` : "") +
    (els.length ? `ELEMENTOS DE ESTRUTURA ESPERADOS:\n${els.map(x => "- " + x.nome).join("\n")}\n\n` : "") +
    (partes ? `RESPOSTA DO CANDIDATO: está MANUSCRITA nas imagens/PDF anexos (folhas em ordem). Primeiro transcreva fielmente o texto, sem corrigir nada; o que não for possível ler, marque como [ilegível] e DESCONSIDERE na nota, como faz a banca. Avalie também a caligrafia como um examinador: legibilidade, traçado, espaçamento, margens, rasuras e respeito às linhas e ao limite de ${q.linhas || "linhas"}; texto além do limite não conta.\n\n` : `RESPOSTA DO CANDIDATO:\n${texto}\n\n`) +
    `Avalie item por item do espelho (ou, sem espelho, os pontos jurídicos essenciais), a técnica, a fundamentação e a clareza${tipo === "peca" ? ", e confira cada elemento da estrutura da peça" : ""}. Responda em JSON: {${partes ? '"transcricao": string, "linhas_usadas": number, "caligrafia": {"nota": number de 0 a 10, "legibilidade": "boa"|"regular"|"ruim", "comentario": string, "trechos_ilegiveis": [string], "dicas": [string]}, ' : ""}"nota": number de 0 a 10 com uma casa decimal, "itens": [{"item": string, "atendido": "sim"|"parcial"|"não", "comentario": string}]${tipo === "peca" ? ', "estrutura": [{"elemento": string, "presente": "sim"|"parcial"|"não", "comentario": string}]' : ""}, "pontos_fortes": [string], "melhorias": [string], "feedback": string curto}`;
  return gemini(p, partes ? { partes, ms: 300000 } : undefined);
}

// ---------- prova no papel: impressão e correção do manuscrito ----------
function imprimirProvaReal(q) {
  const s = sim, peca = s.it.tipo === "peca";
  const qs = peca || s.novas ? [q] : (s.qs || []).filter(x => x.enunciado);
  const nome = s.it.nome.replace(/\s*-\s*(prova subjetiva|pe[çc]a pr[áa]tica)(\s*\(\d+\))?\s*$/i, "");
  const folha = (x, n) => { const L = x.linhas || (peca ? 60 : 30); let h = `<section class="pr-folha"><div class="pr-fcab"><b>FOLHA DE TEXTO DEFINITIVO</b><span>${peca ? "Peça prática" : "Questão " + esc(String(x.numero || n))}</span><span>Limite: ${L} linhas</span></div><ol class="pr-linhas">`; for (let i = 1; i <= L; i++) h += "<li></li>"; return h + "</ol></section>"; };
  let h = `<div class="pr-capa"><h1>${esc(nome)}</h1><p>${esc(s.it.pastaCargo || s.it.cargo || "")} · Prova ${peca ? "prática (peça profissional)" : "discursiva"}${s.novas ? " · caso inédito" : ""}</p>
    <div class="pr-ident"><span>Nome: ______________________________________________</span><span>Data: ____/____/______</span><span>Início: ____h____ · Término: ____h____</span></div>
    <ul class="pr-instr"><li>Use caneta esferográfica de tinta preta, fabricada em material transparente.</li><li>Escreva com letra legível: o que não puder ser lido será desconsiderado.</li><li>Respeite o limite de linhas da folha de texto definitivo; o que passar dele não será corrigido.</li><li>Não assine nem se identifique no corpo do texto; use apenas dados fornecidos no enunciado e não crie fatos novos.</li></ul></div>`;
  qs.forEach((x, n) => { h += `<section class="pr-q"><h2>${peca ? "Peça prática" : "Questão " + esc(String(x.numero || n + 1))}${x.pontos ? ` <small>(${esc(String(x.pontos))} pontos)</small>` : ""}</h2><p class="pre">${esc(x.enunciado)}</p></section>`; });
  qs.forEach((x, n) => { h += folha(x, n + 1); });
  $("impressao").innerHTML = h;
  registrarImpressa(qs);
  setTimeout(() => window.print(), 50);
}
// provas impressas aguardando a resposta manuscrita: ficam em destaque até todas as questões serem corrigidas
function impressasPendentes(area) { return lerProv("impressas", []).filter(x => !area || (area === "info" ? x.tipo === "info" && !x.lei : area === "lei" ? x.tipo === "info" && !!x.lei : x.tipo !== "info" && (area === "pecas") === (x.tipo === "peca"))); }
const abaCartao = () => cartao && cartao.info ? "praticar" : "provas";
function registrarImpressa(qs) {
  const s = sim, lista = lerProv("impressas", []);
  const idx = s.it.tipo === "peca" || s.novas ? [s.i] : qs.map(q => s.qs.indexOf(q));
  const chave = s.impressa || (s.it.id + (s.novas ? "-n" + Date.now() : ""));
  const reg = { chave, id: s.it.id, nome: s.it.nome, tipo: s.it.tipo, novas: !!s.novas, quando: new Date().toISOString(), qs: idx.map((i, n) => ({ i, numero: (qs[n] && qs[n].numero) || i + 1, ...(s.novas ? { q: qs[n] } : {}) })), feitas: {} };
  const velho = lista.find(x => x.chave === chave); if (velho) reg.feitas = velho.feitas || {};
  gravarProv("impressas", [reg, ...lista.filter(x => x.chave !== chave)]); salvarImpressasNuvem();
  s.impressa = chave;
}
function marcarImpressaFeita(nota) {
  if (!sim || !sim.impressa) return;
  const lista = lerProv("impressas", []), reg = lista.find(x => x.chave === sim.impressa); if (!reg) return;
  reg.feitas[sim.i] = nota;
  const resto = reg.qs.filter(x => reg.feitas[x.i] === undefined);
  gravarProv("impressas", resto.length ? lista : lista.filter(x => x !== reg)); salvarImpressasNuvem();
  if (!resto.length) toast("Simulado no papel concluído: todas as questões impressas foram corrigidas.");
}
function retomarImpressa(chave, i) {
  const reg = lerProv("impressas", []).find(x => x.chave === chave); if (!reg) return;
  const alvo = reg.qs.find(x => x.i === +i) || reg.qs.find(x => reg.feitas[x.i] === undefined) || reg.qs[0];
  const geradas = {}; if (reg.novas) reg.qs.forEach(x => { if (x.q) geradas[x.i] = { q: x.q }; });
  iniciarSimulado(reg.id, reg.novas, { i: alvo.i, geradas, chave });
}
function htmlImpressas(area) {
  const lista = impressasPendentes(area); if (!lista.length) return "";
  return `<div class="impr-box"><p class="est-sub">Impressas, aguardando as suas respostas</p>${lista.map(x => {
    const d = new Date(x.quando), quando = isNaN(d) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const varias = x.qs.length > 1 && !x.objetiva;
    if (x.objetiva) return `<div class="impr-item"><div><b>${esc(x.nome)}</b> <span class="chip">prova objetiva</span><br><span class="note">impressa em ${esc(quando)}</span></div>
      <div class="prov-acoes"><button type="button" class="primary" data-impcartao="${esc(x.chave)}">Lançar o cartão-resposta</button><button type="button" class="link-x" data-imprremover="${esc(x.chave)}">remover</button></div></div>`;
    return `<div class="impr-item"><div><b>${esc(x.nome)}</b>${x.novas ? ` <span class="chip">caso inédito</span>` : ""}<br><span class="note">impressa em ${esc(quando)}${varias ? ` · ${x.qs.filter(q => x.feitas[q.i] !== undefined).length} de ${x.qs.length} questões corrigidas` : ""}</span></div>
      <div class="prov-acoes">${varias ? x.qs.map(q => x.feitas[q.i] !== undefined ? `<button type="button" disabled>Questão ${esc(String(q.numero))} ✓ ${esc(String(x.feitas[q.i]))}</button>` : `<button type="button" class="primary" data-imprabrir="${esc(x.chave)}" data-impri="${q.i}">Enviar resposta da questão ${esc(String(q.numero))}</button>`).join("")
        : `<button type="button" class="primary" data-imprabrir="${esc(x.chave)}" data-impri="${x.qs[0].i}">Enviar fotos da resposta</button>`}<button type="button" class="link-x" data-imprremover="${esc(x.chave)}">remover</button></div></div>`;
  }).join("")}</div>`;
}
// ---------- prova objetiva no papel: impressão com cartão-resposta e correção pela foto do cartão ----------
let imprimindo = {}, cartao = null;   // cartao: { it, qs, resp: {numero: letra}, chave, lendo, resultado }
async function imprimirObjetiva(id) {
  const it = repo.itens.find(i => i.id === id); if (!it || imprimindo[id]) return;
  const msg = t => { imprimindo[id] = t; if (estudoAba === "provas" && !sim && !cartao) desenharEstudo("provas"); };
  try {
    msg("Lendo a prova…");
    let g = await garantirQuestoes(it, () => msg("Lendo a prova com a IA…"));
    while (g && g.total && g.questoes.length < g.total) {   // a prova inteira precisa estar lida
      msg(`Lendo a prova: ${g.questoes.length} de ${g.total} questões…`);
      const antes = g.questoes.length; await completarProva(it); g = await questoesGuardadas(it);
      if (!g || g.questoes.length === antes) break;
    }
    const qs = (g && g.questoes || []).filter(q => q.enunciado);
    if (!qs.length) throw new Error("a IA não encontrou as questões");
    if (g.total && qs.length < g.total) toast(`Atenção: só ${qs.length} de ${g.total} questões foram lidas; a impressão sai com essas.`);
    $("impressao").innerHTML = htmlProvaObjetivaPapel(it, qs);
    const lista = lerProv("impressas", []), chave = it.id + "-obj";
    gravarProv("impressas", [{ chave, id: it.id, nome: it.nome, tipo: "objetiva", objetiva: true, quando: new Date().toISOString(), qs: [{ i: 0, numero: 1 }], feitas: {} }, ...lista.filter(x => x.chave !== chave)]); salvarImpressasNuvem();
    delete imprimindo[id]; desenharEstudo(estudoAba);
    setTimeout(() => window.print(), 80);
  } catch (e) { delete imprimindo[id]; toast("Não foi possível montar a prova: " + e.message); desenharEstudo(estudoAba); }
}
function htmlProvaObjetivaPapel(it, qs) {
  const ce = qs.every(q => q.tipo === "ce" || !(q.alternativas || []).length);
  let h = `<div class="pr-capa"><h1>${esc(it.nome.replace(/\s*-\s*prova objetiva/i, ""))}</h1><p>${esc(it.pastaCargo || it.cargo || "")} · Prova objetiva · ${qs.length} questões</p>
    <div class="pr-ident"><span>Nome: ______________________________________________</span><span>Data: ____/____/______</span><span>Início: ____h____ · Término: ____h____</span></div>
    <ul class="pr-instr"><li>Marque as respostas no <b>cartão-resposta</b> (última folha), preenchendo totalmente o círculo com caneta esferográfica preta.</li><li>Marque uma única opção por questão; marcação dupla ou rasurada anula a questão.</li>${ce ? "<li>Julgue cada item como CERTO (C) ou ERRADO (E). Em provas Cebraspe, cada item errado anula um certo; se não souber, deixe em branco.</li>" : ""}<li>Ao terminar, fotografe o cartão-resposta e envie pelo app para corrigir.</li></ul></div><div class="pr-cols">`;
  qs.forEach(q => {
    h += `<div class="pr-oq"><p><b>Questão ${esc(String(q.numero))}</b>${q.disciplina ? ` <small>· ${esc(q.disciplina)}</small>` : ""}</p>${q.texto_base ? `<p class="pr-base">${esc(q.texto_base)}</p>` : ""}<p class="pre">${esc(q.enunciado)}</p>
      ${(q.alternativas || []).length ? `<ol class="pr-alts">${q.alternativas.map(a => `<li><b>(${esc(a.letra)})</b> ${esc(a.texto)}</li>`).join("")}</ol>` : ""}</div>`;
  });
  h += `</div><section class="pr-folha pr-cartao"><div class="pr-fcab"><b>CARTÃO-RESPOSTA</b><span>${esc(it.nome.replace(/\s*-\s*prova objetiva/i, ""))}</span><span>Nome: ____________________</span></div><div class="pr-bolhas">`;
  qs.forEach(q => {
    const letras = (q.alternativas || []).length && q.tipo !== "ce" ? q.alternativas.map(a => a.letra) : ["C", "E"];
    h += `<div class="pr-linha"><b>${String(q.numero).padStart(2, "0")}</b>${letras.map(L => `<span class="pr-bolha">${esc(L)}</span>`).join("")}</div>`;
  });
  return h + `</div></section>`;
}
function abrirCartao(chave) {
  const reg = lerProv("impressas", []).find(x => x.chave === chave), id = reg ? reg.id : chave.replace(/-obj$/, "");
  const it = repo && repo.itens.find(i => i.id === id); if (!it) { toast("Esta prova não está mais na pasta do Drive."); return; }
  cartao = { it, qs: [], resp: {}, chave, carregando: true }; desenharEstudo("provas");
  questoesGuardadas(it).then(g => { if (!cartao) return; cartao.carregando = false; cartao.qs = (g && g.questoes || []).filter(q => q.enunciado); cartao.banca = g && g.banca; desenharEstudo("provas"); });
}
const letrasDe = q => (q.alternativas || []).length && q.tipo !== "ce" ? q.alternativas.map(a => a.letra) : ["C", "E"];
function htmlCartao() {
  const c = cartao, topo = `<div class="est-prog"><button type="button" class="mini" id="cartSair">‹ Voltar</button><b>${esc(c.it.nome)}</b><span class="chip">cartão-resposta</span></div>`;
  if (c.carregando) return topo + `<p class="note est-gerando">Abrindo a prova…</p>`;
  if (!c.qs.length) return topo + `<p class="note">Não encontrei as questões desta prova neste aparelho. Use "Imprimir prova + cartão-resposta" de novo para o app ler a prova.</p>`;
  if (c.resultado) {
    const r = c.resultado;
    return topo + `<div class="est-fim"><div class="vb-n">${Math.round(r.acertos / Math.max(1, r.total) * 100)}%</div><p><b>${r.acertos}</b> certa(s), <b>${r.erradas.length}</b> errada(s) e ${r.branco} em branco, de ${r.total} questões válidas${r.anuladas ? ` (${r.anuladas} anulada(s) não contam)` : ""}.</p>${r.liquida != null ? `<p class="note">Nota líquida no critério Cebraspe (certas − erradas): <b>${r.liquida}</b></p>` : ""}</div>
      ${r.erradas.length ? `<div class="est-sec"><h4>Questões que você errou</h4>${r.erradas.map(q => `<details class="est-det"><summary>Questão ${esc(String(q.numero))} · você: <b>${esc(c.resp[q.numero] || "—")}</b> · gabarito: <b>${esc(q.gabarito)}</b>${q.disciplina ? ` <span class="note">${esc(q.disciplina)}</span>` : ""}</summary><p class="pre">${esc(q.enunciado)}</p>${(q.alternativas || []).map(a => `<p class="${a.letra === q.gabarito ? "h-ok" : a.letra === c.resp[q.numero] ? "h-bad" : ""}">(${esc(a.letra)}) ${esc(a.texto)}</p>`).join("")}</details>`).join("")}</div>` : ""}
      <p class="note">O resultado entrou no seu histórico.</p><div class="actions"><button type="button" class="primary" id="cartSair">Voltar</button></div>`;
  }
  const preenchidas = c.qs.filter(q => c.resp[q.numero]).length;
  return topo + `<div class="est-det manu-box"><p class="est-sub">1. Envie a foto do cartão-resposta</p><p class="note">A IA lê as marcações. Confira e corrija abaixo o que ela leu antes de corrigir. Pode mandar mais de uma foto se o cartão tiver várias partes.</p>
      <div class="actions" style="justify-content:flex-start">${c.lendo ? `<span class="note est-gerando">A IA está lendo o cartão… pode levar 1 minuto.</span>` : `<button type="button" class="primary" id="cartFotoBtn">Enviar foto do cartão-resposta</button>`}<input type="file" id="cartFotos" accept="image/*,application/pdf" multiple hidden></div></div>
    <p class="est-sub">2. Confira as respostas <span class="note">(${preenchidas} de ${c.qs.length} marcadas; também dá para lançar à mão)</span></p>
    <div class="cart-grid">${c.qs.map(q => `<label class="cart-q"><b>${esc(String(q.numero))}</b><select data-cartq="${esc(String(q.numero))}"><option value="">—</option>${letrasDe(q).map(L => `<option${c.resp[q.numero] === L ? " selected" : ""}>${esc(L)}</option>`).join("")}</select></label>`).join("")}</div>
    <div class="actions"><button type="button" class="primary" id="cartCorrigir" ${preenchidas ? "" : "disabled"}>Corrigir</button></div>`;
}
async function lerCartaoFoto(files) {
  const c = cartao; if (!c || !files.length) return;
  c.lendo = true; desenharEstudo(abaCartao());
  try {
    const partes = await Promise.all([...files].slice(0, 6).map(fotoParaParte));
    const p = `As imagens são fotos de um CARTÃO-RESPOSTA de prova objetiva preenchido à mão (círculos com letras; a resposta é o círculo pintado/preenchido). As questões são numeradas: ${c.qs.map(q => `${q.numero} (${letrasDe(q).join("/")})`).join(", ")}. Para cada número, diga qual letra está marcada. Se nenhuma estiver marcada, ou se houver mais de uma, ou rasura, use "". Responda em JSON: {"respostas": {"<número>": "<letra ou vazio>"}, "observacao": string curta sobre a legibilidade da foto}`;
    const r = await gemini(p, { partes, ms: 300000 });
    let n = 0; Object.entries(r.respostas || {}).forEach(([k, v]) => { const q = c.qs.find(x => String(x.numero) === String(k)); const L = String(v || "").trim().toUpperCase(); if (q && letrasDe(q).includes(L)) { c.resp[q.numero] = L; n++; } });
    toast(`A IA leu ${n} de ${c.qs.length} marcações. Confira antes de corrigir.${r.observacao ? " " + r.observacao : ""}`);
  } catch (e) { toast("A IA não conseguiu ler o cartão (" + e.message + "). Lance as respostas à mão."); }
  c.lendo = false; if (cartao === c) desenharEstudo(abaCartao());
}
function corrigirCartao() {
  const c = cartao; let acertos = 0, branco = 0, anuladas = 0; const erradas = [], questoes = [];
  c.qs.forEach(q => {
    const gab = String(q.gabarito || "").toUpperCase(), m = c.resp[q.numero] || "";
    if (gab === "ANULADA") { anuladas++; questoes.push({ n: q.numero, disc: q.disciplina || "Outras", marcada: m || "—", gab, ok: false, anulada: true }); return; }
    if (!m) { branco++; questoes.push({ n: q.numero, disc: q.disciplina || "Outras", marcada: "—", gab, ok: false, branco: true }); return; }
    const ok = m === gab; if (ok) acertos++; else erradas.push(q);
    questoes.push({ n: q.numero, disc: q.disciplina || "Outras", marcada: m, gab, ok, ...(!ok ? { enun: String(q.enunciado || "").slice(0, 400) } : {}) });
  });
  const ce = c.qs.every(q => q.tipo === "ce" || !(q.alternativas || []).length);
  const respondidas = acertos + erradas.length, total = respondidas + branco;
  c.resultado = { acertos, erradas, branco, anuladas, total, liquida: ce ? acertos - erradas.length : null };
  if (c.info) registrarInfoPapel(c.reg, c.qs.map(q => ({ marcada: c.resp[q.numero] || "", nota: c.resp[q.numero] && c.resp[q.numero] === String(q.gabarito || "").toUpperCase() ? 1 : 0 })));
  else registrarHist({ tipo: "objetiva", prova: c.it.id, nome: c.it.nome, novas: false, papel: true, chave: c.it.id, acertos, total, nota: acertos / Math.max(1, total) * 10, questoes });
  const lista = lerProv("impressas", []); gravarProv("impressas", lista.filter(x => x.chave !== c.chave)); salvarImpressasNuvem();
  desenharEstudo(abaCartao()); $("estudoConteudo").scrollTop = 0;
}

// fotos ficam com até 2000 px no lado maior (legível para a IA e leve para enviar)
function fotoParaParte(f) {
  if (f.type === "application/pdf") return lerBase64(f).then(data => ({ inline_data: { mime_type: "application/pdf", data } }));
  return new Promise((ok, falha) => {
    const url = URL.createObjectURL(f), img = new Image();
    img.onload = () => { const k = Math.min(1, 2000 / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); ok({ inline_data: { mime_type: "image/jpeg", data: c.toDataURL("image/jpeg", 0.85).split(",")[1] } }); };
    img.onerror = () => falha(new Error(`não consegui abrir "${f.name}"`)); img.src = url;
  });
}
async function corrigirManuscrito(files) {
  const q = questaoAtual(); if (!sim || !q || !files.length) return;
  const k = sim.it.tipo === "peca" ? 0 : sim.i, aba = estudoAba;
  if (files.length > 12) { toast("Envie no máximo 12 folhas."); return; }
  sim.resp[k] = { texto: "", corrigindo: true, manuscrito: true }; desenharEstudo(aba);
  try {
    const partes = await Promise.all([...files].map(fotoParaParte));
    if (partes.reduce((t, x) => t + x.inline_data.data.length, 0) > 35e6) throw new Error("os arquivos são grandes demais; envie fotos em vez de PDF");
    const c = await corrigirEscrita(q, "", partes);
    sim.resp[k] = { texto: c.transcricao || "", correcao: c, conta: true, ok: +c.nota >= 6, manuscrito: true };
    registrarEscrita(q, c, "manuscrita", c.transcricao, partes);
    marcarImpressaFeita(c.nota);
  } catch (e) { sim.resp[k] = undefined; delete sim.resp[k]; toast("A IA não conseguiu corrigir o manuscrito (" + e.message + ")."); }
  if (sim) desenharEstudo(aba);
}
document.addEventListener("change", e => {
  if (e.target.id === "provFotos" && e.target.files.length) corrigirManuscrito(e.target.files);
  if (e.target.id === "cartFotos" && e.target.files.length) lerCartaoFoto(e.target.files);
  if (e.target.dataset && e.target.dataset.cartq && cartao) { const n = e.target.dataset.cartq, q = cartao.qs.find(x => String(x.numero) === n); if (q) { if (e.target.value) cartao.resp[q.numero] = e.target.value; else delete cartao.resp[q.numero]; } const b = $("cartCorrigir"); if (b) b.disabled = !Object.keys(cartao.resp).length; }
});

// ---------- eventos ----------
function seletorCargo(id, cargos, atual) {
  return `<label class="sel-cargo">Cargo <select id="${id}"><option value="">Todos os cargos</option>${cargos.map(c => `<option${c === atual ? " selected" : ""}>${esc(c)}</option>`).join("")}</select></label>`;
}
document.addEventListener("change", e => {
  const id = e.target.id;
  if (id === "provCargoSel") { const f = lerProv("filtro", { tipo: "objetiva", cargo: "" }); f.cargo = e.target.value; gravarProv("filtro", f); desenharEstudo("provas"); }
  if (id === "pecaCargoSel") { const f = lerProv("filtroPeca", { cargo: "", aba: "estrutura" }); f.cargo = e.target.value; f.tipoAberto = ""; gravarProv("filtroPeca", f); desenharEstudo("pecas"); }
});
document.addEventListener("click", async e => {
  if (!e.target.closest("#estudoConteudo")) return;
  const t = e.target.closest("button"); if (!t) return;
  const f = lerProv("filtro", { tipo: "objetiva", cargo: "" }), fp = lerProv("filtroPeca", { cargo: "", aba: "estrutura" });
  if (t.dataset.provtipo) { f.tipo = t.dataset.provtipo; gravarProv("filtro", f); desenharEstudo("provas"); return; }
  if (t.dataset.pecaaba) { fp.aba = t.dataset.pecaaba; gravarProv("filtroPeca", fp); desenharEstudo("pecas"); return; }
  if (t.dataset.pecatipo) { fp.tipoAberto = fp.tipoAberto === t.dataset.pecatipo ? "" : t.dataset.pecatipo; gravarProv("filtroPeca", fp); desenharEstudo("pecas"); return; }
  if (t.dataset.pecarefazer) { delete pecaEstr[t.dataset.pecarefazer]; carregarEstrutura(t.dataset.pecarefazer, true); desenharEstudo("pecas"); return; }
  if (t.dataset.copiaresq) { const s = pecaEstr[t.dataset.copiaresq]; try { await navigator.clipboard.writeText(s.estrutura.esqueleto); toast("Esqueleto copiado."); } catch (err) {} return; }
  if (t.dataset.provsep) { separarProvaGabarito(t.dataset.provsep); return; }
  if (t.id === "envEnviar") { enviarParaDrive(); return; }
  if (t.id === "padrIniciar") { iniciarPadronizacao(estudoAba); return; }
  if (t.id === "padrSair") { const a = padr && padr.area; padr = null; desenharEstudo(a || estudoAba); return; }
  if (t.id === "padrRenomear" && padr && padr.fase === "conferir") { renomearPadronizados(); return; }
  if (t.id === "padrIdentificar" && padr && padr.fase === "escolher") { identificarSelecionados(); return; }
  if (t.dataset.padrmarcar && padr) { const m = t.dataset.padrmarcar; padr.itens.forEach(x => x.sel = m === "todos" ? true : m === "nenhum" ? false : !noPadrao(x.it)); desenharEstudo(estudoAba); return; }
  if (t.id === "provRecarregar") { repo = null; carregarRepo(true); desenharEstudo(estudoAba); return; }
  if (t.dataset.provimpr) { imprimirObjetiva(t.dataset.provimpr); return; }
  if (t.dataset.impcartao) { abrirCartao(t.dataset.impcartao); return; }
  if (t.id === "cartSair") { const aba = abaCartao(); cartao = null; desenharEstudo(aba); return; }
  if (t.id === "cartFotoBtn") { $("cartFotos").click(); return; }
  if (t.id === "cartCorrigir" && cartao) { corrigirCartao(); return; }
  if (t.dataset.imprabrir) { retomarImpressa(t.dataset.imprabrir, t.dataset.impri); return; }
  if (t.dataset.imprremover) { gravarProv("impressas", lerProv("impressas", []).filter(x => x.chave !== t.dataset.imprremover)); salvarImpressasNuvem(); desenharEstudo(estudoAba); return; }
  if (t.dataset.provsim) { iniciarSimulado(t.dataset.provsim, false); return; }
  if (t.dataset.provnovas) { iniciarSimulado(t.dataset.provnovas, true); return; }
  if (t.dataset.pecanova) { iniciarSimulado(t.dataset.pecanova, true); return; }
  if (!sim) return;
  if (t.id === "provSair") { registrarObjetiva(); const aba = sim.it.tipo === "peca" ? "pecas" : "provas"; sim = null; desenharEstudo(aba); return; }
  const q = questaoAtual(), k = sim.it.tipo === "peca" ? 0 : sim.i;
  if (t.id === "provTentar") { delete sim.geradas[sim.i]; desenharEstudo(estudoAba); return; }
  if (t.dataset.provresp && q && !sim.resp[k]) {
    const gab = String(q.gabarito || "").toUpperCase(), conta = gab && gab !== "ANULADA";
    sim.resp[k] = { marcada: t.dataset.provresp, ok: conta && t.dataset.provresp === gab, conta };
    desenharEstudo("provas"); return;
  }
  if (t.id === "provExplicar" && q) {
    sim.resp[k].explicando = true; desenharEstudo("provas");
    try {
      const r = await gemini(`Questão de concurso (${sim.banca || ""}, ${q.disciplina || ""}):\n${q.texto_base || ""}\n${q.enunciado}\n${(q.alternativas || []).map(a => a.letra + ") " + a.texto).join("\n")}\nGabarito oficial: ${q.gabarito}\n\nExplique de forma objetiva por que o gabarito oficial está correto e, se houver alternativas, por que as demais estão erradas, citando a lei e a jurisprudência pertinentes. Responda em JSON: {"explicacao": string}`);
      sim.resp[k].explicacao = r.explicacao || "";
    } catch (err) { toast("A IA não respondeu agora (" + err.message + ")."); }
    sim.resp[k].explicando = false; desenharEstudo("provas"); return;
  }
  if (t.id === "provEspelho" && q) { sim.resp[k] = { texto: ($("provTexto") || {}).value || "" }; desenharEstudo(estudoAba); return; }
  if (t.id === "provCorrigir" && q) {
    const texto = (($("provTexto") || {}).value || "").trim();
    if (texto.length < 60) { toast("Escreva a sua resposta antes de enviar."); return; }
    sim.resp[k] = { texto, corrigindo: true }; desenharEstudo(estudoAba);
    try { const c = await corrigirEscrita(q, texto); sim.resp[k] = { texto, correcao: c, conta: true, ok: +c.nota >= 6 }; registrarEscrita(q, c, "digitada", texto); try { localStorage.removeItem(chaveEst("prov-" + rascunhoKey())); } catch (err) {} }
    catch (err) { sim.resp[k] = { texto }; toast("A IA não conseguiu corrigir agora (" + err.message + "). Veja o espelho."); }
    desenharEstudo(estudoAba); return;
  }
  if (t.id === "provImprimir" && q) { imprimirProvaReal(q); return; }
  if (t.id === "provFotosBtn") { $("provFotos").click(); return; }
  if (t.id === "provProx") {
    if (sim.it.tipo === "peca") { const aba = "pecas"; sim = null; desenharEstudo(aba); return; }
    sim.i++; if (sim.novas) { gerarNova(sim.i); gerarNova(sim.i + 1); }
    desenharEstudo("provas"); $("estudoConteudo").scrollTop = 0; return;
  }
});
document.addEventListener("input", e => {
  if (e.target.dataset && e.target.dataset.padrsel !== undefined && padr) { padr.itens[+e.target.dataset.padrsel].sel = e.target.checked; const sc = $("estudoConteudo").scrollTop; desenharEstudo(estudoAba); $("estudoConteudo").scrollTop = sc; return; }
  if (e.target.dataset && e.target.dataset.padrren !== undefined && padr) { padr.itens[+e.target.dataset.padrren].ren = e.target.checked; const sc = $("estudoConteudo").scrollTop; desenharEstudo(estudoAba); $("estudoConteudo").scrollTop = sc; return; }
  if (e.target.dataset && e.target.dataset.padr !== undefined && padr) { const x = padr.itens[+e.target.dataset.padr]; if (e.target.dataset.papel === "p") x.nomeProva = e.target.value; else x.nomeGab = e.target.value; return; }
  if (e.target.id !== "provTexto" || !sim) return;
  gravarProv(rascunhoKey(), e.target.value);
  const el = $("provLinhas"), q = questaoAtual(); const l = Math.ceil(e.target.value.length / 75);
  if (el) el.textContent = `(~${l} linha${l === 1 ? "" : "s"}${q && q.linhas ? " de " + q.linhas : ""})`;
});

document.addEventListener("toggle", e => { if (e.target.id === "envBox") envio.aberto = e.target.open; }, true);

// fechar a janela de estudo também sai da prova/peça aberta (o rascunho fica salvo)
document.addEventListener("close", e => { if (e.target.id === "dlgEstudo") { sim = null; padr = null; cartao = null; } }, true);
