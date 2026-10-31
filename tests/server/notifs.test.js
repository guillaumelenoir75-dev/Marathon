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

test('heure de coucher (20h30) : push la veille d\'une séance, une fois par jour, même calcul que l\'app', async () => {
  const { loadFunctions: lf } = require('../helpers/functions');
  const d = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + 1); const tomorrow = t.toISOString().slice(0, 10);
  const data = { users: { WkEWrmnYWuUNkGLrwXf9HhaJWfh1: { state: { _plan_engine: 'generated',
    extra_w1_s0: JSON.stringify({ type: 'ef', km: 8, d: 'Footing EF|x', sched_date: tomorrow, sched_time: '07:00' }),
    whoop_data: { sleeps: [{ date: d, duration_hours: '7h20' }] } } } } };
  const F = lf({ data });
  await F.notifs.bedtimeReminder();
  assert.equal(F.calls.push.length, 1);
  assert.match(F.calls.push[0].title, /Couche-toi vers 21h35/);          // réveil 6h10 − 8 h − 20 min (dette 40) − 15 min d'endormissement
  assert.match(F.calls.push[0].body, /Demain 7h00 : Footing EF/);
  await F.notifs.bedtimeReminder();
  assert.equal(F.calls.push.length, 1, 'une seule fois par jour');
});

test('brief du matin un jour de repos : nuit, récupération et séance de demain — sans « prêt pour aujourd\'hui » ni organisation du plan', async () => {
  const d = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  const add = (n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const mk = (todaySess) => ({ _plan_engine: 'generated', plan_start_date: add(-14),
    extra_w3_s0: JSON.stringify(todaySess ? { type: 'tempo', km: 10, d: "Tempo 3×8 min|3 × 8 min à 4'35", sched_date: d, sched_time: '12:00' } : { type: 'ef', km: 6, d: 'Footing|x', sched_date: add(-2) }),
    extra_w3_s1: JSON.stringify({ type: 'long', km: 14, d: "Sortie longue|5'45 — 6'10 /km", sched_date: add(1), sched_time: '09:00' }),
    whoop_data: { sleeps: [{ date: d, duration_hours: '7h40' }] } });
  // repos
  let F = loadFunctions({ data: {}, modules: [], ai: 'brief' });
  let r = await F.helpers.generateMorningBriefContent('k', F.db, mk(false), 3, d);
  let call = F.calls.ai[0];
  assert.match(call.system, /JOUR DE REPOS/);
  assert.match(call.system, /📅 DEMAIN/);
  assert.match(call.system, /INTERDIT : bloc « prêt pour aujourd'hui », séance du jour/);
  assert.doesNotMatch(call.system, /PRÊT POUR AUJOURD'HUI|CONSIGNES & MÉTÉO|NUTRITION/);
  assert.match(call.user, /Prochaine séance : DEMAIN .* — Sortie longue 14 km à 09:00 — consigne : 5'45 — 6'10 \/km/);
  assert.match(call.user, /Heure de coucher conseillée ce soir : \d+h\d\d/);
  assert.doesNotMatch(call.user, /Gels :|Eau :|Allure AJUSTÉE/);
  assert.match(r.pushBody, /Repos · demain : Sortie longue 14 km à 09:00/);
  // jour de séance : brief habituel
  F = loadFunctions({ data: {}, modules: [], ai: 'brief' });
  r = await F.helpers.generateMorningBriefContent('k', F.db, mk(true), 3, d);
  assert.match(F.calls.ai[0].system, /PRÊT POUR AUJOURD'HUI/);
  assert.doesNotMatch(r.pushBody, /Repos ·/);
});
