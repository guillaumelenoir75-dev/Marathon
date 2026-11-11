// Santé de l'app côté serveur : relevés healthMark, écran appHealth (admin seulement), alerte healthWatch quand la liste change
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFunctions, callHttp } = require('../helpers/functions');

const ADMIN_UID = 'WkEWrmnYWuUNkGLrwXf9HhaJWfh1';
const H1 = 3600000;

test('healthMark : succès et échec gardés avec leur date, jamais d\'erreur levée', async () => {
  const F = loadFunctions({ modules: ['health.js'] });
  await F.helpers.healthMark('strava', true, 'jeton valide', F.db);
  await F.helpers.healthMark('strava', false, 'renouvellement refusé (HTTP 401)', F.db);
  const r = F.db.data._health.strava;
  assert.equal(r.ok, false); assert.ok(r.lastOk && r.lastErr >= r.lastOk); assert.equal(r.err, 'renouvellement refusé (HTTP 401)'); assert.equal(r.msg, 'jeton valide');
  await assert.doesNotReject(() => F.helpers.healthMark('x', true, 'm', { ref: () => { throw new Error('base injoignable'); } }));
});

test('appHealth : liste des points pour l\'admin, refusé à un athlète', async () => {
  const now = Date.now();
  const data = { users: { [ADMIN_UID]: { state: { strava_token: { access_token: 'a' }, _push_sub: { e: 1 } } } }, _health: { strava: { ok: true, lastOk: now - H1, at: now - H1 } } };
  const F = loadFunctions({ data, modules: ['health.js'] });
  const r = await callHttp(F.health.appHealth, {});
  assert.equal(r.out.success, true);
  const S = r.out.items.find((i) => i.key === 'strava');
  assert.equal(S.status, 'ok'); assert.match(S.detail, /il y a 1 h/);
  const A = loadFunctions({ data, modules: ['health.js'], athlete: true });
  assert.equal((await callHttp(A.health.appHealth, {})).status, 403);
});

test('healthWatch : notification à la 1re panne, pas de répétition tant que rien ne change, nouvelle panne → nouvelle alerte, réparé → remis à zéro', async () => {
  const now = Date.now();
  const st = { strava_token: { access_token: 'a' }, _push_sub: { e: 1 }, whoop_token: { access_token: 'w' }, whoop_data: { updatedAt: new Date(now - 30 * H1).toISOString() } };
  const data = { users: { [ADMIN_UID]: { state: st } }, _health: { autoval: { ok: true, lastOk: now - 600000, at: now }, autopilot: { ok: true, lastOk: now - H1, at: now }, calendar: { ok: true, lastOk: now - H1, at: now } } };
  const F = loadFunctions({ data, modules: ['health.js'] });
  const sent = [];
  const send = async (t, b) => { sent.push(t + ' | ' + b); };
  let r = await F.health.runHealthWatch(F.db, now, send);
  assert.equal(r.sent, true); assert.equal(sent.length, 1); assert.match(sent[0], /1 panne \| WHOOP : Données il y a 30 h/);
  r = await F.health.runHealthWatch(F.db, now, send);
  assert.equal(r.sent, false); assert.equal(sent.length, 1, 'même panne : pas de nouvelle notification');
  delete F.db.data.users[ADMIN_UID].state._push_sub;
  r = await F.health.runHealthWatch(F.db, now, send);
  assert.equal(r.sent, true); assert.match(sent[1], /2 pannes/);
  F.db.data.users[ADMIN_UID].state._push_sub = { e: 1 };
  F.db.data.users[ADMIN_UID].state.whoop_data.updatedAt = new Date(now - 600000).toISOString();
  r = await F.health.runHealthWatch(F.db, now, send);
  assert.equal(r.sent, false); assert.equal(F.db.data._health._alert.keys, '', 'tout réparé : alerte remise à zéro');
});
