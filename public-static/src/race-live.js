// Course en direct (accueil, admin) : pilotage du suivi /live depuis l'application — départ, essai, arrivée, annulation,
// et pointages officiels (km + temps de course) qui mettent à jour distance, allure, passages et page /suivi-guillaume.

let _liveRef = null, _liveVal = {}, _liveTimer = null, _liveOffset = 0;

function _liveLoadCore(){
  if(typeof SuiviGeo !== 'undefined') return Promise.resolve();
  const load = function(src){ return new Promise(function(ok, ko){ const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); }); };
  return load('/src/suivi-data.js?v=1').then(function(){ return load('/src/suivi-core.js?v=2'); });
}
// "1:42:10", "42:10", "1h42", "1h42m10" → millisecondes
function _liveParseTime(v){
  v = String(v || '').trim().toLowerCase().replace(/\s/g, '').replace(/h/g, ':').replace(/m(in)?/g, ':').replace(/s$/, '').replace(/:$/, '');
  if(!/^\d{1,2}(:\d{1,2}){0,2}$/.test(v)) return null;
  const p = v.split(':').map(Number);
  let s;
  if(p.length === 3) s = p[0] * 3600 + p[1] * 60 + p[2];
  else if(p.length === 2) s = p[0] < 7 ? p[0] * 3600 + p[1] * 60 : p[0] * 60 + p[1];     // "1:42" = 1h42 ; "42:10" = 42 min 10
  else s = p[0] * 60;
  return s > 0 && s < 8 * 3600 ? s * 1000 : null;
}

async function openLivePanel(){
  if(!isAdmin()) return;
  try { await _liveLoadCore(); } catch(e) { alert('Impossible de charger le suivi (réseau).'); return; }
  const mc = document.getElementById('modal-container');
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'live-panel';
  ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  const chips = [5, 10, 15, 20, 21.1, 25, 30, 35, 40, 42.195].map(function(k){ return '<button type="button" class="lv-chip" onclick="document.getElementById(\'lv-km\').value=\'' + k + '\'">' + String(k).replace('.', ',') + '</button>'; }).join('');
  ov.innerHTML = '<div class="modal-box" style="max-height:92vh;">'
    + '<div style="background:linear-gradient(135deg,#0C447C,#15803D);padding:16px;border-radius:24px 24px 0 0;color:#fff;flex-shrink:0;">'
    +   '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;"><div>'
    +     '<p style="font-size:10px;font-weight:800;opacity:.8;letter-spacing:.1em;text-transform:uppercase;margin:0 0 2px;">Marathon Seine-Eure · suivi en direct</p>'
    +     '<p style="font-size:21px;font-weight:900;margin:0;">🏁 Course en direct</p></div>'
    +     '<button onclick="closeLivePanel()" aria-label="Fermer" style="background:rgba(255,255,255,.2);border:none;cursor:pointer;color:#fff;font-size:18px;width:32px;height:32px;border-radius:50%;">×</button></div>'
    +   '<div id="lv-pill" style="display:inline-block;margin-top:8px;padding:5px 11px;border-radius:999px;background:rgba(255,255,255,.18);font-size:12px;font-weight:800;">…</div>'
    + '</div>'
    + '<div class="modal-scroll-body"><div style="padding:14px 16px 18px;display:flex;flex-direction:column;gap:12px;">'
    +   '<div class="lv-grid">'
    +     '<div class="lv-stat"><span>Temps de course</span><b id="lv-chrono">–</b></div>'
    +     '<div class="lv-stat"><span>Distance</span><b id="lv-dist">–</b></div>'
    +     '<div class="lv-stat"><span>Allure moyenne</span><b id="lv-pace">–</b></div>'
    +     '<div class="lv-stat"><span>Arrivée estimée</span><b id="lv-eta">–</b></div>'
    +   '</div>'
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
    +     '<label class="lv-lab">Temps<input id="lv-t" type="text" inputmode="numeric" placeholder="1:42:10"></label></div>'
    +     '<div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;">' + chips + '</div>'
    +     '<button type="button" class="lv-btn lv-go" onclick="liveSaveSplit()">Enregistrer le pointage</button>'
    +     '<div id="lv-splits" style="margin-top:10px;"></div></div>'
    +   '<div class="lv-card"><p class="lv-h">Heure de départ</p>'
    +     '<div style="display:flex;gap:8px;align-items:flex-end;"><label class="lv-lab">Départ donné à<input id="lv-start" type="time" value="09:15"></label>'
    +     '<button type="button" class="lv-btn lv-ghost" style="flex:1" onclick="liveStart(document.getElementById(\'lv-start\').value)">Régler le chrono</button></div></div>'
    +   '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
    +     '<a class="lv-btn lv-ghost" style="flex:1;text-align:center;text-decoration:none;" href="/suivi-guillaume" target="_blank">👀 Page de suivi</a>'
    + '</div>'
    + '</div></div></div>';
  mc.appendChild(ov);
  if(!document.getElementById('lv-style')){
    const st = document.createElement('style'); st.id = 'lv-style';
    st.textContent = '.lv-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}'
      + '.lv-stat{background:#F3F6FA;border-radius:12px;padding:9px 11px;}.lv-stat span{display:block;font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#5b6675;}.lv-stat b{display:block;font-size:20px;font-weight:900;color:#0C447C;font-variant-numeric:tabular-nums;}'
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
function _liveOnValue(s){ _liveVal = s.val() || {}; _liveRender(); _liveRenderHomeBtn(); if(_liveTest && !_liveTest.done) _liveTestRender(); }
const _liveNow = function(){ return Date.now() + _liveOffset; };

function _liveRender(){
  const L = _liveVal, el = document.getElementById('lv-chrono'); if(!el) return;
  const t = _liveNow(), st = L.status || 'idle';
  document.getElementById('lv-pill').textContent = st === 'running' ? (L.test ? '🧪 Essai en cours' : '🟢 En course') : st === 'finished' ? '✔ Arrivé' : 'Pas encore parti';
  el.textContent = L.startedAt ? suiviFmt.dur((L.finishedAt || t) - L.startedAt) : '–';
  const p = L.pos, dKm = p && typeof p.s === 'number' ? p.s * SuiviGeo.scale : null;
  document.getElementById('lv-dist').textContent = st === 'finished' ? '42,2 km' : dKm !== null ? suiviFmt.km(dKm) + ' km' : '–';
  const elAt = p && L.startedAt ? (p.ts - L.startedAt) / 1000 : 0;
  const speed = st === 'finished' ? 42195 / ((L.finishedAt - L.startedAt) / 1000) : dKm > 300 && elAt > 60 ? dKm / elAt : null;
  document.getElementById('lv-pace').textContent = speed ? suiviFmt.pace(1000 / speed) : '–';
  document.getElementById('lv-eta').textContent = st === 'finished' ? suiviFmt.hhmm(L.finishedAt) : speed && p ? suiviFmt.hhmm(p.ts + (42195 - dKm) / speed * 1000) : '–';
  const ot = L.ota;
  document.getElementById('lv-src').innerHTML = (p ? 'Dernière position : ' + suiviFmt.ago(t - p.ts) + (p.src === 'officiel' ? ' (pointage officiel)' : p.src === 'owntracks' ? ' (OwnTracks)' : '') + ' · ' : '')
    + 'OwnTracks : ' + (ot && ot.ts ? '<b style="color:' + (t - ot.ts < 180000 ? '#15803D' : '#B91C1C') + '">' + suiviFmt.ago(t - ot.ts) + '</b>' + (typeof ot.batt === 'number' ? ' · batterie ' + ot.batt + ' %' : '') : '<b style="color:#B91C1C">aucun contact</b>');
  // actions selon l'état (reconstruites seulement si l'état change)
  const key = st + (L.test ? 't' : '');
  const box = document.getElementById('lv-actions');
  if(box.dataset.k !== key){
    box.dataset.k = key;
    box.innerHTML = st === 'running'
      ? '<button class="lv-btn lv-fin" onclick="liveFinish()">🏁 Je suis arrivé</button><button class="lv-btn lv-danger" onclick="liveCancel()">✖ Annuler ' + (L.test ? 'l\'essai' : 'le suivi') + ' (tout effacer)</button>'
      : st === 'finished'
        ? '<button class="lv-btn lv-danger" onclick="liveCancel()">✖ Annuler (tout effacer)</button>'
        : '<button class="lv-btn lv-go" style="font-size:17px;padding:16px;" onclick="liveStart()">▶ Démarrer la course maintenant</button><button class="lv-btn lv-ghost" onclick="liveStart(null,true)">🧪 Lancer un essai (annulable)</button>';
  }
  const sp = L.splits ? Object.keys(L.splits).map(function(k){ return Object.assign({ k: k }, L.splits[k]); }).sort(function(a, b){ return a.km - b.km; }) : [];
  document.getElementById('lv-splits').innerHTML = sp.length ? sp.map(function(x){
    return '<div class="lv-row"><b>km ' + String(+x.km.toFixed(3)).replace('.', ',') + '</b><span>' + suiviFmt.dur(x.el) + ' · ' + suiviFmt.pace(x.el / 1000 / x.km) + '</span><button aria-label="Supprimer" onclick="liveDelSplit(\'' + x.k + '\')">×</button></div>';
  }).join('') : '';
}

async function liveStart(hm, test){
  const L = _liveVal, at = hm ? suiviFmt.planned(hm) : null;
  const what = test ? 'un essai' : 'la course';
  if(L.status === 'running' && !hm && !confirm('Un suivi est déjà en cours. Redémarrer ' + what + ' maintenant et effacer la trace ?')) return;
  if(L.status === 'running' && hm){
    if(!confirm('Régler le départ à ' + hm.replace(':', 'h') + ' (le chrono et les allures sont recalculés) ?')) return;
    await _liveRef.update({ startedAt: at }); return;
  }
  if(L.status !== 'running' && !confirm(test ? 'Lancer un essai ? La page de suivi affichera « Essai ».' : 'Démarrer la course ' + (hm ? 'à ' + hm.replace(':', 'h') : 'maintenant') + ' ? Le suivi devient visible par tous.')) return;
  await _liveRef.update({ status: 'running', test: test ? true : null, startedAt: at || firebase.database.ServerValue.TIMESTAMP, finishedAt: null, passages: null, track: null, pos: null, splits: null });
}
async function liveFinish(){
  if(!confirm('Déclarer l\'arrivée maintenant ? (Vous pourrez saisir le temps officiel ensuite : km 42,195.)')) return;
  const t = _liveNow(), up = { status: 'finished', finishedAt: t };
  if(!(_liveVal.passages && _liveVal.passages.finish)) up['passages/finish'] = t;
  await _liveRef.update(up);
}
async function liveCancel(){
  if(!confirm('Annuler ? Le chrono, la trace et les pointages sont effacés ; la page de suivi revient à « Pas encore parti ».')) return;
  await _liveRef.update({ status: 'idle', test: null, startedAt: null, finishedAt: null, passages: null, track: null, pos: null, splits: null });
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
  const waited = Math.round((t - T.start) / 1000), WAIT = 90;
  const row = function(ok, label, txt){ return '<div class="lv-row"><b style="min-width:22px;">' + (ok === null ? '⏳' : ok ? '✅' : '❌') + '</b><span><b style="color:#1f2d3d;">' + label + '</b> · ' + txt + '</span></div>'; };
  const age = o.ts ? t - o.ts : null, gap = o.ts && o.prev ? Math.round((o.ts - o.prev) / 1000) : null;
  let h = '';
  h += row(age !== null && age < 180000, 'Liaison', age === null ? 'aucune position jamais reçue : vérifiez l\'URL dans OwnTracks' : 'dernière position reçue ' + suiviFmt.ago(age));
  const mode = o.m === undefined || o.m === null ? null : _OT_MODES[String(o.m)] || ('mode ' + o.m);
  h += row(mode === null ? null : o.m === 2, 'Mode', mode === null ? 'inconnu (attendez la prochaine position)' : mode + (o.m === 2 ? '' : ' : passez en « Move » en haut de la carte OwnTracks'));
  if(gap !== null) h += row(gap <= 240, 'Fréquence', gap + ' s entre les deux dernières positions' + (gap > 60 && gap <= 240 ? ' (normal à l\'arrêt ; en course : environ 1 position par minute)' : ''));
  h += row(typeof o.acc === 'number' ? o.acc <= 50 : null, 'Précision GPS', typeof o.acc === 'number' ? o.acc + ' m' : '–');
  h += row(typeof o.batt === 'number' ? o.batt >= 50 : null, 'Batterie', typeof o.batt === 'number' ? o.batt + ' %' + (o.batt < 50 ? ' : rechargez avant la course' : '') : '–');
  if(T.got) h += row(true, 'En direct', 'nouvelle position reçue pendant le test (' + Math.round((T.got - T.start) / 1000) + ' s après le lancement) 🎉');
  else if(waited < WAIT) h += row(null, 'En direct', 'en attente d\'une nouvelle position… ' + (WAIT - waited) + ' s. Pour accélérer : dans OwnTracks, touchez l\'icône d\'envoi (carré avec flèche, en haut à droite) ou marchez un peu.');
  else h += row(false, 'En direct', 'aucune nouvelle position en ' + WAIT + ' s. Ouvrez OwnTracks : mode « Move », Réglages iPhone › OwnTracks › Position « Toujours ».');
  const allOk = T.got && o.m === 2 && age !== null && age < 180000;
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
  if(!(km > 0 && km <= 42.3)){ alert('Km invalide (entre 0 et 42,195).'); return; }
  if(!el){ alert('Temps invalide. Exemples : 1:42:10 · 47:30 · 1h42'); return; }
  if(!L.startedAt || L.status === 'idle'){
    if(!confirm('La course n\'est pas démarrée. La démarrer avec ce pointage (départ = maintenant − ' + suiviFmt.dur(el) + ') ?')) return;
    await _liveRef.update({ status: 'running', test: null, startedAt: _liveNow() - el, finishedAt: null, passages: null, track: null, pos: null, splits: null });
    L.startedAt = _liveNow() - el; L.status = 'running'; L.passages = null; L.pos = null;
  }
  const ts = L.startedAt + el, s = Math.min(SuiviGeo.len, km * 1000 / SuiviGeo.scale);
  const up = {};
  up['splits/k' + String(Math.round(km * 1000)).padStart(5, '0')] = { km: km, el: el, ts: ts };
  // points de passage correspondants (le km 30 est devant la maison, ≈ km 29,4)
  SUIVI_DATA.points.forEach(function(pt){
    const ptKm = pt.s * SuiviGeo.scale / 1000;
    if(Math.abs(km - pt.km) < 0.35 || Math.abs(km - ptKm) < 0.35) up['passages/' + pt.id] = ts;
  });
  if(km >= 42.1){ up.status = 'finished'; up.finishedAt = ts; up['passages/finish'] = ts; }
  // position officielle si le GPS n'est pas déjà plus loin
  if(!L.pos || typeof L.pos.s !== 'number' || L.pos.s <= s + 50){
    const ll = SuiviGeo.pointAt(s);
    up.pos = { lat: +ll[0].toFixed(6), lon: +ll[1].toFixed(6), acc: 0, ts: ts, s: Math.round(s), src: 'officiel' };
  }
  await _liveRef.update(up);
  document.getElementById('lv-km').value = ''; document.getElementById('lv-t').value = '';
}

// bouton de l'accueil (admin) : reflète l'état du suivi
function _liveRenderHomeBtn(){
  const b = document.getElementById('home-live-btn'); if(!b) return;
  const L = _liveVal, st = L.status || 'idle';
  const sub = document.getElementById('home-live-sub');
  if(sub) sub.textContent = st === 'running' ? (L.test ? 'Essai en cours' : 'En course · ' + (L.pos && typeof SuiviGeo !== 'undefined' ? suiviFmt.km(L.pos.s * SuiviGeo.scale) + ' km' : 'chrono lancé'))
    : st === 'finished' ? 'Arrivé ✔' : 'Démarrer, pointages officiels, suivi des amis';
}
function initLiveHomeBtn(){
  const b = document.getElementById('home-live-btn'); if(!b) return;
  if(typeof firebase === 'undefined'){ b.style.display = 'none'; return; }      // mode aperçu hors ligne
  b.style.display = isAdmin() ? 'flex' : 'none';
  if(!isAdmin() || window._liveHomeListen || typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return;
  window._liveHomeListen = true;
  _liveLoadCore().then(function(){
    if(!_liveRef) _liveRef = firebase.database().ref('live');
    _liveRef.on('value', function(s){ _liveVal = s.val() || {}; _liveRenderHomeBtn(); });
  }).catch(function(){});
}
