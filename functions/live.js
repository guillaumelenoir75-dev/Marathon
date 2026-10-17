// Suivi Guillaume en direct : réception des positions envoyées par l'application OwnTracks (iPhone, écran verrouillé)
// et écriture dans /live, lu par la page publique /suivi-guillaume (même format que la page /suivi-admin).
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { verifyAdmin } = require("./helpers");
const COURSE = require("./live-course.json");

const URL_BASE = 'https://us-central1-prepa-marathon.cloudfunctions.net/owntracks';
const KEY_PATH = 'live_config/owntracksKey';

// ─── Géométrie du parcours (copie de public-static/src/suivi-core.js) ───────
const RAD = Math.PI / 180;
const kx = (lat) => 111320 * Math.cos(lat * RAD);
const dist = (a, b) => { const dx = (b[1] - a[1]) * kx((a[0] + b[0]) / 2), dy = (b[0] - a[0]) * 110540; return Math.sqrt(dx * dx + dy * dy); };
const PTS = COURSE.route, CUM = [0];
for (let i = 1; i < PTS.length; i++) CUM.push(CUM[i - 1] + dist(PTS[i - 1], PTS[i]));
const LEN = CUM[CUM.length - 1], SCALE = COURSE.official / LEN;
function project(p, sMin, sMax) {
  const K = kx(p[0]); let best = { d: Infinity, s: 0 };
  for (let i = 1; i < PTS.length; i++) {
    if (sMax !== undefined && (CUM[i] < sMin || CUM[i - 1] > sMax)) continue;
    const a = PTS[i - 1], b = PTS[i];
    const ax = (a[1] - p[1]) * K, ay = (a[0] - p[0]) * 110540, bx = (b[1] - p[1]) * K, by = (b[0] - p[0]) * 110540;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, u = L2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0;
    const d = Math.hypot(ax + u * dx, ay + u * dy);
    if (d < best.d) best = { d, s: CUM[i - 1] + u * Math.sqrt(L2) };
  }
  return best;
}
const POINTS = COURSE.points.map((pt) => ({ id: pt.id, s: pt.id === 'finish' ? LEN - 60 : project(pt.coord, (pt.km - 3) * 1000 / SCALE, (pt.km + 3) * 1000 / SCALE).s }));
const PLAN_SPEED = 42195 / (3.55 * 3600);
const RACE_START = Date.UTC(2026, 9, 18, 7, 15);      // dimanche 18 octobre 2026, 9h15 heure de Paris (UTC+2)

async function getKey(db, create) {
  const ref = db.ref(KEY_PATH);
  let k = (await ref.once('value')).val();
  if (!k && create) { k = crypto.randomBytes(18).toString('base64url'); await ref.set(k); }
  return k;
}

// Clé et configuration OwnTracks (réservé à l'admin, appelé par /suivi-admin)
exports.owntracksToken = onRequest({ cors: true }, async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  try { await verifyAdmin(req); } catch (e) { res.status(403).json({ error: 'Accès réservé' }); return; }
  const db = admin.database();
  if (req.query.renew === '1') await db.ref(KEY_PATH).remove();
  const key = await getKey(db, true);
  const url = `${URL_BASE}/${key}`;              // clé dans le chemin : pas de « ?key= » qu'OwnTracks risque de tronquer
  const config = { _type: 'configuration', mode: 3, url, tid: 'GL', deviceId: 'guillaume', auth: false,
    monitoring: 2, locatorInterval: 15, locatorDisplacement: 25, ignoreInaccurateLocations: 100, downgrade: 0,
    allowRemoteLocation: false, cmd: false, extendedData: true };
  res.json({ key, url, config });
});

// Réception OwnTracks : POST JSON {_type:'location', lat, lon, tst, acc, vel, batt…} ; réponse attendue : tableau JSON
exports.owntracks = onRequest({ maxInstances: 3 }, async (req, res) => {
  const db = admin.database();
  if (req.method !== 'POST') { res.status(405).json([]); return; }
  const key = await getKey(db, false);
  // clé : chemin (/owntracks/<clé>), paramètre ?key= ou mot de passe de l'authentification de base d'OwnTracks
  const seg = String(req.path || '').split('/').filter(Boolean).pop() || '';
  let basic = '';
  const ah = req.headers.authorization || '';
  if (ah.startsWith('Basic ')) { try { basic = Buffer.from(ah.slice(6), 'base64').toString().split(':').slice(1).join(':'); } catch (e) {} }
  const given = String(req.query.key || (seg !== 'owntracks' ? seg : '') || basic || '');
  if (given !== key) console.warn('owntracks : clé refusée', { query: String(req.query.key || '').length, path: seg.length, basic: basic.length });
  if (!key || given.length !== key.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(key))) { res.status(403).json([]); return; }
  const m = typeof req.body === 'object' && req.body ? req.body : {};
  if (m._type !== 'location' || typeof m.lat !== 'number' || typeof m.lon !== 'number') { res.json([]); return; }
  let live = (await db.ref('live').once('value')).val() || {};
  // filet de sécurité du jour J : course non démarrée depuis l'app (ou essai oublié) → départ automatique à 9h15
  // dès la première position (désactivé si le suivi a été annulé volontairement après 9h15 : noAuto)
  const nowMs = Date.now();
  if ((!live.startedAt || live.test) && !live.noAuto && nowMs >= RACE_START && nowMs < RACE_START + 5 * 3600000) {
    await db.ref('live').update({ status: 'running', test: null, startedAt: RACE_START, finishedAt: null, passages: null, track: null, pos: null, splits: null, s0: null, s0t: null });
    live = (await db.ref('live').once('value')).val() || {};
  }
  const t = m.tst ? Math.min(Date.now(), m.tst * 1000) : Date.now();
  const fix = { lat: m.lat, lon: m.lon, acc: Math.round(m.acc || 0), spd: typeof m.vel === 'number' ? +(m.vel / 3.6).toFixed(2) : null, ts: t, src: 'owntracks' };
  if (typeof m.batt === 'number') fix.batt = m.batt;
  // dernier contact OwnTracks (vu par l'admin) : mode de suivi (m : -1 quiet, 0 manual, 1 significant, 2 move), contact précédent
  const prevOta = (await db.ref('live/ota').once('value')).val() || {};
  const up = { ota: { ts: Date.now(), batt: fix.batt === undefined ? null : fix.batt, acc: fix.acc, m: typeof m.m === 'number' ? m.m : null, prev: prevOta.ts || null } };
  if (live.status !== 'running' || !live.startedAt) { await db.ref('live').update(up); res.json([]); return; }
  const prev = live.pos || null;
  if (prev && prev.ts && t <= prev.ts) { await db.ref('live').update(up); res.json([]); return; }   // message en retard (file d'attente)
  // essai : départ là où l'on se trouve sur le parcours (n'importe quel km) ; s0 = origine de l'essai
  const free = !!live.test && typeof live.s0 !== 'number';
  // distance le long du parcours, comme sur /suivi-admin
  const lastS = !free && prev && typeof prev.s === 'number' ? prev.s : null;
  const el = (t - live.startedAt) / 1000;
  const pr = free ? project([m.lat, m.lon])
           : lastS === null ? project([m.lat, m.lon], el * PLAN_SPEED / SCALE - 6000, el * PLAN_SPEED / SCALE + 6000)
                            : project([m.lat, m.lon], lastS - 300, lastS + Math.max(2500, (t - (prev.ts || t)) / 1000 * 6));
  let s = lastS === null ? 0 : lastS;
  const dt = prev && prev.ts ? Math.max(1, (t - prev.ts) / 1000) : 1e6;
  const ok = pr.d < 120 && fix.acc < 80 && (lastS === null || pr.s - s < dt * 8 + 150);
  if (ok) s = lastS === null ? pr.s : Math.max(s, pr.s);
  fix.s = Math.round(s); fix.off = Math.round(pr.d);
  fix.sts = ok ? t : (prev && !free && (prev.sts || prev.ts)) || t;   // dernière mesure de distance acceptée
  if (free && pr.d < 120 && fix.acc < 80) { up.s0 = fix.s; up.s0t = t; }
  up.pos = fix;
  // passages : heure interpolée entre les deux positions ; ligne d'arrivée franchie → arrivée automatique (chrono arrêté)
  for (const pt of POINTS) if (lastS !== null && lastS < pt.s && s >= pt.s && !(live.passages && live.passages[pt.id])) {
    let tp = Math.round(prev.ts + (t - prev.ts) * (pt.s - lastS) / ((s - lastS) || 1));
    // l'arrivée est détectée 60 m avant le bout du tracé : on prolonge jusqu'à la ligne à la vitesse du dernier tronçon
    if (pt.id === 'finish') tp += Math.round(Math.min(60000, (LEN - pt.s) / Math.max(1, (s - lastS) / Math.max(1, (t - prev.ts) / 1000)) * 1000));
    up['passages/' + pt.id] = tp;
    if (pt.id === 'finish' && !live.test) { up.status = 'finished'; up.finishedAt = tp; }
  }
  await db.ref('live').update(up);
  const lastTrack = live.track ? Object.values(live.track).reduce((a, x) => (x[2] > a[2] ? x : a), [0, 0, 0, -1]) : null;
  if (!lastTrack || t - lastTrack[2] >= 45000 || Math.abs(s - lastTrack[3]) >= 400) await db.ref('live/track').push([+m.lat.toFixed(5), +m.lon.toFixed(5), t, Math.round(s)]);
  res.json([]);
});
