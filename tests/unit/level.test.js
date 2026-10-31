// « Niveau du moment » : courses qui vieillissent, séances de qualité manquées, coupure, endurance — le niveau peut baisser
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/frontend');

const TODAY = '2026-10-29', NOW = TODAY + 'T09:00:00+01:00';
const add = (n) => { const d = new Date(TODAY + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const pace = (s) => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
// état : record 10 km daté + séances faites (semaine 1)
function st(recordAgo, list) {
  const s = { plan_start_date: '2026-06-01', _plan_engine: 'generated', record_10km: '42:00', _records: { '10 km': { date: add(-recordAgo) } } };
  (list || []).forEach((r, i) => {
    const k = 'extra_w1_s' + i;
    s[k] = JSON.stringify({ type: r.type || 'ef', km: 10, d: r.d || "Footing EF|5'45 — 6'10 /km", sched_date: r.date });
    s[k + '_done'] = true; s[k + '_km'] = 10;
    s[k + '_perf'] = JSON.stringify(Object.assign({ date: r.date, pace: pace(r.pace || 340), hr: r.hr || 140 }, r.perf || {}));
  });
  return s;
}
const fit = (s, today) => { const app = loadApp({ now: NOW, state: s }); const f = app.prFitness(s, { today: today || TODAY, races: [] }); return JSON.parse(JSON.stringify(f)); };
const easy = (from, n, every) => Array.from({ length: n }, (_, i) => ({ date: add(from + i * (every || 3)) }));

test('course récente : niveau plein ; la même course il y a 7 mois compte ~1,3 point de moins', () => {
  const a = fit(st(20, easy(-30, 10))), b = fit(st(200, easy(-30, 10)));
  assert.ok(a.vdot > 49 && a.vdot < 51, 'niveau ' + a.vdot);
  assert.ok(Math.abs(a.vdot - b.vdot - 1.3) < 0.15, a.vdot + ' → ' + b.vdot);
  assert.ok(b.why.some((w) => w.base && /compte moins/.test(w.t)));
});

test('trois séances de qualité sous l\'allure prévue en 6 semaines : le niveau baisse (1,5 au plus)', () => {
  const T = (d) => ({ type: 'tempo', date: add(d), d: "Tempo 3×8 min|3 km EF · 3 × 8 min à 4'35 — 4'40 /km", perf: { blocsAllure: ['4:55', '4:56', '4:57'] } });
  const base = fit(st(20, easy(-40, 14)));
  const low = fit(st(20, easy(-40, 14).concat([T(-30), T(-18), T(-6)])));
  assert.ok(Math.abs(base.vdot - low.vdot - 1.5) < 0.11, base.vdot + ' → ' + low.vdot);
  assert.ok(low.why.some((w) => /sous l'allure prévue/.test(w.t) && w.d < 0));
  const two = fit(st(20, easy(-40, 14).concat([T(-18), T(-6)])));
  assert.equal(two.vdot, base.vdot, 'deux séances ne suffisent pas');
});

test('coupure : −0,35 par semaine au-delà de la 1re, effacée progressivement à la reprise', () => {
  const base = fit(st(30, easy(-60, 14, 3)));                         // dernière sortie il y a 21 j
  const off = fit(st(30, easy(-60, 14, 3)), add(0));
  assert.equal(base.vdot, off.vdot);
  const stopped = fit(st(30, easy(-60, 13, 3)));                      // 13 sorties : dernière il y a 24 j
  const resumed = fit(st(30, easy(-60, 13, 3).concat(easy(-8, 3, 3))));   // reprise il y a 8 j après 16 j d'arrêt
  const ref = fit(st(30, easy(-60, 20, 3)));
  assert.ok(stopped.why.some((w) => /jours sans courir/.test(w.t)) && stopped.vdot < ref.vdot);
  assert.ok(resumed.vdot > stopped.vdot && resumed.vdot <= ref.vdot, stopped.vdot + ' < ' + resumed.vdot + ' ≤ ' + ref.vdot);
  assert.ok(resumed.why.some((w) => /reprise après/.test(w.t)));
});

test('endurance : allure à FC égale en progrès → léger bonus (0,5 au plus)', () => {
  const old = Array.from({ length: 5 }, (_, i) => ({ date: add(-80 + i * 7), pace: 360, hr: 145 }));
  const now = Array.from({ length: 5 }, (_, i) => ({ date: add(-20 + i * 4), pace: 335, hr: 145 }));
  const mid = Array.from({ length: 6 }, (_, i) => ({ date: add(-40 + i * 3), pace: 350, hr: 145 }));
  const f = fit(st(20, old.concat(mid, now)));
  const ref = fit(st(20, Array.from({ length: 16 }, (_, i) => ({ date: add(-80 + i * 5), pace: 350, hr: 145 }))));
  assert.ok(f.why.some((w) => /endurance .* en progrès/.test(w.t)));
  assert.ok(f.vdot - ref.vdot > 0.2 && f.vdot - ref.vdot <= 0.5, ref.vdot + ' → ' + f.vdot);
});

test('niveau à une date passée : une course courue après cette date ne compte pas', () => {
  const s = st(10, easy(-60, 18));
  const past = fit(s, add(-20));
  assert.ok(!past.sources.some((x) => x.kind === 'course'), 'record du ' + add(-10) + ' ignoré au ' + add(-20));
});

test('Statistiques : niveau du moment, +x cette semaine grâce à la séance de qualité, courbe sur 6 mois', () => {
  const T = (d, b) => ({ type: 'tempo', date: add(d), d: "Tempo 3×8 min|3 km EF · 3 × 8 min à 4'25 — 4'30 /km", perf: { blocsAllure: b } });
  const s = st(20, easy(-60, 20).concat([T(-30, ['4:20', '4:21']), T(-16, ['4:19', '4:20']), T(-2, ['4:05', '4:06'])]));
  const app = loadApp({ now: NOW, state: s });
  const L = JSON.parse(JSON.stringify(app.bsLevelNow(TODAY)));
  assert.ok(L.hist.length >= 3 && L.hist.length <= 27 && L.hist[L.hist.length - 1].date === TODAY, 'une valeur par semaine connue sur 6 mois');
  assert.ok(L.delta > 0, 'niveau en hausse cette semaine : ' + L.delta);
  assert.match(L.cause, /Grâce à ton Tempo 3×8 min de /);
  assert.ok(L.why.some((w) => w.k === 'qual' && w.d > 0));
});

test('repos après un marathon (≤ 26 j) : pas de baisse ; même pause sans course : baisse', () => {
  const runs = easy(-90, 20, 3).concat(easy(-10, 3, 3));            // dernière sortie avant la pause : J-33, reprise J-10
  const withRace = st(200, runs); withRace.record_marathon = '3:37:05'; withRace._records.Marathon = { date: add(-33) };
  const a = fit(withRace), b = fit(st(200, runs));
  assert.ok(!a.why.some((w) => w.k === 'gap'), 'repos après le marathon');
  assert.ok(b.why.some((w) => w.k === 'gap'), 'même pause sans course : coupure');
});

test('séances de qualité faites le lendemain d\'une soirée arrosée : ni repère de niveau ni « séance manquée »', () => {
  const T = (d) => ({ type: 'tempo', date: add(d), d: "Tempo 3×8 min|3 km EF · 3 × 8 min à 4'35 — 4'40 /km", perf: { blocsAllure: ['4:55', '4:56', '4:57'] } });
  const base = fit(st(20, easy(-40, 14)));
  const s = st(20, easy(-40, 14).concat([T(-30), T(-18), T(-6)]));
  s._alcohol = {}; [-30, -18, -6].forEach((d) => { s._alcohol[add(d)] = { l: 7, t: ['wine'] }; });
  const f = fit(s);
  assert.equal(f.vdot, base.vdot, 'pas de baisse : allures du lendemain d\'alcool écartées');
  assert.ok(!f.why.some((w) => w.k === 'miss'));
});
