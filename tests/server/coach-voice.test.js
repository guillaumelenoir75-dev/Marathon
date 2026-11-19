// Coach à la voix côté serveur : préchauffage sans IA, contexte léger, modèle rapide avec repli, ton choisi
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFunctions, callHttp } = require('../helpers/functions');

// appel en flux (text/event-stream) : renvoie le texte écrit et les corps envoyés à l'IA
async function callStream(fn, body) {
  let out = '';
  const res = { set() { return res; }, setHeader() {}, header() {}, status() { return res; }, json(j) { out += JSON.stringify(j); }, send() {}, write(x) { out += x; }, end() {}, headersSent: false };
  await fn({ method: 'POST', body, headers: { authorization: 'Bearer test', accept: 'text/event-stream' } }, res);
  return out;
}
const sse = (t) => ({ ok: true, status: 200, body: (async function* () { yield Buffer.from('data: ' + JSON.stringify({ type: 'content_block_delta', delta: { text: t } }) + '\n' + 'data: ' + JSON.stringify({ type: 'message_stop' }) + '\n'); })() });

test('préchauffage : instance réveillée et contexte prêt, sans appel à l\'IA', async () => {
  const F = loadFunctions({ data: {} });
  const r = await callHttp(F.coach.coachChat, { warm: true });
  assert.equal(r.status, 200); assert.equal(r.out.warm, true);
  assert.equal(F.calls.ai.length, 0);
});

test('réponse orale courte : modèle rapide, repli sur le modèle habituel s\'il est refusé, ton et historique réduit', async () => {
  const bodies = [];
  const F = loadFunctions({ data: {}, fetch: async (url, o) => { const b = JSON.parse(o.body); bodies.push(b); return b.model === 'claude-haiku-5-5' && bodies.length === 1 ? { ok: false, status: 404, text: async () => 'model not found' } : sse("Vise 42'00."); } });
  const history = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'm' + i }));
  const out = await callStream(F.coach.coachChat, { message: 'Quel temps dimanche ?', responseMode: 'voix', tone: 'encourageant', history, stateContext: { date_reelle: { complet: 'lundi 16 novembre 2026', jour: 'lundi' }, plan_futur: 'x'.repeat(8000) } });
  assert.match(out, /Vise 42'00/);
  assert.equal(bodies[0].model, 'claude-haiku-5-5', 'modèle rapide d\'abord');
  assert.equal(bodies[1].model, 'claude-sonnet-5-5', 'repli automatique');
  assert.match(bodies[1].system, /TON : chaleureux et encourageant/);
  assert.doesNotMatch(bodies[1].system, /FORMAT VISUEL OBLIGATOIRE/, 'pas de mise en forme écrite en vocal');
  assert.equal(bodies[1].messages.length, 11, '10 derniers échanges + la question');
  assert.doesNotMatch(bodies[1].messages[10].content, /xxxxxxxxxx/, 'gros blocs retirés du contexte');
  // texte écrit : modèle habituel, contexte complet
  const F2 = loadFunctions({ data: {}, fetch: async (url, o) => { bodies.push(JSON.parse(o.body)); return sse('ok'); } });
  await callStream(F2.coach.coachChat, { message: 'Analyse ma semaine', history, stateContext: { plan_futur: 'x'.repeat(8000) } });
  const last = bodies[bodies.length - 1];
  assert.equal(last.model, 'claude-sonnet-5-5'); assert.equal(last.messages.length, 31);
});

test('voiceLightCtx : séances récentes gardées (4 dernières, sans splits), gros blocs retirés', () => {
  const F = loadFunctions({ data: {} });
  const r = F.coach.voiceLightCtx({ date_reelle: { jour: 'lundi' }, plan_futur: 'x'.repeat(5000), seances_recentes_detail: Array.from({ length: 8 }, (_, i) => ({ km: i, strava: { splits: [{ km: 1 }], cadence: 170 } })) });
  assert.equal(r.plan_futur, undefined); assert.equal(r.seances_recentes_detail.length, 4);
  assert.equal(r.seances_recentes_detail[0].strava.splits, undefined); assert.equal(r.seances_recentes_detail[0].strava.cadence, 170);
  assert.deepEqual(r.seances_recentes_detail.map((s) => s.km), [0, 1, 2, 3], 'les plus récentes (liste envoyée de la plus récente à la plus ancienne)');
});

test('chatLightCtx : avec les outils, ni historique par mois, ni semaines à venir, ni splits ; 8 séances récentes', () => {
  const F = loadFunctions({ data: {} });
  const r = F.coach.chatLightCtx({ date_reelle: { jour: 'lundi' }, historique_complet_par_mois: { a: 1 }, prochaines_semaines: [1], whoop: { rec: 60 },
    seances_recentes_detail: Array.from({ length: 12 }, (_, i) => ({ km: i, strava: { splits: [{ km: 1 }], cadence: 170 } })) });
  assert.equal(r.historique_complet_par_mois, undefined); assert.equal(r.prochaines_semaines, undefined);
  assert.deepEqual(r.whoop, { rec: 60 });
  assert.deepEqual(r.seances_recentes_detail.map((s) => s.km), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(r.seances_recentes_detail[0].strava.splits, undefined); assert.equal(r.seances_recentes_detail[0].strava.cadence, 170);
  assert.ok(/outils/.test(r.donnees_par_outils));
});

// Modèles de la dernière génération : réflexion coupée pour garder le budget de jetons au texte, température jamais envoyée,
// texte lu dans les blocs « text » (jamais un bloc de réflexion)
test('modèles d\'IA : réglages propres à chaque modèle et texte des réponses', () => {
  const H = require('../../functions/helpers');
  assert.equal(H.AI_MODEL, 'claude-sonnet-5-5'); assert.equal(H.AI_FAST_MODEL, 'claude-haiku-5-5');
  assert.deepEqual(H.aiParams({ model: H.AI_MODEL, max_tokens: 200, temperature: 0.7 }), { model: 'claude-sonnet-5-5', max_tokens: 200, thinking: { type: 'between_tools' } });
  assert.deepEqual(H.aiParams({ model: H.AI_FAST_MODEL, max_tokens: 120 }).thinking, { type: 'disabled' });
  assert.equal(H.aiParams({ max_tokens: 50 }).model, H.AI_MODEL);
  assert.deepEqual(H.aiParams({ model: H.AI_MODEL, thinking: { type: 'adaptive' } }).thinking, { type: 'adaptive' });
  assert.equal(H.aiText({ content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: 'Bonjour' }] }), 'Bonjour');
  assert.equal(H.aiText({ content: [] }), null);
});
