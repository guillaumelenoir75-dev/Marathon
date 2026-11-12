// Évolution des allures dans le temps : EF réelle à chaque date (sans rien après la date), zones d'après le niveau, filtres 1 / 3 / 6 / 12 mois
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/frontend');

const NOW = '2026-11-12T09:00:00+01:00';
const iso = (d) => d.toISOString().slice(0, 10);
// 12 mois de footings : 6'10 au début → 5'34 aujourd'hui (FC 140), plus quelques sorties à FC trop haute et des tempos
function history() {
  const s = { plan_start_date: '2025-11-03', _plan_engine: 'generated', fc_max: '194', record_10km: '45:00', _records: { '10 km': { date: '2025-10-12' } } };
  let w = 1, i = 0;
  for (let t = Date.parse('2025-11-04T12:00:00Z'); t <= Date.parse('2026-11-10T12:00:00Z'); t += 3.5 * 86400000) {
    const d = iso(new Date(t)), f = (t - Date.parse('2025-11-04T12:00:00Z')) / (Date.parse('2026-11-10T12:00:00Z') - Date.parse('2025-11-04T12:00:00Z'));
    const sec = Math.round(370 - 36 * f), k = 'extra_w' + w + '_s' + (i % 2), hot = i % 7 === 3;
    s[k] = JSON.stringify({ type: 'ef', km: 9, d: 'Footing EF|x', sched_date: d });
    s[k + '_done'] = true; s[k + '_km'] = 9;
    s[k + '_perf'] = JSON.stringify({ date: d, pace: Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'), hr: hot ? 162 : 140, dur: '55:00' });
    if (i % 4 === 1) {
      const q = 'extra_w' + w + '_s2';
      s[q] = JSON.stringify({ type: 'tempo', km: 10, d: 'Tempo|3 × 2 km', sched_date: d });
      s[q + '_done'] = true; s[q + '_km'] = 10; s[q + '_perf'] = JSON.stringify({ date: d, pace: '5:00', hr: 165, blocsAllure: ['4:40', '4:38', '4:36'] });
    }
    i++; if (i % 2 === 0) w++;
  }
  return s;
}

test('EF : allure réelle qui baisse sur 12 mois, sorties à FC trop haute en points mais hors de la courbe', () => {
  const app = loadApp({ now: NOW, state: history() });
  const D = JSON.parse(JSON.stringify(app.bsPaceSeries('ef', '12m', '2026-11-12')));
  assert.ok(D.pts.length >= 45, 'un point par semaine');
  assert.ok(D.first.v > D.last.v + 25, 'plus rapide aujourd\'hui : ' + D.first.v + ' → ' + D.last.v);
  assert.ok(D.delta < -25);
  assert.ok(D.dots.some((x) => !x.ok) && D.dots.some((x) => x.ok), 'points : FC au-dessus du plafond marquée');
  assert.ok(Math.abs(D.last.v - 336) <= 6, 'aujourd\'hui ≈ 5\'36 : ' + D.last.v);
  // à une date passée : rien de ce qui suit cette date
  const mid = D.pts[Math.floor(D.pts.length / 2)];
  const D6 = JSON.parse(JSON.stringify(app.bsPaceSeries('ef', '6m', '2026-11-12')));
  assert.ok(D6.pts.length < D.pts.length * 1.2 && D6.from >= '2026-05-01');
  assert.ok(mid.v > D.last.v, 'mi-parcours plus lent qu\'aujourd\'hui');
  const D1 = JSON.parse(JSON.stringify(app.bsPaceSeries('ef', '1m', '2026-11-12')));
  assert.ok(D1.pts.length >= 25, '1 mois : un point par jour'); assert.ok(D1.from >= '2026-10-13');
  const D3 = JSON.parse(JSON.stringify(app.bsPaceSeries('ef', '3m', '2026-11-12')));
  assert.ok(D3.from >= '2026-08-13' && D3.pts.length >= 40);
});

test('tempo / seuil / VMA : allure de la zone d\'après le niveau à chaque date, séances de qualité en points', () => {
  const app = loadApp({ now: NOW, state: history() });
  const T = JSON.parse(JSON.stringify(app.bsPaceSeries('tempo', '12m', '2026-11-12')));
  const S = JSON.parse(JSON.stringify(app.bsPaceSeries('seuil', '12m', '2026-11-12')));
  const V = JSON.parse(JSON.stringify(app.bsPaceSeries('vma', '12m', '2026-11-12')));
  assert.ok(T.pts.length > 10 && T.last.vdot > 0);
  assert.ok(V.last.v < S.last.v && S.last.v < T.last.v, 'VMA < seuil < tempo');
  assert.ok(T.dots.length > 10 && T.dots.every((x) => x.v >= 270 && x.v <= 285), 'blocs des tempos');
  assert.equal(V.dots.length, 0, 'pas de fractionné');
  // sans aucune séance : vide, sans erreur
  const empty = loadApp({ now: NOW, state: {} });
  const E = JSON.parse(JSON.stringify(empty.bsPaceSeries('ef', '12m', '2026-11-12')));
  assert.equal(E.pts.length, 0); assert.equal(E.last, null);
});

test('allures de course : projection 5 km → marathon d\'après le niveau, vraies courses / records datés en points, record affiché', () => {
  const s = history();
  s.record_5km = '21:10'; s._records['5 km'] = { date: '2026-06-14' };
  const app = loadApp({ now: NOW, state: s });
  const R = {};
  ['r5', 'r10', 'semi', 'mara'].forEach((z) => { R[z] = JSON.parse(JSON.stringify(app.bsPaceSeries(z, '12m', '2026-11-12'))); });
  ['r5', 'r10', 'semi', 'mara'].forEach((z) => { assert.ok(R[z].pts.length > 40 && R[z].last.t > 0, z); assert.ok(Math.abs(R[z].last.v - R[z].last.t / ({ r5: 5, r10: 10, semi: 21.0975, mara: 42.195 }[z])) <= 1, z + ' allure = temps / distance'); });
  assert.ok(R.r5.last.v < R.r10.last.v && R.r10.last.v < R.semi.last.v && R.semi.last.v < R.mara.last.v, 'plus long = plus lent');
  assert.equal(Math.round(R.r10.last.t), Math.round(app.raceTimeFromVdot(R.r10.last.vdot, 10000)), 'projection = temps équivalent au niveau');
  // vraie course datée dans la période : point « course » à son allure réelle
  const d5 = R.r5.dots.find((x) => x.race && x.date === '2026-06-14');
  assert.ok(d5, '5 km du 14 juin en point'); assert.equal(d5.t, 1270); assert.equal(d5.v, 254);
  // record hors période : pas de point, mais affiché
  assert.equal(R.r10.dots.filter((x) => x.race).length, 0);
  assert.equal(R.r10.record.sec, 2700); assert.equal(R.r10.record.date, '2025-10-12');
  assert.equal(R.semi.record, null, 'pas de semi couru : projection seule');
});
