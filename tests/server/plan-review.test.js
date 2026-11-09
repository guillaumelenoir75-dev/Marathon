// planReview (relecture du plan par le Coach) : validation de la réponse de l'IA, consignes envoyées
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFunctions, callHttp } = require('../helpers/functions');

const plan = [{ w: 1, sessions: [
  { ref: 'extra_w1_s0', date: '2026-11-02', type: 'ef', title: 'Footing EF', detail: "5'45 — 6'10 /km", km: 8, done: false },
  { ref: 'extra_w1_s1', date: '2026-11-03', type: 'rest', title: 'Repos', detail: '', km: 0, done: false },
  { ref: 'extra_w1_s2', date: '2026-11-04', type: 'tempo', title: 'Tempo', detail: "3 × 8 min à 4'35 /km", km: 10, done: false },
  { ref: 'extra_w1_s3', date: '2026-11-08', type: 'race', title: 'Course', detail: 'course', km: 10, done: false },
  { ref: 'extra_w1_s4', date: '2026-10-30', type: 'ef', title: 'Footing', detail: 'x', km: 6, done: true } ] }];

test('planReview : changements de l\'IA filtrés et nettoyés', async () => {
  const F = loadFunctions({ ai: JSON.stringify({ assessment: 'ok', changes: [
    { ref: 'extra_w1_s0', km: 45, reason: 'trop' }, { ref: 'extra_w1_s0', km: 10, reason: 'doublon' },
    { ref: 'extra_w1_s1', type: 'frac', km: 8, detail: 'fractionné' }, { ref: 'extra_w1_s2', type: 'ef' },
    { ref: '__proto__', km: 5 }, { ref: 'extra_w1_s4', km: 9 }, { ref: 'extra_w1_s9', km: 5 },
    { ref: 'extra_w1_s3', km: 3, title: 'x', detail: "Objectif\n4'10 /km | vite" }], rejected: ['extra_w1_s2:detail', 'autre'] }) });
  const r = (await callHttp(F.coach.planReview, { today: '2026-11-01', plan, proposals: [{ ref: 'extra_w1_s2', champ: 'detail' }] })).out;
  assert.equal(r.success, true);
  const refs = r.changes.map((c) => c.ref);
  assert.ok(!refs.includes('extra_w1_s0'), 'km aberrant ou doublon refusé');
  assert.ok(!refs.includes('extra_w1_s1'), 'repos non modifiable');
  assert.ok(!refs.includes('extra_w1_s4') && !refs.includes('extra_w1_s9') && !refs.includes('__proto__'), 'séance faite / inconnue / hors format');
  assert.ok(!r.changes.some((c) => c.ref === 'extra_w1_s2' && c.type), 'type sans consigne refusé');
  const race = r.changes.find((c) => c.ref === 'extra_w1_s3');
  assert.ok(race && !race.km && !race.title && !/[|\n]/.test(race.detail), 'course : consigne seule, nettoyée');
  assert.deepEqual(r.rejected, ['extra_w1_s2:detail']);
});

test('planReview : réponse coupée → erreur claire ; consignes et données bornées', async () => {
  let F = loadFunctions({ ai: { text: '{"assessment":"ok","changes":[{"ref"', stop: 'max_tokens' } });
  let r = await callHttp(F.coach.planReview, { today: '2026-11-01', plan });
  assert.equal(r.status, 502); assert.match(r.out.error, /trop longue/);
  F = loadFunctions();
  await callHttp(F.coach.planReview, { today: '2026-11-01', plan, force: true, next: true, startDate: '2026-11-23',
    warnings: Array.from({ length: 50 }, (_, i) => 'w' + i), volume: { semaines: Array.from({ length: 80 }, (_, i) => ({ semaine: i })) } });
  const { system, user } = F.calls.ai[0];
  assert.match(system, /PRIORITÉS en cas de conflit/);
  assert.match(user, /REDEMANDÉE PAR L'ATHLÈTE/); assert.match(user, /PRÉPA À VENIR/);
  const line = user.split('\n').find((l) => l.startsWith('Contrôles automatiques'));
  assert.equal(JSON.parse(line.slice(line.indexOf(':') + 1)).length, 20);
});

test('planChat / planReview : titre accordé à la consigne (accélérations retirées, séance devenue facile)', async () => {
  const p2 = [{ w: 1, sessions: [
    { ref: 'extra_w1_s0', date: '2026-11-02', type: 'ef', title: 'Footing EF + accélérations', detail: "5'45 — 6'10 /km · finir par 6 × 80 m accélérations", km: 8, done: false },
    { ref: 'extra_w1_s2', date: '2026-11-04', type: 'frac', title: '4×1000 m', detail: "3 km EF · 4 × 1000 m à 4'12 /km", km: 10, done: false },
    { ref: 'extra_w1_s3', date: '2026-11-06', type: 'ef', title: 'Footing EF', detail: "5'45 — 6'10 /km", km: 6, done: false } ] }];
  const F = loadFunctions({ ai: JSON.stringify({ reply: 'On allège.', changes: [
    { ref: 'extra_w1_s0', detail: "5'45 — 6'10 /km · très facile, sans accélération", km: 5 },
    { ref: 'extra_w1_s2', detail: "5'45 — 6'10 /km · footing facile", type: 'ef', km: 8 },
    { ref: 'extra_w1_s3', km: 7 }] }) });
  const r = (await callHttp(F.coach.planChat, { today: '2026-11-01', plan: p2, message: 'Je suis fatigué' })).out;
  assert.equal(r.success, true);
  const by = {}; r.changes.forEach((c) => { by[c.ref] = c; });
  assert.equal(by.extra_w1_s0.title, 'Footing EF', 'plus d\'accélérations dans le titre');
  assert.equal(by.extra_w1_s2.title, 'Footing EF', 'fractionné devenu footing');
  assert.equal(by.extra_w1_s3.title, undefined, 'titre déjà juste : pas de changement');
});
