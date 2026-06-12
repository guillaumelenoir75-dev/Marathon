const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();

const GARMIN_EMAIL = defineSecret("GARMIN_EMAIL");
const GARMIN_PASSWORD = defineSecret("GARMIN_PASSWORD");

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

      const runs = activities.filter(a => {
        const t = (a.activityType?.typeKey || a.activityTypeKey || '').toLowerCase();
        return t.includes('run');
      });
      console.log(`Found ${activities.length} activities, ${runs.length} runs`);

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

          if ([301,302,303,307,308].includes(proxyRes.statusCode) && proxyRes.headers.location && redirectCount < 5) {
            let location = proxyRes.headers.location;
            if (location.startsWith('/')) location = `${u.protocol}//${u.host}${location}`;
            console.log(`Redirect → ${location.slice(0, 60)}`);
            const existingCookie = reqHeaders['Cookie'] || '';
            const newCookies = allSetCookies.map(c => c.split(';')[0]).join('; ');
            const mergedCookies = [existingCookie, newCookies].filter(Boolean).join('; ');
            const newHeaders = { ...reqHeaders, Cookie: mergedCookies };
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
