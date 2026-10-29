// Générateur de plan (« Nouvelle prépa ») : la recette personnelle du coureur règle l'affûtage et la progression
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function gen(ob) {
  const ctx = vm.createContext({ console, Date, Math, JSON, Object, Array, Set, Map, parseInt, parseFloat, isFinite, String, Number });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../public-static/src/plan-generate.js'), 'utf8') + '\n;globalThis.__g = generateAthletePlan;', ctx);
  const plan = ctx.__g(Object.assign({ course: 'Semi-marathon', niveau: 'Confirmé', sessions: '4', km_semaine: '35', date: new Date(Date.now() + 14 * 7 * 86400000).toISOString().slice(0, 10) }, ob));
  const km = {};
  Object.keys(plan).filter((k) => /^extra_w\d+_s\d+$/.test(k)).forEach((k) => { const w = +k.match(/_w(\d+)_/)[1], x = JSON.parse(plan[k]); km[w] = (km[w] || 0) + (+x.km || 0); });
  return Object.keys(km).map(Number).sort((a, b) => a - b).map((w) => km[w]);
}

test('recette : affûtage personnel (borné à ±15 %) et progression plafonnée', () => {
  const std = gen({}), mine = gen({ recette: { progression: 1.03, taper: { long: { w0: 0.1, w1: 0.9, w2: 1 } } } });
  assert.equal(std.length, mine.length);
  const n = std.length;
  const share = (v) => v[n - 2] / Math.max(...v);
  assert.ok(share(mine) > share(std) + 0.05, 'avant-dernière semaine plus chargée (affûtage perso plus court) : ' + share(mine) + ' / ' + share(std));
  assert.ok(share(mine) < 0.95, 'écart borné à +15 % du standard');
  assert.ok(Math.max(...mine) < Math.max(...std), 'progression plus douce');
  assert.deepEqual(gen({ recette: null }), std, 'sans recette : plan standard inchangé');
});
