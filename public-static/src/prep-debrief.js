// Mes prépas › bilan de fin de prépa et « recette » personnelle : ce qu'une prépa apprend à la suivante.
// prepDebrief(st, meta) : bilan d'une prépa terminée (copie figée) — régularité, volume, hausses encaissées ou suivies d'une
// douleur / d'un arrêt, affûtage réellement fait, niveau d'entraînement début → fin, jour J, allures tenues, douleurs, leçons.
// prepRecette(bilans) : réglages personnels appliqués à « Mettre à jour le plan » (progression de volume, affûtage par
// famille de distance, calibrage des allures, base). Stockage : prep_index/{id}/debrief, state._recette (gardée d'une prépa à l'autre).

const PD_DEBRIEF_V = 2;   // 2 : analyse de la course (d.ra)
const PD_MIN_DONE = 0.6;   // une prépa validée à moins de 60 % ne sert pas à la recette (volume, affûtage faussés)
const _pdMed = function(a){ a = a.filter(function(x){ return x != null && isFinite(x); }).sort(function(x, y){ return x - y; }); return a.length ? a[Math.floor(a.length / 2)] : null; };
const _pdPct = function(x){ return Math.round(x * 100) + ' %'; };
const _pdLong = function(dist){ return dist === 'Marathon' || dist === 'Semi-marathon'; };

function prepDebrief(st, meta){
  meta = meta || {};
  if(!st._plan_engine && !st.plan_start_date) st = Object.assign({}, st, { plan_start_date: '2026-03-09' });   // plan Seine-Eure écrit en dur
  const sess = prSessions(st).filter(function(s){ return s.type !== 'rest'; });
  if(!sess.length) return null;
  const W = {};
  sess.forEach(function(s){
    const o = W[s.w] = W[s.w] || { w: s.w, plan: 0, done: 0, race: false, pain: 0, stop: false };
    if(s.type === 'race') o.race = true; else { o.plan += s.kmPlan; if(s.done) o.done += s.km; }
    if(s.done && s.perf && s.perf.pain && s.perf.pain.level >= 2) o.pain = Math.max(o.pain, s.perf.pain.level);
    if(st[s.key + '_skip'] && /Malade|Blessé/.test(st[s.key + '_skip_reason'] || '')) o.stop = true;
  });
  const weeks = Object.keys(W).map(Number).sort(function(a, b){ return a - b; }).map(function(w){ return W[w]; });
  const raceW = weeks.filter(function(o){ return o.race; }).map(function(o){ return o.w; }).pop();
  const doneS = sess.filter(function(s){ return s.done; });
  const peak = Math.max.apply(null, weeks.map(function(o){ return o.done; }).concat([0]));
  const pre = weeks.filter(function(o){ return raceW == null || o.w < raceW - 2; }).map(function(o){ return o.done; }).filter(function(x){ return x > 0; }).slice(-8);
  const avg8 = pre.length ? Math.round(pre.reduce(function(a, b){ return a + b; }, 0) / pre.length) : null;
  const longest = Math.round(Math.max.apply(null, doneS.filter(function(s){ return s.type === 'long'; }).map(function(s){ return s.km; }).concat([0])));
  // hausses d'une semaine à l'autre (semaines d'au moins 10 km) : suivies ou non d'une douleur / d'un arrêt dans les 2 semaines
  const rises = [];
  for(let i = 1; i < weeks.length; i++){
    const a = weeks[i - 1], b = weeks[i];
    if(a.done >= 10 && b.done >= 10 && !b.race) rises.push({ i: i, w: b.w, r: b.done / a.done, hurt: weeks.slice(i, i + 3).some(function(o){ return o.pain >= 2 || o.stop; }) });
  }
  // chaque douleur / arrêt est imputé à la plus forte hausse des 2 semaines qui le précèdent
  const risky = [];
  weeks.forEach(function(o, j){
    if(!(o.pain >= 2 || o.stop)) return;
    const c = rises.filter(function(x){ return x.i <= j && x.i >= j - 2; }).sort(function(x, y){ return y.r - x.r; })[0];
    if(c && c.r > 1.08 && risky.indexOf(c.r) < 0) risky.push(c.r);
  });
  const okR = rises.filter(function(x){ return !x.hurt; }).map(function(x){ return x.r; });
  // affûtage réellement fait (part du pic)
  const g = function(w){ return (W[w] || {}).done || 0; };
  const taper = raceW != null && peak > 0 ? { w0: Math.round(g(raceW) / peak * 100) / 100, w1: Math.round(g(raceW - 1) / peak * 100) / 100, w2: Math.round(g(raceW - 2) / peak * 100) / 100 } : null;
  // niveau d'entraînement (séances de qualité) : premier tiers → dernier tiers ; jour J
  const q = doneS.map(function(s){ return { w: s.w, v: typeof prSessionVdot === 'function' ? prSessionVdot(s, 196) : null }; }).filter(function(x){ return x.v; });
  const nW = weeks.length, startL = _pdMed(q.filter(function(x){ return x.w <= Math.max(2, nW / 3); }).map(function(x){ return x.v; })), endL = _pdMed(q.filter(function(x){ return x.w > nW * 2 / 3; }).map(function(x){ return x.v; }));
  const m = PR_RACE_M[meta.dist], res = prTimeSec(meta.result), goal = prTimeSec(meta.target || st.target_time || (st.onboarding || {}).target_time);
  const raceV = m && res ? vdotFromRace(m, res) + (meta.dist === 'Marathon' ? 0.8 : 0) : null;            // marathon corrigé, comme pour le niveau
  const dayOk = raceV != null && endL != null ? raceV >= endL - 0.5 : res && goal ? res <= goal * 1.01 : null;
  const calib = typeof prCalib === 'function' ? prCalib(st) : { n: 0, k: 0 };
  const pains = doneS.filter(function(s){ return s.perf && s.perf.pain && s.perf.pain.level >= 2; }).map(function(s){ return { date: s.date, zone: s.perf.pain.zone || 'Non précisée', level: s.perf.pain.level }; });
  const stops = sess.filter(function(s){ return st[s.key + '_skip'] && /Malade|Blessé/.test(st[s.key + '_skip_reason'] || ''); }).length;
  const completion = sess.length ? doneS.length / sess.length : null;
  // leçons en clair
  const L = [];
  if(completion != null) L.push(completion >= 0.9 ? '✅ Régularité : ' + _pdPct(completion) + ' des séances faites.' : completion < 0.75 ? '⚠️ ' + _pdPct(completion) + ' des séances faites : un plan plus léger ou plus souple t\'irait mieux.' : '👍 ' + _pdPct(completion) + ' des séances faites.');
  if(completion != null && completion < PD_MIN_DONE) L.push('ℹ️ Trop peu de séances validées dans l\'app : ce bilan n\'entre pas dans ta recette.');
  if(avg8) L.push('📈 Volume habituel ~' + avg8 + ' km/sem, pic ' + Math.round(peak) + ' km' + (longest ? ', sortie longue jusqu\'à ' + longest + ' km' : '') + '.');
  if(risky.length) L.push('🩹 Une douleur ou un arrêt a suivi une hausse de +' + Math.round((Math.min.apply(null, risky) - 1) * 100) + ' % : la prochaine fois, reste en dessous.');
  else if(okR.length && Math.max.apply(null, okR) >= 1.12) L.push('💪 Hausses jusqu\'à +' + Math.round((Math.max.apply(null, okR) - 1) * 100) + ' %/semaine encaissées sans souci.');
  if(startL && endL) L.push('🚀 Niveau d\'entraînement ' + prV(startL) + ' → ' + prV(endL) + ' (' + (endL >= startL ? '+' : '') + prV(endL - startL) + ').');
  if(taper && dayOk != null) L.push(dayOk ? '🎯 Jour J à ton niveau : affûtage à reproduire (' + _pdPct(taper.w2) + ' → ' + _pdPct(taper.w1) + ' → ' + _pdPct(taper.w0) + ' du pic).' : '🔁 Jour J en dessous de ton niveau d\'entraînement : affûtage à revoir (' + _pdPct(taper.w2) + ' → ' + _pdPct(taper.w1) + ' → ' + _pdPct(taper.w0) + ' du pic).');
  if(res && goal) L.push(res <= goal ? '🏁 Objectif atteint : ' + prTime(res) + ' pour ' + prTime(goal) + '.' : '🏁 Objectif manqué de ' + prTime(res - goal) + ' (' + prTime(res) + ' pour ' + prTime(goal) + ').');
  if(calib.n >= 2) L.push('🎯 Allures proposées tenues : ' + calib.k + '/' + calib.n + '.');
  if(pains.length || stops) L.push('🩹 ' + (pains.length ? pains.length + ' douleur' + (pains.length > 1 ? 's' : '') + ' gênante' + (pains.length > 1 ? 's' : '') + ' (' + pains.map(function(p){ return p.zone.toLowerCase(); }).filter(function(z, i, a){ return a.indexOf(z) === i; }).join(', ') + ')' : '') + (pains.length && stops ? ', ' : '') + (stops ? stops + ' séance' + (stops > 1 ? 's' : '') + ' manquée' + (stops > 1 ? 's' : '') + ' (maladie / blessure)' : '') + '.');
  return { v: PD_DEBRIEF_V, at: prTodayIso(), title: meta.title || '', race: meta.race || '', dist: meta.dist || '', date: meta.date || '', result: meta.result || null,
    sessions: { planned: sess.length, done: doneS.length, skipped: sess.filter(function(s){ return s.skip; }).length }, completion: completion,
    volume: { avg8: avg8, peak: Math.round(peak), longest: longest, weekly: weeks.map(function(o){ return Math.round(o.done); }) },
    rises: { maxOk: okR.length ? Math.round(Math.max.apply(null, okR) * 100) / 100 : null, risky: risky.length ? Math.round(Math.min.apply(null, risky) * 100) / 100 : null },
    taper: taper, taperOk: dayOk, level: { start: startL, end: endL, race: raceV }, goal: goal || null, calib: { n: calib.n, k: calib.k }, pains: pains, stops: stops, lessons: L,
    ra: typeof raFromSnap === 'function' && meta.result ? raFromSnap(st, meta) : null };
}

// recette : bilans du plus récent au plus ancien
function prepRecette(list, curRa){
  // départ du plan de course : la course la plus récente analysée (prépa en cours comprise), même si la prépa était peu validée
  const ras = [curRa].concat((list || []).map(function(d){ return d && d.ra; })).filter(function(r){ return r && r.start && r.pacing; });
  list = (list || []).filter(function(d){ return d && (d.completion == null || d.completion >= PD_MIN_DONE); }); if(!list.length && !ras.length) return null;
  const pacing = ras.length ? (ras[0].startAdvice === 'slower' ? { start: 1.02, why: 'départ trop rapide à ' + (ras[0].name || ras[0].cat) + ' (' + String(Math.round(ras[0].start.pct * 10) / 10).replace('.', ',') + ' % sur ' + ras[0].start.n + ' km)' } : { start: null, why: 'départ bien géré à ' + (ras[0].name || ras[0].cat) }) : null;
  if(!list.length) return { v: 1, at: prTodayIso(), progression: 1.12, progWhy: 'règle de base (+12 %)', taper: {}, calib: null, calibWhy: '', base: null, longest: null, from: [], pacing: pacing };
  const risky = list.map(function(d){ return d.rises && d.rises.risky; }).filter(Boolean), okR = list.map(function(d){ return d.rises && d.rises.maxOk; }).filter(Boolean);
  let prog = 1.12, progWhy = 'règle de base (+12 %)';
  if(risky.length){ const r = Math.min.apply(null, risky); prog = Math.max(1.05, Math.min(1.12, r - 0.03)); progWhy = 'une douleur a suivi une hausse de +' + Math.round((r - 1) * 100) + ' %'; }
  else if(okR.length && Math.max.apply(null, okR) >= 1.15){ prog = 1.15; progWhy = 'hausses jusqu\'à +' + Math.round((Math.max.apply(null, okR) - 1) * 100) + ' % bien encaissées'; }
  // affûtage : celui de la course la plus récente réussie (jour J au niveau), par famille de distance
  const taper = {};
  list.forEach(function(d){ if(!d.taper || !d.taperOk) return; const fam = _pdLong(d.dist) ? 'long' : 'short'; if(!taper[fam]) taper[fam] = { w0: d.taper.w0, w1: d.taper.w1, w2: d.taper.w2, from: d.title }; });
  const n = list.reduce(function(a, d){ return a + ((d.calib || {}).n || 0); }, 0), k = list.reduce(function(a, d){ return a + ((d.calib || {}).k || 0); }, 0);
  const calib = n >= 3 ? (k / n < 0.5 ? 'prudent' : k / n >= 0.8 ? 'confiant' : 'normal') : null;
  return { v: 1, at: prTodayIso(), progression: Math.round(prog * 1000) / 1000, progWhy: progWhy, taper: taper, calib: calib, calibWhy: n ? k + '/' + n + ' allures tenues' : '',
    base: list[0].volume ? list[0].volume.avg8 : null, longest: Math.max.apply(null, list.map(function(d){ return (d.volume || {}).longest || 0; }).concat([0])) || null,
    from: list.map(function(d){ return d.title; }).slice(0, 4), pacing: pacing };
}

// bilans manquants des prépas terminées (copies figées), puis recette ; appelée chaque jour et à l'ouverture de Mes prépas
let _pdDebriefBusy = null;
function prepDebriefAll(){
  if(_pdDebriefBusy) return _pdDebriefBusy;
  _pdDebriefBusy = (async function(){
    if((typeof _prepView !== 'undefined' && _prepView) || typeof _prepRef !== 'function') return false;
    if(!_prepIndex) _prepIndex = (await _prepRef('prep_index').once('value')).val() || {};
    const today = prTodayIso(), ids = Object.keys(_prepIndex).filter(function(id){ const p = _prepIndex[id]; return p && p.date && p.date < today && id !== state._prep_id; });
    let changed = false;
    for(const id of ids){
      const p = _prepIndex[id];
      if(p.debrief && p.debrief.v === PD_DEBRIEF_V) continue;
      let st = null; try { st = await _prepGetSnap(id); } catch(e) {}
      if(!st) continue;
      const d = prepDebrief(st, Object.assign({ target: (st.onboarding || {}).target_time || st.target_time }, p)); if(!d) continue;
      p.debrief = d; changed = true;
      try { await _prepRef('prep_index/' + id + '/debrief').set(d); } catch(e) {}
    }
    const list = Object.keys(_prepIndex).map(function(id){ return _prepIndex[id]; }).filter(function(p){ return p && p.debrief; })
      .sort(function(a, b){ return String(b.date || '').localeCompare(String(a.date || '')); }).map(function(p){ return p.debrief; });
    const R = prepRecette(list, state._race_analysis), sig = JSON.stringify(R && Object.assign({}, R, { at: '' })), old = JSON.stringify(state._recette && Object.assign({}, state._recette, { at: '' }));
    if(sig !== old){
      if(R) state._recette = R; else delete state._recette;
      if(dbRef) dbRef.child('_recette').set(R || null).catch(function(){}); changed = true;
    }
    return changed;
  })().catch(function(e){ console.warn('[bilan] ', e); return false; }).finally(function(){ setTimeout(function(){ _pdDebriefBusy = null; }, 0); });
  return _pdDebriefBusy;
}

// ─── Affichage ──────────────────────────────────────────────────────────────
function prepRecetteLines(R){
  if(!R) return [];
  const L = ['📈 Progression : +' + Math.round((R.progression - 1) * 100) + ' %/semaine au plus — ' + R.progWhy + '.'];
  if(R.taper && R.taper.long) L.push('🪶 Affûtage semi / marathon : ' + _pdPct(R.taper.long.w2) + ' → ' + _pdPct(R.taper.long.w1) + ' → ' + _pdPct(R.taper.long.w0) + ' du pic (repris de ' + R.taper.long.from + ').');
  if(R.taper && R.taper.short) L.push('🪶 Affûtage 10 km / 5 km : ' + _pdPct(R.taper.short.w1) + ' → ' + _pdPct(R.taper.short.w0) + ' du pic (repris de ' + R.taper.short.from + ').');
  if(R.calib) L.push('🎯 Allures : calcul ' + R.calib + ' (' + R.calibWhy + ').');
  if(R.pacing && R.pacing.start) L.push('🐢 Départ de course : un peu plus prudent sur les premiers km (' + R.pacing.why + ').');
  if(R.base) L.push('🏋️ Base ~' + R.base + ' km/sem' + (R.longest ? ', sortie longue jusqu\'à ' + R.longest + ' km' : '') + '.');
  return L;
}
function prepRecetteCard(){
  const R = state._recette; if(!R) return '';
  _pdbCss();
  return '<section class="pp-card pdb-rec"><div class="pdb-rec-h"><span>🧬</span><div><p class="pp-title" style="margin:0;font-size:16px;">Ta recette</p><p class="pp-sub">Tirée de ' + R.from.map(_prepEsc).join(', ') + ' · appliquée à « Mettre à jour le plan »</p></div></div>'
    + '<ul class="pdb-ul">' + prepRecetteLines(R).map(function(l){ return '<li>' + _prepEsc(l) + '</li>'; }).join('') + '</ul></section>';
}
async function openPrepDebrief(id){
  _pdbCss();
  const p = (_prepIndex || {})[id]; if(!p) return;
  if(!p.debrief || p.debrief.v !== PD_DEBRIEF_V){ await prepDebriefAll(); }
  const d = p.debrief;
  const mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'prep-debrief'; ov.style.zIndex = '730'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  let b = '';
  if(!d) b = '<p class="pdb-note">Pas assez de séances validées dans cette prépa pour en tirer un bilan.</p>';
  else {
    const kpi = function(v, l){ return '<div class="pdb-k"><b>' + v + '</b><span>' + l + '</span></div>'; };
    b += '<div class="pdb-kpis">' + kpi(d.sessions.done + '/' + d.sessions.planned, 'séances faites') + kpi(d.volume.avg8 ? '~' + d.volume.avg8 : '—', 'km/sem habituels') + kpi(d.volume.peak || '—', 'km au pic') + kpi(d.volume.longest || '—', 'km plus longue') + '</div>';
    if(d.volume.weekly && d.volume.weekly.length > 1){
      const mx = Math.max.apply(null, d.volume.weekly.concat([1]));
      b += '<p class="pdb-sec">Volume réalisé</p><div class="pdb-bars">' + d.volume.weekly.map(function(v, i){ return '<i style="height:' + Math.max(3, Math.round(v / mx * 56)) + 'px" title="S' + (i + 1) + ' : ' + v + ' km"></i>'; }).join('') + '</div>';
    }
    b += '<p class="pdb-sec">Ce que tu en retiens</p><ul class="pdb-ul">' + d.lessons.map(function(l){ return '<li>' + _prepEsc(l) + '</li>'; }).join('') + '</ul>';
    if(d.ra && typeof openRaceAnalysis === 'function'){ window._pdRa = d.ra; b += '<button type="button" class="ra-share" style="width:100%;margin-top:10px;" onclick="openRaceAnalysis(window._pdRa)">📊 Analyse de la course (' + _prepEsc(d.ra.time) + ')</button>'; if(typeof _raCss === 'function') _raCss(); }
    const RL = prepRecetteLines(state._recette);
    if(RL.length) b += '<p class="pdb-sec">Pour la suite (ta recette)</p><ul class="pdb-ul rec">' + RL.map(function(l){ return '<li>' + _prepEsc(l) + '</li>'; }).join('') + '</ul>';
  }
  ov.innerHTML = '<div class="modal-box" style="max-height:92vh;"><div class="pdb-head"><div><p class="pdb-eb">Bilan de prépa</p><p class="pdb-title">📋 ' + _prepEsc(p.title) + '</p><p class="pdb-sub">' + [p.date ? _prepDate(p.date) : '', p.result ? 'en ' + _prepEsc(p.result) : ''].filter(Boolean).join(' · ') + '</p></div>'
    + '<button class="pdb-x" onclick="document.getElementById(\'prep-debrief\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body" style="background:#F3F6FC;"><div style="padding:14px 16px 22px;display:flex;flex-direction:column;gap:10px;">' + b + '</div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  mc.appendChild(ov);
}
function _pdbCss(){
  if(document.getElementById('pdb-css')) return;
  const st = document.createElement('style'); st.id = 'pdb-css';
  st.textContent = '.pdb-head{flex-shrink:0;color:#fff;padding:16px;border-radius:24px 24px 0 0;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;background:linear-gradient(135deg,#134E4A,#0F766E);}'
    + '.pdb-eb{font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;opacity:.8;margin:0 0 2px;}.pdb-title{font-size:20px;font-weight:900;margin:0;}.pdb-sub{font-size:12.5px;opacity:.85;margin:3px 0 0;font-weight:600;}.pdb-x{flex-shrink:0;width:32px;height:32px;border-radius:50%;border:none;background:rgba(255,255,255,.2);color:#fff;font-size:18px;cursor:pointer;}'
    + '.pdb-kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;}.pdb-k{background:#fff;border:1px solid #DCE5F3;border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;}.pdb-k b{font-size:22px;font-weight:900;color:#0F766E;font-variant-numeric:tabular-nums;}.pdb-k span{font-size:11.5px;font-weight:700;color:#64748B;}'
    + '.pdb-sec{font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#64748B;margin:8px 2px 0;}'
    + '.pdb-bars{display:flex;align-items:flex-end;gap:3px;height:60px;background:#fff;border:1px solid #DCE5F3;border-radius:14px;padding:10px;}.pdb-bars i{flex:1;background:#5EEAD4;border-radius:3px 3px 0 0;min-width:3px;}'
    + '.pdb-ul{margin:0;padding:12px 14px 12px 14px;list-style:none;background:#fff;border:1px solid #DCE5F3;border-radius:14px;display:flex;flex-direction:column;gap:7px;font-size:13px;line-height:1.45;color:#1F2937;}.pdb-ul.rec{background:#F0FDFA;border-color:#99F6E4;}'
    + '.pdb-note{font-size:13px;color:#5B6675;margin:0;}.pdb-rec{background:linear-gradient(135deg,#F0FDFA,#ECFEFF);border-color:#99F6E4;}.pdb-rec-h{display:flex;gap:10px;align-items:center;}.pdb-rec-h>span{font-size:26px;}.pdb-rec .pdb-ul{background:transparent;border:none;padding:4px 0 0;}';
  document.head.appendChild(st);
}
