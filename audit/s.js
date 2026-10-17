const { chromium } = require('playwright'); const fs = require('fs');
const OUT = process.env.OUT; const log = (...a) => fs.appendFileSync(OUT + '/log.txt', a.join(' ') + '\n');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  let r = await p.goto('https://prepa-marathon.web.app/suivi-guillaume'); await p.waitForTimeout(7000);
  log('suivi-guillaume HTTP', r.status(), '|', await p.evaluate(() => ['pill', 'status-line', 'v-dist', 'v-eta'].map(i => document.getElementById(i).textContent).join(' | ')));
  await p.screenshot({ path: OUT + '/suivi.png', fullPage: true });
  r = await p.goto('https://prepa-marathon.web.app/suivi-admin'); await p.waitForTimeout(5000);
  log('suivi-admin HTTP', r.status(), '| formulaire de connexion affiché :', await p.evaluate(() => !document.getElementById('login').hidden), '| panneau caché :', await p.evaluate(() => document.getElementById('panel').hidden));
  log('erreurs JS', JSON.stringify(errs)); await b.close();
})();
