const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT; fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => { const s = a.join(' '); console.log(s); fs.appendFileSync(OUT + '/log.txt', s + '\n'); };
const R = 6371000, rad = Math.PI / 180, dist = (a, b) => Math.hypot((b[1]-a[1])*rad*R*Math.cos(a[0]*rad), (b[0]-a[0])*rad*R);
const brg = (a, b) => (Math.atan2((b[1]-a[1])*Math.cos(a[0]*rad), b[0]-a[0]) / rad + 360) % 360;
function sample(line, step){ const out = []; let acc = 0, next = 0; for (let i = 1; i < line.length; i++){ const a = line[i-1], b = line[i], d = dist(a, b); while (d > 0 && acc + d >= next){ const f = (next - acc) / d; out.push([a[0]+(b[0]-a[0])*f, a[1]+(b[1]-a[1])*f, brg(a, b)]); next += step; } acc += d; } out.push([...line[line.length-1], 0]); return out; }
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => {
    window.__said = [];
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speaking: false, pending: false, cancel(){}, getVoices(){ return []; }, speak(u){ window.__said.push(u.text); } } });
    window.SpeechSynthesisUtterance = function(t){ this.text = t; };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition(ok){ window.__cb = ok; return 1; }, clearWatch(){}, getCurrentPosition(){} } });
    window.__pos = (a) => window.__cb && window.__cb({ coords: { latitude: a[0], longitude: a[1], accuracy: 10, speed: a[2], heading: a[3] } });
  });
  async function scenario(page, NAVN, DATAN, start, label, origin, lines, walk){
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    let osrm = 0; p.on('request', r => { if (/project-osrm/.test(r.url())) osrm++; });
    const r = await p.goto('https://prepa-marathon.web.app/' + page); await p.waitForTimeout(4500);
    const S = () => p.evaluate(n => { const s = eval(n)._state(); const t = document.getElementById('rn-top'); return s.phase + ' ' + (s.route || '') + ' | ' + (t ? t.innerText.replace(/\n+/g, ' | ') : ''); }, NAVN);
    const pos = (q, sp, h) => p.evaluate(a => window.__pos(a), [q[0], q[1], sp, h === undefined ? null : h]);
    const D = await p.evaluate(n => eval(n), DATAN);
    await p.evaluate(s => eval(s), start); await p.waitForTimeout(300);
    await pos(origin, 0); await p.waitForTimeout(origin[2] ? 6000 : 1500);
    log('\n== ' + label + ' (HTTP ' + r.status() + ')'); log('  départ :', await S());
    let path = [];
    const AP = await p.evaluate(n => { const s = eval(n)._state(); return s.appr ? s.appr.line.pts : null; }, NAVN);
    if (AP){ log('  approche libre', Math.round(AP.reduce((a, q, i) => i ? a + dist(AP[i-1], q) : 0, 0)), 'm, contrôle :', await p.evaluate(([n, g]) => eval(n)._check(g) || 'OK', [NAVN, AP])); path = sample(AP, 1500); }
    for (const k of lines) path = path.concat(sample(D.routes[k].line, 150));
    let last = '', phases = new Set(), off = 0;
    for (const q of path){ await pos(q, 30, q[2]); await p.waitForTimeout(25); const s = await S(); phases.add(s.split(' ')[0]); if (/Itinéraire quitté|pas sur un trajet/.test(s)) off++; const sig = s.replace(/[\d,]+ (m|km)/g, ''); if (sig !== last){ last = sig; } }
    if (walk) for (const q of sample(D.walks[walk].line, 12)){ await pos(q, 1.3, q[2]); await p.waitForTimeout(25); }
    log('  fin :', await S()); log('  phases :', [...phases].join(','), '| alertes hors trajet pendant la conduite :', off, '| requêtes itinéraire en ligne :', osrm);
    log('  annonces vocales :', (await p.evaluate(() => window.__said.length)), '| erreurs JS :', JSON.stringify(errs));
    await p.close();
  }
  const P13 = [48.8323, 2.3600, 1];
  await scenario('parcours', 'RaceNav', 'NAV_DATA', 'RaceNav.start(10)', '/parcours · Paris 13e → km 10', P13, ['A'], '10');
  await scenario('parcours', 'RaceNav', 'NAV_DATA', 'RaceNav.start(20)', '/parcours · Paris 13e → km 20', P13, ['A2'], '20');
  await scenario('parcours', 'RaceNav', 'NAV_DATA', 'RaceNav.start(30)', '/parcours · Paris 13e → km 30', P13, ['A3'], '30');
  await scenario('parcours', 'RaceNav', 'NAV_DATA', 'RaceNav.start(20)', '/parcours · km 10 → km 20', [49.20633, 1.18227], ['B'], '20');
  await scenario('parcours', 'RaceNav', 'NAV_DATA', 'RaceNav.start(30)', '/parcours · km 20 → km 30', [49.240913, 1.19644], ['C'], '30');
  await scenario('secours', 'SecoursNav', 'SEC_DATA', 'SecoursNav.start()', '/secours · maison → km 10', [49.27160, 1.25909], ['S'], 'end');
  await scenario('trajet-amis', 'AmisNav', 'AMIS_DATA', 'AmisNav.start()', '/trajet-amis · Paris 13e → maison', P13, ['A3'], '30');
  await scenario('trajet-amis', 'AmisNav', 'AMIS_DATA', 'AmisNav.start()', '/trajet-amis · Versailles → maison', [48.8049, 2.1204, 1], ['A3'], '30');
  await b.close();
})();
