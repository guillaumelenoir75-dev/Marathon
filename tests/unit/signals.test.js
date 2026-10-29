// Signaux du corps (zones FC, foulée), journal de séance, simulateur « Et si… », carte de la semaine, chaussure du jour
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, synthPlan } = require('../helpers/frontend');

const NOW = '2026-10-29T09:00:00+01:00';
const J = (o) => JSON.parse(JSON.stringify(o));   // objets créés dans le contexte de l'app
const pace = (s) => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// séances faites (toutes dans la semaine 1 du plan, datées par perf.date)
function runs(list, extra) {
  const st = Object.assign({ plan_start_date: '2026-09-07', _plan_engine: 'generated' }, extra || {});
  list.forEach((r, i) => {
    const k = 'extra_w1_s' + i;
    st[k] = JSON.stringify({ type: r.type || 'ef', km: r.km || 10, d: r.d || "Footing EF|5'45 — 6'10 /km", sched_date: r.date, shoe: r.shoe });
    if (r.done === false) return;
    st[k + '_done'] = true; st[k + '_km'] = r.km || 10;
    st[k + '_perf'] = JSON.stringify(Object.assign({ date: r.date, pace: r.pace ? pace(r.pace) : undefined, hr: r.hr, strava: r.strava }, r.perf || {}));
  });
  return st;
}

test('zones FC : plafond EF 148 par défaut, FC seuil lue dans les blocs tempo, pic de FC max isolé écarté', () => {
  const T = (date, fc) => ({ type: 'tempo', date, km: 10, d: "Tempo 3×8 min|3 km EF · 3 × 8 min à 4'35 — 4'40 /km", pace: 290, hr: 160,
    strava: { fcMax: 0, laps: [{ allure: '5:50', duree_sec: 900, fc: 135 }, { allure: '4:31', duree_sec: 480, fc: fc }, { allure: '4:33', duree_sec: 480, fc: fc + 1 }, { allure: '6:30', duree_sec: 120, fc: 150 }] } });
  const st = runs([T('2026-10-01', 170), T('2026-10-08', 171), T('2026-10-15', 169),
    { date: '2026-10-20', pace: 340, hr: 142, strava: { fcMax: 199 } }, { date: '2026-10-21', pace: 340, hr: 142, strava: { fcMax: 190 } }], { fc_max: '186' });
  const app = loadApp({ now: NOW, state: st });
  assert.equal(app.hrEfMax(), 148);
  const E = app.hrZonesEstimate('2026-10-29');
  assert.equal(E.fcMax.v, 190, 'pic à 199 isolé (capteur) écarté');
  assert.ok(E.lthr >= 171 && E.lthr <= 173, 'FC seuil ' + E.lthr);
  assert.equal(E.efMax, Math.round(E.lthr * 0.89));
  assert.ok(E.propose && E.raiseFcMax);
  assert.equal(E.zones.length, 5);
  st._hr_zones = { applied: true, efMax: E.efMax };
  assert.equal(app.hrEfMax(), E.efMax);
  st._hr_zones.applied = false; assert.equal(app.hrEfMax(), 148);
});

test('foulée : FC plus haute à allure égale + cadence en baisse → alerte ; stable → rien', () => {
  const mk = (recentHr, recentCad) => {
    const L = [];
    [20, 24, 28, 33, 38].forEach((d) => L.push({ date: addDays('2026-10-29', -d), pace: 340, hr: 140, strava: { cadence: 176 } }));
    [3, 8, 12].forEach((d) => L.push({ date: addDays('2026-10-29', -d), pace: 340, hr: recentHr, strava: { cadence: recentCad } }));
    return loadApp({ now: NOW, state: runs(L) }).prStride('2026-10-29');
  };
  const bad = mk(152, 170);
  assert.equal(bad.level, 2); assert.equal(bad.items.length, 2);
  assert.ok(bad.eiPct < -7 && bad.cad.diff <= -5);
  const ok = mk(140, 176);
  assert.equal(ok.level, 0); assert.equal(ok.items.length, 0);
  const better = mk(132, 177);
  assert.equal(better.level, 0); assert.ok(/Efficacité en hausse/.test(better.items[0]));
  assert.equal(loadApp({ now: NOW, state: runs([{ date: '2026-10-27', pace: 340, hr: 140 }]) }).prStride('2026-10-29'), null, 'pas assez de sorties');
});

test('journal : effort, douleur et zone lus dans le texte dicté', () => {
  const app = loadApp({ now: NOW });
  let r = app.jvParse('Dur sur la fin, mollet gauche un peu tendu, sinon bonnes jambes');
  assert.equal(r.rpe, 7); assert.deepEqual(J(r.pain), { level: 1, zone: 'Mollet' });
  r = app.jvParse('Super facile, aucune douleur');
  assert.equal(r.rpe, 2); assert.deepEqual(J(r.pain), { level: 0, zone: null });
  r = app.jvParse("J'ai eu mal au genou, obligé de ralentir. Effort 8 sur 10");
  assert.equal(r.rpe, 8); assert.deepEqual(J(r.pain), { level: 3, zone: 'Genou' });
  r = app.jvParse('Pas si dur que ça, ça s\'est pas mal passé');
  assert.equal(r.rpe, 4); assert.equal(r.pain, null, '« pas mal » n\'est pas une douleur');
  r = app.jvParse('Une gêne sous le pied droit');
  assert.deepEqual(J(r.pain), { level: 2, zone: 'Cheville / pied' });
  assert.equal(app.jvParse('ok tranquille').note, 'Ok tranquille');
});

test('« Et si… » : plan suivi = projection ; arrêt, maladie, volume, course déplacée', () => {
  const app = loadApp({ now: NOW, state: synthPlan({ km: [30, 32, 34, 36, 38, 40, 42, 30] }) });
  const m = 10000, v0 = 46, slope = 0.1 / 7, days = 52;
  const T = { now: v0, slope, race: { date: '2026-12-20', days, v: v0 + slope * days, mid: app.raceTimeFromVdot(v0 + slope * days, m), lo: app.raceTimeFromVdot(v0 + slope * days + 0.6, m), hi: app.raceTimeFromVdot(v0 + slope * days - 0.6, m) }, need: 47.2 };
  const a = { trajectory: T, opt: { today: '2026-10-29', raceCat: '10 km' }, recette: { progression: 1.1 } };
  const base = app.prWhatIf(a, {});
  assert.equal(base.delta, 0); assert.ok(base.verdict);
  const skip = app.prWhatIf(a, { skipWeeks: 2 });
  assert.ok(skip.delta > 0 && skip.v < base.v, 'deux semaines sautées : plus lent');
  assert.ok(skip.notes.some((t) => /Après l'arrêt/.test(t)));
  assert.ok(app.prWhatIf(a, { sickDays: 14 }).delta > app.prWhatIf(a, { sickDays: 3 }).delta);
  const up = app.prWhatIf(a, { volPct: 20 });
  assert.ok(up.delta < 0, 'plus de volume : plus rapide');
  assert.ok(up.risks.some((t) => /progression habituelle \(\+10 %/.test(t)), 'au-delà de la recette');
  assert.ok(app.prWhatIf(a, { shiftWeeks: 4 }).delta < 0, 'course plus tard : plus de temps pour progresser');
  assert.ok(app.prWhatIf(a, { shiftWeeks: -2 }).delta > 0);
  assert.ok(app.prWhatIf(a, { shiftWeeks: -8 }).error);
});

test('carte de la semaine : km faits / prévus, km par jour, séance phare (blocs du tempo)', () => {
  const st = synthPlan();
  const done = (k, km, perf) => { st[k + '_done'] = true; st[k + '_km'] = km; st[k + '_perf'] = JSON.stringify(Object.assign({ date: JSON.parse(st[k]).sched_date }, perf || {})); };
  done('extra_w1_s0', 9, { pace: '5:50' }); done('extra_w1_s1', 10, { blocsAllure: ['4:30', '4:32', '4:31'], rpe: 7 });
  const app = loadApp({ now: '2026-11-01T15:00:00+01:00', state: st });
  assert.equal(app.wsPickWeek('2026-11-01'), 1);
  const D = app.weekShareData(1, '2026-11-01');
  assert.equal(D.kmDone, 19); assert.equal(D.kmPlan, 30); assert.equal(D.nDone, 2); assert.equal(D.nPlan, 3);
  assert.equal(D.days[0].km, 9); assert.equal(D.days[2].km, 10); assert.equal(D.days[6].today, true);
  assert.equal(D.star.kind, 'q'); assert.match(D.star.line, /4'31 \/km/);
  assert.equal(D.rpe, 7);
  // lundi sans séance faite : on résume la semaine écoulée
  assert.equal(loadApp({ now: '2026-11-02T08:00:00+01:00', state: st }).wsPickWeek('2026-11-02'), 1);
});

test('chaussure du jour : rotation, fin de vie, paire de course préservée', () => {
  const shoes = [{ name: 'GRVL', max: 800 }, { name: 'Glide', max: 800 }, { name: 'Adios', max: 500 }, { name: 'Old', max: 600, retired: true }];
  const base = { _shoes: JSON.stringify(shoes), _shoe_rules: JSON.stringify({ ef: 'GRVL', long: 'GRVL', frac: 'Adios', tempo: 'Adios', race: 'Adios' }), shoe_km_GRVL: 300, shoe_km_Glide: 350, shoe_km_Adios: 120 };
  const st = Object.assign(runs([{ date: '2026-10-28', shoe: 'GRVL', pace: 340, hr: 140 }]), base);
  let app = loadApp({ now: NOW, state: st, race: { name: 'Semi', course: 'Semi-marathon', date: '2026-11-22', km: 21.1 } });
  let A = app.shoeDayAdvice({ type: 'ef', shoe: 'GRVL' }, '2026-10-29');
  assert.equal(A.name, 'Glide'); assert.match(A.reason, /GRVL déjà portée hier/);
  assert.equal(app.shoeDayAdvice({ type: 'ef', shoe: 'GRVL' }, '2026-10-31').name, 'GRVL', 'pas portée la veille');
  assert.equal(app.shoeDayAdvice({ type: 'tempo' }, '2026-10-30').name, 'Adios', 'règle par type');
  // fin de vie
  app.ctx.state.shoe_km_GRVL = 820;
  A = app.shoeDayAdvice({ type: 'long', shoe: 'GRVL' }, '2026-11-01');
  assert.equal(A.name, 'Glide'); assert.match(A.warn, /fin de vie/);
  // paire de course presque usée : gardée pour la course
  app.ctx.state.shoe_km_GRVL = 300; app.ctx.state.shoe_km_Adios = 440;
  A = app.shoeDayAdvice({ type: 'frac', shoe: 'Adios' }, '2026-11-04');
  assert.match(A.warn, /garde-la pour la course/); assert.notEqual(A.name, 'Adios');
  assert.equal(app.shoeDayAdvice({ type: 'race', shoe: 'Adios' }, '2026-11-22').name, 'Adios');
});

test('zones affichées : la Z2 s\'arrête au plafond d\'endurance utilisé, bornes croissantes', () => {
  const app = loadApp({ now: NOW });
  const fromMax = [{ z: 1, hi: 135 }, { z: 2, lo: 137, hi: 146 }, { z: 3, lo: 147, hi: 162 }, { z: 4, lo: 164, hi: 176 }, { z: 5, lo: 178, hi: 193 }];
  const z = J(app.bsDisplayZones(fromMax, 148));
  assert.deepEqual(z.map((x) => [x.lo || null, x.hi]), [[null, 135], [136, 148], [149, 162], [163, 176], [177, 193]]);
  assert.equal(app.bsDisplayZones(null, 148), null);
});

test('zones : allures par zone d\'après le niveau, EF d\'après les sorties réelles, recalculées après chaque séance', () => {
  const st = { record_10km: '42:00', _records: { '10 km': { date: '2026-10-01' } } };
  const app = loadApp({ now: NOW, state: st });
  let P = J(app.bsZonePaces('2026-10-29'));
  assert.ok(P.vdot > 45 && P.vdot < 50, 'niveau ' + P.vdot);
  const z = P.z;
  assert.ok(z[4].lo < z[3].lo && z[3].lo < z[2].lo && z[2].lo < z[1].lo, 'VMA < seuil < tempo < EF (s/km)');
  assert.ok(z[0].hi == null && z[0].lo > z[1].hi, 'récup : plus lent que l\'EF');
  assert.equal(P.efObs, null);
  // trois footings validés à 5'40 et FC ≤ 148 : la zone EF suit l'allure réellement courue
  ['2026-10-20', '2026-10-23', '2026-10-26'].forEach((d, i) => {
    const k = 'extra_w1_s' + i;
    st[k] = JSON.stringify({ type: 'ef', km: 10, d: 'Footing EF|x', sched_date: d }); st[k + '_done'] = true; st[k + '_km'] = 10;
    st[k + '_perf'] = JSON.stringify({ date: d, pace: '5:40', hr: 142 });
  });
  st.plan_start_date = '2026-10-19'; st._plan_engine = 'generated';
  app.ctx.prHistoryChanged();
  P = J(app.bsZonePaces('2026-10-29'));
  assert.equal(P.efObs, 340); assert.equal(P.z[1].lo, 330); assert.equal(P.z[1].hi, 355);
});
