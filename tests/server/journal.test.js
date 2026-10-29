// sessionJournal (journal de séance relu par le Coach) et situation d'entraînement : zones FC recalées, signal de la foulée
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFunctions, callHttp } = require('../helpers/functions');

test('sessionJournal : réponse de l\'IA validée (effort, douleur, zone de la liste, note nettoyée)', async () => {
  let F = loadFunctions({ ai: 'Voici : {"rpe": 7, "pain_level": 1, "pain_zone": "Mollet gauche", "note": "Dur sur la fin |\\n mollet tendu"}' });
  let r = (await callHttp(F.coach.sessionJournal, { text: 'dur sur la fin, mollet un peu tendu', session: { title: 'Tempo', type: 'tempo', km: 10 } })).out;
  assert.equal(r.success, true); assert.equal(r.rpe, 7);
  assert.deepEqual(r.pain, { level: 1, zone: 'Autre' }, 'zone hors liste → Autre');
  assert.ok(!/[|\n]/.test(r.note));
  assert.match(F.calls.ai[0].user, /Compte rendu : « dur sur la fin/);
  F = loadFunctions({ ai: '{"rpe": 14, "pain_level": 0, "pain_zone": "Genou", "note": null}' });
  r = (await callHttp(F.coach.sessionJournal, { text: 'facile, rien à signaler' })).out;
  assert.equal(r.rpe, null, 'effort hors échelle refusé'); assert.deepEqual(r.pain, { level: 0, zone: null });
  F = loadFunctions({ ai: 'pas de JSON' });
  assert.equal((await callHttp(F.coach.sessionJournal, { text: 'facile' })).status, 502);
  assert.equal((await callHttp(F.coach.sessionJournal, { text: '' })).status, 400);
});

test('situation du Coach : zones FC recalées prioritaires et signal de la foulée récent', async () => {
  const F = loadFunctions({ data: {}, modules: [] });
  const st = { _plan_engine: 'generated', _hr_zones: { applied: true, at: '2026-10-20', efMax: 152, lthr: 171, fcMax: 190 },
    _body_signals: { at: '2026-10-28', level: 2, items: ['FC plus haute à allure égale.', 'Cadence en baisse.'] } };
  const t = (await F.helpers.buildTrainingSituation(F.db, st, '2026-10-29')).text;
  assert.match(t, /PRIORITAIRES.*jusqu'à 152 bpm, FC au seuil ~171 bpm, FC max 190 bpm/);
  assert.match(t, /Signal de la foulée.*Cadence en baisse\..*pas de hausse de charge/);
  st._body_signals.at = '2026-10-20'; st._hr_zones.applied = false;
  const t2 = (await F.helpers.buildTrainingSituation(F.db, st, '2026-10-29')).text;
  assert.ok(!/Signal de la foulée|PRIORITAIRES/.test(t2), 'signal trop ancien, zones non appliquées');
});
