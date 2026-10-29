// Notifications du dimanche et situation d'entraînement envoyée au Coach
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFunctions } = require('../helpers/functions');

const ADMIN = 'users/WkEWrmnYWuUNkGLrwXf9HhaJWfh1/state';
const day = (d) => new Date(Date.now() - d * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const setState = (data, st) => { const ks = ADMIN.split('/'); let o = data; ks.slice(0, -1).forEach((k) => { o = o[k] = o[k] || {}; }); o[ks[ks.length - 1]] = st; };

test('relecture du dimanche : séances validées depuis la dernière relecture (heure de validation)', async () => {
  const data = {}; setState(data, { _plan_engine: 'generated', _coach_review: { date: day(2), at: new Date(Date.now() - 2 * 86400000).toISOString() },
    extra_w1_s0: JSON.stringify({ sched_date: day(4) }), extra_w1_s0_done: true, extra_w1_s0_perf: JSON.stringify({ date: day(4), validatedAt: new Date(Date.now() - 86400000).toISOString() }),
    extra_w1_s1: JSON.stringify({ sched_date: day(1) }), extra_w1_s1_km: 6, extra_w1_s1_perf: JSON.stringify({ date: day(1), validatedAt: new Date().toISOString() }),
    extra_w1_s2: JSON.stringify({ sched_date: day(5) }), extra_w1_s2_done: true, extra_w1_s2_perf: JSON.stringify({ date: day(5), validatedAt: new Date(Date.now() - 5 * 86400000).toISOString() }) });
  const F = loadFunctions({ data });
  await F.notifs.planReviewSunday();
  assert.equal(F.calls.push.length, 1); assert.match(F.calls.push[0].body, /^2 séances/); assert.equal(F.calls.push[0].tag, 'plan-review');
  // le rappel de planification de 20h n'est pas envoyé : la relecture le couvre
  await F.notifs.weeklyPlanifReminder();
  assert.ok(!F.calls.push.some((p) => p.tag === 'planif-reminder'));
});

test('relecture du dimanche : sans relecture précédente, 7 derniers jours seulement ; plan en dur ignoré', async () => {
  const st = { _plan_engine: 'generated' };
  for (let i = 0; i < 30; i++) { const k = 'extra_w' + (1 + Math.floor(i / 3)) + '_s' + (i % 3); st[k] = JSON.stringify({ sched_date: day(i * 2) }); st[k + '_done'] = true; }
  let data = {}; setState(data, st);
  let F = loadFunctions({ data });
  await F.notifs.planReviewSunday();
  assert.match(F.calls.push[0].body, /^4 séances/);
  data = {}; setState(data, { extra_w1_s0: JSON.stringify({ sched_date: day(1) }), extra_w1_s0_done: true });
  F = loadFunctions({ data });
  await F.notifs.planReviewSunday();
  assert.equal(F.calls.push.length, 0);
});

test('situation envoyée au Coach : récupération post-course nuancée pour la relecture du plan', async () => {
  const data = { users: { WkEWrmnYWuUNkGLrwXf9HhaJWfh1: { prep_index: { a: { title: 'Marathon', race: 'Marathon', date: day(10), dist: 'Marathon', result: '3:37:05' } } } } };
  const F = loadFunctions({ data, modules: [] });
  const db = F.db;
  const t1 = (await F.helpers.buildTrainingSituation(db, { _plan_engine: 'generated' }, day(0), { planReview: true })).text;
  const t2 = (await F.helpers.buildTrainingSituation(db, { _plan_engine: 'generated' }, day(0))).text;
  assert.match(t1, /intensité réintroduite peu à peu/);
  assert.match(t2, /aucune intensité tant que/);
});
