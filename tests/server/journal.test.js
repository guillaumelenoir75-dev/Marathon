// sessionJournal (journal de séance relu par le Coach) et situation d'entraînement : zones FC recalées, signal de la foulée
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFunctions, callHttp } = require('../helpers/functions');

test('sessionJournal : réponse de l\'IA validée (effort, douleur, zone de la liste, note nettoyée)', async () => {
  let F = loadFunctions({ ai: 'Voici : {"rpe": 7, "pain_level": 1, "pain_zone": "Mollet gauche", "note": "Dur sur la fin |\\n mollet tendu"}' });
  let r = (await callHttp(F.coach.sessionJournal, { text: 'dur sur la fin, mollet un peu tendu', session: { title: 'Tempo', type: 'tempo', km: 10 } })).out;
  assert.equal(r.success, true); assert.equal(r.rpe, 7);
  assert.deepEqual(r.pain, { level: 1, zone: 'Autre' }, 'zone hors liste → Autre');
  assert.ok(!/[|\n]/.test(r.note));
  assert.match(F.calls.ai[0].user, /Compte rendu : « dur sur la fin/);
  F = loadFunctions({ ai: '{"rpe": 14, "pain_level": 0, "pain_zone": "Genou", "note": null}' });
  r = (await callHttp(F.coach.sessionJournal, { text: 'facile, rien à signaler' })).out;
  assert.equal(r.rpe, null, 'effort hors échelle refusé'); assert.deepEqual(r.pain, { level: 0, zone: null });
  F = loadFunctions({ ai: 'pas de JSON' });
  assert.equal((await callHttp(F.coach.sessionJournal, { text: 'facile' })).status, 502);
  assert.equal((await callHttp(F.coach.sessionJournal, { text: '' })).status, 400);
});

test('situation du Coach : zones FC recalées prioritaires et signal de la foulée récent', async () => {
  const F = loadFunctions({ data: {}, modules: [] });
  const st = { _plan_engine: 'generated', _hr_zones: { applied: true, at: '2026-10-20', efMax: 152, lthr: 171, fcMax: 190 },
    _body_signals: { at: '2026-10-28', level: 2, items: ['FC plus haute à allure égale.', 'Cadence en baisse.'] } };
  const t = (await F.helpers.buildTrainingSituation(F.db, st, '2026-10-29')).text;
  assert.match(t, /PRIORITAIRES.*jusqu'à 152 bpm, FC au seuil ~171 bpm, FC max 190 bpm/);
  assert.match(t, /Signal de la foulée.*Cadence en baisse\..*pas de hausse de charge/);
  st._body_signals.at = '2026-10-20'; st._hr_zones.applied = false;
  const t2 = (await F.helpers.buildTrainingSituation(F.db, st, '2026-10-29')).text;
  assert.ok(!/Signal de la foulée|PRIORITAIRES/.test(t2), 'signal trop ancien, zones non appliquées');
});

test('situation du Coach : charge récente et dernière séance incluent la prépa précédente ; allure EF de l\'app', async () => {
  const UID = 'WkEWrmnYWuUNkGLrwXf9HhaJWfh1';
  const old = { _plan_engine: 'generated', extra_w1_s0: JSON.stringify({ type: 'ef', km: 12, sched_date: '2026-10-24' }), extra_w1_s0_done: true, extra_w1_s0_km: 12,
    extra_w1_s0_perf: JSON.stringify({ date: '2026-10-24', pace: '5:40', hr: 140 }) };
  const data = { users: { [UID]: { prep_index: { seine: { title: 'Marathon', date: '2026-10-18', dist: 'Marathon' } }, preps: { seine: old } } } };
  const F = loadFunctions({ data, modules: [] });
  const st = { _plan_engine: 'generated', _prep_id: 'nov', _ef_ref: { pace: "5'38", at: '2026-10-28' }, _hr_zones: { applied: true, efMax: 151 } };
  const t = (await F.helpers.buildTrainingSituation(F.db, st, '2026-10-29')).text;
  assert.match(t, /Charge récente : 12 km sur les 7 derniers jours \(1 séance\)/);
  assert.match(t, /Dernière séance : .*24 octobre.* 12 km à 5:40\/km/);
  assert.equal(F.helpers.efRefOf(st, '2026-10-29'), "5'38");
  assert.equal(F.helpers.efRefOf(st, '2026-11-10'), null, 'référence trop ancienne');
  assert.equal(F.helpers.efMaxOf(st), 151); assert.equal(F.helpers.efMaxOf({}), 148);
});

test('stravaHistory : toutes les pages, courses seulement, résumé dans state, puis seulement les nouvelles', async () => {
  const { loadFunctions: lf } = require('../helpers/functions');
  const act = (id, d, type) => ({ id, type, sport_type: type, start_date: d + 'T06:30:00Z', start_date_local: d + 'T07:30:00Z', distance: 10000, moving_time: 2700, elapsed_time: 2760, average_heartrate: 145, max_heartrate: 168, average_cadence: 86, total_elevation_gain: 50, name: 'Run ' + id, workout_type: id === 2 ? 1 : 0 });
  const page1 = Array.from({ length: 200 }, (_, i) => act(1000 + i, '2025-0' + (1 + (i % 9)) + '-1' + (i % 9), i % 10 === 0 ? 'Ride' : 'Run'));
  const page2 = [act(2, '2024-06-02', 'Run'), act(3, '2024-06-03', 'TrailRun')];
  const data = { users: { U1: { state: { strava_token: { access_token: 't', refresh_token: 'r', expires_at: Date.now() / 1000 + 3600 } } } } };
  const F = lf({ data, uid: 'U1', modules: ['strava.js'], fetch: async (url) => ({ ok: true, status: 200, json: async () => /page=1/.test(url) ? page1 : /page=2/.test(url) ? page2 : [] }) });
  let r = (await callHttp(F.strava.stravaHistory, {})).out;
  assert.equal(r.success, true); assert.equal(r.full, true);
  assert.equal(r.count, 182, '180 courses page 1 (vélo écarté) + 2 page 2');
  assert.equal(F.db.data.users.U1.strava_history[2].w, 1);
  assert.equal(F.db.data.users.U1.strava_history[3].sp, 'TrailRun');
  assert.equal(F.db.data.users.U1.state._strava_hist.first, '2024-06-02');
  r = (await callHttp(F.strava.stravaHistory, {})).out;
  assert.equal(r.full, false); assert.ok(F.calls.fetch.slice(-1)[0].includes('&after='), 'ensuite : seulement les nouvelles');
});

test('pilote de nuit (serveur) : moteur de l\'app exécuté sur l\'état, seules les séances changées écrites, résumé pour le brief', async () => {
  const { loadFunctions: lf } = require('../helpers/functions');
  const { synthPlan } = require('../helpers/frontend');
  const st = synthPlan({ km: [30, 34, 38, 40, 42, 30], start: '2026-10-26' });
  st.record_10km = '40:00'; st._records = { '10 km': { date: '2026-10-10' } };
  st.onboarding = { course: '10 km', date: '2026-12-06', race_name: 'Course test' };
  const UID = 'WkEWrmnYWuUNkGLrwXf9HhaJWfh1';
  const F = lf({ data: { users: { [UID]: { state: st } } }, modules: ['autopilot.js'] });
  const r = await F.autopilot.runAutopilot(F.db, UID, '2026-10-29');
  assert.equal(r.applied, true, JSON.stringify(r));
  const S = F.db.data.users[UID].state;
  assert.match(JSON.parse(S.extra_w2_s1).d, /4'25 — 4'30/);
  assert.equal(S._autopilot_last.date, '2026-10-29'); assert.ok(S._server_rev > 0);
  assert.equal(S.extra_w1_s0, st.extra_w1_s0, 'séance non concernée intacte');
  const t = F.helpers.autopilotBriefText(S, '2026-10-29');
  assert.match(t, /APPLIQUÉS automatiquement/); assert.match(t, /Tempo 3×8 min — allure \/ consigne : .*4'35 — 4'40.* → .*4'25 — 4'30/);
  assert.match(F.helpers.autopilotBriefText(S, '2026-10-30'), /aucun — séance confirmée/);
  S._autopilot = 'off'; assert.equal((await F.autopilot.runAutopilot(F.db, UID, '2026-10-30')).skip, 'désactivé');
});

test('analyse de séance : le ressenti de Guillaume est lu en premier ; une EF accélérée par choix n\'est pas reprochée', async () => {
  const { loadFunctions: lf, callHttp: ch } = require('../helpers/functions');
  const F = lf({ data: {}, modules: ['coach.js'], ai: '[FEU:🟢]\n⭐ ÉVALUATION\n●●●●●●●●○○ **8/10**' });
  const sessionData = { type: 'long', titre: 'Sortie longue', kmRealise: 10, allure: '4:53', fc: 157,
    ressenti_athlete: { ce_que_guillaume_a_dit: 'Super séance, je me sentais bien après le 1er km alors j\'ai accéléré, très content', effort_ressenti_sur_10: 6, douleur: 'aucune' },
    ecart_consigne: { allure_prevue: "5'35", allure_realisee: "4'53", ecart_sec: 42, sens: 'plus rapide que prévu' } };
  const r = await ch(F.coach.analyzeSession, { sessionData, historyData: [], planContext: {} });
  assert.equal(r.status, 200, JSON.stringify(r.out));
  const call = F.calls.ai[0];
  assert.match(call.user, /^RESSENTI DE GUILLAUME \(à lire en premier\) : .*je me sentais bien.*écart à la consigne/);
  assert.match(call.system, /RESSENTI ET ÉCART CHOISI — RÈGLE PRIORITAIRE/);
  assert.match(call.system, /JAMAIS de reproche/);
  assert.match(call.system, /REQUALIFIE la séance/);
  assert.match(call.system, /Ne JAMAIS appeler « dérive » la montée de FC du km 1/);
  assert.equal(call.maxTokens, 900, 'assez long pour tous les blocs (🎯 compris)');
});

test('analyse de séance : cadre imposé quand l\'EF est courue plus vite par choix — jamais de feu rouge, note plancher', async () => {
  const { loadFunctions: lf, callHttp: ch } = require('../helpers/functions');
  const ec = { allure_prevue: "5'35", allure_realisee: "4'53", ecart_sec: 42, sens: 'plus rapide que prévu' };
  const F = lf({ data: {}, modules: ['coach.js'], ai: '[FEU:🔴]\n⭐ ÉVALUATION\n●●●○○○○○○○ **3/10**\nSortie longue transformée en course.' });
  const C = F.coach;
  // détection
  assert.equal(C.analysisFrame({ ecart_consigne: ec, ressenti_athlete: { ce_que_guillaume_a_dit: 'Je me sentais bien, super content', douleur: 'aucune' } }).kind, 'choisi');
  assert.equal(C.analysisFrame({ ecart_consigne: ec }).kind, 'sans_ressenti');
  assert.equal(C.analysisFrame({ ecart_consigne: ec, ressenti_athlete: { ce_que_guillaume_a_dit: 'Pas bien, jambes lourdes' } }), null, 'ressenti négatif : pas de cadre');
  assert.equal(C.analysisFrame({ ecart_consigne: ec, ressenti_athlete: { ce_que_guillaume_a_dit: 'top', douleur: { niveau_0_3: 2, zone: 'Mollet' } } }), null, 'douleur : pas de cadre');
  assert.equal(C.analysisFrame({ ecart_consigne: Object.assign({}, ec, { sens: 'plus lent que prévu' }) }), null);
  // réponse : feu rouge et 3/10 corrigés, cadre dans la consigne (début et fin)
  const sessionData = { type: 'long', allure: '4:53', fc: 157, ecart_consigne: ec, ressenti_athlete: { ce_que_guillaume_a_dit: 'Je me sentais bien après le 1er km, j\'ai accéléré, très content', douleur: 'aucune' } };
  const r = await ch(C.analyzeSession, { sessionData, historyData: [], planContext: {} });
  assert.match(r.out.analysis, /^\[FEU:🟡\]/);
  assert.match(r.out.analysis, /●●●●●●○○○○ \*\*6\/10\*\*/);
  const u = F.calls.ai[0].user;
  assert.match(u, /CADRE IMPOSÉ POUR CETTE ANALYSE \(non négociable/);
  assert.match(u.slice(-1500), /JAMAIS \[FEU:🔴\]/, 'rappelé en fin de message');
  // consigne recopiée dans la réponse : retirée
  assert.equal(C.analysisFix('[FEU:🟡]\n●●●●●●●○○○ **7/10**\nMais ton WHOOP affiche 26/100 aujourd\'hui — une phrase d\'info, pas un reproche : le système nerveux récupère.', C.analysisFrame(sessionData)).split('\n')[2], 'Mais ton WHOOP affiche 26/100 aujourd\'hui : le système nerveux récupère.');
  // une bonne note n'est pas touchée
  assert.match(C.analysisFix('[FEU:🟢]\n●●●●●●●●○○ **8/10**', C.analysisFrame(sessionData)), /\*\*8\/10\*\*/);
});

test('« Mon plan » (planChat) : réponse + changements validés (séances à venir seulement, km bornés), ajustements calculés approuvés, fil transmis', async () => {
  const { loadFunctions: lf, callHttp: ch } = require('../helpers/functions');
  const ai = JSON.stringify({ reply: 'Belle semaine ! Je te propose de passer la sortie longue de dimanche de **12 à 14 km**.',
    changes: [{ ref: 'extra_w3_s2', km: 14, reason: 'Semaine réussie, hausse de 2 km raisonnable' },
      { ref: 'extra_w2_s0', km: 20, reason: 'séance déjà faite : refusée' },
      { ref: 'extra_w3_s1', km: 40, reason: 'hors bornes : refusée' }],
    auto: ['extra_w3_s1:detail', 'extra_w9_s9:km'] });
  const F = lf({ data: {}, modules: ['coach.js'], ai });
  const plan = [{ w: 2, sessions: [{ ref: 'extra_w2_s0', date: '2026-10-27', type: 'ef', title: 'Footing', km: 8, done: true }] },
    { w: 3, sessions: [{ ref: 'extra_w3_s1', date: '2026-11-04', type: 'tempo', title: 'Tempo', km: 10, detail: "3 × 8 min à 4'35" }, { ref: 'extra_w3_s2', date: '2026-11-08', type: 'long', title: 'Sortie longue', km: 12 }] }];
  const r = await ch(F.coach.planChat, { today: '2026-10-31', plan, next: true, message: 'Cette semaine ça s\'est bien passé, un peu plus de volume la semaine prochaine ?',
    proposals: [{ ref: 'extra_w3_s1', champ: 'detail' }], thread: [{ r: 'u', t: 'Salut' }, { r: 'c', t: 'Je te propose 10 km', ch: [{ title: 'Footing', field: 'km', before: '8 km', after: '10 km' }], st: 'applied' }] });
  assert.equal(r.status, 200, JSON.stringify(r.out));
  assert.match(r.out.reply, /12 à 14 km/);
  assert.deepEqual(r.out.changes.map((c) => [c.ref, c.km]), [['extra_w3_s2', 14]]);
  assert.deepEqual(r.out.auto, ['extra_w3_s1:detail']);
  const u = F.calls.ai[0].user;
  assert.match(u, /MESSAGE DE GUILLAUME : Cette semaine ça s'est bien passé/);
  assert.match(u, /Coach : Je te propose 10 km \[propositions : Footing — km : 8 km → 10 km — APPLIQUÉES\]/);
  assert.match(F.calls.ai[0].system, /UNIQUEMENT de son plan/);
  // réponse non JSON : gardée telle quelle, sans changement
  const F2 = lf({ data: {}, modules: ['coach.js'], ai: 'Je pense que tu peux garder ce volume.' });
  const r2 = await ch(F2.coach.planChat, { today: '2026-10-31', plan, next: true, message: 'Et alors ?' });
  assert.equal(r2.out.reply, 'Je pense que tu peux garder ce volume.'); assert.deepEqual(r2.out.changes, []);
  assert.equal((await ch(F2.coach.planChat, { today: '2026-10-31', plan, message: '' })).status, 400);
});
