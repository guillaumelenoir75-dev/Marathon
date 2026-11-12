// season.js — « 🗓️ Ma saison » : toutes les courses de l'année sur une frise (prépa en cours, prépa à venir, étapes),
// phases et volume prévu semaine par semaine, alertes (objectifs trop proches, récupération sacrifiée, semaines
// insuffisantes, étape dans l'affûtage) et intégration automatique des étapes dans le plan :
//   B « à fond » : course insérée, 2 jours avant allégés, récupération après (pas d'intensité, volume réduit) ;
//   C « à l'entraînement » : course insérée à la place de la sortie longue de la semaine, lendemain facile.
// Chaque intégration garde les valeurs d'avant (race.applied.prev) : retirer la course rétablit le plan.
// Courses ajoutées : state._season = { races: [{ id, name, date, km, prio: 'B'|'C', applied? }] } (gardé d'une prépa à
// l'autre). Les séances insérées portent _season = id : jamais prises pour la course objectif (preps.js, race-analysis.js).
// Module chargé à la demande (groupe « season », point d'entrée openSeason).
const SEASON_RECOV = { '5 km': 3, '10 km': 6, 'Semi-marathon': 13, 'Marathon': 26 };
const SEASON_MINW = { '5 km': 6, '10 km': 8, 'Semi-marathon': 10, 'Marathon': 16 };
const SEASON_PHASES = { 1: 'Base', 2: 'Développement', 3: 'Spécifique', 4: 'Affûtage' };
function seasonCat(km){ km = +km || 0; return km >= 40 ? 'Marathon' : km >= 20 ? 'Semi-marathon' : km >= 9 ? '10 km' : km >= 4 ? '5 km' : null; }
function seasonRecov(km){ const c = seasonCat(km); return c ? SEASON_RECOV[c] : Math.max(2, Math.round((+km || 0) / 1.6)); }
const _seAdd = function(iso, n){ const d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); d.setDate(d.getDate() + n); return prIso(d); };
const _seDate = function(d, y){ return new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('fr-FR', y ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short' }); };
const _seDays = function(a, b){ return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); };
function seasonKm(o){ const ob = (o && o.onboarding) || {}; return parseFloat(ob.race_distance_km) || ({ 'Marathon': 42.195, 'Semi-marathon': 21.1, '10 km': 10, '5 km': 5 })[ob.course] || null; }

// une prépa (en cours ou à venir) : semaines, phases, km prévus, course objectif
function seasonPrep(st, kind, meta){
  if(!st || !st.plan_start_date) return null;
  const mon = prIso(prMonday(st.plan_start_date)), ob = st.onboarding || {}, weeks = [];
  const S = prSessions(st);
  for(let w = 1; w <= 60; w++){
    if(st['extra_w' + w + '_s0'] === undefined && !st['meta_w' + w]) { if(w > 1) break; else continue; }
    let m = {}; try { m = JSON.parse(st['meta_w' + w] || '{}') || {}; } catch(e) {}
    const ph = typeof m.phase === 'number' ? SEASON_PHASES[m.phase] || 'Phase ' + m.phase : m.phase || '';
    const km = S.filter(function(s){ return s.w === w && !s.skip && s.type !== 'rest'; }).reduce(function(t, s){ return t + (s.done ? s.km : s.kmPlan); }, 0);
    weeks.push({ w: w, mon: _seAdd(mon, (w - 1) * 7), phase: m.isTaper ? 'Affûtage' : m.isRecov ? 'Récupération' : ph, taper: !!m.isTaper, recov: !!m.isRecov, peak: !!m.isPeak, km: Math.round(km) });
  }
  const date = ob.date || (meta && meta.date) || null;
  return { kind: kind, start: mon, end: date || (weeks.length ? _seAdd(weeks[weeks.length - 1].mon, 6) : mon), weeks: weeks,
    race: date ? { id: kind, name: ob.race_name || (meta && meta.title) || ob.course || 'Course objectif', date: date, km: seasonKm(st) || (meta && parseFloat(meta.km)) || null, prio: 'A', kind: kind } : null };
}
// toutes les courses : objectifs (prépas), étapes ajoutées, courses passées (prep_index)
function seasonRaces(st, cur, next, idx){
  const out = [];
  if(cur && cur.race) out.push(cur.race);
  if(next && next.race) out.push(next.race);
  ((st._season || {}).races || []).forEach(function(r){ if(r && r.date) out.push(Object.assign({ kind: 'etape' }, r)); });
  Object.keys(idx || {}).forEach(function(id){ const m = idx[id] || {}; if(m.date && (!cur || !cur.race || m.date !== cur.race.date)) out.push({ id: 'past-' + id, name: m.race || m.title || 'Course', date: m.date, km: ({ 'Marathon': 42.195, 'Semi-marathon': 21.1, '10 km': 10, '5 km': 5 })[m.dist] || parseFloat(m.km) || null, prio: 'A', kind: 'past', result: m.result || null }); });
  return out.sort(function(a, b){ return a.date.localeCompare(b.date); });
}
// alertes de la saison (à venir seulement)
function seasonChecks(races, cur, next, today){
  const out = [], fut = races.filter(function(r){ return r.date >= today && r.kind !== 'past'; });
  const fmt = function(r){ return r.name + ' (' + _seDate(r.date) + ')'; };
  // prépa à venir : semaines disponibles et récupération de la course d'avant
  if(next && next.race){
    const cat = seasonCat(next.race.km), weeks = Math.floor(_seDays(next.start, next.race.date) / 7) + 1;
    if(cat && weeks < SEASON_MINW[cat]) out.push({ lvl: 'bad', t: next.race.name + ' : ' + weeks + ' sem. de prépa, ' + SEASON_MINW[cat] + ' conseillées' });
    const prev = races.filter(function(r){ return r.prio === 'A' && r.date < next.start; }).pop();
    if(prev && prev.km){ const gap = _seDays(prev.date, next.start), need = Math.ceil(seasonRecov(prev.km) / 2);
      if(gap < need) out.push({ lvl: 'warn', t: 'Prépa ' + next.race.name + ' : ' + gap + ' j après ' + prev.name + ', ' + need + ' j de repos conseillés' }); }
  }
  fut.forEach(function(r, i){
    const nxt = fut.slice(i + 1);
    // deux objectifs trop proches
    nxt.filter(function(o){ return r.prio === 'A' && o.prio === 'A'; }).forEach(function(o){ const gap = _seDays(r.date, o.date), need = seasonRecov(r.km) + 21;
      if(gap < need) out.push({ lvl: 'bad', t: 'Deux objectifs à ' + gap + ' j : ' + r.name + ' et ' + o.name }); });
    if(r.prio === 'B' || r.prio === 'C'){
      const A = fut.filter(function(o){ return o.prio === 'A' && o.date >= r.date; })[0];
      if(A){ const gap = _seDays(r.date, A.date), lim = r.prio === 'B' ? Math.max(10, seasonRecov(r.km) + 4) : 6;
        if(gap < lim) out.push({ lvl: r.prio === 'B' ? 'bad' : 'warn', t: fmt(r) + ' à ' + gap + ' j de ' + A.name + (r.prio === 'B' ? ' : passe-la à l\'entraînement' : ' : trop près') }); }
      const Ab = races.filter(function(o){ return o.prio === 'A' && o.date < r.date; }).pop();
      if(Ab && Ab.km){ const gap = _seDays(Ab.date, r.date), rec = seasonRecov(Ab.km); if(gap < rec) out.push({ lvl: 'warn', t: fmt(r) + ' : ' + gap + ' j après ' + Ab.name + ', récupération de ' + rec + ' j' }); }
      const B2 = nxt.filter(function(o){ return o.prio === 'B'; })[0];
      if(r.prio === 'B' && B2 && _seDays(r.date, B2.date) < 14) out.push({ lvl: 'warn', t: 'Deux courses à fond à ' + _seDays(r.date, B2.date) + ' j : ' + r.name + ', ' + B2.name });
      [cur, next].forEach(function(P){ if(!P) return; const W = P.weeks.find(function(x){ return r.date >= x.mon && r.date <= _seAdd(x.mon, 6); });
        if(W && W.taper && r.prio === 'B') out.push({ lvl: 'warn', t: fmt(r) + ' tombe dans l\'affûtage' }); });
    }
  });
  return out;
}

// ─── Intégration d'une étape dans un plan (état st) : changements à écrire, valeurs d'avant ───
function seasonRaceChanges(st, race){
  if(!st || !st.plan_start_date || !race || !race.date) return { error: 'pas de plan' };
  const mon = prIso(prMonday(st.plan_start_date)), d0 = _seDays(mon, race.date);
  if(d0 < 0) return { error: 'avant la prépa' };
  const w = Math.floor(d0 / 7) + 1;
  if(st['extra_w' + w + '_s0'] === undefined) return { error: 'après la prépa' };
  const sets = {}, notes = [], km = Math.round((+race.km || 10) * 10) / 10, B = race.prio === 'B';
  let n = 0; while(n <= 50 && st['extra_w' + w + '_s' + n] !== undefined) n++;
  const key = 'extra_w' + w + '_s' + n;
  sets[key] = JSON.stringify({ type: 'race', km: km, d: '🏁 ' + race.name + '|' + (B ? 'course à fond · échauffement 15 min + 3 lignes droites' : 'à l\'entraînement : allure marathon à semi, jamais dans le rouge'),
    sched_date: race.date, sched_day: prWeekday(race.date), sched_time: race.time || '09:30', _season: race.id });
  const S = prSessions(st).filter(function(s){ return !s.done && !s.skip && s.type !== 'rest' && s.type !== 'race' && s.date; });
  const easy = function(s, f, why){
    const x = Object.assign({}, s.x), km2 = Math.max(3, Math.round(s.kmPlan * f));
    if(s.type === 'tempo' || s.type === 'frac'){ x.type = 'ef'; x.d = 'Footing EF|très facile · ' + km2 + ' km' + (why === 'avant' ? ' + 4 lignes droites' : ''); }
    else { const parts = String(x.d || '').split('|'); x.d = parts[0] + '|' + (typeof prKmDetail === 'function' ? prKmDetail(parts.slice(1).join('|'), x.type, s.kmPlan, km2) : parts.slice(1).join('|')); }
    x.km = km2; x._seq = (x._seq || 0) + 1; sets[s.key] = JSON.stringify(x);
    notes.push(_seDate(s.date) + ' · ' + s.title + ' → ' + (x.type === 'ef' && s.type !== 'ef' ? 'Footing EF ' : '') + km2 + ' km');
  };
  const skip = function(s, why){ sets[s.key + '_skip'] = true; sets[s.key + '_skip_reason'] = why; notes.push(_seDate(s.date) + ' · ' + s.title + ' → retirée (' + why + ')'); };
  S.filter(function(s){ return s.date === race.date; }).forEach(function(s){ skip(s, 'jour de course'); });
  if(B){
    const rec = Math.max(2, Math.round(seasonRecov(km) * 0.6));
    S.forEach(function(s){
      const dd = _seDays(race.date, s.date);
      if(dd >= -2 && dd <= -1) easy(s, s.type === 'long' ? 0.6 : 0.7, 'avant');
      else if(dd >= 1 && dd <= rec && (s.type === 'tempo' || s.type === 'frac' || s.type === 'long')) easy(s, s.type === 'long' ? 0.75 : 0.7, 'après');
    });
  } else {
    const L = S.filter(function(s){ return s.type === 'long' && s.date !== race.date && Math.abs(_seDays(race.date, s.date)) <= 3; })[0];
    if(L) skip(L, 'remplacée par ' + race.name);
    S.filter(function(s){ return _seDays(race.date, s.date) === 1 && (s.type === 'tempo' || s.type === 'frac'); }).forEach(function(s){ easy(s, 0.8, 'après'); });
  }
  const prev = {}; Object.keys(sets).forEach(function(k){ prev[k] = st[k] === undefined ? null : st[k]; });
  return { w: w, key: key, sets: sets, prev: prev, notes: notes };
}
// retrait : chaque clé rétablie si elle n'a pas changé depuis l'intégration (séance faite ou retouchée : gardée)
function seasonRaceUndo(st, applied){
  const up = {}, kept = [];
  Object.keys((applied && applied.sets) || {}).forEach(function(k){
    const cur = st[k] === undefined ? null : st[k], set = applied.sets[k];
    if(String(cur) !== String(set) || (/^extra_w\d+_s\d+$/.test(k) && (st[k + '_done'] || st[k + '_km'] != null))){ kept.push(k); return; }
    up[k] = applied.prev[k] === undefined ? null : applied.prev[k];
  });
  return { up: up, kept: kept };
}

// ─── Écran ───
let _seNext = null, _seNextSt = null, _seIdx = null;
function _seEsc(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function _seCss(){
  if(document.getElementById('se-css')) return;
  const s = document.createElement('style'); s.id = 'se-css';
  s.textContent = '.se-sec{display:flex;flex-direction:column;gap:8px;}.se-h{margin:0;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#64748B;}'
    + '.se-tl{position:relative;overflow-x:auto;background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:10px 0 6px;}.se-tl-in{position:relative;height:150px;}'
    + '.se-m{position:absolute;top:0;bottom:0;border-left:1px dashed #E2E8F0;font-size:10px;color:#94A3B8;padding-left:3px;}'
    + '.se-bar{position:absolute;height:12px;border-radius:3px;}.se-vol{position:absolute;bottom:22px;width:6px;border-radius:2px 2px 0 0;background:#93C5FD;}'
    + '.se-race{position:absolute;top:34px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;font-size:10px;font-weight:800;white-space:nowrap;}'
    + '.se-race i{font-style:normal;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;}'
    + '.se-today{position:absolute;top:0;bottom:0;border-left:2px solid #DC2626;}'
    + '.se-leg{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:11px;color:#475569;}.se-leg span{display:inline-flex;align-items:center;gap:4px;}.se-leg b{width:10px;height:10px;border-radius:2px;display:inline-block;}'
    + '.se-al{margin:0;padding:8px 10px;border-radius:10px;font-size:12.5px;font-weight:650;}.se-al.bad{background:#FEF2F2;color:#991B1B;}.se-al.warn{background:#FFF7ED;color:#9A3412;}'
    + '.se-r{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:9px 11px;}'
    + '.se-p{flex-shrink:0;width:26px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px;color:#fff;}'
    + '.se-r span{flex:1;min-width:0;display:flex;flex-direction:column;}.se-r b{font-size:14px;color:#0F172A;}.se-r small{font-size:11.5px;color:#64748B;}'
    + '.se-x{border:none;background:#F1F5F9;color:#475569;border-radius:8px;padding:6px 9px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;}'
    + '.se-f{display:grid;grid-template-columns:1fr 1fr;gap:8px;background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:12px;}'
    + '.se-f input,.se-f select{width:100%;box-sizing:border-box;padding:9px;border:1.5px solid #CBD5E1;border-radius:10px;font:inherit;font-size:14px;}'
    + '.se-f .full{grid-column:1/-1;}.se-go{grid-column:1/-1;padding:12px;border:none;border-radius:12px;background:#1B4FD8;color:#fff;font:inherit;font-weight:800;cursor:pointer;}'
    + '.se-pri{display:flex;gap:6px;grid-column:1/-1;}.se-pri button{flex:1;padding:9px 6px;border-radius:10px;border:1.5px solid #CBD5E1;background:#fff;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;}.se-pri button.on{border-color:#1B4FD8;background:#EEF2FF;color:#1B4FD8;}'
    + '.se-notes{margin:0;padding-left:16px;font-size:12px;color:#334155;}';
  document.head.appendChild(s);
}
const SE_COL = { A: '#D97706', B: '#7C3AED', C: '#64748B' };
const SE_PH = function(p){ p = String(p || '').toLowerCase(); return /affût/.test(p) ? '#A855F7' : /récup|reprise/.test(p) ? '#94A3B8' : /spécif|allègement|course/.test(p) ? '#F97316' : /dév|consolid|fraction|construct/.test(p) ? '#22C55E' : '#3B82F6'; };
function _seTimeline(cur, next, races, today){
  const from = _seAdd(today, -35), to0 = races.concat([{ date: _seAdd(today, 150) }]).reduce(function(m, r){ return r.date > m ? r.date : m; }, today), to = _seAdd(to0, 21);
  const days = _seDays(from, to), W = Math.max(320, Math.round(days * 3.2)), x = function(d){ return Math.round(_seDays(from, d) / days * W); };
  let h = '<div class="se-tl-in" style="width:' + W + 'px;">';
  for(let d = from.slice(0, 8) + '01'; d <= to; d = _seAdd(d.slice(0, 8) + '28', 4).slice(0, 8) + '01'){
    if(d < from) continue;
    h += '<div class="se-m" style="left:' + x(d) + 'px;">' + new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { month: 'short' }) + '</div>';
  }
  const maxKm = Math.max(10, ...[cur, next].filter(Boolean).flatMap(function(P){ return P.weeks.map(function(w){ return w.km; }); }));
  [cur, next].filter(Boolean).forEach(function(P, pi){
    P.weeks.forEach(function(w){
      if(_seAdd(w.mon, 6) < from) return;
      h += '<div class="se-bar" style="left:' + x(w.mon) + 'px;width:' + Math.max(4, x(_seAdd(w.mon, 7)) - x(w.mon) - 1) + 'px;top:' + (16 + pi * 0) + 'px;background:' + SE_PH(w.phase) + ';" title="S' + w.w + ' · ' + _seEsc(w.phase) + ' · ' + w.km + ' km"></div>';
      h += '<div class="se-vol" style="left:' + (x(w.mon) + 4) + 'px;height:' + Math.round(w.km / maxKm * 50) + 'px;" title="' + w.km + ' km"></div>';
    });
  });
  races.forEach(function(r){
    if(r.date < from) return;
    const c = r.kind === 'past' ? '#CBD5E1' : SE_COL[r.prio] || '#64748B';
    h += '<div class="se-race" style="left:' + x(r.date) + 'px;color:' + c + ';"><i style="background:' + c + ';">' + (r.prio || 'A') + '</i>' + _seEsc(String(r.name).slice(0, 16)) + '</div>';
    if(r.prio === 'A' && r.km && r.kind !== 'past') h += '<div class="se-bar" style="left:' + x(r.date) + 'px;width:' + Math.max(3, x(_seAdd(r.date, seasonRecov(r.km))) - x(r.date)) + 'px;top:30px;height:4px;background:#CBD5E1;" title="récupération"></div>';
  });
  h += '<div class="se-today" style="left:' + x(today) + 'px;" title="aujourd\'hui"></div></div>';
  return h;
}
let _sePrio = 'B';
async function openSeason(){
  _seCss();
  const mc = document.getElementById('modal-container'); if(!mc) return;
  const old = document.getElementById('se-modal'); if(old) old.remove();
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'se-modal'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  ov.innerHTML = '<div class="modal-box" style="max-height:92vh;"><div style="flex-shrink:0;padding:16px;border-radius:24px 24px 0 0;color:#fff;background:linear-gradient(135deg,#1E3A8A,#2563EB);display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">'
    + '<div><p style="font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;opacity:.8;margin:0;">Plan</p><p style="font-size:20px;font-weight:900;margin:2px 0;">🗓️ Ma saison</p><p style="font-size:12.5px;margin:0;opacity:.9;">Tes courses, tes phases, ton volume</p></div>'
    + '<button onclick="document.getElementById(\'se-modal\').remove()" aria-label="Fermer" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:34px;height:34px;border-radius:50%;font-size:20px;cursor:pointer;flex-shrink:0;">×</button></div>'
    + '<div class="modal-scroll-body" style="background:#F5F8FF;"><div id="se-body" style="padding:14px 16px 24px;display:flex;flex-direction:column;gap:14px;"><p style="margin:0;color:#475569;">⏳ Chargement…</p></div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  mc.appendChild(ov);
  try {
    const nx = typeof _prepRef === 'function' ? await _prepRef('prep_next').once('value') : null, v = nx && nx.val ? nx.val() : null;
    _seNext = v && v.meta || null; _seNextSt = v && v.state || null;
    const ix = typeof _prepRef === 'function' ? await _prepRef('prep_index').once('value') : null; _seIdx = ix && ix.val ? ix.val() || {} : {};
  } catch(e) { _seNext = null; _seNextSt = null; _seIdx = {}; }
  seasonRender();
}
function seasonRender(msg){
  const box = document.getElementById('se-body'); if(!box) return;
  const today = prTodayIso(), cur = seasonPrep(state, 'cur'), next = _seNextSt ? seasonPrep(Object.assign({}, _seNextSt, { onboarding: _seNextSt.onboarding || (_seNext && _seNext.onboarding) }), 'next', _seNext) : null;
  const races = seasonRaces(state, cur, next, _seIdx), al = seasonChecks(races, cur, next, today);
  const up = races.filter(function(r){ return r.date >= today; }), past = races.filter(function(r){ return r.date < today; }).slice(-3);
  const line = function(r){
    const cat = seasonCat(r.km), lab = r.prio === 'A' ? (r.kind === 'next' ? 'Objectif · prépa à venir' : r.kind === 'past' ? 'Objectif passé' + (r.result ? ' · ' + r.result : '') : 'Objectif') : r.prio === 'B' ? 'À fond' : 'À l\'entraînement';
    return '<div class="se-r"><i class="se-p" style="background:' + (r.kind === 'past' ? '#CBD5E1' : SE_COL[r.prio]) + ';font-style:normal;">' + r.prio + '</i><span><b>' + _seEsc(r.name) + '</b><small>' + _seDate(r.date, true) + (cat ? ' · ' + cat : r.km ? ' · ' + r.km + ' km' : '') + ' · ' + lab
      + (r.applied ? ' · intégrée au plan' : '') + '</small></span>' + (r.kind === 'etape' ? '<button type="button" class="se-x" onclick="seasonRemove(\'' + r.id + '\')">Retirer</button>' : '') + '</div>';
  };
  box.innerHTML = (msg ? '<p class="se-al" style="background:#ECFDF3;color:#166534;">' + msg + '</p>' : '')
    + '<div class="se-sec"><p class="se-h">Frise</p><div class="se-tl">' + _seTimeline(cur, next, races, today) + '</div>'
    + '<div class="se-leg"><span><b style="background:#3B82F6"></b>Base</span><span><b style="background:#22C55E"></b>Développement</span><span><b style="background:#F97316"></b>Spécifique</span><span><b style="background:#A855F7"></b>Affûtage</span><span><b style="background:#94A3B8"></b>Récup</span><span><b style="background:#93C5FD"></b>km / sem.</span></div></div>'
    + (al.length ? '<div class="se-sec"><p class="se-h">À surveiller</p>' + al.map(function(a){ return '<p class="se-al ' + a.lvl + '">' + (a.lvl === 'bad' ? '⚠️ ' : '🟠 ') + _seEsc(a.t) + '</p>'; }).join('') + '</div>' : '<p class="se-al" style="background:#ECFDF3;color:#166534;">✅ Saison cohérente</p>')
    + '<div class="se-sec"><p class="se-h">À venir</p>' + (up.length ? up.map(line).join('') : '<p style="margin:0;color:#64748B;font-size:13px;">Aucune course à venir.</p>') + '</div>'
    + '<div class="se-sec"><p class="se-h">Ajouter une course</p><div class="se-f">'
    + '<input id="se-name" class="full" placeholder="Nom (ex. Corrida de Noël)" maxlength="40">'
    + '<input id="se-date" type="date" min="' + today + '"><select id="se-km"><option value="5">5 km</option><option value="10" selected>10 km</option><option value="15">15 km</option><option value="21.1">Semi</option><option value="42.195">Marathon</option></select>'
    + '<div class="se-pri"><button type="button" data-p="B" class="' + (_sePrio === 'B' ? 'on' : '') + '" onclick="seasonPrio(\'B\')">B · à fond</button><button type="button" data-p="C" class="' + (_sePrio === 'C' ? 'on' : '') + '" onclick="seasonPrio(\'C\')">C · à l\'entraînement</button></div>'
    + '<button type="button" class="se-go" onclick="seasonAdd()">Ajouter et adapter le plan</button></div></div>'
    + (past.length ? '<div class="se-sec"><p class="se-h">Dernières courses</p>' + past.map(line).join('') + '</div>' : '');
}
function seasonPrio(p){ _sePrio = p === 'C' ? 'C' : 'B'; document.querySelectorAll('.se-pri button').forEach(function(b){ b.classList.toggle('on', b.dataset.p === _sePrio); }); }
// plan visé par une date : prépa en cours (état affiché) ou prépa à venir (prep_next/state)
function _seTarget(date){
  const nst = _seNextSt;
  if(nst && nst.plan_start_date && date >= prIso(prMonday(nst.plan_start_date))) return { st: nst, next: true };
  return { st: state, next: false };
}
async function _seWrite(T, up){
  if(T.next){ Object.keys(up).forEach(function(k){ if(up[k] === null) delete T.st[k]; else T.st[k] = up[k]; }); await _prepRef('prep_next/state').update(up); }
  else { Object.keys(up).forEach(function(k){ if(up[k] === null) delete state[k]; else state[k] = up[k]; }); }
}
async function seasonAdd(){
  const name = (document.getElementById('se-name').value || '').trim(), date = document.getElementById('se-date').value, km = parseFloat(document.getElementById('se-km').value);
  if(!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)){ alert('Indique le nom et la date de la course.'); return; }
  if(date < prTodayIso()){ alert('Choisis une date à venir.'); return; }
  const race = { id: 'se' + Date.now().toString(36), name: name.slice(0, 40), date: date, km: km, prio: _sePrio };
  const T = _seTarget(date), C = seasonRaceChanges(T.st, race);
  let msg = '✅ ' + race.name + ' ajoutée';
  if(!C.error){
    await _seWrite(T, C.sets);
    race.applied = { at: new Date().toISOString(), next: T.next, sets: C.sets, prev: C.prev, notes: C.notes };
    msg += ' et intégrée au plan' + (C.notes.length ? ' : ' + C.notes.length + ' séance' + (C.notes.length > 1 ? 's' : '') + ' adaptée' + (C.notes.length > 1 ? 's' : '') : '');
  } else msg += ' (hors de tes prépas : pas de séance modifiée)';
  const S = state._season && Array.isArray(state._season.races) ? state._season : { races: [] };
  state._season = { races: S.races.concat([race]) };
  save();
  if(typeof rendered !== 'undefined'){ rendered.plan = false; rendered.stats = false; }
  try { renderHome(); } catch(e) { diagSilent(e, 'season:seasonAdd'); }
  seasonRender(msg + (race.applied && race.applied.notes.length ? '<ul class="se-notes">' + race.applied.notes.map(function(n){ return '<li>' + _seEsc(n) + '</li>'; }).join('') + '</ul>' : ''));
}
async function seasonRemove(id){
  const S = (state._season || {}).races || [], r = S.find(function(x){ return x.id === id; }); if(!r) return;
  if(!confirm('Retirer ' + r.name + ' de ta saison ?' + (r.applied ? ' Les séances adaptées reprennent leur version d\'avant.' : ''))) return;
  let kept = [];
  if(r.applied){
    const T = r.applied.next ? { st: _seNextSt || {}, next: true } : { st: state, next: false }, U = seasonRaceUndo(T.st, r.applied);
    kept = U.kept; if(Object.keys(U.up).length) await _seWrite(T, U.up);
  }
  state._season = { races: S.filter(function(x){ return x.id !== id; }) };
  save();
  if(typeof rendered !== 'undefined'){ rendered.plan = false; rendered.stats = false; }
  try { renderHome(); } catch(e) { diagSilent(e, 'season:seasonRemove'); }
  seasonRender('↩ ' + _seEsc(r.name) + ' retirée' + (kept.length ? ' (' + kept.length + ' séance' + (kept.length > 1 ? 's' : '') + ' déjà faite' + (kept.length > 1 ? 's' : '') + ' ou retouchée' + (kept.length > 1 ? 's' : '') + ' gardée' + (kept.length > 1 ? 's' : '') + ')' : ''));
}
