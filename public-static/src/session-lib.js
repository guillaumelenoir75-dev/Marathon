// ─── Bibliothèque de séances « niveau pro » (moteur partagé app + serveur, ENGINE_FILES) ───────────────
// Une séance de la bibliothèque = un modèle (SL_LIB) + un palier (rung) + les allures du coureur (niveau VDOT, allure EF réelle).
// Elle est construite en étapes (échauffement, gammes, lignes droites, blocs, récupérations, retour au calme) avec allure,
// zone et FC pour chacune ; le texte enregistré dans le plan (titre|consigne) en est le résumé, l'écran « Détail de la séance »
// (session-lib-ui.js) la montre en entier. Rangées par effet recherché (stim) : seuil, vo2, vitesse, force, specifique,
// endurance, recup, test — et par phase de la préparation (base, dev, spec, taper).
// Séance enregistrée : x.lib = { id, r (palier), v (niveau utilisé), ef (allure EF utilisée, s/km), cat }.
const SL_V = 1;
const SL_STIM = { seuil: 'Seuil', vo2: 'VO₂max', vitesse: 'Vitesse', force: 'Force (côtes)', specifique: 'Spécifique course', endurance: 'Endurance', recup: 'Récupération', test: 'Test', mixte: 'Mixte' };
const SL_STIM_IC = { seuil: '🔥', vo2: '⚡', vitesse: '💨', force: '⛰️', specifique: '🎯', endurance: '🌿', recup: '🧘', test: '📏', mixte: '🎛️' };
const SL_RP = { '5 km': 'F5', '10 km': 'K10', 'Semi-marathon': 'H', 'Marathon': 'M' };
const SL_PLBL = { E: 'endurance', M: 'allure marathon', H: 'allure semi', K10: 'allure 10 km', F5: 'allure 5 km', T: 'seuil', Tc: 'seuil confortable', I: 'VO₂max', V: 'VMA', R: 'vitesse', FL: 'récup courue', S: 'sprint' };

// allures du coureur (s/km) d'après son niveau et son allure EF réelle : { clé: [rapide, lent] }
function slPaces(vdot, ef){
  if(!vdot || typeof paceAtPct !== 'function') return null;
  const at = function(p){ return Math.round(paceAtPct(vdot, p)); };
  const race = function(m){ return Math.round(raceTimeFromVdot(vdot, m) / (m / 1000)); };
  const rg = function(p, a, b){ return [p - a, p + b]; };
  const P = { M: rg(race(42195), 3, 4), H: rg(race(21097.5), 3, 3), K10: rg(race(10000), 3, 3), F5: rg(race(5000), 3, 3), T: rg(at(0.88), 3, 3), Tc: rg(at(0.88) + 6, 3, 4),
    I: rg(at(0.975), 3, 3), V: rg(at(1.0), 3, 3), R: rg(at(1.05), 3, 3), S: null };
  const e = ef && ef > 200 && ef < 600 ? ef : at(0.66);
  P.E = [e - 10, e + 15]; P.FL = rg(P.M[0] + 20, 5, 10); P.trot = e + 25;
  return P;
}
// zones FC (bpm) : zones appliquées de l'app, sinon d'après la FC max (saisie, déclarée, sinon 196)
function slHr(st){
  st = st || state;
  const z = st && st._hr_zones && st._hr_zones.zones && st._hr_zones.zones.length === 5 ? st._hr_zones.zones : null;
  const ef = typeof hrEfMax === 'function' ? hrEfMax(st) : 148;
  const mx = (typeof hrManualMax === 'function' && hrManualMax(st) ? hrManualMax(st).v : 0) || parseInt(st && st.fc_max) || parseInt(st && st.onboarding && st.onboarding.fc_max) || 196;
  if(z) return { E: [z[1].lo || ef - 12, ef], M: [z[2].lo, z[2].hi], H: [z[3].lo - 3, z[3].hi - 2], T: [z[3].lo, z[3].hi], Tc: [z[3].lo - 3, z[3].hi - 3], K10: [z[3].hi - 2, z[4].lo + 3], F5: [z[4].lo, (z[4].hi || mx) - 3], I: [z[4].lo, z[4].hi || mx], V: [z[4].lo, z[4].hi || mx], max: mx };
  const r = function(a, b){ return [Math.round(mx * a), Math.round(mx * b)]; };
  return { E: [Math.min(ef - 12, Math.round(mx * 0.68)), ef], M: r(0.80, 0.85), H: r(0.85, 0.89), T: r(0.87, 0.91), Tc: r(0.85, 0.89), K10: r(0.89, 0.93), F5: r(0.92, 0.96), I: r(0.93, 0.98), V: r(0.94, 0.99), max: mx };
}

// ─── étapes ─────────────────────────────────────────────────────────────────
// étape : { k: warm|drills|strides|work|float|rec|cool|steady|hill, n: libellé, d: mètres | s: secondes, p: clé d'allure | null, eff: effort (côtes, sensations) }
// groupe : { rep: N, steps: [...], gap: étape entre les séries (facultatif) }
const SL_DRILLS = 'Gammes : montées de genoux, talons-fesses, pas chassés, foulées bondissantes (2 × 20 m chacune)';
const sW = function(min){ return { k: 'warm', n: 'Échauffement', s: min * 60, p: 'E' }; };
const sC = function(min){ return { k: 'cool', n: 'Retour au calme', s: min * 60, p: 'E' }; };
const sDr = function(){ return { k: 'drills', n: 'Gammes', s: 300, p: null, eff: SL_DRILLS }; };
const sSt = function(n, m){ return { rep: n, steps: [{ k: 'strides', n: 'Ligne droite', d: m || 80, p: null, eff: 'progressive jusqu\'à ~90 %, relâchée' }, { k: 'rec', n: 'Retour en marchant', d: m || 80, p: null, eff: 'marche' }] }; };
const sWk = function(q, p, n){ return Object.assign({ k: 'work', n: n || 'Bloc', p: p }, q); };   // q = { d } ou { s }
const sRc = function(q, eff){ return Object.assign({ k: 'rec', n: 'Récup', p: 'trot', eff: eff || 'trot très lent' }, q); };
const sFl = function(q){ return Object.assign({ k: 'float', n: 'Récup courue', p: 'FL', eff: 'on ne s\'arrête pas' }, q); };
const sEf = function(q, n){ return Object.assign({ k: 'steady', n: n || 'Endurance', p: 'E' }, q); };
const sRep = function(n, steps, gap){ return { rep: n, steps: steps, gap: gap || null }; };
const SL_Q = function(main, o){ o = o || {}; return [sW(o.w || 20), sDr(), sSt(o.st || 3)].concat(main).concat([sC(o.c || 10)]); };
const slM = function(m){ return m >= 1000 && m % 1000 === 0 ? (m / 1000) + ' km' : m >= 5000 ? String(Math.round(m / 100) / 10).replace('.', ',') + ' km' : String(m).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' m'; };
const slT = function(s){ return s >= 60 ? (s % 60 ? Math.floor(s / 60) + ' min ' + (s % 60) : (s / 60) + ' min') : s + ' s'; };
const slQ = function(x){ return x.d ? slM(x.d) : slT(x.s); };

// ─── la bibliothèque ────────────────────────────────────────────────────────
// { id, n: nom, stim, type (tempo|frac|long|ef), ph: phases, lvl 1-3, hill, cats (distances où elle a du sens, toutes si absent),
//   (textes « pourquoi / comment / réussie si » dans SL_TXT, session-lib-ui.js), prog: paliers (paramètres), b(prm, ctx) → { t: titre court, main: étapes, o: options échauffement } }
const SL_LIB = [
  // ── Seuil
  { id: 'seuil-2k', n: 'Seuil en blocs de 2 km', stim: 'seuil', type: 'tempo', ph: ['dev', 'spec'], lvl: 1,
        prog: [[3, 2000, 60], [4, 2000, 60], [5, 2000, 60], [4, 2500, 75], [5, 2500, 75]], b: function(p){ return { t: p[0] + ' × ' + slM(p[1]) + ' au seuil', main: [sRep(p[0], [sWk({ d: p[1] }, 'T'), sRc({ s: p[2] })])] }; } },
  { id: 'seuil-1k', n: 'Seuil fractionné en 1 000 m', stim: 'seuil', type: 'tempo', ph: ['base', 'dev', 'spec'], lvl: 1,
        prog: [[6, 45], [8, 45], [10, 45], [12, 40]], b: function(p){ return { t: p[0] + ' × 1 000 m au seuil', main: [sRep(p[0], [sWk({ d: 1000 }, 'T'), sRc({ s: p[1] })])] }; } },
  { id: 'tempo-continu', n: 'Tempo continu', stim: 'seuil', type: 'tempo', ph: ['base', 'dev', 'spec'], lvl: 1,
        prog: [[15], [20], [25], [30]], b: function(p){ return { t: 'Tempo ' + p[0] + ' min', main: [sWk({ s: p[0] * 60 }, 'Tc', 'Tempo continu')] }; } },
  { id: 'over-under', n: 'Au-dessus / en dessous du seuil', stim: 'seuil', type: 'tempo', ph: ['dev', 'spec'], lvl: 2,
        prog: [[3, 4], [4, 4], [4, 6], [5, 6]], b: function(p){ const blk = []; for(let i = 0; i < p[1] / 2; i++) blk.push(sWk({ s: 60 }, 'K10', 'Au-dessus'), sWk({ s: 60 }, 'H', 'En dessous'));
      return { t: p[0] + ' × ' + p[1] + ' min au-dessus / en dessous', main: [sRep(p[0], blk.concat([sRc({ s: 120 })]))] }; } },
  { id: 'evacuation', n: 'Évacuation du lactate', stim: 'seuil', type: 'tempo', ph: ['dev', 'spec'], lvl: 2,
        prog: [[2], [3], [4]], b: function(p){ return { t: p[0] + ' × (3 min allure 5 km + 4 min allure semi)', main: [sRep(p[0], [sWk({ s: 180 }, 'F5', 'Bloc rapide'), sWk({ s: 240 }, 'H', 'Allure semi'), sRc({ s: 120 })])] }; } },
  { id: 'norvegien', n: 'Seuil norvégien', stim: 'seuil', type: 'tempo', ph: ['base', 'dev', 'spec'], lvl: 2,
        prog: [[4, 6], [5, 6], [6, 6], [5, 8], [4, 10]], b: function(p){ return { t: p[0] + ' × ' + p[1] + ' min seuil norvégien', main: [sRep(p[0], [sWk({ s: p[1] * 60 }, 'Tc'), sRc({ s: 60 }, 'marche ou trot')])] }; } },
  { id: 'seuil-escalier', n: 'Seuil en escalier', stim: 'seuil', type: 'tempo', ph: ['dev', 'spec'], lvl: 2,
        prog: [[6], [8], [10]], b: function(p){ return { t: '3 × ' + p[0] + ' min en accélérant', main: [sWk({ s: p[0] * 60 }, 'H', 'Bloc 1'), sRc({ s: 120 }), sWk({ s: p[0] * 60 }, 'T', 'Bloc 2'), sRc({ s: 120 }), sWk({ s: p[0] * 60 }, 'K10', 'Bloc 3')] }; } },
  { id: 'tempo-descente', n: 'Tempo en descente', stim: 'seuil', type: 'tempo', ph: ['dev', 'spec'], lvl: 2,
        prog: [[10, 8, 4], [15, 10, 5], [18, 12, 6]], b: function(p){ return { t: p[0] + '-' + p[1] + '-' + p[2] + ' min (semi → seuil → 10 km)', main: [sWk({ s: p[0] * 60 }, 'H', 'Allure semi'), sRc({ s: 120 }), sWk({ s: p[1] * 60 }, 'T', 'Seuil'), sRc({ s: 120 }), sWk({ s: p[2] * 60 }, 'K10', 'Allure 10 km')] }; } },
  // ── VO₂max
  { id: 'billat-3030', n: '30/30 Billat', stim: 'vo2', type: 'frac', ph: ['base', 'dev', 'spec'], lvl: 1,
        prog: [[2, 8], [2, 10], [2, 12], [3, 10]], b: function(p){ return { t: p[0] + ' × ' + p[1] + ' × 30/30', main: [sRep(p[0], [sRep(p[1], [sWk({ s: 30 }, 'V', '30 s vite'), sRc({ s: 30 }, 'trot lent, sans s\'arrêter')])], sRc({ s: 180 }, 'trot'))] }; } },
  { id: '4515', n: '45/15', stim: 'vo2', type: 'frac', ph: ['dev', 'spec'], lvl: 2,
        prog: [[2, 8], [2, 10], [3, 8]], b: function(p){ return { t: p[0] + ' × ' + p[1] + ' × 45/15', main: [sRep(p[0], [sRep(p[1], [sWk({ s: 45 }, 'I', '45 s vite'), sRc({ s: 15 }, 'trot')])], sRc({ s: 180 }, 'trot'))] }; } },
  { id: 'kenyan-400', n: '400 m à la kényane', stim: 'vo2', type: 'frac', ph: ['dev', 'spec'], lvl: 2,
        prog: [[10], [12], [15], [16]], b: function(p){ return { t: p[0] + ' × 400 m, récup 200 m courue', main: [sRep(p[0], [sWk({ d: 400 }, 'I'), sFl({ d: 200 })])] }; } },
  { id: 'pyramide', n: 'Pyramide 400 → 1 600 m', stim: 'vo2', type: 'frac', ph: ['dev', 'spec'], lvl: 2,
        prog: [[400, 800, 1200, 800, 400], [400, 800, 1200, 1600, 1200, 800, 400], [400, 800, 1200, 1600, 2000, 1200, 800, 400]],
    b: function(p){ const m = []; p.forEach(function(d, i){ m.push(sWk({ d: d }, d <= 400 ? 'V' : 'I')); if(i < p.length - 1) m.push(sRc({ s: Math.round(d * 0.18 / 10) * 10 })); }); return { t: 'Pyramide ' + p.map(function(d){ return d >= 1000 ? (d / 1000).toString().replace('.', ',') + 'k' : d; }).join('-'), main: m }; } },
  { id: 'michigan', n: 'Michigan', stim: 'vo2', type: 'frac', ph: ['spec'], lvl: 3,
        prog: [[[1200, 800, 400], 1000], [[1600, 1200, 800, 400], 1000], [[1600, 1200, 800, 400], 1600]],
    b: function(p){ const m = []; p[0].forEach(function(d, i){ m.push(sWk({ d: d }, d >= 1200 ? 'K10' : d >= 800 ? 'F5' : 'V')); if(i < p[0].length - 1){ m.push(sRc({ s: 120 })); m.push(sWk({ d: p[1] }, 'T', 'Seuil')); m.push(sRc({ s: 120 })); } });
      return { t: 'Michigan ' + p[0].join('-') + ' + seuil', main: m }; } },
  { id: 'degressif', n: 'Durées dégressives', stim: 'vo2', type: 'frac', ph: ['dev', 'spec'], lvl: 2,
        prog: [[[5, 4, 3, 2, 1]], [[6, 5, 4, 3, 2, 1]], [[4, 3, 2, 1, 4, 3, 2, 1]]], b: function(p){ const keys = { 6: 'K10', 5: 'K10', 4: 'F5', 3: 'F5', 2: 'I', 1: 'V' }; const m = [];
      p[0].forEach(function(mn, i){ m.push(sWk({ s: mn * 60 }, keys[mn])); if(i < p[0].length - 1) m.push(sRc({ s: mn >= 4 ? 120 : 90 })); }); return { t: p[0].join('-') + ' min dégressif', main: m }; } },
  { id: 'vo2-long', n: 'Fractions longues VO₂', stim: 'vo2', type: 'frac', ph: ['dev', 'spec'], lvl: 1,
        prog: [[5, 1000], [6, 1000], [5, 1200], [6, 1200], [4, 1600]], b: function(p){ return { t: p[0] + ' × ' + slM(p[1]) + ' VO₂', main: [sRep(p[0], [sWk({ d: p[1] }, 'I'), sRc({ s: Math.round(p[1] / 1000 * 200 / 30) * 30 })])] }; } },
  { id: 'echelle', n: 'Échelle 1-2-3-4-3-2-1', stim: 'vo2', type: 'frac', ph: ['base', 'dev'], lvl: 1,
        prog: [[[1, 2, 3, 2, 1]], [[1, 2, 3, 4, 3, 2, 1]], [[2, 3, 4, 5, 4, 3, 2]]], b: function(p){ const m = []; p[0].forEach(function(mn, i){ m.push(sWk({ s: mn * 60 }, 'I')); if(i < p[0].length - 1) m.push(sRc({ s: mn * 30 })); }); return { t: 'Échelle ' + p[0].join('-') + ' min', main: m }; } },
  { id: '321', n: '3-2-1', stim: 'vo2', type: 'frac', ph: ['dev', 'spec'], lvl: 2,
        prog: [[2], [3], [4]], b: function(p){ return { t: p[0] + ' × (3-2-1 min)', main: [sRep(p[0], [sWk({ s: 180 }, 'F5', '3 min'), sRc({ s: 90 }), sWk({ s: 120 }, 'I', '2 min'), sRc({ s: 90 }), sWk({ s: 60 }, 'V', '1 min'), sRc({ s: 120 })])] }; } },
  // ── Vitesse
  { id: '200-relache', n: '200 m relâchés', stim: 'vitesse', type: 'frac', ph: ['base', 'dev', 'taper'], lvl: 1,
        prog: [[8], [10], [12]], b: function(p){ return { t: p[0] + ' × 200 m relâchés', main: [sRep(p[0], [sWk({ d: 200 }, 'R'), sRc({ d: 200 }, 'trot ou marche')])] }; } },
  { id: '300-vite', n: '300 m vite', stim: 'vitesse', type: 'frac', ph: ['base', 'dev'], lvl: 2,
        prog: [[6], [8], [10]], b: function(p){ return { t: p[0] + ' × 300 m vite', main: [sRep(p[0], [sWk({ d: 300 }, 'R'), sRc({ d: 300 }, 'marche + trot')])] }; } },
  { id: 'vitesse-seuil', n: 'Vitesse puis seuil', stim: 'mixte', type: 'frac', ph: ['dev', 'spec'], lvl: 2,
        prog: [[4, 2, 1600], [6, 2, 2000], [6, 3, 2000]], b: function(p){ return { t: p[0] + ' × 200 m + ' + p[1] + ' × ' + slM(p[2]) + ' seuil', main: [sRep(p[0], [sWk({ d: 200 }, 'R'), sRc({ d: 200 }, 'trot')]), sRc({ s: 180 }), sRep(p[1], [sWk({ d: p[2] }, 'T'), sRc({ s: 90 })])] }; } },
  // ── Force (côtes)
  { id: 'cotes-longues', n: 'Côtes longues', stim: 'force', type: 'frac', ph: ['base', 'dev'], lvl: 2, hill: true,
        prog: [[4, 180], [5, 180], [6, 180], [5, 240]], b: function(p){ return { t: p[0] + ' × ' + slT(p[1]) + ' en côte', main: [sRep(p[0], [{ k: 'hill', n: 'Montée', s: p[1], p: null, eff: 'effort seuil (respiration soutenue), buste droit, bras actifs' }, sRc({ s: p[1] }, 'redescente en trottinant')])] }; } },
  { id: 'cotes-60', n: 'Côtes de 60 s', stim: 'force', type: 'frac', ph: ['base', 'dev'], lvl: 1, hill: true,
        prog: [[6], [8], [10], [12]], b: function(p){ return { t: p[0] + ' × 60 s en côte', main: [sRep(p[0], [{ k: 'hill', n: 'Montée', s: 60, p: null, eff: 'effort VO₂max (dur mais contrôlé)' }, sRc({ s: 90 }, 'redescente en trottinant')])] }; } },
  { id: 'cotes-kenyanes', n: 'Côtes kényanes', stim: 'force', type: 'frac', ph: ['base'], lvl: 2, hill: true,
        prog: [[15], [20], [25]], b: function(p){ return { t: p[0] + ' min de côtes kényanes', main: [{ k: 'hill', n: 'Montées-descentes courues', s: p[0] * 60, p: null, eff: 'monter vite (~seuil), redescendre en courant, sans s\'arrêter' }] }; } },
  { id: 'circuit-cotes', n: 'Circuit côte + gammes', stim: 'force', type: 'frac', ph: ['base'], lvl: 1, hill: true,
        prog: [[6], [8], [10]], b: function(p){ return { t: p[0] + ' × (côte 30 s + gammes)', main: [sRep(p[0], [{ k: 'hill', n: 'Montée', s: 30, p: null, eff: 'vive, genoux hauts' }, { k: 'drills', n: 'Gammes en haut', s: 30, p: null, eff: 'montées de genoux ou bondissements' }, sRc({ s: 75 }, 'redescente en marchant')])] }; } },
  // ── Fartlek
  { id: 'mona', n: 'Fartlek Mona', stim: 'mixte', type: 'frac', ph: ['base', 'dev', 'spec'], lvl: 2,
        prog: [[1], [2]], b: function(p){ const m = [sRep(2, [sWk({ s: 90 }, 'K10', '90 s'), sFl({ s: 90 })]), sRep(4, [sWk({ s: 60 }, 'F5', '60 s'), sFl({ s: 60 })]), sRep(4, [sWk({ s: 30 }, 'I', '30 s'), sFl({ s: 30 })]), sRep(4, [sWk({ s: 15 }, 'V', '15 s'), sFl({ s: 15 })])];
      return { t: p[0] > 1 ? '2 × Fartlek Mona' : 'Fartlek Mona (20 min)', main: p[0] > 1 ? [sRep(2, m, sRc({ s: 300 }, 'trot'))] : m }; } },
  { id: 'fartlek-kenyan', n: 'Fartlek kényan 1/1', stim: 'mixte', type: 'frac', ph: ['base', 'dev'], lvl: 1,
        prog: [[12], [15], [20]], b: function(p){ return { t: p[0] + ' × (1 min vite / 1 min courue)', main: [sRep(p[0], [sWk({ s: 60 }, 'K10', '1 min vite'), sFl({ s: 60 })])] }; } },
  { id: 'fartlek-suedois', n: 'Fartlek suédois', stim: 'mixte', type: 'frac', ph: ['base', 'dev'], lvl: 1,
        prog: [[2], [3]], b: function(p){ return { t: p[0] + ' × (4-3-2-1 min)', main: [sRep(p[0], [sWk({ s: 240 }, 'H', '4 min'), sWk({ s: 180 }, 'T', '3 min'), sWk({ s: 120 }, 'K10', '2 min'), sWk({ s: 60 }, 'F5', '1 min'), sRc({ s: 180 })])] }; } },
  // ── Spécifique course (allure de ta course : RP)
  { id: 'rp-blocs', n: 'Blocs à allure course', stim: 'specifique', type: 'tempo', ph: ['spec'], lvl: 1,
        prog: [[3, 2000, 90], [3, 3000, 90], [4, 3000, 120], [2, 5000, 180], [3, 4000, 120]], b: function(p, c){ const k = c.scale || 1; return { t: p[0] + ' × ' + slM(p[1] * k) + ' allure course', main: [sRep(p[0], [sWk({ d: p[1] * k }, 'RP', 'Allure course'), sRc({ s: p[2] })])] }; } },
  { id: 'alternance', n: 'Alternance allure course / allure marathon', stim: 'specifique', type: 'tempo', ph: ['spec'], lvl: 2, cats: ['10 km', 'Semi-marathon'],
        prog: [[8], [10], [12], [14]], b: function(p){ const m = []; for(let i = 0; i < p[0]; i++) m.push(i % 2 ? sWk({ d: 1000 }, 'M', 'Allure marathon') : sWk({ d: 1000 }, 'RP', 'Allure course')); return { t: p[0] + ' km en alternance course / marathon', main: m }; } },
  { id: 'progressive-course', n: 'Progressive vers l\'allure course', stim: 'specifique', type: 'tempo', ph: ['spec'], lvl: 2,
        prog: [[2], [3], [4]], b: function(p){ return { t: 'Progressive ' + p[0] + '-' + p[0] + '-' + p[0] + '-' + Math.max(1, p[0] - 1) + ' km', main: [sWk({ d: p[0] * 1000 }, 'M', 'Allure marathon'), sWk({ d: p[0] * 1000 }, 'RP', 'Allure course'), sWk({ d: Math.max(1, p[0] - 1) * 1000 }, 'K10', 'Plus vite que la course')] }; } },
  { id: 'rp-plus-moins', n: 'Allure course ± 5 s', stim: 'specifique', type: 'tempo', ph: ['spec'], lvl: 2,
        prog: [[2], [3], [4]], b: function(p){ return { t: p[0] + ' × 3 km (allure course ± 5 s)', main: [sRep(p[0], [sWk({ d: 1000 }, 'RPs', 'Course + 5 s'), sWk({ d: 1000 }, 'RP', 'Allure course'), sWk({ d: 1000 }, 'RPf', 'Course − 5 s'), sRc({ s: 120 })])] }; } },
  { id: 'rp-float', n: 'Allure course avec récup courue (Canova)', stim: 'specifique', type: 'tempo', ph: ['spec'], lvl: 3,
        prog: [[4, 2000], [5, 2000], [4, 3000]], b: function(p){ return { t: p[0] + ' × ' + slM(p[1]) + ' allure course, récup 1 km courue', main: [sRep(p[0], [sWk({ d: p[1] }, 'RP', 'Allure course'), sFl({ d: 1000 })])] }; } },
  { id: 'simulation', n: 'Simulation de course', stim: 'specifique', type: 'tempo', ph: ['spec'], lvl: 3,
        prog: [[8], [10], [12]], b: function(p, c){ return { t: p[0] * (c.scale || 1) + ' km à allure course', main: [sWk({ d: p[0] * (c.scale || 1) * 1000 }, 'RP', 'Allure course')], o: { w: 20, st: 4 } }; } },
  // ── Affûtage
  { id: 'rappel-course', n: 'Rappel allure course', stim: 'specifique', type: 'tempo', ph: ['taper'], lvl: 1,
        prog: [[3, 1000], [4, 1000], [2, 2000]], b: function(p){ return { t: p[0] + ' × ' + slM(p[1]) + ' allure course', main: [sRep(p[0], [sWk({ d: p[1] }, 'RP', 'Allure course'), sRc({ s: 120 })])] }; } },
  { id: 'rappel-3030', n: 'Rappel 30/30', stim: 'vo2', type: 'frac', ph: ['taper'], lvl: 1,
        prog: [[6], [8]], b: function(p){ return { t: p[0] + ' × 30/30', main: [sRep(p[0], [sWk({ s: 30 }, 'V', '30 s vite'), sRc({ s: 30 }, 'trot')])] }; } },
  // ── Endurance : sorties longues (km de la séance gardés)
  { id: 'long-ef', n: 'Sortie longue en endurance', stim: 'endurance', type: 'long', ph: ['base', 'dev', 'taper'], lvl: 1,
        prog: [[0]], b: function(p, c){ return { t: 'Sortie longue ' + c.km + ' km', main: [sEf({ d: c.km * 1000 }, 'Sortie longue')], o: { none: true } }; } },
  { id: 'long-relances', n: 'Sortie longue avec relances', stim: 'endurance', type: 'long', ph: ['base', 'dev'], lvl: 1,
        prog: [[0]], b: function(p, c){ const n = Math.max(2, Math.floor((c.km - 3) / 3)), m = [sEf({ d: 3000 }, 'Mise en route')]; for(let i = 0; i < n; i++){ m.push(sWk({ s: 60 }, 'H', 'Relance')); m.push(sEf({ d: Math.max(500, Math.round(((c.km - 3) * 1000 - n * 300) / n / 100) * 100) })); }
      return { t: 'Sortie longue ' + c.km + ' km + ' + n + ' relances', main: m, o: { none: true } }; } },
  { id: 'long-tiers', n: 'Sortie longue en trois tiers', stim: 'endurance', type: 'long', ph: ['dev'], lvl: 2,
        prog: [[0]], b: function(p, c){ const t = Math.round(c.km / 3 * 10) / 10; return { t: 'Sortie longue ' + c.km + ' km en 3 tiers', main: [sEf({ d: t * 1000 }, '1er tiers'), { k: 'steady', n: '2e tiers', d: t * 1000, p: 'FL' }, sWk({ d: (c.km - 2 * t) * 1000 }, 'M', '3e tiers')], o: { none: true } }; } },
  { id: 'long-finale', n: 'Sortie longue finale rapide', stim: 'endurance', type: 'long', ph: ['dev'], lvl: 2,
        prog: [[15], [20], [25]], b: function(p, c){ const fin = Math.min(c.km * 0.3, p[0] * 60 / 290); return { t: 'Sortie longue ' + c.km + ' km, ' + p[0] + ' dernières min vite', main: [sEf({ d: Math.round((c.km - fin) * 10) * 100 }), sWk({ s: p[0] * 60 }, 'M', 'Finale rapide')], o: { none: true } }; } },
  { id: 'long-surges', n: 'Sortie longue avec accélérations', stim: 'endurance', type: 'long', ph: ['dev'], lvl: 2,
        prog: [[6]], b: function(p, c){ const half = Math.round(c.km / 2), m = [sEf({ d: half * 1000 }, '1re moitié')]; const seg = Math.max(500, Math.round(((c.km - half) * 1000 - p[0] * 280) / p[0] / 100) * 100);
      for(let i = 0; i < p[0]; i++){ m.push(sWk({ s: 60 }, 'K10', 'Accélération')); m.push(sEf({ d: seg })); } return { t: 'Sortie longue ' + c.km + ' km + 6 × 1 min', main: m, o: { none: true } }; } },
  { id: 'long-vallonnee', n: 'Sortie longue vallonnée', stim: 'endurance', type: 'long', ph: ['base', 'dev'], lvl: 1, hill: true,
        prog: [[0]], b: function(p, c){ return { t: 'Sortie longue vallonnée ' + c.km + ' km', main: [Object.assign(sEf({ d: c.km * 1000 }, 'Parcours vallonné'), { eff: 'effort constant : ralentir en montée, relâcher en descente' })], o: { none: true } }; } },
  // ── Footings (km gardés)
  { id: 'ef', n: 'Footing en endurance', stim: 'endurance', type: 'ef', ph: ['base', 'dev', 'spec', 'taper'], lvl: 1,
        prog: [[0]], b: function(p, c){ return { t: 'Footing ' + c.km + ' km', main: [sEf({ d: c.km * 1000 }, 'Footing')], o: { none: true } }; } },
  { id: 'ef-lignes', n: 'Footing + lignes droites', stim: 'vitesse', type: 'ef', ph: ['base', 'dev', 'spec', 'taper'], lvl: 1,
        prog: [[6]], b: function(p, c){ return { t: 'Footing ' + c.km + ' km + ' + p[0] + ' lignes droites', main: [sEf({ d: Math.max(1, c.km - 0.8) * 1000 }, 'Footing'), sSt(p[0], 80)], o: { none: true } }; } },
  { id: 'ef-sprints-cote', n: 'Footing + sprints en côte', stim: 'force', type: 'ef', ph: ['base', 'dev'], lvl: 1, hill: true,
        prog: [[8]], b: function(p, c){ return { t: 'Footing ' + c.km + ' km + ' + p[0] + ' sprints en côte', main: [sEf({ d: Math.max(1, c.km - 0.6) * 1000 }, 'Footing'), sRep(p[0], [{ k: 'hill', n: 'Sprint en côte', s: 10, p: null, eff: 'maximal, côte raide' }, sRc({ s: 90 }, 'redescente en marchant')])], o: { none: true } }; } },
  { id: 'ef-lances', n: 'Footing + départs lancés', stim: 'vitesse', type: 'ef', ph: ['dev', 'spec'], lvl: 1,
        prog: [[6]], b: function(p, c){ return { t: 'Footing ' + c.km + ' km + ' + p[0] + ' × 30 m lancés', main: [sEf({ d: Math.max(1, c.km - 0.8) * 1000 }, 'Footing'), sRep(p[0], [{ k: 'strides', n: '30 m lancés', d: 30, p: 'S', eff: 'vitesse maximale, relâché' }, sRc({ s: 90 }, 'marche')])], o: { none: true } }; } },
  { id: 'ef-progressif', n: 'Footing progressif', stim: 'endurance', type: 'ef', ph: ['dev', 'spec'], lvl: 1,
        prog: [[0]], b: function(p, c){ return { t: 'Footing progressif ' + c.km + ' km', main: [sEf({ d: Math.max(1, c.km - 2) * 1000 }, 'Footing'), sWk({ d: Math.min(2, c.km - 1) * 1000 }, 'M', 'Fin à allure marathon')], o: { none: true } }; } },
  { id: 'ef-gammes', n: 'Footing + gammes', stim: 'vitesse', type: 'ef', ph: ['base', 'dev'], lvl: 1,
        prog: [[0]], b: function(p, c){ return { t: 'Footing ' + c.km + ' km + gammes', main: [sEf({ d: Math.round(c.km / 2 * 10) * 100 }, 'Footing'), { k: 'drills', n: 'Gammes', s: 600, p: null, eff: SL_DRILLS + ', puis 4 lignes droites' }, sEf({ d: Math.round(c.km / 2 * 10) * 100 }, 'Footing')], o: { none: true } }; } },
  { id: 'ef-recup', n: 'Footing de récupération', stim: 'recup', type: 'ef', ph: ['base', 'dev', 'spec', 'taper'], lvl: 1,
        prog: [[0]], b: function(p, c){ return { t: 'Footing récupération ' + c.km + ' km', main: [Object.assign(sEf({ d: c.km * 1000 }, 'Footing très facile'), { p: 'trot' })], o: { none: true } }; } },
  { id: 'activation', n: 'Activation avant la course', stim: 'specifique', type: 'ef', ph: ['taper'], lvl: 1,
        prog: [[4]], b: function(p, c){ return { t: 'Activation ' + c.km + ' km + ' + p[0] + ' × 1 min allure course', main: [sEf({ d: Math.max(1, c.km - 1) * 1000 }, 'Footing'), sRep(p[0], [sWk({ s: 60 }, 'RP', 'Allure course'), sRc({ s: 60 }, 'trot')]), sSt(3, 80)], o: { none: true } }; } },
  // ── Test
  { id: 'test-seuil', n: 'Test 30 min au seuil', stim: 'test', type: 'tempo', ph: ['base'], lvl: 2,
        prog: [[30]], b: function(p){ return { t: 'Test 30 min au seuil', main: [sWk({ s: p[0] * 60 }, 'T', 'Effort maximal tenu 30 min')] }; } }
];
const SL_BY_ID = {}; SL_LIB.forEach(function(L){ SL_BY_ID[L.id] = L; });

// ─── construction ───────────────────────────────────────────────────────────
// ctx : { P (allures), H (FC), cat, km (séance de volume) } ; renvoie { id, r, title, steps, km, min, workMin, type, stim, text }
function slCtx(st, opt){
  st = st || state; opt = opt || {};
  const today = opt.today || (typeof prTodayIso === 'function' ? prTodayIso() : null);
  let v = opt.v, ef = opt.ef;
  if(v == null && typeof prFitness === 'function'){ try { const f = prFitness(st, { today: today, races: typeof prKnownRaces === 'function' && st === state ? prKnownRaces() : [] }); v = f && f.vdot; } catch(e) { v = null; } }
  if(ef == null && typeof prObservedEf === 'function'){ try { ef = prObservedEf(st, today); } catch(e) { ef = null; } }
  const R = typeof prepRace === 'function' && st === state ? (prepRace() || {}) : {};
  const cat = opt.cat || (typeof predRaceCat === 'function' ? predRaceCat(R) : null) || 'Semi-marathon';
  const P = slPaces(v, ef); if(!P) return null;
  const rk = SL_RP[cat] || 'H';
  P.RP = P[rk]; P.RPs = [P[rk][0] + 5, P[rk][1] + 5]; P.RPf = [P[rk][0] - 5, P[rk][1] - 5];
  return { P: P, H: slHr(st), cat: cat, v: Math.round(v * 10) / 10, ef: ef ? Math.round(ef) : null, scale: cat === 'Marathon' ? 2 : 1, rk: rk };
}
function slPaceOf(step, ctx){ if(step.pace) return step.pace; const k = step.p; if(!k) return null; if(k === 'trot') return [ctx.P.trot, ctx.P.trot + 15]; return ctx.P[k] || null; }
function slHrOf(step, ctx){ const k = step.p === 'RP' || step.p === 'RPs' || step.p === 'RPf' ? ctx.rk : step.p; return k && ctx.H[k] ? ctx.H[k] : step.p === 'trot' ? ctx.H.E : null; }
// durée (s) et distance (m) d'une étape ou d'un groupe
function slMeasure(x, ctx){
  if(x.rep){ let d = 0, s = 0; x.steps.forEach(function(y){ const m = slMeasure(y, ctx); d += m.d; s += m.s; }); let gd = 0, gs = 0; if(x.gap){ const g = slMeasure(x.gap, ctx); gd = g.d; gs = g.s; } return { d: d * x.rep + gd * (x.rep - 1), s: s * x.rep + gs * (x.rep - 1) }; }
  const pr = slPaceOf(x, ctx), pace = pr ? (pr[0] + pr[1]) / 2 : x.k === 'hill' ? ctx.P.T[1] * 1.2 : x.k === 'drills' ? 0 : x.k === 'strides' && x.d ? ctx.P.R[0] : ctx.P.trot + 30;
  if(x.d) return { d: x.k === 'rec' && x.eff && /march/.test(x.eff) ? x.d * 0.5 : x.d, s: Math.round(x.d / 1000 * (x.eff && /march/.test(x.eff) ? 720 : pace)) };
  if(x.s) return { d: pace ? Math.round(x.s / pace * 1000) : (x.k === 'drills' ? Math.round(x.s * 1.5) : 0), s: x.s };
  return { d: 0, s: 0 };
}
function slBuild(id, r, ctx, km){
  const L = SL_BY_ID[id]; if(!L || !ctx) return null;
  r = Math.max(0, Math.min(L.prog.length - 1, r | 0));
  const c = Object.assign({}, ctx, { km: Math.round((km || (L.type === 'long' ? 16 : 8)) * 10) / 10 });
  const B = L.b(L.prog[r], c); if(!B) return null;
  const o = Object.assign({}, B.o || {}, ctx.wu && !(B.o && B.o.none) ? { w: ctx.wu, c: ctx.cd || 10 } : {});
  const steps = o.none ? B.main : SL_Q(B.main, o);
  let d = 0, s = 0, wk = 0;
  steps.forEach(function(x){ const m = slMeasure(x, c); d += m.d; s += m.s; });
  const work = function(x){ if(x.rep) return x.steps.reduce(function(a, y){ return a + work(y); }, 0) * x.rep; return x.k === 'work' || x.k === 'hill' ? slMeasure(x, c).s : 0; };
  steps.forEach(function(x){ wk += work(x); });
  const out = { id: id, r: r, rungs: L.prog.length, name: L.n, title: B.t, type: L.type, stim: L.stim, steps: steps, km: Math.max(1, Math.round(d / 100) / 10), min: Math.round(s / 60), workMin: Math.round(wk / 60), ctx: c };
  if(L.type === 'ef' || L.type === 'long') out.km = c.km;
  out.text = slText(out);
  return out;
}
// texte enregistré dans le plan : 1re allure = celle du travail principal (lue par prSessions, l'absorption, la validation)
const slPx = function(p){ return typeof prPace === 'function' ? prPace(p) : Math.floor(p / 60) + "'" + String(Math.round(p % 60)).padStart(2, '0'); };
function slStepTxt(x, ctx, first){
  if(x.rep){ let f = first; return x.rep + ' × (' + x.steps.map(function(y){ const hp = !y.rep && !!slPaceOf(y, ctx) && (y.k === 'work' || y.k === 'steady'); const t = slStepTxt(y, ctx, f && (hp || !!y.rep)); if(hp || y.rep) f = false; return t; }).join(' + ') + ')' + (x.gap ? ', ' + slStepTxt(x.gap, ctx, false) + ' entre les séries' : ''); }
  const pr = slPaceOf(x, ctx), q = x.d || x.s ? slQ(x) : '';
  if(x.k === 'rec' || x.k === 'float') return 'récup ' + q + ' ' + (x.k === 'float' ? 'courue à ' + slPx(pr[0]) + '/km' : (x.eff || 'trot'));
  if(x.k === 'hill' || x.k === 'drills') return (q ? q + ' ' : '') + (x.k === 'hill' ? 'en côte' : 'gammes');
  if(x.k === 'strides') return q + ' ' + String(x.n || 'ligne droite').toLowerCase();
  if(!pr) return q + (x.eff ? ' ' + x.eff.split(',')[0] : '');
  return q + ' à ' + (first ? slPx(pr[0]) + ' — ' + slPx(pr[1]) + ' /km' : slPx(pr[0]) + '/km');
}
function slText(b){
  const ctx = b.ctx, L = SL_BY_ID[b.id];
  const isQ = b.type === 'tempo' || b.type === 'frac';
  const main = b.steps.filter(function(x){ return !(x.k === 'warm' || x.k === 'cool' || (x.k === 'drills' && isQ) || (x.rep && x.steps[0].k === 'strides' && isQ)); });
  let firstDone = false;
  const parts = main.map(function(x){ const hasPace = function(y){ return y.rep ? y.steps.some(hasPace) : !!slPaceOf(y, ctx) && (y.k === 'work' || y.k === 'steady'); };
    const f = !firstDone && hasPace(x); if(f) firstDone = true; return slStepTxt(x, ctx, f); });
  const warm = b.steps.filter(function(x){ return x.k === 'warm'; })[0], cool = b.steps.filter(function(x){ return x.k === 'cool'; })[0];
  return parts.join(' · ') + (isQ && warm ? ' · échauffement ' + Math.round(warm.s / 60) + ' min EF + gammes + lignes droites' : '') + (isQ && cool ? ' · retour au calme ' + Math.round(cool.s / 60) + ' min' : '') + (L ? ' · ' + SL_STIM[L.stim].toLowerCase() : '');
}
// séance du plan → séance détaillée ; lib = x.lib (modèle, palier, niveau et allure EF du jour où elle a été écrite)
function slOfSession(s, st){
  st = st || state;
  const lib = s && s.x && s.x.lib; if(!lib || !SL_BY_ID[lib.id]) return null;
  const ctx = slCtx(st, { v: lib.v, ef: lib.ef, cat: lib.cat }); if(!ctx) return null;
  return slBuild(lib.id, lib.r, ctx, s.kmPlan || s.km);
}
// séance enregistrée : { t, d, km, type, lib }
function slAsSession(b){ return { t: b.type === 'ef' || b.type === 'long' ? SL_BY_ID[b.id].n : b.title, d: b.text, km: b.km, type: b.type, lib: { id: b.id, r: b.r, v: b.ctx.v, ef: b.ctx.ef, cat: b.ctx.cat, sv: SL_V } }; }

// ─── Préparation par blocs : phase de chaque semaine ──────────────────────────
// du général au spécifique : base (aérobie, force, vitesse) → développement (VO₂max, seuil) → spécifique (allure course) → affûtage
const SL_SPEC = { '5 km': 4, '10 km': 5, 'Semi-marathon': 6, 'Marathon': 8 };
const SL_PHASE = { base: 'Base', dev: 'Développement', spec: 'Spécifique', taper: 'Affûtage' };
function slPhases(st, today, cat){
  st = st || state;
  const W = prWeeks(st, today), ws = Object.keys(W).map(Number).sort(function(a, b){ return a - b; });
  const raceW = ws.filter(function(w){ return W[w].race; }).pop();
  const out = {}; if(raceW == null) return out;
  const spec = SL_SPEC[cat] || 6, first = ws[0];
  const pre = ws.filter(function(w){ return raceW - w > spec && W[w].kind !== 'taper'; });   // avant le spécifique
  const nBase = pre.length >= 4 ? Math.round(pre.length * 0.45) : 0;
  ws.forEach(function(w){
    const o = W[w], to = raceW - w;
    let ph = o.race || o.kind === 'taper' || to <= 1 ? 'taper' : to <= spec ? 'spec' : pre.indexOf(w) < nBase ? 'base' : 'dev';
    out[w] = { w: w, phase: ph, kind: o.kind, from: o.from, to: to, recov: o.kind === 'recov', race: !!o.race };
  });
  // rang de la semaine dans sa phase (0 → 1) pour la progression des paliers
  ['base', 'dev', 'spec', 'taper'].forEach(function(ph){ const L = ws.filter(function(w){ return out[w] && out[w].phase === ph; }); L.forEach(function(w, i){ out[w].pp = L.length > 1 ? i / (L.length - 1) : 0.5; out[w].pi = i; out[w].pn = L.length; }); });
  out._race = raceW; out._first = first;
  return out;
}

// ─── Ton profil de coureur : forces, faiblesses, ce qu'on travaille en priorité ───
// réserve de vitesse (niveau sur 5 / 10 km vs semi / marathon), base aérobie (allure EF réelle vs ton niveau), dérive cardiaque,
// fin de course (analyse de ta dernière course), volume (habitude vs ce que demande ton objectif), réponse aux séances (apprise)
function slProfile(st, a){
  st = st || state; a = a || {};
  const today = (a.opt && a.opt.today) || prTodayIso(), items = [], focus = {};
  const add = function(k, tone, t, v, f){ items.push({ k: k, tone: tone, t: t, v: v }); if(f) focus[f] = (focus[f] || 0) + (tone === 'weak' ? 1 : tone === 'strong' ? -0.5 : 0); };
  // 1. réserve de vitesse
  const races = (typeof prKnownRaces === 'function' && st === state ? prKnownRaces() : []).slice();
  // records datés (Mes records) aussi
  if(typeof PR_RECORD_KEY !== 'undefined') Object.keys(PR_RECORD_KEY).forEach(function(c){ const t = st[PR_RECORD_KEY[c]], m = (st._records || {})[c]; if(t && m && m.date) races.push({ cat: c, time: t, date: m.date, label: 'record' }); });
  const best = { short: null, long: null };
  races.forEach(function(r){ if(!r.date || prDays(r.date, today) > 548 || r.date > today) return; const sec = prTimeSec(r.time), m = PR_RACE_M[r.cat]; if(!sec || !m) return;
    const v = vdotFromRace(m, sec), g = m <= 10000 ? 'short' : 'long'; if(!best[g] || v > best[g].v) best[g] = { v: v, cat: r.cat, label: r.label }; });
  if(best.short && best.long){
    const d = best.short.v - best.long.v;
    if(d >= 1.5) add('reserve', 'weak', 'Endurance spécifique', 'Ton niveau sur ' + best.short.cat + ' (' + _slV(best.short.v) + ') dépasse celui sur ' + best.long.cat + ' (' + _slV(best.long.v) + ') : la vitesse est là, il faut la tenir plus longtemps.', 'specifique');
    else if(d <= -1) add('reserve', 'weak', 'Vitesse', 'Ton niveau sur ' + best.long.cat + ' (' + _slV(best.long.v) + ') dépasse celui sur ' + best.short.cat + ' (' + _slV(best.short.v) + ') : du travail de vitesse te donnera de la marge.', 'vitesse');
    else add('reserve', 'ok', 'Vitesse et endurance équilibrées', 'Niveaux proches sur courtes et longues distances.', null);
  }
  // 2. base aérobie : allure EF réelle vs l'endurance attendue à ton niveau
  const f = a.fit || (typeof prFitness === 'function' ? prFitness(st, { today: today, races: races }) : null);
  const ef = typeof prObservedEf === 'function' ? prObservedEf(st, today) : null, P = f && f.vdot ? slPaces(f.vdot, null) : null;
  if(ef && P){
    if(ef > P.E[1] + 5) add('aerobie', 'weak', 'Base aérobie', 'Ton endurance (' + slPx(ef) + '/km sous ton plafond de FC) est lente pour ton niveau : plus de volume facile et de seuil.', 'aerobie');
    else if(ef < P.E[0]) add('aerobie', 'strong', 'Base aérobie solide', 'Ton endurance (' + slPx(ef) + '/km) est rapide pour ton niveau.', 'aerobie');
  }
  // 3. dérive cardiaque des sorties longues
  const dr = typeof prDrift === 'function' && st === state ? prDrift(today) : null;
  if(dr && dr.n >= 2){ if(dr.avg >= 5) add('derive', 'weak', 'Tenue cardiaque', 'Ta FC dérive de ' + Math.round(dr.avg) + ' % en fin de sortie : endurance à consolider.', 'aerobie');
    else if(dr.avg < 3) add('derive', 'strong', 'Tenue cardiaque', 'Dérive de ' + Math.round(dr.avg * 10) / 10 + ' % seulement : excellente endurance.', 'aerobie'); }
  // 4. fin de course
  const ra = st._race_analysis;
  if(ra && (ra.pacing === 'fade' || ra.pacing === 'positive')) add('fin', 'weak', 'Fin de course', 'Tu as ralenti en 2e moitié de ta dernière course : endurance à allure course et finales rapides.', 'specifique');
  else if(ra && ra.pacing === 'negative') add('fin', 'strong', 'Fin de course', 'Tu as fini plus vite que tu n\'avais commencé : belle gestion.', null);
  // 5. volume
  const HV = a.hist && a.hist.vol, gp = a.volume && a.volume.goalPeak, base = a.opt && a.opt.habitual || (a.volume && a.volume.base);
  if(gp && base && base < gp * 0.7) add('volume', 'weak', 'Volume', 'Tu cours ~' + Math.round(base) + ' km/sem, ton objectif en demande ~' + gp + ' au pic : on monte progressivement.', 'aerobie');
  else if(HV && HV.best4 && gp && HV.best4 >= gp) add('volume', 'strong', 'Volume', 'Tu as déjà tenu ' + HV.best4 + ' km/sem : la charge de ton objectif est à ta portée.', null);
  // 6. ce à quoi tu réponds (séances de la bibliothèque déjà faites)
  const R = slResponse(st, today);
  Object.keys(R).forEach(function(k){ const r = R[k]; if(r.n < 2) return;
    if(r.easy / r.n >= 0.6) add('rep-' + k, 'strong', SL_STIM[k] + ' bien encaissé', r.easy + ' séances faciles sur ' + r.n + ' : on peut pousser.', null);
    else if(r.hard / r.n >= 0.5) add('rep-' + k, 'weak', SL_STIM[k] + ' difficile', r.hard + ' séances dures sur ' + r.n + ' : on progresse plus doucement.', null); });
  const order = Object.keys(focus).filter(function(k){ return focus[k] > 0; }).sort(function(x, y){ return focus[y] - focus[x]; });
  return { items: items, focus: order, resp: R };
}
const _slV = function(v){ return String(Math.round(v * 10) / 10).replace('.', ','); };
// réponse aux séances de la bibliothèque faites (365 j) : par effet recherché et par modèle, d'après l'absorption (paAbsorb)
function slResponse(st, today){
  st = st || state; today = today || prTodayIso();
  const out = {};
  const done = (st === state && typeof prAllDone === 'function' ? prAllDone(today) : prSessions(st).filter(function(s){ return s.done; }));
  done.forEach(function(s){ const lib = s.x && s.x.lib; if(!lib || !SL_BY_ID[lib.id] || !s.date || prDays(s.date, today) > 365) return;
    const ab = typeof paAbsorb === 'function' ? paAbsorb(s, st, { today: today }) : null; if(!ab || !ab.verdict) return;
    const L = SL_BY_ID[lib.id], k = L.stim;
    [k, 'id:' + lib.id].forEach(function(key){ out[key] = out[key] || { n: 0, easy: 0, hard: 0, last: null }; out[key].n++; if(ab.verdict === 'easy') out[key].easy++; if(ab.verdict === 'hard') out[key].hard++; if(!out[key].last || s.date > out[key].last.date) out[key].last = { date: s.date, verdict: ab.verdict, r: lib.r }; }); });
  return out;
}

// ─── Le moteur de choix ──────────────────────────────────────────────────────
// pour chaque créneau à venir : l'effet recherché (phase, place dans la semaine, ton profil), puis le modèle (jamais le même
// en 21 jours, celui qui t'a le moins servi récemment), puis le palier (avancée dans la phase, ton niveau, ta réponse), et le volume
// du créneau respecté (palier ou échauffement réduits si la séance déborde de plus de 30 %).
const SL_PLAN = { base: ['force', 'seuil', 'mixte'], dev: ['vo2', 'seuil', 'mixte'], spec: ['vo2', 'specifique', 'seuil'], taper: ['specifique', 'vo2'] };
const SL_EF = { base: ['ef-lignes', 'ef-sprints-cote', 'ef', 'ef-gammes'], dev: ['ef-lignes', 'ef-lances', 'ef', 'ef-progressif'], spec: ['ef-lignes', 'ef', 'ef-lances'], taper: ['ef-lignes', 'ef'] };
const SL_LONG = { base: ['long-ef', 'long-relances', 'long-vallonnee'], dev: ['long-tiers', 'long-ef', 'long-finale', 'long-surges'] };
function slPrefs(st){ const p = (st || state)._lib_prefs || {}; return { hills: p.hills !== false }; }
function slStimFor(phase, slot, nQ, w, prof){
  const P = (SL_PLAN[phase] || SL_PLAN.dev).slice(), foc = (prof && prof.focus) || [];
  // ton profil change l'accent : vitesse faible → vitesse en base ; endurance spécifique faible → seuil + spécifique ; base aérobie → seuil
  if(phase === 'base' && foc[0] === 'vitesse') P[0] = w % 2 ? 'vitesse' : 'force';
  if(phase === 'spec' && foc[0] === 'specifique') P[0] = 'seuil';
  if((phase === 'dev' || phase === 'base') && foc[0] === 'aerobie') P[0] = w % 2 ? 'seuil' : P[0];
  if(nQ <= 1) return P[w % 2];
  return P[Math.min(slot, P.length - 1)];
}
function slLvlCap(v, perWeek){ return !v || v < 42 ? 1 : v < 50 || perWeek < 4 ? 2 : 3; }
function slCands(stim, phase, cat, prefs, cap, type){
  return SL_LIB.filter(function(L){
    if(type && L.type !== type) return false;
    if(!type && L.type !== 'tempo' && L.type !== 'frac') return false;
    if(stim === 'mixte' ? L.stim !== 'mixte' : L.stim !== stim) return false;
    if(L.ph.indexOf(phase) < 0 || L.lvl > cap || (L.hill && !prefs.hills) || L.id === 'test-seuil') return false;
    return !L.cats || L.cats.indexOf(cat) >= 0;
  });
}
// palier : avancée dans la phase, niveau, semaine allégée, réponse apprise, réglage franc / prudent
function slRung(L, wk, ctx, adj){
  const n = L.prog.length; let r = Math.round((wk.pp || 0) * (n - 1) * 0.85);
  if(ctx.v >= 53) r++; if(ctx.v < 44) r--;
  if(wk.recov) r -= 1; if(wk.phase === 'taper') r = 0;
  r += adj || 0;
  return Math.max(0, Math.min(n - 1, r));
}
function slFit(id, r, ctx, km){
  let b = slBuild(id, r, ctx, km);
  if(!b || !km || b.type === 'ef' || b.type === 'long') return b;
  while(b && b.km > km * 1.3 && b.r > 0) b = slBuild(id, b.r - 1, ctx, km);
  if(b && b.km > km * 1.3){ const c2 = Object.assign({}, ctx, { wu: 15, cd: 8 }); b = slBuild(id, b.r, c2, km) || b; }
  return b;
}
// sélection sur tout le reste de la prépa (ou un horizon) → propositions « session » (kind 'lib')
function slSelect(st, a, opt){
  st = st || state; opt = opt || {};
  const today = a.opt.today, cat = a.opt.raceCat || 'Semi-marathon';
  const ctx = slCtx(st, { v: a.fit && a.fit.vdot, ef: a.opt.efPace, cat: cat, today: today }); if(!ctx) return [];
  const PH = slPhases(st, today, cat), prefs = slPrefs(st), prof = opt.profile || slProfile(st, a), R = slResponse(st, today);
  const S = prSessions(st), end = opt.until || '9999', from = opt.from || prAddDays(today, 1);
  const perWeek = (function(){ const c = {}; S.forEach(function(s){ if(s.type !== 'rest' && s.type !== 'race') c[s.w] = (c[s.w] || 0) + 1; }); const v = Object.keys(c).map(function(k){ return c[k]; }).sort(); return v.length ? v[Math.floor(v.length / 2)] : 4; })();
  const cap = slLvlCap(ctx.v, perWeek), calib = (a.ladderCalib || {}).mode;
  // dernier usage de chaque modèle (fait ou prévu) : jamais deux fois en 21 jours
  const used = {}; S.forEach(function(s){ const l = s.x && s.x.lib; if(l && s.date && (!used[l.id] || s.date > used[l.id])) used[l.id] = s.date; });
  const hard = function(s){ return ['tempo', 'frac', 'race'].indexOf(s.type) >= 0 || s.type === 'long'; };
  const byDate = {}; S.forEach(function(s){ if(s.date && !s.skip) (byDate[s.date] = byDate[s.date] || []).push(s); });
  const out = [], plan = {};
  const pick = function(list, s, wk, type){
    const free = list.filter(function(L){ const u = plan[L.id] || used[L.id]; return !u || Math.abs(prDays(u, s.date)) > 21; });
    const pool = (free.length ? free : list).slice().sort(function(x, y){ const ux = plan[x.id] || used[x.id] || '0', uy = plan[y.id] || used[y.id] || '0'; return ux.localeCompare(uy) || x.lvl - y.lvl; });
    return pool.length ? pool[(wk.w + (type === 'q2' ? 1 : 0)) % Math.min(pool.length, 2)] : null;
  };
  Object.keys(PH).filter(function(k){ return /^\d+$/.test(k); }).map(Number).sort(function(x, y){ return x - y; }).forEach(function(w){
    const wk = PH[w];
    const sess = S.filter(function(s){ return s.w === w && !s.done && !s.skip && s.date && s.date >= from && s.date <= end && s.type !== 'race' && s.type !== 'rest' && !(s.x && s.x._season); });
    if(!sess.length) return;
    const qs = S.filter(function(s){ return s.w === w && (s.type === 'tempo' || s.type === 'frac'); }).sort(function(x, y){ return (x.date || '').localeCompare(y.date || ''); });
    sess.sort(function(x, y){ return x.date.localeCompare(y.date); }).forEach(function(s){
      if(opt.keepLib && s.x && s.x.lib) return;
      let L = null, adj = 0;
      if(s.type === 'tempo' || s.type === 'frac'){
        if(/^Test\b/i.test(s.title)) return;                                       // séance test du plan : gardée
        const slot = qs.indexOf(s), stim = slStimFor(wk.phase, slot, qs.length, w, prof);
        L = pick(slCands(stim, wk.phase, cat, prefs, cap), s, wk, slot ? 'q2' : 'q1') || pick(slCands('seuil', wk.phase, cat, prefs, cap), s, wk);
        const r = R[L ? L.stim : ''] || {}; if(r.last){ adj += r.last.verdict === 'easy' ? (calib === 'careful' ? 0 : 1) : r.last.verdict === 'hard' ? -1 : 0; }
        if(a.absorb && a.absorb.verdict === 'hard') adj -= 1;
      } else if(s.type === 'long'){
        const list = SL_LONG[wk.phase]; if(!list) return;
        const ids = list.filter(function(id){ const T = SL_BY_ID[id]; return T && (!T.hill || prefs.hills); });
        L = SL_BY_ID[ids[(wk.pi || 0) % ids.length]];
        if(wk.recov) L = SL_BY_ID['long-ef'];
      } else if(s.type === 'ef'){
        const prev = (byDate[prAddDays(s.date, -1)] || []).some(hard), next = (byDate[prAddDays(s.date, 1)] || []).some(function(x){ return x.type === 'race'; }), next2 = (byDate[prAddDays(s.date, 2)] || []).some(function(x){ return x.type === 'race'; });
        if(next || (next2 && !(byDate[prAddDays(s.date, 1)] || []).length)) L = SL_BY_ID.activation;
        else if(prev) L = SL_BY_ID['ef-recup'];
        else { const ids = (SL_EF[wk.phase] || SL_EF.dev).filter(function(id){ const T = SL_BY_ID[id]; return T && (!T.hill || prefs.hills); });
          const day = (s.ei || 0) + w; L = SL_BY_ID[ids[day % ids.length]];
          if(L.id === 'ef-progressif' && (byDate[prAddDays(s.date, 1)] || []).some(hard)) L = SL_BY_ID.ef; }
      }
      if(!L) return;
      const b = slFit(L.id, slRung(L, wk, ctx, adj), ctx, s.kmPlan);
      if(!b) return;
      plan[L.id] = s.date;
      const A = slAsSession(b); A.lib.at = today;
      if(s.x && s.x.lib && s.x.lib.id === b.id && s.x.lib.r === b.r && s.detail === A.d) return;
      out.push({ key: s.key, w: s.w, date: s.date, field: 'session', title: s.title, type: s.type, kind: 'lib', src: 'calcul', libId: b.id, stim: b.stim, phase: wk.phase,
        before: { t: s.title, d: s.detail, km: s.kmPlan, type: s.type }, after: A,
        reason: SL_PHASE[wk.phase] + ' · ' + SL_STIM[b.stim] + ' : ' + L.n + (L.why ? ' — ' + L.why : ''), short: SL_PHASE[wk.phase] + ' · ' + L.n + ' (' + SL_STIM[b.stim].toLowerCase() + ')' });
    });
  });
  return out;
}
// au fil de la prépa (bibliothèque adoptée) : allures recalées, palier selon ta réponse, nouvelles séances pour les créneaux classiques
function slProposals(st, a){
  st = st || state;
  if(!a || !a.fit || !a.fit.vdot) return [];
  const today = a.opt.today, cat = a.opt.raceCat || 'Semi-marathon', out = [];
  const ctx = slCtx(st, { v: a.fit.vdot, ef: a.opt.efPace, cat: cat, today: today }); if(!ctx) return [];
  const S = prSessions(st), R = slResponse(st, today), seenStim = {}, calib = (a.ladderCalib || {}).mode;
  S.filter(function(s){ return !s.done && !s.skip && s.date && s.date > today && prDays(today, s.date) <= 28 && s.x && s.x.lib && SL_BY_ID[s.x.lib.id]; })
    .sort(function(x, y){ return x.date.localeCompare(y.date); }).forEach(function(s){
      const lib = s.x.lib, L = SL_BY_ID[lib.id];
      let r = lib.r, sub = 'refresh', why = '';
      // palier : la dernière séance de cet effet recherché a été facile → +1, dure → −1 (une fois par effet recherché, dans les 14 jours)
      const q = L.type === 'tempo' || L.type === 'frac';
      if(q && !seenStim[L.stim] && prDays(today, s.date) <= 14 && !a.opt.noVolumeUp && !(a.opt.noFasterUntil && s.date <= a.opt.noFasterUntil)){
        seenStim[L.stim] = 1;
        const last = (R[L.stim] || {}).last;
        if(last && last.date > (lib.at || '0')){ const d = last.verdict === 'easy' ? (calib === 'careful' ? 0 : 1) : last.verdict === 'hard' ? -1 : 0;
          if(d && r + d >= 0 && r + d < L.prog.length){ r += d; sub = 'step'; why = 'ta dernière séance de ' + SL_STIM[L.stim].toLowerCase() + ' a été ' + (d > 0 ? 'facile' : 'dure'); } }
      }
      const moved = Math.abs((lib.v || 0) - ctx.v) >= 0.4 || (ctx.ef && lib.ef && Math.abs(lib.ef - ctx.ef) >= 5);
      if(sub === 'refresh' && !moved) return;
      const b = slFit(lib.id, r, ctx, L.type === 'ef' || L.type === 'long' ? s.kmPlan : null); if(!b) return;
      const A = slAsSession(b); A.lib.at = today;
      if(A.d === s.detail && A.t === s.title) return;
      out.push({ key: s.key, w: s.w, date: s.date, field: 'session', title: s.title, type: s.type, kind: 'lib', sub: sub, src: 'calcul', libId: b.id, stim: b.stim, delta: b.r - lib.r,
        before: { t: s.title, d: s.detail, km: s.kmPlan, type: s.type }, after: A,
        reason: sub === 'step' ? (b.r > lib.r ? 'Palier suivant' : 'Palier en dessous') + ' : ' + why + '.' : 'Allures recalées sur ton niveau (' + _slV(ctx.v) + ').',
        short: sub === 'step' ? (b.r > lib.r ? 'Ça monte : ' : 'On souffle : ') + why + '.' : 'Allures recalées sur ton niveau (' + _slV(ctx.v) + ').' });
    });
  // créneaux encore classiques dans les 3 semaines (séance ajoutée, nouvelle semaine…) : séance de la bibliothèque proposée
  if(!st._lib_on) return out;
  const pick = slPicks(st);
  const fresh = slSelect(st, a, { from: prAddDays(today, 1), until: prAddDays(today, 21), keepLib: true }).filter(function(p){ return pick[p.key] !== 'classic'; });
  return out.concat(fresh.map(function(p){ return Object.assign(p, { sub: 'new' }); }));
}
// proposition « Ta prépa version pro » (une fois par prépa) : affichée tant que ni adoptée ni refusée, ni déjà des choix séance par séance
function slOfferKey(st){ st = st || state; return String(st._prep_id || st.plan_start_date || 'prep'); }
function slOffer(st){ st = st || state; const o = st._lib_offer || {}; return !st._lib_on && o.key !== slOfferKey(st) && !!st._plan_engine && !Object.keys(slPicks(st)).length; }
// choix faits séance par séance pour la prépa en cours : { clé: 'classic' | 'pro' }
function slPicks(st){ st = st || state; const P = st._lib_pick; return P && P.prep === slOfferKey(st) ? (P.k || {}) : {}; }

// ─── Deux versions de chaque séance : classique (le plan) ou pro (la bibliothèque) — choix séance par séance ───
// séance qui peut avoir deux versions : à faire, ni course, ni repos, ni test, ni étape de la saison
function slChoosable(s, today){
  today = today || (typeof prTodayIso === 'function' ? prTodayIso() : '');
  return !!(s && !s.done && !s.skip && s.date && s.date >= today && ['ef', 'long', 'tempo', 'frac'].indexOf(s.type) >= 0 && !/^Test\b/i.test(s.title || '') && !(s.x && s.x._season));
}
// version classique d'une séance passée en pro : gardée avec elle (x.lib.cl), sinon retrouvée dans l'historique des changements
function slClassicOf(st, s){
  st = st || state; const lib = s && s.x && s.x.lib; if(!lib) return null;
  if(lib.cl && lib.cl.t) return lib.cl;
  const R = st._plan_reviews || [];
  for(let i = R.length - 1; i >= 0; i--){
    const c = (R[i].changes || []).filter(function(c){ return c.ref === s.key && c.field === 'session' && c.libAfter && !c.libBefore && c.before && c.before.t; })[0];
    if(c && !R[i].undone) return { t: c.before.t, d: c.before.d || '', km: +c.before.km || s.kmPlan, type: c.before.type || s.type };
  }
  return null;
}
// version pro proposée pour une séance classique : même choix que « Ta prépa version pro » (rotation des modèles sur toute la prépa)
let _slSelCache = null;
function slSelectCached(st, a){
  st = st || state;
  const sig = [a.opt.today, typeof prDataSig === 'function' ? prDataSig() : '', (st._plan_reviews || []).length, JSON.stringify(st._lib_pick || {}), Object.keys(st).length].join('|');
  if(_slSelCache && _slSelCache.st === st && _slSelCache.sig === sig && Date.now() - _slSelCache.t < 30000) return _slSelCache.out;
  const out = slSelect(st, a, { from: a.opt.today });
  _slSelCache = { st: st, sig: sig, t: Date.now(), out: out };
  return out;
}
function slProOf(st, s, a){
  if(!s || (s.x && s.x.lib)) return null;
  return slSelectCached(st, a).filter(function(p){ return p.key === s.key; })[0] || null;
}
// les deux versions d'une séance : { cur: 'classic' | 'pro', classic: { t, d, km, type }, pro: { t, d, km, type, lib } | null, p: proposition }
function slChoice(st, s, a){
  st = st || state; if(!slChoosable(s, a && a.opt && a.opt.today)) return null;
  const cur = { t: s.title, d: s.detail || '', km: s.kmPlan, type: s.type };
  if(s.x && s.x.lib){ const cl = slClassicOf(st, s); return { cur: 'pro', pro: Object.assign(cur, { lib: s.x.lib }), classic: cl }; }
  const p = a ? slProOf(st, s, a) : null;
  return { cur: 'classic', classic: cur, pro: p ? p.after : null, p: p };
}
// changement à appliquer pour passer une séance à l'autre version (prApplyChanges, annulable)
function slPickChange(st, s, C, mode){
  if(!C || C.cur === mode) return null;
  const to = mode === 'pro' ? C.pro : C.classic; if(!to || !to.t) return null;
  const L = mode === 'pro' && to.lib ? SL_BY_ID[to.lib.id] : null;
  return { key: s.key, w: s.w, date: s.date, field: 'session', title: s.title, type: s.type, kind: 'pick', sub: mode, src: 'choix', libId: L ? L.id : undefined,
    before: { t: s.title, d: s.detail || '', km: s.kmPlan, type: s.type }, after: mode === 'pro' ? to : { t: to.t, d: to.d || '', km: to.km, type: to.type },
    reason: mode === 'pro' ? 'Version pro choisie : ' + (L ? L.n : to.t) : 'Version classique choisie', short: mode === 'pro' ? 'Version pro : ' + (L ? L.n : to.t) : 'Version classique : ' + to.t };
}
// pastille de la ligne de la séance (accueil) : version en cours, et l'autre possible
function slChipHtml(s2, key){
  if(!s2 || ['ef', 'long', 'tempo', 'frac'].indexOf(s2.type) < 0) return '';
  const t = String(s2.d || '').split('|')[0]; if(/^Test\b/i.test(t) || s2._season) return '';
  const pro = !!s2.lib;
  return '<span class="sl-vchip' + (pro ? ' pro' : '') + '" style="display:inline-flex;align-items:center;gap:3px;margin-left:6px;padding:1px 7px;border-radius:999px;font-size:10.5px;font-weight:800;white-space:nowrap;'
    + (pro ? 'background:#F5F3FF;color:#6D28D9;border:1px solid #DDD6FE;' : 'background:#F8FAFC;color:#64748B;border:1px solid #E2E8F0;') + '">' + (pro ? '✦ Pro' : 'Classique · ⇄ Pro') + '</span>';
}

// ─── Détail d'une séance (bibliothèque ou classique) : étapes + but + conseils + version courte + ravito ───
function slDetail(s, st){
  st = st || state; if(!s) return null;
  let b = slOfSession(s, st);
  const ctx = b ? b.ctx : slCtx(st, {});
  if(!b && ctx) b = slClassic(s, ctx);
  if(!b) return null;
  const L = SL_BY_ID[b.id] || null;
  const it = typeof prIntent === 'function' ? prIntent(s) : null;
  const gen = SL_GENERIC[s.type] || SL_GENERIC.ef;
  const out = { b: b, L: L, why: L && L.why || gen.why, tips: L && L.tips || gen.tips, ok: L && L.ok || gen.ok, stim: b.stim, phase: null,
    rpe: typeof paRpeRange === 'function' ? paRpeRange(s.type) : null };
  // version courte (fatigue) : un palier en dessous, ou 20 % de moins
  if(L && b.r > 0) out.short = slBuild(L.id, b.r - 1, b.ctx, s.kmPlan);
  out.shortTxt = out.short ? out.short.title + ' · ~' + out.short.min + ' min' : 'Raccourcir de 20 % et rester en endurance si les jambes sont lourdes.';
  // ravito, chaussure, météo
  if(b.min >= 75) out.fuel = 'Boire 400-600 ml par heure, un gel à 45 min puis toutes les 30-40 min. C\'est l\'occasion de tester le ravito du jour J.';
  else if(b.min >= 60) out.fuel = 'Une petite bouteille si chaud ; rien à manger.';
  if(typeof shoeDayAdvice === 'function'){ try { const sh = shoeDayAdvice(s.x || {}, s.date); if(sh && sh.name) out.shoe = sh.name; } catch(e) {} }
  if(typeof prWxAt === 'function' && s.date){ const m = prWxAt(s.date, (s.x && s.x.sched_time) || '12:00'); if(m && typeof prWxAdj === 'function'){ const adj = prWxAdj(m); out.wx = { t: Math.round(m.t), pct: adj.pct, why: adj.why }; } }
  return out;
}
const SL_GENERIC = {
  ef: { why: 'Développer le moteur aérobie sans fatigue.', tips: ['Conversation possible', 'FC sous le plafond d\'endurance'], ok: 'FC sous le plafond du début à la fin.' },
  long: { why: 'Endurance, économie de course et mental des longues distances.', tips: ['Départ très facile', 'Boire toutes les 20 min si plus de 1h15'], ok: 'Finir avec de la réserve.' },
  tempo: { why: 'Repousser ton seuil.', tips: ['Régulier du premier au dernier bloc'], ok: 'Blocs dans la fourchette.' },
  frac: { why: 'Développer ta VO₂max.', tips: ['Ne pas partir trop vite', 'Récup trottinée'], ok: 'Toutes les répétitions dans la fourchette.' },
  race: { why: 'Le jour J.', tips: ['Partir à ton allure, pas à celle des autres'], ok: 'Négative split.' }
};
// séance classique → étapes (lecture de la consigne : « 15 min EF », « N × Q », « récup R min », « retour au calme »)
function slClassic(s, ctx){
  const t = (s.title || '') + ' · ' + (s.detail || ''), km = s.kmPlan || s.km || 8;
  const out = { id: null, r: 0, rungs: 1, name: s.title, title: s.title, type: s.type, stim: s.type === 'long' || s.type === 'ef' ? 'endurance' : s.type === 'tempo' ? 'seuil' : s.type === 'frac' ? 'vo2' : 'specifique', ctx: ctx, steps: [] };
  const pace = s.pace ? [s.pace.lo, s.pace.hi] : null;
  if(s.type === 'ef' || s.type === 'long' || s.type === 'race'){
    out.steps = [Object.assign(sEf({ d: km * 1000 }, s.type === 'race' ? 'Course' : s.type === 'long' ? 'Sortie longue' : 'Footing'), pace ? { p: null, pace: pace } : {})];
  } else {
    const wm = t.match(/(\d+)\s*(?:-\s*\d+\s*)?min\s+(?:EF|d'échauffement)/i), wk = t.match(/(\d+(?:[,.]\d+)?)\s*km\s+EF/i), rp = typeof paParseReps === 'function' ? paParseReps(t) : null;
    const rc = t.match(/récup\s+(\d+(?:[,.]\d+)?)\s*(min|s|'|’)/i), cool = /retour au calme/i.test(t);
    out.steps.push(wk ? sEf({ d: parseFloat(wk[1].replace(',', '.')) * 1000 }, 'Échauffement') : sW(wm ? +wm[1] : 15));
    out.steps.push(sDr());
    if(rp){ const wkS = Object.assign({ k: 'work', n: 'Bloc', p: null, pace: pace }, rp.unit === 'm' ? { d: rp.q } : { s: rp.q * 60 });
      const rec = rc ? sRc(/min|'|’/.test(rc[2]) ? { s: Math.round(parseFloat(rc[1].replace(',', '.')) * 60) } : { s: +rc[1] }) : sRc({ s: 120 });
      out.steps.push(sRep(rp.n, [wkS, rec])); }
    else out.steps.push({ k: 'work', n: 'Partie principale', p: null, pace: pace, eff: s.detail });
    if(cool) out.steps.push(sC(10));
  }
  let d = 0, sec = 0; out.steps.forEach(function(x){ const m = slMeasure(x, ctx); d += m.d; sec += m.s; });
  out.km = km; out.min = Math.round(sec / 60) || Math.round(km * 5.5); out.workMin = 0; out.text = s.detail;
  return out;
}
// texte d'une séance détaillée pour l'agenda, le Coach (étapes une par ligne)
function slStepsText(b){
  const ctx = b.ctx, lines = [];
  const one = function(x, ind){
    if(x.rep){ lines.push(ind + x.rep + ' ×'); x.steps.forEach(function(y){ one(y, ind + '   '); }); if(x.gap) lines.push(ind + '(entre les séries : ' + slStepTxt(x.gap, ctx, false) + ')'); return; }
    const pr = x.pace || slPaceOf(x, ctx), hr = slHrOf(x, ctx);
    lines.push(ind + '• ' + x.n + (x.d || x.s ? ' ' + slQ(x) : '') + (pr ? ' · ' + slPx(pr[0]) + '–' + slPx(pr[1]) + '/km' : '') + (hr ? ' · FC ' + hr[0] + '-' + hr[1] : '') + (x.eff && !pr ? ' · ' + x.eff : ''));
  };
  b.steps.forEach(function(x){ one(x, ''); });
  return lines.join('\n');
}
