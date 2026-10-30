// Charge les modules de l'app (scripts classiques, fonctions globales) dans un contexte isolé pour les tests unitaires.
// Usage : const app = loadApp({ state: {...}, now: '2026-10-29T09:00:00+01:00' }); app.prVolumePlan(...)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', '..', 'public-static', 'src');
const FILES = ['plan-review.js', 'plan-optim.js', 'plan-daily.js', 'prep-debrief.js', 'body-signals.js', 'journal.js', 'plan-whatif.js', 'week-share.js', 'quick-validate.js', 'shoes.js', 'stats.js', 'whoop.js'];

function fakeDate(nowIso) {
  const RealDate = Date, fixed = new RealDate(nowIso).getTime();
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(fixed); else super(...a); }
    static now() { return fixed; }
  }
  return FakeDate;
}

function loadApp(opts) {
  opts = opts || {};
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, setAttribute() {}, dataset: {} });
  const ctx = {
    console, Math, JSON, Promise, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    Date: opts.now ? fakeDate(opts.now) : Date,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: el, head: el(), body: el(), addEventListener() {}, visibilityState: 'visible' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: {}, location: { pathname: '/', search: '' }, history: { replaceState() {} },
    fetch: () => Promise.reject(new Error('réseau coupé dans les tests')),
    state: opts.state || {}, dbRef: null, rendered: {},
    isAdmin: () => opts.admin !== false, usesHardPlan: () => false, save() {}, showToast() {}, initFirebase() {},
    prepRace: () => opts.race || { name: 'Course test', course: '10 km', date: '2026-11-22', km: 10, objectif: '42:00' },
    normalizeSessionTitle: (t) => t, FUNCTIONS_BASE: 'https://functions.test', ADMIN_EMAIL: 'admin@test',
    // chaussures (config.js, plan Seine-Eure) : liste dans state._shoes, km dans state._shoe_km_test
    getShoes: () => { try { return JSON.parse((opts.state || {})._shoes || '[]'); } catch (e) { return []; } },
    P: 'Pegasus', S: 'Saucony', Z: 'Zoom', CW: 1, getOrderedWeekSessions: () => [], getEffectiveCW: () => 0,
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  // un seul script : les const / let de premier niveau restent visibles entre modules, comme dans le bundle
  const code = FILES.map((f) => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n;\n')
    + '\n;globalThis.__app = { prSessions, prWeeks, prMonday, prWeekday, prKmDetail, prPlanVdot, prOrigPaces, prPaceProposals, prChecks, prVolumePlan, prDoneLog, prLoad, prDrift, prTestTime, prTestProposal, prWhoop, prEasedSince, prCalib, prTrajectory, _prMergeCoach, prRevertOf, prBlocsFromLaps, prWxAdj, prRaceSplits, prImprevuChanges, prFixSchedDatesV1, prStreak, prBadges, prInternal, wellnessScore, wellnessScoreToday, wellnessWaiting, whoopFcToState, vdotFromRace, raceTimeFromVdot, prTime, prPace, prDataSig, prepDebrief, prepRecette, prepRecetteLines, prAllDone, prObservedEf, prFitness, hrEfMax, hrZonesEstimate, prStride, jvParse, prWhatIf, weekShareData, wsPickWeek, shoeDayAdvice, bsDisplayZones, bsZonePaces, bsLevelNow, bsLevelHistory, dqIssues, dqKeep, qvMatch, bsBedtime };';
  // copies des prépas enregistrées (historique complet) : app.setSnaps({ id: state })
  vm.runInContext(code + '\n;globalThis.__setSnaps = function(o){ _prAllSnaps = o || {}; _prAllCache = null; };', ctx, { filename: 'app-bundle.js' });
  const app = ctx.__app;
  app.ctx = ctx;
  app.setSnaps = (o) => ctx.__setSnaps(o);
  app.setState = (st) => { vm.runInContext('state = __next', Object.assign(ctx, { __next: st })); };
  return app;
}

// Plan synthétique : nWeeks semaines (lun EF, mer qualité, dim sortie longue), course finale la dernière semaine
function synthPlan(o) {
  o = o || {};
  const km = o.km || [30, 34, 38, 40, 42, 30], n = km.length, start = o.start || '2026-10-26';
  const st = { plan_start_date: start, _plan_engine: 'generated' };
  const mon = new Date(start + 'T12:00:00'); const dw = mon.getDay(); mon.setDate(mon.getDate() + (dw === 0 ? -6 : 1 - dw));
  const day = (w, k) => { const x = new Date(mon); x.setDate(x.getDate() + (w - 1) * 7 + k); return x.toISOString().slice(0, 10); };
  for (let w = 1; w <= n; w++) {
    const L = Math.round(km[w - 1] * 0.35), Q = 10, E = km[w - 1] - L - Q, race = w === n, test = o.testRace === w;
    st['extra_w' + w + '_s0'] = JSON.stringify({ type: 'ef', km: E, d: "Footing EF|5'45 — 6'10 /km", sched_date: day(w, 0), sched_day: 1 });
    st['extra_w' + w + '_s1'] = JSON.stringify(test ? { type: 'race', km: 21, d: 'Semi test|course', sched_date: day(w, 2), sched_day: 3 }
      : { type: 'tempo', km: Q, d: "Tempo 3×8 min|3 km EF · 3 × 8 min à 4'35 — 4'40 /km · récup 2 min", sched_date: day(w, 2), sched_day: 3 });
    st['extra_w' + w + '_s2'] = JSON.stringify(race ? { type: 'race', km: 10, d: 'COURSE|course', sched_date: day(w, 6), sched_day: 7 }
      : { type: 'long', km: L, d: o.longDet ? o.longDet(L) : "5'45 — 6'10 /km", sched_date: day(w, 6), sched_day: 7 });
    st['meta_w' + w] = JSON.stringify({ phase: 'x', isRecov: (o.recov || []).indexOf(w) >= 0, isTaper: w >= n - 1 });
  }
  return st;
}

module.exports = { loadApp, synthPlan };
