// Prédiction unique du temps de course : même niveau que Statistiques, même « prévu » au jour J que « MAJ le plan »
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, synthPlan } = require('../helpers/frontend');

const NOW = '2026-11-09T09:00:00+01:00';
function st() {
  const s = synthPlan({ start: '2026-10-26', km: [24, 28, 30, 32, 26, 20] });
  s.record_10km = '44:00'; s._records = { '10 km': { date: '2026-09-20' } };
  return s;
}

test('course objectif datée : temps prévu = le « prévu » de MAJ le plan (trajectoire), aujourd\'hui = temps équivalent au niveau', () => {
  const s = st();
  const app = loadApp({ now: NOW, state: s, race: { name: '10 km test', course: '10 km', date: '2026-12-06', km: 10, objectif: '42:00' } });
  const P = JSON.parse(JSON.stringify(app.predRace('10 km', '2026-11-09')));
  const a = app.prAnalyze();
  assert.ok(P && P.race, 'projection au jour J');
  assert.equal(P.sec, Math.round(a.trajectory.race.mid), 'même temps que MAJ le plan');
  assert.equal(Math.round(P.vdot * 100), Math.round(a.fit.vdot * 100), 'même niveau');
  assert.equal(P.now, Math.round(app.raceTimeFromVdot(a.fit.vdot, 10000)), 'aujourd\'hui : temps équivalent au niveau (Statistiques)');
  assert.ok(P.lo < P.sec && P.sec < P.hi, 'fourchette');
  // autre distance que l'objectif : temps équivalent au niveau du jour
  const M = JSON.parse(JSON.stringify(app.predRace('Marathon', '2026-11-09')));
  assert.equal(M.race, null); assert.equal(M.sec, Math.round(app.raceTimeFromVdot(a.fit.vdot, 42195)));
  assert.equal(app.predRaceCat({ course: 'Semi-marathon' }), 'Semi-marathon'); assert.equal(app.predRaceCat({ km: 21.1 }), 'Semi-marathon');
});

test('sans niveau (aucune course, record ni séance de qualité) : pas de prédiction, l\'ancien modèle prend le relais', () => {
  const app = loadApp({ now: NOW, state: { plan_start_date: '2026-10-26', _plan_engine: 'generated' } });
  assert.equal(app.predRace('10 km', '2026-11-09'), null);
});
