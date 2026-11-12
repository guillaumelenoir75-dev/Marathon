// Recherche « Que veux-tu faire ? » : mots sans accents ni casse, début de mot, mots voisins, compte admin / athlète
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/frontend');

const ids = (L) => JSON.parse(JSON.stringify(L)).map((x) => x.id);

test('« FC max », « chaussures », « malade », « allure »… : la bonne entrée en premier', () => {
  const app = loadApp({ now: '2026-11-12T09:00:00+01:00', state: {} });
  assert.equal(ids(app.searchFind('FC max'))[0], 'fcmax');
  assert.equal(ids(app.searchFind('fc'))[0], 'fcmax');
  assert.equal(ids(app.searchFind('chaussure'))[0], 'shoes');
  assert.equal(ids(app.searchFind('malade'))[0], 'imprevu', 'mot voisin');
  assert.equal(ids(app.searchFind('ÉVOLUTION'))[0], 'paces', 'casse et accents');
  assert.ok(ids(app.searchFind('allure')).indexOf('paces') >= 0);
  assert.equal(ids(app.searchFind('evolution allures'))[0], 'paces', 'plusieurs mots');
  assert.equal(ids(app.searchFind('dormir'))[0], 'sleep');
  assert.deepEqual(ids(app.searchFind('xyzzy')), [], 'rien');
  assert.deepEqual(ids(app.searchFind('  ')), []);
});

test('athlète : pas d\'entrée réservée au compte admin (Coach, alcool, santé de l\'app…)', () => {
  const app = loadApp({ now: '2026-11-12T09:00:00+01:00', state: {}, admin: false });
  const all = ids(app.searchItems(false));
  ['coach', 'alcool', 'health', 'users', 'wake', 'planchat'].forEach((k) => assert.ok(all.indexOf(k) < 0, k));
  assert.deepEqual(ids(app.searchFind('alcool', false)), []);
  assert.ok(ids(app.searchItems(true)).indexOf('alcool') >= 0, 'admin : présente');
});
