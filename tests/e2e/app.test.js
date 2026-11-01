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
  // écran clair : les changements d'abord, points clés courts, détails repliés
  const order = await page.evaluate(() => [...document.querySelectorAll('#pr-content > *')].filter((e) => e.offsetParent).map((e) => e.className.split(' ')[0]));
  assert.equal(order[0], 'pr-top', 'les changements en premier : ' + order.join(','));
  assert.equal(order[1], 'pr-chg');
  assert.ok(await page.locator('#pr-content .pr-key').count() <= 4, '4 points clés au plus');
  assert.ok(await page.locator('#pr-content > .pr-chg').count() <= 4, '4 changements visibles, les autres repliés');
  assert.equal(await page.locator('#pr-content .pr-chg').count(), n);
  assert.equal(await page.locator('#pr-content details.pr-more[open]').count(), 0, 'détails repliés');
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('#pr-content .pr-why-t')].every((e) => e.textContent.length <= 72)), 'raisons courtes');
  if (process.env.SHOT_PR) { await page.setViewportSize({ width: 390, height: 2000 }); await page.waitForTimeout(300); await page.locator('#plan-review .modal-box').screenshot({ path: process.env.SHOT_PR }); }
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
  await page.waitForSelector('#home-share-btn', { state: 'visible' });
  assert.equal(await page.locator('#home-form-card .ws-home').count(), 0, 'plus de bandeau dans la forme du jour');
  assert.match(await page.textContent('#home-share-btn'), /^📸\s*Partager$/);
  await page.click('#home-share-btn'); await page.waitForSelector('#ws-share .ws-img');
  assert.ok(await page.evaluate(() => document.querySelector('#ws-share .ws-img').src.startsWith('data:image/png') && document.querySelector('#ws-share .ws-img').naturalWidth === 1080 && document.querySelector('#ws-share .ws-img').naturalHeight === 1920));
  if (process.env.SHOT_WS) fs.writeFileSync(process.env.SHOT_WS, Buffer.from((await page.evaluate(() => document.querySelector('#ws-share .ws-img').src)).split(',')[1], 'base64'));
  // Télécharger (ordinateur) : un vrai fichier semaine-N.png
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#ws-share .ws-b:has-text("Télécharger")')]);
  assert.match(dl.suggestedFilename(), /^semaine-\d+\.png$/);
  await page.evaluate(() => document.getElementById('ws-share').remove());
  assert.equal(await page.evaluate(() => planBrand()), 'Plan 10 km', 'signature de l\'image : la course préparée');
  // dans la fenêtre : « Semaine faite » ou « À venir » (semaine prévue suivante), même place, nouvelle image
  await page.click('#home-share-btn'); await page.waitForSelector('#ws-share .ws-seg');
  assert.equal(await page.getAttribute('#ws-share .ws-seg [data-m="done"]', 'aria-selected'), 'true');
  const srcDone = await page.getAttribute('#ws-share .ws-img', 'src');
  await page.click('#ws-share .ws-seg [data-m="plan"]');
  assert.equal(await page.getAttribute('#ws-share .ws-seg [data-m="plan"]', 'aria-selected'), 'true');
  assert.notEqual(await page.getAttribute('#ws-share .ws-img', 'src'), srcDone);
  assert.match(await page.getAttribute('#ws-share .ws-img', 'alt'), /à venir : [\d.]+ km prévus/);
  if (process.env.SHOT_WS) await page.locator('#ws-share .modal-box').screenshot({ path: process.env.SHOT_WS.replace(/\.png$/, '-modal.png') });
  if (process.env.SHOT_WS) fs.writeFileSync(process.env.SHOT_WS.replace(/\.png$/, '-plan.png'), Buffer.from((await page.evaluate(() => document.querySelector('#ws-share .ws-img').src)).split(',')[1], 'base64'));
  await page.evaluate(() => document.getElementById('ws-share').remove());
  // Partager (téléphone) : la feuille de partage reçoit le fichier PNG directement depuis le toucher (exigé par iOS)
  await page.evaluate(() => { window.__shared = null; navigator.canShare = (d) => !!(d && d.files && d.files.length); navigator.share = (d) => { window.__shared = { sync: true, type: d.files[0].type, size: d.files[0].size, name: d.files[0].name }; return Promise.resolve(); }; });
  await page.click('#home-share-btn'); await page.waitForSelector('#ws-share .ws-b.main');
  assert.equal(await page.textContent('#ws-share .ws-b.main'), 'Partager');
  await page.click('#ws-share .ws-b.main');
  const sh = await page.evaluate(() => window.__shared);
  assert.ok(sh && sh.type === 'image/png' && sh.size > 10000 && /^semaine-\d+\.png$/.test(sh.name), JSON.stringify(sh));
  await page.evaluate(() => document.getElementById('ws-share').remove());
  // chaussure du jour : conseil affiché sans erreur, « Prendre » change la paire de la séance
  const shoe = await page.evaluate(() => { const st = Object.keys(state).filter((k) => /^extra_w\d+_s\d+$/.test(k)).map((k) => [k, JSON.parse(state[k])]).find(([, x]) => x.type === 'ef' && x.sched_date >= '2026-11-02');
    if (!st) return null; const A = shoeDayAdvice(st[1], st[1].sched_date); return A && A.name; });
  if (shoe) assert.ok(await page.evaluate((n) => getShoes().some((s) => s.name === n && !s.retired), shoe), 'paire conseillée active');
  // « Et si… » depuis la trajectoire de la mise à jour du plan
  await openReview(page);
  const hasTj = await page.evaluate(() => !!(_prReview.a.trajectory && _prReview.a.trajectory.race));
  if (hasTj) {
    await page.click('#pr-more-tj > summary'); await page.click('#pr-content .pr-whatif-b'); await page.waitForSelector('#wi-res .wi-big');
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
  assert.ok(await page.evaluate(() => typeof nrOptions === 'undefined' && typeof pcRender === 'undefined'), 'prochaine course et « Mon plan » pas chargés au démarrage');
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
  assert.match(txt, /Mise à jour…/); assert.doesNotMatch(txt, /récup\s*30 %/i, 'pas de valeur périmée');
  // la synchro a ramené la nuit : nouvelle valeur affichée
  await page.evaluate(() => { window.__DB.users.ADMINUID.state.whoop_data = { updatedAt: new Date().toISOString(), recoveries: [{ date: '2026-10-29', score: 82, rhr: 49, hrv: 70 }], sleeps: [{ date: '2026-10-29', performance_pct: 90, duration_hours: '7h50' }] }; });
  release();
  await page.waitForFunction(() => /récup\s*82 %/i.test(document.getElementById('home-form-card').textContent), null, { timeout: 5000 });
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
  assert.doesNotMatch(t, /récup\s*30 %|sommeil\s*50 %|\b3[0-9]\b.*Récupération insuffisante/i, 'aucun chiffre de la veille');
  assert.ok(await page.locator('#home-form-card button:has-text("Réessayer")').count());
  // WHOOP déconnecté
  mode = 'auth'; await page.click('#home-form-card button:has-text("Réessayer")');
  await page.waitForFunction(() => /WHOOP déconnecté/.test(document.getElementById('home-form-card').textContent), null, { timeout: 5000 });
  // synchro réussie mais la nuit n'est pas encore calculée par WHOOP
  mode = 'ok'; await page.evaluate(() => whoopRetry());
  await page.waitForFunction(() => /Nuit pas encore disponible/.test(document.getElementById('home-form-card').textContent), null, { timeout: 5000 });
  assert.doesNotMatch(await card(), /récup\s*30 %/i);
  // la nuit arrive : vraie valeur du jour
  await page.evaluate(() => { window.__DB.users.ADMINUID.state.whoop_data = { updatedAt: new Date().toISOString(), recoveries: [{ date: '2026-10-29', score: 82, rhr: 49, hrv: 70 }], sleeps: [{ date: '2026-10-29', performance_pct: 90, duration_hours: '7h50' }] }; whoopRetry(); });
  await page.waitForFunction(() => /récup\s*82 %/i.test(document.getElementById('home-form-card').textContent), null, { timeout: 5000 });
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
  // pastille compacte dans la carte « Forme du jour » : niveau, points perdus, forme sans alcool — pas de grande carte à part
  const chip = await page.textContent('#home-form-card .pd-form .alc-chip');
  assert.match(chip, /6\/10 hier soir 🍺🍷/); assert.doesNotMatch(chip, /avant-hier/); assert.match(chip, /−\d+ pts · ~\d+ sans alcool/);
  assert.equal(await page.locator('#home-form-card .alc-split').count(), 0);
  assert.ok(await page.locator('#home-form-card .g-alc').count(), 'arc « sans alcool » sur la jauge');
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
  const rows = page.locator('#alc-ins .alc-row.ev:not(.hd)');
  assert.equal(await rows.count() >= 7, true);
  // chaque ligne porte la date de la SOIRÉE (la veille du réveil), pas celle du matin
  assert.match(await rows.nth(0).textContent(), /^mer 28 oct/);
  assert.match(await rows.nth(2).textContent(), /^lun 26 oct/);
  // détail sans paragraphes : pas de texte long
  const longest = await page.evaluate(() => Math.max(...[...document.querySelectorAll('#alc-ins p, #alc-ins td, #alc-ins small')].map((e) => e.textContent.trim().length)));
  assert.ok(longest <= 70, 'texte le plus long : ' + longest);
  await rows.nth(2).click();                                              // réveil d'avant-hier (soirée du 26)
  await page.waitForSelector('#alc-modal');
  assert.match(await page.textContent('#alc-modal'), /Nuit passée/);
  await page.click('#alc-modal .alc-n:nth-child(8)'); await page.click('#alc-go');
  assert.equal(await page.evaluate(() => state._alcohol['2026-10-27'].l), 8);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Statistiques › Forme : « Aujourd\'hui » en tête (forme du jour, à retenir, 4 mesures), alcool sur une ligne', async () => {
  assert.ok(savedDb, 'dépend du premier test');
  const D = JSON.parse(savedDb), S = D.users.ADMINUID.state;
  const N = [['10-31', 3, 35, 57, 63, 67], ['10-30', 8, 26, 52, 65, 57], ['10-29', 0, 56, 74, 52, 82], ['10-28', 7, 38, 65, 57, 74], ['10-27', null, 48, 72, 50, 83], ['10-26', null, 60, 79, 48, 82], ['10-25', 8, 21, 55, 63, 65],
    ['10-24', null, 77, 88, 53, 80], ['10-23', null, 88, 91, 49, 83], ['10-22', null, 90, 91, 49, 82], ['10-21', null, 77, 88, 55, 82], ['10-20', null, 74, 83, 45, 76], ['10-19', null, 56, 81, 51, 77], ['10-18', null, 90, 89, 49, 77]];
  S.whoop_data = { recoveries: N.map((n) => ({ date: '2026-' + n[0], score: n[2], hrv: n[3], rhr: n[4] })), sleeps: N.map((n) => ({ date: '2026-' + n[0], performance_pct: n[5], duration_hours: '7h02' })) };
  S._alcohol = {}; N.forEach((n) => { if (n[1] != null) S._alcohol['2026-' + n[0]] = { l: n[1], t: n[1] ? ['beer', 'wine'] : [] }; });
  N.forEach((n) => { S['fc_repos_2026-' + n[0]] = String(n[4]); });
  S['_wakeup_2026-10-31'] = true;
  const { ctx, page, errors } = await open('2026-10-31T19:00:00+01:00', JSON.stringify(D));
  await page.evaluate(() => { showScreen('stats'); statsTab('forme'); });
  await page.waitForSelector('#st-today .st-td-h');
  const order = await page.evaluate(() => [...document.querySelectorAll('#sc-stats .st-pane[data-st="forme"] > div')].filter((e) => e.innerHTML.trim()).map((e) => e.id));
  assert.equal(order[0], 'st-today', 'Aujourd\'hui en premier : ' + order.join(', '));
  const t = await page.textContent('#st-today');
  assert.match(t, /Forme du jour/); assert.match(t, /sans alcool/); assert.match(t, /dus à l'alcool/);
  assert.equal(await page.locator('#st-today .st-td-t > *').count(), 4);
  assert.ok(await page.locator('#st-today .st-td-m > *').count() <= 4, '4 messages au plus');
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('whoop-synthetic-score')).display), 'none', 'ancien score WHOOP masqué');
  assert.match(await page.textContent('#alc-stats-card .alc-line'), /Alcool et récupération/);
  // ta nuit : toujours visible (Statistiques et accueil), détail au toucher
  const ready = await page.evaluate(() => bsBedtimeStatus().ready);
  assert.match(await page.textContent('#st-today .bs-sleep'), ready ? /Ce soir : couche-toi vers \d+h\d{2}/ : /heure de coucher à venir/);
  await page.evaluate(() => showScreen('home'));
  // accueil : pastille compacte dans l'en-tête ; série et badges sous les séances
  await page.waitForSelector('#home-sleep-btn', { state: 'visible' });
  assert.match(await page.textContent('#home-sleep-btn'), ready ? /🌙\s*\d+h\d{2}/ : /🌙\s*à venir/);
  assert.equal(await page.locator('#home-form-card .bs-sleep').count(), 0, 'plus de grande ligne sur l\'accueil');
  assert.equal(await page.locator('#home-form-extra .pd-strip').count(), 1);
  assert.equal(await page.locator('#home-form-card .pd-strip').count(), 0);
  // plan de course : seulement dans la semaine de la course (J-6 au jour J)
  const dRace = await page.evaluate(() => { const R = prepRace(); return R && R.date ? prDays(prTodayIso(), R.date) : null; });
  assert.equal(await page.locator('#home-form-card .pd-raceb').count(), dRace != null && dRace >= 0 && dRace <= 6 ? 1 : 0, 'J-' + dRace);
  await page.click('#home-sleep-btn');
  await page.waitForSelector('#bs-sleep-m .bs-sl-big');
  assert.match(await page.textContent('#bs-sleep-m'), ready ? /Coucher.*Sommeil.*Réveil/s : /Heure de coucher à venir/);
  if (process.env.SHOT) await page.locator('#bs-sleep-m .modal-box').screenshot({ path: process.env.SHOT + '-sleep.png' });
  const need0 = await page.evaluate(() => bsSleepNeed().min);
  await page.locator('#bs-sleep-m .bs-sl-set').first().locator('button').last().click();
  assert.equal(await page.evaluate(() => state._sleep_target_h), Math.round((need0 + 15) / 60 * 100) / 100, 'besoin réglable (+15 min), passe en manuel');
  assert.equal(await page.evaluate(() => bsSleepNeed().src), 'manual');
  await page.click('#bs-sleep-m .bs-sl-auto');
  assert.equal(await page.evaluate(() => bsSleepNeed().min), need0, 'retour en auto');
  await page.evaluate(() => { document.getElementById('bs-sleep-m').remove(); showScreen('stats'); });
  if (process.env.SHOT) { await page.setViewportSize({ width: 390, height: 1800 }); await page.locator('.st-pane[data-st="forme"]').screenshot({ path: process.env.SHOT }); }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('accueil compact : objectif sur une ligne, en-tête sans débordement, prochaine séance, séance faite repliée, forme en 4 valeurs', async () => {
  assert.ok(savedDb, 'dépend du premier test');
  const D = JSON.parse(savedDb), S = D.users.ADMINUID.state;
  const N = [['11-03', 2, 58, 66, 54, 79], ['11-02', 0, 70, 75, 50, 85], ['11-01', 0, 62, 70, 52, 82], ['10-31', 3, 35, 57, 63, 67], ['10-30', 8, 26, 52, 65, 57], ['10-29', 0, 56, 74, 52, 82], ['10-28', 7, 38, 65, 57, 74]];
  S.whoop_data = { recoveries: N.map((n) => ({ date: '2026-' + n[0], score: n[2], hrv: n[3], rhr: n[4] })), sleeps: N.map((n) => ({ date: '2026-' + n[0], performance_pct: n[5], duration_hours: '7h02' })) };
  S._alcohol = {}; N.forEach((n) => { S._alcohol['2026-' + n[0]] = { l: n[1], t: [] }; });
  N.forEach((n) => { S['fc_repos_2026-' + n[0]] = String(n[4]); });
  S['_wakeup_2026-11-03'] = true;
  S.extra_w2_s0_done = true; S.extra_w2_s0_km = '8.1'; S.extra_w2_s0_perf = JSON.stringify({ pace: "5'43", dur: "46'20", date: '2026-11-03' });
  const { ctx, page, errors } = await open('2026-11-03T15:00:00+01:00', JSON.stringify(D));
  await page.evaluate(() => showScreen('home'));
  await page.waitForSelector('#home-next-card .hn-card');
  // objectif sur une ligne avec J-x ; date de course plus répétée à droite
  assert.match(await page.textContent('#home-goal-label'), /^🎯 10 km · .*22 nov\. · J-19$/);
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('home-race-date')).display), 'none');
  // rien ne dépasse du bord droit de l'écran
  const over = await page.evaluate(() => [...document.querySelectorAll('#home-header-main-row *, #home-progression-block *')].filter((e) => e.offsetParent && e.getBoundingClientRect().right > window.innerWidth + 0.5).map((e) => e.id || e.className || e.tagName));
  assert.deepEqual(over, []);
  // « Partager ma semaine » : dans l'en-tête, sous la météo, visible tous les jours (ici un mardi)
  assert.equal(await page.locator('#home-share-btn').isVisible(), true);
  // une seule barre de progression, plus de doublon « séances de la semaine »
  assert.equal(await page.locator('#home-progression-block #h-week-row').isVisible(), false);
  // prochaine séance : la 1re non faite à venir (jeudi), libellé du jour
  assert.match(await page.textContent('#home-next-card'), /Prochaine · Jeudi 5 · 6h30.*Footing EF.*9 km/s);
  // séance faite : une ligne compacte, carte complète au toucher
  const row = page.locator('#home-sessions .hs-row').first();
  assert.match(await row.textContent(), /✓\s*Footing EF · 8,1 km · 5'43\/km/);
  assert.equal(await page.locator('#hs-2-0').isVisible(), false);
  await row.click();
  assert.equal(await page.locator('#hs-2-0').isVisible(), true);
  // forme du jour : 4 mini-valeurs colorées
  assert.equal(await page.locator('#home-form-card .pd-mini > span').count(), 4);
  assert.match(await page.textContent('#home-form-card .pd-mini'), /Récup\s*58 %.*Sommeil\s*79 %.*FC repos\s*54.*VFC\s*66 ms/s);
  // séance à faire : 3 lignes (jour + titre, consigne, km), Éditer en icône
  const card = page.locator('#hs-2-1');
  assert.match(await card.locator('.hs-h').textContent(), /^Jeu 06:30\s*Footing EF$/);
  assert.match(await card.locator('.hs-km').textContent(), /9 km/);
  assert.equal(await card.locator('.hs-ed').count(), 1);
  assert.match(await page.textContent('#week-total-km'), /^8,1 \/ \d+ km$/);
  // semaine sur une ligne
  assert.equal(await page.textContent('#home-week-label'), 'Semaine 2');
  assert.match(await page.textContent('#home-week-dates'), /^· 2 – 8 nov\.$/);
  if (process.env.SHOT_HOME) await page.evaluate(() => { const s = document.getElementById('home-weather-strip'); s.style.display = 'flex'; document.getElementById('home-weather-icon').textContent = '🌙'; document.getElementById('home-weather-temp').textContent = '12°'; });
  if (process.env.SHOT_HOME) { await page.setViewportSize({ width: 390, height: 2200 }); await page.locator('#sc-home').screenshot({ path: process.env.SHOT_HOME }); }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('validation automatique : pastille « ressenti ? » sur l\'accueil, ressenti enregistré, réglage dans Compte', async () => {
  assert.ok(savedDb, 'dépend du premier test');
  const D = JSON.parse(savedDb), S = D.users.ADMINUID.state;
  S.extra_w2_s0_done = true; S.extra_w2_s0_km = 8.1;
  S.extra_w2_s0_perf = JSON.stringify({ date: '2026-11-03', pace: '5:43', dur: '46:20', hr: 141, strava_id: '9001', auto: { at: '2026-11-03T13:00:00Z', src: ['strava', 'whoop', 'meteo'] },
    whoop: { workout_strain: 9.4 }, meteo: { temperature: 12.4, date: '2026-11-03', heure_cible: '12h00' } });
  S._autoval_log = { 9001: { st: 'ok', date: '2026-11-03', km: 8.1, title: 'Footing EF', at: '2026-11-03T13:00:00Z' } };
  const { ctx, page, errors } = await open('2026-11-03T15:00:00+01:00', JSON.stringify(D), { query: '?action=feel&k=extra_w2_s0' });
  // la notification ouvre directement le ressenti de la séance
  await page.waitForSelector('#av-feel .av-chips', { timeout: 6000 });
  assert.match(await page.textContent('#av-feel .av-chips'), /8,1 km · 5'43\/km.*WHOOP 9,4.*12°/s);
  await page.evaluate(() => { prRpePick(4); });
  await page.click('#av-feel .av-save'); await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => JSON.parse(state.extra_w2_s0_perf).rpe), 4);
  assert.equal(await page.evaluate(() => JSON.parse(state.extra_w2_s0_perf).strava_id), '9001', 'données de la validation automatique gardées');
  await page.evaluate(() => document.querySelectorAll('#modal-container .modal-overlay').forEach((x) => x.remove()));
  assert.equal(await page.locator('#home-sessions .hs-feel').count(), 0, 'plus de pastille une fois le ressenti donné');
  // réglage : les 3 sources expliquées, désactivation
  await page.evaluate(() => { showScreen('compte'); avOpenSettings(); });
  await page.waitForSelector('#av-set .av-rules');
  assert.match(await page.textContent('#av-set'), /Strava.*WHOOP.*Météo/s);
  await page.click('#av-set .av-opt:not(.on)');
  assert.equal(await page.evaluate(() => state._autoval), 'off');
  assert.deepEqual(errors, []);
  await ctx.close();
});


test('thème sombre : fonds sombres, textes clairs, en-tête coloré et coches intacts ; clair par défaut inchangé', async () => {
  assert.ok(savedDb, 'dépend du premier test');
  const lum = (c) => { const m = c.match(/\d+(\.\d+)?/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
  let o = await open('2026-11-03T15:00:00+01:00', savedDb, { init: () => { localStorage.setItem('pm_theme', 'dark'); } });
  let page = o.page;
  await page.evaluate(() => showScreen('home')); await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  const C = await page.evaluate(() => { const g = (sel, p) => { const e = document.querySelector(sel); return e ? getComputedStyle(e)[p] : null; };
    return { body: g('body', 'backgroundColor'), card: g('#home-next-card .hn-card', 'backgroundColor'), title: g('#home-next-card .hn-t', 'color'), head: g('#sc-home > div', 'backgroundImage') }; });
  assert.ok(lum(C.body) < 0.2, 'page sombre ' + C.body);
  if (C.card) { assert.ok(lum(C.card) < 0.25, 'carte sombre ' + C.card); assert.ok(lum(C.title) > 0.7, 'titre clair ' + C.title); }
  assert.match(C.head, /linear-gradient/, 'en-tête en dégradé gardé');
  // contraste : texte du Compte lisible
  await page.evaluate(() => showScreen('compte')); await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => { const r = document.querySelector('.cp-row b'); return r && getComputedStyle(r).color; }).then((c) => lum(c) > 0.7));
  // coche cochée de « MAJ le plan » : reste bleue avec la coche blanche
  await page.evaluate(() => { showScreen('plan'); openPlanReview(); });
  await page.waitForFunction(() => typeof _prReview !== 'undefined' && _prReview && document.querySelector('#pr-content .pr-card, #pr-content .pr-top'), null, { timeout: 15000 });
  const tick = await page.evaluate(() => { const t = document.querySelector('.pr-tick[aria-pressed=true]'); return t ? getComputedStyle(t).backgroundColor : null; });
  if (tick) assert.match(tick, /rgb\(27, 79, 216\)/, 'coche bleue');
  // réglage
  await page.evaluate(() => { closePlanReview(); themeOpen(); });
  assert.equal(await page.locator('#th-set .th-opt').count(), 3);
  assert.deepEqual(o.errors, []);
  await o.ctx.close();
  // clair par défaut : couleurs d'origine
  o = await open('2026-11-03T15:00:00+01:00', savedDb); page = o.page;
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(237, 242, 251)');
  assert.equal(await page.locator('style[data-th]').count(), 0, 'aucune règle sombre en mode clair');
  await o.ctx.close();
});

test('rapidité et solidité : poids du bundle, démarrage mesuré, aucun débordement (clair et sombre), diagnostic', async () => {
  assert.ok(savedDb, 'dépend du premier test');
  // poids : budget du bundle de démarrage (gzip)
  const zlib = require('zlib');
  const bundle = fs.readdirSync(path.join(DIST, 'src')).find((f) => /^bundle-\d+\.js$/.test(f));
  const gz = zlib.gzipSync(fs.readFileSync(path.join(DIST, 'src', bundle))).length;
  assert.ok(gz < 440 * 1024, 'bundle ' + Math.round(gz / 1024) + ' Ko gzip (budget 440 Ko)');
  for (const theme of ['light', 'dark']) {
    const { ctx, page, errors } = await open('2026-11-03T15:00:00+01:00', savedDb, { init: (t) => { localStorage.setItem('pm_theme', t); }, initArg: theme });
    // démarrage mesuré jusqu'au 1er affichage de l'accueil
    const boot = await page.evaluate(() => window._bootMs);
    assert.ok(boot > 0 && boot < 8000, 'démarrage ' + boot + ' ms');
    // aucun débordement horizontal sur les écrans principaux
    const over = async (name) => page.evaluate((n) => {
      const W = window.innerWidth, bad = [];
      if (document.documentElement.scrollWidth > W + 1) bad.push(n + ' : page ' + document.documentElement.scrollWidth);
      document.querySelectorAll('#sc-' + n + ' *').forEach((e) => {
        if (!e.offsetParent || e.closest('[style*="overflow-x"],[style*="overflow:auto"],[style*="overflow:hidden"],.pr-strip,.lv-scroll,svg')) return;
        const r = e.getBoundingClientRect(); if (r.width && r.right > W + 1) bad.push(n + ' : ' + (e.id || e.className || e.tagName) + ' → ' + Math.round(r.right));
      });
      return bad.slice(0, 5);
    }, name);
    for (const sc of ['home', 'plan', 'stats', 'compte']) {
      await page.evaluate((n) => showScreen(n), sc); await page.waitForTimeout(350);
      assert.deepEqual(await over(sc), [], theme + ' / ' + sc);
    }
    // Diagnostic : démarrage enregistré, une erreur journalisée une seule fois avec son compteur
    await page.evaluate(() => { diagLog('test erreur', 'x.js:1'); diagLog('test erreur', 'x.js:1'); diagOpen(); });
    await page.waitForSelector('#dg-modal .dg-tiles');
    assert.match(await page.textContent('#dg-modal'), /démarrage.*test erreur.*×2/s);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});


test('bouton « 🏁 J\'ai fini » : recherche Strava + WHOOP + météo, état de chaque source, puis ressenti', async () => {
  assert.ok(savedDb, 'dépend du premier test');
  const D = JSON.parse(savedDb), S = D.users.ADMINUID.state;
  S.whoop_token = { access_token: 'x', refresh_token: 'y', expires_at: 9999999999 };
  let calls = 0;
  const { ctx, page, errors } = await open('2026-11-03T15:00:00+01:00', JSON.stringify(D), { functions: (r) => {
    if (/autoValidateNow/.test(r.request().url())) {
      calls++;
      const body = calls === 1 ? { success: true, out: [] }
        : { success: true, out: [{ st: 'ok', key: 'extra_w2_s0', title: 'Footing EF', km: 8.1, pace: '5:43', temp: 12.4, strain: 9.4, date: '2026-11-03' }] };
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    }
    return r.fulfill({ contentType: 'application/json', body: '{"success":true}' });
  } });
  await page.evaluate(() => showScreen('home'));
  await page.waitForSelector('#home-next-card .hn-fin');
  await page.click('#home-next-card .hn-fin');
  // 1er essai : la sortie n'est pas encore sur Strava → nouvel essai programmé
  await page.waitForSelector('#av-fin .av-msg');
  assert.match(await page.textContent('#av-fin'), /pas encore sur Strava.*Nouvel essai dans/s);
  // essai suivant (accéléré) : validée, les 3 sources cochées
  await page.evaluate(() => _avFinRun());
  await page.waitForSelector('#av-fin .av-msg.ok');
  assert.equal(await page.locator('#av-fin .av-src.ok').count(), 3);
  assert.match(await page.textContent('#av-fin'), /Footing EF validée.*Mon ressenti|Footing EF validée.*Fermer/s);
  assert.equal(calls, 2);
  await page.evaluate(() => avFinishClose());
  assert.deepEqual(errors, []);
  await ctx.close();
});
