const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT; fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => { const s = a.join(' '); console.log(s); fs.appendFileSync(OUT + '/log.txt', s + '\n'); };
const R = 6371000, rad = Math.PI / 180, dist = (a, b) => Math.hypot((b[1]-a[1])*rad*R*Math.cos(a[0]*rad), (b[0]-a[0])*rad*R);
const brg = (a, b) => (Math.atan2((b[1]-a[1])*Math.cos(a[0]*rad), b[0]-a[0]) / rad + 360) % 360;
function sample(line, step){ const out = []; let acc = 0, next = 0; for (let i = 1; i < line.length; i++){ const a = line[i-1], b = line[i], d = dist(a, b); while (d > 0 && acc + d >= next){ const f = (next - acc) / d; out.push([a[0]+(b[0]-a[0])*f, a[1]+(b[1]-a[1])*f, brg(a, b), next]); next += step; } acc += d; } out.push([...line[line.length-1], 0, acc]); return out; }
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.__said = [];
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speaking: false, pending: false, cancel(){}, getVoices(){ return []; }, speak(u){ window.__said.push(u.text); } } });
    window.SpeechSynthesisUtterance = function(t){ this.text = t; };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition(ok){ window.__cb = ok; return 1; }, clearWatch(){}, getCurrentPosition(){} } });
    window.__pos = (a) => window.__cb && window.__cb({ coords: { latitude: a[0], longitude: a[1], accuracy: 10, speed: a[2], heading: a[3] } });
  });
  const r = await p.goto('https://prepa-marathon.web.app/trajet-amis'); log('statut', r.status()); await p.waitForTimeout(5000);
  await p.screenshot({ path: OUT + '/1_page.png' });
  await p.locator('#race-map').scrollIntoViewIfNeeded(); await p.waitForTimeout(2500); await p.screenshot({ path: OUT + '/2_carte.png' });
  const D = await p.evaluate(() => AMIS_DATA);
  const S = () => p.evaluate(() => { const s = AmisNav._state(); const t = document.getElementById('rn-top'); return s.phase + ' ' + (s.route || '') + ' | ' + (t ? t.innerText.replace(/\n+/g, ' | ') : ''); });
  const pos = (q, sp, h) => p.evaluate(a => window.__pos(a), [q[0], q[1], sp, h === undefined ? null : h]);
  await p.evaluate(() => AmisNav.start()); await pos([48.8323, 2.3600], 0); await p.waitForTimeout(6000);
  log('Paris 13e :', await S());
  const AP = await p.evaluate(() => { const s = AmisNav._state(); return s.appr ? s.appr.line.pts : null; });
  if (AP){
    log('approche', Math.round(AP.reduce((a, q, i) => i ? a + dist(AP[i-1], q) : 0, 0)), 'm ; fin → début trajet bloqué :', Math.round(dist(AP[AP.length-1], D.routes.A3.line[0])), 'm ; contrôle :', await p.evaluate(g => AmisNav._check(g) || 'OK', AP));
    let last = '';
    const path = sample(AP, 700).concat(sample(D.routes.A3.line, 150));
    for (let i = 0; i < path.length; i++){ const q = path[i]; await pos(q, 30, q[2]); await p.waitForTimeout(40); const s = await S(); const sig = s.replace(/[\d,]+ (m|km)/g, ''); if (sig !== last){ log('   ', s); last = sig; } if (i === path.length - 12){ await p.waitForTimeout(2500); await p.screenshot({ path: OUT + '/3_gps_route_tournedos.png' }); } }
    for (const q of sample(D.walks['30'].line, 12)){ await pos(q, 1.3, q[2]); await p.waitForTimeout(40); const s = await S(); const sig = s.replace(/[\d,]+ (m|km)/g, ''); if (sig !== last){ log('   ', s); last = sig; } }
  }
  log('voix :', JSON.stringify(await p.evaluate(() => window.__said)));
  log('ERREURS', JSON.stringify(errs)); await b.close();
})();
