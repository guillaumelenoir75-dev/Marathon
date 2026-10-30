// sw.js — Service Worker Plan Marathon v7
// Gère les push notifications et le tap sur une notification

self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(clients.claim()); });

// Ouverture sans réseau : l'app (page, scripts, bibliothèques) est gardée dans le cache « pm-shell ».
// - page d'accueil : toujours depuis le réseau (contourne le cache iOS), copie de secours si hors ligne ;
// - scripts versionnés (bundle-<n°>.js, lazy-*, Firebase, Chart.js, polices) : cache d'abord (nom unique par version) ;
// - autres fichiers de l'app : réseau d'abord, cache si hors ligne. Base de données, fonctions, API : jamais interceptées.
const SHELL = 'pm-shell-v1';
const VERSIONED = /\/src\/(bundle|lazy)-[\w-]+\.js$/;
const CDN = /^https:\/\/(www\.gstatic\.com\/firebasejs\/|cdn\.jsdelivr\.net\/npm\/|cdnjs\.cloudflare\.com\/|fonts\.(googleapis|gstatic)\.com\/)/;
async function shellPut(req, res) {
  if (!res || !(res.ok || res.type === 'opaque')) return res;
  try {
    const c = await caches.open(SHELL);
    await c.put(req, res.clone());
    // anciennes versions du bundle : on garde les 2 plus récentes de chaque famille
    const m = new URL(req.url).pathname.match(/\/src\/((?:bundle|lazy-[a-z]+))-(\d+)\.js$/);
    if (m) {
      const same = (await c.keys()).map(k => ({ k, m: new URL(k.url).pathname.match(/\/src\/((?:bundle|lazy-[a-z]+))-(\d+)\.js$/) }))
        .filter(x => x.m && x.m[1] === m[1]).sort((a, b) => +b.m[2] - +a.m[2]);
      same.slice(2).forEach(x => c.delete(x.k));
    }
  } catch (e) {}
  return res;
}
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (same && (url.pathname === '/' || url.pathname === '/index.html')) {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).then(r => shellPut(new Request('/'), r))
        .catch(() => caches.match('/', { ignoreSearch: true }).then(r => r || caches.match(req)))
    );
    return;
  }
  if ((same && VERSIONED.test(url.pathname)) || CDN.test(req.url)) {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => shellPut(req, r))));
    return;
  }
  if (same && /^\/(src\/|manifest\.json$|[\w-]+\.(png|svg|css)$)/.test(url.pathname)) {
    event.respondWith(fetch(req).then(r => shellPut(req, r)).catch(() => caches.match(req)));
  }
});

self.addEventListener('push', event => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch(e) { data = { title: 'Plan Marathon', body: event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Plan Marathon', {
      body: data.body || '',
      icon: '/icon-512-v3.png',
      badge: '/icon-192-v3.png',
      tag: data.tag || 'marathon-notif',
      data: { tag: data.tag || '' },
      requireInteraction: false
    })
  );
});

// Tap → ouvrir le coach si c'est un brief, sinon juste focus l'app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const tag = (event.notification.data && event.notification.data.tag) || '';
  const isBrief = tag.includes('brief');
  const targetUrl = isBrief ? '/?action=brief' : /plan[-_]review/.test(tag) ? '/?action=review' : '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async function(list) {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin)) {
          // relecture du plan, app déjà ouverte : message à la page (pas de rechargement ni de saisie perdue)
          if (/plan[-_]review/.test(tag)) { try { c.postMessage({ action: 'open_review' }); return c.focus(); } catch(e) {} }
          try { await c.navigate(targetUrl); } catch(e) {}
          return c.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
