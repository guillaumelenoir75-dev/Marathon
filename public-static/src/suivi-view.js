// Page publique /suivi-guillaume : carte du parcours et position de Guillaume en direct (lecture seule de /live).

const SuiviView = (function(){
  let live = {}, offset = 0, map = null, me = null, meLL = null, trail = null, follow = true, passedL = null;
  const $ = function(id){ return document.getElementById(id); };
  const now = function(){ return Date.now() + offset; };
  const STALE = 120000;                                   // au-delà, la position est estimée
  const PLAN_SPEED = 42195 / (3.55 * 3600);

  async function init(){
    await suiviLeaflet().catch(function(){});
    buildMap();
    let ref;
    try { ref = await suiviFirebase(false); } catch(e) { $('status-line').textContent = 'Connexion impossible. Rechargez la page.'; return; }
    firebase.database().ref('.info/serverTimeOffset').on('value', function(s){ offset = s.val() || 0; });
    firebase.database().ref('.info/connected').on('value', function(s){ $('net').hidden = !!s.val(); });
    ref.on('value', function(s){ live = s.val() || {}; render(true); });
    setInterval(function(){ render(false); }, 1000);
  }

  // ─── Carte ────────────────────────────────────────────────────────────────
  function buildMap(){
    if(!window.L){ $('map').innerHTML = '<p class="nomap">Carte indisponible (pas de connexion).</p>'; return; }
    $('map').innerHTML = '';
    map = L.map('map', { zoomControl: true, zoomSnap: 0.25 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }).addTo(map);
    const R = SUIVI_DATA.route;
    L.polyline(R, { color: '#fff', weight: 10, opacity: 1, interactive: false }).addTo(map);
    L.polyline(R, { color: '#DC2626', weight: 6, opacity: 1, interactive: false }).addTo(map);
    passedL = L.polyline([], { color: '#15803D', weight: 6, opacity: 1, interactive: false }).addTo(map);
    trail = L.polyline([], { color: '#1D4ED8', weight: 3, opacity: 0.7, dashArray: '2 6', interactive: false }).addTo(map);
    for(let k = 5; k < 42; k += 5){
      if(k % 10 === 0) continue;
      L.marker(SuiviGeo.pointAt(k * 1000 / SuiviGeo.scale), { interactive: false, keyboard: false, icon: L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11],
        html: '<div class="kmb">' + k + '</div>' }) }).addTo(map);
    }
    L.marker(R[0], { keyboard: false, icon: L.divIcon({ className: '', iconSize: [64, 24], iconAnchor: [32, 12], html: '<div class="flag start">Départ</div>' }) }).bindPopup('<b>Départ</b> · Amfreville-sur-Iton, 9h15').addTo(map);
    SUIVI_DATA.points.forEach(function(pt){
      const lab = pt.id === 'finish' ? '🏁 Arrivée' : pt.id === 'km30' ? '🏠 km 30' : 'km ' + pt.km;
      L.marker(pt.coord, { keyboard: false, zIndexOffset: 300, icon: L.divIcon({ className: '', iconSize: [86, 24], iconAnchor: [43, 12], html: '<div class="flag ' + pt.id + '">' + lab + '</div>' }) })
        .bindPopup('<b>' + pt.label + '</b><br>' + pt.lieu + '<br>Passage prévu ' + pt.prevu.replace(':', 'h')).addTo(map);
    });
    map.fitBounds(L.polyline(R).getBounds(), { padding: [20, 20] });
    map.on('dragstart', function(){ follow = false; $('b-follow').hidden = false; });
  }
  function center(){ follow = true; $('b-follow').hidden = true; if(meLL) map.setView(meLL, Math.max(map.getZoom(), 14)); }
  function whole(){ follow = false; $('b-follow').hidden = !meLL; map.fitBounds(L.polyline(SUIVI_DATA.route).getBounds(), { padding: [20, 20] }); }

  // ─── Calculs ──────────────────────────────────────────────────────────────
  function state(){
    const t = now(), st = live.status || 'idle', p = live.pos;
    const o = { st: st, t: t };
    if(!live.startedAt) return o;
    o.el = (live.finishedAt || t) - live.startedAt;
    if(st === 'finished'){ o.s = SuiviGeo.len; o.ll = SUIVI_DATA.route[SUIVI_DATA.route.length - 1]; return o; }
    if(!p || typeof p.s !== 'number'){ o.s = 0; return o; }
    const elAtPos = (p.ts - live.startedAt) / 1000, dOff = p.s * SuiviGeo.scale;
    o.speed = elAtPos > 120 && dOff > 300 ? dOff / elAtPos : PLAN_SPEED;          // m/s officiels
    o.age = t - p.ts;
    if(o.age > STALE && st === 'running'){
      o.est = true; o.s = Math.min(SuiviGeo.len, p.s + o.speed / SuiviGeo.scale * o.age / 1000); o.ll = SuiviGeo.pointAt(o.s);
    } else { o.s = p.s; o.ll = [p.lat, p.lon]; }
    return o;
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────
  function render(data){
    const o = state(), t = o.t;
    const pill = $('pill');
    pill.className = 'pill ' + o.st;
    pill.textContent = o.st === 'running' ? (live.test ? 'Essai en cours' : 'En course') : o.st === 'finished' ? (live.test ? 'Essai terminé' : 'Arrivé ✔') : 'Pas encore parti';
    const start = live.startedAt || suiviFmt.planned(SUIVI_DATA.start);
    if(o.st === 'idle'){
      $('status-line').textContent = 'Départ prévu à 9h15 d\'Amfreville-sur-Iton' + (t < start ? ' · dans ' + suiviFmt.dur(start - t).replace(/^0:/, '') : '');
    } else if(o.st === 'finished'){
      $('status-line').textContent = 'Arrivé à ' + suiviFmt.hhmm(live.finishedAt) + ' en ' + suiviFmt.dur(live.finishedAt - live.startedAt) + ' 🎉';
    } else {
      $('status-line').textContent = live.pos ? (o.est ? '⚠ Signal perdu depuis ' + suiviFmt.ago(o.age).replace('il y a ', '') + ' : position estimée' : 'Position mise à jour ' + suiviFmt.ago(o.age)) : 'Départ donné à ' + suiviFmt.hhmm(live.startedAt) + ' · en attente de la première position GPS';
    }
    if(live.test && o.st !== 'idle') $('status-line').textContent = '🧪 Essai du suivi : ce n\'est pas la course. ' + $('status-line').textContent;
    $('status-line').className = 'status' + (o.est ? ' warn' : '');
    const dist = o.s !== undefined ? o.s * SuiviGeo.scale : null;
    $('v-dist').textContent = dist !== null ? suiviFmt.km(dist) : '0';
    $('v-rest').textContent = dist !== null ? suiviFmt.km(Math.max(0, 42195 - dist)) + ' km restants' : '42,2 km au total';
    $('v-time').textContent = o.el !== undefined ? suiviFmt.dur(o.el) : '–';
    $('v-time-sub').textContent = live.startedAt ? 'départ à ' + suiviFmt.hhmm(live.startedAt) : 'départ prévu 9h15';
    const pace = o.st === 'finished' ? (live.finishedAt - live.startedAt) / 1000 / 42.195 : o.speed ? 1000 / o.speed : NaN;
    $('v-pace').textContent = suiviFmt.pace(pace);
    let eta = null;
    if(o.st === 'finished') eta = live.finishedAt;
    else if(o.st === 'running' && live.pos && o.speed) eta = live.pos.ts + (42195 - live.pos.s * SuiviGeo.scale) / o.speed * 1000;
    $('v-eta').textContent = eta ? suiviFmt.hhmm(eta) : '12h48';
    $('v-eta-sub').textContent = o.st === 'finished' ? 'temps final ' + suiviFmt.dur(live.finishedAt - live.startedAt) : eta ? 'estimation à l\'allure actuelle' : 'prévision';
    $('bar').style.width = (dist !== null ? Math.min(100, dist / 421.95) : 0) + '%';
    $('bar-me').style.left = (dist !== null ? Math.min(100, dist / 421.95) : 0) + '%';
    $('bar-me').hidden = o.st === 'idle';
    // points de passage
    $('passages').innerHTML = SUIVI_DATA.points.map(function(pt){
      const done = live.passages && live.passages[pt.id];
      let val, cls;
      if(done){ val = 'Passé à <b>' + suiviFmt.hhmm(done) + '</b>'; cls = 'done'; }
      else if(o.st === 'running' && live.pos && o.speed && live.pos.s < pt.s){ val = 'Estimé <b>' + suiviFmt.hhmm(live.pos.ts + (pt.s - live.pos.s) * SuiviGeo.scale / o.speed * 1000) + '</b>'; cls = 'next'; }
      else if(o.st === 'running' && live.pos && live.pos.s >= pt.s){ val = 'Passé'; cls = 'done'; }
      else { val = 'Prévu <b>' + pt.prevu.replace(':', 'h') + '</b>'; cls = ''; }
      return '<li class="' + cls + '"><span class="pk">' + (pt.id === 'finish' ? '🏁' : pt.km) + '</span><span class="pl"><b>' + pt.label + '</b><span>' + pt.lieu + '</span></span><span class="pv">' + val + '</span></li>';
    }).join('');
    const sp = live.splits ? Object.keys(live.splits).map(function(k){ return live.splits[k]; }).sort(function(a, b){ return a.km - b.km; }) : [];
    $('splits-card').hidden = !sp.length;
    $('splits').innerHTML = sp.map(function(x){
      return '<li class="done"><span class="pk">' + (x.km >= 42.1 ? '🏁' : Math.round(x.km)) + '</span><span class="pl"><b>km ' + String(+x.km.toFixed(3)).replace('.', ',') + '</b><span>allure ' + suiviFmt.pace(x.el / 1000 / x.km) + '</span></span><span class="pv"><b>' + suiviFmt.dur(x.el) + '</b><br>à ' + suiviFmt.hhmm(x.ts) + '</span></li>';
    }).join('');
    $('garmin').hidden = !live.garmin; if(live.garmin) $('garmin').href = live.garmin;
    // carte
    if(!map) return;
    if(data){
      const tr = live.track ? Object.keys(live.track).sort().map(function(k){ return live.track[k]; }) : [];
      trail.setLatLngs(tr.map(function(x){ return [x[0], x[1]]; }).concat(live.pos && o.st === 'running' ? [[live.pos.lat, live.pos.lon]] : []));
    }
    if(o.s !== undefined && o.st !== 'idle'){
      const cut = []; const R = SUIVI_DATA.route; let acc = 0;
      cut.push(R[0]);
      for(let i = 1; i < R.length; i++){ const d = SuiviGeo.dist(R[i-1], R[i]); if(acc + d >= o.s){ cut.push(SuiviGeo.pointAt(o.s)); break; } acc += d; cut.push(R[i]); }
      passedL.setLatLngs(cut);
    } else passedL.setLatLngs([]);
    if(o.ll && o.st !== 'idle'){
      meLL = o.ll;
      const ic = L.divIcon({ className: '', iconSize: [46, 46], iconAnchor: [23, 23], html: '<div class="me' + (o.est ? ' est' : '') + (o.st === 'finished' ? ' fin' : '') + '"><i></i><b>G</b></div>' });
      if(!me){ me = L.marker(o.ll, { icon: ic, zIndexOffset: 3000, keyboard: false }).addTo(map); me.bindPopup('Guillaume'); if(follow) map.setView(o.ll, 14); $('b-follow').hidden = true; }
      else { me.setLatLng(o.ll); if(data || o.est) me.setIcon(ic); if(follow && data) map.panTo(o.ll, { animate: true }); }
    } else if(me){ me.remove(); me = null; meLL = null; }
  }

  return { init: init, center: center, whole: whole };
})();
document.addEventListener('DOMContentLoaded', function(){ SuiviView.init(); });
