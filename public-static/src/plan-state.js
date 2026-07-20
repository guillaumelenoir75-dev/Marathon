function migrateState(){
  const rfDefaults = {1:{day:3,time:'19:00'}, 2:{day:5,time:'18:30'}};
  // Injection météo séance S11 EF longue 23/05 — Villiers-Saint-Georges 11h canicule
  // Admin seulement — données personnelles de Guillaume
  if(isAdmin()) (function(){
    const k = gk(11,2)+'perf';
    let p = {};
    try{ p = typeof state[k]==='string' ? JSON.parse(state[k]) : (state[k]||{}); }catch(e){}
    if(!p.meteo){
      p.meteo = {
        date:"2026-05-23", heure_cible:"11h00", ville:"Villiers-Saint-Georges",
        temperature:29.8, ressenti:32.1, humidite:58, vent_kmh:8.2,
        conditions:"Ciel dégagé ☀️",
        impact_performance:{
          niveau:"ELEVE", ralentissement:"45-55 sec/km",
          perte_perf_pct:14, ralent_sec_km:50,
          conseil:"Forte chaleur — allures ralenties normales, hydratation toutes les 20 min.",
          elevation_fc_bpm:23, zone_ef_ajustee:"163-171 bpm",
          note_fc:"FC effective = FC mesurée - 23 bpm (Mora-Rodriguez à 32°C). FC 155 mesurée → FC effective 132 bpm → DANS la zone EF ✅. Zone EF chaleur : 163-171 bpm."
        },
        note:"MÉTÉO à Villiers-Saint-Georges : 32°C ressenti, 58% humidité. Mora-Rodriguez : FC effective = FC mesurée − 23 bpm. Perte perf : -14%."
      };
      state[k] = JSON.stringify(p);
      // Persister uniquement cette clé dans Firebase (pas tout le state)
      if(typeof dbRef !== 'undefined' && dbRef) {
        dbRef.child(k).set(state[k]).catch(()=>{});
      }
    }
  })();



  // ── Rien ici : la météo historique est récupérée dynamiquement
  //    par autoFetchMissingMeteo() après le chargement Firebase ──

  // Horaires renfo par défaut — admin seulement
  if(isAdmin()){
    [CW, Math.min(CW+1,32)].forEach(w => {
      [1,2].forEach(r => {
        const k = rfk(w,r)+'sched';
        if(!state[k]) state[k] = JSON.stringify(rfDefaults[r]);
      });
    });
  }
  // Inject historical sessions S1-S6 if not already done — admin seulement
  const historyKey='_history_injected_v6';
  if(isAdmin()&&!state[historyKey]){
    const history=[
      {ws:1,si:1,shoe:'Pegasus',km:8},{ws:1,si:2,shoe:'Pegasus',km:8},
      {ws:2,si:0,shoe:'Pegasus',km:9},{ws:2,si:1,shoe:'Pegasus',km:10},{ws:2,si:2,shoe:'Pegasus',km:11},
      {ws:3,si:0,shoe:'Pegasus',km:7},{ws:3,si:1,shoe:'Pegasus',km:8},{ws:3,si:2,shoe:'Pegasus',km:8},
      {ws:4,si:0,shoe:'Pegasus',km:9},{ws:4,si:2,shoe:'Pegasus',km:9},
      {ws:5,si:0,shoe:'Pegasus',km:7},{ws:5,si:1,shoe:'Pegasus',km:7},{ws:5,si:2,shoe:'Pegasus',km:9},
      {ws:6,si:0,shoe:'Pegasus',km:8},{ws:6,si:1,shoe:'Pegasus',km:8},{ws:6,si:2,shoe:'Salomon',km:9},
    ];
    history.forEach(({ws,si,shoe,km})=>{
      const dk=gk(ws,si);
      if(!state[dk+'done']) state[dk+'done']=true;
      if(state[dk+'km']==null) state[dk+'km']=km;
      const ek=`edit_w${ws}_s${si}`;
      const base=weeks[ws-1].sessions[si];
      if(!state[ek]){
        state[ek]=JSON.stringify({...base,shoe});
      } else {
        try{const obj=JSON.parse(state[ek]);obj.shoe=shoe;state[ek]=JSON.stringify(obj);}catch(e){}
      }
    });
    state[historyKey]=true;
    // Inject performance data S1-S6
    const perfData=[
      {ws:1,si:0,km:7,dur:'37:51',pace:'5:43',hr:158},
      {ws:1,si:1,km:8,dur:'45:31',pace:'5:41',hr:159},
      {ws:1,si:2,km:8,dur:'52:02',pace:'6:30',hr:139},
      {ws:2,si:0,km:9,dur:'59:24',pace:'6:36',hr:142},
      {ws:2,si:1,km:10,dur:'1:08:31',pace:'6:51',hr:149},
      {ws:2,si:2,km:11,dur:'1:16:09',pace:'6:55',hr:148},
      {ws:3,si:0,km:7,dur:'52:23',pace:'6:09',hr:156},
      {ws:3,si:1,km:8,dur:'52:33',pace:'6:56',hr:141},
      {ws:3,si:2,km:8,dur:'44:21',pace:'6:20',hr:145},
      {ws:4,si:0,km:9,dur:'1:00:10',pace:'6:40',hr:144},
      {ws:4,si:2,km:9,dur:'58:55',pace:'6:31',hr:152,date:'2026-04-04'},
      {ws:5,si:0,km:7,dur:'45:50',pace:'6:33',hr:146},
      {ws:5,si:1,km:7,dur:'41:03',pace:'5:52',hr:154},
      {ws:5,si:2,km:9,dur:'54:56',pace:'5:59',hr:159},
      {ws:6,si:0,km:8,dur:'51:30',pace:'6:26',hr:146},
      {ws:6,si:1,km:8,dur:'44:22',pace:'5:31',hr:162},
      {ws:6,si:2,km:9,dur:'56:39',pace:'6:17',hr:144},
    ];
    // Toujours écrire les perfs S1-S6 (écrase les éventuelles valeurs vides)
    perfData.forEach(({ws,si,km,dur,pace,hr,date})=>{
      const k=gk(ws,si);
      state[k+'perf']=JSON.stringify({dur,pace,hr,...(date?{date}:{})});
    });
    // Inject orders
    if(!state['order_w6']) state['order_w6']=JSON.stringify([{"si":1,"extra":false},{"si":0,"extra":false},{"si":2,"extra":false}]);
    if(!state['order_w7']) state['order_w7']=JSON.stringify([{"si":0,"extra":false},{"si":1,"extra":false},{"si":2,"extra":false}]);
    // Inject deletion S22 si1
    if(!state['del_w22_s1']) state['del_w22_s1']=true;
  }
  // Fix old tempo sessions stored without | separator
  const tempoFix=[
    ["Tempo 2×5 min (5'00-5'20/km)","Tempo 2×5 min|5'00 — 5'20 /km"],
    ["Tempo 2×6 min (5'00-5'20/km)","Tempo 2×6 min|5'00 — 5'20 /km"],
    ["Tempo 2×8 min (5'00-5'20/km)","Tempo 2×8 min|5'00 — 5'20 /km"],
    ["Tempo 3×8 min (5'00-5'20/km)","Tempo 3×8 min|5'00 — 5'20 /km"],
    ["Tempo 2×10 min (5'00-5'20/km)","Tempo 2×10 min|5'00 — 5'20 /km"],
    ["Tempo 3×10 min (5'00-5'20/km)","Tempo 3×10 min|5'00 — 5'20 /km"],
    ["Tempo 2×12 min (5'00-5'20/km)","Tempo 2×12 min|5'00 — 5'20 /km"],
    ["Tempo 2×15 min (5'00-5'20/km)","Tempo 2×15 min|5'00 — 5'20 /km"],
    // Also catch variants without pipe but with old allure format
    ["Tempo 2×5 min ","Tempo 2×5 min|5'00 — 5'20 /km"],
    ["Tempo 2×6 min ","Tempo 2×6 min|5'00 — 5'20 /km"],
    ["Tempo 2×8 min ","Tempo 2×8 min|5'00 — 5'20 /km"],
    ["Tempo 3×8 min ","Tempo 3×8 min|5'00 — 5'20 /km"],
    ["Tempo 2×10 min ","Tempo 2×10 min|5'00 — 5'20 /km"],
    ["Tempo 3×10 min ","Tempo 3×10 min|5'00 — 5'20 /km"],
    ["Tempo 2×12 min ","Tempo 2×12 min|5'00 — 5'20 /km"],
    ["Tempo 2×15 min ","Tempo 2×15 min|5'00 — 5'20 /km"],
  ];
  let changed=false;
  Object.keys(state).forEach(k=>{
    if(k.startsWith('edit_')){
      try{
        const obj=JSON.parse(state[k]);
        if(obj.d){
          tempoFix.forEach(([old,fix])=>{
            // Ne corriger que si la séance n'a pas déjà une allure personnalisée (pas de |)
            if(!obj.d.includes('|') && (obj.d===old.trim()||obj.d===old)){
              obj.d=fix;
              state[k]=JSON.stringify(obj);
              changed=true;
            }
          });
        }
      }catch(e){}
    }
  });
  if(changed) save();
}

// Table EF → AM (depuis Excel)
const EF_AM_TABLE=[
  // Mapping allure EF (FC≤148) → allure marathon cible
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
  const paces=[]; // valeurs EF valides, ordre chronologique (secondes/km)
  // Seed : EF déclarée à l'onboarding
  if(state.ef_pace){
    const fb=paceStrToSec(state.ef_pace.replace("'",":"));
    if(fb!==null) paces.push(fb);
  }
  for(let ws=1;ws<=CW;ws++){
    // Séances base (plan Guillaume) — admin seulement
    if(isAdmin()){
      weeks[ws-1].sessions.forEach((s,si)=>{
        if(s.type!=='ef') return;
        const k=gk(ws,si);
        if(!state[k+'done']) return;
        let perf={};try{perf=state[k+'perf']?JSON.parse(state[k+'perf']):{}}catch(e){}
        if(!perf.pace||!perf.hr) return;
        if(parseInt(perf.hr)>148) return;
        const sec=paceStrToSec(perf.pace);
        if(sec===null) return;
        paces.push(sec);
      });
    }
    // Séances extra EF
    let ei=0;
    while(ei<=20&&state[`extra_w${ws}_s${ei}`]){
      let es;try{es=JSON.parse(state[`extra_w${ws}_s${ei}`]);}catch(e){ei++;continue;}
      if(es&&es.type==='ef'&&state[`extra_w${ws}_s${ei}_done`]){
        let perf={};try{perf=state[`extra_w${ws}_s${ei}_perf`]?JSON.parse(state[`extra_w${ws}_s${ei}_perf`]):{}}catch(e){}
        if(perf.pace&&perf.hr&&parseInt(perf.hr)<=148){
          const sec=paceStrToSec(perf.pace);
          if(sec!==null) paces.push(sec);
        }
      }
      ei++;
    }
  }
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
  if(isAdmin()) return null;
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
  if(efPaces.length===0) return null;
  // Prendre l'allure la plus lente parmi les séances validées (estimation conservative)
  const efSec=Math.max(...efPaces);
  const m=Math.floor(efSec/60);
  const s=efSec%60;
  const efStr=`${m}'${s.toString().padStart(2,'0')}`;
  state.ef_pace=efStr;
  state.ef_pace_auto='true';
  const dbUpdates={ef_pace:efStr,ef_pace_auto:'true'};
  // Regénérer le plan avec la nouvelle allure EF (descriptions S2+ mises à jour)
  try{
    const cfg=state.plan_config?JSON.parse(state.plan_config):null;
    if(cfg){
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
      const planUpdates=generateAthletePlan(ob);
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

function calcMarathonPace(){
  const validEF=[];
  for(let ws=1;ws<=CW;ws++){
    weeks[ws-1].sessions.forEach((s,si)=>{
      if(s.type!=='ef') return;
      const k=gk(ws,si);
      if(!state[k+'done']) return;
      let perf={};try{perf=state[k+'perf']?JSON.parse(state[k+'perf']):{}}catch(e){}
      if(!perf.pace||!perf.hr) return;
      if(parseInt(perf.hr)>148) return;
      const sec=paceStrToSec(perf.pace);
      if(sec===null) return;
      validEF.push({ws,si,sec});
    });
    // Extra EF
    let ei=0;
    while(ei<=20&&state[`extra_w${ws}_s${ei}`]){
      let es;try{es=JSON.parse(state[`extra_w${ws}_s${ei}`]);}catch(e){ei++;continue;}
      if(es&&es.type==='ef'&&state[`extra_w${ws}_s${ei}_done`]){
        let perf={};try{perf=state[`extra_w${ws}_s${ei}_perf`]?JSON.parse(state[`extra_w${ws}_s${ei}_perf`]):{}}catch(e){}
        if(perf.pace&&perf.hr&&parseInt(perf.hr)<=148){
          const sec=paceStrToSec(perf.pace);
          if(sec!==null) validEF.push({ws,ei,sec,extra:true});
        }
      }
      ei++;
    }
  }
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
  if (isAdmin()) return false;
  const course = ((st || state).onboarding || {}).course;
  return !course || course === 'Plaisir';
}

function save(){
  if(dbRef) dbRef.set(state).catch(e=>console.error('Firebase save error:',e));
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
function gk(w,i){return `s${w}i${i}`;}
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
      { id:'allure', label:'Allure (min/km)', body:'Temps mis pour courir un kilomètre. Exemple : 5:30/km = 5 minutes et 30 secondes par kilomètre. Plus le chiffre est bas, plus tu cours vite. À ne pas confondre avec la vitesse en km/h (qui s\'inverse).' },
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

function _glossTermBadge(termId) {
  return `<span onclick="openGlossary('${termId}')" role="button" tabindex="0" aria-label="Définition" style="display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:#EEF2FD;color:#1B4FD8;font-size:9px;font-weight:800;cursor:pointer;vertical-align:middle;margin-left:4px;flex-shrink:0;border:1px solid #c7d7f8;">?</span>`;
}

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

