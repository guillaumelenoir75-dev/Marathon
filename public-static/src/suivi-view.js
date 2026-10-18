// Page publique /suivi-guillaume : carte du parcours et position de Guillaume en direct (lecture seule de /live).

const SuiviView = (function(){
  let live = {}, offset = 0, map = null, me = null, meLL = null, trail = null, follow = true, passedL = null;
  const $ = function(id){ return document.getElementById(id); };
  const now = function(){ return Date.now() + offset; };

  async function init(){
    buildTrack();
    await suiviLeaflet().catch(function(){});
    buildMap();
    let ref;
    try { ref = await suiviFirebase(false); } catch(e) { $('status-line').textContent = 'Connexion impossible. Rechargez la page.'; return; }
    firebase.database().ref('.info/serverTimeOffset').on('value', function(s){ offset = s.val() || 0; });
    firebase.database().ref('.info/connected').on('value', function(s){ $('net').hidden = !!s.val(); });
    ref.on('value', function(s){ live = s.val() || {}; render(true); });
    setInterval(function(){ render(false); }, 1000);
    setInterval(glide, 200);
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
  let ovr = null;                                           // rejeu de la course (suivi-replay.js) : remplace le direct
  function state(){
    if(ovr) return Object.assign({ t: now() }, ovr);
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
    if(o.st === 'idle') $('status-line').textContent = 'Départ prévu à 9h15 d\'Amfreville-sur-Iton' + (t < start ? ' · dans ' + (start - t >= 3600000 ? suiviFmt.hm(start - t).replace('h', ' h ') : Math.max(1, Math.round((start - t) / 60000)) + ' min') : '');
    else if(o.st === 'finished') $('status-line').textContent = 'Arrivé en ' + suiviFmt.dur(live.finishedAt - live.startedAt) + ' 🎉';
    else $('status-line').textContent = 'Départ donné à ' + suiviFmt.hhmm(live.startedAt);
    if(live.test && o.st !== 'idle') $('status-line').textContent = '🧪 Essai : ce n\'est pas la course. ' + $('status-line').textContent;
    $('status-line').hidden = o.st === 'running' && !live.test;               // « depuis 9h16 » sous le chrono suffit
    $('v-time-sub').hidden = o.st === 'idle';                                    // la ligne d'état donne déjà le départ prévu
    const dist = o.d !== undefined ? o.d : null;
    $('v-time').textContent = o.chrono !== undefined ? suiviFmt.dur(o.chrono) : '–';
    $('v-time-sub').textContent = o.st === 'finished' ? 'temps final' : live.startedAt ? 'depuis ' + suiviFmt.hhmm(live.startedAt) : 'départ prévu 9h15';
    const pace = o.known ? 1000 / o.speed : NaN;
    $('v-pace').textContent = suiviFmt.pace(pace);
    const eta = suiviEta(o, live);
    $('v-eta').textContent = suiviFmt.hhmm(eta.at);
    $('v-eta').previousElementSibling.textContent = eta.done ? 'Arrivée' : 'Arrivée estimée';
    $('v-eta-sub').textContent = eta.done ? 'en ' + suiviFmt.dur(eta.dur) : o.st === 'idle' ? 'départ 9h15 · ≈ ' + suiviFmt.hm(eta.dur) : 'temps final ≈ ' + suiviFmt.hm(eta.dur);
    if(o.replay){                                           // rejeu : textes propres, allure du km en cours
      pill.className = 'pill replay'; pill.textContent = o.pill;
      $('status-line').hidden = false; $('status-line').textContent = o.status;
      $('v-time-sub').hidden = false; $('v-time-sub').textContent = o.sub;
      $('v-eta').previousElementSibling.textContent = o.kmLabel; $('v-eta').textContent = o.kmPace; $('v-eta-sub').textContent = o.kmSub;
    }
    if($('v-done')) $('v-done').textContent = o.st === 'finished' ? '42,2' : suiviFmt.km(dist || 0).replace(/,00$/, '');
    $('v-rest').textContent = o.st === 'finished' ? '0' : suiviFmt.km(Math.max(0, 42195 - (dist || 0))).replace(/,00$/, '');
    // carte
    last = o;
    drawMap(o, visS(o, t), data);
  }

  // ─── Carte : le point glisse le long du tracé à l'allure moyenne entre deux positions GPS ─────────
  // Purement visuel (les chiffres ne bougent qu'aux vraies mesures) ; la position affichée ne recule jamais.
  const CUM = (function(){ const R = SUIVI_DATA.route, c = [0]; for(let i = 1; i < R.length; i++) c.push(c[i-1] + SuiviGeo.dist(R[i-1], R[i])); return c; })();
  let last = null, vis = { key: null, s: 0 };
  function visS(o, t){
    if(o.replay) return o.s;
    if(o.st === 'finished') return SuiviGeo.len;
    if(o.st !== 'running' || o.s === undefined) return o.s;
    let s = o.s;
    if(o.ref) s = Math.max(s, o.ref.s + suiviPlanAdvance(o.ref.d, t - o.ref.ts, o.ratio) / SuiviGeo.scale);
    s = Math.min(SuiviGeo.len, s);
    const key = (live.rid || live.startedAt) + '|' + (live.s0 || 0);
    if(vis.key === key && vis.s > s) s = vis.s; else vis = { key: key, s: s };
    return s;
  }
  // barre de progression (page /suivi-guillaume) : repères des points de RDV, avance comme le point de la carte
  function buildTrack(){
    const box = $('v-ticks'); if(!box) return;
    box.innerHTML = SUIVI_DATA.points.map(function(pt){
      const f = pt.id === 'finish' ? 100 : Math.min(100, pt.s * SuiviGeo.scale / 42195 * 100);
      return '<div class="tick' + (pt.id === 'finish' ? ' end' : '') + '" style="left:' + f.toFixed(2) + '%"><em>' + (pt.id === 'finish' ? '🏁' : pt.id === 'km30' ? '30 🏠' : pt.km) + '</em></div>';
    }).join('');
  }
  function drawBar(o, s){
    const bar = $('v-bar'); if(!bar) return;
    const me = $('v-me');
    if(o.st === 'idle' || s === undefined || (!o.ll && o.st !== 'finished')){ bar.style.width = '0%'; me.hidden = true; return; }
    const d = o.st === 'finished' ? 42195 : Math.max(0, (s - (live.test && typeof live.s0 === 'number' ? live.s0 : 0)) * SuiviGeo.scale);
    const f = Math.min(100, d / 42195 * 100).toFixed(2) + '%';
    bar.style.width = f; me.style.left = f; me.hidden = false;
    me.className = 'me' + (o.st === 'finished' ? ' fin' : '');
    $('v-track').setAttribute('aria-valuenow', (Math.min(42195, d) / 1000).toFixed(1));
  }
  function drawMap(o, s, data){
    drawBar(o, s);
    if(!map) return;
    if(s === undefined || o.st === 'idle' || (!o.ll && o.st !== 'finished')){
      passedL.setLatLngs([]);
      if(me){ me.remove(); me = null; meLL = null; }
      return;
    }
    const R = SUIVI_DATA.route, ll = o.st === 'finished' ? R[R.length - 1] : SuiviGeo.pointAt(s);
    let i = 1; while(i < R.length - 1 && CUM[i] < s) i++;
    passedL.setLatLngs(R.slice(0, i).concat([ll]));
    meLL = ll;
    if(!me){
      const ic = L.divIcon({ className: '', iconSize: [46, 46], iconAnchor: [23, 23], html: '<div class="me' + (o.st === 'finished' ? ' fin' : '') + '"><i></i><b>G</b></div>' });
      me = L.marker(ll, { icon: ic, zIndexOffset: 3000, keyboard: false }).addTo(map); me.bindPopup('Guillaume'); me._fin = o.st === 'finished';
      if(follow) map.setView(ll, 14); $('b-follow').hidden = true;
      return;
    }
    me.setLatLng(ll);
    const fin = o.st === 'finished';
    if(data || me._fin !== fin){ me._fin = fin; me.setIcon(L.divIcon({ className: '', iconSize: [46, 46], iconAnchor: [23, 23], html: '<div class="me' + (fin ? ' fin' : '') + '"><i></i><b>G</b></div>' })); }
    // suivi : recentrer quand le point s'approche du bord (pas à chaque pas, pour rester lisible)
    if(follow && (data || !map.getBounds().pad(-0.3).contains(ll))) map.panTo(ll, { animate: true, duration: 0.8 });
  }
  function glide(){ if(last && last.st === 'running') drawMap(last, visS(last, now()), false); }

  function replay(o){ ovr = o; render(false); }
  return { init: init, center: center, whole: whole, replay: replay, _ll: function(){ return meLL; } };
})();
document.addEventListener('DOMContentLoaded', function(){ SuiviView.init(); });
