// Plano de estudos de cada concurso, para a próxima prova dele.
// 1) A IA lê o edital e devolve TODO o conteúdo programático da etapa: matérias (peso 1–5) e todos os tópicos,
//    cada um com a incidência em prova (r: 3 alta, 2 média, 1 baixa).
// 2) O app conta as horas de estudo até a véspera (horários do perfil: dias úteis, fim de semana e férias) e escolhe
//    o MÉTODO que cabe nesse tempo: estudo completo → revisão completa → revisão acelerada → reta final intensiva.
//    Quanto menos tempo, mais tópicos por bloco e, no limite, só os de maior incidência (os outros ficam de fora).
// 3) Monta o ROTEIRO dia a dia: teoria de cada tópico → revisão e questões → reta final (simulados) → véspera leve.
// 4) Se o usuário atrasar (ou mudar horários/matérias), o roteiro é refeito a partir de hoje com o que falta.
// Tudo fica em lerEst("plano") e vai pela sincronização geral (sincronia.js): igual em todos os aparelhos.

const PERFIL_PADRAO = { util: "16:00-19:00", fds: "08:00-10:00", ferias: { ate: "2027-01-31", util: "08:00-13:00, 16:00-19:00", fds: "08:00-10:00" } };
const plano = () => lerEst("plano", {}) || {};
function gravarPlano(k, v) { const p = plano(); if (v === undefined) delete p[k]; else p[k] = v; gravarEst("plano", p); }
const perfilPlano = () => { const p = plano().perfil || {}; return { ...PERFIL_PADRAO, ...p, ferias: { ...PERFIL_PADRAO.ferias, ...(p.ferias || {}) } }; };
let planoUi = { lendo: {}, erro: {}, cid: "" };   // cid: concurso cujo plano está aberto

// ---------- prova-alvo: sempre a mais próxima ----------
// prova-alvo de um concurso (a próxima prova dele) ou, sem concurso indicado, a mais próxima de todas
function alvoPlano(cid) {
  cid = cid === undefined ? planoUi.cid : cid;
  let melhor = null;
  for (const x of (typeof itens !== "undefined" ? itens : [])) {
    if (cid && x.id !== cid) continue;
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
  if (planoUi.lendo[al.chave]) return;
  planoUi.lendo[al.chave] = true; delete planoUi.erro[al.chave]; redesenharPlano();
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
- topicos: TODOS os tópicos do conteúdo programático desta matéria, na ordem do edital, sem pular nenhum.
  Cada tópico curto (até 8 palavras); junte subitens muito pequenos num tópico só (no máximo 40 tópicos por matéria).
  Para cada tópico, "r" = incidência em provas deste cargo e desta banca: 3 alta, 2 média, 1 baixa.
  Em matéria do tipo "peca", os tópicos são as partes/temas a treinar (ex.: "Relatório", "Dosimetria da pena").
Responda só com JSON: {"materias":[{"nome":"","peso":3,"tipo":"teoria","lei":"","topicos":[{"t":"","r":2}]}]}${texto && !pdfParte ? "\n\nCONTEÚDO PROGRAMÁTICO DO EDITAL (trecho):\n" + texto : ""}`, { ms: 240000, temperatura: 0.2, ...(pdfParte ? { partes: [pdfParte] } : {}) });
    const ms = listaDeMaterias(r).map(m => ({ ...m, nome: m.nome || m.name || m.materia || m.disciplina })).filter(m => m.nome).map(m => ({ nome: String(m.nome).trim(), peso: Math.min(5, Math.max(1, Math.round(+m.peso || 3))), tipo: m.tipo === "peca" ? "peca" : "teoria",
      lei: MATERIAS_LEI.includes(m.lei) ? m.lei : "", topicos: normTopicos(m.topicos) }));
    if (!ms.length) { console.warn("resposta da IA", r); throw new Error("a IA respondeu sem a lista de matérias" + (texto || pdfParte ? "" : " (não consegui ler o texto do edital)")); }
    gravarPlano("cont:" + al.chave, { quando: hojeISO(), materias: ms, doEdital: !!(texto || pdfParte) });
    gravarPlano("cob:" + al.chave, []); gravarPlano("rot:" + al.chave, undefined); refazerRoteiro(al, "novo");
    if (typeof toast === "function") toast(`Plano de estudos de ${al.titulo} pronto.`);
  } catch (e) { planoUi.erro[al.chave] = "Não consegui montar as matérias: " + (e.message || e) + "."; if (typeof toast === "function") toast("Não consegui montar o plano. Tente de novo."); }
  delete planoUi.lendo[al.chave]; redesenharPlano();
}
// a IA às vezes devolve a lista solta ou com outro nome de campo: acha a primeira lista de objetos com nome
function listaDeMaterias(r) {
  if (Array.isArray(r)) return r.length && typeof r[0] === "object" && !Array.isArray(r[0]) && !("nome" in r[0] || "name" in r[0] || "materia" in r[0] || "disciplina" in r[0]) ? r.flatMap(listaDeMaterias) : r.filter(x => x && typeof x === "object");
  if (r && typeof r === "object") { if (Array.isArray(r.materias)) return r.materias; for (const v of Object.values(r)) { const l = listaDeMaterias(v); if (l.length) return l; } }
  return [];
}
function blobBase64(blob) { return new Promise((ok, falha) => { const f = new FileReader(); f.onload = () => ok(String(f.result).split(",")[1]); f.onerror = falha; f.readAsDataURL(blob); }); }
const conteudoPlano = al => al && plano()["cont:" + al.chave];

// ---------- conteúdo programático ----------
// tópicos vêm como {t, r}; planos antigos tinham só o texto (incidência média)
function normTopicos(l) {
  return (l || []).map(x => typeof x === "string" ? { t: x, r: 2 } : x && { t: String(x.t || x.topico || x.nome || "").trim(), r: Math.min(3, Math.max(1, Math.round(+x.r || 2))) })
    .filter(x => x && x.t).slice(0, 60);
}
// matéria sem tópicos (incluída à mão): vira partes genéricas, conforme o peso
function topicosDe(m) {
  const t = normTopicos(m.topicos);
  return t.length ? t : Array.from({ length: Math.max(2, m.peso * 2) }, (_, k) => ({ t: `${m.nome} — parte ${k + 1}`, r: 2 }));
}

// ---------- métodos (escolhidos pelo tempo disponível) ----------
// share = fatia das horas para [teoria, revisão e questões, reta final]
const METODOS = {
  completo: { nome: "Estudo completo", desc: "todo o conteúdo programático, com um bloco extra de aprofundamento e questões nos tópicos mais cobrados", share: [.6, .25, .15] },
  revisao: { nome: "Revisão completa", desc: "todo o conteúdo programático, um bloco por tópico", share: [.55, .28, .17] },
  acelerada: { nome: "Revisão completa acelerada", desc: "todo o conteúdo programático, dois tópicos por bloco", share: [.55, .27, .18] },
  intensivo: { nome: "Reta final intensiva", desc: "só os tópicos de maior incidência, agrupados; os de menor incidência ficam de fora", share: [.6, .25, .15] }
};
const descMetodo = r => r.metodo !== "intensivo" ? METODOS[r.metodo].desc
  : `${r.rMin >= 3 ? "só os tópicos de alta incidência" : "tópicos de média e alta incidência"}, ${r.porBloco === 3 ? "três" : "dois"} por bloco; os de menor incidência ficam de fora`;
const ritmoDe = hDia => hDia >= 6 ? "Full time" : hDia >= 3 ? "Meio período" : "Tempo parcial";

// unidades (blocos de 1 h) da fase de teoria, por matéria, para cada método
function unidadesTeoria(ms, cobertos, metodo, rMin, porBloco) {
  return ms.map((m, mi) => {
    const pend = topicosDe(m).map((x, ti) => ({ ...x, ti })).filter(x => !cobertos.has(`${mi}.${x.ti}`) && x.r >= rMin);
    const u = [];
    if (metodo === "completo") pend.forEach(x => { u.push({ m: mi, t: [x.ti], a: m.tipo === "peca" ? "P" : "T" }); if (x.r === 3) u.push({ m: mi, t: [x.ti], a: m.tipo === "peca" ? "P" : "Q" }); });
    else for (let k = 0; k < pend.length; k += porBloco) u.push({ m: mi, t: pend.slice(k, k + porBloco).map(x => x.ti), a: m.tipo === "peca" ? "P" : "T" });
    return u;
  });
}
// espalha as unidades das matérias (cada uma no seu ritmo), sem repetir a mesma matéria em seguida
function intercalar(listas) {
  const fila = listas.map(l => l.slice()), tot = fila.reduce((a, l) => a + l.length, 0), out = [], cred = fila.map(() => 0);
  while (out.length < tot) {
    let b = -1;
    fila.forEach((l, i) => { if (!l.length) return; cred[i] += l.length; if (b < 0 || cred[i] > cred[b]) b = i; });
    if (out.length && fila[b] && out[out.length - 1].m === fila[b][0].m) { const alt = fila.findIndex((l, i) => i !== b && l.length); if (alt >= 0 && fila.filter(l => l.length).length > 1) b = alt; }
    cred[b] -= tot; out.push(fila[b].shift());
  }
  return out;
}
// horários (em minutos) de um dia
function minutosDoDia(d) { return periodosHoje(d).reduce((a, [x, y]) => a + (y - x), 0); }
function horariosDoDia(d) { const s = []; periodosHoje(d).forEach(([a, b]) => { for (let t = a; t + 60 <= b; t += 60) s.push(t); }); return s; }
function addDias(iso, n) { const d = parseData(iso); d.setDate(d.getDate() + n); return hojeISOde(d); }

// ---------- roteiro ----------
function gerarRoteiro(al, cont, cobertos, inicio) {
  const ms = cont.materias, prova = al.f.data, vesp = addDias(prova, -1);
  // minutos de estudo de cada dia (pelos horários do perfil), de hoje até a antevéspera; na véspera, só um bloco leve
  // (os horários servem só para medir quanto tempo há em cada dia: o estudo começa quando o usuário aperta "Iniciar")
  const caps = []; let dias = 0, capV = 0;
  for (let d = inicio; d < prova; d = addDias(d, 1)) {
    const min = minutosDoDia(parseData(d)); if (min) dias++;
    if (d === vesp) { capV = min; continue; }
    if (min) caps.push({ d, min });
  }
  const M = caps.reduce((a, c) => a + c.min, 0), H = Math.round(M / 60);
  // escolhe o método: o mais completo cuja teoria caiba na fatia de teoria das horas disponíveis
  const totalPend = ms.reduce((a, m, mi) => a + topicosDe(m).filter((x, ti) => !cobertos.has(`${mi}.${ti}`)).length, 0);
  // (do mais completo ao mais enxuto: mais tópicos por bloco antes de deixar tópicos de fora)
  const tentativas = [["completo", 1, 1], ["revisao", 1, 1], ["acelerada", 1, 2], ["intensivo", 2, 2], ["intensivo", 2, 3], ["intensivo", 3, 2], ["intensivo", 3, 3]];
  let met = null, unid = null, rMinE = 1, pbE = 1;
  for (const [id, rMin, pb] of tentativas) {
    const u = unidadesTeoria(ms, cobertos, id, rMin, pb), need = u.reduce((a, l) => a + l.length, 0);
    met = id; unid = u; rMinE = rMin; pbE = pb;
    if (need <= Math.floor(H * METODOS[id].share[0])) break;
  }
  // ainda não coube (pouquíssimo tempo): corta proporcionalmente ao peso de cada matéria, ficando com os mais cobrados
  const cap1 = Math.floor(H * METODOS[met].share[0]);
  let need = unid.reduce((a, l) => a + l.length, 0);
  if (need > cap1) {
    const pesoTot = ms.reduce((a, m, i) => a + (unid[i].length ? m.peso : 0), 0) || 1;
    unid = unid.map((l, i) => l.slice(0, Math.max(l.length ? 1 : 0, Math.floor(cap1 * ms[i].peso / pesoTot))));
    need = unid.reduce((a, l) => a + l.length, 0);
  }
  const fase1 = intercalar(unid).slice(0, Math.min(need, H)).map(b => ({ ...b, f: 1 }));
  const incluidos = new Set(fase1.flatMap(b => b.t.map(t => `${b.m}.${t}`)));
  const fora = totalPend - incluidos.size;
  // o resto das horas: revisão e questões, depois reta final (na proporção do método)
  const resto = H - fase1.length, sh = METODOS[met].share, nFinal = Math.round(resto * sh[2] / (sh[1] + sh[2])), nRev = resto - nFinal;
  const seq = sequenciaCiclo(ms), rodar = (n, f) => {
    const out = [], cont2 = ms.map(() => 0);
    for (let k = 0; k < n; k++) {
      const mi = seq[k % seq.length], m = ms[mi], c = cont2[mi]++, tops = topicosDe(m).map((x, ti) => ({ ...x, ti })).sort((a, b) => b.r - a.r || a.ti - b.ti);
      const ops = m.tipo === "peca" ? (f === 2 ? ["P2"] : ["P3"]) : f === 2 ? { obj: ["Q", "R"], esc: ["D", "R"], misto: ["Q", "D", "R"] }[al.modo] : { obj: ["S", "E"], esc: ["D3", "E"], misto: ["S", "D3", "E"] }[al.modo];
      out.push({ m: mi, t: tops.length ? [tops[c % tops.length].ti] : [], a: ops[(c + mi) % ops.length], f });   // (c + mi): atividades se alternam também dentro do dia
    }
    return out;
  };
  // duração de cada bloco: proporcional ao "peso" da atividade (mais tópicos ou simulado = mais tempo),
  // escalada para que a soma de todos os blocos dê exatamente o tempo disponível até a prova
  const lista = [...fase1, ...rodar(nRev, 2), ...rodar(nFinal, 3)];
  const peso = b => ["S", "D3", "P3"].includes(b.a) ? 1.5 : ["T", "P", "Q"].includes(b.a) ? 1 + .25 * Math.max(0, b.t.length - 1) : 1;
  const W = lista.reduce((a, b) => a + peso(b), 0) || 1, k = M / W;
  lista.forEach(b => b.dur = Math.min(180, Math.max(25, Math.round(peso(b) * k / 5) * 5)));
  // distribui pelos dias: cada bloco vai para o dia em que "cai" o meio dele na linha do tempo (encaixe por minutos acumulados)
  const soma = lista.reduce((a, b) => a + b.dur, 0) || 1, esc_ = M / soma; let pos = 0, di = 0, acum = caps[0] ? caps[0].min : 0;
  const blocos = lista.map(b => {
    const meio = (pos + b.dur / 2) * esc_; pos += b.dur;
    while (di < caps.length - 1 && meio > acum) { di++; acum += caps[di].min; }
    return { ...b, d: caps[di] ? caps[di].d : inicio };
  });
  // ajuste fino: em cada dia, os blocos esticam/encolhem para somar exatamente o tempo daquele dia
  caps.forEach(c => { const bs = blocos.filter(b => b.d === c.d), t = bs.reduce((a, b) => a + b.dur, 0); if (t) bs.forEach(b => b.dur = Math.min(180, Math.max(25, Math.round(b.dur * c.min / t / 5) * 5))); });
  if (capV) blocos.push({ m: -1, t: [], a: "L", f: 4, d: vesp, dur: Math.min(60, capV) });
  const totalTopicos = ms.reduce((a, m) => a + topicosDe(m).length, 0);
  return { criado: hojeISO(), inicio, prova, metodo: met, rMin: rMinE, porBloco: pbE, horas: H, minutos: M, dias, hDia: dias ? Math.round(H / dias * 10) / 10 : 0,
    totalTopicos, jaCobertos: cobertos.size, planejados: incluidos.size, fora, blocos, feitos: [] };
}
// sequência de um ciclo de revisão: cada matéria aparece "peso" vezes, espalhadas
function sequenciaCiclo(ms) {
  const atual = ms.map(() => 0), tot = ms.reduce((a, m) => a + m.peso, 0), seq = [];
  for (let k = 0; k < tot; k++) { ms.forEach((m, i) => atual[i] += m.peso); const b = atual.indexOf(Math.max(...atual)); atual[b] -= tot; seq.push(b); }
  for (let k = 1; k < seq.length; k++) if (seq[k] === seq[k - 1]) { const j = seq.findIndex((x, n) => n > k && x !== seq[k]); if (j > 0) [seq[k], seq[j]] = [seq[j], seq[k]]; }
  return seq;
}
const roteiroDe = al => al && plano()["rot:" + al.chave];
const cobertosDe = al => new Set(plano()["cob:" + al.chave] || []);
// (re)faz o roteiro a partir de hoje com o que ainda falta; guarda um aviso quando é replanejamento
function refazerRoteiro(al, motivo) {
  const cont = conteudoPlano(al); if (!cont || !cont.materias.length) return null;
  const antigo = roteiroDe(al), novo = gerarRoteiro(al, cont, cobertosDe(al), hojeISO());
  novo.verif = hojeISO();
  if (antigo && motivo === "atraso") novo.aviso = { dia: hojeISO(), de: antigo.metodo, para: novo.metodo, fora: novo.fora, atrasados: atrasadosDe(antigo).length };
  if (antigo && motivo === "mudou") novo.aviso = { dia: hojeISO(), de: antigo.metodo, para: novo.metodo, fora: novo.fora, mudou: true };
  novo.minFeitos = antigo ? (antigo.minFeitos != null ? antigo.minFeitos : (antigo.horasFeitas || 0) * 60) : 0;
  const p = plano(); p["rot:" + al.chave] = novo;
  Object.keys(p).forEach(k => { if (k.startsWith("dia:") || k.startsWith("pos:")) delete p[k]; });   // restos da versão antiga do plano
  gravarEst("plano", p);
  return novo;
}
// replaneja todos os planos (ex.: depois de mudar os horários no perfil)
function refazerTodosRoteiros() {
  const p = plano();
  (typeof itens !== "undefined" ? itens : []).forEach(x => { const al = alvoPlano(x.id); if (al && p["cont:" + al.chave]) refazerRoteiro(al, "mudou"); });
}
const atrasadosDe = r => r.blocos.map((b, i) => ({ ...b, i })).filter(b => b.d < hojeISO() && b.f !== 4 && !r.feitos.includes(b.i));
// a cada dia novo: se ficou para trás mais que um dia de estudo, refaz o roteiro a partir de hoje
function conferirRoteiro(al) {
  let r = roteiroDe(al);
  if (!r) return conteudoPlano(al) ? refazerRoteiro(al, "novo") : null;
  if (r.prova !== al.f.data) return refazerRoteiro(al, "mudou");   // a data da prova mudou
  if (r.verif === hojeISO()) return r;
  const atr = atrasadosDe(r).reduce((a, b) => a + (b.dur || 60), 0), porDia = Math.max(120, minutosDoDia(hoje()));   // em minutos
  if (atr >= porDia) return refazerRoteiro(al, "atraso");
  r.verif = hojeISO(); if (r.aviso && r.aviso.dia !== hojeISO()) delete r.aviso; gravarPlano("rot:" + al.chave, r);
  return r;
}
function marcarBlocoRoteiro(al, i, feito, minutos) {
  const r = roteiroDe(al); if (!r || !r.blocos[i]) return;
  const b = r.blocos[i], cob = new Set(plano()["cob:" + al.chave] || []);
  r.feitos = r.feitos.filter(x => x !== i); if (feito) r.feitos.push(i);
  if (minutos == null) minutos = b.dur || 60;
  r.minFeitos = Math.max(0, (r.minFeitos != null ? r.minFeitos : (r.horasFeitas || 0) * 60) + (feito ? minutos : -(r.minReal && r.minReal[i] || minutos)));
  r.minReal = r.minReal || {}; if (feito) r.minReal[i] = minutos; else delete r.minReal[i];
  if (b.f === 1) b.t.forEach(t => feito ? cob.add(`${b.m}.${t}`) : cob.delete(`${b.m}.${t}`));   // tópico estudado na teoria = coberto
  gravarPlano("rot:" + al.chave, r); gravarPlano("cob:" + al.chave, [...cob]);
}
// o que cada código de atividade significa e qual função do app abre
const ATIV = {
  T: { txt: "Teoria + lei seca", area: "lei" }, Q: { txt: "Aprofundar + questões", area: "info" }, P: { txt: "Peça: estrutura e redação", area: "pecas" },
  R: { txt: "Revisão: lei seca e julgados", area: "lei" }, D: { txt: "Questão discursiva", area: "info" }, P2: { txt: "Redigir 1 peça e corrigir pelo espelho", area: "pecas" },
  S: { txt: "Simulado da banca", area: "provas" }, D3: { txt: "Discursiva cronometrada", area: "provas" }, E: { txt: "Revisão dos erros e artigos difíceis", area: "lei" },
  P3: { txt: "Peça completa no tempo de prova", area: "pecas" }, L: { txt: "Revisão leve: só o que marcou como difícil", area: "lei" }
};
const NOME_FASE = { 1: "Teoria do conteúdo", 2: "Revisão e questões", 3: "Reta final", 4: "Véspera" };
function blocoParaTela(ms, b, i, r) {
  const m = b.m >= 0 ? ms[b.m] : { nome: "Revisão leve", lei: "" }, tops = b.m >= 0 ? topicosDe(m) : [];
  return { i, m, ...ATIV[b.a], f: b.f, dur: b.dur || 60, d: b.d, feito: r.feitos.includes(i), real: r.minReal && r.minReal[i], topicos: b.t.map(t => tops[t] && tops[t].t).filter(Boolean) };
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
// refaz os blocos de hoje (de todos os planos) — depois de mudar horários ou matérias
function apagarDiaDeHoje() { refazerTodosRoteiros(); }   // (nome antigo) horários mudaram: refaz os roteiros a partir de hoje
const hojeISOde = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hhmm = m => `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}`;
function horariosHoje() { const s = []; periodosHoje().forEach(([a, b]) => { for (let t = a; t + 60 <= b; t += 60) s.push(t); }); return s; }

// ---------- telas ----------
function dadosPlano(cid) {
  const al = alvoPlano(cid); if (!al) return { al };
  const cont = conteudoPlano(al); if (!cont || !cont.materias.length) return { al, cont };
  const r = conferirRoteiro(al); if (!r) return { al, cont };
  const ms = cont.materias, hojeD = hojeISO();
  const blocos = r.blocos.map((b, i) => ({ b, i })).filter(x => x.b.d === hojeD).map(x => blocoParaTela(ms, x.b, x.i, r));
  const fase = al.dias <= 0 ? 0 : (blocos[0] || r.blocos.find(b => b.d >= hojeD) || {}).f || 3;
  return { al, cont, ms, r, blocos, fase, atrasados: atrasadosDe(r) };
}
function rotuloDiasPlano(ds) {
  const p = ds.map(x => x.split("-")), mesmoMes = p.every(z => z[1] === p[0][1]);
  const itens = p.map((z, k) => mesmoMes && k < p.length - 1 ? z[2] : `${z[2]}/${z[1]}`);
  return itens.length > 1 ? itens.slice(0, -1).join(", ") + " e " + itens[itens.length - 1] : itens[0];
}
const dm = iso => iso ? iso.split("-").reverse().slice(0, 2).join("/") : "";
function cabecalhoPlano(D) {
  const al = D.al, d = al.dias, r = D.r;
  return `<div class="pl-alvo"><span class="pl-dias"><b>${d}</b> ${d === 1 ? "dia" : "dias"}</span><div><b>${esc(al.titulo)}</b><span class="note">${rotuloDiasPlano(al.datas)} · ${al.x.cargo ? esc(al.x.cargo) : "próxima prova deste concurso"}</span>
    ${r ? `<span class="pl-met"><b>${esc(METODOS[r.metodo].nome)}</b> · ${esc(ritmoDe(r.hDia))}${D.fase ? ` · agora: ${NOME_FASE[D.fase]}` : ""}</span>` : ""}</div></div>`;
}
function avisoRoteiro(r) {
  const a = r.aviso; if (!a || a.dia !== hojeISO()) return "";
  const mud = a.de !== a.para ? ` O método passou de <b>${esc(METODOS[a.de].nome)}</b> para <b>${esc(METODOS[a.para].nome)}</b>.` : "";
  return `<div class="pl-aviso">🔄 ${a.mudou ? "Roteiro refeito com as mudanças." : `Roteiro refeito a partir de hoje: ${a.atrasados} bloco(s) tinham ficado para trás.`}${mud}${a.fora ? ` ${a.fora} tópico(s) de menor incidência ficaram de fora.` : ""}</div>`;
}
function htmlBlocosHoje(D) {
  if (D.al.dias <= 0) return `<p class="pl-msg">Hoje é dia de prova. Boa prova! 🍀</p>`;
  const r = D.r, feitos = D.blocos.filter(b => b.feito).length;
  const prog = lerEst("prog", {}), revisar = (typeof julgados !== "undefined" && Array.isArray(julgados) ? julgados : []).filter(j => prog[j.id] && prog[j.id].prox <= hojeISO()).length;
  const prox = r.blocos.map((b, i) => ({ b, i })).find(x => x.b.d > hojeISO() && !r.feitos.includes(x.i));
  return `${avisoRoteiro(r)}${D.atrasados.length ? `<div class="pl-aviso atraso">⏳ ${D.atrasados.length} bloco(s) de dias anteriores ainda não foram feitos. Se passar de um dia de estudo, o roteiro é refeito sozinho amanhã — ou <button type="button" class="linkbt" data-plrefazer="1">refazer agora</button>.</div>` : ""}
    ${D.blocos.length ? `<p class="note pl-cont">Cota de hoje: <b>${durTxt(D.blocos.reduce((a, b) => a + b.dur, 0))}</b> em ${D.blocos.length} bloco(s) · ${feitos} feito(s)${D.fase === 4 ? " · véspera: estude pouco e descanse" : ""}. Cada bloco começa quando você apertar ▶ e termina sozinho.</p>
    <ul class="pl-lista">${D.blocos.map(b => htmlItemBloco(D.al, b)).join("")}
      ${revisar ? `<li class="pl-extra"><span class="pl-dur">+</span><div class="pl-txt"><b>Revisão espaçada</b><span>${revisar} julgado(s) para revisar hoje (10–15 min)</span></div><button type="button" class="mini" data-plabrir="revisar">Abrir ›</button></li>` : ""}</ul>`
    : `<p class="note">Hoje não há tempo de estudo no seu perfil (ajuste em ☰ › Editar perfil). Se quiser estudar mesmo assim, puxe um bloco.</p>`}
    ${prox && feitos === D.blocos.length ? `<div class="actions" style="justify-content:flex-start"><button type="button" class="mini" data-pladiantar="${prox.i}">+ Estudar mais um bloco (${esc(blocoParaTela(D.ms, prox.b, prox.i, r).m.nome)}, ${durTxt(prox.b.dur || 60)})</button></div>` : ""}`;
}
// um item da lista de hoje: ▶ Iniciar, ⏱ rodando ou ✓ feito
function htmlItemBloco(al, b) {
  const T = timerAtual(), rodando = T && T.chave === al.chave && T.i === b.i, outro = T && !rodando;
  const acao = b.feito ? `<span class="pl-feito">✓ ${durTxt(b.real || b.dur)}</span><button type="button" class="linkbt pl-desfaz" data-plfeito="${b.i}" data-valor="0" title="Desmarcar">desfazer</button>`
    : rodando ? `<span class="pl-rodando" data-tmrest="1">⏱ ${relogio(restanteMs(T))}</span>`
    : `<button type="button" class="pl-iniciar" data-pliniciar="${b.i}"${outro ? " disabled title=\"Termine o bloco em andamento primeiro\"" : ""}>▶ Iniciar</button>`;
  return `<li class="${b.feito ? "ok" : ""}${rodando ? " ativo" : ""}"><span class="pl-dur">${durTxt(b.dur)}</span>
    <div class="pl-txt"><b>${esc(b.m.nome)}</b><span>${esc(b.txt)}${b.topicos.length ? ` — <i>${esc(b.topicos.join(" · "))}</i>` : ""}</span>
      ${!b.feito && !rodando ? `<button type="button" class="linkbt pl-manual" data-plfeito="${b.i}" data-valor="1">já fiz este bloco</button>` : ""}</div>
    <div class="pl-acoes">${acao}<button type="button" class="mini" data-plabrir="${b.i}">Abrir ›</button></div></li>`;
}
const durTxt = m => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}` : `${m} min`;
function htmlSemPlano(D) {
  if (!D.al) return `<p class="note">Este concurso não tem prova com data marcada. Cadastre a data para montar o plano.</p>`;
  if (planoUi.lendo[D.al.chave]) return `${cabecalhoPlano(D)}<p class="note">⏳ A IA está lendo o edital e listando todo o conteúdo programático… (até 3 minutos)</p>`;
  return `${cabecalhoPlano(D)}${planoUi.erro[D.al.chave] ? `<p class="lei-msg">${esc(planoUi.erro[D.al.chave])}</p>` : ""}
    <p class="note">A IA lê o conteúdo programático do ${D.al.x.edital_arquivo ? "edital anexado a este concurso" : "cargo (este concurso não tem edital anexado)"}; o app escolhe o método pelo tempo que você tem e monta o roteiro até a prova.</p>
    <div class="actions" style="justify-content:flex-start"><button type="button" class="primary" data-plmontar="1">Montar o plano</button></div>`;
}
// botão embaixo do card de cada concurso em andamento: "Montar" → (montando…) → "Acessar plano de estudos"
function botaoPlanoHTML(x) {
  const al = alvoPlano(x.id); if (!al) return "";
  if (planoUi.lendo[al.chave]) return `<div class="pl-cardbt"><button type="button" class="pl-bt montando" disabled><span class="pl-gira"></span>Montando o plano de estudos…</button><span class="note">a IA está lendo o edital (até 3 min)</span></div>`;
  const cont = conteudoPlano(al);
  if (cont && cont.materias && cont.materias.length) {
    let info = "";
    try { const D = dadosPlano(x.id); if (D.r) { const f = D.blocos.filter(b => b.feito).length; info = `${METODOS[D.r.metodo].nome} · ${D.blocos.length ? `hoje: ${f} de ${D.blocos.length} bloco(s)` : "hoje sem blocos"}`; } } catch (e) { console.warn(e); }
    return `<div class="pl-cardbt"><button type="button" class="pl-bt pronto" data-placessar="${esc(x.id)}">🗓️ Acessar plano de estudos</button>${info ? `<span class="note">${esc(info)}</span>` : ""}</div>`;
  }
  const erro = planoUi.erro[al.chave];
  return `<div class="pl-cardbt"><button type="button" class="pl-bt" data-plmontarcid="${esc(x.id)}">✨ ${erro ? "Tentar montar de novo" : "Montar plano de estudos"}</button>${erro ? `<span class="note pl-erro">${esc(erro)}</span>` : ""}</div>`;
}
// janela do plano, com as abas
function htmlPlanoModal(aba) {
  const D = dadosPlano();
  const abas = `<div class="est-abas">${[["plano-hoje", "Hoje"], ["plano-ciclo", "Roteiro"], ["plano-ajustes", "Ajustes"]].map(([k, n]) => `<button type="button" class="${aba === k ? "on" : ""}" data-estaba="${k}">${n}</button>`).join("")}</div>`;
  let corpo = "";
  if (aba === "plano-ajustes") corpo = htmlAjustesPlano(D);
  else if (!D.r) corpo = htmlSemPlano(D);
  else if (aba === "plano-ciclo") corpo = cabecalhoPlano(D) + htmlRoteiro(D);
  else corpo = cabecalhoPlano(D) + htmlBlocosHoje(D);
  return `<div class="dlg-head"><div style="flex:1;min-width:0"><h2>Plano de estudos${D.al ? " · " + esc(siglaOuNome(D.al.x)) : ""}</h2><p class="sub">Todo o conteúdo programático, no método que cabe no seu tempo até a prova</p></div><button type="button" class="close" data-close aria-label="Fechar">×</button></div>${abas}<div class="est-corpo">${corpo}</div>`;
}
function htmlRoteiro(D) {
  const r = D.r, M = METODOS[r.metodo], ms = D.ms, cob = cobertosDe(D.al), hojeD = hojeISO();
  // fases: período e horas
  const fases = [1, 2, 3, 4].map(f => { const bs = r.blocos.filter(b => b.f === f); return bs.length ? { f, ini: bs[0].d, fim: bs[bs.length - 1].d, h: Math.round(bs.reduce((a, b) => a + (b.dur || 60), 0) / 60) } : null; }).filter(Boolean);
  const planejado = new Map(); r.blocos.forEach(b => { if (b.f === 1) b.t.forEach(t => { const k = `${b.m}.${t}`; if (!planejado.has(k)) planejado.set(k, b.d); }); });
  const cobertura = Math.round((cob.size + [...planejado.keys()].filter(k => !cob.has(k)).length) / Math.max(1, r.totalTopicos) * 100);
  return `${avisoRoteiro(r)}<div class="pl-metodo"><div><span class="pl-et">Método</span><b>${esc(M.nome)}</b><span>${esc(descMetodo(r))}</span></div>
      <div><span class="pl-et">Ritmo</span><b>${esc(ritmoDe(r.hDia))}</b><span>${r.horas} h de estudo em ${r.dias} dia(s) · média de ${String(r.hDia).replace(".", ",")} h/dia</span></div>
      <div><span class="pl-et">Cobertura do edital</span><b>${cobertura}% dos tópicos</b><span>${r.totalTopicos} tópicos no edital${cob.size ? ` · ${cob.size} já estudados` : ""}${r.fora ? ` · ${r.fora} de menor incidência fora do roteiro` : ""}</span></div></div>
    <h4 class="pl-h">Linha do tempo até a prova</h4>
    <ol class="pl-tempo">${fases.map(x => `<li class="${x.fim < hojeD ? "ok" : x.ini <= hojeD ? "agora" : ""}"><b>${NOME_FASE[x.f]}</b><span>${dm(x.ini)}${x.fim !== x.ini ? " a " + dm(x.fim) : ""} · ${x.h} h</span></li>`).join("")}<li class="prova"><b>Prova</b><span>${rotuloDiasPlano(D.al.datas)}</span></li></ol>
    <p class="note">${durTxt(Math.round(r.minFeitos != null ? r.minFeitos : (r.horasFeitas || 0) * 60))} de estudo registradas no cronômetro · ${D.atrasados.length ? `${D.atrasados.length} bloco(s) atrasado(s)` : "em dia"}</p>
    <h4 class="pl-h">Conteúdo programático</h4>
    <div class="pl-mats">${ms.map((m, mi) => {
      const tops = topicosDe(m), feitos = tops.filter((x, ti) => cob.has(`${mi}.${ti}`)).length;
      return `<div class="pl-mat"><div class="pl-mat-topo"><b>${esc(m.nome)}</b><span class="note">peso ${m.peso} · ${feitos} de ${tops.length} tópicos estudados</span></div>
        <div class="pl-barra"><span style="width:${Math.round(feitos / Math.max(1, tops.length) * 100)}%"></span></div>
        <details><summary>ver os tópicos</summary><ol class="pl-tops">${tops.map((x, ti) => { const k = `${mi}.${ti}`, st = cob.has(k) ? "ok" : planejado.has(k) ? "plan" : "fora";
          return `<li class="${st}"><span>${esc(x.t)}</span><small>${"●".repeat(x.r)}${st === "ok" ? " · estudado" : st === "plan" ? " · " + dm(planejado.get(k)) : " · fora do roteiro"}</small></li>`; }).join("")}</ol></details></div>`;
    }).join("")}</div>
    <p class="note">● incidência em prova (●●● alta). Tópicos fora do roteiro voltam se sobrar tempo: adiante blocos ou aumente seus horários.</p>`;
}
function htmlAjustesPlano(D) {
  const ms = D.cont ? D.cont.materias : [];
  return `<div class="pl-horas"><div><b>Seus horários de estudo</b><span class="note">${resumoHorarios()}</span></div><button type="button" class="mini" data-abrirperfil="horarios">Editar no meu perfil</button></div>
    ${D.al ? `<h4 class="pl-h">Matérias de ${esc(D.al.titulo)}</h4>
    ${ms.length ? `<p class="note">O peso (1 a 5) define quanto tempo a matéria ganha na revisão e na reta final. Ao mudar, o roteiro é refeito a partir de hoje.</p>
      <div class="pl-mats">${ms.map((m, i) => `<div class="pl-mat pl-edit"><b>${esc(m.nome)}</b><span class="note">${topicosDe(m).length} tópicos</span><select data-plpeso="${i}">${[1, 2, 3, 4, 5].map(n => `<option${n === m.peso ? " selected" : ""}>${n}</option>`).join("")}</select><button type="button" class="mini" data-pltirar="${i}" title="Tirar do plano">×</button></div>`).join("")}</div>` : `<p class="note">Ainda sem matérias.</p>`}
    <div class="sim-grid" style="margin-top:10px"><label>Incluir matéria<input id="plNovaMat" placeholder="ex.: Direito Eleitoral"></label><label>Tipo<select id="plNovaTipo"><option value="teoria">teoria</option><option value="peca">peça / sentença</option></select></label></div>
    <div class="actions" style="justify-content:flex-start"><button type="button" class="mini" data-plincluir="1">Incluir</button>${ms.length ? `<button type="button" class="mini" data-plrefazer="1">Refazer o roteiro a partir de hoje</button>` : ""}<button type="button" class="mini" data-plmontar="1">${ms.length ? "Ler o edital de novo (recomeça o plano)" : "Montar pelo edital"}</button></div>` : ""}`;
}

// ---------- abrir a função certa do app ----------
function abrirBlocoPlano(idx) {
  if (idx === "revisar") { abrirAreaEstudo("info"); setTimeout(() => desenharEstudo("revisar"), 0); return; }
  const D = dadosPlano(), b = D.blocos && D.blocos.find(x => String(x.i) === String(idx)); if (!b) return;
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
function abrirPlano(aba, cid) {
  if (cid !== undefined) planoUi.cid = cid;
  estudoAba = ""; desenharEstudo(aba || "plano-hoje");
  const d = $("dlgEstudo"); if (!d.open) d.showModal(); $("estudoConteudo").scrollTop = 0;
}
function redesenharPlano() {
  try {
    const d = $("dlgEstudo");
    if (d && d.open && String(estudoAba).startsWith("plano")) desenharEstudo(estudoAba);
    if (typeof renderEstudoPagina === "function") renderEstudoPagina();
    if (typeof render === "function" && $("proximos")) render();   // botões dos cards dos concursos
  } catch (e) { console.warn("plano: redesenho", e); }
}

document.addEventListener("click", e => {
  const c = e.target.closest("[data-plmontarcid],[data-placessar]");
  if (c) { if (c.dataset.placessar) abrirPlano("plano-hoje", c.dataset.placessar); else { const a = alvoPlano(c.dataset.plmontarcid); if (a) lerConteudoDoEdital(a); } return; }
  const t = e.target.closest("[data-plfeito],[data-pliniciar],[data-plabrir],[data-plmontar],[data-plaba],[data-pladiantar],[data-plrefazer],[data-pltirar],[data-plincluir]"); if (!t) return;
  const d = t.dataset, al = alvoPlano();
  if (d.plfeito !== undefined) { if (al) marcarBlocoRoteiro(al, +d.plfeito, d.valor === "1"); redesenharPlano(); return; }
  if (d.pliniciar !== undefined && al) { iniciarTimer(al, +d.pliniciar); return; }
  if (d.plabrir !== undefined) { abrirBlocoPlano(d.plabrir); return; }
  if (d.plaba) { abrirPlano(d.plaba); return; }
  if (d.plmontar && al) { lerConteudoDoEdital(al); return; }
  if (d.plrefazer && al) { refazerRoteiro(al, "mudou"); toast("Roteiro refeito a partir de hoje."); redesenharPlano(); return; }
  if (d.pladiantar !== undefined && al) {   // traz o próximo bloco para hoje
    const r = roteiroDe(al), b = r && r.blocos[+d.pladiantar]; if (!b) return;
    b.d = hojeISO(); gravarPlano("rot:" + al.chave, r); redesenharPlano(); return;
  }
  if ((d.pltirar !== undefined || d.plincluir) && al) {
    const c = conteudoPlano(al) || { quando: hojeISO(), materias: [] };
    if (d.pltirar !== undefined) {
      const k = +d.pltirar; c.materias.splice(k, 1);
      // os tópicos já estudados das outras matérias continuam marcados (os índices andam uma casa)
      gravarPlano("cob:" + al.chave, [...cobertosDe(al)].map(x => x.split(".").map(Number)).filter(([m]) => m !== k).map(([m, t]) => `${m > k ? m - 1 : m}.${t}`));
    } else { const nome = ($("plNovaMat") || {}).value.trim(); if (!nome) { toast("Escreva o nome da matéria."); return; } c.materias.push({ nome, peso: 3, tipo: $("plNovaTipo").value, lei: MATERIAS_LEI.find(m => semAcentoEst(nome).includes(semAcentoEst(m))) || "", topicos: [] }); }
    gravarPlano("cont:" + al.chave, c); refazerRoteiro(al, "mudou"); redesenharPlano(); return;
  }
});
document.addEventListener("change", e => {
  const s = e.target.closest("[data-plpeso]"); if (!s) return;
  const al = alvoPlano(), c = al && conteudoPlano(al); if (!c) return;
  c.materias[+s.dataset.plpeso].peso = +s.value; gravarPlano("cont:" + al.chave, c); refazerRoteiro(al, "mudou"); redesenharPlano();
});

// ---------- cronômetro do bloco ----------
// Um estudo por vez (em qualquer concurso). Guarda o início na nuvem: o mesmo cronômetro aparece no PC e no celular.
// A conta é feita pela hora de término, então o tempo fica certo mesmo com a tela bloqueada; o alerta toca com o app aberto.
const timerAtual = () => plano().timer || null;
function decorridoMs(T) { return Date.now() - T.ini - (T.pausado || 0) - (T.pausadoEm ? Date.now() - T.pausadoEm : 0); }
const restanteMs = T => Math.max(0, T.dur * 60000 - decorridoMs(T));
const relogio = ms => { const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(ss).padStart(2, "0"); };
let somCtx = null;
function iniciarTimer(al, i) {
  if (timerAtual()) { toast("Termine (ou cancele) o bloco em andamento primeiro."); return; }
  const r = roteiroDe(al), b = r && r.blocos[i]; if (!b) return;
  try { somCtx = somCtx || new (window.AudioContext || window.webkitAudioContext)(); somCtx.resume(); } catch (e) {}   // libera o som do alerta
  try { if (window.Notification && Notification.permission === "default") Notification.requestPermission(); } catch (e) {}
  const m = b.m >= 0 ? conteudoPlano(al).materias[b.m].nome : "Revisão leve";
  gravarPlano("timer", { chave: al.chave, cid: al.x.id, i, ini: Date.now(), dur: b.dur || 60, pausado: 0, pausadoEm: null, nome: m, ativ: ATIV[b.a].txt });
  redesenharPlano(); desenharBarraTimer();
}
function pausarTimer() {
  const T = timerAtual(); if (!T) return;
  if (T.pausadoEm) { T.pausado = (T.pausado || 0) + Date.now() - T.pausadoEm; T.pausadoEm = null; } else T.pausadoEm = Date.now();
  gravarPlano("timer", T); desenharBarraTimer();
}
function encerrarTimer(concluir, sozinho) {
  const T = timerAtual(); if (!T) return;
  const min = Math.max(1, Math.round(Math.min(decorridoMs(T), T.dur * 60000) / 60000));
  gravarPlano("timer", undefined);
  const al = alvoPlano(T.cid);
  if (concluir && al && al.chave === T.chave) marcarBlocoRoteiro(al, T.i, true, min);
  else if (!concluir && al && al.chave === T.chave) { const r = roteiroDe(al); if (r) { r.minFeitos = (r.minFeitos || 0) + min; gravarPlano("rot:" + al.chave, r); } }   // o tempo estudado conta, o bloco volta para a fila
  if (sozinho) alertarFim(T); else toast(concluir ? `Bloco concluído: ${durTxt(min)} de ${T.nome}.` : "Bloco cancelado: ele volta para a fila.");
  desenharBarraTimer(); redesenharPlano();
}
function alertarFim(T) {
  toast(`⏰ Tempo! Bloco de ${T.nome} concluído. Quando quiser, inicie o próximo.`);
  try { navigator.vibrate && navigator.vibrate([300, 150, 300, 150, 500]); } catch (e) {}
  try {   // três bipes curtos
    const c = somCtx || new (window.AudioContext || window.webkitAudioContext)();
    [0, .35, .7].forEach(t => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; o.connect(g); g.connect(c.destination); g.gain.setValueAtTime(.25, c.currentTime + t); g.gain.exponentialRampToValueAtTime(.001, c.currentTime + t + .3); o.start(c.currentTime + t); o.stop(c.currentTime + t + .32); });
  } catch (e) {}
  try { if (window.Notification && Notification.permission === "granted") new Notification("Meus Concursos — bloco concluído", { body: `${T.nome}: ${T.ativ}. Inicie o próximo quando quiser.`, icon: "icon-192.png" }); } catch (e) {}
}
// barra fixa embaixo da tela enquanto um bloco está rodando (fica por cima das janelas abertas)
function desenharBarraTimer() {
  let el = document.getElementById("barraTimer"); const T = timerAtual();
  if (!T) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("div"); el.id = "barraTimer"; el.className = "tm-barra"; document.body.appendChild(el); }
  const pct = Math.min(100, decorridoMs(T) / (T.dur * 600));
  el.innerHTML = `<div class="tm-prog" style="width:${pct}%"></div><div class="tm-info"><b>${esc(T.nome)}</b><span>${esc(T.ativ)}</span></div>
    <span class="tm-relogio${T.pausadoEm ? " pausado" : ""}">${T.pausadoEm ? "⏸ " : ""}${relogio(restanteMs(T))}</span>
    <div class="tm-bts"><button type="button" data-tm="pausa">${T.pausadoEm ? "▶ Retomar" : "⏸ Pausar"}</button><button type="button" data-tm="concluir">✓ Concluir</button><button type="button" data-tm="cancelar">✕</button></div>`;
  mostrarBarraPorCima(el);
}
// com uma janela aberta, o resto da tela fica "travado": a barra passa para dentro da janela de cima, para continuar clicável
function mostrarBarraPorCima(el) {
  const abertos = [...document.querySelectorAll("dialog[open]")], alvo = abertos.length ? abertos[abertos.length - 1] : document.body;
  if (el.parentNode !== alvo) alvo.appendChild(el);
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-tm]"); if (!b) return;
  if (b.dataset.tm === "pausa") pausarTimer();
  else if (b.dataset.tm === "concluir") encerrarTimer(true, false);
  else if (confirm("Cancelar este bloco? O tempo já estudado fica registrado e o bloco volta para a fila.")) encerrarTimer(false, false);
});
// a cada segundo: atualiza o relógio e encerra sozinho quando o tempo acaba
setInterval(() => {
  const T = timerAtual(), el = document.getElementById("barraTimer");
  if (!T) { if (el) desenharBarraTimer(); return; }
  if (!T.pausadoEm && restanteMs(T) <= 0) { encerrarTimer(true, true); return; }
  if (!el) { desenharBarraTimer(); return; }
  const rel = el.querySelector(".tm-relogio"); if (rel) rel.textContent = (T.pausadoEm ? "⏸ " : "") + relogio(restanteMs(T));
  const pr = el.querySelector(".tm-prog"); if (pr) pr.style.width = Math.min(100, decorridoMs(T) / (T.dur * 600)) + "%";
  document.querySelectorAll("[data-tmrest]").forEach(x => x.textContent = "⏱ " + relogio(restanteMs(T)));
  mostrarBarraPorCima(el);
}, 1000);
