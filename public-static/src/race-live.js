// Course en direct (accueil, admin) : pilotage du suivi /live depuis l'application — départ, essai, arrivée, annulation,
// et pointages officiels (km + temps de course) qui mettent à jour distance, allure, passages et page /suivi-guillaume.

let _liveRef = null, _liveVal = {}, _liveTimer = null, _liveOffset = 0;

let _liveCoreP = null;
function _liveLoadCore(){
  if(typeof SuiviGeo !== 'undefined') return Promise.resolve();
  if(_liveCoreP) return _liveCoreP;                                  // un seul chargement, même si appelé deux fois
  const load = function(src){ return new Promise(function(ok, ko){ const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); }); };
  _liveCoreP = load('/src/suivi-data.js?v=1').then(function(){ return load('/src/suivi-core.js?v=11'); }).catch(function(e){ _liveCoreP = null; throw e; });
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
  const d = el.value.replace(/\D/g, '').slice(0, 6);
  el.value = d.length <= 2 ? d : d.length <= 4 ? d.slice(0, -2) + ':' + d.slice(-2) : d.slice(0, -4) + ':' + d.slice(-4, -2) + ':' + d.slice(-2);
}

async function openLivePanel(){
  if(!isAdmin()) return;
  try { await _liveLoadCore(); } catch(e) { alert('Impossible de charger le suivi (réseau).'); return; }
  const mc = document.getElementById('modal-container');
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'live-panel';
  ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  _liveSyncRace(_liveVal.race);
  const _offKm = suiviOff() / 1000;
  const chips = (_offKm > 30 ? [5, 10, 15, 20, 21.1, 25, 30, 35, 40, _offKm] : _offKm > 15 ? [5, 10, 15, 20, _offKm] : [1, 2, 3, 4, 5, 6, 7, 8, 9, _offKm]).map(function(k){ return '<button type="button" class="lv-chip" onclick="document.getElementById(\'lv-km\').value=\'' + k + '\'">' + String(k).replace('.', ',') + '</button>'; }).join('');
  ov.innerHTML = '<div class="modal-box" style="max-height:92vh;">'
    + '<div style="background:linear-gradient(135deg,#0C447C,#15803D);padding:16px;border-radius:24px 24px 0 0;color:#fff;flex-shrink:0;">'
    +   '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;"><div>'
    +     '<p id="lv-race-name" style="font-size:10px;font-weight:800;opacity:.8;letter-spacing:.1em;text-transform:uppercase;margin:0 0 2px;">' + _prepEsc(SuiviRace.name) + ' · suivi en direct</p>'
    +     '<p style="font-size:21px;font-weight:900;margin:0;">🏁 Course en direct</p></div>'
    +     '<button onclick="closeLivePanel()" aria-label="Fermer" style="background:rgba(255,255,255,.2);border:none;cursor:pointer;color:#fff;font-size:18px;width:32px;height:32px;border-radius:50%;">×</button></div>'
    +   '<div id="lv-pill" style="display:inline-block;margin-top:8px;padding:5px 11px;border-radius:999px;background:rgba(255,255,255,.18);font-size:12px;font-weight:800;">…</div>'
    + '</div>'
    + '<div class="modal-scroll-body"><div style="padding:14px 16px 18px;display:flex;flex-direction:column;gap:12px;">'
    +   '<div class="lv-card" id="lv-race"></div>'
    +   '<div class="lv-grid">'
    +     '<div class="lv-stat"><span>Temps de course</span><b id="lv-chrono">–</b>'
    +       '<div id="lv-adj" class="lv-adj" hidden><button type="button" aria-label="Reculer le chrono d\'une seconde" onclick="liveNudge(-1)">− 1 s</button><button type="button" aria-label="Avancer le chrono d\'une seconde" onclick="liveNudge(1)">+ 1 s</button></div></div>'
    +     '<div class="lv-stat"><span>Distance</span><b id="lv-dist">–</b></div>'
    +     '<div class="lv-stat"><span>Allure moyenne</span><b id="lv-pace">–</b></div>'
    +     '<div class="lv-stat"><span>Arrivée estimée</span><b id="lv-eta">–</b></div>'
    +   '</div>'
    +   '<div id="lv-auto" role="status" hidden style="background:#FFF4E5;border:1.5px solid #F59E0B;border-radius:12px;padding:10px 12px;font-size:13px;line-height:1.4;color:#7C2D12;"></div>'
    +   '<p id="lv-src" class="lv-note"></p>'
    +   '<div class="lv-card"><p class="lv-h">🔍 Tester OwnTracks</p>'
    +     '<p class="lv-note" style="margin:0 0 8px;">Vérifie la liaison, le mode Move et la réception de votre position en direct.</p>'
    +     '<button type="button" class="lv-btn lv-go" onclick="liveTestOt()">🔍 Lancer le test</button>'
    +     '<div id="lv-test" style="margin-top:10px;" hidden></div></div>'
    +   '<div class="lv-card" id="lv-ot"><p class="lv-h">📲 OwnTracks (position écran verrouillé)</p>'
    +     '<button type="button" class="lv-btn lv-go" onclick="liveOwnTracks()">📲 Copier l\'URL OwnTracks</button>'
    +     '<div id="lv-ot-man" hidden style="margin-top:8px;"><p class="lv-note" style="margin:0 0 4px;">URL à coller dans OwnTracks (contient votre clé secrète, ne la partagez pas) :</p>'
    +     '<input id="lv-ot-url" readonly onclick="this.select()" style="width:100%;box-sizing:border-box;font-size:12px;padding:9px;border:1px solid #cbd5e1;border-radius:10px;">'
    +     '<button type="button" class="lv-btn lv-ghost" style="margin-top:6px;" onclick="liveCopyOt()">Copier l\'URL</button></div></div>'
    +   '<div id="lv-actions" style="display:flex;flex-direction:column;gap:8px;"></div>'
    +   '<div class="lv-card"><p class="lv-h">⏱ Pointage officiel</p>'
    +     '<p class="lv-note" style="margin:0 0 8px;">Saisissez un km et votre temps de course officiel : distance, allure, passages et page de suivi sont mis à jour.</p>'
    +     '<div style="display:flex;gap:8px;"><label class="lv-lab">Km<input id="lv-km" type="text" inputmode="decimal" placeholder="21,1"></label>'
    +     '<label class="lv-lab">Temps<input id="lv-t" type="text" inputmode="numeric" placeholder="1:48:23" oninput="_liveFmtTimeInput(this)"></label></div>'
    +     '<p class="lv-note" style="margin:6px 0 0;">Tapez seulement les chiffres : 1458 → 14:58 · 14823 → 1:48:23</p>'
    +     '<div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;">' + chips + '</div>'
    +     '<button type="button" class="lv-btn lv-go" onclick="liveSaveSplit()">Enregistrer le pointage</button>'
    +     '<div id="lv-splits" style="margin-top:10px;"></div></div>'
    +   '<div class="lv-card"><p class="lv-h">Heure de départ</p>'
    +     '<div style="display:flex;gap:8px;align-items:flex-end;"><label class="lv-lab">Départ donné à<input id="lv-start" type="time" step="1" value="' + SuiviRace.start + ':00"></label>'
    +     '<button type="button" class="lv-btn lv-ghost" style="flex:1" onclick="liveStartAt()">Régler le chrono</button></div></div>'
    +   '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
    +     '<a class="lv-btn lv-ghost" style="flex:1;text-align:center;text-decoration:none;" href="/suivi-guillaume" target="_blank">👀 Page de suivi</a>'
    + '</div>'
    + '</div></div></div>';
  mc.appendChild(ov);
  if(!document.getElementById('lv-style')){
    const st = document.createElement('style'); st.id = 'lv-style';
    st.textContent = '.lv-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}'
      + '.lv-stat{background:#F3F6FA;border-radius:12px;padding:9px 11px;}.lv-stat span{display:block;font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#5b6675;}.lv-stat b{display:block;font-size:20px;font-weight:900;color:#0C447C;font-variant-numeric:tabular-nums;}'
      + '.lv-adj{display:flex;gap:6px;margin-top:6px;}.lv-adj button{flex:1;min-height:40px;border:1.5px solid #0C447C;background:#fff;color:#0C447C;border-radius:10px;font:800 15px/1 system-ui,sans-serif;cursor:pointer;touch-action:manipulation;}.lv-adj button:active{background:#E8F0FB;}'
      + '.lv-note{font-size:12px;color:#5b6675;margin:0;line-height:1.4;}.lv-card{border:1px solid #E3EAF4;border-radius:14px;padding:12px;}.lv-h{font-size:14px;font-weight:800;color:#0C447C;margin:0 0 4px;}'
      + '.lv-lab{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;font-size:11px;font-weight:700;color:#5b6675;}.lv-lab input{width:100%;min-width:0;box-sizing:border-box;font-size:17px;padding:10px;border:1px solid #cbd5e1;border-radius:10px;font-variant-numeric:tabular-nums;}'
      + '.lv-chip{border:1px solid #D6E2F5;background:#fff;color:#0C447C;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:800;cursor:pointer;}'
      + '.lv-btn{border:none;border-radius:12px;padding:13px;font-size:15px;font-weight:800;cursor:pointer;display:block;width:100%;box-sizing:border-box;}.lv-go{background:#15803D;color:#fff;}.lv-fin{background:#1D4ED8;color:#fff;}.lv-ghost{background:#fff;color:#0C447C;border:1px solid #D6E2F5;}.lv-danger{background:#fff;color:#B91C1C;border:1px solid #FECACA;}'
      + '.lv-row{display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid #EEF2F7;font-size:13px;}.lv-row b{color:#0C447C;min-width:58px;}.lv-row span{flex:1;font-variant-numeric:tabular-nums;}.lv-row button{border:none;background:none;color:#B91C1C;font-size:16px;cursor:pointer;}';
    document.head.appendChild(st);
  }
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
function _liveOnValue(s){ _liveVal = s.val() || {}; _liveSyncRace(_liveVal.race); _liveRender(); _liveRaceRender(); _liveRenderHomeBtn(); if(_liveTest && !_liveTest.done) _liveTestRender(); }
const _liveNow = function(){ return Date.now() + _liveOffset; };

function _liveRender(){
  const L = _liveVal, el = document.getElementById('lv-chrono'); if(!el) return;
  const t = _liveNow(), st = L.status || 'idle';
  document.getElementById('lv-pill').textContent = st === 'running' ? (L.test ? '🧪 Essai en cours' : '🟢 En course') : st === 'finished' ? '✔ Arrivé' : 'Pas encore parti';
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
    + 'Suivi en autonome sans le GPS : la position avance selon votre plan de course et vos temps officiels. Saisissez vos pointages pour la recaler.';
  document.getElementById('lv-src').innerHTML = (p ? 'Dernière position : ' + suiviFmt.ago(t - p.ts) + (p.src === 'officiel' ? ' (pointage officiel)' : p.src === 'owntracks' ? ' (OwnTracks)' : '') + (c.adj ? ' · allure bornée sur le plan' : '') + ' · ' : '')
    + 'OwnTracks : ' + (ot && ot.ts ? '<b style="color:' + (t - ot.ts < 300000 ? '#15803D' : '#B91C1C') + '">' + suiviFmt.ago(t - ot.ts) + '</b>' + (typeof ot.batt === 'number' ? ' · batterie ' + ot.batt + ' %' : '') : '<b style="color:#B91C1C">aucun contact</b>');
  // actions selon l'état (reconstruites seulement si l'état change)
  const key = st + (L.test ? 't' : '');
  const box = document.getElementById('lv-actions');
  if(box.dataset.k !== key){
    box.dataset.k = key;
    box.innerHTML = st === 'running'
      ? (L.test ? '<button class="lv-btn lv-go" style="font-size:17px;padding:16px;" onclick="liveStart()">▶ Démarrer la course maintenant</button>' : '')
      + '<button class="lv-btn lv-fin" onclick="liveFinish()">🏁 Je suis arrivé</button><button class="lv-btn lv-danger" onclick="liveCancel()">✖ Annuler ' + (L.test ? 'l\'essai' : 'le suivi') + ' (tout effacer)</button>'
      : st === 'finished'
        ? (L.test ? '<button class="lv-btn lv-go" style="font-size:17px;padding:16px;" onclick="liveStart()">▶ Démarrer la course maintenant</button>' : '') + '<button class="lv-btn lv-danger" onclick="liveCancel()">✖ Annuler (tout effacer)</button>'
        : '<button class="lv-btn lv-go" style="font-size:17px;padding:16px;" onclick="liveStart()">▶ Démarrer la course maintenant</button><button class="lv-btn lv-ghost" onclick="liveStart(null,true)">🧪 Lancer un essai (annulable)</button>';
  }
  const sp = L.splits ? Object.keys(L.splits).map(function(k){ return Object.assign({ k: k }, L.splits[k]); }).sort(function(a, b){ return a.km - b.km; }) : [];
  document.getElementById('lv-splits').innerHTML = sp.length ? sp.map(function(x){
    return '<div class="lv-row"><b>km ' + String(+x.km.toFixed(3)).replace('.', ',') + '</b><span>' + suiviFmt.dur(x.el) + ' · ' + suiviFmt.pace(x.el / 1000 / x.km) + '</span><button aria-label="Supprimer" onclick="liveDelSplit(\'' + x.k + '\')">×</button></div>';
  }).join('') : '';
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
  const row = function(ok, label, txt){ return '<div class="lv-row"><b style="min-width:22px;">' + (ok === null ? '⏳' : ok ? '✅' : '❌') + '</b><span><b style="color:#1f2d3d;">' + label + '</b> · ' + txt + '</span></div>'; };
  const age = o.ts ? t - o.ts : null, gap = o.ts && o.prev ? Math.round((o.ts - o.prev) / 1000) : null;
  let h = '';
  h += row(age !== null && age < 300000, 'Liaison', age === null ? 'aucune position jamais reçue : vérifiez l\'URL dans OwnTracks' : 'dernière position reçue ' + suiviFmt.ago(age));
  const mode = o.m === undefined || o.m === null ? null : _OT_MODES[String(o.m)] || ('mode ' + o.m);
  // le mode n'est connu qu'au moment d'un envoi : il n'est validé que par une position reçue pendant le test
  const lastMode = mode === null ? 'inconnu' : mode;
  if(T.got) h += row(o.m === 2, 'Mode', mode + (o.m === 2 ? ' (confirmé)' : ' : passez en « Move » en haut de la carte OwnTracks'));
  else if(waited < WAIT) h += row(null, 'Mode', 'confirmation en attente (dernier mode connu : ' + lastMode + ')');
  else h += row(false, 'Mode', 'non confirmé : OwnTracks est peut-être en « Quiet » ou « Manual », ou fermée (dernier mode connu : ' + lastMode + ')');
  if(gap !== null) h += '<div class="lv-row"><b style="min-width:22px;">ℹ️</b><span><b style="color:#1f2d3d;">Fréquence</b> · ' + gap + ' s entre les deux dernières positions (à l\'arrêt, OwnTracks espace les envois ; en course : environ 1 par minute)</span></div>';
  h += row(typeof o.acc === 'number' ? o.acc <= 50 : null, 'Précision GPS', typeof o.acc === 'number' ? o.acc + ' m' : '–');
  h += row(typeof o.batt === 'number' ? o.batt >= 50 : null, 'Batterie', typeof o.batt === 'number' ? o.batt + ' %' + (o.batt < 50 ? ' : rechargez avant la course' : '') : '–');
  if(T.got) h += row(true, 'En direct', 'nouvelle position reçue pendant le test (' + Math.round((T.got - T.start) / 1000) + ' s après le lancement) 🎉');
  else if(waited < WAIT) h += row(null, 'En direct', 'en attente d\'une nouvelle position… ' + (WAIT - waited) + ' s. Pour accélérer : dans OwnTracks, touchez l\'icône d\'envoi (carré avec flèche, en haut à droite) ou marchez un peu.');
  else h += row(false, 'En direct', 'aucune nouvelle position en ' + WAIT + ' s. Ouvrez OwnTracks : mode « Move » (pas Quiet ni Manual), application non fermée, Réglages iPhone › OwnTracks › Position « Toujours ». Puis relancez le test.');
  const allOk = T.got && o.m === 2 && age !== null && age < 300000;
  h += '<p class="lv-note" style="margin-top:8px;font-weight:700;color:' + (allOk ? '#15803D' : '#5b6675') + '">' + (allOk ? '✅ Tout fonctionne : vous pouvez verrouiller l\'iPhone.' : T.got || waited >= WAIT ? 'Corrigez les points ❌ puis relancez le test.' : '') + '</p>';
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

// bouton de l'accueil (admin) : reflète l'état du suivi
function _liveRenderHomeBtn(){
  const b = document.getElementById('home-live-btn'); if(!b) return;
  const L = _liveVal, st = L.status || 'idle';
  b.style.display = isAdmin() && st === 'running' ? 'flex' : 'none';
  const sub = document.getElementById('home-live-sub');
  if(sub) sub.textContent = st === 'running' ? (L.test ? 'Essai en cours' : 'En course · ' + (typeof suiviCalc !== 'undefined' && (L.pos || L.splits) ? suiviFmt.km(suiviCalc(L, _liveNow()).d) + ' km' : 'chrono lancé'))
    : st === 'finished' ? 'Arrivé ✔' : 'Démarrer, pointages officiels, suivi des amis';
}
function initLiveHomeBtn(){
  const b = document.getElementById('home-live-btn'); if(!b) return;
  if(typeof firebase === 'undefined'){ b.style.display = 'none'; return; }      // mode aperçu hors ligne
  b.style.display = 'none';                     // visible sur l'accueil seulement pendant une course lancée (sinon : Compte)
  if(!isAdmin() || window._liveHomeListen || typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return;
  window._liveHomeListen = true;
  _liveLoadCore().then(function(){
    if(!_liveRef) _liveRef = firebase.database().ref('live');
    _liveRef.on('value', function(s){ _liveVal = s.val() || {}; _liveSyncRace(_liveVal.race); _liveRenderHomeBtn(); });
  }).catch(function(){});
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
  if(typeof prepRace !== 'function' || usesHardPlan()) return null;
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
  let h = '<p class="lv-h">🏁 Course suivie</p>'
    + '<p class="lv-note" style="margin:0 0 8px;"><b style="color:#0C447C;">' + _prepEsc(SuiviRace.name) + '</b> · ' + day(SuiviRace.date) + ' · départ ' + suiviFmt.hhmmTxt(SuiviRace.start)
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
  h += '<button type="button" class="lv-btn lv-ghost" style="margin-top:8px;" onclick="liveShareLink()">🔗 Copier le lien de suivi pour les amis</button>';
  if(box.dataset.h !== h){ const keep = document.activeElement && box.contains(document.activeElement); if(!keep){ box.innerHTML = h; box.dataset.h = h; } }
}
function liveShareLink(){
  const url = LIVE_PAGE;
  if(navigator.share) navigator.share({ title: 'Suivi Guillaume · ' + SuiviRace.name, url: url }).catch(function(){});
  else if(navigator.clipboard) navigator.clipboard.writeText(url).then(function(){ alert('Lien copié : ' + url); }, function(){ prompt('Lien de suivi :', url); });
  else prompt('Lien de suivi :', url);
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
    up['live'] = { status: 'idle', race: Object.assign({ place: '', points: [], createdAt: Date.now() }, P), ota: cur.ota || null };
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
