// Estudar informativos: o caderno de informativos (STF, STJ, TSE) vira questões objetivas e discursivas.
// A IA (Gemini, gratuita) cria as questões a partir do julgado e corrige as discursivas; sem chave, o app gera questões simples
// a partir das teses. Revisão espaçada: o que você erra volta em 1, 3, 7, 15 e 30 dias.

const CHAVE_IDB_CADERNO = "estudo:caderno", CHAVE_IDB_JULGADOS = "estudo:julgados";
const VERSAO_LEITURA = 3;   // muda quando a leitura do caderno melhora: o app relê o caderno sozinho
const INTERVALOS = [0, 1, 3, 7, 15, 30];   // dias por "caixa" da revisão espaçada
let julgados = [], estudo = null;

const chaveEst = b => chaveUsuario("meus-concursos-estudo-" + b);
const lerEst = (b, p) => { try { return JSON.parse(localStorage.getItem(chaveEst(b))) ?? p; } catch (e) { return p; } };
const gravarEst = (b, v) => { try { localStorage.setItem(chaveEst(b), JSON.stringify(v)); } catch (e) {} };
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const embaralhar = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const semAcentoEst = s => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function idJulgado(j) { let h = 0; const s = j.titulo + j.cit; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return "j" + (h >>> 0).toString(36); }

// ---------- leitura do caderno ----------
function limparMd(s) {
  return s.replace(/^#+\s*/, "").replace(/\\([\-.()[\]_*#>+!])/g, "$1").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__/g, "").replace(/(^|\s)\*([^*\n]+)\*/g, "$1$2").replace(/\*/g, "").replace(/\s+/g, " ").trim();
}
const nomeDisciplina = s => s.trim().toLowerCase().replace(/(^|\s)(\S)/g, (a, b, c) => b + c.toUpperCase()).replace(/\b(Da|Do|De|E|Dos|Das)\b/g, w => w.toLowerCase());
const RE_CIT = /\b(STF|STJ|TSE)\.\s?[^\n]{0,420}?\(Info(?:rmativo)?\.?\s*([\d.]+)[^)\n]{0,40}\)/g;
function montarJulgado(disc, titulo, texto) {
  const cits = [...texto.matchAll(RE_CIT)];
  const trib = cits[0] ? cits[0][1] : ((texto.match(/\b(STF|STJ|TSE)\b/) || [])[1] || "");
  const corte = texto.search(/caso hipot[eé]tico|imagine a seguinte|\b(STF|STJ|TSE)\.\s/i);
  let tese = (corte > 0 ? texto.slice(0, corte) : texto.slice(0, 700)).trim();
  const suma = texto.match(/Em suma:\s*([^\n]+?)(?=\s*\b(?:STF|STJ|TSE)\.|$)/i);
  if (suma) tese = suma[1].trim();
  else if (/^caso hipot[eé]tico/i.test(tese) || /^imagine/i.test(tese)) {
    // sem enunciado antes do caso: a tese é o trecho em que o tribunal decide ("Para o STJ, …", "O STF entendeu que …")
    const i = texto.search(/\b(?:Para o|Segundo o|De acordo com o)\s+(?:STJ|STF|TSE)\b|\bo\s+(?:STJ|STF|TSE)\s*,?\s*(?:contudo|porém|no entanto|entretanto)?\s*,?\s*(?:entendeu|decidiu|concluiu|afirmou|fixou|firmou|reconheceu|reformou|deu provimento)/i);
    if (i > 0) { const resto = texto.slice(i), c = resto.search(/\b(?:STF|STJ|TSE)\.\s/); tese = (c > 0 ? resto.slice(0, c) : resto).trim().slice(0, 800); }
  }
  // título que continua na linha de baixo (em maiúsculas) não faz parte da tese
  tese = tese.replace(/^[^a-zà-ú]{12,}?(?=[A-ZÀ-Ú][a-zà-ú])/, "").trim();
  // frases iniciais em maiúsculas (resto do título) e pedacinhos logo depois delas também saem
  const frases = tese.split(/(?<=[.;])\s+/); let tirou = false;
  while (frases.length > 1) {
    const f = frases[0], letras = f.replace(/[^A-Za-zÀ-ú]/g, ""), up = f.replace(/[^A-ZÀ-Ý]/g, "").length;
    if ((letras && up / letras.length > 0.5) || (tirou && f.length < 40)) { frases.shift(); tirou = true; } else break;
  }
  tese = frases.join(" ");
  tese = tese.charAt(0).toUpperCase() + tese.slice(1);
  const j = { disc, trib, info: [...new Set(cits.map(c => c[2]))].join(", "), titulo, tese: tese.slice(0, 900), texto: texto.slice(0, 6000), cit: cits.map(c => c[0]).join(" | ") };
  j.id = idJulgado(j);
  return j;
}
// Ano de cada julgado: pelo sumário do caderno ("INFORMATIVOS 2025: STF: 1.162-1.202 …") ou, sem ele, pela data do julgamento
function faixasDoSumario(texto) {
  const faixas = [], ini = texto.slice(0, 5000);
  const blocos = ini.split(/INFORMATIVOS\s+(?=\d{4})/i).slice(1);
  for (const b of blocos) {
    const ano = (b.match(/^(\d{4})/) || [])[1]; if (!ano) continue;
    for (const m of b.slice(0, 400).matchAll(/\b(STF|STJ|TSE)\b[^\d]{0,6}([\d.]+)\s*[-–a]\s*([\d.]+)/g))
      faixas.push({ ano, trib: m[1], de: +m[2].replace(/\./g, ""), ate: +m[3].replace(/\./g, "") });
  }
  return faixas;
}
function anoDoJulgado(j, faixas) {
  const n = +String(j.info || "").split(",")[0].replace(/\./g, "");
  const f = n && faixas.find(x => x.trib === j.trib && n >= x.de && n <= x.ate);
  if (f) return f.ano;
  const datas = [...(j.cit + " " + j.texto).matchAll(/julgad[oa]s?\s+em\s*\d{1,2}\/\d{1,2}\/(\d{4})/gi)].map(m => m[1]);
  return datas[0] || "";
}
function lerCaderno(textoBruto) {
  const faixas = faixasDoSumario(textoBruto);
  const r = lerCadernoBase(textoBruto);
  r.forEach(j => { j.ano = anoDoJulgado(j, faixas); });
  return r;
}
function lerCadernoBase(textoBruto) {
  const linhas = textoBruto.replace(/\r/g, "").split("\n");
  const out = []; let disc = "Geral", atual = null;
  const reDisc = /^\|?\s*\**\s*([IVXL]{1,5})\.\s+((?:DIREITO|PROCESSO|EXECU|FORMA|DIREITOS)[A-ZÁÉÍÓÚÂÊÔÃÕÇ ]+?)\s*\**\s*\|/;
  const reDisc2 = /^([IVXL]{1,5})\.\s+((?:DIREITO|PROCESSO|EXECU|FORMA|DIREITOS)[A-ZÁÉÍÓÚÂÊÔÃÕÇ ]+)$/;
  const fechar = () => { if (atual) { out.push(montarJulgado(atual.disc, atual.titulo, atual.linhas.join("\n"))); atual = null; } };
  for (const l0 of linhas) {
    const l = l0.trim(); if (!l) continue;
    const m = l.match(reDisc) || limparMd(l).match(reDisc2);
    if (m) { fechar(); disc = nomeDisciplina(m[2]); continue; }
    const semH = l.replace(/^#+\s*/, "");
    const tb = semH.match(/^\*\*(.{20,}?)\*\*/);
    if (tb) {
      const t = limparMd(tb[0]), letras = t.replace(/[^A-Za-zÀ-ú]/g, ""), up = t.replace(/[^A-ZÀ-Ý]/g, "").length;
      if (letras.length > 15 && up / letras.length > 0.7) {
        // a ementa (título em maiúsculas) pode ter trechos em itálico no meio ("*DIES A QUO*", "*ACTIO NATA*"): vale a linha inteira
        // até onde começa o texto corrido (4+ palavras seguidas com minúsculas)
        const pal = limparMd(semH).split(" ");
        let k = pal.findIndex((w, i) => i > 3 && pal.slice(i, i + 4).length === 4 && pal.slice(i, i + 4).every(x => /[a-zà-ú]/.test(x)));
        if (k < 0) k = pal.length;
        // a primeira palavra do texto ("A doação…", "O STJ…", "É possível…") não é da ementa
        while (k > 1 && k < pal.length && /[.;:)!?]$/.test(pal[k - 2]) && /^[A-ZÀ-Ú][a-zà-ú]{0,12}$|^[AOÉE]$/.test(pal[k - 1])) k--;
        fechar(); atual = { disc, titulo: pal.slice(0, k).join(" "), linhas: [pal.slice(k).join(" ")].filter(Boolean), ementaAberta: k === pal.length };
        continue;
      }
    }
    if (atual) {
      // ementa que continua na linha seguinte, também em maiúsculas
      const lm = limparMd(l), le = lm.replace(/[^A-Za-zÀ-ú]/g, ""), ue = lm.replace(/[^A-ZÀ-Ý]/g, "").length;
      if (atual.ementaAberta && !atual.linhas.length && le.length > 3 && ue / le.length > 0.7 && lm.length < 400) { atual.titulo += " " + lm; continue; }
      atual.ementaAberta = false;
      atual.linhas.push(lm);
    }
  }
  fechar();
  let r = out.filter(j => j.trib && j.texto.length > 150);
  if (r.length >= 10) return r;
  // sem negrito (PDF / texto simples): cada julgado termina na citação "(Info N)"
  r = []; disc = "Geral"; let buf = [];
  for (const l0 of linhas) {
    const l = limparMd(l0); if (!l) continue;
    const m = l.match(reDisc2); if (m) { disc = nomeDisciplina(m[2]); buf = []; continue; }
    buf.push(l);
    if (/\((?:Info(?:rmativo)?\.?\s*[\d.]+)\)\s*\.?\s*$/.test(l)) {
      const txt = buf.join("\n"); buf = [];
      const titulo = txt.split("\n")[0].slice(0, 220);
      const j = montarJulgado(disc, titulo, txt); if (j.trib && txt.length > 150) r.push(j);
    }
  }
  return r;
}
async function carregarJulgados() {
  if (julgados.length) return julgados;
  try { julgados = (await arq("ler", CHAVE_IDB_JULGADOS)) || []; } catch (e) { julgados = []; }
  // caderno lido por versão anterior da leitura: relê
  const cad0 = lerEst("caderno", {});
  if (julgados.length && cad0.versao !== VERSAO_LEITURA) {
    const cad = cad0;
    const blob = cad.fonte === "arquivo" ? await arq("ler", CHAVE_IDB_CADERNO).catch(() => null) : null;
    if (blob && !/pdf/i.test(blob.type || "")) { await guardarCaderno(await blob.text(), { fonte: "arquivo", nome: cad.nome }); }
    else { gravarEst("caderno", { ...cad, modificado: "" }); cadernoDriveChecado = false; }
  }
  return julgados;
}
// grupos de ano para os filtros: anos com 10+ julgados aparecem sozinhos; os demais vão para "Anteriores"; sem data, "Sem data"
let gruposAnoCache = null;
function grupoAno(j) {
  if (!gruposAnoCache || gruposAnoCache.n !== julgados.length) {
    const c = {}; julgados.forEach(x => { if (x.ano) c[x.ano] = (c[x.ano] || 0) + 1; });
    gruposAnoCache = { n: julgados.length, fortes: new Set(Object.keys(c).filter(a => c[a] >= 10)) };
  }
  return !j.ano ? "Sem data" : gruposAnoCache.fortes.has(j.ano) ? j.ano : "Anteriores";
}
const anosDoCaderno = () => { const g = new Set(julgados.map(grupoAno)); return [...[...g].filter(a => /^\d{4}$/.test(a)).sort().reverse(), ...["Anteriores", "Sem data"].filter(a => g.has(a))]; };
async function guardarCaderno(texto, info) {
  const js = lerCaderno(texto);
  if (!js.length) return 0;
  await arq("gravar", CHAVE_IDB_JULGADOS, js);
  julgados = js;
  gravarEst("caderno", { ...info, quando: new Date().toISOString(), total: js.length, versao: VERSAO_LEITURA });
  return js.length;
}
// Caderno do Drive do projeto (lido pelo Apps Script). Só baixa de novo quando o documento muda.
let cadernoDriveChecado = false;
async function atualizarDoDrive(forcar) {
  const cad = lerEst("caderno", null);
  if (cad && cad.fonte === "arquivo" && !forcar) return;
  if (!usuarioAtual || !usuarioAtual.sessao) return;
  const st = () => $("estCadStatus");
  if (st()) st().textContent = "Conferindo o caderno no Drive…";
  try {
    const r = await postScript({ acao: "caderno", sessao: usuarioAtual.sessao, desde: (!forcar && cad && cad.fonte === "drive") ? cad.modificado : "" });
    if (!r.ok) { if (st()) st().textContent = r.erro && /desconhecida/i.test(r.erro) ? "O Apps Script ainda não tem a leitura do caderno: atualize o script (veja CONFIGURAR-LOGIN.md)." : (r.erro || "Não foi possível ler o caderno do Drive."); return; }
    cadernoDriveChecado = true;
    if (!r.naoMudou) {
      const n = await guardarCaderno(r.texto, { fonte: "drive", nome: r.nome, modificado: r.modificado });
      if (!n && st()) { st().textContent = "O caderno do Drive foi lido, mas não encontrei julgados nele."; return; }
    }
    if (estudoAba === "config" || !estudo) desenharEstudo(estudoAba === "config" ? "config" : undefined);
  } catch (e) { if (st()) st().textContent = "Sem conexão com o servidor para buscar o caderno do Drive."; }
}
async function juntarCaderno(f) {
  const st = $("estCadStatus"); st.textContent = "Lendo o caderno…";
  try {
    let texto;
    if (/pdf/i.test(f.type) || /\.pdf$/i.test(f.name)) texto = await textoDoPdf(f, 2000, { aoProgredir: (p, t) => { st.textContent = `Lendo o PDF… página ${p} de ${t}`; } });
    else texto = await f.text();
    const n = await guardarCaderno(texto, { fonte: "arquivo", nome: f.name });
    if (!n) { st.textContent = "Não encontrei julgados nesse arquivo. Use o caderno em .md, .txt ou PDF com as citações \"(Info nº)\"."; return; }
    await arq("gravar", CHAVE_IDB_CADERNO, f).catch(() => {});
    desenharEstudo("config");
    $("estCadStatus").textContent = `Pronto: ${n} julgados lidos de ${f.name}. Agora é só ir em Praticar.`;
  } catch (e) { st.textContent = "Não consegui ler esse arquivo."; }
}

// ---------- Gemini (pelo Apps Script: a chave fica no servidor) ----------
let iaIndisponivel = "";   // motivo, quando o servidor avisa que a IA não está configurada
function iaLigada() { return !!(usuarioAtual && usuarioAtual.sessao) && !iaIndisponivel; }
async function gemini(prompt, opc) {
  // limite de espera: sem resposta em 90 s, o app segue com a questão simples; opc.partes = imagens/PDF anexos
  const o = opc || {};
  const r = await Promise.race([postScript({ acao: "gemini", sessao: usuarioAtual.sessao, prompt, ...(o.partes ? { partes: o.partes } : {}), ...(o.temperatura != null ? { temperatura: o.temperatura } : {}) }),
    new Promise((_, falha) => setTimeout(() => falha(new Error("a IA demorou demais para responder")), o.ms || 90000))]);
  if (!r.ok) {
    if (r.semChave || /desconhecida/i.test(r.erro || "")) iaIndisponivel = r.semChave ? r.erro : "O Apps Script ainda não tem a IA: atualize o script (veja CONFIGURAR-LOGIN.md).";
    throw new Error(r.erro || "falha na IA");
  }
  try { return JSON.parse(String(r.texto).replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch (e) { throw new Error("resposta inválida da IA"); }
}
const contextoJulgado = j => `JULGADO (${j.trib}${j.info ? ", Informativo " + j.info : ""} – ${j.disc}):\nTÍTULO: ${j.titulo}\nTEXTO:\n${j.texto.slice(0, 4500)}`;

// ---------- geração de questões ----------
const TROCAS = [["inconstitucional", "constitucional"], ["é constitucional", "é inconstitucional"], ["não exige", "exige"], ["exige", "dispensa"], ["é válida", "é inválida"], ["é válido", "é inválido"],
  ["é possível", "não é possível"], ["é cabível", "não é cabível"], ["é devida", "não é devida"], ["é devido", "não é devido"], ["é lícita", "é ilícita"], ["é legítima", "é ilegítima"],
  ["objetiva", "subjetiva"], ["absoluta", "relativa"], ["obrigatória", "facultativa"], ["competência da Justiça Federal", "competência da Justiça Estadual"], ["incide", "não incide"],
  ["admite", "não admite"], ["configura", "não configura"], ["pode", "não pode"], ["deve", "não deve"], ["é necessária", "é dispensável"], ["é necessário", "é dispensável"]];
function alterarTese(t) {
  for (const [a, b] of embaralhar(TROCAS.slice())) {
    for (const [de, para] of [[b, a], [a, b]]) {
      const re = new RegExp(`(^|[^A-Za-zÀ-ú])${de.replace(/ /g, "\\s+")}(?![A-Za-zÀ-ú])`, "i");
      if (re.test(t)) { const r = t.replace(re, (m, p1) => p1 + para); return r.charAt(0).toUpperCase() + r.slice(1); }
    }
  }
  return null;
}
function questaoLocal(j, modo) {
  if (modo === "ce") {
    const falsa = Math.random() < 0.5 ? alterarTese(j.tese) : null;
    return { tipo: "ce", assertiva: falsa || j.tese, gabarito: falsa ? "E" : "C", comentario: falsa ? "A assertiva inverteu a conclusão do julgado. O entendimento correto é: " + j.tese : "A assertiva reproduz o entendimento do julgado.", ia: false };
  }
  if (modo === "me") {
    // teses curtas (até ~2 frases) para as alternativas ficarem do tamanho de prova
    const curta = t => { const f = (t || "").match(/[^.;]+[.;]/g) || [t || ""]; let o = ""; for (const x of f) { if ((o + x).length > 320) break; o += x; } return (o || t || "").trim(); };
    const boa = t => t && t.length >= 60 && /\b(é|são|não|deve|pode|exige|cabe|incide|configura|admite)\b/i.test(t) && t.replace(/[^A-ZÀ-Ý]/g, "").length / Math.max(1, t.replace(/[^A-Za-zÀ-ú]/g, "").length) < 0.3;
    const certa = curta(j.tese);
    const outras = embaralhar(julgados.filter(o => o.id !== j.id && o.disc === j.disc && boa(o.tese))).map(o => alterarTese(curta(o.tese))).filter(Boolean).slice(0, 4);
    for (let n = 0; outras.length < 4 && n < 200; n++) { const o = julgados[Math.floor(Math.random() * julgados.length)]; const a = boa(o.tese) && alterarTese(curta(o.tese)); if (a && !outras.includes(a)) outras.push(a); }
    const alts = embaralhar([certa, ...outras]); const g = alts.indexOf(certa);
    return { tipo: "me", enunciado: `De acordo com a jurisprudência do ${j.trib} sobre ${j.disc}, assinale a alternativa correta.`, alternativas: alts, gabarito: "ABCDE"[g], comentario: "Correta: " + j.tese + " As demais alternativas inverteram a conclusão de outros julgados.", ia: false };
  }
  const caso = (j.texto.match(/caso hipot[eé]tico:\s*([\s\S]+?)(?=\s(?:O|A)\s(?:STJ|STF|TSE|Tribunal|juiz)\b[^.]{0,60}(?:entendeu|decidiu|reformou|afirmou|concluiu|reconheceu)|Em suma:|$)/i) || [])[1];
  return { tipo: "disc", enunciado: (caso ? caso.trim() + "\n\n" : "") + `Com base na jurisprudência do ${j.trib}, responda de forma fundamentada: ${j.titulo.toLowerCase().replace(/^./, c => c.toUpperCase())}`,
    espelho: [{ item: j.tese, pontos: 10 }], resposta_modelo: j.tese, linhas: 20, ia: false };
}
async function gerarQuestao(j, modo) {
  if (!iaLigada()) return questaoLocal(j, modo);
  const base = contextoJulgado(j) + "\n\nVocê é examinador de concursos da magistratura e do Ministério Público. Use SOMENTE o entendimento do julgado acima. Escreva em português do Brasil, com rigor técnico e nível de prova de juiz.";
  let p;
  if (modo === "ce") p = base + `\nCrie UMA assertiva no estilo Cebraspe (certo ou errado) sobre o entendimento central do julgado. Sorteie se será CERTA ou ERRADA (50% cada); se errada, altere um detalhe relevante (conclusão, requisito, exceção, competência, prazo), como fazem as bancas, sem ser óbvio. Responda em JSON: {"assertiva": string, "gabarito": "C" ou "E", "comentario": string explicando o porquê com base no julgado, em até 5 frases}`;
  else if (modo === "me") p = base + `\nCrie UMA questão de múltipla escolha no estilo FGV, com enunciado (pode trazer um caso concreto curto) e 5 alternativas (A a E), apenas uma correta; as erradas devem ser plausíveis (trocas de requisito, exceção, entendimento superado). Responda em JSON: {"enunciado": string, "alternativas": [5 strings sem a letra], "gabarito": "A"|"B"|"C"|"D"|"E", "comentario": string explicando a correta e por que cada errada está errada}`;
  else p = base + `\nCrie UMA questão discursiva: um caso concreto inédito (não copie o caso hipotético do texto; mude nomes e detalhes) seguido de um comando claro (o que o candidato deve responder). Inclua o espelho de correção com 3 a 5 itens que somam 10 pontos e uma resposta-modelo de até 25 linhas. Responda em JSON: {"enunciado": string, "espelho": [{"item": string, "pontos": number}], "resposta_modelo": string, "linhas": number (linhas sugeridas, entre 10 e 30)}`;
  const q = await gemini(p);
  if (modo === "ce") { q.gabarito = /^e/i.test(q.gabarito) ? "E" : "C"; return { tipo: "ce", ...q, ia: true }; }
  if (modo === "me") { q.gabarito = String(q.gabarito || "A").trim().charAt(0).toUpperCase(); q.alternativas = (q.alternativas || []).map(a => String(a).replace(/^\s*\(?[A-E][).]\s*/, "")); return { tipo: "me", ...q, ia: true }; }
  return { tipo: "disc", ...q, ia: true };
}
async function corrigirDiscursiva(j, q, resposta) {
  const p = contextoJulgado(j) + `\n\nQUESTÃO:\n${q.enunciado}\n\nESPELHO DE CORREÇÃO:\n${(q.espelho || []).map(e => `- ${e.item} (${e.pontos} pts)`).join("\n")}\n\nRESPOSTA DO CANDIDATO:\n${resposta}\n\nVocê é examinador de concurso da magistratura. Corrija a resposta com rigor e justiça, item por item do espelho, considerando também técnica jurídica, fundamentação e clareza. Responda em JSON: {"nota": number de 0 a 10 com uma casa decimal, "itens": [{"item": string, "atendido": "sim"|"parcial"|"não", "comentario": string}], "pontos_fortes": [string], "melhorias": [string], "feedback": string curto e motivador}`;
  return gemini(p);
}

// ---------- revisão espaçada e desempenho ----------
function registrar(j, nota) {   // nota: 1 acerto, 0.5 parcial, 0 erro
  const prog = lerEst("prog", {}), p = prog[j.id] || { caixa: 0, acertos: 0, erros: 0 };
  p.caixa = nota >= 1 ? Math.min(5, p.caixa + 1) : nota > 0 ? Math.max(1, p.caixa) : 1;
  if (nota >= 1) p.acertos++; else if (nota === 0) p.erros++;
  const d = new Date(); d.setDate(d.getDate() + INTERVALOS[p.caixa]); p.prox = d.toISOString().slice(0, 10); p.ultimo = hojeISO(); p.ultNota = nota;
  prog[j.id] = p; gravarEst("prog", prog);
  const hist = lerEst("hist", []); hist.push({ d: hojeISO(), disc: j.disc, trib: j.trib, modo: estudo && estudo.modo, nota, t: Date.now() }); gravarEst("hist", hist.slice(-3000));
}
function escolherJulgados(filtro, n) {
  const prog = lerEst("prog", {}), hoje = hojeISO();
  const base = julgados.filter(j => (!filtro.discs.length || filtro.discs.includes(j.disc)) && filtro.tribs.includes(j.trib) && (!(filtro.anos || []).length || filtro.anos.includes(grupoAno(j))) && (!filtro.soErros || (prog[j.id] && prog[j.id].erros && prog[j.id].caixa <= 1)));
  const vencidos = embaralhar(base.filter(j => prog[j.id] && prog[j.id].prox && prog[j.id].prox <= hoje));
  const novos = embaralhar(base.filter(j => !prog[j.id] || !prog[j.id].prox));   // nunca praticados (só lidos em "Revisar" também contam)
  const resto = embaralhar(base.filter(j => prog[j.id] && prog[j.id].prox > hoje)).sort((a, b) => prog[a.id].caixa - prog[b.id].caixa);
  return [...vencidos, ...novos, ...resto].slice(0, n);
}

// ---------- tela ----------
const MODOS = { ce: "Certo ou errado (estilo Cebraspe)", me: "Múltipla escolha (estilo FGV)", disc: "Discursiva (caso concreto)" };
function abrirEstudo() {
  carregarJulgados().then(() => { estudo = null; desenharEstudo(); if (!cadernoDriveChecado) atualizarDoDrive(); });
  const d = $("dlgEstudo"); if (!d.open) d.showModal();
}
function cabecalhoEstudo(aba) {
  const area = aba === "provas" ? "provas" : aba === "pecas" ? "pecas" : aba.startsWith("lei") ? "lei" : "info";
  if (area === "lei") return `<div class="dlg-head"><div style="flex:1;min-width:0"><h2>Lei seca</h2><p class="sub">Texto vigente das leis do Planalto · leitura, revisão e questões da letra da lei pela IA Gemini</p></div><button type="button" class="close" data-close aria-label="Fechar">×</button></div>
    <div class="est-abas">${[["lei-leis", "Minhas leis"], ["lei-ler", "Ler e revisar"], ["lei-praticar", "Praticar"], ["lei-hist", "Meu histórico"]].map(([k, n]) => `<button type="button" class="${aba === k ? "on" : ""}" data-estaba="${k}">${n}</button>`).join("")}</div>`;
  const sub = area === "info" ? (julgados.length ? `${julgados.length} julgados do caderno · questões e correções pela IA Gemini` : "Carregando o caderno de informativos…")
    : area === "provas" ? "Provas objetivas e subjetivas da pasta Provas Jurídicas · questões e correções pela IA Gemini" : "Peças práticas da pasta Provas Jurídicas · estrutura, casos e correção pela IA Gemini";
  // a área (informativos, provas, peças) é escolhida nos cartões da página Estudar; o modal mostra só a área aberta
  const titulo = area === "info" ? "Informativos" : area === "provas" ? "Provas anteriores" : "Peças práticas";
  return `<div class="dlg-head"><div style="flex:1;min-width:0"><h2>${titulo}</h2><p class="sub">${sub}</p></div><button type="button" class="close" data-close aria-label="Fechar">×</button></div>
    ${area === "info" ? `<div class="est-abas">${[["praticar", "Praticar"], ["simulado", "Gerar simulado"], ["revisar", "Revisar julgados"], ["erros", "Caderno de erros"], ["desempenho", "Meu histórico"], ["config", "Caderno e IA"]].map(([k, n]) => `<button type="button" class="${aba === k ? "on" : ""}" data-estaba="${k}">${n}</button>`).join("")}</div>` : ""}`;
}
// Tarefas que terminam por trás (sincronização, IA, leitura de editais) não redesenham a tela enquanto o usuário
// está com um seletor aberto ou colando um texto: senão o seletor fecha sozinho. O redesenho fica para quando ele sair do campo.
// (redesenhos pedidos pelo próprio usuário acontecem dentro de um evento, window.event, e seguem normalmente)
let redesenhoAdiado = null;
function usuarioNoCampo() { const a = document.activeElement; return !!a && !!a.closest && !!a.closest("#estudoConteudo") && (a.tagName === "SELECT" || a.isContentEditable); }
document.addEventListener("focusout", e => { if (redesenhoAdiado && e.target.closest && e.target.closest("#estudoConteudo")) { const a = redesenhoAdiado; redesenhoAdiado = null; setTimeout(() => { if (!usuarioNoCampo()) desenharEstudo(a); else redesenhoAdiado = a; }, 0); } });
function desenharEstudo(aba) {
  if (!window.event && usuarioNoCampo()) { redesenhoAdiado = aba || estudoAba; return; }
  aba = aba || (julgados.length ? "praticar" : "config");
  // dentro da Lei seca, as telas compartilhadas (sessão de questões, histórico) continuam na área da lei
  if (String(estudoAba).startsWith("lei") && { praticar: "lei-praticar", desempenho: "lei-hist" }[aba]) aba = { praticar: "lei-praticar", desempenho: "lei-hist" }[aba];
  // na aba do simulado, os filtros e o progresso redesenham a própria aba (sem pular para o treino)
  if (aba === "praticar" && estudoAba === "simulado" && !estudo && !(typeof cartao !== "undefined" && cartao) && !(typeof papelInfo !== "undefined" && papelInfo.disc)) aba = "simulado";
  if (aba.startsWith("plano")) { estudoAba = aba; $("estudoConteudo").innerHTML = htmlPlanoModal(aba); return; }
  if (aba.startsWith("lei")) { estudoAba = aba; $("estudoConteudo").innerHTML = cabecalhoEstudo(aba) + `<div class="est-corpo">${htmlLei(aba)}</div>`; return; }
  estudoAba = aba;
  let corpo = "";
  if (aba === "provas") corpo = htmlProvas();
  else if (aba === "pecas") corpo = htmlPecas();
  else if (aba === "config") corpo = htmlConfigEstudo();
  else if (!julgados.length) corpo = `<p class="note">Primeiro junte o caderno na aba <b>Caderno e IA</b>.</p>`;
  else if (aba === "simulado") corpo = htmlAbaSimulado();
  else if (aba === "praticar") corpo = typeof cartao !== "undefined" && cartao && cartao.info ? htmlCartao() : typeof papelInfo !== "undefined" && papelInfo.disc ? htmlDiscPapel() : estudo ? htmlSessao() : htmlPreparar();
  else if (aba === "revisar") corpo = htmlRevisar();
  else if (aba === "erros") corpo = htmlErros();
  else corpo = typeof htmlHistInfo === "function" ? htmlHistInfo() : htmlDesempenho();
  $("estudoConteudo").innerHTML = cabecalhoEstudo(aba) + `<div class="est-corpo">${corpo}</div>`;
}
let estudoAba = "praticar";
function htmlConfigEstudo() {
  const cad = lerEst("caderno", null), doDrive = !cad || cad.fonte !== "arquivo";
  const dt = cad && new Date(cad.modificado || cad.quando), quando = dt && !isNaN(dt) ? dt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
  return `<div class="est-sec"><h4>Caderno de informativos</h4>
      <p class="note">${doDrive ? `Usando o caderno do Drive do projeto${cad ? ` (<b>${esc(cad.nome || "")}</b>${quando ? ", atualizado em " + esc(quando) : ""})` : ""}. Quando o documento for editado no Drive, o app baixa a versão nova sozinho.` : `Usando um arquivo seu: <b>${esc(cad.nome)}</b> (juntado em ${esc(quando)}).`}</p>
      <div class="auto-box">
        ${doDrive ? `<button type="button" id="estAtualizarDrive">Atualizar do Drive agora</button>` : `<button type="button" id="estVoltarDrive">Voltar ao caderno do Drive</button>`}
        <button type="button" id="estBtnCad">${typeof CLIP_SVG !== "undefined" ? CLIP_SVG : ""} Usar outro arquivo (opcional)</button>
        <input type="file" id="estArqCad" accept=".md,.txt,.markdown,text/plain,text/markdown,application/pdf,.pdf" hidden>
        <span class="note" id="estCadStatus">${cad ? `${cad.total} julgados prontos para estudar.` : "Buscando o caderno no Drive…"}</span></div>
      ${julgados.length ? `<p class="note">${Object.entries(julgados.reduce((a, j) => (a[j.disc] = (a[j.disc] || 0) + 1, a), {})).map(([d, n]) => `${esc(d)} (${n})`).join(" · ")}</p>` : ""}</div>
    <div class="est-sec"><h4>Inteligência artificial</h4>
      <p class="note">${iaIndisponivel ? esc(iaIndisponivel) : "As questões e as correções das discursivas são feitas pela IA Gemini, do Google, a partir de cada julgado do caderno."}</p></div>`;
}
function disciplinasDoConcurso(x) {
  const txt = semAcentoEst((x.fases || []).map(f => f.objetivas && (f.objetivas.blocos || []).map(b => b.disciplinas).join(" ")).join(" "));
  const discs = [...new Set(julgados.map(j => j.disc))];
  return discs.filter(d => { const n = semAcentoEst(d).replace(/^direito (do |da |de )?/, ""); return n && txt.includes(n.split(" ")[0]); });
}
function htmlPreparar() {
  const filtro = lerEst("filtro", { modo: "ce", discs: [], tribs: ["STF", "STJ", "TSE"], n: 10 });
  const discs = [...new Set(julgados.map(j => j.disc))];
  const prog = lerEst("prog", {}), hoje = hojeISO();
  const vencidos = julgados.filter(j => prog[j.id] && prog[j.id].prox <= hoje).length;
  const concursos = itens.filter(x => andamento(x).ativo && disciplinasDoConcurso(x).length);
  return `${typeof htmlImpressasInfo === "function" ? htmlImpressasInfo() : ""}${vencidos ? `<p class="est-aviso">${vencidos} julgado(s) para revisar hoje — eles entram primeiro na sessão.</p>` : ""}
    <div class="est-sec"><h4>Modalidade</h4><div class="est-opts">${Object.entries(MODOS).map(([k, n]) => `<button type="button" class="opt${filtro.modo === k ? " on" : ""}" data-estmodo="${k}">${n}</button>`).join("")}</div></div>
    ${htmlFiltrosJulgados(filtro)}
    <div class="est-sec"><h4>Quantidade de questões</h4><div class="est-chips">${[5, 10, 20, 30].map(n => `<button type="button" class="chip-sel${filtro.n === n ? " on" : ""}" data-estn="${n}">${n}</button>`).join("")}</div></div>
    <p class="note">${iaLigada() ? "As questões e as correções das discursivas são feitas pela IA Gemini, do Google, a partir do julgado." : esc(iaIndisponivel || "Sem conexão com a IA: as questões serão simples, feitas a partir das teses.")}</p>
    <div class="actions"><button type="button" class="primary" id="estComecar">Começar</button></div>
    <p class="note">Para uma prova completa no padrão da banca (no app ou no papel), use a aba <b>Gerar simulado</b>.</p>`;
}
// filtros de ano, tribunal e disciplina (valem para o treino e para o simulado)
function htmlFiltrosJulgados(filtro) {
  const discs = [...new Set(julgados.map(j => j.disc))];
  const concursos = itens.filter(x => andamento(x).ativo && disciplinasDoConcurso(x).length);
  return `    ${anosDoCaderno().length > 1 ? `<div class="est-sec"><h4>Ano <span class="note">${(filtro.anos || []).length ? "" : "(todos)"}</span></h4><div class="est-chips">${anosDoCaderno().map(a => `<button type="button" class="chip-sel${(filtro.anos || []).includes(a) ? " on" : ""}" data-estano="${a}">${a} (${julgados.filter(j => grupoAno(j) === a).length})</button>`).join("")}</div></div>` : ""}
    <div class="est-sec"><h4>Tribunais</h4><div class="est-chips">${["STF", "STJ", "TSE"].map(t => `<button type="button" class="chip-sel${filtro.tribs.includes(t) ? " on" : ""}" data-esttrib="${t}">${t} (${julgados.filter(j => j.trib === t).length})</button>`).join("")}</div></div>
    <div class="est-sec"><h4>Disciplinas <span class="note">${filtro.discs.length ? "" : "(todas)"}</span></h4>
      ${concursos.length ? `<label class="est-conc">Focar nas matérias do concurso<select id="estConcurso"><option value="">—</option>${concursos.map(x => `<option value="${esc(x.id)}">${esc(x.nome)}</option>`).join("")}</select></label>` : ""}
      <div class="est-chips">${discs.map(d => { const n = julgados.filter(j => j.disc === d && filtro.tribs.includes(j.trib) && (!(filtro.anos || []).length || filtro.anos.includes(grupoAno(j)))).length; return `<button type="button" class="chip-sel${filtro.discs.includes(d) ? " on" : ""}" data-estdisc="${esc(d)}">${esc(d)} <span class="ct">${n}</span></button>`; }).join("")}</div></div>
    <p class="note">Julgados que entram na sessão com esses filtros: <b>${julgados.filter(j => (!filtro.discs.length || filtro.discs.includes(j.disc)) && filtro.tribs.includes(j.trib) && (!(filtro.anos || []).length || filtro.anos.includes(grupoAno(j)))).length}</b></p>`;
}
// aba "Gerar simulado": os mesmos filtros + a configuração do simulado
function htmlAbaSimulado() {
  const filtro = lerEst("filtro", { modo: "ce", discs: [], tribs: ["STF", "STJ", "TSE"], n: 10 });
  return `${typeof htmlImpressasInfo === "function" ? htmlImpressasInfo() : ""}<p class="note">Escolha os julgados que entram no simulado e, embaixo, o cargo, a banca e o formato.</p>
    ${htmlFiltrosJulgados(filtro)}
    ${typeof htmlSimuladoCfg === "function" ? htmlSimuladoCfg() : ""}`;
}
function iniciarSessao(soErros) {
  const filtro = lerEst("filtro", { modo: "ce", discs: [], tribs: ["STF", "STJ", "TSE"], n: 10 });
  const lista = escolherJulgados({ ...filtro, soErros }, soErros ? 30 : filtro.n);
  if (!lista.length) { toast("Nenhum julgado com esses filtros."); return; }
  registrarSessaoInfo();
  estudo = { modo: filtro.modo, lista, i: 0, qs: {}, resp: {}, notas: [] };
  prepararQuestao(0);
  desenharEstudo("praticar");
}
function prepararQuestao(i) {
  if (!estudo || i >= estudo.lista.length || estudo.qs[i]) return;
  const j = estudo.lista[i];
  estudo.qs[i] = (estudo.gerador ? estudo.gerador(j) : gerarQuestao(j, estudo.modo)).catch(e => { const q = questaoLocal(j, estudo.modo); q.aviso = "A IA não respondeu (" + e.message + "); questão simples gerada pelo app."; return q; });
  estudo.qs[i].inicio = Date.now();
  const s0 = estudo;
  estudo.qs[i].then(q => {
    if (estudo !== s0) return;
    estudo.qs[i].pronta = q;
    if (estudo.i === i && (estudoAba === "praticar" || estudoAba === "lei-praticar")) desenharEstudo("praticar");
    if (i <= estudo.i) prepararQuestao(i + 1);   // prepara só a próxima, uma de cada vez (o plano gratuito limita as consultas por minuto)
  });
}
function htmlSessao() {
  const s = estudo, i = s.i;
  if (i >= s.lista.length) {
    if (typeof registrarSessaoInfo === "function") registrarSessaoInfo();
    const tot = s.notas.reduce((a, b) => a + b, 0);
    return `<div class="est-fim"><div class="vb-n">${Math.round(tot / s.notas.length * 100)}%</div><p>${s.notas.filter(n => n >= 1).length} acerto(s), ${s.notas.filter(n => n > 0 && n < 1).length} parcial(is) e ${s.notas.filter(n => n === 0).length} erro(s) em ${s.notas.length} questões.</p>
      <p class="note">Os julgados que você errou voltam amanhã; os que acertou, em alguns dias.</p>
      <div class="actions" style="justify-content:center"><button type="button" id="estNova" class="primary">Nova sessão</button></div></div>`;
  }
  const j = s.lista[i], q = s.qs[i] && s.qs[i].pronta, r = s.resp[i];
  const topo = (s.simulado ? `<p class="est-sub" style="margin:0">${esc(s.simulado)}</p>` : "") + `<div class="est-prog"><span>Questão ${i + 1} de ${s.lista.length}</span><span class="chip">${esc(j.trib)}${j.info ? " · Info " + esc(j.info.split(",")[0]) : ""}</span><span class="chip">${esc(j.disc)}</span></div>`;
  if (!q) {
    const seg = s.qs[i] && s.qs[i].inicio ? Math.round((Date.now() - s.qs[i].inicio) / 1000) : 0;
    clearTimeout(htmlSessao.t); htmlSessao.t = setTimeout(() => { if (estudo === s && s.i === i && !(s.qs[i] && s.qs[i].pronta) && (estudoAba === "praticar" || estudoAba === "lei-praticar")) desenharEstudo("praticar"); }, 1000);
    return topo + `<p class="note est-gerando">Criando a questão${iaLigada() ? " com a IA Gemini" : ""}… ${seg}s${seg > 15 ? "<br>A IA gratuita às vezes demora até 1 minuto; se passar disso, o app segue com uma questão simples." : ""}</p>`;
  }
  let h = topo + (q.aviso ? `<p class="note">${esc(q.aviso)}</p>` : "");
  if (q.tipo === "ce") {
    h += `<p class="est-enun">${esc(q.assertiva)}</p>`;
    if (!r) h += `<div class="est-opts"><button type="button" class="opt" data-estresp="C">Certo</button><button type="button" class="opt" data-estresp="E">Errado</button></div>`;
    else h += `<p class="est-res ${r.nota ? "ok" : "bad"}">${r.nota ? "Você acertou" : "Você errou"}: gabarito <b>${q.gabarito === "C" ? "CERTO" : "ERRADO"}</b>.</p><p class="pre">${esc(q.comentario || "")}</p>`;
  } else if (q.tipo === "me") {
    h += `<p class="est-enun pre">${esc(q.enunciado)}</p><div class="est-alts">${q.alternativas.map((a, k) => { const L = "ABCDE"[k]; const cls = r ? (L === q.gabarito ? "ok" : (L === r.marcada ? "bad" : "")) : ""; return `<button type="button" class="est-alt ${cls}" data-estresp="${L}" ${r ? "disabled" : ""}><b>${L}</b> ${esc(a)}</button>`; }).join("")}</div>`;
    if (r) h += `<p class="est-res ${r.nota ? "ok" : "bad"}">${r.nota ? "Você acertou" : "Você errou"}: gabarito <b>${q.gabarito}</b>.</p><p class="pre">${esc(q.comentario || "")}</p>`;
  } else {
    h += `<p class="est-enun pre">${esc(q.enunciado)}</p>`;
    if (!r || r.corrigindo) h += `<label>Sua resposta <span class="note" id="estLinhas">(até ${q.linhas || 20} linhas)</span><textarea id="estTexto" rows="12" ${r && r.corrigindo ? "disabled" : ""}>${esc(r ? r.texto : (s.rascunho || ""))}</textarea></label>
      <div class="actions">${r && r.corrigindo ? `<span class="note">Corrigindo…</span>` : `<button type="button" id="estVerEspelho">Ver espelho sem corrigir</button><button type="button" class="primary" id="estCorrigir">${iaLigada() && q.ia ? "Enviar para correção" : "Comparar com o espelho"}</button>`}</div>`;
    else {
      if (r.correcao) {
        const c = r.correcao;
        h += `<p class="est-res ${c.nota >= 7 ? "ok" : c.nota >= 5 ? "" : "bad"}">Nota <b>${esc(String(c.nota))}</b> de 10</p>
          <ul class="est-itens">${(c.itens || []).map(t => `<li class="${t.atendido === "sim" ? "ok" : t.atendido === "parcial" ? "parc" : "bad"}"><b>${esc(t.item)}</b> — ${esc(t.atendido)}${t.comentario ? ": " + esc(t.comentario) : ""}</li>`).join("")}</ul>
          ${c.pontos_fortes && c.pontos_fortes.length ? `<p><b>Pontos fortes:</b> ${esc(c.pontos_fortes.join("; "))}</p>` : ""}${c.melhorias && c.melhorias.length ? `<p><b>Para melhorar:</b> ${esc(c.melhorias.join("; "))}</p>` : ""}${c.feedback ? `<p class="note">${esc(c.feedback)}</p>` : ""}`;
      } else {
        h += `<p class="est-sub">Espelho de correção</p><ul class="est-itens">${(q.espelho || []).map(t => `<li>${esc(t.item)} <span class="note">(${esc(String(t.pontos))} pts)</span></li>`).join("")}</ul>
          ${r.nota === undefined ? `<p class="note">Como foi a sua resposta?</p><div class="est-opts"><button type="button" class="opt" data-estauto="1">Acertei</button><button type="button" class="opt" data-estauto="0.5">Parcial</button><button type="button" class="opt" data-estauto="0">Errei</button></div>` : ""}`;
      }
      h += `<details class="est-det"><summary>Resposta-modelo</summary><p class="pre">${esc(q.resposta_modelo || "")}</p></details>`;
      if (r.texto) h += `<details class="est-det"><summary>Sua resposta</summary><p class="pre">${esc(r.texto)}</p></details>`;
    }
  }
  if (r && r.nota !== undefined) {
    h += `<details class="est-det" open><summary>${j.lei ? "O artigo" : "O julgado"}</summary><p><b>${esc(j.titulo)}</b></p><p class="pre">${esc(j.tese)}</p><p class="note">${esc(j.cit)}</p></details>
      <div class="actions"><button type="button" class="primary" id="estProxima">${i + 1 < s.lista.length ? "Próxima" : "Ver resultado"}</button></div>`;
  }
  return h;
}
function htmlErros() {
  const prog = lerEst("prog", {});
  const lista = julgados.filter(j => prog[j.id] && prog[j.id].erros && prog[j.id].caixa <= 1);
  if (!lista.length) return `<p class="note">Nenhum julgado no caderno de erros. Os que você errar aparecem aqui até você acertá-los numa revisão.</p>`;
  return `<div class="actions" style="justify-content:flex-start"><button type="button" class="primary" id="estPraticarErros">Praticar só os erros (${lista.length})</button></div>
    ${lista.map(j => `<div class="est-erro"><p class="est-sub">${esc(j.disc)} · ${esc(j.trib)}${j.info ? " · Info " + esc(j.info) : ""} <span class="note">errou ${prog[j.id].erros}x</span></p><p><b>${esc(j.titulo)}</b></p><p class="pre">${esc(j.tese)}</p></div>`).join("")}`;
}
function htmlDesempenho() {
  const hist = lerEst("hist", []), prog = lerEst("prog", {});
  if (!hist.length) return `<p class="note">Ainda sem questões respondidas.</p>`;
  const pct = l => l.length ? Math.round(l.reduce((a, h) => a + h.nota, 0) / l.length * 100) : 0;
  const porD = {}; hist.forEach(h => (porD[h.disc] = porD[h.disc] || []).push(h));
  const porM = {}; hist.forEach(h => (porM[h.modo] = porM[h.modo] || []).push(h));
  const ult7 = hist.filter(h => h.d >= new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10));
  const vistos = Object.values(prog).filter(p => p.prox).length, dom = Object.values(prog).filter(p => p.caixa >= 3).length;
  const barra = (n, l) => `<div class="est-barra"><span class="est-b-nome">${esc(n)}</span><span class="est-b-tr"><span style="width:${pct(l)}%"></span></span><span class="est-b-v">${pct(l)}% <span class="note">(${l.length})</span></span></div>`;
  return `<div class="est-kpis"><div><b>${hist.length}</b><span>questões</span></div><div><b>${pct(hist)}%</b><span>aproveitamento</span></div><div><b>${pct(ult7)}%</b><span>últimos 7 dias</span></div><div><b>${vistos}/${julgados.length}</b><span>julgados vistos</span></div><div><b>${dom}</b><span>dominados</span></div></div>
    <div class="est-sec"><h4>Por disciplina</h4>${Object.entries(porD).sort((a, b) => pct(a[1]) - pct(b[1])).map(([d, l]) => barra(d, l)).join("")}</div>
    <div class="est-sec"><h4>Por modalidade</h4>${Object.entries(porM).map(([m, l]) => barra(MODOS[m] || m, l)).join("")}</div>`;
}

// ---------- revisar julgados (leitura, um por vez) ----------
function filtroRevisao() { return { ano: "", ...lerEst("rev", { disc: "", tribs: ["STF", "STJ", "TSE"], busca: "", soNaoRevisados: false, pos: {} }) }; }
function listaRevisao(f) {
  const prog = lerEst("prog", {}), b = semAcentoEst(f.busca || "").trim();
  return julgados.filter(j => (!f.disc || j.disc === f.disc) && f.tribs.includes(j.trib) && (!f.ano || grupoAno(j) === f.ano)
    && (!b || semAcentoEst(j.titulo + " " + j.texto).includes(b))
    && (!f.soNaoRevisados || !(prog[j.id] && prog[j.id].revisado)));
}
const chavePosRev = f => [f.disc, f.tribs.join(""), f.ano, f.busca, f.soNaoRevisados ? 1 : 0].join("|");
function htmlRevisar() {
  const f = filtroRevisao(), lista = listaRevisao(f), prog = lerEst("prog", {});
  const discs = [...new Set(julgados.map(j => j.disc))];
  let i = Math.min((f.pos || {})[chavePosRev(f)] || 0, Math.max(0, lista.length - 1));
  const filtros = `<div class="est-rev-filtros">
      <label>Disciplina<select id="revDisc"><option value="">Todas (${julgados.length})</option>${discs.map(d => `<option${d === f.disc ? " selected" : ""} value="${esc(d)}">${esc(d)} (${julgados.filter(j => j.disc === d).length})</option>`).join("")}</select></label>
      ${anosDoCaderno().length > 1 ? `<label>Ano<select id="revAno"><option value="">Todos</option>${anosDoCaderno().map(a => `<option${a === f.ano ? " selected" : ""}>${a}</option>`).join("")}</select></label>` : ""}
      <label>Buscar no texto<input id="revBusca" type="search" value="${esc(f.busca || "")}" placeholder="ex.: outorga uxória, prescrição"></label></div>
    <div class="est-chips">${["STF", "STJ", "TSE"].map(t => `<button type="button" class="chip-sel${f.tribs.includes(t) ? " on" : ""}" data-revtrib="${t}">${t}</button>`).join("")}
      <label class="chk" style="margin-left:6px"><input type="checkbox" id="revSoNovos"${f.soNaoRevisados ? " checked" : ""}> Só os que ainda não revisei</label></div>`;
  if (!lista.length) return filtros + `<p class="note">Nenhum julgado com esses filtros.</p>`;
  const j = lista[i], p = prog[j.id] || {};
  const revisados = lista.filter(x => prog[x.id] && prog[x.id].revisado).length;
  return filtros + `
    <div class="est-rev-nav"><button type="button" id="revAnt" ${i ? "" : "disabled"}>‹ Anterior</button>
      <span class="note">${i + 1} de ${lista.length} · ${revisados} revisado(s)</span>
      <button type="button" id="revProx" ${i + 1 < lista.length ? "" : "disabled"}>Próximo ›</button></div>
    <div class="est-rev-card">
      <div class="est-prog"><span class="chip">${esc(j.trib)}${j.info ? " · Info " + esc(j.info) : ""}${j.ano ? " · " + esc(j.ano) : ""}</span><span class="chip">${esc(j.disc)}</span>${p.revisado ? `<span class="chip ok">revisado em ${esc(new Date(p.revisado + "T12:00").toLocaleDateString("pt-BR"))}</span>` : ""}${p.erros && p.caixa <= 1 ? `<span class="chip bad">no caderno de erros</span>` : ""}</div>
      <p class="est-rev-tit">${esc(j.titulo)}</p>
      <p class="est-rev-tese">${esc(j.tese)}</p>
      <details class="est-det"><summary>Texto completo do julgado</summary><p class="pre">${esc(j.texto)}</p></details>
      ${j.cit ? `<p class="note">${esc(j.cit)}</p>` : ""}
    </div>
    <div class="actions"><button type="button" id="revPraticar">Praticar este julgado</button><button type="button" class="primary" id="revOk">${p.revisado ? "Revisado ✓ · próximo" : "Marcar como revisado e seguir"}</button></div>`;
}
function moverRevisao(delta) {
  const f = filtroRevisao(), lista = listaRevisao(f), k = chavePosRev(f);
  f.pos = f.pos || {}; f.pos[k] = Math.max(0, Math.min(lista.length - 1, (f.pos[k] || 0) + delta));
  gravarEst("rev", f); desenharEstudo("revisar"); $("estudoConteudo").scrollTop = 0;
}

// ---------- eventos ----------
document.addEventListener("click", async e => {
  if (!e.target.closest("#estudoConteudo")) return;
  const t = e.target.closest("button,[data-estaba]"); if (!t) return;
  const filtro = lerEst("filtro", { modo: "ce", discs: [], tribs: ["STF", "STJ", "TSE"], n: 10 });
  if (t.dataset.estaba) {
    if (estudo && typeof registrarSessaoInfo === "function") registrarSessaoInfo();   // o que já foi respondido entra no histórico
    // tocar em "Provas anteriores" ou "Peças práticas" sai da prova/peça aberta e volta para a lista (o rascunho fica salvo)
    if (typeof sim !== "undefined" && sim && ["provas", "pecas"].includes(t.dataset.estaba)) sim = null;
    if (typeof padr !== "undefined" && padr && padr.fase !== "renomeando") padr = null;
    desenharEstudo(t.dataset.estaba); return;
  }
  if (t.dataset.revtrib) { const f = filtroRevisao(), k = t.dataset.revtrib; f.tribs = f.tribs.includes(k) ? f.tribs.filter(x => x !== k) : [...f.tribs, k]; if (!f.tribs.length) f.tribs = [k]; gravarEst("rev", f); desenharEstudo("revisar"); return; }
  if (t.id === "revAnt") { moverRevisao(-1); return; }
  if (t.id === "revProx") { moverRevisao(1); return; }
  if (t.id === "revOk" || t.id === "revPraticar") {
    const f = filtroRevisao(), lista = listaRevisao(f), j = lista[Math.min((f.pos || {})[chavePosRev(f)] || 0, lista.length - 1)]; if (!j) return;
    if (t.id === "revOk") {
      const prog = lerEst("prog", {}); prog[j.id] = { ...(prog[j.id] || { caixa: 0, acertos: 0, erros: 0 }), revisado: hojeISO() }; gravarEst("prog", prog);
      if (f.soNaoRevisados) desenharEstudo("revisar"); else moverRevisao(1);   // na lista "não revisados" o atual sai e o próximo assume o lugar
      return;
    }
    // praticar só este julgado, na modalidade escolhida em Praticar
    registrarSessaoInfo();
    estudo = { modo: filtro.modo, lista: [j], i: 0, qs: {}, resp: {}, notas: [] };
    prepararQuestao(0); desenharEstudo("praticar"); return;
  }
  if (t.dataset.estmodo) { filtro.modo = t.dataset.estmodo; gravarEst("filtro", filtro); desenharEstudo("praticar"); return; }
  if (t.dataset.esttrib) { const k = t.dataset.esttrib; filtro.tribs = filtro.tribs.includes(k) ? filtro.tribs.filter(x => x !== k) : [...filtro.tribs, k]; if (!filtro.tribs.length) filtro.tribs = [k]; gravarEst("filtro", filtro); desenharEstudo("praticar"); return; }
  if (t.dataset.estdisc) { const k = t.dataset.estdisc; filtro.discs = filtro.discs.includes(k) ? filtro.discs.filter(x => x !== k) : [...filtro.discs, k]; gravarEst("filtro", filtro); desenharEstudo("praticar"); return; }
  if (t.dataset.estano) { const k = t.dataset.estano; filtro.anos = (filtro.anos || []).includes(k) ? filtro.anos.filter(x => x !== k) : [...(filtro.anos || []), k]; gravarEst("filtro", filtro); desenharEstudo("praticar"); return; }
  if (t.dataset.estn) { filtro.n = +t.dataset.estn; gravarEst("filtro", filtro); desenharEstudo("praticar"); return; }
  if (t.id === "estComecar") { iniciarSessao(false); return; }
  if (t.id === "estPraticarErros") { iniciarSessao(true); return; }
  if (t.id === "estNova") { registrarSessaoInfo(); estudo = null; desenharEstudo("praticar"); return; }
  if (t.id === "estBtnCad") { $("estArqCad").click(); return; }
  if (t.id === "estAtualizarDrive") { atualizarDoDrive(true); return; }
  if (t.id === "estVoltarDrive") { gravarEst("caderno", { ...(lerEst("caderno", {})), fonte: "drive", modificado: "" }); atualizarDoDrive(true); return; }
  if (!estudo) return;
  const i = estudo.i, j = estudo.lista[i], q = estudo.qs[i] && estudo.qs[i].pronta;
  if (t.dataset.estresp && q && !estudo.resp[i]) {
    const nota = t.dataset.estresp === q.gabarito ? 1 : 0;
    estudo.resp[i] = { marcada: t.dataset.estresp, nota }; estudo.notas.push(nota); registrar(j, nota);
    desenharEstudo("praticar"); return;
  }
  if (t.id === "estVerEspelho" || (t.id === "estCorrigir" && !(iaLigada() && q.ia))) {
    const texto = ($("estTexto") || {}).value || "";
    estudo.resp[i] = { texto }; desenharEstudo("praticar"); return;
  }
  if (t.id === "estCorrigir") {
    const texto = ($("estTexto") || {}).value.trim();
    if (texto.length < 40) { toast("Escreva a sua resposta antes de enviar."); return; }
    estudo.resp[i] = { texto, corrigindo: true }; desenharEstudo("praticar");
    try {
      const c = await corrigirDiscursiva(j, q, texto);
      const nota = +c.nota >= 7 ? 1 : +c.nota >= 5 ? 0.5 : 0;
      estudo.resp[i] = { texto, correcao: c, nota }; estudo.notas.push(nota); registrar(j, nota);
    } catch (err) { estudo.resp[i] = { texto }; toast("A IA não conseguiu corrigir agora (" + err.message + "). Compare com o espelho."); }
    desenharEstudo("praticar"); return;
  }
  if (t.dataset.estauto !== undefined) { const nota = +t.dataset.estauto; estudo.resp[i].nota = nota; estudo.notas.push(nota); registrar(j, nota); desenharEstudo("praticar"); return; }
  if (t.id === "estProxima") { estudo.i++; estudo.rascunho = ""; prepararQuestao(estudo.i); if (estudo.qs[estudo.i] && estudo.qs[estudo.i].pronta) prepararQuestao(estudo.i + 1); desenharEstudo("praticar"); $("estudoConteudo").scrollTop = 0; return; }
});
document.addEventListener("change", e => {
  if (e.target.id === "revAno") { const f = filtroRevisao(); f.ano = e.target.value; gravarEst("rev", f); desenharEstudo("revisar"); return; }
  if (e.target.id === "revDisc") { const f = filtroRevisao(); f.disc = e.target.value; gravarEst("rev", f); desenharEstudo("revisar"); return; }
  if (e.target.id === "revSoNovos") { const f = filtroRevisao(); f.soNaoRevisados = e.target.checked; gravarEst("rev", f); desenharEstudo("revisar"); return; }
  if (e.target.id === "estArqCad") { const f = e.target.files[0]; e.target.value = ""; if (f) juntarCaderno(f); }
  if (e.target.id === "estConcurso" && e.target.value) {
    const x = itens.find(i => i.id === e.target.value); if (!x) return;
    const filtro = lerEst("filtro", { modo: "ce", discs: [], tribs: ["STF", "STJ", "TSE"], n: 10 });
    filtro.discs = disciplinasDoConcurso(x); gravarEst("filtro", filtro); desenharEstudo("praticar");
  }
});
let revBuscaTimer = null;
document.addEventListener("input", e => {
  if (e.target.id === "revBusca") {
    const v = e.target.value; clearTimeout(revBuscaTimer);
    revBuscaTimer = setTimeout(() => { const f = filtroRevisao(); f.busca = v; gravarEst("rev", f); desenharEstudo("revisar"); const el = $("revBusca"); if (el) { el.focus(); el.setSelectionRange(v.length, v.length); } }, 400);
    return;
  }
  if (e.target.id !== "estTexto" || !estudo) return;
  estudo.rascunho = e.target.value;
  const l = Math.ceil(e.target.value.length / 75), el = $("estLinhas");
  if (el) el.textContent = `(~${l} linha${l === 1 ? "" : "s"} de ${(estudo.qs[estudo.i].pronta || {}).linhas || 20})`;
});
