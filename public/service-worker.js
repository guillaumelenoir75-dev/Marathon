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
  self.registration.showNotification(payload.notification.title, {
    body: payload.notification.body,
    icon: '/enpiste-icon-192.png',
    badge: '/enpiste-icon-192.png'
  });
});
