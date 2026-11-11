// Allure équivalente « sur plat et au frais » : dénivelé (allure ajustée à la pente Strava, sinon D+), météo ; utilisée par
// l'allure EF réelle, le niveau, la foulée, la dérive cardiaque et l'écart à la consigne envoyé au Coach
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/frontend');

const NOW = '2026-11-11T09:00:00+01:00';
const J = (o) => JSON.parse(JSON.stringify(o));

test('calcul : plat = inchangé ; D+ en boucle ~0,38 s/m ; allure ajustée à la pente de Strava prioritaire ; chaleur ; 10 % au plus', () => {
  const app = loadApp({ now: NOW, state: {} });
  const E = (perf, km) => J(app.prEqPace(perf, km));
  assert.deepEqual([E({ pace: "5'30" }, 10).eq, E({ pace: "5'30" }, 10).diff], [330, 0]);
  assert.equal(app.prEqPaceLabel({ pace: "5'30" }, 10), '', 'rien à dire sur plat');
  // 120 m de D+ sur 10 km : 330 − 0,38 × 12 ≈ 325
  let r = E({ pace: "5'30", strava: { denivele_pos: 120 } }, 10);
  assert.equal(r.eq, 325); assert.equal(r.src, 'dplus'); assert.match(r.why, /côtes −5 s/);
  assert.equal(app.prEqPaceLabel({ pace: "5'30", strava: { denivele_pos: 120 } }, 10), "≈ 5'25 sur plat");
  assert.equal(E({ pace: "5'30", strava: { denivele_pos: 30 } }, 10).diff, 0, 'moins de 5 m/km : terrain plat');
  assert.equal(E({ pace: "5'30", strava: { denivele_pos: 900 } }, 10).eq, 297, '10 % au plus');
  // allure ajustée à la pente km par km (Strava) : prioritaire sur le D+
  const splits = [1, 2, 3, 4].map((k) => ({ km: k, distanceKm: 1, allure: k % 2 ? '5:40' : '5:20', gap: k % 2 ? 320 : 316 }));
  r = E({ pace: "5'30", strava: { denivele_pos: 300, splits } }, 4);
  assert.equal(r.src, 'strava'); assert.equal(r.eq, 318, '5\'30 × (318 / 330)');
  // chaleur : 25 °C → +3 % de ralentissement à effort égal
  r = E({ pace: "5'30", meteo: { temperature: 25, humidite: 50, vent_kmh: 5 } }, 10);
  assert.equal(r.eq, 320); assert.match(r.why, /25 °C −10 s/);
  r = E({ pace: "5'30", strava: { denivele_pos: 120 }, meteo: { temperature: 25, humidite: 50, vent_kmh: 5 } }, 10);
  assert.equal(r.eq, 316); assert.equal(r.terrain, 5); assert.equal(r.weather, 9);
  assert.equal(app.prEqPace({}, 10), null);
});

test('allure EF réelle et niveau calculés sur plat : une EF vallonnée par 24 °C n\'est plus comptée comme lente', () => {
  const st = { plan_start_date: '2026-10-26', _plan_engine: 'generated', fc_max: '190' };
  for (let k = 0; k < 10; k++) { const d = new Date(Date.UTC(2026, 10, 11 - k)).toISOString().slice(0, 10); st['fc_repos_' + d] = 50; }
  const runs = [['2026-10-27', 0], ['2026-10-29', 0], ['2026-11-01', 1], ['2026-11-03', 1], ['2026-11-05', 1]];
  runs.forEach(([date, hilly], i) => {
    const k = 'extra_w1_s' + i;
    st[k] = JSON.stringify({ type: 'ef', km: 10, d: "Footing EF|5'45 — 6'10 /km", sched_date: date });
    st[k + '_done'] = true; st[k + '_km'] = 10;
    st[k + '_perf'] = JSON.stringify({ date, pace: "5'50", hr: 140, dur: '58:20', strava: hilly ? { denivele_pos: 200 } : {}, meteo: hilly ? { temperature: 24, humidite: 60, vent_kmh: 10 } : null });
  });
  const app = loadApp({ now: NOW, state: st });
  const ef = app.prObservedEf(st, '2026-11-11');
  assert.ok(ef < 350, 'médiane sur plat plus rapide que les 5\'50 bruts : ' + ef);
  const H = { rest: 50, max: 190 };
  const S = app.prSessions(st), flat = S.find((s) => s.key === 'extra_w1_s0'), hill = S.find((s) => s.key === 'extra_w1_s3');
  assert.ok(app.prRunVdot(hill, H) > app.prRunVdot(flat, H) + 1, 'même allure brute en côte et au chaud = meilleur niveau');
});
