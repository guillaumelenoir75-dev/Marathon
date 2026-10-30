// Enregistrement ciblé (sync.js) : seules les clés modifiées partent, un refus de la base les renvoie, état remplacé = écriture complète
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load(){
  const calls = [];
  const mkRef = (p) => ({ toString: () => 'https://x.firebaseio.com/' + p, update: (o) => { calls.push(['update', p, JSON.parse(JSON.stringify(o))]); return calls.fail ? Promise.reject(new Error('refus')) : Promise.resolve(); },
    set: (o) => { calls.push(['set', p, Object.keys(o).length]); return Promise.resolve(); } });
  const store = {};
  const ctx = { console, setTimeout, Promise, JSON, Object, Date,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    currentUserId: 'U1', state: {}, dbRef: null };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../public-static/src/sync.js'), 'utf8') + ';this.syncSave=syncSave;this.syncBaseReset=syncBaseReset;this.syncApplyPending=syncApplyPending;this.syncDiff=syncDiff;', ctx);
  ctx.dbRef = mkRef('users/U1/state');
  return { ctx, calls, store, mkRef };
}

test('seules les clés modifiées, ajoutées ou retirées sont écrites ; rien si rien n\'a changé', async () => {
  const { ctx, calls } = load();
  vm.runInContext('state = { a: 1, b: { x: 1 }, c: "z" }; syncBaseReset(JSON.parse(JSON.stringify(state)));', ctx);
  vm.runInContext('state.b.x = 2; delete state.c; state.d = [1]; state.e = undefined;', ctx);
  await ctx.syncSave();
  assert.deepEqual(calls, [['update', 'users/U1/state', { b: { x: 2 }, c: null, d: [1] }]]);
  await ctx.syncSave();
  assert.equal(calls.length, 1, 'rien de nouveau : aucune écriture');
});

test('écriture refusée : renvoyée à la sauvegarde suivante, pas gardée pour le prochain lancement', async () => {
  const { ctx, calls, store } = load();
  vm.runInContext('state = { a: 1 }; syncBaseReset({ a: 1 });', ctx);
  calls.fail = true; vm.runInContext('state.a = 2;', ctx);
  await ctx.syncSave();
  assert.equal(store.pm_pending_U1, undefined, 'refus de la base : pas rejoué au lancement');
  calls.fail = false; await ctx.syncSave();
  assert.deepEqual(calls.map((c) => c[2]), [{ a: 2 }, { a: 2 }]);
});

test('hors ligne : en attente sur le téléphone, rejouée sur l\'état chargé ; état remplacé (athlète, copie) = écriture complète', async () => {
  const { ctx, calls, store, mkRef } = load();
  vm.runInContext('state = { a: 1 }; syncBaseReset({ a: 1 });', ctx);
  ctx.dbRef.update = () => new Promise(() => {});   // pas de réseau : jamais acquittée
  vm.runInContext('state.a = 5; state.n = "x";', ctx);
  ctx.syncSave();
  assert.deepEqual(JSON.parse(store.pm_pending_U1).up, { a: 5, n: 'x' });
  vm.runInContext('state = { a: 1, srv: 9 };', ctx);
  assert.equal(ctx.syncApplyPending(), 2);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.state)), { a: 5, srv: 9, n: 'x' });
  ctx.dbRef = mkRef('users/ATHLETE/state'); vm.runInContext('state = { z: 1 };', ctx);
  await ctx.syncSave();
  assert.deepEqual(calls.slice(-1)[0], ['set', 'users/ATHLETE/state', 1]);
});
