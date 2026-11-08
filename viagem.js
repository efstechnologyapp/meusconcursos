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
const SVG_LOCAL = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5.5C5 4.5 7.5 4.5 10 5.5v14c-2.5-1-5-1-7 0z"/><path d="M10 5.5c1.5-.6 3-.8 4.5-.7"/><path d="M10 19.5c1.2-.5 2.4-.7 3.6-.7"/><path d="M20.5 3.5l1 1-6.5 9.5-2.2 1 .3-2.4z"/></svg>`;
const SVG_COPIAR = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>`;
const SVG_IMPRESSORA = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/><path d="M17.5 12h.01"/></svg>`;
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
function enderecoParaCopiar(h) {
  const rua = [h.logradouro, h.numero].filter(Boolean).join(", ");
  const cid = [h.cidade, h.uf].filter(Boolean).join(" - ");
  return [rua && h.bairro ? `${rua} - ${h.bairro}` : (rua || h.bairro), cid, h.cep].filter(Boolean).join(", ") || h.nome || "";
}
async function copiarEndereco(t) {
  if (!t) return;
  try { await navigator.clipboard.writeText(t); toast("Endereço copiado. Cole no app do Uber ou no mapa."); }
  catch (e) { prompt("Copie o endereço:", t); }
}
// trecho de deslocamento dentro do quadro (hospedagem ou local de prova), atualizado quando o mapa responde
const slotDesl = (x, uid, id) => trechosDeslocamento(x, uid).some(t => t.id === id) ? `<div class="desl-it" id="desl-${esc(uid)}-${id}">${htmlDeslocamentos(x, uid, id)}</div>` : "";
const linkMapa = (h, end) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([h.nome, end].filter(Boolean).join(", "))}`;
const botaoCopiar = t => t ? `<button type="button" class="copy-end" data-copiar="${esc(t)}" title="Copiar endereço" aria-label="Copiar endereço">${SVG_COPIAR}<span>Copiar endereço</span></button>` : "";
function resumoLocal(l) {
  if (!l) return "";
  return [l.nome, enderecoHosp(l), l.sala].filter(Boolean).join("\n") || (l.arquivo ? "documento juntado" : "");
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
  const temL = !!(v.local && resumoLocal(v.local)) || !!localDaRaiz(x, uid);
  return `<span class="viagem-btns">
    <button type="button" class="ic-btn${temL ? " on" : ""}" data-viagem="local" data-uid="${esc(uid)}" data-rot="Local" title="Local de prova" aria-label="Local de prova">${SVG_LOCAL}</button>
    <button type="button" class="ic-btn${temT ? " on" : ""}" data-viagem="transporte" data-uid="${esc(uid)}" data-rot="Transporte" title="Transporte" aria-label="Transporte">${v.transporte && v.transporte.tipo === "carro" ? SVG_CARRO : SVG_AVIAO}</button>
    <button type="button" class="ic-btn${temH ? " on" : ""}" data-viagem="hospedagem" data-uid="${esc(uid)}" data-rot="Hospedagem" title="Hospedagem" aria-label="Hospedagem">${SVG_HOTEL}</button></span>`;
}
function htmlResumoViagem(x, uid) {
  const v = (x.viagens || {})[uid] || {};
  const t = resumoTransporte(v.transporte), h = resumoHospedagem(v.hospedagem), l = resumoLocal(v.local);
  const mapa = v.hospedagem && enderecoHosp(v.hospedagem), mapaL = v.local && enderecoHosp(v.local);
  // ordem: transporte, hospedagem, local de prova
  return (t ? `<div class="viagem-res"><span class="vr-ic">${v.transporte.tipo === "carro" ? SVG_CARRO : SVG_AVIAO}</span><p class="pre">${esc(t)}</p></div>` : "") +
    (h ? `<div class="viagem-res"><span class="vr-ic">${SVG_HOTEL}</span><div><p class="pre"><span class="nome-l">${esc(v.hospedagem.nome || "Hospedagem")}${mapa ? botaoCopiar(enderecoParaCopiar(v.hospedagem)) : ""}</span>\n${esc(resumoHospedagem({ ...v.hospedagem, nome: "" }))}</p>${slotDesl(x, uid, "aeroHosp")}</div></div>` : "") +
    (l ? `<div class="viagem-res"><span class="vr-ic">${SVG_LOCAL}</span><div><p class="pre"><span class="nome-l"><span><b>Local de prova:</b> ${esc(v.local.nome || "")}</span>${mapaL ? botaoCopiar(enderecoParaCopiar(v.local)) : ""}</span>\n${esc(resumoLocal({ ...v.local, nome: "" }))}</p>${v.local.arquivo ? `<div class="end-acoes"><a data-arqlocal="${esc(uid)}" target="_blank" rel="noopener">${esc(v.local.arquivo.nome)}</a></div>` : ""}${slotDesl(x, uid, "hospLocal")}</div></div>` : "");
}

// ---------- Deslocamentos (aeroporto → hospedagem → local de prova) ----------
// Endereços viram coordenadas pelo OpenStreetMap (Nominatim) e a rota de carro vem do OSRM, ambos gratuitos.
// Eles não têm trânsito em tempo real: para isso há os links do Google Maps e do Waze, que abrem a rota com o trânsito do momento.
const pausa = ms => new Promise(r => setTimeout(r, ms));
let filaGeo = Promise.resolve();
function nominatim(params) {
  // a política do Nominatim pede no máximo 1 consulta por segundo
  const p = filaGeo.then(async () => {
    const r = await fetch("https://nominatim.openstreetmap.org/search?" + new URLSearchParams({ format: "json", countrycodes: "br", limit: "5", "accept-language": "pt-BR", ...params })).then(r => r.json()).catch(() => []);
    await pausa(1100);
    return Array.isArray(r) ? r : [];
  });
  filaGeo = p.catch(() => {});
  return p;
}
const chaveEnd = h => [h.logradouro, h.numero, h.bairro, h.cidade, h.uf, h.cep, h.lat, h.lon].map(s => String(s || "").trim().toLowerCase()).join("|");
async function geoEndereco(h0) {
  if (h0 && h0.lat && h0.lon) return { lat: +h0.lat, lon: +h0.lon, aprox: false };
  const h = limparEndereco({ ...h0 });
  if (h.bairro) h.bairro = h.bairro.replace(/\s*\(.*?\)\s*/g, " ").trim();
  const cid = h.cidade || "", uf = h.uf || "";
  // [consulta, é aproximada?] — do mais preciso ao mais genérico
  const tentativas = [
    h.logradouro && h.numero && [{ street: `${h.numero} ${h.logradouro}`, city: cid, country: "Brasil" }, false],
    h0.logradouro && /,/.test(h0.logradouro) && [{ q: h0.logradouro.replace(/\b\d{5}-?\d{3}\b/, "") + ", Brasil" }, false],
    h.logradouro && h.numero && [{ q: [`${h.logradouro}, ${h.numero}`, h.bairro, cid, uf, "Brasil"].filter(Boolean).join(", ") }, false],
    h.logradouro && [{ street: h.logradouro, city: cid, country: "Brasil" }, true],
    h.cep && [{ postalcode: h.cep, country: "Brasil" }, true],
    h.nome && [{ q: [h.nome, cid, uf].filter(Boolean).join(", ") }, true],
    h.bairro && cid && [{ q: [h.bairro, cid, uf, "Brasil"].filter(Boolean).join(", ") }, true]
  ].filter(Boolean);
  for (const [t, aprox] of tentativas) {
    const r = await nominatim(t);
    if (r[0]) return { lat: +r[0].lat, lon: +r[0].lon, aprox: aprox || !h.numero };
  }
  return null;
}
// tira rótulos que vêm grudados de prints ("Rua X Número:") e faixas de numeração do ViaCEP ("até 539/540")
function limparEndereco(h) {
  if (!h) return h;
  // endereço inteiro numa linha só (ex.: copiado do Airbnb: "Rua Macapá, 282 - Ondina, Salvador - BA, 40170-150"): separa as partes
  if (h.logradouro && /,/.test(h.logradouro) && (!h.cidade || !h.numero)) {
    let t = h.logradouro;
    const cep = t.match(/\b(\d{5})-?(\d{3})\b/); if (cep) { if (!h.cep) h.cep = cep[1] + "-" + cep[2]; t = t.replace(cep[0], ""); }
    const cu = t.match(/,\s*([^,\-–]+?)\s*[-–\/]\s*([A-Z]{2})\b/); if (cu) { if (!h.cidade) h.cidade = cu[1].trim(); if (!h.uf) h.uf = cu[2]; t = t.slice(0, cu.index); }
    const nb = t.match(/^(.*?),\s*(\d{1,6}[A-Za-z]?)\s*(?:[-–,]\s*(.+))?$/); if (nb) { h.logradouro = nb[1].trim(); if (!h.numero) h.numero = nb[2]; if (nb[3] && !h.bairro) h.bairro = nb[3].trim(); }
    else h.logradouro = t.replace(/[\s,–-]+$/, "").trim();
  }
  if (h.logradouro) {
    const m = h.logradouro.match(/\s*[,–-]?\s*(?:n[uú]mero|n[º°o]\.?)\s*:?\s*(\d{1,6})?\s*$/i);
    if (m) { if (m[1] && !h.numero) h.numero = m[1]; h.logradouro = h.logradouro.slice(0, m.index).trim(); }
    h.logradouro = h.logradouro.replace(/\s*[:,–-]+\s*$/, "").trim();
  }
  if (h.numero) h.numero = String(h.numero).replace(/[^\dA-Za-z\/-]/g, "");
  if (h.complemento && /^(at[ée]|de \d|lado (par|[ií]mpar)|\d+\/\d+$|s\/n)/i.test(h.complemento.trim())) h.complemento = "";
  if (h.sala) h.sala = h.sala.split(/\s*,\s*/).filter(it => { const v = it.split(" ").slice(1).join(" "); return /\d/.test(v) || /^[A-Z]{1,2}$/i.test(v); }).join(", ");
  return h;
}
async function geoAeroporto(sigla) {
  const a = AEROPORTOS.find(([s]) => s === (sigla || "").toUpperCase());
  const nome = a ? a[1].split("–").pop().trim() : sigla;
  for (const q of [`Aeroporto ${nome}`, `${sigla} aeroporto ${a ? a[1].split("–")[0].trim() : ""}`]) {
    const r = await nominatim({ q });
    const ae = r.find(o => o.class === "aeroway" || o.type === "aerodrome") || null;
    if (ae) return { lat: +ae.lat, lon: +ae.lon };
  }
  return null;
}
async function rotaCarro(a, b) {
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`).then(r => r.json());
    if (r.code !== "Ok" || !r.routes || !r.routes[0]) return null;
    return { km: r.routes[0].distance / 1000, min: Math.max(1, Math.round(r.routes[0].duration / 60)) };
  } catch (e) { return null; }
}
function pontosDaViagem(x, uid) {
  const v = (x.viagens || {})[uid] || {}, tp = v.transporte || {};
  let aero = "";
  if (tp.tipo === "aviao" && tp.ida && tp.ida.trechos && tp.ida.trechos.length) aero = (tp.ida.trechos[tp.ida.trechos.length - 1].para || "").toUpperCase();
  const hosp = v.hospedagem && (v.hospedagem.logradouro || v.hospedagem.cep) ? v.hospedagem : null;
  const local = v.local && (v.local.logradouro || v.local.cep) ? v.local : null;
  return { v, aero, hosp, local };
}
function trechosDeslocamento(x, uid) {
  const { aero, hosp, local } = pontosDaViagem(x, uid), t = [];
  if (aero && hosp) t.push({ id: "aeroHosp", de: `Aeroporto (${aero})`, para: "Hospedagem", chave: aero + ">" + chaveEnd(hosp) });
  if (hosp && local) t.push({ id: "hospLocal", de: "Hospedagem", para: "Local de prova", chave: chaveEnd(hosp) + ">" + chaveEnd(local) });
  return t;
}
const fmtKm = km => km < 10 ? km.toFixed(1).replace(".", ",") : String(Math.round(km));
const fmtTempo = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
function hhmmMenos(hhmm, min) { const [h, m] = hhmm.split(":").map(Number); const t = h * 60 + m - min; return t > 0 ? `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}` : ""; }
function htmlDeslocamentos(x, uid, so) {
  const tr = trechosDeslocamento(x, uid).filter(t => !so || t.id === so); if (!tr.length) return "";
  const v = x.viagens[uid], rotas = v.rotas || {};
  return tr.map(t => {
    const r = rotas[t.id] && rotas[t.id].chave === t.chave ? rotas[t.id] : null;
    let num = `<span class="note">calculando distância…</span>`, links = "", dica = "";
    if (r && r.erro) num = `<span class="note">não foi possível localizar ${esc(r.erro)} no mapa; confira o endereço.</span>`;
    else if (r) {
      num = `<span class="desl-num">${fmtKm(r.km)} km · ~${fmtTempo(r.min)} de carro</span> <span class="note">(sem trânsito${r.aprox ? ", endereço aproximado" : ""})</span>`;
      const o = `${r.a.lat},${r.a.lon}`, d = `${r.b.lat},${r.b.lon}`;
      links = `<div class="desl-links"><a href="https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}&travelmode=driving" target="_blank" rel="noopener">Trânsito agora (Google Maps)</a>
        <a href="https://waze.com/ul?ll=${d}&navigate=yes" target="_blank" rel="noopener">Waze</a>
        <a href="https://m.uber.com/ul/?action=setPickup&pickup[latitude]=${r.a.lat}&pickup[longitude]=${r.a.lon}&pickup[nickname]=${encodeURIComponent(t.de)}&dropoff[latitude]=${r.b.lat}&dropoff[longitude]=${r.b.lon}&dropoff[nickname]=${encodeURIComponent(t.para)}" target="_blank" rel="noopener">Pedir Uber</a></div>`;
      // horário sugerido de saída para a prova: 30 min de folga antes dos portões (ou do início)
      if (t.id === "hospLocal") {
        const bl = blocosDeViagem(x).find(b => b.uid === uid);
        const fases = bl ? bl.fases.map(i => x.fases[i]).filter(f => f.data && (f.portoes || f.horario)).sort((a, b) => (a.data + (a.portoes || a.horario)).localeCompare(b.data + (b.portoes || b.horario))) : [];
        const dias = [...new Set(fases.map(f => f.data))];
        dica = dias.map(d => { const f = fases.find(z => z.data === d), lim = f.portoes || f.horario, s = hhmmMenos(lim, r.min + 30); return s ? `${fmtCurta(d)}: sair até ${s} (${f.portoes ? "portões fecham" : "prova começa"} ${lim}; trajeto + 30 min de folga)` : ""; }).filter(Boolean).join("<br>");
        if (dica) dica = `<div class="note">${dica}</div>`;
      }
    }
    return `<div class="desl-tit">${esc(t.de)} → ${esc(t.para)}</div>${num}${dica}${links}`;
  }).join("");
}
async function atualizarDeslocamentos(x) {
  // links dos documentos de local de prova juntados
  document.querySelectorAll("#verConteudo [data-arqlocal]").forEach(a => urlDoArquivo(x.id, "local:" + a.dataset.arqlocal).then(u => { if (u) a.href = u; }));
  for (const b of blocosDeViagem(x)) {
    const uid = b.uid, tr = trechosDeslocamento(x, uid);
    for (const t of tr) {
      const v = x.viagens[uid]; v.rotas = v.rotas || {};
      if (v.rotas[t.id] && v.rotas[t.id].chave === t.chave) continue;
      const { aero, hosp, local } = pontosDaViagem(x, uid);
      const a = t.id === "aeroHosp" ? await geoAeroporto(aero) : await geoEndereco(hosp);
      const bb = t.id === "aeroHosp" ? await geoEndereco(hosp) : await geoEndereco(local);
      let r;
      if (!a) r = { erro: t.id === "aeroHosp" ? "o aeroporto" : "a hospedagem" };
      else if (!bb) r = { erro: t.id === "aeroHosp" ? "a hospedagem" : "o local de prova" };
      else { const rc = await rotaCarro(a, bb); r = rc ? { ...rc, a: { lat: +a.lat.toFixed(6), lon: +a.lon.toFixed(6) }, b: { lat: +bb.lat.toFixed(6), lon: +bb.lon.toFixed(6) }, aprox: !!(a.aprox || bb.aprox) } : null; }
      if (!r) continue;   // sem internet: tenta de novo na próxima abertura
      if (r.erro) {   // endereço não encontrado: mostra o aviso, mas tenta de novo na próxima abertura
        v.rotas[t.id] = { ...r, chave: t.chave };
        const el = document.getElementById(`desl-${uid}-${t.id}`); if (el) el.innerHTML = htmlDeslocamentos(x, uid, t.id);
        delete v.rotas[t.id]; continue;
      }
      v.rotas[t.id] = { ...r, chave: t.chave };
      // a sincronização pode ter trocado o objeto do concurso enquanto o mapa respondia: grava no atual
      const cur = itens.find(i => i.id === x.id), cv = cur && cur !== x && (cur.viagens || {})[uid];
      if (cv) { cv.rotas = cv.rotas || {}; cv.rotas[t.id] = v.rotas[t.id]; }
      salvar();   // guarda no aparelho para não recalcular
      const el = document.getElementById(`desl-${uid}-${t.id}`);
      if (el && $("verConteudo").dataset.id === x.id) el.innerHTML = htmlDeslocamentos(x, uid, t.id);
    }
  }
}

// ---------- Formulário ----------
let viagemAtual = null;   // {id, uid, qual, dados}
const trechoVazio = (de = "", data = "") => ({ cia: "", voo: "", de, partida_data: data, partida_hora: "", para: "", chegada_data: data, chegada_hora: "" });

function abrirViagem(id, uid, qual) {
  const x = itens.find(i => i.id === id); if (!x) return;
  const bloco = blocosDeViagem(x).find(b => b.uid === uid) || { inicio: "", fim: "", fases: [] };
  const v = JSON.parse(JSON.stringify((x.viagens || {})[uid] || {}));
  const ida = somarDias(bloco.inicio, -1), volta = somarDias(bloco.fim, 1);
  const cid = (x.cidade || "").split("/")[0].trim(), uf = ((x.cidade || "").split("/")[1] || "").trim();
  if (qual === "transporte") v.transporte = v.transporte || { tipo: "" };
  else if (qual === "local") v.local = v.local || { nome: localDaRaiz(x, uid), cidade: cid, uf };
  else v.hospedagem = v.hospedagem || { checkin_data: ida, checkout_data: volta, cidade: (x.cidade || "").split("/")[0].trim(), uf: ((x.cidade || "").split("/")[1] || "").trim() };
  viagemAtual = { id, uid, qual, v, ida, volta, x, bloco, arquivoNovo: null, removerArquivo: false };
  desenharViagem();
  const dlg = $("dlgViagem"); if (!dlg.open) dlg.showModal();
}
// texto do local guardado na fase (campo antigo do formulário / editais de convocação)
function localDaRaiz(x, uid) { const f = (x.fases || []).find(f => f.uid === uid); return (f && f.local) || ""; }
const alvoEndereco = () => viagemAtual.v[viagemAtual.qual];
const TITULOS_V = { transporte: "Transporte", hospedagem: "Hospedagem", local: "Local de prova" };
function tituloBloco() {
  const { x, bloco } = viagemAtual;
  const nomes = bloco.fases.map(i => x.fases[i].nome).join(" + ");
  return `${esc(x.nome)}<br><span class="note">${esc(nomes)}${bloco.inicio ? " · " + esc(fmtCurta(bloco.inicio)) + (bloco.fim !== bloco.inicio ? " a " + esc(fmtCurta(bloco.fim)) : "") : ""}</span>`;
}
function desenharViagem() {
  const { qual, v } = viagemAtual;
  const corpo = qual === "transporte" ? htmlFormTransporte(v.transporte) : qual === "local" ? htmlFormLocal(v.local) : htmlFormHospedagem(v.hospedagem);
  $("viagemConteudo").innerHTML = `
    <div class="dlg-head"><div style="flex:1;min-width:0"><h2>${TITULOS_V[qual]}</h2><p class="sub">${tituloBloco()}</p></div><button type="button" class="close" data-close aria-label="Fechar">×</button></div>
    ${corpo}
    <div class="actions">${(qual === "transporte" ? v.transporte.tipo : qual === "local" ? resumoLocal(v.local) : resumoHospedagem(v.hospedagem)) ? `<button type="button" class="danger" id="vgLimpar" style="margin-right:auto">Apagar</button>` : ""}<button type="button" data-close>Cancelar</button><button type="button" class="primary" id="vgSalvar">Salvar</button></div>`;
  if (qual === "local") ligarArquivoLocal();
}
function ligarArquivoLocal() {
  const a = $("vgLnkLocal"); if (!a || !viagemAtual) return;
  if (viagemAtual.arquivoNovo) a.href = URL.createObjectURL(viagemAtual.arquivoNovo);
  else urlDoArquivo(viagemAtual.id, "local:" + viagemAtual.uid).then(u => { if (u && $("vgLnkLocal")) $("vgLnkLocal").href = u; });
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
      ${camposEndereco(h, "apto, bloco…")}
      ${campo("Check-in – data", "checkin_data", h.checkin_data, "date")}
      ${campo("Check-in – a partir de", "checkin_hora", h.checkin_hora, "time")}
      ${campo("Check-out – data", "checkout_data", h.checkout_data, "date")}
      ${campo("Check-out – até", "checkout_hora", h.checkout_hora, "time")}
      <label class="w2">Plataforma da reserva<select data-k="plataforma"><option value=""></option>${PLATAFORMAS.map(p => `<option${p === h.plataforma ? " selected" : ""}>${p}</option>`).join("")}</select></label>
      ${campo("Código da reserva", "codigo", h.codigo, "text", "w2")}
      ${campo("Responsável pela reserva", "responsavel", h.responsavel, "text", 'w4 placeholder="nome de quem fez a reserva"')}
    </div>`;
}

function camposEndereco(h, dicaCompl) {
  return `${campo("CEP", "cep", h.cep, "text", 'inputmode="numeric" placeholder="00000-000" maxlength="9"')}
      <p class="note w2 cep-st" id="vgCep">${h.cep ? "" : "Digite o CEP para preencher o endereço."}</p>
      ${campo("Rua / avenida", "logradouro", h.logradouro, "text", "w4")}
      ${campo("Número", "numero", h.numero)}
      ${campo("Complemento", "complemento", h.complemento, "text", `placeholder="${dicaCompl}"`)}
      ${campo("Bairro", "bairro", h.bairro, "text", "w2")}
      ${campo("Cidade", "cidade", h.cidade, "text", "w2")}
      ${campo("UF", "uf", h.uf, "text", 'maxlength="2"')}
      <span></span>`;
}
function htmlFormLocal(l) {
  const novo = viagemAtual.arquivoNovo;
  const nomeArq = novo ? novo.name : (l.arquivo && l.arquivo.nome);
  return `<div class="auto-box"><button type="button" id="vgPrint">${typeof CLIP_SVG !== "undefined" ? CLIP_SVG : ""} Juntar PDF ou print do local de prova</button>
      <input type="file" id="vgArq" accept="image/*,application/pdf,.pdf" hidden><span class="note" id="vgStatus">Cartão de confirmação da banca ou edital de locais: o app guarda o arquivo e preenche o endereço.</span>
      ${nomeArq ? `<div class="anexo"><a id="vgLnkLocal" target="_blank" rel="noopener" data-ext="${esc(((nomeArq.match(/\.(\w+)$/) || [])[1] || "PDF").toUpperCase())}">${esc(nomeArq)}</a><button type="button" class="link-x" id="vgRemArq">remover</button></div>` : ""}</div>
    <div class="fase-grid">
      ${campo("Nome do local", "nome", l.nome, "text", 'w4 placeholder="escola, faculdade, centro de convenções…"')}
      ${camposEndereco(l, "bloco, prédio…")}
      ${campo("Sala / bloco / portão de entrada", "sala", l.sala, "text", "w4")}
    </div>
    <p class="note">Vale para todas as fases desta viagem (mesmo dia ou dia seguinte). O endereço pode ser copiado nos detalhes do concurso para colar no Uber.</p>`;
}

// ---------- Interações ----------
function definirViagem(k, val) {
  const { qual, v } = viagemAtual;
  const alvo = v[qual];
  const p = k.split(".");
  if (p.length === 1) { alvo[p[0]] = val; if (/^(logradouro|numero|bairro|cidade|uf|cep)$/.test(p[0])) { delete alvo.lat; delete alvo.lon; } }
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
    const h = alvoEndereco();
    h.cep = `${n.slice(0, 5)}-${n.slice(5)}`;
    if (r.logradouro) h.logradouro = r.logradouro;
    if (r.bairro) h.bairro = r.bairro;
    if (r.localidade) h.cidade = r.localidade;
    if (r.uf) h.uf = r.uf;
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
  // Booking: quadro "ENTRADA / SAÍDA" com dias e meses em colunas
  const cab = t.match(/ENTRADA\s+SA[ÍI]DA[^\n]*\n([\s\S]{0,400})/);
  if (cab) {
    const dias = cab[1].match(/(?:^|\n)[^\n]*?\b(\d{1,2})\s+(\d{1,2})(?:\s+\d+\s*\/\s*\d+)?\s*(?:\n|$)/);
    const meses = cab[1].match(/\b(JANEIRO|FEVEREIRO|MAR[ÇC]O|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s+(JANEIRO|FEVEREIRO|MAR[ÇC]O|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\b/i);
    if (dias && meses) {
      const mn = n => MESES_R[n.toLowerCase().slice(0, 3).replace("ç", "c")];
      const a1 = mn(meses[1]), a2 = mn(meses[2]);
      r.checkin_data = `${anoBase}-${String(a1).padStart(2, "0")}-${String(dias[1]).padStart(2, "0")}`;
      r.checkout_data = `${a2 < a1 ? +anoBase + 1 : anoBase}-${String(a2).padStart(2, "0")}-${String(dias[2]).padStart(2, "0")}`;
    }
    const ate = cab[1].match(/at[ée]\s+(?:as|às)\s+(\d{1,2}[:h]\d{2})/i);
    if (ate) r.checkout_hora = horaNoTexto(ate[1]);
    const desde = cab[1].replace(/at[ée]\s+(?:as|às)\s+\d{1,2}[:h]\d{2}/ig, "").match(/a partir d[ae]s?[\s\S]{0,120}?\b(\d{1,2}:\d{2})\b/i);
    if (desde) r.checkin_hora = horaNoTexto(desde[1]);
  }
  // endereço em várias linhas, misturado com as colunas do quadro: junta até "Telefone"/"Coordenadas"
  const bloco = t.match(/endere[cç]o\s*:\s*([\s\S]{5,300}?)(?:\n\s*(?:telefone|tel\.|coordenadas|e-?mail)|\n\s*\n)/i);
  if (bloco) {
    const ruido = /^(\d{1,2}(\s+\d{1,2})*(\s+\d+\s*\/\s*\d+)?|[A-ZÇÃÉ]{4,}(\s+[A-ZÇÃÉ]{4,})*|((segunda|ter[cç]a|quarta|quinta|sexta)(-feira)?|s[aá]bado|domingo)(\s+((segunda|ter[cç]a|quarta|quinta|sexta)(-feira)?|s[aá]bado|domingo))*|a partir.*|at[eé] as.*|\d{1,2}:\d{2})$/i;
    const end = bloco[1].split("\n").map(l => l.trim()).filter(l => l && !ruido.test(l)).join(" ").replace(/\s+/g, " ");
    const partes = end.split(/\s*,\s*/).filter(p => !/^bras[il]l?$/i.test(p));
    if (partes.length >= 2 && /^(rua|r\.|avenida|av\.?|travessa|alameda|rodovia|estrada|pra[cç]a)/i.test(partes[0])) {
      r.logradouro = partes[0].replace(/^Rua\.\s*/i, "Rua ").replace(/^R\.\s*/i, "Rua ").replace(/^Av\.?\s+/i, "Avenida ");
      const resto = partes.slice(1);
      if (/^(\d{1,6}|s\/n)$/i.test(resto[0] || "")) r.numero = resto.shift();
      const semCep = resto.filter(p => !/CEP|\d{5}-?\d{3}/i.test(p));
      if (semCep[0]) r.bairro = semCep[0];
      if (semCep[1]) r.cidade = semCep[1].replace(/\s*[-\/]\s*[A-Z]{2}$/, "");
    }
  }
  // coordenadas GPS (Booking): "S 019° 56.348, W 43° 55.860" — localização exata para calcular as distâncias
  const gps = t.match(/([NS])\s*0*(\d{1,2})°\s*([\d.]+)'?\s*,?\s*([EWLO])\s*0*(\d{1,3})°\s*([\d.]+)/);
  if (gps) {
    const lat = (+gps[2] + +gps[3] / 60) * (gps[1] === "S" ? -1 : 1), lon = (+gps[5] + +gps[6] / 60) * (/[WO]/.test(gps[4]) ? -1 : 1);
    if (Math.abs(lat) < 35 && Math.abs(lon) < 75) { r.lat = +lat.toFixed(6); r.lon = +lon.toFixed(6); }
  }
  // nome do hotel: linhas logo antes de "Endereço:" (sem os números do quadro ao lado)
  if (bloco) {
    const ls = t.slice(0, t.search(/endere[cç]o\s*:/i)).split("\n").map(l => l.trim().replace(/(\s+\d{1,2}){1,3}(\s+\d+\s*\/\s*\d+)?$/, "")).filter(Boolean);
    const nomeL = []; for (let i = ls.length - 1; i >= 0 && nomeL.length < 3; i--) { if (/ENTRADA|SA[ÍI]DA|CONFIRMA|PIN|N[ÚU]MERO/i.test(ls[i]) || ls[i] === ls[i].toUpperCase()) break; nomeL.unshift(ls[i]); }
    if (nomeL.length) r.nome = nomeL.join(" ");
  }
  m = t.match(/(?:reservad[ao] por|nome do h[oó]spede|h[oó]spede principal|titular(?: da reserva)?|respons[aá]vel(?: pela reserva)?|h[oó]spede)\s*[:\-]?\s*([A-ZÀ-Ú][A-Za-zÀ-ú'´ ]{3,50}?)(?=\s*(?:\n|$|\d|,|\(|e-?mail|cpf|telefone))/i);
  if (m) {
    let nome = m[1].trim();
    // texto da coluna ao lado grudado no nome ("FILLIPE FIRMO cancelamento gratuitamente…")
    const pal = nome.split(" "); const k = pal.findIndex((w, i) => i >= 1 && w !== w.toUpperCase() && pal.slice(0, i).every(z => z === z.toUpperCase()));
    if (k > 0) nome = pal.slice(0, k).join(" ");
    r.responsavel = maiusculasParaTitulo(nome);
  }
  m = t.match(/(?:sua reserva (?:em|no|na)|reserva confirmada (?:em|no|na)|hospedagem (?:em|no|na)|estadia (?:em|no|na)|você vai ficar (?:em|no|na))\s+([^\n.!]{3,60})/i);
  if (m && !r.nome) r.nome = m[1].replace(/\s+(?:est[aá]|foi|para|de \d)(?=\s|$).*$/i, "").trim();
  if (!r.nome && !bloco) { const l = t.split("\n").map(s => s.trim()).find(s => /\b(hotel|pousada|hostel|flat|resid[eê]ncia|apartamento|apto|su[ií]te|inn|resort)\b/i.test(s) && s.length < 70 && !/check|reserva|pol[ií]tica/i.test(s)); if (l) r.nome = l; }
  if (r.nome && /^(brasil|brazil|[A-Za-zÀ-ú ]{2,25}\s*[-\/]\s*[A-Z]{2})$/i.test(r.nome.trim())) delete r.nome;
  for (const k in r) if (!r[k]) delete r[k];
  return r;
}
function maiusculasParaTitulo(t) {
  if (!t || t !== t.toUpperCase()) return t;
  const min = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o"]);
  return t.toLowerCase().split(" ").map((w, i) => (i && min.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(" ").replace(/\b(Ee|Eef|Eem|Emef|Uf|Ufpa|Unifap|Ifap|Senai|Sesi|Ceu|Ce|Ap|Ba|Mg|Rs|Sc|Pb)\b/g, w => w.toUpperCase());
}
// cartão de confirmação / edital de locais: "Local de prova: ESCOLA X", "Endereço: RUA Y, 123 - BAIRRO", "Sala: 05"
function lerLocalTexto(txt) {
  const t = txt.replace(/\r/g, ""), r = {};
  let m = t.match(/(?:^|\n|\s)(?:escola|unidade|institui[cç][aã]o|estabelecimento|local\s*(?:de\s+(?:prova|realiza[cç][aã]o(?:\s+da\s+prova)?|aplica[cç][aã]o))?)\s*[:;\-–]\s*([^\n]{4,100})/i);
  if (m && !/divulgad|ser[aá]|consult/i.test(m[1])) r.nome = maiusculasParaTitulo(m[1].replace(/\s+(endere[cç]o|sala|bloco)\b.*$/i, "").trim());
  m = t.match(/endere[cç]o\s*[:\-–]\s*([^\n]{5,140})/i);
  if (m) {
    let e = m[1].replace(/\s*CEP[:\s]*\d{5}-?\d{3}.*$/i, "").trim();
    const p = e.match(/^(.+?),?\s*(?:n[º°o.]*\s*)?(\d{1,6}|s\/n)\b\s*[-–,]?\s*(.*)$/i);
    if (p) { r.logradouro = maiusculasParaTitulo(p[1].replace(/,\s*$/, "").trim()); r.numero = p[2]; const resto = p[3].split(/\s*[-–,]\s*/).filter(Boolean); if (resto[0] && !/\d{5}/.test(resto[0])) r.bairro = maiusculasParaTitulo(resto[0]); }
    else r.logradouro = maiusculasParaTitulo(e.split(/\s*[-–]\s*/)[0]);
  }
  m = t.match(/\bn[uú]mero\s*[:\-–]\s*(\d{1,6})/i); if (m) r.numero = m[1];
  m = t.match(/\bbairro\s*[:\-–]\s*([^\n,]{3,40})/i); if (m) r.bairro = maiusculasParaTitulo(m[1].replace(/\s+(cidade|cep|munic).*$/i, "").trim());
  m = t.match(/\b(?:[Ee]stado|ESTADO|U[Ff]|uf)\s*[:\-–]\s*([A-Z]{2})\b/); if (m) r.uf = m[1];
  if (!r.logradouro) { const h = lerReservaTexto(t, ""); if (h.logradouro) { r.logradouro = maiusculasParaTitulo(h.logradouro); if (h.numero) r.numero = h.numero; } }
  m = t.match(/CEP[:\s]*(\d{5})[-.\s]?(\d{3})/i) || t.match(/\b(\d{5})-(\d{3})\b/);
  if (m) r.cep = `${m[1]}-${m[2]}`;
  m = t.match(/(?:cidade|munic[ií]pio)\s*[:\-–]\s*([A-Za-zÀ-ú' ]{3,40}?)\s*(?:[\/-]\s*([A-Z]{2}))?(?=\s*(?:\n|$|,|UF))/i);
  if (m) { r.cidade = maiusculasParaTitulo(m[1].trim()); if (m[2]) r.uf = m[2]; }
  const salas = [];
  const reS = /\b(sala|bloco|pr[eé]dio|andar|pavimento|port[aã]o(?: de acesso)?)\s*(?:n[º°o.]*)?\s*[:\-–]?\s*([A-Z0-9][A-Za-z0-9-]{0,8})\b/gi;
  while ((m = reS.exec(t))) { if (/^(sala|bloco|pr[eé]dio|andar|pavimento|port[aã]o)$/i.test(m[2])) { reS.lastIndex = m.index + m[1].length; continue; } const it = `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}`; if (!salas.includes(it) && !/^(de|da|do)$/i.test(m[2])) salas.push(it); }
  m = t.match(/(\d{1,2})\s*[º°ª]\s*andar/i) || t.match(/andar\s*[:;\-–]?\s*(\d{1,2})\s*[º°ª]?/i);
  if (m && !salas.some(x => /^andar/i.test(x))) salas.splice(Math.min(1, salas.length), 0, `Andar ${+m[1]}`);
  if (salas.length) r.sala = salas.slice(0, 4).join(", ");
  limparEndereco(r);
  if (r.logradouro) r.logradouro = maiusculasParaTitulo(r.logradouro);
  for (const k in r) if (!r[k]) delete r[k];
  return r;
}
async function lerDocumentoLocal(arquivo) {
  viagemAtual.arquivoNovo = arquivo; viagemAtual.removerArquivo = false;
  desenharViagem();
  const st = $("vgStatus"); st.textContent = "Lendo o documento…";
  try {
    let txt;
    if (/pdf/i.test(arquivo.type) || /\.pdf$/i.test(arquivo.name)) txt = await textoDoPdf(arquivo, 10);
    else txt = await textoDaImagem(arquivo, p => { st.textContent = `Lendo a imagem… ${p}%`; });
    const r = lerLocalTexto(txt), l = viagemAtual.v.local;
    const nomes = { nome: "nome do local", logradouro: "endereço", numero: "número", bairro: "bairro", cep: "CEP", cidade: "cidade", uf: "UF", sala: "sala/bloco" };
    for (const k in r) l[k] = r[k];
    if (r.cep) { await buscarCep(r.cep); for (const k of ["logradouro", "numero", "bairro"]) if (r[k]) l[k] = r[k]; }
    desenharViagem();
    for (const k in r) { const el = document.querySelector(`#viagemConteudo [data-k="${k}"]`); if (el) el.classList.add("auto"); }
    const ach = Object.keys(r).map(k => nomes[k]);
    $("vgStatus").textContent = ach.length ? `Arquivo juntado. Preenchido: ${ach.join(", ")}. Confira os campos destacados.` : "Arquivo juntado. Não reconheci o endereço nele; preencha manualmente.";
  } catch (e) { $("vgStatus").textContent = "Arquivo juntado, mas não consegui ler o texto; preencha manualmente."; }
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
    const nomes = { nome: "hotel", cep: "CEP", logradouro: "endereço", numero: "número", checkin_data: "check-in", checkin_hora: "horário de check-in", checkout_data: "check-out", checkout_hora: "horário de check-out", plataforma: "plataforma", codigo: "código", responsavel: "responsável", bairro: "bairro", cidade: "cidade", lat: "localização GPS" };
    for (const k in r) { h[k] = r[k]; if (nomes[k]) achados.push(nomes[k]); }
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
  if (atual.transporte || atual.hospedagem || atual.local) x.viagens[uid] = atual; else delete x.viagens[uid];
  if (qual === "local") {
    const chave = `${id}:local:${uid}`;
    if (apagar || viagemAtual.removerArquivo) { arq("apagar", chave).catch(() => {}); if (atual.local) delete atual.local.arquivo; }
    if (!apagar && viagemAtual.arquivoNovo) { arq("gravar", chave, viagemAtual.arquivoNovo).catch(() => toast("Não foi possível guardar o arquivo neste navegador.")); atual.local.arquivo = { nome: viagemAtual.arquivoNovo.name }; }
    const f = (x.fases || []).find(f => f.uid === uid);
    if (f) f.local = apagar ? "" : [v.local.nome, enderecoHosp(v.local), v.local.sala].filter(Boolean).join(" – ");
  }
  x.atualizado = new Date().toISOString();
  salvar(); render();
  $("dlgViagem").close();
  abrirVer(id);
  toast(apagar ? "Apagado" : ({ transporte: "Transporte salvo", hospedagem: "Hospedagem salva", local: "Local de prova salvo" })[qual]);
}

document.addEventListener("click", e => {
  const cp = e.target.closest("[data-copiar]"); if (cp) { copiarEndereco(cp.dataset.copiar); return; }
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
  else if (e.target.id === "vgRemArq") { viagemAtual.arquivoNovo = null; viagemAtual.removerArquivo = true; if (viagemAtual.v.local) delete viagemAtual.v.local.arquivo; desenharViagem(); }
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
  if (el.id === "vgArq") { const f = el.files[0]; el.value = ""; if (f) (viagemAtual.qual === "local" ? lerDocumentoLocal(f) : lerPrintReserva(f)); return; }
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


// ---------- Impressão / PDF de uma fase ----------
// Monta um documento só com a fase escolhida (ou as fases do mesmo dia): prova, local, transporte, hospedagem e deslocamentos.
function linhasTrajeto(tj, tipo) {
  if (!tj) return [];
  if (tipo === "carro") return [[tj.data && fmtData(tj.data), tj.hora && "saída às " + tj.hora, [tj.origem, tj.destino].filter(Boolean).join(" → ")].filter(Boolean).join(" · ")].filter(Boolean);
  const tr = (tj.trechos || []).filter(t => t.de || t.para || t.partida_hora), out = [];
  tr.forEach((t, k) => {
    if (k) {
      const a = minutosDe(tr[k - 1].chegada_data || tr[k - 1].partida_data, tr[k - 1].chegada_hora), b = minutosDe(t.partida_data, t.partida_hora);
      out.push(`<i>Conexão em ${esc(t.de || tr[k - 1].para || "")}${a !== null && b !== null && b > a ? " · espera de " + fmtMin(b - a) : ""}</i>`);
    }
    out.push(esc([[t.cia, t.voo].filter(Boolean).join(" "), `${t.de || "?"} ${t.partida_data ? fmtCurta(t.partida_data) + " " : ""}${t.partida_hora || ""} → ${t.para || "?"} ${t.chegada_data && t.chegada_data !== t.partida_data ? fmtCurta(t.chegada_data) + " " : ""}${t.chegada_hora || ""}`].filter(Boolean).join(" · ")));
  });
  if (tj.localizador) out.push("Localizador: <b>" + esc(tj.localizador) + "</b>");
  return out;
}
async function imprimirFases(id, idx) {
  const x0 = itens.find(i => i.id === id); if (!x0) return;
  const bl0 = blocosDeViagem(x0).find(b => b.fases.includes(idx[0]));
  const falta = bl0 && trechosDeslocamento(x0, bl0.uid).some(t => { const r = ((x0.viagens || {})[bl0.uid] || {}).rotas || {}; return !(r[t.id] && r[t.id].chave === t.chave); });
  if (falta) {   // distâncias ainda não calculadas (ex.: o concurso não foi aberto neste aparelho): calcula antes, por até 12 s
    toast("Calculando as distâncias (aeroporto, hospedagem e local) para a impressão…");
    await Promise.race([atualizarDeslocamentos(x0).catch(() => {}), new Promise(ok => setTimeout(ok, 12000))]);
  }
  const x = itens.find(i => i.id === id) || x0;
  const fases = idx.map(i => x.fases[i]).filter(Boolean); if (!fases.length) return;
  const bl = blocosDeViagem(x).find(b => b.fases.includes(idx[0]));
  const v = bl ? ((x.viagens || {})[bl.uid] || {}) : {};
  const raiz = bl ? x.fases[bl.raizI] : fases[0];
  const kv = pares => `<dl class="imp-kv">${pares.filter(([, val]) => val).map(([k, val]) => `<dt>${esc(k)}</dt><dd>${val}</dd>`).join("")}</dl>`;
  const titulo = fases.length > 1 ? fases.map(f => f.nome).join(" + ") : fases[0].nome;

  // prova(s)
  const provas = fases.map(f => {
    const comp = resumoComposicao(f);
    const blocos = temObjetiva(f) && f.objetivas && (f.objetivas.blocos || []).length ? `<ul>${f.objetivas.blocos.map(b => `<li>${esc(b.nome)}: ${esc(b.qtd)} questões${b.disciplinas ? " – " + esc(b.disciplinas) : ""}</li>`).join("")}</ul>` : "";
    const res = [f.acertos !== "" && f.acertos != null && `${f.acertos} acertos`, f.nota && "nota " + f.nota, f.classificacao && "classificação " + f.classificacao].filter(Boolean).join(" · ");
    return `${fases.length > 1 ? `<p class="imp-sub">${esc(f.nome)}</p>` : ""}${kv([
      ["Data", esc(f.data ? fmtData(f.data) : (f.previsao ? "a definir (previsão: " + f.previsao + ")" : "a definir"))],
      ["Horário", esc(f.horario ? (f.fim ? `das ${f.horario} às ${f.fim}` : "às " + f.horario) : "")],
      ["Portões fecham", esc(f.portoes || "")],
      ["Turno / duração", esc(textoTurno(f))],
      ["Caráter", esc(CARATER[f.carater] || "")],
      ["Situação", esc(f.situacao || "")],
      ["Composição", esc(comp)],
      ["Resultado", esc(res)],
      ["Observações", f.obs ? esc(f.obs).replace(/\n/g, "<br>") : ""]
    ])}${blocos}`;
  }).join("");

  // local de prova
  const lc = v.local;
  const local = lc && resumoLocal(lc) ? kv([["Local", esc(lc.nome || "")], ["Endereço", esc(enderecoParaCopiar(lc))], ["Sala / bloco", esc(lc.sala || "")]]) : (raiz.local ? `<p>${esc(raiz.local)}</p>` : "<p>Ainda não informado.</p>");

  // transporte
  const tp = v.transporte || {};
  const transp = tp.tipo ? [["ida", "Ida"], ["volta", "Volta"]].map(([k, n]) => { const l = linhasTrajeto(tp[k], tp.tipo); return l.length ? `<p class="imp-sub">${n} (${tp.tipo === "carro" ? "carro" : "avião"})</p><p>${l.join("<br>")}</p>` : ""; }).join("") : "<p>Ainda não informado.</p>";

  // hospedagem
  const h = v.hospedagem;
  const hosp = h && resumoHospedagem(h) ? kv([
    ["Hotel", esc(h.nome || "")], ["Endereço", esc(enderecoParaCopiar(h))],
    ["Check-in", esc([h.checkin_data && fmtData(h.checkin_data), h.checkin_hora && "a partir das " + h.checkin_hora].filter(Boolean).join(", "))],
    ["Check-out", esc([h.checkout_data && fmtData(h.checkout_data), h.checkout_hora && "até " + h.checkout_hora].filter(Boolean).join(", "))],
    ["Reserva", esc([h.plataforma, h.codigo && "nº " + h.codigo].filter(Boolean).join(" · "))], ["Em nome de", esc(h.responsavel || "")]
  ]) : "<p>Ainda não informada.</p>";

  // deslocamentos (já calculados)
  const desl = bl ? trechosDeslocamento(x, bl.uid).map(t => {
    const r = (v.rotas || {})[t.id]; if (!r || r.chave !== t.chave || r.erro) return "";
    let txt = `<b>${esc(t.de)} → ${esc(t.para)}:</b> ${fmtKm(r.km)} km · ~${fmtTempo(r.min)} de carro (sem trânsito)`;
    if (t.id === "hospLocal") fases.filter(f => f.data && (f.portoes || f.horario)).forEach(f => { const lim = f.portoes || f.horario, s2 = hhmmMenos(lim, r.min + 30); if (s2) txt += `<br>${esc(fmtCurta(f.data))} – ${esc(f.nome)}: sair até <b>${s2}</b> (${f.portoes ? "portões fecham" : "prova começa"} ${lim})`; });
    return `<p>${txt}</p>`;
  }).filter(Boolean).join("") + trechosDeslocamento(x, bl.uid).filter(t => { const r = (v.rotas || {})[t.id]; return !r || r.chave !== t.chave || r.erro; })
    .map(t => `<p><b>${esc(t.de)} → ${esc(t.para)}:</b> não consegui calcular a distância (confira o endereço no app).</p>`).join("") : "";

  const cand = nomeDoCandidato();
  $("impressao").innerHTML = `
    <div class="imp-cab">${x.logo ? `<img src="${x.logo}" alt="">` : ""}<div><h1>${esc(x.nome)}</h1>
      ${cand ? `<p class="imp-cand">Candidato(a): <b>${esc(cand)}</b></p>` : ""}
      <p>${esc([x.cargo, x.banca].filter(Boolean).join(" · "))}</p>
      <p>${esc([x.inscricao && "Inscrição nº " + x.inscricao, vagasNaLinha(x.vagas)].filter(Boolean).join(" · "))}</p></div></div>
    <div class="imp-fase">${esc(titulo)}</div>
    <div class="imp-sec"><h3>Prova</h3>${provas}</div>
    <div class="imp-sec"><h3>Local de prova</h3>${local}</div>
    <div class="imp-sec"><h3>Transporte</h3>${transp}</div>
    <div class="imp-sec"><h3>Hospedagem</h3>${hosp}</div>
    ${desl ? `<div class="imp-sec"><h3>Deslocamentos</h3>${desl}</div>` : ""}
    ${x.instrucoes ? `<div class="imp-sec"><h3>Instruções gerais</h3><p>${esc(x.instrucoes).replace(/\n/g, "<br>")}</p></div>` : ""}
    <p class="imp-rod">Gerado pelo app Meus Concursos em ${esc(new Date().toLocaleString("pt-BR"))}.</p>`;
  const tituloAntigo = document.title;
  // nome sugerido ao salvar em PDF: "Meus Concursos - Fillipe - TJRS - Juiz de Direito Substituto"
  const orgao = x.sigla || (String(x.nome || "").length > 28 ? siglaDoOrgao(x.nome) : x.nome);
  document.title = ["Meus Concursos", cand.split(/\s+/)[0], orgao, x.cargo].filter(Boolean).join(" - ").replace(/[\\/:*?"<>|]/g, "-");
  setTimeout(() => { window.print(); setTimeout(() => { document.title = tituloAntigo; }, 1000); }, 50);
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-imprimir]"); if (!b) return;
  const id = $("verConteudo").dataset.id;
  if (id) imprimirFases(id, b.dataset.imprimir.split(",").map(Number));
});

// nome de quem está usando o app (o do perfil editado ou o da conta Google)
function nomeDoCandidato() {
  const pf = (typeof perfil !== "undefined" && perfil) || {}, u = (typeof usuarioAtual !== "undefined" && usuarioAtual) || {};
  return String(pf.nome || u.nome || "").trim();
}
// vagas numa linha só, para o cabeçalho: "100 vagas (65 ampla, 5 PcD, 30 pretos e pardos) + CR"
function vagasNaLinha(v) {
  if (!v || !(temVagas(v) || v.cr)) return "";
  const rot = { ampla: "ampla", pcd: "PcD", negros: "pretos e pardos", indigenas: "indígenas", quilombolas: "quilombolas" };
  const det = VAGAS_CAMPOS.filter(([k]) => v[k]).map(([k]) => `${String(v[k]).replace(/\s*\+\s*CR/i, "")} ${rot[k]}`);
  const cr = v.cr || VAGAS_CAMPOS.some(([k]) => /CR/i.test(String(v[k] || "")));
  const tot = v.total ? `${v.total} vaga${+v.total === 1 ? "" : "s"}` : "Cadastro de reserva";
  return `${tot}${det.length ? ` (${det.join(", ")})` : ""}${cr && v.total ? " + CR" : ""}`;
}
