// Le Coach a tous les accès au plan : créer une séance (échauffement à part), changer les km de la course, retirer une séance — annulable
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, synthPlan } = require('../helpers/frontend');

const NOW = '2026-11-21T20:00:00+01:00';

test('course séparée en deux : échauffement créé le même jour + course à 10 km ; séance retirée ; tout s\'annule', () => {
  const st = synthPlan({ start: '2026-11-02', km: [24, 28, 20] });
  let ri = 0; while (st['extra_w3_s' + ri] !== undefined) ri++; const RK = 'extra_w3_s' + ri;
  st[RK] = JSON.stringify({ type: 'race', km: 12.5, d: "🏁 NOVEMB'RUN – 10 km|2,5 km échauffement + 10 km course", sched_date: '2026-11-22', sched_day: 7, sched_time: '10:00' });
  const app = loadApp({ now: NOW, state: st });
  // réponse du Coach (planChat) → propositions à valider
  const items = app.prCoachItems([
    { add: { date: '2026-11-22', time: '09:30', type: 'ef', title: 'Échauffement', detail: '2,5 km EF + 3 accélérations', km: 2.5 }, reason: 'échauffement validé à part' },
    { ref: RK, km: 10, detail: '10 km course à 4\'12/km', reason: 'distance de course seule' }]);
  const add = items.find((x) => x.field === 'add');
  assert.ok(add && add.w === 3 && add.after.t === 'Échauffement' && add.after.km === 2.5 && add.after.time === '09:30');
  assert.equal(items.filter((x) => x.key === RK).map((x) => x.field).sort().join(','), 'detail,km');
  const r = app.prApplyChanges(items.map((x) => Object.assign({}, x)), { coach: true, kind: 'chat' });
  assert.equal(r.n, 2, 'la course + la nouvelle séance');
  const keys = Object.keys(st).filter((k) => /^extra_w3_s\d+$/.test(k)), newKey = keys.find((k) => JSON.parse(st[k])._added);
  const w = JSON.parse(st[newKey]);
  assert.equal(w.d, 'Échauffement|2,5 km EF + 3 accélérations'); assert.equal(w.km, 2.5); assert.equal(w.sched_date, '2026-11-22'); assert.equal(w.sched_time, '09:30'); assert.equal(w.type, 'ef');
  const race = JSON.parse(st[RK]); assert.equal(race.km, 10); assert.equal(race.type, 'race'); assert.match(race.d, /^🏁 NOVEMB'RUN – 10 km\|/, 'titre de la course jamais touché');
  const sun = app.prSessions(st).filter((s) => s.date === '2026-11-22' && !s.skip && (s.key === RK || s.key === newKey));
  assert.equal(sun.length, 2, 'la course et l\'échauffement, le même jour'); assert.ok(sun.some((s) => s.type === 'race' && s.kmPlan === 10) && sun.some((s) => s.title === 'Échauffement' && s.kmPlan === 2.5));
  // retirer une séance
  const other = app.prSessions(st).find((s) => !s.done && !s.skip && s.type !== 'race' && !JSON.parse(st[s.key])._added);
  const sk = app.prCoachItems([{ ref: other.key, skip: true, reason: 'repos' }]);
  assert.equal(sk[0].field, 'skip');
  app.prApplyChanges(sk.map((x) => Object.assign({}, x)), { coach: true, kind: 'chat' });
  assert.equal(st[other.key + '_skip'], true);
  // annulation : retrait annulé, puis échauffement supprimé et course remise à 12,5 km
  app.prUndoReview(st._plan_reviews.length - 1);
  assert.equal(st[other.key + '_skip'], undefined);
  app.prUndoReview(st._plan_reviews.length - 2);
  assert.equal(st[newKey], undefined, 'séance créée retirée');
  assert.equal(JSON.parse(st[RK]).km, 12.5);
  assert.equal(app.prSessions(st).some((s) => s.title === 'Échauffement'), false);
});
