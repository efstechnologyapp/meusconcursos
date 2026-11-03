// Transporte e hospedagem de cada viagem do concurso.
// Uma viagem = um bloco de fases no mesmo local (fases no mesmo dia ou no dia seguinte).
// Guardado em item.viagens[uid da 1ª fase do bloco] = { transporte, hospedagem }.

const AEROPORTOS = [
  ["AJU","Aracaju"],["BEL","Belém"],["BSB","Brasília"],["BVB","Boa Vista"],["CGB","Cuiabá"],["CGH","São Paulo – Congonhas"],
  ["CGR","Campo Grande"],["CNF","Belo Horizonte – Confins"],["CWB","Curitiba"],["FLN","Florianópolis"],["FOR","Fortaleza"],
  ["GIG","Rio de Janeiro – Galeão"],["GRU","São Paulo – Guarulhos"],["GYN","Goiânia"],["IGU","Foz do Iguaçu"],["IMP","Imperatriz"],
  ["IOS","Ilhéus"],["JDO","Juazeiro do Norte"],["JPA","João Pessoa"],["JOI","Joinville"],["LDB","Londrina"],["MAB","Marabá"],
  ["MAO","Manaus"],["MCP","Macapá"],["MCZ","Maceió"],["MGF","Maringá"],["MOC","Montes Claros"],["NAT","Natal"],["NVT","Navegantes"],
  ["PMW","Palmas"],["POA","Porto Alegre"],["PNZ","Petrolina"],["PVH","Porto Velho"],["RAO","Ribeirão Preto"],["RBR","Rio Branco"],
  ["REC","Recife"],["SDU","Rio de Janeiro – Santos Dumont"],["SLZ","São Luís"],["SSA","Salvador"],["STM","Santarém"],
  ["THE","Teresina"],["UDI","Uberlândia"],["VCP","Campinas – Viracopos"],["VDC","Vitória da Conquista"],["VIX","Vitória"],
  ["CPV","Campina Grande"],["CAC","Cascavel"],["XAP","Chapecó"],["BPS","Porto Seguro"],["FEN","Fernando de Noronha"]
];
const CIAS = ["LATAM","GOL","Azul","Voepass","TAP","Copa Airlines","Aerolíneas Argentinas","American Airlines","United"];
const PLATAFORMAS = ["Booking.com","Airbnb","Hoteis.com","Expedia","Decolar","Trivago","Agoda","Direto com o hotel","Outra"];

const SVG_AVIAO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>`;
const SVG_HOTEL = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9a4 4 0 0 0-4-4z"/></svg>`;
const SVG_CARRO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.9 6a1.5 1.5 0 0 0-1.4-1h-11a1.5 1.5 0 0 0-1.4 1L3 12v8a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h12v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-8zM6.5 16a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm11 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM5 11l1.5-4.5h11L19 11z"/></svg>`;

// ---------- Blocos de viagem ----------
// devolve [{uid, fases:[índices], inicio, fim}] — um por bloco de local
function blocosDeViagem(x) {
  const fases = x.fases || [], bl = blocosDeLocal(fases), out = [];
  fases.forEach((f, i) => {
    const b = bl[i];
    const raiz = b.herda !== undefined ? b.herda : (b.raiz && b.de !== undefined ? b.de : i);
    let v = out.find(o => o.raizI === raiz);
    if (!v) { v = { raizI: raiz, uid: fases[raiz].uid, fases: [] }; out.push(v); }
    v.fases.push(i);
  });
  out.forEach(v => {
    const datas = v.fases.map(i => fases[i].data).filter(Boolean).sort();
    v.inicio = datas[0] || ""; v.fim = datas[datas.length - 1] || "";
  });
  return out;
}
function somarDias(iso, n) { if (!iso) return ""; const d = parseData(iso); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
const minutosDe = (data, hora) => data && hora ? parseData(data).getTime() / 60000 + (+hora.slice(0, 2)) * 60 + (+hora.slice(3, 5)) : null;
const fmtMin = m => `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}`;
const diaMes = iso => { const d = parseData(iso); return d ? d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).replace(/\./g, "") : ""; };

// ---------- Resumos (estilo Google Voos) ----------
function resumoTrajeto(t, tipo) {
  if (!t) return "";
  if (tipo === "carro") {
    const q = [t.data && diaMes(t.data), t.hora && "saída " + t.hora].filter(Boolean).join(" · ");
    const rota = [t.origem, t.destino].filter(Boolean).join(" → ");
    return [q, rota].filter(Boolean).join(" · ");
  }
  const tr = (t.trechos || []).filter(s => s.de || s.para || s.partida_hora);
  if (!tr.length) return "";
  const ini = tr[0], fim = tr[tr.length - 1];
  const paradas = tr.length - 1;
  const conex = [];
  for (let k = 1; k < tr.length; k++) {
    const a = minutosDe(tr[k - 1].chegada_data || tr[k - 1].partida_data, tr[k - 1].chegada_hora), b = minutosDe(tr[k].partida_data, tr[k].partida_hora);
    conex.push(`conexão${a !== null && b !== null && b > a ? " de " + fmtMin(b - a) : ""} em ${tr[k].de || tr[k - 1].para || "?"}${tr[k].cia && tr[k].cia !== tr[k - 1].cia ? " (troca para " + tr[k].cia + ")" : ""}`);
  }
  const mais1 = ini.partida_data && fim.chegada_data && fim.chegada_data > ini.partida_data ? " (+1)" : "";
  const cias = [...new Set(tr.map(s => s.cia).filter(Boolean))].join(" + ");
  return [ini.partida_data && diaMes(ini.partida_data),
    `${ini.de || "?"} ${ini.partida_hora || ""} → ${fim.para || "?"} ${fim.chegada_hora || ""}${mais1}`.replace(/\s+/g, " ").trim(),
    paradas ? `${paradas} parada${paradas > 1 ? "s" : ""}: ${conex.join("; ")}` : "direto",
    cias, t.localizador && "localizador " + t.localizador].filter(Boolean).join(" · ");
}
function resumoTransporte(tp) {
  if (!tp || !tp.tipo) return "";
  const nome = tp.tipo === "carro" ? "Carro" : "Avião";
  const ida = resumoTrajeto(tp.ida, tp.tipo), volta = resumoTrajeto(tp.volta, tp.tipo);
  return [ida && `${nome} – ida: ${ida}`, volta && `${nome} – volta: ${volta}`].filter(Boolean).join("\n") || nome;
}
function enderecoHosp(h) {
  return [[h.logradouro, h.numero].filter(Boolean).join(", "), h.complemento, h.bairro, [h.cidade, h.uf].filter(Boolean).join("/"), h.cep && "CEP " + h.cep].filter(Boolean).join(" – ");
}
function resumoHospedagem(h) {
  if (!h) return "";
  const l = [];
  if (h.nome) l.push(h.nome);
  const end = enderecoHosp(h); if (end) l.push(end);
  const ci = [h.checkin_data && fmtCurta(h.checkin_data), h.checkin_hora].filter(Boolean).join(" "), co = [h.checkout_data && fmtCurta(h.checkout_data), h.checkout_hora].filter(Boolean).join(" ");
  if (ci || co) l.push([ci && "check-in " + ci, co && "check-out " + co].filter(Boolean).join(" · "));
  const r = [h.plataforma, h.codigo && "reserva " + h.codigo, h.responsavel && "em nome de " + h.responsavel].filter(Boolean).join(" · ");
  if (r) l.push(r);
  return l.join("\n");
}

// ---------- HTML no modal de detalhes ----------
function htmlBotoesViagem(x, uid) {
  const v = (x.viagens || {})[uid] || {};
  const temT = !!(v.transporte && v.transporte.tipo), temH = !!(v.hospedagem && resumoHospedagem(v.hospedagem));
  return `<span class="viagem-btns">
    <button type="button" class="ic-btn${temT ? " on" : ""}" data-viagem="transporte" data-uid="${esc(uid)}" title="Transporte" aria-label="Transporte">${v.transporte && v.transporte.tipo === "carro" ? SVG_CARRO : SVG_AVIAO}</button>
    <button type="button" class="ic-btn${temH ? " on" : ""}" data-viagem="hospedagem" data-uid="${esc(uid)}" title="Hospedagem" aria-label="Hospedagem">${SVG_HOTEL}</button></span>`;
}
function htmlResumoViagem(x, uid) {
  const v = (x.viagens || {})[uid] || {};
  const t = resumoTransporte(v.transporte), h = resumoHospedagem(v.hospedagem);
  const mapa = v.hospedagem && enderecoHosp(v.hospedagem);
  return (t ? `<div class="viagem-res"><span class="vr-ic">${v.transporte.tipo === "carro" ? SVG_CARRO : SVG_AVIAO}</span><p class="pre">${esc(t)}</p></div>` : "") +
    (h ? `<div class="viagem-res"><span class="vr-ic">${SVG_HOTEL}</span><p class="pre">${esc(h)}${mapa ? `\n<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([v.hospedagem.nome, mapa].filter(Boolean).join(", "))}" target="_blank" rel="noopener">Abrir no mapa</a>` : ""}</p></div>` : "");
}

// ---------- Formulário ----------
let viagemAtual = null;   // {id, uid, qual, dados}
const trechoVazio = (de = "", data = "") => ({ cia: "", voo: "", de, partida_data: data, partida_hora: "", para: "", chegada_data: data, chegada_hora: "" });

function abrirViagem(id, uid, qual) {
  const x = itens.find(i => i.id === id); if (!x) return;
  const bloco = blocosDeViagem(x).find(b => b.uid === uid) || { inicio: "", fim: "", fases: [] };
  const v = JSON.parse(JSON.stringify((x.viagens || {})[uid] || {}));
  const ida = somarDias(bloco.inicio, -1), volta = somarDias(bloco.fim, 1);
  if (qual === "transporte") v.transporte = v.transporte || { tipo: "" };
  else v.hospedagem = v.hospedagem || { checkin_data: ida, checkout_data: volta, cidade: (x.cidade || "").split("/")[0].trim(), uf: ((x.cidade || "").split("/")[1] || "").trim() };
  viagemAtual = { id, uid, qual, v, ida, volta, x, bloco };
  desenharViagem();
  const dlg = $("dlgViagem"); if (!dlg.open) dlg.showModal();
}
function tituloBloco() {
  const { x, bloco } = viagemAtual;
  const nomes = bloco.fases.map(i => x.fases[i].nome).join(" + ");
  return `${esc(x.nome)}<br><span class="note">${esc(nomes)}${bloco.inicio ? " · " + esc(fmtCurta(bloco.inicio)) + (bloco.fim !== bloco.inicio ? " a " + esc(fmtCurta(bloco.fim)) : "") : ""}</span>`;
}
function desenharViagem() {
  const { qual, v } = viagemAtual;
  const corpo = qual === "transporte" ? htmlFormTransporte(v.transporte) : htmlFormHospedagem(v.hospedagem);
  $("viagemConteudo").innerHTML = `
    <div class="dlg-head"><div style="flex:1;min-width:0"><h2>${qual === "transporte" ? "Transporte" : "Hospedagem"}</h2><p class="sub">${tituloBloco()}</p></div><button type="button" class="close" data-close aria-label="Fechar">×</button></div>
    ${corpo}
    <div class="actions">${(qual === "transporte" ? v.transporte.tipo : resumoHospedagem(v.hospedagem)) ? `<button type="button" class="danger" id="vgLimpar" style="margin-right:auto">Apagar</button>` : ""}<button type="button" data-close>Cancelar</button><button type="button" class="primary" id="vgSalvar">Salvar</button></div>`;
}
function campo(rot, k, val, tipo = "text", extra = "") {
  return `<label${/w2|w4/.test(extra) ? ` class="${extra.match(/w\d/)[0]}"` : ""}>${rot}<input data-k="${k}" type="${tipo}" value="${esc(val || "")}" ${extra.replace(/w\d/, "")}></label>`;
}
function htmlFormTransporte(t) {
  const sel = `<div class="tipo-transp" role="radiogroup" aria-label="Tipo de transporte">
    <button type="button" class="opt${t.tipo === "aviao" ? " on" : ""}" data-tipo="aviao">${SVG_AVIAO} Avião</button>
    <button type="button" class="opt${t.tipo === "carro" ? " on" : ""}" data-tipo="carro">${SVG_CARRO} Carro</button></div>`;
  if (!t.tipo) return sel + `<p class="note">Escolha o transporte para preencher a ida e a volta.</p>`;
  if (t.tipo === "carro") {
    const lado = (s, nome) => `<div class="trajeto"><div class="tj-tit">${nome}</div><div class="fase-grid">
      ${campo("Data", s + ".data", t[s].data, "date")}${campo("Saída", s + ".hora", t[s].hora, "time")}
      ${campo("Saindo de", s + ".origem", t[s].origem, "text", 'w2 placeholder="cidade ou endereço"')}
      ${campo("Chegando em", s + ".destino", t[s].destino, "text", 'w4 placeholder="cidade ou endereço"')}</div></div>`;
    return sel + lado("ida", "Ida") + lado("volta", "Volta");
  }
  const lado = (s, nome) => {
    const tj = t[s];
    const trs = tj.trechos.map((r, k) => {
      let conex = "";
      if (k) {
        const a = minutosDe(tj.trechos[k - 1].chegada_data || tj.trechos[k - 1].partida_data, tj.trechos[k - 1].chegada_hora), b = minutosDe(r.partida_data, r.partida_hora);
        conex = `<div class="conexao">Conexão em ${esc(r.de || tj.trechos[k - 1].para || "…")}${a !== null && b !== null ? (b > a ? ` · ${fmtMin(b - a)} de espera` : " · confira os horários") : ""}</div>`;
      }
      return `${conex}<div class="trecho" data-s="${s}" data-k="${k}">
        <div class="tr-tit"><b>Trecho ${k + 1}</b>${k ? `<button type="button" class="fase-x" data-acao="rem-trecho" aria-label="Remover trecho">×</button>` : ""}</div>
        <div class="fase-grid">
          ${campo("Cia aérea", `${s}.${k}.cia`, r.cia, "text", 'list="dlCias" placeholder="LATAM, GOL, Azul…"')}
          ${campo("Nº do voo", `${s}.${k}.voo`, r.voo, "text", 'placeholder="ex.: G3 1234"')}
          ${campo("De (aeroporto)", `${s}.${k}.de`, r.de, "text", 'w2 list="dlAeroportos" placeholder="FOR"')}
          ${campo("Partida – data", `${s}.${k}.partida_data`, r.partida_data, "date")}
          ${campo("Partida – hora", `${s}.${k}.partida_hora`, r.partida_hora, "time")}
          ${campo("Para (aeroporto)", `${s}.${k}.para`, r.para, "text", 'w2 list="dlAeroportos" placeholder="BSB"')}
          ${campo("Chegada – data", `${s}.${k}.chegada_data`, r.chegada_data, "date")}
          ${campo("Chegada – hora", `${s}.${k}.chegada_hora`, r.chegada_hora, "time")}
        </div></div>`;
    }).join("");
    const res = resumoTrajeto(tj, "aviao");
    return `<div class="trajeto"><div class="tj-tit">${nome}${res ? `<span class="note">${esc(res)}</span>` : ""}</div>
      ${trs}
      <div class="tj-acoes"><button type="button" class="mini" data-acao="add-trecho" data-s="${s}">+ Conexão</button>
      <label class="loc">Localizador / código da reserva<input data-k="${s}.localizador" value="${esc(tj.localizador || "")}" placeholder="ex.: ABC123"></label></div></div>`;
  };
  return sel + lado("ida", "Ida") + lado("volta", "Volta") +
    `<p class="note">Voo com escala ou conexão: clique em <b>+ Conexão</b> para cada trecho seguinte. Cada trecho tem sua própria cia aérea; o app calcula o tempo de espera entre um voo e outro.</p>`;
}
function htmlFormHospedagem(h) {
  return `<div class="auto-box"><button type="button" id="vgPrint">${typeof CLIP_SVG !== "undefined" ? CLIP_SVG : ""} Preencher com print ou PDF da reserva</button>
      <input type="file" id="vgArq" accept="image/*,application/pdf,.pdf" hidden><span class="note" id="vgStatus">Booking, Airbnb, Hoteis.com, e-mail de confirmação…</span></div>
    <div class="fase-grid">
      ${campo("Hotel / pousada / anúncio", "nome", h.nome, "text", "w4")}
      ${campo("CEP", "cep", h.cep, "text", 'inputmode="numeric" placeholder="00000-000" maxlength="9"')}
      <p class="note w2 cep-st" id="vgCep">${h.cep ? "" : "Digite o CEP para preencher o endereço."}</p>
      ${campo("Rua / avenida", "logradouro", h.logradouro, "text", "w4")}
      ${campo("Número", "numero", h.numero)}
      ${campo("Complemento", "complemento", h.complemento, "text", 'placeholder="apto, bloco…"')}
      ${campo("Bairro", "bairro", h.bairro, "text", "w2")}
      ${campo("Cidade", "cidade", h.cidade, "text", "w2")}
      ${campo("UF", "uf", h.uf, "text", 'maxlength="2"')}
      <span></span>
      ${campo("Check-in – data", "checkin_data", h.checkin_data, "date")}
      ${campo("Check-in – a partir de", "checkin_hora", h.checkin_hora, "time")}
      ${campo("Check-out – data", "checkout_data", h.checkout_data, "date")}
      ${campo("Check-out – até", "checkout_hora", h.checkout_hora, "time")}
      <label class="w2">Plataforma da reserva<select data-k="plataforma"><option value=""></option>${PLATAFORMAS.map(p => `<option${p === h.plataforma ? " selected" : ""}>${p}</option>`).join("")}</select></label>
      ${campo("Código da reserva", "codigo", h.codigo, "text", "w2")}
      ${campo("Responsável pela reserva", "responsavel", h.responsavel, "text", 'w4 placeholder="nome de quem fez a reserva"')}
    </div>`;
}

// ---------- Interações ----------
function definirViagem(k, val) {
  const { qual, v } = viagemAtual;
  const alvo = qual === "transporte" ? v.transporte : v.hospedagem;
  const p = k.split(".");
  if (p.length === 1) alvo[p[0]] = val;
  else if (p.length === 2) alvo[p[0]][p[1]] = val;
  else alvo[p[0]].trechos[+p[1]][p[2]] = val;
}
function escolherTipo(tipo) {
  const t = viagemAtual.v.transporte, { ida, volta } = viagemAtual, x = viagemAtual.x;
  t.tipo = tipo;
  const destino = x.cidade || "";
  if (tipo === "carro") {
    for (const [s, d] of [["ida", ida], ["volta", volta]]) if (!t[s] || t[s].trechos) t[s] = { data: d, hora: "", origem: s === "volta" ? destino : "", destino: s === "ida" ? destino : "" };
  } else {
    for (const [s, d] of [["ida", ida], ["volta", volta]]) if (!t[s] || !t[s].trechos) t[s] = { localizador: "", trechos: [trechoVazio("", d)] };
  }
  desenharViagem();
}
async function buscarCep(cep) {
  const n = cep.replace(/\D/g, ""), st = $("vgCep");
  if (n.length !== 8) return;
  if (st) st.textContent = "Buscando endereço…";
  try {
    const r = await fetch(`https://viacep.com.br/ws/${n}/json/`).then(r => r.json());
    if (r.erro) { if (st) st.textContent = "CEP não encontrado."; return; }
    const h = viagemAtual.v.hospedagem;
    h.cep = `${n.slice(0, 5)}-${n.slice(5)}`;
    if (r.logradouro) h.logradouro = r.logradouro;
    if (r.bairro) h.bairro = r.bairro;
    if (r.localidade) h.cidade = r.localidade;
    if (r.uf) h.uf = r.uf;
    if (r.complemento && !h.complemento) h.complemento = r.complemento;
    desenharViagem();
    const s2 = $("vgCep"); if (s2) s2.textContent = "Endereço preenchido pelo CEP. Confira e informe o número.";
    const num = document.querySelector('#viagemConteudo [data-k="numero"]'); if (num && !h.numero) num.focus();
  } catch (e) { if (st) st.textContent = "Sem conexão para buscar o CEP; preencha o endereço manualmente."; }
}

// ---------- Leitura do print/PDF da reserva ----------
const MESES_R = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12, feb: 2, apr: 4, may: 5, aug: 8, sep: 9, oct: 10, dec: 12 };
function dataNoTexto(s, anoBase) {
  let m = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m) { const a = m[3] ? (m[3].length === 2 ? "20" + m[3] : m[3]) : anoBase; return `${a}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`; }
  m = s.match(/\b(\d{1,2})\s*(?:de\s+)?(jan|fev|feb|mar|abr|apr|mai|may|jun|jul|ago|aug|set|sep|out|oct|nov|dez|dec)[a-zç.]*\s*(?:de\s+)?(\d{4})?/i);
  if (m) return `${m[3] || anoBase}-${String(MESES_R[m[2].toLowerCase()]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  return "";
}
function horaNoTexto(s) {
  const m = s.match(/\b(\d{1,2})\s*(?::|h)\s*(\d{2})?\b/);
  if (!m || +m[1] > 23) return "";
  return `${String(m[1]).padStart(2, "0")}:${m[2] || "00"}`;
}
function lerReservaTexto(txt, anoBase) {
  const r = {}, t = txt.replace(/\r/g, "");
  const plat = [["Airbnb", /airbnb/i], ["Booking.com", /booking/i], ["Hoteis.com", /hot[eé]is\.com|hotels\.com/i], ["Expedia", /expedia/i], ["Decolar", /decolar/i], ["Agoda", /agoda/i], ["Trivago", /trivago/i]].find(([, re]) => re.test(t));
  if (plat) r.plataforma = plat[0];
  const trecho = re => { const m = t.match(re); return m ? t.slice(m.index + m[0].length, m.index + m[0].length + 90) : ""; };
  const ci = trecho(/check[\s-]?in|entrada/i), co = trecho(/check[\s-]?out|sa[ií]da/i);
  if (ci) { r.checkin_data = dataNoTexto(ci, anoBase); r.checkin_hora = horaNoTexto(ci.replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, "")); }
  if (co) {
    r.checkout_data = dataNoTexto(co, anoBase);
    const semData = co.replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, ""), ate = semData.match(/(?:^|\s)(?:at[ée]|[àa]s)\s*(\d{1,2}\s*(?::|h)\s*\d{0,2})/i);
    r.checkout_hora = horaNoTexto(ate ? ate[1] : semData);
  }
  let m = t.match(/CEP[:\s]*(\d{5})[-.\s]?(\d{3})/i) || t.match(/\b(\d{5})-(\d{3})\b/);
  if (m) r.cep = `${m[1]}-${m[2]}`;
  m = t.match(/(?:^|\n|,\s*|:\s*)((?:Rua|R\.|Avenida|Av\.?|Travessa|Tv\.|Alameda|Al\.|Rodovia|Estrada|Pra[cç]a|Quadra)\s[^\n,]{3,60}),?\s*(?:n[ºo°.]*\s*)?(\d{1,6}|s\/n)?/i);
  if (m) { r.logradouro = m[1].trim(); if (m[2]) r.numero = m[2]; }
  m = t.match(/(?:c[oó]digo|n[uú]mero|n[º°o])\s*(?:da|de)?\s*(?:reserva|confirma[cç][aã]o)\s*[:#]?\s*([A-Z0-9][A-Z0-9.\-]{4,}[A-Z0-9])/i) || t.match(/(?:reserva|confirma[cç][aã]o)\s*(?:n[º°o.]*|#)\s*([A-Z0-9][A-Z0-9-]{4,})/i);
  if (m) r.codigo = m[1];
  m = t.match(/(?:reservad[ao] por|nome do h[oó]spede|h[oó]spede principal|titular(?: da reserva)?|respons[aá]vel(?: pela reserva)?|h[oó]spede)\s*[:\-]?\s*([A-ZÀ-Ú][A-Za-zÀ-ú'´ ]{3,50}?)(?=\s*(?:\n|$|\d|,|\(|e-?mail|cpf|telefone))/i);
  if (m) r.responsavel = m[1].trim();
  m = t.match(/(?:sua reserva (?:em|no|na)|reserva confirmada (?:em|no|na)|hospedagem (?:em|no|na)|estadia (?:em|no|na)|você vai ficar (?:em|no|na))\s+([^\n.!]{3,60})/i);
  if (m) r.nome = m[1].replace(/\s+(?:est[aá]|foi|para|de \d)(?=\s|$).*$/i, "").trim();
  if (!r.nome) { const l = t.split("\n").map(s => s.trim()).find(s => /\b(hotel|pousada|hostel|flat|resid[eê]ncia|apartamento|apto|su[ií]te|inn|resort)\b/i.test(s) && s.length < 70 && !/check|reserva|pol[ií]tica/i.test(s)); if (l) r.nome = l; }
  for (const k in r) if (!r[k]) delete r[k];
  return r;
}
async function lerPrintReserva(arquivo) {
  const st = $("vgStatus"); st.textContent = "Lendo a reserva…";
  try {
    let txt;
    if (/pdf/i.test(arquivo.type) || /\.pdf$/i.test(arquivo.name)) txt = await textoDoPdf(arquivo, 6);
    else txt = await textoDaImagem(arquivo, p => { st.textContent = `Lendo a imagem… ${p}%`; });
    const ano = (viagemAtual.bloco.inicio || String(new Date().getFullYear())).slice(0, 4);
    const r = lerReservaTexto(txt, ano);
    const h = viagemAtual.v.hospedagem, achados = [];
    const nomes = { nome: "hotel", cep: "CEP", logradouro: "endereço", numero: "número", checkin_data: "check-in", checkin_hora: "horário de check-in", checkout_data: "check-out", checkout_hora: "horário de check-out", plataforma: "plataforma", codigo: "código", responsavel: "responsável" };
    for (const k in r) { h[k] = r[k]; achados.push(nomes[k]); }
    desenharViagem();
    if (r.cep) await buscarCep(r.cep).then(() => { if (r.logradouro) { viagemAtual.v.hospedagem.logradouro = r.logradouro; } if (r.numero) viagemAtual.v.hospedagem.numero = r.numero; desenharViagem(); });
    for (const k in r) { const el = document.querySelector(`#viagemConteudo [data-k="${k}"]`); if (el) el.classList.add("auto"); }
    $("vgStatus").textContent = achados.length ? `Preenchido pela reserva: ${[...new Set(achados)].join(", ")}. Confira os campos destacados.` : "Não reconheci os dados nesse arquivo; preencha manualmente.";
  } catch (e) { $("vgStatus").textContent = "Não consegui ler esse arquivo."; }
}

function salvarViagem(apagar) {
  const { id, uid, qual, v } = viagemAtual;
  const x = itens.find(i => i.id === id); if (!x) return;
  x.viagens = x.viagens || {};
  const atual = x.viagens[uid] || {};
  if (apagar) delete atual[qual]; else atual[qual] = v[qual];
  if (atual.transporte || atual.hospedagem) x.viagens[uid] = atual; else delete x.viagens[uid];
  x.atualizado = new Date().toISOString();
  salvar(); render();
  $("dlgViagem").close();
  abrirVer(id);
  toast(apagar ? "Apagado" : (qual === "transporte" ? "Transporte salvo" : "Hospedagem salva"));
}

document.addEventListener("click", e => {
  const b = e.target.closest("[data-viagem]");
  if (b) { const id = b.closest("#verConteudo") && $("verConteudo").dataset.id; if (id) abrirViagem(id, b.dataset.uid, b.dataset.viagem); return; }
  if (!e.target.closest("#viagemConteudo") || !viagemAtual) return;
  const t = e.target.closest("[data-tipo]"); if (t) { escolherTipo(t.dataset.tipo); return; }
  const a = e.target.closest("[data-acao]");
  if (a && a.dataset.acao === "add-trecho") {
    const tj = viagemAtual.v.transporte[a.dataset.s], ult = tj.trechos[tj.trechos.length - 1];
    tj.trechos.push(trechoVazio(ult.para, ult.chegada_data || ult.partida_data));
    desenharViagem(); return;
  }
  if (a && a.dataset.acao === "rem-trecho") {
    const tr = a.closest(".trecho"); viagemAtual.v.transporte[tr.dataset.s].trechos.splice(+tr.dataset.k, 1); desenharViagem(); return;
  }
  if (e.target.id === "vgSalvar") salvarViagem(false);
  else if (e.target.id === "vgLimpar") salvarViagem(true);
  else if (e.target.closest("#vgPrint")) $("vgArq").click();
});
document.addEventListener("input", e => {
  const el = e.target; if (!el.closest("#viagemConteudo") || !el.dataset.k || !viagemAtual) return;
  let val = el.value;
  if (el.dataset.k === "cep") { const n = val.replace(/\D/g, "").slice(0, 8); val = n.length > 5 ? n.slice(0, 5) + "-" + n.slice(5) : n; el.value = val; }
  if (/\.(de|para)$/.test(el.dataset.k) && /^[a-z]{3}$/i.test(val)) val = val.toUpperCase();
  if (el.dataset.k === "uf") val = val.toUpperCase();
  definirViagem(el.dataset.k, val);
  if (el.dataset.k === "cep" && val.replace(/\D/g, "").length === 8) buscarCep(val);
});
document.addEventListener("change", e => {
  const el = e.target; if (!el.closest("#viagemConteudo") || !viagemAtual) return;
  if (el.id === "vgArq") { const f = el.files[0]; el.value = ""; if (f) lerPrintReserva(f); return; }
  if (el.dataset.k) {
    let val = el.value;
    // aeroporto escolhido na lista: fica só a sigla
    if (/\.(de|para)$/.test(el.dataset.k)) { const m = val.match(/^([A-Z]{3})\b/i); if (m) { val = m[1].toUpperCase(); el.value = val; } }
    definirViagem(el.dataset.k, val);
    // partida informada: chegada no mesmo dia por padrão; horários mudam o resumo e a conexão
    const p = el.dataset.k.split(".");
    if (p.length === 3 && viagemAtual.qual === "transporte") {
      const tr = viagemAtual.v.transporte[p[0]].trechos[+p[1]];
      if (p[2] === "partida_data" && !tr.chegada_data) tr.chegada_data = val;
      if (/hora|data|de|para|cia/.test(p[2])) desenharViagem();
    }
  }
});

// listas de sugestões (aeroportos e cias aéreas)
(function () {
  const a = document.getElementById("dlAeroportos"), c = document.getElementById("dlCias");
  if (a) a.innerHTML = AEROPORTOS.map(([s, n]) => `<option value="${s} – ${n}">`).join("");
  if (c) c.innerHTML = CIAS.map(n => `<option value="${n}">`).join("");
})();
