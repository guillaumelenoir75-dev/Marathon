// Syntaxe de tous les scripts de l'app (y compris ceux que les autres tests ne chargent pas) : une erreur bloque le build
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', '..', 'public-static', 'src');
test('tous les scripts de public-static/src se compilent', () => {
  const bad = [];
  fs.readdirSync(SRC).filter((f) => f.endsWith('.js')).forEach((f) => {
    try { new vm.Script(fs.readFileSync(path.join(SRC, f), 'utf8'), { filename: f }); } catch (e) { bad.push(f + ' : ' + e.message); }
  });
  assert.deepEqual(bad, []);
});
