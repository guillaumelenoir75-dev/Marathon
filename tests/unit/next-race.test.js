// Prochaine course : début après la course en cours (et sa récupération), fenêtres, temps visés, programme de la prépa à venir
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, synthPlan } = require('../helpers/frontend');

const J = (o) => JSON.parse(JSON.stringify(o));
const base = () => {
  const st = synthPlan({ km: [30, 34, 38, 40, 42, 30], start: '2026-10-19' });
  st.record_10km = '41:30'; st._records = { '10 km': { date: '2026-10-10' } };
  st.onboarding = { course: '10 km', date: '2026-11-22', sessions: '4', niveau: 'Confirmé', run_days: [0, 2, 3, 5] };
  return st;
};
const RACE = { name: "10km Novemb'Run", course: '10 km', date: '2026-11-22', km: 10 };

test('après la course en cours (+ moitié de sa récupération) ; 4 distances avec fenêtre, semaines et temps visés', () => {
  const app = loadApp({ now: '2026-10-30T09:00:00+01:00', state: base(), race: RACE });
  const O = J(app.nrOptions('2026-10-30'));
  assert.equal(O.anchor.upcoming, true); assert.equal(O.start, '2026-11-30', 'lundi après la course du 22 + 3 jours');
  assert.deepEqual(O.opts.map((o) => o.cat), ['5 km', '10 km', 'Semi-marathon', 'Marathon']);
  O.opts.forEach((o) => {
    assert.equal(o.minW, app.nrMinWeeks(o.cat, 4));
    assert.ok(o.idealW >= o.minW + 2 && o.earliest <= o.ideal && o.window[0] >= o.earliest && o.window[0] < o.window[1], o.cat);
    assert.equal(new Date(o.earliest + 'T12:00:00').getDay(), 0, 'course un dimanche');
    assert.ok(o.real > o.amb, 'réaliste plus lent qu\'ambitieux');
  });
  const semi = O.opts.find((o) => o.cat === 'Semi-marathon'), dix = O.opts.find((o) => o.cat === '10 km');
  assert.ok(semi.real > 2 * dix.real && semi.real < 2.4 * dix.real, 'cohérent entre distances');
  assert.ok(NR_OK(O.best));
  function NR_OK(c){ return ['5 km', '10 km', 'Semi-marathon', 'Marathon'].indexOf(c) >= 0; }
});

test('marathon avec peu de volume : mise en garde et prépa plus longue ; pas de conseil sur une option risquée', () => {
  const st = base();
  // volume habituel faible : 4 sorties de 5 km par semaine depuis 6 semaines
  for(let w = 1; w <= 2; w++) for(let i = 0; i < 3; i++){ const k = 'extra_w' + w + '_s' + i; st[k + '_done'] = true; st[k + '_km'] = 5; st[k + '_perf'] = JSON.stringify({ pace: "5'40", hr: 140 }); }
  const app = loadApp({ now: '2026-11-05T09:00:00+01:00', state: st, race: RACE });
  const O = J(app.nrOptions('2026-11-05'));
  const m = O.opts.find((o) => o.cat === 'Marathon');
  assert.ok(O.base != null && O.base < 35, 'volume habituel ' + O.base);
  assert.ok(m.warn.length && m.idealW >= 20, JSON.stringify(m.warn));
  assert.notEqual(O.best, 'Marathon');
});

test('prépa à venir : programme généré depuis son début (pas depuis aujourd\'hui), course à la date choisie, objectif', () => {
  const app = loadApp({ now: '2026-10-30T09:00:00+01:00', state: base(), race: RACE });
  const P = J(app.nrBuild({ cat: 'Semi-marathon', date: '2027-03-07', name: 'Semi de Paris', target: 5580, start: '2026-11-30', sessions: 4 }));
  assert.equal(P.meta.start, '2026-11-30'); assert.equal(P.meta.date, '2027-03-07'); assert.equal(P.meta.target, '1:33:00');
  assert.equal(P.meta.weeks, 13, '13 semaines du 30 nov. au 7 mars (et pas 18 depuis aujourd\'hui)');
  const S = Object.keys(P.state).filter((k) => /^extra_w\d+_s\d+$/.test(k)).map((k) => JSON.parse(P.state[k]));
  assert.ok(S.every((x) => x.sched_date >= '2026-11-30'), 'rien avant le début');
  const race = S.filter((x) => x.type === 'race').pop();
  assert.equal(race.sched_date, '2027-03-07');
  assert.equal(P.state.onboarding.course, 'Semi-marathon'); assert.equal(P.state.onboarding.plan_start_date, '2026-11-30');
  assert.equal(P.state.plan_start_date, '2026-11-30'); assert.equal(P.state.target_time, '1:33:00');
});
