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
  const notifData = event.notification.data || {};
  const notifTag = notifData.tag || '';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin)) {
          // iOS PWA : focus() d'abord (dégèle le JS), postMessage() dans le .then()
          return client.focus().then(function(c) {
            (c || client).postMessage({ action: 'open_coach', tag: notifTag });
          });
        }
      }
      // App non ouverte → ouvrir avec URL (nouvelle instance)
      return clients.openWindow('/?action=brief&tag=' + encodeURIComponent(notifTag));
    })
  );
});
