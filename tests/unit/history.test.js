// Historique complet : les analyses portent sur toutes les prépas enregistrées, pas seulement sur la prépa en cours
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/frontend');

const NOW = '2026-10-29T09:00:00+01:00';
const pace = (s) => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
// état de prépa avec des séances faites (semaine 1, datées par perf.date)
function prep(list, extra) {
  const st = Object.assign({ plan_start_date: '2026-10-26', _plan_engine: 'generated' }, extra || {});
  list.forEach((r, i) => {
    const k = 'extra_w1_s' + i;
    st[k] = JSON.stringify({ type: r.type || 'ef', km: r.km || 10, d: r.d || "Footing EF|5'45 — 6'10 /km", sched_date: r.date });
    if (r.done === false) return;
    st[k + '_done'] = true; st[k + '_km'] = r.km || 10;
    st[k + '_perf'] = JSON.stringify(Object.assign({ date: r.date, pace: r.pace ? pace(r.pace) : undefined, hr: r.hr }, r.perf || {}));
  });
  return st;
}
// prépa précédente (marathon) : séances jusqu'au 18 octobre ; prépa en cours : démarrée le 26 octobre
const OLD = prep([
  { date: '2026-10-05', pace: 335, hr: 141 }, { date: '2026-10-08', pace: 332, hr: 142 }, { date: '2026-10-11', pace: 338, hr: 140, km: 18, type: 'long' },
  { date: '2026-10-14', pace: 334, hr: 143 }, { date: '2026-10-18', type: 'race', km: 42.2, pace: 308, hr: 160, perf: { strava: { fcMax: 187 } } }, { date: '2026-10-23', pace: 360, hr: 135, km: 6 }],
  { plan_start_date: '2026-03-09', _prep_id: 'seine' });

test('historique : copies des prépas + prépa en cours, sans doublon ni copie de la prépa en cours', () => {
  const cur = prep([{ date: '2026-10-27', pace: 340, hr: 140, km: 8 }], { _prep_id: 'nov' });
  const app = loadApp({ now: NOW, state: cur });
  // la copie de la prépa en cours (enregistrement automatique) et un doublon exact ne comptent qu'une fois
  app.setSnaps({ seine: OLD, nov: cur, dup: prep([{ date: '2026-10-05', pace: 335, hr: 141 }]) });
  const all = app.prAllDone('2026-10-29');
  assert.equal(all.length, 7, all.map((s) => s.date).join(','));
  assert.equal(all.map((s) => s.cur ? 1 : 0).join(''), '0000001');
  assert.equal(all[0].gw, 1); assert.equal(all[6].gw, 4, 'n° de semaine continu depuis la 1re séance');
  assert.equal(app.prLoad('2026-10-29').k7, 14, '7 derniers jours : 6 km de l\'ancienne prépa + 8 km de la nouvelle');
});

test('analyses : allure EF réelle, niveau, série, zones et foulée lisent la prépa précédente', () => {
  const cur = prep([{ date: '2026-10-31', done: false }], { _prep_id: 'nov' });   // nouvelle prépa : rien de fait encore
  const app = loadApp({ now: NOW, state: cur });
  assert.equal(app.prObservedEf(cur, '2026-10-29'), null, 'sans historique : pas d\'allure EF');
  app.setSnaps({ seine: OLD });
  assert.equal(app.prObservedEf(cur, '2026-10-29'), 335, 'médiane des sorties EF ≤ 148 de la prépa précédente');
  assert.ok(app.prStreak() >= 5, 'la série continue d\'une prépa à l\'autre');
  assert.equal(app.hrZonesEstimate('2026-10-29').fcMax.v, 187, 'FC max lue dans la prépa précédente (marathon)');
  const f = app.prFitness(cur, { today: '2026-10-29', races: [] });
  assert.ok(f.sources.length === 0 || f.sources.every((s) => s.date), 'niveau calculé sans erreur sur l\'historique');
});

test('copie figée consultée en lecture seule : ses seules données', () => {
  const cur = prep([{ date: '2026-10-27', pace: 340, hr: 140 }]);
  const app = loadApp({ now: NOW, state: cur });
  app.setSnaps({ seine: OLD });
  app.ctx.eval = null;
  require('vm').runInContext('_prepView = { state: {}, meta: {} };', app.ctx);
  assert.equal(app.prAllDone('2026-10-29').length, 1);
});
