// Page publique /suivi-guillaume : carte du parcours et position de Guillaume en direct (lecture seule de /live).

const SuiviView = (function(){
  let live = {}, offset = 0, map = null, me = null, meLL = null, trail = null, follow = true, passedL = null;
  const $ = function(id){ return document.getElementById(id); };
  const now = function(){ return Date.now() + offset; };

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
    const o = suiviCalc(live, now());
    if(live.startedAt) o.chrono = (live.finishedAt || o.t) - live.startedAt;
    return o;
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────
  function render(data){
    const o = state(), t = o.t;
    const pill = $('pill');
    pill.className = 'pill ' + o.st;
    pill.textContent = o.st === 'running' ? (live.test ? 'Essai en cours' : 'En course') : o.st === 'finished' ? (live.test ? 'Essai terminé' : 'Arrivé ✔') : 'Pas encore parti';
    const start = live.startedAt || suiviFmt.planned(SUIVI_DATA.start);
    if(o.st === 'idle') $('status-line').textContent = 'Départ prévu à 9h15 d\'Amfreville-sur-Iton' + (t < start ? ' · dans ' + suiviFmt.dur(start - t).replace(/^0:/, '') : '');
    else if(o.st === 'finished') $('status-line').textContent = 'Arrivé en ' + suiviFmt.dur(live.finishedAt - live.startedAt) + ' 🎉';
    else $('status-line').textContent = 'Départ donné à ' + suiviFmt.hhmm(live.startedAt);
    if(live.test && o.st !== 'idle') $('status-line').textContent = '🧪 Essai : ce n\'est pas la course. ' + $('status-line').textContent;
    const dist = o.d !== undefined ? o.d : null;
    $('v-time').textContent = o.chrono !== undefined ? suiviFmt.dur(o.chrono) : '–';
    $('v-time-sub').textContent = o.st === 'finished' ? 'temps final' : live.startedAt ? 'depuis ' + suiviFmt.hhmm(live.startedAt) : 'départ prévu 9h15';
    const pace = o.known ? 1000 / o.speed : NaN;
    $('v-pace').textContent = suiviFmt.pace(pace);
    $('v-rest').textContent = o.st === 'finished' ? '0' : suiviFmt.km(Math.max(0, 42195 - (dist || 0))).replace(/,00$/, '');
    // carte
    if(!map) return;
    if(o.s !== undefined && o.st !== 'idle'){
      const cut = []; const R = SUIVI_DATA.route; let acc = 0;
      cut.push(R[0]);
      for(let i = 1; i < R.length; i++){ const d = SuiviGeo.dist(R[i-1], R[i]); if(acc + d >= o.s){ cut.push(SuiviGeo.pointAt(o.s)); break; } acc += d; cut.push(R[i]); }
      passedL.setLatLngs(cut);
    } else passedL.setLatLngs([]);
    if(o.ll && o.st !== 'idle'){
      meLL = o.ll;
      const ic = L.divIcon({ className: '', iconSize: [46, 46], iconAnchor: [23, 23], html: '<div class="me' + (o.st === 'finished' ? ' fin' : '') + '"><i></i><b>G</b></div>' });
      if(!me){ me = L.marker(o.ll, { icon: ic, zIndexOffset: 3000, keyboard: false }).addTo(map); me.bindPopup('Guillaume'); if(follow) map.setView(o.ll, 14); $('b-follow').hidden = true; }
      else { me.setLatLng(o.ll); if(data) me.setIcon(ic); if(follow && data) map.panTo(o.ll, { animate: true }); }
    } else if(me){ me.remove(); me = null; meLL = null; }
  }

  return { init: init, center: center, whole: whole };
})();
document.addEventListener('DOMContentLoaded', function(){ SuiviView.init(); });
