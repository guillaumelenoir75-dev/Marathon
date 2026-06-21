// ── Plan Découverte (ultra débutant marche-course) ────────────────────────────
function generateDecouvertePlan(ob){
  const nbSess=Math.min(2,Math.max(1,parseInt(ob.sessions)||2));
  const course=ob.course||'5 km';

  // Durée : 8 semaines minimum, 24 max
  let numWeeks=8;
  if(ob.date){
    const diff=Math.floor((new Date(ob.date)-new Date())/(7*24*3600*1000));
    if(diff>0) numWeeks=Math.min(Math.max(diff,8),24);
  }

  // Allure EF si fournie
  const fmtPace=sec=>{const m=Math.floor(sec/60);const s=sec%60;return `${m}'${String(s).padStart(2,'0')}`;};
  const efRaw=ob.ef_pace||null;
  let efSec=null;
  if(efRaw){const p=efRaw.replace("'",":").split(':');if(p.length===2)efSec=parseInt(p[0])*60+parseInt(p[1]);}
  const efLabel=efSec?fmtPace(efSec):null;
  const efHint=efLabel?`allure ${efLabel}/km`:'allure très confort, on parle facilement';

  const fcMax=parseInt(ob.fc_max)||0;
  const efFCStr=fcMax?`FC ${Math.round(fcMax*0.70)}-${Math.round(fcMax*0.75)} bpm`:'FC basse, effort très léger';

  // Phases avec minimums pour éviter des transitions trop brutales sur plans courts
  // Phase 1 : Marche-Course (≈ 25%, min 3 sem)
  // Phase 2 : Progressif blocs (≈ 17%, min 2 sem)
  // Phase 3 : Course continue (≈ 25%, min 2 sem)
  // Phase 4 : EF + accélérations (reste, min 1 sem)
  const p1End=Math.max(3,Math.round(numWeeks*0.25));
  const p2End=Math.min(p1End+Math.max(2,Math.round(numWeeks*0.17)),numWeeks-3);
  const p3End=Math.min(p2End+Math.max(2,Math.round(numWeeks*0.25)),numWeeks-1);
  const getPhase=w=>w<=p1End?1:w<=p2End?2:w<=p3End?3:4;

  // Progression km : 3 km (S1) → 6 km (dernière semaine), entiers, linéaire
  const kmSemaine=w=>Math.round(3+(w-1)/(numWeeks-1)*3);

  // Progression marche-course : 1'30" → 2' → 2'30" → 3' → 4' sur la phase 1
  const descMarche=w=>{
    const step=w-1;
    const runSecs=[90,120,150,180,240];
    const rs=runSecs[Math.min(step,runSecs.length-1)];
    const walkSec=rs<=150?90:60;
    const reps=rs<=90?7:rs<=150?6:5;
    const totalMin=Math.round((rs+walkSec)*reps/60);
    const fmt=s=>s%60===0?`${s/60}'`:(s===90?`1'30"`:s===150?`2'30"`:s===210?`3'30"`:`${Math.floor(s/60)}'${s%60}"`);
    return {type:'ef',km:kmSemaine(w),d:`Marche-Course|${fmt(rs)} course / ${fmt(walkSec)} marche × ${reps} répétitions · ${efHint} · ${efFCStr} · ${totalMin} min environ · bien respirer, jamais essoufflé(e)`};
  };

  // Progression blocs : 4' → 5' → 6' / 1' marche
  const descProgressif=w=>{
    const step=w-p1End-1;
    const runMins=[4,5,6];
    const runMin=runMins[Math.min(step,runMins.length-1)];
    const reps=4;
    const totalMin=Math.round((runMin+1)*reps)+3;
    return {type:'ef',km:kmSemaine(w),d:`Course progressive|${runMin}' course / 1' marche × ${reps} répétitions · ${efHint} · ${efFCStr} · ${totalMin} min environ · allonger progressivement les blocs, confort avant tout`};
  };

  // Course continue
  const descContinue=w=>{
    const step=w-p2End-1;
    const durees=[22,25,27,29,31,33,35];
    const minRun=durees[Math.min(step,durees.length-1)];
    const msg=step===0?`félicite-toi, c'est une vraie étape — tu cours sans t'arrêter !`:`rythme confort, foulée relâchée · construire la confiance`;
    return {type:'ef',km:kmSemaine(w),d:`Footing EF|${minRun} min continue · ${efHint} · ${efFCStr} · allure conversationnelle, jamais essoufflé(e) · ${msg}`};
  };

  // EF + accélérations
  const descAccel=w=>{
    const step=w-p3End-1;
    const p3Steps=p3End-p2End;
    const p3Durees=[20,23,26,28,30,32,35];
    const lastP3=p3Durees[Math.min(p3Steps-1,p3Durees.length-1)];
    const minRun=Math.min(lastP3+2+step*2,42);
    const nbAccel=Math.min(2+Math.floor(step/2),5);
    return {type:'ef',km:kmSemaine(w),d:`EF + accélérations|${minRun} min EF · ${efHint} · ${efFCStr} · finir par ${nbAccel}×30-40" accélérations progressives (marcher entre chaque) · sensation de légèreté, ne pas sprinter`};
  };

  const getSession=w=>{
    const phase=getPhase(w);
    if(phase===1) return descMarche(w);
    if(phase===2) return descProgressif(w);
    if(phase===3) return descContinue(w);
    return descAccel(w);
  };

  // Planification des jours/horaires
  const runDays=(ob.run_days||[]).slice().sort((a,b)=>a-b);
  const runTimes=ob.run_times||{};
  // Calcul du lundi de départ : si la première séance de cette semaine est déjà passée, démarrer la semaine suivante
  const _today=new Date(); _today.setHours(0,0,0,0);
  const _todayDow=_today.getDay();
  const _thisMon=new Date(_today); _thisMon.setDate(_today.getDate()+(_todayDow===0?-6:1-_todayDow));
  const _firstDay=runDays.length>0?runDays[0]:0;
  const _firstDate=new Date(_thisMon); _firstDate.setDate(_thisMon.getDate()+_firstDay);
  const monday=new Date(_thisMon);
  if(_firstDate<_today) monday.setDate(_thisMon.getDate()+7);

  const updates={};
  // Stocker les séances au format extra_w${w}_s${ei} pour que renderAthletePlan les affiche
  for(let w=1;w<=numWeeks;w++){
    for(let si=0;si<nbSess;si++){
      const s=getSession(w);
      if(si===1){
        s.km=Math.max(2,s.km-1);
        s.d=s.d.replace(/(\d+) min/,(_,n)=>`${Math.round(parseInt(n)*0.85)} min`);
      }
      // Injecter jour/heure/date
      if(runDays.length>0){
        const dayOfWeek=runDays[si%runDays.length];
        s.sched_day=dayOfWeek+1;
        s.sched_time=runTimes[dayOfWeek]||ob.run_time||'12:00';
        const weekMonday=new Date(monday);
        weekMonday.setDate(monday.getDate()+(w-1)*7);
        const sessionDate=new Date(weekMonday);
        sessionDate.setDate(weekMonday.getDate()+dayOfWeek);
        s.sched_date=sessionDate.toISOString().split('T')[0];
      }
      updates[`extra_w${w}_s${si}`]=JSON.stringify(s);
    }
  }

  const planConfig={course,niveau:'Découverte',nbSess,numWeeks,baseKm:6,date:ob.date||null};
  updates.plan_config=JSON.stringify(planConfig);
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
  // Synchronisé avec les contraintes onboarding (obDateChanged) : minima ajustés par nombre de séances
  const minW=(()=>{
    if(isPlaisir) return 8;
    if(course==='5 km') return 6;
    if(course==='10 km') return nbSess<=2?10:8;
    if(course==='Semi-marathon') return nbSess<=2?14:nbSess===3?10:8;
    if(course==='Marathon') return nbSess<=2?18:nbSess===3?14:12;
    return 8;
  })();
  const maxW=24; // 6 mois max
  // Plaisir sans date : 16 semaines par défaut (un semestre), min 8
  let numWeeks=isPlaisir?16:minW;
  if(ob.date){
    const diff=Math.floor((new Date(ob.date)-new Date())/(7*24*3600*1000));
    if(diff>0) numWeeks=Math.min(Math.max(diff,minW),maxW);
  }

  // ── Plafond de volume (pic du plan) ──────────────────────────────────────────
  // Plaisir : max 9 km/séance — progression qualitative, pas volumique.
  // Pic = min(nbSess×9, max(base×1.3, base+6)) — monte naturellement depuis 80%, varie via décharges.
  // Sessions qualité (tempo/fartlek) plafonnées à 10 km max.
  let peakKm;
  if(isPlaisir){
    const weekCap=nbSess*9; // {2:18, 3:27, 4:36}
    const growthCap=Math.round(Math.max(baseKm*1.3, baseKm+6));
    peakKm=Math.min(weekCap,growthCap);
  } else {
    const absMax={
      '5 km':         {2:32, 3:42, 4:52},
      '10 km':        {2:38, 3:52, 4:65},
      'Semi-marathon':{2:50, 3:65, 4:82},
      'Marathon':     {2:60, 3:82, 4:105},
    }[course]||{2:50,3:70,4:90};
    const baseMult={'5 km':1.55,'10 km':1.75,'Semi-marathon':2.0,'Marathon':2.2}[course]||1.8;
    const sessMult={2:0.90,3:1.0,4:1.18}[nbSess]||1.0;
    peakKm=Math.min(Math.round(baseKm*baseMult*sessMult),absMax[nbSess]||70);
  }

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

  // ── Semaines de décharge — pattern 3:1 / 4:1 ────────────────────────────────
  // Débutant : toujours 3:1 (corps en apprentissage, récupération fréquente nécessaire)
  // Intermédiaire : 3:1 standard
  // Confirmé : 4:1 (supporte des blocs de charge plus longs)
  // Plaisir : toujours 3:1 (priorité à la régularité sur la performance)
  const recovPeriod=niveau==='Confirmé'&&!isPlaisir&&numWeeks>12?4:3;
  const recovery=new Set();
  for(let w=recovPeriod;w<=numWeeks;w+=recovPeriod){
    if(w<taperStartW) recovery.add(w);
  }

  // ── Volume hebdomadaire ───────────────────────────────────────────────────────
  // Plaisir : sortie longue plafonnée à 12 km max (≈55% du pic hebdo, min 6 km)
  const longRunCap=isPlaisir?Math.min(12,Math.max(6,Math.round(peakKm*0.55))):
    {'Marathon':32,'Semi-marathon':22,'10 km':16,'5 km':12}[course]||32;

  const weekKms=[];
  // Départ plus doux selon le niveau : évite le choc en début de plan
  // Plaisir : départ toujours à 80% quelle que soit le niveau (plus de progression visible)
  let cur=baseKm*(isPlaisir?0.80:niveau==='Débutant'?0.85:niveau==='Intermédiaire'?0.92:1.0);
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
  const peakWeekNum=weekKms.lastIndexOf(Math.max(...weekKms))+1;

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
      if(niveau==='Confirmé'){
        if(phase===2) return {rep:8,dur:1,recup:'1:00'};
        if(phase===3) return {rep:10,dur:2,recup:'1:30'};
        if(phase===4) return {rep:6,dur:1,recup:'1:00'};
        return null;
      }
      // Intermédiaire
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

  // Progression du fractionné semaine après semaine dans la phase (+1 rep toutes les 2 semaines, max +3)
  const fracProgByWeek=(weekInPhase,phase)=>{
    const base=fracByPhase(phase);
    if(!base) return null;
    const bonus=Math.min(Math.floor(weekInPhase/2),3);
    const maxRep=niveau==='Confirmé'?14:10;
    return {rep:Math.min(base.rep+bonus,maxRep),dur:base.dur,recup:base.recup};
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
  // weekInPhase : position 0-indexée dans la phase 3, utilisée pour la progression douce de l'allure course
  const descLong=(km,phase,isRecov=false,weekInPhase=0)=>{
    if(isRecov) return efLabel
      ?`Sortie longue récupération|${efLabel}/km ou plus lent · rythme conservateur, ne pas dépasser ${efFCStr} · plaisir et décontraction uniquement`
      :`Sortie longue récupération|allure très facile, priorité au plaisir et à la récupération`;
    // Phase 3 — sorties longues spécifiques (simulation race), progression douce de l'allure course
    // Progression : 1km semaine 1-2, 2km semaines 3-4, 3km semaines 5-6… plafonné par le km total
    if(phase===3&&!isPlaisir){
      // Plafond max selon le kilométrage (pic du plan)
      const specCalc=(maxKm)=>{
        const progressive=Math.ceil((weekInPhase+1)/2); // 1,1,2,2,3,3,4,4…
        return Math.min(progressive,maxKm,km-2); // toujours ≥2km EF
      };
      if(course==='Marathon'&&racePaceLbl&&efLabel){
        const maxSpec=km>=28?10:km>=24?8:6;
        const specKm=Math.max(1,specCalc(maxSpec));
        return `Sortie longue spécifique marathon|${efLabel}/km · ${km-specKm} km EF → finir ${specKm} km à ${racePaceLbl}/km (allure marathon) · simulation race · construire la confiance et l'économie de fin de course`;
      }
      if(course==='Semi-marathon'&&semiLbl&&efLabel){
        const maxSpec=km>=18?6:km>=14?4:3;
        const specKm=Math.max(1,specCalc(maxSpec));
        return `Sortie longue spécifique semi|${efLabel}/km · ${km-specKm} km EF → finir ${specKm} km à ${semiLbl}/km (allure semi) · simulation du finish · ${tempoFCStr}`;
      }
      if(course==='10 km'&&racePaceLbl&&efLabel){
        const maxSpec=km>=14?4:km>=12?3:2;
        const specKm=Math.max(1,specCalc(maxSpec));
        return `Sortie longue spécifique 10km|${efLabel}/km · ${km-specKm} km EF → finir ${specKm} km à ${racePaceLbl}/km (allure 10km) · habituer l'organisme à courir vite en état de fatigue · ${tempoFCStr}`;
      }
      if(course==='5 km'&&racePaceLbl&&efLabel){
        const maxSpec=km>=10?2:1;
        const specKm=Math.max(1,specCalc(maxSpec));
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
    const body=`15 min EF · ${rep}×${dur} min ${pStr}${pDesc} · ${tempoFCStr}${note}`;
    return isBlock
      ?`Tempo décharge ${rep}×${dur} min|${body} · 10-15 min retour au calme EF`
      :`Tempo ${isRecov?'décharge ':''}${rep}×${dur} min|${body} · récup ${recup} min trot · 10-15 min retour au calme EF`;
  };

  // Fractionné — court (≤2 min) = vitesse/neuromusculaire · long (≥3 min) = VO₂max
  // isRecov : décharge — reps réduites, allure légèrement inférieure
  const descFrac=(fp,isTaper=false,isRecov=false)=>{
    const {rep,dur,recup}=fp;
    const isShort=dur<=2;
    const sessionTitle=isShort?'Fractionné court (vitesse)':'Fractionné VO₂max';
    const pDesc=isShort
      ?'VMA / stimulation neuromusculaire'
      :({'5 km':'VMA / allure 5km','10 km':'VO₂max / allure 5-10km','Semi-marathon':'VO₂max','Marathon':'VO₂max'}[course]||'VO₂max');
    const pLbl=isRecov&&fracRecovLbl?fracRecovLbl:fracLbl;
    const pStr=pLbl?(fracMinLbl&&!isRecov?`${fracMinLbl}–${pLbl}/km · `:`${pLbl}/km · `):'';
    const note=isRecov
      ?' · décharge : reps réduites, allure légèrement inférieure — maintenir les sensations sans se fatiguer'
      :isTaper?' · affûtage : vivacité maintenue':'';
    const shortHint=isShort?' · accent sur la cadence et l\'économie de foulée':'';
    const title=isRecov?'Fractionné décharge':sessionTitle;
    return `${title} ${rep}×${dur} min|15 min EF · ${rep}×${dur} min ${pStr}${pDesc} · récup ${recup} min trot · ${fracFCStr}${note}${shortHint} · 10-15 min retour au calme EF`;
  };

  // Côtes — progressive selon la phase (court → moyen → long)
  const descCotes=(phase)=>{
    if(phase===1) return `Séance côtes|15 min EF · 8×(20 sec montée vive + descente trot) · renforcement musculaire, foulée puissante, posture · 10 min retour au calme EF`;
    if(phase===2) return `Côtes progressives|15 min EF · 5×(25 sec côte + descente récup) → 4×(35 sec côte + descente) · progression de l'effort, chaîne postérieure · 10 min retour au calme EF`;
    return `Côtes longues|15 min EF · 6×(45 sec côte soutenue + descente active récup) · endurance musculaire, puissance aérobie, force de finisseur · 10 min retour au calme EF`;
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
    const fastPart=phase===3?'dernier quart de séance':'derniers 20%';
    if(targetLbl&&efLabel)
      return `Course en progression|${efLabel}/km (début) · crescendo naturel · ${fastPart} à ${targetLbl}/km (${targetDesc}) · ne jamais forcer au départ, laisser venir le rythme · confiance en l'allure cible`;
    return efLabel
      ?`Course en progression|${efLabel}/km départ très facile · crescendo naturel sur toute la durée · finir à effort soutenu, jamais essoufflé`
      :`Course en progression|départ très facile · crescendo progressif naturel · habituer le corps à finir fort`;
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
  // Phase du plan — durée Phase 1 proportionnelle au plan (évite 7/14 sem = 50% en base pour Débutant court)
  // Débutant   : ~40% du plan (min 4, max 8 sem)
  // Intermédiaire : ~28% du plan (min 2, max 6 sem)
  // Confirmé   : ~18% du plan (min 1, max 4 sem)
  const p1Ratio={Débutant:0.40,Intermédiaire:0.28,Confirmé:0.18}[niveau]||0.28;
  const p1Min ={Débutant:4,Intermédiaire:2,Confirmé:1}[niveau]||2;
  const p1MaxW={Débutant:8,Intermédiaire:6,Confirmé:4}[niveau]||6;
  const p1Weeks=Math.max(p1Min,Math.min(p1MaxW,Math.round(numWeeks*p1Ratio)));
  const getPhase=(w)=>{
    if(w>=taperStartW) return 4;
    const p1End=Math.min(p1Weeks, taperStartW-4); // garde au moins 4 semaines de qualité
    const p2End=Math.min(p1End+Math.round(numWeeks*0.30), taperStartW-2); // garde ≥1 semaine Phase 3
    if(w<=p1End) return 1;
    if(w<=p2End) return 2;
    return 3;
  };

  // Course test intermédiaire : marathon ≥ 14 semaines, placée au début de la Phase 3
  // Doit être calculé APRÈS getPhase (const arrow — pas de hoisting)
  let testRaceWeek=0;
  if(course==='Marathon'&&numWeeks>=14&&!isPlaisir){
    let _p3Start=taperStartW-1;
    for(let _w=1;_w<taperStartW;_w++){if(getPhase(_w)===3){_p3Start=_w;break;}}
    while(recovery.has(_p3Start)&&_p3Start<taperStartW-1) _p3Start++;
    testRaceWeek=recovery.has(_p3Start)||_p3Start>=taperStartW?0:_p3Start;
  }

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
    const fp=fracProgByWeek(weekInPhase,phase);
    // En décharge : réduire significativement (≈ -40 à -50% du volume qualité)
    const reduce=(p,minDur=4)=>p?{rep:Math.max(1,p.rep-1),dur:Math.max(minDur,Math.round(p.dur*0.55)),recup:p.recup}:null;
    const tpR=isRecov?reduce(tp,5):(allowReduce&&tp?{rep:Math.max(1,tp.rep-1),dur:Math.max(4,tp.dur-2),recup:tp.recup}:tp);
    const fpR=isRecov?reduce(fp,1):(allowReduce&&fp?{rep:Math.max(1,fp.rep-1),dur:Math.max(3,fp.dur-1),recup:fp.recup}:fp);
    if(qt==='frac'&&fpR)    return {d:descFrac(fpR,isTaper,isRecov),type:'frac'};
    if(qt==='cotes')        return {d:descCotes(isRecov?1:phase),type:'ef'}; // côtes courtes en décharge
    if(qt==='fartlek')      return {d:descFartlek(isRecov?1:phase),type:'ef'}; // fartlek découverte en décharge
    if(qt==='tempo'&&tpR)   return {d:descTempo(tpR,isTaper,isRecov),type:'tempo'};
    if(qt==='progression')  return isRecov?{d:descFartlek(1),type:'ef'}:{d:descProgression(phase),type:'tempo'}; // pas de progression en décharge
    // Fallback : pas encore de tempo/frac disponible → fartlek (plus côtes)
    if(qt==='frac'||qt==='tempo') return {d:descFartlek(isRecov?1:phase),type:'ef'};
    return null;
  };


  // ── Planification — lundi de départ ──────────────────────────────────────────
  // Si la première séance de la semaine courante est déjà passée → démarrer la semaine suivante
  const runTimes=ob.run_times||{};
  const sortedDays=[...(ob.run_days||[])].sort((a,b)=>a-b);
  const _t=new Date(); _t.setHours(0,0,0,0);
  const _tDow=_t.getDay();
  const _thisMon=new Date(_t); _thisMon.setDate(_t.getDate()+(_tDow===0?-6:1-_tDow));
  const _fDay=sortedDays.length>0?sortedDays[0]:0;
  const _fDate=new Date(_thisMon); _fDate.setDate(_thisMon.getDate()+_fDay);
  const startMonday=new Date(_thisMon);
  if(_fDate<_t) startMonday.setDate(_thisMon.getDate()+7);

  // ── Boucle principale ─────────────────────────────────────────────────────────
  const updates={};
  // Métadonnées du plan (version, config, pic de charge)
  updates['plan_version']=2;
  updates['plan_peak_week']=peakWeekNum;
  updates['plan_config']=JSON.stringify({course,niveau,nbSess,numWeeks,baseKm,date:ob.date||null});

  let _phaseStartW=1;
  let _lastPhase=1;
  let _specWeekCount=0; // semaines effectives de phase 3 (hors décharges) — pour progression douce allure course

  for(let w=1;w<=numWeeks;w++){
    const total=weekKms[w-1];
    const isRecov=recovery.has(w);
    const isRaceWeek=w===numWeeks&&!!ob.date;
    const weekInTaper=w>=taperStartW?w-taperStartW+1:0;
    const noIntensity=taperCfg.noInt.includes(weekInTaper)||isRaceWeek;
    const phase=getPhase(w);
    const isTaper=phase===4;

    // Tracker la semaine dans la phase (pour indexer Q_MATRIX)
    if(phase!==_lastPhase){_phaseStartW=w;_lastPhase=phase;_specWeekCount=0;}
    const weekInPhase=w-_phaseStartW; // 0-indexé (pour Q_MATRIX)
    // Pour la progression de l'allure course : ne compte que les semaines non-décharge en phase 3
    const specWeekIndex=_specWeekCount; // 0-indexé, n'avance pas sur les décharges
    if(phase===3&&!isRecov) _specWeekCount++;

    const sFloor=total<10?2:3;
    // longSFloor adaptatif : plancher long run ne peut pas dépasser ~40% du volume total
    const longSFloorRaw=Math.max(sFloor,total>=12?5:total>=8?4:3);
    const longSFloor=Math.min(longSFloorRaw,Math.max(sFloor,Math.floor(total*0.40)));
    const capLong=(base)=>Math.min(Math.max(base,longSFloor),longRunCap);

    // Course test intermédiaire (marathon ≥ 14 sem) — remplace la sortie longue cette semaine
    const isTestRaceWeek=testRaceWeek>0&&w===testRaceWeek&&!isRecov;
    const buildLongSession=(km,ph,rec,specIdx)=>{
      if(isTestRaceWeek){
        const testDist=nbSess>=3?21:10;
        const testPaceLbl=racePaceSec?fmtPace(Math.round(racePaceSec*(testDist===21?0.95:0.90))):null;
        const d=`🏁 Course test ${testDist===21?'semi-marathon':'10 km'}|${testDist} km · ${testPaceLbl?'allure indicative '+testPaceLbl+'/km pour évaluer ta forme':'courir à l\'effort, jauger tes sensations'}${racePaceLbl?' · référence marathon : '+racePaceLbl+'/km':''} · bilan précieux sur ta progression à mi-plan`;
        return {d,km:testDist,type:'race',shoe:null};
      }
      const d=isLastPlaisirWeek?bilanDesc:descLong(km,ph,rec,specIdx);
      return {d,km,type:'long',shoe:null};
    };

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

      let s0;
      if(isRecov){
        s0={d:descEFRecov(),km:kEF,type:'ef',shoe:null};
      } else if(isPlaisir&&phase>=2&&!isTaper){
        // Plaisir 2 sessions : qualité selon Q_MATRIX (tempo Phase 2+, fartlek alterné)
        // Qualité plafonnée à 10 km max — tempo court = plus d'intensité, moins de fatigue
        const qPlaisir=resolveQ(getQType(phase,weekInPhase),phase,weekInPhase,isTaper,false);
        const kQual=Math.min(kEF,10);
        s0=qPlaisir?{d:qPlaisir.d,km:kQual,type:qPlaisir.type,shoe:null}:{d:descEFStrides(),km:kEF,type:'ef',shoe:null};
      } else {
        // Plans course 2 sessions : EF pur en Phase 1, accélérations dès Phase 2+
        // S'adapte automatiquement à la durée du plan (court ou long)
        const use2sStrides=phase>=2&&!isRecov&&!isTaper;
        s0={d:use2sStrides?descEFStrides():descEF(),km:kEF,type:'ef',shoe:null};
      }
      sessions=[s0,buildLongSession(kL,phase,isRecov,specWeekIndex)];

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
          buildLongSession(kL,phase,isRecov,specWeekIndex),
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
          buildLongSession(kL,phase,isRecov,specWeekIndex),
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
        sQ1=q1?{d:q1.d,km:kQ1,type:q1.type,shoe:null}:{d:descEF(),km:kQ1,type:'ef',shoe:null};
        // Q2 : toujours EF avec accélérations (jamais qualité intensive)
        sQ2={d:isRecov?descEFRecov():descEFStrides(),km:kQ2,type:'ef',shoe:null};

        sessions=[
          {d:dEF,km:kEF,type:'ef',shoe:null},
          sQ2, // 2ème qualité en 1er (plus légère) pour permettre récupération avant Q1
          sQ1, // 1ère qualité principale
          buildLongSession(kL,phase,isRecov,specWeekIndex),
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
          buildLongSession(kL2,phase,isRecov,specWeekIndex),
        ];
      }
    }

    // ── Planification des dates ──────────────────────────────────────────────────
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
        const weekMonday=new Date(startMonday);
        weekMonday.setDate(startMonday.getDate()+(w-1)*7);
        const sessionDate=new Date(weekMonday);
        sessionDate.setDate(weekMonday.getDate()+dayOfWeek);
        s.sched_date=sessionDate.toISOString().split('T')[0];
      }
      updates[`extra_w${w}_s${i}`]=JSON.stringify(s);
    });
  }
  return updates;
}
