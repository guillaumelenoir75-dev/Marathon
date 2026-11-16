// Blocs d'une séance : toujours proposés à la validation (temps + allure), pour le fractionné, le tempo et toute séance « N × … »
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, synthPlan } = require('../helpers/frontend');

const J = (o) => JSON.parse(JSON.stringify(o));
const app = () => loadApp({ now: '2026-11-16T12:00:00+01:00', state: synthPlan({ start: '2026-11-02', km: [24] }) });

test('séances à blocs reconnues : distance ou durée, nombre ; lignes droites et accélérations ne sont pas des blocs', () => {
  const a = app();
  assert.deepEqual(J(a.prBlocSpec('Fractionné 4×400 m', "2 km EF · 4 × 400 m à 3'50 · récup 1'30", 'frac')), { n: 4, dist: 400, dur: null, fixed: true });
  assert.deepEqual(J(a.prBlocSpec('Tempo 3×8 min', "3 km EF · 3 × 8 min à 4'35 — 4'40 /km", 'tempo')), { n: 3, dist: null, dur: 480, fixed: true });
  assert.deepEqual(J(a.prBlocSpec('Seuil', '3 x 2 km à allure semi', 'tempo')), { n: 3, dist: 2000, dur: null, fixed: true });
  assert.deepEqual(J(a.prBlocSpec('Sortie longue', "16 km dont 3 × 3 km à allure marathon (4'55)", 'long')), { n: 3, dist: 3000, dur: null, fixed: true }, 'sortie longue avec blocs');
  assert.deepEqual(J(a.prBlocSpec('Fractionné 10×30″', '10 × 30 s vite / 30 s lent', 'frac')), { n: 10, dist: null, dur: 30, fixed: true });
  assert.equal(a.prBlocSpec('Footing EF + lignes droites', '40 min EF + 6 × 80 m lignes droites', 'ef'), null);
  assert.equal(a.prBlocSpec('Footing EF', "5'45 — 6'10 /km", 'ef'), null);
  assert.equal(a.prBlocSpec('Sortie longue', '18 km EF + 4 × 20 s accélérations', 'long'), null);
  // fractionné / tempo sans « N × … » lisible : 2 blocs par défaut, toujours proposés
  assert.deepEqual(J(a.prBlocSpec('Fractionné pyramide', '200-400-800-400-200', 'frac')), { n: 2, dist: null, dur: null, fixed: false });
});

test('temps ↔ allure d\'un bloc, et lecture de la saisie (allure calculée quand seul le temps est donné)', () => {
  const a = app();
  assert.equal(a.prBlocPace('1:32', 400), '3:50');
  assert.equal(a.prBlocPace('8:10', 2000), '4:05');
  assert.equal(a.prBlocTime('3:50', 400), '1:32');
  assert.equal(a.prBlocTime('4:55', 3000), '14:45');
  assert.equal(a.prBlocPace('0:30', 400), '', 'allure impossible (1:15/km) : rien');
  assert.equal(a.prBlocPace('1:32', null), '', 'sans distance : pas de calcul');
  const r = J(a.prBlocsRead({ n: 4, dist: 400 }, ['1:32', '1:31', '', '1:33'], ['', '3:48', '3:50', '']));
  assert.deepEqual(r.blocsAllure, ['3:50', '3:48', '3:50', '3:53']);
  assert.deepEqual(r.blocsTemps, ['1:32', '1:31', '', '1:33']);
  const d = J(a.prBlocsRead({ n: 3, dur: 480 }, ['', '', ''], ['4:36', '4:35', '']));
  assert.deepEqual(d.blocsAllure, ['4:36', '4:35', '']); assert.equal(d.blocsTemps, null);
  assert.deepEqual(J(a.prBlocsRead({ n: 2 }, ['', ''], ['', ''])), { blocsAllure: null, blocsTemps: null });
});

test('pavé numérique de l\'iPhone (sans « : ») : « 408 » = 4:08, jamais 408 secondes ; un seul champ par bloc', () => {
  const a = app();
  assert.equal(a.prBlocFmt('408'), '4:08'); assert.equal(a.prBlocFmt('1532'), '15:32'); assert.equal(a.prBlocFmt('13205'), '1:32:05');
  assert.equal(a.prBlocFmt('4:08'), '4:08', 'déjà écrit avec « : »'); assert.equal(a.prBlocFmt('40'), '40'); assert.equal(a.prBlocFmt(''), '');
  assert.equal(a.prBlocPace('132', 400), '3:50', 'temps tapé sans « : »');
  assert.equal(a.prBlocTime('408', 1000), '4:08');
  const r = J(a.prBlocsRead({ n: 3, dist: 1000 }, ['', '', ''], ['408', '412', '4:05']));
  assert.deepEqual(r.blocsAllure, ['4:08', '4:12', '4:05']);
  // champ saisi : le temps pour des blocs à distance, l'allure pour 1 km (temps = allure), une durée ou rien de lisible
  assert.equal(a.prBlocMode0({ n: 4, dist: 400 }), 't'); assert.equal(a.prBlocMode0({ n: 3, dist: 1000 }), 'p');
  assert.equal(a.prBlocMode0({ n: 3, dur: 480 }), 'p'); assert.equal(a.prBlocMode0({ n: 2 }), 'p');
});
