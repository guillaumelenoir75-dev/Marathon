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

test('heure de coucher (21h) : push tous les soirs, une fois par jour, même calcul que l\'app', async () => {
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
  assert.match(F.calls.push[0].body, /Demain 7h00 : Footing EF/); assert.match(F.calls.push[0].body, /8h20 de sommeil/);
  await F.notifs.bedtimeReminder();
  assert.equal(F.calls.push.length, 1, 'une seule fois par jour');
  // sans séance demain : rappel quand même, avec le besoin appris par l'app et le réveil habituel
  const F2 = lf({ data: { users: { WkEWrmnYWuUNkGLrwXf9HhaJWfh1: { state: { _plan_engine: 'generated', _sleep_need_auto: { min: 450, n: 10, src: 'auto' }, _wake_week: '07:30', _wake_weekend: '07:30' } } } } });
  await F2.notifs.bedtimeReminder();
  assert.equal(F2.calls.push.length, 1);
  assert.match(F2.calls.push[0].title, /Couche-toi vers 23h45/);           // 7h30 − 7h30 − 15 min
  assert.match(F2.calls.push[0].body, /Pas de séance demain/);
  // WHOOP connecté mais nuit d'aujourd'hui absente : pas de rappel (jamais l'heure calculée sur la veille)
  const yest = new Date(d + 'T12:00:00Z'); yest.setUTCDate(yest.getUTCDate() - 1);
  const F3 = lf({ data: { users: { WkEWrmnYWuUNkGLrwXf9HhaJWfh1: { state: { _plan_engine: 'generated', whoop_data: { sleeps: [{ date: yest.toISOString().slice(0, 10), duration_hours: '7h00' }] } } } } } });
  await F3.notifs.bedtimeReminder();
  assert.equal(F3.calls.push.length, 0);
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
  assert.match(r.pushBody, /Repos aujourd'hui · demain 09:00 : Sortie longue 14 km/);
  // prochaine séance dans 3 jours (samedi → mardi) : pas de rubrique « demain », son jour à la place
  const st3 = mk(false); st3.extra_w3_s1 = JSON.stringify({ type: 'tempo', km: 10, d: "Tempo|3 × 8 min à 4'35", sched_date: add(3), sched_time: '12:00' });
  F = loadFunctions({ data: {}, modules: [], ai: 'brief' });
  r = await F.helpers.generateMorningBriefContent('k', F.db, st3, 3, d);
  call = F.calls.ai[0];
  const jour = new Date(add(3) + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', timeZone: 'UTC' });
  assert.doesNotMatch(call.system, /📅 DEMAIN/);
  assert.match(call.system, new RegExp('📅 PROCHAINE SÉANCE · ' + jour.charAt(0).toUpperCase() + jour.slice(1)));
  assert.match(call.system, /ne jamais écrire « demain »/);
  assert.match(call.user, /Prochaine séance : PAS DEMAIN — /);
  assert.doesNotMatch(call.user, /Heure de coucher conseillée/, 'pas de coucher « veille de séance » 3 jours avant');
  assert.match(r.pushBody, new RegExp("Repos aujourd'hui · " + jour + ' 12:00 : Tempo 10 km'));
  // jour de séance : brief habituel
  F = loadFunctions({ data: {}, modules: [], ai: 'brief' });
  r = await F.helpers.generateMorningBriefContent('k', F.db, mk(true), 3, d);
  assert.match(F.calls.ai[0].system, /PRÊT POUR AUJOURD'HUI/);
  assert.doesNotMatch(r.pushBody, /Repos ·/);
});

test('brief du matin : uniquement la nuit WHOOP du jour — celle de la veille n\'est jamais présentée comme celle de ce matin', async () => {
  const d = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  const add = (n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const st = (rec) => ({ _plan_engine: 'generated', plan_start_date: add(-14), extra_w3_s0: JSON.stringify({ type: 'ef', km: 8, d: 'Footing|x', sched_date: d, sched_time: '12:00' }),
    whoop_data: { recoveries: [{ date: rec, score: 31, rhr: 61, hrv: 41 }], sleeps: [{ date: rec, performance_pct: 52, duration_hours: '5h40' }] } });
  let F = loadFunctions({ data: {}, modules: [], ai: 'brief' });
  await F.helpers.generateMorningBriefContent('k', F.db, st(add(-1)), 3, d);
  let u = F.calls.ai[0].user;
  assert.match(u, /Données WHOOP de cette nuit : NON DISPONIBLES/);
  assert.doesNotMatch(u, /Score de récupération WHOOP : 31|Durée de sommeil : 5h40|Score du jour \(synthétique\)/, 'aucun chiffre de la veille');
  F = loadFunctions({ data: {}, modules: [], ai: 'brief' });
  await F.helpers.generateMorningBriefContent('k', F.db, st(d), 3, d);
  u = F.calls.ai[0].user;
  assert.match(u, /Score de récupération WHOOP : 31%/); assert.doesNotMatch(u, /NON DISPONIBLES/);
});

test('brief du matin : l\'alcool d\'hier soir est donné au Coach avec son effet estimé et la règle « pas l\'entraînement »', async () => {
  const d = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  const st = { _plan_engine: 'generated', plan_start_date: d, extra_w1_s0: JSON.stringify({ type: 'ef', km: 8, d: 'Footing|x', sched_date: d, sched_time: '12:00' }),
    _alcohol: { [d]: { l: 7, t: ['wine', 'spirits'] } }, _alcohol_model: { at: d, personal: true, nAlc: 9, rec: -3, hrv: -2.5, rhr: 0.8, sleep: -2 } };
  let F = loadFunctions({ data: {}, modules: [], ai: 'brief' });
  await F.helpers.generateMorningBriefContent('k', F.db, st, 1, d);
  const u = F.calls.ai[0].user;
  assert.match(u, /Alcool hier soir : 7\/10 \(vin, alcool fort\)\. Effet estimé sur cette nuit \(modèle personnel \(9 nuits avec alcool\)\) : récupération -21 pts, VFC -17 %, FC repos \+5\.6 bpm/);
  assert.match(u, /RÈGLE ALCOOL : cette part de la baisse .* vient de l'alcool, PAS de l'entraînement/);
  st._alcohol = {};
  F = loadFunctions({ data: {}, modules: [], ai: 'brief' });
  await F.helpers.generateMorningBriefContent('k', F.db, st, 1, d);
  assert.match(F.calls.ai[0].user, /Alcool hier soir : non renseigné/);
  // relecture / discussion du plan : la règle alcool fait partie des principes
  const C = loadFunctions({ data: {}, modules: ['coach.js'], ai: '{"reply":"ok","changes":[]}' });
  const { callHttp } = require('../helpers/functions');
  await callHttp(C.coach.planChat, { today: d, plan: [{ w: 1, sessions: [] }], next: true, message: 'Récup basse ce matin', alcool: { cette_nuit: { niveau_0_10: 7 } } });
  assert.match(C.calls.ai[0].system, /ALCOOL : une récupération WHOOP basse/);
  assert.match(C.calls.ai[0].user, /Alcool \(saisi chaque matin.*niveau_0_10":7/);
});

test('notifications « de confort » : pas envoyées à moins de 25 min d\'une autre ; les importantes passent toujours', () => {
  const F = loadFunctions({ data: {} });
  const now = Date.now(), last = { at: now - 10 * 60000, tag: 'unvalidated-reminder' };
  assert.equal(F.helpers.pushTooClose(last, 'missed-key', now), true, 'séance clé manquée 10 min après un rappel : bloquée');
  assert.equal(F.helpers.pushTooClose(last, 'shaker-noon', now), true);
  assert.equal(F.helpers.pushTooClose(last, 'fc-repos-14h', now), true);
  assert.equal(F.helpers.pushTooClose(last, 'bedtime', now), false, 'coucher : toujours');
  assert.equal(F.helpers.pushTooClose(last, 'brief-matinal', now), false, 'brief : toujours');
  assert.equal(F.helpers.pushTooClose(last, 'session-reminder', now), false, 'séance dans 1h : toujours');
  assert.equal(F.helpers.pushTooClose({ at: now - 30 * 60000, tag: 'bilan-semaine' }, 'week-complete', now), false, 'plus de 25 min après : envoyée');
  assert.equal(F.helpers.pushTooClose(null, 'unvalidated-reminder', now), false);
});

test('semaine complète : pas de notification le dimanche (le bilan de 17h la dit déjà)', async () => {
  const sunday = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', weekday: 'short' }).format(new Date()) === 'Sun';
  const st = { _plan_engine: 'generated', plan_start_date: day(3), _last_validation_w1: Date.now(), rf1r1done: true, rf1r2done: true };
  st.extra_w1_s0 = JSON.stringify({ type: 'ef', km: 8, d: 'Footing EF|x', sched_date: day(1) }); st.extra_w1_s0_done = true;
  const data = {}; setState(data, st);
  const F = loadFunctions({ data });
  await F.notifs.weekCompleteCongrats();
  const sent = F.calls.push.some((p) => p.tag === 'week-complete');
  if (sunday) assert.equal(sent, false, 'dimanche : rien'); else assert.ok(true, 'pas dimanche : règle non applicable aujourd\'hui');
});

test('forme du jour des briefs = celle de l\'app (_form_today) ; zones FC des consignes = celles de l\'athlète', () => {
  const F = loadFunctions({ data: {} });
  const H = F.helpers;
  assert.equal(H.formScoreFor({ _form_today: { date: '2026-11-12', score: 58 } }, '2026-11-12', { score: 80 }, null, 48), 58, 'score de l\'app repris tel quel');
  const raw = H.formScoreFor({ _form_today: { date: '2026-11-11', score: 58 } }, '2026-11-12', { score: 20, hrv: 90 }, { performance_pct: 90 }, 44);
  assert.equal(raw, Math.round((20 + 90 + 100 + 100) / 4), 'sinon la formule de l\'app, sans plafond à 33');
  const z = H.hrZonesOf({ _fc_max_manual: { v: 193 }, _hr_zones: { applied: true, efMax: 146, fcMax: 195 } });
  assert.deepEqual(z, { max: 193, efLo: 138, efHi: 146, tLo: 154, tHi: 168 });
  assert.deepEqual(H.hrZonesOf({}), { max: 196, efLo: 140, efHi: 148, tLo: 157, tHi: 171 });
  // barème chaleur du Coach dans la zone EF de l'athlète
  const heat = H.heatEfText({ _hr_zones: { applied: true, efMax: 152 } });
  assert.match(heat, /20-25°C : \+0 à \+3 bpm → zone EF effective 144-155 bpm/);
  assert.match(heat, /> 35°C +: \+15 à \+20 bpm → zone EF effective 159-172 bpm/);
  assert.doesNotMatch(heat, /140-151/);
});
