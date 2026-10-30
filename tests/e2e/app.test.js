// Tests de bout en bout : l'app construite (dist/) dans Chromium, avec une fausse Firebase (firebase-mock.js).
// Parcours : premier lancement (plan Seine-Eure) → enregistrer la prépa marathon → installer la Novemb'Run →
// mise à jour du plan (calcul, Coach simulé, application, annulation), imprévu, validation (effort, douleur),
// plan de course, forme du jour, prépa à venir. Lancer : npm run build && npm run test:e2e
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DIST = path.join(__dirname, '..', '..', 'dist');
const MOCK = path.join(__dirname, 'firebase-mock.js');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
let server, base, browser, savedDb = null;

test.before(async () => {
  assert.ok(fs.existsSync(path.join(DIST, 'index.html')), 'lancer « npm run build » avant les tests de bout en bout');
  server = http.createServer((req, res) => {
    let f = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
    if (f.endsWith(path.sep) || !path.extname(f)) f = path.join(DIST, 'index.html');
    fs.readFile(f, (err, buf) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(buf); });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port + '/';
  browser = await chromium.launch();
});
test.after(async () => { if (browser) await browser.close(); if (server) server.close(); });

// nouvelle page à une date donnée, avec une base (JSON) éventuelle
async function open(dateIso, db, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Paris' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await ctx.route(/cloudfunctions\.net/, (r) => (opts.functions ? opts.functions(r) : r.fulfill({ contentType: 'application/json', body: '{"success":true,"analysis":"ok","reply":"ok","text":"ok"}' })));
  await ctx.route(/firebase-app-compat/, (r) => r.fulfill({ contentType: 'text/javascript', path: MOCK }));
  await ctx.route(/firebase-(auth|database|messaging)-compat/, (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await ctx.route(/chart\.umd/, (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]},options:{}}};window.Chart.register=function(){};' }));
  await ctx.addInitScript((t) => { const real = Date.now.bind(Date), off = t - real(), D = Date; class FD extends D { constructor(...a) { if (a.length === 0) super(real() + off); else super(...a); } static now() { return real() + off; } } window.Date = FD; }, new Date(dateIso).getTime());
  if (db) await ctx.addInitScript((j) => { window.__DB = JSON.parse(j); }, db);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(base + (opts.query || ''));
  await page.waitForFunction(() => typeof firebaseReady !== 'undefined' && firebaseReady, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const w = document.getElementById('wakeup-banner'); if (w) w.remove(); });
  return { ctx, page, errors };
}
const db = (page) => page.evaluate(() => JSON.stringify(window.__DB));
// ouvre « Mettre à jour le plan » et attend la fin de l'analyse animée
async function openReview(page) {
  await page.evaluate(() => { showScreen('plan'); openPlanReview(); });
  await page.waitForFunction(() => typeof _prReview !== 'undefined' && _prReview && document.querySelector('#pr-content .pr-card'), null, { timeout: 15000 });
}

test('premier lancement (plan Seine-Eure) : tous les écrans sans erreur', async () => {
  const { ctx, page, errors } = await open('2026-10-27T10:00:00+01:00');
  for (const s of ['home', 'plan', 'renfo', 'stats', 'coach', 'compte']) { await page.evaluate((x) => showScreen(x), s); await page.waitForTimeout(400); }
  assert.deepEqual(errors, []);
  // enregistrer la prépa marathon (résultat) puis installer la Novemb'Run
  await page.evaluate(async () => { await openPrepsPanel(); }); await page.waitForTimeout(500);
  await page.click('text=Enregistrer cette prépa'); await page.fill('#pf-result', '3:37:05'); await page.click('#pf-save'); await page.waitForTimeout(700);
  await page.click('text=Installer cette prépa'); await page.waitForTimeout(300); await page.click('#cm-confirm'); await page.waitForTimeout(1500);
  const st = await page.evaluate(() => state);
  assert.ok(st._plan_engine && st.extra_w1_s0, 'Novemb\'Run installée');
  savedDb = await db(page);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('prépa en cours : accueil (forme du jour), plan, stats, compte sans erreur', async () => {
  assert.ok(savedDb, 'dépend du test précédent');
  const { ctx, page, errors } = await open('2026-10-29T09:00:00+01:00', savedDb);
  for (const s of ['home', 'plan', 'stats', 'compte']) { await page.evaluate((x) => showScreen(x), s); await page.waitForTimeout(400); }
  await page.evaluate(() => { showScreen('home'); renderHome(); });
  assert.ok(await page.evaluate(() => !!document.getElementById('home-form-card')));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('historique complet : la prépa Seine-Eure enregistrée nourrit les analyses de la nouvelle prépa', async () => {
  const { ctx, page, errors } = await open('2026-10-29T09:00:00+01:00', savedDb);
  await page.evaluate(async () => { await prPrefetch(); });
  const h = await page.evaluate(() => { const all = prAllDone(); return { n: all.length, old: all.filter((s) => !s.cur).length, cur: all.filter((s) => s.cur).length }; });
  assert.ok(h.old > 0, 'séances de la prépa Seine-Eure dans l\'historique : ' + JSON.stringify(h));
  // Statistiques : historique des séances et tableau des performances, toutes prépas confondues
  await page.evaluate(() => { showScreen('stats'); renderStats(); }); await page.waitForTimeout(500);
  assert.match(await page.textContent('#perf-rows'), / avr /, 'séances d\'avril (Seine-Eure) listées avec celles de la nouvelle prépa');
  // prédiction et contexte du Coach construits sur l'historique, sans erreur
  const r = await page.evaluate(() => { const p = buildMarathonPrediction(); const c = typeof buildCompactContext === 'function' ? buildCompactContext(null, [], 'jeudi', '09:00') : null;
    return { nb: p.nbSeances || 0, months: c && c.historique_complet_par_mois ? c.historique_complet_par_mois.length : (c ? -1 : -2) }; });
  assert.ok(r.nb > 0, 'prédiction : séances de la prépa précédente prises en compte');
  assert.ok(r.months >= 2, 'Coach : historique mois par mois depuis la 1re séance (' + r.months + ' mois)');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('bilan de la prépa terminée et recette appliquée à la mise à jour du plan', async () => {
  const { ctx, page, errors } = await open('2026-10-29T09:00:00+01:00', savedDb);
  await page.evaluate(async () => { await openPrepsPanel(); }); await page.waitForTimeout(500);
  await page.waitForFunction(() => Object.values(_prepIndex || {}).some((p) => p.debrief), null, { timeout: 15000 });
  const d = await page.evaluate(() => Object.values(_prepIndex).find((p) => p.debrief).debrief);
  assert.ok(d.sessions.planned > 50 && d.sessions.done > 0 && d.volume.peak > 0 && d.lessons.length > 0, JSON.stringify(d).slice(0, 300));
  const id = await page.evaluate(() => Object.keys(_prepIndex).find((k) => _prepIndex[k].debrief));
  assert.ok(JSON.parse(await db(page)).users.ADMINUID.prep_index[id].debrief, 'bilan enregistré');
  // base de test : prépa peu validée → pas de recette ; puis recette d'une prépa complète
  assert.ok(d.completion < 0.6 && !(await page.evaluate(() => state._recette)), 'prépa incomplète ignorée');
  await page.evaluate(async (x) => { Object.assign(_prepIndex[x].debrief, { completion: 0.95, rises: { maxOk: 1.1, risky: 1.2 }, taperOk: true }); await prepDebriefAll(); await openPrepsPanel(); }, id);
  assert.equal(await page.evaluate(() => state._recette.progression), 1.12);
  await page.waitForSelector('text=Ta recette');
  await page.evaluate((x) => openPrepDebrief(x), id); await page.waitForTimeout(500);
  assert.ok(await page.evaluate(() => /Ce que tu en retiens/.test(document.getElementById('prep-debrief').textContent)));
  await page.evaluate(() => { document.getElementById('prep-debrief').remove(); });
  await openReview(page);
  assert.ok(await page.evaluate(() => /Ta recette/.test(document.getElementById('pr-content').textContent)));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('mise à jour du plan : analyse, application, historique, annulation', async () => {
  const { ctx, page, errors } = await open('2026-10-29T09:00:00+01:00', savedDb);
  await openReview(page);
  const n = await page.evaluate(() => _prReview.items.length);
  assert.ok(n > 0, 'des propositions');
  const before = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.keys(state).filter((k) => /^extra_w\d+_s\d+$/.test(k)).map((k) => [k, state[k]]))));
  await page.click('#pr-apply'); await page.waitForTimeout(800);
  const hist = await page.evaluate(() => state._plan_reviews.slice(-1)[0]);
  assert.equal(hist.changes.length, hist.n);
  const changed = await page.evaluate((b) => { const o = JSON.parse(b); return Object.keys(o).filter((k) => o[k] !== state[k]).length; }, before);
  assert.ok(changed > 0);
  await page.evaluate(() => prUndoReview(state._plan_reviews.length - 1)); await page.waitForTimeout(500);
  const left = await page.evaluate((b) => { const o = JSON.parse(b); return Object.keys(o).filter((k) => JSON.parse(o[k]).d !== JSON.parse(state[k]).d || +JSON.parse(o[k]).km !== +JSON.parse(state[k]).km).length; }, before);
  assert.equal(left, 0, 'annulation complète');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('avis du Coach (simulé) : fusion, application, avis réaffiché tant qu\'il n\'est pas appliqué', async () => {
  let calls = 0;
  const { ctx, page, errors } = await open('2026-10-29T09:00:00+01:00', savedDb, { functions: async (r) => {
    if (!/planReview/.test(r.request().url())) return r.fulfill({ contentType: 'application/json', body: '{"success":true}' });
    calls++;
    const b = JSON.parse(r.request().postData()), s = [].concat(...b.plan.map((w) => w.sessions)).find((x) => !x.done && x.type === 'ef' && x.date >= b.today);
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, assessment: 'Avis test.', changes: [{ ref: s.ref, km: s.km + 1, reason: 'test' }], rejected: [] }) });
  } });
  await openReview(page);
  await page.click('#pr-coach-btn'); await page.waitForFunction(() => _prReview && _prReview.coach === 'Avis test.', null, { timeout: 10000 });
  await page.evaluate(() => closePlanReview());
  await openReview(page);
  assert.equal(await page.evaluate(() => _prReview.coach), 'Avis test.', 'avis réaffiché');
  assert.ok(await page.evaluate(() => _prReview.items.some((x) => x.src === 'coach')));
  await page.evaluate(() => { _prReview.items.forEach((x) => { x.on = x.src === 'coach'; }); });
  await page.click('#pr-apply'); await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => state._coach_review.applied), true);
  assert.equal(calls, 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('imprévu : séance clé déplacée, annulable', async () => {
  const { ctx, page, errors } = await open('2026-10-29T09:00:00+01:00', savedDb);
  await page.evaluate(() => { showScreen('plan'); openImprevu(); _pdImpSet('from', '2026-11-17'); _pdImpSet('to', '2026-11-17'); });
  const ch = await page.evaluate(() => _pdImp.changes.map((c) => c.field));
  assert.ok(ch.length >= 1 && ch.every((f) => f === 'date' || f === 'skip'));
  const before = await page.evaluate(() => JSON.stringify(_pdImp.changes.map((c) => [c.key, state[c.key], state[c.key + '_skip'] || null])));
  await page.evaluate(() => applyImprevu()); await page.waitForTimeout(400);
  await page.evaluate(() => prUndoReview(state._plan_reviews.length - 1)); await page.waitForTimeout(400);
  const left = await page.evaluate((b) => JSON.parse(b).filter(([k, v, sk]) => JSON.parse(state[k]).sched_date !== JSON.parse(v).sched_date || (state[k + '_skip'] || null) !== sk).length, before);
  assert.equal(left, 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('validation : effort ressenti et douleur enregistrés, effacés à la revalidation', async () => {
  const { ctx, page, errors } = await open('2026-10-29T09:00:00+01:00', savedDb);
  const save = async (rpe, pain) => {
    await page.evaluate(() => { document.querySelectorAll('#modal-container .modal-overlay').forEach((x) => x.remove()); showScreen('home'); openValidationModalExtra(2, 0); });
    await page.waitForTimeout(300);
    await page.evaluate(([r, p]) => { if (r) prRpePick(r); prPainPick(p); }, [rpe, pain]);   // toucher la valeur déjà choisie la désélectionne
    await page.evaluate(() => saveValidationExtra(2, 0)); await page.waitForTimeout(1200);
    return page.evaluate(() => JSON.parse(state.extra_w2_s0_perf));
  };
  let perf = await save(7, 2);
  assert.equal(perf.rpe, 7); assert.equal(perf.pain.level, 2); assert.ok(perf.validatedAt);
  assert.equal(await page.evaluate(() => { document.querySelectorAll('#modal-container .modal-overlay').forEach((x) => x.remove()); openValidationModalExtra(2, 0); return document.getElementById('pd-rpe').dataset.rpe; }), '7', 'effort précédent repris à la revalidation');
  perf = await save(7, 0);
  assert.ok(!perf.rpe && !perf.pain, 'effort désélectionné et douleur « Aucune » : plus enregistrés');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('journal dicté, signaux du corps, chaussure du jour, carte de la semaine, « Et si… »', async () => {
  const { ctx, page, errors } = await open('2026-11-01T15:00:00+01:00', savedDb);
  // journal : le texte remplit l'effort et la douleur, enregistrés avec la note
  await page.evaluate(() => { showScreen('home'); openValidationModalExtra(1, 0); });
  await page.waitForSelector('#jv-text');
  assert.equal(await page.$('.jv-go'), null, 'plus de bouton : rempli tout seul');
  await page.fill('#jv-text', 'Dur sur la fin, mollet un peu tendu'); await page.waitForTimeout(1000);
  assert.deepEqual(await page.evaluate(() => { const b = document.getElementById('pd-rpe').dataset; return [b.rpe, b.pain, b.zone]; }), ['7', '1', 'Mollet']);
  assert.match(await page.textContent('#jv-out'), /effort 7\/10 · douleur légère \(mollet\) — rempli ci-dessous/);
  // effort corrigé à la main : la suite du texte ne l'écrase plus
  await page.evaluate(() => prRpePick(6));
  await page.fill('#jv-text', 'Très dur sur la fin, mollet un peu tendu'); await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(() => document.getElementById('pd-rpe').dataset.rpe), '6');
  assert.match(await page.textContent('#jv-out'), /choix fait à la main est gardé \(effort\)/);
  await page.evaluate(() => prRpePick(7));
  await page.evaluate(() => saveValidationExtra(1, 0)); await page.waitForTimeout(1200);
  const perf = await page.evaluate(() => JSON.parse(state.extra_w1_s0_perf));
  assert.equal(perf.journal, 'Très dur sur la fin, mollet un peu tendu'); assert.equal(perf.rpe, 7); assert.equal(perf.pain.zone, 'Mollet'); assert.ok(perf.note);
  // Statistiques : carte « Signaux du corps » (zones FC, foulée)
  await page.evaluate(() => { document.querySelectorAll('#modal-container .modal-overlay').forEach((x) => x.remove()); showScreen('stats'); });
  await page.waitForTimeout(600);
  assert.ok(await page.evaluate(() => /Signaux du corps/.test(document.getElementById('bs-stats-card').textContent) && /EF ≤ 148/.test(document.getElementById('bs-stats-card').textContent)));
  // niveau du moment : la carte ouvre le graphique détaillé (périodes, détail d'une date, temps équivalents)
  await page.click('.bs-hero'); await page.waitForSelector('#bs-lc .lc-svg');
  for (const r of ['3 mois', 'Tout', '6 mois']) { await page.click('#bs-lc .lc-seg >> text=' + r); await page.waitForSelector('#bs-lc #lc-detail .lc-card'); }
  assert.match(await page.textContent('#bs-lc #lc-detail'), /Temps équivalents à ce niveau.*10 km/s);
  await page.evaluate(() => document.getElementById('bs-lc').remove());
  // accueil du dimanche : bouton « ta semaine en image » → aperçu PNG
  await page.evaluate(() => { showScreen('home'); renderHome(); });
  await page.waitForSelector('.ws-home');
  await page.click('.ws-home'); await page.waitForSelector('#ws-share .ws-img');
  assert.ok(await page.evaluate(() => document.querySelector('#ws-share .ws-img').src.startsWith('data:image/png') && document.querySelector('#ws-share .ws-img').naturalWidth === 1080));
  await page.evaluate(() => document.getElementById('ws-share').remove());
  // chaussure du jour : conseil affiché sans erreur, « Prendre » change la paire de la séance
  const shoe = await page.evaluate(() => { const st = Object.keys(state).filter((k) => /^extra_w\d+_s\d+$/.test(k)).map((k) => [k, JSON.parse(state[k])]).find(([, x]) => x.type === 'ef' && x.sched_date >= '2026-11-02');
    if (!st) return null; const A = shoeDayAdvice(st[1], st[1].sched_date); return A && A.name; });
  if (shoe) assert.ok(await page.evaluate((n) => getShoes().some((s) => s.name === n && !s.retired), shoe), 'paire conseillée active');
  // « Et si… » depuis la trajectoire de la mise à jour du plan
  await openReview(page);
  const hasTj = await page.evaluate(() => !!(_prReview.a.trajectory && _prReview.a.trajectory.race));
  if (hasTj) {
    await page.click('text=Et si… ? Teste un scénario'); await page.waitForSelector('#wi-res .wi-big');
    const t0 = await page.textContent('#wi-res .wi-big');
    await page.click('#pr-whatif .wi-seg[data-k="skipWeeks"] button:nth-child(3)'); await page.waitForTimeout(200);
    assert.notEqual(await page.textContent('#wi-res .wi-big'), t0, 'scénario « 2 semaines sautées » recalculé');
    assert.ok(await page.evaluate(() => /Après l'arrêt/.test(document.getElementById('wi-res').textContent)));
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('validation express (?action=validate) : la dernière sortie Strava ouvre la bonne séance, déjà remplie', async () => {
  const act = { activityId: 42, date: '2026-10-29', nom: 'Morning Run', distanceKm: 7.1, duree: '40:12', allure: '5:40', fcMoyenne: 141 };
  const { ctx, page, errors } = await open('2026-10-29T18:00:00+01:00', savedDb, { query: '?action=validate', functions: async (r) => {
    const u = r.request().url();
    if (/stravaFetchDetail/.test(u)) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, detail: { splits: [{ km: 1, distanceKm: 1, allure: '5:41', fc: 138 }] } }) });
    if (/stravaFetch/.test(u)) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, activities: [act] }) });
    return r.fulfill({ contentType: 'application/json', body: '{"success":true}' });
  } });
  await page.waitForSelector('#val-km', { timeout: 15000 }); await page.waitForTimeout(800);
  const v = await page.evaluate(() => ({ km: document.getElementById('val-km').value, date: document.getElementById('val-date').value, hr: document.getElementById('val-hr').value }));
  assert.equal(v.km, '7.1'); assert.equal(v.date, '2026-10-29'); assert.equal(v.hr, '141');
  assert.equal(await page.evaluate(() => location.search), '', 'lien retiré de l\'adresse');
  // Compte › Validation express : mode d'emploi du raccourci
  await page.evaluate(() => { document.querySelectorAll('#modal-container .modal-overlay').forEach((x) => x.remove()); openQuickValidateHelp(); });
  assert.match(await page.textContent('#qv-help'), /Raccourcis.*Ouvrir les URL/s);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('démarrage allégé : carte, comparaison des prépas et simulateur chargés à la demande', async () => {
  const { ctx, page, errors } = await open('2026-10-29T09:00:00+01:00', savedDb);
  const loaded = () => page.evaluate(() => [...document.querySelectorAll('script[src*="/src/lazy-"]')].map((s) => s.src.replace(/.*lazy-(\w+)-.*/, '$1')).sort());
  assert.deepEqual(await loaded(), [], 'rien de chargé au démarrage');
  assert.ok(await page.evaluate(() => window.LAZY_BUNDLES && typeof _wiPick === 'undefined' && typeof PROG_COLORS === 'undefined' && typeof RaceNav === 'undefined'));
  // Mes prépas › Comparer mes prépas
  await page.evaluate(() => openProgress()); await page.waitForSelector('#prog-panel');
  await page.evaluate(() => document.getElementById('prog-panel').remove());
  // carte « Organisation course » (Leaflet bloqué dans les tests : l'écran s'ouvre quand même)
  await page.evaluate(() => { if (typeof openRaceOrgSheet === 'function' && document.getElementById('race-org-panel')) openRaceOrgSheet(); else initRaceOrgMap(); });
  await page.waitForFunction(() => typeof RaceNav !== 'undefined', null, { timeout: 10000 });
  assert.deepEqual(await loaded(), ['course', 'progress']);
  // un 2e appel ne recharge rien
  await page.evaluate(() => openProgress()); await page.waitForSelector('#prog-panel');
  assert.equal((await loaded()).length, 2);
  assert.deepEqual(errors.filter((e) => !/Leaflet|L is not defined|leaflet/i.test(e)), []);
  await ctx.close();
});

test('plan de course et prépa à venir', async () => {
  const { ctx, page, errors } = await open('2026-10-29T09:00:00+01:00', savedDb);
  await page.evaluate(() => openRacePlan()); await page.waitForTimeout(500);
  const r = await page.evaluate(() => ({ n: _pdRace.splits.length, last: _pdRace.splits[_pdRace.splits.length - 1].cum, target: _pdRace.target }));
  assert.equal(r.n, 10); assert.ok(Math.abs(r.last - r.target) < 1);
  await page.evaluate(() => document.getElementById('pd-race').remove());
  await page.evaluate(async () => { await openPrepsPanel(); }); await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelector('[data-prep-open="#next"]').click()); await page.waitForTimeout(1500);
  await openReview(page);
  assert.ok(await page.evaluate(() => _prReview.items.length > 0), 'propositions sur la prépa à venir');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('pilote automatique : ajustements de la nuit expliqués sur l\'accueil, annulables en un geste, réglage', async () => {
  assert.ok(savedDb, 'dépend du test précédent');
  const { ctx, page, errors } = await open('2026-10-29T09:00:00+01:00', savedDb);
  // la nuit : même moteur que la fonction serveur autopilotNightly
  await page.evaluate(async () => { await prPrefetch(); });
  const r = await page.evaluate(() => { const r = apRun(prTodayIso()); state._autopilot_last = r; save(); showScreen('home'); renderHome(); return JSON.parse(JSON.stringify(r)); });
  assert.ok(r && r.applied && r.changes.length, JSON.stringify(r));
  const c = r.changes[0];
  const before = await page.evaluate((k) => state[k], c.key);
  await page.waitForSelector('#home-form-card .ap-card .ap-undo');
  assert.match(await page.textContent('#home-form-card .ap-card'), /Ajusté cette nuit/);
  await page.click('#home-form-card .ap-card .ap-undo');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ L: state._autopilot_last, h: state._plan_reviews.slice(-1)[0] }));
  assert.ok(after.L.undone && after.h.undone, 'annulé et marqué');
  assert.notEqual(await page.evaluate((k) => state[k], c.key), before, 'séance rétablie');
  assert.match(await page.textContent('#home-form-card .ap-card'), /plan d'origine est rétabli/);
  await page.evaluate(() => { showScreen('compte'); openAutopilotSettings(); });
  await page.click('#ap-set .ap-opt:nth-of-type(2)');
  assert.equal(JSON.parse(await db(page)).users.ADMINUID.state._autopilot, 'suggest');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Statistiques en onglets (Forme / Entraînement / Historique), chaussures dans Compte, gels dans le plan de course', async () => {
  assert.ok(savedDb, 'dépend du test précédent');
  const { ctx, page, errors } = await open('2026-10-29T09:00:00+01:00', savedDb);
  await page.evaluate(() => showScreen('stats')); await page.waitForTimeout(700);
  const vis = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.offsetParent !== null; }, sel);
  assert.ok(await vis('#fm-card') && !(await vis('#chart-km')) && !(await vis('#perf-rows')), 'Forme par défaut');
  await page.click('#st-tabs button[data-st="train"]');
  assert.ok(await vis('#chart-km') && await vis('#bs-stats-card') && !(await vis('#fm-card')));
  await page.click('#st-tabs button[data-st="hist"]');
  assert.ok(await vis('#perf-rows'));
  // une seule liste : ligne compacte par séance, détail au toucher
  assert.ok(await vis('#perf-rows .ph-row'), 'mois le plus récent ouvert');
  const row = page.locator('#perf-rows .ph-row').first();
  await row.click();
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('[id^="prd_"]')].some((e) => e.style.display === 'block')), 'détail ouvert');
  assert.equal(await page.evaluate(() => !!document.getElementById('stats-sessions-section') || !!document.getElementById('stats-gels-section') || !!document.getElementById('shoes-bars')), false);
  // onglet mémorisé
  await page.evaluate(() => { showScreen('home'); showScreen('stats'); }); await page.waitForTimeout(300);
  assert.ok(await vis('#perf-rows'), 'dernier onglet rouvert');
  // chaussures : Compte › Mes chaussures
  await page.evaluate(() => { showScreen('compte'); openShoesPanel(); }); await page.waitForTimeout(300);
  assert.match(await page.textContent('#shoes-panel'), /Ajouter une paire/);
  await page.evaluate(() => closeShoesPanel());
  assert.deepEqual(errors, []);
  await ctx.close();
});
