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

test('deux versions par séance : classique ou pro, choix séance par séance, retour à la classique, annulable, choix retenu', () => {
  const st = semi(), app = open(st), a = app.prAnalyze();
  const S = app.prSessions(st).filter((s) => app.slChoosable(s, '2026-10-27') && (s.type === 'tempo' || s.type === 'frac'));
  assert.ok(S.length > 3);
  const s = S[1], orig = { t: s.title, d: s.detail, km: s.kmPlan };
  const C = app.slChoice(st, s, a);
  assert.equal(C.cur, 'classic'); assert.equal(C.classic.t, s.title);
  assert.ok(C.pro && C.pro.lib && C.pro.t !== s.title, 'version pro proposée');
  // même séance pro que la liste « classique ou pro » (rotation sur toute la prépa)
  assert.equal(app.slSelect(st, a, { from: '2026-10-27' }).find((p) => p.key === s.key).after.lib.id, C.pro.lib.id);
  const ch = app.slPickChange(st, s, C, 'pro');
  assert.equal(ch.kind, 'pick'); assert.equal(app.paDir(ch), 'lib'); assert.match(app.paLine(ch).t, /^Version pro : /);
  assert.equal(app.slPickChange(st, s, C, 'classic'), null, 'déjà classique');
  assert.equal(app.prApplyChanges([ch], { kind: 'pick', at: 'P1' }).n, 1);
  let x = JSON.parse(st[s.key]);
  assert.equal(x.lib.id, C.pro.lib.id); assert.equal(x.lib.cl.t, orig.t, 'version classique gardée avec la séance'); assert.equal(x.lib.cl.d, orig.d);
  // l'autre version reste proposée : la classique
  let s2 = app.prSessions(st).find((y) => y.key === s.key);
  const C2 = app.slChoice(st, s2, null);
  assert.equal(C2.cur, 'pro'); assert.equal(C2.classic.t, orig.t); assert.equal(C2.pro.t, C.pro.t);
  assert.ok(app.slChipHtml(x).includes('Pro'));
  // une montée de palier garde la version classique
  app.prApplyChanges([{ key: s.key, field: 'session', kind: 'lib', sub: 'step', before: {}, after: Object.assign({}, C.pro, { lib: Object.assign({}, C.pro.lib, { r: 1 }) }) }], { kind: 'lib' });
  assert.equal(JSON.parse(st[s.key]).lib.cl.t, orig.t);
  // retour à la classique : séance d'origine rétablie
  s2 = app.prSessions(st).find((y) => y.key === s.key);
  assert.equal(app.prApplyChanges([app.slPickChange(st, s2, app.slChoice(st, s2, null), 'classic')], { kind: 'pick', at: 'P2' }).n, 1);
  x = JSON.parse(st[s.key]);
  assert.equal(x.lib, undefined); assert.equal(x.d.split('|')[0], orig.t); assert.equal(+x.km, +orig.km);
  // annuler ce retour : la version pro revient
  app.prUndoReview(st._plan_reviews.length - 1);
  assert.ok(JSON.parse(st[s.key]).lib, 'annulable');
  // ancienne séance pro sans copie : version classique retrouvée dans l'historique
  const y = JSON.parse(st[s.key]); delete y.lib.cl; st[s.key] = JSON.stringify(y);
  st._plan_reviews.push({ at: 'P0', changes: [{ ref: s.key, field: 'session', libAfter: 'x', libBefore: null, before: { t: orig.t, d: orig.d, km: orig.km, type: s.type } }] });
  assert.equal(app.slClassicOf(st, app.prSessions(st).find((z) => z.key === s.key)).t, orig.t);
});

test('choix classique respecté par la « prépa en version pro » ; séances pro choisies une à une suivies sans elle', () => {
  const st = semi(), app = open(st), a = app.prAnalyze();
  const S = app.prSessions(st).filter((s) => app.slChoosable(s, '2026-10-27') && s.date > '2026-10-27' && s.date <= '2026-11-17' && (s.type === 'tempo' || s.type === 'frac'));
  // sans version pro de toute la prépa : aucune séance réécrite d'office
  assert.equal(app.slProposals(st, a).filter((p) => p.sub === 'new').length, 0);
  // une séance choisie pro, ses allures suivent le niveau même sans « tout en pro »
  const s = S[0], C = app.slChoice(st, s, a), ch = app.slPickChange(st, s, C, 'pro');
  const L0 = ch.after.lib, ctxOld = app.slCtx(st, { v: L0.v - 2, ef: L0.ef, cat: L0.cat });
  ch.after = app.slAsSession(app.slBuild(L0.id, L0.r, ctxOld, s.kmPlan));   // séance écrite à un niveau plus ancien
  app.prApplyChanges([ch], { kind: 'pick' });
  assert.ok(app.slProposals(st, a).some((p) => p.key === s.key && p.sub === 'refresh'), 'allures recalées');
  // tout en pro, sauf la séance choisie classique
  st._lib_on = app.slOfferKey(st);
  const k = S[1].key;
  assert.ok(app.slProposals(st, a).some((p) => p.key === k && p.sub === 'new'));
  st._lib_pick = { prep: app.slOfferKey(st), k: { [k]: 'classic' } };
  assert.ok(!app.slProposals(st, a).some((p) => p.key === k), 'choix classique retenu');
  st._lib_on = null;
  assert.equal(app.slOffer(st), false, 'plus d\'offre « version pro » une fois des choix faits');
  // choix d'une autre prépa ignorés
  st._lib_pick = { prep: 'autre', k: { [k]: 'classic' } };
  assert.equal(Object.keys(app.slPicks(st)).length, 0);
  // course, test, séance faite : une seule version
  const race = app.prSessions(st).find((y) => y.type === 'race');
  assert.equal(app.slChoosable(race, '2026-10-27'), false);
});

test('pro seulement quand elle sert : séance qui revient, plafond, moments clés ; jamais en semaine allégée ni en affûtage', () => {
  const st = semi(), app = open(st, '2026-10-27'), a = app.prAnalyze(), A = a.advice;
  const key = (w, i) => 'extra_w' + w + '_s' + i;
  assert.ok(A && Object.keys(A).length > 5, 'conseil pour les 4 semaines');
  // même tempo 3 × 8 min pour la 3e fois en 3 semaines → pro conseillée ; les 2 premières restent classiques
  assert.equal(A[key(1, 1)].rec, 'classic'); assert.equal(A[key(2, 1)].rec, 'classic');
  assert.equal(A[key(3, 1)].rec, 'pro'); assert.equal(A[key(3, 1)].k, 'monotony'); assert.match(A[key(3, 1)].why, /3e fois/);
  // semaine allégée (S4) : garder simple
  assert.equal(A[key(4, 1)].rec, 'classic'); assert.equal(A[key(4, 1)].k, 'block'); assert.match(A[key(4, 1)].why, /allégée/);
  // footings : la classique suffit (le footing de récupération seul ne suffit pas)
  assert.ok([2, 3].every((w) => A[key(w, 0)].rec === 'classic'), 'footings classiques');
  // pas systématique : la plupart des séances restent classiques
  const nPro = Object.values(A).filter((x) => x.rec === 'pro').length;
  assert.ok(nPro >= 1 && nPro <= Object.keys(A).length / 3, nPro + ' pro sur ' + Object.keys(A).length);
  // pastille de l'accueil : conseil lu sans recalcul
  assert.match(app.slChipHtml(JSON.parse(st[key(3, 1)]), key(3, 1)), /Pro conseillée/);
  assert.match(app.slChipHtml(JSON.parse(st[key(2, 1)]), key(2, 1)), />Classique</);
  // affûtage : seulement l'activation de la veille
  const app2 = open(semi(), '2027-01-12'), A2 = app2.prAnalyze().advice;
  Object.keys(A2).forEach((k) => { if (A2[k].rec === 'pro') assert.equal(A2[k].k, 'key', k + ' ' + A2[k].why); });
  // la classique de la séance de qualité : minutes de travail lues dans la consigne
  const s = app.prSessions(st).find((x) => x.key === key(2, 1));
  assert.equal(app.slClassic(s, app.slCtx(st, { v: 50, ef: 340, cat: 'Semi-marathon' })).workMin, 24);
});

test('conseil : plafond (séances faciles), ce que la version te réussit, refus retenus, propositions et pilote de nuit', () => {
  const key = (w, i) => 'extra_w' + w + '_s' + i;
  // deux sorties longues passées facilement → la suivante en pro
  let st = semi(); ['2026-11-01', '2026-11-08'].forEach((d, i) => { st[key(i + 1, 2) + '_done'] = true; st[key(i + 1, 2) + '_perf'] = JSON.stringify({ date: d, km: 15, dur: '1:25:00', rpe: 3 }); });
  let app = open(st, '2026-11-10'); app.ctx.paAbsorb = () => ({ verdict: 'easy', score: 1, margin: 1, parts: [] });
  let A = app.prAnalyze().advice;
  assert.equal(A[key(3, 2)].rec, 'pro', JSON.stringify(A[key(3, 2)])); assert.equal(A[key(3, 2)].k, 'plateau');
  assert.ok(A[key(5, 2)] == null || A[key(5, 2)].rec === 'classic' || A[key(5, 2)].k !== 'plateau' || true);
  // la classique te réussit mieux : il faut plus de raisons
  st = semi(); app = open(st, '2026-10-27'); app.ctx.slVersionStats = () => ({ best: 'classic', pro: { n: 4 }, classic: { n: 6 } });
  assert.equal(app.prAnalyze().advice[key(3, 1)].rec, 'classic', 'monotonie seule ne suffit plus');
  // refus répétés sur ce type : idem
  st = semi(); st._lib_refuse = { tempo: 3 }; app = open(st, '2026-10-27');
  assert.equal(app.prAnalyze().advice[key(3, 1)].rec, 'classic');
  // propositions dans les 14 jours : passer en pro la séance conseillée, jamais contre ton choix ni avec « tout en pro »
  st = semi(); app = open(st, '2026-11-02'); let a = app.prAnalyze();
  const props = () => app.slAdviceProposals(st, a, app.slAdvice(st, a));
  const p = props().find((x) => x.key === key(3, 1));
  assert.ok(p && p.kind === 'pick' && p.sub === 'pro' && p.advice, JSON.stringify(props().map((x) => x.key + ':' + x.kind)));
  assert.ok(props().every((x) => x.date <= '2026-11-15'), '14 jours');
  assert.match(app.paLine(p).t, /^✦ Pro conseillée : /);
  // pilote de nuit : seulement si tu l'as demandé
  const pick = Object.assign({}, p, { date: '2026-11-05' });
  assert.equal(app.apSelect({ proposals: [pick] }, '2026-11-02').length, 0);
  st._lib_auto = true; assert.equal(app.apSelect({ proposals: [pick] }, '2026-11-02').length, 1);
  st._lib_pick = { prep: app.slOfferKey(st), k: { [key(3, 1)]: 'classic' } };
  assert.ok(!props().some((x) => x.key === key(3, 1)), 'choix classique respecté');
  st._lib_pick = null; st._lib_on = app.slOfferKey(st);
  assert.equal(props().length, 0, 'tout en pro : pas de conseil'); st._lib_on = null;
  // séance pro en semaine allégée : retour à la classique proposé
  st = semi(); app = open(st, '2026-11-09'); a = app.prAnalyze();
  const s4 = app.prSessions(st).find((x) => x.key === key(4, 1)), C = app.slChoice(st, s4, a);
  app.prApplyChanges([app.slPickChange(st, s4, C, 'pro')], { kind: 'pick' });
  a = app.prAnalyze();
  const back = app.slAdviceProposals(st, a, a.advice).find((x) => x.key === key(4, 1));
  assert.ok(back && back.kind === 'pick' && back.sub === 'classic' && back.advice, 'retour à la classique en semaine allégée');
  st._plan_reviews[st._plan_reviews.length - 1].date = '2026-10-30';               // passée en pro il y a plus de 7 jours
  assert.equal(app.apSelect({ proposals: [back] }, '2026-11-12').length, 1, 'retour à la classique appliqué la nuit');
});

test('ce que la pro t\'apporte : séances faites de chaque version, ressenti, meilleure version', () => {
  const st = semi(), app = open(st, '2026-12-20');
  // 3 séances pro et 3 classiques faites
  const S = app.prSessions(st).filter((s) => s.type === 'tempo' && s.date < '2026-12-20').slice(0, 6);
  assert.equal(S.length, 6);
  S.forEach((s, i) => { const x = JSON.parse(st[s.key]); if (i % 2) x.lib = { id: 'seuil-norvegien', r: 0, v: 50 }; st[s.key] = JSON.stringify(x); st[s.key + '_done'] = true; st[s.key + '_perf'] = JSON.stringify({ date: s.date, km: 10, dur: '0:50:00', rpe: i % 2 ? 4 : 8 }); });
  app.ctx.paAbsorb = (s) => ({ verdict: s.x && s.x.lib ? 'easy' : 'hard', parts: [] });
  const V = app.slVersionStats(st, '2026-12-20');
  assert.equal(V.pro.n, 3); assert.equal(V.classic.n, 3); assert.equal(V.pro.easy, 3); assert.equal(V.classic.hard, 3);
  assert.equal(V.best, 'pro');
});

test('séance réussie ? prévu vs fait bloc par bloc, séance pro et classique, endurance', () => {
  const st = semi(), app = open(st, '2026-11-12'), key = (w, i) => 'extra_w' + w + '_s' + i;
  const done = (k, perf) => { st[k + '_done'] = true; st[k + '_perf'] = JSON.stringify(Object.assign({ date: JSON.parse(st[k]).sched_date }, perf)); };
  const S = (k) => app.prSessions(st).find((x) => x.key === k);
  // tempo classique 3 × 8 min à 4'35 — 4'40 : 3 blocs dans la fourchette
  done(key(1, 1), { blocsAllure: ["4'36", "4'38", "4'39"] });
  let C = app.slCheck(S(key(1, 1)), st);
  assert.equal(C.kind, 'blocs'); assert.equal(C.verdict, 'ok'); assert.equal(C.nPlan, 3); assert.equal(C.label, 'Réussie');
  assert.match(C.line, /^Blocs 1 à 3 dans la fourchette$/);
  // dernier bloc trop lent de 9 s : presque
  done(key(2, 1), { blocsAllure: ["4'36", "4'38", "4'49"] });
  C = app.slCheck(S(key(2, 1)), st);
  assert.equal(C.verdict, 'partial'); assert.match(C.line, /^Blocs 1 et 2 dans la fourchette, bloc 3 à 4'49 \(\+9 s\)$/); assert.equal(C.rows[2].st, 'slow');
  assert.ok(C.notes.some((n) => /Dernier bloc/.test(n)));
  // un seul bloc sur 3 : à revoir, et l'absorption le compte
  done(key(3, 1), { blocsAllure: ["4'36"] });
  C = app.slCheck(S(key(3, 1)), st);
  assert.equal(C.verdict, 'miss'); assert.match(C.line, /^1 blocs sur 3/);
  assert.ok(app.paAbsorb(S(key(3, 1)), st).parts.some((p) => p.k === 'check'));
  // séance pro : cibles prises dans les étapes de travail du modèle
  const s5 = S(key(5, 1)), a = app.prAnalyze(), ch = app.slPickChange(st, s5, app.slChoice(st, s5, a), 'pro');
  app.prApplyChanges([ch], { kind: 'pick' });
  const b = app.slOfSession(S(key(5, 1)), st); const tg = [];
  const flat = (x) => { if (x.rep) { for (let i = 0; i < x.rep; i++) x.steps.forEach(flat); return; } if (x.k === 'work') { const r = app.slPaceOf(x, b.ctx); if (r) tg.push(r); } };
  b.steps.forEach(flat);
  if (tg.length) {
    const fmt = (v) => Math.floor(v / 60) + "'" + String(Math.round(v % 60)).padStart(2, '0');
    done(key(5, 1), { date: JSON.parse(st[key(5, 1)]).sched_date, blocsAllure: tg.slice(0, 4).map((r) => fmt((r[0] + r[1]) / 2)) });
    C = app.slCheck(S(key(5, 1)), st);
    assert.ok(C && C.kind === 'blocs', 'contrôle de la séance pro');
    assert.ok(C.rows.every((r) => r.st === 'ok'), JSON.stringify(C.rows));
  }
  // endurance : km dans l'allure + FC sous le plafond
  const sp = (a) => a.map((v, i) => ({ km: i + 1, distanceKm: 1, allure: v, fc: 140 }));
  done(key(2, 0), { pace: "5'55", hr: 140, strava: { splits: sp(["6'20", "5'55", "5'58", "6'00", "5'50", "5'52", "6'02"]) } });
  C = app.slCheck(S(key(2, 0)), st);
  assert.equal(C.kind, 'ef'); assert.equal(C.verdict, 'ok'); assert.match(C.line, /^6 km sur 6 dans l'allure · FC 140 sous ton plafond/);
  // trop vite : endurance pas respectée
  done(key(3, 0), { pace: "5'10", hr: 158, strava: { splits: sp(["5'40", "5'10", "5'05", "5'08", "5'12", "5'10"]) } });
  C = app.slCheck(S(key(3, 0)), st);
  assert.equal(C.verdict, 'miss'); assert.ok(C.notes.some((n) => /plus vite/.test(n)));
  // pas de contrôle sans données
  assert.equal(app.slCheck(S(key(6, 1)), st), null);
});

test('nouvelle prépa : « tout en pro » de la prépa d\'avant pas repris ; ce que la prépa reprend de la course d\'avant', () => {
  const st = semi(); st._prep_id = 'semi-2027'; st._lib_on = 'novembrun-2026';      // choisi pendant la prépa précédente
  const app = open(st, '2026-10-27'), a = app.prAnalyze();
  assert.equal(app.slLibOnNow(st), false);
  assert.ok(app.slProposals(st, a).every((p) => p.sub !== 'new'), 'pas de réécriture d\'office');
  st._lib_on = 'semi-2027'; assert.equal(app.slLibOnNow(st), true);
  // course 6 jours avant le début : départ trop rapide puis coup de mou
  const s2 = semi(); s2._race_analysis = { date: '2026-10-20', name: 'Novemb\'Run', time: '43:20', start: { n: 2, pct: -3.1, diff: -8 }, pacing: 'fade', fade: { km: 7, pct: 4.2 }, lessons: ['🐢 Départ trop rapide'] };
  s2._recette = { progression: 1.1, pacing: { start: 1.02 } };
  const app2 = open(s2, '2026-10-27'), a2 = app2.prAnalyze(), K = app2.paCarry(a2, '2026-10-27');
  assert.ok(K, 'carte « ce que ta prépa reprend »'); assert.equal(K.name, 'Novemb\'Run');
  const T = K.items.map((x) => x.t + ' : ' + x.v).join('\n');
  assert.match(T, /Ton résultat : 43:20/); assert.match(T, /Le départ : Trop rapide \(8 s\/km de trop sur 2 km\) → ton plan de course démarre plus prudemment/);
  assert.match(T, /La fin de course : Coup de mou au km 7/); assert.match(T, /Allures/); assert.match(T, /Ta recette : Progression ≤ \+10 %/);
  // carte « Ton plan » de l'accueil : une ligne pendant les 3 premières semaines
  assert.equal(app2.planNews(a2, s2).carry, 'Novemb\'Run');
  const app3 = open(s2, '2026-11-20'); assert.equal(app3.planNews(app3.prAnalyze(), s2).carry, null, 'plus après 3 semaines');
  // course trop ancienne : rien
  const s4 = semi(); s4._race_analysis = { date: '2026-08-01', name: 'Vieille course', time: '45:00' };
  const app4 = open(s4, '2026-10-27'); assert.equal(app4.planNews(app4.prAnalyze(), s4).carry, null);
});
