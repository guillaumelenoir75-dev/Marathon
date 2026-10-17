// Guidage GPS de la page indépendante /trajet-amis : depuis la région parisienne jusqu'au 24 route de Portejoie.
// GPS libre (OSRM) jusqu'à l'A13 à Flins, puis bascule silencieuse sur l'itinéraire bloqué (AMIS_DATA) jusqu'au
// stationnement route de Tournedos, puis à pied jusqu'à la maison. Copie autonome de race-nav.js (ne pas fusionner).

const AmisNav = (function(){
  const RAD = Math.PI / 180;
  const DEST = {
    30: { label: 'Maison — 24 route de Portejoie (Tournedos)', short: 'la maison', routes: ['A3'], walk: '30' },
  };
  let ctx = null, pending = null;
  let st = null;   // état du guidage en cours

  // ─── géométrie (mètres, projection locale) ───────────────────────────────
  const kx = function(lat){ return 111320 * Math.cos(lat * RAD); };
  const dist = function(a, b){ const dx = (b[1]-a[1]) * kx((a[0]+b[0])/2), dy = (b[0]-a[0]) * 110540; return Math.sqrt(dx*dx + dy*dy); };
  const bearing = function(a, b){ return (Math.atan2((b[1]-a[1]) * Math.cos(a[0]*RAD), b[0]-a[0]) / RAD + 360) % 360; };
  const mkLine = function(pts){ const cum = [0]; for(let i = 1; i < pts.length; i++) cum.push(cum[i-1] + dist(pts[i-1], pts[i])); return { pts: pts, cum: cum, len: cum[cum.length-1] }; };
  function project(line, p, sMin, sMax){
    const K = kx(p[0]); let best = { d: Infinity, s: 0, i: 0 };
    for(let i = 1; i < line.pts.length; i++){
      if(sMax !== undefined && (line.cum[i] < sMin || line.cum[i-1] > sMax)) continue;
      const a = line.pts[i-1], b = line.pts[i];
      const ax = (a[1]-p[1]) * K, ay = (a[0]-p[0]) * 110540, bx = (b[1]-p[1]) * K, by = (b[0]-p[0]) * 110540;
      const dx = bx-ax, dy = by-ay, L2 = dx*dx + dy*dy;
      const u = L2 ? Math.max(0, Math.min(1, -(ax*dx + ay*dy) / L2)) : 0;
      const d = Math.hypot(ax + u*dx, ay + u*dy);
      if(d < best.d) best = { d: d, s: line.cum[i-1] + u * Math.sqrt(L2), i: i };
    }
    return best;
  }
  function pointAt(line, s){
    s = Math.max(0, Math.min(line.len, s));
    for(let i = 1; i < line.pts.length; i++){
      if(line.cum[i] >= s){
        const a = line.pts[i-1], b = line.pts[i], f = (s - line.cum[i-1]) / ((line.cum[i] - line.cum[i-1]) || 1);
        return [a[0] + (b[0]-a[0]) * f, a[1] + (b[1]-a[1]) * f];
      }
    }
    return line.pts[line.pts.length-1];
  }
  function segDist(p, a, b){
    const K = kx(p[0]);
    const ax = (a[1]-p[1]) * K, ay = (a[0]-p[0]) * 110540, bx = (b[1]-p[1]) * K, by = (b[0]-p[0]) * 110540;
    const dx = bx-ax, dy = by-ay, L2 = dx*dx + dy*dy, u = L2 ? Math.max(0, Math.min(1, -(ax*dx + ay*dy) / L2)) : 0;
    return Math.hypot(ax + u*dx, ay + u*dy);
  }
  function nearPolyline(p, pts, tol){
    for(let i = 1; i < pts.length; i++){
      const a = pts[i-1], b = pts[i];
      if(Math.abs(a[0]-p[0]) > 0.02 && Math.abs(b[0]-p[0]) > 0.02) continue;
      if(segDist(p, a, b) < tol) return true;
    }
    return false;
  }

  // ─── textes ──────────────────────────────────────────────────────────────
  const fmtD = function(m){
    if(m >= 1000) return (m / 1000).toFixed(m >= 10000 ? 0 : 1).replace('.', ',') + ' km';
    if(m >= 100) return (Math.round(m / 50) * 50) + ' m';
    return Math.max(10, Math.round(m / 10) * 10) + ' m';
  };
  const sayD = function(m){
    if(m >= 1000) return (m / 1000).toFixed(1).replace('.0', '').replace('.', ',') + ' kilomètres';
    return (m >= 100 ? Math.round(m / 50) * 50 : Math.max(10, Math.round(m / 10) * 10)) + ' mètres';
  };
  const MODS = { 'left': 'Tournez à gauche', 'right': 'Tournez à droite', 'slight left': 'Serrez à gauche', 'slight right': 'Serrez à droite',
    'sharp left': 'Tournez franchement à gauche', 'sharp right': 'Tournez franchement à droite', 'uturn': 'Faites demi-tour', 'straight': 'Continuez tout droit' };
  function sayRoad(r){
    if(!r) return '';
    const m = r.match(/^([ADN])(\d+)\s*(?:\((.*)\))?$/);
    if(m) return (m[1] === 'A' ? 'l\'autoroute ' : 'la ') + m[1] + ' ' + m[2] + (m[3] ? ', ' + m[3] : '');
    return r;
  }
  function text(m, spoken){
    const road = spoken ? sayRoad(m.road) : m.road;
    const sur = road ? ' sur ' + road : '';
    switch(m.type){
      case 'depart': return road ? 'Suivez ' + road : 'Démarrez';
      case 'turn': return (MODS[m.mod] || 'Tournez') + sur;
      case 'continue': return 'Continuez' + sur;
      case 'roundabout': return 'Au rond-point, prenez la ' + (spoken ? (['première','deuxième','troisième','quatrième','cinquième','sixième'][m.exit - 1] || m.exit + 'e') : (m.exit === 1 ? '1re' : m.exit + 'e')) + ' sortie' + (road ? ' vers ' + road : '');
      case 'exit': return 'Prenez la sortie' + (m.ref ? ' ' + m.ref : '') + (m.dest ? (spoken ? ', direction ' : ' « ') + m.dest + (spoken ? '' : ' »') : '');
      case 'ramp': return 'Prenez la bretelle' + (m.dest ? ' direction ' + m.dest : sur);
      case 'merge': return 'Insérez-vous' + sur;
      case 'fork': return 'À l\'embranchement, restez ' + (/left/.test(m.mod || '') ? 'à gauche' : 'à droite') + sur;
      case 'join': return 'Rejoignez l\'itinéraire sécurisé';
      case 'park': return spoken ? 'vous arrivez au stationnement' : 'Stationnement : garez-vous';
      case 'arrive': return 'Vous êtes arrivé';
    }
    return 'Continuez';
  }
  function icon(m){
    const ang = { 'left': -90, 'right': 90, 'slight left': -45, 'slight right': 45, 'sharp left': -135, 'sharp right': 135, 'straight': 0 };
    const arrow = function(a){ return '<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><g transform="rotate(' + a + ' 24 24)"><path d="M24 6 L36 20 H28 V42 H20 V20 H12 Z" fill="currentColor"/></g></svg>'; };
    if(m.type === 'roundabout') return '<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><circle cx="24" cy="28" r="9" fill="none" stroke="currentColor" stroke-width="5"/><path d="M24 4 L32 14 H27 V19 H21 V14 H16 Z" fill="currentColor"/><text x="24" y="33" text-anchor="middle" font-size="11" font-weight="900" fill="currentColor">' + (m.exit || '') + '</text></svg>';
    if(m.type === 'park') return '<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><rect x="8" y="8" width="32" height="32" rx="7" fill="none" stroke="currentColor" stroke-width="4"/><text x="24" y="33" text-anchor="middle" font-size="22" font-weight="900" fill="currentColor">P</text></svg>';
    if(m.type === 'arrive') return '<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><path d="M12 42 V6 M12 8 H36 L30 15 L36 22 H12" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>';
    if(m.type === 'uturn' || m.mod === 'uturn') return '<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><path d="M30 42 V18 a8 8 0 0 0 -16 0 V26" fill="none" stroke="currentColor" stroke-width="5"/><path d="M6 24 L14 34 L22 24 Z" fill="currentColor"/></svg>';
    if(m.type === 'exit' || m.type === 'ramp') return arrow(40);
    return arrow(ang[m.mod] !== undefined ? ang[m.mod] : 0);
  }

  // ─── voix ────────────────────────────────────────────────────────────────
  let frVoice = null;
  function pickVoice(){
    if(!('speechSynthesis' in window)) return;
    const v = speechSynthesis.getVoices();
    frVoice = v.find(function(x){ return /^fr(-|_)FR/i.test(x.lang); }) || v.find(function(x){ return /^fr/i.test(x.lang); }) || null;
  }
  if('speechSynthesis' in window){ pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function say(txt, force){
    if(!st || (!st.voice && !force) || !('speechSynthesis' in window)) return;
    try {
      if(speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(txt);
      u.lang = 'fr-FR'; if(frVoice) u.voice = frVoice; u.rate = 1.02;
      speechSynthesis.speak(u);
    } catch(e) {}
  }

  // ─── interface ───────────────────────────────────────────────────────────
  function ui(){
    const wrap = document.getElementById('race-map-wrap');
    let top = document.getElementById('rn-top');
    if(!top){
      top = document.createElement('div'); top.id = 'rn-top'; top.className = 'rn-top'; top.setAttribute('aria-live', 'polite');
      top.innerHTML = '<div class="rn-ic"></div><div class="rn-main"><div class="rn-dist"></div><div class="rn-txt"></div></div><div class="rn-next"></div>';
      wrap.appendChild(top);
      const bot = document.createElement('div'); bot.id = 'rn-bot'; bot.className = 'rn-bot';
      bot.innerHTML = '<div class="rn-eta"></div><div class="rn-btns">'
        + '<button type="button" class="rn-b rn-parked" hidden>Je suis garé</button>'
        + '<button type="button" class="rn-b rn-stop">Arrêter</button></div>';
      wrap.appendChild(bot);
      const fab = document.createElement('div'); fab.id = 'rn-fab'; fab.className = 'rn-fab';
      fab.innerHTML = '<button type="button" class="rn-f rn-voice" aria-label="Couper la voix" aria-pressed="true">' + SVG_VOICE + '</button>'
        + '<button type="button" class="rn-f rn-over" aria-label="Vue d\'ensemble du trajet" aria-pressed="false">' + SVG_OVER + '</button>';
      wrap.appendChild(fab);
      const chips = document.createElement('div'); chips.id = 'rn-chips'; chips.className = 'rn-chips';
      chips.innerHTML = '<button type="button" class="rn-recenter" hidden>' + SVG_REC + 'Recentrer</button><div class="rn-road" hidden></div>';
      wrap.appendChild(chips);
      bot.querySelector('.rn-stop').onclick = function(){ stop(); };
      fab.querySelector('.rn-voice').onclick = function(){
        st.voice = !st.voice; this.innerHTML = st.voice ? SVG_VOICE : SVG_MUTE; this.classList.toggle('is-off', !st.voice);
        this.setAttribute('aria-label', st.voice ? 'Couper la voix' : 'Activer la voix'); this.setAttribute('aria-pressed', st.voice ? 'true' : 'false');
        if(!st.voice && 'speechSynthesis' in window) speechSynthesis.cancel();
      };
      fab.querySelector('.rn-over').onclick = function(){ if(st.overview) recentre(); else overview(); };
      chips.querySelector('.rn-recenter').onclick = function(){ recentre(); };
      bot.querySelector('.rn-parked').onclick = function(){ toWalk(); };
    }
    return { wrap: wrap, top: top, bot: document.getElementById('rn-bot'), fab: document.getElementById('rn-fab'), chips: document.getElementById('rn-chips') };
  }
  function banner(m, d, next, cls){
    const u = ui();
    u.top.className = 'rn-top' + (cls ? ' ' + cls : '');
    u.top.querySelector('.rn-ic').innerHTML = m ? icon(m) : '';
    u.top.querySelector('.rn-dist').textContent = d === null || d === undefined ? '' : fmtD(d);
    u.top.querySelector('.rn-txt').textContent = m ? text(m) : '';
    const n = u.top.querySelector('.rn-next');
    n.textContent = next ? 'Puis : ' + text(next) : ''; n.hidden = !next;
  }
  function message(html, cls){
    const u = ui();
    u.top.className = 'rn-top rn-msg' + (cls ? ' ' + cls : '');
    u.top.querySelector('.rn-ic').innerHTML = '';
    u.top.querySelector('.rn-dist').textContent = '';
    u.top.querySelector('.rn-txt').innerHTML = html;
    u.top.querySelector('.rn-next').hidden = true;
    if(u.chips) road(null);
  }
  const SVG_VOICE = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const SVG_MUTE = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const SVG_OVER = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="6" cy="18" r="2.4" fill="currentColor"/><path d="M6 18c0-6 12-3 12-10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="3 3"/><path d="M18 3.5a3 3 0 0 1 3 3c0 2.3-3 5.5-3 5.5s-3-3.2-3-5.5a3 3 0 0 1 3-3z" fill="currentColor"/></svg>';
  const SVG_REC = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 3l7 18-7-4-7 4z" fill="currentColor"/></svg>';
  function road(r){
    const el = ui().chips.querySelector('.rn-road');
    if(!r){ el.hidden = true; return; }
    const m = r.match(/^([ADN]\d+)\s*(?:\((.*)\))?$/);
    el.textContent = m ? (m[2] ? m[2] + ' · ' + m[1] : m[1]) : r; el.hidden = false;
  }
  const curRoad = function(man, s){ let r = null; man.forEach(function(m){ if(m.at <= s + 3 && m.road && m.type !== 'park' && m.type !== 'arrive') r = m.road; }); return r; };
  const hhmm = function(t){ const d = new Date(t); return d.getHours() + 'h' + String(d.getMinutes()).padStart(2, '0'); };
  const fmtMin = function(sec){ const mn = Math.max(1, Math.round(sec / 60)); return mn < 60 ? mn + ' min' : Math.floor(mn / 60) + ' h ' + String(mn % 60).padStart(2, '0'); };
  function eta(driveS, walkM, driveM){
    // en voiture : temps jusqu'au stationnement (en gros), la marche est indiquée à part
    const u = ui(), rav = ctx.RAVITOS[0], walkS = walkM / 1.25;
    const arr = 'Arrivée au point ' + hhmm(Date.now() + (driveS + walkS) * 1000) + ' · Guillaume ' + rav.heure.replace('~', 'environ ');
    u.bot.querySelector('.rn-eta').innerHTML = driveS > 0
      ? '<b>' + fmtMin(driveS) + '</b><i>' + fmtD(driveM) + '</i><span>puis ' + fmtMin(walkS) + ' à pied · ' + arr + '</span>'
      : '<b>' + fmtMin(walkS) + '</b><i>' + fmtD(walkM) + ' à pied</i><span>' + arr + '</span>';
  }
  function remT(k, s){
    // temps restant sur un trajet sûr, tronçon par tronçon (limitations de vitesse OSM)
    const r = AMIS_DATA.routes[k], L_ = routeLine(k);
    if(!r.tt) return (L_.len - s) * r.t / r.len;
    s = Math.max(0, Math.min(L_.len, s));
    let i = 1; while(i < L_.cum.length - 1 && L_.cum[i] < s) i++;
    const f = (s - L_.cum[i-1]) / ((L_.cum[i] - L_.cum[i-1]) || 1);
    return r.tt[r.tt.length - 1] - (r.tt[i-1] + (r.tt[i] - r.tt[i-1]) * f);
  }

  // ─── carte ───────────────────────────────────────────────────────────────
  function drawLine(key, pts, style){
    if(st.layers[key]) st.layers[key].remove();
    st.layers[key] = L.polyline(pts, style).addTo(ctx.map);
    st.want[key] = { pts: pts, style: style }; glLine(key);
  }
  function rmLine(key){
    if(st.layers[key]){ st.layers[key].remove(); delete st.layers[key]; }
    delete st.want[key];
    const m = st.gl; if(!m || !st.glReady) return;
    ['rn-' + key + '-c', 'rn-' + key].forEach(function(id){ if(m.getLayer(id)) m.removeLayer(id); });
    if(m.getSource('rn-' + key)) m.removeSource('rn-' + key);
  }
  function recentre(){
    st.follow = true; st.overview = false;
    const u = ui(); u.chips.querySelector('.rn-recenter').hidden = true; u.fab.querySelector('.rn-over').setAttribute('aria-pressed', 'false');
    if(st.fix) centre(true);
  }
  function overview(){
    // vue d'ensemble : tout le trajet restant, nord en haut, à plat
    st.overview = true; st.follow = false;
    const u = ui(); u.chips.querySelector('.rn-recenter').hidden = false; u.fab.querySelector('.rn-over').setAttribute('aria-pressed', 'true');
    const w = st.want, pts = [].concat(w.appr ? w.appr.pts : [], w.todo ? w.todo.pts : [], w.walk ? w.walk.pts : AMIS_DATA.walks[DEST[st.dest].walk].line);
    if(st.fix) pts.push([st.fix.lat, st.fix.lon]);
    if(st.gl && st.glReady){
      const b = new maplibregl.LngLatBounds(); pts.forEach(function(p){ b.extend([p[1], p[0]]); });
      st.gl.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
      st.gl.fitBounds(b, { padding: { top: 170, bottom: 190, left: 50, right: 70 }, bearing: 0, pitch: 0, duration: 900, maxZoom: 16.5 });
    } else ctx.map.fitBounds(L.latLngBounds(pts), { padding: [60, 60] });
  }
  function centre(force){
    if(st.glReady){ glFollow(!!force && st.follow); return; }
    if(!st.fix || (!st.follow && !force)) return;
    const z = st.phase === 'walk' || st.phase === 'arrived' ? 17.5 : (st.fix.speed > 20 ? 14.5 : 16);
    const c = ctx.map.getCenter(), far = dist([c.lat, c.lng], [st.fix.lat, st.fix.lon]) > 5000;
    if(force || far || Math.abs(ctx.map.getZoom() - z) > 1.5) ctx.map.setView([st.fix.lat, st.fix.lon], z, { animate: !force && !far });
    else ctx.map.panTo([st.fix.lat, st.fix.lon], { animate: true, duration: 0.5 });
  }
  function drawMe(){
    const f = st.fix, ll = [f.lat, f.lon];
    // flèche de navigation orientée selon le cap (point bleu tant que le cap est inconnu)
    const head = f.heading !== null && f.heading !== undefined && !isNaN(f.heading) && f.speed > 1 ? Math.round(f.heading) : null;
    const key = head === null ? 'dot' : head;
    const ic = L.divIcon({ className: '', iconSize: [44, 44], iconAnchor: [22, 22],
      html: '<div class="rn-puck rn-puck-2d' + (head === null ? ' is-dot' : '') + '" style="transform:rotate(' + (head || 0) + 'deg)">' + ARROW_SVG(44) + '<i class="rn-dot"></i></div>' });
    if(!st.me){
      st.acc = L.circle(ll, { radius: f.acc, color: '#1A73E8', weight: 1, opacity: 0.35, fillColor: '#1A73E8', fillOpacity: 0.08, interactive: false }).addTo(ctx.map);
      st.me = L.marker(ll, { icon: ic, zIndexOffset: 2000, interactive: false, keyboard: false }).addTo(ctx.map);
    } else { st.me.setLatLng(ll); if(st.meKey !== key) st.me.setIcon(ic); st.acc.setLatLng(ll).setRadius(f.acc); }
    st.meKey = key;
  }

  // ─── routes ──────────────────────────────────────────────────────────────
  const lines = {};
  function routeLine(key){ return lines[key] || (lines[key] = mkLine(AMIS_DATA.routes[key].line)); }
  function walkLine(key){ return lines['w' + key] || (lines['w' + key] = mkLine(AMIS_DATA.walks[key].line)); }
  const tol = function(){ return Math.max(35, Math.min(80, (st.fix.acc || 20) * 1.2)); };

  function onRoute(){
    // l'utilisateur est-il sur un des itinéraires sûrs de sa destination ?
    const p = [st.fix.lat, st.fix.lon];
    let best = null;
    DEST[st.dest].routes.forEach(function(k){
      const L_ = routeLine(k);
      let pr = (st.route === k && st.s !== null) ? project(L_, p, st.s - 150, st.s + 3000) : null;
      if(!pr || pr.d > tol()) pr = project(L_, p);
      if(pr.d <= tol() && (!best || pr.d < best.pr.d - 15 || (st.route === k && pr.d < best.pr.d + 15))) best = { k: k, pr: pr };
    });
    return best;
  }

  function drive(){
    const r = AMIS_DATA.routes[st.route], L_ = routeLine(st.route);
    const ahead = r.man.filter(function(m){ return m.at > st.s + 3 && !(m.type === 'depart'); });
    const m = ahead[0] || { type: 'park', at: L_.len }, n = ahead[1];
    const dM = m.at - st.s;
    banner(m, dM, n && n.at - m.at < 250 ? n : null);
    let i0 = 1; while(i0 < L_.pts.length - 1 && L_.cum[i0] <= st.s) i0++;
    drawLine('todo', [pointAt(L_, st.s)].concat(L_.pts.slice(i0)), { color: '#1A73E8', weight: 7, opacity: 0.9, lineCap: 'round', interactive: false });
    const wl = AMIS_DATA.walks[DEST[st.dest].walk].len;
    eta(remT(st.route, st.s), wl, L_.len - st.s);
    road(curRoad(r.man, st.s));
    ui().bot.querySelector('.rn-parked').hidden = L_.len - st.s > 400;
    announce(m, dM, 'car');
    if(L_.len - st.s < 30) toWalk();
  }

  function announce(m, d, mode){
    const id = st.phase + ':' + (st.route || st.apprN || 'w') + ':' + m.at;
    const done = st.said[id] || (st.said[id] = {});
    const fast = st.fix.speed > 18;
    const far = mode === 'walk' ? null : (fast ? 1000 : 400), near = mode === 'walk' ? 25 : (fast ? 300 : 120), now = mode === 'walk' ? 8 : 25;
    const quiet = m.type === 'continue';
    if(quiet) return;
    if(far && d <= far && d > near * 1.6 && !done.far){ done.far = true; done.farD = d; say('Dans ' + sayD(d) + ', ' + lc(text(m, true))); }
    else if(d <= near && d > now && !done.near){ done.near = done.far = true; if(done.farD === undefined || done.farD - d > 80) say('Dans ' + sayD(d) + ', ' + lc(text(m, true))); }
    else if(d <= now && !done.now && m.type !== 'park' && m.type !== 'arrive'){ done.now = done.near = done.far = true; say(text(m, true)); }
  }
  const lc = function(t){ return t.charAt(0).toLowerCase() + t.slice(1); };

  function toWalk(){
    if(st.phase === 'walk' || st.phase === 'arrived') return;
    st.phase = 'walk'; st.route = null; st.s = null;
    const w = AMIS_DATA.walks[DEST[st.dest].walk];
    say('Vous êtes au stationnement. Garez-vous, puis continuez à pied sur ' + sayD(w.len) + '.');
    rmLine('todo'); rmLine('appr');
    drawLine('walk', w.line, { color: '#1D4ED8', weight: 6, opacity: 0.9, dashArray: '2 10', lineCap: 'round', interactive: false });
    ui().bot.querySelector('.rn-parked').hidden = true;
    centre(true);
    if(st.fix) step();
  }

  function walk(){
    const w = AMIS_DATA.walks[DEST[st.dest].walk], L_ = walkLine(DEST[st.dest].walk);
    const pr = project(L_, [st.fix.lat, st.fix.lon]);
    const s = pr.s, ahead = w.man.filter(function(m){ return m.at > s + 2; });
    const m = ahead[0] || { type: 'arrive', at: L_.len };
    if(L_.len - s < 20 && pr.d < 40){
      st.phase = 'arrived';
      const rav = ctx.RAVITOS[0];
      road(null);
      message('<b>Vous êtes arrivé ✔</b><br>' + DEST[st.dest].label + ' · passage de Guillaume <b>' + rav.heure.replace('~', 'environ ') + '</b>', 'rn-ok');
      say('Vous êtes arrivé. Passage de Guillaume vers ' + rav.heure.replace('~', '').replace('h', ' heures ') + '.');
      ui().bot.querySelector('.rn-eta').innerHTML = '<b>Arrivé</b> · bon encouragement !';
      return;
    }
    if(pr.d > 60){ message('<b>À pied :</b> rejoignez le chemin bleu en pointillés (' + fmtD(pr.d) + ')', 'rn-warn'); return; }
    banner(m, m.at - s, null);
    eta(0, L_.len - s);
    road(curRoad(w.man, s));
    announce(m, m.at - s, 'walk');
  }

  // ─── hors du trajet : contrôle des fermetures (tests) et retour vers le tracé ───
  function crossesClosed(pts){
    // contrôle sur la partie de l'itinéraire d'approche située dans la zone de course
    const C = ctx.ROUTE, B = AMIS_DATA.bridges, GR = AMIS_DATA.grade || [];
    const allowed = function(q){ return B.some(function(b){ return dist(b, q) < 80; }) || GR.some(function(g){ return dist(g, q) < 35; }); };
    // fermetures limitées dans le temps (ex. chaussée du Vexin 7h-10h), actives seulement pendant leur créneau
    const now = Date.now(), TZ = (AMIS_DATA.timed || []).filter(function(z){ return now >= Date.parse(z.from) && now < Date.parse(z.to); });
    const total = mkLine(pts), skipEnd = total.len - 80;
    for(let i = 0; i < pts.length; i++){
      const p = pts[i];
      if(p[0] < 49.13 || p[0] > 49.33 || p[1] < 1.12 || p[1] > 1.32) continue;
      if(total.cum[i] > skipEnd || total.cum[i] < 40) continue;
      const nearBridge = allowed(p);
      if(!nearBridge && nearPolyline(p, C, 18)) return 'le parcours';
      if(!nearBridge && AMIS_DATA.closed.some(function(c){ return nearPolyline(p, c, 10); })) return 'une rue fermée';
      for(const z of TZ){ if(z.lines.some(function(c){ return nearPolyline(p, c, 10); })) return z.label; }
      // segments longs : échantillonner
      if(i + 1 < pts.length){
        const L2 = dist(p, pts[i+1]);
        for(let f = 25; f < L2; f += 25){
          const q = [p[0] + (pts[i+1][0]-p[0]) * f / L2, p[1] + (pts[i+1][1]-p[1]) * f / L2];
          if(!allowed(q) && nearPolyline(q, C, 18)) return 'le parcours';
        }
      }
    }
    return null;
  }
  // AUCUN itinéraire calculé ailleurs : le GPS ne suit que les trajets sûrs construits (AMIS_DATA).
  // Hors du tracé, il indique seulement où rejoindre le départ du trajet ; le guidage reprend dès que l'on est dessus.
  const START_LABEL = {
    A3: 'l\'A13 direction Rouen, à partir de Flins (après la jonction avec l\'A14)',
  };
  function approach(reason){
    if(!st || !st.fix) return;
    const first = st.phase !== 'lost' || st.lostReason !== reason;
    st.phase = 'lost'; st.lostReason = reason; st.lastApproach = Date.now();
    const p = [st.fix.lat, st.fix.lon];
    let tgt, lab, k;
    if(reason === 'off' && st.route && st.s !== null){
      k = st.route; const L_ = routeLine(k), pr = project(L_, p, Math.max(0, st.s - 200), st.s + 1500);
      tgt = pointAt(L_, pr.s); lab = 'l\'itinéraire (tracé bleu)';
    } else {
      k = DEST[st.dest].routes.slice().sort(function(a, b){ return dist(p, AMIS_DATA.routes[a].line[0]) - dist(p, AMIS_DATA.routes[b].line[0]); })[0];
      tgt = AMIS_DATA.routes[k].line[0]; lab = 'le départ du trajet : ' + START_LABEL[k];
    }
    const d = dist(p, tgt);
    message('<b>' + (reason === 'off' ? 'Itinéraire quitté' : 'Vous n\'êtes pas sur un trajet prévu') + '</b><br>Rejoignez ' + lab + ' : '
      + fmtD(d) + ' vers ' + compass(bearing(p, tgt)) + '. Le guidage reprend automatiquement sur le tracé.', 'rn-warn');
    drawLine('appr', [p, tgt], { color: '#1A73E8', weight: 3, dashArray: '4 8', opacity: 0.8, interactive: false });
    if(!st.want.todo) drawLine('todo', routeLine(k).pts, { color: '#1A73E8', weight: 5, opacity: 0.5, lineCap: 'round', interactive: false });
    if(reason !== 'off'){ const wl = AMIS_DATA.walks[DEST[st.dest].walk].len; eta(remT(k, 0), wl, AMIS_DATA.routes[k].len); }
    if(first) say(reason === 'off' ? 'Faites demi-tour dès que possible et rejoignez l\'itinéraire.' : 'Vous n\'êtes pas sur un trajet prévu. Rejoignez ' + lab.replace(/\s*\(.*?\)/g, '') + '.');
  }

  // ─── Avant le trajet bloqué : GPS libre jusqu'à l'A13 à Flins ─────────────
  // Hors de la zone de la course uniquement (Paris, autre adresse…) : meilleur itinéraire jusqu'au DÉBUT
  // du trajet bloqué (A13 direction Rouen à Flins), contrôlé contre le parcours et les voies fermées.
  // Arrivé sur l'A13 à Flins, le guidage bascule sans transition sur le trajet bloqué.
  const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
  const inRaceZone = function(p){ return p[0] > 49.10 && p[0] < 49.36 && p[1] > 1.08 && p[1] < 1.36; };
  const freeRoute = function(){ return DEST[st.dest].routes.filter(function(k){ return k.charAt(0) === 'A'; })[0]; };
  function osrmMan(route){
    const out = []; let at = 0;
    route.legs[0].steps.forEach(function(s, k){
      const mv = s.maneuver, road = s.ref ? s.ref.replace(/\s/g, '') + (s.name ? ' (' + s.name + ')' : '') : s.name;
      let m = null;
      const t = mv.type;
      if(k === 0) m = { type: 'depart', road: road };
      else if(t === 'roundabout' || t === 'rotary') m = { type: 'roundabout', exit: mv.exit || 1, road: road };
      else if(t === 'exit roundabout' || t === 'exit rotary') m = null;
      else if(t === 'off ramp') m = { type: 'exit', ref: (s.exits || '').split(';')[0], dest: (s.destinations || '').split(':').pop().split(',')[0].trim(), road: road };
      else if(t === 'on ramp') m = { type: 'ramp', dest: (s.destinations || '').split(':').pop().split(',')[0].trim(), road: road };
      else if(t === 'merge') m = { type: 'merge', road: road };
      else if(t === 'fork') m = { type: 'fork', mod: mv.modifier, road: road };
      else if(t === 'arrive') m = { type: 'join', road: '' };
      else if(t === 'new name' || t === 'continue' && (mv.modifier === 'straight' || !mv.modifier)) m = { type: 'continue', road: road };
      else if(t === 'notification') m = null;
      else m = { type: 'turn', mod: mv.modifier || 'straight', road: road };
      if(m){ m.at = at; out.push(m); }
      at += s.distance;
    });
    return out;
  }
  async function approachFree(reason){
    if(!st || st.busy || !st.fix) return;
    const me = st, k = freeRoute(), p = [st.fix.lat, st.fix.lon];
    if(!k || inRaceZone(p)) return approach(reason === 'off' ? 'start' : reason);
    st.busy = true; st.lastFree = Date.now();
    if(reason === 'off') message('<b>Itinéraire quitté</b> · recalcul…', 'rn-msg');
    else if(st.phase !== 'approach') message('<b>Calcul de l\'itinéraire…</b>', 'rn-msg');
    const L_ = routeLine(k), tgt = L_.pts[0], brg = Math.round(bearing(tgt, pointAt(L_, 60)));
    let js = null;
    try {
      const url = OSRM + p[1] + ',' + p[0] + ';' + tgt[1] + ',' + tgt[0] + '?overview=full&geometries=geojson&steps=true&bearings=;' + brg + ',30&radiuses=;40';
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = setTimeout(function(){ if(ctl) ctl.abort(); }, 10000);
      try { const res = await fetch(url, ctl ? { signal: ctl.signal } : {}); js = await res.json(); } finally { clearTimeout(timer); }
    } catch(e) { js = null; }
    if(st !== me) return;
    st.busy = false;
    const route = js && js.routes && js.routes[0];
    const pts = route ? route.geometry.coordinates.map(function(c){ return [c[1], c[0]]; }) : null;
    if(!pts || crossesClosed(pts)) return approach('start');      // pas de réseau ou chemin douteux : on reste en mode bloqué
    const d0 = dist(p, pts[0]), lead = d0 > 5 ? [p].concat(pts) : pts;
    const man = osrmMan(route); if(d0 > 5) man.forEach(function(m){ m.at += d0; });
    // dernière consigne : on continue simplement sur l'A13 (aucune « jonction » visible)
    man.forEach(function(m){ if(m.type === 'join'){ m.type = 'continue'; m.road = 'A13 (Autoroute de Normandie)'; } });
    const first = st.phase !== 'approach';
    st.phase = 'approach'; st.lostReason = null; st.apprN = (st.apprN || 0) + 1; rmLine('appr');
    st.appr = { line: mkLine(lead), man: man, t: { k: k, s: 0, pt: tgt }, dur: route.duration };
    const look = { color: '#1A73E8', weight: 7, opacity: 0.9, lineCap: 'round', interactive: false };
    drawLine('appr', lead, look); drawLine('todo', L_.pts, look);
    say(reason === 'off' ? 'Nouvel itinéraire.' : (first ? 'Itinéraire calculé. ' + (man[0] ? text(man[0], true) + '.' : '') : ''));
    step();
  }
  function approachStep(){
    const A = st.appr, pr = project(A.line, [st.fix.lat, st.fix.lon]);
    if(pr.d > Math.max(60, st.fix.acc * 1.3)){
      st.offA = (st.offA || 0) + 1; st.offAT = st.offAT || Date.now();
      if(st.offA >= 3 && Date.now() - st.offAT > 5000 && Date.now() - st.lastFree > 12000){ st.offA = 0; st.offAT = 0; say('Recalcul.'); approachFree('off'); }
      return;
    }
    st.offA = 0; st.offAT = 0;
    const ahead = A.man.filter(function(m){ return m.at > pr.s + 3 && m.type !== 'depart'; });
    const r = AMIS_DATA.routes[A.t.k];
    // au-delà de la fin de l'approche, on enchaîne avec les consignes du trajet bloqué
    const nextLocked = r.man.filter(function(m){ return m.type !== 'depart'; }).map(function(m){ return Object.assign({}, m, { at: m.at + A.line.len }); });
    const all = ahead.concat(nextLocked.filter(function(m){ return m.at > pr.s + 3; }));
    const m = all[0] || { type: 'continue', at: A.line.len, road: 'A13 (Autoroute de Normandie)' }, n = all[1];
    banner(m, m.at - pr.s, n && n.at - m.at < 250 ? n : null);
    const wl = AMIS_DATA.walks[DEST[st.dest].walk].len;
    eta(A.dur * (1 - pr.s / A.line.len) + remT(A.t.k, 0), wl, A.line.len - pr.s + r.len);
    road(curRoad(A.man, pr.s));
    st.route = null;
    announce(m, m.at - pr.s, 'car');
  }
  const compass = function(b){ return ['le nord', 'le nord-est', 'l\'est', 'le sud-est', 'le sud', 'le sud-ouest', 'l\'ouest', 'le nord-ouest'][Math.round(b / 45) % 8]; };
  // ─── vue 3D (MapLibre) : caméra derrière la voiture, cap toujours en haut ──
  // Repli automatique sur la carte Leaflet 2D si WebGL ou le chargement échoue.
  const ARROW_SVG = function(px){ return '<svg class="rn-arrow" viewBox="0 0 48 48" width="' + px + '" height="' + px + '" aria-hidden="true"><path d="M24 4 L40 42 L24 33 L8 42 Z" fill="#1A73E8" stroke="#fff" stroke-width="3.5" stroke-linejoin="round"/></svg>'; };
  const GL_CDN = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/';
  const STYLE_VEC = 'https://tiles.openfreemap.org/styles/liberty';
  const STYLE_RASTER = { version: 8, sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' } }, layers: [{ id: 'osm', type: 'raster', source: 'osm' }] };
  let glLoading = null;
  function loadGL(){
    if(window.maplibregl) return Promise.resolve();
    if(glLoading) return glLoading;
    glLoading = new Promise(function(ok, ko){
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = GL_CDN + 'maplibre-gl.css'; document.head.appendChild(css);
      const sc = document.createElement('script'); sc.src = GL_CDN + 'maplibre-gl.js'; sc.onload = function(){ window.maplibregl ? ok() : ko(); }; sc.onerror = ko;
      document.head.appendChild(sc); setTimeout(ko, 20000);
    });
    glLoading.catch(function(){ glLoading = null; });
    return glLoading;
  }
  function glSupported(){
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch(e) { return false; }
  }
  const geo = function(pts){ return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts.map(function(p){ return [p[1], p[0]]; }) } }; };
  const W = function(x){ return ['interpolate', ['linear'], ['zoom'], 10, x * 0.5, 15, x, 18, x * 1.9]; };
  const angD = function(a, b){ return ((b - a + 540) % 360) - 180; };
  async function glInit(){
    const me = st;
    if(!glSupported()) return;
    try { await loadGL(); } catch(e) { return; }
    if(st !== me) return;
    const el = document.createElement('div'); el.id = 'rn-gl'; el.className = 'rn-gl';
    document.getElementById('race-map-wrap').appendChild(el);
    let m;
    try {
      m = new maplibregl.Map({ container: el, style: STYLE_VEC, center: st.fix ? [st.fix.lon, st.fix.lat] : [1.2, 49.24], zoom: st.fix ? 15 : 10,
        maxPitch: 70, attributionControl: false, fadeDuration: 0, dragRotate: false, pitchWithRotate: false });
    } catch(e) { el.remove(); return; }
    st.gl = m; st.glEl = el;
    const cr = document.createElement('a'); cr.className = 'rn-credit'; cr.href = 'https://www.openstreetmap.org/copyright'; cr.target = '_blank'; cr.rel = 'noopener';
    cr.textContent = '© OpenStreetMap · OpenMapTiles · OpenFreeMap'; el.appendChild(cr);
    let raster = false;
    const toRaster = function(){ if(raster || st !== me || st.glReady) return; raster = true; m.setStyle(STYLE_RASTER); };
    const tmo = setTimeout(toRaster, 8000);                 // style vectoriel trop lent ou bloqué → tuiles OSM classiques
    m.on('error', function(){ if(!st || !st.glReady) toRaster(); });
    m.on('style.load', function(){
      if(st !== me) return;
      clearTimeout(tmo);
      glDecorate(); st.glReady = true;
      Object.keys(st.want).forEach(glLine);
      el.classList.add('on');
      if(st.fix) glFollow(st.follow);
    });
    m.on('webglcontextlost', function(){ if(st === me) glDestroy(); });
    ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart'].forEach(function(ev){ m.on(ev, function(e){ if(e && e.originalEvent && st === me){ st.overview = false; ui().fab.querySelector('.rn-over').setAttribute('aria-pressed', 'false'); onDrag(); } }); });
  }
  function glDestroy(){
    if(!st || !st.gl) return;
    if(st.ga && st.ga.raf) cancelAnimationFrame(st.ga.raf);
    try { st.gl.remove(); } catch(e) {}
    if(st.glEl) st.glEl.remove();
    st.gl = st.glEl = st.puck = st.ga = null; st.glReady = false;
  }
  function glBefore(){ const s = st.gl.getStyle().layers.find(function(l){ return l.type === 'symbol'; }); return s ? s.id : undefined; }
  function glDecorate(){
    // parcours fermé (rouge à tirets blancs) sous les noms de rues, puis repères P et RDV
    const m = st.gl, before = glBefore(), w = AMIS_DATA.walks[DEST[st.dest].walk].line;
    // bâtiments 3D allégés pour garder l'itinéraire lisible
    m.getStyle().layers.forEach(function(l){ if(l.type === 'fill-extrusion') m.setPaintProperty(l.id, 'fill-extrusion-opacity', 0.45); });
    m.addSource('rn-course', { type: 'geojson', data: geo(ctx.ROUTE) });
    m.addLayer({ id: 'rn-course', type: 'line', source: 'rn-course', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#D62828', 'line-width': W(6), 'line-opacity': 0.85 } }, before);
    m.addLayer({ id: 'rn-course-d', type: 'line', source: 'rn-course', layout: { 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': W(1.8), 'line-dasharray': [3, 3] } }, before);
    if(!st.glMk){
      const pin = function(cls, html, p){ const e = document.createElement('div'); e.className = 'rn-pin'; e.innerHTML = '<div class="rn-pin-in ' + cls + '">' + html + '</div>';
        return new maplibregl.Marker({ element: e, anchor: 'bottom', pitchAlignment: 'viewport', rotationAlignment: 'viewport' }).setLngLat([p[1], p[0]]).addTo(m); };
      const rav = ctx.RAVITOS[0];
      st.glMk = [pin('is-p', '<b>P</b>', w[0]), pin('is-rdv is-home', '<b>Maison</b><span>n°24</span>', w[w.length - 1])];
    }
  }
  function glLine(key){
    const m = st.gl, w = st.want[key]; if(!m || !st.glReady || !w) return;
    const id = 'rn-' + key, s = w.style, dash = s.dashArray ? s.dashArray.split(/\s+/).map(function(x){ return +x / (s.weight || 4); }) : null;
    if(!m.getSource(id)){
      const before = glBefore();
      m.addSource(id, { type: 'geojson', data: geo(w.pts) });
      m.addLayer({ id: id + '-c', type: 'line', source: id, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0B3D91' } }, before);
      m.addLayer({ id: id, type: 'line', source: id, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': s.color } }, before);
    } else m.getSource(id).setData(geo(w.pts));
    const sig = JSON.stringify(s);
    if(w.sig === sig) return;
    w.sig = sig;
    const op = s.opacity === undefined ? 1 : s.opacity;
    m.setPaintProperty(id, 'line-color', s.color); m.setPaintProperty(id, 'line-opacity', op);
    m.setPaintProperty(id, 'line-width', W((s.weight || 4) * 1.1));
    m.setPaintProperty(id, 'line-dasharray', dash || undefined);
    m.setLayoutProperty(id + '-c', 'visibility', dash ? 'none' : 'visible');
    m.setPaintProperty(id + '-c', 'line-width', W((s.weight || 4) * 1.1 + 3)); m.setPaintProperty(id + '-c', 'line-opacity', op);
  }
  function headingNow(){
    // cap de la caméra : direction de l'itinéraire devant soi (stable), sinon cap GPS, sinon le dernier connu
    const f = st.fix, p = [f.lat, f.lon];
    const gps = f.heading !== null && f.heading !== undefined && !isNaN(f.heading) && f.speed > 2 ? f.heading : null;
    const along = function(L_, s){ return bearing(pointAt(L_, s - 5), pointAt(L_, s + 35)); };
    if(st.phase === 'approach' && st.appr){ const pr = project(st.appr.line, p); if(pr.d < 50) return (st.hasB = true, st.lastB = along(st.appr.line, pr.s)); }
    let b = null;
    if(st.phase === 'drive' && st.route && st.s !== null && !(st.back >= 4)) b = along(routeLine(st.route), st.s);
    else if(st.phase === 'walk' || st.phase === 'arrived'){ const WL = walkLine(DEST[st.dest].walk), pr = project(WL, p); if(pr.d < 40 && pr.s < WL.len - 15) b = along(WL, pr.s); }
    if(b === null) b = gps;
    if(b === null) return st.lastB === undefined ? 0 : st.lastB;
    st.hasB = true; st.lastB = b; return b;
  }
  const glZoom = function(){ return st.phase === 'walk' || st.phase === 'arrived' ? 17.6 : st.fix.speed > 22 ? 15.4 : st.fix.speed > 12 ? 16 : 16.6; };
  const glPitch = function(){ return st.phase === 'walk' || st.phase === 'arrived' ? 45 : 60; };
  const glPad = function(){ const h = st.glEl.clientHeight || 700; return { top: Math.round(h * (st.phase === 'walk' || st.phase === 'arrived' ? 0.3 : 0.5)), bottom: 90, left: 0, right: 0 }; };
  function glFollow(force){
    const m = st.gl; if(!m || !st.glReady || !st.fix) return;
    const to = [st.fix.lon, st.fix.lat], b = headingNow();
    if(!st.puck){
      // flèche de navigation classique, posée à plat sur la carte et orientée selon le cap
      const e = document.createElement('div'); e.className = 'rn-puck';
      e.innerHTML = ARROW_SVG(56) + '<i class="rn-dot"></i>';
      st.puck = new maplibregl.Marker({ element: e, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat(to).addTo(m);
    }
    st.puck.getElement().classList.toggle('is-dot', !st.hasB);
    let a = st.ga;
    if(!a){ a = st.ga = { cur: to, curB: b, raf: 0 }; force = st.follow; }
    const jump = dist([a.cur[1], a.cur[0]], [to[1], to[0]]) > 400;
    a.from = jump ? to : a.cur; a.to = to; a.b0 = jump ? b : a.curB; a.b1 = b;
    a.t0 = performance.now(); a.dur = jump ? 0 : 950;           // glisse d'une position GPS à la suivante (≈ 1 s)
    if(force){
      a.z = glZoom(); a.p = glPitch(); st.glHold = Date.now() + 850;
      m.easeTo({ center: to, bearing: b, zoom: a.z, pitch: a.p, padding: glPad(), duration: 800 });
    }
    if(!a.raf) a.raf = requestAnimationFrame(glAnim);
  }
  function glAnim(){
    const a = st && st.ga, m = st && st.gl; if(!a || !m) return;
    a.raf = 0;
    const t = a.dur ? Math.min(1, (performance.now() - a.t0) / a.dur) : 1;
    a.cur = [a.from[0] + (a.to[0] - a.from[0]) * t, a.from[1] + (a.to[1] - a.from[1]) * t];
    a.curB = (a.b0 + angD(a.b0, a.b1) * t + 360) % 360;
    st.puck.setLngLat(a.cur).setRotation(a.curB);
    let more = t < 1;
    if(st.follow && !st.overview){
      if(Date.now() < (st.glHold || 0)) more = true;
      else {
        const zt = glZoom(), pt = glPitch();
        a.z = a.z === undefined ? zt : a.z + (zt - a.z) * 0.05; a.p = a.p === undefined ? pt : a.p + (pt - a.p) * 0.08;
        if(Math.abs(zt - a.z) > 0.01 || Math.abs(pt - a.p) > 0.2) more = true;
        m.jumpTo({ center: a.cur, bearing: a.curB, zoom: a.z, pitch: a.p });
      }
    }
    if(more) a.raf = requestAnimationFrame(glAnim);
  }

  // ─── boucle principale ───────────────────────────────────────────────────
  function step(){
    if(!st || !st.fix || st.phase === 'arrived' || st.phase === 'stopped') return;
    if(st.phase === 'walk') return walk();
    const on = onRoute();
    if(on){
      if(st.route !== on.k){ st.route = on.k; st.s = on.pr.s; st.sPrev = on.pr.s; st.back = 0; rmLine('appr'); }
      // sens de circulation : la position recule le long de l'itinéraire plusieurs fois de suite
      const ds = on.pr.s - st.sPrev; st.sPrev = on.pr.s;
      if(ds < -5 && st.fix.speed > 2) st.back = (st.back || 0) + 1;
      else if(ds > 5){ if(st.back >= 4) st.wrongAt = 0; st.back = 0; }
      if(st.phase === 'lost'){ rmLine('appr'); say('Vous êtes sur l\'itinéraire. Le guidage reprend.'); }
      if(st.phase === 'approach'){ rmLine('appr'); st.appr = null; }      // bascule silencieuse sur le trajet bloqué
      st.phase = 'drive'; st.off = 0; st.offT = 0;
      if(st.back >= 4){
        st.s = on.pr.s;
        banner({ type: 'uturn' }, null, null, 'rn-alert');
        ui().top.querySelector('.rn-txt').textContent = 'Mauvais sens : faites demi-tour dès que possible';
        if(!st.wrongAt || Date.now() - st.wrongAt > 45000){ st.wrongAt = Date.now(); say('Vous roulez dans le mauvais sens. Faites demi-tour dès que possible.'); }
        return;
      }
      st.s = Math.max(st.s - 30, on.pr.s);
      return drive();
    }
    if(st.phase === 'drive'){
      st.off = (st.off || 0) + 1; st.offT = st.offT || Date.now();
      if(st.off < 3 || Date.now() - st.offT < 5000) return drive();
      st.off = 0; st.offT = 0; say('Vous avez quitté l\'itinéraire.');
      return approach('off');
    }
    if(st.phase === 'approach' && st.appr) return approachStep();
    if(st.phase === 'lost'){
      if(st.lostReason === 'start' && !st.busy && Date.now() - (st.lastFree || 0) > 20000 && !inRaceZone([st.fix.lat, st.fix.lon])) return approachFree('start');
      return approach(st.lostReason);
    }
    if(st.phase === 'locating') return approachFree('start');
  }
  function onPos(pos){
    if(!st) return;
    const c = pos.coords;
    st.fix = { lat: c.latitude, lon: c.longitude, acc: c.accuracy || 20, speed: c.speed === null ? 0 : c.speed, heading: c.heading };
    drawMe();
    step();
    if(!st) return;
    if(!st.firstFix){ st.firstFix = true; setTimeout(function(){ if(st) centre(true); }, 350); } else centre(false);
  }
  function onErr(e){
    if(!st) return;
    if(e.code === 1) message('<b>Localisation refusée.</b> Autorisez-la pour ce site dans les réglages du téléphone (iPhone : Réglages › Confidentialité › Service de localisation › Safari).', 'rn-warn');
    else message('<b>Recherche du signal GPS…</b>', 'rn-msg');
  }
  async function wake(){
    try { if('wakeLock' in navigator && document.visibilityState === 'visible') st.wake = await navigator.wakeLock.request('screen'); } catch(e) {}
  }
  document.addEventListener('visibilitychange', function(){ if(st && st.phase !== 'stopped' && document.visibilityState === 'visible') wake(); });

  function start(dest){
    if(!ctx){ pending = dest; return; }
    if(st) stop(true);
    if(!navigator.geolocation){ alert('La localisation n\'est pas disponible sur cet appareil.'); return; }
    st = { dest: +dest, phase: 'locating', route: null, s: null, fix: null, voice: true, follow: true, said: {}, layers: {}, want: {}, lastApproach: 0 };
    if(ctx.gpsStop) ctx.gpsStop();
    const wrap = document.getElementById('race-map-wrap');
    if(typeof _toggleAmisMapFS === 'function' && !_amisMapFullscreen) _toggleAmisMapFS(true);
    wrap.classList.add('is-nav');
    ctx.select(1);
    const u = ui(); u.top.hidden = false; u.bot.hidden = false; u.fab.hidden = false; u.chips.hidden = false;
    const vb = u.fab.querySelector('.rn-voice'); vb.innerHTML = SVG_VOICE; vb.classList.remove('is-off'); vb.setAttribute('aria-pressed', 'true');
    u.fab.querySelector('.rn-over').setAttribute('aria-pressed', 'false');
    u.chips.querySelector('.rn-recenter').hidden = true; road(null);
    message('<b>' + DEST[st.dest].label + '</b><br>Recherche de votre position…', 'rn-msg');
    u.bot.querySelector('.rn-eta').textContent = '';
    say('Guidage vers ' + DEST[st.dest].short.replace('km', 'le kilomètre') + '.', true);
    ctx.map.on('dragstart', onDrag);
    wake();
    st.watch = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 });
    glInit();
  }
  function onDrag(){ if(st){ st.follow = false; ui().chips.querySelector('.rn-recenter').hidden = false; } }
  function stop(silent){
    if(!st) return;
    if(st.watch !== null && st.watch !== undefined) navigator.geolocation.clearWatch(st.watch);
    Object.keys(st.layers).forEach(function(k){ st.layers[k].remove(); });
    if(st.me){ st.me.remove(); st.acc.remove(); }
    try { if(st.wake) st.wake.release(); } catch(e) {}
    if('speechSynthesis' in window) speechSynthesis.cancel();
    glDestroy();
    ctx.map.off('dragstart', onDrag);
    st.phase = 'stopped'; st = null;
    const wrap = document.getElementById('race-map-wrap');
    wrap.classList.remove('is-nav');
    ['rn-top', 'rn-bot', 'rn-fab', 'rn-chips'].forEach(function(id){ const e = document.getElementById(id); if(e) e.hidden = true; });
    if(!silent && typeof _toggleAmisMapFS === 'function' && _amisMapFullscreen) _toggleAmisMapFS(false);
  }
  function attach(c){
    ctx = c;
    if(pending !== null){ const d = pending; pending = null; start(d); }
  }
  function active(){ return !!st; }
  return { attach: attach, start: function(){ start(30); }, stop: stop, active: active, DEST: DEST, _state: function(){ return st; }, _check: function(pts){ return crossesClosed(pts); } };
})();
