// Outils du Coach (coach-tools.js) : il va chercher une séance, compare, lit le plan, la météo, son niveau,
// et tient la liste des points à suivre ; notes de {{PRENOM}} → consignes ; reconnaissance vocale Google.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFunctions, callHttp } = require('../helpers/functions');

const UID = 'WkEWrmnYWuUNkGLrwXf9HhaJWfh1';
const J = (o) => JSON.stringify(o);
function stateFixture() {
  return {
    _plan_engine: 'generated', plan_start_date: '2026-11-02', fc_max: 190,
    extra_w2_s0: J({ type: 'ef', d: 'Footing EF|8 km en endurance', km: 8, sched_day: 2 }),
    extra_w2_s0_done: true, extra_w2_s0_km: 8.2,
    extra_w2_s0_perf: J({ date: '2026-11-10', pace: '5:12', hr: 142, dur: '42:38', rpe: 4, note: 'Bonnes jambes', strava: { splits: [{ km: 1, allure: '5:20', fc: 135 }, { km: 2, allure: '5:08', fc: 144 }] } }),
    extra_w2_s1: J({ type: 'long', d: 'Sortie longue|14 km tranquille', km: 14, sched_day: 7 }),
    extra_w2_s1_done: true, extra_w2_s1_km: 14,
    extra_w2_s1_perf: J({ date: '2026-11-15', pace: '5:30', hr: 140, dur: '1:17:00' }),
    extra_w3_s0: J({ type: 'tempo', d: 'Tempo|2 × 10 min allure seuil', km: 10, sched_day: 3, sched_time: '18:30' }),
    _last_location: J({ lat: 48.85, lng: 2.35 }),
  };
}
// réponse en flux de l'IA : blocs texte et appels d'outils, raison d'arrêt
function sse(blocks, stop) {
  const ev = [];
  blocks.forEach((b, i) => {
    if (b.tool) {
      ev.push({ type: 'content_block_start', index: i, content_block: { type: 'tool_use', id: 'tu' + i, name: b.tool, input: {} } });
      ev.push({ type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input).slice(0, 5) } });
      ev.push({ type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input).slice(5) } });
    } else {
      ev.push({ type: 'content_block_start', index: i, content_block: { type: 'text', text: '' } });
      ev.push({ type: 'content_block_delta', index: i, delta: { type: 'text_delta', text: b.text } });
    }
    ev.push({ type: 'content_block_stop', index: i });
  });
  ev.push({ type: 'message_delta', delta: { stop_reason: stop || 'end_turn' } });
  ev.push({ type: 'message_stop' });
  return { ok: true, status: 200, body: (async function* () { yield Buffer.from(ev.map((e) => 'data: ' + JSON.stringify(e)).join('\n') + '\n'); })() };
}
async function callStream(fn, body) {
  let out = '';
  const res = { set() { return res; }, setHeader() {}, header() {}, status() { return res; }, json(j) { out += JSON.stringify(j); }, send() {}, write(x) { out += x; }, end() {}, headersSent: false };
  await fn({ method: 'POST', body, headers: { authorization: 'Bearer test', accept: 'text/event-stream' } }, res);
  return out;
}
const events = (out) => out.split('\n').filter((l) => l.startsWith('data: ') && l !== 'data: [DONE]').map((l) => JSON.parse(l.slice(6)));

test('le Coach va chercher une séance précise (detail_seance) puis répond, dans le même flux', async () => {
  const bodies = [];
  const F = loadFunctions({ data: { users: { [UID]: { state: stateFixture() } } }, fetch: async (url, o) => {
    const b = JSON.parse(o.body); bodies.push(b);
    return bodies.length === 1 ? sse([{ text: 'Je regarde.' }, { tool: 'detail_seance', input: { date: '2026-11-10' } }], 'tool_use') : sse([{ text: "Mardi : 8,2 km à 5'12/km, FC 142." }]);
  } });
  const out = await callStream(F.coach.coachChat, { message: 'Comment était ma sortie de mardi ?', responseMode: 'voix', stateContext: { date_reelle: { jour: 'mardi' } } });
  const E = events(out);
  assert.equal(E.map((e) => e.token).filter(Boolean).join(''), "Je regarde. Mardi : 8,2 km à 5'12/km, FC 142.", 'texte d\'avant la recherche + réponse, séparés par un espace');
  assert.deepEqual(E.find((e) => e.tool), { tool: 'detail_seance', say: 'Je regarde ta séance.' });
  assert.ok(bodies[0].tools.some((t) => t.name === 'detail_seance'), 'outils proposés');
  assert.match(bodies[0].system, /OUTILS — tu peux aller chercher/);
  const tr = bodies[1].messages[bodies[1].messages.length - 1].content[0];
  assert.equal(tr.type, 'tool_result'); assert.equal(tr.tool_use_id, 'tu1');
  const R = JSON.parse(tr.content);
  assert.equal(R.date, '2026-11-10'); assert.equal(R.km, 8.2); assert.equal(R.allure, "5'12"); assert.equal(R.fc, 142); assert.equal(R.effort, '4/10');
  assert.equal(R.splits.length, 2); assert.equal(R.splits[1].allure, "5'08");
  assert.equal(bodies[1].messages[bodies[1].messages.length - 2].content[1].input.date, '2026-11-10', 'appel rendu au Coach avec ses paramètres');
});

test('outils : comparaison, séances faites et prévues, niveau, séance introuvable', async () => {
  const F = loadFunctions({ data: { users: { [UID]: { state: stateFixture() } } } });
  const { ctLoad, ctRun } = require('../../functions/coach-tools');
  const T = await ctLoad(F.db, UID, '2026-11-17');
  const C = await ctRun(T, 'comparer_seances', { date_a: '2026-11-10', date_b: '2026-11-15' });
  assert.equal(C.a.km, 8.2); assert.equal(C.b.km, 14);
  assert.equal(C.ecarts_b_moins_a.allure, '+18 s/km (B plus lente)'); assert.equal(C.ecarts_b_moins_a.fc, '-2 bpm');
  const L = await ctRun(T, 'seances_faites', { du: '2026-11-01', au: '2026-11-17' });
  assert.equal(L.nombre, 2); assert.equal(L.km_total, 22.2);
  const P = await ctRun(T, 'seances_prevues', { du: '2026-11-17', au: '2026-11-30' });
  assert.equal(P.seances[0].date, '2026-11-18'); assert.equal(P.seances[0].heure, '18:30'); assert.equal(P.seances[0].type, 'tempo');
  const N = await ctRun(T, 'detail_seance', { date: '2026-11-12' });
  assert.match(N.erreur, /aucune séance faite le 2026-11-12/); assert.ok(N.seances_proches.some((x) => /2026-11-10/.test(x)));
  const V = await ctRun(T, 'niveau_et_records', {});
  assert.ok(V.plafond_fc_ef > 100);
  assert.deepEqual(await ctRun(T, 'detail_seance', { date: 'mardi' }), { erreur: 'date invalide (AAAA-MM-JJ)' });
});

test('outil météo : relevé horaire à la dernière position du téléphone, à l\'heure de la séance prévue', async () => {
  const F = loadFunctions({ data: { users: { [UID]: { state: stateFixture() } } } });
  const { ctLoad, ctRun } = require('../../functions/coach-tools');
  const T = await ctLoad(F.db, UID, '2026-11-17');
  let asked = '';
  const H = { time: ['2026-11-18T12:00', '2026-11-18T18:00'], temperature_2m: [11.2, 8.4], apparent_temperature: [10, 6.1], relative_humidity_2m: [70, 82], wind_speed_10m: [9, 14.4], precipitation: [0, 0.3], weather_code: [2, 61] };
  const M = await ctRun(T, 'meteo', { date: '2026-11-18' }, { fetch: async (url) => { asked = url; return { ok: true, json: async () => ({ hourly: H }) }; } });
  assert.match(asked, /latitude=48\.85&longitude=2\.35/); assert.match(asked, /start_date=2026-11-18/);
  assert.deepEqual(M, { date: '2026-11-18', jour: 'mercredi', heure: '18:30', temperature: '8°C', ressenti: '6°C', humidite: '82 %', vent: '14 km/h', pluie: '0.3 mm', ciel: 'pluie faible', lieu: 'dernière position du téléphone' });
});

test('points à suivre : le Coach en ouvre un (sans doublon) puis le ferme ; l\'app reçoit le changement ; la situation les liste', async () => {
  const data = { users: { [UID]: { state: stateFixture() } } };
  let n = 0;
  const F = loadFunctions({ data, fetch: async () => { n++;
    if (n === 1) return sse([{ tool: 'suivi_ouvrir', input: { texte: 'Mollet gauche qui tire', type: 'douleur' } }], 'tool_use');
    return sse([{ text: 'Je garde un œil sur ton mollet.' }]); } });
  const out = await callStream(F.coach.coachChat, { message: 'Mon mollet gauche tire un peu', stateContext: {} });
  const th = data.users[UID].state._coach_threads, id = Object.keys(th)[0];
  assert.equal(th[id].t, 'Mollet gauche qui tire'); assert.equal(th[id].k, 'douleur'); assert.equal(th[id].src, 'coach');
  assert.ok(events(out).find((e) => e.threads && e.threads[id]), 'l\'app reçoit le point ouvert');
  const { ctLoad, ctRun } = require('../../functions/coach-tools');
  const T = await ctLoad(F.db, UID, '2026-11-17');
  const again = await ctRun(T, 'suivi_ouvrir', { texte: 'mollet gauche qui tire', type: 'douleur' });
  assert.equal(again.deja, true, 'pas de doublon');
  const txt = F.helpers.threadsText(data.users[UID].state, th[id].due);
  assert.match(txt, new RegExp('\\[' + id + '\\] douleur · « Mollet gauche qui tire » · depuis .* · relance due'));
  const cl = await ctRun(T, 'suivi_fermer', { id, conclusion: 'Plus de gêne' });
  assert.equal(cl.ok, true); assert.equal(data.users[UID].state._coach_threads[id].done.c, 'Plus de gêne');
  assert.equal(F.helpers.threadsText(data.users[UID].state), '', 'fermé = plus listé');
  assert.match((await ctRun(T, 'suivi_fermer', { id: 'zzz' })).erreur, /point inconnu/);
});

test('notes 👍 / 👎 : défauts récents rappelés au Coach, raisons comptées', () => {
  const F = loadFunctions({ data: {} });
  const now = Date.parse('2026-11-17T12:00:00Z');
  const fb = { a: { at: now - 1000, v: -1, why: 'long', q: 'Ma semaine ?', a: 'Un très long texte' }, b: { at: now - 2000, v: -1, why: 'long', q: 'Et demain ?', a: 'Encore long' },
    c: { at: now - 3000, v: 1, q: 'ok', a: 'bien' }, old: { at: now - 40 * 86400000, v: -1, why: 'faux' } };
  const t = F.coach.fbText(fb, now);
  assert.match(t, /👍 1 · 👎 2 \(trop long ×2\)/);
  assert.match(t, /« Ma semaine \? » → « Un très long texte » : trop long/);
  assert.match(t, /fais plus court que d'habitude/);
  assert.doesNotMatch(t, /chiffre ou fait faux/, 'retour de plus de 30 jours ignoré');
  assert.equal(F.coach.fbText({}, now), '');
});

test('reconnaissance vocale Google : vocabulaire de la course, secondes comptées, plafond, repli, athlète refusé', async () => {
  const month = new Date().toISOString().slice(0, 7), calls = [];
  const net = (status) => async (url, o) => { calls.push({ url, body: o && o.body ? JSON.parse(o.body) : null });
    if (/metadata/.test(url)) return { ok: true, status: 200, json: async () => ({ access_token: 't', expires_in: 3600 }), text: async () => 'prepa-marathon' };
    if (status) return { ok: false, status, json: async () => ({}), text: async () => 'refus' };
    return { ok: true, status: 200, json: async () => ({ results: [{ alternatives: [{ transcript: 'Mon allure EF' }] }, { alternatives: [{ transcript: 'cette semaine ?' }] }] }) }; };
  const audio = 'A'.repeat(400);
  const F = loadFunctions({ data: {}, fetch: net() });
  const r = await callHttp(F.coach.coachStt, { audio, sec: 3.2, hints: ['Pegasus 41', 'Marathon de Paris'] });
  assert.deepEqual(r.out, { text: 'Mon allure EF cette semaine ?', sec: 4 });
  const sp = calls.find((c) => /speech\.googleapis\.com\/v2\/projects\/.+\/locations\/global\/recognizers\/_:recognize/.test(c.url));
  assert.ok(sp, 'Speech-to-Text v2'); assert.equal(sp.body.config.model, 'short'); assert.deepEqual(sp.body.config.languageCodes, ['fr-FR']);
  const ph = sp.body.config.adaptation.phraseSets[0].inlinePhraseSet.phrases.map((p) => p.value);
  assert.ok(ph.includes('fractionné') && ph.includes('Pegasus 41') && ph.includes('Marathon de Paris'));
  assert.equal(F.db.data._stt_usage[month], 4);
  const G = loadFunctions({ data: { _stt_usage: { [month]: 3299 } }, fetch: net() });
  const q = await callHttp(G.coach.coachStt, { audio, sec: 5 });
  assert.equal(q.status, 429); assert.equal(q.out.fallback, true);
  const H = loadFunctions({ data: {}, fetch: net(403) });
  const e = await callHttp(H.coach.coachStt, { audio, sec: 2 });
  assert.equal(e.status, 503); assert.equal(e.out.fallback, true);
  const A = loadFunctions({ athlete: true, data: {}, fetch: net() });
  assert.equal((await callHttp(A.coach.coachStt, { audio })).status, 403);
});

test('jamais de réponse vide : flux sans texte (erreur en cours de flux) → dernier tour sans outil, sinon phrase de secours ; relevé pour le diagnostic', async () => {
  const data = { users: { [UID]: { state: stateFixture() } } }, bodies = [];
  const errStream = { ok: true, status: 200, body: (async function* () { yield Buffer.from('data: ' + JSON.stringify({ type: 'error', error: { type: 'overloaded_error' } }) + '\n'); })() };
  const F = loadFunctions({ data, fetch: async (url, o) => { const b = JSON.parse(o.body); bodies.push(b);
    if (b.stream) return errStream;
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'Nuit correcte : récup 62 %.' }] }) }; } });
  const out = await callStream(F.coach.coachChat, { message: "Qu'as-tu pensé de ma nuit ?", responseMode: 'voix', stateContext: {} });
  assert.equal(events(out).map((e) => e.token).filter(Boolean).join(''), 'Nuit correcte : récup 62 %.');
  assert.equal(bodies[0].max_tokens, 400, 'avec les outils : 400 jetons au moins par tour');
  const dbg = data.users[UID].state._coach_dbg;
  assert.equal(dbg.rounds[0].err, 'overloaded_error'); assert.equal(dbg.rounds[1].r, 'secours'); assert.equal(dbg.chars, 'Nuit correcte : récup 62 %.'.length);
  // secours lui aussi vide → phrase fixe, jamais rien
  const G = loadFunctions({ data: { users: { [UID]: { state: stateFixture() } } }, fetch: async (url, o) => (JSON.parse(o.body).stream ? sse([], 'end_turn') : { ok: false, status: 529, json: async () => ({}) }) });
  const out2 = await callStream(G.coach.coachChat, { message: 'Et alors ?', responseMode: 'voix', stateContext: {} });
  assert.match(events(out2).map((e) => e.token).filter(Boolean).join(''), /Repose-moi ta question/);
});

test('réflexion du modèle (thinking) gardée telle quelle pour le tour suivant, jamais envoyée à l\'app', async () => {
  const bodies = [];
  const think = { ok: true, status: 200, body: (async function* () { yield Buffer.from([
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Il veut sa séance.' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'SIG' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tu1', name: 'detail_seance', input: {} } },
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"date":"2026-11-10"}' } },
    { type: 'content_block_stop', index: 1 }, { type: 'message_delta', delta: { stop_reason: 'tool_use' } }].map((e) => 'data: ' + JSON.stringify(e)).join('\n') + '\n'); })() };
  const F = loadFunctions({ data: { users: { [UID]: { state: stateFixture() } } }, fetch: async (url, o) => { bodies.push(JSON.parse(o.body)); return bodies.length === 1 ? think : sse([{ text: 'Mardi : 8,2 km.' }]); } });
  const out = await callStream(F.coach.coachChat, { message: 'Et mardi ?', stateContext: {} });
  assert.equal(events(out).map((e) => e.token).filter(Boolean).join(''), 'Mardi : 8,2 km.');
  const a = bodies[1].messages[bodies[1].messages.length - 2].content;
  assert.deepEqual(a[0], { type: 'thinking', thinking: 'Il veut sa séance.', signature: 'SIG' });
  assert.equal(a[1].type, 'tool_use');
});
