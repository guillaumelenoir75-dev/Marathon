// sw.js — Service Worker Plan Marathon v6
// Gère les push notifications et le tap sur une notification

self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(clients.claim()); });

self.addEventListener('push', event => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch(e) { data = { title: 'En Piste', body: event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(data.title || 'En Piste', {
      body: data.body || '',
      icon: '/enpiste-icon-512.png',
      badge: '/enpiste-icon-192.png',
      tag: data.tag || 'enpiste-notif',
      data: { url: data.url || '/', tag: data.tag || '' },
      requireInteraction: false,
      vibrate: [200, 100, 200]
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Chercher une fenêtre déjà ouverte sur l'app
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Sinon ouvrir une nouvelle fenêtre
      return clients.openWindow(targetUrl);
    })
  );
});
