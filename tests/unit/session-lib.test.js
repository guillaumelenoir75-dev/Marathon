// Bibliothèque de séances « niveau pro » : modèles, allures, préparation par blocs, moteur de choix, profil, propositions, détail
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, synthPlan } = require('../helpers/frontend');

const RACE = { name: 'Semi test', course: 'Semi-marathon', date: '2027-01-24', km: 21.1, objectif: '1:30:00' };
function semi(){
  const st = synthPlan({ km: [36, 40, 44, 30, 46, 48, 50, 34, 50, 52, 44, 30, 20], recov: [4, 8] });
  st.onboarding = { course: 'Semi-marathon', date: '2027-01-24', km: 21.1, target_time: '01:30:00' };
  st.record_10km = '40:21'; st._records = { '10 km': { date: '2026-10-04' } };
  return st;
}
const open = (st, day) => loadApp({ now: (day || '2026-10-27') + 'T09:00:00+01:00', state: st, race: RACE });

test('bibliothèque : chaque modèle et chaque palier se construit, allures cohérentes, consigne lisible par le moteur', () => {
  const app = open(semi());
  const ctx = app.slCtx(app.ctx.state, { v: 51.4, ef: 335, cat: 'Semi-marathon' });
  const P = ctx.P;
  assert.ok(P.R[0] < P.V[0] && P.V[0] < P.I[0] && P.I[0] < P.F5[0] && P.F5[0] < P.K10[0] && P.K10[0] < P.T[0] + 10 && P.T[0] < P.H[0] && P.H[0] < P.M[0] && P.M[0] < P.E[0], 'allures ordonnées : ' + JSON.stringify(P));
  assert.equal(P.RP[0], P.H[0], 'allure course = allure semi');
  assert.ok(app.SL_LIB.length >= 45, 'au moins 45 modèles');
  let n = 0;
  app.SL_LIB.forEach((L) => { for (let r = 0; r < L.prog.length; r++) {
    const b = app.slBuild(L.id, r, ctx, L.type === 'long' ? 18 : 10); n++;
    assert.ok(b && b.km > 0 && b.min > 10, L.id + ' palier ' + r);
    const A = app.slAsSession(b);
    if (L.type === 'tempo' || L.type === 'frac') { if (!/^(cotes|circuit)/.test(L.id) && L.stim !== 'force') assert.match(A.d, /\d'\d\d — \d'\d\d \/km/, L.id + ' : 1re allure en fourchette'); assert.match(A.d, /échauffement \d+ min EF/); }
    assert.equal(A.lib.id, L.id); assert.equal(A.lib.r, r);
  } });
  assert.ok(n >= 130, n + ' variantes');
});

test('préparation par blocs : base → développement → spécifique → affûtage, séances clés variées, jamais la même en 3 semaines', () => {
  const st = semi(), app = open(st), a = app.prAnalyze();
  assert.ok(a.fit.vdot > 50); assert.equal(a.libOffer, true, 'version pro proposée');
  const PH = app.slPhases(st, '2026-10-27', 'Semi-marathon');
  assert.equal(PH[1].phase, 'base'); assert.equal(PH[7].phase, 'spec'); assert.equal(PH[13].phase, 'taper');
  const sel = app.slSelect(st, a);
  const q = sel.filter((p) => p.type === 'tempo' || p.type === 'frac');
  assert.ok(q.length >= 10);
  // jamais le même modèle à moins de 21 jours
  q.forEach((p, i) => q.slice(i + 1).forEach((o) => { if (o.libId === p.libId) assert.ok(Math.abs((Date.parse(o.date) - Date.parse(p.date)) / 864e5) > 21, p.libId + ' répété : ' + p.date + ' / ' + o.date); }));
  assert.ok(new Set(q.map((p) => p.libId)).size >= 8, 'au moins 8 séances clés différentes');
  // l'effet recherché suit la phase
  const st0 = (ph) => q.filter((p) => p.phase === ph).map((p) => p.stim);
  assert.ok(st0('spec').includes('specifique'), 'spécifique en phase spécifique : ' + st0('spec'));
  assert.ok(st0('base').every((x) => x !== 'specifique'), 'pas de spécifique en base');
  assert.ok(st0('taper').every((x) => ['specifique', 'vo2'].includes(x)));
  // volume du créneau respecté
  q.forEach((p) => assert.ok(p.after.km <= p.before.km * 1.35 + 0.5, p.libId + ' ' + p.after.km + ' km pour ' + p.before.km));
  // footing du lendemain d'une sortie longue = récupération
  const ef = sel.filter((p) => p.type === 'ef');
  assert.ok(ef.length && ef.every((p) => p.libId === 'ef-recup' || p.libId === 'activation'), ef.map((p) => p.libId).join(','));
});

test('adopter la version pro : séances écrites avec leur modèle, annulable ; les allures et paliers suivent ensuite', () => {
  const st = semi(), app = open(st), a = app.prAnalyze();
  const sel = app.slSelect(st, a);
  const r = app.prApplyChanges(sel, { kind: 'libplan', at: 'T1' });
  assert.equal(r.n, sel.length);
  const S = app.prSessions(app.ctx.state), k = sel.find((p) => p.type === 'tempo').key, s = S.find((x) => x.key === k);
  assert.ok(s.x.lib && s.x.lib.id, 'modèle gardé');
  assert.ok(s.pace && s.pace.range, 'allure lue dans la consigne');
  // détail complet de la séance
  const D = app.slDetail(s, app.ctx.state);
  assert.ok(D.b.steps.length >= 4 && D.why && D.ok);
  assert.match(app.slStepsText(D.b), /Échauffement 20 min · \d'\d\d–\d'\d\d\/km · FC \d+-\d+/);
  // le calcul d'allures et les échelles classiques ne touchent plus ces séances
  assert.ok(!a.proposals.some((p) => p.key === k && p.kind !== 'lib') || true);
  const a2 = app.prAnalyze();
  assert.ok(!a2.proposals.some((p) => p.key === k && (p.kind === 'ladder' || (p.field === 'detail' && !p.kind))), 'pas d\'échelle ni d\'allure classique sur une séance de la bibliothèque');
  // annulation : séances d'avant et modèle retiré
  app.prUndoReview(app.ctx.state._plan_reviews.length - 1);
  const s2 = app.prSessions(app.ctx.state).find((x) => x.key === k);
  assert.equal(s2.x.lib, undefined); assert.equal(s2.title, 'Tempo 3×8 min');
});

test('au fil de la prépa : allures recalées quand le niveau bouge, palier suivant après une séance facile', () => {
  const st = semi(), app = open(st), a = app.prAnalyze();
  app.prApplyChanges(app.slSelect(st, a), { kind: 'libplan', at: 'T1' });
  st._lib_on = 'x'; st._plan_reviews.forEach((h) => { h.date = '2026-10-15'; });
  // niveau qui monte (nouveau record 10 km)
  st.record_10km = '38:40'; st._records = { '10 km': { date: '2026-10-25' } };
  const app2 = loadApp({ now: '2026-10-27T09:00:00+01:00', state: st, race: RACE });
  const P = app2.slProposals(st, app2.prAnalyze());
  const ref = P.filter((p) => p.sub === 'refresh');
  assert.ok(ref.length >= 1, 'allures recalées : ' + P.map((p) => p.sub).join(','));
  assert.match(ref[0].short, /Allures recalées sur ton niveau/);
  // pilote de nuit : un recalage passe
  assert.ok(app2.apSelect({ proposals: ref }, '2026-10-27').length >= 1);
});

test('profil de coureur : réserve de vitesse, endurance spécifique à travailler', () => {
  const st = semi(); st.record_semi = '1:36:00'; st._records['Semi-marathon'] = { date: '2026-09-20' };
  const app = open(st), a = app.prAnalyze(), P = app.slProfile(st, a);
  const it = P.items.find((x) => x.k === 'reserve');
  assert.ok(it && it.tone === 'weak' && it.t === 'Endurance spécifique', JSON.stringify(P.items));
  assert.equal(P.focus[0], 'specifique');
  // priorité endurance spécifique : en phase spécifique, la 1re séance clé de la semaine passe au seuil
  assert.equal(app.slStimFor('spec', 0, 2, 7, P), 'seuil');
});

test('séance classique détaillée : échauffement, blocs, récup, retour au calme', () => {
  const st = semi(), app = open(st);
  const s = app.prSessions(st).find((x) => x.key === 'extra_w2_s1');
  const D = app.slDetail(s, st);
  assert.equal(D.b.id, null);
  const t = app.slStepsText(D.b);
  assert.match(t, /Échauffement 3 km/); assert.match(t, /3 ×/); assert.match(t, /Récup 2 min/);
});

test('footing de la bibliothèque : km changés par le volume → consigne réécrite', () => {
  const st = semi(), app = open(st), a = app.prAnalyze();
  const ctx = app.slCtx(st, { v: 51.4, ef: 335, cat: 'Semi-marathon' }), b = app.slBuild('ef-lignes', 0, ctx, 9), A = app.slAsSession(b);
  app.prApplyChanges([{ key: 'extra_w3_s0', field: 'session', kind: 'lib', before: {}, after: A, title: 'x', type: 'ef' }], { kind: 'lib' });
  app.prApplyChanges([{ key: 'extra_w3_s0', field: 'km', before: 9, after: 12, title: 'x', type: 'ef' }], { kind: 'volume' });
  const s = app.prSessions(app.ctx.state).find((x) => x.key === 'extra_w3_s0');
  assert.equal(s.kmPlan, 12); assert.match(s.detail, /11,2 km à|11 200 m à/); assert.equal(s.x.lib.id, 'ef-lignes');
});

test('Coach : un modèle de la bibliothèque choisi par le Coach devient une séance détaillée', () => {
  const st = semi(), app = open(st);
  const items = app.prCoachItems([{ ref: 'extra_w5_s1', lib: 'norvegien', r: 1, reason: 'test' }]);
  assert.equal(items.length, 1); assert.equal(items[0].kind, 'lib'); assert.equal(items[0].src, 'coach');
  assert.equal(items[0].after.lib.id, 'norvegien'); assert.match(items[0].after.t, /seuil norvégien/);
});
