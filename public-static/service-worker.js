importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:"AIzaSyA1yOzyqcrIM4fYOJh5DCBFPQXCSV7X5uw",
  authDomain:"prepa-marathon.firebaseapp.com",
  databaseURL:"https://prepa-marathon-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:"prepa-marathon",
  storageBucket:"prepa-marathon.firebasestorage.app",
  messagingSenderId:"1068433254929",
  appId:"1:1068433254929:web:63147befb9b51dd2f95fb0"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const d = payload.data || {};
  const title = d.title || (payload.notification && payload.notification.title) || 'Marathon';
  const body  = d.body  || (payload.notification && payload.notification.body)  || '';
  self.registration.showNotification(title, {
    body,
    icon: '/enpiste-icon-192.png',
    badge: '/enpiste-icon-192.png',
    data: { url: d.url || '/', tag: d.tag || '' }
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = data.url || '/';
  const tag = data.tag || '';
  const isBrief = tag.includes('brief');

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async list => {
      let target = null;
      for (const c of list) {
        if (c.url.startsWith(self.location.origin)) { target = c; break; }
      }
      if (target) {
        await target.focus();
      } else {
        target = await clients.openWindow(url);
      }
      if (isBrief && target) {
        target.postMessage({ type: 'OPEN_COACH_BRIEF' });
      }
    })
  );
});
