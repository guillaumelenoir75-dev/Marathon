// next-race.js — « 🧭 Ta prochaine course » : quelle course viser ensuite, quand, en combien de temps
// nrOptions(today) : début possible de la prochaine prépa (après la course en cours, ou après la récupération de la dernière course :
// moitié de ≈ 1 jour par mile), puis pour 5 km / 10 km / semi / marathon : semaines de prépa (minimum du générateur selon les séances
// par semaine, idéal), fenêtre de dates, temps visé réaliste / ambitieux (niveau du moment prFitness + progression attendue sur la
// prépa), record à battre (prepBestTime), mises en garde (volume habituel pour un marathon) → conseil (meilleure marge sur le record).
// nrCreate(o) : programme généré (generateAthletePlan, recette comprise) enregistré comme prépa à venir (users/{uid}/prep_next),
// activée automatiquement par preps.js (_prepMaybeAdvance) au début de la prépa.
const NR_CATS = ['5 km', '10 km', 'Semi-marathon', 'Marathon'];
const NR_RECOV = { '5 km': 3, '10 km': 6, 'Semi-marathon': 13, 'Marathon': 26 };
const NR_IDEAL = { '5 km': 8, '10 km': 10, 'Semi-marathon': 12, 'Marathon': 18 };
const NR_LABEL = { '5 km': '5 km', '10 km': '10 km', 'Semi-marathon': 'Semi-marathon', 'Marathon': 'Marathon' };
// même minimum que le générateur (plan-generate.js), selon le nombre de séances par semaine
function nrMinWeeks(cat, n){
  n = Math.min(4, Math.max(1, +n || 3));
  if(cat === '5 km') return 6;
  if(cat === '10 km') return n <= 2 ? 10 : 8;
  if(cat === 'Semi-marathon') return n <= 2 ? 14 : n === 3 ? 10 : 8;
  return n <= 2 ? 18 : n === 3 ? 14 : 12;
}
const _nrMonday = function(d){ const x = new Date(d + 'T12:00:00'), w = x.getDay(); x.setDate(x.getDate() + (w === 1 ? 0 : w === 0 ? 1 : 8 - w)); return prIso(x); };   // lundi ≥ d
const _nrRound = function(s, up){ const q = s >= 3600 ? 30 : 15; return (up ? Math.ceil(s / q) : Math.floor(s / q)) * q; };
const _nrDate = function(d, o){ return new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', o || { day: 'numeric', month: 'short' }).replace('.', ''); };

function nrOptions(today){
  today = today || prTodayIso();
  const R = typeof prepRace === 'function' ? prepRace() : {}, curCat = typeof PD_CAT === 'function' ? PD_CAT(R) : null;
  // ancre : course de la prépa en cours si elle est à venir, sinon dernière course connue
  let anchor = null;
  if(R.date && R.date >= today && curCat) anchor = { date: R.date, cat: curCat, name: R.name || curCat, upcoming: true };
  else {
    const rr = state._race_result; if(rr && rr.date && PR_RACE_M[rr.dist]) anchor = { date: rr.date, cat: rr.dist, name: R.name || rr.dist };
    (typeof prKnownRaces === 'function' ? prKnownRaces() : []).forEach(function(k){ if(k.date && k.date <= today && (!anchor || k.date > anchor.date)) anchor = { date: k.date, cat: k.cat, name: k.label || k.cat }; });
  }
  const recov = anchor ? NR_RECOV[anchor.cat] || 6 : 0;
  const from = anchor ? prAddDays(anchor.date, Math.ceil(recov / 2)) : today;
  const start = _nrMonday(from > today ? from : today);
  const n = +((state.onboarding || {}).sessions) || 3;
  // niveau et volume habituel
  let vdot = null; try { const f = prFitness(state, { today: today }); vdot = f && f.vdot; } catch(e) {}
  if(!vdot && typeof prKnownRaces === 'function' && typeof vdotFromRace === 'function'){   // sans niveau calculé : meilleure course connue
    prKnownRaces().forEach(function(k){ const s = prTimeSec(k.time), v = s && PR_RACE_M[k.cat] ? vdotFromRace(PR_RACE_M[k.cat], s) : null; if(v && (!vdot || v > vdot)) vdot = v; });
  }
  let base = null; try { const L = prLoad(today); base = L && L.chronic ? Math.round(L.chronic) : null; } catch(e) {}
  if(!base && state._recette && state._recette.base) base = state._recette.base;
  const opts = NR_CATS.map(function(cat){
    const minW = nrMinWeeks(cat, n);
    let idealW = Math.max(NR_IDEAL[cat], minW + 2);
    const warn = [];
    if(cat === 'Marathon' && base != null && base < 35){ idealW = Math.max(idealW, 20); warn.push('Volume habituel ~' + base + ' km/sem : un marathon demande d\'abord de monter vers 40-50 km/sem, prends au moins ' + idealW + ' semaines.'); }
    if(cat === 'Marathon' && n <= 2) warn.push('2 séances par semaine, c\'est juste pour un marathon : 3 ou 4 conseillées.');
    if(anchor && anchor.cat === 'Marathon' && cat === 'Marathon' && prDays(anchor.date, start) < 60) warn.push('Deux marathons rapprochés : laisse au moins 3 mois entre les deux.');
    idealW = Math.min(24, idealW);
    const earliest = prAddDays(start, minW * 7 - 1), ideal = prAddDays(start, idealW * 7 - 1);   // dimanches
    // temps visé : niveau du moment + progression attendue sur la prépa (≈ 1 point de niveau / 7 semaines, 2,5 au plus)
    let real = null, amb = null;
    if(vdot && typeof raceTimeFromVdot === 'function'){
      const g = Math.min(2.5, idealW / 7), v = cat === 'Marathon' ? vdot - 0.8 : vdot, slow = cat === 'Marathon' && base != null && base < 40 ? 1.02 : 1;
      real = _nrRound(raceTimeFromVdot(v + g * 0.6, PR_RACE_M[cat]) * slow, true);
      amb = _nrRound(raceTimeFromVdot(v + g, PR_RACE_M[cat]) * slow, false);
    }
    const rec = typeof prepBestTime === 'function' ? prepBestTime(cat) : null;
    const gain = rec && real ? (rec.sec - real) / rec.sec : null;
    return { cat: cat, minW: minW, idealW: idealW, earliest: earliest, ideal: ideal, window: [prAddDays(ideal, -14) < earliest ? earliest : prAddDays(ideal, -14), prAddDays(ideal, 21)],
      real: real, amb: amb, rec: rec ? { sec: rec.sec, time: rec.time } : null, gain: gain, warn: warn };
  });
  // conseil : la plus belle marge sur le record, sans mise en garde ; à défaut, le semi
  const order = ['Semi-marathon', '10 km', 'Marathon', '5 km'];
  const score = function(o){ return (o.warn.length ? -1 : 0) + (o.gain != null ? Math.max(-0.05, Math.min(0.08, o.gain)) * 10 : 0) - order.indexOf(o.cat) * 0.01; };
  const best = opts.slice().sort(function(a, b){ return score(b) - score(a); })[0];
  return { today: today, anchor: anchor, recov: recov, start: start, sessions: n, vdot: vdot, base: base, opts: opts, best: best.cat, next: typeof _prepNext !== 'undefined' ? _prepNext : null };
}

// prépa à venir : programme généré, enregistré dans users/{uid}/prep_next (activé au début de la prépa)
function nrBuild(o){
  const ob0 = state.onboarding || {}, start = o.start;
  const ob = { course: o.cat, date: o.date, race_name: o.name, sessions: String(o.sessions || ob0.sessions || 3), niveau: ob0.niveau || 'Intermédiaire',
    km_semaine: String(o.base || ob0.km_semaine || 30), generate_plan: 'oui', target_time: o.target ? prTime(o.target) : '', race_distance_km: PR_RACE_M[o.cat] / 1000,
    fc_max: state.fc_max || ob0.fc_max || null, ef_pace: state.ef_pace || ob0.ef_pace || null, run_days: ob0.run_days || null, run_times: ob0.run_times || null,
    run_time: ob0.run_time || state.run_time || null, plan_start_date: start };
  Object.keys(ob).forEach(function(k){ if(ob[k] == null) delete ob[k]; });
  const keys = generateAthletePlan(Object.assign({}, ob, { recette: state._recette || null }));
  keys.onboarding = ob; keys.goal_type = 'race'; keys.plan_start_date = start; keys.race_distance_km = ob.race_distance_km;
  if(ob.target_time) keys.target_time = ob.target_time;
  Object.keys(keys).forEach(function(k){
    if(!/^extra_w\d+_s\d+$/.test(k) || typeof shoeForType !== 'function') return;
    try { const x = JSON.parse(keys[k]); if(!x.shoe) x.shoe = shoeForType(x.type); keys[k] = JSON.stringify(x); } catch(e) {}
  });
  let first = null, nS = 0, nW = 0;
  Object.keys(keys).forEach(function(k){
    const m = k.match(/^extra_w(\d+)_s\d+$/); if(!m) return;
    nS++; nW = Math.max(nW, +m[1]);
    try { const d = JSON.parse(keys[k]).sched_date; if(d && (!first || d < first)) first = d; } catch(e) {}
  });
  const id = 'next-' + o.cat.replace(/[^a-z0-9]/gi, '').toLowerCase() + '-' + o.date;
  const meta = { id: id, title: o.name || (NR_LABEL[o.cat] + ' ' + o.date.slice(0, 4)), race: o.name || NR_LABEL[o.cat], dist: o.cat, date: o.date, start: start, first: first || start,
    after: state._prep_id || '', target: ob.target_time || '', weeks: nW, sessions: nS, createdAt: prTodayIso(), memo: '' };
  if(typeof _prepShape === 'function') try { meta.shape = _prepShape(keys); } catch(e) {}
  return { meta: meta, state: keys };
}
async function nrCreate(o){
  const P = nrBuild(o);
  await _prepRef('prep_next').set(P); _prepNext = P.meta;
  if(typeof _prepSnapCache !== 'undefined') delete _prepSnapCache['#next'];
  return P.meta;
}

// ─── Écran ───
let _nr = null;
async function openNextRace(){
  if(typeof _prepView !== 'undefined' && _prepView){ alert('Reviens sur ta prépa en cours pour choisir ta prochaine course.'); return; }
  _nrCss();
  if(typeof prPrefetch === 'function') try { await prPrefetch(); } catch(e) {}            // tout l'historique : niveau, volume, records
  _nr = { O: nrOptions(), sel: null };
  _nr.sel = _nr.O.best;
  const old = document.getElementById('nr-modal'); if(old) old.remove();
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'nr-modal'; ov.style.zIndex = '510';   // au-dessus de Mes prépas (#modal-container, 500), sous les confirmations ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  ov.innerHTML = '<div class="modal-box" style="max-height:92vh;"><div class="nr-head"><div><p class="nr-eb">Mes prépas</p><p class="nr-title">🧭 Ta prochaine course</p><p class="nr-sub" id="nr-sub"></p></div>'
    + '<button class="nr-x" onclick="document.getElementById(\'nr-modal\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body" style="background:#F5F7FB;"><div class="nr-body" id="nr-body"></div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
  _nrRender();
}
function _nrRender(){
  const O = _nr.O, body = document.getElementById('nr-body'); if(!body) return;
  document.getElementById('nr-sub').textContent = (O.vdot ? 'Niveau ' + prV(O.vdot) + ' · ' : '') + (O.anchor ? (O.anchor.upcoming ? 'après ' : 'récupéré de ') + O.anchor.name + ' · ' : '') + 'prépa possible dès le ' + _nrDate(O.start, { weekday: 'long', day: 'numeric', month: 'long' });
  let h = '';
  if(O.next) h += '<div class="nr-next">📌 Déjà prévue : <b>' + prEsc(O.next.title) + '</b> · ' + _nrDate(O.next.date, { day: 'numeric', month: 'long', year: 'numeric' }) + (O.next.target && prTimeSec(O.next.target) ? ' · objectif ' + prTime(prTimeSec(O.next.target)) : '') + '<br><span>En créer une autre la remplacera.</span></div>';
  O.opts.forEach(function(o){
    const on = _nr.sel === o.cat, best = O.best === o.cat;
    h += '<div class="nr-card' + (on ? ' on' : '') + '">'
      + '<button type="button" class="nr-top" onclick="_nrPick(\'' + o.cat + '\')" aria-expanded="' + on + '"><span class="nr-cat">' + NR_LABEL[o.cat] + (best ? ' <i>Conseillé</i>' : '') + '</span>'
      + '<span class="nr-when">entre le ' + _nrDate(o.window[0]) + ' et le ' + _nrDate(o.window[1], { day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' + o.idealW + ' sem. de prépa</span>'
      + (o.real ? '<span class="nr-t"><b>' + prTime(o.real) + '</b> réaliste · <b>' + prTime(o.amb) + '</b> ambitieux' + (o.rec ? ' · record ' + o.rec.time : '') + '</span>' : '')
      + (o.warn.length ? '<span class="nr-w">⚠️ ' + prEsc(o.warn[0]) + '</span>' : '') + '</button>';
    if(on){
      const d = o.ideal;
      h += '<div class="nr-form"><label>Nom de la course<input id="nr-name" placeholder="ex. ' + (o.cat === 'Semi-marathon' ? 'Semi de Paris' : o.cat === 'Marathon' ? 'Marathon de Paris' : o.cat + ' de ma ville') + '" maxlength="60"></label>'
        + '<label>Date<input type="date" id="nr-date" value="' + d + '" min="' + o.earliest + '"><small>Au plus tôt le ' + _nrDate(o.earliest, { day: 'numeric', month: 'long' }) + ' (' + o.minW + ' semaines)</small></label>'
        + (o.real ? '<div class="nr-tg" role="radiogroup" aria-label="Temps visé"><button type="button" role="radio" aria-checked="true" class="on" data-t="' + o.real + '" onclick="_nrTarget(this)">Réaliste<b>' + prTime(o.real) + '</b></button><button type="button" role="radio" aria-checked="false" data-t="' + o.amb + '" onclick="_nrTarget(this)">Ambitieux<b>' + prTime(o.amb) + '</b></button></div>' : '')
        + '<button type="button" class="nr-go" onclick="_nrGo()">Créer la prépa à venir</button>'
        + '<p class="nr-n">Le programme (' + O.sessions + ' séances/sem, ta recette comprise) démarre le ' + _nrDate(O.start, { day: 'numeric', month: 'long' }) + ' et prend le relais tout seul une fois ' + (O.anchor && O.anchor.upcoming ? 'ta course validée' : 'commencé') + '. Modifiable avant son début (Mes prépas › Voir et modifier).</p></div>';
    }
    h += '</div>';
  });
  h += '<p class="nr-n">Temps visés : ton niveau du moment + la progression habituelle sur une prépa de cette durée (le réaliste en garde la moitié). Mises à jour chaque semaine dans « MAJ le plan ».</p>';
  body.innerHTML = h;
}
function _nrPick(cat){ _nr.sel = _nr.sel === cat ? null : cat; _nrRender(); }
function _nrTarget(b){ b.parentNode.querySelectorAll('button').forEach(function(x){ const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on ? 'true' : 'false'); }); }
function _nrGo(){
  const o = _nr.O.opts.find(function(x){ return x.cat === _nr.sel; }); if(!o) return;
  const date = (document.getElementById('nr-date') || {}).value, name = ((document.getElementById('nr-name') || {}).value || '').trim();
  if(!date || date < o.earliest){ alert('Choisis une date à partir du ' + _nrDate(o.earliest, { day: 'numeric', month: 'long', year: 'numeric' }) + ' : il faut au moins ' + o.minW + ' semaines de prépa.'); return; }
  const tb = document.querySelector('#nr-modal .nr-tg button.on'), target = tb ? +tb.dataset.t : null;
  const run = async function(){
    try {
      const m = await nrCreate({ cat: o.cat, date: date, name: name || NR_LABEL[o.cat], target: target, start: _nr.O.start, sessions: _nr.O.sessions, base: _nr.O.base });
      const ov = document.getElementById('nr-modal'); if(ov) ov.remove();
      if(typeof showToast === 'function') showToast('Prépa à venir créée : ' + m.title + ' 🏁');
      if(typeof _renderPrepsBody === 'function') try { _renderPrepsBody(); } catch(e) {}
      if(typeof renderCompteHero === 'function') try { renderCompteHero(); } catch(e) {}
    } catch(e) { alert('Création impossible (' + e.message + ').'); }
  };
  if(_nr.O.next && typeof _showConfirmModal === 'function') _showConfirmModal({ icon: '🔁', title: 'Remplacer « ' + _nr.O.next.title + ' » ?', message: 'La prépa à venir déjà prévue sera remplacée par ce nouveau programme.', confirmLabel: 'Remplacer', confirmStyle: 'background:#1B4FD8;color:#fff;', onConfirm: run });
  else run();
}
function _nrCss(){
  if(typeof document === 'undefined' || document.getElementById('nr-css')) return;
  const st = document.createElement('style'); st.id = 'nr-css';
  st.textContent = '.nr-head{flex-shrink:0;padding:16px;border-radius:24px 24px 0 0;color:#fff;background:linear-gradient(135deg,#064E3B,#0F766E);display:flex;justify-content:space-between;align-items:flex-start;gap:10px;}'
    + '.nr-eb{font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;opacity:.75;margin:0;}.nr-title{font-size:20px;font-weight:900;margin:2px 0;}.nr-sub{font-size:12.5px;opacity:.9;margin:0;line-height:1.4;}'
    + '.nr-x{background:rgba(255,255,255,.2);border:none;color:#fff;width:34px;height:34px;border-radius:50%;font-size:20px;cursor:pointer;flex-shrink:0;}'
    + '.nr-body{padding:14px 16px 24px;display:flex;flex-direction:column;gap:10px;}'
    + '.nr-next{background:#FFFBEB;border:1px solid #FDE68A;border-radius:14px;padding:10px 12px;font-size:13px;color:#78350F;line-height:1.45;}.nr-next span{font-size:12px;color:#92400E;}'
    + '.nr-card{background:#fff;border:1.5px solid #E2E8F0;border-radius:16px;overflow:hidden;}.nr-card.on{border-color:#0F766E;box-shadow:0 4px 14px -8px rgba(15,118,110,.6);}'
    + '.nr-top{display:flex;flex-direction:column;gap:3px;width:100%;padding:12px 14px;border:none;background:none;text-align:left;font:inherit;cursor:pointer;color:#0F172A;}'
    + '.nr-cat{font-size:16px;font-weight:900;}.nr-cat i{font-style:normal;font-size:10.5px;font-weight:800;color:#fff;background:#0F766E;border-radius:20px;padding:2px 8px;margin-left:6px;vertical-align:2px;letter-spacing:.03em;}'
    + '.nr-when{font-size:12.5px;color:#475569;}.nr-t{font-size:13px;color:#1E293B;font-variant-numeric:tabular-nums;}.nr-t b{font-weight:900;}.nr-w{font-size:12px;color:#B45309;line-height:1.4;}'
    + '.nr-form{display:flex;flex-direction:column;gap:10px;padding:0 14px 14px;border-top:1px solid #F1F5F9;padding-top:12px;}'
    + '.nr-form label{display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:800;color:#64748B;text-transform:uppercase;letter-spacing:.05em;}'
    + '.nr-form input{font:inherit;font-size:15px;font-weight:600;color:#0F172A;text-transform:none;letter-spacing:0;padding:10px 12px;border:1px solid #CBD5E1;border-radius:10px;background:#F8FAFC;}.nr-form small{font-size:11.5px;font-weight:600;color:#64748B;text-transform:none;letter-spacing:0;}'
    + '.nr-tg{display:grid;grid-template-columns:1fr 1fr;gap:8px;}.nr-tg button{display:flex;flex-direction:column;align-items:center;gap:2px;padding:9px;border:1.5px solid #E2E8F0;border-radius:12px;background:#fff;font:inherit;font-size:12px;font-weight:700;color:#475569;cursor:pointer;}'
    + '.nr-tg button b{font-size:17px;font-weight:900;color:#0F172A;font-variant-numeric:tabular-nums;}.nr-tg button.on{border-color:#0F766E;background:#F0FDFA;color:#0F766E;}'
    + '.nr-go{padding:13px;border:none;border-radius:14px;background:#0F766E;color:#fff;font:inherit;font-size:14px;font-weight:800;cursor:pointer;}'
    + '.nr-top:focus-visible,.nr-tg button:focus-visible,.nr-go:focus-visible{outline:2px solid #0F766E;outline-offset:2px;}'
    + '.nr-n{font-size:12px;color:#64748B;margin:0;line-height:1.45;}';
  document.head.appendChild(st);
}
