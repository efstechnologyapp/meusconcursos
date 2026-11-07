// Página "Estudar" (fora do modal): três cartões — Informativos, Provas anteriores e Peças práticas.
// Cada cartão abre o modal só com as funções daquela forma de estudo. A página usa o endereço #estudar
// (o botão "voltar" do navegador/celular volta para a lista de concursos).

const ICONES_ESTUDO = {
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19.5A2 2 0 0 1 6 18h13"/><path d="M8 7h7M8 11h5"/></svg>',
  provas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v2h6V3"/><path d="M8.5 11l1.5 1.5 3-3M8.5 16.5h7"/></svg>',
  lei: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M5 21h14"/><path d="M4 7h16"/><path d="M7 7l-3 7a3 3 0 0 0 6 0z"/><path d="M17 7l-3 7a3 3 0 0 0 6 0z"/></svg>',
  pecas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8 13h8M8 17h5"/><path d="M15.5 16.5l2.5-2.5 1.5 1.5-2.5 2.5h-1.5z"/></svg>'
};

function naPaginaEstudo() { return location.hash === "#estudar"; }
function mostrarPagina() {
  const est = naPaginaEstudo();
  if (!$("pgEstudo") || !$("pgHome")) return;
  $("pgEstudo").hidden = !est; $("pgHome").hidden = est;
  if (est) {
    renderEstudoPagina(); window.scrollTo(0, 0); carregarDadosEstudo();
  } else {
    const d = $("dlgEstudo"); if (d && d.open) d.close();
  }
}
// dados para os números dos cartões (só depois do login; cada parte redesenha a página quando chega)
let dadosEstudoPedidos = false;
function carregarDadosEstudo() {
  if (dadosEstudoPedidos || typeof usuarioAtual === "undefined" || !usuarioAtual || !usuarioAtual.sessao) return;
  dadosEstudoPedidos = true;
  carregarJulgados().then(() => { renderEstudoPagina(); if (!cadernoDriveChecado) atualizarDoDrive(); });
  if (!repo) carregarRepo();
  carregarHistorico();
  if (typeof sincronizarEstudo === "function") sincronizarEstudo(true);
}
let ultimoHtmlEstudo = "";
function renderEstudoPagina() {
  if (!naPaginaEstudo() || !$("pgEstudo")) return;
  const H = (typeof hist !== "undefined" && hist.lista) || [];
  const pend = a => typeof impressasPendentes === "function" ? impressasPendentes(a).length : 0;
  const respondidas = tipos => new Set(H.filter(e => tipos.includes(e.tipo) && !e.novas && e.prova).map(e => e.prova)).size;
  const itensRepo = repo && repo.itens || null;
  const nProvas = itensRepo && itensRepo.filter(i => i.tipo !== "peca").length, nPecas = itensRepo && itensRepo.filter(i => i.tipo === "peca").length;
  const sessoes = H.filter(e => e.tipo === "info");
  const aprov = sessoes.length ? Math.round(sessoes.reduce((a, e) => a + e.nota, 0) / sessoes.length * 10) : null;
  const prog = lerEst("prog", {}), hoje = hojeISO(), revisar = julgados.filter(j => prog[j.id] && prog[j.id].prox <= hoje).length;
  const cartoes = [
    { area: "info", titulo: "Informativos", texto: "Questões de certo ou errado, múltipla escolha e discursivas criadas pela IA a partir dos julgados do STF, STJ e TSE. Revisão espaçada, caderno de erros e prova para imprimir.",
      stats: julgados.length ? [`${julgados.length} julgados`, revisar ? `${revisar} para revisar hoje` : "", sessoes.length ? `${sessoes.length} sessão(ões) · ${aprov}%` : ""].filter(Boolean).join(" · ") : "Carregando o caderno…", pend: pend("info") },
    { area: "provas", titulo: "Provas anteriores", texto: "Provas objetivas e subjetivas da pasta Provas Jurídicas: simulado com as questões originais, questões novas no estilo da banca e prova no papel com cartão-resposta.",
      stats: nProvas == null ? "Abrindo a pasta no Drive…" : `${nProvas} prova(s)${nProvas ? ` · ${respondidas(["objetiva", "subjetiva"])} respondida(s)` : ""}`, pend: pend("provas") },
    { area: "lei", titulo: "Lei seca", texto: "Texto vigente das leis do Planalto, sem o que foi revogado: leitura artigo por artigo com revisão, questões da letra da lei e PDF da lei limpa para estudar no papel.",
      stats: (() => { const b = lerEst("leisBaixadas", {}), n = Object.keys(b).length, s = H.filter(e => e.tipo === "lei"); return n ? `${n} lei(s) baixada(s)${s.length ? ` · ${s.length} sessão(ões)` : ""}` : "Nenhuma lei baixada ainda"; })(), pend: pend("lei") },
    { area: "pecas", titulo: "Peças práticas", texto: "Estrutura de cada peça, casos originais e inéditos, resposta digitada ou manuscrita com correção pelo espelho e avaliação da caligrafia.",
      stats: nPecas == null ? "Abrindo a pasta no Drive…" : `${nPecas} peça(s)${nPecas ? ` · ${respondidas(["peca"])} respondida(s)` : ""}`, pend: pend("pecas") }
  ];
  const html = `<header class="pe-topo"><div><button type="button" class="mini" id="peVoltar">‹ Meus concursos</button><h1 style="margin-top:10px">Estudar</h1><p class="sub">Escolha como quer estudar hoje.</p></div></header>
    ${typeof htmlCartaoPlano === "function" ? htmlCartaoPlano() : ""}
    <div class="pe-cards">${cartoes.map(c => `<button type="button" class="pe-card" data-pearea="${c.area}">${c.pend ? `<span class="badge-pend" title="prova impressa aguardando correção">${c.pend}</span>` : ""}
      <span class="pe-ic" aria-hidden="true">${ICONES_ESTUDO[c.area]}</span><h3>${c.titulo}</h3><p>${c.texto}</p>
      ${c.pend ? `<p class="pe-pend">${c.pend} prova(s) impressa(s) aguardando correção</p>` : ""}<p class="pe-stats">${esc(c.stats)}</p></button>`).join("")}</div>
    <p class="note" style="text-align:center;margin-top:18px">As questões e correções são feitas pela IA Gemini. Seu histórico fica salvo na sua conta e aparece em qualquer aparelho.</p>`;
  if (html !== ultimoHtmlEstudo || !$("pgEstudo").innerHTML) { $("pgEstudo").innerHTML = html; ultimoHtmlEstudo = html; }   // só redesenha se mudou
}
function abrirAreaEstudo(area) {
  estudoAba = "";   // sai da área anterior (a Lei seca mantém as telas compartilhadas dentro dela)
  const aba = area === "info" ? "praticar" : area === "lei" ? (Object.keys(lerEst("leisBaixadas", {})).length ? "lei-ler" : "lei-leis") : area;
  carregarJulgados().then(() => { desenharEstudo(aba); if (!cadernoDriveChecado) atualizarDoDrive(); });
  desenharEstudo(aba);
  const d = $("dlgEstudo"); if (!d.open) d.showModal();
  $("estudoConteudo").scrollTop = 0;
}

document.addEventListener("click", e => {
  const c = e.target.closest("[data-pearea]"); if (c) { abrirAreaEstudo(c.dataset.pearea); return; }
  if (e.target.closest("#peVoltar")) { if (history.length > 1 && naPaginaEstudo()) history.back(); else location.hash = ""; }
});
window.addEventListener("hashchange", mostrarPagina);
// ao fechar o modal, os números dos cartões se atualizam
document.addEventListener("close", e => { if (e.target.id === "dlgEstudo") setTimeout(renderEstudoPagina, 0); }, true);
// quando o histórico ou a pasta terminam de carregar
setInterval(() => { if (typeof $ === "function" && naPaginaEstudo() && !$("app").hidden) { carregarDadosEstudo(); if (!($("dlgEstudo") || {}).open) renderEstudoPagina(); } }, 2000);
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mostrarPagina); else mostrarPagina();   // depois que o script principal (que define $) rodar
