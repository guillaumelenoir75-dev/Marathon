// ─── Thème « Piste de nuit » : Plan en couloirs, plan de course du jour J, séance faite, Progrès, voix et renfo ─────
// Seulement avec html[data-piste] (phIsOn, piste-home.js). Rien ne change dans les calculs : mêmes fonctions que les écrans habituels.
//  • Plan (#plan-piste, au-dessus de la liste des semaines) : pastilles S1 · 28 km… ; la semaine en 7 couloirs (jour, séance,
//    barre ∝ km, km) ; détail du jour touché (consigne, Modifier / Valider / Voir la séance / En parler au Coach, plan de course,
//    renfo guidé). Moteur : psWeekLanes(st, w, today), psWeeks(st).
//  • Plan de course (openRacePlan) : temps visé en grand sur carte claire, Objectif / Réaliste / Mon temps, allure km par km en
//    barres, tuiles Météo / Échauffement / Boire (psRaceTop, appelé par _pdRaceRender).
//  • Séance faite (openSessionPiste(key)) : km en grand, durée / allure / FC / cadence, allure par km en barres (au-dessus de la
//    ligne = plus rapide que la consigne), ressenti 1-10 enregistré (perf.rpe → sessionChanged), analyse du Coach, image.
//    Moteur : psSplitBars(splits, paceLo).
//  • Progrès (#stats-piste, en tête de Statistiques) : niveau du moment, courbe 3 / 6 mois, temps équivalents 5 km → marathon,
//    allures par zone. Moteur : psLevelView(hist, n).
//  • Renfo guidé (#rg-ov) : même écran, aux couleurs de la piste (feuille #ps-css) ; le Coach à la voix a son propre style « relief ».

const PS_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const PS_KIND = { ef: 'ef', long: 'ef', tempo: 'key', frac: 'key', race: 'race' };
const PS_TAG = { ef: 'Endurance', key: 'Séance clé', race: 'Jour J', renfo: 'Renfo', rest: 'Récupération' };
const _psE = function(x){ return typeof prEsc === 'function' ? prEsc(x) : String(x == null ? '' : x); };
const _psKm = function(v){ v = Math.round((+v || 0) * 10) / 10; return String(v).replace('.', ','); };
function _psJ(s){ try { return typeof s === 'string' ? JSON.parse(s) : s; } catch(e) { return null; } }

// semaines du plan : [{w, km}] (km prévus, ou faits pour les séances faites)
function psWeeks(st){
  const W = {};
  prSessions(st).forEach(function(s){ if(s.type === 'rest' || s.skip) return; W[s.w] = (W[s.w] || 0) + (s.done ? s.km : s.kmPlan); });
  return Object.keys(W).map(Number).sort(function(a, b){ return a - b; }).map(function(w){ return { w: w, km: Math.round(W[w]) }; });
}
// une semaine en 7 couloirs : {w, mon, sun, km, kmDone, phase, days: [{date, d, n, today, items, renfo, kind, title, km, done, pct}]}
function psWeekLanes(st, w, today){
  if(!st.plan_start_date) return null;
  const mon = prAddDays(prIso(prMonday(st.plan_start_date)), (w - 1) * 7), sun = prAddDays(mon, 6);
  const inW = function(d){ return d && d >= mon && d <= sun; };
  const days = PS_DAYS.map(function(d, i){ const date = prAddDays(mon, i); return { date: date, d: d, n: +date.slice(8, 10), today: date === today, items: [], renfo: [] }; });
  prSessions(st).filter(function(s){ return s.w === w && s.type !== 'rest'; }).forEach(function(s){
    let d = inW(s.date) ? s.date : inW(s.x && s.x.sched_date) ? s.x.sched_date : s.x && s.x.sched_day ? prAddDays(mon, +s.x.sched_day - 1) : null;
    if(!d) return;
    let sc = _psJ(st[s.key + '_sched']) || {};
    const title = typeof normalizeSessionTitle === 'function' ? normalizeSessionTitle(s.title, s.type, s.detail) : s.title;
    days[prDays(mon, d)].items.push({ key: s.key, w: s.w, ei: s.ei, type: s.type, kind: PS_KIND[s.type] || 'ef', title: title, detail: String(s.detail || '').trim(),
      km: s.done ? s.km : s.kmPlan, kmPlan: s.kmPlan, done: s.done, skip: s.skip, pace: s.pace ? s.pace.text.replace(/\s+/g, ' ') : '', perfPace: s.perf && s.perf.pace ? String(s.perf.pace).replace(':', '\'') : '',
      time: sc.time || (s.x && s.x.sched_time) || '' });
  });
  if(!st['rf' + w + 'skip']) [1, 2].forEach(function(r){
    const sc = _psJ(st['rf' + w + 'r' + r + 'sched']); if(!sc || !(+sc.day >= 1 && +sc.day <= 7)) return;
    const name = typeof getRenfoData === 'function' ? ((getRenfoData(r) || {}).name || 'Renfo') : 'Renfo';
    days[+sc.day - 1].renfo.push({ r: r, name: name, time: sc.time || '', done: !!st['rf' + w + 'r' + r + 'done'] });
  });
  let km = 0, kmDone = 0, mx = 0;
  days.forEach(function(D){
    const it = D.items.filter(function(x){ return !x.skip; });
    D.km = Math.round(it.reduce(function(a, x){ return a + (x.km || 0); }, 0) * 10) / 10;
    D.kind = it.some(function(x){ return x.kind === 'race'; }) ? 'race' : it.some(function(x){ return x.kind === 'key'; }) ? 'key' : it.length ? 'ef' : D.renfo.length ? 'renfo' : 'rest';
    D.title = D.items.length ? D.items.map(function(x){ return x.title; }).join(' + ') : D.renfo.length ? 'Renfo · ' + D.renfo[0].name : 'Repos';
    D.done = D.items.length ? D.items.every(function(x){ return x.done || x.skip; }) && D.items.some(function(x){ return x.done; }) : D.renfo.length > 0 && D.renfo.every(function(x){ return x.done; });
    D.skip = D.items.length > 0 && D.items.every(function(x){ return x.skip; });
    km += D.km; kmDone += it.filter(function(x){ return x.done; }).reduce(function(a, x){ return a + (x.km || 0); }, 0); mx = Math.max(mx, D.km);
  });
  const scale = Math.max(10, mx);
  days.forEach(function(D){ D.pct = Math.round(D.km / scale * 100); });
  const meta = _psJ(st['meta_w' + w]) || {};
  const PH = { 1: 'base', 2: 'construction', 3: 'spécifique', 4: 'affûtage' };
  const phase = meta.isTaper ? 'affûtage' : meta.isRecov ? 'récupération' : typeof meta.phase === 'string' ? meta.phase.toLowerCase() : PH[meta.phase] || '';
  return { w: w, mon: mon, sun: sun, km: Math.round(km * 10) / 10, kmDone: Math.round(kmDone * 10) / 10, phase: phase, days: days };
}

// ─── Plan en couloirs ────────────────────────────────────────────────────────
let _psPlan = { w: null, day: null };
function psPlanRender(){
  const el = typeof document !== 'undefined' ? document.getElementById('plan-piste') : null; if(!el) return false;
  try {
    if(!(typeof phIsOn === 'function' && phIsOn()) || !state.plan_start_date){ el.style.display = 'none'; return false; }
    _psCss(); el.style.display = 'flex';
    const today = prTodayIso(), weeks = psWeeks(state); if(!weeks.length){ el.style.display = 'none'; return false; }
    const cur = typeof getEffectiveCW === 'function' ? getEffectiveCW() : weeks[0].w;
    if(_psPlan.w == null || !weeks.some(function(x){ return x.w === _psPlan.w; })) _psPlan.w = weeks.some(function(x){ return x.w === cur; }) ? cur : weeks[0].w;
    const L = psWeekLanes(state, _psPlan.w, today); if(!L){ el.style.display = 'none'; return false; }
    if(_psPlan.day == null || _psPlan.day < 0 || _psPlan.day > 6){ const t = L.days.findIndex(function(D){ return D.today; }); _psPlan.day = t >= 0 ? t : Math.max(0, L.days.findIndex(function(D){ return D.items.length || D.renfo.length; })); }
    const fmt = function(d, o){ return new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', o); };
    const range = (L.mon.slice(5, 7) === L.sun.slice(5, 7) ? +L.mon.slice(8, 10) : fmt(L.mon, { day: 'numeric', month: 'short' })) + ' – ' + fmt(L.sun, { day: 'numeric', month: 'long' });
    let h = '<div class="ps-hd"><div><p class="ps-eb">Semaine ' + L.w + ' / ' + weeks[weeks.length - 1].w + (L.w === cur ? ' · en cours' : '') + (L.phase ? ' · ' + _psE(L.phase) : '') + '</p><h2 class="ps-h">' + _psE(range) + '</h2></div>'
      + '<p class="ps-km"><b>' + (L.kmDone && L.kmDone < L.km ? _psKm(L.kmDone) + '<i>/' + _psKm(L.km) + '</i>' : _psKm(L.km)) + '</b> km</p></div>';
    h += '<div class="ps-weeks" role="group" aria-label="Semaines du plan">' + weeks.map(function(x){
      return '<button type="button" class="ps-wk' + (x.w === L.w ? ' on' : '') + (x.w === cur ? ' cur' : '') + '" aria-pressed="' + (x.w === L.w) + '" onclick="psPlanGo(' + x.w + ')">S' + x.w + ' · ' + x.km + '</button>'; }).join('') + '</div>';
    h += '<div class="ps-lanes">' + L.days.map(function(D, i){
      return '<button type="button" class="ps-lane k-' + D.kind + (i === _psPlan.day ? ' on' : '') + (D.today ? ' today' : '') + (D.skip ? ' skip' : '') + '" aria-pressed="' + (i === _psPlan.day) + '" onclick="psPlanPick(' + i + ')" aria-label="' + _psE(D.d + ' ' + D.n + ' : ' + D.title + (D.km ? ', ' + _psKm(D.km) + ' km' : '') + (D.done ? ', fait' : '')) + '">'
        + '<span class="ps-day"><b>' + D.n + '</b><small>' + D.d + '</small></span>'
        + '<span class="ps-mid"><span class="ps-t">' + (D.done ? '<i class="ps-ok" aria-hidden="true">✓</i>' : '') + _psE(D.title) + '</span><span class="ps-bar"><i style="width:' + D.pct + '%"></i></span></span>'
        + '<span class="ps-kmd">' + (D.km ? _psKm(D.km) + ' km' : '—') + '</span></button>'; }).join('') + '</div>';
    h += psDayCard(L, L.days[_psPlan.day], today);
    h += '<p class="ps-sec">Toutes les semaines</p>';
    el.innerHTML = h;
    const on = el.querySelector('.ps-wk.on'); if(on && on.scrollIntoView && !_psPlan.scrolled){ _psPlan.scrolled = true; try { on.parentNode.scrollLeft = on.offsetLeft - 16; } catch(e) {} }
    return true;
  } catch(e) { diagSilent(e, 'piste-screens:psPlanRender'); el.style.display = 'none'; return false; }
}
function psDayCard(L, D, today){
  const ro = typeof _prepView !== 'undefined' && _prepView && !_prepView.next, coach = typeof coachAI === 'function' && coachAI();
  const when = PS_DAYS[(new Date(D.date + 'T12:00:00').getDay() + 6) % 7] + ' ' + D.n;
  let h = '<div class="ps-card">';
  if(!D.items.length && !D.renfo.length) h += '<span class="ps-tag k-rest">' + PS_TAG.rest + '</span><b class="ps-ct">' + when + ' · Repos</b><span class="ps-cd">Récupère : c\'est là que tu progresses.</span>';
  D.items.forEach(function(x, i){
    const meta = x.done ? '✓ Faite · ' + _psKm(x.km) + ' km' + (x.perfPace ? ' · ' + _psE(x.perfPace) + ' /km' : '')
      : [x.kmPlan ? _psKm(x.kmPlan) + ' km' : '', x.pace && x.detail.indexOf(x.pace) < 0 ? x.pace : '', x.time ? x.time.replace(/^0(\d)/, '$1') : ''].filter(Boolean).map(_psE).join(' · ');
    h += (i ? '<hr class="ps-hr">' : '') + '<span class="ps-tag k-' + x.kind + '">' + PS_TAG[x.kind] + (x.skip ? ' · retirée' : '') + '</span><b class="ps-ct">' + _psE(when + ' · ' + x.title) + '</b>'
      + (x.detail ? '<span class="ps-cd">' + _psE(x.detail) + '</span>' : '') + (meta ? '<span class="ps-cm">' + meta + '</span>' : '') + '<div class="ps-btns">';
    if(x.done) h += '<button type="button" class="ps-b pri" onclick="openSessionPiste(\'' + x.key + '\')">Voir la séance</button>';
    else if(!ro && !x.skip){
      if(D.date <= today && x.w === (typeof getEffectiveCW === 'function' ? getEffectiveCW() : x.w)) h += '<button type="button" class="ps-b pri" onclick="toggleDoneExtra(' + x.w + ',' + x.ei + ')">✓ Valider</button>';
      if(x.kind !== 'race') h += '<button type="button" class="ps-b' + (D.date <= today ? '' : ' pri') + '" onclick="openEditExtraModal(' + x.w + ',' + x.ei + ')">Modifier</button>';
    }
    if(coach && !ro && typeof openPlanChat === 'function') h += '<button type="button" class="ps-b" onclick="openPlanChat(' + _psE(JSON.stringify('Ma séance du ' + when + ' : ' + x.title + '. ')) + ')">En parler au Coach</button>';
    h += '</div>';
    if(x.kind === 'race' && !x.done && typeof openRacePlan === 'function') h += '<button type="button" class="ps-wide" onclick="openRacePlan()">Ouvrir le plan de course ›</button>';
  });
  D.renfo.forEach(function(r, i){
    h += (i || D.items.length ? '<hr class="ps-hr">' : '') + '<span class="ps-tag k-renfo">' + PS_TAG.renfo + (r.time ? ' · ' + _psE(r.time) : '') + '</span><b class="ps-ct">' + _psE(when + ' · ' + r.name) + '</b>'
      + (r.done ? '<span class="ps-cm">✓ Fait</span>' : '<button type="button" class="ps-wide" onclick="psRenfoGo(' + r.r + ')">Lancer la séance guidée ›</button>');
  });
  return h + '</div>';
}
function psPlanGo(w){ _psPlan.w = w; _psPlan.day = null; psPlanRender(); }
function psPlanPick(i){ _psPlan.day = i; psPlanRender(); }
function psRenfoGo(r){ showScreen('renfo', r); setTimeout(function(){ if(typeof openRenfoGuide === 'function') openRenfoGuide(); }, 350); }

// ─── Plan de course du jour J : haut de la fenêtre (temps, choix, km par km, 3 tuiles) ──
function psRaceRows(sp, avg){
  const n = sp.length, last = sp[n - 1] || { km: 0 }, dist = last.km || 1;
  const keep = sp.filter(function(x, i){ return n <= 22 || i === n - 1 || i === 0 || Math.round(x.km) % 5 === 0 && x.km === Math.round(x.km); });
  return keep.map(function(x, i){
    const slow = x.pace > avg * 1.005, end = x.km > dist * 0.8;
    return { km: x.km === last.km && x.km !== Math.round(x.km) ? String(x.km).replace('.', ',') : String(Math.round(x.km)), pace: x.pace, cum: x.cum, w: Math.round(x.km / dist * 100), cls: slow && x.km <= 3 ? 'start' : end ? 'end' : 'mid', fin: x === last };
  });
}
function psRaceTop(o){
  _psCss();
  const T = typeof phTime === 'function' ? phTime : prTime, P = o.P, I = o.I, sp = o.sp, tgt = o.tgt, avg = tgt / I.dist, long = I.cat === 'Marathon' || I.cat === 'Semi-marathon';
  const ch = function(m, l, t){ return '<button type="button" class="ps-ch' + (P.mode === m ? ' on' : '') + '" aria-pressed="' + (P.mode === m) + '" onclick="_pdRace.mode=\'' + m + '\';_pdRaceRender()' + (m === 'custom' ? ';setTimeout(function(){const e=document.getElementById(\'pd-custom\');if(e)e.focus();},50)' : '') + '"><small>' + l + '</small><b>' + t + '</b></button>'; };
  let h = '<div class="ps-race"><div class="ps-rh"><div><small>' + _psE(I.R.name) + ' · ton temps</small><b>' + T(tgt) + '</b></div><div class="ps-ra"><small>Allure</small><b>' + prPace(avg) + ' /km</b></div></div>'
    + '<div class="ps-chs" role="group" aria-label="Temps visé">' + (I.goal ? ch('goal', 'Objectif', T(I.goal)) : '') + (I.real ? ch('real', 'Réaliste', T(I.real)) : '') + ch('custom', 'Mon temps', P.custom ? T(P.custom) : 'à saisir') + '</div></div>';
  h += o.custom || '';
  h += o.notes || '';
  h += '<div class="ps-splits">' + psRaceRows(sp, avg).map(function(r){
    return '<div class="ps-sr' + (r.fin ? ' fin' : '') + '"><span class="ps-sk">' + (r.fin ? '🏁' : r.km) + '</span><span class="ps-sb"><i class="' + r.cls + '" style="width:' + r.w + '%"></i></span><span class="ps-sp ' + r.cls + '">' + prPace(r.pace) + '</span><span class="ps-sc">' + T(r.cum) + '</span></div>'; }).join('')
    + (o.pacNote ? '<p class="ps-note">' + o.pacNote + '</p>' : '') + '</div>';
  const warm = I.cat === 'Marathon' ? '10 min léger' : I.cat === 'Semi-marathon' ? '15 min + 3 LD' : '20 min + 5 LD';
  const fuel = I.cat === 'Marathon' ? 'Gel / 35 min' : I.cat === 'Semi-marathon' ? '1 gel km 10' : 'Eau au ravito';
  h += '<div class="ps-tiles"><div><small>Météo</small><b>' + (o.wx && typeof o.wx.temp === 'number' ? Math.round(o.wx.temp) + '°' : o.wx && typeof o.wx.t === 'number' ? Math.round(o.wx.t) + '°' : I.days > 7 ? 'À J-7' : '—') + '</b></div><div><small>Échauffement</small><b>' + warm + '</b></div><div><small>' + (long ? 'Ravito' : 'Boire') + '</small><b>' + fuel + '</b></div></div>';
  return h;
}

// ─── Séance faite ────────────────────────────────────────────────────────────
// barres : plus rapide = plus haute ; ligne = haut de la consigne (paceLo, s/km) si elle tombe dans la plage
function psSplitBars(splits, paceLo){
  const S = (splits || []).filter(function(x){ return x && x.sec > 0; }); if(!S.length) return null;
  const secs = S.map(function(x){ return x.sec; }), mn = Math.min.apply(null, secs), mx = Math.max.apply(null, secs), span = Math.max(1, mx - mn), best = secs.indexOf(mn);
  const hOf = function(s){ return Math.round(22 + (mx - s) / span * 78); };
  const lab = S.length <= 16 ? 'all' : 'some';
  return { n: S.length, line: paceLo && paceLo >= mn && paceLo <= mx ? hOf(paceLo) : null,
    bars: S.map(function(x, i){ return { km: x.part ? String(Math.round((i + x.part) * 10) / 10).replace('.', ',') : String(x.km || i + 1), sec: x.sec, h: hOf(x.sec), best: i === best, lab: lab === 'all' || i === best || secs[i] === mx, fast: paceLo ? x.sec <= paceLo : false }; }) };
}
const PS_RPE = ['', 'Très facile', 'Très facile', 'Facile', 'Facile', 'Modéré', 'Modéré', 'Soutenu', 'Dur', 'Très dur', 'Maximal'];
function openSessionPiste(key){
  const D = typeof sessionShareData === 'function' ? sessionShareData(key) : null;
  if(!D){ const s = prSessions(state).find(function(x){ return x.key === key; }); if(s && typeof homeNextGo === 'function'){ showScreen('home'); homeNextGo(s.w, s.ei); } return; }
  _psCss();
  const old = document.getElementById('ps-sess'); if(old) old.remove();
  const ov = document.createElement('div'); ov.id = 'ps-sess'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Séance du ' + D.date);
  document.body.appendChild(ov);
  _psSessRender(key, D);
}
function _psSessRender(key, D){
  const ov = document.getElementById('ps-sess'); if(!ov) return;
  D = D || sessionShareData(key); if(!D){ ov.remove(); return; }
  const s = prSessions(state).find(function(x){ return x.key === key; }) || {}, p = s.perf || {};
  const dt = new Date(D.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
  const B = psSplitBars(D.splits, s.pace ? s.pace.lo : null), ro = typeof _prepView !== 'undefined' && _prepView && !_prepView.next;
  const auto = p.auto ? '✓ Validée automatiquement' : '✓ Faite';
  const fmtD = function(sec){ if(!sec) return '—'; const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), x = sec % 60; return (h ? h + 'h' + String(m).padStart(2, '0') : m) + '\'' + String(x).padStart(2, '0'); };
  const tiles = [['Durée', fmtD(D.dur)], ['Allure', D.pace || '—'], ['FC moy.', D.hr || '—'], [D.cad ? 'Cadence' : D.up != null ? 'D+' : 'Météo', D.cad || (D.up != null ? D.up + ' m' : D.temp != null ? D.temp + '°' : '—')]];
  let h = '<div class="ps-top"><button type="button" class="ps-ic" onclick="psSessClose()" aria-label="Fermer">‹</button><span class="ps-eb">' + _psE(dt.charAt(0).toUpperCase() + dt.slice(1)) + ' · S' + D.w + '</span>'
    + (typeof openSessionShare === 'function' ? '<button type="button" class="ps-ic pri" onclick="openSessionShare(\'' + key + '\')" aria-label="Partager l\'image de la séance">📸</button>' : '<span></span>') + '</div>'
    + '<div class="ps-sh"><div><span class="ps-auto">' + auto + '</span><h2>' + _psE(D.title) + '</h2></div><p class="ps-bigkm"><b>' + _psKm(D.km) + '</b> km</p></div>'
    + '<div class="ps-t4">' + tiles.map(function(t){ return '<div><small>' + t[0] + '</small><b>' + _psE(t[1]) + '</b></div>'; }).join('') + '</div>';
  if(B){
    h += '<div class="ps-box"><div class="ps-bh"><h3>Allure par km</h3>' + (s.pace ? '<span>consigne ' + _psE(s.pace.text.replace(/\s*\/\s*km/, '')) + '</span>' : '') + '</div>'
      + '<div class="ps-chart" role="img" aria-label="Allure kilomètre par kilomètre, ' + B.n + ' km" style="--n:' + B.n + '">'
      + (B.line != null ? '<span class="ps-line" style="bottom:' + B.line + 'px"></span>' : '')
      + B.bars.map(function(b){ return '<div class="ps-col">' + (b.lab ? '<span class="ps-lab' + (b.best ? ' best' : '') + '">' + prPace(b.sec) + '</span>' : '') + '<i class="' + (b.best ? 'best' : '') + '" style="height:' + b.h + 'px"></i></div>'; }).join('') + '</div>'
      + '<div class="ps-kms" style="--n:' + B.n + '">' + B.bars.map(function(b, i){ return '<span>' + (B.n <= 16 || i % 2 === 0 ? b.km : '') + '</span>'; }).join('') + '</div>'
      + (B.line != null ? '<p class="ps-note">Pointillés : haut de la consigne. Au-dessus = plus rapide que prévu.</p>' : '') + '</div>';
  }
  // blocs du fractionné / tempo : temps et allure de chaque bloc (saisis à la validation ou lus dans les tours Strava)
  const BA = p.blocsAllure || [], BT = p.blocsTemps || [], nb = Math.max(BA.length, BT.length);
  if(nb && (BA.some(Boolean) || BT.some(Boolean))){
    h += '<div class="ps-box"><div class="ps-bh"><h3>Tes blocs</h3><span>' + nb + ' bloc' + (nb > 1 ? 's' : '') + (p.blocsAuto || p._blocsAuto ? ' · tours Strava' : '') + '</span></div><div class="ps-bl">';
    for(let i = 0; i < nb; i++) h += '<div><small>' + (i + 1) + '</small>' + (BT[i] ? '<b>' + _psE(String(BT[i])) + '</b>' : '') + (BA[i] ? '<span>' + _psE(String(BA[i]).replace(':', '\'')) + ' /km</span>' : '') + '</div>';
    h += '</div></div>';
  }
  const r = p.rpe || 0, col = function(n){ return n <= 4 ? 'g' : n <= 6 ? 'b' : n <= 8 ? 'a' : 'r'; };
  h += '<div class="ps-box"><div class="ps-bh"><h3>Ton ressenti</h3><span class="ps-rv ' + (r ? col(r) : '') + '">' + (r ? r + '/10 · ' + PS_RPE[r] : 'pas encore noté') + '</span></div>'
    + '<div class="ps-rpe" role="group" aria-label="Effort ressenti de 1 à 10">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function(n){
      return '<button type="button" class="' + (n === r ? 'on ' + col(n) : '') + '" aria-pressed="' + (n === r) + '"' + (ro ? ' disabled' : ' onclick="psSetRpe(\'' + key + '\',' + n + ')"') + '>' + n + '</button>'; }).join('') + '</div></div>';
  if(typeof coachAI === 'function' && coachAI()) h += '<button type="button" class="ps-coach" onclick="psSessClose();showScreen(\'coach\')"><span aria-hidden="true">💬</span><span><b>Analyse du Coach</b><small>Dans le fil du Coach, avec ton ressenti</small></span></button>';
  if(!ro && typeof openValidationModalExtra === 'function') h += '<button type="button" class="ps-b wide" onclick="psSessClose();openValidationModalExtra(' + s.w + ',' + s.ei + ')">Modifier la séance</button>';
  ov.innerHTML = '<div class="ps-in">' + h + '</div>';
}
function psSessClose(){ const o = document.getElementById('ps-sess'); if(o) o.remove(); }
function psSetRpe(key, n){
  if(typeof _prepView !== 'undefined' && _prepView && !_prepView.next) return;
  const perf = _psJ(state[key + '_perf']) || {};
  perf.rpe = perf.rpe === n ? null : n; if(perf.rpe == null) delete perf.rpe;
  state[key + '_perf'] = JSON.stringify(perf); save();
  if(typeof sessionChanged === 'function') sessionChanged();
  _psSessRender(key);
}

// ─── Progrès : en tête de Statistiques ──────────────────────────────────────
// hist = [{date, v}] semaine par semaine ; n = nombre de semaines affichées → points du tracé (326 × 120) et écart
function psLevelView(hist, n){
  const S = (hist || []).slice(-n).filter(function(x){ return x && x.v; }); if(!S.length) return null;
  const vs = S.map(function(x){ return x.v; }), mn = Math.min.apply(null, vs) - 0.3, mx = Math.max.apply(null, vs) + 0.3, W = 326, top = 12, bot = 112;
  const pts = S.map(function(x, i){ return [S.length > 1 ? Math.round(i * (W - 12) / (S.length - 1) + 6) : W / 2, Math.round(bot - (x.v - mn) / (mx - mn) * (bot - top))]; });
  const line = pts.map(function(p){ return p[0] + ',' + p[1]; }).join(' '), last = pts[pts.length - 1];
  return { now: S[S.length - 1].v, delta: Math.round((S[S.length - 1].v - S[0].v) * 10) / 10, line: line, area: pts[0][0] + ',' + bot + ' ' + line + ' ' + last[0] + ',' + bot, last: last, from: S[0].date };
}
let _psStats = { range: 1, cache: null };
function psStatsRange(i){ _psStats.range = i; psStatsRender(); }
function psStatsRender(){
  const el = typeof document !== 'undefined' ? document.getElementById('stats-piste') : null; if(!el) return false;
  try {
    if(!(typeof phIsOn === 'function' && phIsOn())){ el.style.display = 'none'; return false; }
    _psCss();
    const today = prTodayIso(), k = today + '|' + (state._server_rev || '') + '|' + (typeof prDataSig === 'function' ? prDataSig(state) : '');
    if(!_psStats.cache || _psStats.cache.k !== k){
      const H = typeof bsLevelHistory === 'function' ? bsLevelHistory(today) : [], Z = typeof bsZonePaces === 'function' ? bsZonePaces(today) : null;
      _psStats.cache = { k: k, H: H, Z: Z };
    }
    const H = _psStats.cache.H, Z = _psStats.cache.Z, R = [['3 m', 14], ['6 m', 27]];
    const V = psLevelView(H, R[_psStats.range][1]);
    if(!V){ el.style.display = 'none'; return false; }
    el.style.display = 'flex';
    const fr = function(x){ return (Math.round(x * 10) / 10).toFixed(1).replace('.', ','); };
    const Rc = typeof prepRace === 'function' ? (prepRace() || {}) : {}, cat = typeof predRaceCat === 'function' ? predRaceCat(Rc) : null;
    const T = [['5 km', '5 km'], ['10 km', '10 km'], ['Semi-marathon', 'Semi'], ['Marathon', 'Marathon']].map(function(c){
      const t = raceTimeFromVdot(V.now, PR_RACE_M[c[0]]); return { l: c[1], on: c[0] === cat, t: typeof phTime === 'function' ? phTime(t).replace(/'\d\d$/, function(m){ return t >= 3600 ? '' : m; }) : prTime(t) }; });
    let h = '<div><p class="ps-eb">Progrès</p><h2 class="ps-h">Ton niveau du moment</h2></div>'
      + '<div class="ps-box"><div class="ps-lv"><p><b>' + fr(V.now) + '</b><span class="' + (V.delta < 0 ? 'down' : '') + '">' + (V.delta >= 0 ? '+' : '−') + fr(Math.abs(V.delta)) + ' en ' + (_psStats.range ? '6 mois' : '3 mois') + '</span></p>'
      + '<div class="ps-seg" role="group" aria-label="Période">' + R.map(function(r, i){ return '<button type="button" class="' + (i === _psStats.range ? 'on' : '') + '" aria-pressed="' + (i === _psStats.range) + '" onclick="psStatsRange(' + i + ')">' + r[0] + '</button>'; }).join('') + '</div></div>'
      + '<svg class="ps-lvc" viewBox="0 0 326 120" role="img" aria-label="Niveau du moment de ' + fr(V.now - V.delta) + ' à ' + fr(V.now) + '"><line x1="0" y1="20" x2="326" y2="20"/><line x1="0" y1="62" x2="326" y2="62"/><line x1="0" y1="104" x2="326" y2="104"/>'
      + '<polygon points="' + V.area + '"/><polyline points="' + V.line + '"/><circle cx="' + V.last[0] + '" cy="' + V.last[1] + '" r="6"/></svg>'
      + '<p class="ps-note">Équivalent VDOT · monte avec tes séances de qualité, baisse si tu coupes plus de 10 jours. ' + (typeof openLevelChart === 'function' ? '<button type="button" class="ps-lnk" onclick="openLevelChart()">Détail ›</button>' : '') + '</p></div>'
      + '<div class="ps-t4 ps-rt">' + T.map(function(t){ return '<div class="' + (t.on ? 'on' : '') + '"><small>' + t.l + '</small><b>' + _psE(t.t) + '</b></div>'; }).join('') + '</div>';
    if(Z && Z.z){
      const P = function(s){ return prPace(s); }, NM = ['Z1 · Récup', 'Z2 · EF', 'Z3 · Tempo', 'Z4 · Seuil', 'Z5 · VMA'];
      const rows = Z.z.map(function(z, i){ if(!z || i === 0) return ''; const t = z.hi == null ? '> ' + P(z.lo) : z.lo == null ? '< ' + P(z.hi + 1) : P(z.lo) + ' – ' + P(z.hi);
        return '<div class="ps-zr"><span>' + NM[i] + '</span><i class="z' + (i + 1) + '"></i><b>' + t + '</b></div>'; }).join('');
      if(rows) h += '<div class="ps-box"><div class="ps-bh"><h3>Tes allures par zone</h3>' + (typeof openPaceChart === 'function' ? '<button type="button" class="ps-lnk" onclick="openPaceChart()">Évolution ›</button>' : '') + '</div>' + rows + '</div>';
    }
    el.innerHTML = h;
    return true;
  } catch(e) { diagSilent(e, 'piste-screens:psStatsRender'); el.style.display = 'none'; return false; }
}

// ─── feuille de style (couleurs déjà « piste » : marquée data-th, jamais convertie) ──
function _psCss(){
  if(typeof document === 'undefined' || document.getElementById('ps-css')) return;
  const st = document.createElement('style'); st.id = 'ps-css'; st.dataset.th = '1';
  const BS = "'Big Shoulders Display',Manrope,sans-serif", P = 'html[data-theme=dark][data-piste]';
  st.textContent =
    // Plan
    P + ' #sc-plan > #plan-hero{display:none;}' + P + ' #plan-list{margin-top:0!important;}'
    + '#plan-piste{flex-direction:column;gap:12px;padding:calc(env(safe-area-inset-top,0px) + 16px) 16px 0;color:#F2F4F8;}'
    + '.ps-hd{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;}.ps-hd>div{min-width:0;}'
    + '.ps-eb{margin:0;font-size:11.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#E0603A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.ps-h{margin:2px 0 0;font-size:23px;font-weight:800;letter-spacing:-.02em;color:#F2F4F8;line-height:1.15;}'
    + '.ps-km{margin:0;font-size:13px;font-weight:700;color:#9AA6BF;white-space:nowrap;}.ps-km b{font-family:' + BS + ';font-weight:900;font-size:38px;line-height:.9;color:#F2F4F8;}.ps-km i{font-style:normal;font-size:22px;color:#9AA6BF;}'
    + '.ps-weeks{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 -16px;padding:0 16px;}.ps-weeks::-webkit-scrollbar{display:none;}'
    + '.ps-wk{flex:0 0 auto;height:40px;padding:0 12px;border-radius:12px;border:1px solid #24304D;background:transparent;color:#9AA6BF;font:inherit;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;}'
    + '.ps-wk.cur{color:#F2F4F8;}.ps-wk.on{border-color:#E0603A;background:rgba(224,96,58,.14);color:#F2F4F8;font-weight:800;}'
    + '.ps-lanes{display:flex;flex-direction:column;gap:6px;}'
    + '.ps-lane{display:flex;align-items:center;gap:12px;min-height:52px;padding:0 10px;border-radius:14px;background:#111A2E;border:1px solid #1E2944;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 10px 24px rgba(0,0,0,.45);color:#F2F4F8;font:inherit;text-align:left;cursor:pointer;width:100%;}'
    + '.ps-lane.on{background:linear-gradient(180deg,#1C2645 0%,#141D36 100%);border:1px solid #2A3760;box-shadow:inset 0 1px 0 rgba(255,255,255,.10),0 18px 40px rgba(0,0,0,.6);}.ps-lane.today .ps-day small{color:#E0603A;}'
    + '.ps-day{width:34px;display:flex;flex-direction:column;align-items:center;flex-shrink:0;}.ps-day b{font-family:' + BS + ';font-weight:900;font-size:24px;line-height:.95;}.ps-day small{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#9AA6BF;}'
    + '.ps-mid{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;}.ps-t{font-size:13.5px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.ps-ok{font-style:normal;color:#5BD08A;margin-right:5px;}.k-rest .ps-t,.k-renfo .ps-t{color:#9AA6BF;}.ps-lane.skip .ps-t{text-decoration:line-through;color:#9AA6BF;}'
    + '.ps-bar{display:block;height:8px;border-radius:4px;background:#0A1020;box-shadow:inset 0 2px 6px rgba(0,0,0,.65),inset 0 -1px 0 rgba(255,255,255,.04);overflow:hidden;}.ps-bar i{display:block;height:100%;border-radius:4px;background:#4FB3D9;box-shadow:0 0 10px rgba(79,179,217,.45);}'
    + '.k-key .ps-bar i{background:#E0603A;}.k-race .ps-bar i{background:#F2F4F8;}.k-rest .ps-bar i,.k-renfo .ps-bar i{background:#2C3858;}'
    + '.ps-kmd{width:50px;text-align:right;font-size:13px;font-weight:800;color:#C2CADB;flex-shrink:0;font-variant-numeric:tabular-nums;}'
    + '.ps-card{background:linear-gradient(180deg,#1C2645 0%,#141D36 100%);border:1px solid #2A3760;box-shadow:inset 0 1px 0 rgba(255,255,255,.10),0 18px 40px rgba(0,0,0,.6);border-radius:22px;padding:16px;display:flex;flex-direction:column;gap:8px;}'
    + '.ps-tag{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#4FB3D9;}.ps-tag.k-key{color:#E0603A;}.ps-tag.k-race{color:#F2F4F8;}.ps-tag.k-rest,.ps-tag.k-renfo{color:#9AA6BF;}'
    + '.ps-ct{font-size:18px;font-weight:800;line-height:1.25;}.ps-cd{font-size:14px;color:#C2CADB;line-height:1.45;}.ps-cm{font-size:13px;font-weight:700;color:#9AA6BF;font-variant-numeric:tabular-nums;}'
    + '.ps-hr{border:none;border-top:1px dashed #2C3858;margin:6px 0;}'
    + '.ps-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;}.ps-btns:empty{display:none;}'
    + '.ps-b{height:44px;border-radius:14px;border:1px solid #2C3858;background:transparent;color:#F2F4F8;padding:0 14px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;}'
    + '.ps-b.pri{border:none;background:#E0603A;color:#0E1424;font-weight:800;}.ps-b.wide{width:100%;}'
    + '.ps-wide{height:44px;border:none;border-radius:14px;background:#F2F4F8;color:#0E1424;font:inherit;font-size:14px;font-weight:800;cursor:pointer;margin-top:4px;}'
    + '.ps-sec{margin:6px 0 -4px;font-size:11.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#9AA6BF;}'
    // plan de course
    + '.ps-race{background:#F2F4F8;color:#0E1424;border-radius:24px;padding:16px;display:flex;flex-direction:column;gap:12px;}'
    + '.ps-rh{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;}.ps-rh>div{display:flex;flex-direction:column;min-width:0;}'
    + '.ps-rh small{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#3A4559;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.ps-rh b{font-family:' + BS + ';font-weight:900;font-size:60px;line-height:.9;}.ps-ra{text-align:right;align-items:flex-end;}.ps-ra b{font-family:Manrope,sans-serif;font-size:19px;font-weight:800;line-height:1.2;white-space:nowrap;}'
    + '.ps-chs{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:6px;}'
    + '.ps-ch{height:50px;border:none;border-radius:12px;background:#E3E7EF;color:#0E1424;font:inherit;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;}.ps-ch small{font-size:11px;font-weight:700;}.ps-ch b{font-size:15px;font-weight:800;}'
    + '.ps-ch.on{background:#0E1424;color:#F2F4F8;}'
    + '.ps-splits{background:#111A2E;border:1px solid #1E2944;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 10px 24px rgba(0,0,0,.45);border-radius:22px;padding:8px 14px;display:flex;flex-direction:column;}'
    + '.ps-sr{display:flex;align-items:center;gap:10px;height:34px;border-bottom:1px solid #24304D;}.ps-sr.fin{border-bottom:none;}'
    + '.ps-sk{width:24px;font-family:' + BS + ';font-weight:800;font-size:18px;color:#9AA6BF;}.ps-sb{flex:1;height:6px;border-radius:3px;background:#24304D;overflow:hidden;}.ps-sb i{display:block;height:100%;border-radius:3px;background:#8AA0D8;}'
    + '.ps-sb i.start{background:#4FB3D9;}.ps-sb i.end{background:#E0603A;}.ps-sp{width:46px;text-align:right;font-size:14px;font-weight:800;color:#F2F4F8;font-variant-numeric:tabular-nums;}.ps-sp.start{color:#4FB3D9;}'
    + '.ps-sc{width:62px;text-align:right;font-size:13px;font-weight:600;color:#C2CADB;font-variant-numeric:tabular-nums;}'
    + '.ps-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}.ps-tiles>div{background:#111A2E;border:1px solid #1E2944;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 10px 24px rgba(0,0,0,.45);border-radius:16px;padding:10px 12px;display:flex;flex-direction:column;gap:2px;min-width:0;}'
    + '.ps-tiles small,.ps-t4 small{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#9AA6BF;}.ps-tiles b{font-size:14px;font-weight:800;color:#F2F4F8;}'
    + '.ps-note{margin:8px 0 4px;font-size:12px;color:#C2CADB;line-height:1.45;}'
    
    // séance faite
    + '#ps-sess{position:fixed;inset:0;z-index:600;background:#070B16;color:#F2F4F8;overflow-y:auto;-webkit-overflow-scrolling:touch;}'
    + '.ps-in{max-width:430px;margin:0 auto;padding:calc(env(safe-area-inset-top,0px) + 14px) 18px calc(env(safe-area-inset-bottom,0px) + 24px);display:flex;flex-direction:column;gap:14px;}'
    + '.ps-top{display:flex;align-items:center;justify-content:space-between;gap:10px;}.ps-top .ps-eb{color:#9AA6BF;text-align:center;flex:1;}'
    + '.ps-ic{width:44px;height:44px;border-radius:50%;border:1px solid #24304D;background:transparent;color:#F2F4F8;font:inherit;font-size:22px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:0;}.ps-ic.pri{border:none;background:#E0603A;font-size:18px;}'
    + '.ps-sh{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;}.ps-sh>div{min-width:0;}.ps-sh h2{margin:4px 0 0;font-size:25px;font-weight:800;letter-spacing:-.02em;line-height:1.15;}'
    + '.ps-auto{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#5BD08A;}'
    + '.ps-bigkm{margin:0;font-size:16px;font-weight:800;color:#9AA6BF;white-space:nowrap;}.ps-bigkm b{font-family:' + BS + ';font-weight:900;font-size:62px;line-height:.85;color:#F2F4F8;}'
    + '.ps-t4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;}.ps-t4>div{background:#111A2E;border:1px solid #1E2944;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 10px 24px rgba(0,0,0,.45);border-radius:14px;padding:10px;display:flex;flex-direction:column;min-width:0;}.ps-t4 b{font-size:15px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.ps-box{background:#111A2E;border:1px solid #1E2944;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 10px 24px rgba(0,0,0,.45);border-radius:22px;padding:14px;display:flex;flex-direction:column;gap:10px;}'
    + '.ps-bh{display:flex;align-items:center;justify-content:space-between;gap:8px;}.ps-bh h3{margin:0;font-size:14.5px;font-weight:800;}.ps-bh>span{font-size:12px;font-weight:700;color:#9AA6BF;}'
    + '.ps-chart{position:relative;display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:3px;align-items:end;height:128px;}'
    + '.ps-col{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px;height:128px;min-width:0;}.ps-col i{display:block;width:100%;border-radius:5px 5px 2px 2px;background:#4FB3D9;}.ps-col i.best{background:#E0603A;}'
    + '.ps-lab{font-size:9px;font-weight:800;color:#C2CADB;white-space:nowrap;letter-spacing:-.03em;}.ps-lab.best{color:#FFFFFF;}'
    + '.ps-line{position:absolute;left:0;right:0;border-top:2px dashed rgba(242,244,248,.45);pointer-events:none;}'
    + '.ps-kms{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:3px;}.ps-kms span{text-align:center;font-size:10px;font-weight:700;color:#9AA6BF;}'
    + '.ps-blocs{margin:0;font-size:15px;font-weight:800;}'
    + '.ps-bl{display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:6px;}.ps-bl>div{background:#0A1020;box-shadow:inset 0 2px 6px rgba(0,0,0,.65),inset 0 -1px 0 rgba(255,255,255,.04);border-radius:12px;padding:7px 8px;display:flex;flex-direction:column;gap:1px;}'
    + '.ps-bl small{font-size:10px;font-weight:800;color:#9AA6BF;}.ps-bl b{font-family:' + BS + ';font-size:20px;font-weight:800;line-height:1.05;}.ps-bl span{font-size:12px;font-weight:700;color:#E0603A;font-variant-numeric:tabular-nums;}'
    + '.ps-rv{font-size:13px!important;font-weight:800!important;}.ps-rv.g{color:#5BD08A!important;}.ps-rv.b{color:#4FB3D9!important;}.ps-rv.a{color:#E8A33D!important;}.ps-rv.r{color:#E0603A!important;}'
    + '.ps-rpe{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:4px;}.ps-rpe button{height:44px;border:none;border-radius:10px;background:#0A1020;box-shadow:inset 0 2px 6px rgba(0,0,0,.65),inset 0 -1px 0 rgba(255,255,255,.04);color:#C2CADB;font:inherit;font-size:14px;font-weight:800;cursor:pointer;padding:0;}'
    + '.ps-rpe button.on{color:#0E1424;}.ps-rpe .g{background:#5BD08A;}.ps-rpe .b{background:#4FB3D9;}.ps-rpe .a{background:#E8A33D;}.ps-rpe .r{background:#E0603A;}'
    + '.ps-coach{display:flex;align-items:center;gap:12px;border:2px solid #E0603A;border-radius:22px;padding:12px 14px;background:transparent;color:#F2F4F8;font:inherit;text-align:left;cursor:pointer;}'
    + '.ps-coach>span:first-child{width:40px;height:40px;border-radius:50%;background:#E0603A;display:flex;align-items:center;justify-content:center;flex-shrink:0;}.ps-coach>span:last-child{display:flex;flex-direction:column;}.ps-coach b{font-size:14px;}.ps-coach small{font-size:13px;color:#C2CADB;}'
    // Progrès
    + P + ' #stats-title{display:none;}' + P + ' #bs-level-card{display:none!important;}'
    + '#stats-piste{flex-direction:column;gap:12px;margin:calc(env(safe-area-inset-top,0px)) 0 14px;color:#F2F4F8;}#stats-piste .ps-eb{color:#9AA6BF;}'
    + '#stats-piste>.ps-box:first-of-type{background:radial-gradient(120% 80% at 100% 0%,rgba(224,96,58,.16),rgba(224,96,58,0) 55%),linear-gradient(180deg,#1C2645,#141D36);border:1px solid #2A3760;box-shadow:inset 0 1px 0 rgba(255,255,255,.10),0 18px 40px rgba(0,0,0,.6);}'
    + '.ps-rt>div.on{background:linear-gradient(180deg,#1C2645 0%,#141D36 100%);border:1px solid #2A3760;box-shadow:inset 0 1px 0 rgba(255,255,255,.10),0 18px 40px rgba(0,0,0,.6);border-color:#E0603A!important;}.ps-zr i{box-shadow:0 0 8px rgba(0,0,0,.4);}'
    + P + ' #pd-race .modal-scroll-body{background:#070B16!important;}'
    + '.ps-lv{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;}.ps-lv p{margin:0;display:flex;align-items:baseline;gap:10px;}.ps-lv p b{font-family:' + BS + ';font-weight:900;font-size:56px;line-height:.85;}'
    + '.ps-lv p span{font-size:13.5px;font-weight:800;color:#5BD08A;}.ps-lv p span.down{color:#E8A33D;}'
    + '.ps-seg{display:flex;gap:4px;background:#0A1020;box-shadow:inset 0 2px 6px rgba(0,0,0,.65),inset 0 -1px 0 rgba(255,255,255,.04);border-radius:12px;padding:3px;}.ps-seg button{height:38px;min-width:50px;border:none;border-radius:10px;background:transparent;color:#9AA6BF;font:inherit;font-size:13px;font-weight:800;cursor:pointer;}.ps-seg button.on{background:#F2F4F8;color:#0E1424;}'
    + '.ps-lvc{display:block;width:100%;height:auto;}.ps-lvc line{stroke:#24304D;stroke-width:1;}.ps-lvc polygon{fill:#E0603A;fill-opacity:.16;}.ps-lvc polyline{fill:none;stroke:#E0603A;stroke-width:3;stroke-linejoin:round;stroke-linecap:round;}.ps-lvc circle{fill:#0E1424;stroke:#E0603A;stroke-width:3;}'
    + '.ps-lnk{border:none;background:none;padding:0;color:#E0603A;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer;}'
    + '.ps-rt>div{border:2px solid transparent;}.ps-rt>div.on{border-color:#E0603A;}.ps-rt>div.on small{color:#E0603A;}.ps-rt b{font-family:' + BS + ';font-weight:800;font-size:22px;line-height:1.15;}'
    + '.ps-zr{display:flex;align-items:center;gap:10px;}.ps-zr span{width:78px;font-size:12px;font-weight:800;color:#9AA6BF;flex-shrink:0;}.ps-zr i{flex:1;height:10px;border-radius:5px;}.ps-zr b{width:96px;text-align:right;font-size:13px;font-weight:800;font-variant-numeric:tabular-nums;flex-shrink:0;}'
    + '.ps-zr .z2{background:#4FB3D9;}.ps-zr .z3{background:#8AA0D8;}.ps-zr .z4{background:#E8A33D;}.ps-zr .z5{background:#E0603A;}'
    // Coach à la voix : l'écran a déjà le style « relief » de la piste (coach-voice.js _cvCss), rien à surcharger
    // Renfo guidé
    + P + ' #rg-ov{background:#070B16;font-family:Manrope,system-ui,sans-serif;}'
    + P + ' #rg-ov .rg-x{background:transparent;border:1px solid #24304D;width:44px;height:44px;}'
    + P + ' #rg-ov .rg-bar{background:#24304D;height:6px;}' + P + ' #rg-ov .rg-bar i{background:#E0603A;}'
    + P + ' #rg-ov .rg-s{color:#E0603A;letter-spacing:.12em;}' + P + ' #rg-ov .rg-n{font-size:26px;font-weight:800;letter-spacing:-.02em;}' + P + ' #rg-ov .rg-d{color:#C2CADB;opacity:1;}'
    + P + " #rg-ov .rg-big{font-family:" + BS + ";font-size:96px;font-weight:900;line-height:.9;}" + P + ' #rg-ov .rg-rest .rg-big{color:#E8A33D;}'
    + P + ' #rg-ov .rg-go{background:#E0603A;color:#0E1424;}' + P + ' #rg-ov .rg-sec{background:transparent;border:1px solid #2C3858;color:#F2F4F8;}'
    + P + ' #rg-ov .rg-mini button{background:transparent;border-color:#2C3858;}' + P + ' #rg-ov .rg-li{background:#161E33;}'
    + P + ' #rg-ov .rg-why p{background:#161E33;color:#C2CADB;}';
  document.head.appendChild(st);
}
// le thème piste charge sa feuille dès le démarrage (voix et renfo s'ouvrent à la demande)
if(typeof document !== 'undefined' && document.documentElement && document.documentElement.hasAttribute && document.documentElement.hasAttribute('data-piste')) _psCss();
