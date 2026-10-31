// Signaux du corps : zones FC recalées sur tes séances et signaux précoces de la foulée.
// hrEfMax() : plafond FC de l'endurance fondamentale (148 bpm par défaut, ou celui de tes zones recalées et appliquées).
// hrZonesEstimate(today) : FC max observée (Strava), FC au seuil (blocs ≥ 5 min des séances seuil/tempo, courses 10 km / semi)
//   → zones (Friel, % de la FC seuil) et nouveau plafond EF ; proposé dans Statistiques, appliqué en un geste (state._hr_zones).
// prStride(today) : FC à allure égale (corrigée de la chaleur) et cadence à allure comparable, 14 derniers jours vs 15-42 j avant :
//   une dégradation des deux est souvent un signe précoce de fatigue ou de blessure → vigilance, pas de hausse de volume.
// Gardés d'une prépa à l'autre (_hr_zones n'est pas dans _PREP_RESET). « Comparer mes prépas » garde 148 bpm (comparabilité).

const BS_EF_DEFAULT = 148;
function hrEfMax(st){
  st = st || (typeof state !== 'undefined' ? state : null);
  const z = st && st._hr_zones;
  return z && z.applied && z.efMax >= 120 && z.efMax <= 185 ? z.efMax : 148;   // littéral : appelable avant la fin du chargement du bundle
}
const _bsMed = function(a){ a = a.slice().sort(function(x, y){ return x - y; }); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null; };

// ─── Zones FC ───────────────────────────────────────────────────────────────
function hrZonesEstimate(today){
  today = today || prTodayIso();
  const log = prDoneLog(today).filter(function(x){ return prDays(x.date, today) <= 365; });
  // FC max observée : pic isolé (capteur) écarté s'il dépasse de plus de 4 bpm la 2e meilleure séance
  const maxes = log.map(function(x){ const v = parseInt(((x.s.perf || {}).strava || {}).fcMax) || 0; return v >= 120 && v <= 225 ? { v: v, date: x.date, t: x.s.title } : null; })
    .filter(Boolean).sort(function(a, b){ return b.v - a.v; });
  const fcMax = maxes.length ? (maxes.length > 1 && maxes[0].v - maxes[1].v > 4 ? maxes[1] : maxes[0]) : null;
  // FC au seuil (90 derniers jours)
  const thr = [];
  log.forEach(function(x){
    const s = x.s, st = (s.perf || {}).strava || {}, hr = parseInt(s.perf.hr);
    if(prDays(x.date, today) > 90) return;
    if(s.type === 'race' && hr){
      if(s.km >= 9.5 && s.km <= 10.6) thr.push({ v: hr, date: x.date, src: s.title + ' (10 km)' });             // 10 km couru à fond ≈ FC seuil
      else if(s.km >= 20.5 && s.km <= 21.7) thr.push({ v: hr / 0.97, date: x.date, src: s.title + ' (semi)' });  // semi ≈ 97 % de la FC seuil
      return;
    }
    if((typeof prIntent === 'function' ? prIntent(s) : null) !== 'T' || !st.laps) return;
    const lim = s.pace ? s.pace.hi + 10 : null;
    const blocks = st.laps.filter(function(l){ const p = prPaceSec(l.allure); return l.fc >= 100 && l.duree_sec >= 300 && p && (!lim || p <= lim); });
    if(!blocks.length) return;
    const dur = blocks.reduce(function(a, l){ return a + l.duree_sec; }, 0);
    // +2 bpm : sur un bloc de 6-10 min, la FC moyenne reste un peu sous la FC du seuil (montée progressive)
    thr.push({ v: blocks.reduce(function(a, l){ return a + l.fc * l.duree_sec; }, 0) / dur + 2, date: x.date, src: s.title });
  });
  const top = thr.map(function(t){ return t.v; }).sort(function(a, b){ return b - a; }).slice(0, 3);
  const lthr = top.length >= 2 ? Math.round(_bsMed(top)) : null;
  const declared = parseInt((typeof state !== 'undefined' && state && state.fc_max) || 0) || null;
  const cur = hrEfMax();
  let efMax = null, conf = null;
  if(lthr){ efMax = Math.round(lthr * 0.89); conf = 'seuil'; }                        // haut de la zone 2 (Friel)
  else if(fcMax && (!declared || fcMax.v > declared)){ efMax = Math.round(fcMax.v * 0.755); conf = 'fcmax'; }
  if(efMax) efMax = Math.max(cur - 8, Math.min(cur + 8, efMax));                     // ±8 bpm au plus par recalage
  const zones = lthr ? [
    { z: 1, t: 'Récupération', lo: null, hi: Math.round(lthr * 0.84) }, { z: 2, t: 'Endurance (EF)', lo: Math.round(lthr * 0.85), hi: Math.round(lthr * 0.89) },
    { z: 3, t: 'Tempo', lo: Math.round(lthr * 0.90), hi: Math.round(lthr * 0.94) }, { z: 4, t: 'Seuil', lo: Math.round(lthr * 0.95), hi: Math.round(lthr * 0.99) },
    { z: 5, t: 'VMA', lo: Math.round(lthr * 1.00), hi: fcMax ? fcMax.v : null }]
    : fcMax ? [
    { z: 1, t: 'Récupération', lo: null, hi: Math.round(fcMax.v * 0.70) }, { z: 2, t: 'Endurance (EF)', lo: Math.round(fcMax.v * 0.71), hi: Math.round(fcMax.v * 0.755) },
    { z: 3, t: 'Tempo', lo: Math.round(fcMax.v * 0.76), hi: Math.round(fcMax.v * 0.84) }, { z: 4, t: 'Seuil', lo: Math.round(fcMax.v * 0.85), hi: Math.round(fcMax.v * 0.91) },
    { z: 5, t: 'VMA', lo: Math.round(fcMax.v * 0.92), hi: fcMax.v }] : null;
  const propose = !!efMax && Math.abs(efMax - cur) >= 3 && (conf === 'seuil' || (fcMax && declared && fcMax.v > declared + 2));
  return { fcMax: fcMax, declared: declared, lthr: lthr, thr: thr.sort(function(a, b){ return b.date.localeCompare(a.date); }), efMax: efMax, cur: cur, conf: conf, zones: zones,
    propose: propose, raiseFcMax: !!(fcMax && declared && fcMax.v > declared + 2) };
}
function hrZonesApply(){
  const E = hrZonesEstimate(); if(!E.efMax) return;
  const z = { applied: true, at: prTodayIso(), efMax: E.efMax, lthr: E.lthr, fcMax: E.fcMax ? E.fcMax.v : null, prev: E.cur, conf: E.conf, zones: E.zones };
  const up = { _hr_zones: z }; state._hr_zones = z;
  if(E.raiseFcMax){ state.fc_max = String(E.fcMax.v); up.fc_max = state.fc_max; }
  if(typeof dbRef !== 'undefined' && dbRef) dbRef.update(up).catch(function(){});
  if(typeof showToast === 'function') showToast('Zones FC recalées : endurance jusqu\'à ' + E.efMax + ' bpm', '❤️');
  bsRefresh();
}
function hrZonesReset(){
  if(!state._hr_zones) return;
  state._hr_zones = Object.assign({}, state._hr_zones, { applied: false });
  if(typeof dbRef !== 'undefined' && dbRef) dbRef.child('_hr_zones').set(state._hr_zones).catch(function(){});
  if(typeof showToast === 'function') showToast('Plafond d\'endurance remis à ' + BS_EF_DEFAULT + ' bpm', '❤️');
  bsRefresh();
}

// ─── Signaux de la foulée ───────────────────────────────────────────────────
function prStride(today){
  today = today || prTodayIso();
  const runs = prDoneLog(today).filter(function(x){ const d = prDays(x.date, today); return (x.type === 'ef' || x.type === 'long') && d >= 0 && d <= 42 && !(typeof alcRunAffected === 'function' && alcRunAffected(x.date)); }).map(function(x){   // lendemain d'alcool : FC faussée
    const p = prPaceSec(x.s.perf.pace), hr = parseInt(x.s.perf.hr), cad = parseInt(((x.s.perf || {}).strava || {}).cadence) || null;
    if(!p || !hr || hr < 90 || p < 150 || p > 600) return null;
    const wx = typeof prWxAdjFromMeteo === 'function' ? prWxAdjFromMeteo(x.s.perf.meteo).pct : 0;   // chaleur : à effort égal tu cours plus lentement
    return { date: x.date, d: prDays(x.date, today), pace: p, hr: hr, cad: cad >= 120 && cad <= 230 ? cad : null, ei: 60000 / p * (1 + wx / 100) / hr };
  }).filter(Boolean);
  const rec = runs.filter(function(r){ return r.d <= 14; }), base = runs.filter(function(r){ return r.d > 14; });
  if(rec.length < 2 || base.length < 3) return null;
  const mean = function(a, f){ return a.reduce(function(s, r){ return s + f(r); }, 0) / a.length; };
  const eiB = mean(base, function(r){ return r.ei; }), eiR = mean(rec, function(r){ return r.ei; }), eiPct = (eiR - eiB) / eiB * 100;
  // cadence ramenée à une allure comparable (~1 pas/min de moins pour 8 s/km plus lent)
  const cb = base.filter(function(r){ return r.cad; }), cr = rec.filter(function(r){ return r.cad; });
  let cad = null;
  if(cb.length >= 3 && cr.length >= 2){
    const pB = mean(cb, function(r){ return r.pace; }), cB = mean(cb, function(r){ return r.cad; }), cR = mean(cr, function(r){ return r.cad + (r.pace - pB) / 8; });
    cad = { base: Math.round(cB), recent: Math.round(cR), diff: Math.round((cR - cB) * 10) / 10 };
  }
  let lvl = 0; const items = [];
  const hrUp = eiPct <= -4, cadDown = cad && cad.diff <= -3;
  if(hrUp) items.push('❤️ FC plus haute à allure égale : ' + Math.round(-eiPct) + ' % de battements en plus par km sur 14 jours (chaleur déduite).');
  else if(eiPct >= 4) items.push('✅ Efficacité en hausse : ' + Math.round(eiPct) + ' % de battements en moins par km à allure égale.');
  if(cadDown) items.push('👣 Cadence en baisse : ' + cad.recent + ' pas/min contre ' + cad.base + ' avant, à allure comparable.');
  if(eiPct <= -7 || (cad && cad.diff <= -5)) lvl = 2; else if(hrUp || cadDown) lvl = 1;
  if(hrUp && cadDown) lvl = 2;
  return { level: lvl, status: ['ok', 'watch', 'alert'][lvl], eiPct: Math.round(eiPct * 10) / 10, cad: cad, n: { recent: rec.length, base: base.length }, items: items,
    advice: lvl === 2 ? 'Signal précoce de fatigue ou de blessure : pas de hausse de volume, 2-3 jours faciles, sommeil, et surveille mollets / tibias.' : lvl === 1 ? 'À surveiller : si ça continue, allège quelques jours.' : '' };
}

// ─── Heure de coucher conseillée (même calcul que le serveur, helpers.js bedtimePlan) ───
// séance de demain (réveil 50 min avant si elle est le matin, sinon 7h), besoin de sommeil (_sleep_target_h, 8 h), moitié de la
// dette des 3 dernières nuits WHOOP (1 h au plus), +15 min avant une séance clé, 15 min pour s'endormir
function bsBedtime(today){
  today = today || prTodayIso();
  const tomorrow = prAddDays(today, 1), st = typeof prRealState === 'function' ? prRealState() : state;
  const sess = prSessions(st).filter(function(s){ return !s.done && !s.skip && s.type !== 'rest' && s.x && s.x.sched_date === tomorrow; })
    .sort(function(a, b){ return String(a.x.sched_time || '99').localeCompare(String(b.x.sched_time || '99')); });
  if(!sess.length) return null;
  const s = sess[0], tm = String(s.x.sched_time || '').match(/^(\d{1,2}):(\d{2})/), sm = tm ? +tm[1] * 60 + +tm[2] : null;
  const wake = sm != null && sm < 720 ? sm - 50 : 420, target = (parseFloat(st._sleep_target_h || state._sleep_target_h) || 8) * 60;
  const sleeps = ((state.whoop_data || {}).sleeps || []).filter(function(x){ return x && x.date && x.date <= today; }).slice(0, 3);
  const dur = function(t){ const m = String(t || '').match(/(\d+)h(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  const debt = sleeps.reduce(function(a, x){ const d = dur(x.duration_hours); return a + (d != null ? Math.max(0, target - d) : 0); }, 0);
  const extra = Math.min(60, Math.round(debt / 2 / 5) * 5), key = /tempo|frac|long|race/.test(s.type) ? 15 : 0;
  let bed = wake - target - extra - key - 15; if(bed < 0) bed += 1440;
  const hm = function(m){ return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0'); };
  return { bed: hm(bed), wake: hm(wake), session: s.title, time: tm ? hm(sm) : null, debtMin: Math.round(debt), extraMin: extra, key: !!key };
}
// ligne du soir sur la carte « Forme du jour » (à partir de 18h, la veille d'une séance)
function bsBedtimeLine(){
  try {
    if(new Date().getHours() < 18) return '';
    const B = bsBedtime(); if(!B) return '';
    _bsCss();
    const why = B.extraMin ? ' · +' + B.extraMin + ' min de rattrapage (dette ' + Math.floor(B.debtMin / 60) + 'h' + String(B.debtMin % 60).padStart(2, '0') + ')' : B.key ? ' · séance clé' : '';
    return '<div class="bs-bed"><span>🌙</span><div><b>Couche-toi vers ' + B.bed + '</b><small>Demain ' + (B.time ? B.time + ' · ' : '') + prEsc(B.session) + ' · réveil ' + B.wake + why + '</small></div></div>';
  } catch(e) { return ''; }
}

// ─── Affichage (Statistiques, accueil) ──────────────────────────────────────
function bsRefresh(){
  try { if(typeof rendered !== 'undefined'){ rendered.stats = false; rendered.plan = false; } } catch(e) {}
  bsRenderStatsCard(); try { if(typeof prRenderHomeCard === 'function') prRenderHomeCard(); } catch(e) {}
}
// ligne de la carte « Forme du jour » quand la foulée se dégrade
function bsHomeLine(){
  try {
    const S = prStride(); bsStoreSignal(S); if(!S || !S.level) return '';
    _bsCss();
    return '<button type="button" class="bs-home ' + S.status + '" onclick="showScreen(\'stats\')">' + (S.level === 2 ? '⚠️' : '👀') + ' <b>Foulée ' + (S.level === 2 ? 'à surveiller de près' : 'à surveiller') + '</b> · ' + prEsc(S.items[0].replace(/^\S+\s/, '')) + '</button>';
  } catch(e) { return ''; }
}
// signal mémorisé (une fois par jour ou s'il change) : le Coach le voit dans sa situation d'entraînement (helpers.js)
function bsStoreSignal(S){
  if(typeof _prepView !== 'undefined' && _prepView) return;
  const v = S && S.level ? { at: prTodayIso(), level: S.level, items: S.items } : null, old = state._body_signals || null;
  if(JSON.stringify(v && { l: v.level, i: v.items }) === JSON.stringify(old && { l: old.level, i: old.items }) && (!v || (old && old.at === v.at))) return;
  if(!v && !old) return;
  state._body_signals = v; if(typeof dbRef !== 'undefined' && dbRef) dbRef.child('_body_signals').set(v).catch(function(){});
}
let _bsPrefetched = false;
function bsRenderStatsCard(){
  const el = document.getElementById('bs-stats-card'); if(!el) return;
  const lv = document.getElementById('bs-level-card');   // onglet Forme : le niveau du moment, à part
  if(lv) lv.innerHTML = '';
  try {
    if((typeof usesHardPlan === 'function' && usesHardPlan()) || (typeof _prepView !== 'undefined' && _prepView && !_prepView.next)){ el.innerHTML = ''; return; }
    if(!_bsPrefetched && typeof prPrefetch === 'function'){ _bsPrefetched = true; prPrefetch().then(function(){ bsRenderStatsCard(); }); }   // dernière prépa : plus de recul
    _bsCss();
    const E = hrZonesEstimate(), S = prStride(), Z = state._hr_zones && state._hr_zones.applied ? state._hr_zones : null;
    const zp = bsZonePaces(), L = bsLevelNow();
    if(zp){ const zp7 = bsZonePaces(prAddDays(prTodayIso(), -7)); if(zp7) zp.prev = zp7.z; }
    let h = '<div class="bs-card"><p class="bs-t">🫀 Signaux du corps</p>';
    // niveau du moment : en tête de l'onglet Forme (sinon en tête de la carte), ouvre le graphique détaillé
    if(L && lv) lv.innerHTML = '<div class="bs-card bs-lv-only">' + bsLevelHtml(L) + '</div>';
    else if(L) h += bsLevelHtml(L);
    // foulée
    if(S && (S.level || S.items.length)){
      h += '<div class="bs-row ' + S.status + '"><p class="bs-h">' + (S.level === 2 ? '⚠️ Foulée : signal à prendre au sérieux' : S.level === 1 ? '👀 Foulée : à surveiller' : '✅ Foulée : en progrès') + '</p>'
        + '<ul>' + S.items.map(function(t){ return '<li>' + prEsc(t) + '</li>'; }).join('') + '</ul>'
        + (S.advice ? '<p class="bs-a">' + prEsc(S.advice) + '</p>' : '') + '</div>';
    } else if(S) h += '<p class="bs-line">✅ <b>Foulée : rien d\'anormal</b><span>FC et cadence stables · ' + S.n.recent + ' sorties récentes vs ' + S.n.base + '</span></p>';
    else h += '<p class="bs-line">👣 <b>Foulée</b><span>pas encore assez de sorties avec FC pour comparer</span></p>';
    // zones : recalées, sinon estimées, sinon d'après la FC max saisie ; sans FC du tout, allures seules
    const fm = parseInt(state.fc_max) || parseInt((state.onboarding || {}).fc_max) || null;
    const zs = bsDisplayZones((Z && Z.zones) || E.zones || (fm ? bsZonesFromMax(fm) : null), hrEfMax());
    h += '<div class="bs-row"><p class="bs-h">❤️ Zones FC et allures <span>EF ≤ <b>' + hrEfMax() + '</b> · ' + (Z ? 'recalée le ' + prFmtDate(Z.at) : 'par défaut') + '</span></p>';
    if(zs) h += bsZonesBar(zs, zp);
    else if(zp) h += bsZonesBar([1, 2, 3, 4, 5].map(function(i){ return { z: i, t: '', lo: null, hi: null }; }), zp);
    const src = [];
    if(E.lthr) src.push('FC seuil ~' + E.lthr + ' (' + E.thr.length + ' séance' + (E.thr.length > 1 ? 's' : '') + ')');
    if(E.fcMax) src.push('FC max ' + E.fcMax.v + ' (' + prFmtDate(E.fcMax.date) + ')' + (E.declared && E.declared !== E.fcMax.v ? ', saisie ' + E.declared : ''));
    const notes = [src.length ? src.join(' · ') : 'Valide des séances de seuil avec Strava (tours) pour recaler tes zones'];
    if(zp) notes.push('allures en min/km' + (zp.efObs ? ', EF d\'après tes sorties' : '') + (zp.arrows ? ' · ↑↓ depuis 7 jours' : ''));
    h += '<p class="bs-n">' + notes.join(' · ') + '</p>';
    if(E.propose) h += '<div class="bs-prop"><p>Nouveau plafond d\'endurance : <b>' + E.cur + ' → ' + E.efMax + ' bpm</b>' + (E.raiseFcMax ? ' · FC max ' + E.declared + ' → ' + E.fcMax.v : '') + '</p><p class="bs-n">Utilisé pour ton allure EF réelle, les conseils de validation et le Coach.</p><button type="button" class="bs-btn" onclick="hrZonesApply()">Appliquer</button></div>';
    else if(Z) h += '<button type="button" class="bs-link" onclick="hrZonesReset()">Revenir à ' + BS_EF_DEFAULT + ' bpm</button>';
    h += '</div>';
    // nettoyage des données : valeurs suspectes écartées des analyses
    const DQ = typeof dqIssues === 'function' ? dqIssues() : [], nx = DQ.filter(function(i){ return !i.kept && !i.info; }).length;
    if(DQ.length) h += '<button type="button" class="bs-dq" onclick="openDataQuality()">🧹 <span>' + (nx ? '<b>' + nx + ' valeur' + (nx > 1 ? 's' : '') + ' suspecte' + (nx > 1 ? 's' : '') + '</b> écartée' + (nx > 1 ? 's' : '') + ' des analyses' : 'Données vérifiées') + '</span><b class="go">Voir ›</b></button>';
    h += '</div>';
    el.innerHTML = h;
  } catch(e) { console.warn('[signaux] ', e); el.innerHTML = ''; }
}
function bsZonesFromMax(m){
  return [{ z: 1, hi: Math.round(m * 0.70) }, { z: 2, lo: Math.round(m * 0.71), hi: Math.round(m * 0.755) }, { z: 3, lo: Math.round(m * 0.76), hi: Math.round(m * 0.84) },
    { z: 4, lo: Math.round(m * 0.85), hi: Math.round(m * 0.91) }, { z: 5, lo: Math.round(m * 0.92), hi: m }].map(function(x){ return Object.assign({ t: '' }, x); });
}
// zones affichées : la Z2 s'arrête au plafond d'endurance utilisé par l'app (hrEfMax), bornes toujours croissantes
const BS_ZONE_SHORT = ['', 'Récup', 'EF', 'Tempo', 'Seuil', 'VMA'];
function bsDisplayZones(zs, ef){
  if(!zs || zs.length !== 5) return null;
  const z = zs.map(function(x){ return { z: x.z, t: x.t, lo: x.lo, hi: x.hi }; });
  if(ef){ z[1].hi = ef; z[0].hi = Math.min(z[0].hi, ef - 4); }
  for(let i = 1; i < 5; i++){
    z[i].lo = z[i - 1].hi + 1;
    if(z[i].hi == null) z[i].hi = z[i].lo + 12;
    if(z[i].hi < z[i].lo + 2) z[i].hi = z[i].lo + 2;
  }
  return z;
}
// ─── Niveau du moment : valeur, évolution sur 7 jours, courbe sur 6 mois ────
const _bsV = function(v){ return (Math.round(v * 10) / 10).toFixed(1).replace('.', ','); };
// niveau chaque semaine sur 26 semaines, calculé à chaque date comme aujourd'hui (même historique, filtré à la date)
function bsLevelHistory(today){
  today = today || prTodayIso();
  if(typeof prFitness !== 'function' || typeof prAllDone !== 'function') return [];
  const done = prAllDone(today), races = typeof prKnownRaces === 'function' ? prKnownRaces() : [], pts = [];
  for(let k = 26; k >= 0; k--){ const d = prAddDays(today, -7 * k), f = prFitness(state, { today: d, races: races, done: done }); if(f.vdot) pts.push({ date: d, v: f.vdot, why: f.why || [] }); }
  return pts;
}
// niveau aujourd'hui vs il y a 7 jours, avec la cause principale du changement
function bsLevelNow(today){
  try {
    today = today || prTodayIso();
    const H = bsLevelHistory(today); if(!H.length || H[H.length - 1].date !== today) return null;
    const now = H[H.length - 1], prev = H.length > 1 && H[H.length - 2].date === prAddDays(today, -7) ? H[H.length - 2] : null;
    const out = { v: now.v, why: now.why, hist: H, delta: prev ? Math.round((now.v - prev.v) * 10) / 10 : null, cause: '' };
    if(prev && Math.abs(out.delta) >= 0.1){
      const val = function(w, k){ const x = w.filter(function(y){ return y.k === k; })[0]; return x ? (x.base ? x.v : x.d) : 0; };
      const lab = { base: 1, qual: 1, miss: 1, gap: 1, ef: 1 };
      let best = null, bd = 0;
      Object.keys(lab).forEach(function(k){ const d = Math.abs(val(now.why, k) - val(prev.why, k)); if(d > bd){ bd = d; best = k; } });
      const it = function(w, k){ return w.filter(function(y){ return y.k === k; })[0]; };
      if(best === 'base'){ const nb = it(now.why, 'base'), pb = it(prev.why, 'base');
        out.cause = nb && pb && nb.t !== pb.t ? 'Nouvelle référence : ' + nb.t.split(' — ')[0] + '.' : 'Ta course de référence compte un peu moins : elle date.'; }
      else if(best === 'qual'){
        const q = typeof prAllDone === 'function' ? prAllDone(today).filter(function(s){ return (s.type === 'tempo' || s.type === 'frac') && prDays(s.date, today) <= 7; }).pop() : null;
        out.cause = q ? 'Grâce à ton ' + q.title + ' de ' + new Date(q.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long' }) + '.' : 'Tes séances de qualité récentes.';
      } else if(best === 'miss') out.cause = 'Séances de qualité sous l\'allure prévue.';
      else if(best === 'gap'){ const g = it(now.why, 'gap') || it(prev.why, 'gap'); out.cause = g ? g.t.charAt(0).toUpperCase() + g.t.slice(1) + '.' : 'Pause dans l\'entraînement.'; }
      else if(best === 'ef') out.cause = 'Ton endurance (allure à FC égale).';
    }
    return out;
  } catch(e) { return null; }
}
function bsLevelSpark(H, W, Hh){
  if(H.length < 3) return '';
  const vs = H.map(function(p){ return p.v; }), lo = Math.min.apply(null, vs) - 0.3, hi = Math.max.apply(null, vs) + 0.3;
  const X = function(i){ return 3 + i / (H.length - 1) * (W - 9); }, Y = function(v){ return 4 + (hi - v) / Math.max(0.6, hi - lo) * (Hh - 9); };
  const line = H.map(function(p, i){ return X(i).toFixed(1) + ',' + Y(p.v).toFixed(1); }).join(' ');
  return '<svg class="bs-spark" viewBox="0 0 ' + W + ' ' + Hh + '" preserveAspectRatio="none" aria-hidden="true">'
    + '<polygon points="' + X(0).toFixed(1) + ',' + Hh + ' ' + line + ' ' + X(H.length - 1).toFixed(1) + ',' + Hh + '" class="a"/><polyline points="' + line + '" class="l" vector-effect="non-scaling-stroke"/>'
    + '<circle cx="' + X(H.length - 1).toFixed(1) + '" cy="' + Y(H[H.length - 1].v).toFixed(1) + '" r="3.2" class="d"/></svg>';
}
// en-tête de la carte : niveau, évolution sur 7 jours et sa cause, courbe 6 mois — touche = graphique détaillé
function bsLevelHtml(L){
  const d = L.delta, chip = d == null || Math.abs(d) < 0.1 ? '<span class="bs-chip">stable cette semaine</span>'
    : '<span class="bs-chip ' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '▲ +' : '▼ −') + _bsV(Math.abs(d)) + ' cette semaine</span>';
  return '<button type="button" class="bs-hero" onclick="openLevelChart()" aria-label="Niveau du moment ' + _bsV(L.v) + ' : ouvrir le graphique détaillé">'
    + '<div class="bs-hero-top"><div><p class="bs-lvl-l">Niveau du moment</p><p class="bs-lvl-v">' + _bsV(L.v) + chip + '</p></div>'
    + '<div class="bs-hero-c">' + bsLevelSpark(L.hist, 140, 44) + '</div></div>'
    + '<div class="bs-hero-b"><span>' + prEsc(L.cause || 'Équivalent VDOT · recalculé après chaque séance') + '</span><b>Détail ›</b></div></button>';
}

// ─── Nettoyage des données : liste des valeurs suspectes ────────────────────
const DQ_KIND = { fcmax: 'FC max', hr: 'FC moyenne', pace: 'Allure', splits: 'Tours GPS', dup: 'Double validation' };
function openDataQuality(){
  _bsCss();
  let ov = document.getElementById('bs-dq');
  if(!ov){
    const mc = document.getElementById('modal-container'); ov = document.createElement('div');
    ov.className = 'modal-overlay'; ov.id = 'bs-dq'; ov.style.zIndex = '740'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.5)');
    ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
    mc.appendChild(ov);
  }
  const L = (typeof dqIssues === 'function' ? dqIssues() : []).slice().sort(function(a, b){ return b.date.localeCompare(a.date); });
  const row = function(i){
    const st = i.info ? '<span class="dq-st info">comptée une fois</span>' : i.kept ? '<span class="dq-st kept">gardée</span>' : '<span class="dq-st out">écartée</span>';
    const btns = (i.info ? '' : '<button type="button" class="dq-b" onclick="dqKeep(\'' + i.id + '\',' + (!i.kept) + ');openDataQuality();bsRenderStatsCard()">' + (i.kept ? 'Écarter' : 'Garder quand même') + '</button>')
      + (i.cur && i.w ? '<button type="button" class="dq-b sec" onclick="document.getElementById(\'bs-dq\').remove();openValidationModalExtra(' + i.w + ',' + i.ei + ')">Modifier la séance</button>' : '');
    return '<div class="dq-row"><div class="dq-top"><b>' + DQ_KIND[i.kind] + '</b>' + st + '</div><p class="dq-s">' + prFmtDate(i.date, { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + prEsc(i.title) + '</p>'
      + '<p class="dq-m">' + prEsc(i.msg) + '</p>' + (btns ? '<div class="dq-bs">' + btns + '</div>' : '') + '</div>';
  };
  ov.innerHTML = '<div class="modal-box" style="max-height:92vh;"><div class="lc-head" style="background:linear-gradient(135deg,#0F766E,#14B8A6);"><div><p class="lc-eb">Signaux du corps</p><p class="lc-title">🧹 Données vérifiées</p><p class="lc-sub">Les valeurs suspectes sont écartées des analyses (zones, niveau, foulée, prédiction, Coach) — seule la valeur fautive, pas la séance</p></div>'
    + '<button class="lc-x" onclick="document.getElementById(\'bs-dq\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body" style="background:#F5F7FB;"><div class="lc-body">' + (L.length ? L.map(row).join('') : '<p class="bs-n" style="text-align:center;padding:24px;">Rien de suspect dans tes séances.</p>') + '</div></div></div>';
}

// ─── Graphique détaillé du niveau (plein écran) ─────────────────────────────
let _lcRange = '6m', _lcData = null, _lcSel = null;
// série : un point tous les 2 jours (3 mois), 4 jours (6 mois) ou 7 jours (tout l'historique), même calcul qu'aujourd'hui à chaque date
function bsLevelSeries(range, today){
  today = today || prTodayIso();
  if(typeof prFitness !== 'function' || typeof prAllDone !== 'function') return null;
  const done = prAllDone(today), races = typeof prKnownRaces === 'function' ? prKnownRaces() : [];
  const first = done.length ? done[0].date : today;
  const span = range === '3m' ? 91 : range === '6m' ? 182 : Math.max(28, prDays(first, today));
  const step = span <= 100 ? 2 : span <= 200 ? 4 : 7, from = prAddDays(today, -span), pts = [];
  for(let d = 0; d <= span; d += step){
    const day = prAddDays(today, -span + d), f = prFitness(state, { today: day, races: races, done: done });
    if(f.vdot) pts.push({ date: day, v: f.vdot, why: f.why || [] });
  }
  if(!pts.length || pts[pts.length - 1].date !== today){ const f = prFitness(state, { today: today, races: races, done: done }); if(f.vdot) pts.push({ date: today, v: f.vdot, why: f.why || [] }); }
  // repères : courses / records / tests 5 km, séances de qualité avec blocs
  const fNow = prFitness(state, { today: today, races: races, done: done });
  const ev = (fNow.sources || []).filter(function(x){ return x.kind === 'course' && x.date && x.date >= from && x.date <= today; })
    .map(function(x){ return { date: x.date, kind: /^Test/.test(x.label) ? 'test' : 'race', label: x.label + ' ' + x.time }; });
  const qual = done.filter(function(s){ return (s.type === 'tempo' || s.type === 'frac') && s.date >= from && (s.perf.blocsAllure || []).some(Boolean); })
    .map(function(s){ return { date: s.date, kind: 'q', label: s.title }; });
  // l'axe commence au 1er niveau connu (pas de longue zone vide avant)
  // (en gardant la course qui a fait naître ce 1er niveau)
  let from2 = pts.length && pts[0].date > from ? pts[0].date : from;
  ev.forEach(function(e){ if(e.date >= from && e.date < from2) from2 = e.date; });
  return { pts: pts, from: from2, today: today, ev: ev.concat(qual).filter(function(e){ return e.date >= from2; }) };
}
function openLevelChart(range){
  _bsCss(); _lcRange = range || _lcRange;
  let ov = document.getElementById('bs-lc');
  if(!ov){
    const mc = document.getElementById('modal-container'); ov = document.createElement('div');
    ov.className = 'modal-overlay'; ov.id = 'bs-lc'; ov.style.zIndex = '740'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.5)');
    ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
    mc.appendChild(ov);
  }
  _lcData = bsLevelSeries(_lcRange); _lcSel = _lcData && _lcData.pts.length ? _lcData.pts.length - 1 : null;
  const seg = [['3m', '3 mois'], ['6m', '6 mois'], ['all', 'Tout']].map(function(r){ return '<button type="button" class="' + (r[0] === _lcRange ? 'on' : '') + '" onclick="openLevelChart(\'' + r[0] + '\')">' + r[1] + '</button>'; }).join('');
  ov.innerHTML = '<div class="modal-box" style="max-height:94vh;"><div class="lc-head"><div><p class="lc-eb">Signaux du corps</p><p class="lc-title">Niveau du moment</p><p class="lc-sub">Équivalent VDOT (Daniels) · recalculé à chaque séance validée</p></div>'
    + '<button class="lc-x" onclick="document.getElementById(\'bs-lc\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body" style="background:#F5F7FB;"><div class="lc-body"><div class="lc-seg">' + seg + '</div>'
    + '<div class="lc-chart" id="lc-chart"></div><p class="lc-leg"><span><i class="r"></i>course / record</span><span><i class="t"></i>test 5 km</span><span><i class="q"></i>séance de qualité</span></p>'
    + '<div id="lc-detail"></div></div></div></div>';
  _lcDraw(); _lcDetail();
}
function _lcDraw(){
  const el = document.getElementById('lc-chart'), D = _lcData; if(!el) return;
  if(!D || D.pts.length < 2){ el.innerHTML = '<p class="bs-n" style="padding:24px 8px;text-align:center;">Pas encore assez de données sur cette période.</p>'; return; }
  const W = 340, H = 230, L = 30, R = 10, T = 12, B = 34;
  const t0 = Date.parse(D.from + 'T12:00:00Z'), t1 = Date.parse(D.today + 'T12:00:00Z'), tx = function(d){ return L + (Date.parse(d + 'T12:00:00Z') - t0) / Math.max(1, t1 - t0) * (W - L - R); };
  const vs = D.pts.map(function(p){ return p.v; }), v0 = Math.floor(Math.min.apply(null, vs) - 0.5), v1 = Math.ceil(Math.max.apply(null, vs) + 0.5);
  const ty = function(v){ return T + (v1 - v) / Math.max(1, v1 - v0) * (H - T - B); };
  let g = '';
  const stepY = v1 - v0 > 6 ? 2 : 1;
  for(let v = v0; v <= v1; v += stepY) g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + ty(v) + '" y2="' + ty(v) + '" class="lc-grid"/><text x="' + (L - 6) + '" y="' + (ty(v) + 3.5) + '" class="lc-ax" text-anchor="end">' + v + '</text>';
  // mois
  const m = new Date(D.from + 'T12:00:00Z'); m.setUTCDate(1); m.setUTCMonth(m.getUTCMonth() + 1);
  const months = []; while(m.getTime() <= t1){ months.push(new Date(m)); m.setUTCMonth(m.getUTCMonth() + 1); }
  const every = Math.ceil(months.length / 6), xEnd = W - R;
  // bornes : date de début à gauche, « auj. » à droite ; mois entre les deux (sans chevauchement)
  g += '<text x="' + L + '" y="' + (H - B + 14) + '" class="lc-ax" text-anchor="start">' + prFmtDate(D.from) + '</text><text x="' + xEnd + '" y="' + (H - B + 14) + '" class="lc-ax" text-anchor="end">auj.</text>';
  months.forEach(function(d, i){ if(i % every) return; const iso = d.toISOString().slice(0, 10), x = tx(iso);
    if(x - L < 34 || xEnd - x < 26) return;
    g += '<line x1="' + x + '" x2="' + x + '" y1="' + T + '" y2="' + (H - B) + '" class="lc-grid v"/><text x="' + x + '" y="' + (H - B + 14) + '" class="lc-ax" text-anchor="middle">' + d.toLocaleDateString('fr-FR', { month: 'short' }) + '</text>'; });
  const line = D.pts.map(function(p){ return tx(p.date).toFixed(1) + ',' + ty(p.v).toFixed(1); }).join(' ');
  g += '<polygon points="' + tx(D.pts[0].date).toFixed(1) + ',' + (H - B) + ' ' + line + ' ' + tx(D.pts[D.pts.length - 1].date).toFixed(1) + ',' + (H - B) + '" class="lc-area"/>';
  g += '<polyline points="' + line + '" class="lc-line"/>';
  // repères : séances de qualité (piste du bas), courses et tests (sur la courbe)
  const yAt = function(d){ let best = D.pts[0]; D.pts.forEach(function(p){ if(Math.abs(Date.parse(p.date) - Date.parse(d)) < Math.abs(Date.parse(best.date) - Date.parse(d))) best = p; }); return ty(best.v); };
  D.ev.forEach(function(e){
    const x = tx(e.date);
    if(e.kind === 'q') g += '<circle cx="' + x.toFixed(1) + '" cy="' + (H - B + 24) + '" r="2.6" class="lc-q"><title>' + prEsc(e.label) + ' · ' + prFmtDate(e.date) + '</title></circle>';
    else g += '<rect x="' + (x - 4.5).toFixed(1) + '" y="' + (yAt(e.date) - 4.5).toFixed(1) + '" width="9" height="9" rx="2" transform="rotate(45 ' + x.toFixed(1) + ' ' + yAt(e.date).toFixed(1) + ')" class="lc-' + (e.kind === 'test' ? 't' : 'r') + '"><title>' + prEsc(e.label) + ' · ' + prFmtDate(e.date) + '</title></rect>';
  });
  // point sélectionné
  const sp = D.pts[_lcSel];
  g += '<line id="lc-cur" x1="' + tx(sp.date) + '" x2="' + tx(sp.date) + '" y1="' + T + '" y2="' + (H - B) + '" class="lc-cur"/><circle id="lc-dot" cx="' + tx(sp.date) + '" cy="' + ty(sp.v) + '" r="5" class="lc-dot"/>';
  el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="lc-svg" role="img" aria-label="Niveau du ' + prFmtDate(D.pts[0].date) + ' au ' + prFmtDate(D.today) + ' : de ' + _bsV(D.pts[0].v) + ' à ' + _bsV(D.pts[D.pts.length - 1].v) + '">' + g + '</svg>';
  const svg = el.querySelector('svg');
  const pick = function(ev){
    const r = svg.getBoundingClientRect(), cx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) / r.width * W;
    let bi = 0, bd = 1e9; D.pts.forEach(function(p, i){ const dd = Math.abs(tx(p.date) - cx); if(dd < bd){ bd = dd; bi = i; } });
    if(bi === _lcSel) return;
    _lcSel = bi; const p = D.pts[bi], x = tx(p.date).toFixed(1);
    const cur = svg.querySelector('#lc-cur'), dot = svg.querySelector('#lc-dot');
    cur.setAttribute('x1', x); cur.setAttribute('x2', x); dot.setAttribute('cx', x); dot.setAttribute('cy', ty(p.v).toFixed(1));
    _lcDetail();
  };
  svg.style.touchAction = 'pan-y';
  svg.addEventListener('pointerdown', pick); svg.addEventListener('pointermove', function(e){ if(e.buttons || e.pointerType === 'mouse') pick(e); });
}
function _lcDetail(){
  const el = document.getElementById('lc-detail'), D = _lcData; if(!el || !D || _lcSel == null || !D.pts[_lcSel]) { if(el) el.innerHTML = ''; return; }
  const p = D.pts[_lcSel], prev = _lcSel > 0 ? D.pts[_lcSel - 1] : null, d = prev ? Math.round((p.v - prev.v) * 10) / 10 : null;
  const isToday = p.date === D.today;
  const eq = typeof PR_RACE_M !== 'undefined' ? ['5 km', '10 km', 'Semi-marathon', 'Marathon'].filter(function(c){ return PR_RACE_M[c]; }).map(function(c){ return '<div><span>' + (c === 'Semi-marathon' ? 'Semi' : c) + '</span><b>' + prTime(raceTimeFromVdot(p.v, PR_RACE_M[c])) + '</b></div>'; }).join('') : '';
  el.innerHTML = '<div class="lc-card"><div class="lc-dh"><div><p class="lc-dd">' + (isToday ? 'Aujourd\'hui' : (function(t){ return t.charAt(0).toUpperCase() + t.slice(1); })(prFmtDate(p.date, { weekday: 'long', day: 'numeric', month: 'long' }))) + '</p>'
    + '<p class="lc-dv">' + _bsV(p.v) + (d != null && Math.abs(d) >= 0.1 ? '<span class="bs-chip ' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '▲ +' : '▼ −') + _bsV(Math.abs(d)) + '</span>' : '') + '</p></div>'
    + '<p class="lc-hint">Touche la courbe pour voir une autre date</p></div>'
    + (p.why.length ? '<p class="lc-sec">Ce qui fait ce niveau</p><ul class="lc-why">' + p.why.map(function(w){ return '<li><span>' + prEsc(w.t) + '</span><b class="' + (w.base ? '' : w.d > 0 ? 'up' : 'down') + '">' + (w.base ? _bsV(w.v) : (w.d > 0 ? '+' : '−') + _bsV(Math.abs(w.d))) + '</b></li>'; }).join('') + '</ul>' : '')
    + (eq ? '<p class="lc-sec">Temps équivalents à ce niveau</p><div class="lc-eq">' + eq + '</div>' : '') + '</div>';
}

// allures de chaque zone (s/km, lo = la plus rapide) d'après le niveau actuel (prFitness, tout l'historique) :
// Z2 = ton allure EF réelle (prObservedEf) si connue, sinon l'EF Daniels ; Z3 tempo ≈ allure marathon-semi ; Z4 seuil (T) ; Z5 VMA (I)
function bsZonePaces(today){
  try {
    today = today || prTodayIso();
    const f = typeof prFitness === 'function' ? prFitness(state, { today: today, races: typeof prKnownRaces === 'function' ? prKnownRaces() : [] }) : null;
    const efObs = typeof prObservedEf === 'function' ? prObservedEf(state, today) : null;
    const v = f && f.vdot, at = function(p){ return Math.round(paceAtPct(v, p)); };
    if(!v && !efObs) return null;
    const z2 = efObs ? { lo: efObs - 10, hi: efObs + 15 } : { lo: at(0.70), hi: at(0.62) };
    // plages continues, comme les FC : chaque zone s'arrête là où commence la plus lente (pas de trou entre l'EF et le tempo,
    // où tombe l'allure marathon réelle) ; Z1 = plus lent que l'EF, Z5 = plus rapide que le seuil
    let z3 = null, z4 = null, z5 = null;
    if(v){
      const t3 = Math.min(at(0.84), z2.lo - 2), t4 = Math.min(at(0.90), t3 - 2);
      z3 = { z: 3, lo: t3, hi: z2.lo - 1 }; z4 = { z: 4, lo: t4, hi: t3 - 1 }; z5 = { z: 5, lo: null, hi: t4 - 1 };
    }
    return { vdot: v || null, efObs: efObs || null, z: [{ z: 1, lo: z2.hi + 1, hi: null }, { z: 2, lo: z2.lo, hi: z2.hi }, z3, z4, z5] };
  } catch(e) { return null; }
}
const _bsP = function(s){ return Math.floor(s / 60) + '\'' + String(Math.round(s % 60)).padStart(2, '0'); };
// une seule barre : largeur de chaque zone ∝ sa plage de bpm, bornes sous les jonctions ; allures en dessous (zp)
function bsZonesBar(z, zp){
  const bpm = z.every(function(x){ return x.hi != null; });
  const w = z.map(function(x, i){ return !bpm ? 1 : Math.max(9, i === 0 ? 18 : x.hi - x.lo + 1); }), tot = w.reduce(function(a, b){ return a + b; }, 0);
  let acc = 0;
  const ticks = z.map(function(x, i){ acc += w[i]; return '<i style="left:' + (acc / tot * 100).toFixed(2) + '%"' + (i === 4 ? ' class="end"' : '') + '>' + x.hi + '</i>'; }).join('');
  const pace = zp ? '<div class="bs-paces">' + z.map(function(x, i){
    const p = zp.z[i];
    let t;
    // flèche : allure de la zone plus rapide (↑) ou plus lente (↓) qu'il y a 7 jours
    const q = zp.prev && zp.prev[i], ref = function(o){ return o ? (o.lo != null ? o.lo : o.hi) : null; }, dv = p && q ? ref(p) - ref(q) : 0;
    if(Math.abs(dv) >= 2) zp.arrows = true;
    const arr = Math.abs(dv) >= 2 ? '<i class="bs-arr ' + (dv < 0 ? 'up' : 'down') + '" title="' + (dv < 0 ? 'plus rapide' : 'plus lente') + ' de ' + Math.abs(Math.round(dv)) + ' s/km qu\'il y a 7 jours">' + (dv < 0 ? '↑' : '↓') + '</i>' : '';
    t = !p ? '—' : p.hi == null ? '<span>' + arr + '&gt; ' + _bsP(p.lo) + '</span>' : p.lo == null ? '<span>' + arr + '&lt; ' + _bsP(p.hi + 1) + '</span>' : '<b>' + arr + _bsP(p.lo) + '</b><b>' + _bsP(p.hi) + '</b>';
    return '<div class="z' + x.z + '" style="flex:' + w[i] + ' 1 0">' + t + '</div>'; }).join('') + '</div>' : '';
  return '<div class="bs-bar">' + z.map(function(x, i){ return '<div class="bs-s z' + x.z + '" style="flex:' + w[i] + ' 1 0" title="' + (bpm ? prEsc(x.t) + ' : ' + (i ? x.lo + '–' : '< ') + x.hi + ' bpm' : BS_ZONE_SHORT[x.z]) + '"><b>Z' + x.z + '</b><span>' + BS_ZONE_SHORT[x.z] + '</span></div>'; }).join('') + '</div>'
    + (bpm ? '<div class="bs-ticks">' + ticks + '</div>' : '') + pace;
}
function _bsCss(){
  if(document.getElementById('bs-css')) return;
  const st = document.createElement('style'); st.id = 'bs-css';
  st.textContent = '.bs-card.bs-lv-only{padding:0;background:none;border:none;box-shadow:none;}.bs-card{background:#fff;border-radius:18px;padding:14px;margin-bottom:14px;box-shadow:0 1px 3px rgba(15,23,42,.06);border:1px solid #E2E8F0;display:flex;flex-direction:column;gap:10px;}'
    + '.bs-t{font-size:15px;font-weight:800;color:#0F172A;margin:0;}.bs-row{border-radius:12px;background:#F8FAFC;padding:10px 12px;}.bs-row.watch{background:#FFFBEB;}.bs-row.alert{background:#FEF2F2;}'
    + '.bs-h{font-size:13px;font-weight:800;color:#1E293B;margin:0 0 4px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;}.bs-h span{font-weight:600;color:#64748B;font-size:12px;}'
    + '.bs-row ul{margin:2px 0 0;padding-left:18px;font-size:12.5px;color:#334155;line-height:1.45;}.bs-n{font-size:11.5px;color:#64748B;margin:4px 0 0;line-height:1.4;}.bs-a{font-size:12px;font-weight:700;color:#9A3412;margin:6px 0 0;}'
    + '.bs-line{margin:0;font-size:12.5px;color:#1E293B;display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 6px;padding:0 2px;}.bs-line span{font-size:11.5px;color:#64748B;}'
    + '.bs-bar{display:flex;gap:2px;margin-top:8px;border-radius:10px;overflow:hidden;}.bs-s{min-width:0;padding:6px 2px;text-align:center;display:flex;flex-direction:column;line-height:1.1;}'
    + '.bs-s b{font-size:11.5px;}.bs-s span{font-size:9.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.bs-s.z1{background:#E0F2FE;color:#075985;}.bs-s.z2{background:#BBF7D0;color:#14532D;}.bs-s.z3{background:#FEF08A;color:#713F12;}.bs-s.z4{background:#FED7AA;color:#9A3412;}.bs-s.z5{background:#FECACA;color:#991B1B;}'
    + '.bs-paces{display:flex;gap:2px;margin-top:6px;font-variant-numeric:tabular-nums;}.bs-paces>div{min-width:0;text-align:center;font-size:10.5px;font-weight:700;color:#64748B;line-height:1.25;display:flex;flex-direction:column;border-top:2px solid;padding-top:3px;}'
    + '.bs-paces b{font-weight:800;color:#1E293B;}.bs-paces>div.z1{border-color:#BAE6FD;}.bs-paces>div.z2{border-color:#86EFAC;}.bs-paces>div.z3{border-color:#FDE047;}.bs-paces>div.z4{border-color:#FDBA74;}.bs-paces>div.z5{border-color:#FCA5A5;}'
    + '.bs-lvl{display:flex;justify-content:space-between;align-items:flex-end;gap:10px;margin:6px 0 4px;}.bs-lvl-l{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#64748B;margin:0;}'
    + '.bs-lvl-v{font-size:26px;font-weight:900;color:#0F172A;margin:0;display:flex;align-items:center;gap:8px;font-variant-numeric:tabular-nums;letter-spacing:-.01em;}'
    + '.bs-chip{font-size:11px;font-weight:800;border-radius:20px;padding:3px 8px;white-space:nowrap;background:#E2E8F0;color:#475569;letter-spacing:0;}.bs-chip.up{background:#DCFCE7;color:#15803D;}.bs-chip.down{background:#FFEDD5;color:#C2410C;}'
    + '.bs-lvl-c{display:flex;flex-direction:column;align-items:flex-end;flex-shrink:1;min-width:0;}.bs-lvl>div:first-child{min-width:0;}.bs-lvl-c span{font-size:9.5px;color:#94A3B8;font-weight:700;}.bs-spark{width:110px;max-width:100%;height:34px;overflow:visible;}.bs-spark .a{fill:#6366F1;opacity:.12;}.bs-spark .l{fill:none;stroke:#6366F1;stroke-width:1.8;stroke-linejoin:round;stroke-linecap:round;}.bs-spark .d{fill:#4F46E5;}'
    + '.bs-hero{display:block;width:100%;text-align:left;border:1px solid #E0E7FF;border-radius:16px;padding:12px 14px 10px;background:linear-gradient(135deg,#EEF2FF 0%,#F8FAFF 70%);cursor:pointer;font-family:inherit;color:inherit;}'
    + '.bs-hero:active{transform:scale(.99);}.bs-hero:focus-visible{outline:2px solid #6366F1;outline-offset:2px;}'
    + '.bs-hero-top{display:flex;justify-content:space-between;align-items:center;gap:10px;}.bs-hero-top>div:first-child{min-width:0;}.bs-hero-c{flex:1;max-width:150px;min-width:90px;}.bs-hero-c .bs-spark{width:100%;height:44px;}'
    + '.bs-hero-b{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:6px;font-size:12px;color:#475569;}.bs-hero-b b{color:#4F46E5;font-weight:800;white-space:nowrap;}'
    + '.lc-head{flex-shrink:0;color:#fff;padding:16px;border-radius:24px 24px 0 0;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;background:linear-gradient(135deg,#312E81,#4F46E5);}'
    + '.lc-eb{font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;opacity:.75;margin:0;}.lc-title{font-size:20px;font-weight:900;margin:2px 0;}.lc-sub{font-size:12px;opacity:.85;margin:0;}'
    + '.lc-x{background:rgba(255,255,255,.18);border:none;color:#fff;width:34px;height:34px;border-radius:50%;font-size:20px;cursor:pointer;flex-shrink:0;}'
    + '.lc-body{padding:14px 14px 24px;display:flex;flex-direction:column;gap:10px;}.lc-seg{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;background:#E2E8F0;border-radius:12px;padding:3px;}'
    + '.lc-seg button{border:none;background:transparent;border-radius:9px;padding:8px;font-size:13px;font-weight:700;color:#475569;cursor:pointer;font-family:inherit;}.lc-seg button.on{background:#fff;color:#312E81;box-shadow:0 1px 3px rgba(15,23,42,.15);}'
    + '.lc-chart{background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:8px 6px 4px;}.lc-svg{width:100%;height:auto;display:block;user-select:none;-webkit-user-select:none;}'
    + '.lc-grid{stroke:#EEF2F7;stroke-width:1;}.lc-grid.v{stroke-dasharray:2 3;}.lc-ax{font-size:9.5px;fill:#94A3B8;font-weight:600;font-variant-numeric:tabular-nums;}'
    + '.lc-area{fill:#6366F1;opacity:.10;}.lc-line{fill:none;stroke:#4F46E5;stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round;}'
    + '.lc-r{fill:#F59E0B;stroke:#fff;stroke-width:1.5;}.lc-t{fill:#10B981;stroke:#fff;stroke-width:1.5;}.lc-q{fill:#A5B4FC;}'
    + '.lc-cur{stroke:#312E81;stroke-width:1;stroke-dasharray:3 3;opacity:.6;}.lc-dot{fill:#fff;stroke:#4F46E5;stroke-width:3;}'
    + '.lc-leg{display:flex;flex-wrap:wrap;gap:12px;font-size:11px;color:#64748B;margin:0 2px;}.lc-leg i{display:inline-block;width:8px;height:8px;margin-right:5px;vertical-align:middle;}'
    + '.lc-leg i.r{background:#F59E0B;transform:rotate(45deg);border-radius:2px;}.lc-leg i.t{background:#10B981;transform:rotate(45deg);border-radius:2px;}.lc-leg i.q{background:#A5B4FC;border-radius:50%;}'
    + '.lc-card{background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:12px 14px;}.lc-dh{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;}'
    + '.lc-dd{font-size:12px;font-weight:800;color:#64748B;margin:0;}.lc-dv{font-size:30px;font-weight:900;color:#0F172A;margin:0;display:flex;align-items:center;gap:8px;font-variant-numeric:tabular-nums;}'
    + '.lc-hint{font-size:10.5px;color:#94A3B8;margin:2px 0 0;text-align:right;max-width:110px;}'
    + '.lc-sec{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#64748B;margin:12px 0 6px;}'
    + '.lc-why{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:5px;}.lc-why li{display:flex;justify-content:space-between;gap:10px;font-size:12.5px;color:#334155;line-height:1.35;}'
    + '.lc-why b{font-variant-numeric:tabular-nums;color:#0F172A;white-space:nowrap;}.lc-why b.up{color:#15803D;}.lc-why b.down{color:#C2410C;}'
    + '.lc-eq{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;}.lc-eq div{background:#F8FAFC;border-radius:10px;padding:7px 4px;text-align:center;display:flex;flex-direction:column;gap:2px;}'
    + '.lc-eq span{font-size:10.5px;color:#64748B;font-weight:700;}.lc-eq b{font-size:13px;color:#0F172A;font-variant-numeric:tabular-nums;}'
    + '.bs-bed{display:flex;gap:10px;align-items:center;margin-top:8px;border-radius:12px;padding:9px 12px;background:linear-gradient(90deg,#1E1B4B,#312E81);color:#E0E7FF;}.bs-bed>span{font-size:20px;}.bs-bed b{display:block;font-size:13.5px;color:#fff;}.bs-bed small{font-size:11.5px;opacity:.85;line-height:1.35;}'
    + '.bs-dq{display:flex;width:100%;align-items:center;gap:8px;text-align:left;border:1px solid #CCFBF1;background:#F0FDFA;color:#134E4A;border-radius:12px;padding:9px 12px;font-size:12.5px;cursor:pointer;font-family:inherit;}.bs-dq span{flex:1;}.bs-dq .go{color:#0F766E;white-space:nowrap;}'
    + '.dq-row{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:11px 12px;}.dq-top{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px;color:#0F172A;}'
    + '.dq-st{font-size:10.5px;font-weight:800;border-radius:20px;padding:2px 8px;}.dq-st.out{background:#FFEDD5;color:#C2410C;}.dq-st.kept{background:#DCFCE7;color:#15803D;}.dq-st.info{background:#E0E7FF;color:#3730A3;}'
    + '.dq-s{font-size:11.5px;color:#64748B;margin:2px 0 0;}.dq-m{font-size:12.5px;color:#334155;margin:5px 0 0;line-height:1.4;}.dq-bs{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;}'
    + '.dq-b{border:1.5px solid #99F6E4;background:#fff;color:#0F766E;border-radius:10px;padding:6px 10px;font-size:12px;font-weight:800;cursor:pointer;font-family:inherit;}.dq-b.sec{border-color:#E2E8F0;color:#475569;}'
    + '.bs-arr{font-style:normal;font-size:11px;font-weight:900;line-height:1;margin-right:2px;}.bs-arr.up{color:#16A34A;}.bs-arr.down{color:#EA580C;}'
    + '.bs-why{margin-top:6px;}.bs-why summary{font-size:11.5px;font-weight:700;color:#4F46E5;cursor:pointer;}.bs-why ul{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:3px;}'
    + '.bs-why li{display:flex;justify-content:space-between;gap:8px;font-size:11.5px;color:#475569;}.bs-why li b{font-variant-numeric:tabular-nums;color:#0F172A;}'
    + '.bs-ticks{position:relative;height:15px;margin-top:3px;font-variant-numeric:tabular-nums;}.bs-ticks i{position:absolute;top:0;transform:translateX(-50%);font-style:normal;font-size:10.5px;font-weight:800;color:#475569;}.bs-ticks i.end{transform:translateX(-100%);}'
    + '.bs-prop{margin-top:8px;border:1.5px solid #BBF7D0;background:#F0FDF4;border-radius:12px;padding:10px;}.bs-prop p{margin:0;font-size:13px;color:#14532D;}.bs-btn{margin-top:8px;width:100%;padding:10px;border:none;border-radius:11px;background:#16A34A;color:#fff;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;}'
    + '.bs-link{margin-top:6px;background:none;border:none;color:#64748B;font-size:12px;text-decoration:underline;cursor:pointer;padding:0;font-family:inherit;}'
    + '.bs-home{display:block;width:100%;text-align:left;margin-top:8px;border-radius:12px;padding:9px 12px;font-size:12.5px;border:1px solid #FDE68A;background:#FFFBEB;color:#78350F;cursor:pointer;font-family:inherit;line-height:1.35;}.bs-home.alert{border-color:#FECACA;background:#FEF2F2;color:#991B1B;}';
  document.head.appendChild(st);
}
