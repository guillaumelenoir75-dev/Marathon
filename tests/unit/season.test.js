// « Ma saison » : étapes B / C intégrées au plan (et retirées), alertes de la saison, étape jamais prise pour l'objectif
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, synthPlan } = require('../helpers/frontend');

const NOW = '2026-11-08T09:00:00+01:00';
const J = (o) => JSON.parse(JSON.stringify(o));
const plan = () => synthPlan({ start: '2026-10-26', km: [24, 28, 30, 32, 34, 20] });   // lun EF · mer tempo · dim longue

test('étape B « à fond » : course insérée, 2 jours avant allégés, pas d\'intensité pendant la récupération ; retrait = plan d\'avant', () => {
  const st = plan(); st.extra_w3_s0 = JSON.stringify({ type: 'ef', km: 8, d: 'Footing EF|8 km EF', sched_date: '2026-11-12', sched_day: 4 });   // jeudi
  const app = loadApp({ now: NOW, state: st });
  const before = J(st);
  const C = J(app.seasonRaceChanges(st, { id: 'r1', name: 'Corrida', date: '2026-11-14', km: 10, prio: 'B' }));
  assert.equal(C.w, 3); assert.equal(C.key, 'extra_w3_s3');
  const race = JSON.parse(C.sets.extra_w3_s3);
  assert.deepEqual([race.type, race.km, race.sched_date, race._season], ['race', 10, '2026-11-14', 'r1']);
  const thu = JSON.parse(C.sets.extra_w3_s0); assert.equal(thu.km, 6, 'veille - 2 : footing raccourci');
  const sun = JSON.parse(C.sets.extra_w3_s2); assert.equal(sun.type, 'long'); assert.ok(sun.km < JSON.parse(st.extra_w3_s2).km, 'sortie longue du lendemain réduite');
  const wed = JSON.parse(C.sets.extra_w4_s1); assert.equal(wed.type, 'ef', 'tempo à J+4 → footing (récupération)');
  assert.ok(!C.sets.extra_w4_s0, 'footing EF de récupération inchangé');
  assert.ok(C.notes.length >= 3);
  // appliqué puis retiré : retour exact
  Object.keys(C.sets).forEach((k) => { st[k] = C.sets[k]; });
  const U = J(app.seasonRaceUndo(st, C));
  Object.keys(U.up).forEach((k) => { if (U.up[k] === null) delete st[k]; else st[k] = U.up[k]; });
  assert.deepEqual(J(st), before);
});

test('étape C « à l\'entraînement » : remplace la sortie longue de la semaine ; séance faite depuis = gardée au retrait', () => {
  const st = plan();
  const app = loadApp({ now: NOW, state: st });
  const C = J(app.seasonRaceChanges(st, { id: 'r2', name: 'Cross', date: '2026-11-14', km: 10, prio: 'C' }));
  assert.equal(C.sets.extra_w3_s2_skip, true); assert.match(C.sets.extra_w3_s2_skip_reason, /remplacée par Cross/);
  Object.keys(C.sets).forEach((k) => { st[k] = C.sets[k]; });
  st.extra_w3_s3_done = true; st.extra_w3_s3_km = 10;   // course faite entre-temps
  const U = J(app.seasonRaceUndo(st, C));
  assert.ok(U.kept.includes('extra_w3_s3'), 'course faite : gardée');
  assert.equal(U.up.extra_w3_s2_skip, null, 'sortie longue rétablie');
  assert.equal(J(app.seasonRaceChanges(st, { id: 'x', name: 'X', date: '2027-06-01', km: 10, prio: 'B' })).error, 'après la prépa');
});

test('alertes : étape à fond trop près de l\'objectif, deux objectifs rapprochés, prépa à venir trop courte ou sans récupération', () => {
  const st = plan(); st.onboarding = { course: '10 km', date: '2026-12-06', race_name: '10 km Novemb\'Run' };
  st._season = { races: [{ id: 'b', name: 'Corrida', date: '2026-11-28', km: 10, prio: 'B' }, { id: 'c', name: 'Cross', date: '2026-11-15', km: 8, prio: 'C' }] };
  const app = loadApp({ now: NOW, state: st });
  const cur = app.seasonPrep(st, 'cur');
  assert.equal(cur.weeks.length, 6); assert.equal(cur.race.date, '2026-12-06');
  const nx = Object.assign(synthPlan({ start: '2026-12-08', km: [20, 24, 26] }), { onboarding: { course: 'Semi-marathon', date: '2026-12-27', race_name: 'Semi' } });
  const next = app.seasonPrep(nx, 'next');
  const R = app.seasonRaces(st, cur, next, {});
  assert.deepEqual(J(R).map((r) => r.prio + ':' + r.name), ['C:Cross', 'B:Corrida', "A:10 km Novemb'Run", 'A:Semi']);
  const al = J(app.seasonChecks(R, cur, next, '2026-11-08')).map((a) => a.lvl + ' ' + a.t);
  assert.ok(al.some((t) => /^bad Corrida .* à 8 j de 10 km/.test(t)), al.join(' | '));
  assert.ok(al.some((t) => /^bad Semi : 3 sem\. de prépa, 10 conseillées/.test(t)), al.join(' | '));
  assert.ok(al.some((t) => /^warn Prépa Semi : 1 j après 10 km Novemb'Run, 3 j de repos conseillés/.test(t)), al.join(' | '));
  assert.ok(al.some((t) => /^bad Deux objectifs à 21 j/.test(t)), al.join(' | '));
  assert.ok(!al.some((t) => /Cross/.test(t)), 'étape C loin de l\'objectif : rien');
});

test('étape de saison jamais prise pour la course objectif (analyse de course)', () => {
  const st = plan();
  st.extra_w3_s3 = JSON.stringify({ type: 'race', km: 10, d: '🏁 Corrida|à fond', sched_date: '2026-11-14', _season: 'r1' });
  st.extra_w3_s3_done = true; st.extra_w3_s3_km = 10; st.extra_w3_s3_perf = JSON.stringify({ date: '2026-11-14', dur: '42:00', pace: "4'12" });
  const app = loadApp({ now: NOW, state: st });
  assert.equal(app.raFromSnap(st, { dist: '10 km', date: '2026-12-06', result: '41:00' }), null);
});
