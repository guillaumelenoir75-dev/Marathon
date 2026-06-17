const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();

const { defineSecret } = require("firebase-functions/params");
const VAPID_PUBLIC_KEY = defineSecret("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = defineSecret("VAPID_PRIVATE_KEY");

const ADMIN_EMAIL = 'guillaumelenoir75@gmail.com';
const ADMIN_UID = 'WkEWrmnYWuUNkGLrwXf9HhaJWfh1';
const ADMIN_STATE = `users/${ADMIN_UID}/state`;

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function verifyUser(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) throw new Error('Non authentifié');
  const decoded = await admin.auth().verifyIdToken(authHeader.slice(7));
  return decoded.uid;
}

async function verifyAdmin(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) throw new Error('Non authentifié');
  const token = authHeader.slice(7);
  const decoded = await admin.auth().verifyIdToken(token);
  if (decoded.email !== ADMIN_EMAIL) throw new Error('Accès réservé à l\'administrateur');
  return decoded.uid;
}

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

async function checkRateLimit(db, uid, endpoint, minIntervalMs) {
  const key = `users/${uid}/state/_ratelimit/${endpoint}`;
  const snap = await db.ref(key).once('value');
  const lastCall = snap.val();
  if (lastCall && (Date.now() - lastCall) < minIntervalMs) {
    const waitSec = Math.ceil((minIntervalMs - (Date.now() - lastCall)) / 1000);
    throw Object.assign(new Error(`Trop de demandes — réessaie dans ${waitSec}s`), { status: 429 });
  }
  await db.ref(key).set(Date.now());
}

async function callAnthropic(apiKey, system, messages, maxTokens, model = 'claude-sonnet-4-6') {
  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages
    })
  }, 55000);
  const data = await response.json();
  console.log('Anthropic status:', response.status, 'data:', JSON.stringify(data).substring(0, 300));
  return data.content?.[0]?.text || null;
}

async function getUserPref(db, statePath, key, defaultVal = true) {
  try {
    const snap = await db.ref(`${statePath}/_prefs`).once('value');
    const raw = snap.val();
    if (!raw) return defaultVal;
    const prefs = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return prefs[key] !== undefined ? prefs[key] : defaultVal;
  } catch(e) {
    console.warn('getUserPref error (DB?):', statePath, key, e.message);
    return false;
  }
}

async function sendPush(vapidPublic, vapidPrivate, title, body, tag, url) {
  const webpush = require('web-push');
  webpush.setVapidDetails('mailto:guillaumelenoir75@gmail.com', vapidPublic, vapidPrivate);
  const db = admin.database();
  const snap = await db.ref(`${ADMIN_STATE}/_push_sub`).once('value');
  const sub = snap.val();
  if (!sub) { console.log('Pas de subscription push — skip'); return false; }
  try {
    await webpush.sendNotification(sub, JSON.stringify({ title, body, tag, url: url || '/' }));
    console.log(`Push envoyé : [${tag}] ${title}`);
    return true;
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      console.log(`Push subscription expirée (${err.statusCode}) — supprimée`);
      await db.ref(`${ADMIN_STATE}/_push_sub`).remove();
      return false;
    } else { throw err; }
  }
}

async function sendPushToAll(vapidPublic, vapidPrivate, title, body, tag, url, excludeUid, prefKey) {
  const webpush = require('web-push');
  webpush.setVapidDetails('mailto:guillaumelenoir75@gmail.com', vapidPublic, vapidPrivate);
  const db = admin.database();
  const subsSnap = await db.ref('_push_subscribers').once('value');
  const subs = subsSnap.val() || {};
  if (Object.keys(subs).length === 0) { console.log('Aucun abonné push global — skip'); return; }
  const sendOne = async (uid, sub) => {
    if (prefKey) {
      try {
        const pSnap = await db.ref(`users/${uid}/state/_prefs`).once('value');
        const prefs = pSnap.val() ? JSON.parse(pSnap.val()) : {};
        if (prefs[prefKey] === false) return;
      } catch(e) { console.warn(`sendPushToAll prefs parse [${uid}]:`, e.message); }
    }
    try {
      await webpush.sendNotification(sub, JSON.stringify({ title, body, tag, url: url || '/' }));
      console.log(`sendPushToAll → ${uid} : [${tag}]`);
    } catch(err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await db.ref(`_push_subscribers/${uid}`).remove().catch(()=>{});
        await db.ref(`users/${uid}/state/_push_sub`).remove().catch(()=>{});
      }
    }
  };
  await Promise.all(Object.entries(subs).filter(([uid]) => uid !== excludeUid).map(([uid, sub]) => sendOne(uid, sub)));
}

async function sendPushToUser(db, uid, sub, vapidPublic, vapidPrivate, title, body, tag) {
  const webpush = require('web-push');
  webpush.setVapidDetails('mailto:guillaumelenoir75@gmail.com', vapidPublic, vapidPrivate);
  try {
    await webpush.sendNotification(sub, JSON.stringify({ title, body, tag, url: '/' }));
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      await db.ref(`_push_subscribers/${uid}`).remove().catch(() => {});
      await db.ref(`users/${uid}/state/_push_sub`).remove().catch(() => {});
    }
  }
}

function getCurrentWeek() {
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
    const done=!!state[`s${cw}i${si}done`];
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
  for(let ri=1;ri<=2;ri++){
    const done=!!state[`rf${cw}r${ri}done`];
    if(done)continue;
    const schedRaw=state[`rf${cw}r${ri}sched`];
    if(!schedRaw)continue;
    let sched;try{sched=JSON.parse(schedRaw);}catch(e){continue;}
    if(sched.day===dayOfWeek){
      const _rnAll={1:'Ischio-fessiers',2:'Bas du dos',3:'Gainage & Core',4:'Mollets & Chevilles',5:'Haut du corps'};
      const renfoNoms={1:'Renfo '+(_rnAll[parseInt(state.renfo_prog1)||1]||'Ischio-fessiers'),2:'Renfo '+(_rnAll[parseInt(state.renfo_prog2)||2]||'Bas du dos')};
      seancesAujourdHui.push(`${renfoNoms[ri]}${sched.time?' à '+sched.time:''}`);
    }
  }
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

module.exports = {
  ADMIN_EMAIL,
  ADMIN_UID,
  ADMIN_STATE,
  corsHeaders,
  verifyUser,
  verifyAdmin,
  callAnthropic,
  fetchWithTimeout,
  checkRateLimit,
  getUserPref,
  sendPush,
  sendPushToAll,
  sendPushToUser,
  getCurrentWeek,
  buildNotifContext,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
};
