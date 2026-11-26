// Plan qui s'adapte : absorption des séances (A), paliers des séances de qualité (B), volume selon l'objectif (C), pilote de nuit (D), écran (F)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, synthPlan } = require('../helpers/frontend');

const TODAY = '2026-11-09';   // lundi de la semaine 3
function plan(perf){
  const st = synthPlan({ km: [30, 34, 38, 40, 42, 44, 30, 20] });
  ['extra_w1_s1', 'extra_w2_s1'].forEach((k, i) => {
    const d = JSON.parse(st[k]).sched_date;
    st[k + '_done'] = true; st[k + '_km'] = 10;
    st[k + '_perf'] = JSON.stringify(Object.assign({ date: d }, perf[i]));
  });
  return st;
}
const EASY = { blocsAllure: ["4'28", "4'29", "4'28"], rpe: 4 };
const OK = { blocsAllure: ["4'37", "4'38", "4'36"], rpe: 6 };
const HARD = { blocsAllure: ["4'45", "4'47", "4'50"], rpe: 9, pain: { level: 2, zone: 'Mollet' } };

test('répétitions lues dans la séance (min, m, milliers, allure course)', () => {
  const app = loadApp({ now: TODAY + 'T09:00:00+01:00' });
  assert.deepEqual(JSON.parse(JSON.stringify(app.paParseReps('3 km EF · 6 × 1 000 m à 4\'15'))), { n: 6, q: 1000, unit: 'm', raw: '6 × 1 000 m' });
  assert.equal(app.paParseReps('Tempo 3×8 min').q, 8);
  assert.equal(app.paParseReps('3 × 3 000 m à AS21').q, 3000);
  assert.equal(app.paParseReps('8 × 1 min / 1 min').unit, 'min');
  assert.equal(app.paParseReps('Footing EF 8 km'), null);
});

test('absorption : facile, juste, dure — dans les deux sens', () => {
  const st = plan([EASY, HARD]);
  const app = loadApp({ now: TODAY + 'T09:00:00+01:00', state: st });
  const S = app.prSessions(st), s1 = S.find((s) => s.key === 'extra_w1_s1'), s2 = S.find((s) => s.key === 'extra_w2_s1');
  const a1 = app.paAbsorb(s1, st), a2 = app.paAbsorb(s2, st);
  assert.equal(a1.verdict, 'easy', JSON.stringify(a1.parts)); assert.ok(a1.margin >= 1, 'marge (effort)');
  assert.equal(a2.verdict, 'hard', JSON.stringify(a2.parts));
  assert.ok(a2.parts.some((p) => p.k === 'pain' && p.v === -2));
  const ok = loadApp({ now: TODAY + 'T09:00:00+01:00', state: plan([OK, OK]) });
  assert.equal(ok.paAbsorb(ok.prSessions(ok.ctx.state).find((s) => s.key === 'extra_w2_s1'), ok.ctx.state).verdict, 'ok');
  // footing : FC bien sous le plafond d'endurance = aisance
  const st2 = synthPlan(); st2.extra_w1_s0_done = true; st2.extra_w1_s0_km = 9; st2.extra_w1_s0_perf = JSON.stringify({ date: '2026-10-26', hr: 130, pace: "5'50", rpe: 3 });
  const app2 = loadApp({ now: '2026-10-27T09:00:00+01:00', state: st2 });
  assert.equal(app2.paAbsorb(app2.prSessions(st2).find((s) => s.key === 'extra_w1_s0'), st2).verdict, 'easy');
});

test('paliers : deux séances faciles → la prochaine monte d\'un cran ; une séance dure → elle redescend', () => {
  const a = { opt: { today: TODAY, raceCat: 'Semi-marathon' } };
  let st = plan([EASY, EASY]);
  let app = loadApp({ now: TODAY + 'T09:00:00+01:00', state: st });
  let P = app.paLadderProposals(st, a, []);
  assert.equal(P.length, 1);
  assert.equal(P[0].key, 'extra_w3_s1'); assert.equal(P[0].kind, 'ladder'); assert.equal(P[0].delta, 1);
  assert.equal(P[0].after.t, '4 × 8 min tempo');
  assert.equal(P[0].after.d, "3 km EF · 4 × 8 min à 4'35 — 4'40 /km · récup 2 min");
  assert.ok(P[0].after.km > 10, 'plus de km : ' + P[0].after.km);
  assert.match(P[0].short, /deux dernières séances/);
  // allure du jour proposée par le calcul : reprise dans la nouvelle séance
  P = app.paLadderProposals(st, a, [{ key: 'extra_w3_s1', field: 'detail', pa: "4'25 — 4'30" }]);
  assert.match(P[0].after.d, /4 × 8 min à 4'25 — 4'30 \/km/);
  // dure
  st = plan([EASY, HARD]); app = loadApp({ now: TODAY + 'T09:00:00+01:00', state: st });
  P = app.paLadderProposals(st, a, []);
  assert.equal(P[0].delta, -1); assert.equal(P[0].after.t, '3 × 6 min tempo');
  // juste : rien ; récup d'une course ou fatigue : jamais de hausse
  st = plan([OK, OK]); app = loadApp({ now: TODAY + 'T09:00:00+01:00', state: st });
  assert.equal(app.paLadderProposals(st, a, []).length, 0);
  st = plan([EASY, EASY]); app = loadApp({ now: TODAY + 'T09:00:00+01:00', state: st });
  assert.equal(app.paLadderProposals(st, { opt: { today: TODAY, raceCat: 'Semi-marathon', noVolumeUp: true } }, []).length, 0);
  assert.equal(app.paLadderProposals(st, { opt: { today: TODAY, raceCat: 'Semi-marathon', noFasterUntil: '2026-11-20' } }, []).length, 0);
});

test('paliers : jamais en affûtage ni la semaine avant la course', () => {
  const st = synthPlan({ km: [30, 34, 30, 20] });
  ['extra_w1_s1', 'extra_w2_s1'].forEach((k) => { st[k + '_done'] = true; st[k + '_km'] = 10; st[k + '_perf'] = JSON.stringify(Object.assign({ date: JSON.parse(st[k]).sched_date }, EASY)); });
  const app = loadApp({ now: TODAY + 'T09:00:00+01:00', state: st });
  assert.equal(app.paLadderProposals(st, { opt: { today: TODAY, raceCat: 'Semi-marathon' } }, []).length, 0);
});

test('volume : le pic visé suit l\'objectif et le niveau, la progression suit ce que tu encaisses', () => {
  const app = loadApp({ now: TODAY + 'T09:00:00+01:00' });
  assert.equal(app.paGoalPeak('Semi-marathon', 51.5, 4), 56);
  assert.equal(app.paGoalPeak('Semi-marathon', 51.5, 3), 42, 'borné par le nombre de séances');
  assert.equal(app.paGoalPeak('10 km', 44, 5), 35);
  assert.equal(app.paProg(1.12, { verdict: 'easy' }), 1.15);
  assert.equal(app.paProg(1.12, { verdict: 'hard' }), 1);
  assert.equal(app.paProg(1.12, { verdict: 'ok' }), 1.12);
  const st = synthPlan({ km: [20, 22, 24, 26, 28, 30, 20, 15] });
  const app2 = loadApp({ now: '2026-10-27T09:00:00+01:00', state: st });
  const base = { today: '2026-10-27', raceCat: 'Semi-marathon', habitual: 30, lastRace: null };
  const A = (opt) => ({ opt: Object.assign({}, base, opt), load: { chronic: 38, acwr: 1, log: [] } });
  const v0 = app2.prVolumePlan(st, A({}));
  const v1 = app2.prVolumePlan(st, A({ goalVdot: 52 }));
  assert.equal(v0.peak, 35); assert.equal(v1.goalPeak, 42, '3 séances par semaine'); assert.equal(v1.peak, 42, 'objectif ambitieux : pic relevé');
  // plan écrit plus ambitieux que ton volume habituel : son pic est gardé
  const st3 = synthPlan({ km: [30, 34, 38, 44, 50, 58, 30, 20] });
  const app3 = loadApp({ now: '2026-10-27T09:00:00+01:00', state: st3 });
  assert.equal(app3.prVolumePlan(st3, A({})).peak, 58, 'jamais sous le pic du plan');
  const v2 = app2.prVolumePlan(st, A({ absorb: { verdict: 'hard' } }));
  assert.equal(v2.prog, 1); assert.ok(v2.weeks.filter((w) => !w.past).every((w) => /dures|affûtage|course|allégée|pic/.test(w.why) || w.target <= 30 || w.after <= w.plan), 'pas de hausse');
  assert.ok(v1.horizonWeeks.length > 4, 'toute la prépa est recalculée');
});

test('volume : au-delà des 4 prochaines semaines, le plan écrit n\'est jamais raboté (seulement relevé)', () => {
  // plan qui monte vite (sorties longues 20-21 km au loin) à partir d'un volume habituel bas : rien ne baisse après 4 semaines
  const st = synthPlan({ km: [26, 30, 34, 38, 42, 48, 54, 60, 62, 64, 40, 25] });
  const app = loadApp({ now: '2026-10-27T09:00:00+01:00', state: st });
  const v = app.prVolumePlan(st, { opt: { today: '2026-10-27', raceCat: 'Semi-marathon', habitual: 30, lastRace: null }, load: { chronic: 30, acwr: 1, log: [] } });
  const far = v.proposals.filter((p) => +p.key.match(/_w(\d+)_/)[1] > 4);
  const down = far.filter((p) => p.after < p.before).map((p) => p.key + ' ' + p.before + '→' + p.after);
  assert.equal(down.length, 0, 'aucune baisse au loin : ' + down.join(', '));
  assert.equal(v.peak, 64, 'pic du plan gardé');
});

test('pilote de nuit : un palier à la fois, jamais deux', () => {
  const app = loadApp({ now: TODAY + 'T09:00:00+01:00', state: synthPlan() });
  const base = { key: 'extra_w3_s1', date: '2026-11-11', field: 'session', kind: 'ladder' };
  const sel = app.apSelect({ proposals: [Object.assign({ delta: 1 }, base), Object.assign({}, base, { key: 'extra_w4_s1', date: '2026-11-12', delta: 2 })] }, TODAY);
  assert.deepEqual(sel.map((p) => p.key), ['extra_w3_s1']);
});

test('écran « Comment ton plan évolue » : tendance, paliers, volume, changements', () => {
  const st = plan([EASY, EASY]);
  st._plan_reviews = [{ date: '2026-11-08', n: 2, kind: 'autopilot', changes: [{ ref: 'extra_w3_s0', field: 'km', kind: 'volume' }] }];
  const app = loadApp({ now: TODAY + 'T09:00:00+01:00', state: st });
  const a = app.prAnalyze();
  assert.ok(a.absorb && a.absorb.n === 2, 'tendance calculée');
  assert.ok(a.proposals.some((p) => p.kind === 'ladder' && p.key === 'extra_w3_s1'), 'palier proposé dans MAJ le plan');
  const E = app.paEvolution(a, TODAY);
  const T = E.ladders.find((L) => L.fam === 'T');
  assert.ok(T && T.next && T.next.prop && T.next.prop.up, JSON.stringify(T));
  assert.equal(E.changes[0].kind, 'autopilot');
  assert.equal(E.trend.n, 2); assert.ok(E.volume === null || E.volume.peak > 0, 'sans volume habituel : pas de volume visé');
});

// ─── 1 à 6 : sortie longue, objectif, auto-évaluation, échange WHOOP, vraie semaine, semaine prochaine ───
const longPlan = (longDet) => synthPlan({ km: [40, 44, 48, 50, 52, 54, 56, 58, 40, 30], longDet: longDet || ((L) => "Sortie longue|5'45 — 6'10 /km") });
const SEMI = { today: '2026-11-10', raceCat: 'Semi-marathon', goalSec: 5340 };   // 1:29:00 → 4'13/km

test('sortie longue : l\'allure semi y entre par paliers, selon la dernière sortie longue', () => {
  const app = loadApp({ now: '2026-11-10T09:00:00+01:00' });
  assert.equal(app.paLongRaceKm('Sortie longue · dont 2 × 3 km à AS21 (récup 1 km EF) en fin de sortie'), 6);
  assert.equal(app.paLongRaceKm("5'45 — 6'10 /km · dont 4 km à AS21"), 4);
  assert.equal(app.paLongRaceKm('Footing EF 8 km'), 0);
  // dernière longue facile (FC basse, effort 3) → 2 km à AS21 dans la prochaine
  let st = longPlan(); st.extra_w2_s2_done = true; st.extra_w2_s2_km = 15; st.extra_w2_s2_perf = JSON.stringify({ date: '2026-11-08', hr: 128, pace: "5'50", rpe: 3 });
  let a2 = loadApp({ now: '2026-11-10T09:00:00+01:00', state: st });
  let P = a2.paLongProposals(st, { opt: SEMI });
  assert.equal(P.length, 1, 'une proposition');
  assert.equal(P[0].key, 'extra_w3_s2'); assert.equal(P[0].fam, 'long'); assert.equal(P[0].delta, 1);
  assert.match(P[0].after, /dont 2 km à AS21 en fin de sortie \(4'13\/km\)/);
  // déjà 4 km à AS21 tenus facilement → 6 km, en 2 × 3 km
  st = longPlan((L) => "Sortie longue|5'45 — 6'10 /km · dont 4 km à AS21 en fin de sortie (4'13/km)");
  st.extra_w2_s2_done = true; st.extra_w2_s2_km = 15; st.extra_w2_s2_perf = JSON.stringify({ date: '2026-11-08', hr: 128, pace: "5'40", rpe: 4 });
  a2 = loadApp({ now: '2026-11-10T09:00:00+01:00', state: st });
  P = a2.paLongProposals(st, { opt: SEMI });
  assert.match(P[0].after, /dont 2 × 3 km à AS21 \(récup 1 km EF\)/); assert.ok(!/dont 4 km/.test(P[0].after), 'ancien palier retiré');
  // dure → un palier en dessous
  st.extra_w2_s2_perf = JSON.stringify({ date: '2026-11-08', hr: 150, pace: "5'40", rpe: 9, pain: { level: 2, zone: 'Mollet' } });
  a2 = loadApp({ now: '2026-11-10T09:00:00+01:00', state: st });
  P = a2.paLongProposals(st, { opt: SEMI });
  assert.equal(P[0].delta, -1); assert.match(P[0].after, /dont 2 km à AS21/);
  // jamais pendant la récup d'une course, ni sous fatigue, ni trop loin de la course
  assert.equal(a2.paLongProposals(st, { opt: Object.assign({}, SEMI, { noVolumeUp: true }) }).length, 0);
  assert.equal(a2.paLongProposals(st, { opt: Object.assign({}, SEMI, { raceCat: '5 km' }) }).length, 0, 'pas de paliers de longue au 5 km');
});

test('auto-évaluation : les hausses tenues rendent le plan plus franc, les échecs plus prudent', () => {
  const app = loadApp({ now: TODAY + 'T09:00:00+01:00' });
  assert.equal(app.paAdapt('easy', 'easy', 'bold'), 2);
  assert.equal(app.paAdapt('easy', 'ok', 'bold'), 1);
  assert.equal(app.paAdapt('easy', null, 'normal'), 1);
  assert.equal(app.paAdapt('easy', 'ok', 'careful'), 0, 'prudent : deux faciles de suite');
  assert.equal(app.paAdapt('easy', 'easy', 'careful'), 1);
  assert.equal(app.paAdapt('hard', 'easy', 'bold'), -1);
  // 3 hausses, les 3 séances tenues → franc
  const st = plan([EASY, EASY]);
  st.extra_w3_s1_done = true; st.extra_w3_s1_km = 10; st.extra_w3_s1_perf = JSON.stringify(Object.assign({ date: '2026-11-11' }, OK));
  st._plan_reviews = ['extra_w1_s1', 'extra_w2_s1', 'extra_w3_s1'].map((k) => ({ date: '2026-10-20', n: 1, kind: 'autopilot', changes: [{ ref: k, field: 'session', kind: 'ladder', delta: 1, fam: 'T' }] }));
  let a = loadApp({ now: '2026-11-16T09:00:00+01:00', state: st });
  let C = a.paLadderCalib(st, '2026-11-16');
  assert.equal(C.n, 3); assert.equal(C.mode, 'bold'); assert.equal(C.fams.T.ok, 3);
  // séance dure ou retirée après une hausse = échec → prudent
  st.extra_w2_s1_perf = JSON.stringify(Object.assign({ date: '2026-11-04' }, HARD));
  delete st.extra_w3_s1_done; delete st.extra_w3_s1_perf; delete st.extra_w3_s1_km; st.extra_w3_s1_skip = true;
  a = loadApp({ now: '2026-11-16T09:00:00+01:00', state: st });
  C = a.paLadderCalib(st, '2026-11-16');
  assert.equal(C.ok, 1); assert.equal(C.mode, 'careful');
  // réglage franc : deux séances faciles → +2 paliers
  const st2 = plan([EASY, EASY]);
  const a3 = loadApp({ now: TODAY + 'T09:00:00+01:00', state: st2 });
  const P = a3.paLadderProposals(st2, { opt: { today: TODAY, raceCat: 'Semi-marathon' }, ladderCalib: { mode: 'bold' } }, []);
  assert.equal(P[0].delta, 2);
});

test('mauvaise nuit : la séance de qualité est échangée avec un footing plus loin dans la semaine', () => {
  const st = synthPlan({ km: [30, 34, 38, 40, 42, 44, 30, 20] });
  st.extra_w3_s3 = JSON.stringify({ type: 'ef', km: 8, d: "Footing EF|5'45 — 6'10 /km", sched_date: '2026-11-13', sched_day: 5 });
  const app = loadApp({ now: '2026-11-10T09:00:00+01:00', state: st });
  const wh = { tired: true, scores: [30, 28, 25], hrvDrop: -12, avg3: 28 };
  const P = app.prWhoopProposals(st, { opt: { today: '2026-11-10' }, fit: {} }, wh);
  const sw = P.filter((p) => p.field === 'date');
  assert.equal(sw.length, 2, JSON.stringify(P.map((p) => p.key + ' ' + p.field)));
  assert.equal(sw.map((p) => p.key + '>' + p.after).join(' '), 'extra_w3_s1>2026-11-13 extra_w3_s3>2026-11-11');
  assert.ok(!P.some((p) => p.key === 'extra_w3_s1' && p.field === 'session'), 'pas remplacée en plus');
  assert.match(sw[0].short, /rien n'est retiré/);
  // appliqué puis annulé : les jours reviennent
  const r = app.prApplyChanges(sw, { kind: 'whoop' });
  assert.equal(r.n, 2);
  assert.equal(JSON.parse(app.ctx.state.extra_w3_s1).sched_date, '2026-11-13');
  assert.equal(JSON.parse(app.ctx.state.extra_w3_s1).sched_day, 5);
  app.prUndoReview(r.index);
  assert.equal(JSON.parse(app.ctx.state.extra_w3_s1).sched_date, '2026-11-11');
  assert.equal(JSON.parse(app.ctx.state.extra_w3_s3).sched_date, '2026-11-13');
  // pas de footing libre plus loin dans la semaine → ancien allègement
  const st2 = synthPlan({ km: [30, 34, 38, 40, 42, 44, 30, 20] });
  const app2 = loadApp({ now: '2026-11-10T09:00:00+01:00', state: st2 });
  const P2 = app2.prWhoopProposals(st2, { opt: { today: '2026-11-10' }, fit: {} }, wh);
  assert.ok(P2.some((p) => p.key === 'extra_w3_s1' && p.field === 'session'));
  // pilote de nuit : l'échange passe, les deux ou rien
  const sel = app.apSelect({ proposals: sw }, '2026-11-10');
  assert.equal(sel.length, 2);
  assert.equal(app.apSelect({ proposals: [sw[0]] }, '2026-11-10').length, 0);
  assert.equal(app.apSelect({ proposals: [Object.assign({}, sw[0], { kind: 'habit' }), Object.assign({}, sw[1], { kind: 'habit' })] }, '2026-11-10').length, 0, 'vraie semaine : jamais la nuit');
});

test('feu vert : très bonne récup avant une séance clé', () => {
  const st = synthPlan({ km: [30, 34, 38, 40, 42, 44, 30, 20] });
  const app = loadApp({ now: '2026-11-10T09:00:00+01:00', state: st });
  const G = app.prGreenLight(st, { opt: { today: '2026-11-10' } }, { fresh: true, avg3: 78 });
  assert.equal(G.key, 'extra_w3_s1'); assert.equal(G.when, 'demain');
  assert.match(G.text, /Feu vert pour Tempo 3×8 min demain : récup 78 % sur 3 nuits, vise le haut de la fourchette \(4'35\/km\)/);
  assert.equal(app.prGreenLight(st, { opt: { today: '2026-11-10' } }, { fresh: false, avg3: 50 }), null);
  assert.equal(app.prGreenLight(st, { opt: { today: '2026-11-10', noVolumeUp: true } }, { fresh: true, avg3: 78 }), null);
});

test('objectif : relevé si tu es en avance, réaliste si tu es en retard, toutes les 4 semaines au plus', () => {
  const app = loadApp({ now: '2026-11-10T09:00:00+01:00' });
  const A = (mid, verdict, days, st) => app.paGoalCheck({ trajectory: { race: { mid: mid, days: days || 120 }, verdict: verdict }, opt: { today: '2026-11-10', goalSec: 5340, raceCat: 'Semi-marathon' } }, st || {});
  const up = A(5220, 'atteignable');
  assert.equal(up.dir, 'up'); assert.equal(up.to, 5250, '1:27:30 arrondi à 30 s');
  assert.equal(A(5300, 'atteignable'), null, 'écart trop petit');
  const down = A(5560, 'ambitieux');
  assert.equal(down.dir, 'down'); assert.equal(down.to, 5550);
  assert.equal(A(5560, 'à portée'), null);
  assert.equal(A(5220, 'atteignable', 20), null, 'trop près de la course');
  assert.equal(A(5220, 'atteignable', 120, { _goal_check: { at: '2026-10-25' } }), null, 'déjà demandé il y a moins de 4 semaines');
  assert.ok(A(5220, 'atteignable', 120, { _goal_check: { at: '2026-10-01' } }));
});

test('vraie semaine : la séance clé passe au jour où tu la fais vraiment', () => {
  const st = synthPlan({ km: [30, 34, 38, 40, 42, 44, 30, 20] });
  // tempos prévus le mercredi, faits le jeudi 3 fois
  ['extra_w1_s1', 'extra_w2_s1', 'extra_w3_s1'].forEach((k, i) => { st[k + '_done'] = true; st[k + '_km'] = 10; st[k + '_perf'] = JSON.stringify(Object.assign({ date: ['2026-10-29', '2026-11-05', '2026-11-12'][i] }, OK)); });
  const app = loadApp({ now: '2026-11-17T09:00:00+01:00', state: st });
  const H = app.paHabits(st, '2026-11-17');
  assert.equal(H.tempo.day, 4); assert.equal(H.tempo.n, 3);
  const P = app.paHabitProposals(st, { opt: { today: '2026-11-17' } });
  assert.equal(P.map((p) => p.key + '>' + p.after).join(' '), 'extra_w4_s1>2026-11-19 extra_w5_s1>2026-11-26');
  assert.match(P[0].short, /jeudi/);
  // activité fixe lourde le jeudi : on ne déplace pas
  st._coach_profile = { fixed: [{ n: 'Foot', day: 4, t: '19:00', min: 90, gap: 24 }] };
  const app2 = loadApp({ now: '2026-11-17T09:00:00+01:00', state: st });
  assert.equal(app2.paHabitProposals(st, { opt: { today: '2026-11-17' } }).length, 0);
});

test('semaine prochaine : prête le week-end, avec ses ajustements', () => {
  const st = synthPlan({ km: [30, 34, 38, 40, 42, 44, 30, 20] });
  const app = loadApp({ now: '2026-11-14T09:00:00+01:00', state: st });
  const N = app.paNextWeek({ opt: { today: '2026-11-14' }, proposals: [{ key: 'extra_w4_s0', date: '2026-11-16', field: 'km', before: 12, after: 14 }] }, '2026-11-14');
  assert.equal(N.from, '2026-11-16'); assert.equal(N.to, '2026-11-22');
  assert.equal(N.props.length, 1); assert.equal(N.km, 42);
  assert.equal(N.sessions.length, 3); assert.ok(N.sessions[0].changed);
  assert.equal(app.paNextWeek({ opt: { today: '2026-11-12' }, proposals: [] }, '2026-11-12'), null, 'pas en semaine');
});
