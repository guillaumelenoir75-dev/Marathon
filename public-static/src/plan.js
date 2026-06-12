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

function togglePwd(inputId, btn){
  const inp=document.getElementById(inputId);
  if(!inp) return;
  const show=inp.type==='password';
  inp.type=show?'text':'password';
  // Swap icon
  const svg=btn.querySelector('svg');
  if(svg) svg.innerHTML=show
    ?'<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
    :'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
}

function _askCurrentPassword(){
  return new Promise(resolve=>{
    const existing=document.getElementById('confirm-pwd-modal');
    if(existing) existing.remove();
    const overlay=document.createElement('div');
    overlay.id='confirm-pwd-modal';
    overlay.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
    overlay.innerHTML=`
    <div style="background:#fff;border-radius:22px;width:100%;max-width:340px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.2);">
      <div style="padding:24px 20px 16px;text-align:center;">
        <div style="font-size:36px;margin-bottom:10px;">🔒</div>
        <p style="font-size:17px;font-weight:800;color:#1a1a1a;margin-bottom:6px;">Confirme ton identité</p>
        <p style="font-size:13px;color:#888;margin-bottom:16px;">Entre ton mot de passe actuel pour valider les modifications.</p>
        <div style="position:relative;">
          <input id="cpwd-input" type="password" autocomplete="current-password" placeholder="Mot de passe actuel"
            style="width:100%;padding:12px 40px 12px 13px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:14px;outline:none;font-family:sans-serif;box-sizing:border-box;">
          <button type="button" onclick="togglePwd('cpwd-input',this)" tabindex="-1"
            style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#888;padding:2px;">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
        <p id="cpwd-err" style="font-size:12px;color:#DC2626;margin:6px 0 0;display:none;"></p>
      </div>
      <div style="display:flex;border-top:1px solid #f0f0f0;">
        <button id="cpwd-cancel" style="flex:1;padding:15px;background:#fff;border:none;border-right:1px solid #f0f0f0;font-size:14px;font-weight:600;color:#666;cursor:pointer;border-radius:0 0 0 22px;">Annuler</button>
        <button id="cpwd-ok" style="flex:1;padding:15px;background:#1B4FD8;border:none;font-size:14px;font-weight:700;color:#fff;cursor:pointer;border-radius:0 0 22px 0;">Valider</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    const input=document.getElementById('cpwd-input');
    setTimeout(()=>input?.focus(),100);
    document.getElementById('cpwd-cancel').onclick=()=>{overlay.remove();resolve(null);};
    const confirm=()=>{
      const v=input?.value||'';
      if(!v){const e=document.getElementById('cpwd-err');if(e){e.textContent='Entre ton mot de passe.';e.style.display='block';}return;}
      overlay.remove();resolve(v);
    };
    document.getElementById('cpwd-ok').onclick=confirm;
    input?.addEventListener('keydown',e=>{if(e.key==='Enter')confirm();});
  });
}

let _infoGender='';
function selectInfoGender(g){
  _infoGender=g;
  ['M','F'].forEach(x=>{
    const b=document.getElementById('info-gender-'+x);
    if(!b) return;
    const sel=x===g;
    b.style.borderColor=sel?'#1B4FD8':'#e0e0e0';
    b.style.background=sel?'#EBF0FF':'#f5f5f5';
    b.style.color=sel?'#1B4FD8':'#666';
  });
}

function openProfileModal(){
  const user=firebase.auth().currentUser;
  const existing=document.getElementById('profile-modal-overlay');
  if(existing) existing.remove();
  const ov=document.createElement('div');
  ov.id='profile-modal-overlay';
  ov.style.cssText='position:fixed;inset:0;z-index:800;background:rgba(0,0,0,0.45);display:flex;align-items:flex-end;justify-content:center;';
  const savedGender=state.gender||(isAdmin()?'M':null);
  _infoGender=savedGender||'';
  const gChip=(g)=>{
    const sel=savedGender===g;
    return `<button type="button" id="info-gender-${g}" onclick="selectInfoGender('${g}')" style="flex:1;padding:11px;border:2px solid ${sel?'#1B4FD8':'#e0e0e0'};border-radius:10px;font-size:13px;font-weight:600;background:${sel?'#EBF0FF':'#f5f5f5'};color:${sel?'#1B4FD8':'#666'};cursor:pointer;">${g==='M'?'🚹 Homme':'🚺 Femme'}</button>`;
  };
  const eyeIcon=`<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const pwdField=(id,label,ac)=>`<div style="position:relative;"><input id="${id}" type="password" autocomplete="${ac}" placeholder="${label}" style="width:100%;padding:11px 40px 11px 13px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:13px;outline:none;font-family:sans-serif;box-sizing:border-box;"><button type="button" onclick="togglePwd('${id}',this)" tabindex="-1" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#888;padding:2px;">${eyeIcon}</button></div>`;

  ov.innerHTML=`
  <div style="background:#f5f7fb;border-radius:24px 24px 0 0;width:100%;max-width:420px;box-sizing:border-box;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;">
    <!-- Handle + titre -->
    <div style="background:#fff;border-radius:24px 24px 0 0;padding:16px 20px 14px;flex-shrink:0;border-bottom:1px solid #f0f0f0;">
      <div style="width:36px;height:4px;border-radius:4px;background:#e0e0e0;margin:0 auto 14px;"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <p style="font-size:17px;font-weight:800;color:#1a1a1a;margin:0;">Mes informations</p>
        <button onclick="document.getElementById('profile-modal-overlay').remove()" style="background:#f5f5f5;border:none;width:32px;height:32px;border-radius:50%;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#666;">×</button>
      </div>
    </div>
    <!-- Body scrollable -->
    <div style="overflow-y:auto;flex:1;padding:16px;display:flex;flex-direction:column;gap:12px;">
      <!-- Profil -->
      <div style="background:#fff;border-radius:14px;padding:16px;border:1px solid #e8e8e8;">
        <p style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 12px;">Profil</p>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <input id="info-prenom" type="text" autocomplete="given-name" placeholder="Prénom"
            value="${(user?.displayName||'').replace(/"/g,'&quot;')}"
            style="width:100%;padding:11px 13px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:14px;outline:none;font-family:sans-serif;box-sizing:border-box;">
          <input id="info-email" type="email" autocomplete="email" placeholder="Adresse e-mail"
            value="${(user?.email||'').replace(/"/g,'&quot;')}"
            style="width:100%;padding:11px 13px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:14px;outline:none;font-family:sans-serif;box-sizing:border-box;">
          <div style="display:flex;gap:8px;">${gChip('M')}${gChip('F')}</div>
          <button onclick="saveProfileInfo()" style="padding:12px;background:#1B4FD8;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;">Enregistrer le profil</button>
          <p id="info-msg" style="font-size:12px;margin:0;display:none;"></p>
        </div>
      </div>
      <!-- Mot de passe -->
      <div style="background:#fff;border-radius:14px;padding:16px;border:1px solid #e8e8e8;">
        <p style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 12px;">Mot de passe</p>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${pwdField('pwd-current','Mot de passe actuel','current-password')}
          ${pwdField('pwd-new','Nouveau mot de passe (min. 6 caractères)','new-password')}
          ${pwdField('pwd-confirm','Confirmer le nouveau mot de passe','new-password')}
          <button onclick="changePassword()" style="padding:12px;background:#1a1a1a;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;">Changer le mot de passe</button>
          <p id="pwd-msg" style="font-size:12px;margin:0;display:none;"></p>
        </div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove();});
}

async function saveProfileInfo(){
  const user=firebase.auth().currentUser;
  const msgEl=document.getElementById('info-msg');
  const prenom=(document.getElementById('info-prenom')?.value||'').trim();
  const email=(document.getElementById('info-email')?.value||'').trim();
  const gender=_infoGender||state.gender||null;
  if(!email){if(msgEl){msgEl.textContent='L\'email est requis.';msgEl.style.color='#e53e3e';msgEl.style.display='block';}return;}
  if(msgEl) msgEl.style.display='none';
  try{
    const pwd=await _askCurrentPassword();
    if(!pwd) return;
    const cred=firebase.auth.EmailAuthProvider.credential(user.email, pwd);
    await user.reauthenticateWithCredential(cred);
    if(prenom!==user.displayName) await user.updateProfile({displayName:prenom||null});
    if(email!==user.email) await user.updateEmail(email);
    if(gender){state.gender=gender;if(dbRef) await dbRef.child('gender').set(gender).catch(()=>{});}
    document.getElementById('profile-modal-overlay')?.remove();
    renderCompteScreen();
  }catch(e){
    if(msgEl){msgEl.textContent='Erreur : '+e.message;msgEl.style.color='#e53e3e';msgEl.style.display='block';}
  }
}

async function changePassword(){
  const current=(document.getElementById('pwd-current')?.value||'').trim();
  const nw=(document.getElementById('pwd-new')?.value||'').trim();
  const conf=(document.getElementById('pwd-confirm')?.value||'').trim();
  const msg=document.getElementById('pwd-msg');
  const show=(txt,ok)=>{if(msg){msg.textContent=txt;msg.style.color=ok?'#2d7d46':'#e53e3e';msg.style.display='block';}};
  if(!current||!nw||!conf){show('Remplis tous les champs.',false);return;}
  if(nw.length<6){show('Le mot de passe doit faire au moins 6 caractères.',false);return;}
  if(nw!==conf){show('Les mots de passe ne correspondent pas.',false);return;}
  try{
    const user=firebase.auth().currentUser;
    const cred=firebase.auth.EmailAuthProvider.credential(user.email,current);
    await user.reauthenticateWithCredential(cred);
    await user.updatePassword(nw);
    document.getElementById('pwd-current').value='';
    document.getElementById('pwd-new').value='';
    document.getElementById('pwd-confirm').value='';
    show('✅ Mot de passe modifié !',true);
    setTimeout(()=>document.getElementById('profile-modal-overlay')?.remove(),1500);
  }catch(e){
    const msg2=e.code==='auth/wrong-password'?'Mot de passe actuel incorrect.'
      :e.code==='auth/too-many-requests'?'Trop de tentatives. Réessaie plus tard.'
      :'Erreur : '+e.message;
    show(msg2,false);
  }
}

let _adminSavedState=null, _adminSavedDbRef=null;
let _adminPreviewUid=null, _adminPreviewName=null;

function _refreshAthleteCoachView(){
  const body=document.getElementById('coach-view-body');
  if(!body) return;
  body.innerHTML='';
  renderAthletePlan(body);
}

function closeAthleteCoachView(){
  const ov=document.getElementById('coach-view-overlay');
  if(ov) ov.style.display='none';
  if(_adminSavedState!==null){ state=_adminSavedState; _adminSavedState=null; }
  if(_adminSavedDbRef!==null){ dbRef=_adminSavedDbRef; _adminSavedDbRef=null; }
  _adminPreviewUid=null;
}

async function openAthleteCoachView(uid, name){
  let ov=document.getElementById('coach-view-overlay');
  if(!ov){
    ov=document.createElement('div');
    ov.id='coach-view-overlay';
    ov.style.cssText='position:fixed;top:0;left:50%;transform:translateX(-50%);width:100%;max-width:390px;height:100%;z-index:400;background:#EDF2FB;display:flex;flex-direction:column;overflow:hidden;';
    document.getElementById('app').appendChild(ov);
  }
  ov.style.display='flex';
  ov.innerHTML=`
    <div style="background:#0C447C;padding:16px 20px;padding-top:calc(16px + env(safe-area-inset-top,0px));color:#fff;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
      <div>
        <div style="font-size:16px;font-weight:700;">${name}</div>
        <div style="font-size:12px;opacity:0.7;">Vue plan</div>
      </div>
      <button onclick="closeAthleteCoachView()" style="background:rgba(255,255,255,0.15);border:none;border-radius:50%;width:34px;height:34px;color:#fff;font-size:18px;cursor:pointer;flex-shrink:0;">✕</button>
    </div>
    <div id="coach-view-body" style="flex:1;overflow-y:auto;padding:16px;">
      <p style="text-align:center;color:#888;padding:40px 0;">Chargement…</p>
    </div>`;

  try {
    const token=await getAuthToken();
    const resp=await fetch(FUNCTIONS_BASE+'/dbAdmin',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({action:'read',path:`users/${uid}`})
    });
    const json=await resp.json();
    if(!resp.ok) throw new Error(`Erreur serveur ${resp.status}: ${json.error||'inconnue'}`);
    const data=json.data;
    const athleteState=(data||{}).state||{};
    // Sauvegarder et remplacer state + dbRef pour que save() écrive chez l'athlète
    _adminSavedState=state;
    _adminSavedDbRef=dbRef;
    _adminPreviewUid=uid;
    _adminPreviewName=name;
    state=athleteState;
    dbRef=firebase.database().ref('users/'+uid+'/state');
    _refreshAthleteCoachView();
  } catch(e){
    document.getElementById('coach-view-body').innerHTML=`<p style="color:#e53e3e;padding:20px;">Erreur : ${e.message}</p>`;
  }
}

// Contexte courant de la vue coach (pour les actions d'édition)
let _cvUid=null, _cvState=null, _cvName=null;

function renderAthleteCoachView(userData, uid, name){
  _cvUid=uid; _cvName=name; _cvState=userData.state||{};
  const body=document.getElementById('coach-view-body');
  if(!body) return;
  const ob=_cvState.onboarding||{};

  // Profil
  const kmLabel={10:'< 15 km',20:'15–25 km',30:'25–35 km',40:'> 35 km'};
  const kmDisplay = v => kmLabel[v] || (v && !isNaN(v) ? v+' km' : v || '—');
  let html=`<div style="background:#fff;border-radius:14px;padding:16px;margin-bottom:16px;border:1px solid #e0e8f5;">
    <p style="font-size:13px;font-weight:700;color:#0C447C;margin:0 0 12px;">Profil</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">
      <div><span style="color:#888;">Course</span><br><b>${ob.course||'—'}</b></div>
      <div><span style="color:#888;">Date course</span><br><b>${ob.date?new Date(ob.date).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'}):'—'}</b></div>
      <div><span style="color:#888;">Séances/sem</span><br><b>${ob.sessions||'—'}</b></div>
      <div><span style="color:#888;">Niveau</span><br><b>${ob.niveau||'—'}</b></div>
      <div><span style="color:#888;">Km actuels</span><br><b>${kmDisplay(ob.km_semaine)}</b></div>
      <div><span style="color:#888;">Plan généré</span><br><b>${ob.generate_plan==='oui'?'✅ Oui':'Non'}</b></div>
    </div>
  </div>`;

  // Construire le plan depuis extra_w{ws}_s{ei}
  const weekData={};
  Object.keys(_cvState).forEach(k=>{
    const m=k.match(/^extra_w(\d+)_s(\d+)$/);
    if(!m) return;
    const w=parseInt(m[1]),si=parseInt(m[2]);
    if(!weekData[w]) weekData[w]={sessions:[],kmPlan:0,done:0,kmDone:0};
    try{
      const s=JSON.parse(_cvState[k]);
      const done=!!_cvState[`extra_w${w}_s${si}_done`];
      const kmDone=parseFloat(_cvState[`extra_w${w}_s${si}_km`]||0)||0;
      const perf=_cvState[`extra_w${w}_s${si}_perf`]?JSON.parse(_cvState[`extra_w${w}_s${si}_perf`]):{};
      weekData[w].sessions.push({s,si,done,kmDone,perf});
      weekData[w].kmPlan+=parseFloat(s.km)||0;
      if(done){weekData[w].done++;weekData[w].kmDone+=kmDone;}
    }catch(e){}
  });

  const weeks=Object.keys(weekData).map(Number).sort((a,b)=>a-b);
  const typeColor={ef:'#1E4A09',tempo:'#9A2D00',frac:'#7A0000',long:'#2A2070'};
  const typeLabel={ef:'EF',tempo:'Tempo',frac:'Frac',long:'Long'};

  if(weeks.length===0){
    html+=`<div style="background:#fff;border-radius:14px;padding:20px;text-align:center;color:#888;border:1px solid #e0e0e0;margin-bottom:12px;">Aucun plan</div>`;
  } else {
    html+=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <p style="font-size:12px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em;margin:0;">Plan — ${weeks.length} semaines</p>
      <button onclick="cvDeletePlan()" style="background:#fff0f0;border:1px solid #ffcdd2;border-radius:8px;padding:5px 11px;font-size:12px;font-weight:600;color:#c0392b;cursor:pointer;">🗑 Supprimer le plan</button>
    </div>`;
    weeks.forEach(w=>{
      const wd=weekData[w];
      const allDone=wd.done===wd.sessions.length&&wd.sessions.length>0;
      // Sessions triées par si
      const sorted=[...wd.sessions].sort((a,b)=>a.si-b.si);
      html+=`<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:10px;border:1px solid ${allDone?'#c6f0d0':'#e0e0e0'};">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-size:13px;font-weight:700;">Semaine ${w}</span>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:12px;color:${allDone?'#2d7d46':'#888'};">${allDone?'✅':wd.done>0?wd.done+'/'+wd.sessions.length+' ✓':'À faire'} · ${wd.kmPlan} km</span>
            <button onclick="cvAddSession(${w})" style="background:#EBF0FF;border:none;border-radius:8px;padding:4px 8px;font-size:11px;font-weight:700;color:#1B4FD8;cursor:pointer;">+ Séance</button>
          </div>
        </div>
        ${sorted.map(({s,si,done,kmDone,perf})=>{
          const col=typeColor[s.type]||'#333';
          const lbl=typeLabel[s.type]||s.type;
          return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid #f5f5f5;">
            <span style="background:${col}22;color:${col};font-size:10px;font-weight:700;padding:3px 7px;border-radius:6px;flex-shrink:0;">${lbl}</span>
            <span style="flex:1;font-size:13px;">${s.d.split('|')[0]} · <b>${s.km} km</b></span>
            ${done?`<span style="font-size:11px;color:#2d7d46;">✓ ${kmDone}km${perf.pace?' · '+perf.pace:''}</span>`:''}
            <button onclick="cvEditSession(${w},${si})" style="background:#f5f5f5;border:none;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;flex-shrink:0;">✏️</button>
            ${!done?`<button onclick="cvDeleteSession(${w},${si})" style="background:none;border:none;font-size:14px;cursor:pointer;color:#ccc;flex-shrink:0;">✕</button>`:''}
          </div>`;
        }).join('')}
      </div>`;
    });
  }
  // Bouton ajouter semaine
  const nextW=(weeks.length>0?Math.max(...weeks):0)+1;
  html+=`<button onclick="cvAddWeek(${nextW})" style="width:100%;padding:13px;background:#fff;border:1.5px dashed #1B4FD8;border-radius:12px;font-size:13px;font-weight:600;color:#1B4FD8;cursor:pointer;margin-bottom:24px;">+ Ajouter une semaine (S${nextW})</button>`;
  body.innerHTML=html;
}

// ── Suppression du plan athlète ───────────────────────────────────────────────
async function cvDeletePlan(){
  const hasPlan=Object.keys(state).some(k=>/^extra_w\d+_s\d+$/.test(k));
  if(!hasPlan) return;
  await new Promise(resolve=>{
    _showConfirmModal({
      icon:'🗑️',
      title:`Supprimer le plan de ${_adminPreviewName||'cet athlète'} ?`,
      message:'Toutes les séances planifiées seront effacées. Cette action est irréversible.',
      confirmLabel:'Supprimer',
      confirmStyle:'background:#DC2626;color:#fff;',
      onConfirm:resolve,
    });
  });
  const keysToDelete=Object.keys(state).filter(k=>/^extra_w/.test(k)||/^_last_validation_w/.test(k)||k==='plan_start_date');
  keysToDelete.forEach(k=>delete state[k]);
  const updates={};
  keysToDelete.forEach(k=>{ updates[k]=null; });
  await dbRef.update(updates).catch(()=>{});
  _refreshAthleteCoachView();
}

// ── Édition séance coach view ─────────────────────────────────────────────────
function cvEditSession(w, si){
  const key=`extra_w${w}_s${si}`;
  let s={}; try{s=JSON.parse(_cvState[key]||'{}');}catch(e){}
  const parts=(s.d||'').split('|');
  const title=parts[0]||'';
  const detail=parts[1]||'';
  _cvShowSessionModal({w,si,title,detail,km:s.km||0,type:s.type||'ef',isNew:false});
  // Préremplir le champ detail après le rendu
  setTimeout(()=>{const el=document.getElementById('cv-s-detail');if(el)el.value=detail;},50);
}

function cvAddSession(w){
  // Trouver le prochain index libre
  let si=0;
  while(_cvState[`extra_w${w}_s${si}`]) si++;
  _cvShowSessionModal({w,si,title:'',km:0,type:'ef',isNew:true});
}

function cvAddWeek(w){
  // Ouvre le modal en mode "nouvelle semaine" — on peut choisir la semaine et ajouter la 1ère séance
  _cvShowSessionModal({w,si:0,title:'',km:0,type:'ef',isNew:true,newWeek:true});
}

function _cvTypeHeaderStyle(type){
  const cfg={
    ef:{bg:'linear-gradient(135deg,#1E4A09,#2d6b12)',accent:'#3B6D11',icon:'🟢',label:'Endurance Fondamentale'},
    tempo:{bg:'linear-gradient(135deg,#7a1a00,#b83000)',accent:'#E8530A',icon:'🔥',label:'Tempo / Intervalles'},
    frac:{bg:'linear-gradient(145deg,#7A0000,#C4141B,#E03030)',accent:'#C4141B',icon:'⚡',label:'Fractionné'},
    long:{bg:'linear-gradient(135deg,#1a1660,#3a2ea0)',accent:'#534AB7',icon:'💜',label:'Sortie Longue EF'},
    race:{bg:'linear-gradient(135deg,#6b4a00,#b38000)',accent:'#C4960A',icon:'🏁',label:'Course'},
    rest:{bg:'linear-gradient(135deg,#444,#666)',accent:'#888',icon:'😴',label:'Repos'},
  };
  return cfg[type]||cfg.ef;
}

function _cvShowSessionModal({w,si,title,km,type,isNew,newWeek}){
  // Calculer les semaines disponibles pour le sélecteur
  const existingWeeks=new Set();
  Object.keys(_cvState||{}).forEach(k=>{const m=k.match(/^extra_w(\d+)_s\d+$/);if(m)existingWeeks.add(parseInt(m[1]));});
  const nextW=(existingWeeks.size>0?Math.max(...existingWeeks):0)+1;
  const allWeeks=[...Array.from(existingWeeks).sort((a,b)=>a-b),(existingWeeks.has(nextW)?null:nextW)].filter(Boolean);

  let modal=document.getElementById('cv-session-modal');
  if(!modal){
    modal=document.createElement('div');
    modal.id='cv-session-modal';
    modal.style.cssText='position:fixed;inset:0;z-index:900;background:rgba(0,0,0,0.5);display:flex;align-items:flex-end;justify-content:center;';
    document.getElementById('app').appendChild(modal);
  }
  modal.style.display='flex';

  const cfg=_cvTypeHeaderStyle(type||'ef');
  const typeChips=['ef','tempo','frac','long','race'].map(t=>{
    const c=_cvTypeHeaderStyle(t);
    const sel=(type||'ef')===t;
    return `<button type="button" onclick="_cvPickType('${t}')" id="cv-chip-${t}" style="padding:8px 14px;border-radius:20px;font-size:12px;font-weight:700;border:2px solid ${sel?c.accent:'#e0e0e0'};background:${sel?c.accent+'18':'#f5f5f5'};color:${sel?c.accent:'#666'};cursor:pointer;transition:all 0.15s;">${c.icon} ${c.label.split(' ')[0]}</button>`;
  }).join('');

  const weekSelect=isNew?`
    <div style="margin-bottom:16px;">
      <p style="font-size:11px;font-weight:800;color:#666;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Semaine</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">${allWeeks.map(wk=>`<button type="button" onclick="_cvPickWeek(${wk})" id="cv-wk-${wk}" style="padding:7px 13px;border-radius:20px;font-size:13px;font-weight:700;border:2px solid ${wk===w?'#1B4FD8':'#e0e0e0'};background:${wk===w?'#EBF0FF':'#f5f5f5'};color:${wk===w?'#1B4FD8':'#666'};cursor:pointer;">S${wk}</button>`).join('')}</div>
    </div>`:
    `<p style="font-size:12px;color:#888;font-weight:600;margin-bottom:16px;">Semaine ${w}</p>`;

  modal.innerHTML=`
  <div style="background:#fff;border-radius:24px 24px 0 0;width:100%;max-width:420px;box-sizing:border-box;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;">
    <!-- Header coloré -->
    <div id="cv-modal-header" style="background:${cfg.bg};padding:20px 20px 16px;flex-shrink:0;border-radius:24px 24px 0 0;">
      <div style="width:36px;height:4px;border-radius:4px;background:rgba(255,255,255,0.35);margin:0 auto 14px;"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <p style="font-size:10px;font-weight:800;opacity:0.75;letter-spacing:0.1em;text-transform:uppercase;color:#fff;margin-bottom:4px;">${isNew?'Nouvelle séance':'Modifier la séance'}</p>
          <p id="cv-modal-label" style="font-size:20px;font-weight:900;color:#fff;letter-spacing:-0.02em;">${cfg.icon} ${cfg.label}</p>
        </div>
        <button onclick="document.getElementById('cv-session-modal').style.display='none'" style="background:rgba(255,255,255,0.25);border:none;color:#fff;font-size:20px;line-height:1;width:36px;height:36px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>
      </div>
    </div>

    <!-- Body scrollable -->
    <div style="padding:20px;overflow-y:auto;flex:1;">
      ${weekSelect}

      <!-- Type chips -->
      <p style="font-size:11px;font-weight:800;color:#666;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Type de séance</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:18px;">${typeChips}</div>

      <!-- Titre -->
      <p style="font-size:11px;font-weight:800;color:#666;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Titre</p>
      <input id="cv-s-title" placeholder="ex: Séance EF, Tempo 2×8 min…" value="${title.replace(/"/g,'&quot;')}"
        style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #e0e0e0;border-radius:12px;font-size:15px;outline:none;margin-bottom:16px;font-family:inherit;">

      <!-- Structure (detail) -->
      <p style="font-size:11px;font-weight:800;color:#666;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Structure / détail <span style="font-weight:400;text-transform:none;">(optionnel)</span></p>
      <input id="cv-s-detail" placeholder="ex: 5'10 — 5'30/km · 8 EF · 3 AM @ 5'40/km" value=""
        style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #e0e0e0;border-radius:12px;font-size:14px;outline:none;margin-bottom:16px;font-family:inherit;color:#555;">

      <!-- km -->
      <p style="font-size:11px;font-weight:800;color:#666;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Distance (km)</p>
      <input id="cv-s-km" type="number" min="1" max="60" step="0.5" placeholder="0" value="${km||''}"
        style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #e0e0e0;border-radius:12px;font-size:22px;font-weight:700;outline:none;margin-bottom:24px;text-align:center;">

      <!-- Boutons -->
      <div style="display:flex;gap:10px;">
        <button onclick="document.getElementById('cv-session-modal').style.display='none'" style="flex:1;padding:14px;background:#f5f5f5;border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;">Annuler</button>
        <button onclick="cvSaveSession()" style="flex:2;padding:14px;background:#1B4FD8;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;">Enregistrer</button>
      </div>
    </div>
  </div>`;

  // Stocker contexte courant dans le modal
  modal._cvW=w; modal._cvSi=si; modal._cvIsNew=isNew; modal._cvType=type||'ef';
}

function _cvPickType(t){
  const modal=document.getElementById('cv-session-modal');
  if(!modal) return;
  modal._cvType=t;
  ['ef','tempo','frac','long','race'].forEach(x=>{
    const btn=document.getElementById('cv-chip-'+x);
    if(!btn) return;
    const c=_cvTypeHeaderStyle(x);
    const sel=x===t;
    btn.style.borderColor=sel?c.accent:'#e0e0e0';
    btn.style.background=sel?c.accent+'18':'#f5f5f5';
    btn.style.color=sel?c.accent:'#666';
  });
  // Mettre à jour le header
  const cfg=_cvTypeHeaderStyle(t);
  const hdr=document.getElementById('cv-modal-header');
  if(hdr) hdr.style.background=cfg.bg;
  const lbl=document.getElementById('cv-modal-label');
  if(lbl) lbl.textContent=cfg.icon+' '+cfg.label;
}

function _cvPickWeek(wk){
  const modal=document.getElementById('cv-session-modal');
  if(!modal) return;
  const prev=modal._cvW;
  modal._cvW=wk;
  // Recalculer si pour la nouvelle semaine
  let si=0;
  while(_cvState[`extra_w${wk}_s${si}`]) si++;
  modal._cvSi=si;
  // Mettre à jour les boutons
  document.querySelectorAll('[id^="cv-wk-"]').forEach(btn=>{
    const bwk=parseInt(btn.id.replace('cv-wk-',''));
    const sel=bwk===wk;
    btn.style.borderColor=sel?'#1B4FD8':'#e0e0e0';
    btn.style.background=sel?'#EBF0FF':'#f5f5f5';
    btn.style.color=sel?'#1B4FD8':'#666';
  });
}

async function cvSaveSession(){
  const modal=document.getElementById('cv-session-modal');
  const w=modal?._cvW||0;
  const si=modal?._cvSi||0;
  const type=modal?._cvType||'ef';
  const title=(document.getElementById('cv-s-title')?.value||'').trim();
  const detail=(document.getElementById('cv-s-detail')?.value||'').trim();
  const km=parseFloat(document.getElementById('cv-s-km')?.value)||0;
  if(!title||!km){alert('Titre et km obligatoires.');return;}
  const key=`extra_w${w}_s${si}`;
  const fullTitle=detail?`${title}|${detail}`:title;
  const val=JSON.stringify({d:fullTitle,km,type,shoe:null});
  _cvState[key]=val;
  if(modal) modal.style.display='none';
  // Sauvegarder dans Firebase
  try{
    const token=await getAuthToken();
    await fetch(FUNCTIONS_BASE+'/dbAdmin',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({action:'write',path:`users/${_cvUid}/state/${key}`,value:val})});
  }catch(e){alert('Erreur sauvegarde : '+e.message);return;}
  renderAthleteCoachView({state:_cvState},_cvUid,_cvName);
}

async function cvDeleteSession(w, si){
  if(!confirm('Supprimer cette séance ?')) return;
  const key=`extra_w${w}_s${si}`;
  delete _cvState[key];
  // Renuméroter les séances suivantes pour combler le trou
  let i=si+1;
  while(_cvState[`extra_w${w}_s${i}`]){
    _cvState[`extra_w${w}_s${i-1}`]=_cvState[`extra_w${w}_s${i}`];
    delete _cvState[`extra_w${w}_s${i}`];
    i++;
  }
  // Sauvegarder dans Firebase : réécrire tout le state de l'user
  try{
    const token=await getAuthToken();
    await fetch(FUNCTIONS_BASE+'/dbAdmin',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({action:'write',path:`users/${_cvUid}/state`,value:_cvState})});
  }catch(e){alert('Erreur : '+e.message);return;}
  renderAthleteCoachView({state:_cvState},_cvUid,_cvName);
}

function renderAthletePanel(){
  const panel=document.getElementById('athlete-panel');
  if(!panel) return;
  panel.style.display=currentUserRole==='athlete'?'block':'none';
  if(currentUserRole!=='athlete') return;
  const ob=state.onboarding;
  const content=document.getElementById('athlete-profile-content');
  if(!content) return;
  if(!ob){
    content.innerHTML='<p style="color:#888;font-style:italic;">Profil non renseigné.</p>';
    return;
  }
  const kmLabel={10:'< 15 km',20:'15–25 km',30:'25–35 km',40:'> 35 km'};
  const kmDisplay = v => kmLabel[v] || (v && !isNaN(v) ? v+' km' : v || '—');
  const fcMax=state.fc_max||null;
  const fcZone=getFcMaxZone();
  const rows=[
    {label:'Course',value:ob.course||'—'},
    {label:'Date',value:ob.date?new Date(ob.date).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}):'Non définie'},
    {label:'Séances / semaine',value:ob.sessions||'—'},
    {label:'Niveau',value:ob.niveau||'—'},
    {label:'Km actuels / semaine',value:kmDisplay(ob.km_semaine)},
    {label:'Programme généré',value:ob.generate_plan==='oui'?'✅ Oui':ob.generate_plan==='non'?'Non (manuel)':'—'},
  ];
  const fcRow=`<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f0f0f0;">
    <span style="color:#888;">❤️ FC max</span>
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="font-weight:700;color:#1a1a1a;" id="profile-fcmax-display">${fcMax?fcMax+' bpm'+(fcZone?' → zone EF: '+fcZone.min+'–'+fcZone.max+' bpm':''):'Non renseignée'}</span>
      <button onclick="openFcMaxEdit()" style="background:#EBF0FF;border:none;border-radius:8px;padding:3px 8px;font-size:11px;font-weight:600;color:#1B4FD8;cursor:pointer;">Modifier</button>
    </div>
  </div>`;
  const renfoProgOptions=Object.entries(RENFO_PROGRAMS).map(([id,p])=>`<option value="${id}">${p.name}</option>`).join('');
  const renfoSection=`<div style="padding:12px 0;border-bottom:1px solid #f0f0f0;">
    <div style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">💪 Programme renforcement</div>
    <div style="display:flex;flex-direction:column;gap:10px;">
      ${[1,2].map(slot=>`<div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:12px;color:#888;white-space:nowrap;min-width:58px;">Séance ${slot}</span>
        <select id="renfo-prog${slot}-sel" onchange="saveRenfoProg(${slot},this.value)" style="flex:1;padding:8px 10px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:13px;font-weight:600;color:#1a1a1a;background:#fff;cursor:pointer;">
          ${renfoProgOptions}
        </select>
      </div>`).join('')}
    </div>
  </div>`;
  content.innerHTML=rows.map(r=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0;"><span style="color:#888;">${r.label}</span><span style="font-weight:700;color:#1a1a1a;">${r.value}</span></div>`).join('')+fcRow+renfoSection;
  // Restaurer les sélections depuis l'état
  setTimeout(()=>{[1,2].forEach(slot=>{const s=document.getElementById('renfo-prog'+slot+'-sel');if(s)s.value=String(state['renfo_prog'+slot]||slot);});},0);
  // Afficher le bouton supprimer uniquement si un plan existe
  const hasPlan=Object.keys(state).some(k=>/^extra_w\d+_s\d+$/.test(k));
  const delBtn=document.getElementById('btn-delete-plan');
  const genBtn=document.getElementById('btn-generate-plan');
  if(delBtn) delBtn.style.display=hasPlan?'block':'none';
  if(genBtn) genBtn.style.display=hasPlan?'none':'block';
}

function openFcMaxEdit(){
  const cur=state.fc_max||'';
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:500;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML=`<div style="background:#fff;border-radius:20px;padding:24px;width:min(340px,90vw);display:flex;flex-direction:column;gap:16px;">
    <p style="font-size:17px;font-weight:800;margin:0;">Modifier la FC max</p>
    <div>
      <p style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;">FC max connue (bpm)</p>
      <input id="fcmax-edit-val" type="number" min="140" max="220" value="${cur}" placeholder="185" style="width:100%;padding:12px;border:1.5px solid #d0dff5;border-radius:10px;font-size:20px;font-weight:700;text-align:center;box-sizing:border-box;">
    </div>
    <p style="font-size:12px;color:#888;margin:0;">Ou calcul automatique : <b>220 − âge</b></p>
    <div>
      <p style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;">Mon âge</p>
      <input id="fcmax-edit-age" type="number" min="10" max="90" placeholder="35" style="width:100%;padding:12px;border:1.5px solid #d0dff5;border-radius:10px;font-size:20px;font-weight:700;text-align:center;box-sizing:border-box;" oninput="const a=parseInt(this.value);if(a>=10&&a<=90){document.getElementById('fcmax-edit-val').value=220-a;}">
    </div>
    <div style="display:flex;gap:10px;">
      <button onclick="this.closest('div[style]').remove()" style="flex:1;padding:13px;background:#f5f5f5;border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;">Annuler</button>
      <button onclick="saveFcMax(parseInt(document.getElementById('fcmax-edit-val').value));this.closest('div[style]').remove();" style="flex:1;padding:13px;background:#1B4FD8;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;">Enregistrer</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
}

async function saveRenfoProg(slot,progId){
  const id=parseInt(progId)||slot;
  state['renfo_prog'+slot]=id;
  if(dbRef) await dbRef.child('renfo_prog'+slot).set(id).catch(()=>{});
  renderHome(); // synchroniser l'accueil immédiatement
}

async function saveFcMax(fc){
  if(!fc||fc<100||fc>220){alert('Valeur invalide (100–220 bpm).');return;}
  state.fc_max=fc;
  if(dbRef) await dbRef.child('fc_max').set(fc).catch(()=>{});
  renderAthletePanel();
}

async function deleteAthletePlan(){
  const hasPlan=Object.keys(state).some(k=>/^extra_w\d+_s\d+$/.test(k));
  if(!hasPlan) return;
  await new Promise(resolve=>{
    _showConfirmModal({
      icon:'🗑️',
      title:'Supprimer le plan ?',
      message:'Toutes les séances planifiées seront effacées. Cette action est irréversible.',
      confirmLabel:'Supprimer',
      confirmStyle:'background:#DC2626;color:#fff;',
      onConfirm:resolve,
    });
  });
  // Toutes les clés liées au plan
  const planKeyPatterns=[
    k=>/^extra_w/.test(k),               // séances, done, km, perf
    k=>/^_last_validation_w/.test(k),     // timestamps de validation
    k=>k==='plan_start_date',             // date de début du plan
  ];
  const keysToDelete=Object.keys(state).filter(k=>planKeyPatterns.some(fn=>fn(k)));
  keysToDelete.forEach(k=>delete state[k]);
  if(dbRef){
    const updates={};
    keysToDelete.forEach(k=>{ updates[k]=null; });
    await dbRef.update(updates).catch(()=>{});
  }
  rendered.plan=false;
  renderAthletePanel();
  renderPlan();
  renderHome();
}

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

function buildMarathonPrediction() {
  // Pour les athlètes sans données : retourner vide
  if(!isAdmin()){
    // Vérifier s'ils ont des séances validées avec perf
    let hasData=false;
    for(let ws=1;ws<=52;ws++){let ei=0;while(state[`extra_w${ws}_s${ei}`]){if(state[`extra_w${ws}_s${ei}_perf`]){hasData=true;break;}ei++;}if(hasData)break;}
    if(!hasData) return {tempsStr:null,amPaceRecoStr:null,confiance:0};
  }
  const vo2max = getVo2max();
  const vdotPaceSec = vdotMarathonPaceSec(vo2max);
  const fmtTime = s => { const hh=Math.floor(s/3600),mm=Math.floor((s%3600)/60); return `${hh}h${String(mm).padStart(2,'0')}`; };

  // ── Collecter toutes les séances validées ──
  const efPts = [], longPts = [], tempoPts = [];
  for(let ws = 1; ws <= CW; ws++) {
    if(ws === 22 || ws === 23) continue;
    weeks[ws-1].sessions.forEach((s, si) => {
      const k = gk(ws, si);
      if(!state[k+'done']) return;
      const perf = state[k+'perf'] ? JSON.parse(state[k+'perf']) : {};
      if(!perf.pace || !perf.hr) return;
      const fc = parseInt(perf.hr);
      const paceSec = paceStrToSec(perf.pace);
      if(!paceSec || fc < 100) return;
      const cadence = perf.strava ? (perf.strava.cadence || perf.strava.cadence_moy || null) : null;
      const km = parseFloat(state[k+'km'] || s.km) || s.km;
      const entry = { ws, paceSec, fc, km, cadence, type: s.type };
      if(s.type === 'ef' && fc <= 152) { efPts.push(entry); }
      else if(s.type === 'long' && fc <= 158) { longPts.push(entry); }
      else if(s.type === 'tempo' || s.type === 'frac') {
        const blocs = perf.blocsAllure ? perf.blocsAllure.filter(Boolean) : [];
        if(blocs.length > 0) { blocs.forEach(b => { const bSec = paceStrToSec(b); if(bSec) tempoPts.push({...entry, paceSec: bSec}); }); }
      }
    });
    // Séances extra
    let ei=0;
    while(state[`extra_w${ws}_s${ei}`]){
      if(state[`extra_w${ws}_s${ei}_done`]){
        const es=JSON.parse(state[`extra_w${ws}_s${ei}`]);
        const perf=state[`extra_w${ws}_s${ei}_perf`]?JSON.parse(state[`extra_w${ws}_s${ei}_perf`]):{};
        if(perf.pace&&perf.hr){
          const fc=parseInt(perf.hr);
          const paceSec=paceStrToSec(perf.pace);
          if(paceSec&&fc>=100){
            const km=parseFloat(state[`extra_w${ws}_s${ei}_km`]||es.km)||es.km;
            const entry={ws,paceSec,fc,km,cadence:null,type:es.type};
            if(es.type==='ef'&&fc<=152) efPts.push(entry);
            else if(es.type==='long'&&fc<=158) longPts.push(entry);
            else if(es.type==='tempo'||es.type==='frac'){
              const blocs=perf.blocsAllure?perf.blocsAllure.filter(Boolean):[];
              if(blocs.length>0) blocs.forEach(b=>{const bSec=paceStrToSec(b);if(bSec)tempoPts.push({...entry,paceSec:bSec});});
            }
          }
        }
      }
      ei++;
    }
  }

  const nbTotal = efPts.length + longPts.length + tempoPts.length;

  if(efPts.length === 0 && tempoPts.length === 0) {
    const total = Math.round(vdotPaceSec * 1.05 * 42.195);
    return { tempsSec:total, tempsStr:fmtTime(total), methode:'vdot_pur', confiance:10,
      nbSeances:0, tendanceSec:null, intervalMin:total-1200, intervalMax:total+1200,
      intervalMinStr:fmtTime(total-1200), intervalMaxStr:fmtTime(total+1200),
      historique:[], sub4hEcartSec:total-14400, vo2max,
      details:{vdotPurLabel:fmtTime(Math.round(vdotPaceSec*42.195)),vdotPurSec:Math.round(vdotPaceSec*42.195),
        slopeLabel:'—',nbEf:0,nbLong:0,nbTempo:0,amFromEf:null,amFromLong:null,amFromTempo:null,
        bestEfPace:null,bestLongPace:null,bestTempoPace:null,avgCadence:null}};
  }

  // ── Tendance EF (slope) — exclure S1-S3 démarrage ──
  const slopePts = efPts.filter(p=>p.fc<=148 && p.ws>=4);
  let slope = 0;
  if(slopePts.length >= 3) {
    const n=slopePts.length, sX=slopePts.reduce((a,p)=>a+p.ws,0), sY=slopePts.reduce((a,p)=>a+p.paceSec,0);
    const sXY=slopePts.reduce((a,p)=>a+p.ws*p.paceSec,0), sX2=slopePts.reduce((a,p)=>a+p.ws*p.ws,0);
    slope = (n*sXY-sX*sY)/(n*sX2-sX*sX);
  }

  // ── SIGNAL 1 : EF — ratio empirique calibré ──
  // Ratio empirique : allure marathon ≈ allure EF normalisée × 0.935
  // (coureurs intermédiaires courent l'EF ~7% plus lentement que leur allure marathon)
  // Plus fiable que le ratio VDOT théorique qui suppose une course à intensité maximale
  let amFromEf = null, bestEfPaceSec = null, efHistory = [];
  if(efPts.length >= 1) {
    const FCref = 143;
    const last3Ef = efPts.slice(-3);
    const efWeights = last3Ef.map((p,i) => i+1);
    const efTotalW = efWeights.reduce((a,b)=>a+b,0);
    const normPaces = last3Ef.map(p => p.paceSec * Math.pow(p.fc/FCref, 0.5));
    const weightedNormPace = normPaces.reduce((a,p,i)=>a+p*efWeights[i],0)/efTotalW;
    bestEfPaceSec = weightedNormPace;
    // Ratio empirique 0.965 : calibré sur niveau S10 actuel
    // (marathon ≈ EF normalisée × 0.965 pour coureur 4h en phase de prépa)
    // Monte vers 0.95 avec l'endurance spécifique (longues > 20km, S18+)
    const efRatioBase = Math.max(0.945, 0.965 - (Math.max(0, efPts.length - 8) * 0.002));
    amFromEf = weightedNormPace * efRatioBase;
    efHistory = last3Ef.map((p,i) => ({
      ws: p.ws, pace: p.paceSec, fc: p.fc,
      normPace: Math.round(normPaces[i]),
      rawPaceStr: `${Math.floor(p.paceSec/60)}'${String(Math.round(p.paceSec%60)).padStart(2,'0')}`,
      amPred: Math.round(normPaces[i] * efRatioBase * 42.195)
    }));
  }

  // ── SIGNAL 2 : TEMPO — 3 dernières séances tempo, pondération croissante ──
  let amFromTempo = null, bestTempoPaceSec = null, tempoHistory = [];
  if(tempoPts.length >= 2) {
    // Regrouper les blocs par séance (ws) et faire la moyenne par séance
    const byWs = {};
    tempoPts.forEach(p => {
      if(!byWs[p.ws]) byWs[p.ws] = [];
      byWs[p.ws].push(p.paceSec);
    });
    const tempoSessions = Object.entries(byWs)
      .sort((a,b)=>parseInt(a[0])-parseInt(b[0]))
      .map(([ws, paces]) => ({
        ws: parseInt(ws),
        avgPace: Math.round(paces.reduce((a,b)=>a+b,0)/paces.length),
        blocs: paces.length,
        bestPace: Math.min(...paces)
      }));
    const last3Tempo = tempoSessions.slice(-3); // 3 dernières séances tempo
    if(last3Tempo.length >= 1) {
      // Pondération croissante : plus récent = plus de poids
      const tWeights = last3Tempo.map((s,i) => i+1);
      const tTotalW = tWeights.reduce((a,b)=>a+b,0);
      // Moyenne pondérée des moyennes de séance
      const weightedPace = last3Tempo.reduce((a,s,i)=>a+s.avgPace*tWeights[i],0)/tTotalW;
      bestTempoPaceSec = weightedPace;
      amFromTempo = bestTempoPaceSec * 1.17;
      // Historique individuel
      tempoHistory = last3Tempo.map(s => ({
        ws: s.ws, avgPace: s.avgPace, blocs: s.blocs,
        avgPaceStr: `${Math.floor(s.avgPace/60)}'${String(Math.round(s.avgPace%60)).padStart(2,'0')}`,
        amPred: Math.round(s.avgPace * 1.17 * 42.195)
      }));
    }
  }

  // ── SIGNAL 3 : LONG — Riegel, pondération dynamique selon distance ──
  let amFromLong = null, bestLongPaceSec = null, longHistory = [];
  if(longPts.length >= 1) {
    const recentLong = longPts.slice(-3); // 3 dernières longues
    const FCrefL = 145;
    const maxKm = Math.max(...recentLong.map(p=>p.km));
    const dynWeight = Math.min(3.0, Math.max(0.2, (maxKm-10)/5));
    if(dynWeight > 0 || recentLong.length > 0) {
      // Pondération croissante : plus récent = plus de poids
      const lWeights = recentLong.map((p,i)=>i+1);
      const lTotalW = lWeights.reduce((a,b)=>a+b,0);
      const riegelPaces = recentLong.map(p => {
        const normPace = p.paceSec * Math.pow(p.fc/FCrefL, 0.5);
        return normPace * Math.pow(42.195/p.km, 0.06);
      });
      const weightedRiegel = riegelPaces.reduce((a,v,i)=>a+v*lWeights[i],0)/lTotalW;
      amFromLong = weightedRiegel;
      bestLongPaceSec = Math.min(...recentLong.map(p=>p.paceSec));
      // Historique individuel
      longHistory = recentLong.map((p,i) => ({
        ws: p.ws, pace: p.paceSec, fc: p.fc, km: p.km,
        paceStr: `${Math.floor(p.paceSec/60)}'${String(Math.round(p.paceSec%60)).padStart(2,'0')}`,
        riegelAm: Math.round(riegelPaces[i]*42.195)
      }));
    }
  }

  // ── Fusion pondérée — poids dynamiques ──
  const signals = [];
  // EF toujours présent si données dispo
  if(amFromEf !== null) signals.push({ key:'ef', val:amFromEf, weight:2.5 });

  // Tempo : signal principal si blocs disponibles
  if(amFromTempo !== null) signals.push({ key:'tempo', val:amFromTempo, weight:3.0 });

  // Long : poids dynamique selon distance max des longues
  if(amFromLong !== null && longPts.length >= 1) {
    const maxKm = Math.max(...longPts.slice(-4).map(p=>p.km));
    const dynWeight = Math.min(3.0, Math.max(0.2, (maxKm-10)/5)); // 0.2 à 10km, 3.0 à 25km
    signals.push({ key:'long', val:amFromLong, weight:dynWeight });
  }

  if(signals.length === 0) {
    const total = Math.round(vdotPaceSec*42.195);
    return { tempsSec:total, tempsStr:fmtTime(total), methode:'vdot_pur', confiance:15,
      nbSeances:0, tendanceSec:null, intervalMin:total-900, intervalMax:total+900,
      intervalMinStr:fmtTime(total-900), intervalMaxStr:fmtTime(total+900),
      historique:[], sub4hEcartSec:total-14400, vo2max,
      details:{vdotPurLabel:fmtTime(Math.round(vdotPaceSec*42.195)),vdotPurSec:Math.round(vdotPaceSec*42.195),
        slopeLabel:'—',nbEf:0,nbLong:0,nbTempo:0,amFromEf:null,amFromLong:null,amFromTempo:null,
        bestEfPace:null,bestLongPace:null,bestTempoPace:null,avgCadence:null}};
  }

  const totalWeight = signals.reduce((a,s)=>a+s.weight,0);
  let amSecFused = signals.reduce((a,s)=>a+s.val*s.weight,0)/totalWeight;

  // ── Corrections ──
  // Cadence — pénalité réduite à 50%
  const allCadences = [...efPts,...longPts].filter(p=>p.cadence).map(p=>p.cadence);
  const avgCadence = allCadences.length>0 ? Math.round(allCadences.reduce((a,b)=>a+b,0)/allCadences.length) : null;
  if(avgCadence) amSecFused += Math.max(0,(180-avgCadence)/8); // /8 au lieu de /4 = 50%

  // ── Dérive cardiaque sur longues (cardiac drift) ──
  // FC début (1er tiers) vs FC fin (dernier tiers) — 3 dernières longues uniquement
  let cardiacDrift = null, driftPenaltySec = 0, driftHistory = [];
  const longWithSplits = longPts.filter(p => {
    const si = weeks[p.ws-1].sessions.findIndex(s=>s.type==='long');
    if(si<0) return false;
    const k = gk(p.ws, si);
    const perf = state[k+'perf'] ? JSON.parse(state[k+'perf']) : {};
    return perf.strava && perf.strava.splits && perf.strava.splits.length >= 6; // min 6km pour avoir 4 après skip
  });
  if(longWithSplits.length > 0) {
    const drifts = [];
    longWithSplits.slice(-3).forEach(p => {
      const si = weeks[p.ws-1].sessions.findIndex(s=>s.type==='long');
      if(si<0) return;
      const k = gk(p.ws, si);
      const perf = state[k+'perf'] ? JSON.parse(state[k+'perf']) : {};
      const allSplits = (perf.strava.splits||[]).filter(sp=>sp.fc&&sp.fc>0);
      if(allSplits.length < 6) return;
      // Ignorer les 2 premiers km (échauffement cardiaque — FC encore en montée)
      const stable = allSplits.slice(2);
      const half = Math.floor(stable.length/2);
      const fcMid = stable.slice(0,half).reduce((a,s)=>a+s.fc,0)/half;
      const fcEnd = stable.slice(half).reduce((a,s)=>a+s.fc,0)/stable.slice(half).length;
      const drift = (fcEnd-fcMid)/fcMid*100;
      drifts.push({
        ws: p.ws, drift: Math.round(drift*10)/10, km: p.km,
        fcStart: Math.round(fcMid), fcEnd: Math.round(fcEnd),
        note: `km3-${2+half} vs km${3+half}-${allSplits.length}`
      });
    });
    driftHistory = drifts;
    if(drifts.length > 0) {
      const weights = drifts.map((d,i)=>i+1);
      const totalW = weights.reduce((a,b)=>a+b,0);
      cardiacDrift = Math.round(drifts.reduce((a,d,i)=>a+d.drift*weights[i],0)/totalW*10)/10;
      // Seuils révisés (mesure milieu→fin, sans échauffement) :
      // < 3% : parfait → bonus -4 min
      // 3-5% : excellent → bonus -2 min
      // 5-8% : bon → neutre
      // 8-12% : moyen → pénalité +2 min
      // > 12% : élevé → pénalité +4 min
      if(cardiacDrift < 3) driftPenaltySec = -240;
      else if(cardiacDrift < 5) driftPenaltySec = -120;
      else if(cardiacDrift < 8) driftPenaltySec = 0;
      else if(cardiacDrift < 12) driftPenaltySec = 120;
      else driftPenaltySec = 240;
      amSecFused += driftPenaltySec / 42.195;
    }
  }

  // Progression (slope négatif = s'améliore) — plafonné à 4 sec/km max
  if(slope < -0.5 && slopePts.length >= 4) {
    amSecFused -= Math.min(Math.abs(slope)*(32-CW)*0.2, 4);
  }

  const amSecPred = Math.round(amSecFused);
  const totalSecBase = Math.round(amSecPred*42.195);

  // Moyenne avec l'estimation par record 10km (si disponible)
  const r10pred = getRecord10kmPredictions();
  const totalSecR10 = r10pred ? r10pred.marSec : null;
  const totalSec = totalSecR10
    ? Math.round((totalSecBase + totalSecR10) / 2)
    : totalSecBase;
  const tempsStr = fmtTime(totalSec);

  // Intervalle de confiance
  const allVals = signals.map(s=>s.val);
  const spread = allVals.length>1 ? Math.max(...allVals)-Math.min(...allVals) : 120;
  const intervalTot = Math.round(Math.min(12, Math.max(2, spread*0.35))*42.195);
  const iMin=totalSec-intervalTot, iMax=totalSec+intervalTot;

  // Confiance : monte avec nb séances, semaines avancées, convergence signaux
  const convergence = spread < 30 ? 20 : spread < 60 ? 10 : 0;
  const confiance = Math.min(88, Math.round(
    (nbTotal/25)*30 + (CW/32)*25 + convergence + (signals.length>=2?10:0) + (vo2max>0?5:0)
  ));

  // Historique semaine par semaine
  const historique = [];
  for(let ws=4; ws<=CW; ws++) {
    const ePts=efPts.filter(p=>p.ws<=ws), lPts=longPts.filter(p=>p.ws<=ws), tPts=tempoPts.filter(p=>p.ws<=ws);
    const sig=[];
    if(ePts.length>=1){
      const FCr=143, normB=Math.min(...ePts.slice(-3).map(p=>p.paceSec*Math.pow(p.fc/FCr,0.5)));
      const vEf=vdotPaceSec*(1/0.79)*0.75;
      sig.push({val:vdotPaceSec/(vEf/normB),weight:2.5});
    }
    if(tPts.length>=2){
      const srt=[...tPts].sort((a,b)=>a.paceSec-b.paceSec);
      const med=srt.slice(0,Math.min(3,srt.length)).reduce((a,p)=>a+p.paceSec,0)/Math.min(3,srt.length);
      sig.push({val:med*1.17,weight:3.0});
    }
    if(lPts.length>=1){
      const mxK=Math.max(...lPts.slice(-2).map(p=>p.km));
      const dw=Math.min(3.0,Math.max(0.2,(mxK-10)/5));
      const rAm=Math.min(...lPts.slice(-2).map(p=>p.paceSec*Math.pow(p.fc/145,0.5)*Math.pow(42.195/p.km,0.06)));
      sig.push({val:rAm,weight:dw});
    }
    if(sig.length===0) continue;
    const tw=sig.reduce((a,s)=>a+s.weight,0);
    historique.push({ws, tempsSec:Math.round(sig.reduce((a,s)=>a+s.val*s.weight,0)/tw*42.195)});
  }

  // Allure marathon recommandée = depuis le temps FINAL (moyenne avec 10km si dispo)
  const amPaceReco = Math.round(totalSec / 42.195 / 5) * 5;  // arrondi à 5s

  return {
    tempsSec:totalSec, tempsStr, methode:'vdot_multi', confiance,
    nbSeances:nbTotal, tendanceSec:slope,
    intervalMin:iMin, intervalMax:iMax,
    intervalMinStr:fmtTime(iMin), intervalMaxStr:fmtTime(iMax),
    historique, sub4hEcartSec:totalSec-14400, vo2max,
    amPaceReco, // allure recommandée en sec/km
    amPaceRecoStr: `${Math.floor(amPaceReco/60)}'${String(amPaceReco%60).padStart(2,'0')}`,
    tempsSecBase: totalSecBase,
    tempsStrBase: fmtTime(totalSecBase),
    tempsSecR10: totalSecR10,
    tempsStrR10: totalSecR10 ? fmtTime(totalSecR10) : null,
    signals, // pour debug
    details:{
      vdotPurLabel:fmtTime(Math.round(vdotPaceSec*42.195)),
      vdotPurSec:Math.round(vdotPaceSec*42.195),
      slopeLabel:slope<-0.5?`−${Math.round(Math.abs(slope)*10)/10}s/km/sem`:slope>0.5?`+${Math.round(slope*10)/10}s/km/sem`:'stable',
      nbEf:efPts.length, nbLong:longPts.length, nbTempo:tempoPts.length,
      amFromEf:amFromEf?Math.round(amFromEf*42.195):null,
      amFromLong:amFromLong?Math.round(amFromLong*42.195):null,
      amFromTempo:amFromTempo?Math.round(amFromTempo*42.195):null,
      bestEfPace:bestEfPaceSec, bestLongPace:bestLongPaceSec, bestTempoPace:bestTempoPaceSec,
      avgCadence, efHistory, tempoHistory, longHistory,
      longMaxKm: longPts.length>0?Math.max(...longPts.slice(-4).map(p=>p.km)):0,
      cardiacDrift: cardiacDrift !== null ? Math.round(cardiacDrift*10)/10 : null,
      driftPenaltySec,
      driftHistory,
    }
  };
}

function openMarathonPredModal() {
  const pred = buildMarathonPrediction();
  const mc = document.getElementById('modal-container');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const sub4 = pred.sub4hEcartSec != null;
  const sub4Color = pred.sub4hEcartSec <= 0 ? '#3B6D11' : pred.sub4hEcartSec < 300 ? '#E8530A' : '#E24B4A';
  const sub4Text = pred.sub4hEcartSec <= 0
    ? `✅ Sub-4h atteint (+${Math.abs(Math.round(pred.sub4hEcartSec/60))} min d'avance)`
    : pred.sub4hEcartSec < 600
    ? `⚡ À ${Math.round(pred.sub4hEcartSec/60)} min du Sub-4h`
    : `🎯 ${Math.round(pred.sub4hEcartSec/60)} min au-dessus du Sub-4h`;

  const tendanceText = pred.tendanceSec == null ? '—'
    : pred.tendanceSec < -0.5
      ? `📈 −${Math.round(Math.abs(pred.tendanceSec)*10)/10} sec/km/sem`
      : pred.tendanceSec > 0.5
      ? `📉 +${Math.round(pred.tendanceSec*10)/10} sec/km/sem`
      : '↔️ Allure stable';

  const confiancePct = pred.confiance;
  const confianceFill = Math.round(confiancePct / 10);
  const confianceColor = confiancePct >= 70 ? '#3B6D11' : confiancePct >= 40 ? '#E8530A' : '#888';

  // Mini graphique SVG historique
  let svgGraph = '';
  if(pred.historique && pred.historique.length >= 2) {
    const W = 300, H = 90, PAD_L = 38, PAD_R = 10, PAD_T = 8, PAD_B = 18;
    const times = pred.historique.map(p => p.tempsSec);
    const sub4Sec = 4 * 3600;
    // Échelle Y : arrondie à 5min, centrée sur les valeurs
    const rawMin = Math.min(...times, sub4Sec) - 600;
    const rawMax = Math.max(...times, sub4Sec) + 600;
    const yMin = Math.floor(rawMin/300)*300;
    const yMax = Math.ceil(rawMax/300)*300;
    const yRange = yMax - yMin;
    const toY = v => PAD_T + ((yMax - v) / yRange) * (H - PAD_T - PAD_B);
    const toX = i => PAD_L + (i / (pred.historique.length - 1)) * (W - PAD_L - PAD_R);
    const pts2 = pred.historique.map((p, i) => ({ x: toX(i), y: toY(p.tempsSec), ws: p.ws }));
    const polyline = pts2.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    // Graduations Y (toutes les 10min)
    let yLabels = '';
    for(let t = yMin; t <= yMax; t += 600) {
      const y = toY(t);
      const hh = Math.floor(t/3600), mm = Math.floor((t%3600)/60);
      yLabels += `<line x1="${PAD_L}" y1="${y.toFixed(1)}" x2="${W-PAD_R}" y2="${y.toFixed(1)}" stroke="#ddd" stroke-width="0.7"/>`;
      yLabels += `<text x="${PAD_L-3}" y="${(y+3).toFixed(1)}" text-anchor="end" font-size="7.5" fill="#999">${hh}h${String(mm).padStart(2,'0')}</text>`;
    }
    // Ligne Sub-4h
    const sub4Y = toY(sub4Sec);
    svgGraph = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:90px;overflow:visible;">
      ${yLabels}
      <line x1="${PAD_L}" y1="${sub4Y.toFixed(1)}" x2="${W-PAD_R}" y2="${sub4Y.toFixed(1)}" stroke="#3B6D11" stroke-width="1.2" stroke-dasharray="4,3"/>
      <text x="${W-PAD_R}" y="${(sub4Y-3).toFixed(1)}" text-anchor="end" font-size="7.5" fill="#3B6D11" font-weight="600">Sub-4h</text>
      <polyline points="${polyline}" fill="none" stroke="#1B4FD8" stroke-width="2" stroke-linejoin="round"/>
      <polygon points="${polyline} ${(W-PAD_R).toFixed(1)},${(H-PAD_B).toFixed(1)} ${PAD_L},${(H-PAD_B).toFixed(1)}" fill="rgba(27,79,216,0.08)"/>
      ${pts2.map((p,i) => i===pts2.length-1
        ? `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#1B4FD8"/>`
        : `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="white" stroke="#1B4FD8" stroke-width="1.5"/>`
      ).join('')}
    </svg>`;
  }

  const methodeNote = `Modèle VDOT (Jack Daniels) · VO2max ${pred.vo2max} · ${pred.details?.nbEf||0} EF + ${pred.details?.nbLong||0} longues + ${pred.details?.nbTempo||0} tempos`;

  overlay.innerHTML = `<div class="modal-box" style="max-height:90vh;overflow-y:auto;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <div>
        <p style="font-size:16px;font-weight:700;color:var(--text);">Prédiction marathon</p>
        <p style="font-size:11px;color:var(--muted);margin-top:2px;">18 octobre 2026 · S32</p>
      </div>
      <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:24px;line-height:1;">×</button>
    </div>

    <!-- Temps principal -->
    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:58px;font-weight:800;letter-spacing:-2px;color:var(--text);line-height:1;">${pred.tempsStr}</div>
      ${pred.tempsStrR10 ? `
      <div style="display:flex;justify-content:center;gap:16px;margin-top:8px;">
        <div style="text-align:center;">
          <div style="font-size:10px;color:var(--muted);margin-bottom:1px;">Modèle entraînement</div>
          <div style="font-size:14px;font-weight:700;color:var(--text);">${pred.tempsStrBase}</div>
        </div>
        <div style="width:1px;background:var(--border);"></div>
        <div style="text-align:center;">
          <div style="font-size:10px;color:var(--muted);margin-bottom:1px;">Record 10km</div>
          <div style="font-size:14px;font-weight:700;color:var(--text);">${pred.tempsStrR10}</div>
        </div>
      </div>` :
      pred.intervalMin ? `<div style="font-size:12px;color:var(--muted);margin-top:4px;">Fourchette : ${pred.intervalMinStr} — ${pred.intervalMaxStr}</div>` : ''}
      ${sub4 ? `<div style="font-size:13px;font-weight:700;color:${sub4Color};margin-top:8px;">${sub4Text}</div>` : ''}
    </div>

    <!-- Confiance -->
    <div style="background:var(--bg2);border-radius:12px;padding:12px 14px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:12px;font-weight:600;color:var(--muted);">Indice de confiance</span>
        <span style="font-size:14px;font-weight:700;color:${confianceColor};">${confiancePct}%</span>
      </div>
      <div style="background:var(--border);border-radius:4px;height:6px;overflow:hidden;">
        <div style="width:${confiancePct}%;height:100%;background:${confianceColor};border-radius:4px;transition:width 0.5s;"></div>
      </div>
      <p style="font-size:10px;color:var(--muted);margin-top:6px;">${
        confiancePct < 30 ? 'Démarrage — moins de 5 séances analysées · affinage rapide en cours' :
        confiancePct < 50 ? 'Estimation préliminaire — les séances EF et tempo posent la base' :
        confiancePct < 65 ? 'En cours d\'affinage — les prochaines longues vont consolider la prédiction' :
        confiancePct < 75 ? 'Estimation fiable · Monte encore avec chaque longue > 18km' :
        'Estimation solide · converge avec chaque séance validée'
      } · ${pred.nbSeances} séances analysées</p>
    </div>

    <!-- Stats -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
      <div style="background:var(--bg2);border-radius:10px;padding:10px 12px;">
        <p style="font-size:10px;color:var(--muted);margin-bottom:4px;">Tendance allure EF (S4→S${CW})</p>
        <p style="font-size:13px;font-weight:700;color:${pred.tendanceSec!=null&&pred.tendanceSec<-0.3?'#3B6D11':pred.tendanceSec!=null&&pred.tendanceSec>0.3?'#E24B4A':'var(--text)'};">${tendanceText}</p>
        <p style="font-size:9px;color:var(--muted);margin-top:3px;">${pred.tendanceSec!=null&&pred.tendanceSec<-0.3?'Tu t\'améliores ✅':pred.tendanceSec!=null&&pred.tendanceSec>0.3?'Régression (fatigue ?)':'Stable'}</p>
      </div>
      <div style="background:var(--bg2);border-radius:10px;padding:10px 12px;">
        <p style="font-size:10px;color:var(--muted);margin-bottom:4px;">Séances analysées</p>
        <p style="font-size:16px;font-weight:800;color:var(--text);margin-bottom:2px;">${pred.nbSeances} séances</p>
        <p style="font-size:10px;color:var(--muted);">${pred.details?.nbEf||0} EF · ${pred.details?.nbLong||0} longues · ${pred.details?.nbTempo||0} tempos</p>
      </div>
      <div style="background:var(--bg2);border-radius:10px;padding:10px 12px;">
        <p style="font-size:10px;color:var(--muted);margin-bottom:4px;">Potentiel théorique (VO2max ${pred.vo2max})</p>
        <p style="font-size:13px;font-weight:700;color:#1B4FD8;">${pred.details ? pred.details.vdotPurLabel : '—'} <span style="font-size:9px;color:var(--muted);font-weight:400;">sans fatigue</span></p>
      </div>
      <div style="background:var(--bg2);border-radius:10px;padding:10px 12px;cursor:pointer;" onclick="closeModal();openVo2maxModal();">
        <p style="font-size:10px;color:var(--muted);margin-bottom:4px;">VO2max · modifier ✎</p>
        <p style="font-size:13px;font-weight:700;color:#1B4FD8;">${pred.vo2max} <span style="font-size:10px;font-weight:400;">ml/kg/min</span></p>
      </div>
    </div>

    <!-- Graphique évolution -->
    ${pred.historique && pred.historique.length >= 2 ? `
    <div style="background:var(--bg2);border-radius:12px;padding:12px 14px;margin-bottom:12px;">
      <p style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Évolution de la prédiction</p>
      ${svgGraph}
      <div style="display:flex;justify-content:space-between;margin-top:4px;">
        <span style="font-size:9px;color:var(--muted);">S1</span>
        <span style="font-size:9px;color:var(--muted);">S${CW} (aujourd'hui)</span>
      </div>
    </div>` : ''}

    <!-- Tableau record 10km (admin uniquement) -->
    ${(!isAdmin() ? '' : (()=>{
      const r10pred = getRecord10kmPredictions();
      if(!r10pred) return `
    <div onclick="closeModal();openRecord10kmModal();" style="background:var(--bg2);border-radius:12px;padding:10px 14px;margin-bottom:12px;cursor:pointer;border:1.5px dashed var(--border);display:flex;align-items:center;gap:10px;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <div>
        <p style="font-size:12px;font-weight:700;color:var(--text);">Ajouter ton record 10km</p>
        <p style="font-size:10px;color:var(--muted);">Pour une estimation supplémentaire \u2192 Semi & Marathon</p>
      </div>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2.5" style="margin-left:auto;flex-shrink:0;"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`;
      const marEcartMin = Math.round((r10pred.marSec - 14400) / 60);
      const diffMin = Math.round((r10pred.marSec - pred.tempsSec) / 60);
      const diffLabel = diffMin === 0 ? '= Modèle entraînement' : diffMin > 0 ? `+${diffMin} min vs modèle` : `${diffMin} min vs modèle`;
      const diffColor = Math.abs(diffMin) <= 5 ? '#3B6D11' : Math.abs(diffMin) <= 15 ? '#E8530A' : '#E24B4A';
      return `
    <div style="background:var(--bg2);border-radius:12px;margin-bottom:12px;overflow:hidden;border:1px solid var(--border);">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 14px;border-bottom:1px solid var(--border);">
        <p style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;">\u{1F3C3} Estimation par record 10km</p>
        <button onclick="closeModal();openRecord10kmModal();" style="background:none;border:none;cursor:pointer;padding:0;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2.5"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;background:var(--bg);">
        <div style="text-align:center;padding:10px 6px;">
          <p style="font-size:10px;color:var(--muted);margin-bottom:3px;">Record 10km</p>
          <p style="font-size:17px;font-weight:800;color:var(--text);">${r10pred.record10kmStr}</p>
          <p style="font-size:9px;color:var(--muted);margin-top:2px;">${r10pred.record10kmPaceStr}/km</p>
          <p style="font-size:9px;font-weight:600;color:var(--muted);margin-top:1px;">${r10pred.record10kmSpeedKmh} km/h</p>
        </div>
        <div style="text-align:center;padding:10px 6px;border-left:1px solid var(--border);border-right:1px solid var(--border);">
          <p style="font-size:10px;color:var(--muted);margin-bottom:3px;">Semi estim\u00e9</p>
          <p style="font-size:17px;font-weight:800;color:#1B4FD8;">${r10pred.semiStr}</p>
          <p style="font-size:9px;color:var(--muted);margin-top:2px;">${r10pred.semiPaceStr}/km</p>
          <p style="font-size:9px;font-weight:600;color:var(--muted);margin-top:1px;">${r10pred.semiSpeedKmh} km/h</p>
        </div>
        <div style="text-align:center;padding:10px 6px;">
          <p style="font-size:10px;color:var(--muted);margin-bottom:3px;">Marathon estim\u00e9</p>
          <p style="font-size:17px;font-weight:800;color:#1B4FD8;">${r10pred.marStr}</p>
          <p style="font-size:9px;color:var(--muted);margin-top:2px;">${r10pred.marPaceStr}/km</p>
          <p style="font-size:9px;font-weight:600;color:var(--muted);margin-top:1px;">${r10pred.marSpeedKmh} km/h</p>
        </div>
      </div>
    </div>`;
    })())}

    <!-- Tableau décomposition -->
    ${(()=>{
      const d = pred.details || {};
      const fmtTime = s => { const hh=Math.floor(s/3600),mm=Math.floor((s%3600)/60); return `${hh}h${String(mm).padStart(2,'0')}`; };
      const fmtPace = s => s ? `${Math.floor(s/60)}'${String(Math.round(s%60)).padStart(2,'0')}"` : '—';
      const fmtT = s => s ? fmtTime(s) : '—';
      const sub4Sec = 14400;
      const ecart = s => {
        if(!s) return '';
        const diff = Math.round((s-sub4Sec)/60);
        return diff<=0 ? `<span style="color:#3B6D11;font-weight:700;">Sub-4h ✅</span>` : `<span style="color:#E24B4A;">+${diff} min du Sub-4h</span>`;
      };
      const gainIfImprove = (sec, pct) => sec ? fmtTime(Math.round(sec*(1-pct/100))) : '—';

      const rows = [];

      if(d.amFromEf) {
        // Tendance individuelle EF
        let efTrendHtml = '';
        if(d.efHistory && d.efHistory.length > 0) {
          const fmtPaceSec = s => `${Math.floor(s/60)}'${String(Math.round(s%60)).padStart(2,'0')}`;
          const items = d.efHistory.map((h,i) => {
            const prev = i>0 ? d.efHistory[i-1].normPace : null;
            const arrow = prev===null ? '' : h.normPace < prev-3 ? ' ↓' : h.normPace > prev+3 ? ' ↑' : ' →';
            const color = h.normPace < 345 ? '#3B6D11' : h.normPace < 365 ? '#E8530A' : '#E24B4A';
            // Afficher l'allure réelle, FC, et normalisée en petit
            return `<span style="color:${color};font-weight:600;">S${h.ws} ${h.rawPaceStr}/km FC${h.fc}${arrow}</span>`;
          }).join('<span style="color:var(--muted);"> · </span>');
          const first = d.efHistory[0].normPace, last = d.efHistory[d.efHistory.length-1].normPace;
          const trend = last < first-3 ? ' 📉 En progression' : last > first+3 ? ' 📈 En recul' : ' → Stable';
          efTrendHtml = `<div style="margin-top:6px;display:flex;flex-direction:column;gap:4px;">
            ${d.efHistory.map((h,i) => {
              const prev = i>0 ? d.efHistory[i-1].normPace : null;
              const arrow = prev===null ? '' : h.normPace < prev-3 ? '↓' : h.normPace > prev+3 ? '↑' : '→';
              const arrowColor = arrow==='↓' ? '#3B6D11' : arrow==='↑' ? '#E24B4A' : '#888';
              const color = h.normPace < 345 ? '#3B6D11' : h.normPace < 365 ? '#E8530A' : '#E24B4A';
              return `<div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg);border:1px solid var(--border);border-radius:7px;padding:5px 10px;">
                <span style="font-size:11px;font-weight:600;color:var(--muted);">S${h.ws}</span>
                <span style="font-size:13px;font-weight:700;color:${color};">${h.rawPaceStr}/km</span>
                <span style="font-size:11px;color:var(--muted);">FC ${h.fc}</span>
                ${arrow ? `<span style="font-size:13px;font-weight:700;color:${arrowColor};">${arrow}</span>` : '<span style="width:13px;"></span>'}
              </div>`;
            }).join('')}
            <div style="text-align:right;font-size:10px;color:var(--muted);font-style:italic;margin-top:1px;">${last < first-3 ? '📉 En progression' : last > first+3 ? '📈 En recul' : '→ Stable'}</div>
          </div>`;
        }
        // --- EF : textes dynamiques ---
        const efLast = d.efHistory && d.efHistory.length > 0 ? d.efHistory[d.efHistory.length-1] : null;
        const efFirst = d.efHistory && d.efHistory.length > 0 ? d.efHistory[0] : null;
        const efProgressing = efFirst && efLast && efLast.normPace < efFirst.normPace - 5;
        const efRegressing  = efFirst && efLast && efLast.normPace > efFirst.normPace + 5;
        const efStable      = !efProgressing && !efRegressing;
        const efNormSec     = efLast ? efLast.normPace : null;
        const efPaceGood    = efNormSec && efNormSec < 350; // < 5'50
        const efPaceGreat   = efNormSec && efNormSec < 340; // < 5'40

        const efDetail = (() => {
          if(efPaceGreat && efProgressing) return `Allure EF normalisée en nette progression — ton aérobie s'améliore séance après séance`;
          if(efPaceGreat && efStable)      return `Allure EF normalisée solide et stable — base aérobie bien installée`;
          if(efPaceGood  && efProgressing) return `Bonne dynamique EF — allure normalisée en baisse, signal marathon en amélioration`;
          if(efPaceGood  && efRegressing)  return `Légère dégradation de l'allure EF normalisée — surveille la fatigue accumulée`;
          if(efRegressing)                 return `Allure EF normalisée en recul — probable fatigue ou surcharge ; récupération conseillée`;
          if(efStable)                     return `Allure EF normalisée stable sur les 3 dernières séances — phase de consolidation`;
          return `Allure normalisée FC 143 × ratio empirique EF→Marathon`;
        })();

        const efExplication = (() => {
          const ratio = Math.round((1 - 0.961) * 100);
          if(efPaceGreat && efProgressing)
            return `Tes EF progressent clairement : chaque sortie normalise une allure plus rapide à FC identique. C'est le signe que ton cœur travaille plus efficacement. Continue à rester strictement sous FC 148 — la progression se construit là, pas dans la vitesse.`;
          if(efPaceGreat && efStable)
            return `Ta base aérobie est solide. Les 3 dernières EF montrent une allure normalisée cohérente — le moteur tourne bien. La prochaine progression viendra des longues sorties et des blocs tempo accumulés.`;
          if(efPaceGood && efProgressing)
            return `L'allure EF se normalise à la baisse : à fréquence cardiaque équivalente, tu cours plus vite. C'est exactement ce que le plan cherche à construire. Garde le cap sur les FC cibles (140-148 bpm).`;
          if(efRegressing)
            return `L'allure EF normalisée remonte, ce qui peut indiquer une fatigue cardiaque ou un manque de récupération. Vérifie ta FC repos du matin — si elle dépasse 55 bpm, prends une journée de plus. Ce n'est pas une régression durable, juste un signal à ne pas ignorer.`;
          return `L'allure normalisée = ce que tu aurais couru à exactement FC 143. Le ratio ${ratio}% appliqué reflète la marge entre ton EF confortable et ton allure marathon soutenable sur 42km. Il s'affine automatiquement à mesure que ta prépa avance.`;
        })();

        const efLevier = (() => {
          if(!efNormSec) return `Complète tes séances EF sous FC 148 pour alimenter ce signal`;
          const targetNorm = 330; // ~5'30 normalisée
          if(efNormSec <= targetNorm) return `Signal EF déjà excellent — mise sur les longues pour confirmer`;
          const gainSec = Math.round((efNormSec - targetNorm) * 0.961 * 42.195);
          const gainMin = Math.round(gainSec / 60);
          return `Si allure EF norm → 5'30/km : gain estimé ~${gainMin} min sur le marathon`;
        })();

        rows.push({
          icon:'💚', label:'Séances EF', poids:'3 dernières · Poids 2.5×',
          detail: efDetail,
          explication: efExplication,
          prediction: fmtT(d.amFromEf), ecart: ecart(d.amFromEf),
          trendHtml: efTrendHtml,
          levier: efLevier
        });
      }

      if(d.amFromLong) {
        const maxKm = d.longMaxKm || 0;
        const dynWeightPct = Math.round(Math.min(100, Math.max(7, (maxKm-10)/5*100/3)));
        // Barre de progression : 10km = 0%, 25km = 100%
        const barPct = Math.round(Math.min(100, Math.max(0, (maxKm-10)/15*100)));
        // Jalons sur la barre
        const milestones = [
          {km:10, label:'10km', pct:0},
          {km:15, label:'15km', pct:33},
          {km:20, label:'20km', pct:67},
          {km:25, label:'25km', pct:100},
        ];
        const weightBarHtml = `<div style="margin-top:8px;margin-bottom:4px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <span style="font-size:10px;font-weight:600;color:var(--muted);">Pondération du signal longues</span>
            <span style="font-size:12px;font-weight:800;color:${dynWeightPct<30?'#E24B4A':dynWeightPct<70?'#E8530A':'#3B6D11'};">${dynWeightPct}%</span>
          </div>
          <div style="position:relative;padding-top:16px;margin-bottom:20px;">
            <div style="position:absolute;top:0;left:${barPct}%;transform:translateX(-50%);font-size:9px;font-weight:700;color:${barPct<33?'#E24B4A':barPct<67?'#E8530A':'#3B6D11'};white-space:nowrap;">▼ ${maxKm}km</div>
            <div style="position:relative;height:10px;background:var(--border);border-radius:5px;overflow:hidden;">
              <div style="height:100%;width:${barPct}%;background:${barPct<33?'#E24B4A':barPct<67?'#E8530A':'#3B6D11'};border-radius:5px;"></div>
            </div>
            <div style="position:relative;height:16px;margin-top:2px;">
              ${milestones.map(m => `<div style="position:absolute;left:${m.pct}%;transform:translateX(-50%);font-size:8px;color:${maxKm>=m.km?'#3B6D11':'var(--muted)'};font-weight:${maxKm>=m.km?'700':'400'};white-space:nowrap;">${m.label}</div>`).join('')}
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--muted);">
            <span>Poids minimal</span>
            <span style="color:#3B6D11;font-weight:600;">Poids plein à 25km</span>
          </div>
        </div>`;
        let longTrendHtml = '';
        if(d.longHistory && d.longHistory.length > 0) {
          const fmtPS = s => `${Math.floor(s/60)}'${String(Math.round(s%60)).padStart(2,'0')}`;
          const items = d.longHistory.map((h,i) => {
            const prev = i>0 ? d.longHistory[i-1].riegelAm : null;
            const arrow = prev===null ? '' : h.riegelAm < prev-120 ? ' ↓' : h.riegelAm > prev+120 ? ' ↑' : ' →';
            const fmtH = s => `${Math.floor(s/3600)}h${String(Math.floor((s%3600)/60)).padStart(2,'0')}`;
            const color = h.riegelAm < 14400 ? '#3B6D11' : h.riegelAm < 15000 ? '#E8530A' : '#888';
            return `<span style="color:${color};font-weight:600;">S${h.ws} ${h.paceStr||fmtPS(h.pace)} ${h.km}km→${fmtH(h.riegelAm)}${arrow}</span>`;
          }).join('<span style="color:var(--muted);"> · </span>');
          const first = d.longHistory[0].riegelAm, last = d.longHistory[d.longHistory.length-1].riegelAm;
          const trend = last < first-120 ? ' 📉 En progression' : last > first+120 ? ' 📈 En recul' : ' → Stable';
          longTrendHtml = `<div style="margin-top:6px;display:flex;flex-direction:column;gap:4px;">
            ${d.longHistory.map((h,i) => {
              const prev = i>0 ? d.longHistory[i-1].riegelAm : null;
              const arrow = prev===null ? '' : h.riegelAm < prev-120 ? '↓' : h.riegelAm > prev+120 ? '↑' : '→';
              const arrowColor = arrow==='↓' ? '#3B6D11' : arrow==='↑' ? '#E24B4A' : '#888';
              const fmtH = s => `${Math.floor(s/3600)}h${String(Math.floor((s%3600)/60)).padStart(2,'0')}`;
              const color = h.riegelAm < 14400 ? '#3B6D11' : h.riegelAm < 15000 ? '#E8530A' : '#888';
              return `<div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg);border:1px solid var(--border);border-radius:7px;padding:5px 10px;">
                <span style="font-size:11px;font-weight:600;color:var(--muted);">S${h.ws}</span>
                <span style="font-size:13px;font-weight:700;color:var(--text);">${h.paceStr}/km · ${h.km}km</span>
                <span style="font-size:12px;font-weight:700;color:${color};">${fmtH(h.riegelAm)}</span>
                ${arrow ? `<span style="font-size:13px;font-weight:700;color:${arrowColor};">${arrow}</span>` : '<span style="width:13px;"></span>'}
              </div>`;
            }).join('')}
            <div style="text-align:right;font-size:10px;color:var(--muted);font-style:italic;margin-top:1px;">${last < first-120 ? '📉 En progression' : last > first+120 ? '📈 En recul' : '→ Stable'}</div>
          </div>`;
        }
        // --- LONGUES : textes dynamiques ---
        const longLast  = d.longHistory && d.longHistory.length > 0 ? d.longHistory[d.longHistory.length-1] : null;
        const longFirst = d.longHistory && d.longHistory.length > 0 ? d.longHistory[0] : null;
        const longProgressing = longFirst && longLast && longLast.riegelAm < longFirst.riegelAm - 120;
        const longRegressing  = longFirst && longLast && longLast.riegelAm > longFirst.riegelAm + 120;
        const longNearSub4    = longLast && longLast.riegelAm < 15000 && longLast.riegelAm >= 14400;
        const longAboveSub4   = longLast && longLast.riegelAm >= 15000;

        const longDetail = (() => {
          if(maxKm < 14)       return `Longues encore courtes (${maxKm}km) — signal en construction, poids faible (${dynWeightPct}%)`;
          if(maxKm < 18)       return `Longues en montée de charge (${maxKm}km) — signal qui commence à peser dans la fusion`;
          if(longProgressing)  return `Riegel en amélioration séance après séance — tes longues projettent un meilleur marathon`;
          if(longRegressing)   return `Projection Riegel en légère hausse — surveille l'allure et la FC sur les prochaines longues`;
          if(longNearSub4)     return `Projection Riegel très proche du Sub-4h — encore quelques longues à consolider`;
          return `Formule Riegel · ${maxKm}km max · poids dynamique ${dynWeightPct}%`;
        })();

        const longExplication = (() => {
          if(maxKm < 14)
            return `Tes longues sont encore courtes pour que Riegel soit fiable — en dessous de 18km, l'extrapolation sur 42km a trop d'incertitude. C'est normal à S${CW}. Chaque longue au-delà de 15km double le poids de ce signal dans le calcul final.`;
          if(maxKm < 18)
            return `Le signal commence à prendre de la valeur. À ${maxKm}km, Riegel extrapole avec une marge raisonnable. Dès que tu dépasses 20km en longue, ce signal devient le prédicteur le plus fiable de ta performance marathon réelle.`;
          if(longProgressing)
            return `Tes longues progressent — la projection Riegel baisse séance après séance. C'est le signe le plus solide d'une vraie progression marathon : tu tiens une meilleure allure plus longtemps, à FC contrôlée.`;
          if(longNearSub4)
            return `La projection Riegel est aux portes du Sub-4h. Il reste à confirmer sur une longue de 22-24km avec une allure maîtrisée et une FC stable. Ce serait le signal le plus convaincant pour valider l'objectif.`;
          return `La formule Riegel (t₂ = t₁ × (d₂/d₁)^1.06) extrapole ton temps marathon depuis tes sorties longues. Corrigée par ta FC réelle vs FC référence (145 bpm), elle donne une estimation ancrée dans ta performance terrain — plus fiable que la théorie pure.`;
        })();

        const longLevier = (() => {
          if(maxKm < 18) return `Chaque longue > 18km fait monter ce signal de 15 à 40% de poids — priorité absolue`;
          if(maxKm < 22) return `Prochaine longue > 20km : poids du signal × 2, précision +30%`;
          if(longProgressing) return `Continue : chaque longue confirme et affine le Sub-4h`;
          return `Intégrer 3-5 km à allure AM entraînement (${getAmTrainingPace()}/km) en fin de longue → gain direct sur Riegel`;
        })();

        rows.push({
          icon:'🟣', label:'Séances longues',
          poids:`3 dernières · Poids dynamique (${dynWeightPct}%)`,
          detail: longDetail,
          explication: longExplication,
          prediction: fmtT(d.amFromLong), ecart: ecart(d.amFromLong),
          trendHtml: weightBarHtml + longTrendHtml,
          levier: longLevier
        });
      }

      if(d.amFromTempo) {
        let tempoTrendHtml = '';
        if(d.tempoHistory && d.tempoHistory.length > 0) {
          const fmtPS = s => `${Math.floor(s/60)}'${String(Math.round(s%60)).padStart(2,'0')}`;
          const items = d.tempoHistory.map((h,i) => {
            const prev = i>0 ? d.tempoHistory[i-1].avgPace : null;
            const arrow = prev===null ? '' : h.avgPace < prev-3 ? ' ↓' : h.avgPace > prev+3 ? ' ↑' : ' →';
            const color = h.avgPace < 295 ? '#3B6D11' : h.avgPace < 315 ? '#E8530A' : '#E24B4A';
            return `<span style="color:${color};font-weight:600;">S${h.ws} ${h.avgPaceStr||fmtPS(h.avgPace)}/km${arrow}</span>`;
          }).join('<span style="color:var(--muted);"> · </span>');
          const first = d.tempoHistory[0].avgPace, last = d.tempoHistory[d.tempoHistory.length-1].avgPace;
          const trend = last < first-3 ? ' 📉 En progression' : last > first+3 ? ' 📈 En recul' : ' → Stable';
          tempoTrendHtml = `<div style="margin-top:6px;display:flex;flex-direction:column;gap:4px;">
            ${d.tempoHistory.map((h,i) => {
              const prev = i>0 ? d.tempoHistory[i-1].avgPace : null;
              const arrow = prev===null ? '' : h.avgPace < prev-3 ? '↓' : h.avgPace > prev+3 ? '↑' : '→';
              const arrowColor = arrow==='↓' ? '#3B6D11' : arrow==='↑' ? '#E24B4A' : '#888';
              const color = h.avgPace < 295 ? '#3B6D11' : h.avgPace < 315 ? '#E8530A' : '#E24B4A';
              return `<div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg);border:1px solid var(--border);border-radius:7px;padding:5px 10px;">
                <span style="font-size:11px;font-weight:600;color:var(--muted);">S${h.ws}</span>
                <span style="font-size:13px;font-weight:700;color:${color};">${h.avgPaceStr}/km</span>
                <span style="font-size:11px;color:var(--muted);">${h.blocs} bloc${h.blocs>1?'s':''}</span>
                ${arrow ? `<span style="font-size:13px;font-weight:700;color:${arrowColor};">${arrow}</span>` : '<span style="width:13px;"></span>'}
              </div>`;
            }).join('')}
            <div style="text-align:right;font-size:10px;color:var(--muted);font-style:italic;margin-top:1px;">${last < first-3 ? '📉 En progression' : last > first+3 ? '📈 En recul' : '→ Stable'}</div>
          </div>`;
        }
        // --- TEMPO : textes dynamiques ---
        const tempoLast  = d.tempoHistory && d.tempoHistory.length > 0 ? d.tempoHistory[d.tempoHistory.length-1] : null;
        const tempoFirst = d.tempoHistory && d.tempoHistory.length > 0 ? d.tempoHistory[0] : null;
        const tempoProg  = tempoFirst && tempoLast && tempoLast.avgPace < tempoFirst.avgPace - 4;
        const tempoReg   = tempoFirst && tempoLast && tempoLast.avgPace > tempoFirst.avgPace + 4;
        const tempoSub4  = tempoLast && tempoLast.amPred < 14400;
        const tempoAvgSec = tempoLast ? tempoLast.avgPace : null;
        const tempoStrong = tempoAvgSec && tempoAvgSec < 295; // < 4'55

        const tempoDetail = (() => {
          if(tempoStrong && tempoProg)  return `Blocs tempo puissants et en progression — vitesse anaérobie en hausse`;
          if(tempoStrong && !tempoReg)  return `Blocs tempo solides — vitesse seuil bien au-dessus de l'allure marathon cible`;
          if(tempoProg)                 return `Progression nette sur les blocs tempo — tu gagnes en vitesse à chaque séance`;
          if(tempoReg)                  return `Blocs tempo légèrement ralentis — fatigue possible, ou adaptation en cours`;
          return `Allure moy. par séance × 1.17 · 3 dernières séances · pondération croissante`;
        })();

        const tempoExplication = (() => {
          const nb = d.nbTempo || 0;
          if(nb < 3)
            return `Signal en construction — moins de 3 séances tempo validées. Plus tu accumules de blocs, plus ce signal devient fiable. Il prendra tout son sens à partir de S15+ quand les blocs s'allongent.`;
          if(tempoStrong && tempoProg)
            return `Tes blocs tempo s'accélèrent séance après séance : c'est le signe que ton seuil anaérobie monte. Plus ton seuil est haut par rapport à ton allure marathon cible, plus tu as de la marge le jour J. Le facteur ×1.17 traduit l'écart réaliste entre un bloc de 15 min et 42km de soutien.`;
          if(tempoStrong)
            return `Tes blocs sont bien au-dessus de l'allure marathon cible — tu as une vraie réserve de vitesse. Le ×1.17 appliqué est conservateur : tenir le rythme tempo sur 42km est une toute autre histoire. Ce signal confirme ton potentiel, les longues devront le valider.`;
          if(tempoProg)
            return `La vitesse tempo progresse clairement — chaque séance repousse ton seuil. C'est important : un seuil élevé te permet de courir à allure marathon avec moins d'effort relatif, et donc de mieux tenir en fin de course.`;
          if(tempoReg)
            return `Les blocs tempo ont légèrement ralenti. C'est souvent le signe d'une fatigue en accumulation plutôt qu'une vraie régression. Si la FC est montée mais pas l'allure, surveille ta récupération. Si ça persiste, c'est un signal à prendre au sérieux.`;
          return `La moyenne des blocs par séance est pondérée : la plus récente compte 3×, l'avant-dernière 2×, l'ancienne 1×. Le facteur ×1.17 traduit l'écart réaliste entre tenir une allure 15 min en bloc et la maintenir 42km — un gap qui se réduit avec les longues spécifiques.`;
        })();

        const tempoLevier = (() => {
          if(!tempoAvgSec) return `Valide tes séances tempo avec les blocs renseignés pour alimenter ce signal`;
          const amFromTempoSec = tempoAvgSec * 1.17;
          const amSec = paceStrToSec(getMarathonPaceStr().replace("'",":"));
          if(amSec && amFromTempoSec > amSec + 120) return `Signal tempo encore au-dessus de l'objectif — les longues feront la différence`;
          if(amSec && amFromTempoSec < amSec - 60)  return `Signal tempo très favorable — confirme l'objectif Sub-4h si les longues suivent`;
          return `Allonger les blocs (2×15 min → 2×20 min) à partir de S16 pour renforcer ce signal`;
        })();

        rows.push({
          icon:'🟠', label:'Blocs tempo', poids:'3 dernières séances · Poids 3.0×',
          detail: tempoDetail,
          explication: tempoExplication,
          prediction: fmtT(d.amFromTempo), ecart: ecart(d.amFromTempo),
          trendHtml: tempoTrendHtml,
          levier: tempoLevier
        });
      }

      if(d.cardiacDrift !== null && d.cardiacDrift !== undefined) {
        const drift = d.cardiacDrift;
        const driftLabel = drift < 3 ? '✅ Parfait' : drift < 5 ? '✅ Excellent' : drift < 8 ? '👍 Bon' : drift < 12 ? '⚠️ Moyen' : '❌ Élevé';
        const driftImpact = d.driftPenaltySec < 0
          ? `<span style="color:#3B6D11;font-weight:700;">Bonus −${Math.abs(Math.round(d.driftPenaltySec/60))} min</span>`
          : d.driftPenaltySec > 0
          ? `<span style="color:#E24B4A;font-weight:700;">Pénalité +${Math.round(d.driftPenaltySec/60)} min</span>`
          : '<span style="color:var(--muted);">Neutre (5-8%)</span>';

        let trendHtml = '';
        if(d.driftHistory && d.driftHistory.length > 0) {
          const first = d.driftHistory[0].drift, last = d.driftHistory[d.driftHistory.length-1].drift;
          const globalTrend = last < first-1 ? '📉 En amélioration' : last > first+1 ? '📈 En hausse' : '→ Stable';
          trendHtml = `<div style="margin-top:6px;display:flex;flex-direction:column;gap:4px;">
            ${d.driftHistory.map((h,i) => {
              const prev = i>0 ? d.driftHistory[i-1].drift : null;
              const arrow = prev===null ? '' : h.drift < prev-0.5 ? '↓' : h.drift > prev+0.5 ? '↑' : '→';
              const arrowColor = arrow==='↓' ? '#3B6D11' : arrow==='↑' ? '#E24B4A' : '#888';
              const color = h.drift < 5 ? '#3B6D11' : h.drift < 8 ? '#3B6D11' : h.drift < 12 ? '#E8530A' : '#E24B4A';
              const lbl = h.drift < 3 ? 'Parfait' : h.drift < 5 ? 'Excellent' : h.drift < 8 ? 'Bon' : h.drift < 12 ? 'Moyen' : 'Élevé';
              return `<div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg);border:1px solid var(--border);border-radius:7px;padding:5px 10px;">
                <span style="font-size:11px;font-weight:600;color:var(--muted);">S${h.ws} · ${h.km}km</span>
                <span style="font-size:11px;color:var(--muted);">FC ${h.fcStart}→${h.fcEnd} bpm</span>
                <span style="font-size:12px;font-weight:700;color:${color};">+${h.drift}% · ${lbl}</span>
                ${arrow ? `<span style="font-size:13px;font-weight:700;color:${arrowColor};">${arrow}</span>` : '<span style="width:13px;"></span>'}
              </div>`;
            }).join('')}
            <div style="text-align:right;font-size:10px;color:var(--muted);font-style:italic;margin-top:1px;">${globalTrend}</div>
          </div>`;
        }

        // --- DÉRIVE CARDIAQUE : textes dynamiques ---
        const driftImprovingTrend = d.driftHistory && d.driftHistory.length >= 2 &&
          d.driftHistory[d.driftHistory.length-1].drift < d.driftHistory[0].drift - 1;
        const driftWorseningTrend = d.driftHistory && d.driftHistory.length >= 2 &&
          d.driftHistory[d.driftHistory.length-1].drift > d.driftHistory[0].drift + 1;

        const driftDetailDyn = (() => {
          if(drift < 3 && driftImprovingTrend) return `Dérive quasi nulle et en amélioration — endurance fondamentale exceptionnelle`;
          if(drift < 3)   return `Dérive cardiaque minimale — cœur ultra-stable sur toute la durée de l'effort`;
          if(drift < 5 && driftImprovingTrend) return `Excellente dérive, encore en amélioration — moteur aérobie qui monte en puissance`;
          if(drift < 5)   return `Dérive cardiaque excellente — la FC tient bien sur la durée de la longue`;
          if(drift < 8 && driftImprovingTrend) return `Bonne dérive et tendance à l'amélioration — endurance en progression`;
          if(drift < 8)   return `Dérive cardiaque correcte — stable, neutre sur la prédiction (5-8%)`;
          if(drift < 12 && driftWorseningTrend) return `Dérive en hausse — signe possible de fatigue accumulée ou manque d'hydratation`;
          if(drift < 12)  return `Dérive modérée — pénalité appliquée, à travailler sur les prochaines longues`;
          return `Dérive cardiaque élevée — l'endurance aérobie ne tient pas encore sur la durée`;
        })();

        const driftExplicationDyn = (() => {
          const lastLong = d.driftHistory && d.driftHistory.length > 0 ? d.driftHistory[d.driftHistory.length-1] : null;
          const lastKm = lastLong ? lastLong.km : null;
          if(drift < 3)
            return `Une dérive de ${drift}% du milieu à la fin de ta longue, c'est remarquable — ton cœur maintient une charge quasi constante. C'est la preuve d'une endurance fondamentale très bien construite. Ce niveau justifie un bonus de ${Math.abs(Math.round(d.driftPenaltySec/60))} min sur ta prédiction.`;
          if(drift < 5)
            return `Dérive de ${drift}% : ton cœur accélère légèrement en fin de longue, mais reste dans la zone optimale. C'est le signe d'une bonne endurance aérobie. Cela se consolidera encore avec les longues au-delà de 22km — les efforts prolongés bâtissent l'efficacité cardiaque.`;
          if(drift < 8)
            return `${drift}% de dérive : la FC monte légèrement en seconde moitié, mais c'est dans la norme acceptable pour des longues de ${lastKm||10}km. À ce niveau, la dérive n'entraîne ni bonus ni pénalité. Au-delà de 20km de longue, l'effort aérobie prolongé devrait naturellement réduire cette dérive.`;
          if(drift < 12)
            return `Une dérive de ${drift}% indique que le cœur doit travailler de plus en plus fort pour maintenir la même allure — signe de fatigue progressive ou d'un rythme un peu trop élevé. Pénalité de +${Math.round(d.driftPenaltySec/60)} min appliquée. Conseil : ralentir les 2 premiers km de longue, et rester sous FC 145 tout au long.`;
          return `${drift}% de dérive, c'est élevé : la FC monte nettement en fin de sortie, ce qui suggère soit un début trop rapide, soit un déficit d'endurance fondamentale. Travailler les EF longues strictement sous FC 145 pendant 4-6 semaines devrait réduire ce chiffre significativement.`;
        })();

        const driftLevier = (() => {
          if(drift < 5) return `Très bon niveau — les prochaines longues > 20km vont encore améliorer cette dérive`;
          if(drift < 8) return `Zone neutre : vise < 5% en gardant FC < 145 sur toute la longue (y compris les 2 premiers km)`;
          if(d.driftHistory && d.driftHistory.length >= 2 && driftImprovingTrend)
            return `Bonne trajectoire — continue à démarrer les longues lentement, la dérive baisse naturellement`;
          return `Démarre tes longues 10-15 sec/km plus lentement que d'habitude et bois à chaque point d'eau`;
        })();

        rows.push({
          icon:'💓', label:'Dérive cardiaque', poids:`3 dernières longues`,
          detail: driftDetailDyn,
          explication: driftExplicationDyn,
          prediction: `+${drift}% · ${driftLabel}`,
          ecart: driftImpact,
          trendHtml,
          levier: driftLevier
        });
      }

      // --- VO2MAX : textes dynamiques ---
      const vo2 = pred.vo2max || 52;
      const vo2Gap = d.vdotPurSec && pred.tempsSec ? Math.round((pred.tempsSec - d.vdotPurSec) / 60) : null;
      const vo2DetailDyn = (() => {
        if(vo2 >= 58) return `VO2max ${vo2} ml/kg/min — très bon potentiel physiologique, marge de progression limitée`;
        if(vo2 >= 55) return `VO2max ${vo2} ml/kg/min — bon potentiel physiologique, encore de la marge`;
        if(vo2 >= 52) return `VO2max ${vo2} ml/kg/min — potentiel dans la moyenne, largement suffisant pour Sub-4h`;
        return `VO2max ${vo2} ml/kg/min — potentiel en construction, progressera avec le volume`;
      })();

      const vo2ExplicationDyn = (() => {
        const gapLabel = vo2Gap !== null ? `${vo2Gap} min` : '?';
        if(vo2Gap !== null && vo2Gap > 20)
          return `Ton potentiel théorique (${d.vdotPurLabel}) est bien au-dessus de ta prédiction réelle (${pred.tempsStr}). Cet écart de ${gapLabel} représente ta marge de progression — il se comble avec l'endurance spécifique marathon, les longues sorties et la gestion des efforts. Tu ne cours pas encore à ton plein potentiel, et c'est normal à S${CW}.`;
        if(vo2Gap !== null && vo2Gap <= 10)
          return `Ton potentiel théorique (${d.vdotPurLabel}) est très proche de ta prédiction réelle. Tu exploites déjà une grande partie de ton potentiel VO2max — signe d'une bonne efficacité. Pour aller plus loin, les gains viendront de l'économie de course, des longues spécifiques et de la gestion d'allure.`;
        return `La VO2max est ton plafond physiologique. Ta Garmin la recalcule après chaque sortie intense. Plus elle monte, plus le plafond s'élève. L'écart entre ce plafond (${d.vdotPurLabel||'—'}) et ta prédiction réelle (${pred.tempsStr}) représente la marge que l'entraînement vient combler progressivement.`;
      })();

      const vo2LevierDyn = (() => {
        const v55 = fmtTime(Math.round(vdotMarathonPaceSec(55)*42.195));
        const v58 = fmtTime(Math.round(vdotMarathonPaceSec(58)*42.195));
        if(vo2 < 52) return `VO2max 55 → ${v55} de potentiel · séances tempo et allures variées pour la faire monter`;
        if(vo2 < 55) return `VO2max 55 → ${v55} · VO2max 58 → ${v58} · les blocs tempo y contribuent directement`;
        return `À VO2max ${vo2} : potentiel déjà fort — focus sur l'endurance spécifique plutôt que sur le VO2max pur`;
      })();

      rows.push({
        icon:'🔬', label:'Potentiel VO2max', poids:'Base théorique',
        detail: vo2DetailDyn,
        explication: vo2ExplicationDyn,
        prediction: d.vdotPurLabel||'—', ecart: ecart(d.vdotPurSec),
        levier: vo2LevierDyn
      });

      // --- CADENCE : textes dynamiques ---
      if(d.avgCadence) {
        const cad = d.avgCadence;
        const cadGap = 180 - cad;
        const cadPenaltySec = Math.round(Math.max(0, cadGap / 8));
        const cadPenaltyMin = Math.round(cadPenaltySec * 42.195 / 60);

        const cadDetail = (() => {
          if(cad >= 180) return `Cadence optimale (${cad} spm) — aucune pénalité appliquée, foulée efficace`;
          if(cad >= 175) return `Cadence légèrement sous l'optimal (${cad} spm) — pénalité minime de ${cadPenaltySec} sec/km`;
          if(cad >= 168) return `Cadence à améliorer (${cad} spm) — pénalité de ${cadPenaltySec} sec/km dans la fusion`;
          return `Cadence basse (${cad} spm) — foulée longue, pénalité de ${cadPenaltySec} sec/km appliquée`;
        })();

        const cadExplication = (() => {
          if(cad >= 180)
            return `Ta cadence est dans la zone optimale — entre 178 et 185 spm, tu minimises l'impact au sol et l'énergie gaspillée à chaque foulée. Pas de pénalité dans le calcul. Maintiens ce niveau, en particulier lors des sorties longues où la cadence tend à baisser avec la fatigue.`;
          if(cad >= 175)
            return `Tu es à ${cadGap} spm de la zone optimale (178-182 spm). À ce niveau, l'impact est faible. Pénalité de seulement ${cadPenaltySec} sec/km dans la fusion, soit ~${cadPenaltyMin} min sur le marathon. Un léger travail de conscience de foulée en EF suffirait à l'effacer.`;
          if(cad >= 168)
            return `${cad} spm : ta foulée est un peu trop longue. Chaque foulée plus longue = plus d'impact, plus de travail musculaire excentrique, plus de fatigue en fin de course. La pénalité de ${cadPenaltySec} sec/km représente ~${cadPenaltyMin} min sur le marathon. Exercice concret : compte tes foulées droites pendant 30 sec en EF — tu dois en avoir 45-47.`;
          return `${cad} spm, c'est nettement en-dessous de l'optimal. La foulée longue génère un impact au sol fort, consume plus d'énergie et augmente le risque de blessure sur les longues distances. La pénalité de ${cadPenaltySec} sec/km (${cadPenaltyMin} min sur le marathon) est significative — c'est le levier le plus actionnable de ta prédiction.`;
        })();

        const cadLevier = (() => {
          if(cad >= 180) return `Rien à changer — cadence parfaite, reste attentif en fin de longues quand la fatigue s'installe`;
          if(cad >= 175) return `+${cadGap} spm suffit : pense "petites foulées rapides" pendant 2 min en milieu d'EF`;
          const gainFull = Math.round((Math.min(cad, 178) < 178 ? (180 - cad) / 8 : 0) * 42.195 / 60);
          return `Atteindre 178 spm → économiser ~${gainFull} min · écoute un metronome à 178 bpm pendant les EF`;
        })();

        rows.push({
          icon:'👟', label:'Cadence de foulée', poids:'Correction appliquée',
          detail: cadDetail,
          explication: cadExplication,
          prediction: cad >= 178 ? '✅ Optimal' : `Pénalité −${cadPenaltySec} sec/km`,
          ecart: cad >= 178 ? '<span style="color:#3B6D11;">Aucune pénalité</span>' : '<span style="color:#E8530A;">Pénalité réduite</span>',
          levier: cadLevier
        });
      }

      let html = `<div style="background:var(--bg2);border-radius:12px;padding:12px 14px;margin-bottom:12px;">
        <p style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">🔍 Décomposition du calcul</p>
        <div style="font-size:10px;color:var(--muted);margin-bottom:10px;padding:6px 10px;background:var(--bg);border-radius:8px;line-height:1.5;">
          ${(()=>{
            const allPreds = [d.amFromEf, d.amFromTempo, d.amFromLong].filter(Boolean);
            if(allPreds.length < 2) return `Signal unique — la prédiction sera plus précise quand EF + Tempo + Longues seront tous alimentés.`;
            const spreadSec = Math.round((Math.max(...allPreds) - Math.min(...allPreds)) / 60);
            const sub4All = allPreds.every(s => s < 14400);
            const sub4None = allPreds.every(s => s >= 14400);
            if(spreadSec < 8 && sub4All)    return `Les 3 signaux convergent vers le Sub-4h ✅ — modèle très cohérent, haute confiance.`;
            if(spreadSec < 8)               return `Les 3 signaux convergent en moins de ${spreadSec} min d'écart — modèle très cohérent.`;
            if(spreadSec < 20 && sub4All)   return `Signaux bien alignés (écart max ${spreadSec} min), tous orientés Sub-4h. Résultat fusionné = <strong>moyenne pondérée</strong>.`;
            if(spreadSec < 20)              return `Bonne convergence des signaux (écart ${spreadSec} min). Résultat fusionné = <strong>moyenne pondérée</strong> des 3 sources.`;
            if(sub4All)                     return `Signaux dispersés (${spreadSec} min d'écart) mais tous en zone Sub-4h — l'objectif est accessible. Les longues réduiront cet écart.`;
            return `Écart de ${spreadSec} min entre les signaux — prédiction en cours d'affinage. Les prochaines longues sorties seront déterminantes pour réduire l'incertitude.`;
          })()}
        </div>`;

      rows.forEach(r => {
        html += `<div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px;background:var(--bg);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:5px;">
            <div>
              <span style="font-size:13px;font-weight:700;color:var(--text);">${r.icon} ${r.label}</span>
              <span style="font-size:9px;color:var(--muted);margin-left:5px;background:var(--bg2);padding:1px 5px;border-radius:6px;">${r.poids}</span>
            </div>
            <div style="text-align:right;flex-shrink:0;margin-left:8px;">
              <div style="font-size:15px;font-weight:800;color:#1B4FD8;">${r.prediction}</div>
              <div style="font-size:10px;margin-top:1px;">${r.ecart}</div>
            </div>
          </div>
          <p style="font-size:10px;color:var(--muted);margin-bottom:5px;">${r.detail}</p>
          <p style="font-size:10px;color:var(--text);margin-bottom:5px;line-height:1.4;font-style:italic;">${r.explication}</p>
          ${r.trendHtml||''}
          <div style="background:#F0F4FF;border-radius:6px;padding:4px 8px;font-size:10px;color:#1B4FD8;margin-top:4px;">💡 ${r.levier}</div>
        </div>`;
      });

      html += `<div style="border:2px solid #1B4FD8;border-radius:10px;padding:10px 12px;background:#EEF2FD;">
        ${pred.tempsStrR10 ? `
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #1B4FD830;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:11px;color:var(--muted);">📊 Modèle EF / Tempo / Longues</span>
            <span style="font-size:15px;font-weight:700;color:var(--text);">${pred.tempsStrBase}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:11px;color:var(--muted);">🏃 Record 10km × 2.15 − 1 km/h</span>
            <span style="font-size:15px;font-weight:700;color:var(--text);">${pred.tempsStrR10}</span>
          </div>
        </div>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <p style="font-size:12px;font-weight:700;color:#1B4FD8;margin-bottom:2px;">⚡ ${pred.tempsStrR10 ? 'Moyenne des 2 méthodes' : 'Résultat fusionné'}</p>
            <p style="font-size:10px;color:var(--muted);">${(()=>{
              const slopeOk = pred.tendanceSec && pred.tendanceSec < -0.3;
              const cadOk = d.avgCadence && d.avgCadence >= 175;
              const driftOk = d.cardiacDrift !== null && d.cardiacDrift !== undefined && d.cardiacDrift < 8;
              const parts = [];
              parts.push(pred.tempsStrR10 ? 'EF+Tempo+Longues + Record 10km' : 'Pondération EF+Tempo+Longues');
              if(!cadOk && d.avgCadence) parts.push(`pénalité cadence −${Math.round(Math.max(0,(180-d.avgCadence)/8))} sec/km`);
              if(slopeOk) parts.push(`bonus progression`);
              if(driftOk && d.driftPenaltySec < 0) parts.push(`bonus dérive −${Math.abs(Math.round(d.driftPenaltySec/60))} min`);
              return parts.join(' · ');
            })()}</p>
          </div>
          <div style="text-align:right;">
            <div style="font-size:20px;font-weight:800;color:var(--text);">${pred.tempsStr}</div>
            <div style="font-size:11px;font-weight:700;color:${pred.sub4hEcartSec<=0?'#3B6D11':'#E24B4A'};">${pred.sub4hEcartSec<=0?`Sub-4h ✅ (+${Math.abs(Math.round(pred.sub4hEcartSec/60))} min d'avance)`:`+${Math.round(pred.sub4hEcartSec/60)} min du Sub-4h`}</div>
          </div>
        </div>
      </div></div>`;
      return html;
    })()}

    <!-- Méthode -->
    <p style="font-size:10px;color:var(--muted);text-align:center;">${methodeNote}</p>
  </div>`;

  overlay.onclick = e => { if(e.target === overlay) closeModal(); };
  _lockBodyScroll();
  mc.appendChild(overlay);
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

function _wmoLabel(code, isDay) {
  // isDay : 1=jour, 0=nuit, undefined=utiliser l'heure locale (6h-21h = jour)
  const night = isDay === 0 || (isDay === undefined && (new Date().getHours() < 7 || new Date().getHours() >= 20));
  const labels = night ? _WMO_LABELS_NIGHT : _WMO_LABELS_DAY;
  return labels[code] || 'Conditions variables';
}

function _fcElevation(tempActuelle, humidity) {
  // Mora-Rodriguez 2010 — tableau exact :
  // Référence : TEMPÉRATURE (pas ressenti), seuil 25°C, +2 bpm par °C au-dessus de 25°C
  // On tronque (Math.floor) sans arrondir : 32.5°C → 32°C → +14 bpm
  const t = Math.floor(tempActuelle);
  if (t < 25) return 0;
  return (t - 25) * 2; // +2 bpm/°C
}

function _weatherImpact(temp, humidity, apparent) {
  // Impact chaleur — Mora-Rodriguez 2010 (J Appl Physiol)
  // Référence : chaque +1°C au-dessus de 25°C = -2% de performance à effort identique
  // 30°C = +5°C au-dessus du seuil = -10% perf ; 35°C = -20% perf
  const t = temp; // Référence : température réelle (pas ressenti) — Mora-Rodriguez
  const elevFC = _fcElevation(t, humidity || 0);
  // Zone EF ajustée : 140-148 + élévation due à la chaleur
  const zoneBas  = 140 + elevFC;
  const zoneHaut = 148 + elevFC;

  // Perte de performance Mora-Rodriguez (%) — appliquée seulement > 25°C
  const pertePerfPct = t >= 25 ? Math.min(Math.round((t - 25) * 2), 40) : 0;
  // Ralentissement allure EF à 6:00/km (360 sec/km) : -2% perf ≈ +7 sec/km
  const ralentSecKm = t >= 25 ? Math.round((t - 25) * 7) : 0;
  // Formater le ralentissement en texte lisible
  const ralentStr = ralentSecKm === 0 ? '0 sec/km'
    : ralentSecKm <= 10 ? `~${ralentSecKm} sec/km`
    : ralentSecKm <= 20 ? `${Math.round(ralentSecKm/5)*5}-${Math.round(ralentSecKm/5)*5+5} sec/km`
    : `${Math.floor(ralentSecKm/10)*10}-${Math.floor(ralentSecKm/10)*10+10} sec/km`;

  let niveau, ralentissement, conseil;
  if (t >= 35) {
    niveau = 'EXTREME'; ralentissement = ralentStr;
    conseil = "Conditions extrêmes — réduire fortement l'intensité, courir tôt le matin ou ne pas courir.";
  } else if (t >= 30) {
    niveau = 'ELEVE'; ralentissement = ralentStr;
    conseil = "Forte chaleur — allures ralenties normales, hydratation toutes les 20 min, éviter les heures chaudes.";
  } else if (t >= 25) {
    niveau = 'MODERE'; ralentissement = ralentStr;
    conseil = "Chaleur modérée — allures naturellement plus lentes, bien s'hydrater avant et pendant.";
  } else if (t >= 20 && (humidity || 0) > 75) {
    niveau = 'HUMIDE'; ralentissement = '5-10 sec/km';
    conseil = "Humidité élevée — le corps transpire mais ne refroidit pas bien, surveiller la FC.";
  } else if (t <= 0) {
    niveau = 'FROID'; ralentissement = '5-10 sec/km';
    conseil = "Froid — bien s'échauffer, couches, attention au verglas.";
  } else {
    niveau = 'IDEAL'; ralentissement = '0 sec/km';
    conseil = 'Conditions idéales pour courir.';
  }

  return {
    niveau, ralentissement, conseil,
    elevation_fc_bpm: elevFC,
    perte_perf_pct: pertePerfPct,
    ralent_sec_km: ralentSecKm,
    zone_ef_ajustee: elevFC > 0 ? `${zoneBas}-${zoneHaut} bpm` : null,
    note_fc: elevFC > 0
      ? `RÈGLE FC CHALEUR (Mora-Rodriguez) : à ${Math.round(t)}°C, la FC s'élève de +${elevFC} bpm. ` +
        `Zone EF effective = ${zoneBas}-${zoneHaut} bpm (au lieu de 140-148 bpm). ` +
        `FC effective corrigée = FC mesurée - ${elevFC} bpm. ` +
        `EXEMPLE : FC 155 bpm mesurée → FC effective ${155 - elevFC} bpm → ` +
        (155 - elevFC <= 148 ? `DANS la zone EF ✅ — NE PAS pénaliser.` : `hors zone de ${155 - elevFC - 148} bpm.`)
      : null
  };
}

let _posCache = null, _posCacheTs = 0;
let _weatherCache = null, _weatherCacheTs = 0; // cache météo 30 min
async function _getPosition() {
  // Cache mémoire 30 min — évite toute re-demande iOS dans la même session
  if (_posCache && Date.now() - _posCacheTs < 30 * 60 * 1000) return _posCache;
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    const timeout = setTimeout(() => resolve(null), 10000);
    navigator.geolocation.getCurrentPosition(
      pos => {
        clearTimeout(timeout);
        _posCache = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        _posCacheTs = Date.now();
        // Persister dans Firebase avec timestamp — valable 30 jours
        if (typeof dbRef !== 'undefined' && dbRef) {
          dbRef.child('_geo_granted').set(true).catch(()=>{});
          dbRef.child('_last_location').set({
            lat: Math.round(pos.coords.latitude*1000)/1000,
            lng: Math.round(pos.coords.longitude*1000)/1000,
            ts: Date.now()
          }).catch(()=>{});
        }
        resolve(_posCache);
      },
      () => {
        clearTimeout(timeout);
        // Basse précision (réseau/wifi) — maximumAge 60 min pour éviter re-demande
        navigator.geolocation.getCurrentPosition(
          pos => {
            _posCache = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            _posCacheTs = Date.now();
            resolve(_posCache);
          },
          () => resolve(null),
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 3600000 }
        );
      },
      // maximumAge: 30 min — iOS peut utiliser une position récente sans re-demander
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 1800000 }
    );
  });
}

async function _isGeolocationGranted() {
  // Cache mémoire (30 min)
  if (_posCache && Date.now() - _posCacheTs < 30 * 60 * 1000) return true;
  // Localisation en state local (< 30 jours) = permission accordée dans le passé
  try {
    const locRaw = state && state['_last_location'];
    if (locRaw) {
      const loc = typeof locRaw === 'string' ? JSON.parse(locRaw) : locRaw;
      if (loc && loc.lat && loc.ts && (Date.now() - loc.ts < 30 * 24 * 60 * 60 * 1000)) return true;
    }
  } catch(e) {}
  // Firebase direct
  if (typeof dbRef !== 'undefined' && dbRef) {
    try {
      const snap = await dbRef.child('_last_location').once('value');
      const loc = snap.val();
      if (loc && loc.lat && loc.ts && (Date.now() - loc.ts < 30 * 24 * 60 * 60 * 1000)) return true;
    } catch(e) {}
    try {
      const snap = await dbRef.child('_geo_granted').once('value');
      if (snap.val() === true) return true;
    } catch(e) {}
  }
  // API Permissions (Android/desktop)
  if (navigator.permissions) {
    try {
      const perm = await navigator.permissions.query({ name: 'geolocation' });
      if (perm.state === 'granted') return true;
    } catch(e) {}
  }
  return false;
}

async function fetchWeatherIfGranted(targetHourStr, targetDate) {
  // Version "silencieuse" : utilise le cache si dispo, sinon vérifie la permission
  // Cache récent (< 2h) → retourne directement sans aucune géoloc
  if (!targetHourStr && !targetDate && _weatherCache && Date.now() - _weatherCacheTs < 2 * 60 * 60 * 1000) {
    return Object.assign({}, _weatherCache, { depuis_cache: true });
  }
  // Sinon : vérifie permission sans popup
  const granted = await _isGeolocationGranted();
  if (!granted) return null;
  return fetchWeatherForContext(targetHourStr, targetDate);
}

// ── MÉTÉO ACCUEIL ─────────────────────────────────────────────────────────────
let _homeWeatherTs = 0;

async function _updateHomeWeather() {
  // Utilise fetchWeatherIfGranted : ne déclenche PAS de popup géoloc
  const loading = document.getElementById('home-weather-loading');
  if (loading) loading.style.display = 'flex';
  try {
    const meteo = await fetchWeatherIfGranted(null, null);
    if (loading) loading.style.display = 'none';
    if (!meteo) return;
    _homeWeatherTs = Date.now();
    window._lastHomeMeteo = meteo; // stocker pour le modal détail
    const strip  = document.getElementById('home-weather-strip');
    const iconEl = document.getElementById('home-weather-icon');
    const tempEl = document.getElementById('home-weather-temp');
    if (!strip || !iconEl || !tempEl) return;
    iconEl.textContent = meteo.conditions?.split(' ').pop() || '🌤️';
    tempEl.textContent = meteo.temperature.toFixed(1) + '°';
    strip.style.opacity = '0';
    strip.style.transition = 'opacity 0.5s ease';
    strip.style.display = 'flex';
    requestAnimationFrame(() => { strip.style.opacity = '1'; });
  } catch(e) {
    if (loading) loading.style.display = 'none';
  }
}

// ── MODAL DÉTAIL MÉTÉO ACCUEIL ───────────────────────────────────────────────
async function openHomeWeatherModal() {
  const mc = document.getElementById('modal-container');
  if (!mc) return;

  // Quand l'utilisateur clique explicitement → toujours récupérer la vraie position
  // et mettre à jour Firebase (corrige le bug ville Villiers-Saint-Georges)
  const tmpOverlay = document.createElement('div');
  tmpOverlay.className = 'modal-overlay';
  tmpOverlay.innerHTML = '<div class="modal-box" style="padding:32px 16px;text-align:center;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0C447C" stroke-width="2" stroke-linecap="round" style="animation:_spin 1s linear infinite;margin:0 auto 12px;display:block;"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg><p style="font-size:13px;color:#666;margin:0;">Récupération météo…</p></div>';
  mc.appendChild(tmpOverlay);

  // Tenter d'obtenir position réelle (met à jour Firebase automatiquement)
  const freshPos = await _getPosition();
  if (freshPos && dbRef) {
    try {
      const city = await _getCityFromCoords(freshPos.lat, freshPos.lng);
      await dbRef.child('_last_location').set({
        lat: Math.round(freshPos.lat*1000)/1000,
        lng: Math.round(freshPos.lng*1000)/1000,
        ville: city,
        ts: Date.now()
      });
      // Mettre à jour le state local pour fetchWeatherForContext
      if(typeof state !== 'undefined') state['_last_location'] = {
        lat: Math.round(freshPos.lat*1000)/1000,
        lng: Math.round(freshPos.lng*1000)/1000,
        ville: city,
        ts: Date.now()
      };
    } catch(e) {}
  }

  // Toujours refetcher la météo (pas de cache stale)
  window._lastHomeMeteo = null;
  const meteo = await fetchWeatherForContext(null, null);
  mc.removeChild(tmpOverlay);
  if (!meteo) return;
  window._lastHomeMeteo = meteo;

  const impactColors = { IDEAL:'#2E7D32', MODERE:'#E65100', ELEVE:'#C62828', EXTREME:'#B71C1C', HUMIDE:'#1565C0', FROID:'#37474F' };
  const impactLabels = { IDEAL:'Idéal', MODERE:'Chaleur modérée', ELEVE:'Forte chaleur', EXTREME:'Chaleur extrême', HUMIDE:'Humide', FROID:'Froid' };
  const niveau      = meteo.impact_performance?.niveau || 'IDEAL';
  const impactColor = impactColors[niveau] || '#2E7D32';
  const impactLabel = impactLabels[niveau] || niveau;
  const condIcon    = meteo.conditions?.split(' ').pop() || '🌤️';
  const elevFC      = meteo.impact_performance?.elevation_fc_bpm || 0;
  const city        = meteo.ville || 'Position actuelle';
  const now         = new Date();
  const heureStr    = now.getHours() + 'h' + String(now.getMinutes()).padStart(2,'0');
  const condTxt     = (meteo.conditions||'').replace(/\p{Emoji_Presentation}/gu,'').replace(/\p{Extended_Pictographic}/gu,'').trim();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const pertePerfPct = meteo.impact_performance?.perte_perf_pct || 0;
  const ralentSecKm  = meteo.impact_performance?.ralent_sec_km || 0;

  const fcBlock = elevFC > 0
    ? '<div style="background:#FF6F0010;border-radius:12px;padding:10px;text-align:center;"><p style="font-size:16px;margin:0 0 2px;">❤️</p><p style="font-size:15px;font-weight:700;color:#E65100;margin:0;">+' + elevFC + ' bpm</p><p style="font-size:10px;color:var(--muted);margin:2px 0 0;">FC chaleur</p></div>'
    : '<div style="background:var(--bg2);border-radius:12px;padding:10px;text-align:center;"><p style="font-size:16px;margin:0 0 2px;">🌡️</p><p style="font-size:15px;font-weight:700;color:var(--text);margin:0;">' + meteo.ressenti.toFixed(1) + '°</p><p style="font-size:10px;color:var(--muted);margin:2px 0 0;">Ressenti</p></div>';

  // Bloc Mora-Rodriguez (uniquement si > 25°C) — données exactes du tableau
  const moraBlock = pertePerfPct > 0 ? (()=>{
    const tDisplay = Math.floor(meteo.temperature); // Température réelle tronquée (32.5 → 32)
    const degAuDessus = Math.max(0, tDisplay - 25);

    // ── Allure EF dynamique (celle affichée en haut à droite de l'accueil) ──
    const _efPaceStr = getBestEfPace(); // ex: "5'39" ou "5'56"
    const _efBaseSec = _efPaceStr ? paceStrToSec(_efPaceStr.replace("'",":")) : 339; // 339s = 5'39
    // Tableau exact Mora-Rodriguez : +7 sec/km et +2 bpm par °C au-dessus de 25°C
    const _efAjusteSec = _efBaseSec + degAuDessus * 7;
    const _efAjusteMin = Math.floor(_efAjusteSec / 60);
    const _efAjusteSec2 = _efAjusteSec % 60;
    const _efAjusteStr = `${_efAjusteMin}'${String(_efAjusteSec2).padStart(2,'0')}`;
    const _fcAjustee = 148 + degAuDessus * 2; // FC cible à cet effort EF = 148 + 2/°C

    const barPct = Math.min(100, pertePerfPct * 5); // 20% perte = 100% barre
    const barColor = pertePerfPct <= 4 ? '#E65100' : pertePerfPct <= 10 ? '#C62828' : '#B71C1C';
    const minutes_perdues = Math.round(ralentSecKm * 42.195 / 60);

    // Ligne de référence base EF
    const efBaseLabel = _efPaceStr ? `Base EF (25°C) : ${_efPaceStr}/km · 148 bpm` : '';

    return `<div style="background:#FFF3E0;border-radius:14px;padding:12px 14px;margin-bottom:12px;border:1.5px solid #FF6D0030;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:14px;">🔬</span>
          <p style="font-size:11px;font-weight:700;color:#E65100;text-transform:uppercase;letter-spacing:0.05em;margin:0;">🌡️ Performance vs Météo ☀️🥵</p>
        </div>
        <span style="background:${barColor}18;border-radius:20px;padding:3px 10px;font-size:12px;font-weight:700;color:${barColor};">-${pertePerfPct}% perf</span>
      </div>

      <!-- Barre de chaleur -->
      <div style="background:rgba(0,0,0,0.06);border-radius:6px;height:7px;overflow:hidden;margin-bottom:4px;">
        <div style="height:100%;width:${barPct}%;background:linear-gradient(90deg,#FF9800,${barColor});border-radius:6px;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:9px;color:#bbb;margin-bottom:10px;">
        <span>25°C</span><span>30°C (−10%)</span><span>35°C (−20%)</span>
      </div>

      <!-- Bloc principal : allure EF + FC prédites -->
      <div style="background:white;border-radius:10px;padding:10px 12px;margin-bottom:8px;border:1.5px solid ${barColor}25;">
        <p style="font-size:9px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.04em;margin:0 0 8px;">À ${tDisplay}°C — ton EF aujourd'hui</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div style="text-align:center;">
            <p style="font-size:10px;color:var(--muted);margin:0 0 3px;">Allure EF cible</p>
            <p style="font-size:22px;font-weight:800;color:${barColor};margin:0;line-height:1;">${_efAjusteStr}</p>
            <p style="font-size:9px;color:#aaa;margin:2px 0 0;">/km · +${ralentSecKm}s vs base</p>
          </div>
          <div style="text-align:center;border-left:1px solid #f0f0f0;">
            <p style="font-size:10px;color:var(--muted);margin:0 0 3px;">FC équivalente</p>
            <p style="font-size:22px;font-weight:800;color:#E24B4A;margin:0;line-height:1;">~${_fcAjustee}</p>
            <p style="font-size:9px;color:#aaa;margin:2px 0 0;">bpm · +${degAuDessus * 2} vs 148</p>
          </div>
        </div>
        ${efBaseLabel ? `<p style="font-size:9px;color:#ccc;margin:8px 0 0;text-align:center;border-top:1px solid #f5f5f5;padding-top:6px;">${efBaseLabel}</p>` : ''}
      </div>

    </div>`;
  })() : '';

  overlay.innerHTML = '<div class="modal-box" style="max-height:90vh;overflow-y:auto;">'
    // Handle bar
    + '<div style="width:36px;height:4px;background:rgba(0,0,0,0.15);border-radius:4px;margin:12px auto 0;flex-shrink:0;"></div>'
    // Contenu avec padding correct
    + '<div style="padding:16px 20px 32px;">'
    // Header : ville + heure + bouton fermer
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:18px;">'
    +   '<div style="flex:1;min-width:0;">'
    +     '<p style="font-size:18px;font-weight:800;color:var(--text);margin:0 0 2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📍 ' + city + '</p>'
    +     '<p style="font-size:12px;color:#aaa;margin:0;">Aujourd\'hui · ' + heureStr + '</p>'
    +   '</div>'
    +   '<button onclick="_unlockBodyScroll();this.closest(\'.modal-overlay\').remove()" style="background:var(--bg2);border:1px solid var(--border);cursor:pointer;color:var(--muted);font-size:18px;line-height:1;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">×</button>'
    + '</div>'
    + '<div style="display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,#EDF2FB,#dce8f8);border-radius:16px;padding:16px 18px;margin-bottom:12px;">'
    +   '<div style="display:flex;align-items:center;gap:12px;">'
    +     '<span style="font-size:48px;line-height:1;">' + condIcon + '</span>'
    +     '<div><p style="font-size:42px;font-weight:800;color:#0C447C;margin:0;line-height:1;">' + meteo.temperature.toFixed(1) + '°</p>'
    +     '<p style="font-size:12px;color:#6B8DB5;margin:4px 0 0;">Ressenti <b>' + meteo.ressenti.toFixed(1) + '°C</b></p></div>'
    +   '</div>'
    +   '<div style="text-align:right;">'
    +     '<p style="font-size:13px;color:#0C447C;font-weight:600;margin:0 0 4px;">' + condTxt + '</p>'
    +     '<span style="background:' + impactColor + '18;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:700;color:' + impactColor + ';">' + impactLabel + '</span>'
    +   '</div>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px;">'
    +   '<div style="background:var(--bg2);border-radius:12px;padding:10px;text-align:center;"><p style="font-size:18px;margin:0 0 2px;">💧</p><p style="font-size:15px;font-weight:700;color:var(--text);margin:0;">' + meteo.humidite + '%</p><p style="font-size:10px;color:var(--muted);margin:2px 0 0;">Humidité</p></div>'
    +   '<div style="background:var(--bg2);border-radius:12px;padding:10px;text-align:center;"><p style="font-size:18px;margin:0 0 2px;">💨</p><p style="font-size:15px;font-weight:700;color:var(--text);margin:0;">' + meteo.vent_kmh + '</p><p style="font-size:10px;color:var(--muted);margin:2px 0 0;">km/h vent</p></div>'
    +   fcBlock
    + '</div>'
    + moraBlock
    + '<div id="weather-coach-section" style="border-radius:14px;overflow:hidden;">'
    +   '<button onclick="_triggerWeatherCoachAdvice()" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 16px;background:' + impactColor + '12;border:1.5px solid ' + impactColor + '30;border-radius:14px;cursor:pointer;">'
    +     '<span style="font-size:16px;">🤖</span>'
    +     '<span style="font-size:13px;font-weight:600;color:' + impactColor + ';">Conseils Coach IA</span>'
    +     '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + impactColor + '" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>'
    +   '</button>'
    +   '<div id="weather-coach-advice" style="display:none;"></div>'
    + '</div>'
    + '</div>' // ferme padding wrapper
    + '</div>'; // ferme modal-box

  overlay.onclick = e => { if (e.target === overlay) { _unlockBodyScroll(); overlay.remove(); } };
  _lockBodyScroll();
  mc.appendChild(overlay);
  const box = overlay.querySelector('.modal-box');
  box.style.opacity = '0';
  box.style.transition = 'opacity 0.25s ease';
  requestAnimationFrame(() => { box.style.opacity = '1'; });

}

function _triggerWeatherCoachAdvice() {
  const btn = document.querySelector('#weather-coach-section button');
  const div = document.getElementById('weather-coach-advice');
  if (!div || !btn) return;
  // Afficher le div, cacher le bouton, lancer la génération
  btn.style.display = 'none';
  div.style.display = 'block';
  div.innerHTML = '<div style="padding:14px 16px;background:rgba(12,68,124,0.05);border:1.5px solid rgba(12,68,124,0.15);border-radius:14px;margin-top:2px;"><div class="coach-typing"><span>Le Coach analyse la météo</span><div class="coach-typing-dots"><i></i><i></i><i></i></div></div></div>';
  // Récupérer la météo stockée
  const meteo = window._lastHomeMeteo;
  const impactColors = { IDEAL:"#2E7D32", MODERE:"#E65100", ELEVE:"#C62828", EXTREME:"#B71C1C", HUMIDE:"#1565C0", FROID:"#37474F" };
  const impactColor = impactColors[meteo?.impact_performance?.niveau || 'IDEAL'] || '#2E7D32';
  _fetchWeatherCoachAdvice(meteo, impactColor);
}

async function _fetchWeatherCoachAdvice(meteo, impactColor) {
  const adviceEl = document.getElementById('weather-coach-advice');
  if (!adviceEl) return;

  // Construire le contexte COMPLET comme pour coachChat normal
  const now = new Date();
  const joursSemaine = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const joursNoms = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  const moisNoms = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const heureActuelle = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  const jourActuel = joursSemaine[now.getDay()];
  const jourActuelLower = joursNoms[now.getDay()];
  const todayDayNum = now.getDay() === 0 ? 7 : now.getDay();
  const dateStr = jourActuelLower + ' ' + now.getDate() + ' ' + moisNoms[now.getMonth()] + ' ' + now.getFullYear();

  // Séances du jour
  const seancesAujourdhui = [];
  getOrderedWeekSessions(CW).forEach(({s, si, extra, ei}) => {
    if (extra) {
      // Séances extra : lire sched_day directement sur l'objet extra
      const done = !!state[`extra_w${CW}_s${ei}_done`];
      if(done) return;
      if(s.sched_day === todayDayNum)
        seancesAujourdhui.push({type: s.type, titre: s.d.split('|')[0], km: s.km, heure: s.sched_time||null});
      return;
    }
    const edRaw = state['edit_w' + CW + '_s' + si];
    if (!edRaw) return;
    const ed = JSON.parse(edRaw);
    if (ed.sched_day === todayDayNum && !state[gk(CW, si) + 'done'])
      seancesAujourdhui.push({type: ed.type||s.type, titre: ed.d ? ed.d.split('|')[0] : s.d.split('|')[0], km: ed.km||s.km, heure: ed.sched_time||null});
  });

  // Mémos coach
  let coachMemos = '';
  try { const ms = await dbRef.child('_coach_memos').once('value'); coachMemos = ms.val() || ''; } catch(e) {}

  // Contexte compact complet (plan, nutrition, progression, FC repos...)
  const compactCtx = buildCompactContext(coachMemos, seancesAujourdhui, jourActuel, heureActuelle);

  // Prochaines séances
  const seancesAVenir = [];
  const joursC = ['','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  const tDow = todayDayNum;
  getOrderedWeekSessions(CW).forEach(({s, si, extra, ei}) => {
    if (seancesAVenir.length >= 3) return;
    const done = extra ? !!state['extra_w'+CW+'_s'+ei+'_done'] : !!state[gk(CW,si)+'done'];
    if (done) return;
    const edRaw = !extra && state['edit_w'+CW+'_s'+si];
    const ed = edRaw ? JSON.parse(edRaw) : null;
    const titre = ed ? ed.d.split('|')[0] : s.d.split('|')[0];
    const type = ed ? ed.type : s.type;
    const km = ed ? ed.km : s.km;
    const jourC = ed && ed.sched_day ? joursC[ed.sched_day] : '';
    const heure = ed && ed.sched_time ? ed.sched_time : '';
    seancesAVenir.push({type, titre, km, quand: jourC + (heure ? ' à ' + heure : '')});
  });

  const elevFC = meteo.impact_performance?.elevation_fc_bpm || 0;

  const stateContext = Object.assign({}, compactCtx, {
    date_reelle: { complet: dateStr, jour: jourActuelLower, numero: now.getDate(), mois: moisNoms[now.getMonth()], heure: heureActuelle },
    seances_a_venir: seancesAVenir,
    meteo_actuelle: meteo,
  });

  const msg = 'Météo : ' + Math.round(meteo.temperature) + '°C (ressenti ' + Math.round(meteo.ressenti) + '°C), '
    + meteo.humidite + '% humidité, ' + meteo.conditions
    + (elevFC > 0 ? '. FC +' + elevFC + ' bpm attendus.' : '.')
    + (seancesAujourdhui.length > 0
      ? ' Séance : ' + seancesAujourdhui.map(s => s.titre + ' ' + s.km + 'km' + (s.heure ? ' à ' + s.heure : '')).join(' + ') + '.'
      : ' Pas de séance planifiée.')
    + ' Donne 3 conseils courts et concrets pour courir dans ces conditions.';

  try {
    const resp = await fetch('https://us-central1-prepa-marathon.cloudfunctions.net/coachChat', {
      method: 'POST',
      headers: await authHeaders(true),
      body: JSON.stringify({ message: msg, history: [], stateContext, responseMode: 'meteo' })
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);

    // Lire tout le stream sans affichage intermédiaire
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let full = '', buf = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const d = line.slice(6).trim();
        if (d === '[DONE]') continue;
        try { const p = JSON.parse(d); if (p.token) full += p.token; } catch(e2) {}
      }
    }

    // Afficher tout d'un coup avec un fade-in
    const el = document.getElementById('weather-coach-advice');
    if (!el) return;
    const html = full ? renderCoachText(fixAccents(cleanTruncated(full))) : '<span style="color:#aaa;font-style:italic;">Pas de conseil disponible.</span>';
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.4s ease';
    el.innerHTML = '<div style="padding:14px 16px;background:rgba(12,68,124,0.05);border:1.5px solid rgba(12,68,124,0.15);border-radius:14px;margin-top:2px;font-size:13px;color:var(--text);line-height:1.7;">' + html + '</div>';
    requestAnimationFrame(() => { el.style.opacity = '1'; });

  } catch(e) {
    const el = document.getElementById('weather-coach-advice');
    if (el) el.innerHTML = '<span style="color:#aaa;font-style:italic;">Conseil indisponible — vérifie ta connexion.</span>';
  }
}



// ── MAJ AUTOMATIQUE LOCALISATION ────────────────────────────────────────────
let _lastAutoLocTs = 0;

async function _autoUpdateLocation() {
  // Mettre à jour la position au maximum une fois par semaine
  // (et seulement si la permission a déjà été accordée)
  if (Date.now() - _lastAutoLocTs < 7 * 24 * 60 * 60 * 1000) return;

  // Vérifier via Firebase si une localisation récente existe déjà (< 7 jours)
  if (typeof dbRef !== 'undefined' && dbRef) {
    try {
      const snap = await dbRef.child('_last_location').once('value');
      const loc = snap.val();
      if (loc && loc.ts && (Date.now() - loc.ts < 7 * 24 * 60 * 60 * 1000)) {
        _lastAutoLocTs = Date.now();
        return; // Position récente en Firebase — pas besoin de re-demander
      }
    } catch(e) {}
  }

  const granted = await _isGeolocationGranted();
  if (!granted) return;
  try {
    const pos = await _getPosition();
    if (!pos || !dbRef) return;
    const city = await _getCityFromCoords(pos.lat, pos.lng);
    await dbRef.child('_last_location').set({
      lat: Math.round(pos.lat*1000)/1000,
      lng: Math.round(pos.lng*1000)/1000,
      ville: city,
      ts: Date.now()
    });
    _lastAutoLocTs = Date.now();
  } catch(e) {}
}

// ── FETCH AUTO MÉTÉO HISTORIQUE ─────────────────────────────────────────────
// Récupère la vraie météo depuis Open-Meteo archive pour toutes les séances
// passées qui n'ont pas encore de météo — s'exécute depuis le navigateur client
async function autoFetchMissingMeteo() {
  // Ne tourner qu'une fois par session
  if (window._meteoAutoFetchDone) return;
  window._meteoAutoFetchDone = true;

  // ── Localisation des séances rétroactives ─────────────────────────────────
  // Pour les séances passées sans météo (validées sans appuyer sur le bouton météo),
  // on ne connaît pas le lieu exact. Paris est utilisé comme défaut.
  // Pour les nouvelles validations : le bouton météo capture le GPS précis au moment de la séance.
  function _getLocForDate(_date) {
    return { lat: 48.8566, lng: 2.3522, ville: 'Paris' };
  }

  // Collecter les séances passées SANS météo, avec une date connue
  const missing = [];
  for (let ws = 1; ws <= CW; ws++) {
    weeks[ws-1].sessions.forEach((sess, si) => {
      const k = gk(ws, si);
      if (!state[k + 'done']) return;
      const perfRaw = state[k + 'perf'];
      if (!perfRaw) return;
      let perf = {};
      try { perf = typeof perfRaw === 'string' ? JSON.parse(perfRaw) : perfRaw; } catch(e) { return; }
      if (!perf.date || perf.meteo) return; // déjà une météo ou pas de date
      // Heure de la séance depuis les edits
      const edRaw = state['edit_w' + ws + '_s' + si];
      const ed = edRaw ? (typeof edRaw === 'string' ? JSON.parse(edRaw) : edRaw) : null;
      const heureStr = ed && ed.sched_time ? ed.sched_time : '10:00'; // défaut 10h
      const loc = _getLocForDate(perf.date);
      // Surcharge ville pour séances connues (lieu précis mémorisé)
      let villeOverride = null;
      if (perf.date === '2026-05-26') villeOverride = 'Porte de Seine';
      missing.push({ ws, si, k, perf, date: perf.date, heure: heureStr, lat: loc.lat, lng: loc.lng, ville: villeOverride || loc.ville });
    });
  }

  if (missing.length === 0) return;

  // Grouper par date pour minimiser les requêtes API
  const byDate = {};
  missing.forEach(m => {
    if (!byDate[m.date]) byDate[m.date] = [];
    byDate[m.date].push(m);
  });

  for (const [date, sessions] of Object.entries(byDate)) {
    const today = new Date().toISOString().slice(0, 10);
    if (date > today) continue; // pas de données future

    // Localisation pour cette date (toutes les sessions du même jour ont la même loc)
    const loc = _getLocForDate(date);
    const lat = loc.lat, lng = loc.lng;

    try {
      // Utiliser l'API historique (past_days) ou archive selon l'ancienneté
      const diffDays = Math.round((new Date(today) - new Date(date)) / 86400000);
      let url;
      if (diffDays <= 92) {
        // Dans les 3 mois : forecast avec past_days
        url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&timezone=auto&past_days=${Math.min(diffDays + 1, 92)}&forecast_days=1`;
      } else {
        // Plus ancien : archive
        url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${date}&end_date=${date}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`;
      }

      const resp = await fetch(url, { credentials: 'omit', cache: 'no-store', mode: 'cors' });
      if (!resp.ok) continue;
      const data = await resp.json();
      const h = data.hourly;
      if (!h || !h.temperature_2m) continue;

      // Pour chaque session ce jour-là, injecter la météo
      for (const sess of sessions) {
        const targetH = parseInt(sess.heure.split(':')[0]);
        // Trouver l'index de l'heure dans le tableau (peut ne pas commencer à 0)
        let idx = targetH;
        if (data.hourly.time) {
          const timeArr = data.hourly.time;
          // Chercher l'index correspondant à cette date + heure
          const target = date + 'T' + String(targetH).padStart(2,'0') + ':00';
          const foundIdx = timeArr.findIndex(t => t === target);
          if (foundIdx >= 0) idx = foundIdx;
        }

        const temp = h.temperature_2m?.[idx];
        const apparent = h.apparent_temperature?.[idx];
        const humidity = h.relative_humidity_2m?.[idx];
        const weatherCode = h.weather_code?.[idx];
        const windSpeed = h.wind_speed_10m?.[idx];
        const isDay = h.is_day?.[idx] ?? 1;

        if (temp == null) continue;

        // Ville connue selon la date (pas besoin de reverse geocoding)
        const ville = loc.ville || null;

        const impact = _weatherImpact(temp, humidity, apparent);
        const meteo = {
          date: date,
          heure_cible: sess.heure,
          ville: ville || null,
          temperature: Math.round(temp * 10) / 10,
          ressenti: Math.round((apparent || temp) * 10) / 10,
          humidite: Math.round(humidity || 0),
          vent_kmh: Math.round((windSpeed || 0) * 10) / 10,
          conditions: _wmoLabel(weatherCode, isDay),
          impact_performance: impact,
          note: `MÉTÉO${ville ? ' à ' + ville : ''} : ${Math.round(temp)}°C (ressenti ${Math.round(apparent||temp)}°C), ${Math.round(humidity||0)}% humidité.` +
                (impact.elevation_fc_bpm > 0 ? ` FC effective = FC mesurée - ${impact.elevation_fc_bpm} bpm.` : '') +
                (impact.perte_perf_pct > 0 ? ` Perte perf Mora-Rodriguez : -${impact.perte_perf_pct}%.` : ' Conditions idéales.')
        };

        // Sauvegarder dans state + Firebase
        const updated = { ...sess.perf, meteo };
        state[sess.k + 'perf'] = JSON.stringify(updated);
        if (dbRef) dbRef.child(sess.k + 'perf').set(state[sess.k + 'perf']).catch(() => {});

        console.log(`[AutoMeteo] ${date} ${sess.heure} → ${temp}°C ressenti ${apparent}°C (${impact.niveau})`);
      }

    } catch (e) {
      console.warn('[AutoMeteo] Erreur pour', date, e.message);
    }

    // Petite pause entre les requêtes
    await new Promise(r => setTimeout(r, 300));
  }
}

async function fetchWeatherForContext(targetHourStr, targetDate) {
  try {
    // ── Position : priorité absolue au cache Firebase (30 jours) ──────────────
    // Ne jamais appeler _getPosition() automatiquement — seulement si l'utilisateur
    // a cliqué sur un bouton Météo explicite (importMeteoValidation, openHomeWeatherModal)
    let pos = null;

    // 1. Cache mémoire (30 min)
    if (_posCache && Date.now() - _posCacheTs < 30 * 60 * 1000) {
      pos = _posCache;
    }

    // 2. State local (chargé au démarrage depuis Firebase)
    if (!pos) {
      try {
        const locRaw = state && state['_last_location'];
        if (locRaw) {
          const loc = typeof locRaw === 'string' ? JSON.parse(locRaw) : locRaw;
          // TTL : 30 jours (on se déplace peu — Paris reste Paris)
          if (loc && loc.lat && loc.ts && (Date.now() - loc.ts < 30 * 24 * 60 * 60 * 1000)) {
            pos = { lat: loc.lat, lng: loc.lng };
          }
        }
      } catch(e) {}
    }

    // 3. Firebase direct (si state pas encore chargé)
    if (!pos && typeof dbRef !== 'undefined' && dbRef) {
      try {
        const snap = await dbRef.child('_last_location').once('value');
        const loc = snap.val();
        if (loc && loc.lat && loc.ts && (Date.now() - loc.ts < 30 * 24 * 60 * 60 * 1000)) {
          pos = { lat: loc.lat, lng: loc.lng };
        }
      } catch(e) {}
    }

    // 4. Fallback Paris — JAMAIS de popup géoloc automatique
    if (!pos) pos = { lat: 48.8417, lng: 2.2945 };

    const { lat, lng } = pos;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const dateStr = targetDate || todayStr;
    const isToday = (dateStr === todayStr);
    const isPast = (dateStr < todayStr);

    // Heure cible (entier 0-23)
    let targetH;
    if (targetHourStr) {
      targetH = parseInt(targetHourStr.split(':')[0]);
    } else {
      targetH = now.getHours();
    }

    let temp, humidity, apparent, weatherCode, windSpeed, isDay = 1;

    if (isPast) {
      // API historique pour les séances validées en décalé
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`;
      let _toId;
      const _timeoutP = new Promise((_,rej) => { _toId = setTimeout(() => rej(new Error('timeout')), 15000); });
      const r = await Promise.race([fetch(url, {credentials:'omit', cache:'no-store', mode:'cors'}), _timeoutP]);
      clearTimeout(_toId);
      const d = await r.json();
      if (!d.hourly) return null;
      temp       = d.hourly.temperature_2m?.[targetH];
      humidity   = d.hourly.relative_humidity_2m?.[targetH];
      apparent   = d.hourly.apparent_temperature?.[targetH];
      weatherCode= d.hourly.weather_code?.[targetH];
      windSpeed  = d.hourly.wind_speed_10m?.[targetH];
    } else if (isToday && !targetHourStr) {
      // Temps réel : endpoint "current" pour la température exacte maintenant
      // (évite le bug de l'index horaire qui donne la valeur du début de l'heure)
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&timezone=auto`;
      let _toId;
      const _timeoutP = new Promise((_,rej) => { _toId = setTimeout(() => rej(new Error('timeout')), 15000); });
      const r = await Promise.race([fetch(url, {credentials:'omit', cache:'no-store', mode:'cors'}), _timeoutP]);
      clearTimeout(_toId);
      const d = await r.json();
      if (!d.current) return null;
      temp        = d.current.temperature_2m;
      humidity    = d.current.relative_humidity_2m;
      apparent    = d.current.apparent_temperature;
      weatherCode = d.current.weather_code;
      windSpeed   = d.current.wind_speed_10m;
      isDay       = d.current.is_day ?? ((new Date().getHours() >= 7 && new Date().getHours() < 21) ? 1 : 0); // 1=jour, 0=nuit
    } else {
      // Prévision horaire : pour les séances planifiées (brief matin, notif)
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto&forecast_days=2`;
      let _toId;
      const _timeoutP = new Promise((_,rej) => { _toId = setTimeout(() => rej(new Error('timeout')), 15000); });
      const r = await Promise.race([fetch(url, {credentials:'omit', cache:'no-store', mode:'cors'}), _timeoutP]);
      clearTimeout(_toId);
      const d = await r.json();
      if (!d.hourly) return null;
      const idx = isToday ? targetH : 24 + targetH;
      temp        = d.hourly.temperature_2m?.[idx];
      humidity    = d.hourly.relative_humidity_2m?.[idx];
      apparent    = d.hourly.apparent_temperature?.[idx];
      weatherCode = d.hourly.weather_code?.[idx];
      windSpeed   = d.hourly.wind_speed_10m?.[idx];
    }

    if (temp == null) return null;

    // Reverse geocoding pour avoir la ville (non bloquant)
    let ville = null;
    try { ville = await _getCityFromCoords(lat, lng); } catch(e) {}

    const impact = _weatherImpact(temp, humidity, apparent);
    const _result = {
      date: dateStr,
      heure_cible: targetHourStr ? (targetH + 'h00') : 'maintenant',
      ville: ville || null,
      temperature: Math.round(temp * 10) / 10,
      ressenti: Math.round((apparent || temp) * 10) / 10,
      humidite: Math.round(humidity || 0),
      vent_kmh: Math.round((windSpeed || 0) * 10) / 10,  // Open-Meteo retourne déjà km/h
      conditions: _wmoLabel(weatherCode, isDay),
      impact_performance: impact,
      note_meteo: `MÉTÉO${ville ? ' — ' + ville : ''} : ${Math.round(temp)}°C (ressenti ${Math.round(apparent||temp)}°C), ${Math.round(humidity||0)}% humidité, ${_wmoLabel(weatherCode)}.`,
      note_allures: `PLANNING CHALEUR : à ${Math.round(apparent||temp)}°C ressenti, un coureur perd environ ${impact.ralentissement} vs ses allures par temps frais. ` +
                    `ATTENTION : ce chiffre est une estimation de planification, PAS la différence entre l'allure réalisée et l'allure cible. ` +
                    `La vraie différence allure réalisée vs cible doit TOUJOURS être calculée directement depuis les chiffres fournis (allure_réalisée - allure_cible en secondes). ` +
                    `Ne JAMAIS écrire "tu es X sec/km plus lent que ta cible" en utilisant la valeur ${impact.ralentissement}.`,
      note_fc: impact.note_fc || null,
      note: `MÉTÉO${ville ? ' à ' + ville : ''} : ${Math.round(temp)}°C (ressenti ${Math.round(apparent||temp)}°C), ${Math.round(humidity||0)}% humidité. ` +
            (impact.elevation_fc_bpm > 0
              ? `IMPACT FC : +${impact.elevation_fc_bpm} bpm attendus → zone EF effective ${impact.zone_ef_ajustee}. ` +
                `FC effective = FC mesurée - ${impact.elevation_fc_bpm} bpm. NE JAMAIS critiquer une FC > 148 bpm sans appliquer cette correction. `
              : '') +
            `CONTEXTE CHALEUR : ralentissement attendu vs conditions fraîches = ${impact.ralentissement} (estimation planning uniquement). ` +
            `RÈGLE ABSOLUE : pour comparer l'allure réalisée avec l'allure cible, utiliser UNIQUEMENT les secondes réelles des deux allures — jamais la fourchette ci-dessus. ` +
            impact.conseil
    };
    // Mettre en cache la météo (30 min) pour usage hors réseau
    _weatherCache = _result;
    _weatherCacheTs = Date.now();
    return _result;
  } catch(e) {
    // Plan B : essayer wttr.in (API météo alternative, si open-meteo bloqué)
    try {
      const pos2 = _posCache || { lat: 48.8417, lng: 2.2945 };
      const r2 = await fetch(`https://wttr.in/${pos2.lat},${pos2.lng}?format=j1`, {credentials:'omit',cache:'no-store',mode:'cors'});
      if (r2.ok) {
        const d2 = await r2.json();
        const cc = d2.current_condition?.[0];
        if (cc) {
          const temp2 = parseFloat(cc.temp_C);
          const feels2 = parseFloat(cc.FeelsLikeC);
          const hum2 = parseFloat(cc.humidity);
          const wind2 = parseFloat(cc.windspeedKmph);
          const wcode2 = parseInt(cc.weatherCode);
          const isNight = (new Date().getHours() >= 21 || new Date().getHours() < 6);
          // Table complète wttr.in → WMO (les codes wttr.in ≠ codes WMO)
          const _wttrToWmo = {113:0,116:2,119:3,122:3,143:45,176:80,179:71,182:77,185:51,200:95,227:71,230:75,248:45,260:48,263:51,266:53,281:55,284:55,293:61,296:61,299:63,302:65,305:65,308:65,311:77,314:77,317:77,320:73,323:71,326:71,329:73,332:73,335:75,338:75,350:77,353:80,356:81,359:82,362:80,365:80,368:71,371:71,374:77,377:77,386:95,389:95,392:96,395:99};
          const wmoCode2 = _wttrToWmo[wcode2] ?? 0;
          const cond2 = _wmoLabel(wmoCode2, isNight ? 0 : 1);
          const impact2 = _weatherImpact(temp2, hum2, feels2);
          const res2 = { date: new Date().toISOString().slice(0,10), heure_cible:'maintenant', ville: null,
            temperature: Math.round(temp2*10)/10, ressenti: Math.round(feels2*10)/10,
            humidite: Math.round(hum2), vent_kmh: Math.round(wind2*10)/10,
            conditions: cond2, impact_performance: impact2 };
          _weatherCache = res2; _weatherCacheTs = Date.now();
          return res2;
        }
      }
    } catch(e2) { /* wttr.in aussi indispo */ }
    // Cache si récent (< 2h)
    if (_weatherCache && Date.now() - _weatherCacheTs < 2 * 60 * 60 * 1000) {
      return Object.assign({}, _weatherCache, { depuis_cache: true });
    }
    return null;
  }
}


function calcWeekDoneKm(){
  let t=0;
  getOrderedWeekSessions(CW).forEach(({s,si,extra,ei})=>{
    if(extra){
      const k=`extra_w${CW}_s${ei}`;
      if(state[k+'_done']){const rv=state[k+'_km'];t+=(rv!=null?rv:s.km);}
      return;
    }
    const dn=state[gk(CW,si)+'done'],rv=state[gk(CW,si)+'km'];
    if(dn) t+=(rv!=null?rv:s.km);
  });
  return Math.round(t*10)/10;
}

function calcTotalDone(){
  // Pour les athlètes : seulement les km de leurs séances extra validées
  if(!isAdmin()){
    let t=0;
    for(let ws=1;ws<=52;ws++){
      let ei=0;
      while(state[`extra_w${ws}_s${ei}`]){
        if(state[`extra_w${ws}_s${ei}_done`]){
          const rv=state[`extra_w${ws}_s${ei}_km`];
          try{t+=rv!=null?parseFloat(rv):(parseFloat(JSON.parse(state[`extra_w${ws}_s${ei}`]).km)||0);}catch(e){}
        }
        ei++;
      }
    }
    return Math.round(t);
  }
  // Base = km historiques avant le début du tracking dans l'app
  let kmBase = 0;
  if(state['_km_historique'] != null) {
    kmBase = parseFloat(state['_km_historique']);
  } else {
    kmBase = KM_HISTORIQUE_BASE; // 243 km au 04/05/2026
  }
  const FIRST_TRACKED_WEEK = 9;
  let t = kmBase;
  for(let ws = FIRST_TRACKED_WEEK; ws <= CW; ws++){
    if(!weeks[ws-1]) continue;
    getOrderedWeekSessions(ws).forEach(({s,si,extra,ei})=>{
      if(extra){
        const k=`extra_w${ws}_s${ei}`;
        if(state[k+'_done']){const rv=state[k+'_km'];t+=(rv!=null?parseFloat(rv):s.km);}
        return;
      }
      const dn=state[gk(ws,si)+'done'], rv=state[gk(ws,si)+'km'];
      if(dn||rv!=null) t+=(rv!=null?parseFloat(rv):s.km);
    });
  }
  return Math.round(t);
}

function getNbSeries(seriesStr){
  const m = seriesStr.match(/^(\d+)/);
  return m ? parseInt(m[1]) : 3;
}

// Formate un temps cible "H:MM:SS" ou "MM:SS" en affichage court 4 chiffres
// Avec heures → "XhMM" (ex: "2h58"), sans heures → "MM:SS" (ex: "43:24")
function formatTargetTime(t){
  if(!t) return '—';
  const parts=t.split(':').map(Number);
  let h,m,s;
  if(parts.length===3){h=parts[0];m=parts[1];s=parts[2];}
  else if(parts.length===2){h=0;m=parts[0];s=parts[1];}
  else return t;
  if(h>0) return h+'h'+(m<10?'0':'')+m;
  return m+':'+(s<10?'0':'')+s;
}


function openRenfoSchedModal(r, targetWeek){
  const tw = targetWeek || CW;
  const key = rfk(tw,r)+'sched';
  const existing = state[key] ? JSON.parse(state[key]) : {};
  const renfoNames = ['','Ischio-fessiers','Bas du dos'];
  const renfoSubs  = ['','Fémoro-patellaire · 6 exos','Core stabilisation · 5 exos'];
  const name = renfoNames[r] || 'Renforcement';
  const sub  = renfoSubs[r]  || '';
  const isNextWeek = tw !== CW;
  const weekLabel = isNextWeek ? `S${tw} · Planification` : `S${tw} · Modifier le créneau`;

  // ── Champs jour ──
  const days = ['','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  const dayEmojis = ['','😴','💪','🔥','💪','🏃','🏔','😴'];
  const selDay = existing.day || '';
  const dayOpts = days.map((d,i) => i===0
    ? `<option value="">Choisir...</option>`
    : `<option value="${i}" ${selDay==i?'selected':''}>${dayEmojis[i]} ${d}</option>`
  ).join('');

  // ── Champs heure ──
  const tp = (existing.time||'08:00').split(':');
  const selH = parseInt(tp[0])||8;
  const selM = parseInt(tp[1])||0;
  const hourOpts = Array.from({length:24},(_,i)=>`<option value="${i}" ${selH===i?'selected':''}>${String(i).padStart(2,'0')}h</option>`).join('');
  const minOpts  = ['00','15','30','45'].map(m=>`<option value="${m}" ${String(selM).padStart(2,'0')===m?'selected':''}>${m}</option>`).join('');

  const mc = document.getElementById('modal-container');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.setProperty('--_overlay-bg','rgba(0,0,0,0.4)');

  overlay.innerHTML = `<div class="modal-box" style="max-height:92vh;">

    <!-- HEADER — même style que modal edit séance -->
    <div style="background:linear-gradient(145deg,#082050 0%,#0C447C 55%,#1560A8 100%);padding:16px 16px 18px;border-radius:24px 24px 0 0;flex-shrink:0;">
      <!-- Handle bar -->
      <div style="width:36px;height:4px;border-radius:4px;background:rgba(255,255,255,0.3);margin:0 auto 12px;"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div style="flex:1;min-width:0;">
          <p style="font-size:10px;font-weight:800;opacity:0.7;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:3px;color:#fff;">💪 ${weekLabel}</p>
          <p style="font-size:22px;font-weight:900;letter-spacing:-0.03em;line-height:1.1;color:#fff;">${name}</p>
          ${sub ? `<p style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:4px;font-weight:500;">${sub}</p>` : ''}
        </div>
        <button onclick="closeModal()" style="background:rgba(255,255,255,0.2);border:none;cursor:pointer;color:#fff;font-size:18px;line-height:1;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;">×</button>
      </div>
    </div>

    <!-- BODY scrollable -->
    <div class="modal-scroll-body">
    <div class="modal-body" style="gap:0;">

      <!-- Section planification -->
      <div class="modal-section" style="background:linear-gradient(135deg,#EEF2FD,#E8EDFF);">
        <div class="modal-section-label" style="color:#1B4FD8;">📅 Planification</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <p style="font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:7px;">📆 Jour</p>
            <select id="rf-sched-day" style="background:var(--bg);border:2px solid var(--border);border-radius:12px;padding:11px 12px;font-size:14px;font-weight:700;color:var(--text);width:100%;outline:none;cursor:pointer;">${dayOpts}</select>
          </div>
          <div>
            <p style="font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:7px;">⏰ Heure</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
              <select id="rf-sched-hour" style="background:var(--bg);border:2px solid var(--border);border-radius:12px;padding:11px 8px;font-size:14px;font-weight:700;color:var(--text);width:100%;outline:none;text-align:center;cursor:pointer;">${hourOpts}</select>
              <select id="rf-sched-min"  style="background:var(--bg);border:2px solid var(--border);border-radius:12px;padding:11px 8px;font-size:14px;font-weight:700;color:var(--text);width:100%;outline:none;text-align:center;cursor:pointer;">${minOpts}</select>
            </div>
          </div>
        </div>
      </div>

      <!-- Boutons action -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px;">
        <button onclick="clearRenfoSched(${r})" style="padding:14px;background:var(--bg2);border:2px solid var(--border);border-radius:14px;font-size:13px;font-weight:700;color:var(--muted);cursor:pointer;">↺ Effacer</button>
        <button onclick="saveRenfoSched(${r},${tw})" class="modal-btn-primary" style="background:#0C447C;">Enregistrer ✓</button>
      </div>

    </div>
    </div><!-- /modal-scroll-body -->
  </div>`;

  overlay.onclick = e => { if(e.target===overlay) closeModal(); };
  _lockBodyScroll();
  mc.appendChild(overlay);
  _initSwipeToDismiss(overlay, overlay.querySelector('.modal-box'));
}

function saveRenfoSched(r, targetWeek){
  const tw = targetWeek || CW;
  const day=parseInt(document.getElementById('rf-sched-day').value)||null;
  const rfH=document.getElementById('rf-sched-hour')?document.getElementById('rf-sched-hour').value:'08';
  const rfM=document.getElementById('rf-sched-min')?document.getElementById('rf-sched-min').value:'00';
  const time=day?(String(rfH).padStart(2,'0')+':'+String(rfM).padStart(2,'0')):null;
  if(day||time){
    state[rfk(tw,r)+'sched']=JSON.stringify({day:day||undefined,time:time||undefined});
  } else {
    delete state[rfk(tw,r)+'sched'];
  }
  save();
  closeModal();
  renderHome();
}

function clearRenfoSched(r){
  delete state[rfk(CW,r)+'sched'];
  save();
  closeModal();
  renderHome();
}
// ── BADGE ALERTE COACH ────────────────────────────────────────────────────────
function checkCoachAlerts(){
  // Badge supprimé définitivement
  const badge = document.getElementById('coach-alert-badge');
  if(badge) badge.style.display = 'none';
}

function setCoachUnread(){
  // Badge supprimé — plus de point rouge sur le coach
  // window._coachHasUnread = true;
  // if(dbRef) dbRef.child('_coach_unread').set(true);
}

async function checkCoachUnread(){
  // Badge supprimé définitivement — cette fonction ne fait plus rien
  const badge = document.getElementById('coach-alert-badge');
  if(badge) badge.style.display = 'none';
  window._coachHasUnread = false;
}

// Re-vérifier le badge quand l'utilisateur revient sur l'app (depuis l'arrière-plan)
document.addEventListener('visibilitychange', function(){
  if(document.visibilityState === 'visible' && dbRef) {
    checkCoachUnread();
  }
});

function renderHome(){
  const w = homeViewWeek; // semaine affichée (peut ≠ CW si navigation)
  const eCW = getEffectiveCW(); // semaine courante effective (admin=CW, athlete=getAthleteCW)
  const isPast   = w < eCW;
  const isCurrent= w === eCW;
  const isFuture = w > eCW;

  // ── Bandeau navigation ──────────────────────────────────────────────────────
  const navLabel = document.getElementById('home-week-label');
  if(navLabel){
    const tag = isCurrent ? ' — Semaine en cours' : isPast ? ' — Semaine passée' : ' — Semaine à venir';
    navLabel.textContent = 'S' + w + tag;
    navLabel.style.color = isCurrent ? '#0C447C' : isPast ? '#3B6D11' : '#E8530A';
  }
  // Dates de la semaine
  const navDates = document.getElementById('home-week-dates');
  if(navDates){
    let d0;
    if(isAdmin() && weekDates[w-1]){
      d0 = new Date(weekDates[w-1]);
    } else if(state.plan_start_date){
      d0 = new Date(state.plan_start_date);
      d0.setDate(d0.getDate()+(w-1)*7);
      // Aller au lundi de cette semaine
      const dow=d0.getDay();
      d0.setDate(d0.getDate()+(dow===0?-6:1-dow));
    }
    if(d0){
      const d1 = new Date(d0); d1.setDate(d0.getDate()+6);
      const fmt = d => d.toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
      navDates.textContent = fmt(d0) + ' – ' + fmt(d1);
    } else {
      navDates.textContent = '';
    }
  }
  // Flèches : grisées aux extrêmes
  const maxW = isAdmin()?32:getAthleteMaxWeek();
  const prevBtn = document.getElementById('home-week-prev');
  const nextBtn = document.getElementById('home-week-next');
  if(prevBtn){ prevBtn.style.opacity = w<=1?'0.3':'1'; prevBtn.style.pointerEvents = w<=1?'none':'auto'; }
  if(nextBtn){ nextBtn.style.opacity = w>=maxW?'0.3':'1'; nextBtn.style.pointerEvents = w>=maxW?'none':'auto'; }
  // Pill "Semaine en cours" dans le header : toujours la semaine courante effective
  const weekNumEl=document.getElementById('h-week-num');
  if(weekNumEl) weekNumEl.textContent='S'+eCW;

  // ── KPIs globaux (toujours basés sur CW réel) ───────────────────────────────
  const td=calcTotalDone();
  const gt=getGrandTotal();
  const obP=state.onboarding||{};
  const isPlaisirUser=!isAdmin()&&(obP.course==='Plaisir'||!obP.course);
  if(isPlaisirUser){
    // Mode "pour le plaisir" : affiche km parcourus sans objectif ni %
    const pctEl=document.getElementById('h-pct'); if(pctEl) pctEl.textContent='';
    const barEl=document.getElementById('h-bar');
    // Barre qui grandit tous les 100km (ou 50km si < 100km courus)
    const step=td<100?50:100;
    const pct=Math.min(100,Math.round((td%step)/step*100));
    if(barEl) barEl.style.width=pct+'%';
    const progLabel=document.getElementById('h-prog-label'); if(progLabel) progLabel.textContent='Km parcourus';
    const doneKmEl=document.getElementById('h-done-km'); if(doneKmEl) doneKmEl.textContent=td.toLocaleString('fr-FR')+' km';
    const gtEl=document.getElementById('h-grand-total'); if(gtEl) gtEl.textContent='';
    const gtLabel=document.getElementById('h-grand-total-label'); if(gtLabel) gtLabel.textContent='';
    const sepEl=document.querySelector('#h-grand-total')?.closest('div')?.previousElementSibling;
    if(sepEl) sepEl.style.display='none';
  } else {
    const pct=gt>0?Math.round(td/gt*100):0;
    const pctEl=document.getElementById('h-pct'); if(pctEl) pctEl.textContent=gt>0?(pct+'%'):'—';
    const barEl=document.getElementById('h-bar'); if(barEl) barEl.style.width=pct+'%';
    const progLabel=document.getElementById('h-prog-label'); if(progLabel) progLabel.textContent='Progression du plan';
    const doneKmEl=document.getElementById('h-done-km'); if(doneKmEl) doneKmEl.textContent=td.toLocaleString('fr-FR')+' km';
    const gtEl=document.getElementById('h-grand-total'); if(gtEl) gtEl.textContent=gt.toLocaleString('fr-FR')+' km';
    const gtLabel=document.getElementById('h-grand-total-label'); if(gtLabel) gtLabel.textContent='plan complet';
  }
  const kpiTotalEl=document.getElementById('kpi-total'); if(kpiTotalEl) kpiTotalEl.textContent=td;
  const kpiRestEl=document.getElementById('kpi-rest'); if(kpiRestEl) kpiRestEl.textContent=Math.max(0,gt-td);
  const weeksLeftEl=document.getElementById('kpi-weeks-left'); if(weeksLeftEl){
    if(isAdmin()){
      weeksLeftEl.textContent=Math.max(0,32-CW);
    } else {
      // Calculer les semaines restantes depuis la semaine courante jusqu'à la dernière semaine du plan
      let maxW=0;
      for(let ws=1;ws<=52;ws++){ if(state['extra_w'+ws+'_s0']) maxW=ws; }
      const ACW=getAthleteCW();
      weeksLeftEl.textContent=maxW>0?Math.max(0,maxW-ACW+1):'—';
    }
  }
  // KM semaine : basés sur la semaine affichée
  const weekDoneKm = (()=>{
    let km=0;
    getOrderedWeekSessions(w).forEach(({s,si,extra,ei})=>{
      const rv = extra ? state[`extra_w${w}_s${ei}_km`] : state[gk(w,si)+'km'];
      if(rv!=null) km+=parseFloat(rv)||0;
    });
    return Math.round(km*10)/10;
  })();
  const kpiWeekEl=document.getElementById('kpi-week-done'); if(kpiWeekEl) kpiWeekEl.textContent=weekDoneKm;
  const kpiWeekPlanEl=document.getElementById('kpi-week-plan'); if(kpiWeekPlanEl) kpiWeekPlanEl.textContent='/ '+getWeekTotalKm(w)+' km planifiés';
  // AM pace dans le header
  const am=getMarathonPaceStr();
  const amEl=document.getElementById('h-am-pace');
  if(amEl) amEl.textContent=am;
  // EF pace
  const efPace=getBestEfPace();
  const efEl=document.getElementById('kpi-ef-pace');
  if(efEl) efEl.textContent=efPace?efPace:(isAdmin()?"6'40":'—');

  // ── Bloc course / KPIs selon rôle ──────────────────────────────────────────
  const ob=state.onboarding||{};
  const userCourse=ob.course||null; // '5 km','10 km','Semi-marathon','Marathon','Plaisir','Autre'
  const userHasPlan=!isAdmin()&&Object.keys(state).some(k=>/^extra_w\d+_s\d+/.test(k));
  const isPlaisir=!isAdmin()&&(userCourse==='Plaisir'||!userCourse||!userHasPlan);
  const raceDateStr=isAdmin()?null:(ob.date||null);
  // Date de course
  const raceDateEl=document.getElementById('home-race-date');
  if(raceDateEl){
    if(raceDateStr){
      const rd=new Date(raceDateStr);
      raceDateEl.textContent=rd.toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'});
      raceDateEl.style.display='block';
    } else if(isAdmin()){
      raceDateEl.textContent='18/10/2026';
      raceDateEl.style.display='block';
    } else {
      raceDateEl.style.display='none';
    }
  }
  // KPI cartes KM restants / Semaines restantes : masquées si pas de course
  const kpiRestCard=document.getElementById('kpi-rest-card');
  const kpiWeeksCard=document.getElementById('kpi-weeks-card');
  if(kpiRestCard) kpiRestCard.style.display=isPlaisir?'none':'block';
  if(kpiWeeksCard) kpiWeeksCard.style.display=isPlaisir?'none':'block';
  // Bloc KPI course : masqué si Plaisir ou pas de course
  const raceKpiBlock=document.getElementById('home-race-kpi-block');
  const noRaceBtn=document.getElementById('home-no-race-btn');
  const marathonTimeBlock=document.getElementById('home-marathon-time-block');
  if(isPlaisir){
    if(raceKpiBlock) raceKpiBlock.style.display='none';
    if(noRaceBtn) noRaceBtn.style.display='block';
    if(marathonTimeBlock) marathonTimeBlock.style.display='none';
  } else {
    if(raceKpiBlock) raceKpiBlock.style.display='block';
    if(noRaceBtn) noRaceBtn.style.display='none';
    if(marathonTimeBlock) marathonTimeBlock.style.display='block';
    // Curseur uniquement admin
    const predBtn=document.getElementById('home-pred-btn');
    const amTrainBtn=document.getElementById('home-am-train-btn');
    if(predBtn) predBtn.style.cursor=isAdmin()?'pointer':'default';
    if(amTrainBtn){ amTrainBtn.style.cursor=isAdmin()?'pointer':'default'; amTrainBtn.style.display=isAdmin()?'flex':'none'; }
  }
  // Libellés adaptés à la course
  const predLabelEl=document.getElementById('h-pred-label');
  const amTrainLabelEl=document.getElementById('h-am-train-label');
  if(!isAdmin()&&userCourse&&userCourse!=='Plaisir'){
    const shortCourse={'5 km':'5km','10 km':'10km','Semi-marathon':'semi','Marathon':'marathon','Autre':'course'}[userCourse]||'course';
    if(predLabelEl) predLabelEl.textContent='/km '+shortCourse;
    if(amTrainLabelEl) amTrainLabelEl.textContent='allure cible';
    // Grand chiffre : temps cible saisi dans questionnaire ou —
    const mtEl=document.getElementById('kpi-marathon-time');
    const targetTime=ob.target_time||state.target_time||null;
    if(mtEl) mtEl.textContent=formatTargetTime(targetTime);
    // Allure cible calculée depuis le temps cible si disponible
    const amPredElU=document.getElementById('h-am-pred');
    if(amPredElU){
      if(targetTime&&(ob.race_distance_km||state.race_distance_km)){
        const tParts=targetTime.split(':').map(Number);
        const totalSec=(tParts[0]||0)*3600+(tParts[1]||0)*60+(tParts[2]||0);
        const distKm=parseFloat(ob.race_distance_km||state.race_distance_km)||0;
        if(totalSec>0&&distKm>0){
          const secPerKm=Math.round(totalSec/distKm);
          amPredElU.textContent=Math.floor(secPerKm/60)+"'"+(secPerKm%60<10?'0':'')+secPerKm%60;
        } else amPredElU.textContent='—';
      } else amPredElU.textContent='—';
    }
    document.getElementById('home-marathon-time-block').style.cursor='pointer';
  } else {
    if(predLabelEl) predLabelEl.textContent='/km prédit';
    if(amTrainLabelEl) amTrainLabelEl.textContent='/km AM entr.';
    // Temps marathon projeté (admin)
    const pred = buildMarathonPrediction();
    const mtEl=document.getElementById('kpi-marathon-time');
    if(mtEl) mtEl.textContent = pred.tempsStr || (isAdmin()?(calcMarathonTime(am)||'—'):'—');
    const amPredEl = document.getElementById('h-am-pred');
    if(amPredEl) amPredEl.textContent = pred.amPaceRecoStr || '—';
    document.getElementById('home-marathon-time-block').style.cursor=isAdmin()?'pointer':'default';
  }
  const amRefEl=document.getElementById('kpi-am-ref');
  if(amRefEl) amRefEl.textContent=am;
  const amTrainEl = document.getElementById('kpi-am-training');
  if(amTrainEl) amTrainEl.textContent = state._am_training_pace || (isAdmin()?"5'20":'—');
  const vo2El = document.getElementById('kpi-vo2max');
  if(vo2El) vo2El.textContent = state['vo2max_current'] || (isAdmin()?52:'—');
  const today = new Date().toISOString().slice(0,10);
  const fcToday = state['fc_repos_'+today] || null;
  const fcReposEl = document.getElementById('kpi-fc-repos');
  if(fcReposEl) fcReposEl.textContent = fcToday ? fcToday+' bpm' : '— bpm';
  const fcReposBtn = fcReposEl ? fcReposEl.closest('div[onclick]') : null;
  if(fcReposBtn) fcReposBtn.style.background = fcToday ? 'rgba(59,109,17,0.25)' : 'rgba(255,255,255,0.12)';
  const fcBadgeEl = document.getElementById('fc-repos-badge');
  if(fcBadgeEl) fcBadgeEl.style.display = fcToday ? 'none' : 'block';
  // Visibilité selon préférences
  const fcReposWrap=document.getElementById('fc-repos-btn');
  if(fcReposWrap) fcReposWrap.parentElement.style.display=getPref('show_fc_repos')?'flex':'none';
  const vo2Wrap=vo2El?vo2El.closest('div[onclick]'):null;
  if(vo2Wrap) vo2Wrap.style.display=getPref('show_vo2max')?'flex':'none';
  const wtEl=document.getElementById('week-total-km');
  if(wtEl) wtEl.textContent=getWeekTotalKm(w)+' km';

  // ── Renforcement ────────────────────────────────────────────────────────────
  const renfoEl=document.getElementById('home-renfo');
  if(renfoEl){
    renfoEl.innerHTML='';
    const renfoData=[1,2].map(r=>{const p=getRenfoData(r);return{name:p.name,sub:p.sub,r};});
    renfoData.forEach(rd=>{
      const done=!!state[rfk(w,rd.r)+'done'];
      const exos=getRenfoData(rd.r).exos;
      const totalSeries=exos.reduce((a,ex)=>a+getNbSeries(ex.series),0);
      const doneSeries=exos.reduce((a,ex,i)=>a+(state[rfk(w,rd.r)+'e'+i+'_series']||0),0);
      const pct=Math.min(100,Math.round(doneSeries/totalSeries*100));
      const card=document.createElement('div');
      const renfoSched=state[rfk(w,rd.r)+'sched']?JSON.parse(state[rfk(w,rd.r)+'sched']):null;
      const todayDayRenfo=(new Date()).getDay()===0?7:(new Date()).getDay();
      const isRenfoToday=isCurrent&&renfoSched&&renfoSched.day===todayDayRenfo&&!done;
      const rfDays=['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
      const hasSched=renfoSched&&(renfoSched.day||renfoSched.time);
      const rfSchedBadge=hasSched
        ?`<span style="font-size:10px;color:var(--blue);font-weight:600;background:#EEF2FD;padding:1px 6px;border-radius:10px;margin-top:3px;display:inline-block;">${[renfoSched.day?rfDays[renfoSched.day]:'',renfoSched.time||''].filter(Boolean).join(' ')}</span>`
        :'';
      card.style.cssText='border-radius:14px;display:flex;align-items:center;gap:12px;padding:11px 14px;background:var(--bg);position:relative;'
        +(isCurrent||!isPast?'cursor:pointer;':'cursor:default;')
        +(isRenfoToday?'border:2px solid #0C447C;box-shadow:0 0 0 4px #0C447C15;'
        :done?'border:1px solid #3B6D1130;background:linear-gradient(90deg,#EAF3DE50,var(--bg));'
        :'border:1px solid #d0dff5;');
      if(isCurrent) card.onclick=()=>showScreen('renfo',rd.r);
      card.innerHTML=`
      ${isRenfoToday?'<span style="position:absolute;top:-1px;right:12px;background:#0C447C;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:0 0 8px 8px;letter-spacing:0.03em;">Aujourd\'hui</span>':''}
      <div style="width:40px;height:40px;border-radius:12px;background:${done?'#EAF3DE':'#E6F0FA'};border:1.5px solid ${done?'#3B6D1125':'#0C447C20'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        ${done
          ?'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B6D11" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
          :'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0C447C" stroke-width="2"><path d="M6 4v16M18 4v16M6 12h12M2 7h4M18 7h4M2 17h4M18 17h4"/></svg>'
        }
      </div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:5px;">
          <span style="font-size:13px;font-weight:600;color:${done?'#3B6D11':'#1a2e4a'};">${rd.name}</span>
          ${done?'<span style="font-size:10px;color:#3B6D11;font-weight:700;">✓</span>':''}
        </div>
        <p style="font-size:11px;color:#6B8DB5;font-weight:500;margin-top:1px;">${rd.sub}</p>
        ${!done&&doneSeries>0?`<div style="background:var(--bg2);border-radius:3px;height:3px;margin-top:5px;"><div style="background:#0C447C;border-radius:3px;height:3px;width:${pct}%;"></div></div>`:''}
        ${rfSchedBadge}
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
        ${(isCurrent||isFuture)?`<div onclick="event.stopPropagation();openRenfoSchedModal(${rd.r},${w})" style="width:32px;height:32px;border-radius:50%;border:1.5px solid ${hasSched?'#0C447C':'#d0dff5'};background:${hasSched?'#E6F0FA':'transparent'};display:flex;align-items:center;justify-content:center;cursor:pointer;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${hasSched?'#0C447C':'#6B8DB5'}" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </div>`:''}
        <div style="width:32px;height:32px;border-radius:50%;border:2px solid ${done?'#3B6D11':'#d0dff5'};background:${done?'#3B6D11':'transparent'};display:flex;align-items:center;justify-content:center;">
          ${done
            ?'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
            :doneSeries>0?`<span style="font-size:11px;font-weight:700;color:#0C447C;">${pct}%</span>`
            :''}
        </div>
      </div>`;
      renfoEl.appendChild(card);
    });
    // Compteur renfo
    const renfoProgressEl=document.getElementById('renfo-progress');
    if(renfoProgressEl){
      const total=renfoData.length;
      const doneCount=renfoData.filter(rd=>!!state[rfk(w,rd.r)+'done']).length;
      const color=doneCount===total?'#3B6D11':doneCount>0?'#1B4FD8':'var(--muted)';
      renfoProgressEl.style.color=color;
      renfoProgressEl.textContent=`${doneCount}/${total}`;
    }
    // Planification renfo S+1 (visible seulement sur semaine en cours)
    const cwNext = Math.min(w+1, 32);
    const renfoNextLabel = document.getElementById('renfo-next-label');
    if(renfoNextLabel) renfoNextLabel.textContent = cwNext;
    const renfoNextSection = renfoNextLabel ? renfoNextLabel.closest('div') : null;
    if(renfoNextSection) renfoNextSection.style.display = (isCurrent||isFuture) ? '' : 'none';
    const renfoNextEl = document.getElementById('renfo-next-week');
    if(renfoNextEl) {
      renfoNextEl.innerHTML = '';
      if(isCurrent||isFuture){
        const rfDays=['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
        const defaults = {1:{day:3,time:'19:00'}, 2:{day:5,time:'18:30'}};
        renfoData.forEach(rd => {
          const schedKey = rfk(cwNext, rd.r)+'sched';
          if(!state[schedKey] && isAdmin()) state[schedKey] = JSON.stringify(defaults[rd.r]);
          const sched = state[schedKey] ? JSON.parse(state[schedKey]) : {};
          const schedTxt = [sched.day?rfDays[sched.day]:'', sched.time||''].filter(Boolean).join(' ')||'À planifier';
          const btn = document.createElement('div');
          btn.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--bg);border:1px solid #d0dff5;border-radius:10px;margin-bottom:6px;cursor:pointer;';
          btn.onclick=()=>openRenfoSchedModal(rd.r, cwNext);
          btn.innerHTML=`<span style="font-size:12px;color:var(--text);font-weight:500;">${rd.name}</span><span style="font-size:11px;color:#1B4FD8;font-weight:600;background:#EEF2FD;padding:2px 8px;border-radius:8px;">${schedTxt}</span>`;
          renfoNextEl.appendChild(btn);
        });
      }
    }
  }

  // ── Bannière adaptation plan ─────────────────────────────────────────────────
  if(!isAdmin()){
    const adapted=state._plan_adapted?JSON.parse(state._plan_adapted):null;
    const adaptedEl=document.getElementById('home-adapted-banner');
    if(adapted&&!adapted.seen&&adaptedEl){
      adaptedEl.style.display='flex';
      const msgEl=document.getElementById('home-adapted-msg');
      if(msgEl) msgEl.textContent=adapted.msg||'Plan ajusté suite à ta dernière séance.';
    } else if(adaptedEl){
      adaptedEl.style.display='none';
    }
  }

  // ── Séances ─────────────────────────────────────────────────────────────────
  const el=document.getElementById('home-sessions');
  el.innerHTML='';
  getOrderedWeekSessions(w).forEach(({s:s2,si,extra,ei},i)=>{
    const done=extra?!!state[`extra_w${w}_s${ei}_done`]:!!state[gk(w,si)+'done'];
    const rv=extra?state[`extra_w${w}_s${ei}_km`]:state[gk(w,si)+'km'];
    const typeC=typeColor[s2.type]||'#888';
    const typeBgC=typeBg[s2.type]||'#f5f5f5';
    const lbl=typeLabel[s2.type]||'EF';
    const parts=s2.d.split('|');
    const title=parts[0];
    const detail=filterDetailDisplay(title,parts[1]||null);
    // Horaire planifié
    const _schedDays=['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
    let schedHtml='';
    if(!extra){
      const edRaw=state['edit_w'+w+'_s'+si];
      if(edRaw){const ed=JSON.parse(edRaw);if(ed.sched_day||ed.sched_time){
        schedHtml=`<span style="font-size:10px;color:var(--blue);font-weight:600;background:#EEF2FD;padding:1px 6px;border-radius:10px;margin-top:3px;display:inline-block;">${[ed.sched_day?_schedDays[ed.sched_day]:'',ed.sched_time||''].filter(Boolean).join(' ')}</span>`;
      }}
    } else if(s2.sched_day||s2.sched_time){
      schedHtml=`<span style="font-size:10px;color:var(--blue);font-weight:600;background:#EEF2FD;padding:1px 6px;border-radius:10px;margin-top:3px;display:inline-block;">${[s2.sched_day?_schedDays[s2.sched_day]:'',s2.sched_time||''].filter(Boolean).join(' ')}</span>`;
    }
    // "Aujourd'hui" seulement sur semaine en cours
    const runEdRaw=extra?null:state['edit_w'+w+'_s'+si];
    const runEd=runEdRaw?JSON.parse(runEdRaw):null;
    const todayDayRun=(new Date()).getDay()===0?7:(new Date()).getDay();
    const isRunToday=isCurrent&&!done&&(
      extra
        ? (s2.sched_day===todayDayRun)
        : (runEd&&runEd.sched_day===todayDayRun)
    );
    // Boutons : actifs sur semaine en cours et futures, lecture seule sur passées
    const canEdit = isCurrent || isFuture;
    const editFn = canEdit ? (extra?`openEditExtraModal(${w},${ei})`:`openEditModal(${w},${si})`) : '';
    const doneFn = isCurrent ? (extra?`toggleDoneExtra(${w},${ei})`:`toggleDone(${si})`) : '';
    const div=document.createElement('div');
    div.style.cssText='border-radius:14px;margin-bottom:8px;display:flex;align-items:center;gap:12px;padding:11px 14px;background:var(--bg);position:relative;cursor:default;'
      +(isRunToday?`border:2px solid ${typeC};box-shadow:0 0 0 4px ${typeC}15;`
      :done?`border:1px solid ${typeC}30;background:linear-gradient(90deg,${typeBgC}50,var(--bg));`
      :'border:1px solid var(--border);')
      +(isPast&&!done?'opacity:0.65;':'');
    div.innerHTML=`
      ${isRunToday?`<span style="position:absolute;top:-1px;right:12px;background:${typeC};color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:0 0 8px 8px;letter-spacing:0.03em;">Aujourd'hui</span>`:''}
      ${isPast&&!done?`<span style="position:absolute;top:-1px;right:12px;background:#aaa;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:0 0 8px 8px;letter-spacing:0.03em;">Non faite</span>`:''}
      <div style="width:40px;height:40px;border-radius:12px;background:${typeBgC};border:1.5px solid ${typeC}25;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        ${done
          ?`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${typeC}" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`
          :`<span style="font-size:10px;font-weight:800;color:${typeC};">${lbl}</span>`
        }
      </div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
          <span style="font-size:13px;font-weight:600;color:${done?typeC:'#1a2e4a'};">${title}</span>
          
        </div>
        ${detail?`<p style="font-size:11px;color:${typeC};font-weight:500;opacity:${done?0.75:1};margin-top:1px;">${detail}</p>`:''}
        ${(()=>{
          if(!done){
            const dur=estimateDuration(s2);
            return dur?`<span style="font-size:10px;color:#6B8DB5;font-weight:500;">⏱ ~${dur}</span>`:'';
          }
          const perfRaw = extra ? state[`extra_w${w}_s${ei}_perf`] : state[gk(w,si)+'perf'];
          const perf2 = perfRaw ? JSON.parse(perfRaw) : {};
          const realPace = perf2.pace || null;
          const realDur = perf2.dur || null;
          const parts2=[];
          if(realDur) parts2.push(`<span style="font-size:10px;font-weight:600;color:${typeC};">⏱ ${realDur}</span>`);
          if(realPace) parts2.push(`<span style="font-size:10px;color:${typeC};font-weight:600;">🏃 ${realPace}/km</span>`);
          return parts2.length?`<div style="display:flex;gap:6px;align-items:center;margin-bottom:2px;">${parts2.join('<span style="color:var(--border);"> · </span>')}</div>`:'';
        })()}
        <div style="display:flex;align-items:center;gap:6px;margin-top:3px;flex-wrap:wrap;">
          <span style="font-size:12px;font-weight:${rv!=null?700:400};color:${rv!=null?typeC:'#6B8DB5'};">
            ${rv!=null?rv+' <span style="font-size:10px;font-weight:400;color:#6B8DB5;">/ '+s2.km+' km</span>':s2.km+' <span style="font-size:10px;color:#6B8DB5;">km</span>'}
          </span>
          ${s2.shoe?shoeFullBadge(s2.shoe):''}
        </div>
        ${schedHtml}
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
        ${canEdit?`<div onclick="${editFn}" style="width:32px;height:32px;border-radius:50%;border:1.5px solid ${rv!=null?typeC:'#d0dff5'};background:${rv!=null?typeBgC:'transparent'};display:flex;align-items:center;justify-content:center;cursor:pointer;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${rv!=null?typeC:'#6B8DB5'}" stroke-width="2"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </div>`:''}
        ${isCurrent?`<div onclick="${doneFn}" style="width:32px;height:32px;border-radius:50%;border:2px solid ${done?typeC:'#d0dff5'};background:${done?typeC:'transparent'};display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.15s;">
          ${done?`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`:''}
        </div>`:done?`<div style="width:32px;height:32px;border-radius:50%;border:2px solid ${typeC};background:${typeC};display:flex;align-items:center;justify-content:center;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        </div>`:''}
      </div>`;
    el.appendChild(div);
  });

  // Compteur de progression séances
  const sessionsProgressEl = document.getElementById('sessions-progress');
  if(sessionsProgressEl){
    const allSessions = getOrderedWeekSessions(w).filter(({s})=>s.type!=='rest');
    const total = allSessions.length;
    const doneCount = allSessions.filter(({s,si,extra,ei})=>
      extra ? !!state[`extra_w${w}_s${ei}_done`] : !!state[gk(w,si)+'done']
    ).length;
    const color = doneCount===total ? '#3B6D11' : doneCount>0 ? '#1B4FD8' : 'var(--muted)';
    sessionsProgressEl.style.color = color;
    sessionsProgressEl.textContent = `${doneCount}/${total}`;
  }
  // Météo accueil : seulement sur semaine en cours
  if(isCurrent) setTimeout(_updateHomeWeather, 500);
  // Bannière notifications
  _updateHomeNotifBanner();
  updateNotifBtnState();
}

function toggleDoneExtra(w,ei){
  const k=`extra_w${w}_s${ei}`;
  const doneK=k+'_done';
  const wasDone=!!state[doneK];
  if(!wasDone){
    openValidationModalExtra(w,ei);
  } else {
    state[doneK]=false;
    delete state[k+'_km'];
    delete state[k+'_perf'];
    // Si la bannière d'adaptation concerne cette semaine, la retirer
    if(state._plan_adapted){
      try{
        const a=JSON.parse(state._plan_adapted);
        if(a.week===w){ delete state._plan_adapted; if(dbRef) dbRef.child('_plan_adapted').remove().catch(()=>{}); }
      }catch(e){}
    }
    save();
    renderHome();
    rendered.stats=false;
  }
}

function openValidationModalExtra(w,ei){
  // Reset Strava et météo comme pour openValidationModal
  window._meteoValidationData = null;
  window._garminActivityData = null;
  const s=JSON.parse(state[`extra_w${w}_s${ei}`]||'{}');
  const parts=(s.d||'').split('|');
  const title=parts[0];
  const detail=filterDetailDisplay(title, parts[1]||null);
  const _headerColor={ef:'#3B6D11',tempo:'#E8530A',frac:'#C4141B',long:'#534AB7',race:'#0C447C'}[s.type]||'#0C447C';
  const kmVal=state[`extra_w${w}_s${ei}_km`]!=null?state[`extra_w${w}_s${ei}_km`]:s.km||0;
  const prev=state[`extra_w${w}_s${ei}_perf`]?JSON.parse(state[`extra_w${w}_s${ei}_perf`]):{};
  // Stocker le contexte pour Strava (_applyGarminToValidation)
  window._currentValidationSession = { s, idx: ei, ws: w, isExtra: true, ei };
  const mc=document.getElementById('modal-container');
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.style.setProperty('--_overlay-bg','rgba(0,0,0,0.4)');
  overlay.innerHTML=`<div class="modal-box" style="max-height:92vh;">
    <!-- Header coloré par type — identique à openValidationModal -->
    <div style="background:${_headerColor};padding:16px 16px 14px;border-radius:24px 24px 0 0;color:#fff;flex-shrink:0;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <p style="font-size:10px;font-weight:800;opacity:0.75;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:2px;">✅ Valider la séance</p>
          <p style="font-size:20px;font-weight:900;letter-spacing:-0.02em;">${title}</p>
          ${detail?`<p style="font-size:12px;opacity:0.85;margin-top:3px;">${detail}</p>`:''}
        </div>
        <div style="display:flex;align-items:flex-start;gap:6px;margin-top:2px;">
          ${isAdmin()?`<button id="garmin-val-btn" onclick="importFromStrava()" style="display:flex;align-items:center;gap:4px;padding:6px 10px;background:rgba(255,255,255,0.2);border:none;border-radius:20px;color:#fff;font-size:11px;font-weight:700;cursor:pointer;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Strava</button>`:''}
          <button id="meteo-val-btn" onclick="importMeteoValidation()" style="display:flex;align-items:center;gap:4px;padding:6px 10px;background:rgba(255,255,255,0.2);border:none;border-radius:20px;color:#fff;font-size:11px;font-weight:700;cursor:pointer;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> Météo</button>
          <button onclick="closeModal()" style="background:rgba(255,255,255,0.2);border:none;cursor:pointer;color:#fff;font-size:18px;line-height:1;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;">×</button>
        </div>
      </div>
    </div>
    <!-- Zone scrollable identique -->
    <div class="modal-scroll-body">
    <div style="padding:16px 16px 0;">
    <div id="meteo-val-preview" style="display:none;background:linear-gradient(135deg,#EDF2FB,#dce8f8);border:1px solid rgba(12,68,124,0.2);border-radius:10px;padding:10px 14px;margin-bottom:12px;"></div>
    <div style="background:#FFF8F0;border:1.5px solid #E8530A;border-radius:10px;padding:8px 12px;font-size:12px;font-weight:600;color:#7A3B00;margin-bottom:10px;">⚡ Si tu as couru <b>moins que prévu</b>, modifie le champ km — le plan sera adapté automatiquement.</div>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div>
        <p style="font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">📅 Date</p>
        <input type="date" id="val-date" value="${(()=>{const n=new Date();return n.getFullYear()+'-'+(n.getMonth()+1).toString().padStart(2,'0')+'-'+n.getDate().toString().padStart(2,'0')})()}"
          style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;font-size:15px;font-weight:600;color:var(--text);width:100%;outline:none;">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">KM réels</p>
          <input type="number" id="val-km" value="${kmVal}" min="0" max="99" step="0.5" oninput="calcPace()"
            style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:11px;font-size:20px;font-weight:800;color:var(--text);width:100%;outline:none;text-align:center;">
          <p style="font-size:10px;color:var(--muted);margin-top:3px;text-align:center;">Prévu : ${s.km} km</p>
        </div>
        <div>
          <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Durée</p>
          <input type="text" inputmode="numeric" id="val-dur" value="${prev.dur||''}" placeholder="mm:ss" maxlength="7" oninput="onDurInput(this)"
            style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:11px;font-size:20px;font-weight:800;color:var(--text);width:100%;outline:none;text-align:center;">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Allure moy. <span style="font-size:10px;font-weight:400;">(auto ou manuel)</span></p>
          <input type="text" id="val-pace" value="${prev.pace||''}" placeholder="5:40" maxlength="5"
            style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:11px;font-size:20px;font-weight:800;color:var(--text);width:100%;outline:none;text-align:center;">
          <p style="font-size:10px;color:var(--muted);margin-top:3px;text-align:center;">/km</p>
        </div>
        <div>
          <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">FC moy. <span style="font-size:10px;font-weight:400;color:#aaa;">(optionnel)</span></p>
          <input type="number" id="val-hr" value="${prev.hr||''}" placeholder="—" min="50" max="220"
            style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:11px;font-size:20px;font-weight:800;color:var(--text);width:100%;outline:none;text-align:center;">
          <p style="font-size:10px;color:var(--muted);margin-top:3px;text-align:center;">bpm</p>
        </div>
      </div>
      ${(()=>{
        if(s.type!=='tempo' && s.type!=='frac') return '';
        const titleMatch=(s.d||'').split('|')[0].match(/(\d+)[x\u00d7]/i);
        const nbBlocs=titleMatch?parseInt(titleMatch[1]):2;
        const prevBlocs=prev.blocsAllure||[];
        const nbRows=Math.ceil(nbBlocs/3);
        const _bColor=s.type==='frac'?'#C4141B':'#1B4FD8';
        const _bLabel=s.type==='frac'?'⚡ Allure par bloc fractionné':'⚡ Allure par bloc tempo';
        let html='<div id="val-blocs-container" style="margin-top:12px;"><p style="font-size:12px;font-weight:600;color:'+_bColor+';margin-bottom:8px;">'+_bLabel+'</p>';
        for(let row=0;row<nbRows;row++){
          const s2=row*3,e2=Math.min(s2+3,nbBlocs),cnt=e2-s2;
          html+='<div style="display:grid;grid-template-columns:repeat('+cnt+',1fr);gap:8px;'+(row>0?'margin-top:8px;':'')+'">';
          for(let i=s2;i<e2;i++){
            html+='<div><p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Bloc '+(i+1)+'</p>';
            html+='<input type="text" id="val-bloc-'+i+'" value="'+(prevBlocs[i]||'')+'" placeholder="4:50" maxlength="5" style="background:var(--bg2);border:1.5px solid '+_bColor+'30;border-radius:var(--radius-sm);padding:10px;font-size:18px;font-weight:700;color:'+_bColor+';width:100%;outline:none;text-align:center;">';
            html+='<p style="font-size:10px;color:var(--muted);margin-top:3px;text-align:center;">/km</p></div>';
          }
          html+='</div>';
        }
        html+='</div>';
        return html;
      })()}
    </div>
    <div style="padding:0 0 28px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:20px;">
        <button onclick="closeModal()" style="padding:13px;background:var(--bg2);border:1.5px solid var(--border);border-radius:14px;font-size:13px;font-weight:700;color:var(--muted);cursor:pointer;">Annuler</button>
        <button onclick="saveValidationExtra(${w},${ei})" style="padding:13px;background:${_headerColor};border:none;border-radius:14px;font-size:14px;font-weight:800;color:#fff;cursor:pointer;">✅ Valider</button>
      </div>
    </div>
    </div>
    </div><!-- /modal-scroll-body -->
  </div>`;
  overlay.onclick=e=>{if(e.target===overlay)closeModal();};
  _lockBodyScroll();
  mc.appendChild(overlay);
  _initSwipeToDismiss(overlay, overlay.querySelector('.modal-box'));
}

function dismissPlanAdapted(){
  if(state._plan_adapted){
    try{
      const a=JSON.parse(state._plan_adapted);
      a.seen=true;
      state._plan_adapted=JSON.stringify(a);
      save();
    }catch(e){}
  }
  const el=document.getElementById('home-adapted-banner');
  if(el) el.style.display='none';
}

async function adaptPlanAfterSession(w, ei, kmActual, kmPlanned){
  if(isAdmin()) return;
  if(!kmPlanned||kmPlanned<=0) return;
  const ratio=kmActual/kmPlanned;
  if(ratio>=0.80) return;

  let level, factors;
  if(ratio>=0.60){
    level='léger';
    factors={cw:0.90,n1:0.95,n2:1};
  } else if(ratio>=0.40){
    level='modéré';
    factors={cw:0.80,n1:0.85,n2:0.95};
  } else {
    level='majeur';
    factors={cw:0.70,n1:0.75,n2:0.90};
  }

  const kmActualDisplay=kmActual===0?'0 (séance non réalisée)':kmActual;
  const msg={
    léger:`Plan ajusté ↓ — Tu as couru ${kmActualDisplay} km au lieu de ${kmPlanned} km. Les prochaines séances sont légèrement allégées.`,
    modéré:`Plan adapté ↓ — Séance écourtée (${kmActualDisplay}/${kmPlanned} km). Semaine prochaine allégée pour favoriser ta récupération.`,
    majeur:kmActual===0
      ?`Plan adapté ↓ — Séance non réalisée (${kmPlanned} km prévus). Les 2 prochaines semaines sont allégées. Écoute ton corps !`
      :`Plan adapté ↓ — Possible fatigue ou blessure (${kmActualDisplay}/${kmPlanned} km). Les 2 prochaines semaines sont allégées. Écoute ton corps !`,
  }[level];

  const maxWeek=getAthleteMaxWeek();
  const updates={};

  // Séances non-validées de la semaine en cours
  const wStr=`extra_w${w}_s`;
  Object.keys(state).filter(k=>k.startsWith(wStr)&&!k.includes('_done')&&!k.includes('_km')&&!k.includes('_perf')).forEach(k=>{
    const eiOther=parseInt(k.replace(wStr,''));
    if(eiOther===ei) return;
    if(state[`extra_w${w}_s${eiOther}_done`]) return;
    try{
      const s=JSON.parse(state[k]||'{}');
      if(s.km>0){
        s.km=Math.max(2,Math.round(s.km*factors.cw*2)/2);
        updates[k]=JSON.stringify(s);
        state[k]=updates[k];
      }
    }catch(e){}
  });

  // Semaines +1 et +2
  [[w+1, factors.n1],[w+2, factors.n2]].forEach(([wn, factor])=>{
    if(factor>=1||wn>maxWeek) return;
    Object.keys(state).filter(k=>k.startsWith(`extra_w${wn}_s`)&&!k.includes('_done')&&!k.includes('_km')&&!k.includes('_perf')).forEach(k=>{
      const eiN=parseInt(k.replace(`extra_w${wn}_s`,''));
      if(state[`extra_w${wn}_s${eiN}_done`]) return;
      try{
        const s=JSON.parse(state[k]||'{}');
        if(s.km>0){
          s.km=Math.max(2,Math.round(s.km*factor*2)/2);
          updates[k]=JSON.stringify(s);
          state[k]=updates[k];
        }
      }catch(e){}
    });
  });

  const adapted={msg,ts:Date.now(),seen:false,week:w,level};
  state._plan_adapted=JSON.stringify(adapted);
  updates['_plan_adapted']=state._plan_adapted;

  if(dbRef) await dbRef.update(updates).catch(e=>console.warn('adaptPlan update:',e));
}

async function saveValidationExtra(w,ei){
  const km=parseFloat(document.getElementById('val-km').value);
  const dur=(document.getElementById('val-dur').value||'').trim();
  const pace=(document.getElementById('val-pace').value||'').trim();
  const hr=parseInt(document.getElementById('val-hr').value)||null;
  const dateVal=(document.getElementById('val-date').value||'').trim();
  const k=`extra_w${w}_s${ei}`;
  state[k+'_done']=true;
  state[k+'_km']=(!isNaN(km)&&km>=0)?km:0;
  const perf={};
  if(dur) perf.dur=dur;
  if(pace) perf.pace=pace;
  if(hr) perf.hr=hr;
  if(dateVal) perf.date=dateVal;
  // Blocs Tempo/Frac
  const sExtra=JSON.parse(state[k]||'{}');
  if(sExtra.type==='tempo'||sExtra.type==='frac'){
    const tmatch=(sExtra.d||'').split('|')[0].match(/(\d+)[x\u00d7]/i);
    const nbB=tmatch?parseInt(tmatch[1]):2;
    const blocsAllure=[];
    for(let i=0;i<nbB;i++){const el=document.getElementById('val-bloc-'+i);blocsAllure.push(el&&el.value.trim()?el.value.trim():'');}
    if(blocsAllure.some(b=>b)) perf.blocsAllure=blocsAllure;
  }
  // Strava — même logique que saveValidation
  if(window._garminActivityData){
    const g=window._garminActivityData;
    const stravaData={};
    if(g.cadence) stravaData.cadence=g.cadence;
    if(g.fcMax) stravaData.fcMax=g.fcMax;
    if(g.denivele_pos!=null) stravaData.denivele_pos=g.denivele_pos;
    if(g.denivele_neg!=null) stravaData.denivele_neg=g.denivele_neg;
    if(g.puissance_moy) stravaData.puissance_moy=g.puissance_moy;
    if(g.calories) stravaData.calories=g.calories;
    if(g.best_400m) stravaData.best_400m=g.best_400m;
    if(g.splits&&g.splits.length>0) stravaData.splits=g.splits;
    if(g.zones_fc&&g.zones_fc.length>0) stravaData.zones_fc=g.zones_fc;
    if(Object.keys(stravaData).length>0){
      const ex=state[k+'_perf']?JSON.parse(state[k+'_perf']):{};
      Object.assign(perf,ex);
      perf.strava=stravaData;
    }
    window._garminActivityData=null;
  }
  if(Object.keys(perf).length>0) state[k+'_perf']=JSON.stringify(perf);
  save();
  // Adaptation automatique du plan si km réels < 80% du prévu (ou champ vide = 0 km)
  if(!isAdmin()){
    const kmPlanned=sExtra.km||0;
    const kmActual=(!isNaN(km)&&km>=0)?km:0;
    await adaptPlanAfterSession(w, ei, kmActual, kmPlanned);
  }
  // Timestamp Firebase comme saveValidation
  if(dbRef) dbRef.child('_last_validation_w'+w).set(Date.now()).catch(()=>{});
  renderHome();
  rendered.plan=false;
  rendered.stats=false;
  if(document.getElementById('sc-plan').style.display!=='none') renderPlan();
  if(document.getElementById('sc-stats').style.display!=='none') renderStats();
  const amImproved=updateMarathonPace();
  // Météo — identique à saveValidation : await + sched_time de la séance extra
  let meteoSeance=window._meteoValidationData||null;
  window._meteoValidationData=null;
  if(!meteoSeance){
    if(_weatherCache&&Date.now()-_weatherCacheTs<2*60*60*1000){
      meteoSeance=_weatherCache;
    } else {
      const _seanceHeure=sExtra.sched_time||null;
      meteoSeance=await fetchWeatherIfGranted(_seanceHeure,dateVal||null);
    }
  }
  // Sauvegarder la météo dans perf pour l'affichage dans Stats
  if(meteoSeance){
    const perfKey=k+'_perf';
    const existing=state[perfKey]?JSON.parse(state[perfKey]):{};
    existing.meteo=meteoSeance;
    state[perfKey]=JSON.stringify(existing);
    if(dbRef) dbRef.child(perfKey).set(state[perfKey]).catch(()=>{});
    rendered.stats=false;
  }
  if(isAdmin()){ closeModal(); showCoachFeedback(sExtra,km,pace,hr,amImproved,null,meteoSeance); }
  else showAthleteFeedback(sExtra,km,pace,hr,perf,meteoSeance);
}

function openValidationModal(idx){
  // Réinitialiser météo et données Strava précédentes
  window._meteoValidationData = null;
  window._garminActivityData = null;
  // Reset le preview météo pour ne pas afficher les résultats d'une session précédente
  const _prevReset = document.getElementById('meteo-val-preview');
  if (_prevReset) { _prevReset.style.display = 'none'; _prevReset.innerHTML = ''; }
  const _btnReset = document.getElementById('meteo-val-btn');
  if (_btnReset) {
    _btnReset.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> Météo';
    _btnReset.style.background = '#0C447C';
    _btnReset.disabled = false;
  }
  const s=getSession(CW,idx);
  // Stocker le contexte pour que _applyGarminToValidation puisse accéder à la séance
  window._currentValidationSession = { s, idx, ws: CW };
  const parts=s.d.split('|');
  const title=parts[0];
  const detail=filterDetailDisplay(title, parts[1]||null);
  const c=typeColor[s.type]||'#888';
  const bg=typeBg[s.type]||'#f5f5f5';
  const lbl=typeLabel[s.type]||'EF';
  const prev=state[gk(CW,idx)+'perf']?JSON.parse(state[gk(CW,idx)+'perf']):{};
  const kmVal=state[gk(CW,idx)+'km']!=null?state[gk(CW,idx)+'km']:s.km;
  const mc=document.getElementById('modal-container');
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.style.setProperty('--_overlay-bg','rgba(0,0,0,0.4)');
  const _headerColor={ef:'#3B6D11',tempo:'#E8530A',frac:'#C4141B',long:'#534AB7',rest:'#888',race:'#0C447C'}[s.type]||'#0C447C';
  overlay.innerHTML=`<div class="modal-box" style="max-height:92vh;">
    <!-- Header coloré par type (fixe) -->
    <div style="background:${_headerColor};padding:16px 16px 14px;border-radius:24px 24px 0 0;color:#fff;flex-shrink:0;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <p style="font-size:10px;font-weight:800;opacity:0.75;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:2px;">✅ Valider la séance</p>
          <p style="font-size:20px;font-weight:900;letter-spacing:-0.02em;">${title}</p>
          ${detail?`<p style="font-size:12px;opacity:0.85;margin-top:3px;">${detail}</p>`:''}
        </div>
        <div style="display:flex;align-items:flex-start;gap:6px;margin-top:2px;">
          ${isAdmin()?`<button id="garmin-val-btn" onclick="importFromStrava()" style="display:flex;align-items:center;gap:4px;padding:6px 10px;background:rgba(255,255,255,0.2);border:none;border-radius:20px;color:#fff;font-size:11px;font-weight:700;cursor:pointer;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Strava</button>`:''}
          <button id="meteo-val-btn" onclick="importMeteoValidation()" style="display:flex;align-items:center;gap:4px;padding:6px 10px;background:rgba(255,255,255,0.2);border:none;border-radius:20px;color:#fff;font-size:11px;font-weight:700;cursor:pointer;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> Météo</button>
          <button onclick="closeModal()" style="background:rgba(255,255,255,0.2);border:none;cursor:pointer;color:#fff;font-size:18px;line-height:1;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;">×</button>
        </div>
      </div>
    </div>
    <!-- Zone scrollable -->
    <div class="modal-scroll-body">
    <div style="padding:16px 16px 0;">
    <div id="meteo-val-preview" style="display:none;background:linear-gradient(135deg,#EDF2FB,#dce8f8);border:1px solid rgba(12,68,124,0.2);border-radius:10px;padding:10px 14px;margin-bottom:12px;"></div>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div>
        <p style="font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">📅 Date</p>
        <input type="date" id="val-date" value="${(()=>{const n=new Date();return n.getFullYear()+'-'+(n.getMonth()+1).toString().padStart(2,'0')+'-'+n.getDate().toString().padStart(2,'0')})()}"
          style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;font-size:15px;font-weight:600;color:var(--text);width:100%;outline:none;">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">KM réels</p>
          <input type="number" id="val-km" value="${kmVal}" min="0" max="99" step="0.5" oninput="calcPace()"
            style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:11px;font-size:20px;font-weight:800;color:var(--text);width:100%;outline:none;text-align:center;">
          <p style="font-size:10px;color:var(--muted);margin-top:3px;text-align:center;">Prévu : ${s.km} km</p>
        </div>
        <div>
          <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Durée</p>
          <input type="text" inputmode="numeric" id="val-dur" value="${prev.dur||''}" placeholder="mm:ss" maxlength="7" oninput="onDurInput(this)"
            style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:11px;font-size:20px;font-weight:800;color:var(--text);width:100%;outline:none;text-align:center;">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Allure moy. <span style="font-size:10px;font-weight:400;">(auto ou manuel)</span></p>
          <input type="text" id="val-pace" value="${prev.pace||''}" placeholder="5:40" maxlength="5"
            style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:11px;font-size:20px;font-weight:800;color:var(--text);width:100%;outline:none;text-align:center;">
          <p style="font-size:10px;color:var(--muted);margin-top:3px;text-align:center;">/km</p>
        </div>
        <div>
          <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">FC moy. <span style="font-size:10px;font-weight:400;color:#aaa;">(optionnel)</span></p>
          <input type="number" id="val-hr" value="${prev.hr||''}" placeholder="—" min="50" max="220"
            style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:11px;font-size:20px;font-weight:800;color:var(--text);width:100%;outline:none;text-align:center;">
          <p style="font-size:10px;color:var(--muted);margin-top:3px;text-align:center;">bpm</p>
        </div>
      </div>
      ${(()=>{
        if(s.type!=='tempo'&&s.type!=='frac') return '';
        const titleMatch=s.d.split('|')[0].match(/(\d+)[x\u00d7]/i);
        const nbBlocs=titleMatch?parseInt(titleMatch[1]):2;
        const prevBlocs=prev.blocsAllure||[];
        const nbRows=Math.ceil(nbBlocs/3);
        const _blocColor=s.type==='frac'?'#C4141B':'#1B4FD8';
        const _blocLabel=s.type==='frac'?'\u26a1 Allure par bloc fractionn\u00e9':'\u26a1 Allure par bloc tempo';
        let html='<div id="val-blocs-container" style="margin-top:12px;"><p style="font-size:12px;font-weight:600;color:'+_blocColor+';margin-bottom:8px;">'+_blocLabel+'</p>';
        for(let row=0;row<nbRows;row++){
          const start2=row*3; const end2=Math.min(start2+3,nbBlocs); const count=end2-start2;
          html+='<div style="display:grid;grid-template-columns:repeat('+count+',1fr);gap:8px;'+(row>0?'margin-top:8px;':'')+'">';
          for(let i=start2;i<end2;i++){
            html+='<div><p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Bloc '+(i+1)+'</p>';
            html+='<input type="text" id="val-bloc-'+i+'" value="'+(prevBlocs[i]||'')+'" placeholder="4:50" maxlength="5" style="background:var(--bg2);border:1.5px solid '+_blocColor+'30;border-radius:var(--radius-sm);padding:10px;font-size:18px;font-weight:700;color:'+_blocColor+';width:100%;outline:none;text-align:center;">';
            html+='<p style="font-size:10px;color:var(--muted);margin-top:3px;text-align:center;">/km</p></div>';
          }
          html+='</div>';
        }
        html+='</div>';
        return html;
      })()}
    </div>
    <div style="padding:0 0 28px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:20px;">
        <button onclick="closeModal()" style="padding:13px;background:var(--bg2);border:1.5px solid var(--border);border-radius:14px;font-size:13px;font-weight:700;color:var(--muted);cursor:pointer;">Annuler</button>
        <button onclick="saveValidation(${idx})" style="padding:13px;background:${_headerColor};border:none;border-radius:14px;font-size:14px;font-weight:800;color:#fff;cursor:pointer;">✅ Valider</button>
      </div>
    </div>
    </div><!-- /padding -->
    </div><!-- /modal-scroll-body -->
  </div>`;
  overlay.onclick=e=>{if(e.target===overlay)closeModal();};
  _lockBodyScroll();
  mc.appendChild(overlay);
}

function onDurInput(el){
  const digits=el.value.replace(/\D/g,'').slice(0,6);
  let fmt;
  if(digits.length<=2) fmt=digits;
  else if(digits.length<=4) fmt=digits.slice(0,2)+':'+digits.slice(2);
  else fmt=digits.slice(0,2)+':'+digits.slice(2,4)+':'+digits.slice(4);
  el.value=fmt;
  if(el.id==='pedit-dur'&&typeof calcPerfEditPace==='function') calcPerfEditPace();
  else if(typeof calcPace==='function') calcPace();
}

function calcPace(){
  const kmEl=document.getElementById('val-km');
  const durEl=document.getElementById('val-dur');
  const paceEl=document.getElementById('val-pace');
  if(!kmEl||!durEl||!paceEl) return;
  const km=parseFloat(kmEl.value);
  const durStr=durEl.value.trim();
  if(!km||km<=0||!durStr) return;
  const parts=durStr.split(':');
  let totalMin;
  if(parts.length===3){
    // Format h:mm:ss
    const h=parseInt(parts[0])||0;
    const m=parseInt(parts[1])||0;
    const s=parseInt(parts[2])||0;
    if(isNaN(m)||m<0||m>59||isNaN(s)||s<0||s>59) return;
    totalMin=h*60+m+s/60;
  } else if(parts.length===2){
    const left=parseInt(parts[0])||0;
    const right=parseInt(parts[1])||0;
    if(isNaN(right)||right<0||right>59) return;
    // Si left >= 10 c'est probablement mm:ss, sinon h:mm
    if(left>=10){
      totalMin=left+right/60;
    } else {
      totalMin=left*60+right;
    }
  } else {
    return;
  }
  if(totalMin<=0) return;
  const paceMin=totalMin/km;
  const paceMinInt=Math.floor(paceMin);
  const paceSec=Math.round((paceMin-paceMinInt)*60);
  const paceStr=`${paceMinInt}:${paceSec.toString().padStart(2,'0')}`;
  paceEl.value=paceStr;
  paceEl.style.borderColor='#3B6D11';
}

async function saveValidation(idx){
  const km=parseFloat(document.getElementById('val-km').value);
  const dur=(document.getElementById('val-dur').value||'').trim();
  const pace=(document.getElementById('val-pace').value||'').trim();
  const hr=parseInt(document.getElementById('val-hr').value)||null;
  const dateVal=(document.getElementById('val-date').value||'').trim();
  const k=gk(CW,idx);
  const s=getSession(CW,idx);
  state[k+'done']=true;
  if(!isNaN(km)&&km>=0) state[k+'km']=km;
  const perf={};
  if(dur) perf.dur=dur;
  if(pace) perf.pace=pace;
  if(hr) perf.hr=hr;
  if(dateVal) perf.date=dateVal;
  // Sauvegarder les allures de blocs tempo/frac
  if(s.type==='tempo'||s.type==='frac'){
    const titleMatch=s.d.split('|')[0].match(/(\d+)[x×]/i);
    const nbBlocs=titleMatch?parseInt(titleMatch[1]):2;
    const blocsAllure=[];
    for(let i=0;i<nbBlocs;i++){
      const el=document.getElementById('val-bloc-'+i);
      blocsAllure.push(el&&el.value.trim()?el.value.trim():'');
    }
    if(blocsAllure.some(b=>b)) perf.blocsAllure=blocsAllure;
  }
  if(Object.keys(perf).length>0) state[k+'perf']=JSON.stringify(perf);
  // Sauvegarder les données Strava si importées
  if(window._garminActivityData) {
    const g = window._garminActivityData;
    const stravaData = {};
    if(g.cadence) stravaData.cadence = g.cadence;
    if(g.fcMax) stravaData.fcMax = g.fcMax;
    if(g.denivele_pos != null) stravaData.denivele_pos = g.denivele_pos;
    if(g.denivele_neg != null) stravaData.denivele_neg = g.denivele_neg;
    if(g.puissance_moy) stravaData.puissance_moy = g.puissance_moy;
    if(g.calories) stravaData.calories = g.calories;
    if(g.best_400m) stravaData.best_400m = g.best_400m;
    if(g.splits && g.splits.length > 0) stravaData.splits = g.splits;
    if(g.zones_fc && g.zones_fc.length > 0) stravaData.zones_fc = g.zones_fc;
    if(Object.keys(stravaData).length > 0) {
      const existing = state[k+'perf'] ? JSON.parse(state[k+'perf']) : {};
      existing.strava = stravaData;
      state[k+'perf'] = JSON.stringify(existing);
    }
    window._garminActivityData = null;
  }
  save();
  // Enregistrer le timestamp de dernière validation pour les félicitations
  if(dbRef) dbRef.child('_last_validation_w'+CW).set(Date.now()).catch(()=>{});
  closeModal();
  renderHome();
  rendered.plan=false;
  rendered.stats=false;
  if(document.getElementById('sc-plan').style.display!=='none') renderPlan();
  if(document.getElementById('sc-stats').style.display!=='none')renderStats();
  // Mettre à jour l'allure marathon et vérifier si elle a progressé
  const amImproved=updateMarathonPace();
  // Météo : utiliser les données importées via le bouton (priorité) ou fetch auto
  let meteoSeance = window._meteoValidationData || null;
  if (!meteoSeance) {
    // Utiliser le cache météo si récent (< 2h) — évite un fetch supplémentaire
    if (_weatherCache && Date.now() - _weatherCacheTs < 2 * 60 * 60 * 1000) {
      meteoSeance = _weatherCache;
    } else {
      // Fetch complet avec tous les fallbacks (pas de dialog géoloc surprise — utilise Paris si besoin)
      const _seanceDate = dateVal || new Date().toISOString().slice(0, 10);
      const _seanceHeure = (()=>{
        const _ed = state['edit_w'+CW+'_s'+idx] ? JSON.parse(state['edit_w'+CW+'_s'+idx]) : null;
        return (_ed && _ed.sched_time) ? _ed.sched_time : null;
      })();
      meteoSeance = await fetchWeatherIfGranted(_seanceHeure, _seanceDate);
    }
  }
  // Réinitialiser pour la prochaine validation
  window._meteoValidationData = null;
  // Sauvegarder la météo dans perf pour l'affichage dans Stats
  if(meteoSeance){
    const perfKey=k+'perf';
    const existing=state[perfKey]?JSON.parse(state[perfKey]):{};
    existing.meteo=meteoSeance;
    state[perfKey]=JSON.stringify(existing);
    if(dbRef) dbRef.child(perfKey).set(state[perfKey]).catch(()=>{});
    rendered.stats=false;
  }
  if(isAdmin()) showCoachFeedback(s, km, pace, hr, amImproved, idx, meteoSeance);
  else showAthleteFeedback(s, km, pace, hr, perf, meteoSeance);
}

function parsePaceToSec(paceStr){
  if(!paceStr) return null;
  const p=paceStr.split(':');
  if(p.length!==2) return null;
  return parseInt(p[0])*60+parseInt(p[1]);
}

function getHistoricalComparison(type, pace, hr){
  const history=[];
  for(let ws=1;ws<CW;ws++){
    weeks[ws-1].sessions.forEach((s,si)=>{
      if(s.type!==type) return;
      const k=gk(ws,si);
      if(!state[k+'done']) return;
      const perf=state[k+'perf']?JSON.parse(state[k+'perf']):{};
      if(!perf.pace) return;
      const sec=paceStrToSec(perf.pace);
      if(!sec) return;
      history.push({ws,sec,pace:perf.pace,hr:perf.hr?parseInt(perf.hr):null});
    });
    // Extra sessions du même type
    let ei=0;
    while(state[`extra_w${ws}_s${ei}`]){
      const es=JSON.parse(state[`extra_w${ws}_s${ei}`]);
      if(es.type===type&&state[`extra_w${ws}_s${ei}_done`]){
        const perf=state[`extra_w${ws}_s${ei}_perf`]?JSON.parse(state[`extra_w${ws}_s${ei}_perf`]):{};
        if(perf.pace){
          const sec=paceStrToSec(perf.pace);
          if(sec) history.push({ws,sec,pace:perf.pace,hr:perf.hr?parseInt(perf.hr):null,extra:true});
        }
      }
      ei++;
    }
  }
  if(history.length===0||!pace) return null;
  const curSec=paceStrToSec(pace);
  if(!curSec) return null;
  const last=history[history.length-1];
  const diffLast=last.sec-curSec;
  const pctLast=Math.round(Math.abs(diffLast)/last.sec*100);
  let hrComp=null;
  if(hr&&last.hr){
    const similar=history.filter(h=>h.hr&&Math.abs(h.hr-hr)<=5);
    if(similar.length>0){
      const bestSimilar=similar.reduce((a,b)=>b.sec<a.sec?b:a);
      const diffHr=bestSimilar.sec-curSec;
      const pctHr=Math.round(Math.abs(diffHr)/bestSimilar.sec*100);
      hrComp={pace:bestSimilar.pace,hr:bestSimilar.hr,ws:bestSimilar.ws,diff:diffHr,pct:pctHr};
    }
  }
  return {last,diffLast,pctLast,hrComp,count:history.length};
}

function showAthleteFeedback(s, km, pace, hr, perf, meteo){
  const fcMax=parseInt(state.fc_max)||0;
  const efMin=fcMax?Math.floor(fcMax*0.70):0;
  const efMax=fcMax?Math.floor(fcMax*0.75):0;
  const plannedKm=parseFloat(s.km)||0;
  const realKm=parseFloat(km)||0;
  const kmRatio=plannedKm>0?realKm/plannedKm:1;
  const hrNum=parseInt(hr)||0;
  const blocsAllure=(perf&&perf.blocsAllure)||[];
  function _ps(p){if(!p)return 0;const pts=p.split(':');if(pts.length!==2)return 0;const m=parseInt(pts[0]),sc=parseInt(pts[1]);return(isNaN(m)||isNaN(sc))?0:m*60+sc;}
  const paceSec=_ps(pace);
  const efPaceStr=state.ef_pace||'';
  const efPaceSec=_ps(efPaceStr);
  const type=s.type;
  const headerColor={ef:'#3B6D11',tempo:'#E8530A',frac:'#C4141B',long:'#534AB7',race:'#0C447C'}[type]||'#0C447C';
  let icon='✅';
  let title='Séance validée';
  let lines=[];

  if(type==='ef'){
    icon='🌿'; title='Endurance Fondamentale';
    if(fcMax&&hrNum){
      if(hrNum<=efMax) lines.push('✅ FC parfaitement dans la zone EF ('+hrNum+' bpm / cible '+efMin+'–'+efMax+' bpm) — tu coures à la bonne intensité, bravo ! 👍');
      else if(hrNum<=efMax+10) lines.push('⚠️ FC légèrement au-dessus de la zone EF ('+hrNum+' bpm / cible max '+efMax+' bpm). Essaie de ralentir un peu la prochaine fois.');
      else lines.push('🔴 FC trop élevée ('+hrNum+' bpm) pour une séance EF (zone cible : '+efMin+'–'+efMax+' bpm). N\'hésite pas à marcher quelques instants pour rester en zone.');
    } else if(pace){
      if(efPaceSec&&paceSec>=efPaceSec-15) lines.push('✅ Allure ('+pace+'/km) cohérente avec une séance EF — beau travail en endurance fondamentale 👏');
      else if(efPaceSec&&paceSec<efPaceSec-15) lines.push('⚠️ Allure ('+pace+'/km) un peu rapide pour de l\'EF (cible ~'+efPaceStr+'/km). Ralentis pour bien rester en zone basse et construire ta base.');
      else lines.push('✅ Séance EF complétée à '+pace+'/km. Pense à saisir ta FC pour un suivi encore plus précis.');
    } else {
      lines.push('✅ Séance EF dans la boîte ! Saisis ta FC et ton allure pour mieux suivre ta progression.');
    }
    if(plannedKm>0){
      if(kmRatio>=0.95&&kmRatio<=1.12) lines.push('📏 Volume parfait : '+realKm+' km réalisés sur '+plannedKm+' km prévus. 🎯');
      else if(kmRatio<0.8) lines.push('📏 '+realKm+' km sur '+plannedKm+' km prévus. Si tu t\'es écouté·e, c\'est la bonne décision — progresser sans se blesser, c\'est la priorité.');
      else if(kmRatio>1.15) lines.push('📏 Tu as dépassé le volume prévu ('+realKm+' km). Attention à la fatigue accumulée — respecte le plan sur la durée.');
      else lines.push('📏 '+realKm+' km réalisés (prévu : '+plannedKm+' km). Bien joué !');
    }
    const tips=['La règle d\'or de l\'EF : tu dois pouvoir tenir une conversation sans t\'essouffler.','L\'EF construit ta base aérobie — c\'est le socle de toute progression marathon.','Régularité > intensité : une sortie EF facile vaut mieux qu\'une sortie trop rapide.','80 % de ton entraînement devrait être en zone EF — chaque sortie douce compte !'];
    lines.push('💡 '+tips[Math.floor(Math.random()*tips.length)]);

  } else if(type==='tempo'){
    icon='🔥'; title='Séance Tempo';
    if(pace) lines.push('⚡ Allure moyenne (récupérations incluses) : '+pace+'/km.');
    if(hrNum&&fcMax){
      const tMin=Math.floor(fcMax*0.80);
      const tMax=Math.floor(fcMax*0.88);
      if(hrNum>=tMin&&hrNum<=tMax) lines.push('✅ FC dans la zone tempo ('+hrNum+' bpm / cible '+tMin+'–'+tMax+' bpm) — belle qualité de travail au seuil ! 🔥');
      else if(hrNum>tMax) lines.push('⚠️ FC élevée ('+hrNum+' bpm / cible max '+tMax+' bpm). Tu as bien sollicité ton organisme — récupère bien dans les 24–48h.');
      else lines.push('💡 FC un peu basse pour du tempo ('+hrNum+' bpm / cible '+tMin+'–'+tMax+' bpm). N\'hésite pas à pousser davantage sur les blocs la prochaine fois.');
    }
    // Analyse des blocs tempo
    const tBlocs=blocsAllure.filter(b=>b&&b.trim());
    if(tBlocs.length>0){
      const tSecs=tBlocs.map(b=>_ps(b)).filter(v=>v>0);
      if(tSecs.length>0){
        lines.push('⚡ Blocs : '+tBlocs.join(' · ')+' /km');
        if(tSecs.length>=2){
          const variation=Math.max(...tSecs)-Math.min(...tSecs);
          if(variation<=5) lines.push('✅ Excellent régularité sur les blocs (≤ 5 sec/km d\'écart) — c\'est la marque d\'un effort parfaitement contrôlé ! 🎯');
          else if(variation<=12) lines.push('📊 Bonne régularité ('+variation+' sec/km d\'écart entre les blocs) — à affiner progressivement.');
          else lines.push('⚠️ Variation de '+variation+' sec/km entre les blocs. Essaie de partir un peu moins vite pour finir plus fort — ça s\'appelle le "négatif split".');
        }
      }
    }
    if(plannedKm>0){
      if(kmRatio>=0.9) lines.push('📏 Volume bien réalisé : '+realKm+' / '+plannedKm+' km. 👏');
      else lines.push('📏 '+realKm+' km sur '+plannedKm+' km prévus — c\'est normal de ne pas toujours finir le tempo, il vaut mieux s\'arrêter proprement.');
    }
    lines.push('💡 Les séances tempo développent ton seuil lactique — c\'est la clé pour soutenir l\'allure marathon longtemps.');

  } else if(type==='frac'){
    icon='⚡'; title='Séance Fractionné';
    if(pace) lines.push('🏃 Allure moyenne (récupérations incluses) : '+pace+'/km.');
    if(hrNum&&fcMax){
      const fMin=Math.floor(fcMax*0.88);
      if(hrNum>=fMin) lines.push('✅ FC bien haute ('+hrNum+' bpm) — les intervalles ont parfaitement sollicité ton système cardiovasculaire ! 💪');
      else lines.push('💡 FC à '+hrNum+' bpm. Essaie de pousser davantage sur les répétitions pour dépasser '+fMin+' bpm et maximiser l\'effet entraînement.');
    }
    // Analyse des blocs fractionné
    const fBlocs=blocsAllure.filter(b=>b&&b.trim());
    if(fBlocs.length>0){
      const fSecs=fBlocs.map(b=>_ps(b)).filter(v=>v>0);
      if(fSecs.length>0){
        lines.push('⚡ Répétitions : '+fBlocs.join(' · ')+' /km');
        if(fSecs.length>=2){
          const variation=Math.max(...fSecs)-Math.min(...fSecs);
          const avgSec=fSecs.reduce((a,v)=>a+v,0)/fSecs.length;
          const avgStr=Math.floor(avgSec/60)+':'+(Math.round(avgSec%60)<10?'0':'')+Math.round(avgSec%60);
          lines.push('📊 Allure moy. des répétitions : '+avgStr+'/km — écart max : '+variation+' sec/km.');
          if(variation<=8) lines.push('✅ Régularité exemplaire sur les intervalles ! C\'est exactement ce qu\'on cherche. 🎯');
          else if(variation<=20) lines.push('💪 Régularité correcte — avec l\'expérience, tu doseras encore mieux l\'effort sur chaque répétition.');
          else lines.push('⚠️ Grande variation entre les répétitions ('+variation+' sec/km). Pars plus prudemment sur les premiers intervalles pour maintenir l\'allure jusqu\'à la fin.');
        }
      }
    }
    if(plannedKm>0) lines.push('📏 '+realKm+' km réalisés (prévu : '+plannedKm+' km).');
    lines.push('💡 Le fractionné développe ta VO2max et ta vitesse — c\'est l\'entraînement le plus puissant pour progresser rapidement. 🚀');

  } else if(type==='long'){
    icon='🏔️'; title='Sortie Longue';
    if(fcMax&&hrNum){
      if(hrNum<=efMax) lines.push('✅ FC parfaitement maîtrisée ('+hrNum+' bpm) sur la durée — c\'est exactement ce qu\'on cherche en sortie longue ! Excellent travail. 🌟');
      else if(hrNum<=efMax+12) lines.push('⚠️ FC un peu élevée ('+hrNum+' bpm / zone EF max '+efMax+' bpm). Ça peut arriver en fin de sortie ou par chaleur — pars un peu plus doucement la prochaine fois.');
      else lines.push('🔴 FC trop haute ('+hrNum+' bpm) pour une sortie longue. Ralentis davantage — l\'objectif est d\'accumuler du temps en zone basse, pas de te fatiguer.');
    }
    if(plannedKm>0){
      if(kmRatio>=0.9&&kmRatio<=1.05) lines.push('📏 Excellent volume : '+realKm+' km (prévu : '+plannedKm+' km) — la sortie longue construit ta résistance à l\'effort prolongé. 💪');
      else if(realKm>=25) lines.push('📏 Belle sortie longue de '+realKm+' km ! Ce type de séance est fondamental pour le marathon. 🏅');
      else if(kmRatio<0.8) lines.push('📏 '+realKm+' km sur '+plannedKm+' km prévus. S\'arrêter à temps quand on ressent la fatigue, c\'est la bonne décision — la récupération fait partie de l\'entraînement.');
      else lines.push('📏 '+realKm+' km réalisés (prévu : '+plannedKm+' km). Bien joué !');
    }
    lines.push('💡 La sortie longue est la reine du marathon — chaque km en zone EF renforce tes mitochondries et ta résistance à la fatigue. 🏆');

  } else {
    icon='🏁'; title='Séance validée';
    lines.push('✅ Séance complétée ! Bravo 💪');
    if(realKm) lines.push('📏 '+realKm+' km réalisés.');
    if(pace) lines.push('⚡ Allure : '+pace+'/km.');
  }

  // Contexte météo si disponible
  if(meteo&&meteo.temperature){
    const elevFC=(meteo.impact_performance&&meteo.impact_performance.elevation_fc_bpm)||0;
    if(elevFC>0){
      lines.push('🌡️ Séance par '+meteo.temperature+'°C (ressenti '+meteo.ressenti+'°C) : la chaleur a naturellement élevé ta FC de ~'+elevFC+' bpm — tiens-en compte dans l\'analyse de ton effort.');
    } else {
      lines.push('🌤️ Conditions idéales : '+meteo.temperature+'°C — parfait pour courir !');
    }
  }

  const nbWarnings=lines.filter(l=>l.startsWith('⚠️')||l.startsWith('🔴')).length;
  const nbOk=lines.filter(l=>l.startsWith('✅')).length;
  let overall;
  if(nbWarnings===0&&nbOk>0) overall='Belle séance, continue comme ça ! 💪';
  else if(nbWarnings>=2) overall='Séance dans la boîte — récupère bien ! 🛌';
  else overall='Chaque sortie te rapproche de l\'objectif 🎯';

  const mc=document.getElementById('modal-container');
  // Vider immédiatement pour annuler tout timer de closeModal en cours
  mc.innerHTML='';
  _lockBodyScroll();
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.style.setProperty('--_overlay-bg','rgba(0,0,0,0.4)');
  overlay.innerHTML=`<div class="modal-box" style="max-height:88vh;">
    <div style="background:${headerColor};padding:16px 16px 14px;border-radius:24px 24px 0 0;color:#fff;flex-shrink:0;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <p style="font-size:10px;font-weight:800;opacity:0.75;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:2px;">${icon} Analyse de ta séance</p>
          <p style="font-size:20px;font-weight:900;letter-spacing:-0.02em;">${title}</p>
          <p style="font-size:13px;opacity:0.9;margin-top:3px;font-weight:600;">${overall}</p>
        </div>
      </div>
    </div>
    <div class="modal-scroll-body">
      <div style="padding:16px;">
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${lines.map(l=>`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:12px 14px;font-size:14px;font-weight:600;color:var(--text);line-height:1.5;">${l}</div>`).join('')}
        </div>
        <button onclick="closeModal()" style="margin-top:20px;width:100%;padding:15px;background:${headerColor};border:none;border-radius:14px;font-size:15px;font-weight:800;color:#fff;cursor:pointer;letter-spacing:0.01em;">👍 J'ai lu mon analyse</button>
      </div>
    </div>
  </div>`;
  // Pas de fermeture au tap en dehors : l'utilisateur doit cliquer le bouton
  mc.appendChild(overlay);
}

function showCoachFeedback(s, km, pace, hr, amImproved, idx, meteo){

  // Calcul du contexte enrichi pour l'IA
  const analysisContext = {};

  // Données de base
  analysisContext.type = s.type;
  analysisContext.titre = s.d.split('|')[0];
  analysisContext.kmPlan = s.km;
  analysisContext.chaussure = s.shoe || 'non renseigné';
  analysisContext.kmRealise = km;
  analysisContext.allure = pace;
  analysisContext.fc = hr;
  analysisContext.semaine = CW;

  // Structure complète de la séance (partie après |)
  const _seanceDetail = s.d.includes('|') ? s.d.split('|')[1] : null;
  if(_seanceDetail) analysisContext.structure_seance = _seanceDetail;

  // Détecter les blocs AM dans les sorties longues
  if((s.type==='long'||s.type==='ef') && _seanceDetail){
    const amMatch = _seanceDetail.match(/(\d+)\s*AM\s*[@à]\s*([\d'']+\/km)/i);
    const amKmMatch = _seanceDetail.match(/(\d+)\s*AM/i);
    if(amMatch || amKmMatch){
      const amPace = amMatch ? amMatch[2] : null;
      const amKm = amKmMatch ? parseInt(amKmMatch[1]) : null;
      // Extraire structure complète : ex "10 EF · 2 AM @ 5'22/km · 4 EF"
      const parts = _seanceDetail.split(/[·•]/);
      analysisContext.blocs_am = {
        present: true,
        km_am: amKm,
        allure_cible_am: amPace || getMarathonPaceStr(),
        structure: _seanceDetail.trim(),
        INSTRUCTION: `RÈGLE CRITIQUE — SÉANCE AVEC BLOCS ALLURE MARATHON : Cette sortie longue N'EST PAS une sortie EF pure. Elle est structurée ainsi : "${_seanceDetail.trim()}". L'allure globale (${pace}/km) est une MOYENNE incluant les phases EF lentes ET les blocs AM rapides. NE PAS évaluer l'allure globale comme si c'était une allure EF. Analyser SÉPARÉMENT : (1) les km en EF et leur cohérence avec la zone EF, (2) les ${amKm||'X'} km en allure marathon et leur exécution par rapport à la cible ${amPace||getMarathonPaceStr()}. Si des splits Strava sont disponibles, identifier quels km correspondent aux blocs AM.`
      };
    }
  }

  // Allure marathon
  analysisContext.allureMarathon = getMarathonPaceStr();
  analysisContext.semaines_restantes = 32 - CW;
  // Météo de la séance — avec instruction explicite pour le coach
  if (meteo) {
    analysisContext.meteo = meteo;
    const imp = meteo.impact_performance || {};
    if (imp.elevation_fc_bpm > 0) {
      // Instruction critique : le coach DOIT corriger la FC mesurée
      analysisContext.INSTRUCTION_METEO = [
        `CHALEUR ${meteo.temperature}°C (ressenti ${meteo.ressenti}°C) — RÈGLES OBLIGATOIRES :`,
        `1. FC effective = FC mesurée - ${imp.elevation_fc_bpm} bpm (Mora-Rodriguez). NE JAMAIS évaluer la FC brute sans appliquer cette correction.`,
        `2. Perte de performance attendue : -${imp.perte_perf_pct}%. Allure ralentie de +${imp.ralent_sec_km} sec/km = NORMAL et SOUHAITABLE.`,
        `3. Zone EF effective : ${imp.zone_ef_ajustee || '140-148 bpm'}. Comparer FC effective (= FC mesurée - ${imp.elevation_fc_bpm}) à cette zone.`,
        `4. NE PAS critiquer une allure lente ou une FC haute sans signaler d'abord l'impact chaleur.`,
        `5. Commencer l'analyse par : "Avec ${meteo.temperature}°C, la chaleur a ajouté +${imp.elevation_fc_bpm} bpm — ta FC effective était..."`,
      ].join(' ');
    } else {
      analysisContext.INSTRUCTION_METEO = `Conditions idéales (${meteo.temperature}°C). Pas d'impact chaleur — analyser FC et allures normalement.`;
    }
  }

  // Changement allure marathon
  if(amImproved==='improved') analysisContext.allureMarathonUpdate = 'amelioree';
  if(amImproved==='regressed') analysisContext.allureMarathonUpdate = 'revisee_a_la_baisse';

  // Écart avec objectif Sub4h
  (()=>{
    const objectifSec = Math.ceil(4*3600/42.195); // ~341 sec = 5'41/km
    const amSec = paceStrToSec(getMarathonPaceStr());
    if(amSec) {
      const ecart = amSec - objectifSec;
      analysisContext.ecart_sub4h = {
        allure_actuelle: getMarathonPaceStr(),
        allure_objectif: "5'41",
        ecart_sec: Math.round(ecart),
        statut: ecart <= 0 ? 'objectif_atteint' : ecart <= 10 ? 'tres_proche' : ecart <= 30 ? 'dans_la_cible' : 'encore_du_travail'
      };
    }
  })();

  // Allure attendue pour cette séance
  (()=>{
    const efActuelle = getBestEfPace() || "6'40";
    if(s.type==='ef' || s.type==='long') {
      if(analysisContext.blocs_am && analysisContext.blocs_am.present){
        analysisContext.allure_attendue = `Structure mixte : phases EF à ${efActuelle}/km + ${analysisContext.blocs_am.km_am||'X'} km AM à ${analysisContext.blocs_am.allure_cible_am} — allure globale = moyenne des deux`;
      } else {
        analysisContext.allure_attendue = efActuelle + '/km (allure EF actuelle)';
      }
    } else if(s.type==='tempo' || s.type==='frac') {
      const detail = s.d.split('|')[1]||'';
      const paceMatch = detail.match(/(\d+)[':'](\d+)\s*[—\-]+\s*(\d+)[':'](\d+)/);
      const label = s.type==='frac' ? 'blocs fractionné' : 'blocs tempo';
      if(paceMatch) analysisContext.allure_attendue = paceMatch[1]+':'+paceMatch[2]+' — '+paceMatch[3]+':'+paceMatch[4]+'/km ('+label+')';
    } else if(s.type==='long') {
      analysisContext.allure_attendue = efActuelle + '/km (EF longue)';
    }
  })();

  // Seuils FC
  if(hr){
    if(s.type==='ef'||s.type==='long'){
      analysisContext.fcSeuil = 148;
      analysisContext.fcAnalyse = hr<=148?'bonne_maitrise':hr<=158?'un_peu_elevee':'trop_elevee';
      analysisContext.fcComptePourCalcAM = hr<=148;
    } else if(s.type==='tempo'||s.type==='frac'){
      analysisContext.fcSeuil = s.type==='frac'?170:165;
      const seuil=analysisContext.fcSeuil;
      analysisContext.fcAnalyse = hr<=seuil?'correct':hr<=seuil+7?'un_peu_eleve':'trop_eleve';
    }
  }

  // Pour Tempo/Frac : calcul allure globale attendue
  if((s.type==='tempo'||s.type==='frac')&&pace&&km){
    const detail=s.d.split('|')[1]||'';
    const title=s.d.split('|')[0]||'';
    const repMatch=title.match(/(\d+)×(\d+)/);
    const paceMatch=detail.match(/(\d+)['':](\d+)[^0-9]+(\d+)['':](\d+)/);
    if(repMatch&&paceMatch){
      const reps=parseInt(repMatch[1]);
      const durMin=parseInt(repMatch[2]);
      const pMin=parseInt(paceMatch[1])*60+parseInt(paceMatch[2]);
      const pMax=parseInt(paceMatch[3])*60+parseInt(paceMatch[4]);
      const pMoy=(pMin+pMax)/2;
      const kmRapide=reps*(durMin*60/pMoy);
      const kmTotal=parseFloat(km);
      const kmEF=Math.max(0,kmTotal-kmRapide);
      const efPaceStr=getBestEfPace()||"6'40";
      const efSec=parsePaceToSec(efPaceStr.replace("'",':'));
      const allureMoyAttendueSec=kmTotal>0?((kmRapide*pMoy)+(efSec>0?kmEF*efSec:0))/kmTotal:0;
      const actual=parsePaceToSec(pace);
      if(actual&&allureMoyAttendueSec>0){
        const minA=Math.floor(allureMoyAttendueSec/60);
        const secA=Math.round(allureMoyAttendueSec%60);
        // Récupérer les allures de blocs saisies
        const blocsAllureSaisis=(idx!=null&&state[gk(CW,idx)+'perf'])?JSON.parse(state[gk(CW,idx)+'perf']).blocsAllure||[]:[];

        analysisContext.tempoDetail = {
          reps, dureeMin: durMin,
          allureCibleBlocs: detail.match(/[\d:'']+\s*[—-]\s*[\d:'']+/)?.[0]||'',
          kmRapide: Math.round(kmRapide*10)/10,
          kmEF: Math.round(kmEF*10)/10,
          allureEFBase: efPaceStr,
          allureGlobaleAttendue: `${minA}:${secA.toString().padStart(2,'0')}`,
          allureGlobaleReelle: pace,
          ecartSecondes: Math.round(actual - allureMoyAttendueSec),
          interpretation: Math.abs(actual-allureMoyAttendueSec)<=5?'dans_la_cible':actual>allureMoyAttendueSec?'trop_lent':'trop_rapide',
          allureParBloc: blocsAllureSaisis.length>0 ? blocsAllureSaisis.map((a,i)=>({bloc:i+1,allure:a||'non_renseigné'})) : null
        };
      }
    }
  }

  // Comparaison historique
  if(pace&&(s.type==='ef'||s.type==='tempo'||s.type==='frac'||s.type==='long')){
    const comp=getHistoricalComparison(s.type,pace,hr);
    if(comp){
      analysisContext.historique = {
        derniereSemaine: comp.last.ws,
        derniereAllure: comp.last.pace,
        evolutionPct: comp.pctLast,
        tendance: comp.diffLast>2?'progression':comp.diffLast<-2?'regression':'stable'
      };
      if(comp.hrComp&&hr){
        analysisContext.historique.fcComparaison = {
          fcActuelle: hr, fcPrecedente: comp.hrComp.hr,
          evolutionAllureMemeFC: comp.hrComp.pct+'%',
          semainePrecedente: comp.hrComp.ws
        };
      }
    }
  }

  // Historique récent
  const historyData=[];
  for(let ws=Math.max(1,CW-8);ws<CW;ws++){
    weeks[ws-1].sessions.forEach((sess,si)=>{
      const k=gk(ws,si);
      if(!state[k+'done']) return;
      const perf=state[k+'perf']?JSON.parse(state[k+'perf']):{};
      historyData.push({semaine:ws,type:sess.type,km:state[k+'km']||sess.km,date_reelle:perf.date||null,...perf});
    });
    // Extra sessions
    let ei=0;
    while(state[`extra_w${ws}_s${ei}`]){
      if(state[`extra_w${ws}_s${ei}_done`]){
        const es=JSON.parse(state[`extra_w${ws}_s${ei}`]);
        const perf=state[`extra_w${ws}_s${ei}_perf`]?JSON.parse(state[`extra_w${ws}_s${ei}_perf`]):{};
        historyData.push({semaine:ws,type:es.type,km:state[`extra_w${ws}_s${ei}_km`]||es.km,date_reelle:perf.date||null,extra:true,...perf});
      }
      ei++;
    }
  }

  // Fermer le modal de validation et aller dans le Coach
  closeModal();
  showScreen('coach');
  // Créer la bulle avec id fixe pour le streaming
  (()=>{
    const container = document.getElementById('coach-messages');
    if(!container) return;
    const nowD = new Date();
    const dStr = nowD.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
    const lastSep = container.querySelector('.chat-date-sep:last-of-type');
    if(!lastSep||lastSep.dataset.date!==dStr){
      const sep=document.createElement('div');
      sep.className='chat-date-sep';
      sep.dataset.date=dStr;
      sep.textContent=dStr.charAt(0).toUpperCase()+dStr.slice(1);
      container.appendChild(sep);
    }
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:flex-start;gap:8px;';
    wrap.innerHTML = '<div style="width:32px;height:32px;border-radius:50%;background:#0C447C;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span style="font-size:14px;">🤖</span></div>'
      + '<div style="max-width:85%;background:#fff;border-radius:4px 14px 14px 14px;padding:12px 14px;border-left:3px solid rgba(12,68,124,0.15);">'
      + '<div id="coach-analysis-stream" style="font-size:14px;color:var(--text);line-height:1.7;"><div class="coach-typing"><span>Le Coach analyse ta séance</span><div class="coach-typing-dots"><i></i><i></i><i></i></div></div></div>'
      + '<p style="font-size:10px;color:var(--muted);margin-top:4px;text-align:right;">'
      + nowD.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})+'</p></div>';
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
  })();

  // Ajouter les séances à venir (prochaines 3)
  const joursAbr = ['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  const joursComplets = ['','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  const now = new Date();
  const todayDow = now.getDay()===0 ? 7 : now.getDay(); // 1=lun ... 7=dim
  const todayNomComplet = joursComplets[todayDow];
  const todayNomAbr = joursAbr[todayDow];
  const heureActuelle = now.getHours() + now.getMinutes()/60;

  // Indiquer le jour réel de la séance validée
  // Renfo semaine courante
  analysisContext.renfo_semaine = [1,2].filter(r => !!state[rfk(CW,r)+'done']).length + '/2 faits';
  analysisContext.jourSeanceValidee = todayNomComplet;
  analysisContext.heureSeanceValidee = now.getHours()+'h'+(now.getMinutes()<10?'0':'')+now.getMinutes();

  const seancesAVenir = [];
  // Séances restantes semaine courante
  getOrderedWeekSessions(CW).forEach(({s:s2,si,extra,ei})=>{
    if(seancesAVenir.length >= 3) return;
    const done = extra ? !!state['extra_w'+CW+'_s'+ei+'_done'] : !!state[gk(CW,si)+'done'];
    if(done) return;
    const edRaw = !extra && state['edit_w'+CW+'_s'+si];
    const ed = edRaw ? JSON.parse(edRaw) : null;
    const titre = ed ? ed.d.split('|')[0] : s2.d.split('|')[0];
    const detail = ed ? (ed.d.split('|')[1]||'') : (s2.d.split('|')[1]||'');
    const type = ed ? ed.type : s2.type;
    const km = ed ? ed.km : s2.km;
    // Pour les extras, lire sched_day/sched_time depuis s2 directement
    const schedDay = extra ? s2.sched_day : (ed && ed.sched_day);
    const schedTime = extra ? s2.sched_time : (ed && ed.sched_time);
    const jour = schedDay ? joursAbr[schedDay] : '';
    const jourComplet = schedDay ? joursComplets[schedDay] : '';
    const heure = schedTime || '';

    let heuresAvant = null;
    if(schedDay) {
      const diffJours = ((schedDay - todayDow) + 7) % 7;
      const heureSeance = schedTime ? parseInt(schedTime.split(':')[0]) + parseInt(schedTime.split(':')[1]||0)/60 : 12;
      heuresAvant = Math.round(diffJours * 24 + (heureSeance - heureActuelle));
    }

    seancesAVenir.push({
      semaine: CW,
      type,
      titre,
      detail: detail||undefined,
      km,
      quand: (jourComplet ? jourComplet+(heure?' à '+heure:'') : 'non planifié'),
      heures_avant_seance: heuresAvant !== null ? heuresAvant+'h avant cette séance (depuis maintenant) — NE PAS RECALCULER' : 'non calculable (pas d\'horaire planifié)'
    });
  });
  // Séances semaine suivante si pas assez
  if(seancesAVenir.length < 3 && CW < 32){
    weeks[CW].sessions.slice(0, 3-seancesAVenir.length).forEach((sess,si)=>{
      // Lire les éditions de la semaine suivante aussi
      const edRawNext = state['edit_w'+(CW+1)+'_s'+si];
      const edNext = edRawNext ? JSON.parse(edRawNext) : null;
      const titreNext = edNext ? edNext.d.split('|')[0] : sess.d.split('|')[0];
      const typeNext = edNext ? edNext.type : sess.type;
      const kmNext = edNext ? edNext.km : sess.km;
      seancesAVenir.push({semaine:CW+1, type:typeNext, titre:titreNext, km:kmNext, quand:'semaine prochaine', note:'chaussures non déterminées — ne pas mentionner de chaussures spécifiques pour les séances futures'});
    });
  }
  if(seancesAVenir.length > 0) analysisContext.seancesAVenir = seancesAVenir;

  // Stocker la séance validée pour le contexte du chat
  window._lastValidatedSession = {
    type: s.type,
    titre: s.d.split('|')[0],
    km: km,
    pace: pace,
    hr: hr,
    semaine: CW,
    timestamp: Date.now(),
    garmin: window._garminActivityData || null
  };

  // Ajouter les données Strava enrichies au contexte d'analyse si disponibles
  if(window._garminActivityData) {
    const g = window._garminActivityData;
    const splitsClean = g.splits ? g.splits.filter(sp => sp.distanceKm && sp.distanceKm >= 0.5) : null;
    analysisContext.strava = {
      cadence: g.cadence || null,
      fcMax: g.fcMax || null,
      denivele_pos: g.denivele_pos != null ? g.denivele_pos : null,
      denivele_neg: g.denivele_neg != null ? g.denivele_neg : null,
      puissance_moy: g.puissance_moy || null,
      calories: g.calories || null,
      best_400m: g.best_400m || null,
      zones_fc: g.zones_fc || null,
      splits: splitsClean ? splitsClean.map(sp => ({
        km: sp.km,
        allure: sp.allure,
        fc: sp.fc,
        denivele: sp.denivele || null
      })) : null,
      note_coach: [
        g.cadence ? `Cadence moyenne : ${g.cadence} spm${g.cadence < 165 ? ' (trop basse — foulée trop longue)' : g.cadence >= 175 ? ' (bonne cadence)' : ' (correct)'}` : null,
        g.fcMax ? `FC max atteinte : ${g.fcMax} bpm` : null,
        g.denivele_pos ? `Dénivelé positif : ${g.denivele_pos}m` : null,
        splitsClean && splitsClean.length > 1 ? `Km le plus rapide : km${splitsClean.reduce((a,b) => (a.allure||'9:99') < (b.allure||'9:99') ? a : b).km} (${splitsClean.reduce((a,b) => (a.allure||'9:99') < (b.allure||'9:99') ? a : b).allure})` : null,
        splitsClean && splitsClean.length > 1 ? `Km le plus lent : km${splitsClean.reduce((a,b) => (a.allure||'0:00') > (b.allure||'0:00') ? a : b).km} (${splitsClean.reduce((a,b) => (a.allure||'0:00') > (b.allure||'0:00') ? a : b).allure})` : null,
      ].filter(Boolean)
    };
    // Réinitialiser après utilisation
    window._garminActivityData = null;
  }

  fetchCoachAnalysis(s, km, pace, hr, analysisContext, historyData);
}

async function fetchCoachAnalysis(s, km, pace, hr, analysisContext, historyData) {
  try {
    let coachMemos = '';
    try { const ms = await dbRef.child('_coach_memos').once('value'); coachMemos = ms.val()||''; } catch(e){}
    // Construire le compact context pour accéder aux variables locales
    const _cc = buildCompactContext(coachMemos, [], 'maintenant', new Date().getHours());
    const response = await fetch('https://us-central1-prepa-marathon.cloudfunctions.net/analyzeSession', {
      method: 'POST',
      headers: await authHeaders(true),
      body: JSON.stringify({
        sessionData: analysisContext,
        historyData: historyData || [],
        planContext: Object.assign({}, _cc, {
          // Champs spécifiques au débrief de séance
          semaineActuelle: CW, totalSemaines: 32,
          allureMarathon: getMarathonPaceStr(),
          semaines_restantes: 32-CW,
          type_semaine: [8,12,16,20,26,30].includes(CW) ? 'DÉCHARGE' : 'NORMALE',
          fc_repos: state['fc_repos'] || 51,
          date_reelle: (()=>{
            const _n=new Date();
            const _jNoms=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
            const _mNoms=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
            return {complet:_jNoms[_n.getDay()]+' '+_n.getDate()+' '+_mNoms[_n.getMonth()]+' '+_n.getFullYear(),jour:_jNoms[_n.getDay()],numero:_n.getDate(),heure:_n.getHours()+'h'+String(_n.getMinutes()).padStart(2,'0'),note:'Utilise UNIQUEMENT cette date. Ne jamais deviner ou calculer.'};
          })(),
          renfoStatus: [{r:1,name:'Ischio-fessiers'},{r:2,name:'Bas du dos'}].map(rd=>{
            const done=!!state[rfk(CW,rd.r)+'done'];
            const schedRaw=state[rfk(CW,rd.r)+'sched'];
            const sched=schedRaw?JSON.parse(schedRaw):null;
            const jours=['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
            const quand=sched&&sched.day?jours[sched.day]+(sched.time?' à '+sched.time:''):'non planifié';
            return `${rd.name}: ${done?'✓ fait':'à faire ('+quand+')'}`;
          }).join(' | '),
          date_marathon: '18 octobre 2026',
          km_semaine_en_cours: {planifie: getWeekTotalKm(CW), realise: calcWeekDoneKm()},
          seances_recentes_detail: (()=>{const det=[];for(let ws=CW;ws>=Math.max(1,CW-8);ws--){weeks[ws-1].sessions.forEach((sess,si)=>{const k=gk(ws,si);if(!state[k+'done'])return;const perf=state[k+'perf']?JSON.parse(state[k+'perf']):{};det.push({semaine:ws,type:sess.type,titre:sess.d.split('|')[0],km:state[k+'km']||sess.km,allure:perf.pace||null,fc_moy:perf.hr||null,strava:perf.strava||null});});let ei=0;while(state["extra_w"+ws+"_s"+ei]){if(state["extra_w"+ws+"_s"+ei+"_done"]){const es=JSON.parse(state["extra_w"+ws+"_s"+ei]);const perf=state["extra_w"+ws+"_s"+ei+"_perf"]?JSON.parse(state["extra_w"+ws+"_s"+ei+"_perf"]):{};det.push({semaine:ws,type:es.type,titre:es.d.split('|')[0],extra:true,km:state["extra_w"+ws+"_s"+ei+"_km"]||es.km,allure:perf.pace||null,fc_moy:perf.hr||null,strava:null});}ei++;}}return det.slice(0,15);})(),
          derniere_seance: _cc.derniere_seance || null,
          seances_a_venir: (()=>{
            const av=[]; const joursC=['','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
            const nowD=new Date(); const tDow=nowD.getDay()===0?7:nowD.getDay(); const hA=nowD.getHours()+nowD.getMinutes()/60;
            getOrderedWeekSessions(CW).forEach(({s:s2,si,extra,ei})=>{
              if(av.length>=3)return;
              const done=extra?!!state['extra_w'+CW+'_s'+ei+'_done']:!!state[gk(CW,si)+'done'];
              if(done)return;
              const edRaw=!extra&&state['edit_w'+CW+'_s'+si];
              const ed=edRaw?JSON.parse(edRaw):null;
              const titre=ed?ed.d.split('|')[0]:s2.d.split('|')[0];
              const type=ed?ed.type:s2.type; const km=ed?ed.km:s2.km;
              const jourC=ed&&ed.sched_day?joursC[ed.sched_day]:'';
              const heure=ed&&ed.sched_time?ed.sched_time:'';
              let hAvant=null;
              if(ed&&ed.sched_day){const dJ=((ed.sched_day-tDow)+7)%7;const hS=heure?parseInt(heure.split(':')[0])+parseInt(heure.split(':')[1]||0)/60:12;hAvant=Math.round(dJ*24+(hS-hA));}
              av.push({type,titre,km,quand:jourC+(heure?' à '+heure:'non planifié'),heures_avant_seance:hAvant!==null?hAvant+'h':'?'});
            });
            return av;
          })(),
          charge_semaine: (()=>{const kmF=calcWeekDoneKm();const kmP=getWeekTotalKm(CW);const kmPrev=CW>1?getWeekTotalKm(CW-1):kmP;return {realise:kmF,planifie:kmP,ratio_vs_precedente:kmPrev>0?Math.round(kmP/kmPrev*100)/100:null,statut:kmF<kmP?'EN_COURS':'TERMINÉE'};})(),
          infos_importantes_Guillaume: coachMemos||undefined,
          absences_semaine: state['absences_cw'+CW]||null,
          chaussures_plan_verite: "Zoom Fly : première utilisation planifiée S26 (31/08/2026), jamais avant.",
        }),
        chatHistoriqueRecent: coachHistory.slice(-6).map(m=>({
          role: m.role==='user'?'Guillaume':'Coach',
          contenu: m.content.slice(0,200)
        }))
      })
    });
    // Lire tout le stream puis afficher d'un coup avec fade-in
    const container = document.getElementById('coach-messages');
    const textEl = document.getElementById('coach-analysis-stream');
    if(textEl) {
      textEl.style.opacity = '1';
      textEl.innerHTML = '<div class="coach-typing"><span>Le Coach analyse ta séance</span><div class="coach-typing-dots"><i></i><i></i><i></i></div></div>';
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '', buffer = '';

    while(true) {
      const {done, value} = await reader.read();
      if(done) break;
      buffer += decoder.decode(value, {stream:true});
      const lines = buffer.split('\n'); buffer = lines.pop();
      for(const line of lines) {
        if(!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if(data==='[DONE]') continue;
        try { const parsed = JSON.parse(data); if(parsed.token) fullText += parsed.token; } catch(e) {}
      }
    }

    // Afficher d'un coup avec fade-in
    if(textEl) {
      textEl.style.transition = 'opacity 0.35s ease';
      textEl.innerHTML = fullText
        ? renderCoachText(cleanTruncated(fullText))
        : '<p style="color:var(--muted);font-style:italic;">Analyse non disponible.</p>';
      requestAnimationFrame(() => { textEl.style.opacity = '1'; });
      if(container) container.scrollTop = container.scrollHeight;
    }

        // ── Mise à jour automatique des mémos après débrief ─────────────────
    // Le débrief contient les données réelles de la séance → parfait pour
    // détecter si un problème mémorisé est résolu (ex: allures respectées)
    if(fullText) {
      // Injecter le débrief dans l'historique temporairement pour extractMemos
      const debriefContext = [
        {role:'assistant', content: '[DEBRIEF SÉANCE] ' + fullText}
      ];
      extractAndSaveMemosWithContext(debriefContext);
    }
  } catch(e) {
    const textEl = document.getElementById('coach-analysis-stream');
    if(textEl) textEl.innerHTML = '<p style="color:var(--muted);font-style:italic;">Analyse temporairement indisponible.</p>';
  }
}

// ── GARMIN IMPORT ─────────────────────────────────────────────────────────────
// ── MÉTÉO VALIDATION — bouton "Météo" dans le modal ─────────────────────────

// Stocker la météo importée manuellement pour la validation en cours
window._meteoValidationData = null;

async function _getCityFromCoords(lat, lng) {
  // Reverse geocoding via Nominatim (OSM) — gratuit, sans clé
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=fr`, {
      headers: { 'Accept-Language': 'fr', 'User-Agent': 'PrepaMarathonApp/1.0' }
    });
    const d = await r.json();
    // Préférer la ville, puis le village, puis le comté
    const city = d.address?.city || d.address?.town || d.address?.village || d.address?.municipality || d.address?.county || 'Position GPS';
    const country = d.address?.country || '';
    return country && country !== 'France' ? `${city}, ${country}` : city;
  } catch(e) {
    return 'Position GPS';
  }
}

async function importMeteoValidation() {
  const btn = document.getElementById('meteo-val-btn');
  const preview = document.getElementById('meteo-val-preview');
  if (!btn) return;

  // ── Icône soleil SVG réutilisable ─────────────────────────────────────────
  const SVG_SUN = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

  // ── Skeleton loader dans le preview ──────────────────────────────────────
  function showSkeleton(step) {
    if (!preview) return;
    preview.style.display = 'block';
    preview.style.opacity = '1';
    const pulseStyle = 'background:linear-gradient(90deg,rgba(12,68,124,0.07) 25%,rgba(12,68,124,0.13) 50%,rgba(12,68,124,0.07) 75%);background-size:200% 100%;animation:_skPulse 1.4s ease-in-out infinite;border-radius:6px;';
    if (step === 1) {
      preview.innerHTML = `
        <style>@keyframes _skPulse{0%,100%{background-position:200% 0}50%{background-position:0 0}}</style>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="${pulseStyle}width:32px;height:32px;border-radius:50%;"></div>
            <div>
              <div style="${pulseStyle}width:90px;height:13px;margin-bottom:5px;"></div>
              <div style="${pulseStyle}width:60px;height:10px;"></div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="${pulseStyle}width:48px;height:22px;margin-bottom:5px;margin-left:auto;"></div>
            <div style="${pulseStyle}width:70px;height:10px;margin-left:auto;"></div>
          </div>
        </div>
        <div style="display:flex;gap:8px;">
          <div style="${pulseStyle}width:100px;height:22px;"></div>
          <div style="${pulseStyle}width:80px;height:22px;"></div>
          <div style="${pulseStyle}width:120px;height:22px;"></div>
        </div>
        <div style="margin-top:8px;font-size:10px;color:#888;">📍 Localisation en cours…</div>`;
    } else if (step === 2) {
      preview.innerHTML = preview.innerHTML.replace(
        '📍 Localisation en cours…',
        '🌡️ Récupération des données météo…'
      );
    }
  }

  // ── Démarrer ──────────────────────────────────────────────────────────────
  btn.innerHTML = SVG_SUN + ' <span style="opacity:0.7">Localisation…</span>';
  btn.disabled = true;
  showSkeleton(1);

  try {
    const pos = await _getPosition();
    if (!pos) {
      if (preview) {
        preview.innerHTML = '<div style="text-align:center;padding:10px;color:#999;font-size:12px;">📍 Géolocalisation refusée — autorise-la dans les réglages du navigateur</div>';
      }
      btn.innerHTML = SVG_SUN + ' Météo';
      btn.style.background = '#0C447C';
      btn.disabled = false;
      return;
    }

    // Étape 2 : on a la position, on fetch météo + ville
    btn.innerHTML = SVG_SUN + ' <span style="opacity:0.7">Météo…</span>';
    showSkeleton(2);

    const { lat, lng } = pos;
    const [city, meteo] = await Promise.all([
      _getCityFromCoords(lat, lng),
      fetchWeatherForContext(null, null)
    ]);

    if (!meteo) {
      if (preview) {
        preview.style.display = 'block';
        preview.innerHTML = '<div style="text-align:center;padding:10px;color:#999;font-size:12px;">📡 Réseau indisponible — <span onclick="importMeteoValidation()" style="color:#0C447C;cursor:pointer;text-decoration:underline;font-weight:600;">Réessayer ↺</span></div>';
      }
      btn.innerHTML = SVG_SUN + ' Météo';
      btn.style.background = '#0C447C';
      btn.disabled = false;
      return;
    }

    meteo.ville = city;
    meteo.coordonnees = { lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 };
    window._meteoValidationData = meteo;

    // ── Couleurs & labels impact ────────────────────────────────────────────
    const impactColors  = { IDEAL:'#2E7D32', MODERE:'#E65100', ELEVE:'#C62828', EXTREME:'#B71C1C', HUMIDE:'#1565C0', FROID:'#37474F' };
    const impactLabels  = { IDEAL:'Idéal ✅', MODERE:'Chaleur modérée', ELEVE:'Forte chaleur', EXTREME:'Chaleur extrême ⚠️', HUMIDE:'Humide', FROID:'Froid' };
    const niveau        = meteo.impact_performance?.niveau || 'IDEAL';
    const impactColor   = impactColors[niveau] || '#2E7D32';
    const impactLabel   = impactLabels[niveau] || niveau;
    const condIcon      = meteo.conditions?.split(' ').pop() || '🌤️';
    const elevFC        = meteo.impact_performance?.elevation_fc_bpm || 0;

    // ── Afficher le résultat avec une légère animation d'entrée ────────────
    if (preview) {
      preview.style.opacity = '0';
      preview.style.transition = 'opacity 0.3s ease';
      preview.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:22px;line-height:1;">${condIcon}</span>
            <div>
              <p style="font-size:13px;font-weight:700;color:#0C447C;margin:0;">${city}</p>
              <p style="font-size:10px;color:#888;margin:2px 0 0;">${meteo.conditions}</p>
            </div>
          </div>
          <div style="text-align:right;">
            <p style="font-size:24px;font-weight:800;color:#0C447C;margin:0;line-height:1;">${meteo.temperature}°C</p>
            <p style="font-size:10px;color:#888;margin:3px 0 0;">Ressenti <b>${meteo.ressenti}°C</b></p>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:${niveau !== 'IDEAL' ? '6px' : '4px'};">
          <span style="background:rgba(12,68,124,0.08);border-radius:12px;padding:4px 10px;font-size:11px;color:#0C447C;">💧 ${meteo.humidite}%</span>
          <span style="background:rgba(12,68,124,0.08);border-radius:12px;padding:4px 10px;font-size:11px;color:#0C447C;">💨 ${meteo.vent_kmh} km/h</span>
          <span style="background:${impactColor}18;border-radius:12px;padding:4px 10px;font-size:11px;font-weight:700;color:${impactColor};">${impactLabel}</span>
          ${elevFC > 0 ? `<span style="background:#FF6F0018;border-radius:12px;padding:4px 10px;font-size:11px;font-weight:600;color:#E65100;">❤️ FC +${elevFC} bpm attendus</span>` : ''}
        </div>
        ${niveau !== 'IDEAL' ? `<p style="font-size:10px;color:#666;margin:0 0 4px;font-style:italic;line-height:1.4;">${meteo.impact_performance?.conseil}</p>` : ''}
        <p style="font-size:9px;color:#aaa;margin:0;">${isAdmin()?'✅ Transmis au Coach IA pour l\'analyse de ta séance':'📊 Météo enregistrée pour cette séance'}</p>`;
      // Fade in
      requestAnimationFrame(() => { preview.style.opacity = '1'; });
    }

    btn.innerHTML = `✅ ${city}`;
    btn.style.background = '#2E7D32';
    btn.disabled = false;

  } catch(e) {
    if (preview) preview.innerHTML = '<div style="padding:8px;color:#c00;font-size:11px;">❌ Erreur : ' + (e.message||'inconnue') + '</div>';
    btn.innerHTML = SVG_SUN + ' Météo';
    btn.style.background = '#0C447C';
    btn.disabled = false;
  }
}


async function importFromStrava() {
  const btn = document.getElementById('garmin-val-btn');
  if(btn) { btn.textContent = '⏳ Chargement…'; btn.disabled = true; }

  try {
    const resp = await fetch('https://us-central1-prepa-marathon.cloudfunctions.net/stravaFetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await resp.json();

    if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; }

    // Strava non connecté → ouvrir la page d'auth
    if(data.needsAuth) {
      const authWin = window.open('https://us-central1-prepa-marathon.cloudfunctions.net/stravaAuth', '_blank', 'width=600,height=700');
      if(btn) { btn.textContent = '⏳ Connexion Strava…'; btn.disabled = true; }
      // Vérifier toutes les 2s si l'auth est terminée
      const check = setInterval(async () => {
        try {
          const r2 = await fetch('https://us-central1-prepa-marathon.cloudfunctions.net/stravaFetch', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
          });
          const d2 = await r2.json();
          if(d2.success && d2.activities) {
            clearInterval(check);
            if(authWin) authWin.close();
            if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; }
            _showStravaPicker(d2.activities);
          } else if(!d2.needsAuth) {
            clearInterval(check);
            if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; }
          }
        } catch(e) {}
      }, 2000);
      setTimeout(() => clearInterval(check), 120000); // stop après 2min
      return;
    }

    if(!data.success || !data.activities || data.activities.length === 0) {
      if(btn) { btn.textContent = data.error ? `❌ ${data.error.slice(0,25)}` : '❌ Aucune course'; btn.disabled = false; }
      setTimeout(() => { if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; } }, 3000);
      return;
    }

    _showStravaPicker(data.activities);

  } catch(e) {
    console.error('Strava import error:', e);
    if(btn) { btn.textContent = '❌ Erreur'; btn.disabled = false; }
    setTimeout(() => { if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; } }, 3000);
  }
}

function _showStravaPicker(activities) {
  const today = new Date().toISOString().slice(0, 10);
  const existing = document.getElementById('garmin-val-picker');
  if(existing) existing.remove();

  const picker = document.createElement('div');
  picker.id = 'garmin-val-picker';
  picker.style.cssText = 'position:fixed;inset:0;z-index:600;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0.4);';
  picker.innerHTML = `<div style="background:var(--bg);border-radius:20px 20px 0 0;padding:20px 16px 40px;width:100%;max-width:390px;">
    <p style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:4px;">Dernières courses Strava</p>
    <p style="font-size:11px;color:var(--muted);margin-bottom:14px;">Sélectionne la séance à importer</p>
    ${activities.slice(0, 3).map(a => {
      const isToday = a.date === today;
      const d = new Date(a.date + 'T12:00:00');
      const days = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
      const months = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'];
      const dateLabel = isToday ? '' : `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
      return `<div onclick="document.getElementById('garmin-val-picker').remove();_fetchAndApplyStravaDetail(${JSON.stringify(a).replace(/"/g,'&quot;')},'validation');document.getElementById('garmin-val-btn').innerHTML='⏳ Détails…';"
        style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-radius:12px;border:1.5px solid ${isToday?'#FC4C02':'var(--border)'};margin-bottom:8px;cursor:pointer;background:${isToday?'#FFF0EB':'var(--bg2)'};">
        <div>
          <div style="display:flex;align-items:center;gap:6px;">
            <p style="font-size:13px;font-weight:700;color:var(--text);margin:0;">${a.nom}</p>
            ${isToday ? '<span style="background:#FC4C02;color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:10px;">Aujourd\'hui</span>' : ''}
          </div>
          <p style="font-size:11px;color:var(--muted);margin:2px 0 0;">${dateLabel}${dateLabel?' · ':''}${a.duree}</p>
        </div>
        <div style="text-align:right;">
          <p style="font-size:15px;font-weight:700;color:#FC4C02;margin:0;">${a.distanceKm} km</p>
          <p style="font-size:11px;color:var(--muted);margin:2px 0 0;">${a.allure}/km${a.fcMoyenne?' · FC '+a.fcMoyenne:''}</p>
        </div>
      </div>`;
    }).join('')}
    <button onclick="document.getElementById('garmin-val-picker').remove();" style="width:100%;padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;font-size:13px;color:var(--muted);cursor:pointer;margin-top:4px;">Annuler</button>
  </div>`;
  document.body.appendChild(picker);
}
// ── DÉTECTION BLOCS TEMPO DEPUIS LAPS STRAVA ─────────────────────────────────
function _detectTempoBlocsFromLaps(laps, sessionDetail) {
  if (!laps || laps.length === 0) return null;

  function paceToSec(allure) {
    if (!allure) return null;
    const p = String(allure).replace("'", ':').split(':');
    if (p.length < 2) return null;
    return parseInt(p[0]) * 60 + parseInt(p[1]);
  }

  // ── Parse la cible de séance ─────────────────────────────────────────────
  // "4'55 — 5'00 /km" → paceMinSec=295, paceMaxSec=300
  // "1x18min" → nbBlocs=1, blocDurMin=18
  let paceMinSec = null, paceMaxSec = null;
  let nbBlocsPlanned = 1, blocDurMin = null;
  if (sessionDetail) {
    const mPace = sessionDetail.replace(/'/g, ':').match(/(\d+):(\d+)\s*[—–-]\s*(\d+):(\d+)/);
    if (mPace) {
      paceMinSec = parseInt(mPace[1]) * 60 + parseInt(mPace[2]);
      paceMaxSec = parseInt(mPace[3]) * 60 + parseInt(mPace[4]);
    }
    const mBloc = sessionDetail.match(/(\d+)\s*[x×]\s*(\d+)\s*min/i);
    if (mBloc) { nbBlocsPlanned = parseInt(mBloc[1]); blocDurMin = parseInt(mBloc[2]); }
  }

  // ── MODE 1 : laps structurés Garmin/Strava ───────────────────────────────
  // (intervalles avec durée variable > 5min — workout structuré)
  const hasStructuredLaps = laps.some(l => l.duree_sec && l.duree_sec > 400);
  if (hasStructuredLaps) {
    const wFast = paceMinSec ? paceMinSec - 30 : 240;
    const wSlow = paceMaxSec ? paceMaxSec + 20 : 330;
    const found = [];
    laps.forEach((lap, i) => {
      if (i === 0 || lap.duree_sec < 300) return;
      const ps = paceToSec(lap.allure);
      if (ps && ps >= wFast && ps <= wSlow) {
        found.push({ allure: lap.allure, duree_sec: lap.duree_sec, fc: lap.fc });
      }
    });
    if (found.length > 0) return found;
    // Laps présents mais aucun dans la fenêtre → fallback splits
  }

  // ── MODE 2 : splits par km ───────────────────────────────────────────────
  const splits = laps
    .map(l => ({ km: l.km || l.index, sec: paceToSec(l.allure), fc: parseInt(l.fc) || 0, allure: l.allure }))
    .filter(s => s.sec && s.km);

  if (splits.length < 3) return null;

  // ── Étape 1 : détecter la fin du warmup via saut de FC ──────────────────
  // Le warmup se termine au km où la FC fait un bond >= 12 bpm d'un coup
  // Ex: km3=FC149 → km4=FC166 : bond +17 → warmup fini après km3
  const FC_JUMP_THRESHOLD = 12;
  let blocStartIdx = null;
  for (let i = 1; i < splits.length; i++) {
    if (splits[i].fc - splits[i - 1].fc >= FC_JUMP_THRESHOLD) {
      blocStartIdx = i; // le bloc commence à cet index
      break;
    }
  }
  // Fallback : pas de saut FC détecté → commencer après le 1er km
  if (blocStartIdx === null) blocStartIdx = 1;

  // ── Étape 2 : détecter les N blocs en accumulant la durée planifiée ──────
  // Pour chaque bloc, on accumule des km depuis le départ jusqu'à atteindre
  // la durée prévue (ex: 18min = 1080s), en pondérant le dernier km partiellement.
  // On s'arrête si le km est clairement en récupération (allure > paceMax + 20s).
  const blocDurSec = blocDurMin ? blocDurMin * 60 : null;
  const recoveryThreshold = paceMaxSec ? paceMaxSec + 20 : 340; // 5:40 fallback
  const result = [];
  let curIdx = blocStartIdx;

  for (let b = 0; b < nbBlocsPlanned && curIdx < splits.length; b++) {
    // Chercher le début du prochain bloc : premier km non-récupération depuis curIdx
    while (curIdx < splits.length && splits[curIdx].sec > recoveryThreshold) curIdx++;
    if (curIdx >= splits.length) break;

    // Accumuler les km de ce bloc
    let accumulated = 0;
    const blocKms = [];
    for (let j = curIdx; j < splits.length; j++) {
      const s = splits[j];
      // Stop si on rentre clairement en récupération (après au moins 2 kms de bloc)
      if (blocKms.length >= 2 && s.sec > recoveryThreshold) break;
      blocKms.push(s);
      accumulated += s.sec;
      if (blocDurSec && accumulated >= blocDurSec) break;
    }

    if (blocKms.length === 0) break;

    // Calcul de l'allure moyenne pondérée :
    // Si on a une durée cible, on utilise exactement blocDurSec en ajustant
    // la contribution du dernier km proportionnellement
    let totalTime, totalDist;
    if (blocDurSec && accumulated > blocDurSec) {
      // Le dernier km dépasse la cible → le tronquer
      const lastKm = blocKms[blocKms.length - 1];
      const prevAcc = accumulated - lastKm.sec;
      const fraction = (blocDurSec - prevAcc) / lastKm.sec;
      totalTime = blocDurSec;
      totalDist = (blocKms.length - 1) + fraction;
    } else {
      totalTime = accumulated;
      totalDist = blocKms.length;
    }

    const avgPaceSec = Math.round(totalTime / totalDist);
    const avgFc = Math.round(blocKms.reduce((s, k) => s + k.fc, 0) / blocKms.length);
    const mm = Math.floor(avgPaceSec / 60), ss = avgPaceSec % 60;

    result.push({
      allure: mm + ':' + String(ss).padStart(2, '0'),
      duree_sec: blocDurSec || accumulated,
      fc: avgFc,
      nb_kms: blocKms.length,
      _fromSplits: true
    });

    // Avancer curIdx après ce bloc (sauter les km de récupération)
    curIdx += blocKms.length;
    while (curIdx < splits.length && splits[curIdx].sec > recoveryThreshold) curIdx++;
  }

  return result.length > 0 ? result : null;
}

// ── FETCH DÉTAIL STRAVA PUIS APPLIQUER ───────────────────────────────────────
async function _fetchAndApplyStravaDetail(activity, mode, ws, si) {
  try {
    const resp = await fetch('https://us-central1-prepa-marathon.cloudfunctions.net/stravaFetchDetail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activityId: activity.activityId })
    });
    const data = await resp.json();
    if (data.success && data.detail) {
      // Fusionner les détails dans l'activité
      Object.assign(activity, data.detail);
    }
  } catch(e) {
    console.warn('stravaFetchDetail failed, applying without details:', e);
  }
  if (mode === 'validation') {
    _applyGarminToValidation(activity);
    const btn = document.getElementById('garmin-val-btn');
    if(btn) btn.innerHTML = '✅ Importé';
  } else if (mode === 'perfedit') {
    _applyGarminToPerfEdit(activity, ws, si);
  }
}

function _applyGarminToValidation(activity) {
  // Stocker l'activité complète pour le coach IA
  window._garminActivityData = activity;

  // KM réels
  const kmEl = document.getElementById('val-km');
  if(kmEl && activity.distanceKm) {
    kmEl.value = activity.distanceKm;
    kmEl.dispatchEvent(new Event('input'));
  }
  // Durée
  const durEl = document.getElementById('val-dur');
  if(durEl && activity.duree) {
    durEl.value = activity.duree;
    durEl.dispatchEvent(new Event('input'));
  }
  // Allure
  const paceEl = document.getElementById('val-pace');
  if(paceEl && activity.allure) paceEl.value = activity.allure;
  // FC
  const hrEl = document.getElementById('val-hr');
  if(hrEl && activity.fcMoyenne) hrEl.value = activity.fcMoyenne;
  // Date
  const dateEl = document.getElementById('val-date');
  if(dateEl && activity.date) dateEl.value = activity.date;

  // ── Pré-remplissage blocs TEMPO depuis les laps ──
  const ctx = window._currentValidationSession;
  if (ctx && ctx.s && (ctx.s.type === 'tempo' || ctx.s.type === 'frac')) {
    const sessionDetail = (ctx.s.d || '').split('|')[1] || '';
    const blocs = _detectTempoBlocsFromLaps(activity.laps || activity.splits, sessionDetail);
    const blocsContainer = document.getElementById('val-blocs-container');
    const existing = document.getElementById('val-blocs-strava-msg');
    if (existing) existing.remove();
    if (blocs && blocs.length > 0) {
      blocs.forEach((bloc, i) => {
        const el = document.getElementById('val-bloc-' + i);
        if (el) {
          el.value = bloc.allure;
          el.style.borderColor = '#3B6D11';
          el.style.background = '#EAF3DE';
          setTimeout(() => { el.style.borderColor = '#1B4FD830'; el.style.background = ''; }, 3000);
        }
      });
      if (blocsContainer) {
        const msg = document.createElement('p');
        msg.id = 'val-blocs-strava-msg';
        msg.style.cssText = 'font-size:10px;color:#3B6D11;font-weight:600;margin-top:4px;text-align:center;';
        const dureesMins = blocs.map(b => Math.round(b.duree_sec / 60) + 'min').join(' · ');
        const sourceLabel = blocs[0]._fromSplits ? 'splits km' : 'laps Strava';
        msg.textContent = `✓ ${blocs.length} bloc${blocs.length > 1 ? 's' : ''} détecté${blocs.length > 1 ? 's' : ''} (${dureesMins}) via ${sourceLabel}`;
        blocsContainer.appendChild(msg);
      }
    } else {
      // Pas de laps ou aucun bloc détecté dans la plage d'allure
      if (blocsContainer) {
        const msg = document.createElement('p');
        msg.id = 'val-blocs-strava-msg';
        msg.style.cssText = 'font-size:10px;color:#E8530A;font-weight:600;margin-top:4px;text-align:center;';
        msg.textContent = activity.laps && activity.laps.length > 0
          ? '⚠️ Activité sans laps tempo — à renseigner manuellement'
          : '⚠️ Pas de laps dans cette activité — à renseigner manuellement';
        blocsContainer.appendChild(msg);
      }
    }
  }

  // Feedback visuel — bordure bleue 2s
  ['val-km','val-dur','val-pace','val-hr'].forEach(id => {
    const el = document.getElementById(id);
    if(el && el.value) { el.style.borderColor = '#1382E4'; setTimeout(() => el.style.borderColor = '', 2000); }
  });

  // Afficher le bloc de données enrichies Garmin sous les champs
  const existing = document.getElementById('garmin-detail-block');
  if(existing) existing.remove();

  const block = document.createElement('div');
  block.id = 'garmin-detail-block';
  block.style.cssText = 'margin-top:12px;background:#EDF5FF;border-radius:12px;padding:12px 14px;border:1.5px solid #1382E430;';

  let html = '<p style="font-size:11px;font-weight:700;color:#1382E4;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">🟠 Données Strava importées</p>';

  // Ligne 1 : cadence + dénivelé + puissance
  const extras = [];
  if(activity.cadence) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Cadence</p><p style="font-size:15px;font-weight:700;color:#1a2e4a;">${activity.cadence} <span style="font-size:10px;font-weight:400;">spm</span></p></div>`);
  if(activity.denivele_pos != null) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Dénivelé +</p><p style="font-size:15px;font-weight:700;color:#3B6D11;">${activity.denivele_pos} <span style="font-size:10px;font-weight:400;">m</span></p></div>`);
  if(activity.fcMax) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">FC max</p><p style="font-size:15px;font-weight:700;color:#E24B4A;">${activity.fcMax} <span style="font-size:10px;font-weight:400;">bpm</span></p></div>`);
  if(activity.calories) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Calories</p><p style="font-size:15px;font-weight:700;color:#E8530A;">${activity.calories} <span style="font-size:10px;font-weight:400;">kcal</span></p></div>`);
  if(activity.best_400m) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Meilleur 400m</p><p style="font-size:15px;font-weight:700;color:#1B4FD8;">${activity.best_400m} <span style="font-size:10px;font-weight:400;">/km</span></p></div>`);

  if(extras.length > 0) {
    html += `<div style="display:grid;grid-template-columns:repeat(${Math.min(extras.length,3)},1fr);gap:8px;margin-bottom:10px;">${extras.join('')}</div>`;
  }

  // Zones FC
  if(activity.zones_fc && activity.zones_fc.length > 0) {
    html += '<p style="font-size:10px;font-weight:700;color:#6B8DB5;margin-bottom:6px;text-transform:uppercase;">Zones FC</p>';
    html += '<div style="display:flex;flex-direction:column;gap:4px;margin-bottom:10px;">';
    const zoneColors = ['#6B8DB5','#3B6D11','#1382E4','#E8530A','#E24B4A'];
    activity.zones_fc.forEach((z, i) => {
      const col = zoneColors[i] || '#888';
      const mins = Math.floor(z.temps_sec / 60);
      const secs = z.temps_sec % 60;
      const timeStr = mins > 0 ? `${mins}min${secs > 0 ? String(secs).padStart(2,'0')+'s' : ''}` : `${secs}s`;
      const pct = z.pourcentage || Math.round(z.temps_sec / activity.duree * 100) || 0;
      html += `<div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:10px;font-weight:700;color:${col};width:50px;">${z.nom||'Z'+(i+1)}</span>
        <div style="flex:1;background:#e0e0e0;border-radius:4px;height:6px;overflow:hidden;">
          <div style="width:${pct}%;background:${col};height:100%;border-radius:4px;"></div>
        </div>
        <span style="font-size:10px;color:#6B8DB5;width:40px;text-align:right;">${timeStr}</span>
      </div>`;
    });
    html += '</div>';
  }

  // Splits par km
  if(activity.splits && activity.splits.length > 0) {
    html += '<p style="font-size:10px;font-weight:700;color:#6B8DB5;margin-bottom:6px;text-transform:uppercase;">Splits par km</p>';
    html += '<div style="overflow-x:hidden;"><table style="width:100%;border-collapse:collapse;font-size:11px;">';
    html += '<tr style="color:#6B8DB5;"><th style="text-align:left;padding:2px 4px;font-weight:600;">Km</th><th style="text-align:center;padding:2px 4px;font-weight:600;">Allure</th><th style="text-align:center;padding:2px 4px;font-weight:600;">FC</th></tr>';
    activity.splits.filter(sp => sp.distanceKm && sp.distanceKm >= 0.5).forEach(sp => {
      html += `<tr style="border-top:1px solid #d0dff5;"><td style="padding:3px 4px;font-weight:700;color:#1a2e4a;">${sp.km}</td><td style="padding:3px 4px;text-align:center;color:#1B4FD8;font-weight:600;">${sp.allure||'—'}</td><td style="padding:3px 4px;text-align:center;color:#E24B4A;">${sp.fc||'—'}</td></tr>`;
    });
    html += '</table></div>';
  }

  block.innerHTML = html;

  // Insérer avant les boutons Annuler/Valider
  const btnRow = document.querySelector('#modal-container .modal-box div[style*="grid-template-columns:1fr 1fr"]');
  if(btnRow) btnRow.parentNode.insertBefore(block, btnRow);

  // Scroller vers le bas pour rendre les boutons Annuler/Valider visibles
  setTimeout(() => {
    const scrollBody = document.querySelector('#modal-container .modal-scroll-body');
    if(scrollBody) scrollBody.scrollTop = scrollBody.scrollHeight;
  }, 50);
}

// ── STRAVA RESYNC POUR SÉANCES DÉJÀ VALIDÉES ─────────────────────────────────
async function importFromStravaForPerfEdit(ws, si) {
  const btn = document.getElementById('garmin-pedit-btn');
  if(btn) { btn.textContent = '⏳…'; btn.disabled = true; }

  try {
    const resp = await fetch('https://us-central1-prepa-marathon.cloudfunctions.net/stravaFetch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
    });
    const data = await resp.json();
    if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; }

    if(data.needsAuth) {
      const authWin = window.open('https://us-central1-prepa-marathon.cloudfunctions.net/stravaAuth', '_blank', 'width=600,height=700');
      if(btn) { btn.textContent = '⏳ Connexion…'; btn.disabled = true; }
      const check = setInterval(async () => {
        try {
          const r2 = await fetch('https://us-central1-prepa-marathon.cloudfunctions.net/stravaFetch', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
          });
          const d2 = await r2.json();
          if(d2.success && d2.activities) {
            clearInterval(check);
            if(authWin) authWin.close();
            if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; }
            _showStravaPickerForPerfEdit(d2.activities, ws, si);
          } else if(!d2.needsAuth) { clearInterval(check); if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; } }
        } catch(e) {}
      }, 2000);
      setTimeout(() => clearInterval(check), 120000);
      return;
    }
    if(!data.success || !data.activities || data.activities.length === 0) {
      if(btn) { btn.textContent = '❌ Aucune course'; btn.disabled = false; }
      setTimeout(() => { if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; } }, 3000);
      return;
    }
    _showStravaPickerForPerfEdit(data.activities, ws, si);
  } catch(e) {
    if(btn) { btn.textContent = '❌ Erreur'; btn.disabled = false; }
    setTimeout(() => { if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; } }, 3000);
  }
}

function _showStravaPickerForPerfEdit(activities, ws, si) {
  const k = gk(ws, si);
  const prev = state[k+'perf'] ? JSON.parse(state[k+'perf']) : {};
  const sessionDate = prev.date || ''; // YYYY-MM-DD

  // Trier par proximité de date avec la séance
  const sorted = [...activities].sort((a, b) => {
    const da = sessionDate ? Math.abs(new Date(a.date) - new Date(sessionDate)) : 0;
    const db = sessionDate ? Math.abs(new Date(b.date) - new Date(sessionDate)) : 0;
    return da - db;
  });
  const top3 = sorted.slice(0, 3);

  const existing = document.getElementById('strava-pedit-picker');
  if(existing) existing.remove();

  const picker = document.createElement('div');
  picker.id = 'strava-pedit-picker';
  picker.style.cssText = 'position:fixed;inset:0;z-index:400;display:flex;align-items:flex-end;justify-content:center;background:transparent;';

  picker.innerHTML = `<div style="background:var(--bg);border-radius:20px 20px 0 0;padding:20px 16px 40px;width:100%;max-width:390px;">
    <p style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:2px;">Resync Strava</p>
    <p style="font-size:11px;color:var(--muted);margin-bottom:14px;">3 courses les plus proches de la date de la séance</p>
    ${top3.map(a => {
      const d = new Date(a.date + 'T12:00:00');
      const days = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
      const months = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'];
      const dateLabel = `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
      const diffDays = sessionDate ? Math.round((new Date(a.date) - new Date(sessionDate)) / 86400000) : null;
      const diffLabel = diffDays === 0 ? '<span style="color:#3B6D11;font-size:9px;font-weight:700;background:#EAF3DE;padding:1px 6px;border-radius:8px;">Même jour</span>'
        : diffDays != null ? `<span style="color:#888;font-size:9px;">${diffDays > 0 ? '+' : ''}${diffDays}j</span>` : '';
      return `<div onclick="document.getElementById('strava-pedit-picker').remove();_fetchAndApplyStravaDetail(${JSON.stringify(a).replace(/"/g,'&quot;')},'perfedit',${ws},${si});"
        style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-radius:12px;border:1.5px solid ${diffDays===0?'#3B6D11':'var(--border)'};margin-bottom:8px;cursor:pointer;background:${diffDays===0?'#F0F9E8':'var(--bg2)'};">
        <div>
          <div style="display:flex;align-items:center;gap:6px;">
            <p style="font-size:13px;font-weight:700;color:var(--text);margin:0;">${a.nom}</p>
            ${diffLabel}
          </div>
          <p style="font-size:11px;color:var(--muted);margin:2px 0 0;">${dateLabel} · ${a.duree}</p>
        </div>
        <div style="text-align:right;">
          <p style="font-size:15px;font-weight:700;color:#FC4C02;margin:0;">${a.distanceKm} km</p>
          <p style="font-size:11px;color:var(--muted);margin:2px 0 0;">${a.allure}/km${a.fcMoyenne?' · FC '+a.fcMoyenne:''}</p>
        </div>
      </div>`;
    }).join('')}
    <button onclick="document.getElementById('strava-pedit-picker').remove();" style="width:100%;padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;font-size:13px;color:var(--muted);cursor:pointer;margin-top:4px;">Annuler</button>
  </div>`;
  document.body.appendChild(picker);
}

function _applyGarminToPerfEdit(activity, ws, si) {
  const k = gk(ws, si);
  const existing = state[k+'perf'] ? JSON.parse(state[k+'perf']) : {};
  const s = getSession(ws, si);

  // Construire les données Strava
  const stravaData = {};
  if(activity.cadence) stravaData.cadence = activity.cadence;
  if(activity.fcMax) stravaData.fcMax = activity.fcMax;
  if(activity.denivele_pos != null) stravaData.denivele_pos = activity.denivele_pos;
  if(activity.calories) stravaData.calories = activity.calories;
  if(activity.best_400m) stravaData.best_400m = activity.best_400m;
  if(activity.splits && activity.splits.length > 0) stravaData.splits = activity.splits;
  if(activity.laps && activity.laps.length > 0) stravaData.laps = activity.laps;
  if(activity.zones_fc && activity.zones_fc.length > 0) stravaData.zones_fc = activity.zones_fc;

  existing.strava = stravaData;
  state[k+'perf'] = JSON.stringify(existing);
  save();

  // Pré-remplir les blocs tempo si applicable
  if((s.type === 'tempo' || s.type === 'frac') && (activity.laps || activity.splits)) {
    const sessionDetail = (s.d || '').split('|')[1] || '';
    const blocs = _detectTempoBlocsFromLaps(activity.laps || activity.splits, sessionDetail);
    if(blocs && blocs.length > 0) {
      blocs.forEach((bloc, i) => {
        const el = document.getElementById('pedit-bloc-' + i);
        if(el) {
          el.value = bloc.allure;
          el.style.borderColor = '#3B6D11';
          el.style.background = '#EAF3DE';
          setTimeout(() => { el.style.borderColor = '#1B4FD830'; el.style.background = ''; }, 3000);
        }
      });
    }
  }

  // Mettre à jour le bouton
  const btn = document.getElementById('garmin-pedit-btn');
  if(btn) { btn.innerHTML = '✅ Strava'; btn.style.background = '#3B6D11'; }

  // Rafraîchir le bloc Strava dans le modal sans le fermer
  const stravaBlocExist = document.getElementById('pedit-strava-block');
  if(stravaBlocExist) stravaBlocExist.remove();
  const btnRow = document.querySelector('#modal-container .modal-box div[style*="grid-template-columns:1fr 1fr"][style*="margin-top:20px"]');
  if(btnRow) {
    const block = document.createElement('div');
    block.id = 'pedit-strava-block';
    const st = stravaData;
    let html = '<div style="background:#EDF5FF;border-radius:12px;padding:12px 14px;border:1.5px solid #1382E430;margin-bottom:4px;">';
    html += '<p style="font-size:11px;font-weight:700;color:#1382E4;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">📡 Données Strava importées</p>';
    const extras = [];
    if(st.cadence) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Cadence</p><p style="font-size:15px;font-weight:700;color:#1a2e4a;">${st.cadence} <span style="font-size:10px;font-weight:400;">pas/min</span></p></div>`);
    if(st.denivele_pos != null) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Dénivelé +</p><p style="font-size:15px;font-weight:700;color:#3B6D11;">${st.denivele_pos} <span style="font-size:10px;font-weight:400;">m</span></p></div>`);
    if(st.fcMax) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">FC max</p><p style="font-size:15px;font-weight:700;color:#E24B4A;">${st.fcMax} <span style="font-size:10px;font-weight:400;">bpm</span></p></div>`);
    if(st.calories) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Calories</p><p style="font-size:15px;font-weight:700;color:#E8530A;">${st.calories} <span style="font-size:10px;font-weight:400;">kcal</span></p></div>`);
    if(st.best_400m) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Meilleur 400m</p><p style="font-size:15px;font-weight:700;color:#1B4FD8;">${st.best_400m} <span style="font-size:10px;font-weight:400;">/km</span></p></div>`);
    if(extras.length > 0) html += `<div style="display:grid;grid-template-columns:repeat(${Math.min(extras.length,3)},1fr);gap:8px;margin-bottom:${st.splits?'10px':'0'};">${extras.join('')}</div>`;
    if(st.splits && st.splits.length > 0) {
      html += '<p style="font-size:10px;font-weight:700;color:#6B8DB5;margin-bottom:6px;text-transform:uppercase;">Splits par km</p>';
      html += '<div style="overflow-x:hidden;"><table style="width:100%;border-collapse:collapse;font-size:11px;">';
      html += '<tr style="color:#6B8DB5;"><th style="text-align:left;padding:2px 4px;">Km</th><th style="text-align:center;padding:2px 4px;">Allure</th><th style="text-align:center;padding:2px 4px;">FC</th></tr>';
      st.splits.filter(sp => sp.distanceKm && sp.distanceKm >= 0.5).forEach(sp => {
        html += `<tr style="border-top:1px solid #d0dff5;"><td style="padding:3px 4px;font-weight:700;color:#1a2e4a;">${sp.km}</td><td style="padding:3px 4px;text-align:center;color:#1B4FD8;font-weight:600;">${sp.allure||'—'}</td><td style="padding:3px 4px;text-align:center;color:#E24B4A;">${sp.fc||'—'}</td></tr>`;
      });
      html += '</table></div>';
    }
    html += '</div>';
    block.innerHTML = html;
    btnRow.parentNode.insertBefore(block, btnRow);
  }
}

// ── VO2MAX MODAL ─────────────────────────────────────────────────────────────
function openAmTrainingModal(){
  const current = state._am_training_pace || "5'20";
  const paceVal = current.replace("'",":");
  const overlay = document.createElement('div');
  overlay.id = 'modal-container-am';
  overlay.style.cssText = 'position:fixed;inset:0;background:transparent;z-index:9999;display:flex;align-items:flex-end;justify-content:center;';
  const chips = ["5:00","5:05","5:10","5:15","5:20","5:25","5:30","5:35","5:40"].map(p =>
    `<button onclick="document.getElementById('am-training-input').value='${p}'" style="padding:7px 12px;border-radius:20px;font-size:12px;font-weight:600;border:1.5px solid var(--border);background:var(--bg2);color:var(--muted);cursor:pointer;">${p}</button>`
  ).join('');
  overlay.innerHTML = `<div style="background:var(--bg);border-radius:20px 20px 0 0;padding:20px 20px 32px;width:100%;max-width:440px;">
    <p style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:6px;">Allure AM entraînement</p>
    <p style="font-size:12px;color:var(--muted);margin-bottom:16px;">Allure cible pour les blocs AM dans tes séances Longues. Indépendante du prédicteur.</p>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
      <input type="text" id="am-training-input" value="${paceVal}" placeholder="5:20" maxlength="5" style="background:var(--bg2);border:2px solid #1B4FD8;border-radius:10px;padding:12px 16px;font-size:24px;font-weight:700;color:var(--text);width:110px;outline:none;text-align:center;">
      <span style="font-size:14px;color:var(--muted);">/km</span>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;">${chips}</div>
    <div style="display:flex;gap:10px;">
      <button onclick="_closeAmModal()" style="flex:1;padding:13px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;color:var(--muted);cursor:pointer;">Annuler</button>
      <button onclick="saveAmTrainingPace()" style="flex:2;padding:13px;background:#1B4FD8;border:none;border-radius:var(--radius-sm);font-size:14px;font-weight:700;color:#fff;cursor:pointer;">Enregistrer</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.onclick = e => { if(e.target === overlay) overlay.remove(); };
}

function saveAmTrainingPace(){
  const val = (document.getElementById('am-training-input')?.value||'').trim().replace("'",":");
  const m = val.match(/^(\d+):(\d{2})$/);
  if(!m){ alert("Format invalide. Ex: 5:20"); return; }
  state._am_training_pace = m[1]+"'"+m[2];
  save();
  _closeAmModal();
  renderHome();
}

function _closeAmModal(){
  const ov=document.getElementById('modal-container-am');
  if(!ov) return;
  ov.style.animation='none';
  void ov.offsetHeight;
  ov.style.transition='transform 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.4s ease';
  ov.style.transform='translateY(100%)';
  ov.style.opacity='0';
  setTimeout(()=>ov.remove(),520);
}
function openVo2maxModal() {
  const current = parseFloat(state['vo2max_current']) || 52;
  const history = state['vo2max_history'] ? JSON.parse(state['vo2max_history']) : [];
  const mc = document.getElementById('modal-container');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  let histHtml = '';
  if(history.length > 0) {
    histHtml = '<div style="background:var(--bg);border-radius:10px;border:1px solid var(--border);overflow:hidden;margin-top:12px;">';
    histHtml += '<div style="display:grid;grid-template-columns:1fr 80px;padding:7px 12px;background:var(--bg2);border-bottom:1px solid var(--border);"><span style="font-size:11px;font-weight:600;color:var(--muted);">Date</span><span style="font-size:11px;font-weight:600;color:var(--muted);text-align:right;">VO2max</span></div>';
    [...history].reverse().slice(0,5).forEach(e => {
      const d = new Date(e.date+'T12:00:00');
      const dateStr = d.toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'});
      histHtml += `<div style="display:grid;grid-template-columns:1fr 80px;padding:9px 12px;border-bottom:1px solid var(--border);align-items:center;">
        <span style="font-size:13px;color:var(--text);">${dateStr}</span>
        <span style="font-size:14px;font-weight:700;color:#1B4FD8;text-align:right;">${e.val}</span>
      </div>`;
    });
    histHtml += '</div>';
  }

  overlay.innerHTML = `<div class="modal-box">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div>
        <p style="font-size:16px;font-weight:700;color:var(--text);">VO2max</p>
        <p style="font-size:12px;color:var(--muted);margin-top:2px;">Mesurée par Garmin (ml/kg/min)</p>
      </div>
      <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:24px;line-height:1;">×</button>
    </div>
    <p style="font-size:12px;color:var(--muted);margin-bottom:8px;">Valeur actuelle — mise à jour par Garmin toutes les quelques semaines</p>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1B4FD8" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      <input id="vo2max-input" type="number" min="20" max="85" step="0.5" value="${current}" placeholder="52"
        style="flex:1;padding:12px 14px;border-radius:10px;border:1.5px solid var(--border);background:var(--bg2);font-size:22px;font-weight:700;color:var(--text);text-align:center;-moz-appearance:textfield;">
      <span style="font-size:16px;color:var(--muted);font-weight:600;">ml/kg/min</span>
    </div>
    <p style="font-size:11px;color:var(--muted);margin-bottom:16px;">Utilisée par le modèle VDOT pour prédire ton temps marathon.</p>
    <button onclick="saveVo2max()" style="width:100%;padding:13px;background:#1B4FD8;border:none;border-radius:var(--radius-sm);font-size:15px;font-weight:700;color:#fff;cursor:pointer;">Enregistrer</button>
    ${histHtml}
  </div>`;
  overlay.onclick = e => { if(e.target===overlay) closeModal(); };
  _lockBodyScroll();
  mc.appendChild(overlay);
  setTimeout(() => { const inp=document.getElementById('vo2max-input'); if(inp) inp.focus(); }, 100);
}

function saveVo2max() {
  const val = parseFloat(document.getElementById('vo2max-input')?.value);
  if(!val || val < 20 || val > 85) { alert('Valeur invalide (entre 20 et 85 ml/kg/min)'); return; }
  const today = new Date().toISOString().slice(0,10);
  // Sauvegarder valeur courante
  state['vo2max_current'] = val;
  // Ajouter à l'historique
  const history = state['vo2max_history'] ? JSON.parse(state['vo2max_history']) : [];
  // Éviter doublons même jour
  const filtered = history.filter(e => e.date !== today);
  filtered.push({ date: today, val });
  filtered.sort((a,b) => a.date.localeCompare(b.date));
  state['vo2max_history'] = JSON.stringify(filtered);
  save();
  closeModal();
  renderHome();
}

function getRecord10kmPredictions() {
  const r10raw = state['record_10km'];
  if (!r10raw) return null;
  // Parse "mm:ss" ou "hh:mm:ss" ou "mm'ss" 
  const clean = String(r10raw).replace(/'/g, ':').replace(/\s/g, '');
  const parts = clean.split(':').map(Number);
  let secTotal = 0;
  if (parts.length === 3) secTotal = parts[0]*3600 + parts[1]*60 + parts[2];
  else if (parts.length === 2) secTotal = parts[0]*60 + parts[1];
  else return null;
  if (!secTotal || secTotal < 1200 || secTotal > 7200) return null; // sanity check 20min-2h

  // Semi : 10km × 2.1
  const semiSec = Math.round(secTotal * 2.15);
  const semiH = Math.floor(semiSec / 3600);
  const semiM = Math.floor((semiSec % 3600) / 60);
  const semiS = semiSec % 60;
  const semiStr = semiH > 0
    ? semiH + 'h' + String(semiM).padStart(2,'0')
    : semiM + ':' + String(semiS).padStart(2,'0');

  // Vitesse moyenne semi (km/h)
  const semiDistKm = 21.097;
  const semiSpeedKmh = (semiDistKm / semiSec) * 3600;

  // Marathon : vitesse semi - 1 km/h
  const marSpeedKmh = semiSpeedKmh - 1;
  const marDistKm = 42.195;
  const marSec = Math.round((marDistKm / marSpeedKmh) * 3600);
  const marH = Math.floor(marSec / 3600);
  const marM = Math.floor((marSec % 3600) / 60);
  const marStr = marH + 'h' + String(marM).padStart(2,'0');

  // Allure marathon (sec/km)
  const marPaceSec = Math.round(3600 / marSpeedKmh);
  const marPaceStr = Math.floor(marPaceSec/60) + "'" + String(marPaceSec%60).padStart(2,'0');

  // Allure semi
  const semiPaceSec = Math.round(3600 / semiSpeedKmh);
  const semiPaceStr = Math.floor(semiPaceSec/60) + "'" + String(semiPaceSec%60).padStart(2,'0');

  // Format 10km
  const r10H = Math.floor(secTotal/3600);
  const r10M = Math.floor((secTotal%3600)/60);
  const r10S = secTotal%60;
  const r10Str = r10H > 0
    ? r10H + 'h' + String(r10M).padStart(2,'0') + ':' + String(r10S).padStart(2,'0')
    : String(r10M).padStart(2,'0') + ':' + String(r10S).padStart(2,'0');

  // Allure 10km
  const r10PaceSec = Math.round(secTotal / 10);
  const r10PaceStr = Math.floor(r10PaceSec/60) + "'" + String(r10PaceSec%60).padStart(2,'0');

  const r10SpeedKmh = Math.round((10 / secTotal) * 3600 * 10) / 10;

  return {
    record10kmStr: r10Str,
    record10kmSec: secTotal,
    record10kmPaceStr: r10PaceStr,
    record10kmSpeedKmh: r10SpeedKmh,
    semiStr, semiSec, semiPaceStr,
    semiSpeedKmh: Math.round(semiSpeedKmh * 10) / 10,
    marStr, marSec, marPaceStr,
    marSpeedKmh: Math.round(marSpeedKmh * 10) / 10,
    sub4h: marSec < 14400,
    sub4hEcartMin: Math.round((marSec - 14400) / 60)
  };
}

function openRecord10kmModal() {
  const current = state['record_10km'] || '';
  const pred = getRecord10kmPredictions();
  const mc = document.getElementById('modal-container');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const predHtml = pred ? `
    <div style="margin-top:16px;border-radius:12px;overflow:hidden;border:1px solid var(--border);">
      <div style="background:var(--bg2);padding:8px 14px;border-bottom:1px solid var(--border);">
        <p style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;">Prédictions calculées</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;padding:10px 14px;gap:8px;background:var(--bg);">
        <div style="text-align:center;">
          <p style="font-size:10px;color:var(--muted);margin-bottom:4px;">Record 10km</p>
          <p style="font-size:16px;font-weight:800;color:var(--text);">${pred.record10kmStr}</p>
          <p style="font-size:9px;color:var(--muted);margin-top:2px;">${pred.record10kmPaceStr}/km</p>
        </div>
        <div style="text-align:center;border-left:1px solid var(--border);border-right:1px solid var(--border);padding:0 8px;">
          <p style="font-size:10px;color:var(--muted);margin-bottom:4px;">Semi estimé</p>
          <p style="font-size:16px;font-weight:800;color:#1B4FD8;">${pred.semiStr}</p>
          <p style="font-size:9px;color:var(--muted);margin-top:2px;">${pred.semiPaceStr}/km</p>
        </div>
        <div style="text-align:center;">
          <p style="font-size:10px;color:var(--muted);margin-bottom:4px;">Marathon estimé</p>
          <p style="font-size:16px;font-weight:800;color:#1B4FD8;">${pred.marStr}</p>
          <p style="font-size:9px;color:var(--muted);margin-top:2px;">${pred.marPaceStr}/km</p>
        </div>
      </div>
      <div style="background:var(--bg2);padding:8px 14px;border-top:1px solid var(--border);">
        <p style="font-size:10px;color:var(--muted);line-height:1.5;">Semi = 10km × 2.15 · Vitesse semi = <strong>${pred.semiSpeedKmh} km/h</strong> · Vitesse marathon = ${pred.semiSpeedKmh} − 1 = <strong>${pred.marSpeedKmh} km/h</strong> → ${pred.marPaceStr}/km</p>
      </div>
    </div>` : '';

  overlay.innerHTML = `<div class="modal-box">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div>
        <p style="font-size:16px;font-weight:700;color:var(--text);">Record 10km</p>
        <p style="font-size:12px;color:var(--muted);margin-top:2px;">Ton meilleur temps sur 10km</p>
      </div>
      <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:24px;line-height:1;">×</button>
    </div>
    <p style="font-size:12px;color:var(--muted);margin-bottom:8px;">Format mm:ss (ex : 48:30) ou hh:mm:ss</p>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1B4FD8" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <input id="record10km-input" type="text" value="${current}" placeholder="48:30"
        style="flex:1;padding:12px 14px;border-radius:10px;border:1.5px solid var(--border);background:var(--bg2);font-size:22px;font-weight:700;color:var(--text);text-align:center;"
        oninput="previewRecord10km(this.value)">
    </div>
    <div id="record10km-preview">${predHtml}</div>
    <button onclick="saveRecord10km()" style="width:100%;padding:13px;background:#1B4FD8;border:none;border-radius:var(--radius-sm);font-size:15px;font-weight:700;color:#fff;cursor:pointer;margin-top:12px;">Enregistrer</button>
  </div>`;
  overlay.onclick = e => { if(e.target===overlay) closeModal(); };
  _lockBodyScroll();
  mc.appendChild(overlay);
  setTimeout(() => { const inp=document.getElementById('record10km-input'); if(inp) inp.focus(); }, 100);
}

function previewRecord10km(val) {
  const prev = state['record_10km'];
  state['record_10km'] = val;
  const pred = getRecord10kmPredictions();
  state['record_10km'] = prev; // restore
  const container = document.getElementById('record10km-preview');
  if (!container) return;
  if (!pred) { container.innerHTML = ''; return; }
  container.innerHTML = `
    <div style="margin-top:16px;border-radius:12px;overflow:hidden;border:1px solid var(--border);">
      <div style="background:var(--bg2);padding:8px 14px;border-bottom:1px solid var(--border);">
        <p style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;">Prédictions calculées</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;padding:10px 14px;gap:8px;background:var(--bg);">
        <div style="text-align:center;">
          <p style="font-size:10px;color:var(--muted);margin-bottom:4px;">Record 10km</p>
          <p style="font-size:16px;font-weight:800;color:var(--text);">${pred.record10kmStr}</p>
          <p style="font-size:9px;color:var(--muted);margin-top:2px;">${pred.record10kmPaceStr}/km</p>
        </div>
        <div style="text-align:center;border-left:1px solid var(--border);border-right:1px solid var(--border);padding:0 8px;">
          <p style="font-size:10px;color:var(--muted);margin-bottom:4px;">Semi estimé</p>
          <p style="font-size:16px;font-weight:800;color:#1B4FD8;">${pred.semiStr}</p>
          <p style="font-size:9px;color:var(--muted);margin-top:2px;">${pred.semiPaceStr}/km</p>
        </div>
        <div style="text-align:center;">
          <p style="font-size:10px;color:var(--muted);margin-bottom:4px;">Marathon estimé</p>
          <p style="font-size:16px;font-weight:800;color:#1B4FD8;">${pred.marStr}</p>
          <p style="font-size:9px;color:var(--muted);margin-top:2px;">${pred.marPaceStr}/km</p>
        </div>
      </div>
      <div style="background:var(--bg2);padding:8px 14px;border-top:1px solid var(--border);">
        <p style="font-size:10px;color:var(--muted);line-height:1.5;">Semi = 10km × 2.15 · Vitesse semi <strong>${pred.semiSpeedKmh} km/h</strong> · Marathon ${pred.semiSpeedKmh} − 1 = <strong>${pred.marSpeedKmh} km/h</strong> → ${pred.marPaceStr}/km</p>
      </div>
    </div>`;
}

function saveRecord10km() {
  const val = document.getElementById('record10km-input')?.value?.trim();
  if (!val) return;
  const clean = val.replace(/'/g, ':').replace(/\s/g, '');
  const parts = clean.split(':').map(Number);
  let sec = 0;
  if (parts.length === 3) sec = parts[0]*3600 + parts[1]*60 + parts[2];
  else if (parts.length === 2) sec = parts[0]*60 + parts[1];
  if (!sec || sec < 1200 || sec > 7200) { alert('Format invalide. Exemples : 48:30 ou 1:02:15'); return; }
  state['record_10km'] = val;
  save();
  closeModal();
  renderHome();
  const b10 = document.getElementById('badge-record10km');
  if (b10) b10.textContent = val + ' 10km';
}

function openTargetTimeModal(){
  if(isAdmin()) return;
  const ob=state.onboarding||{};
  const course=ob.course||state.race_distance||'Marathon';
  const current=ob.target_time||state.target_time||'';
  const parts=current.split(':').map(Number);
  const curH=parts[0]||0, curM=parts[1]||0, curS=parts[2]||0;
  const existing=document.getElementById('target-time-modal');
  if(existing) existing.remove();
  const overlay=document.createElement('div');
  overlay.id='target-time-modal';
  overlay.className='modal-overlay';
  overlay.style.setProperty('--_overlay-bg','rgba(0,0,0,0.5)');
  overlay.innerHTML=`<div class="modal-box" style="max-width:340px;">
    <div style="background:linear-gradient(135deg,#0C447C,#1B4FD8);padding:18px 18px 14px;border-radius:24px 24px 0 0;color:#fff;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <p style="font-size:10px;font-weight:800;opacity:0.75;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:3px;">🎯 Temps cible</p>
          <p style="font-size:18px;font-weight:900;letter-spacing:-0.02em;">${course}</p>
        </div>
        <button onclick="document.getElementById('target-time-modal').remove()" style="background:rgba(255,255,255,0.2);border:none;cursor:pointer;color:#fff;font-size:18px;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;">×</button>
      </div>
    </div>
    <div style="padding:20px 18px 24px;">
      <p style="font-size:13px;color:var(--muted);margin-bottom:16px;text-align:center;">Modifie ton objectif de temps pour la course</p>
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:20px;">
        <div style="text-align:center;">
          <p style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">H</p>
          <input id="tt-h" type="number" min="0" max="9" value="${curH}" style="width:62px;text-align:center;font-size:28px;font-weight:800;color:var(--text);background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:10px 4px;outline:none;">
        </div>
        <p style="font-size:28px;font-weight:800;color:var(--muted);margin-top:18px;">:</p>
        <div style="text-align:center;">
          <p style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">MIN</p>
          <input id="tt-m" type="number" min="0" max="59" value="${String(curM).padStart(2,'0')}" style="width:62px;text-align:center;font-size:28px;font-weight:800;color:var(--text);background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:10px 4px;outline:none;">
        </div>
        <p style="font-size:28px;font-weight:800;color:var(--muted);margin-top:18px;">:</p>
        <div style="text-align:center;">
          <p style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">SEC</p>
          <input id="tt-s" type="number" min="0" max="59" value="${String(curS).padStart(2,'0')}" style="width:62px;text-align:center;font-size:28px;font-weight:800;color:var(--text);background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:10px 4px;outline:none;">
        </div>
      </div>
      <button onclick="_saveTargetTime()" style="width:100%;padding:14px;background:linear-gradient(135deg,#0C447C,#1B4FD8);border:none;border-radius:14px;font-size:15px;font-weight:800;color:#fff;cursor:pointer;box-shadow:0 4px 14px rgba(27,79,216,0.3);">✅ Enregistrer</button>
      <button onclick="_clearTargetTime()" style="width:100%;padding:11px;background:none;border:none;font-size:13px;color:var(--muted);cursor:pointer;margin-top:8px;">⏭️ Supprimer le temps cible</button>
    </div>
  </div>`;
  document.getElementById('modal-container').appendChild(overlay);
  setTimeout(()=>document.getElementById('tt-h')?.select(),100);
}

function _saveTargetTime(){
  const h=parseInt(document.getElementById('tt-h')?.value)||0;
  const m=parseInt(document.getElementById('tt-m')?.value)||0;
  const s=parseInt(document.getElementById('tt-s')?.value)||0;
  if(h===0&&m===0&&s===0) return _clearTargetTime();
  const tt=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
  state.target_time=tt;
  if(state.onboarding) state.onboarding.target_time=tt;
  if(dbRef){
    dbRef.child('target_time').set(tt).catch(()=>{});
    if(state.onboarding) dbRef.child('onboarding/target_time').set(tt).catch(()=>{});
  }
  document.getElementById('target-time-modal')?.remove();
  renderHome();
}

function _clearTargetTime(){
  delete state.target_time;
  if(state.onboarding) delete state.onboarding.target_time;
  if(dbRef){
    dbRef.child('target_time').remove().catch(()=>{});
    if(state.onboarding) dbRef.child('onboarding/target_time').remove().catch(()=>{});
  }
  document.getElementById('target-time-modal')?.remove();
  renderHome();
}

function openFcReposModal(dateParam){
  const today = new Date().toISOString().slice(0,10);
  const targetDate = dateParam || today;
  const d = new Date(targetDate + 'T12:00:00');
  const dateFr = d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
  const isToday = targetDate === today;
  const existing = state['fc_repos_'+targetDate] || '';
  const mc=document.getElementById('modal-container');
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.innerHTML=`<div class="modal-box">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div>
        <p style="font-size:16px;font-weight:700;color:var(--text);">FC au repos</p>
        <p style="font-size:12px;color:${isToday?'var(--muted)':'#1B4FD8'};margin-top:2px;font-weight:${isToday?'400':'600'};">${dateFr.charAt(0).toUpperCase()+dateFr.slice(1)}${isToday?'':' — modification'}</p>
      </div>
      <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:24px;line-height:1;">×</button>
    </div>
    <p style="font-size:12px;color:var(--muted);margin-bottom:8px;">Mesurée au réveil, avant de se lever (bpm)</p>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E24B4A" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
      <input id="fc-repos-input" type="number" min="30" max="100" value="${existing}" placeholder="ex: 48"
        style="flex:1;padding:12px 14px;border-radius:10px;border:1.5px solid var(--border);background:var(--bg2);font-size:22px;font-weight:700;color:var(--text);text-align:center;-moz-appearance:textfield;">
      <span style="font-size:16px;color:var(--muted);font-weight:600;">bpm</span>
    </div>
    <button onclick="saveFcRepos('${targetDate}')" style="width:100%;padding:13px;background:#3B6D11;border:none;border-radius:var(--radius-sm);font-size:15px;font-weight:700;color:#fff;cursor:pointer;">Enregistrer</button>
  </div>`;
  overlay.onclick=e=>{if(e.target===overlay)closeModal();};
  _lockBodyScroll();
  mc.appendChild(overlay);
  setTimeout(()=>{ const inp=document.getElementById('fc-repos-input'); if(inp) inp.focus(); },100);
}

function saveFcRepos(dateParam){
  const val = parseInt(document.getElementById('fc-repos-input')?.value);
  if(!val || val < 30 || val > 100) {
    alert('Valeur invalide (entre 30 et 100 bpm)');
    return;
  }
  const today = new Date().toISOString().slice(0,10);
  const targetDate = dateParam || today;
  state['fc_repos_'+targetDate] = val;
  if(targetDate === today) state['fc_repos'] = val; // valeur globale uniquement pour aujourd'hui
  save();
  closeModal();
  renderHome();
  if(document.getElementById('sc-stats').style.display!=='none') renderStats();
  if(targetDate === today && dbRef) {
    dbRef.child("_brief_trigger").set({date: today, ts: Date.now()}).catch(()=>{});
  }
}

// ── FC REPOS CONTEXT BUILDER ─────────────────────────────────────────────────
// Fonction centralisée — injecter dans TOUS les contextes coach
function buildFcReposContext() {
  // Collecter toutes les entrées datées fc_repos_YYYY-MM-DD
  const entries = [];
  Object.keys(state).forEach(k => {
    if(k.startsWith('fc_repos_') && k.match(/fc_repos_\d{4}-\d{2}-\d{2}/)) {
      const date = k.replace('fc_repos_', '');
      entries.push({ date, val: state[k] });
    }
  });
  entries.sort((a, b) => a.date.localeCompare(b.date));

  // Dernière mesure datée
  const derniere = entries.length > 0 ? entries[entries.length - 1] : null;
  const valeurActuelle = derniere ? derniere.val : (state['fc_repos'] || 51);

  // Date lisible de la dernière mesure
  let dateLabel = null;
  if(derniere) {
    const d = new Date(derniere.date + 'T12:00:00');
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const diffDays = Math.round((today - d) / (1000 * 60 * 60 * 24));
    const jours = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
    const mois = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'];
    const label = d.getDate()+' '+mois[d.getMonth()];
    if(diffDays === 0) dateLabel = 'aujourd\'hui ('+label+')';
    else if(diffDays === 1) dateLabel = 'hier ('+label+')';
    else if(diffDays <= 6) dateLabel = 'il y a '+diffDays+' jours ('+jours[d.getDay()]+' '+label+')';
    else dateLabel = label+' (il y a '+diffDays+' jours)';
  }

  // Statistiques sur les 7 / 14 / 30 dernières mesures
  const last7  = entries.slice(-7);
  const last14 = entries.slice(-14);
  const last30 = entries.slice(-30);

  function stats(arr) {
    if(arr.length === 0) return null;
    const vals = arr.map(e => e.val);
    const avg = Math.round(vals.reduce((a,b) => a+b, 0) / vals.length * 10) / 10;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    // Tendance : compare première moitié vs seconde moitié
    let tendance = 'stable';
    if(vals.length >= 4) {
      const mid = Math.floor(vals.length / 2);
      const avgFirst = vals.slice(0, mid).reduce((a,b) => a+b, 0) / mid;
      const avgLast  = vals.slice(mid).reduce((a,b) => a+b, 0) / (vals.length - mid);
      const diff = Math.round((avgLast - avgFirst) * 10) / 10;
      if(diff > 1.5) tendance = 'en hausse (+'+diff+' bpm)';
      else if(diff < -1.5) tendance = 'en baisse ('+diff+' bpm)';
      else tendance = 'stable ('+diff+' bpm)';
    }
    return { nb_mesures: arr.length, moyenne: avg, min, max, tendance };
  }

  // Alerte fatigue
  let alerte = null;
  if(valeurActuelle > 55) {
    if(valeurActuelle > 60) alerte = 'ALERTE FATIGUE ÉLEVÉE : '+valeurActuelle+' bpm (>60) — risque de surmenage, envisager repos';
    else alerte = 'FC repos élevée : '+valeurActuelle+' bpm (>55) — surveiller la fatigue accumulée';
  }

  return {
    valeur_actuelle: valeurActuelle,
    date_mesure: dateLabel || 'date inconnue (valeur par défaut)',
    nb_mesures_total: entries.length,
    derniers_jours: last7.map(e => ({ date: e.date, bpm: e.val })),
    stats_7j:  stats(last7),
    stats_14j: stats(last14),
    stats_30j: stats(last30),
    alerte_fatigue: alerte,
    note: valeurActuelle > 55
      ? 'FC repos > 55 bpm = signal de fatigue possible — à mentionner en priorité'
      : 'FC repos normale — bon état de récupération'
  };
}

function onEditTypeChange(){
  const type=document.getElementById('hm-type').value;
  const container=document.getElementById('hm-detail-container');
  const nameContainer=document.querySelector('#hm-detail-container')?.previousElementSibling;
  if(!container) return;
  if(type==='long'){
    // Récupérer le détail existant pour parser les blocs
    const detailInput=document.getElementById('hm-detail');
    const existingDetail=detailInput?detailInput.value:'';
    container.innerHTML=buildLongModalHtml(existingDetail);
    renderLongBlocks();
    // Masquer le champ nom standard
    const hmName=document.getElementById('hm-name');
    if(hmName) hmName.closest('div').style.display='none';
  } else if(type==='tempo'){
    container.innerHTML=buildTempoFieldsHtml('hm',2,8,'3:00','5:00','5:20');
    const hmName=document.getElementById('hm-name');
    if(hmName) hmName.closest('div').style.display='none';
    setTimeout(()=>selectTempoEfPace('hm', document.getElementById('hm-ef-pace')?.value||getBestEfPace()||'6:40'),50);
  } else if(type==='frac'){
    container.innerHTML=buildTempoFieldsHtml('hm',6,2,'2:00','4:30','4:50','#C4141B');
    const hmName=document.getElementById('hm-name');
    if(hmName) hmName.closest('div').style.display='none';
    setTimeout(()=>selectTempoEfPace('hm', document.getElementById('hm-ef-pace')?.value||getBestEfPace()||'6:40'),50);
  } else {
    container.innerHTML=`<div>
      <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Détail allure (optionnel)</p>
      <input type="text" id="hm-detail" value="" placeholder="ex: 10 EF · 3 AM @ 5:40/km" style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 12px;font-size:14px;color:var(--text);width:100%;outline:none;">
    </div>`;
    const hmName=document.getElementById('hm-name');
    if(hmName) hmName.closest('div').style.display='block';
  }
}

function buildTempoFieldsHtml(prefix, reps, dur, recup, pMin, pMax, accentColor, efPaceDefault){
  const showRecup = reps > 1;
  const O = accentColor || '#E8530A';
  const icon = O === '#C4141B' ? '⚡' : '🔥';
  const efPaceVal = efPaceDefault || getBestEfPace() || '6:40';
  return `
    <!-- Format blocs : grand et lisible -->
    <div class="modal-section">
      <div class="modal-section-label" style="color:${O};">${icon} Blocs d'effort</div>
      <div style="display:flex;align-items:center;gap:0;background:var(--bg);border-radius:16px;overflow:hidden;border:2px solid ${O}25;">
        <div style="flex:1;padding:16px 12px;text-align:center;border-right:1.5px solid ${O}20;">
          <p style="font-size:10px;font-weight:800;color:${O};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Répétitions</p>
          <input type="number" id="${prefix}-reps" value="${reps}" min="1" max="10" step="1"
            onchange="onTempoRepsChange('${prefix}')"
            style="background:none;border:none;outline:none;font-size:42px;font-weight:900;color:${O};width:100%;text-align:center;padding:0;">
        </div>
        <div style="padding:16px 6px;font-size:28px;font-weight:900;color:${O}50;">×</div>
        <div style="flex:1;padding:16px 12px;text-align:center;border-left:1.5px solid ${O}20;">
          <p style="font-size:10px;font-weight:800;color:${O};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Minutes</p>
          <input type="number" id="${prefix}-dur" value="${dur}" min="1" max="60" step="1"
            oninput="onTempoInputChange('${prefix}')"
            style="background:none;border:none;outline:none;font-size:42px;font-weight:900;color:${O};width:100%;text-align:center;padding:0;">
        </div>
      </div>
    </div>

    <!-- Récupération -->
    <div id="${prefix}-recup-container" class="modal-section" style="display:${showRecup?'block':'none'};">
      <div class="modal-section-label">⏸ Récupération entre les blocs</div>
      <div style="display:flex;align-items:center;gap:12px;">
        <input type="text" id="${prefix}-recup" value="${recup}" placeholder="3:00" maxlength="5"
          oninput="onTempoInputChange('${prefix}')"
          style="background:var(--bg);border:2px solid var(--border);border-radius:14px;padding:13px;font-size:28px;font-weight:800;color:var(--text);width:110px;outline:none;text-align:center;flex-shrink:0;">
        <div>
          <p style="font-size:13px;font-weight:700;color:var(--text);">min : sec</p>
          <p style="font-size:11px;color:var(--muted);margin-top:2px;">Footing léger entre chaque répét.</p>
        </div>
      </div>
    </div>

    <!-- Allure cible -->
    <div class="modal-section">
      <div class="modal-section-label" style="color:${O};">🎯 Allure cible /km</div>
      <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:end;gap:10px;">
        <div style="text-align:center;">
          <p style="font-size:10px;font-weight:800;color:${O};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">⚡ Rapide</p>
          <input type="text" id="${prefix}-pace-min" value="${pMin}" placeholder="5:00" maxlength="5"
            oninput="onTempoInputChange('${prefix}')"
            style="background:var(--bg);border:3px solid ${O};border-radius:14px;padding:14px 10px;font-size:28px;font-weight:900;color:${O};width:100%;outline:none;text-align:center;">
        </div>
        <div style="padding-bottom:14px;color:var(--muted);font-size:20px;font-weight:700;">—</div>
        <div style="text-align:center;">
          <p style="font-size:10px;font-weight:800;color:${O}80;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">🐢 Lente</p>
          <input type="text" id="${prefix}-pace-max" value="${pMax}" placeholder="5:20" maxlength="5"
            oninput="onTempoInputChange('${prefix}')"
            style="background:var(--bg);border:3px solid ${O}50;border-radius:14px;padding:14px 10px;font-size:28px;font-weight:900;color:${O};width:100%;outline:none;text-align:center;">
        </div>
      </div>
    </div>

    <!-- EF allure — échauffement · récup · fin -->
    <div class="modal-section">
      <div class="modal-section-label" style="color:#3B6D11;">🟢 Allure EF — échauffement · récup · fin</div>
      <div style="display:flex;align-items:stretch;gap:12px;margin-bottom:14px;">
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;">
          <input type="text" id="${prefix}-ef-pace" value="${efPaceVal}" maxlength="5"
            oninput="calcEfRestantForPrefix('${prefix}')"
            style="background:var(--bg);border:3px solid #3B6D11;border-radius:14px;padding:13px 10px;font-size:30px;font-weight:900;color:#3B6D11;width:104px;outline:none;text-align:center;line-height:1;">
          <p style="font-size:9px;color:#3B6D11;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;">/km</p>
        </div>
        <div style="flex:1;display:flex;flex-wrap:wrap;align-content:center;gap:6px;">
          ${['6:20','6:10','6:00','5:50','5:40','5:30'].map(p=>`<button type="button" id="${prefix}-ef-chip-${p.replace(':','-')}" onclick="selectTempoEfPace('${prefix}','${p}')" style="padding:6px 10px;border-radius:20px;font-size:12px;font-weight:700;border:1.5px solid var(--border);background:var(--bg);color:var(--muted);cursor:pointer;transition:all 0.15s;">${p}</button>`).join('')}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="modal-stat-card" style="background:#EEF2FD;border:none;">
          <div class="modal-stat-label" style="color:#1B4FD8;">⏱ Durée totale</div>
          <div class="modal-stat-value" style="color:#1B4FD8;" id="${prefix}-tempo-duration">—</div>
        </div>
        <div class="modal-stat-card" style="background:#EAF3DE;border:none;">
          <div class="modal-stat-label" style="color:#3B6D11;">🏁 EF de fin</div>
          <div class="modal-stat-value" style="color:#3B6D11;" id="${prefix}-ef-fin">—</div>
        </div>
      </div>
    </div>
    <div id="${prefix}-ef-restant-display" style="display:none;"></div>`;
}

function calcEfRestantForPrefix(prefix){
  // Cherche d'abord l'ID standardisé, sinon le fallback hérité (_buildTempoEditFields)
  const displayId = document.getElementById(prefix+'-ef-restant-display')
    ? prefix+'-ef-restant-display'
    : 'ef-restant-display';
  calcEfRestantGeneric(prefix, displayId);
}

function onTempoInputChange(prefix){
  calcEfRestantForPrefix(prefix);
}

function onTempoRepsChange(prefix){
  const repsEl=document.getElementById(prefix+'-reps');
  const recupContainer=document.getElementById(prefix+'-recup-container');
  if(repsEl&&recupContainer){
    recupContainer.style.display=parseInt(repsEl.value)>1?'block':'none';
  }
  calcEfRestantForPrefix(prefix);
}

function calcEfRestant(){ calcEfRestantGeneric('hm', 'ef-restant-hm-display'); }

// Alias for backward compatibility
function calcSessionDuration(s){ return estimateDuration(s); }

// Estime la durée d'une séance en secondes, retourne une string formatée
function estimateDuration(s) {
  if(!s || s.type==='rest') return '';
  const parts = s.d.split('|');
  const title = parts[0];
  const detail = parts[1]||'';
  const km = s.km;

  // Parser une allure 'M:SS' ou "M'SS" → min/km
  const parsePaceMin = (p) => {
    if(!p) return null;
    const m = p.replace("'",":").match(/(\d+):(\d+)/);
    return m ? parseInt(m[1]) + parseInt(m[2])/60 : null;
  };

  // Formater des minutes totales → '52'30"' ou '1h08'30"'
  const fmtDur = (totalMin) => {
    if(totalMin <= 0) return '';
    const totalSec = Math.round(totalMin * 60);
    const h = Math.floor(totalSec/3600);
    const m = Math.floor((totalSec%3600)/60);
    const s = totalSec%60;
    const base = h > 0 ? h+'h'+String(m).padStart(2,'0')+"'" : m+"'";
    return base + (s > 0 ? String(s).padStart(2,'0')+'"' : '');
  };

  if(s.type === 'ef' || s.type === 'long') {
    // Allure EF : chercher "EF @ X:XX" d'abord, sinon getBestEfPace
    // Ne jamais prendre l'allure AM (@ 5'40/km) comme allure EF
    const efAtMatch = detail.match(/EF\s*[@\s]\s*(\d+)['':](\d+)/i);
    let paceMin = efAtMatch ? parsePaceMin(efAtMatch[1]+':'+efAtMatch[2]) : null;
    if(!paceMin && s.type === 'ef') {
      // EF simple : chercher X:XX/km explicitement
      const efKmMatch = detail.match(/(\d+)[':](\d+)\/km/);
      paceMin = efKmMatch ? parsePaceMin(efKmMatch[1]+':'+efKmMatch[2]) : null;
    }
    if(!paceMin) {
      // Fallback : dernière allure EF validée
      const efStr = getBestEfPace()||"6'40";
      paceMin = parsePaceMin(efStr.replace("'",":")) || 5.8;
    }
    if(s.type === 'long') {
      // Long : blocs EF × paceMin + blocs AM × allure AM entraînement
      const amStr = getAmTrainingPace();
      const amMin = parsePaceMin((amStr||"5:40").replace("'",":")) || 5.67;
      let totalMin = 0;
      detail.split('·').forEach(part => {
        const m2 = part.trim().match(/^(\d+(?:\.\d+)?)\s*(EF|AM)/i);
        if(m2) totalMin += parseFloat(m2[1]) * (/AM/i.test(m2[2]) ? amMin : paceMin);
      });
      if(totalMin === 0) totalMin = km * paceMin; // fallback
      return fmtDur(totalMin);
    }
    return fmtDur(km * paceMin);
  }

  if(s.type === 'tempo' || s.type === 'frac') {
    const isFrac = s.type === 'frac';
    const repMatch = title.match(/(\d+)[×x×](\d+)/);
    const reps = repMatch ? parseInt(repMatch[1]) : (isFrac ? 6 : 2);
    const durMin = repMatch ? parseInt(repMatch[2]) : (isFrac ? 2 : 8);

    const efDetailMatch = detail.match(/EF\s*[@\s]\s*(\d+)['':](\d+)/i);
    const paceEf = efDetailMatch
      ? (parsePaceMin(efDetailMatch[1]+':'+efDetailMatch[2]) || 6.67)
      : (parsePaceMin((getBestEfPace()||"6'40").replace("'",":")) || 6.67);

    // 1ère allure dans le detail = allure des blocs
    const paceMatch2 = detail.match(/(\d+)[':](\d+)/);
    const paceBlocMin = paceMatch2 ? parsePaceMin(paceMatch2[1]+':'+paceMatch2[2]) : (isFrac ? 4.5 : 4.92);

    const recupMatch = detail.match(/([\d:]+)\s*min\s*r[eé]cup/i);
    const recupMinutes = recupMatch ? (()=>{
      const rp = recupMatch[1].split(':');
      return rp.length>1 ? parseInt(rp[0])+parseInt(rp[1])/60 : parseFloat(rp[0])||(isFrac?2:3);
    })() : (isFrac ? 2 : 3);

    const KM_ECHA = isFrac ? 2.0 : 3.0;
    const kmBlocs = paceBlocMin ? (reps * durMin) / paceBlocMin : 0;
    const kmRecup = (reps * recupMinutes) / paceEf;
    const kmEfRestantRaw = km - KM_ECHA - kmBlocs - kmRecup;
    const kmEfRestant = kmEfRestantRaw <= 0 ? kmEfRestantRaw : Math.ceil(kmEfRestantRaw * 2) / 2;
    const totalMin = (KM_ECHA * paceEf) + (reps * durMin) + (reps * recupMinutes) + (Math.max(0,kmEfRestant) * paceEf);
    return fmtDur(totalMin);
  }

  return '';
}
// ── Calcul durée estimée d'une séance ────────────────────────────────────
function calcEfRestant(){ calcEfRestantGeneric('edit', 'ef-restant-display'); }
function calcEfRestantGeneric(prefix, displayId){
  const display = document.getElementById(displayId);
  if(!display) return;

  // Lire les valeurs des champs
  const reps = parseInt(document.getElementById(prefix+'-reps')?.value)||2;
  const durMin = parseInt(document.getElementById(prefix+'-dur')?.value)||8;
  const kmTotal = parseFloat(document.getElementById(prefix+'-km')?.value)||0;
  const recupRaw = (document.getElementById(prefix+'-recup')?.value||'3').trim();
  const paceMinRaw = (document.getElementById(prefix+'-pace-min')?.value||'5:00').trim();

  if(!kmTotal || kmTotal <= 0) { display.innerHTML = '<span style="color:var(--muted);font-size:12px;">Renseigne la distance totale pour voir le calcul.</span>'; return; }

  // Parser allure tempo (ex: "4:55" ou "4'55")
  const parsePace = (p) => {
    const clean = p.replace("'",":").replace(",",":");
    const parts = clean.split(':');
    if(parts.length<2) return null;
    return parseInt(parts[0]) + parseInt(parts[1])/60; // en min/km
  };

  // Parser récupération (ex: "3" ou "3:00" ou "2:30")
  const parseRecup = (r) => {
    if(!r) return 3;
    const clean = r.replace("'",":").replace(",",":");
    const parts = clean.split(':');
    if(parts.length===1) return parseFloat(parts[0])||3;
    return parseInt(parts[0]) + parseInt(parts[1])/60;
  };

  const paceTempoMin = parsePace(paceMinRaw); // allure min des blocs (la plus rapide)
  const efPaceField = document.getElementById(prefix+'-ef-pace');
  const efPaceStr = (efPaceField && efPaceField.value.trim()) || getBestEfPace() || "6'00";
  const paceEfMin = parsePace(efPaceStr.replace("'",":")) || 6.0;
  const recupMinutes = parseRecup(recupRaw);

  if(!paceTempoMin) { display.innerHTML = '<span style="color:var(--muted);">Allure tempo invalide.</span>'; return; }

  // Calculs
  const KM_ECHAUFFEMENT = 3.0;
  const kmBlocs = (reps * durMin) / paceTempoMin;                        // km sur les blocs tempo
  const kmRecup = (reps * recupMinutes) / paceEfMin; // km sur les récups EF (1 récup après chaque bloc)
  const kmEfRestantRaw = kmTotal - KM_ECHAUFFEMENT - kmBlocs - kmRecup;
  // Arrondi au 0.5 supérieur
  const kmEfRestant = kmEfRestantRaw <= 0 ? kmEfRestantRaw : Math.ceil(kmEfRestantRaw * 2) / 2;

  // Affichage
  const fmt = (km) => km >= 1
    ? Math.round(km*100)/100 + ' km'
    : Math.round(km*1000) + ' m';

  const couleur = kmEfRestant < 0 ? '#ef4444' : '#3B6D11';
  const emoji = kmEfRestant < 0 ? '⚠️' : '✓';

  // Remplir les nouveaux champs compacts si présents
  const durEl1 = document.getElementById(prefix+'-tempo-duration');
  const efFinEl1 = document.getElementById(prefix+'-ef-fin');
  if(durEl1) {
    // Utiliser la même formule que le header (estimateDuration via le contexte actuel)
    const totalMin2 = (KM_ECHAUFFEMENT*paceEfMin) + (reps*durMin) + (reps*recupMinutes) + (Math.max(0,kmEfRestant)*paceEfMin);
    const ts2=Math.round(totalMin2*60), h2=Math.floor(ts2/3600), m2=Math.floor((ts2%3600)/60), s2=ts2%60;
    const base2 = h2>0 ? h2+'h'+String(m2).padStart(2,'0')+"'" : m2+"'";
    const durStr2 = base2 + (s2>0 ? String(s2).padStart(2,'0')+'"' : '');
    durEl1.textContent = durStr2;
    // Synchroniser le header modal
    const hdrTempo=document.querySelector('.modal-box p[style*="color:var(--blue)"][style*="font-weight:600"]');
    if(hdrTempo&&hdrTempo.textContent.includes('estimées')) hdrTempo.textContent='⏱ ~'+durStr2+' estimées';
  }
  if(efFinEl1) {
    efFinEl1.textContent = kmEfRestant < 0 ? '⚠️ -'+Math.abs(Math.round(kmEfRestant*10)/10)+'km' : Math.round(kmEfRestant*10)/10+' km';
    efFinEl1.style.color = kmEfRestant < 0 ? '#ef4444' : '#3B6D11';
  }
  display.innerHTML =
    '<div style="display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:12px;">'
    + '<span style="color:var(--muted);">Échauffement EF</span><span style="font-weight:600;">'+KM_ECHAUFFEMENT+' km</span>'
    + '<span style="color:var(--muted);">'+reps+'×'+durMin+'min tempo ('+paceMinRaw+'/km)</span><span style="font-weight:600;">'+fmt(kmBlocs)+'</span>'
    + '<span style="color:var(--muted);">'+reps+'×'+recupRaw+'min récup EF ('+efPaceStr+'/km)</span><span style="font-weight:600;">'+fmt(kmRecup)+'</span>'
    + '<span style="color:var(--muted);">Total utilisé</span><span style="font-weight:600;">'+fmt(KM_ECHAUFFEMENT+kmBlocs+kmRecup)+'</span>'
    + '</div>'
    + '<div style="margin-top:8px;padding:8px 10px;background:white;border-radius:6px;border:1.5px solid '+couleur+';display:flex;align-items:center;justify-content:space-between;">'
    + '<span style="font-size:12px;font-weight:600;color:'+couleur+';">'+emoji+' EF de fin</span>'
    + '<span style="font-size:18px;font-weight:800;color:'+couleur+';">'+(kmEfRestant<0?'⚠️ -'+fmt(Math.abs(kmEfRestant)):fmt(kmEfRestant))+'</span>'
    + '</div>'
    + (kmEfRestant < 0 ? '<p style="font-size:11px;color:#ef4444;margin-top:4px;">Distance totale insuffisante pour ce format — augmente les km.</p>' : '');
}

function buildLongModalHtml(detail){
  const am=getAmTrainingPace();
  // Extraire l'allure EF si déjà sauvegardée dans le detail
  const efPaceMatch=(detail||'').match(/EF\s*[@\s]\s*(\d+)['':](\d+)/);
  const currentEfPace=efPaceMatch?efPaceMatch[1]+':'+efPaceMatch[2]:(getBestEfPace()||'6:40').replace("'",'::').replace(/:(\d{3}).*/,'').replace('::',"'");
  const blocks=[];
  (detail||'').split('·').forEach(part=>{
    const p=part.trim();
    const m=p.match(/^(\d+(?:\.\d+)?)\s*(EF|AM)/i);
    if(m) blocks.push({km:parseFloat(m[1]),type:m[2].toUpperCase()});
  });
  if(blocks.length===0){blocks.push({km:5,type:'EF'});blocks.push({km:3,type:'AM'});}
  const blocksJson=JSON.stringify(blocks).replace(/"/g,'&quot;');
  const efPaces=['6:25','6:20','6:15','6:10','6:05','6:00','5:55','5:50','5:45','5:40','5:35','5:30'];
  const efChips=efPaces.map(p=>`<button type="button" id="long-ef-chip-${p.replace(':','-')}" onclick="selectLongEfPace('${p}')" style="padding:5px 9px;border-radius:20px;font-size:11px;font-weight:600;border:1.5px solid var(--border);background:var(--bg2);color:var(--muted);cursor:pointer;transition:all 0.15s;">${p}</button>`).join('');
  const curEf=(getBestEfPace()||'6:40').replace("'",'::').split('::')[0] || '5';
  return '<div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">'
    +'<div style="background:#EAF3DE;border-radius:8px;padding:9px 12px;">'
    +'<p style="font-size:10px;color:#3B6D11;margin-bottom:4px;">Allure EF</p>'
    +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">'
    +'<input type="text" id="long-ef-pace" value="'+currentEfPace+'" maxlength="5" oninput="updateLongDuration();highlightLongEfChip(this.value)" style="background:var(--bg);border:2px solid #3B6D11;border-radius:8px;padding:6px 8px;font-size:17px;font-weight:700;color:#3B6D11;width:72px;outline:none;text-align:center;">'
    +'<span style="font-size:11px;color:var(--muted);">/km</span>'
    +'</div>'
    +'<div style="display:flex;flex-wrap:wrap;gap:4px;">'+efChips+'</div>'
    +'</div>'
    +'<div style="display:flex;flex-direction:column;gap:6px;">'
    +'<div style="background:#EEF2FD;border-radius:8px;padding:9px 12px;">'
    +'<p style="font-size:10px;color:var(--muted);margin-bottom:3px;">Allure AM</p>'
    +'<p style="font-size:15px;font-weight:700;color:var(--blue);">'+am+' /km</p>'
    +'</div>'
    +'<div style="background:#F0FDF4;border-radius:8px;padding:9px 12px;" id="long-duration-box">'
    +'<p style="font-size:10px;color:#3B6D11;margin-bottom:3px;">Durée estimée</p>'
    +'<p style="font-size:15px;font-weight:700;color:#3B6D11;" id="long-duration-val">—</p>'
    +'</div>'
    +'</div>'
    +'</div>'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">'+'<p style="font-size:10px;font-weight:800;color:#534AB7;text-transform:uppercase;letter-spacing:0.1em;">🗓 Organisation de la séance</p>'+'</div>'+'<div id="long-blocks" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px;"></div>'+'<div id="long-blocks-total" style="font-size:13px;font-weight:800;padding:10px 14px;border-radius:12px;border:2px solid;margin-bottom:10px;"></div>'+'<button onclick="addLongBlock()" style="width:100%;padding:11px;background:var(--bg);border:2px dashed #534AB750;border-radius:12px;font-size:13px;font-weight:700;color:#534AB7;cursor:pointer;">+ Ajouter un bloc</button>'
    +'<input type="hidden" id="long-blocks-data" value="'+blocksJson+'">'
    +'</div>';
}

function openHomeModal(idx){
  openEditModal(CW, idx);
}
function saveHomeModal(idx){
  saveEdit(CW, idx);
}
function clearHomeModal(idx){
  resetSession(CW, idx);
}
function openModal(idx){
  const s=weeks[CW-1].sessions[idx],cur=state[gk(CW,idx)+'km']||'';
  const mc=document.getElementById('modal-container');
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.innerHTML=`<div class="modal-box">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <p style="font-size:16px;font-weight:600;color:var(--text);">${s.d}</p>
      <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:24px;line-height:1;">×</button>
    </div>
    ${s.shoe?`<div style="margin-bottom:12px;">${shoeFullBadge(s.shoe)}</div>`:''}
    <p style="font-size:13px;color:var(--muted);margin-bottom:14px;">Planifié : <strong style="color:var(--text);">${s.km} km</strong> — saisissez vos km réels :</p>
    <input type="number" id="modal-input" min="0" max="99" step="1" value="${cur}" placeholder="${s.km}" style="margin-bottom:16px;font-size:22px;text-align:center;font-weight:700;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <button class="btn-secondary" onclick="clearKm(${idx})">Effacer</button>
      <button style="padding:12px;background:#1B4FD8;border:none;border-radius:var(--radius-sm);font-size:14px;font-weight:600;color:#fff;cursor:pointer;" onclick="saveKm(${idx})">Enregistrer</button>
    </div>
  </div>`;
  overlay.onclick=e=>{if(e.target===overlay)closeModal();};
  _lockBodyScroll();
  mc.appendChild(overlay);
}
function _lockBodyScroll(){
  if(document.body.dataset.scrollLocked) return; // déjà verrouillé
  const sy = window.scrollY || 0;
  document.body.dataset.scrollLocked = '1';
  document.body.dataset.scrollY = sy;
  document.body.style.position = 'fixed';
  document.body.style.top = '-' + sy + 'px';
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.overflow = 'hidden';
}
function _unlockBodyScroll(){
  if(!document.body.dataset.scrollLocked) return;
  const sy = parseInt(document.body.dataset.scrollY || '0', 10);
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.overflow = '';
  delete document.body.dataset.scrollLocked;
  delete document.body.dataset.scrollY;
  window.scrollTo(0, sy);
}
function closeModal(){
  _unlockBodyScroll();
  const mc=document.getElementById('modal-container');
  if(!mc) return;
  const overlay=mc.firstElementChild;
  const box=overlay&&overlay.querySelector('.modal-box');
  if(overlay && box){
    // Stopper les animations CSS en cours
    overlay.style.animation='none';
    box.style.animation='none';
    // Forcer reflow pour figer l'état actuel
    void overlay.offsetHeight;
    // Animer l'overlay entier vers le bas (pas limité par overflow/clip)
    // Même durée que l'ouverture (0.32s), easing identique
    overlay.style.transition='transform 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.4s ease';
    overlay.style.transform='translateY(100%)';
    overlay.style.opacity='0';
    setTimeout(()=>{mc.innerHTML='';_prefilledModif=null;_selectedModifSi=null;},520);
  } else if(mc){
    mc.innerHTML='';_prefilledModif=null;_selectedModifSi=null;
  }
}
function _initSwipeToDismiss(overlay, box) {
  let startY = 0, startX = 0, startScrollTop = 0, dragging = false, currentY = 0, directionLocked = false, isHorizontal = false;
  const THRESHOLD = 120; // px pour déclencher la fermeture
  const VELOCITY_THRESHOLD = 0.5; // px/ms

  box.addEventListener('touchstart', function(e) {
    // Permettre le swipe seulement si on est tout en haut du scroll
    const scrollable = box.querySelector('.modal-scroll-body') || box.querySelector('[style*="overflow-y:auto"]') || box;
    startScrollTop = scrollable.scrollTop || 0;
    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
    currentY = 0;
    dragging = false;
    directionLocked = false;
    isHorizontal = false;
  }, {passive: true});

  let lastY = 0, lastTime = 0;
  box.addEventListener('touchmove', function(e) {
    const dy = e.touches[0].clientY - startY;
    const dx = e.touches[0].clientX - startX;
    const now = Date.now();

    // Déterminer la direction dominante dès qu'on a assez de déplacement
    if (!directionLocked && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      directionLocked = true;
      isHorizontal = Math.abs(dx) > Math.abs(dy);
    }

    // Si geste horizontal : bloquer complètement
    if (isHorizontal) {
      e.preventDefault();
      return;
    }

    const scrollable = box.querySelector('.modal-scroll-body') || box.querySelector('[style*="overflow-y:auto"]') || box;
    const atTop = (scrollable.scrollTop || 0) <= 0;

    // Commencer le drag seulement si on tire vers le bas ET qu'on est en haut
    if (!dragging && dy > 8 && atTop) {
      dragging = true;
      box.style.transition = 'none';
    }
    if (!dragging) return;

    currentY = Math.max(0, dy); // pas vers le haut
    box.style.transform = `translateY(${currentY}px)`;
    // Assombrir proportionnellement
    const ratio = Math.min(currentY / 300, 1);
    overlay.style.background = `rgba(0,0,0,${0.4 * (1 - ratio * 0.7)})`;

    lastY = e.touches[0].clientY;
    lastTime = now;
    if (currentY > 20) e.preventDefault();
  }, {passive: false});

  box.addEventListener('touchend', function(e) {
    if (!dragging) return;
    dragging = false;

    const velocity = lastTime ? (currentY / (Date.now() - (lastTime - 50))) : 0;
    const shouldClose = currentY > THRESHOLD || velocity > VELOCITY_THRESHOLD;

    if (shouldClose) {
      // Animer depuis la position actuelle du doigt jusqu'en bas
      // durée proportionnelle à la distance restante, min 600ms max 1200ms
      const boxH = box.offsetHeight;
      const remaining = Math.max(boxH - currentY, 80);
      const swipeDuration = Math.round(Math.min(Math.max(remaining / 600 * 1000, 600), 1200));
      // Figer overlay à sa position, puis animer vers le bas
      overlay.style.animation = 'none';
      overlay.style.transition = 'none';
      void overlay.offsetHeight;
      overlay.style.transition = `transform ${swipeDuration}ms cubic-bezier(0.22,1,0.36,1), opacity ${Math.round(swipeDuration * 0.75)}ms ease`;
      overlay.style.transform = 'translateY(100%)';
      overlay.style.opacity = '0';
      setTimeout(() => {
        _unlockBodyScroll();
        const mc = document.getElementById('modal-container');
        if (mc) { mc.innerHTML = ''; _prefilledModif = null; _selectedModifSi = null; }
      }, swipeDuration + 30);
    } else {
      // Snap back
      box.style.transition = 'transform 0.3s cubic-bezier(0.32,0.72,0,1)';
      box.style.transform = 'translateY(0)';
      overlay.style.transition = 'background 0.2s ease';
      overlay.style.background = 'var(--_overlay-bg, rgba(0,0,0,0.4))';
      setTimeout(() => { box.style.transition = ''; }, 320);
    }
    currentY = 0;
  }, {passive: true});
}

function saveKm(idx){
  const v=parseFloat(document.getElementById('modal-input').value);
  if(!isNaN(v)&&v>=0){state[gk(CW,idx)+'km']=v;state[gk(CW,idx)+'done']=true;save();if(dbRef) dbRef.child('_last_validation_w'+CW).set(Date.now()).catch(()=>{});}
  closeModal();renderHome();rendered.stats=false;if(document.getElementById('sc-stats').style.display!=='none')renderStats();
}
function clearKm(idx){delete state[gk(CW,idx)+'km'];save();closeModal();renderHome();rendered.stats=false;if(document.getElementById('sc-stats').style.display!=='none')renderStats();}
function toggleDone(idx){
  const k=gk(CW,idx)+'done';
  const wasDone=!!state[k];
  if(!wasDone){
    // Ouvrir le modal de validation
    openValidationModal(idx);
  } else {
    // Décocher — supprimer done, km réels et perf
    state[k]=false;
    delete state[gk(CW,idx)+'km'];
    delete state[gk(CW,idx)+'perf'];
    save();
    renderHome();
    rendered.stats=false;
    if(document.getElementById('sc-stats').style.display!=='none')renderStats();
  }
}

const openWeeks=new Set();
function getAthleteCW(){
  // Semaine courante de l'athlète = semaines écoulées depuis plan_start_date
  if(!state.plan_start_date) return 1;
  const start=new Date(state.plan_start_date);
  const now=new Date();
  const diffDays=Math.floor((now-start)/(1000*60*60*24));
  return Math.max(1, Math.floor(diffDays/7)+1);
}

function renderAthletePlan(el){
  const ACW=getAthleteCW();
  // Collecter toutes les semaines avec séances extra
  const weekNums=new Set();
  for(let ws=1;ws<=52;ws++){if(state['extra_w'+ws+'_s0']) weekNums.add(ws);}

  if(weekNums.size===0){
    el.innerHTML=`<div style="text-align:center;padding:48px 24px;color:#888;">
      <div style="font-size:40px;margin-bottom:12px;">📋</div>
      <p style="font-size:15px;font-weight:600;color:#444;margin-bottom:8px;">Ton plan est vide</p>
      <p style="font-size:13px;color:#888;margin-bottom:20px;">Ajoute tes premières séances pour construire ton plan.</p>
      <button onclick="openAddModal(1)" style="padding:12px 24px;background:#1B4FD8;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;">+ Ajouter une séance</button>
      <div style="margin-top:10px;">
        <button onclick="showOnboarding(true)" style="padding:12px 24px;background:#EAF3DE;color:#3B6D11;border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;">✨ Générer un plan</button>
      </div>
    </div>`;
    return;
  }

  // Précalculer km par semaine pour détecter les semaines de décharge
  const weekKmMap={};
  for(let ws=1;ws<=52;ws++){
    if(!state['extra_w'+ws+'_s0']) continue;
    let t=0,ei=0;
    while(state[`extra_w${ws}_s${ei}`]){try{t+=parseFloat(JSON.parse(state[`extra_w${ws}_s${ei}`]).km)||0;}catch(e){}ei++;}
    weekKmMap[ws]=Math.round(t*10)/10;
  }
  const sortedWeeks=[...weekNums].sort((a,b)=>a-b);

  // Trouver la semaine de course (type 'race') pour badges et carte Jour J
  let raceWeekNum=null,raceSessionData=null;
  outerRace: for(const ws of sortedWeeks){
    let ei=0;
    while(state[`extra_w${ws}_s${ei}`]){
      try{const s=JSON.parse(state[`extra_w${ws}_s${ei}`]);if(s.type==='race'){raceWeekNum=ws;raceSessionData=s;break outerRace;}}catch(e){}
      ei++;
    }
  }
  // Bouton suppression du plan (vue coach admin uniquement)
  if(_adminPreviewUid){
    const delBanner=document.createElement('div');
    delBanner.style.cssText='display:flex;justify-content:flex-end;margin-bottom:12px;';
    delBanner.innerHTML=`<button onclick="cvDeletePlan()" style="background:#fff0f0;border:1px solid #ffcdd2;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;color:#c0392b;cursor:pointer;">🗑 Supprimer le plan</button>`;
    el.appendChild(delBanner);
  }

  let currentRenderMonth=-1; // pour séparateurs de mois

  sortedWeeks.forEach((ws,wsIdx)=>{
    const isCur=ws===ACW, isPast=ws<ACW;
    const prevWs=wsIdx>0?sortedWeeks[wsIdx-1]:null;
    const prevKm=prevWs!=null?weekKmMap[prevWs]:null;
    const thisKm=weekKmMap[ws]||0;
    const isDecharge=prevKm!=null&&thisKm>0&&thisKm<prevKm*0.92;
    const isRaceWeekCard=ws===raceWeekNum;
    const isAffutage=!isRaceWeekCard&&raceWeekNum!=null&&ws>=raceWeekNum-3&&ws<raceWeekNum&&isDecharge;

    // Collecter séances de cette semaine
    const sessions=[];
    let ei=0;
    while(state[`extra_w${ws}_s${ei}`]){
      try{
        const s=JSON.parse(state[`extra_w${ws}_s${ei}`]);
        const done=!!state[`extra_w${ws}_s${ei}_done`];
        const kmDone=state[`extra_w${ws}_s${ei}_km`]!=null?parseFloat(state[`extra_w${ws}_s${ei}_km`]):null;
        const perf=state[`extra_w${ws}_s${ei}_perf`]?JSON.parse(state[`extra_w${ws}_s${ei}_perf`]):{};
        sessions.push({s,ei,done,kmDone,perf});
      }catch(e){}
      ei++;
    }

    const kmTotal=sessions.reduce((t,{s})=>t+(parseFloat(s.km)||0),0);
    const doneCnt=sessions.filter(x=>x.done).length;
    const allDone=doneCnt===sessions.length&&sessions.length>0;
    const weekDone=sessions.length?Math.round(doneCnt/sessions.length*100):0;

    // Extraire la date du lundi depuis la première séance
    let weekDateLabel='',weekMonthIdx=-1,weekMonthName='';
    if(sessions.length&&sessions[0].s&&sessions[0].s.sched_date){
      try{
        const sd=new Date(sessions[0].s.sched_date+'T00:00:00');
        const d=sd.getDay();
        const mon=new Date(sd); mon.setDate(sd.getDate()+(d===0?-6:1-d));
        const mC=['jan','fév','mar','avr','mai','juin','juil','aoû','sep','oct','nov','déc'];
        const mL=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
        weekDateLabel='lun. '+mon.getDate()+' '+mC[mon.getMonth()];
        weekMonthIdx=mon.getMonth(); weekMonthName=mL[mon.getMonth()];
      }catch(e){}
    }

    const numBg=isCur?'var(--blue)':isPast?'var(--bg2)':'var(--bg2)';
    const numColor=isCur?'#fff':isPast?'var(--muted)':'var(--text)';
    const statusHtml=allDone
      ?`<span style="font-size:13px;font-weight:700;color:#3B6D11;">${kmTotal}<span style="font-size:10px;font-weight:500;color:#3B6D11aa;"> km</span> <span style="font-size:11px;">✓</span></span>`
      :`<span style="font-size:13px;font-weight:700;color:${isCur?'var(--blue)':'var(--text)'};">${kmTotal}<span style="font-size:10px;font-weight:500;color:var(--muted);"> km</span></span>`;
    const progressHtml=isCur
      ?`<div class="plan-progress-bar"><div class="plan-progress-fill" style="width:${weekDone}%;background:var(--blue);"></div></div>`
      :isPast?`<div class="plan-progress-bar"><div class="plan-progress-fill" style="width:100%;background:#3B6D11;opacity:0.35;"></div></div>`:'';

    const isOpen=openWeeks.has(ws);
    const chevron=`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2.5" style="transform:${isOpen?'rotate(180deg)':'rotate(0)'};transition:transform 0.25s;flex-shrink:0;"><polyline points="6 9 12 15 18 9"/></svg>`;

    const badges=[];
    if(isCur) badges.push(`<span class="plan-badge" style="background:#EEF2FD;color:#1438A8;">En cours</span>`);
    if(isRaceWeekCard) badges.push(`<span class="plan-badge" style="background:#FEF9E7;color:#B7791F;">🏆 Course</span>`);
    else if(isAffutage) badges.push(`<span class="plan-badge" style="background:#EDF7EF;color:#2F6E44;">🔽 Affûtage</span>`);
    else if(isDecharge) badges.push(`<span class="plan-badge" style="background:#FEF3EE;color:#E8530A;">Décharge</span>`);

    const sessionRowsHtml=isOpen?sessions.map(({s,ei:eid,done,kmDone,perf},rowIdx)=>{
      const typeC=typeColor[s.type]||'#888';
      const typeBgC=typeBg[s.type]||'#f5f5f5';
      const lbl=typeLabel[s.type]||s.type;
      const title=s.d?s.d.split('|')[0]:'';
      const detail=s.d&&s.d.includes('|')?s.d.split('|')[1]:null;
      const clickFn=done?`openPerfEditExtraModal(${ws},${eid})`:`openEditExtraModal(${ws},${eid})`;
      const iconContent=done
        ?`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3B6D11" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`
        :`<span style="font-size:9px;font-weight:800;color:${typeC};">${lbl}</span>`;
      const iconBg=done?'#EAF3DE':typeBgC;
      const iconBorder=done?'#3B6D11':typeC;
      const kmShow=done&&kmDone!=null?kmDone:s.km;
      const kmSub=done&&kmDone!=null?`<span style="font-size:9px;font-weight:400;color:#3B6D11aa;"> /&nbsp;${s.km}</span>`:'';
      const canUp=rowIdx>0, canDown=rowIdx<sessions.length-1;
      const durHtml=(()=>{
        if(done){
          const parts=[];
          if(perf.dur) parts.push(`<span style="font-size:10px;font-weight:600;color:#3B6D11;">⏱ ${perf.dur}</span>`);
          if(perf.pace) parts.push(`<span style="font-size:10px;color:#3B6D11;font-weight:600;">🏃 ${perf.pace}/km</span>`);
          return parts.length?`<div style="display:flex;gap:6px;align-items:center;margin-top:2px;">${parts.join('<span style="color:var(--border);"> · </span>')}</div>`:'';
        }
        const dur=calcSessionDuration(s,getBestEfPace(),getMarathonPaceStr());
        return dur?`<span style="font-size:10px;color:var(--muted);font-weight:500;">⏱ ~${dur}</span>`:'';
      })();
      const schedHtml=(()=>{
        if(s.sched_day||s.sched_time){
          const days=['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
          return `<span style="font-size:10px;color:var(--blue);font-weight:600;background:#EEF2FD;padding:1px 6px;border-radius:10px;margin-top:3px;display:inline-block;">${[s.sched_day?days[s.sched_day]:'',s.sched_time||''].filter(Boolean).join(' ')}</span>`;
        }
        // Afficher la date de l'onboarding si disponible
        const dateKey=state[`extra_w${ws}_s${eid}_date`];
        const timeKey=state[`extra_w${ws}_s${eid}_time`];
        if(dateKey){
          try{
            const d=new Date(dateKey+'T00:00:00');
            const jours=['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
            const mois=['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'];
            const label=`${jours[d.getDay()]} ${d.getDate()} ${mois[d.getMonth()]}${timeKey?' · '+timeKey:''}`;
            return `<span style="font-size:10px;color:var(--blue);font-weight:600;background:#EEF2FD;padding:1px 6px;border-radius:10px;margin-top:3px;display:inline-block;">${label}</span>`;
          }catch(e){}
        }
        return '';
      })();
      const sessionExplain=(()=>{
        if(s.type==='tempo'){
          const m=title.match(/(\d+)×(\d+)/);
          return m?`3 km d'échauffement EF → ${m[1]}×${m[2]} min à allure seuil → EF de fin`:"3 km d'échauffement EF → bloc tempo → EF de fin";
        }
        if(s.type==='frac'){
          const m=title.match(/(\d+)×(\d+)/);
          return m?`3 km d'échauffement EF → ${m[1]}×${m[2]} min à haute intensité → EF de fin`:"3 km d'échauffement EF → blocs fractionnés → EF de fin";
        }
        if(s.type==='ef') return 'Allure confort du début à la fin — tu dois pouvoir parler sans effort.';
        if(s.type==='long') return 'Sortie longue à allure confort — construire l\'endurance de fond.';
        if(s.type==='race') return 'Jour de course — exécute ta stratégie d\'allure !';
        return '';
      })();
      return `<div class="plan-session-card" style="${done?'background:linear-gradient(90deg,rgba(59,109,17,0.03),transparent);':''}">
        <div onclick="${clickFn}" style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">
          <div class="plan-session-icon" style="background:${iconBg};border:1.5px solid ${iconBorder}22;">${iconContent}</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
              <span style="font-size:13px;font-weight:600;color:${done?'#3B6D11':'var(--text)'};">${title}</span>
              ${done?`<span style="font-size:10px;color:#3B6D11;font-weight:700;">✓</span>`:''}
            </div>
            ${detail?`<p style="font-size:11px;color:${done?'#5a8f2e':typeC};font-weight:500;margin-top:1px;">${detail}</p>`:''}
            ${durHtml}${schedHtml}
            ${sessionExplain?`<p style="font-size:10px;color:var(--muted);font-style:italic;margin-top:3px;line-height:1.4;">${sessionExplain}</p>`:''}
            <div style="margin-top:2px;">${s.shoe?shoeBadge(s.shoe):''}</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;flex-shrink:0;gap:4px;padding-left:8px;">
          <div style="text-align:right;">
            <span style="font-size:13px;font-weight:700;color:${done?'#3B6D11':'var(--text)'};">${kmShow}</span>
            <span style="font-size:10px;font-weight:500;color:${done?'#3B6D11aa':'var(--muted)'};">${kmSub?kmSub+'&thinsp;km':'&thinsp;km'}</span>
          </div>
          <button onclick="event.stopPropagation();openEditModal(${ws},${eid})" style="font-size:10px;color:var(--blue);background:#EEF2FD;border:none;border-radius:8px;padding:2px 7px;cursor:pointer;font-weight:600;white-space:nowrap;">Détails →</button>
          <div class="plan-session-move">
            <button onclick="event.stopPropagation();moveExtraSession(${ws},${rowIdx},-1)" ${canUp?'':'disabled'}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
            </button>
            <button onclick="event.stopPropagation();moveExtraSession(${ws},${rowIdx},1)" ${canDown?'':'disabled'}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
        </div>
      </div>`;
    }).join(''):'';

    const addRowHtml=isOpen?`<div class="plan-add-row" onclick="openAddModal(${ws})">
      <div class="plan-session-icon" style="background:var(--bg2);border:1.5px dashed var(--border);">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </div>
      <span style="font-size:12px;color:var(--muted);">Ajouter une séance</span>
    </div>`:'';

    const card=document.createElement('div');
    card.className='plan-week-card'+(isCur?' is-current':isPast?' is-past':'')+(isRaceWeekCard?' is-race':'');
    card.innerHTML=`
      ${progressHtml}
      <div class="plan-week-header" onclick="toggleAthleteWeek(${ws})" style="${isRaceWeekCard?'background:linear-gradient(90deg,#FFFBEB,transparent);':''}">
        <div class="plan-week-num" style="background:${isRaceWeekCard?'#D97706':numBg};color:${isRaceWeekCard?'#fff':numColor};">S${ws}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
            <span style="font-size:12px;color:var(--muted);">${weekDateLabel||'Semaine '+ws}</span>
            ${badges.join('')}
          </div>
        </div>
        <div style="display:flex;align-items:center;flex-shrink:0;width:75px;">
          <div style="width:52px;text-align:right;">${statusHtml}</div>
          <div style="width:23px;display:flex;justify-content:flex-end;">${chevron}</div>
        </div>
      </div>
      ${sessionRowsHtml}${addRowHtml}`;
    // Séparateur de mois (inséré avant la carte si changement de mois)
    if(weekMonthIdx>=0&&weekMonthIdx!==currentRenderMonth){
      currentRenderMonth=weekMonthIdx;
      const sepEl=document.createElement('div');
      sepEl.style.cssText='display:flex;align-items:center;gap:8px;padding:10px 2px 4px;';
      sepEl.innerHTML=`<span style="font-size:11px;font-weight:700;color:var(--orange);text-transform:uppercase;letter-spacing:0.08em;">${weekMonthName}</span><div style="flex:1;height:1px;background:var(--border);"></div>`;
      el.appendChild(sepEl);
    }
    el.appendChild(card);
  });

  // Carte Jour J (si une séance de course est trouvée dans le plan)
  if(raceSessionData){
    try{
      const rd=raceSessionData.sched_date?new Date(raceSessionData.sched_date+'T00:00:00'):null;
      const courseName=(raceSessionData.d?raceSessionData.d.split('|')[0]:'Course').replace('🏆 ','');
      const distKm=raceSessionData.km||'';
      const joursL=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
      const moisL=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
      const dateStr=rd?`${joursL[rd.getDay()]} ${rd.getDate()} ${moisL[rd.getMonth()]} ${rd.getFullYear()}`:'';
      const jourJEl=document.createElement('div');
      jourJEl.style.cssText='margin:8px 0 4px;border:2px solid #D97706;border-radius:var(--radius);background:linear-gradient(135deg,#FFFBEB,#FEF3C7);overflow:hidden;';
      jourJEl.innerHTML=`
        <div style="padding:14px 16px;display:flex;align-items:center;gap:14px;">
          <div style="font-size:36px;line-height:1;">🏆</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:11px;font-weight:700;color:#D97706;text-transform:uppercase;letter-spacing:0.08em;">Jour J</div>
            <div style="font-size:16px;font-weight:800;color:#92400E;margin-top:2px;">${courseName}</div>
            ${dateStr?`<div style="font-size:12px;color:#B45309;font-weight:600;margin-top:3px;">${dateStr}</div>`:''}
          </div>
          ${distKm?`<div style="background:#D97706;color:#fff;border-radius:12px;padding:8px 14px;text-align:center;flex-shrink:0;"><div style="font-size:22px;font-weight:900;line-height:1;">${distKm}</div><div style="font-size:10px;font-weight:600;opacity:0.9;">km</div></div>`:''}
        </div>
        <div style="height:3px;background:linear-gradient(90deg,#FCD34D,#D97706,#92400E);"></div>`;
      el.appendChild(jourJEl);
    }catch(e){}
  }

  // Bouton ajouter une semaine
  const nextWs=(weekNums.size>0?Math.max(...weekNums):CW)+1;
  const addEl=document.createElement('div');
  addEl.innerHTML=`<div class="plan-add-row" onclick="openAddModal(${nextWs})" style="border:1.5px dashed var(--border);border-radius:var(--radius);background:var(--bg);">
    <div class="plan-session-icon" style="background:var(--bg2);border:1.5px dashed var(--border);">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </div>
    <span style="font-size:12px;color:var(--muted);">Nouvelle semaine S${nextWs}</span>
  </div>`;
  el.appendChild(addEl);
}

function toggleAthleteWeek(ws){
  if(openWeeks.has(ws))openWeeks.delete(ws);else openWeeks.add(ws);
  if(_adminPreviewUid) _refreshAthleteCoachView(); else renderPlan();
}

function moveExtraSession(ws,rowIdx,dir){
  // Collecter les indices existants
  const keys=[];
  let ei=0;
  while(state[`extra_w${ws}_s${ei}`]){keys.push(ei);ei++;}
  const target=rowIdx+dir;
  if(target<0||target>=keys.length) return;
  // Échanger les deux séances (toutes leurs clés associées)
  const suffixes=['','_done','_km','_perf'];
  suffixes.forEach(suf=>{
    const a=state[`extra_w${ws}_s${rowIdx}${suf}`];
    const b=state[`extra_w${ws}_s${target}${suf}`];
    if(b!=null) state[`extra_w${ws}_s${rowIdx}${suf}`]=b; else delete state[`extra_w${ws}_s${rowIdx}${suf}`];
    if(a!=null) state[`extra_w${ws}_s${target}${suf}`]=a; else delete state[`extra_w${ws}_s${target}${suf}`];
  });
  save();
  rendered.plan=false;
  if(_adminPreviewUid) _refreshAthleteCoachView(); else renderPlan();
}

function renderPlan(){
  const ptEl=document.getElementById('plan-total-km');
  const el=document.getElementById('plan-list'); el.innerHTML='';

  // Plan vide pour les athlètes — seulement les séances qu'ils ajoutent eux-mêmes
  if(!isAdmin()){
    if(ptEl) ptEl.textContent='Ton plan personnalisé';
    openWeeks.add(getAthleteCW());
    renderAthletePlan(el);
    return;
  }
  // Garantir que le rôle admin est bien enregistré si l'email correspond
  if(currentUserRole!=='admin'){
    currentUserRole='admin';
    firebase.database().ref('users/'+firebase.auth().currentUser.uid+'/role').set('admin').catch(()=>{});
  }

  if(ptEl) ptEl.textContent='32 semaines · '+getGrandTotal()+' km';

  // Auto-ouvrir la semaine courante
  openWeeks.add(CW);

  let currentMonth='';
  weeks.forEach(w=>{
    try {
    const isCur=w.s===CW, isPast=w.s<CW, isOpen=openWeeks.has(w.s);
    const isDecharge=[8,12,16,20,26,30].includes(w.s);
    const isSemi=w.s===27, isMarathon=w.s===32;

    // Calcul avancement semaine courante
    const weekDone=(()=>{
      if(!isCur) return 0;
      const total=weeks[w.s-1].sessions.length;
      if(total===0) return 0;
      const done=weeks[w.s-1].sessions.filter((_,si)=>state[gk(w.s,si)+'done']||state[gk(w.s,si)+'km']!=null).length;
      return total>0?Math.round(done/total*100):0;
    })();
    const isCurrentAllDone=(()=>{
      if(!isCur) return false;
      const base=weeks[w.s-1].sessions.filter((_,si)=>!state[`del_w${w.s}_s${si}`]);
      if(base.length===0) return false;
      return weeks[w.s-1].sessions.every((_,si)=>state[`del_w${w.s}_s${si}`]||!!state[gk(w.s,si)+'done']);
    })();

    // Séparateur de mois
    if(w.month!==currentMonth){
      currentMonth=w.month;
      const sep=document.createElement('div');
      sep.className='plan-month-sep';
      sep.innerHTML=`<span style="font-size:11px;font-weight:700;color:var(--orange);text-transform:uppercase;letter-spacing:0.1em;">${w.month}</span><div style="flex:1;height:1px;background:var(--border);"></div>`;
      el.appendChild(sep);
    }

    // Card
    const card=document.createElement('div');
    card.className='plan-week-card'+(isCur?' is-current':isPast?' is-past':'');

    // ── Header ──
    // Couleur du numéro de semaine
    const numBg = isCur ? 'var(--blue)' : isPast ? 'var(--bg2)' : 'var(--bg2)';
    const numColor = isCur ? '#fff' : isPast ? 'var(--muted)' : 'var(--text)';

    // Badges
    const badges = [];
    if(isCur) badges.push(`<span class="plan-badge" style="background:#EEF2FD;color:#1438A8;">En cours</span>`);
    if(isDecharge) badges.push(`<span class="plan-badge" style="background:#FEF3EE;color:#E8530A;">Décharge</span>`);
    if(isSemi) badges.push(`<span class="plan-badge" style="background:#E1F5EE;color:#085041;">Semi</span>`);
    if(isMarathon) badges.push(`<span class="plan-badge" style="background:#EEEDFE;color:#3C3489;">🏆 Marathon</span>`);

    // Statut km
    const kmTotal = getWeekTotalKm(w.s);
    // Calculer les km réels pour les semaines passées
    const realWeekKm = (isPast || (isCur && isCurrentAllDone)) ? (()=>{
      let total = 0;
      weeks[w.s-1].sessions.forEach((_,si)=>{
        if(state[`del_w${w.s}_s${si}`]) return;
        const rv = state[gk(w.s,si)+'km'];
        total += rv!=null ? parseFloat(rv) : getSession(w.s,si).km;
      });
      // Ajouter les séances extra validées
      let ei=0;
      while(state[`extra_w${w.s}_s${ei}`]){
        if(state[`extra_w${w.s}_s${ei}_done`]){
          const rv=state[`extra_w${w.s}_s${ei}_km`];
          const es=JSON.parse(state[`extra_w${w.s}_s${ei}`]);
          total += rv!=null ? parseFloat(rv) : es.km;
        }
        ei++;
      }
      return Math.round(total*10)/10;
    })() : null;

    const statusHtml = isPast||(isCur&&isCurrentAllDone)
      ? `<span style="font-size:13px;font-weight:700;color:#3B6D11;">${realWeekKm}<span style="font-size:10px;font-weight:500;color:#3B6D11aa;"> km</span> <span style="font-size:11px;">✓</span></span>`
      : `<span style="font-size:13px;font-weight:700;color:${isCur?'var(--blue)':'var(--text)'};">${kmTotal}<span style="font-size:10px;font-weight:500;color:var(--muted);"> km</span></span>`;

    // Barre de progression (semaine en cours uniquement)
    const progressHtml = isCur
      ? `<div class="plan-progress-bar"><div class="plan-progress-fill" style="width:${weekDone}%;background:var(--blue);"></div></div>`
      : isPast
      ? `<div class="plan-progress-bar"><div class="plan-progress-fill" style="width:100%;background:#3B6D11;opacity:0.35;"></div></div>`
      : '';

    // Séances
    const allSessions=[];
    const baseOrder=weeks[w.s-1].sessions.map((_,si)=>({si,extra:false})).filter(({si})=>!state[`del_w${w.s}_s${si}`]);
    let ei=0;
    while(state[`extra_w${w.s}_s${ei}`]){baseOrder.push({si:'x'+ei,extra:true,ei});ei++;}

    // Comparaison stable — ne pas utiliser JSON.stringify (sensible à l'ordre des clés)
    // sessionMatch tolère les anciens formats (sans champ extra:false explicite)
    const sessionMatch = (a, b) => !!a.extra === !!b.extra && (a.extra ? a.ei === b.ei : a.si === b.si);

    const savedOrder = state[`order_w${w.s}`]
      ? JSON.parse(state[`order_w${w.s}`]).filter(Boolean)  // filter nulls
      : null;
    const orderedSessions = savedOrder
      ? savedOrder.map(o => baseOrder.find(b => sessionMatch(b, o))).filter(Boolean)
      : [...baseOrder];
    // Ajouter les séances manquantes (ex: extra ajoutée après enregistrement de l'ordre)
    baseOrder.forEach(b=>{if(!orderedSessions.find(o=>sessionMatch(o,b)))orderedSessions.push(b);});
    orderedSessions.forEach(({si,extra,ei:eid})=>{
      const s=extra?JSON.parse(state[`extra_w${w.s}_s${eid}`]):getSession(w.s,si);
      allSessions.push({s,si,extra,ei:eid});
    });
    const totalRows=allSessions.length;

    const sessionRowsHtml = isOpen ? allSessions.map(({s:s2,si,extra,ei:eid},rowIdx)=>{
      const typeC=typeColor[s2.type]||'#888';
      const typeBgC=typeBg[s2.type]||'#f5f5f5';
      const lbl=typeLabel[s2.type]||'EF';
      const parts=s2.d.split('|');
      const title=parts[0];
      const detail=filterDetailDisplay(title, parts[1]||null);
      const edited=!extra&&state[`edit_w${w.s}_s${si}`];
      const isDone=extra ? !!state[`extra_w${w.s}_s${eid}_done`] : !!state[gk(w.s,si)+'done'];
      const clickFn=extra
        ? (isDone ? `openPerfEditExtraModal(${w.s},${eid})` : `openEditExtraModal(${w.s},${eid})`)
        : (isDone ? `openPerfEditModal(${w.s},${si})` : `openEditModal(${w.s},${si})`);

      // Horaire planifié
      let schedHtml='';
      if(!extra){
        const edRaw=state[`edit_w${w.s}_s${si}`];
        if(edRaw){
          const ed=JSON.parse(edRaw);
          if(ed.sched_day||ed.sched_time){
            const days=['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
            const dayStr=ed.sched_day?days[ed.sched_day]:'';
            const timeStr=ed.sched_time||'';
            schedHtml=`<span style="font-size:10px;color:var(--blue);font-weight:600;background:#EEF2FD;padding:1px 6px;border-radius:10px;margin-top:3px;display:inline-block;">${[dayStr,timeStr].filter(Boolean).join(' ')}</span>`;
          }
        }
      } else {
        // Séance extra : lire sched_day/sched_time depuis l'objet extra lui-même
        if(s2.sched_day||s2.sched_time){
          const days=['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
          const dayStr=s2.sched_day?days[s2.sched_day]:'';
          const timeStr=s2.sched_time||'';
          schedHtml=`<span style="font-size:10px;color:var(--blue);font-weight:600;background:#EEF2FD;padding:1px 6px;border-radius:10px;margin-top:3px;display:inline-block;">${[dayStr,timeStr].filter(Boolean).join(' ')}</span>`;
        }
      }

      const iconContent = isDone
        ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3B6D11" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`
        : `<span style="font-size:9px;font-weight:800;color:${typeC};">${lbl}</span>`;
      const iconBg = isDone ? '#EAF3DE' : typeBgC;
      const iconBorder = isDone ? '#3B6D11' : typeC;

      const canUp=rowIdx>0, canDown=rowIdx<totalRows-1;

      return `<div class="plan-session-card" style="${isDone?'background:linear-gradient(90deg,rgba(59,109,17,0.03),transparent);':''}">
        <div onclick="${clickFn}" style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">
          <div class="plan-session-icon" style="background:${iconBg};border:1.5px solid ${iconBorder}22;">
            ${iconContent}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
              <span style="font-size:13px;font-weight:600;color:${isDone?'#3B6D11':'var(--text)'};">${title}</span>
              ${edited?`<span style="font-size:10px;color:var(--blue);">✎</span>`:''}
              ${isDone?`<span style="font-size:10px;color:#3B6D11;font-weight:700;">✓</span>`:''}
            </div>
            ${detail?`<p style="font-size:11px;color:${isDone?'#5a8f2e':typeC};font-weight:500;margin-top:1px;">${detail}</p>`:''}
            ${(()=>{
              if(isDone){
                const perfRaw = extra ? state[`extra_w${w.s}_s${eid}_perf`] : state[gk(w.s,si)+'perf'];
                const perf2 = perfRaw ? JSON.parse(perfRaw) : {};
                const rp = perf2.pace || null;
                const rd = perf2.dur || null;
                const parts=[];
                if(rd) parts.push(`<span style="font-size:10px;font-weight:600;color:#3B6D11;">⏱ ${rd}</span>`);
                if(rp) parts.push(`<span style="font-size:10px;color:#3B6D11;font-weight:600;">🏃 ${rp}/km</span>`);
                return parts.length?`<div style="display:flex;gap:6px;align-items:center;margin-top:2px;">${parts.join('<span style="color:var(--border);"> · </span>')}</div>`:'';
              }
              const dur=calcSessionDuration(s2,getBestEfPace(),getMarathonPaceStr());
              return dur?`<span style="font-size:10px;color:var(--muted);font-weight:500;">⏱ ~${dur}</span>`:'';
            })()}
            ${schedHtml}
            <div style="margin-top:2px;">${s2.shoe?shoeBadge(s2.shoe):''}</div>
          </div>
        </div>
        <!-- Colonne droite fixe 75px : km (52px) + flèches (23px) — identique au header -->
        <div style="display:flex;align-items:center;flex-shrink:0;width:75px;">
          ${(()=>{
            const rvPlan = extra ? state[`extra_w${w.s}_s${eid}_km`] : state[gk(w.s,si)+'km'];
            const kmShow = isDone && rvPlan!=null ? rvPlan : s2.km;
            const sub = isDone && rvPlan!=null
              ? `<span style="font-size:9px;font-weight:400;color:#3B6D11aa;"> /&nbsp;${s2.km}</span>`
              : '';
            return `<div style="width:52px;text-align:right;flex-shrink:0;">`
              +`<span style="font-size:13px;font-weight:700;color:${isDone?'#3B6D11':'var(--text)'}">${kmShow}</span>`
              +`<span style="font-size:10px;font-weight:500;color:${isDone?'#3B6D11aa':'var(--muted)'};">${sub ? sub+'&thinsp;km' : '&thinsp;km'}</span>`
              +'</div>';
          })()}
          <div class="plan-session-move">
            <button onclick="moveSession(${w.s},${rowIdx},-1)" ${canUp?'':'disabled'} title="Monter">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
            </button>
            <button onclick="moveSession(${w.s},${rowIdx},1)" ${canDown?'':'disabled'} title="Descendre">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
        </div>
      </div>`;
    }).join('') : '';

    const addRowHtml = isOpen ? `<div class="plan-add-row" onclick="openAddModal(${w.s})">
      <div class="plan-session-icon" style="background:var(--bg2);border:1.5px dashed var(--border);">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </div>
      <span style="font-size:12px;color:var(--muted);">Ajouter une séance</span>
    </div>` : '';

    // Chevron
    const chevron = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2.5" style="transform:${isOpen?'rotate(180deg)':'rotate(0)'};transition:transform 0.25s;flex-shrink:0;"><polyline points="6 9 12 15 18 9"/></svg>`;

    card.innerHTML = `
      ${progressHtml}
      <div class="plan-week-header" onclick="toggleWeek(${w.s})">
        <div class="plan-week-num" style="background:${numBg};color:${numColor};">S${w.s}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
            <span style="font-size:12px;color:var(--muted);">lun. ${w.date}</span>
            ${badges.join('')}
          </div>
        </div>
        <div style="display:flex;align-items:center;flex-shrink:0;width:75px;">
          <div style="width:52px;text-align:right;">
            ${statusHtml}
          </div>
          <div style="width:23px;display:flex;justify-content:center;">
            ${chevron}
          </div>
        </div>
      </div>
      ${sessionRowsHtml}
      ${addRowHtml}
    `;
    el.appendChild(card);
    } catch(e) { console.error('renderPlan error S'+w.s+':', e); }
  });
}

function getWeekTotalKm(ws){
  if(!isAdmin()){
    // Pour les athlètes : seulement leurs séances extra
    let total=0;
    let ei=0;
    while(state[`extra_w${ws}_s${ei}`]){try{total+=parseFloat(JSON.parse(state[`extra_w${ws}_s${ei}`]).km)||0;}catch(e){}ei++;}
    return Math.round(total*10)/10;
  }
  const w=weeks[ws-1];
  let total=0;
  w.sessions.forEach((_,si)=>{
    if(!state[`del_w${ws}_s${si}`]){
      const s=getSession(ws,si);
      total+=s.km;
    }
  });
  let ei=0;
  while(state[`extra_w${ws}_s${ei}`]){
    total+=JSON.parse(state[`extra_w${ws}_s${ei}`]).km||0;
    ei++;
  }
  return Math.round(total*10)/10;
}

function getOrderedWeekSessions(ws){
  // Athlètes : seulement leurs séances extra, pas le plan hardcodé de Guillaume
  if(!isAdmin()){
    const res=[];
    let ei=0;
    while(state[`extra_w${ws}_s${ei}`]){
      try{res.push({s:JSON.parse(state[`extra_w${ws}_s${ei}`]),si:'x'+ei,extra:true,ei});}catch(e){}
      ei++;
    }
    return res;
  }
  const baseOrder=weeks[ws-1].sessions.map((_,si)=>({si,extra:false})).filter(({si})=>!state[`del_w${ws}_s${si}`]);
  let ei=0;
  while(state[`extra_w${ws}_s${ei}`]){baseOrder.push({si:'x'+ei,extra:true,ei});ei++;}
  const savedOrder=state[`order_w${ws}`]?JSON.parse(state[`order_w${ws}`]):null;
  const ordered=savedOrder?savedOrder.map(o=>baseOrder.find(b=>JSON.stringify(b)===JSON.stringify(o))).filter(Boolean):baseOrder;
  // Add any new sessions not in saved order
  baseOrder.forEach(b=>{
    if(!ordered.find(o=>JSON.stringify(o)===JSON.stringify(b))) ordered.push(b);
  });
  return ordered.map(({si,extra,ei})=>{
    let s=extra?JSON.parse(state[`extra_w${ws}_s${ei}`]):getSession(ws,si);
    // Frac extra sauvées avec mauvais titre : correction à la volée
    if(s && s.type==='frac' && s.d && !s.d.startsWith('Fractionné')){
      const parts=s.d.split('|');
      const m=parts[0].match(/(\d+)[×x](\d+)/);
      const ft=m?`Fractionné ${m[1]}×${m[2]} min`:'Fractionné 6×2 min';
      s=Object.assign({},s,{d:parts.length>1?`${ft}|${parts[1]}`:ft});
    }
    return {s,si,extra,ei};
  });
}

function moveSession(ws, rowIdx, dir){
  const orderKey=`order_w${ws}`;
  const baseOrder=weeks[ws-1].sessions.map((_,si)=>({si,extra:false})).filter(({si})=>!state[`del_w${ws}_s${si}`]);
  let ei=0;
  while(state[`extra_w${ws}_s${ei}`]){baseOrder.push({si:'x'+ei,extra:true,ei});ei++;}

  // Utiliser baseOrder comme source de vérité pour les objets (structure normalisée)
  // sessionMatch tolère les anciens formats (sans champ extra:false explicite)
  const sessionMatch = (a, b) => !!a.extra === !!b.extra && (a.extra ? a.ei === b.ei : a.si === b.si);
  const savedRaw = state[orderKey] ? JSON.parse(state[orderKey]).filter(Boolean) : null;
  // Re-mapper sur baseOrder pour garantir la structure normalisée
  const current = savedRaw
    ? savedRaw.map(o => baseOrder.find(b => sessionMatch(b, o))).filter(Boolean)
    : [...baseOrder];
  // Ajouter les séances manquantes
  baseOrder.forEach(b => { if(!current.find(o => sessionMatch(o, b))) current.push(b); });

  const newOrder=[...current];
  const swapIdx=rowIdx+dir;
  if(swapIdx<0||swapIdx>=newOrder.length) return;
  [newOrder[rowIdx],newOrder[swapIdx]]=[newOrder[swapIdx],newOrder[rowIdx]];
  state[orderKey]=JSON.stringify(newOrder);
  save();
  rendered.plan=false;
  rendered.stats=false;
  renderPlan();
  renderHome();
}

function toggleWeek(s){if(openWeeks.has(s))openWeeks.delete(s);else openWeeks.add(s);renderPlan();}

function scrollToCurrentWeek(){
  const currentCard = document.querySelector('.plan-week-card.is-current');
  if(!currentCard) return;
  // getBoundingClientRect donne la position relative au viewport
  const rect = currentCard.getBoundingClientRect();
  const margin = 12;
  // Scroller la window (c'est elle qui scrolle, pas sc-plan)
  window.scrollBy({ top: rect.top - margin, behavior: 'smooth' });
}

function getSession(ws, si){
  const key = `edit_w${ws}_s${si}`;
  const sess = state[key] ? JSON.parse(state[key]) : weeks[ws-1].sessions[si];
  // Pour les séances Long : remplacer l'allure AM du detail par getAmTrainingPace()
  if(sess && sess.type === 'long' && sess.d && sess.d.includes('AM @')) {
    const amPace = getAmTrainingPace();
    const updated = Object.assign({}, sess, {
      d: sess.d.replace(/AM @ [\d'':]+\/km/g, `AM @ ${amPace}/km`)
    });
    return updated;
  }
  // Pour les séances Frac sauvées avec un mauvais titre : corriger à la volée
  if(sess && sess.type === 'frac' && sess.d && !sess.d.startsWith('Fractionné')) {
    const parts = sess.d.split('|');
    const repMatch = parts[0].match(/(\d+)[×x](\d+)/);
    const fixedTitle = repMatch ? `Fractionné ${repMatch[1]}×${repMatch[2]} min` : 'Fractionné 6×2 min';
    return Object.assign({}, sess, { d: parts.length > 1 ? `${fixedTitle}|${parts[1]}` : fixedTitle });
  }
  return sess;
}

function selectLongEfPace(pace){
  const inp=document.getElementById('long-ef-pace');
  if(inp){inp.value=pace;updateLongDuration();}
  highlightLongEfChip(pace);
}
function highlightLongEfChip(pace){
  document.querySelectorAll('[id^="long-ef-chip-"]').forEach(btn=>{
    const sel=btn.id==='long-ef-chip-'+pace.replace(':','-');
    btn.style.background=sel?'#3B6D11':'var(--bg2)';
    btn.style.color=sel?'#fff':'var(--muted)';
    btn.style.borderColor=sel?'#3B6D11':'var(--border)';
  });
}
function updateLongDuration(){
  const durEl=document.getElementById('long-duration-val');
  if(!durEl) return;
  const blocks=getLongBlocksData();
  if(!blocks||blocks.length===0){durEl.textContent='—';return;}
  const efField=document.getElementById('long-ef-pace');
  const efPaceRaw=(efField&&efField.value.trim())||getBestEfPace()||"6'40";
  const parsePaceStr=p=>{const m=(p||'').replace("'",'!').replace(':','!').match(/(\d+)!(\d+)/);return m?parseInt(m[1])+parseInt(m[2])/60:null;};
  const efPace=parsePaceStr(efPaceRaw);
  const amPace=parsePaceStr(getAmTrainingPace());
  if(!efPace||!amPace){durEl.textContent='—';return;}
  let totalMin=0;
  blocks.forEach(b=>totalMin+=(b.type==='AM'?amPace:efPace)*b.km);
  const tsL=Math.round(totalMin*60),h=Math.floor(tsL/3600),m=Math.floor((tsL%3600)/60),sL=tsL%60;
  const baseL=h>0?h+'h'+String(m).padStart(2,'0')+"'":m+"'";
  durEl.textContent=baseL+(sL>0?String(sL).padStart(2,'0')+'"':'');
  // Synchroniser le header modal
  const hdrEl=document.querySelector('.modal-box p[style*="color:var(--blue)"][style*="font-weight:600"]');
  if(hdrEl&&hdrEl.textContent.includes('estimées')){
    hdrEl.textContent='⏱ ~'+(baseL+(sL>0?String(sL).padStart(2,'0')+'"':''))+' estimées';
  }
}

function renderLongBlocks(){
  const container=document.getElementById('long-blocks');
  const dataEl=document.getElementById('long-blocks-data');
  if(!container||!dataEl) return;
  let blocks=[];
  try{blocks=JSON.parse(dataEl.value.replace(/&quot;/g,'"'));}catch(e){return;}
  container.innerHTML=blocks.map((b,i)=>`
    <div style="display:flex;align-items:center;gap:6px;">
      <div style="flex:1;display:flex;align-items:center;gap:8px;background:var(--bg);border-radius:12px;padding:10px 12px;border:2px solid ${b.type==='EF'?'#3B6D1130':'#534AB730'};">
        <button onclick="toggleLongBlockType(${i})" style="padding:5px 12px;border-radius:20px;border:none;cursor:pointer;font-size:11px;font-weight:800;background:${b.type==='EF'?'#EAF3DE':'#EEEDFE'};color:${b.type==='EF'?'#3B6D11':'#1B4FD8'};flex-shrink:0;">${b.type}</button>
        <div style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;">
          <button onclick="stepLongBlockKm(${i},-1)" style="width:28px;height:28px;border-radius:50%;border:1.5px solid var(--border);background:var(--bg);cursor:pointer;font-size:16px;color:var(--text);display:flex;align-items:center;justify-content:center;flex-shrink:0;">−</button>
          <span id="lb-km-${i}" style="font-size:20px;font-weight:700;color:var(--text);min-width:32px;text-align:center;">${b.km}</span>
          <button onclick="stepLongBlockKm(${i},1)" style="width:28px;height:28px;border-radius:50%;border:1.5px solid var(--border);background:var(--bg);cursor:pointer;font-size:16px;color:var(--text);display:flex;align-items:center;justify-content:center;flex-shrink:0;">+</button>
        </div>
        <span style="font-size:10px;color:var(--muted);flex-shrink:0;">${b.type==='AM'?getAmTrainingPace()+'/km':'EF'}</span>
      </div>
      <button onclick="removeLongBlock(${i})" style="background:none;border:none;cursor:pointer;color:#E24B4A;font-size:20px;padding:0 4px;flex-shrink:0;">×</button>
    </div>`).join('');
  updateLongBlocksTotal(blocks);
}

function updateLongBlocksTotal(blocks){
  const totalEl=document.getElementById('long-blocks-total');
  if(!totalEl) return;
  const total=Math.round(blocks.reduce((a,b)=>a+b.km,0)*10)/10;
  const kmEl=document.getElementById('edit-km')||document.getElementById('hm-km')||document.getElementById('add-km')||document.getElementById('exedit-km');
  const planned=parseFloat(kmEl?kmEl.value:0)||0;
  const diff=Math.round((total-planned)*10)/10;
  const ok=Math.abs(diff)<0.1;
  const color=ok?'#3B6D11':diff>0?'#E8530A':'#E24B4A';
  totalEl.style.color=color;
  totalEl.style.background=ok?'#EAF3DE':'#FDF0EB';
  totalEl.style.borderColor=color+'30';
  totalEl.textContent=ok?`✓ ${total} km — correspond à la distance planifiée`
    :diff>0?`⚠ ${total} km — ${diff} km de trop (prévu : ${planned} km)`
    :`⚠ ${total} km — il manque ${Math.abs(diff)} km (prévu : ${planned} km)`;
}

function getLongBlocksData(){
  const dataEl=document.getElementById('long-blocks-data');
  if(!dataEl) return [];
  try{return JSON.parse(dataEl.value.replace(/&quot;/g,'"'));}catch(e){return [];}
}
function setLongBlocksData(blocks){
  const dataEl=document.getElementById('long-blocks-data');
  if(dataEl) dataEl.value=JSON.stringify(blocks);
  renderLongBlocks();
}
function stepLongBlockKm(i, delta){
  const blocks=getLongBlocksData();
  blocks[i].km=Math.max(1, (blocks[i].km||1)+delta);
  // Mettre à jour juste l'affichage du km sans re-render complet
  const dataEl=document.getElementById('long-blocks-data');
  if(dataEl) dataEl.value=JSON.stringify(blocks);
  const kmEl=document.getElementById('lb-km-'+i);
  if(kmEl) kmEl.textContent=blocks[i].km;
  updateLongBlocksTotal(blocks);
}
function toggleLongBlockType(i){
  const blocks=getLongBlocksData();
  blocks[i].type=blocks[i].type==='EF'?'AM':'EF';
  setLongBlocksData(blocks);
}
function updateLongBlockKm(i,val){
  const blocks=getLongBlocksData();
  blocks[i].km=parseFloat(val)||1;
  const dataEl=document.getElementById('long-blocks-data');
  if(dataEl) dataEl.value=JSON.stringify(blocks);
  updateLongBlocksTotal(blocks);
}
function addLongBlock(){
  const blocks=getLongBlocksData();
  blocks.push({km:2,type:'EF'});
  setLongBlocksData(blocks);
}
function removeLongBlock(i){
  const blocks=getLongBlocksData();
  blocks.splice(i,1);
  setLongBlocksData(blocks);
}
function buildLongDetail(blocks){
  const am=getMarathonPaceStr();
  const efField=document.getElementById('long-ef-pace');
  const efPace=efField&&efField.value.trim()?efField.value.trim():null;
  const efDefault=(getBestEfPace()||'6:40').replace("'",'::').split('::')[0];
  const detail=blocks.map(b=>`${b.km} ${b.type}${b.type==='AM'?' @ '+am+'/km':''}`).join(' · ');
  // Sauvegarder l'allure EF si différente de la valeur par défaut
  if(efPace && efPace !== (getBestEfPace()||'6:40')) return detail+' · EF @ '+efPace+'/km';
  return detail;
}


function buildSchedFieldsHtml(day, time){
  const days=['','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  const dayEmojis=['','😴','💪','🔥','💪','🏃','🏔','😴'];
  const opts=days.map((d,i)=>i===0
    ?`<option value="">Choisir...</option>`
    :`<option value="${i}" ${day==i?'selected':''}>${dayEmojis[i]} ${d}</option>`
  ).join('');
  const timeParts=(time||'08:00').split(':');
  const selH=parseInt(timeParts[0])||8;
  const selM=parseInt(timeParts[1])||0;
  const hourOpts=Array.from({length:24},(_,i)=>`<option value="${i}" ${selH===i?'selected':''}>${String(i).padStart(2,'0')}h</option>`).join('');
  const minOpts=['00','15','30','45'].map(m=>`<option value="${m}" ${String(selM).padStart(2,'0')===m?'selected':''}>${m}</option>`).join('');
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <div>
        <p style="font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:7px;">📆 Jour</p>
        <select id="sched-day" style="background:var(--bg);border:2px solid var(--border);border-radius:12px;padding:11px 12px;font-size:14px;font-weight:700;color:var(--text);width:100%;outline:none;cursor:pointer;">${opts}</select>
      </div>
      <div>
        <p style="font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:7px;">⏰ Heure</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <select id="sched-hour" style="background:var(--bg);border:2px solid var(--border);border-radius:12px;padding:11px 8px;font-size:14px;font-weight:700;color:var(--text);width:100%;outline:none;text-align:center;cursor:pointer;">${hourOpts}</select>
          <select id="sched-min" style="background:var(--bg);border:2px solid var(--border);border-radius:12px;padding:11px 8px;font-size:14px;font-weight:700;color:var(--text);width:100%;outline:none;text-align:center;cursor:pointer;">${minOpts}</select>
        </div>
      </div>
    </div>`;
}
function openPerfEditModal(ws, si){
  const s = getSession(ws, si);
  const k = gk(ws, si);
  let prev = state[k+'perf'] ? JSON.parse(state[k+'perf']) : {};
  // Injecter la météo à la volée si absente pour s11i2 (23/05 Villiers-Saint-Georges)
  if(ws===11 && si===2 && !prev.meteo){
    prev.meteo = {
      date:"2026-05-23",heure_cible:"11h00",ville:"Villiers-Saint-Georges",
      temperature:29.8,ressenti:32.1,humidite:58,vent_kmh:8.2,
      conditions:"Ciel dégagé ☀️",
      impact_performance:{
        niveau:"ELEVE",ralentissement:"20-40 sec/km",
        conseil:"Forte chaleur — allures ralenties normales.",
        elevation_fc_bpm:23,zone_ef_ajustee:"163-171 bpm",perte_perf_pct:14,ralent_sec_km:50,
        note_fc:"FC effective = FC mesurée − 23 bpm (Mora-Rodriguez). Zone EF chaleur : 163-171 bpm."
      }
    };
  }
  const kmVal = state[k+'km'] != null ? state[k+'km'] : s.km;
  const c = typeColor[s.type]||'#888';
  const bg = typeBg[s.type]||'#f5f5f5';
  const lbl = typeLabel[s.type]||'EF';
  const title = s.d.split('|')[0];
  const detail = s.d.split('|')[1]||'';
  const mc = document.getElementById('modal-container');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  // Champs blocs pour Tempo
  const titleMatch = title.match(/(\d+)[x\u00d7]/i);
  const nbBlocs = (s.type==='tempo'||s.type==='frac') ? (titleMatch?parseInt(titleMatch[1]):(s.type==='frac'?6:2)) : 0;
  const prevBlocs = prev.blocsAllure||[];
  let blocsHtml = '';
  if((s.type==='tempo'||s.type==='frac') && nbBlocs>0){
    const nbRows = Math.ceil(nbBlocs/3);
    blocsHtml = '<div style="margin-top:4px;"><p style="font-size:12px;font-weight:600;color:#1B4FD8;margin-bottom:8px;">\u26a1 Allure par bloc tempo</p>';
    for(let row=0;row<nbRows;row++){
      const start=row*3; const end=Math.min(start+3,nbBlocs); const count=end-start;
      blocsHtml += '<div style="display:grid;grid-template-columns:repeat('+count+',1fr);gap:8px;'+(row>0?'margin-top:8px;':'')+'">';
      for(let i=start;i<end;i++){
        blocsHtml += '<div><p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Bloc '+(i+1)+'</p>';
        blocsHtml += '<input type="text" id="pedit-bloc-'+i+'" value="'+(prevBlocs[i]||'')+'" placeholder="4:50" maxlength="5" style="background:var(--bg2);border:1.5px solid #1B4FD830;border-radius:var(--radius-sm);padding:10px;font-size:18px;font-weight:700;color:#1B4FD8;width:100%;outline:none;text-align:center;">';
        blocsHtml += '<p style="font-size:10px;color:var(--muted);margin-top:3px;text-align:center;">/km</p></div>';
      }
      blocsHtml += '</div>';
    }
    blocsHtml += '</div>';
  }

  overlay.innerHTML = `<div class="modal-box" style="max-height:90vh;overflow-y:auto;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:36px;height:36px;border-radius:9px;background:${bg};border:1.5px solid ${c}30;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span style="font-size:10px;font-weight:700;color:${c};">${lbl}</span>
        </div>
        <div>
          <p style="font-size:15px;font-weight:600;color:var(--text);">S${ws} · ${title}</p>
          <p style="font-size:11px;color:#3B6D11;font-weight:600;">✓ Séance validée — modifier les données</p>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <button id="garmin-pedit-btn" onclick="importFromStravaForPerfEdit(${ws},${si})" style="display:flex;align-items:center;gap:5px;padding:7px 11px;background:${prev.strava?'#3B6D11':'#FC4C02'};border:none;border-radius:20px;color:#fff;font-size:11px;font-weight:700;cursor:pointer;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          ${prev.strava ? '✅ Strava' : '🟠 Strava'}
        </button>
        <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:24px;line-height:1;">×</button>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px;">
      <div>
        <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Date de la séance</p>
        <input type="date" id="pedit-date" value="${prev.date||''}"
          style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;font-size:15px;font-weight:600;color:var(--text);width:100%;outline:none;">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">KM réels</p>
          <input type="number" id="pedit-km" value="${kmVal}" min="0" max="99" step="0.5" oninput="calcPerfEditPace()"
            style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:11px;font-size:20px;font-weight:800;color:var(--text);width:100%;outline:none;text-align:center;">
          <p style="font-size:10px;color:var(--muted);margin-top:3px;text-align:center;">Prévu : ${s.km} km</p>
        </div>
        <div>
          <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Durée</p>
          <input type="text" inputmode="numeric" id="pedit-dur" value="${prev.dur||''}" placeholder="mm:ss" maxlength="7" oninput="onDurInput(this)"
            style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:11px;font-size:20px;font-weight:800;color:var(--text);width:100%;outline:none;text-align:center;">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Allure moy. <span style="font-size:10px;font-weight:400;">(auto ou manuel)</span></p>
          <input type="text" id="pedit-pace" value="${prev.pace||''}" placeholder="5:40" maxlength="5"
            style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:11px;font-size:20px;font-weight:800;color:var(--text);width:100%;outline:none;text-align:center;">
          <p style="font-size:10px;color:var(--muted);margin-top:3px;text-align:center;">/km</p>
        </div>
        <div>
          <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">FC moy. <span style="font-size:10px;font-weight:400;color:#aaa;">(optionnel)</span></p>
          <input type="number" id="pedit-hr" value="${prev.hr||''}" placeholder="—" min="50" max="220"
            style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:11px;font-size:20px;font-weight:800;color:var(--text);width:100%;outline:none;text-align:center;">
          <p style="font-size:10px;color:var(--muted);margin-top:3px;text-align:center;">bpm</p>
        </div>
      </div>
      ${blocsHtml}
      ${(()=>{
        // ── Bandeau météo de la séance ───────────────────────────────────────
        const mt = prev.meteo;
        if(!mt) return '';
        const impactColors  = {IDEAL:'#2E7D32',MODERE:'#E65100',ELEVE:'#C62828',EXTREME:'#B71C1C',HUMIDE:'#1565C0',FROID:'#37474F'};
        const impactLabels  = {IDEAL:'Idéal ✅',MODERE:'Chaleur modérée',ELEVE:'Forte chaleur',EXTREME:'Chaleur extrême ⚠️',HUMIDE:'Humide',FROID:'Froid'};
        const niveau        = mt.impact_performance?.niveau || 'IDEAL';
        const impactColor   = impactColors[niveau] || '#2E7D32';
        const impactLabel   = impactLabels[niveau] || niveau;
        const condIcon      = mt.conditions?.split(' ').pop() || '🌤️';
        const elevFC        = mt.impact_performance?.elevation_fc_bpm || 0;
        let html2 = '<div style="background:#FFF8E7;border-radius:12px;padding:12px 14px;border:1.5px solid #F5A62330;margin-top:4px;">';
        html2 += '<p style="font-size:11px;font-weight:700;color:#E65100;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">🌤️ Météo de la séance' + (mt.ville ? ' — ' + mt.ville : '') + (mt.heure_cible && mt.heure_cible !== "maintenant" ? ' à ' + mt.heure_cible : '') + '</p>';
        html2 += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">';
        html2 += '<div style="display:flex;align-items:center;gap:8px;"><span style="font-size:20px;">' + condIcon + '</span><div>';
        html2 += '<p style="font-size:13px;font-weight:700;color:#1a2e4a;margin:0;">' + mt.temperature + '°C</p>';
        html2 += '<p style="font-size:10px;color:#6B8DB5;margin:2px 0 0;">Ressenti ' + mt.ressenti + '°C</p>';
        html2 += '</div></div>';
        html2 += '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">';
        html2 += '<span style="background:rgba(12,68,124,0.08);border-radius:12px;padding:3px 9px;font-size:11px;color:#0C447C;">💧 ' + mt.humidite + '%</span>';
        html2 += '<span style="background:rgba(12,68,124,0.08);border-radius:12px;padding:3px 9px;font-size:11px;color:#0C447C;">💨 ' + mt.vent_kmh + ' km/h</span>';
        html2 += '<span style="background:' + impactColor + '18;border-radius:12px;padding:3px 9px;font-size:11px;font-weight:700;color:' + impactColor + ';">' + impactLabel + '</span>';
        if(elevFC > 0) html2 += '<span style="background:#FF6F0018;border-radius:12px;padding:3px 9px;font-size:11px;font-weight:600;color:#E65100;">❤️ FC +' + elevFC + ' bpm</span>';
        html2 += '</div></div>';
        html2 += '</div>';
        return html2;
      })()}
      ${(()=>{
        const st = prev.strava;
        if(!st) return '';
        let html = '<div style="background:#EDF5FF;border-radius:12px;padding:12px 14px;border:1.5px solid #1382E430;margin-top:4px;">';
        html += '<p style="font-size:11px;font-weight:700;color:#1382E4;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">📡 Données Strava importées</p>';
        const extras = [];
        if(st.cadence) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Cadence</p><p style="font-size:15px;font-weight:700;color:#1a2e4a;">${st.cadence} <span style="font-size:10px;font-weight:400;">pas/min</span></p></div>`);
        if(st.denivele_pos != null) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Dénivelé +</p><p style="font-size:15px;font-weight:700;color:#3B6D11;">${st.denivele_pos} <span style="font-size:10px;font-weight:400;">m</span></p></div>`);
        if(st.fcMax) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">FC max</p><p style="font-size:15px;font-weight:700;color:#E24B4A;">${st.fcMax} <span style="font-size:10px;font-weight:400;">bpm</span></p></div>`);
        if(st.calories) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Calories</p><p style="font-size:15px;font-weight:700;color:#E8530A;">${st.calories} <span style="font-size:10px;font-weight:400;">kcal</span></p></div>`);
        if(st.best_400m) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Meilleur 400m</p><p style="font-size:15px;font-weight:700;color:#1B4FD8;">${st.best_400m} <span style="font-size:10px;font-weight:400;">/km</span></p></div>`);
        if(st.puissance_moy) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Puissance</p><p style="font-size:15px;font-weight:700;color:#6B21A8;">${st.puissance_moy} <span style="font-size:10px;font-weight:400;">W</span></p></div>`);
        if(extras.length > 0) html += `<div style="display:grid;grid-template-columns:repeat(${Math.min(extras.length,3)},1fr);gap:8px;margin-bottom:${st.splits?'10px':'0'};">${extras.join('')}</div>`;
        if(st.splits && st.splits.length > 0) {
          html += '<p style="font-size:10px;font-weight:700;color:#6B8DB5;margin-bottom:6px;text-transform:uppercase;">Splits par km</p>';
          html += '<div style="overflow-x:hidden;"><table style="width:100%;border-collapse:collapse;font-size:11px;">';
          html += '<tr style="color:#6B8DB5;"><th style="text-align:left;padding:2px 4px;">Km</th><th style="text-align:center;padding:2px 4px;">Allure</th><th style="text-align:center;padding:2px 4px;">FC</th></tr>';
          st.splits.filter(sp => sp.distanceKm && sp.distanceKm >= 0.5).forEach(sp => {
            html += `<tr style="border-top:1px solid #d0dff5;"><td style="padding:3px 4px;font-weight:700;color:#1a2e4a;">${sp.km}</td><td style="padding:3px 4px;text-align:center;color:#1B4FD8;font-weight:600;">${sp.allure||'—'}</td><td style="padding:3px 4px;text-align:center;color:#E24B4A;">${sp.fc||'—'}</td></tr>`;
          });
          html += '</table></div>';
        }
        html += '</div>';
        return html;
      })()}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:20px;">
      <button onclick="closeModal()" style="padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;color:var(--muted);cursor:pointer;">Annuler</button>
      <button onclick="savePerfEdit(${ws},${si})" style="padding:12px;background:#3B6D11;border:none;border-radius:var(--radius-sm);font-size:14px;font-weight:600;color:#fff;cursor:pointer;">✓ Enregistrer</button>
    </div>
  </div>`;
  overlay.onclick = e => { if(e.target===overlay) closeModal(); };
  _lockBodyScroll();
  mc.appendChild(overlay);
}

function calcPerfEditPace(){
  const kmEl = document.getElementById('pedit-km');
  const durEl = document.getElementById('pedit-dur');
  const paceEl = document.getElementById('pedit-pace');
  if(!kmEl||!durEl||!paceEl) return;
  const km = parseFloat(kmEl.value);
  const durStr = durEl.value.trim();
  if(!km||km<=0||!durStr) return;
  const parts = durStr.split(':');
  let totalMin;
  if(parts.length===3){ totalMin=parseInt(parts[0])*60+parseInt(parts[1])+(parseInt(parts[2])||0)/60; }
  else if(parts.length===2){ const l=parseInt(parts[0])||0,r=parseInt(parts[1])||0; totalMin=l>=10?l+r/60:l*60+r; }
  else return;
  if(totalMin<=0) return;
  const pMin=Math.floor(totalMin/km);
  const pSec=Math.round(((totalMin/km)-pMin)*60);
  paceEl.value=pMin+':'+(pSec+'').padStart(2,'0');
  paceEl.style.borderColor='#3B6D11';
}

function savePerfEdit(ws, si){
  const km = parseFloat(document.getElementById('pedit-km').value);
  const dur = (document.getElementById('pedit-dur').value||'').trim();
  const pace = (document.getElementById('pedit-pace').value||'').trim();
  const hr = parseInt(document.getElementById('pedit-hr').value)||null;
  const dateVal = (document.getElementById('pedit-date').value||'').trim();
  const k = gk(ws, si);
  const s = getSession(ws, si);
  if(!isNaN(km)&&km>=0) state[k+'km']=km;
  const perf = {};
  if(dur) perf.dur=dur;
  if(pace) perf.pace=pace;
  if(hr) perf.hr=hr;
  if(dateVal) perf.date=dateVal;
  // Conserver la météo existante si présente
  try {
    const existing = state[k+'perf'] ? (typeof state[k+'perf']==='string' ? JSON.parse(state[k+'perf']) : state[k+'perf']) : {};
    if(existing.meteo) perf.meteo = existing.meteo;
  } catch(e) {}
  // Blocs tempo/frac
  if(s.type==='tempo'||s.type==='frac'){
    const titleMatch=s.d.split('|')[0].match(/(\d+)[x\u00d7]/i);
    const nbBlocs=titleMatch?parseInt(titleMatch[1]):2;
    const blocsAllure=[];
    for(let i=0;i<nbBlocs;i++){
      const el=document.getElementById('pedit-bloc-'+i);
      blocsAllure.push(el&&el.value.trim()?el.value.trim():'');
    }
    if(blocsAllure.some(b=>b)) perf.blocsAllure=blocsAllure;
  }
  if(Object.keys(perf).length>0) {
    // Merger avec l'existant pour ne pas perdre les données Strava
    const existing = state[k+'perf'] ? JSON.parse(state[k+'perf']) : {};
    state[k+'perf'] = JSON.stringify({...existing, ...perf});
  }
  save();
  closeModal();
  rendered.plan=false;
  rendered.stats=false;
  if(document.getElementById('sc-plan').style.display!=='none') renderPlan();
  if(document.getElementById('sc-stats').style.display!=='none') renderStats();
}

function _buildTempoEditFields(ws, editReps, editDur, editRecup, editPMin, editPMax, detail) {
  const O = '#E8530A';
  return `
    <div class="modal-section">
      <div class="modal-section-label">🔥 Format des blocs</div>
      <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;">
        <div>
          <p style="font-size:10px;color:var(--muted);margin-bottom:6px;text-align:center;font-weight:600;">Répétitions</p>
          <input type="number" id="edit-reps" value="${editReps}" min="1" max="10" step="1" onchange="onTempoRepsChange('edit')"
            style="background:var(--bg);border:3px solid ${O};border-radius:12px;padding:12px;font-size:28px;font-weight:800;color:${O};width:100%;outline:none;text-align:center;">
        </div>
        <span style="font-size:26px;font-weight:800;color:${O};padding-top:22px;">×</span>
        <div>
          <p style="font-size:10px;color:var(--muted);margin-bottom:6px;text-align:center;font-weight:600;">Minutes</p>
          <input type="number" id="edit-dur" value="${editDur}" min="1" max="60" step="1" oninput="calcEfRestant()"
            style="background:var(--bg);border:3px solid ${O}60;border-radius:12px;padding:12px;font-size:28px;font-weight:800;color:${O};width:100%;outline:none;text-align:center;">
        </div>
      </div>
    </div>
    <div id="edit-recup-container" class="modal-section" style="display:${parseInt(editReps)>1?'block':'none'};">
      <div class="modal-section-label">⏱ Récupération</div>
      <div style="display:flex;align-items:center;gap:12px;">
        <input type="text" id="edit-recup" value="${editRecup}" placeholder="3:00" maxlength="5" oninput="calcEfRestant()"
          style="background:var(--bg);border:2px solid var(--border);border-radius:12px;padding:12px;font-size:26px;font-weight:800;color:var(--text);width:110px;outline:none;text-align:center;flex-shrink:0;">
        <span style="font-size:13px;color:var(--muted);line-height:1.4;">min:sec<br>entre les blocs</span>
      </div>
    </div>
    <div class="modal-section">
      <div class="modal-section-label" style="display:flex;justify-content:space-between;align-items:center;">
        <span>🎯 Allure cible /km</span>
        <label style="display:flex;align-items:center;gap:6px;font-weight:400;text-transform:none;letter-spacing:0;font-size:11px;color:var(--muted);cursor:pointer;">
          <input type="checkbox" id="edit-apply-format" style="width:14px;height:14px;cursor:pointer;accent-color:${O};"> Appliquer S${ws+1}→S32
        </label>
      </div>
      <div style="display:grid;grid-template-columns:1fr 28px 1fr;align-items:center;gap:8px;">
        <div>
          <p style="font-size:10px;color:var(--muted);margin-bottom:6px;text-align:center;font-weight:600;">Rapide</p>
          <input type="text" id="edit-pace-min" value="${editPMin}" placeholder="5:00" maxlength="5" oninput="calcEfRestant()"
            style="background:var(--bg);border:3px solid ${O};border-radius:12px;padding:12px;font-size:22px;font-weight:800;color:${O};width:100%;outline:none;text-align:center;">
        </div>
        <div style="text-align:center;color:var(--muted);font-size:18px;font-weight:700;padding-top:22px;">—</div>
        <div>
          <p style="font-size:10px;color:var(--muted);margin-bottom:6px;text-align:center;font-weight:600;">Lente</p>
          <input type="text" id="edit-pace-max" value="${editPMax}" placeholder="5:20" maxlength="5"
            style="background:var(--bg);border:3px solid ${O}50;border-radius:12px;padding:12px;font-size:22px;font-weight:800;color:${O};width:100%;outline:none;text-align:center;">
        </div>
      </div>
      <div style="margin-top:10px;display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="edit-apply-all" style="width:14px;height:14px;cursor:pointer;accent-color:${O};">
        <label for="edit-apply-all" style="font-size:11px;color:var(--muted);cursor:pointer;">Appliquer cette allure aux Tempo suivantes</label>
      </div>
    </div>
    <div class="modal-section">
      <div class="modal-section-label" style="color:#3B6D11;">🟢 Allure EF — échauffement · récup · fin</div>
      <div style="display:flex;align-items:stretch;gap:12px;margin-bottom:14px;">
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;">
          <input type="text" id="edit-ef-pace" value="${(()=>{const m=detail.match(/EF\s*[@\s]\s*(\d+)[''\':](\d+)/i);return m?m[1]+':'+m[2]:getBestEfPace()||'6:40';})()}" maxlength="5" oninput="calcEfRestant()"
            style="background:var(--bg);border:3px solid #3B6D11;border-radius:14px;padding:13px 10px;font-size:30px;font-weight:900;color:#3B6D11;width:104px;outline:none;text-align:center;line-height:1;">
          <p style="font-size:9px;color:#3B6D11;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;">/km</p>
        </div>
        <div style="flex:1;display:flex;flex-wrap:wrap;align-content:center;gap:6px;">
          ${['6:20','6:10','6:00','5:50','5:40','5:30'].map(p=>'<button type="button" id="edit-ef-chip-'+p.replace(':','-')+'" onclick="selectTempoEfPace(&quot;edit&quot;,&quot;'+p+'&quot;)" style="padding:6px 10px;border-radius:20px;font-size:12px;font-weight:700;border:1.5px solid var(--border);background:var(--bg);color:var(--muted);cursor:pointer;transition:all 0.15s;">'+p+'</button>').join('')}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="modal-stat-card" style="background:#EEF2FD;border:none;">
          <div class="modal-stat-label" style="color:#1B4FD8;">⏱ Durée totale</div>
          <div class="modal-stat-value" style="color:#1B4FD8;" id="edit-tempo-duration">—</div>
        </div>
        <div class="modal-stat-card" style="background:#EAF3DE;border:none;">
          <div class="modal-stat-label" style="color:#3B6D11;">🏁 EF de fin</div>
          <div class="modal-stat-value" style="color:#3B6D11;" id="edit-ef-fin">—</div>
        </div>
      </div>
    </div>
    <div id="ef-restant-display" style="display:none;"></div>
  `;
}

function openPerfEditExtraModal(ws, ei){
  const s = JSON.parse(state[`extra_w${ws}_s${ei}`]||'{}');
  const prev = state[`extra_w${ws}_s${ei}_perf`] ? JSON.parse(state[`extra_w${ws}_s${ei}_perf`]) : {};
  const title = (s.d||'').split('|')[0];
  const _hacc = {ef:'#3B6D11',tempo:'#E8530A',frac:'#C4141B',long:'#534AB7'}[s.type]||'#1B4FD8';
  const _hcls = {ef:'modal-header-ef',tempo:'modal-header-tempo',frac:'modal-header-frac',long:'modal-header-long'}[s.type]||'modal-header-default';
  const mc = document.getElementById('modal-container');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.setProperty('--_overlay-bg','rgba(0,0,0,0.4)');
  overlay.innerHTML = `<div class="modal-box" style="max-height:92vh;">
    <div class="modal-header ${_hcls}" style="flex-shrink:0;">
      <div style="width:36px;height:4px;border-radius:4px;background:rgba(255,255,255,0.3);margin:0 auto 12px;"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <p style="font-size:10px;font-weight:800;opacity:0.7;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:3px;color:#fff;">S${ws} · Séance extra validée</p>
          <p style="font-size:20px;font-weight:900;letter-spacing:-0.02em;color:#fff;">${title}</p>
          <p style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:3px;">${s.km} km planifiés</p>
        </div>
        <button onclick="closeModal()" style="background:rgba(255,255,255,0.2);border:none;cursor:pointer;color:#fff;font-size:18px;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">×</button>
      </div>
    </div>
    <div class="modal-scroll-body">
    <div style="padding:16px 16px 0;">
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">KM réels</p>
            <input type="number" id="pex-km" value="${state[`extra_w${ws}_s${ei}_km`]||s.km}" min="0" max="99" step="1"
              style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:11px;font-size:20px;font-weight:800;color:var(--text);width:100%;outline:none;text-align:center;">
          </div>
          <div>
            <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Durée</p>
            <input type="text" id="pex-dur" value="${prev.dur||''}" placeholder="47:53" maxlength="7"
              style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:11px;font-size:20px;font-weight:800;color:var(--text);width:100%;outline:none;text-align:center;">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Allure moy.</p>
            <input type="text" id="pex-pace" value="${prev.pace||''}" placeholder="5:40" maxlength="5"
              style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:11px;font-size:20px;font-weight:800;color:var(--text);width:100%;outline:none;text-align:center;">
            <p style="font-size:10px;color:var(--muted);margin-top:3px;text-align:center;">/km</p>
          </div>
          <div>
            <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">FC moyenne</p>
            <input type="number" id="pex-hr" value="${prev.hr||''}" placeholder="145" min="50" max="220"
              style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:11px;font-size:20px;font-weight:800;color:var(--text);width:100%;outline:none;text-align:center;">
            <p style="font-size:10px;color:var(--muted);margin-top:3px;text-align:center;">bpm</p>
          </div>
        </div>
      </div>
      <div style="padding:0 0 28px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:20px;">
          <button onclick="closeModal()" style="padding:13px;background:var(--bg2);border:1.5px solid var(--border);border-radius:14px;font-size:13px;font-weight:700;color:var(--muted);cursor:pointer;">Annuler</button>
          <button onclick="_savePerfExtra(${ws},${ei})" style="padding:13px;background:${_hacc};border:none;border-radius:14px;font-size:14px;font-weight:800;color:#fff;cursor:pointer;">✅ Enregistrer</button>
        </div>
      </div>
    </div>
    </div>
  </div>`;
  overlay.onclick = e => { if(e.target===overlay) closeModal(); };
  _lockBodyScroll();
  mc.appendChild(overlay);
  _initSwipeToDismiss(overlay, overlay.querySelector('.modal-box'));
}

function _savePerfExtra(ws, ei){
  const km = parseFloat((document.getElementById('pex-km')||{}).value);
  const dur = ((document.getElementById('pex-dur')||{}).value||'').trim();
  const pace = ((document.getElementById('pex-pace')||{}).value||'').trim();
  const hr = parseInt((document.getElementById('pex-hr')||{}).value)||null;
  const k = `extra_w${ws}_s${ei}`;
  if(!isNaN(km)&&km>=0) state[k+'_km'] = km;
  const perf = state[k+'_perf'] ? JSON.parse(state[k+'_perf']) : {};
  if(dur) perf.dur=dur; else delete perf.dur;
  if(pace) perf.pace=pace; else delete perf.pace;
  if(hr) perf.hr=hr; else delete perf.hr;
  if(Object.keys(perf).length>0) state[k+'_perf']=JSON.stringify(perf);
  else delete state[k+'_perf'];
  save(); closeModal(); rendered.plan=false; rendered.stats=false; renderPlan(); renderHome();
  if(_adminPreviewUid) _refreshAthleteCoachView();
}

function openEditModal(ws, si){
  const s = getSession(ws, si);
  const parts = s.d.split('|');
  const title = parts[0];
  const detail = parts[1]||'';
  const mc = document.getElementById('modal-container');
  const shoeOptions=getShoeOptions(s.shoe);
  const typeOptions = ['ef','tempo','frac','long','rest','race'].map(t=>
    `<option value="${t}" ${s.type===t?'selected':''}>${typeLabel[t]}</option>`
  ).join('');

  // Pre-calculate tempo/frac fields
  const isFrac=s.type==='frac';
  const repMatch=title.match(/(\d+)×(\d+)/);
  const editReps=repMatch?repMatch[1]:(isFrac?'6':'2');
  const editDur=repMatch?repMatch[2]:(isFrac?'2':'8');
  // Extraire l'allure cible depuis "X'XX/km", "X:XX/km", "X:XX — Y:YY /km" ou "X:XX /km"
  const paceRangeMatch=detail.match(/(\d+)['':](\d+)\s*[–—-]\s*(\d+)['':](\d+)\s*\/km/);
  const paceKmMatch=paceRangeMatch?null:detail.match(/(\d+)['':](\d+)\s*\/km/);
  const editPMin=paceRangeMatch?paceRangeMatch[1]+':'+paceRangeMatch[2]:paceKmMatch?paceKmMatch[1]+':'+paceKmMatch[2]:(isFrac?'4:30':'5:00');
  const editPMax=paceRangeMatch?paceRangeMatch[3]+':'+paceRangeMatch[4]:(()=>{const s=paceKmMatch?parseInt(paceKmMatch[1])*60+parseInt(paceKmMatch[2]):null;return s?Math.floor((s+10)/60)+':'+((s+10)%60<10?'0':'')+((s+10)%60):(isFrac?'4:50':'5:20');})();
  const editPMinSec=paceRangeMatch?parseInt(paceRangeMatch[1])*60+parseInt(paceRangeMatch[2]):paceKmMatch?parseInt(paceKmMatch[1])*60+parseInt(paceKmMatch[2]):null;
  const editPMaxSec=null; // unused, kept for compat
  const editRecupMatch=detail.match(/([\d:]+)\s*min\s*r[eé]cup/i);
  const editRecup=editRecupMatch?editRecupMatch[1]:(isFrac?'2':'3');

  const editEfPaceMatch = detail.match(/EF\s*[@\s]\s*(\d+)[''\':](\d+)/i);
  const editEfPaceVal = editEfPaceMatch ? editEfPaceMatch[1]+':'+editEfPaceMatch[2] : getBestEfPace()||'6:40';
  const tempoFields = s.type==='tempo' ? _buildTempoEditFields(ws, editReps, editDur, editRecup, editPMin, editPMax, detail)
  :s.type==='frac' ? buildTempoFieldsHtml('edit',parseInt(editReps),parseInt(editDur),editRecup,editPMin,editPMax,'#C4141B',editEfPaceVal)
  :s.type==='long'?buildLongModalHtml(detail)
  :(()=>{
    // Extraire l'allure depuis le detail existant
    const paceMatch2 = detail.match(/(\d+)[':](\d+)/);
    const efPaceVal = paceMatch2 ? paceMatch2[1]+":"+paceMatch2[2] : getBestEfPace()||'6:40';
    const ed2 = state['edit_w'+ws+'_s'+si]?JSON.parse(state['edit_w'+ws+'_s'+si]):{};
    // Allures suggérées (plage EF Guillaume)
    const efPaces = ["6:25","6:20","6:15","6:10","6:05","6:00","5:55","5:50","5:45","5:40","5:35","5:30"];
    const paceChips = efPaces.map(p=>`<button type="button" id="pace-chip-${p.replace(':','-')}" onclick="selectEfPace('${p}')" style="padding:7px 11px;border-radius:20px;font-size:12px;font-weight:600;border:1.5px solid var(--border);background:var(--bg2);color:var(--muted);cursor:pointer;transition:all 0.15s;">${p}</button>`).join('');
    return `
    <!-- EF : planning inclus ici (pas en section séparée) -->
    <div class="modal-section" style="background:linear-gradient(135deg,#EEF2FD,#E8EDFF);">
      <div class="modal-section-label" style="color:#1B4FD8;">📅 Planification</div>
      ${buildSchedFieldsHtml(ed2.sched_day||'',ed2.sched_time||'')}
    </div>
    <div class="modal-section" style="--_accent:#3B6D11;">
      <div class="modal-section-label" style="color:#3B6D11;">🟢 Allure cible</div>
      <!-- Grande input allure + badge durée -->
      <div style="display:flex;align-items:stretch;gap:12px;margin-bottom:16px;">
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
          <input type="text" id="edit-ef-pace" value="${efPaceVal}" placeholder="6:40" maxlength="5"
            oninput="updateEfPreview()"
            style="background:var(--bg);border:3px solid #3B6D11;border-radius:14px;padding:14px 12px;font-size:32px;font-weight:900;color:#3B6D11;width:108px;outline:none;text-align:center;line-height:1;">
          <p style="font-size:9px;color:#3B6D11;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;">/km</p>
        </div>
        <div style="flex:1;background:#EAF3DE;border-radius:14px;padding:14px;display:flex;flex-direction:column;justify-content:center;gap:6px;">
          <div>
            <p style="font-size:9px;font-weight:800;color:#3B6D11;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">💓 Zone cible</p>
            <p style="font-size:16px;font-weight:900;color:#2D5A0E;">140 – 148 bpm</p>
          </div>
          <div>
            <p style="font-size:9px;font-weight:800;color:#3B6D11;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">⏱ Durée estimée</p>
            <p style="font-size:18px;font-weight:900;color:#2D5A0E;" id="ef-preview-time">—</p>
          </div>
        </div>
      </div>
      <!-- Chips allure -->
      <p style="font-size:9px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Raccourcis allure</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">${paceChips}</div>
    </div>
    <input type="hidden" id="edit-detail" value="${detail}">
    `;
  })()
  ;

  const overlay = document.createElement('div');
  overlay.className='modal-overlay';
  // Couleur et icône par type
  const _typeColors={ef:{bg:'modal-header-ef',icon:'🟢',label:'Endurance Fondamentale'},tempo:{bg:'modal-header-tempo',icon:'🔥',label:'Tempo'},frac:{bg:'modal-header-frac',icon:'⚡',label:'Fractionné'},long:{bg:'modal-header-long',icon:'💜',label:'EF Longue'},rest:{bg:'modal-header-default',icon:'😴',label:'Repos'},race:{bg:'modal-header-default',icon:'🏁',label:'Course'}};
  const _tc=_typeColors[s.type]||_typeColors.rest;
  // Calculer la durée header avec la même allure que le champ
  const _editPaceMatch = detail.match(/(\d+)[':](\d+)/);
  const _editEfPace = _editPaceMatch ? _editPaceMatch[1]+':'+_editPaceMatch[2] : (getBestEfPace()||'6:40');
  const _modalDur = (()=>{
    if(s.type==='ef'){
      const pm=_editEfPace.match(/(\d+)[':](\d+)/);
      if(!pm) return estimateDuration(s);
      const paceMin=parseInt(pm[1])+parseInt(pm[2])/60;
      const totalSec=Math.round(paceMin*s.km*60);
      const h=Math.floor(totalSec/3600),m=Math.floor((totalSec%3600)/60),sec=totalSec%60;
      const base=h>0?h+'h'+String(m).padStart(2,"0")+"'":m+"'";
      return base+(sec?String(sec).padStart(2,"0")+'"':'');
    }
    return estimateDuration(s);
  })();
  const _hcls  = {ef:'modal-header-ef',tempo:'modal-header-tempo',frac:'modal-header-frac',long:'modal-header-long'}[s.type]||'modal-header-default';
  const _hacc  = {ef:'#3B6D11',tempo:'#E8530A',frac:'#C4141B',long:'#534AB7'}[s.type]||'#1B4FD8';
  const _hlbl  = {ef:'Endurance Fondamentale',tempo:'Intervalles Tempo',frac:'Fractionné',long:'Sortie Longue'}[s.type]||title;
  const _hemj  = {ef:'🟢',tempo:'🔥',frac:'⚡',long:'💜'}[s.type]||'📅';
  overlay.style.setProperty('--_overlay-bg','rgba(0,0,0,0.4)');
  // Couleur gradient de transition header→body
  const _gradColors = {ef:'#3B6D11',tempo:'#E8530A',frac:'#C4141B',long:'#534AB7'};
  const _gc = _gradColors[s.type] || '#0C447C';
  overlay.innerHTML=`<div class="modal-box" style="max-height:92vh;">

    <!-- HEADER sticky en haut -->
    <div class="modal-header ${_hcls}" style="position:sticky;top:0;z-index:10;flex-shrink:0;padding-top:10px;">
      <!-- Handle bar -->
      <div style="width:36px;height:4px;border-radius:4px;background:rgba(255,255,255,0.3);margin:0 auto 12px;"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div style="flex:1;min-width:0;">
          <p style="font-size:10px;font-weight:800;opacity:0.7;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:3px;">S${ws} · Modifier la séance</p>
          <p style="font-size:22px;font-weight:900;letter-spacing:-0.03em;line-height:1.1;">${_hemj} ${_hlbl}</p>
          <div style="display:flex;align-items:center;gap:10px;margin-top:6px;flex-wrap:wrap;">
            ${_modalDur?`<span style="background:rgba(255,255,255,0.2);border-radius:20px;padding:3px 10px;font-size:12px;font-weight:700;">⏱ ~${_modalDur}</span>`:''}
            <span style="background:rgba(255,255,255,0.2);border-radius:20px;padding:3px 10px;font-size:12px;font-weight:700;">${s.km} km</span>
          </div>
        </div>
        <button onclick="closeModal()" style="background:rgba(255,255,255,0.25);border:none;cursor:pointer;color:#fff;font-size:18px;line-height:1;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;">×</button>
      </div>
    </div>

    <!-- BODY scrollable -->
    <div class="modal-scroll-body">
    <div class="modal-body" style="gap:0;">

      <!-- Planning (Tempo, Frac & Long) -->
      ${s.type==='tempo'||s.type==='frac'||s.type==='long'?`
      <div class="modal-section" style="background:linear-gradient(135deg,#EEF2FD,#E8EDFF);">
        <div class="modal-section-label" style="color:#1B4FD8;">📅 Planification</div>
        ${(()=>{const ed=state['edit_w'+ws+'_s'+si]?JSON.parse(state['edit_w'+ws+'_s'+si]):{};return buildSchedFieldsHtml(ed.sched_day||'',ed.sched_time||'');})()}
      </div>`:''}

      <!-- Champs principaux (tempo/long/ef) -->
      <div id="edit-fields-container">${tempoFields}</div>

      <!-- Distance + Type + Chaussures -->
      <div class="modal-section" style="margin-top:4px;">
        <div class="modal-section-label">⚙️ Configuration</div>
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">
          <!-- Km stepper -->
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;">
            <div style="display:flex;align-items:center;gap:4px;">
              <button type="button" onclick="const el=document.getElementById('edit-km');el.value=Math.max(0,parseFloat(el.value||0)-1);el.dispatchEvent(new Event('input'))" style="width:32px;height:32px;border-radius:50%;border:2px solid var(--border);background:var(--bg);font-size:18px;color:var(--text);cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:700;">−</button>
              <input type="number" id="edit-km" value="${s.km}" min="0" max="99" step="1" oninput="if(document.getElementById('ef-restant-display'))calcEfRestant();updateEfPreview();" style="background:${_hacc}12;border:2.5px solid ${_hacc};border-radius:12px;padding:8px 4px;font-size:26px;font-weight:900;color:${_hacc};width:68px;outline:none;text-align:center;-moz-appearance:textfield;">
              <button type="button" onclick="const el=document.getElementById('edit-km');el.value=Math.min(99,parseFloat(el.value||0)+1);el.dispatchEvent(new Event('input'))" style="width:32px;height:32px;border-radius:50%;border:2px solid var(--border);background:var(--bg);font-size:18px;color:var(--text);cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:700;">+</button>
            </div>
            <p style="font-size:9px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">km</p>
          </div>
          <!-- Type pills + chaussures -->
          <div style="flex:1;display:flex;flex-direction:column;gap:10px;">
            <div>
              <p style="font-size:9px;font-weight:800;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.07em;">Type de séance</p>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${[['ef','🟢 EF','#3B6D11'],['tempo','🔥 Tempo','#E8530A'],['frac','⚡ Frac','#C4141B'],['long','💜 Long','#534AB7']].map(([v,lbl,col])=>`<button type="button" onclick="document.getElementById('edit-type').value='${v}';onEditTypeChange();document.querySelectorAll('.edit-type-pill').forEach(b=>{const isV=b.dataset.type==='${v}';b.style.background=isV?'${col}':'var(--bg)';b.style.color=isV?'#fff':'var(--muted)';b.style.borderColor=isV?'${col}':'var(--border)';})" class="edit-type-pill" data-type="${v}" style="flex:1;min-width:60px;padding:9px 4px;border-radius:12px;font-size:12px;font-weight:800;border:2px solid ${s.type===v?col:'var(--border)'};background:${s.type===v?col:'var(--bg)'};color:${s.type===v?'#fff':'var(--muted)'};cursor:pointer;transition:all 0.15s;text-align:center;">${lbl}</button>`).join('')}
                <select id="edit-type" onchange="onEditTypeChange()" style="display:none;">${typeOptions}</select>
              </div>
            </div>
            <div>
              <p style="font-size:9px;font-weight:800;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.07em;">👟 Chaussures</p>
              <select id="edit-shoe" style="background:var(--bg);border:2px solid var(--border);border-radius:12px;padding:10px 12px;font-size:13px;font-weight:700;color:var(--text);width:100%;outline:none;cursor:pointer;">${shoeOptions}</select>
            </div>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px;">
        <button onclick="resetSession(${ws},${si})" style="padding:14px;background:var(--bg2);border:2px solid var(--border);border-radius:14px;font-size:13px;font-weight:700;color:var(--muted);cursor:pointer;">↺ Réinit.</button>
        <button onclick="saveEdit(${ws},${si})" class="modal-btn-primary" style="background:${_hacc};">Enregistrer ✓</button>
      </div>
      <button onclick="deleteSession(${ws},${si})" style="width:100%;margin-top:10px;padding:13px;background:transparent;border:2px solid #E24B4A33;border-radius:14px;font-size:13px;font-weight:700;color:#E24B4A;cursor:pointer;">🗑 Supprimer cette séance</button>
    </div>
    </div><!-- /modal-scroll-body -->
  </div>`;
  overlay.onclick=e=>{if(e.target===overlay)closeModal();};
  _lockBodyScroll();
  mc.appendChild(overlay);

  _initSwipeToDismiss(overlay, overlay.querySelector('.modal-box'));
  // Init blocs long si nécessaire
  if(s.type==='long') { renderLongBlocks(); setTimeout(()=>{ updateLongDuration(); const ef=document.getElementById('long-ef-pace'); if(ef) highlightLongEfChip(ef.value); }, 50); }
  if(s.type==='tempo') setTimeout(()=>{ calcEfRestant(); }, 50);
  if(s.type==='frac') setTimeout(()=>{ calcEfRestantForPrefix('edit'); selectTempoEfPace('edit', document.getElementById('edit-ef-pace')?.value||getBestEfPace()||'6:40'); }, 50);
  if(s.type==='ef') setTimeout(()=>{
    updateEfPreview();
    // Highlight current pace chip
    const paceEl=document.getElementById('edit-ef-pace');
    if(paceEl) selectEfPace(paceEl.value);
  }, 50);
}

function selectTempoEfPace(prefix, pace){
  const inp=document.getElementById(prefix+'-ef-pace');
  if(inp){inp.value=pace;}
  calcEfRestantForPrefix(prefix);
  // Highlight chip sélectionné
  document.querySelectorAll('[id^="'+prefix+'-ef-chip-"]').forEach(btn=>{
    const sel=btn.id===prefix+'-ef-chip-'+pace.replace(':','-');
    btn.style.background=sel?'#3B6D11':'var(--bg2)';
    btn.style.color=sel?'#fff':'var(--muted)';
    btn.style.borderColor=sel?'#3B6D11':'var(--border)';
  });
}

function selectHmEfPace(pace){
  const inp=document.getElementById('edit-ef-pace');
  if(inp){inp.value=pace;updateEfPreview();}
  document.querySelectorAll('[id^="edit-pace-chip-"]').forEach(btn=>{
    const sel=btn.id==='edit-ef-chip-'+pace.replace(':','-');
    btn.style.background=sel?'var(--blue)':'var(--bg2)';
    btn.style.color=sel?'#fff':'var(--muted)';
    btn.style.borderColor=sel?'var(--blue)':'var(--border)';
  });
}

function updateEfPreview(){
  const paceEl=document.getElementById('edit-ef-pace');
  const kmEl=document.getElementById('edit-km');
  const timeEl=document.getElementById('edit-ef-preview-time');
  if(!paceEl||!kmEl||!timeEl) return;
  const m=paceEl.value.match(/(\d+)[':](\d+)/);
  const km=parseFloat(kmEl.value)||0;
  if(!m||km===0){timeEl.textContent='—';return;}
  const totalSec=(parseInt(m[1])*60+parseInt(m[2]))*km;
  const h=Math.floor(totalSec/3600);
  const min=Math.floor((totalSec%3600)/60);
  const sec=Math.round(totalSec%60);
  timeEl.textContent=h>0?h+'h'+String(min).padStart(2,'0'):min+"'"+(sec?String(sec).padStart(2,'0')+'"':'');
  document.querySelectorAll('[id^="edit-pace-chip-"]').forEach(btn=>{
    const sel=btn.id==='edit-ef-chip-'+paceEl.value.replace(':','-');
    btn.style.background=sel?'var(--blue)':'var(--bg2)';
    btn.style.color=sel?'#fff':'var(--muted)';
    btn.style.borderColor=sel?'var(--blue)':'var(--border)';
  });
  // Synchroniser le header modal
  const hdrElHm=document.querySelector('.modal-box p[style*="color:var(--blue)"][style*="font-weight:600"]');
  if(hdrElHm&&hdrElHm.textContent.includes('estimées')&&km>0&&m){
    const dur=h>0?h+'h'+String(min).padStart(2,'0')+"'"+( sec?String(sec).padStart(2,'0')+'"':''):min+"'"+(sec?String(sec).padStart(2,'0')+'"':'');
    hdrElHm.textContent='⏱ ~'+dur+' estimées';
  }
}

function selectEfPace(pace){
  const inp = document.getElementById('edit-ef-pace');
  if(inp){ inp.value = pace; updateEfPreview(); }
  // Highlight selected chip
  document.querySelectorAll('[id^="pace-chip-"]').forEach(btn=>{
    const isSelected = btn.id === 'pace-chip-'+pace.replace(':','-');
    btn.style.background = isSelected ? 'var(--blue)' : 'var(--bg2)';
    btn.style.color = isSelected ? '#fff' : 'var(--muted)';
    btn.style.borderColor = isSelected ? 'var(--blue)' : 'var(--border)';
  });
}

function updateEfPreview(){
  const paceEl = document.getElementById('edit-ef-pace');
  const kmEl = document.getElementById('edit-km');
  const timeEl = document.getElementById('ef-preview-time');
  if(!paceEl || !kmEl || !timeEl) return;
  const paceStr = paceEl.value;
  const km = parseFloat(kmEl.value) || 0;
  const m = paceStr.match(/(\d+)[':](\d+)/);
  if(!m || km === 0){ timeEl.textContent = '—'; return; }
  const totalSec = (parseInt(m[1])*60 + parseInt(m[2])) * km;
  const h = Math.floor(totalSec/3600);
  const min = Math.floor((totalSec%3600)/60);
  const sec = Math.round(totalSec%60);
  timeEl.textContent = h>0 ? h+'h'+String(min).padStart(2,'0') : min+"'"+(sec?String(sec).padStart(2,'0')+'\"':'');
  // Highlight matching chip
  document.querySelectorAll('[id^="pace-chip-"]').forEach(btn=>{
    const isSelected = btn.id === 'pace-chip-'+paceStr.replace(':','-');
    btn.style.background = isSelected ? 'var(--blue)' : 'var(--bg2)';
    btn.style.color = isSelected ? '#fff' : 'var(--muted)';
    btn.style.borderColor = isSelected ? 'var(--blue)' : 'var(--border)';
  });
  // Synchroniser le header modal
  const hdrElEdit=document.querySelector('.modal-box p[style*="color:var(--blue)"][style*="font-weight:600"]');
  if(hdrElEdit&&hdrElEdit.textContent.includes('estimées')&&km>0&&m){
    const dur=h>0?h+'h'+String(min).padStart(2,'0')+"'"+( sec?String(sec).padStart(2,'0')+'"':''):min+"'"+(sec?String(sec).padStart(2,'0')+'"':'');
    hdrElEdit.textContent='⏱ ~'+dur+' estimées';
  }
}

function saveEdit(ws, si){
  const typeEl = document.getElementById('edit-type');
  const type = typeEl ? typeEl.value : getSession(ws,si).type;
  const km = parseFloat(document.getElementById('edit-km').value);
  const shoe = document.getElementById('edit-shoe').value || null;
  const applyAll = document.getElementById('edit-apply-all');
  const applyFormat = document.getElementById('edit-apply-format');
  let name = '', detail = '';
  if(type==='ef'||type==='long'&&document.getElementById('edit-ef-pace')){
    // Cas EF simple : récupérer l'allure
    if(type==='ef'){
      const paceEl2=document.getElementById('edit-ef-pace');
      const nameEl2=document.getElementById('edit-name');
      // Prendre le titre depuis le champ s'il existe, sinon depuis la séance existante
      const existingTitle = getSession(ws,si).d.split('|')[0];
      name = nameEl2 && nameEl2.value.trim() ? nameEl2.value.trim() : existingTitle;
      const efPaceStr=paceEl2?paceEl2.value.trim():'';
      detail=efPaceStr?efPaceStr+'/km':'';
    }
  }
  if(type==='tempo'||type==='frac'){
    const repsEl=document.getElementById('edit-reps');
    const durEl=document.getElementById('edit-dur');
    const pMinEl=document.getElementById('edit-pace-min');
    const pMaxEl=document.getElementById('edit-pace-max');
    const recupEl=document.getElementById('edit-recup');
    const reps=repsEl?parseInt(repsEl.value)||(type==='frac'?6:2):(type==='frac'?6:2);
    const dur=durEl?parseInt(durEl.value)||(type==='frac'?2:8):(type==='frac'?2:8);
    name=type==='frac'?`Fractionné ${reps}×${dur} min`:`Tempo ${reps}×${dur} min`;
    const pMin=pMinEl?(pMinEl.value||'').trim():'';
    const pMax=pMaxEl?(pMaxEl.value||'').trim():'';
    if(pMin&&pMax) detail=`${pMin} — ${pMax} /km`;
    else if(pMin) detail=`${pMin} /km`;
    const recup=(recupEl?recupEl.value||'':'').trim();
    if(recup&&recup!=='0'&&reps>1) detail=detail+(detail?' · ':'')+`${recup} min récup`;
    const editEfPaceEl=document.getElementById('edit-ef-pace');
    const editEfPaceStr=(editEfPaceEl?editEfPaceEl.value.trim():'').replace("'",":");
    if(editEfPaceStr&&editEfPaceStr.match(/\d+:\d+/)) detail=detail+` · EF @ ${editEfPaceStr}`;
  } else if(type==='ef'){
    // Déjà traité ci-dessus — ne rien faire ici, name+detail sont déjà définis
  } else if(type==='long'){
    const existing=getSession(ws,si);
    const nameElLong=document.getElementById('edit-name');
    name=(nameElLong&&nameElLong.value.trim())||existing.d.split('|')[0]||'Séance EF longue';
    const blocks=getLongBlocksData();
    if(blocks.length>0){
      const bTotal=Math.round(blocks.reduce((a,b)=>a+b.km,0)*10)/10;
      if(Math.abs(bTotal-km)>=0.1){alert('Total des blocs ('+bTotal+' km) ≠ distance planifiée ('+km+' km). Ajuste les blocs.');return;}
      detail=buildLongDetail(blocks);
    }
  } else {
    const nameEl=document.getElementById('edit-name');
    if(nameEl) name=nameEl.value.trim();
    const detailEl=document.getElementById('edit-detail');
    if(detailEl) detail=detailEl.value.trim();
  }
  const d = detail ? `${name}|${detail}` : name;
  const schedDay=parseInt(document.getElementById('sched-day').value)||null;
  const schedH=document.getElementById('sched-hour')?document.getElementById('sched-hour').value:'08';
  const schedM=document.getElementById('sched-min')?document.getElementById('sched-min').value:'00';
  const schedTime=schedDay?(String(schedH).padStart(2,'0')+':'+String(schedM).padStart(2,'0')):null;
  const key = `edit_w${ws}_s${si}`;
  state[key] = JSON.stringify({d, km: isNaN(km)?0:km, type, shoe, sched_day:schedDay||undefined, sched_time:schedTime||undefined});
  // Appliquer le format (reps×dur) à toutes les Tempo suivantes
  if(applyFormat && applyFormat.checked && type==='tempo'){
    const reps=parseInt(document.getElementById('edit-reps').value)||2;
    const dur=parseInt(document.getElementById('edit-dur').value)||8;
    for(let w=ws+1;w<=32;w++){
      weeks[w-1].sessions.forEach((s2,si2)=>{
        if(s2.type==='tempo'){
          const existing=state[`edit_w${w}_s${si2}`]?JSON.parse(state[`edit_w${w}_s${si2}`]):s2;
          const existingDetail=existing.d.split('|')[1]||'';
          state[`edit_w${w}_s${si2}`]=JSON.stringify({...existing,d:`Tempo ${reps}×${dur} min${existingDetail?'|'+existingDetail:''}`});
        }
      });
    }
  }
  // Appliquer l'allure à toutes les Tempo suivantes
  if(applyAll && applyAll.checked && detail){
    for(let w=ws+1;w<=32;w++){
      weeks[w-1].sessions.forEach((s2,si2)=>{
        if(s2.type==='tempo'){
          const existing=state[`edit_w${w}_s${si2}`]?JSON.parse(state[`edit_w${w}_s${si2}`]):s2;
          const existingTitle=existing.d.split('|')[0];
          state[`edit_w${w}_s${si2}`]=JSON.stringify({...existing,d:`${existingTitle}|${detail}`});
        }
      });
    }
  }
  save();
  closeModal();
  rendered.plan=false;
  rendered.stats=false;
  renderPlan();
  renderHome();
}

function resetSession(ws, si){
  const key = `edit_w${ws}_s${si}`;
  delete state[key];
  save();
  closeModal();
  rendered.plan=false;
  rendered.stats=false;
  renderPlan();
  renderHome();
}

function deleteSession(ws, si){
  state[`del_w${ws}_s${si}`]=true;
  delete state[`edit_w${ws}_s${si}`];
  save();
  closeModal();
  rendered.plan=false;
  rendered.stats=false;
  renderPlan();
  renderHome();
}

function getWeekSessions(ws){
  const base=weeks[ws-1].sessions;
  const result=[];
  base.forEach((s,si)=>{
    if(!state[`del_w${ws}_s${si}`]) result.push({...getSession(ws,si),_si:si,_extra:false});
  });
  let ei=0;
  while(state[`extra_w${ws}_s${ei}`]){
    result.push({...JSON.parse(state[`extra_w${ws}_s${ei}`]),_si:'x'+ei,_extra:true,_ei:ei});
    ei++;
  }
  return result;
}

function openAddModal(ws){
  const mc = document.getElementById('modal-container');
  const shoeOptions = getShoeOptions(null);
  const typeOptions = ['ef','tempo','frac','long'].map(t =>
    `<option value="${t}">${typeLabel[t]}</option>`
  ).join('');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal-box" style="max-height:90vh;overflow-y:auto;">
    <!-- HEADER dynamique — se met à jour via JS après onAddTypeChange -->
    <div id="add-modal-header" class="modal-header modal-header-default">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <p style="font-size:11px;font-weight:600;opacity:0.75;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:2px;">S${ws} · Nouvelle séance</p>
          <p id="add-header-title" style="font-size:19px;font-weight:800;letter-spacing:-0.02em;">Endurance Fondamentale</p>
          <p style="font-size:12px;opacity:0.75;margin-top:3px;">Sélectionne le type ci-dessous</p>
        </div>
        <button onclick="closeModal()" style="background:rgba(255,255,255,0.2);border:none;cursor:pointer;color:#fff;font-size:20px;line-height:1;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">×</button>
      </div>
    </div>
    <div class="modal-body">
      <!-- Sélecteur de type en pills -->
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        ${[['ef','🟢 EF','#3B6D11'],['tempo','🔥 Tempo','#E8530A'],['frac','⚡ Frac','#C4141B'],['long','💜 Long','#534AB7']].map(([v,lbl,col])=>`<button type="button" onclick="onAddTypePill('${v}',${ws})" id="add-pill-${v}" style="flex:1;padding:10px 6px;border-radius:12px;font-size:12px;font-weight:700;border:2px solid ${v==='ef'?col:'var(--border)'};background:${v==='ef'?col:'var(--bg2)'};color:${v==='ef'?'#fff':'var(--muted)'};cursor:pointer;transition:all 0.15s;text-align:center;">${lbl}</button>`).join('')}
        <input type="hidden" id="add-type" value="ef">
      </div>
      <div id="add-fields-container"></div>
      <div class="modal-section" style="margin-top:12px;">
        <div class="modal-section-label">📏 Distance & chaussures</div>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:14px;align-items:center;">
          <div style="text-align:center;">
            <div style="display:flex;align-items:center;gap:6px;">
              <button type="button" onclick="const el=document.getElementById('add-km');el.value=Math.max(0,parseFloat(el.value||0)-1);el.dispatchEvent(new Event('input'))" style="width:30px;height:30px;border-radius:50%;border:1.5px solid var(--border);background:var(--bg);font-size:16px;color:var(--text);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">−</button>
              <input type="number" id="add-km" value="10" min="0" max="99" step="1" oninput="updateAddEfPreview();calcEfRestantForPrefix('add')"
                style="background:var(--bg);border:2px solid #1B4FD840;border-radius:10px;padding:8px;font-size:22px;font-weight:800;color:#1B4FD8;width:66px;outline:none;text-align:center;">
              <button type="button" onclick="const el=document.getElementById('add-km');el.value=Math.min(99,parseFloat(el.value||0)+1);el.dispatchEvent(new Event('input'))" style="width:30px;height:30px;border-radius:50%;border:1.5px solid var(--border);background:var(--bg);font-size:16px;color:var(--text);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">+</button>
            </div>
            <p style="font-size:9px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-top:4px;">km</p>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;flex:1;">
            <p style="font-size:9px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:2px;">👟 Chaussures</p>
            <select id="add-shoe" style="background:var(--bg);border:2px solid var(--border);border-radius:10px;padding:9px 10px;font-size:12px;font-weight:700;color:var(--text);width:100%;outline:none;cursor:pointer;">${shoeOptions}</select>
          </div>
        </div>
      </div>
      <div id="add-error" style="display:none;color:#E24B4A;font-size:12px;margin-top:8px;padding:12px;background:#FEF2F2;border-radius:12px;font-weight:600;"></div>
      <button onclick="saveAdd(${ws})" id="add-submit-btn" class="modal-btn-primary" style="margin-top:16px;background:#3B6D11;">✓ Ajouter la séance</button>
    </div>
  </div>`;
  overlay.onclick = e => { if(e.target === overlay) closeModal(); };
  _lockBodyScroll();
  mc.appendChild(overlay);
  // Déclencher l'affichage du bon formulaire dès l'ouverture
  onAddTypeChange(ws);
}

function onAddTypeChange(ws){
  const type = (document.getElementById('add-type') || {}).value || 'ef';
  if(!ws) { const t=document.getElementById('add-type'); if(!t) return; }
  const container = document.getElementById('add-fields-container');
  if (!container) return;

  if (type === 'tempo') {
    container.innerHTML = `
      <div class="modal-section" style="background:linear-gradient(135deg,#EEF2FD,#E8EDFF);">
        <div class="modal-section-label" style="color:#1B4FD8;">📅 Planification</div>
        ${buildSchedFieldsHtml('', '')}
      </div>`
      + buildTempoFieldsHtml('add', 2, 8, '3:00',
          getBestEfPace() ? '5:00' : '5:00',
          getBestEfPace() ? '5:20' : '5:20', '#E8530A');
    setTimeout(() => { calcEfRestantForPrefix('add'); selectTempoEfPace('add', document.getElementById('add-ef-pace')?.value||getBestEfPace()||'6:40'); }, 50);

  } else if (type === 'frac') {
    container.innerHTML = `
      <div class="modal-section" style="background:linear-gradient(135deg,#EEF2FD,#E8EDFF);">
        <div class="modal-section-label" style="color:#1B4FD8;">📅 Planification</div>
        ${buildSchedFieldsHtml('', '')}
      </div>`
      + buildTempoFieldsHtml('add', 6, 2, '2:00',
          getBestEfPace() ? '4:30' : '4:30',
          getBestEfPace() ? '4:50' : '4:50', '#C4141B');
    setTimeout(() => { calcEfRestantForPrefix('add'); selectTempoEfPace('add', document.getElementById('add-ef-pace')?.value||getBestEfPace()||'6:40'); }, 50);

  } else if (type === 'long') {
    container.innerHTML = `
      <div class="modal-section" style="background:linear-gradient(135deg,#EEF2FD,#E8EDFF);">
        <div class="modal-section-label" style="color:#1B4FD8;">📅 Planification</div>
        ${buildSchedFieldsHtml('', '')}
      </div>`
      + buildLongModalHtml('');
    setTimeout(() => renderLongBlocks(), 0);

  } else {
    // EF — section redesignée
    const efPace = getBestEfPace() || '6:40';
    const efPaces = ["6:20","6:10","6:00","5:50","5:40","5:30"];
    const paceChips = efPaces.map(p =>
      `<button type="button" id="add-ef-chip-${p.replace(':','-')}" onclick="selectAddEfPace('${p}')" class="modal-chip">${p}</button>`
    ).join('');
    container.innerHTML = `
      <div class="modal-section" style="background:linear-gradient(135deg,#EEF2FD,#E8EDFF);">
        <div class="modal-section-label" style="color:#1B4FD8;">📅 Planification</div>
        ${buildSchedFieldsHtml('', '')}
      </div>
      <div class="modal-section" style="--_accent:#3B6D11;">
        <div class="modal-section-label" style="color:#3B6D11;">🟢 Allure cible</div>
        <div style="display:flex;align-items:stretch;gap:12px;margin-bottom:16px;">
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;">
            <input type="text" id="add-ef-pace" value="${efPace}" placeholder="6:40" maxlength="5"
              oninput="updateAddEfPreview()"
              style="background:var(--bg);border:3px solid #3B6D11;border-radius:14px;padding:14px 12px;font-size:32px;font-weight:900;color:#3B6D11;width:108px;outline:none;text-align:center;line-height:1;">
            <p style="font-size:9px;color:#3B6D11;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;">/km</p>
          </div>
          <div style="flex:1;background:#EAF3DE;border-radius:14px;padding:14px;display:flex;flex-direction:column;justify-content:center;gap:6px;">
            <div>
              <p style="font-size:9px;font-weight:800;color:#3B6D11;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">💓 Zone cible</p>
              <p style="font-size:16px;font-weight:900;color:#2D5A0E;">${(()=>{const z=getFcMaxZone();return z?z.min+'–'+z.max+' bpm':'—';})()}</p>
            </div>
            <div>
              <p style="font-size:9px;font-weight:800;color:#3B6D11;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">⏱ Durée estimée</p>
              <p style="font-size:18px;font-weight:900;color:#2D5A0E;" id="add-ef-preview-time">—</p>
            </div>
          </div>
        </div>
        <p style="font-size:9px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Raccourcis allure</p>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">${paceChips}</div>
      </div>
      <input type="hidden" id="add-detail" value="">`;
    setTimeout(() => updateAddEfPreview(), 50);
  }
}

function onAddTypePill(type, ws) {
  // Mettre à jour l'input caché
  const typeInput = document.getElementById('add-type');
  if(typeInput) typeInput.value = type;

  // Mettre à jour les pills
  const colors = {ef:'#3B6D11', tempo:'#E8530A', frac:'#C4141B', long:'#534AB7'};
  ['ef','tempo','frac','long'].forEach(t => {
    const pill = document.getElementById('add-pill-'+t);
    if(!pill) return;
    const active = t === type;
    pill.style.background = active ? colors[t] : 'var(--bg2)';
    pill.style.color = active ? '#fff' : 'var(--muted)';
    pill.style.borderColor = active ? colors[t] : 'var(--border)';
  });

  // Mettre à jour le header
  const hdr = document.getElementById('add-modal-header');
  const hdrTitle = document.getElementById('add-header-title');
  const submitBtn = document.getElementById('add-submit-btn');
  const titles = {ef:'Endurance Fondamentale', tempo:'Tempo — Intervalles', frac:'Fractionné', long:'Sortie Longue'};
  const headerClasses = {ef:'modal-header-ef', tempo:'modal-header-tempo', frac:'modal-header-frac', long:'modal-header-long'};
  const btnColors = {ef:'#3B6D11', tempo:'#E8530A', frac:'#C4141B', long:'#534AB7'};
  if(hdr) {
    hdr.className = 'modal-header ' + (headerClasses[type] || 'modal-header-default');
  }
  if(hdrTitle) hdrTitle.textContent = titles[type] || type;
  if(submitBtn) submitBtn.style.background = btnColors[type] || '#1B4FD8';

  // Mettre à jour les champs
  onAddTypeChange(ws);
}

function selectAddEfPace(p){
  const inp = document.getElementById('add-ef-pace');
  if(inp){ inp.value = p; updateAddEfPreview(); }
  // Mettre à jour les chips
  document.querySelectorAll('[id^="add-ef-chip-"]').forEach(b => {
    b.style.background = 'var(--bg2)'; b.style.color = 'var(--muted)';
    b.style.borderColor = 'var(--border)';
  });
  const chip = document.getElementById('add-ef-chip-' + p.replace(':','-'));
  if(chip){ chip.style.background='var(--blue)'; chip.style.color='#fff'; chip.style.borderColor='var(--blue)'; }
}

function updateAddEfPreview(){
  const paceInp = document.getElementById('add-ef-pace');
  const kmInp = document.getElementById('add-km');
  const timeEl = document.getElementById('add-ef-preview-time');
  if(!paceInp || !timeEl) return;
  const parts = paceInp.value.split(':');
  const km = parseFloat(kmInp ? kmInp.value : 0) || 0;
  const sec = parseInt(parts[0]||0)*60 + parseInt(parts[1]||0);
  if(sec > 0 && km > 0){
    const total = Math.round(km * sec);
    const m = Math.floor(total/60), s = total%60;
    timeEl.textContent = m + 'min' + (s>0?' '+String(s).padStart(2,'0')+'s':'');
  } else {
    timeEl.textContent = '—';
  }
  // Mettre à jour le detail caché
  const detailEl = document.getElementById('add-detail');
  if(detailEl) detailEl.value = paceInp.value + ' /km';
}


function onEditTypeChange(){
  const type=document.getElementById('edit-type').value;
  const container=document.getElementById('edit-fields-container');
  if(!container) return;
  if(type==='tempo'){
    container.innerHTML=buildTempoFieldsHtml('edit',2,8,'3:00','5:00','5:20','#E8530A')
      +`<div style="background:var(--bg2);border-radius:var(--radius-sm);padding:8px 12px;display:flex;align-items:center;gap:10px;">
        <input type="checkbox" id="edit-apply-format" style="width:18px;height:18px;cursor:pointer;accent-color:#E8530A;">
        <label for="edit-apply-format" style="font-size:12px;color:var(--text);cursor:pointer;">Appliquer ce format à toutes les Tempo suivantes</label>
      </div>
      <div style="background:var(--bg2);border-radius:var(--radius-sm);padding:8px 12px;display:flex;align-items:center;gap:10px;">
        <input type="checkbox" id="edit-apply-all" style="width:18px;height:18px;cursor:pointer;accent-color:#E8530A;">
        <label for="edit-apply-all" style="font-size:12px;color:var(--text);cursor:pointer;">Appliquer cette allure à toutes les Tempo suivantes</label>
      </div>`;
  } else if(type==='frac'){
    container.innerHTML=buildTempoFieldsHtml('edit',6,2,'2:00','4:30','4:50','#C4141B');
  } else if(type==='long'){
    container.innerHTML=buildLongModalHtml('');
    setTimeout(()=>renderLongBlocks(),0);
  } else {
    container.innerHTML=`<div>
      <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Nom de la séance</p>
      <input type="text" id="edit-name" value="" style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 12px;font-size:14px;color:var(--text);width:100%;outline:none;">
    </div>
    <div>
      <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Détail allure (optionnel)</p>
      <input type="text" id="edit-detail" value="" placeholder="ex: 10 EF · 3 AM @ 5:40/km" style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 12px;font-size:14px;color:var(--text);width:100%;outline:none;">
    </div>`;
  }
}


function saveAdd(ws){
  const typeEl = document.getElementById('add-type');
  const kmEl   = document.getElementById('add-km');
  const shoeEl = document.getElementById('add-shoe');
  const type = typeEl ? typeEl.value : 'ef';
  const km   = parseFloat(kmEl ? kmEl.value : 0) || 0;
  const shoe = shoeEl && shoeEl.value ? shoeEl.value : null;

  if(!type){ showAddError('Choisissez un type.'); return; }
  if(!km || km <= 0){ showAddError('Entrez une distance en km.'); return; }
  if(!shoe && getShoes().length>0){ showAddError('Choisissez une paire de chaussures.'); return; }

  // Planning (sched_day + sched_time) — commun à tous les types
  const schedDay  = parseInt((document.getElementById('sched-day')  || {}).value) || undefined;
  const schedHour = (document.getElementById('sched-hour') || {}).value;
  const schedMin  = (document.getElementById('sched-min')  || {}).value;
  const schedTime = schedDay && schedHour!=null
    ? (String(schedHour).padStart(2,'0') + ':' + String(schedMin||'00').padStart(2,'0'))
    : undefined;

  let name = '', detail = '';
  if(type === 'long'){
    const blocks = getLongBlocksData();
    name = 'EF longue';
    if(blocks.length > 0){
      const total = Math.round(blocks.reduce((a,b) => a+b.km, 0) * 10) / 10;
      if(Math.abs(total - km) >= 0.1){ showAddError('Total des blocs (' + total + ' km) ≠ distance (' + km + ' km). Ajuste les blocs.'); return; }
      detail = buildLongDetail(blocks);
    }
  } else if(type === 'tempo'){
    const reps = parseInt((document.getElementById('add-reps')     || {}).value) || 2;
    const dur  = parseInt((document.getElementById('add-dur')      || {}).value) || 8;
    const pMin = ((document.getElementById('add-pace-min') || {}).value || '5:00').trim();
    const pMax = ((document.getElementById('add-pace-max') || {}).value || '5:20').trim();
    const recup = ((document.getElementById('add-recup')   || {}).value || '3:00').trim();
    const efP  = ((document.getElementById('add-ef-pace')  || {}).value || '').trim();
    name   = 'Tempo ' + reps + '×' + dur + ' min';
    detail = pMin + ' — ' + pMax + ' /km';
    if(recup && recup !== '0' && reps > 1) detail += ' · ' + recup + ' min récup';
    if(efP) detail += ' · EF @ ' + efP;
  } else if(type === 'frac'){
    const reps = parseInt((document.getElementById('add-reps')     || {}).value) || 6;
    const dur  = parseInt((document.getElementById('add-dur')      || {}).value) || 2;
    const pMin = ((document.getElementById('add-pace-min') || {}).value || '4:30').trim();
    const pMax = ((document.getElementById('add-pace-max') || {}).value || '4:50').trim();
    const recup = ((document.getElementById('add-recup')   || {}).value || '3:00').trim();
    const efP  = ((document.getElementById('add-ef-pace')  || {}).value || '').trim();
    name   = 'Fractionné ' + reps + '×' + dur + ' min';
    detail = pMin + ' — ' + pMax + ' /km';
    if(recup && recup !== '0' && reps > 1) detail += ' · ' + recup + ' min récup';
    if(efP) detail += ' · EF @ ' + efP;
  } else {
    // EF
    const efPaceEl = document.getElementById('add-ef-pace');
    const efPace = efPaceEl ? efPaceEl.value.trim() : (getBestEfPace() || '6:40');
    name   = 'Séance EF';
    detail = efPace + '/km';
  }

  const d = detail ? (name + '|' + detail) : name;
  let ei = 0;
  while(state['extra_w' + ws + '_s' + ei]) ei++;
  const extraData = { d, km, type, shoe };
  if(schedDay)  extraData.sched_day  = schedDay;
  if(schedTime) extraData.sched_time = schedTime;
  state['extra_w' + ws + '_s' + ei] = JSON.stringify(extraData);
  save();
  closeModal();
  rendered.plan=false;
  rendered.stats=false;
  renderPlan();
  renderHome();
  if(_adminPreviewUid) _refreshAthleteCoachView();
}

function showAddError(msg){
  const existing=document.getElementById('add-error');
  if(existing) existing.remove();
  const btn=document.querySelector('[onclick^="saveAdd"]');
  if(!btn) return;
  const err=document.createElement('p');
  err.id='add-error';
  err.style.cssText='color:#E24B4A;font-size:12px;text-align:center;margin-top:8px;';
  err.textContent='⚠ '+msg;
  btn.parentNode.insertBefore(err,btn.nextSibling);
}

function onExEditTypeChange(){
  const type=document.getElementById('exedit-type').value;
  const container=document.getElementById('exedit-fields-container');
  if(!container) return;
  if(type==='long'){
    const detailInput=document.getElementById('exedit-detail');
    const existingDetail=detailInput?detailInput.value:'';
    container.innerHTML=buildLongModalHtml(existingDetail);
    renderLongBlocks();
  } else if(type==='tempo'){
    container.innerHTML=buildTempoFieldsHtml('exedit',2,8,'3:00','5:00','5:20','#E8530A');
  } else if(type==='frac'){
    container.innerHTML=buildTempoFieldsHtml('exedit',6,2,'2:00','4:30','4:50','#C4141B');
  } else {
    // EF — même pace picker que openEditModal
    const efPaceVal=getBestEfPace()||'6:40';
    const efPaces=["6:25","6:20","6:15","6:10","6:05","6:00","5:55","5:50","5:45","5:40","5:35","5:30"];
    const paceChips=efPaces.map(p=>`<button type="button" id="exedit-ef-chip-${p.replace(':','-')}" onclick="selectExEditEfPace('${p}')" style="padding:7px 11px;border-radius:20px;font-size:12px;font-weight:600;border:1.5px solid var(--border);background:var(--bg2);color:var(--muted);cursor:pointer;transition:all 0.15s;">${p}</button>`).join('');
    container.innerHTML=`
      <div class="modal-section" style="--_accent:#3B6D11;">
        <div class="modal-section-label" style="color:#3B6D11;">🟢 Allure cible</div>
        <div style="display:flex;align-items:stretch;gap:12px;margin-bottom:16px;">
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
            <input type="text" id="exedit-ef-pace" value="${efPaceVal}" placeholder="6:40" maxlength="5"
              oninput="updateExEditEfPreview()"
              style="background:var(--bg);border:3px solid #3B6D11;border-radius:14px;padding:14px 12px;font-size:32px;font-weight:900;color:#3B6D11;width:108px;outline:none;text-align:center;line-height:1;">
            <p style="font-size:9px;color:#3B6D11;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;">/km</p>
          </div>
          <div style="flex:1;background:#EAF3DE;border-radius:14px;padding:14px;display:flex;flex-direction:column;justify-content:center;gap:6px;">
            <div>
              <p style="font-size:9px;font-weight:800;color:#3B6D11;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">💓 Zone cible</p>
              <p style="font-size:16px;font-weight:900;color:#2D5A0E;">${(()=>{const z=getFcMaxZone();return z?z.min+'–'+z.max+' bpm':'—';})()}</p>
            </div>
            <div>
              <p style="font-size:9px;font-weight:800;color:#3B6D11;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">⏱ Durée estimée</p>
              <p style="font-size:18px;font-weight:900;color:#2D5A0E;" id="exedit-ef-preview-time">—</p>
            </div>
          </div>
        </div>
        <p style="font-size:9px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Raccourcis allure</p>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">${paceChips}</div>
      </div>`;
  }
}

function openEditExtraModal(ws, ei){
  const s=JSON.parse(state[`extra_w${ws}_s${ei}`]);
  const parts=s.d.split('|');
  const title=parts[0], detail=parts[1]||'';
  const mc=document.getElementById('modal-container');
  const shoeOptions=getShoeOptions(s.shoe);
  const typeOptions=['ef','tempo','frac','long','race'].map(t=>
    `<option value="${t}" ${s.type===t?'selected':''}>${typeLabel[t]}</option>`
  ).join('');

  // Champs selon le type
  let fieldsHtml='';
  if(s.type==='long'){
    fieldsHtml=buildLongModalHtml(detail);
  } else if(s.type==='tempo'||s.type==='frac'){
    const repMatch=title.match(/(\d+)×(\d+)/);
    const defReps=s.type==='frac'?6:2;
    const defDur=s.type==='frac'?2:8;
    const defPMin=s.type==='frac'?'4:30':'5:00';
    const defPMax=s.type==='frac'?'4:50':'5:20';
    const exReps=repMatch?parseInt(repMatch[1]):defReps;
    const exDur=repMatch?parseInt(repMatch[2]):defDur;
    // Extraire l'allure cible depuis "X'XX/km", "X:XX/km", "X:XX — Y:YY /km" ou "X:XX /km"
    const paceRangeMatchEx=detail.match(/(\d+)['':](\d+)\s*[–—-]\s*(\d+)['':](\d+)\s*\/km/);
    const paceKmMatchEx=paceRangeMatchEx?null:detail.match(/(\d+)['':](\d+)\s*\/km/);
    const exPMin=paceRangeMatchEx?paceRangeMatchEx[1]+':'+paceRangeMatchEx[2]:paceKmMatchEx?paceKmMatchEx[1]+':'+paceKmMatchEx[2]:defPMin;
    const exPMax=paceRangeMatchEx?paceRangeMatchEx[3]+':'+paceRangeMatchEx[4]:(()=>{const sx=paceKmMatchEx?parseInt(paceKmMatchEx[1])*60+parseInt(paceKmMatchEx[2]):null;return sx?Math.floor((sx+10)/60)+':'+((sx+10)%60<10?'0':'')+((sx+10)%60):defPMax;})();
    const recupMatch=detail.match(/([\d:]+)\s*min\s*r[eé]cup/i);
    const exRecup=recupMatch?parseInt(recupMatch[1]):'3:00';
    const accentCol=s.type==='frac'?'#C4141B':'#E8530A';
    fieldsHtml=buildTempoFieldsHtml('exedit',exReps,exDur,exRecup,exPMin,exPMax,accentCol);
  } else {
    // EF — même pace picker que openEditModal
    const paceMatch2=detail.match(/(\d+)[':](\d+)/);
    const efPaceVal=paceMatch2?paceMatch2[1]+':'+paceMatch2[2]:(getBestEfPace()||'6:40');
    const efPaces=["6:25","6:20","6:15","6:10","6:05","6:00","5:55","5:50","5:45","5:40","5:35","5:30"];
    const paceChips=efPaces.map(p=>`<button type="button" id="exedit-ef-chip-${p.replace(':','-')}" onclick="selectExEditEfPace('${p}')" style="padding:7px 11px;border-radius:20px;font-size:12px;font-weight:600;border:1.5px solid var(--border);background:var(--bg2);color:var(--muted);cursor:pointer;transition:all 0.15s;">${p}</button>`).join('');
    fieldsHtml=`
      <div class="modal-section" style="--_accent:#3B6D11;">
        <div class="modal-section-label" style="color:#3B6D11;">🟢 Allure cible</div>
        <div style="display:flex;align-items:stretch;gap:12px;margin-bottom:16px;">
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
            <input type="text" id="exedit-ef-pace" value="${efPaceVal}" placeholder="6:40" maxlength="5"
              oninput="updateExEditEfPreview()"
              style="background:var(--bg);border:3px solid #3B6D11;border-radius:14px;padding:14px 12px;font-size:32px;font-weight:900;color:#3B6D11;width:108px;outline:none;text-align:center;line-height:1;">
            <p style="font-size:9px;color:#3B6D11;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;">/km</p>
          </div>
          <div style="flex:1;background:#EAF3DE;border-radius:14px;padding:14px;display:flex;flex-direction:column;justify-content:center;gap:6px;">
            <div>
              <p style="font-size:9px;font-weight:800;color:#3B6D11;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">💓 Zone cible</p>
              <p style="font-size:16px;font-weight:900;color:#2D5A0E;">${(()=>{const z=getFcMaxZone();return z?z.min+'–'+z.max+' bpm':'—';})()}</p>
            </div>
            <div>
              <p style="font-size:9px;font-weight:800;color:#3B6D11;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">⏱ Durée estimée</p>
              <p style="font-size:18px;font-weight:900;color:#2D5A0E;" id="exedit-ef-preview-time">—</p>
            </div>
          </div>
        </div>
        <p style="font-size:9px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Raccourcis allure</p>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">${paceChips}</div>
      </div>`;
  }

  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.style.setProperty('--_overlay-bg','rgba(0,0,0,0.4)');
  const _typeColors={ef:'modal-header-ef',tempo:'modal-header-tempo',frac:'modal-header-frac',long:'modal-header-long'};
  const _hcls=_typeColors[s.type]||'modal-header-default';
  const _hacc={ef:'#3B6D11',tempo:'#E8530A',frac:'#C4141B',long:'#534AB7'}[s.type]||'#1B4FD8';
  overlay.innerHTML=`<div class="modal-box" style="max-height:92vh;">
    <div class="modal-header ${_hcls}" style="flex-shrink:0;">
      <div style="width:36px;height:4px;border-radius:4px;background:rgba(255,255,255,0.3);margin:0 auto 12px;"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div style="flex:1;min-width:0;">
          <p style="font-size:10px;font-weight:800;opacity:0.7;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:3px;color:#fff;">S${ws} · Modifier la séance</p>
          <p style="font-size:20px;font-weight:900;letter-spacing:-0.02em;line-height:1.1;color:#fff;">${title}</p>
          ${detail?`<p style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:3px;">${detail}</p>`:''}
        </div>
        <button onclick="closeModal()" style="background:rgba(255,255,255,0.2);border:none;cursor:pointer;color:#fff;font-size:18px;line-height:1;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">×</button>
      </div>
    </div>
    <div class="modal-scroll-body">
    <div class="modal-body" style="gap:0;">
      <div class="modal-section" style="background:linear-gradient(135deg,#EEF2FD,#E8EDFF);">
        <div class="modal-section-label" style="color:#1B4FD8;">📅 Planification</div>
        ${buildSchedFieldsHtml(s.sched_day||'', s.sched_time||'')}
      </div>
      <div id="exedit-fields-container" class="modal-section">${fieldsHtml}</div>
      <div class="modal-section">
        <div class="modal-section-label">📏 Distance & chaussures</div>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:14px;align-items:center;margin-bottom:10px;">
          <div style="text-align:center;">
            <div style="display:flex;align-items:center;gap:6px;">
              <button type="button" onclick="const el=document.getElementById('exedit-km');el.value=Math.max(0,parseFloat(el.value||0)-1);" style="width:30px;height:30px;border-radius:50%;border:1.5px solid var(--border);background:var(--bg);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">−</button>
              <input type="number" id="exedit-km" value="${s.km}" min="0" max="99" step="1" oninput="calcEfRestantForPrefix('exedit')" style="background:var(--bg);border:2px solid ${_hacc}40;border-radius:10px;padding:8px;font-size:22px;font-weight:800;color:${_hacc};width:66px;outline:none;text-align:center;">
              <button type="button" onclick="const el=document.getElementById('exedit-km');el.value=Math.min(99,parseFloat(el.value||0)+1);" style="width:30px;height:30px;border-radius:50%;border:1.5px solid var(--border);background:var(--bg);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">+</button>
            </div>
            <p style="font-size:9px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-top:4px;">km</p>
          </div>
          <div>
            <p style="font-size:9px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:6px;">👟 Chaussures</p>
            <select id="exedit-shoe" style="background:var(--bg);border:2px solid var(--border);border-radius:12px;padding:10px 12px;font-size:13px;font-weight:700;color:var(--text);width:100%;outline:none;cursor:pointer;">${shoeOptions}</select>
          </div>
        </div>
        <div>
          <p style="font-size:9px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:6px;">🏷 Type</p>
          <select id="exedit-type" onchange="onExEditTypeChange()" style="background:var(--bg);border:2px solid var(--border);border-radius:12px;padding:10px 12px;font-size:13px;font-weight:700;color:var(--text);width:100%;outline:none;cursor:pointer;">${typeOptions}</select>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px;">
        <button onclick="closeModal()" style="padding:14px;background:var(--bg2);border:2px solid var(--border);border-radius:14px;font-size:13px;font-weight:700;color:var(--muted);cursor:pointer;">Annuler</button>
        <button onclick="saveExtraEdit(${ws},${ei})" class="modal-btn-primary" style="background:${_hacc};">Enregistrer ✓</button>
      </div>
      <button onclick="deleteExtra(${ws},${ei})" style="width:100%;margin-top:10px;padding:13px;background:transparent;border:2px solid #E24B4A33;border-radius:14px;font-size:13px;font-weight:700;color:#E24B4A;cursor:pointer;">🗑 Supprimer cette séance</button>
    </div>
    </div><!-- /modal-scroll-body -->
  </div>`;
  overlay.onclick=e=>{if(e.target===overlay)closeModal();};
  _lockBodyScroll();
  mc.appendChild(overlay);
  _initSwipeToDismiss(overlay, overlay.querySelector('.modal-box'));
  if(s.type==='long') renderLongBlocks();
  if(s.type==='tempo'||s.type==='frac') setTimeout(()=>{ calcEfRestantForPrefix('exedit'); selectTempoEfPace('exedit', document.getElementById('exedit-ef-pace')?.value||getBestEfPace()||'6:40'); }, 50);
}

function saveExtraEdit(ws, ei){
  const type=document.getElementById('exedit-type').value;
  const km=parseFloat(document.getElementById('exedit-km').value)||0;
  const shoe=document.getElementById('exedit-shoe').value||null;
  let name='', detail='';
  if(type==='long'){
    const existing=JSON.parse(state[`extra_w${ws}_s${ei}`]);
    name=existing.d.split('|')[0]||'EF longue';
    const blocks=getLongBlocksData();
    if(blocks.length>0){
      const bTotal=Math.round(blocks.reduce((a,b)=>a+b.km,0)*10)/10;
      if(Math.abs(bTotal-km)>=0.1){alert('Total des blocs ('+bTotal+' km) ≠ distance planifiée ('+km+' km). Ajuste les blocs.');return;}
      detail=buildLongDetail(blocks);
    }
  } else if(type==='tempo'||type==='frac'){
    const reps=parseInt((document.getElementById('exedit-reps')||{}).value)||(type==='frac'?6:2);
    const dur=parseInt((document.getElementById('exedit-dur')||{}).value)||(type==='frac'?2:8);
    name=type==='frac'?`Fractionné ${reps}×${dur} min`:`Tempo ${reps}×${dur} min`;
    const pMin=((document.getElementById('exedit-pace-min')||{}).value||'').trim();
    const pMax=((document.getElementById('exedit-pace-max')||{}).value||'').trim();
    if(pMin&&pMax) detail=`${pMin} — ${pMax} /km`;
    else detail=type==='frac'?'4:30 — 4:50 /km':'5:00 — 5:20 /km';
    const recup=((document.getElementById('exedit-recup')||{}).value||'').trim();
    if(recup&&recup!=='0'&&reps>1) detail=detail+` · ${recup} min récup`;
    const exEditEfPace=((document.getElementById('exedit-ef-pace')||{}).value||'').trim().replace("'",":");
    if(exEditEfPace&&exEditEfPace.match(/\d+:\d+/)) detail=detail+` · EF @ ${exEditEfPace}`;
  } else {
    // EF — lire depuis le pace picker (exedit-ef-pace), format identique à saveEdit
    const efPaceEl=document.getElementById('exedit-ef-pace');
    const efPaceStr=efPaceEl?efPaceEl.value.trim():'';
    const existing3=JSON.parse(state[`extra_w${ws}_s${ei}`]||'{}');
    name=existing3.d.split('|')[0]||'Séance EF';
    detail=efPaceStr?efPaceStr+'/km':'';  // même format que saveEdit
  }
  const d=detail?`${name}|${detail}`:name;
  const existing2 = JSON.parse(state[`extra_w${ws}_s${ei}`]||'{}');
  const updatedExtra = {d, km, type, shoe};
  // Sauvegarder le créneau depuis le formulaire (buildSchedFieldsHtml génère sched-day/sched-hour/sched-min)
  const newSchedDay = parseInt((document.getElementById('sched-day')||{}).value)||undefined;
  const newSchedH   = (document.getElementById('sched-hour')||{}).value;
  const newSchedM   = (document.getElementById('sched-min') ||{}).value;
  if(newSchedDay){
    updatedExtra.sched_day  = newSchedDay;
    updatedExtra.sched_time = String(newSchedH||'08').padStart(2,'0')+':'+String(newSchedM||'00').padStart(2,'0');
  } else if(existing2.sched_day) {
    // Pas de nouveau créneau saisi → conserver l'ancien
    updatedExtra.sched_day  = existing2.sched_day;
    updatedExtra.sched_time = existing2.sched_time;
  }
  state[`extra_w${ws}_s${ei}`]=JSON.stringify(updatedExtra);
  save();closeModal();rendered.plan=false;rendered.stats=false;renderPlan();renderHome();
  if(_adminPreviewUid) _refreshAthleteCoachView();
}

function selectExEditEfPace(p){
  const inp=document.getElementById('exedit-ef-pace');
  if(inp){inp.value=p;updateExEditEfPreview();}
  document.querySelectorAll('[id^="exedit-ef-chip-"]').forEach(b=>{
    const sel=b.id==='exedit-ef-chip-'+p.replace(':','-');
    b.style.background=sel?'#3B6D11':'var(--bg2)';
    b.style.color=sel?'#fff':'var(--muted)';
    b.style.borderColor=sel?'#3B6D11':'var(--border)';
  });
}
function updateExEditEfPreview(){
  const paceInp=document.getElementById('exedit-ef-pace');
  const kmInp=document.getElementById('exedit-km');
  const timeEl=document.getElementById('exedit-ef-preview-time');
  if(!paceInp||!timeEl) return;
  const parts2=paceInp.value.split(':');
  const km2=parseFloat(kmInp?kmInp.value:0)||0;
  const sec2=parseInt(parts2[0]||0)*60+parseInt(parts2[1]||0);
  if(sec2>0&&km2>0){
    const total=Math.round(km2*sec2);
    const m2=Math.floor(total/60),s2=total%60;
    timeEl.textContent=m2+'min'+(s2>0?' '+String(s2).padStart(2,'0')+'s':'');
  } else { timeEl.textContent='—'; }
}

function deleteExtra(ws, ei){
  delete state[`extra_w${ws}_s${ei}`];
  save();closeModal();rendered.plan=false;rendered.stats=false;renderPlan();renderHome();
  if(_adminPreviewUid) _refreshAthleteCoachView();
}


function updateShoeMax(name, val){
  const arr=getShoes();
  const sh=arr.find(s=>s.name===name);
  if(sh){sh.max=parseInt(val)||600;saveShoes(arr);rendered.stats=false;renderStats();}
}
function deleteShoe(name){
  if(!confirm(`Supprimer "${name}" ?`)) return;
  const arr=getShoes().filter(s=>s.name!==name);
  saveShoes(arr);
  rendered.stats=false;
  renderStats();
  renderHome();
}
function _shoeModalHtml({title, namePlaceholder='ex: Nike Pegasus 41', nameVal='', color='#1438A8', maxVal=600, saveBtn, colors=['#1438A8','#E8530A','#3B6D11','#534AB7','#D4537E','#C4960A','#888780','#0C447C']}){
  const colorBtns=colors.map(c=>`<button type="button" onclick="selectShoeColor('${c}')" id="sc-${c.replace('#','')}"
    style="width:36px;height:36px;border-radius:50%;background:${c};border:3px solid ${c===color?'#fff':'transparent'};cursor:pointer;transition:all 0.15s;box-shadow:${c===color?'0 0 0 2px '+c:'none'};flex-shrink:0;"
    ></button>`).join('');
  const maxOptions=[400,500,600,700,800,1000];
  const maxBtns=maxOptions.map(v=>`<button type="button" onclick="selectShoeMax(${v})" id="sm-${v}"
    style="flex:1;padding:8px 4px;border-radius:10px;border:1.5px solid ${v===maxVal?'#1B4FD8':'var(--border)'};background:${v===maxVal?'#EEF2FD':'var(--bg2)'};color:${v===maxVal?'#1B4FD8':'var(--muted)'};font-size:12px;font-weight:700;cursor:pointer;">
    ${v}</button>`).join('');
  return `<div class="modal-box" style="max-height:90vh;overflow-y:auto;">
    <div style="background:linear-gradient(135deg,#0C447C,#1B4FD8);padding:20px 20px 16px;border-radius:var(--radius) var(--radius) 0 0;flex-shrink:0;">
      <div style="width:36px;height:4px;border-radius:4px;background:rgba(255,255,255,0.3);margin:0 auto 14px;"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <p style="font-size:10px;font-weight:800;opacity:0.7;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px;color:#fff;">👟 Chaussures</p>
          <p style="font-size:20px;font-weight:900;letter-spacing:-0.02em;color:#fff;">${title}</p>
        </div>
        <button onclick="closeModal()" style="background:rgba(255,255,255,0.2);border:none;cursor:pointer;color:#fff;font-size:18px;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">×</button>
      </div>
      <div id="shoe-preview-strip" style="margin-top:14px;height:6px;border-radius:4px;background:rgba(255,255,255,0.2);overflow:hidden;">
        <div id="shoe-preview-bar" style="height:100%;width:100%;background:${color};border-radius:4px;transition:background 0.2s;"></div>
      </div>
    </div>
    <div style="padding:16px;display:flex;flex-direction:column;gap:14px;">
      <div>
        <p style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;">Nom</p>
        <input type="text" id="new-shoe-name" placeholder="${namePlaceholder}" value="${nameVal}"
          style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:12px 14px;font-size:16px;font-weight:600;color:var(--text);width:100%;outline:none;box-sizing:border-box;"
          oninput="document.getElementById('shoe-preview-bar')&&(document.getElementById('shoe-preview-bar').style.background=document.getElementById('new-shoe-color').value)">
      </div>
      <div>
        <p style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em;">Couleur</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;" id="shoe-color-picker">${colorBtns}</div>
        <input type="hidden" id="new-shoe-color" value="${color}">
      </div>
      <div>
        <p style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Durée de vie (km)</p>
        <p style="font-size:11px;color:var(--muted);margin-bottom:8px;">Distance maximale recommandée par le fabricant</p>
        <div style="display:flex;gap:6px;" id="shoe-max-picker">${maxBtns}</div>
        <input type="hidden" id="new-shoe-max" value="${maxVal}">
      </div>
      <p id="shoe-add-error" style="display:none;color:#E24B4A;font-size:12px;text-align:center;margin:0;"></p>
      <button onclick="${saveBtn}" style="width:100%;padding:14px;background:#1B4FD8;border:none;border-radius:14px;font-size:15px;font-weight:800;color:#fff;cursor:pointer;letter-spacing:-0.01em;">${title}</button>
    </div>
  </div>`;
}

function openAddShoeModal(){
  const mc=document.getElementById('modal-container');
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.style.setProperty('--_overlay-bg','rgba(0,0,0,0.4)');
  overlay.innerHTML=_shoeModalHtml({title:'Nouvelle paire', saveBtn:'saveNewShoe()'});
  overlay.onclick=e=>{if(e.target===overlay)closeModal();};
  _lockBodyScroll();
  mc.appendChild(overlay);
  _initSwipeToDismiss(overlay, overlay.querySelector('.modal-box'));
  selectShoeColor('#1438A8');
}

function selectShoeColor(c){
  document.getElementById('new-shoe-color').value=c;
  document.querySelectorAll('[id^="sc-"]').forEach(btn=>{
    btn.style.border='3px solid transparent';
    btn.style.boxShadow='none';
  });
  const btn=document.getElementById('sc-'+c.replace('#',''));
  if(btn){ btn.style.border='3px solid #fff'; btn.style.boxShadow='0 0 0 2px '+c; }
  const bar=document.getElementById('shoe-preview-bar');
  if(bar) bar.style.background=c;
}

function selectShoeMax(v){
  document.getElementById('new-shoe-max').value=v;
  document.querySelectorAll('[id^="sm-"]').forEach(btn=>{
    btn.style.background='var(--bg2)'; btn.style.color='var(--muted)'; btn.style.borderColor='var(--border)';
  });
  const btn=document.getElementById('sm-'+v);
  if(btn){ btn.style.background='#EEF2FD'; btn.style.color='#1B4FD8'; btn.style.borderColor='#1B4FD8'; }
}
function openShoeHistory(shoeName){
  const sh=getShoes().find(s=>s.name===shoeName);
  if(!sh) return;
  const sessions=[];
  for(let ws=1;ws<CW;ws++){  // semaines passées uniquement
    const w=weeks[ws-1];
    weeks[ws-1].sessions.forEach((baseSess,si)=>{
      if(state[`del_w${ws}_s${si}`]) return;
      // Récupérer la session (avec modifications éventuelles)
      const s=getSession(ws,si);
      if(s.shoe!==shoeName) return;
      if(s.km===0) return; // ignorer repos
      const dk=gk(ws,si);
      const kmReal=state[dk+'km']!=null?state[dk+'km']:s.km;
      const title=s.d.split('|')[0];
      sessions.push({title,km:kmReal,ws});
    });
    // séances extra
    let ei=0;
    while(state[`extra_w${ws}_s${ei}`]){
      const s=JSON.parse(state[`extra_w${ws}_s${ei}`]);
      if(s.shoe===shoeName && s.km>0){
        sessions.push({title:s.d.split('|')[0],km:s.km,ws});
      }
      ei++;
    }
  }
  // S7 en cours : séances déjà cochées
  const w=weeks[CW-1];
  getOrderedWeekSessions(CW).forEach(({s,si,extra})=>{
    if(s.shoe!==shoeName||s.km===0) return;
    const done=!extra&&(state[gk(CW,si)+'done']||state[gk(CW,si)+'km']!=null);
    if(!done) return;
    const kmReal=(!extra&&state[gk(CW,si)+'km']!=null)?state[gk(CW,si)+'km']:s.km;
    sessions.push({title:s.d.split('|')[0],km:kmReal,ws:CW});
  });

  const mc=document.getElementById('modal-container');
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';

  // Grouper par mois
  const byMonth={};
  sessions.forEach(s=>{
    const month=weeks[s.ws-1].month;
    if(!byMonth[month]) byMonth[month]=[];
    byMonth[month].push(s);
  });

  const rows=sessions.length===0
    ?`<p style="text-align:center;color:var(--muted);font-size:13px;padding:20px 0;">Aucune séance réalisée pour l'instant</p>`
    :Object.entries(byMonth).map(([month,seances])=>`
      <div style="font-size:10px;font-weight:700;color:var(--orange);text-transform:uppercase;letter-spacing:0.08em;padding:10px 0 4px;border-bottom:1px solid var(--border);">${month}</div>
      ${seances.map((s,i)=>`
        <div style="display:grid;grid-template-columns:40px 1fr 45px;align-items:center;gap:8px;padding:9px 0;${i<seances.length-1?'border-bottom:1px solid var(--border)':''}">
          <span style="font-size:11px;font-weight:600;color:var(--muted);">S${s.ws}</span>
          <span style="font-size:13px;color:var(--text);font-weight:500;">${s.title}</span>
          <span style="font-size:13px;font-weight:700;color:var(--text);text-align:right;">${s.km} km</span>
        </div>`).join('')}
    `).join('');
  const totalKm=Math.round(sessions.reduce((a,s)=>a+s.km,0)*10)/10;
  overlay.innerHTML=`<div class="modal-box" style="max-height:85vh;overflow-y:auto;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="width:12px;height:12px;border-radius:50%;background:${sh.color};display:inline-block;"></span>
        <p style="font-size:16px;font-weight:600;color:var(--text);">${shoeName}</p>
      </div>
      <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:24px;line-height:1;">×</button>
    </div>
    <p style="font-size:12px;color:var(--muted);margin-bottom:16px;">${sessions.length} séance${sessions.length>1?'s':''} · ${totalKm} km total</p>
    <div>${rows}</div>
  </div>`;
  overlay.onclick=e=>{if(e.target===overlay)closeModal();};
  _lockBodyScroll();
  mc.appendChild(overlay);
}

function openEditShoeModal(name){
  const arr=getShoes();
  const sh=arr.find(s=>s.name===name);
  if(!sh) return;
  const mc=document.getElementById('modal-container');
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.style.setProperty('--_overlay-bg','rgba(0,0,0,0.4)');
  overlay.innerHTML=_shoeModalHtml({
    title:'Modifier la paire',
    nameVal:sh.name,
    color:sh.color,
    maxVal:sh.max,
    saveBtn:`saveEditShoe('${name}')`
  });
  // Remplacer le hidden id="new-shoe-name" par id="edit-shoe-name" pour saveEditShoe
  const nameInput=overlay.querySelector('#new-shoe-name');
  if(nameInput) nameInput.id='edit-shoe-name';
  overlay.onclick=e=>{if(e.target===overlay)closeModal();};
  _lockBodyScroll();
  mc.appendChild(overlay);
  _initSwipeToDismiss(overlay, overlay.querySelector('.modal-box'));
  selectShoeColor(sh.color);
  selectShoeMax(sh.max);
}

function saveEditShoe(oldName){
  const newName=document.getElementById('edit-shoe-name').value.trim();
  const color=document.getElementById('new-shoe-color').value;
  const max=parseInt(document.getElementById('new-shoe-max').value)||600;
  if(!newName) return;
  const arr=getShoes();
  const sh=arr.find(s=>s.name===oldName);
  if(!sh) return;
  sh.name=newName; sh.color=color; sh.max=max;
  saveShoes(arr);
  closeModal();
  rendered.stats=false;
  renderStats();
  renderHome();
}

function saveNewShoe(){
  const name=document.getElementById('new-shoe-name').value.trim();
  if(!name){
    const err=document.getElementById('shoe-add-error');
    if(err){err.textContent='Donne un nom à la chaussure.';err.style.display='block';}
    return;
  }
  const color=document.getElementById('new-shoe-color').value;
  const max=parseInt(document.getElementById('new-shoe-max').value)||600;
  const arr=getShoes();
  if(arr.find(s=>s.name===name)){
    const err=document.getElementById('shoe-add-error');
    if(err){err.textContent='Cette chaussure existe déjà.';err.style.display='block';}
    return;
  }
  arr.push({name,color,max});
  saveShoes(arr);
  closeModal();
  rendered.stats=false;
  renderStats();
  renderHome();
  setTimeout(checkCoachAlerts, 500);
}

let perfFilter='all';
function setPerfFilter(f){
  perfFilter=f;
  ['all','ef','tempo','frac','long'].forEach(k=>{
    const btn=document.getElementById('pf-'+k);
    if(!btn) return;
    const active=k===f;
    const color=k==='ef'?'#3B6D11':k==='tempo'?'#E8530A':k==='frac'?'#C4141B':k==='long'?'#534AB7':'var(--blue)';
    btn.style.background=active?color:'transparent';
    btn.style.borderColor=active?color:'var(--border)';
    btn.style.color=active?'#fff':'var(--muted)';
  });
  rendered.stats=false;
  renderStats();
}

function togglePerfMonth(id){
  const el=document.getElementById(id);
  const arr=document.getElementById('arr-'+id);
  if(!el) return;
  const open=el.style.display==='none';
  el.style.display=open?'block':'none';
  if(arr) arr.style.transform=open?'rotate(180deg)':'rotate(0)';
}

let chartKm=null;
let chartFcRepos=null;
