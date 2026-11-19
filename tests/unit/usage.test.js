// Compteur d'usage : clés relevées sur les touchers, rapport « utilisées / jamais ouvertes » d'après le catalogue de la recherche
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/frontend');
const app = loadApp({ now: '2026-11-19T09:00:00+01:00', state: {} });
const plain = (x) => JSON.parse(JSON.stringify(x));

test('clés d\'un toucher : fonctions globales appelées, onglet de Statistiques, sans doublon ni fonction du navigateur', () => {
  const known = (n) => ['openPlanReview', 'statsTab', 'openShoesPanel'].includes(n);
  assert.deepEqual(plain(app.usageKeysOf("event.stopPropagation();openPlanReview()", known)), ['openPlanReview']);
  assert.deepEqual(plain(app.usageKeysOf("statsTab('train');statsTab('train')", known)), ['statsTab:train']);
  assert.deepEqual(plain(app.usageKeysOf("document.getElementById('x').remove();openShoesPanel()", known)), ['openShoesPanel']);
  assert.deepEqual(plain(app.usageKeysOf("showScreen('plan')", known)), []);
  assert.deepEqual(plain(app.usageKeysOf("inconnue()", known)), []);
});

test('rapport : utilisées triées par nombre, jamais ouvertes listées', () => {
  const items = [{ id: 'shoes', ic: '👟', t: 'Mes chaussures', g: 'Compte', fn: 'openShoesPanel' }, { id: 'zones', ic: '🫀', t: 'Zones', g: 'Stats', fn: 'statsTab' },
    { id: 'plan', ic: '📋', t: 'Mon plan', g: 'Onglet' }, { id: 'glossary', ic: '📖', t: 'Glossaire', g: 'Aide', fn: 'openGlossary' }];
  const R = plain(app.usageReport(items, { since: '2026-11-01', c: { openShoesPanel: [2, '2026-11-18'], 'statsTab:train': [5, '2026-11-19'], 'screen:plan': [9, '2026-11-19'] } }));
  assert.deepEqual(R.used.map((r) => [r.id, r.n]), [['plan', 9], ['zones', 5], ['shoes', 2]]);
  assert.deepEqual(R.never.map((r) => r.id), ['glossary']);
  assert.equal(R.since, '2026-11-01');
  assert.equal(app.usageKeyOf({ id: 'x', fn: 'openX' }), 'openX');
  assert.equal(app.usageKeyOf({ id: 'y' }), 'sr:y');
});

test('Tester l\'app : verdict d\'ensemble et rapport texte à envoyer', () => {
  const R = [{ k: 'db', t: 'Base de données', s: 'ok', d: '120 ms' }, { k: 'mic', t: 'Micro', s: 'bad', d: 'refusé' }, { k: 'push', t: 'Notifications', s: 'warn', d: 'pas activées' }];
  assert.deepEqual(plain(app.stVerdict(R)), { n: { ok: 1, warn: 1, bad: 1, off: 0 }, s: 'bad', t: '1 problème' });
  assert.equal(app.stVerdict(R.slice(0, 1)).t, 'Tout fonctionne');
  assert.equal(app.stVerdict([R[2], R[2]]).t, '2 points à surveiller');
  const txt = app.stReportText({ at: '19/11', version: '123', ua: 'iPhone', results: R, sizes: { totalKo: 812, top: [{ k: 'whoop_data', ko: 300 }] },
    usage: { never: [{ t: 'Glossaire' }] }, errors: [{ m: 'x is undefined', w: 'stats.js:12', n: 3, at: '2026-11-19' }] });
  assert.ok(/✗ Micro — refusé/.test(txt) && /Test : 1 problème/.test(txt));
  assert.ok(/Données : 812 Ko · whoop_data 300 Ko/.test(txt) && /Jamais ouvertes : Glossaire/.test(txt) && /x is undefined \(stats\.js:12\) ×3/.test(txt));
});

test('taille des données : total et familles de clés les plus lourdes', () => {
  const S = plain(app.stateSizes({ extra_w1_s0: 'x'.repeat(2000), extra_w2_s1: 'x'.repeat(2000), whoop_data: { a: 'y'.repeat(5000) }, fc_repos_2026_11_01: 52 }));
  assert.equal(S.keys, 4);
  assert.deepEqual(S.top.map((x) => x.k), ['whoop_data', 'séances (extra_w…)', 'fc_repos_…']);
  assert.ok(S.totalKo >= 8 && S.totalKo <= 10);
});
