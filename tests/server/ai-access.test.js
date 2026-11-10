// Coach IA et consommation de tokens : réservés au compte admin. Un athlète est refusé AVANT tout appel à l'IA,
// et les tâches planifiées (brief du matin) ne génèrent rien pour lui.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFunctions, callHttp } = require('../helpers/functions');

const AI_ENDPOINTS = ['analyzeSession', 'coachChat', 'quickBrief', 'morningBrief', 'addMemo', 'extractMemos', 'adminTestNotif', 'adminTriggerBrief', 'planReview', 'planChat', 'sessionJournal'];

test('athlète : toutes les fonctions du Coach IA refusent (403) sans aucun appel à l\'IA', async () => {
  const F = loadFunctions({ athlete: true, data: {} });
  for (const name of AI_ENDPOINTS) {
    assert.equal(typeof F.coach[name], 'function', name + ' existe');
    const r = await callHttp(F.coach[name], { message: 'bonjour', text: 'facile', session: { title: 'EF', type: 'ef', km: 8 }, sessionData: {}, type: 'notif_brief_matin' });
    assert.equal(r.status, 403, name + ' refusée à un athlète');
  }
  assert.equal(F.calls.ai.length, 0, 'aucun token consommé');
  // l'admin, lui, passe (contrôle du test)
  const A = loadFunctions({ ai: '{"rpe": 5, "pain_level": 0, "pain_zone": null, "note": "ok"}' });
  assert.equal((await callHttp(A.coach.sessionJournal, { text: 'facile' })).status, 200);
  assert.equal(A.calls.ai.length, 1);
});

test('brief du matin : déclenché seulement pour le compte admin (un réveil d\'athlète ne génère rien)', async () => {
  const { helpers } = loadFunctions({ modules: [] });
  const today = new Date().toISOString().slice(0, 10);
  const data = { users: { ATHLETE: { state: { _brief_trigger: { ts: Date.now(), date: today }, notif_brief_matin: true } } } };
  const F = loadFunctions({ data, modules: ['notifs.js'] });
  await F.notifs.briefAfterFcRepos();
  assert.equal(F.calls.ai.length, 0, 'pas d\'IA pour un athlète');
  assert.equal(F.calls.push.length, 0, 'pas de brief envoyé');
  assert.ok(F.db.data.users.ATHLETE.state._brief_trigger, 'son déclencheur n\'est même pas lu');
  assert.ok(helpers.ADMIN_UID && helpers.ADMIN_UID !== 'ATHLETE');
});

test('brief du matin : plus envoyé l\'après-midi à Paris (12h en semaine, 13h le week-end)', () => {
  const { helpers } = loadFunctions({ modules: [] });
  const T = (iso) => helpers.briefTooLateParis(new Date(iso));
  assert.equal(T('2026-11-10T10:59:00Z'), false, 'mardi 11h59 Paris');
  assert.equal(T('2026-11-10T11:00:00Z'), true, 'mardi 12h00 Paris');
  assert.equal(T('2026-11-14T11:30:00Z'), false, 'samedi 12h30 Paris');
  assert.equal(T('2026-11-14T12:00:00Z'), true, 'samedi 13h00 Paris');
  assert.equal(T('2026-07-12T10:30:00Z'), false, 'dimanche d\'été 12h30 Paris (UTC+2)');
  assert.equal(T('2026-07-13T10:00:00Z'), true, 'lundi d\'été 12h00 Paris');
});
