// Coach : chiffres vérifiés avant d'être lus / affichés, points à suivre, notes, débrief de séance à la voix, carte allure EF
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/frontend');
const J = (o) => JSON.stringify(o);
const plain = (x) => JSON.parse(JSON.stringify(x));
const app = loadApp({ now: '2026-11-18T09:00:00+01:00', state: {} });

// données de l'app pour la vérification : mardi 17 (hier) une sortie, demain une séance
const F = { today: '2026-11-18', done: [{ date: '2026-11-17', km: 10.2, pace: 312, hr: 142, type: 'ef' }, { date: '2026-11-15', km: 16, pace: 330, hr: 140, type: 'long' }],
  plan: [{ date: '2026-11-19', km: 8, type: 'ef' }], pred: 2500, raceKm: 10, rec: { 10: 2530, semi: 5640 }, ef: 335 };
const V = (s) => app.cvVerifySentence(s, F);

test('chiffres vérifiés : séance passée citée par son jour (allure, km, FC)', () => {
  let r = V("Hier, ta sortie de 10,2 km à 5'25/km était très propre.");
  assert.equal(r.text, "Hier, ta sortie de 10,2 km à 5'12/km était très propre."); assert.equal(r.fixes[0].why, 'allure de la séance');
  r = V('Mardi tu as couru 12 km avec une FC de 150.');
  assert.equal(r.text, 'Mardi tu as couru 10,2 km avec une FC de 142.'); assert.equal(r.fixes.length, 2);
  assert.equal(V("Dimanche, ta longue de 16 km à 5'30/km : parfait.").fixes.length, 0, 'déjà juste');
  assert.equal(V("Hier tu visais 5'40/km mais tu as couru plus vite.").fixes.length, 0, 'consigne : pas touchée');
  assert.equal(V("Ta séance de jeudi fera 12 km à 5'40/km.").fixes.length, 0, 'aucune séance faite jeudi : rien');
});

test('chiffres vérifiés : temps prévu, record, temps ↔ allure, allure EF, séance de demain', () => {
  assert.equal(V("Ta prédiction sur 10 km est de 43'10.").text, "Ta prédiction sur 10 km est de 41'40.");
  assert.equal(V("Ton objectif reste 42'00.").fixes.length, 0, 'objectif : pas la prédiction');
  assert.equal(V("Ton record sur 10 km est 41'00.").text, "Ton record sur 10 km est 42'10.");
  assert.equal(V("Ton record au semi-marathon : 1h35.").text, "Ton record au semi-marathon : 1h34.");
  assert.equal(V("Vise 42'00 sur 10 km, soit 4'25/km.").text, "Vise 42'00 sur 10 km, soit 4'12/km.");
  assert.equal(V("Vise 42'00, puis 4'05/km sur les deux derniers.").fixes.length, 0, 'pas une conversion : pas touché');
  assert.equal(V("Ton allure EF actuelle est 5'50/km.").text, "Ton allure EF actuelle est 5'35/km.");
  assert.equal(V("Vise ton EF entre 5'30 et 5'45/km.").fixes.length, 0, 'fourchette conseillée : pas touchée');
  assert.equal(V('Demain tu as un footing de 10 km.').text, 'Demain tu as un footing de 8 km.');
  assert.equal(V('Demain, je te propose plutôt 6 km.').fixes.length, 0, 'proposition : pas touchée');
  const all = app.cvVerify("Hier : 11 km.\nTa sortie d'hier à 5'40/km était bien. Demain, footing de 9 km.", F);
  assert.equal(all.text, "Hier : 11 km.\nTa sortie d'hier à 5'12/km était bien. Demain, footing de 8 km.");
  assert.equal(all.fixes.length, 2);
});

test('points à suivre : relance due une fois, douleur notée → point de l\'app, question de relance', () => {
  const now = new Date('2026-11-18T09:00:00+01:00').getTime();
  const st = { _coach_threads: {
    a: { t: 'Mollet gauche qui tire', k: 'douleur', at: now - 2 * 86400000, due: '2026-11-17', src: 'coach' },
    b: { t: 'Nouveau gel Maurten', k: 'essai', at: now - 86400000, due: '2026-11-20' },
    c: { t: 'Vieux point', k: 'autre', at: now - 30 * 86400000, due: '2026-10-20' },
    d: { t: 'Réglé', k: 'douleur', at: now - 86400000, due: '2026-11-18', done: { at: now, c: 'ok' } } } };
  assert.deepEqual(plain(app.cfThreads(st, '2026-11-18').map((x) => x.id)), ['a', 'b'], 'expiré et fermé retirés');
  assert.equal(app.cfThreadDue(st, '2026-11-18').id, 'a');
  st._coach_threads.a.asked = '2026-11-18';
  assert.equal(app.cfThreadDue(st, '2026-11-18'), null, 'déjà demandé aujourd\'hui');
  assert.equal(app.cfFollowQ({ t: 'Mollet gauche qui tire', k: 'douleur' }), 'Au fait, mollet gauche qui tire : ça va mieux ?');
  assert.equal(app.cfFollowQ({ t: 'Nouveau gel Maurten', k: 'essai' }), 'Au fait, nouveau gel Maurten : alors, ça donne quoi ?');
  const P = app.cfPainThreads({}, '2026-11-18', [{ date: '2026-11-17', title: 'Footing EF', perf: { pain: { level: 2, zone: 'Mollet' } } }, { date: '2026-11-10', title: 'Vieux', perf: { pain: { level: 3, zone: 'Genou' } } }, { date: '2026-11-17', title: 'X', perf: { pain: { level: 0 } } }]);
  assert.deepEqual(plain(Object.keys(P)), ['p_2026-11-17_Mollet']);
  assert.equal(P['p_2026-11-17_Mollet'].t, 'Douleur mollet gênante après Footing EF de mardi');
  assert.equal(P['p_2026-11-17_Mollet'].due, '2026-11-18'); assert.equal(P['p_2026-11-17_Mollet'].src, 'app');
  assert.deepEqual(plain(app.cfPainThreads({ _coach_threads: P }, '2026-11-18', [{ date: '2026-11-17', title: 'Footing EF', perf: { pain: { level: 2, zone: 'Mollet' } } }])), {}, 'une fois');
});

test('notes : statistiques sur 30 jours (👍 / 👎, raisons, coupées, 1er mot, chiffres corrigés)', () => {
  const now = Date.parse('2026-11-18T09:00:00Z');
  const log = [{ at: now - 1000, m: 'voix', cut: 1, lat: 1800, fix: 1, tools: 1 }, { at: now - 2000, m: 'voix', cut: 0, lat: 1200 }, { at: now - 3000, m: 'chat', fix: 2 }, { at: now - 40 * 86400000, m: 'voix', cut: 1, lat: 9000 }];
  const fb = { x: { at: now - 1000, v: 1 }, y: { at: now - 2000, v: -1, why: 'long', q: 'Ma semaine ?', a: 'Long' }, z: { at: now - 3000, v: -1, why: 'long' } };
  const S = app.cfStats(log, fb, now);
  assert.equal(S.n, 3); assert.equal(S.voice, 2); assert.equal(S.up, 1); assert.equal(S.down, 2); assert.deepEqual(plain(S.why), { long: 2 });
  assert.equal(S.cut, 1); assert.equal(S.latMed, 1800); assert.equal(S.fixes, 3); assert.equal(S.tools, 1);
  assert.equal(S.recentDown[0].q, 'Ma semaine ?');
});

test('débrief à la voix : question d\'ouverture, relances effort puis douleur, réponses courtes comprises', () => {
  assert.equal(app.cvDebriefOpening({ km: 8.24, perf: { pace: '5:12' } }), "Bravo pour tes 8,2 km à 5'12/km ! Raconte-moi : comment c'était ?");
  let N = app.cvDebriefNext(['Super sortie, bonnes sensations'], {});
  assert.equal(N.rpe, 4, 'bonnes sensations → 4'); assert.equal(N.ask, 'pain');
  N = app.cvDebriefNext(['Bof, rien de spécial'], {});
  assert.equal(N.ask, 'rpe');
  N = app.cvDebriefNext(['Bof, rien de spécial', 'sept'], { rpe: 1 });
  assert.equal(N.rpe, 7); assert.equal(N.ask, 'pain');
  N = app.cvDebriefNext(['Bof, rien de spécial', 'sept', 'non rien'], { rpe: 1, pain: 2 });
  assert.equal(N.rpe, 7);
  assert.equal(N.ask, null); assert.deepEqual(plain(N.pain), { level: 0, zone: null });
  N = app.cvDebriefNext(['Bof', 'cinq', 'Le mollet tire un peu'], { rpe: 1, pain: 2 });
  assert.equal(N.rpe, 5, 'l\'effort vient de la réponse à sa question, pas du « un » de « un peu »'); assert.equal(N.pain.level, 1);
  N = app.cvDebriefNext(['Dur, 8 sur 10, le mollet tire un peu'], {});
  assert.equal(N.rpe, 8); assert.equal(N.pain.zone, 'Mollet'); assert.equal(N.ask, null, 'tout dit d\'un coup : pas de relance');
});

test('carte allure EF : 6 dernières sorties EF / longues, intention reconnue', () => {
  assert.equal(app.cvCardKind('Mon allure EF actuelle ?'), 'ef');
  assert.equal(app.cvCardKind('Comment je progresse ?'), 'ef');
  const done = Array.from({ length: 8 }, (_, i) => ({ date: '2026-11-0' + (i + 1), type: i % 3 === 2 ? 'frac' : 'ef', km: 8, perf: { pace: '5:' + (40 - i), hr: 140 + i } }));
  const P = app.cvEfPoints(done);
  assert.ok(P.length <= 6 && P.length >= 4); assert.ok(P.every((x) => x.p > 300 && x.p < 345)); assert.equal(P[P.length - 1].d, '2026-11-08');
});
