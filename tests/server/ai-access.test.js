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
