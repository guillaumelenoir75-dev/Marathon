// Santé de l'app : statut de chaque branchement / tâche d'après l'état et les relevés du serveur, alertes, téléphone
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/frontend');

const NOW = Date.parse('2026-11-11T10:00:00Z'), H1 = 3600000;
const J = (o) => JSON.parse(JSON.stringify(o));
const by = (items) => { const o = {}; items.forEach((i) => { o[i.key] = i; }); return o; };
const okState = () => ({ strava_token: { access_token: 'a' }, whoop_token: { access_token: 'w', refresh_token: 'r' }, whoop_data: { updatedAt: new Date(NOW - H1).toISOString() },
  _push_sub: { endpoint: 'x' }, _cal_token: 't', _autopilot_last: { at: new Date(NOW - 6 * H1).toISOString() } });
const okH = () => ({ strava: { at: NOW - H1, ok: true, lastOk: NOW - H1 }, push: { at: NOW - 2 * H1, ok: true, lastOk: NOW - 2 * H1 }, brief: { ok: true, lastOk: NOW - 26 * H1, at: NOW - 26 * H1 },
  autopilot: { ok: true, lastOk: NOW - 6 * H1, at: NOW - 6 * H1 }, autoval: { ok: true, lastOk: NOW - 600000, at: NOW - 600000 }, calendar: { ok: true, lastOk: NOW - 3 * H1, at: NOW - 3 * H1, msg: '24 entrées' } });

test('tout fonctionne : chaque point au vert avec la date de son dernier succès', () => {
  const app = loadApp({ now: '2026-11-11T11:00:00+01:00', state: {} });
  const items = J(app.healthStatus(okState(), okH(), NOW)), B = by(items);
  assert.deepEqual(items.map((i) => i.key), ['strava', 'whoop', 'push', 'brief', 'autopilot', 'autoval', 'calendar']);
  assert.ok(items.every((i) => i.status === 'ok'), items.map((i) => i.key + ':' + i.status).join(' '));
  assert.match(B.whoop.detail, /il y a 1 h/); assert.match(B.calendar.detail, /il y a 3 h · 24 entrées/);
  assert.equal(J(app.healthSummary(items)).text, 'Tout fonctionne');
  assert.equal(app.healthAlertText(items), null);
});

test('pannes : jeton Strava refusé, WHOOP muet 30 h, notifications coupées, validation auto arrêtée, calendrier plus lu', () => {
  const app = loadApp({ now: '2026-11-11T11:00:00+01:00', state: {} });
  const st = okState(), H = okH();
  H.strava = { at: NOW - H1, ok: false, lastOk: NOW - 50 * H1, lastErr: NOW - H1, err: 'renouvellement refusé (HTTP 401)' };
  st.whoop_data.updatedAt = new Date(NOW - 30 * H1).toISOString();
  delete st._push_sub;
  H.autoval = { ok: true, lastOk: NOW - 9 * H1, at: NOW - 9 * H1 };
  H.calendar = { ok: true, lastOk: NOW - 4 * 24 * H1, at: NOW - 4 * 24 * H1 };
  st._autopilot = 'off';
  const items = J(app.healthStatus(st, H, NOW)), B = by(items);
  assert.equal(B.strava.status, 'bad'); assert.match(B.strava.detail, /HTTP 401.*reconnecte Strava/); assert.equal(B.strava.fix, 'strava');
  assert.equal(B.whoop.status, 'bad'); assert.match(B.whoop.detail, /il y a 30 h/);
  assert.equal(B.push.status, 'bad'); assert.equal(B.autoval.status, 'bad'); assert.equal(B.calendar.status, 'bad'); assert.match(B.calendar.detail, /il y a 4 j/);
  assert.equal(B.autopilot.status, 'off', 'désactivé : pas une panne');
  assert.equal(B.brief.status, 'ok');
  const S = J(app.healthSummary(items)); assert.equal(S.worst, 'bad'); assert.equal(S.bad, 5);
  const A = J(app.healthAlertText(items));
  assert.equal(A.keys, 'autoval,calendar,push,strava,whoop'); assert.match(A.title, /5 pannes/); assert.ok(A.body.length <= 180);
  // échec ancien suivi d'un succès : réparé
  H.strava = { at: NOW, ok: true, lastOk: NOW, lastErr: NOW - 5 * H1, err: 'x' };
  assert.equal(by(J(app.healthStatus(st, H, NOW))).strava.status, 'ok');
  // sans connexion : « non connecté », jamais une panne
  const off = by(J(app.healthStatus({}, {}, NOW)));
  assert.equal(off.strava.status, 'off'); assert.equal(off.whoop.status, 'off'); assert.equal(off.calendar.status, 'off');
});

test('téléphone : écritures refusées par la base, écritures en attente, erreurs de l\'app', () => {
  const app = loadApp({ now: '2026-11-11T11:00:00+01:00', state: {} });
  const iso = (ms) => new Date(ms).toISOString();
  let L = by(J(app.healthLocalItems({ syncErr: [{ at: iso(NOW - H1), m: 'Reference.update failed: contains undefined' }], jsErr: [{ at: iso(NOW - 2 * H1), m: 'x is not a function', n: 3 }] }, NOW)));
  assert.equal(L.save.status, 'bad'); assert.match(L.save.detail, /1 refusé en 7 j · Reference.update failed/);
  assert.equal(L.js.status, 'warn'); assert.match(L.js.detail, /^3 en 7 j/); assert.equal(L.js.fix, 'diag');
  L = by(J(app.healthLocalItems({ pending: { n: 2, at: NOW - 20 * 60000 }, syncErr: [{ at: iso(NOW - 9 * 24 * H1), m: 'vieux' }] }, NOW)));
  assert.equal(L.save.status, 'warn'); assert.match(L.save.detail, /2 modifications en attente depuis 20 min/);
  assert.equal(L.js.status, 'ok');
});
