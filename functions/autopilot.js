// Pilote automatique de nuit : charge l'état de l'admin, son historique (copies des prépas, courses Strava) et exécute le
// moteur de l'app (functions/engine.js) pour appliquer les ajustements des 7 prochains jours (apRun d'autopilot.js).
// Écrit seulement les séances modifiées, l'historique _plan_reviews, le résumé _autopilot_last (lu par le brief du matin et
// l'app) et _server_rev (l'app recharge son état au retour, avant toute écriture).
'use strict';
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();
const { ADMIN_UID, parisToday } = require('./helpers');
const { loadEngine } = require('./engine');

async function runAutopilot(db, uid, today) {
  const base = `users/${uid}`;
  const state = (await db.ref(base + '/state').once('value')).val() || {};
  if (!state._plan_engine) return { skip: 'plan Seine-Eure écrit en dur' };
  if ((state._autopilot || 'auto') === 'off') return { skip: 'désactivé' };
  const idx = (await db.ref(base + '/prep_index').once('value')).val() || {};
  const snaps = {};
  for (const id of Object.keys(idx)) {
    if (id === state._prep_id) continue;
    const s = (await db.ref(base + '/preps/' + id).once('value')).val();
    if (s) snaps[id] = (!s._plan_engine && !s.plan_start_date) ? Object.assign({}, s, { plan_start_date: '2026-03-09' }) : s;
  }
  const strava = (await db.ref(base + '/strava_history').once('value')).val() || null;
  const before = JSON.parse(JSON.stringify(state));
  const E = loadEngine({ state, now: today + 'T03:00:00Z', prepIndex: idx, snaps, strava, admin: uid === ADMIN_UID });
  const r = E.apRun(today);
  if (!r) return { skip: 'rien à faire' };
  const up = {};
  Object.keys(state).forEach((k) => { if (JSON.stringify(state[k]) !== JSON.stringify(before[k])) up[k] = state[k]; });
  up._autopilot_last = JSON.parse(JSON.stringify(r));
  up._server_rev = Date.now();
  await db.ref(base + '/state').update(up);
  return { applied: r.applied, n: r.changes.length, mode: r.mode, keys: Object.keys(up).length };
}
exports.runAutopilot = runAutopilot;

exports.autopilotNightly = onSchedule(
  { schedule: '15 4 * * *', timeZone: 'Europe/Paris', timeoutSeconds: 120, memory: '512MiB' },
  async () => {
    try { const r = await runAutopilot(admin.database(), ADMIN_UID, parisToday()); console.log('[pilote] ', JSON.stringify(r)); }
    catch (e) { console.error('autopilotNightly:', e.message); }
  }
);
