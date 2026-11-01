// Nettoyage des données : valeurs suspectes écartées des analyses, gardées sur demande
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/frontend');

const NOW = '2026-10-29T09:00:00+01:00';
function st(list, extra) {
  const s = Object.assign({ plan_start_date: '2026-10-05', _plan_engine: 'generated', fc_max: '194' }, extra || {});
  list.forEach((r, i) => {
    const k = 'extra_w1_s' + i;
    s[k] = JSON.stringify({ type: r.type || 'ef', km: r.km || 10, d: r.d || 'Footing EF|x', sched_date: r.date });
    s[k + '_done'] = true; s[k + '_km'] = r.km || 10;
    s[k + '_perf'] = JSON.stringify(Object.assign({ date: r.date, pace: '5:40', hr: 142, dur: r.dur }, r.perf || {}));
  });
  return s;
}
const J = (o) => JSON.parse(JSON.stringify(o));

test('pic de FC max sur un footing écarté des zones ; « garder » le remet', () => {
  const s = st([{ date: '2026-10-10', perf: { strava: { fcMax: 193 } } }, { date: '2026-10-18', type: 'race', km: 10, perf: { pace: '4:25', hr: 172, strava: { fcMax: 186 } } }]);
  const app = loadApp({ now: NOW, state: s });
  const I = J(app.dqIssues('2026-10-29'));
  assert.equal(I.length, 1); assert.equal(I[0].kind, 'fcmax'); assert.match(I[0].msg, /pic du capteur/);
  assert.equal(app.hrZonesEstimate('2026-10-29').fcMax.v, 186, 'FC max de la course, pas le pic');
  app.dqKeep(I[0].id, true);
  assert.equal(J(app.dqIssues('2026-10-29'))[0].kept, true);
  assert.equal(app.hrZonesEstimate('2026-10-29').fcMax.v, 186, '2 valeurs : pic isolé de > 4 bpm toujours écarté par le calcul des zones');
});

test('FC improbable, allure incohérente avec la durée, saut GPS, double validation', () => {
  const s = st([
    { date: '2026-10-11', perf: { hr: 182 } },                                          // footing à 182 de moyenne (94 % FC max)
    { date: '2026-10-12', km: 10, dur: '40:00', perf: { pace: '5:40' } },             // 10 km en 40 min = 4'00, pas 5'40
    { date: '2026-10-15', km: 7, dur: '52:23', perf: { pace: '6:09' } },              // durée avec arrêts : allure en mouvement plausible
    { date: '2026-10-13', perf: { strava: { splits: [{ km: 1, distanceKm: 1, allure: '5:40' }, { km: 2, distanceKm: 1, allure: '2:10' }] } } },
    { date: '2026-10-14', km: 8 }, { date: '2026-10-14', km: 8, d: 'Footing récup|x' }]);
  const app = loadApp({ now: NOW, state: s });
  const kinds = J(app.dqIssues('2026-10-29')).map((i) => i.kind).sort();
  assert.deepEqual(kinds, ['dup', 'hr', 'pace', 'splits']);
  const all = app.prAllDone('2026-10-29');
  assert.equal(all.find((x) => x.date === '2026-10-11').perf.hr, undefined, 'FC écartée de l\'historique analysé');
  assert.equal(all.find((x) => x.date === '2026-10-12').perf.pace, undefined);
  assert.equal(all.find((x) => x.date === '2026-10-13').perf.strava.splits.length, 1);
  assert.equal(all.filter((x) => x.date === '2026-10-14').length, 1, 'double validation comptée une fois');
  assert.equal(JSON.parse(s.extra_w1_s0_perf).hr, 182, 'la donnée enregistrée n\'est jamais modifiée');
});

test('validation express : la sortie Strava va à la séance la plus proche (date puis km) ; déjà validée → signalé', () => {
  const s = { plan_start_date: '2026-10-26', _plan_engine: 'generated' };
  const add = (k, o) => { s[k] = JSON.stringify(Object.assign({ d: 'Séance|x' }, o)); };
  add('extra_w1_s0', { type: 'ef', km: 8, sched_date: '2026-10-27', d: 'Footing EF|x' });
  add('extra_w1_s1', { type: 'tempo', km: 10, sched_date: '2026-10-29', d: 'Tempo|x' });
  add('extra_w1_s2', { type: 'ef', km: 7, sched_date: '2026-10-29', d: 'Footing court|x' });
  const app = loadApp({ now: NOW, state: s });
  assert.equal(app.qvMatch({ date: '2026-10-29', distanceKm: 7.2 }).s.key, 'extra_w1_s2', 'même jour, km les plus proches');
  assert.equal(app.qvMatch({ date: '2026-10-29', distanceKm: 10.1 }).s.key, 'extra_w1_s1');
  assert.equal(app.qvMatch({ date: '2026-10-27', distanceKm: 8 }).s.key, 'extra_w1_s0');
  assert.equal(app.qvMatch({ date: '2026-10-10', distanceKm: 8 }), null, 'aucune séance autour');
  s.extra_w1_s2_done = true; s.extra_w1_s2_km = 7.2; s.extra_w1_s2_perf = JSON.stringify({ date: '2026-10-29' });
  app.ctx.prHistoryChanged();
  assert.ok(app.qvMatch({ date: '2026-10-29', distanceKm: 7.2 }).already, 'déjà validée');
});

test('heure de coucher : réveil 50 min avant la séance du matin, 8 h + moitié de la dette WHOOP, séance clé', () => {
  const s = { plan_start_date: '2026-10-26', _plan_engine: 'generated',
    extra_w1_s0: JSON.stringify({ type: 'tempo', km: 10, d: 'Tempo 3×8 min|x', sched_date: '2026-10-30', sched_time: '06:30' }),
    whoop_data: { sleeps: [{ date: '2026-10-29', duration_hours: '6h30' }, { date: '2026-10-28', duration_hours: '7h00' }, { date: '2026-10-27', duration_hours: '8h10' }] } };
  const app = loadApp({ now: NOW, state: s });
  const B = JSON.parse(JSON.stringify(app.bsBedtime('2026-10-29')));
  // réveil 5h40 ; dette 90 + 60 = 150 min → +75 plafonné à 60 ; séance clé +15 ; 15 min d'endormissement → 5h40 − 8h − 1h30 = 20h10
  assert.equal(B.wake, '5h40'); assert.equal(B.extraMin, 60); assert.equal(B.key, true); assert.equal(B.bed, '20h10');
  const R = JSON.parse(JSON.stringify(app.bsBedtime('2026-10-30')));
  assert.equal(R.session, null, 'rien de prévu le lendemain : conseil quand même'); assert.equal(R.wake, '9h00', 'samedi : réveil du week-end'); assert.equal(R.key, false);
  assert.equal(B.sleep, '9h15', '8 h + 60 min de rattrapage + 15 min séance clé');
});

test('ta nuit : réveil habituel et besoin de sommeil réglables, toujours un conseil', () => {
  const s = { plan_start_date: '2026-10-26', _plan_engine: 'generated', _sleep_target_h: 7.5, _wake_week: '06:30', _wake_weekend: '10:00' };
  const app = loadApp({ now: NOW, state: s });
  const B = JSON.parse(JSON.stringify(app.bsBedtime('2026-10-29')));
  // pas de séance demain, pas de dette connue : 6h30 − 7h30 − 15 min = 22h45
  assert.equal(B.wake, '6h30'); assert.equal(B.sleep, '7h30'); assert.equal(B.bed, '22h45');
  const W = JSON.parse(JSON.stringify(app.bsBedtime('2026-10-31')));   // samedi soir → dimanche matin : réveil du week-end
  assert.equal(W.wake, '10h00'); assert.equal(W.bed, '2h15');
  const F = JSON.parse(JSON.stringify(app.bsBedtime('2026-11-01')));   // dimanche soir → lundi : semaine
  assert.equal(F.wake, '6h30');
});

test('ta nuit : besoin adapté à la journée (effort WHOOP), à la récup du matin et à la course du lendemain ; plafond +1h30', () => {
  const s = { plan_start_date: '2026-10-26', _plan_engine: 'generated', _wake_week: '07:00',
    extra_w1_s0: JSON.stringify({ type: 'race', km: 10, d: 'Course|x', sched_date: '2026-10-30', sched_time: '10:00' }),
    whoop_data: { cycles: [{ date: '2026-10-29', strain: 15.2 }], recoveries: [{ date: '2026-10-29', score: 30 }],
      sleeps: [{ date: '2026-10-29', duration_hours: '7h00' }, { date: '2026-10-28', duration_hours: '8h00' }, { date: '2026-10-27', duration_hours: '8h00' }] } };
  const app = loadApp({ now: NOW, state: s });
  const B = JSON.parse(JSON.stringify(app.bsBedtime('2026-10-29')));
  // dette 0,5 × 60 = 30 ; effort 15,2 → +30 ; récup 30 % → +15 ; course demain → +30 = 105 → plafonné à 90
  assert.equal(B.extraMin, 30); assert.equal(B.loadMin, 30); assert.equal(B.lowMin, 15);
  assert.deepEqual(B.parts.map((p) => p.k), ['need', 'debt', 'load', 'low', 'key', 'cap']);
  assert.equal(B.sleep, '9h30'); assert.equal(B.bed, '21h15');   // 7h00 − 9h30 − 15 min
});

test('besoin de sommeil appris : médiane des nuits bien récupérées sans alcool, rapprochée de 8 h ; manuel prioritaire, retour en auto', () => {
  const add = (n) => { const d = new Date('2026-10-29T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
  const sleeps = [], recs = [];
  for (let i = 0; i < 12; i++) { sleeps.push({ date: add(i), duration_hours: i % 2 ? '7h00' : '7h30' }); recs.push({ date: add(i), score: 75 }); }
  sleeps.push({ date: add(12), duration_hours: '9h30' }); recs.push({ date: add(12), score: 80 });                 // nuit après alcool : écartée
  const s = { plan_start_date: '2026-10-26', _plan_engine: 'generated', whoop_data: { sleeps, recoveries: recs }, _alcohol: { [add(12)]: { l: 7, t: [] } } };
  const app = loadApp({ now: NOW, state: s });
  const N = JSON.parse(JSON.stringify(app.ctx.bsSleepNeed('2026-10-29')));
  // 12 nuits vertes : médiane 7h30 (450) ; 12/18 × 450 + 6/18 × 480 = 460
  assert.equal(N.src, 'auto'); assert.equal(N.n, 12); assert.equal(N.min, 460);
  s._sleep_target_h = 8.5; assert.equal(app.ctx.bsSleepNeed('2026-10-29').src, 'manual');
  s._sleep_need_mode = 'auto'; assert.equal(app.ctx.bsSleepNeed('2026-10-29').min, 460);
});

test('heure de coucher de ce soir : « à venir » tant que la nuit WHOOP du jour ou la séance du jour manquent', () => {
  const s = { plan_start_date: '2026-10-26', _plan_engine: 'generated', whoop_data: { sleeps: [{ date: '2026-10-28', duration_hours: '7h00' }] },
    extra_w1_s0: JSON.stringify({ type: 'ef', km: 8, d: 'Footing EF|x', sched_date: '2026-10-29' }) };
  const app = loadApp({ now: '2026-10-29T09:00:00+01:00', state: s });
  assert.deepEqual(J(app.ctx.bsBedtimeStatus('2026-10-29')), { ready: false, why: 'night', label: 'après ton réveil' }, 'nuit de la veille seulement');
  s.whoop_data.sleeps.unshift({ date: '2026-10-29', duration_hours: '7h30' });
  assert.equal(app.ctx.bsBedtimeStatus('2026-10-29').why, 'session', 'séance du jour pas encore faite (avant 20h)');
  s.extra_w1_s0_done = true; s.extra_w1_s0_km = 8; app.ctx.prHistoryChanged && app.ctx.prHistoryChanged();
  assert.equal(app.ctx.bsBedtimeStatus('2026-10-29').ready, true);
});
