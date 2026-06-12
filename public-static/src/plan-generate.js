// ── Plan Découverte (ultra débutant marche-course) ────────────────────────────
function generateDecouvertePlan(ob){
  const nbSess=Math.min(2,Math.max(1,parseInt(ob.sessions)||2));
  const course=ob.course||'5 km';

  // Durée : 8 semaines minimum, 12 max
  let numWeeks=8;
  if(ob.date){
    const diff=Math.floor((new Date(ob.date)-new Date())/(7*24*3600*1000));
    if(diff>0) numWeeks=Math.min(Math.max(diff,8),12);
  }

  // Allure EF si fournie
  const fmtPace=sec=>{const m=Math.floor(sec/60);const s=sec%60;return `${m}'${String(s).padStart(2,'0')}`;};
  const efRaw=ob.ef_pace||null;
  let efSec=null;
  if(efRaw){const p=efRaw.replace("'",":").split(':');if(p.length===2)efSec=parseInt(p[0])*60+parseInt(p[1]);}
  const efLabel=efSec?fmtPace(efSec):null;
  const efHint=efLabel?`allure ${efLabel}/km`:'allure très confort, on parle facilement';

  const fcMax=parseInt(ob.fc_max)||0;
  const efFCStr=fcMax?`FC ${Math.round(fcMax*0.68)}-${Math.round(fcMax*0.74)} bpm`:'FC basse, effort très léger';

  // Phases : 1=Marche-Course (s1-3), 2=Progressif (s4-5), 3=Course continue (s6-8), 4=EF+accél (s9-12)
  const getPhase=w=>w<=3?1:w<=5?2:w<=8?3:4;

  const descMarche=w=>{
    const runMin=[0,1.5,2,2.5][Math.min(w-1,3)];
    const walkMin=runMin<=1.5?2:1.5;
    const reps=w<=2?7:6;
    const totalMin=Math.round((runMin+walkMin)*reps);
    const runStr=runMin===1.5?'1\'30"':`${runMin}'`;
    const walkStr=walkMin===2?'2\'':`${walkMin}'`;
    const km=Math.round((runMin/6)*reps*10)/10;
    return {type:'ef',km:Math.max(2.5,km),d:`Marche-Course|${runStr} course / ${walkStr} marche × ${reps} répétitions · ${efHint} · ${efFCStr} · ${totalMin} min environ · bien respirer, ne jamais être essoufflé(e)`};
  };

  const descProgressif=w=>{
    const runMin=w<=4?4:5;
    const reps=4;
    const totalMin=Math.round((runMin+1)*reps)+5;
    const km=Math.round(runMin/6*reps*10)/10+0.5;
    return {type:'ef',km:Math.max(3,km),d:`Course progressive|${runMin}' course / 1' marche × ${reps} répétitions · ${efHint} · ${efFCStr} · ${totalMin} min environ · allonger progressivement les blocs, confort avant tout`};
  };

  const descContinue=(w,phase)=>{
    const minRun=phase===3?(w<=6?20:w<=7?25:28):(w<=10?30:32);
    const km=Math.round(minRun/6*10)/10;
    const msg=phase===3?`félicite-toi, c'est une grande étape !`:`rythme confort, foulée relâchée · construire la confiance et la régularité`;
    return {type:'ef',km:Math.max(phase===3?3:4,km),d:`Footing EF|${minRun} min continue · ${efHint} · ${efFCStr} · allure conversationnelle, jamais essoufflé(e) · ${msg}`};
  };

  const descAccel=w=>{
    const minRun=w<=10?25:w<=11?28:30;
    const km=Math.round(minRun/6*10)/10+0.3;
    const nbAccel=w<=10?2:w<=11?3:4;
    return {type:'ef',km:Math.max(4,km),d:`EF + accélérations|${minRun} min EF · ${efHint} · ${efFCStr} · finir par ${nbAccel}×30-40" accélérations progressives (marcher entre chaque) · sensation de légèreté, ne pas sprinter`};
  };

  const getSession=w=>{
    const phase=getPhase(w);
    if(phase===1) return descMarche(w);
    if(phase===2) return descProgressif(w);
    if(phase===3) return descContinue(w,3);
    return descAccel(w);
  };

  const phaseLabels=['','Marche-Course','Progressif','Course continue','EF + accélérations'];
  const updates={};

  for(let w=1;w<=numWeeks;w++){
    const phase=getPhase(w);
    for(let si=0;si<nbSess;si++){
      const s=getSession(w);
      // Séance 2 : légèrement plus courte
      if(si===1){
        const factor=0.85;
        s.km=Math.round(s.km*factor*10)/10;
        s.d=s.d.replace(/(\d+) min/,m=>`${Math.round(parseInt(m)*factor)} min`);
      }
      updates[`s${w}i${si}`]=JSON.stringify(s);
    }
  }

  const planConfig={course,niveau:'Découverte',nbSess,numWeeks,baseKm:6,date:ob.date||null};
  updates.plan_config=JSON.stringify(planConfig);
  updates.ef_pace=ob.ef_pace||null;
  updates.fc_max=ob.fc_max||null;
  updates.onboarding=ob;
  return updates;
}

function generateAthletePlan(ob){
  // Niveau Découverte : plan marche-course ultra débutant
  if((ob.niveau||'Intermédiaire')==='Découverte') return generateDecouvertePlan(ob);

  // ── Paramètres ───────────────────────────────────────────────────────────────
  const baseKm   = parseInt(ob.km_semaine)||20;
  const nbSess   = Math.min(4,Math.max(1,parseInt(ob.sessions)||3));
  const niveau   = ob.niveau||'Intermédiaire'; // Débutant / Intermédiaire / Confirmé
  const course   = ob.course||'Marathon';
  const isPlaisir= course==='Plaisir';

  // ── Durée minimale recommandée par distance ───────────────────────────────────
  // Durée minimale par distance (respecter les minima physiologiques)
  const minW={Plaisir:8,'5 km':8,'10 km':8,'Semi-marathon':10,'Marathon':12}[course]||8;
  const maxW=24; // 6 mois max
  let numWeeks=minW;
  if(ob.date){
    const diff=Math.floor((new Date(ob.date)-new Date())/(7*24*3600*1000));
    if(diff>0) numWeeks=Math.min(Math.max(diff,minW),maxW);
  }

  // ── Plafond de volume (pic du plan) ──────────────────────────────────────────
  // Plafonds absolus par distance × nb séances — sécurité anti-surcharge
  const absMax={
    Plaisir:        {2:40, 3:58, 4:75},
    '5 km':         {2:32, 3:42, 4:52},
    '10 km':        {2:38, 3:52, 4:65},
    'Semi-marathon':{2:50, 3:65, 4:82},
    'Marathon':     {2:60, 3:82, 4:105},
  }[course]||{2:50,3:70,4:90};
  const baseMult={Plaisir:1.8,'5 km':1.55,'10 km':1.75,'Semi-marathon':2.0,'Marathon':2.2}[course]||1.8;
  const sessMult={2:0.90,3:1.0,4:1.18}[nbSess]||1.0;
  const peakKm=Math.min(Math.round(baseKm*baseMult*sessMult),absMax[nbSess]||70);

  // ── Affûtage (Pfitzinger & Douglas) ──────────────────────────────────────────
  // noInt = semaines d'affûtage sans aucune intensité (en comptant depuis taperStartW)
  const taperCfg=isPlaisir?{w:0,r:[],noInt:[]}:{
    'Marathon':      {w:3,r:[0.78,0.55,0.22],noInt:[2,3]},
    'Semi-marathon': {w:2,r:[0.68,0.30],     noInt:[2]},
    '10 km':         {w:2,r:[0.62,0.30],     noInt:[2]},
    '5 km':          {w:1,r:[0.48],          noInt:[1]},
  }[course]||{w:2,r:[0.65,0.30],noInt:[2]};

  // taperStartW calculé ici pour que recovery ne chevauche jamais le taper
  const taperStartW=taperCfg.w>0?numWeeks-taperCfg.w+1:numWeeks+1;

  // ── Semaines de décharge — pattern 3:1 (Higdon/Daniels) ─────────────────────
  // Plans courts (≤12s) → période de 3 semaines pour garantir 2 décharges minimum
  // Les semaines de taper sont exclues pour éviter une double réduction de volume
  const recovPeriod=(baseKm<15||numWeeks<=12)?3:4;
  const recovery=new Set();
  for(let w=recovPeriod;w<=numWeeks;w+=recovPeriod){
    if(w<taperStartW) recovery.add(w);
  }

  // ── Volume hebdomadaire ───────────────────────────────────────────────────────
  const longRunCap=isPlaisir?Math.min(Math.max(16,Math.round(baseKm*1.1)),26):
    {'Marathon':32,'Semi-marathon':22,'10 km':16,'5 km':12}[course]||32;

  const weekKms=[];
  // Départ plus doux selon le niveau : évite le choc en début de plan
  let cur=baseKm*(niveau==='Débutant'?0.85:niveau==='Intermédiaire'?0.92:1.0);
  for(let w=1;w<=numWeeks;w++){
    if(recovery.has(w)){
      const lastBuild=weekKms.filter((_,i)=>!recovery.has(i+1)).slice(-1)[0]||cur;
      weekKms.push(Math.max(Math.round(lastBuild*0.80),Math.max(3,Math.round(baseKm*0.78))));
    } else {
      weekKms.push(Math.min(Math.round(cur),peakKm));
      // Règle des 10% : max +10%/sem en phase de construction
      if(cur<peakKm) cur=Math.min(cur*(cur<15?1.10:1.07),peakKm);
    }
  }
  // Appliquer l'affûtage sur les dernières semaines
  const peakVol=Math.max(...weekKms);
  if(taperCfg.r.length>0&&numWeeks>taperCfg.w+4){
    taperCfg.r.forEach((ratio,i)=>{
      weekKms[numWeeks-taperCfg.r.length+i]=Math.max(Math.round(peakVol*ratio),3);
    });
  }
  // Semaine de pic de charge (avant application du taper)
  const peakWeekNum=weekKms.indexOf(Math.max(...weekKms))+1;

  // ── Calcul des allures (Jack Daniels VDOT) ────────────────────────────────────
  const fmtPace=sec=>{const m=Math.floor(sec/60);const s=sec%60;return `${m}'${String(s).padStart(2,'0')}`;};

  const efRaw=ob.ef_pace||null;
  let efSec=null;
  if(efRaw){const p=efRaw.replace("'",":").split(':');if(p.length===2)efSec=parseInt(p[0])*60+parseInt(p[1]);}

  const raceDist={'Marathon':42.195,'Semi-marathon':21.1,'10 km':10,'5 km':5}[course]||42.195;
  let racePaceSec=null;
  if(ob.target_time){
    const tp=ob.target_time.split(':').map(Number);
    const ts=tp.length===3?tp[0]*3600+tp[1]*60+tp[2]:tp.length===2?tp[0]*60+tp[1]:0;
    if(ts>0) racePaceSec=ts/raceDist;
  }
  if(racePaceSec){
    const pMin={'Marathon':175,'Semi-marathon':150,'10 km':120,'5 km':100}[course]||150;
    const pMax={'Marathon':780,'Semi-marathon':720,'10 km':660,'5 km':600}[course]||780;
    if(racePaceSec<pMin||racePaceSec>pMax) racePaceSec=null;
  }

  let effectiveEfSec=efSec;
  if(!effectiveEfSec&&racePaceSec){
    // Zone EF = ~70-75% FCmax → multiplicateur selon distance et niveau
    const efMult={
      'Marathon':      {Débutant:1.40,Intermédiaire:1.36,Confirmé:1.32},
      'Semi-marathon': {Débutant:1.38,Intermédiaire:1.34,Confirmé:1.30},
      '10 km':         {Débutant:1.35,Intermédiaire:1.31,Confirmé:1.28},
      '5 km':          {Débutant:1.32,Intermédiaire:1.28,Confirmé:1.25},
    }[course]||{Débutant:1.38,Intermédiaire:1.34,Confirmé:1.30};
    effectiveEfSec=Math.round(racePaceSec*(efMult[niveau]||1.35));
  }
  const efLabel=effectiveEfSec?fmtPace(effectiveEfSec):null;

  // Tempo = seuil lactate (~82-88% FCmax)
  let tempoPaceSec=null;
  if(racePaceSec){
    const tm={
      'Marathon':      {Débutant:0.965,Intermédiaire:0.952,Confirmé:0.940},
      'Semi-marathon': {Débutant:0.960,Intermédiaire:0.945,Confirmé:0.930},
      '10 km':         {Débutant:0.965,Intermédiaire:0.950,Confirmé:0.940},
      '5 km':          {Débutant:0.980,Intermédiaire:0.972,Confirmé:0.962},
    }[course]||{Débutant:0.965,Intermédiaire:0.952,Confirmé:0.940};
    tempoPaceSec=Math.round(racePaceSec*(tm[niveau]||0.952));
  } else if(effectiveEfSec){
    tempoPaceSec=effectiveEfSec+(niveau==='Débutant'?-52:niveau==='Confirmé'?-78:-62);
  }
  if(tempoPaceSec&&effectiveEfSec&&tempoPaceSec>effectiveEfSec-25) tempoPaceSec=effectiveEfSec-30;
  const tempoLbl=tempoPaceSec?fmtPace(tempoPaceSec):null;

  // Fractionné = VO2max / ~95-100% VMA
  let fracPaceSec=null,fracMinPaceSec=null;
  if(racePaceSec){
    const fm={'Marathon':0.822,'Semi-marathon':0.872,'10 km':0.902,'5 km':0.932}[course]||0.822;
    fracPaceSec=Math.round(racePaceSec*fm);
    fracMinPaceSec=Math.round(fracPaceSec*0.965);
  } else if(effectiveEfSec){
    fracPaceSec=effectiveEfSec+({'5 km':-98,'10 km':-88,'Semi-marathon':-80,'Marathon':-75}[course]||-80);
    fracMinPaceSec=fracPaceSec-12;
  }
  if(fracPaceSec&&tempoPaceSec&&fracPaceSec>tempoPaceSec-18){fracPaceSec=tempoPaceSec-22;fracMinPaceSec=fracPaceSec-10;}
  const fracLbl=fracPaceSec?fmtPace(fracPaceSec):null;
  const fracMinLbl=fracMinPaceSec?fmtPace(fracMinPaceSec):null;

  const semiPaceSec=course==='Semi-marathon'&&racePaceSec?Math.round(racePaceSec):racePaceSec?Math.round(racePaceSec*0.955):null;
  const semiLbl=semiPaceSec?fmtPace(semiPaceSec):null;
  const racePaceLbl=racePaceSec?fmtPace(Math.round(racePaceSec)):null;

  // Zones FC
  const fcMax=parseInt(ob.fc_max)||0;
  const efFCStr   =fcMax?`FC ${Math.round(fcMax*0.70)}-${Math.round(fcMax*0.75)} bpm`:'FC basse, allure confort';
  const tempoFCStr=fcMax?`FC ${Math.round(fcMax*0.82)}-${Math.round(fcMax*0.88)} bpm`:'FC modérée-haute';
  const fracFCStr =fcMax?`FC ${Math.round(fcMax*0.88)}-${Math.round(fcMax*0.95)} bpm`:'FC haute, effort intense';

  // ── Progressions des séances qualité ──────────────────────────────────────────

  // Tempo — progression par phase (pas par semaine absolue pour plus de flexibilité)
  const tempoByPhase=(phase)=>{
    if(niveau==='Débutant'){
      if(phase===2) return {rep:1,dur:6,recup:'3:00'};
      if(phase===3) return {rep:2,dur:6,recup:'3:00'}; // progression douce : 1×6→2×6 (→2×10 via bonus)
      if(phase===4) return {rep:1,dur:6,recup:'3:00'}; // court affûtage
      return null;
    }
    if(niveau==='Confirmé'){
      if(phase===2) return {rep:2,dur:10,recup:'2:30'};
      if(phase===3) return {rep:3,dur:12,recup:'2:30'};
      if(phase===4) return {rep:2,dur:8, recup:'2:30'}; // affûtage
      return null;
    }
    // Intermédiaire
    if(phase===2) return {rep:2,dur:8, recup:'3:00'};
    if(phase===3) return {rep:2,dur:12,recup:'3:00'};
    if(phase===4) return {rep:1,dur:8, recup:'3:00'}; // affûtage
    return null;
  };

  // Progression du tempo dans le plan — s'affine semaine après semaine à l'intérieur de la phase
  // weekInPhase : 0-indexé (semaine 0 dans la phase = début de phase)
  const tempoProgByWeek=(weekInPhase,phase)=>{
    const base=tempoByPhase(phase);
    if(!base) return null;
    // Toutes les 2 semaines dans la phase, pousser légèrement la durée (max +4 min)
    const bonus=Math.min(Math.floor(weekInPhase/2)*2,4);
    return {rep:base.rep,dur:Math.min(base.dur+bonus,niveau==='Confirmé'?18:15),recup:base.recup};
  };

  // Frac — progression par phase
  const fracByPhase=(phase)=>{
    if(course==='5 km'){
      if(niveau==='Débutant'){
        if(phase===2) return {rep:5,dur:1,recup:'2:00'};
        if(phase===3) return {rep:6,dur:2,recup:'2:00'};
        if(phase===4) return {rep:4,dur:1,recup:'2:00'};
        return null;
      }
      if(phase===2) return {rep:6,dur:1,recup:'1:30'};
      if(phase===3) return {rep:8,dur:2,recup:'2:00'};
      if(phase===4) return {rep:5,dur:1,recup:'1:30'};
      return null;
    }
    // 10km, Semi, Marathon
    if(niveau==='Débutant'){
      if(phase===2) return {rep:4,dur:2,recup:'2:30'};
      if(phase===3) return {rep:4,dur:3,recup:'2:30'};
      if(phase===4) return {rep:3,dur:2,recup:'2:30'};
      return null;
    }
    if(niveau==='Confirmé'){
      if(phase===2) return {rep:5,dur:3,recup:'2:00'};
      if(phase===3) return {rep:5,dur:4,recup:'2:00'};
      if(phase===4) return {rep:4,dur:2,recup:'2:00'};
      return null;
    }
    if(phase===2) return {rep:4,dur:3,recup:'2:30'};
    if(phase===3) return {rep:5,dur:3,recup:'2:30'};
    if(phase===4) return {rep:3,dur:2,recup:'2:30'};
    return null;
  };

  // ── Descriptions de séances ────────────────────────────────────────────────────

  // EF — même séance, sous-titres variés pour éviter la redondance visuelle
  const EF_V=[
    efLabel?`Footing EF|${efLabel}/km · ${efFCStr} · conversation fluide, effort très contrôlé`:`Footing EF|allure confort, conversation possible`,
    efLabel?`Footing EF|${efLabel}/km · ${efFCStr} · respiration rythmée, foulée relâchée · bonne posture`:`Footing EF|respiration rythmée, foulée relâchée`,
    efLabel?`Footing EF|${efLabel}/km · ${efFCStr} · jambes légères, aérobie pur · ne pas forcer`:`Footing EF|aérobie pur, allure conversationnelle`,
    efLabel?`Footing EF|${efLabel}/km · ${efFCStr} · construire la base, rester à l'aise sur toute la durée`:`Footing EF|allure confort, construction de la base aérobie`,
  ];
  let _efV=0;
  const descEF=()=>EF_V[_efV++%EF_V.length];

  // EF récupération (semaines de décharge) — plus doux, aucune pression
  const descEFRecov=()=>efLabel
    ?`Footing récupération|${efLabel}/km ou plus lent · allure vraiment aisée · priorité absolue à la récupération, laisser les jambes se reposer`
    :`Footing récupération|allure très facile, ne pas chercher à courir vite · priorité à la récupération`;

  // EF + strides (accélérations neuromusculaires) — Phase 2+ uniquement
  // Les strides améliorent la cadence, l'économie de course et la coordination sans fatigue
  const EF_STRIDES_V=[
    efLabel?`Footing EF + éducatifs|${efLabel}/km · ${efFCStr} · finir par 5×80 m accélérations progressives (marcher entre chaque) · éveil neuromusculaire, économie de foulée`:`Footing EF + éducatifs|allure confort · finir par 5×80 m accélérations · économie de foulée`,
    efLabel?`Footing + strides|${efLabel}/km · ${efFCStr} · 6×80 m accélérations rapides en fin de sortie (récup marche) · réduire le temps de contact, améliorer la cadence`:`Footing + strides|allure EF · 6×80 m accélérations progressives · coordination neuromusculaire`,
  ];
  let _efSV=0;
  const descEFStrides=()=>EF_STRIDES_V[_efSV++%EF_STRIDES_V.length];

  // Long runs — évoluent selon la phase et la distance
  const descLong=(km,phase,isRecov=false)=>{
    if(isRecov) return efLabel
      ?`Sortie longue récupération|${efLabel}/km ou plus lent · rythme conservateur, ne pas dépasser ${efFCStr} · plaisir et décontraction uniquement`
      :`Sortie longue récupération|allure très facile, priorité au plaisir et à la récupération`;
    // Phase 3 — sorties longues spécifiques (simulation race)
    if(phase===3&&!isPlaisir){
      if(course==='Marathon'&&racePaceLbl&&efLabel){
        const specKm=km>=28?10:km>=24?8:6;
        return `Sortie longue spécifique marathon|${efLabel}/km · ${km-specKm} km EF → finir ${specKm} km à ${racePaceLbl}/km (allure marathon) · simulation race · construire la confiance et l'économie de fin de course`;
      }
      if(course==='Semi-marathon'&&semiLbl&&efLabel){
        const specKm=km>=18?6:km>=14?4:3;
        return `Sortie longue spécifique semi|${efLabel}/km · ${km-specKm} km EF → finir ${specKm} km à ${semiLbl}/km (allure semi) · simulation du finish · ${tempoFCStr}`;
      }
      if(course==='10 km'&&racePaceLbl&&efLabel){
        const specKm=km>=14?4:km>=12?3:2;
        return `Sortie longue spécifique 10km|${efLabel}/km · ${km-specKm} km EF → finir ${specKm} km à ${racePaceLbl}/km (allure 10km) · habituer l'organisme à courir vite en état de fatigue · ${tempoFCStr}`;
      }
      if(course==='5 km'&&racePaceLbl&&efLabel){
        const specKm=km>=10?2:1;
        return `Sortie longue spécifique 5km|${efLabel}/km · ${km-specKm} km EF → finir ${specKm} km à ${racePaceLbl}/km (allure 5km) · simulation du finish, tolérance à l'inconfort · ${fracFCStr}`;
      }
      if(efLabel) return `Sortie longue soutenue|${efLabel}/km · 20 dernières min légèrement plus vite (naturellement) · construire l'endurance du finisseur`;
    }
    // Phase 2 — longues avec légère progression
    if(phase===2&&efLabel) return `Sortie longue progressive|${efLabel}/km · ${efFCStr} · 10-15 dernières min légèrement plus vite · habituer l'organisme à finir fort`;
    // Phase 1 — pure EF, construire le fonds
    return efLabel
      ?`Sortie longue EF|${efLabel}/km · ${efFCStr} · rythme conservateur, durée > vitesse · base aérobie avant tout`
      :`Sortie longue EF|allure confort, durée prioritaire sur la vitesse · base aérobie`;
  };

  // Allure tempo réduite pour décharge (+10-15s/km sur la allure normale)
  const tempoRecovLbl=tempoPaceSec?fmtPace(tempoPaceSec+12):null;
  // Allure frac réduite pour décharge (+8-10s/km)
  const fracRecovLbl=fracPaceSec?fmtPace(fracPaceSec+9):null;

  // Tempo — seuil lactate
  // isRecov : séance de décharge — durée réduite, allure légèrement plus lente
  // isTaper : semaine d'affûtage — qualité maintenue, volume réduit
  const descTempo=(tp,isTaper=false,isRecov=false)=>{
    const {rep,dur,recup}=tp;
    const isBlock=recup==='0:00';
    const pLblBase=course==='Semi-marathon'&&semiLbl?semiLbl:tempoLbl;
    const pLbl=isRecov&&tempoRecovLbl?tempoRecovLbl:pLblBase; // allure légèrement réduite en décharge
    const pDesc=course==='Semi-marathon'?'allure semi-marathon':'allure seuil';
    const pStr=pLbl?`${pLbl}/km · `:'';
    const note=isRecov
      ?' · semaine décharge : durée réduite, allure légèrement inférieure — récupérer sans perdre les acquis'
      :isTaper?' · affûtage : qualité maintenue, volume réduit':'';
    const body=`3 km EF · ${rep}×${dur} min ${pStr}${pDesc} · ${tempoFCStr}${note}`;
    return isBlock
      ?`Tempo décharge ${rep}×${dur} min|${body} · EF de fin`
      :`Tempo ${isRecov?'décharge ':''}${rep}×${dur} min|${body} · récup ${recup} min trot · EF de fin`;
  };

  // Fractionné VO2max
  // isRecov : séance de décharge — reps réduites, allure légèrement inférieure
  const descFrac=(fp,isTaper=false,isRecov=false)=>{
    const {rep,dur,recup}=fp;
    const pDesc={'5 km':'VMA / allure 5km','10 km':'VO₂max / allure 5-10km','Semi-marathon':'VO₂max','Marathon':'VO₂max'}[course]||'VO₂max';
    const pLbl=isRecov&&fracRecovLbl?fracRecovLbl:fracLbl;
    const pStr=pLbl?(fracMinLbl&&!isRecov?`${fracMinLbl}–${pLbl}/km · `:`${pLbl}/km · `):'';
    const note=isRecov
      ?' · décharge : reps réduites, allure légèrement inférieure — maintenir les sensations sans se fatiguer'
      :isTaper?' · affûtage : vivacité maintenue':'';
    return `Fractionné ${isRecov?'décharge ':''}${rep}×${dur} min|3 km EF · ${rep}×${dur} min ${pStr}${pDesc} · récup ${recup} min trot · ${fracFCStr}${note} · EF de fin`;
  };

  // Côtes — progressive selon la phase (court → moyen → long)
  const descCotes=(phase)=>{
    if(phase===1) return `Séance côtes|3 km EF · 8×(20 sec montée vive + descente trot) · renforcement musculaire, foulée puissante, posture · EF de fin`;
    if(phase===2) return `Côtes progressives|3 km EF · 5×(25 sec côte + descente récup) → 4×(35 sec côte + descente) · progression de l'effort, chaîne postérieure · EF de fin`;
    return `Côtes longues|3 km EF · 6×(45 sec côte soutenue + descente active récup) · endurance musculaire, puissance aérobie, force de finisseur · EF de fin`;
  };

  // Footing avec accélérations — 3 niveaux selon la phase du plan
  const descFartlek=(phase)=>{
    if(phase===1) return efLabel
      ?`Footing avec accélérations|${efLabel}/km base · 6×(30 sec allure vive + 2 min trot) · jeu de rythme libre, aucune montre sur les accélérations`
      :`Footing avec accélérations|6×(30 sec allure vive + 2 min trot) · jeu de rythme libre, liberté d'allure`;
    if(phase===2) return efLabel
      ?`Footing avec accélérations|${efLabel}/km base · 8×(40 sec vive + 90 sec trot) · les 3 dernières répétitions légèrement plus rapides · variété des efforts`
      :`Footing avec accélérations|8×(40 sec vive + 90 sec trot) · accélérations progressives, sensations libres`;
    return efLabel
      ?`Footing avec accélérations|${efLabel}/km base · 2×(5 min soutenu + récup 3 min trot) + 6×(30 sec rapide + 1 min trot) · polyvalence aérobie, changements de rythme`
      :`Footing avec accélérations|blocs soutenus + accélérations courtes + récup · polyvalence, adaptabilité au rythme`;
  };

  // Course en progression — départ EF, crescendo vers allure cible
  const descProgression=(phase)=>{
    const targetLbl=course==='Semi-marathon'&&semiLbl?semiLbl
      :course==='Marathon'&&racePaceLbl?racePaceLbl
      :(course==='5 km'||course==='10 km')&&racePaceLbl?racePaceLbl
      :tempoLbl;
    const targetDesc=course==='Semi-marathon'?'allure semi'
      :course==='Marathon'?'allure marathon'
      :course==='5 km'?'allure 5km'
      :course==='10 km'?'allure 10km'
      :'allure seuil';
    const durFast=phase===3?18:12;
    if(targetLbl&&efLabel)
      return `Course en progression|${efLabel}/km (début) · crescendo naturel · finir ${durFast} min à ${targetLbl}/km (${targetDesc}) · ne jamais forcer au départ, laisser venir le rythme · confiance en l'allure cible`;
    return efLabel
      ?`Course en progression|${efLabel}/km départ très facile · crescendo naturel sur toute la durée · finir à effort soutenu, jamais essoufflé`
      :`Course en progression|départ très facile · crescendo progressif naturel · habituer le corps à finir fort`;
  };

  // Sortie allure marathon (séance standalone, marathon phase 3, 4 sessions)
  const descMPace=(kmTotal)=>{
    const mpKm=Math.min(Math.round(kmTotal*0.50),14);
    if(racePaceLbl&&efLabel)
      return `Allure marathon|3 km EF · ${mpKm} km à ${racePaceLbl}/km (allure marathon, cœur de course) · EF de retour · ${tempoFCStr} · apprendre à sentir et maintenir l'allure cible sur distance`;
    return efLabel
      ?`Allure marathon|${efLabel}/km échauffement · blocs marathon par sensations · apprendre à doser la dépense énergétique`
      :`Allure marathon|blocs à allure marathon ressentie · gestion de l'effort sur distance`;
  };

  // ── Matrices de périodisation par phase et distance ───────────────────────────
  // Clé du coaching pro : les séances DOIVENT varier selon la phase du plan,
  // pas juste le numéro de semaine. Chaque phase a ses propres objectifs.
  //
  // Phase 1 (Base) : construire la capacité aérobie — fartlek ludique, zéro intensité structurée
  // Phase 2 (Build) : introduire le travail qualitatif progressivement
  //   → tempo (seuil) pour semi/marathon · fractionné (VO2max) pour 5km/10km
  // Phase 3 (Spécifique) : simuler la course, travailler les allures cibles
  // Phase 4 (Affûtage) : séances courtes pour maintenir la vivacité
  // Règle : Q1 et Q2 ne peuvent pas être (tempo + frac) la même semaine → trop éprouvant
  // Côtes supprimées : privilégier fartlek en Phase 1 (moins traumatisant, plus ludique)
  const Q_MATRIX={
    Plaisir:{
      1:[null],                        // Phase 1 : EF pur, accélérations contrôlées par stridesStartQ
      2:['tempo','tempo','tempo'],     // Phase 2 : tempo progressif (montée en puissance)
      3:['tempo','fartlek','tempo'],   // Phase 3 : tempo dominant, fartlek pour varier
      4:['tempo'],
    },
    '5 km':{
      1:[null],                              // Phase 1 : EF pur, accélérations contrôlées par stridesStartQ
      2:['frac','frac','frac'],              // Phase 2 : fractionné dominant
      3:['frac','progression','frac'],       // Phase 3 : fractionné + progression allure 5km
      4:['frac'],
    },
    '10 km':{
      1:[null],                              // Phase 1 : EF pur
      2:['frac','frac','frac'],              // Phase 2 : fractionné
      3:['tempo','frac','tempo'],            // Phase 3 : tempo seuil + frac (spécifique 10km)
      4:['frac'],
    },
    'Semi-marathon':{
      1:[null],                    // Phase 1 : EF pur
      2:['tempo','tempo','tempo'], // Phase 2 : tempo dominant
      3:['tempo','progression','tempo'], // Phase 3 : seuil + progression
      4:['tempo'],
    },
    'Marathon':{
      1:[null],                    // Phase 1 : EF pur
      2:['tempo','tempo','tempo'], // Phase 2 : tempo dominant
      3:['tempo','progression','tempo'], // Phase 3 : seuil + progression
      4:['tempo'],
    },
  };
  // Phase du plan — durée Phase 1 fixe selon le niveau (indépendante de la durée du plan)
  // Débutant   : 7 semaines de base → qualité démarre autour de S08
  // Intermédiaire : 4 semaines → qualité démarre autour de S05
  // Confirmé   : 2 semaines → qualité démarre dès S03
  const p1Weeks={Débutant:7,Intermédiaire:4,Confirmé:2}[niveau]||4;
  const getPhase=(w)=>{
    if(w>=taperStartW) return 4;
    const p1End=Math.min(p1Weeks, taperStartW-4); // garde au moins 4 semaines de qualité
    const p2End=Math.min(p1End+Math.round(numWeeks*0.30), taperStartW-2); // garde ≥1 semaine Phase 3
    if(w<=p1End) return 1;
    if(w<=p2End) return 2;
    return 3;
  };

  const getQType=(phase,weekInPhase)=>{
    const m=(Q_MATRIX[course]||Q_MATRIX.Marathon)[phase];
    if(!m||!m.length) return null;
    return m[weekInPhase%m.length]||null;
  };
  // Résoudre un type de séance qualité → {d, type}
  // weekInPhase : position dans la phase (pour progression intra-phase du tempo)
  // isRecov : semaine de décharge → durée/reps réduits, allure légèrement inférieure
  const resolveQ=(qt,phase,weekInPhase,isTaper=false,isRecov=false,allowReduce=false)=>{
    const tp=tempoProgByWeek(weekInPhase,phase);
    const fp=fracByPhase(phase);
    // En décharge : réduire significativement (≈ -40 à -50% du volume qualité)
    const reduce=(p,minDur=4)=>p?{rep:Math.max(1,p.rep-1),dur:Math.max(minDur,Math.round(p.dur*0.55)),recup:p.recup}:null;
    const tpR=isRecov?reduce(tp,5):(allowReduce&&tp?{rep:Math.max(1,tp.rep-1),dur:Math.max(4,tp.dur-2),recup:tp.recup}:tp);
    const fpR=isRecov?reduce(fp,1):(allowReduce&&fp?{rep:Math.max(1,fp.rep-1),dur:Math.max(3,fp.dur-1),recup:fp.recup}:fp);
    if(qt==='frac'&&fpR)    return {d:descFrac(fpR,isTaper,isRecov),type:'frac'};
    if(qt==='cotes')        return {d:descCotes(isRecov?1:phase),type:'ef'}; // côtes courtes en décharge
    if(qt==='fartlek')      return {d:descFartlek(isRecov?1:phase),type:'ef'}; // fartlek découverte en décharge
    if(qt==='tempo'&&tpR)   return {d:descTempo(tpR,isTaper,isRecov),type:'tempo'};
    if(qt==='progression')  return isRecov?{d:descFartlek(1),type:'ef'}:{d:descProgression(phase),type:'tempo'}; // pas de progression en décharge
    if(qt==='mpace')        return null; // géré séparément
    // Fallback : pas encore de tempo/frac disponible → fartlek (plus côtes)
    if(qt==='frac'||qt==='tempo') return {d:descFartlek(isRecov?1:phase),type:'ef'};
    return null;
  };


  // ── Boucle principale ─────────────────────────────────────────────────────────
  const updates={};
  // Métadonnées du plan (version, config, pic de charge)
  updates['plan_version']=2;
  updates['plan_peak_week']=peakWeekNum;
  updates['plan_config']=JSON.stringify({course,niveau,nbSess,numWeeks,baseKm,date:ob.date||null});

  let _phaseStartW=1;
  let _lastPhase=1;

  for(let w=1;w<=numWeeks;w++){
    const total=weekKms[w-1];
    const isRecov=recovery.has(w);
    const isRaceWeek=w===numWeeks&&!!ob.date;
    const weekInTaper=w>=taperStartW?w-taperStartW+1:0;
    const noIntensity=taperCfg.noInt.includes(weekInTaper)||isRaceWeek;
    const phase=getPhase(w);
    const isTaper=phase===4;

    // Tracker la semaine dans la phase (pour indexer Q_MATRIX)
    if(phase!==_lastPhase){_phaseStartW=w;_lastPhase=phase;}
    const weekInPhase=w-_phaseStartW; // 0-indexé

    const sFloor=total<10?2:3;
    const longSFloor=Math.max(sFloor,5); // sortie longue : minimum réaliste 5 km
    const capLong=(base)=>Math.min(Math.max(base,longSFloor),longRunCap);

    // Métadonnées de semaine (phase, décharge, pic) — lues par plan-render pour les badges
    updates[`meta_w${w}`]=JSON.stringify({phase,isRecov,isPeak:w===peakWeekNum,isTaper});

    // Semaines de décharge : on garde UNE séance qualité (réduite et ralentie)
    // mais on supprime la 2ème séance qualité des plans 4 sessions.
    // La qualité maintient les acquis neuromusculaires sans surcharger l'organisme.
    // Semaines d'affûtage (noIntensity) : aucune qualité du tout.
    const blockQuality=noIntensity; // décharge autorisée, noIntensity bloquée
    const qType=blockQuality?null:getQType(phase,weekInPhase);
    const hasQuality=!!qType&&nbSess>=3;

    // Strides en fin de footing EF : Phase 2+, non décharge, non affûtage
    const useStrides=phase>=2&&!isRecov&&!isTaper;
    // Seuil d'introduction des accélérations en Phase 1 (plans 3 et 4 séances)
    // Débutant → S04 · Intermédiaire → S02 · Confirmé → S01
    const stridesStartQ=niveau==='Débutant'?4:niveau==='Confirmé'?1:2;
    const useStridesP1=w>=stridesStartQ&&!isRecov&&!isTaper;

    let sessions=[];
    const isLastPlaisirWeek=isPlaisir&&w===numWeeks;
    const bilanDesc=efLabel
      ?`Sortie bilan de fin de plan|${efLabel}/km · courir à ton rythme habituel · profite de chaque foulée, mesure le chemin parcouru depuis le début du plan · pas d'objectif, juste du plaisir`
      :`Sortie bilan de fin de plan|courir à ton rythme, sans objectif · profite de chaque foulée et mesure le chemin parcouru depuis le début`;

    if(isRaceWeek){
      // Semaine de course : activation légère + Jour J
      if(nbSess>=2) sessions.push({
        d:efLabel
          ?`Activation pré-course|${efLabel}/km · allure vraiment facile · finir par 4×80 m accélérations légères · mise en route, se sentir frais et léger`
          :`Activation pré-course|allure très facile · quelques accélérations légères · fraîcheur avant tout`,
        km:3,type:'ef',shoe:null
      });
      sessions.push({
        d:`🏆 ${course}|Jour J${racePaceLbl?' · Objectif '+racePaceLbl+'/km':''}`,
        km:Math.round(raceDist),type:'race',shoe:null,_isRace:true
      });

    } else if(nbSess===1){
      sessions=[{d:descEF(),km:total,type:'ef',shoe:null}];

    } else if(nbSess===2){
      const kL=capLong(Math.max(Math.round(total*0.55),sFloor));
      const kEF=Math.max(total-kL,sFloor);
      const dL=isLastPlaisirWeek?bilanDesc:descLong(kL,phase,isRecov);

      let s0;
      if(isRecov){
        s0={d:descEFRecov(),km:kEF,type:'ef',shoe:null};
      } else if(isPlaisir&&phase>=2&&!isTaper){
        // Plaisir 2 sessions : qualité selon Q_MATRIX (tempo Phase 2+, fartlek alterné)
        // S'adapte à toute durée de plan grâce à la logique par phase
        const qPlaisir=resolveQ(getQType(phase,weekInPhase),phase,weekInPhase,isTaper,false);
        s0=qPlaisir?{d:qPlaisir.d,km:kEF,type:qPlaisir.type,shoe:null}:{d:descEFStrides(),km:kEF,type:'ef',shoe:null};
      } else {
        // Plans course 2 sessions : EF pur en Phase 1, accélérations dès Phase 2+
        // S'adapte automatiquement à la durée du plan (court ou long)
        const use2sStrides=phase>=2&&!isRecov&&!isTaper;
        s0={d:use2sStrides?descEFStrides():descEF(),km:kEF,type:'ef',shoe:null};
      }
      sessions=[s0,{d:dL,km:kL,type:'long',shoe:null}];

    } else if(nbSess===3){
      if(hasQuality){
        const kEF=Math.max(Math.round(total*0.30),sFloor);
        const kQ =Math.max(Math.round(total*0.27),sFloor);
        const kL =capLong(total-kEF-kQ);
        const q=resolveQ(qType,phase,weekInPhase,isTaper,isRecov);
        const dEF=isRecov?descEFRecov():(useStrides?descEFStrides():descEF());
        sessions=[
          {d:dEF,km:kEF,type:'ef',shoe:null},
          q?{d:q.d,km:kQ,type:q.type,shoe:null}:{d:descEF(),km:kQ,type:'ef',shoe:null},
          {d:isLastPlaisirWeek?bilanDesc:descLong(kL,phase,false),km:kL,type:'long',shoe:null},
        ];
      } else {
        // Phase 1 ou décharge : 2 EF + longue
        const k1=Math.max(Math.round(total*0.30),sFloor);
        const k2=Math.max(Math.round(total*0.25),sFloor);
        const kL=capLong(total-k1-k2);
        sessions=[
          {d:isRecov?descEFRecov():descEF(),km:k1,type:'ef',shoe:null},
          // Phase 1 : accélérations selon seuil niveau (Débutant S04, Intermédiaire S02, Confirmé S01)
          {d:useStridesP1?descEFStrides():descEF(),km:k2,type:'ef',shoe:null},
          {d:isLastPlaisirWeek?bilanDesc:descLong(kL,phase,isRecov),km:kL,type:'long',shoe:null},
        ];
      }

    } else {
      // 4 séances : EF → Q2 (légère) → Q1 (principale) → Long
      // L'ordre garantit une récupération entre les 2 séances qualité
      // Pour les petits volumes (total<14), on calcule d'abord la longue pour éviter le dépassement
      const kEF=Math.max(Math.round(total*0.20),sFloor);
      const kQ1=Math.max(Math.round(total*0.22),sFloor);
      const kQ2=Math.max(Math.round(total*0.20),sFloor);
      const kLraw=total-kEF-kQ1-kQ2;
      const kL =total>=14?capLong(kLraw):Math.min(Math.max(kLraw,sFloor),longRunCap);

      if(hasQuality){
        const q1=resolveQ(qType,phase,weekInPhase,isTaper,isRecov,false);
        const dEF=isRecov?descEFRecov():(useStrides?descEFStrides():descEF());

        // 4 séances : Q1 = qualité principale (frac ou tempo), Q2 = TOUJOURS EF/accélérations
        // Règle : jamais 2 frac ni 2 tempo dans la même semaine
        let sQ1,sQ2;
        if(qType==='mpace'){
          sQ1={d:descMPace(kQ1),km:kQ1,type:'tempo',shoe:null};
        } else {
          sQ1=q1?{d:q1.d,km:kQ1,type:q1.type,shoe:null}:{d:descEF(),km:kQ1,type:'ef',shoe:null};
        }
        // Q2 : toujours EF avec accélérations (jamais qualité intensive)
        sQ2={d:isRecov?descEFRecov():descEFStrides(),km:kQ2,type:'ef',shoe:null};

        sessions=[
          {d:dEF,km:kEF,type:'ef',shoe:null},
          sQ2, // 2ème qualité en 1er (plus légère) pour permettre récupération avant Q1
          sQ1, // 1ère qualité principale
          {d:isLastPlaisirWeek?bilanDesc:descLong(kL,phase,isRecov),km:kL,type:'long',shoe:null},
        ];
      } else {
        // Phase 1 ou décharge : 3 EF + longue (long run ≥35% volume)
        const k1=Math.max(Math.round(total*0.22),sFloor);
        const k2=Math.max(Math.round(total*0.18),sFloor);
        const k3=Math.max(Math.round(total*0.18),sFloor);
        const kL2raw=total-k1-k2-k3;
        const kL2=total>=14?capLong(Math.max(kL2raw,Math.round(total*0.35))):Math.min(Math.max(kL2raw,sFloor),longRunCap);
        sessions=[
          {d:isRecov?descEFRecov():descEF(),km:k1,type:'ef',shoe:null},
          {d:descEF(),km:k2,type:'ef',shoe:null},
          // Accélérations selon seuil niveau (Débutant S04, Intermédiaire S02, Confirmé S01)
          {d:useStridesP1?descEFStrides():descEF(),km:k3,type:'ef',shoe:null},
          {d:isLastPlaisirWeek?bilanDesc:descLong(kL2,phase,isRecov),km:kL2,type:'long',shoe:null},
        ];
      }
    }

    // ── Planification des dates ──────────────────────────────────────────────────
    const runDays=ob.run_days||[];
    const runTimes=ob.run_times||{};
    const sortedDays=[...runDays].sort((a,b)=>a-b);
    const planStart=new Date(); planStart.setHours(0,0,0,0);

    sessions.forEach((s,i)=>{
      if(s._isRace&&ob.date){
        const rd=new Date(ob.date+'T00:00:00');
        s.sched_date=ob.date;
        s.sched_day=rd.getDay()===0?7:rd.getDay();
        s.sched_time='09:00';
        delete s._isRace;
      } else {
        const dayOfWeek=sortedDays.length>0?sortedDays[i%sortedDays.length]:i%7;
        s.sched_day=dayOfWeek+1;
        s.sched_time=runTimes[dayOfWeek]||ob.run_time||'12:00';
        const weekOffset=new Date(planStart);
        weekOffset.setDate(planStart.getDate()+(w-1)*7);
        const dow=weekOffset.getDay();
        const mondayOffset=dow===0?-6:1-dow;
        const monday=new Date(weekOffset);
        monday.setDate(weekOffset.getDate()+mondayOffset);
        const sessionDate=new Date(monday);
        sessionDate.setDate(monday.getDate()+dayOfWeek);
        s.sched_date=sessionDate.toISOString().split('T')[0];
      }
      updates[`extra_w${w}_s${i}`]=JSON.stringify(s);
    });
  }
  return updates;
}
