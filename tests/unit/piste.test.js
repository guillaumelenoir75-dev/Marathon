// Thème « Piste de nuit » : textes de l'en-tête de l'accueil (anneau J-x, course, tuiles) et libellé « Maintenant » de Ma journée
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, synthPlan } = require('../helpers/frontend');

const J = (o) => JSON.parse(JSON.stringify(o));

test('en-tête : salutation, J-x, date de course, part des km, anneau proportionnel', () => {
  const app = loadApp({ now: '2026-11-03T19:12:00+01:00', state: synthPlan({ start: '2026-11-02', km: [24, 28, 30] }) });
  assert.equal(app.phGreet(7 * 60), 'Bonjour'); assert.equal(app.phGreet(19 * 60), 'Bonsoir'); assert.equal(app.phGreet(2 * 60), 'Bonsoir');
  const V = J(app.phView({ name: 'Léa', race: { date: '2026-11-22', label: "10 km Novemb'Run" }, pct: 78.4, obj: "41'40", pred: "42'10", form: 72.4 }, '2026-11-03', 19 * 60 + 12));
  assert.equal(V.greet, 'Bonsoir Léa');
  assert.match(V.eyebrow, /^Mardi 3 nov\.? · 19:12$/);
  assert.equal(V.big, 'J-19'); assert.equal(V.ring, true);
  assert.match(V.sub, /^Dim\.? 22 nov\.? · 78 % des km faits$/);
  assert.equal(V.form, '72'); assert.equal(V.formCls, 'ok');
  assert.equal(V.dash, app.phRingDash(78));
  assert.equal(app.phRingDash(0), 0); assert.equal(app.phRingDash(150), app.phRingDash(100));
  assert.ok(Math.abs(app.phRingDash(100) - (2 * 140 + Math.PI * 174)) < 1, 'tour complet = périmètre de la piste');
  // jour J, après la course, sans course, forme en attente du réveil
  assert.equal(app.phView({ race: { date: '2026-11-03' } }, '2026-11-03', 600).big, 'Jour J');
  assert.equal(app.phView({ race: { date: '2026-11-01' } }, '2026-11-03', 600).big, 'J+2');
  assert.equal(app.phView({}, '2026-11-03', 600).ring, false);
  assert.equal(app.phView({ race: { date: '2026-11-22' }, plaisir: true }, '2026-11-03', 600).ring, false);
  assert.equal(app.phView({ form: 80, formWait: true }, '2026-11-03', 600).form, '…');
  assert.equal(app.phView({ form: 20 }, '2026-11-03', 600).formCls, 'low');
});

test('nom de la course : distance ajoutée une seule fois ; temps au format 41\'40 / 3h29\'45', () => {
  const app = loadApp({ now: '2026-11-03T12:00:00+01:00', state: synthPlan({ start: '2026-11-02', km: [24] }) });
  assert.equal(app.phRaceLabel('10 km', "Novemb'Run"), "10 km Novemb'Run");
  assert.equal(app.phRaceLabel('10 km', "10km Novemb'Run"), "10km Novemb'Run");
  assert.equal(app.phRaceLabel('Semi-marathon', 'Semi de Paris'), 'Semi de Paris');
  assert.equal(app.phRaceLabel('Marathon', 'Marathon Seine-Eure'), 'Marathon Seine-Eure');
  assert.equal(app.phRaceLabel('Marathon', 'Marathon'), 'Marathon');
  assert.equal(app.phRaceLabel('', ''), 'Course objectif');
  assert.equal(app.phTime(2500), "41'40"); assert.equal(app.phTime(12585), "3h29'45"); assert.equal(app.phTime(0), '');
});

test('Ma journée : libellé de l\'étape « maintenant » (compte à rebours, maintenant, à valider) partagé par les deux accueils', () => {
  const app = loadApp({ now: '2026-11-03T12:00:00+01:00', state: synthPlan({ start: '2026-11-02', km: [24] }) });
  const s = { kind: 'sess', tm: '18:30', at: 18 * 60 + 30 };
  const a = J(app.mjNowInfo(s, 13 * 60 + 43));
  assert.equal(a.lab, '18h30 · dans 4 h 47'); assert.equal(a.early, true);
  assert.equal(app.mjNowInfo(s, 18 * 60 + 10).lab, 'Maintenant · 18h30');
  assert.equal(app.mjNowInfo(s, 20 * 60 + 30).lab, 'À valider · 18h30');
  assert.equal(app.mjNowInfo({ kind: 'x', at: 300 }, 420).lab, 'Maintenant');
});
