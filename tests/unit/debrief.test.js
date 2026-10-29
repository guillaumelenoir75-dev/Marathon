// Bilan de fin de prépa et recette personnelle appliquée à la prépa suivante
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, synthPlan } = require('../helpers/frontend');

// prépa terminée : toutes les séances faites, une douleur gênante après une grosse hausse, course finale courue
function finishedPrep(o) {
  o = o || {};
  const km = o.km || [30, 33, 45, 46, 30, 20];
  const st = synthPlan({ km, start: '2026-08-31' });
  Object.keys(st).filter((k) => /^extra_w\d+_s\d+$/.test(k)).forEach((k) => {
    const x = JSON.parse(st[k]); st[k + '_done'] = true; st[k + '_km'] = x.km;
    const perf = { date: x.sched_date, validatedAt: x.sched_date + 'T18:00:00Z' };
    if (x.type === 'tempo') perf.blocsAllure = ['4:30', '4:31', '4:29'];
    if (o.painWeek && k === 'extra_w' + o.painWeek + '_s0') perf.pain = { level: 2 };
    st[k + '_perf'] = JSON.stringify(perf);
  });
  return st;
}

test('bilan : régularité, volume, hausse suivie d\'une douleur, leçons', () => {
  const st = finishedPrep({ painWeek: 3 });
  const app = loadApp({ now: '2026-10-29T09:00:00+01:00', state: st });
  const d = app.prepDebrief(st, { title: 'Semi test', dist: 'Semi-marathon', date: '2026-10-11', result: '1:36:00', target: '1:35:00' });
  assert.equal(d.sessions.done, d.sessions.planned);
  assert.equal(d.completion, 1);
  assert.equal(d.volume.peak, 46);
  assert.ok(d.rises.risky && d.rises.risky > 1.3, 'hausse 33 → 45 km suivie d\'une douleur');
  assert.equal(d.pains.length, 1);
  assert.ok(d.taper && d.taper.w0 < d.taper.w2, 'affûtage mesuré');
  assert.ok(d.lessons.some((l) => /douleur ou un arrêt a suivi une hausse/.test(l)));
  assert.ok(d.lessons.some((l) => /Objectif manqué/.test(l)));
});

test('recette : progression bridée après une douleur, affûtage d\'une course réussie, allures', () => {
  const app = loadApp({ now: '2026-10-29T09:00:00+01:00' });
  const ok = { title: '10 km réussi', dist: '10 km', rises: { maxOk: 1.14, risky: null }, taper: { w0: 0.5, w1: 0.85, w2: 1 }, taperOk: true, calib: { n: 3, k: 3 }, volume: { avg8: 45, longest: 18 } };
  const hurt = { title: 'Semi douleur', dist: 'Semi-marathon', rises: { maxOk: 1.1, risky: 1.12 }, taper: { w0: 0.5, w1: 0.7, w2: 0.9 }, taperOk: false, calib: { n: 2, k: 2 }, volume: { avg8: 50, longest: 20 } };
  const R = app.prepRecette([hurt, ok]);
  assert.equal(R.progression, 1.09, 'hausse 1,12 suivie d\'une douleur → 1,09 au plus');
  assert.ok(R.taper.short && R.taper.short.from === '10 km réussi' && !R.taper.long, 'affûtage repris seulement d\'une course réussie');
  assert.equal(R.calib, 'confiant');
  assert.equal(R.base, 50); assert.equal(R.longest, 20);
  assert.ok(app.prepRecetteLines(R).length >= 3);
  assert.equal(app.prepRecette([{ title: 'x', rises: { maxOk: 1.18 }, volume: {} }]).progression, 1.15);
  // prépa trop peu validée dans l'app : ignorée
  assert.equal(app.prepRecette([{ title: 'vide', completion: 0.2, rises: { risky: 1.1 }, volume: { avg8: 20 } }]), null);
});

test('mise à jour du plan : progression et affûtage de la recette appliqués', () => {
  const st = synthPlan({ km: [30, 40, 52, 54, 42, 30] });
  const app = loadApp({ now: '2026-10-27T09:00:00+01:00', state: st });
  const base = { today: '2026-10-27', raceCat: 'Semi-marathon', habitual: 60, lastRace: null };
  const run = (recette) => app.prVolumePlan(st, { opt: Object.assign({ recette }, base), load: { chronic: 38, acwr: 1, log: [] } });
  const plain = run(null), slow = run({ progression: 1.05 });
  const t = (v, w) => v.weeks.find((x) => x.w === w).target;
  assert.ok(t(slow, 3) < t(plain, 3), 'recette prudente : cibles de construction plus basses');
  assert.ok(/ta recette/.test(slow.weeks.find((x) => x.w === 3).why));
  const taper = run({ progression: 1.12, taper: { long: { w0: 0.3, w1: 0.55, w2: 0.7 } } });
  assert.ok(t(taper, 5) <= t(plain, 5), 'affûtage personnel (plus marqué) appliqué');
});
