// Validation automatique : jamais sans Strava + l'entraînement WHOOP de la MÊME sortie + la météo du lieu / de l'heure
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, synthPlan } = require('../helpers/frontend');

// sortie Strava du mardi 3 nov. 2026, 12h00 Paris (11h00 UTC), 8,1 km en 46'20
const raw = (o) => Object.assign({ id: 9001, type: 'Run', sport_type: 'Run', start_date: '2026-11-03T11:00:00Z', start_date_local: '2026-11-03T12:00:00Z',
  distance: 8100, moving_time: 2780, elapsed_time: 2850, average_heartrate: 141, max_heartrate: 158, average_cadence: 86, total_elevation_gain: 22,
  start_latlng: [48.84, 2.29], name: 'Footing' }, o || {});
const wk = (o) => Object.assign({ id: 'w1', start: '2026-11-03T11:01:00Z', end: '2026-11-03T11:48:00Z', sport: 'running', strain: 9.4, avg_hr: 142, max_hr: 159, kcal: 610 }, o || {});
const hourly = { time: ['2026-11-03T11:00', '2026-11-03T12:00', '2026-11-03T13:00'], temperature_2m: [11.2, 12.4, 13.1], relative_humidity_2m: [80, 76, 70], apparent_temperature: [10, 11, 12], weather_code: [3, 2, 1], wind_speed_10m: [9, 11, 12] };
const NOW = Date.parse('2026-11-03T13:00:00Z');
function setup(o) {
  const st = synthPlan({ start: '2026-11-02' });
  // séance du mardi 3 nov. : footing 8 km
  st.extra_w1_s0 = JSON.stringify({ type: 'ef', km: 8, d: "Footing EF|5'45 — 6'10 /km", sched_date: '2026-11-03', sched_day: 2 });
  Object.assign(st, (o && o.state) || {});
  return { app: loadApp({ now: '2026-11-03T14:00:00+01:00', state: st }), st };
}
const ctx = (app, o) => Object.assign({ nowMs: NOW, today: '2026-11-03', detail: { laps: [], splits: [] }, workouts: [wk()], meteo: app.avMeteoFromHourly(hourly, app.avActFromStrava(raw())) }, o || {});

test('les 3 sources concordent : séance validée avec Strava, WHOOP de cette sortie et météo du lieu', () => {
  const { app, st } = setup();
  const act = app.avActFromStrava(raw()), D = app.avDecide(st, act, ctx(app));
  assert.equal(D.ok, true, D.reason);
  assert.equal(D.key, 'extra_w1_s0');
  assert.equal(D.perf.strava_id, '9001'); assert.equal(D.perf.pace, '5:43'); assert.equal(D.perf.dur, '46:20'); assert.equal(D.perf.hr, 141);
  assert.equal(D.perf.whoop.workout_strain, 9.4); assert.equal(D.perf.meteo.temperature, 12.4); assert.equal(D.perf.meteo.heure_cible, '12h00');
  assert.deepEqual(JSON.parse(JSON.stringify(D.perf.auto.src)), ['strava', 'whoop', 'meteo']);
  const up = app.avUpdates(st, D);
  assert.equal(up.extra_w1_s0_done, true); assert.equal(up.extra_w1_s0_km, 8.1);
});

test('WHOOP : un entraînement plus ancien (veille, ou fini avant la sortie) ne compte jamais', () => {
  const { app, st } = setup(), act = app.avActFromStrava(raw());
  const old = [wk({ id: 'veille', start: '2026-11-02T11:01:00Z', end: '2026-11-02T11:48:00Z' }), wk({ id: 'matin', start: '2026-11-03T06:00:00Z', end: '2026-11-03T06:45:00Z' })];
  const D = app.avDecide(st, act, ctx(app, { workouts: old }));
  assert.equal(D.ok, false); assert.deepEqual(JSON.parse(JSON.stringify(D.missing)), ['whoop']);
  // départ décalé de plus de 20 min, ou chevauchement trop faible
  assert.equal(app.avWhoop(act, [wk({ start: '2026-11-03T11:25:00Z', end: '2026-11-03T12:10:00Z' })]), null);
  assert.equal(app.avWhoop(act, [wk({ strain: null })]), null, 'effort WHOOP pas encore calculé');
  assert.equal(app.avWhoop(act, [wk({ sport: 'cycling' })]), null, 'autre sport');
  assert.ok(app.avWhoop(act, [wk()]).pct >= 90);
});

test('météo : obligatoire, au lieu et à l\'heure de la sortie ; sans GPS → pas de validation', () => {
  const { app, st } = setup(), act = app.avActFromStrava(raw());
  assert.deepEqual(JSON.parse(JSON.stringify(app.avDecide(st, act, ctx(app, { meteo: null })).missing)), ['meteo']);
  const other = Object.assign({}, ctx(app).meteo, { heure_cible: '18h00' });
  assert.equal(app.avDecide(st, act, ctx(app, { meteo: other })).ok, false, 'relevé d\'une autre heure');
  const noGps = app.avActFromStrava(raw({ start_latlng: [] }));
  assert.deepEqual(JSON.parse(JSON.stringify(app.avDecide(st, noGps, ctx(app)).missing)), ['gps']);
  assert.equal(app.avMeteoFromHourly(hourly, app.avActFromStrava(raw({ start_date_local: '2026-11-03T20:00:00Z' }))), null, 'heure absente du relevé');
});

test('Strava : séance unique et cohérente, sinon rien (ambiguïté, km incohérents, déjà validée, trop récente)', () => {
  const { app, st } = setup();
  assert.equal(app.avDecide(st, app.avActFromStrava(raw()), ctx(app, { detail: null })).ok, false, 'détail Strava manquant');
  assert.equal(app.avDecide(st, app.avActFromStrava(raw()), ctx(app, { nowMs: Date.parse('2026-11-03T11:55:00Z') })).wait, true, 'sortie finie il y a moins de 15 min');
  assert.match(app.avDecide(st, app.avActFromStrava(raw({ distance: 21000, moving_time: 6600, elapsed_time: 6700 })), ctx(app, { nowMs: NOW + 7200000 })).reason, /aucune séance/);
  assert.match(app.avDecide(st, app.avActFromStrava(raw({ type: 'Ride', sport_type: 'Ride' })), ctx(app)).reason, /pas une course/);
  // deux footings de 8 km le même jour : on ne choisit pas
  const two = setup({ state: { extra_w1_s3: JSON.stringify({ type: 'ef', km: 8, d: 'Footing bis', sched_date: '2026-11-03', sched_day: 2 }) } });
  assert.match(two.app.avDecide(two.st, two.app.avActFromStrava(raw()), ctx(two.app)).reason, /deux séances/);
  // déjà validée à la main
  const done = setup({ state: { extra_w1_s0_done: true, extra_w1_s0_km: 8.1, extra_w1_s0_perf: JSON.stringify({ date: '2026-11-03' }) } });
  assert.equal(done.app.avDecide(done.st, done.app.avActFromStrava(raw()), ctx(done.app)).already, true);
  // sortie déjà rattachée à une séance
  const used = setup({ state: { extra_w1_s1_done: true, extra_w1_s1_km: 10, extra_w1_s1_perf: JSON.stringify({ date: '2026-11-04', strava_id: '9001' }) } });
  assert.equal(used.app.avDecide(used.st, used.app.avActFromStrava(raw()), ctx(used.app)).already, true);
});

test('bouton « J\'ai fini » : état de chaque source lisible', () => {
  const { app } = setup();
  let V = app.avNowView({ success: true, out: [] });
  assert.equal(V.phase, 'wait'); assert.match(V.msg, /pas encore sur Strava/);
  V = app.avNowView({ success: true, out: [{ st: 'pending', missing: ['whoop'], km: 8.1, title: 'Footing EF', date: '2026-11-03' }] });
  assert.equal(V.phase, 'wait');
  assert.deepEqual(JSON.parse(JSON.stringify(V.rows.map((r) => r.st))), ['ok', 'wait', 'ok']);
  V = app.avNowView({ success: true, out: [{ st: 'pending', missing: ['gps'], km: 8.1 }] });
  assert.equal(V.rows[2].st, 'ko'); assert.match(V.msg, /GPS/);
  V = app.avNowView({ success: true, out: [{ st: 'skip', reason: 'aucune séance' }, { st: 'ok', key: 'extra_w1_s0', title: 'Footing EF', km: 8.1, pace: '5:43', temp: 12.4, strain: 9.4, date: '2026-11-03' }] });
  assert.equal(V.phase, 'ok'); assert.equal(V.key, 'extra_w1_s0'); assert.match(V.rows[0].t, /8,1 km · 5'43\/km/);
  assert.equal(app.avNowView({ success: true, skip: 'désactivée' }).phase, 'off');
  assert.equal(app.avNowView({ success: false, error: 'x' }).phase, 'error');
});

test('fenêtre « Valider la séance » : la sortie du JOUR choisi, jamais la veille, jamais une sortie rattachée ou validée ailleurs', () => {
  const { app, st } = setup({ state: { extra_w1_s1_done: true, extra_w1_s1_km: 7, extra_w1_s1_perf: JSON.stringify({ date: '2026-11-03', strava_id: '9002' }) } });
  const a1 = app.avActFromStrava(raw()), a2 = app.avActFromStrava(raw({ id: 9002, distance: 7000 }));
  const veille = app.avActFromStrava(raw({ id: 9003, start_date: '2026-11-02T11:00:00Z', start_date_local: '2026-11-02T12:00:00Z' }));
  let P = app.avFillPick(st, 'extra_w1_s0', [veille, a2, a1], '2026-11-03');
  assert.equal(P.act.id, '9001', 'la 9002 appartient déjà à une autre séance, la 9003 est de la veille');
  // seule une sortie de la veille : refusée, message avec la date cherchée
  P = app.avFillPick(st, 'extra_w1_s0', [veille], '2026-11-03');
  assert.equal(P.act, undefined); assert.match(P.reason, /aucune sortie Strava le mar\. 3 nov\./);
  // sortie du lendemain : refusée aussi
  assert.equal(app.avFillPick(st, 'extra_w1_s0', [a1], '2026-11-02').act, undefined);
  // validée à la main pour une autre séance ce jour-là (sans identifiant Strava) : jamais reprise
  const { app: app2, st: st2 } = setup({ state: { extra_w1_s1_done: true, extra_w1_s1_km: 8.1, extra_w1_s1_perf: JSON.stringify({ date: '2026-11-03' }) } });
  assert.equal(app2.avFillPick(st2, 'extra_w1_s0', [app2.avActFromStrava(raw())], '2026-11-03').act, undefined);
  // trop courte (< 8 min) : ignorée
  assert.equal(app.avFillPick(st, 'extra_w1_s0', [app.avActFromStrava(raw({ moving_time: 300, elapsed_time: 300 }))], '2026-11-03').act, undefined);
  // deux sorties le même jour aux km voisins : on demande laquelle, jamais deviné
  const b = app.avActFromStrava(raw({ id: 9004, distance: 7900, start_date: '2026-11-03T17:00:00Z', start_date_local: '2026-11-03T18:00:00Z' }));
  P = app.avFillPick(st, 'extra_w1_s0', [a1, b], '2026-11-03');
  assert.deepEqual(Array.from(P.choices, (x) => x.id).sort(), ['9001', '9004']);
});

test('fenêtre « Valider la séance » : sources de CETTE sortie, et ce qui manque avec la raison', () => {
  const { app } = setup(), act = app.avActFromStrava(raw());
  const meteo = app.avMeteoFromHourly(hourly, act);
  let F = app.avFillResult(act, { laps: [{ index: 1, distanceKm: 8.1 }], calories: 600 }, [wk()], meteo);
  assert.deepEqual([...F.missing], []);
  assert.equal(F.activity.distanceKm, 8.1); assert.equal(F.activity.duree, '46:20'); assert.equal(F.activity.allure, '5:43'); assert.equal(F.activity.fcMoyenne, 141);
  assert.equal(F.activity.activityId, '9001'); assert.equal(F.activity.calories, 600);
  assert.equal(F.whoop.workout_strain, 9.4); assert.equal(F.whoop.actId, '9001'); assert.equal(F.meteo.temperature, 12.4); assert.equal(F.meteo.actId, '9001');
  // WHOOP de la veille : refusé ; WHOOP injoignable ; entraînement de la sortie pas encore calculé
  F = app.avFillResult(act, {}, [wk({ start: '2026-11-02T11:01:00Z', end: '2026-11-02T11:48:00Z' })], meteo);
  assert.equal(F.whoop, null); assert.deepEqual([...F.missing], ['whoop']); assert.equal(F.why.whoop, 'aucun entraînement WHOOP pendant ta sortie');
  assert.equal(app.avFillResult(act, {}, null, meteo).why.whoop, 'WHOOP injoignable');
  assert.equal(app.avFillResult(act, {}, [wk({ strain: null })], meteo).why.whoop, 'effort WHOOP en cours de calcul');
  // météo d'une autre heure / d'un autre jour : refusée
  assert.deepEqual([...app.avFillResult(act, {}, [wk()], Object.assign({}, meteo, { heure_cible: '18h00' })).missing], ['meteo']);
  assert.deepEqual([...app.avFillResult(act, {}, [wk()], Object.assign({}, meteo, { date: '2026-11-02' })).missing], ['meteo']);
  // sans détail Strava ; sans GPS (athlète : pas de WHOOP)
  F = app.avFillResult(act, null, [wk()], meteo);
  assert.deepEqual([...F.missing], ['strava']); assert.match(F.why.strava, /tours/);
  F = app.avFillResult(app.avActFromStrava(raw({ start_latlng: [] })), {}, [], null, { whoop: false });
  assert.deepEqual([...F.missing], ['meteo']); assert.equal(F.why.meteo, 'sortie sans GPS'); assert.equal(F.meteo, null);
});

test('message : ce qui est importé et ce qui manque encore (avec la raison)', () => {
  const { app } = setup(), act = app.avActFromStrava(raw()), meteo = app.avMeteoFromHourly(hourly, act);
  let M = app.avFillMsg(app.avFillResult(act, {}, [wk()], meteo), true);
  assert.equal(M.st, 'ok'); assert.equal(M.lines[0], '✓ Strava, WHOOP et météo importés');
  M = app.avFillMsg(app.avFillResult(act, {}, [wk({ strain: null })], meteo), true);
  assert.equal(M.st, 'ko'); assert.equal(M.lines[0], '✓ Strava et météo importés'); assert.equal(M.lines[1], 'Il manque encore : WHOOP (effort WHOOP en cours de calcul)');
  M = app.avFillMsg(app.avFillResult(act, {}, [], null), true);
  assert.equal(M.lines[0], '✓ Strava importé'); assert.match(M.lines[1], /WHOOP \(aucun entraînement.*\) · météo \(relevé météo indisponible\)/);
  // athlète : WHOOP jamais demandé
  M = app.avFillMsg(app.avFillResult(act, {}, null, meteo, { whoop: false }), false);
  assert.equal(M.st, 'ok'); assert.equal(M.lines[0], '✓ Strava et météo importés');
  // pas de sortie Strava mais météo relevée à la position du téléphone : dit clairement
  M = app.avFillMsg({ missing: ['strava'], reason: 'aucune sortie Strava le mar. 3 nov.', meteo }, true);
  assert.equal(M.st, 'ko');
  assert.deepEqual([...M.lines], ['✓ Météo importée', 'Il manque encore : Strava (aucune sortie Strava le mar. 3 nov.) · WHOOP (après Strava)', 'Change la date si tu as couru un autre jour']);
  M = app.avFillMsg({ missing: ['strava'], reason: 'aucune sortie Strava le mar. 3 nov.' }, true);
  assert.equal(M.st, 'ko'); assert.deepEqual([...M.lines], ['aucune sortie Strava le mar. 3 nov.', 'Change la date si tu as couru un autre jour']);
});
