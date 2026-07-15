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
    return defaultVal;
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
        const _raw=pSnap.val(); const prefs = _raw ? (typeof _raw==='string'?JSON.parse(_raw):_raw) : {};
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
  let seanceRunAujourdhui=null; // premier run non-supprimé non-fait du jour
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
    if(done){let perf=null;try{perf=state[`s${cw}i${si}perf`]?JSON.parse(state[`s${cw}i${si}perf`]):null;}catch(e){}seancesDone.push(`${titre} ${km}km${perf&&perf.pace?' — '+perf.pace+'/km FC'+(perf.hr||''):' ✓'}`);}
    else{
      seancesRestantes.push(`${titre} ${km}km${schedInfo?' → '+schedInfo:''}`);
      if(Number(ed.sched_day)===dayOfWeek){
        seancesAujourdHui.push(`${titre} — ${km}km, prévu à ${ed.sched_time||'horaire non défini'}`);
        if(!seanceRunAujourdhui) seanceRunAujourdhui={type:ed.type,km:ed.km||0,sched_time:ed.sched_time||null,titre};
      }
    }
  }
  for(let ri=1;ri<=2;ri++){
    const done=!!state[`rf${cw}r${ri}done`];
    if(done)continue;
    const schedRaw=state[`rf${cw}r${ri}sched`];
    if(!schedRaw)continue;
    let sched;try{sched=JSON.parse(schedRaw);}catch(e){continue;}
    if(Number(sched.day)===dayOfWeek){
      const _rnAll={1:'Ischio-fessiers',2:'Bas du dos',3:'Gainage & Core',4:'Mollets & Chevilles',5:'Haut du corps'};
      const renfoNoms={1:'Renfo '+(_rnAll[parseInt(state.renfo_prog1)||1]||'Ischio-fessiers'),2:'Renfo '+(_rnAll[parseInt(state.renfo_prog2)||2]||'Bas du dos')};
      seancesAujourdHui.push(`${renfoNoms[ri]}${sched.time?' à '+sched.time:''}`);
    }
  }
  let extraIdx=0;
  while(extraIdx<=20&&state[`extra_w${cw}_s${extraIdx}`]){
    const done=!!state[`extra_w${cw}_s${extraIdx}_done`];
    if(!done){
      let es;try{es=JSON.parse(state[`extra_w${cw}_s${extraIdx}`]);}catch(e){extraIdx++;continue;}
      if(Number(es.sched_day)===dayOfWeek){
        const titre=es.d?es.d.split('|')[0]:(es.type||'').toUpperCase();
        seancesAujourdHui.push(`${titre} — ${es.km}km, prévu à ${es.sched_time||'horaire non défini'}`);
        if(!seanceRunAujourdhui && es.type && es.type!=='renfo' && es.type!=='repos'){
          seanceRunAujourdhui={type:es.type,km:parseFloat(es.km)||0,sched_time:es.sched_time||null,titre};
        }
      }
    }
    extraIdx++;
  }
  let efPace=null;
  for(let ws=cw;ws>=Math.max(1,cw-4);ws--){for(let si=0;si<5;si++){const pr=state[`s${ws}i${si}perf`];if(!pr)continue;try{const p=JSON.parse(pr);if(p.type==='ef'&&p.pace){efPace=p.pace;break;}}catch(e){}}if(efPace)break;}
  let kmSemaine=0;for(let si=0;si<5;si++){const kmV=state[`s${cw}i${si}km`];if(kmV!=null)kmSemaine+=parseFloat(kmV)||0;}let _exi=0;while(_exi<=20&&state[`extra_w${cw}_s${_exi}`]){const kmV=state[`extra_w${cw}_s${_exi}_km`];if(kmV!=null)kmSemaine+=parseFloat(kmV)||0;_exi++;}
  const cwNext=Math.min(cw+1,32);
  const typeSemNext=cwNext<=32?(typesSemaine[cwNext]||'charge'):'charge';
  for(let si=0;si<5;si++){const er=state[`edit_w${cwNext}_s${si}`];if(!er)continue;let ed;try{ed=JSON.parse(er);}catch(e){continue;}seancesNext.push(`${ed.d?ed.d.split('|')[0]:(ed.type||'').toUpperCase()} ${ed.km||''}km`);}
  return{cw,typeSem,typeSemNext,cwNext,dayOfWeek,jourAujourdHui:joursLong[dayOfWeek],fcToday,seancesAujourdHui,seancesDone,seancesRestantes,kmSemaine,efPace,memos:state['_coach_memos']||'',seancesNext,semainesRestantes:32-cw,seanceRunAujourdhui};
}

// Génère le brief du matin complet (appel Anthropic + météo + gels + eau)
// Utilisé par briefAfterFcRepos (scheduler) ET adminTestNotif (test immédiat)
async function generateMorningBriefContent(anthropicKey, db, state, cw, todayStr) {
  const ctx = await buildNotifContext(state, cw);
  const wd = state['whoop_data'] || state.whoop_data || null;
  const whoopRecov = wd && wd.recoveries && wd.recoveries[0] ? wd.recoveries[0] : null;
  const whoopDate = whoopRecov && whoopRecov.date ? whoopRecov.date.slice(0,10) : null;
  const whoopToday = (whoopDate === todayStr);
  const fcWhoopRhr = (whoopToday && whoopRecov && whoopRecov.rhr) ? whoopRecov.rhr : null;
  const fcToday = fcWhoopRhr || state['fc_repos_'+todayStr] || null;

  // Score global synthétique (même calcul que stats.js) ─────────────────────
  // Utiliser les données WHOOP les plus récentes, même si pas d'aujourd'hui (identique à stats.js)
  const r0 = whoopRecov; // pas de garde whoopToday, comme stats.js
  const s0 = wd && wd.sleeps ? wd.sleeps[0] : null;
  const globalScoreComponents = [];
  if (r0?.score != null) globalScoreComponents.push(r0.score);
  if (s0?.performance_pct != null) globalScoreComponents.push(s0.performance_pct);
  if (fcToday != null) {
    const fcScore = fcToday <= 44 ? 100
      : fcToday <= 50 ? Math.round(100 - (fcToday - 44) * 3)
      : fcToday <= 60 ? Math.round(82 - (fcToday - 50) * 3.7)
      : fcToday <= 70 ? Math.round(45 - (fcToday - 60) * 4.5)
      : 0;
    globalScoreComponents.push(fcScore);
  }
  if (r0?.hrv != null) {
    const hrvScore = Math.max(0, Math.min(100, Math.round((r0.hrv - 40) / 50 * 100)));
    globalScoreComponents.push(hrvScore);
  }
  const globalScore = globalScoreComponents.length
    ? Math.round(globalScoreComponents.reduce((a,b)=>a+b,0)/globalScoreComponents.length)
    : null;
  const globalScoreEmoji = globalScore===null?'':globalScore>=67?'🟢':globalScore>=34?'🟡':'🔴';
  const globalScoreLabel = globalScore===null?''
    : globalScore>=67?'Bonne forme':globalScore>=34?'Forme moyenne':'Récupération insuffisante';

  let whoopBlock = '';
  if (wd) {
    const r = whoopRecov;
    const s = wd.sleeps && wd.sleeps[0];
    const cy = wd.cycles && wd.cycles[0];
    const lines = [];
    if (r) {
      if (r.score != null) lines.push(`Score de récupération WHOOP : ${r.score}% (${r.score>=67?'VERT — bonne forme':r.score>=34?'JAUNE — modéré':'ROUGE — fatigue'})`);
      if (r.rhr) lines.push(`FC repos WHOOP : ${r.rhr} bpm`);
      if (r.hrv) lines.push(`HRV : ${Math.round(r.hrv)} ms`);
      if (r.spo2) lines.push(`SpO2 : ${Math.round(r.spo2*10)/10}%`);
    }
    if (s) {
      if (s.duration_hours) lines.push(`Durée de sommeil : ${s.duration_hours}`);
      if (s.performance_pct != null) lines.push(`Performance sommeil : ${s.performance_pct}%`);
      if (s.rem_pct) lines.push(`REM : ${s.rem_pct}%`);
    }
    if (cy && cy.strain != null) lines.push(`Charge WHOOP (strain) : ${Math.round(cy.strain*10)/10}`);
    const hist7 = (wd.recoveries||[]).slice(0,7);
    if (hist7.length > 1) {
      const scores = hist7.filter(x=>x.score!=null).map(x=>x.score);
      if (scores.length > 1) { const avg7=Math.round(scores.reduce((a,b)=>a+b,0)/scores.length); lines.push(`Moyenne récup 7 derniers jours : ${avg7}%`); }
    }
    if (lines.length > 0) whoopBlock = '\nDonnées WHOOP du matin :\n'+lines.join('\n');
  }

  const now = new Date();
  const dow = now.getDay();
  const joursLong = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  const moisNoms = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const dateComplet = `${joursLong[dow]} ${now.getDate()} ${moisNoms[now.getMonth()]} ${now.getFullYear()}`;

  let fcSum=0, fcCount=0;
  for (let d=0;d<7;d++) {
    const dd=new Date(now.getTime()-d*86400000);
    const ds=dd.toISOString().slice(0,10);
    const v=parseFloat(state['fc_repos_'+ds]);
    if (v && !isNaN(v)) { fcSum+=v; fcCount++; }
  }
  const fcMoy7j = fcCount > 0 ? Math.round(fcSum/fcCount) : null;

  const paceStrToSec = p => { if(!p)return null; const m=p.replace("'",':').split(':'); if(m.length<2)return null; const s=parseInt(m[0])*60+parseInt(m[1]); return isNaN(s)?null:s; };
  const efPaces = [];
  if (state.ef_pace) { const s=paceStrToSec(state.ef_pace.replace("'",':')); if(s) efPaces.push(s); }
  for (let ws=1;ws<=cw;ws++) {
    for (let si=0;si<5;si++) {
      const pr=state[`w${ws}_s${si}perf`]||state[`s${ws}i${si}perf`];
      if (!pr) continue;
      try { const p=JSON.parse(pr); if ((p.type==='ef'||(!p.type&&state[`edit_w${ws}_s${si}`]&&JSON.parse(state[`edit_w${ws}_s${si}`]).type==='ef'))&&p.pace&&p.hr&&parseInt(p.hr)<=148){const s=paceStrToSec(p.pace);if(s)efPaces.push(s);} } catch(e){}
    }
  }
  let efPace = null;
  if (efPaces.length > 0) {
    let refSec;
    if (efPaces.length < 3) { refSec=Math.min(...efPaces); }
    else { const last3=efPaces.slice(-3); const before3=efPaces.slice(0,-3); const prevBest=before3.length>0?Math.min(...before3):last3[0]; const minL=Math.min(...last3); const medL=[...last3].sort((a,b)=>a-b)[1]; refSec=minL<=prevBest?minL:medL; }
    let _em=Math.floor(refSec/60); let _es=Math.round(refSec%60); if(_es===60){_em++;_es=0;} efPace=`${_em}'${(_es+'').padStart(2,'0')}`;
  }
  efPace = efPace || "6'40";

  const isDecharge = [8,12,16,20,26,30].includes(cw);
  const consignesEf = isDecharge ? `Semaine DÉCHARGE : allure EF lente, FC < 140 bpm` : `Allure EF de référence : ${efPace}/km — FC 140-148 bpm`;
  const memos = state['_coach_memos'] || '';
  const seancesStr = ctx.seancesAujourdHui.length > 0 ? ctx.seancesAujourdHui.join(' + ') : 'Récupération';
  const fcSource = fcWhoopRhr ? 'WHOOP RHR' : 'saisie manuelle';
  const fcLine = fcToday ? `FC repos ce matin : ${fcToday} bpm [${fcSource}] (moyenne 7j : ${fcMoy7j||'—'} bpm)` : 'FC repos non saisie ce matin';
  const memosLine = memos ? `\nNotes coach (mémos) :\n${memos}` : '';
  const seanceRunAujourdhui = ctx.seanceRunAujourdhui || null;
  const seanceHeure = seanceRunAujourdhui?.sched_time || null;
  const seanceHeureDig = seanceHeure ? parseInt(seanceHeure.split(':')[0]) : null;

  let meteoStr = '', tempSeance = null;
  try {
    const locSnap = await db.ref(`${ADMIN_STATE}/_last_location`).once('value');
    const loc = locSnap.val();
    const _tsBrief = loc && loc.ts ? (loc.ts<1e10?loc.ts*1000:loc.ts) : 0;
    const locFresh = loc && loc.lat && _tsBrief && (Date.now()-_tsBrief)<30*24*3600*1000;
    const lat = locFresh ? loc.lat : 48.8417;
    const lng = locFresh ? loc.lng : 2.2945;
    const targetH = seanceHeureDig !== null ? seanceHeureDig : 8;
    const meteoResp = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,apparent_temperature,weather_code,precipitation_probability&timezone=Europe%2FParis&forecast_days=1`);
    const meteoData = await meteoResp.json();
    if (meteoData.hourly) {
      // now.getHours() est UTC — l'API Open-Meteo renvoie des données en heure de Paris
      const nowH = parseInt(new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', hour12: false, timeZone: 'Europe/Paris' }).format(now));
      const tempCurrent = meteoData.hourly.temperature_2m?.[nowH];
      const temp = meteoData.hourly.temperature_2m?.[targetH];
      const apparent = meteoData.hourly.apparent_temperature?.[targetH];
      const wcode = meteoData.hourly.weather_code?.[targetH];
      const rainProb = meteoData.hourly.precipitation_probability?.[targetH]||0;
      const tempEffective = Math.max(temp||0, tempCurrent||0);
      tempSeance = Math.round(tempEffective);
      const ressenti = Math.round(apparent||temp||0);
      const wmoLabel = wcode===0?'Ensoleillé':wcode<=2?'Peu nuageux':wcode<=3?'Couvert':wcode<=48?'Brouillard':wcode<=55?'Bruine':wcode<=67?'Pluie':wcode<=77?'Neige':wcode<=82?'Averses':wcode<=99?'Orage':'Variable';
      meteoStr = `Météo prévue à ${seanceHeure||targetH+'h'} : ${tempSeance}°C (ressenti ${ressenti}°C), ${wmoLabel}${rainProb>40?', risque pluie '+rainProb+'%':''}`;
    }
  } catch(e) {}

  const seanceKm = seanceRunAujourdhui && seanceRunAujourdhui.km > 0 ? parseFloat(seanceRunAujourdhui.km) : 0;
  let gelInfo = 'Pas de gel (sortie <12km)';
  if (seanceKm>=42) gelInfo='8 gels aux km 6, 12, 17, 22, 26, 30, 34 & 38';
  else if (seanceKm>=28) gelInfo='5 gels aux km 6, 12, 17, 22 & 26';
  else if (seanceKm>=24) gelInfo='4 gels aux km 6, 12, 17 & 22';
  else if (seanceKm>=20) gelInfo='3 gels aux km 6, 12 & 17';
  else if (seanceKm>=16) gelInfo='2 gels aux km 6 & 12';
  else if (seanceKm>=12) gelInfo='1 gel au km 6';
  let eauInfo;
  if (seanceKm>=14) eauInfo="1L d'eau (sortie longue ≥14km)";
  else if (seanceKm>0&&seanceKm<10) eauInfo=tempSeance!==null&&tempSeance>=28?`Chaleur ${tempSeance}°C : minimum 500ml d'eau`:"Pas d'eau (sortie <10km, <1h)";
  else eauInfo=tempSeance!==null&&tempSeance>=28?`Chaleur ${tempSeance}°C : minimum 500ml d'eau`:'Pas d\'eau nécessaire';

  let allureAjusteeStr = '';
  if (tempSeance !== null && tempSeance >= 25 && efPace) {
    const efSec=parseInt(efPace.split("'")[0])*60+parseInt(efPace.split("'")[1]||'0');
    const deltaT=Math.max(0,tempSeance-22);
    const ajout=Math.min(60,Math.round((deltaT/3)*8));
    const ajustSec=efSec+ajout;
    const am=Math.floor(ajustSec/60); const as=ajustSec%60;
    allureAjusteeStr=`Allure AJUSTÉE chaleur (${tempSeance}°C) : ${am}'${String(as).padStart(2,'0')}/km (+${ajout} sec/km vs allure de référence)`;
  }

  const system = `Tu es le coach running de Guillaume. Ta mission : rédiger un brief complet et personnalisé du matin, centré uniquement sur la journée d'aujourd'hui. Tu t'adresses DIRECTEMENT à Guillaume en le tutoyant ("tu", jamais "Guillaume" dans le corps du texte).

PROFIL :
- Prépare un marathon (18 octobre 2026), objectif Sub 4h. Plan structuré depuis février 2026.
- FC max 196 bpm. Zone EF : 140-148 bpm. FC repos > 55 bpm = signe de fatigue.
- Montre Garmin Forerunner 165.
- Lundi midi : séance bodyhit (électrostimulation).

STRUCTURE OBLIGATOIRE — dans cet ordre exact :

1. 😴 NUIT & RÉCUPÉRATION — bloc unique fusion sommeil + FC repos. Format OBLIGATOIRE : commencer par le Score du jour en **gras** sur sa propre ligne, puis chaque valeur détaillée sur sa propre ligne, puis UNE phrase d'analyse. Exemple de format attendu :
Score du jour : **76%** 🟢 Bonne forme
Score de récupération WHOOP : **71%** 🟢
FC repos WHOOP : **48 bpm**
VFC : **72 ms**
Durée de sommeil : **7h47**
Performance sommeil : **88%**
[une phrase d'analyse : compare avec moyenne 7j, charge veille, conclusion frais/modéré/fatigué]
Si le Score du jour n'est pas fourni dans le contexte (données insuffisantes), ne pas l'afficher.
Si une valeur n'est pas disponible dans le contexte (ex : VFC non mesurée), ne pas afficher sa ligne.

2. ✅ PRÊT POUR AUJOURD'HUI ? — synthèse de l'état du jour : es-tu bien reposé ? Quelque chose à surveiller ? Vert = feu vert total. Jaune = séance ok mais vigilance. Rouge = séance à adapter. 1-2 phrases directes. Tu t'adresses à moi directement : "Tu arrives...", "Ta récupération...", etc.

3. 🎯 PROGRAMME DU JOUR — lister les activités avec distance et heure. Si run + renfo, tout mentionner. Si repos : dire explicitement "Récupération active" et ce que ça implique.

4. ⚡ CONSIGNES & MÉTÉO — MAX 3 LIGNES au total, ultra-concis, chiffres en **gras** :
   Ligne 1 : allure cible en **gras** + FC cible en **gras** (si chaleur ≥25°C : allure ajustée en **gras** + delta en **gras** à la place).
   Ligne 2 : météo à l'heure de la séance en 1 phrase courte.
   Ligne 3 (optionnel) : 1 consigne technique seulement. Rien d'autre.
   INTERDIT dans ce bloc : toute mention de gel, d'eau ou d'hydratation.

5. 🍌 NUTRITION — UNIQUEMENT si une séance run est planifiée. 2 points UNIQUEMENT :
   GELS : recopier exactement la valeur du champ "Gels" fourni dans le contexte. Si "Pas de gel", ne pas écrire cette ligne.
   EAU : recopier exactement la valeur du champ "Eau" fourni dans le contexte.
   Format : 2 lignes courtes, valeurs en **gras**. Aucun commentaire supplémentaire.

RÈGLES :
- Zéro #. Données chiffrées en **gras**. Ton de coach direct, personnel, naturel.
- Jamais de tirets en début de paragraphe — texte fluide.
- Jamais "Guillaume" dans le corps du texte — toujours "tu/ton/ta".
- Si pas de séance run aujourd'hui : sauter blocs 4 et 5.
- INTERDIT : parler du reste de la semaine, des séances passées, des objectifs à long terme.`;

  const globalScoreLine = globalScore !== null
    ? `Score du jour (synthétique) : ${globalScore}% ${globalScoreEmoji} ${globalScoreLabel} [moyenne récup+sommeil+FC${r0?.hrv!=null?'+VFC':''}]`
    : '';

  const userMsg = `${dateComplet}
${globalScoreLine ? globalScoreLine+'\n' : ''}${fcLine}${whoopBlock}
Séances du jour : ${seancesStr}
Heure de la séance : ${seanceHeure||'non définie'}
${meteoStr||'Météo : non disponible'}
${allureAjusteeStr||'Pas d\'ajustement chaleur nécessaire'}
Allure EF de référence (conditions normales) : ${efPace}/km
Consignes générales : ${consignesEf}
Gels : ${gelInfo}
Eau : ${eauInfo}
${memosLine}`;

  let briefContent = '';
  try {
    briefContent = await callAnthropic(anthropicKey, system, [{role:'user',content:userMsg}], 1100) || '';
  } catch(e) { console.error('generateMorningBriefContent AI error:', e.message); }

  if (!briefContent) {
    briefContent = `😴 NUIT & RÉCUPÉRATION\n${fcLine}\n\n🎯 ${seancesStr}`;
  }

  // Corps de la push notification (résumé)
  // Priorité : score global synthétique > score récup WHOOP seul > rien
  const meteoEmoji = tempSeance===null?'':tempSeance>=28?'🔥':tempSeance>=25?'☀️':tempSeance>=15?'⛅':'🌥️';
  let recovPart = '';
  if (globalScore !== null) {
    recovPart = `Score ${globalScore}%${globalScoreEmoji ? ' '+globalScoreEmoji : ''}`;
  } else {
    const recovScore = whoopToday && whoopRecov && whoopRecov.score != null ? whoopRecov.score : null;
    const recovEmoji = recovScore===null?'':recovScore>=67?'🟢':recovScore>=34?'🟡':'🔴';
    if (recovScore != null) recovPart = `Récup ${recovScore}%${recovEmoji?' '+recovEmoji:''}`;
  }
  const fcPart = fcToday ? `FC ${fcToday} bpm` : '';
  let seancePart = '';
  if (seanceRunAujourdhui) {
    const tl={ef:'EF',tempo:'Tempo',seuil:'Seuil',vma:'VMA',long:'Sortie longue',ef_long:'EF Long'}[seanceRunAujourdhui.type]||seanceRunAujourdhui.type.toUpperCase();
    seancePart=`Séance ${tl}${seanceRunAujourdhui.km>0?' '+seanceRunAujourdhui.km+'km':''} 🏃${seanceHeure?' à '+seanceHeure:''}`;
  } else { seancePart = 'Pas de séance run'; }
  let pushBody = `${recovPart}${recovPart&&(fcPart||seancePart)?' · ':''}${fcPart}${fcPart&&seancePart?' · ':''}${seancePart}${meteoEmoji?' '+meteoEmoji:''}`.trim();
  if (pushBody.length > 180) pushBody = pushBody.slice(0,177)+'...';

  return { briefContent, pushBody };
}

// Génère le bilan de semaine (3 parties : récup WHOOP 7j, ressenti, récap séances)
// Utilisé par weeklyBilanNotif (scheduler) ET adminTestNotif (test immédiat)
async function generateWeeklyBilanContent(anthropicKey, db, state, cw) {
  const wd = state['whoop_data'] || null;
  const now = new Date();

  // ── WHOOP 7 jours ──────────────────────────────────────────────────────────
  let whoopBlock = '';
  let avgRecov = null, avgHrv = null, avgSleep = null;
  const recovEmojis = [];
  if (wd) {
    const recoveries = (wd.recoveries || []).slice(0, 7);
    const sleeps = (wd.sleeps || []).slice(0, 7);
    const scores = recoveries.filter(r => r.score != null).map(r => r.score);
    const hrvs = recoveries.filter(r => r.hrv != null).map(r => Math.round(r.hrv));
    const rhrs = recoveries.filter(r => r.rhr != null).map(r => r.rhr);
    const sleepPerfs = sleeps.filter(s => s.performance_pct != null).map(s => s.performance_pct);
    const strains = (wd.cycles || []).slice(0, 7).filter(c => c.strain != null).map(c => c.strain);
    const lines = [];
    if (scores.length > 0) {
      avgRecov = Math.round(scores.reduce((a,b) => a+b, 0) / scores.length);
      const best = Math.max(...scores), worst = Math.min(...scores);
      scores.forEach(s => recovEmojis.push(s >= 67 ? '🟢' : s >= 34 ? '🟡' : '🔴'));
      lines.push(`Score récup moyen (${scores.length}j) : ${avgRecov}% — min ${worst}% / max ${best}%`);
    }
    if (hrvs.length > 0) { avgHrv = Math.round(hrvs.reduce((a,b) => a+b, 0) / hrvs.length); lines.push(`HRV moyen : ${avgHrv} ms`); }
    if (rhrs.length > 0) { const avg = Math.round(rhrs.reduce((a,b) => a+b, 0) / rhrs.length); lines.push(`FC repos moyenne WHOOP : ${avg} bpm`); }
    if (sleepPerfs.length > 0) { avgSleep = Math.round(sleepPerfs.reduce((a,b) => a+b, 0) / sleepPerfs.length); lines.push(`Performance sommeil moyenne : ${avgSleep}%`); }
    if (strains.length > 0) { lines.push(`Charge WHOOP totale semaine (strain) : ${Math.round(strains.reduce((a,b) => a+b, 0)*10)/10}`); }
    if (lines.length > 0) whoopBlock = '\nDonnées WHOOP sur la semaine :\n' + lines.join('\n');
  }

  // ── FC repos manuelle 7j ───────────────────────────────────────────────────
  let fcSum = 0, fcCount = 0, fcMin = 999, fcMax = 0;
  for (let d = 0; d < 7; d++) {
    const dd = new Date(now.getTime() - d * 86400000);
    const ds = dd.toISOString().slice(0,10);
    const v = parseFloat(state['fc_repos_' + ds]);
    if (v && !isNaN(v)) { fcSum += v; fcCount++; if (v < fcMin) fcMin = v; if (v > fcMax) fcMax = v; }
  }
  const fcMoyBlock = fcCount >= 3 ? `\nFC repos manuelle (${fcCount}j) : moy ${Math.round(fcSum/fcCount)} bpm, min ${fcMin}, max ${fcMax}` : '';

  // ── Séances de la semaine ──────────────────────────────────────────────────
  const ctx = await buildNotifContext(state, cw);
  const seancesDone = ctx.seancesDone || [];
  const seancesManquees = ctx.seancesRestantes || [];
  const kmSemaine = ctx.kmSemaine || 0;
  const renfo = [1, 2].filter(r => !!state[`rf${cw}r${r}done`]).length;
  const typeSem = ctx.typeSem || ([8,12,16,20,26,30].includes(cw) ? 'DÉCHARGE' : 'CHARGE');
  const memos = state['_coach_memos'] || '';

  // Score semaine global (séances + récup)
  const pctSeances = (seancesDone.length + seancesManquees.length) > 0
    ? Math.round(seancesDone.length / (seancesDone.length + seancesManquees.length) * 100) : 100;
  const scoreComps = [pctSeances];
  if (avgRecov != null) scoreComps.push(avgRecov);
  if (avgSleep != null) scoreComps.push(avgSleep);
  const scoreGlobal = Math.round(scoreComps.reduce((a,b) => a+b, 0) / scoreComps.length);
  const scoreEmoji = scoreGlobal >= 67 ? '🟢' : scoreGlobal >= 40 ? '🟡' : '🔴';

  const system = `Tu es le coach running de Guillaume. Ta mission : rédiger un bilan de semaine court, personnalisé et direct. Tu t'adresses DIRECTEMENT à lui en le tutoyant ("tu", jamais "Guillaume" dans le corps du texte).

PROFIL :
- Prépare un marathon (18 octobre 2026), objectif Sub 4h. ${32-cw} semaines restantes.
- FC max 196 bpm. Zone EF : 140-148 bpm. FC repos > 55 bpm = signe de fatigue.

STRUCTURE OBLIGATOIRE — dans cet ordre exact, chaque section séparée par une ligne vide :

😴 RÉCUPÉRATION — BILAN S${cw}
Format OBLIGATOIRE : commencer par le Score semaine sur sa propre ligne en **gras**, puis chaque valeur WHOOP sur sa propre ligne, puis UNE phrase d'analyse. Exemple :
Score semaine : **72%** 🟡
Score récup moyen : **68%** 🟡
HRV moyen : **54 ms**
FC repos moyenne : **49 bpm**
Sommeil moyen : **76%**
[une phrase d'analyse : la semaine a-t-elle été bien récupérée ? Signe de surcharge ? Tendance par rapport aux séances réalisées ?]
Si une valeur n'est pas disponible, ne pas afficher sa ligne. Si pas de données WHOOP : analyse uniquement la FC repos manuelle.

💭 RESSENTI DE LA SEMAINE
En 2-3 phrases directes : comment s'est passée la semaine d'entraînement ? Était-ce une semaine chargée ou légère ? La récupération a-t-elle suivi l'effort ? Y a-t-il des signaux de fatigue accumulée ou au contraire une bonne progression ? Sois direct : "Cette semaine...", "Tu as...", etc. Ne répète pas les chiffres déjà donnés — analyse le ressenti et la qualité.

📊 RÉCAP RAPIDE
Format : 1-2 lignes factuelles, chiffres en **gras**, rien d'autre.
Ex : **3/4 séances** validées · **${kmSemaine}km** réalisés · **${renfo}/2 renfos**
Séances : [liste courte des types faits]
Si séances manquées : les mentionner brièvement sans dramatiser.

RÈGLES :
- Zéro #. Données chiffrées en **gras**. Ton direct et naturel.
- Jamais de tirets en début de paragraphe.
- Jamais "Guillaume" dans le corps du texte.
- 3 blocs maximum, dans l'ordre exact ci-dessus.`;

  const userMsg = `Semaine S${cw} (${typeSem}) — ${32-cw} semaines avant le marathon.
Séances validées : ${seancesDone.length}/${seancesDone.length + seancesManquees.length}
Détail : ${seancesDone.join(', ') || 'aucune'}
Séances manquées : ${seancesManquees.join(', ') || 'aucune'}
Km réalisés : ${kmSemaine}km
Renfos : ${renfo}/2
Score semaine (synthétique) : ${scoreGlobal}% ${scoreEmoji}${whoopBlock}${fcMoyBlock}
${memos ? 'Notes coach : ' + memos : ''}`;

  let bilanContent = '';
  try {
    bilanContent = await callAnthropic(anthropicKey, system, [{role:'user', content: userMsg}], 800) || '';
  } catch(e) { console.error('generateWeeklyBilanContent AI error:', e.message); }

  if (!bilanContent) {
    bilanContent = `😴 RÉCUPÉRATION — BILAN S${cw}\nScore semaine : **${scoreGlobal}%** ${scoreEmoji}\n\n💭 RESSENTI\nSemaine ${typeSem.toLowerCase()} de ${seancesDone.length + seancesManquees.length} séances planifiées.\n\n📊 RÉCAP\n**${seancesDone.length}/${seancesDone.length + seancesManquees.length} séances** · **${kmSemaine}km** · **${renfo}/2 renfos**`;
  }

  // Corps push : court et informatif
  const recovPart = avgRecov != null ? `Récup moy ${avgRecov}% ${avgRecov>=67?'🟢':avgRecov>=34?'🟡':'🔴'}` : '';
  const seancePart = `${seancesDone.length}/${seancesDone.length + seancesManquees.length} séances · ${kmSemaine}km`;
  let pushBody = `S${cw} ${scoreEmoji} ${scoreGlobal}% · ${seancePart}${recovPart ? ' · ' + recovPart : ''}`;
  if (pushBody.length > 180) pushBody = pushBody.slice(0, 177) + '...';

  return { bilanContent, pushBody, scoreGlobal, scoreEmoji };
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
  generateMorningBriefContent,
  generateWeeklyBilanContent,
};
