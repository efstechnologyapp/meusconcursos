// Guarda os arquivos do app para funcionar sem internet
const CACHE = "meus-concursos-v64";
const ARQUIVOS = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png", "./edital.js", "./boleto.js", "./viagem.js", "./agenda.js", "./estudos.js", "./provas.js", "./historico.js", "./config.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS.map(u => new Request(u, { cache: "reload" })))));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  if (new URL(e.request.url).origin !== self.location.origin) return;   // login, Apps Script e bibliotecas externas vão direto à rede
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })   // confere com o GitHub (que guarda arquivos por 10 min no navegador)
      .then(r => { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request))
  );
});
