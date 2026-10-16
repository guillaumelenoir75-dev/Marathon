// Guidage GPS intégré (carte « Organisation course » et page /parcours).
// - Sur nos trajets : suit les itinéraires sûrs pré-calculés (NAV_DATA) avec manœuvres et voix.
// - Pour rejoindre un trajet : itinéraire d'approche OSRM, refusé s'il coupe le parcours ou une voie fermée.

const RaceNav = (function(){
  const RAD = Math.PI / 180;
  const DEST = {
    10: { label: 'RDV km 9,7 — rond-point de Folleville', short: 'km 9,7', routes: ['A'], walk: '10' },
    20: { label: 'Ravito km 20 — D313 sous l\'A13', short: 'km 20', routes: ['B', 'A2'], walk: '20' },
    30: { label: 'Ravito km 30 — Tournedos', short: 'km 30', routes: ['C', 'A3'], walk: '30' },
  };
  const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
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
        + '<button type="button" class="rn-b rn-voice" aria-label="Couper la voix">🔊</button>'
        + '<button type="button" class="rn-b rn-recenter" aria-label="Recentrer" hidden>◎</button>'
        + '<button type="button" class="rn-b rn-stop">Arrêter</button></div>';
      wrap.appendChild(bot);
      bot.querySelector('.rn-stop').onclick = function(){ stop(); };
      bot.querySelector('.rn-voice').onclick = function(){
        st.voice = !st.voice; this.textContent = st.voice ? '🔊' : '🔇';
        this.setAttribute('aria-label', st.voice ? 'Couper la voix' : 'Activer la voix');
        if(!st.voice && 'speechSynthesis' in window) speechSynthesis.cancel();
      };
      bot.querySelector('.rn-recenter').onclick = function(){ st.follow = true; this.hidden = true; if(st.fix) centre(true); };
      bot.querySelector('.rn-parked').onclick = function(){ toWalk(); };
    }
    return { wrap: wrap, top: top, bot: document.getElementById('rn-bot') };
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
  }
  const hhmm = function(t){ const d = new Date(t); return d.getHours() + 'h' + String(d.getMinutes()).padStart(2, '0'); };
  function eta(remainDriveS, walkM){
    const u = ui(), rav = ctx.RAVITOS[{10: 0, 20: 1, 30: 2}[st.dest]];
    const total = remainDriveS + walkM / 1.25;
    u.bot.querySelector('.rn-eta').innerHTML = '<b>Arrivée ~' + hhmm(Date.now() + total * 1000) + '</b> · ' + DEST[st.dest].short
      + '<span>passage du coureur ' + rav.heure + '</span>';
  }

  // ─── carte ───────────────────────────────────────────────────────────────
  function drawLine(key, pts, style){
    if(st.layers[key]) st.layers[key].remove();
    st.layers[key] = L.polyline(pts, style).addTo(ctx.map);
  }
  function centre(force){
    if(!st.fix || (!st.follow && !force)) return;
    const z = st.phase === 'walk' || st.phase === 'arrived' ? 17.5 : (st.fix.speed > 20 ? 14.5 : 16);
    const c = ctx.map.getCenter(), far = dist([c.lat, c.lng], [st.fix.lat, st.fix.lon]) > 5000;
    if(force || far || Math.abs(ctx.map.getZoom() - z) > 1.5) ctx.map.setView([st.fix.lat, st.fix.lon], z, { animate: !force && !far });
    else ctx.map.panTo([st.fix.lat, st.fix.lon], { animate: true, duration: 0.5 });
  }
  function drawMe(){
    const f = st.fix, ll = [f.lat, f.lon];
    const head = f.heading !== null && !isNaN(f.heading) && f.speed > 1 ? f.heading : null;
    const ic = L.divIcon({ className: '', iconSize: [40, 40], iconAnchor: [20, 20],
      html: '<div class="rn-me">' + (head !== null ? '<div class="rn-me-cone" style="transform:rotate(' + Math.round(head) + 'deg)"></div>' : '') + '<div class="rn-me-dot"></div></div>' });
    if(!st.me){
      st.acc = L.circle(ll, { radius: f.acc, color: '#1A73E8', weight: 1, opacity: 0.35, fillColor: '#1A73E8', fillOpacity: 0.08, interactive: false }).addTo(ctx.map);
      st.me = L.marker(ll, { icon: ic, zIndexOffset: 2000, interactive: false, keyboard: false }).addTo(ctx.map);
    } else { st.me.setLatLng(ll).setIcon(ic); st.acc.setLatLng(ll).setRadius(f.acc); }
  }

  // ─── routes ──────────────────────────────────────────────────────────────
  const lines = {};
  function routeLine(key){ return lines[key] || (lines[key] = mkLine(NAV_DATA.routes[key].line)); }
  function walkLine(key){ return lines['w' + key] || (lines['w' + key] = mkLine(NAV_DATA.walks[key].line)); }
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
    const r = NAV_DATA.routes[st.route], L_ = routeLine(st.route);
    const ahead = r.man.filter(function(m){ return m.at > st.s + 3 && !(m.type === 'depart'); });
    const m = ahead[0] || { type: 'park', at: L_.len }, n = ahead[1];
    const dM = m.at - st.s;
    banner(m, dM, n && n.at - m.at < 250 ? n : null);
    drawLine('todo', L_.pts.slice(project(L_, [st.fix.lat, st.fix.lon], st.s - 50, st.s + 50).i - 1).concat([]), { color: '#1A73E8', weight: 7, opacity: 0.9, lineCap: 'round', interactive: false });
    eta((L_.len - st.s) * r.t / r.len, NAV_DATA.walks[DEST[st.dest].walk].len);
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
    if(far && d <= far && d > near * 1.6 && !done.far){ done.far = true; say('Dans ' + sayD(d) + ', ' + lc(text(m, true))); }
    else if(d <= near && d > now && !done.near){ done.near = done.far = true; say('Dans ' + sayD(d) + ', ' + lc(text(m, true))); }
    else if(d <= now && !done.now && m.type !== 'park' && m.type !== 'arrive'){ done.now = done.near = done.far = true; say(text(m, true)); }
  }
  const lc = function(t){ return t.charAt(0).toLowerCase() + t.slice(1); };

  function toWalk(){
    if(st.phase === 'walk' || st.phase === 'arrived') return;
    st.phase = 'walk'; st.route = null; st.s = null;
    const w = NAV_DATA.walks[DEST[st.dest].walk];
    say('Vous êtes au stationnement. Garez-vous, puis continuez à pied sur ' + sayD(w.len) + '.');
    if(st.layers.todo) st.layers.todo.remove();
    drawLine('walk', w.line, { color: '#1D4ED8', weight: 6, opacity: 0.9, dashArray: '2 10', lineCap: 'round', interactive: false });
    ui().bot.querySelector('.rn-parked').hidden = true;
    centre(true);
    if(st.fix) step();
  }

  function walk(){
    const w = NAV_DATA.walks[DEST[st.dest].walk], L_ = walkLine(DEST[st.dest].walk);
    const pr = project(L_, [st.fix.lat, st.fix.lon]);
    const s = pr.s, ahead = w.man.filter(function(m){ return m.at > s + 2; });
    const m = ahead[0] || { type: 'arrive', at: L_.len };
    if(L_.len - s < 20 && pr.d < 40){
      st.phase = 'arrived';
      const rav = ctx.RAVITOS[{10: 0, 20: 1, 30: 2}[st.dest]];
      message('<b>Vous êtes arrivé ✔</b><br>' + DEST[st.dest].label + ' · passage du coureur <b>' + rav.heure + '</b>', 'rn-ok');
      say('Vous êtes arrivé. Passage du coureur vers ' + rav.heure.replace('~', '').replace('h', ' heures ') + '.');
      ui().bot.querySelector('.rn-eta').innerHTML = '<b>Arrivé</b> · bon encouragement !';
      return;
    }
    if(pr.d > 60){ message('<b>À pied :</b> rejoignez le chemin bleu en pointillés (' + fmtD(pr.d) + ')', 'rn-warn'); return; }
    banner(m, m.at - s, null);
    eta(0, L_.len - s);
    announce(m, m.at - s, 'walk');
  }

  // ─── approche (OSRM) ─────────────────────────────────────────────────────
  function crossesClosed(pts){
    // contrôle sur la partie de l'itinéraire d'approche située dans la zone de course
    const C = ctx.ROUTE, B = NAV_DATA.bridges, GR = NAV_DATA.grade || [];
    const allowed = function(q){ return B.some(function(b){ return dist(b, q) < 80; }) || GR.some(function(g){ return dist(g, q) < 35; }); };
    const total = mkLine(pts), skipEnd = total.len - 80;
    for(let i = 0; i < pts.length; i++){
      const p = pts[i];
      if(p[0] < 49.13 || p[0] > 49.33 || p[1] < 1.12 || p[1] > 1.32) continue;
      if(total.cum[i] > skipEnd || total.cum[i] < 40) continue;
      const nearBridge = allowed(p);
      if(!nearBridge && nearPolyline(p, C, 18)) return 'le parcours';
      if(!nearBridge && NAV_DATA.closed.some(function(c){ return nearPolyline(p, c, 10); })) return 'une rue fermée';
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
  function targets(){
    const p = [st.fix.lat, st.fix.lon], out = [];
    DEST[st.dest].routes.forEach(function(k){
      const L_ = routeLine(k), r = NAV_DATA.routes[k];
      for(let s = 0; s < L_.len - 200; s += 400){
        const q = pointAt(L_, s), q2 = pointAt(L_, s + 40);
        out.push({ k: k, s: s, pt: q, brg: Math.round(bearing(q, q2)), score: dist(p, q) * 1.3 + (L_.len - s) });
      }
    });
    out.sort(function(a, b){ return a.score - b.score; });
    const pick = [];
    out.forEach(function(t){ if(pick.length < 5 && pick.every(function(u){ return u.k !== t.k || Math.abs(u.s - t.s) > 1500; })) pick.push(t); });
    return pick;
  }
  async function approach(reason){
    if(!st || st.busy) return;
    const me = st;
    st.busy = true; st.lastApproach = Date.now();
    message(reason === 'off' ? '<b>Itinéraire quitté</b> · recalcul…' : '<b>Calcul de l\'itinéraire…</b>', 'rn-msg');
    const p = [st.fix.lat, st.fix.lon];
    let ok = null, why = null;
    for(const t of targets()){
      try {
        const url = OSRM + p[1] + ',' + p[0] + ';' + t.pt[1] + ',' + t.pt[0]
          + '?overview=full&geometries=geojson&steps=true&bearings=;' + t.brg + ',45&radiuses=;30';
        const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = setTimeout(function(){ if(ctl) ctl.abort(); }, 9000);
        let js = null;
        try { const res = await fetch(url, ctl ? { signal: ctl.signal } : {}); js = await res.json(); } finally { clearTimeout(timer); }
        if(st !== me) return;
        if(!js || !js.routes || !js.routes[0]) continue;
        const pts = js.routes[0].geometry.coordinates.map(function(c){ return [c[1], c[0]]; });
        const bad = crossesClosed(pts);
        if(bad){ why = bad; continue; }
        ok = { t: t, pts: pts, route: js.routes[0] };
        break;
      } catch(e) { why = 'réseau'; break; }
    }
    if(st !== me) return;
    st.busy = false;
    if(!ok){
      st.phase = 'lost';
      const near = targets()[0];
      message('<b>Rejoignez le tracé vert sans traverser le parcours rouge.</b><br>'
        + (near ? 'Point le plus proche : ' + fmtD(dist(p, near.pt)) + ' vers ' + compass(bearing(p, near.pt)) + '.' : '')
        + (why === 'réseau' ? ' (pas de connexion pour calculer un itinéraire)' : ''), 'rn-warn');
      if(near) drawLine('appr', [p, near.pt], { color: '#1A73E8', weight: 3, dashArray: '4 8', opacity: 0.8, interactive: false });
      say('Rejoignez l\'itinéraire vert, sans traverser le parcours.');
      return;
    }
    st.phase = 'approach'; st.apprN = (st.apprN || 0) + 1;
    st.appr = { line: mkLine(ok.pts), man: osrmMan(ok.route), t: ok.t, dur: ok.route.duration };
    drawLine('appr', ok.pts, { color: '#1A73E8', weight: 7, opacity: 0.85, lineCap: 'round', interactive: false });
    if(st.layers.todo) st.layers.todo.remove();
    const L_ = routeLine(ok.t.k);
    drawLine('todo', L_.pts.slice(project(L_, ok.t.pt).i - 1), { color: '#1A73E8', weight: 5, opacity: 0.5, lineCap: 'round', interactive: false });
    say(reason === 'off' ? 'Nouvel itinéraire.' : 'Itinéraire calculé. ' + (st.appr.man[0] ? text(st.appr.man[0], true) + '.' : ''));
    step();
  }
  const compass = function(b){ return ['le nord', 'le nord-est', 'l\'est', 'le sud-est', 'le sud', 'le sud-ouest', 'l\'ouest', 'le nord-ouest'][Math.round(b / 45) % 8]; };
  function approachStep(){
    const A = st.appr, pr = project(A.line, [st.fix.lat, st.fix.lon]);
    if(pr.d > Math.max(60, st.fix.acc * 1.3)){
      st.offA = (st.offA || 0) + 1;
      if(st.offA >= 3 && Date.now() - st.lastApproach > 12000){ st.offA = 0; approach('off'); }
      return;
    }
    st.offA = 0;
    const ahead = A.man.filter(function(m){ return m.at > pr.s + 3 && m.type !== 'depart'; });
    const m = ahead[0] || { type: 'join', at: A.line.len }, n = ahead[1];
    banner(m, m.at - pr.s, n && n.at - m.at < 250 ? n : null);
    const r = NAV_DATA.routes[A.t.k], rem = (r.len - A.t.s) * r.t / r.len;
    eta(A.dur * (1 - pr.s / A.line.len) + rem, NAV_DATA.walks[DEST[st.dest].walk].len);
    st.phase = 'approach'; st.route = null;
    announce(m, m.at - pr.s, 'car');
  }

  // ─── boucle principale ───────────────────────────────────────────────────
  function step(){
    if(!st || !st.fix || st.phase === 'arrived' || st.phase === 'stopped') return;
    if(st.phase === 'walk') return walk();
    const on = onRoute();
    if(on){
      if(st.route !== on.k){ st.route = on.k; st.s = on.pr.s; st.sMax = on.pr.s; if(st.layers.appr) st.layers.appr.remove(); if(st.phase === 'approach') say('Vous êtes sur l\'itinéraire sécurisé.'); }
      st.sMax = Math.max(st.sMax || 0, on.pr.s);
      if(on.pr.s < st.sMax - 120 && st.fix.speed > 2){
        st.back = (st.back || 0) + 1;
        if(st.back >= 3){
          st.back = 0; st.sMax = on.pr.s; st.phase = 'drive';
          say('Vous roulez dans le mauvais sens. Faites demi-tour dès que possible.');
          return approach('off');
        }
      } else st.back = 0;
      st.s = Math.max(st.s - 30, on.pr.s); st.phase = 'drive'; st.off = 0;
      return drive();
    }
    if(st.phase === 'drive'){
      st.off = (st.off || 0) + 1;
      if(st.off < 3) return drive();
      st.off = 0; say('Vous avez quitté l\'itinéraire. Recalcul.');
      return approach('off');
    }
    if(st.phase === 'approach' && st.appr) return approachStep();
    if(st.phase === 'lost' && Date.now() - st.lastApproach > 20000) return approach('start');
    if(st.phase === 'locating') return approach('start');
  }
  function onPos(pos){
    if(!st) return;
    const c = pos.coords;
    st.fix = { lat: c.latitude, lon: c.longitude, acc: c.accuracy || 20, speed: c.speed === null ? 0 : c.speed, heading: c.heading };
    drawMe();
    if(!st.firstFix){ st.firstFix = true; setTimeout(function(){ if(st) centre(true); }, 350); } else centre(false);
    step();
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
    st = { dest: +dest, phase: 'locating', route: null, s: null, fix: null, voice: true, follow: true, said: {}, layers: {}, lastApproach: 0 };
    if(ctx.gpsStop) ctx.gpsStop();
    const wrap = document.getElementById('race-map-wrap');
    if(typeof _toggleRaceMapFS === 'function' && !_raceMapFullscreen) _toggleRaceMapFS(true);
    wrap.classList.add('is-nav');
    ctx.select({10: 1, 20: 2, 30: 3}[st.dest]);
    const u = ui(); u.top.hidden = false; u.bot.hidden = false;
    u.bot.querySelector('.rn-voice').textContent = '🔊';
    message('<b>' + DEST[st.dest].label + '</b><br>Recherche de votre position…', 'rn-msg');
    u.bot.querySelector('.rn-eta').textContent = '';
    say('Guidage vers ' + DEST[st.dest].short.replace('km', 'le kilomètre') + '.', true);
    ctx.map.on('dragstart', onDrag);
    wake();
    st.watch = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 });
  }
  function onDrag(){ if(st){ st.follow = false; ui().bot.querySelector('.rn-recenter').hidden = false; } }
  function stop(silent){
    if(!st) return;
    if(st.watch !== null && st.watch !== undefined) navigator.geolocation.clearWatch(st.watch);
    Object.keys(st.layers).forEach(function(k){ st.layers[k].remove(); });
    if(st.me){ st.me.remove(); st.acc.remove(); }
    try { if(st.wake) st.wake.release(); } catch(e) {}
    if('speechSynthesis' in window) speechSynthesis.cancel();
    ctx.map.off('dragstart', onDrag);
    st.phase = 'stopped'; st = null;
    const wrap = document.getElementById('race-map-wrap');
    wrap.classList.remove('is-nav');
    const top = document.getElementById('rn-top'), bot = document.getElementById('rn-bot');
    if(top) top.hidden = true; if(bot) bot.hidden = true;
    if(!silent && typeof _toggleRaceMapFS === 'function' && _raceMapFullscreen) _toggleRaceMapFS(false);
  }
  function attach(c){
    ctx = c;
    if(pending !== null){ const d = pending; pending = null; start(d); }
  }
  function active(){ return !!st; }
  return { attach: attach, start: start, stop: stop, active: active, DEST: DEST, _state: function(){ return st; }, _check: function(pts){ return crossesClosed(pts); } };
})();
