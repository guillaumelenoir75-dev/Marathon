// « Ma journée » : étapes du jour dans l'ordre, fait / maintenant / ensuite, selon l'heure et ce qui est déjà fait
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, synthPlan } = require('../helpers/frontend');

const J = (o) => JSON.parse(JSON.stringify(o));
const ids = (L) => L.map((x) => x.id.replace(/-extra.*/, ''));
const NOW = '2026-11-09T07:30:00+01:00';   // lundi : footing EF prévu (synthPlan)

function plan() {
  const st = synthPlan({ start: '2026-11-02', km: [24, 28, 30] });
  st.extra_w2_s0_sched = JSON.stringify({ time: '12:30' });
  st.rf2r1sched = JSON.stringify({ day: 1, time: '19:00' });   // renfo lundi soir
  return st;
}

test('matin (admin) : réveil maintenant, puis alcool, séance de midi, renfo, coucher et demain ensuite', () => {
  const st = plan();
  const app = loadApp({ now: NOW, state: st });
  const L = J(app.mjSteps(st, '2026-11-09', 7 * 60 + 30));
  assert.deepEqual(L.map((x) => x.id.split('-')[0]), ['wake', 'alc', 'sess', 'renfo', 'bed', 'next'], 'dans l\'ordre de la journée');
  assert.equal(L.find((x) => x.st === 'now').id, 'wake');
  const s = L.find((x) => x.kind === 'sess');
  assert.equal(s.tm, '12:30'); assert.equal(s.st, 'later'); assert.match(s.btn, /Valider/);
  assert.match(L.find((x) => x.id === 'next').t, /^Mer 11 · Tempo/);
  assert.equal(app.mjPhase(7 * 60 + 30), 'matin'); assert.equal(app.mjPhase(13 * 60), 'jour'); assert.equal(app.mjPhase(20 * 60), 'soir');
});

test('réveil et alcool faits → repliés ; la séance du jour devient « maintenant » ; faite → renfo puis coucher', () => {
  const st = plan();
  st._wakeup_2026_11_09 = true; st['_wakeup_2026-11-09'] = true; st._alcohol = { '2026-11-09': { l: 0, t: [], at: 1 } };
  const app = loadApp({ now: '2026-11-09T11:50:00+01:00', state: st });
  let L = J(app.mjSteps(st, '2026-11-09', 11 * 60 + 50));
  assert.equal(L.find((x) => x.id === 'wake').st, 'done'); assert.equal(L.find((x) => x.id === 'alc').st, 'done');
  assert.match(L.find((x) => x.id === 'alc').t, /Pas d'alcool/);
  assert.equal(L.find((x) => x.st === 'now').kind, 'sess');
  // le soir, séance pas encore validée : elle passe avant l'alcool non renseigné
  const st2 = plan(); st2['_wakeup_2026-11-09'] = true; const app2 = loadApp({ now: '2026-11-09T20:00:00+01:00', state: st2 });
  assert.equal(J(app2.mjSteps(st2, '2026-11-09', 20 * 60)).find((x) => x.st === 'now').kind, 'sess');
  assert.equal(J(app2.mjSteps(st2, '2026-11-09', 8 * 60)).find((x) => x.st === 'now').id, 'alc', 'le matin : l\'alcool d\'abord');
  // séance faite (validation automatique sans ressenti) → ressenti à raconter, puis renfo
  st.extra_w2_s0_done = true; st.extra_w2_s0_km = 8.02;
  st.extra_w2_s0_perf = JSON.stringify({ date: '2026-11-09', pace: '5:44', hr: 141, dur: '46:00', auto: { at: 1, src: 'scan' } });
  L = J(app.mjSteps(st, '2026-11-09', 13 * 60 + 30));
  const s = L.find((x) => x.kind === 'sess');
  assert.equal(s.st, 'done'); assert.match(s.s, /8,02 km · 5'44/); assert.ok(s.share);
  assert.equal(L.find((x) => x.st === 'now').id, 'feel-extra_w2_s0');
  st.extra_w2_s0_perf = JSON.stringify({ date: '2026-11-09', pace: '5:44', hr: 141, dur: '46:00', auto: { at: 1, src: 'scan' }, rpe: 4 });
  L = J(app.mjSteps(st, '2026-11-09', 13 * 60 + 30));
  assert.equal(L.find((x) => x.st === 'now').id, 'renfo-1');
  st.rf2r1done = true;
  L = J(app.mjSteps(st, '2026-11-09', 21 * 60));
  assert.equal(L.find((x) => x.st === 'now').id, 'bed', 'le soir, tout fait : le coucher');
});

test('jour de repos : « Repos aujourd\'hui » et prochaine séance ; athlète : ni réveil, ni alcool, ni brief', () => {
  const st = plan();
  const app = loadApp({ now: '2026-11-10T08:00:00+01:00', state: st, admin: false });
  const L = J(app.mjSteps(st, '2026-11-10', 8 * 60));
  assert.ok(L.some((x) => x.id === 'rest'));
  assert.ok(!L.some((x) => x.id === 'wake' || x.id === 'alc' || x.id === 'brief'));
  const n = L.find((x) => x.id === 'next'); assert.match(n.t, /^Demain · Tempo/);
  assert.equal(L.find((x) => x.st === 'now').id, 'bed', 'seul repère restant');
});
