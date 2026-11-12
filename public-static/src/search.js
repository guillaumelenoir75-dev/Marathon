// ─── Recherche « Que veux-tu faire ? » ──────────────────────────────────────────────────────────────────────
// Loupe de l'accueil (#home-search-btn) et champ en tête du Compte → searchOpen() : une fenêtre plein écran, on tape
// « FC max », « chaussures », « malade »… et l'écran s'ouvre directement. Index SR_ITEMS {id, ic, t, g = où c'est, k = mots
// voisins, fn = fonction nécessaire, a = compte admin seulement, run}. searchFind(q, admin) : sans accents ni casse, chaque
// mot tapé doit commencer un mot de l'entrée (ou s'y trouver dès 3 lettres) ; titre > mots voisins. Récents : localStorage
// pm_sr_recent. searchRun(id) ouvre une entrée (aussi depuis l'adresse #/go/<id>, nav.js).
const _srAt = function(fn, id){ return function(){ showScreen(fn); if(id) setTimeout(function(){ if(typeof statsGo === 'function') statsGo(id); }, 450); }; };
const _srStats = function(tab, id){ return function(){ showScreen('stats'); if(typeof statsTab === 'function') statsTab(tab); if(id) setTimeout(function(){ if(typeof statsGo === 'function') statsGo(id); }, 500); }; };
const SR_ITEMS = [
  // onglets
  { id: 'home', ic: '🏠', t: 'Accueil', g: 'Onglet', k: 'ma journee aujourd hui seance du jour', run: function(){ showScreen('home'); } },
  { id: 'plan', ic: '📋', t: 'Mon plan', g: 'Onglet', k: 'programme semaines seances entrainement', run: function(){ showScreen('plan'); } },
  { id: 'renfo', ic: '🏋️', t: 'Renforcement', g: 'Onglet', k: 'renfo musculation gainage exercices', run: function(){ showScreen('renfo'); } },
  { id: 'stats', ic: '📊', t: 'Statistiques', g: 'Onglet', k: 'stats chiffres graphiques', run: function(){ showScreen('stats'); } },
  { id: 'coach', ic: '💬', t: 'Coach IA', g: 'Onglet', k: 'discuter question conseil brief', a: true, run: function(){ showScreen('coach'); } },
  { id: 'compte', ic: '👤', t: 'Compte', g: 'Onglet', k: 'reglages parametres profil', run: function(){ showScreen('compte'); } },
  // aujourd'hui
  { id: 'validate', ic: '✅', t: 'Valider ma séance', g: 'Validation', k: 'valider seance faite strava importer', fn: 'quickValidate', run: function(){ quickValidate(); } },
  { id: 'fin', ic: '🏁', t: 'J\'ai fini ma séance', g: 'Validation automatique', k: 'fini termine strava whoop meteo', fn: 'avFinish', a: true, run: function(){ avFinish(); } },
  { id: 'wake', ic: '🌅', t: 'Je suis réveillé', g: 'Réveil', k: 'reveil matin whoop synchro brief', fn: 'wakeupStart', a: true, run: function(){ wakeupStart(); } },
  { id: 'alcool', ic: '🍷', t: 'Alcool et récupération', g: 'Statistiques › Forme', k: 'alcool soiree biere vin recuperation', fn: 'openAlcoholInsights', a: true, run: function(){ openAlcoholInsights(); } },
  { id: 'weather', ic: '🌤️', t: 'Météo', g: 'Accueil', k: 'meteo temperature pluie vent chaleur', fn: 'openHomeWeatherModal', run: function(){ openHomeWeatherModal(); } },
  { id: 'sleep', ic: '🌙', t: 'Ta nuit · heure de coucher', g: 'Accueil', k: 'sommeil coucher dormir reveil nuit', fn: 'openSleepPlan', run: function(){ openSleepPlan(); } },
  // statistiques
  { id: 'forme', ic: '💚', t: 'Forme du jour', g: 'Statistiques › Forme', k: 'forme recuperation whoop sommeil vfc fc repos score', fn: 'statsTab', run: _srStats('forme') },
  { id: 'level', ic: '🎚️', t: 'Niveau du moment', g: 'Statistiques', k: 'niveau vdot progression evolution', fn: 'openLevelChart', run: function(){ openLevelChart(); } },
  { id: 'paces', ic: '📈', t: 'Évolution de mes allures', g: 'Statistiques › Entraînement', k: 'allure ef progression graphique 5 km 10 km semi marathon tempo seuil vma', fn: 'openPaceChart', run: function(){ openPaceChart(); } },
  { id: 'zones', ic: '🫀', t: 'Zones FC et allures', g: 'Statistiques › Entraînement', k: 'zones cardiaque frequence fc allures z2 endurance', fn: 'statsTab', run: _srStats('train', 'bs-stats-card') },
  { id: 'fcmax', ic: '❤️', t: 'Ma FC max', g: 'Compte', k: 'fc max frequence cardiaque maximale zones', run: function(){ if(typeof isAdmin === 'function' && isAdmin() && typeof openFcMaxEdit === 'function') openFcMaxEdit(); else _srAt('compte', 'athlete-panel')(); } },
  { id: 'fatigue', ic: '🔋', t: 'Forme / fatigue · charge', g: 'Statistiques › Forme', k: 'charge entrainement fraicheur fatigue banister affutage', fn: 'statsTab', run: _srStats('forme', 'fm-card') },
  { id: 'volume', ic: '📊', t: 'Volume par semaine', g: 'Statistiques › Entraînement', k: 'volume km kilometres semaine', fn: 'statsTab', run: _srStats('train') },
  { id: 'hist', ic: '🗂️', t: 'Historique des séances', g: 'Statistiques › Historique', k: 'seances passees liste performances anciennes', fn: 'statsTab', run: _srStats('hist') },
  { id: 'dq', ic: '🧹', t: 'Données suspectes', g: 'Statistiques › Entraînement', k: 'valeurs suspectes erreurs nettoyage gps capteur', fn: 'openDataQuality', run: function(){ openDataQuality(); } },
  { id: 'badges', ic: '🏅', t: 'Badges et série', g: 'Accueil', k: 'badges serie seances d affilee recompenses', fn: 'openBadges', run: function(){ openBadges(); } },
  // plan
  { id: 'review', ic: '🔄', t: 'Mettre à jour mon plan', g: 'Plan', k: 'maj ajuster allures relecture modifier adapter', fn: 'openPlanReview', run: function(){ showScreen('plan'); openPlanReview(); } },
  { id: 'imprevu', ic: '🤒', t: 'Imprévu · malade · indisponible', g: 'Plan', k: 'malade blessure absent voyage reorganiser decaler deplacer imprevu', fn: 'openImprevu', run: function(){ openImprevu(); } },
  { id: 'planchat', ic: '💬', t: 'Parler de mon plan au Coach', g: 'Coach › Mon plan', k: 'coach plan discuter changer', fn: 'openPlanChat', a: true, run: function(){ openPlanChat(); } },
  { id: 'raceplan', ic: '🏁', t: 'Plan de course', g: 'Accueil · semaine de la course', k: 'allures km par km ravitaillement gels jour j strategie', fn: 'openRacePlan', run: function(){ openRacePlan(); } },
  { id: 'raceana', ic: '🔍', t: 'Analyse de ma course', g: 'Après la course', k: 'analyse course resultat splits depart', fn: 'openRaceAnalysis', run: function(){ openRaceAnalysis(); } },
  { id: 'predict', ic: '🔮', t: 'Prédiction de temps', g: 'Accueil', k: 'prediction temps prevu chrono marathon semi 10 km', fn: 'openMarathonPredModal', run: function(){ openMarathonPredModal(); } },
  { id: 'weekshare', ic: '📸', t: 'Ta semaine en image', g: 'Accueil', k: 'partager semaine image instagram story', fn: 'openWeekShare', run: function(){ openWeekShare(); } },
  { id: 'renfoguide', ic: '▶️', t: 'Séance de renfo guidée', g: 'Renfo', k: 'renfo guide minuteur voix exercices', fn: 'openRenfoGuide', run: function(){ showScreen('renfo'); openRenfoGuide(); } },
  // courses et prépas
  { id: 'season', ic: '🗓️', t: 'Ma saison', g: 'Compte › Mes courses', k: 'saison courses annee calendrier objectifs etape', fn: 'openSeason', run: function(){ openSeason(); } },
  { id: 'nextrace', ic: '🧭', t: 'Ma prochaine course', g: 'Compte › Mes courses', k: 'prochaine prepa choisir course objectif', fn: 'openNextRace', run: function(){ openNextRace(); } },
  { id: 'preps', ic: '🏅', t: 'Mes prépas', g: 'Compte › Mes courses', k: 'prepas archive bilan anciennes nouvelle', fn: 'openPrepsPanel', run: function(){ openPrepsPanel(); } },
  { id: 'progress', ic: '📊', t: 'Comparer mes prépas', g: 'Mes prépas', k: 'comparer progression prepas', fn: 'openProgress', run: function(){ openProgress(); } },
  { id: 'records', ic: '🏆', t: 'Mes records', g: 'Compte › Mes courses', k: 'record pr meilleur temps chrono', fn: 'openRecordsModal', run: function(){ openRecordsModal(); } },
  // réglages
  { id: 'shoes', ic: '👟', t: 'Mes chaussures', g: 'Compte › Mon entraînement', k: 'chaussures paires km usure', fn: 'openShoesPanel', run: function(){ openShoesPanel(); } },
  { id: 'autopilot', ic: '🤖', t: 'Pilote automatique', g: 'Compte › Mon entraînement', k: 'ajustements nuit automatique pilote', fn: 'openAutopilotSettings', run: function(){ openAutopilotSettings(); } },
  { id: 'autoval', ic: '✅', t: 'Validation automatique', g: 'Compte › Mon entraînement', k: 'validation auto strava whoop meteo reglage', fn: 'avOpenSettings', run: function(){ avOpenSettings(); } },
  { id: 'qvhelp', ic: '⚡', t: 'Validation express · raccourci iPhone', g: 'Compte › Mon entraînement', k: 'raccourci iphone siri validation rapide', fn: 'openQuickValidateHelp', run: function(){ openQuickValidateHelp(); } },
  { id: 'connect', ic: '🔗', t: 'Connecter Strava / WHOOP', g: 'Compte › Applis connectées', k: 'strava whoop connexion synchroniser deconnecter', run: _srAt('compte', 'user-integrations') },
  { id: 'strava', ic: '🟠', t: 'Historique Strava', g: 'Compte › Applis connectées', k: 'strava historique import anciennes courses', fn: 'openStravaHistory', run: function(){ openStravaHistory(); } },
  { id: 'cal', ic: '📅', t: 'Abonnement calendrier', g: 'Compte › Applis connectées', k: 'calendrier agenda ical outlook google iphone', fn: 'showCalendarUrl', a: true, run: function(){ showCalendarUrl(); } },
  { id: 'profile', ic: '👤', t: 'Mes informations · mot de passe', g: 'Compte › Réglages', k: 'prenom email genre mot de passe profil', fn: 'openProfileModal', run: function(){ openProfileModal(); } },
  { id: 'prefs', ic: '🔔', t: 'Préférences · notifications', g: 'Compte › Réglages', k: 'notifications rappels preferences affichage', fn: 'openPrefsModal', run: function(){ openPrefsModal(); } },
  { id: 'theme', ic: '🌗', t: 'Thème · mode sombre', g: 'Compte › Réglages', k: 'theme sombre clair dark nuit couleurs', fn: 'themeOpen', run: function(){ themeOpen(); } },
  { id: 'glossary', ic: '📖', t: 'Glossaire', g: 'Compte › Aide et outils', k: 'glossaire definitions ef fc vo2max affutage aide', fn: 'openGlossary', run: function(){ openGlossary(); } },
  { id: 'export', ic: '📋', t: 'Exporter le plan', g: 'Compte › Aide et outils', k: 'exporter imprimer document pdf', fn: 'exportPlanDocument', a: true, run: function(){ exportPlanDocument(); } },
  { id: 'health', ic: '🛰️', t: 'Santé de l\'app', g: 'Compte › Aide et outils', k: 'sante pannes branchements taches bug', fn: 'openHealth', a: true, run: function(){ openHealth(); } },
  { id: 'diag', ic: '🩺', t: 'Diagnostic', g: 'Compte › Aide et outils', k: 'diagnostic erreurs bug lenteur demarrage', fn: 'diagOpen', run: function(){ diagOpen(); } },
  // suivi de course, administration
  { id: 'live', ic: '🏁', t: 'Course en direct', g: 'Compte › Suivi de course', k: 'suivi direct live amis gps', fn: 'openLivePanel', a: true, run: function(){ openLivePanel(); } },
  { id: 'users', ic: '👥', t: 'Comptes des athlètes', g: 'Compte › Administration', k: 'athletes comptes utilisateurs vue coach', fn: 'openUsersListModal', a: true, run: function(){ openUsersListModal(); } },
  { id: 'memos', ic: '🧠', t: 'Mémos du Coach', g: 'Coach', k: 'memos memoire notes faits', fn: 'openMemosModal', a: true, run: function(){ openMemosModal(); } },
  { id: 'logout', ic: '🚪', t: 'Se déconnecter', g: 'Compte', k: 'deconnexion quitter sortir', fn: 'logoutUser', run: function(){ logoutUser(); } },
];
const SR_SUGGEST = ['validate', 'paces', 'review', 'imprevu', 'shoes', 'records'];
const _srNorm = function(s){ return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); };
const _srHas = function(fn){ return !fn || (typeof window !== 'undefined' && typeof window[fn] === 'function') || (typeof globalThis !== 'undefined' && typeof globalThis[fn] === 'function'); };
function searchItems(admin){
  if(admin == null) admin = typeof isAdmin === 'function' && isAdmin();
  return SR_ITEMS.filter(function(x){ return (!x.a || admin) && _srHas(x.fn); });
}
// entrées triées par pertinence ; [] si rien ne correspond
function searchFind(q, admin){
  const words = _srNorm(q).split(' ').filter(Boolean); if(!words.length) return [];
  return searchItems(admin).map(function(x){
    const tw = _srNorm(x.t).split(' '), kw = _srNorm(x.k + ' ' + x.g).split(' ');
    let sc = 0;
    for(const w of words){
      const t = tw.some(function(y){ return y.indexOf(w) === 0; }) ? 3 : kw.some(function(y){ return y.indexOf(w) === 0; }) ? 2
        : w.length >= 3 && (_srNorm(x.t).indexOf(w) >= 0 || _srNorm(x.k).indexOf(w) >= 0) ? 1 : 0;
      if(!t) return null;
      sc += t;
    }
    if(_srNorm(x.t).indexOf(_srNorm(q)) === 0) sc += 2;
    return { x: x, sc: sc };
  }).filter(Boolean).sort(function(a, b){ return b.sc - a.sc || a.x.t.length - b.x.t.length; }).map(function(r){ return r.x; });
}
function _srRecent(){ try { return JSON.parse(localStorage.getItem('pm_sr_recent') || '[]') || []; } catch(e) { return []; } }
function searchRun(id){
  const x = searchItems().filter(function(y){ return y.id === id; })[0]; if(!x) return false;
  try { const r = _srRecent().filter(function(y){ return y !== id; }); r.unshift(id); localStorage.setItem('pm_sr_recent', JSON.stringify(r.slice(0, 5))); } catch(e) {}
  const ov = document.getElementById('sr-ov'); if(ov) ov.remove();
  try { x.run(); } catch(e) { console.warn('[recherche]', id, e); }
  return true;
}
function searchOpen(prefill){
  _srCss();
  let ov = document.getElementById('sr-ov'); if(ov) ov.remove();
  ov = document.createElement('div'); ov.id = 'sr-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Rechercher');
  ov.innerHTML = '<div class="sr-box"><div class="sr-hd"><label class="sr-in"><span aria-hidden="true">🔍</span><input id="sr-q" type="search" enterkeyhint="go" autocomplete="off" placeholder="Que veux-tu faire ?" aria-label="Que veux-tu faire ?"></label>'
    + '<button type="button" class="sr-x" aria-label="Fermer" onclick="document.getElementById(\'sr-ov\').remove()">Fermer</button></div><div class="sr-res" id="sr-res"></div></div>';
  document.body.appendChild(ov);
  const q = ov.querySelector('#sr-q');
  q.addEventListener('input', function(){ _srRender(q.value); });
  q.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ const f = searchFind(q.value)[0]; if(f) searchRun(f.id); } if(e.key === 'Escape') ov.remove(); });
  if(prefill) q.value = prefill;
  _srRender(q.value);
  setTimeout(function(){ try { q.focus(); } catch(e) {} }, 30);
}
function _srRow(x){
  return '<button type="button" class="sr-r" onclick="searchRun(\'' + x.id + '\')"><span class="sr-ic" aria-hidden="true">' + x.ic + '</span><span class="sr-t"><b>' + _srEsc(x.t) + '</b><small>' + _srEsc(x.g) + '</small></span><span class="sr-go" aria-hidden="true">›</span></button>';
}
const _srEsc = function(s){ return String(s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
function _srRender(q){
  const el = document.getElementById('sr-res'); if(!el) return;
  const items = searchItems(), byId = function(id){ return items.filter(function(x){ return x.id === id; })[0]; };
  if(!_srNorm(q)){
    const rec = _srRecent().map(byId).filter(Boolean), sug = SR_SUGGEST.map(byId).filter(function(x){ return x && rec.indexOf(x) < 0; });
    el.innerHTML = (rec.length ? '<p class="sr-sec">Récents</p>' + rec.map(_srRow).join('') : '') + '<p class="sr-sec">Suggestions</p>' + sug.map(_srRow).join('');
    return;
  }
  const R = searchFind(q);
  el.innerHTML = R.length ? R.slice(0, 12).map(_srRow).join('') : '<p class="sr-none">Rien trouvé pour « ' + _srEsc(q) + ' ». Essaie un autre mot : allure, chaussures, malade, records…</p>';
}
function _srCss(){
  if(document.getElementById('sr-css')) return;
  const st = document.createElement('style'); st.id = 'sr-css';
  st.textContent = '#sr-ov{position:fixed;inset:0;z-index:780;background:rgba(15,23,42,.35);display:flex;justify-content:center;animation:_overlayFadeIn .15s ease;}'
    + '.sr-box{width:100%;max-width:480px;height:100%;background:#F3F6FC;display:flex;flex-direction:column;padding-top:env(safe-area-inset-top,0px);}'
    + '.sr-hd{display:flex;align-items:center;gap:8px;padding:12px 14px 10px;background:#F3F6FC;border-bottom:1px solid #E2E8F0;}'
    + '.sr-in{flex:1;min-width:0;display:flex;align-items:center;gap:8px;background:#fff;border:1.5px solid #C7D2FE;border-radius:14px;padding:9px 12px;}.sr-in input{flex:1;min-width:0;border:none;outline:none;background:transparent;font:inherit;font-size:16px;color:#0F172A;-webkit-appearance:none;appearance:none;box-shadow:none;}.sr-in:focus-within{border-color:#6366F1;}'
    + '.sr-x{border:none;background:none;color:#1D4ED8;font:inherit;font-size:14px;font-weight:700;cursor:pointer;padding:6px 2px;}'
    + '.sr-res{flex:1;overflow-y:auto;padding:6px 14px 30px;display:flex;flex-direction:column;gap:6px;-webkit-overflow-scrolling:touch;}'
    + '.sr-sec{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#64748B;margin:10px 2px 2px;}'
    + '.sr-r{display:flex;align-items:center;gap:11px;width:100%;background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:10px 12px;font:inherit;text-align:left;cursor:pointer;color:inherit;}.sr-r:active{background:#EEF2FF;}'
    + '.sr-ic{width:34px;height:34px;border-radius:10px;background:#EEF2FD;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;}'
    + '.sr-t{flex:1;min-width:0;display:flex;flex-direction:column;}.sr-t b{font-size:14px;font-weight:750;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.sr-t small{font-size:11.5px;color:#64748B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.sr-go{color:#B6C0CE;font-size:18px;}.sr-none{font-size:13px;color:#64748B;text-align:center;padding:30px 12px;line-height:1.5;}'
    + '.cp-search{display:flex;align-items:center;gap:8px;width:100%;margin:0 0 4px;background:#fff;border:1px solid #DCE5F3;border-radius:14px;padding:11px 14px;font:inherit;font-size:14px;color:#64748B;text-align:left;cursor:pointer;}';
  document.head.appendChild(st);
}
try { if(typeof window !== 'undefined' && window.document && document.head && typeof document.head.appendChild === 'function') _srCss(); } catch(e) {}
