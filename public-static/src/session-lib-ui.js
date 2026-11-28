// ─── Écrans de la bibliothèque de séances (à la demande, groupe « sdui ») ─────────────────────────────
// openSessionDetail(clé) : la séance en entier (étapes, allures, FC, but, conseils, version courte, ravito, météo, autres séances
// possibles) · openRunnerProfile() : ton profil de coureur · openLibCatalog() : la bibliothèque · openLibPreview() : ta prépa version pro
// textes des séances de la bibliothèque (pourquoi, comment la réussir, réussie si) : chargés avec les écrans, recopiés dans SL_LIB
const SL_TXT = {
  'seuil-2k': ['Repousser ton seuil : courir plus vite sans t\'asphyxier, le cœur de la performance du 10 km au marathon.', ['Régulier : le 1er bloc n\'est pas plus rapide que le dernier', 'Respiration rythmée mais contrôlée'], 'Tous les blocs dans la fourchette, le dernier aussi bien que le premier.'],
  'seuil-1k': ['Beaucoup de temps au seuil avec des récupérations très courtes : le lactate s\'accumule à peine.', ['Récup vraiment courte : on repart avant d\'être frais', 'Ne pas courir plus vite que la fourchette'], 'Les 1 000 m réguliers, aucun au-dessus de la fourchette.'],
  'tempo-continu': ['Tenir longtemps une allure soutenue sans casser : endurance au seuil et mental.', ['Départ sur le haut de la fourchette (plus lent)', 'Accélère seulement si tout va bien à mi-parcours'], 'Allure tenue jusqu\'au bout, sans finir à bloc.'],
  'over-under': ['Alterner juste au-dessus et juste en dessous du seuil apprend au corps à recycler le lactate en courant.', ['Les changements d\'allure se font sans à-coups', 'Le « dessous » n\'est pas une récup : on reste concentré'], 'Les deux allures bien distinctes, toutes les séries complètes.'],
  'evacuation': ['Un bloc rapide fait monter le lactate, le bloc à allure semi qui suit t\'apprend à l\'éliminer sans ralentir.', ['Ne relâche pas après le bloc rapide : c\'est là que la séance travaille'], 'L\'allure semi tenue juste après chaque bloc rapide.'],
  'norvegien': ['Méthode des Ingebrigtsen : beaucoup de temps juste sous le seuil, intense mais récupérable rapidement.', ['Plutôt sous le seuil que dessus : c\'est la clé de la méthode', 'Récup de 1 min debout ou en marchant'], 'Aucun bloc au-dessus de la fourchette, sensation de pouvoir en faire un de plus.'],
  'seuil-escalier': ['Trois blocs de plus en plus rapides : finir vite quand la fatigue arrive.', ['Le 1er bloc doit sembler facile'], 'Chaque bloc plus rapide que le précédent.'],
  'tempo-descente': ['Trois allures de plus en plus vives sur des durées de plus en plus courtes : tenir puis relancer.', ['Récup courte : 2 min de trot'], 'Le dernier bloc à allure 10 km sans exploser.'],
  'billat-3030': ['Le classique de Véronique Billat : beaucoup de temps près de ta VO₂max sans jamais être à bloc.', ['Les 30 s rapides restent fluides, pas un sprint', 'Les 30 s lentes sont courues, pas marchées'], 'Toutes les répétitions à la même allure, la dernière comprise.'],
  '4515': ['Des récupérations de 15 s seulement : la FC reste haute, temps maximal à VO₂max.', ['Démarre prudemment : ça monte vite'], 'Les dernières répétitions tenues sans ralentir.'],
  'kenyan-400': ['Récupération courue à allure soutenue : on travaille la VO₂max sans jamais redescendre, comme les Kényans.', ['Les 200 m de récup sont courus, pas trottinés'], 'Les 400 m réguliers, la récup courue jusqu\'au bout.'],
  'pyramide': ['Varier les distances garde la séance vivante et travaille VO₂max et tolérance à l\'effort.', ['Pense à la descente : ne grille pas tout sur la montée'], 'La descente de la pyramide aussi rapide que la montée.'],
  'michigan': ['La séance mythique de l\'université du Michigan : des fractions de plus en plus rapides séparées par du seuil.', ['Les blocs au seuil ne sont pas une récup', 'Séance très dure : bien dormir la veille'], 'Chaque fraction plus rapide que la précédente, seuil tenu entre elles.'],
  'degressif': ['Plus c\'est court, plus c\'est vite : on finit la séance à vitesse VMA alors que la fatigue est là.', ['Le 1er bloc à allure 10 km, pas plus'], 'Accélérer à chaque bloc jusqu\'au dernier.'],
  'vo2-long': ['Des fractions de 3 à 5 min : le meilleur rapport entre temps à VO₂max et fatigue.', ['Récup égale au temps d\'effort, en trottinant'], 'Toutes les fractions dans la fourchette.'],
  'echelle': ['Monter puis redescendre en durée : on apprend à doser son effort.', ['Récup = moitié du temps d\'effort'], 'Allure stable sur toute l\'échelle.'],
  '321': ['Trois vitesses dans chaque série : allure 5 km, VO₂, puis VMA.', ['90 s de récup entre chaque bloc'], 'La minute finale de chaque série la plus rapide.'],
  '200-relache': ['De la vitesse sans fatigue : économie de course, cadence, foulée plus efficace.', ['Vite mais relâché : épaules basses, mâchoire détendue', 'Récup complète'], 'Des 200 m fluides et réguliers.'],
  '300-vite': ['Puissance et vitesse pure, utiles même pour un semi : plus de marge à allure course.', ['Récup 300 m marche + trot'], 'Les 300 m tous à la même vitesse.'],
  'vitesse-seuil': ['Réveiller la vitesse puis courir au seuil avec des jambes « réveillées » : relâchement à allure soutenue.', ['Les 200 m ne sont pas un sprint'], 'Le seuil tenu facilement après les 200 m.'],
  'cotes-longues': ['La force spécifique du coureur : puissance aérobie et foulée solide, sans traumatisme.', ['Effort au seuil en montée (pas l\'allure)', 'Redescente en trottinant'], 'Même effort et même hauteur à chaque montée.'],
  'cotes-60': ['VO₂max et force en même temps, avec un impact réduit sur les jambes.', ['Pente de 4 à 8 %', 'Monter sur l\'avant du pied'], 'Montées régulières, la dernière aussi haute que la première.'],
  'cotes-kenyanes': ['Montées et descentes courues sans arrêt : force, technique et cardio, la base des coureurs des hauts plateaux.', ['Descente active, pas freinée', 'Montée à petits pas rapides'], 'Rythme constant du début à la fin.'],
  'circuit-cotes': ['Force et technique de course : chaque montée suivie de gammes en haut de la côte.', ['Gammes appliquées, pas bâclées'], 'Technique propre jusqu\'à la dernière série.'],
  'mona': ['Le fartlek de Steve Moneghetti : 20 min sans arrêt, des efforts de plus en plus courts, récup courue égale.', ['Les récupérations sont courues à allure marathon', 'Accélère sur les efforts courts'], '20 min courues sans t\'arrêter.'],
  'fartlek-kenyan': ['Une minute vite, une minute courue : simple, efficace, et ça apprend à relancer.', ['La minute « lente » reste courue'], 'Toutes les minutes vites à la même allure.'],
  'fartlek-suedois': ['Plusieurs allures dans la même série, de la plus lente à la plus vive : souplesse et changements de rythme.', ['Courir aux sensations, la montre en appui'], 'Bien sentir 4 allures différentes.'],
  'rp-blocs': ['Ancrer l\'allure de ta course : la sentir, la tenir, la mémoriser.', ['L\'allure doit sembler « facile pour l\'instant »', 'Boire comme le jour J'], 'Chaque bloc pile dans la fourchette.'],
  'alternance': ['Pas de récupération : on alterne ton allure course et une allure à peine plus lente, sur une longue distance.', ['Le km lent n\'est pas une récup : rester concentré'], 'Toute la distance courue sans s\'arrêter.'],
  'progressive-course': ['Accélérer palier par palier jusqu\'à dépasser ton allure course : finir fort.', ['Chaque palier un peu plus vite, sans à-coup'], 'Le dernier palier plus rapide que ton allure course.'],
  'rp-plus-moins': ['Encadrer ton allure course : un peu plus lent, pile, un peu plus vite. Le jour J, tu sauras où tu en es sans regarder la montre.', ['Les écarts sont petits : sois précis'], 'Trois allures distinctes dans chaque bloc.'],
  'rp-float': ['La méthode de Renato Canova : récupérer en courant vite, pour habituer le corps à l\'allure course sous fatigue.', ['La récup courue est soutenue : c\'est voulu'], 'Toutes les fractions à allure course malgré la récup courue.'],
  'simulation': ['Une répétition générale : même échauffement, mêmes chaussures, même ravito que le jour J.', ['Tout comme le jour J : heure, petit-déjeuner, tenue'], 'Allure tenue avec de la marge à la fin.'],
  'rappel-course': ['Garder les sensations de l\'allure course sans se fatiguer avant le jour J.', ['Facile : tu dois finir frais'], 'Allure course qui semble facile.'],
  'rappel-3030': ['Réveiller le moteur sans le fatiguer, à quelques jours de la course.', ['Une seule série, fluide'], 'Jambes vives à la fin.'],
  'long-ef': ['La base de tout : capillaires, mitochondries, économie, et le mental des longues distances.', ['Conversation possible tout du long', 'Boire toutes les 20 min si plus de 1h15'], 'FC sous le plafond d\'endurance jusqu\'au bout.'],
  'long-relances': ['Une relance d\'1 min tous les 3 km casse la monotonie et garde de la vivacité en fin de sortie.', ['Relance à allure semi, puis retour immédiat en endurance'], 'Les relances vives, l\'endurance vraiment facile entre elles.'],
  'long-tiers': ['Un tiers facile, un tiers modéré, un tiers à allure marathon : finir une longue sortie en accélérant.', ['Le 1er tiers doit sembler trop lent'], 'Chaque tiers plus rapide que le précédent.'],
  'long-finale': ['Accélérer quand les jambes sont fatiguées : la qualité qui fait la différence en fin de course.', ['Ne commence la finale que si tout va bien'], 'La finale courue à allure marathon ou plus vite.'],
  'long-surges': ['Six minutes rapides réparties dans la sortie : endurance et vivacité dans la même séance.', ['Accélérations dans la 2e moitié'], 'Accélérations vives, endurance facile entre elles.'],
  'long-vallonnee': ['Le relief renforce sans vitesse : force, endurance musculaire, foulée.', ['Effort constant, pas allure constante'], 'Montées à l\'effort, sans t\'asphyxier.'],
  'ef': ['Le socle : développer le moteur aérobie sans fatigue.', ['Conversation possible'], 'FC sous le plafond d\'endurance.'],
  'ef-lignes': ['Six accélérations de 80 m en fin de footing : vitesse et foulée sans fatigue.', ['Progressives, relâchées, sur du plat'], 'Lignes droites fluides.'],
  'ef-sprints-cote': ['Huit sprints de 10 s en côte raide : force maximale et recrutement musculaire, presque sans fatigue.', ['Récup complète en marchant (1 min 30)'], 'Sprints explosifs, foulée propre.'],
  'ef-lances': ['30 m lancés à vitesse maximale : la vitesse pure entretenue toute la prépa.', ['20 m d\'élan, 30 m vite, 30 m pour ralentir'], 'Vitesse sans crispation.'],
  'ef-progressif': ['Commencer très facile et finir à allure marathon : endurance et sens de l\'allure.', ['Aucune accélération brusque'], 'Les 2 derniers km à allure marathon sans forcer.'],
  'ef-gammes': ['Dix minutes de gammes au milieu du footing : technique de course et économie.', ['Gammes sur 20 m, retour en marchant'], 'Gammes propres.'],
  'ef-recup': ['Le lendemain d\'une séance dure : faire circuler le sang sans rien demander aux jambes.', ['Plus lent que ton endurance habituelle', 'Raccourcir si les jambes sont lourdes'], 'Jambes plus légères à la fin qu\'au début.'],
  'activation': ['La veille ou l\'avant-veille : réveiller les jambes et sentir l\'allure course.', ['Court et facile, rien à prouver'], 'Jambes vives, envie de courir.'],
  'test-seuil': ['Mesurer ta FC seuil : la FC moyenne des 20 dernières minutes recale toutes tes zones.', ['Effort constant, le plus fort que tu puisses tenir 30 min', 'Montre en mode FC'], 'Effort régulier du début à la fin.']
};
Object.keys(SL_TXT).forEach(function(id){ const L = SL_BY_ID[id]; if(L){ L.why = SL_TXT[id][0]; L.tips = SL_TXT[id][1]; L.ok = SL_TXT[id][2]; } });
const SL_FOCUS = { vitesse: 'vitesse', specifique: 'endurance spécifique', aerobie: 'base aérobie' };
const _slEsc = function(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
const SL_COL = { warm: '#94A3B8', cool: '#94A3B8', drills: '#A78BFA', strides: '#38BDF8', work: '#EF4444', hill: '#B45309', float: '#F59E0B', rec: '#CBD5E1', steady: '#22C55E' };
const SL_KEYCOL = { E: '#22C55E', M: '#84CC16', H: '#EAB308', T: '#F97316', Tc: '#F59E0B', K10: '#F97316', F5: '#EF4444', I: '#DC2626', V: '#B91C1C', R: '#7C3AED', RP: '#E0603A', RPs: '#E0603A', RPf: '#E0603A', FL: '#F59E0B', trot: '#CBD5E1' };
function _slCss(){
  if(document.getElementById('sl-css')) return;
  const s = document.createElement('style'); s.id = 'sl-css';
  s.textContent = '.sl .ros-head{background:linear-gradient(135deg,#7C2D12,#1E1B4B);}'
    + '.sl-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px;}.sl-tile{background:#fff;border:1px solid #DCE5F3;border-radius:12px;padding:8px 6px;text-align:center;min-width:0;}.sl-tile b{display:block;font-size:16px;font-weight:900;color:#0F172A;font-variant-numeric:tabular-nums;}.sl-tile small{font-size:10.5px;color:#64748B;}'
    + '.sl-bar{display:flex;height:16px;border-radius:8px;overflow:hidden;margin:2px 0 12px;background:#E2E8F0;}.sl-bar i{display:block;height:100%;min-width:2px;border-right:1px solid rgba(255,255,255,.6);}'
    + '.sl-steps{display:flex;flex-direction:column;gap:6px;}.sl-st{display:flex;gap:10px;align-items:flex-start;background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:8px 10px;}.sl-st i{flex:0 0 10px;height:10px;border-radius:50%;margin-top:5px;}'
    + '.sl-st .sl-tx{flex:1;min-width:0;}.sl-st b{font-size:13.5px;color:#0F172A;}.sl-st small{display:block;font-size:12px;color:#475569;margin-top:1px;}.sl-st .sl-pz{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;}.sl-pz span{font-size:11.5px;font-weight:800;border-radius:8px;padding:2px 7px;background:#F1F5F9;color:#0F172A;font-variant-numeric:tabular-nums;}.sl-pz span.hr{background:#FEF2F2;color:#B91C1C;}'
    + '.sl-rep{border:1.5px dashed #CBD5E1;border-radius:14px;padding:8px;display:flex;flex-direction:column;gap:6px;}.sl-rep>p{margin:0;font-size:12.5px;font-weight:900;color:#0F172A;}'
    + '.sl-sec{margin:14px 0 6px;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#64748B;}.sl-p{margin:0;font-size:13.5px;color:#334155;line-height:1.45;}.sl-ul{margin:0;padding-left:18px;font-size:13.5px;color:#334155;line-height:1.5;}'
    + '.sl-chip{display:inline-block;font-size:11.5px;font-weight:800;border-radius:9px;padding:2px 8px;background:#F5F3FF;color:#6D28D9;margin-right:4px;}'
    + '.sl-alt{display:flex;flex-direction:column;gap:6px;}.sl-alt button{display:flex;justify-content:space-between;gap:8px;align-items:center;width:100%;text-align:left;background:#fff;border:1px solid #DCE5F3;border-radius:12px;padding:9px 11px;font:inherit;font-size:13px;color:#0F172A;cursor:pointer;}.sl-alt button small{color:#64748B;font-size:11.5px;}'
    + '.sl-acts{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;}.sl-acts button{flex:1;min-width:30%;border:1px solid #DCE5F3;background:#fff;color:#1B4FD8;border-radius:12px;padding:10px 6px;font:inherit;font-size:13.5px;font-weight:800;cursor:pointer;}.sl-acts button.pri{background:#1B4FD8;border-color:#1B4FD8;color:#fff;}'
    + '.sl-pf{display:flex;gap:10px;align-items:flex-start;background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:9px 11px;margin-bottom:6px;}.sl-pf em{font-style:normal;font-size:11px;font-weight:900;border-radius:8px;padding:2px 7px;flex-shrink:0;}.sl-pf em.weak{background:#FFFBEB;color:#B45309;}.sl-pf em.strong{background:#ECFDF5;color:#047857;}.sl-pf em.ok{background:#F1F5F9;color:#334155;}'
    + '.sl-wk{background:#fff;border:1px solid #DCE5F3;border-radius:14px;padding:10px;margin-bottom:8px;}.sl-wk h4{margin:0 0 6px;font-size:13px;color:#0F172A;display:flex;justify-content:space-between;gap:8px;}.sl-wk h4 span{font-size:11.5px;color:#6D28D9;font-weight:800;}'
    + '.sl-row{display:flex;gap:8px;font-size:12.5px;color:#334155;padding:3px 0;border-top:1px solid #F1F5F9;}.sl-row:first-of-type{border-top:0;}.sl-row b{flex:0 0 44px;color:#64748B;font-weight:800;}.sl-row s{color:#94A3B8;}'
    + '.sl-cat{background:#fff;border:1px solid #DCE5F3;border-radius:14px;margin-bottom:8px;overflow:hidden;}.sl-cat summary{list-style:none;cursor:pointer;padding:10px 12px;display:flex;flex-direction:column;gap:2px;}.sl-cat summary::-webkit-details-marker{display:none;}.sl-cat summary b{font-size:14px;color:#0F172A;}.sl-cat summary small{font-size:12px;color:#64748B;}.sl-cat .sl-steps{padding:0 10px 10px;}'
    + '.sl-tog{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:10px 12px;font-size:13.5px;color:#0F172A;}.sl-tog button{border:1px solid #DCE5F3;background:#F5F8FD;border-radius:10px;padding:6px 10px;font:inherit;font-weight:800;color:#1B4FD8;cursor:pointer;}';
  document.head.appendChild(s);
}
function _slSheet(id, eb, title, sub, body){
  _slCss();
  const old = document.getElementById(id); if(old) old.remove();
  const ov = document.createElement('div'); ov.id = id; ov.className = 'ros pe sl';
  ov.innerHTML = '<div class="ros-box" role="dialog" aria-modal="true" aria-labelledby="' + id + '-t"><div class="ros-head"><div class="ros-top"><button type="button" class="ros-x" onclick="document.getElementById(\'' + id + '\').remove()" aria-label="Fermer">×</button>'
    + '<div style="min-width:0;"><p class="ros-eb">' + _slEsc(eb) + '</p><p class="ros-title" id="' + id + '-t">' + _slEsc(title) + '</p>' + (sub ? '<p class="ros-sub">' + _slEsc(sub) + '</p>' : '') + '</div></div></div>'
    + '<div class="ros-body">' + body + '</div></div>';
  document.body.appendChild(ov);
  return ov;
}
const _slPx = function(p){ return typeof prPace === 'function' ? prPace(p) : p; };
function _slStepHtml(x, ctx){
  if(x.rep){
    return '<div class="sl-rep"><p>' + x.rep + ' ×</p>' + x.steps.map(function(y){ return _slStepHtml(y, ctx); }).join('')
      + (x.gap ? '<p style="font-weight:700;color:#64748B;font-size:12px;">Entre les séries : ' + _slEsc(slStepTxt(x.gap, ctx, false)) + '</p>' : '') + '</div>';
  }
  const pr = x.pace || slPaceOf(x, ctx), hr = slHrOf(x, ctx), col = SL_KEYCOL[x.p] || SL_COL[x.k] || '#94A3B8';
  const lbl = x.p && SL_PLBL[x.p] ? SL_PLBL[x.p] : x.p === 'RP' ? 'allure course' : x.p === 'RPs' ? 'allure course + 5 s' : x.p === 'RPf' ? 'allure course − 5 s' : '';
  return '<div class="sl-st"><i style="background:' + col + '"></i><div class="sl-tx"><b>' + _slEsc(x.n) + (x.d || x.s ? ' · ' + _slEsc(slQ(x)) : '') + '</b>'
    + (lbl || x.eff ? '<small>' + _slEsc([lbl, x.eff].filter(Boolean).join(' · ')) + '</small>' : '')
    + (pr || hr ? '<div class="sl-pz">' + (pr ? '<span>' + _slPx(pr[0]) + ' – ' + _slPx(pr[1]) + ' /km</span>' : '') + (hr ? '<span class="hr">♥ ' + hr[0] + '-' + hr[1] + '</span>' : '') + '</div>' : '') + '</div></div>';
}
// barre de la séance : chaque étape proportionnelle à sa durée, couleur de son allure
function _slBar(b){
  const segs = []; const flat = function(x, n){ if(x.rep){ for(let i = 0; i < x.rep; i++){ x.steps.forEach(function(y){ flat(y); }); if(x.gap && i < x.rep - 1) flat(x.gap); } return; } const m = slMeasure(x, b.ctx); segs.push({ s: m.s || 30, c: SL_KEYCOL[x.p] || SL_COL[x.k] || '#94A3B8' }); };
  b.steps.forEach(function(x){ flat(x); });
  const tot = segs.reduce(function(a, x){ return a + x.s; }, 0) || 1;
  return '<div class="sl-bar" aria-hidden="true">' + segs.map(function(x){ return '<i style="width:' + (x.s / tot * 100).toFixed(2) + '%;background:' + x.c + '"></i>'; }).join('') + '</div>';
}
function _slFindSession(key){ return prSessions(state).filter(function(s){ return s.key === key; })[0] || null; }
function openSessionDetail(key){
  const s = _slFindSession(key); if(!s) return;
  const D = slDetail(s, state); if(!D){ if(typeof showToast === 'function') showToast('Détail indisponible : ton niveau n\'est pas encore connu', 'ℹ️'); return; }
  const b = D.b, L = D.L, today = prTodayIso();
  const day = s.date ? new Date(s.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  const PH = typeof slPhases === 'function' ? slPhases(state, today, b.ctx.cat) : {}, ph = PH[s.w] ? SL_PHASE[PH[s.w].phase] : '';
  let h = '<div class="sl-tiles"><div class="sl-tile"><b>' + String(b.km).replace('.', ',') + '</b><small>km</small></div><div class="sl-tile"><b>~' + b.min + '</b><small>min</small></div>'
    + '<div class="sl-tile"><b>' + (b.workMin || '–') + '</b><small>min de travail</small></div><div class="sl-tile"><b>' + (D.rpe ? D.rpe[0] + '-' + D.rpe[1] : '–') + '</b><small>effort /10</small></div></div>';
  h += (L ? '<p style="margin:0 0 6px;"><span class="sl-chip">' + SL_STIM_IC[L.stim] + ' ' + SL_STIM[L.stim] + '</span>' + (ph ? '<span class="sl-chip" style="background:#EEF3FC;color:#1B4FD8;">' + ph + '</span>' : '') + (L.lvl ? '<span class="sl-chip" style="background:#F1F5F9;color:#334155;">Niveau ' + L.lvl + ' · palier ' + (b.r + 1) + '/' + b.rungs + '</span>' : '') + '</p>' : '');
  h += _slBar(b) + '<div class="sl-steps">' + b.steps.map(function(x){ return _slStepHtml(x, b.ctx); }).join('') + '</div>';
  h += '<p class="sl-sec">Pourquoi cette séance</p><p class="sl-p">' + _slEsc(D.why) + '</p>';
  if(D.tips && D.tips.length) h += '<p class="sl-sec">Comment la réussir</p><ul class="sl-ul">' + D.tips.map(function(t){ return '<li>' + _slEsc(t) + '</li>'; }).join('') + '</ul>';
  h += '<p class="sl-sec">Réussie si</p><p class="sl-p">' + _slEsc(D.ok) + '</p>';
  h += '<p class="sl-sec">Si tu es fatigué</p><p class="sl-p">' + _slEsc(D.shortTxt) + '</p>';
  if(D.fuel) h += '<p class="sl-sec">Ravito</p><p class="sl-p">' + _slEsc(D.fuel) + '</p>';
  if(D.wx && D.wx.pct >= 1) h += '<p class="sl-sec">Météo</p><p class="sl-p">' + D.wx.t + ' °C prévus (' + _slEsc(D.wx.why) + ') : vise environ ' + Math.round(D.wx.pct) + ' % plus lent, ou fie-toi à la FC.</p>';
  if(D.shoe) h += '<p class="sl-sec">Chaussures</p><p class="sl-p">' + _slEsc(D.shoe) + '</p>';
  // autres séances possibles pour ce créneau (même effet recherché)
  const ro = typeof _prepView !== 'undefined' && _prepView && !_prepView.next;
  if(L && !s.done && !s.skip && !ro && (L.type === 'tempo' || L.type === 'frac')){
    const pf = slPrefs(state), alts = SL_LIB.filter(function(T){ return T.id !== L.id && T.stim === L.stim && (T.type === 'tempo' || T.type === 'frac') && (!T.hill || pf.hills); }).slice(0, 4);
    if(alts.length) h += '<p class="sl-sec">Envie d\'autre chose ?</p><div class="sl-alt">' + alts.map(function(T){ return '<button type="button" onclick="slSwap(\'' + s.key + '\',\'' + T.id + '\')"><span><b>' + _slEsc(T.n) + '</b><br><small>' + _slEsc(T.why.split(':')[0].slice(0, 70)) + '</small></span><span>›</span></button>'; }).join('') + '</div>';
  }
  const acts = [];
  if(!s.done && !s.skip && !ro && s.date === today && typeof toggleDoneExtra === 'function') acts.push('<button type="button" class="pri" onclick="document.getElementById(\'sl-ov\').remove();toggleDoneExtra(' + s.w + ',' + s.ei + ')">✓ Valider</button>');
  if(!s.done && !ro && typeof openEditExtraModal === 'function' && s.type !== 'race') acts.push('<button type="button" onclick="document.getElementById(\'sl-ov\').remove();openEditExtraModal(' + s.w + ',' + s.ei + ')">Modifier</button>');
  if(typeof coachAI === 'function' && coachAI() && typeof openPlanChat === 'function' && !ro) acts.push('<button type="button" onclick="document.getElementById(\'sl-ov\').remove();openPlanChat(' + _slEsc(JSON.stringify('Ma séance du ' + day + ' : ' + s.title + '. ')) + ')">En parler au Coach</button>');
  if(acts.length) h += '<div class="sl-acts">' + acts.join('') + '</div>';
  _slSheet('sl-ov', day, s.title, b.title !== s.title ? b.title : (L ? L.n : ''), h);
}
// changer la séance du créneau pour une autre de la bibliothèque (annulable)
function slSwap(key, id){
  const s = _slFindSession(key); if(!s) return;
  const lib = s.x && s.x.lib, ctx = slCtx(state, lib ? { v: lib.v, ef: lib.ef, cat: lib.cat } : {}); if(!ctx) return;
  const T = SL_BY_ID[id]; const b = slFit(id, lib && lib.r != null ? Math.min(lib.r, T.prog.length - 1) : 0, ctx, s.kmPlan); if(!b) return;
  const A = slAsSession(b); A.lib.at = prTodayIso();
  prApplyChanges([{ key: s.key, w: s.w, date: s.date, field: 'session', title: s.title, type: s.type, kind: 'lib', sub: 'swap', src: 'calcul', before: { t: s.title, d: s.detail, km: s.kmPlan, type: s.type }, after: A, short: 'Séance changée : ' + T.n }], { kind: 'lib', at: new Date().toISOString() });
  save();
  if(typeof rendered !== 'undefined'){ rendered.plan = false; }
  try { if(typeof renderHome === 'function') renderHome(); } catch(e) { diagSilent(e, 'session-lib-ui:slSwap'); }
  if(typeof showToast === 'function') showToast('Séance changée : ' + T.n, '✦');
  openSessionDetail(key);
}

// ─── Ton profil de coureur ───────────────────────────────────────────────────
function openRunnerProfile(){
  const a = typeof prAnalyze === 'function' ? prAnalyze() : null; if(!a) return;
  const P = a.profile || slProfile(state, a), today = a.opt.today;
  const FOC = { vitesse: 'Vitesse : séances courtes et rapides, côtes, lignes droites', specifique: 'Endurance à allure course : blocs longs, alternances, finales rapides', aerobie: 'Base aérobie : volume facile, seuil, sorties longues progressives' };
  let h = '';
  if(P.focus.length) h += '<div class="lvp-card"><p class="lvp-h">Ce qu\'on travaille en priorité</p>' + P.focus.map(function(k, i){ return '<p class="sl-p"><b>' + (i + 1) + '.</b> ' + _slEsc(FOC[k] || k) + '</p>'; }).join('') + '<p class="lvp-n">Le moteur de séances s\'en sert pour choisir tes séances clés.</p></div>';
  else h += '<div class="lvp-card"><p class="sl-p">Pas de point faible net : le plan suit la progression classique de ta préparation.</p></div>';
  h += '<p class="sl-sec">Tes forces et tes points faibles</p>' + (P.items.length ? P.items.map(function(x){ return '<div class="sl-pf"><em class="' + x.tone + '">' + (x.tone === 'weak' ? 'À travailler' : x.tone === 'strong' ? 'Force' : 'Équilibré') + '</em><span><b style="font-size:13.5px;">' + _slEsc(x.t) + '</b><br><span style="font-size:12.5px;color:#475569;">' + _slEsc(x.v) + '</span></span></div>'; }).join('')
    : '<p class="sl-p">Pas encore assez de courses et de séances notées pour te décrire. Chaque séance validée avec ton ressenti affine ce profil.</p>');
  const R = P.resp || {}, ks = Object.keys(R).filter(function(k){ return SL_STIM[k]; });
  if(ks.length) h += '<p class="sl-sec">Ta réponse aux séances</p>' + ks.map(function(k){ const r = R[k]; return '<div class="sl-pf"><em class="' + (r.hard / r.n >= 0.5 ? 'weak' : r.easy / r.n >= 0.6 ? 'strong' : 'ok') + '">' + SL_STIM_IC[k] + '</em><span style="font-size:13px;"><b>' + SL_STIM[k] + '</b> · ' + r.n + ' séance' + (r.n > 1 ? 's' : '') + ' · ' + r.easy + ' facile' + (r.easy > 1 ? 's' : '') + ', ' + r.hard + ' dure' + (r.hard > 1 ? 's' : '') + '</span></div>'; }).join('');
  const pf = slPrefs(state);
  h += '<p class="sl-sec">Tes conditions</p><div class="sl-tog"><span>⛰️ Une côte près de chez moi</span><button type="button" onclick="slSetPref(\'hills\',' + (!pf.hills) + ')">' + (pf.hills ? 'Oui' : 'Non') + '</button></div>';
  h += '<div class="sl-acts"><button type="button" onclick="openLibCatalog()">📚 La bibliothèque</button>' + (state._lib_on ? '' : '<button type="button" class="pri" onclick="openLibPreview()">Ta prépa version pro</button>') + '</div>';
  _slSheet('sl-prof', 'Plan', 'Ton profil de coureur', 'Forces, faiblesses et ce que le plan travaille en priorité', h);
}
function slSetPref(k, v){ state._lib_prefs = Object.assign({}, state._lib_prefs || {}, { [k]: v }); save(); openRunnerProfile(); }

// ─── La bibliothèque ─────────────────────────────────────────────────────────
function openLibCatalog(){
  const ctx = slCtx(state, {}); if(!ctx){ if(typeof showToast === 'function') showToast('Ton niveau n\'est pas encore connu', 'ℹ️'); return; }
  const order = ['seuil', 'vo2', 'specifique', 'mixte', 'vitesse', 'force', 'endurance', 'recup', 'test'];
  let n = 0, v = 0; SL_LIB.forEach(function(L){ n++; v += L.prog.length; });
  let h = '<div class="lvp-card"><p class="sl-p"><b>' + n + ' séances</b> et <b>' + v + ' variantes</b>, aux allures de ton niveau (' + String(ctx.v).replace('.', ',') + '). Le moteur les choisit selon la phase de ta préparation, ton profil et ce que tu encaisses ; jamais la même en 3 semaines.</p></div>';
  order.forEach(function(k){
    const Ls = SL_LIB.filter(function(L){ return L.stim === k; }); if(!Ls.length) return;
    h += '<p class="sl-sec">' + SL_STIM_IC[k] + ' ' + SL_STIM[k] + '</p>';
    Ls.forEach(function(L){ const b = slBuild(L.id, Math.floor((L.prog.length - 1) / 2), ctx, L.type === 'long' ? 16 : 9);
      h += '<details class="sl-cat"><summary><b>' + _slEsc(L.n) + '</b><small>' + _slEsc(L.why) + '</small><small>' + L.ph.map(function(p){ return SL_PHASE[p]; }).join(' · ') + ' · ' + L.prog.length + ' palier' + (L.prog.length > 1 ? 's' : '') + (L.hill ? ' · côte' : '') + '</small></summary>'
        + (b ? '<div class="sl-steps"><p class="sl-p" style="margin:0 2px 4px;"><b>' + _slEsc(b.title) + '</b> · ' + String(b.km).replace('.', ',') + ' km · ~' + b.min + ' min</p>' + b.steps.map(function(x){ return _slStepHtml(x, ctx); }).join('') + '</div>' : '') + '</details>'; });
  });
  _slSheet('sl-cat', 'Plan', 'La bibliothèque de séances', 'Toutes les séances que le moteur peut te proposer', h);
}

// ─── Ta prépa version pro : toutes les séances à venir choisies par le moteur ───
function openLibPreview(){
  const a = prAnalyze(), sel = slSelect(state, a), PH = slPhases(state, a.opt.today, a.opt.raceCat || 'Semi-marathon');
  let h = '';
  if(state._lib_on){
    h += '<div class="lvp-card"><p class="sl-p">✦ Ta prépa est en version pro depuis le ' + _slEsc(prFmtDate((state._lib_on_at || a.opt.today).slice(0, 10))) + '. Le moteur choisit et fait progresser tes séances au fil des semaines.</p></div>'
      + '<div class="sl-acts"><button type="button" onclick="openRunnerProfile()">Ton profil</button><button type="button" onclick="openLibCatalog()">La bibliothèque</button><button type="button" onclick="slLibOff()">Revenir aux séances classiques</button></div>';
    _slSheet('sl-prev', 'Plan', 'Ta prépa version pro', '', h); return;
  }
  const byW = {}; sel.forEach(function(p){ (byW[p.w] = byW[p.w] || []).push(p); });
  const nQ = sel.filter(function(p){ return p.type === 'tempo' || p.type === 'frac'; }).length;
  h += '<div class="lvp-card"><p class="sl-p"><b>' + sel.length + ' séances</b> réécrites jusqu\'à la course, dont <b>' + nQ + ' séances clés</b> toutes différentes : du général au spécifique, selon ton profil' + (a.profile && a.profile.focus.length ? ' (priorité : ' + _slEsc(a.profile.focus.map(function(k){ return SL_FOCUS[k] || k; }).join(', ')) + ')' : '') + '. Km et jours gardés. Annulable d\'un geste.</p></div>';
  Object.keys(byW).map(Number).sort(function(x, y){ return x - y; }).forEach(function(w){
    const wk = PH[w] || {};
    h += '<div class="sl-wk"><h4>S' + w + (wk.from ? ' · ' + _slEsc(prFmtDate(wk.from)) : '') + '<span>' + (SL_PHASE[wk.phase] || '') + (wk.recov ? ' · allégée' : '') + '</span></h4>'
      + byW[w].map(function(p){ return '<div class="sl-row"><b>' + _slEsc(prFmtDate(p.date, { weekday: 'short' })) + '</b><span><s>' + _slEsc(p.before.t) + '</s> → <span style="font-weight:700;color:#0F172A;">' + _slEsc(p.after.t) + '</span></span></div>'; }).join('') + '</div>';
  });
  h += '<div class="sl-acts"><button type="button" class="pri" onclick="slLibOn()">✦ Passer ma prépa en version pro</button><button type="button" onclick="slLibLater()">Pas maintenant</button></div>';
  _slSheet('sl-prev', 'Plan', 'Ta prépa version pro', 'Des séances de coach, choisies pour toi', h);
}
function slLibOn(){
  const a = prAnalyze(), sel = slSelect(state, a), at = new Date().toISOString();
  const r = sel.length ? prApplyChanges(sel, { kind: 'libplan', vdot: a.fit && a.fit.vdot, at: at }) : { n: 0 };
  state._lib_on = slOfferKey(state); state._lib_on_at = at; state._lib_offer = { key: slOfferKey(state), answer: 'yes', at: at };
  save();
  if(typeof rendered !== 'undefined'){ rendered.plan = false; rendered.stats = false; }
  const ov = document.getElementById('sl-prev'); if(ov) ov.remove();
  try { if(typeof renderHome === 'function') renderHome(); } catch(e) { diagSilent(e, 'session-lib-ui:slLibOn'); }
  if(typeof showToast === 'function') showToast('Prépa version pro : ' + r.n + ' séances réécrites', '✦');
}
function slLibLater(){ state._lib_offer = { key: slOfferKey(state), answer: 'no', at: new Date().toISOString() }; save(); const ov = document.getElementById('sl-prev'); if(ov) ov.remove(); try { if(typeof planCardRender === 'function') planCardRender(); } catch(e) { diagSilent(e, 'session-lib-ui:slLibLater'); } }
function slLibOff(){
  const at = state._lib_on_at, i = (state._plan_reviews || []).findIndex(function(h){ return h.kind === 'libplan' && h.at === at; });
  if(i >= 0) prUndoReview(i);
  state._lib_on = null; state._lib_offer = { key: slOfferKey(state), answer: 'no', at: new Date().toISOString() };
  save();
  const ov = document.getElementById('sl-prev'); if(ov) ov.remove();
  try { if(typeof renderHome === 'function') renderHome(); } catch(e) { diagSilent(e, 'session-lib-ui:slLibOff'); }
}
