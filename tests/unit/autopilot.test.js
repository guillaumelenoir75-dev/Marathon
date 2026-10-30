// Pilote automatique : ajustements des 7 prochains jours appliqués la nuit, annulables, jamais refaits après annulation
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, synthPlan } = require('../helpers/frontend');

const J = (o) => JSON.parse(JSON.stringify(o));
const plan = () => { const st = synthPlan({ km: [30, 34, 38, 40, 42, 30], start: '2026-10-26' }); st.record_10km = '40:00'; st._records = { '10 km': { date: '2026-10-10' } }; return st; };

test('mode auto : la séance de qualité de la semaine suit ton niveau, avec la raison ; rien au-delà de 7 jours', () => {
  const st = plan(), app = loadApp({ now: '2026-10-29T03:00:00Z', state: st });
  const r = J(app.apRun('2026-10-29'));
  assert.equal(r.applied, true); assert.equal(r.mode, 'auto');
  assert.ok(r.changes.length >= 1 && r.changes.every((c) => c.date >= '2026-10-29' && c.date <= '2026-11-04'), JSON.stringify(r.changes.map((c) => c.date)));
  const c = r.changes.find((x) => x.key === 'extra_w2_s1');
  assert.ok(c && c.why && /4'25 — 4'30/.test(c.after));
  assert.match(JSON.parse(st.extra_w2_s1).d, /4'25 — 4'30/, 'appliqué au plan');
  const h = st._plan_reviews.slice(-1)[0]; assert.ok(h.auto && h.at === r.at && h.kind === 'autopilot');
  // la nuit suivante : déjà ajustée depuis moins de 7 jours → pas d'accélération de plus
  app.ctx.prHistoryChanged && app.ctx.prHistoryChanged();
  const r2 = J(app.apRun('2026-10-30'));
  assert.ok(!r2.changes.some((x) => x.key === 'extra_w2_s1' && x.field === 'detail'), 'pas de 2e palier dans la semaine');
});

test('annulation : plan d\'origine rétabli, et le pilote ne refait pas cet ajustement', () => {
  const st = plan(), app = loadApp({ now: '2026-10-29T03:00:00Z', state: st });
  const before = st.extra_w2_s1;
  const r = J(app.apRun('2026-10-29'));
  st._autopilot_last = r;
  const i = app.apFindEntry(r); assert.ok(i >= 0);
  app.prUndoReview(i);
  assert.equal(JSON.parse(st.extra_w2_s1).d, JSON.parse(before).d, 'consigne d\'origine');
  const r2 = J(app.apRun('2026-10-29'));
  assert.ok(!r2.changes.some((x) => x.key === 'extra_w2_s1' && x.field === 'detail'), 'pas refait après annulation');
});

test('mode « sur proposition » : rien n\'est modifié ; désactivé : rien du tout', () => {
  const st = plan(); st._autopilot = 'suggest';
  const app = loadApp({ now: '2026-10-29T03:00:00Z', state: st }), before = st.extra_w2_s1;
  const r = J(app.apRun('2026-10-29'));
  assert.equal(r.applied, false); assert.ok(r.changes.length >= 1); assert.equal(st.extra_w2_s1, before);
  st._autopilot = 'off'; assert.equal(app.apRun('2026-10-29'), null);
});
