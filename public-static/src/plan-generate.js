function generateAthletePlan(ob){
  const baseKm=parseInt(ob.km_semaine)||20;
  const sessStr=ob.sessions||'3';
  const nbSess=sessStr==='4'?4:parseInt(sessStr)||3;
  const niveau=ob.niveau||'Intermédiaire'; // Débutant / Intermédiaire / Confirmé
  const course=ob.course||'Marathon';
  const isPlaisir=!course||course==='Plaisir';
  const useFrac=course==='5 km'||course==='10 km'; // fractionné pour courtes distances
  // Plafond de volume (pic du plan)
  // Plaisir : cible progressive ambitieuse indépendante du base (ne pas bloquer les débutants)
  // Course : plafond classique × base
  const peakKm=isPlaisir
    // Plaisir 24 sem : pic = 2× la base (vraie progression sur toute la durée)
    // Plancher pour garantir une montée visible ; plafond de sécurité par nb séances
    ? Math.min(Math.max(Math.round(baseKm*(nbSess<=2?1.8:nbSess===3?2.0:2.2)),
                        nbSess<=2?28:nbSess===3?40:52),
               nbSess<=2?45:nbSess===3?60:80)
    : Math.min(baseKm*2, baseKm+40, nbSess<=2?40:nbSess===3?55:999);

  // Affûtage : aucun pour Plaisir, sinon selon la distance
  // noInt : semaines d'affûtage sans intensité (1=1ère sem affûtage, etc.)
  // Marathon S1 affûtage : garde tempo réduit ; S2-S3 : EF seulement
  const taperCfg=isPlaisir?{w:0,r:[],noInt:[]}:({
    'Marathon':      {w:3,r:[0.70,0.50,0.20],noInt:[2,3]},
    'Semi-marathon': {w:2,r:[0.65,0.25],     noInt:[2]},
    '10 km':         {w:2,r:[0.60,0.30],     noInt:[2]},
    '5 km':          {w:1,r:[0.40],          noInt:[1]},
  }[course]||{w:2,r:[0.65,0.25],noInt:[2]});

  // Nombre de semaines
  // Plaisir sans date : 24 semaines — suffisant pour passer de 3-4 km à 20+ km/sem
  let numWeeks=isPlaisir?24:16;
  if(ob.date){
    const diff=Math.floor((new Date(ob.date)-new Date())/(7*24*3600*1000));
    if(diff>0) numWeeks=Math.min(Math.max(diff,8),32);
  }

  // Décharges : pattern 2:1 (toutes les 3 sem) pour très débutants < 10 km, sinon 3:1 (toutes les 4 sem)
  const recovPeriod=baseKm<10?3:4;
  const recovery=new Set();
  for(let w=recovPeriod;w<=numWeeks;w+=recovPeriod) recovery.add(w);

  // Plafond long run selon distance cible (évite sorties trop longues pour courtes distances)
  const longRunCap=isPlaisir?Math.min(Math.max(22,Math.round(baseKm*1.2)),30):({'Marathon':32,'Semi-marathon':21,'10 km':16,'5 km':12}[course]||32);

  // Volume par semaine
  // Ratio de décharge : varie selon le pic précédent (plus le pic est haut, plus la décharge est marquée)
  // Calibré sur le plan admin réel : S8=89%, S12=88%, S16=84%, S20=77%, S30=69%
  // Décharge : toujours -15% (×0.85) quel que soit le volume
  const recovRatio=()=>0.85;

  const weekKms=[];
  if(isPlaisir && nbSess<=2){
    // Plaisir 2 séances : volume STABLE autour de la base — pas de progression cumulée.
    // La richesse vient de la variété des séances, pas du volume.
    // Vague légère : normal → +10% → normal → décharge (cycle 4 sem avec récup à S4/S8/…)
    for(let w=1;w<=numWeeks;w++){
      if(recovery.has(w)){
        weekKms.push(Math.max(Math.round(baseKm*0.85),4));
      } else {
        // +10% la 3ème semaine du cycle pour briser la monotonie sans progresser globalement
        const mult=w%3===0?1.10:1.0;
        weekKms.push(Math.round(baseKm*mult));
      }
    }
  } else {
    // Plan avec progression (Course ou Plaisir 3+ séances)
    let cur=baseKm;
    for(let w=1;w<=numWeeks;w++){
      if(recovery.has(w)){
        const lastBuild=weekKms.filter((_,i)=>!recovery.has(i+1)).slice(-1)[0]||cur;
        const recovKm=Math.max(Math.round(lastBuild*recovRatio()), Math.max(2,Math.round(baseKm*0.85)));
        weekKms.push(recovKm);
      } else {
        let km=Math.round(Math.min(cur,peakKm));
        if(w>1 && recovery.has(w-1)){
          const preRecov=weekKms[w-2]||cur;
          const beforeRecov=weekKms.filter((_,i)=>!recovery.has(i+1)&&i<w-1).slice(-1)[0]||preRecov;
          km=Math.min(km, Math.round(beforeRecov*1.05));
        }
        weekKms.push(km);
        if(cur<peakKm){
          cur=cur<12 ? cur+1.5 : cur*1.07;
        }
      }
    }
  }
  // Affûtage : uniquement pour les plans avec course (Plaisir = pas d'affûtage)
  const peakVol=Math.max(...weekKms.filter(k=>k>0));
  if(taperCfg.r.length>0 && numWeeks>taperCfg.w+4){
    taperCfg.r.forEach((ratio,i)=>{
      weekKms[numWeeks-taperCfg.r.length+i]=Math.max(Math.round(peakVol*ratio),3);
    });
  }
  const taperStartW=taperCfg.w>0?numWeeks-taperCfg.w+1:numWeeks+1; // numWeeks+1 = jamais pour Plaisir

  // ── Calcul des allures ──────────────────────────────────────────────────────
  const fmtPace=sec=>{const m=Math.floor(sec/60);const s=sec%60;return `${m}'${String(s).padStart(2,'0')}`;};

  // 1. EF déclarée (format "5:48" ou "5'48")
  const efRaw=ob.ef_pace||null;
  let efSec=null;
  if(efRaw){const parts=efRaw.replace("'",":").split(':');if(parts.length===2)efSec=parseInt(parts[0])*60+parseInt(parts[1]);}

  // 2. Race pace depuis le temps cible (source principale pour tempo/frac)
  const raceDist={'Marathon':42.195,'Semi-marathon':21.1,'10 km':10,'5 km':5}[course]||42.195;
  let racePaceSec=null;
  if(ob.target_time){
    const tp=ob.target_time.split(':').map(Number);
    const totalSec=tp.length===3?tp[0]*3600+tp[1]*60+tp[2]:tp.length===2?tp[0]*60+tp[1]:0;
    if(totalSec>0) racePaceSec=totalSec/raceDist;
  }

  // Validation physiologique : ignorer les allures hors plage humaine
  if(racePaceSec){
    const paceMin={'Marathon':175,'Semi-marathon':150,'10 km':120,'5 km':100}[course]||150;
    const paceMax={'Marathon':780,'Semi-marathon':720,'10 km':660,'5 km':600}[course]||780;
    if(racePaceSec<paceMin||racePaceSec>paceMax){
      console.warn('[Plan] Allure cible hors plage physiologique, allures non calculées');
      racePaceSec=null;
    }
  }

  // 3. EF effective — déclarée en priorité, sinon dérivée depuis race pace
  let effectiveEfSec=efSec;
  if(!effectiveEfSec&&racePaceSec){
    // EF ≈ race_pace × 1.32–1.40 selon distance et niveau
    const efMult={'Marathon':{Débutant:1.40,Intermédiaire:1.36,Confirmé:1.32},'Semi-marathon':{Débutant:1.38,Intermédiaire:1.34,Confirmé:1.30},'10 km':{Débutant:1.35,Intermédiaire:1.31,Confirmé:1.28},'5 km':{Débutant:1.32,Intermédiaire:1.28,Confirmé:1.25}}[course]||{Débutant:1.38,Intermédiaire:1.34,Confirmé:1.30};
    effectiveEfSec=Math.round(racePaceSec*(efMult[niveau]||1.35));
  }
  const efLabel=effectiveEfSec?fmtPace(effectiveEfSec):null;

  // 4. Tempo (allure seuil lactate) — race pace en priorité, fallback EF
  let tempoPaceSec=null;
  if(racePaceSec){
    // Tempo ≈ race_pace × 0.94–0.97 (allure semi ou seuil pour courtes distances)
    const tempoMult={'Marathon':{Débutant:0.965,Intermédiaire:0.952,Confirmé:0.940},'Semi-marathon':{Débutant:0.960,Intermédiaire:0.945,Confirmé:0.930},'10 km':{Débutant:0.965,Intermédiaire:0.950,Confirmé:0.940},'5 km':{Débutant:0.980,Intermédiaire:0.970,Confirmé:0.960}}[course]||{Débutant:0.965,Intermédiaire:0.952,Confirmé:0.940};
    tempoPaceSec=Math.round(racePaceSec*(tempoMult[niveau]||0.952));
  } else if(effectiveEfSec){
    // Fallback EF-based avec deltas plus larges
    const tDelta=niveau==='Débutant'?-55:niveau==='Confirmé'?-80:-65;
    tempoPaceSec=effectiveEfSec+tDelta;
  }
  // Sanity : tempo doit être plus rapide que EF d'au moins 25s
  if(tempoPaceSec&&effectiveEfSec&&tempoPaceSec>effectiveEfSec-25) tempoPaceSec=effectiveEfSec-30;
  const tempoLbl=tempoPaceSec?fmtPace(tempoPaceSec):null;

  // 5. Fractionné (VO2max / VMA) — race pace en priorité, fallback EF
  let fracPaceSec=null,fracMinPaceSec=null;
  if(racePaceSec){
    // Frac ≈ allure 5km/VMA : race_pace × 0.82–0.94 selon distance
    const fracMult={'Marathon':0.820,'Semi-marathon':0.880,'10 km':0.910,'5 km':0.940}[course]||0.820;
    fracPaceSec=Math.round(racePaceSec*fracMult);
    fracMinPaceSec=Math.round(fracPaceSec*0.965); // borne rapide (+3.5%)
  } else if(effectiveEfSec){
    const fracBaseDelta=course==='5 km'?-100:course==='10 km'?-90:-80;
    fracPaceSec=effectiveEfSec+fracBaseDelta;
    fracMinPaceSec=fracPaceSec-12;
  }
  // Sanity : frac plus rapide que tempo d'au moins 20s
  if(fracPaceSec&&tempoPaceSec&&fracPaceSec>tempoPaceSec-20){fracPaceSec=tempoPaceSec-25;fracMinPaceSec=fracPaceSec-12;}
  const fracLbl=fracPaceSec?fmtPace(fracPaceSec):null;
  const fracMinLbl=fracMinPaceSec?fmtPace(fracMinPaceSec):null;

  // 6. Zones FC depuis FCmax si disponible
  const fcMax=parseInt(ob.fc_max)||0;
  const efFCStr=fcMax?`FC ${Math.round(fcMax*0.70)}-${Math.round(fcMax*0.75)} bpm`:'FC basse, allure confort';
  const tempoFCStr=fcMax?`FC ${Math.round(fcMax*0.80)}-${Math.round(fcMax*0.88)} bpm`:'FC modérée-haute';

  // ── Progression des séances selon semaine, niveau et distance ───────────────
  const tempoProgression=(w)=>{
    // Plaisir : intro basée sur le volume hebdo (km = proxy niveau réel)
    //   baseKm < 20 → 2 semaines EF seul (introW=3)
    //   baseKm ≥ 20 → 1 semaine EF seul  (introW=2)
    // Course : Débutant→S6, Intermédiaire→S3, Confirmé→S2
    const introW=isPlaisir?(baseKm<20?3:2):(niveau==='Débutant'?6:niveau==='Confirmé'?2:3);
    if(w<introW) return null;
    // Phase 3 Plaisir (W17+) : tempo continu sans récupération
    if(isPlaisir && w>=17){
      if(niveau==='Débutant')      return {rep:1,dur:15,recup:'0:00'};
      if(niveau==='Confirmé')      return {rep:1,dur:25,recup:'0:00'};
      return                              {rep:1,dur:20,recup:'0:00'}; // Intermédiaire
    }
    const age=w-introW;
    if(niveau==='Débutant'){
      if(age<2)  return {rep:1,dur:6, recup:'3:00'};
      if(age<4)  return {rep:1,dur:8, recup:'3:00'};
      if(age<6)  return {rep:2,dur:6, recup:'3:00'};
      if(age<8)  return {rep:2,dur:8, recup:'3:00'};
      if(age<12) return {rep:2,dur:10,recup:'3:00'};
      return            {rep:2,dur:12,recup:'3:00'};
    }
    if(niveau==='Confirmé'){
      if(age<2)  return {rep:2,dur:8, recup:'3:00'};
      if(age<4)  return {rep:2,dur:10,recup:'3:00'};
      if(age<6)  return {rep:3,dur:10,recup:'3:00'};
      if(age<10) return {rep:3,dur:12,recup:'3:00'};
      return            {rep:3,dur:15,recup:'3:00'};
    }
    // Intermédiaire
    if(age<2)  return {rep:1,dur:8, recup:'3:00'};
    if(age<4)  return {rep:2,dur:8, recup:'3:00'};
    if(age<6)  return {rep:2,dur:10,recup:'3:00'};
    if(age<10) return {rep:2,dur:12,recup:'3:00'};
    return            {rep:3,dur:12,recup:'3:00'};
  };

  const fracProgression=(w)=>{
    const introW=niveau==='Débutant'?5:niveau==='Confirmé'?2:3;
    if(w<introW) return null;
    const age=w-introW;
    if(course==='5 km'){
      if(niveau==='Débutant'){
        if(age<2)  return {rep:5,dur:1,recup:'1:30'};
        if(age<4)  return {rep:6,dur:1,recup:'1:30'};
        if(age<6)  return {rep:5,dur:2,recup:'2:00'};
        if(age<10) return {rep:6,dur:2,recup:'2:00'};
        return           {rep:5,dur:3,recup:'2:00'};
      }
      if(age<2)  return {rep:6, dur:1,recup:'1:30'};
      if(age<4)  return {rep:8, dur:1,recup:'1:30'};
      if(age<6)  return {rep:6, dur:2,recup:'2:00'};
      if(age<10) return {rep:8, dur:2,recup:'2:00'};
      return            {rep:6, dur:3,recup:'2:00'};
    } else {
      // 10km
      if(niveau==='Débutant'){
        if(age<2)  return {rep:4,dur:2,recup:'2:30'};
        if(age<4)  return {rep:4,dur:3,recup:'2:30'};
        if(age<6)  return {rep:5,dur:3,recup:'2:30'};
        if(age<10) return {rep:4,dur:4,recup:'3:00'};
        return           {rep:4,dur:5,recup:'3:00'};
      }
      if(age<2)  return {rep:4,dur:3,recup:'2:30'};
      if(age<4)  return {rep:5,dur:3,recup:'2:30'};
      if(age<6)  return {rep:6,dur:3,recup:'2:30'};
      if(age<10) return {rep:4,dur:5,recup:'3:00'};
      return            {rep:5,dur:5,recup:'3:00'};
    }
  };

  // Allure semi-marathon (entre tempo et race pace marathon)
  const semiPaceSec=course==='Semi-marathon'&&racePaceSec?racePaceSec:
    racePaceSec?Math.round(racePaceSec*0.955):null;
  const semiLbl=semiPaceSec?fmtPace(semiPaceSec):null;

  // Phase Plaisir courante (mise à jour dans la boucle principale)
  let _plaisirPhase=1;

  // Construit le champ d="Titre|détail" pour chaque type de séance
  const makeD=(type,tempo)=>{
    // ── Descriptions enrichies pour le mode Plaisir ─────────────────────────
    if(isPlaisir){
      if(type==='ef'){
        const cues=["courir à l'aise, pouvoir parler","allure confortable, respiration rythmée","allure fluide, écoute du corps"];
        const cue=cues[_plaisirPhase-1]||cues[0];
        return efLabel?`Sortie EF|${efLabel}/km · ${efFCStr} · ${cue}`:`Sortie EF|${cue}`;
      }
      if(type==='long'){
        if(_plaisirPhase===3) return efLabel?`Sortie longue avancée|${efLabel}/km · terminer 15 min à allure médium`:`Sortie longue avancée|terminer 15 min à allure médium`;
        if(_plaisirPhase===2) return efLabel?`Sortie longue progression|${efLabel}/km · terminer les 10 dernières min légèrement plus vite`:`Sortie longue progression|terminer les 10 dernières min plus vite`;
        return efLabel?`Sortie longue EF|${efLabel}/km · allure confort, plaisir avant tout`:`Sortie longue EF|allure confort, plaisir avant tout`;
      }
      if(type==='fartlek'){
        const cues=['6×(30s vite + 2min jogging)','8×(40s vite + 90s jogging)','8×(45s vite + 90s jogging) + 2 accélérations finales'];
        const cue=cues[_plaisirPhase-1]||cues[0];
        return efLabel?`Fartlek|${efLabel}/km base · ${cue}`:`Fartlek|${cue}`;
      }
      if(type==='tempo'&&tempo){
        const isContinuous=tempo.recup==='0:00';
        const pLbl=tempoLbl?`${tempoLbl}/km · `:'';
        const warmup='3 km EF · ';
        const cooldown=' · EF de fin';
        if(isContinuous){
          const continuousCue=_plaisirPhase===1?'découverte de l\'allure seuil, effort maîtrisé':_plaisirPhase===2?'allure seuil soutenue, sans forcer':'effort soutenu et régulier sans pause';
          return `Tempo ${tempo.rep}×${tempo.dur} min|${warmup}${tempo.rep}×${tempo.dur} min ${pLbl}${tempoFCStr} · ${continuousCue}${cooldown}`;
        }
        const phaseCue=_plaisirPhase===1?'intro au seuil':'travail au seuil';
        return `Tempo ${tempo.rep}×${tempo.dur} min|${warmup}${tempo.rep}×${tempo.dur} min ${pLbl}${phaseCue} · récup ${tempo.recup||'3:00'} min · ${tempoFCStr}${cooldown}`;
      }
    }
    // ── Descriptions standard (Course) ──────────────────────────────────────
    if(type==='ef'){
      return efLabel?`Séance EF|${efLabel}/km · ${efFCStr}`:'Séance EF';
    }
    if(type==='long'){
      return efLabel?`EF longue|${efLabel}/km · allure confort`:'EF longue';
    }
    if(type==='tempo'&&tempo){
      const recupStr=tempo.recup||'3:00';
      // Semi : séances à allure semi-marathon au lieu du seuil pur
      const pLbl=course==='Semi-marathon'&&semiLbl?semiLbl:tempoLbl;
      const pDesc=course==='Semi-marathon'?'allure semi':'allure seuil';
      if(pLbl) return `Tempo ${tempo.rep}×${tempo.dur} min|3 km EF · ${tempo.rep}×${tempo.dur} min ${pLbl}/km · ${pDesc} · récup ${recupStr} min · ${tempoFCStr} · EF de fin`;
      return `Tempo ${tempo.rep}×${tempo.dur} min|3 km EF · ${tempo.rep}×${tempo.dur} min · récup ${recupStr} min · EF de fin`;
    }
    if(type==='frac'&&tempo){
      const recupStr=tempo.recup||'2:00';
      const pDesc=course==='5 km'?'VMA / allure 5km':course==='10 km'?'VO₂max / allure 5-10km':'VO₂max';
      if(fracLbl) return `Fractionné ${tempo.rep}×${tempo.dur} min|${fracMinLbl?fracMinLbl+'–'+fracLbl:fracLbl}/km · ${pDesc} · récup ${recupStr} min${efLabel?' · EF ref '+efLabel+'/km':''}`;
      return `Fractionné ${tempo.rep}×${tempo.dur} min`;
    }
    return type==='ef'?'Séance EF':type==='long'?'EF longue':'Séance';
  };

  // Réduit le tempo/frac pour les semaines de décharge (-1 rep ou -2 min, min 1 rep / 5 min)
  const reduceIntensity=(prog)=>{
    if(!prog) return null;
    return {rep:Math.max(1,prog.rep-1),dur:Math.max(5,prog.dur-2),recup:prog.recup};
  };

  // Label "allure spécifique marathon" pour les sorties longues avancées
  const makeSpecificMarathon=(km)=>{
    const racePaceLbl=racePaceSec?fmtPace(Math.round(racePaceSec)):null;
    if(!racePaceLbl||!efLabel) return `EF longue|${efLabel?efLabel+'/km · ':''}allure confort`;
    return `Sortie longue spécifique|${efLabel}/km (début) · fin ${km>=25?'8':'5'} km à ${racePaceLbl}/km (allure marathon)`;
  };

  const updates={};
  for(let w=1;w<=numWeeks;w++){
    const total=weekKms[w-1];
    if(isPlaisir) _plaisirPhase=w<=8?1:w<=16?2:3;
    const isRecoveryWeek=recovery.has(w);
    const isRaceWeek=w===numWeeks&&!!ob.date;
    const weekInTaper=w>=taperStartW?w-taperStartW+1:0;
    const noIntensity=taperCfg.noInt.includes(weekInTaper)||isRaceWeek;
    // Progression intensity brute, puis réduite si semaine de décharge
    const tempoFull=useFrac ? fracProgression(w) : tempoProgression(w);
    const tempo=isRecoveryWeek ? reduceIntensity(tempoFull) : tempoFull;
    const sessionType=useFrac?'frac':'tempo';
    // hasTempo : les semaines de décharge gardent le tempo (réduit)
    // Le démarrage du tempo est contrôlé par introW dans tempoProgression
    const hasTempo=!!tempo && nbSess>=3 && !noIntensity;

    // Sortie longue spécifique marathon : activer à partir du 2ème tiers du plan
    // hors affûtage, hors décharge, niveaux Intermédiaire/Confirmé
    const useSpecificLong = course==='Marathon' && !isRecoveryWeek && weekInTaper===0
      && w >= Math.ceil(numWeeks*0.55) && niveau!=='Débutant';

    let sessions=[];
    const sFloor=total<10?2:3;

    // Helper : km de la longue plafonné et ajusté
    const longKm=(base)=>Math.min(Math.max(base,sFloor),longRunCap);

    if(nbSess<=2){
      if(nbSess===1){
        sessions=[{d:makeD('ef'),km:total,type:'ef',shoe:null}];
      } else {
        // La longue toujours plus longue que la séance courte
        const kL=longKm(Math.max(Math.round(total*0.55),sFloor));
        const kEF=Math.max(total-kL,sFloor);
        const dL=useSpecificLong?makeSpecificMarathon(kL):makeD('long');

        // Plaisir 2 séances : tempo progressif dès S3 — ZÉRO fartlek
        // Programme explicite 24 semaines :
        //   W3: 1×5min continu, W6: 1×8min, W9: 1×10min, W15: 1×12min
        //   W18: 2×8min (récup 3:00), W21: 2×10min (récup 3:00)
        // Récup et toutes les autres semaines → EF
        const plaisirTempo2={
          3:{rep:1,dur:5,recup:'0:00'},
          6:{rep:1,dur:8,recup:'0:00'},
          9:{rep:1,dur:10,recup:'0:00'},
          15:{rep:1,dur:12,recup:'0:00'},
          18:{rep:2,dur:8,recup:'3:00'},
          21:{rep:2,dur:10,recup:'3:00'}
        };
        const t2=isPlaisir && !isRecoveryWeek && tempo ? plaisirTempo2[w]||null : null;
        sessions=[
          t2 ? {d:makeD('tempo',t2),km:kEF,type:'tempo',shoe:null}
             : {d:makeD('ef'),km:kEF,type:'ef',shoe:null},
          {d:dL,km:kL,type:'long',shoe:null},
        ];
      }
    } else if(nbSess===3){
      if(hasTempo){
        const kEF=Math.max(Math.round(total*0.30),sFloor);
        const kT =Math.max(Math.round(total*0.27),sFloor);
        const kL =longKm(total-kEF-kT);
        const dL=useSpecificLong?makeSpecificMarathon(kL):makeD('long');
        sessions=[
          {d:makeD('ef'),km:kEF,type:'ef',shoe:null},
          {d:makeD(sessionType,tempo),km:kT,type:sessionType,shoe:null},
          {d:dL,km:kL,type:'long',shoe:null},
        ];
      } else {
        const k1=Math.max(Math.round(total*0.30),sFloor);
        const k2=Math.max(Math.round(total*0.25),sFloor);
        const kL=longKm(total-k1-k2);
        const dL=useSpecificLong?makeSpecificMarathon(kL):makeD('long');
        sessions=[
          {d:makeD('ef'),km:k1,type:'ef',shoe:null},
          {d:makeD('ef'),km:k2,type:'ef',shoe:null},
          {d:dL,km:kL,type:'long',shoe:null},
        ];
      }
    } else {
      // 4 séances
      if(hasTempo){
        if(isPlaisir && _plaisirPhase>=2){
          // Phase 2-3 Plaisir : EF + fartlek + tempo + longue (plus de variété)
          const kEF =Math.max(Math.round(total*0.18),sFloor);
          const kFar=Math.max(Math.round(total*0.20),sFloor);
          const kT  =Math.max(Math.round(total*0.22),sFloor);
          const kL  =longKm(total-kEF-kFar-kT);
          sessions=[
            {d:makeD('ef'),km:kEF,type:'ef',shoe:null},
            {d:makeD('fartlek'),km:kFar,type:'ef',shoe:null},
            {d:makeD(sessionType,tempo),km:kT,type:sessionType,shoe:null},
            {d:makeD('long'),km:kL,type:'long',shoe:null},
          ];
        } else {
          const kEF1=Math.max(Math.round(total*0.20),sFloor);
          const kEF2=Math.max(Math.round(total*0.20),sFloor);
          const kT  =Math.max(Math.round(total*0.22),sFloor);
          const kL  =longKm(total-kEF1-kEF2-kT);
          const dL=useSpecificLong?makeSpecificMarathon(kL):makeD('long');
          sessions=[
            {d:makeD('ef'),km:kEF1,type:'ef',shoe:null},
            {d:makeD('ef'),km:kEF2,type:'ef',shoe:null},
            {d:makeD(sessionType,tempo),km:kT,type:sessionType,shoe:null},
            {d:dL,km:kL,type:'long',shoe:null},
          ];
        }
      } else {
        const k1=Math.max(Math.round(total*0.25),sFloor);
        const k2=Math.max(Math.round(total*0.20),sFloor);
        const k3=Math.max(Math.round(total*0.20),sFloor);
        const kL=longKm(total-k1-k2-k3);
        const dL=useSpecificLong?makeSpecificMarathon(kL):makeD('long');
        sessions=[
          {d:makeD('ef'),km:k1,type:'ef',shoe:null},
          {d:makeD('ef'),km:k2,type:'ef',shoe:null},
          {d:makeD('ef'),km:k3,type:'ef',shoe:null},
          {d:dL,km:kL,type:'long',shoe:null},
        ];
      }
    }
    // Semaine de course : EF de préactivation + séance race le jour J
    if(isRaceWeek){
      sessions=[];
      if(nbSess>=2) sessions.push({d:makeD('ef'),km:3,type:'ef',shoe:null});
      const racePaceLbl=racePaceSec?fmtPace(Math.round(racePaceSec)):null;
      sessions.push({
        d:`🏆 ${course}|Jour J${racePaceLbl?' · Objectif '+racePaceLbl+'/km':''}`,
        km:Math.round(raceDist),type:'race',shoe:null,_isRace:true
      });
    }

    // Calculer la date de chaque séance et embarquer sched_day/sched_time dans le JSON
    const runDays=ob.run_days||[];
    const runTimes=ob.run_times||{};
    const sortedDays=[...runDays].sort((a,b)=>a-b);
    const planStart=new Date(); planStart.setHours(0,0,0,0);
    sessions.forEach((s,i)=>{
      if(s._isRace&&ob.date){
        // La course : date exacte du jour J
        const rd=new Date(ob.date+'T00:00:00');
        s.sched_date=ob.date;
        s.sched_day=rd.getDay()===0?7:rd.getDay(); // 1=lun…7=dim
        s.sched_time='09:00';
        delete s._isRace;
      } else {
        const dayOfWeek=sortedDays.length>0?sortedDays[i%sortedDays.length]:i%7; // 0=lun
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

