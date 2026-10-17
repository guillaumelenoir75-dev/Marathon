const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT; fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => { const s = a.join(' '); console.log(s); fs.appendFileSync(OUT + '/log.txt', s + '\n'); };
const R = 6371000, rad = Math.PI / 180, dist = (a, b) => Math.hypot((b[1]-a[1])*rad*R*Math.cos(a[0]*rad), (b[0]-a[0])*rad*R);
const brg = (a, b) => (Math.atan2((b[1]-a[1])*Math.cos(a[0]*rad), b[0]-a[0]) / rad + 360) % 360;
function sample(line, step){ const out = []; let acc = 0, next = 0; for (let i = 1; i < line.length; i++){ const a = line[i-1], b = line[i], d = dist(a, b); while (d > 0 && acc + d >= next){ const f = (next - acc) / d; out.push([a[0]+(b[0]-a[0])*f, a[1]+(b[1]-a[1])*f, brg(a, b), next]); next += step; } acc += d; } out.push([...line[line.length-1], 0, acc]); return out; }
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  let osrm = []; ctx.on('response', r => { if (/project-osrm/.test(r.url())) osrm.push(r.status()); });
  let offline = false;
  await p.route(/project-osrm/, r => offline ? r.abort() : r.continue());
  await p.addInitScript(() => {
    window.__said = [];
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speaking: false, pending: false, cancel(){}, getVoices(){ return []; }, speak(u){ window.__said.push(u.text); } } });
    window.SpeechSynthesisUtterance = function(t){ this.text = t; };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition(ok){ window.__cb = ok; return 1; }, clearWatch(){}, getCurrentPosition(){} } });
    window.__pos = (a) => window.__cb && window.__cb({ coords: { latitude: a[0], longitude: a[1], accuracy: 10, speed: a[2], heading: a[3] } });
  });
  await p.goto('https://prepa-marathon.web.app/parcours'); await p.waitForTimeout(4000);
  log('version race-nav :', await p.evaluate(() => [...document.scripts].map(s => s.src).filter(s => /race-nav\.js/.test(s)).join()));
  const N = await p.evaluate(() => NAV_DATA);
  const pos = (q, sp, h) => p.evaluate(a => window.__pos(a), [q[0], q[1], sp, h === undefined ? null : h]);
  const S = () => p.evaluate(() => { const s = RaceNav._state(); const t = document.getElementById('rn-top'); return { ph: s && s.phase, r: s && s.route, top: t ? t.innerText.replace(/\n+/g, ' | ') : '', eta: (document.querySelector('.rn-eta') || {}).innerText?.replace(/\n/g, ' / ') || '', appr: s && s.appr ? Math.round(s.appr.line.len) : null }; });
  const waitIdle = async () => { for (let i = 0; i < 40; i++){ const busy = await p.evaluate(() => { const s = RaceNav._state(); return s && s.busy; }); if (!busy) return; await p.waitForTimeout(400); } };
  let shot = 0;
  async function run(name, dest, origin, opts = {}){
    log('\n==================== ' + name + ' → km ' + dest);
    osrm = []; await p.evaluate(d => { RaceNav.stop(true); window.__said = []; RaceNav.start(d); }, dest); await p.waitForTimeout(400);
    await pos(origin, 0); await p.waitForTimeout(1500); await waitIdle(); await p.waitForTimeout(800);
    let s = await S(); log('  départ :', s.ph, '|', s.top, '|| approche', s.appr, 'm | OSRM', osrm.join(','));
    if (s.ph !== 'approach'){ log('  ⚠ pas d\'itinéraire libre'); return; }
    const AP = await p.evaluate(() => RaceNav._state().appr.line.pts);
    const k = await p.evaluate(() => RaceNav._state().appr.t.k);
    const A0 = N.routes[k].line[0];
    log('  fin de l\'approche → début du trajet bloqué', k, ':', Math.round(dist(AP[AP.length - 1], A0)), 'm ; contrôle fermetures :', await p.evaluate(g => RaceNav._check(g) || 'OK', AP));
    // routes empruntées dans les 6 derniers km de l'approche (A13 ?)
    const tail = AP.slice(-80); log('  derniers points approche', JSON.stringify(tail.slice(-3).map(q => q.map(v => +v.toFixed(5)))));
    const total = AP.reduce((a, q, i) => i ? a + dist(AP[i-1], q) : 0, 0);
    let path = sample(AP, 500).filter(q => q[3] < total - 4000).concat(sample(AP, 40).filter(q => q[3] >= total - 4000));
    if (opts.detour){ path = path.slice(0, opts.detour); }
    let last = '';
    for (let i = 0; i < path.length; i++){
      const q = path[i]; await pos(q, 30, q[2]); await p.waitForTimeout(q[3] >= total - 4000 ? 250 : 60);
      if (i % 5 === 0) await waitIdle();
      s = await S(); const sig = s.ph + '|' + s.top.replace(/[\d,]+ (m|km)/g, '');
      if (sig !== last){ log('   [' + Math.round(q[3]/100)/10 + ' km] ' + s.ph + ' ' + (s.r || '') + ' : ' + s.top); last = sig; }
      if (q[3] >= total - 300 && !opts.shotBefore){ opts.shotBefore = 1; await p.waitForTimeout(1200); await p.screenshot({ path: OUT + '/' + (++shot) + '_' + name.replace(/\W+/g, '_') + '_avant_Flins.png' }); log('   📸 avant Flins :', JSON.stringify(await S())); }
    }
    if (opts.detour){
      const q = path[path.length - 1]; const off = [q[0] + 0.006, q[1] + 0.006];
      for (let k2 = 0; k2 < 5; k2++){ await pos([off[0] + k2 * 0.0003, off[1]], 13, 0); await p.waitForTimeout(1500); }
      await waitIdle(); await p.waitForTimeout(1500); s = await S(); log('  erreur avant Flins :', s.ph, '|', s.top, '| OSRM', osrm.join(','));
      log('  voix :', JSON.stringify(await p.evaluate(() => window.__said))); return;
    }
    // trajet bloqué : 4 km puis sortie volontaire
    const RL = sample(N.routes[k].line, 40);
    for (let i = 0; i < 100; i++){ const q = RL[i]; await pos(q, 30, q[2]); await p.waitForTimeout(150); s = await S(); const sig = s.ph + '|' + s.top.replace(/[\d,]+ (m|km)/g, ''); if (sig !== last){ log('   [bloqué +' + Math.round(q[3]) + ' m] ' + s.ph + ' ' + (s.r || '') + ' : ' + s.top); last = sig; } if (i === 12){ await p.waitForTimeout(1200); await p.screenshot({ path: OUT + '/' + (++shot) + '_' + name.replace(/\W+/g, '_') + '_apres_Flins.png' }); log('   📸 après Flins :', JSON.stringify(await S())); } }
    const n0 = osrm.length; const q = RL[100]; const off = [q[0] + 0.006, q[1]];
    for (let k2 = 0; k2 < 5; k2++){ await pos([off[0] + k2 * 0.0003, off[1]], 25, 0); await p.waitForTimeout(1500); }
    await p.waitForTimeout(2000); s = await S(); log('  erreur après Flins :', s.ph, '|', s.top, '| nouvelles requêtes OSRM :', osrm.length - n0);
    log('  voix :', JSON.stringify(await p.evaluate(() => window.__said)));
  }
  await run('Paris 13e', 10, [48.8323, 2.3600]);
  await run('Paris 16e', 20, [48.8530, 2.2640]);
  await run('Versailles', 30, [48.8049, 2.1204]);
  await run('Cergy', 10, [49.0364, 2.0761]);
  await run('Paris 13e erreur avant Flins', 10, [48.8323, 2.3600], { detour: 25 });
  offline = true; await run('Paris sans réseau', 10, [48.8323, 2.3600]); offline = false;
  await run('Louviers (zone de course)', 20, [49.2160, 1.1650]);
  log('\nERREURS JS :', JSON.stringify(errs)); await b.close();
})();
