// sw.js — Service Worker Plan Marathon v6
// Gère les push notifications et le tap sur une notification

self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(clients.claim()); });

// Force index.html à toujours venir du réseau (bypass du cache iOS PWA)
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(() => caches.match(event.request))
    );
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
  const targetUrl = isBrief ? '/?action=brief' : '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async function(list) {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin)) {
          try { await c.navigate(targetUrl); } catch(e) {}
          return c.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
