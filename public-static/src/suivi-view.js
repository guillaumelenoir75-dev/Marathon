// Page publique /suivi-guillaume : carte du parcours et position de Guillaume en direct (lecture seule de /live).

const SuiviView = (function(){
  let live = {}, offset = 0, map = null, me = null, meLL = null, trail = null, follow = true, passedL = null, routeL = null;
  const SV2 = typeof document !== 'undefined' && !!document.getElementById('sv2');   // page des amis (/suivi-guillaume) : avant / pendant / après
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
      // temps officiel saisi après la course : la page se recharge pour proposer le rejeu
      if(suiviRacePath === 'live' && live.race && live.race.replay && !SuiviRace.replay){ location.reload(); return; }
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
    if(SV2) L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>', subdomains: 'abcd', maxZoom: 19 }).addTo(map);
    else L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }).addTo(map);
    const R = SuiviGeo.route, off = suiviOff();
    passedL = L.polyline([], { color: SV2 ? '#E0603A' : '#15803D', weight: 6, opacity: 1, interactive: false });
    trail = L.polyline([], { color: SV2 ? '#E0603A' : '#1D4ED8', weight: 4, opacity: 0.85, interactive: false }).addTo(map);
    if(SuiviGeo.has){
      L.polyline(R, { color: SV2 ? '#070B16' : '#fff', weight: 10, opacity: 1, interactive: false }).addTo(map);
      routeL = L.polyline(R, { color: SV2 ? '#E0603A' : '#DC2626', weight: 6, opacity: 1, interactive: false }).addTo(map);
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
    if(SV2){ render2(o, t, live.startedAt || suiviFmt.planned(SuiviRace.start)); last = o; drawMap(o, visS(o, t), data); return; }
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
    preCard(o, t, start); resultCard(o);
    // carte
    last = o;
    drawMap(o, visS(o, t), data);
  }

  // ─── Page des amis : une question par moment (avant / pendant / après), univers « Piste de nuit » ───
  const esc = function(x){ return String(x == null ? '' : x).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  const tT = function(ms){ const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + 'h' + String(m).padStart(2, '0') : m) + "'" + String(x).padStart(2, '0'); };
  const pS = function(sec){ if(!isFinite(sec) || sec <= 0) return '–'; const m = Math.floor(sec / 60), s = Math.round(sec % 60); return m + "'" + String(s === 60 ? 59 : s).padStart(2, '0'); };
  const chr = function(ms){ return suiviFmt.dur(ms).replace(/^0:/, ''); };
  const show = function(id, on){ const e = $(id); if(e) e.hidden = !on; };
  const txt = function(id, v){ const e = $(id); if(e && e.textContent !== v) e.textContent = v; };
  const htm = function(id, v){ const e = $(id); if(e && e._h !== v){ e.innerHTML = v; e._h = v; } };
  const CK = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  function dayWord(t){
    if(!SuiviRace.date) return '';
    const d = Math.round((new Date(SuiviRace.date + 'T12:00:00') - new Date(new Date(t).toDateString() + ' 12:00')) / 864e5);
    return d === 0 ? 'aujourd\'hui' : d === 1 ? 'demain' : d > 1 && d < 7 ? new Date(SuiviRace.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long' }) : 'le ' + new Date(SuiviRace.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  }
  // points de passage, du départ à l'arrivée : heure prévue (plan de course depuis le départ) et heure réelle quand il est passé
  function passList(o, t, start){
    const P = SuiviRace.points.filter(function(p){ return p.id !== 'finish'; }), ps = live.passages || {}, off = suiviOff();
    const fin = SuiviRace.points.filter(function(p){ return p.id === 'finish'; })[0] || { id: 'finish', km: off / 1000 };
    const r = o.st === 'running' && o.el > 0 && (o.d || 0) > 200 ? Math.max(0.85, Math.min(1.5, o.el / (SuiviPlan.t(o.d) * 1000))) : 1;
    const eta = function(m){ return o.st === 'running' ? t + Math.max(0, SuiviPlan.t(m) - SuiviPlan.t(o.d || 0)) * 1000 * r : start + SuiviPlan.t(m) * 1000; };
    return P.concat([fin]).map(function(p){
      const m = p.id === 'finish' ? off : p.km * 1000, plan = start + SuiviPlan.t(m) * 1000, real = ps[p.id] || (p.id === 'finish' && live.finishedAt) || null;
      return { id: p.id, fin: p.id === 'finish', m: m, label: p.id === 'finish' ? 'Arrivée' : 'km ' + String(p.km).replace('.', ',') + (p.label ? ' · ' + p.label : ''),
        lieu: p.id === 'finish' ? (p.lieu || SuiviRace.finishPlace || SuiviRace.place || '') : p.lieu || '', plan: plan, real: real, eta: real ? real : eta(m),
        passed: !!real || (o.st === 'running' && (o.d || 0) >= m) };
    });
  }
  function render2(o, t, start){
    const test = !!live.test && !o.replay, st = o.replay ? 'replay' : o.st, off = suiviOff();
    const main = $('sv2'); if(main.className !== 'page st-' + st) main.className = 'page st-' + st;
    const pill = $('pill');
    pill.className = 'pill ' + (o.replay ? 'replay' : o.st);
    txt('pill', o.replay ? o.pill : o.st === 'running' ? (test ? 'Essai' : 'En direct') : o.st === 'finished' ? (test ? 'Essai terminé' : 'Arrivé') : 'Pas encore parti');
    const dShort = SuiviRace.date ? new Date(SuiviRace.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
    txt('v-eb', st === 'idle' ? 'Suivi en direct · ' + SuiviRace.name : st === 'finished' ? SuiviRace.name + (dShort ? ' · ' + dShort : '') : SuiviRace.name);
    const dw = dayWord(t);
    txt('v-title', st === 'idle' ? (dw ? 'Guillaume court ' + dw : 'Suivi de Guillaume') : st === 'replay' ? 'Revivre la course' : st === 'running' ? (test ? 'Essai en cours' : 'Guillaume en course') : (test ? 'Essai terminé' : 'Guillaume est arrivé'));
    document.title = (st === 'running' && !test ? '🟢 ' : '') + 'Suivi Guillaume · ' + SuiviRace.name;
    const tgt = SuiviRace.target > 0 ? SuiviRace.target * 1000 : null, total = SuiviPlan.t(off) * 1000;
    // ─ avant le départ
    show('b-count', st === 'idle'); show('b-tiles', st === 'idle');
    if(st === 'idle'){
      const before = t < start;
      txt('c-k', before ? 'Départ dans' : 'Départ'); txt('c-time', before ? suiviCountdown(start - t) : startTxt());
      const day = new Date(start).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      txt('c-date', day.charAt(0).toUpperCase() + day.slice(1) + ' à ' + startTxt());
      txt('c-place', SuiviRace.place || ''); show('c-place', !!SuiviRace.place);
      txt('t-obj', tgt ? tT(tgt) : '–'); txt('t-pace', tgt ? pS(tgt / 1000 / (off / 1000)) : '–'); txt('t-eta', '≈' + suiviFmt.hhmm(start + total));
    }
    // ─ pendant la course (ou rejeu)
    show('b-live', st === 'running' || st === 'replay');
    if(st === 'running' || st === 'replay'){
      const d = o.d || 0;
      txt('l-km', (Math.min(off, d) / 1000).toFixed(1).replace('.', ',')); txt('l-of', 'km sur ' + suiviKmLabel(off));
      txt('l-chrono', o.chrono !== undefined ? chr(o.chrono) : '–');
      if(o.replay){ txt('l-pace-k', o.kmLabel); txt('l-pace', o.kmPace.replace('"/km', '/km').replace('"', '')); txt('l-eta', o.status + ' · ' + o.sub); }
      else {
        txt('l-pace-k', 'Allure moyenne'); txt('l-pace', o.known ? pS(1000 / o.speed) + '/km' : '–');
        const eta = suiviEta(o, live);
        htm('l-eta', 'Arrivée prévue vers <b>' + suiviFmt.hhmm(eta.at) + '</b>' + (tgt ? (eta.dur <= tgt + 1000 ? ', dans l\'objectif de ' + tT(tgt) + '.' : ', objectif ' + tT(tgt) + '.') : '.'));
      }
    }
    // ─ passages : où le voir passer (avant), ses passages (pendant)
    const PL = st === 'idle' || st === 'running' ? passList(o, t, start) : [];
    show('b-pass', PL.length > 0);
    if(PL.length){
      txt('pass-title', st === 'idle' ? 'Où le voir passer' : 'Ses passages');
      let h = '';
      if(st === 'idle'){
        h += '<div class="pr"><span class="t">' + suiviFmt.hhmm(start) + '</span><span class="n"><b>Départ</b>' + (SuiviRace.place ? '<small>' + esc(SuiviRace.place) + '</small>' : '') + '</span></div>';
        PL.forEach(function(p){ h += '<div class="pr"><span class="t' + (p.fin ? ' end' : '') + '">' + suiviFmt.hhmm(p.plan) + '</span><span class="n"><b>' + esc(p.label) + '</b>' + (p.lieu ? '<small>' + esc(p.lieu) + '</small>' : '') + '</span></div>'; });
      } else {
        h += '<div class="pr"><span class="ck">' + CK + '</span><span class="n"><b>Départ</b></span><span class="r">' + suiviFmt.hhmmss(start) + '</span></div>';
        PL.forEach(function(p){
          if(p.passed && p.real){
            const dl = Math.round((p.real - p.plan) / 1000), dtxt = Math.abs(dl) < 5 ? 'Pile à l\'heure prévue' : (Math.abs(dl) >= 60 ? tT(Math.abs(dl) * 1000) : Math.abs(dl) + ' s') + (dl < 0 ? ' d\'avance sur le prévu' : ' de retard sur le prévu');
            h += '<div class="pr"><span class="ck">' + CK + '</span><span class="n"><b>' + esc(p.label) + '</b><small class="' + (dl <= 0 ? 'ok' : 'late') + '">' + dtxt + '</small></span><span class="r">' + suiviFmt.hhmmss(p.real) + '</span></div>';
          } else h += '<div class="pr' + (p.passed ? '' : ' todo') + '"><span class="ck' + (p.passed ? '' : ' todo') + '">' + (p.passed ? CK : '') + '</span><span class="n"><b>' + esc(p.label) + '</b>' + (p.lieu ? '<small>' + esc(p.lieu) + '</small>' : '') + '</span><span class="r">' + (p.passed ? 'passé' : 'vers ' + suiviFmt.hhmm(p.eta)) + '</span></div>';
        });
      }
      htm('pass-list', h);
    }
    const nx = st === 'running' ? PL.filter(function(p){ return !p.passed; })[0] : null;
    show('b-next', !!nx);
    if(nx){
      const mn = Math.round((nx.eta - t) / 60000);
      txt('n-k', 'Prochain passage · ' + (mn <= 0 ? 'imminent' : 'dans ' + (mn >= 60 ? suiviFmt.hm(mn * 60000).replace('h', ' h ') : mn + ' min')));
      txt('n-t', nx.label + ' · vers ' + suiviFmt.hhmm(nx.eta)); txt('n-s', nx.lieu || ''); show('n-s', !!nx.lieu);
    }
    // ─ après l'arrivée
    const R = st === 'finished' ? suiviResult(live, SuiviRace) : null;
    show('b-res', !!R); show('b-share', !!R && !test);
    if(R){
      txt('r-k', R.official ? 'Temps officiel' : test ? 'Essai' : 'Temps du suivi'); txt('r-t', tT(R.ms));
      htm('r-l', suiviKmLabel(off) + ' km à <b>' + pS(R.pace) + '/km</b>');
      const d = R.diff; show('r-gap', d !== null && !test);
      if(d !== null){ const a = Math.abs(d), v = a >= 60 ? tT(a * 1000) : a + ' s';
        htm('r-gap', d <= 0 ? CK.replace('width="20" height="20"', 'width="16" height="16"') + (d === 0 ? 'Pile dans l\'objectif de ' : v + ' sous l\'objectif de ') + tT(R.target) : v + ' au-dessus de l\'objectif de ' + tT(R.target));
        $('r-gap').className = 'gap' + (d > 0 ? ' over' : ''); }
      txt('r-n', SuiviRace.replay || R.official || test ? '' : 'Le temps officiel et le rejeu de la course arrivent bientôt.'); show('r-n', !(SuiviRace.replay || R.official || test));
    }
    const K = (st === 'finished' || st === 'replay') ? kmsHtml() : '';
    show('b-kms', !!K); if(K) htm('b-kms', K);
    // ─ carte
    txt('map-title', st === 'running' ? 'Où est Guillaume ?' : st === 'replay' ? 'Sa course' : 'Le parcours');
    const pos = live.pos;
    show('m-age', st === 'running' && !!(pos && pos.ts)); if(st === 'running' && pos && pos.ts) txt('m-age', 'Position ' + suiviFmt.ago(t - pos.ts));
    if(routeL){ const c = st === 'idle' ? '#E0603A' : st === 'finished' ? '#3FCF7F' : '#4A5A85'; if(routeL._c !== c){ routeL.setStyle({ color: c }); routeL._c = c; } }
    txt('foot', st === 'idle' ? 'La page se met à jour toute seule dès le départ. Pas besoin de la recharger.' : st === 'running' ? 'Position envoyée par son téléphone, environ toutes les minutes. Entre deux envois, le point avance à son allure.' : st === 'replay' ? 'Rejeu calé sur son temps officiel et ses temps au kilomètre.' : 'Merci de l\'avoir suivi !');
  }
  // km par km : temps au km de la montre, recalés sur le temps officiel (rejeu)
  function kmsHtml(){
    const rp = SuiviRace.replay; if(!rp || !Array.isArray(rp.splits) || rp.splits.length < 2 || !(rp.official > 0)) return '';
    const raw = rp.splits.reduce(function(a, x){ return a + x; }, 0) + (rp.last && rp.last.km > 0 ? rp.last.km * rp.last.pace : 0), f = rp.official / raw;
    const P = rp.splits.map(function(x){ return x * f; }), n = P.length, mn = Math.min.apply(null, P), mx = Math.max.apply(null, P), best = P.indexOf(mn);
    const lab = n <= 12, cols = 'grid-template-columns:repeat(' + n + ',minmax(0,1fr))';
    const half = Math.floor(n / 2), a1 = P.slice(0, half).reduce(function(a, x){ return a + x; }, 0) / half, a2 = P.slice(half).reduce(function(a, x){ return a + x; }, 0) / (n - half);
    const sum = a2 < a1 - 2 ? 'Départ prudent, puis accélération : la 2e moitié plus rapide que la 1re.' : a2 > a1 + 2 ? 'Départ rapide, fin plus dure : la 2e moitié plus lente.' : 'Allure régulière du début à la fin.';
    return '<div class="ch"><h2>Km par km</h2><span>le plus rapide : km ' + (best + 1) + '</span></div>'
      + '<div class="kms" style="' + cols + '">' + P.map(function(p, i){ const h = 25 + 75 * (mx - p) / ((mx - mn) || 1);
        return '<div class="' + (i === best ? 'best' : '') + '">' + (lab ? '<em>' + pS(p) + '</em>' : '') + '<i style="height:' + h.toFixed(0) + '%" title="km ' + (i + 1) + ' en ' + pS(p) + '"></i></div>'; }).join('') + '</div>'
      + '<div class="kmx" style="' + cols + '">' + P.map(function(p, i){ return '<span>' + (lab || (i + 1) % 5 === 0 || i === 0 ? i + 1 : '') + '</span>'; }).join('') + '</div>'
      + '<p class="kmn">' + sum + '</p>';
  }
  // ajouter la course à son agenda (fichier .ics, ouvert par l'agenda du téléphone)
  function ics(){
    const st = suiviFmt.planned(SuiviRace.start), en = st + (SuiviPlan.t(suiviOff()) + 15 * 60) * 1000;
    const loc = function(ms){ const d = new Date(ms), z = function(x){ return String(x).padStart(2, '0'); }; return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + 'T' + z(d.getHours()) + z(d.getMinutes()) + '00'; };
    const e = function(s){ return String(s || '').replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n'); };
    const url = location.origin + location.pathname + location.search;
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Prepa Marathon//Suivi//FR', 'BEGIN:VEVENT', 'UID:' + (SuiviRace.id || 'course') + '@prepa-marathon.web.app',
      'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''), 'DTSTART;TZID=Europe/Paris:' + loc(st), 'DTEND;TZID=Europe/Paris:' + loc(en),
      'SUMMARY:' + e('Guillaume court la ' + SuiviRace.name), 'LOCATION:' + e(SuiviRace.place || ''), 'DESCRIPTION:' + e('Suivi en direct : ' + url), 'URL:' + url, 'END:VEVENT', 'END:VCALENDAR'];
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' })); a.download = (SuiviRace.id || 'course') + '.ics';
    document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  // partager le résultat (feuille de partage du téléphone, sinon lien copié)
  function share(){
    const R = suiviResult(live, SuiviRace), url = location.origin + location.pathname + location.search;
    const text = R ? 'Guillaume a couru la ' + SuiviRace.name + ' en ' + tT(R.ms) + ' (' + pS(R.pace) + '/km) !' : 'Suivez Guillaume en direct';
    if(navigator.share) navigator.share({ title: 'Suivi Guillaume · ' + SuiviRace.name, text: text, url: url }).catch(function(){});
    else if(navigator.clipboard) navigator.clipboard.writeText(text + ' ' + url).then(function(){ const b = $('b-share'); if(b){ const h = b.innerHTML; b.textContent = 'Lien copié ✓'; setTimeout(function(){ b.innerHTML = h; }, 2000); } }, function(){});
  }

  // ─── Avant le départ : compte à rebours dans le chrono + programme (départ, objectif, passages prévus) ───
  let preKey = null;
  const tTxt = function(ms){ const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + 'h' + String(m).padStart(2, '0') : m) + "'" + String(x).padStart(2, '0'); };
  function preCard(o, t, start){
    const box = $('pre'), lab = document.querySelector('.chrono span'); if(!box) return;
    const before = o.st === 'idle' && !o.replay && t < start;
    if(lab) lab.textContent = before ? 'Départ dans' : 'Chrono';
    if(before){
      $('v-time').textContent = suiviCountdown(start - t);
      const day = new Date(start).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      $('v-time-sub').hidden = false; $('v-time-sub').textContent = day + ' à ' + startTxt();
    }
    const show = o.st === 'idle' && !o.replay;
    box.hidden = !show; if(!show){ preKey = null; return; }
    const key = start + '|' + SuiviRace.place + '|' + SuiviRace.target + '|' + JSON.stringify(SuiviRace.points); if(key === preKey) return; preKey = key;
    const tot = SuiviPlan.t(suiviOff()) * 1000, at = function(m){ return suiviFmt.hhmm(start + SuiviPlan.t(m) * 1000); };
    const row = function(k, v){ return '<div class="pre-row"><span>' + k + '</span><b>' + v + '</b></div>'; };
    const esc = function(x){ return String(x == null ? '' : x).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    let h = '<h2>Le programme</h2>' + row('Départ', startTxt() + (SuiviRace.place ? ' · ' + esc(SuiviRace.place) : ''));
    if(SuiviRace.target) h += row('Objectif', tTxt(SuiviRace.target * 1000) + ' · ' + suiviFmt.pace(SuiviRace.target / (suiviOff() / 1000)));
    SuiviRace.points.filter(function(p){ return p.id !== 'finish'; }).forEach(function(p){ h += row('km ' + String(p.km).replace('.', ',') + (p.label ? ' · ' + esc(p.label) : ''), 'vers ' + at(p.km * 1000)); });
    h += row('Arrivée' + (SuiviRace.place ? '' : ''), 'vers ' + suiviFmt.hhmm(start + tot));
    box.innerHTML = h;
  }
  // ─── Après l'arrivée : temps (officiel s'il est saisi), allure, écart à l'objectif, rejeu ───
  let resKey = null;
  function resultCard(o){
    const box = $('result'); if(!box) return;
    const R = o.st === 'finished' && !live.test && !o.replay ? suiviResult(live, SuiviRace) : null;
    box.hidden = !R; if(!R){ resKey = null; return; }
    const key = R.ms + '|' + R.official + '|' + R.diff; if(key === resKey) return; resKey = key;
    const d = R.diff;
    box.innerHTML = '<p class="res-k">' + (R.official ? 'Temps officiel' : 'Arrivé ✔') + '</p><b class="res-t">' + tTxt(R.ms) + '</b>'
      + '<p class="res-l">' + suiviKmLabel(suiviOff()) + ' km à <b>' + suiviFmt.pace(R.pace) + '</b>'
      + (d === null ? '' : d <= 0 ? ' · <b>' + (d === 0 ? 'pile' : Math.abs(d) >= 60 ? tTxt(-d * 1000) : Math.abs(d) + ' s') + '</b> ' + (d === 0 ? 'sur l\'objectif' : 'sous l\'objectif') + ' 🎉'
        : ' · ' + (d >= 60 ? tTxt(d * 1000) : d + ' s') + ' au-dessus de l\'objectif') + '</p>'
      + '<p class="res-n">' + (SuiviRace.replay ? 'Revivez la course en accéléré juste en dessous.' : R.official ? '' : 'Temps du suivi en direct · le temps officiel et le rejeu de la course arrivent bientôt.') + '</p>';
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
  return { init: init, center: center, whole: whole, replay: replay, ics: ics, share: share, _ll: function(){ return meLL; } };
})();
document.addEventListener('DOMContentLoaded', function(){ SuiviView.init(); });
