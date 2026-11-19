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

// Une fonction globale n'est définie qu'une fois : la 2e définition écrase la 1re sans prévenir (seules exceptions : les
// points d'entrée des écrans à la demande, définis dans config.js puis remplacés par la vraie fonction du module chargé)
test('aucune fonction globale définie deux fois (bundle et modules à la demande)', () => {
  const cfg = fs.readFileSync(path.join(__dirname, '..', '..', 'vite.config.js'), 'utf8');
  const list = (s) => [...s.matchAll(/'([\w-]+\.js)'/g)].map((m) => m[1]);
  const bundle = list(cfg.match(/const scriptFiles = \[([\s\S]*?)\];/)[1]);
  const lazy = list(cfg.match(/const lazyGroups = \{([\s\S]*?)\};/)[1]);
  const seen = {}, bad = [];
  bundle.concat(lazy).forEach((f) => {
    const t = fs.readFileSync(path.join(SRC, f), 'utf8');
    for (const m of t.matchAll(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/gm)) {
      const n = m[1], prev = seen[n];
      if (prev && !(prev === 'config.js' && lazy.includes(f))) bad.push(n + ' : ' + prev + ' + ' + f);
      if (!prev) seen[n] = f;
    }
  });
  assert.deepEqual(bad, []);
});
