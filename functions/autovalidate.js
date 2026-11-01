// Validation automatique des séances (compte admin) : toutes les 15 min de 6h à 23h45 (Paris), les courses Strava des
// 36 dernières heures sont examinées. Une séance n'est validée QUE si Strava + l'entraînement WHOOP de cette même sortie
// (horaires qui se chevauchent) + la météo du lieu et de l'heure de la sortie concordent (moteur : auto-validate.js,
// avDecide). Sinon rien n'est écrit ; au bout de 4 h sans les 3 sources (ou si deux séances sont possibles) : notification
// « à valider toi-même ». Journal par sortie : state._autoval_log/<id> {st: ok | pending | manual | skip, …}.
'use strict';
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();
const { ADMIN_UID, fetchWithTimeout, sendPush, parisToday } = require('./helpers');
const { loadEngine } = require('./engine');
const strava = require('./strava');
const whoop = require('./whoop');

const VAPID_PUBLIC_KEY = defineSecret('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = defineSecret('VAPID_PRIVATE_KEY');
const AV_GIVEUP_MS = 4 * 3600 * 1000;

// accès réseau réels (remplacés par des doublures dans les tests)
function realDeps(db, secrets) {
  return {
    async runs(uid, afterSec) {
      const tok = await strava.getValidAccessToken(db, uid, secrets.stravaId, secrets.stravaSecret);
      if (!tok) return null;
      const r = await fetchWithTimeout(`https://www.strava.com/api/v3/athlete/activities?per_page=30&after=${afterSec}`, { headers: { Authorization: `Bearer ${tok}` } }, 20000);
      if (!r.ok) return null;
      const l = await r.json(); return Array.isArray(l) ? l : null;
    },
    async detail(uid, id) {
      const tok = await strava.getValidAccessToken(db, uid, secrets.stravaId, secrets.stravaSecret);
      if (!tok) return null;
      const r = await fetchWithTimeout(`https://www.strava.com/api/v3/activities/${id}`, { headers: { Authorization: `Bearer ${tok}` } }, 20000);
      return r.ok ? strava.stravaDetailMap(await r.json()) : null;
    },
    async workouts(startIso, endIso) { return whoop.whoopWorkoutsBetween(db, startIso, endIso); },
    async hourly(act, nowMs) {
      const recent = nowMs - act.startMs < 3 * 86400000;
      const q = `latitude=${act.lat}&longitude=${act.lng}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`;
      const url = recent ? `https://api.open-meteo.com/v1/forecast?${q}&past_days=3&forecast_days=1` : `https://archive-api.open-meteo.com/v1/archive?${q}&start_date=${act.date}&end_date=${act.date}`;
      const r = await fetchWithTimeout(url, {}, 15000);
      if (!r.ok) return null;
      const j = await r.json(); return j && j.hourly ? j.hourly : null;
    },
    async push(title, body, tag, url) { return sendPush(VAPID_PUBLIC_KEY.value(), VAPID_PRIVATE_KEY.value(), title, body, tag, url); },
  };
}

async function runAutoValidate(db, uid, nowMs, deps) {
  const base = `users/${uid}/state`;
  const state = (await db.ref(base).once('value')).val() || {};
  if (!state._plan_engine) return { skip: 'plan Seine-Eure écrit en dur' };
  if ((state._autoval || 'on') === 'off') return { skip: 'désactivée' };
  const list = await deps.runs(uid, Math.floor(nowMs / 1000) - 36 * 3600);
  if (!list) return { skip: 'Strava indisponible' };
  const log = state._autoval_log || {}, today = parisToday();
  const E = loadEngine({ state, now: new Date(nowMs).toISOString(), admin: uid === ADMIN_UID });
  const acts = list.map(E.avActFromStrava).filter(Boolean).filter((a) => ['Run', 'TrailRun', 'VirtualRun'].includes(a.sp)).sort((a, b) => a.startMs - b.startMs);
  const out = [];
  for (const act of acts) {
    const prev = log[act.id];
    if (prev && (prev.st === 'ok' || prev.st === 'manual' || prev.st === 'skip')) continue;
    // 1er tri sans réseau : trop récente, déjà rattachée, aucune séance correspondante
    let D = E.avDecide(state, act, { nowMs, today, detail: {}, workouts: [], meteo: null });
    if (D.wait) continue;
    const entry = { at: new Date(nowMs).toISOString(), date: act.date, km: act.km, tries: ((prev && prev.tries) || 0) + 1 };
    if (D.skip) {
      const ambiguous = /deux séances/.test(D.reason || '');
      Object.assign(entry, { st: ambiguous ? 'manual' : 'skip', reason: D.reason });
      await db.ref(`${base}/_autoval_log/${act.id}`).set(entry);
      if (ambiguous) await deps.push('🟠 Sortie à valider', `${String(act.km).replace('.', ',')} km le ${act.date.slice(8)}/${act.date.slice(5, 7)} : ${D.reason}`, 'autoval-manual', '/?action=validate');
      out.push({ id: act.id, st: entry.st, reason: D.reason }); continue;
    }
    // les 3 sources, toutes obligatoires
    const pad = 2 * 3600 * 1000;
    const [detail, workouts, hourly] = await Promise.all([
      deps.detail(uid, act.id).catch(() => null),
      deps.workouts(new Date(act.startMs - pad).toISOString(), new Date(act.endMs + pad).toISOString()).catch(() => null),
      act.lat != null && act.lng != null ? deps.hourly(act, nowMs).catch(() => null) : Promise.resolve(null),
    ]);
    const meteo = hourly ? E.avMeteoFromHourly(hourly, act) : null;
    D = E.avDecide(state, act, { nowMs, today, detail, workouts: workouts || [], meteo });
    if (!D.ok) {
      const late = nowMs - act.endMs >= AV_GIVEUP_MS;
      Object.assign(entry, { st: late ? 'manual' : 'pending', reason: D.reason, missing: [...(D.missing || [])], title: D.s ? D.s.title : null });
      await db.ref(`${base}/_autoval_log/${act.id}`).set(entry);
      if (late) {
        const why = (D.missing || []).map((m) => ({ strava: 'détail Strava', whoop: 'entraînement WHOOP', meteo: 'météo', gps: 'position GPS' }[m] || m)).join(', ');
        await deps.push('🟠 Séance à valider toi-même', `${D.s ? D.s.title + ' · ' : ''}${String(act.km).replace('.', ',')} km : ${why} introuvable`, 'autoval-manual', '/?action=validate');
      }
      out.push({ id: act.id, st: entry.st, missing: D.missing }); continue;
    }
    // validation : seulement les clés de la séance + journal + révision serveur (l'app recharge avant d'écrire)
    const up = E.avUpdates(state, D);
    Object.assign(entry, { st: 'ok', title: D.s.title, key: D.key });
    up[`_autoval_log/${act.id}`] = entry;
    up[`_last_validation_w${D.w}`] = nowMs;
    up._server_rev = nowMs;
    await db.ref(base).update(up);
    Object.keys(up).forEach((k) => { if (!k.includes('/')) state[k] = up[k]; });
    const S = D.summary;
    await deps.push(`✅ ${S.title} validé`, `${String(S.km).replace('.', ',')} km · ${String(S.pace || '').replace(':', "'")}/km · ${Math.round(S.temp)}° · WHOOP ${String(Math.round(S.strain * 10) / 10).replace('.', ',')} — Ton ressenti ?`, 'autoval-ok', `/?action=feel&k=${D.key}`);
    out.push({ id: act.id, st: 'ok', key: D.key });
  }
  return { n: acts.length, out };
}
exports.runAutoValidate = runAutoValidate;

exports.autoValidateScan = onSchedule(
  { schedule: '*/15 6-23 * * *', timeZone: 'Europe/Paris', timeoutSeconds: 120, memory: '512MiB',
    secrets: [...strava.STRAVA_SECRETS, ...whoop.WHOOP_SECRETS, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY] },
  async () => {
    try {
      const db = admin.database();
      const [sid, ssec] = strava.STRAVA_SECRETS;
      const r = await runAutoValidate(db, ADMIN_UID, Date.now(), realDeps(db, { stravaId: sid.value(), stravaSecret: ssec.value() }));
      console.log('[validation auto] ', JSON.stringify(r));
    } catch (e) { console.error('autoValidateScan:', e.message); }
  }
);
