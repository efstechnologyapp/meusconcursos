// Leitura de edital em PDF: extrai o texto no próprio navegador e procura padrões comuns.
// Nada é enviado para a internet; a biblioteca de PDF só é baixada na primeira vez.
const PDFJS_VER = "3.11.174";
const PDFJS_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/pdf.min.js`;
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/pdf.worker.min.js`;

function carregarPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return new Promise((ok, falha) => {
    const s = document.createElement("script");
    s.src = PDFJS_URL;
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; ok(window.pdfjsLib); };
    s.onerror = () => falha(new Error("sem-internet"));
    document.head.appendChild(s);
  });
}

// Remonta as linhas pela posição na página, para que tabelas (cronogramas)
// fiquem com o evento e a data na mesma linha.
async function textoDoPdf(arquivo, maxPaginas = 90) {
  const pdfjs = await carregarPdfJs();
  const pdf = await pdfjs.getDocument({ data: await arquivo.arrayBuffer() }).promise;
  const n = Math.min(pdf.numPages, maxPaginas);
  let texto = "";
  for (let i = 1; i <= n; i++) {
    const pag = await pdf.getPage(i);
    const c = await pag.getTextContent();
    const linhas = [];
    for (const it of c.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = it.transform[5], x = it.transform[4];
      let l = linhas.find(l => Math.abs(l.y - y) < 3);
      if (!l) { l = { y, partes: [] }; linhas.push(l); }
      l.partes.push({ x, s: it.str });
    }
    linhas.sort((a, b) => b.y - a.y);
    texto += linhas.map(l => l.partes.sort((a, b) => a.x - b.x).map(p => p.s).join(" ")).join("\n") + "\n";
  }
  return texto;
}

// ---------- Utilidades de texto ----------
const MESES_PT = { janeiro:1, fevereiro:2, "março":3, marco:3, abril:4, maio:5, junho:6, julho:7, agosto:8, setembro:9, outubro:10, novembro:11, dezembro:12 };
function mesNum(s) { s = s.toLowerCase(); return MESES_PT[s] || MESES_PT[s.replace("ç", "c")] || 0; }
function pad(n) { return String(n).padStart(2, "0"); }
function limpar(s) { return s.replace(/\s+/g, " ").replace(/^[\s,;:–-]+|[\s,;:–-]+$/g, "").trim(); }
function titulo(s) {
  const min = new Set(["de","da","do","das","dos","e","em","a","o"]);
  return s.toLowerCase().split(" ").map((w, i) => (i && min.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
    .replace(/\b(Tre|Trt|Trf|Tj|Mp|Pc|Pm|Pf|Prf|Inss|Ibge|Tse|Stj|Stf|Tcu|Tce|Saeb|Mpmt|Tjsc|Tjpb)\b/g, w => w.toUpperCase());
}

// Datas no formato 06/12/2026 ou "18 de abril de 2027" (ignora números de leis e anos fora do razoável)
function datasNoTrecho(t) {
  const achadas = [];
  const valida = (i, a) => +a >= 2024 && +a <= 2035 && !/(n[º°o.]|lei|decreto|resolu[cç][aã]o|portaria|art\.?)\s*$/i.test(t.slice(Math.max(0, i - 14), i));
  const re1 = /\b(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})\b/g;
  let m;
  while ((m = re1.exec(t))) {
    const [_, d, mo, a] = m;
    if (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31 && valida(m.index, a)) achadas.push({ i: m.index, v: `${a}-${pad(mo)}-${pad(d)}` });
  }
  const re2 = /\b(\d{1,2})\s*(?:º\s*)?(?:e\s+\d{1,2}\s+)?de\s+(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/gi;
  while ((m = re2.exec(t))) {
    if (valida(m.index, m[3])) achadas.push({ i: m.index, v: `${m[3]}-${pad(mesNum(m[2]))}-${pad(m[1])}` });
  }
  return achadas.sort((a, b) => a.i - b.i);
}

function horasNoTrecho(t) {
  const out = [], re = /\b(\d{1,2})\s*(?:h|:)\s*(\d{2})?(?![\d\/])/gi;
  let m;
  while ((m = re.exec(t))) {
    const h = +m[1], mi = m[2] ? +m[2] : 0;
    if (h >= 6 && h <= 22 && mi <= 59) out.push({ i: m.index, v: `${pad(h)}:${pad(mi)}` });
  }
  return out;
}

// ---------- Modelos de fases por cargo (montados a partir dos editais) ----------
// carater: "EC" = eliminatória e classificatória, "E" = eliminatória, "C" = classificatória
const MODELOS = {
  delegado: { rotulo: "Delegado de Polícia", base: "edital PC-BA 2026 (Instituto AOCP)",
    detectar: /delegado de pol[ií]cia/i,
    fases: [
      { nome: "1ª etapa – Provas objetivas", carater: "EC", chave: /provas? objetivas?/i },
      { nome: "2ª etapa – Prova discursiva", carater: "EC", chave: /prova discursiva/i },
      { nome: "3ª etapa – Prova de títulos", carater: "C", chave: /prova de t[ií]tulos/i }
    ]},
  juiz: { rotulo: "Juiz Substituto", base: "edital TJSC 2026 (FGV) e Resolução CNJ 75/2009",
    detectar: /magistratura|juiz substituto/i,
    fases: [
      { nome: "1ª etapa – Prova objetiva seletiva", carater: "EC", chave: /prova objetiva seletiva/i },
      { nome: "2ª etapa – Prova discursiva", carater: "EC", chave: /prova\s+discursiva/i },
      { nome: "2ª etapa – Sentença cível", carater: "EC", chave: /senten[cç]a c[ií]vel/i },
      { nome: "2ª etapa – Sentença criminal", carater: "EC", chave: /senten[cç]a criminal/i },
      { nome: "3ª etapa – Inscrição definitiva (sindicância, exame médico e psicotécnico)", carater: "E", chave: /inscri[cç][aã]o definitiva/i },
      { nome: "4ª etapa – Prova oral", carater: "EC", chave: /prova oral/i },
      { nome: "5ª etapa – Avaliação de títulos", carater: "C", chave: /avalia[cç][aã]o de t[ií]tulos/i }
    ]},
  promotor: { rotulo: "Promotor de Justiça", base: "edital MPMT 2026 (FGV)",
    detectar: /promotor de justi[cç]a/i,
    fases: [
      { nome: "1ª fase – Prova preambular objetiva", carater: "EC", chave: /prova preambular objetiva/i },
      { nome: "2ª fase – Provas discursivas (1º dia)", carater: "EC", chave: /provas discursivas/i },
      { nome: "2ª fase – Provas discursivas (2º dia)", carater: "EC", chave: /provas discursivas/i, segundoDia: true },
      { nome: "3ª fase – Inscrição definitiva", carater: "E", chave: /inscri[cç][aã]o definitiva/i },
      { nome: "4ª fase – Prova oral", carater: "EC", chave: /prova oral/i },
      { nome: "5ª fase – Avaliação de títulos", carater: "C", chave: /avalia[cç][aã]o de t[ií]tulos/i }
    ]},
  analista: { rotulo: "Analista / Técnico Judiciário", base: "edital TJPB 2026 (FGV)",
    detectar: /analista\s*(?:[–-]\s*)?judici[aá]ri[oa]|t[eé]cnico judici[aá]rio/i,
    fases: [
      { nome: "Prova objetiva", carater: "EC", chave: /prova objetiva/i },
      { nome: "Prova discursiva", carater: "EC", chave: /prova discursiva/i }
    ]},
  outro: { rotulo: "Outro", base: "", detectar: null,
    fases: [ { nome: "Prova objetiva", carater: "EC", chave: /provas? objetivas?/i } ]}
};

function detectarTipo(plano) {
  const inicio = plano.slice(0, 5000);
  let melhor = "outro", maior = 0;
  for (const [k, m] of Object.entries(MODELOS)) {
    if (!m.detectar) continue;
    const re = new RegExp(m.detectar.source, "gi");
    const n = (inicio.match(re) || []).length * 5 + (plano.match(re) || []).length;
    if (n > maior) { maior = n; melhor = k; }
  }
  return melhor;
}

// Para cada fase, procura uma data ligada à fase: no corpo do edital
// ("será realizada na data provável de...") ou numa linha do cronograma.
const INTENCAO = /(aplica|realiza|prevista|ser[aá]|ser[aã]o|no dia|data)/i;
const RUIDO = /(gabarito|resultado|recurso|divulga[cç][aã]o|convoca[cç][aã]o|publica[cç][aã]o|pedido|\bvista\b|edital de|inscri[cç][oõ]es|isen[cç][aã]o|parecer|homologa)/i;

const ITEM = String.raw`\s\d{1,2}(?:\.\d{1,2})+\.?\s`;
const CORTE_ESTRITO = new RegExp(String.raw`;|\.\s+(?=[A-ZÀ-Ú])|` + ITEM);
const CORTE_LIVRE = new RegExp(String.raw`\.\s+(?=[A-ZÀ-Ú])|` + ITEM);

function procurarDataDaFase(plano, f, corte) {
  const re = new RegExp("(?:" + f.chave.source + ")", "gi");
  let m;
  while ((m = re.exec(plano))) {
    const fim = m.index + m[0].length;
    const antesFrase = plano.slice(Math.max(0, m.index - 160), m.index).split(corte).pop().split(/\b[a-z]\)\s/).pop();
    const depoisFrase = plano.slice(fim, fim + 600).split(corte)[0];
    const dDepois = datasNoTrecho(depoisFrase), dAntes = datasNoTrecho(antesFrase);
    const antesDaData = dDepois.length ? depoisFrase.slice(0, dDepois[0].i) : depoisFrase.slice(0, 60);
    if (RUIDO.test(antesFrase) || RUIDO.test(antesDaData)) continue;
    if (!INTENCAO.test(antesFrase + " " + depoisFrase)) continue;
    if (dDepois.length) {
      const d = dDepois[0];
      let data = d.v;
      if (f.segundoDia) {
        const dois = depoisFrase.slice(d.i).match(/^(\d{1,2})\s+e\s+(\d{1,2})\s+de\s+(\S+)\s+de\s+(\d{4})/i);
        if (!dois) continue;
        data = `${dois[4]}-${pad(mesNum(dois[3]))}-${pad(dois[2])}`;
        return { data, horario: "" };
      }
      const h = horasNoTrecho(depoisFrase.slice(d.i));
      return { data, horario: (h.length && h[0].i < 260) ? h[0].v : "" };
    }
    if (dAntes.length && !f.segundoDia) {
      const d = dAntes[dAntes.length - 1];
      const h = horasNoTrecho(antesFrase.slice(d.i));
      return { data: d.v, horario: h.length ? h[0].v : "" };
    }
  }
  return null;
}

function datasDasFases(plano, tipo) {
  const modelo = MODELOS[tipo] || MODELOS.outro;
  return modelo.fases.map(f => procurarDataDaFase(plano, f, CORTE_ESTRITO) || procurarDataDaFase(plano, f, CORTE_LIVRE) || {});
}

// ---------- Interpretação geral ----------
const BANCAS = [
  ["Cebraspe", /cebraspe|cespe/i], ["FCC", /funda[cç][aã]o carlos chagas|\bFCC\b/], ["FGV", /funda[cç][aã]o getulio vargas|\bFGV\b/],
  ["Vunesp", /vunesp/i], ["IBFC", /\bIBFC\b/], ["Instituto AOCP", /\bAOCP\b/], ["Cesgranrio", /cesgranrio/i],
  ["IDECAN", /idecan/i], ["Quadrix", /quadrix/i], ["IADES", /\bIADES\b/], ["Consulplan", /consulplan/i],
  ["FUNDATEC", /fundatec/i], ["IBADE", /\bIBADE\b/], ["Instituto Access", /instituto access/i], ["Selecon", /selecon/i],
  ["Comperve", /comperve/i], ["COMVEST", /comvest/i], ["Instituto Verbena", /verbena/i], ["FAFIPA", /fafipa/i],
  ["Avança SP", /avan[cç]a sp/i], ["IGEDUC", /igeduc/i], ["FEPESE", /fepese/i], ["Objetiva", /objetiva concursos/i], ["Legalle", /legalle/i]
];
// Órgãos em ordem de preferência
const ORGAOS = [
  /\bTRIBUNAL (?:REGIONAL|DE JUSTI[ÇC]A|SUPERIOR|DE CONTAS)[^,.;:\n]{3,70}/i,
  /\bMINIST[ÉE]RIO P[ÚU]BLICO[^,.;:\n]{3,60}/i,
  /\bPOL[ÍI]CIA (?:CIVIL|MILITAR|FEDERAL|PENAL|RODOVI[ÁA]RIA)[^,.;:\n]{0,40}/i,
  /\b(?:DEFENSORIA|PROCURADORIA|ADVOCACIA)[^,.;:\n]{3,60}/i,
  /\b(?:PREFEITURA|C[ÂA]MARA|ASSEMBLEIA|UNIVERSIDADE|INSTITUTO FEDERAL|BANCO|CONSELHO|AG[ÊE]NCIA|CORPO DE BOMBEIROS)[^,.;:\n]{3,60}/i
];
const INSTRUCOES_CHAVE = [
  /caneta esferogr[aá]fica/i, /documento (de identidade |oficial )?(original|com foto)/i, /port[oõ]es/i,
  /anteced[eê]ncia m[ií]nima/i, /aparelhos? eletr[oô]nicos?|telefone celular|rel[oó]gio/i, /bon[eé]|chap[eé]u|gorro|[oó]culos escuros/i,
  /cart[aã]o[- ]resposta|folha de respostas/i, /tempo m[ií]nimo de perman[eê]ncia|s[oó] poder[aá] (se )?retirar/i,
  /caderno de quest[oõ]es/i, /\barmas?\b/i
];
const INSTRUCOES_FORA = /divulgad|gabarito|posse|requisitos|inscri[cç][aã]o|isen[cç][aã]o|laudo|recurso|t[ií]tulos|heteroidentifica/i;

function interpretarEdital(textoBruto) {
  const plano = textoBruto.replace(/ /g, " ").replace(/-\n(?=[a-zà-ú])/g, "").replace(/\s+/g, " ");
  const r = {};

  let melhor = null, maior = 0;
  for (const [nome, re] of BANCAS) {
    const n = (plano.match(new RegExp(re.source, "g" + re.flags.replace("g", ""))) || []).length;
    if (n > maior) { maior = n; melhor = nome; }
  }
  if (melhor) r.banca = melhor;

  const inicio = plano.slice(0, 6000);
  for (const re of ORGAOS) {
    const m = inicio.match(re);
    if (!m) continue;
    let nome = limpar(m[0].split(/\s+(?:torna|faz|fazem|comunica|no uso|resolve|EDITAL|CONCURSO|-\s|–\s|\|)/i)[0]);
    if (nome.length > 6) { r.nome = nome === nome.toUpperCase() ? titulo(nome) : nome; break; }
  }

  const cargo = plano.match(/\b(?:para o cargo de|ao cargo de|o cargo de|cargo:)\s+([A-ZÀ-Ú][^.;:()\n]{3,80})/i)
             || plano.match(/\bcargos? de\s+([A-ZÀ-Ú][^.;:()\n]{3,80})/i);
  if (cargo) r.cargo = limpar(cargo[1].split(/\s*,|\s+(?:e |conforme|n[ºo°]|com |do quadro|para |de que|do (?:Tribunal|Minist[ée]rio|Estado|Poder|MP))/i)[0]);

  const cid = plano.match(/(?:nas? cidades? de|no munic[ií]pio de)\s+([A-ZÀ-Ú][\wÀ-ú' ]{2,40}?)(?:\s*[\/–-]\s*([A-Z]{2}))?(?=[,.;)]|\s+e\s|\s+no\s|\s+na\s|\s+das\s)/);
  if (cid) r.cidade = limpar(cid[1]) + (cid[2] ? "/" + cid[2] : "");

  // prioriza o horário em que os portões FECHAM (é o que elimina quem chega atrasado)
  const port = plano.match(/port[oõ]es[^.]{0,200}?fechad[oa]s[^.]{0,90}?(?:às|as)\s*(\d{1,2}\s*h\s*\d{0,2})/i)
            || plano.match(/fechamento dos port[oõ]es[^.]{0,60}?(?:às|as)\s*(\d{1,2}\s*h\s*\d{0,2})/i);
  if (port) { const h = horasNoTrecho(port[1]); if (h.length) r.portoes = h[0].v; }

  const frases = plano.split(/(?<=[.;])\s+(?=[A-ZÀ-Ú0-9])/);
  const escolhidas = [], vistos = new Set();
  for (const f of frases) {
    if (f.length < 40 || f.length > 400 || INSTRUCOES_FORA.test(f)) continue;
    const idx = INSTRUCOES_CHAVE.findIndex(re => re.test(f));
    if (idx >= 0 && !vistos.has(idx)) { vistos.add(idx); escolhidas.push("• " + limpar(f.replace(/^[\d.]+\s*/, ""))); }
    if (escolhidas.length >= 8) break;
  }
  if (escolhidas.length) r.instrucoes = escolhidas.join("\n");

  r.tipo = detectarTipo(plano);
  r.fasesDatas = datasDasFases(plano, r.tipo);
  return r;
}

if (typeof module !== "undefined") module.exports = { interpretarEdital, datasNoTrecho, MODELOS, detectarTipo, datasDasFases };
