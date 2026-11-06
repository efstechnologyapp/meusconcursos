// Informativos no papel: gera uma prova (objetiva ou discursiva) a partir dos julgados, imprime como prova real
// e depois corrige pela foto do cartão-resposta (objetivas) ou da resposta manuscrita (discursivas).
// A prova impressa fica na lista "impressas" (sincronizada na nuvem) até ser corrigida; o resultado vai para o histórico.

let papelInfo = { gerando: null, disc: null };   // disc: { chave, k, corrigindo }
const TITULO_MODO = { ce: "Certo ou errado", me: "Múltipla escolha", disc: "Discursiva", lacuna: "Complete a lacuna" };

// gera todas as questões de uma vez e abre a impressão; opc: { lista, modo, gerador, nome, titulo }
async function gerarProvaInfoPapel(opc) {
  if (papelInfo.gerando) return;
  const filtro = lerEst("filtro", { modo: "ce", discs: [], tribs: ["STF", "STJ", "TSE"], n: 10 });
  const o = opc || {}, modo = o.modo || filtro.modo;
  const lista = o.lista || escolherJulgados({ ...filtro, soErros: false }, filtro.n);
  if (!lista.length) { toast("Nenhum julgado com esses filtros."); return; }
  papelInfo.gerando = { k: 0, n: lista.length }; desenharEstudo("praticar");
  const questoes = [];
  for (const j of lista) {
    let q; try { q = await (o.gerador ? o.gerador(j) : gerarQuestao(j, modo)); } catch (e) { q = questaoLocal(j, modo); }   // uma de cada vez (limite do plano gratuito da IA)
    questoes.push({ jid: j.id, trib: j.trib, info: j.info || "", disc: j.disc, tit: String(j.titulo || "").slice(0, 200), q });
    papelInfo.gerando.k++; if ((estudoAba === "praticar" || estudoAba === "lei-praticar") && !estudo) desenharEstudo("praticar");
  }
  const reg = { chave: "info-" + Date.now().toString(36), tipo: "info", modo, quando: new Date().toISOString(), nome: o.nome || `Informativos · ${TITULO_MODO[modo]} · ${questoes.length} questões`, titulo: o.titulo || "", subtitulo: o.subtitulo || "", ...(o.lei ? { lei: true } : {}),
    questoes, qs: questoes.map((x, k) => ({ i: k, numero: k + 1 })), feitas: {} };
  gravarProv("impressas", [reg, ...lerProv("impressas", [])]); salvarImpressasNuvem();
  papelInfo.gerando = null; desenharEstudo("praticar");
  imprimirProvaInfo(reg);
}

function imprimirProvaInfo(reg) {
  const obj = reg.modo !== "disc", ce = reg.modo === "ce";
  const discs = [...new Set(reg.questoes.map(x => x.disc))];
  let h = `<div class="pr-capa"><h1>${esc(reg.titulo || "Simulado de jurisprudência")}</h1><p>${esc(reg.subtitulo || "Informativos do STF, STJ e TSE")} · ${esc(TITULO_MODO[reg.modo] || "")} · ${reg.questoes.length} questões${discs.length <= 4 ? " · " + esc(discs.join(", ")) : ""}</p>
    <div class="pr-ident"><span>Nome: ______________________________________________</span><span>Data: ____/____/______</span><span>Início: ____h____ · Término: ____h____</span></div>
    <ul class="pr-instr">${obj ? `<li>Marque as respostas no <b>cartão-resposta</b> (última folha), preenchendo totalmente o círculo com caneta esferográfica preta.</li><li>Marque uma única opção por questão; marcação dupla ou rasurada anula a questão.</li>${ce ? "<li>Julgue cada item como CERTO (C) ou ERRADO (E). No critério Cebraspe, cada item errado anula um certo; se não souber, deixe em branco.</li>" : ""}<li>Ao terminar, fotografe o cartão-resposta e envie pelo app para corrigir.</li>`
      : `<li>Use caneta esferográfica preta e letra legível: o que não puder ser lido será desconsiderado.</li><li>Responda cada questão na sua folha de texto definitivo, respeitando o limite de linhas.</li><li>Ao terminar, fotografe as folhas e envie pelo app: a IA transcreve, corrige e avalia a caligrafia.</li>`}</ul></div>`;
  h += `<div class="${obj ? "pr-cols" : ""}">${reg.questoes.map((x, k) => {
    const q = x.q;
    if (q.tipo === "ce") return `<div class="pr-oq"><p><b>Item ${k + 1}</b> <small>· ${esc(x.disc)}</small></p><p class="pre">${esc(q.assertiva)}</p></div>`;
    if (q.tipo === "me") return `<div class="pr-oq"><p><b>Questão ${k + 1}</b> <small>· ${esc(x.disc)}</small></p><p class="pre">${esc(q.enunciado)}</p><ol class="pr-alts">${(q.alternativas || []).map((a, i) => `<li><b>(${"ABCDE"[i]})</b> ${esc(a)}</li>`).join("")}</ol></div>`;
    return `<section class="pr-q"><h2>Questão ${k + 1} <small>· ${esc(x.disc)} · até ${q.linhas || 20} linhas</small></h2><p class="pre">${esc(q.enunciado)}</p></section>`;
  }).join("")}</div>`;
  if (obj) {
    h += `<section class="pr-folha pr-cartao"><div class="pr-fcab"><b>CARTÃO-RESPOSTA</b><span>${esc(reg.titulo || "Simulado de jurisprudência")}</span><span>Nome: ____________________</span></div><div class="pr-bolhas">${reg.questoes.map((x, k) => `<div class="pr-linha"><b>${String(k + 1).padStart(2, "0")}</b>${(x.q.tipo === "me" ? (x.q.alternativas || []).map((_, i) => "ABCDE"[i]) : ["C", "E"]).map(L => `<span class="pr-bolha">${L}</span>`).join("")}</div>`).join("")}</div></section>`;
  } else {
    reg.questoes.forEach((x, k) => { const L = x.q.linhas || 20; let f = `<section class="pr-folha"><div class="pr-fcab"><b>FOLHA DE TEXTO DEFINITIVO</b><span>Questão ${k + 1}</span><span>Limite: ${L} linhas</span></div><ol class="pr-linhas">`; for (let i = 0; i < L; i++) f += "<li></li>"; h += f + "</ol></section>"; });
  }
  $("impressao").innerHTML = h;
  setTimeout(() => window.print(), 80);
}

function htmlImpressasInfo(area) {
  const lista = impressasPendentes(area || "info"); if (!lista.length && !papelInfo.gerando) return "";
  return `<div class="impr-box"><p class="est-sub">Provas impressas, aguardando as suas respostas</p>${papelInfo.gerando ? `<p class="note est-gerando">Criando a prova para imprimir: ${papelInfo.gerando.k} de ${papelInfo.gerando.n} questões… (a impressão abre sozinha no final)</p>` : ""}${lista.map(x => {
    const d = new Date(x.quando), quando = isNaN(d) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const feitas = Object.keys(x.feitas || {}).length;
    const botoes = x.modo === "disc"
      ? x.questoes.map((q, k) => x.feitas[k] ? `<button type="button" data-infodisc="${esc(x.chave)}" data-infok="${k}">Questão ${k + 1} ✓ ${esc(String(x.feitas[k].nota10 != null ? x.feitas[k].nota10 : x.feitas[k].nota))}</button>` : `<button type="button" class="primary" data-infodisc="${esc(x.chave)}" data-infok="${k}">Enviar resposta da questão ${k + 1}</button>`).join("")
      : `<button type="button" class="primary" data-infocartao="${esc(x.chave)}">Lançar o cartão-resposta</button>`;
    return `<div class="impr-item"><div><b>${esc(x.nome)}</b><br><span class="note">impressa em ${esc(quando)}${x.modo === "disc" ? ` · ${feitas} de ${x.questoes.length} corrigidas` : ""}</span></div>
      <div class="prov-acoes">${botoes}<button type="button" data-inforeimpr="${esc(x.chave)}">Imprimir de novo</button><button type="button" class="link-x" data-imprremover="${esc(x.chave)}">remover</button></div></div>`;
  }).join("")}</div>`;
}

// ---------- objetivas: cartão-resposta (reaproveita a tela do cartão das provas anteriores) ----------
function abrirCartaoInfo(chave) {
  const reg = lerProv("impressas", []).find(x => x.chave === chave); if (!reg) return;
  cartao = { info: true, reg, chave, it: { id: reg.chave, nome: reg.nome }, resp: {},
    qs: reg.questoes.map((x, k) => ({ numero: k + 1, tipo: x.q.tipo === "me" ? "me" : "ce", disciplina: x.disc, gabarito: x.q.gabarito,
      enunciado: x.q.tipo === "ce" ? x.q.assertiva : x.q.enunciado, alternativas: x.q.tipo === "me" ? (x.q.alternativas || []).map((t, i) => ({ letra: "ABCDE"[i], texto: t })) : [] })) };
  desenharEstudo("praticar"); $("estudoConteudo").scrollTop = 0;
}
// registra a sessão no histórico dos informativos e atualiza a revisão espaçada de cada julgado
function registrarInfoPapel(reg, res) {
  const qs = reg.questoes.map((x, k) => {
    const r = res[k] || {}, q = x.q;
    const j = acharItemEstudo(x.jid); if (j && r.nota !== undefined && (r.marcada !== "" || r.corr)) registrar(j, r.nota);
    return { n: k + 1, jid: x.jid, trib: x.trib, info: x.info, disc: x.disc, tit: x.tit, modo: q.tipo, nota: r.nota || 0, marcada: r.marcada || (q.tipo === "disc" ? "" : "—"), gab: q.gabarito || "",
      enun: String(q.assertiva || q.enunciado || "").slice(0, 900), ...(q.tipo === "me" ? { alts: (q.alternativas || []).map(a => String(a).slice(0, 240)) } : {}), coment: String(q.comentario || "").slice(0, 900),
      ...(r.corr ? { corr: r.corr } : {}), ...(r.texto ? { texto: String(r.texto).slice(0, 4000) } : {}) };
  });
  const ac = qs.filter(x => x.nota >= 1).length, pa = qs.filter(x => x.nota > 0 && x.nota < 1).length;
  registrarHist({ tipo: reg.lei ? "lei" : "info", nome: reg.nome, modo: reg.modo, papel: true, chave: (reg.lei ? "lei:" : "info:") + reg.modo + ":" + histHash(reg.questoes.map(x => x.jid).sort().join(",")), jids: reg.questoes.map(x => x.jid),
    total: qs.length, acertos: ac, parciais: pa, erros: qs.length - ac - pa, nota: qs.reduce((a, x) => a + x.nota, 0) / qs.length * 10, questoes: qs });
}

// ---------- discursivas: foto da resposta manuscrita, questão por questão ----------
function htmlDiscPapel() {
  const d = papelInfo.disc, reg = lerProv("impressas", []).find(x => x.chave === d.chave) || (papelInfo.concluida && papelInfo.concluida.chave === d.chave ? papelInfo.concluida : null);
  if (!reg) { papelInfo.disc = null; return htmlPreparar(); }
  const x = reg.questoes[d.k], q = x.q, feito = reg.feitas[d.k], n = reg.questoes.length;
  let h = `<div class="est-prog"><button type="button" class="mini" id="discPapelSair">‹ Voltar</button><span>Questão ${d.k + 1} de ${n}</span><span class="chip">${esc(x.trib)}${x.info ? " · Info " + esc(String(x.info).split(",")[0]) : ""}</span><span class="chip">${esc(x.disc)}</span></div>
    <details class="est-det"${feito ? "" : " open"}><summary>Enunciado</summary><p class="pre">${esc(q.enunciado)}</p></details>`;
  if (!feito) {
    h += `<div class="est-det manu-box"><p class="est-sub">Envie as fotos da sua resposta à questão ${d.k + 1}</p><p class="note">A IA transcreve a sua letra, corrige pelo espelho, dá a nota e avalia a caligrafia (limite: ${q.linhas || 20} linhas).</p>
      <div class="actions" style="justify-content:flex-start">${d.corrigindo ? `<span class="note est-gerando">A IA está lendo a sua letra e corrigindo… pode levar 1 ou 2 minutos.</span>` : `<button type="button" class="primary" id="discPapelFotoBtn">Enviar fotos da resposta</button>`}<input type="file" id="discPapelFotos" accept="image/*,application/pdf" multiple hidden></div></div>`;
    return h;
  }
  h += htmlCorrecao({ ...feito.corr, nota: feito.nota10 != null ? feito.nota10 : feito.corr.nota }, { linhas: q.linhas });
  if ((q.espelho || []).length) h += `<details class="est-det"><summary>Espelho de correção</summary><ul class="est-itens">${q.espelho.map(t => `<li>${esc(t.item)} <span class="note">(${esc(String(t.pontos))} pts)</span></li>`).join("")}</ul></details>`;
  if (q.resposta_modelo) h += `<details class="est-det"><summary>Resposta-modelo</summary><p class="pre">${esc(q.resposta_modelo)}</p></details>`;
  if (feito.texto) h += `<details class="est-det"><summary>Sua resposta (transcrição da IA)</summary><p class="pre">${esc(feito.texto)}</p></details>`;
  const j = acharItemEstudo(x.jid);
  if (j) h += `<details class="est-det"><summary>O julgado</summary><p><b>${esc(j.titulo)}</b></p><p class="pre">${esc(j.tese)}</p><p class="note">${esc(j.cit)}</p></details>`;
  const prox = reg.questoes.findIndex((_, k) => !reg.feitas[k]);
  h += `<div class="actions">${prox >= 0 ? `<button type="button" class="primary" data-infodisc="${esc(reg.chave)}" data-infok="${prox}">Ir para a questão ${prox + 1}</button>` : `<button type="button" class="primary" id="discPapelSair">Concluir</button>`}</div>`;
  return h;
}
async function corrigirDiscPapel(files) {
  const d = papelInfo.disc; if (!d || !files.length) return;
  const lista = lerProv("impressas", []), reg = lista.find(x => x.chave === d.chave); if (!reg) return;
  const x = reg.questoes[d.k], q = x.q, j = acharItemEstudo(x.jid);
  d.corrigindo = true; desenharEstudo("praticar");
  try {
    const partes = await Promise.all([...files].slice(0, 8).map(fotoParaParte));
    const p = (j ? contextoJulgado(j) + "\n\n" : "") + `QUESTÃO:\n${q.enunciado}\n\nESPELHO DE CORREÇÃO:\n${(q.espelho || []).map(e => `- ${e.item} (${e.pontos} pts)`).join("\n")}\n\n${q.resposta_modelo ? "RESPOSTA-MODELO:\n" + q.resposta_modelo + "\n\n" : ""}` +
      `RESPOSTA DO CANDIDATO: está MANUSCRITA nas imagens/PDF anexos (folhas em ordem). Primeiro transcreva fielmente o texto, sem corrigir nada; o que não for possível ler, marque como [ilegível] e DESCONSIDERE na nota, como faz a banca. Avalie também a caligrafia como um examinador: legibilidade, traçado, espaçamento, margens, rasuras e respeito ao limite de ${q.linhas || 20} linhas; texto além do limite não conta.\n\n` +
      `Você é examinador de concurso da magistratura. Corrija com rigor e justiça, item por item do espelho, considerando também técnica jurídica, fundamentação e clareza. Responda em JSON: {"transcricao": string, "linhas_usadas": number, "caligrafia": {"nota": number de 0 a 10, "legibilidade": "boa"|"regular"|"ruim", "comentario": string, "trechos_ilegiveis": [string], "dicas": [string]}, "nota": number de 0 a 10 com uma casa decimal, "itens": [{"item": string, "atendido": "sim"|"parcial"|"não", "comentario": string}], "pontos_fortes": [string], "melhorias": [string], "feedback": string curto}`;
    const c = await gemini(p, { partes, ms: 300000 });
    const { transcricao, ...corr } = c, nota10 = +c.nota || 0;
    reg.feitas[d.k] = { nota: nota10 >= 7 ? 1 : nota10 >= 5 ? 0.5 : 0, nota10, corr, texto: transcricao || "" };
    const pend = reg.questoes.some((_, k) => !reg.feitas[k]);
    if (pend) gravarProv("impressas", lista); else {
      registrarInfoPapel(reg, reg.questoes.map((_, k) => ({ nota: reg.feitas[k].nota, corr: { nota: reg.feitas[k].nota10, itens: reg.feitas[k].corr.itens || [], melhorias: reg.feitas[k].corr.melhorias || [] }, texto: reg.feitas[k].texto })));
      gravarProv("impressas", lista.filter(z => z.chave !== reg.chave));
      // a tela continua mostrando a correção desta questão mesmo depois de a prova sair da lista
      papelInfo.concluida = reg; toast("Prova concluída: todas as questões foram corrigidas e o resultado entrou no histórico.");
    }
    salvarImpressasNuvem();
  } catch (e) { toast("A IA não conseguiu corrigir (" + e.message + ")."); }
  d.corrigindo = false; if (papelInfo.disc === d) desenharEstudo("praticar");
}

// ---------- simulado no padrão da banca (cargo, banca, formato, quantidade; no app ou no papel) ----------
const BANCAS_PADRAO = ["Cebraspe", "FGV", "Vunesp", "FCC", "Consulplan", "IBFC", "Instituto AOCP", "Fumarc", "Nucepe"];
const bancaDoNome = n => { const m = String(n || "").match(/^[^-]+?\/\d{4}\s*-\s*([^-]+?)\s*-\s*/); return m ? m[1].trim() : ""; };
const lerSimCfg = () => ({ cargo: "", banca: "Cebraspe", formato: "obj", n: 10, onde: "app", ...lerEst("simCfg", {}) });
function bancasDisponiveis() {
  const r = typeof repo !== "undefined" && repo && repo.itens || [];
  return [...new Set([...r.map(i => bancaDoNome(i.nome)).filter(Boolean), ...BANCAS_PADRAO])];
}
function provasDaBanca(cfg) {
  const r = typeof repo !== "undefined" && repo && repo.itens || [];
  const daBanca = r.filter(i => semAcentoEst(bancaDoNome(i.nome)) === semAcentoEst(cfg.banca) && (cfg.formato === "disc" ? i.tipo !== "objetiva" : i.tipo === "objetiva"));
  const doCargo = daBanca.filter(i => !cfg.cargo || i.cargo === cfg.cargo);
  return doCargo.length ? doCargo : daBanca;
}
function htmlSimuladoCfg() {
  const c = lerSimCfg(), ce = c.formato === "obj" && /cebraspe|cespe/i.test(c.banca);
  if (typeof repo !== "undefined" && !repo && typeof carregarRepo === "function") carregarRepo();
  const fontes = provasDaBanca(c);
  const chip = (attr, v, n, on) => `<button type="button" class="chip-sel${on ? " on" : ""}" data-${attr}="${esc(String(v))}">${n}</button>`;
  return `<div class="est-sec sim-box"><h4>Gerar simulado</h4>
    <p class="note">Uma prova completa com os julgados filtrados acima, no formato da banca e no nível do cargo. A IA segue o padrão das provas dessa banca que estão na sua pasta Provas Jurídicas.</p>
    <div class="sim-grid">
      <label>Cargo<select id="simCargo"><option value="">Qualquer cargo</option>${(typeof CARGOS !== "undefined" ? CARGOS : []).map(x => `<option${x === c.cargo ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
      <label>Banca<select id="simBanca">${bancasDisponiveis().map(x => `<option${x === c.banca ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
    </div>
    <div class="est-chips">${chip("simformato", "obj", ce ? "Objetiva (certo ou errado)" : "Objetiva (múltipla escolha)", c.formato === "obj")}${chip("simformato", "disc", "Discursiva", c.formato === "disc")}</div>
    <p class="est-sub" style="margin:8px 0 4px">Quantidade de questões</p>
    <div class="est-chips">${(c.formato === "disc" ? [2, 3, 4, 5] : [10, 20, 30, 50, 100]).map(n => chip("simn", n, n, c.n === n)).join("")}</div>
    <p class="est-sub" style="margin:8px 0 4px">Como responder</p>
    <div class="est-chips">${chip("simonde", "app", "No app", c.onde === "app")}${chip("simonde", "papel", "No papel (PDF para imprimir)", c.onde === "papel")}</div>
    <p class="note">${fontes.length ? `Padrão da banca a partir de: <b>${esc(fontes.slice(0, 3).map(i => i.nome).join("; "))}</b>${fontes.length > 3 ? ` e mais ${fontes.length - 3}` : ""}.` : `Não há provas ${c.formato === "disc" ? "discursivas" : "objetivas"} da ${esc(c.banca)} na sua pasta: a IA usa o padrão conhecido da banca.`}
      ${c.onde === "papel" ? ` Todas as questões são criadas antes de abrir a impressão (de 5 em 5; ${c.n >= 50 ? "uns " + Math.ceil(c.n / 5 * 15 / 60) + " minutos" : "1 a 2 minutos"}).` : " As questões vão sendo criadas (de 5 em 5) enquanto você responde."} As questões são distribuídas entre as disciplinas filtradas${fontes.length ? " na proporção das provas da banca" : ""}.</p>
    <div class="actions"><button type="button" class="primary" id="simGerar" ${papelInfo.gerando || papelInfo.preparando ? "disabled" : ""}>${papelInfo.preparando ? esc(papelInfo.preparando) : papelInfo.gerando ? `Criando o simulado: ${papelInfo.gerando.k} de ${papelInfo.gerando.n}…` : "Gerar simulado"}</button></div></div>`;
}
// lê exemplos reais da banca (das provas já lidas pela IA; se nenhuma foi lida, lê uma agora)
async function perfilBanca(cfg) {
  const fontes = provasDaBanca(cfg).slice(0, 4), exemplos = [];
  for (const it of fontes) {
    let g = await questoesGuardadas(it);
    if (!g && !exemplos.length) { try { papelInfo.preparando = "Lendo uma prova da banca para copiar o padrão…"; desenharEstudo("praticar"); g = await garantirQuestoes(it); } catch (e) {} }
    if (g) embaralhar((g.questoes || []).filter(q => q.enunciado && String(q.gabarito || "").toUpperCase() !== "ANULADA")).slice(0, 2).forEach(q => exemplos.push(q));
    if (exemplos.length >= 4) break;
  }
  // peso de cada disciplina nas provas reais da banca (das provas já lidas)
  const pesos = {};
  for (const it of fontes) { const g = await questoesGuardadas(it); (g && g.questoes || []).forEach(q => { const d = semAcentoEst(q.disciplina || "").trim(); if (d) pesos[d] = (pesos[d] || 0) + 1; }); }
  papelInfo.preparando = "";
  const alts = exemplos.map(q => (q.alternativas || []).length).filter(n => n >= 2);
  const nAlt = alts.length ? alts.sort((a, b) => alts.filter(x => x === b).length - alts.filter(x => x === a).length)[0] : 5;
  const ce = cfg.formato === "obj" && (/cebraspe|cespe/i.test(cfg.banca) || (exemplos.length && exemplos.every(q => q.tipo === "ce" || !(q.alternativas || []).length)));
  return { ...cfg, pesos, exemplos: exemplos.slice(0, 4), nAlt: Math.min(5, Math.max(4, nAlt)), modo: cfg.formato === "disc" ? "disc" : ce ? "ce" : "me", fontes: fontes.map(i => i.nome) };
}
async function gerarQuestaoBanca(j, P) {
  if (!iaLigada()) return questaoLocal(j, P.modo);
  const ex = P.exemplos.length ? `\n\nQUESTÕES REAIS DA ${P.banca.toUpperCase()} (da pasta de provas do candidato), para você imitar o estilo, a extensão, o tipo de enunciado, o nível de detalhe e a forma das alternativas — NÃO copie o conteúdo:\n` +
    P.exemplos.map((q, k) => `--- Exemplo ${k + 1} (${q.disciplina || ""}) ---\n${q.texto_base ? q.texto_base.slice(0, 600) + "\n" : ""}${String(q.enunciado).slice(0, 1400)}${(q.alternativas || []).length ? "\n" + q.alternativas.map(a => `${a.letra}) ${String(a.texto).slice(0, 300)}`).join("\n") : ""}${(q.espelho || []).length ? "\nEspelho: " + q.espelho.map(e => e.item).join("; ").slice(0, 600) : ""}`).join("\n") : "";
  const base = contextoJulgado(j) + `\n\nVocê é examinador da banca ${P.banca} elaborando uma prova para o cargo de ${P.cargo || "carreira jurídica"}. Use SOMENTE o entendimento do julgado acima, cobrado do jeito que essa banca cobra, no nível de dificuldade desse cargo. Português do Brasil, rigor técnico.` + ex;
  let p;
  if (P.modo === "ce") p = base + `\n\nCrie UM item de certo ou errado no padrão da banca. Sorteie se será CERTO ou ERRADO (50% cada); se errado, altere um detalhe relevante sem ser óbvio. Responda em JSON: {"assertiva": string, "gabarito": "C" ou "E", "comentario": string explicando com base no julgado, em até 5 frases}`;
  else if (P.modo === "me") p = base + `\n\nCrie UMA questão de múltipla escolha no padrão da banca, com ${P.nAlt} alternativas, apenas uma correta e as erradas plausíveis. Responda em JSON: {"enunciado": string, "alternativas": [${P.nAlt} strings sem a letra], "gabarito": letra de "A" a "${"ABCDE"[P.nAlt - 1]}", "comentario": string explicando a correta e por que cada errada está errada}`;
  else p = base + `\n\nCrie UMA questão discursiva no padrão da banca (caso concreto inédito e comando claro), com espelho de 3 a 5 itens que somam 10 pontos e resposta-modelo. Responda em JSON: {"enunciado": string, "espelho": [{"item": string, "pontos": number}], "resposta_modelo": string, "linhas": number (entre 10 e 30, como a banca costuma pedir)}`;
  const q = await gemini(p);
  if (P.modo === "ce") { q.gabarito = /^e/i.test(q.gabarito) ? "E" : "C"; return { tipo: "ce", ...q, ia: true }; }
  if (P.modo === "me") { q.gabarito = String(q.gabarito || "A").trim().charAt(0).toUpperCase(); q.alternativas = (q.alternativas || []).map(a => String(a).replace(/^\s*\(?[A-E][).]\s*/, "")); return { tipo: "me", ...q, ia: true }; }
  return { tipo: "disc", ...q, ia: true };
}
// várias questões num pedido só (5 julgados diferentes): menos pedidos à IA, simulados grandes mais rápidos
async function gerarLoteBanca(js, P) {
  if (!iaLigada() || js.length < 2) return Promise.all(js.map(j => gerarQuestaoBanca(j, P).catch(() => questaoLocal(j, P.modo))));
  const ex = P.exemplos.length ? `QUESTÕES REAIS DA ${P.banca.toUpperCase()} (da pasta de provas do candidato), para você imitar o estilo, a extensão, o tipo de enunciado e a forma das alternativas — NÃO copie o conteúdo:\n` +
    P.exemplos.map((q, k) => `--- Exemplo ${k + 1} ---\n${String(q.enunciado).slice(0, 1000)}${(q.alternativas || []).length ? "\n" + q.alternativas.map(a => `${a.letra}) ${String(a.texto).slice(0, 220)}`).join("\n") : ""}`).join("\n") + "\n\n" : "";
  const formato = P.modo === "ce" ? `{"assertiva": string, "gabarito": "C" ou "E", "comentario": string curto}` : P.modo === "me" ? `{"enunciado": string, "alternativas": [${P.nAlt} strings sem a letra], "gabarito": letra de "A" a "${"ABCDE"[P.nAlt - 1]}", "comentario": string curto}` : `{"enunciado": string, "espelho": [{"item": string, "pontos": number}], "resposta_modelo": string, "linhas": number}`;
  const p = `Você é examinador da banca ${P.banca} elaborando uma prova para o cargo de ${P.cargo || "carreira jurídica"}, no nível de dificuldade desse cargo. Português do Brasil, rigor técnico.\n\n${ex}` +
    js.map((j, k) => `=== JULGADO ${k + 1} (${j.trib}${j.info ? ", Informativo " + j.info : ""} – ${j.disc}) ===\nTÍTULO: ${j.titulo}\nTEXTO:\n${j.texto.slice(0, 2600)}`).join("\n\n") +
    `\n\nCrie ${js.length} questões, UMA para cada julgado, na mesma ordem, cada uma usando SOMENTE o entendimento do seu julgado, cobrado do jeito que a banca cobra. ${P.modo === "ce" ? "Itens de certo ou errado: sorteie certo ou errado (cerca de metade de cada); se errado, altere um detalhe relevante sem ser óbvio." : P.modo === "me" ? `Múltipla escolha com ${P.nAlt} alternativas, uma só correta, erradas plausíveis; varie a letra correta.` : "Discursivas com caso concreto inédito, espelho de 3 a 5 itens somando 10 pontos e resposta-modelo."} Responda em JSON: {"questoes": [${formato}, …]} com exatamente ${js.length} itens.`;
  let lista = [];
  try { const r = await gemini(p, { ms: 240000 }); lista = r.questoes || (Array.isArray(r) ? r : []); } catch (e) { lista = []; }
  return Promise.all(js.map(async (j, k) => {
    const q = lista[k];
    const ok = q && (P.modo === "ce" ? q.assertiva : q.enunciado && (P.modo !== "me" || (q.alternativas || []).length >= 4));
    if (!ok) return gerarQuestaoBanca(j, P).catch(() => questaoLocal(j, P.modo));   // o que faltou no lote vem sozinho
    if (P.modo === "ce") return { tipo: "ce", ...q, gabarito: /^e/i.test(q.gabarito) ? "E" : "C", ia: true };
    if (P.modo === "me") return { tipo: "me", ...q, gabarito: String(q.gabarito || "A").trim().charAt(0).toUpperCase(), alternativas: q.alternativas.map(a => String(a).replace(/^\s*\(?[A-E][).]\s*/, "")), ia: true };
    return { tipo: "disc", ...q, ia: true };
  }));
}
// cada julgado pede o seu lote (ele e os próximos da lista, até 5) só uma vez
function geradorEmLote(lista, P) {
  const mapa = {}, tam = P.modo === "disc" ? 1 : 5;
  return j => {
    if (!mapa[j.id]) {
      const i = lista.indexOf(j), grupo = lista.slice(i, i + tam).filter(x => !mapa[x.id]);
      const pr = gerarLoteBanca(grupo, P);
      grupo.forEach((x, k) => { mapa[x.id] = pr.then(r => r[k]); });
    }
    return mapa[j.id];
  };
}
// distribui as questões entre as disciplinas filtradas: na proporção das provas reais da banca, ou por igual
function escolherParaSimulado(filtro, n, pesosBanca) {
  const base = julgados.filter(j => (!filtro.discs.length || filtro.discs.includes(j.disc)) && filtro.tribs.includes(j.trib) && (!(filtro.anos || []).length || filtro.anos.includes(grupoAno(j))));
  const porDisc = {}; base.forEach(j => (porDisc[j.disc] = porDisc[j.disc] || []).push(j));
  const discs = Object.keys(porDisc); if (!discs.length) return [];
  const temPesos = Object.keys(pesosBanca || {}).length;
  const peso = d => { if (!temPesos) return 1; const k = semAcentoEst(d); let w = 0; for (const [b, c] of Object.entries(pesosBanca)) if (b === k || b.includes(k) || k.includes(b)) w += c; return w || 0.3; };
  const ws = discs.map(peso), soma = ws.reduce((a, b) => a + b, 0);
  let cotas = discs.map((d, k) => Math.min(porDisc[d].length, Math.floor(n * ws[k] / soma)));
  // sobra: vai para quem tem mais peso e ainda tem julgados
  let falta = Math.min(n, base.length) - cotas.reduce((a, b) => a + b, 0);
  const ordem = discs.map((d, k) => k).sort((a, b) => (n * ws[b] / soma % 1) - (n * ws[a] / soma % 1) || ws[b] - ws[a]);
  while (falta > 0) { let deu = false; for (const k of ordem) { if (falta <= 0) break; if (cotas[k] < porDisc[discs[k]].length) { cotas[k]++; falta--; deu = true; } } if (!deu) break; }
  // dentro de cada disciplina, a mesma prioridade do treino (revisões vencidas, nunca vistos, resto); a prova sai agrupada por disciplina
  return discs.map((d, k) => [d, cotas[k], ws[k]]).filter(x => x[1] > 0).sort((a, b) => b[2] - a[2])
    .flatMap(([d, c]) => escolherJulgados({ ...filtro, discs: [d], soErros: false }, c));
}
async function gerarSimulado() {
  if (papelInfo.gerando || papelInfo.preparando) return;
  const cfg = lerSimCfg(), filtro = lerEst("filtro", { modo: "ce", discs: [], tribs: ["STF", "STJ", "TSE"], n: 10 });
  papelInfo.preparando = "Preparando o padrão da banca…"; desenharEstudo("praticar");
  const P = await perfilBanca(cfg);
  const lista = escolherParaSimulado(filtro, cfg.n, P.pesos);
  if (!lista.length) { papelInfo.preparando = ""; desenharEstudo("praticar"); toast("Nenhum julgado com os filtros de ano, tribunal e disciplina."); return; }
  if (lista.length < cfg.n) toast(`Só há ${lista.length} julgados com esses filtros; o simulado terá ${lista.length} questões.`);
  const nome = `Simulado ${P.banca}${P.cargo ? " · " + P.cargo : ""} · ${TITULO_MODO[P.modo]} · ${lista.length} questões`;
  const gerador = geradorEmLote(lista, P);
  if (cfg.onde === "papel") { gerarProvaInfoPapel({ lista, modo: P.modo, gerador, nome, titulo: `Simulado ${P.banca}${P.cargo ? " – " + P.cargo : ""}` }); return; }
  registrarSessaoInfo();
  estudo = { modo: P.modo, lista, i: 0, qs: {}, resp: {}, notas: [], gerador, simulado: nome };
  prepararQuestao(0); desenharEstudo("praticar"); $("estudoConteudo").scrollTop = 0;
}

// ---------- eventos ----------
document.addEventListener("click", e => {
  if (!e.target.closest("#estudoConteudo")) return;
  const t = e.target.closest("button"); if (!t) return;
  if (t.id === "simGerar") { gerarSimulado(); return; }
  if (t.dataset.simformato || t.dataset.simn || t.dataset.simonde) {
    const c = lerSimCfg();
    if (t.dataset.simformato) { c.formato = t.dataset.simformato; c.n = c.formato === "disc" ? 3 : 10; }
    if (t.dataset.simn) c.n = +t.dataset.simn;
    if (t.dataset.simonde) c.onde = t.dataset.simonde;
    gravarEst("simCfg", c); desenharEstudo("praticar"); return;
  }
  if (t.dataset.inforeimpr) { const reg = lerProv("impressas", []).find(x => x.chave === t.dataset.inforeimpr); if (reg) imprimirProvaInfo(reg); return; }
  if (t.dataset.infocartao) { abrirCartaoInfo(t.dataset.infocartao); return; }
  if (t.dataset.infodisc) { papelInfo.disc = { chave: t.dataset.infodisc, k: +t.dataset.infok }; desenharEstudo("praticar"); $("estudoConteudo").scrollTop = 0; return; }
  if (t.id === "discPapelSair") { papelInfo.disc = null; papelInfo.concluida = null; desenharEstudo("praticar"); return; }
  if (t.id === "discPapelFotoBtn") { $("discPapelFotos").click(); return; }
});
document.addEventListener("change", e => {
  if (e.target.id === "discPapelFotos" && e.target.files.length) corrigirDiscPapel(e.target.files);
  if (e.target.id === "simCargo" || e.target.id === "simBanca") { const c = lerSimCfg(); c[e.target.id === "simCargo" ? "cargo" : "banca"] = e.target.value; gravarEst("simCfg", c); desenharEstudo("praticar"); }
});
