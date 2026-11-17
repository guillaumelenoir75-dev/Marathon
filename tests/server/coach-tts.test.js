// Voix Google du Coach (Cloud Text-to-Speech) : admin seulement, voix Neural2 / WaveNet, cache, plafond mensuel, repli
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFunctions, callHttp } = require('../helpers/functions');

const VOICES = { voices: [
  { name: 'fr-FR-Standard-A', ssmlGender: 'FEMALE', languageCodes: ['fr-FR'] },
  { name: 'fr-FR-Wavenet-D', ssmlGender: 'MALE', languageCodes: ['fr-FR'] },
  { name: 'fr-FR-Neural2-A', ssmlGender: 'FEMALE', languageCodes: ['fr-FR'] },
  { name: 'fr-FR-Neural2-B', ssmlGender: 'MALE', languageCodes: ['fr-FR'] },
  { name: 'fr-FR-Studio-D', ssmlGender: 'MALE', languageCodes: ['fr-FR'] },
  { name: 'fr-FR-Chirp3-HD-Charon', ssmlGender: 'MALE', languageCodes: ['fr-FR'] }] };
const json = (j, status) => ({ ok: !status || status < 300, status: status || 200, json: async () => j, text: async () => JSON.stringify(j) });
function net(calls, synthStatus) {
  return async (url, o) => {
    calls.push({ url, body: o && o.body ? JSON.parse(o.body) : null });
    if (/metadata\.google\.internal/.test(url)) return json({ access_token: 'tok', expires_in: 3600 });
    if (/\/voices/.test(url)) return json(VOICES);
    if (/text:synthesize/.test(url)) return synthStatus ? json({ error: 'refus' }, synthStatus) : json({ audioContent: 'QUFB' });
    return json({}, 404);
  };
}

test('voix Google : seulement les voix gratuites et naturelles (Neural2 puis WaveNet), une voix d\'homme Neural2 par défaut', async () => {
  const calls = [], F = loadFunctions({ data: {}, fetch: net(calls) });
  const r = await callHttp(F.coach.coachTts, { list: true });
  assert.deepEqual(r.out.voices.map((v) => v.name), ['fr-FR-Neural2-A', 'fr-FR-Neural2-B', 'fr-FR-Wavenet-D']);
  assert.equal(r.out.def, 'fr-FR-Neural2-B');
});

test('voix Google : une phrase → audio, mise en cache (pas de 2e appel), caractères comptés pour le plafond du mois', async () => {
  const calls = [], F = loadFunctions({ data: {}, fetch: net(calls) });
  const r = await callHttp(F.coach.coachTts, { text: "Vise 42 minutes, soit 4 minutes 12 au kilomètre.", rate: 1.05 });
  assert.equal(r.status, 200); assert.equal(r.out.audio, 'QUFB'); assert.equal(r.out.voice, 'fr-FR-Neural2-B');
  const syn = calls.find((c) => /text:synthesize/.test(c.url));
  assert.equal(syn.body.voice.name, 'fr-FR-Neural2-B'); assert.equal(syn.body.audioConfig.audioEncoding, 'MP3'); assert.equal(syn.body.audioConfig.speakingRate, 1.05);
  const r2 = await callHttp(F.coach.coachTts, { text: "Vise 42 minutes, soit 4 minutes 12 au kilomètre.", rate: 1.05 });
  assert.equal(r2.out.cached, true); assert.equal(calls.filter((c) => /text:synthesize/.test(c.url)).length, 1, 'cache');
  const month = new Date().toISOString().slice(0, 7);
  assert.equal(F.db.data._tts_usage[month], 'Vise 42 minutes, soit 4 minutes 12 au kilomètre.'.length);
});

test('voix Google : plafond du mois atteint ou service refusé → repli sur la voix de l\'iPhone ; athlète refusé', async () => {
  const month = new Date().toISOString().slice(0, 7), calls = [];
  const F = loadFunctions({ data: { _tts_usage: { [month]: 799990 } }, fetch: net(calls) });
  const r = await callHttp(F.coach.coachTts, { text: 'Une phrase un peu longue', voice: 'fr-FR-Neural2-A' });
  assert.equal(r.status, 429); assert.equal(r.out.fallback, true); assert.equal(r.out.reason, 'quota');
  assert.equal(calls.filter((c) => /text:synthesize/.test(c.url)).length, 0, 'rien de facturé');
  const G = loadFunctions({ data: {}, fetch: net([], 403) });
  const r2 = await callHttp(G.coach.coachTts, { text: 'Bonjour', voice: 'fr-FR-Neural2-A' });
  assert.equal(r2.status, 503); assert.equal(r2.out.fallback, true);
  const A = loadFunctions({ athlete: true, data: {}, fetch: net([]) });
  assert.equal((await callHttp(A.coach.coachTts, { text: 'Bonjour' })).status, 403);
});
