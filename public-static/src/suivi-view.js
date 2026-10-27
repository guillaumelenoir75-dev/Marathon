// Page publique /suivi-guillaume : carte du parcours et position de Guillaume en direct (lecture seule de /live).

const SuiviView = (function(){
  let live = {}, offset = 0, map = null, me = null, meLL = null, trail = null, follow = true, passedL = null;
  const $ = function(id){ return document.getElementById(id); };
  const now = function(){ return Date.now() + offset; };

  async function init(){
    let ref;
    const lf = suiviLeaflet().catch(function(){});
    try { ref = await suiviFirebase(false); } catch(e) { $('status-line').textContent = 'Connexion impossible. Rechargez la page.'; return; }
    heading();
    buildTrack();
    if(typeof SuiviReplay !== 'undefined') SuiviReplay.init();          // rejeu : seulement si la course en a un
    await lf;
    buildMap();
    firebase.database().ref('.info/serverTimeOffset').on('value', function(s){ offset = s.val() || 0; });
    firebase.database().ref('.info/connected').on('value', function(s){ $('net').hidden = !!s.val(); });
    ref.on('value', function(s){
      live = s.val() || {};
      // une autre course vient d'être préparée : la page se recharge sur elle
      if(suiviRacePath === 'live' && ((live.race && live.race.id) || SUIVI_SE_ID) !== SuiviRace.id){ location.reload(); return; }
      render(true);
    });
    setInterval(function(){ render(false); }, 1000);
    setInterval(glide, 200);
  }

  // ─── En-tête : nom et date de la course ───────────────────────────────────
  function heading(){
    const day = SuiviRace.date ? new Date(SuiviRace.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
    const eb = document.querySelector('.hero .eyebrow'); if(eb) eb.textContent = SuiviRace.name + (day ? ' · ' + day : '');
    document.title = 'Suivi Guillaume · ' + SuiviRace.name;
    const tr = $('v-track'); if(tr) tr.setAttribute('aria-valuemax', (suiviOff() / 1000).toFixed(1));
    if($('v-rest')) $('v-rest').textContent = suiviKmLabel(suiviOff());
  }
  const startTxt = function(){ return suiviFmt.hhmmTxt(SuiviRace.start); };

  // ─── Carte ────────────────────────────────────────────────────────────────
  function buildMap(){
    if(!window.L){ $('map').innerHTML = '<p class="nomap">Carte indisponible (pas de connexion).</p>'; return; }
    $('map').innerHTML = '';
    map = L.map('map', { zoomControl: true, zoomSnap: 0.25 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }).addTo(map);
    const R = SuiviGeo.route, off = suiviOff();
    passedL = L.polyline([], { color: '#15803D', weight: 6, opacity: 1, interactive: false });
    trail = L.polyline([], { color: '#1D4ED8', weight: 4, opacity: 0.85, interactive: false }).addTo(map);
    if(SuiviGeo.has){
      L.polyline(R, { color: '#fff', weight: 10, opacity: 1, interactive: false }).addTo(map);
      L.polyline(R, { color: '#DC2626', weight: 6, opacity: 1, interactive: false }).addTo(map);
      passedL.addTo(map);
      // repères kilométriques : tous les 5 km (tous les 2 km sur une course courte), sauf là où il y a déjà un point de passage
      const step = off >= 15000 ? 5 : 2, near = function(k){ return SuiviRace.points.some(function(p){ return Math.abs(p.km - k) < 0.6; }); };
      for(let k = step; k < off / 1000 - 0.5; k += step){
        if(near(k)) continue;
        L.marker(SuiviGeo.pointAt(k * 1000 / SuiviGeo.scale), { interactive: false, keyboard: false, icon: L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11],
          html: '<div class="kmb">' + k + '</div>' }) }).addTo(map);
      }
      L.marker(R[0], { keyboard: false, icon: L.divIcon({ className: '', iconSize: [64, 24], iconAnchor: [32, 12], html: '<div class="flag start">Départ</div>' }) })
        .bindPopup('<b>Départ</b>' + (SuiviRace.place ? ' · ' + SuiviRace.place : '') + ', ' + startTxt()).addTo(map);
    }
    SuiviRace.points.forEach(function(pt){
      if(!pt.coord) return;
      const lab = pt.id === 'finish' ? '🏁 Arrivée' : pt.id === 'km30' && SuiviRace.seineEure ? '🏠 km 30' : (pt.short || 'km ' + String(pt.km).replace('.', ','));
      L.marker(pt.coord, { keyboard: false, zIndexOffset: 300, icon: L.divIcon({ className: '', iconSize: [86, 24], iconAnchor: [43, 12], html: '<div class="flag ' + pt.id + '">' + lab + '</div>' }) })
        .bindPopup('<b>' + (pt.label || lab) + '</b>' + (pt.lieu ? '<br>' + pt.lieu : '') + (pt.prevu ? '<br>Passage prévu ' + pt.prevu.replace(':', 'h') : '')).addTo(map);
    });
    if(SuiviGeo.has) map.fitBounds(L.polyline(R).getBounds(), { padding: [20, 20] });
    else map.setView([46.6, 2.4], 5);                    // sans tracé : la carte se centre sur Guillaume dès sa première position
    map.on('dragstart', function(){ follow = false; $('b-follow').hidden = false; });
  }
  function center(){ follow = true; $('b-follow').hidden = true; if(meLL) map.setView(meLL, Math.max(map.getZoom(), 14)); }
  function whole(){
    follow = false; $('b-follow').hidden = !meLL;
    const pts = SuiviGeo.has ? SuiviGeo.route : trail.getLatLngs();
    if(pts.length > 1) map.fitBounds(L.polyline(pts).getBounds(), { padding: [20, 20] }); else if(meLL) map.setView(meLL, 14);
  }

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
    const start = live.startedAt || suiviFmt.planned(SuiviRace.start);
    if(o.st === 'idle') $('status-line').textContent = 'Départ prévu à ' + startTxt() + (SuiviRace.place ? ' · ' + SuiviRace.place : '') + (t < start ? ' · dans ' + (start - t >= 3600000 ? suiviFmt.hm(start - t).replace('h', ' h ') : Math.max(1, Math.round((start - t) / 60000)) + ' min') : '');
    else if(o.st === 'finished') $('status-line').textContent = 'Arrivé en ' + suiviFmt.dur(live.finishedAt - live.startedAt) + ' 🎉';
    else $('status-line').textContent = 'Départ donné à ' + suiviFmt.hhmm(live.startedAt);
    if(live.test && o.st !== 'idle') $('status-line').textContent = '🧪 Essai : ce n\'est pas la course. ' + $('status-line').textContent;
    $('status-line').hidden = o.st === 'running' && !live.test;               // « depuis 9h16 » sous le chrono suffit
    $('v-time-sub').hidden = o.st === 'idle';                                    // la ligne d'état donne déjà le départ prévu
    const dist = o.d !== undefined ? o.d : null;
    $('v-time').textContent = o.chrono !== undefined ? suiviFmt.dur(o.chrono) : '–';
    $('v-time-sub').textContent = o.st === 'finished' ? 'temps final' : live.startedAt ? 'depuis ' + suiviFmt.hhmm(live.startedAt) : 'départ prévu ' + startTxt();
    const pace = o.known ? 1000 / o.speed : NaN;
    $('v-pace').textContent = suiviFmt.pace(pace);
    const eta = suiviEta(o, live);
    $('v-eta').textContent = suiviFmt.hhmm(eta.at);
    $('v-eta').previousElementSibling.textContent = eta.done ? 'Arrivée' : 'Arrivée estimée';
    $('v-eta-sub').textContent = eta.done ? 'en ' + suiviFmt.dur(eta.dur) : o.st === 'idle' ? 'départ ' + startTxt() + ' · ≈ ' + suiviFmt.hm(eta.dur) : 'temps final ≈ ' + suiviFmt.hm(eta.dur);
    if(o.replay){                                           // rejeu : textes propres, allure du km en cours
      pill.className = 'pill replay'; pill.textContent = o.pill;
      $('status-line').hidden = false; $('status-line').textContent = o.status;
      $('v-time-sub').hidden = false; $('v-time-sub').textContent = o.sub;
      $('v-eta').previousElementSibling.textContent = o.kmLabel; $('v-eta').textContent = o.kmPace; $('v-eta-sub').textContent = o.kmSub;
    }
    if($('v-done')) $('v-done').textContent = o.st === 'finished' ? suiviKmLabel(suiviOff()) : suiviFmt.km(dist || 0).replace(/,00$/, '');
    $('v-rest').textContent = o.st === 'finished' ? '0' : suiviFmt.km(Math.max(0, suiviOff() - (dist || 0))).replace(/,00$/, '');
    // carte
    last = o;
    drawMap(o, visS(o, t), data);
  }

  // ─── Carte : le point glisse le long du tracé à l'allure moyenne entre deux positions GPS ─────────
  // Purement visuel (les chiffres ne bougent qu'aux vraies mesures) ; la position affichée ne recule jamais.
  const CUM = function(){ return SuiviGeo.cum || [0]; };
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
    box.innerHTML = SuiviRace.points.map(function(pt){
      const f = pt.id === 'finish' ? 100 : Math.min(100, pt.s * SuiviGeo.scale / suiviOff() * 100);
      return '<div class="tick' + (pt.id === 'finish' ? ' end' : '') + '" style="left:' + f.toFixed(2) + '%"><em>' + (pt.id === 'finish' ? '🏁' : pt.id === 'km30' && SuiviRace.seineEure ? '30 🏠' : String(pt.km).replace('.', ',')) + '</em></div>';
    }).join('');
  }
  function drawBar(o, s){
    const bar = $('v-bar'); if(!bar) return;
    const me = $('v-me');
    if(o.st === 'idle' || s === undefined || (!o.ll && o.st !== 'finished')){ bar.style.width = '0%'; me.hidden = true; return; }
    const off = suiviOff(), d = o.st === 'finished' ? off : Math.max(0, (s - (live.test && typeof live.s0 === 'number' ? live.s0 : 0)) * SuiviGeo.scale);
    const f = Math.min(100, d / off * 100).toFixed(2) + '%';
    bar.style.width = f; me.style.left = f; me.hidden = false;
    me.className = 'me' + (o.st === 'finished' ? ' fin' : '');
    $('v-track').setAttribute('aria-valuenow', (Math.min(off, d) / 1000).toFixed(1));
  }
  function drawMap(o, s, data){
    drawBar(o, s);
    if(!map) return;
    if(s === undefined || o.st === 'idle' || (!o.ll && o.st !== 'finished')){
      passedL.setLatLngs([]);
      if(me){ me.remove(); me = null; meLL = null; }
      return;
    }
    const R = SuiviGeo.route, C = CUM();
    let ll;
    if(SuiviGeo.has){
      ll = o.st === 'finished' ? R[R.length - 1] : SuiviGeo.pointAt(s);
      let i = 1; while(i < R.length - 1 && C[i] < s) i++;
      passedL.setLatLngs(R.slice(0, i).concat([ll]));
    } else {
      // sans tracé : position GPS et trace parcourue
      ll = o.ll || (live.pos ? [live.pos.lat, live.pos.lon] : null);
      if(!ll) return;
      if(data) trail.setLatLngs((live.track ? Object.keys(live.track).map(function(k){ return live.track[k]; }).sort(function(a, b){ return a[2] - b[2]; }).map(function(x){ return [x[0], x[1]]; }) : []).concat([ll]));
    }
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
