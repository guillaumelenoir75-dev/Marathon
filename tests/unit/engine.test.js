// Moteur de la mise à jour du plan : volume, allures, imprévus, fusion avec le Coach (cas relevés lors des audits)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, synthPlan } = require('../helpers/frontend');

const NOW = '2026-10-29T09:00:00+01:00';
// prVolumePlan sur un plan synthétique (a = analyse minimale)
function volume(today, o) {
  o = o || {};
  const st = synthPlan(o.st);
  (o.done || []).forEach(([k, km]) => { st[k + '_done'] = true; st[k + '_km'] = km; st[k + '_perf'] = JSON.stringify({ date: JSON.parse(st[k]).sched_date }); });
  const app = loadApp({ now: today + 'T09:00:00+01:00', state: st });
  const a = { opt: { today, raceCat: 'Semi-marathon', habitual: o.hab || 40, lastRace: null, noVolumeUp: !!o.noUp }, load: { chronic: o.chronic || 38, acwr: 1, log: [] } };
  const v = app.prVolumePlan(st, a);
  const wk = (w) => v.weeks.find((x) => x.w === w);
  return { v, wk, props: v.proposals };
}

test('semaines calées du lundi au dimanche, jour de la semaine (1 = lundi)', () => {
  const app = loadApp({ now: NOW });
  assert.equal(app.prMonday('2026-10-28').getDate(), 26);
  assert.equal(app.prWeekday('2026-11-02'), 1);
  assert.equal(app.prWeekday('2026-11-08'), 7);
});

test('volume : lundi matin, sortie longue de dimanche pas encore validée → pas d\'effondrement', () => {
  const { wk, props } = volume('2026-11-02', { done: [['extra_w1_s0', 9], ['extra_w1_s1', 10]] });
  assert.ok(wk(2).target >= 30, 'S2 cible ' + wk(2).target);
  assert.ok(!props.some((p) => /_w2_/.test(p.key) && p.after === 3));
});

test('volume : semaine vraiment incomplète → la suivante repart d\'au moins 60 %', () => {
  const { wk } = volume('2026-11-05', { done: [['extra_w1_s0', 5]] });
  assert.ok(wk(2).target >= 18, 'S2 cible ' + wk(2).target);
});

test('volume : semaine de course de préparation laissée telle quelle', () => {
  const { props } = volume('2026-10-27', { st: { testRace: 4 } });
  assert.ok(!props.some((p) => /_w4_/.test(p.key)));
});

test('volume : +30 %/semaine en construction est corrigé', () => {
  const { props } = volume('2026-10-27', { st: { km: [30, 40, 52, 54, 42, 30] }, hab: 60 });
  assert.ok(props.some((p) => /_w2_|_w3_/.test(p.key)));
});

test('volume : jamais de hausse en affûtage ni pendant une fatigue', () => {
  const { props } = volume('2026-10-27', { st: { km: [30, 30, 30, 30, 20, 15] }, hab: 60, noUp: true });
  const up = props.filter((p) => p.after > p.before);
  assert.ok(!up.some((p) => /_w5_|_w6_/.test(p.key)), 'hausse en affûtage');
  assert.ok(!up.some((p) => /_w1_/.test(p.key)), 'hausse la semaine en cours malgré la fatigue');
});

test('km d\'une sortie longue : la consigne « N km EF » suit (EF / longue seulement)', () => {
  const app = loadApp({ now: NOW });
  assert.equal(app.prKmDetail("26 km EF → finir 4 km à 4'50/km", 'long', 30, 24), "20 km EF → finir 4 km à 4'50/km");
  assert.equal(app.prKmDetail("8 EF · 3 AM @ 5'40/km", 'long', 11, 13), "10 EF · 3 AM @ 5'40/km");
  assert.equal(app.prKmDetail("5'45 — 6'10 /km", 'ef', 8, 6), "5'45 — 6'10 /km");
  assert.equal(app.prKmDetail('3 km EF · 4 × 1000 m', 'frac', 10, 8), '3 km EF · 4 × 1000 m');
});

test('allures : niveau du plan figé sur les allures d\'origine, pas d\'accélération à chaque mise à jour', () => {
  const st = synthPlan();
  const app = loadApp({ now: NOW, state: st });
  const fit = { vdot: 48, paces: {}, preds: {} };
  const opt = { today: '2026-10-29' };
  const v0 = app.prPlanVdot(st), p1 = app.prPaceProposals(st, fit, opt).filter((p) => p.delta < 0);
  assert.ok(p1.length > 0, 'des accélérations sont proposées au départ');
  // application des propositions + historique
  const changes = [];
  p1.forEach((p) => { const x = JSON.parse(st[p.key]); x.d = x.d.split('|')[0] + '|' + p.after; st[p.key] = JSON.stringify(x); changes.push({ ref: p.key, field: 'detail', before: p.before, after: p.after, src: 'calcul' }); });
  st._plan_reviews = [{ date: '2026-10-29', n: changes.length, changes }];
  assert.ok(Math.abs(app.prPlanVdot(st) - v0) < 0.05, 'niveau du plan inchangé');
  assert.equal(app.prPaceProposals(st, fit, opt).filter((p) => p.delta < 0).length, 0, 'plus de nouvelle accélération');
});

test('allures : une consigne fixée par le Coach n\'est plus retouchée par le calcul', () => {
  const st = synthPlan();
  const app = loadApp({ now: NOW, state: st });
  const fit = { vdot: 48, paces: {}, preds: {} };
  const p = app.prPaceProposals(st, fit, { today: '2026-10-29' })[0];
  st._plan_reviews = [{ date: '2026-10-28', changes: [{ ref: p.key, field: 'detail', before: 'x', after: p.before, src: 'coach' }] }];
  assert.ok(!app.prPaceProposals(st, fit, { today: '2026-10-29' }).some((x) => x.key === p.key));
});

test('allures : une course récente redonne la main au calcul et l\'écart est rattrapé en une fois', () => {
  const st = synthPlan();
  const app = loadApp({ now: NOW, state: st });
  const fit = { vdot: 54, paces: {}, preds: {} };
  const base = app.prPaceProposals(st, fit, { today: '2026-10-29' }).filter((p) => p.intent === 'T' || p.intent === 'I');
  assert.ok(base.length && base.every((p) => p.delta >= -10), 'sans course récente : 10 s/km au plus');
  const p = base[0];
  st._plan_reviews = [{ date: '2026-10-20', changes: [{ ref: p.key, field: 'detail', before: 'x', after: p.before, src: 'coach' }] }];
  assert.ok(!app.prPaceProposals(st, fit, { today: '2026-10-29', lastRace: { cat: '10 km', date: '2026-10-18' } }).some((x) => x.key === p.key), 'consigne du Coach plus récente que la course : gardée');
  const fresh = app.prPaceProposals(st, fit, { today: '2026-10-29', lastRace: { cat: '10 km', date: '2026-10-26' } });
  const q = fresh.find((x) => x.key === p.key);
  assert.ok(q, 'consigne du Coach antérieure à la course : recalculée');
  assert.ok(fresh.some((x) => (x.intent === 'T' || x.intent === 'I') && x.delta < -10), 'course de 3 jours : plus de 10 s/km d\'un coup');
  assert.ok(fresh.every((x) => x.delta >= -30), 'jamais plus de 30 s/km');
  assert.ok(app.prPaceProposals(st, fit, { today: '2026-10-29', lastRace: { cat: '10 km', date: '2026-09-20' } }).filter((x) => x.intent === 'T' || x.intent === 'I').every((x) => x.delta >= -10), 'course de plus de 3 semaines : 10 s/km');
});

test('allures : une consigne du Coach se recalcule dès que ton niveau a bougé d\'1 point ; « pourquoi rien » expliqué', () => {
  const st = synthPlan();
  const app = loadApp({ now: NOW, state: st });
  const fit = { vdot: 51, paces: {}, preds: {} };
  const p = app.prPaceProposals(st, fit, { today: '2026-10-29' })[0];
  // fixée par le Coach quand le niveau était 50,5 : gardée, et la raison est donnée
  st._plan_reviews = [{ date: '2026-10-27', vdot: 50.5, changes: [{ ref: p.key, field: 'detail', before: 'x', after: p.before, src: 'coach' }] }];
  const tr = [];
  assert.ok(!app.prPaceProposals(st, fit, { today: '2026-10-29', trace: tr }).some((x) => x.key === p.key));
  assert.equal(tr.find((t) => t.key === p.key).st, 'coach');
  // fixée quand le niveau était 46 : ton niveau a pris 5 points → recalculée
  st._plan_reviews[0].vdot = 46;
  assert.ok(app.prPaceProposals(st, fit, { today: '2026-10-29' }).some((x) => x.key === p.key));
  // fixée il y a plus de 4 semaines : recalculée
  st._plan_reviews[0].vdot = 50.8; st._plan_reviews[0].date = '2026-09-20';
  assert.ok(app.prPaceProposals(st, fit, { today: '2026-10-29' }).some((x) => x.key === p.key));
});

test('allures déjà à ton niveau : rien de proposé, la tuile « plan » montre le niveau des allures actuelles', () => {
  const st = synthPlan();
  const app = loadApp({ now: NOW, state: st });
  const v0 = app.prPlanVdot(st), fit = { vdot: v0 + 4, paces: {}, preds: {} };
  const P = app.prPaceProposals(st, fit, { today: '2026-10-29', lastRace: { cat: '10 km', date: '2026-10-26' } }).filter((x) => x.intent === 'T');
  const changes = [];
  P.forEach((p) => { const x = JSON.parse(st[p.key]); x.d = x.d.split('|')[0] + '|' + p.after; st[p.key] = JSON.stringify(x); changes.push({ ref: p.key, field: 'detail', before: p.before, after: p.after, src: 'calcul' }); });
  st._plan_reviews = [{ date: '2026-10-29', changes }];
  assert.ok(Math.abs(app.prPlanVdot(st) - v0) < 0.05, 'niveau d\'origine du plan inchangé (calcul)');
  assert.ok(app.prPlanVdotNow(st) > v0 + 2, 'niveau des allures actuelles : ' + app.prPlanVdotNow(st));
  const tr = [];
  assert.equal(app.prPaceProposals(st, fit, { today: '2026-10-29', trace: tr }).filter((x) => x.intent === 'T').length, 0);
  assert.ok(tr.filter((t) => t.intent === 'T').every((t) => t.st === 'ok'), JSON.stringify(tr.map((t) => t.st)));
});

test('séance retirée (imprévu) : ni allure proposée, ni comptée dans la semaine', () => {
  const st = synthPlan(); st.extra_w3_s1_skip = true; st.extra_w3_s1_skip_reason = 'Indisponible';
  const app = loadApp({ now: NOW, state: st });
  assert.ok(!app.prPaceProposals(st, { vdot: 48, paces: {}, preds: {} }, { today: '2026-10-29' }).some((p) => p.key === 'extra_w3_s1'));
  assert.ok(!app.prWeeks(st, '2026-10-29')[3].sess.some((s) => s.key === 'extra_w3_s1'));
});

test('imprévu : séance clé déplacée dans sa semaine, jamais collée à une séance dure déjà faite', () => {
  const st = synthPlan({ start: '2026-10-28' });   // le plan démarre un mercredi
  st.extra_w2_s1_done = true; st.extra_w2_s1_km = 10; st.extra_w2_s1_perf = JSON.stringify({ date: '2026-11-04' });
  const app = loadApp({ now: '2026-11-03T09:00:00+01:00', state: st });
  const W = app.prWeeks(st, '2026-11-03');
  assert.equal(W[2].from, '2026-11-02'); assert.equal(W[2].to, '2026-11-08');
  const ch = app.prImprevuChanges('indispo', '2026-11-08', '2026-11-08');
  assert.ok(ch.length >= 1);
  assert.ok(ch.every((c) => !(c.field === 'date' && /2026-11-0[35]/.test(c.after))), JSON.stringify(ch.map((c) => c.after)));
});

test('WHOOP / douleur : une séance déjà allégée n\'est pas réallégée', () => {
  const app = loadApp({ now: NOW });
  const st = { _plan_reviews: [{ date: '2026-10-28', changes: [{ ref: 'extra_w1_s1', kind: 'whoop' }, { ref: 'extra_w1_s2', kind: 'volume' }] }] };
  const e = app.prEasedSince(st, '2026-10-25');
  assert.ok(e.extra_w1_s1 && !e.extra_w1_s2);
});

test('Coach : consigne appliquée à la séance remplacée, autre changement → remplacement retiré, choix conservés', () => {
  const app = loadApp({ now: NOW });
  const R = { items: [
    { key: 'K1', field: 'session', src: 'calcul', kind: 'whoop', on: true, after: { t: 'Footing EF', d: 'facile', km: 6, type: 'ef' } },
    { key: 'K2', field: 'session', src: 'calcul', kind: 'test', on: true, after: { t: 'Test 5 km', d: 'test', km: 10, type: 'tempo' } },
    { key: 'K3', field: 'detail', src: 'calcul', on: false, after: 'x' }], held: [] };
  R.auto = R.items.slice();
  app._prMergeCoach(R, [{ key: 'K1', field: 'detail', after: "6'00 /km", src: 'coach', before: 'a' }, { key: 'K2', field: 'title', after: 'Tempo', src: 'coach', before: 'b' }], [], 'avis');
  const s = R.items.map((x) => x.key + ':' + x.field + ':' + x.src + ':' + (x.on ? 'on' : 'off'));
  assert.ok(s.includes('K1:session:calcul:on') && R.items.find((x) => x.key === 'K1').after.d === "6'00 /km");
  assert.ok(!s.some((x) => /^K2:session/.test(x)) && s.includes('K2:title:coach:on'));
  assert.ok(s.includes('K3:detail:calcul:off'));
  // relance sans « rejected » : une proposition écartée la fois d'avant revient
  app._prMergeCoach(R, [], ['K3'], 'avis 2'); assert.ok(!R.items.some((x) => x.key === 'K3'));
  app._prMergeCoach(R, [], [], 'avis 3'); assert.ok(R.items.some((x) => x.key === 'K3'));
});
