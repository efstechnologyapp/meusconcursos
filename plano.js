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

// horários (em minutos) de um dia
// "hoje só tenho X": o usuário troca o tempo de hoje sem mexer no perfil (vale só para o dia)
function minutosDoDia(d) { const h = plano().hojeMin; if (h && h.d === hojeISOde(d)) return h.min; return minutosDoPerfil(d); }
function minutosDoPerfil(d) { return periodosHoje(d).reduce((a, [x, y]) => a + (y - x), 0); }
function horariosDoDia(d) { const s = []; periodosHoje(d).forEach(([a, b]) => { for (let t = a; t + 60 <= b; t += 60) s.push(t); }); return s; }
function addDias(iso, n) { const d = parseData(iso); d.setDate(d.getDate() + n); return hojeISOde(d); }

// ---------- roteiro ----------
// Como o roteiro é montado (dia a dia, de hoje até a véspera):
// • a RETA FINAL começa numa data fixa (≈16% finais do tempo), guardada no roteiro: atrasos apertam a teoria, nunca os simulados;
// • o tempo de cada matéria segue o PESO dela (não a quantidade de itens do edital); matérias com muitos itens agrupam tópicos
//   no mesmo bloco e, no limite, deixam de fora os de menor incidência;
// • numa prova escrita com peça/sentença, a peça leva pelo menos 30% do tempo, com 1 peça completa por semana desde o início;
//   peças e discursivas "no tempo de prova" duram o tempo real da prova (cadastro da fase; padrão 4 h) e vão para dias que comportam;
// • no último dia de estudo de cada semana há a REVISÃO DA SEMANA (o que foi estudado nos últimos dias) e, na fase de revisão,
//   todos os tópicos estudados voltam pelo menos uma vez;
// • em dias longos (5 h ou mais) os blocos são de ~2 h da mesma matéria: menos troca de assunto no dia.
const FRACAO_RETA = 0.16;
function duracaoProva(al, tipo) {
  const re = tipo === "peca" ? /senten|pe[cç]a|parecer|prátic|pratic/i : tipo === "disc" ? /discurs|dissert|escrit/i : /objetiv/i;
  const f = al.fases.find(z => re.test(z.nome || "") || (z.escritas || []).some(e => re.test(e.tipo || "")));
  const d = f && +f.duracao;
  return d >= 60 ? Math.min(300, d) : tipo === "obj" ? 300 : 240;
}
const semanaDe = iso => { const [y, m, d] = iso.split("-").map(Number); return Math.floor((Date.UTC(y, m - 1, d) / 864e5 + 3) / 7); };
const arred5 = x => Math.round(x / 5) * 5;
function gerarRoteiro(al, cont, cobertos, inicio, usadoHoje, marco3, metAnt, recentes) {
  const ms = cont.materias, prova = al.f.data, vesp = addDias(prova, -1), modo = al.modo;
  // minutos de estudo de cada dia (pelos horários do perfil), de hoje até a antevéspera; na véspera, só um bloco leve
  // (os horários servem só para medir quanto tempo há em cada dia: o estudo começa quando o usuário aperta "Iniciar")
  const caps = []; let dias = 0, capV = 0;
  for (let d = inicio; d < prova; d = addDias(d, 1)) {
    const min = Math.max(0, minutosDoDia(parseData(d)) - (d === inicio ? usadoHoje || 0 : 0)); if (min) dias++;   // hoje: desconta o que já foi estudado
    if (d === vesp) { capV = min; continue; }
    if (min >= 25) caps.push({ d, min });
  }
  const soma = l => l.reduce((a, c) => a + c.min, 0), M = soma(caps), H = Math.round(M / 60);
  if (!marco3) { let ac = 0; marco3 = prova; for (const c of caps) { ac += c.min; if (ac > M * (1 - FRACAO_RETA)) { marco3 = c.d; break; } } }
  const c12 = caps.filter(c => c.d < marco3), c3 = caps.filter(c => c.d >= marco3), M12 = soma(c12);
  const maxCap = l => l.length ? Math.max(...l.map(c => c.min)) : 0;
  const idxP = ms.map((m, i) => i).filter(i => ms[i].tipo === "peca"), idxT = ms.map((m, i) => i).filter(i => ms[i].tipo !== "peca");
  const pesoDe = l => l.reduce((a, i) => a + ms[i].peso, 0), pesoP = pesoDe(idxP), pesoT = pesoDe(idxT) || 1;
  const sP = idxP.length ? (idxT.length ? Math.min(.45, Math.max(modo === "obj" ? 0 : .3, pesoP / (pesoP + pesoT))) : 1) : 0;
  const semanas = c12.length ? semanaDe(c12[c12.length - 1].d) - semanaDe(c12[0].d) + 1 : 0;
  const pend = ms.map((m, mi) => topicosDe(m).map((x, ti) => ({ ...x, ti })).filter(x => !cobertos.has(`${mi}.${x.ti}`)));
  const totalPend = pend.reduce((a, l) => a + l.length, 0);
  const aprof = modo === "obj" ? "Q" : "D", opsRev = { obj: ["Q", "R"], esc: ["D", "R"], misto: ["Q", "D", "R"] }[modo];
  // ---- teoria + revisão (até a reta final): unidades de ~1 h por matéria, na proporção do peso
  const U = Math.max(0, Math.floor((M12 * (1 - sP) - (idxT.length ? semanas * 60 : 0)) / 60)), UT = Math.floor(U * .68);
  const pendT = idxT.reduce((a, i) => a + pend[i].length, 0), razao = pendT / Math.max(1, UT);
  let met = razao <= .7 ? "completo" : razao <= 1 ? "revisao" : razao <= 2 ? "acelerada" : "intensivo";
  // perto do limite entre dois métodos, mantém o anterior (evita trocar de nome a cada replanejamento)
  if (metAnt && metAnt !== met && [.7, 1, 2].some(l => Math.abs(razao - l) < .15)) met = metAnt;
  let rMinG = 1, pbG = 1, usadosT = 0;
  const filas = ms.map(() => []);
  idxT.forEach(mi => {
    const m = ms[mi], b = Math.max(pend[mi].length ? 1 : 0, Math.round(UT * m.peso / pesoT));
    let tops = pend[mi], pb = 1, rMin = 1;
    if (tops.length > b) {   // mais tópicos que tempo: até 3 por bloco; se ainda não couber, ficam os de maior incidência
      pb = Math.min(3, Math.ceil(tops.length / b));
      tops = tops.slice().sort((x, y) => y.r - x.r || x.ti - y.ti).slice(0, b * pb);
      if (tops.length < pend[mi].length) rMin = Math.min(...tops.map(x => x.r));
      tops.sort((x, y) => x.ti - y.ti);
    }
    rMinG = Math.max(rMinG, rMin); pbG = Math.max(pbG, pb);
    // tempo sobrando na teoria: até 2 blocos a mais de aprofundamento nos tópicos mais cobrados
    let extra = b - Math.ceil(tops.length / pb); const ext = {};
    if (pb === 1) for (let vez = 0; vez < 2 && extra > 0; vez++) for (const rr of [3, 2]) for (const x of tops) { if (extra > 0 && x.r === rr) { ext[x.ti] = (ext[x.ti] || 0) + 1; extra--; } }
    for (let k = 0; k < tops.length; k += pb) {
      const ch = tops.slice(k, k + pb).map(x => x.ti);
      const e = pb === 1 ? ext[ch[0]] || 0 : 0;   // teoria + aprofundamento do mesmo tópico num bloco só (1 a 3 h)
      filas[mi].push(e ? { m: mi, t: ch, a: "T", a2: aprof, f: 1, n: 1 + e } : { m: mi, t: ch, a: "T", f: 1, n: 1 });
    }
    usadosT += filas[mi].reduce((a, u) => a + u.n, 0);
  });
  // revisão: cada matéria, pelo peso; todos os tópicos estudados voltam pelo menos uma vez (em ordem), os mais cobrados mais vezes
  const UR = Math.max(0, U - usadosT);
  idxT.forEach(mi => {
    const n = Math.round(UR * ms[mi].peso / pesoT), inc = new Set(filas[mi].flatMap(u => u.t));
    const tops = topicosDe(ms[mi]).map((x, ti) => ({ ...x, ti })).filter(x => cobertos.has(`${mi}.${x.ti}`) || inc.has(x.ti));
    if (!tops.length || !n) return;
    const grupos = [];
    if (n >= tops.length) { tops.forEach(x => grupos.push([x.ti])); const fortes = tops.slice().sort((x, y) => y.r - x.r || x.ti - y.ti); for (let k = 0; grupos.length < n; k++) grupos.push([fortes[k % fortes.length].ti]); }
    else { const tam = Math.ceil(tops.length / n); for (let k = 0; k < tops.length; k += tam) grupos.push(tops.slice(k, k + tam).map(x => x.ti)); }
    grupos.forEach((t, c) => filas[mi].push({ m: mi, t, a: opsRev[(c + mi) % opsRev.length], f: 2 }));
  });
  // peças: 1 completa por semana (desde a 1ª), o resto em blocos de estrutura/trechos, revezando as peças (ex.: cível, criminal)
  const LP = Math.max(60, Math.min(duracaoProva(al, "peca"), maxCap(c12))), filaP = [];
  const porPeca = idxP.map(mi => {
    const BP = M12 * sP * ms[mi].peso / (pesoP || 1), nP2 = BP >= LP ? Math.max(1, Math.min(semanas, Math.floor(BP * .6 / LP))) : 0;
    const nP = Math.max(0, Math.floor((BP - nP2 * LP) / 60)), tops = pend[mi].length ? pend[mi] : topicosDe(ms[mi]).map((x, ti) => ({ ...x, ti }));
    const fortes = tops.slice().sort((x, y) => y.r - x.r || x.ti - y.ti), q = [], tot = nP + nP2; let k2 = 0, k1 = 0;
    for (let k = 0; k < tot; k++) {
      if (k2 < nP2 && k >= Math.round(k2 * tot / nP2)) { q.push({ m: mi, t: [], a: "P2", f: 2, longo: LP }); k2++; }
      else { const x = k1 < tops.length ? tops[k1] : fortes[(k1 - tops.length) % fortes.length]; q.push({ m: mi, t: x ? [x.ti] : [], a: "P", f: k1 < tops.length ? 1 : 2 }); k1++; }
    }
    return q;
  });
  for (let k = 0; porPeca.some(q => q.length); k++) { const q = porPeca[k % porPeca.length]; if (q.length) filaP.push(q.shift()); }
  // ---- encaixe dia a dia (fase de teoria e revisão)
  const blocos = [], incluidos = new Set(), credT = ms.map(() => 0), contExtra = ms.map(() => 0), seq = sequenciaCiclo(ms.map((m, i) => idxT.includes(i) ? m : { ...m, peso: 0 }));   // (peças fora deste ciclo)
  let credP = 0, kSeq = 0, semTop = [...(recentes || [])], semMin = 0;   // (recentes: tópicos já estudados nesta semana, antes de replanejar)
  const ajustar = (dia, cap) => {   // os blocos (menos os de tempo de prova) esticam/encolhem para somar o tempo do dia
    const fixo = dia.filter(b => b.longo).reduce((a, b) => a + b.dur, 0), livres = dia.filter(b => !b.longo), t = livres.reduce((a, b) => a + b.dur, 0);
    if (t) livres.forEach(b => b.dur = Math.min(180, Math.max(25, arred5(b.dur * Math.max(0, cap - fixo) / t))));
  };
  const extraRev = () => {   // acabou a fila: mais revisão, na proporção do peso
    if (!idxT.length) return null;
    for (let g = 0; g < seq.length; g++) { const mi = seq[kSeq++ % seq.length]; if (!idxT.includes(mi)) continue;
      const tops = topicosDe(ms[mi]).map((x, ti) => ({ ...x, ti })).sort((x, y) => y.r - x.r || x.ti - y.ti), c = contExtra[mi]++;
      return { m: mi, t: tops.length ? [tops[c % tops.length].ti] : [], a: opsRev[(c + mi) % opsRev.length], f: 2 }; }
    return null;
  };
  c12.forEach((c, ci) => {
    let rem = c.min; const dia = [];
    const fimDaSemana = ci === c12.length - 1 || semanaDe(c12[ci + 1].d) !== semanaDe(c.d);
    semMin += c.min;
    const teoriaPend = idxT.some(mi => filas[mi].some(u => u.f === 1));
    const rs = fimDaSemana && (semTop.length || teoriaPend) ? Math.min(90, Math.max(30, arred5(semMin * .07))) : 0;
    rem -= rs;
    // peça (as completas só em dia que comporta o tempo de prova)
    credP += c.min * sP;
    for (let g = 0; g < 4 && filaP.length && rem >= 40; g++) {
      const cabe = u => u.longo ? Math.min(u.longo, rem) >= Math.min(u.longo, 180) : rem >= 40;   // peça completa: o tempo de prova, ou ao menos 3 h
      let j = filaP.findIndex((u, k) => k < 6 && cabe(u));
      if (j < 0) break; const u = filaP[j], L = u.longo ? Math.min(u.longo, rem) : 60;
      if (credP < L * .6) break;
      filaP.splice(j, 1); credP -= L; rem -= L;
      const fP = u.a === "P" && u.f === 1 ? 1 : teoriaPend ? 1 : 2;
      dia.push({ ...u, f: fP, d: c.d, dur: L, longo: u.longo ? L : 0 }); if (u.f === 1) u.t.forEach(t => { incluidos.add(`${u.m}.${t}`); semTop.push(`${u.m}.${t}`); });
    }
    // matérias de teoria: revezando pelo tamanho do que falta em cada uma; em dia longo, blocos de ~2 h da mesma matéria
    let ant = -9;
    while (rem >= 40) {
      const vivas = idxT.filter(mi => filas[mi].length);
      let u;
      if (vivas.length) {
        let b = -1; const tot = vivas.reduce((a, mi) => a + filas[mi].length, 0);
        vivas.forEach(mi => { credT[mi] += filas[mi].length; if (b < 0 || credT[mi] > credT[b]) b = mi; });
        if (b === ant && vivas.length > 1) b = vivas.filter(x => x !== b).sort((x, y) => credT[y] - credT[x])[0];
        credT[b] -= tot; u = { ...filas[b].shift() }; ant = b;
        u.dur = 60 * (u.n || 1);
        if (c.min >= 300 && rem >= 110 && u.dur === 60 && filas[b].length && filas[b][0].f === u.f && (filas[b][0].n || 1) === 1) {
          const u2 = filas[b].shift(); u.t = [...u.t, ...u2.t.filter(x => !u.t.includes(x))]; if (u2.a !== u.a) u.a2 = u2.a; u.dur = 120;
        }
      } else { u = extraRev(); if (!u) { const q = filaP.find(x => !x.longo); if (!q) break; filaP.splice(filaP.indexOf(q), 1); u = { ...q }; } }
      u.dur = u.dur || 60; u.d = c.d; rem -= u.dur; dia.push(u);
      if (u.f === 1) u.t.forEach(t => { incluidos.add(`${u.m}.${t}`); if (u.a === "T" || u.a === "P") semTop.push(`${u.m}.${t}`); });
    }
    if (rs && !semTop.length) { const u = extraRev(); if (u) dia.push({ ...u, d: c.d, dur: rs }); }
    ajustar(dia, c.min - (semTop.length ? rs : 0));
    if (rs && semTop.length) dia.push({ m: -4, t: [], rs: [...new Set(semTop)], a: "RS", f: 1, d: c.d, dur: rs, longo: rs });
    if (fimDaSemana) { semTop = []; semMin = 0; }
    blocos.push(...dia);
  });
  // ---- reta final: simulados no tempo de prova (peças, discursivas, objetiva) nos dias que comportam + revisão dos erros e questões
  const longos = [...idxP.map(mi => ({ m: mi, a: "P3", L: duracaoProva(al, "peca") }))];
  if (modo !== "obj" && idxT.length) longos.push({ m: -2, a: "D3", L: duracaoProva(al, "disc") });
  if (modo !== "esc" && idxT.length) longos.push({ m: -3, a: "S", L: duracaoProva(al, "obj") });
  const ops3 = { obj: ["Q", "E"], esc: ["D", "E"], misto: ["Q", "D", "E"] }[modo], cont3 = ms.map(() => 0), seq3 = sequenciaCiclo(ms);
  // o rodízio dos simulados continua de onde estaria (pela data), mesmo depois de replanejar
  let credL = 0, kL = Math.floor(parseData(inicio).getTime() / 864e5 / 2), k3 = 0;
  c3.forEach(c => {
    let rem = c.min; const dia = [];
    credL += c.min * (longos.length ? .5 : 0);
    for (let g = 0; g < longos.length; g++) {
      // simulado no tempo de prova; em dia mais curto (ao menos 3 h), no tempo que houver
      const X = longos[kL % longos.length], L = Math.min(X.L, rem); if (L < Math.min(X.L, 180) || credL < L * .6) break;
      dia.push({ m: X.m, t: [], a: X.a, f: 3, d: c.d, dur: L, longo: L }); rem -= L; credL -= L; kL++;
      if (rem < 120) break;
    }
    let ant = -9;
    while (rem >= 40) {
      let mi = seq3[k3++ % seq3.length]; if (mi === ant && ms.length > 1) mi = seq3[k3++ % seq3.length];
      const m = ms[mi], cc = cont3[mi]++, tops = topicosDe(m).map((x, ti) => ({ ...x, ti })).sort((x, y) => y.r - x.r || x.ti - y.ti);
      dia.push({ m: mi, t: tops.length ? [tops[cc % tops.length].ti] : [], a: m.tipo === "peca" ? "P" : ops3[(cc + mi) % ops3.length], f: 3, d: c.d, dur: 60 }); rem -= 60; ant = mi;
    }
    ajustar(dia, c.min); blocos.push(...dia);
  });
  if (capV) blocos.push({ m: -1, t: [], a: "L", f: 4, d: vesp, dur: Math.min(60, capV) });
  if (al.datas.length > 1) blocos.push({ m: -1, t: [], a: "L2", f: 4, d: prova, dur: 45 });   // prova em dois dias: revisão leve à noite
  blocos.forEach(b => { delete b.longo; delete b.n; });
  const totalTopicos = ms.reduce((a, m) => a + topicosDe(m).length, 0);
  return { criado: hojeISO(), inicio, prova, marco3, metodo: met, rMin: rMinG, porBloco: pbG, horas: H, minutos: M, dias, hDia: dias ? Math.round(H / dias * 10) / 10 : 0,
    totalTopicos, jaCobertos: cobertos.size, planejados: incluidos.size, fora: Math.max(0, totalPend - incluidos.size), blocos, feitos: [] };
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
  const antigo = roteiroDe(al);
  // blocos já concluídos hoje continuam no roteiro novo (e o tempo deles sai da cota de hoje)
  const feitosHoje = antigo ? antigo.blocos.map((b, i) => ({ b, i })).filter(x => x.b.d === hojeISO() && antigo.feitos.includes(x.i)) : [];
  const usado = feitosHoje.reduce((a, x) => a + ((antigo.minReal && antigo.minReal[x.i]) || x.b.dur || 60), 0);
  // a data de início da reta final fica fixa (só muda com plano novo ou prova em outra data)
  const marco = antigo && motivo !== "novo" && antigo.prova === al.f.data ? antigo.marco3 : null;
  const recentes = antigo ? antigo.blocos.filter((b, i) => antigo.feitos.includes(i) && b.f === 1 && (b.a === "T" || b.a === "P") && semanaDe(b.d) === semanaDe(hojeISO())).flatMap(b => b.t.map(t => `${b.m}.${t}`)) : [];
  const novo = gerarRoteiro(al, cont, cobertosDe(al), hojeISO(), usado, marco, antigo && antigo.metodo, recentes);
  if (feitosHoje.length) {
    const minReal = {}; Object.entries(novo.minReal || {}).forEach(([k, v]) => minReal[+k + feitosHoje.length] = v);
    feitosHoje.forEach((x, k) => { if (antigo.minReal && antigo.minReal[x.i]) minReal[k] = antigo.minReal[x.i]; });
    novo.blocos = [...feitosHoje.map(x => x.b), ...novo.blocos]; novo.feitos = feitosHoje.map((x, k) => k); novo.minReal = minReal;
  }
  // bloco com o cronômetro rodando: entra no roteiro novo logo depois dos feitos, e o cronômetro passa a apontar para ele
  const T = plano().timer;
  if (T && antigo && T.chave === al.chave && antigo.blocos[T.i]) {
    const pos = feitosHoje.length; novo.blocos.splice(pos, 0, { ...antigo.blocos[T.i], d: hojeISO() });
    const mr = {}; Object.entries(novo.minReal || {}).forEach(([k, v]) => mr[+k >= pos ? +k + 1 : +k] = v); novo.minReal = mr;
    novo.feitos = novo.feitos.map(i => i >= pos ? i + 1 : i); gravarPlano("timer", { ...T, i: pos });
  }
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
  if (typeof agendarAgenda === "function") agendarAgenda();   // lembretes de estudo no Google Agenda acompanham os horários
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
  // atraso pequeno fica para a revisão da semana (ou o usuário traz para hoje); só refaz se passar de um dia inteiro de estudo
  const atr = atrasadosDe(r).reduce((a, b) => a + (b.dur || 60), 0), porDia = Math.max(180, minutosDoDia(hoje()));   // em minutos
  if (atr > porDia) return refazerRoteiro(al, "atraso");
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
  R: { txt: "Revisão: lei seca e julgados", area: "lei" }, D: { txt: "Questão discursiva", area: "info" }, P2: { txt: "Redigir 1 peça completa e corrigir pelo espelho", area: "pecas" },
  S: { txt: "Simulado da banca no tempo de prova", area: "provas" }, D3: { txt: "Discursivas no tempo de prova", area: "provas" }, E: { txt: "Revisão dos erros e artigos difíceis", area: "lei" },
  P3: { txt: "Peça completa no tempo de prova", area: "pecas" }, L: { txt: "Revisão leve: só o que marcou como difícil", area: "lei" },
  RS: { txt: "Reveja o que estudou nos últimos dias (e recupere o que ficou para trás)", area: "revisar" }, L2: { txt: "À noite, depois da prova: revisão leve para a prova de amanhã", area: "pecas" }
};
const NOME_ESPECIAL = { "-1": "Revisão leve", "-2": "Simulado de discursivas", "-3": "Simulado objetivo", "-4": "Revisão da semana" };
const NOME_FASE = { 1: "Teoria do conteúdo", 2: "Revisão e questões", 3: "Reta final", 4: "Véspera" };
function blocoParaTela(ms, b, i, r) {
  const m = b.m >= 0 ? ms[b.m] : { nome: NOME_ESPECIAL[b.m] || "Revisão leve", lei: "" }, tops = b.m >= 0 ? topicosDe(m) : [];
  let topicos = b.t.map(t => tops[t] && tops[t].t).filter(Boolean);
  if (b.rs) { const n = b.rs.map(k => { const [mi, ti] = k.split(".").map(Number), mm = ms[mi], x = mm && topicosDe(mm)[ti]; return x && x.t; }).filter(Boolean); topicos = n.length > 4 ? [...n.slice(0, 4), `e mais ${n.length - 4}`] : n; }
  const at = ATIV[b.a] || ATIV.R, txt = b.a2 && ATIV[b.a2] ? `${at.txt}, depois ${ATIV[b.a2].txt.charAt(0).toLowerCase() + ATIV[b.a2].txt.slice(1)}` : at.txt;
  return { i, m, ...at, txt, f: b.f, dur: b.dur || 60, d: b.d, feito: r.feitos.includes(i), real: r.minReal && r.minReal[i], topicos };
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
  if (D.al.dias <= 0) return `<p class="pl-msg">Hoje é dia de prova. Boa prova! 🍀</p>${htmlChecklistProva(D.al, false)}${D.blocos.length ? `<ul class="pl-lista">${D.blocos.map(b => htmlItemBloco(D.al, b)).join("")}</ul>` : ""}`;
  const r = D.r, feitos = D.blocos.filter(b => b.feito).length;
  const prog = lerEst("prog", {}), revisar = (typeof julgados !== "undefined" && Array.isArray(julgados) ? julgados : []).filter(j => prog[j.id] && prog[j.id].prox <= hojeISO()).length;
  const prox = r.blocos.map((b, i) => ({ b, i })).find(x => x.b.d > hojeISO() && !r.feitos.includes(x.i));
  return `${avisoRoteiro(r)}${D.atrasados.length ? `<div class="pl-aviso atraso">⏳ ${D.atrasados.length} bloco(s) de dias anteriores ficaram para trás. <button type="button" class="linkbt" data-plpuxar="1">Trazer para hoje</button>${D.blocos.some(b => b.area === "revisar") ? " (hoje é dia de revisão da semana: bom dia para recuperar)" : ""} — se o atraso passar de um dia inteiro de estudo, o roteiro é refeito sozinho, ou <button type="button" class="linkbt" data-plrefazer="1">refazer agora</button>.</div>` : ""}
    ${htmlChecklistProva(D.al, D.al.dias > 3)}
    ${htmlTempoDeHoje()}
    ${D.blocos.length ? `<p class="note pl-cont">Meta de hoje: <b>${durTxt(D.blocos.reduce((a, b) => a + b.dur, 0))}</b> em ${D.blocos.length} bloco(s) · ${feitos} feito(s)${D.fase === 4 ? " · véspera: estude pouco e descanse" : ""}. Cada bloco começa quando você apertar ▶ e termina sozinho.</p>
    <ul class="pl-lista">${D.blocos.map(b => htmlItemBloco(D.al, b)).join("")}
      ${revisar ? `<li class="pl-extra"><span class="pl-dur">+</span><div class="pl-txt"><b>Revisão espaçada</b><span>${revisar} julgado(s) para revisar hoje (10–15 min)</span></div><button type="button" class="mini" data-plabrir="revisar">Abrir ›</button></li>` : ""}</ul>`
    : `<p class="note">Hoje não há tempo de estudo marcado. Se quiser estudar mesmo assim, escolha acima quanto tempo você tem hoje.</p>`}
    ${htmlAtalhosPlano(D)}
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
  const al = alvoPlano(x.id);
  if (!al) return andamento(x).ativo ? `<div class="pl-cardbt"><span class="note">🗓️ Para montar o plano de estudos, cadastre a <b>data da prova</b> (abra o concurso › Editar).</span></div>` : "";
  if (planoUi.lendo[al.chave]) return `<div class="pl-cardbt"><button type="button" class="pl-bt montando" disabled><span class="pl-gira"></span>Montando o plano de estudos…</button><span class="note">a IA está lendo o edital (até 3 min)</span></div>`;
  const cont = conteudoPlano(al);
  if (cont && cont.materias && cont.materias.length) {
    let info = "";
    try { const D = dadosPlano(x.id); if (D.r) { const f = D.blocos.filter(b => b.feito).length; info = `${METODOS[D.r.metodo].nome} · ${D.blocos.length ? `hoje: ${f} de ${D.blocos.length} bloco(s)` : "hoje sem blocos"}`; } } catch (e) { console.warn(e); }
    return `<div class="pl-cardbt"><button type="button" class="pl-bt pronto" data-placessar="${esc(x.id)}">🗓️ Acessar plano de estudos</button>${info ? `<span class="note">${esc(info)}</span>` : ""}</div>`;
  }
  const erro = planoUi.erro[al.chave];
  const semEdital = !x.edital_arquivo ? `<span class="note pl-semedital">⚠️ Sem edital anexado: a IA vai adivinhar o conteúdo pelo cargo. Para um plano fiel, junte o PDF do edital (abra o concurso › Editar).</span>` : "";
  return `<div class="pl-cardbt"><button type="button" class="pl-bt" data-plmontarcid="${esc(x.id)}">✨ ${erro ? "Tentar montar de novo" : "Montar plano de estudos"}</button>${erro ? `<span class="note pl-erro">${esc(erro)}</span>` : semEdital}</div>`;
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
  return `<div class="dlg-head"><div style="flex:1;min-width:0"><h2>Plano de estudos${D.al ? " · " + esc(siglaOuNome(D.al.x)) : ""}</h2><p class="sub">O plano diz <b>o que</b> estudar a cada dia; o botão <b>Abrir ›</b> leva à ferramenta certa do Estudar</p></div><button type="button" class="close" data-close aria-label="Fechar">×</button></div>${abas}<div class="est-corpo">${corpo}</div>`;
}
function htmlRoteiro(D) {
  const r = D.r, M = METODOS[r.metodo], ms = D.ms, cob = cobertosDe(D.al), hojeD = hojeISO();
  // fases: período e horas
  const porDia = {}; r.blocos.forEach(b => { const x = porDia[b.d] = porDia[b.d] || {}; x[b.f] = (x[b.f] || 0) + (b.dur || 60); });
  const faseDia = Object.entries(porDia).map(([d, x]) => [d, +Object.entries(x).sort((a, b) => b[1] - a[1])[0][0], Object.values(x).reduce((a, b) => a + b, 0)]).sort((a, b) => a[0].localeCompare(b[0]));
  const fases = [1, 2, 3, 4].map(f => { const ds = faseDia.filter(x => x[1] === f); return ds.length ? { f, ini: ds[0][0], fim: ds[ds.length - 1][0], h: Math.round(ds.reduce((a, x) => a + x[2], 0) / 60) } : null; }).filter(Boolean);
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
    <label class="chk pl-lembrete"><input type="checkbox" id="plLembrete"${plano().lembrete ? " checked" : ""}> <span><b>Avisar no celular na hora de estudar</b><small>O app marca seus horários de estudo no seu Google Agenda, com alarme na hora de começar, até a data da prova.</small></span></label>
    ${D.al ? `<h4 class="pl-h">Matérias de ${esc(D.al.titulo)}</h4>
    ${ms.length ? `<p class="note">O peso (1 a 5) define quanto tempo a matéria ganha em todo o plano (teoria, revisão e reta final). Ao mudar, o roteiro é refeito a partir de hoje.</p>
      <div class="pl-mats">${ms.map((m, i) => `<div class="pl-mat pl-edit"><b>${esc(m.nome)}</b><span class="note">${topicosDe(m).length} tópicos</span><select data-plpeso="${i}">${[1, 2, 3, 4, 5].map(n => `<option${n === m.peso ? " selected" : ""}>${n}</option>`).join("")}</select><button type="button" class="mini" data-pltirar="${i}" title="Tirar do plano">×</button></div>`).join("")}</div>` : `<p class="note">Ainda sem matérias.</p>`}
    <div class="sim-grid" style="margin-top:10px"><label>Incluir matéria<input id="plNovaMat" placeholder="ex.: Direito Eleitoral"></label><label>Tipo<select id="plNovaTipo"><option value="teoria">teoria</option><option value="peca">peça / sentença</option></select></label></div>
    <div class="actions" style="justify-content:flex-start"><button type="button" class="mini" data-plincluir="1">Incluir</button>${ms.length ? `<button type="button" class="mini" data-plrefazer="1">Refazer o roteiro a partir de hoje</button>` : ""}<button type="button" class="mini" data-plmontar="1">${ms.length ? "Ler o edital de novo (recomeça o plano)" : "Montar pelo edital"}</button></div>` : ""}`;
}

// ---------- abrir a função certa do app ----------
function abrirBlocoPlano(idx) {
  const bx = idx !== "revisar" && (dadosPlano().blocos || []).find(x => String(x.i) === String(idx));
  if (idx === "revisar" || (bx && bx.area === "revisar")) { abrirAreaEstudo("info"); setTimeout(() => desenharEstudo("revisar"), 0); return; }
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
  const h = e.target.closest("[data-hjcomecar],[data-hjabrir],[data-plchk],[data-platalho]");
  if (h) {
    const k = h.dataset;
    if (k.hjcomecar) { const [cid, i] = k.hjcomecar.split("|"); abrirPlano("plano-hoje", cid); const a = alvoPlano(cid); if (a && !timerAtual()) iniciarTimer(a, +i); return; }
    if (k.hjabrir !== undefined) { if (k.hjabrir) abrirPlano("plano-hoje", k.hjabrir); else abrirPlanoMaisProximo(); return; }
    if (k.platalho === "erros") { abrirAreaEstudo("info"); setTimeout(() => desenharEstudo("erros"), 0); return; }
    if (k.platalho === "simulado") { abrirAreaEstudo("provas"); return; }
    if (k.platalho === "leierros") { abrirAreaEstudo("lei"); setTimeout(() => desenharEstudo("lei-praticar"), 0); return; }
    return;
  }
  const t = e.target.closest("[data-plfeito],[data-pliniciar],[data-plabrir],[data-plmontar],[data-plaba],[data-pladiantar],[data-plrefazer],[data-pltirar],[data-plincluir]"); if (!t) return;
  const d = t.dataset, al = alvoPlano();
  if (d.plfeito !== undefined) { if (al) marcarBlocoRoteiro(al, +d.plfeito, d.valor === "1"); redesenharPlano(); return; }
  if (d.pliniciar !== undefined && al) { iniciarTimer(al, +d.pliniciar); return; }
  if (d.plabrir !== undefined) { abrirBlocoPlano(d.plabrir); return; }
  if (d.plaba) { abrirPlano(d.plaba); return; }
  if (d.plmontar && al) { lerConteudoDoEdital(al); return; }
  if (d.plrefazer && al) { refazerRoteiro(al, "mudou"); toast("Roteiro refeito a partir de hoje."); redesenharPlano(); return; }
  if (d.plpuxar && al) {   // blocos atrasados vêm para hoje
    const r = roteiroDe(al); if (!r) return; atrasadosDe(r).forEach(b => r.blocos[b.i].d = hojeISO());
    r.verif = hojeISO(); gravarPlano("rot:" + al.chave, r); toast("Os blocos atrasados estão na lista de hoje."); redesenharPlano(); return;
  }
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
  if (e.target.matches("[data-plchk]")) {   // checklist da prova (sincronizado)
    const al = alvoPlano(), k = "chk:" + (al && al.chave); if (!al) return;
    const l = new Set(plano()[k] || []); e.target.checked ? l.add(e.target.dataset.plchk) : l.delete(e.target.dataset.plchk);
    gravarPlano(k, [...l]); redesenharPlano(); return;
  }
  if (e.target.matches("[data-plhojemin]")) {
    const v = +e.target.value; gravarPlano("hojeMin", v ? { d: hojeISO(), min: v } : undefined);
    refazerTodosRoteiros(); toast(v ? `Combinado: hoje o plano usa ${durTxt(v)}.` : "Hoje volta a valer o horário do seu perfil."); redesenharPlano(); return;
  }
  if (e.target.id === "plLembrete") {
    gravarPlano("lembrete", e.target.checked || undefined);
    if (e.target.checked && typeof agendaLigada === "function" && !agendaLigada()) {   // liga o Google Agenda junto (pede o acesso agora, no toque)
      try { localStorage.setItem(chaveAgenda(), "1"); } catch (err) {}
      if ($("chkAgenda")) $("chkAgenda").checked = true;
      pedirAcessoAgenda(() => sincronizarAgenda(true));
    } else if (typeof agendaLigada === "function" && agendaLigada()) { if (!tokenAgenda()) pedirAcessoAgenda(() => sincronizarAgenda(true)); else sincronizarAgenda(true); }
    toast(e.target.checked ? "Pronto: seus horários de estudo vão para o Google Agenda, com alarme." : "Lembretes de estudo desligados (somem do Google Agenda).");
    return;
  }
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
  const m = b.m >= 0 ? conteudoPlano(al).materias[b.m].nome : NOME_ESPECIAL[b.m] || "Revisão leve";
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


// ---------- novidades da v105: faixa "Hoje", tempo de hoje, atalhos, checklist da prova ----------
// plano do concurso com a prova mais próxima que já tem plano montado
function concursosComPlano() {
  return (typeof itens !== "undefined" ? itens : []).map(x => ({ x, al: alvoPlano(x.id) })).filter(o => o.al && conteudoPlano(o.al)).sort((a, b) => a.al.f.data.localeCompare(b.al.f.data));
}
function abrirPlanoMaisProximo() {
  const l = concursosComPlano();
  if (l.length) abrirPlano("plano-hoje", l[0].x.id);
  else { if (location.hash) location.hash = ""; toast("Monte o plano no botão abaixo do card do concurso."); }
}
// faixa no alto da tela inicial: o que fazer agora
function htmlFaixaHoje() {
  try {
    const T = timerAtual();
    if (T) return `<div class="hj-faixa ativo"><span class="hj-ic">⏱</span><div class="hj-txt"><b>Estudando agora: ${esc(T.nome)}</b><span>${esc(T.ativ)} · <span data-tmrest="1">⏱ ${relogio(restanteMs(T))}</span></span></div><button type="button" class="primary" data-hjabrir="${esc(T.cid)}">Ver</button></div>`;
    const l = concursosComPlano();
    if (!l.length) return (typeof itens !== "undefined" && itens.some(x => andamento(x).ativo && alvoPlano(x.id)))
      ? `<div class="hj-faixa"><span class="hj-ic">🧭</span><div class="hj-txt"><b>Primeiro passo: monte seu plano de estudos</b><span>Toque em <b>✨ Montar plano de estudos</b>, embaixo do concurso. O app diz o que estudar em cada dia até a prova.</span></div></div>` : "";
    let feitoTudo = null;
    for (const { x } of l) {
      const D = dadosPlano(x.id); if (!D.r) continue;
      const sig = esc(siglaOuNome(x)), dias = D.al.dias, chk = dias <= 3 ? " · confira o checklist da prova" : "";
      if (dias <= 0) return `<div class="hj-faixa"><span class="hj-ic">🍀</span><div class="hj-txt"><b>Hoje é dia de prova: ${sig}</b><span>Boa prova! Confira o checklist antes de sair.</span></div><button type="button" class="primary" data-hjabrir="${esc(x.id)}">Checklist</button></div>`;
      const pend = D.blocos.filter(b => !b.feito), feitos = D.blocos.length - pend.length;
      if (pend.length) {
        const b = pend[0];
        return `<div class="hj-faixa"><span class="hj-ic">📚</span><div class="hj-txt"><b>Hoje: ${esc(b.m.nome)} (${durTxt(b.dur)})${pend.length > 1 ? ` e mais ${pend.length - 1} bloco${pend.length > 2 ? "s" : ""}` : ""}</b><span>${sig} · ${feitos} de ${D.blocos.length} feito(s) · prova em ${dias} dia${dias === 1 ? "" : "s"}${chk}</span></div><button type="button" class="primary" data-hjcomecar="${esc(x.id)}|${b.i}">▶ Começar</button></div>`;
      }
      if (D.blocos.length && !feitoTudo) feitoTudo = { x, D, chk };
    }
    if (feitoTudo) return `<div class="hj-faixa ok"><span class="hj-ic">✅</span><div class="hj-txt"><b>Meta de hoje cumprida!</b><span>${esc(siglaOuNome(feitoTudo.x))} · se quiser, adiante um bloco de amanhã${feitoTudo.chk}</span></div><button type="button" class="mini" data-hjabrir="${esc(feitoTudo.x.id)}">Ver plano</button></div>`;
    return `<div class="hj-faixa"><span class="hj-ic">☕</span><div class="hj-txt"><b>Hoje não há estudo marcado</b><span>Quer estudar mesmo assim? Abra o plano e diga quanto tempo tem hoje.</span></div><button type="button" class="mini" data-hjabrir="">Abrir plano</button></div>`;
  } catch (e) { console.warn("faixa hoje", e); return ""; }
}
// "Hoje tenho:" — muda só o dia de hoje
function htmlTempoDeHoje() {
  const h = plano().hojeMin, atual = h && h.d === hojeISO() ? h.min : 0, normal = minutosDoPerfil(hoje());
  const ops = [30, 60, 90, 120, 180, 240, 300, 360, 480];
  if (atual && !ops.includes(atual)) ops.push(atual);
  return `<div class="pl-hojetempo"><label>Hoje tenho <select data-plhojemin="1"><option value="0"${atual ? "" : " selected"}>o tempo de sempre (${normal ? durTxt(normal) : "sem estudo"})</option>${ops.sort((a, b) => a - b).map(m => `<option value="${m}"${m === atual ? " selected" : ""}>${durTxt(m)}</option>`).join("")}</select></label><span class="note">o plano se ajusta só para hoje</span></div>`;
}
// atalhos da fase de revisão e da reta final
function htmlAtalhosPlano(D) {
  if (!D.r || (D.fase < 2 && D.al.dias > 21)) return "";
  const nErros = (() => { try { const p = lerEst("prog", {}); return Object.values(p).filter(x => x && x.erros && x.caixa <= 1).length; } catch (e) { return 0; } })();
  return `<div class="pl-atalhos"><span class="pl-et">Atalhos ${D.fase >= 3 ? "da reta final" : "de revisão"}</span>
    <button type="button" class="mini" data-platalho="erros">❌ Revisar o que errei${nErros ? ` (${nErros})` : ""}</button>
    <button type="button" class="mini" data-platalho="leierros">⚖️ Treinar lei seca</button>
    <button type="button" class="mini" data-platalho="simulado">⏱ Simulado de prova anterior</button></div>`;
}
// checklist da prova (aparece aberto nos 3 últimos dias; antes, fechado)
function itensChecklist(al) {
  const x = al.x, f = al.f, bl = typeof blocosDeViagem === "function" ? blocosDeViagem(x).find(b => b.fases.includes(al.i)) : null, v = bl ? ((x.viagens || {})[bl.uid] || {}) : {};
  const local = (v.local && typeof resumoLocal === "function" && resumoLocal(v.local).split("\n")[0]) || f.local || (bl && x.fases[bl.raizI] && x.fases[bl.raizI].local) || "";
  const tp = v.transporte || {}, transp = tp.tipo && typeof resumoTransporte === "function" ? resumoTransporte(tp).split("\n")[0] : "";
  const h = v.hospedagem || {}, hosp = h.nome || h.logradouro || h.codigo || h.plataforma ? [h.nome, h.checkin_data && "check-in " + dm(h.checkin_data)].filter(Boolean).join(" · ") || "reservada" : "";
  const cons = x.consulta && x.consulta.fases ? al.fases.map(z => x.consulta.fases[z.uid]).find(c => c && c.permitido === true) : null;
  return [
    ["doc", "Documento oficial com foto (original)", ""],
    ["insc", "Cartão de confirmação / comprovante de inscrição", x.inscricao ? "inscrição nº " + x.inscricao : ""],
    ["caneta", "Caneta de tubo transparente (cor de tinta conforme o edital)", ""],
    ["local", "Local de prova conferido", local || "ainda não cadastrado — veja no site da banca"],
    ["hora", "Horário de chegada", f.portoes ? `portões fecham às ${f.portoes} (Brasília)` : f.horario ? `prova às ${f.horario} (Brasília): chegue 1 h antes` : "confira no cartão de confirmação"],
    ["transp", "Transporte até o local", transp || "ainda não definido"],
    (hosp || tp.tipo === "aviao") && ["hosp", "Hospedagem", hosp || "pendente"],
    cons && ["consulta", "Material de consulta permitido separado", [cons.permitidos, cons.vedados && "vedado: " + cons.vedados].filter(Boolean).join(" · ")],
    ["lanche", "Água e lanche em embalagem transparente", ""],
    ["dormir", "Dormir cedo na véspera", ""]
  ].filter(Boolean);
}
function htmlChecklistProva(al, fechado) {
  const its = itensChecklist(al), ok = new Set(plano()["chk:" + al.chave] || []), n = its.filter(i => ok.has(i[0])).length;
  return `<details class="pl-check"${fechado ? "" : " open"}><summary>✅ Checklist da prova <span class="note">${n} de ${its.length}</span></summary>
    <ul>${its.map(([k, t, d]) => `<li class="${ok.has(k) ? "ok" : ""}"><label><input type="checkbox" data-plchk="${k}"${ok.has(k) ? " checked" : ""}><span><b>${esc(t)}</b>${d ? `<small>${esc(d)}</small>` : ""}</span></label></li>`).join("")}</ul></details>`;
}
