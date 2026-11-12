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

test('erreurs attrapées (diagSilent) : journalisées et marquées, refus attendus du navigateur ignorés, ne lève jamais', () => {
  const store = {};
  const ctx = { console: { warn() {} }, JSON, Date, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../public-static/src/diag.js'), 'utf8') + ';this._diagGet=_diagGet;this.diagSilent=diagSilent;this.DIAG_ERR=DIAG_ERR;', ctx);
  ctx.diagSilent(new TypeError("Cannot read properties of undefined (reading 'km')"), 'my-day:mjSteps');
  ctx.diagSilent(new TypeError("Cannot read properties of undefined (reading 'km')"), 'my-day:mjSteps');
  const q = new Error('quota'); q.name = 'QuotaExceededError'; ctx.diagSilent(q, 'x');
  const s = new Error('interdit'); s.name = 'SecurityError'; ctx.diagSilent(s, 'x');
  ctx.diagSilent(null, 'y');                                       // valeur bizarre : pas d'exception
  const L = ctx._diagGet(ctx.DIAG_ERR);
  assert.equal(L.length, 2);
  const m = L.find((e) => e.w === 'my-day:mjSteps');
  assert.equal(m.n, 2, 'sans doublon : compteur'); assert.equal(m.s, 1, 'marquée « attrapée »');
  ctx.localStorage.setItem = () => { throw new Error('plein'); };
  assert.doesNotThrow(() => ctx.diagSilent(new Error('z'), 'z'));
});

// le moteur (app + serveur) ne doit rien attraper en silence sur un plan normal : sinon c'est un bug masqué
test('moteur : aucune erreur attrapée sur une journée normale (Ma journée, forme, prédiction, statistiques)', () => {
  const { loadApp, synthPlan } = require('../helpers/frontend');
  const app = loadApp({ now: '2026-11-04T19:30:00+01:00', state: synthPlan({ start: '2026-11-02' }) });
  app.mjSteps(app.ctx.state, '2026-11-04', 19 * 60 + 30);
  app.prFormScore && app.prFormScore();
  app.predRace && app.predRace('10km');
  app.nrOptions('2026-11-04');
  assert.deepEqual(app.ctx.__silent || [], []);
});
