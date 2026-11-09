// Barra lateral (abre pelo botão ☰ com a foto, no alto, e desliza da esquerda): foto, nome, e-mail, local e data,
// navegação e "Editar perfil". Por ora, guarda os horários de estudo:
// dias úteis, sábado e domingo e um período de férias (com mais horas). O Plano de estudos usa esses horários
// (cada hora vira um bloco do ciclo). Fica em lerEst("plano").perfil → sincronizado entre os aparelhos.

const ICONE_LAPIS = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const GRUPOS_HORA = [
  ["util", "Dias úteis", "segunda a sexta"],
  ["fds", "Sábado e domingo", ""],
  ["futil", "Dias úteis nas férias", "segunda a sexta"],
  ["ffds", "Fim de semana nas férias", ""]
];
const doisDig = n => String(n).padStart(2, "0"), paraHora = m => `${doisDig(Math.floor(m / 60))}:${doisDig(m % 60)}`;
const deHora = s => { const m = String(s || "").match(/^(\d{1,2}):(\d\d)/); return m ? +m[1] * 60 + +m[2] : null; };

function rascunhoDoPerfil() {
  const p = perfilPlano(), per = t => periodosDeTexto(t).map(([a, b]) => [paraHora(a), paraHora(b)]);
  return { util: per(p.util), fds: per(p.fds), futil: per(p.ferias.util), ffds: per(p.ferias.fds), ferias: !!p.ferias.ate, de: p.ferias.de || "", ate: p.ferias.ate || "" };
}
function rascunhoDaTela() {
  const r = { ferias: !!($("pfFerias") || {}).checked };
  if ($("pfAte")) { r.de = $("pfDe").value || ""; r.ate = $("pfAte").value || ""; }
  GRUPOS_HORA.forEach(([g]) => { const box = document.querySelector(`#perfilPainel [data-pfgrupo="${g}"]`); if (box) r[g] = [...box.querySelectorAll(".pf-linha")].map(l => [l.querySelector(".pf-ini").value, l.querySelector(".pf-fim").value]); });
  return r;   // grupos que não estão na tela (férias desligadas) ficam de fora e são mantidos como estavam
}
const horasDe = lista => lista.reduce((a, [x, y]) => { const i = deHora(x), f = deHora(y); return a + (i != null && f != null && f > i ? Math.floor((f - i) / 60) : 0); }, 0);

function htmlGrupoHoras(g, titulo, sub, lista) {
  return `<div class="pf-grupo" data-pfgrupo="${g}">
    <div class="pf-grupo-topo"><div><b>${titulo}</b>${sub ? `<span>${sub}</span>` : ""}</div><span class="pf-total">${horasDe(lista)} h por dia</span></div>
    ${lista.map(([a, b], k) => `<div class="pf-linha"><input type="time" class="pf-ini" value="${a}" step="900" aria-label="Início"><span>até</span><input type="time" class="pf-fim" value="${b}" step="900" aria-label="Fim"><button type="button" class="pf-tirar" data-pftirar="${g}:${k}" aria-label="Tirar este período">×</button></div>`).join("")}
    ${lista.length ? "" : `<p class="pf-vazio">Sem estudo nesses dias.</p>`}
    <button type="button" class="pf-mais" data-pfmais="${g}">+ Adicionar período</button></div>`;
}
function desenharPerfil(r, aviso) {
  const u = (typeof usuarioAtual !== "undefined" && usuarioAtual) || {}, pf = (typeof perfil !== "undefined" && perfil) || {};
  const nome = pf.nome || u.nome || "", email = pf.email || u.email || ($("usuEmail") || {}).textContent || "", foto = pf.foto || ($("usuFoto") || {}).src || "";
  const versao = typeof APP_VERSAO !== "undefined" ? APP_VERSAO : "";
  const topo = `<button type="button" class="pf-fechar" data-pffechar="1" aria-label="Fechar">×</button>
    <div class="pf-cab${pfVista === "menu" ? "" : " pequeno"}">
      ${foto ? `<img class="pf-foto" src="${esc(foto)}" alt="" referrerpolicy="no-referrer">` : `<span class="pf-foto pf-inicial">${esc((nome || email || "?")[0].toUpperCase())}</span>`}
      <b class="pf-nome">${esc(nome || "Meu perfil")}</b>
      <span class="pf-email">${esc(email)}</span>
      <span class="pf-onde">${esc(textoLocalData())}</span>
    </div><hr class="pf-div">`;
  const est = location.hash === "#estudar";
  const menu = `<div class="pf-corpo">
      <button type="button" class="pf-bt" data-pfeditar="1"><span class="pf-ic">✏️</span>Editar perfil</button>
      <button type="button" class="pf-bt${est ? "" : " on"}" data-pfnav="home"><span class="pf-ic">🗂️</span>Meus concursos</button>
      <button type="button" class="pf-bt${est ? " on" : ""}" data-pfnav="estudo"><span class="pf-ic">📚</span>Estudar</button>
      <button type="button" class="pf-bt" data-pfnav="plano"><span class="pf-ic">🗓️</span>Plano de estudos</button>
      <button type="button" class="pf-bt" data-pfgemini="1"><span class="pf-ic">🤖</span>Minha chave do Gemini<span class="pf-gem-st">${pfGem.carregou ? (pfGem.tem ? "✓ cadastrada" : pfGem.dono ? "chave do app" : "⚠️ falta cadastrar") : ""}</span></button>
      <button type="button" class="pf-bt" data-pfconfig="1"><span class="pf-ic">⚙️</span>Backup e Google Agenda</button>
      ${pfGem.dono ? `<button type="button" class="pf-bt" data-pfacesso="1"><span class="pf-ic">🛡️</span>Gestão de acesso<span class="pf-gem-st">${pfAc.carregou && pfAc.pend ? `⏳ ${pfAc.pend} pedido${pfAc.pend > 1 ? "s" : ""}` : "só o administrador"}</span></button>` : ""}
      <div class="pf-caixa"><span class="pf-ponto"></span><div><b>Horários de estudo</b><span>${esc(typeof resumoHorarios === "function" ? resumoHorarios() : "")}</span></div></div>
      <button type="button" class="pf-bt pf-bt-sair" data-pfsair="1"><span class="pf-ic">↩</span>Sair</button>
      <p class="pf-versao">versão ${esc(versao)} — Meus Concursos<br><i>Estude · Pratique · Passe</i></p>
    </div>`;
  const editar = `<div class="pf-corpo">
      <button type="button" class="pf-voltar" data-pfvoltar="1">‹ Voltar</button>
      <section class="pf-secao" id="pfHorarios">
        <h3>Editar perfil · horários de estudo</h3>
        <p class="pf-ajuda">O plano de estudos usa estes horários para saber quanto tempo você tem em cada dia. O estudo começa quando você aperta ▶ Iniciar no plano.</p>
        ${htmlGrupoHoras("util", "Dias úteis", "segunda a sexta", r.util)}
        ${htmlGrupoHoras("fds", "Sábado e domingo", "", r.fds)}
        <label class="pf-switch"><input type="checkbox" id="pfFerias"${r.ferias ? " checked" : ""}><span class="pf-trilho"></span><span><b>Férias ou período com mais tempo</b><small>Nesses dias valem os horários abaixo</small></span></label>
        ${r.ferias ? `<div class="pf-ferias">
          <div class="pf-datas"><label>De<input type="date" id="pfDe" value="${esc(r.de)}"></label><label>Até<input type="date" id="pfAte" value="${esc(r.ate)}"></label></div>
          ${htmlGrupoHoras("futil", "Dias úteis nas férias", "segunda a sexta", r.futil)}
          ${htmlGrupoHoras("ffds", "Fim de semana nas férias", "", r.ffds)}</div>` : ""}
      </section>
    </div>
    <div class="pf-rodape">${aviso ? `<span class="pf-aviso">${aviso}</span>` : ""}<button type="button" class="primary" data-pfsalvar="1">Salvar</button></div>`;
  const config = `<div class="pf-corpo">
      <button type="button" class="pf-voltar" data-pfvoltar="1">‹ Voltar</button>
      <section class="pf-secao"><h3>Backup e Google Agenda</h3><div id="pfConfigSlot"></div></section></div>`;
  const gem = `<div class="pf-corpo">
      <button type="button" class="pf-voltar" data-pfvoltar="1">‹ Voltar</button>
      <section class="pf-secao"><h3>Minha chave do Gemini (IA)</h3>
        <p class="pf-ajuda">A IA do app (questões, correções, plano de estudos) usa a <b>sua</b> conta gratuita do Gemini, do Google. Assim cada pessoa tem a sua própria cota e ninguém gasta a do outro.</p>
        ${!pfGem.carregou ? `<p class="pf-ajuda">Conferindo…</p>` : pfGem.tem ? `<p class="pf-gem-ok">✓ Chave cadastrada: <b>${esc(pfGem.mascara)}</b>. Vale em todos os seus aparelhos.</p>`
          : pfGem.dono ? `<p class="pf-gem-ok">✓ Você usa a chave do app (dono). Se quiser, pode cadastrar outra abaixo.</p>` : `<p class="pf-gem-falta">⚠️ Você ainda não cadastrou a sua chave: sem ela, a IA não funciona para você.</p>`}
        <ol class="pf-passos"><li>Abra o <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a> e entre com a sua conta Google.</li>
          <li>Toque em <b>Create API key</b> (Criar chave de API). Se pedir, aceite os termos e escolha/crie um projeto.</li>
          <li>Toque no ícone de <b>copiar</b> ao lado da chave e cole abaixo. Ela começa com <b>AIza…</b> ou, nas contas novas, com <b>AQ.…</b>. É grátis e não precisa de cartão.</li></ol>
        <label class="pf-gem-campo">Chave<input id="pfGemChave" type="password" autocomplete="off" placeholder="AIza… ou AQ.…" spellcheck="false"></label>
        ${pfGem.msg ? `<p class="${pfGem.erro ? "pf-gem-falta" : "pf-gem-ok"}" role="status">${esc(pfGem.msg)}</p>` : ""}
        <div class="pf-gem-bts"><button type="button" class="primary" data-pfgemsalvar="1"${pfGem.salvando ? " disabled" : ""}>${pfGem.salvando ? "Testando a chave…" : "Testar e salvar"}</button>
          ${pfGem.tem ? `<button type="button" data-pfgemapagar="1">Apagar minha chave</button>` : ""}</div>
        <p class="pf-ajuda">A chave fica guardada no servidor do app, ligada ao seu e-mail, e nunca aparece de novo inteira. No plano gratuito, o Google pode usar o conteúdo enviado à IA para melhorar os produtos dele.</p>
      </section></div>`;
  $("perfilPainel").classList.toggle("largo", pfVista === "editar");
  guardarAjustesApp();   // a edição dos horários precisa de mais espaço
  const painel = $("perfilPainel"), aviso_ = $("toast") && painel.contains($("toast")) ? $("toast") : null;
  painel.innerHTML = topo + (pfVista === "menu" ? menu : pfVista === "config" ? config : pfVista === "gemini" ? gem : pfVista === "acesso" ? htmlAcesso() : editar);
  if (pfVista === "config") { const a = $("ajustesApp"); if (a) { $("pfConfigSlot").appendChild(a); a.hidden = false; } }
  if (aviso_) painel.appendChild(aviso_);   // o aviso (toast) que estava aqui dentro não pode sumir junto
}
// barra lateral: "menu" (perfil, navegação e sair) ou "editar" (horários de estudo)
let pfVista = "menu";
// ---------- Gestão de acesso (só o administrador: e-mails da propriedade DONOS do Apps Script) ----------
let pfAc = { carregou: false, lista: [], pend: 0, msg: "", erro: false, ocupado: false };
async function carregarAcesso(op, alvo, st) {
  try {
    pfAc.ocupado = true;
    const r = await postScript({ acao: "acesso", sessao: usuarioAtual.sessao, op: op || "listar", ...(alvo ? { alvo } : {}), ...(st ? { st } : {}) });
    if (!r.ok) { pfAc.msg = /desconhecida/i.test(r.erro || "") ? "O Apps Script ainda não tem esta função: atualize o script." : r.erro; pfAc.erro = true; return false; }
    Object.assign(pfAc, { carregou: true, lista: r.lista || [], pend: (r.lista || []).filter(x => x.st === "pend").length, erro: false });
    return true;
  } catch (e) { pfAc.msg = "Sem conexão com o servidor."; pfAc.erro = true; return false; }
  finally { pfAc.ocupado = false; }
}
function htmlAcesso() {
  const data = d => { try { return d ? new Date(d).toLocaleDateString("pt-BR") : ""; } catch (e) { return ""; } };
  const linha = (x, bts) => `<div class="ac-lin"><div class="ac-quem"><b>${esc(x.nome || x.email)}</b>${x.nome ? `<small>${esc(x.email)}</small>` : ""}<small>${x.st === "pend" ? "pediu em " + data(x.pedido) : (x.st === "ok" ? "autorizado" : "bloqueado") + (x.decidido ? " em " + data(x.decidido) : "") + (x.obs ? " · " + esc(x.obs) : "")}</small></div>${bts}</div>`;
  const bt = (x, st, txt, cls) => `<button type="button"${cls ? ` class="${cls}"` : ""} data-pfacdef="${esc(x.email)}" data-st="${st}"${pfAc.ocupado ? " disabled" : ""}>${txt}</button>`;
  const grupo = st => pfAc.lista.filter(x => x.st === st);
  const pend = grupo("pend"), ok = grupo("ok"), bloq = grupo("bloq");
  return `<div class="pf-corpo">
      <button type="button" class="pf-voltar" data-pfvoltar="1">‹ Voltar</button>
      <section class="pf-secao"><h3>🛡️ Gestão de acesso</h3>
        <p class="pf-ajuda">Só entra no app quem você autorizar. Quem tenta entrar sem autorização vira um pedido aqui, e você recebe um e-mail avisando. Ao autorizar, a pessoa também é avisada por e-mail. Ao bloquear, ela é desconectada de todos os aparelhos.</p>
        ${pfAc.msg ? `<p class="${pfAc.erro ? "pf-gem-falta" : "pf-gem-ok"}" role="status">${esc(pfAc.msg)}</p>` : ""}
        ${!pfAc.carregou ? `<p class="pf-ajuda">Carregando…</p>` : `
        <h4 class="ac-sec">⏳ Pedidos aguardando (${pend.length})</h4>
        ${pend.length ? pend.map(x => linha(x, bt(x, "ok", "Autorizar", "primary") + bt(x, "remover", "Recusar"))).join("") : `<p class="pf-ajuda">Nenhum pedido no momento.</p>`}
        <h4 class="ac-sec">✅ Autorizados (${ok.length})</h4>
        ${ok.length ? ok.map(x => linha(x, bt(x, "bloq", "Bloquear"))).join("") : `<p class="pf-ajuda">Ninguém além de você, por enquanto.</p>`}
        ${bloq.length ? `<h4 class="ac-sec">⛔ Bloqueados (${bloq.length})</h4>${bloq.map(x => linha(x, bt(x, "ok", "Desbloquear") + bt(x, "remover", "Excluir"))).join("")}` : ""}
        <h4 class="ac-sec">➕ Autorizar antes de a pessoa entrar</h4>
        <div class="ac-novo"><input id="pfAcNovo" type="email" placeholder="e-mail da conta Google" autocomplete="off"><button type="button" class="primary" data-pfacadd="1"${pfAc.ocupado ? " disabled" : ""}>Autorizar</button></div>
        <p class="pf-ajuda">Você (administrador) sempre tem acesso. Para incluir outro administrador, acrescente o e-mail dele na propriedade DONOS do Apps Script.</p>`}
      </section></div>`;
}
// estado da chave do Gemini do usuário (vem do servidor; a chave em si nunca volta inteira)
let pfGem = { carregou: false, tem: false, dono: false, mascara: "", msg: "", erro: false, salvando: false };
async function carregarChaveGemini(op, chave) {
  try {
    const r = await postScript({ acao: "geminiChave", sessao: usuarioAtual.sessao, op: op || "estado", ...(chave ? { chave } : {}) });
    if (!r.ok) { pfGem.msg = /desconhecida/i.test(r.erro || "") ? "O Apps Script ainda não tem esta função: atualize o script." : r.erro; pfGem.erro = true; return false; }
    Object.assign(pfGem, { carregou: true, tem: !!r.tem, dono: !!r.dono, mascara: r.mascara || "" });
    if (typeof iaIndisponivel !== "undefined" && (r.tem || r.dono)) iaIndisponivel = "";   // a IA volta a funcionar sem recarregar o app
    return true;
  } catch (e) { pfGem.msg = "Sem conexão com o servidor."; pfGem.erro = true; return false; }
}
function abrirPerfil(vista) {
  pfVista = vista || "menu";
  let d = $("perfilPainel");
  if (!d) { d = document.createElement("dialog"); d.id = "perfilPainel"; d.className = "pf-painel"; d.setAttribute("aria-label", "Meu perfil"); document.body.appendChild(d); }
  desenharPerfil(rascunhoDoPerfil());
  if (!d.open) d.showModal();   // dialog modal: fica por cima de qualquer outra janela aberta (ex.: o Plano de estudos)
}
function fecharPerfil() { const d = $("perfilPainel"); if (d && d.open) { d.classList.add("saindo"); setTimeout(() => { d.classList.remove("saindo"); d.close(); guardarAjustesApp(); }, 180); } }
// backup e Google Agenda: os mesmos elementos da tela inicial (com seus botões já ligados) são levados para dentro da barra lateral
function guardarAjustesApp() { const a = $("ajustesApp"), casa = $("ajustesAppCasa"); if (a && casa && a.parentNode !== casa) { a.hidden = true; casa.appendChild(a); } }
function salvarPerfil() {
  const r = rascunhoDaTela(), txt = l => l.filter(([a, b]) => deHora(a) != null && deHora(b) != null && deHora(b) > deHora(a)).map(([a, b]) => `${a}-${b}`).join(", ");
  const ruim = GRUPOS_HORA.some(([g]) => (r[g] || []).some(([a, b]) => !(deHora(b) > deHora(a))));
  if (ruim) { desenharPerfil(r, "Algum período termina antes de começar. Confira os horários em vermelho."); marcarRuins(); return; }
  const base = rascunhoDoPerfil(); if (r.de === undefined) { r.de = base.de; r.ate = base.ate; }
  if (r.ferias && !r.ate) { desenharPerfil(r, "Informe até quando vão as férias."); return; }
  if (r.ferias && r.de && r.de > r.ate) { desenharPerfil(r, "A data de início das férias está depois da data final."); return; }
  const antigo = perfilPlano();
  gravarPlano("perfil", { util: txt(r.util), fds: txt(r.fds), ferias: { de: r.ferias ? r.de : "", ate: r.ferias ? r.ate : "", util: r.futil ? txt(r.futil) : antigo.ferias.util, fds: r.ffds ? txt(r.ffds) : antigo.ferias.fds } });
  if (typeof apagarDiaDeHoje === "function") apagarDiaDeHoje();   // o dia de hoje é refeito com os novos horários
  if (typeof redesenharPlano === "function") redesenharPlano();
  toast("Horários salvos."); pfVista = "menu"; desenharPerfil(rascunhoDoPerfil());
}
function marcarRuins() {
  document.querySelectorAll("#perfilPainel .pf-linha").forEach(l => { const a = deHora(l.querySelector(".pf-ini").value), b = deHora(l.querySelector(".pf-fim").value); l.classList.toggle("ruim", !(b > a)); });
}

document.addEventListener("click", e => {
  if (e.target.closest("#btnPerfil")) { abrirPerfil("menu"); return; }
  if (e.target.closest("[data-abrirperfil]")) { abrirPerfil("editar"); return; }
  if (e.target.closest("[data-abriracesso]")) { abrirPerfil("acesso"); carregarAcesso().then(() => { if (pfVista === "acesso") desenharPerfil(rascunhoDoPerfil()); }); return; }
  if (e.target.closest("[data-abrirgemini]")) { abrirPerfil("gemini"); carregarChaveGemini().then(() => { if (pfVista === "gemini") desenharPerfil(rascunhoDoPerfil()); }); return; }
  const d = $("perfilPainel"); if (!d || !d.open) return;
  if (e.target === d) { fecharPerfil(); return; }   // clique no fundo escurecido
  const t = e.target.closest("button"); if (!t || !d.contains(t)) return;
  const k = t.dataset;
  if (k.pffechar) { fecharPerfil(); return; }
  if (k.pfeditar) { pfVista = "editar"; desenharPerfil(rascunhoDoPerfil()); return; }
  if (k.pfconfig) { pfVista = "config"; desenharPerfil(rascunhoDoPerfil()); return; }
  if (k.pfgemini) { pfVista = "gemini"; pfGem.msg = ""; desenharPerfil(rascunhoDoPerfil()); carregarChaveGemini().then(() => { if (pfVista === "gemini") desenharPerfil(rascunhoDoPerfil()); }); return; }
  if (k.pfgemsalvar) {
    const c = (($("pfGemChave") || {}).value || "").trim(); if (!c) { pfGem.msg = "Cole a chave no campo antes de salvar."; pfGem.erro = true; desenharPerfil(rascunhoDoPerfil()); return; }
    pfGem.salvando = true; pfGem.msg = ""; desenharPerfil(rascunhoDoPerfil());
    carregarChaveGemini("salvar", c).then(ok => { pfGem.salvando = false; if (ok) { pfGem.msg = "Chave testada e salva. A IA já está funcionando para você."; pfGem.erro = false; toast("Chave do Gemini salva."); } if (pfVista === "gemini") desenharPerfil(rascunhoDoPerfil()); });
    return;
  }
  if (k.pfgemapagar) { carregarChaveGemini("apagar").then(ok => { if (ok) { pfGem.msg = "Chave apagada."; pfGem.erro = false; } if (pfVista === "gemini") desenharPerfil(rascunhoDoPerfil()); }); return; }
  if (k.pfacesso) { pfVista = "acesso"; pfAc.msg = ""; desenharPerfil(rascunhoDoPerfil()); carregarAcesso().then(() => { if (pfVista === "acesso") desenharPerfil(rascunhoDoPerfil()); }); return; }
  if (k.pfacdef || k.pfacadd) {
    const alvo = k.pfacadd ? (($("pfAcNovo") || {}).value || "").trim() : k.pfacdef, st = k.pfacadd ? "" : k.st;
    if (!alvo) { pfAc.msg = "Digite o e-mail da pessoa."; pfAc.erro = true; desenharPerfil(rascunhoDoPerfil()); return; }
    pfAc.msg = ""; const pr = carregarAcesso(k.pfacadd ? "adicionar" : "definir", alvo, st); desenharPerfil(rascunhoDoPerfil());
    pr.then(ok => { if (ok) { pfAc.msg = (k.pfacadd || st === "ok" ? "Acesso autorizado para " : st === "bloq" ? "Acesso bloqueado para " : "Removido: ") + alvo + "."; toast(pfAc.msg); } if (pfVista === "acesso") desenharPerfil(rascunhoDoPerfil()); });
    return;
  }
  if (k.pfvoltar) { pfVista = "menu"; desenharPerfil(rascunhoDoPerfil()); return; }
  if (k.pfnav) {
    fecharPerfil();
    if (k.pfnav === "home") { const d = $("dlgEstudo"); if (d && d.open) d.close(); if (location.hash) location.hash = ""; }
    else if (k.pfnav === "estudo") { if (location.hash !== "#estudar") location.hash = "#estudar"; }
    else setTimeout(abrirPlanoMaisProximo, 200);   // plano do concurso com a prova mais próxima
    return;
  }
  if (k.pfsalvar) { salvarPerfil(); return; }
  if (k.pfsair) { fecharPerfil(); setTimeout(() => $("btnSair").click(), 200); return; }
  if (k.pfmais) {
    const r = rascunhoDaTela(), l = r[k.pfmais], ult = l[l.length - 1], fim = ult ? deHora(ult[1]) : null;
    l.push(fim != null && fim + 120 <= 23 * 60 ? [paraHora(fim + 60), paraHora(fim + 180)] : ["08:00", "10:00"]); desenharPerfil(r); return;
  }
  if (k.pftirar) { const [g, i] = k.pftirar.split(":"), r = rascunhoDaTela(); r[g].splice(+i, 1); desenharPerfil(r); return; }
});
document.addEventListener("change", e => {
  const d = $("perfilPainel"); if (!d || !d.open || !d.contains(e.target)) return;
  if (e.target.id === "pfFerias") { desenharPerfil({ ...rascunhoDoPerfil(), ...rascunhoDaTela() }); return; }
});
document.addEventListener("input", e => {
  const d = $("perfilPainel"); if (!d || !d.open || !e.target.matches(".pf-ini,.pf-fim")) return;
  const g = e.target.closest("[data-pfgrupo]"), r = rascunhoDaTela();
  g.querySelector(".pf-total").textContent = `${horasDe(r[g.dataset.pfgrupo])} h por dia`; marcarRuins();
});
document.addEventListener("cancel", e => { if (e.target.id === "perfilPainel") { e.preventDefault(); fecharPerfil(); } }, true);

// ---------- local e data (embaixo do e-mail) ----------
// a cidade vem da conexão de internet (sem pedir permissão de localização) e fica guardada por um dia
let localUsuario = (() => { try { const c = JSON.parse(localStorage.getItem("mc-local") || "null"); return c && c.dia === hojeISO() ? c : null; } catch (e) { return null; } })();
async function descobrirLocal() {
  if (localUsuario) return;
  try {
    const r = await (await fetch("https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=pt")).json();
    const uf = String(r.principalSubdivisionCode || "").split("-")[1] || r.principalSubdivision || "";
    const cidade = r.city || r.locality || "";
    if (cidade || uf) { localUsuario = { dia: hojeISO(), txt: [cidade, uf].filter(Boolean).join(" – ") }; try { localStorage.setItem("mc-local", JSON.stringify(localUsuario)); } catch (e) {} }
  } catch (e) { /* sem internet: mostra só a data */ }
  mostrarLocalData();
}
function textoLocalData() {
  const curto = false, d = new Date().toLocaleDateString("pt-BR", curto ? { weekday: "short", day: "numeric", month: "short" } : { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return [localUsuario && localUsuario.txt, d].filter(Boolean).join(" · ");
}
function mostrarLocalData() { const el = document.querySelector("#perfilPainel .pf-onde"); if (el) el.textContent = textoLocalData(); }
const iniciarLocal = () => { mostrarLocalData(); descobrirLocal(); };
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciarLocal); else iniciarLocal();   // depois do script principal (que define $)
setInterval(mostrarLocalData, 60000);   // a data vira sozinha à meia-noite

// logo depois de entrar: confere se o usuário já tem chave do Gemini (para o aviso na tela inicial e o status no menu)
setInterval(() => {
  if (pfGem.pedido || typeof usuarioAtual === "undefined" || !usuarioAtual || !usuarioAtual.sessao) return;
  pfGem.pedido = true; carregarChaveGemini().then(async ok => {
    if (!ok) { pfGem.pedido = false; return; }
    if (pfGem.dono) await carregarAcesso();   // o administrador vê na tela inicial se há pedidos de acesso
    if (typeof render === "function") render();
  });
}, 3000);
function htmlAvisoAcesso() {
  if (!pfGem.dono || !pfAc.pend) return "";
  return `<div class="hj-faixa"><span class="hj-ic">🛡️</span><div class="hj-txt"><b>${pfAc.pend} pedido${pfAc.pend > 1 ? "s" : ""} de acesso aguardando</b><span>Só entra no app quem você autorizar.</span></div><button type="button" class="primary" data-abriracesso="1">Ver pedidos</button></div>`;
}
// aviso na tela inicial para quem ainda não cadastrou a chave
function htmlAvisoGemini() {
  if (!pfGem.carregou || pfGem.tem || pfGem.dono) return "";
  return `<div class="hj-faixa"><span class="hj-ic">🤖</span><div class="hj-txt"><b>Cadastre a sua chave do Gemini para usar a IA</b><span>É grátis e leva 2 minutos: questões, correções e plano de estudos usam a sua própria cota.</span></div><button type="button" class="primary" data-abrirgemini="1">Cadastrar</button></div>`;
}
