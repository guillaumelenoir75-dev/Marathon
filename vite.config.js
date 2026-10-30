import { defineConfig } from 'vite';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { resolve } from 'path';

// Ordre de chargement exact des scripts classiques (dépendances respectées)
const scriptFiles = [
  'config.js', 'firebase.js', 'sync.js', 'auth.js', 'onboarding.js',
  'plan-generate.js', 'plan-admin.js', 'race-live.js', 'plan-state.js', 'plan-predict.js',
  'weather.js', 'home-render.js', 'validation-feedback.js', 'validation-import.js',
  'validation-modals.js', 'plan-render.js', 'plan-edit.js', 'session-edit.js',
  'shoes.js', 'stats.js', 'coach-context.js', 'coach-plan-modif.js',
  'coach-memos.js', 'coach-ui.js', 'notifs.js', 'whoop.js', 'preps.js', 'plan-review.js', 'plan-optim.js', 'plan-daily.js', 'prep-debrief.js',
  'body-signals.js', 'journal.js', 'week-share.js', 'quick-validate.js', 'fitness-model.js', 'autopilot.js', 'race-analysis.js', 'next-race.js', 'plan-chat.js',
];

// Écrans rares chargés à la demande (lazyLoad dans config.js) : un fichier minifié par groupe, nom unique par version
const lazyGroups = {
  course: ['race-nav-data.js', 'race-nav.js', 'race-map.js'],   // carte « Organisation course »
  progress: ['prep-progress.js'],                              // Mes prépas › Comparer mes prépas
  whatif: ['plan-whatif.js'],                                  // MAJ le plan › Et si… ?
};

// Conservés aussi en fichier séparé : chargés seuls par la page publique /parcours
const keepFiles = ['race-map.js', 'race-nav-data.js', 'race-nav.js'];

function bundleClassicScripts() {
  return {
    name: 'bundle-classic-scripts',
    async closeBundle() {
      const distSrc = resolve(process.cwd(), 'dist/src');

      // 1. Concatène les 23 fichiers dans l'ordre
      const combined = scriptFiles.map(f => {
        try { return readFileSync(resolve(distSrc, f), 'utf-8'); }
        catch(e) { console.warn(`[bundle] fichier manquant : ${f}`); return ''; }
      }).join('\n');

      // 2. Minifie avec esbuild (inclus dans Vite)
      const { transform } = await import('esbuild');
      const { code } = await transform(combined, { minify: true, target: 'es2020' });
      const buildTs = Date.now();
      const bundleName = `bundle-${buildTs}.js`;
      writeFileSync(resolve(distSrc, bundleName), code);

      // 2b. Écrans rares : un bundle minifié par groupe, chargé à la demande
      const lazyMap = {};
      for (const [g, files] of Object.entries(lazyGroups)) {
        const src = files.map(f => readFileSync(resolve(distSrc, f), 'utf-8')).join('\n');
        const { code: lc } = await transform(src, { minify: true, target: 'es2020' });
        const name = `lazy-${g}-${buildTs}.js`;
        writeFileSync(resolve(distSrc, name), lc); lazyMap[g] = '/src/' + name;
        files.filter(f => !keepFiles.includes(f)).forEach(f => { try { unlinkSync(resolve(distSrc, f)); } catch(e) {} });
        console.log(`[bundle] ${name} — ${Math.round(Buffer.byteLength(lc) / 1024)} Ko (à la demande)`);
      }

      // 3. Met à jour dist/index.html : 23 tags → 1 seul (+ adresses des bundles à la demande)
      const htmlPath = resolve(process.cwd(), 'dist/index.html');
      let html = readFileSync(htmlPath, 'utf-8');
      let injected = false;
      html = html.replace(/<script defer src="\/src\/[^"]+\.js[^"]*"><\/script>\n?/g, () => {
        if (!injected) { injected = true; return `<script>window.LAZY_BUNDLES=${JSON.stringify(lazyMap)};</script>\n<script defer src="/src/${bundleName}"></script>\n`; }
        return '';
      });
      writeFileSync(htmlPath, html);

      // 4. Supprime les fichiers individuels du dist (sauf keepFiles)
      scriptFiles.filter(f => !keepFiles.includes(f)).forEach(f => { try { unlinkSync(resolve(distSrc, f)); } catch(e) {} });

      const sizeKb = Math.round(Buffer.byteLength(code) / 1024);
      console.log(`[bundle] ${bundleName} créé — ${sizeKb} Ko minifié (${scriptFiles.length} fichiers fusionnés)`);
    },
  };
}

export default defineConfig({
  root: 'public',
  // public-static/ est copié tel quel dans dist/ sans hashing (manifest, SW, icônes)
  publicDir: '../public-static',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
  plugins: [bundleClassicScripts()],
});
