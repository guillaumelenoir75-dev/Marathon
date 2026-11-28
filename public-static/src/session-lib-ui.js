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
    + '.sl-ch{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 6px;}.sl-cv{position:relative;display:flex;flex-direction:column;gap:2px;text-align:left;background:#fff;border:1.5px solid #DCE5F3;border-radius:14px;padding:9px 10px 10px;font:inherit;color:#0F172A;cursor:pointer;min-width:0;}'
    + '.sl-cv em{font-style:normal;font-size:10.5px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:#64748B;}.sl-cv.pro em{color:#6D28D9;}.sl-cv b{font-size:13px;line-height:1.25;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}.sl-cv small{font-size:11.5px;color:#64748B;font-variant-numeric:tabular-nums;}'
    + '.sl-cv.view{border-color:#1B4FD8;box-shadow:0 0 0 3px rgba(27,79,216,.12);}.sl-cv.pro.view{border-color:#7C3AED;box-shadow:0 0 0 3px rgba(124,58,237,.14);}.sl-cv .sl-cur{position:absolute;top:-8px;right:8px;font-size:10px;font-weight:900;border-radius:8px;padding:1px 7px;background:#0F172A;color:#fff;}'
    + '.sl-adv{display:flex;flex-direction:column;gap:6px;border-radius:12px;padding:9px 11px;margin:0 0 8px;font-size:13px;line-height:1.4;background:#F8FAFC;border:1px solid #E2E8F0;color:#334155;}.sl-adv.pro{background:#F5F3FF;border-color:#DDD6FE;color:#4C1D95;}.sl-adv b{font-weight:900;}.sl-adv small{font-size:12px;color:#64748B;}'
    + '.sl-adv-b{display:flex;gap:6px;flex-wrap:wrap;}.sl-adv-b button{border:1px solid #DDD6FE;background:#fff;color:#6D28D9;border-radius:10px;padding:5px 10px;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer;}.sl-adv-b button.pri{background:#7C3AED;border-color:#7C3AED;color:#fff;}'
    + '.sl-pk-a{margin:6px 2px 0;font-size:11.5px;font-weight:700;color:#6D28D9;}.sl-pk-a.cl{color:#64748B;}.sl-pk-2 button.adv{border-style:dashed;border-color:#7C3AED;}'
    + '.sl-ck{border-radius:14px;padding:10px 12px;margin:0 0 10px;border:1px solid #E2E8F0;background:#fff;}.sl-ck h4{margin:0 0 2px;font-size:15px;font-weight:900;}.sl-ck.ok h4{color:#047857;}.sl-ck.partial h4{color:#B45309;}.sl-ck.miss h4{color:#B91C1C;}.sl-ck p{margin:2px 0;font-size:13px;color:#334155;line-height:1.4;}'
    + '.sl-ckt{width:100%;border-collapse:collapse;margin-top:6px;font-size:12.5px;font-variant-numeric:tabular-nums;}.sl-ckt th{text-align:left;font-size:11px;color:#64748B;font-weight:800;padding:3px 4px;}.sl-ckt td{padding:4px;border-top:1px solid #F1F5F9;color:#0F172A;}.sl-ckt td.ok{color:#047857;font-weight:800;}.sl-ckt td.slow{color:#B91C1C;font-weight:800;}.sl-ckt td.fast{color:#1B4FD8;font-weight:800;}'
    + '.sl-chn{margin:0 0 10px;font-size:12px;color:#64748B;}.sl-acts button.pro{background:#7C3AED;border-color:#7C3AED;color:#fff;}'
    + '.sl-pk{background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:8px;margin-top:6px;}.sl-pk-h{display:flex;justify-content:space-between;gap:8px;align-items:center;margin:0 2px 6px;font-size:12px;font-weight:800;color:#64748B;}.sl-pk-h button{border:0;background:none;font:inherit;font-size:12px;font-weight:800;color:#1B4FD8;cursor:pointer;padding:0;}'
    + '.sl-pk-2{display:grid;grid-template-columns:1fr 1fr;gap:6px;}.sl-pk-2 button{display:flex;flex-direction:column;gap:1px;text-align:left;border:1.5px solid #E2E8F0;background:#F8FAFC;border-radius:10px;padding:6px 8px;font:inherit;color:#64748B;cursor:pointer;min-width:0;}.sl-pk-2 button small{font-size:10px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;}.sl-pk-2 button span{font-size:12.5px;font-weight:700;line-height:1.25;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}'
    + '.sl-pk-2 button.on{background:#EEF3FC;border-color:#1B4FD8;color:#0F172A;}.sl-pk-2 button.pro.on{background:#F5F3FF;border-color:#7C3AED;}.sl-pk-2 button.pro small{color:#6D28D9;}.sl-pk-2 button:disabled{opacity:.55;cursor:default;}'
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
// séance vue dans son autre version (classique ou pro) : mêmes jour et créneau, autre contenu
function _slAltSession(s, v){
  const x = Object.assign({}, s.x || {}); if(v.lib) x.lib = v.lib; else delete x.lib;
  const det = v.d || '', pm = typeof PR_PACE_RE !== 'undefined' ? det.match(PR_PACE_RE) : null;
  let pace = null; if(pm && typeof prParsePace === 'function'){ const a = prParsePace(pm[1], pm[2]), b = pm[3] ? prParsePace(pm[3], pm[4]) : a; pace = { lo: Math.min(a, b), hi: Math.max(a, b), range: !!pm[3], text: pm[0] }; }
  return Object.assign({}, s, { title: v.t, detail: det, kmPlan: +v.km || s.kmPlan, type: v.type || s.type, x: x, pace: pace });
}
function _slBOf(s){ let D = null; try { D = slDetail(s, state); } catch(e) { diagSilent(e, 'session-lib-ui:_slBOf'); } return D; }
function _slSum(s){ const D = _slBOf(s), b = D && D.b; return String(b ? b.km : s.kmPlan).replace('.', ',') + ' km' + (b && b.min ? ' · ~' + b.min + ' min' : '') + (b && b.workMin ? ' · ' + b.workMin + ' min de travail' : '') + (D && D.L ? ' · ' + SL_STIM[D.L.stim].toLowerCase() : ''); }
let _slA = null;   // analyse du plan (prAnalyze) gardée quelques secondes pendant les choix
function _slAnalyze(){ if(_slA && _slA.st === state && Date.now() - _slA.t < 20000) return _slA.a; const a = prAnalyze(); _slA = { st: state, t: Date.now(), a: a }; return a; }
function _slChoiceOf(s){
  if(typeof _prepView !== 'undefined' && _prepView && !_prepView.next) return null;      // prépa consultée en lecture seule
  try { const a = _slAnalyze(), C = slChoice(state, s, a); if(C) C.adv = (a.advice || {})[s.key] || null; return C; } catch(e) { diagSilent(e, 'session-lib-ui:_slChoiceOf'); return null; }
}
// classique vs pro : minutes de travail et intensité (une phrase)
function _slCompare(s0, C){
  const sc = C.cur === 'classic' ? s0 : _slAltSession(s0, C.classic), sp = C.cur === 'pro' ? s0 : _slAltSession(s0, C.pro);
  const dc = _slBOf(sc), dp = _slBOf(sp); if(!dc || !dp) return '';
  const ic = SL_INTENS[dc.b.stim] || 0, ip = SL_INTENS[dp.L ? dp.L.stim : dp.b.stim] || 0, wc = dc.b.workMin || 0, wp = dp.b.workMin || 0;
  if(!wc && !wp) return dp.b.min && dc.b.min && Math.abs(dp.b.min - dc.b.min) >= 5 ? 'La pro : ~' + dp.b.min + ' min contre ~' + dc.b.min + ' min.' : '';
  return 'Travail : ' + (wc ? wc + ' min' : 'continu') + ' en classique, ' + (wp ? wp + ' min' : 'continu') + ' en pro' + (ip > ic ? ' (plus intense)' : ip < ic ? ' (moins intense)' : '') + '.';
}
function _slAdvHtml(s0, C, alt){
  const A = C && C.adv; if(!A) return '';
  const cmp = C.classic && C.pro ? _slCompare(s0, C) : '';
  const pro = A.rec === 'pro', btn = [];
  if(pro && C.cur === 'classic' && !alt) btn.push('<button type="button" class="pri" onclick="openSessionDetail(\'' + s0.key + '\',\'alt\')">Voir la pro</button>', '<button type="button" onclick="slAdviceNo(\'' + s0.key + '\')">Non merci</button>');
  return '<div class="sl-adv' + (pro ? ' pro' : '') + '"><span><b>' + (pro ? '✦ Pro conseillée' : 'La classique suffit') + '</b> · ' + _slEsc(A.why) + '</span>'
    + (cmp ? '<small>' + _slEsc(cmp) + '</small>' : '') + (btn.length ? '<div class="sl-adv-b">' + btn.join('') + '</div>' : '') + '</div>';
}
function _slChoiceHtml(s0, C, alt){
  if(!C || !C.classic || !C.pro) return '';
  const vs = [['classic', 'Classique', C.classic], ['pro', '✦ Pro', C.pro]];
  return '<div class="sl-ch" role="group" aria-label="Deux versions de la séance">' + vs.map(function(v){
    const mine = C.cur === v[0], view = alt ? !mine : mine, ss = mine ? s0 : _slAltSession(s0, v[2]);
    return '<button type="button" class="sl-cv' + (v[0] === 'pro' ? ' pro' : '') + (view ? ' view' : '') + '" aria-pressed="' + view + '" onclick="openSessionDetail(\'' + s0.key + '\'' + (mine ? '' : ',\'alt\'') + ')">'
      + (mine ? '<span class="sl-cur">✓ Ta séance</span>' : '') + '<em>' + v[1] + '</em><b>' + _slEsc(v[2].t) + '</b><small>' + _slEsc(_slSum(ss)) + '</small></button>';
  }).join('') + '</div>' + _slAdvHtml(s0, C, alt) + '<p class="sl-chn">' + (alt ? 'Tu regardes l\'autre version. Elle remplace ta séance si tu la prends.' : 'Deux versions possibles : touche l\'autre pour la voir.') + '</p>';
}
// séance faite : prévu vs fait, bloc par bloc (slCheck)
function _slCheckHtml(s){
  let C = null; try { C = slCheck(s, state); } catch(e) { diagSilent(e, 'session-lib-ui:_slCheckHtml'); }
  if(!C) return '';
  const sign = function(d){ return d ? (d > 0 ? '+' : '−') + Math.abs(d) + ' s' : '✓'; };
  return '<div class="sl-ck ' + C.verdict + '"><h4>' + (C.verdict === 'ok' ? '✓ ' : C.verdict === 'partial' ? '◐ ' : '✗ ') + C.label + '</h4><p>' + _slEsc(C.line) + '</p>'
    + C.notes.map(function(n){ return '<p style="color:#64748B;font-size:12px;">' + _slEsc(n) + '</p>'; }).join('')
    + (C.rows.length ? '<table class="sl-ckt"><tr><th>Bloc</th><th>Prévu</th><th>Fait</th><th>Écart</th></tr>' + C.rows.map(function(r){ return '<tr><td>' + r.i + '</td><td>' + _slPx(r.lo) + ' – ' + _slPx(r.hi) + '</td><td>' + _slPx(r.v) + '</td><td class="' + r.st + '">' + sign(r.d) + '</td></tr>'; }).join('') + '</table>' : '') + '</div>';
}
function openSessionDetail(key, view){
  const s0 = _slFindSession(key); if(!s0) return;
  const C = slChoosable(s0) ? _slChoiceOf(s0) : null;
  const altV = view === 'alt' && C && C.classic && C.pro ? (C.cur === 'pro' ? C.classic : C.pro) : null;
  const s = altV ? _slAltSession(s0, altV) : s0;
  const D = slDetail(s, state); if(!D){ if(typeof showToast === 'function') showToast('Détail indisponible : ton niveau n\'est pas encore connu', 'ℹ️'); return; }
  const b = D.b, L = D.L, today = prTodayIso();
  const day = s.date ? new Date(s.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  const PH = typeof slPhases === 'function' ? slPhases(state, today, b.ctx.cat) : {}, ph = PH[s.w] ? SL_PHASE[PH[s.w].phase] : '';
  let h = _slChoiceHtml(s0, C, !!altV) + (s0.done ? _slCheckHtml(s0) : '');
  h += '<div class="sl-tiles"><div class="sl-tile"><b>' + String(b.km).replace('.', ',') + '</b><small>km</small></div><div class="sl-tile"><b>~' + b.min + '</b><small>min</small></div>'
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
  if(L && !altV && !s.done && !s.skip && !ro && (L.type === 'tempo' || L.type === 'frac')){
    const pf = slPrefs(state), alts = SL_LIB.filter(function(T){ return T.id !== L.id && T.stim === L.stim && (T.type === 'tempo' || T.type === 'frac') && (!T.hill || pf.hills); }).slice(0, 4);
    if(alts.length) h += '<p class="sl-sec">Envie d\'autre chose ?</p><div class="sl-alt">' + alts.map(function(T){ return '<button type="button" onclick="slSwap(\'' + s.key + '\',\'' + T.id + '\')"><span><b>' + _slEsc(T.n) + '</b><br><small>' + _slEsc(T.why.split(':')[0].slice(0, 70)) + '</small></span><span>›</span></button>'; }).join('') + '</div>';
  }
  const acts = [];
  if(altV){
    const m = C.cur === 'pro' ? 'classic' : 'pro';
    acts.push('<button type="button" class="' + (m === 'pro' ? 'pro' : 'pri') + '" onclick="slPick(\'' + s0.key + '\',\'' + m + '\')">Prendre la version ' + (m === 'pro' ? 'pro' : 'classique') + '</button>');
    acts.push('<button type="button" onclick="openSessionDetail(\'' + s0.key + '\')">Garder ma séance</button>');
    h += '<div class="sl-acts">' + acts.join('') + '</div>';
    _slSheet('sl-ov', day, s0.title, (m === 'pro' ? 'Version pro : ' : 'Version classique : ') + s.title, h); return;
  }
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

// choisir la version d'une séance (classique ou pro) : un changement annulable, et le choix est retenu (le moteur ne la repasse pas en pro de lui-même)
function _slPickSet(keys, mode){
  const P = state._lib_pick && state._lib_pick.prep === slOfferKey(state) ? state._lib_pick : { prep: slOfferKey(state), k: {} };
  const k = Object.assign({}, P.k || {}); keys.forEach(function(x){ k[x] = mode; });
  state._lib_pick = { prep: P.prep, k: k };
}
function _slRefuse(type){ const R = Object.assign({}, state._lib_refuse || {}); R[type] = (R[type] || 0) + 1; state._lib_refuse = R; }
// « Non merci » sur un conseil : la séance reste classique, le moteur ne la repropose plus, et conseille moins ce type de séance
function slAdviceNo(key){
  const s = _slFindSession(key); if(!s) return;
  _slRefuse(s.type); _slPickSet([key], 'classic'); _slAfterPick();
  if(typeof showToast === 'function') showToast('C\'est noté : tu gardes la classique', '✓');
  openSessionDetail(key);
}
function slAutoSet(on){ state._lib_auto = !!on; save(); openLibPreview(); }
function _slAfterPick(){
  _slSelCache = null; _slA = null; save();
  if(typeof rendered !== 'undefined'){ rendered.plan = false; }
  try { if(typeof renderHome === 'function') renderHome(); } catch(e) { diagSilent(e, 'session-lib-ui:_slAfterPick'); }
}
function slPick(key, mode, from){
  const s = _slFindSession(key); if(!s) return;
  const C = _slChoiceOf(s), ch = slPickChange(state, s, C, mode);
  if(!ch){ if(typeof showToast === 'function') showToast(C && C.cur === mode ? 'C\'est déjà ta séance' : 'Pas d\'autre version pour cette séance', 'ℹ️'); return; }
  const r = prApplyChanges([ch], { kind: 'pick', at: new Date().toISOString() });
  if(!r.n){ if(typeof showToast === 'function') showToast('Séance déjà faite ou modifiée : rien changé', 'ℹ️'); return; }
  if(mode === 'classic' && C && C.adv && C.adv.rec === 'pro') _slRefuse(s.type);           // conseil refusé : retenu pour ce type de séance
  _slPickSet([key], mode); _slAfterPick();
  if(typeof showToast === 'function') showToast(mode === 'pro' ? 'Version pro : ' + ch.after.t : 'Version classique : ' + ch.after.t, mode === 'pro' ? '✦' : '✓');
  if(from === 'list') openLibPreview(); else openSessionDetail(key);
}
// toutes les séances à venir dans une version (liste « Tes séances : classique ou pro »)
function slPickAll(mode){
  if(mode === 'pro'){ slLibOn(); openLibPreview(); return; }
  const S = prSessions(state).filter(function(s){ return slChoosable(s) && s.x && s.x.lib; }), sel = [];
  S.forEach(function(s){ const ch = slPickChange(state, s, slChoice(state, s, null), 'classic'); if(ch) sel.push(ch); });
  const r = sel.length ? prApplyChanges(sel, { kind: 'pick', at: new Date().toISOString() }) : { n: 0 };
  _slPickSet(sel.map(function(c){ return c.key; }), 'classic');
  state._lib_on = null; state._lib_offer = { key: slOfferKey(state), answer: 'no', at: new Date().toISOString() };
  _slAfterPick();
  if(typeof showToast === 'function') showToast(r.n ? r.n + ' séance' + (r.n > 1 ? 's' : '') + ' en version classique' : 'Tes séances sont déjà classiques', '✓');
  openLibPreview();
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
  h += '<div class="sl-acts"><button type="button" onclick="openLibCatalog()">📚 La bibliothèque</button><button type="button" class="pri" onclick="openLibPreview()">Classique ou pro</button></div>';
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

// ─── Tes séances : classique ou pro — les deux versions de chaque séance à venir, choix séance par séance ───
// ce que chaque version t'apporte (slVersionStats) : une ligne, dès 3 séances de chaque
function _slVsHtml(a){
  let V = null; try { V = slVersionStats(state, a.opt.today); } catch(e) { diagSilent(e, 'session-lib-ui:_slVsHtml'); }
  if(!V || (!V.pro.n && !V.classic.n)) return '';
  const g = function(x){ return x.gain == null ? '' : ', ' + (x.gain >= 0 ? '+' : '') + String(x.gain).replace('.', ',') + ' de niveau en 3 sem.'; };
  const one = function(lbl, x){ return lbl + ' : ' + x.n + ' séance' + (x.n > 1 ? 's' : '') + (x.n ? ' (' + x.easy + ' facile' + (x.easy > 1 ? 's' : '') + g(x) + ')' : ''); };
  return '<p class="sl-p" style="margin-top:6px;font-size:12.5px;">' + _slEsc(one('Pro', V.pro) + ' · ' + one('Classique', V.classic)) + (V.best ? ' → <b>' + (V.best === 'pro' ? 'la pro te réussit : conseillée un peu plus souvent' : 'la classique te réussit : la pro est conseillée plus rarement') + '</b>' : '') + '</p>';
}
function openLibPreview(){
  const a = _slAnalyze(), today = a.opt.today, sel = slSelectCached(state, a), PH = slPhases(state, today, a.opt.raceCat || 'Semi-marathon');
  const proOf = {}; sel.forEach(function(p){ proOf[p.key] = p.after; });
  const S = prSessions(state).filter(function(s){ return slChoosable(s, today); }).sort(function(x, y){ return x.date.localeCompare(y.date); });
  const rows = S.map(function(s){ const pro = !!(s.x && s.x.lib); return { s: s, pro: pro, cl: pro ? slClassicOf(state, s) : { t: s.title }, pr: pro ? { t: s.title } : proOf[s.key] || null }; })
    .filter(function(r){ return r.cl && r.pr; });
  const nPro = rows.filter(function(r){ return r.pro; }).length, ADV = a.advice || {};
  const nAdv = rows.filter(function(r){ const A = ADV[r.s.key]; return A && A.rec === 'pro' && !r.pro; }).length;
  let h = '<div class="lvp-card"><p class="sl-p">Pour chaque séance, deux versions : <b>la classique</b> du plan, ou <b>une séance de coach</b> choisie pour ta phase et ton profil' + (a.profile && a.profile.focus.length ? ' (priorité : ' + _slEsc(a.profile.focus.map(function(k){ return SL_FOCUS[k] || k; }).join(', ')) + ')' : '') + '. Mêmes jours, volume proche. Tu choisis séance par séance.</p>'
    + '<p class="sl-p" style="margin-top:6px;font-weight:800;color:#0F172A;">' + nPro + ' en pro · ' + (rows.length - nPro) + ' en classique' + (nAdv ? ' · <span style="color:#6D28D9;">' + nAdv + ' pro conseillée' + (nAdv > 1 ? 's' : '') + '</span>' : '') + '</p>'
    + '<p class="sl-p" style="margin-top:4px;font-size:12.5px;color:#64748B;">La pro n\'est conseillée que quand elle sert : tu plafonnes, un point faible à travailler, la même séance qui revient, un moment clé.</p>' + _slVsHtml(a) + '</div>'
    + '<div class="sl-tog" style="margin-bottom:8px;"><span>🤖 Le pilote de nuit passe en pro les séances conseillées</span><button type="button" onclick="slAutoSet(' + (!state._lib_auto) + ')">' + (state._lib_auto ? 'Oui' : 'Non') + '</button></div>';
  if(!rows.length) h += '<p class="sl-p">Pas encore de version pro possible pour tes prochaines séances (niveau inconnu, ou séances de récupération et d\'affûtage).</p>';
  const byW = {}; rows.forEach(function(r){ (byW[r.s.w] = byW[r.s.w] || []).push(r); });
  Object.keys(byW).map(Number).sort(function(x, y){ return x - y; }).forEach(function(w){
    const wk = PH[w] || {};
    h += '<div class="sl-wk"><h4>S' + w + (wk.from ? ' · ' + _slEsc(prFmtDate(wk.from)) : '') + '<span>' + (SL_PHASE[wk.phase] || '') + (wk.recov ? ' · allégée' : '') + '</span></h4>'
      + byW[w].map(function(r){ const k = r.s.key;
        const A = ADV[k], ap = A && A.rec === 'pro';
        return '<div class="sl-pk" data-k="' + k + '"><p class="sl-pk-h"><span>' + _slEsc(prFmtDate(r.s.date, { weekday: 'short', day: 'numeric', month: 'short' })) + ' · ' + String(r.s.kmPlan).replace('.', ',') + ' km</span><button type="button" onclick="openSessionDetail(\'' + k + '\')">Détail ›</button></p><div class="sl-pk-2">'
          + '<button type="button" class="' + (r.pro ? '' : 'on') + '" aria-pressed="' + !r.pro + '" onclick="slPick(\'' + k + '\',\'classic\',\'list\')"><small>Classique</small><span>' + _slEsc(r.cl.t) + '</span></button>'
          + '<button type="button" class="pro' + (r.pro ? ' on' : '') + (ap && !r.pro ? ' adv' : '') + '" aria-pressed="' + r.pro + '" onclick="slPick(\'' + k + '\',\'pro\',\'list\')"><small>✦ Pro' + (ap ? ' conseillée' : '') + '</small><span>' + _slEsc(r.pr.t) + '</span></button></div>'
          + (A && (ap || (A.k === 'block' && r.pro)) ? '<p class="sl-pk-a' + (ap ? '' : ' cl') + '">' + (ap ? '✦ ' : '') + _slEsc(A.why) + '</p>' : '') + '</div>'; }).join('') + '</div>';
  });
  if(rows.length) h += '<div class="sl-acts"><button type="button" class="pro" onclick="slPickAll(\'pro\')">✦ Tout en pro</button><button type="button" onclick="slPickAll(\'classic\')">Tout en classique</button></div>';
  h += '<div class="sl-acts"><button type="button" onclick="openRunnerProfile()">Ton profil</button><button type="button" onclick="openLibCatalog()">La bibliothèque</button>' + (slOffer(state) ? '<button type="button" onclick="slLibLater()">Pas maintenant</button>' : '') + '</div>';
  const ov = _slSheet('sl-prev', 'Plan', 'Classique ou pro', 'Deux versions pour chaque séance : à toi de choisir', h);
  return ov;
}
function slLibOn(){
  const a = prAnalyze(), sel = slSelect(state, a), at = new Date().toISOString();
  const r = sel.length ? prApplyChanges(sel, { kind: 'libplan', vdot: a.fit && a.fit.vdot, at: at }) : { n: 0 }; _slA = null;
  state._lib_on = slOfferKey(state); state._lib_on_at = at; state._lib_offer = { key: slOfferKey(state), answer: 'yes', at: at };
  _slPickSet(sel.map(function(p){ return p.key; }), 'pro'); _slSelCache = null;
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
  const work = function(x){ if(x.rep) return x.steps.reduce(function(t, y){ return t + work(y); }, 0) * x.rep; return x.k === 'work' && (x.d || x.s) ? slMeasure(x, ctx).s : 0; };
  out.km = km; out.min = Math.round(sec / 60) || Math.round(km * 5.5); out.workMin = Math.round(out.steps.reduce(function(t, x){ return t + work(x); }, 0) / 60); out.text = s.detail;
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
