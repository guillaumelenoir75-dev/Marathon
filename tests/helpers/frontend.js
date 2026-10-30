// Charge les modules de l'app (scripts classiques, fonctions globales) dans un contexte isolé pour les tests unitaires.
// Usage : const app = loadApp({ state: {...}, now: '2026-10-29T09:00:00+01:00' }); app.prVolumePlan(...)
'use strict';

const { loadEngine } = require('../../functions/engine');
// course par défaut des tests quand l'état n'en décrit pas
const TEST_RACE = { name: 'Course test', course: '10 km', date: '2026-11-22', km: 10, objectif: '42:00' };
function loadApp(opts) {
  opts = Object.assign({}, opts || {});
  if (!opts.race && !((opts.state || {}).onboarding || {}).date) opts.race = TEST_RACE;
  return loadEngine(opts);
}

// Plan synthétique : nWeeks semaines (lun EF, mer qualité, dim sortie longue), course finale la dernière semaine
function synthPlan(o) {
  o = o || {};
  const km = o.km || [30, 34, 38, 40, 42, 30], n = km.length, start = o.start || '2026-10-26';
  const st = { plan_start_date: start, _plan_engine: 'generated' };
  const mon = new Date(start + 'T12:00:00'); const dw = mon.getDay(); mon.setDate(mon.getDate() + (dw === 0 ? -6 : 1 - dw));
  const day = (w, k) => { const x = new Date(mon); x.setDate(x.getDate() + (w - 1) * 7 + k); return x.toISOString().slice(0, 10); };
  for (let w = 1; w <= n; w++) {
    const L = Math.round(km[w - 1] * 0.35), Q = 10, E = km[w - 1] - L - Q, race = w === n, test = o.testRace === w;
    st['extra_w' + w + '_s0'] = JSON.stringify({ type: 'ef', km: E, d: "Footing EF|5'45 — 6'10 /km", sched_date: day(w, 0), sched_day: 1 });
    st['extra_w' + w + '_s1'] = JSON.stringify(test ? { type: 'race', km: 21, d: 'Semi test|course', sched_date: day(w, 2), sched_day: 3 }
      : { type: 'tempo', km: Q, d: "Tempo 3×8 min|3 km EF · 3 × 8 min à 4'35 — 4'40 /km · récup 2 min", sched_date: day(w, 2), sched_day: 3 });
    st['extra_w' + w + '_s2'] = JSON.stringify(race ? { type: 'race', km: 10, d: 'COURSE|course', sched_date: day(w, 6), sched_day: 7 }
      : { type: 'long', km: L, d: o.longDet ? o.longDet(L) : "5'45 — 6'10 /km", sched_date: day(w, 6), sched_day: 7 });
    st['meta_w' + w] = JSON.stringify({ phase: 'x', isRecov: (o.recov || []).indexOf(w) >= 0, isTaper: w >= n - 1 });
  }
  return st;
}

module.exports = { loadApp, synthPlan };
