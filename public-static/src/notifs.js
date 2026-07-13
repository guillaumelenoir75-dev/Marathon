function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

// Enregistre le Service Worker et initialise l'état du bouton notifications
function _updateHomeNotifBanner(){
  const banner = document.getElementById('home-notif-banner');
  if (!banner) return;
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    banner.style.display = 'none';
    return;
  }
  const perm = Notification.permission;
  if (perm === 'granted') {
    banner.style.display = 'none';
    return;
  }
  banner.style.display = 'block';
  const isDenied = perm === 'denied';
  banner.innerHTML = `<div onclick="handleNotifBtn()" style="background:${isDenied?'linear-gradient(135deg,#C4141B,#8B0000)':'linear-gradient(135deg,#E8530A,#C4141B)'};border-radius:14px;padding:12px 16px;display:flex;align-items:center;gap:12px;cursor:pointer;margin-bottom:10px;box-shadow:0 4px 16px rgba(232,83,10,0.35);">
    <div style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
    </div>
    <div style="flex:1;">
      <p style="font-size:14px;font-weight:800;color:#fff;margin:0;">${isDenied?'Notifications bloquées':'🔔 Active les notifications'}</p>
      <p style="font-size:11px;color:rgba(255,255,255,0.88);margin:3px 0 0;">${isDenied?"Va dans Réglages › Marathon pour les débloquer":"Ne rate plus aucune séance — appuie ici !"}</p>
    </div>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
  </div>`;
}

async function testLocalNotif(type){
  if (!('serviceWorker' in navigator)) { alert('Service Worker non supporté sur cet appareil.'); return; }
  if (Notification.permission !== 'granted') {
    alert('Active d\'abord les notifications en appuyant sur le bouton "Notifs" en haut de l\'écran.');
    return;
  }
  const cw = getEffectiveCW();
  const notifDefs = {
    notif_brief_matin: { title: '☀️ Brief du matin — S'+cw, body: 'EF 12 km prévu à 7h30. Conditions idéales aujourd\'hui 🌤️' },
    notif_seance:      { title: '⏱️ Séance dans 1h', body: 'EF 12 km dans 1 heure. Prépare tes affaires ! 🏃' },
    notif_planif:      { title: '📅 On planifie la semaine ?', body: 'Prends 2 min pour planifier tes séances de la semaine à venir.' },
    notif_congrats:    { title: '🏆 Semaine S'+cw+' complète !', body: 'Toutes tes séances sont validées. Beau travail, continue ! 💪' },
    notif_fc_repos:    { title: 'Rappel ☀️', body: 'Rentre ta FC repos avant de te lever ❤️' },
    notif_unvalidated: { title: '⚠️ Séances non validées', body: '2 séances de cette semaine ne sont pas encore cochées.' },
  };
  const n = notifDefs[type];
  if (!n) return;
  // Écrire les flags Firebase avant d'afficher la notif (même comportement que la CF de production)
  // → garantit l'ouverture du coach via visibilitychange, chemin fiable sur iOS
  if (dbRef) {
    const today = new Date().toISOString().slice(0,10);
    if (type === 'notif_brief_matin') {
      try {
        await dbRef.child('_brief_pending').set({needs_full_brief:true, date:today});
        await dbRef.child('_open_coach').set(true);
      } catch(e) {}
      window._pendingBilanOpen = true;
    }
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(n.title, {
      body: n.body,
      icon: '/icon-512-v3.png',
      badge: '/icon-192-v3.png',
      tag: type+'-test',
      data: { tag: type+'-test' },
      requireInteraction: false
    });
    const btn = document.getElementById('test-notif-btn-'+type);
    if (btn) { btn.textContent = '✅'; btn.style.background = '#EAF3DE'; btn.style.color = '#3B6D11'; setTimeout(()=>{ btn.textContent='Tester'; btn.style.background=''; btn.style.color=''; }, 2500); }
    // Pas de timer automatique : il consommait _brief_pending avant le tap sur la notification.
    // Le tap sur la notif (bannière ou centre de notifs) déclenche SW → postMessage → openCoachFromNotif.
    // Si l'utilisateur ouvre l'onglet Coach manuellement, loadCoachHistory → checkPendingBrief trouve _brief_pending.
  } catch(e) {
    // Nettoyer les flags Firebase si la notification n'a pas pu être affichée
    if (dbRef && type === 'notif_brief_matin') {
      try { await dbRef.child('_brief_pending').remove(); } catch(e2) {}
      try { await dbRef.child('_open_coach').remove(); } catch(e2) {}
    }
    alert('Erreur test notif : '+e.message);
  }
}

async function initNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    // iOS < 16.4 ou pas installée comme PWA → cacher le bouton
    const btn = document.getElementById('notif-btn');
    if (btn) btn.style.display = 'none';
    return;
  }
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    updateNotifBtnState();
    // Refresh la subscription à chaque chargement si permission accordée
    // → garantit que Firebase a toujours l'endpoint valide (évite les expirations silencieuses)
    if (Notification.permission === 'granted') {
      await subscribeToPush();
    }
  } catch(e) {
    console.warn('SW registration failed:', e);
  }
}

// Met à jour l'apparence du bouton selon l'état actuel
function updateNotifBtnState() {
  const btn = document.getElementById('notif-btn');
  const label = document.getElementById('notif-btn-label');
  const icon = document.getElementById('notif-bell-icon');
  const badge = document.getElementById('notif-badge');
  if (!btn) return;
  const perm = ('Notification' in window) ? Notification.permission : 'unavailable';
  if (perm === 'granted') {
    btn.style.background = 'rgba(127,212,168,0.25)';
    if (label) label.textContent = '✓ Actives';
    if (icon) icon.setAttribute('stroke', '#7FD4A8');
    if (badge) badge.style.display = 'none';
  } else if (perm === 'denied') {
    btn.style.background = 'rgba(226,75,74,0.2)';
    if (label) label.textContent = 'Bloquées';
    if (icon) icon.setAttribute('stroke', '#E24B4A');
    if (badge) badge.style.display = 'block';
  } else {
    btn.style.background = 'rgba(255,255,255,0.13)';
    if (label) label.textContent = 'Notifs';
    if (icon) icon.setAttribute('stroke', 'rgba(255,255,255,0.75)');
    // Pastille orange uniquement si PushManager supporté (sinon on ne peut pas activer)
    if (badge) badge.style.display = ('PushManager' in window) ? 'block' : 'none';
  }
}

// Appelé au tap sur le bouton
async function handleNotifBtn() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert('Les notifications push nécessitent iOS 16.4+ et que l\'app soit installée sur l\'écran d\'accueil.');
    return;
  }
  const perm = Notification.permission;
  if (perm === 'denied') {
    alert('Les notifications sont bloquées. Va dans Réglages > Marathon pour les réactiver.');
    return;
  }
  if (perm === 'granted') {
    // Déjà accordé → re-subscribe au cas où la subscription a expiré
    await subscribeToPush();
    return;
  }
  // Demander la permission (doit venir d'un geste utilisateur — c'est le cas ici)
  const result = await Notification.requestPermission();
  updateNotifBtnState();
  if (result === 'granted') {
    await subscribeToPush();
  }
}

// Crée la subscription VAPID et la sauvegarde dans Firebase
async function subscribeToPush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    // Sauvegarder dans Firebase DB sous users/{uid}/state/_push_sub
    if (dbRef) {
      const subObj = { ...JSON.parse(JSON.stringify(sub)), subscribedAt: Date.now() };
      await dbRef.child('_push_sub').set(subObj);
      // Aussi dans _push_subscribers/{uid} pour les notifications multi-utilisateurs
      const uid = firebase.auth().currentUser?.uid;
      if (uid) await firebase.database().ref('_push_subscribers/'+uid).set(subObj);
      console.log('Push subscription sauvegardée dans Firebase');
    }
    updateNotifBtnState();
  } catch(e) {
    console.error('Erreur subscribe push:', e);
    if (e.message && e.message.includes('applicationServerKey')) {
      console.warn('Clé VAPID invalide — remplace VAPID_PUBLIC_KEY dans index.html');
    }
  }
}

// Lancer l'init notifications au chargement de l'app
// (appelé après que Firebase est prêt, dans le bloc firebase.auth)

