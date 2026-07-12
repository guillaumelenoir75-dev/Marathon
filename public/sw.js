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
  const notifTag = (event.notification.data && event.notification.data.tag) || '';
  // Toutes les notifs coach ouvrent /?action=brief pour garantir le rechargement
  const briefUrl = '/?action=brief&tag=' + encodeURIComponent(notifTag);
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin)) {
          // navigate() force un rechargement à la bonne URL (plus fiable que focus+postMessage)
          if ('navigate' in client) return client.navigate(briefUrl).then(c => c && c.focus());
          client.focus();
          return;
        }
      }
      return clients.openWindow(briefUrl);
    })
  );
});
