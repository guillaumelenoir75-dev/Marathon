// Validation automatique côté serveur : écrit seulement si Strava + WHOOP de la même sortie + météo ; sinon attend,
// puis demande une validation à la main au bout de 4 h ; jamais deux fois la même sortie
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFunctions } = require('../helpers/functions');
const { synthPlan } = require('../helpers/frontend');

const UID = 'WkEWrmnYWuUNkGLrwXf9HhaJWfh1', BASE = 'users/' + UID + '/state';
const act = { id: 9001, type: 'Run', sport_type: 'Run', start_date: '2026-11-03T11:00:00Z', start_date_local: '2026-11-03T12:00:00Z', distance: 8100, moving_time: 2780, elapsed_time: 2850,
  average_heartrate: 141, max_heartrate: 158, start_latlng: [48.84, 2.29], name: 'Footing' };
const hourly = { time: ['2026-11-03T12:00'], temperature_2m: [12.4], relative_humidity_2m: [76], apparent_temperature: [11], weather_code: [2], wind_speed_10m: [11] };
const workout = { id: 'w1', start: '2026-11-03T11:01:00Z', end: '2026-11-03T11:48:00Z', sport: 'running', strain: 9.4, avg_hr: 142, max_hr: 159, kcal: 610 };
function setup(state) {
  const st = synthPlan({ start: '2026-11-02' });
  st.extra_w1_s0 = JSON.stringify({ type: 'ef', km: 8, d: "Footing EF|5'45 — 6'10 /km", sched_date: '2026-11-03', sched_day: 2 });
  Object.assign(st, state || {});
  const data = {}; data.users = { [UID]: { state: st } };
  const F = loadFunctions({ data, modules: ['autovalidate.js'] });
  const pushes = [];
  const deps = (o) => Object.assign({ runs: async () => [act], detail: async () => ({ laps: [], splits: [] }), workouts: async () => [workout], hourly: async () => hourly,
    push: async (title, body, tag, url) => { pushes.push({ title, body, tag, url }); } }, o || {});
  const S = () => F.db.data.users[UID].state;
  return { F, deps, pushes, S };
}
const T = (iso) => Date.parse(iso);

test('les 3 sources : séance validée, journal, révision serveur, notification « Ton ressenti ? » ; pas deux fois', async () => {
  const { F, deps, pushes, S } = setup();
  const r = await F.autovalidate.runAutoValidate(F.db, UID, T('2026-11-03T13:00:00Z'), deps());
  assert.equal(r.out[0].st, 'ok');
  const st = S();
  assert.equal(st.extra_w1_s0_done, true); assert.equal(st.extra_w1_s0_km, 8.1);
  const p = JSON.parse(st.extra_w1_s0_perf);
  assert.equal(p.strava_id, '9001'); assert.equal(p.whoop.workout_strain, 9.4); assert.equal(p.meteo.temperature, 12.4); assert.ok(p.auto);
  assert.equal(st._autoval_log['9001'].st, 'ok'); assert.ok(st._server_rev);
  assert.equal(pushes.length, 1); assert.match(pushes[0].title, /validé/); assert.match(pushes[0].body, /8,1 km · 5'43\/km · 12° · WHOOP 9,4 — Ton ressenti/); assert.equal(pushes[0].url, '/?action=feel&k=extra_w1_s0');
  // 2e passage : rien de plus
  const r2 = await F.autovalidate.runAutoValidate(F.db, UID, T('2026-11-03T13:15:00Z'), deps());
  assert.equal(r2.out.length, 0); assert.equal(pushes.length, 1);
});

test('WHOOP absent : rien d\'écrit, en attente ; au bout de 4 h, notification « à valider toi-même »', async () => {
  const { F, deps, pushes, S } = setup();
  let r = await F.autovalidate.runAutoValidate(F.db, UID, T('2026-11-03T13:00:00Z'), deps({ workouts: async () => [] }));
  assert.equal(r.out[0].st, 'pending'); assert.ok(!S().extra_w1_s0_done); assert.equal(pushes.length, 0);
  assert.deepEqual(S()._autoval_log['9001'].missing, ['whoop']);
  // un entraînement WHOOP de la veille ne débloque rien
  r = await F.autovalidate.runAutoValidate(F.db, UID, T('2026-11-03T14:00:00Z'), deps({ workouts: async () => [Object.assign({}, workout, { start: '2026-11-02T11:01:00Z', end: '2026-11-02T11:48:00Z' })] }));
  assert.equal(r.out[0].st, 'pending'); assert.ok(!S().extra_w1_s0_done);
  r = await F.autovalidate.runAutoValidate(F.db, UID, T('2026-11-03T16:00:00Z'), deps({ workouts: async () => [] }));
  assert.equal(r.out[0].st, 'manual'); assert.ok(!S().extra_w1_s0_done);
  assert.equal(pushes.length, 1); assert.match(pushes[0].body, /entraînement WHOOP introuvable/); assert.equal(pushes[0].url, '/?action=validate');
});

test('météo ou détail Strava indisponibles : pas de validation ; désactivée : rien ne tourne', async () => {
  let s = setup();
  let r = await s.F.autovalidate.runAutoValidate(s.F.db, UID, T('2026-11-03T13:00:00Z'), s.deps({ hourly: async () => null }));
  assert.equal(r.out[0].st, 'pending'); assert.deepEqual(s.S()._autoval_log['9001'].missing, ['meteo']); assert.ok(!s.S().extra_w1_s0_done);
  s = setup();
  r = await s.F.autovalidate.runAutoValidate(s.F.db, UID, T('2026-11-03T13:00:00Z'), s.deps({ detail: async () => { throw new Error('429'); } }));
  assert.deepEqual(s.S()._autoval_log['9001'].missing, ['strava']); assert.ok(!s.S().extra_w1_s0_done);
  s = setup({ _autoval: 'off' });
  r = await s.F.autovalidate.runAutoValidate(s.F.db, UID, T('2026-11-03T13:00:00Z'), s.deps());
  assert.equal(r.skip, 'désactivée'); assert.ok(!s.S().extra_w1_s0_done);
});

test('bouton « J\'ai fini » : sans attendre 15 min, sans notification, puis « déjà validée » ; une sortie « à la main » est retentée', async () => {
  const { F, deps, pushes, S } = setup();
  // 3 min après la fin de la sortie (11h47:30 UTC)
  let r = await F.autovalidate.runAutoValidate(F.db, UID, T('2026-11-03T11:51:00Z'), deps(), { manual: true });
  assert.equal(r.out[0].st, 'ok'); assert.equal(r.out[0].title, 'Footing EF'); assert.equal(r.out[0].strain, 9.4);
  assert.ok(S().extra_w1_s0_done); assert.equal(pushes.length, 0, 'l\'app affiche le résultat : pas de notification');
  r = await F.autovalidate.runAutoValidate(F.db, UID, T('2026-11-03T11:55:00Z'), deps(), { manual: true });
  assert.equal(r.out[0].st, 'done');
  // planifié : rien avant 15 min
  const s2 = setup();
  r = await s2.F.autovalidate.runAutoValidate(s2.F.db, UID, T('2026-11-03T11:51:00Z'), s2.deps());
  assert.equal(r.out.length, 0); assert.ok(!s2.S().extra_w1_s0_done);
  // sortie passée « à la main » (4 h sans WHOOP) : le bouton la retente
  const s3 = setup();
  await s3.F.autovalidate.runAutoValidate(s3.F.db, UID, T('2026-11-03T16:00:00Z'), s3.deps({ workouts: async () => [] }));
  assert.equal(s3.S()._autoval_log['9001'].st, 'manual');
  r = await s3.F.autovalidate.runAutoValidate(s3.F.db, UID, T('2026-11-03T16:05:00Z'), s3.deps(), { manual: true });
  assert.equal(r.out[0].st, 'ok'); assert.ok(s3.S().extra_w1_s0_done);
});

test('fenêtre « Valider la séance » (mode fill) : les 3 sources de cette séance, RIEN n\'est écrit ; athlète : sans WHOOP', async () => {
  const { F, deps, pushes, S } = setup();
  const before = JSON.stringify(S());
  let r = await F.autovalidate.runAutoFill(F.db, UID, T('2026-11-03T12:30:00Z'), deps(), { fill: true, key: 'extra_w1_s0', date: '2026-11-03' });
  assert.equal(r.fill.activity.distanceKm, 8.1); assert.equal(r.fill.activity.allure, '5:43');
  assert.equal(r.fill.whoop.workout_strain, 9.4); assert.equal(r.fill.meteo.temperature, 12.4); assert.deepEqual(r.fill.missing, []);
  assert.equal(JSON.stringify(S()), before, 'aucune écriture'); assert.equal(pushes.length, 0);
  // WHOOP absent : signalé, le reste rempli
  r = await F.autovalidate.runAutoFill(F.db, UID, T('2026-11-03T12:30:00Z'), deps({ workouts: async () => [] }), { fill: true, key: 'extra_w1_s0', date: '2026-11-03' });
  assert.deepEqual(r.fill.missing, ['whoop']); assert.equal(r.fill.activity.distanceKm, 8.1);
  // pas de sortie ce jour-là / séance inconnue
  r = await F.autovalidate.runAutoFill(F.db, UID, T('2026-11-03T12:30:00Z'), deps({ runs: async () => [] }), { fill: true, key: 'extra_w1_s0', date: '2026-11-03' });
  assert.match(r.fill.reason, /aucune sortie Strava/);
  r = await F.autovalidate.runAutoFill(F.db, UID, T('2026-11-03T12:30:00Z'), deps(), { fill: true, key: 'extra_w9_s9' });
  assert.match(r.fill.reason, /introuvable/);
  // un autre compte : jamais le WHOOP de l'admin
  const other = 'athlete1'; F.db.data.users[other] = { state: JSON.parse(before) };
  let asked = false;
  r = await F.autovalidate.runAutoFill(F.db, other, T('2026-11-03T12:30:00Z'), deps({ workouts: async () => { asked = true; return [workout]; } }), { fill: true, key: 'extra_w1_s0', date: '2026-11-03' });
  assert.equal(asked, false); assert.equal(r.fill.whoop, null); assert.deepEqual(r.fill.missing, []);
});

test('sécurité : « J\'ai fini » ignore la sortie de la veille ; une sortie choisie d\'un autre jour est refusée ; WHOOP injoignable signalé', async () => {
  // sortie de la veille (lundi 2 nov.) non validée : le bouton du mardi ne la prend pas
  const veille = Object.assign({}, act, { id: 9100, start_date: '2026-11-02T11:00:00Z', start_date_local: '2026-11-02T12:00:00Z' });
  let s = setup();
  let r = await s.F.autovalidate.runAutoValidate(s.F.db, UID, T('2026-11-03T08:00:00Z'), s.deps({ runs: async () => [veille] }), { manual: true });
  assert.equal(r.out.length, 0); assert.ok(!s.S().extra_w1_s0_done);
  // fenêtre de validation : la sortie de la veille passée en « activityId » est refusée pour le mardi
  r = await s.F.autovalidate.runAutoFill(s.F.db, UID, T('2026-11-03T12:30:00Z'), s.deps({ runs: async () => [veille, act] }), { fill: true, key: 'extra_w1_s0', date: '2026-11-03', activityId: '9100' });
  assert.equal(r.fill.activity, undefined); assert.match(r.fill.reason, /aucune sortie Strava le mar\. 3 nov\./);
  // sans activityId : la sortie du mardi, pas celle de la veille
  r = await s.F.autovalidate.runAutoFill(s.F.db, UID, T('2026-11-03T12:30:00Z'), s.deps({ runs: async () => [veille, act] }), { fill: true, key: 'extra_w1_s0', date: '2026-11-03' });
  assert.equal(r.fill.activity.activityId, '9001');
  // WHOOP injoignable (null) ≠ aucun entraînement
  r = await s.F.autovalidate.runAutoFill(s.F.db, UID, T('2026-11-03T12:30:00Z'), s.deps({ workouts: async () => null }), { fill: true, key: 'extra_w1_s0', date: '2026-11-03' });
  assert.deepEqual(r.fill.missing, ['whoop']); assert.equal(r.fill.why.whoop, 'WHOOP injoignable');
});

test('position du téléphone envoyée par l\'app : météo relevée à cet endroit ; position invalide ignorée ; scan planifié = point de départ Strava', async () => {
  let at = null;
  const s = setup();
  const hourlyAt = async (a) => { at = [a.lat, a.lng]; return hourly; };
  let r = await s.F.autovalidate.runAutoFill(s.F.db, UID, T('2026-11-03T12:30:00Z'), s.deps({ hourly: hourlyAt }), { fill: true, key: 'extra_w1_s0', date: '2026-11-03', lat: 48.9, lng: 2.4 });
  assert.deepEqual(at, [48.9, 2.4]); assert.equal(r.fill.meteo.source, 'telephone'); assert.deepEqual(r.fill.meteo.coordonnees, { lat: 48.9, lng: 2.4 });
  r = await s.F.autovalidate.runAutoFill(s.F.db, UID, T('2026-11-03T12:30:00Z'), s.deps({ hourly: hourlyAt }), { fill: true, key: 'extra_w1_s0', date: '2026-11-03', lat: 'x', lng: 999 });
  assert.deepEqual(at, [48.84, 2.29]); assert.equal(r.fill.meteo.source, 'strava_gps');
  assert.equal(s.F.autovalidate.phonePos({ lat: 0, lng: 0 }), null);
  // « J'ai fini » avec la position du téléphone : séance validée, météo à cet endroit
  r = await s.F.autovalidate.runAutoValidate(s.F.db, UID, T('2026-11-03T11:51:00Z'), s.deps({ hourly: hourlyAt }), { manual: true, pos: { lat: 48.9, lng: 2.4 } });
  assert.equal(r.out[0].st, 'ok'); assert.deepEqual(at, [48.9, 2.4]);
  assert.equal(JSON.parse(s.S().extra_w1_s0_perf).meteo.source, 'telephone');
  // scan planifié (app fermée) : point de départ Strava
  const s2 = setup();
  await s2.F.autovalidate.runAutoValidate(s2.F.db, UID, T('2026-11-03T13:00:00Z'), s2.deps({ hourly: hourlyAt }));
  assert.deepEqual(at, [48.84, 2.29]); assert.equal(JSON.parse(s2.S().extra_w1_s0_perf).meteo.source, 'strava_gps');
});
