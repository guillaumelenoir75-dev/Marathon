// Titre d'une séance accordé à sa consigne et à son type : règle, MAJ du plan / Coach (annulable), plan en cours, générateur
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, synthPlan } = require('../helpers/frontend');

const NOW = '2026-11-09T09:00:00+01:00';

test('règle : « sans accélération » retire les accélérations du titre ; séance devenue facile ou dure ; sinon inchangé', () => {
  const app = loadApp({ now: NOW, state: {} });
  const T = app.prTitleFor;
  assert.equal(T('Footing EF + accélérations', "5'45 — 6'10 /km · très facile, sans accélération", 'ef'), 'Footing EF');
  assert.equal(T('EF + accélérations', 'allure facile · sans intensité', 'ef'), 'Footing EF');
  assert.equal(T('Footing + strides', 'pas de lignes droites aujourd\'hui', 'ef'), 'Footing EF');
  assert.equal(T('Footing avec accélérations', 'très facile, aucune accélération', 'ef'), 'Footing EF');
  assert.equal(T('Footing EF + accélérations', 'finir par 6 × 80 m accélérations', 'ef'), 'Footing EF + accélérations', 'cohérent : gardé');
  assert.equal(T('Footing EF + accélérations', "5'45 — 6'10 /km", 'ef'), 'Footing EF + accélérations', 'sans ancienne consigne : gardé');
  assert.equal(T('Footing EF + accélérations', "5'45 — 6'10 /km", 'ef', '8 km EF · 6 lignes droites'), 'Footing EF', 'nouvelle consigne sans accélérations');
  assert.equal(T('4×1000 m', 'footing facile', 'ef'), 'Footing EF');
  assert.equal(T('Fractionné 6×2 min', 'sortie longue facile', 'long'), 'Sortie longue');
  assert.equal(T('Footing EF', '6 × 1000 m à 4\'10', 'frac'), 'Fractionné');
  assert.equal(T('Sortie longue', "5'45 — 6'10 /km · allure stricte, sans accélérer", 'long'), 'Sortie longue');
  assert.equal(T('10 km de Rueil', 'course · sans accélération au départ', 'race'), '10 km de Rueil', 'course jamais touchée');
});

test('Coach / MAJ du plan : consigne « sans accélération » → titre corrigé dans le même geste, annulation complète', () => {
  const st = synthPlan({ start: '2026-11-02', km: [24, 28] });
  st.extra_w2_s0 = JSON.stringify({ type: 'ef', km: 8, d: 'Footing EF + accélérations|8 km EF · finir par 6 lignes droites', sched_date: '2026-11-09', sched_day: 1 });
  const app = loadApp({ now: NOW, state: st });
  const r = app.prApplyChanges([{ key: 'extra_w2_s0', field: 'detail', before: '8 km EF · finir par 6 lignes droites', after: "5'45 — 6'10 /km · très facile, sans accélération", title: 'Footing EF + accélérations' },
    { key: 'extra_w2_s0', field: 'km', before: 8, after: 6 }], { coach: true, kind: 'chat' });
  assert.equal(r.n, 1);
  assert.equal(JSON.parse(st.extra_w2_s0).d, "Footing EF|5'45 — 6'10 /km · très facile, sans accélération");
  const h = st._plan_reviews[st._plan_reviews.length - 1];
  assert.ok(h.changes.some((c) => c.field === 'title' && c.kind === 'coherence' && c.before === 'Footing EF + accélérations'));
  app.prUndoReview(st._plan_reviews.length - 1);
  const x = JSON.parse(st.extra_w2_s0);
  assert.equal(x.d, 'Footing EF + accélérations|8 km EF · finir par 6 lignes droites'); assert.equal(x.km, 8);
  // type fractionné → footing : le titre « 4×1000 m » suit
  st.extra_w2_s1 = JSON.stringify({ type: 'frac', km: 10, d: "4×1000 m|3 km EF · 4 × 1000 m à 4'12", sched_date: '2026-11-11', sched_day: 3 });
  app.prApplyChanges([{ key: 'extra_w2_s1', field: 'detail', before: "3 km EF · 4 × 1000 m à 4'12", after: 'footing facile' }, { key: 'extra_w2_s1', field: 'type', before: 'frac', after: 'ef' }], {});
  assert.equal(JSON.parse(st.extra_w2_s1).d, 'Footing EF|footing facile');
});

test('plan en cours : titres incohérents corrigés au lancement (séances à venir seulement), rien sinon', () => {
  const st = synthPlan({ start: '2026-11-02', km: [24, 28] });
  st.extra_w2_s0 = JSON.stringify({ type: 'ef', km: 6, d: "Footing EF + accélérations|5'45 — 6'10 /km · très facile, sans accélération", sched_date: '2026-11-09', sched_day: 1 });
  st.extra_w1_s0 = JSON.stringify({ type: 'ef', km: 6, d: 'Footing EF + accélérations|sans accélération', sched_date: '2026-11-02', sched_day: 1 });
  st.extra_w1_s0_done = true; st.extra_w1_s0_km = 6;
  const app = loadApp({ now: NOW, state: st });
  assert.equal(app.prTitlesCoherent(st), 1);
  assert.match(JSON.parse(st.extra_w2_s0).d, /^Footing EF\|/);
  assert.match(JSON.parse(st.extra_w1_s0).d, /^Footing EF \+ accélérations\|/, 'séance faite : historique intact');
  assert.equal(app.prTitlesCoherent(st), 0, 'déjà cohérent');
});

test('générateur : toutes les séances d\'un plan généré ont un titre cohérent', () => {
  const app = loadApp({ now: NOW, state: {} });
  ['Marathon', 'Semi-marathon', '10 km', '5 km'].forEach((course) => ['2', '3', '4'].forEach((n) => {
    const plan = app.generateAthletePlan({ course, niveau: 'Intermédiaire', sessions: n, km_semaine: '30', date: '2027-03-21', plan_start_date: '2026-11-16' });
    Object.keys(plan).filter((k) => /^extra_w\d+_s\d+$/.test(k)).forEach((k) => {
      const x = JSON.parse(plan[k]), p = String(x.d || '').split('|');
      assert.equal(app.prTitleFor(p[0], p.slice(1).join('|'), x.type), p[0], course + ' ' + n + ' séances ' + k + ' : ' + x.d);
    });
  }));
});
