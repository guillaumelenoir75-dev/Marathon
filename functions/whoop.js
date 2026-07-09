const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();

const WHOOP_CLIENT_ID = defineSecret("WHOOP_CLIENT_ID");
const WHOOP_CLIENT_SECRET = defineSecret("WHOOP_CLIENT_SECRET");

const { fetchWithTimeout } = require('./helpers');

const ADMIN_UID = 'WkEWrmnYWuUNkGLrwXf9HhaJWfh1';
const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer/v1';
const WHOOP_API_V2 = 'https://api.prod.whoop.com/developer/v2'; // sleep, workout, recovery
const CALLBACK_URL = 'https://us-central1-prepa-marathon.cloudfunctions.net/whoopCallback';

async function getValidWhoopToken(db) {
  const snap = await db.ref(`users/${ADMIN_UID}/state/whoop_token`).once('value');
  const token = snap.val();
  if (!token) return null;

  if (Date.now() / 1000 <= token.expires_at - 300) return token.access_token;

  const body = new URLSearchParams({
    client_id: WHOOP_CLIENT_ID.value(),
    client_secret: WHOOP_CLIENT_SECRET.value(),
    refresh_token: token.refresh_token,
    grant_type: 'refresh_token'
  }).toString();

  const res = await fetchWithTimeout(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  }, 15000);

  if (!res.ok) throw new Error('WHOOP token refresh failed: ' + res.status);
  const refreshed = await res.json();
  if (!refreshed.access_token) throw new Error('Refresh token invalide');

  await db.ref(`users/${ADMIN_UID}/state/whoop_token`).update({
    access_token: refreshed.access_token,
    expires_at: Math.floor(Date.now() / 1000) + (refreshed.expires_in || 3600),
    updatedAt: new Date().toISOString()
  });
  return refreshed.access_token;
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

      res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0a0a0a;color:#fff;">
        <h2 style="color:#22c55e;">✅ WHOOP connecté !</h2>
        <p>Tu peux fermer cette page et retourner dans l'app.</p>
        <script>setTimeout(() => window.close(), 2000);</script>
      </body></html>`);
    } catch(e) {
      console.error('whoopCallback error:', e.message);
      res.status(500).send('Erreur: ' + e.message);
    }
  }
);

exports.whoopSync = onRequest(
  { secrets: [WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET], timeoutSeconds: 60, memory: '256MiB', cors: true },
  async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    try {
      const db = admin.database();
      const accessToken = await getValidWhoopToken(db);
      if (!accessToken) { res.json({ success: false, needsAuth: true }); return; }

      const whoopGet = async (path) => {
        const r = await fetchWithTimeout(`${WHOOP_API_BASE}${path}`, {
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
        }, 20000);
        if (!r.ok) return null;
        return r.json();
      };

      const whoopGetV2 = async (path) => {
        const r = await fetchWithTimeout(`${WHOOP_API_V2}${path}`, {
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
        }, 20000);
        if (!r.ok) return null;
        return r.json();
      };

      // cycle : API v1 / sleep + workout + recovery : API v2
      const [cycleJson, sleepJson, workoutJson, recoveryJson] = await Promise.all([
        whoopGet('/cycle?limit=14'),
        whoopGetV2('/activity/sleep?limit=14'),
        whoopGetV2('/activity/workout?limit=14'),
        whoopGetV2('/recovery?limit=14')
      ]);

      const cycles = (cycleJson?.records || [])
        .filter(c => c.score_state === 'SCORED' && c.start)
        .map(c => ({
          date: c.start.slice(0, 10),
          strain: c.score?.strain ?? null,
          avg_hr: c.score?.average_heart_rate ?? null,
          max_hr: c.score?.max_heart_rate ?? null,
          calories: c.score?.kilojoule ? Math.round(c.score.kilojoule * 0.239) : null
        }));

      const sleeps = (sleepJson?.records || [])
        .filter(s => s.start)
        .map(s => {
          const ss = s.score?.stage_summary;
          const totalMs = ss?.total_in_bed_time_milli || 0;
          const remMs = ss?.total_rem_sleep_time_milli || 0;
          return {
            date: s.start.slice(0, 10),
            duration_hours: totalMs ? Math.round(totalMs / 36000) / 100 : null,
            performance_pct: s.score?.sleep_performance_percentage ?? null,
            efficiency_pct: s.score?.sleep_efficiency_percentage ?? null,
            rem_pct: totalMs && remMs ? Math.round(remMs / totalMs * 100) : null
          };
        });

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
          hrv: r.score?.hrv_rms_sd ?? null,
          spo2: r.score?.spo2_percentage ?? null
        }));

      // FC repos : depuis recovery si dispo, sinon avg_hr du cycle du jour (proxy)
      const latestRecovery = recoveries[0] || null;
      const rhr = latestRecovery?.rhr ?? null;

      // Proxy FC repos depuis le cycle le plus récent complété (avg_hr journalier)
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

      // Auto-fill fc_repos du jour sans écraser les mesures manuelles
      if (rhrProxy) {
        const today = new Date().toISOString().slice(0, 10);
        await db.ref(`users/${ADMIN_UID}/state/fc_repos_${today}`).transaction(existing => {
          return existing === null ? rhrProxy : existing;
        });
      }

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
