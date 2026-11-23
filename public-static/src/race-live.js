// Course en direct (accueil, admin) : pilotage du suivi /live depuis l'application — départ, essai, arrivée, annulation,
// et pointages officiels (km + temps de course) qui mettent à jour distance, allure, passages et page /suivi-guillaume.

let _liveRef = null, _liveVal = {}, _liveTimer = null, _liveOffset = 0;

let _liveCoreP = null;
function _liveLoadCore(){
  if(typeof SuiviGeo !== 'undefined') return Promise.resolve();
  if(_liveCoreP) return _liveCoreP;                                  // un seul chargement, même si appelé deux fois
  const load = function(src){ return new Promise(function(ok, ko){ const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); }); };
  _liveCoreP = load('/src/suivi-data.js?v=1').then(function(){ return load('/src/suivi-core.js?v=14'); }).catch(function(e){ _liveCoreP = null; throw e; });
  return _liveCoreP;
}
// Temps de course → millisecondes. Saisie au pavé numérique (sans « : ») : les chiffres se lisent depuis la droite
// (secondes, minutes, heures) : 1458 → 14:58 · 14823 → 1:48:23. Formats « 1h42 » / « 1h42m10 » acceptés aussi.
function _liveParseTime(v){
  v = String(v || '').trim().toLowerCase().replace(/\s/g, '');
  let h = 0, m = 0, s = 0;
  if(/h/.test(v)){
    const x = v.match(/^(\d{1,2})h(\d{1,2})?(?:m(?:in)?)?(\d{1,2})?s?$/);
    if(!x) return null;
    h = +x[1]; m = +(x[2] || 0); s = +(x[3] || 0);
  } else {
    if(!/^[\d:]+$/.test(v)) return null;
    const d = v.replace(/:/g, '');
    if(!d || d.length > 6) return null;
    s = +d.slice(-2); m = d.length > 2 ? +d.slice(-4, -2) : 0; h = d.length > 4 ? +d.slice(0, -4) : 0;
  }
  if(m > 59 || s > 59) return null;
  const tot = h * 3600 + m * 60 + s;
  return tot > 0 && tot < 8 * 3600 ? tot * 1000 : null;
}
// mise en forme pendant la frappe : 1 → 1 · 145 → 1:45 · 1458 → 14:58 · 14823 → 1:48:23
function _liveFmtTimeInput(el){
  if(/h/i.test(el.value)) return;                       // saisie « 1h42 » laissée telle quelle
  el.value = fmtClockDigits(el.value, 6);
}

async function openLivePanel(){
  if(!isAdmin()) return;
  try { await _liveLoadCore(); } catch(e) { alert('Impossible de charger le suivi (réseau).'); return; }
  // déjà ouvert (notification d'un encouragement, bouton de l'accueil) : remplacé, jamais deux panneaux l'un sur l'autre
  if(document.getElementById('live-panel')) closeLivePanel();
  const mc = document.getElementById('modal-container');
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'live-panel';
  ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  _liveSyncRace(_liveVal.race);
  const _offKm = suiviOff() / 1000;
  const chips = (_offKm > 30 ? [5, 10, 15, 20, 21.1, 25, 30, 35, 40, _offKm] : _offKm > 15 ? [5, 10, 15, 20, _offKm] : [1, 2, 3, 4, 5, 6, 7, 8, 9, _offKm]).map(function(k){ return '<button type="button" class="lv-chip" onclick="document.getElementById(\'lv-km\').value=\'' + k + '\'">' + String(k).replace('.', ',') + '</button>'; }).join('');
  // trois moments : Avant (liste de contrôle, fiche de la course, réglages repliés), Pendant (chrono, pointages), Après (temps officiel, rejeu)
  ov.innerHTML = '<div class="modal-box lv-box" style="max-height:92vh;">'
    + '<div class="lv-head"><div class="lv-hd"><p id="lv-race-name" class="lv-eb">' + _prepEsc(SuiviRace.name) + ' · suivi en direct</p><p class="lv-title">Course en direct</p>'
    +   '<span id="lv-pill" class="lv-pill">…</span></div>'
    +   '<button onclick="closeLivePanel()" aria-label="Fermer" class="lv-x"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>'
    + '<div class="lv-tabs" role="tablist" aria-label="Moments de la course">'
    +   ['avant', 'pendant', 'apres'].map(function(k, i){ return '<button type="button" role="tab" id="lv-tab-' + k + '" aria-controls="lv-sec-' + k + '" aria-selected="false" onclick="liveTab(\'' + k + '\')">' + ['Avant', 'Pendant', 'Après'][i] + '</button>'; }).join('')
    + '</div>'
    + '<div class="modal-scroll-body"><div class="lv-body">'
    // ─ Avant
    + '<section id="lv-sec-avant" class="lv-sec" role="tabpanel" aria-labelledby="lv-tab-avant">'
    +   '<div class="lv-card"><div class="lv-ch"><p class="lv-h">Prêt pour le départ ?</p><span id="lv-check-n" class="lv-cnt"></span></div><div id="lv-check"></div></div>'
    +   '<div id="lv-act-avant" class="lv-acts"></div>'
    +   '<div class="lv-card lv-cheer-box" hidden></div>'
    +   '<div class="lv-card" id="lv-race"></div>'
    +   '<details class="lv-more" id="lv-more"><summary>Réglages OwnTracks</summary>'
    +     '<div class="lv-card"><p class="lv-h">Tester OwnTracks</p>'
    +       '<p class="lv-note">Vérifie la liaison, le mode Move et la réception de ta position en direct.</p>'
    +       '<button type="button" class="lv-btn lv-go" onclick="liveTestOt()">Lancer le test</button>'
    +       '<div id="lv-test" style="margin-top:10px;" hidden></div></div>'
    +     '<div class="lv-card" id="lv-ot"><p class="lv-h">Position écran verrouillé</p>'
    +       '<button type="button" class="lv-btn lv-ghost" onclick="liveOwnTracks()">Copier l\'adresse OwnTracks</button>'
    +       '<div id="lv-ot-man" hidden style="margin-top:8px;"><p class="lv-note">Adresse à coller dans OwnTracks (elle contient ta clé secrète, ne la partage pas) :</p>'
    +       '<input id="lv-ot-url" class="lv-in" readonly onclick="this.select()">'
    +       '<button type="button" class="lv-btn lv-ghost" style="margin-top:6px;" onclick="liveCopyOt()">Copier l\'adresse</button></div></div>'
    +   '</details>'
    + '</section>'
    // ─ Pendant
    + '<section id="lv-sec-pendant" class="lv-sec" role="tabpanel" aria-labelledby="lv-tab-pendant" hidden>'
    +   '<div class="lv-live"><span>Temps de course</span><b id="lv-chrono">–</b>'
    +     '<div id="lv-adj" class="lv-adj" hidden><button type="button" aria-label="Reculer le chrono d\'une seconde" onclick="liveNudge(-1)">− 1 s</button><button type="button" aria-label="Avancer le chrono d\'une seconde" onclick="liveNudge(1)">+ 1 s</button></div></div>'
    +   '<div class="lv-grid">'
    +     '<div class="lv-stat"><span>Distance</span><b id="lv-dist">–</b></div>'
    +     '<div class="lv-stat"><span>Allure moyenne</span><b id="lv-pace">–</b></div>'
    +     '<div class="lv-stat lv-wide"><span>Arrivée estimée</span><b id="lv-eta">–</b></div>'
    +   '</div>'
    +   '<div id="lv-auto" class="lv-warn" role="status" hidden></div>'
    +   '<p id="lv-src" class="lv-note"></p>'
    +   '<div id="lv-act-pendant" class="lv-acts"></div>'
    +   '<div class="lv-card lv-cheer-box" hidden></div>'
    +   '<div class="lv-card"><p class="lv-h">Pointage officiel</p>'
    +     '<p class="lv-note">Un km et ton temps de course officiel : distance, allure et page des amis sont recalées.</p>'
    +     '<div class="lv-row2"><label class="lv-lab">Km<input id="lv-km" type="text" inputmode="decimal" placeholder="5"></label>'
    +     '<label class="lv-lab">Temps<input id="lv-t" type="text" inputmode="numeric" placeholder="20:58" oninput="_liveFmtTimeInput(this)"></label></div>'
    +     '<p class="lv-note">Tape seulement les chiffres : 2058 → 20:58 · 14823 → 1:48:23</p>'
    +     '<div class="lv-chips">' + chips + '</div>'
    +     '<button type="button" class="lv-btn lv-go" onclick="liveSaveSplit()">Enregistrer le pointage</button>'
    +     '<div id="lv-splits" style="margin-top:10px;"></div></div>'
    +   '<div class="lv-card"><p class="lv-h">Heure du départ</p>'
    +     '<div class="lv-row2" style="align-items:flex-end;"><label class="lv-lab">Départ donné à<input id="lv-start" type="time" step="1" value="' + SuiviRace.start + ':00"></label>'
    +     '<button type="button" class="lv-btn lv-ghost" style="flex:1" onclick="liveStartAt()">Régler le chrono</button></div></div>'
    + '</section>'
    // ─ Après
    + '<section id="lv-sec-apres" class="lv-sec" role="tabpanel" aria-labelledby="lv-tab-apres" hidden><div id="lv-after"></div><div id="lv-act-apres" class="lv-acts"></div><div class="lv-card lv-cheer-box" hidden></div></section>'
    + '<a class="lv-btn lv-ghost lv-link" href="/suivi-guillaume" target="_blank">Voir la page des amis</a>'
    + '</div></div></div>';
  mc.appendChild(ov);
  _liveCss();
  if(!_liveRef){
    _liveRef = firebase.database().ref('live');
    firebase.database().ref('.info/serverTimeOffset').on('value', function(s){ _liveOffset = s.val() || 0; });
  }
  _liveRef.on('value', _liveOnValue);
  clearInterval(_liveTimer); _liveTimer = setInterval(function(){ _liveRender(); if(_liveTest && !_liveTest.done) _liveTestRender(); }, 1000);
}
function closeLivePanel(){
  _liveTest = null;
  if(_liveRef) _liveRef.off('value', _liveOnValue);
  clearInterval(_liveTimer); _liveTimer = null;
  const ov = document.getElementById('live-panel'); if(ov) ov.remove();
}
function _liveOnValue(s){ _liveVal = s.val() || {}; _liveInfoFix(); _liveSyncRace(_liveVal.race); liveCheersWatch(); _liveCheersRender(); _liveRender(); _liveRaceRender(); _liveRenderHomeBtn(); if(_liveTest && !_liveTest.done) _liveTestRender(); }
const _liveNow = function(){ return Date.now() + _liveOffset; };

function _liveRender(){
  const L = _liveVal, el = document.getElementById('lv-chrono'); if(!el) return;
  const t = _liveNow(), st = L.status || 'idle';
  const pill = document.getElementById('lv-pill');
  pill.textContent = st === 'running' ? (L.test ? 'Essai en cours' : 'En course') : st === 'finished' ? (L.test ? 'Essai terminé' : 'Arrivé') : 'Pas encore parti';
  pill.className = 'lv-pill' + (st === 'running' ? ' run' : st === 'finished' ? ' fin' : '');
  _liveTabsAuto(st);
  el.textContent = L.startedAt ? suiviFmt.dur((L.finishedAt || t) - L.startedAt) : '–';
  document.getElementById('lv-adj').hidden = st !== 'running';
  const p = L.pos, c = suiviCalc(L, t);
  document.getElementById('lv-dist').textContent = c.d !== undefined ? suiviFmt.km(c.d) + ' km' : '–';
  document.getElementById('lv-pace').textContent = c.known ? suiviFmt.pace(1000 / c.speed) : '–';
  const eta = suiviEta(c, L);
  document.getElementById('lv-eta').textContent = suiviFmt.hhmm(eta.at) + ' · ' + suiviFmt.hm(eta.dur);
  const ot = L.ota;
  // bandeau : OwnTracks muet ou plus en « Move » (batterie, Quiet…) → suivi autonome sans GPS
  const otAge = ot && ot.ts ? t - ot.ts : Infinity, otOff = otAge > 180000 || (ot && typeof ot.m === 'number' && ot.m !== 2);
  const auto = document.getElementById('lv-auto');
  auto.hidden = !(st === 'running' && (otOff || c.est));
  const otMode = ot && typeof ot.m === 'number' && ot.m !== 2 ? ({ '-1': 'Quiet', '0': 'Manual', '1': 'Significant' })[String(ot.m)] || 'autre' : null;
  if(!auto.hidden) auto.innerHTML = '<b>📡 ' + (otOff ? (otAge <= 180000 && otMode ? 'OwnTracks n\'est plus en mode Move (mode ' + otMode + ')' : 'OwnTracks déconnecté' + (otAge < Infinity ? ' (dernier contact ' + suiviFmt.ago(otAge) + ')' : '') + (otMode ? ' · mode ' + otMode : '')) : 'Pas de position GPS fiable depuis ' + suiviFmt.ago(c.age).replace('il y a ', '')) + '</b><br>'
    + 'Suivi en autonome sans le GPS : la position avance selon ton plan de course et tes temps officiels. Saisis tes pointages pour la recaler.';
  document.getElementById('lv-src').innerHTML = (p ? 'Dernière position : ' + suiviFmt.ago(t - p.ts) + (p.src === 'officiel' ? ' (pointage officiel)' : p.src === 'owntracks' ? ' (OwnTracks)' : '') + (c.adj ? ' · allure bornée sur le plan' : '') + ' · ' : '')
    + 'OwnTracks : ' + (ot && ot.ts ? '<b class="' + (t - ot.ts < 300000 ? 'lv-ok' : 'lv-bad') + '">' + suiviFmt.ago(t - ot.ts) + '</b>' + (typeof ot.batt === 'number' ? ' · batterie ' + ot.batt + ' %' : '') : '<b class="lv-bad">aucun contact</b>');
  // actions selon l'état (reconstruites seulement si l'état change)
  const key = st + (L.test ? 't' : '');
  const box = document.getElementById(st === 'running' ? 'lv-act-pendant' : st === 'finished' ? 'lv-act-apres' : 'lv-act-avant');
  ['lv-act-avant', 'lv-act-pendant', 'lv-act-apres'].forEach(function(id){ const b = document.getElementById(id); if(b && b !== box && b.innerHTML){ b.innerHTML = ''; b.dataset.k = ''; } });
  if(box.dataset.k !== key){
    box.dataset.k = key;
    box.innerHTML = st === 'running'
      ? (L.test ? '<button class="lv-btn lv-go lv-big" onclick="liveStart()">▶ Démarrer la course maintenant</button>' : '')
      + '<button class="lv-btn lv-fin" onclick="liveFinish()">🏁 Je suis arrivé</button><button class="lv-btn lv-danger" onclick="liveCancel()">✖ Annuler ' + (L.test ? 'l\'essai' : 'le suivi') + ' (tout effacer)</button>'
      : st === 'finished'
        ? (L.test ? '<button class="lv-btn lv-go lv-big" onclick="liveStart()">▶ Démarrer la course maintenant</button>' : '') + '<button class="lv-btn lv-danger" onclick="liveCancel()">✖ Annuler (tout effacer)</button>'
        : '<button class="lv-btn lv-go lv-big" onclick="liveStart()">▶ Démarrer la course maintenant</button><button class="lv-btn lv-ghost" onclick="liveStart(null,true)">Lancer un essai (annulable)</button>';
  }
  const sp = L.splits ? Object.keys(L.splits).map(function(k){ return Object.assign({ k: k }, L.splits[k]); }).sort(function(a, b){ return a.km - b.km; }) : [];
  document.getElementById('lv-splits').innerHTML = sp.length ? sp.map(function(x){
    return '<div class="lv-row"><b>km ' + String(+x.km.toFixed(3)).replace('.', ',') + '</b><span>' + suiviFmt.dur(x.el) + ' · ' + suiviFmt.pace(x.el / 1000 / x.km) + '</span><button aria-label="Supprimer" onclick="liveDelSplit(\'' + x.k + '\')">×</button></div>';
  }).join('') : '';
  _liveCheckRender(); _liveAfterRender();
}

// ─── Avant / Pendant / Après : l'onglet suit l'état de la course (un choix à la main est gardé tant que l'état ne change pas) ───
let _liveTabSel = null, _liveTabFor = null;
function _liveTabsAuto(st){
  if(_liveTabFor === st && _liveTabSel) return _liveTabsApply();
  _liveTabFor = st; _liveTabSel = st === 'running' ? 'pendant' : st === 'finished' ? 'apres' : 'avant';
  _liveTabsApply();
}
function liveTab(k){ _liveTabSel = k; _liveTabsApply(); const b = document.querySelector('#live-panel .modal-scroll-body'); if(b) b.scrollTop = 0; }
function _liveTabsApply(){
  ['avant', 'pendant', 'apres'].forEach(function(k){
    const s = document.getElementById('lv-sec-' + k), b = document.getElementById('lv-tab-' + k); if(!s || !b) return;
    s.hidden = k !== _liveTabSel; b.setAttribute('aria-selected', String(k === _liveTabSel)); b.classList.toggle('on', k === _liveTabSel);
  });
}
// liste de contrôle d'avant la course : chaque point passe au vert tout seul (ok / warn / bad + bouton pour corriger)
function liveChecklist(L, now){
  L = L || {}; now = now || Date.now();
  const r = L.race || null, P = typeof _livePrepRace === 'function' ? _livePrepRace() : null, out = [];
  const day = function(d){ return d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : ''; };
  const same = r && (!P || P.id === r.id);
  out.push({ k: 'race', st: same ? 'ok' : 'bad', t: 'Course préparée', s: same ? SuiviRace.name + ' · ' + day(SuiviRace.date) : P ? 'Prépare le suivi de « ' + P.name + ' »' : 'Aucune course au programme',
    fix: !same && P ? { t: 'Préparer', a: 'livePrepareRace()' } : null });
  out.push({ k: 'route', st: SuiviGeo.has ? 'ok' : 'warn', t: 'Tracé du parcours', s: SuiviGeo.has ? (SuiviGeo.len / 1000).toFixed(2).replace('.', ',') + ' km · arrivée détectée toute seule' : 'Sans tracé : distance au GPS, arrivée à déclarer',
    fix: !SuiviGeo.has && r && liveRouteOf(r.id) ? { t: 'Ajouter', a: 'liveUsePresetRoute()' } : null });
  out.push({ k: 'start', st: r && r.start && r.place ? 'ok' : r ? 'warn' : 'bad', t: 'Départ et lieu',
    s: 'Départ ' + suiviFmt.hhmmTxt(SuiviRace.start) + (SuiviRace.place ? ' · ' + SuiviRace.place : ' · lieu à renseigner') });
  const o = L.ota || {}, age = o.ts ? now - o.ts : null, move = o.m === 2, batt = typeof o.batt === 'number' ? o.batt : null;
  const otSt = age === null ? 'bad' : age < 15 * 60000 && move && (batt === null || batt >= 50) ? 'ok' : 'warn';
  out.push({ k: 'ot', st: otSt, t: 'Position du téléphone (OwnTracks)',
    s: age === null ? 'Aucune position reçue pour l\'instant' : 'Reçue ' + suiviFmt.ago(age) + (o.m === undefined || o.m === null ? '' : move ? ' · mode Move' : ' · pas en mode Move') + (batt !== null ? ' · batterie ' + batt + ' %' : ''),
    fix: otSt !== 'ok' ? { t: 'Tester', a: 'liveOtOpen()' } : null });
  out.push({ k: 'test', st: r && r.testedAt ? 'ok' : 'warn', t: 'Essai de 2 minutes', s: r && r.testedAt ? 'Fait ' + suiviFmt.ago(now - r.testedAt) : 'Lance un essai : la page des amis doit bouger',
    fix: r && !r.testedAt && (L.status || 'idle') === 'idle' ? { t: 'Essai', a: 'liveStart(null,true)' } : null });
  out.push({ k: 'share', st: r && r.sharedAt ? 'ok' : 'warn', t: 'Lien envoyé aux amis', s: r && r.sharedAt ? 'Envoyé ' + suiviFmt.ago(now - r.sharedAt) : 'Pas encore envoyé',
    fix: { t: r && r.sharedAt ? 'Renvoyer' : 'Envoyer', a: 'liveShareLink()' } });
  return out;
}
function liveOtOpen(){ const d = document.getElementById('lv-more'); if(d){ d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } liveTestOt(); }
const LV_ICO = { ok: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  warn: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 7v6M12 17h.01"/></svg>',
  bad: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>' };
function _liveCheckRender(){
  const box = document.getElementById('lv-check'); if(!box) return;
  const C = liveChecklist(_liveVal, _liveNow()), n = C.filter(function(x){ return x.st === 'ok'; }).length;
  const cnt = document.getElementById('lv-check-n'); if(cnt){ cnt.textContent = n + ' sur ' + C.length; cnt.className = 'lv-cnt' + (n === C.length ? ' all' : ''); }
  const h = C.map(function(x){
    return '<div class="lv-ci ' + x.st + '"><span class="lv-ico">' + LV_ICO[x.st] + '</span><span class="lv-ct"><b>' + _prepEsc(x.t) + '</b><small>' + _prepEsc(x.s) + '</small></span>'
      + (x.fix ? '<button type="button" class="lv-fix" onclick="' + x.fix.a + '">' + x.fix.t + '</button>' : '') + '</div>'; }).join('');
  if(box.dataset.h !== h){ box.innerHTML = h; box.dataset.h = h; }
}
// séance « course » du plan : la valider = saisir le temps officiel (crée le rejeu pour les amis, liveStoreReplay)
function _liveRaceSession(){
  if(typeof state === 'undefined' || !SuiviRace.date) return null;
  let f = null;
  Object.keys(state).forEach(function(k){ const m = k.match(/^extra_w(\d+)_s(\d+)$/); if(!m || f) return; try { const x = JSON.parse(state[k]); if(x.type === 'race' && x.sched_date === SuiviRace.date) f = { w: +m[1], ei: +m[2], done: !!state[k + '_done'] }; } catch(e) {} });
  return f;
}
function liveOfficialOpen(){
  const s = _liveRaceSession(); if(!s || typeof openValidationModalExtra !== 'function'){ alert('Séance « course » introuvable dans le plan.'); return; }
  closeLivePanel(); openValidationModalExtra(s.w, s.ei);
}
function _liveAfterRender(){
  const box = document.getElementById('lv-after'); if(!box) return;
  const L = _liveVal, st = L.status || 'idle', r = L.race || {}, rp = r.replay || null, S = _liveRaceSession();
  let h;
  if(st !== 'finished' || L.test){
    h = '<div class="lv-card"><p class="lv-h">Après l\'arrivée</p><p class="lv-note">Ton temps, puis le rejeu accéléré de ta course pour tes amis, dès que tu as saisi ton temps officiel.</p></div>';
  } else {
    const chrono = L.finishedAt && L.startedAt ? L.finishedAt - L.startedAt : null, off = rp && rp.official ? rp.official * 1000 : r.final > 0 ? r.final * 1000 : null, ref = off || chrono;
    const tgt = SuiviRace.target ? SuiviRace.target * 1000 : null, diff = ref && tgt ? Math.round((ref - tgt) / 1000) : null;
    h = '<div class="lv-card lv-res"><p class="lv-eb2">' + (off ? 'Temps officiel' : 'Chrono du suivi') + '</p><b class="lv-big-t">' + (ref ? suiviFmt.dur(ref) : '–') + '</b>'
      + '<p class="lv-note">' + (ref ? suiviFmt.pace(ref / 1000 / (suiviOff() / 1000)) : '') + (diff !== null ? ' · ' + (diff <= 0 ? Math.abs(diff) + ' s sous l\'objectif' : diff + ' s au-dessus de l\'objectif') : '') + '</p></div>'
      + '<div class="lv-card"><div class="lv-ci ' + (off ? 'ok' : 'warn') + '"><span class="lv-ico">' + LV_ICO[off ? 'ok' : 'warn'] + '</span><span class="lv-ct"><b>Temps officiel</b><small>'
      + (rp && rp.official ? 'Saisi · rejeu prêt pour tes amis' : off ? 'Saisi · affiché sur la page des amis' : S && S.done ? 'Course validée : saisis ton temps final ci-dessous' : 'Valide ta course avec ton temps officiel') + '</small></span>'
      + (!off && S && !S.done ? '<button type="button" class="lv-fix" onclick="liveOfficialOpen()">Saisir</button>' : '') + '</div>'
      + '<div class="lv-ci ok"><span class="lv-ico">' + LV_ICO.ok + '</span><span class="lv-ct"><b>Page des amis</b><small>Ton résultat y est affiché' + (rp && rp.official ? ', avec le rejeu' : '') + '</small></span><button type="button" class="lv-fix" onclick="liveShareLink()">Partager</button></div></div>'
      // temps final saisi à la main (puce) : remplace le chrono du suivi partout (panneau, page des amis, prépa, records)
      + '<div class="lv-card"><p class="lv-h">Temps final</p>'
      + '<div class="lv-row2" style="align-items:flex-end;"><label class="lv-lab">Ton temps (puce)<input id="lv-final" type="text" inputmode="numeric" placeholder="41:50" value="' + (off ? _liveClock(off) : '') + '" oninput="_liveFmtTimeInput(this)"></label>'
      + '<button type="button" class="lv-btn lv-go" style="flex:1" onclick="liveSetFinal()">' + (off ? 'Corriger' : 'Enregistrer') + '</button></div>'
      + '<p class="lv-note">Tape seulement les chiffres : 4255 → 42:55 · 13512 → 1:35:12</p></div>';
  }
  if(box.dataset.h !== h){ box.innerHTML = h; box.dataset.h = h; }
}
// temps en « 42:55 » ou « 1:35:12 » (sans 0 devant les minutes d'une course de moins d'une heure)
function _liveClock(ms){ const t = Math.round(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), x = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); }
// Temps final saisi après l'arrivée : fiche /live (page des amis, rejeu), séance « course » validée (temps officiel, prépa, records)
async function liveSetFinal(){
  const el = document.getElementById('lv-final'), ms = _liveParseTime(el && el.value);
  if(!ms){ alert('Temps invalide. Tape seulement les chiffres : 4255 = 42:55 · 13512 = 1:35:12'); return; }
  const L = _liveVal || {}, sec = Math.round(ms / 1000), txt = _liveClock(ms);
  const up = { 'race/final': sec };
  if(L.race && L.race.replay) up['race/replay/official'] = sec;
  if(L.startedAt){ up.finishedAt = L.startedAt + ms; up['passages/finish'] = L.startedAt + ms; }
  if(!L.status || L.status === 'running') up.status = 'finished';
  try { await _liveRef.update(up); } catch(e) { alert('Enregistrement impossible (réseau). Réessaie.'); return; }
  // séance « course » déjà validée : temps officiel corrigé (fiche de la prépa, records, rejeu)
  const S = _liveRaceSession();
  if(S && S.done){
    const k = 'extra_w' + S.w + '_s' + S.ei;
    try { const p = JSON.parse(state[k + '_perf'] || '{}'); p.official = txt; state[k + '_perf'] = JSON.stringify(p); save(); } catch(e) { diagSilent(e, 'race-live:liveSetFinal'); }
    if(typeof prepSaveRaceResult === 'function'){ try { await prepSaveRaceResult(txt, SuiviRace.date || null); } catch(e) { diagSilent(e, 'race-live:liveSetFinal'); } }
    if(typeof sessionChanged === 'function') sessionChanged({ race: true });
  } else if(!S && SuiviRace.date) {
    // prépa déjà terminée (la suivante est ouverte) : temps corrigé dans Mes prépas (fiche + copie figée), records relus
    try { await _liveFixArchivedPrep(SuiviRace.date, txt); } catch(e) { diagSilent(e, 'race-live:liveSetFinal'); }
  }
  if(typeof showToast === 'function') showToast('Temps final enregistré : ' + txt, '🏁');
  _liveAfterRender();
}
async function _liveFixArchivedPrep(date, txt){
  if(typeof _prepRef !== 'function') return;
  const idx = (await _prepRef('prep_index').once('value')).val() || {};
  const id = Object.keys(idx).find(function(k){ return idx[k] && idx[k].date === date; }); if(!id) return;
  const snap = (await _prepRef('preps/' + id).once('value')).val() || {}, up = { ['prep_index/' + id + '/result']: txt, ['prep_index/' + id + '/debrief']: null };   // bilan refait
  Object.keys(snap).forEach(function(k){
    if(!/^extra_w\d+_s\d+$/.test(k) || !snap[k + '_done']) return;
    let x; try { x = JSON.parse(snap[k]); } catch(e) { return; }
    if(!x || x.type !== 'race' || x._season || x.sched_date !== date) return;
    let p = {}; try { p = JSON.parse(snap[k + '_perf'] || '{}'); } catch(e) {}
    p.official = txt; up['preps/' + id + '/' + k + '_perf'] = snap[k + '_perf'] = JSON.stringify(p);
  });
  // analyse de la course refaite avec le bon temps (fiche de la prépa + carte de l'accueil)
  const A = typeof raFromSnap === 'function' ? raFromSnap(snap, Object.assign({}, idx[id], { result: txt })) : null;
  if(A){
    up['prep_index/' + id + '/ra'] = A;
    if(state._race_analysis && state._race_analysis.date === date){ state._race_analysis = A; save(); }
  }
  await firebase.database().ref('users/' + _prepUid()).update(up);
  if(typeof _prepIndex !== 'undefined' && _prepIndex && _prepIndex[id]){ _prepIndex[id].result = txt; delete _prepIndex[id].debrief; }
  if(typeof _prepSnapCache !== 'undefined') delete _prepSnapCache[id];
  if(typeof prPrefetch === 'function') await prPrefetch();
  if(typeof sessionChanged === 'function') sessionChanged();
}
// style « Piste de nuit » du panneau, dans tous les thèmes (feuille marquée data-th : jamais convertie par l'adaptateur sombre)
function _liveCss(){
  if(document.getElementById('lv-css')) return;
  const st = document.createElement('style'); st.id = 'lv-css'; st.dataset.th = '1';
  const BS = "'Big Shoulders Display',Manrope,system-ui,sans-serif", X = '#live-panel ';
  st.textContent = X + '.lv-box{background:#0B1122!important;color:#EEF1F8!important;border:none!important;box-shadow:0 -18px 40px rgba(0,0,0,.5)!important;font-family:Manrope,system-ui,sans-serif;}'
    + X + '.modal-scroll-body{background:#0B1122!important;}'
    + X + '.lv-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 18px 12px;flex-shrink:0;}'
    + X + '.lv-hd{display:flex;flex-direction:column;gap:4px;min-width:0;}'
    + X + '.lv-eb{margin:0;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#7C87A3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + X + '.lv-title{margin:0;font-size:24px;font-weight:800;letter-spacing:-.02em;color:#EEF1F8;}'
    + X + '.lv-pill{align-self:flex-start;margin-top:4px;display:inline-flex;align-items:center;gap:7px;padding:5px 12px;border-radius:999px;font-size:13px;font-weight:700;background:#111A2E;color:#9AA4BF;box-shadow:inset 0 0 0 1px #1E2944;}'
    + X + '.lv-pill::before{content:"";width:8px;height:8px;border-radius:50%;background:currentColor;}'
    + X + '.lv-pill.run{color:#6EE7A0;}' + X + '.lv-pill.fin{color:#F2C14E;}'
    + X + '.lv-x{width:44px;height:44px;border-radius:50%;border:1px solid #1E2944;background:transparent;color:#9AA4BF;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;padding:0;}'
    + X + '.lv-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;margin:0 18px 6px;padding:4px;border-radius:16px;background:#0A1020;box-shadow:inset 0 0 0 1px #1E2944;flex-shrink:0;}'
    + X + '.lv-tabs button{min-height:40px;border:none;border-radius:12px;background:transparent;color:#9AA4BF;font:inherit;font-size:14px;font-weight:700;cursor:pointer;}'
    + X + '.lv-tabs button.on{background:#1C2645;color:#EEF1F8;box-shadow:0 4px 12px rgba(0,0,0,.35);}'
    + X + '.lv-body{padding:10px 18px 24px;display:flex;flex-direction:column;gap:14px;}'
    + X + '.lv-sec{display:flex;flex-direction:column;gap:14px;}' + X + '.lv-sec[hidden]{display:none!important;}'
    + X + '.lv-card{background:#111A2E!important;border:none!important;border-radius:20px!important;padding:16px!important;box-shadow:0 8px 22px rgba(0,0,0,.35)!important;display:flex;flex-direction:column;gap:8px;}'
    + X + '.lv-h{margin:0;font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#C9D1E4!important;}'
    + X + '.lv-ch{display:flex;align-items:baseline;justify-content:space-between;gap:10px;}'
    + X + '.lv-cnt{font-size:13px;font-weight:700;color:#F2C14E;}' + X + '.lv-cnt.all{color:#6EE7A0;}'
    + X + '.lv-note{margin:0;font-size:13px;line-height:1.45;color:#9AA4BF!important;}'
    + X + '.lv-cheers{display:flex;flex-direction:column;}' + X + '.lv-cm{display:flex;flex-direction:column;gap:3px;padding:10px 0;border-bottom:1px solid #1E2944;}' + X + '.lv-cm:last-child{border-bottom:none;}'
    + X + '.lv-cm p{margin:0;display:flex;justify-content:space-between;gap:10px;font-size:14px;color:#EEF1F8;}' + X + '.lv-cm small{font-size:12px;color:#7C87A3;white-space:nowrap;}'
    + X + '.lv-cm span{font-size:15px;line-height:1.4;color:#DCE2EF;overflow-wrap:anywhere;}'
    + X + '.lv-cm p{align-items:center;}' + X + '.lv-cm b{flex:1;min-width:0;}'
    + X + '.lv-cdel{flex:none;width:32px;height:32px;margin:-6px -6px -6px 0;border:none;border-radius:50%;background:transparent;color:#7C87A3;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;}'
    + X + '.lv-strong{color:#EEF1F8!important;font-weight:700;}' + X + '.lv-ok{color:#6EE7A0!important;}' + X + '.lv-bad{color:#F28B6E!important;}'
    + X + '.lv-ci{display:flex;align-items:center;gap:12px;min-height:52px;border-bottom:1px solid #1E2944;}' + X + '.lv-ci:last-child{border-bottom:none;}'
    + X + '.lv-ico{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;}'
    + X + '.lv-ci.ok .lv-ico{background:rgba(63,207,127,.16);color:#6EE7A0;}' + X + '.lv-ci.warn .lv-ico{background:rgba(242,193,78,.16);color:#F2C14E;}' + X + '.lv-ci.bad .lv-ico{background:rgba(242,139,110,.16);color:#F28B6E;}'
    + X + '.lv-ct{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}' + X + '.lv-ct b{font-size:15px;font-weight:700;color:#EEF1F8;}' + X + '.lv-ct small{font-size:13px;color:#9AA4BF;line-height:1.35;}'
    + X + '.lv-fix{flex-shrink:0;min-height:36px;border-radius:18px;border:1px solid #2A3A63;background:transparent;color:#EEF1F8;font:inherit;font-size:13px;font-weight:700;padding:0 14px;cursor:pointer;}'
    + X + '.lv-acts{display:flex;flex-direction:column;gap:10px;}' + X + '.lv-acts:empty{display:none;}'
    + X + '.lv-btn{display:block;width:100%;box-sizing:border-box;min-height:48px;border-radius:24px!important;padding:12px 16px;font:inherit;font-size:15px;font-weight:800;cursor:pointer;text-align:center;text-decoration:none;}'
    + X + '.lv-go{background:#E0603A!important;color:#1A0A04!important;border:none!important;}' + X + '.lv-big{min-height:56px;font-size:17px;}'
    + X + '.lv-fin{background:#3FCF7F!important;color:#05210F!important;border:none!important;}'
    + X + '.lv-ghost{background:transparent!important;color:#EEF1F8!important;border:1px solid #2A3A63!important;}'
    + X + '.lv-danger{background:transparent!important;color:#F28B6E!important;border:1px solid rgba(242,139,110,.4)!important;}'
    + X + '.lv-link{margin-top:2px;}'
    + X + '.lv-live{display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:18px 20px;border-radius:24px;background:linear-gradient(160deg,#1C2645,#141D36);box-shadow:0 14px 34px rgba(0,0,0,.45);}'
    + X + '.lv-live span{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#7C87A3;}'
    + X + '.lv-live b{font-family:' + BS + ';font-weight:800;font-size:60px;line-height:.95;color:#EEF1F8;font-variant-numeric:tabular-nums;}'
    + X + '.lv-adj{display:flex;gap:8px;margin-top:8px;width:100%;}' + X + '.lv-adj button{flex:1;min-height:44px;border-radius:22px;border:1px solid #2A3A63;background:transparent;color:#EEF1F8;font:inherit;font-size:15px;font-weight:800;cursor:pointer;touch-action:manipulation;}'
    + X + '.lv-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}' + X + '.lv-wide{grid-column:1/-1;}'
    + X + '.lv-stat{background:#111A2E!important;border:none!important;border-radius:18px;padding:12px 14px;box-shadow:0 8px 22px rgba(0,0,0,.35);}' + X + '.lv-stat span{display:block;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#7C87A3;}'
    + X + '.lv-stat b{display:block;margin-top:4px;font-family:' + BS + ';font-weight:800;font-size:26px;color:#EEF1F8;font-variant-numeric:tabular-nums;}'
    + X + '.lv-warn{border-radius:18px;padding:12px 14px;background:rgba(242,193,78,.10);box-shadow:inset 0 0 0 1px rgba(242,193,78,.4);font-size:13px;line-height:1.45;color:#F2E6C8;}'
    + X + '.lv-row2{display:flex;gap:8px;}'
    + X + '.lv-lab{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;color:#9AA4BF!important;}'
    + X + '.lv-lab input,' + X + '.lv-in{width:100%;min-width:0;box-sizing:border-box;font:inherit;font-size:17px;padding:11px 12px;border-radius:14px;border:1px solid #1E2944!important;background:#0A1020!important;color:#EEF1F8!important;}'
    + X + '.lv-chips{display:flex;flex-wrap:wrap;gap:6px;}' + X + '.lv-chip{border:1px solid #2A3A63!important;background:transparent!important;color:#C9D1E4!important;border-radius:999px;padding:7px 12px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;}'
    + X + '.lv-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid #1E2944!important;font-size:13px;color:#C9D1E4!important;}' + X + '.lv-row b{color:#EEF1F8!important;min-width:58px;}'
    + X + '.lv-row span{flex:1;font-variant-numeric:tabular-nums;}' + X + '.lv-row button{border:none;background:none;color:#7C87A3!important;font-size:16px;cursor:pointer;}'
    + X + '.lv-more{display:flex;flex-direction:column;gap:12px;}' + X + '.lv-more>summary{list-style:none;cursor:pointer;min-height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 4px;font-size:15px;font-weight:700;color:#C9D1E4;}'
    + X + '.lv-more>summary::-webkit-details-marker{display:none;}' + X + '.lv-more>summary::after{content:"›";font-size:22px;color:#7C87A3;transition:transform .2s;}' + X + '.lv-more[open]>summary::after{transform:rotate(90deg);}'
    + X + '.lv-more[open]{gap:12px;}' + X + '.lv-more>.lv-card{margin-top:10px;}'
    + X + '.lv-res{align-items:flex-start;}' + X + '.lv-eb2{margin:0;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#E0603A;}'
    + X + '.lv-big-t{font-family:' + BS + ';font-weight:800;font-size:56px;line-height:1;color:#EEF1F8;font-variant-numeric:tabular-nums;}'
    + X + 'button:focus-visible,' + X + 'summary:focus-visible,' + X + 'a:focus-visible{outline:2px solid #E0603A;outline-offset:2px;}'
    + '@media (prefers-reduced-motion:reduce){' + X + '.lv-more>summary::after{transition:none;}}';
  document.head.appendChild(st);
}

async function liveStart(hm, test){
  const tap = _liveNow();                                 // heure de l'appui (comme la montre), avant toute confirmation
  const L = _liveVal, at = hm ? suiviFmt.planned(hm) : null;
  // course en cours ou terminée : l'heure saisie règle seulement le départ (retard, alignement sur la montre)
  if((L.status === 'running' || L.status === 'finished') && L.startedAt && !L.test && hm){
    if(!confirm('Régler le départ à ' + suiviFmt.hhmmss(at) + ' (le chrono et les allures sont recalculés) ?')) return;
    await _liveRef.update({ startedAt: at }); return;
  }
  const real = L.startedAt && !L.test && L.status !== 'idle';           // une vraie course est déjà enregistrée
  const msg = test ? 'Lancer un essai ? La page de suivi affichera « Essai ».'
    : real ? 'Une course est déjà enregistrée. La redémarrer à ' + suiviFmt.hhmmss(at || tap) + ' et effacer la trace ?'
    : 'Démarrer la course à ' + suiviFmt.hhmmss(at || tap) + (at ? '' : ' (heure de votre appui)') + ' ?' + (L.test ? ' L\'essai en cours est effacé.' : '') + ' Le suivi devient visible par tous.';
  if(!confirm(msg)) return;
  if(test && _liveVal.race) _liveRef.child('race/testedAt').set(tap).catch(function(){});   // liste de contrôle : essai fait
  await _liveRef.update({ status: 'running', test: test ? true : null, noAuto: null, rid: tap, startedAt: at || tap, finishedAt: null, passages: null, track: null, pos: null, s0: null, s0t: null, splits: null });
}
// « Régler le chrono » : une heure doit être saisie (sinon on n'efface rien)
function liveStartAt(){
  const v = document.getElementById('lv-start').value;
  if(!v){ alert('Saisissez l\'heure du départ (ex. 9:16).'); return; }
  liveStart(v);
}
// − / + sous le chrono : cale le temps de course sur la montre, seconde par seconde (déplace l'heure de départ)
async function liveNudge(sec){
  const L = _liveVal;
  if(L.status !== 'running' || !L.startedAt) return;
  L.startedAt = Math.min(_liveNow(), L.startedAt - sec * 1000);       // + 1 s → départ 1 s plus tôt
  _liveRender();
  await _liveRef.update({ startedAt: L.startedAt });
}
async function liveFinish(){
  if(!confirm('Déclarer l\'arrivée maintenant ? (Vous pourrez saisir le temps officiel ensuite : km ' + suiviKmLabel(suiviOff()) + '.)')) return;
  const t = _liveNow(), up = { status: 'finished', finishedAt: t };
  if(!(_liveVal.passages && _liveVal.passages.finish)) up['passages/finish'] = t;
  await _liveRef.update(up);
}
async function liveCancel(){
  if(!confirm('Annuler ? Le chrono, la trace et les pointages sont effacés ; la page de suivi revient à « Pas encore parti ».')) return;
  // annulation volontaire le jour J après 9h15 : pas de redémarrage automatique par le serveur
  const noAuto = !_liveVal.test && _liveNow() >= suiviFmt.planned(SuiviRace.start) && _liveNow() < suiviFmt.planned(SuiviRace.start) + 5 * 3600000 ? true : null;
  await _liveRef.update({ status: 'idle', test: null, rid: null, startedAt: null, finishedAt: null, passages: null, track: null, pos: null, s0: null, s0t: null, splits: null, noAuto: noAuto });
}
// OwnTracks : configuration générée par la fonction owntracksToken (clé secrète, réservée à l'admin)
async function liveOwnTracks(){
  try {
    const tok = await firebase.auth().currentUser.getIdToken();
    const r = await fetch(FUNCTIONS_BASE + '/owntracksToken', { headers: { Authorization: 'Bearer ' + tok } });
    if(!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    document.getElementById('lv-ot-url').value = j.url;
    document.getElementById('lv-ot-man').hidden = false;
    // OwnTracks refuse l'import par lien (« URI or file configuration not allowed ») : on copie l'URL
    if(navigator.clipboard) navigator.clipboard.writeText(j.url).then(function(){ alert('URL copiée. Collez-la dans OwnTracks › Settings › URL (mode HTTP, authentification désactivée).'); }, function(){});
  } catch(e) { alert('Impossible d\'obtenir la configuration OwnTracks (' + e.message + ').'); }
}
function liveCopyOt(){
  const i = document.getElementById('lv-ot-url'); i.select();
  if(navigator.clipboard) navigator.clipboard.writeText(i.value).then(function(){ alert('URL copiée.'); }, function(){}); else document.execCommand('copy');
}
// Test OwnTracks : dernier contact, mode (m = 2 → Move), fréquence, puis attente d'une nouvelle position en direct
let _liveTest = null;
const _OT_MODES = { '-1': 'Quiet', '0': 'Manual', '1': 'Significant', '2': 'Move' };
function liveTestOt(){
  const o = _liveVal.ota || {};
  _liveTest = { start: _liveNow(), ts0: o.ts || 0, got: null };
  _liveTestRender();
}
function _liveTestRender(){
  const box = document.getElementById('lv-test'); if(!box || !_liveTest) return;
  box.hidden = false;
  const o = _liveVal.ota || {}, t = _liveNow(), T = _liveTest;
  if(!T.got && o.ts && o.ts > T.ts0) T.got = o.ts;
  const waited = Math.round((t - T.start) / 1000), WAIT = 120;
  const row = function(ok, label, txt){ return '<div class="lv-row"><b style="min-width:22px;">' + (ok === null ? '⏳' : ok ? '✅' : '❌') + '</b><span><b class="lv-strong">' + label + '</b> · ' + txt + '</span></div>'; };
  const age = o.ts ? t - o.ts : null, gap = o.ts && o.prev ? Math.round((o.ts - o.prev) / 1000) : null;
  let h = '';
  h += row(age !== null && age < 300000, 'Liaison', age === null ? 'aucune position jamais reçue : vérifiez l\'URL dans OwnTracks' : 'dernière position reçue ' + suiviFmt.ago(age));
  const mode = o.m === undefined || o.m === null ? null : _OT_MODES[String(o.m)] || ('mode ' + o.m);
  // le mode n'est connu qu'au moment d'un envoi : il n'est validé que par une position reçue pendant le test
  const lastMode = mode === null ? 'inconnu' : mode;
  if(T.got) h += row(o.m === 2, 'Mode', mode + (o.m === 2 ? ' (confirmé)' : ' : passez en « Move » en haut de la carte OwnTracks'));
  else if(waited < WAIT) h += row(null, 'Mode', 'confirmation en attente (dernier mode connu : ' + lastMode + ')');
  else h += row(false, 'Mode', 'non confirmé : OwnTracks est peut-être en « Quiet » ou « Manual », ou fermée (dernier mode connu : ' + lastMode + ')');
  if(gap !== null) h += '<div class="lv-row"><b style="min-width:22px;">ℹ️</b><span><b class="lv-strong">Fréquence</b> · ' + gap + ' s entre les deux dernières positions (à l\'arrêt, OwnTracks espace les envois ; en course : environ 1 par minute)</span></div>';
  h += row(typeof o.acc === 'number' ? o.acc <= 50 : null, 'Précision GPS', typeof o.acc === 'number' ? o.acc + ' m' : '–');
  h += row(typeof o.batt === 'number' ? o.batt >= 50 : null, 'Batterie', typeof o.batt === 'number' ? o.batt + ' %' + (o.batt < 50 ? ' : rechargez avant la course' : '') : '–');
  if(T.got) h += row(true, 'En direct', 'nouvelle position reçue pendant le test (' + Math.round((T.got - T.start) / 1000) + ' s après le lancement) 🎉');
  else if(waited < WAIT) h += row(null, 'En direct', 'en attente d\'une nouvelle position… ' + (WAIT - waited) + ' s. Pour accélérer : dans OwnTracks, touchez l\'icône d\'envoi (carré avec flèche, en haut à droite) ou marchez un peu.');
  else h += row(false, 'En direct', 'aucune nouvelle position en ' + WAIT + ' s. Ouvrez OwnTracks : mode « Move » (pas Quiet ni Manual), application non fermée, Réglages iPhone › OwnTracks › Position « Toujours ». Puis relancez le test.');
  const allOk = T.got && o.m === 2 && age !== null && age < 300000;
  h += '<p class="lv-note' + (allOk ? ' lv-ok' : '') + '" style="margin-top:8px;font-weight:700;">' + (allOk ? '✅ Tout fonctionne : tu peux verrouiller l\'iPhone.' : T.got || waited >= WAIT ? 'Corrige les points ❌ puis relance le test.' : '') + '</p>';
  box.innerHTML = h;
  if(T.got || waited >= WAIT){ if(waited >= WAIT || T.got) _liveTest.done = true; }
}
async function liveDelSplit(k){ if(confirm('Supprimer ce pointage ?')) await _liveRef.child('splits/' + k).remove(); }

// Pointage officiel : km + temps de course
async function liveSaveSplit(){
  const L = _liveVal;
  const km = parseFloat(String(document.getElementById('lv-km').value).replace(',', '.'));
  const el = _liveParseTime(document.getElementById('lv-t').value);
  const offKm = suiviOff() / 1000;
  if(!(km > 0 && km <= offKm + 0.15)){ alert('Km invalide (entre 0 et ' + suiviKmLabel(suiviOff()) + ').'); return; }
  if(!el){ alert('Temps invalide. Tapez les chiffres : 1458 = 14:58 · 14823 = 1:48:23'); return; }
  if(!L.startedAt || L.status === 'idle'){
    if(!confirm('La course n\'est pas démarrée. La démarrer avec ce pointage (départ = maintenant − ' + suiviFmt.dur(el) + ') ?')) return;
    await _liveRef.update({ status: 'running', test: null, noAuto: null, rid: _liveNow(), startedAt: _liveNow() - el, finishedAt: null, passages: null, track: null, pos: null, s0: null, s0t: null, splits: null });
    L.startedAt = _liveNow() - el; L.status = 'running'; L.passages = null; L.pos = null;
  }
  // cohérence avec le plan PacePro : allure du tronçon depuis le pointage précédent (ou le départ) et jusqu'au suivant
  let lo = { km: 0, el: 0 }, hi = null;
  if(L.splits) Object.keys(L.splits).forEach(function(k){ const x = L.splits[k]; if(x.km < km - 0.01 && x.km > lo.km) lo = x; if(x.km > km + 0.01 && (!hi || x.km < hi.km)) hi = x; });
  const warn = [], kmTxt = function(k){ return k ? 'km ' + String(+k.toFixed(3)).replace('.', ',') : 'départ'; };
  const chk = function(a, b){
    const pc = (b.el - a.el) / 1000 / (b.km - a.km), B = SuiviPlan.bounds(a.km * 1000, b.km * 1000);
    if(!(pc >= B.min && pc <= B.max)) warn.push(kmTxt(a.km) + ' → ' + kmTxt(b.km) + ' : ' + (pc > 0 ? suiviFmt.pace(pc) : 'temps incohérent') + ' (plan ' + suiviFmt.pace(B.plan) + ')');
  };
  chk(lo, { km: km, el: el }); if(hi) chk({ km: km, el: el }, hi);
  if(warn.length && !confirm('⚠️ Allure très éloignée de votre plan :\n' + warn.join('\n') + '\n\nErreur de saisie ? Annuler pour corriger, OK pour enregistrer quand même.')) return;
  const ts = L.startedAt + el;
  const up = {};
  up['splits/k' + String(Math.round(km * 1000)).padStart(5, '0')] = { km: km, el: el, ts: ts };
  // points de passage correspondants (le km 30 est devant la maison, ≈ km 29,4)
  SuiviRace.points.forEach(function(pt){
    const ptKm = pt.s * SuiviGeo.scale / 1000;
    if(Math.abs(km - pt.km) < 0.35 || Math.abs(km - ptKm) < 0.35) up['passages/' + pt.id] = ts;
  });
  if(km >= offKm - 0.1){ up.status = 'finished'; up.finishedAt = ts; up['passages/finish'] = ts; }
  // le pointage reste l'ancrage du calcul (suiviCalc) : la position GPS n'est pas écrasée
  await _liveRef.update(up);
  document.getElementById('lv-km').value = ''; document.getElementById('lv-t').value = '';
}

// bouton de l'accueil (admin) : visible tout le jour de la course (avant le départ pour démarrer le suivi des amis,
// pendant la course, et jusqu'à 6 h après l'arrivée), et à tout moment pendant une course ou un essai lancé
function liveHomeView(L, now, prepDate){
  L = L || {};
  const st = L.status || 'idle', d = new Date(now);
  const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const race = L.race || {};
  // course lancée : bouton tant qu'elle dure (12 h au plus — « Je suis arrivé » oublié : il ne reste pas affiché les jours suivants)
  if(st === 'running' && (!L.startedAt || now - L.startedAt < 12 * 3600000)) return { show: true, run: true, sub: L.test ? 'Essai en cours' : 'En course · ' + (typeof suiviCalc !== 'undefined' && (L.pos || L.splits) ? suiviFmt.km(suiviCalc(L, now).d) + ' km' : 'chrono lancé') };
  if(st === 'finished' && L.finishedAt && now - L.finishedAt < 6 * 3600000 && !L.test)
    return { show: true, sub: race.replay ? 'Arrivé ✔ · résultat partagé avec tes amis' : 'Arrivé ✔ · saisis ton temps officiel' };
  // jour de la course suivie (/live/race) ou de la course de la prépa en cours (pas encore préparée pour le suivi) ; sinon rien
  const raceDay = race.id && race.date === today;
  if(!raceDay && prepDate !== today) return { show: false, sub: '' };
  const hm = raceDay && /^\d{1,2}:\d{2}$/.test(race.start || '') ? race.start.replace(':', 'h') : '';
  const n = raceDay ? (+L.cheers || 0) : 0;
  return { show: true, day: true, sub: (raceDay ? (hm ? 'Départ ' + hm + ' · ' : '') + 'Démarrer le suivi de tes amis' : 'Prépare le suivi de tes amis') + (n ? ' · ' + n + ' 💬' : '') };
}
function _liveRenderHomeBtn(){
  const b = document.getElementById('home-live-btn'); if(!b) return;
  let pd = '';
  try { pd = typeof prepRace === 'function' ? prepRace().date || '' : ''; } catch(e) { diagSilent(e, 'race-live:_liveRenderHomeBtn'); }
  const V = liveHomeView(_liveVal, _liveNow(), pd);
  b.style.display = isAdmin() && V.show ? 'flex' : 'none';
  // Piste de nuit : le bouton est rangé dans #ph-blocks, masqué s'il était vide au dernier rendu de l'accueil → réaffiché ici
  const pb = b.parentElement;
  if(pb && pb.id === 'ph-blocks') pb.style.display = [].some.call(pb.children, function(c){ return getComputedStyle(c).display !== 'none'; }) ? '' : 'none';
  const sub = document.getElementById('home-live-sub');
  if(sub && sub.textContent !== V.sub) sub.textContent = V.sub || 'Démarrer, pointages officiels, suivi des amis';
}
function initLiveHomeBtn(){
  const b = document.getElementById('home-live-btn'); if(!b) return;
  if(typeof firebase === 'undefined'){ b.style.display = 'none'; return; }      // mode aperçu hors ligne
  // visible sur l'accueil le jour de la course et pendant une course lancée (sinon : Compte) — état connu réappliqué à chaque rafraîchissement
  // de l'accueil (avant : masqué à chaque renderHome, et ne revenait qu'au prochain changement de /live)
  if(window._liveHomeListen && typeof _liveVal !== 'undefined' && _liveVal){ _liveRenderHomeBtn(); return; }
  b.style.display = 'none';
  if(!isAdmin() || window._liveHomeListen || typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return;
  window._liveHomeListen = true;
  _liveLoadCore().then(function(){
    if(!_liveRef) _liveRef = firebase.database().ref('live');
    _liveRef.on('value', function(s){ _liveVal = s.val() || {}; _liveInfoFix(); _liveSyncRace(_liveVal.race); liveCheersWatch(); _liveRenderHomeBtn(); });
  }).catch(function(){});
}

// ─── Encouragements des amis (page /suivi-guillaume → fonction liveCheer → /live_cheers/<course>, lu par l'admin) ───
// Notification sur le téléphone (écran verrouillé, montre) envoyée par le serveur ; app ouverte : message affiché et lu à voix haute.
let _liveCheers = {}, _liveCheerRid = null, _liveCheerRef = null, _liveCheerT0 = 0;
function liveCheerRid(r){ return r && r.id ? String(r.id).replace(/[.#$\[\]\/]/g, '_') : null; }
function liveCheerVoiceOn(){ try { return localStorage.getItem('pm_cheer_voice') !== '0'; } catch(e) { return true; } }
function liveCheerVoice(){ try { localStorage.setItem('pm_cheer_voice', liveCheerVoiceOn() ? '0' : '1'); } catch(e) {} _liveCheersRender(true); }
// phrase lue : « Message de Marie : Allez Guillaume ! » (émojis retirés)
function liveCheerSpeech(m){
  const t = String((m && m.t) || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();
  return t ? (m.n ? 'Message de ' + m.n + ' : ' : 'Un message : ') + t : '';
}
function liveCheersWatch(){
  if(!isAdmin() || typeof firebase === 'undefined') return;
  const rid = liveCheerRid(_liveVal && _liveVal.race);
  if(rid === _liveCheerRid) return;
  if(_liveCheerRef) _liveCheerRef.off();
  _liveCheers = {}; _liveCheerRid = rid; _liveCheerRef = null; _liveCheerT0 = Date.now();
  if(!rid) return;
  _liveCheerRef = firebase.database().ref('live_cheers/' + rid);
  _liveCheerRef.on('child_added', function(sn){
    const m = sn.val(); if(!m) return;
    _liveCheers[sn.key] = m;
    // nouveau message (pas l'historique relu à l'ouverture) : affiché, et lu si l'app est au premier plan
    if((m.at || 0) > _liveCheerT0 - 5000 && document.visibilityState === 'visible'){
      if(typeof showToast === 'function') showToast((m.n ? m.n + ' : ' : '') + m.t, '💬');
      if(liveCheerVoiceOn() && window.speechSynthesis){ try {
        const u = new SpeechSynthesisUtterance(liveCheerSpeech(m)); u.lang = 'fr-FR';
        const v = speechSynthesis.getVoices().filter(function(x){ return /^fr/i.test(x.lang); })[0]; if(v) u.voice = v;
        speechSynthesis.speak(u);
      } catch(e) {} }
    }
    _liveCheersRender();
  });
  _liveCheerRef.on('child_removed', function(sn){ if(sn && sn.key && _liveCheers[sn.key]){ delete _liveCheers[sn.key]; _liveCheersRender(); } });
}
// supprimer un message (essai, message déplacé) : retiré de la liste et du compteur de la page des amis
function liveCheerDel(id){
  if(!_liveCheerRid || !_liveCheers[id] || !confirm('Supprimer ce message ?')) return;
  delete _liveCheers[id]; _liveCheersRender();
  const db = firebase.database();
  db.ref('live_cheers/' + _liveCheerRid + '/' + id).remove().catch(function(e){ diagSilent(e, 'race-live:liveCheerDel'); });
  db.ref('live/cheers').transaction(function(n){ return Math.max(0, (+n || 0) - 1); }).catch(function(e){ diagSilent(e, 'race-live:liveCheerDel'); });
}
function _liveCheersHtml(){
  const L = Object.keys(_liveCheers).map(function(k){ return Object.assign({ _id: k }, _liveCheers[k]); }).sort(function(a, b){ return (b.at || 0) - (a.at || 0); });
  const on = liveCheerVoiceOn();
  let h = '<div class="lv-ch"><p class="lv-h">💬 Encouragements</p><span class="lv-cnt">' + (L.length || '') + '</span></div>';
  if(!L.length) h += '<p class="lv-note">Pas encore de message. Tes amis t\'écrivent depuis la page de suivi : tu les reçois en notification, même en courant.</p>';
  else h += '<div class="lv-cheers">' + L.slice(0, 40).map(function(m){
      const hm = m.at ? new Date(m.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h') : '';
      return '<div class="lv-cm"><p><b>' + _prepEsc(m.n || 'Un ami') + '</b><small>' + hm + (m.el ? ' · ' + (m.el < 3600000 ? Math.max(1, Math.round(m.el / 60000)) + ' min' : suiviFmt.hm(m.el)) + ' de course' : '') + '</small>'
        + '<button type="button" class="lv-cdel" aria-label="Supprimer le message de ' + _prepEsc(m.n || 'un ami') + '" onclick="liveCheerDel(\'' + m._id + '\')"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></p><span>' + _prepEsc(m.t || '') + '</span></div>';
    }).join('') + (L.length > 40 ? '<p class="lv-note">+ ' + (L.length - 40) + ' autres</p>' : '') + '</div>';
  h += '<button type="button" class="lv-btn lv-ghost" aria-pressed="' + on + '" onclick="liveCheerVoice()">' + (on ? '🔊 Lus à voix haute quand l\'app est ouverte' : '🔇 Lecture à voix haute coupée') + '</button>';
  return h;
}
function _liveCheersRender(force){
  const boxes = document.querySelectorAll('#live-panel .lv-cheer-box'); if(!boxes.length) return;
  const h = _liveCheersHtml();
  boxes.forEach(function(b){
    b.hidden = !_liveCheerRid;
    if(force || b.dataset.h !== h){ b.innerHTML = h; b.dataset.h = h; }
  });
}

// ─── Course suivie : fiche /live/race (nom, date, départ, distance, tracé GPX, points de passage, rejeu) ───
// Sans fiche : Marathon Seine-Eure (suivi-data.js). Préparer une autre course archive le suivi précédent
// dans /live_archive/<id> (page /suivi-guillaume?course=<id>, bouton « Revoir » de Mes prépas).
const LIVE_PAGE = 'https://prepa-marathon.web.app/suivi-guillaume';
let _liveRaceSig = null;
function _liveSyncRace(r){
  if(typeof suiviUseRace !== 'function') return;
  const sig = r ? [r.id, r.official, r.start, r.date, r.target, r.place, (r.route || []).length, JSON.stringify(r.points || []), r.replay ? 1 : 0].join('|') : 'se';
  if(sig === _liveRaceSig) return;
  _liveRaceSig = sig; suiviUseRace(r || null);
  const n = document.getElementById('lv-race-name'); if(n) n.textContent = SuiviRace.name + ' · suivi en direct';
}
// distance officielle d'après la prépa : 10 km, semi 21,0975 km, marathon 42,195 km
function _liveOfficialFor(R){
  const c = String(R.course || '').toLowerCase();
  if(/semi/.test(c)) return 21097; if(/marathon/.test(c)) return 42195;
  const km = parseFloat(R.km) || 10; return Math.round(km * 1000);
}
// course de la prépa en cours : nom, date, heure de départ (séance « course »), objectif
function _livePrepRace(){
  if(typeof prepRace !== 'function') return null;
  const R = prepRace(); if(!R || !R.date) return null;
  let sess = null;
  Object.keys(state).forEach(function(k){ if(/^extra_w\d+_s\d+$/.test(k)){ try { const x = JSON.parse(state[k]); if(x.type === 'race' && (!sess || x.sched_date === R.date)) sess = x; } catch(e) {} } });
  const ob = state.onboarding || {};
  const id = ob._import || (String(R.name || 'course').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + R.date.slice(0, 4));
  return { id: id, name: R.name, date: R.date, start: (sess && sess.sched_time) || '09:00', official: _liveOfficialFor(R),
    target: typeof prepTimeSec === 'function' ? prepTimeSec(R.objectif) : null, prepId: state._prep_id || null };
}
function _liveRaceRender(){
  const box = document.getElementById('lv-race'); if(!box) return;
  const r = _liveVal.race || null, P = _livePrepRace(), st = _liveVal.status || 'idle';
  const day = function(d){ return d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : ''; };
  let h = '<p class="lv-h">La course suivie</p>'
    + '<p class="lv-note" style="margin:0 0 8px;"><b class="lv-strong">' + _prepEsc(SuiviRace.name) + '</b> · ' + day(SuiviRace.date) + ' · départ ' + suiviFmt.hhmmTxt(SuiviRace.start)
    + ' · ' + suiviKmLabel(suiviOff()) + ' km' + (SuiviGeo.has ? ' · tracé ✓' : ' · sans tracé (distance GPS)') + '</p>';
  // une autre course est au programme : proposer de préparer son suivi
  if(P && P.id !== SuiviRace.id && st !== 'running')
    h += '<button type="button" class="lv-btn lv-go" onclick="livePrepareRace()">Préparer le suivi de « ' + _prepEsc(P.name) + ' » (' + day(P.date) + ')</button>'
      + '<p class="lv-note" style="margin:6px 0 0;">Le suivi actuel est archivé : il reste visible avec son rejeu (Mes prépas › Revoir).</p>';
  if(r && st !== 'running'){
    const pts = SuiviRace.points.filter(function(p){ return p.id !== 'finish'; });
    h += '<div style="display:flex;gap:8px;margin-top:8px;"><label class="lv-lab">Départ<input id="lv-r-start" type="time" value="' + SuiviRace.start + '"></label>'
      + '<label class="lv-lab" style="flex:2;">Lieu de départ<input id="lv-r-place" type="text" placeholder="ex. Bois de Vincennes" value="' + _prepEsc(SuiviRace.place || '') + '"></label></div>'
      + '<button type="button" class="lv-btn lv-ghost" style="margin-top:6px;" onclick="liveSaveRaceInfo()">Enregistrer départ et lieu</button>'
      + (!SuiviGeo.has && liveRouteOf(r.id) ? '<button type="button" class="lv-btn lv-go" style="margin-top:8px;" onclick="liveUsePresetRoute()">🗺 Utiliser le tracé officiel (déjà dans l\'app)</button>' : '')
      + '<label class="lv-btn lv-ghost" style="margin-top:8px;text-align:center;cursor:pointer;">🗺 ' + (SuiviGeo.has ? 'Remplacer le tracé (GPX)' : 'Importer le tracé (fichier GPX)')
      +   '<input type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" style="display:none;" onchange="liveImportGpx(this)"></label>'
      + '<p class="lv-note" style="margin:6px 0 0;">' + (SuiviGeo.has ? 'Tracé de ' + (SuiviGeo.len / 1000).toFixed(2).replace('.', ',') + ' km : position projetée sur le parcours, arrivée détectée automatiquement.'
        : 'Sans tracé, la distance vient du GPS et c\'est toi qui déclares l\'arrivée. Le GPX se télécharge en général sur le site de la course.') + '</p>'
      + '<p class="lv-h" style="margin-top:12px;font-size:13px;">Points de passage (amis, ravitos)</p>'
      + (pts.length ? pts.map(function(p){ return '<div class="lv-row"><b>km ' + String(p.km).replace('.', ',') + '</b><span>' + _prepEsc(p.label || '') + (p.lieu ? ' · ' + _prepEsc(p.lieu) : '') + '</span><button aria-label="Supprimer" onclick="liveDelPoint(\'' + p.id + '\')">✕</button></div>'; }).join('') : '<p class="lv-note">Aucun point pour l\'instant.</p>')
      + '<div style="display:flex;gap:6px;margin-top:6px;"><label class="lv-lab" style="flex:0 0 72px;">Km<input id="lv-p-km" type="text" inputmode="decimal" placeholder="10"></label>'
      + '<label class="lv-lab" style="flex:2;">Nom<input id="lv-p-label" type="text" placeholder="RDV famille"></label></div>'
      + '<label class="lv-lab" style="margin-top:6px;">Lieu<input id="lv-p-lieu" type="text" placeholder="Place de la Bastille"></label>'
      + '<button type="button" class="lv-btn lv-ghost" style="margin-top:6px;" onclick="liveAddPoint()">＋ Ajouter le point</button>';
  }
  h += '<button type="button" class="lv-btn lv-ghost" style="margin-top:8px;" onclick="liveShareLink()">Envoyer le lien aux amis</button>';
  if(box.dataset.h !== h){ const keep = document.activeElement && box.contains(document.activeElement); if(!keep){ box.innerHTML = h; box.dataset.h = h; } }
}
function liveShareLink(){
  const url = LIVE_PAGE;
  if(_liveRef && _liveVal.race) _liveRef.child('race/sharedAt').set(_liveNow()).catch(function(){});   // liste de contrôle : lien envoyé
  if(navigator.share) navigator.share({ title: 'Suivi Guillaume · ' + SuiviRace.name, url: url }).catch(function(){});
  else if(navigator.clipboard) navigator.clipboard.writeText(url).then(function(){ alert('Lien copié : ' + url); }, function(){ prompt('Lien de suivi :', url); });
  else prompt('Lien de suivi :', url);
}
// tracés des courses déjà fournis (GPX de l'organisateur) : posés tout seuls à la préparation du suivi, sans import depuis le téléphone
const LIVE_ROUTES = {
  'novembrun-2026': [[48.87279,2.28507],[48.87358,2.29198],[48.87347,2.29214],[48.87193,2.27802],[48.87131,2.27768],[48.86612,2.27412],[48.8667,2.27168],[48.86687,2.27182],[48.86739,2.27042],[48.86776,2.26983],[48.86799,2.26911],[48.86798,2.26836],[48.86802,2.26792],[48.86775,2.26742],[48.86735,2.26689],[48.86706,2.26635],[48.86674,2.2659],[48.86661,2.26555],[48.86688,2.26548],[48.86786,2.2662],[48.86828,2.26587],[48.86854,2.2658],[48.86869,2.26552],[48.86863,2.26523],[48.86841,2.26505],[48.86847,2.26479],[48.86848,2.26438],[48.86838,2.26349],[48.86844,2.26264],[48.86808,2.26209],[48.86784,2.26152],[48.86762,2.26078],[48.8673,2.2603],[48.86692,2.25986],[48.86702,2.25972],[48.86739,2.25853],[48.86658,2.2543],[48.8668,2.25397],[48.86694,2.25362],[48.86705,2.25287],[48.86687,2.25264],[48.86633,2.25228],[48.86626,2.25174],[48.86619,2.25165],[48.86604,2.25169],[48.8658,2.25143],[48.86556,2.25106],[48.8655,2.25093],[48.86557,2.2508],[48.86541,2.2505],[48.86521,2.24959],[48.86538,2.24964],[48.86754,2.25111],[48.87185,2.26305],[48.87142,2.26308],[48.87051,2.2635],[48.87039,2.26214],[48.86979,2.26052],[48.86978,2.25992],[48.8697,2.25927],[48.86929,2.25876],[48.86916,2.25831],[48.86902,2.25817],[48.86884,2.25749],[48.8687,2.25721],[48.86861,2.25722],[48.86844,2.25657],[48.86817,2.25486],[48.86785,2.25482],[48.86791,2.25516],[48.86788,2.25569],[48.86795,2.25623],[48.86804,2.25658],[48.86838,2.25736],[48.86818,2.2581],[48.86832,2.25883],[48.86819,2.25965],[48.86827,2.25987],[48.86855,2.26018],[48.86865,2.26078],[48.86888,2.26158],[48.86895,2.26224],[48.86897,2.26302],[48.86962,2.26371],[48.86992,2.26434],[48.8699,2.26463],[48.87006,2.26517],[48.87035,2.26585],[48.87076,2.26638],[48.87135,2.26766],[48.87044,2.26859],[48.86974,2.26721],[48.86888,2.26582],[48.86868,2.26561],[48.86841,2.26591],[48.86828,2.2659],[48.86817,2.26629],[48.8682,2.26686],[48.86963,2.26985],[48.86966,2.27006],[48.86965,2.27055],[48.86932,2.2713],[48.86921,2.27184],[48.8687,2.2733],[48.86884,2.27347],[48.86861,2.27419],[48.87126,2.27621],[48.8714,2.2774],[48.87159,2.27659],[48.8718,2.2765],[48.87229,2.28099]]   // 10km Novemb'Run, 22 nov. 2026 (GPX RunninParis, 9,99 km)
};
// lieu et heure officiels (site de l'organisateur, paris.fr) : repris par la fiche du suivi
const LIVE_INFO = { 'novembrun-2026': { place: 'Jardins de l\'avenue Foch, Paris 16e', finishPlace: 'Jardins de l\'avenue Foch', start: '10:00' } };
// fiche déjà préparée avant que le lieu / l'heure officiels soient connus (Novemb'Run : 9h00, sans lieu) : mise à jour une fois,
// seulement avant le départ ; une modification faite ensuite à la main n'est plus retouchée (marque _info)
let _liveInfoBusy = false;
function _liveInfoFix(){
  const r = (_liveVal && _liveVal.race) || null, info = r && LIVE_INFO[r.id];
  if(!info || !_liveRef || _liveInfoBusy || (_liveVal.status || 'idle') === 'running' || _liveVal.startedAt) return;
  const mark = JSON.stringify(info); if(r._info === mark) return;
  if(typeof isAdmin === 'function' && !isAdmin()) return;
  const up = Object.assign({ _info: mark }, info);
  if(!(Array.isArray(r.route) && r.route.length > 1)){ const rt = liveRouteOf(r.id); if(rt) up.route = rt; }
  _liveInfoBusy = true;
  _liveRef.child('race').update(up).then(function(){ _liveInfoBusy = false; }, function(){ _liveInfoBusy = false; });
}
function liveRouteOf(id){ const r = LIVE_ROUTES[id]; return Array.isArray(r) && r.length > 1 ? r.map(function(p){ return p.slice(); }) : null; }
async function liveUsePresetRoute(){
  const r = _liveVal.race || {}, route = liveRouteOf(r.id); if(!route) return;
  const info = LIVE_INFO[r.id] || {}, up = { route: route };
  Object.keys(info).forEach(function(k){ if(!r[k] || k === 'start') up[k] = info[k]; });   // lieu et heure officiels s'ils manquent
  await _liveRef.child('race').update(up);
  if(typeof showToast === 'function') showToast('Tracé enregistré');
}
// fiche Seine-Eure pour l'archive (le tracé et les points viennent de suivi-data.js)
function _liveSeRace(){
  return { id: SUIVI_SE_ID, name: 'Marathon Seine-Eure', place: 'Amfreville-sur-Iton', date: SUIVI_DATA.date, start: SUIVI_DATA.start, official: SUIVI_DATA.official,
    route: SUIVI_DATA.route, points: SUIVI_DATA.points.map(function(p){ const q = Object.assign({}, p); delete q.s; return q; }), target: 13108 };
}
async function livePrepareRace(){
  const P = _livePrepRace(); if(!P) return;
  const cur = _liveVal || {}, oldId = (cur.race && cur.race.id) || SUIVI_SE_ID;
  if(!confirm('Préparer le suivi en direct de « ' + P.name + ' » ?\n\nLe suivi actuel (' + SuiviRace.name + ') est archivé avec son rejeu et reste consultable.')) return;
  try {
    const db = firebase.database(), up = {};
    if(cur.startedAt || cur.race){
      const arch = Object.assign({}, cur); delete arch.ota; delete arch.garmin;
      if(!arch.race) arch.race = _liveSeRace();
      await db.ref('live_archive/' + oldId).set(arch);
      // lien « Revoir » de la prépa archivée
      const idx = (await db.ref('users/' + firebase.auth().currentUser.uid + '/prep_index').once('value')).val() || {};
      Object.keys(idx).forEach(function(k){
        const it = idx[k];
        if((cur.race && cur.race.prepId === k) || (oldId === SUIVI_SE_ID && it.replay && /\/suivi-guillaume$/.test(it.replay)))
          up['users/' + firebase.auth().currentUser.uid + '/prep_index/' + k + '/replay'] = LIVE_PAGE + '?course=' + oldId;
      });
    }
    const route = liveRouteOf(P.id);                                       // tracé déjà fourni (LIVE_ROUTES)
    up['live'] = { status: 'idle', race: Object.assign({ place: '', points: [], createdAt: Date.now() }, P, LIVE_INFO[P.id] ? Object.assign({ _info: JSON.stringify(LIVE_INFO[P.id]) }, LIVE_INFO[P.id]) : {}, route ? { route: route } : {}), ota: cur.ota || null };
    await db.ref().update(up);
    if(typeof _prepIndex !== 'undefined' && _prepIndex) Object.keys(up).forEach(function(k){ const m = k.match(/prep_index\/([^/]+)\/replay$/); if(m && _prepIndex[m[1]]) _prepIndex[m[1]].replay = up[k]; });
    if(typeof showToast === 'function') showToast('Suivi prêt pour ' + P.name);
    _liveVal = (await db.ref('live').once('value')).val() || {};          // panneau rouvert sur la nouvelle course
    closeLivePanel(); openLivePanel();
  } catch(e) { alert('Préparation impossible (' + e.message + ').'); }
}
async function liveSaveRaceInfo(){
  const st = document.getElementById('lv-r-start').value, pl = document.getElementById('lv-r-place').value.trim();
  if(!/^\d{1,2}:\d{2}$/.test(st)){ alert('Heure de départ invalide.'); return; }
  await _liveRef.child('race').update({ start: st, place: pl });
  if(typeof showToast === 'function') showToast('Départ enregistré');
}
// GPX → tracé (≈ 1 point tous les 15 m au plus, 2 500 points maximum)
function liveImportGpx(input){
  const f = input.files && input.files[0]; if(!f) return;
  const rd = new FileReader();
  rd.onload = async function(){
    try {
      const xml = new DOMParser().parseFromString(String(rd.result), 'application/xml');
      let nodes = Array.from(xml.getElementsByTagName('trkpt')); if(!nodes.length) nodes = Array.from(xml.getElementsByTagName('rtept'));
      let pts = nodes.map(function(n){ return [+(+n.getAttribute('lat')).toFixed(5), +(+n.getAttribute('lon')).toFixed(5)]; }).filter(function(p){ return isFinite(p[0]) && isFinite(p[1]) && (p[0] || p[1]); });
      if(pts.length < 2){ alert('Aucun tracé trouvé dans ce fichier.'); return; }
      const out = [pts[0]]; let len = 0;
      for(let i = 1; i < pts.length; i++){ const d = SuiviGeo.dist(out[out.length - 1], pts[i]); if(d >= 15 || i === pts.length - 1){ out.push(pts[i]); len += d; } }
      while(out.length > 2500){ for(let i = out.length - 2; i > 0; i -= 2) out.splice(i, 1); }
      const off = suiviOff(), gap = Math.abs(len - off) / off;
      if(!confirm('Tracé de ' + (len / 1000).toFixed(2).replace('.', ',') + ' km (distance officielle ' + suiviKmLabel(off) + ' km)' + (gap > 0.05 ? '\n⚠️ Écart de ' + Math.round(gap * 100) + ' % : vérifie que c\'est bien le bon parcours.' : '') + '\n\nL\'enregistrer pour le suivi ?')) return;
      await _liveRef.child('race/route').set(out);
      if(typeof showToast === 'function') showToast('Tracé enregistré');
    } catch(e) { alert('Fichier GPX illisible (' + e.message + ').'); }
    input.value = '';
  };
  rd.readAsText(f);
}
async function liveAddPoint(){
  const km = parseFloat(String(document.getElementById('lv-p-km').value).replace(',', '.')), label = document.getElementById('lv-p-label').value.trim(), lieu = document.getElementById('lv-p-lieu').value.trim();
  if(!(km > 0 && km < suiviOff() / 1000)){ alert('Km invalide.'); return; }
  const pts = ((_liveVal.race && _liveVal.race.points) || []).slice();
  const plan = SuiviPlan.t(km * 1000), at = suiviFmt.planned(SuiviRace.start) + plan * 1000, d = new Date(at);
  pts.push({ id: 'p' + Math.round(km * 1000), km: km, label: label || 'km ' + String(km).replace('.', ','), lieu: lieu, prevu: d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0') });
  pts.sort(function(a, b){ return a.km - b.km; });
  await _liveRef.child('race/points').set(pts);
}
async function liveDelPoint(id){
  if(!confirm('Supprimer ce point de passage ?')) return;
  const pts = ((_liveVal.race && _liveVal.race.points) || []).filter(function(p){ return p.id !== id; });
  await _liveRef.child('race/points').set(pts);
}
// Après la course (temps officiel saisi à la validation) : données du rejeu d'après les temps au km Strava
async function liveStoreReplay(officialSec, perf, note){
  try {
    if(!isAdmin() || typeof firebase === 'undefined') return false;
    const db = firebase.database(), race = (await db.ref('live/race').once('value')).val();
    const P = _livePrepRace();
    if(!race || !P || race.id !== P.id) return false;
    const sp = (perf && perf.strava && perf.strava.splits || []).filter(function(x){ return x && x.allure && x.distanceKm > 0; });
    const toSec = function(a){ const m = String(a).match(/^(\d+):(\d{2})$/); return m ? +m[1] * 60 + +m[2] : null; };
    const full = sp.filter(function(x){ return x.distanceKm >= 0.95; }), part = sp.filter(function(x){ return x.distanceKm < 0.95; }).pop();
    const watchKm = full.reduce(function(a, x){ return a + x.distanceKm; }, 0) + (part ? part.distanceKm : 0);
    const off = race.official / 1000;
    if(!full.length || watchKm < off * 0.97 || watchKm > off * 1.08) return false;   // activité avec échauffement, ou incomplète
    const rp = { official: officialSec, gun: race.start, watchKm: Math.round(watchKm * 100) / 100, splits: full.map(function(x){ return toSec(x.allure); }).filter(Boolean),
      last: part ? { km: part.distanceKm, pace: toSec(part.allure) } : null, note: note || '' };
    await db.ref('live/race/replay').set(rp);
    return true;
  } catch(e) { console.warn('[course] rejeu', e); return false; }
}

// ─── Compte › Suivi de course › Marathon Seine-Eure : organisation (carte, trajets, RDV) en page plein écran ───
// Le bloc #race-org-panel (race-map.js) est déplacé dans la page à l'ouverture puis remis en place à la fermeture :
// la carte n'est créée qu'une fois, quand elle est visible.
function openRaceOrgSheet(){
  const panel = document.getElementById('race-org-panel'); if(!panel || document.getElementById('race-org-sheet')) return;
  const ov = document.createElement('div'); ov.id = 'race-org-sheet'; ov.className = 'ros';
  ov.innerHTML = '<div class="ros-box" role="dialog" aria-modal="true" aria-labelledby="ros-title">'
    + '<div class="ros-head"><div class="ros-top"><button type="button" class="ros-x" onclick="closeRaceOrgSheet()" aria-label="Fermer">×</button>'
    +   '<div style="min-width:0;"><p class="ros-eb">Suivi de course · terminé</p><p class="ros-title" id="ros-title">Marathon Seine-Eure</p>'
    +   '<p class="ros-sub">Dimanche 18 octobre 2026 · 3:37:05 · record personnel</p></div></div>'
    + '<div class="ros-acts"><button type="button" id="race-share-btn" onclick="shareRaceMap()"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg><span>Partager</span></button>'
    +   '<a href="/suivi-guillaume?course=seine-eure-2026" target="_blank" rel="noopener">🎬 Revoir la course</a></div></div>'
    + '<div class="ros-body"></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) closeRaceOrgSheet(); });
  document.body.appendChild(ov);
  ov.querySelector('.ros-body').appendChild(panel);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(function(){
    if(typeof initRaceOrgMap === 'function') initRaceOrgMap();
    if(typeof _raceMapInstance !== 'undefined' && _raceMapInstance) setTimeout(function(){ _raceMapInstance.invalidateSize(); if(_raceMapRefit) _raceMapRefit(); }, 300);
  });
}
function closeRaceOrgSheet(){
  const ov = document.getElementById('race-org-sheet'); if(!ov) return;
  if(typeof _raceMapFullscreen !== 'undefined' && _raceMapFullscreen) _toggleRaceMapFS(false);
  const done = function(){ const panel = document.getElementById('race-org-panel'), hold = document.getElementById('race-org-holder'); if(panel && hold) hold.appendChild(panel); ov.remove(); document.body.style.overflow = ''; };
  ov.classList.add('out'); setTimeout(done, 190);
}
document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && document.getElementById('race-org-sheet') && !(typeof _raceMapFullscreen !== 'undefined' && _raceMapFullscreen)) closeRaceOrgSheet(); });
