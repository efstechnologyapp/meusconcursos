// Leitura de boleto em PDF: encontra a linha digitável, o vencimento e o valor.
// Usa o mesmo leitor de PDF do edital (textoDoPdf, em edital.js).

function soDigitos(s) { return String(s || "").replace(/\D/g, ""); }

// Dígito verificador módulo 10 (campos da linha digitável)
function mod10(num) {
  let soma = 0, peso = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    let p = +num[i] * peso;
    if (p > 9) p = Math.floor(p / 10) + (p % 10);
    soma += p; peso = peso === 2 ? 1 : 2;
  }
  const r = soma % 10;
  return r === 0 ? 0 : 10 - r;
}

// Fator de vencimento: a contagem reiniciou em 22/02/2025 (fator 1000)
function dataDoFator(fator) {
  if (!fator) return "";
  const dia = 86400000;
  const antiga = new Date(Date.UTC(1997, 9, 7) + fator * dia);
  const nova = new Date(Date.UTC(2025, 1, 22) + (fator - 1000) * dia);
  const agora = Date.now();
  const d = (fator >= 1000 && Math.abs(nova - agora) < Math.abs(antiga - agora)) ? nova : antiga;
  return d.toISOString().slice(0, 10);
}

function formatarLinha(d) {
  if (d.length === 47) return `${d.slice(0,5)}.${d.slice(5,10)} ${d.slice(10,15)}.${d.slice(15,21)} ${d.slice(21,26)}.${d.slice(26,32)} ${d[32]} ${d.slice(33)}`;
  if (d.length === 48) return [0, 12, 24, 36].map(i => `${d.slice(i, i + 11)}-${d[i + 11]}`).join(" ");
  return d;
}

// Analisa uma linha digitável (47 dígitos: boleto bancário; 48: arrecadação/GRU/convênio)
function analisarLinha(texto) {
  const d = soDigitos(texto);
  const r = { digitos: d, linha: formatarLinha(d), valida: false, vencimento: "", valor: "" };
  if (d.length === 47) {
    r.valida = mod10(d.slice(0, 9)) === +d[9] && mod10(d.slice(10, 20)) === +d[20] && mod10(d.slice(21, 31)) === +d[31];
    r.vencimento = dataDoFator(+d.slice(33, 37));
    const v = +d.slice(37) / 100;
    if (v > 0) r.valor = v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } else if (d.length === 48 && d[0] === "8") {
    r.valida = true;
    if (d[2] === "6" || d[2] === "7") {          // valor em reais efetivos
      const v = +(d.slice(4, 11) + d.slice(12, 16)) / 100;
      if (v > 0) r.valor = v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }
  }
  return r;
}

function encontrarLinhaNoTexto(texto) {
  const plano = texto.replace(/\s+/g, " ");
  const banc = /(\d{5}[.\s]?\d{5})\s*(\d{5}[.\s]?\d{6})\s*(\d{5}[.\s]?\d{6})\s*(\d)\s*(\d{14})/g;
  const arrec = /(8\d{10}[-\s]?\d)\s*(\d{11}[-\s]?\d)\s*(\d{11}[-\s]?\d)\s*(\d{11}[-\s]?\d)/g;
  const candidatos = [...plano.matchAll(banc), ...plano.matchAll(arrec)].map(m => analisarLinha(m[0]));
  return candidatos.find(c => c.valida) || candidatos[0] || null;
}

function lerVencimentoNoTexto(texto) {
  const plano = texto.replace(/\s+/g, " ");
  const m = plano.match(/vencimento[^0-9]{0,40}(\d{2})\/(\d{2})\/(\d{4})/i);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}
function lerValorNoTexto(texto) {
  const plano = texto.replace(/\s+/g, " ");
  const m = plano.match(/valor(?: do documento| a pagar| cobrado| total)?[^0-9]{0,30}(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})/i);
  return m ? "R$ " + m[1] : "";
}

async function lerBoleto(arquivo) {
  const texto = await textoDoPdf(arquivo, 5);
  const linha = encontrarLinhaNoTexto(texto);
  return {
    semTexto: texto.replace(/\s/g, "").length < 40,
    linha: linha ? linha.linha : "",
    digitos: linha ? linha.digitos : "",
    valida: linha ? linha.valida : false,
    vencimento: lerVencimentoNoTexto(texto) || (linha ? linha.vencimento : ""),
    valor: lerValorNoTexto(texto) || (linha ? linha.valor : "")
  };
}

if (typeof module !== "undefined") module.exports = { analisarLinha, encontrarLinhaNoTexto, dataDoFator, mod10, lerVencimentoNoTexto, lerValorNoTexto };
