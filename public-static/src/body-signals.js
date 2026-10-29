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
  const runs = prDoneLog(today).filter(function(x){ const d = prDays(x.date, today); return (x.type === 'ef' || x.type === 'long') && d >= 0 && d <= 42; }).map(function(x){
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
  try {
    if((typeof usesHardPlan === 'function' && usesHardPlan()) || (typeof _prepView !== 'undefined' && _prepView && !_prepView.next)){ el.innerHTML = ''; return; }
    if(!_bsPrefetched && typeof prPrefetch === 'function'){ _bsPrefetched = true; prPrefetch().then(function(){ bsRenderStatsCard(); }); }   // dernière prépa : plus de recul
    _bsCss();
    const E = hrZonesEstimate(), S = prStride(), Z = state._hr_zones && state._hr_zones.applied ? state._hr_zones : null;
    let h = '<div class="bs-card"><p class="bs-t">🫀 Signaux du corps</p>';
    // foulée
    if(S && (S.level || S.items.length)){
      h += '<div class="bs-row ' + S.status + '"><p class="bs-h">' + (S.level === 2 ? '⚠️ Foulée : signal à prendre au sérieux' : S.level === 1 ? '👀 Foulée : à surveiller' : '✅ Foulée : en progrès') + '</p>'
        + '<ul>' + S.items.map(function(t){ return '<li>' + prEsc(t) + '</li>'; }).join('') + '</ul>'
        + (S.advice ? '<p class="bs-a">' + prEsc(S.advice) + '</p>' : '') + '</div>';
    } else if(S) h += '<p class="bs-line">✅ <b>Foulée : rien d\'anormal</b><span>FC et cadence stables · ' + S.n.recent + ' sorties récentes vs ' + S.n.base + '</span></p>';
    else h += '<p class="bs-line">👣 <b>Foulée</b><span>pas encore assez de sorties avec FC pour comparer</span></p>';
    // zones
    const zs = bsDisplayZones((Z && Z.zones) || E.zones, hrEfMax());
    h += '<div class="bs-row"><p class="bs-h">❤️ Zones FC <span>EF ≤ <b>' + hrEfMax() + '</b> · ' + (Z ? 'recalée le ' + prFmtDate(Z.at) : 'par défaut') + '</span></p>';
    if(zs) h += bsZonesBar(zs);
    const src = [];
    if(E.lthr) src.push('FC seuil ~' + E.lthr + ' (' + E.thr.length + ' séance' + (E.thr.length > 1 ? 's' : '') + ')');
    if(E.fcMax) src.push('FC max ' + E.fcMax.v + ' (' + prFmtDate(E.fcMax.date) + ')' + (E.declared && E.declared !== E.fcMax.v ? ' · saisie ' + E.declared : ''));
    h += '<p class="bs-n">' + (src.length ? 'D\'après ' + src.join(' · ') : 'Valide des séances de seuil avec Strava (tours) pour recaler tes zones') + '</p>';
    if(E.propose) h += '<div class="bs-prop"><p>Nouveau plafond d\'endurance : <b>' + E.cur + ' → ' + E.efMax + ' bpm</b>' + (E.raiseFcMax ? ' · FC max ' + E.declared + ' → ' + E.fcMax.v : '') + '</p><p class="bs-n">Utilisé pour ton allure EF réelle, les conseils de validation et le Coach.</p><button type="button" class="bs-btn" onclick="hrZonesApply()">Appliquer</button></div>';
    else if(Z) h += '<button type="button" class="bs-link" onclick="hrZonesReset()">Revenir à ' + BS_EF_DEFAULT + ' bpm</button>';
    h += '</div></div>';
    el.innerHTML = h;
  } catch(e) { console.warn('[signaux] ', e); el.innerHTML = ''; }
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
// une seule barre : largeur de chaque zone ∝ sa plage de bpm, bornes sous les jonctions
function bsZonesBar(z){
  const w = z.map(function(x, i){ return Math.max(9, i === 0 ? 18 : x.hi - x.lo + 1); }), tot = w.reduce(function(a, b){ return a + b; }, 0);
  let acc = 0;
  const ticks = z.map(function(x, i){ acc += w[i]; return '<i style="left:' + (acc / tot * 100).toFixed(2) + '%"' + (i === 4 ? ' class="end"' : '') + '>' + x.hi + '</i>'; }).join('');
  return '<div class="bs-bar">' + z.map(function(x, i){ return '<div class="bs-s z' + x.z + '" style="flex:' + w[i] + ' 1 0" title="' + prEsc(x.t) + ' : ' + (i ? x.lo + '–' : '< ') + x.hi + ' bpm"><b>Z' + x.z + '</b><span>' + BS_ZONE_SHORT[x.z] + '</span></div>'; }).join('') + '</div>'
    + '<div class="bs-ticks">' + ticks + '</div>';
}
function _bsCss(){
  if(document.getElementById('bs-css')) return;
  const st = document.createElement('style'); st.id = 'bs-css';
  st.textContent = '.bs-card{background:#fff;border-radius:18px;padding:14px;margin-bottom:14px;box-shadow:0 1px 3px rgba(15,23,42,.06);border:1px solid #E2E8F0;display:flex;flex-direction:column;gap:10px;}'
    + '.bs-t{font-size:15px;font-weight:800;color:#0F172A;margin:0;}.bs-row{border-radius:12px;background:#F8FAFC;padding:10px 12px;}.bs-row.watch{background:#FFFBEB;}.bs-row.alert{background:#FEF2F2;}'
    + '.bs-h{font-size:13px;font-weight:800;color:#1E293B;margin:0 0 4px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;}.bs-h span{font-weight:600;color:#64748B;font-size:12px;}'
    + '.bs-row ul{margin:2px 0 0;padding-left:18px;font-size:12.5px;color:#334155;line-height:1.45;}.bs-n{font-size:11.5px;color:#64748B;margin:4px 0 0;line-height:1.4;}.bs-a{font-size:12px;font-weight:700;color:#9A3412;margin:6px 0 0;}'
    + '.bs-line{margin:0;font-size:12.5px;color:#1E293B;display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 6px;padding:0 2px;}.bs-line span{font-size:11.5px;color:#64748B;}'
    + '.bs-bar{display:flex;gap:2px;margin-top:8px;border-radius:10px;overflow:hidden;}.bs-s{min-width:0;padding:6px 2px;text-align:center;display:flex;flex-direction:column;line-height:1.1;}'
    + '.bs-s b{font-size:11.5px;}.bs-s span{font-size:9.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.bs-s.z1{background:#E0F2FE;color:#075985;}.bs-s.z2{background:#BBF7D0;color:#14532D;}.bs-s.z3{background:#FEF08A;color:#713F12;}.bs-s.z4{background:#FED7AA;color:#9A3412;}.bs-s.z5{background:#FECACA;color:#991B1B;}'
    + '.bs-ticks{position:relative;height:15px;margin-top:3px;font-variant-numeric:tabular-nums;}.bs-ticks i{position:absolute;top:0;transform:translateX(-50%);font-style:normal;font-size:10.5px;font-weight:800;color:#475569;}.bs-ticks i.end{transform:translateX(-100%);}'
    + '.bs-prop{margin-top:8px;border:1.5px solid #BBF7D0;background:#F0FDF4;border-radius:12px;padding:10px;}.bs-prop p{margin:0;font-size:13px;color:#14532D;}.bs-btn{margin-top:8px;width:100%;padding:10px;border:none;border-radius:11px;background:#16A34A;color:#fff;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;}'
    + '.bs-link{margin-top:6px;background:none;border:none;color:#64748B;font-size:12px;text-decoration:underline;cursor:pointer;padding:0;font-family:inherit;}'
    + '.bs-home{display:block;width:100%;text-align:left;margin-top:8px;border-radius:12px;padding:9px 12px;font-size:12.5px;border:1px solid #FDE68A;background:#FFFBEB;color:#78350F;cursor:pointer;font-family:inherit;line-height:1.35;}.bs-home.alert{border-color:#FECACA;background:#FEF2F2;color:#991B1B;}';
  document.head.appendChild(st);
}
