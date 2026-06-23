const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();

const { verifyAdmin, ADMIN_STATE } = require('./helpers');

const typeToTitle = {
  ef: "Run - EF",
  tempo: "Run - Tempo",
  frac: "Run - Fractionné",
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
  try { await verifyAdmin(req); } catch(e) { res.status(403).send('Accès réservé'); return; }
  const db = admin.database();
  const authHeader = req.headers.authorization || '';
  let state = {};
  try {
    const token = authHeader.slice(7);
    const decoded = await admin.auth().verifyIdToken(token);
    const snap = await db.ref('users/' + decoded.uid + '/state').once('value');
    state = snap.val() || {};
    if (Object.keys(state).length === 0) {
      const oldSnap = await db.ref(`${ADMIN_STATE}`).once('value');
      state = oldSnap.val() || {};
    }
  } catch(e) {
    const snapshot = await db.ref(`${ADMIN_STATE}`).once('value');
    state = snapshot.val() || {};
  }
  const events = [];

  // Ancien format (weeks hardcodé) avec overrides edit_w
  // Ignorer les edit_w qui correspondent à des sessions extra_w (traitées ci-dessous)
  Object.keys(state).forEach(key => {
    const match = key.match(/^edit_w(\d+)_s(\d+)$/);
    if (!match) return;
    if (state[`extra_w${match[1]}_s${match[2]}`]) return; // géré par la boucle extra_w
    if (state[`del_w${match[1]}_s${match[2]}`]) return;
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
      events.push(buildEvent(`run_w${match[1]}_s${match[2]}`, title, desc, eventDate, 60));
    } catch(e) {}
  });

  // Nouveau format (extra_w) — applique les overrides edit_w si présents
  Object.keys(state).forEach(key => {
    const match = key.match(/^extra_w(\d+)_s(\d+)$/);
    if (!match) return;
    try {
      const base = JSON.parse(state[key]);
      if (base.type === 'rest') return;
      const ws = parseInt(match[1]);
      const ei = parseInt(match[2]);
      // Fusionner avec l'override edit_w si présent
      const editRaw = state[`edit_w${ws}_s${ei}`];
      const edit = editRaw ? JSON.parse(editRaw) : null;
      const session = edit ? { ...base, ...edit } : base;
      if (!session.sched_time) return;
      const [h, m] = session.sched_time.split(":").map(Number);
      let eventDate;
      if (edit && edit.sched_day) {
        // Jour modifié par l'utilisateur → recalcul depuis le lundi de la semaine
        const weekStart = getWeekStartDate(ws);
        eventDate = new Date(weekStart);
        eventDate.setDate(weekStart.getDate() + (edit.sched_day - 1));
        eventDate.setHours(h, m, 0, 0);
      } else if (base.sched_date) {
        // Utiliser la date réelle stockée dans la séance générée
        eventDate = new Date(base.sched_date + 'T' + session.sched_time + ':00');
      } else if (session.sched_day) {
        const weekStart = getWeekStartDate(ws);
        eventDate = new Date(weekStart);
        eventDate.setDate(weekStart.getDate() + (session.sched_day - 1));
        eventDate.setHours(h, m, 0, 0);
      } else {
        return;
      }
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
