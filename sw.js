/* Service worker do Tio Brasa — Brazuka Web
   - Com internet: sempre pega a versão mais nova do sistema (atualiza sozinho para todos).
   - Sem internet: abre a última versão guardada no aparelho.
   Ao publicar mudanças grandes, aumente o número da VERSAO. */
const VERSAO = 'tio-brasa-v7';
const ARQUIVOS = [
  './',
  'index.html',
  'privacidade.html',
  'manifest.webmanifest',
  'assets/style.css',
  'assets/app.js',
  'assets/nuvem.js',
  'assets/nuvem-config.js',
  'assets/icones/icone3-192.png',
  'assets/icones/icone3-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Programa da nuvem (Firebase, versão fixa): guarda no aparelho para abrir mesmo sem internet
  if (req.url.startsWith('https://www.gstatic.com/firebasejs/')) {
    e.respondWith(
      caches.match(req).then((r) => r || fetch(req).then((resp) => {
        if (resp && resp.ok) { const copia = resp.clone(); caches.open(VERSAO).then((c) => c.put(req, copia)); }
        return resp;
      }))
    );
    return;
  }
  if (new URL(req.url).origin !== self.location.origin) return; // dados da nuvem e fontes: direto
  // primeiro tenta a internet (versão nova); se falhar, usa a cópia guardada
  e.respondWith(
    fetch(req, { cache: 'no-cache' }) // sempre confere no servidor se tem versão nova
      .then((resp) => {
        if (resp && resp.ok) {
          const copia = resp.clone();
          caches.open(VERSAO).then((c) => c.put(req, copia));
        }
        return resp;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('index.html')))
  );
});
