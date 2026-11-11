const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();
const crypto = require('crypto');

const { verifyAdmin, ADMIN_STATE, ADMIN_UID } = require('./helpers');

// Jeton de l'adresse d'abonnement : gardé hors de l'état (_calendar/token, hors de portée des écritures de l'app) et recopié dans
// l'état (_cal_token, ancien emplacement) → l'adresse déjà ajoutée à l'agenda reste valable même si l'état perd la clé.
async function getOrCreateCalToken(db) {
  const safe = (await db.ref('_calendar/token').once('value')).val();
  const inState = (await db.ref(`${ADMIN_STATE}/_cal_token`).once('value')).val();
  const token = safe || inState || crypto.randomBytes(24).toString('hex');
  if (!safe) await db.ref('_calendar/token').set(token);
  if (inState !== token) await db.ref(`${ADMIN_STATE}/_cal_token`).set(token);
  return token;
}

const typeToTitle = {
  ef: "Run - EF",
  ef_long: "Run - Sortie longue",
  tempo: "Run - Tempo",
  seuil: "Run - Seuil",
  vma: "Run - VMA",
  frac: "Run - Fractionné",
  long: "Run - Sortie longue",
  race: "Run - Course",
  rest: "Récupération"
};

// Lundi de la semaine weekNum : plan Seine-Eure (9 mars 2026) ou, pour une prépa générée, lundi de plan_start_date
function getWeekStartDate(weekNum, state) {
  let baseDate = new Date(2026, 2, 9);
  if (state && state._plan_engine && state.plan_start_date) {
    const p = String(state.plan_start_date).slice(0, 10).split('-').map(Number);
    baseDate = new Date(p[0], p[1] - 1, p[2]);
    const dw = baseDate.getDay(); baseDate.setDate(baseDate.getDate() + (dw === 0 ? -6 : 1 - dw));
  }
  const target = new Date(baseDate);
  target.setDate(baseDate.getDate() + (weekNum - 1) * 7);
  return target;
}

// ─── Format ICS (RFC 5545) ───
// texte : \ , ; et retours à la ligne échappés (sinon Outlook / Google coupent la consigne à la 1re virgule)
function icsEsc(t) { return String(t == null ? '' : t).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1'); }
// lignes de 75 octets au plus, suite précédée d'une espace
function icsFold(line) {
  const out = []; let cur = '', bytes = 0;
  for (const ch of line) { const b = Buffer.byteLength(ch); if (bytes + b > 75) { out.push(cur); cur = ' ' + ch; bytes = 1 + b; } else { cur += ch; bytes += b; } }
  out.push(cur); return out.join('\r\n');
}
const pad2 = (n) => String(n).padStart(2, '0');
// heure murale de Paris (TZID) : calculée sans dépendre du fuseau du serveur
function wall(dateIso, time, addMin) {
  const [y, mo, d] = String(dateIso).slice(0, 10).split('-').map(Number), [h, mi] = String(time || '09:00').split(':').map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d, h || 0, mi || 0) + (addMin || 0) * 60000);
  return t.getUTCFullYear() + pad2(t.getUTCMonth() + 1) + pad2(t.getUTCDate()) + 'T' + pad2(t.getUTCHours()) + pad2(t.getUTCMinutes()) + '00';
}
const utcStamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
function shortHash(t) { return crypto.createHash('sha1').update(String(t)).digest('hex').slice(0, 10); }
// ev : { uid, title, desc, date 'AAAA-MM-JJ', time 'HH:MM', min, seq }
function buildEvent(ev) {
  return ['BEGIN:VEVENT', 'UID:' + ev.uid + '@prepa-marathon', 'DTSTAMP:' + utcStamp(new Date()), 'SEQUENCE:' + (ev.seq || 0),
    'DTSTART;TZID=Europe/Paris:' + wall(ev.date, ev.time), 'DTEND;TZID=Europe/Paris:' + wall(ev.date, ev.time, ev.min || 60),
    'SUMMARY:' + icsEsc(ev.title), ev.desc ? 'DESCRIPTION:' + icsEsc(ev.desc) : '', 'TRANSP:OPAQUE', 'END:VEVENT']
    .filter(Boolean).map(icsFold).join('\r\n');
}

const TYPE_ICON = { ef: '🏃', long: '🏃', tempo: '⚡', frac: '⚡', race: '🏁' };
const TYPE_PACE = { ef: 375, long: 380, tempo: 330, frac: 345, race: 330 };   // s/km sans allure dans la consigne
const durMin = (t) => { const p = String(t || '').split(':').map(Number); if (p.some(isNaN) || p.length < 2) return null; return p.length === 3 ? p[0] * 60 + p[1] + p[2] / 60 : p[0] + p[1] / 60; };
const fmtKm = (k) => String(Math.round((+k || 0) * 10) / 10).replace('.', ',');

// Événements d'une prépa générée : EXACTEMENT les séances de l'app (moteur prSessions : extra_w*, date réelle des séances
// faites, séances retirées exclues, les anciennes clés edit_w / del_w du plan Seine-Eure ignorées) + renfo planifiés.
// UID = prépa + séance + empreinte du contenu : toute modification (date, heure, consigne, km, faite) remplace l'événement
// (un même UID réutilisé avec un autre contenu restait figé dans Apple Calendrier / Outlook) ; doublons exacts retirés.
function generatedEvents(state, today) {
  const { loadEngine } = require('./engine');
  const E = loadEngine({ state, now: today + 'T12:00:00Z' });
  const tag = shortHash(state._prep_id || state.plan_start_date || 'prep');
  const events = [], seen = {}, dups = [], skipped = [];
  E.prSessions(state).forEach((s) => {
    if (s.type === 'rest') return;
    if (s.skip) { skipped.push(s.key); return; }
    if (!s.date) return;
    const time = (s.x && s.x.sched_time) || '09:00';
    const same = [s.date, s.title, s.kmPlan, s.type, s.done ? 1 : 0].join('|');
    if (!s.done && seen[same]) { dups.push({ key: s.key, same: seen[same], date: s.date, title: s.title }); return; }
    seen[same] = s.key;
    let min = null;
    if (s.done) min = durMin(s.perf && s.perf.dur);
    if (!min) { const pace = s.pace ? (s.pace.lo + s.pace.hi) / 2 : TYPE_PACE[s.type] || 375; min = (s.kmPlan || s.km || 8) * pace / 60 + (s.type === 'frac' || s.type === 'tempo' ? 15 : 0); }
    min = Math.max(20, Math.min(300, Math.round(min / 5) * 5));
    const lines = [];
    if (s.detail) lines.push(s.detail);
    lines.push(fmtKm(s.kmPlan) + ' km · ~' + (min >= 60 ? Math.floor(min / 60) + 'h' + pad2(min % 60) : min + ' min'));
    if (s.done) { const p = s.perf || {}; lines.push('✓ Faite : ' + [fmtKm(s.km) + ' km', p.pace ? p.pace + '/km' : '', p.hr ? 'FC ' + p.hr : ''].filter(Boolean).join(' · ')); }
    const title = (s.done ? '✓ ' : (TYPE_ICON[s.type] || '🏃') + ' ') + (s.title || 'Séance');
    events.push({ uid: 'pm-' + tag + '-' + s.key + '-' + shortHash([s.date, time, s.title, s.detail, s.kmPlan, s.type, s.done ? 1 : 0, min].join('|')),
      title, desc: lines.join('\n'), date: s.date, time, min, key: s.key, done: s.done });
  });
  // renfo : créneaux rf<sem>r<n>sched de la prépa, semaine retirée (rf<sem>skip) exclue
  const m0 = E.prMonday(state.plan_start_date), mon = m0 && !isNaN(m0.getTime()) ? m0.getFullYear() + '-' + pad2(m0.getMonth() + 1) + '-' + pad2(m0.getDate()) : null;
  Object.keys(state).forEach((k) => {
    const m = k.match(/^rf(\d+)r(\d+)sched$/); if (!m || !mon) return;
    if (state['rf' + m[1] + 'skip']) return;
    let sc = null; try { sc = JSON.parse(state[k]); } catch (e) { return; }
    if (!sc || !sc.day || !sc.time) return;
    const d = new Date(mon + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + (+m[1] - 1) * 7 + (+sc.day - 1));
    const date = d.toISOString().slice(0, 10), done = !!state['rf' + m[1] + 'r' + m[2] + 'done'];
    events.push({ uid: 'pm-' + tag + '-renfo-w' + m[1] + 'r' + m[2] + '-' + shortHash(date + sc.time + done), title: (done ? '✓ ' : '💪 ') + 'Renfo ' + m[2],
      desc: +m[2] === 1 ? 'Ischio-fessiers · 6 exercices' : 'Bas du dos · 5 exercices', date, time: sc.time, min: 30, key: k, done });
  });
  events.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return { events, dups, skipped };
}

// Ancien plan Seine-Eure écrit en dur (admin qui ne l'a pas quitté) : clés edit_w / extra_w comme avant
function legacyEvents(state) {
  const events = [];
  const extraTypesByWeek = {};
  Object.keys(state).forEach((k) => { const em = k.match(/^extra_w(\d+)_s(\d+)$/); if (!em) return; try { const s = JSON.parse(state[k]); if (s && s.type) (extraTypesByWeek[em[1]] = extraTypesByWeek[em[1]] || new Set()).add(s.type); } catch (e) {} });
  const at = (ws, day) => { const w = getWeekStartDate(ws, state); w.setDate(w.getDate() + (day - 1)); return w.getFullYear() + '-' + pad2(w.getMonth() + 1) + '-' + pad2(w.getDate()); };
  Object.keys(state).forEach((key) => {
    const m = key.match(/^edit_w(\d+)_s(\d+)$/); if (!m || state[`del_w${m[1]}_s${m[2]}`] || state[`extra_w${m[1]}_s${m[2]}`]) return;
    try {
      const s = JSON.parse(state[key]); if (!s.sched_day || !s.sched_time) return;
      if (extraTypesByWeek[m[1]] && extraTypesByWeek[m[1]].has(s.type)) return;
      const parts = (s.d || '').split('|');
      events.push({ uid: `run_w${m[1]}_s${m[2]}`, title: typeToTitle[s.type] || 'Run - EF', desc: [`${s.km} km`, parts[1] || ''].filter(Boolean).join(' · '), date: at(+m[1], s.sched_day), time: s.sched_time, min: 60 });
    } catch (e) {}
  });
  Object.keys(state).forEach((key) => {
    const m = key.match(/^extra_w(\d+)_s(\d+)$/); if (!m || state[`del_w${m[1]}_s${m[2]}`]) return;
    try {
      const b = JSON.parse(state[key]); if (b.type === 'rest' || (!b.sched_date && !b.sched_day)) return;
      const e = state[`edit_w${m[1]}_s${m[2]}`] ? JSON.parse(state[`edit_w${m[1]}_s${m[2]}`]) : null;
      const type = (e && e.type) || b.type, km = (e && e.km) || b.km, d = (e && e.d) || b.d, time = (e && e.sched_time) || b.sched_time || '09:00';
      events.push({ uid: b._uid || `extra_w${m[1]}_s${m[2]}`, seq: b._seq || 0, title: typeToTitle[type] || 'Run - EF', desc: [`${km} km`, (d || '').split('|')[1] || ''].filter(Boolean).join(' · '),
        date: b.sched_date || at(+m[1], b.sched_day), time, min: 60 });
    } catch (e) {}
  });
  Object.keys(state).forEach((key) => {
    const m = key.match(/^rf(\d+)r(\d+)sched$/); if (!m) return;
    try { const sc = JSON.parse(state[key]); if (!sc.day || !sc.time) return;
      events.push({ uid: `renfo_w${m[1]}_r${m[2]}`, title: `Renfo ${m[2]}`, desc: +m[2] === 1 ? 'Ischio-fessiers · 6 exercices' : 'Bas du dos · 5 exercices', date: at(+m[1], sc.day), time: sc.time, min: 30 });
    } catch (e) {}
  });
  return { events, dups: [], skipped: [] };
}

function calendarEvents(state, today) { return state && state._plan_engine && state.plan_start_date ? generatedEvents(state, today) : legacyEvents(state || {}); }

function calendarIcs(events) {
  const vtimezone = [
    'BEGIN:VTIMEZONE', 'TZID:Europe/Paris',
    'BEGIN:STANDARD', 'DTSTART:19701025T030000', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10', 'END:STANDARD',
    'BEGIN:DAYLIGHT', 'DTSTART:19700329T020000', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3', 'END:DAYLIGHT',
    'END:VTIMEZONE'].join('\r\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Prepa Marathon//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Prépa Marathon',
    'X-WR-TIMEZONE:Europe/Paris', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H', vtimezone, ...events.map(buildEvent), 'END:VCALENDAR'].join('\r\n') + '\r\n';
}

exports.calendarToken = onRequest({ cors: true }, async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  try { await verifyAdmin(req); } catch(e) { res.status(403).json({ error: 'Accès réservé' }); return; }
  const db = admin.database();
  const token = await getOrCreateCalToken(db);
  const url = `https://us-central1-prepa-marathon.cloudfunctions.net/calendar?token=${token}`;
  res.json({ token, url });
});

exports.calendar = onRequest({ cors: true, memory: '512MiB', timeoutSeconds: 60 }, async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  const db = admin.database();
  // Auth : token dans l'URL (pour clients calendrier) ou Bearer JWT (pour l'app)
  const queryToken = (req.query || {}).token;
  if (queryToken) {
    const calToken = await getOrCreateCalToken(db);
    if (queryToken !== calToken) { res.status(403).send('Token invalide'); return; }
  } else {
    try { await verifyAdmin(req); } catch(e) { res.status(403).send('Accès réservé'); return; }
  }
  let state = {};
  try {
    const snap = await db.ref(`${ADMIN_STATE}`).once('value');
    state = snap.val() || {};
  } catch(e) {}
  const { parisToday } = require('./helpers');
  const today = parisToday();
  const C = calendarEvents(state, today);
  // ?debug=1 : contenu du calendrier en clair (vérification depuis l'app, Compte › Abonnement calendrier)
  if ((req.query || {}).debug === '1') {
    res.json({ count: C.events.length, plan: state._plan_engine ? 'generated' : 'seine-eure', today,
      events: C.events.map((e) => ({ uid: e.uid, date: e.date, time: e.time, min: e.min, title: e.title, desc: e.desc, key: e.key || null })), dups: C.dups, skipped: C.skipped });
    return;
  }
  const ics = calendarIcs(C.events);
  if (queryToken) await require('./helpers').healthMark('calendar', true, C.events.length + ' entrées', db);   // agenda abonné : il lit toujours le calendrier
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="prepa-marathon.ics"');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.send(ics);
});

// pour les tests (fonctions ordinaires, pas des Cloud Functions)
exports.calendarEvents = calendarEvents;
exports.calendarIcs = calendarIcs;
exports.icsEsc = icsEsc;
exports.icsFold = icsFold;
