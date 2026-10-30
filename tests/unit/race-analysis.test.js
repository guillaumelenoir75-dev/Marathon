// Analyse après la course : allure km par km vs plan, départ, 2e moitié, coup de mou, cardio, verdict, leçons → recette (départ)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/frontend');

const J = (o) => JSON.parse(JSON.stringify(o));
const mmss = (s) => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
const splits = (paces, fcs) => paces.map((p, i) => ({ km: i + 1, distanceKm: 1, allure: mmss(p), fc: fcs ? fcs[i] : null }));

test('départ trop rapide puis coup de mou : objectif manqué, cause expliquée, départ plus prudent retenu', () => {
  const app = loadApp({ now: '2026-11-23T09:00:00+01:00' });
  const cum = J(app.prRaceSplits(2520, 10)).map((x) => Math.round(x.cum));      // plan 42:00
  const pac = [240, 241, 248, 250, 252, 255, 268, 270, 272, 266];               // 4'00, 4'01… puis 4'28-4'32 dès le km 7
  const fc = [160, 166, 170, 172, 173, 175, 180, 183, 185, 186];
  const sec = pac.reduce((a, b) => a + b, 0);
  const A = J(app.raAnalyze({ perf: { strava: { splits: splits(pac, fc) }, meteo: { temperature: 12 } }, sec, dist: 10, cat: '10 km', date: '2026-11-22', name: '10km Novemb\'Run', plan: { target: 2520, cum }, pred: 2500 }));
  assert.equal(A.time, '42:42');
  assert.equal(A.delta, 42); assert.equal(A.target.src, 'plan');
  assert.ok(A.start.pct < -3, 'départ plus rapide que le plan : ' + A.start.pct);
  assert.equal(A.pacing, 'fade'); assert.equal(A.fade.km, 7);
  assert.ok(A.drift.pct >= 8, 'dérive cardio : ' + A.drift.pct);
  assert.equal(A.verdict.e, '🔁'); assert.match(A.verdict.s, /départ trop rapide/);
  assert.equal(A.startAdvice, 'slower');
  assert.ok(A.lessons.some((l) => /Départ trop rapide/.test(l)) && A.lessons.some((l) => /Dérive cardiaque/.test(l)));
  // recette : le prochain plan de course part plus prudemment (km 1 et 2), même temps final
  const R = J(app.prepRecette([], A));
  assert.equal(R.pacing.start, 1.02); assert.match(R.pacing.why, /départ trop rapide/);
  const base = J(app.prRaceSplits(2520, 10)), slow = J(app.prRaceSplits(2520, 10, 1.02));
  assert.ok(slow[0].pace > base[0].pace + 1.5 && slow[1].pace > base[1].pace + 1, 'départ plus lent');
  assert.equal(Math.round(slow[slow.length - 1].cum), 2520, 'temps visé inchangé');
});

test('2e moitié plus rapide, objectif atteint ; temps Strava recalé sur le temps officiel (arrêt, GPS)', () => {
  const app = loadApp({ now: '2026-11-23T09:00:00+01:00' });
  const pac = [262, 258, 257, 256, 255, 253, 252, 250, 248, 244];
  const sp = splits(pac); sp.push({ km: 11, distanceKm: 0.2, allure: '4:00', fc: null });   // 10,2 km au GPS
  const A = J(app.raAnalyze({ perf: { strava: { splits: sp } }, sec: 2520, dist: 10, cat: '10 km', date: '2026-11-22', goal: 2550 }));
  assert.equal(A.verdict.e, '🏆'); assert.match(A.verdict.s, /0:30 de mieux que ton objectif/);
  assert.equal(A.pacing, 'negative'); assert.equal(A.fade, undefined); assert.ok(!A.startAdvice);
  assert.ok(A.lessons.some((l) => /Gestion parfaite/.test(l)));
  const tot = A.kms.reduce((a, k) => a + k.pace, 0);
  assert.ok(Math.abs(tot - 2520) < 25, 'allures au km recalées sur le temps officiel (' + Math.round(tot) + ' s pour 10 km)');
  const R = J(app.prepRecette([], A)); assert.equal(R.pacing.start, null);
});

test('course de la prépa en cours : séance « course » validée + temps officiel + plan de course', () => {
  const st = { plan_start_date: '2026-10-26', _plan_engine: 'generated', onboarding: { course: '10 km', date: '2026-11-22', race_name: 'Course test', target_time: '42:00' },
    extra_w4_s0: JSON.stringify({ type: 'race', km: 10, d: 'COURSE|course', sched_date: '2026-11-22', sched_day: 7 }), extra_w4_s0_done: true, extra_w4_s0_km: 10,
    extra_w4_s0_perf: JSON.stringify({ date: '2026-11-22', official: '41:40', strava: { splits: splits([250, 250, 251, 250, 250, 250, 250, 249, 250, 250]) } }),
    _race_result: { time: '41:40', date: '2026-11-22', dist: '10 km' } };
  [1, 2, 3, 4].forEach((w) => { st['meta_w' + w] = JSON.stringify({ phase: 'x', isTaper: w === 4 }); });
  const app = loadApp({ now: '2026-11-22T14:00:00+01:00', state: st, race: { name: 'Course test', course: '10 km', date: '2026-11-22', km: 10, objectif: '42:00' } });
  const A = J(app.raCurrent());
  assert.equal(A.time, '41:40'); assert.equal(A.target.sec, 2520); assert.equal(A.verdict.t, 'Objectif atteint'); assert.equal(A.pacing, 'even');
});
