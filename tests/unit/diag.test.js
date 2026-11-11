// Diagnostic : vraies erreurs de l'app journalisées ; bruit hors de l'app ignoré (script d'un autre site, base locale Safari)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

test('journal : « Script error. » et l\'erreur IndexedDB de Safari ignorés, y compris déjà enregistrés ; les autres gardés', () => {
  const store = {};
  const ctx = { console, JSON, Date, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } };
  vm.createContext(ctx);
  // déjà enregistrées avant la correction : écartées à la lecture
  store.pm_errors = JSON.stringify([{ m: 'Script error.', w: '', n: 1, at: '2026-11-09T07:35:00Z' }, { m: 'Promesse rejetée : Attempt to get records from database without an in-progress transaction', w: '', n: 2, at: '2026-11-02T14:47:00Z' }]);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../public-static/src/diag.js'), 'utf8') + ';this._diagGet=_diagGet;this.diagLog=diagLog;this.DIAG_ERR=DIAG_ERR;', ctx);
  assert.equal(ctx._diagGet(ctx.DIAG_ERR).length, 0);
  ctx.diagLog('Script error.', '');
  ctx.diagLog('Promesse rejetée : Attempt to get records from database without an in-progress transaction', '');
  ctx.diagLog('prSessions is not defined', 'bundle-1.js:12');
  const L = ctx._diagGet(ctx.DIAG_ERR);
  assert.deepEqual(L.map((e) => e.m), ['prSessions is not defined']);
});
