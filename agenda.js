// Google Agenda de quem está usando o app (não da conta que publicou o Apps Script).
// O app pede ao Google permissão para mexer só nos eventos da agenda (escopo calendar.events) e grava pela API do Google Agenda.
// Cada fase com data vira um evento marcado com "meusConcursos" nas propriedades privadas: assim o app acha, atualiza e apaga
// só os eventos que ele mesmo criou, em qualquer aparelho.

const ESCOPO_AGENDA = "https://www.googleapis.com/auth/calendar.events";
const API_AGENDA = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
let agendaTokenCliente = null, agendaTimer = null, agendaRodando = false, agendaPendente = false;

function chaveAgenda() { return chaveUsuario("meus-concursos-agenda"); }
function chaveTokenAgenda() { return chaveUsuario("meus-concursos-agenda-token"); }
function chaveAssinaturaAgenda() { return chaveUsuario("meus-concursos-agenda-sig"); }
function agendaLigada() { try { return localStorage.getItem(chaveAgenda()) === "1"; } catch (e) { return false; } }
function tokenAgenda() {
  try { const t = JSON.parse(localStorage.getItem(chaveTokenAgenda()) || "null"); return t && t.exp > Date.now() + 60000 ? t.token : null; } catch (e) { return null; }
}
function statusAgenda(txt, comBotao) {
  const st = $("agendaStatus"); if (!st) return;
  st.innerHTML = esc(txt) + (comBotao ? ` <button type="button" class="mini" id="btnAgendaAgora">Atualizar agenda agora</button>` : "");
}

// Pede o acesso ao Google (abre a janelinha do Google). Precisa ser chamado num toque/clique do usuário.
function pedirAcessoAgenda(depois) {
  if (!window.google || !google.accounts || !google.accounts.oauth2) { carregarGIS().then(() => pedirAcessoAgenda(depois)).catch(() => statusAgenda("Sem conexão com o Google.")); return; }
  if (!agendaTokenCliente) {
    agendaTokenCliente = google.accounts.oauth2.initTokenClient({
      client_id: cfg.GOOGLE_CLIENT_ID, scope: ESCOPO_AGENDA, hint: usuarioAtual && usuarioAtual.email,
      callback: r => {
        if (r.error || !r.access_token) { statusAgenda("O Google não liberou o acesso à agenda" + (r.error ? ` (${r.error})` : "") + ".", true); return; }
        try { localStorage.setItem(chaveTokenAgenda(), JSON.stringify({ token: r.access_token, exp: Date.now() + (+r.expires_in || 3600) * 1000 })); } catch (e) {}
        const f = agendaTokenCliente._depois; agendaTokenCliente._depois = null; if (f) f();
      },
      error_callback: e => statusAgenda(e && e.type === "popup_closed" ? "Janela do Google fechada antes de liberar a agenda." : "Não foi possível abrir a janela do Google (verifique se o navegador bloqueou pop-ups).", true)
    });
  }
  agendaTokenCliente._depois = depois;
  agendaTokenCliente.requestAccessToken({ prompt: "" });
}

// ---------- eventos a partir das fases ----------
function eventosDasFases() {
  const out = [];
  for (const x of itens) {
    const fases = x.fases || [], bls = blocosDeViagem(x);
    fases.forEach((f, i) => {
      if (!f.data || !/^\d{4}-\d{2}-\d{2}$/.test(f.data)) return;
      const bl = bls.find(b => b.fases.includes(i)), v = bl ? ((x.viagens || {})[bl.uid] || {}) : {};
      const raiz = bl ? fases[bl.raizI] : f;
      let local = v.local && (v.local.logradouro || v.local.nome) ? [v.local.nome, enderecoParaCopiar(v.local)].filter(Boolean).join(", ") : (f.local || raiz.local || x.cidade || "");
      if (v.local && v.local.sala) local += ` (${v.local.sala})`;
      const desc = [
        [x.cargo, x.banca].filter(Boolean).join(" · "),
        x.inscricao && "Inscrição nº " + x.inscricao,
        f.portoes && `Portões fecham às ${f.portoes} (horário de Brasília)`,
        textoTurno(f), resumoComposicao(f), f.obs,
        "Criado pelo app Meus Concursos."
      ].filter(Boolean).join("\n");
      let start, end;
      if (f.horario) {
        start = { dateTime: `${f.data}T${f.horario}:00-03:00`, timeZone: "America/Sao_Paulo" };   // horários dos editais: Brasília
        const fim = f.fim && f.fim > f.horario ? f.fim : somarMinutos(f.horario, +f.duracao || 240) || "23:59";
        end = { dateTime: `${f.data}T${fim}:00-03:00`, timeZone: "America/Sao_Paulo" };
      } else { start = { date: f.data }; end = { date: somarDias(f.data, 1) }; }
      const ev = { summary: `${x.nome} – ${f.nome}`, location: local, description: desc, start, end };
      ev.sig = JSON.stringify([ev.summary, ev.location, ev.description, start, end]);
      ev.chave = `${x.id}:${f.uid}`;
      out.push(ev);
    });
  }
  return out;
}
function hashTexto(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h); }

async function apiAgenda(token, metodo, url, corpo) {
  const r = await fetch(url, { method: metodo, headers: { Authorization: "Bearer " + token, ...(corpo ? { "Content-Type": "application/json" } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  if (r.status === 401) { try { localStorage.removeItem(chaveTokenAgenda()); } catch (e) {} const e = new Error("token"); e.token = true; throw e; }
  if (r.status === 403) { const j = await r.json().catch(() => ({})); const e = new Error((j.error && j.error.message) || "sem permissão"); e.permissao = true; throw e; }
  if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error("http " + r.status);
  return r.status === 204 || metodo === "DELETE" ? null : r.json().catch(() => null);
}

// Compara com o que já está na agenda e cria / atualiza / apaga só o necessário
async function sincronizarAgenda(forcar) {
  if (!agendaLigada() || !usuarioAtual) return;
  if (agendaRodando) { agendaPendente = true; return; }
  const desejados = eventosDasFases();
  const assinatura = hashTexto(desejados.map(e => e.chave + e.sig).join("|"));
  let ultima = ""; try { ultima = localStorage.getItem(chaveAssinaturaAgenda()) || ""; } catch (e) {}
  if (!forcar && assinatura === ultima) { statusAgenda(`Agenda em dia: ${desejados.length} prova(s) com data no seu Google Agenda.`); return; }
  const token = tokenAgenda();
  if (!token) { statusAgenda("Há mudanças para gravar no Google Agenda.", true); return; }
  agendaRodando = true; statusAgenda("Atualizando o Google Agenda…");
  try {
    // eventos já criados pelo app
    const existentes = {}; let pag = "";
    do {
      const j = await apiAgenda(token, "GET", `${API_AGENDA}?privateExtendedProperty=${encodeURIComponent("meusConcursos=1")}&maxResults=250&showDeleted=false${pag ? "&pageToken=" + pag : ""}`);
      for (const e of (j && j.items) || []) { const c = e.extendedProperties && e.extendedProperties.private && e.extendedProperties.private.chave; if (c) { if (existentes[c]) await apiAgenda(token, "DELETE", `${API_AGENDA}/${e.id}`); else existentes[c] = e; } }
      pag = j && j.nextPageToken;
    } while (pag);
    let criados = 0, atualizados = 0, removidos = 0;
    for (const ev of desejados) {
      const corpo = { summary: ev.summary, location: ev.location, description: ev.description, start: ev.start, end: ev.end,
        reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 1440 }, { method: "popup", minutes: 180 }] },
        extendedProperties: { private: { meusConcursos: "1", chave: ev.chave, sig: hashTexto(ev.sig) } } };
      const at = existentes[ev.chave]; delete existentes[ev.chave];
      if (!at) { await apiAgenda(token, "POST", API_AGENDA, corpo); criados++; }
      else if (at.extendedProperties.private.sig !== hashTexto(ev.sig)) { await apiAgenda(token, "PUT", `${API_AGENDA}/${at.id}`, corpo); atualizados++; }
    }
    for (const e of Object.values(existentes)) { await apiAgenda(token, "DELETE", `${API_AGENDA}/${e.id}`); removidos++; }
    try { localStorage.setItem(chaveAssinaturaAgenda(), assinatura); } catch (e) {}
    const mud = [criados && `${criados} criado(s)`, atualizados && `${atualizados} atualizado(s)`, removidos && `${removidos} removido(s)`].filter(Boolean).join(", ");
    statusAgenda(`Agenda em dia: ${desejados.length} prova(s) com data no seu Google Agenda${mud ? " (" + mud + " agora)" : ""}.`);
  } catch (e) {
    if (e.token) statusAgenda("O acesso ao Google Agenda expirou.", true);
    else if (e.permissao) statusAgenda("O Google recusou: " + e.message + " Verifique se a API do Google Agenda está ativada no projeto (veja CONFIGURAR-LOGIN.md).", true);
    else statusAgenda(navigator.onLine ? "Não foi possível falar com o Google Agenda agora; tento de novo depois." : "Sem internet: a agenda será atualizada quando a conexão voltar.", navigator.onLine);
  } finally {
    agendaRodando = false;
    if (agendaPendente) { agendaPendente = false; setTimeout(() => sincronizarAgenda(), 500); }
  }
}
function agendarAgenda() { clearTimeout(agendaTimer); agendaTimer = setTimeout(() => sincronizarAgenda(), 2000); }

// Precisa de acesso novo (a cada ~1 hora) e há mudança: aproveita o toque em "Salvar" para pedir, sem janela extra depois
function talvezPedirAcessoNoToque() {
  if (agendaLigada() && !tokenAgenda()) pedirAcessoAgenda(() => agendarAgenda());
}

function iniciarAgendaUI() {
  $("chkAgenda").checked = agendaLigada();
  $("agendaEmail").textContent = usuarioAtual && usuarioAtual.email ? `(${usuarioAtual.email})` : "";
  if (agendaLigada()) sincronizarAgenda(); else statusAgenda("Cada fase com data vira um evento no seu Google Agenda, com lembretes 1 dia e 3 horas antes.");
}
document.addEventListener("change", e => {
  if (e.target.id !== "chkAgenda") return;
  try { localStorage.setItem(chaveAgenda(), e.target.checked ? "1" : "0"); } catch (err) {}
  if (e.target.checked) { statusAgenda("Aguardando a permissão do Google…"); pedirAcessoAgenda(() => sincronizarAgenda(true)); }
  else statusAgenda("Desligado. Os eventos já criados continuam na sua agenda.");
});
document.addEventListener("click", e => {
  if (e.target.id === "btnAgendaAgora") { pedirAcessoAgenda(() => sincronizarAgenda(true)); return; }
  if (e.target.id === "btnSalvar" || e.target.id === "vgSalvar") talvezPedirAcessoNoToque();
}, true);
