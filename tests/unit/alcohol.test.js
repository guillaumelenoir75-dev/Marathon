// Alcool la veille : modèle personnel (corrigé de la charge d'entraînement), impact du jour, allègement WHOOP non déclenché, tendances FC
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/frontend');

const J = (o) => JSON.parse(JSON.stringify(o));
const iso = (n) => { const d = new Date('2026-10-29T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
// 40 nuits : dose = alcool d'hier soir + moitié de celui d'avant-hier ; récupération 72 − 3,4 × dose ; FC repos 50 + 0,8 × dose ; VFC 70 × (1 − 3 % × dose)
function world(o){
  o = o || {};
  const rec = [], sleeps = [], alc = {}, lv = (i) => (o.lv ? o.lv(i) : (i % 5 === 0 ? 2 + (i % 8) : 0));
  for(let i = 0; i < 40; i++){
    const d = iso(i), l = lv(i), dose = l + 0.5 * lv(i + 1), noise = ((i * 7) % 5) - 2;
    rec.push({ date: d, score: Math.round(72 - 3.4 * dose + noise), rhr: Math.round(50 + 0.8 * dose), hrv: Math.round(70 * (1 - 0.03 * dose)) });
    sleeps.push({ date: d, performance_pct: Math.round(85 - 2 * dose) });
    if(!o.noEntries) alc[d] = { l: l, t: l ? ['wine'] : [] };
  }
  return { _plan_engine: 'generated', plan_start_date: '2026-10-26', whoop_data: { recoveries: rec, sleeps: sleeps }, _alcohol: alc, '_wakeup_2026-10-29': true };
}

test('modèle personnel : effet de l\'alcool retrouvé sur la récupération, la FC repos et la VFC', () => {
  const st = world();
  const app = loadApp({ now: '2026-10-29T09:00:00+01:00', state: st });
  const M = J(app.alcModel('2026-10-29'));
  assert.ok(M.personal, JSON.stringify(M));
  assert.ok(M.coef.rec < -3 && M.coef.rec > -4, 'récup / point : ' + M.coef.rec);
  assert.ok(M.coef.rhr > 0.65 && M.coef.rhr < 1, 'FC repos / point : ' + M.coef.rhr);
  assert.ok(M.coef.hrv < -2.5 && M.coef.hrv > -3.8, 'VFC % / point : ' + M.coef.hrv);
  assert.ok(M.base.rec >= 70 && M.base.rec <= 74, 'base sans alcool ' + M.base.rec); assert.equal(M.carry, 0.5);
  assert.equal(M.bands[0].lab, 'Sans alcool'); assert.ok(M.bands[0].rec > M.bands[3].rec || !M.bands[3].n);
});

test('impact du jour : points de récupération dus à l\'alcool et récupération « hors alcool »', () => {
  const st = world(); st.whoop_data.recoveries[0] = { date: '2026-10-29', score: 45, rhr: 56, hrv: 55 }; st._alcohol['2026-10-29'] = { l: 8, t: ['beer', 'spirits'] };
  const app = loadApp({ now: '2026-10-29T09:00:00+01:00', state: st });
  const I = J(app.alcImpact('2026-10-29'));
  assert.equal(I.l, 8); assert.ok(I.rec <= -22 && I.rec >= -31, 'effet récup ' + I.rec);
  assert.equal(I.recObs, 45); assert.ok(I.recWithout >= 67 && I.recWithout <= 76, 'hors alcool ' + I.recWithout);
  assert.ok(I.share >= 80, 'la baisse vient surtout de l\'alcool : ' + I.share);
  const C = J(app.alcCoachContext('2026-10-29'));
  assert.equal(C.cette_nuit.niveau_0_10, 8); assert.match(C.regle, /PAS de l'entraînement/);
});

test('allègement WHOOP : une récupération basse due à l\'alcool ne déclenche pas d\'allègement ; sans saisie, si', () => {
  const lv = (i) => (i <= 2 ? 10 : 0);                                    // 3 dernières nuits arrosées
  let st = world({ lv });
  let app = loadApp({ now: '2026-10-29T09:00:00+01:00', state: st });
  const W = J(app.prWhoop('2026-10-29'));
  assert.equal(W.tired, false, JSON.stringify(W)); assert.ok(W.alc && W.alc.explained && W.alc.rawAvg3 < 45);
  st = world({ lv, noEntries: true });
  app = loadApp({ now: '2026-10-29T09:00:00+01:00', state: st });
  assert.equal(J(app.prWhoop('2026-10-29')).tired, true, 'sans saisie d\'alcool : fatigue détectée comme avant');
});

test('séance du lendemain d\'une soirée ≥ 4/10 : écartée des tendances de FC ; saisie enregistrée et modèle stocké pour le serveur', () => {
  const st = world(); st._alcohol['2026-10-27'] = { l: 6, t: ['wine'] }; st._alcohol['2026-10-26'] = { l: 2, t: [] };
  const app = loadApp({ now: '2026-10-29T09:00:00+01:00', state: st });
  assert.equal(app.alcRunAffected('2026-10-27'), true); assert.equal(app.alcRunAffected('2026-10-26'), false); assert.equal(app.alcRunAffected('2026-10-20'), false);
  app.alcSave('2026-10-29', 3, ['beer', 'x']);
  assert.deepEqual(J(st._alcohol['2026-10-29']).t, ['beer']); assert.equal(st._alcohol['2026-10-29'].l, 3);
  assert.equal(st._alcohol_model.at, '2026-10-29'); assert.ok(st._alcohol_model.rec < 0);
});

test('diagnostic à copier : saisies, nuits WHOOP, charge, modèle et effet du matin', () => {
  const st = world(); st.whoop_data.recoveries[0] = { date: '2026-10-29', score: 45, rhr: 56, hrv: 55 }; st._alcohol['2026-10-29'] = { l: 6, t: ['wine'] };
  const app = loadApp({ now: '2026-10-29T09:00:00+01:00', state: st });
  const D = JSON.parse(app.alcDiagText('2026-10-29'));
  assert.equal(D.nuits_14j.length, 14); assert.equal(D.nuits_14j[0].matin, '2026-10-29'); assert.equal(D.nuits_14j[0].alcool, 6); assert.equal(D.nuits_14j[0].recup, 45);
  assert.ok(D.nuits_14j[0].recup_corrigee > 45); assert.equal(D.nuits_14j[0].dose, 6); assert.equal(D.ce_matin.niveau, 6); assert.ok(D.modele.par_point_de_dose.rec < 0);
});

test('profil réel type : base ~77 %, 3 soirées (7, 8, 3/10) et un lendemain — effet ~5-6 pts par point, la soirée d\'avant-hier compte, pas de fatigue d\'entraînement', () => {
  // nuits du 18 au 31 octobre : récupération, VFC, FC repos (valeurs proches d'un vrai profil) ; alcool renseigné du 28 au 31
  const N = [['10-31', 3, 35, 57, 63], ['10-30', 8, 26, 52, 65], ['10-29', 0, 56, 74, 52], ['10-28', 7, 38, 65, 57], ['10-27', null, 48, 72, 50], ['10-26', null, 60, 79, 48], ['10-25', null, 21, 55, 63],
    ['10-24', null, 77, 88, 53], ['10-23', null, 88, 91, 49], ['10-22', null, 90, 91, 49], ['10-21', null, 77, 88, 55], ['10-20', null, 74, 83, 45], ['10-19', null, 56, 81, 51], ['10-18', null, 90, 89, 49]];
  const st = { _plan_engine: 'generated', plan_start_date: '2026-10-26', whoop_data: { recoveries: N.map((n) => ({ date: '2026-' + n[0], score: n[2], hrv: n[3], rhr: n[4] })) }, _alcohol: {} };
  N.forEach((n) => { if (n[1] != null) st._alcohol['2026-' + n[0]] = { l: n[1], t: [] }; });
  const app = loadApp({ now: '2026-10-31T09:00:00+01:00', state: st });
  const M = J(app.alcModel('2026-10-31'));
  assert.ok(M.base.rec >= 74 && M.base.rec <= 80, 'base ' + M.base.rec); assert.equal(M.nAlc, 4, 'la nuit du 29 (lendemain d\'une soirée) compte aussi');
  assert.ok(M.fit.rec.brut <= -5 && M.fit.rec.brut >= -7, 'effet brut ' + M.fit.rec.brut); assert.ok(M.coef.rec <= -5 && M.coef.rec >= -6.5, 'effet retenu ' + M.coef.rec);
  assert.ok(M.coef.rhr >= 1.2 && M.coef.hrv <= -3, JSON.stringify(M.coef));
  const I = J(app.alcImpact('2026-10-31'));
  assert.equal(I.dose, 7, '3/10 hier + la moitié de 8/10 avant-hier'); assert.ok(I.recWithout >= 68, 'hors alcool ' + I.recWithout); assert.ok(I.share >= 80, 'part ' + I.share);
  const W = J(app.prWhoop('2026-10-31'));
  assert.equal(W.tired, false, JSON.stringify(W)); assert.ok(W.alc && W.alc.explained, 'baisse expliquée par l\'alcool : pas d\'allègement du plan');
});
