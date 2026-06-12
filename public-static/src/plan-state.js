function migrateState(){
  const rfDefaults = {1:{day:3,time:'19:00'}, 2:{day:5,time:'18:30'}};
  // Injection météo séance S11 EF longue 23/05 — Villiers-Saint-Georges 11h canicule
  // Sans condition — injecte toujours pour garantir la présence de la météo
  (function(){
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
  // Inject historical sessions S1-S6 if not already done
  const historyKey='_history_injected_v6';
  if(!state[historyKey]){
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
  let lastSec=null;
  // Fallback : EF déclarée à l'onboarding (avant d'avoir des séances validées)
  if(state.ef_pace){
    const fb=paceStrToSec(state.ef_pace.replace("'",":"));
    if(fb!==null) lastSec=fb;
  }
  for(let ws=1;ws<=CW;ws++){
    // Séances base (plan Guillaume) — admin seulement
    if(isAdmin()){
      weeks[ws-1].sessions.forEach((s,si)=>{
        if(s.type!=='ef') return;
        const k=gk(ws,si);
        if(!state[k+'done']) return;
        const perf=state[k+'perf']?JSON.parse(state[k+'perf']):{};
        if(!perf.pace||!perf.hr) return;
        if(parseInt(perf.hr)>148) return;
        const sec=paceStrToSec(perf.pace);
        if(sec===null) return;
        lastSec=sec;
      });
    }
    // Séances extra EF
    let ei=0;
    while(state[`extra_w${ws}_s${ei}`]){
      const es=JSON.parse(state[`extra_w${ws}_s${ei}`]);
      if(es.type==='ef'&&state[`extra_w${ws}_s${ei}_done`]){
        const perf=state[`extra_w${ws}_s${ei}_perf`]?JSON.parse(state[`extra_w${ws}_s${ei}_perf`]):{};
        if(perf.pace&&perf.hr&&parseInt(perf.hr)<=148){
          const sec=paceStrToSec(perf.pace);
          if(sec!==null) lastSec=sec;
        }
      }
      ei++;
    }
  }
  if(lastSec===null) return "6'40";
  const m=Math.floor(lastSec/60);
  const s=lastSec%60;
  return `${m}'${s.toString().padStart(2,'0')}`;
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
  const m=Math.floor(sec/60);
  const s=Math.round(sec%60);
  return m+"'"+(s+'').padStart(2,'0');
}

function calcMarathonPace(){
  const validEF=[];
  for(let ws=1;ws<=CW;ws++){
    weeks[ws-1].sessions.forEach((s,si)=>{
      if(s.type!=='ef') return;
      const k=gk(ws,si);
      if(!state[k+'done']) return;
      const perf=state[k+'perf']?JSON.parse(state[k+'perf']):{};
      if(!perf.pace||!perf.hr) return;
      if(parseInt(perf.hr)>148) return;
      const sec=paceStrToSec(perf.pace);
      if(sec===null) return;
      validEF.push({ws,si,sec});
    });
    // Extra EF
    let ei=0;
    while(state[`extra_w${ws}_s${ei}`]){
      const es=JSON.parse(state[`extra_w${ws}_s${ei}`]);
      if(es.type==='ef'&&state[`extra_w${ws}_s${ei}_done`]){
        const perf=state[`extra_w${ws}_s${ei}_perf`]?JSON.parse(state[`extra_w${ws}_s${ei}_perf`]):{};
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
      save();
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

