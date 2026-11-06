// Provas anteriores e peças práticas, a partir da pasta "Provas Jurídicas" no Drive do projeto.
// O Apps Script lista a pasta e o Gemini lê os PDFs (prova + gabarito/espelho), devolvendo as questões fiéis à prova.
// O resultado fica guardado (no Drive e neste aparelho) para não reprocessar.

let repo = null, repoCarregando = false, sim = null, pecaEstr = {};
const LOTE = 15;   // questões objetivas extraídas por vez
const ESTRUTURAS_PADRAO = {
  "Juiz": ["Sentença cível", "Sentença criminal"],
  "Promotor": ["Denúncia", "Alegações finais (Ministério Público)", "Parecer do Ministério Público"],
  "Delegado": ["Relatório final de inquérito policial", "Representação por prisão preventiva", "Auto de prisão em flagrante"],
  "Serventuário da Justiça": ["Certidão", "Mandado judicial"]
};
const lerProv = (b, p) => lerEst("prov-" + b, p), gravarProv = (b, v) => gravarEst("prov-" + b, v);

async function postLongo(obj, ms) {
  return Promise.race([postScript({ sessao: usuarioAtual.sessao, ...obj }), new Promise((_, f) => setTimeout(() => f(new Error("o servidor demorou demais")), ms || 300000))]);
}
async function carregarRepo(forcar) {
  if (repoCarregando || (repo && !forcar)) return;
  repoCarregando = true;
  try {
    const r = await postLongo({ acao: "repositorio" }, 120000);
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

// ---------- telas ----------
function htmlProvas() {
  if (sim && sim.it.tipo !== "peca") return htmlSimulado();
  if (!repo) { carregarRepo(); return `<p class="note est-gerando">Abrindo a pasta Provas Jurídicas no Drive…</p>`; }
  if (repo.erro) return `<p class="note">${esc(repo.erro)}</p><div class="actions" style="justify-content:flex-start"><button type="button" id="provRecarregar">Tentar de novo</button></div>`;
  const f = lerProv("filtro", { tipo: "objetiva", cargo: "" });
  const itens = repo.itens.filter(i => i.tipo === f.tipo);
  const cargos = [...new Set(repo.itens.filter(i => i.tipo !== "peca").map(i => i.cargo))];
  const lista = itens.filter(i => !f.cargo || i.cargo === f.cargo);
  const res = lerProv("resultados", {});
  return `<div class="est-opts"><button type="button" class="opt${f.tipo === "objetiva" ? " on" : ""}" data-provtipo="objetiva">Provas objetivas</button><button type="button" class="opt${f.tipo === "subjetiva" ? " on" : ""}" data-provtipo="subjetiva">Provas subjetivas</button></div>
    <div class="est-chips"><button type="button" class="chip-sel${!f.cargo ? " on" : ""}" data-provcargo="">Todos os cargos</button>${cargos.map(c => `<button type="button" class="chip-sel${f.cargo === c ? " on" : ""}" data-provcargo="${esc(c)}">${esc(c)}</button>`).join("")}</div>
    ${lista.length ? lista.map(i => {
      const r = res[i.id];
      return `<div class="prov-item"><div class="prov-tit"><b>${esc(i.nome)}</b><span class="note">${esc(i.cargo)}${i.gab ? " · gabarito: " + esc(i.gabNome) : " · sem gabarito separado"}${r ? ` · última vez: ${r.acertos}/${r.total} (${Math.round(r.acertos / Math.max(1, r.total) * 100)}%)` : ""}</span></div>
        <div class="prov-acoes"><button type="button" class="primary" data-provsim="${esc(i.id)}">${i.tipo === "objetiva" ? "Simulado com as questões originais" : "Responder as questões originais"}</button><button type="button" data-provnovas="${esc(i.id)}">Questões novas no estilo desta prova</button></div></div>`;
    }).join("") : `<p class="note">Nenhuma prova ${f.tipo === "objetiva" ? "objetiva" : "subjetiva"}${f.cargo ? " de " + esc(f.cargo) : ""} na pasta. Coloque os PDFs em <b>Provas Jurídicas / ${f.tipo === "objetiva" ? "Provas objetivas" : "Provas subjetivas"} / ${esc(f.cargo || "cargo")}</b>.</p>`}
    <p class="note">Pasta no Drive: <b>${esc(repo.raiz || "Provas Jurídicas")}</b>. Prova e gabarito são reconhecidos pelo nome (ex.: "TJMG 2022 - prova.pdf" e "TJMG 2022 - gabarito.pdf"). <button type="button" class="link-x" id="provRecarregar" style="color:var(--brand)">Atualizar lista</button></p>`;
}

async function iniciarSimulado(id, novas) {
  const it = repo.itens.find(i => i.id === id); if (!it) return;
  sim = { it, novas, i: 0, qs: [], total: 0, resp: {}, geradas: {}, carregando: "Preparando…" };
  desenharEstudo(it.tipo === "peca" ? "pecas" : "provas");
  try {
    const g = await garantirQuestoes(it, t => { sim.carregando = t; desenharEstudo(estudoAba); });
    sim.carregando = ""; sim.qs = g.questoes.filter(q => q.enunciado); sim.total = g.total || sim.qs.length; sim.banca = g.banca;
    if (novas) sim.modelos = embaralhar(sim.qs.slice()).slice(0, 10);
    desenharEstudo(estudoAba);
    if (it.tipo === "objetiva") completarProva(it);
    if (novas && it.tipo !== "peca") gerarNova(0);
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
  const topo = `<div class="est-prog"><button type="button" class="link-x" id="provSair" style="color:var(--brand)">‹ Voltar às provas</button><span><b>${esc(s.it.nome)}</b></span>${s.novas ? `<span class="chip">questões inéditas no estilo da prova</span>` : ""}</div>`;
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
    h += `<label>Sua resposta <span class="note" id="provLinhas">${q.linhas ? `(até ${q.linhas} linhas)` : ""}</span><textarea id="provTexto" rows="${sim.it.tipo === "peca" ? 22 : 12}" ${r && r.corrigindo ? "disabled" : ""}>${esc(r ? r.texto : rasc)}</textarea></label>
      <p class="note">O rascunho fica salvo neste aparelho enquanto você escreve.</p>
      <div class="actions">${r && r.corrigindo ? `<span class="note">Corrigindo com a IA Gemini…</span>` : `<button type="button" id="provEspelho">Ver o espelho sem corrigir</button><button type="button" class="primary" id="provCorrigir">Enviar para correção</button>`}</div>`;
    return h;
  }
  if (r.correcao) {
    const c = r.correcao;
    h += `<p class="est-res ${c.nota >= 7 ? "ok" : c.nota >= 5 ? "" : "bad"}">Nota <b>${esc(String(c.nota))}</b> de 10</p>
      <ul class="est-itens">${(c.itens || []).map(t => `<li class="${t.atendido === "sim" ? "ok" : t.atendido === "parcial" ? "parc" : "bad"}"><b>${esc(t.item)}</b> — ${esc(t.atendido)}${t.comentario ? ": " + esc(t.comentario) : ""}</li>`).join("")}</ul>
      ${(c.estrutura || []).length ? `<p class="est-sub">Estrutura da peça</p><ul class="est-itens">${c.estrutura.map(t => `<li class="${t.presente === "sim" ? "ok" : t.presente === "parcial" ? "parc" : "bad"}"><b>${esc(t.elemento)}</b> — ${esc(t.presente)}${t.comentario ? ": " + esc(t.comentario) : ""}</li>`).join("")}</ul>` : ""}
      ${c.pontos_fortes && c.pontos_fortes.length ? `<p><b>Pontos fortes:</b> ${esc(c.pontos_fortes.join("; "))}</p>` : ""}${c.melhorias && c.melhorias.length ? `<p><b>Para melhorar:</b> ${esc(c.melhorias.join("; "))}</p>` : ""}${c.feedback ? `<p class="note">${esc(c.feedback)}</p>` : ""}`;
  }
  if ((q.espelho || []).length) h += `<details class="est-det"${r.correcao ? "" : " open"}><summary>Espelho ${q.inedita ? "" : "oficial "}de correção</summary><ul class="est-itens">${q.espelho.map(t => `<li>${esc(t.item)} <span class="note">(${esc(String(t.pontos))} pts)</span></li>`).join("")}</ul></details>`;
  if (q.resposta_esperada) h += `<details class="est-det"><summary>Resposta esperada ${q.inedita ? "" : "(padrão oficial)"}</summary><p class="pre">${esc(q.resposta_esperada)}</p></details>`;
  if (!(q.espelho || []).length && !q.resposta_esperada) h += `<p class="note">Esta prova não trouxe espelho oficial; a correção usa a legislação e a jurisprudência.</p>`;
  if (r.texto) h += `<details class="est-det"><summary>Sua resposta</summary><p class="pre">${esc(r.texto)}</p></details>`;
  h += `<div class="actions"><button type="button" class="primary" id="provProx">${sim.it.tipo === "peca" ? "Concluir" : (sim.i + 1 < (sim.novas ? 10 : (sim.total || sim.qs.length)) ? "Próxima" : "Ver resultado")}</button></div>`;
  return h;
}
function htmlFimSimulado() {
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
  if (sim && sim.it.tipo === "peca") return htmlPecaAtiva();
  if (!repo) { carregarRepo(); return `<p class="note est-gerando">Abrindo a pasta Provas Jurídicas no Drive…</p>`; }
  const f = lerProv("filtroPeca", { cargo: "", aba: "estrutura" });
  const pecas = (repo.itens || []).filter(i => i.tipo === "peca");
  const cargos = [...new Set([...Object.keys(ESTRUTURAS_PADRAO), ...pecas.map(i => i.cargo).filter(c => c !== "Geral")])];
  const tipos = [...new Set([...(f.cargo ? ESTRUTURAS_PADRAO[f.cargo] || [] : Object.values(ESTRUTURAS_PADRAO).flat()), ...Object.values(lerProv("tiposVistos", {})).filter(x => !f.cargo || x.cargo === f.cargo).map(x => x.tipo)])];
  let h = `<div class="est-opts"><button type="button" class="opt${f.aba === "estrutura" ? " on" : ""}" data-pecaaba="estrutura">Estrutura das peças</button><button type="button" class="opt${f.aba === "praticar" ? " on" : ""}" data-pecaaba="praticar">Praticar peças</button></div>
    <div class="est-chips"><button type="button" class="chip-sel${!f.cargo ? " on" : ""}" data-pecacargo="">Todos os cargos</button>${cargos.map(c => `<button type="button" class="chip-sel${f.cargo === c ? " on" : ""}" data-pecacargo="${esc(c)}">${esc(c)}</button>`).join("")}</div>`;
  if (f.aba === "estrutura") {
    const aberto = f.tipoAberto;
    h += `<p class="note">Escolha a peça para ver os elementos que a banca espera, com o fundamento legal, o que cada parte deve conter, os erros mais comuns e um esqueleto para treinar.</p>
      <div class="est-chips">${tipos.map(t => `<button type="button" class="chip-sel${aberto === t ? " on" : ""}" data-pecatipo="${esc(t)}">${esc(t)}</button>`).join("")}</div>`;
    if (aberto) h += htmlEstrutura(aberto);
    return h;
  }
  const lista = pecas.filter(i => !f.cargo || i.cargo === f.cargo);
  if (repo.erro) return h + `<p class="note">${esc(repo.erro)}</p>`;
  h += lista.length ? lista.map(i => `<div class="prov-item"><div class="prov-tit"><b>${esc(i.nome)}</b><span class="note">${esc(i.cargo)}${i.gab ? " · espelho: " + esc(i.gabNome) : " · sem espelho separado"}</span></div>
      <div class="prov-acoes"><button type="button" class="primary" data-provsim="${esc(i.id)}">Fazer esta peça</button><button type="button" data-pecanova="${esc(i.id)}">Caso novo no estilo desta peça</button></div></div>`).join("")
    : `<p class="note">Nenhuma peça${f.cargo ? " de " + esc(f.cargo) : ""} na pasta. Coloque os PDFs em <b>Provas Jurídicas / Peças jurídicas / ${esc(f.cargo || "cargo")}</b>.</p>`;
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
  const topo = `<div class="est-prog"><button type="button" class="link-x" id="provSair" style="color:var(--brand)">‹ Voltar às peças</button><span><b>${esc(s.it.nome)}</b></span>${s.novas ? `<span class="chip">caso inédito</span>` : ""}</div>`;
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
  return topo + `<div class="est-prog">${q.tipo_peca ? `<span class="chip">${esc(q.tipo_peca)}</span>` : ""}${q.linhas ? `<span class="chip">até ${q.linhas} linhas</span>` : ""}</div>
    <details class="est-det" open><summary>Enunciado</summary><p class="pre">${esc(q.enunciado)}</p></details>
    ${els.length ? `<details class="est-det"><summary>Roteiro da estrutura (${els.length} elementos)</summary><ol class="pec-roteiro">${els.map(x => `<li><b>${esc(x.nome)}</b>${x.fundamento ? ` <span class="note">${esc(x.fundamento)}</span>` : ""}</li>`).join("")}</ol></details>` : ""}
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
async function corrigirEscrita(q, texto) {
  const tipo = sim.it.tipo, e = q.tipo_peca && pecaEstr[q.tipo_peca], els = e && e.estrutura && e.estrutura.elementos || [];
  const p = `Você é examinador de concurso (banca ${sim.banca || ""}). Corrija com rigor e justiça a resposta do candidato.\n\n${tipo === "peca" ? "PEÇA PRÁTICA (" + (q.tipo_peca || "") + ")" : "QUESTÃO DISCURSIVA"}:\n${q.enunciado}\n\n` +
    ((q.espelho || []).length ? `ESPELHO ${q.inedita ? "" : "OFICIAL "}DE CORREÇÃO:\n${q.espelho.map(x => `- ${x.item} (${x.pontos} pts)`).join("\n")}\n\n` : "") +
    (q.resposta_esperada ? `RESPOSTA ESPERADA:\n${q.resposta_esperada}\n\n` : "") +
    (els.length ? `ELEMENTOS DE ESTRUTURA ESPERADOS:\n${els.map(x => "- " + x.nome).join("\n")}\n\n` : "") +
    `RESPOSTA DO CANDIDATO:\n${texto}\n\nAvalie item por item do espelho (ou, sem espelho, os pontos jurídicos essenciais), a técnica, a fundamentação e a clareza${tipo === "peca" ? ", e confira cada elemento da estrutura da peça" : ""}. Responda em JSON: {"nota": number de 0 a 10 com uma casa decimal, "itens": [{"item": string, "atendido": "sim"|"parcial"|"não", "comentario": string}]${tipo === "peca" ? ', "estrutura": [{"elemento": string, "presente": "sim"|"parcial"|"não", "comentario": string}]' : ""}, "pontos_fortes": [string], "melhorias": [string], "feedback": string curto}`;
  return gemini(p);
}

// ---------- eventos ----------
document.addEventListener("click", async e => {
  if (!e.target.closest("#estudoConteudo")) return;
  const t = e.target.closest("button"); if (!t) return;
  const f = lerProv("filtro", { tipo: "objetiva", cargo: "" }), fp = lerProv("filtroPeca", { cargo: "", aba: "estrutura" });
  if (t.dataset.provtipo) { f.tipo = t.dataset.provtipo; gravarProv("filtro", f); desenharEstudo("provas"); return; }
  if (t.dataset.provcargo !== undefined) { f.cargo = t.dataset.provcargo; gravarProv("filtro", f); desenharEstudo("provas"); return; }
  if (t.dataset.pecaaba) { fp.aba = t.dataset.pecaaba; gravarProv("filtroPeca", fp); desenharEstudo("pecas"); return; }
  if (t.dataset.pecacargo !== undefined) { fp.cargo = t.dataset.pecacargo; fp.tipoAberto = ""; gravarProv("filtroPeca", fp); desenharEstudo("pecas"); return; }
  if (t.dataset.pecatipo) { fp.tipoAberto = fp.tipoAberto === t.dataset.pecatipo ? "" : t.dataset.pecatipo; gravarProv("filtroPeca", fp); desenharEstudo("pecas"); return; }
  if (t.dataset.pecarefazer) { delete pecaEstr[t.dataset.pecarefazer]; carregarEstrutura(t.dataset.pecarefazer, true); desenharEstudo("pecas"); return; }
  if (t.dataset.copiaresq) { const s = pecaEstr[t.dataset.copiaresq]; try { await navigator.clipboard.writeText(s.estrutura.esqueleto); toast("Esqueleto copiado."); } catch (err) {} return; }
  if (t.id === "provRecarregar") { repo = null; carregarRepo(true); desenharEstudo(estudoAba); return; }
  if (t.dataset.provsim) { iniciarSimulado(t.dataset.provsim, false); return; }
  if (t.dataset.provnovas) { iniciarSimulado(t.dataset.provnovas, true); return; }
  if (t.dataset.pecanova) { iniciarSimulado(t.dataset.pecanova, true); return; }
  if (!sim) return;
  if (t.id === "provSair") { const aba = sim.it.tipo === "peca" ? "pecas" : "provas"; sim = null; desenharEstudo(aba); return; }
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
    try { const c = await corrigirEscrita(q, texto); sim.resp[k] = { texto, correcao: c, conta: true, ok: +c.nota >= 6 }; try { localStorage.removeItem(chaveEst("prov-" + rascunhoKey())); } catch (err) {} }
    catch (err) { sim.resp[k] = { texto }; toast("A IA não conseguiu corrigir agora (" + err.message + "). Veja o espelho."); }
    desenharEstudo(estudoAba); return;
  }
  if (t.id === "provProx") {
    if (sim.it.tipo === "peca") { const aba = "pecas"; sim = null; desenharEstudo(aba); return; }
    sim.i++; if (sim.novas) { gerarNova(sim.i); gerarNova(sim.i + 1); }
    desenharEstudo("provas"); $("estudoConteudo").scrollTop = 0; return;
  }
});
document.addEventListener("input", e => {
  if (e.target.id !== "provTexto" || !sim) return;
  gravarProv(rascunhoKey(), e.target.value);
  const el = $("provLinhas"), q = questaoAtual(); const l = Math.ceil(e.target.value.length / 75);
  if (el) el.textContent = `(~${l} linha${l === 1 ? "" : "s"}${q && q.linhas ? " de " + q.linhas : ""})`;
});
