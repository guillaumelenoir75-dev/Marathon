const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT; fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => { const s = a.join(' '); console.log(s); fs.appendFileSync(OUT + '/log.txt', s + '\n'); };
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speaking: false, pending: false, cancel(){}, getVoices(){ return []; }, speak(){} } });
    window.SpeechSynthesisUtterance = function(t){ this.text = t; };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition(ok){ window.__cb = ok; return 1; }, clearWatch(){}, getCurrentPosition(){} } });
    window.__pos = (lat, lon, sp, h) => window.__cb && window.__cb({ coords: { latitude: lat, longitude: lon, accuracy: 8, speed: sp, heading: h } });
  });
  const r = await p.goto('https://prepa-marathon.web.app/secours'); log('statut', r.status(), p.url());
  await p.waitForTimeout(5000);
  await p.screenshot({ path: OUT + '/1_page.png' });
  await p.locator('#race-map').scrollIntoViewIfNeeded(); await p.waitForTimeout(2500); await p.screenshot({ path: OUT + '/2_carte.png' });
  const D = await p.evaluate(() => SEC_DATA);
  await p.evaluate(() => SecoursNav.start());
  await p.evaluate(a => window.__pos(a[0], a[1], 0, null), D.points.house); await p.waitForTimeout(9000);
  log('maison', await p.evaluate(() => SecoursNav._state().phase + ' | ' + document.getElementById('rn-top').innerText.replace(/\n+/g, ' | ')));
  await p.screenshot({ path: OUT + '/3_gps_maison.png' });
  const L = D.routes.S.line;
  for (let i = 0; i < 40; i++) { const q = L[Math.min(i, L.length - 1)]; await p.evaluate(a => window.__pos(a[0], a[1], 13, null), q); await p.waitForTimeout(300); }
  await p.waitForTimeout(3000);
  log('voiture', await p.evaluate(() => SecoursNav._state().phase + ' | ' + document.getElementById('rn-top').innerText.replace(/\n+/g, ' | ')));
  await p.screenshot({ path: OUT + '/4_gps_voiture.png' });
  const pr = await p.goto('https://prepa-marathon.web.app/parcours'); log('parcours toujours en ligne :', pr.status());
  log('ERREURS', JSON.stringify(errs)); await b.close();
})();
