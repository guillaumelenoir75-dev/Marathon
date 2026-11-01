// Coach proactif : résumé chiffré du dimanche (une ligne, ouvre l'image de la semaine), séance clé manquée signalée une fois
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFunctions } = require('../helpers/functions');
const { synthPlan } = require('../helpers/frontend');

const UID = 'WkEWrmnYWuUNkGLrwXf9HhaJWfh1';
function plan(extra) {
  const st = synthPlan({ start: '2026-10-26' });
  const done = (k, km) => { st[k + '_done'] = true; st[k + '_km'] = km; st[k + '_perf'] = JSON.stringify({ date: JSON.parse(st[k]).sched_date }); };
  done('extra_w1_s0', 9); done('extra_w1_s1', 10); done('extra_w1_s2', 11);
  st.whoop_data = { recoveries: ['2026-11-01', '2026-10-31', '2026-10-30', '2026-10-29'].map((d, i) => ({ date: d, score: [70, 60, 50, 80][i] })) };
  return Object.assign(st, extra || {});
}

test('dimanche : résumé de la semaine faite et de la suivante, en une ligne', () => {
  const F = loadFunctions({ modules: ['proactive.js'] });
  const r = F.proactive.weekDigest(plan(), '2026-11-01');
  assert.equal(r.title, '📊 Semaine 1 bouclée');
  assert.match(r.body, /^30\/30 km · récup 65 % → S2 : 34 km · clé : Tempo 3×8 min \(mer\.\) · 📸 à partager$/);
  assert.ok(r.body.length < 110, 'tient dans une notification');
  // semaine incomplète
  const st = plan(); delete st.extra_w1_s2_done; delete st.extra_w1_s2_km;
  const r2 = F.proactive.weekDigest(st, '2026-11-01');
  assert.equal(r2.title, '📊 Semaine 1 : 2/3 séances'); assert.match(r2.body, /^19\/30 km · 2\/3/);
  assert.equal(F.proactive.weekDigest({}, '2026-11-01'), null, 'plan Seine-Eure écrit en dur : rien');
});

test('séance clé manquée la veille : une notification « réorganiser », une seule fois ; footing manqué : rien', async () => {
  const st = plan();
  const data = { users: { [UID]: { state: st } } };
  const F = loadFunctions({ data, modules: ['proactive.js'] });
  const pushes = [], push = async (t, b, tag, url) => pushes.push({ t, b, tag, url });
  // mercredi 4 nov. : le tempo (s1) n'est pas fait → le jeudi soir
  const L = F.proactive.missedKeySessions(st, '2026-11-05');
  assert.deepEqual(L.map((x) => x.key), ['extra_w2_s1']);
  await F.proactive.runMissedNudge(F.db, UID, '2026-11-05', push);
  assert.equal(pushes.length, 1); assert.match(pushes[0].t, /Séance clé manquée : Tempo/); assert.equal(pushes[0].url, '/?action=imprevu');
  await F.proactive.runMissedNudge(F.db, UID, '2026-11-05', push);
  assert.equal(pushes.length, 1, 'pas deux fois');
  // le footing EF du lundi manqué : pas une séance clé
  assert.deepEqual(F.proactive.missedKeySessions(st, '2026-11-03'), []);
});
