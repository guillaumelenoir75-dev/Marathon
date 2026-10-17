// Suivi Guillaume — fonctions communes aux pages /suivi-guillaume (lecture) et /suivi-admin (envoi GPS).
// Données en direct dans la Realtime Database, nœud /live (lecture publique, écriture réservée à l'admin).

const SUIVI_FB = {
  apiKey: 'AIzaSyA1yOzyqcrIM4fYOJh5DCBFPQXCSV7X5uw',
  authDomain: 'prepa-marathon.firebaseapp.com',
  databaseURL: 'https://prepa-marathon-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'prepa-marathon',
  appId: '1:1068433254929:web:63147befb9b51dd2f95fb0',
};
const SUIVI_ADMIN_UID = 'WkEWrmnYWuUNkGLrwXf9HhaJWfh1';

function suiviLoadScript(src){
  return new Promise(function(ok, ko){ const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
}
async function suiviFirebase(withAuth){
  const base = 'https://www.gstatic.com/firebasejs/9.23.0/';
  await suiviLoadScript(base + 'firebase-app-compat.js');
  if(withAuth) await suiviLoadScript(base + 'firebase-auth-compat.js');
  await suiviLoadScript(base + 'firebase-database-compat.js');
  if(!firebase.apps.length) firebase.initializeApp(SUIVI_FB);
  return firebase.database().ref('live');
}
function suiviLeaflet(){
  if(window.L) return Promise.resolve();
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(l);
  return suiviLoadScript('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js');
}

// ─── Géométrie du parcours (mètres le long du tracé GPX) ────────────────────
const SuiviGeo = (function(){
  const RAD = Math.PI / 180;
  const kx = function(lat){ return 111320 * Math.cos(lat * RAD); };
  const dist = function(a, b){ const dx = (b[1]-a[1]) * kx((a[0]+b[0])/2), dy = (b[0]-a[0]) * 110540; return Math.sqrt(dx*dx + dy*dy); };
  const pts = SUIVI_DATA.route, cum = [0];
  for(let i = 1; i < pts.length; i++) cum.push(cum[i-1] + dist(pts[i-1], pts[i]));
  const len = cum[cum.length - 1], scale = SUIVI_DATA.official / len;
  function project(p, sMin, sMax){
    const K = kx(p[0]); let best = { d: Infinity, s: 0 };
    for(let i = 1; i < pts.length; i++){
      if(sMax !== undefined && (cum[i] < sMin || cum[i-1] > sMax)) continue;
      const a = pts[i-1], b = pts[i];
      const ax = (a[1]-p[1]) * K, ay = (a[0]-p[0]) * 110540, bx = (b[1]-p[1]) * K, by = (b[0]-p[0]) * 110540;
      const dx = bx-ax, dy = by-ay, L2 = dx*dx + dy*dy, u = L2 ? Math.max(0, Math.min(1, -(ax*dx + ay*dy) / L2)) : 0;
      const d = Math.hypot(ax + u*dx, ay + u*dy);
      if(d < best.d) best = { d: d, s: cum[i-1] + u * Math.sqrt(L2) };
    }
    return best;
  }
  function pointAt(s){
    s = Math.max(0, Math.min(len, s));
    for(let i = 1; i < pts.length; i++) if(cum[i] >= s){ const f = (s - cum[i-1]) / ((cum[i] - cum[i-1]) || 1); return [pts[i-1][0] + (pts[i][0]-pts[i-1][0]) * f, pts[i-1][1] + (pts[i][1]-pts[i-1][1]) * f]; }
    return pts[pts.length - 1];
  }
  // position des points de passage sur le tracé (fenêtre autour du km annoncé pour éviter les portions voisines)
  SUIVI_DATA.points.forEach(function(pt){
    pt.s = pt.id === 'finish' ? len : project(pt.coord, (pt.km - 3) * 1000 / scale, (pt.km + 3) * 1000 / scale).s;
  });
  return { dist: dist, project: project, pointAt: pointAt, len: len, scale: scale, km: function(s){ return s * scale / 1000; } };
})();

// ─── Formats ────────────────────────────────────────────────────────────────
const suiviFmt = {
  hhmm: function(t){ const d = new Date(t); return d.getHours() + 'h' + String(d.getMinutes()).padStart(2, '0'); },
  dur: function(ms){ ms = Math.max(0, ms); const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h + ':' + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0'); },
  km: function(m){ return (m / 1000).toFixed(m >= 9950 ? 1 : 2).replace('.', ','); },
  pace: function(secPerKm){ if(!isFinite(secPerKm) || secPerKm <= 0) return '–'; const m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60); return m + "'" + String(s === 60 ? 59 : s).padStart(2, '0') + '"/km'; },
  ago: function(ms){ const s = Math.round(ms / 1000); return s < 60 ? 'il y a ' + Math.max(1, s) + ' s' : s < 3600 ? 'il y a ' + Math.round(s / 60) + ' min' : 'il y a ' + Math.floor(s / 3600) + ' h'; },
  planned: function(hm){ const p = hm.split(':'); const d = new Date(SUIVI_DATA.date + 'T00:00:00'); d.setHours(+p[0], +p[1], 0, 0); return d.getTime(); },
};
