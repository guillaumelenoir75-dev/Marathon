// Validation automatique d'une séance (serveur, functions/autovalidate.js, toutes les 15 min) — SÉCURISÉE :
// une sortie n'est validée QUE si les 3 sources concordent, sinon rien n'est écrit :
//   1. Strava : une course (Run / TrailRun / VirtualRun) ≥ 1 km et ≥ 8 min, terminée depuis ≥ 15 min, jamais rattachée
//      à une autre séance, rattachée sans ambiguïté à UNE séance du plan non faite (± 1 jour, km cohérents) ;
//   2. WHOOP : l'entraînement enregistré PENDANT cette sortie (chevauchement des horaires ≥ 60 %, départs à 20 min près,
//      effort calculé) — jamais un entraînement plus ancien ;
//   3. Météo : relevé Open-Meteo au lieu de départ de la sortie (GPS Strava), à l'heure de la sortie, même jour.
// Le même code tourne dans l'app (fichier du bundle) et sur le serveur (moteur functions/engine.js) : testable.
// App : ressenti après une validation automatique (avFeelOpen, notification « Ton ressenti ? », pastille sur l'accueil),
// réglage Compte › « 🤖 Validation automatique » (avOpenSettings, state._autoval = 'on' | 'off').

const AV_RUN_TYPES = ['Run', 'TrailRun', 'VirtualRun'];
const AV_MIN_KM = 1, AV_MIN_SEC = 480, AV_SETTLE_MIN = 15, AV_GIVEUP_H = 4;
const AV_WHOOP_OVERLAP = 0.6, AV_WHOOP_START_MIN = 20;

// activité Strava (liste de l'API) → forme compacte utilisée partout ici
function avActFromStrava(a){
  if(!a || !a.start_date || !a.start_date_local) return null;
  const startMs = Date.parse(a.start_date), el = Math.round(a.elapsed_time || a.moving_time || 0);
  return { id: String(a.id), date: a.start_date_local.slice(0, 10), t: a.start_date_local.slice(11, 16), startMs: startMs, endMs: startMs + el * 1000,
    km: Math.round((a.distance || 0) / 10) / 100, mv: Math.round(a.moving_time || 0), el: el, sp: a.sport_type || a.type || '',
    hr: a.average_heartrate ? Math.round(a.average_heartrate) : null, mx: a.max_heartrate ? Math.round(a.max_heartrate) : null,
    cad: a.average_cadence ? Math.round(a.average_cadence * 2) : null, up: a.total_elevation_gain != null ? Math.round(a.total_elevation_gain) : null,
    gearId: a.gear_id || null, name: String(a.name || 'Course').slice(0, 60),
    lat: a.start_latlng && a.start_latlng.length === 2 ? a.start_latlng[0] : null, lng: a.start_latlng && a.start_latlng.length === 2 ? a.start_latlng[1] : null };
}
// « 46:20 » / « 1:02:03 » (même format que l'import Strava manuel) ; allure « 5:43 »
function avDur(sec){ sec = Math.round(sec || 0); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); }
function avPace(sec, km){ if(!(km > 0) || !(sec > 0)) return null; let p = Math.round(sec / km); return Math.floor(p / 60) + ':' + String(p % 60).padStart(2, '0'); }

// 1. Strava → séance : une seule séance possible, sinon rien
function avMatch(st, act, today){
  if(!act) return { reason: 'activité illisible' };
  if(AV_RUN_TYPES.indexOf(act.sp) < 0) return { reason: 'pas une course (' + act.sp + ')' };
  if(!(act.km >= AV_MIN_KM) || !(act.mv >= AV_MIN_SEC)) return { reason: 'trop courte' };
  const all = prSessions(st);
  if(all.some(function(s){ return s.perf && String(s.perf.strava_id || '') === act.id; })) return { already: true, reason: 'déjà rattachée' };
  if(all.some(function(s){ return s.done && s.date === act.date && Math.abs((s.km || 0) - act.km) <= 0.3; })) return { already: true, reason: 'déjà validée à la main' };
  const c = all.filter(function(s){ return !s.done && !s.skip && s.type !== 'rest' && s.date && Math.abs(prDays(act.date, s.date)) <= 1 && s.kmPlan > 0; })
    .map(function(s){ const r = act.km / s.kmPlan, ok = s.type === 'race' ? r >= 0.85 && r <= 1.15 : r >= 0.5 && r <= 1.6;
      return { s: s, ok: ok, score: Math.abs(prDays(act.date, s.date)) * 10 + Math.abs(s.kmPlan - act.km) }; })
    .filter(function(x){ return x.ok; }).sort(function(a, b){ return a.score - b.score; });
  if(!c.length) return { reason: 'aucune séance du plan correspondante' };
  if(c.length > 1 && c[1].score - c[0].score < 1) return { reason: 'deux séances possibles : ' + c[0].s.title + ' / ' + c[1].s.title };
  return { s: c[0].s };
}
// 2. WHOOP : l'entraînement de CETTE sortie (horaires), jamais un plus ancien
function avWhoop(act, workouts){
  let best = null;
  (workouts || []).forEach(function(w){
    if(!w || !w.start || !w.end || w.strain == null) return;
    if(w.sport && !/run|activity|track|trail|treadmill|course/i.test(String(w.sport))) return;
    const ws = Date.parse(w.start), we = Date.parse(w.end); if(!(we > ws)) return;
    const ov = Math.min(act.endMs, we) - Math.max(act.startMs, ws), ref = Math.min(act.endMs - act.startMs, we - ws);
    if(!(ref > 0) || ov < AV_WHOOP_OVERLAP * ref || Math.abs(ws - act.startMs) > AV_WHOOP_START_MIN * 60000) return;
    if(!best || ov > best.ov) best = { w: w, ov: ov, pct: Math.round(ov / ref * 100) };
  });
  return best;
}
// 3. Météo : au lieu et à l'heure de la sortie, même jour
function avMeteoOk(m, act){
  if(!m || typeof m.temperature !== 'number' || !isFinite(m.temperature) || m.date !== act.date) return false;
  const h = parseInt(String(m.heure_cible || ''), 10), ha = parseInt(act.t, 10);
  return !isNaN(h) && Math.abs(h - ha) <= 1;
}
// relevé horaire Open-Meteo → même forme que la météo d'une validation manuelle (perf.meteo)
const AV_WMO = { 0: 'Ciel dégagé ☀️', 1: 'Peu nuageux 🌤️', 2: 'Partiellement nuageux ⛅', 3: 'Couvert ☁️', 45: 'Brouillard 🌫️', 48: 'Brouillard givrant 🌫️', 51: 'Bruine légère 🌦️', 53: 'Bruine 🌦️', 55: 'Bruine dense 🌧️', 61: 'Pluie faible 🌧️', 63: 'Pluie 🌧️', 65: 'Forte pluie 🌧️', 71: 'Neige faible 🌨️', 73: 'Neige 🌨️', 75: 'Forte neige ❄️', 80: 'Averses 🌦️', 81: 'Averses 🌧️', 82: 'Fortes averses ⛈️', 95: 'Orage ⛈️', 96: 'Orage et grêle ⛈️', 99: 'Orage et grêle ⛈️' };
function avMeteoFromHourly(H, act){
  if(!H || !H.time) return null;
  const want = act.date + 'T' + act.t.slice(0, 2) + ':00', i = H.time.indexOf(want); if(i < 0) return null;
  const t = H.temperature_2m && H.temperature_2m[i]; if(typeof t !== 'number') return null;
  const hum = H.relative_humidity_2m ? H.relative_humidity_2m[i] : null, app = H.apparent_temperature ? H.apparent_temperature[i] : null;
  const code = H.weather_code ? H.weather_code[i] : null, wind = H.wind_speed_10m ? H.wind_speed_10m[i] : null;
  const elev = t >= 25 ? (Math.floor(t) - 25) * 2 : 0, ral = t >= 25 ? Math.round((t - 25) * 7) : 0;
  const impact = typeof _weatherImpact === 'function' ? _weatherImpact(t, hum, app) : { niveau: t >= 35 ? 'EXTREME' : t >= 30 ? 'ELEVE' : t >= 25 ? 'MODERE' : t >= 20 && hum > 75 ? 'HUMIDE' : t <= 0 ? 'FROID' : 'IDEAL',
    ralentissement: ral ? '~' + ral + ' sec/km' : '0 sec/km', elevation_fc_bpm: elev, zone_ef_ajustee: (140 + elev) + '-' + (148 + elev) + ' bpm' };
  return { date: act.date, heure_cible: parseInt(act.t, 10) + 'h00', ville: null, temperature: Math.round(t * 10) / 10, ressenti: Math.round((app != null ? app : t) * 10) / 10,
    humidite: Math.round(hum || 0), vent_kmh: Math.round((wind || 0) * 10) / 10, conditions: (typeof _wmoLabel === 'function' ? _wmoLabel(code, 1) : AV_WMO[code]) || 'Conditions variables',
    impact_performance: impact, coordonnees: { lat: Math.round(act.lat * 1000) / 1000, lng: Math.round(act.lng * 1000) / 1000 }, source: 'auto',
    note: 'MÉTÉO : ' + Math.round(t) + '°C (ressenti ' + Math.round(app != null ? app : t) + '°C), ' + Math.round(hum || 0) + '% humidité.' + (elev ? ' IMPACT FC : +' + elev + ' bpm attendus.' : '') };
}
// détail Strava (splits, tours, calories…) → perf.strava, même forme que l'import manuel
function avStravaBlock(act, detail){
  const d = detail || {}, o = {};
  if(act.cad) o.cadence = act.cad; if(act.mx) o.fcMax = act.mx; if(act.up != null) o.denivele_pos = act.up;
  ['calories', 'best_400m', 'splits', 'laps', 'zones_fc'].forEach(function(k){ if(d[k] != null && (!Array.isArray(d[k]) || d[k].length)) o[k] = d[k]; });
  return o;
}
// décision : { ok, key, w, ei, km, perf, summary } ou { ok:false, missing:[…], reason }
function avDecide(st, act, opts){
  opts = opts || {};
  const now = opts.nowMs || Date.now(), missing = [];
  if(!act) return { ok: false, missing: ['strava'], reason: 'pas de sortie' };
  const settle = opts.settleMin != null ? opts.settleMin : AV_SETTLE_MIN;      // bouton « J'ai fini » : pas d'attente
  if(now - act.endMs < settle * 60000) return { ok: false, wait: true, missing: [], reason: 'sortie trop récente' };
  const m = avMatch(st, act, opts.today);
  if(!m.s) return { ok: false, skip: true, already: !!m.already, missing: [], reason: m.reason };
  if(!opts.detail) missing.push('strava');
  const W = avWhoop(act, opts.workouts); if(!W) missing.push('whoop');
  if(act.lat == null || act.lng == null) missing.push('gps');
  else if(!avMeteoOk(opts.meteo, act)) missing.push('meteo');
  if(missing.length) return { ok: false, s: m.s, missing: missing, reason: 'sources manquantes : ' + missing.join(', ') };
  const s = m.s, w = W.w, perf = {
    dur: avDur(act.mv), pace: avPace(act.mv, act.km), date: act.date, validatedAt: new Date(now).toISOString(),
    strava_id: act.id, strava: avStravaBlock(act, opts.detail), meteo: opts.meteo,
    whoop: { workout_strain: w.strain, workout_calories: w.kcal != null ? w.kcal : null, avg_hr: w.avg_hr || null, max_hr: w.max_hr || null, zones: w.zones || null, id: w.id || null },
    auto: { at: new Date(now).toISOString(), whoop: W.pct, src: ['strava', 'whoop', 'meteo'] }
  };
  if(act.hr) perf.hr = act.hr;
  if((s.type === 'tempo' || s.type === 'frac') && perf.strava.laps && typeof prBlocsFromLaps === 'function'){
    const bl = prBlocsFromLaps(s.title, s.detail, perf.strava.laps); if(bl){ perf.blocsAllure = bl; perf.blocsAuto = true; }
  }
  return { ok: true, key: s.key, w: s.w, ei: s.ei, km: act.km, s: s, act: act, perf: perf,
    summary: { title: s.title, km: act.km, pace: perf.pace, temp: opts.meteo.temperature, strain: w.strain, date: act.date } };
}
// clés d'état à écrire pour une décision positive (le serveur n'écrit que celles-là)
function avUpdates(st, D){
  const up = {}; if(!D || !D.ok) return up;
  up[D.key + '_done'] = true; up[D.key + '_km'] = D.km; up[D.key + '_perf'] = JSON.stringify(D.perf);
  up[D.key + '_skip'] = null; up[D.key + '_skip_reason'] = null;
  try { const x = JSON.parse(st[D.key] || '{}'), sh = D.perf.strava && D.act && D.act.gearId && typeof shoeByStravaId === 'function' ? shoeByStravaId(D.act.gearId) : null;
    if(sh && x.shoe !== sh){ x.shoe = sh; up[D.key] = JSON.stringify(x); } } catch(e) {}
  return up;
}

// ─── Fenêtre « Valider la séance » : bouton « 🤖 Validation automatique » (fonction autoValidateNow, mode fill) ───
// la sortie Strava de CETTE séance (± 1 jour de la date choisie, la plus proche puis km les plus proches), jamais une
// sortie déjà rattachée à une autre séance ; plusieurs sorties le même jour aux km voisins → choix proposé
function avFillPick(st, key, acts, date){
  const all = prSessions(st), s = all.find(function(x){ return x.key === key; });
  if(!s) return { reason: 'séance introuvable' };
  const used = {}; all.forEach(function(x){ if(x.key !== key && x.perf && x.perf.strava_id) used[String(x.perf.strava_id)] = 1; });
  const d0 = date || s.date;
  const c = (acts || []).filter(function(a){ return a && AV_RUN_TYPES.indexOf(a.sp) >= 0 && a.km >= AV_MIN_KM && !used[a.id] && d0 && Math.abs(prDays(d0, a.date)) <= 1; })
    .map(function(a){ return { a: a, dd: Math.abs(prDays(d0, a.date)), dk: Math.abs((s.kmPlan || a.km) - a.km) }; })
    .sort(function(x, y){ return (x.dd - y.dd) || (x.dk - y.dk); });
  if(!c.length) return { s: s, reason: 'aucune sortie Strava ' + (d0 === s.date ? 'ce jour-là' : 'à cette date') };
  const same = c.filter(function(x){ return x.dd === c[0].dd; });
  if(same.length > 1 && same[1].dk - same[0].dk < 1) return { s: s, choices: same.map(function(x){ return x.a; }) };
  return { s: s, act: c[0].a };
}
// sources trouvées → ce que le formulaire attend : activité au format de l'import Strava, WHOOP (perf.whoop), météo (perf.meteo)
function avFillResult(act, detail, workouts, meteo, opts){
  opts = opts || {};
  const d = detail || {}, missing = [];
  const activity = { activityId: act.id, date: act.date, nom: act.name, distanceKm: act.km, duree: avDur(act.mv), allure: avPace(act.mv, act.km),
    fcMoyenne: act.hr, fcMax: act.mx, cadence: act.cad, denivele_pos: act.up, gearId: act.gearId, start: act.t };
  ['calories', 'best_400m', 'splits', 'laps', 'zones_fc'].forEach(function(k){ if(d[k] != null && (!Array.isArray(d[k]) || d[k].length)) activity[k] = d[k]; });
  if(!detail) missing.push('strava');
  let whoop = null;
  if(opts.whoop !== false){
    const W = avWhoop(act, workouts);
    if(W) whoop = { workout_strain: W.w.strain, workout_calories: W.w.kcal != null ? W.w.kcal : null, avg_hr: W.w.avg_hr || null, max_hr: W.w.max_hr || null, zones: W.w.zones || null, id: W.w.id || null, overlap: W.pct };
    else missing.push('whoop');
  }
  const m = avMeteoOk(meteo, act) ? meteo : null;
  if(act.lat == null || act.lng == null) missing.push('gps'); else if(!m) missing.push('meteo');
  return { activity: activity, whoop: whoop, meteo: m, missing: missing };
}
let _avfCtx = null;
async function _avFillCall(body){
  const u = typeof firebase !== 'undefined' && firebase.auth ? firebase.auth().currentUser : null;
  const tok = u ? await u.getIdToken() : '';
  const r = await fetch(FUNCTIONS_BASE + '/autoValidateNow', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok }, body: JSON.stringify(body) });
  return r.json();
}
function avFillHtml(w, ei, admin){
  _avCss();
  const src = function(id, ico, lbl, fn){ return '<button type="button" class="avf-src" id="' + id + '" onclick="' + fn + '"><span>' + ico + '</span><b>' + lbl + '</b></button>'; };
  return '<div class="avf"><button type="button" class="avf-btn" id="avf-btn" onclick="avFill(' + w + ',' + ei + ')">🤖 Validation automatique<small>Strava · ' + (admin ? 'WHOOP · ' : '') + 'Météo de ta sortie</small></button>'
    + '<div class="avf-row">' + src('strava-val-btn', '🟠', 'Strava', 'importFromStrava()') + (admin ? src('whoop-val-btn', '💚', 'WHOOP', 'importWhoopForPerfEditExtra(' + w + ',' + ei + ')') : '') + src('meteo-val-btn', '🌡️', 'Météo', 'importMeteoValidation()') + '</div>'
    + '<p class="avf-msg" id="avf-msg">Un appui : tout est rempli, il reste ton ressenti</p></div>';
}
function _avfSet(id, st, t){
  const b = document.getElementById(id); if(!b) return;
  b.classList.remove('ok', 'ko', 'wait'); b.classList.add(st); b.removeAttribute('style');
  const ico = { 'strava-val-btn': '🟠', 'whoop-val-btn': '💚', 'meteo-val-btn': '🌡️' }[id];
  b.innerHTML = '<span>' + ico + '</span><b>' + prEsc(t) + '</b>' + (st === 'ok' ? '<i>✓</i>' : st === 'ko' ? '<i>↻</i>' : '');
}
async function avFill(w, ei, activityId){
  const k = 'extra_w' + w + '_s' + ei, btn = document.getElementById('avf-btn'), msg = document.getElementById('avf-msg');
  const dEl = document.getElementById('val-date'), date = dEl && dEl.value ? dEl.value : null;
  const ids = ['strava-val-btn', 'whoop-val-btn', 'meteo-val-btn'];
  ids.forEach(function(id){ _avfSet(id, 'wait', 'recherche…'); });
  if(btn){ btn.disabled = true; btn.firstChild.textContent = '⏳ Je cherche ta sortie…'; }
  const pk = document.getElementById('avf-pick'); if(pk) pk.remove();
  let r = null;
  try { r = await _avFillCall({ fill: true, key: k, date: date, activityId: activityId || null }); } catch(e) { r = { success: false, error: 'Connexion impossible' }; }
  if(btn){ btn.disabled = false; btn.firstChild.textContent = '🤖 Validation automatique'; }
  if(!document.getElementById('avf-btn')) return;   // fenêtre fermée entre-temps
  const F = r && r.fill;
  if(!r || r.success === false || !F){
    ids.forEach(function(id){ _avfSet(id, 'ko', 'à la main'); });
    if(msg){ msg.className = 'avf-msg ko'; msg.textContent = (r && r.error) || 'Serveur injoignable : touche une source pour la remplir à la main'; }
    return;
  }
  if(F.choices && F.choices.length){
    ids.forEach(function(id){ _avfSet(id, 'wait', '—'); });
    if(msg){ msg.className = 'avf-msg'; msg.textContent = 'Plusieurs sorties ce jour-là : laquelle ?'; }
    const box = document.createElement('div'); box.id = 'avf-pick'; box.className = 'avf-pick';
    box.innerHTML = F.choices.map(function(a){ return '<button type="button" onclick="avFill(' + w + ',' + ei + ',\'' + prEsc(a.id) + '\')"><b>' + String(a.km).replace('.', ',') + ' km</b><span>' + prEsc(a.t || '') + ' · ' + prEsc(String(a.pace || '').replace(':', "'")) + '/km · ' + prEsc(a.name || '') + '</span></button>'; }).join('');
    if(msg) msg.after(box);
    return;
  }
  const miss = F.missing || [];
  if(F.activity){
    if(typeof _applyStravaToValidation === 'function') _applyStravaToValidation(F.activity);
    _avfSet('strava-val-btn', 'ok', String(F.activity.distanceKm).replace('.', ',') + ' km');
  } else _avfSet('strava-val-btn', 'ko', F.reason || 'introuvable');
  if(document.getElementById('whoop-val-btn')){
    if(F.whoop){ window._whoopChargeData = F.whoop; _avfSet('whoop-val-btn', 'ok', 'effort ' + String(Math.round(F.whoop.workout_strain * 10) / 10).replace('.', ',')); }
    else _avfSet('whoop-val-btn', 'ko', F.activity ? 'pas trouvé' : '—');
  }
  if(F.meteo){ window._meteoValidationData = F.meteo; _avfSet('meteo-val-btn', 'ok', Math.round(F.meteo.temperature) + '°'); }
  else _avfSet('meteo-val-btn', 'ko', miss.indexOf('gps') >= 0 ? 'sans GPS' : F.activity ? 'pas trouvée' : '—');
  const nKo = document.querySelectorAll('.avf-src.ko').length;
  if(msg){ msg.className = 'avf-msg' + (nKo ? ' ko' : ' ok'); msg.textContent = !F.activity ? (F.reason || 'Aucune sortie Strava') + ' · touche une source pour la remplir à la main' : nKo ? 'Touche ↻ pour compléter à la main' : '✓ Tout est rempli : ajoute ton ressenti et valide'; }
}

// ─── App : ressenti après une validation automatique, pastille, réglage ──────────
function avPendingFeel(){
  if(typeof prSessions !== 'function') return [];
  return prSessions(typeof prRealState === 'function' ? prRealState() : state).filter(function(s){ return s.done && s.perf && s.perf.auto && !s.perf.rpe && !s.perf.feelSkip && s.date && prDays(s.date, prTodayIso()) <= 3; });
}
function avFeelOpen(key){
  _avCss();
  const L = avPendingFeel(), s = (key && L.find(function(x){ return x.key === key; })) || L[0];
  if(!s){ if(typeof showToast === 'function') showToast('Aucune séance en attente de ressenti', '🤖'); return; }
  const p = s.perf, mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'av-feel'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)'); ov.dataset.key = s.key;
  const chip = function(t){ return '<span class="av-chip">' + t + '</span>'; };
  ov.innerHTML = '<div class="modal-box" style="max-height:92vh;"><div class="av-head"><div><p class="av-eb">Validée automatiquement</p><p class="av-title">✅ ' + prEsc(s.title) + '</p>'
    + '<p class="av-sub">' + new Date(s.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }) + '</p></div>'
    + '<button class="av-x" onclick="document.getElementById(\'av-feel\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body" style="background:#F5F7FB;"><div style="padding:12px 16px 22px;display:flex;flex-direction:column;gap:12px;">'
    + '<div class="av-chips">' + chip('🟠 ' + String(s.km).replace('.', ',') + ' km · ' + String(p.pace || '').replace(':', "'") + '/km')
    + (p.whoop && p.whoop.workout_strain != null ? chip('💚 WHOOP ' + String(Math.round(p.whoop.workout_strain * 10) / 10).replace('.', ',')) : '')
    + (p.meteo ? chip('🌡️ ' + Math.round(p.meteo.temperature) + '°') : '') + (p.hr ? chip('❤️ ' + p.hr) : '') + '</div>'
    + (typeof jvHtml === 'function' ? jvHtml() : '') + (typeof prRpeHtml === 'function' ? prRpeHtml({}) : '')
    + '<button type="button" class="av-save" onclick="avFeelSave()">Enregistrer mon ressenti</button>'
    + '<button type="button" class="av-skip" onclick="avFeelSkip()">Plus tard</button></div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  mc.appendChild(ov);
}
function avFeelSave(){
  const ov = document.getElementById('av-feel'); if(!ov) return; const k = ov.dataset.key;
  if(typeof jvFlush === 'function') jvFlush();
  let p = {}; try { p = JSON.parse(state[k + '_perf'] || '{}'); } catch(e) {}
  const r = typeof prRpeRead === 'function' ? prRpeRead() : null, j = typeof jvRead === 'function' ? jvRead() : null;
  if(r){ if(r.rpe) p.rpe = r.rpe; if(r.pain) p.pain = r.pain; }
  if(j && j.text){ p.journal = j.text; if(j.note) p.note = j.note; }
  if(!p.rpe){ if(typeof showToast === 'function') showToast('Choisis ton effort ressenti (1 à 10)', '🤖'); return; }
  state[k + '_perf'] = JSON.stringify(p); save();
  ov.remove();
  let x = {}; try { x = JSON.parse(state[k] || '{}'); } catch(e) {}
  if(typeof renderHome === 'function'){ rendered.home = false; renderHome(); }
  if(typeof isAdmin === 'function' && isAdmin() && typeof showCoachFeedback === 'function'){ window._lastValidatedPerf = p; try { showCoachFeedback(x, parseFloat(state[k + '_km']) || 0, p.pace || '', p.hr || null, false, null, p.meteo || null, p.whoop || null); } catch(e) {} }
  if(typeof prAfterValidation === 'function') prAfterValidation();
}
function avFeelSkip(){
  const ov = document.getElementById('av-feel'); if(!ov) return; const k = ov.dataset.key;
  let p = {}; try { p = JSON.parse(state[k + '_perf'] || '{}'); } catch(e) {}
  p.feelSkip = true; state[k + '_perf'] = JSON.stringify(p); save(); ov.remove();
  if(typeof renderHome === 'function'){ rendered.home = false; renderHome(); }
}
function avOn(){ return (state._autoval || 'on') !== 'off'; }
function avOpenSettings(){
  _avCss();
  const on = avOn(), mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'av-set'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  const log = (state._autoval_log ? Object.keys(state._autoval_log).map(function(id){ return state._autoval_log[id]; }) : []).sort(function(a, b){ return String(b.at).localeCompare(String(a.at)); }).slice(0, 5);
  const row = function(x){ return '<li><b>' + (x.st === 'ok' ? '✅' : x.st === 'manual' ? '✋' : '·') + '</b> ' + prEsc(x.date || '') + ' · ' + prEsc(String(x.km || '').replace('.', ',')) + ' km · ' + prEsc(x.st === 'ok' ? x.title || 'validée' : x.reason || '') + '</li>'; };
  ov.innerHTML = '<div class="modal-box" style="max-height:90vh;"><div class="av-head"><div><p class="av-eb">Séances</p><p class="av-title">🤖 Validation automatique</p><p class="av-sub">Ta sortie est validée seule, ton ressenti te sera demandé</p></div>'
    + '<button class="av-x" onclick="document.getElementById(\'av-set\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body" style="background:#F5F7FB;"><div style="padding:14px 16px 24px;display:flex;flex-direction:column;gap:10px;">'
    + '<button type="button" class="av-opt' + (on ? ' on' : '') + '" onclick="avSet(\'on\')"><b>Activée</b><span>Validée dès que les 3 sources concordent</span></button>'
    + '<button type="button" class="av-opt' + (!on ? ' on' : '') + '" onclick="avSet(\'off\')"><b>Désactivée</b><span>Tu valides toi-même chaque séance</span></button>'
    + (on ? '<button type="button" class="av-save" onclick="document.getElementById(\'av-set\').remove();avFinish()">🏁 J\'ai fini ma séance : vérifier maintenant</button>' : '')
    + '<div class="av-rules"><p>Validée seulement si :</p><ul><li>🟠 <b>Strava</b> · une course rattachée à une seule séance du plan</li><li>💚 <b>WHOOP</b> · l\'entraînement de cette sortie (mêmes horaires)</li><li>🌡️ <b>Météo</b> · au lieu et à l\'heure de la sortie</li></ul><p>Sinon : rien n\'est validé, tu reçois une notification pour valider à la main.</p></div>'
    + (log.length ? '<div class="av-rules"><p>Dernières sorties</p><ul>' + log.map(row).join('') + '</ul></div>' : '') + '</div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  mc.appendChild(ov);
}
function avSet(v){
  state._autoval = v; if(typeof dbRef !== 'undefined' && dbRef) dbRef.child('_autoval').set(v).catch(function(){});
  const ov = document.getElementById('av-set'); if(ov) ov.remove(); avOpenSettings();
  if(typeof showToast === 'function') showToast(v === 'off' ? 'Validation automatique désactivée' : 'Validation automatique activée', '🤖');
}
function _avCss(){
  if(typeof document === 'undefined' || document.getElementById('av-css')) return;
  const st = document.createElement('style'); st.id = 'av-css';
  st.textContent = '.av-head{flex-shrink:0;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:16px;border-radius:24px 24px 0 0;color:#fff;background:linear-gradient(135deg,#047857,#2563EB);}'
    + '.av-eb{margin:0;font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;opacity:.85;}.av-title{margin:2px 0;font-size:20px;font-weight:900;}.av-sub{margin:0;font-size:12.5px;opacity:.9;}'
    + '.av-x{background:rgba(255,255,255,.2);border:none;color:#fff;width:34px;height:34px;border-radius:50%;font-size:20px;cursor:pointer;flex-shrink:0;}'
    + '.av-chips{display:flex;flex-wrap:wrap;gap:6px;}.av-chip{background:#fff;border:1px solid #E2E8F0;border-radius:20px;padding:6px 11px;font-size:13px;font-weight:800;color:#0F172A;}'
    + '.av-save{padding:13px;border:none;border-radius:14px;background:#047857;color:#fff;font-weight:900;font-size:15px;cursor:pointer;font-family:inherit;}.av-skip{padding:8px;border:none;background:none;color:#64748B;font-weight:700;cursor:pointer;font-family:inherit;}'
    + '.av-opt{display:flex;flex-direction:column;gap:2px;text-align:left;padding:12px 14px;border-radius:14px;border:1.5px solid #E2E8F0;background:#fff;cursor:pointer;font-family:inherit;}.av-opt b{font-size:14.5px;color:#0F172A;}.av-opt span{font-size:12.5px;color:#64748B;}.av-opt.on{border-color:#047857;background:#ECFDF5;}'
    + '.av-rules{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:11px 13px;font-size:13px;color:#334155;}.av-rules p{margin:0 0 4px;font-weight:800;}.av-rules ul{margin:0;padding-left:18px;}.av-rules li{margin:3px 0;}'
    + '.av-rows{display:flex;flex-direction:column;gap:6px;}.av-src{display:grid;grid-template-columns:28px 64px 1fr auto;align-items:center;gap:8px;background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:10px 12px;font-size:13.5px;}'
    + '.av-src b{color:#0F172A;}.av-src-i{font-size:18px;}.av-src-t{color:#64748B;font-weight:600;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.av-src-s{font-size:16px;}.av-src.ok{border-color:#A7F3D0;background:#F0FDF4;}.av-src.ko{border-color:#FECACA;background:#FEF2F2;}'
    + '.av-msg{margin:2px 0 0;text-align:center;font-weight:900;font-size:15px;color:#334155;}.av-msg.ok,.av-msg.done{color:#047857;}.av-note{margin:0;text-align:center;font-size:12px;color:#64748B;}'
    + '.hn-fin{background:#047857;color:#fff;border:none;border-radius:20px;padding:8px 12px;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap;flex-shrink:0;font-family:inherit;}'
    + '.avf{background:#F0FDF4;border:1px solid #A7F3D0;border-radius:14px;padding:10px;margin-bottom:12px;display:flex;flex-direction:column;gap:8px;}'
    + '.avf-btn{display:flex;flex-direction:column;align-items:center;gap:1px;width:100%;padding:11px 10px;border:none;border-radius:12px;background:linear-gradient(135deg,#047857,#2563EB);color:#fff;font-size:15px;font-weight:900;cursor:pointer;font-family:inherit;}'
    + '.avf-btn small{font-size:11.5px;font-weight:700;opacity:.85;}.avf-btn:disabled{opacity:.75;}'
    + '.avf-row{display:flex;gap:6px;}.avf-src{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;gap:4px;padding:7px 6px;border-radius:10px;border:1px solid #E2E8F0;background:#fff;color:#334155;font-size:12px;cursor:pointer;font-family:inherit;}'
    + '.avf-src b{font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.avf-src i{font-style:normal;font-weight:900;}.avf-src.ok{border-color:#A7F3D0;background:#DCFCE7;color:#065F46;}.avf-src.ko{border-color:#FECACA;background:#FEF2F2;color:#991B1B;}.avf-src.wait{color:#64748B;}.avf-src[style*="background"]{color:#fff;border-color:transparent;}'
    + '.avf-msg{margin:0;text-align:center;font-size:12px;font-weight:700;color:#475569;}.avf-msg.ok{color:#047857;}.avf-msg.ko{color:#B45309;}'
    + '.avf-pick{display:flex;flex-direction:column;gap:6px;}.avf-pick button{display:flex;flex-direction:column;align-items:flex-start;padding:9px 12px;border-radius:10px;border:1.5px solid #FC4C02;background:#fff;cursor:pointer;font-family:inherit;text-align:left;}.avf-pick b{font-size:14px;color:#0F172A;}.avf-pick span{font-size:12px;color:#64748B;}'
    + '.hs-feel{border:none;background:#ECFDF5;color:#047857;border-radius:20px;padding:3px 9px;font-size:11px;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap;}';
  document.head.appendChild(st);
}

// ─── Bouton « 🏁 J'ai fini » : la vérification tout de suite (fonction autoValidateNow), état de chaque source ──────
// avNowView(r) : réponse du serveur → { phase: ok | done | wait | manual | off | error, key, title, rows: [strava, whoop, meteo], msg }
function avNowView(r){
  const row = function(k, ico, lbl, st, t){ return { k: k, ico: ico, lbl: lbl, st: st, t: t }; };
  const all = function(st, t){ return [row('strava', '🟠', 'Strava', st, t), row('whoop', '💚', 'WHOOP', st, t), row('meteo', '🌡️', 'Météo', st, t)]; };
  if(!r || r.success === false) return { phase: 'error', rows: all('wait', '—'), msg: (r && r.error) || 'Serveur injoignable' };
  if(r.skip) return { phase: r.skip === 'désactivée' ? 'off' : 'error', rows: all('wait', '—'), msg: r.skip === 'désactivée' ? 'Validation automatique désactivée' : r.skip };
  const L = (r.out || []).slice(), rank = { ok: 0, done: 1, pending: 2, manual: 3, skip: 4 };
  L.sort(function(a, b){ return (rank[a.st] - rank[b.st]) || String(b.date || '').localeCompare(String(a.date || '')); });
  const x = L[0];
  if(!x) return { phase: 'wait', rows: [row('strava', '🟠', 'Strava', 'wait', 'sortie pas encore arrivée'), row('whoop', '💚', 'WHOOP', 'wait', 'après Strava'), row('meteo', '🌡️', 'Météo', 'wait', 'après Strava')], msg: 'Ta sortie n\'est pas encore sur Strava' };
  const km = x.km != null ? String(x.km).replace('.', ',') + ' km' : '';
  if(x.st === 'ok') return { phase: 'ok', key: x.key, title: x.title, rows: [row('strava', '🟠', 'Strava', 'ok', km + (x.pace ? ' · ' + String(x.pace).replace(':', "'") + '/km' : '')), row('whoop', '💚', 'WHOOP', 'ok', 'effort ' + String(Math.round((x.strain || 0) * 10) / 10).replace('.', ',')), row('meteo', '🌡️', 'Météo', 'ok', Math.round(x.temp) + '°')], msg: (x.title || 'Séance') + ' validée' };
  if(x.st === 'done') return { phase: 'done', key: x.key, title: x.title, rows: all('ok', 'déjà fait'), msg: (x.title || 'Ta séance') + ' est déjà validée' };
  if(x.st === 'pending'){
    const m = x.missing || [];
    return { phase: 'wait', title: x.title, rows: [
      row('strava', '🟠', 'Strava', m.indexOf('strava') >= 0 ? 'wait' : 'ok', m.indexOf('strava') >= 0 ? 'détail en cours' : km),
      row('whoop', '💚', 'WHOOP', m.indexOf('whoop') >= 0 ? 'wait' : 'ok', m.indexOf('whoop') >= 0 ? 'entraînement pas encore calculé' : 'trouvé'),
      row('meteo', '🌡️', 'Météo', m.indexOf('gps') >= 0 ? 'ko' : m.indexOf('meteo') >= 0 ? 'wait' : 'ok', m.indexOf('gps') >= 0 ? 'sortie sans GPS' : m.indexOf('meteo') >= 0 ? 'relevé en attente' : 'trouvée')],
      msg: m.indexOf('gps') >= 0 ? 'Sans GPS, pas de météo : valide à la main' : 'Encore un peu de patience' };
  }
  return { phase: 'manual', rows: [row('strava', '🟠', 'Strava', 'ok', km), row('whoop', '💚', 'WHOOP', 'wait', '—'), row('meteo', '🌡️', 'Météo', 'wait', '—')], msg: x.reason || 'À valider à la main' };
}
let _avFin = null;
async function _avNowCall(){
  const u = typeof firebase !== 'undefined' && firebase.auth ? firebase.auth().currentUser : null;
  const tok = u ? await u.getIdToken() : '';
  const r = await fetch(FUNCTIONS_BASE + '/autoValidateNow', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok }, body: '{}' });
  return r.json();
}
function avFinish(){
  _avCss();
  const old = document.getElementById('av-fin'); if(old) old.remove();
  const mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'av-fin'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  ov.innerHTML = '<div class="modal-box" style="max-height:90vh;"><div class="av-head"><div><p class="av-eb">Séance terminée</p><p class="av-title">🏁 Je cherche tout</p><p class="av-sub">Strava, l\'entraînement WHOOP et la météo de ta sortie</p></div>'
    + '<button class="av-x" onclick="avFinishClose()" aria-label="Fermer">×</button></div><div class="modal-scroll-body" style="background:#F5F7FB;"><div id="av-fin-b" style="padding:14px 16px 22px;display:flex;flex-direction:column;gap:10px;"></div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) avFinishClose(); });
  mc.appendChild(ov);
  _avFin = { tries: 0, timer: null };
  _avFinRender(avNowView({ success: true, out: [] }), true);
  _avFinRun();
}
function avFinishClose(){ if(_avFin && _avFin.timer) clearInterval(_avFin.timer); _avFin = null; const ov = document.getElementById('av-fin'); if(ov) ov.remove(); }
async function _avFinRun(){
  if(!_avFin) return;
  _avFin.tries++;
  let r = null; try { r = await _avNowCall(); } catch(e) { r = { success: false, error: 'Connexion impossible' }; }
  if(!_avFin) return;
  const V = avNowView(r);
  if(V.phase === 'ok' && typeof apRefreshIfServerChanged === 'function') await apRefreshIfServerChanged();
  _avFinRender(V, false);
  if(V.phase === 'wait' && !/GPS/.test(V.msg) && _avFin.tries < 10){
    let left = 60; const el = function(){ return document.getElementById('av-fin-cd'); };
    if(_avFin.timer) clearInterval(_avFin.timer);
    _avFin.timer = setInterval(function(){ left--; const e = el(); if(e) e.textContent = left + ' s'; if(left <= 0){ clearInterval(_avFin.timer); _avFin.timer = null; _avFinRun(); } }, 1000);
  }
}
function _avFinRender(V, loading){
  const b = document.getElementById('av-fin-b'); if(!b) return;
  const ic = { ok: '✅', wait: loading ? '⏳' : '⏳', ko: '⛔' };
  let h = '<div class="av-rows">' + V.rows.map(function(x){ return '<div class="av-src ' + x.st + '"><span class="av-src-i">' + x.ico + '</span><b>' + x.lbl + '</b><span class="av-src-t">' + (loading ? 'recherche…' : prEsc(x.t || '')) + '</span><span class="av-src-s">' + ic[x.st] + '</span></div>'; }).join('') + '</div>';
  if(!loading) h += '<p class="av-msg ' + V.phase + '">' + prEsc(V.msg || '') + '</p>';
  if(V.phase === 'ok' || V.phase === 'done'){
    const pend = avPendingFeel().some(function(s){ return s.key === V.key; });
    h += pend ? '<button type="button" class="av-save" onclick="avFinishClose();avFeelOpen(\'' + V.key + '\')">Mon ressenti</button>' : '<button type="button" class="av-save" onclick="avFinishClose()">Fermer</button>';
  } else if(V.phase === 'wait' && !loading){
    h += /GPS/.test(V.msg) ? '<button type="button" class="av-save" onclick="avFinishClose();quickValidate()">Valider à la main</button>'
      : '<p class="av-note">Nouvel essai dans <b id="av-fin-cd">60 s</b> · tu peux fermer : je continue tout seul et je te préviens</p><button type="button" class="av-skip" onclick="avFinishClose();quickValidate()">Valider à la main maintenant</button>';
  } else if(!loading){
    h += '<button type="button" class="av-save" onclick="avFinishClose();quickValidate()">Valider à la main</button>' + (V.phase === 'off' ? '<button type="button" class="av-skip" onclick="avFinishClose();avOpenSettings()">Réactiver</button>' : '');
  }
  b.innerHTML = h;
}
