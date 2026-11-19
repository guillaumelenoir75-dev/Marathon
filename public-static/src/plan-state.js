// Au chargement : un admin resté sur l'ancien plan Seine-Eure écrit en dur (séances déjà au format du programme) passe une fois
// au format du programme (prepLegacyConvert, plan-optim.js : moteur, date de début, course, semaines de décharge / affûtage)
function migrateState(){
  if(typeof isAdmin !== 'function' || !isAdmin() || (typeof _prepView !== 'undefined' && _prepView) || (typeof _adminPreviewUid !== 'undefined' && _adminPreviewUid)) return;
  if(typeof prepLegacyKeys !== 'function' || !state) return;
  const up = prepLegacyKeys(state); if(!up) return;
  Object.assign(state, up);
  if(typeof dbRef !== 'undefined' && dbRef) dbRef.update(up).catch(function(e){ console.warn('[prépa] conversion Seine-Eure', e); });
  if(typeof syncPlanCompat === 'function') syncPlanCompat();
}

// Table EF → AM (depuis Excel)
const EF_AM_TABLE=[
  // Mapping allure EF (FC ≤ plafond EF, hrEfMax : 148 par défaut) → allure marathon cible
  // Règle : allure marathon ≈ allure EF + ~55s/km pour coureur intermédiaire
  // (une EF à 6'00 = coureur qui peut courir un marathon ~5'45/km soit ~4h02)
  {efSec:7*60+30, amStr:"6'35"},
  {efSec:7*60+15, amStr:"6'20"},
  {efSec:7*60+0,  amStr:"6'05"},
  {efSec:6*60+45, amStr:"5'50"},
  {efSec:6*60+30, amStr:"5'45"},
  {efSec:6*60+15, amStr:"5'42"},
  {efSec:6*60+0,  amStr:"5'40"},
  {efSec:5*60+50, amStr:"5'35"},
  {efSec:5*60+40, amStr:"5'30"},
  {efSec:5*60+30, amStr:"5'22"},
  {efSec:5*60+20, amStr:"5'15"},
  {efSec:5*60+10, amStr:"5'07"},
  {efSec:5*60+0,  amStr:"5'00"},
  {efSec:4*60+50, amStr:"4'52"},
  {efSec:4*60+40, amStr:"4'44"},
  {efSec:4*60+30, amStr:"4'36"},
  {efSec:4*60+20, amStr:"4'28"},
  {efSec:4*60+10, amStr:"4'20"},
  {efSec:4*60+0,  amStr:"4'12"},
];

function getBestEfPace(){
  // EF saisie manuellement (non auto-calculée) : priorité absolue sur les sessions
  if(state.ef_pace && state.ef_pace_auto !== 'true') return state.ef_pace;
  // une seule allure EF réelle dans toute l'app (en-tête, bandeau, zones de Statistiques, brief du Coach) : médiane des 5 dernières
  // sorties EF / longues à FC ≤ plafond sur 6 semaines, sur plat et au frais, lendemains d'alcool exclus (prObservedEf, plan-review.js)
  try {
    if(typeof prObservedEf === 'function' && typeof prTodayIso === 'function'){
      const o = prObservedEf(state, prTodayIso());
      if(o) return Math.floor(o / 60) + "'" + String(Math.round(o % 60)).padStart(2, '0');
    }
  } catch(e) { diagSilent(e, 'plan-state:getBestEfPace'); }
  // pas assez de sorties récentes : ancien calcul (allure brute, tout l'historique)
  const paces=[]; // valeurs EF valides, ordre chronologique (secondes/km)
  // Seed : EF déclarée à l'onboarding
  if(state.ef_pace){
    const fb=paceStrToSec(state.ef_pace.replace("'",":"));
    if(fb!==null) paces.push(fb);
  }
  // séances EF de tout l'historique (toutes les prépas, plan Seine-Eure compris), par date
  histEfSessions().forEach(s=>paces.push(s.sec));
  if(paces.length===0) return "6'40";

  let refSec;
  if(paces.length<3){
    // Moins de 3 sessions : prendre le meilleur (le plus rapide)
    refSec=Math.min(...paces);
  } else {
    // Fenêtre glissante sur les 3 dernières sessions EF valides
    const last3=paces.slice(-3);
    const before3=paces.slice(0,-3);
    // Référence précédente = meilleur des sessions avant la fenêtre
    // (ou la session la plus ancienne de la fenêtre s'il n'y a rien avant)
    const prevBest=before3.length>0?Math.min(...before3):last3[0];
    const minLast3=Math.min(...last3);
    const medLast3=[...last3].sort((a,b)=>a-b)[1]; // médiane des 3
    if(minLast3<=prevBest){
      // Au moins une bonne session dans les 3 dernières → prendre la meilleure
      refSec=minLast3;
    } else {
      // Les 3 dernières sont toutes au-dessus de la référence précédente
      // → stabilisé à ce niveau (chaleur persistante, fatigue, etc.) → médiane
      refSec=medLast3;
    }
  }
  const m=Math.floor(refSec/60);
  const s=Math.round(refSec%60);
  return `${m}'${s.toString().padStart(2,'0')}`;
}

// ── Auto-calcul EF depuis les séances de la semaine 1 ────────────────────────
// Déclenché après validation d'une séance S1 si ef_pace n'a jamais été défini.
// Utilise l'allure la plus lente des séances EF/longues validées de S1
// (estimation conservative : on prend la valeur la plus facile pour ne pas
// prescrire un EF trop soutenu).
// Regénère ensuite le plan entier pour injecter les allures dans les descriptions S2+.
async function tryAutoCalculateEF(){
  if(state.ef_pace) return null;
  // Plan Découverte : allure inclut la marche → ne pas auto-calculer l'EF
  let cfg=null;try{cfg=state.plan_config?JSON.parse(state.plan_config):null;}catch(e){}
  if(cfg&&cfg.niveau==='Découverte') return null;
  const efPaces=[];
  let ei=0;
  while(ei<=20&&state[`extra_w1_s${ei}`]!==undefined){
    try{
      const s=JSON.parse(state[`extra_w1_s${ei}`]);
      if((s.type==='ef'||s.type==='long')&&state[`extra_w1_s${ei}_done`]){
        const perf=state[`extra_w1_s${ei}_perf`]?JSON.parse(state[`extra_w1_s${ei}_perf`]):{};
        if(perf.pace){
          const sec=paceStrToSec(perf.pace);
          if(sec!==null&&sec>200) efPaces.push(sec);
        }
      }
    }catch(e){}
    ei++;
  }
  // sorties EF / longues des 6 dernières semaines, toutes prépas confondues : plus fiable que la seule 1re semaine
  const hist=typeof prAllDone==='function'?prAllDone().filter(s=>(s.type==='ef'||s.type==='long')&&s.perf&&s.perf.pace&&prDays(s.date,prTodayIso())<=42)
    .map(s=>paceStrToSec(String(s.perf.pace))).filter(x=>x!==null&&x>200):[];
  let efSec;
  const obs=typeof prObservedEf==='function'?prObservedEf(state,prTodayIso()):null;   // même calcul que partout ailleurs (FC ≤ plafond, sur plat)
  if(obs){ efSec=Math.round(obs); state.ef_pace_src='hist'; }
  else if(hist.length>=3){ const srt=hist.slice(-5).sort((a,b)=>a-b); efSec=srt[Math.floor(srt.length/2)]; state.ef_pace_src='hist'; }
  else if(efPaces.length) efSec=Math.max(...efPaces);   // la plus lente de la 1re semaine (estimation prudente)
  else return null;
  const m=Math.floor(efSec/60);
  const s=efSec%60;
  const efStr=`${m}'${s.toString().padStart(2,'0')}`;
  state.ef_pace=efStr;
  state.ef_pace_auto='true';
  const dbUpdates={ef_pace:efStr,ef_pace_auto:'true'};
  if(state.ef_pace_src) dbUpdates.ef_pace_src=state.ef_pace_src;
  // Regénérer le plan avec la nouvelle allure EF (descriptions S2+ mises à jour) — jamais pour un programme
  // fourni et installé tel quel (Mes prépas › prépa prête : plan_version « import-… »)
  try{
    const cfg=state.plan_config?JSON.parse(state.plan_config):null;
    if(cfg&&!String(state.plan_version||'').startsWith('import-')){
      const runDays=typeof state.run_days==='string'?JSON.parse(state.run_days||'[]'):(state.run_days||[]);
      const runTimes=typeof state.run_times==='string'?JSON.parse(state.run_times||'{}'):(state.run_times||{});
      const ob={
        course:cfg.course,niveau:cfg.niveau,
        sessions:String(cfg.nbSess),km_semaine:String(cfg.baseKm),
        date:cfg.date||'',
        ef_pace:efStr,
        target_time:state.target_time||'',
        fc_max:state.fc_max||'',
        run_days:runDays,run_times:runTimes,run_time:state.run_time||'',
      };
      const planUpdates=generateAthletePlan({...ob,recette:state._recette||null});
      Object.entries(planUpdates).forEach(([k,v])=>{ state[k]=v; });
      Object.assign(dbUpdates,planUpdates);
    }
  }catch(e){ console.warn('tryAutoCalculateEF regen:',e); }
  if(dbRef) await dbRef.update(dbUpdates).catch(e=>console.warn('autoEF save:',e));
  return efStr;
}

function calcMarathonTime(amStr){
  // AM format "5'40" ou "5'35" → temps sur 42.195 km
  if(!amStr) return null;
  const sec=paceStrToSec(amStr.replace("'",":"));
  if(!sec) return null;
  const totalSec=Math.round(sec*42.195);
  const h=Math.floor(totalSec/3600);
  const m=Math.floor((totalSec%3600)/60);
  const s=totalSec%60;
  return `${h}h${m.toString().padStart(2,'0')}`;
}

// ── MODÈLE VDOT (Jack Daniels) + DONNÉES RÉELLES ─────────────────────────────
function getVo2max() { return parseFloat(state['vo2max_current']) || 52; }

function vdotMarathonPaceSec(vo2max) {
  // Formule Jack Daniels : VO2(v) = -4.60 + 0.182258v + 0.000104v² (v en m/min)
  // Marathon = 79% VO2max
  const target = vo2max * 0.79;
  let lo = 150, hi = 400;
  for(let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const vo2 = -4.60 + 0.182258 * mid + 0.000104 * mid * mid;
    if(vo2 < target) lo = mid; else hi = mid;
  }
  return Math.round(1000 / ((lo+hi)/2) * 60); // sec/km
}

function paceStrToSec(p){
  const m=p.replace("'",":").split(':');
  if(m.length<2) return null;
  return parseInt(m[0])*60+parseInt(m[1]);
}

function secToPace(sec){
  let m=Math.floor(sec/60);
  let s=Math.round(sec%60);
  if(s===60){m++;s=0;}
  return m+"'"+(s+'').padStart(2,'0');
}

// séances EF valides (allure + FC ≤ plafond EF) de tout l'historique, par date : { date, sec, hr, km, s }
function histEfSessions(){
  if(typeof prAllDone!=='function') return [];
  return prAllDone().filter(s=>s.type==='ef'&&s.perf&&s.perf.pace&&s.perf.hr&&parseInt(s.perf.hr)<=hrEfMax())
    .map(s=>({date:s.date,sec:paceStrToSec(String(s.perf.pace)),hr:parseInt(s.perf.hr),km:s.km,s})).filter(x=>x.sec!==null);
}
function calcMarathonPace(){
  const validEF=histEfSessions();
  if(validEF.length===0) return state._am_pace||"5'40";
  const lastSec=validEF[validEF.length-1].sec;
  const sorted=[...EF_AM_TABLE].reverse();
  for(const row of sorted){
    if(lastSec<=row.efSec) return row.amStr;
  }
  return "5'40";
}

function updateMarathonPace(){
  const am=calcMarathonPace();
  const prev=state._am_pace||"5'40";
  // Auto-reset si _am_pace stocké est incohérent avec le modèle (>10 min trop rapide)
  const pred = buildMarathonPrediction();
  if(pred && pred.tempsSec) {
    const storedPaceSec = paceStrToSec((prev||"5'40").replace("'",":"));
    const storedTimeSec = storedPaceSec ? Math.round(storedPaceSec * 42.195) : null;
    if(storedTimeSec && storedTimeSec < pred.tempsSec - 600) {
      // La valeur stockée est > 10 min trop optimiste vs le modèle → reset
      state._am_pace = am;
    }
  }
  state._am_pace=am;
  if(am!==prev) save();
  // Tout mettre à jour via renderHome (h-am-pace, kpi-ef-pace, kpi-marathon-time, kpi-am-ref)
  renderHome();
  const prevSec=paceStrToSec(prev.replace("'",":"));
  const newSec=paceStrToSec(am.replace("'",":"));
  if(am!==prev){
    if(newSec<prevSec) return 'improved';
    if(newSec>prevSec) return 'regressed';
  }
  return false;
}

// Source de vérité unique pour distinguer un coureur "plaisir" d'un coureur avec objectif de course.
// À utiliser partout à la place de `course === 'Plaisir'` inline.
function isPlaisirMode(st) {
  const course = ((st || state).onboarding || {}).course;
  return !course || course === 'Plaisir';
}

function save(){
  if(typeof prHistoryChanged==='function') prHistoryChanged();   // historique des analyses à recalculer (plan-optim.js)
  // seulement les clés modifiées (sync.js) : une écriture du serveur ou d'un autre appareil n'est pas écrasée ; gardé sans réseau
  if(typeof syncSave==='function') syncSave();
  else if(dbRef) dbRef.set(state).catch(e=>console.error('Firebase save error:',e));
  if(typeof syncPlanCompat==='function'&&isAdmin()) syncPlanCompat();   // séances ajoutées/modifiées
  setTimeout(checkCoachAlerts, 100);
}
function getAmTrainingPace(){
  // Retourne l'allure AM d'entraînement (modifiable manuellement)
  // Priorité : valeur manuelle > prédicteur
  return state._am_training_pace || getMarathonPaceStr();
}

function getMarathonPaceStr(){
  return state._am_pace||calcMarathonPace()||"5'40";
}
// calcSessionDuration est maintenant un alias de estimateDuration
// (voir plus bas)



function filterDetailDisplay(title, detail){
  if(!detail) return detail;
  // Si 1 répétition, ne pas afficher le temps de récup
  const repMatch=title.match(/(\d+)×/);
  if(repMatch && parseInt(repMatch[1])===1){
    return detail.replace(/\s*·?\s*[\d:]+\s*min\s*r[eé]cup/i,'').trim().replace(/\s*·\s*$/,'').trim();
  }
  return detail;
}

function rfk(w,r){return `rf${w}r${r}`;}

// ── MÉTÉO — Open-Meteo (gratuit, sans clé API) ──────────────────────────────

const _WMO_LABELS_DAY = {
  0:'Ciel dégagé ☀️', 1:'Peu nuageux 🌤️', 2:'Partiellement nuageux ⛅', 3:'Couvert ☁️',
  45:'Brouillard 🌫️', 48:'Brouillard givrant 🌫️',
  51:'Bruine légère 🌦️', 53:'Bruine modérée 🌦️', 55:'Bruine dense 🌦️',
  61:'Pluie légère 🌧️', 63:'Pluie modérée 🌧️', 65:'Pluie forte 🌧️',
  71:'Neige légère 🌨️', 73:'Neige modérée 🌨️', 75:'Neige forte 🌨️', 77:'Grésil 🌨️',
  80:'Averses légères 🌦️', 81:'Averses modérées 🌦️', 82:'Averses violentes ⛈️',
  95:'Orage ⛈️', 96:'Orage avec grêle ⛈️', 99:'Orage violent ⛈️'
};
const _WMO_LABELS_NIGHT = {
  0:'Ciel dégagé 🌙', 1:'Peu nuageux 🌙', 2:'Partiellement nuageux 🌑', 3:'Couvert ☁️',
  45:'Brouillard 🌫️', 48:'Brouillard givrant 🌫️',
  51:'Bruine légère 🌧️', 53:'Bruine modérée 🌧️', 55:'Bruine dense 🌧️',
  61:'Pluie légère 🌧️', 63:'Pluie modérée 🌧️', 65:'Pluie forte 🌧️',
  71:'Neige légère 🌨️', 73:'Neige modérée 🌨️', 75:'Neige forte 🌨️', 77:'Grésil 🌨️',
  80:'Averses légères 🌦️', 81:'Averses modérées 🌦️', 82:'Averses violentes ⛈️',
  95:'Orage ⛈️', 96:'Orage avec grêle ⛈️', 99:'Orage violent ⛈️'
};

const _GLOSSARY = [
  {
    section: 'Types de séances',
    terms: [
      { id:'ef', label:'EF — Endurance Fondamentale', body:'Ton allure de base, celle où tu peux tenir une conversation. Confort total, tu n\'es jamais à bout de souffle. C\'est 70–80 % de ton volume hebdomadaire. Elle développe l\'aérobie, améliore l\'utilisation des graisses et favorise la récupération entre les séances dures.' },
      { id:'tempo', label:'Tempo', body:'Allure soutenue mais contrôlée — inconfortable, mais pas à fond. Tu peux prononcer des mots mais pas faire une phrase complète. Généralement 20–40 min en continu. Améliore le seuil lactique : tu cours plus vite sans t\'essouffler.' },
      { id:'frac', label:'F — Fractionné', body:'Intervalles courts et intenses entrecoupés de récupération (trot ou marche). Exemple : 6 × 2 min rapide, 2 min de trot. Développe la VO₂max et la vitesse de course. Séance exigeante, à récupérer sérieusement après.' },
      { id:'long', label:'L — Sortie longue', body:'La séance clé du plan, en général le weekend. Allure EF ou légèrement plus rapide en fin. Habitue le corps à encaisser la distance, développe les réserves de glycogène et entraîne l\'utilisation des graisses comme carburant principal.' },
      { id:'am', label:'AM — Allure Marathon', body:'L\'allure à laquelle tu vises de courir ta course. Légèrement plus rapide que l\'EF, très maîtrisée. Dans le plan, des blocs AM apparaissent dans les sorties longues en phase Spécifique pour t\'y habituer.' },
    ]
  },
  {
    section: 'Physiologie & mesures',
    terms: [
      { id:'allure', label:'Allure (min/km)', body:'Temps mis pour courir un kilomètre. Exemple : 5:30/km = 5 minutes et 30 secondes par kilomètre. Plus le chiffre est bas, plus tu cours vite. À ne pas confondre avec la vitesse en km/h (qui s\'inverse).\n\n<strong>Niveaux indicatifs :</strong> Découverte &gt; 8\'00/km · Débutant 7\'00–8\'00 · Intermédiaire 5\'30–7\'00 · Confirmé &lt; 5\'30 (allure EF confortable).' },
      { id:'fc', label:'FC — Fréquence Cardiaque', body:'Nombre de battements de cœur par minute (bpm). En course, la FC monte avec l\'effort. Les zones de FC permettent de calibrer l\'intensité des séances : une EF se court à 65–75 % de ta FC max.' },
      { id:'fcmax', label:'FC max', body:'Ta fréquence cardiaque maximale — le nombre de bpm que ton cœur peut atteindre à l\'effort maximal. Elle est individuelle (ne dépend pas de la forme du jour). Estimation rapide : 220 – âge, mais mesurer sur le terrain est plus fiable.' },
      { id:'fcrepos', label:'FC repos', body:'Ta fréquence cardiaque au réveil, avant de te lever. Un coureur entraîné l\'a généralement entre 40 et 55 bpm. Une FC repos plus élevée que d\'habitude (+5 bpm) est un signal de fatigue ou de maladie : adapter l\'entraînement.' },
      { id:'vo2max', label:'VO₂max', body:'Volume maximal d\'oxygène (en ml) que ton corps peut consommer par minute et par kg de poids. C\'est l\'indicateur clé de la capacité aérobie. Une VO₂max élevée permet de courir vite longtemps. Elle s\'améliore avec le fractionné et la régularité.' },
      { id:'vfc', label:'VFC — Variabilité de la FC', body:'Variation du temps entre deux battements consécutifs. Une VFC élevée indique que le système nerveux est bien récupéré — le corps est prêt à encaisser une séance dure. Une VFC basse signale de la fatigue ou du stress. Mesurée notamment par WHOOP et Garmin.' },
    ]
  },
  {
    section: 'Phases du plan',
    terms: [
      { id:'base', label:'Phase Base', body:'Première phase du plan. Volume modéré, allures faciles, travail de fond. L\'objectif est de construire une base aérobie solide avant d\'augmenter l\'intensité. C\'est la phase la plus longue et la plus déterminante du plan.' },
      { id:'construction', label:'Phase Construction', body:'Montée en charge progressive. Le volume augmente, les premiers tempos et fractionnés apparaissent. La fatigue s\'accumule — c\'est normal et voulu. Le corps s\'adapte à des charges qu\'il n\'avait jamais vues.' },
      { id:'specifique', label:'Phase Spécifique', body:'Préparation directe à la compétition. Séances longues à allure marathon, simulations de parcours. Volume proche du pic, intensité haute. Le pic de forme est juste devant toi.' },
      { id:'affutage', label:'Affûtage', body:'Réduction progressive du volume (pas de l\'intensité) dans les 2–3 semaines avant la course. Le corps stocke de l\'énergie et répare les micro-lésions musculaires. Se sentir "pas assez entraîné" est normal — c\'est le signe que tu récupères bien.' },
      { id:'decharge', label:'Semaine de décharge', body:'Semaine de récupération intercalée toutes les 3–4 semaines. Volume réduit de 20–30 %. Indispensable pour absorber le travail accumulé, éviter le surentraînement et progresser réellement.' },
      { id:'pic', label:'Semaine Pic', body:'La semaine de volume le plus élevé de tout le plan. Elle marque le sommet de la préparation avant le début de l\'affûtage. Après le pic, le corps commence à récupérer pour être au maximum le jour J.' },
    ]
  }
];


function openGlossary(termId) {
  const mc = document.getElementById('modal-container');
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.style.setProperty('--_overlay-bg','rgba(0,0,0,0.45)');
  let sectionsHtml = '';
  _GLOSSARY.forEach(sec => {
    sectionsHtml += `<p style="font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin:0 0 10px;">${sec.section}</p>`;
    sec.terms.forEach(t => {
      sectionsHtml += `<div id="glossary-term-${t.id}" style="margin-bottom:14px;padding:12px 14px;background:var(--bg2);border-radius:12px;border:1.5px solid var(--border);transition:background 0.3s;">
        <p style="font-size:13px;font-weight:700;color:var(--text);margin:0 0 5px;">${t.label}</p>
        <p style="font-size:12px;color:var(--muted);margin:0;line-height:1.55;">${t.body}</p>
      </div>`;
    });
    sectionsHtml += '<div style="height:10px;"></div>';
  });
  ov.innerHTML = `<div class="modal-box" style="max-height:90vh;overflow-y:auto;" id="glossary-modal-box">
    <div style="background:linear-gradient(135deg,#0C447C,#1B4FD8);padding:20px 20px 16px;border-radius:var(--radius) var(--radius) 0 0;position:sticky;top:0;z-index:1;">
      <div style="width:36px;height:4px;border-radius:4px;background:rgba(255,255,255,0.3);margin:0 auto 14px;"></div>
      <p style="font-size:17px;font-weight:800;color:#fff;margin:0;">Glossaire</p>
      <p style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:4px;">Tous les termes de la course à pied</p>
    </div>
    <div style="padding:20px;" id="glossary-content">${sectionsHtml}</div>
    <div style="padding:0 20px 20px;">
      <button onclick="closeModal()" style="width:100%;padding:13px;background:#EEF2FD;color:#1B4FD8;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;">Fermer</button>
    </div>
  </div>`;
  ov.onclick = e => { if(e.target === ov) closeModal(); };
  _lockBodyScroll();
  mc.appendChild(ov);
  _initSwipeToDismiss(ov, ov.querySelector('.modal-box'));
  if(termId) {
    setTimeout(() => {
      const el = document.getElementById('glossary-term-' + termId);
      if(el) {
        el.scrollIntoView({behavior:'smooth', block:'center'});
        el.style.background = '#EEF2FD';
        el.style.borderColor = '#1B4FD8';
        setTimeout(() => { el.style.background = 'var(--bg2)'; el.style.borderColor = 'var(--border)'; }, 1800);
      }
    }, 200);
  }
}

function showToast(msg, icon) {
  icon = icon || '✓';
  const existing = document.getElementById('_global-toast');
  if (existing) { clearTimeout(existing._t); existing.remove(); }
  const t = document.createElement('div');
  t.id = '_global-toast';
  t.style.cssText = 'position:fixed;bottom:calc(82px + env(safe-area-inset-bottom,0px));left:50%;transform:translateX(-50%);background:#1E293B;color:#fff;padding:11px 18px;border-radius:20px;font-size:13px;font-weight:600;z-index:9999;display:flex;align-items:center;gap:8px;box-shadow:0 4px 20px rgba(0,0,0,0.25);animation:msg-enter 0.25s ease;white-space:nowrap;pointer-events:none;';
  t.innerHTML = '<span style="font-size:15px;">' + icon + '</span><span>' + msg + '</span>';
  document.body.appendChild(t);
  t._t = setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.4s'; setTimeout(() => { if(t.parentNode) t.remove(); }, 400); }, 2200);
}

