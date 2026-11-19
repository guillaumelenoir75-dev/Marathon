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

test('valeur refusée par Firebase (undefined au fond d\'un objet, NaN) : nettoyée avant l\'envoi, jamais d\'erreur qui casse l\'écran', async () => {
  const { ctx, calls } = load();
  // comme la vraie base : update() lève tout de suite sur undefined / NaN, à n'importe quelle profondeur
  const bad = (v) => v === undefined || (typeof v === 'number' && !isFinite(v)) || (v && typeof v === 'object' && Object.keys(v).some((k) => bad(v[k])));
  ctx.dbRef.update = (o) => { if (Object.keys(o).some((k) => bad(o[k]))) throw new Error('contains undefined'); calls.push(['update', JSON.parse(JSON.stringify(o))]); return Promise.resolve(); };
  vm.runInContext('state = { a: 1 }; syncBaseReset({ a: 1 });', ctx);
  vm.runInContext('state._plan_reviews = [{ n: 1, changes: [{ ref: "k", detBefore: undefined, src: undefined, km: NaN, l: [1, undefined] }] }]; state.x = NaN;', ctx);
  await ctx.syncSave();
  assert.deepEqual(calls, [['update', { _plan_reviews: [{ n: 1, changes: [{ ref: 'k', km: null, l: [1, null] }] }], x: null }]]);
  // même une écriture qui lève quand même : promesse rejetée, pas d'exception pour l'appelant
  ctx.dbRef.update = () => { throw new Error('refus immédiat'); };
  vm.runInContext('state.a = 2;', ctx);
  await assert.doesNotReject(() => ctx.syncSave());
});

test('écriture refusée par la base : gardée sur le téléphone pour « Santé de l\'app » (pm_sync_err)', async () => {
  const { ctx, calls, store } = load();
  vm.runInContext('state = { a: 1 }; syncBaseReset({ a: 1 });', ctx);
  calls.fail = true; vm.runInContext('state.a = 2; state.b = 3;', ctx);
  await ctx.syncSave();
  const L = JSON.parse(store.pm_sync_err);
  assert.equal(L.length, 1); assert.equal(L[0].m, 'refus'); assert.deepEqual(L[0].keys, ['a', 'b']);
});

// copie hors ligne : complète, sinon allégée (historiques laissés en ligne), sinon retirée et signalée
test('copie hors ligne : allégée quand le téléphone manque de place, issue gardée pour Santé de l\'app', () => {
  const { ctx, store } = load();
  vm.runInContext('this.syncCacheState=syncCacheState;this.syncSlimState=syncSlimState;', ctx);
  ctx.dbRef = { toString: () => 'https://x.firebaseio.com/users/U1/state' };
  ctx.state = { extra_w1_s0: '{"km":8}', _coach_history: 'x'.repeat(5000), _plan_chat: { msgs: [] }, whoop_data: { a: 1 } };
  ctx.syncCacheState(true);
  assert.equal(JSON.parse(store.pm_cache_info).mode, 'full');
  // place limitée : la copie complète est refusée, l'allégée passe
  const set = ctx.localStorage.setItem; ctx.localStorage.setItem = (k, v) => { if (k === 'pm_state_U1' && v.length > 3000) throw new Error('QuotaExceededError'); set(k, v); };
  ctx.syncCacheState(true);
  const c = JSON.parse(store.pm_state_U1), I = JSON.parse(store.pm_cache_info);
  assert.equal(I.mode, 'slim'); assert.ok(I.full > I.ko);
  assert.equal(c._coach_history, undefined); assert.equal(c._plan_chat, undefined); assert.deepEqual(JSON.parse(JSON.stringify(c.whoop_data)), { a: 1 }); assert.ok(c.extra_w1_s0);
  // même allégée trop grosse : copie retirée
  ctx.localStorage.setItem = (k, v) => { if (k === 'pm_state_U1') throw new Error('QuotaExceededError'); set(k, v); };
  ctx.syncCacheState(true);
  assert.equal(store.pm_state_U1, undefined); assert.equal(JSON.parse(store.pm_cache_info).mode, 'none');
});

// historique du Coach sorti de l'état : recopié une fois à part (users/{uid}/side), retiré de l'état sans être réécrit à null
test('données à part : historique du Coach recopié dans side/ puis retiré de l\'état ; lu à part ensuite', async () => {
  const { ctx } = load();
  vm.runInContext('this.sideMigrate=sideMigrate;this.sideGet=sideGet;this.syncDiff=syncDiff;', ctx);
  const db = {}, ref = (p) => ({ toString: () => 'https://x.firebaseio.com/' + p, child: (c) => ref(p + '/' + c), get parent() { return ref(p.split('/').slice(0, -1).join('/')); },
    once: async () => ({ val: () => (p in db ? db[p] : null) }), set: async (v) => { db[p] = v; }, remove: async () => { delete db[p]; } });
  ctx.dbRef = ref('users/U1/state');
  ctx.state = { a: 1, _coach_history: '[{"role":"user","content":"x"}]' };
  ctx.syncBaseReset(JSON.parse(JSON.stringify(ctx.state)));
  db['users/U1/state/_coach_history'] = ctx.state._coach_history;
  assert.equal(await ctx.sideMigrate(), 1);
  assert.equal(db['users/U1/side/_coach_history'], '[{"role":"user","content":"x"}]');
  assert.equal(db['users/U1/state/_coach_history'], undefined);
  assert.equal(ctx.state._coach_history, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.syncDiff())), {}, 'rien à réécrire');
  assert.equal(await ctx.sideGet('_coach_history'), '[{"role":"user","content":"x"}]');
  assert.equal(await ctx.sideMigrate(), 0, 'une seule fois');
});
