const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();

const STRAVA_CLIENT_ID = defineSecret("STRAVA_CLIENT_ID");
const STRAVA_CLIENT_SECRET = defineSecret("STRAVA_CLIENT_SECRET");

const { verifyUser, fetchWithTimeout } = require('./helpers');

// Rafraîchit le token Strava si expiré et retourne l'access_token valide
async function getValidAccessToken(db, uid, clientId, clientSecret) {
  const tokenSnap = await db.ref(`users/${uid}/state/strava_token`).once('value');
  const tokenData = tokenSnap.val();
  if (!tokenData) return null;

  if (Date.now() / 1000 <= tokenData.expires_at - 300) return tokenData.access_token;

  const refreshRes = await fetchWithTimeout('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokenData.refresh_token,
      grant_type: 'refresh_token'
    })
  }, 15000);
  if (!refreshRes.ok) {
    console.error('Strava token refresh failed:', refreshRes.status);
    return null;
  }
  const refreshed = await refreshRes.json();
  if (!refreshed.access_token) { console.error('Strava refresh: no access_token in response'); return null; }
  await db.ref(`users/${uid}/state/strava_token`).update({
    access_token: refreshed.access_token,
    expires_at: refreshed.expires_at,
    updatedAt: new Date().toISOString()
  });
  return refreshed.access_token;
}

exports.stravaAuth = onRequest(
  { secrets: [STRAVA_CLIENT_ID], cors: true },
  async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    let uid;
    try { uid = await verifyUser(req); } catch(e) { res.status(401).json({ error: 'Non authentifié' }); return; }

    const clientId = STRAVA_CLIENT_ID.value();
    const redirectUri = 'https://europe-west1-prepa-marathon.cloudfunctions.net/stravaCallback';
    const scope = 'read,activity:read';
    const state = encodeURIComponent(uid);
    const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${state}`;
    res.json({ url });
  }
);

exports.stravaCallback = onRequest(
  { secrets: [STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET], cors: true },
  async (req, res) => {
    const code = req.query.code;
    const uid = req.query.state ? decodeURIComponent(req.query.state) : null;
    if (!code) { res.status(400).send('Code manquant'); return; }
    if (!uid || uid === 'unknown') { res.status(400).send('Utilisateur non identifié'); return; }

    try {
      const tokenRes = await fetchWithTimeout('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: STRAVA_CLIENT_ID.value(),
          client_secret: STRAVA_CLIENT_SECRET.value(),
          code,
          grant_type: 'authorization_code'
        })
      }, 15000);
      const tokenData = await tokenRes.json();

      if (!tokenData.access_token) throw new Error('Token non reçu');

      // Vérifie que l'UID est un utilisateur Firebase valide
      await admin.auth().getUser(uid);

      const db = admin.database();
      await db.ref(`users/${uid}/state/strava_token`).set({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: tokenData.expires_at,
        athlete_id: tokenData.athlete?.id,
        updatedAt: new Date().toISOString()
      });

      res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2>✅ Strava connecté !</h2>
        <p>Tu peux fermer cette page et retourner dans l'app.</p>
        <script>setTimeout(() => window.close(), 2000);</script>
      </body></html>`);

    } catch(e) {
      console.error('stravaCallback error:', e.message);
      res.status(500).send('Erreur lors de la connexion Strava. Réessaie depuis l\'app.');
    }
  }
);

exports.stravaFetch = onRequest(
  { secrets: [STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET], timeoutSeconds: 30, memory: '256MiB', cors: true },
  async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    let uid;
    try { uid = await verifyUser(req); } catch(e) { res.status(401).json({ success: false, error: 'Non authentifié' }); return; }

    try {
      const db = admin.database();

      const accessToken = await getValidAccessToken(db, uid, STRAVA_CLIENT_ID.value(), STRAVA_CLIENT_SECRET.value());
      if (!accessToken) {
        res.json({ success: false, needsAuth: true, message: 'Strava non connecté' });
        return;
      }

      const activitiesRes = await fetchWithTimeout(
        'https://www.strava.com/api/v3/athlete/activities?per_page=200&page=1',
        { headers: { 'Authorization': `Bearer ${accessToken}` } },
        25000
      );
      const activities = await activitiesRes.json();

      if (!Array.isArray(activities)) {
        res.json({ success: false, message: 'Erreur API Strava' });
        return;
      }

      const runs = activities.filter(a => a.type === 'Run' || a.sport_type === 'Run');
      console.log(`Strava [${uid}]: ${activities.length} activités, ${runs.length} courses`);

      if (runs.length === 0) {
        res.json({ success: false, message: 'Aucune course trouvée sur Strava' });
        return;
      }

      const formatted = runs.map(a => {
        const distKm = Math.round((a.distance / 1000) * 10) / 10;
        const durSec = Math.round(a.moving_time || 0);
        const dMin = Math.floor(durSec / 60);
        const duree = dMin >= 60
          ? `${Math.floor(dMin/60)}:${String(dMin%60).padStart(2,'0')}:${String(durSec%60).padStart(2,'0')}`
          : `${dMin}:${String(durSec%60).padStart(2,'0')}`;
        const pace = distKm > 0 ? durSec / distKm : 0;
        const paceStr = `${Math.floor(pace/60)}:${String(Math.round(pace%60)).padStart(2,'0')}`;
        const date = new Date(a.start_date_local);
        return {
          activityId: a.id,
          date: date.toISOString().slice(0, 10),
          nom: a.name || 'Course',
          distanceKm: distKm,
          duree,
          allure: paceStr,
          fcMoyenne: a.average_heartrate ? Math.round(a.average_heartrate) : null,
          fcMax: a.max_heartrate ? Math.round(a.max_heartrate) : null,
          cadence: a.average_cadence ? Math.round(a.average_cadence * 2) : null,
          denivele_pos: a.total_elevation_gain ? Math.round(a.total_elevation_gain) : null,
          calories: a.calories ? Math.round(a.calories) : (a.kilojoules ? Math.round(a.kilojoules * 0.239) : null),
        };
      });

      res.json({ success: true, activities: formatted });

    } catch(e) {
      console.error('stravaFetch error:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  }
);

exports.stravaFetchDetail = onRequest(
  { secrets: [STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET], timeoutSeconds: 30, memory: '256MiB', cors: true },
  async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    let uid;
    try { uid = await verifyUser(req); } catch(e) { res.status(401).json({ success: false, error: 'Non authentifié' }); return; }

    try {
      const db = admin.database();
      const { activityId } = req.body;
      if (!activityId) { res.json({ success: false, message: 'activityId manquant' }); return; }

      const accessToken = await getValidAccessToken(db, uid, STRAVA_CLIENT_ID.value(), STRAVA_CLIENT_SECRET.value());
      if (!accessToken) { res.json({ success: false, message: 'Strava non connecté' }); return; }

      const detailRes = await fetchWithTimeout(
        `https://www.strava.com/api/v3/activities/${activityId}`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } },
        25000
      );
      const detail = detailRes.ok ? await detailRes.json() : {};

      const result = { calories: null, best_400m: null, splits: null, laps: null, zones_fc: null };

      if (detail.calories) result.calories = Math.round(detail.calories);

      if (detail.best_efforts && detail.best_efforts.length > 0) {
        const effort400 = detail.best_efforts.find(e => e.distance === 400);
        if (effort400 && effort400.moving_time > 0) {
          const paceSecPerKm = effort400.moving_time / 0.4;
          result.best_400m = `${Math.floor(paceSecPerKm/60)}:${String(Math.round(paceSecPerKm%60)).padStart(2,'0')}`;
        }
      }

      if (detail.splits_metric && detail.splits_metric.length > 0) {
        result.splits = detail.splits_metric.map((sp, i) => {
          const distKmSp = Math.round((sp.distance / 1000) * 100) / 100;
          const movSec = sp.moving_time || 0;
          let allure = null;
          if (distKmSp > 0.1 && movSec > 0) {
            const secPerKm = movSec / distKmSp;
            allure = `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, '0')}`;
          }
          return { km: i + 1, distanceKm: distKmSp, allure, fc: sp.average_heartrate ? Math.round(sp.average_heartrate) : null };
        }).filter(sp => sp.distanceKm >= 0.5);
      }

      if (detail.laps && detail.laps.length > 0) {
        result.laps = detail.laps.map((lap, i) => {
          const distKmLap = Math.round((lap.distance / 1000) * 100) / 100;
          const movSec = lap.moving_time || 0;
          let allure = null;
          if (distKmLap > 0.05 && movSec > 0) {
            const secPerKm = movSec / distKmLap;
            allure = `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, '0')}`;
          }
          return { index: i + 1, distanceKm: distKmLap, duree_sec: movSec, allure, fc: lap.average_heartrate ? Math.round(lap.average_heartrate) : null };
        });
      }

      if (detail.heart_rate_zones || detail.zones) {
        const zones = detail.heart_rate_zones || detail.zones;
        if (zones && Array.isArray(zones)) {
          result.zones_fc = zones.map((z, i) => ({
            zone: i + 1, nom: z.name || `Zone ${i+1}`,
            temps_sec: Math.round(z.time || 0), pourcentage: null,
          })).filter(z => z.temps_sec > 0);
        }
      }

      res.json({ success: true, detail: result });

    } catch(e) {
      console.error('stravaFetchDetail error:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  }
);
