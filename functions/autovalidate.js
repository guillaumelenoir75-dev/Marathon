// Validation automatique des séances (compte admin) : toutes les 15 min de 6h à 23h45 (Paris), les courses Strava des
// 36 dernières heures sont examinées. Une séance n'est validée QUE si Strava + l'entraînement WHOOP de cette même sortie
// (horaires qui se chevauchent) + la météo du lieu et de l'heure de la sortie concordent (moteur : auto-validate.js,
// avDecide). Sinon rien n'est écrit ; au bout de 4 h sans les 3 sources (ou si deux séances sont possibles) : notification
// « à valider toi-même ». Journal par sortie : state._autoval_log/<id> {st: ok | pending | manual | skip, …}.
'use strict';
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();
const helpers = require('./helpers');
const { ADMIN_UID, fetchWithTimeout, sendPush, parisToday } = helpers;
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

// opts.manual (bouton « 🏁 J'ai fini ») : pas d'attente de 15 min, sorties « à valider toi-même » retentées, aucune
// notification (l'app affiche le résultat), sorties déjà validées aujourd'hui signalées ({ st: 'done' })
async function runAutoValidate(db, uid, nowMs, deps, opts) {
  opts = opts || {};
  const base = `users/${uid}/state`;
  const state = (await db.ref(base).once('value')).val() || {};
  if (!state._plan_engine) return { skip: 'plan Seine-Eure écrit en dur' };
  if ((state._autoval || 'on') === 'off') return { skip: 'désactivée' };
  const list = await deps.runs(uid, Math.floor(nowMs / 1000) - 36 * 3600);
  if (!list) return { skip: 'Strava indisponible' };
  const log = state._autoval_log || {}, today = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date(nowMs));
  const E = loadEngine({ state, now: new Date(nowMs).toISOString(), admin: uid === ADMIN_UID });
  const acts = list.map(E.avActFromStrava).filter(Boolean).filter((a) => ['Run', 'TrailRun', 'VirtualRun'].includes(a.sp)).sort((a, b) => a.startMs - b.startMs);
  const out = [];
  for (const act of acts) {
    const prev = log[act.id];
    if (prev && prev.st === 'ok') { if (opts.manual && act.date === today) out.push({ id: act.id, st: 'done', key: prev.key, title: prev.title, km: act.km }); continue; }
    if (prev && (prev.st === 'skip' || (prev.st === 'manual' && !opts.manual))) continue;
    // 1er tri sans réseau : trop récente, déjà rattachée, aucune séance correspondante
    const settleMin = opts.manual ? 0 : undefined;
    let D = E.avDecide(state, act, { nowMs, today, detail: {}, workouts: [], meteo: null, settleMin });
    if (D.wait) continue;
    const entry = { at: new Date(nowMs).toISOString(), date: act.date, km: act.km, tries: ((prev && prev.tries) || 0) + 1 };
    if (D.skip) {
      const ambiguous = /deux séances/.test(D.reason || '');
      Object.assign(entry, { st: ambiguous ? 'manual' : 'skip', reason: D.reason });
      await db.ref(`${base}/_autoval_log/${act.id}`).set(entry);
      if (ambiguous && !opts.manual) await deps.push('🟠 Sortie à valider', `${String(act.km).replace('.', ',')} km le ${act.date.slice(8)}/${act.date.slice(5, 7)} : ${D.reason}`, 'autoval-manual', '/?action=validate');
      out.push({ id: act.id, st: entry.st, reason: D.reason, km: act.km, date: act.date }); continue;
    }
    // les 3 sources, toutes obligatoires
    const pad = 2 * 3600 * 1000;
    const [detail, workouts, hourly] = await Promise.all([
      deps.detail(uid, act.id).catch(() => null),
      deps.workouts(new Date(act.startMs - pad).toISOString(), new Date(act.endMs + pad).toISOString()).catch(() => null),
      act.lat != null && act.lng != null ? deps.hourly(act, nowMs).catch(() => null) : Promise.resolve(null),
    ]);
    const meteo = hourly ? E.avMeteoFromHourly(hourly, act) : null;
    D = E.avDecide(state, act, { nowMs, today, detail, workouts: workouts || [], meteo, settleMin });
    if (!D.ok) {
      const late = !opts.manual && nowMs - act.endMs >= AV_GIVEUP_MS;
      Object.assign(entry, { st: late ? 'manual' : 'pending', reason: D.reason, missing: [...(D.missing || [])], title: D.s ? D.s.title : null });
      await db.ref(`${base}/_autoval_log/${act.id}`).set(entry);
      if (late) {
        const why = (D.missing || []).map((m) => ({ strava: 'détail Strava', whoop: 'entraînement WHOOP', meteo: 'météo', gps: 'position GPS' }[m] || m)).join(', ');
        await deps.push('🟠 Séance à valider toi-même', `${D.s ? D.s.title + ' · ' : ''}${String(act.km).replace('.', ',')} km : ${why} introuvable`, 'autoval-manual', '/?action=validate');
      }
      out.push({ id: act.id, st: entry.st, missing: [...(D.missing || [])], title: entry.title, km: act.km, date: act.date, gps: act.lat != null }); continue;
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
    if (!opts.manual) await deps.push(`✅ ${S.title} validé`, `${String(S.km).replace('.', ',')} km · ${String(S.pace || '').replace(':', "'")}/km · ${Math.round(S.temp)}° · WHOOP ${String(Math.round(S.strain * 10) / 10).replace('.', ',')} — Ton ressenti ?`, 'autoval-ok', `/?action=feel&k=${D.key}`);
    out.push({ id: act.id, st: 'ok', key: D.key, title: S.title, km: S.km, pace: S.pace, temp: S.temp, strain: S.strain });
  }
  return { n: acts.length, out };
}
exports.runAutoValidate = runAutoValidate;

// fenêtre « Valider la séance », bouton « 🤖 Validation automatique » : les 3 sources de la sortie de CETTE séance, sans rien
// écrire (le formulaire est rempli, l'athlète ajoute son ressenti et valide). WHOOP : compte admin seulement.
async function runAutoFill(db, uid, nowMs, deps, body) {
  const state = (await db.ref(`users/${uid}/state`).once('value')).val() || {};
  const key = String(body.key || ''), date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : null;
  if (!/^extra_w\d+_s\d+$/.test(key) || state[key] === undefined) return { fill: { missing: ['strava'], reason: 'séance introuvable' } };
  const E = loadEngine({ state, now: new Date(nowMs).toISOString(), admin: uid === ADMIN_UID });
  const ref = Date.parse((date || new Date(nowMs).toISOString().slice(0, 10)) + 'T12:00:00Z');
  const list = await deps.runs(uid, Math.floor((ref - 2.5 * 86400000) / 1000));
  if (!list) return { fill: { missing: ['strava'], reason: 'Strava non connecté ou indisponible' } };
  const acts = list.map(E.avActFromStrava).filter(Boolean).filter((a) => a.endMs <= nowMs);
  let act = null;
  if (body.activityId) act = acts.find((a) => a.id === String(body.activityId)) || null;
  if (!act) {
    const P = E.avFillPick(state, key, acts, date);
    if (P.choices) return { fill: { choices: P.choices.map((a) => ({ id: a.id, km: a.km, t: a.t, name: a.name, pace: E.avPace(a.mv, a.km) })) } };
    if (!P.act) return { fill: { missing: ['strava'], reason: P.reason } };
    act = P.act;
  }
  const withWhoop = uid === ADMIN_UID, pad = 2 * 3600 * 1000;
  const [detail, workouts, hourly] = await Promise.all([
    deps.detail(uid, act.id).catch(() => null),
    withWhoop ? deps.workouts(new Date(act.startMs - pad).toISOString(), new Date(act.endMs + pad).toISOString()).catch(() => null) : Promise.resolve(null),
    act.lat != null && act.lng != null ? deps.hourly(act, nowMs).catch(() => null) : Promise.resolve(null),
  ]);
  const meteo = hourly ? E.avMeteoFromHourly(hourly, act) : null;
  const F = E.avFillResult(act, detail, workouts || [], meteo, { whoop: withWhoop });
  return { fill: JSON.parse(JSON.stringify(F)) };
}
exports.runAutoFill = runAutoFill;

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

// bouton « 🏁 J'ai fini » de l'app (compte admin) : la même vérification, tout de suite, résultat détaillé par sortie
exports.autoValidateNow = onRequest(
  { secrets: [...strava.STRAVA_SECRETS, ...whoop.WHOOP_SECRETS], timeoutSeconds: 60, memory: '512MiB', cors: true },
  async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    let uid;
    try { uid = await helpers.verifyUser(req); } catch (e) { res.status(401).json({ success: false, error: 'Non authentifié' }); return; }
    const body = req.body || {};
    if (uid !== ADMIN_UID && !body.fill) { res.status(403).json({ success: false, error: 'Réservé au compte relié à WHOOP' }); return; }
    try {
      const db = admin.database();
      const [sid, ssec] = strava.STRAVA_SECRETS;
      if (body.fill) { res.json(Object.assign({ success: true }, await runAutoFill(db, uid, Date.now(), realDeps(db, { stravaId: sid.value(), stravaSecret: ssec.value() }), body))); return; }
      const r = await runAutoValidate(db, uid, Date.now(), realDeps(db, { stravaId: sid.value(), stravaSecret: ssec.value() }), { manual: true });
      res.json(Object.assign({ success: true }, r));
    } catch (e) { console.error('autoValidateNow:', e.message); res.status(500).json({ success: false, error: e.message }); }
  }
);

