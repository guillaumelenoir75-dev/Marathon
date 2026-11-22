// Saisie d'un temps au pavé numérique : les « : » arrivent pendant la frappe, jamais 4 chiffres collés
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function fnFrom(file, name){
  const src = fs.readFileSync(path.join(__dirname, '../../public-static/src', file), 'utf8');
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' introuvable');
  let d = 0, j = src.indexOf('{', i);
  for(; j < src.length; j++){ if(src[j] === '{') d++; else if(src[j] === '}' && --d === 0) break; }
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(src.slice(i, j + 1) + ';this.f=' + name + ';', ctx);
  return ctx.f;
}

test('fmtClockDigits : minutes puis « : » puis secondes, au fil de la frappe', () => {
  const f = fnFrom('config.js', 'fmtClockDigits');
  // frappe chiffre par chiffre de 4255 → 42:55
  assert.deepEqual(['4', '42', '425', '4255'].map((v) => f(v, 6)), ['4', '42', '4:25', '42:55']);
  // le « : » déjà posé ne gêne pas la suite de la frappe
  assert.equal(f('4:255', 6), '42:55');
  assert.equal(f('42:55', 6), '42:55');
  assert.equal(f('10530', 6), '1:05:30');
  assert.equal(f('13512', 6), '1:35:12');
  assert.equal(f('4:25:5', 6), '42:55');
  // effacement : on revient proprement
  assert.equal(f('42:5', 6), '4:25');
  assert.equal(f('', 6), '');
  // allure (4 chiffres au plus) : 540 → 5:40
  assert.equal(f('540', 4), '5:40');
  assert.equal(f('54012', 4), '54:01');
});

test('race-live : saisie « 4255 » lue 42:55 (et le temps formaté se relit pareil)', () => {
  const parse = fnFrom('race-live.js', '_liveParseTime');
  assert.equal(parse('4255'), 2575 * 1000);
  assert.equal(parse('42:55'), 2575 * 1000);
  assert.equal(parse('1:35:12'), 5712 * 1000);
});
