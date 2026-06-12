function generateAthletePlan(ob){
  // ── Paramètres ──────────────────────────────────────────────────────────────
  const baseKm   = parseInt(ob.km_semaine)||20;
  const nbSess   = Math.min(4,Math.max(1,parseInt(ob.sessions)||3));
  const niveau   = ob.niveau||'Intermédiaire'; // Débutant / Intermédiaire / Confirmé
  const course   = ob.course||'Marathon';
  const isPlaisir= course==='Plaisir';

  // ── Durée du plan ───────────────────────────────────────────────────────────
  // Durées minimales recommandées par distance (semaines)
  const minW={Plaisir:24,'5 km':8,'10 km':10,'Semi-marathon':12,'Marathon':16}[course]||16;
  let numWeeks=minW;
  if(ob.date){
    const diff=Math.floor((new Date(ob.date)-new Date())/(7*24*3600*1000));
    if(diff>0) numWeeks=Math.min(Math.max(diff,minW),32);
  }

  // ── Volume de pointe ────────────────────────────────────────────────────────
  // Règle des 10% : on ne dépasse pas peakKm même en accélérant la progression
  // Plafonds absolus par distance et nb séances (sécurité anti-surcharge)
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

  // ── Affûtage (taper) ────────────────────────────────────────────────────────
  // Basé sur Pfitzinger & Douglas : réduction progressive du volume, maintien qualité S1
  const taperCfg=isPlaisir?{w:0,r:[],noInt:[]}:{
    'Marathon':      {w:3,r:[0.78,0.55,0.22],noInt:[3]},
    'Semi-marathon': {w:2,r:[0.68,0.28],     noInt:[2]},
    '10 km':         {w:2,r:[0.62,0.28],     noInt:[2]},
    '5 km':          {w:1,r:[0.48],          noInt:[1]},
  }[course]||{w:2,r:[0.65,0.28],noInt:[2]};

  // ── Semaines de décharge ────────────────────────────────────────────────────
  // Pattern 3:1 (Higdon/Daniels) — toutes les 4 semaines
  // Débutants sur petits volumes : 2:1 (toutes les 3 sem) pour mieux absorber
  const recovPeriod=baseKm<15?3:4;
  const recovery=new Set();
  for(let w=recovPeriod;w<=numWeeks;w+=recovPeriod) recovery.add(w);

  // ── Volume hebdomadaire ─────────────────────────────────────────────────────
  const longRunCap=isPlaisir?Math.min(Math.max(16,Math.round(baseKm*1.1)),26):
    {'Marathon':32,'Semi-marathon':22,'10 km':16,'5 km':12}[course]||32;

  const weekKms=[];
  let cur=baseKm;
  for(let w=1;w<=numWeeks;w++){
    if(recovery.has(w)){
      const lastBuild=weekKms.filter((_,i)=>!recovery.has(i+1)).slice(-1)[0]||cur;
      weekKms.push(Math.max(Math.round(lastBuild*0.80),Math.max(3,Math.round(baseKm*0.78))));
    } else {
      weekKms.push(Math.min(Math.round(cur),peakKm));
      if(cur<peakKm) cur=Math.min(cur*(cur<15?1.10:1.07),peakKm); // max +10%/sem
    }
  }
  // Appliquer affûtage
  const peakVol=Math.max(...weekKms);
  if(taperCfg.r.length>0&&numWeeks>taperCfg.w+4){
    taperCfg.r.forEach((ratio,i)=>{
      weekKms[numWeeks-taperCfg.r.length+i]=Math.max(Math.round(peakVol*ratio),3);
    });
  }
  const taperStartW=taperCfg.w>0?numWeeks-taperCfg.w+1:numWeeks+1;

  // ── Calcul des allures ──────────────────────────────────────────────────────
  const fmtPace=sec=>{const m=Math.floor(sec/60);const s=sec%60;return `${m}'${String(s).padStart(2,'0')}`;};

  // EF déclarée
  const efRaw=ob.ef_pace||null;
  let efSec=null;
  if(efRaw){const p=efRaw.replace("'",":").split(':');if(p.length===2)efSec=parseInt(p[0])*60+parseInt(p[1]);}

  // Allure de course depuis le temps cible
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

  // EF effective (déclarée ou dérivée du race pace)
  let effectiveEfSec=efSec;
  if(!effectiveEfSec&&racePaceSec){
    // EF ≈ race_pace × 1.28–1.40 selon distance/niveau (Jack Daniels zones)
    const efMult={'Marathon':{Débutant:1.40,Intermédiaire:1.36,Confirmé:1.32},'Semi-marathon':{Débutant:1.38,Intermédiaire:1.34,Confirmé:1.30},'10 km':{Débutant:1.35,Intermédiaire:1.31,Confirmé:1.28},'5 km':{Débutant:1.32,Intermédiaire:1.28,Confirmé:1.25}}[course]||{Débutant:1.38,Intermédiaire:1.34,Confirmé:1.30};
    effectiveEfSec=Math.round(racePaceSec*(efMult[niveau]||1.35));
  }
  const efLabel=effectiveEfSec?fmtPace(effectiveEfSec):null;

  // Tempo (seuil lactate ~85-88% FCmax, ~20-30s plus lent que race pace semi)
  let tempoPaceSec=null;
  if(racePaceSec){
    const tm={'Marathon':{Débutant:0.965,Intermédiaire:0.952,Confirmé:0.940},'Semi-marathon':{Débutant:0.960,Intermédiaire:0.945,Confirmé:0.930},'10 km':{Débutant:0.965,Intermédiaire:0.950,Confirmé:0.940},'5 km':{Débutant:0.980,Intermédiaire:0.972,Confirmé:0.962}}[course]||{Débutant:0.965,Intermédiaire:0.952,Confirmé:0.940};
    tempoPaceSec=Math.round(racePaceSec*(tm[niveau]||0.952));
  } else if(effectiveEfSec){
    tempoPaceSec=effectiveEfSec+(niveau==='Débutant'?-52:niveau==='Confirmé'?-78:-62);
  }
  if(tempoPaceSec&&effectiveEfSec&&tempoPaceSec>effectiveEfSec-25) tempoPaceSec=effectiveEfSec-30;
  const tempoLbl=tempoPaceSec?fmtPace(tempoPaceSec):null;

  // Fractionné VO2max (95-100% VMA)
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

  // Allure spécifique semi / marathon
  const semiPaceSec=course==='Semi-marathon'&&racePaceSec?racePaceSec:racePaceSec?Math.round(racePaceSec*0.955):null;
  const semiLbl=semiPaceSec?fmtPace(semiPaceSec):null;
  const racePaceLbl=racePaceSec?fmtPace(Math.round(racePaceSec)):null;

  // FC zones
  const fcMax=parseInt(ob.fc_max)||0;
  const efFCStr  =fcMax?`FC ${Math.round(fcMax*0.70)}-${Math.round(fcMax*0.75)} bpm`:'FC basse, allure confort';
  const tempoFCStr=fcMax?`FC ${Math.round(fcMax*0.82)}-${Math.round(fcMax*0.88)} bpm`:'FC modérée-haute';
  const fracFCStr =fcMax?`FC ${Math.round(fcMax*0.88)}-${Math.round(fcMax*0.95)} bpm`:'FC haute, effort intense';

  // ── Descriptions de séances ──────────────────────────────────────────────────

  // EF — 4 variantes pour éviter la répétition
  const EF_VARIANTS=[
    efLabel?`Séance EF|${efLabel}/km · ${efFCStr} · conversation fluide, effort très contrôlé`:`Séance EF|allure confort, conversation possible, effort facile`,
    efLabel?`Footing EF|${efLabel}/km · ${efFCStr} · respiration rythmée, pas relâché`:`Footing EF|respiration rythmée, foulée relâchée`,
    efLabel?`Endurance fondamentale|${efLabel}/km · ${efFCStr} · aérobie pur, jambes légères`:`Endurance fondamentale|aérobie pur, allure conversationnelle`,
    efLabel?`Footing récupération|${efLabel}/km · allure très facile, ne pas forcer`:`Footing récupération|allure très facile, ne pas forcer`,
  ];
  let _efV=0;
  const descEF=()=>EF_VARIANTS[_efV++%EF_VARIANTS.length];

  // Long runs — progressent selon la phase du plan
  const descLong=(km,phase,specKm=0)=>{
    if(specKm>0&&racePaceLbl&&efLabel)
      return `Sortie longue spécifique|${efLabel}/km · dernier${specKm>1?'s':''} ${specKm} km à ${course==='Semi-marathon'?semiLbl||racePaceLbl:racePaceLbl}/km · simulation ${course==='Marathon'?'marathon':'semi'} · ${efFCStr}`;
    if(phase>=3&&efLabel) return `Sortie longue soutenue|${efLabel}/km · 20 min de finisseur légèrement plus vite en fin de séance · construire la résistance`;
    if(phase>=2&&efLabel) return `Sortie longue progression|${efLabel}/km · 15 dernières min légèrement plus vite · progression naturelle`;
    return efLabel?`Sortie longue EF|${efLabel}/km · ${efFCStr} · plaisir avant tout, rythme conservateur`:`Sortie longue EF|allure confort, durée > vitesse`;
  };

  // Tempo — seuil lactate (allure semi pour semi-marathon, tempo pour le reste)
  const descTempo=(rep,dur,recup)=>{
    const isBlock=recup==='0:00';
    const pLbl=course==='Semi-marathon'&&semiLbl?semiLbl:tempoLbl;
    const pDesc=course==='Semi-marathon'?'allure semi-marathon':'allure seuil lactate';
    const pStr=pLbl?`${pLbl}/km · `:'';
    const base=`3 km EF · ${rep}×${dur} min ${pStr}${pDesc} · ${tempoFCStr}`;
    return isBlock?`Tempo continu ${rep}×${dur} min|${base} · récupération active · EF de fin`
      :`Tempo ${rep}×${dur} min|${base} · récup ${recup} min trot · EF de fin`;
  };

  // Fractionné VO2max
  const descFrac=(rep,dur,recup)=>{
    const pDesc={'5 km':'VMA / allure 5km','10 km':'VO₂max / allure 5-10km','Semi-marathon':'VO₂max','Marathon':'VO₂max'}[course]||'VO₂max';
    const pStr=fracLbl?(fracMinLbl?`${fracMinLbl}–${fracLbl}/km · `:`${fracLbl}/km · `):'';
    return `Fractionné ${rep}×${dur} min|3 km EF · ${rep}×${dur} min ${pStr}${pDesc} · récup ${recup} min trot · ${fracFCStr} · EF de fin`;
  };

  // Côtes — force, foulée, économie de course (3 variantes progressives)
  const COTES_V=[
    `Séance côtes|3 km EF · 8×(20 sec montée vive + descente trot) · renforcement musculaire, foulée puissante · EF de fin`,
    `Côtes courtes|3 km EF · 10×(25 sec côte dynamique + descente récup active) · économie de course, force spécifique · EF de fin`,
    `Côtes longues|3 km EF · 6×(45 sec côte soutenue + descente lente) · endurance musculaire, puissance aérobie · EF de fin`,
  ];
  let _cotesV=0;
  const descCotes=()=>COTES_V[_cotesV++%COTES_V.length];

  // Fartlek — jeu de rythme non structuré (3 niveaux)
  const FARTLEK_V=[
    efLabel?`Fartlek découverte|${efLabel}/km base · 6×(30 sec allure vive + 2 min trot) · jeu de rythme naturel, pas de montre`:`Fartlek découverte|6×(30 sec allure vive + 2 min trot) · jeu de rythme, liberté d'allure`,
    efLabel?`Fartlek progressif|${efLabel}/km base · 8×(40 sec vive + 90 sec trot) puis 4×(20 sec sprint + 1 min trot) · variété des efforts`:`Fartlek progressif|8×(40 sec vive + 90 sec trot) · sensations, accélérations libres`,
    efLabel?`Fartlek avancé|${efLabel}/km base · 5 min tempo + 2×(4×30 sec VMA + 1 min récup) + 5 min tempo · polyvalence`:`Fartlek avancé|5 min tempo + accélérations courtes + 5 min tempo · travail multi-vitesses`,
  ];
  let _farV=0;
  const descFartlek=(phase)=>FARTLEK_V[Math.min(phase-1,FARTLEK_V.length-1)];

  // Allure spécifique marathon (phase de pic)
  const descSpecificMarathon=(km)=>{
    if(!racePaceLbl||!efLabel) return efLabel?`Sortie longue EF|${efLabel}/km · ${efFCStr}`:`Sortie longue EF|allure confort`;
    const specKm=km>=28?10:km>=24?8:6;
    return `Sortie longue spécifique|${efLabel}/km · dernier${specKm>1?'s':''} ${specKm} km à ${racePaceLbl}/km (allure marathon) · simulation course`;
  };

  // ── Progressions des séances qualité ─────────────────────────────────────────

  const tempoProgression=(w)=>{
    const introW=isPlaisir?(baseKm<20?4:3):(niveau==='Débutant'?6:niveau==='Confirmé'?2:3);
    if(w<introW) return null;
    const age=w-introW;
    if(niveau==='Débutant'){
      if(age<2) return {rep:1,dur:6, recup:'3:00'};
      if(age<4) return {rep:1,dur:8, recup:'3:00'};
      if(age<6) return {rep:2,dur:6, recup:'3:00'};
      if(age<9) return {rep:2,dur:8, recup:'3:00'};
      if(age<13)return {rep:2,dur:10,recup:'3:00'};
      return          {rep:2,dur:12,recup:'3:00'};
    }
    if(niveau==='Confirmé'){
      if(age<2) return {rep:2,dur:8, recup:'2:30'};
      if(age<4) return {rep:2,dur:10,recup:'2:30'};
      if(age<6) return {rep:3,dur:10,recup:'2:30'};
      if(age<10)return {rep:3,dur:12,recup:'2:30'};
      return          {rep:3,dur:15,recup:'2:30'};
    }
    // Intermédiaire
    if(age<2) return {rep:1,dur:8, recup:'3:00'};
    if(age<4) return {rep:2,dur:8, recup:'3:00'};
    if(age<6) return {rep:2,dur:10,recup:'3:00'};
    if(age<10)return {rep:2,dur:12,recup:'3:00'};
    return          {rep:3,dur:12,recup:'3:00'};
  };

  const fracProgression=(w)=>{
    const introW=niveau==='Débutant'?5:niveau==='Confirmé'?2:3;
    if(w<introW) return null;
    const age=w-introW;
    if(course==='5 km'){
      if(niveau==='Débutant'){
        if(age<2) return {rep:5,dur:1,recup:'1:30'};
        if(age<4) return {rep:6,dur:1,recup:'1:30'};
        if(age<6) return {rep:5,dur:2,recup:'2:00'};
        if(age<10)return {rep:6,dur:2,recup:'2:00'};
        return          {rep:5,dur:3,recup:'2:00'};
      }
      if(age<2) return {rep:6, dur:1,recup:'1:30'};
      if(age<4) return {rep:8, dur:1,recup:'1:30'};
      if(age<6) return {rep:6, dur:2,recup:'2:00'};
      if(age<10)return {rep:8, dur:2,recup:'2:00'};
      return          {rep:10,dur:2,recup:'2:00'};
    }
    // 10km, Semi, Marathon
    if(niveau==='Débutant'){
      if(age<2) return {rep:4,dur:2,recup:'2:30'};
      if(age<4) return {rep:4,dur:3,recup:'2:30'};
      if(age<6) return {rep:5,dur:3,recup:'2:30'};
      if(age<10)return {rep:4,dur:4,recup:'3:00'};
      return          {rep:4,dur:5,recup:'3:00'};
    }
    if(niveau==='Confirmé'){
      if(age<2) return {rep:5,dur:3,recup:'2:00'};
      if(age<4) return {rep:6,dur:3,recup:'2:00'};
      if(age<6) return {rep:5,dur:4,recup:'2:00'};
      if(age<10)return {rep:6,dur:4,recup:'2:00'};
      return          {rep:5,dur:5,recup:'2:00'};
    }
    if(age<2) return {rep:4,dur:3,recup:'2:30'};
    if(age<4) return {rep:5,dur:3,recup:'2:30'};
    if(age<6) return {rep:6,dur:3,recup:'2:30'};
    if(age<10)return {rep:4,dur:5,recup:'3:00'};
    return          {rep:5,dur:5,recup:'3:00'};
  };

  const reduceIntensity=(prog)=>prog?{rep:Math.max(1,prog.rep-1),dur:Math.max(4,prog.dur-2),recup:prog.recup}:null;

  // ── Cycles de rotation des séances qualité par distance ─────────────────────
  // Inspiré du principe 80/20 (Seiler) : varier les stimuli, jamais la même séance 2 sem de suite
  // Types: 'tempo','frac','cotes','fartlek'
  // Les décharges restent en 'tempo' réduit (plus simple à gérer psychologiquement)
  const QUALITY_CYCLES={
    'Plaisir':        ['fartlek','tempo','fartlek','tempo','fartlek','tempo'],
    '5 km':           ['frac','cotes','frac','tempo','frac','cotes'],
    '10 km':          ['tempo','frac','cotes','tempo','frac','tempo'],
    'Semi-marathon':  ['tempo','frac','tempo','cotes','tempo','frac'],
    'Marathon':       ['tempo','cotes','tempo','frac','tempo','tempo'],
  };
  // 2ème séance qualité pour les plans 4 sessions (différente de la 1ère)
  const QUALITY2_CYCLES={
    'Plaisir':        ['fartlek','fartlek','tempo','fartlek','tempo','fartlek'],
    '5 km':           ['cotes','frac','cotes','frac','cotes','tempo'],
    '10 km':          ['frac','cotes','frac','cotes','frac','cotes'],
    'Semi-marathon':  ['frac','cotes','frac','tempo','frac','cotes'],
    'Marathon':       ['frac','cotes','frac','cotes','tempo','frac'],
  };
  const getQType=(w,isRecov)=>{
    if(isRecov) return 'tempo';
    const cycle=QUALITY_CYCLES[course]||QUALITY_CYCLES['Marathon'];
    return cycle[(w-1)%cycle.length];
  };
  const getQ2Type=(w)=>{
    const cycle=QUALITY2_CYCLES[course]||QUALITY2_CYCLES['Marathon'];
    return cycle[(w-1)%cycle.length];
  };

  // Phase du plan (1=base, 2=build, 3=spécifique/peak, 4=affûtage)
  const getPhase=(w)=>{
    if(w>=taperStartW) return 4;
    if(w<Math.ceil(numWeeks*0.20)) return 1;
    if(w<Math.ceil(numWeeks*0.55)) return 2;
    return 3;
  };

  // ── Séance Plaisir 2 sessions : tempo discret à semaines fixes ───────────────
  // Agenda explicite sur 24 semaines : entrée très douce au travail qualitatif
  const PLAISIR2_TEMPO={
    4: {rep:1,dur:5, recup:'0:00'},
    7: {rep:1,dur:7, recup:'0:00'},
    10:{rep:1,dur:9, recup:'0:00'},
    13:{rep:1,dur:12,recup:'0:00'},
    17:{rep:2,dur:8, recup:'3:00'},
    21:{rep:2,dur:10,recup:'3:00'},
  };

  // ── Construction des séances par semaine ─────────────────────────────────────
  const updates={};
  let _plaisirPhase=1;

  for(let w=1;w<=numWeeks;w++){
    const total=weekKms[w-1];
    const isRecov=recovery.has(w);
    const isRaceWeek=w===numWeeks&&!!ob.date;
    const weekInTaper=w>=taperStartW?w-taperStartW+1:0;
    const noIntensity=taperCfg.noInt.includes(weekInTaper)||isRaceWeek;
    const phase=getPhase(w);
    if(isPlaisir) _plaisirPhase=w<=8?1:w<=16?2:3;

    const sFloor=total<10?2:3;
    const capLong=(base)=>Math.min(Math.max(base,sFloor),longRunCap);

    // Progressions brutes de la semaine
    const tFull=tempoProgression(w);
    const fFull=fracProgression(w);
    const tProg=isRecov?reduceIntensity(tFull):tFull;
    const fProg=isRecov?reduceIntensity(fFull):fFull;

    const qType=getQType(w,isRecov);
    const q2Type=getQ2Type(w);

    // Séance qualité disponible ?
    const qualAvail=!noIntensity&&(qType==='cotes'||qType==='fartlek'||!!tProg||!!fProg);
    const hasQuality=qualAvail&&nbSess>=3;

    // Long run spécifique à partir de la phase 3 (non décharge, hors affûtage)
    const useSpecLong=!isPlaisir&&!isRecov&&weekInTaper===0&&phase===3&&niveau!=='Débutant';
    const specKm=course==='Marathon'?(total>=28?10:8):course==='Semi-marathon'?5:0;

    // Résoudre un type de séance qualité → {d, type}
    const resolveQ=(qt,prog_t,prog_f,allowReduce=false)=>{
      const tp=allowReduce?reduceIntensity(prog_t):prog_t;
      const fp=allowReduce?reduceIntensity(prog_f):prog_f;
      if(qt==='frac'&&fp)  return {d:descFrac(fp.rep,fp.dur,fp.recup),type:'frac'};
      if(qt==='cotes')     return {d:descCotes(),type:'ef'};
      if(qt==='fartlek')   return {d:descFartlek(_plaisirPhase),type:'ef'};
      if(tp)               return {d:descTempo(tp.rep,tp.dur,tp.recup),type:'tempo'};
      return null;
    };

    let sessions=[];

    if(isRaceWeek){
      // Semaine de course : activation légère + Jour J
      if(nbSess>=2) sessions.push({d:descEF(),km:3,type:'ef',shoe:null});
      sessions.push({d:`🏆 ${course}|Jour J${racePaceLbl?' · Objectif '+racePaceLbl+'/km':''}`,km:Math.round(raceDist),type:'race',shoe:null,_isRace:true});

    } else if(nbSess===1){
      sessions=[{d:descEF(),km:total,type:'ef',shoe:null}];

    } else if(nbSess===2){
      // 2 séances : EF + Long. Pour Plaisir : substituer EF par tempo ponctuel à semaines fixes
      const kL=capLong(Math.max(Math.round(total*0.55),sFloor));
      const kEF=Math.max(total-kL,sFloor);
      const dL=useSpecLong?descSpecificMarathon(kL):descLong(kL,phase,specKm);

      let s0;
      if(isPlaisir&&!isRecov&&PLAISIR2_TEMPO[w]){
        const t2=PLAISIR2_TEMPO[w];
        s0={d:descTempo(t2.rep,t2.dur,t2.recup),km:kEF,type:'tempo',shoe:null};
      } else {
        s0={d:descEF(),km:kEF,type:'ef',shoe:null};
      }
      sessions=[s0,{d:dL,km:kL,type:'long',shoe:null}];

    } else if(nbSess===3){
      const dL=useSpecLong?descSpecificMarathon(capLong(Math.round(total*0.43))):descLong(capLong(Math.round(total*0.43)),phase,specKm);
      if(hasQuality){
        const kEF=Math.max(Math.round(total*0.30),sFloor);
        const kQ =Math.max(Math.round(total*0.27),sFloor);
        const kL =capLong(total-kEF-kQ);
        const q=resolveQ(qType,tProg,fProg);
        sessions=[
          {d:descEF(),km:kEF,type:'ef',shoe:null},
          q?{d:q.d,km:kQ,type:q.type,shoe:null}:{d:descEF(),km:kQ,type:'ef',shoe:null},
          {d:useSpecLong?descSpecificMarathon(kL):descLong(kL,phase,specKm),km:kL,type:'long',shoe:null},
        ];
      } else {
        const k1=Math.max(Math.round(total*0.30),sFloor);
        const k2=Math.max(Math.round(total*0.25),sFloor);
        const kL=capLong(total-k1-k2);
        sessions=[
          {d:descEF(),km:k1,type:'ef',shoe:null},
          {d:descEF(),km:k2,type:'ef',shoe:null},
          {d:useSpecLong?descSpecificMarathon(kL):descLong(kL,phase,specKm),km:kL,type:'long',shoe:null},
        ];
      }

    } else {
      // 4 séances : EF + qualité légère + qualité principale + longue
      // → 2 séances qualité différentes chaque semaine = stimuli variés (principe de Seiler)
      const kEF =Math.max(Math.round(total*0.20),sFloor);
      const kQ1 =Math.max(Math.round(total*0.20),sFloor);
      const kQ2 =Math.max(Math.round(total*0.23),sFloor);
      const kL  =capLong(total-kEF-kQ1-kQ2);
      const dL  =useSpecLong?descSpecificMarathon(kL):descLong(kL,phase,specKm);

      if(hasQuality){
        const q1=resolveQ(qType,tProg,fProg);
        // Q2 : type différent, légèrement réduit
        const q2=resolveQ(q2Type,tProg,fProg,true);
        sessions=[
          {d:descEF(),km:kEF,type:'ef',shoe:null},
          q2?{d:q2.d,km:kQ1,type:q2.type,shoe:null}:{d:descEF(),km:kQ1,type:'ef',shoe:null},
          q1?{d:q1.d,km:kQ2,type:q1.type,shoe:null}:{d:descEF(),km:kQ2,type:'ef',shoe:null},
          {d:dL,km:kL,type:'long',shoe:null},
        ];
      } else {
        const k1=Math.max(Math.round(total*0.25),sFloor);
        const k2=Math.max(Math.round(total*0.20),sFloor);
        const k3=Math.max(Math.round(total*0.20),sFloor);
        const kL2=capLong(total-k1-k2-k3);
        sessions=[
          {d:descEF(),km:k1,type:'ef',shoe:null},
          {d:descEF(),km:k2,type:'ef',shoe:null},
          {d:descEF(),km:k3,type:'ef',shoe:null},
          {d:useSpecLong?descSpecificMarathon(kL2):descLong(kL2,phase,specKm),km:kL2,type:'long',shoe:null},
        ];
      }
    }

    // ── Planification des dates ──────────────────────────────────────────────
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
