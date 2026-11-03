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
// fiquem com o evento e a data na mesma linha. Funciona também em páginas
// e tabelas giradas (listas de resultado em "paisagem").
// Além do texto, guarda a estrutura de células (textoDoPdf.estrutura) para ler quadros em colunas.
async function textoDoPdf(arquivo, maxPaginas = 90, opcoes = {}) {
  const pdfjs = await carregarPdfJs();
  const pdf = await pdfjs.getDocument({ data: await arquivo.arrayBuffer() }).promise;
  const n = Math.min(pdf.numPages, maxPaginas);
  let texto = "";
  const estrutura = [];
  for (let i = 1; i <= n; i++) {
    if (opcoes.aoProgredir && i % 10 === 1) opcoes.aoProgredir(i, n);
    const inicioPagina = texto.length;
    const pag = await pdf.getPage(i);
    const vp = pag.getViewport({ scale: 1 });
    const c = await pag.getTextContent();
    const itens = [];
    for (const it of c.items) {
      if (!it.str) continue;
      const t = pdfjs.Util.transform(vp.transform, it.transform);
      const ang = Math.atan2(t[1], t[0]);
      const h = Math.hypot(t[2], t[3]) || it.height || 10;
      itens.push({ t, ang, h, w: it.width || 0, s: it.str });
    }
    // direção predominante do texto na página (0° normal; ±90° girado)
    const contagem = {};
    for (const it of itens) { const k = Math.round(it.ang / (Math.PI / 2)); contagem[k] = (contagem[k] || 0) + it.s.length; }
    const dom = +Object.entries(contagem).sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
    const ang = dom * Math.PI / 2, cos = Math.cos(ang), sin = Math.sin(ang);
    const linhas = [];
    for (const it of itens) {
      const x = it.t[4], y = it.t[5];
      const ao = x * cos + y * sin;          // posição ao longo da linha
      const tr = -x * sin + y * cos;         // posição entre linhas
      let l = linhas.find(l => Math.abs(l.tr - tr) < Math.max(2, it.h * 0.45));
      if (!l) { l = { tr, partes: [] }; linhas.push(l); }
      l.partes.push({ x: ao, w: it.w, h: it.h, s: it.s });
    }
    linhas.sort((a, b) => a.tr - b.tr);
    // Junta os pedaços: só põe espaço quando há um vão de verdade (o PDF parte palavras e números, como "202" + "7")
    const juntar = partes => {
      let out = "", ant = null;
      for (const p of partes.sort((a, b) => a.x - b.x)) {
        if (ant && !/\s$/.test(out) && !/^\s/.test(p.s) && p.x - (ant.x + ant.w) > p.h * 0.15) out += " ";
        out += p.s; ant = p;
      }
      return out.replace(/\s+/g, " ").trim();
    };
    for (const l of linhas) {
      const ordenadas = l.partes.sort((a, b) => a.x - b.x);
      // células: pedaços separados por um vão grande (coluna de tabela)
      const celulas = []; let atual = null;
      for (const p of ordenadas) {
        if (!atual || p.x - (atual.fim) > p.h * 1.2) { atual = { x: p.x, partes: [], fim: p.x }; celulas.push(atual); }
        atual.partes.push(p); atual.fim = Math.max(atual.fim, p.x + p.w);
      }
      const textoLinha = juntar(ordenadas);
      if (!textoLinha) continue;
      texto += textoLinha + "\n";
      estrutura.push({ pagina: i, celulas: celulas.map(c => ({ x: Math.round(c.x), s: juntar(c.partes) })).filter(c => c.s) });
    }
    // parada antecipada (ex.: já achou o candidato numa lista de milhares de páginas)
    if (opcoes.parar && i >= 2 && opcoes.parar(texto.slice(inicioPagina), texto)) break;
  }
  textoDoPdf.estrutura = estrutura;
  return texto;
}

// Logo do órgão: a imagem do cabeçalho da 1ª página do edital (devolve um PNG pequeno em data URL, ou "")
async function extrairLogo(arquivo) {
  try {
    const pdfjs = await carregarPdfJs();
    const pdf = await pdfjs.getDocument({ data: await arquivo.arrayBuffer() }).promise;
    const pag = await pdf.getPage(1);
    const ops = await pag.getOperatorList();
    const nomes = [];
    ops.fnArray.forEach((fn, k) => { if (fn === pdfjs.OPS.paintImageXObject) nomes.push(ops.argsArray[k][0]); });
    let melhor = null;
    for (const nome of nomes.slice(0, 8)) {
      const img = await new Promise(ok => { const fonte = nome.startsWith("g_") ? pag.commonObjs : pag.objs; try { fonte.get(nome, ok); } catch (e) { ok(null); } setTimeout(() => ok(null), 3000); });
      if (!img || !img.width || !img.height) continue;
      const razao = img.width / img.height;
      if (razao < 0.35 || razao > 4.5 || img.width < 40 || img.height < 30) continue;   // descarta faixas e ícones minúsculos
      if (!melhor || img.width * img.height > melhor.width * melhor.height) melhor = img;
    }
    if (!melhor) return "";
    const c = document.createElement("canvas");
    c.width = melhor.width; c.height = melhor.height;
    const ctx = c.getContext("2d");
    if (melhor.bitmap) ctx.drawImage(melhor.bitmap, 0, 0);
    else if (melhor.data) {
      const n = melhor.width * melhor.height, d = melhor.data, rgba = new Uint8ClampedArray(n * 4);
      if (d.length === n * 4) rgba.set(d);
      else if (d.length === n * 3) for (let i = 0; i < n; i++) { rgba[i*4] = d[i*3]; rgba[i*4+1] = d[i*3+1]; rgba[i*4+2] = d[i*3+2]; rgba[i*4+3] = 255; }
      else if (d.length === n) for (let i = 0; i < n; i++) { rgba[i*4] = rgba[i*4+1] = rgba[i*4+2] = d[i]; rgba[i*4+3] = 255; }
      else return "";
      ctx.putImageData(new ImageData(rgba, melhor.width, melhor.height), 0, 0);
    } else return "";
    // reduz para no máximo 160 px (fica leve para sincronizar)
    const esc = Math.min(1, 160 / Math.max(c.width, c.height));
    const out = document.createElement("canvas");
    out.width = Math.round(c.width * esc); out.height = Math.round(c.height * esc);
    out.getContext("2d").drawImage(c, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  } catch (e) { return ""; }
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
      { nome: "1ª etapa – Provas objetivas", carater: "EC", chave: /provas? objetivas?/i,
        // a Tabela 7.1 do edital PC-BA está como imagem no PDF; distribuição transcrita do edital
        padrao: { objetivas: { total: 100, blocos: [
          { nome: "Conhecimentos gerais", qtd: 40, disciplinas: "Língua Portuguesa, Raciocínio Lógico, Atualidades, Informática, Promoção da Igualdade Racial e de Gênero, Medicina Legal, Legislação Geral" },
          { nome: "Conhecimentos específicos", qtd: 60, disciplinas: "Direito Administrativo, Direito Civil e Empresarial, Direito Constitucional, Direito Penal, Direito Processual Penal, Direito Processual Civil, Direito Tributário, Direito Ambiental, Legislação Penal e Processual Penal Extravagante, Criminologia" }
        ] } } },
      { nome: "2ª etapa – Prova discursiva", carater: "EC", chave: /prova discursiva/i },
      { nome: "3ª etapa – Prova de títulos", carater: "C", chave: /prova de t[ií]tulos/i, nota: /(?:comprova[cç][aã]o|apresenta[cç][aã]o|entrega|envio|anexar) d[oe]s (?:documentos? (?:pertinentes|referentes) [àa] prova de )?t[ií]tulos|t[ií]tulos/i }
    ]},
  juiz: { rotulo: "Juiz Substituto", base: "edital TJSC 2026 (FGV) e Resolução CNJ 75/2009",
    detectar: /magistratura|juiz substituto/i,
    fases: [
      { nome: "1ª etapa – Prova objetiva seletiva", carater: "EC", chave: /prova objetiva seletiva/i },
      { nome: "2ª etapa – Prova discursiva", carater: "EC", chave: /prova\s+(?:escrita\s+)?discursiva|prova escrita ser[aá] discursiva/i },
      { nome: "2ª etapa – Sentença cível", carater: "EC", chave: /senten[cç]a (?:de natureza )?c[ií]vel/i, chaveDur: /senten[cç]as?[^.]{0,60}natureza c[ií]vel/i },
      { nome: "2ª etapa – Sentença criminal", carater: "EC", chave: /senten[cç]a (?:de natureza )?criminal/i, chaveDur: /senten[cç]as?[^.]{0,90}natureza criminal/i },
      { nome: "3ª etapa – Inscrição definitiva (sindicância, exame médico e psicotécnico)", carater: "E", chave: /inscri[cç][aã]o definitiva/i },
      { nome: "4ª etapa – Prova oral", carater: "EC", chave: /prova oral/i },
      { nome: "5ª etapa – Avaliação de títulos", carater: "C", chave: /avalia[cç][aã]o de t[ií]tulos/i, nota: /(?:comprova[cç][aã]o|apresenta[cç][aã]o|entrega|envio|anexar) d[oe]s (?:documentos? (?:pertinentes|referentes) [àa] prova de )?t[ií]tulos|t[ií]tulos/i }
    ]},
  promotor: { rotulo: "Promotor de Justiça", base: "edital MPMT 2026 (FGV)",
    detectar: /promotor de justi[cç]a/i,
    fases: [
      { nome: "1ª fase – Prova preambular objetiva", carater: "EC", chave: /prova preambular objetiva/i },
      { nome: "2ª fase – Provas discursivas (1º dia)", carater: "EC", chave: /provas discursivas/i },
      { nome: "2ª fase – Provas discursivas (2º dia)", carater: "EC", chave: /provas discursivas/i, segundoDia: true },
      { nome: "3ª fase – Inscrição definitiva", carater: "E", chave: /inscri[cç][aã]o definitiva/i },
      { nome: "4ª fase – Prova oral", carater: "EC", chave: /prova oral/i },
      { nome: "5ª fase – Avaliação de títulos", carater: "C", chave: /avalia[cç][aã]o de t[ií]tulos/i, nota: /(?:comprova[cç][aã]o|apresenta[cç][aã]o|entrega|envio|anexar) d[oe]s (?:documentos? (?:pertinentes|referentes) [àa] prova de )?t[ií]tulos|t[ií]tulos/i }
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

// Formato de cada fase: objetiva, escrita ou sem prova (inscrição, oral, títulos...)
function formatoDaFase(nome) {
  if (/objetiva/i.test(nome)) return "objetiva";
  if (/discursiva|senten[cç]a|escrita|reda[cç][aã]o|pe[cç]a/i.test(nome)) return "escrita";
  return "nenhum";
}
for (const m of Object.values(MODELOS)) for (const f of m.fases) f.formato = formatoDaFase(f.nome);

// Horário de término: "das 13h às 18h"
function fimNoTrecho(t) {
  const m = t.match(/(\d{1,2})\s*h\s*(\d{2})?\s*(?:min)?\s*(?:às|as|até)\s*(\d{1,2})\s*h\s*(\d{2})?/i);
  if (!m) return "";
  const h = +m[3], mi = m[4] ? +m[4] : 0;
  return h <= 23 ? `${pad(h)}:${pad(mi)}` : "";
}

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
const RUIDO = /(gabarito|resultado|recurso|divulga[cç][aã]o|convoca[cç][aã]o|publica[cç][aã]o|pedido|\bvista\b|edital de|inscri[cç][oõ]es|isen[cç][aã]o|parecer|homologa|assinad|autenticidade|adiamento|cancelad)/i;

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
      // em retificações ("prevista para X, será realizada no dia Y") vale a nova data
      const NOVA = /(ser[aá] realizad[ao]|ser[aã]o realizad[ao]s|passa(?:r[aá])? a ser|fica(?:m)? (?:alterad|remarcad|transferid)|adiad[ao]s? para|transferid[ao]s? para|para o dia|nova data)[^.]{0,25}$/i;
      const d = dDepois.find(x => NOVA.test(depoisFrase.slice(Math.max(0, x.i - 50), x.i))) || dDepois[0];
      let data = d.v;
      if (f.segundoDia) {
        const dois = depoisFrase.slice(d.i).match(/^(\d{1,2})\s+e\s+(\d{1,2})\s+de\s+(\S+)\s+de\s+(\d{4})/i);
        if (!dois) continue;
        data = `${dois[4]}-${pad(mesNum(dois[3]))}-${pad(dois[2])}`;
        return { data, horario: "" };
      }
      const h = horasNoTrecho(depoisFrase.slice(d.i));
      const ok = h.length && h[0].i < 260;
      if (!ok) {
        // horário numa frase seguinte do mesmo subitem ("... 24 de janeiro. A aplicação ocorrerá ... das 13h às 18h")
        const item = plano.slice(fim, fim + 500).split(/\s\d{1,2}(?:\.\d{1,2}){1,3}\s/)[0];
        const r = item.match(/\bdas\s+(\d{1,2})\s*(?:h|:)\s*(\d{2})?\s*(?:min)?\s*(?:[àa]s|at[ée])\s+(\d{1,2})\s*(?:h|:)\s*(\d{2})?/i);
        if (r && !RUIDO.test(item.slice(0, r.index))) return { data, horario: `${pad(r[1])}:${r[2] || "00"}`, fim: `${pad(r[3])}:${r[4] || "00"}` };
      }
      return { data, horario: ok ? h[0].v : "", fim: ok ? fimNoTrecho(depoisFrase.slice(d.i + h[0].i, d.i + h[0].i + 40)) : "" };
    }
    if (dAntes.length && !f.segundoDia) {
      const d = dAntes[dAntes.length - 1];
      const h = horasNoTrecho(antesFrase.slice(d.i));
      return { data: d.v, horario: h.length ? h[0].v : "", fim: h.length ? fimNoTrecho(antesFrase.slice(d.i + h[0].i, d.i + h[0].i + 40)) : "" };
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

function interpretarEdital(textoBruto, tipoForcado, estrutura) {
  if (estrutura === undefined && typeof textoDoPdf !== "undefined") estrutura = textoDoPdf.estrutura;
  // remove cabeçalhos e rodapés que se repetem em todas as páginas
  const linhas = textoBruto.split("\n"), conta = {};
  const chaveLinha = l => l.replace(/\d+\s*$/, "").trim();
  for (const l of linhas) { const k = chaveLinha(l); if (k.length > 8 && k.length < 140) conta[k] = (conta[k] || 0) + 1; }
  textoBruto = linhas.filter(l => (conta[chaveLinha(l)] || 0) < 5).join("\n");
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
    let nome = limpar(m[0].split(/\s+(?:torna|faz|fazem|comunica|no uso|resolve|EDITAL|CONCURSO|-\s|–\s|\|)|\s+(?:Avenida|Av|Rua|Pra[cç]a|P[cç]a|Rodovia|Alameda|Travessa|Setor|SAF|SAS|Quadra|Bairro|CEP|Endere[cç]o|Telefone|O|A|Presidente|Presid[êe]ncia|Vice|Desembargador[a]?|Corregedor[a]?|Corregedoria|Procurador[a]?|Procuradoria|Defensor[a]?|Secret[áa]rio|Secret[áa]ria|Secretaria|Diretor[a]?|Diretoria|Comiss[ãa]o|Gabinete|Escola|Coordenadoria|Departamento|Ger[êe]ncia|N[úu]cleo|Juiz[a]?|Excelent[íi]ssim[oa])(?![A-Za-zÀ-ú])|\s+www\./i)[0]);
    // cabeçalhos que repetem o nome (em caixa alta e depois normal): fica uma vez só
    const pal = nome.split(" "), metade = Math.floor(pal.length / 2);
    for (let k = 3; k <= metade; k++) {
      const a = pal.slice(0, k).join(" "), resto = pal.slice(k).join(" ");
      if (semAcentoE(resto).startsWith(semAcentoE(a))) { nome = resto.slice(0, a.length).trim() || a; break; }
    }
    if (nome.length > 6) { r.nome = nome === nome.toUpperCase() ? titulo(nome) : nome; break; }
  }

  const cargo = plano.match(/\b(?:para o cargo de|ao cargo de|o cargo de|cargo:)\s+([A-ZÀ-Ú][^.;:()\n]{3,80})/i)
             || plano.match(/\bcargos? de\s+([A-ZÀ-Ú][^.;:()\n]{3,80})/i);
  if (cargo) r.cargo = (c => c === c.toUpperCase() ? titulo(c) : c)(limpar(cargo[1].split(/\s*,|\s+(?:e |conforme|n[ºo°]|com |do quadro|para |de que|do (?:Tribunal|Minist[ée]rio|Estado|Poder|MP))/i)[0]));

  const cid = plano.match(/(?:nas? cidades? de|no munic[ií]pio de)\s+([A-ZÀ-Ú][\wÀ-ú' ]{2,40}?)(?:\s*[\/–-]\s*([A-Z]{2}))?(?=[,.;)]|\s+e\s|\s+no\s|\s+na\s|\s+das\s)/);
  if (cid) r.cidade = limpar(cid[1]) + (cid[2] ? "/" + cid[2] : "");

  // prioriza o horário em que os portões FECHAM (é o que elimina quem chega atrasado)
  const port = plano.match(/port[oõ]es[^.]{0,200}?fechad[oa]s[^.]{0,90}?(?:às|as)\s*(\d{1,2}\s*h\s*\d{0,2})/i)
            || plano.match(/fechamento dos port[oõ]es[^.]{0,60}?(?:às|as)\s*(\d{1,2}\s*h\s*\d{0,2})/i);
  if (port) { const h = horasNoTrecho(port[1]); if (h.length) r.portoes = h[0].v; }

  r.instrucoes = instrucoesDeIdentificacao(plano);

  r.tipo = (tipoForcado && MODELOS[tipoForcado]) ? tipoForcado : detectarTipo(plano);
  r.fasesDatas = datasDasFases(plano, r.tipo);
  r.notas = notasDasFases(plano, r.tipo);
  r.portoesMin = regraPortoes(plano);
  r.composicao = composicaoDasFases(plano, textoBruto.split("\n"), r.tipo, estrutura);
  r.previsoes = previsoesDasFases(plano, r.tipo);
  // valor de cada questão objetiva ("atribuído 0,1 ponto a cada resposta correta") — usado para calcular acertos pela nota
  const ppq = plano.match(/atribu[ií]d[oa]s?\s+(?:o valor de\s+)?(\d+(?:,\d+)?)\s*(?:\([^)]*\)\s*)?pontos?\s+(?:a|para|por)\s+cada\s+(?:resposta|quest)/i)
           || plano.match(/cada (?:resposta correta|quest[aã]o)[^.]{0,30}?valer[aá]\s+(\d+(?:,\d+)?)\s*(?:\([^)]*\)\s*)?pontos?/i);
  if (ppq) r.pontosQuestao = parseFloat(ppq[1].replace(",", "."));
  r.duracoes = duracoesDasFases(plano, r.tipo);
  r.vagas = vagasDoEdital(textoBruto, r.cargo);
  return r;
}

// ---------- Vagas do cargo ----------
// devolve {total, ampla, pcd, negros, indigenas, quilombolas, cr} — valores como "15", "CR" ou "10 + CR"
const CATS_VAGA = [
  ["ampla", /\bampla\b|\bAC\b/i],
  ["pcd", /pessoas?\s+com|candidatos?\s+com|defici[eê]ncia|\bPC[Dd]\b|\bPNE\b/i],
  ["negros", /negr[oa]s|pret[oa]s|\bPN\b/i],
  ["indigenas", /ind[ií]genas?|\bPI\b/i],
  ["quilombolas", /quilombolas?|\bPQ\b/i]
];
function valorVaga(t) {
  t = t.replace(/\*/g, "").replace(/\s+/g, " ").trim();
  if (/^CR$/i.test(t)) return "CR";
  const m = t.match(/^(\d+)(?:\s*\+\s*CR)?$/i);
  if (!m) return t;
  return String(+m[1]) + (/CR/i.test(t) ? " + CR" : "");
}
const numVaga = v => parseInt(v, 10) || 0;
function vagasDoEdital(texto, cargo) {
  const linhas = texto.split("\n").map(l => l.replace(/\s+/g, " ").trim());
  const plano = linhas.join(" ");
  const inicio = plano.slice(0, 40000);
  const cr = /cadastro de reserva|\+\s*CR\b/i.test(inicio);
  let v = null;

  // 1) por extenso: "19 (dezenove) vagas para ampla concorrência, 01 (uma) vaga para pessoas com deficiência…"
  const prosa = {};
  const reP = /(\d{1,4})\s*(?:\([^)]{1,40}\)\s*)?vagas?\s+(?:para|destinadas?\s+(?:a|à|às|aos)|reservadas?\s+(?:a|à|às|aos))\s+(?:a\s+|as\s+|os\s+)?(ampla|pessoas? com defici\S*|candidatos? com defici\S*|negr\S*|pret\S*|ind[ií]gen\S*|quilombol\S*)/gi;
  let m;
  while ((m = reP.exec(inicio))) {
    const c = CATS_VAGA.find(([, re]) => re.test(m[2]));
    if (c && prosa[c[0]] === undefined) prosa[c[0]] = String(+m[1]);
  }
  // só vale se a distribuição bater com o total anunciado
  if (prosa.ampla && Object.keys(prosa).length >= 3) v = prosa;

  // 2) quadro de vagas em colunas (uma linha por cargo)
  if (!v) {
    const tok = /(\d{1,4}\s*\+\s*CR\b\*?|\bCR\b\*?|\b\d{1,4}\b)/gi;
    const limpar = l => l.replace(/^\d{1,2}(?:\.\d{1,2})+\.?\s/, " ").replace(/^\d{1,4}\s+(?=[A-Za-zÀ-ú])/, " ").replace(/[\d.]+\/\d{2,4}\b/g, " ").replace(/\bn[º°o]\.?\s*[\d.]+/gi, " ").replace(/R\$\s*[\d.,]+/g, " ").replace(/\d+(?:,\d+)?\s*%/g, " ").replace(/\b\d{1,3}(?:\.\d{3})+\b|\d+\/\d+/g, " ").replace(/\(\d+\)/g, " ");
    const valores = l => (limpar(l).match(tok) || []).map(valorVaga);
    for (let a = 0; a < linhas.length && !v; a++) {
      if (!/quadro de vagas|cargos e vagas|das vagas|n[uú]mero de vagas|^vagas$|especialidade vagas/i.test(linhas[a])) continue;
      if (/reserva(?:das?)? (?:de |às |aos )?vagas|destinadas/i.test(linhas[a]) && !/quadro/i.test(linhas[a])) continue;
      // cabeçalho: linhas até a primeira com 3+ valores
      let k = a, cab = "";
      while (k < Math.min(linhas.length, a + 14) && valores(linhas[k]).length < 3) { cab += " " + linhas[k]; k++; }
      if (k >= a + 14) continue;
      const ordem = CATS_VAGA.map(([n, re]) => [n, cab.search(re)]).filter(([, i]) => i >= 0).sort((x, y) => x[1] - y[1]).map(([n]) => n);
      if (ordem.length < 2 || !ordem.includes("ampla")) continue;
      // linhas da tabela
      const rotulos = [];
      for (let j = k; j < Math.min(linhas.length, k + 40); j++) {
        if (j > k && /^\d{1,2}(?:\.\d{1,2})+\.?\s+\S/.test(linhas[j])) break;   // próximo subitem: acabou o quadro
        if (linhas[j].split(" ").length > 16) continue;   // texto corrido, não é linha de tabela
        const vs = valores(linhas[j]);
        if (vs.length < 3) continue;
        if (/^total\b/i.test(linhas[j])) continue;
        const rot = [linhas[j - 1] && valores(linhas[j - 1]).length < 2 ? linhas[j - 1] : "", limpar(linhas[j]).replace(tok, " "), linhas[j + 1] && valores(linhas[j + 1]).length < 2 ? linhas[j + 1] : ""].join(" ");
        // valores que continuam na linha de baixo (ex.: "de Direito 15 + CR")
        let vals = vs;
        if (linhas[j + 1] && valores(linhas[j + 1]).length && valores(linhas[j + 1]).length < 3 && vs.length < ordem.length + 1) vals = vs.concat(valores(linhas[j + 1]));
        rotulos.push({ rot, vals });
      }
      if (!rotulos.length) continue;
      const pal = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z]{4,}/g) || [];
      const alvo = pal(cargo).map(w => w.slice(0, 6));
      const nota = r => pal(r.rot).filter(w => alvo.includes(w.slice(0, 6))).length;
      rotulos.sort((x, y) => nota(y) - nota(x));
      const vals = rotulos[0].vals;
      // o total é o valor igual à soma dos demais (ou o maior)
      let iT = vals.findIndex((t, i) => numVaga(t) && numVaga(t) === vals.reduce((s, u, j) => s + (j === i ? 0 : numVaga(u)), 0));
      if (iT < 0) { const mx = Math.max(...vals.map(numVaga)); iT = vals.map(numVaga).lastIndexOf(mx); }
      const resto = vals.filter((_, i) => i !== iT);
      v = { total: vals[iT] };
      ordem.forEach((n, i) => { if (resto[i] !== undefined) v[n] = resto[i]; });
      // cabeçalhos quebrados em várias linhas podem trocar a ordem: a cota de negros (20–30%) é maior que a de PcD (5–10%)
      if (v.pcd && v.negros && numVaga(v.pcd) > numVaga(v.negros)) [v.pcd, v.negros] = [v.negros, v.pcd];
    }
  }

  // 3) quadro com uma linha por categoria ("AMPLA CONCORRÊNCIA 62", "PESSOAS COM DEFICIÊNCIA ... 10")
  if (!v) {
    const a = linhas.findIndex(l => /^ampla\b/i.test(l) && /\d+\s*$/.test(l));
    if (a >= 0) {
      v = {};
      for (let j = a; j < Math.min(linhas.length, a + 20); j++) {
        const c = CATS_VAGA.find(([, re]) => re.test(linhas[j].split(/\s+(?:lei|resolu|decreto|-)/i)[0]));
        const n = linhas[j].match(/(\d{1,4})\s*$/);
        if (c && n && v[c[0]] === undefined && !/%\s*$|\/\d{4}\s*$/.test(linhas[j])) v[c[0]] = String(+n[1]);
      }
      if (!v.ampla) v = null;
    }
  }
  if (!v) {
    const t = inicio.match(/(?:provimento|preenchimento)\s+de\s+(\d{1,4})\s*(?:\([^)]*\)\s*)?(?:vagas|cargos)/i);
    if (!t) return cr ? { cr: true } : null;
    v = { total: String(+t[1]) };
  }
  if (!v.total) {
    const t = inicio.match(/(?:provimento|preenchimento)\s+de\s+(\d{1,4})\s*(?:\([^)]*\)\s*)?(?:vagas|cargos)/i);
    const soma = ["ampla", "pcd", "negros", "indigenas", "quilombolas"].reduce((s, k) => s + numVaga(v[k] || ""), 0);
    v.total = t ? String(+t[1]) : String(soma);
  }
  v.total = String(v.total).replace(/\s*\+\s*CR/i, "");
  v.cr = cr;
  return v;
}

// ---------- Composição das provas ----------
function numero(s) { return s ? +s : 0; }
// Quadro de blocos/grupos: "Bloco I:" seguido das disciplinas, com o número de questões numa das linhas
function blocosDoQuadro(linhasTexto) {
  // Aceita "Bloco I:", "Grupo 1:" (número do bloco numa das linhas) e "MÓDULO DE CONHECIMENTOS GERAIS"
  // (número por matéria, às vezes com o nome quebrado em duas linhas).
  const grupos = []; let atual = null, encerrou = false;
  const fechar = () => { if (atual) grupos.push(atual); atual = null; };
  for (const bruta of linhasTexto) {
    const l = bruta.trim();
    if (!l) continue;
    const cab1 = l.match(/^(bloco|grupo|m[óo]dulo)\s+([ivx\d]+)\s*:?\s*(.*)$/i);
    const cab2 = l.match(/^m[óo]dulo d[eo]s?\s+(.+)$/i);
    if (cab1 || cab2) {
      fechar();
      const nome = cab1 ? `${cab1[1][0].toUpperCase()}${cab1[1].slice(1).toLowerCase()} ${cab1[2].toUpperCase()}`
                        : cab2[1].charAt(0).toUpperCase() + cab2[1].slice(1).toLowerCase();
      atual = { nome, itens: [] };
      if (cab1 && cab1[3]) linhaDoBloco(atual, cab1[3]);
      continue;
    }
    if (!atual) continue;
    if (/^total\b/i.test(l)) { fechar(); encerrou = true; break; }
    if (/^\d+(\.\d+)+\s/.test(l) || l.length > 120) { fechar(); if (grupos.length) break; continue; }
    if (/^(disciplinas?|[áa]rea de conhecimento|conte[úu]dos?)\s+quest/i.test(l)) continue;
    linhaDoBloco(atual, l);
  }
  fechar();
  return grupos.map(g => {
    const numerados = g.itens.filter(i => i.n);
    if (numerados.length <= 1) return { nome: g.nome, qtd: numerados.length ? numerados[0].n : 0, disciplinas: g.itens.map(i => i.t) };
    return { nome: g.nome, qtd: numerados.reduce((s, i) => s + i.n, 0), disciplinas: g.itens.map(i => i.n ? `${i.t} (${i.n})` : i.t) };
  }).filter(b => b.qtd > 0 && b.disciplinas.length);
}
function linhaDoBloco(b, l) {
  const ult = b.itens[b.itens.length - 1];
  if (/^\d{1,3}$/.test(l)) { if (ult && !ult.n) { ult.n = +l; ult.cont = true; } return; }
  const m = l.match(/^(.*?)\s+(\d{1,3})$/);
  if (m) { b.itens.push({ t: m[1].replace(/\s*-\s*$/, "").trim(), n: +m[2] }); return; }
  if (ult && ult.cont) { ult.t = (ult.t.replace(/\s*-\s*$/, "") + (/-\s*$/.test(ult.t) ? " – " : " ") + l).trim(); ult.cont = false; return; }
  b.itens.push({ t: l, n: 0 });
}

const RE_ITEM = /(\d{1,2})\s*\([^)]*\)\s*(quest(?:ão|ões)(?:\s+discursivas?)?(?:,?\s+na modalidade\s+estudo de caso|\s+de estudo de caso)?|pe[cç]as?(?:\s+[a-zà-ú]+){0,2}|disserta[cç](?:ão|ões)|pareceres?|senten[cç]as?)/gi;

function itensEscritos(janela) {
  const itens = [];
  const faixa = janela.match(/(\d{1,2})\s*(?:\([^)]*\))?\s*a\s*(\d{1,2})\s*(?:\([^)]*\))?\s*(quest(?:ões|oes)(?:\s+discursivas?)?)/i);
  if (faixa) {
    const depois = janela.slice(faixa.index + faixa[0].length, faixa.index + faixa[0].length + 110);
    const lin = depois.match(/^[^.;]*?(?:de até|com|até)\s*(\d{1,3})\s*(?:\([^)]*\))?\s*linhas/i);
    itens.push({ chave: "questao", qtd: `${faixa[1]} a ${faixa[2]}`, tipo: faixa[3].toLowerCase(), linhas: lin ? +lin[1] : "" });
  }
  let m;
  RE_ITEM.lastIndex = 0;
  while ((m = RE_ITEM.exec(janela))) {
    let tipo = limpar(m[2]).toLowerCase();
    const chaveTipo = /pe[cç]a/i.test(tipo) ? "peca" : /disserta/i.test(tipo) ? "dissertacao" : /senten/i.test(tipo) ? "sentenca" : /parecer/i.test(tipo) ? "parecer" : "questao";
    if (itens.some(i => i.chave === chaveTipo)) continue;
    const depois = janela.slice(m.index + m[0].length, m.index + m[0].length + 110);
    const lin = depois.match(/^[^.;]*?(?:de até|com|até)\s*(\d{1,3})\s*(?:\([^)]*\))?\s*linhas/i);
    itens.push({ chave: chaveTipo, qtd: +m[1], tipo, linhas: lin ? +lin[1] : "" });
  }
  // "elaboração de texto de até 40 linhas" (peça, parecer ou dissertação sem número)
  const texto = janela.match(/elabora[cç][aã]o de (?:um )?texto de até\s*(\d{1,3})\s*(?:\([^)]*\))?\s*linhas/i);
  if (texto && !itens.some(i => i.chave === "texto")) itens.unshift({ chave: "texto", qtd: 1, tipo: "texto (peça, parecer, estudo de caso ou dissertação)", linhas: +texto[1] });
  // "90 linhas para elaborar a peça" / "25 linhas para elaborar a resposta das questões"
  const reLin = /(\d{1,3})\s*(?:\([^)]*\))?\s*linhas para elaborar\s+([^.;]{0,70})/gi;
  while ((m = reLin.exec(janela))) {
    const alvo = /pe[cç]a/i.test(m[2]) ? "peca" : /quest/i.test(m[2]) ? "questao" : null;
    const it = itens.find(i => i.chave === alvo);
    if (it && !it.linhas) it.linhas = +m[1];
  }
  return itens.map(({ chave, ...i }) => i);
}

// Quadro em colunas: a célula "Bloco I: ..." marca a coluna das matérias; a quantidade fica numa coluna à direita.
function blocosDaTabela(estrutura) {
  if (!estrutura || !estrutura.length) return [];
  const blocos = []; let atual = null;
  const ehNumero = s => /^\d{1,3}(?:\s*\(|$)/.test(s);
  for (const linha of estrutura) {
    const cels = linha.celulas || [];
    const ini = cels.find(c => /^(bloco|grupo|m[óo]dulo)\s+([ivx\d]+)\s*:?/i.test(c.s));
    if (ini) {
      const m = ini.s.match(/^(bloco|grupo|m[óo]dulo)\s+([ivx\d]+)\s*:?\s*(.*)$/i);
      atual = { nome: `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2].toUpperCase()}`, x: ini.x, textos: m[3] ? [m[3]] : [], qtd: 0, linhas: 0 };
      blocos.push(atual);
      cels.filter(c => c !== ini && ehNumero(c.s) && c.x > ini.x + 50).slice(0, 1).forEach(c => { if (!atual.qtd) atual.qtd = parseInt(c.s, 10); });
      continue;
    }
    if (!atual) continue;
    if (cels.some(c => /^(prova\/tipo|total\b|disciplinas?\s|[áa]rea de)/i.test(c.s)) || ++atual.linhas > 25) { atual = null; continue; }
    for (const c of cels) {
      if (ehNumero(c.s) && c.x > atual.x + 50) { if (!atual.qtd) atual.qtd = parseInt(c.s, 10); }
      else if (Math.abs(c.x - atual.x) < 45 && !ehNumero(c.s)) atual.textos.push(c.s);
    }
  }
  return blocos.filter(b => b.qtd > 0 && b.textos.length).map(b => {
    let t = b.textos.join(" ").replace(/\(?\s*anexo\s+[ivx\d]+[^)]*\)?/gi, "").replace(/-\s+(?=[a-zà-ú])/g, "").replace(/\s+/g, " ").trim();
    const disciplinas = t.replace(/\s+e\s+(?=(?:Direito|Direitos|No[cç][oõ]es|L[ií]ngua|Legisla|Teoria|Tutela|Racioc|Inform)\b)/g, ", ").split(/\s*,\s*/).map(x => x.trim()).filter(x => x.length > 2);
    return { nome: b.nome, qtd: b.qtd, disciplinas };
  });
}

const NUM_EXTENSO = { um: "I", uma: "I", dois: "II", duas: "II", "três": "III", tres: "III", quatro: "IV", cinco: "V", seis: "VI" };
function blocosNoTexto(plano) {
  const re = /\b(bloco|grupo|m[óo]dulo)\s+(um|uma|dois|duas|tr[êe]s|quatro|cinco|seis|[ivx]{1,4}|\d)\s*[:–-]\s*([^]{5,400}?)\s*[–-]\s*(\d{1,3})\s*(?:\([^)]*\)\s*)?quest/gi;
  const out = []; let m;
  while ((m = re.exec(plano))) {
    const id = NUM_EXTENSO[m[2].toLowerCase()] || m[2].toUpperCase();
    if (out.some(b => b.id === id)) continue;
    const disciplinas = m[3].replace(/\s+e\s+(?=(?:Direito|Direitos|No[cç][oõ]es|L[ií]ngua|Legisla|Teoria|Tutela|Racioc|Inform)\b)/g, ", ").split(/\s*,\s*/).map(x => x.trim()).filter(x => x.length > 2);
    out.push({ id, nome: `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${id}`, qtd: +m[4], disciplinas });
  }
  return out.length >= 2 ? out.map(({ id, ...b }) => b) : [];
}

function composicaoDasFases(plano, linhasTexto, tipo, estrutura) {
  const modelo = MODELOS[tipo] || MODELOS.outro;
  let blocos = blocosDoQuadro(linhasTexto);
  if (!blocos.length) blocos = blocosNoTexto(plano);
  const daTabela = blocosDaTabela(estrutura);
  // o quadro em colunas é mais confiável quando ele existe e fecha a conta
  if (daTabela.length >= 2 && (!blocos.length || blocos.some(b => /\d/.test(b.disciplinas.join(" "))) || daTabela.reduce((s, b) => s + b.qtd, 0) !== blocos.reduce((s, b) => s + b.qtd, 0))) blocos = daTabela;
  let objetivaUsada = false;
  return modelo.fases.map(f => {
    const c = { objetivas: null, escritas: [] };
    if (f.formato === "objetiva") {
      const re = new RegExp("(?:" + f.chave.source + ")[^.]{0,220}?(\\d{1,3})\\s*(?:\\([^)]*\\))?\\s*quest(?:ões|oes)(?:\\s+objetivas)?\\s+de\\s+m[úu]ltipla escolha", "i");
      const m = plano.match(re) || plano.match(/(\d{1,3})\s*(?:\([^)]*\))?\s*quest(?:ões|oes)(?:\s+objetivas)?\s+de\s+m[úu]ltipla escolha/i);
      if (m || (!objetivaUsada && blocos.length)) {
        const total = m ? +m[1] : blocos.reduce((s, b) => s + b.qtd, 0);
        c.objetivas = { total, blocos: objetivaUsada ? [] : blocos.map(b => ({ nome: b.nome, qtd: b.qtd, disciplinas: b.disciplinas.join(", ") })) };
        objetivaUsada = true;
      }
      // sem quadro em texto (ex.: tabela em imagem): usa a distribuição registrada no modelo, se o total bater
      if (f.padrao && f.padrao.objetivas && (!c.objetivas || !c.objetivas.blocos.length) && (!c.objetivas || +c.objetivas.total === f.padrao.objetivas.total))
        c.objetivas = JSON.parse(JSON.stringify(f.padrao.objetivas));
    } else if (f.formato === "escrita") {
      const re = new RegExp("(?:" + f.chave.source + ")[\\s\\S]{0,450}?(?:consistir|compost|constitu[ií]d)", "gi");
      let m, janela = "";
      while ((m = re.exec(plano))) { janela = plano.slice(m.index, m.index + 1600).split(/\s\d{1,2}(?:\.\d{1,2})*\.?\s+(?:DA|DAS|DO|DOS)\s+[A-ZÀ-Ú]{3}|\b(?:segunda|terceira) prova (?:escrita|pr[áa]tica)|\bprova pr[áa]tica de senten/i)[0]; if (RE_ITEM.test(janela) || /linhas/i.test(janela)) break; janela = ""; }
      RE_ITEM.lastIndex = 0;
      c.escritas = janela ? itensEscritos(janela) : [];
      if (!c.escritas.length && /senten[cç]a/i.test(f.nome)) c.escritas = [{ qtd: 1, tipo: f.nome.replace(/^.*?–\s*/, "").toLowerCase(), linhas: "" }];
    }
    return c;
  });
}

// ---------- Turno e duração ("Período da Manhã: Provas Objetivas com duração de 04h00min") ----------
function minutosDeDuracao(t) {
  let m = t.match(/(\d{1,2})\s*h\s*(\d{2})\s*min/i);
  if (m) return +m[1] * 60 + +m[2];
  m = t.match(/(\d{1,2})\s*(?:\([^)]*\)\s*)?horas?(?:\s*e\s*(\d{1,2})\s*(?:\([^)]*\)\s*)?minutos)?/i);
  return m ? +m[1] * 60 + (m[2] ? +m[2] : 0) : 0;
}
function duracoesDasFases(plano, tipo) {
  const modelo = MODELOS[tipo] || MODELOS.outro;
  return modelo.fases.map(f => {
    if (f.formato === "nenhum") return {};
    const re = new RegExp("(?:" + (f.chaveDur || f.chave).source + ")", "gi");
    let m;
    while ((m = re.exec(plano))) {
      const depois = plano.slice(m.index, m.index + 260).split(/;|\.\s+(?=[A-ZÀ-Ú])/)[0];
      const d = depois.match(/dura[cç][aã]o(?: total)? de\s*([^.;]{3,60})/i);
      if (!d) continue;
      const min = minutosDeDuracao(d[1]);
      if (!min || min > 600) continue;
      const antes = plano.slice(Math.max(0, m.index - 60), m.index);
      const turno = (antes.match(/per[ií]odo d[ae]\s+(manh[aã]|tarde|noite)/i) || depois.match(/per[ií]odo d[ae]\s+(manh[aã]|tarde|noite)|turno d[ae]\s+(manh[aã]|tarde|noite)/i) || [])
        .slice(1).find(Boolean) || "";
      return { duracao: min, turno: turno.toLowerCase() };
    }
    return {};
  });
}

// Cronograma estimado por mês ("Prova Discursiva Setembro 2026")
const RE_MES = "(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\\s*(?:de\\s*|\\/\\s*)?(20\\d\\d)";
function previsoesDasFases(plano, tipo) {
  const modelo = MODELOS[tipo] || MODELOS.outro;
  return modelo.fases.map(f => {
    const fonte = f.chave.source.replace(/c\[ií\]vel/g, "(?:de natureza )?c[ií]vel");
    const re = new RegExp("(?:prova pr[áa]tica de )?(?:" + fonte + ")\\s*(?:\\([^)]*\\)\\s*)?[–-]?\\s*" + RE_MES + "(?!\\s*\\d)", "i");
    const m = plano.match(re);
    if (!m) return "";
    const ms = m.slice(-2);
    return `${ms[0].toLowerCase()} de ${ms[1]}`;
  });
}

// ---------- Listas de editais complementares (inscrições homologadas, resultados) ----------
const semAcentoE = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
function acharCandidato(texto, { nome, inscricao }) {
  const linhas = texto.split("\n");
  const insc = String(inscricao || "").replace(/\D/g, "");
  let idx = -1;
  if (insc.length >= 4) idx = linhas.findIndex(l => new RegExp("(^|\\D)" + insc + "(\\D|$)").test(l.replace(/[.\-\/]/g, "")));
  if (idx < 0 && nome) {
    const partes = semAcentoE(nome).split(" ").filter(p => p.length > 2);
    if (partes.length >= 2) {
      const re = new RegExp("\\b" + partes.join("\\b.{0,40}?\\b") + "\\b");
      idx = linhas.findIndex(l => re.test(semAcentoE(l)));
    }
  }
  return idx;
}
function lerListaDoCandidato(texto, candidato, tipo) {
  const plano = texto.replace(/\s+/g, " ");
  const cabeca = plano.slice(0, 4000);
  const ehHomologacao = /inscri[cç][oõ]es?[^.]{0,80}(?:homologad|deferid)|(?:homologa[cç][aã]o|deferimento)[^.]{0,40}inscri[cç]/i.test(cabeca)
                     || (/inscri[cç][oõ]es?[^.]{0,80}(?:homologad|deferid)|(?:homologa[cç][aã]o|deferimento)[^.]{0,40}inscri[cç]/i.test(plano) && !/nota|pontua|acertos/i.test(cabeca));
  const linhasComNota = (texto.match(/^.*[A-Za-zÀ-ú]{3,}.*\s\d{1,3},\d{1,3}\s*$/gm) || []).length;
  const ehResultado = !ehHomologacao && /resultado|habilitad[oa]s|aprovad[oa]s|classifica[cç][aã]o (?:final|preliminar)/i.test(plano) && linhasComNota >= 10;
  // só é lista se tiver muitas linhas do tipo "nº de inscrição + nome" (evita confundir com o edital de abertura)
  const linhasDeLista = (texto.match(/^\s*\d{5,}[\s,;-]+[A-Za-zÀ-ú]{2,}/gm) || []).length
                      + (texto.match(/^\s*[A-Za-zÀ-ú][A-Za-zÀ-ú' ().-]{5,}\s+\d{5,}\s*$/gm) || []).length;   // "NOME   7190076518"
  const ehLista = linhasDeLista >= 15;
  const r = { tipoLista: !ehLista ? null : ehResultado ? "resultado" : ehHomologacao ? "homologacao" : null };
  if (!r.tipoLista) return r;
  const linhas = texto.split("\n");
  const idx = acharCandidato(texto, candidato);
  r.encontrado = idx >= 0;
  if (idx >= 0) {
    const linha = linhas[idx].replace(/\s+/g, " ").trim();
    r.linha = linha.slice(0, 220);
    const insc = linha.match(/(?:^|\s)(\d[\d.\-\/]{4,}\d)(?=\s|$)/);
    if (insc) r.inscricao = insc[1].replace(/\D/g, "");
  }
  if (r.tipoLista === "resultado") {
    // qual fase: a que aparece no título do resultado
    const modelo = MODELOS[tipo] || MODELOS.outro;
    const titulo = (plano.match(/resultado[^.]{0,140}/gi) || []).join(" ");
    let fase = modelo.fases.findIndex(f => f.chave.test(titulo));
    if (fase < 0) fase = modelo.fases.findIndex(f => (f.formato === "objetiva" && /objetiva/i.test(titulo)) || (f.formato === "escrita" && /discursiva|escrita|senten/i.test(titulo)) || (/oral/i.test(f.nome) && /oral/i.test(titulo)));
    r.fase = fase;
    r.aprovado = r.encontrado ? true : (/habilitad[oa]s|aprovad[oa]s|classificad[oa]s/i.test(titulo) ? false : null);
    if (idx >= 0) {
      const notaDe = l => { const ns = (l.replace(/^\s*\d{6,}\s/, "").match(/\b\d{1,3}(?:,\d{1,3})?\b/g) || []); return ns.length ? ns[ns.length - 1] : ""; };
      r.nota = notaDe(linhas[idx]);
      // classificação: 1 + quantos da MESMA lista (mesmo título, ex.: "Ampla Concorrência") tiveram nota maior
      const formato = linhas[idx].match(/^\s*(\d{6,})\s/);
      if (formato && r.nota) {
        const tam = formato[1].length, v = parseFloat(r.nota.replace(",", "."));
        const ehLinha = l => new RegExp("^\\s*\\d{" + tam + "}\\s+[A-Za-zÀ-ú]").test(l);
        const ehTitulo = l => /^\s*(resultado|rela[cç][aã]o|classifica[cç][aã]o)\b/i.test(l);
        let titulo = "", tituloDoCandidato = "";
        const porTitulo = [];
        linhas.forEach((l, k) => { if (ehTitulo(l)) titulo = l.trim(); else if (ehLinha(l)) porTitulo.push([titulo, l]); if (k === idx) tituloDoCandidato = titulo; });
        let maiores = 0, total = 0;
        for (const [t, l] of porTitulo) if (t === tituloDoCandidato) { total++; const n = parseFloat(notaDe(l).replace(",", ".")); if (n > v) maiores++; }
        r.classificacao = maiores + 1; r.totalLista = total;
        const lista = tituloDoCandidato.match(/[-–]\s*([^-–]+)$/); if (lista) r.lista = lista[1].trim();
      }
    }
  }
  return r;
}

// Quando o edital não traz a data de uma fase, guarda a regra que ele dá
// (ex.: "prazo de 15 dias úteis contados da convocação", "datas constarão do edital de convocação").
function notasDasFases(plano, tipo) {
  const modelo = MODELOS[tipo] || MODELOS.outro;
  const frases = plano.split(/(?<=[.;])\s+(?=\d{1,2}(?:\.\d{1,2})+\.?\s|[A-ZÀ-Ú])/);
  return modelo.fases.map(f => {
    const re = f.nota || f.chave;
    let melhor = null, nota = 0;
    for (const fr of frases) {
      if (fr.length < 50 || fr.length > 420 || !re.test(fr)) continue;
      let n = 0;
      if (/\b(datas?|prazo|hor[aá]rios?|local)\b/i.test(fr)) n += 2;
      if (/edital de convoca|convoca[cç][aã]o|convocad|edital espec[ií]fico|oportunamente|juntamente com o pedido|no momento da inscri|constar[aã]o|momento d[ao]|ser[aã]o realizad|ser[aá] realizad|dias [úu]teis/i.test(fr)) n += 2;
      if (/recurso|nota|pontua|peso|n[aã]o haver[aá]|vedad|elimina/i.test(fr)) n -= 2;
      if (n > nota) { nota = n; melhor = fr; }
    }
    if (nota < 2) return "";
    // tira o título da seção e a numeração do item ("DA PROVA ORAL 15.1 ...")
    return limpar(melhor.replace(/\s+\d+\.?\s*$/, "").replace(/^(?:[\d.]+\s*)?(?:[A-ZÀ-Ú–\- ,]{6,}\s+)?\d{1,2}(?:\.\d{1,2})+\.?\s+/, "").replace(/^[\d.]+\s*/, ""));
  });
}

// Regra geral dos portões: "fechados 30 (trinta) minutos antes do início das provas"
function regraPortoes(plano) {
  const m = plano.match(/port[oõ]es[^.]{0,200}?fechad[oa]s,?(?:\s+[a-zà-ú]+,?){0,3}\s+(\d{1,3})\s*(?:\([^)]*\)\s*)?minutos\s+antes\s+do\s+in[ií]cio/i);
  return m ? +m[1] : null;
}

// Instruções gerais: só o que o candidato precisa levar —
// documentos de identificação aceitos (e os não aceitos) e a caneta permitida.
function instrucoesDeIdentificacao(plano) {
  const frases = plano.split(/(?<=[.;])\s+(?=\d{1,2}(?:\.\d{1,2})+\.?\s|[A-ZÀ-Ú])/)
    .map(f => limpar(f.replace(/^(?:[A-ZÀ-Ú–\- ,]{6,}\s+)?\d{1,2}(?:\.\d{1,2})+\.?\s+/, "").replace(/\s\d{1,2}(?:\.\d{1,2})+\.?\s.*$/, "").replace(/\s+\d+(?:\.\d+)*\.?$/, "")));
  const achar = (re, max = 900) => frases.find(f => f.length >= 30 && f.length <= max && re.test(f));
  const partes = [];
  const aceitos = achar(/(?:ser[aã]o|s[aã]o) considerados (?:como )?documentos? (?:de identidade|de identifica[cç][aã]o|oficiais)/i);
  if (aceitos) partes.push("DOCUMENTOS ACEITOS: " + aceitos.replace(/^.*?considerados (?:como )?documentos? (?:de identidade|de identifica[cç][aã]o|oficiais)( de identidade)?:?\s*/i, ""));
  const digitais = achar(/considerados (?:os seguintes )?documentos digitais/i);
  if (digitais) partes.push("DOCUMENTOS DIGITAIS: " + digitais);
  const naoAceitos = frases.filter(f => f.length <= 700 && /n[aã]o ser[aã]o aceitos?,?\s*(?:ainda,\s*)?(?:como documentos? de identi|documentos? digitais|c[oó]pias?|fotoc[oó]pias?)/i.test(f));
  if (naoAceitos.length) partes.push("NÃO SÃO ACEITOS: " + naoAceitos.slice(0, 2).map(f => f.replace(/^n[aã]o ser[aã]o aceitos?,?\s*(?:como documentos? de identidade:?\s*)?/i, "")).map(f => f.replace(/[.;]\s*$/, "")).join("; ") + ".");
  const original = frases.find(f => f.length <= 400 && /(identifica[cç][aã]o[^.]{0,80}documento (?:de identidade )?original|documento (?:de identidade )?original com foto|meio f[ií]sico)/i.test(f) && !/posse|requisitos|laudo|tempo adicional|perda|roubo|furto/i.test(f));
  if (original) partes.push("ATENÇÃO: " + original);
  const canetas = frases.filter(f => f.length <= 450 && /caneta esferogr[aá]fica/i.test(f));
  const caneta = canetas.find(f => /transparente/i.test(f)) || canetas[0];
  if (caneta) {
    const cor = caneta.match(/tinta (?:azul|preta)(?: ou (?:azul|preta))?/i);
    const transp = /transparente/i.test(caneta) ? ", de material transparente" : "";
    partes.push("CANETA: esferográfica de " + (cor ? cor[0].toLowerCase() : "tinta indicada no edital") + transp + ".");
  }
  return partes.join("\n\n");
}

if (typeof module !== "undefined") module.exports = { textoDoPdf, lerListaDoCandidato, acharCandidato, previsoesDasFases, blocosDaTabela, duracoesDasFases, composicaoDasFases, instrucoesDeIdentificacao, notasDasFases, regraPortoes, interpretarEdital, datasNoTrecho, MODELOS, detectarTipo, datasDasFases };
