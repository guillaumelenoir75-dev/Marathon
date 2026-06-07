const {onRequest} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");
admin.initializeApp();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const GARMIN_EMAIL = defineSecret("GARMIN_EMAIL");
const GARMIN_PASSWORD = defineSecret("GARMIN_PASSWORD");
const STRAVA_CLIENT_ID = defineSecret("STRAVA_CLIENT_ID");
const STRAVA_CLIENT_SECRET = defineSecret("STRAVA_CLIENT_SECRET");
const VAPID_PUBLIC_KEY = defineSecret("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = defineSecret("VAPID_PRIVATE_KEY");

// ── STRAVA OAUTH ──────────────────────────────────────────────────────────────

// Étape 1 : redirige l'utilisateur vers la page d'autorisation Strava
exports.stravaAuth = onRequest(
  { secrets: [STRAVA_CLIENT_ID], cors: true },
  (req, res) => {
    const clientId = STRAVA_CLIENT_ID.value();
    const redirectUri = 'https://us-central1-prepa-marathon.cloudfunctions.net/stravaCallback';
    const scope = 'read,activity:read';
    const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}`;
    res.redirect(url);
  }
);

// Étape 2 : Strava rappelle ici avec le code, on échange contre un token
exports.stravaCallback = onRequest(
  { secrets: [STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET], cors: true },
  async (req, res) => {
    const code = req.query.code;
    if (!code) { res.status(400).send('Code manquant'); return; }

    try {
      const https = require('https');
      const body = JSON.stringify({
        client_id: STRAVA_CLIENT_ID.value(),
        client_secret: STRAVA_CLIENT_SECRET.value(),
        code,
        grant_type: 'authorization_code'
      });

      const tokenData = await new Promise((resolve, reject) => {
        const r = https.request('https://www.strava.com/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, resp => {
          let d = '';
          resp.on('data', c => d += c);
          resp.on('end', () => resolve(JSON.parse(d)));
        });
        r.on('error', reject);
        r.write(body);
        r.end();
      });

      if (!tokenData.access_token) throw new Error('Token non reçu');

      // Sauvegarder les tokens dans Firebase
      const db = admin.database();
      await db.ref('marathon/strava_token').set({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: tokenData.expires_at,
        athlete_id: tokenData.athlete?.id,
        updatedAt: new Date().toISOString()
      });

      // Rediriger vers l'app avec succès
      res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2>✅ Strava connecté !</h2>
        <p>Tu peux fermer cette page et retourner dans l'app.</p>
        <script>setTimeout(() => window.close(), 2000);</script>
      </body></html>`);

    } catch(e) {
      console.error('stravaCallback error:', e.message);
      res.status(500).send('Erreur: ' + e.message);
    }
  }
);

// Étape 3 : récupérer les dernières courses depuis Strava
exports.stravaFetch = onRequest(
  { secrets: [STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET], timeoutSeconds: 30, memory: '256MiB', cors: true },
  async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    try {
      const https = require('https');
      const db = admin.database();

      // Récupérer le token stocké
      const tokenSnap = await db.ref('marathon/strava_token').once('value');
      const tokenData = tokenSnap.val();
      if (!tokenData) {
        res.json({ success: false, needsAuth: true, message: 'Strava non connecté' });
        return;
      }

      // Rafraîchir le token si expiré
      let accessToken = tokenData.access_token;
      if (Date.now() / 1000 > tokenData.expires_at - 300) {
        const body = JSON.stringify({
          client_id: STRAVA_CLIENT_ID.value(),
          client_secret: STRAVA_CLIENT_SECRET.value(),
          refresh_token: tokenData.refresh_token,
          grant_type: 'refresh_token'
        });
        const refreshed = await new Promise((resolve, reject) => {
          const r = https.request('https://www.strava.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
          }, resp => {
            let d = '';
            resp.on('data', c => d += c);
            resp.on('end', () => resolve(JSON.parse(d)));
          });
          r.on('error', reject);
          r.write(body);
          r.end();
        });
        accessToken = refreshed.access_token;
        await db.ref('marathon/strava_token').update({
          access_token: refreshed.access_token,
          expires_at: refreshed.expires_at,
          updatedAt: new Date().toISOString()
        });
      }

      // Récupérer les activités (200 max pour couvrir toute la prépa)
      const activities = await new Promise((resolve, reject) => {
        const r = https.request(
          'https://www.strava.com/api/v3/athlete/activities?per_page=200&page=1',
          { headers: { 'Authorization': `Bearer ${accessToken}` } },
          resp => {
            let d = '';
            resp.on('data', c => d += c);
            resp.on('end', () => resolve(JSON.parse(d)));
          }
        );
        r.on('error', reject);
        r.end();
      });

      if (!Array.isArray(activities)) {
        res.json({ success: false, message: 'Erreur API Strava' });
        return;
      }

      // Filtrer uniquement les courses à pied — liste légère sans détails
      const runs = activities.filter(a => a.type === 'Run' || a.sport_type === 'Run');
      console.log(`Strava: ${activities.length} activités, ${runs.length} courses`);

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

// ── STRAVA FETCH DETAIL (splits, laps, best_400m pour une activité) ────────────
exports.stravaFetchDetail = onRequest(
  { secrets: [STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET], timeoutSeconds: 30, memory: '256MiB', cors: true },
  async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    try {
      const https = require('https');
      const db = admin.database();
      const { activityId } = req.body;
      if (!activityId) { res.json({ success: false, message: 'activityId manquant' }); return; }

      const tokenSnap = await db.ref('marathon/strava_token').once('value');
      const tokenData = tokenSnap.val();
      if (!tokenData) { res.json({ success: false, message: 'Strava non connecté' }); return; }

      let accessToken = tokenData.access_token;
      if (Date.now() / 1000 > tokenData.expires_at - 300) {
        const body = JSON.stringify({
          client_id: STRAVA_CLIENT_ID.value(),
          client_secret: STRAVA_CLIENT_SECRET.value(),
          refresh_token: tokenData.refresh_token,
          grant_type: 'refresh_token'
        });
        const refreshed = await new Promise((resolve, reject) => {
          const r = https.request('https://www.strava.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
          }, resp => {
            let d = '';
            resp.on('data', c => d += c);
            resp.on('end', () => resolve(JSON.parse(d)));
          });
          r.on('error', reject);
          r.write(body);
          r.end();
        });
        accessToken = refreshed.access_token;
        await db.ref('marathon/strava_token').update({
          access_token: refreshed.access_token,
          expires_at: refreshed.expires_at,
          updatedAt: new Date().toISOString()
        });
      }

      const detail = await new Promise((resolve, reject) => {
        const r = https.request(
          `https://www.strava.com/api/v3/activities/${activityId}`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } },
          resp => {
            let d = '';
            resp.on('data', c => d += c);
            resp.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({}); } });
          }
        );
        r.on('error', () => resolve({}));
        r.end();
      });

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

// ── GARMIN FETCH ─────────────────────────────────────────────────────────────
// Login + récupération activités en une seule opération côté serveur
// Les cookies sont gérés en mémoire serveur — pas de problème de transmission

exports.garminFetch = onRequest(
  { secrets: [GARMIN_EMAIL, GARMIN_PASSWORD], timeoutSeconds: 60, memory: '512MiB', cors: true },
  async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    try {
      const https = require('https');
      const db = admin.database();

      // Cookies en mémoire pour tout le flow
      let cookies = {};

      function cookieStr() {
        return Object.entries(cookies).map(([k,v]) => `${k}=${v}`).join('; ');
      }

      function parseCookies(setCookieArr) {
        if (!setCookieArr) return;
        setCookieArr.forEach(c => {
          const eqIdx = c.indexOf('=');
          const semiIdx = c.indexOf(';');
          if (eqIdx > 0) {
            const name = c.slice(0, eqIdx).trim();
            const val = c.slice(eqIdx + 1, semiIdx > eqIdx ? semiIdx : undefined).trim();
            cookies[name] = val;
          }
        });
      }

      function httpsGet(url, reqHeaders = {}) {
        return new Promise((resolve, reject) => {
          const doReq = (reqUrl, redirectCount = 0) => {
            const opts = {
              method: 'GET',
              headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
                'Accept': 'text/html,application/json,*/*',
                'Accept-Language': 'fr-FR,fr;q=0.9',
                ...reqHeaders,
                'Cookie': cookieStr()
              }
            };
            const r = https.request(reqUrl, opts, (resp) => {
              parseCookies(resp.headers['set-cookie']);
              if ([301,302,303,307,308].includes(resp.statusCode) && resp.headers.location && redirectCount < 6) {
                let loc = resp.headers.location;
                if (loc.startsWith('/')) {
                  const u = new URL(reqUrl);
                  loc = `${u.protocol}//${u.host}${loc}`;
                }
                console.log(`GET redirect ${redirectCount+1}: ${loc.slice(0,60)}`);
                resp.resume();
                doReq(loc, redirectCount + 1);
                return;
              }
              let body = '';
              resp.on('data', c => body += c);
              resp.on('end', () => resolve({ status: resp.statusCode, body, headers: resp.headers }));
            });
            r.on('error', reject);
            r.end();
          };
          doReq(url);
        });
      }

      function httpsPost(url, body, reqHeaders = {}) {
        return new Promise((resolve, reject) => {
          const u = new URL(url);
          const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
          const opts = {
            method: 'POST',
            headers: {
              'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
              'Accept': 'application/json,*/*',
              'Content-Length': Buffer.byteLength(bodyStr),
              ...reqHeaders,
              'Cookie': cookieStr()
            }
          };
          const r = https.request(url, opts, (resp) => {
            parseCookies(resp.headers['set-cookie']);
            let respBody = '';
            resp.on('data', c => respBody += c);
            resp.on('end', () => resolve({ status: resp.statusCode, body: respBody, headers: resp.headers }));
          });
          r.on('error', reject);
          r.write(bodyStr);
          r.end();
        });
      }

      // ── LOGIN FLOW ────────────────────────────────────────────────────────
      const email = GARMIN_EMAIL.value();
      const password = GARMIN_PASSWORD.value();

      console.log('Step 1: Load SSO page');
      const ssoUrl = 'https://sso.garmin.com/sso/signin?service=https%3A%2F%2Fconnect.garmin.com%2Fmodern%2F&webhost=https%3A%2F%2Fconnect.garmin.com&clientId=GarminConnect&generateExtraServiceTicket=true&generateTwoExtraServiceTickets=true&locale=fr_FR';
      const ssoPage = await httpsGet(ssoUrl);
      console.log(`SSO page: ${ssoPage.status}`);

      const csrfMatch = ssoPage.body.match(/name="_csrf"\s+value="([^"]+)"/);
      if (!csrfMatch) {
        console.log('SSO page snippet:', ssoPage.body.slice(0, 500));
        throw new Error('CSRF token non trouvé sur la page SSO');
      }
      const csrf = csrfMatch[1];

      console.log('Step 2: POST credentials');
      const formBody = `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&embed=false&_csrf=${encodeURIComponent(csrf)}`;
      const loginResp = await httpsPost(ssoUrl, formBody, {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://sso.garmin.com',
        'Referer': ssoUrl
      });
      console.log(`Login POST: ${loginResp.status}`);

      const ticketMatch = loginResp.body.match(/ticket=([A-Za-z0-9_\-]+)/);
      if (!ticketMatch) {
        console.log('Login response snippet:', loginResp.body.slice(0, 500));
        throw new Error('Ticket non trouvé — identifiants incorrects ?');
      }
      const ticket = ticketMatch[1];
      console.log('Got ticket:', ticket.slice(0, 20) + '...');

      console.log('Step 3: Exchange ticket');
      await httpsGet(`https://connect.garmin.com/modern/?ticket=${ticket}`);
      console.log('Session cookies after ticket exchange:', Object.keys(cookies).join(', '));

      console.log('Step 4: Fetch activities');
      const activitiesResp = await httpsGet(
        'https://connect.garmin.com/proxy/activitylist-service/activities/search/activities?limit=30&start=0',
        { 'Accept': 'application/json', 'NK': 'NT', 'X-App-Ver': '4.6.1.1', 'Di-Backend': 'connectapi.garmin.com' }
      );
      console.log(`Activities: ${activitiesResp.status}, body length: ${activitiesResp.body.length}`);
      if (activitiesResp.status !== 200) {
        console.log('Activities error:', activitiesResp.body.slice(0, 300));
        throw new Error(`Activités non accessibles: ${activitiesResp.status}`);
      }

      let activities;
      try { activities = JSON.parse(activitiesResp.body); } catch(e) { throw new Error('Réponse activités non parsable'); }
      if (!Array.isArray(activities)) activities = activities?.activityList || [];

      // Filtrer les courses
      const runs = activities.filter(a => {
        const t = (a.activityType?.typeKey || a.activityTypeKey || '').toLowerCase();
        return t.includes('run');
      });
      console.log(`Found ${activities.length} activities, ${runs.length} runs`);

      // Formater
      const formatted = runs.slice(0, 3).map(a => {
        const distKm = Math.round((a.distance / 1000) * 10) / 10;
        const durationSec = Math.round(a.duration || 0);
        const dMin = Math.floor(durationSec / 60);
        const durationStr = dMin >= 60
          ? `${Math.floor(dMin/60)}:${String(dMin%60).padStart(2,'0')}:${String(durationSec%60).padStart(2,'0')}`
          : `${dMin}:${String(durationSec%60).padStart(2,'0')}`;
        const paceSecPerKm = distKm > 0 ? durationSec / distKm : 0;
        const paceStr = `${Math.floor(paceSecPerKm/60)}:${String(Math.round(paceSecPerKm%60)).padStart(2,'0')}`;
        const startDate = new Date(a.startTimeLocal || a.beginTimestamp || a.startTimeGMT);
        return {
          activityId: a.activityId,
          date: startDate.toISOString().slice(0, 10),
          nom: a.activityName || 'Course',
          distanceKm: distKm,
          duree: durationStr,
          allure: paceStr,
          fcMoyenne: a.averageHR ? Math.round(a.averageHR) : null,
          fcMax: a.maxHR ? Math.round(a.maxHR) : null,
          cadence: a.averageRunningCadenceInStepsPerMinute ? Math.round(a.averageRunningCadenceInStepsPerMinute * 2) : null,
          denivele_pos: a.elevationGain ? Math.round(a.elevationGain) : null,
          denivele_neg: a.elevationLoss ? Math.round(a.elevationLoss) : null,
        };
      });

      res.json({ success: true, activities: formatted });

    } catch(e) {
      console.error('garminFetch error:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  }
);
// Le navigateur gère l'auth Garmin directement (pas de ban IP serveur)
// Ce proxy relaie uniquement les requêtes HTTP pour contourner le CORS

exports.garminProxy = onRequest(
  { timeoutSeconds: 30, memory: '256MiB', cors: true },
  async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, NK, DI-Backend, X-App-Ver, nk, cookie');
    res.setHeader('Access-Control-Expose-Headers', 'Set-Cookie, NK');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    try {
      const https = require('https');
      const http = require('http');

      const targetUrl = req.body?.url || req.query?.url;
      if (!targetUrl) { res.status(400).json({ error: 'Missing url parameter' }); return; }

      // Sécurité : uniquement les domaines Garmin autorisés
      const allowedDomains = ['connect.garmin.com', 'sso.garmin.com', 'garmin.com'];
      const urlObj = new URL(targetUrl);
      if (!allowedDomains.some(d => urlObj.hostname.endsWith(d))) {
        res.status(403).json({ error: 'Domain not allowed' });
        return;
      }

      const method = req.body?.method || req.method;
      const headers = req.body?.headers || {};
      const body = req.body?.body || null;

      const options = {
        method: method,
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'fr-FR,fr;q=0.9',
          'Origin': 'https://connect.garmin.com',
          'Referer': 'https://connect.garmin.com/',
          ...headers
        }
      };

      const lib = urlObj.protocol === 'https:' ? https : http;

      console.log(`Proxy request: ${method} ${targetUrl.slice(0, 80)}`);

      function doRequest(reqUrl, reqMethod, reqHeaders, reqBody, redirectCount) {
        const u = new URL(reqUrl);
        const reqLib = u.protocol === 'https:' ? https : http;
        const allSetCookies = [];

        const reqOptions = { method: reqMethod, headers: reqHeaders };
        const r = reqLib.request(reqUrl, reqOptions, (proxyRes) => {
          console.log(`Proxy response: ${proxyRes.statusCode} for ${reqUrl.slice(0, 60)}`);
          const setCookies = proxyRes.headers['set-cookie'];
          if (setCookies) allSetCookies.push(...setCookies);

          // Suivre les redirections
          if ([301,302,303,307,308].includes(proxyRes.statusCode) && proxyRes.headers.location && redirectCount < 5) {
            let location = proxyRes.headers.location;
            if (location.startsWith('/')) location = `${u.protocol}//${u.host}${location}`;
            console.log(`Redirect → ${location.slice(0, 60)}`);
            const existingCookie = reqHeaders['Cookie'] || '';
            const newCookies = allSetCookies.map(c => c.split(';')[0]).join('; ');
            const mergedCookies = [existingCookie, newCookies].filter(Boolean).join('; ');
            const newHeaders = { ...reqHeaders, Cookie: mergedCookies };
            // Consommer le body avant de continuer
            proxyRes.resume();
            doRequest(location, 'GET', newHeaders, null, redirectCount + 1);
            return;
          }

          const nkToken = proxyRes.headers['nk'] || proxyRes.headers['NK'];
          if (allSetCookies.length > 0) res.setHeader('x-set-cookie', JSON.stringify(allSetCookies));
          if (nkToken) res.setHeader('x-nk-token', nkToken);
          res.status(proxyRes.statusCode);
          res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'application/json');
          let data = '';
          proxyRes.on('data', chunk => data += chunk);
          proxyRes.on('end', () => {
            if (proxyRes.statusCode !== 200) console.log(`Non-200 body: ${data.slice(0, 300)}`);
            res.send(data);
          });
        });

        r.on('error', (e) => res.status(500).json({ error: e.message }));
        if (reqBody) r.write(typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody));
        r.end();
      }

      doRequest(targetUrl, method, options.headers, body || null, 0);

    } catch(e) {
      console.error('garminProxy error:', e.message);
      res.status(500).json({ error: e.message });
    }
  }
);

// ── GARMIN SYNC (legacy - remplacé par garminProxy) ───────────────────────────
exports.garminSync = onRequest(
  { secrets: [GARMIN_EMAIL, GARMIN_PASSWORD], timeoutSeconds: 60, memory: '512MiB', cors: true },
  async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    res.json({ success: false, message: 'Utiliser garminProxy à la place' });
  }
);



const typeToTitle = {
  ef: "Run - EF",
  tempo: "Run - Tempo",
  long: "Run - EF Long",
  race: "Run - Course",
  rest: "Récupération"
};

function getWeekStartDate(weekNum) {
  const baseDate = new Date(2026, 2, 9);
  const target = new Date(baseDate);
  target.setDate(baseDate.getDate() + (weekNum - 1) * 7);
  return target;
}

function buildEvent(uid, title, description, startDate, durationMinutes) {
  const end = new Date(startDate.getTime() + durationMinutes * 60000);
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const now = new Date();
  return [
    'BEGIN:VEVENT',
    `UID:${uid}@prepa-marathon`,
    `DTSTAMP:${fmt(now)}`,
    `DTSTART;TZID=Europe/Paris:${fmt(startDate)}`,
    `DTEND;TZID=Europe/Paris:${fmt(end)}`,
    `SUMMARY:${title}`,
    description ? `DESCRIPTION:${description.replace(/\n/g, '\\n')}` : '',
    'END:VEVENT'
  ].filter(Boolean).join('\r\n');
}

exports.calendar = onRequest(async (req, res) => {
  const db = admin.database();
  const snapshot = await db.ref("marathon/state").once("value");
  const state = snapshot.val() || {};
  const events = [];

  Object.keys(state).forEach(key => {
    const match = key.match(/^edit_w(\d+)_s(\d+)$/);
    if (!match) return;
    try {
      const session = JSON.parse(state[key]);
      if (!session.sched_day || !session.sched_time) return;
      const ws = parseInt(match[1]);
      const [h, m] = session.sched_time.split(":").map(Number);
      const weekStart = getWeekStartDate(ws);
      const eventDate = new Date(weekStart);
      eventDate.setDate(weekStart.getDate() + (session.sched_day - 1));
      eventDate.setHours(h, m, 0, 0);
      const title = typeToTitle[session.type] || "Run - EF";
      const parts = (session.d || '').split('|');
      const desc = [`${session.km} km`, parts[1]||''].filter(Boolean).join(' · ');
      events.push(buildEvent(`run_w${ws}_s${match[2]}`, title, desc, eventDate, 60));
    } catch(e) {}
  });

  // ── Séances extra (ajoutées via "Ajouter une séance") ──────────────────────
  Object.keys(state).forEach(key => {
    const match = key.match(/^extra_w(\d+)_s(\d+)$/);
    if (!match) return;
    // Ignorer les clés _done, _km, _perf — garder uniquement l'objet séance
    try {
      const session = JSON.parse(state[key]);
      if (!session.sched_day || !session.sched_time) return;
      if (session.type === 'rest') return;
      const ws = parseInt(match[1]);
      const ei = parseInt(match[2]);
      const [h, m] = session.sched_time.split(":").map(Number);
      const weekStart = getWeekStartDate(ws);
      const eventDate = new Date(weekStart);
      eventDate.setDate(weekStart.getDate() + (session.sched_day - 1));
      eventDate.setHours(h, m, 0, 0);
      const title = typeToTitle[session.type] || "Run - EF";
      const parts = (session.d || '').split('|');
      const desc = [`${session.km} km`, parts[1]||''].filter(Boolean).join(' · ');
      events.push(buildEvent(`extra_w${ws}_s${ei}`, title, desc, eventDate, 60));
    } catch(e) {}
  });

  Object.keys(state).forEach(key => {
    const match = key.match(/^rf(\d+)r(\d+)sched$/);
    if (!match) return;
    try {
      const sched = JSON.parse(state[key]);
      if (!sched.day || !sched.time) return;
      const ws = parseInt(match[1]);
      const r = parseInt(match[2]);
      const [h, m] = sched.time.split(":").map(Number);
      const weekStart = getWeekStartDate(ws);
      const eventDate = new Date(weekStart);
      eventDate.setDate(weekStart.getDate() + (sched.day - 1));
      eventDate.setHours(h, m, 0, 0);
      events.push(buildEvent(`renfo_w${ws}_r${r}`, `Renfo ${r}`,
        r === 1 ? 'Ischio-fessiers · 6 exercices' : 'Bas du dos · 5 exercices', eventDate, 30));
    } catch(e) {}
  });

  const vtimezone = [
    'BEGIN:VTIMEZONE','TZID:Europe/Paris',
    'BEGIN:STANDARD','DTSTART:19701025T030000','TZOFFSETFROM:+0200','TZOFFSETTO:+0100','TZNAME:CET','RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10','END:STANDARD',
    'BEGIN:DAYLIGHT','DTSTART:19700329T020000','TZOFFSETFROM:+0100','TZOFFSETTO:+0200','TZNAME:CEST','RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3','END:DAYLIGHT',
    'END:VTIMEZONE'
  ].join('\r\n');

  const ics = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Prepa Marathon//FR','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Prépa Marathon','X-WR-TIMEZONE:Europe/Paris', vtimezone, ...events,'END:VCALENDAR'].join('\r\n');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="prepa-marathon.ics"');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.send(ics);
});

// ── COACH IA ──────────────────────────────────────────────────────────────────

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function callAnthropic(apiKey, system, messages, maxTokens) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: maxTokens,
      system,
      messages
    })
  });
  const data = await response.json();
  console.log('Anthropic status:', response.status, 'data:', JSON.stringify(data).substring(0, 300));
  return data.content?.[0]?.text || null;
}

exports.analyzeSession = onRequest(
  { secrets: [ANTHROPIC_API_KEY] },
  async (req, res) => {
    corsHeaders(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try {
      const { sessionData, historyData, planContext } = req.body;
      const system = `Tu es le coach running personnel de Guillaume. Tu analyses ses séances de manière experte, honnête et personnalisée.

PROFIL DE GUILLAUME :
- Sportif depuis toujours, mais course à pied sérieuse depuis février 2026 (plan structuré). Avant : quelques mois de course aléatoire en 2025.
- Objectif : Sub 4h au marathon du 18 octobre 2026 (allure cible ~5'40/km). Objectif intermédiaire : Semi-Marathon Bois d'Arcy le 7 septembre 2026 (S27) — vrai événement avec dossard. À partir de S24, mentionner si pertinent. S26 = décharge avant le semi.
- Très motivé, veut progresser vite sans se blesser. A eu une légère douleur rotule en S2 suite à surcharge (30km) → résolu immédiatement avec réduction + kiné. Renfo kiné 2x/semaine depuis.
- Chaque lundi midi : séance bodyhit (électrostimulation) full body avec focus jambes.
- Pas d'autres problèmes médicaux.
- FC max : 196 bpm. FC repos : voir fc_repos_context dans planContext (valeur datée et historique). Zone EF : 140-148 bpm (72-76% FCmax). En dessous de 140 = trop facile. Au-dessus de 148 = sort de la zone EF, la séance ne compte pas pour le calcul allure marathon. FC repos > 55 bpm = signe possible de fatigue accumulée ou surmenage.
- RÈGLE FC REPOS : utiliser fc_repos_context.valeur_actuelle comme valeur du jour (date dans date_mesure). Ne JAMAIS confondre une valeur historique basse (ex: 48 bpm il y a 3 jours) avec la valeur actuelle. stats_7j.moyenne = référence de base. alerte_fatigue = signal prioritaire si présent.
- Montre GPS : Garmin Forerunner 165. Données précises et fiables. La FC optique peut avoir un léger décalage en début de séance (~2-3 min).
- VACANCES SRI LANKA S22-S23 (31 juillet - 14 août) : chaleur/humidité extrêmes, décalage +3h30. Allures naturellement plus lentes de 30-60 sec/km. Ne pas pénaliser les allures pendant ces semaines. Encourager hydratation +++, sorties matinales.
- Si des infos_importantes_Guillaume sont présentes dans planContext, tiens-en compte.

RÈGLES DE COMMUNICATION :
- Français uniquement. Zéro #. Parle comme un vrai coach, naturellement.
- Concis : 4 à 6 blocs maximum, séparés par une ligne vide.
- Honnête avant tout : ne dis pas "bravo" si ce n'est pas mérité.

FORMAT VISUEL OBLIGATOIRE :
- Commence chaque bloc par un émoji thématique adapté au contenu :
  ✅ bonne nouvelle, validation, ce qui va bien
  ⚠️ alerte, point de vigilance, risque
  📅 séance à venir, planning, horaire
  💡 conseil, astuce, recommandation
  📈 progression, amélioration
  🔥 performance, effort intense
  😤 trop rapide, erreur à corriger
  🧘 récupération, décharge, repos
- Mets en **gras** (avec **) les données chiffrées importantes : allures, FC, distances, durées. Ex: **5'48/km**, **FC 144**, **9 km**, **4×10 min**.
- Une ligne vide entre chaque bloc pour aérer.
- Pas de tirets de liste — texte fluide uniquement.

RÈGLES COMPORTEMENTALES :
- Si séance trop facile (allure lente, FC basse) : dis-le, pousse Guillaume à se challenger.
- Si séance trop dure (allure rapide, FC haute) : alerte sur risque de surmenage, conseil concret.
- Si bien exécutée : félicite factuellement + 1 axe d'amélioration.
- Toujours 1 conseil actionnable pour la prochaine séance du même type.
- Si tendance sur plusieurs semaines visible : mentionne-la.

RÈGLES DE COHÉRENCE — OBLIGATOIRES :
- Ne jamais inventer de chiffres. Utiliser UNIQUEMENT les données fournies dans sessionData et historyData.
- Si tu mentionnes la prochaine séance et son horaire, vérifie que cet horaire est dans le futur par rapport à la date de la séance validée.
- Récupération bodyhit lundi midi : si la prochaine séance est lundi soir, signaler le délai court (moins de 8-10h).
- Cohérence des calculs de récupération : si tu dis 'tu auras X heures de repos', vérifier que le calcul est correct avec les heures réelles mentionnées.
- Ne jamais recommander une séance intense (Tempo) dans les 36h suivant une autre séance intense.
- DONNÉES OBJECTIVES vs RESSENTIS : Les données Strava sont la vérité. Mais la FC brute seule ne suffit pas — TOUJOURS vérifier sessionData.meteo avant d'évaluer la FC. Si FC = 155 en EF à 30°C (elevation_fc = +10), FC effective = 145 → dans la zone → séance valide. Si FC = 155 en EF à 18°C (pas de chaleur), séance hors zone de 7 bpm → le dire clairement. Ne jamais critiquer une FC > 148 sans d'abord appliquer la correction thermique.
- HISTORIQUE COMPLET : La section "HISTORIQUE COMPLET SÉANCES AVEC DONNÉES STRAVA" contient TOUTES les séances validées depuis S1, avec pour chaque séance : allure, FC, durée, données Strava (cadence, FCmax, dénivelé, meilleur 400m, calories, splits km par km), et blocs tempo pour les séances Tempo. Tu as accès à tout cet historique — utilise-le pour identifier des tendances sur plusieurs semaines, comparer les progressions, et personnaliser les conseils.
- DONNÉES STRAVA ENRICHIES : Si sessionData.strava est présent, utiliser TOUTES ces données pour enrichir l'analyse. Champs disponibles :
  • cadence_moy : normale entre 170-180 spm. En dessous de 165 = foulée trop longue → conseil technique. Entre 165-170 = passable. Au-dessus de 175 = bonne cadence.
  • fcMax : FC maximale atteinte pendant la séance. Comparer avec FCmax théorique (196 bpm). Si > 85% FCmax (166 bpm) en EF EN CONDITIONS NORMALES = problème. En chaleur (> 28°C), appliquer la correction thermique : FCmax effective = FCmax mesurée - elevation_fc_bpm. Seuil d'alerte réel = FCmax effective > 85% de 196 bpm.
  • denivele_pos : contextualiser l'allure (dénivelé élevé = allure plus lente = normal).
  • best_400m : meilleur effort sur 400m converti en allure /km — indicateur de vitesse maximale. Utile pour évaluer la progression de la vitesse pure.
  • calories : énergie dépensée. Contextualiser selon la durée.
  • blocs_tempo : allure réelle de chaque bloc tempo (ex: bloc1=4:55/km, bloc2=5:02/km). Si présent, utiliser ces valeurs OBLIGATOIREMENT pour évaluer si les blocs étaient dans la plage cible — ne jamais utiliser l'allure globale pour évaluer les blocs.
  • splits_par_km : tableau détaillé km par km avec allure et FC. OBLIGATOIRE de l'utiliser si présent :
    - Lister EXPLICITEMENT la FC et l'allure de chaque km quand Guillaume demande le détail
    - Détecter la dérive cardiaque (FC qui monte progressivement = fatigue)
    - Détecter l'irrégularité d'allure (écarts > 15 sec/km entre kms)
    - Mentionner le km le plus rapide et le plus lent
    - Si Guillaume demande "FC par km" ou "splits" : répondre avec les valeurs exactes du tableau
  • note_coach : observations pré-calculées — les utiliser directement, ne pas recalculer.
  IMPORTANT : Ne jamais dire "je n'ai pas accès aux splits" si sessionData.strava.splits_par_km est présent. Les données sont là — les utiliser.
- SIGNES D'ALERTE : Si sessionData contient une mention de douleur ou si la FC est anormalement haute (>165 en EF), signaler en premier bloc de l'analyse avec protocole : réduire, surveiller 48h, consulter si persistance.
- ALLURE CIBLE DYNAMIQUE : Utiliser l'allureMarathonUpdate si présent dans le contexte, sinon calculer depuis l'allure EF actuelle. Ne jamais utiliser 5'40/km comme valeur fixe sans vérifier.
- ÉCART SUB4H : Si ecart_sub4h est dans sessionData, mentionner le statut brièvement en fin d'analyse. Ex : 'Tu es à X sec/km de ton objectif Sub4h.' — 1 phrase max, factuel, pas de dramatisation.
- SÉANCE DANS SON CONTEXTE : Chaque séance doit être commentée EN RELATION avec la semaine en cours (charge totale, où on en est dans le cycle). Ne pas analyser une séance isolément si des données historiques sont disponibles.

RÈGLES TECHNIQUES :
- Tempo — RÈGLE CRITIQUE SUR L'ALLURE : Une séance Tempo de Guillaume se structure TOUJOURS ainsi : échauffement EF + blocs rapides (tempo) + récupération EF entre les blocs + retour au calme EF. L'allure affichée (ex: 5'30/km) est donc une MOYENNE GLOBALE sur toute la séance, incluant les phases EF lentes. Cette allure globale ne représente PAS l'allure des blocs tempo.

  Pour estimer l'allure réelle des blocs tempo, tu dois faire le calcul toi-même :
  Exemple concret : séance "2×10 min tempo" sur 10 km en 5'30/km global.
  - Temps total = 10 km × 5'30 = 55 minutes
  - Blocs tempo = 2×10 min = 20 minutes à allure rapide (ex: 4'50/km)
  - Distance tempo = 20 min ÷ 4'50 ≈ 4.1 km
  - Distance EF = 10 - 4.1 = 5.9 km
  - Temps EF = 55 - 20 = 35 minutes → allure EF = 35 min ÷ 5.9 km ≈ 5'56/km
  → L'allure globale 5'30 est donc NORMALE et CORRECTE pour cette séance.

  NE JAMAIS dire que l'allure globale d'une séance Tempo est "trop rapide" ou "trop lente" sans avoir fait ce calcul. Une allure globale de 5'20-5'40 sur une séance Tempo est typiquement normale. C'est l'allure des BLOCS qui compte, pas la moyenne globale.
  La FC fournie est aussi une moyenne globale (phases EF + blocs mélangés) — ne pas l'interpréter comme la FC des blocs tempo uniquement.
- EF/Long — FC ET CHALEUR — RÈGLE CRITIQUE :
  La zone EF standard est 140-148 bpm (calibrée pour 15-20°C). En cas de chaleur, la FC s'élève naturellement de X bpm : le cœur pompe plus de sang vers la peau pour refroidir le corps (thermorégulation), sans que l'effort musculaire augmente. Ce phénomène est normal et documenté scientifiquement (Cheung, Périard).

  BARÈME D'ÉLÉVATION FC PAR CHALEUR (ressenti) :
  • 20-25°C : +0 à +3 bpm → zone EF effective 140-151 bpm
  • 25-28°C : +3 à +6 bpm → zone EF effective 143-154 bpm
  • 28-30°C : +5 à +8 bpm → zone EF effective 145-156 bpm
  • 30-33°C : +8 à +12 bpm → zone EF effective 148-160 bpm
  • 33-35°C : +12 à +15 bpm → zone EF effective 152-163 bpm
  • > 35°C   : +15 à +20 bpm → zone EF effective 155-168 bpm
  • Humidité > 70% : ajouter +3 à +5 bpm supplémentaires (évaporation bloquée)

  COMMENT APPLIQUER : si sessionData.meteo est présent :
  1. Lire meteo.impact_performance.elevation_fc_bpm (valeur calculée précisément)
  2. FC effective = FC mesurée - elevation_fc_bpm
  3. Si FC effective ≤ 148 → séance DANS la zone EF même si FC brute > 148 → NE PAS PÉNALISER
  4. Si FC effective > 148 → séance hors zone EF → signaler l'écart réel (FC effective - 148)

  EXEMPLE CONCRET avec Guillaume :
  FC mesurée = 155 bpm | Ressenti = 30°C | Humidité = 65% → elevation_fc = +10 bpm
  → FC effective = 155 - 10 = 145 bpm → DANS la zone EF ✅ → "Ta FC de 155 bpm est normale à 30°C — ça correspond à 145 bpm en conditions fraîches, parfaitement dans ta zone EF."

  INTERDICTION ABSOLUE : Ne jamais écrire "ta FC de 155 dépasse la zone EF de 7 bpm" sans avoir d'abord vérifié la météo et appliqué la correction thermique.
  Si sessionData.meteo est absent mais que la séance date d'été (juin-septembre) : supposer une élévation probable de +5 à +8 bpm et mentionner l'incertitude.

  SEUIL D'ALERTE RÉEL (après correction) : FC effective > 160 bpm en EF même en chaleur = effort trop intense → signaler.
- Tempo — RÈGLE CRITIQUE SUR L'ALLURE : Une séance Tempo se structure TOUJOURS : échauffement EF + blocs rapides + récup EF entre blocs + retour calme EF. L'allure affichée (ex: 5'30/km) est une MOYENNE GLOBALE incluant les phases EF. Elle ne représente PAS l'allure des blocs tempo. Pour évaluer si les blocs étaient bien exécutés, il faut déduire : si la séance fait 10 km en 5'30 avec 2×10 min de blocs, le reste est en EF. Une allure globale de 5'20-5'40 sur une séance Tempo est NORMALE. Ne jamais dire "trop rapide" ou "trop lent" sur l'allure globale d'une Tempo sans avoir fait ce calcul. La FC fournie est aussi une moyenne globale.
- COMPARAISON D'ALLURES — RÈGLE ABSOLUE : Ne jamais comparer l'allure d'une séance EF avec l'allure d'une séance Tempo, et inversement. Ce sont des types de séances totalement différents avec des allures cibles différentes. Toujours comparer EF avec EF, Tempo avec Tempo, Long avec Long. Si Guillaume fait 5'48/km en EF après un Tempo à 5'10/km, ce n'est pas "plus lent" — c'est normal et attendu.
- ALLURE EF CIBLE — RÈGLE ABSOLUE : L'allure EF de Guillaume ÉVOLUE en permanence selon sa progression. Il n'existe PAS d'allure EF 'standard' fixe. L'allure cible est UNIQUEMENT celle fournie dans consignes_ef_semaine ou allure_ef du contexte actuel. Ne JAMAIS inventer une fourchette (ex: 6'14-6'34) ni utiliser une ancienne allure des mémos pour critiquer une séance récente. Si allure_ef = 5'54/km dans le contexte, 5'54/km EST la cible correcte aujourd'hui — une séance réalisée à cette allure est PARFAITE. Ne jamais dire 'trop vite' si Guillaume respecte les consignes actuelles.
- COMPARAISON ALLURE RÉALISÉE vs CIBLE — RÈGLE ABSOLUE :
  Pour calculer l'écart entre l'allure réalisée et l'allure cible, TOUJOURS utiliser les secondes réelles :
  Écart = |(min_réalisé × 60 + sec_réalisé) - (min_cible × 60 + sec_cible)| secondes/km
  Exemple : allure réalisée 5'53/km (353 sec) vs cible 5'56/km (356 sec) → écart = 3 sec → "3 secondes plus rapide que la cible"
  
  INTERDICTION ABSOLUE : Ne JAMAIS utiliser la valeur meteo.impact_performance.ralentissement (ex: "10-20 sec/km") pour décrire l'écart entre allure réalisée et allure cible.
  Cette fourchette est une ESTIMATION DE PLANIFICATION (différence attendue vs conditions fraîches à 15°C), pas la vraie différence entre les deux allures de la séance.
  
  ERREUR TYPIQUE À NE JAMAIS FAIRE : "Tu es 10-20 sec/km plus lent que ta cible" si la météo dit "ralentissement 10-20 sec/km" → FAUX. Calculer la vraie différence depuis les chiffres.
  CORRECT : "Tu as couru à 5'53/km, ta cible était 5'56/km → 3 sec/km plus rapide que la cible — excellent dans ces conditions." 
- SEMI-MARATHON : Si semi_marathon est dans planContext et CW >= 24, mentionner le compte à rebours sur les séances longues et bilans. S26 = décharge avant le semi.
- HISTORIQUE : Si resume_dernieres_semaines dans planContext, utiliser pour identifier les tendances (ex: progression allure EF sur 4 semaines).
- TENDANCE FC : Si tendance_fc_ef dans planContext et MONTANTE, signaler en début d'analyse.
- PROJECTION : Si projection_sub4h dans planContext, mentionner l'écart Sub4h en fin d'analyse.
- SÉANCES SUPPRIMÉES : Si seances_supprimees dans planContext, en tenir compte dans l'analyse de charge.
- ABSENCES : Si absences_semaine dans planContext, contextualiser (km réduits = normal).
- BODYHIT : Utiliser bodyhit_semaine.statut et bodyhit_semaine.jour pour le jour réel. Ces champs tiennent déjà compte des reports dans les mémos (bodyhit_semaine.note). Ne jamais dire 'pas de bodyhit cette semaine' si bodyhit_semaine.fait=true. Si note contient 'Report mémos', c'est le jour indiqué qui fait foi.
- SEMAINE SUIVANTE : Si semaine_suivante est dans planContext, l'utiliser pour contextualiser (ex: "ta S10 sera à 30km — charge qui monte").
- CHAUSSURE : Si chaussure est dans sessionData et que les chaussures sont dans planContext, vérifier l'usure. Si la chaussure approche ou dépasse 80% de sa durée de vie, le signaler à Guillaume. Si la chaussure vient de changer vs les séances précédentes (différente du dernier historyData), le mentionner comme facteur possible sur l'allure.
- GELS : S'entraîner avec les gels dès 12km. Protocole exact : 12km=1 gel à 6km · 16km=2 gels à 6&12km · 20km=3 gels à 6,12&17km · 24km=4 gels à 6,12,17&22km · 28km=5 gels à 6,12,17,22&26km · Marathon=8 gels. À partir de S20, rappeler ce point sur les longues sorties.
- GRAPHIQUES INTEGRES - REGLE ABSOLUE : L'interface affiche automatiquement le bon graphe apres ta reponse. INTERDICTIONS STRICTES : (1) Ne JAMAIS faire de liste de donnees brutes. (2) Ne JAMAIS utiliser des blocs code ou backticks. (3) Ne JAMAIS faire de tableau ASCII avec des donnees ligne par ligne. (4) Ne jamais dire je ne peux pas generer de graphique. TON ROLE : ecrire UNIQUEMENT 2-3 phrases d'analyse avec les chiffres cles en **gras**. Exemple correct : Ta FC EF est stable entre **144-147 bpm** depuis S3, parfaitement dans la zone **140-148 bpm**. Le graphe s'affiche automatiquement. Ne fais RIEN d'autre.
- RÔLE DE COACH ACTIF : Ton rôle ne se limite pas à analyser — tu dois aussi PROPOSER des ajustements concrets du plan. Guillaume voit un bouton dans l'interface pour appliquer ta suggestion en 1 clic — tu n'as rien de technique à faire, juste formuler clairement avec les mots "je te suggère", "je propose", "passe cette séance", "réduis", etc.

- ESPRIT CRITIQUE SUR LE PLAN — RÈGLE FONDAMENTALE : Guillaume a construit ce plan lui-même. Il n'est pas parfait. Quand il demande si son plan est bien, risqué, ou s'il peut être amélioré : ANALYSE OBLIGATOIRE avec les données réelles de plan_futur (champs km_total, hausse_vs_precedente_pct, km_tempo), puis PROPOSITIONS si nécessaire.

CHECKLIST D'ANALYSE (6 points, cite les valeurs exactes) :
  ① hausse_vs_precedente_pct > 10% ? → surcharge, cite semaine + % exact
  ② km_total semaines DÉCHARGE = 60-70% des adjacentes ? → cite les 3 km_total
  ③ km_tempo/km_total > 25% ? → surcharge intensité, cite semaine + %
  ④ Progression blocs dans detail_allure (2×8→2×12→3×10...) ? → stagnation = problème
  ⑤ Sorties longues S12+ avec blocs AM ? → sinon manque d'allure marathon
  ⑥ hausse_vs_precedente_pct > 15% sur 2 semaines consécutives ? → risque blessure

FORMAT : ✅ [point] : valeur OK | ⚠️ [point] : valeur → solution (km avant → km après)
INTERDIT : "c'est bien équilibré" sans vérifier les 6 points. INTERDIT : inventer des km.

- RÉPONSE AUX QUESTIONS DE CRITIQUE DU PLAN : vérifie les 6 points ci-dessus avec les valeurs exactes du plan_futur. Si ⚠️ : propose immédiatement la modification avec km_total avant/après. Si tout ✅ : expliquer avec les chiffres + 1 conseil prioritaire.

- PLANIFICATION SEMAINES FUTURES : Quand Guillaume demande de planifier une séance, ta réponse DOIT contenir une de ces formulations : 'je planifie', 'c est note', 'je note dans ton plan'. Obligatoire : terminer par 'C est note dans ton plan.' ou 'Je planifie ta seance au mardi 12h00.' pour que le bouton de confirmation apparaisse.

- AUTO-CORRECTION INTERDITE — RÈGLE ABSOLUE : Ne JAMAIS t'auto-corriger sur des erreurs que tu n'as pas commises dans la conversation actuelle. INTERDIT : dire 'j'ai fait une erreur', 'je me suis trompé', 'j'ai dit n'importe quoi' sauf si tu as réellement donné une valeur incorrecte dans CE fil. Ne jamais inventer des allures ou chiffres que tu aurais prétendument donnés. Si type_semaine = NORMALE → semaine de charge, point final.

- COMPORTEMENT LORS DE DEMANDES RÉPÉTÉES — RÈGLE ABSOLUE : Ne jamais compter le nombre de fois que Guillaume fait une demande, ne jamais mentionner qu'il répète une demande, ne jamais dire 'déjà fait', 'encore une fois', 'troisième fois', 'en boucle' ou exprimer de l'impatience, de l'énervement ou de la frustration. Guillaume peut changer d'avis autant de fois qu'il veut sur ses horaires — c'est son droit. Ton rôle est de confirmer chaque modification avec le même enthousiasme, sans commenter le nombre de changements.

- RAISONNEMENT TEMPOREL — RÈGLE DE SÉCURITÉ ABSOLUE : Avant de proposer une séance un jour donné, vérifie EXPLICITEMENT dans ta tête :
  1. Quel jour est-on aujourd'hui ? (utilise date_reelle.jour dans le contexte)
  2. Quels jours sont ENCORE DISPONIBLES cette semaine ?
  3. Si Guillaume mentionne une contrainte (ex: départ vendredi, réunion jeudi, voyage samedi), ce jour et les jours APRÈS sont BLOQUÉS.
  Exemple CORRECT : Guillaume part vendredi → jours disponibles = lundi, mardi, mercredi, jeudi SEULEMENT. Dimanche = après le départ = impossible.
  Exemple ERREUR À NE JAMAIS FAIRE : 'fais la sortie dimanche, ça te laisse le weekend pour récupérer avant ton départ vendredi' — FAUX car dimanche est après vendredi.
  TOUJOURS raisonner dans l'ordre chronologique des jours : lundi → mardi → mercredi → jeudi → vendredi → samedi → dimanche.
  En cas de doute sur les jours disponibles, DEMANDE CONFIRMATION plutôt que de proposer quelque chose d'impossible.

- QUAND GUILLAUME DEMANDE UNE MODIFICATION — RÈGLE ABSOLUE : Quand Guillaume demande explicitement de modifier une séance (changer les km, l'heure, le jour, les blocs, l'allure, etc.), tu DOIS TOUJOURS proposer la modification, même si tu penses que c'est une mauvaise idée. Format obligatoire en 2 parties :
  1. Une phrase courte sur ton avis (si tu es contre) — maximum 1-2 phrases, pas de long discours
  2. La proposition de modification quand même : "Je te propose quand même de passer ta séance à 10 km si tu le souhaites."
  Guillaume est adulte et décide. Ton rôle est de l'informer ET de lui laisser le choix, pas de refuser.
- SEMI-MARATHON BOIS D'ARCY — RÈGLE : À partir de S24, si semi_marathon est dans le contexte, mentionner le compte à rebours dans les analyses de séances longues et les bilans. S26 = décharge obligatoire avant le semi. Pendant la course (S27) : partir à allure marathon (~5'40/km) les 10 premiers km, accélérer si les jambes suivent. Après le semi : récupération 5-7 jours avant de reprendre l'intensité. Tester les gels en condition réelle pendant le semi.

- PÉRIODISATION — SEMAINES DE DÉCHARGE FIXES : Les semaines de décharge sont UNIQUEMENT S8, S12, S16, S20, S26, S30. RÈGLE DE SORTIE ABSOLUE : si type_semaine dans le contexte contient "NORMALE", tu dois écrire "charge" dans ton titre — JAMAIS "décharge". Si tu écris "décharge" pour une semaine dont type_semaine="NORMALE", c'est une erreur grave. S9, S10, S11 sont des semaines de CHARGE. Phases : S1-S8=base aérobie, S9-S16=montée charge+Tempo, S17-S24=spécifique marathon, S25-S31=affûtage, S32=marathon.
- JOURS ET HORAIRES — RÈGLE ABSOLUE : Pour connaître le jour et l'heure d'une séance, tu dois UNIQUEMENT lire le champ seances_restantes_semaine dans les données. Le format est "TYPE - Titre Xkm → Jour HH:MM". Exemple : "LONG - Séance EF longue 9km → Ven 10:00" signifie vendredi à 10h00. Tu dois lire EXACTEMENT ce qui est écrit après "→". Ne JAMAIS déduire, calculer ou inventer un jour toi-même. Si Guillaume demande "c'est quand ma prochaine séance", tu lis seances_restantes_semaine et tu réponds avec le jour et l'heure qui y sont écrits, mot pour mot. Si la séance affiche "⚠️ horaire non planifié", alors et seulement alors tu dis que l'horaire n'est pas encore planifié.
- Si allureMarathonUpdate présent : mentionner le changement d'allure marathon.
- RENFO : Si renfoStatus dans planContext contient 'à faire (JourX à HhXX)', mentionner le jour et l'heure planifiés précisément. Si pas d'horaire, dire 'à planifier'. Ne jamais inventer un horaire de renfo. Si séance renfo pas encore faite en milieu de semaine, le signaler avec le créneau exact.
- Si seancesAVenir présent dans sessionData : termine en mentionnant brièvement la prochaine séance (1 phrase max). RÈGLE ABSOLUE : le champ heures_avant_seance contient déjà le calcul exact — COPIER cette valeur telle quelle, NE JAMAIS la recalculer ni l'estimer. Ex: si heures_avant_seance='30h avant cette séance', écrire 'tu as 30h de récup'. Ne PAS soustraire les heures toi-même. Ne PAS confondre avec le temps depuis la dernière séance. Le champ jourSeanceValidee = jour de la séance validée.
- DATE RÉELLE SÉANCES — RÈGLE : Guillaume valide parfois ses séances en décalé. Le champ date_reelle dans historyData indique la vraie date. Utiliser pour les calculs de récup — ne pas supposer que la séance a été faite le jour planifié.
- Si chatHistoriqueRecent présent : tiens compte du contexte récent (ressentis, remarques de Guillaume) pour personnaliser l'analyse.
- GELS À L'ENTRAÎNEMENT : Protocole complet selon distance : 12km→1 gel à 6km · 16km→2 gels à 6&12km · 20km→3 gels à 6,12&17km · 24km→4 gels à 6,12,17&22km · 28km→5 gels à 6,12,17,22&26km · Marathon→8 gels. S'entraîner avec les gels dès 12km pour habituer le système digestif. Si Guillaume valide une longue sortie ≥12km, lui demander s'il a pris des gels. À partir de S20, rappeler systématiquement le protocole.
- PÉRIODISATION DU PLAN — RÈGLE ABSOLUE : Les semaines de décharge sont UNIQUEMENT S8, S12, S16, S20, S26, S30. Ne JAMAIS appeler une autre semaine 'semaine de décharge', même si le volume paraît réduit. Une variation de volume d'une semaine à l'autre n'est pas une décharge — seules les semaines listées ci-dessus le sont. Le champ type_semaine dans le contexte est la seule source de vérité : s'il vaut 'normale', c'est une semaine de CHARGE. Ne jamais contredire ce champ ni déduire le type depuis le volume. Phases du plan : S1-S8=base aérobie (EF dominant), S9-S16=montée en charge + introduction Tempo, S17-S24=développement spécifique marathon (Tempo longs, sorties longues), S25-S31=affûtage et préparation finale, S32=marathon. Quand tu analyses une séance, replace-la dans son contexte de phase si pertinent.`;
      const chatCtx = (req.body.chatHistoriqueRecent||[]).length > 0
        ? '\nDerniers échanges chat avec Guillaume (contexte récent): ' + JSON.stringify(req.body.chatHistoriqueRecent)
        : '';
      // Formatter les données Strava explicitement pour éviter les hallucinations
      let stravaSection = '';
      if(sessionData && sessionData.strava) {
        const st = sessionData.strava;
        stravaSection = '\n\n=== DONNÉES STRAVA RÉELLES (VÉRITÉ ABSOLUE — NE PAS INVENTER D\'AUTRES VALEURS) ===';
        const _cad = st.cadence || st.cadence_moy || null;
        const _fcMax = st.fcMax || st.fc_max || null;
        const _splitsRaw = st.splits || st.splits_par_km || null;
        const _splits = _splitsRaw ? _splitsRaw.filter(sp => sp.distanceKm === undefined || sp.distanceKm >= 0.5) : null;
        if(_cad) stravaSection += `\nCadence moyenne : ${_cad} spm`;
        if(_fcMax) stravaSection += `\nFC max : ${_fcMax} bpm`;
        if(st.denivele_pos != null) stravaSection += `\nDénivelé positif : ${st.denivele_pos} m`;
        if(st.denivele_neg != null) stravaSection += `\nDénivelé négatif : ${st.denivele_neg} m`;
        if(st.calories) stravaSection += `\nCalories brûlées : ${st.calories} kcal`;
        if(st.best_400m) stravaSection += `\nMeilleur 400m : ${st.best_400m}/km`;
        if(st.puissance_moy) stravaSection += `\nPuissance moyenne : ${st.puissance_moy} W`;
        if(_splits && _splits.length > 0) {
          stravaSection += '\nSplits par km (VALEURS EXACTES — les citer telles quelles si Guillaume demande) :';
          _splits.forEach(sp => {
            stravaSection += `\n  km ${sp.km} : ${sp.allure || '—'}/km · FC ${sp.fc || '—'} bpm`;
            if(sp.denivele) stravaSection += ` · D+${sp.denivele}m`;
          });
        }
        const _notes = st.note_coach || [];
        if(_notes.length > 0) {
          stravaSection += '\nObservations pré-calculées :';
          _notes.forEach(n => stravaSection += `\n  - ${n}`);
        }
        stravaSection += '\n=== FIN DONNÉES STRAVA ===';
        stravaSection += '\nRÈGLE ABSOLUE : Ces valeurs sont les seules correctes. Ne pas inventer d\'autres splits, FC ou allures. Si tu cites des splits, cite EXACTEMENT les valeurs ci-dessus.';
      }

      // Même chose pour seances_recentes_detail dans planContext
      let recentesSection = '';
      if(planContext && planContext.seances_recentes_detail) {
        const recentes = planContext.seances_recentes_detail;
        recentesSection = '\n\n=== HISTORIQUE COMPLET SÉANCES AVEC DONNÉES STRAVA ===';
        recentes.forEach(s => {
          recentesSection += `\n[${s.date||'?'} - S${s.semaine} ${s.type.toUpperCase()}] ${s.titre} : ${s.km}km @${s.allure||'?'}/km FC${s.fc_moy||'?'}${s.duree?' durée:'+s.duree:''}`;
          if(s.blocs_tempo && s.blocs_tempo.some(b=>b)) {
            recentesSection += ` · Blocs tempo : ${s.blocs_tempo.filter(Boolean).map((b,i)=>`bloc${i+1}=${b}/km`).join(', ')}`;
          }
          if(s.strava) {
            if(s.strava.cadence_moy || s.strava.cadence) recentesSection += ` · Cadence ${s.strava.cadence_moy||s.strava.cadence}spm`;
            if(s.strava.fc_max || s.strava.fcMax) recentesSection += ` · FCmax ${s.strava.fc_max||s.strava.fcMax}bpm`;
            if(s.strava.denivele_pos != null) recentesSection += ` · D+${s.strava.denivele_pos}m`;
            if(s.strava.best_400m) recentesSection += ` · Meilleur400m:${s.strava.best_400m}/km`;
            if(s.strava.calories) recentesSection += ` · ${s.strava.calories}kcal`;
            const splitsArr = s.strava.splits || s.strava.splits_par_km;
            if(splitsArr && splitsArr.length > 0) {
              recentesSection += '\n  Splits :' + splitsArr.map(sp => `\n    km ${sp.km} : ${sp.allure||'—'}/km · FC ${sp.fc||'—'} bpm`).join('');
            }
          }
        });
        recentesSection += '\n=== FIN HISTORIQUE ===';
      }

      const userMsg = `Séance validée: ${JSON.stringify(sessionData)}${stravaSection}\nHistorique récent (8 dernières semaines): ${JSON.stringify(historyData)}\nContexte plan: ${JSON.stringify(planContext)}${recentesSection}${chatCtx}\n\nFais une analyse naturelle et personnalisée de cette séance. Si des données Strava sont présentes dans la section "DONNÉES STRAVA RÉELLES", utilise UNIQUEMENT ces valeurs — ne les modifie pas, ne les recalcule pas.`;
      const isStreaming = req.headers['accept'] === 'text/event-stream';
      if(isStreaming) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        const streamRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY.value(), 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 500, stream: true, system, messages: [{role:'user', content: userMsg}] })
        });
        let buffer = '';
        for await (const chunk of streamRes.body) {
          buffer += Buffer.from(chunk).toString('utf-8');
          const lines = buffer.split('\n'); buffer = lines.pop();
          for(const line of lines) {
            if(!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            try {
              const parsed = JSON.parse(data);
              if(parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text)
                res.write('data: ' + JSON.stringify({token: parsed.delta.text}) + '\n\n');
              if(parsed.type === 'message_stop') res.write('data: [DONE]\n\n');
            } catch(e) {}
          }
        }
        res.end();
      } else {
        const reply = await callAnthropic(ANTHROPIC_API_KEY.value(), system, [{role:'user', content: userMsg}], 500);
        res.json({ analysis: reply || 'Analyse non disponible.' });
      }
    } catch(e) {
      console.error('analyzeSession error:', e.message);
      if(!res.headersSent) res.status(500).json({ error: e.message });
    }
  }
);

exports.coachChat = onRequest(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 120, memory: '512MiB' },
  async (req, res) => {
    corsHeaders(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try {
      const { message, history, stateContext, responseMode } = req.body;
      console.log('coachChat message:', message, '| mode:', responseMode||'chat');
      const isStreaming = req.headers['accept'] === 'text/event-stream';

      const profilGuillaume = `Tu es le coach running personnel de Guillaume. Voici tout ce que tu sais sur lui :

PROFIL DE GUILLAUME :
- Toujours été très sportif depuis petit, mais la course à pied a commencé entre février et juillet 2025 de manière aléatoire, sans plan structuré.
- Début février 2026 : premier vrai plan d'entraînement, découverte de l'EF (endurance fondamentale), approche sérieuse et méthodique.
- Très motivé, veut bien faire, progresser vite, et valider son objectif Sub 4h au marathon du 18 octobre 2026.
- Pas de problème médical chronique. En S2, mauvaise gestion de la charge (30 km) → légère douleur rotule gauche → réduction immédiate en S3 + consultation kiné → programme de renfo prescrit (2x/semaine). Problème résolu rapidement.
- Chaque lundi à 12h30 : séance de bodyhit (électrostimulation) avec un coach, travail full body avec focus jambes. Cela compte comme récupération active et renforcement complémentaire. Délai minimal avant séance intense après bodyhit = 8h (donc pas de séance dure avant 20h30 le lundi).
- FC max : 196 bpm. FC repos : voir fc_repos_context dans le contexte. Zone EF standard : 140-148 bpm (72-76% FCmax, calibrée pour 15-20°C). En dessous de 140 = trop facile.
- RÈGLE FC EN CHALEUR : la zone EF 140-148 est valable par temps frais. En cas de chaleur, la FC s'élève naturellement (thermorégulation). Barème :
  • 25-28°C : +3 à +6 bpm → zone EF effective 143-154 bpm
  • 28-30°C : +5 à +8 bpm → zone EF effective 145-156 bpm
  • 30-33°C : +8 à +12 bpm → zone EF effective 148-160 bpm
  • > 33°C   : +12 à +18 bpm → zone EF effective 152-166 bpm
  • Humidité > 70% : +3 à +5 bpm supplémentaires
  FC effective = FC mesurée - elevation_fc. Si FC effective ≤ 148 → dans la zone EF → NE PAS pénaliser. JAMAIS critiquer une FC > 148 sans vérifier la météo. Si fc_repos > 55 bpm pendant plusieurs jours = signe de fatigue.
- RÈGLE FC REPOS : fc_repos_context.valeur_actuelle = mesure du jour (date dans date_mesure). Ne JAMAIS attribuer une valeur historique (ex: record bas il y a plusieurs jours) à la date d'aujourd'hui. Utiliser stats_7j.moyenne comme référence habituelle.
- DONNÉES STRAVA : Quand le contexte contient des données Strava (splits_par_km, cadence_moy, fcMax, denivele_pos), les utiliser SYSTÉMATIQUEMENT. Si Guillaume demande la FC par km, les splits, ou le détail de sa séance → lire et citer les valeurs exactes de splits_par_km. Ne JAMAIS dire "je n'ai pas accès aux splits" si ces données sont présentes dans le contexte.
- ACCÈS AUX SÉANCES RÉCENTES : Le contexte contient un champ "seances_recentes_detail" avec les 8 dernières séances validées, incluant pour chacune : km, allure, FC moyenne, et si importé depuis Strava : cadence, FC max, dénivelé, splits par km. Utiliser ces données pour répondre aux questions sur les séances passées sans jamais dire "je n'ai pas accès" si le champ est présent.
- Montre GPS : Garmin Forerunner 165. Les données d'allure, FC, distance et durée sont donc précises et fiables (GPS + capteur optique FC au poignet). La FC optique peut avoir un léger décalage en début de séance (~2-3 min).
- Objectif du coach : guider Guillaume pour progresser vite SANS se blesser, donner des retours précis sur ses séances.
- OBJECTIF INTERMÉDIAIRE : Semi-Marathon Bois d'Arcy le 7 septembre 2026 (S27). C'est un vrai événement avec dossard — pas une séance ordinaire. À partir de S24, mentionner cet objectif dans les analyses si pertinent. La semaine S26 est une semaine de décharge qui précède ce semi — ne pas surcharger. Conseils course : partir conservateur (allure marathon ~5'40/km les 10 premiers km), accélérer si possible après. Objectif réaliste : terminer fort, tester les gels en condition réelle.
- CHAUSSURES : Le contexte contient le champ "chaussures" avec les km réels par paire, les alertes d'usure, et le champ "chaussures_plan_verite" avec les règles d'attribution. Zoom Fly uniquement à partir de S26. Utilise ces données pour les conseils de chaussures.
- DATE RÉELLE : date_reelle.complet dans le contexte contient le jour et l'heure exacts. Utilise UNIQUEMENT cette valeur — ne jamais calculer ou deviner la date courante.
- CHARGE SEMAINE : charge_semaine.realise/planifie donne les km réalisés vs planifiés. ratio_vs_precedente compare avec la semaine précédente. Utilise pour évaluer la fatigue et le suivi du plan.
- PROCHAINES SÉANCES : seances_a_venir liste les 3 prochaines séances avec jours, heures et temps de récupération. prochaines_semaines détaille le plan des 4 prochaines semaines avec horaires. Utilise systématiquement ces données quand Guillaume demande "c'est quoi ma prochaine séance" ou "qu'est-ce que j'ai cette semaine".
- Prédiction marathon : le champ prediction_marathon du contexte contient le vrai prédicteur multi-signaux (EF + Tempo + Long). Utilise TOUJOURS prediction_marathon.temps_predit comme temps estimé et prediction_marathon.allure_marathon_recommandee comme allure cible. prediction_marathon.ecart_sub4h donne l'état exact vis-à-vis du Sub-4h. Ne jamais recalculer ou inventer une prédiction différente de celle fournie dans le contexte.
- Règle de progression volume : +10% maximum de volume hebdomadaire d'une semaine à l'autre. Si le plan dépasse ce seuil, c'est normal car c'est un plan expert — ne pas l'alarmer. Mais si Guillaume demande à ajouter des km en dehors du plan, vérifier que ça ne dépasse pas +10%.
- VACANCES SRI LANKA : Guillaume part au Sri Lanka du 31 juillet au 14 août 2026 (S22 et S23). Pendant ces semaines : chaleur et humidité élevées (30-35°C, 80%+ humidité), décalage horaire +3h30 vs Paris, terrain inconnu, récupération potentiellement dégradée. Pour S22 et S23 : ne pas juger les allures avec les mêmes critères qu'en France — la chaleur ralentit naturellement de 30-60 sec/km. Encourager à courir tôt le matin, s'hydrater +++, réduire l'intensité si besoin. Ne pas s'inquiéter si les allures EF sont plus lentes. Le volume peut être réduit si fatigue du voyage.

RÈGLE ABSOLUE SUR LES KILOMÈTRES — NE JAMAIS VIOLER :
Chaque semaine dans plan_futur contient des champs pré-calculés : km_total, km_ef, km_tempo, km_long, nb_seances, hausse_vs_precedente_pct. Ces valeurs sont exactes. Tu DOIS les utiliser telles quelles. INTERDIT de sommer les kmPlan des sessions pour recalculer un total. Quand tu mentionnes un volume, cite UNIQUEMENT le champ km_total fourni. Si tu proposes d'ajouter une séance de X km : nouveau total = km_total + X. Vérifie hausse_vs_precedente_pct ≤ 10 après ajout.

DIRECTIVE CRITIQUE DU PLAN — PRIORITÉ ABSOLUE :
Guillaume a construit ce plan lui-même. Il n'est pas parfait. Quand il demande une analyse, si son plan est risqué, ou s'il peut être amélioré : ANALYSE D'ABORD avec les champs pré-calculés de plan_futur, puis PROPOSITIONS si nécessaire.

CHECKLIST D'ANALYSE (6 points, cite toujours les valeurs exactes) :
1. PROGRESSION : hausse_vs_precedente_pct > 10% quelque part ? Cite semaine + % exact.
2. DÉCHARGES : km_total semaines type_semaine=DÉCHARGE = 60-70% des adjacentes ? Cite les 3 km_total.
3. RATIO 80/20 : km_tempo/km_total > 25% ? Cite semaine + %.
4. TEMPO : progression des blocs dans detail_allure (2×8→2×12→3×10...) ? Stagnation ?
5. BLOCS AM DANS LONGUES : à partir de S12+, longues avec blocs AM ? Sinon ⚠️.
6. RISQUE : hausse_vs_precedente_pct > 15% sur 2 semaines consécutives ? → risque blessure réel.

FORMAT : ✅ [point] : [valeur OK] | ⚠️ [point] : [valeur] → [solution km_total avant → après]
Si tout ✅ : dire ce qui est solide + 1 conseil de progression prioritaire.

INTERDIT : sommer les kmPlan individuels. INTERDIT : inventer des km. INTERDIT : "c'est bien équilibré" sans vérifier les 6 points.`;

      // Vérifier si des séances ne sont pas planifiées
      const hasUnscheduled = JSON.stringify(stateContext?.seances_restantes_semaine || []).includes('non planifié');

      let modeInstructions = '';
      let maxTokens = 200;
      if(responseMode === 'plan_critique') {
        modeInstructions = `MODE ANALYSE + PROPOSITIONS PLAN : Guillaume demande une analyse de son plan ou des améliorations.

PHASE 1 — ANALYSE OBLIGATOIRE (utilise plan_futur, cite les valeurs exactes de km_total) :
① Progression : hausse_vs_precedente_pct > 10% quelque part ? Cite la semaine et le % exact.
② Décharges : km_total des semaines type_semaine=DÉCHARGE = 60-70% des adjacentes ? Cite les km_total.
③ Ratio 80/20 : km_tempo/km_total > 25% quelque part ? Cite semaine + %.
④ Tempo : progression des blocs dans detail_allure ? Stagnation ?
⑤ Blocs AM dans longues à partir de S12+ ?
✅ si OK avec valeur citée. ⚠️ si problème avec valeur exacte.

PHASE 2 — PROPOSITIONS (seulement si ⚠️ identifié) :
Format : "➜ S[X] : [problème] → [solution] (km_total actuel → km_total proposé)"
Si tout ✅ : dire ce qui est solide + 1 conseil de progression prioritaire.

RÈGLE KM ABSOLUE : utilise UNIQUEMENT km_total fourni. Ne somme JAMAIS les sessions.
900 tokens max. Terminer sur une phrase complète.`;
        maxTokens = 900;
      } else if(responseMode === 'rapport') {
const _typeSem = (stateContext?.type_semaine || '').toUpperCase();
        const _labelSem = (_typeSem.includes('DÉCHARGE') || _typeSem.includes('DECHARGE')) ? 'décharge' : 'charge';
        modeInstructions = `MODE RAPPORT : Guillaume demande un bilan ou le détail de sa semaine.
Si c'est "ma semaine" : liste TOUTES les séances prévues cette semaine (sans en oublier aucune), une par une, avec pour chacune : jour + heure, type, km, allure cible, consigne clé. Commence par un titre récapitulatif OBLIGATOIRE au format exact : "SEMAINE X — Ykm (${_labelSem})". Tu DOIS utiliser le mot "${_labelSem}" — ne déduis JAMAIS le type depuis les allures ou le volume.
Si c'est un bilan : contexte rapide → analyse données → tendance → 1 conseil concret.
Limite : 15 lignes max. Ne jamais couper une séance à mi-description.`;
        maxTokens = 800;
      } else if(responseMode === 'analyse') {
        modeInstructions = `MODE ANALYSE : Guillaume demande une comparaison, analyse de séances, ou évaluation de son plan.
LIMITE ABSOLUE : 600 tokens maximum. Calibre ta réponse dès le début pour terminer proprement — jamais de phrase coupée.
Structure : 3-4 blocs max (émoji + 1-2 phrases chacun). Arrête-toi sur une phrase complète si tu manques de place.
Cite les chiffres clés mais reste concis.
SI GUILLAUME DEMANDE UNE CRITIQUE DU PLAN : applique impérativement la règle ESPRIT CRITIQUE SUR LE PLAN. Identifie 2-4 points concrets à améliorer. Sois direct. Pas de validation creuse.`;
        maxTokens = 500;
      } else if(responseMode === 'meteo') {
        modeInstructions = `MODE MÉTÉO : Conseils running personnalisés selon la météo actuelle.
LIMITE ABSOLUE : 3 conseils courts maximum. Chaque conseil = 1 phrase. Total : 5-7 lignes grand maximum.
Format : commence chaque conseil par un émoji pertinent, 1 phrase concrète.
RÈGLE ANTI-COUPURE : calibre dès le début pour terminer sur une phrase complète. Ne commence jamais un 4ème conseil si tu ne peux pas le finir.`;
        maxTokens = 350;
      } else {
        // Détecter si c'est vraiment une question sociale (salutation, état d'esprit)
        const _msgLower = (message||'').toLowerCase();
        // Social = salutation/politesse OU message <= 2 mots (pas une vraie question)
        const _words = _msgLower.trim().split(/\s+/).filter(w => w.length > 1);
        const isSocial = /^(bonjour|salut|coucou|hello|bonsoir|bonne\s+nuit|merci|d'accord|compris|ça\s+marche|bien\s+reçu|comment\s+tu\s+vas|tu\s+vas\s+bien|tu\s+t'en\s+sors|ça\s+roule|comment\s+ça\s+va|comment\s+vas[- ]tu)/.test(_msgLower.trim())
          || ((_words.length <= 2) && !/séance|run|km|fc|allure|semaine|tempo|ef|long|marathon/.test(_msgLower));
        // Critique/amélioration du plan
        const isPlanCritique = !isSocial && /plan|s[eé]ances?.*semaine|entra[iî]n|programme|4.?[eè]me|quatre.*s[eé]ance|passer.*[34].*s[eé]ance|[34].*s[eé]ances.*semaine|ajouter|rajouter|am[eé]liorer|modifier|changer|retravailler|refaire|restructurer|proposer|proposition|suggestion|optimiser|revoir|ajuster|que.*(ferais|changerais|modifierais|ajouterais|vois|conseilles|recommandes|penses).*(plan|s[eé]ance|semaine|entra[iî]n)|est.ce.*bien|qu.est.ce.*que.*tu.*(penses|conseilles)|serait.il.*pertinent|faut.il.*ajouter|comment.*am[eé]liorer|d[eé]charge|risqu[eé]?|mois.*(prochain|suivant)|septembre|juillet|ao[uû]t|juin|prochaines.*semaines|10%|bien.*structur|v[eé]rifi|analyse.*plan/.test(_msgLower);
        if(isSocial) {
          modeInstructions = `MODE SOCIAL : Guillaume dit bonjour ou pose une question courte de politesse.
Réponds en 1 SEULE PHRASE courte et chaleureuse. INTERDICTION ABSOLUE de mentionner les séances, allures, FC, ou données d'entraînement. Juste une réponse humaine et directe.`;
          maxTokens = 120;
        } else if(isPlanCritique) {
          modeInstructions = `MODE ANALYSE + PROPOSITIONS PLAN. PHASE 1 — ANALYSE (plan_futur) : ① hausse_vs_precedente_pct > 10% ? ② Décharges km_total = 60-70% adjacentes ? ③ km_tempo/km_total > 25% ? ④ Progression blocs Tempo ? ⑤ Blocs AM longues S12+ ? ✅ valeur OK | ⚠️ valeur + solution km_total avant → après. Si tout ✅ : solide + 1 conseil. RÈGLE KM : UNIQUEMENT km_total fourni. 700 tokens max.`;
          maxTokens = 700;
        } else {
          modeInstructions = `MODE CHAT : Question de coaching simple.
Réponds en 2-3 phrases MAX. 1 conseil actionnable. Pas de bilan, pas de liste de séances sauf si explicitement demandé.`;
          maxTokens = 280;
        }
      }

      const reglesCommunes = `RÈGLES ABSOLUES : Français uniquement. Zéro #. Ton de coach exigeant mais bienveillant, honnête, pas complaisant.
ORTHOGRAPHE : Accents obligatoires. Apostrophes droites.
FORMAT VISUEL OBLIGATOIRE :
- Commence chaque bloc par un émoji : ✅ bonne nouvelle · ⚠️ alerte · 📅 planning · 💡 conseil · 📈 progression · 🔥 performance · 😤 erreur · 🧘 récupération
- Mets en **gras** les données chiffrées : allures, FC, distances. Ex: **5'48/km**, **FC 144**, **9 km**
- Une ligne vide entre chaque bloc
- Texte fluide, pas de tirets

RÈGLES DE COHÉRENCE — NE JAMAIS VIOLER :

1. DONNÉES UNIQUEMENT — Ne jamais inventer de chiffres. Si une donnée (allure, FC, km, heure, jour) n'est pas dans le contexte fourni, dis que tu ne la connais pas. Ne jamais déduire ou estimer un chiffre sans le signaler clairement.

   CALCUL ÉCART ALLURE — RÈGLE : L'écart entre deux allures se calcule TOUJOURS en secondes réelles.
   Exemple : 5'53/km vs 5'56/km → (5×60+53) - (5×60+56) = 353 - 356 = -3 sec → "3 sec plus rapide".
   Ne JAMAIS utiliser la fourchette meteo.ralentissement (ex: "10-20 sec/km") pour décrire l'écart réel entre allure réalisée et allure cible — ce sont deux choses complètement différentes.

2. VÉRIFICATION TEMPORELLE OBLIGATOIRE — Avant toute suggestion de planning, effectue mentalement ces 3 vérifications dans l'ordre :
   a) Quel jour sommes-nous ? (date_reelle.jour dans le contexte)
   b) Quelles contraintes Guillaume a-t-il mentionnées ? (départ, voyage, réunion, rendez-vous)
   c) Liste les jours RÉELLEMENT disponibles = jours après aujourd'hui ET avant toute contrainte bloquante.
   EXEMPLE : Guillaume dit 'je pars vendredi'. Nous sommes dimanche. Disponibles = lundi, mardi, mercredi, jeudi. Vendredi = départ donc fin de semaine. Samedi/dimanche = après départ = IMPOSSIBLES.
   Règle chronologique immuable : lundi < mardi < mercredi < jeudi < vendredi < samedi < dimanche. Un jour 'avant' ne peut jamais venir après un jour 'après'.

3. RÉCUPÉRATION MINIMALE ENTRE SÉANCES — Ne jamais proposer deux séances intenses (Tempo, Long) à moins de 36h d'intervalle. Minimum recommandé :
   - Après Tempo → EF possible dès 24h, nouvelle Tempo pas avant 48h
   - Après Long → repos ou EF légère minimum 24h, pas de Tempo avant 48h
   - Bodyhit lundi midi → éviter séance intense lundi soir (moins de 8h après)
   - Si contrainte horaire force une récup courte, le SIGNALER explicitement à Guillaume

4. COHÉRENCE INTERNE DE LA RÉPONSE — Avant d'envoyer ta réponse, relis mentalement :
   - Les jours proposés sont-ils dans le futur par rapport à aujourd'hui ?
   - Les jours proposés sont-ils avant toute contrainte mentionnée par Guillaume ?
   - Les temps de récupération entre séances sont-ils respectés ?
   - Les chiffres cités sont-ils cohérents entre eux (ex: 'tu cours 8h après ton bodyhit' → vérifier l'heure du bodyhit et l'heure de la séance) ?
   Si une incohérence est détectée, corrige-la dans ta réponse ou demande confirmation.

5. PRÉCISION SUR LES DURÉES — Quand tu calcules un temps de récupération, cite les heures réelles. Exemple : 'Bodyhit à 12h30, séance à 20h = 7h30 de récup — insuffisant pour une séance intense.' Ne jamais arrondir de manière trompeuse.

6. CONTRAINTES PERSONNELLES = PRIORITÉ ABSOLUE — Si Guillaume mentionne une contrainte (heure, jour, voyage, fatigue, douleur), elle prime sur toute recommandation sportive. Adapter le plan à la vie de Guillaume, pas l'inverse.

7. SIGNES D'ALERTE — PROTOCOLE IMMÉDIAT : Si Guillaume mentionne une douleur physique (genou, cheville, mollet, hanche, dos, tendon, pied), ne pas minimiser. Réponse obligatoire en 3 points : (1) nommer la zone et le risque possible, (2) recommander de réduire ou stopper, (3) suggérer repos + avis médical si la douleur persiste plus de 48h. Ne jamais dire 'c'est normal après l'effort' sans qualification.

8. SÉANCES MANQUÉES — RÈGLE CLAIRE : Si Guillaume a manqué une séance, NE JAMAIS suggérer de la rattraper en faisant 2 séances dans la même journée ou en réduisant les temps de récup. Une séance manquée = perdue. Le plan continue normalement. Exception : si c'est une séance légère (EF court < 7km) et qu'il reste 2+ jours dans la semaine, on peut la replacer. Ne jamais compresser le plan pour 'rattraper'.

9. DONNÉES OBJECTIVES vs RESSENTIS SUBJECTIFS — Les données Garmin sont objectives. Mais FC brute ≠ effort réel en cas de chaleur. Si FC = 155 et Guillaume dit 'je me sentais bien', VÉRIFIER D'ABORD la météo. Si température > 28°C → appliquer la correction thermique (voir règle FC chaleur ci-dessus). FC 155 à 30°C = FC effective 145 = dans la zone EF = SÉANCE VALIDE. FC 155 à 18°C = hors zone EF = le dire clairement. Ne jamais invalider une séance pour la FC sans avoir vérifié la météo.

10. RÉPÉTITION DE CONSEILS — Ne pas répéter le même conseil dans la même conversation si Guillaume l'a déjà entendu et acquitté. Vérifier l'historique de la conversation avant de donner un conseil récurrent (ex: allures EF). Si déjà dit, passer directement à la question posée sans répéter.

11. CHALEUR ET CONDITIONS MÉTÉO — En été (juin à septembre), si Guillaume mentionne la chaleur ou des températures > 25°C : décaler les allures EF de +15 à +30 sec/km selon la chaleur ressentie. Suggérer sorties tôt le matin (avant 8h) ou le soir (après 20h). Hydratation : signaler si la sortie dépasse 45 min sans possibilité de s'hydrater.

12. FATIGUE ACCUMULÉE — Si Guillaume mentionne plusieurs jours de fatigue, de mauvais sommeil ou de jambes lourdes sur plusieurs messages consécutifs : recommander une semaine allégée même hors cycle de décharge prévu. La récupération prime sur le plan. Mieux vaut 1 semaine light que 3 semaines de blessure.
`;

      const rappelPlanification = String(hasUnscheduled ? " Seances non planifiees." : "");

      // Construire un rappel temporel explicite basé sur la date réelle
      const dr = stateContext?.date_reelle;
      // Semaine du lundi au dimanche — ordre chronologique strict
      const joursOrdre = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
      const jourActuelIdx = dr ? joursOrdre.indexOf(dr.jour) : -1;
      // Jours restants = ceux qui viennent APRÈS aujourd'hui dans la semaine
      const joursRestants = jourActuelIdx >= 0
        ? joursOrdre.slice(jourActuelIdx + 1).join(', ')
        : '';
      const rappelTemporel = dr ? `\nContexte temporel : Nous sommes ${dr.complet}. Jours encore disponibles cette semaine : ${joursRestants || 'aucun'}. Ne propose JAMAIS une séance un jour déjà passé.` : '';

      const system = `${profilGuillaume}

${reglesCommunes}

${modeInstructions}${rappelPlanification}${rappelTemporel}`;

      const todayDate = stateContext?.date_reelle
        ? `${stateContext.date_reelle.annee}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`
        : new Date().toISOString().slice(0,10);

      // Ancrage temporel : préfixer les messages user de l'historique avec leur date
      // pour éviter que le coach confonde "cette nuit j'étais à X" d'il y a 3 jours avec hier
      const anchoredHistory = (history || []).slice(-30).map(m => {
        if(m.role === 'user' && m.date && m.date !== todayDate) {
          return { role: m.role, content: `[Message du ${m.date}] ${m.content}` };
        }
        // Nettoyer le champ 'date' non standard avant envoi à l'API
        return { role: m.role, content: m.content };
      });

      const messages = [
        ...anchoredHistory,
        { role: 'user', content: `Contexte plan et données: ${JSON.stringify(stateContext)}${(()=>{
          const recentes = stateContext && stateContext.seances_recentes_detail;
          if(!recentes || recentes.length === 0) return '';
          let s = '\n\n=== HISTORIQUE COMPLET SÉANCES AVEC DONNÉES STRAVA EXACTES ===';
          recentes.forEach(r => {
            s += `\n[${r.date||'?'} S${r.semaine} ${r.type.toUpperCase()}] ${r.titre} : ${r.km}km @${r.allure||'?'}/km FC${r.fc_moy||'?'}bpm${r.duree?' durée:'+r.duree:''}`;
            if(r.blocs_tempo && r.blocs_tempo.some(b=>b)) {
              s += ` | Blocs: ${r.blocs_tempo.filter(Boolean).map((b,i)=>`bloc${i+1}=${b}/km`).join(', ')}`;
            }
            if(r.strava) {
              if(r.strava.cadence_moy||r.strava.cadence) s += ` | Cadence:${r.strava.cadence_moy||r.strava.cadence}spm`;
              if(r.strava.fc_max||r.strava.fcMax) s += ` | FCmax:${r.strava.fc_max||r.strava.fcMax}bpm`;
              if(r.strava.denivele_pos != null) s += ` | D+:${r.strava.denivele_pos}m`;
              if(r.strava.best_400m) s += ` | Best400m:${r.strava.best_400m}/km`;
              if(r.strava.calories) s += ` | ${r.strava.calories}kcal`;
              const splitsArr = r.strava.splits || r.strava.splits_par_km;
              if(splitsArr && splitsArr.length > 0) {
                s += '\n  SPLITS EXACTS :' + splitsArr.map(sp => `\n    km ${sp.km} : ${sp.allure||'—'}/km · FC ${sp.fc||'—'} bpm`).join('');
              }
            }
          });
          s += '\n=== FIN HISTORIQUE ===\nRÈGLE : Ces valeurs sont exactes. Ne JAMAIS inventer d\'autres splits ou FC. Citer ces valeurs telles quelles si Guillaume demande.';
          return s;
        })()}\n\nQuestion: ${message}` }
      ];
      if(isStreaming) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Retry automatique sur surcharge Anthropic (529/503/429)
        const MAX_RETRIES = 3;
        let streamRes = null;
        for(let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          if(attempt > 0) {
            // Backoff exponentiel : 1s, 2s, 4s
            await new Promise(r => setTimeout(r, Math.pow(2, attempt - 1) * 1000));
            console.log(`coachChat retry attempt ${attempt + 1}`);
          }
          streamRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': ANTHROPIC_API_KEY.value(),
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: maxTokens, stream: true, system, messages })
          });
          console.log(`Anthropic coachChat attempt ${attempt + 1} status:`, streamRes.status);
          // Succès ou erreur non-retryable → sortir
          if(streamRes.ok || ![429, 503, 529].includes(streamRes.status)) break;
          const errText = await streamRes.text().catch(()=>'no body');
          console.error(`Anthropic coachChat error ${streamRes.status} (attempt ${attempt + 1}):`, errText);
        }

        if (!streamRes || !streamRes.ok || !streamRes.body) {
          const errText = streamRes ? await streamRes.text().catch(()=>'no body') : 'no response';
          console.error('Anthropic coachChat final error:', streamRes?.status, errText);
          // Envoyer un message d'erreur explicite dans le stream
          res.write('data: ' + JSON.stringify({token: 'Je suis momentanément indisponible, réessaie dans quelques secondes.'}) + '\n\n');
          res.write('data: [DONE]\n\n'); res.end(); return;
        }

        let buffer = '';
        for await (const chunk of streamRes.body) {
          buffer += Buffer.from(chunk).toString('utf-8');
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for(const line of lines) {
            if(!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if(data === '[DONE]') { res.write('data: [DONE]\n\n'); continue; }
            try {
              const parsed = JSON.parse(data);
              if(parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
                res.write('data: ' + JSON.stringify({token: parsed.delta.text}) + '\n\n');
              }
              if(parsed.type === 'message_stop') res.write('data: [DONE]\n\n');
            } catch(e) {}
          }
        }
        res.end();
      } else {
        const reply = await callAnthropic(ANTHROPIC_API_KEY.value(), system, messages, maxTokens);
        res.json({ reply: reply || 'Réponse non disponible.' });
      }
    } catch(e) {
      console.error('coachChat error:', e.message);
      if(!res.headersSent) res.status(500).json({ error: e.message });
    }
  }
);

// ── WEEKLY BRIEFING (message de bienvenue lundi généré par l'IA) ─────────────

exports.weeklyBriefing = onRequest(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 60, memory: '256MiB' },
  async (req, res) => {
    corsHeaders(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try {
      const { contextWeek } = req.body;
      const system = `Tu es le coach IA de Guillaume Lenoir. C'est lundi matin — briefing de la semaine.
Profil : FCmax 196 bpm, FC repos = voir fc_repos_context (valeur datée fournie dans le contexte), zone EF standard 140-148 bpm (à ajuster en chaleur : +8-12 bpm à 30°C). Objectif Sub 4h le 18 oct 2026. Semi-marathon Bois d'Arcy 7 sept 2026 (S27). Bodyhit chaque lundi 12h30. Renfo kiné 2x/semaine. Garmin Forerunner 165.
RÈGLE FC REPOS : utiliser fc_repos_context.valeur_actuelle comme valeur du jour. Ne jamais confondre une valeur historique basse avec la valeur actuelle. stats_7j.moyenne = référence habituelle.
RÈGLE FC CHALEUR (BILAN) : si des séances ont été réalisées en été avec FC > 148 bpm, ne pas les signaler comme hors-zone sans vérifier la température. En été (juin-sept), une FC de 150-158 bpm en EF est souvent normale si température > 28°C.
Ton message : chaleureux, motivant, personnalisé. 8-12 lignes. Texte brut, zéro **, zéro #.
Structure :
1. Titre OBLIGATOIRE : "SEMAINE X — Ykm (charge)" ou "SEMAINE X — Ykm (décharge)" selon type_semaine. RÈGLE : lire type_semaine — JAMAIS déduire depuis le volume.
2. Séances clés avec consignes allures depuis consignes_ef_semaine — JAMAIS inventer une allure.
3. Bodyhit lundi 12h30 si pertinent. Si renfo_semaine_precedente < 2/2 : le signaler.
4. Point de vigilance si fc_repos > 55 OU tendance_fc_ef montante.
5. Semaine suivante : annoncer type et km depuis semaine_suivante — ne jamais inventer.
6. Phrase de motivation finale sincère.
RÈGLES ABSOLUES :
- Utiliser consignes_ef_semaine pour les allures — jamais inventer
- Utiliser semaine_suivante pour S+1 — jamais inventer
- Si resume_dernieres_semaines présent : contextualiser la progression (ex: 'tu passes de Xkm à Ykm')
- Si tendance_fc_ef MONTANTE : signaler en point de vigilance
- Si projection_sub4h présent : mentionner l'écart Sub4h en 1 phrase
- Si renfoStatus contient 'à faire' : rappeler les renfo cette semaine
- Si bodyhit_semaine.fait = false : rappeler le bodyhit lundi 12h30
- Si absences_semaine : adapter les conseils au voyage/absence
- Si semi_marathon présent et CW >= 24 : mentionner le compte à rebours`
      const userMsg = `Contexte semaine : ${JSON.stringify(contextWeek)}

Génère le briefing lundi matin.`;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const streamRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY.value(), 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 600, stream: true, system, messages: [{role:'user', content: userMsg}] })
      });
      let buffer = '';
      for await (const chunk of streamRes.body) {
        buffer += Buffer.from(chunk).toString('utf-8');
        const lines = buffer.split('\n'); buffer = lines.pop();
        for(const line of lines) {
          if(!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          try {
            const parsed = JSON.parse(data);
            if(parsed.type==='content_block_delta'&&parsed.delta&&parsed.delta.text)
              res.write('data: '+JSON.stringify({token:parsed.delta.text})+'\n\n');
            if(parsed.type==='message_stop') res.write('data: [DONE]\n\n');
          } catch(e) {}
        }
      }
      res.end();
    } catch(e) {
      console.error('weeklyBriefing error:', e.message);
      if(!res.headersSent) res.status(500).json({ error: e.message });
    }
  }
);

// ── WEEKLY REPORT (bilan dimanche généré par l'IA) ──────────────────────────

exports.weeklyReport = onRequest(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 60, memory: '256MiB' },
  async (req, res) => {
    corsHeaders(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try {
      const { contextBilan } = req.body;
      const system = `Tu es le coach IA de Guillaume Lenoir. C'est dimanche soir — bilan de semaine.
Profil : FCmax 196 bpm, FC repos = voir fc_repos_context (valeur datée fournie dans le contexte), zone EF 140-148 bpm. Objectif Sub 4h le 18 oct 2026. Semi-marathon Bois d'Arcy 7 sept 2026 (S27). Bodyhit lundi 12h30. Renfo kiné 2x/semaine. Garmin Forerunner 165.
RÈGLE FC REPOS : utiliser fc_repos_context.valeur_actuelle comme valeur du jour (date dans date_mesure). Ne jamais confondre une valeur historique basse avec la valeur actuelle. stats_7j.moyenne = référence habituelle. Si alerte_fatigue → le signaler.
Ton message : honnête, factuel, constructif. 8-12 lignes. Texte brut, zéro **, zéro #.
Structure :
1. Titre : "BILAN S X — Ykm réalisés / Zkm planifiés (type_semaine)". Bilan : séances faites, renfo_semaine, bodyhit_semaine_fait.
2. Points positifs : allures réalisées, séances réussies, progression vs semaines précédentes.
3. Points de vigilance : seances_manquees (nommer chaque séance ratée), fc_repos > 55, tendance_fc_ef montante.
4. Semaine suivante : utiliser semaine_suivante (type, km, nb séances) — ne jamais inventer. Donner 1 conseil d'approche.
5. Contexte objectif : temps_marathon_estime vs Sub 4h — 1 phrase.
RÈGLES ABSOLUES :
- seances_manquees : nommer chaque séance ratée sans minimiser
- seances_supprimees : mentionner si des séances ont été supprimées volontairement
- semaine_suivante : données du contexte uniquement — jamais inventer
- renfo_semaine < 2/2 : toujours signaler
- fc_repos > 55 ou tendance_fc_ef MONTANTE : signaler fatigue/surmenage possible
- resume_dernieres_semaines : comparer cette semaine aux précédentes (tendance km, allures)
- projection_sub4h : mentionner l'évolution vers l'objectif Sub4h
- Si absences_semaine : contextualiser les km réduits`
      const userMsg = `Contexte bilan : ${JSON.stringify(contextBilan)}

Génère le bilan de semaine.`;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const streamRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY.value(), 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 600, stream: true, system, messages: [{role:'user', content: userMsg}] })
      });
      let buffer = '';
      for await (const chunk of streamRes.body) {
        buffer += Buffer.from(chunk).toString('utf-8');
        const lines = buffer.split('\n'); buffer = lines.pop();
        for(const line of lines) {
          if(!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          try {
            const parsed = JSON.parse(data);
            if(parsed.type==='content_block_delta'&&parsed.delta&&parsed.delta.text)
              res.write('data: '+JSON.stringify({token:parsed.delta.text})+'\n\n');
            if(parsed.type==='message_stop') res.write('data: [DONE]\n\n');
          } catch(e) {}
        }
      }
      res.end();
    } catch(e) {
      console.error('weeklyReport error:', e.message);
      if(!res.headersSent) res.status(500).json({ error: e.message });
    }
  }
);

// ── ADD MEMO (remarque explicite de Guillaume) ───────────────────────────────

// ── QUICK BRIEF — Brief ultra-court pour tap sur notification ────────────────
// Uniquement : FC repos du jour (si saisie) + programme de la journée
exports.quickBrief = onRequest(
  {cors: true, invoker: 'public', secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 30, memory: '256MiB'},
  async (req, res) => {
    if(req.method==='OPTIONS'){res.set('Access-Control-Allow-Origin','*');res.set('Access-Control-Allow-Headers','Content-Type,Accept');res.status(204).send('');return;}
    res.set('Access-Control-Allow-Origin','*');
    try {
      const {fc_repos_today, seances_today, jour, bodyhit, renfo_today} = req.body || {};

      const fcLine = fc_repos_today
        ? `FC repos ce matin : ${fc_repos_today} bpm.`
        : null;

      const seancesLine = (seances_today||[]).length > 0
        ? (seances_today||[]).map(s => {
            const t = {ef:'EF', tempo:'Tempo', long:'EF Longue', race:'Course'}[s.type] || s.type;
            return `${t} ${s.km}km${s.heure ? ' à '+s.heure : ''}`;
          }).join(' + ')
        : `Pas de séance prévue ce ${jour||'aujourd\'hui'}`;

      const bodyhitLine = jour === 'lundi' ? 'Bodyhit 20min à 12h30 (renfo cardio).' : null;
      const renfoLine = renfo_today ? `Renfo kiné : ${renfo_today}.` : null;
      const userMsg = [
        fcLine,
        `Programme : ${seancesLine}.`,
        bodyhitLine,
        renfoLine,
        'Génère un brief matinal en 3-4 phrases. Mentionne tous les éléments fournis : séance run, bodyhit/renfo si présents, FC repos si fournie.',
        'Parle UNIQUEMENT de ce qui est fourni ci-dessus.',
        fcLine ? 'Commente brièvement la FC repos.' : 'Ne mentionne PAS la FC repos.',
        'Ton direct, 1 emoji, pas de tirets ni de listes.',
        'Termine par une phrase courte d\'encouragement.'
      ].filter(Boolean).join('\n');

      const system = `Tu es le coach running de Guillaume. Brief matinal court et personnel. Maximum 4 phrases. Pas de blocs, pas de tirets, pas de recap semaine. Mentionne le renfo si present. Juste l'essentiel du jour.`;

      res.set('Content-Type', 'text/event-stream');
      res.set('Cache-Control', 'no-cache');
      res.set('X-Accel-Buffering', 'no');

      const https = require('https');
      const body = JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 200,
        stream: true,
        system,
        messages: [{role: 'user', content: userMsg}]
      });

      await new Promise((resolve, reject) => {
        const r = https.request({
          hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
          headers: {'Content-Type':'application/json','x-api-key':ANTHROPIC_API_KEY.value(),'anthropic-version':'2023-06-01'}
        }, apiRes => {
          apiRes.on('data', chunk => {
            const lines = chunk.toString().split('\n');
            for(const line of lines) {
              if(!line.startsWith('data: ')) continue;
              const d = line.slice(6).trim();
              if(d === '[DONE]') continue;
              try {
                const p = JSON.parse(d);
                if(p.type === 'content_block_delta' && p.delta?.text) {
                  res.write(`data: ${JSON.stringify({token: p.delta.text})}\n\n`);
                }
              } catch(e) {}
            }
          });
          apiRes.on('end', () => { res.write('data: [DONE]\n\n'); res.end(); resolve(); });
          apiRes.on('error', reject);
        });
        r.on('error', reject);
        r.write(body);
        r.end();
      });
    } catch(e) {
      console.error('quickBrief error:', e.message);
      res.status(500).json({error: e.message});
    }
  }
);

exports.morningBrief = onRequest(
  {cors: true, invoker: 'public', secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 90, memory: '256MiB'},
  async (req, res) => {
    if(req.method==='OPTIONS'){res.set('Access-Control-Allow-Origin','*');res.set('Access-Control-Allow-Headers','Content-Type,Accept');res.status(204).send('');return;}
    res.set('Access-Control-Allow-Origin','*');
    try {
      const {context} = req.body;
      // Le contexte ne contient que les données du jour — pas d'historique ni de semaine
      const { memos } = context || {};

      const system = `Tu es le coach running de Guillaume. Ta mission : rédiger le brief du matin, UNIQUEMENT sur la journée d'aujourd'hui.

STRUCTURE OBLIGATOIRE — exactement dans cet ordre, pas de variation :

1. ❤️ FC REPOS — commencer par ça, toujours. Donner la valeur du jour en **gras**, comparer à la moyenne 7j. Une phrase : bonne récup ou signe de fatigue.

2. 🌤️ MÉTÉO — seulement si disponible dans le contexte. Une phrase : température, conditions, impact sur la séance. Si pas de météo : passer directement au point 3.

3. 🎯 SÉANCE DU JOUR — annoncer la ou les activités prévues (run, renfo, bodyhit). Titre, distance si run, heure si connue. Une phrase claire. IMPORTANT : le renforcement musculaire (ischio-fessiers, bas du dos) est une vraie séance — ne jamais écrire "journée de récupération" si seances_du_jour contient un renfo.

4. ⚡ CONSIGNES — pour chaque activité du jour, 1 à 2 phrases max :
   - EF : allure cible en **gras**, FC cible en **gras**, rappel "si FC > 148 → ralentir"
   - Tempo : allure des blocs en **gras**, rappel structure
   - EF Longue : allure en **gras**, gels si ≥ 12km
   - Renfo ischio-fessiers ou bas du dos : nommer les exercices clés (ponts fessiers, hip thrust, nordic curls, gainage...), rappeler de progresser en séries
   - Bodyhit : "Électrostimulation full body à 12h30"

RÈGLES ABSOLUES :
- 4 blocs maximum. Jamais plus.
- INTERDIT : parler du reste de la semaine, des séances passées, du marathon, du Sub-4h.
- INTERDIT : écrire "journée de récupération" ou "aucune séance" si seances_du_jour contient quoi que ce soit.
- SI seances_du_jour est vraiment vide ET bodyhit=false : alors seulement écrire "journée de récupération".
- Ton direct, coach, sans fioritures. Pas de tirets.
- Données chiffrées en **gras**.`;

      // Message utilisateur = uniquement les données du jour
      const seancesStr = (context.seances_du_jour||[]).map(s => {
        const t = {ef:'EF', tempo:'Tempo', long:'EF Longue', renfo:'Renforcement', race:'Course'}[s.type] || s.type;
        return `${t}${s.km ? ' '+s.km+'km' : ''}${s.heure ? ' à '+s.heure : ''}${s.allure_cible ? ' — allure : '+s.allure_cible : ''}`;
      }).join(' + ') || 'Aucune séance planifiée';

      const fcLine = context.fc_repos_bpm
        ? `FC repos ce matin : ${context.fc_repos_bpm} bpm (moyenne 7j : ${context.fc_repos_moyenne_7j||'—'} bpm)${context.fc_repos_alerte ? ' ⚠️ '+context.fc_repos_alerte : ''}`
        : 'FC repos non saisie ce matin';

      const meteoLine = context.meteo
        ? `Météo : ${context.meteo.temperature}°C${context.meteo.conditions ? ' — '+context.meteo.conditions : ''}${context.meteo.conseil_chaleur ? ' — '+context.meteo.conseil_chaleur : ''}`
        : 'Météo non disponible';

      const userMsg = `${context.jour} ${context.date}

${fcLine}
${meteoLine}
Séances du jour : ${seancesStr}
Consignes : ${context.consignes_ef||''}`;

      res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});

      const streamRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY.value(), 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 600, stream: true, system, messages: [{role:'user', content: userMsg}] })
      });
      let buffer = '';
      for await (const chunk of streamRes.body) {
        buffer += Buffer.from(chunk).toString('utf-8');
        const lines = buffer.split('\n'); buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text)
              res.write('data: ' + JSON.stringify({token: parsed.delta.text}) + '\n\n');
            if (parsed.type === 'message_stop') res.write('data: [DONE]\n\n');
          } catch(e) {}
        }
      }
      res.end();
    } catch(e) {
      console.error('morningBrief error:', e.message);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
)

exports.addMemo = onRequest(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 60, memory: '256MiB' },
  async (req, res) => {
    corsHeaders(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try {
      const { note, existingMemos } = req.body;
      const system = `Tu gères les mémos personnalisés du coach IA de Guillaume, un coureur qui prépare un marathon.
Guillaume vient d'envoyer une remarque explicite qu'il veut que son coach retienne pour toutes les prochaines conversations.
Tu dois intégrer cette nouvelle remarque dans les mémos existants de façon claire et concise.
Règles :
- Reformule la remarque comme une instruction pour le coach (ex: "Ne jamais dire demain si la séance est dans 2+ jours")
- Si la remarque indique qu'un problème est résolu (ex: "j'ai respecté mes allures"), supprime le mémo correspondant au problème
- Intègre-la aux mémos existants sans dupliquer
- Garde les mémos courts : 1 ligne par note, 15 notes maximum
- Réponds UNIQUEMENT avec les mémos mis à jour, en texte brut, 1 note par ligne
- Commence chaque ligne par "- "`;

      const today = new Date().toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit', year:'numeric'});
      const userMsg = `Mémos existants :
${existingMemos || '(aucun)'}

Nouvelle remarque de Guillaume (${today}) : "${note}"

Retourne les mémos mis à jour. Ajoute la date entre parenthèses à la fin de chaque nouvelle note au format (jj/mm/aaaa).`;
      const memos = await callAnthropic(ANTHROPIC_API_KEY.value(), system, [{role:'user', content: userMsg}], 400);
      res.json({ memos: memos || existingMemos });
    } catch(e) {
      console.error('addMemo error:', e.message);
      res.status(500).json({ error: e.message });
    }
  }
);

// ── EXTRACT MEMOS ─────────────────────────────────────────────────────────────

exports.extractMemos = onRequest(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 60, memory: '256MiB' },
  async (req, res) => {
    corsHeaders(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try {
      const { history, existingMemos, recentPerfs } = req.body;
      const system = `Tu gères les mémos personnalisés du coach IA de Guillaume.
Tu dois mettre à jour les mémos existants selon la conversation ET les données de performances récentes.
Extrais UNIQUEMENT les faits personnels importants et durables : blessures, contraintes physiques, préférences, objectifs, contexte de vie, ressentis récurrents, points forts/faibles, tendances d'allure.

RÈGLES DE MISE À JOUR — ESSENTIELLES :
1. SUPPRESSION si problème résolu : compare CHAQUE mémo existant avec les performances récentes.
   Exemple : mémo dit 'accélère trop sur les tempos (4\'51 au lieu de 4\'55-5\'00)'
   → si les performances récentes montrent 4\'55-5\'02 sur les tempos, SUPPRIME ce mémo.
2. MISE À JOUR si partiellement amélioré : reformule le mémo pour refléter la tendance actuelle.
   Exemple : 'A tendance à accélérer sur les tempos — à surveiller en S9+'
3. CONSERVATION si toujours d\'actualité : garde le mémo tel quel.
4. AJOUT si nouvelle information importante détectée dans la conversation.
5. Les mémos doivent refléter la RÉALITÉ ACTUELLE, jamais l\'historique.
6. Maximum 12 lignes, 1 info par ligne, commence par '- '
7. Retourne toujours les mémos (même inchangés), jamais de message vide.`;

      const todayExtract = new Date().toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit', year:'numeric'});
      const perfsSection = recentPerfs ? `\n\nPerformances récentes (données objectives) :\n${recentPerfs}` : '';
      const userMsg = `Mémos existants :\n${existingMemos||'(aucun)'}${perfsSection}\n\nConversation récente (${todayExtract}) :\n${(history||[]).map(m=>`${m.role==='user'?'Guillaume':'Coach'}: ${m.content}`).join('\n')}\n\nAnalyse les mémos vs les performances récentes. Retourne les mémos mis à jour. Ajoute la date (${todayExtract}) aux nouvelles notes.`;
      const memos = await callAnthropic(ANTHROPIC_API_KEY.value(), system, [{role:'user', content: userMsg}], 400);
      res.json({ memos: memos || existingMemos || '' });
    } catch(e) {
      console.error('extractMemos error:', e.message);
      res.status(500).json({ error: e.message });
    }
  }
);

// ── PUSH NOTIFICATIONS — CRON JOBS ───────────────────────────────────────────

async function sendPush(vapidPublic, vapidPrivate, title, body, tag, url) {
  const webpush = require('web-push');
  webpush.setVapidDetails('mailto:guillaumelenoir75@gmail.com', vapidPublic, vapidPrivate);
  const db = admin.database();
  const snap = await db.ref('marathon/state/_push_sub').once('value');
  const sub = snap.val();
  if (!sub) { console.log('Pas de subscription push — skip'); return; }
  try {
    await webpush.sendNotification(sub, JSON.stringify({ title, body, tag, url: url || '/' }));
    console.log(`Push envoyé : [${tag}] ${title}`);
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      await db.ref('marathon/state/_push_sub').remove();
    } else { throw err; }
  }
}

function getWeekFromDB() {
  const weekDates = [
    '2026-03-09','2026-03-16','2026-03-23','2026-03-30',
    '2026-04-06','2026-04-13','2026-04-20','2026-04-27',
    '2026-05-04','2026-05-11','2026-05-18','2026-05-25',
    '2026-06-01','2026-06-08','2026-06-15','2026-06-22',
    '2026-06-29','2026-07-06','2026-07-13','2026-07-20',
    '2026-07-27','2026-08-03','2026-08-10','2026-08-17',
    '2026-08-24','2026-08-31','2026-09-07','2026-09-14',
    '2026-09-21','2026-09-28','2026-10-05','2026-10-12',
  ];
  const now = new Date();
  const today = now.getFullYear()*10000+(now.getMonth()+1)*100+now.getDate();
  const dates = weekDates.map(d=>{const p=d.split('-');return parseInt(p[0])*10000+parseInt(p[1])*100+parseInt(p[2]);});
  let cw=1;
  for(let i=0;i<dates.length;i++){if(today>=dates[i])cw=i+1;else break;}
  return Math.min(cw,32);
}

async function buildNotifContext(state, cw) {
  const jours=['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  const joursLong=['','lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
  const typesSemaine=['','','','','','','','','décharge','','','','décharge','','','','décharge','','','','décharge','','','','','','décharge','','','','décharge','',''];
  const now=new Date();
  const dayOfWeek=now.getDay()===0?7:now.getDay();
  const todayStr=now.toISOString().slice(0,10);
  const typeSem=cw<=32?(typesSemaine[cw]||'charge'):'charge';
  const fcToday=state[`fc_repos_${todayStr}`]||null;
  const seancesDone=[],seancesRestantes=[],seancesAujourdHui=[],seancesNext=[];
  for(let si=0;si<5;si++){
    const edRaw=state[`edit_w${cw}_s${si}`];
    const done=!!state[`s${cw}i${si}done`];  // clé correcte
    const deleted=!!state[`del_w${cw}_s${si}`];
    if(deleted||!edRaw)continue;
    let ed;try{ed=JSON.parse(edRaw);}catch(e){continue;}
    if(ed.type==='rest')continue;
    const titre=ed.d?ed.d.split('|')[0]:(ed.type||'').toUpperCase();
    const km=ed.km||'';
    const schedInfo=ed.sched_day?`${jours[ed.sched_day]}${ed.sched_time?' '+ed.sched_time:''}`:''
    if(done){const perf=state[`w${cw}_s${si}perf`]?JSON.parse(state[`w${cw}_s${si}perf`]):null;seancesDone.push(`${titre} ${km}km${perf?' — '+perf.pace+'/km FC'+(perf.fc||''):' ✓'}`);}
    else{
      seancesRestantes.push(`${titre} ${km}km${schedInfo?' → '+schedInfo:''}`);
      if(ed.sched_day===dayOfWeek) seancesAujourdHui.push(`${titre} — ${km}km, prévu à ${ed.sched_time||'horaire non défini'}`);
    }
  }
  // Renfo du jour
  for(let ri=1;ri<=2;ri++){
    const done=!!state[`rf${cw}r${ri}done`];
    if(done)continue;
    const schedRaw=state[`rf${cw}r${ri}sched`];
    if(!schedRaw)continue;
    let sched;try{sched=JSON.parse(schedRaw);}catch(e){continue;}
    if(sched.day===dayOfWeek){
      const renfoNoms={1:'Renfo Ischio-fessiers',2:'Renfo Bas du dos'};
      seancesAujourdHui.push(`${renfoNoms[ri]}${sched.time?' à '+sched.time:''}`);
    }
  }
  // Séances extra du jour
  let extraIdx=0;
  while(state[`extra_w${cw}_s${extraIdx}`]){
    const done=!!state[`extra_w${cw}_s${extraIdx}_done`];
    if(!done){
      let es;try{es=JSON.parse(state[`extra_w${cw}_s${extraIdx}`]);}catch(e){extraIdx++;continue;}
      if(es.sched_day===dayOfWeek){
        const titre=es.d?es.d.split('|')[0]:(es.type||'').toUpperCase();
        seancesAujourdHui.push(`${titre} — ${es.km}km, prévu à ${es.sched_time||'horaire non défini'}`);
      }
    }
    extraIdx++;
  }
  let efPace=null;
  for(let ws=cw;ws>=Math.max(1,cw-4);ws--){for(let si=0;si<5;si++){const pr=state[`w${ws}_s${si}perf`];if(!pr)continue;try{const p=JSON.parse(pr);if(p.type==='ef'&&p.pace){efPace=p.pace;break;}}catch(e){}}if(efPace)break;}
  let kmSemaine=0;for(let si=0;si<5;si++){const pr=state[`w${cw}_s${si}perf`];if(!pr)continue;try{const p=JSON.parse(pr);if(p.km)kmSemaine+=parseFloat(p.km);}catch(e){}}
  const cwNext=Math.min(cw+1,32);
  const typeSemNext=cwNext<=32?(typesSemaine[cwNext]||'charge'):'charge';
  for(let si=0;si<5;si++){const er=state[`edit_w${cwNext}_s${si}`];if(!er)continue;let ed;try{ed=JSON.parse(er);}catch(e){continue;}seancesNext.push(`${ed.d?ed.d.split('|')[0]:(ed.type||'').toUpperCase()} ${ed.km||''}km`);}
  return{cw,typeSem,typeSemNext,cwNext,dayOfWeek,jourAujourdHui:joursLong[dayOfWeek],fcToday,seancesAujourdHui,seancesDone,seancesRestantes,kmSemaine,efPace,memos:state['_coach_memos']||'',seancesNext,semainesRestantes:32-cw};
}

// ── 1a. FC repos — lundi-vendredi 8h01 ───────────────────────────────────────
exports.fcReposReminderWeekday = onSchedule(
  {schedule:'58 7 * * 1-5',timeZone:'Europe/Paris',secrets:[VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY]},
  async()=>{try{const db=admin.database();const today=new Date().toISOString().slice(0,10);const snap=await db.ref(`marathon/state/fc_repos_${today}`).once('value');if(snap.val())return;await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'Rappel ☀️','Rentre ta FC repos avant de te lever ❤️','fc-repos','/');}catch(e){console.error('fcReposReminderWeekday:',e.message);}}
);

// ── 1b. FC repos — samedi-dimanche 9h30 ──────────────────────────────────────
exports.fcReposReminderWeekend = onSchedule(
  {schedule:'30 9 * * 0,6',timeZone:'Europe/Paris',secrets:[VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY]},
  async()=>{try{const db=admin.database();const today=new Date().toISOString().slice(0,10);const snap=await db.ref(`marathon/state/fc_repos_${today}`).once('value');if(snap.val())return;await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'Rappel ☀️','Rentre ta FC repos avant de te lever ❤️','fc-repos','/');}catch(e){console.error('fcReposReminderWeekend:',e.message);}}
);

// ── 1c. FC repos rappel 14h — lundi-vendredi ─────────────────────────────────
exports.fcReposReminder14hWeekday = onSchedule(
  {schedule:'0 14 * * 1-5',timeZone:'Europe/Paris',secrets:[VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY]},
  async()=>{try{const db=admin.database();const today=new Date().toISOString().slice(0,10);const snap=await db.ref(`marathon/state/fc_repos_${today}`).once('value');if(snap.val())return;await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'Rappel',"Tu n'as pas encore rentré ta FC repos aujourd'hui ❤️",'fc-repos-14h','/');}catch(e){console.error('fcReposReminder14hWeekday:',e.message);}}
);

// ── 1d. FC repos rappel 14h — samedi-dimanche ────────────────────────────────
exports.fcReposReminder14hWeekend = onSchedule(
  {schedule:'0 14 * * 0,6',timeZone:'Europe/Paris',secrets:[VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY]},
  async()=>{try{const db=admin.database();const today=new Date().toISOString().slice(0,10);const snap=await db.ref(`marathon/state/fc_repos_${today}`).once('value');if(snap.val())return;await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'Rappel',"Tu n'as pas encore rentré ta FC repos aujourd'hui ❤️",'fc-repos-14h','/');}catch(e){console.error('fcReposReminder14hWeekend:',e.message);}}
);

// ── 3. Rappel séance — toutes les 30 min (7h-21h) ────────────────────────────
exports.sessionReminder = onSchedule(
  {schedule:'*/30 7-21 * * *',timeZone:'Europe/Paris',secrets:[VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY]},
  async()=>{
    try{
      const db=admin.database();
      const state=(await db.ref('marathon/state').once('value')).val()||{};
      const cw=getWeekFromDB();
      const now=new Date();
      // Utiliser l'heure Paris (et non UTC) pour comparer avec sched.time stocké en Paris
      const parisStr=now.toLocaleString('en-US',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',hour12:false});
      const parisH=parseInt(parisStr.split(':')[0]);
      const parisM=parseInt(parisStr.split(':')[1]);
      const parisDate=new Date(now.toLocaleString('en-US',{timeZone:'Europe/Paris'}));
      const dayOfWeek=parisDate.getDay()===0?7:parisDate.getDay();
      const nowMinutes=parisH*60+parisM;
      for(let si=0;si<5;si++){
        const done=!!state[`s${cw}i${si}done`];if(done)continue;
        const edRaw=state[`edit_w${cw}_s${si}`];if(!edRaw)continue;
        let ed;try{ed=JSON.parse(edRaw);}catch(e){continue;}
        if(ed.sched_day!==dayOfWeek||!ed.sched_time)continue;
        const[h,m]=ed.sched_time.split(':').map(Number);
        const sm=h*60+m;
        if(sm<nowMinutes+45||sm>nowMinutes+75)continue;
        const rk=`_rappel_sent_w${cw}_s${si}`;
        const ts=now.toISOString().slice(0,10);
        if(state[rk]===ts)continue;
        const titre=ed.d?ed.d.split('|')[0]:(ed.type||'').toUpperCase();
        // Météo uniquement pour les séances run (pas renfo — en intérieur)
        const isRunSession=['ef','tempo','long','race'].includes((ed.type||'').toLowerCase());
        let meteoStr='';
        if(isRunSession){
          try{
            const locSnap=await db.ref('marathon/state/_last_location').once('value');
            const loc=locSnap.val();
            // Fallback : Paris 75015 si pas de localisation stockée ou > 30 jours
            const locFresh = loc && loc.lat && (Date.now()-loc.ts)<30*24*3600*1000;
            const lat=locFresh?loc.lat:48.8417;
            const lng=locFresh?loc.lng:2.2945;
            const seanceH=parseInt(ed.sched_time.split(':')[0]);
            const meteoResp=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,apparent_temperature,weather_code&timezone=Europe%2FParis&forecast_days=1`);
            const meteoData=await meteoResp.json();
            if(meteoData.hourly){
              const temp=meteoData.hourly.temperature_2m?.[seanceH];
              const apparent=meteoData.hourly.apparent_temperature?.[seanceH];
              const wcode=meteoData.hourly.weather_code?.[seanceH];
              const wmoEmoji=wcode===0?'☀️':wcode<=2?'⛅':wcode<=3?'☁️':wcode<=48?'🌫️':wcode<=67?'🌧️':wcode<=77?'🌨️':wcode<=82?'🌦️':wcode<=99?'⛈️':'🌤️';
              const wmoLabel=wcode===0?'Ensoleillé':wcode<=2?'Peu nuageux':wcode<=3?'Couvert':wcode<=48?'Brouillard':wcode<=55?'Bruine':wcode<=67?'Pluie':wcode<=77?'Neige':wcode<=82?'Averses':wcode<=99?'Orage':'Variable';
              const t=Math.round(apparent??temp??0);
              meteoStr=` ${wmoEmoji} ${wmoLabel}, ${t}°C.`;
            }
          }catch(e){/* météo non bloquante */}
        }
        const body=`🏃 ${titre}${ed.km?' — '+ed.km+'km':''} à ${ed.sched_time}.${meteoStr} Prépare ton équipement ! 💪`;
        await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'⏱️ Séance dans 1h',body,'session-reminder','/');
        await db.ref(`marathon/state/${rk}`).set(ts);
        break;
      }
      // Rappel séances extra 1h avant
      let extraRi=0;
      while(state[`extra_w${cw}_s${extraRi}`]){
        const done=!!state[`extra_w${cw}_s${extraRi}_done`];
        if(!done){
          let es;try{es=JSON.parse(state[`extra_w${cw}_s${extraRi}`]);}catch(e){extraRi++;continue;}
          if(es.sched_day===dayOfWeek&&es.sched_time){
            const[h,m]=es.sched_time.split(':').map(Number);
            const sm=h*60+m;
            if(sm>=nowMinutes+45&&sm<=nowMinutes+75){
              const rk=`_rappel_extra_sent_w${cw}_s${extraRi}`;
              const ts=now.toISOString().slice(0,10);
              if(state[rk]!==ts){
                const titre=es.d?es.d.split('|')[0]:(es.type||'').toUpperCase();
                const body=`🏃 ${titre}${es.km?' — '+es.km+'km':''} à ${es.sched_time}. Prépare ton équipement ! 💪`;
                await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'⏱️ Séance dans 1h',body,'session-reminder','/');
                await db.ref(`marathon/state/${rk}`).set(ts);
                break;
              }
            }
          }
        }
        extraRi++;
      }
      const renfoNames = {1:'Ischio-fessiers', 2:'Bas du dos'};
      for(let ri=1;ri<=2;ri++){
        const schedRaw=state[`rf${cw}r${ri}sched`];if(!schedRaw)continue;
        let sched;try{sched=JSON.parse(schedRaw);}catch(e){continue;}
        if(!sched.day||!sched.time)continue;
        if(sched.day!==dayOfWeek)continue;
        const[h,m]=sched.time.split(':').map(Number);
        const sm=h*60+m;
        if(sm<nowMinutes+45||sm>nowMinutes+75)continue;
        const rk=`_rappel_renfo_sent_w${cw}_r${ri}`;
        const ts=now.toISOString().slice(0,10);
        if(state[rk]===ts)continue;
        const done=!!state[`rf${cw}r${ri}done`];if(done)continue;
        await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'⏱️ Renfo dans 1h',`💪 ${renfoNames[ri]} à ${sched.time}. Prépare-toi !`,'session-reminder','/');
        await db.ref(`marathon/state/${rk}`).set(ts);
        break;
      }
    }catch(e){console.error('sessionReminder:',e.message);}
  }
);


// ── Brief déclenché après saisie FC repos ────────────────────────────────────
exports.briefAfterFcRepos = onSchedule(
  {schedule:'*/2 6-22 * * *',timeZone:'Europe/Paris',secrets:[VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY,ANTHROPIC_API_KEY]},
  async()=>{
    try{
      const db=admin.database();
      const state=(await db.ref('marathon/state').once('value')).val()||{};
      const trigger=state['_brief_trigger'];
      if(!trigger||!trigger.ts)return;
      const now=Date.now();
      const age=(now-trigger.ts)/1000/60; // minutes
      // Fenêtre élargie : entre 2 et 30 minutes après la saisie FC
      if(age<2||age>30){
        if(age>30) await db.ref('marathon/state/_brief_trigger').remove();
        return;
      }
      // Vérifier qu'un brief n'a pas déjà été envoyé aujourd'hui
      const todayStr=trigger.date||new Date().toISOString().slice(0,10);
      const briefKey='_brief_matin_'+todayStr;
      const briefSnap=await db.ref('marathon/state/'+briefKey).once('value');
      if(briefSnap.val()){
        // Brief déjà fait — nettoyer le trigger et partir
        await db.ref('marathon/state/_brief_trigger').remove();
        return;
      }
      // Supprimer le trigger immédiatement pour éviter doublons
      await db.ref('marathon/state/_brief_trigger').remove();
      const cw=getWeekFromDB();
      const ctx=await buildNotifContext(state,cw);
      const fcToday=state['fc_repos_'+todayStr]||null;

      // Séances run du jour
      const seanceRunMsg=ctx.seancesAujourdHui.length>0?`Run : ${ctx.seancesAujourdHui.join(' + ')}.`:'';

      // Renfo kiné du jour
      const jours2=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
      const dow=new Date().getDay();
      const dayOfWeekNum=dow===0?7:dow; // 1=lun...7=dim
      const renfoNoms={1:'Ischio-fessiers',2:'Bas du dos'};
      const renfoAujourdHui=[];
      for(let ri=1;ri<=2;ri++){
        const done=!!state[`rf${cw}r${ri}done`];
        if(done)continue;
        const schedRaw=state[`rf${cw}r${ri}sched`];
        if(!schedRaw)continue;
        let sched;try{sched=JSON.parse(schedRaw);}catch(e){continue;}
        if(sched.day===dayOfWeekNum) renfoAujourdHui.push(`${renfoNoms[ri]}${sched.time?' à '+sched.time:''}`);
      }
      const renfoMsg=renfoAujourdHui.length>0?`Renfo : ${renfoAujourdHui.join(' + ')}.`:'';

      // Bodyhit lundi
      const bodyhitMsg=dow===1?'Bodyhit à 12h30.':'';

      // Programme complet du jour
      const programmeItems=[seanceRunMsg,renfoMsg,bodyhitMsg].filter(Boolean);
      const programmeMsg=programmeItems.length>0?programmeItems.join(' '):'Journée de récupération ce '+(jours2[dow]||"aujourd'hui")+'.';

      // Météo à l'heure de la première séance run du jour
      let meteoMsg = '';
      try {
        const locSnap = await db.ref('marathon/state/_last_location').once('value');
        const loc = locSnap.val();
        const lat = (loc && loc.lat && (Date.now()-loc.ts)<30*24*3600*1000) ? loc.lat : 48.8417;
        const lng = (loc && loc.lng && (Date.now()-loc.ts)<30*24*3600*1000) ? loc.lng : 2.2945;
        let seanceH = new Date().getHours() + 1;
        if(ctx.seancesAujourdHui.length > 0) {
          const match = ctx.seancesAujourdHui[0].match(/(\d{1,2})h|(\d{1,2}):(\d{2})/);
          if(match) seanceH = parseInt(match[1] || match[2]);
        }
        seanceH = Math.min(23, Math.max(0, seanceH));
        const meteoResp = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,apparent_temperature,weather_code&timezone=Europe%2FParis&forecast_days=1`);
        const meteoData = await meteoResp.json();
        if(meteoData.hourly) {
          const temp     = meteoData.hourly.temperature_2m?.[seanceH];
          const apparent = meteoData.hourly.apparent_temperature?.[seanceH];
          const wcode    = meteoData.hourly.weather_code?.[seanceH];
          const wmoEmoji = wcode===0?'☀️':wcode<=2?'⛅':wcode<=3?'☁️':wcode<=48?'🌫️':wcode<=67?'🌧️':wcode<=77?'🌨️':wcode<=82?'🌦️':wcode<=99?'⛈️':'🌤️';
          const t = Math.round(temp ?? 0);
          const r = Math.round(apparent ?? t);
          const diff = r - t;
          meteoMsg = `Météo à ${seanceH}h : ${wmoEmoji} ${t}°C${diff >= 2 ? ' (ressenti '+r+'°C)' : ''}.`;
        }
      } catch(e) { /* météo non bloquante */ }

      const fcMsg=fcToday?`FC repos : ${fcToday} bpm.`:'';
      const activitesMsg=[fcMsg,programmeMsg,meteoMsg].filter(Boolean).join(' ');
      const prompt=`Une seule phrase courte et COMPLÈTE (max 100 caractères) pour Guillaume : ${activitesMsg}. Pas de virgule finale. Pas de tirets.`;

      let brief = null;
      try {
        brief = await callAnthropic(ANTHROPIC_API_KEY.value(),'Coach running. 1 phrase courte complète, jamais coupée, max 100 caractères.',[{role:'user',content:prompt}],60);
      } catch(aiErr) { console.error('briefAfterFcRepos AI error:',aiErr.message); }

      // Garantir que le body est court et complet pour la notif iOS (max ~180 car)
      let body = (brief || activitesMsg).trim();
      if(body.length > 180) body = body.slice(0, 177) + '...';
      if(!body.endsWith('.') && !body.endsWith('!') && !body.endsWith('?')) body += '.';

      // Stocker le brief court en pending ET un flag pour que l'app génère le brief complet
      await db.ref('marathon/state/_brief_pending').set({
        content: body,
        date: todayStr,
        type: 'morning_brief',
        needs_full_brief: true   // ← signal : l'app doit générer le brief complet au lieu d'afficher ce texte court
      });
      await db.ref('marathon/state/'+briefKey).set('push_sent'); // "push_sent" ≠ true → l'app peut encore générer le brief complet
      await db.ref('marathon/state/_open_coach').set(true);
      await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),`🏃 Brief du matin — S${cw}`,body,'brief-matinal','/');
    }catch(e){console.error('briefAfterFcRepos:',e.message);}
  }
);


// ── Séance non validée — 20h30 tous les jours ────────────────────────────────
exports.unvalidatedSessionReminder = onSchedule(
  {schedule:'30 20 * * *',timeZone:'Europe/Paris',secrets:[VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY]},
  async()=>{
    try{
      const db=admin.database();
      const state=(await db.ref('marathon/state').once('value')).val()||{};
      const cw=getWeekFromDB();
      const now=new Date();
      const dayOfWeek=now.getDay()===0?7:now.getDay();
      const manquees=[];

      // Vérifier les séances run du jour non validées
      for(let si=0;si<5;si++){
        const done=!!state[`s${cw}i${si}done`];if(done)continue;
        const edRaw=state[`edit_w${cw}_s${si}`];if(!edRaw)continue;
        let ed;try{ed=JSON.parse(edRaw);}catch(e){continue;}
        if(ed.sched_day!==dayOfWeek)continue;
        const titre=ed.d?ed.d.split('|')[0]:(ed.type||'').toUpperCase();
        manquees.push(`🏃 ${titre} ${ed.km||''}km`);
      }

      // Vérifier les renfos du jour non validés
      const renfoNames={1:'Ischio-fessiers',2:'Bas du dos'};
      for(let ri=1;ri<=2;ri++){
        const done=!!state[`rf${cw}r${ri}done`];if(done)continue;
        const schedRaw=state[`rf${cw}r${ri}sched`];if(!schedRaw)continue;
        let sched;try{sched=JSON.parse(schedRaw);}catch(e){continue;}
        if(!sched.day||sched.day!==dayOfWeek)continue;
        manquees.push(`💪 ${renfoNames[ri]}`);
      }

      // Séances extra non validées du jour
      let extraI=0;
      while(state[`extra_w${cw}_s${extraI}`]){
        const done=!!state[`extra_w${cw}_s${extraI}_done`];
        if(!done){
          let es;try{es=JSON.parse(state[`extra_w${cw}_s${extraI}`]);}catch(e){extraI++;continue;}
          if(es.sched_day===dayOfWeek){
            const titre=es.d?es.d.split('|')[0]:(es.type||'').toUpperCase();
            manquees.push(`🏃 ${titre} ${es.km||''}km`);
          }
        }
        extraI++;
      }

      if(manquees.length===0)return;

      const body=`${manquees.join(' + ')} pas encore validé${manquees.length>1?'s':'s'} aujourd'hui. Tu l'as fait ? Pense à valider dans l'app ! ✅`;
      await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),
        '⚠️ Séance non validée',body,'unvalidated-reminder','/');
    }catch(e){console.error('unvalidatedSessionReminder:',e.message);}
  }
);


// ── Félicitations semaine complète — 15min après dernière validation ──────────
exports.weekCompleteCongrats = onSchedule(
  {schedule:'*/15 7-22 * * *',timeZone:'Europe/Paris',secrets:[VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY,ANTHROPIC_API_KEY]},
  async()=>{
    try{
      const db=admin.database();
      const state=(await db.ref('marathon/state').once('value')).val()||{};
      const cw=getWeekFromDB();

      // Vérifier si félicitations déjà envoyées cette semaine
      const congratsKey=`_congrats_sent_w${cw}`;
      if(state[congratsKey])return;

      // Vérifier que toutes les séances run sont faites
      let totalRun=0, doneRun=0;
      for(let si=0;si<5;si++){
        const edRaw=state[`edit_w${cw}_s${si}`];
        const deleted=!!state[`del_w${cw}_s${si}`];
        if(deleted)continue;
        if(!edRaw)continue;
        let ed;try{ed=JSON.parse(edRaw);}catch(e){continue;}
        if(ed.type==='rest')continue;
        totalRun++;
        if(!!state[`s${cw}i${si}done`])doneRun++;
      }
      if(totalRun===0||doneRun<totalRun)return;

      // Vérifier que les 2 renfos sont faits
      const renfo1Done=!!state[`rf${cw}r1done`];
      const renfo2Done=!!state[`rf${cw}r2done`];
      if(!renfo1Done||!renfo2Done)return;

      // Vérifier que la dernière validation date de moins de 20min
      const now=Date.now();
      const lastValidKey=`_last_validation_w${cw}`;
      const lastValid=state[lastValidKey]||0;
      const ageMin=(now-lastValid)/1000/60;
      if(ageMin>20)return;

      // Générer le message de félicitations via Claude
      const ctx=await buildNotifContext(state,cw);
      // Récupérer les perfs de la semaine
      const perfsDetail=[];
      for(let si=0;si<5;si++){
        const perfRaw=state[`w${cw}_s${si}perf`];if(!perfRaw)continue;
        const edRaw=state[`edit_w${cw}_s${si}`];if(!edRaw)continue;
        let perf,ed;try{perf=JSON.parse(perfRaw);ed=JSON.parse(edRaw);}catch(e){continue;}
        const titre=ed.d?ed.d.split('|')[0]:(ed.type||'').toUpperCase();
        const km=state[`w${cw}_s${si}km`]||ed.km||'';
        perfsDetail.push(`${titre} ${km}km${perf.pace?' @'+perf.pace+'/km':''}${perf.hr?' FC'+perf.hr:''}`);
      }
      const perfsStr=perfsDetail.length>0?perfsDetail.join(', '):`${doneRun} séances`;
      // Prompt court et contraint pour éviter la coupure
      const prompt=`Félicitations à Guillaume pour la semaine S${cw} (${ctx.typeSem}) complète : ${perfsStr} + 2 renfos. Km : ${ctx.kmSemaine>0?ctx.kmSemaine+'km':'semaine complète'}. EF : ${ctx.efPace||'?'}. ${ctx.semainesRestantes} sem. avant le marathon.
Écris EXACTEMENT 2 phrases courtes de félicitations. Maximum 180 caractères au total. Termine toujours sur une phrase complète. 1 emoji max.`;
      const msg=await callAnthropic(ANTHROPIC_API_KEY.value(),'Tu es un coach running enthousiaste. Réponds en 2 phrases courtes, maximum 180 caractères, jamais de phrase coupée.',[{role:'user',content:prompt}],180);

      // Tronquer proprement à la dernière phrase complète si nécessaire
      let body = msg || `S${cw} 100% complète ! Run + renfo : tout validé. Belle semaine Guillaume 💪`;

      // Garantir que le texte se termine sur une phrase complète (. ! ou ?)
      const lastPunct = Math.max(body.lastIndexOf('.'), body.lastIndexOf('!'), body.lastIndexOf('?'));

      if (lastPunct > 0 && lastPunct < body.length - 1) body = body.slice(0, lastPunct + 1);

      const today = new Date().toISOString().slice(0,10);

      // Écrire dans _brief_pending pour que le tap ouvre le Coach
      await db.ref('marathon/state/_brief_pending').set({content: body, date: today, type: 'week_complete'});

      await db.ref('marathon/state/_open_coach').set(true);

      await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),

        `🎉 Semaine S${cw} complète !`,body,'week-complete','/');

      await db.ref(`marathon/state/${congratsKey}`).set(true);
    }catch(e){console.error('weekCompleteCongrats:',e.message);}
  }
);

// ── Rappel planification S+1 — dimanche 20h ─────────────────────────────────
exports.weeklyPlanifReminder = onSchedule(
  {schedule:'0 20 * * 0',timeZone:'Europe/Paris',secrets:[VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY]},
  async()=>{
    try{
      const db=admin.database();
      const state=(await db.ref('marathon/state').once('value')).val()||{};
      const cw=getWeekFromDB();
      const cwNext=Math.min(cw+1,32);
      let seancesNonPlanifiees=0;
      for(let si=0;si<5;si++){
        const edRaw=state[`edit_w${cwNext}_s${si}`];
        if(!edRaw)continue;
        let ed;try{ed=JSON.parse(edRaw);}catch(e){continue;}
        if(!ed.sched_day)seancesNonPlanifiees++;
      }
      const renfo1Sched=state[`rf${cwNext}r1sched`];
      const renfo2Sched=state[`rf${cwNext}r2sched`];
      const renfosNonPlanifies=(!renfo1Sched?1:0)+(!renfo2Sched?1:0);
      const body=`Vérifie tes horaires de séances et renfos pour la semaine ! 🏃💪`;
      await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'📅 Plan S'+cwNext,body,'planif-reminder','/');
    }catch(e){console.error('weeklyPlanifReminder:',e.message);}
  }
);

// ── 4. Débrief dimanche 18h ───────────────────────────────────────────────────
exports.weeklyDebriefNotif = onSchedule(
  {schedule:'0 18 * * 0',timeZone:'Europe/Paris',secrets:[VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY,ANTHROPIC_API_KEY]},
  async()=>{
    try{
      const db=admin.database();
      const state=(await db.ref('marathon/state').once('value')).val()||{};
      const cw=getWeekFromDB();
      const ctx=await buildNotifContext(state,cw);
      const prompt=`Tu es le coach running de Guillaume. Débrief fin de semaine en 3 phrases max pour notification iPhone.\nBilan S${cw} (${ctx.typeSem}) : ${ctx.seancesDone.length} séances${ctx.kmSemaine>0?' — '+ctx.kmSemaine+'km':''}. ${ctx.seancesRestantes.length>0?'Manquées : '+ctx.seancesRestantes.join(', ')+'.':'Toutes faites 🎉'} EF : ${ctx.efPace||'?'}.\nS${ctx.cwNext} (${ctx.typeSemNext}) : ${ctx.seancesNext.join(', ')||'à planifier'}.\nPhrase 1 = bilan 📊, phrase 2 = point clé 📈 ou ⚠️, phrase 3 = aperçu S${ctx.cwNext} + "Ouvre le Coach pour le détail 👇"`;
      const debrief=await callAnthropic(ANTHROPIC_API_KEY.value(),'Tu es un coach running concis et motivant.',[{role:'user',content:prompt}],200);
      const body=debrief||`📊 S${cw} terminée : ${ctx.seancesDone.length} séances${ctx.kmSemaine>0?', '+ctx.kmSemaine+'km':''}. S${ctx.cwNext} (${ctx.typeSemNext}) arrive. Ouvre le Coach pour le détail 👇`;
      const today=new Date().toISOString().slice(0,10);
      await db.ref('marathon/state/_brief_pending').set({content:body,date:today,type:'weekly_debrief'});
      await db.ref('marathon/state/_open_coach').set(true);
      await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),`📊 Bilan S${cw}`,body,'weekly-debrief','/');
    }catch(e){console.error('weeklyDebriefNotif:',e.message);}
  }
);
