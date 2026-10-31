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
  if (opts.init) await ctx.addInitScript(opts.init, opts.initArg);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(base + (opts.query || ''));
  await page.waitForFunction(() => typeof firebaseReady !== 'undefined' && firebaseReady, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  // écran de réveil (6h-14h) : retiré pour ne pas gêner les tests, ou seulement masqué (opts.keepWakeup)
  await page.evaluate((keep) => { const w = document.getElementById('wakeup-banner'); if (w) { if (keep) w.style.display = 'none'; else w.remove(); } }, !!opts.keepWakeup);
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

test('enregistrement ciblé : une écriture du serveur n\'est pas écrasée ; hors ligne, rien n\'est perdu (rejoué au lancement suivant)', async () => {
  assert.ok(savedDb, 'dépend du test précédent');
  const { ctx, page, errors } = await open('2026-10-29T09:00:00+01:00', savedDb);
  // la nuit, le serveur écrit une clé que l'app ouverte ne connaît pas encore
  await page.evaluate(() => { window.__DB.users.ADMINUID.state._autopilot_last = { date: 'serveur' }; state.extra_note_test = 'app'; save(); });
  await page.waitForTimeout(200);
  let S = JSON.parse(await db(page)).users.ADMINUID.state;
  assert.equal(S._autopilot_last.date, 'serveur', 'écriture du serveur conservée');
  assert.equal(S.extra_note_test, 'app');
  // sans réseau : modification gardée sur le téléphone, pas encore dans la base
  await page.evaluate(() => { window.__HOLD = true; state.extra_offline_test = 'hors-ligne'; delete state.extra_note_test; save(); });
  await page.waitForTimeout(200);
  S = JSON.parse(await db(page)).users.ADMINUID.state;
  assert.equal(S.extra_offline_test, undefined); assert.equal(S.extra_note_test, 'app');
  const pending = await page.evaluate(() => localStorage.getItem('pm_pending_ADMINUID'));
  assert.ok(pending && /hors-ligne/.test(pending), 'en attente sur le téléphone');
  const dbNow = await db(page);
  await ctx.close();   // app fermée avant le retour du réseau
  // lancement suivant : écritures en attente rejouées
  const b = await open('2026-10-29T10:00:00+01:00', dbNow, { init: (p) => localStorage.setItem('pm_pending_ADMINUID', p), initArg: pending });
  await b.page.waitForTimeout(300);
  S = JSON.parse(await db(b.page)).users.ADMINUID.state;
  assert.equal(S.extra_offline_test, 'hors-ligne', 'rejouée'); assert.equal(S.extra_note_test, undefined, 'suppression rejouée');
  assert.equal(S._autopilot_last.date, 'serveur');
  assert.equal(await b.page.evaluate(() => localStorage.getItem('pm_pending_ADMINUID')), null, 'plus rien en attente');
  assert.deepEqual(errors.concat(b.errors), []);
  await b.ctx.close();
});

test('démarrage sans réseau : l\'app s\'ouvre sur la copie du téléphone, bandeau « Hors connexion »', async () => {
  assert.ok(savedDb, 'dépend du test précédent');
  const st = JSON.stringify(JSON.parse(savedDb).users.ADMINUID.state);
  const { ctx, page, errors } = await open('2026-10-29T09:00:00+01:00', savedDb, { init: (s) => { localStorage.setItem('pm_state_ADMINUID', s); localStorage.setItem('pm_role_ADMINUID', 'admin'); window.__NO_NET = true; Object.defineProperty(navigator, 'onLine', { get: () => false }); }, initArg: st });
  assert.ok(await page.evaluate(() => !!state.plan_start_date && !!document.getElementById('sync-banner')));
  assert.match(await page.textContent('#sync-banner'), /Hors connexion/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('analyse de course : après la validation, carte sur l\'accueil, écran détaillé, leçon dans la recette et le plan de course', async () => {
  assert.ok(savedDb, 'dépend du test précédent');
  const { ctx, page, errors } = await open('2026-11-23T09:00:00+01:00', savedDb);
  const r = await page.evaluate(() => {
    const race = prSessions(state).filter((s) => s.type === 'race').pop(); if(!race) return 'pas de course';
    const mmss = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    const pac = [238, 240, 246, 250, 252, 255, 268, 270, 272, 266];
    state[race.key + '_done'] = true; state[race.key + '_km'] = 10;
    state[race.key + '_perf'] = JSON.stringify({ date: race.date, official: '42:37', strava: { splits: pac.map((p, i) => ({ km: i + 1, distanceKm: 1, allure: mmss(p), fc: 160 + i * 3 })) } });
    state._race_result = { time: '42:37', date: race.date, dist: '10 km' };
    const A = raStore(); showScreen('home'); renderHome();
    return A ? A.verdict.t + '|' + A.startAdvice : 'null';
  });
  assert.match(r, /\|slower$/, r);
  await page.waitForSelector('#home-form-card .ra-home');
  await page.click('#home-form-card .ra-home');
  await page.waitForSelector('#ra-modal .ra-svg');
  assert.match(await page.textContent('#ra-modal'), /Départ trop rapide/);
  assert.equal(JSON.parse(await db(page)).users.ADMINUID.state._race_analysis.time, '42:37', 'enregistrée');
  await page.evaluate(() => { document.getElementById('ra-modal').remove(); state._recette = prepRecette([], state._race_analysis); });
  assert.equal(await page.evaluate(() => state._recette.pacing.start), 1.02);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('prochaine course : options, conseil, création de la prépa à venir (remplace celle déjà prévue après confirmation)', async () => {
  assert.ok(savedDb, 'dépend du test précédent');
  const { ctx, page, errors } = await open('2026-10-30T09:00:00+01:00', savedDb);
  await page.evaluate(async () => { showScreen('compte'); await openPrepsPanel(); });
  await page.waitForTimeout(400);
  await page.click('text=Choisir ma prochaine course');
  await page.waitForSelector('#nr-modal .nr-card.on .nr-form');
  assert.equal(await page.locator('#nr-modal .nr-card').count(), 4);
  assert.match(await page.textContent('#nr-modal .nr-card.on'), /Conseillé/);
  const best = await page.evaluate(() => _nr.sel);
  await page.fill('#nr-name', 'Ma course test');
  assert.ok(await page.locator('#nr-modal .nr-tg button').count() === 2, 'temps visés réaliste / ambitieux');
  await page.click('#nr-modal .nr-tg button:nth-child(2)');
  const hadNext = await page.evaluate(() => !!_nr.O.next);
  await page.click('#nr-modal .nr-go');
  if (hadNext) { await page.waitForSelector('#confirm-modal-overlay'); await page.click('#confirm-modal-overlay button:has-text("Remplacer")'); }
  await page.waitForFunction(() => !document.getElementById('nr-modal'), null, { timeout: 5000 });
  const N = JSON.parse(await db(page)).users.ADMINUID.prep_next;
  assert.equal(N.meta.title, 'Ma course test'); assert.equal(N.meta.dist, best);
  assert.ok(N.meta.target && N.meta.weeks >= 6 && Object.keys(N.state).some((k) => /^extra_w1_s0$/.test(k)));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('analyse du Coach après validation : ton ressenti et l\'écart à la consigne lui sont envoyés', async () => {
  assert.ok(savedDb, 'dépend du test précédent');
  let body = null;
  const { ctx, page, errors } = await open('2026-10-29T09:00:00+01:00', savedDb, { functions: (r) => {
    if (/analyzeSession/.test(r.request().url())) body = JSON.parse(r.request().postData() || '{}');
    return r.fulfill({ contentType: 'application/json', body: '{"success":true,"analysis":"[FEU:🟢]\\n⭐ ÉVALUATION\\n●●●●●●●●○○ **8/10**","reply":"ok","text":"ok"}' });
  } });
  await page.evaluate(() => { showScreen('home'); openValidationModalExtra(2, 0); });
  await page.waitForTimeout(300);
  const det = await page.evaluate(() => JSON.parse(state.extra_w2_s0).d);
  await page.fill('#val-km', '8'); await page.fill('#val-pace', '4:53'); await page.fill('#val-hr', '157');
  await page.fill('#jv-text', 'Super séance, après le premier km je me sentais bien alors j\'ai accéléré, très content');
  await page.evaluate(() => { prRpePick(6); saveValidationExtra(2, 0); });
  await page.waitForFunction(() => true); await page.waitForTimeout(2500);
  assert.ok(body, 'analyse demandée');
  const S = body.sessionData;
  assert.match(S.ressenti_athlete.ce_que_guillaume_a_dit, /je me sentais bien/);
  assert.equal(S.ressenti_athlete.effort_ressenti_sur_10, 6); assert.equal(S.ressenti_athlete.douleur, 'aucune');
  if (/\d['’:]\d{2}/.test(det.split('|').slice(1).join('|'))) assert.equal(S.ecart_consigne.sens, 'plus rapide que prévu');
  // en-tête du Coach : objectif de la prépa en cours (plus « avant le marathon » ni l'allure du marathon Seine-Eure)
  const hdr = await page.evaluate(() => { const r = []; for (let m = 0; m < 60; m += 15) { const D = Date; window.Date = class extends D { constructor(...a) { if (a.length) super(...a); else { super(); this.setMinutes(m); } } static now() { return D.now(); } }; updateCoachHeader(); r.push(document.getElementById('coach-header-status').textContent); window.Date = D; } return r; });
  assert.ok(!hdr.some((t) => /avant le marathon/.test(t)), hdr.join(' | '));
  assert.ok(hdr.some((t) => /Objectif : \d/.test(t)), hdr.join(' | '));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Coach › « Mon plan » : je parle de ma semaine, le Coach propose, j\'applique puis j\'annule', async () => {
  assert.ok(savedDb, 'dépend du test précédent');
  let target = null, body = null;
  const { ctx, page, errors } = await open('2026-10-29T09:00:00+01:00', savedDb, { functions: (r) => {
    if (/planChat/.test(r.request().url())) {
      body = JSON.parse(r.request().postData() || '{}');
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, reply: 'Belle semaine ! Je te propose de passer **' + target.title + '** de ' + target.km + ' à ' + (target.km + 2) + ' km.', changes: [{ ref: target.key, km: target.km + 2, reason: 'Semaine bien encaissée' }], auto: [] }) });
    }
    return r.fulfill({ contentType: 'application/json', body: '{"success":true,"reply":"ok","text":"ok"}' });
  } });
  target = await page.evaluate(() => { const s = prSessions(state).filter((x) => !x.done && x.type !== 'race' && x.date > prTodayIso()).shift(); return { key: s.key, title: s.title, km: s.kmPlan }; });
  await page.evaluate(() => showScreen('coach')); await page.waitForTimeout(300);
  await page.click('#coach-mode button[data-m="plan"]');
  await page.waitForSelector('#pc-panel .pc-sum');
  assert.ok(await page.evaluate(() => document.getElementById('coach-messages').style.display === 'none' && document.getElementById('coach-chat-foot').style.display === 'none'), 'discussion libre masquée');
  await page.fill('#pc-input', 'Cette semaine ça s\'est bien passé, j\'aurais bien vu un peu plus de volume la semaine prochaine, qu\'en penses-tu ?');
  await page.click('#pc-send');
  await page.waitForSelector('#pc-messages .pc-card.pending .pc-go');
  assert.match(body.message, /un peu plus de volume/); assert.ok(Array.isArray(body.plan) && body.plan.length && body.race, 'tout le plan et les données envoyés');
  assert.match(await page.textContent('#pc-messages .pc-card'), new RegExp('km : ' + target.km + ' km → ' + (target.km + 2) + ' km'));
  await page.click('#pc-messages .pc-go');
  await page.waitForSelector('#pc-messages .pc-card.applied');
  let S = await page.evaluate((k) => ({ km: JSON.parse(state[k]).km, h: state._plan_reviews.slice(-1)[0] }), target.key);
  assert.equal(S.km, target.km + 2); assert.equal(S.h.kind, 'chat'); assert.ok(S.h.coach);
  assert.equal(JSON.parse(JSON.parse(await db(page)).users.ADMINUID.state[target.key]).km, target.km + 2, 'enregistré');
  await page.click('#pc-messages .pc-done button');
  await page.waitForSelector('#pc-messages .pc-card.undone');
  assert.equal(await page.evaluate((k) => JSON.parse(state[k]).km, target.key), target.km, 'annulé');
  // mode mémorisé ; « En parler avec le Coach » depuis MAJ le plan ouvre ce fil
  await page.evaluate(() => { showScreen('home'); showScreen('coach'); }); await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => document.getElementById('pc-panel').style.display !== 'none'));
  assert.equal(await page.evaluate(() => state._plan_chat.msgs.length >= 4), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('forme du jour à l\'ouverture : chargement pendant la synchro WHOOP, jamais la valeur de la veille', async () => {
  assert.ok(savedDb, 'dépend du test précédent');
  const D = JSON.parse(savedDb), st = D.users.ADMINUID.state;
  st.whoop_token = { access_token: 'x' };
  st.whoop_data = { updatedAt: '2026-10-28T20:00:00Z', recoveries: [{ date: '2026-10-29', score: 30, rhr: 60, hrv: 40 }], sleeps: [{ date: '2026-10-29', performance_pct: 50, duration_hours: '5h30' }] };
  let release = null; const gate = new Promise((r) => { release = r; });
  const { ctx, page, errors } = await open('2026-10-29T09:00:00+01:00', JSON.stringify(D), { functions: async (r) => {
    if (/whoopSync/.test(r.request().url())) { await gate; return r.fulfill({ contentType: 'application/json', body: '{"success":true}' }); }
    return r.fulfill({ contentType: 'application/json', body: '{"success":true}' });
  } });
  await page.evaluate(() => { showScreen('home'); renderHome(); });
  let txt = await page.textContent('#home-form-card');
  assert.match(txt, /Mise à jour…/); assert.doesNotMatch(txt, /récup 30 %/, 'pas de valeur périmée');
  // la synchro a ramené la nuit : nouvelle valeur affichée
  await page.evaluate(() => { window.__DB.users.ADMINUID.state.whoop_data = { updatedAt: new Date().toISOString(), recoveries: [{ date: '2026-10-29', score: 82, rhr: 49, hrv: 70 }], sleeps: [{ date: '2026-10-29', performance_pct: 90, duration_hours: '7h50' }] }; });
  release();
  await page.waitForFunction(() => /récup 82 %/.test(document.getElementById('home-form-card').textContent), null, { timeout: 5000 });
  txt = await page.textContent('#home-form-card');
  assert.doesNotMatch(txt, /Mise à jour…/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('ouverture : tout l\'historique est chargé avant le 1er affichage (forme du jour, série justes d\'emblée)', async () => {
  assert.ok(savedDb, 'dépend du test précédent');
  const { ctx, page, errors } = await open('2026-10-29T09:00:00+01:00', savedDb, { init: () => {
    const t = setInterval(() => { try { if (typeof firebaseReady !== 'undefined' && firebaseReady) { window.__atReady = { pre: !!window._prPrefetchDone }; clearInterval(t); } } catch (e) {} }, 2);
  } });
  const r = await page.evaluate(() => ({ at: window.__atReady, old: prAllDone().filter((s) => !s.cur).length, form: document.getElementById('home-form-card').textContent, streak: prStreak() }));
  assert.ok(r.at && r.at.pre, 'historique chargé avant que l\'app soit prête');
  assert.ok(r.old > 0, 'séances des prépas précédentes dans les analyses');
  await page.evaluate(async () => { await prPrefetch(); renderHome(); });
  assert.equal(await page.evaluate(() => document.getElementById('home-form-card').textContent), r.form, 'aucune valeur provisoire : identique après rechargement de l\'historique');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('forme du jour sécurisée : synchro WHOOP en échec ou nuit absente → message clair et « Réessayer », jamais les chiffres de la veille', async () => {
  assert.ok(savedDb, 'dépend du test précédent');
  const D = JSON.parse(savedDb), st = D.users.ADMINUID.state;
  st.whoop_token = { access_token: 'x' }; st['_wakeup_2026-10-29'] = true;            // « Je suis réveillé » ce matin
  st.whoop_data = { updatedAt: '2026-10-28T20:00:00Z', recoveries: [{ date: '2026-10-28', score: 30, rhr: 60, hrv: 40 }], sleeps: [{ date: '2026-10-28', performance_pct: 50, duration_hours: '5h30' }] };
  let mode = 'fail';
  const { ctx, page, errors } = await open('2026-10-29T09:00:00+01:00', JSON.stringify(D), { functions: (r) => {
    if (/whoopSync/.test(r.request().url())) {
      if (mode === 'fail') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"success":false,"error":"WHOOP indisponible"}' });
      if (mode === 'auth') return r.fulfill({ contentType: 'application/json', body: '{"needsAuth":true}' });
      return r.fulfill({ contentType: 'application/json', body: '{"success":true}' });
    }
    return r.fulfill({ contentType: 'application/json', body: '{"success":true}' });
  } });
  const card = () => page.textContent('#home-form-card');
  await page.waitForFunction(() => /Échec de la récupération WHOOP/.test(document.getElementById('home-form-card').textContent), null, { timeout: 5000 });
  let t = await card();
  assert.doesNotMatch(t, /récup 30 %|sommeil 50 %|\b3[0-9]\b.*Récupération insuffisante/, 'aucun chiffre de la veille');
  assert.ok(await page.locator('#home-form-card button:has-text("Réessayer")').count());
  // WHOOP déconnecté
  mode = 'auth'; await page.click('#home-form-card button:has-text("Réessayer")');
  await page.waitForFunction(() => /WHOOP déconnecté/.test(document.getElementById('home-form-card').textContent), null, { timeout: 5000 });
  // synchro réussie mais la nuit n'est pas encore calculée par WHOOP
  mode = 'ok'; await page.evaluate(() => whoopRetry());
  await page.waitForFunction(() => /Nuit pas encore disponible/.test(document.getElementById('home-form-card').textContent), null, { timeout: 5000 });
  assert.doesNotMatch(await card(), /récup 30 %/);
  // la nuit arrive : vraie valeur du jour
  await page.evaluate(() => { window.__DB.users.ADMINUID.state.whoop_data = { updatedAt: new Date().toISOString(), recoveries: [{ date: '2026-10-29', score: 82, rhr: 49, hrv: 70 }], sleeps: [{ date: '2026-10-29', performance_pct: 90, duration_hours: '7h50' }] }; whoopRetry(); });
  await page.waitForFunction(() => /récup 82 %/.test(document.getElementById('home-form-card').textContent), null, { timeout: 5000 });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('alcool : étape plein écran du réveil (même fond), puis l\'accueil avec la forme du jour ; 3 dernières nuits ; réinitialiser ce matin', async () => {
  assert.ok(savedDb, 'dépend du test précédent');
  const D = JSON.parse(savedDb), st = D.users.ADMINUID.state;
  const rec = [], sl = [];
  for (let i = 0; i < 20; i++) { const d = new Date('2026-10-29T12:00:00Z'); d.setUTCDate(d.getUTCDate() - i); const k = d.toISOString().slice(0, 10); rec.push({ date: k, score: i === 0 ? 41 : 70, rhr: i === 0 ? 57 : 50, hrv: i === 0 ? 52 : 68 }); sl.push({ date: k, performance_pct: i === 0 ? 66 : 86 }); }
  st.whoop_data = { updatedAt: new Date('2026-10-29T08:00:00Z').toISOString(), recoveries: rec, sleeps: sl };
  delete st.whoop_token;
  const { ctx, page, errors } = await open('2026-10-29T09:00:00+01:00', JSON.stringify(D), { keepWakeup: true });
  // « Je suis réveillé » (accueil) → écran plein, étape alcool sur le fond du réveil (rien de l'accueil visible)
  await page.evaluate(() => { showScreen('home'); wakeupStart(); });
  await page.waitForSelector('#wakeup-banner .alc-fs .alc-fs-none');
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('wakeup-banner')).position), 'fixed');
  assert.equal(await page.evaluate(() => !!document.getElementById('alc-modal')), false, 'pas de fenêtre par-dessus l\'accueil');
  // l'accueil se rafraîchit pendant l'étape (fin de synchro WHOOP…) : l'écran reste, la question aussi
  await page.evaluate(() => { renderHome(); checkWakeupBanner(); renderHome(); });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.getElementById('wakeup-banner').style.display), 'flex');
  assert.ok(await page.locator('#wakeup-banner .alc-fs-none').isVisible(), 'question toujours là');
  await page.click('#wakeup-banner .alc-n:nth-child(6)');
  await page.click('#wakeup-banner .alc-ty:nth-child(1)'); await page.click('#wakeup-banner .alc-ty:nth-child(2)');
  assert.match(await page.textContent('#alc-go'), /Enregistrer 6\/10 · bière, vin/);
  await page.click('#alc-go');
  await page.waitForFunction(() => /Réveil enregistré/.test(document.getElementById('wakeup-banner').textContent));
  await page.waitForFunction(() => document.getElementById('wakeup-banner').style.display === 'none', null, { timeout: 6000 });
  let S = JSON.parse(await db(page)).users.ADMINUID.state;
  assert.deepEqual(S._alcohol['2026-10-29'].t, ['beer', 'wine']); assert.equal(S._alcohol['2026-10-29'].l, 6); assert.ok(S['_wakeup_2026-10-29']);
  const line = await page.textContent('#home-form-card');
  assert.match(line, /Alcool hier soir : 6\/10 \(bière, vin\)/); assert.match(line, /hors alcool, ta forme serait ~\d+/);
  // bouton temporaire : 3 dernières nuits, une par une, sur le même écran
  await page.click('#home-form-card .alc-home.back');
  await page.waitForSelector('#wakeup-banner .alc-fs-step');
  assert.match(await page.textContent('#wakeup-banner .alc-fs-step'), /Nuit 1 \/ 3/);
  await page.click('#wakeup-banner .alc-fs-none');                                       // nuit 1 : rien
  await page.waitForFunction(() => /Nuit 2 \/ 3/.test(document.querySelector('#wakeup-banner .alc-fs-step').textContent));
  await page.click('#wakeup-banner .alc-n:nth-child(8)'); await page.click('#alc-go');   // nuit 2 : 8/10
  await page.waitForFunction(() => /Nuit 3 \/ 3/.test(document.querySelector('#wakeup-banner .alc-fs-step').textContent));
  await page.click('#wakeup-banner .alc-later');                                          // nuit 3 : passée
  await page.waitForFunction(() => document.getElementById('wakeup-banner').style.display === 'none');
  S = JSON.parse(await db(page)).users.ADMINUID.state;
  assert.equal(S._alcohol['2026-10-26'].l, 0); assert.equal(S._alcohol['2026-10-27'].l, 8); assert.equal(S._alcohol['2026-10-28'], undefined);
  assert.match(await page.textContent('#home-form-card .alc-home.back'), /1 nuit à compléter/);
  // Statistiques › Forme
  await page.evaluate(() => { showScreen('stats'); statsTab('forme'); }); await page.waitForTimeout(500);
  assert.match(await page.textContent('#alc-stats-card'), /Alcool et récupération/);
  // Préférences › Réinitialiser ce matin : réveil, alcool d'hier soir et brief effacés ; « Je suis réveillé » revient
  await page.evaluate(() => { window._wakeReload = () => {}; });
  await page.evaluate(async () => { await wakeResetMorning(); });
  S = JSON.parse(await db(page)).users.ADMINUID.state;
  assert.equal(S['_wakeup_2026-10-29'], undefined); assert.equal(S._alcohol['2026-10-29'], undefined); assert.equal(S._alcohol['2026-10-27'].l, 8, 'les autres nuits gardées');
  assert.equal(await page.evaluate(() => localStorage.getItem('pm_force_wakeup')), '1');
  await page.evaluate(() => { showScreen('home'); checkWakeupBanner(); });
  assert.equal(await page.evaluate(() => document.getElementById('wakeup-banner').style.display), 'flex');
  assert.match(await page.textContent('#wakeup-banner'), /Je suis réveillé|réveill/i, 'écran d\'origine « Je suis réveillé »');
  // bannière forcée : un rafraîchissement de l'accueil ne la ferme pas ; « Je suis réveillé » → question alcool qui reste
  await page.evaluate(() => { renderHome(); checkWakeupBanner(); });
  assert.equal(await page.evaluate(() => document.getElementById('wakeup-banner').style.display), 'flex');
  await page.evaluate(() => { onWakeupFromBanner(); });   // sans attendre : le parcours attend un clic
  await page.waitForSelector('#wakeup-banner .alc-fs-none');
  await page.evaluate(() => { renderHome(); renderHome(); }); await page.waitForTimeout(400);
  assert.ok(await page.locator('#wakeup-banner .alc-fs-none').isVisible(), 'la question ne disparaît pas toute seule');
  await page.click('#wakeup-banner .alc-fs-none');
  await page.waitForFunction(() => document.getElementById('wakeup-banner').style.display === 'none', null, { timeout: 6000 });
  assert.deepEqual(errors, []);
  await ctx.close();
  // ouverture : réveil déclaré, alcool pas encore renseigné → même écran plein
  const D2 = JSON.parse(savedDb); D2.users.ADMINUID.state['_wakeup_2026-10-29'] = true;
  const b2 = await open('2026-10-29T09:30:00+01:00', JSON.stringify(D2), { keepWakeup: true });
  await b2.page.waitForSelector('#wakeup-banner .alc-fs .alc-fs-none', { timeout: 8000 });
  await b2.page.click('#wakeup-banner .alc-later');
  await b2.page.waitForFunction(() => document.getElementById('wakeup-banner').style.display === 'none');
  assert.match(await b2.page.textContent('#home-form-card'), /Alcool hier soir \?/);
  assert.deepEqual(b2.errors, []);
  await b2.ctx.close();
});

test('alcool : une nuit passée non renseignée se complète depuis l\'historique', async () => {
  assert.ok(savedDb, 'dépend du test précédent');
  const { ctx, page, errors } = await open('2026-10-29T09:00:00+01:00', savedDb, { keepWakeup: true });
  await page.evaluate(() => openAlcoholInsights());
  await page.waitForSelector('#alc-ins .alc-row');
  assert.equal(await page.locator('#alc-ins .alc-row').count() >= 7, true);
  await page.locator('#alc-ins .alc-row').nth(2).click();                 // avant-hier
  await page.waitForSelector('#alc-modal');
  assert.match(await page.textContent('#alc-modal'), /Nuit passée/);
  await page.click('#alc-modal .alc-n:nth-child(8)'); await page.click('#alc-go');
  assert.equal(await page.evaluate(() => state._alcohol['2026-10-27'].l), 8);
  assert.deepEqual(errors, []);
  await ctx.close();
});
