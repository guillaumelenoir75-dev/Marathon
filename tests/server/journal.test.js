// sessionJournal (journal de séance relu par le Coach) et situation d'entraînement : zones FC recalées, signal de la foulée
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFunctions, callHttp } = require('../helpers/functions');

test('sessionJournal : réponse de l\'IA validée (effort, douleur, zone de la liste, note nettoyée)', async () => {
  let F = loadFunctions({ ai: 'Voici : {"rpe": 7, "pain_level": 1, "pain_zone": "Mollet gauche", "note": "Dur sur la fin |\\n mollet tendu"}' });
  let r = (await callHttp(F.coach.sessionJournal, { text: 'dur sur la fin, mollet un peu tendu', session: { title: 'Tempo', type: 'tempo', km: 10 } })).out;
  assert.equal(r.success, true); assert.equal(r.rpe, 7);
  assert.deepEqual(r.pain, { level: 1, zone: 'Autre' }, 'zone hors liste → Autre');
  assert.ok(!/[|\n]/.test(r.note));
  assert.match(F.calls.ai[0].user, /Compte rendu : « dur sur la fin/);
  F = loadFunctions({ ai: '{"rpe": 14, "pain_level": 0, "pain_zone": "Genou", "note": null}' });
  r = (await callHttp(F.coach.sessionJournal, { text: 'facile, rien à signaler' })).out;
  assert.equal(r.rpe, null, 'effort hors échelle refusé'); assert.deepEqual(r.pain, { level: 0, zone: null });
  F = loadFunctions({ ai: 'pas de JSON' });
  assert.equal((await callHttp(F.coach.sessionJournal, { text: 'facile' })).status, 502);
  assert.equal((await callHttp(F.coach.sessionJournal, { text: '' })).status, 400);
});

test('situation du Coach : zones FC recalées prioritaires et signal de la foulée récent', async () => {
  const F = loadFunctions({ data: {}, modules: [] });
  const st = { _plan_engine: 'generated', _hr_zones: { applied: true, at: '2026-10-20', efMax: 152, lthr: 171, fcMax: 190 },
    _body_signals: { at: '2026-10-28', level: 2, items: ['FC plus haute à allure égale.', 'Cadence en baisse.'] } };
  const t = (await F.helpers.buildTrainingSituation(F.db, st, '2026-10-29')).text;
  assert.match(t, /PRIORITAIRES.*jusqu'à 152 bpm, FC au seuil ~171 bpm, FC max 190 bpm/);
  assert.match(t, /Signal de la foulée.*Cadence en baisse\..*pas de hausse de charge/);
  st._body_signals.at = '2026-10-20'; st._hr_zones.applied = false;
  const t2 = (await F.helpers.buildTrainingSituation(F.db, st, '2026-10-29')).text;
  assert.ok(!/Signal de la foulée|PRIORITAIRES/.test(t2), 'signal trop ancien, zones non appliquées');
});

test('situation du Coach : charge récente et dernière séance incluent la prépa précédente ; allure EF de l\'app', async () => {
  const UID = 'WkEWrmnYWuUNkGLrwXf9HhaJWfh1';
  const old = { _plan_engine: 'generated', extra_w1_s0: JSON.stringify({ type: 'ef', km: 12, sched_date: '2026-10-24' }), extra_w1_s0_done: true, extra_w1_s0_km: 12,
    extra_w1_s0_perf: JSON.stringify({ date: '2026-10-24', pace: '5:40', hr: 140 }) };
  const data = { users: { [UID]: { prep_index: { seine: { title: 'Marathon', date: '2026-10-18', dist: 'Marathon' } }, preps: { seine: old } } } };
  const F = loadFunctions({ data, modules: [] });
  const st = { _plan_engine: 'generated', _prep_id: 'nov', _ef_ref: { pace: "5'38", at: '2026-10-28' }, _hr_zones: { applied: true, efMax: 151 } };
  const t = (await F.helpers.buildTrainingSituation(F.db, st, '2026-10-29')).text;
  assert.match(t, /Charge récente : 12 km sur les 7 derniers jours \(1 séance\)/);
  assert.match(t, /Dernière séance : .*24 octobre.* 12 km à 5:40\/km/);
  assert.equal(F.helpers.efRefOf(st, '2026-10-29'), "5'38");
  assert.equal(F.helpers.efRefOf(st, '2026-11-10'), null, 'référence trop ancienne');
  assert.equal(F.helpers.efMaxOf(st), 151); assert.equal(F.helpers.efMaxOf({}), 148);
});

test('stravaHistory : toutes les pages, courses seulement, résumé dans state, puis seulement les nouvelles', async () => {
  const { loadFunctions: lf } = require('../helpers/functions');
  const act = (id, d, type) => ({ id, type, sport_type: type, start_date: d + 'T06:30:00Z', start_date_local: d + 'T07:30:00Z', distance: 10000, moving_time: 2700, elapsed_time: 2760, average_heartrate: 145, max_heartrate: 168, average_cadence: 86, total_elevation_gain: 50, name: 'Run ' + id, workout_type: id === 2 ? 1 : 0 });
  const page1 = Array.from({ length: 200 }, (_, i) => act(1000 + i, '2025-0' + (1 + (i % 9)) + '-1' + (i % 9), i % 10 === 0 ? 'Ride' : 'Run'));
  const page2 = [act(2, '2024-06-02', 'Run'), act(3, '2024-06-03', 'TrailRun')];
  const data = { users: { U1: { state: { strava_token: { access_token: 't', refresh_token: 'r', expires_at: Date.now() / 1000 + 3600 } } } } };
  const F = lf({ data, uid: 'U1', modules: ['strava.js'], fetch: async (url) => ({ ok: true, status: 200, json: async () => /page=1/.test(url) ? page1 : /page=2/.test(url) ? page2 : [] }) });
  let r = (await callHttp(F.strava.stravaHistory, {})).out;
  assert.equal(r.success, true); assert.equal(r.full, true);
  assert.equal(r.count, 182, '180 courses page 1 (vélo écarté) + 2 page 2');
  assert.equal(F.db.data.users.U1.strava_history[2].w, 1);
  assert.equal(F.db.data.users.U1.strava_history[3].sp, 'TrailRun');
  assert.equal(F.db.data.users.U1.state._strava_hist.first, '2024-06-02');
  r = (await callHttp(F.strava.stravaHistory, {})).out;
  assert.equal(r.full, false); assert.ok(F.calls.fetch.slice(-1)[0].includes('&after='), 'ensuite : seulement les nouvelles');
});
