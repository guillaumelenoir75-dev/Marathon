// Forme / fatigue (Banister) : charge TRIMP, forme 42 j / fatigue 7 j, ajustement personnel, jour J, affûtage conseillé
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, synthPlan } = require('../helpers/frontend');

const NOW = '2026-10-29T09:00:00+01:00';
const add = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

test('TRIMP : d\'après la FC de réserve, sinon le type ; plus dur = plus de charge', () => {
  const app = loadApp({ now: NOW, state: { fc_max: '190' } });
  const H = { rest: 50, max: 190 };
  const ef = app.fmTrimp({ type: 'ef', km: 10, perf: { dur: '58:00', hr: 140 } }, H), tempo = app.fmTrimp({ type: 'tempo', km: 10, perf: { dur: '48:00', hr: 165 } }, H);
  assert.ok(ef > 60 && ef < 90, 'EF ' + ef); assert.ok(tempo > ef, 'tempo plus chargé');
  assert.ok(Math.abs(app.fmTrimp({ type: 'frac', km: 10, perf: { dur: '50:00' } }, H) - 130) < 1, 'sans FC : 50 min × 2,6');
});

test('forme monte avec l\'entraînement, la fatigue retombe vite au repos : fraîcheur positive après une semaine calme', () => {
  const st = { plan_start_date: '2026-08-03', _plan_engine: 'generated', fc_max: '190' };
  let i = 0;
  for (let d = '2026-08-03'; d <= '2026-10-18'; d = add(d, 1)) {
    const k = 'extra_w' + (1 + Math.floor(i / 7)) + '_s' + (i++ % 7);
    st[k] = JSON.stringify({ type: 'ef', km: 10, d: 'Footing|x', sched_date: d }); st[k + '_done'] = true; st[k + '_km'] = 10;
    st[k + '_perf'] = JSON.stringify({ date: d, dur: '58:00', hr: 145 });
  }
  const app = loadApp({ now: NOW, state: st });
  const B = JSON.parse(JSON.stringify(app.fmSeries('2026-10-29')));
  const at18 = B.series.find((x) => x.date === '2026-10-18');
  assert.ok(at18.ctl > 50 && at18.atl > at18.ctl * 0.95, 'charge régulière : fatigue ≈ forme');
  assert.ok(B.last.atl < B.last.ctl * 0.4, '11 jours sans courir : la fatigue a fondu');
  assert.ok(B.last.ctl - B.last.atl > 20, 'fraîcheur nette');
  assert.equal(B.model.personal, false, 'pas de repères : modèle standard');
});

test('ajustement personnel : retrouve k1 / k2 sur des repères', () => {
  const app = loadApp({ now: NOW });
  const pts = []; for (let i = 0; i < 20; i++) { const a = 40 + i * 2, b = 30 + (i % 5) * 8; pts.push({ a, b, y: 30 + 0.2 * a - 0.15 * b }); }
  const f = JSON.parse(JSON.stringify(app.fmLsq(pts)));
  assert.ok(Math.abs(f.k1 - 0.2) < 1e-6 && Math.abs(f.k2 - 0.15) < 1e-6 && Math.abs(f.p0 - 30) < 1e-6);
});

test('jour J : projection avec les séances prévues ; affûtage conseillé appliqué au plan puis annulable', () => {
  const st = synthPlan({ km: [40, 44, 48, 50, 52, 50, 46, 30], start: '2026-09-07' });
  Object.keys(st).filter((k) => /^extra_w[1-7]_s\d+$/.test(k)).forEach((k) => { const x = JSON.parse(st[k]); if (x.sched_date <= '2026-10-28') { st[k + '_done'] = true; st[k + '_km'] = x.km; st[k + '_perf'] = JSON.stringify({ date: x.sched_date, dur: Math.round(x.km * 5.8) + ':00', hr: x.type === 'tempo' ? 165 : 142 }); } });
  st.fc_max = '190';
  const app = loadApp({ now: NOW, state: st, race: { name: 'Course test', course: '10 km', date: '2026-11-01', km: 10 } });
  const B = app.fmSeries('2026-10-29');
  const P = JSON.parse(JSON.stringify(app.fmRaceDay(B, '2026-11-01', null, '2026-10-29')));
  assert.equal(P.date, '2026-11-01'); assert.ok(P.series.length === 3);
  const T = app.fmTaperBest(B, '2026-10-29');
  assert.ok(T && T.best.perf >= T.plan.perf, 'le meilleur affûtage ne fait jamais moins bien que le plan');
  const ch = JSON.parse(JSON.stringify(app.fmTaperChanges(T)));
  ch.forEach((c) => assert.ok(c.after < c.before && c.kind === 'taper'));
  if (ch.length) {
    const r = app.prApplyChanges(ch, { kind: 'taper' });
    assert.equal(r.n, ch.length); assert.equal(JSON.parse(st[ch[0].key]).km, ch[0].after);
    app.prUndoReview(st._plan_reviews.length - 1);
    assert.equal(JSON.parse(st[ch[0].key]).km, ch[0].before, 'affûtage annulé');
  }
});
