import { defineConfig } from 'vite';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { resolve } from 'path';

// Ordre de chargement exact des scripts classiques (dépendances respectées)
const scriptFiles = [
  'config.js', 'firebase.js', 'auth.js', 'onboarding.js',
  'plan-generate.js', 'plan-admin.js', 'plan-state.js', 'plan-predict.js',
  'weather.js', 'home-render.js', 'validation-feedback.js', 'validation-import.js',
  'validation-modals.js', 'plan-render.js', 'plan-edit.js', 'session-edit.js',
  'shoes.js', 'stats.js', 'coach-context.js', 'coach-plan-modif.js',
  'coach-memos.js', 'coach-ui.js', 'notifs.js',
];

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
      writeFileSync(resolve(distSrc, 'bundle.js'), code);

      // 3. Met à jour dist/index.html : 23 tags → 1 seul
      const htmlPath = resolve(process.cwd(), 'dist/index.html');
      let html = readFileSync(htmlPath, 'utf-8');
      let injected = false;
      html = html.replace(/<script defer src="\/src\/[^"]+\.js[^"]*"><\/script>\n?/g, () => {
        if (!injected) { injected = true; return '<script defer src="/src/bundle.js"></script>\n'; }
        return '';
      });
      writeFileSync(htmlPath, html);

      // 4. Supprime les 23 fichiers individuels du dist
      scriptFiles.forEach(f => { try { unlinkSync(resolve(distSrc, f)); } catch(e) {} });

      const sizeKb = Math.round(Buffer.byteLength(code) / 1024);
      console.log(`[bundle] bundle.js créé — ${sizeKb} Ko minifié (${scriptFiles.length} fichiers fusionnés)`);
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
