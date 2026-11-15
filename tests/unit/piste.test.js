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

test('Plan en couloirs : 7 jours du lundi au dimanche, séances à leur jour, renfo, km et barres proportionnelles', () => {
  const st = synthPlan({ start: '2026-11-02', km: [24, 28, 30] });
  st.extra_w1_s0_done = true; st.extra_w1_s0_km = 9.2; st.extra_w1_s0_perf = JSON.stringify({ date: '2026-11-03', pace: '5:41' });   // faite le mardi
  st.rf1r1sched = JSON.stringify({ day: 4, time: '19:00' });
  const app = loadApp({ now: '2026-11-04T12:00:00+01:00', state: st });
  assert.deepEqual(J(app.psWeeks(st)).map((x) => x.w), [1, 2, 3]);
  const L = J(app.psWeekLanes(st, 1, '2026-11-04'));
  assert.equal(L.mon, '2026-11-02'); assert.equal(L.sun, '2026-11-08'); assert.equal(L.days.length, 7);
  assert.deepEqual(L.days.map((D) => D.kind), ['rest', 'ef', 'key', 'renfo', 'rest', 'rest', 'ef'], 'footing fait mardi (jour réel), tempo mercredi, renfo jeudi, longue dimanche');
  assert.equal(L.days[1].done, true); assert.equal(L.days[1].km, 9.2); assert.match(L.days[1].items[0].perfPace, /5'41/);
  assert.equal(L.days[2].today, true);
  assert.match(L.days[3].title, /^Renfo/); assert.equal(L.days[3].renfo[0].time, '19:00');
  assert.equal(L.days[0].title, 'Repos'); assert.equal(L.days[0].pct, 0);
  assert.equal(Math.max(...L.days.map((D) => D.pct)), 100, 'le plus long jour remplit le couloir');
  assert.equal(L.kmDone, 9.2); assert.ok(L.km > 20);
  // semaine de course : jour J
  const L3 = J(app.psWeekLanes(st, 3, '2026-11-04'));
  assert.equal(L3.days[6].kind, 'race'); assert.equal(L3.phase, 'affûtage');
  // renfo de la semaine désactivé : absent
  st.rf1skip = true; assert.equal(J(app.psWeekLanes(st, 1, '2026-11-04')).days[3].kind, 'rest');
});

test('séance faite : barres d\'allure (plus rapide = plus haute), ligne de consigne, étiquettes ; niveau du moment ; km par km du plan de course', () => {
  const app = loadApp({ now: '2026-11-04T12:00:00+01:00', state: synthPlan({ start: '2026-11-02', km: [24] }) });
  const B = J(app.psSplitBars([{ km: 1, sec: 372 }, { km: 2, sec: 325 }, { km: 3, sec: 313 }, { km: 4, sec: 340, part: 0.4 }], 345));
  assert.equal(B.n, 4);
  assert.equal(B.bars[2].best, true); assert.equal(B.bars[2].h, 100); assert.equal(B.bars[0].h, 22);
  assert.ok(B.line > 22 && B.line < 100, 'consigne dans la plage');
  assert.equal(B.bars[3].km, '3,4', 'dernier morceau : distance réelle');
  assert.equal(app.psSplitBars([], 300), null);
  const many = J(app.psSplitBars(Array.from({ length: 26 }, (_, i) => ({ km: i + 1, sec: 300 + (i % 5) })), null));
  assert.ok(many.bars.filter((b) => b.lab).length < 26, 'plus de 16 km : allures seulement aux extrêmes');
  assert.equal(many.line, null);
  // niveau du moment : tracé et écart sur la période
  const H = [{ date: '2026-08-01', v: 46.1 }, { date: '2026-09-01', v: 47 }, { date: '2026-10-01', v: 48.4 }];
  const V = J(app.psLevelView(H, 27));
  assert.equal(V.now, 48.4); assert.equal(V.delta, 2.3); assert.equal(V.line.split(' ').length, 3);
  assert.equal(J(app.psLevelView(H, 2)).delta, 1.4);
  assert.equal(app.psLevelView([], 10), null);
  // plan de course : 10 km = tous les km ; marathon = tous les 5 km + arrivée
  const sp10 = Array.from({ length: 10 }, (_, i) => ({ km: i + 1, pace: i < 2 ? 255 : 248, cum: (i + 1) * 250 }));
  const R10 = J(app.psRaceRows(sp10, 250));
  assert.equal(R10.length, 10); assert.equal(R10[0].cls, 'start'); assert.equal(R10[9].cls, 'end'); assert.equal(R10[9].fin, true); assert.equal(R10[4].w, 50);
  const spM = Array.from({ length: 42 }, (_, i) => ({ km: i + 1, pace: 300, cum: (i + 1) * 300 })).concat([{ km: 42.195, pace: 300, cum: 12658 }]);
  const RM = J(app.psRaceRows(spM, 300));
  assert.deepEqual(RM.map((r) => r.km), ['1', '5', '10', '15', '20', '25', '30', '35', '40', '42,195']);
});
