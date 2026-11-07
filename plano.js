// Plano de estudos: ciclo de matérias montado para a PROVA MAIS PRÓXIMA (regra fixa), com a tela "Hoje".
// - Horários do usuário (dias úteis, fim de semana e um período de férias com mais horas) → blocos de 1 hora.
// - Matérias e pesos da etapa: a IA lê o conteúdo programático do edital anexado ao concurso (uma vez).
// - Ciclo: as matérias se revezam na proporção do peso; quem perde um dia só continua de onde parou.
// - Etapas até a prova: base → revisão e prática → reta final (últimos 15 dias) → véspera leve.
// Tudo fica em lerEst("plano") e vai pela sincronização geral (sincronia.js): igual em todos os aparelhos.

const PERFIL_PADRAO = { util: "16:00-19:00", fds: "08:00-10:00", ferias: { ate: "2027-01-31", util: "08:00-13:00, 16:00-19:00", fds: "08:00-10:00" } };
const plano = () => lerEst("plano", {}) || {};
function gravarPlano(k, v) { const p = plano(); if (v === undefined) delete p[k]; else p[k] = v; gravarEst("plano", p); }
const perfilPlano = () => { const p = plano().perfil || {}; return { ...PERFIL_PADRAO, ...p, ferias: { ...PERFIL_PADRAO.ferias, ...(p.ferias || {}) } }; };
let planoUi = { lendo: "", erro: "" };

// ---------- prova-alvo: sempre a mais próxima ----------
function alvoPlano() {
  let melhor = null;
  for (const x of (typeof itens !== "undefined" ? itens : [])) {
    const a = andamento(x); if (!a.ativo || !a.prox) continue;
    const f = a.prox.f, dias = diasAte(f.data);
    if (dias == null || dias < 0) continue;
    if (!melhor || f.data < melhor.f.data) melhor = { x, i: a.prox.i, f, dias };
  }
  if (!melhor) return null;
  const { x, i, f } = melhor, etapaDatas = datasDaEtapa(x, i), d0 = parseData(f.data);
  // entram no plano todas as provas ainda por fazer que caem na mesma janela: a mesma etapa (ex.: TJMG 16, 17 e 18/01)
  // ou outra etapa aplicada no mesmo dia ou até 3 dias depois (ex.: PC-BA, objetiva e discursiva no mesmo dia)
  const et = etapaDaFase(f), fases = (x.fases || []).filter((z, k) => k === i || (z.data && z.situacao === "Aguardando" &&
    ((et && etapaDaFase(z) === et && etapaDatas.includes(z.data)) || (parseData(z.data) - d0) / 864e5 >= 0 && (parseData(z.data) - d0) / 864e5 <= 3)));
  const datas = [...new Set(fases.map(z => z.data))].sort();
  const etapas = [...new Set(fases.map(etapaDaFase).filter(Boolean))];
  const escrita = fases.some(z => temEscritaPlano(z)), objetiva = fases.some(z => temObjetivaPlano(z));
  const rotulo = etapas.length > 1 ? etapas.map(e => e + "ª").join(" e ") + " etapas" : fases.length > 1 && et ? et + "ª etapa" : f.nome || "Prova";
  return { ...melhor, chave: `${x.id}:${f.uid}`, datas, fases, nome: x.nome, cargo: x.cargo || "",
    escrita, modo: escrita && objetiva ? "misto" : escrita ? "esc" : "obj", titulo: `${siglaOuNome(x)} · ${rotulo}` };
}
function temObjetivaPlano(f) { return (f.objetivas && ((f.objetivas.blocos || []).length || +f.objetivas.total)) || /objetiv/i.test(f.nome || "") || /objetiv/i.test(f.formato || ""); }
function temEscritaPlano(f) { return (f.escritas && f.escritas.length) || /discurs|senten|escrit|pe[cç]a|prátic|pratic/i.test(f.nome || "") || /escrit|discurs/i.test(f.formato || ""); }
function siglaOuNome(x) { return x.sigla || (String(x.nome || "").length > 28 ? siglaDoOrgao(x.nome) : x.nome); }
function descricaoFases(al) {
  return al.fases.map(f => {
    const p = [f.nome || "Prova", f.data ? `em ${f.data}` : ""];
    if (f.escritas && f.escritas.length) p.push("— " + f.escritas.map(e => `${e.qtd || 1} ${e.tipo}`).join(" + "));
    if (f.objetivas && f.objetivas.blocos && f.objetivas.blocos.length) p.push("— objetiva: " + f.objetivas.blocos.map(b => `${b.nome} ${b.qtd} questões (${b.disciplinas})`).join("; "));
    return p.filter(Boolean).join(" ");
  }).join("\n");
}

// ---------- matérias da etapa (IA lê o edital) ----------
async function lerConteudoDoEdital(al) {
  if (planoUi.lendo) return;
  planoUi.lendo = al.chave; planoUi.erro = ""; redesenharPlano();
  try {
    let texto = "", pdfParte = null;
    if (al.x.edital_arquivo) {
      const blob = await arq("ler", `${al.x.id}:edital`).catch(() => null) || await baixarDaNuvem(`${al.x.id}:edital`).catch(() => null);
      if (blob) {
        // a IA lê o PDF inteiro (sem o limite de tamanho do texto); só se o arquivo for grande demais vai o texto extraído
        if (blob.size < 10e6) pdfParte = { inline_data: { mime_type: "application/pdf", data: await blobBase64(blob) } };
        else {
          const t = (await textoDoPdf(blob, 400)).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n"), u = semAcentoEst(t);
          let ini = u.search(/conteudo programatico|programa das (disciplinas|materias)|conteudos programaticos/);
          if (ini < 0) ini = Math.max(0, t.length - 50000);
          texto = t.slice(ini, ini + 50000);   // o servidor aceita até 60 mil caracteres por pedido
        }
      }
    }
    const r = await gemini(`Você monta planos de estudo para concursos jurídicos.
Concurso: ${al.nome}${al.cargo ? " — cargo: " + al.cargo : ""}.
Etapa que o candidato vai fazer agora (a próxima prova):
${descricaoFases(al)}

${pdfParte ? "O EDITAL ESTÁ NO PDF ANEXO: use o conteúdo programático dele." : texto ? "O trecho do conteúdo programático do edital vem no fim deste pedido." : "(o edital não está disponível: use o que se sabe do formato da prova e do cargo)"}

Liste as matérias cobradas nas provas acima (todas elas: se houver prova objetiva e discursiva no mesmo dia, junte as matérias das duas; uma matéria que aparece nas duas entra uma vez só, com peso maior).
Se a etapa tiver sentenças ou peças práticas, inclua também uma matéria do tipo "peca" para cada tipo exigido (ex.: "Sentença cível", "Sentença criminal").
Para cada matéria:
- nome: curto (ex.: "Direito Penal", "Direito Processual Civil")
- peso: 1 a 5, pela importância nesta etapa (quantidade de questões/pontos, ou relevância para o cargo)
- tipo: "teoria" ou "peca"
- lei: a categoria de lei seca que mais combina, uma destas: ${MATERIAS_LEI.join(", ")} (ou "" se nenhuma)
- topicos: até 12 tópicos principais, curtos (até 8 palavras), na ordem do edital
Responda só com JSON: {"materias":[{"nome":"","peso":3,"tipo":"teoria","lei":"","topicos":[""]}]}${texto && !pdfParte ? "\n\nCONTEÚDO PROGRAMÁTICO DO EDITAL (trecho):\n" + texto : ""}`, { ms: 180000, ...(pdfParte ? { partes: [pdfParte] } : {}) });
    const ms = listaDeMaterias(r).map(m => ({ ...m, nome: m.nome || m.name || m.materia || m.disciplina })).filter(m => m.nome).map(m => ({ nome: String(m.nome).trim(), peso: Math.min(5, Math.max(1, Math.round(+m.peso || 3))), tipo: m.tipo === "peca" ? "peca" : "teoria",
      lei: MATERIAS_LEI.includes(m.lei) ? m.lei : "", topicos: (m.topicos || []).map(String).filter(Boolean).slice(0, 12) }));
    if (!ms.length) { console.warn("resposta da IA", r); throw new Error("a IA respondeu sem a lista de matérias" + (texto || pdfParte ? "" : " (não consegui ler o texto do edital)")); }
    gravarPlano("cont:" + al.chave, { quando: hojeISO(), materias: ms, doEdital: !!(texto || pdfParte) });
  } catch (e) { planoUi.erro = "Não consegui montar as matérias: " + (e.message || e) + ". Tente de novo ou inclua as matérias à mão em Ajustes."; }
  planoUi.lendo = ""; redesenharPlano();
}
// a IA às vezes devolve a lista solta ou com outro nome de campo: acha a primeira lista de objetos com nome
function listaDeMaterias(r) {
  if (Array.isArray(r)) return r.length && typeof r[0] === "object" && !Array.isArray(r[0]) && !("nome" in r[0] || "name" in r[0] || "materia" in r[0] || "disciplina" in r[0]) ? r.flatMap(listaDeMaterias) : r.filter(x => x && typeof x === "object");
  if (r && typeof r === "object") { if (Array.isArray(r.materias)) return r.materias; for (const v of Object.values(r)) { const l = listaDeMaterias(v); if (l.length) return l; } }
  return [];
}
function blobBase64(blob) { return new Promise((ok, falha) => { const f = new FileReader(); f.onload = () => ok(String(f.result).split(",")[1]); f.onerror = falha; f.readAsDataURL(blob); }); }
const conteudoPlano = al => al && plano()["cont:" + al.chave];

// ---------- ciclo ----------
// sequência de um ciclo: cada matéria aparece "peso" vezes, espalhadas (sem repetir a mesma em seguida)
function sequenciaCiclo(ms) {
  const atual = ms.map(() => 0), tot = ms.reduce((a, m) => a + m.peso, 0), seq = [];
  for (let k = 0; k < tot; k++) {   // "round robin" ponderado: espalha cada matéria pelo ciclo
    ms.forEach((m, i) => atual[i] += m.peso);
    const b = atual.indexOf(Math.max(...atual)); atual[b] -= tot; seq.push(b);
  }
  for (let k = 1; k < seq.length; k++) if (seq[k] === seq[k - 1]) { const j = seq.findIndex((x, n) => n > k && x !== seq[k]); if (j > 0) [seq[k], seq[j]] = [seq[j], seq[k]]; }
  return seq;
}
function etapaPlano(al, cont) {
  if (al.dias <= 0) return "prova";
  if (al.dias === 1) return "vespera";
  const inicio = parseData(cont.quando) || hoje(), total = Math.max(1, Math.round((parseData(al.f.data) - inicio) / 864e5));
  if (al.dias <= 15) return "final";
  if (al.dias <= Math.max(25, total * 0.35)) return "revisao";
  return "base";
}
const NOME_ETAPA = { base: "Base (teoria + lei seca)", revisao: "Revisão e prática", final: "Reta final", vespera: "Véspera", prova: "Dia da prova" };
// o que fazer em cada bloco: depende da etapa, do tipo da prova (escrita ou objetiva) e do tipo da matéria
function atividadeBloco(m, n, etapa, modo) {
  if (m.tipo === "peca") return etapa === "final" ? { txt: "Peça/sentença completa no tempo de prova", area: "pecas" }
    : n % 2 ? { txt: "Treinar estrutura e fundamentação da peça", area: "pecas" } : { txt: "Redigir 1 peça/sentença e corrigir pelo espelho", area: "pecas" };
  const obj = { txt: "Questões objetivas", area: "info" }, disc = { txt: "Questão discursiva (informativos)", area: "info" };
  const pratica = modo === "misto" ? [obj, disc] : modo === "esc" ? [disc] : [obj];
  const op = {
    base: modo === "misto" ? [{ txt: "Teoria + lei seca", area: "lei" }, obj, { txt: "Teoria + lei seca", area: "lei" }, disc] : [{ txt: "Teoria + lei seca", area: "lei" }, pratica[0]],
    revisao: [...pratica, { txt: "Revisão: lei seca e julgados", area: "lei" }],
    final: [...(modo === "obj" ? [{ txt: "Simulado da banca", area: "provas" }] : modo === "esc" ? [{ txt: "Discursiva cronometrada", area: "provas" }] : [{ txt: "Simulado da banca", area: "provas" }, { txt: "Discursiva cronometrada", area: "provas" }]), { txt: "Revisão dos erros e artigos difíceis", area: "lei" }]
  }[etapa] || [{ txt: "Revisão leve", area: "lei" }];
  return op[n % op.length];
}
function bloco(idx, ms, seq, etapa, modo) {
  const L = seq.length, i = seq[idx % L], m = ms[i];
  const n = Math.floor(idx / L) * m.peso + seq.slice(0, idx % L).filter(x => x === i).length;   // quantas vezes a matéria já apareceu
  const at = atividadeBloco(m, n, etapa, modo);
  const topico = m.topicos && m.topicos.length ? m.topicos[(etapa === "base" ? Math.floor(n / 2) : n) % m.topicos.length] : "";
  return { idx, m, ...at, topico };
}

// ---------- horários ----------
function periodosHoje(data) {
  const p = perfilPlano(), d = data || hoje(), fds = d.getDay() === 0 || d.getDay() === 6;
  const iso = hojeISOde(d), ferias = p.ferias.ate && iso <= p.ferias.ate && (!p.ferias.de || iso >= p.ferias.de);
  const txt = ferias ? (fds ? p.ferias.fds : p.ferias.util) : (fds ? p.fds : p.util);
  return periodosDeTexto(txt);
}
// "3 h nos dias úteis · 2 h no fim de semana · férias até 31/01: 8 h"
function resumoHorarios() {
  const p = perfilPlano(), h = t => periodosDeTexto(t).reduce((a, [x, y]) => a + Math.floor((y - x) / 60), 0), br = s => s ? s.split("-").reverse().join("/") : "";
  return `${h(p.util)} h nos dias úteis · ${h(p.fds)} h no fim de semana${p.ferias.ate ? ` · férias${p.ferias.de ? " de " + br(p.ferias.de) : ""} até ${br(p.ferias.ate)}: ${h(p.ferias.util)} h nos dias úteis` : ""}`;
}
function periodosDeTexto(txt) {
  return String(txt || "").split(/[,;]/).map(s => s.trim().match(/^(\d{1,2})(?::(\d\d))?\s*(?:-|–|a|às|ate|até)\s*(\d{1,2})(?::(\d\d))?$/i)).filter(Boolean)
    .map(m => [(+m[1]) * 60 + (+m[2] || 0), (+m[3]) * 60 + (+m[4] || 0)]).filter(([a, b]) => b > a);
}
const hojeISOde = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hhmm = m => `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}`;
function horariosHoje() { const s = []; periodosHoje().forEach(([a, b]) => { for (let t = a; t + 60 <= b; t += 60) s.push(t); }); return s; }

// ---------- dia de hoje ----------
function posicaoPlano(chave) { return { cursor: 0, feitos: [], ...(plano()["pos:" + chave] || {}) }; }
const blocoFeito = (pos, i) => i < pos.cursor || pos.feitos.includes(i);
function diaDeHoje(al, n) {
  const k = "dia:" + hojeISO(), d = plano()[k];
  if (d && d.alvo === al.chave) return d;
  const pos = posicaoPlano(al.chave), lista = [];
  for (let i = pos.cursor; lista.length < n && i < pos.cursor + 500; i++) if (!pos.feitos.includes(i)) lista.push(i);
  const novo = { alvo: al.chave, lista };
  // limpa dias com mais de 3 semanas
  const p = plano(), lim = hojeISOde(new Date(Date.now() - 21 * 864e5));
  Object.keys(p).forEach(c => { if (c.startsWith("dia:") && c.slice(4) < lim) delete p[c]; });
  p[k] = novo; gravarEst("plano", p);
  return novo;
}
function marcarBloco(chave, idx, feito) {
  const pos = posicaoPlano(chave);
  if (feito) { if (!pos.feitos.includes(idx) && idx >= pos.cursor) pos.feitos.push(idx); }
  else if (idx < pos.cursor) { for (let i = idx + 1; i < pos.cursor; i++) pos.feitos.push(i); pos.cursor = idx; }
  else pos.feitos = pos.feitos.filter(i => i !== idx);
  while (pos.feitos.includes(pos.cursor)) { pos.feitos = pos.feitos.filter(i => i !== pos.cursor); pos.cursor++; }
  pos.feitos.sort((a, b) => a - b);
  gravarPlano("pos:" + chave, pos);
}

// ---------- telas ----------
function dadosPlano() {
  const al = alvoPlano(); if (!al) return { al };
  const cont = conteudoPlano(al); if (!cont || !cont.materias.length) return { al, cont };
  const ms = cont.materias, seq = sequenciaCiclo(ms), etapa = etapaPlano(al, cont), pos = posicaoPlano(al.chave);
  const horas = horariosHoje(), n = etapa === "prova" ? 0 : etapa === "vespera" ? Math.min(1, horas.length) : horas.length;
  const dia = diaDeHoje(al, n);
  const blocos = dia.lista.map((i, k) => ({ ...bloco(i, ms, seq, etapa === "vespera" ? "final" : etapa, al.modo), hora: horas[k], feito: blocoFeito(pos, i) }));
  if (etapa === "vespera") blocos.forEach(b => { b.txt = "Revisão leve (só o que já marcou como difícil)"; b.area = "lei"; });
  return { al, cont, ms, seq, etapa, pos, dia, blocos };
}
function rotuloDiasPlano(ds) {
  const p = ds.map(x => x.split("-")), mesmoMes = p.every(z => z[1] === p[0][1]);
  const itens = p.map((z, k) => mesmoMes && k < p.length - 1 ? z[2] : `${z[2]}/${z[1]}`);
  return itens.length > 1 ? itens.slice(0, -1).join(", ") + " e " + itens[itens.length - 1] : itens[0];
}
function cabecalhoPlano(D) {
  const al = D.al, d = al.dias;
  return `<div class="pl-alvo"><span class="pl-dias"><b>${d}</b> ${d === 1 ? "dia" : "dias"}</span><div><b>${esc(al.titulo)}</b><span class="note">${rotuloDiasPlano(al.datas)} · foco sempre na prova mais próxima${D.etapa ? ` · etapa: <b>${NOME_ETAPA[D.etapa]}</b>` : ""}</span></div></div>`;
}
function htmlBlocosHoje(D) {
  if (D.etapa === "prova") return `<p class="pl-msg">Hoje é dia de prova. Boa prova! 🍀</p>`;
  if (!D.blocos.length) return `<p class="note">Hoje não há horário de estudo no seu perfil. Ajuste os horários em ☰ (no alto) › Editar perfil.</p>`;
  const prog = lerEst("prog", {}), revisar = (typeof julgados !== "undefined" && Array.isArray(julgados) ? julgados : []).filter(j => prog[j.id] && prog[j.id].prox <= hojeISO()).length;
  const feitos = D.blocos.filter(b => b.feito).length;
  return `<p class="note pl-cont">${feitos} de ${D.blocos.length} bloco(s) de hoje${D.etapa === "vespera" ? " · véspera: estude pouco e descanse" : ""}</p>
    <ul class="pl-lista">${D.blocos.map(b => `<li class="${b.feito ? "ok" : ""}"><label class="pl-chk"><input type="checkbox" data-plfeito="${b.idx}"${b.feito ? " checked" : ""}><span class="pl-hora">${b.hora != null ? hhmm(b.hora) : ""}</span></label>
      <div class="pl-txt"><b>${esc(b.m.nome)}</b><span>${esc(b.txt)}${b.topico ? ` — <i>${esc(b.topico)}</i>` : ""}</span></div>
      <button type="button" class="mini" data-plabrir="${b.idx}">Abrir ›</button></li>`).join("")}
      ${revisar ? `<li class="pl-extra"><span class="pl-hora">+</span><div class="pl-txt"><b>Revisão espaçada</b><span>${revisar} julgado(s) para revisar hoje (10–15 min)</span></div><button type="button" class="mini" data-plabrir="revisar">Abrir ›</button></li>` : ""}</ul>
    ${feitos === D.blocos.length ? `<div class="actions" style="justify-content:flex-start"><button type="button" class="mini" data-plmais="1">+ Mais um bloco do ciclo</button></div>` : ""}`;
}
function htmlSemPlano(D) {
  if (!D.al) return `<p class="note">Nenhuma prova com data marcada nos concursos em andamento. Quando você cadastrar a data, o plano é montado para a prova mais próxima.</p>`;
  if (planoUi.lendo === D.al.chave) return `${cabecalhoPlano(D)}<p class="note">⏳ A IA está lendo o edital e separando as matérias desta etapa… (até 2 minutos)</p>`;
  return `${cabecalhoPlano(D)}${planoUi.erro ? `<p class="lei-msg">${esc(planoUi.erro)}</p>` : ""}
    <p class="note">Para montar o ciclo, a IA lê o conteúdo programático do ${D.al.x.edital_arquivo ? "edital anexado a este concurso" : "cargo (este concurso não tem edital anexado)"} e separa as matérias desta etapa com o peso de cada uma. Depois você pode ajustar.</p>
    <div class="actions" style="justify-content:flex-start"><button type="button" class="primary" data-plmontar="1">Montar meu plano</button></div>`;
}
// cartão no topo da página Estudar
function htmlCartaoPlano() {
  const D = dadosPlano();
  const corpo = D.blocos ? cabecalhoPlano(D) + htmlBlocosHoje(D) + `<div class="actions" style="justify-content:flex-start"><button type="button" class="mini" data-plaba="plano-ciclo">Ver o ciclo</button><button type="button" class="mini" data-plaba="plano-ajustes">Ajustes</button></div>` : htmlSemPlano(D);
  return `<section class="pe-plano"><div class="pl-topo"><h3>Plano de estudos · Hoje</h3><span class="note">${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</span></div>${corpo}</section>`;
}
// modal com as abas
function htmlPlanoModal(aba) {
  const D = dadosPlano();
  const abas = `<div class="est-abas">${[["plano-hoje", "Hoje"], ["plano-ciclo", "Ciclo"], ["plano-ajustes", "Ajustes"]].map(([k, n]) => `<button type="button" class="${aba === k ? "on" : ""}" data-estaba="${k}">${n}</button>`).join("")}</div>`;
  let corpo = "";
  if (aba === "plano-ajustes") corpo = htmlAjustesPlano(D);
  else if (!D.blocos) corpo = htmlSemPlano(D);
  else if (aba === "plano-ciclo") corpo = cabecalhoPlano(D) + htmlCiclo(D);
  else corpo = cabecalhoPlano(D) + htmlBlocosHoje(D);
  return `<div class="dlg-head"><div style="flex:1;min-width:0"><h2>Plano de estudos</h2><p class="sub">Ciclo de matérias para a prova mais próxima · ajusta sozinho quando você pula um dia</p></div><button type="button" class="close" data-close aria-label="Fechar">×</button></div>${abas}<div class="est-corpo">${corpo}</div>`;
}
function htmlCiclo(D) {
  const L = D.seq.length, feitosPorMat = D.ms.map(() => 0);
  for (let i = 0; i < D.pos.cursor + 500; i++) if (blocoFeito(D.pos, i)) feitosPorMat[D.seq[i % L]]++;
  const total = feitosPorMat.reduce((a, b) => a + b, 0), volta = Math.floor(D.pos.cursor / L) + 1, noCiclo = D.pos.cursor % L;
  // horas da semana (últimos 7 dias)
  const p = plano(); let sem = 0, semPlan = 0;
  for (let k = 0; k < 7; k++) { const d = p["dia:" + hojeISOde(new Date(Date.now() - k * 864e5))]; if (d && d.alvo === D.al.chave) { semPlan += d.lista.length; sem += d.lista.filter(i => blocoFeito(D.pos, i)).length; } }
  return `<p class="note">Volta ${volta} do ciclo · bloco ${noCiclo + 1} de ${L} · ${total} hora(s) de estudo registradas neste plano · últimos 7 dias: ${sem} de ${semPlan} bloco(s)</p>
    <ol class="pl-ciclo">${D.seq.map((mi, k) => `<li class="${k < noCiclo ? "ok" : k === noCiclo ? "agora" : ""}">${esc(D.ms[mi].nome)}</li>`).join("")}</ol>
    <h4 class="pl-h">Matérias desta etapa</h4>
    <div class="pl-mats">${D.ms.map((m, i) => `<div class="pl-mat"><div><b>${esc(m.nome)}</b><span class="note">peso ${m.peso} · ${m.peso} bloco(s) por volta · ${feitosPorMat[i]} h estudadas${m.tipo === "peca" ? " · peça" : ""}</span></div>
      ${m.topicos.length ? `<details><summary>${m.topicos.length} tópicos</summary><ol>${m.topicos.map(t => `<li>${esc(t)}</li>`).join("")}</ol></details>` : ""}</div>`).join("")}</div>`;
}
function htmlAjustesPlano(D) {
  const p = perfilPlano(), ms = D.cont ? D.cont.materias : [];
  return `<div class="pl-horas"><div><b>Seus horários de estudo</b><span class="note">${resumoHorarios()}</span></div><button type="button" class="mini" data-abrirperfil="horarios">Editar no meu perfil</button></div>
    ${D.al ? `<h4 class="pl-h">Matérias de ${esc(D.al.titulo)}</h4>
    ${ms.length ? `<p class="note">O peso (1 a 5) é quantas horas a matéria ganha em cada volta do ciclo.</p>
      <div class="pl-mats">${ms.map((m, i) => `<div class="pl-mat pl-edit"><b>${esc(m.nome)}</b><select data-plpeso="${i}">${[1, 2, 3, 4, 5].map(n => `<option${n === m.peso ? " selected" : ""}>${n}</option>`).join("")}</select><button type="button" class="mini" data-pltirar="${i}" title="Tirar do ciclo">×</button></div>`).join("")}</div>` : `<p class="note">Ainda sem matérias.</p>`}
    <div class="sim-grid" style="margin-top:10px"><label>Incluir matéria<input id="plNovaMat" placeholder="ex.: Direito Eleitoral"></label><label>Tipo<select id="plNovaTipo"><option value="teoria">teoria</option><option value="peca">peça / sentença</option></select></label></div>
    <div class="actions" style="justify-content:flex-start"><button type="button" class="mini" data-plincluir="1">Incluir</button><button type="button" class="mini" data-plmontar="1">${ms.length ? "Ler o edital de novo (refaz as matérias)" : "Montar pelo edital"}</button></div>` : ""}`;
}

// ---------- abrir a função certa do app ----------
function abrirBlocoPlano(idx) {
  if (idx === "revisar") { abrirAreaEstudo("info"); setTimeout(() => desenharEstudo("revisar"), 0); return; }
  const D = dadosPlano(), b = D.blocos && D.blocos.find(x => String(x.idx) === String(idx)); if (!b) return;
  if (b.area === "lei") {
    const lm = b.m.lei || "";
    if (typeof leisProntas === "function") {
      const l = leisProntas().find(x => lm && materiaDe(x) === lm);
      if (l) { gravarEst("leiRev", { ...lerLeiCfg(), lei: l.id, cap: "", busca: "" }); abrirAreaEstudo("lei"); setTimeout(() => desenharEstudo("lei-ler"), 0); return; }
    }
    gravarEst("leiMat", lm); abrirAreaEstudo("lei"); setTimeout(() => desenharEstudo("lei-leis"), 0); return;
  }
  abrirAreaEstudo(b.area);
}
function abrirPlano(aba) {
  estudoAba = ""; desenharEstudo(aba || "plano-hoje");
  const d = $("dlgEstudo"); if (!d.open) d.showModal(); $("estudoConteudo").scrollTop = 0;
}
function redesenharPlano() {
  try {
    const d = $("dlgEstudo");
    if (d && d.open && String(estudoAba).startsWith("plano")) desenharEstudo(estudoAba);
    if (typeof renderEstudoPagina === "function") renderEstudoPagina();
  } catch (e) { console.warn("plano: redesenho", e); }
}

document.addEventListener("click", e => {
  const t = e.target.closest("[data-plfeito],[data-plabrir],[data-plmontar],[data-plaba],[data-plmais],[data-pltirar],[data-plincluir]"); if (!t) return;
  const d = t.dataset, al = alvoPlano();
  if (d.plfeito !== undefined) { if (al) marcarBloco(al.chave, +d.plfeito, t.checked); redesenharPlano(); return; }
  if (d.plabrir !== undefined) { abrirBlocoPlano(d.plabrir); return; }
  if (d.plaba) { abrirPlano(d.plaba); return; }
  if (d.plmontar && al) { lerConteudoDoEdital(al); return; }
  if (d.plmais && al) { const k = "dia:" + hojeISO(), p = plano(), dia = p[k]; if (dia) { const pos = posicaoPlano(al.chave); let i = Math.max(pos.cursor, ...dia.lista) + 1; while (pos.feitos.includes(i)) i++; dia.lista.push(i); gravarEst("plano", p); } redesenharPlano(); return; }
  if ((d.pltirar !== undefined || d.plincluir) && al) {
    const c = conteudoPlano(al) || { quando: hojeISO(), materias: [] };
    if (d.pltirar !== undefined) c.materias.splice(+d.pltirar, 1);
    else { const nome = ($("plNovaMat") || {}).value.trim(); if (!nome) { toast("Escreva o nome da matéria."); return; } c.materias.push({ nome, peso: 3, tipo: $("plNovaTipo").value, lei: MATERIAS_LEI.find(m => semAcentoEst(nome).includes(semAcentoEst(m))) || "", topicos: [] }); }
    gravarPlano("cont:" + al.chave, c); gravarPlano("dia:" + hojeISO(), undefined); redesenharPlano(); return;
  }
});
document.addEventListener("change", e => {
  const s = e.target.closest("[data-plpeso]"); if (!s) return;
  const al = alvoPlano(), c = al && conteudoPlano(al); if (!c) return;
  c.materias[+s.dataset.plpeso].peso = +s.value; gravarPlano("cont:" + al.chave, c); gravarPlano("dia:" + hojeISO(), undefined); redesenharPlano();
});
