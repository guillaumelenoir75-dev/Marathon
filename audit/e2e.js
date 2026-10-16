const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.env.OUT || 'out';
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => { const s = a.join(' '); console.log(s); fs.appendFileSync(OUT + '/log.txt', s + '\n'); };
const R = 6371000, rad = Math.PI / 180;
const dist = (a, b) => { const dx = (b[1]-a[1]) * rad * R * Math.cos((a[0]+b[0])/2*rad), dy = (b[0]-a[0]) * rad * R; return Math.hypot(dx, dy); };
const brg = (a, b) => (Math.atan2((b[1]-a[1]) * Math.cos(a[0]*rad), b[0]-a[0]) / rad + 360) % 360;
function sample(line, step, from = 0){ const out = []; let acc = 0, next = from;
  for (let i = 1; i < line.length; i++){ const a = line[i-1], b = line[i], d = dist(a, b);
    while (d > 0 && acc + d >= next){ const f = (next - acc) / d; out.push([a[0] + (b[0]-a[0]) * f, a[1] + (b[1]-a[1]) * f, brg(a, b)]); next += step; }
    acc += d; }
  out.push([line[line.length-1][0], line[line.length-1][1], 0]); return out; }
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2 });
  const osrm = [];
  ctx.on('response', async r => { if (/project-osrm/.test(r.url())) { let j = null; try { j = await r.json(); } catch(e) {} osrm.push({ url: r.url(), status: r.status(), code: j && j.code, msg: j && j.message, dist: j && j.routes && j.routes[0] && Math.round(j.routes[0].distance), geom: j && j.routes && j.routes[0] && j.routes[0].geometry.coordinates.map(c => [c[1], c[0]]), steps: j && j.routes && j.routes[0] && j.routes[0].legs[0].steps.slice(0, 6).map(s => s.maneuver.type + '/' + (s.maneuver.modifier||'') + ' ' + (s.ref||'') + ' ' + (s.name||'') + (s.exits ? ' sortie ' + s.exits : '') + (s.destinations ? ' → ' + s.destinations : '')) }); } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.addInitScript(() => {
    window.__said = []; window.__cb = null;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speaking: false, pending: false, cancel(){}, getVoices(){ return []; }, speak(u){ window.__said.push(u.text); } } });
    window.SpeechSynthesisUtterance = function(t){ this.text = t; };
    const geo = { watchPosition(ok){ window.__cb = ok; return 1; }, clearWatch(){ window.__cb = null; }, getCurrentPosition(ok){ } };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: geo });
    window.__pos = function(lat, lon, speed, heading, acc){ if (window.__cb) window.__cb({ coords: { latitude: lat, longitude: lon, accuracy: acc || 10, speed: speed, heading: heading } }); };
  });
  await p.goto('http://127.0.0.1:8765/parcours.html'); await p.waitForTimeout(3000);
  const state = async () => p.evaluate(() => { const s = RaceNav._state(); const t = document.getElementById('rn-top'); return { phase: s && s.phase, route: s && s.route, top: t ? t.innerText.replace(/\n+/g, ' | ') : '', eta: (document.querySelector('.rn-eta')||{}).innerText || '' }; });
  const pos = async (q, speed, heading, acc) => { await p.evaluate(a => window.__pos(a[0], a[1], a[2], a[3], a[4]), [q[0], q[1], speed, heading, acc || 10]); };
  const waitIdle = async () => { for (let i = 0; i < 60; i++){ const busy = await p.evaluate(() => { const s = RaceNav._state(); return s && s.busy; }); if (!busy) return; await p.waitForTimeout(500); } };
  const NAV = await p.evaluate(() => NAV_DATA);
  let shot = 0;
  async function drive(name, dest, origin, opts = {}){
    log('\n==================== ' + name + ' → ' + dest);
    osrm.length = 0;
    await p.evaluate(() => { window.__said = []; });
    await p.evaluate(d => RaceNav.start(d), dest); await p.waitForTimeout(400);
    await pos(origin, 0, null, 15); await p.waitForTimeout(500); await waitIdle(); await p.waitForTimeout(400);
    let s = await state(); log('  départ :', s.phase, '|', s.top, '||', s.eta);
    osrm.forEach((o, i) => { log('  OSRM#' + i, o.status, o.code || '', o.msg || '', o.dist ? o.dist + ' m' : '', '| contrôle:', '?'); });
    for (const o of osrm) if (o.geom) { o.check = await p.evaluate(g => RaceNav._check(g), o.geom); log('    route', o.dist, 'm → contrôle fermeture :', o.check || 'OK', '| étapes:', (o.steps || []).join(' ; ')); }
    await p.screenshot({ path: OUT + '/' + (++shot) + '_' + name.replace(/\W+/g, '_') + '_depart.png' });
    if (opts.noDrive) { await p.evaluate(() => RaceNav.stop(true)); return; }
    // conduite : approche (4 derniers km) puis itinéraire sûr, puis marche
    let path = [];
    const st0 = await p.evaluate(() => { const s = RaceNav._state(); return s && s.appr ? { line: s.appr.line.pts, k: s.appr.t.k, s: s.appr.t.s } : null; });
    if (st0) { const L = st0.line; let tot = 0; for (let i = 1; i < L.length; i++) tot += dist(L[i-1], L[i]); path = path.concat(sample(L, 60, Math.max(0, tot - 4000))); }
    const key = st0 ? st0.k : opts.route;
    const RL = NAV.routes[key].line; const startS = st0 ? st0.s : (opts.fromS || 0);
    path = path.concat(sample(RL, 60, startS));
    let last = '', n = 0;
    for (const q of path) {
      await pos(q, 13, q[2]); n++;
      if (n % 3 === 0) await waitIdle();
      const s2 = await state();
      const sig = s2.phase + s2.top.split('|').slice(1).join('|');
      if (sig !== last) { log('   [' + n + '] ' + s2.phase + ' ' + (s2.route || '') + ' : ' + s2.top); last = sig; }
      if (opts.shotAt && n === opts.shotAt) await p.screenshot({ path: OUT + '/' + (++shot) + '_' + name.replace(/\W+/g, '_') + '_route.png' });
    }
    const W = NAV.walks[{10: '10', 20: '20', 30: '30'}[dest]].line;
    for (const q of sample(W, 15)) { await pos(q, 1.3, q[2], 8); const s2 = await state(); const sig = s2.phase + s2.top; if (sig !== last) { log('   [marche] ' + s2.phase + ' : ' + s2.top); last = sig; } }
    await p.screenshot({ path: OUT + '/' + (++shot) + '_' + name.replace(/\W+/g, '_') + '_arrivee.png' });
    log('  voix :', JSON.stringify(await p.evaluate(() => window.__said)));
    await p.evaluate(() => RaceNav.stop(true));
  }
  // 1) approches réelles depuis différentes villes (sans conduite)
  const origins = [ ['Paris', 10, [48.8566, 2.3522]], ['Évreux', 10, [49.0241, 1.1508]], ['Rouen', 30, [49.4432, 1.0999]], ['Louviers centre', 20, [49.2160, 1.1650]],
    ['Pont-de-l Arche', 20, [49.3036, 1.1553]], ['Le Vaudreuil', 30, [49.2540, 1.2090]], ['Incarville', 30, [49.2350, 1.1780]], ['Gaillon', 20, [49.1600, 1.3300]] ];
  for (const [n, d, o] of origins) await drive(n, d, o, { noDrive: true });
  // 2) conduites complètes
  await drive('Paris (approche simulée) jusqu au km 9,7', 10, [49.17, 1.42], { shotAt: 40 });
  await drive('Stationnement km 9,7 → km 20 (trajet B)', 20, NAV.routes.B.line[0], { route: 'B', shotAt: 30 });
  await drive('Stationnement km 20 → km 30 (trajet C)', 30, NAV.routes.C.line[0], { route: 'C', shotAt: 60 });
  await drive('A13 → km 20 direct (A2)', 20, NAV.routes.A2.line[0], { route: 'A2', fromS: 15000, shotAt: 50 });
  await drive('A13 → km 30 direct (A3)', 30, NAV.routes.A3.line[0], { route: 'A3', fromS: 22000, shotAt: 50 });
  // 3) contresens sur le trajet B puis sortie d'itinéraire sur C
  log('\n==================== contresens trajet B');
  await p.evaluate(() => { window.__said = []; RaceNav.start(20); }); osrm.length = 0;
  const B = sample(NAV.routes.B.line, 60);
  for (let i = 40; i < 60; i++) { await pos(B[i], 13, B[i][2]); } await waitIdle();
  for (let i = 59; i > 35; i--) { await pos(B[i], 13, (B[i][2] + 180) % 360); await waitIdle(); }
  let s3 = await state(); log('  après marche arrière :', s3.phase, s3.top); log('  voix :', JSON.stringify(await p.evaluate(() => window.__said))); log('  OSRM :', osrm.length, osrm.map(o => o.status + ' ' + (o.code||'')).join(', '));
  await p.evaluate(() => RaceNav.stop(true));
  log('\n==================== sortie d itinéraire trajet C');
  await p.evaluate(() => { window.__said = []; RaceNav.start(30); }); osrm.length = 0;
  const C = sample(NAV.routes.C.line, 60);
  for (let i = 0; i < 70; i++) await pos(C[i], 13, C[i][2]);
  const off = [C[70][0] + 0.004, C[70][1] - 0.004];
  for (let k = 0; k < 5; k++) { await pos([off[0] + k * 0.0003, off[1]], 13, 0); await p.waitForTimeout(200); }
  await waitIdle(); await p.waitForTimeout(500);
  s3 = await state(); log('  hors itinéraire :', s3.phase, s3.top); log('  voix :', JSON.stringify(await p.evaluate(() => window.__said)));
  for (const o of osrm) if (o.geom) { o.check = await p.evaluate(g => RaceNav._check(g), o.geom); log('    OSRM', o.status, o.code, o.dist, 'm → contrôle :', o.check || 'OK'); }
  await p.screenshot({ path: OUT + '/' + (++shot) + '_reroute.png' });
  log('\nERREURS JS :', JSON.stringify(errs));
  await b.close();
})();
