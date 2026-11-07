// Material de consulta nas provas: o app separa no edital as frases sobre consulta (edital.js › frasesDeConsulta)
// e a IA diz, para cada fase do concurso, se pode consultar material e o que é permitido / vedado.
// Fica guardado no próprio concurso (x.consulta) → sincronizado. Aparece em "Instruções gerais" com marca-texto amarelo,
// só para a(s) prova(s) que o usuário vai fazer agora.

let consultaLendo = {};
async function lerConsultaDoEdital(x) {
  if (!x || !x.edital_arquivo || consultaLendo[x.id] || (x.consulta && x.consulta.v === 1)) return;
  if (typeof iaLigada === "function" && !iaLigada()) return;
  consultaLendo[x.id] = true;
  try {
    const blob = await arq("ler", `${x.id}:edital`).catch(() => null) || await baixarDaNuvem(`${x.id}:edital`).catch(() => null);
    if (!blob) return;
    const frases = frasesDeConsulta(await textoDoPdf(blob, 500));
    const fases = (x.fases || []).filter(f => f.uid);
    let porFase = {};
    if (frases.length && fases.length) {
      const r = await gemini(`Concurso: ${x.nome}${x.cargo ? " — " + x.cargo : ""}.
Fases do concurso:
${fases.map(f => `- ${f.uid}: ${f.nome || "Prova"}`).join("\n")}

Trechos do edital sobre material de consulta durante as provas:
${frases.map((f, k) => `${k + 1}. ${f}`).join("\n")}

Para CADA fase acima, diga se o candidato pode consultar algum material durante a prova dessa fase, com base só nesses trechos.
Se um trecho valer para "as provas" em geral, aplique-o às fases a que se refere; se nenhum trecho tratar da fase, use "permitido": null.
Ignore trechos sobre consulta de resultados, comprovantes ou sites.
- permitidos: o que pode ser consultado (curto, até 25 palavras), ou "" se nada
- vedados: o que é proibido (curto, até 25 palavras)
- obs: regra prática importante, se houver (ex.: "só publicações de editoras; nada impresso pelo candidato"), ou ""
Responda só com JSON: {"fases":[{"uid":"","permitido":true,"permitidos":"","vedados":"","obs":""}]}`, { ms: 120000, temperatura: 0.1 });
      ((r && r.fases) || []).forEach(f => { if (f && f.uid) porFase[f.uid] = { permitido: f.permitido === true ? true : f.permitido === false ? false : null, permitidos: String(f.permitidos || ""), vedados: String(f.vedados || ""), obs: String(f.obs || "") }; });
    }
    x.consulta = { v: 1, quando: new Date().toISOString(), fases: porFase, semTrecho: !frases.length };
    x.atualizado = new Date().toISOString(); salvar();
    if ($("dlgVer") && $("dlgVer").open && $("verConteudo").dataset.id === x.id) abrirVer(x.id);
  } catch (e) { console.warn("consulta", e); }
  finally { delete consultaLendo[x.id]; }
}
// fases da próxima prova do usuário (a mesma janela do plano de estudos: mesma etapa ou até 3 dias depois)
function fasesDaProximaProva(x) {
  if (typeof alvoPlano === "function") { const al = alvoPlano(x.id); if (al) return al.fases; }
  const a = andamento(x); return a.prox ? [a.prox.f] : [];
}
// linha(s) com marca-texto para o bloco "Instruções gerais"
function htmlConsultaProva(x) {
  if (!x.edital_arquivo) return "";
  const fases = fasesDaProximaProva(x); if (!fases.length) return "";
  if (!x.consulta || x.consulta.v !== 1) {
    lerConsultaDoEdital(x);
    return `<p class="mt-linha"><mark class="mt">MATERIAL DE CONSULTA: verificando no edital…</mark></p>`;
  }
  const grupos = new Map();   // fases com a mesma regra aparecem juntas
  fases.forEach(f => {
    const c = x.consulta.fases[f.uid], k = JSON.stringify(c || null);
    if (!grupos.has(k)) grupos.set(k, { c, nomes: [] });
    grupos.get(k).nomes.push(f.nome || "prova");
  });
  return [...grupos.values()].map(({ c, nomes }) => {
    const qual = esc(nomes.join(" + "));
    let txt;
    if (!c || c.permitido == null) txt = `o edital não traz regra específica para esta prova (${qual}) — confira no edital`;
    else if (c.permitido === false) txt = `<b>NÃO é permitido</b> consultar material na sua prova (${qual})${c.vedados ? ` — vedado: ${esc(c.vedados)}` : ""}`;
    else txt = `<b>PERMITIDO</b> na sua prova (${qual}): ${esc(c.permitidos || "consulta conforme o edital")}${c.vedados ? `. <b>Vedado:</b> ${esc(c.vedados)}` : ""}`;
    const obs = c && c.obs ? c.obs.charAt(0).toUpperCase() + c.obs.slice(1).replace(/\.$/, "") : "";
    return `<p class="mt-linha"><mark class="mt"><b>MATERIAL DE CONSULTA:</b> ${txt}${obs ? `. ${esc(obs)}` : ""}.</mark></p>`;
  }).join("");
}
