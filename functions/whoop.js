const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();

const WHOOP_CLIENT_ID = defineSecret("WHOOP_CLIENT_ID");
const WHOOP_CLIENT_SECRET = defineSecret("WHOOP_CLIENT_SECRET");

const { fetchWithTimeout, sendPush } = require('./helpers');

const VAPID_PUBLIC_KEY = defineSecret("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = defineSecret("VAPID_PRIVATE_KEY");

const ADMIN_UID = 'WkEWrmnYWuUNkGLrwXf9HhaJWfh1';
const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer/v1';
const WHOOP_API_V2 = 'https://api.prod.whoop.com/developer/v2'; // sleep, workout, recovery
const CALLBACK_URL = 'https://us-central1-prepa-marathon.cloudfunctions.net/whoopCallback';

async function _whoopRefreshToken(db, refreshToken) {
  const body = new URLSearchParams({
    client_id: WHOOP_CLIENT_ID.value(),
    client_secret: WHOOP_CLIENT_SECRET.value(),
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  }).toString();

  const res = await fetchWithTimeout(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  }, 15000);

  if (!res.ok) return { ok: false, status: res.status };

  const refreshed = await res.json();
  if (!refreshed.access_token) return { ok: false, status: 200, noToken: true };

  const tokenUpdate = {
    access_token: refreshed.access_token,
    expires_at: Math.floor(Date.now() / 1000) + (refreshed.expires_in || 3600),
    updatedAt: new Date().toISOString()
  };
  if (refreshed.refresh_token) tokenUpdate.refresh_token = refreshed.refresh_token;
  await db.ref(`users/${ADMIN_UID}/state/whoop_token`).update(tokenUpdate);
  return { ok: true, access_token: refreshed.access_token };
}

async function getValidWhoopToken(db) {
  const snap = await db.ref(`users/${ADMIN_UID}/state/whoop_token`).once('value');
  const token = snap.val();
  if (!token || !token.refresh_token) return null;

  if (Date.now() / 1000 <= token.expires_at - 300) return token.access_token;

  // Verrou optimiste : prolonger expires_at pour bloquer les appels concurrents.
  // Un second appel concurrent verra expires_at dans le futur → retournera l'access_token actuel.
  const lockUntil = Math.floor(Date.now() / 1000) + 360;
  await db.ref(`users/${ADMIN_UID}/state/whoop_token`).update({ expires_at: lockUntil });

  // Tentative 1 : refresh avec le refresh_token stocké
  const result = await _whoopRefreshToken(db, token.refresh_token);
  if (result.ok) return result.access_token;

  if (result.status === 400 || result.status === 401) {
    // Échec probable dû à une race condition : un appel concurrent a déjà consommé
    // ce refresh_token (WHOOP rotation). Attendre 4s puis relire le token Firebase :
    // si le concurrent a réussi, le nouveau token est maintenant en base.
    console.warn(`WHOOP refresh attempt 1 failed (${result.status}) — retry after 4s`);
    await new Promise(r => setTimeout(r, 4000));

    const retrySnap = await db.ref(`users/${ADMIN_UID}/state/whoop_token`).once('value');
    const retryToken = retrySnap.val();
    if (retryToken && retryToken.access_token && Date.now() / 1000 <= retryToken.expires_at - 60) {
      // Le concurrent a réussi — utiliser son token
      console.log('WHOOP: token récupéré depuis l\'appel concurrent');
      return retryToken.access_token;
    }

    // Le refresh_token a changé (concurrent a eu un nouveau) — retenter avec le nouveau
    if (retryToken && retryToken.refresh_token && retryToken.refresh_token !== token.refresh_token) {
      console.log('WHOOP: nouveau refresh_token disponible — tentative 2');
      const result2 = await _whoopRefreshToken(db, retryToken.refresh_token);
      if (result2.ok) return result2.access_token;
    }

    // Token réellement mort — notifier l'admin
    console.error('WHOOP: token définitivement invalide — alerte admin envoyée');
    try {
      await db.ref(`users/${ADMIN_UID}/state/_whoop_disconnected`).set(new Date().toISOString());
      if (VAPID_PUBLIC_KEY.value && VAPID_PRIVATE_KEY.value) {
        await sendPush(VAPID_PUBLIC_KEY.value(), VAPID_PRIVATE_KEY.value(),
          '⚡ WHOOP déconnecté',
          'Reconnexion nécessaire dans l\'app → Compte → WHOOP',
          'whoop-disconnected', '/');
      }
    } catch(eNotif) { console.warn('WHOOP alerte push failed:', eNotif.message); }
  } else {
    console.error(`WHOOP token refresh failed: ${result.status}`);
  }

  return null;
}

exports.whoopAuth = onRequest(
  { secrets: [WHOOP_CLIENT_ID], cors: true },
  (req, res) => {
    const scope = 'read:recovery read:sleep read:workout read:cycles read:body_measurement read:profile offline';
    const state = require('crypto').randomBytes(16).toString('hex');
    const url = `https://api.prod.whoop.com/oauth/oauth2/auth?client_id=${WHOOP_CLIENT_ID.value()}&redirect_uri=${encodeURIComponent(CALLBACK_URL)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}`;
    res.redirect(url);
  }
);

exports.whoopCallback = onRequest(
  { secrets: [WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET], cors: true },
  async (req, res) => {
    const code = req.query.code;
    const error = req.query.error;
    const errorDesc = req.query.error_description;
    if (!code) {
      console.error('whoopCallback: pas de code. Params:', JSON.stringify(req.query));
      res.status(400).send(`<html><body style="font-family:sans-serif;padding:20px;background:#0a0a0a;color:#fff;">
        <h3 style="color:#ef4444;">❌ Erreur WHOOP</h3>
        <p>Erreur : <strong>${error || 'inconnue'}</strong></p>
        ${errorDesc ? `<p>Détail : ${errorDesc}</p>` : ''}
      </body></html>`);
      return;
    }
    try {
      const body = new URLSearchParams({
        client_id: WHOOP_CLIENT_ID.value(),
        client_secret: WHOOP_CLIENT_SECRET.value(),
        code,
        grant_type: 'authorization_code',
        redirect_uri: CALLBACK_URL
      }).toString();

      const tokenRes = await fetchWithTimeout(WHOOP_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      }, 15000);

      if (!tokenRes.ok) throw new Error('Token exchange failed: ' + tokenRes.status);
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) throw new Error('Token non reçu: ' + JSON.stringify(tokenData));

      const db = admin.database();
      await db.ref(`users/${ADMIN_UID}/state/whoop_token`).set({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + (tokenData.expires_in || 3600),
        scope: tokenData.scope || null,
        updatedAt: new Date().toISOString()
      });

      res.send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WHOOP connecté</title><style>
        *{margin:0;padding:0;box-sizing:border-box;}
        body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#0a0f1e 0%,#0d1f3c 60%,#0a2a1a 100%);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;}
        .card{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:24px;padding:40px 32px;max-width:340px;width:100%;text-align:center;backdrop-filter:blur(12px);}
        .icon-wrap{width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#16a34a,#22c55e);display:flex;align-items:center;justify-content:center;margin:0 auto 24px;box-shadow:0 0 40px rgba(34,197,94,0.4);animation:pop .5s cubic-bezier(.175,.885,.32,1.275) both;}
        @keyframes pop{from{transform:scale(0);opacity:0;}to{transform:scale(1);opacity:1;}}
        .checkmark{width:38px;height:38px;stroke:#fff;fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:60;stroke-dashoffset:60;animation:draw .4s .3s ease forwards;}
        @keyframes draw{to{stroke-dashoffset:0;}}
        h1{color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.3px;margin-bottom:8px;}
        p{color:rgba(255,255,255,0.6);font-size:14px;line-height:1.5;margin-bottom:28px;}
        .badge{display:inline-flex;align-items:center;gap:8px;background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);border-radius:100px;padding:8px 16px;margin-bottom:28px;}
        .dot{width:8px;height:8px;border-radius:50%;background:#22c55e;animation:pulse 1.5s ease-in-out infinite;}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.4;transform:scale(.75);}}
        .badge span{color:#22c55e;font-size:13px;font-weight:700;}
        .close-bar{height:4px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden;margin-top:4px;}
        .close-fill{height:100%;background:#22c55e;border-radius:4px;animation:fill 3s linear forwards;}
        @keyframes fill{from{width:0;}to{width:100%;}}
        .close-hint{color:rgba(255,255,255,0.3);font-size:11px;margin-top:8px;}
      </style></head><body>
        <div class="card">
          <div class="icon-wrap">
            <svg class="checkmark" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h1>WHOOP connecté !</h1>
          <p>Tes données de récupération, sommeil et HRV sont maintenant synchronisées avec l'app.</p>
          <div class="badge"><div class="dot"></div><span>Synchronisation active</span></div>
          <div class="close-bar"><div class="close-fill"></div></div>
          <p class="close-hint">Fermeture automatique dans 3 s…</p>
        </div>
        <script>setTimeout(()=>window.close(),3000);</script>
      </body></html>`);
    } catch(e) {
      console.error('whoopCallback error:', e.message);
      res.status(500).send('Erreur: ' + e.message);
    }
  }
);

// Logique partagée : fetch + save WHOOP data. Retourne l'objet résultat ou null si pas de token.
async function _whoopFetchAndSave(db) {
  const accessToken = await getValidWhoopToken(db);
  if (!accessToken) return null;

  let _unauthorized = false;

  const whoopGet = async (path) => {
    const r = await fetchWithTimeout(`${WHOOP_API_BASE}${path}`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
    }, 20000);
    if (r.status === 401) { _unauthorized = true; return null; }
    if (!r.ok) return null;
    return r.json();
  };

  const whoopGetV2 = async (path) => {
    const r = await fetchWithTimeout(`${WHOOP_API_V2}${path}`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
    }, 20000);
    if (r.status === 401) { _unauthorized = true; return null; }
    if (!r.ok) return null;
    return r.json();
  };

  const [cycleJson, sleepJson, workoutJson, recoveryJson] = await Promise.all([
    whoopGet('/cycle?limit=14'),
    whoopGetV2('/activity/sleep?limit=14'),
    whoopGetV2('/activity/workout?limit=14'),
    whoopGetV2('/recovery?limit=14')
  ]);

  // Token invalide côté WHOOP : forcer expires_at=0 pour que le prochain appel renouvelle
  if (_unauthorized) {
    console.warn('WHOOP API returned 401 — forcing token expiry for next refresh');
    await db.ref(`users/${ADMIN_UID}/state/whoop_token`).update({ expires_at: 0 });
    return null;
  }

  const cycles = (cycleJson?.records || [])
    .filter(c => c.score_state === 'SCORED' && c.start)
    .map(c => ({
      date: c.start.slice(0, 10),
      strain: c.score?.strain ?? null,
      avg_hr: c.score?.average_heart_rate ?? null,
      max_hr: c.score?.max_heart_rate ?? null,
      calories: c.score?.kilojoule ? Math.round(c.score.kilojoule * 0.239) : null
    }));

  const _sleepRaw = (sleepJson?.records || [])
    .filter(s => s.start)
    .map(s => {
      const ss = s.score?.stage_summary;
      const lightMs = ss?.total_light_sleep_time_milli || 0;
      const swsMs   = ss?.total_slow_wave_sleep_time_milli || 0;
      const remMs   = ss?.total_rem_sleep_time_milli || 0;
      const sleepMs = ss?.total_sleep_time_milli || (lightMs + swsMs + remMs);
      const hh = Math.floor(sleepMs / 3600000);
      const mm = Math.round((sleepMs % 3600000) / 60000);
      const date = s.end ? s.end.slice(0, 10) : s.start.slice(0, 10);
      return {
        date,
        sleepMs,
        duration_hours: sleepMs ? `${hh}h${mm.toString().padStart(2,'0')}` : null,
        performance_pct: s.score?.sleep_performance_percentage ?? null,
        efficiency_pct: s.score?.sleep_efficiency_percentage ?? null,
        rem_pct: sleepMs && remMs ? Math.round(remMs / sleepMs * 100) : null
      };
    });

  const _sleepByDate = new Map();
  for (const s of _sleepRaw) {
    const existing = _sleepByDate.get(s.date);
    if (!existing || s.sleepMs > existing.sleepMs) _sleepByDate.set(s.date, s);
  }
  const sleeps = [..._sleepByDate.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(({ sleepMs: _ms, ...rest }) => rest);

  const workouts = (workoutJson?.records || [])
    .filter(w => w.start)
    .map(w => ({
      date: w.start.slice(0, 10),
      sport_id: w.sport_id,
      strain: w.score?.strain ?? null,
      avg_hr: w.score?.average_heart_rate ?? null,
      max_hr: w.score?.max_heart_rate ?? null,
      calories: w.score?.kilojoule ? Math.round(w.score.kilojoule * 0.239) : null,
      duration_min: w.start && w.end ? Math.round((new Date(w.end) - new Date(w.start)) / 60000) : null
    }));

  const recoveries = (recoveryJson?.records || [])
    .filter(r => r.created_at)
    .map(r => ({
      date: r.created_at.slice(0, 10),
      score: r.score?.recovery_score ?? null,
      rhr: r.score?.resting_heart_rate ?? null,
      hrv: r.score?.hrv_rmssd_milli ?? r.score?.hrv_rms_sd ?? null,
      spo2: r.score?.spo2_percentage ?? null
    }));

  const latestRecovery = recoveries[0] || null;
  const rhr = latestRecovery?.rhr ?? null;
  const latestCompletedCycle = cycles.find(c => c.avg_hr !== null);
  const rhrProxy = rhr ?? latestCompletedCycle?.avg_hr ?? null;
  const latestStrain = cycles[0]?.strain ?? null;

  await db.ref(`users/${ADMIN_UID}/state/whoop_data`).set({
    updatedAt: new Date().toISOString(),
    cycles: cycles.slice(0, 14),
    sleeps: sleeps.slice(0, 14),
    workouts: workouts.slice(0, 14),
    recoveries: recoveries.slice(0, 14),
    latest_strain: latestStrain,
    latest_rhr: rhr,
    latest_rhr_proxy: rhrProxy,
    latest_recovery_score: latestRecovery?.score ?? null,
    latest_hrv: latestRecovery?.hrv ?? null
  });

  if (rhrProxy) {
    const today = new Date().toISOString().slice(0, 10);
    await db.ref(`users/${ADMIN_UID}/state/fc_repos_${today}`).transaction(existing => {
      return existing === null ? rhrProxy : existing;
    });
  }

  return { latestStrain, rhr, rhrProxy, latestRecovery, cycles, sleeps, workouts, recoveries };
}

exports.whoopSync = onRequest(
  { secrets: [WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET], timeoutSeconds: 60, memory: '256MiB', cors: true },
  async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    try {
      const db = admin.database();
      const result = await _whoopFetchAndSave(db);
      if (!result) { res.json({ success: false, needsAuth: true }); return; }

      const { latestStrain, rhr, rhrProxy, latestRecovery, cycles, sleeps, workouts, recoveries } = result;
      res.json({
        success: true,
        strain: latestStrain,
        rhr,
        rhr_proxy: rhrProxy,
        recovery_score: latestRecovery?.score ?? null,
        hrv: latestRecovery?.hrv ?? null,
        cycles_count: cycles.length,
        sleeps_count: sleeps.length,
        workouts_count: workouts.length,
        recoveries_count: recoveries.length
      });
    } catch(e) {
      console.error('whoopSync error:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  }
);

// Sync automatique WHOOP toutes les heures de 5h à 22h (Europe/Paris)
// Garantit des données fraîches et renouvelle le token proactivement
exports.whoopAutoSync = onSchedule(
  { schedule: '0 5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22 * * *', timeZone: 'Europe/Paris', timeoutSeconds: 60, secrets: [WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY] },
  async () => {
    try {
      const db = admin.database();
      const result = await _whoopFetchAndSave(db);
      if (!result) {
        console.log('whoopAutoSync: pas de token valide — sync ignorée');
        return;
      }
      console.log(`whoopAutoSync: sync OK — recovery ${result.latestRecovery?.score ?? 'N/A'}% RHR ${result.rhr ?? 'N/A'} bpm`);
    } catch(e) {
      console.error('whoopAutoSync error:', e.message);
    }
  }
);

// Keepalive token WHOOP toutes les 40 min (refresh proactif, sans fetch données)
// Évite les déconnexions dues à l'expiration du token entre deux auto-syncs
exports.whoopTokenKeepAlive = onSchedule(
  { schedule: '20 * * * *', timeZone: 'Europe/Paris', timeoutSeconds: 30, secrets: [WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY] },
  async () => {
    try {
      const db = admin.database();
      const snap = await db.ref(`users/${ADMIN_UID}/state/whoop_token`).once('value');
      const token = snap.val();
      if (!token || !token.refresh_token) return; // pas de token configuré
      // Refresh proactif si expiry dans moins de 90 min
      if (token.expires_at && Date.now() / 1000 <= token.expires_at - 5400) return;
      console.log('whoopTokenKeepAlive: refresh proactif du token');
      const accessToken = await getValidWhoopToken(db);
      if (accessToken) {
        console.log('whoopTokenKeepAlive: token rafraîchi avec succès');
      } else {
        console.warn('whoopTokenKeepAlive: refresh échoué');
      }
    } catch(e) {
      console.error('whoopTokenKeepAlive error:', e.message);
    }
  }
);
