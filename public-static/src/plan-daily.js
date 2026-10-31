// Entraînement au quotidien : allures ajustées à la météo, effort ressenti et douleurs, blocs lus depuis les tours Strava,
// imprévus (indisponibilité, semaine chargée, maladie), plan de course, forme du jour / série / badges.
// S'appuie sur plan-review.js (prSessions, prPace…) et plan-optim.js (prLoad, prWhoop…).

// ─── 6. Blocs de fractionné / tempo lus depuis les tours (laps) Strava ──────
// répétitions « 4 × 1000 m » ou « 3 × 8 min » : tours de la bonne longueur / durée, à une allure proche de la cible
function prBlocsFromLaps(title, detail, laps){
  if(!Array.isArray(laps) || laps.length < 3) return null;
  const txt = String(title || '') + ' · ' + String(detail || '');
  const mM = txt.match(/(\d+)\s*[×x]\s*(\d[\d\s]*?)\s*m\b(?!in)/i), mN = txt.match(/(\d+)\s*[×x]\s*(\d+(?:[,.]\d+)?)\s*min/i);
  const useM = mM && (!mN || txt.indexOf(mM[0]) <= txt.indexOf(mN[0]));
  const n = useM ? +mM[1] : mN ? +mN[1] : null; if(!n || n < 2) return null;
  const repM = useM ? parseInt(mM[2].replace(/\s/g, '')) : null, repS = !useM && mN ? parseFloat(mN[2].replace(',', '.')) * 60 : null;
  const pm = String(detail || '').match(PR_PACE_RE);
  const target = pm ? (prParsePace(pm[1], pm[2]) + (pm[3] ? prParsePace(pm[3], pm[4]) : prParsePace(pm[1], pm[2]))) / 2 : null;
  const L = laps.map(function(l){ return { d: (+l.distanceKm || 0) * 1000, t: +l.duree_sec || 0, p: prPaceSec(l.allure) }; }).filter(function(l){ return l.p && l.t; });
  const sorted = L.map(function(l){ return l.p; }).sort(function(a, b){ return a - b; }), median = sorted[Math.floor(sorted.length / 2)];
  const work = L.filter(function(l){
    const shape = repM ? Math.abs(l.d - repM) <= Math.max(60, repM * 0.12) : Math.abs(l.t - repS) <= Math.max(12, repS * 0.12);
    const pace = target ? (l.p <= target + 25 && l.p >= target - 45) : l.p < median - 20;
    return shape && pace;
  });
  if(work.length < Math.max(2, Math.ceil(n * 0.6))) return null;
  return work.slice(0, n).map(function(l){ return prPace(l.p).replace("'", ':'); });
}
// pré-remplissage de la fenêtre de validation après l'import Strava
function prFillBlocsFromStrava(activity){
  const ctx = window._currentValidationSession; if(!ctx || !ctx.s || (ctx.s.type !== 'tempo' && ctx.s.type !== 'frac')) return;
  const parts = String(ctx.s.d || '').split('|'), bl = prBlocsFromLaps(parts[0], parts.slice(1).join('|'), activity && activity.laps);
  const box = document.getElementById('val-blocs-container'); if(!box) return;
  const old = document.getElementById('val-blocs-strava-msg'); if(old) old.remove();
  const msg = document.createElement('p'); msg.id = 'val-blocs-strava-msg'; msg.style.cssText = 'font-size:11px;font-weight:700;margin-top:8px;text-align:center;';
  if(bl){
    let n = 0;
    bl.forEach(function(v, i){ const el = document.getElementById('val-bloc-' + i); if(el && !el.value.trim()){ el.value = v; el.style.borderColor = '#1382E4'; n++; } });
    msg.style.color = '#1382E4'; msg.textContent = n ? '⚡ ' + n + ' bloc' + (n > 1 ? 's' : '') + ' rempli' + (n > 1 ? 's' : '') + ' depuis tes tours Strava : vérifie-les.' : 'Blocs déjà renseignés.';
  } else { msg.style.color = '#888'; msg.textContent = 'Tours Strava non reconnus comme des blocs : renseigne l\'allure de chaque bloc d\'après ta montre (facultatif).'; }
  box.appendChild(msg);
}

// ─── Migration unique : dates des plans générés décalées d'un jour (toISOString en France) ───
// une séance dont la date tombe exactement la veille de son jour prévu (sched_day, 1 = lundi) est recalée
function prFixSchedDatesV1(){
  if(!state || state._sched_fix_v1 || (typeof _prepView !== 'undefined' && _prepView)) return;
  let n = 0;
  Object.keys(state).forEach(function(k){
    if(!/^extra_w\d+_s\d+$/.test(k)) return;
    let x; try { x = JSON.parse(state[k]); } catch(e) { return; }
    if(!x || !x.sched_date || !x.sched_day) return;
    const wd = prWeekday(x.sched_date);
    if(wd !== +x.sched_day && wd % 7 + 1 === +x.sched_day){ x.sched_date = prAddDays(x.sched_date, 1); state[k] = JSON.stringify(x); n++; }
  });
  state._sched_fix_v1 = true;
  if(n) console.log('[plan] ' + n + ' dates de séances recalées');
}

// ─── 2. Météo : prévision 7 jours et allure cible corrigée ──────────────────
let _prWx = null, _prWxTs = 0, _prWxBusy = false;
function prWxLoad(){
  if(_prWxBusy || (_prWx && Date.now() - _prWxTs < 3600000)) return Promise.resolve(_prWx);
  _prWxBusy = true;
  let pos = { lat: 48.8417, lng: 2.2945 };
  try { const l = typeof state._last_location === 'string' ? JSON.parse(state._last_location) : state._last_location; if(l && l.lat) pos = { lat: l.lat, lng: l.lng }; } catch(e) {}
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + pos.lat + '&longitude=' + pos.lng + '&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m&forecast_days=8&timezone=auto';
  return fetch(url, { credentials: 'omit' }).then(function(r){ return r.json(); }).then(function(d){
    _prWxTs = Date.now();
    if(d && d.hourly && d.hourly.time) _prWx = { time: d.hourly.time, t: d.hourly.temperature_2m, h: d.hourly.relative_humidity_2m, w: d.hourly.wind_speed_10m };
    return _prWx;
  }).catch(function(){ _prWxTs = Date.now(); return null; }).finally(function(){ _prWxBusy = false; });
}
function prWxAt(date, time, src){
  const W = src || _prWx; if(!W || !date) return null;
  const h = String(time || '12:00').slice(0, 2).padStart(2, '0'), i = W.time.indexOf(date + 'T' + h + ':00');
  return i < 0 ? null : { t: W.t[i], h: W.h[i], w: W.w[i] };
}
// prévision à un endroit précis (départ de la course)
function prWxLoadAt(lat, lng){
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lng + '&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m&forecast_days=8&timezone=auto';
  return fetch(url, { credentials: 'omit' }).then(function(r){ return r.json(); })
    .then(function(d){ return d && d.hourly && d.hourly.time ? { time: d.hourly.time, t: d.hourly.temperature_2m, h: d.hourly.relative_humidity_2m, w: d.hourly.wind_speed_10m } : null; }).catch(function(){ return null; });
}
function _prWxRerender(w){ if(w && typeof rendered !== 'undefined'){ rendered.plan = false; try { if(document.getElementById('sc-plan').style.display !== 'none') renderPlan(); else if(document.getElementById('sc-home').style.display !== 'none') renderHome(); } catch(e) {} } }
// ralentissement (%) : chaleur au-delà de 15 °C (+0,3 %/°C, +0,5 %/°C de plus au-delà de 25 °C), lourdeur, vent, grand froid
function prWxAdj(m){
  if(!m || m.t == null) return { pct: 0, why: '' };
  let pct = 0; const why = [];
  if(m.t > 15){ pct += (m.t - 15) * 0.3 + Math.max(0, m.t - 25) * 0.5; why.push(Math.round(m.t) + ' °C'); }
  if(m.t > 18 && m.h > 70){ pct += 1; why.push(Math.round(m.h) + ' % d\'humidité'); }
  if(m.w > 30){ pct += 3; why.push('vent ' + Math.round(m.w) + ' km/h'); } else if(m.w > 20){ pct += 1.5; why.push('vent ' + Math.round(m.w) + ' km/h'); }
  if(m.t < 0){ pct += 1; why.push(Math.round(m.t) + ' °C'); }
  return { pct: Math.round(pct * 10) / 10, why: why.join(', ') };
}
// météo enregistrée avec une séance validée (perf.meteo : temperature, humidite, vent_kmh)
function prWxAdjFromMeteo(me){ return me && me.temperature != null ? prWxAdj({ t: me.temperature, h: me.humidite, w: me.vent_kmh }) : { pct: 0, why: '' }; }
// ligne affichée sous une séance à venir (Plan, Accueil) : allure corrigée si la météo prévue la ralentit
function prWeatherLine(x){
  try {
    if(!x || x.type === 'rest' || !x.sched_date) return '';
    const today = prTodayIso(); if(x.sched_date < today || prDays(today, x.sched_date) > 7) return '';
    if(!_prWxBusy && Date.now() - _prWxTs > 3600000){ const had = !!_prWx; prWxLoad().then(function(w){ if(!had) _prWxRerender(w); }); }   // 1re prévision, puis toutes les heures
    if(!_prWx) return '';
    const m = prWxAt(x.sched_date, x.sched_time), adj = prWxAdj(m); if(adj.pct < 1) return '';
    const det = String(x.d || '').split('|').slice(1).join('|'), pm = det.match(PR_PACE_RE);
    let txt;
    if(pm && x.type !== 'ef' && x.type !== 'long'){
      const lo = prParsePace(pm[1], pm[2]), hi = pm[3] ? prParsePace(pm[3], pm[4]) : lo, f = 1 + adj.pct / 100;
      txt = 'vise ' + prPace(lo * f) + (pm[3] ? ' — ' + prPace(hi * f) : '') + ' /km (+' + Math.round(lo * (f - 1)) + ' s)';
    } else txt = 'ralentis de ~' + Math.round(adj.pct) + ' % à effort égal';
    return '<div class="pd-wx">🌡️ ' + prEsc(adj.why) + ' : ' + txt + '</div>';
  } catch(e) { return ''; }
}

// ─── 3. Effort ressenti (RPE) et douleur à la validation ────────────────────
const PD_PAIN_ZONES = ['Mollet', 'Tibia', 'Genou', 'Cheville / pied', 'Ischios', 'Quadriceps', 'Hanche', 'Dos', 'Autre'];
function prRpeHtml(prev){
  prev = prev || {}; _pdCss();
  const rpe = prev.rpe || null, pain = prev.pain || null;
  const lab = function(v){ return v <= 2 ? 'Très facile' : v <= 4 ? 'Facile' : v <= 6 ? 'Modéré' : v <= 8 ? 'Difficile' : 'Maximal'; };
  return '<div class="pd-rpe" id="pd-rpe" data-rpe="' + (rpe || '') + '" data-pain="' + (pain ? pain.level : 0) + '" data-zone="' + (pain ? prEsc(pain.zone) : '') + '">'
    + '<p class="pd-h">💪 Effort ressenti <span id="pd-rpe-l">' + (rpe ? rpe + '/10 · ' + lab(rpe) : 'facultatif') + '</span></p>'
    + '<div class="pd-scale">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function(v){ return '<button type="button" class="pd-n r' + Math.ceil(v / 2) + (rpe === v ? ' on' : '') + '" onclick="prRpePick(' + v + ')">' + v + '</button>'; }).join('') + '</div>'
    + '<p class="pd-h" style="margin-top:12px;">🩹 Une douleur ?</p>'
    + '<div class="pd-chips">' + ['Aucune', 'Légère', 'Gênante', 'Forte'].map(function(t, i){ return '<button type="button" class="pd-c' + ((pain ? pain.level : 0) === i ? ' on' : '') + '" onclick="prPainPick(' + i + ')">' + t + '</button>'; }).join('') + '</div>'
    + '<div class="pd-chips pd-zones" id="pd-zones"' + (pain && pain.level ? '' : ' hidden') + '>' + PD_PAIN_ZONES.map(function(z){ return '<button type="button" class="pd-c sm' + (pain && pain.zone === z ? ' on' : '') + '" onclick="prZonePick(this)">' + z + '</button>'; }).join('') + '</div></div>';
}
function prRpePick(v){
  const b = document.getElementById('pd-rpe'); if(!b) return;
  if(!window._jvApplying) b.dataset.mRpe = '1';                                 // choisi à la main : le journal ne l'écrase plus
  b.dataset.rpe = b.dataset.rpe === String(v) ? '' : v;
  b.querySelectorAll('.pd-n').forEach(function(x){ x.classList.toggle('on', x.textContent === b.dataset.rpe); });
  const l = document.getElementById('pd-rpe-l'), r = +b.dataset.rpe;
  if(l) l.textContent = r ? r + '/10 · ' + (r <= 2 ? 'Très facile' : r <= 4 ? 'Facile' : r <= 6 ? 'Modéré' : r <= 8 ? 'Difficile' : 'Maximal') : 'facultatif';
}
function prPainPick(i){
  const b = document.getElementById('pd-rpe'); if(!b) return;
  if(!window._jvApplying) b.dataset.mPain = '1';
  b.dataset.pain = i; b.querySelectorAll('.pd-chips:not(.pd-zones) .pd-c').forEach(function(x, k){ x.classList.toggle('on', k === i); });
  const z = document.getElementById('pd-zones'); if(z) z.hidden = !i;
}
function prZonePick(btn){
  const b = document.getElementById('pd-rpe'); if(!b) return;
  if(!window._jvApplying) b.dataset.mPain = '1';
  b.dataset.zone = btn.textContent; btn.parentNode.querySelectorAll('.pd-c').forEach(function(x){ x.classList.toggle('on', x === btn); });
}
function prRpeRead(){
  const b = document.getElementById('pd-rpe'); if(!b) return null;
  const out = {}, r = parseInt(b.dataset.rpe), p = parseInt(b.dataset.pain) || 0;
  if(r) out.rpe = r;
  if(p) out.pain = { level: p, zone: b.dataset.zone || 'Non précisée' };
  return out;
}
// durée d'une séance réalisée (min) : saisie, sinon km × allure
function prDurMin(s){
  const d = String(s.perf.dur || '').split(':').map(Number);
  if(d.length === 3 && d.every(function(x){ return !isNaN(x); })) return d[0] * 60 + d[1] + d[2] / 60;
  if(d.length === 2 && d.every(function(x){ return !isNaN(x); })) return d[0] + d[1] / 60;
  const p = prPaceSec(s.perf.pace); return p && s.km ? s.km * p / 60 : null;
}
// charge interne (effort × durée) sur 7 / 28 jours et douleurs récentes
function prInternal(today){
  const log = (typeof prDoneLog === 'function' ? prDoneLog(today) : []).filter(function(x){ return x.s.perf && x.s.perf.rpe; });
  const load = function(n){ return log.filter(function(x){ const d = prDays(x.date, today); return d >= 0 && d < n; }).reduce(function(a, x){ const m = prDurMin(x.s); return a + (m ? m * x.s.perf.rpe : 0); }, 0); };
  const k7 = load(7), k28 = load(28), chronic = k28 / 4;
  const pains = (typeof prAllDone === 'function' ? prAllDone(today) : prSessions(state)).filter(function(s){ return s.done && s.perf && s.perf.pain && s.perf.pain.level && s.date && prDays(s.date, today) >= 0 && prDays(s.date, today) <= 5; })
    .map(function(s){ return { date: s.date, level: s.perf.pain.level, zone: s.perf.pain.zone, title: s.title }; }).sort(function(a, b){ return b.date.localeCompare(a.date); });
  const rpes = log.filter(function(x){ return prDays(x.date, today) <= 14; }).map(function(x){ return { date: x.date, type: x.type, rpe: x.s.perf.rpe, title: x.s.title }; });
  return { n: log.length, k7: Math.round(k7), chronic: Math.round(chronic), ratio: chronic > 50 && log.filter(function(x){ return prDays(x.date, today) < 28; }).length >= 6 ? k7 / chronic : null, pains: pains, rpes: rpes };
}
// douleur gênante ou forte dans les 5 derniers jours → les 4 prochains jours sont allégés
function prPainProposals(st, a, I){
  const p = I && I.pains && I.pains.filter(function(x){ return x.level >= 2; })[0]; if(!p) return [];
  const today = a.opt.today, end = prAddDays(today, 3), eased = typeof prEasedSince === 'function' ? prEasedSince(st, p.date) : {};
  const why = 'Douleur ' + (p.level >= 3 ? 'forte' : 'gênante') + ' (' + p.zone.toLowerCase() + ') signalée le ' + prFmtDate(p.date);
  return prSessions(st).filter(function(s){ return !s.done && !s.skip && !eased[s.key] && s.date && s.date >= today && s.date <= end && s.type !== 'race' && s.type !== 'rest'; }).map(function(s){
    if(p.level >= 3) return { key: s.key, w: s.w, date: s.date, field: 'session', title: s.title, type: s.type, before: { t: s.title, d: s.detail, km: s.kmPlan, type: s.type },
      after: { t: 'Repos (douleur)', d: 'Repos, ou vélo / natation sans douleur · consulte si ça persiste', km: 0, type: 'rest' }, src: 'calcul', kind: 'pain', reason: why + ' : repos.', short: why + ' : repos, sans impact.' };
    if(s.type === 'tempo' || s.type === 'frac') return { key: s.key, w: s.w, date: s.date, field: 'session', title: s.title, type: s.type, before: { t: s.title, d: s.detail, km: s.kmPlan, type: s.type },
      after: { t: 'Footing EF', d: 'Très facile, sur terrain souple · arrête si la douleur revient', km: Math.max(3, Math.round(s.kmPlan * 0.6)), type: 'ef' }, src: 'calcul', kind: 'pain', reason: why + ' : pas d\'intensité.', short: why + ' : pas d\'intensité.' };
    const to = Math.min(s.kmPlan, Math.max(3, Math.round(s.kmPlan * 0.7)));
    return to === s.kmPlan ? null : { key: s.key, w: s.w, date: s.date, field: 'km', title: s.title, type: s.type, before: s.kmPlan, after: to, src: 'calcul', kind: 'pain', delta: to - s.kmPlan, reason: why + ' : −30 % de volume.', short: why + ' : −30 % de volume.' };
  }).filter(Boolean);
}

// ─── 7. Imprévus : indisponibilité, semaine chargée, maladie ────────────────
const PD_IMPREVUS = { indispo: ['🧳', 'Indisponible', 'Déplacement, pas de course possible'], charge: ['⏳', 'Semaine chargée', 'Moins de temps : on raccourcit'], malade: ['🤒', 'Malade / blessé', 'Pause, puis reprise en douceur'] };
let _pdImp = null;
function openImprevu(){
  _pdCss(); const today = prTodayIso();
  _pdImp = { type: 'indispo', from: today, to: prAddDays(today, 2), changes: [] };
  const mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'pd-imprevu'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  ov.innerHTML = '<div class="modal-box" style="max-height:94vh;"><div class="pd-head imp"><div><p class="pd-eb">Plan</p><p class="pd-title">Un imprévu ?</p><p class="pd-sub">Le plan s\'adapte : séances clés déplacées, le reste allégé ou retiré</p></div><button class="pd-x" onclick="document.getElementById(\'pd-imprevu\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body" style="background:#F3F6FC;"><div style="padding:14px 16px 18px;display:flex;flex-direction:column;gap:12px;">'
    + '<div class="pd-types">' + Object.keys(PD_IMPREVUS).map(function(k){ const t = PD_IMPREVUS[k]; return '<button type="button" class="pd-type' + (k === 'indispo' ? ' on' : '') + '" data-t="' + k + '" onclick="_pdImpSet(\'type\',\'' + k + '\')"><span>' + t[0] + '</span><b>' + t[1] + '</b><small>' + t[2] + '</small></button>'; }).join('') + '</div>'
    + '<div class="pd-card pd-dates"><label>Du<input type="date" id="pd-from" value="' + _pdImp.from + '" min="' + today + '" onchange="_pdImpSet(\'from\',this.value)"></label><label>Au<input type="date" id="pd-to" value="' + _pdImp.to + '" min="' + today + '" onchange="_pdImpSet(\'to\',this.value)"></label></div>'
    + '<p class="pd-sec">Ce qui change</p><div id="pd-imp-list" class="pd-card"></div></div></div>'
    + '<div class="pd-foot"><button type="button" id="pd-imp-apply" class="pd-btn" onclick="applyImprevu()">Appliquer</button></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  mc.appendChild(ov);
  _pdImpRender();
}
function _pdImpSet(k, v){
  if(!_pdImp) return; _pdImp[k] = v;
  if(k === 'from' && _pdImp.to < v){ _pdImp.to = v; const t = document.getElementById('pd-to'); if(t) t.value = v; }
  if(k === 'type') document.querySelectorAll('.pd-type').forEach(function(b){ b.classList.toggle('on', b.dataset.t === v); });
  _pdImpRender();
}
// changements proposés pour l'imprévu (séances de la prépa affichée, à venir et non faites)
function prImprevuChanges(type, from, to){
  const today = prTodayIso(), all = prSessions(state).filter(function(s){ return !s.skip && s.date && s.type !== 'rest'; });
  const sess = all.filter(function(s){ return !s.done && s.date >= today; });
  const inR = function(d){ return d >= from && d <= to; }, hard = function(s){ return s.type === 'tempo' || s.type === 'frac' || s.type === 'long' || s.type === 'race'; };
  const out = [], W = prWeeks(state, today), taken = {};
  all.forEach(function(s){ taken[s.date] = (taken[s.date] || []).concat([s]); });       // séances faites comprises
  const reason = { indispo: 'Indisponible', charge: 'Semaine chargée', malade: 'Malade' }[type];
  sess.filter(function(s){ return inR(s.date) && s.type !== 'race'; }).forEach(function(s){
    if(type === 'charge'){
      if(s.type === 'ef' || s.type === 'long'){ const to2 = Math.min(s.kmPlan, Math.max(3, Math.round(s.kmPlan * (s.type === 'long' ? 0.8 : 0.7)))); if(to2 !== s.kmPlan) out.push({ key: s.key, s: s, field: 'km', before: s.kmPlan, after: to2, why: s.type === 'long' ? 'sortie longue raccourcie (−20 %)' : 'footing raccourci (−30 %)' }); }
      return;
    }
    if(type === 'indispo' && hard(s)){
      // séance clé : déplacée sur un jour libre de la même semaine, hors période, sans séance dure la veille ni le lendemain
      const o = W[s.w], cands = [];
      for(let d = o && o.from ? o.from : s.date; o && d <= o.to; d = prAddDays(d, 1)){
        if(d < today || inR(d) || (taken[d] || []).length) continue;
        const near = [prAddDays(d, -1), prAddDays(d, 1)].some(function(x){ return (taken[x] || []).some(function(y){ return y !== s && hard(y); }); });
        if(!near) cands.push(d);
      }
      cands.sort(function(a, b){ return Math.abs(prDays(a, s.date)) - Math.abs(prDays(b, s.date)); });
      if(cands.length){ taken[cands[0]] = [s]; taken[s.date] = (taken[s.date] || []).filter(function(y){ return y !== s; }); out.push({ key: s.key, s: s, field: 'date', before: s.date, after: cands[0], why: 'séance clé déplacée au ' + prFmtDate(cands[0], { weekday: 'long', day: 'numeric' }) }); return; }
    }
    out.push({ key: s.key, s: s, field: 'skip', before: '', after: reason, why: hard(s) ? 'pas de jour libre cette semaine : séance retirée' : 'retirée (pas de rattrapage)' });
  });
  if(type === 'malade'){
    // reprise : 3 jours après, sans intensité et volume réduit
    const end = prAddDays(to, 3);
    sess.filter(function(s){ return s.date > to && s.date <= end && s.type !== 'race' && s.type !== 'rest'; }).forEach(function(s){
      if(s.type === 'tempo' || s.type === 'frac') out.push({ key: s.key, s: s, field: 'session', before: { t: s.title, d: s.detail, km: s.kmPlan, type: s.type }, after: { t: 'Footing EF', d: 'Reprise très facile · aucune intensité', km: Math.max(3, Math.round(s.kmPlan * 0.6)), type: 'ef' }, why: 'reprise : pas d\'intensité' });
      else { const to2 = Math.min(s.kmPlan, Math.max(3, Math.round(s.kmPlan * 0.7))); if(to2 !== s.kmPlan) out.push({ key: s.key, s: s, field: 'km', before: s.kmPlan, after: to2, why: 'reprise : −30 % de volume' }); }
    });
  }
  return out.sort(function(a, b){ return (a.s.date || '').localeCompare(b.s.date || ''); });
}
function _pdImpRender(){
  const box = document.getElementById('pd-imp-list'); if(!box || !_pdImp) return;
  const ch = _pdImp.changes = prImprevuChanges(_pdImp.type, _pdImp.from, _pdImp.to);
  const ico = { date: '📅', skip: '✕', km: '↘', session: '🔁' };
  box.innerHTML = ch.length ? ch.map(function(c){
    const t = typeof normalizeSessionTitle === 'function' ? normalizeSessionTitle(c.s.title, c.s.type, c.s.detail) || c.s.title : c.s.title;
    const v = c.field === 'km' ? c.before + ' → <b>' + c.after + ' km</b>' : c.field === 'date' ? prFmtDate(c.before, { weekday: 'short', day: 'numeric' }) + ' → <b>' + prFmtDate(c.after, { weekday: 'short', day: 'numeric' }) + '</b>' : c.field === 'session' ? '<b>' + prEsc(c.after.t) + ' · ' + c.after.km + ' km</b>' : '<b>non réalisée</b>';
    return '<div class="pd-row"><span class="pd-ico ' + c.field + '">' + ico[c.field] + '</span><div><b>' + prEsc(t) + '</b> <small>' + prFmtDate(c.s.date, { weekday: 'short', day: 'numeric', month: 'short' }) + '</small><p>' + v + ' · ' + prEsc(c.why) + '</p></div></div>';
  }).join('') : '<p class="pd-note">Aucune séance concernée sur ces dates.</p>';
  const b = document.getElementById('pd-imp-apply'); if(b){ b.disabled = !ch.length; b.textContent = ch.length ? 'Appliquer ' + ch.length + ' changement' + (ch.length > 1 ? 's' : '') : 'Rien à changer'; }
}
function applyImprevu(){
  if(!_pdImp || !_pdImp.changes.length) return;
  const done = [];
  _pdImp.changes.forEach(function(c){
    let x; try { x = JSON.parse(state[c.key]); } catch(e) { return; }
    if(c.field === 'skip'){ state[c.key + '_skip'] = true; state[c.key + '_skip_reason'] = c.after; }
    else if(c.field === 'date'){ x.sched_date = c.after; x.sched_day = prWeekday(c.after); }
    else if(c.field === 'km'){ const parts = String(x.d || '').split('|'), det = parts.slice(1).join('|'), nd = prKmDetail(det, x.type, x.km, c.after); x.km = c.after; if(nd !== det){ x.d = parts[0] + '|' + nd; c.detBefore = det; c.detAfter = nd; } }
    else if(c.field === 'session'){ x.d = c.after.t + '|' + c.after.d; x.km = c.after.km; x.type = c.after.type; }
    if(c.field !== 'skip'){ x._modified = true; x._seq = (x._seq || 0) + 1; state[c.key] = JSON.stringify(x); }
    done.push({ ref: c.key, title: c.s.title, type: c.s.type, date: c.s.date, field: c.field, before: c.before, after: c.after, src: 'imprevu', reason: c.why, detBefore: c.detBefore, detAfter: c.detAfter });
  });
  const hist = (state._plan_reviews || []).slice(-5);
  hist.push({ date: prTodayIso(), n: done.length, imprevu: _pdImp.type, from: _pdImp.from, to: _pdImp.to, changes: done });
  state._plan_reviews = hist; save();
  if(typeof rendered !== 'undefined'){ rendered.plan = false; rendered.home = false; }
  const ov = document.getElementById('pd-imprevu'); if(ov) ov.remove();
  try { renderPlan(); renderHome(); } catch(e) {}
  if(typeof showToast === 'function') showToast('Plan adapté : ' + done.length + ' séance' + (done.length > 1 ? 's' : '') + ' (annulable dans « Mettre à jour le plan »)', '🧳');
}

// ─── 8. Plan de course ──────────────────────────────────────────────────────
const PD_CAT = function(R){ return R && PR_RACE_M[R.course] ? R.course : R && R.km ? (Math.abs(R.km - 21.1) < 0.6 ? 'Semi-marathon' : Math.abs(R.km - 42.2) < 0.6 ? 'Marathon' : Math.abs(R.km - 10) < 0.6 ? '10 km' : Math.abs(R.km - 5) < 0.6 ? '5 km' : null) : null; };
// allure km par km : départ prudent (+1,2 %, ou startW si ta recette demande un départ plus prudent : km 1 et 2), 1re moitié +0,3 %,
// 2e moitié −0,3 %, dernier km −1 % ; total = temps visé
function prRaceSplits(totalSec, distKm, startW){
  const n = Math.ceil(distKm - 1e-6), lens = [];
  for(let i = 0; i < n; i++) lens.push(Math.min(1, Math.round((distKm - i) * 1000) / 1000));
  const half = distKm / 2;
  const lastFull = lens[n - 1] < 1 ? n - 2 : n - 1;                          // semi / marathon : relance sur le dernier km entier + les derniers mètres
  const sw = startW && startW > 1.012 ? startW : 1.012;
  const w = lens.map(function(L, i){ const mid = i + L / 2; return i >= lastFull && distKm > 3 ? 0.99 : mid < 1 ? sw : mid < 2 && sw > 1.012 ? 1 + (sw - 1) / 2 : mid < half ? 1.003 : 0.997; });
  const base = totalSec / lens.reduce(function(a, L, i){ return a + L * w[i]; }, 0);
  let cum = 0;
  return lens.map(function(L, i){ const p = base * w[i]; cum += p * L; return { km: Math.round((i + L) * 100) / 100, len: L, pace: p, cum: cum }; });
}
function prRaceInfo(){
  const R = typeof prepRace === 'function' ? prepRace() : {}, cat = PD_CAT(R), dist = R.km || (cat ? PR_RACE_M[cat] / 1000 : null);
  if(!dist || !R.date) return null;
  const a = (_prReview && _prReview.a) || prAnalyze(), f = a.fit || {}, goal = a.opt && a.opt.goalSec;
  const tj = a.trajectory && a.trajectory.race, real = tj ? tj.mid : f.vdot && cat ? f.preds[cat] : null;
  const raceS = prSessions(state).filter(function(s){ return s.type === 'race'; }).pop(), time = raceS && raceS.x && raceS.x.sched_time || '09:00';
  return { R: R, cat: cat, dist: dist, goal: goal, real: real, vdot: f.vdot, time: time, days: prDays(prTodayIso(), R.date) };
}
let _pdRace = null;
function openRacePlan(){
  _pdCss();
  const I = prRaceInfo(); if(!I){ alert('Ajoute la date et la distance de ta course objectif pour préparer ton plan de course.'); return; }
  const saved = state._race_plan && state._race_plan.date === I.R.date ? state._race_plan : null;
  const mode = saved ? saved.mode : I.goal && I.real && I.goal >= I.real * 0.985 ? 'goal' : I.real ? 'real' : 'goal';
  _pdRace = { I: I, mode: mode, custom: saved && saved.mode === 'custom' ? saved.target : null };
  const mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'pd-race'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  ov.innerHTML = '<div class="modal-box" style="max-height:94vh;"><div class="pd-head race"><div><p class="pd-eb">Jour de course</p><p class="pd-title">🏁 Plan de course</p><p class="pd-sub">' + prEsc(I.R.name) + ' · ' + prFmtDate(I.R.date, { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' + prEsc(I.time) + (I.days >= 0 ? ' · J-' + I.days : '') + '</p></div><button class="pd-x" onclick="document.getElementById(\'pd-race\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body" style="background:#F3F6FC;"><div id="pd-race-c" style="padding:14px 16px 18px;display:flex;flex-direction:column;gap:12px;"></div></div>'
    + '<div class="pd-foot"><button type="button" class="pd-btn" onclick="saveRacePlan()">Enregistrer mon plan de course</button></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  mc.appendChild(ov);
  _pdRaceRender();
  if(I.days >= 0 && I.days <= 7){
    const P = _pdRace;
    (typeof firebase !== 'undefined' ? firebase.database().ref('live/race').once('value').then(function(s){ return s.val(); }).catch(function(){ return null; }) : Promise.resolve(null)).then(function(r){
      const p0 = r && r.date === I.R.date && Array.isArray(r.route) && r.route[0];
      if(p0) return prWxLoadAt(p0[0], p0[1]).then(function(w){ if(w){ P.wx = w; P.wxWhere = r.place || 'au départ'; } });
      return prWxLoad().then(function(w){ if(w){ P.wx = w; P.wxWhere = 'chez toi (lieu de la course non renseigné)'; } });
    }).then(function(){ if(_pdRace === P && document.getElementById('pd-race')) _pdRaceRender(); });
  }
}
function _pdRaceTarget(){
  const P = _pdRace, I = P.I;
  return P.mode === 'custom' && P.custom ? P.custom : P.mode === 'real' && I.real ? I.real : I.goal || I.real;
}
function _pdRaceRender(){
  const box = document.getElementById('pd-race-c'); if(!box || !_pdRace) return;
  const P = _pdRace, I = P.I, cat = I.cat, long = cat === 'Marathon' || cat === 'Semi-marathon';
  const wx = I.days >= 0 && I.days <= 7 && P.wx ? prWxAt(I.R.date, I.time, P.wx) : null, adj = prWxAdj(wx);
  let target = _pdRaceTarget(); if(!target){ box.innerHTML = '<p class="pd-note">Ajoute un objectif ou des records pour calculer ton plan de course.</p>'; return; }
  const tgtWx = adj.pct >= 1 ? target * (1 + adj.pct / 100) : target;
  const pac = (state._recette || {}).pacing, sp = prRaceSplits(tgtWx, I.dist, pac && pac.start); P.splits = sp; P.target = tgtWx;
  const mk = function(m, l, t){ return '<button type="button" class="pd-seg' + (P.mode === m ? ' on' : '') + '" onclick="_pdRace.mode=\'' + m + '\';_pdRaceRender()"><b>' + l + '</b><small>' + t + '</small></button>'; };
  let h = '<div class="pd-segs">' + (I.goal ? mk('goal', 'Objectif', prTime(I.goal)) : '') + (I.real ? mk('real', 'Réaliste', prTime(I.real)) : '')
    + '<button type="button" class="pd-seg' + (P.mode === 'custom' ? ' on' : '') + '" onclick="_pdRace.mode=\'custom\';_pdRaceRender();setTimeout(function(){const e=document.getElementById(\'pd-custom\');if(e)e.focus();},50)"><b>Mon temps</b><small>' + (P.custom ? prTime(P.custom) : 'à saisir') + '</small></button></div>';
  if(P.mode === 'custom') h += '<div class="pd-card"><label class="pd-lab">Temps visé<input id="pd-custom" inputmode="numeric" placeholder="' + (long ? 'h:mm:ss' : 'mm:ss') + '" value="' + (P.custom ? prTime(P.custom) : '') + '" oninput="if(typeof prFmtTimeInput===\'function\')prFmtTimeInput(this)" onchange="_pdCustom(this.value)"></label></div>';
  h += '<div class="pd-card pd-hero"><div><small>Temps visé</small><b>' + prTime(tgtWx) + '</b></div><div><small>Allure moyenne</small><b>' + prPace(tgtWx / I.dist) + '<i>/km</i></b></div>'
    + (I.real && P.mode !== 'real' ? '<p class="pd-note">' + (target < I.real * 0.985 ? '⚠️ Plus rapide que ton niveau actuel (' + prTime(I.real) + ') : départ très prudent, accélère seulement après la mi-course si tout va bien.' : '✓ Cohérent avec ton niveau actuel (' + prTime(I.real) + ').') + '</p>' : '')
    + (adj.pct >= 1 ? '<p class="pd-note pd-warm">🌡️ Prévision ' + prEsc(P.wxWhere || '') + ' : ' + prEsc(adj.why) + ' : allures +' + prV(adj.pct) + ' % (' + prTime(target) + ' → ' + prTime(tgtWx) + ').</p>' : wx ? '<p class="pd-note">🌤️ Prévision ' + prEsc(P.wxWhere || '') + ' : ' + Math.round(wx.t) + ' °C, vent ' + Math.round(wx.w) + ' km/h, conditions favorables.</p>' : '') + '</div>';
  // passages
  const marks = sp.filter(function(x, i){ return i === sp.length - 1 || (I.dist <= 10 ? true : I.dist <= 22 ? (i + 1) % 2 === 1 || i === 0 : (i + 1) % 5 === 0); });
  h += '<p class="pd-sec">Allure km par km</p><div class="pd-card pd-splits"><table><thead><tr><th>Km</th><th>Allure</th><th>Passage</th></tr></thead><tbody>'
    + marks.map(function(x, i){ return '<tr' + (x.km === sp[sp.length - 1].km ? ' class="fin"' : '') + '><td>' + (x.km === sp[sp.length - 1].km ? '🏁 ' + String(x.km).replace('.', ',') : x.km) + '</td><td>' + prPace(x.pace) + '</td><td>' + prTime(x.cum) + '</td></tr>'; }).join('') + '</tbody></table>'
    + '<p class="pd-note">Départ un peu plus lent (+' + Math.round(sp[0].pace - tgtWx / I.dist) + ' s au 1er km), régularité jusqu\'à la mi-course, puis on relance légèrement : finir plus vite qu\'on est parti.</p>'
    + (pac && pac.start ? '<p class="pd-note pd-warm">🐢 D\'après ta dernière course : ' + prEsc(pac.why) + ' — départ encore plus prudent sur les 2 premiers km.</p>' : '') + '</div>';
  // échauffement, ravitaillement, consignes
  const warm = cat === 'Marathon' ? '8-10 min de footing très léger + 2 lignes droites, 20 min avant le départ. Garde de l\'énergie : les premiers km servent d\'échauffement.'
    : cat === 'Semi-marathon' ? '12-15 min de footing + 3 accélérations progressives de 80 m + 1 min à allure course, à finir 10 min avant le départ.'
    : '15-20 min de footing + 4-5 accélérations de 80-100 m + 2 min à allure course, à finir 5-10 min avant le départ.';
  const fuel = cat === 'Marathon' ? 'Gel toutes les ~35-40 min : vers les km 8, 15, 22, 29 et 35, avec de l\'eau. Boire à chaque ravito, par petites gorgées.'
    : cat === 'Semi-marathon' ? '1 gel vers le km 10-12 (≈ 45-50 min), avec de l\'eau. Quelques gorgées aux ravitos, surtout s\'il fait chaud.'
    : 'Pas de gel nécessaire. Bien boire avant (500 ml dans les 2 h) ; un verre d\'eau au ravito s\'il fait chaud.';
  const pre = 'Dernier vrai repas 3 h avant (glucides, peu de fibres). Café possible 45-60 min avant si tu en as l\'habitude. Rien de nouveau le jour J.';
  const cues = cat === 'Marathon' ? ['Km 1-10 : facile, ne gagne pas de temps', 'Km 10-30 : régularité, mange et bois', 'Km 30-42 : la course commence, relance'] : cat === 'Semi-marathon' ? ['Km 1-5 : contrôle, laisse partir les autres', 'Km 5-15 : régularité, en rythme', 'Km 15-21 : relance progressive jusqu\'à l\'arrivée'] : ['Km 1-2 : contrôle, ne pars pas trop vite', 'Km 3-7 : régularité, souffle maîtrisé', 'Km 8-10 : tout donner, finir fort'];
  h += '<p class="pd-sec">Le jour J</p><div class="pd-card pd-list"><p><span>🔥</span><b>Échauffement</b>' + warm + '</p><p><span>🍌</span><b>Avant</b>' + pre + '</p><p><span>💧</span><b>Ravitaillement</b>' + fuel + '</p><p><span>🧠</span><b>En course</b>' + cues.join(' · ') + '</p></div>';
  // gels à tester en sortie longue (ancienne « Stratégie gels » de Statistiques) : semi et marathon
  if(long && typeof gels !== 'undefined' && gels.length){
    const gl = gels.filter(function(g){ return typeof g.km === 'number' && (cat === 'Marathon' || g.km <= 20); });
    if(gl.length) h += '<p class="pd-sec">Gels en sortie longue <span>pour habituer ton ventre avant le jour J</span></p><div class="pd-card pd-splits"><table><thead><tr><th>Sortie</th><th>Gels</th><th>Quand</th></tr></thead><tbody>'
      + gl.map(function(g){ return '<tr><td>' + g.km + ' km</td><td>' + g.nb + '</td><td>' + prEsc(g.t) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  // carte mémo
  const memo = sp.filter(function(x, i){ return i === sp.length - 1 || [1, 3, 5, 7, 10, 15, 21, 25, 30, 35, 40].indexOf(Math.round(x.km)) >= 0 && x.km === Math.round(x.km); });
  h += '<p class="pd-sec">Carte mémo <span>capture d\'écran à garder sur toi</span></p><div class="pd-memo"><p class="pd-memo-h">' + prEsc(I.R.name) + ' · ' + prTime(tgtWx) + '</p><div class="pd-memo-g">'
    + memo.map(function(x){ return '<div><small>' + (x.km === sp[sp.length - 1].km ? 'Arrivée' : 'km ' + x.km) + '</small><b>' + prTime(x.cum) + '</b></div>'; }).join('') + '</div><p class="pd-memo-f">Allure ' + prPace(tgtWx / I.dist) + '/km · départ ' + prPace(sp[0].pace) + ' · ' + (long ? 'gel ' + (cat === 'Marathon' ? 'km 8-15-22-29-35' : 'km 10-12') : 'finir fort') + '</p></div>';
  if(typeof isAdmin === 'function' && isAdmin()) h += '<button type="button" class="pd-btn sec" onclick="saveRacePlan(true)">📡 Utiliser ce plan pour le suivi en direct</button>';
  box.innerHTML = h;
}
function _pdCustom(v){
  const s = prTimeSec(v), d = _pdRace && _pdRace.I.dist; if(!s || !d) return;
  const pace = s / d;
  if(pace < 150 || pace > 600){ alert('Temps peu probable sur ' + String(d).replace('.', ',') + ' km (' + prPace(pace) + '/km) : saisis un temps entre ' + prTime(d * 150) + ' et ' + prTime(d * 600) + '.'); return; }
  _pdRace.custom = s; _pdRaceRender();
}
function saveRacePlan(live){
  if(!_pdRace || !_pdRace.splits) return;
  if(_pdRace.mode === 'custom' && !_pdRace.custom){ alert('Saisis d\'abord ton temps visé, ou choisis « Objectif » / « Réaliste ».'); return; }
  const P = _pdRace, I = P.I;
  state._race_plan = { date: I.R.date, mode: P.mode, target: P.mode === 'custom' ? P.custom : Math.round(_pdRaceTarget()), withWx: Math.round(P.target), cum: P.splits.map(function(x){ return Math.round(x.cum); }), savedAt: prTodayIso() };
  save();
  if(live && typeof firebase !== 'undefined'){
    firebase.database().ref('live/race').once('value').then(function(s){
      const r = s.val();
      if(!r || r.date !== I.R.date){ alert('Prépare d\'abord le suivi de cette course (Accueil › Course en direct), puis réessaie.'); return; }
      return firebase.database().ref('live/race').update({ plan: state._race_plan.cum, target: Math.round(P.target) }).then(function(){ if(typeof showToast === 'function') showToast('Plan de course envoyé au suivi en direct', '📡'); });
    }).catch(function(e){ alert('Suivi en direct non mis à jour (' + e.message + ').'); });
  } else if(typeof showToast === 'function') showToast('Plan de course enregistré', '🏁');
}

// ─── 9. Forme du jour, série, badges ────────────────────────────────────────
// score 0-100 : récupération WHOOP, FC repos vs 14 j, charge (ratio 7 j / 28 j), effort ressenti récent, douleur
function prFormScore(){
  // base : le score du jour des Statistiques (récupération WHOOP, sommeil, FC repos, VFC), pour une seule et même valeur ;
  // l'entraînement ne fait qu'ajuster, de façon affichée : charge élevée, footings ressentis durs, douleur
  const today = prTodayIso(), why = [];
  const W = typeof wellnessScoreToday === 'function' ? wellnessScoreToday() : null;
  let score;
  if(W){ score = W.score; why.push.apply(why, W.parts); }
  else {
    const parts = [];
    const fcT = parseFloat(state['fc_repos_' + today]), fcs = [];
    for(let i = 1; i <= 14; i++){ const v = parseFloat(state['fc_repos_' + prAddDays(today, -i)]); if(v) fcs.push(v); }
    if(fcT && fcs.length >= 5){ const d = fcT - prMean(fcs); parts.push(Math.max(0, Math.min(100, 80 - d * 10))); why.push('FC repos ' + Math.round(fcT)); }
    if(!parts.length) return null;
    score = prMean(parts);
  }
  const L = typeof prLoad === 'function' ? prLoad(today) : null;
  if(L && L.acwr != null && L.acwr > 1.5){ score -= 10; why.push('charge 7 j élevée (' + prV(L.acwr) + '×) −10'); }
  const I = prInternal(today), hardEasy = I.rpes.slice(-3).filter(function(x){ return (x.type === 'ef' || x.type === 'long') && x.rpe >= 7; }).length;
  if(hardEasy){ score -= 5 * hardEasy; why.push('footings ressentis durs −' + 5 * hardEasy); }
  const pain = I.pains[0];
  if(pain && pain.level >= 2){ const cap = pain.level >= 3 ? 25 : 45; if(score > cap){ score = cap; why.push('douleur ' + String(pain.zone || 'non précisée').toLowerCase() + ' : plafonné à ' + cap); } }
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score: score, why: why, label: score >= 67 ? 'Bonne forme : feu vert' : score >= 34 ? 'Forme moyenne : écoute tes sensations' : 'Récupération insuffisante : privilégie la récup', tone: score >= 67 ? 'ok' : score >= 34 ? 'mid' : 'low' };
}
// séances d'affilée réalisées (une séance passée ni faite ni retirée casse la série ; une séance retirée pour imprévu non)
function prStreak(){
  // séances faites de tout l'historique (la série continue d'une prépa à l'autre) + séances prévues de la prépa en cours
  const today = prTodayIso(), hist = typeof prAllDone === 'function' ? prAllDone(today).filter(function(s){ return !s.ext; }) : [];   // séances de l'app (pas l'import Strava)
  const list = hist.concat(prSessions(state).filter(function(s){ return !s.done; })).filter(function(s){ return s.type !== 'rest' && s.date && s.date <= today; }).sort(function(a, b){ return b.date.localeCompare(a.date); });
  let n = 0;
  for(const s of list){
    if(s.done){ n++; continue; }
    if(s.date === today) continue;
    if(state[s.key + '_skip'] && /Indisponible|Semaine chargée|Malade|Blessé/.test(state[s.key + '_skip_reason'] || '')) continue;
    break;
  }
  return n;
}
const PD_BADGES = [
  { id: 'streak5', ico: '🔥', t: '5 séances d\'affilée', test: function(c){ return c.streak >= 5; } },
  { id: 'streak15', ico: '🔥', t: '15 séances d\'affilée', test: function(c){ return c.streak >= 15; } },
  { id: 'week', ico: '✅', t: 'Semaine complète', test: function(c){ return c.fullWeeks >= 1; } },
  { id: 'week4', ico: '🗓️', t: '4 semaines complètes', test: function(c){ return c.fullWeeks >= 4; } },
  { id: 'km100', ico: '🛣️', t: '100 km dans la prépa', test: function(c){ return c.km >= 100; } },
  { id: 'km250', ico: '🛣️', t: '250 km dans la prépa', test: function(c){ return c.km >= 250; } },
  { id: 'km500', ico: '🌍', t: '500 km dans la prépa', test: function(c){ return c.km >= 500; } },
  { id: 'paces5', ico: '🎯', t: '5 allures proposées tenues', test: function(c){ return c.paces >= 5; } },
  { id: 'test', ico: '🧪', t: 'Test 5 km réalisé', test: function(c){ return c.tests >= 1; } },
  { id: 'long20', ico: '🏔️', t: 'Sortie longue de 20 km', test: function(c){ return c.longest >= 20; } },
  { id: 'pr', ico: '🏅', t: 'Nouveau record', test: function(c){ return c.prs >= 1; } },
  { id: 'race', ico: '🏁', t: 'Course de la prépa terminée', test: function(c){ return c.race; } }
];
function prBadges(){
  const sess = prSessions(state), done = sess.filter(function(s){ return s.done; }), W = {};
  sess.forEach(function(s){ if(s.type === 'rest') return; (W[s.w] = W[s.w] || []).push(s); });
  const today = prTodayIso(), prepStart = state.plan_start_date ? String(state.plan_start_date).slice(0, 10) : '0000';
  const c = { streak: prStreak(), fullWeeks: Object.keys(W).filter(function(w){ return W[w].length && W[w].every(function(s){ return s.done; }); }).length,
    km: done.reduce(function(a, s){ return a + s.km; }, 0), paces: typeof prCalib === 'function' ? prCalib(state).k : 0,
    tests: done.filter(function(s){ return /^Test\b/i.test(s.title); }).length, longest: Math.max.apply(null, done.filter(function(s){ return s.type === 'long'; }).map(function(s){ return s.km; }).concat([0])),
    prs: Object.keys(state._records || {}).filter(function(k){ const d = (state._records[k] || {}).date; return d && d >= prepStart && d <= today; }).length, race: done.some(function(s){ return s.type === 'race'; }) };
  const got = state._badges || {};
  return { c: c, list: PD_BADGES.map(function(b){ return Object.assign({ on: b.test(c) || !!got[b.id] }, b); }) };
}
// carte de l'accueil : forme du jour, série, badges ; nouveau badge → toast
function prRenderHomeCard(){
  const el = document.getElementById('home-form-card'); if(!el) return;
  try {
    if((typeof usesHardPlan === 'function' && usesHardPlan()) || (typeof _prepView !== 'undefined' && _prepView && !_prepView.next)){ el.innerHTML = ''; return; }
    _pdCss();
    const F = prFormScore(), B = prBadges(), on = B.list.filter(function(b){ return b.on; });
    const got = Object.assign({}, state._badges || {}), fresh = on.filter(function(b){ return !got[b.id]; });
    if(fresh.length){
      const silent = !state._badges_init;                                       // 1er affichage d'une prépa : badges déjà acquis, sans notification
      fresh.forEach(function(b){ got[b.id] = prTodayIso(); }); state._badges = got; state._badges_init = true;
      if(dbRef) dbRef.update({ _badges: got, _badges_init: true }).catch(function(){});
      if(!silent && typeof showToast === 'function') setTimeout(function(){ showToast('Nouveau badge : ' + fresh[fresh.length - 1].t, fresh[fresh.length - 1].ico); }, 800);
    } else if(!state._badges_init){ state._badges_init = true; if(dbRef) dbRef.child('_badges_init').set(true).catch(function(){}); }
    const R = typeof prepRace === 'function' ? prepRace() : null, dRace = R && R.date ? prDays(prTodayIso(), R.date) : null;
    let h = '<div class="pd-home">';
    // Forme du jour : uniquement la nuit du jour. WHOOP connecté sans elle → chargement, attente du réveil, échec ou « pas encore
    // disponible », jamais la valeur de la veille (stats.js wellnessState)
    const WS = typeof wellnessState === 'function' ? wellnessState() : { kind: 'ok' };
    const retry = '<button type="button" class="pd-wake" onclick="whoopRetry()">↻ Réessayer</button>';
    if(WS.kind === 'failed' || WS.kind === 'pending'){
      h += '<div class="pd-form fail ' + WS.kind + '" role="status"><svg viewBox="0 0 64 64" class="pd-gauge"><circle cx="32" cy="32" r="26" class="g-bg"/><text x="32" y="39" text-anchor="middle">' + (WS.kind === 'failed' ? '⚠️' : '⏳') + '</text></svg>'
        + '<div style="flex:1;min-width:0;"><p class="pd-form-l">Forme du jour</p><b>' + (WS.kind === 'failed' ? (WS.auth ? 'WHOOP déconnecté' : 'Échec de la récupération WHOOP') : 'Nuit pas encore disponible') + '</b>'
        + '<small>' + (WS.kind === 'failed' ? (WS.auth ? 'Reconnecte WHOOP (Compte) : les données de cette nuit n\'ont pas pu être chargées.' : 'Les données de cette nuit n\'ont pas pu être chargées. Rien n\'est affiché plutôt que les chiffres d\'hier.') : 'WHOOP n\'a pas encore calculé ta récupération de cette nuit. Réessaie dans quelques minutes.') + '</small></div>'
        + (WS.auth && typeof connectWhoop === 'function' ? '<button type="button" class="pd-wake" onclick="connectWhoop()">Reconnecter</button>' : retry) + '</div>';
    }
    // ouverture de l'app / synchro en cours sans la nuit du jour → chargement
    else if(WS.kind === 'loading' || (typeof whoopStartupLoading === 'function' && whoopStartupLoading())){
      h += '<div class="pd-form load" aria-busy="true"><svg viewBox="0 0 64 64" class="pd-gauge"><circle cx="32" cy="32" r="26" class="g-bg"/><circle cx="32" cy="32" r="26" class="g-spin"/></svg>'
        + '<div style="flex:1;min-width:0;"><p class="pd-form-l">Forme du jour</p><b>Mise à jour…</b><small>Récupération de ta nuit WHOOP</small></div></div>';
    }
    // après 4h : la récupération WHOOP de la nuit n'est pas encore là → en attente du réveil (comme le bouton Réveil)
    else if(WS.kind === 'waiting'){
      const C = 2 * Math.PI * 26;
      h += '<div class="pd-form wait"><svg viewBox="0 0 64 64" class="pd-gauge"><circle cx="32" cy="32" r="26" class="g-bg"/><text x="32" y="38" text-anchor="middle">💤</text></svg>'
        + '<div style="flex:1;min-width:0;"><p class="pd-form-l">Forme du jour</p><b>En attente du réveil</b><small>Ta récupération WHOOP de cette nuit arrive au réveil.</small></div>'
        + (typeof onWakeup === 'function' && typeof isAdmin === 'function' && isAdmin() ? '<button type="button" class="pd-wake" onclick="onWakeup()">☀️ Je suis réveillé</button>' : '') + '</div>';
    } else if(F){ const C = 2 * Math.PI * 26;
      h += '<div class="pd-form ' + F.tone + '"><svg viewBox="0 0 64 64" class="pd-gauge"><circle cx="32" cy="32" r="26" class="g-bg"/><circle cx="32" cy="32" r="26" class="g-fg" stroke-dasharray="' + (C * F.score / 100).toFixed(1) + ' ' + C.toFixed(1) + '"/><text x="32" y="37" text-anchor="middle">' + F.score + '</text></svg>'
        + '<div><p class="pd-form-l">Forme du jour</p><b>' + F.label + '</b><small>' + prEsc(F.why.join(' · ')) + '</small></div></div>'; }
    if(typeof alcHomeLine === 'function') h += alcHomeLine(WS.kind === 'ok' ? F : null);   // alcool hier soir : effet sur ta nuit, ou question du matin
    h += '<div class="pd-strip"><span class="pd-streak">🔥 <b>' + B.c.streak + '</b> séance' + (B.c.streak > 1 ? 's' : '') + ' d\'affilée</span>'
      + '<button type="button" class="pd-bdg-btn" onclick="openBadges()">' + on.slice(-4).map(function(b){ return '<i>' + b.ico + '</i>'; }).join('') + '<span>' + on.length + '/' + B.list.length + ' badges ›</span></button></div>';
    if(typeof bsHomeLine === 'function') h += bsHomeLine();                    // foulée qui se dégrade (body-signals.js)
    if(typeof bsBedtimeLine === 'function') h += bsBedtimeLine();              // le soir : heure de coucher conseillée
    if(typeof apCardHtml === 'function') h += apCardHtml();                    // ajustements de la nuit (pilote automatique)
    if(typeof raHomeLine === 'function') h += raHomeLine();                    // analyse de la course (10 jours après)
    if(typeof wsHomeButton === 'function') h += wsHomeButton();                // ta semaine en image (week-share.js)
    if(dRace != null && dRace >= 0 && dRace <= 21) h += '<button type="button" class="pd-raceb" onclick="openRacePlan()">🏁 <b>' + prEsc(R.name) + '</b> dans ' + dRace + ' jour' + (dRace > 1 ? 's' : '') + ' · ton plan de course ›</button>';
    el.innerHTML = h + '</div>';
  } catch(e) { el.innerHTML = ''; }
}
function openBadges(){
  _pdCss(); const B = prBadges(), got = state._badges || {};
  const mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'pd-badges'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  ov.innerHTML = '<div class="modal-box" style="max-height:90vh;"><div class="pd-head bdg"><div><p class="pd-eb">Ta prépa</p><p class="pd-title">🏅 Badges</p><p class="pd-sub">' + B.list.filter(function(b){ return b.on; }).length + ' sur ' + B.list.length + ' · série en cours : ' + B.c.streak + ' séance' + (B.c.streak > 1 ? 's' : '') + '</p></div><button class="pd-x" onclick="document.getElementById(\'pd-badges\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body" style="background:#F3F6FC;"><div class="pd-bgrid">' + B.list.map(function(b){ return '<div class="pd-b' + (b.on ? ' on' : '') + '"><span>' + b.ico + '</span><b>' + prEsc(b.t) + '</b><small>' + (b.on ? (got[b.id] ? 'le ' + prFmtDate(got[b.id]) : 'obtenu') : 'à débloquer') + '</small></div>'; }).join('') + '</div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  mc.appendChild(ov);
}

// ─── Styles ─────────────────────────────────────────────────────────────────
function _pdCss(){
  if(document.getElementById('pd-css')) return;
  const st = document.createElement('style'); st.id = 'pd-css';
  st.textContent = '.pd-wx{font-size:11px;font-weight:700;color:#B45309;margin-top:2px;}'
    + '.pd-rpe{margin-top:14px;background:#F8FAFD;border:1px solid #E2E8F0;border-radius:14px;padding:12px;}.pd-h{font-size:12px;font-weight:800;color:#334155;margin:0 0 8px;display:flex;justify-content:space-between;}.pd-h span{font-weight:700;color:#64748B;}'
    + '.pd-scale{display:grid;grid-template-columns:repeat(10,1fr);gap:4px;}.pd-n{height:34px;border-radius:9px;border:1.5px solid #E2E8F0;background:#fff;font-weight:800;font-size:13px;color:#334155;cursor:pointer;font-family:inherit;padding:0;}'
    + '.pd-n.r1.on{background:#22C55E;border-color:#22C55E;color:#fff;}.pd-n.r2.on{background:#84CC16;border-color:#84CC16;color:#fff;}.pd-n.r3.on{background:#EAB308;border-color:#EAB308;color:#fff;}.pd-n.r4.on{background:#F97316;border-color:#F97316;color:#fff;}.pd-n.r5.on{background:#DC2626;border-color:#DC2626;color:#fff;}'
    + '.pd-chips{display:flex;flex-wrap:wrap;gap:6px;}.pd-zones[hidden]{display:none !important;}.pd-zones{margin-top:8px;}.pd-c{border:1.5px solid #E2E8F0;background:#fff;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:700;color:#334155;cursor:pointer;font-family:inherit;}.pd-c.sm{padding:5px 10px;font-size:11.5px;}.pd-c.on{background:#FEE2E2;border-color:#F87171;color:#991B1B;}'
    + '.pd-head{flex-shrink:0;color:#fff;padding:16px;border-radius:24px 24px 0 0;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;background:linear-gradient(135deg,#0C447C,#1D4ED8);}.pd-head.imp{background:linear-gradient(135deg,#7C2D12,#C2410C);}.pd-head.race{background:linear-gradient(135deg,#78350F,#B45309);}.pd-head.bdg{background:linear-gradient(135deg,#4C1D95,#7C3AED);}'
    + '.pd-eb{font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;opacity:.8;margin:0 0 2px;}.pd-title{font-size:21px;font-weight:900;margin:0;}.pd-sub{font-size:12.5px;opacity:.85;margin:3px 0 0;font-weight:600;}.pd-x{flex-shrink:0;width:32px;height:32px;border-radius:50%;border:none;background:rgba(255,255,255,.2);color:#fff;font-size:18px;cursor:pointer;}'
    + '.pd-card{background:#fff;border:1px solid #DCE5F3;border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:8px;}.pd-sec{font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#64748B;margin:6px 2px -2px;display:flex;justify-content:space-between;align-items:baseline;gap:8px;}.pd-sec span{text-transform:none;letter-spacing:0;font-weight:700;}'
    + '.pd-note{font-size:12.5px;color:#5B6675;line-height:1.45;margin:0;}.pd-warm{color:#B45309;font-weight:700;}'
    + '.pd-foot{flex-shrink:0;background:#fff;border-top:1px solid #E2E8F0;padding:10px 16px calc(env(safe-area-inset-bottom) + 10px);}.pd-btn{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;border:none;border-radius:12px;padding:13px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;background:#15803D;color:#fff;}.pd-btn:disabled{opacity:.5;}.pd-btn.sec{background:#EEF3FC;color:#1B4FD8;border:1px solid #D3DFF5;}'
    + '.pd-types{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}.pd-type{display:flex;flex-direction:column;align-items:center;gap:3px;text-align:center;background:#fff;border:1.5px solid #DCE5F3;border-radius:14px;padding:12px 6px;cursor:pointer;font-family:inherit;color:#0F172A;}.pd-type span{font-size:24px;}.pd-type b{font-size:12.5px;font-weight:850;}.pd-type small{font-size:10.5px;color:#64748B;font-weight:600;line-height:1.25;}.pd-type.on{border-color:#C2410C;background:#FFF7ED;box-shadow:0 0 0 3px rgba(194,65,12,.12);}'
    + '.pd-dates{flex-direction:row;}.pd-dates label,.pd-lab{flex:1;display:flex;flex-direction:column;gap:4px;font-size:11.5px;font-weight:800;color:#64748B;}.pd-dates input,.pd-lab input{height:42px;border:1px solid #D6DFEC;border-radius:10px;padding:0 10px;font-size:15px;font-family:inherit;color:#0F172A;background:#fff;-webkit-appearance:none;appearance:none;min-width:0;}'
    + '.pd-row{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid #EEF2F7;}.pd-row:first-child{border-top:none;padding-top:0;}.pd-row b{font-size:13.5px;color:#0F172A;}.pd-row small{font-size:11.5px;color:#64748B;font-weight:700;}.pd-row p{margin:2px 0 0;font-size:12.5px;color:#475569;}'
    + '.pd-ico{flex-shrink:0;width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;background:#F1F5F9;color:#334155;}.pd-ico.date{background:#E0E9FF;}.pd-ico.skip{background:#FEE2E2;color:#B91C1C;}.pd-ico.km{background:#E0F2FE;color:#075985;}'
    + '.pd-segs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}.pd-seg{background:#fff;border:1.5px solid #DCE5F3;border-radius:14px;padding:10px 6px;display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer;font-family:inherit;color:#0F172A;}.pd-seg b{font-size:12.5px;font-weight:850;}.pd-seg small{font-size:13px;font-weight:800;color:#64748B;font-variant-numeric:tabular-nums;}.pd-seg.on{border-color:#B45309;background:#FFFBEB;}.pd-seg.on small{color:#92400E;}'
    + '.pd-hero{flex-direction:row;flex-wrap:wrap;gap:12px 24px;}.pd-hero>div{display:flex;flex-direction:column;}.pd-hero small{font-size:11px;font-weight:800;color:#64748B;text-transform:uppercase;letter-spacing:.06em;}.pd-hero b{font-size:28px;font-weight:900;color:#78350F;font-variant-numeric:tabular-nums;line-height:1.1;}.pd-hero i{font-size:13px;font-style:normal;color:#64748B;margin-left:2px;}.pd-hero .pd-note{flex-basis:100%;}'
    + '.pd-splits table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:14px;}.pd-splits th{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:#64748B;text-align:left;padding:0 4px 6px;}.pd-splits td{padding:7px 4px;border-top:1px solid #EEF2F7;font-weight:700;color:#0F172A;}.pd-splits td:last-child{color:#78350F;font-weight:800;}.pd-splits tr.fin td{font-weight:900;}'
    + '.pd-list p{margin:0;font-size:12.5px;color:#334155;line-height:1.45;display:grid;grid-template-columns:24px 1fr;column-gap:6px;}.pd-list p span{grid-row:span 2;font-size:16px;}.pd-list p b{font-size:13px;color:#0F172A;}'
    + '.pd-memo{background:#0F172A;color:#fff;border-radius:18px;padding:16px;display:flex;flex-direction:column;gap:10px;}.pd-memo-h{margin:0;font-size:15px;font-weight:900;}.pd-memo-g{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}.pd-memo-g div{background:rgba(255,255,255,.08);border-radius:10px;padding:8px;display:flex;flex-direction:column;}.pd-memo-g small{font-size:10.5px;opacity:.7;font-weight:700;}.pd-memo-g b{font-size:19px;font-weight:900;font-variant-numeric:tabular-nums;}.pd-memo-f{margin:0;font-size:12px;opacity:.8;font-weight:700;}'
    + '.pd-home{display:flex;flex-direction:column;gap:8px;}.pd-form{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #DCE5F3;border-radius:16px;padding:10px 14px;}.pd-gauge{width:56px;height:56px;flex-shrink:0;transform:rotate(-90deg);}.pd-gauge text{transform:rotate(90deg);transform-origin:32px 32px;font-size:17px;font-weight:900;fill:#0F172A;font-family:inherit;}'
    + '.g-spin{fill:none;stroke:#94A3B8;stroke-width:7;stroke-linecap:round;stroke-dasharray:40 124;transform-origin:32px 32px;animation:pdSpin 1s linear infinite;}@keyframes pdSpin{to{transform:rotate(360deg);}}@media (prefers-reduced-motion:reduce){.g-spin{animation:none;}}.pd-form.load b{color:#64748B;}'
    + '.pd-form.fail{border-color:#FED7AA;background:#FFF7ED;}.pd-form.fail b{color:#9A3412;}.pd-form.fail.pending{border-color:#E2E8F0;background:#F8FAFC;}.pd-form.fail.pending b{color:#475569;}.pd-form.fail text{font-size:20px;}'
    + '.g-bg{fill:none;stroke:#EEF2F7;stroke-width:7;}.g-fg{fill:none;stroke-width:7;stroke-linecap:round;}.pd-form.ok .g-fg{stroke:#16A34A;}.pd-form.mid .g-fg{stroke:#EAB308;}.pd-form.low .g-fg{stroke:#DC2626;}'
    + '.pd-form.wait{background:linear-gradient(135deg,#F5F3FF,#EEF2FF);border-color:#DDD6FE;}.pd-form.wait text{font-size:20px;}.pd-wake{flex-shrink:0;border:none;border-radius:12px;padding:9px 12px;font-size:12.5px;font-weight:800;color:#fff;background:linear-gradient(135deg,#f97316,#fbbf24);cursor:pointer;font-family:inherit;}'
    + '.pd-form-l{margin:0;font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#64748B;}.pd-form b{display:block;font-size:14.5px;font-weight:850;color:#0F172A;}.pd-form small{display:block;font-size:11.5px;color:#64748B;font-weight:600;margin-top:1px;}'
    + '.pd-strip{display:flex;gap:8px;align-items:center;}.pd-streak{flex-shrink:0;background:#FFF7ED;color:#9A3412;border-radius:999px;padding:6px 11px;font-size:12px;font-weight:700;}.pd-bdg-btn{flex:1;min-width:0;display:flex;align-items:center;justify-content:flex-end;gap:2px;background:#F5F3FF;border:none;border-radius:999px;padding:5px 11px;cursor:pointer;font-family:inherit;}.pd-bdg-btn i{font-style:normal;font-size:15px;}.pd-bdg-btn span{font-size:12px;font-weight:800;color:#5B21B6;margin-left:4px;white-space:nowrap;}'
    + '.pd-raceb{width:100%;text-align:left;background:linear-gradient(135deg,#FFFBEB,#FEF3C7);border:1px solid #FDE68A;border-radius:14px;padding:10px 14px;font-size:13px;color:#78350F;cursor:pointer;font-family:inherit;}'
    + '.pd-bgrid{padding:14px 16px 24px;display:grid;grid-template-columns:repeat(2,1fr);gap:10px;}.pd-b{background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:14px 10px;display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;opacity:.5;filter:grayscale(1);}.pd-b.on{opacity:1;filter:none;border-color:#DDD6FE;box-shadow:0 6px 16px -10px rgba(91,33,182,.5);}.pd-b span{font-size:30px;}.pd-b b{font-size:13px;font-weight:850;color:#0F172A;}.pd-b small{font-size:11px;color:#64748B;font-weight:700;}';
  document.head.appendChild(st);
}
