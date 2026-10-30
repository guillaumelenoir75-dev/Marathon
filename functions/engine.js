// Moteur de plan de l'app (scripts de public-static/src) chargé tel quel dans un contexte isolé : utilisé côté serveur
// (pilote automatique de nuit) et par les tests unitaires — même code que l'app, jamais une copie réécrite.
// Source : functions/engine-src (copiée au déploiement par scripts/copy-engine.js, predeploy de firebase.json),
// sinon ../public-static/src (tests, développement).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ENGINE_FILES = ['plan-review.js', 'plan-optim.js', 'plan-daily.js', 'prep-debrief.js', 'body-signals.js', 'journal.js', 'plan-whatif.js', 'week-share.js', 'quick-validate.js', 'fitness-model.js', 'autopilot.js', 'race-analysis.js', 'next-race.js', 'plan-generate.js', 'shoes.js', 'stats.js', 'whoop.js'];
const EXPORTS = 'prSessions, prWeeks, prMonday, prWeekday, prKmDetail, prPlanVdot, prOrigPaces, prPaceProposals, prChecks, prVolumePlan, prDoneLog, prLoad, prDrift, prTestTime, prTestProposal, prWhoop, prEasedSince, prCalib, prTrajectory, _prMergeCoach, prRevertOf, prBlocsFromLaps, prWxAdj, prRaceSplits, prImprevuChanges, prFixSchedDatesV1, prStreak, prBadges, prInternal, wellnessScore, wellnessScoreToday, wellnessWaiting, whoopFcToState, vdotFromRace, raceTimeFromVdot, prTime, prPace, prDataSig, prepDebrief, prepRecette, prepRecetteLines, prAllDone, prObservedEf, prFitness, hrEfMax, hrZonesEstimate, prStride, jvParse, prWhatIf, weekShareData, wsPickWeek, shoeDayAdvice, bsDisplayZones, bsZonePaces, bsLevelNow, bsLevelHistory, dqIssues, dqKeep, qvMatch, bsBedtime, prStravaSessions, prStravaRaces, prKnownRaces, fmSeries, fmRaceDay, fmTaperBest, fmTaperChanges, fmTrimp, fmLsq, prApplyChanges, prUndoReview, prAnalyze, apRun, apSelect, apFindEntry, raAnalyze, raCurrent, raFromSnap, nrOptions, nrBuild, nrMinWeeks, generateAthletePlan';

function engineDir() {
  const own = path.join(__dirname, 'engine-src');
  return fs.existsSync(path.join(own, 'plan-review.js')) ? own : path.join(__dirname, '..', 'public-static', 'src');
}
function fakeDate(nowIso) {
  const RealDate = Date, fixed = new RealDate(nowIso).getTime();
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(fixed); else super(...a); }
    static now() { return fixed; }
  }
  return FakeDate;
}
// course objectif d'une prépa générée (même calcul que prepRace de config.js)
function raceFromState(st) {
  const ob = (st && st.onboarding) || {}; if (!ob.date) return null;
  const km = parseFloat(ob.race_distance_km) || ({ 'Marathon': 42.195, 'Semi-marathon': 21.1, '10 km': 10, '5 km': 5 })[ob.course] || null;
  const tt = st.target_time || ob.target_time || '';
  return { name: ob.race_name || ob.course || 'Course objectif', course: ob.course || '', date: ob.date, km, objectif: tt ? String(tt).replace(/^00:/, '').replace(/^0/, '') : 'non défini' };
}
// opts : state, now (ISO), race, admin, prepIndex, snaps { id: state }, strava { id: course }
function loadEngine(opts) {
  opts = opts || {};
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, setAttribute() {}, dataset: {} });
  const st = opts.state || {};
  const race = opts.race || raceFromState(st);
  const ctx = {
    console, Math, JSON, Promise, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    Date: opts.now ? fakeDate(opts.now) : Date,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: el, head: el(), body: el(), addEventListener() {}, visibilityState: 'visible' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: {}, location: { pathname: '/', search: '' }, history: { replaceState() {} },
    fetch: () => Promise.reject(new Error('pas de réseau dans le moteur')),
    state: st, dbRef: null, rendered: {}, _prepIndex: opts.prepIndex || null,
    isAdmin: () => opts.admin !== false, usesHardPlan: () => !!opts.hardPlan, save() {}, showToast() {}, initFirebase() {},
    prepRace: () => race || { name: 'Course objectif', course: '', date: '', km: null, objectif: 'non défini' },
    normalizeSessionTitle: (t) => t, FUNCTIONS_BASE: 'https://functions.invalid', ADMIN_EMAIL: '',
    getShoes: () => { try { return JSON.parse(st._shoes || '[]'); } catch (e) { return []; } },
    P: 'Pegasus', S: 'Saucony', Z: 'Zoom', CW: 1, getOrderedWeekSessions: () => [], getEffectiveCW: () => 0,
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  // un seul script : les const / let de premier niveau restent visibles entre modules, comme dans le bundle
  const dir = engineDir();
  const code = ENGINE_FILES.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n;\n')
    + '\n;globalThis.__app = { ' + EXPORTS + ' };'
    + '\n;globalThis.__setSnaps = function(o){ _prAllSnaps = o || {}; _prAllCache = null; };'
    + '\n;globalThis.__setStrava = function(h){ _prStravaHist = h; _prAllCache = null; };';
  vm.runInContext(code, ctx, { filename: 'app-bundle.js' });
  const app = ctx.__app;
  app.ctx = ctx;
  app.setSnaps = (o) => ctx.__setSnaps(o);
  app.setStrava = (h) => ctx.__setStrava(h);
  app.setState = (s) => { vm.runInContext('state = __next', Object.assign(ctx, { __next: s })); };
  if (opts.snaps) app.setSnaps(opts.snaps);
  if (opts.strava) app.setStrava(opts.strava);
  return app;
}
module.exports = { loadEngine, ENGINE_FILES, raceFromState };
