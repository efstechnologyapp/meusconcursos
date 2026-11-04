// Estudar informativos: o caderno de informativos (STF, STJ, TSE) vira questões objetivas e discursivas.
// A IA (Gemini, gratuita) cria as questões a partir do julgado e corrige as discursivas; sem chave, o app gera questões simples
// a partir das teses. Revisão espaçada: o que você erra volta em 1, 3, 7, 15 e 30 dias.

const CHAVE_IDB_CADERNO = "estudo:caderno", CHAVE_IDB_JULGADOS = "estudo:julgados";
const INTERVALOS = [0, 1, 3, 7, 15, 30];   // dias por "caixa" da revisão espaçada
let julgados = [], estudo = null, geminiModelo = null;

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
    .replace(/\*\*|__/g, "").replace(/(^|\s)\*([^*\n]+)\*/g, "$1$2").replace(/\s+/g, " ").trim();
}
const nomeDisciplina = s => s.trim().toLowerCase().replace(/(^|\s)(\S)/g, (a, b, c) => b + c.toUpperCase()).replace(/\b(Da|Do|De|E|Dos|Das)\b/g, w => w.toLowerCase());
const RE_CIT = /\b(STF|STJ|TSE)\.\s?[^()\n]{0,260}?\(Info(?:rmativo)?\.?\s*([\d.]+)\)/g;
function montarJulgado(disc, titulo, texto) {
  const cits = [...texto.matchAll(RE_CIT)];
  const trib = cits[0] ? cits[0][1] : ((texto.match(/\b(STF|STJ|TSE)\b/) || [])[1] || "");
  const corte = texto.search(/caso hipot[eé]tico|imagine a seguinte|\b(STF|STJ|TSE)\.\s/i);
  let tese = (corte > 0 ? texto.slice(0, corte) : texto.slice(0, 700)).trim();
  const suma = texto.match(/Em suma:\s*([^\n]+?)(?=\s*\b(?:STF|STJ|TSE)\.|$)/i);
  if (suma) tese = suma[1].trim();
  tese = tese.charAt(0).toUpperCase() + tese.slice(1);
  const j = { disc, trib, info: [...new Set(cits.map(c => c[2]))].join(", "), titulo, tese: tese.slice(0, 900), texto: texto.slice(0, 6000), cit: cits.map(c => c[0]).join(" | ") };
  j.id = idJulgado(j);
  return j;
}
function lerCaderno(textoBruto) {
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
      if (letras.length > 15 && up / letras.length > 0.7) { fechar(); atual = { disc, titulo: t, linhas: [limparMd(semH.slice(tb[0].length))].filter(Boolean) }; continue; }
    }
    if (atual) atual.linhas.push(limparMd(l));
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
  return julgados;
}
async function juntarCaderno(f) {
  const st = $("estCadStatus"); st.textContent = "Lendo o caderno…";
  try {
    let texto;
    if (/pdf/i.test(f.type) || /\.pdf$/i.test(f.name)) texto = await textoDoPdf(f, 2000, { aoProgredir: (p, t) => { st.textContent = `Lendo o PDF… página ${p} de ${t}`; } });
    else texto = await f.text();
    const js = lerCaderno(texto);
    if (!js.length) { st.textContent = "Não encontrei julgados nesse arquivo. Use o caderno em .md, .txt ou PDF com as citações \"(Info nº)\"."; return; }
    await arq("gravar", CHAVE_IDB_JULGADOS, js); await arq("gravar", CHAVE_IDB_CADERNO, f);
    julgados = js;
    gravarEst("caderno", { nome: f.name, quando: new Date().toISOString(), total: js.length });
    desenharEstudo("config");
    $("estCadStatus").textContent = `Pronto: ${js.length} julgados lidos de ${f.name}. Agora é só ir em Praticar.`;
  } catch (e) { st.textContent = "Não consegui ler esse arquivo."; }
}

// ---------- Gemini ----------
function chaveGemini() { try { return localStorage.getItem(chaveEst("gemini")) || ""; } catch (e) { return ""; } }
async function escolherModelo(k) {
  const cache = lerEst("modelo", null);
  if (cache && cache.k === k.slice(-6) && Date.now() - cache.t < 7 * 864e5) return cache.m;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(k)}`);
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error((j.error && j.error.message) || "chave recusada (" + r.status + ")"); }
  const j = await r.json();
  const ok = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes("generateContent") && /gemini-[\d.]+-flash/.test(m.name) && !/lite|image|tts|live|audio|thinking|embedding/.test(m.name));
  const ver = n => parseFloat((n.match(/gemini-([\d.]+)/) || [0, 0])[1]);
  ok.sort((a, b) => (ver(b.name) - ver(a.name)) || ((/preview|exp/.test(a.name) ? 1 : 0) - (/preview|exp/.test(b.name) ? 1 : 0)));
  const m = ok.length ? ok[0].name.replace(/^models\//, "") : "gemini-2.5-flash";
  gravarEst("modelo", { k: k.slice(-6), t: Date.now(), m });
  return m;
}
async function gemini(prompt) {
  const k = chaveGemini(); if (!k) throw new Error("sem chave");
  geminiModelo = geminiModelo || await escolherModelo(k);
  for (let tent = 0; tent < 3; tent++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModelo}:generateContent?key=${encodeURIComponent(k)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.9 } })
    });
    if (r.status === 429 || r.status === 503) { await new Promise(ok => setTimeout(ok, 6000 * (tent + 1))); continue; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && j.error.message) || "erro " + r.status);
    const txt = (((j.candidates || [])[0] || {}).content || {}).parts?.map(p => p.text || "").join("") || "";
    try { return JSON.parse(txt.replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch (e) { if (tent === 2) throw new Error("resposta inválida da IA"); }
  }
  throw new Error("a IA está ocupada (limite gratuito por minuto); tente de novo em instantes");
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
      if (re.test(t)) return t.replace(re, (m, p1) => p1 + para);
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
    const outras = embaralhar(julgados.filter(o => o.id !== j.id && o.disc === j.disc)).map(o => alterarTese(o.tese)).filter(Boolean).slice(0, 4);
    while (outras.length < 4) { const o = julgados[Math.floor(Math.random() * julgados.length)]; const a = alterarTese(o.tese); if (a && !outras.includes(a)) outras.push(a); }
    const alts = embaralhar([j.tese, ...outras]); const g = alts.indexOf(j.tese);
    return { tipo: "me", enunciado: `De acordo com a jurisprudência do ${j.trib} sobre ${j.disc}, assinale a alternativa correta.`, alternativas: alts, gabarito: "ABCDE"[g], comentario: "Correta: " + j.tese + " As demais alternativas inverteram a conclusão de outros julgados.", ia: false };
  }
  const caso = (j.texto.match(/caso hipot[eé]tico:\s*([\s\S]+?)(?=\s(?:O|A)\s(?:STJ|STF|TSE|Tribunal|juiz)\b[^.]{0,60}(?:entendeu|decidiu|reformou|afirmou|concluiu|reconheceu)|Em suma:|$)/i) || [])[1];
  return { tipo: "disc", enunciado: (caso ? caso.trim() + "\n\n" : "") + `Com base na jurisprudência do ${j.trib}, responda de forma fundamentada: ${j.titulo.toLowerCase().replace(/^./, c => c.toUpperCase())}`,
    espelho: [{ item: j.tese, pontos: 10 }], resposta_modelo: j.tese, linhas: 20, ia: false };
}
async function gerarQuestao(j, modo) {
  if (!chaveGemini()) return questaoLocal(j, modo);
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
  const hist = lerEst("hist", []); hist.push({ d: hojeISO(), disc: j.disc, trib: j.trib, modo: estudo && estudo.modo, nota }); gravarEst("hist", hist.slice(-3000));
}
function escolherJulgados(filtro, n) {
  const prog = lerEst("prog", {}), hoje = hojeISO();
  const base = julgados.filter(j => (!filtro.discs.length || filtro.discs.includes(j.disc)) && filtro.tribs.includes(j.trib) && (!filtro.soErros || (prog[j.id] && prog[j.id].erros && prog[j.id].caixa <= 1)));
  const vencidos = embaralhar(base.filter(j => prog[j.id] && prog[j.id].prox <= hoje));
  const novos = embaralhar(base.filter(j => !prog[j.id]));
  const resto = embaralhar(base.filter(j => prog[j.id] && prog[j.id].prox > hoje)).sort((a, b) => prog[a.id].caixa - prog[b.id].caixa);
  return [...vencidos, ...novos, ...resto].slice(0, n);
}

// ---------- tela ----------
const MODOS = { ce: "Certo ou errado (estilo Cebraspe)", me: "Múltipla escolha (estilo FGV)", disc: "Discursiva (caso concreto)" };
function abrirEstudo() {
  carregarJulgados().then(() => { estudo = null; desenharEstudo(); });
  const d = $("dlgEstudo"); if (!d.open) d.showModal();
}
function cabecalhoEstudo(aba) {
  return `<div class="dlg-head"><div style="flex:1;min-width:0"><h2>Estudar informativos</h2><p class="sub">${julgados.length ? `${julgados.length} julgados do caderno` : "Junte o caderno de informativos para começar"}</p></div><button type="button" class="close" data-close aria-label="Fechar">×</button></div>
    <div class="est-abas">${[["praticar", "Praticar"], ["erros", "Caderno de erros"], ["desempenho", "Desempenho"], ["config", "Caderno e IA"]].map(([k, n]) => `<button type="button" class="${aba === k ? "on" : ""}" data-estaba="${k}">${n}</button>`).join("")}</div>`;
}
function desenharEstudo(aba) {
  aba = aba || (julgados.length ? "praticar" : "config");
  estudoAba = aba;
  let corpo = "";
  if (aba === "config") corpo = htmlConfigEstudo();
  else if (!julgados.length) corpo = `<p class="note">Primeiro junte o caderno na aba <b>Caderno e IA</b>.</p>`;
  else if (aba === "praticar") corpo = estudo ? htmlSessao() : htmlPreparar();
  else if (aba === "erros") corpo = htmlErros();
  else corpo = htmlDesempenho();
  $("estudoConteudo").innerHTML = cabecalhoEstudo(aba) + `<div class="est-corpo">${corpo}</div>`;
}
let estudoAba = "praticar";
function htmlConfigEstudo() {
  const cad = lerEst("caderno", null), k = chaveGemini();
  return `<div class="est-sec"><h4>Caderno de informativos</h4>
      <p class="note">No Google Docs: <b>Arquivo → Fazer download → Markdown (.md)</b> (melhor), Texto (.txt) ou PDF.</p>
      <div class="auto-box"><button type="button" id="estBtnCad">${typeof CLIP_SVG !== "undefined" ? CLIP_SVG : ""} ${cad ? "Trocar o caderno" : "Juntar o caderno"}</button>
      <input type="file" id="estArqCad" accept=".md,.txt,.markdown,text/plain,text/markdown,application/pdf,.pdf" hidden>
      <span class="note" id="estCadStatus">${cad ? `${esc(cad.nome)}: ${cad.total} julgados (juntado em ${esc(new Date(cad.quando).toLocaleDateString("pt-BR"))})` : "Nenhum caderno juntado neste aparelho."}</span></div>
      ${julgados.length ? `<p class="note">${Object.entries(julgados.reduce((a, j) => (a[j.disc] = (a[j.disc] || 0) + 1, a), {})).map(([d, n]) => `${esc(d)} (${n})`).join(" · ")}</p>` : ""}</div>
    <div class="est-sec"><h4>Inteligência artificial (Gemini, gratuita)</h4>
      <p class="note">Com a chave, a IA cria questões no estilo da banca e corrige as discursivas com nota e espelho. Sem chave, o app usa questões simples feitas a partir das teses. A chave fica guardada só neste aparelho.</p>
      <label>Chave do Gemini (Google AI Studio)<input id="estChave" type="password" autocomplete="off" value="${esc(k)}" placeholder="cole aqui a chave"></label>
      <div class="actions" style="justify-content:flex-start"><button type="button" id="estSalvarChave" class="primary">Salvar e testar</button>${k ? `<button type="button" id="estApagarChave">Apagar chave</button>` : ""}<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style="align-self:center">Criar chave gratuita</a></div>
      <p class="note" id="estChaveStatus">${k ? "Chave salva neste aparelho." : ""}</p></div>`;
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
  return `${vencidos ? `<p class="est-aviso">${vencidos} julgado(s) para revisar hoje — eles entram primeiro na sessão.</p>` : ""}
    <div class="est-sec"><h4>Modalidade</h4><div class="est-opts">${Object.entries(MODOS).map(([k, n]) => `<button type="button" class="opt${filtro.modo === k ? " on" : ""}" data-estmodo="${k}">${n}</button>`).join("")}</div></div>
    <div class="est-sec"><h4>Tribunais</h4><div class="est-chips">${["STF", "STJ", "TSE"].map(t => `<button type="button" class="chip-sel${filtro.tribs.includes(t) ? " on" : ""}" data-esttrib="${t}">${t} (${julgados.filter(j => j.trib === t).length})</button>`).join("")}</div></div>
    <div class="est-sec"><h4>Disciplinas <span class="note">${filtro.discs.length ? "" : "(todas)"}</span></h4>
      ${concursos.length ? `<label class="est-conc">Focar nas matérias do concurso<select id="estConcurso"><option value="">—</option>${concursos.map(x => `<option value="${esc(x.id)}">${esc(x.nome)}</option>`).join("")}</select></label>` : ""}
      <div class="est-chips">${discs.map(d => `<button type="button" class="chip-sel${filtro.discs.includes(d) ? " on" : ""}" data-estdisc="${esc(d)}">${esc(d)}</button>`).join("")}</div></div>
    <div class="est-sec"><h4>Quantidade de questões</h4><div class="est-chips">${[5, 10, 20, 30].map(n => `<button type="button" class="chip-sel${filtro.n === n ? " on" : ""}" data-estn="${n}">${n}</button>`).join("")}</div></div>
    ${chaveGemini() ? "" : `<p class="note">Sem a chave do Gemini as questões são simples (a partir das teses). Cadastre a chave na aba <b>Caderno e IA</b>.</p>`}
    <div class="actions"><button type="button" class="primary" id="estComecar">Começar</button></div>`;
}
function iniciarSessao(soErros) {
  const filtro = lerEst("filtro", { modo: "ce", discs: [], tribs: ["STF", "STJ", "TSE"], n: 10 });
  const lista = escolherJulgados({ ...filtro, soErros }, soErros ? 30 : filtro.n);
  if (!lista.length) { toast("Nenhum julgado com esses filtros."); return; }
  estudo = { modo: filtro.modo, lista, i: 0, qs: {}, resp: {}, notas: [] };
  prepararQuestao(0); prepararQuestao(1);
  desenharEstudo("praticar");
}
function prepararQuestao(i) {
  if (!estudo || i >= estudo.lista.length || estudo.qs[i]) return;
  const j = estudo.lista[i];
  estudo.qs[i] = gerarQuestao(j, estudo.modo).catch(e => { const q = questaoLocal(j, estudo.modo); q.aviso = "A IA não respondeu (" + e.message + "); questão simples gerada pelo app."; return q; });
  estudo.qs[i].then(q => { estudo && (estudo.qs[i].pronta = q); if (estudo && estudo.i === i && estudoAba === "praticar") desenharEstudo("praticar"); });
}
function htmlSessao() {
  const s = estudo, i = s.i;
  if (i >= s.lista.length) {
    const tot = s.notas.reduce((a, b) => a + b, 0);
    return `<div class="est-fim"><div class="vb-n">${Math.round(tot / s.notas.length * 100)}%</div><p>${s.notas.filter(n => n >= 1).length} acerto(s), ${s.notas.filter(n => n > 0 && n < 1).length} parcial(is) e ${s.notas.filter(n => n === 0).length} erro(s) em ${s.notas.length} questões.</p>
      <p class="note">Os julgados que você errou voltam amanhã; os que acertou, em alguns dias.</p>
      <div class="actions" style="justify-content:center"><button type="button" id="estNova" class="primary">Nova sessão</button></div></div>`;
  }
  const j = s.lista[i], q = s.qs[i] && s.qs[i].pronta, r = s.resp[i];
  const topo = `<div class="est-prog"><span>Questão ${i + 1} de ${s.lista.length}</span><span class="chip">${esc(j.trib)}${j.info ? " · Info " + esc(j.info.split(",")[0]) : ""}</span><span class="chip">${esc(j.disc)}</span></div>`;
  if (!q) return topo + `<p class="note est-gerando">Criando a questão${chaveGemini() ? " com a IA" : ""}…</p>`;
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
      <div class="actions">${r && r.corrigindo ? `<span class="note">Corrigindo…</span>` : `<button type="button" id="estVerEspelho">Ver espelho sem corrigir</button><button type="button" class="primary" id="estCorrigir">${chaveGemini() && q.ia ? "Enviar para correção" : "Comparar com o espelho"}</button>`}</div>`;
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
    h += `<details class="est-det" open><summary>O julgado</summary><p><b>${esc(j.titulo)}</b></p><p class="pre">${esc(j.tese)}</p><p class="note">${esc(j.cit)}</p></details>
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
  const vistos = Object.keys(prog).length, dom = Object.values(prog).filter(p => p.caixa >= 3).length;
  const barra = (n, l) => `<div class="est-barra"><span class="est-b-nome">${esc(n)}</span><span class="est-b-tr"><span style="width:${pct(l)}%"></span></span><span class="est-b-v">${pct(l)}% <span class="note">(${l.length})</span></span></div>`;
  return `<div class="est-kpis"><div><b>${hist.length}</b><span>questões</span></div><div><b>${pct(hist)}%</b><span>aproveitamento</span></div><div><b>${pct(ult7)}%</b><span>últimos 7 dias</span></div><div><b>${vistos}/${julgados.length}</b><span>julgados vistos</span></div><div><b>${dom}</b><span>dominados</span></div></div>
    <div class="est-sec"><h4>Por disciplina</h4>${Object.entries(porD).sort((a, b) => pct(a[1]) - pct(b[1])).map(([d, l]) => barra(d, l)).join("")}</div>
    <div class="est-sec"><h4>Por modalidade</h4>${Object.entries(porM).map(([m, l]) => barra(MODOS[m] || m, l)).join("")}</div>`;
}

// ---------- eventos ----------
document.addEventListener("click", async e => {
  if (!e.target.closest("#estudoConteudo")) return;
  const t = e.target.closest("button,[data-estaba]"); if (!t) return;
  const filtro = lerEst("filtro", { modo: "ce", discs: [], tribs: ["STF", "STJ", "TSE"], n: 10 });
  if (t.dataset.estaba) { desenharEstudo(t.dataset.estaba); return; }
  if (t.dataset.estmodo) { filtro.modo = t.dataset.estmodo; gravarEst("filtro", filtro); desenharEstudo("praticar"); return; }
  if (t.dataset.esttrib) { const k = t.dataset.esttrib; filtro.tribs = filtro.tribs.includes(k) ? filtro.tribs.filter(x => x !== k) : [...filtro.tribs, k]; if (!filtro.tribs.length) filtro.tribs = [k]; gravarEst("filtro", filtro); desenharEstudo("praticar"); return; }
  if (t.dataset.estdisc) { const k = t.dataset.estdisc; filtro.discs = filtro.discs.includes(k) ? filtro.discs.filter(x => x !== k) : [...filtro.discs, k]; gravarEst("filtro", filtro); desenharEstudo("praticar"); return; }
  if (t.dataset.estn) { filtro.n = +t.dataset.estn; gravarEst("filtro", filtro); desenharEstudo("praticar"); return; }
  if (t.id === "estComecar") { iniciarSessao(false); return; }
  if (t.id === "estPraticarErros") { iniciarSessao(true); return; }
  if (t.id === "estNova") { estudo = null; desenharEstudo("praticar"); return; }
  if (t.id === "estBtnCad") { $("estArqCad").click(); return; }
  if (t.id === "estApagarChave") { try { localStorage.removeItem(chaveEst("gemini")); } catch (err) {} geminiModelo = null; desenharEstudo("config"); return; }
  if (t.id === "estSalvarChave") {
    const k = $("estChave").value.trim(), st = $("estChaveStatus");
    if (!k) { st.textContent = "Cole a chave."; return; }
    st.textContent = "Testando a chave…";
    try { localStorage.setItem(chaveEst("gemini"), k); } catch (err) {}
    geminiModelo = null; try { localStorage.removeItem(chaveEst("modelo")); } catch (err) {}
    try { const m = await escolherModelo(k); geminiModelo = m; st.textContent = `Chave funcionando. Modelo: ${m}.`; }
    catch (err) { st.textContent = "A chave foi salva, mas o Google respondeu: " + err.message; }
    return;
  }
  if (!estudo) return;
  const i = estudo.i, j = estudo.lista[i], q = estudo.qs[i] && estudo.qs[i].pronta;
  if (t.dataset.estresp && q && !estudo.resp[i]) {
    const nota = t.dataset.estresp === q.gabarito ? 1 : 0;
    estudo.resp[i] = { marcada: t.dataset.estresp, nota }; estudo.notas.push(nota); registrar(j, nota);
    desenharEstudo("praticar"); return;
  }
  if (t.id === "estVerEspelho" || (t.id === "estCorrigir" && !(chaveGemini() && q.ia))) {
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
  if (t.id === "estProxima") { estudo.i++; estudo.rascunho = ""; prepararQuestao(estudo.i); prepararQuestao(estudo.i + 1); desenharEstudo("praticar"); $("estudoConteudo").scrollTop = 0; return; }
});
document.addEventListener("change", e => {
  if (e.target.id === "estArqCad") { const f = e.target.files[0]; e.target.value = ""; if (f) juntarCaderno(f); }
  if (e.target.id === "estConcurso" && e.target.value) {
    const x = itens.find(i => i.id === e.target.value); if (!x) return;
    const filtro = lerEst("filtro", { modo: "ce", discs: [], tribs: ["STF", "STJ", "TSE"], n: 10 });
    filtro.discs = disciplinasDoConcurso(x); gravarEst("filtro", filtro); desenharEstudo("praticar");
  }
});
document.addEventListener("input", e => {
  if (e.target.id !== "estTexto" || !estudo) return;
  estudo.rascunho = e.target.value;
  const l = Math.ceil(e.target.value.length / 75), el = $("estLinhas");
  if (el) el.textContent = `(~${l} linha${l === 1 ? "" : "s"} de ${(estudo.qs[estudo.i].pronta || {}).linhas || 20})`;
});
