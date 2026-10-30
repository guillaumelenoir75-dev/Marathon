// Historique Strava importé : courses des années passées dans les analyses, sans doublon avec les séances de l'app
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/frontend');

const NOW = '2026-10-29T09:00:00+01:00';
const J = (o) => JSON.parse(JSON.stringify(o));
const run = (d, km, mv, o) => Object.assign({ d, t: '07:30', km, mv, el: mv + 30, hr: 142, mx: 160, cad: 172, up: 40, n: 'Course à pied', sp: 'Run', w: null }, o || {});
const H = {
  1: run('2024-05-12', 10.02, 2580, { w: 1, n: '10 km de Rouen', el: 2595, hr: 172, mx: 186 }),   // 43:15 → course officielle
  2: run('2025-04-06', 21.15, 6050, { w: 1, n: 'Semi de Paris', el: 6080 }),
  3: run('2026-10-20', 8.1, 2760),                                                        // aussi validée dans l'app ce jour-là
  4: run('2026-10-24', 22.5, 8200),                                                       // sortie longue hors plan
  5: run('2026-10-26', 12, 3000, { w: 3, n: 'Séance' }) };

test('courses Strava → séances réalisées : type déduit (course, sortie longue, séance, footing), allure et FC', () => {
  const app = loadApp({ now: NOW });
  const S = J(app.prStravaSessions(H)).reduce((o, s) => { o[s.stravaId] = s; return o; }, {});
  assert.equal(S[1].type, 'race'); assert.equal(S[4].type, 'long'); assert.equal(S[5].type, 'tempo'); assert.equal(S[3].type, 'ef');
  assert.equal(S[3].perf.pace, "5'41"); assert.equal(S[3].perf.hr, 142); assert.equal(S[1].perf.strava.fcMax, 186);
  assert.ok(S[3].ext && S[3].perf.imported);
  const R = J(app.prStravaRaces());
  assert.equal(R.length, 0, 'historique pas encore chargé');
  app.setStrava(H);
  const R2 = J(app.prStravaRaces()).sort((a, b) => a.date.localeCompare(b.date));
  assert.deepEqual(R2.map((r) => [r.cat, r.time]), [['10 km', '43:15'], ['Semi-marathon', '1:41:20']]);
});

test('fusion : la séance validée dans l\'app fait foi le même jour ; le reste de l\'historique est ajouté', () => {
  const st = { plan_start_date: '2026-10-19', _plan_engine: 'generated',
    extra_w1_s0: JSON.stringify({ type: 'ef', km: 8, d: 'Footing EF|x', sched_date: '2026-10-20' }), extra_w1_s0_done: true, extra_w1_s0_km: 8,
    extra_w1_s0_perf: JSON.stringify({ date: '2026-10-20', pace: '5:45', hr: 141 }),
    extra_w2_s0: JSON.stringify({ type: 'ef', km: 7, d: 'Footing|x', sched_date: '2026-10-29' }) };
  const app = loadApp({ now: NOW, state: st });
  app.setStrava(H);
  const all = J(app.prAllDone('2026-10-29'));
  assert.equal(all.filter((s) => s.date === '2026-10-20').length, 1, 'pas de doublon le 20');
  assert.equal(all.find((s) => s.date === '2026-10-20').ext, undefined, 'la séance de l\'app est gardée');
  assert.ok(all.some((s) => s.date === '2024-05-12' && s.ext), 'courses des années passées dans l\'historique');
  assert.ok(app.prKnownRaces().some((r) => r.label === 'Semi de Paris (Strava)'), 'courses Strava dans les records et le niveau');
  assert.equal(app.prLoad('2026-10-29').k7, 35, 'charge 7 j : sortie longue hors plan (22,5) + séance (12) = 34,5 arrondi, le 20 non');
  // la validation express ne prend pas une course importée pour une séance déjà validée
  assert.ok(!app.qvMatch({ date: '2026-10-26', distanceKm: 12 }) || !app.qvMatch({ date: '2026-10-26', distanceKm: 12 }).already);
  assert.equal(app.prStreak(), 1, 'la série ne compte que les séances de l\'app (le 20), pas les 3 courses importées');
});
