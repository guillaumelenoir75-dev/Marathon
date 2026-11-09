// Calendrier (functions/calendar.js) : exactement les séances de l'app, jamais d'anciennes clés, ICS valide
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFunctions, callHttp } = require('../helpers/functions');
const { synthPlan } = require('../helpers/frontend');

const ADMIN_UID = 'WkEWrmnYWuUNkGLrwXf9HhaJWfh1';
const load = (state) => loadFunctions({ modules: ['calendar.js'], data: { users: { [ADMIN_UID]: { state } } } });

test('prépa générée : une entrée par séance de l\'app, date réelle des séances faites, retirées et anciennes clés Seine-Eure ignorées', async () => {
  const st = synthPlan({ start: '2026-11-02', km: [24, 28, 30] });
  st._prep_id = 'p10k';
  st.extra_w1_s0_done = true; st.extra_w1_s0_km = 8.2;
  st.extra_w1_s0_perf = JSON.stringify({ date: '2026-11-03', dur: '47:30', pace: "5'47", hr: 141 });   // faite le mardi, prévue le lundi
  st.extra_w2_s1_skip = true;                                                                        // retirée
  // restes de l'ancien plan Seine-Eure : jamais dans le calendrier d'une prépa générée
  st.edit_w2_s1 = JSON.stringify({ type: 'frac', km: 14, d: 'Fractionné 10×400|vieux', sched_day: 2, sched_time: '07:00' });
  st.edit_w2_s7 = JSON.stringify({ type: 'ef', km: 12, d: 'Footing|fantôme', sched_day: 4, sched_time: '07:00' });
  st.edit_w1_s2 = JSON.stringify({ type: 'long', km: 30, d: 'Sortie longue|ancienne', sched_time: '06:00' });
  const { calendar } = load(st);
  const E = calendar.calendarEvents(st, '2026-11-09').events;
  const keys = E.map((e) => e.key);
  assert.equal(keys.length, 8, '9 séances − 1 retirée : ' + keys.join(','));
  assert.ok(!keys.includes('extra_w2_s1'), 'séance retirée absente');
  assert.ok(!E.some((e) => /vieux|fantôme|ancienne/.test(e.title + e.desc)), 'anciennes clés edit_w ignorées');
  const done = E.find((e) => e.key === 'extra_w1_s0');
  assert.equal(done.date, '2026-11-03', 'séance faite : date réelle'); assert.equal(done.min, 50);
  assert.match(done.title, /^✓ Footing EF/); assert.match(done.desc, /Faite : 8,2 km · 5'47\/km · FC 141/);
  const long = E.find((e) => e.key === 'extra_w1_s2');
  assert.equal(long.date, '2026-11-08'); assert.match(long.title, /🏃 Sortie longue|🏃 5'45/);
  assert.ok(E.every((e) => /^pm-[0-9a-f]{10}-/.test(e.uid)), 'UID propre à la prépa');
  assert.equal(new Set(E.map((e) => e.uid)).size, E.length, 'UID uniques');
});

test('UID : change dès que la séance change (date, km, consigne) ; une autre prépa n\'a jamais les mêmes UID', () => {
  const st = synthPlan({ start: '2026-11-02', km: [24, 28] }); st._prep_id = 'A';
  const { calendar } = load(st);
  const uidOf = (s) => calendar.calendarEvents(s, '2026-11-09').events.find((e) => e.key === 'extra_w2_s0').uid;
  const u0 = uidOf(st);
  assert.equal(uidOf(st), u0, 'stable sans changement');
  const x = JSON.parse(st.extra_w2_s0); x.km = 5; st.extra_w2_s0 = JSON.stringify(x);
  const u1 = uidOf(st); assert.notEqual(u1, u0, 'km changés');
  x.sched_date = '2026-11-10'; st.extra_w2_s0 = JSON.stringify(x);
  assert.notEqual(uidOf(st), u1, 'date changée');
  assert.notEqual(uidOf(Object.assign({}, st, { _prep_id: 'B' })), uidOf(st), 'autre prépa');
});

test('doublon exact (même jour, même séance, deux clés) : une seule entrée, signalé dans le diagnostic', () => {
  const st = synthPlan({ start: '2026-11-02', km: [24, 28] });
  st.extra_w1_s3 = st.extra_w1_s1;   // même tempo le même jour
  const { calendar } = load(st);
  const C = calendar.calendarEvents(st, '2026-11-09');
  assert.equal(C.events.filter((e) => e.date === '2026-11-04').length, 1);
  assert.deepEqual(C.dups.map((d) => [d.key, d.same]), [['extra_w1_s3', 'extra_w1_s1']]);
});

test('ICS : texte échappé (virgule, point-virgule), lignes ≤ 75 octets, heure de Paris, DTSTAMP en UTC ; renfo planifié, semaine retirée exclue', () => {
  const st = synthPlan({ start: '2026-11-02', km: [24, 28] });
  st.extra_w1_s0 = JSON.stringify({ type: 'ef', km: 8, d: 'Footing + accélérations|8 km EF, puis 6 lignes droites; récup marchée', sched_date: '2026-11-02', sched_day: 1, sched_time: '12:15' });
  st.rf1r1sched = JSON.stringify({ day: 3, time: '19:00' }); st.rf2r1sched = JSON.stringify({ day: 3, time: '19:00' }); st.rf2skip = true;
  const { calendar } = load(st);
  const E = calendar.calendarEvents(st, '2026-11-09').events;
  assert.deepEqual(E.filter((e) => /Renfo/.test(e.title)).map((e) => e.date), ['2026-11-04'], 'renfo S1 seulement');
  const ics = calendar.calendarIcs(E);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/); assert.match(ics, /END:VCALENDAR\r\n$/);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.match(unfolded, /DESCRIPTION:8 km EF\\, puis 6 lignes droites\\; récup marchée\\n8 km · ~/);
  assert.match(unfolded, /DTSTART;TZID=Europe\/Paris:20261102T121500\r\nDTEND;TZID=Europe\/Paris:20261102T130500/);
  assert.match(ics, /DTSTAMP:\d{8}T\d{6}Z/);
  ics.split('\r\n').forEach((l) => assert.ok(Buffer.byteLength(l) <= 75, 'ligne trop longue : ' + l));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, E.length);
});

test('fonction HTTP : jeton de l\'URL vérifié, ?debug=1 = contenu lisible', async () => {
  const st = synthPlan({ start: '2026-11-02', km: [24, 28] }); st._cal_token = 'tok';
  const F = load(st);
  let out = null, status = 200, sent = null;
  const res = { set() { return res; }, setHeader() {}, status(s) { status = s; return res; }, json(j) { out = j; }, send(x) { sent = x; } };
  await F.calendar.calendar({ method: 'GET', query: { token: 'mauvais' }, headers: {} }, res);
  assert.equal(status, 403);
  status = 200;
  await F.calendar.calendar({ method: 'GET', query: { token: 'tok', debug: '1' }, headers: {} }, res);
  assert.equal(out.plan, 'generated'); assert.equal(out.count, 6); assert.deepEqual(out.dups, []);
  await F.calendar.calendar({ method: 'GET', query: { token: 'tok' }, headers: {} }, res);
  assert.match(sent, /BEGIN:VCALENDAR/); assert.equal((sent.match(/BEGIN:VEVENT/g) || []).length, 6);
  assert.ok(callHttp);
});

test('jeton : l\'adresse déjà dans l\'agenda reste valable même si l\'état perd _cal_token', async () => {
  const st = synthPlan({ start: '2026-11-02', km: [24, 28] }); st._cal_token = 'tok';
  const F = load(st);
  const call = async (q) => { let status = 200, sent = null; const res = { set() { return res; }, setHeader() {}, status(s) { status = s; return res; }, json(j) { sent = j; }, send(x) { sent = x; } };
    await F.calendar.calendar({ method: 'GET', query: q, headers: {} }, res); return { status, sent }; };
  assert.equal((await call({ token: 'tok' })).status, 200);
  delete F.db.data.users[ADMIN_UID].state._cal_token;   // clé perdue côté état
  const r = await call({ token: 'tok' });
  assert.equal(r.status, 200, 'même adresse toujours acceptée');
  assert.equal(F.db.data.users[ADMIN_UID].state._cal_token, 'tok', 'recopié dans l\'état');
  assert.equal((await call({ token: 'autre' })).status, 403);
});
