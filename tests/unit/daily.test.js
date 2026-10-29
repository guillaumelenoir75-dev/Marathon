// Entraînement au quotidien : test 5 km, blocs Strava, météo, plan de course, forme du jour, dates, badges
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/frontend');

const NOW = '2026-10-29T09:00:00+01:00';
const lap = (d, s) => ({ distanceKm: d, duree_sec: s, allure: Math.floor(s / d / 60) + ':' + String(Math.round(s / d % 60)).padStart(2, '0') });

test('test 5 km : allure ou temps saisi reconnus, valeurs aberrantes rejetées', () => {
  const app = loadApp({ now: NOW }), mk = (b) => ({ perf: { blocsAllure: b }, km: 10 });
  assert.equal(app.prTestTime(mk(['4:10'])), 1250);
  assert.equal(app.prTestTime(mk(['20:50'])), 1250);
  assert.equal(app.prTestTime(mk(['2:10'])), null);
  assert.equal(app.prTestTime(mk(['55:00'])), null);
});

test('blocs lus dans les tours Strava (mètres, minutes) ; tours au km d\'un footing ignorés', () => {
  const app = loadApp({ now: NOW });
  const laps = [lap(3, 1050), lap(1, 256), lap(0.32, 120), lap(1, 258), lap(0.31, 120), lap(1, 255), lap(0.3, 118), lap(1, 259), lap(2, 720)];
  assert.deepEqual(app.prBlocsFromLaps('Fractionné 4×1000 m', "3 km EF · 4 × 1000 m à 4'18 — 4'22 /km · récup 2 min", laps), ['4:16', '4:18', '4:15', '4:19']);
  const t = [lap(2, 700), lap(1.27, 360), lap(0.3, 120), lap(1.28, 361), lap(0.3, 120), lap(1.27, 358), lap(2, 700)];
  assert.equal(app.prBlocsFromLaps('Tempo 3×6 min', "3 km EF · 3 × 6 min à 4'40 — 4'45 /km", t).length, 3);
  assert.equal(app.prBlocsFromLaps('Fractionné 4×1000 m', "4 × 1000 m à 4'18 — 4'22 /km", [lap(1, 340), lap(1, 345), lap(1, 342)]), null);
});

test('météo : ralentissement selon chaleur, humidité, vent', () => {
  const app = loadApp({ now: NOW });
  assert.equal(app.prWxAdj({ t: 12, h: 50, w: 5 }).pct, 0);
  assert.ok(app.prWxAdj({ t: 27, h: 50, w: 25 }).pct >= 5);
});

test('plan de course : total = temps visé, départ prudent, relance sur le dernier km entier', () => {
  const app = loadApp({ now: NOW });
  const s10 = app.prRaceSplits(2600, 10);
  assert.equal(s10.length, 10); assert.equal(Math.round(s10[9].cum), 2600); assert.ok(s10[0].pace > 260);
  const semi = app.prRaceSplits(5400, 21.0975);
  assert.equal(Math.round(semi[21].cum), 5400);
  assert.equal(Math.round(semi[20].pace), Math.round(semi[21].pace));
  assert.ok(semi[19].pace > semi[20].pace);
});

test('forme du jour : même score que les Statistiques (récup, sommeil, FC repos, VFC)', () => {
  const app = loadApp({ now: NOW });
  assert.equal(app.wellnessScore({ score: 38, hrv: 65 }, { performance_pct: 74 }, 50), 61);
});

test('forme du jour : « en attente du réveil » après 4h tant que la récup de la nuit manque', () => {
  const st = { whoop_data: { recoveries: [{ date: '2026-10-28', score: 38 }] } };
  assert.equal(loadApp({ now: '2026-10-29T07:00:00+01:00', state: st }).wellnessWaiting(), true);
  assert.equal(loadApp({ now: '2026-10-29T03:00:00+01:00', state: st }).wellnessWaiting(), false);
  st.whoop_data.recoveries[0].date = '2026-10-29';
  assert.equal(loadApp({ now: '2026-10-29T07:00:00+01:00', state: st }).wellnessWaiting(), false);
});

test('FC repos : la FC de nuit WHOOP remplace la saisie du matin, jour par jour', () => {
  const st = { 'fc_repos_2026-10-29': 50, 'fc_repos_2026-10-27': 49, whoop_data: { recoveries: [{ date: '2026-10-29', rhr: 57 }, { date: '2026-10-28', rhr: 55 }] } };
  const app = loadApp({ now: NOW, state: st });
  app.whoopFcToState(st.whoop_data);
  assert.equal(st['fc_repos_2026-10-29'], 57); assert.equal(st['fc_repos_2026-10-28'], 55); assert.equal(st['fc_repos_2026-10-27'], 49);
});

test('dates des plans générés décalées d\'un jour : recalées une seule fois', () => {
  const st = { extra_w9_s0: JSON.stringify({ sched_date: '2026-11-01', sched_day: 1 }), extra_w9_s1: JSON.stringify({ sched_date: '2026-11-03', sched_day: 2 }), extra_w9_s2: JSON.stringify({ sched_date: '2026-11-05', sched_day: 2 }) };
  const app = loadApp({ now: NOW, state: st });
  app.prFixSchedDatesV1();
  assert.equal(JSON.parse(st.extra_w9_s0).sched_date, '2026-11-02');
  assert.equal(JSON.parse(st.extra_w9_s1).sched_date, '2026-11-03');
  assert.equal(JSON.parse(st.extra_w9_s2).sched_date, '2026-11-05');
  assert.equal(st._sched_fix_v1, true);
});

test('badges : un badge obtenu le reste même si la série casse', () => {
  const app = loadApp({ now: NOW, state: { _badges: { streak5: '2026-10-01' } } });
  assert.equal(app.prBadges().list.find((b) => b.id === 'streak5').on, true);
});
