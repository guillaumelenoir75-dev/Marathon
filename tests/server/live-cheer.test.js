// Encouragements des amis : contrôle du message, limites par appareil, notification pendant la course seulement
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFunctions } = require('../helpers/functions');

const RACE = { id: 'novembrun-2026', name: "10km Novemb'Run", date: '2026-11-22', start: '10:00' };
const T0 = Date.parse('2026-11-22T10:20:00+01:00');
const load = (live) => loadFunctions({ data: { live: Object.assign({ race: RACE }, live) }, modules: ['live.js'] });

test('message nettoyé, rangé pour Guillaume, compté pour la page des amis, notifié pendant la course', async () => {
  const F = load({ status: 'running', startedAt: T0 - 1200000 }), sent = [];
  const send = async (t, b, tag, url) => { sent.push({ t, b, tag, url }); return true; };
  const r = await F.live.runCheer(F.db, { name: '  Marie ', text: 'Allez   Guillaume <b>!</b>' }, 'dev1', T0, send, '2026-11-22', 'ip1');
  assert.equal(r.status, 200); assert.equal(r.out.count, 1); assert.equal(r.out.pushed, true);
  const m = Object.values(F.db.data.live_cheers['novembrun-2026'])[0];
  assert.equal(m.n, 'Marie'); assert.equal(m.t, 'Allez Guillaume b ! /b', 'balises neutralisées'); assert.equal(m.el, 1200000); assert.equal(m.st, 'running');
  assert.equal(F.db.data.live.cheers, 1);
  assert.deepEqual(sent[0], { t: '💬 Marie', b: m.t, tag: 'cheer-' + r.out.id, url: '/?action=live' });
});

test('refusés : message vide, lien, trop rapproché, trop nombreux ; pas de course = rien', async () => {
  const F = load({ status: 'running', startedAt: T0 });
  const send = async () => true;
  assert.equal((await F.live.runCheer(F.db, { text: '   ' }, 'd', T0, send, '2026-11-22', 'ip')).status, 400);
  assert.equal((await F.live.runCheer(F.db, { text: 'va sur www.promo.com' }, 'd', T0, send, '2026-11-22', 'ip')).status, 400);
  assert.equal((await F.live.runCheer(F.db, { text: 'Go !' }, 'd', T0, send, '2026-11-22', 'ip')).status, 200);
  assert.equal((await F.live.runCheer(F.db, { text: 'Encore !' }, 'd', T0 + 5000, send, '2026-11-22', 'ip')).status, 429, '20 s entre deux messages');
  assert.equal((await F.live.runCheer(F.db, { text: 'Moi aussi !' }, 'd2', T0 + 5000, send, '2026-11-22', 'ip')).status, 200, 'un autre ami au même endroit passe');
  for (let i = 1; i < 15; i++) assert.equal((await F.live.runCheer(F.db, { text: 'Go ' + i }, 'd', T0 + i * 21000, send, '2026-11-22', 'ip')).status, 200);
  assert.equal((await F.live.runCheer(F.db, { text: 'Go 16' }, 'd', T0 + 16 * 21000, send, '2026-11-22', 'ip')).status, 429, '15 messages au plus par appareil');
  assert.equal(F.live.cheerCheck({ text: 'x'.repeat(400) }).text.length, 140);
  const G = loadFunctions({ data: {}, modules: ['live.js'] });
  assert.equal((await G.live.runCheer(G.db, { text: 'Go' }, 'd', T0, send, '2026-11-22', 'ip')).status, 409);
});

test('notification : en course et le jour J avant le départ ; jamais la veille, pendant un essai ni après l\'arrivée ; 4 par minute au plus', async () => {
  const P = (live, today) => loadFunctions({ modules: ['live.js'] }).live.cheerPushNow(Object.assign({ race: RACE }, live), today);
  assert.equal(P({ status: 'running' }, '2026-11-22'), true);
  assert.equal(P({ status: 'idle' }, '2026-11-22'), true);
  assert.equal(P({ status: 'idle' }, '2026-11-21'), false);
  assert.equal(P({ status: 'running', test: true }, '2026-11-22'), false);
  assert.equal(P({ status: 'finished' }, '2026-11-22'), false);
  const F = load({ status: 'running', startedAt: T0 }); let n = 0;
  const send = async () => { n++; return true; };
  for (let i = 0; i < 6; i++) await F.live.runCheer(F.db, { text: 'Go ' + i }, 'dev' + i, T0 + i * 1000, send, '2026-11-22', 'ip' + i);
  assert.equal(n, 4, 'au-delà de 4 par minute, gardés dans l\'app sans notification'); assert.equal(F.db.data.live.cheers, 6);
  const L = load({ status: 'finished', startedAt: T0 - 3e6, finishedAt: T0 - 7 * 3600000 });
  assert.equal((await L.live.runCheer(L.db, { text: 'Bravo' }, 'd', T0, send, '2026-11-22', 'ip')).status, 409, 'plus de messages 6 h après l\'arrivée');
});
