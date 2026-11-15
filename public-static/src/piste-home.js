// ─── Thème « Piste de nuit » : l'accueil (html[data-piste], Compte › Thème) ─────────────────────────────────
// En-tête #home-piste à la place de l'en-tête bleu (#home-hero, masqué) : date · heure, « Bonsoir Prénom », micro du Coach ;
// anneau de piste (J-x, course, date, part des km faits = trait orange) ; tuiles Objectif / Prévu / Forme ;
// les boutons de l'ancien en-tête (recherche, notifications, nuit, allure EF, météo, partage, réveil) sont déplacés une fois
// dans une ligne de pastilles (mêmes id : leurs rendus habituels continuent de les remplir).
// « Ma journée » (my-day.js) est dessinée en bloc « Maintenant » + liste « fait / ensuite » (phDayHtml), placée avant la Forme du jour.
// Calculs purs (testés) : phGreet, phRingDash, phTime, phRaceLabel, phView.

const PH_PERIM = 2 * (314 - 174) + Math.PI * 174;     // périmètre de l'anneau (rectangle 314 × 174, coins de 87)
function phIsOn(){ try { return !!(typeof document !== 'undefined' && document.documentElement && document.documentElement.hasAttribute('data-piste')); } catch(e) { return false; } }
function phGreet(nowMin){ return nowMin >= 18 * 60 || nowMin < 4 * 60 ? 'Bonsoir' : 'Bonjour'; }
function phRingDash(pct){ const p = Math.max(0, Math.min(100, +pct || 0)); return Math.round(PH_PERIM * p / 100); }
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
// o = {name, plaisir, race: {date, label}, pct, obj, pred, form, formWait} → textes de l'en-tête
function phView(o, today, nowMin){
  o = o || {};
  const dt = new Date(today + 'T12:00:00'), hh = Math.floor(nowMin / 60), mm = nowMin % 60;
  const day = dt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
  const R = o.race || {}, d = R.date ? _phDay(today, R.date) : null, pct = Math.max(0, Math.min(100, Math.round(+o.pct || 0)));
  const big = d == null ? '—' : d === 0 ? 'Jour J' : d > 0 ? 'J-' + d : 'J+' + (-d);
  const rd = R.date ? new Date(R.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
  const f = o.form == null ? null : Math.round(o.form);
  return {
    eyebrow: day.charAt(0).toUpperCase() + day.slice(1) + ' · ' + hh + ':' + String(mm).padStart(2, '0'),
    greet: phGreet(nowMin) + (o.name ? ' ' + o.name : ''),
    ring: !o.plaisir && !!R.date,
    big: big, race: R.label || 'Course objectif',
    sub: [rd ? rd.charAt(0).toUpperCase() + rd.slice(1) : '', pct + ' % des km faits'].filter(Boolean).join(' · '),
    dash: phRingDash(pct), pct: pct,
    obj: o.obj || '—', pred: o.pred || '—',
    form: o.formWait ? '…' : f == null ? '—' : String(f),
    formCls: f == null || o.formWait ? '' : f >= 67 ? 'ok' : f >= 34 ? 'mid' : 'low'
  };
}

// ─── données réelles de l'app ────────────────────────────────────────────────
let _phPred = null;
function _phCollect(today){
  const o = { name: typeof athleteFirstName === 'function' ? athleteFirstName() : '', plaisir: typeof isPlaisirMode === 'function' && isPlaisirMode() };
  const hard = typeof usesHardPlan === 'function' && usesHardPlan();
  const R = typeof prepRace === 'function' ? (prepRace() || {}) : {};
  const nm = String(R.name || '').trim();
  o.race = { date: R.date || '', label: hard ? 'Marathon Seine-Eure' : phRaceLabel(R.course, nm) };
  try { const td = calcTotalDone(), gt = getGrandTotal(); o.pct = gt > 0 ? td / gt * 100 : 0; } catch(e) { diagSilent(e, 'piste-home:pct'); o.pct = 0; }
  const ob = state.onboarding || {}, tt = hard ? '' : (state.target_time || ob.target_time || '');
  o.obj = tt && typeof homeTimeTxt === 'function' ? homeTimeTxt(String(tt).replace(/^00:/, '')) : hard ? String(R.objectif || '').replace(/^Sub\s*/i, '< ') : '';
  // temps prévu : la prédiction unique de l'app (gardée 30 s, recalculée après chaque séance par le rendu de l'accueil)
  const pk = today + '|' + (R.date || '') + '|' + (state._server_rev || '') + '|' + o.pct;
  if(!_phPred || _phPred.k !== pk || Date.now() - _phPred.t > 30000){
    let v = '';
    try {
      if(hard && typeof buildMarathonPrediction === 'function') v = buildMarathonPrediction().tempsStr || '';
      else if(typeof predRace === 'function' && typeof predRaceCat === 'function'){ const c = predRaceCat(R), P = c ? predRace(c, today) : null; v = P ? phTime(P.sec) : ''; }
    } catch(e) { diagSilent(e, 'piste-home:pred'); }
    _phPred = { k: pk, t: Date.now(), v: v };
  }
  o.pred = _phPred.v;
  // forme du jour : la même valeur que la carte « Forme du jour » (jamais celle de la veille)
  o.formWait = typeof whoopStartupLoading === 'function' && whoopStartupLoading();
  const F = state._form_today;
  if(F && F.date === today && F.score != null) o.form = F.score;
  else { try { const G = typeof prFormScore === 'function' ? prFormScore() : null; o.form = G ? G.score : null; } catch(e) { diagSilent(e, 'piste-home:form'); o.form = null; } }
  return o;
}

// ─── affichage ───────────────────────────────────────────────────────────────
const _phEsc = function(x){ return String(x == null ? '' : x).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
function _phInit(el){
  if(el.dataset.ready) return;
  el.dataset.ready = '1';
  el.innerHTML = '<div id="ph-top" class="ph-top"></div><div id="ph-ring" class="ph-card"></div><div id="ph-chips" class="ph-chips"></div><div id="ph-blocks" class="ph-blocks"></div>';
  const chips = el.querySelector('#ph-chips'), blocks = el.querySelector('#ph-blocks');
  ['home-search-btn', 'notif-btn', 'wakeup-btn', 'home-sleep-btn', 'home-ef-pill', 'home-weather-loading', 'home-weather-strip', 'home-share-btn'].forEach(function(id){ const e = document.getElementById(id); if(e) chips.appendChild(e); });
  ['home-live-btn', 'home-no-race-btn'].forEach(function(id){ const e = document.getElementById(id); if(e) blocks.appendChild(e); });
  // la journée avant la Forme du jour
  const day = document.getElementById('home-day-card'), form = document.getElementById('home-form-card');
  if(day && form && form.parentNode) form.parentNode.insertBefore(day, form);
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
    document.getElementById('ph-top').innerHTML = '<div class="ph-hd"><p class="ph-eb">' + _phEsc(V.eyebrow) + '</p><h1 class="ph-hi">' + _phEsc(V.greet) + '</h1></div>'
      + (mic ? '<button type="button" class="ph-mic" onclick="openCoachVoice()" aria-label="Parler au Coach à la voix"><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>' : '');
    const bl = document.getElementById('ph-blocks');
    if(bl) bl.style.display = [].some.call(bl.children, function(c){ return c.style.display !== 'none' && getComputedStyle(c).display !== 'none'; }) ? '' : 'none';
    const ring = document.getElementById('ph-ring');
    if(!V.ring){ ring.style.display = 'none'; ring.innerHTML = ''; }
    else {
      ring.style.display = '';
      ring.innerHTML = '<div class="ph-row"><button type="button" class="ph-box" onclick="phGoal()" aria-label="' + _phEsc(V.big + ', ' + V.race + ', ' + V.sub) + '">'
        + '<svg viewBox="0 0 330 190" aria-hidden="true"><rect class="ph-trk" x="8" y="8" width="314" height="174" rx="87"/><path class="ph-prog" d="M165 8H235A87 87 0 0 1 235 182H95A87 87 0 0 1 95 8Z" stroke-dasharray="' + V.dash + ' 900"/>'
        + '<rect class="ph-lane" x="28" y="28" width="274" height="134" rx="67"/><rect class="ph-lane" x="44" y="44" width="242" height="102" rx="51"/><line class="ph-start" x1="165" y1="0" x2="165" y2="20"/></svg>'
        + '<span class="ph-mid"><b class="ph-big">' + _phEsc(V.big) + '</b></span></button>'
        + '<div class="ph-rt"><button type="button" class="ph-rn" onclick="phGoal()" tabindex="-1" aria-hidden="true"><span class="ph-race">' + _phEsc(V.race) + '</span><span class="ph-sub">' + _phEsc(V.sub) + '</span></button>'
        + '<div class="ph-tiles"><button type="button" class="ph-tile" onclick="phGoal()"><small>Objectif</small><b>' + _phEsc(V.obj) + '</b></button>'
        + '<button type="button" class="ph-tile" onclick="phGoal()"><small>Prévu</small><b class="hot">' + _phEsc(V.pred) + '</b></button>'
        + '<button type="button" class="ph-tile" onclick="showScreen(\'stats\')"><small>Forme</small><b class="' + V.formCls + '">' + _phEsc(V.form) + '</b></button></div></div></div>';
    }
    return true;
  } catch(e) { diagSilent(e, 'piste-home:phRender'); return false; }
}

// « Ma journée » en version piste : bloc « Maintenant » (bordure orange) + liste (fait ✓, ensuite →)
const PH_CK = '<svg class="ph-ck" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round"><path d="M5 12l5 5 9-10"/></svg>';
function phDayHtml(L, nowMin){
  _phCss();
  const E = _phEsc, now = L.filter(function(x){ return x.st === 'now'; })[0], later = L.filter(function(x){ return x.st === 'later'; });
  const done = L.filter(function(x){ return x.st === 'done'; }), n = L.filter(function(x){ return !x.info && !x.soft; }), nd = n.filter(function(x){ return x.done; }).length;
  const cnt = n.length ? '<span class="ph-cnt">' + nd + ' sur ' + n.length + ' fait' + (nd > 1 ? 's' : '') + '</span>' : '';
  let h = '<div class="ph-day">';
  if(now){
    h += '<div class="ph-now" role="group" aria-label="' + E(mjNowInfo(now, nowMin).lab + ' : ' + now.t) + '"><div class="ph-now-hd"><span class="ph-eb2">';
    const I = mjNowInfo(now, nowMin);
    const lp = I.lab.split(' · ');
    h += E(lp[0].toUpperCase()) + (lp.length > 1 ? ' · ' + E(lp.slice(1).join(' · ')) : '') + '</span>' + cnt + '</div>'
      + '<div class="ph-nr"><button type="button" class="ph-nb"' + (now.act ? ' onclick="' + now.act + '"' : '') + '><b>' + E(now.t) + '</b>' + (now.s ? '<span>' + E(now.s) + '</span>' : '') + '</button>'
      + (now.listen && typeof coachAI === 'function' && coachAI() && typeof openCoachVoice === 'function' ? '<button type="button" class="mj-go mj-ear" onclick="openCoachVoice({brief:true})" aria-label="Écouter le brief">🎧</button>' : '')
      + (now.btn && !I.early ? '<button type="button" class="mj-go" onclick="' + (now.btnAct || now.act) + '">' + now.btn + '</button>' : '') + '</div>'
      + (I.extra.length && !/^À valider/.test(I.lab) ? '<div class="ph-ex">' + I.extra.join('') + '</div>' : '') + '</div>';   // séance passée : ni chaussure ni météo
  }
  const rows = [];
  done.filter(function(x){ return x.kind === 'sess'; }).forEach(function(x){
    const go = typeof openSessionPiste === 'function' ? 'openSessionPiste(\'' + x.key + '\')' : x.act;
    rows.push('<div class="ph-li"><button type="button" class="ph-lb" onclick="' + go + '">' + PH_CK + '<b>' + E(x.t) + '</b><span>' + E(x.s) + '</span></button>'
      + (x.share && typeof openSessionShare === 'function' ? '<button type="button" class="mj-sh" onclick="openSessionShare(\'' + x.key + '\')" aria-label="Image de ta séance à partager">📸</button>' : '') + '</div>');
  });
  const dc = done.filter(function(x){ return x.kind !== 'sess'; });
  // fait : une ligne « ✓ Réveil · Alcool 6/10 · Brief · Repos » ; journée bouclée → le compteur au bout de cette ligne (pas de bloc en plus)
  if(dc.length || !now) rows.unshift('<div class="ph-li ph-dl">' + PH_CK + '<span class="ph-dli">' + (dc.length ? dc.map(function(x){
    return '<button type="button"' + (x.act ? ' onclick="' + x.act + '"' : '') + '>' + E(x.short || x.t) + '</button>'; }).join('<i aria-hidden="true">·</i>') : '<b>Journée bouclée</b>') + '</span>'
    + (!now && n.length ? '<span class="ph-cnt">' + nd + '/' + n.length + '</span>' : '') + '</div>');
  const open = typeof _mjOpen !== 'undefined' && _mjOpen, shown = open ? later : later.slice(0, 2);
  shown.forEach(function(x){
    const t = x.id === 'next' || !x.tm ? '→' : _mjHm(_mjMin(x.tm));
    rows.push('<button type="button" class="ph-li ph-l"' + (x.act ? ' onclick="' + x.act + '"' : '') + '><span class="ph-arr' + (t === '→' ? ' ic' : '') + '">' + t + '</span><b>' + E(x.t) + '</b>' + (x.s && x.s.length <= 24 ? '<span class="ph-v">' + E(x.s) + '</span>' : '') + '</button>');
  });
  if(later.length > 2) rows.push('<button type="button" class="ph-li ph-more" onclick="mjToggle()">' + (open ? 'Moins' : '+ ' + (later.length - 2) + ' autre' + (later.length > 3 ? 's' : '')) + '</button>');
  if(rows.length) h += '<div class="ph-list">' + rows.join('') + '</div>';
  return h + '</div>';
}

function _phCss(){
  if(typeof document === 'undefined' || document.getElementById('ph-css')) return;
  const st = document.createElement('style'); st.id = 'ph-css'; st.dataset.th = '1';      // couleurs déjà « piste » : jamais converties
  const BS = "'Big Shoulders Display',Manrope,sans-serif";
  st.textContent = '#home-piste{flex-direction:column;gap:8px;padding:calc(env(safe-area-inset-top,0px) + 10px) 16px 2px;color:#F2F4F8;}'
    + '.ph-top{display:flex;align-items:center;justify-content:space-between;gap:12px;}.ph-hd{min-width:0;}'
    + '.ph-eb{margin:0;font-size:11.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#9AA6BF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.ph-hi{margin:1px 0 0;font-size:21px;font-weight:800;letter-spacing:-.02em;line-height:1.15;color:#F2F4F8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.ph-mic{width:42px;height:42px;border-radius:50%;border:none;background:#E0603A;color:#0E1424;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;padding:0;}'
    + '.ph-card{background:#161E33;border-radius:22px;padding:8px 10px 8px 8px;display:flex;flex-direction:column;align-items:stretch;gap:8px;}.ph-row{display:flex;align-items:center;gap:10px;}.ph-rt{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;}.ph-rn{display:flex;flex-direction:column;gap:1px;border:none;background:none;padding:0;color:inherit;font:inherit;text-align:left;cursor:pointer;min-width:0;}'
    + '.ph-box{position:relative;width:112px;flex-shrink:0;border:none;background:none;padding:0;color:inherit;font:inherit;cursor:pointer;display:block;}.ph-box svg{display:block;width:100%;height:auto;}'
    + '.ph-trk{fill:none;stroke:#24304D;stroke-width:16;}.ph-prog{fill:none;stroke:#E0603A;stroke-width:16;stroke-linecap:round;}'
    + '.ph-lane{fill:none;stroke:#2C3858;stroke-width:1.5;stroke-dasharray:6 6;}.ph-start{stroke:#F2F4F8;stroke-width:3;}'
    + '.ph-mid{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;}'
    + '.ph-big{font-family:' + BS + ';font-weight:900;font-size:31px;line-height:1;white-space:nowrap;letter-spacing:.01em;color:#F2F4F8;}'
    + '.ph-race{font-size:14.5px;font-weight:800;color:#F2F4F8;max-width:100%;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.ph-sub{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;font-weight:600;color:#9AA6BF;}'
    + '.ph-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;width:100%;}'
    + '.ph-tile{background:#0E1424;border:none;border-radius:16px;padding:4px 7px 3px;display:flex;flex-direction:column;align-items:flex-start;min-width:0;color:#F2F4F8;font:inherit;cursor:pointer;text-align:left;}'
    + '.ph-tile small{font-size:8.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9AA6BF;}'
    + '.ph-tile b{font-family:' + BS + ';font-weight:800;font-size:19px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;}'
    + '.ph-tile b.hot{color:#E0603A;}.ph-tile b.ok{color:#5BD08A;}.ph-tile b.mid{color:#E8A33D;}.ph-tile b.low{color:#EF7A54;}'
    + '.ph-chips{display:flex;flex-wrap:nowrap;align-items:center;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 -16px;padding:0 16px;}.ph-chips::-webkit-scrollbar{display:none;}.ph-chips>*{flex-shrink:0;}.ph-chips>*{margin:0!important;}.ph-chips:empty,.ph-blocks:empty{display:none;}'
    + '.ph-blocks{display:flex;flex-direction:column;gap:10px;}.ph-blocks>*{margin-bottom:0!important;}'
    + '.ph-day{display:flex;flex-direction:column;gap:8px;}'
    + '.ph-now{border:2px solid #E0603A;border-radius:20px;padding:9px 12px 9px;background:rgba(224,96,58,.08);display:flex;flex-direction:column;gap:7px;}'
    + '.ph-now-hd{display:flex;align-items:center;justify-content:space-between;gap:10px;}'
    + '.ph-eb2{font-size:11px;font-weight:800;letter-spacing:.12em;color:#E0603A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.ph-cnt{font-size:12px;font-weight:700;color:#9AA6BF;white-space:nowrap;flex-shrink:0;font-variant-numeric:tabular-nums;}'
    + '.ph-nr{display:flex;align-items:center;gap:10px;}'
    + '.ph-nb{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;border:none;background:none;padding:0;color:#F2F4F8;font:inherit;text-align:left;cursor:pointer;}'
    + '.ph-nb b{font-size:17px;font-weight:800;letter-spacing:-.01em;line-height:1.2;}.ph-nb span{font-size:13px;color:#C2CADB;font-variant-numeric:tabular-nums;}'
    + '.ph-now .mj-go{flex-shrink:0;height:42px;border:none;border-radius:14px;background:#E0603A;color:#0E1424;padding:0 14px;font:inherit;font-size:14px;font-weight:800;cursor:pointer;white-space:nowrap;}'
    + '.ph-now .mj-go.mj-ear{background:transparent;border:1px solid #2C3858;color:#F2F4F8;padding:0 12px;}'
    + '.ph-ex{display:flex;flex-wrap:wrap;align-items:center;gap:2px 12px;border-top:1px dashed #2C3858;padding-top:6px;font-size:12px;color:#C2CADB;}.ph-ex p{margin:0!important;}.ph-ex .mj-shoe{font-weight:700;color:#C2CADB;white-space:nowrap;}'
    + '.ph-lh{justify-content:space-between;min-height:38px;}'
    + '.ph-list{background:#161E33;border-radius:22px;padding:4px 14px;display:flex;flex-direction:column;}'
    + '.ph-li{display:flex;align-items:center;gap:10px;min-height:40px;border:none;border-bottom:1px solid #24304D;background:none;padding:0;color:#F2F4F8;font:inherit;text-align:left;width:100%;min-width:0;}.ph-li:last-child{border-bottom:none;}'
    + 'button.ph-li{cursor:pointer;}.ph-li b{flex:0 1 auto;font-size:14px;font-weight:700;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.ph-li .ph-v,.ph-lb>span{margin-left:auto;font-size:13px;font-weight:600;color:#C2CADB;white-space:nowrap;flex:0 1 auto;min-width:0;max-width:45%;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums;padding-left:8px;}'
    + '.ph-lb{flex:1;min-width:0;display:flex;align-items:center;gap:10px;border:none;background:none;padding:0;color:inherit;font:inherit;text-align:left;cursor:pointer;min-height:40px;}'
    + '.ph-ck{stroke:#5BD08A;flex-shrink:0;}'
    + '.ph-dli{display:flex;align-items:center;gap:5px;min-width:0;white-space:nowrap;overflow:hidden;}.ph-dli button{border:none;background:none;padding:4px 0;color:#F2F4F8;font:inherit;font-size:14px;font-weight:700;cursor:pointer;flex-shrink:0;}.ph-dli i{font-style:normal;color:#5B6884;}'
    + '.ph-li .ph-v{flex:0 0 auto;max-width:none;}.ph-dl .ph-cnt{margin-left:auto;padding-left:8px;}.ph-dli b{font-size:14px;font-weight:800;}.ph-arr.ic{width:18px!important;}'
    + '.ph-arr{width:38px;flex-shrink:0;font-size:12px;font-weight:800;letter-spacing:.04em;color:#9AA6BF;font-variant-numeric:tabular-nums;}'
    + '.ph-li .mj-sh{width:36px;height:36px;border-radius:12px;border:1px solid #2C3858;background:transparent;font-size:15px;cursor:pointer;flex-shrink:0;}'
    + '.ph-more{color:#E0603A;font-size:13px;font-weight:800;}';

  // Forme du jour plus lisible : jauge à côté du titre, mesures sur toute la largeur ; lignes des séances faites allégées
  const P = 'html[data-theme=dark][data-piste]';
  st.textContent += P + ' .pd-form:not(.fail):not(.wait):not(.load){display:grid;grid-template-columns:54px minmax(0,1fr);column-gap:12px;row-gap:8px;align-items:center;border-radius:20px;padding:12px;}'
    + P + ' .pd-form:not(.fail):not(.wait):not(.load)>div{display:contents;}'
    + P + ' .pd-form:not(.fail):not(.wait):not(.load) .pd-gauge{grid-column:1;grid-row:1/3;width:54px;height:54px;}'
    + P + ' .pd-form:not(.fail):not(.wait):not(.load) .pd-form-l{grid-column:2;grid-row:1;align-self:end;}'
    + P + ' .pd-form:not(.fail):not(.wait):not(.load)>div>b{grid-column:2;grid-row:2;align-self:start;font-size:16px;line-height:1.25;}'
    + P + ' .pd-form:not(.fail):not(.wait):not(.load)>div>:nth-child(n+3){grid-column:1/-1;margin-top:0!important;}'
    + P + ' .hs-row .hs-d[title],' + P + ' .hs-row .hs-ch{display:none;}' + P + ' .hs-row{border-radius:14px;padding:9px 12px;font-size:13px;}' + P + ' .hs-row .hs-share{flex-shrink:0;}'
    + P + ' #safe-top{background:rgba(14,20,36,.94)!important;height:calc(env(safe-area-inset-top,0px) + 6px);}';
  document.head.appendChild(st);
}
