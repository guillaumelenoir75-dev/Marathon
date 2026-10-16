const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.env.OUT || 'out'; fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => { const s = a.join(' '); console.log(s); fs.appendFileSync(OUT + '/log.txt', s + '\n'); };
const R = 6371000, rad = Math.PI / 180;
const dist = (a, b) => { const dx = (b[1]-a[1]) * rad * R * Math.cos((a[0]+b[0])/2*rad), dy = (b[0]-a[0]) * rad * R; return Math.hypot(dx, dy); };
const brg = (a, b) => (Math.atan2((b[1]-a[1]) * Math.cos(a[0]*rad), b[0]-a[0]) / rad + 360) % 360;
function sample(line, step, from = 0){ const out = []; let acc = 0, next = from;
  for (let i = 1; i < line.length; i++){ const a = line[i-1], b = line[i], d = dist(a, b);
    while (d > 0 && acc + d >= next){ const f = (next - acc) / d; out.push([a[0] + (b[0]-a[0]) * f, a[1] + (b[1]-a[1]) * f, brg(a, b)]); next += step; }
    acc += d; }
  return out; }
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speaking: false, pending: false, cancel(){}, getVoices(){ return []; }, speak(){} } });
    window.SpeechSynthesisUtterance = function(t){ this.text = t; };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition(ok){ window.__cb = ok; return 1; }, clearWatch(){}, getCurrentPosition(){} } });
    window.__pos = (lat, lon, sp, h) => window.__cb && window.__cb({ coords: { latitude: lat, longitude: lon, accuracy: 8, speed: sp, heading: h } });
  });
  await p.goto('http://127.0.0.1:8765/parcours.html'); await p.waitForTimeout(3000);
  const NAV = await p.evaluate(() => NAV_DATA);
  const pos = q => p.evaluate(a => window.__pos(a[0], a[1], a[2], a[3]), q);
  const idle = async () => { for (let i = 0; i < 40; i++){ const ok = await p.evaluate(() => { const s = RaceNav._state(); return !s || !s.gl || (s.glReady && s.gl.areTilesLoaded()); }); if (ok) break; await p.waitForTimeout(250); } await p.waitForTimeout(600); };
  const info = () => p.evaluate(() => { const s = RaceNav._state(); const m = s && s.gl; return m ? { ready: s.glReady, src: Object.keys(m.getStyle().sources).join('+'), brg: Math.round(m.getBearing()), pitch: Math.round(m.getPitch()), zoom: +m.getZoom().toFixed(1) } : { gl: false }; });
  let n = 0;
  const shot = async (name) => { await idle(); log('  📸', name, JSON.stringify(await info())); await p.screenshot({ path: OUT + '/' + (++n) + '_' + name + '.png' }); };
  async function ride(dest, line, from, count, shots, speed = 13){
    await p.evaluate(d => RaceNav.start(d), dest);
    const pts = sample(line, speed, from);
    await pos([pts[0][0], pts[0][1], 0, null]); await p.waitForTimeout(4000);
    for (let i = 1; i < Math.min(count, pts.length); i++){
      await pos([pts[i][0], pts[i][1], speed, pts[i][2]]);
      await p.waitForTimeout(shots[i] ? 1000 : 150);
      if (shots[i]) await shot(shots[i]);
    }
  }
  log('=== Trajet A (A13 → km 9,7)');
  await ride(10, NAV.routes.A.line, 14000, 400, { 8: 'A_autoroute', 120: 'A_sortie', 260: 'A_ville' }, 25);
  await p.click('.rn-over'); await p.waitForTimeout(1200); await shot('A_vue_ensemble');
  await p.click('.rn-recenter'); await p.waitForTimeout(1200); await shot('A_recentre');
  await p.evaluate(() => RaceNav.stop(true));
  log('=== Trajet B (km 9,7 → km 20)');
  await ride(20, NAV.routes.B.line, 300, 200, { 30: 'B_rondpoint', 150: 'B_campagne' });
  await p.evaluate(() => RaceNav.stop(true));
  log('=== Marche km 30');
  await p.evaluate(() => RaceNav.start(30));
  const C = NAV.routes.C.line; const cEnd = C[C.length - 1];
  await pos([cEnd[0], cEnd[1], 0, null]); await p.waitForTimeout(4000);
  await p.click('.rn-parked').catch(() => {}); await p.evaluate(() => { const s = RaceNav._state(); if (s && s.phase !== 'walk') document.querySelector('.rn-parked').click(); });
  const Wk = sample(NAV.walks['30'].line, 1.4);
  for (let i = 0; i < Math.min(160, Wk.length); i++){ await pos([Wk[i][0], Wk[i][1], 1.4, Wk[i][2]]); await p.waitForTimeout(60); }
  await p.waitForTimeout(1000); await shot('marche_30');
  await p.evaluate(() => RaceNav.stop(true));
  log('=== Approche réelle Pont-de-l Arche → km 20');
  await p.evaluate(() => RaceNav.start(20)); await pos([49.3036, 1.1553, 0, null]); await p.waitForTimeout(9000); await shot('approche_depart');
  log('ERREURS JS :', JSON.stringify(errs.filter(e => !/404/.test(e))));
  await b.close();
})();
