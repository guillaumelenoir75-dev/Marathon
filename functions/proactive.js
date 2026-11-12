// Coach proactif (compte admin), sans notification de plus que nécessaire :
//  • weekDigest : résumé chiffré du dimanche (semaine faite → semaine suivante) — remplace le texte de la notification du
//    bilan de 17h (weeklyBilanNotif, notifs.js) et ouvre « Ta semaine en image » (/?action=week) ;
//  • missedKeySessionNudge (20h45) : une séance clé (fractionné, tempo, sortie longue, course) de la veille ni faite ni
//    retirée → « réorganiser dans la semaine ? » (/?action=imprevu), une seule fois par séance (state._missed_push).
'use strict';
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();
const helpers = require('./helpers');
const { loadEngine } = require('./engine');

const VAPID_PUBLIC_KEY = defineSecret('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = defineSecret('VAPID_PRIVATE_KEY');
const km = (v) => String(Math.round((+v || 0) * 10) / 10).replace('.', ',');
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const DAY = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

// résumé du dimanche : { title, body, digest } ou null (pas de plan généré / pas de semaine)
function weekDigest(state, today) {
  if (!state || !state._plan_engine) return null;
  const E = loadEngine({ state, now: today + 'T18:00:00Z' });
  const P = E.wsPickWeeks(today); if (P.done == null) return null;
  const D = E.weekShareData(P.done, today), N = P.plan != null ? E.weekShareData(P.plan, today, 'plan') : null;
  if (!D) return null;
  const rec = ((state.whoop_data && state.whoop_data.recoveries) || []).filter((r) => r && r.date && r.date <= today && r.date > addDays(today, -7) && r.score != null).map((r) => r.score);
  const recAvg = rec.length >= 3 ? Math.round(rec.reduce((a, b) => a + b, 0) / rec.length) : null;
  const full = D.nPlan && D.nDone >= D.nPlan;
  const title = full ? `📊 Semaine ${D.w} bouclée` : `📊 Semaine ${D.w} : ${D.nDone}/${D.nPlan} séances`;
  let body = `${km(D.kmDone)}/${km(D.kmPlan)} km` + (full ? '' : ` · ${D.nDone}/${D.nPlan}`) + (recAvg != null ? ` · récup ${recAvg} %` : '');
  if (N) {
    const key = N.star ? N.sessions.find((s) => s.star) : null;
    body += ` → S${N.w} : ${km(N.kmPlan)} km` + (key ? ` · clé : ${key.title}${key.date ? ' (' + DAY[new Date(key.date + 'T12:00:00Z').getUTCDay()] + ')' : ''}` : '');
  }
  body += ' · 📸 à partager';
  return { title, body, digest: { date: today, w: D.w, kmDone: D.kmDone, kmPlan: D.kmPlan, nDone: D.nDone, nPlan: D.nPlan, rec: recAvg, next: N ? { w: N.w, km: N.kmPlan } : null } };
}
exports.weekDigest = weekDigest;

// séances clés de la veille ni faites ni retirées, pas encore signalées
function missedKeySessions(state, today) {
  if (!state || !state._plan_engine) return [];
  const E = loadEngine({ state, now: today + 'T19:00:00Z' }), y = addDays(today, -1), sent = state._missed_push || {};
  return Array.from(E.prSessions(state)).filter((s) => s.date === y && !s.done && !s.skip && ['tempo', 'frac', 'long', 'race'].includes(s.type) && !sent[s.key])
    .map((s) => ({ key: s.key, title: s.title, type: s.type, date: s.date }));
}
exports.missedKeySessions = missedKeySessions;

async function runMissedNudge(db, uid, today, push) {
  const base = `users/${uid}/state`;
  const state = (await db.ref(base).once('value')).val() || {};
  if (!(await helpers.getUserPref(db, base, 'notif_missed', true))) return { skip: 'désactivée' };
  const L = missedKeySessions(state, today); if (!L.length) return { n: 0 };
  const s = L[0];
  await push(`⏭️ Séance clé manquée : ${s.title}`, 'Je peux la caser plus tard dans la semaine sans casser le plan · Réorganiser ›', 'missed-key', '/?action=imprevu');
  const up = {}; L.forEach((x) => { up[`_missed_push/${x.key}`] = today; });
  await db.ref(base).update(up);
  return { n: L.length, key: s.key };
}
exports.runMissedNudge = runMissedNudge;

exports.missedKeySessionNudge = onSchedule(
  { schedule: '45 11 * * *',   // le lendemain avant midi (plus collée au rappel de 20h30 et au coucher de 21h)
    timeZone: 'Europe/Paris', timeoutSeconds: 60, memory: '512MiB', secrets: [VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY] },
  async () => {
    try {
      const r = await runMissedNudge(admin.database(), helpers.ADMIN_UID, helpers.parisToday(),
        (t, b, tag, url) => helpers.sendPush(VAPID_PUBLIC_KEY.value(), VAPID_PRIVATE_KEY.value(), t, b, tag, url));
      console.log('[séance clé manquée] ', JSON.stringify(r));
    } catch (e) { console.error('missedKeySessionNudge:', e.message); }
  }
);
