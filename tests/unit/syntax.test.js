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

// Plafond d'endurance : toujours celui de l'athlète (hrEfMax côté app, hrZonesOf / efMaxOf côté serveur), jamais 148 / 140-148
// écrit en dur dans une consigne, un texte du Coach ou un calcul (seules exceptions : la valeur par défaut, « Comparer mes
// prépas » qui garde 148 pour la comparabilité, les données du plan Seine-Eure et les pages publiques autonomes)
test('aucun plafond EF « 148 » ou zone « 140-148 » écrit en dur', () => {
  const FN = path.join(__dirname, '..', '..', 'functions');
  const skip = /^(race-nav-data|secours-|amis-|suivi-|prep-progress|plan-state)/;
  const bad = [];
  const scan = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((l, i) => {
    if (/^\s*\/\//.test(l) || /function (efMaxOf|hrEfMax)|: 148;/.test(l)) return;              // commentaire, valeur par défaut
    if (/140-148|140 – 148|[≤<>] ?148\b|\b148 bpm|\b148 \+|vs 148\b/.test(l)) bad.push(f + ':' + (i + 1));
  });
  fs.readdirSync(SRC).filter((f) => f.endsWith('.js') && !skip.test(f)).forEach((f) => scan(SRC, f));
  fs.readdirSync(FN).filter((f) => f.endsWith('.js')).forEach((f) => scan(FN, f));
  assert.deepEqual(bad, []);
});
