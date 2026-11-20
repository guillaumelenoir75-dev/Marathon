// Thème « Piste de nuit » : textes de l'en-tête de l'accueil (anneau J-x, course, tuiles) et libellé « Maintenant » de Ma journée
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, synthPlan } = require('../helpers/frontend');

const J = (o) => JSON.parse(JSON.stringify(o));

test('en-tête apaisé : salutation, date sans heure, J-x, jour de la course en mots, une phrase pour le temps prévu', () => {
  const app = loadApp({ now: '2026-11-03T19:12:00+01:00', state: synthPlan({ start: '2026-11-02', km: [24, 28, 30] }) });
  assert.equal(app.phGreet(7 * 60), 'Bonjour'); assert.equal(app.phGreet(19 * 60), 'Bonsoir'); assert.equal(app.phGreet(2 * 60), 'Bonsoir');
  const V = J(app.phView({ name: 'Léa', race: { date: '2026-11-22', time: '09:00', label: "10 km Novemb'Run" }, pct: 78.4, obj: "41'40", pred: "42'10", form: 72.4 }, '2026-11-03', 19 * 60 + 12));
  assert.equal(V.greet, 'Bonsoir Léa');
  assert.match(V.eyebrow, /^Mardi 3 nov\.?$/, 'plus d\'heure dans l\'en-tête');
  assert.equal(V.big, 'J-19'); assert.equal(V.card, true);
  assert.match(V.when, /^Dimanche 22 nov\.? à 9h00$/);
  assert.equal(V.prog, 'Prépa faite à 78 %'); assert.equal(V.pct, 78);
  assert.equal(V.line, "Tu es prévu en <b>42'10</b>, pour un objectif de 41'40."); assert.equal(V.why, true);
  assert.equal(V.form, '72'); assert.equal(V.formCls, 'ok');
  // course cette semaine : le jour seulement ; demain ; aujourd'hui ; sans temps prévu
  assert.equal(app.phWhen('2026-11-08', '09:00', '2026-11-03'), 'Dimanche à 9h00');
  assert.equal(app.phWhen('2026-11-04', '', '2026-11-03'), 'Demain');
  assert.equal(app.phWhen('2026-11-03', '10:30', '2026-11-03'), 'Aujourd\'hui à 10h30');
  assert.equal(app.phView({ obj: "41'40", race: { date: '2026-11-22' } }, '2026-11-03', 600).line, "Ton objectif : <b>41'40</b>.");
  assert.equal(app.phView({ pred: "<x>" }, '2026-11-03', 600).line, 'Tu es prévu en <b>&lt;x&gt;</b>.', 'texte échappé');
  // jour J, après la course, sans course, mode plaisir, forme en attente
  assert.equal(app.phView({ race: { date: '2026-11-03' } }, '2026-11-03', 600).big, 'Jour J');
  const P = J(app.phView({ race: { date: '2026-11-01' } }, '2026-11-03', 600)); assert.equal(P.big, 'J+2'); assert.equal(P.prog, 'Prépa bouclée');
  assert.equal(app.phView({}, '2026-11-03', 600).card, false);
  assert.equal(app.phView({ race: { date: '2026-11-22' }, plaisir: true }, '2026-11-03', 600).card, false);
  assert.equal(app.phView({ form: 80, formWait: true }, '2026-11-03', 600).form, '…');
  assert.equal(app.phView({ form: 20 }, '2026-11-03', 600).formCls, 'low');
});

test('étape du moment en clair : « CE SOIR · 18H00 », séance · km, allure et chaussure en une phrase, bouton annoncé', () => {
  const app = loadApp({ now: '2026-11-03T12:00:00+01:00', state: synthPlan({ start: '2026-11-02', km: [24] }) });
  const s = { kind: 'sess', t: 'Footing EF', s: "4 km · 5'45/km", tm: '18:00', at: 18 * 60, shoe: 'Evo SL', btn: '🏁 J\'ai fini' };
  const a = J(app.phNowView(s, 13 * 60));
  assert.equal(a.eb, 'CE SOIR · 18H00'); assert.equal(a.title, 'Footing EF · 4 km');
  assert.equal(a.sub, "À 5'45/km, avec les Evo SL");
  assert.equal(a.hint, 'Le bouton « J\'ai fini » apparaît à 17h30'); assert.equal(a.btn, false);
  const b = J(app.phNowView(s, 17 * 60 + 50));
  assert.equal(b.eb, 'MAINTENANT · 18H00'); assert.equal(b.btn, true); assert.equal(b.hint, '');
  assert.equal(app.phNowView(Object.assign({}, s, { tm: '07:00', at: 7 * 60 }), 5 * 60).eb, 'CE MATIN · 7H00');
  assert.equal(app.phNowView(Object.assign({}, s, { s: '6 km · ~40 min', shoe: null }), 13 * 60).sub, 'Environ 40 min');
  assert.equal(app.phNowView(s, 20 * 60 + 30).eb, 'À VALIDER · 18H00');
  const w0 = J(app.phNowView({ kind: 'x', t: 'Je suis réveillé', s: 'Lance la synchro', at: 300, btn: 'Réveillé' }, 420));
  assert.equal(app.phNowView({ kind: 'x', t: 'Renfo', tm: '18:30', at: 18 * 60 + 30, btn: '▶ Guidée' }, 7 * 60).eb, 'CE SOIR · 18H30', 'plus tard dans la journée : le moment, pas « Ensuite »');
  const w = w0;
  assert.equal(w.eb, 'MAINTENANT'); assert.equal(w.title, 'Je suis réveillé'); assert.equal(w.btn, true);
});

test('forme du jour : une note + une phrase ; chaque mesure de la nuit expliquée par rapport à tes 30 dernières nuits', () => {
  const st = synthPlan({ start: '2026-11-02', km: [24] });
  const rec = [];
  for (let i = 1; i <= 20; i++) { const d = new Date('2026-11-20T12:00:00'); d.setDate(d.getDate() - i); const iso = d.toISOString().slice(0, 10); st['fc_repos_' + iso] = 52; rec.push({ date: iso, score: 60, hrv: 80 }); }
  rec.push({ date: '2026-11-20', score: 93, hrv: 86 }); st['fc_repos_2026-11-20'] = 50;
  st.whoop_data = { recoveries: rec, sleeps: [] };
  const app = loadApp({ now: '2026-11-20T12:00:00+01:00', state: st });
  assert.deepEqual(J(app.phFormHead(88, true)), { t: 'Bonne forme', s: 'Feu vert pour ta séance.' });
  assert.equal(app.phFormHead(50).t, 'Forme moyenne'); assert.equal(app.phFormHead(20).t, 'Récupération insuffisante');
  assert.equal(app.phFormLine(88, 0), 'Bien récupéré, pas d\'alcool hier soir.');
  assert.equal(app.phFormLine(50, 4), 'Récupération moyenne, alcool hier soir (4/10).');
  assert.equal(app.phFormLine(20, null), 'Peu récupéré.');
  const B = J(app.phMeasureBase(st, '2026-11-20'));
  assert.equal(B.rhr, 52); assert.equal(B.hrv, 80, 'la nuit du jour n\'entre pas dans tes repères');
  const M = J(app.phMeasures({ r: { score: 93, hrv: 86 }, s: { performance_pct: 86 }, fc: 50 }, B));
  assert.deepEqual(M.map((m) => m.t), ['Récupération', 'Sommeil', 'Pouls au repos', 'Variabilité cardiaque']);
  assert.equal(M[0].txt, 'Ton corps a bien récupéré cette nuit.'); assert.equal(M[0].v, '93 %'); assert.equal(M[0].c, 'ok');
  assert.equal(M[1].txt, 'Presque tout le sommeil dont tu avais besoin.');
  assert.equal(M[2].txt, '2 battements de moins que d\'habitude : bon signe.'); assert.equal(M[2].v, '50');
  assert.equal(M[3].txt, 'Au-dessus de ta moyenne : tu es reposé.'); assert.equal(M[3].v, '86 ms');
  const M2 = J(app.phMeasures({ r: { score: 30, hrv: 60 }, s: { performance_pct: 62 }, fc: 58 }, B));
  assert.equal(M2[0].txt, 'Peu récupéré : privilégie le calme.'); assert.equal(M2[1].txt, 'Nuit courte : couche-toi plus tôt ce soir.');
  assert.equal(M2[2].txt, '6 battements de plus que d\'habitude : fatigue possible.'); assert.equal(M2[2].c, 'low');
  assert.equal(M2[3].txt, 'Bien sous ta moyenne : fatigue possible.');
  assert.equal(app.phMeasures({ fc: 52 }, B)[0].txt, 'Comme d\'habitude.');
  assert.equal(app.phMeasures({ fc: 53 }, B)[0].txt, '1 battement de plus que d\'habitude.');
  assert.equal(app.phMeasures({ fc: 50 }, {})[0].txt, 'Ton pouls au repos cette nuit.', 'sans repères : pas de comparaison inventée');
  assert.equal(app.phMeasureBase({}, '2026-11-20').rhr, null, 'moins de 5 nuits : pas de repère');
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
