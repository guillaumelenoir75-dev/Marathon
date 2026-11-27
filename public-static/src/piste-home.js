// ─── Thème « Piste de nuit » : l'accueil apaisé (html[data-piste], Compte › Thème) ──────────────────────────
// Une question par bloc, un seul grand chiffre par carte (maquettes Claude Design « Accueil apaisé ») :
// en-tête #home-piste à la place de l'en-tête bleu (#home-hero, masqué) : date, « Bonsoir Prénom », bouton « Outils » (les
// pastilles de l'ancien en-tête — recherche, notifications, nuit, allure EF, météo, partage, réveil — déplacées une fois dans
// #ph-chips, mêmes id, repliées) et micro du Coach ; carte « Ta course » (J-x, course, jour et heure, prépa faite à N %,
// « Tu es prévu en … pour un objectif de … · Pourquoi ? ») ; « Aujourd'hui » (my-day.js → phDayHtml) : forme du jour en une
// note + une phrase (détail au toucher : phFormOpen, piste-ui.js), l'étape du moment, puis « Ensuite » en lignes simples ;
// la semaine : bilan (km faits / prévus, une barre par séance), séances faites repliées, puis Renfo / Régularité / Partager.
// Calculs purs (testés) : phGreet, phTime, phRaceLabel, phWhen, phView, phNowView, phFormHead, phFormLine, phMeasureBase, phMeasures.

function phIsOn(){ try { return !!(typeof document !== 'undefined' && document.documentElement && document.documentElement.hasAttribute('data-piste')); } catch(e) { return false; } }
function phGreet(nowMin){ return nowMin >= 18 * 60 || nowMin < 4 * 60 ? 'Bonsoir' : 'Bonjour'; }
// 2500 → « 41'40 », 12585 → « 3h29'45 »
function phTime(sec){
  sec = Math.round(+sec); if(!isFinite(sec) || sec <= 0) return '';
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return (h ? h + 'h' + String(m).padStart(2, '0') : m) + "'" + String(s).padStart(2, '0');
}
// « 10 km » + « Novemb'Run » → « 10 km Novemb'Run » ; nom qui dit déjà la distance (« 10km Novemb'Run », « Semi de Paris ») : tel quel
function phRaceLabel(course, name){
  const short = { '5 km': '5 km', '10 km': '10 km', 'Semi-marathon': 'Semi', 'Marathon': 'Marathon' }[course] || '';
  name = String(name || '').trim();
  const flat = function(x){ return String(x).toLowerCase().replace(/[\s-]/g, ''); };
  if(!name || name === course) return short || name || 'Course objectif';
  if(!short || flat(name).indexOf(flat(short)) >= 0 || (short === 'Semi' && /semi/i.test(name)) || (short === 'Marathon' && /marathon/i.test(name))) return name;
  return short + ' ' + name;
}
const _phDay = function(a, b){ return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5); };
const _phCap = function(x){ x = String(x || ''); return x.charAt(0).toUpperCase() + x.slice(1); };
const _phHm = function(t){ const m = String(t || '').match(/^(\d{1,2})[:h](\d{2})/); return m ? +m[1] + 'h' + m[2] : ''; };
const _phEsc = function(x){ return String(x == null ? '' : x).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
// jour de la course en mots : « Aujourd'hui à 9h00 », « Demain », « Dimanche à 9h00 » (cette semaine), « Dimanche 6 déc. à 9h00 »
function phWhen(date, time, today){
  if(!date) return '';
  const d = _phDay(today, date), dt = new Date(date + 'T12:00:00'), hm = _phHm(time);
  const day = d === 0 ? 'Aujourd\'hui' : d === 1 ? 'Demain' : d > 1 && d <= 6 ? _phCap(dt.toLocaleDateString('fr-FR', { weekday: 'long' }))
    : _phCap(dt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }));
  return day + (hm && d >= 0 ? ' à ' + hm : '');
}
// o = {name, plaisir, race: {date, time, label}, pct, obj, pred, form, formWait} → textes de l'en-tête et de la carte « Ta course »
function phView(o, today, nowMin){
  o = o || {};
  const dt = new Date(today + 'T12:00:00');
  const day = dt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
  const R = o.race || {}, d = R.date ? _phDay(today, R.date) : null, pct = Math.max(0, Math.min(100, Math.round(+o.pct || 0)));
  const f = o.form == null ? null : Math.round(o.form), E = _phEsc;
  const line = o.pred ? 'Tu es prévu en <b>' + E(o.pred) + '</b>' + (o.obj ? ', pour un objectif de ' + E(o.obj) : '') + '.' : o.obj ? 'Ton objectif : <b>' + E(o.obj) + '</b>.' : '';
  return {
    eyebrow: _phCap(day),
    greet: phGreet(nowMin) + (o.name ? ' ' + o.name : ''),
    card: !o.plaisir && !!R.date,
    big: d == null ? '—' : d === 0 ? 'Jour J' : d > 0 ? 'J-' + d : 'J+' + (-d),
    race: R.label || 'Course objectif', when: phWhen(R.date, R.time, today),
    pct: pct, prog: d != null && d < 0 ? 'Prépa bouclée' : 'Prépa faite à ' + pct + ' %',
    line: line, why: !!o.pred,
    obj: o.obj || '', pred: o.pred || '',
    form: o.formWait ? '…' : f == null ? '—' : String(f),
    formCls: f == null || o.formWait ? '' : f >= 67 ? 'ok' : f >= 34 ? 'mid' : 'low'
  };
}
// l'étape du moment en clair : « CE SOIR · 18H00 », « Footing EF · 4 km », « À 5'45/km, avec les Evo SL »,
// « Le bouton « J'ai fini » apparaît à 17h30 » (séance encore loin : pas de bouton) — libellé mjNowInfo (my-day.js)
function phNowView(now, nowMin){
  const I = mjNowInfo(now, nowMin), up = function(x){ return String(x).toUpperCase(); };
  const extra = I.extra.filter(function(x){ return x.indexOf('mj-shoe') < 0; });
  const per = function(){ const when = now.tm ? _phHm(now.tm) : ''; return up((now.at < 12 * 60 ? 'Ce matin' : now.at < 18 * 60 ? 'Cet après-midi' : 'Ce soir') + (when ? ' · ' + when : '')); };
  if(now.kind !== 'sess') return { eb: /^Ensuite/.test(I.lab) ? per() : up(I.lab), title: now.t, sub: now.s || '', hint: '', btn: !!now.btn, extra: [] };   // plus tard dans la journée : « CE SOIR · 18H30 »
  const parts = String(now.s || '').split(' · '), km = /km$/.test(parts[0] || '') ? parts.shift() : '', pace = parts.join(' · ');
  const eb = I.early ? per() : up(I.lab);
  let sub = pace ? (/^~/.test(pace) ? 'Environ ' + pace.slice(1) : 'À ' + pace) : '';
  if(now.shoe) sub = sub ? sub + ', avec les ' + now.shoe : 'Avec les ' + now.shoe;
  const lab = String(now.btn || '').replace(/^[^A-Za-zÀ-ÿ]+/, '');
  const at = Math.max(0, now.at - 30);
  return { eb: eb, title: now.t + (km ? ' · ' + km : ''), sub: sub,
    hint: I.early && lab ? 'Le bouton « ' + lab + ' » apparaît à ' + Math.floor(at / 60) + 'h' + String(at % 60).padStart(2, '0') : '',
    btn: !!now.btn && !I.early, extra: /^À valider/.test(I.lab) ? [] : extra };
}
// forme du jour : une note + une phrase
function phFormHead(score, sess){
  if(score >= 67) return { t: 'Bonne forme', s: sess ? 'Feu vert pour ta séance.' : 'Ton corps est prêt.' };
  if(score >= 34) return { t: 'Forme moyenne', s: 'Écoute tes sensations.' };
  return { t: 'Récupération insuffisante', s: 'Privilégie le calme aujourd\'hui.' };
}
// « Bien récupéré, pas d'alcool hier soir. » (alc = niveau d'alcool d'hier soir, 0 = aucun, null = pas renseigné)
function phFormLine(score, alc){
  const a = score >= 67 ? 'Bien récupéré' : score >= 34 ? 'Récupération moyenne' : 'Peu récupéré';
  return a + (alc == null ? '' : +alc > 0 ? ', alcool hier soir (' + alc + '/10)' : ', pas d\'alcool hier soir') + '.';
}
// tes repères (30 dernières nuits, sans celle du jour) : pouls au repos et variabilité cardiaque médians
function phMeasureBase(st, day){
  const med = function(a){ if(a.length < 5) return null; a = a.slice().sort(function(x, y){ return x - y; }); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  const rh = [], hv = [];
  for(let i = 1; i <= 30; i++){
    const d = new Date(day + 'T12:00:00'); d.setDate(d.getDate() - i);
    const v = parseInt(st['fc_repos_' + d.toISOString().slice(0, 10)]); if(v >= 30 && v <= 100) rh.push(v);
  }
  ((st.whoop_data && st.whoop_data.recoveries) || []).forEach(function(r){
    if(r && r.date && r.date < day && _phDay(r.date, day) <= 30 && r.hrv != null && isFinite(+r.hrv)) hv.push(+r.hrv);
  });
  return { rhr: med(rh), hrv: med(hv) };
}
// les 4 mesures de la nuit, chacune avec sa phrase (N = wellnessNight(), B = phMeasureBase)
function phMeasures(N, B){
  N = N || {}; B = B || {};
  const out = [], col = function(v, g, o){ return v >= g ? 'ok' : v >= o ? 'mid' : 'low'; }, r = N.r || {}, s = N.s || {};
  if(r.score != null) out.push({ k: 'rec', t: 'Récupération', v: Math.round(r.score) + ' %', c: col(r.score, 67, 34),
    txt: r.score >= 67 ? 'Ton corps a bien récupéré cette nuit.' : r.score >= 34 ? 'Récupération moyenne : vas-y à l\'écoute.' : 'Peu récupéré : privilégie le calme.' });
  if(s.performance_pct != null) out.push({ k: 'sleep', t: 'Sommeil', v: Math.round(s.performance_pct) + ' %', c: col(s.performance_pct, 80, 60),
    txt: s.performance_pct >= 85 ? 'Presque tout le sommeil dont tu avais besoin.' : s.performance_pct >= 70 ? 'Un peu moins de sommeil que ton besoin.' : 'Nuit courte : couche-toi plus tôt ce soir.' });
  if(N.fc != null){
    const d = B.rhr != null ? Math.round(N.fc - B.rhr) : null, n = Math.abs(d), bt = n > 1 ? ' battements' : ' battement';
    out.push({ k: 'rhr', t: 'Pouls au repos', v: String(N.fc), c: d == null ? '' : d >= 5 ? 'low' : d >= 3 ? 'mid' : d <= -1 ? 'ok' : '',
      txt: d == null ? 'Ton pouls au repos cette nuit.' : d <= -1 ? n + bt + ' de moins que d\'habitude : bon signe.' : d === 0 ? 'Comme d\'habitude.'
        : n + bt + ' de plus que d\'habitude' + (d >= 5 ? ' : fatigue possible.' : '.') });
  }
  if(r.hrv != null){
    const h = Math.round(r.hrv), p = B.hrv ? (r.hrv - B.hrv) / B.hrv * 100 : null;
    out.push({ k: 'hrv', t: 'Variabilité cardiaque', v: h + ' ms', c: p == null ? '' : p > 5 ? 'ok' : p >= -5 ? '' : p >= -15 ? 'mid' : 'low',
      txt: p == null ? 'La variabilité de ton cœur cette nuit.' : p > 5 ? 'Au-dessus de ta moyenne : tu es reposé.' : p >= -5 ? 'Dans ta moyenne.'
        : p >= -15 ? 'Un peu sous ta moyenne.' : 'Bien sous ta moyenne : fatigue possible.' });
  }
  return out;
}

// ─── données réelles de l'app ────────────────────────────────────────────────
let _phPred = null, _phTools = false, _phFold = true, _phSessToday = false;
// forme du jour : la même valeur que la carte « Forme du jour » (jamais celle de la veille)
function phFormNow(today){
  today = today || prTodayIso();
  const F = state._form_today;
  if(F && F.date === today && F.score != null) return { score: F.score, why: F.why || [] };
  try { const G = typeof prFormScore === 'function' ? prFormScore() : null; return G ? { score: G.score, why: G.why || [] } : null; } catch(e) { diagSilent(e, 'piste-home:form'); return null; }
}
function _phCollect(today){
  const o = { name: typeof athleteFirstName === 'function' ? athleteFirstName() : '', plaisir: typeof isPlaisirMode === 'function' && isPlaisirMode() };
  const R = typeof prepRace === 'function' ? (prepRace() || {}) : {};
  const nm = String(R.name || '').trim();
  let time = '';
  try {   // heure de départ : celle de la séance « course » du jour J
    const rs = R.date && typeof prSessions === 'function' ? prSessions(state).filter(function(s){ return s.type === 'race' && s.x && s.x.sched_date === R.date; })[0] : null;
    if(rs) time = typeof _mjTime === 'function' ? _mjTime(state, rs) : (rs.x.sched_time || '');
  } catch(e) { diagSilent(e, 'piste-home:race'); }
  o.race = { date: R.date || '', time: time, label: phRaceLabel(R.course, nm) };
  try { const td = calcTotalDone(), gt = getGrandTotal(); o.pct = gt > 0 ? td / gt * 100 : 0; } catch(e) { diagSilent(e, 'piste-home:pct'); o.pct = 0; }
  const ob = state.onboarding || {}, tt = state.target_time || ob.target_time || '';
  o.obj = tt && typeof homeTimeTxt === 'function' ? homeTimeTxt(String(tt).replace(/^00:/, '')) : '';
  // temps prévu : la prédiction unique de l'app (gardée 30 s, recalculée après chaque séance par le rendu de l'accueil)
  const pk = today + '|' + (R.date || '') + '|' + (state._server_rev || '') + '|' + o.pct;
  if(!_phPred || _phPred.k !== pk || Date.now() - _phPred.t > 30000){
    let v = '';
    try {
      if(typeof predRace === 'function' && typeof predRaceCat === 'function'){ const c = predRaceCat(R), P = c ? predRace(c, today) : null; v = P ? phTime(P.sec) : ''; }
    } catch(e) { diagSilent(e, 'piste-home:pred'); }
    _phPred = { k: pk, t: Date.now(), v: v };
  }
  o.pred = _phPred.v;
  o.formWait = typeof whoopStartupLoading === 'function' && whoopStartupLoading();
  const F = phFormNow(today); o.form = F ? F.score : null;
  return o;
}

// ─── affichage ───────────────────────────────────────────────────────────────
const PH_CHEV = '<svg class="ph-chev" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>';
function _phInit(el){
  if(el.dataset.ready) return;
  el.dataset.ready = '1';
  el.innerHTML = '<div id="ph-top" class="ph-top"></div><div id="ph-chips" class="ph-chips" hidden></div><div id="ph-course"></div><div id="ph-blocks" class="ph-blocks"></div>';
  const chips = el.querySelector('#ph-chips'), blocks = el.querySelector('#ph-blocks');
  ['home-search-btn', 'notif-btn', 'wakeup-btn', 'home-sleep-btn', 'home-ef-pill', 'home-weather-loading', 'home-weather-strip', 'home-share-btn'].forEach(function(id){ const e = document.getElementById(id); if(e) chips.appendChild(e); });
  ['home-live-btn', 'home-no-race-btn'].forEach(function(id){ const e = document.getElementById(id); if(e) blocks.appendChild(e); });
  // la journée avant la Forme du jour
  const day = document.getElementById('home-day-card'), form = document.getElementById('home-form-card');
  if(day && form && form.parentNode) form.parentNode.insertBefore(day, form);
  const sec = function(id, title){ const d = document.createElement('div'); d.className = 'ph-sec'; d.id = id; d.innerHTML = '<h2>' + title + '</h2><span id="' + id + '-n"></span>'; return d; };
  if(day && day.parentNode) day.parentNode.insertBefore(sec('ph-sec-day', 'Aujourd\'hui'), day);
  if(form && form.parentNode) form.parentNode.insertBefore(sec('ph-sec-form', 'Forme du jour'), form);
  const pc = document.getElementById('home-plan-card');
  if(pc && pc.parentNode){ const sp = sec('ph-sec-plan', 'Ton plan'); sp.style.display = pc.style.display === 'none' ? 'none' : ''; pc.parentNode.insertBefore(sp, pc); }
  const sh = document.getElementById('home-sess-head');
  if(sh && sh.parentNode){ const wb = document.createElement('div'); wb.id = 'ph-weekbar'; wb.className = 'ph-weekbar'; sh.parentNode.insertBefore(wb, sh.nextSibling); }
  // sous les séances : renfo, régularité, partage en lignes simples (le renfo et la série s'ouvrent au toucher)
  const ex = document.getElementById('home-form-extra');
  if(ex && ex.parentNode){ const m = document.createElement('div'); m.id = 'ph-more'; m.className = 'ph-more-l'; ex.parentNode.insertBefore(m, ex); }
  // onglets : le renfo passe dans le Plan et l'accueil, Statistiques devient « Progrès »
  const ns = document.querySelector('#nav-stats .nav-btn-label'); if(ns) ns.textContent = 'Progrès';
}
function phTools(){
  _phTools = !_phTools;
  const c = document.getElementById('ph-chips'); if(c) c.hidden = !_phTools;
  const b = document.querySelector('#ph-top .ph-tools'); if(b){ b.classList.toggle('on', _phTools); b.setAttribute('aria-expanded', String(_phTools)); }
}
// la semaine : km faits sur prévus (en-tête de la liste, home-render.js), une barre par séance, séances faites sur prévues
function phWeekBar(){
  const wb = document.getElementById('ph-weekbar'); if(!wb) return;
  const km = (document.getElementById('week-total-km') || {}).textContent || '';
  const m = km.replace(/\s/g, '').match(/^([\d.,]+)\/([\d.,]+)km$/), tot = m ? m[2] : (km.match(/[\d.,]+/) || [''])[0], dn = m ? m[1] : '0';
  const cards = [].slice.call(document.querySelectorAll('#home-sessions .hs-card'));
  if(!cards.length && !tot){ wb.innerHTML = ''; return; }
  const nd = cards.filter(function(c){ return c.dataset.st === 'done'; }).length;
  let kind = '';
  try { const w = typeof homeViewWeek !== 'undefined' ? homeViewWeek : 0, M = JSON.parse(state['meta_w' + w] || '{}') || {}; kind = M.isTaper ? 'semaine d\'affûtage' : M.isRecov ? 'semaine allégée' : ''; } catch(e) {}
  const seg = cards.map(function(c){ const s = c.dataset.st; return '<i class="' + (s === 'done' ? 'd' : s === 'skip' ? 'x' : c.classList.contains('ph-next') ? 'n' : '') + '"></i>'; }).join('');
  const f = function(x){ return _phEsc(String(x).replace('.', ',')); };
  wb.innerHTML = '<section class="ph-ws" aria-label="Bilan de la semaine"><p class="ph-wsk"><b class="ph-wbk">' + f(dn) + '</b><span>km sur ' + f(tot || '0') + ' prévus</span></p>'
    + (cards.length ? '<div class="ph-wsg" style="grid-template-columns:repeat(' + cards.length + ',minmax(0,1fr))" aria-label="' + nd + ' séance' + (nd > 1 ? 's' : '') + ' faite' + (nd > 1 ? 's' : '') + ' sur ' + cards.length + '">' + seg + '</div>' : '')
    + '<p class="ph-wst">' + nd + ' séance' + (nd > 1 ? 's' : '') + ' faite' + (nd > 1 ? 's' : '') + ' sur ' + cards.length + (kind ? ' · ' + kind : '') + '</p></section>';
}
// séances faites repliées en une ligne « ✓ 2 séances faites · 18 km  Voir »
function phFoldRender(){
  const el = document.getElementById('home-sessions'); if(!el) return;
  const rows = el.querySelectorAll('.hs-row'), ok = el.querySelectorAll('.hs-row:not(.skip)').length, sk = rows.length - ok;
  let b = document.getElementById('ph-fold');
  if(!rows.length){ if(b) b.remove(); el.classList.remove('ph-fold'); return; }
  if(!b || b.parentNode !== el){ b = document.createElement('button'); b.type = 'button'; b.id = 'ph-fold'; b.className = 'ph-fold-b'; b.onclick = phFoldToggle; el.insertBefore(b, el.firstChild); }
  const km = (((document.getElementById('week-total-km') || {}).textContent || '').replace(/\s/g, '').match(/^([\d.,]+)\//) || [])[1];
  const lab = (ok ? ok + ' séance' + (ok > 1 ? 's' : '') + ' faite' + (ok > 1 ? 's' : '') + (km ? ' · ' + String(km).replace('.', ',') + ' km' : '') : '') + (sk ? (ok ? ' · ' : '') + sk + ' retirée' + (sk > 1 ? 's' : '') : '');
  b.setAttribute('aria-expanded', String(!_phFold));
  b.innerHTML = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3FCF7F" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg><span>' + _phEsc(lab) + '</span><small>' + (_phFold ? 'Voir' : 'Replier') + '</small>';
  el.classList.toggle('ph-fold', _phFold);
}
function phFoldToggle(){ _phFold = !_phFold; phFoldRender(); }
function phUnfold(){ if(_phFold && phIsOn()){ _phFold = false; phFoldRender(); } }
// sous les séances : Renfo de la semaine (s'ouvre ici), Ta régularité (badges), Partager ta semaine
function phMoreRender(){
  const el = document.getElementById('ph-more'); if(!el) return;
  const rows = [], row = function(on, t, s, aria){ rows.push('<button type="button" class="ph-mr" onclick="' + on + '"' + (aria || '') + '><span class="ph-mrt"><b>' + _phEsc(t) + '</b>' + (s ? '<small>' + _phEsc(s) + '</small>' : '') + '</span>' + PH_CHEV + '</button>'); };
  const rs = document.getElementById('home-renfo-section'), rf = document.getElementById('home-renfo');
  if(rs && rf && rf.children.length){
    const p = ((document.getElementById('renfo-progress') || {}).textContent || '').trim(), m = p.match(/^(\d+)\/(\d+)$/);
    const open = document.getElementById('sc-home').classList.contains('ph-rf-open');
    row('phRenfo()', 'Renfo de la semaine', m ? m[1] + ' sur ' + m[2] + ' fait' + (+m[2] > 1 ? 's' : '') : p === '—' ? 'Pas de renfo cette semaine' : 'Exercices de la semaine', ' aria-expanded="' + open + '"');
  }
  const ex = document.getElementById('home-form-extra'), sb = ex && ex.querySelector('.pd-streak b'), bd = ex && ex.querySelector('.pd-bdg-btn span');
  if(sb && typeof openBadges === 'function'){
    const n = +sb.textContent || 0, b = ((bd && bd.textContent) || '').match(/(\d+)\/(\d+)/);
    row('openBadges()', 'Ta régularité', n + ' séance' + (n > 1 ? 's' : '') + ' d\'affilée' + (b ? ' · ' + b[1] + ' badge' + (+b[1] > 1 ? 's' : '') + ' sur ' + b[2] : ''));
  }
  if(typeof openWeekShare === 'function') row('openWeekShare()', 'Partager ta semaine', 'Une image prête pour tes amis');
  el.innerHTML = rows.join('');
}
function phRenfo(){
  const sc = document.getElementById('sc-home'); if(!sc) return;
  const on = !sc.classList.contains('ph-rf-open'); sc.classList.toggle('ph-rf-open', on); phMoreRender();
  const rs = document.getElementById('home-renfo-section'); if(on && rs && rs.scrollIntoView) rs.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function phGoal(){ const b = document.getElementById('home-marathon-time-block'); if(b && typeof b.onclick === 'function') b.onclick(); else if(b) b.click(); }
function phRender(){
  if(!phIsOn() || typeof document === 'undefined') return false;
  const el = document.getElementById('home-piste'); if(!el) return false;
  try {
    _phCss(); _phInit(el); el.style.display = 'flex';
    const d = new Date(), nowMin = d.getHours() * 60 + d.getMinutes(), today = typeof prTodayIso === 'function' ? prTodayIso() : d.toISOString().slice(0, 10);
    const V = phView(_phCollect(today), today, nowMin);
    const mic = typeof coachAI === 'function' && coachAI() && typeof openCoachVoice === 'function';
    const nb = document.getElementById('notif-btn'), dot = !!(nb && nb.style.display !== 'none' && getComputedStyle(nb).display !== 'none');   // notifications pas encore actives
    document.getElementById('ph-top').innerHTML = '<div class="ph-hd"><p class="ph-eb">' + _phEsc(V.eyebrow) + '</p><h1 class="ph-hi">' + _phEsc(V.greet) + '</h1></div><div class="ph-acts">'
      + '<button type="button" class="ph-tools' + (_phTools ? ' on' : '') + '" onclick="phTools()" aria-controls="ph-chips" aria-expanded="' + _phTools + '" aria-label="Outils : recherche, notifications, nuit, allure, météo, partage">'
      + '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/></svg>'
      + (dot ? '<i class="ph-dot" aria-hidden="true"></i>' : '') + '</button>'
      + (mic ? '<button type="button" class="ph-mic" onclick="openCoachVoice()" aria-label="Parler au Coach à la voix"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>' : '') + '</div>';
    const ch = document.getElementById('ph-chips'); if(ch) ch.hidden = !_phTools;
    // calme : la forme du jour est dans « Aujourd'hui » → la grande carte, l'alcool et le bandeau de course (déjà dans « Ensuite ») se retirent
    const sc = document.getElementById('sc-home'), fr = document.getElementById('ph-fr');
    if(sc) sc.classList.toggle('ph-calm', !!fr);
    if(fr) fr.innerHTML = phFormRowHtml(_phSessToday);
    const vis = function(id){ const e = document.getElementById(id); return !!(e && e.innerHTML.trim()); };
    const sd = document.getElementById('ph-sec-day'), sf = document.getElementById('ph-sec-form');
    if(sd) sd.style.display = vis('home-day-card') ? '' : 'none';
    if(sf){ sf.style.display = vis('home-form-card') && !fr ? '' : 'none';
      const H = state._form_hist || {}, yd = typeof prAddDays === 'function' ? prAddDays(today, -1) : null, t = H[today], y = yd ? H[yd] : null;
      const n = document.getElementById('ph-sec-form-n'); if(n) n.textContent = t != null && y != null ? 'vs hier ' + (t - y >= 0 ? '+' : '−') + Math.abs(Math.round(t - y)) : ''; }
    // la semaine
    const cur = typeof homeViewWeek !== 'undefined' && typeof getEffectiveCW === 'function' && homeViewWeek === getEffectiveCW();
    const wl = document.getElementById('home-week-label'); if(wl && cur) wl.textContent = 'Cette semaine';
    const wd = document.getElementById('home-week-dates'); if(wd) wd.textContent = wd.textContent.replace(/^·\s*/, '');
    const cards = document.querySelectorAll('#home-sessions .hs-card'); let nx = false;
    [].forEach.call(cards, function(c){ const on = !nx && (c.dataset.st === 'today' || c.dataset.st === 'todo'); c.classList.toggle('ph-next', on); if(on) nx = true; });
    phWeekBar(); phFoldRender(); phMoreRender();
    const bl = document.getElementById('ph-blocks');
    if(bl) bl.style.display = [].some.call(bl.children, function(c){ return c.style.display !== 'none' && getComputedStyle(c).display !== 'none'; }) ? '' : 'none';
    const co = document.getElementById('ph-course');
    if(!V.card){ co.innerHTML = ''; }
    else co.innerHTML = '<section class="ph-cc" aria-label="Ta course"><button type="button" class="ph-cr" onclick="phGoal()" aria-label="' + _phEsc(V.big + ', ' + V.race + (V.when ? ', ' + V.when : '')) + '">'
      + '<b class="ph-big">' + _phEsc(V.big) + '</b><span class="ph-ci"><span class="ph-race">' + _phEsc(V.race) + '</span>' + (V.when ? '<span class="ph-when">' + _phEsc(V.when) + '</span>' : '') + '</span></button>'
      + '<div class="ph-pg"><span class="ph-pgb" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + V.pct + '" aria-label="' + _phEsc(V.prog) + '"><i style="width:' + V.pct + '%"></i></span><span class="ph-pgt">' + _phEsc(V.prog) + '</span></div>'
      + (V.line ? '<p class="ph-pl">' + V.line + (V.why ? ' <button type="button" class="ph-why" onclick="phGoal()">Pourquoi ?</button>' : '') + '</p>' : '') + '</section>';
    return true;
  } catch(e) { diagSilent(e, 'piste-home:phRender'); return false; }
}

// forme du jour en une ligne dans « Aujourd'hui » : anneau + note + une phrase ; détail au toucher (phFormOpen, piste-ui.js)
function _phRing(score, cls, size){
  const r = size / 2 - 4, C = 2 * Math.PI * r, c = size / 2;
  return '<span class="ph-fring ' + (cls || '') + '" style="width:' + size + 'px;height:' + size + 'px"><svg viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true"><circle class="t" cx="' + c + '" cy="' + c + '" r="' + r + '"/>'
    + (score == null ? '<circle class="s" cx="' + c + '" cy="' + c + '" r="' + r + '" stroke-dasharray="' + (C * 0.28).toFixed(1) + ' ' + C.toFixed(1) + '"/>' : '<circle class="a" cx="' + c + '" cy="' + c + '" r="' + r + '" stroke-dasharray="' + (C * Math.max(0, Math.min(100, score)) / 100).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 ' + c + ' ' + c + ')"/>')
    + '</svg>' + (score == null ? '' : '<b>' + Math.round(score) + '</b>') + '</span>';
}
function phFormRowHtml(sess){
  try {
    const WS = typeof wellnessState === 'function' ? wellnessState() : { kind: 'ok' };
    const load = WS.kind === 'loading' || (typeof whoopStartupLoading === 'function' && whoopStartupLoading());
    const msg = function(cls, t, s, btn){ return '<div class="ph-fr ' + cls + '"' + (cls === 'load' ? ' aria-busy="true"' : ' role="status"') + '>' + _phRing(null, cls, 50) + '<span class="ph-ft"><b>' + t + '</b><span>' + s + '</span></span>' + (btn || '') + '</div>'; };
    if(WS.kind === 'failed') return msg('fail', WS.auth ? 'WHOOP déconnecté' : 'Nuit WHOOP non chargée', 'Rien plutôt que les chiffres d\'hier.',
      WS.auth && typeof connectWhoop === 'function' ? '<button type="button" class="ph-fb" onclick="connectWhoop()">Reconnecter</button>' : '<button type="button" class="ph-fb" onclick="whoopRetry()">Réessayer</button>');
    if(WS.kind === 'pending') return msg('fail', 'Nuit pas encore disponible', 'WHOOP calcule ta récupération.', '<button type="button" class="ph-fb" onclick="whoopRetry()">Réessayer</button>');
    if(load) return msg('load', 'Mise à jour de ta nuit…', 'Ta forme du jour arrive.');
    if(WS.kind === 'waiting') return msg('wait', 'En attente du réveil', 'Ta forme du jour arrive au réveil.');
    const F = phFormNow(); if(!F) return '';
    let alc = null; try { const e = typeof alcEntry === 'function' && typeof alcDay === 'function' ? alcEntry(alcDay()) : null; if(e) alc = +e.l || 0; } catch(e) { diagSilent(e, 'piste-home:alc'); }
    const cls = F.score >= 67 ? 'ok' : F.score >= 34 ? 'mid' : 'low', H = phFormHead(F.score, sess);
    return '<button type="button" class="ph-fr ' + cls + '" onclick="phFormOpen()" aria-label="' + _phEsc('Forme du jour ' + F.score + ' sur 100 : ' + H.t + '. Voir le détail') + '">' + _phRing(F.score, cls, 50)
      + '<span class="ph-ft"><b>' + H.t + '</b><span>' + _phEsc(phFormLine(F.score, alc)) + '</span></span>' + PH_CHEV + '</button>';
  } catch(e) { diagSilent(e, 'piste-home:phFormRowHtml'); return ''; }
}

// « Ma journée » en version apaisée : Aujourd'hui (forme, étape du moment, ce qui est fait) puis « Ensuite »
const PH_CK = '<svg class="ph-ck" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round"><path d="M5 12l5 5 9-10"/></svg>';
function phDayHtml(L, nowMin){
  _phCss();
  const E = _phEsc, now = L.filter(function(x){ return x.st === 'now'; })[0], later = L.filter(function(x){ return x.st === 'later'; });
  const done = L.filter(function(x){ return x.st === 'done'; }), n = L.filter(function(x){ return !x.info && !x.soft; }), nd = n.filter(function(x){ return x.done; }).length;
  const secN = typeof document !== 'undefined' && document.getElementById('ph-sec-day-n'); if(secN) secN.textContent = n.length ? nd + ' sur ' + n.length + ' fait' + (n.length > 1 ? 's' : '') : '';
  _phSessToday = L.some(function(x){ return x.kind === 'sess' && !x.done; });
  const inner = [];
  if(now){
    const V = phNowView(now, nowMin), I = mjNowInfo(now, nowMin);
    const ear = now.listen && typeof coachAI === 'function' && coachAI() && typeof openCoachVoice === 'function';
    inner.push('<div class="ph-now" role="group" aria-label="' + E(I.lab + ' : ' + now.t) + '"><p class="ph-eb2">' + E(V.eb) + '</p>'
      + '<button type="button" class="ph-nb"' + (now.act ? ' onclick="' + now.act + '"' : '') + '><b>' + E(V.title) + '</b>' + (V.sub ? '<span>' + E(V.sub) + '</span>' : '') + '</button>'
      + (V.extra.length ? '<div class="ph-ex">' + V.extra.join('') + '</div>' : '')
      + (V.hint ? '<p class="ph-hint"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>' + E(V.hint) + '</p>' : '')
      + (V.btn || ear ? '<div class="ph-na">' + (ear ? '<button type="button" class="mj-go mj-ear" onclick="openCoachVoice({brief:true})" aria-label="Écouter le brief">🎧</button>' : '')
        + (V.btn ? '<button type="button" class="mj-go" onclick="' + (now.btnAct || now.act) + '">' + now.btn + '</button>' : '') + '</div>' : '') + '</div>');
  }
  const rows = [];
  done.filter(function(x){ return x.kind === 'sess'; }).forEach(function(x){
    const go = typeof openSessionPiste === 'function' ? 'openSessionPiste(\'' + x.key + '\')' : x.act;
    rows.push('<div class="ph-li"><button type="button" class="ph-lb" onclick="' + go + '">' + PH_CK + '<b>' + E(x.t) + '</b><span>' + E(x.s) + '</span></button>'
      + (x.share && typeof openSessionShare === 'function' ? '<button type="button" class="mj-sh" onclick="openSessionShare(\'' + x.key + '\')" aria-label="Image de ta séance à partager">📸</button>' : '') + '</div>');
  });
  const dc = done.filter(function(x){ return x.kind !== 'sess'; });
  // fait : une ligne « ✓ Réveil · Alcool 6/10 · Brief · Repos »
  if(dc.length || (!now && !rows.length)) rows.unshift('<div class="ph-li ph-dl">' + PH_CK + '<span class="ph-dli">' + (dc.length ? dc.map(function(x){
    return '<button type="button"' + (x.act ? ' onclick="' + x.act + '"' : '') + '>' + E(x.short || x.t) + '</button>'; }).join('<i aria-hidden="true">·</i>') : '<b>Journée bouclée</b>') + '</span></div>');
  if(rows.length) inner.push('<div class="ph-list">' + rows.join('') + '</div>');
  let h = '<div class="ph-day"><section class="ph-today" aria-label="Aujourd\'hui"><div id="ph-fr">' + phFormRowHtml(_phSessToday) + '</div>'
    + (inner.length ? '<div class="ph-tb">' + inner.join('') + '</div>' : '') + '</section>';
  // ensuite : lignes simples (heure, quoi) ; semaine de la course : le plan de course km par km
  const ens = [];
  let R = null; try { R = typeof prepRace === 'function' ? prepRace() : null; } catch(e) { diagSilent(e, 'piste-home:race'); }
  const today = typeof prTodayIso === 'function' ? prTodayIso() : '', dR = R && R.date && today ? _phDay(today, R.date) : null;
  const raceRow = dR != null && dR >= 0 && dR <= 6 && typeof openRacePlan === 'function';
  later.forEach(function(x){
    if(raceRow && x.id === 'next' && x.date === R.date) return;
    const tcol = x.id === 'next' ? String(x.day || '').replace(/^(Lun|Mar|Mer|Jeu|Ven|Sam|Dim) /, '$1. ') : x.tm ? _phHm(x.tm) : x.id === 'bed' ? 'Ce soir' : x.at < 11 * 60 ? 'Matin' : '';
    const title = x.id === 'next' ? (x.title || x.t) + (x.s ? ' · ' + x.s : '') : x.t;
    ens.push({ t: tcol, n: title, a: x.act });
  });
  if(raceRow) ens.push({ t: dR === 0 ? 'Auj.' : dR === 1 ? 'Demain' : _phCap(new Date(R.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short' })), n: 'La course : ton plan km par km', a: 'openRacePlan()' });
  if(ens.length){
    const open = typeof _mjOpen !== 'undefined' && _mjOpen, shown = open ? ens : ens.slice(0, 3);
    h += '<div class="ph-ens"><p class="ph-h3">Ensuite</p><div class="ph-el">' + shown.map(function(r){
      return '<button type="button" class="ph-er"' + (r.a ? ' onclick="' + r.a + '"' : '') + '><span class="ph-et">' + E(r.t) + '</span><span class="ph-en">' + E(r.n) + '</span>' + PH_CHEV + '</button>'; }).join('')
      + (ens.length > 3 ? '<button type="button" class="ph-er ph-more" onclick="mjToggle()">' + (open ? 'Moins' : '+ ' + (ens.length - 3) + ' autre' + (ens.length > 4 ? 's' : '')) + '</button>' : '') + '</div></div>';
  }
  return h + '</div>';
}

function _phCss(){
  if(typeof document === 'undefined' || document.getElementById('ph-css')) return;
  const st = document.createElement('style'); st.id = 'ph-css'; st.dataset.th = '1';      // couleurs déjà « piste » : jamais converties
  const BS = "'Big Shoulders Display',Manrope,sans-serif", P = 'html[data-theme=dark][data-piste]';
  // palette : page #070B16, carte #111A2E, carte en avant #1C2645 → #141D36, creux #0A1020, filet #1E2944,
  // texte #EEF1F8, libellés #C9D1E4, secondaire #9AA4BF, discret #7C87A3, orange #E0603A, vert #3FCF7F / #6EE7A0
  st.textContent = '#home-piste{flex-direction:column;gap:16px;padding:calc(env(safe-area-inset-top,0px) + 14px) 16px 4px;color:#EEF1F8;}'
    + '.ph-top{display:flex;align-items:center;justify-content:space-between;gap:12px;}.ph-hd{min-width:0;display:flex;flex-direction:column;gap:4px;}'
    + '.ph-eb{margin:0;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#7C87A3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.ph-hi{margin:0;font-size:24px;font-weight:800;letter-spacing:-.02em;line-height:1.15;color:#EEF1F8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.ph-acts{display:flex;gap:10px;flex-shrink:0;}'
    + '.ph-tools,.ph-mic{position:relative;width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;flex-shrink:0;}'
    + '.ph-tools{border:1px solid #1E2944;background:#111A2E;color:#C9D1E4;}.ph-tools.on{border-color:#E0603A;color:#E0603A;}'
    + '.ph-dot{position:absolute;top:9px;right:9px;width:8px;height:8px;border-radius:50%;background:#E0603A;box-shadow:0 0 0 2px #111A2E;}'
    + '.ph-mic{border:none;background:#E0603A;color:#1A0A04;box-shadow:0 6px 18px rgba(224,96,58,.35);}'
    + '.ph-tools:focus-visible,.ph-mic:focus-visible,.ph-cr:focus-visible,.ph-why:focus-visible,.ph-fr:focus-visible,.ph-er:focus-visible,.ph-mr:focus-visible,.ph-fold-b:focus-visible{outline:2px solid #E0603A;outline-offset:2px;}'
    + '.ph-chips{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:12px;border-radius:20px;background:#0A1020;box-shadow:inset 0 0 0 1px #1E2944;}.ph-chips[hidden]{display:none!important;}'
    + '.ph-chips>*{flex-shrink:0;margin:0!important;}.ph-chips:empty,.ph-blocks:empty{display:none;}'
    + '.ph-blocks{display:flex;flex-direction:column;gap:10px;}.ph-blocks>*{margin-bottom:0!important;}'
    // ─ carte « Ta course » : un seul grand chiffre
    + '.ph-cc{border-radius:24px;padding:18px 20px;background:linear-gradient(160deg,#1C2645,#141D36);box-shadow:0 14px 34px rgba(0,0,0,.45);display:flex;flex-direction:column;gap:14px;}'
    + '.ph-cr{display:flex;align-items:center;gap:18px;border:none;background:none;padding:0;color:inherit;font:inherit;text-align:left;cursor:pointer;min-width:0;}'
    + '.ph-big{font-family:' + BS + ';font-weight:800;font-size:60px;line-height:.9;color:#EEF1F8;white-space:nowrap;flex-shrink:0;}'
    + '.ph-ci{display:flex;flex-direction:column;gap:3px;min-width:0;}.ph-race{font-size:17px;font-weight:800;color:#EEF1F8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.ph-when{font-size:14px;color:#9AA4BF;}'
    + '.ph-pg{display:flex;flex-direction:column;gap:8px;}.ph-pgb{display:block;height:6px;border-radius:3px;background:#0A1020;overflow:hidden;}.ph-pgb i{display:block;height:100%;border-radius:3px;background:#E0603A;}.ph-pgt{font-size:13px;color:#9AA4BF;}'
    + '.ph-pl{margin:0;font-size:15px;line-height:1.45;color:#DCE2EF;}.ph-pl b{color:#EEF1F8;font-variant-numeric:tabular-nums;}'
    + '.ph-why{border:none;background:none;padding:0;font:inherit;font-weight:700;color:#E0603A;cursor:pointer;}'
    // ─ titres de section
    + '.ph-sec{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:18px 16px 0;}'
    + '.ph-sec h2{margin:0;font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#C9D1E4;}'
    + '.ph-sec>span{font-size:13px;color:#7C87A3;font-variant-numeric:tabular-nums;}'
    + P + ' #home-day-card{padding-top:10px!important;}' + P + ' #home-form-card{padding-top:8px!important;}'
    // ─ Aujourd'hui : forme du jour, étape du moment, ce qui est fait
    + '.ph-day{display:flex;flex-direction:column;gap:18px;}'
    + '.ph-today{border-radius:24px;background:#111A2E;box-shadow:0 8px 22px rgba(0,0,0,.35);overflow:hidden;}.ph-today:not(:has(.ph-tb)):has(#ph-fr:empty){display:none;}'
    + '#ph-fr:not(:empty)+.ph-tb{position:relative;}#ph-fr:not(:empty)+.ph-tb::before{content:"";position:absolute;top:0;left:18px;right:18px;height:1px;background:#1E2944;}'
    + '.ph-fr{width:100%;min-height:82px;box-sizing:border-box;border:none;background:transparent;color:inherit;font:inherit;text-align:left;padding:16px 18px;display:flex;align-items:center;gap:14px;}button.ph-fr{cursor:pointer;}'
    + '.ph-fring{position:relative;flex-shrink:0;display:flex;align-items:center;justify-content:center;}.ph-fring svg{position:absolute;inset:0;width:100%;height:100%;}'
    + '.ph-fring .t{fill:none;stroke:#0A1020;stroke-width:5;}.ph-fring .a{fill:none;stroke:#3FCF7F;stroke-width:5;stroke-linecap:round;}.ph-fring .s{fill:none;stroke:#4FB3D9;stroke-width:5;stroke-linecap:round;transform-origin:center;animation:phSpin 1.1s linear infinite;}'
    + '.ph-fring.mid .a{stroke:#F2C14E;}.ph-fring.low .a{stroke:#F28B6E;}.ph-fring.wait .s,.ph-fring.fail .s{animation:none;stroke:#2A3A63;}'
    + '.ph-fring b{position:relative;font-family:' + BS + ';font-weight:800;font-size:22px;color:#6EE7A0;}.ph-fring.mid b{color:#F2C14E;}.ph-fring.low b{color:#F28B6E;}'
    + '@keyframes phSpin{to{transform:rotate(360deg);}}@media (prefers-reduced-motion:reduce){.ph-fring .s{animation:none;}}'
    + '.ph-ft{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;}.ph-ft b{font-size:16px;font-weight:800;color:#EEF1F8;}.ph-ft>span{font-size:14px;color:#9AA4BF;line-height:1.35;}'
    + '.ph-chev{flex-shrink:0;color:#7C87A3;}'
    + '.ph-fb{flex-shrink:0;height:40px;border-radius:20px;border:1px solid #2A3A63;background:transparent;color:#EEF1F8;font:inherit;font-size:14px;font-weight:700;padding:0 14px;cursor:pointer;}'
    + '.ph-tb{display:flex;flex-direction:column;}'
    + '.ph-now{padding:16px 18px 18px;display:flex;flex-direction:column;gap:6px;}'
    + '.ph-eb2{margin:0;font-size:12px;font-weight:800;letter-spacing:.1em;color:#E0603A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.ph-nb{display:flex;flex-direction:column;gap:6px;border:none;background:none;padding:0;color:#EEF1F8;font:inherit;text-align:left;cursor:pointer;min-width:0;}'
    + '.ph-nb b{font-size:21px;font-weight:800;letter-spacing:-.01em;line-height:1.2;}.ph-nb span{font-size:14px;color:#9AA4BF;font-variant-numeric:tabular-nums;}'
    + '.ph-hint{margin:8px 0 0;display:flex;align-items:center;gap:8px;font-size:13px;color:#7C87A3;}.ph-hint svg{flex-shrink:0;}'
    + '.ph-ex{font-size:13px;color:#9AA4BF;}.ph-ex p{margin:0!important;}'
    + '.ph-na{display:flex;gap:10px;margin-top:10px;}'
    + '.ph-now .mj-go{flex:1;min-height:48px;border:none;border-radius:24px;background:#E0603A;color:#1A0A04;padding:0 18px;font:inherit;font-size:15px;font-weight:800;cursor:pointer;white-space:nowrap;}'
    + '.ph-now .mj-go.mj-ear{flex:0 0 auto;width:48px;padding:0;background:transparent;border:1px solid #2A3A63;color:#EEF1F8;}'
    + '.ph-list{display:flex;flex-direction:column;margin:0 18px;border-top:1px solid #1E2944;}.ph-tb>.ph-list:first-child{border-top:none;}'
    + '.ph-li{display:flex;align-items:center;gap:10px;min-height:48px;border:none;border-bottom:1px solid #1E2944;background:none;padding:0;color:#C9D1E4;font:inherit;text-align:left;width:100%;min-width:0;}.ph-li:last-child{border-bottom:none;}'
    + '.ph-li b{flex:0 1 auto;font-size:14px;font-weight:700;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.ph-lb{flex:1;min-width:0;display:flex;align-items:center;gap:10px;border:none;background:none;padding:0;color:inherit;font:inherit;text-align:left;cursor:pointer;min-height:48px;}'
    + '.ph-lb>span{margin-left:auto;font-size:13px;color:#9AA4BF;white-space:nowrap;min-width:0;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums;padding-left:8px;}'
    + '.ph-ck{stroke:#3FCF7F;flex-shrink:0;}'
    + '.ph-dli{display:flex;align-items:center;gap:5px;min-width:0;white-space:nowrap;overflow:hidden;}.ph-dli button{border:none;background:none;padding:4px 0;color:#9AA4BF;font:inherit;font-size:14px;font-weight:600;cursor:pointer;flex-shrink:0;}.ph-dli i{font-style:normal;color:#4A5675;}.ph-dli b{font-size:14px;font-weight:700;}'
    + '.ph-li .mj-sh{width:36px;height:36px;border-radius:12px;border:1px solid #2A3A63;background:transparent;font-size:15px;cursor:pointer;flex-shrink:0;}'
    // ─ ensuite : lignes simples
    + '.ph-ens{display:flex;flex-direction:column;}.ph-h3{margin:0 0 6px;font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#C9D1E4;}'
    + '.ph-el{display:flex;flex-direction:column;}'
    + '.ph-er{display:flex;align-items:center;gap:12px;min-height:48px;border:none;border-bottom:1px solid #1E2944;background:none;padding:0;color:#EEF1F8;font:inherit;text-align:left;cursor:pointer;width:100%;min-width:0;}.ph-er:last-child{border-bottom:none;}'
    + '.ph-et{width:58px;flex-shrink:0;font-size:14px;font-weight:700;color:#9AA4BF;white-space:nowrap;font-variant-numeric:tabular-nums;}'
    + '.ph-en{flex:1;min-width:0;font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.ph-more{color:#E0603A;font-size:14px;font-weight:700;}'
    // ─ calme : la forme du jour est dans « Aujourd'hui » ; carte Forme, alcool et bandeau de course retirés de l'accueil
    + P + ' #sc-home.ph-calm #home-form-card .pd-form,' + P + ' #sc-home.ph-calm #home-form-card .alc-home.zero,' + P + ' #sc-home.ph-calm #home-form-card .alc-home.ask,'
    + P + ' #sc-home.ph-calm #home-form-card .alc-split,' + P + ' #sc-home.ph-calm #home-form-card .alc-chip,' + P + ' #sc-home.ph-calm #home-form-card .pd-raceb{display:none!important;}'
    + P + ' #home-form-extra{display:none!important;}' + P + ' #sc-home:not(.ph-rf-open) #home-renfo-section{display:none!important;}' + P + ' #nav-renfo{display:none!important;}'
    // ─ la semaine : navigation, bilan, séances faites repliées, prochaine séance en avant
    + P + ' #home-sess-head{display:none!important;}'
    + P + ' #home-week-nav{padding:22px 16px 4px!important;}'
    + P + ' #home-week-nav>div>div:first-child{flex-direction:column!important;align-items:center!important;gap:2px!important;}'
    + P + ' #home-week-prev,' + P + ' #home-week-next{width:44px!important;height:44px!important;border:1px solid #1E2944!important;background:transparent!important;}'
    + P + ' #home-week-label{font-size:13px!important;font-weight:800!important;letter-spacing:.12em!important;text-transform:uppercase;color:#C9D1E4!important;}' + P + ' #home-week-dates{font-size:13px!important;font-weight:500!important;color:#7C87A3!important;}'
    + '.ph-weekbar{padding:8px 16px 2px;}'
    + '.ph-ws{border-radius:24px;padding:18px 20px;background:#111A2E;box-shadow:0 8px 22px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:12px;}'
    + '.ph-wsk{margin:0;display:flex;align-items:baseline;gap:8px;}.ph-wbk{font-family:' + BS + ';font-weight:800;font-size:44px;line-height:1;color:#EEF1F8;}.ph-wsk span{font-size:15px;color:#9AA4BF;}'
    + '.ph-wsg{display:grid;gap:6px;}.ph-wsg i{display:block;height:8px;border-radius:4px;background:#0A1020;box-shadow:inset 0 0 0 1px #2A3A63;}.ph-wsg i.d{background:#E0603A;box-shadow:none;}.ph-wsg i.n{background:#2A3A63;box-shadow:none;}.ph-wsg i.x{background:#3A2530;box-shadow:none;}'
    + '.ph-wst{margin:0;font-size:14px;color:#9AA4BF;}'
    + '.ph-fold-b{display:flex;align-items:center;gap:12px;min-height:52px;width:100%;border:none;border-radius:18px;background:#0A1020;box-shadow:inset 0 0 0 1px #1E2944;color:#C9D1E4;font:inherit;text-align:left;padding:0 16px;cursor:pointer;}'
    + '.ph-fold-b span{flex:1;min-width:0;font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.ph-fold-b small{font-size:13px;color:#7C87A3;}.ph-fold-b svg{flex-shrink:0;}'
    + P + ' #home-sessions.ph-fold>.hs-row,' + P + ' #home-sessions.ph-fold>.hs-card[data-st=done],' + P + ' #home-sessions.ph-fold>.hs-card[data-st=skip]{display:none!important;}'
    + P + ' #home-sessions .hs-row{background:#0A1020!important;border:none!important;box-shadow:inset 0 0 0 1px #1E2944!important;}'
    + P + ' #home-sessions .hs-card{background:#111A2E!important;border:none!important;border-radius:20px!important;opacity:1;box-shadow:0 8px 22px rgba(0,0,0,.35)!important;}'
    + P + ' #home-sessions .hs-card[data-st=past]{opacity:.6;}'
    + P + ' #home-sessions .hs-card.ph-next{background:linear-gradient(160deg,#1C2645,#141D36)!important;box-shadow:0 12px 28px rgba(0,0,0,.42),inset 0 0 0 1px #E0603A!important;}'
    + P + ' #home-sessions .hs-card.ph-next:not([data-st=today])::after{content:"PROCHAINE";position:absolute;top:-8px;right:14px;font-size:10px;font-weight:800;letter-spacing:.08em;color:#1A0A04;background:#E0603A;border-radius:6px;padding:2px 7px;}'
    + P + ' #home-sessions .hs-card[data-type=race]{background:#111A2E!important;box-shadow:0 8px 22px rgba(0,0,0,.35),inset 0 0 0 1px rgba(242,193,78,.45)!important;}'
    + '.ph-more-l{display:flex;flex-direction:column;padding:6px 16px 8px;}'
    + '.ph-mr{display:flex;align-items:center;gap:12px;min-height:56px;border:none;border-bottom:1px solid #1E2944;background:none;padding:0;color:#EEF1F8;font:inherit;text-align:left;cursor:pointer;width:100%;}.ph-mr:last-child{border-bottom:none;}'
    + '.ph-mrt{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}.ph-mrt b{font-size:15px;font-weight:700;}.ph-mrt small{font-size:13px;color:#7C87A3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.ph-mr[aria-expanded=true] .ph-chev{transform:rotate(90deg);}'
    // Forme du jour (carte complète, quand « Aujourd'hui » n'est pas affiché : prépa consultée, mode plaisir)
    + P + ' .pd-form.ok,' + P + ' .pd-form.mid,' + P + ' .pd-form.low,' + P + ' .pd-form.load{border-radius:22px!important;padding:14px!important;background:#111A2E!important;border:none!important;box-shadow:0 8px 22px rgba(0,0,0,.35)!important;}'
    + P + ' .pd-form.wait,' + P + ' .pd-form.fail{border-radius:22px!important;padding:14px!important;background:#111A2E!important;border:none!important;box-shadow:0 8px 22px rgba(0,0,0,.35)!important;}'
    + P + ' .pd-form .g-bg{stroke:#0A1020!important;}' + P + " .pd-form .pd-gauge text{font-family:" + BS + ";font-size:24px;font-weight:800;}"
    + P + ' .pd-form.ok .pd-gauge text{fill:#6EE7A0;}' + P + ' .pd-form.mid .pd-gauge text{fill:#F2C14E;}' + P + ' .pd-form.low .pd-gauge text{fill:#F28B6E;}'
    + P + ' .pd-form.ok .g-fg{stroke:#3FCF7F!important;}' + P + ' .pd-form.mid .g-fg{stroke:#F2C14E!important;}' + P + ' .pd-form.low .g-fg{stroke:#F28B6E!important;}' + P + ' .pd-form.load .g-spin{stroke:#4FB3D9;}'
    + P + ' .pd-mini span{background:#0A1020!important;border:none!important;box-shadow:none!important;}'
    + P + ' .pd-raceb{background:#111A2E!important;border:1px solid rgba(242,193,78,.45)!important;box-shadow:0 8px 22px rgba(0,0,0,.35)!important;color:#F2E6C8!important;}'
    + P + ' .hs-row .hs-d[title],' + P + ' .hs-row .hs-ch{display:none;}' + P + ' .hs-row{border-radius:14px;padding:9px 12px;font-size:13px;}' + P + ' .hs-row .hs-share{flex-shrink:0;}'
    + P + ' #safe-top{background:rgba(7,11,22,.94)!important;height:calc(env(safe-area-inset-top,0px) + 6px);}';
  document.head.appendChild(st);
}
