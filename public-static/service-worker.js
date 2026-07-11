// Service Worker natif — push + notificationclick sans SDK Firebase Messaging
// (les pushs sont envoyées via web-push/VAPID directement, pas via FCM)

self.addEventListener('push', event => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch(e) { return; }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Marathon', {
      body: data.body || '',
      icon: '/enpiste-icon-192.png',
      badge: '/enpiste-icon-192.png',
      tag: data.tag || '',
      data: { url: data.url || '/', tag: data.tag || '' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const d = event.notification.data || {};
  const isBrief = (d.tag || '').includes('brief');
  const targetUrl = isBrief ? '/?action=brief' : (d.url || '/');

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async list => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin)) {
          try { await c.navigate(targetUrl); } catch(e) {}
          await c.focus();
          return;
        }
      }
      await clients.openWindow(targetUrl);
    })
  );
});
