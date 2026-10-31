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

async function callAnthropic(apiKey, system, messages, maxTokens, model = 'claude-sonnet-4-6', opts = {}) {
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
  }, opts.timeout || 55000);
  const data = await response.json();
  console.log('Anthropic status:', response.status, 'data:', JSON.stringify(data).substring(0, 300));
  if (opts.full) return { text: data.content?.[0]?.text || null, stop: data.stop_reason || null };
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

// Semaine en cours : plan Seine-Eure (dates fixes) ou, si st est l'état d'une prépa générée (st._plan_engine), depuis plan_start_date
function getCurrentWeek(st) {
  if (st && typeof st === 'object' && st._plan_engine) return weekFromStart(st.plan_start_date, totalWeeksFor(st));
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

// ─── Prépa en cours de l'admin (Compte › Mes prépas › Nouvelle prépa → state._plan_engine = 'generated') ───
function weekFromStart(start, total) {
  if (!start) return 1;
  // même calcul que l'app (getAthleteCW) : semaines écoulées depuis plan_start_date (un lundi)
  const n = Math.floor(Math.floor((Date.now() - new Date(String(start).slice(0, 10)).getTime()) / 86400000) / 7) + 1;
  return Math.max(1, Math.min(total || 60, n));
}
function totalWeeksFor(st) {
  if (!st || !st._plan_engine) return 32;
  try { const n = JSON.parse(st.plan_config || '{}').numWeeks; if (n > 0) return n; } catch (e) {}
  let t = 0; for (let ws = 1; ws <= 60; ws++) { if (st['extra_w' + ws + '_s0'] !== undefined) t = ws; else if (ws > t + 4) break; }
  return t || 1;
}
function getPrepInfo(st) {
  if (!st || !st._plan_engine) return { generated: false, total: 32, course: 'Marathon', name: 'Marathon Seine-Eure', date: '2026-10-18', label: '18 octobre 2026', objectif: 'Sub 4h' };
  const ob = st.onboarding || {}, d = ob.date || '';
  const label = d ? new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }) : 'date non définie';
  const tt = String(st.target_time || ob.target_time || '').replace(/^00:/, '').replace(/^0(?=\d:)/, '');
  return { generated: true, total: totalWeeksFor(st), course: ob.course || 'course', name: ob.race_name || ob.course || 'Course objectif', date: d, label, objectif: tt || 'non défini' };
}
function prepObjectiveText(st) {
  const p = getPrepInfo(st);
  return `Prépare : ${p.course}${p.name && p.name !== p.course ? ' « ' + p.name + ' »' : ''} le ${p.label}, objectif ${p.objectif}. Programme de ${p.total} semaines (prépa précédente : marathon Seine-Eure du 18 octobre 2026, terminé).`;
}
// Type de semaine d'une prépa générée (lu dans meta_w*) ; le plan Seine-Eure garde sa table fixe
function weekTypeFor(st, ws) {
  try { const m = JSON.parse(st['meta_w' + ws] || '{}'); return m.isRecov ? 'décharge' : m.isTaper ? 'affûtage' : 'charge'; } catch (e) { return 'charge'; }
}
// Lecture légère des clés de la prépa de l'admin (sans charger tout l'état)
async function loadPrepState(db) {
  const keys = ['_plan_engine', 'plan_start_date', 'plan_config', 'onboarding', 'target_time'];
  const vals = await Promise.all(keys.map(k => db.ref(`${ADMIN_STATE}/${k}`).once('value').then(s => s.val()).catch(() => null)));
  const st = {}; keys.forEach((k, i) => { if (vals[i] !== null && vals[i] !== undefined) st[k] = vals[i]; });
  return st;
}
async function adminCurrentWeek(db) { return getCurrentWeek(await loadPrepState(db)); }

// Titre d'une séance, identique à l'app (config.js › normalizeSessionTitle) : « Sortie longue », « Footing EF »,
// « Tempo 3×6 min », « Fractionné 4×1000 m »…
function sessionTitleOf(s) {
  if (!s) return '';
  const p = String(s.d || '').split('|'), t = (p[0] || '').trim(), type = s.type;
  if (!t) return (type || '').toUpperCase();
  const compact = x => x.replace(/(\d)[\s\u202f\u00a0]+(\d{3})\b/g, '$1$2').replace(/(\d)\s*[×x]\s*(\d)/g, '$1×$2')
    .replace(/\s+à\s+AS21\b/i, ' allure semi').replace(/\s+tempo$/i, '').trim();
  if (type === 'long') return /^sortie longue\b/i.test(t) ? 'Sortie longue' + t.slice(13) : 'Sortie longue';
  if (type === 'ef') {
    if (/^(Marche-Course|Course progressive)/.test(t)) return t;
    if (/accél|strides|éducatifs|lignes droites|progressives/i.test(t + ' ' + (p[1] || ''))) return 'Footing EF + accélérations';
    if (/\bAM\b/.test(t)) return 'Footing EF + allure marathon';
    return 'Footing EF';
  }
  if (type === 'tempo') return /^tempo\b/i.test(t) ? compact(t) : 'Tempo ' + compact(t);
  if (type === 'frac') return /^(Fractionné|Séance côtes|Côtes|Fartlek|Course en progression|VMA)/i.test(t) ? compact(t) : 'Fractionné ' + compact(t);
  return t;
}
// ─── Situation d'entraînement (briefs du matin, Coach) ───────────────────────
// Vision complète au jour J : prépa en cours (semaine, phase, J-x), dernière course et période de récupération
// qui suit, prépa suivante, historique des courses, records, charge des 7 / 14 derniers jours, séance du jour.
const RECOVERY_DAYS = { 'Marathon': 26, 'Semi-marathon': 13, '10 km': 6, '5 km': 3 };   // ≈ 1 jour par mile couru
function raceCategory(dist, km) {
  const d = String(dist || '').toLowerCase(), k = parseFloat(km) || 0;
  if (/semi/.test(d) || (k > 20 && k < 22)) return 'Semi-marathon';
  if (/marathon/.test(d) || k > 41) return 'Marathon';
  if (/10/.test(d) || (k > 9 && k < 11)) return '10 km';
  if (/^5|5 km/.test(d) || (k > 4.5 && k < 5.5)) return '5 km';
  return null;
}
function parisToday() { return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date()); }
// Heure de coucher conseillée (même calcul que l'app, body-signals.js bsBedtime) : séance du lendemain (réveil 50 min avant
// si elle est le matin, sinon 7h), besoin de sommeil (_sleep_target_h, 8 h par défaut), moitié de la dette des 3 dernières
// nuits WHOOP (1 h au plus), +15 min avant une séance clé, 15 min pour s'endormir. null sans séance demain.
function bedtimePlan(state, today) {
  state = state || {};
  const add = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const tomorrow = add(today, 1), sess = [];
  for (let w = 1; w <= 60; w++) for (let ei = 0; ei <= 50 && state[`extra_w${w}_s${ei}`] !== undefined; ei++) {
    let x = {}; try { x = JSON.parse(state[`extra_w${w}_s${ei}`]) || {}; } catch (e) {}
    if (x.sched_date === tomorrow && x.type !== 'rest' && !state[`extra_w${w}_s${ei}_done`] && !state[`extra_w${w}_s${ei}_skip`]) sess.push(x);
  }
  if (!sess.length) return null;
  sess.sort((a, b) => String(a.sched_time || '99').localeCompare(String(b.sched_time || '99')));
  const s = sess[0], tm = String(s.sched_time || '').match(/^(\d{1,2}):(\d{2})/), sm = tm ? +tm[1] * 60 + +tm[2] : null;
  const wake = sm != null && sm < 12 * 60 ? sm - 50 : 7 * 60;
  const target = (parseFloat(state._sleep_target_h) || 8) * 60;
  const sleeps = ((state.whoop_data || {}).sleeps || []).filter((x) => x && x.date && x.date <= today).slice(0, 3);
  const dur = (t) => { const m = String(t || '').match(/(\d+)h(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  const debt = sleeps.reduce((a, x) => { const d = dur(x.duration_hours); return a + (d != null ? Math.max(0, target - d) : 0); }, 0);
  const extra = Math.min(60, Math.round(debt / 2 / 5) * 5), key = /tempo|frac|long|race/.test(s.type) ? 15 : 0;
  let bed = wake - target - extra - key - 15; if (bed < 0) bed += 1440;
  const hm = (m) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
  const title = String(s.d || '').split('|')[0] || 'séance';
  return { bed: hm(bed), bedMin: bed, wake: hm(wake), session: title, time: tm ? hm(sm) : null, type: s.type, debtMin: Math.round(debt), extraMin: extra, key: !!key };
}

// ─── Nuit WHOOP du jour UNIQUEMENT (jamais celle de la veille) : récupération et sommeil datés d'aujourd'hui ───
function whoopNight(wd, todayStr) {
  const r = wd && Array.isArray(wd.recoveries) ? wd.recoveries.find((x) => x && String(x.date || '').slice(0, 10) === todayStr) || null : null;
  const s = wd && Array.isArray(wd.sleeps) ? wd.sleeps.find((x) => x && String(x.date || '').slice(0, 10) === todayStr) || null : null;
  return { r, s };
}
const WHOOP_MISSING_TEXT = '\nDonnées WHOOP de cette nuit : NON DISPONIBLES (synchronisation échouée ou nuit pas encore calculée par WHOOP). N\'affiche AUCUN chiffre de récupération, de VFC ni de sommeil (ceux d\'une autre nuit seraient faux) : dis clairement en une phrase, dans le bloc nuit, que les données WHOOP de cette nuit ne sont pas disponibles.';

// ─── Alcool la veille (saisie du matin dans l'app, alcohol.js) : effet estimé avec le modèle personnel (_alcohol_model) ───
const ALC_PRIOR_SRV = { rec: -2.6, hrv: -2.4, rhr: 0.7, sleep: -2.0 };
const ALC_TYPE_TXT = { beer: 'bière', wine: 'vin', spirits: 'alcool fort' };
function alcoholBriefText(state, todayStr) {
  const A = (state && state._alcohol) || {}, e = A[todayStr];
  if (!e) return 'Alcool hier soir : non renseigné (ne fais aucune supposition).';
  if (!(+e.l > 0)) return 'Alcool hier soir : AUCUN — la récupération reflète l\'entraînement et la nuit.';
  const M = state._alcohol_model && state._alcohol_model.rec != null ? state._alcohol_model : ALC_PRIOR_SRV, l = +e.l;
  const types = (e.t || []).map((t) => ALC_TYPE_TXT[t]).filter(Boolean).join(', ');
  const r = Math.round(M.rec * l), h = Math.round(M.hrv * l), f = Math.round(M.rhr * l * 10) / 10, s = Math.round(M.sleep * l);
  const src = state._alcohol_model && state._alcohol_model.personal ? `modèle personnel (${state._alcohol_model.nAlc} soirées)` : 'estimation générale';
  const recent = Object.keys(A).filter((d) => d < todayStr && Date.parse(todayStr) - Date.parse(d) <= 7 * 864e5 && +A[d].l > 0).length;
  return `Alcool hier soir : ${l}/10${types ? ' (' + types + ')' : ''}. Effet estimé sur cette nuit (${src}) : récupération ${r} pts, VFC ${h} %, FC repos +${f} bpm, sommeil ${s} pts.${recent ? ' Autres soirées avec alcool sur les 7 derniers jours : ' + recent + '.' : ''}
RÈGLE ALCOOL : cette part de la baisse (récupération, VFC, FC repos, sommeil) vient de l'alcool, PAS de l'entraînement — ne l'attribue jamais à une séance trop rapide ou à la charge, ne propose pas d'alléger les jours suivants pour ça. Dis-le simplement, sans morale, en une phrase dans le bloc nuit ; conseille hydratation et sommeil ; une séance de qualité aujourd'hui se fait aux sensations (allure plus prudente, FC plus haute que d'habitude normale).`;
}

// ─── Brief du matin d'un jour de repos (aucune séance ni renfo aujourd'hui) : nuit, récupération, séance de demain ───
function isRestDay(ctx, sit) {
  return !(ctx && ctx.seanceRunAujourdhui) && !((ctx && ctx.seancesAujourdHui) || []).length && !((sit && sit.todaySessions) || []).length;
}
function restBriefSystem(state, sit) {
  // rubrique de la prochaine séance : « DEMAIN » seulement si elle est demain, sinon son jour (« MARDI »)
  const N = sit && sit.nextSession;
  const jour = N && !N.tomorrow ? new Date(N.date + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', timeZone: 'UTC' }).toUpperCase() : '';
  const block3 = !N
    ? `3. 📅 PROCHAINE SÉANCE — aucune séance n'est prévue pour l'instant : le dire en une phrase et inviter à la planifier (ou en parler au Coach dans « Mon plan »).`
    : N.tomorrow
    ? `3. 📅 DEMAIN — la séance de demain (fournie dans « Prochaine séance ») : type, distance et heure en **gras**, avec sa consigne d'allure en **gras** si elle est fournie, en une phrase. Puis une phrase pour s'y préparer dès ce soir : l'heure de coucher conseillée en **gras** si elle est fournie, et, pour une sortie longue ou une séance de qualité, un repas du soir adapté. Si des ajustements de la nuit concernent cette séance, dire ce qui a changé et pourquoi en une phrase.`
    : `3. 📅 PROCHAINE SÉANCE : ${jour} — titre EXACT de la rubrique : « 📅 PROCHAINE SÉANCE · ${jour.charAt(0) + jour.slice(1).toLowerCase()} ». Elle n'est PAS demain : ne jamais écrire « demain » pour la désigner. Donne son jour, son type, sa distance et son heure en **gras**, avec sa consigne d'allure en **gras** si elle est fournie, en une phrase ; puis une phrase sur la façon de profiter des jours sans course d'ici là (récupérer, dormir, rester actif en douceur). Pas d'heure de coucher ni de repas de veille aujourd'hui. Si des ajustements de la nuit concernent cette séance, le dire en une phrase.`;
  return `Tu es le coach running de Guillaume. Aujourd'hui est un JOUR DE REPOS : aucune séance ni renfo de prévu. Rédige un brief du matin court, centré sur sa récupération et sur la séance qui vient. Tu le tutoies ("tu", jamais "Guillaume" dans le texte).

PROFIL :
- ${state && state._plan_engine ? prepObjectiveText(state) : 'Prépare sa prochaine course.'}
- FC max 196 bpm. FC repos > 55 bpm = signe de fatigue.

STRUCTURE OBLIGATOIRE — dans cet ordre, rien d'autre :

1. 😴 NUIT & RÉCUPÉRATION — commencer par le Score du jour en **gras** sur sa propre ligne (s'il est fourni), puis chaque valeur disponible sur sa propre ligne (score de récupération WHOOP, FC repos, VFC, durée et performance du sommeil), puis UNE phrase d'analyse (comparaison avec la moyenne 7 j, conclusion : bien récupéré / modéré / fatigué). Ne pas afficher une valeur absente.

2. 🧘 TA JOURNÉE DE REPOS — 2 phrases au plus : ce que le repos doit t'apporter aujourd'hui d'après ta récupération (repos complet si la récupération est basse ; sinon marche, mobilité ou étirements doux sont possibles) et un conseil concret pour la journée (hydratation, alimentation ou sommeil ce soir). Si une période post-course est indiquée dans la situation, la rappeler en quelques mots ici.

${block3}

INTERDIT : bloc « prêt pour aujourd'hui », séance du jour, consignes d'allure ou météo pour aujourd'hui, gels, eau pendant l'effort, organisation du plan ou de la semaine, récapitulatif des séances passées.
RÈGLES : zéro #, données chiffrées en **gras**, ton de coach direct et chaleureux, texte fluide sans tirets en début de ligne.`;
}
function restBriefData(state, todayStr, sit) {
  const N = sit && sit.nextSession;
  const fmt = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const lines = ['AUJOURD\'HUI : jour de repos (aucune séance prévue).'];
  if (N) lines.push(`Prochaine séance : ${N.tomorrow ? 'DEMAIN ' : 'PAS DEMAIN — '}${fmt(N.date)} — ${N.title} ${N.km} km${N.time ? ' à ' + N.time : ''}${N.consigne ? ' — consigne : ' + N.consigne : ''}`);
  else lines.push('Prochaine séance : aucune de prévue pour l\'instant.');
  const B = bedtimePlan(state, todayStr);
  if (B) lines.push(`Heure de coucher conseillée ce soir : ${B.bed} (réveil ${B.wake}${B.extraMin ? ', +' + B.extraMin + ' min pour rattraper la dette de sommeil' : ''})`);
  const L = state && state._autopilot_last;
  if (N && L && L.date === todayStr && !L.undone && Array.isArray(L.changes)) {
    const ch = L.changes.filter((c) => c.date === N.date);
    if (ch.length) lines.push(`Ajustements de la nuit sur cette séance (${L.applied ? 'appliqués, annulables' : 'proposés'}) : ` + ch.map((c) => `${c.title} — ${c.field} : ${c.before} → ${c.after}${c.why ? ' (' + c.why + ')' : ''}`).join(' ; '));
  }
  return lines.join('\n');
}
// ligne de la notification d'un jour de repos
function restPushPart(sit) {
  const N = sit && sit.nextSession; if (!N) return 'Jour de repos';
  const when = N.tomorrow ? 'demain' : new Date(N.date + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', timeZone: 'UTC' });
  return `Repos · ${when} : ${N.title}${N.km ? ' ' + N.km + ' km' : ''}${N.time ? ' à ' + N.time : ''}`;
}

// Ajustements de la nuit du pilote automatique (autopilot.js / autopilot.js serveur) pour le brief du matin
function autopilotBriefText(state, todayStr) {
  const L = state && state._autopilot_last, head = 'Ajustements de la nuit (pilote automatique)';
  if (!L || L.date !== todayStr || !Array.isArray(L.changes) || !L.changes.length) return head + ' : aucun — séance confirmée telle que prévue.';
  if (L.undone) return head + ' : annulés par toi ce matin — plan d\'origine rétabli.';
  const F = { detail: 'allure / consigne', km: 'km', session: 'séance', title: 'intitulé', type: 'type' };
  return head + (L.applied ? ' — APPLIQUÉS automatiquement (annulables par le bouton Annuler sous le brief) :\n' : ' — PROPOSÉS seulement (mode « sur proposition », rien n\'est modifié) :\n')
    + L.changes.slice(0, 8).map((c) => `- ${c.today ? 'AUJOURD\'HUI' : c.date} · ${c.title} — ${F[c.field] || c.field} : ${c.before} → ${c.after}${c.why ? ' (raison : ' + c.why + ')' : ''}`).join('\n');
}

// plafond FC de l'endurance : zones recalées par l'app (_hr_zones, body-signals.js) sinon 148 bpm
function efMaxOf(state) { const z = state && state._hr_zones; return z && z.applied && z.efMax >= 120 && z.efMax <= 185 ? z.efMax : 148; }
// allure EF de référence calculée par l'app sur TOUT l'historique (toutes les prépas) : _ef_ref { pace, at }, récente (≤ 7 j)
function efRefOf(state, todayStr) {
  const r = state && state._ef_ref; if (!r || !r.pace || !r.at) return null;
  const t = todayStr || parisToday();
  return Math.round((Date.parse(t + 'T12:00:00Z') - Date.parse(String(r.at).slice(0, 10) + 'T12:00:00Z')) / 86400000) <= 7 ? r.pace : null;
}

async function buildTrainingSituation(db, state, todayStr, opts) {
  opts = opts || {};
  state = state || {};
  const today = todayStr || parisToday();
  const base = ADMIN_STATE.replace(/\/state$/, '');
  let idx = {}, next = null;
  try { idx = (await db.ref(base + '/prep_index').once('value')).val() || {}; } catch (e) {}
  try { next = (await db.ref(base + '/prep_next/meta').once('value')).val(); } catch (e) {}
  const days = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
  const fmtD = (d) => d ? new Date(String(d).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
  const fmtT = (t) => String(t || '').replace(/^00:/, '').replace(/^0(?=\d:)/, '');
  const lines = [];
  const gen = !!state._plan_engine, P = getPrepInfo(state), cw = getCurrentWeek(state), tot = totalWeeksFor(state);

  // séances de la prépa en cours : date, type, km, réalisé
  const sess = [];
  for (let w = 1; w <= 60; w++) {
    for (let ei = 0; ei <= 50 && state[`extra_w${w}_s${ei}`] !== undefined; ei++) {
      let x = {}, perf = {}; try { x = JSON.parse(state[`extra_w${w}_s${ei}`]) || {}; } catch (e) {}
      try { perf = JSON.parse(state[`extra_w${w}_s${ei}_perf`] || '{}') || {}; } catch (e) {}
      const done = !!(state[`extra_w${w}_s${ei}_done`] || state[`extra_w${w}_s${ei}_km`] != null);
      const km = done && parseFloat(state[`extra_w${w}_s${ei}_km`]) > 0 ? parseFloat(state[`extra_w${w}_s${ei}_km`]) : parseFloat(x.km) || 0;
      sess.push({ w, x, perf, done, km, date: String(perf.date || x.sched_date || '').slice(0, 10) });
    }
  }

  // prépa en cours
  if (gen) {
    let meta = {}; try { meta = JSON.parse(state['meta_w' + cw] || '{}') || {}; } catch (e) {}
    const j = P.date ? days(today, P.date) : null;
    const phase = meta.phase ? (typeof meta.phase === 'string' ? meta.phase : ['', 'base', 'construction', 'spécifique', 'affûtage'][meta.phase] || '') : '';
    const typ = meta.isRecov ? 'semaine allégée' : meta.isTaper ? 'affûtage' : meta.isPeak ? 'pic de volume' : '';
    lines.push(`Prépa en cours : ${P.name} (${P.course}) le ${P.label}, objectif ${P.objectif} — semaine ${cw}/${tot}`
      + (phase ? ` « ${phase} »` : '') + (typ ? ` (${typ})` : '') + (j !== null ? (j > 0 ? ` — J-${j}` : j === 0 ? ' — JOUR DE COURSE' : ` — course passée (J+${-j})`) : '') + '.');
    const wk = sess.filter((s) => s.w === cw && s.x.type !== 'rest');
    if (wk.length) lines.push(`Cette semaine : ${wk.filter((s) => s.done).length}/${wk.length} séances faites, ${Math.round(wk.filter((s) => s.done).reduce((a, s) => a + s.km, 0))}/${Math.round(wk.reduce((a, s) => a + (parseFloat(s.x.km) || 0), 0))} km.`);
  } else {
    lines.push(`Prépa en cours : marathon Seine-Eure (18 octobre 2026), semaine ${cw}/32.`);
  }

  // courses passées : fiches « Mes prépas » + course de la prépa en cours si elle est courue
  const races = [];
  // fiches : course passée (ou courue aujourd'hui, temps saisi) ; la prépa en cours ne compte que par sa séance « course » validée
  Object.keys(idx).forEach((id) => { const p = idx[id]; if (p && p.date && id !== state._prep_id && (p.date < today || (p.date === today && p.result))) races.push({ name: p.race || p.title, date: p.date, dist: p.dist || '', result: p.result || '', note: p.note || '', km: p.stats && p.stats.km, weeks: p.stats && p.stats.weeks }); });
  sess.filter((s) => s.x.type === 'race' && s.done && s.date && s.date <= today).forEach((s) => {
    const off = state._race_result && state._race_result.time;
    races.push({ name: P.name || sessionTitleOf(s.x), date: s.date, dist: gen ? P.course : '', result: off || s.perf.official || '', note: '' });
  });
  const seen = new Set();
  const list = races.sort((a, b) => b.date.localeCompare(a.date)).filter((r) => { const k = r.date + '|' + r.name; if (seen.has(k)) return false; seen.add(k); return true; });
  const last = list[0];
  if (last) {
    const ago = days(last.date, today), cat = raceCategory(last.dist), rec = RECOVERY_DAYS[cat];
    lines.push(`Dernière course : ${last.name}${last.dist ? ' (' + last.dist + ')' : ''} le ${fmtD(last.date)}${last.result ? ' en ' + last.result : ''}${last.note ? ' — ' + last.note : ''} — il y a ${ago} jour${ago > 1 ? 's' : ''}.`);
    if (rec && ago >= 0 && ago < rec) lines.push(`→ PÉRIODE POST-COURSE : J+${ago} sur ~${rec} jours de récupération après un ${cat === 'Marathon' ? 'marathon' : cat === 'Semi-marathon' ? 'semi-marathon' : cat}. ${opts.planReview ? 'Reprise progressive : footings faciles d\'abord, puis intensité réintroduite peu à peu (lignes droites, puis fractionné court) à partir des ~3/4 de la récupération si sensations, FC repos, VFC et récupération WHOOP sont bonnes ; sinon alléger ou repos.' : 'Reprise progressive : footings faciles et courts, aucune intensité tant que la récupération n\'est pas complète ; se fier aux sensations, à la FC repos, à la VFC et à la récupération WHOOP plutôt qu\'à l\'allure ; FC repos ou VFC dégradées = alléger ou repos.'}`);
  }
  // base d'entraînement : volume habituel de la dernière prépa terminée (8 semaines avant l'affûtage)
  const lastPrep = Object.keys(idx).map((id) => Object.assign({ id }, idx[id])).filter((p) => p.date && p.date <= today && p.id !== state._prep_id && Array.isArray(p.shape) && p.shape.length)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (lastPrep) {
    const sh = lastPrep.shape; let end = sh.length; for (let i = sh.length - 1; i >= 0; i--) if (sh[i] && sh[i][2] === 'c') { end = i; break; }
    let w = sh.slice(0, end).filter((x) => x && x[2] !== 't'); if (!sh.some((x) => x && x[2] === 't')) w = w.slice(0, Math.max(0, w.length - 2));
    const done = w.map((x) => +x[1] || 0).filter((x) => x > 0).slice(-8);
    if (done.length >= 3) {
      const avg = Math.round(done.reduce((a, b) => a + b, 0) / done.length), peak = Math.round(Math.max(...sh.map((x) => +(x && x[1]) || 0)));
      lines.push(`Base d'entraînement (prépa ${lastPrep.race || lastPrep.title}) : ~${avg} km/semaine en moyenne sur les 8 semaines avant l'affûtage, pic ${peak} km/semaine — c'est sa charge habituelle : en reprise, remonter vers ce volume est normal.`);
    }
  }
  if (next && next.date) lines.push(`Prépa suivante : ${next.title}${next.dist ? ' (' + next.dist + ')' : ''} le ${fmtD(next.date)}${next.target ? ', objectif ' + fmtT(next.target) : ''} — démarre le ${fmtD(next.start)}.`);
  if (list.length) lines.push('Courses réalisées : ' + list.slice(0, 5).map((r) => `${r.name} (${r.date.split('-').reverse().join('/')}${r.result ? ', ' + r.result : ''}${r.weeks ? ', prépa de ' + r.weeks + ' sem. / ' + r.km + ' km' : ''})`).join(' · ') + '.');

  // records
  const rec = [];
  const recFrom = (cat, key) => {
    let best = null; const take = (t) => { const p = String(t || '').replace(/['’h]/g, ':').split(':').map(Number); const s = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : null; if (s > 0 && (!best || s < best.s)) best = { s, t: String(t) }; };
    take(state[key]); list.forEach((r) => { if (raceCategory(r.dist) === cat) take(r.result); });
    if (best) rec.push(`${cat === 'Semi-marathon' ? 'semi' : cat.toLowerCase()} ${best.t}`);
  };
  recFrom('5 km', 'record_5km'); recFrom('10 km', 'record_10km'); recFrom('Semi-marathon', 'record_semi'); recFrom('Marathon', 'record_marathon');
  if (rec.length) lines.push('Records : ' + rec.join(' · ') + '.');
  // zones FC recalées et signaux de la foulée calculés par l'app (body-signals.js)
  const hz = state._hr_zones;
  if (hz && hz.applied && hz.efMax) lines.push(`Zones FC recalées le ${fmtD(hz.at)} d'après ses séances (PRIORITAIRES sur les valeurs FC écrites dans tes consignes) : endurance fondamentale jusqu'à ${hz.efMax} bpm${hz.lthr ? `, FC au seuil ~${hz.lthr} bpm` : ''}${hz.fcMax ? `, FC max ${hz.fcMax} bpm` : ''}.`);
  const bsig = state._body_signals;
  if (bsig && bsig.level && bsig.at && Array.isArray(bsig.items) && days(bsig.at, today) <= 3) lines.push(`Signal de la foulée (calculé par l'app le ${fmtD(bsig.at)}) : ${bsig.items.join(' ')} → ${bsig.level >= 2 ? 'signal précoce de fatigue ou de blessure : pas de hausse de charge, privilégier la récupération' : 'à surveiller'}.`);

  // charge récente (séances réalisées et datées) : prépa en cours + prépas enregistrées terminées depuis moins de 6 semaines
  // (après une bascule de prépa, la charge et la dernière séance tiennent compte de la prépa précédente)
  const doneD = sess.filter((s) => s.done && s.date && s.date <= today && s.x.type !== 'rest');
  try {
    const seen = new Set(doneD.map((s) => s.date + '|' + s.x.type + '|' + Math.round(s.km * 10)));
    const recentIds = Object.keys(idx).filter((id) => id !== state._prep_id && idx[id] && idx[id].date && idx[id].date <= today && days(idx[id].date, today) <= 42);
    for (const id of recentIds) {
      const snap = (await db.ref(base + '/preps/' + id).once('value')).val() || {};
      for (let w = 1; w <= 60; w++) for (let ei = 0; ei <= 50 && snap[`extra_w${w}_s${ei}`] !== undefined; ei++) {
        let x = {}, perf = {}; try { x = JSON.parse(snap[`extra_w${w}_s${ei}`]) || {}; } catch (e) {}
        try { perf = JSON.parse(snap[`extra_w${w}_s${ei}_perf`] || '{}') || {}; } catch (e) {}
        if (!(snap[`extra_w${w}_s${ei}_done`] || snap[`extra_w${w}_s${ei}_km`] != null) || x.type === 'rest') continue;
        const km = parseFloat(snap[`extra_w${w}_s${ei}_km`]) > 0 ? parseFloat(snap[`extra_w${w}_s${ei}_km`]) : parseFloat(x.km) || 0;
        const date = String(perf.date || x.sched_date || '').slice(0, 10);
        const k = date + '|' + x.type + '|' + Math.round(km * 10);
        if (!date || date > today || seen.has(k)) continue;
        seen.add(k); doneD.push({ w, x, perf, done: true, km, date, prev: true });
      }
    }
  } catch (e) {}
  const inLast = (n) => doneD.filter((s) => days(s.date, today) < n);
  const k7 = inLast(7), k14 = inLast(14);
  lines.push(`Charge récente : ${Math.round(k7.reduce((a, s) => a + s.km, 0))} km sur les 7 derniers jours (${k7.length} séance${k7.length > 1 ? 's' : ''}) · ${Math.round(k14.reduce((a, s) => a + s.km, 0))} km sur 14 jours.`);
  const lastS = doneD.sort((a, b) => b.date.localeCompare(a.date))[0];
  if (lastS) lines.push(`Dernière séance : ${fmtD(lastS.date)} — ${sessionTitleOf(lastS.x)} ${String(Math.round(lastS.km * 100) / 100).replace('.', ',')} km${lastS.perf.pace ? ' à ' + lastS.perf.pace + '/km' : ''}${lastS.perf.hr ? ', FC ' + lastS.perf.hr : ''}${lastS.perf.note ? ' — ressenti : « ' + lastS.perf.note + ' »' : ''}.`);

  // séance du jour (avec sa consigne)
  const td = sess.filter((s) => s.date === today && !s.done && s.x.type !== 'rest');
  const todaySessions = td.map((s) => ({ title: sessionTitleOf(s.x), km: parseFloat(s.x.km) || 0, time: s.x.sched_time || null, type: s.x.type, consigne: String(s.x.d || '').split('|')[1] || '' }));
  const nextS = sess.filter((s) => s.date > today && !s.done && s.x.type !== 'rest').sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!todaySessions.length && nextS) lines.push(`Prochaine séance : ${fmtD(nextS.date)} — ${sessionTitleOf(nextS.x)} ${nextS.x.km} km.`);
  const nextSession = nextS ? { date: nextS.date, title: sessionTitleOf(nextS.x), km: parseFloat(nextS.x.km) || 0, time: nextS.x.sched_time || null, type: nextS.x.type, consigne: String(nextS.x.d || '').split('|')[1] || '', tomorrow: days(today, nextS.date) === 1 } : null;
  return { text: `SITUATION D'ENTRAÎNEMENT (au ${fmtD(today)}) :\n- ` + lines.join('\n- '), todaySessions, nextSession, postRace: !!(last && RECOVERY_DAYS[raceCategory(last.dist)] && days(last.date, today) < RECOVERY_DAYS[raceCategory(last.dist)]) };
}

async function buildNotifContext(state, cw) {
  const jours=['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  const joursLong=['','lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
  const typesSemaine=['','','','','','','','','décharge','','','','décharge','','','','décharge','','','','décharge','','','','','','','','','','affûtage','affûtage',''];
  const now=new Date();
  const dayOfWeek=now.getDay()===0?7:now.getDay();
  const todayStr=now.toISOString().slice(0,10);
  const _gen=state&&state._plan_engine;
  const typeSem=_gen?weekTypeFor(state,cw):(cw<=32?(typesSemaine[cw]||'charge'):'charge');
  const fcToday=state[`fc_repos_${todayStr}`]||null;
  const seancesDone=[],seancesRestantes=[],seancesAujourdHui=[],seancesNext=[];
  let seanceRunAujourdhui=null; // premier run non-supprimé non-fait du jour
  if(!state._plan_migrated){
    for(let si=0;si<5;si++){
      const edRaw=state[`edit_w${cw}_s${si}`];
      const done=!!state[`s${cw}i${si}done`];
      const deleted=!!state[`del_w${cw}_s${si}`];
      if(deleted||!edRaw)continue;
      let ed;try{ed=JSON.parse(edRaw);}catch(e){continue;}
      if(ed.type==='rest')continue;
      const titre=sessionTitleOf(ed);
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
  while(extraIdx<=50&&state[`extra_w${cw}_s${extraIdx}`]){
    let es;try{es=JSON.parse(state[`extra_w${cw}_s${extraIdx}`]);}catch(e){extraIdx++;continue;}
    if(!es||es.type==='rest'){extraIdx++;continue;}
    const _planSiCtx=es._src==='plan'&&es._plan_si!=null?es._plan_si:undefined;
    const done=_planSiCtx!==undefined
      ?!!(state[`extra_w${cw}_s${extraIdx}_done`]||state[`s${cw}i${_planSiCtx}done`])
      :!!state[`extra_w${cw}_s${extraIdx}_done`];
    const titre=sessionTitleOf(es);
    const km=es.km||'';
    if(done){
      let perf=null;try{perf=state[`extra_w${cw}_s${extraIdx}_perf`]?JSON.parse(state[`extra_w${cw}_s${extraIdx}_perf`]):null;}catch(e){}
      seancesDone.push(`${titre} ${km}km${perf&&perf.pace?' — '+perf.pace+'/km FC'+(perf.hr||''):' ✓'}`);
    } else {
      const schedInfo=es.sched_day?`${jours[es.sched_day]}${es.sched_time?' '+es.sched_time:''}`:''
      seancesRestantes.push(`${titre} ${km}km${schedInfo?' → '+schedInfo:''}`);
      if(Number(es.sched_day)===dayOfWeek){
        seancesAujourdHui.push(`${titre} — ${km}km, prévu à ${es.sched_time||'horaire non défini'}`);
        if(!seanceRunAujourdhui && es.type && es.type!=='renfo' && es.type!=='repos'){
          seanceRunAujourdhui={type:es.type,km:parseFloat(es.km)||0,sched_time:es.sched_time||null,titre};
        }
      }
    }
    extraIdx++;
  }
  let efPace=null;
  for(let ws=cw;ws>=Math.max(1,cw-4);ws--){for(let si=0;si<5;si++){const pr=state[`s${ws}i${si}perf`];if(!pr)continue;try{const p=JSON.parse(pr);if(p.type==='ef'&&p.pace){efPace=p.pace;break;}}catch(e){}}if(efPace)break;
    // séances extra (plan migré / prépa générée) : dernière EF faite
    for(let ei=50;ei>=0&&!efPace;ei--){const pr=state[`extra_w${ws}_s${ei}_perf`];if(!pr||!state[`extra_w${ws}_s${ei}`])continue;try{const es=JSON.parse(state[`extra_w${ws}_s${ei}`]),p=JSON.parse(pr);if(es.type==='ef'&&p.pace)efPace=p.pace;}catch(e){}}if(efPace)break;}
  let kmSemaine=0;if(!state._plan_migrated){for(let si=0;si<5;si++){const kmV=state[`s${cw}i${si}km`];if(kmV!=null)kmSemaine+=parseFloat(kmV)||0;}}let _exi=0;while(_exi<=50&&state[`extra_w${cw}_s${_exi}`]){const kmV=state[`extra_w${cw}_s${_exi}_km`];if(kmV!=null)kmSemaine+=parseFloat(kmV)||0;_exi++;}
  const cwNext=Math.min(cw+1,totalWeeksFor(state));
  const typeSemNext=_gen?weekTypeFor(state,cwNext):(cwNext<=32?(typesSemaine[cwNext]||'charge'):'charge');
  if(!state._plan_migrated)for(let si=0;si<5;si++){const er=state[`edit_w${cwNext}_s${si}`];if(!er)continue;let ed;try{ed=JSON.parse(er);}catch(e){continue;}seancesNext.push(`${sessionTitleOf(ed)} ${ed.km||''}km`);}
  if(cwNext>cw)for(let ei=0;ei<=50&&state[`extra_w${cwNext}_s${ei}`];ei++){let es;try{es=JSON.parse(state[`extra_w${cwNext}_s${ei}`]);}catch(e){continue;}if(!es||es.type==='rest')continue;seancesNext.push(`${sessionTitleOf(es)} ${es.km||''}km`);}
  return{cw,typeSem,typeSemNext,cwNext,dayOfWeek,jourAujourdHui:joursLong[dayOfWeek],fcToday,seancesAujourdHui,seancesDone,seancesRestantes,kmSemaine,efPace,memos:state['_coach_memos']||'',seancesNext,semainesRestantes:Math.max(0,totalWeeksFor(state)-cw),seanceRunAujourdhui};
}

// Génère le brief du matin complet (appel Anthropic + météo + gels + eau)
// Utilisé par briefAfterFcRepos (scheduler) ET adminTestNotif (test immédiat)
async function generateMorningBriefContent(anthropicKey, db, state, cw, todayStr) {
  const ctx = await buildNotifContext(state, cw);
  const wd = state['whoop_data'] || state.whoop_data || null;
  // nuit du jour uniquement : jamais les chiffres d'une autre nuit présentés comme ceux de ce matin
  const _night = whoopNight(wd, todayStr);
  const whoopRecov = _night.r;
  const whoopToday = !!whoopRecov;
  const fcWhoopRhr = (whoopToday && whoopRecov && whoopRecov.rhr) ? whoopRecov.rhr : null;
  const fcToday = fcWhoopRhr || state['fc_repos_'+todayStr] || null;

  // Score global synthétique (même calcul que stats.js) : nuit du jour uniquement
  const r0 = whoopRecov;
  const s0 = _night.s;
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
  let globalScore = globalScoreComponents.length
    ? Math.round(globalScoreComponents.reduce((a,b)=>a+b,0)/globalScoreComponents.length)
    : null;
  // Si le score WHOOP du jour est rouge, le score global ne peut pas dépasser le rouge
  if (whoopToday && r0?.score != null && r0.score < 34 && globalScore !== null && globalScore >= 34) {
    globalScore = Math.min(globalScore, 33);
  }
  const globalScoreEmoji = globalScore===null?'':globalScore>=67?'🟢':globalScore>=34?'🟡':'🔴';
  const globalScoreLabel = globalScore===null?''
    : globalScore>=67?'Bonne forme':globalScore>=34?'Forme moyenne':'Récupération insuffisante';

  let whoopBlock = '';
  if (wd && !whoopRecov && !_night.s) whoopBlock = WHOOP_MISSING_TEXT;
  else if (wd) {
    const r = whoopRecov;
    const s = _night.s;
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
      try { const p=JSON.parse(pr); if ((p.type==='ef'||(!p.type&&state[`edit_w${ws}_s${si}`]&&JSON.parse(state[`edit_w${ws}_s${si}`]).type==='ef'))&&p.pace&&p.hr&&parseInt(p.hr)<=efMaxOf(state)){const s=paceStrToSec(p.pace);if(s)efPaces.push(s);} } catch(e){}
    }
    if (state._plan_engine) for (let ei=0;ei<=50&&state[`extra_w${ws}_s${ei}`];ei++) {   // prépa générée : séances extra
      const pr=state[`extra_w${ws}_s${ei}_perf`]; if (!pr) continue;
      try { const es=JSON.parse(state[`extra_w${ws}_s${ei}`]), p=JSON.parse(pr); if ((es.type==='ef'||es.type==='long')&&p.pace&&p.hr&&parseInt(p.hr)<=efMaxOf(state)){const s=paceStrToSec(p.pace);if(s)efPaces.push(s);} } catch(e){}
    }
  }
  let efPace = null;
  if (efPaces.length > 0) {
    let refSec;
    if (efPaces.length < 3) { refSec=Math.min(...efPaces); }
    else { const last3=efPaces.slice(-3); const before3=efPaces.slice(0,-3); const prevBest=before3.length>0?Math.min(...before3):last3[0]; const minL=Math.min(...last3); const medL=[...last3].sort((a,b)=>a-b)[1]; refSec=minL<=prevBest?minL:medL; }
    let _em=Math.floor(refSec/60); let _es=Math.round(refSec%60); if(_es===60){_em++;_es=0;} efPace=`${_em}'${(_es+'').padStart(2,'0')}`;
  }
  efPace = efRefOf(state, todayStr) || efPace || "6'40";

  // vision complète : prépas, courses passées et à venir, période post-course, charge récente, séance du jour
  const sit = await buildTrainingSituation(db, state, todayStr);
  const consigneJour = sit.todaySessions.map(x => `${x.title} ${x.km} km${x.consigne ? ' : ' + x.consigne : ''}`).join(' + ');
  const isDecharge = state._plan_engine ? weekTypeFor(state, cw) === 'décharge' : [8,12,16,20].includes(cw);
  const consignesEf = sit.postRace ? `Période post-course : footing très facile, FC < 140 bpm, sensations avant l'allure` : isDecharge ? `Semaine DÉCHARGE : allure EF lente, FC < 140 bpm` : `Allure EF de référence : ${efPace}/km — FC 140-148 bpm`;
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

  const restDay = isRestDay(ctx, sit);
  const system = restDay ? restBriefSystem(state, sit) : `Tu es le coach running de Guillaume. Ta mission : rédiger un brief complet et personnalisé du matin, centré uniquement sur la journée d'aujourd'hui. Tu t'adresses DIRECTEMENT à Guillaume en le tutoyant ("tu", jamais "Guillaume" dans le corps du texte).

PROFIL :
- ${state&&state._plan_engine?prepObjectiveText(state):'Prépare un marathon (18 octobre 2026), objectif Sub 4h. Plan structuré depuis février 2026.'}
- FC max 196 bpm. Zone EF : 140-148 bpm. FC repos > 55 bpm = signe de fatigue.
- Montre Garmin Forerunner 165.
- Lundi midi : séance bodyhit (électrostimulation).

CONTEXTE À PRENDRE EN COMPTE — la SITUATION D'ENTRAÎNEMENT fournie à la fin du message (prépa en cours et phase de la semaine, dernière course et jours écoulés, prépa suivante, charge récente) te donne la vision complète :
- PÉRIODE POST-COURSE (si indiquée) = priorité absolue : la rappeler en une phrase dans le bloc 2 (ex. « J+10 après ton marathon : on reprend en douceur ») et calibrer tout le brief dessus (footing facile et court, aucune intensité, sensations avant l'allure). La croiser avec la récupération WHOOP, la FC repos et la VFC : récup basse, FC repos haute ou VFC en baisse en période post-course = raccourcir, marcher ou repos.
- Semaine allégée, affûtage ou course dans moins de 7 jours : le dire en une phrase et adapter les consignes.
- Allure cible : celle de la « Consigne de la séance » (plan) si elle est fournie.

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

3. 🏃 TON ENTRAÎNEMENT DU JOUR — la séance du jour (distance, heure, intention en une phrase). Si run + renfo, tout mentionner. Si repos : dire explicitement "Récupération active" et ce que ça implique. Puis, d'après « Ajustements de la nuit (pilote automatique) » fourni dans le contexte : s'ils ont été APPLIQUÉS, dire clairement ce qui a changé (avant → après, en **gras**) et POURQUOI, une phrase simple par changement (reformuler la raison fournie, sans jargon), en commençant par la séance d'aujourd'hui, puis terminer par : « Si tu préfères le plan d'origine, touche **Annuler** juste en dessous. » S'ils sont seulement PROPOSÉS : le dire et inviter à les appliquer dans « MAJ le plan ». S'il n'y en a aucun : écrire « Séance confirmée telle que prévue. »

4. ⚡ CONSIGNES & MÉTÉO — MAX 3 LIGNES au total, ultra-concis, chiffres en **gras** :
   Ligne 1 : allure cible en **gras** (celle de la « Consigne de la séance » si fournie) + FC cible en **gras** (si chaleur ≥25°C : allure ajustée en **gras** + delta en **gras** à la place).
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
- INTERDIT : récapituler la semaine ou lister les séances passées. La situation (course passée, prépa, prochaine course) sert à calibrer le brief : y faire référence en une phrase au plus, dans le bloc 2.`;

  const globalScoreLine = globalScore !== null
    ? `Score du jour (synthétique) : ${globalScore}% ${globalScoreEmoji} ${globalScoreLabel} [moyenne récup+sommeil+FC${r0?.hrv!=null?'+VFC':''}]`
    : '';

  const userMsg = restDay ? `${dateComplet}
${globalScoreLine ? globalScoreLine+'\n' : ''}${fcLine}${whoopBlock}
${restBriefData(state, todayStr, sit)}
${alcoholBriefText(state, todayStr)}
${memosLine}

${sit.text}` : `${dateComplet}
${globalScoreLine ? globalScoreLine+'\n' : ''}${fcLine}${whoopBlock}
${alcoholBriefText(state, todayStr)}
Séances du jour : ${seancesStr}
Consigne de la séance (plan) : ${consigneJour||'—'}
${autopilotBriefText(state, todayStr)}
Heure de la séance : ${seanceHeure||'non définie'}
${meteoStr||'Météo : non disponible'}
${allureAjusteeStr||'Pas d\'ajustement chaleur nécessaire'}
Allure EF de référence (conditions normales) : ${efPace}/km
Consignes générales : ${consignesEf}
Gels : ${gelInfo}
Eau : ${eauInfo}
${memosLine}

${sit.text}`;

  let briefContent = '';
  try {
    briefContent = await module.exports.callAnthropic(anthropicKey, system, [{role:'user',content:userMsg}], 1100) || '';   // via l'export : remplaçable dans les tests
  } catch(e) { console.error('generateMorningBriefContent AI error:', e.message); }

  if (!briefContent) {
    briefContent = `😴 NUIT & RÉCUPÉRATION\n${fcLine}\n\n🎯 ${seancesStr}`;
  }

  // Corps de la push notification (résumé)
  // Priorité : score global synthétique > score récup WHOOP seul > rien
  const meteoEmoji = restDay||tempSeance===null?'':tempSeance>=28?'🔥':tempSeance>=25?'☀️':tempSeance>=15?'⛅':'🌥️';
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
    const tl={ef:'EF',tempo:'Tempo',seuil:'Seuil',vma:'VMA',long:'Sortie longue',ef_long:'Sortie longue'}[seanceRunAujourdhui.type]||seanceRunAujourdhui.type.toUpperCase();
    seancePart=`Séance ${tl}${seanceRunAujourdhui.km>0?' '+seanceRunAujourdhui.km+'km':''} 🏃${seanceHeure?' à '+seanceHeure:''}`;
  } else { seancePart = restDay ? restPushPart(sit) : 'Pas de séance run'; }
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
  // N'afficher la FC manuelle que si WHOOP n'a pas de données RHR (évite le doublon)
  const whoopHasRhr = wd && (wd.recoveries || []).some(r => r.rhr != null);
  const fcMoyBlock = (!whoopHasRhr && fcCount >= 3) ? `\nFC repos manuelle (${fcCount}j) : moy ${Math.round(fcSum/fcCount)} bpm, min ${fcMin}, max ${fcMax}` : '';

  // ── Séances de la semaine ──────────────────────────────────────────────────
  const ctx = await buildNotifContext(state, cw);
  const seancesDone = ctx.seancesDone || [];
  const seancesManquees = ctx.seancesRestantes || [];
  const kmSemaine = ctx.kmSemaine || 0;
  const renfo = [1, 2].filter(r => !!state[`rf${cw}r${r}done`]).length;
  const typeSem = ctx.typeSem || ([8,12,16,20].includes(cw) ? 'DÉCHARGE' : 'CHARGE');
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
- ${state&&state._plan_engine?prepObjectiveText(state)+' '+(totalWeeksFor(state)-cw)+' semaines restantes.':'Prépare un marathon (18 octobre 2026), objectif Sub 4h. '+(32-cw)+' semaines restantes.'}
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

  const userMsg = `Semaine S${cw} (${typeSem}) — ${totalWeeksFor(state)-cw} semaines avant ${state&&state._plan_engine?'la course objectif':'le marathon'}.
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
  buildTrainingSituation, parisToday, efMaxOf, efRefOf, bedtimePlan, autopilotBriefText,
  sessionTitleOf,
  totalWeeksFor, getPrepInfo, prepObjectiveText, weekTypeFor, loadPrepState, adminCurrentWeek,
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
  generateMorningBriefContent, alcoholBriefText, whoopNight, WHOOP_MISSING_TEXT, isRestDay, restBriefSystem, restBriefData, restPushPart,
  generateWeeklyBilanContent,
};
