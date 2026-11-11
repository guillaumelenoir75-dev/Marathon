// « Santé de l'app » (compte admin) : relevés _health/<clé> (healthMark, helpers.js) + état de l'admin → moteur healthStatus
// (public-static/src/health.js). appHealth = écran Compte › Santé de l'app ; healthWatch (9h35 et 19h35) = notification quand
// un branchement ou une tâche tombe en panne, envoyée quand la liste des pannes change (ou au plus tous les 3 jours).
'use strict';
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();
const helpers = require('./helpers');
const { ADMIN_STATE, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, parisToday } = helpers;
const { loadEngine } = require('./engine');

let _E = null;
const engine = () => (_E || (_E = loadEngine({})));

async function healthItems(db, nowMs) {
  const [st, H] = await Promise.all([db.ref(ADMIN_STATE).once('value'), db.ref('_health').once('value')]);
  return JSON.parse(JSON.stringify(engine().healthStatus(st.val() || {}, H.val() || {}, nowMs || Date.now())));
}

// notification si la liste des pannes a changé depuis la dernière alerte (ou si elle date de plus de 3 jours)
async function runHealthWatch(db, nowMs, send) {
  const items = await healthItems(db, nowMs);
  const A = engine().healthAlertText(items);
  const last = (await db.ref('_health/_alert').once('value')).val() || {};
  const today = parisToday();
  if (!A) { if (last.keys) await db.ref('_health/_alert').set({ keys: '', date: today }); return { sent: false, bad: 0 }; }
  const old = last.date ? (Date.parse(today) - Date.parse(last.date)) / 86400000 : 99;
  if (last.keys === A.keys && old < 3) return { sent: false, bad: A.keys.split(',').length, same: true };
  await send(A.title, A.body);
  await db.ref('_health/_alert').set({ keys: A.keys, date: today });
  return { sent: true, bad: A.keys.split(',').length, keys: A.keys };
}

exports.appHealth = onRequest({ cors: true, memory: '512MiB', timeoutSeconds: 30 }, async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  try { await helpers.verifyAdmin(req); } catch (e) { res.status(403).json({ success: false, error: 'Réservé au compte admin' }); return; }
  try { res.json({ success: true, items: await healthItems(admin.database(), Date.now()) }); }
  catch (e) { console.error('appHealth:', e.message); res.status(500).json({ success: false, error: e.message }); }
});

exports.healthWatch = onSchedule(
  { schedule: '35 9,19 * * *', timeZone: 'Europe/Paris', timeoutSeconds: 60, memory: '512MiB', secrets: [VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY] },
  async () => {
    try {
      const r = await runHealthWatch(admin.database(), Date.now(), (title, body) =>
        helpers.sendPush(VAPID_PUBLIC_KEY.value(), VAPID_PRIVATE_KEY.value(), title, body, 'app-health', '/?action=health'));
      console.log('[santé] ', JSON.stringify(r));
    } catch (e) { console.error('healthWatch:', e.message); }
  }
);
exports.runHealthWatch = runHealthWatch;
exports.healthItems = healthItems;
