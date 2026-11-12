// Renfo guidé : lecture des séries, progression par exercice, séance adaptée au plan (veille de séance clé, affûtage,
// récup WHOOP, douleur, foulée)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, synthPlan } = require('../helpers/frontend');

const NOW = '2026-11-10T09:00:00+01:00';
const J = (o) => JSON.parse(JSON.stringify(o));
const EXOS = [
  { nom: 'Tibial Postérieur — Ballon', series: '5 cycles × 1min20s' },
  { nom: 'Pont fessier', series: '3 séries × 10 rép.' },
  { nom: 'Battements latéraux', series: '4 séries × 10 rép. (2 à gauche · 2 à droite)' },
  { nom: 'Planche latérale', series: '3 séries × 30 sec (chaque côté)' },
  { nom: 'Saut unipodal stabilisé', series: '3 séries × 10 rép. (chaque pied)' },
];

test('lecture des séries : répétitions, durée, côtés, repos', () => {
  const app = loadApp({ now: NOW, state: {} });
  const P = (s) => J(app.rgParse(s));
  assert.deepEqual(P('5 cycles × 1min20s'), { sets: 5, reps: null, sec: 80, side: null, rest: 40 });
  assert.deepEqual(P('3 × 1min20 · récup 40s'), { sets: 3, reps: null, sec: 80, side: null, rest: 40 });
  assert.deepEqual(P('4 séries × 10 rép. (2 à gauche · 2 à droite)'), { sets: 4, reps: 10, sec: null, side: 'alt', rest: 45 });
  assert.deepEqual(P('3 séries × 30 sec (chaque côté)'), { sets: 3, reps: null, sec: 30, side: 'each', rest: 30 });
  assert.equal(P('3 × 12 rép. par jambe').side, 'each');
  assert.equal(P('2 séries × 15 rép. (chaque sens, chaque cheville)').reps, 15);
  // progression : +2 rép. / +10 s par niveau, 1 série de plus dès le niveau 4, jamais sous 6 rép. / 15 s
  assert.deepEqual(J(app.rgDose(P('3 séries × 10 rép.'), 2)), { sets: 3, reps: 14, sec: null, side: null, rest: 45 });
  assert.equal(J(app.rgDose(P('3 séries × 30 sec'), 4)).sets, 4);
  assert.equal(J(app.rgDose(P('3 séries × 10 rép.'), -2)).reps, 6);
});

test('séance adaptée : veille de fractionné = 1 série de moins sans sauts ; douleur au genou = exercice ciblé ajouté', () => {
  const st = synthPlan({ start: '2026-11-09', km: [24, 28, 30, 32] });   // mer. 11 = tempo
  st._renfo_lvl = { pont_fessier: { lvl: 2, feel: 'bien' } };
  let app = loadApp({ now: NOW, state: st });
  let P = J(app.rgPlan(EXOS, st, '2026-11-10'));
  assert.ok(P.adapt.reasons.some((r) => /^Demain : Tempo/.test(r)), P.adapt.reasons.join(' | '));
  assert.ok(!P.items.some((x) => /Saut/.test(x.ex.nom)), 'pas de sauts la veille');
  const pont = P.items.find((x) => x.key === 'pont_fessier');
  assert.deepEqual([pont.dose.sets, pont.dose.reps], [2, 14], 'niveau +2 et 1 série de moins');
  // douleur au genou validée il y a 2 jours
  st.extra_w1_s0_done = true; st.extra_w1_s0_km = 8;
  st.extra_w1_s0_perf = JSON.stringify({ date: '2026-11-09', pace: "5'50", pain: { level: 2, zone: 'Genou' } });
  app = loadApp({ now: NOW, state: st });
  P = J(app.rgPlan(EXOS, st, '2026-11-12'));
  assert.ok(P.adapt.reasons.some((r) => /Douleur genou .* Extension de jambe ajouté/.test(r)), P.adapt.reasons.join(' | '));
  assert.ok(!P.items.some((x) => /Saut/.test(x.ex.nom)), 'douleur des jambes : pas de sauts');
});

test('progression après la séance : facile +1, bien deux fois de suite +1, dur −1, « trop dur » −1, rien en affûtage', () => {
  const st = synthPlan({ start: '2026-11-09', km: [24, 28, 30, 32] });
  st._renfo_lvl = { a: { lvl: 1, feel: 'bien' }, b: { lvl: 1, feel: 'dur' }, c: { lvl: 0 } };
  const app = loadApp({ now: NOW, state: st });
  let L = J(app.rgProgress(st, ['a', 'b', 'c'], 'bien', [], '2026-11-16'));
  assert.deepEqual([L.a.lvl, L.b.lvl, L.c.lvl], [2, 1, 0]);
  L = J(app.rgProgress(st, ['a', 'c'], 'facile', ['c'], '2026-11-16'));
  assert.deepEqual([L.a.lvl, L.c.lvl], [2, -1]);
  // dernière semaine = affûtage : aucune hausse
  st.meta_w4 = JSON.stringify({ phase: 4, isTaper: true });
  L = J(app.rgProgress(st, ['a'], 'facile', [], '2026-11-30'));
  assert.equal(L.a.lvl, 1);
});
