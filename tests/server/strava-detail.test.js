// Détail Strava d'une sortie : allure ajustée à la pente et dénivelé de chaque km gardés (allure sur plat, prEqPace)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFunctions } = require('../helpers/functions');

test('splits : allure ajustée à la pente (s/km) et dénivelé du km', () => {
  const F = loadFunctions({ modules: ['strava.js'] });
  const r = F.strava.stravaDetailMap({ splits_metric: [
    { distance: 1000, moving_time: 340, average_heartrate: 141, average_grade_adjusted_speed: 3.125, elevation_difference: 18.4 },
    { distance: 1000, moving_time: 320, average_heartrate: 143, elevation_difference: -17.6 }] });
  assert.deepEqual(r.splits.map((s) => [s.allure, s.gap, s.dz]), [['5:40', 320, 18], ['5:20', null, -18]]);
});
