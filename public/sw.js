// sw.js — Service Worker Plan Marathon v5
// Gère les push notifications et le tap sur une notification

self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(clients.claim()); });

self.addEventListener('push', event => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch(e) { data = { title: 'Plan Marathon', body: event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Plan Marathon', {
      body: data.body || '',
      icon: '/icon-512-v2.png',
      badge: '/icon-192-v2.png',
      tag: data.tag || 'marathon-notif',
      data: { tag: data.tag || '' },
      requireInteraction: false
    })
  );
});

// Tap → réveiller l'app (ou l'ouvrir). Firebase gère la navigation.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      if (list.length > 0) return list[0].focus();
      return clients.openWindow('/');
    })
  );
});
