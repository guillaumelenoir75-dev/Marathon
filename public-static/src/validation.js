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

