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
      let perf={};try{perf=state[k+'perf']?JSON.parse(state[k+'perf']):{}}catch(e){}
      if(!perf.pace) return;
      const sec=paceStrToSec(perf.pace);
      if(!sec) return;
      history.push({ws,sec,pace:perf.pace,hr:perf.hr?parseInt(perf.hr):null});
    });
    // Extra sessions du même type
    let ei=0;
    while(ei<=20&&state[`extra_w${ws}_s${ei}`]){
      let es;try{es=JSON.parse(state[`extra_w${ws}_s${ei}`]);}catch(e){ei++;continue;}
      if(es.type===type&&state[`extra_w${ws}_s${ei}_done`]){
        let perf={};try{perf=state[`extra_w${ws}_s${ei}_perf`]?JSON.parse(state[`extra_w${ws}_s${ei}_perf`]):{}}catch(e){};
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
  const efMin=fcMax?Math.round(fcMax*0.714):140;
  const efMax=fcMax?Math.round(fcMax*0.755):148;
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
  const isPlaisir=isPlaisirMode();
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
    const tips=isPlaisir
      ?['La règle d\'or de l\'EF : tu dois pouvoir tenir une conversation sans t\'essouffler.','L\'EF construit ta base aérobie — c\'est le socle de toute progression en course à pied.','Régularité > intensité : une sortie EF facile vaut mieux qu\'une sortie trop rapide.','Courir régulièrement en zone basse développe ton endurance naturellement. Continue !']
      :['La règle d\'or de l\'EF : tu dois pouvoir tenir une conversation sans t\'essouffler.','L\'EF construit ta base aérobie — c\'est le socle de toute progression marathon.','Régularité > intensité : une sortie EF facile vaut mieux qu\'une sortie trop rapide.','80 % de ton entraînement devrait être en zone EF — chaque sortie douce compte !'];
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
          else lines.push('⚠️ Variation de '+variation+' sec/km entre les blocs. Essaie de partir un peu moins vite pour finir plus fort — ça s\'appelle le "négatif split" (finir plus vite qu\'on a commencé).');
        }
      }
    }
    if(plannedKm>0){
      if(kmRatio>=0.9) lines.push('📏 Volume bien réalisé : '+realKm+' / '+plannedKm+' km. 👏');
      else lines.push('📏 '+realKm+' km sur '+plannedKm+' km prévus — c\'est normal de ne pas toujours finir le tempo, il vaut mieux s\'arrêter proprement.');
    }
    lines.push(isPlaisir?'💡 Les séances tempo développent ton seuil lactique — c\'est la clé pour progresser en vitesse et en confort de course.':'💡 Les séances tempo développent ton seuil lactique — c\'est la clé pour soutenir l\'allure marathon longtemps.');

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
          let _avgM=Math.floor(avgSec/60);let _avgS=Math.round(avgSec%60);if(_avgS===60){_avgM++;_avgS=0;}const avgStr=_avgM+':'+(_avgS<10?'0':'')+_avgS;
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
      else if(realKm>=25) lines.push('📏 Belle sortie longue de '+realKm+' km ! Ce type de séance est fondamental pour construire ton endurance. 🏅');
      else if(kmRatio<0.8) lines.push('📏 '+realKm+' km sur '+plannedKm+' km prévus. S\'arrêter à temps quand on ressent la fatigue, c\'est la bonne décision — la récupération fait partie de l\'entraînement.');
      else lines.push('📏 '+realKm+' km réalisés (prévu : '+plannedKm+' km). Bien joué !');
    }
    lines.push(isPlaisir?'💡 La sortie longue est la reine de l\'endurance — chaque km en zone EF renforce tes mitochondries et ta résistance à la fatigue. 🏆':'💡 La sortie longue est la reine du marathon — chaque km en zone EF renforce tes mitochondries et ta résistance à la fatigue. 🏆');

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
  if(!mc) return;
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

function showCoachFeedback(s, km, pace, hr, amImproved, idx, meteo, whoopData){

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

  // Données WHOOP si importées (paramètre direct ou perf sauvegardé)
  let _whoopRaw = whoopData || null;
  if(!_whoopRaw && idx != null) {
    // Fallback : lire le perf de la séance planifiée
    try { const _p = state[gk(CW,idx)+'perf'] ? JSON.parse(state[gk(CW,idx)+'perf']) : null; if(_p && _p.whoop) _whoopRaw = _p.whoop; } catch(e){}
  }
  if(_whoopRaw) {
    const _strain = _whoopRaw.workout_strain ?? _whoopRaw.cycle_strain ?? null;
    const _calories = _whoopRaw.workout_calories ?? _whoopRaw.cycle_calories ?? null;
    if(_strain != null || _calories != null) {
      analysisContext.whoop = {
        strain: _strain != null ? parseFloat(parseFloat(_strain).toFixed(1)) : null,
        calories: _calories != null ? Math.round(_calories) : null
      };
    }
  }

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
    const objectifSec = Math.floor(4*3600/42.195); // 341 sec/km = 5'41/km
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
    const sessionTitle = (s.d||'').split('|')[0]||'';
    const isMarcheCourse = sessionTitle.toLowerCase().includes('marche');
    if(s.type==='ef' || s.type==='long') {
      if(isMarcheCourse){
        // Séance marche-course : allure globale inclut les phases marche → forcément lente
        analysisContext.allure_attendue = `Séance marche-course : allure globale inclut les phases de marche — ne pas comparer à une allure de course pure. L'important est de respecter les intervalles et de rester confortable.`;
      } else if(analysisContext.blocs_am && analysisContext.blocs_am.present){
        analysisContext.allure_attendue = `Structure mixte : phases EF à ${efActuelle}/km + ${analysisContext.blocs_am.km_am||'X'} km AM à ${analysisContext.blocs_am.allure_cible_am} — allure globale = moyenne des deux`;
      } else {
        analysisContext.allure_attendue = efActuelle + '/km (allure EF actuelle)';
      }
    } else if(s.type==='tempo' || s.type==='frac') {
      const detail = s.d.split('|')[1]||'';
      const paceMatch = detail.match(/(\d+)[':'](\d+)\s*[—\-]+\s*(\d+)[':'](\d+)/);
      const label = s.type==='frac' ? 'blocs fractionné' : 'blocs tempo';
      if(paceMatch) analysisContext.allure_attendue = paceMatch[1]+':'+paceMatch[2]+' — '+paceMatch[3]+':'+paceMatch[4]+'/km ('+label+')';
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
        let blocsAllureSaisis=[];try{if(idx!=null&&state[gk(CW,idx)+'perf'])blocsAllureSaisis=JSON.parse(state[gk(CW,idx)+'perf']).blocsAllure||[];}catch(e){}

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
      let perf={};try{perf=state[k+'perf']?JSON.parse(state[k+'perf']):{}}catch(e){}
      historyData.push({semaine:ws,type:sess.type,km:state[k+'km']||sess.km,date_reelle:perf.date||null,...perf});
    });
    // Extra sessions
    let ei=0;
    while(ei<=20&&state[`extra_w${ws}_s${ei}`]){
      if(state[`extra_w${ws}_s${ei}_done`]){
        let es;try{es=JSON.parse(state[`extra_w${ws}_s${ei}`]);}catch(e){ei++;continue;}
        let perf={};try{perf=state[`extra_w${ws}_s${ei}_perf`]?JSON.parse(state[`extra_w${ws}_s${ei}_perf`]):{}}catch(e){}
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
    wrap.style.cssText = 'display:block;margin:4px 0 8px;';
    const _timeStr = nowD.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
    // Mini-stats badges colorés selon performance
    const _typeLbl = (window.typeLabel && window.typeLabel[s.type]) || s.type || '';
    const _stats = [];
    const _sessionType = s.type || '';
    const _isEfLong = (_sessionType==='ef'||_sessionType==='long'||_sessionType==='sortie');
    const _isTempo = (_sessionType==='tempo'||_sessionType==='frac'||_sessionType==='race');
    // Couleur allure : vert si dans ±15s de la cible EF (séances endurance), blanc sinon
    let _paceBg = 'rgba(255,255,255,0.22)';
    try {
      const _efTarget = (typeof getBestEfPace === 'function') ? getBestEfPace() : null;
      if(pace && _efTarget && _isEfLong) {
        const _pSec = (typeof paceStrToSec === 'function') ? paceStrToSec(String(pace)) : null;
        const _tSec = (typeof paceStrToSec === 'function') ? paceStrToSec(String(_efTarget)) : null;
        if(_pSec && _tSec) {
          const _diff = Math.abs(_pSec - _tSec);
          _paceBg = _diff <= 15 ? 'rgba(134,239,172,0.4)' : _diff <= 30 ? 'rgba(251,191,36,0.4)' : 'rgba(248,113,113,0.35)';
        }
      }
    } catch(e) {}
    // Couleur FC : toujours colorée. EF/long ≤148 vert, tempo/frac ≤172 vert
    let _hrBg = 'rgba(255,255,255,0.22)';
    if(hr) {
      const _hrN = parseInt(hr, 10);
      if(!isNaN(_hrN)) {
        if(_isTempo) {
          _hrBg = _hrN<=172 ? 'rgba(134,239,172,0.4)' : _hrN<=185 ? 'rgba(251,191,36,0.4)' : 'rgba(248,113,113,0.35)';
        } else {
          _hrBg = _hrN<=148 ? 'rgba(134,239,172,0.4)' : _hrN<=158 ? 'rgba(251,191,36,0.4)' : 'rgba(248,113,113,0.35)';
        }
      }
    }
    if(km) _stats.push('<span style="background:rgba(255,255,255,0.22);border-radius:8px;padding:2px 8px;font-size:11px;font-weight:700;color:#fff;">🏃 '+km+' km</span>');
    if(pace) _stats.push('<span style="background:'+_paceBg+';border-radius:8px;padding:2px 8px;font-size:11px;font-weight:700;color:#fff;">⚡ '+pace+'/km</span>');
    if(hr) _stats.push('<span style="background:'+_hrBg+';border-radius:8px;padding:2px 8px;font-size:11px;font-weight:700;color:#fff;">❤️ '+hr+' bpm</span>');
    wrap.innerHTML = '<div id="coach-analysis-card" style="border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(22,101,52,0.13);border:1px solid rgba(22,101,52,0.12);">'
      + '<div style="background:linear-gradient(135deg,#166534,#16a34a);padding:10px 14px;">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:'+(_stats.length?'8px':'0')+';">'
          + '<div style="display:flex;align-items:center;gap:8px;">'
            + '<div style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span style="font-size:13px;">🤖</span></div>'
            + '<span style="font-size:13px;font-weight:700;color:#fff;">✅ Analyse de séance</span>'
          + '</div>'
          + '<div id="coach-feu-zone" style="display:flex;align-items:center;gap:4px;"><span style="font-size:11px;color:rgba(255,255,255,0.75);">'+_timeStr+'</span></div>'
        + '</div>'
        + (_stats.length ? '<div style="display:flex;flex-wrap:wrap;gap:6px;">'+_stats.join('')+'</div>' : '')
      + '</div>'
      + '<div style="background:var(--bg,#fff);padding:14px 16px 6px;">'
        + '<div id="coach-analysis-stream" style="color:var(--text,#1a1a1a);font-size:14px;line-height:1.55;"><div class="coach-typing"><span>Le Coach analyse ta séance</span><div class="coach-typing-dots"><i></i><i></i><i></i></div></div></div>'
      + '</div>'
      + '<div id="coach-analysis-footer" style="display:none;padding:10px 14px;border-top:1px solid rgba(22,101,52,0.1);background:var(--bg2,#f9fefb);text-align:center;">'
        + '<button onclick="showScreen(\'plan\')" style="background:#16a34a;border:none;color:#fff;border-radius:10px;padding:8px 20px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(22,163,74,0.3);">📅 Voir dans le plan</button>'
      + '</div>'
      + '</div>';
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
  // Position dans la semaine (pour contextualiser la charge)
  const _nbSeancesDoneThisWeek = (()=>{
    let n=0;
    weeks[CW-1].sessions.forEach((_,si)=>{ if(state[gk(CW,si)+'done']) n++; });
    let ei=0; while(ei<=20&&state['extra_w'+CW+'_s'+ei]){ if(state['extra_w'+CW+'_s'+ei+'_done']) n++; ei++; }
    return n;
  })();
  analysisContext.position_semaine = _nbSeancesDoneThisWeek+'ème séance de la semaine S'+CW+' ('+(([8,12,16,20,26,30].includes(CW)?'semaine de DÉCHARGE':'semaine NORMALE'))+')';

  const seancesAVenir = [];
  // Séances restantes semaine courante
  getOrderedWeekSessions(CW).forEach(({s:s2,si,extra,ei})=>{
    if(seancesAVenir.length >= 3) return;
    const done = extra ? !!state['extra_w'+CW+'_s'+ei+'_done'] : !!state[gk(CW,si)+'done'];
    if(done) return;
    const edRaw = !extra && state['edit_w'+CW+'_s'+si];
    let ed=null;try{ed=edRaw?JSON.parse(edRaw):null;}catch(e){}
    const titre = ed ? ed.d.split('|')[0] : s2.d.split('|')[0];
    const detail = ed ? (ed.d.split('|')[1]||'') : (s2.d.split('|')[1]||'');
    const type = ed ? ed.type : s2.type;
    const km = ed ? ed.km : s2.km;
    // Pour les extras, lire sched_day/sched_time depuis s2 directement
    const schedDay = extra ? s2.sched_day : ((ed && ed.sched_day) || s2.sched_day);
    const schedTime = extra ? s2.sched_time : ((ed && ed.sched_time) || s2.sched_time);
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
      let edNext=null;try{edNext=edRawNext?JSON.parse(edRawNext):null;}catch(e){}
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
    garmin: window._stravaActivityData || null
  };

  // Ajouter les données Strava enrichies au contexte d'analyse si disponibles
  if(window._stravaActivityData) {
    const g = window._stravaActivityData;
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
        g.cadence ? `Cadence moyenne : ${g.cadence} spm (foulées/min)${g.cadence < 165 ? ' — trop basse, foulée trop longue' : g.cadence >= 175 ? ' — bonne cadence' : ' — correct'}` : null,
        g.fcMax ? `FC max atteinte : ${g.fcMax} bpm` : null,
        g.denivele_pos ? `Dénivelé positif : ${g.denivele_pos}m` : null,
        splitsClean && splitsClean.length > 1 ? `Km le plus rapide : km${splitsClean.reduce((a,b) => (a.allure||'9:99') < (b.allure||'9:99') ? a : b).km} (${splitsClean.reduce((a,b) => (a.allure||'9:99') < (b.allure||'9:99') ? a : b).allure})` : null,
        splitsClean && splitsClean.length > 1 ? `Km le plus lent : km${splitsClean.reduce((a,b) => (a.allure||'0:00') > (b.allure||'0:00') ? a : b).km} (${splitsClean.reduce((a,b) => (a.allure||'0:00') > (b.allure||'0:00') ? a : b).allure})` : null,
      ].filter(Boolean)
    };
    // Réinitialiser après utilisation
    window._stravaActivityData = null;
  }

  window._lastAnalysisToday = true;
  window._lastAnalysisKm = km || null;
  window._lastAnalysisPace = pace || null;
  window._lastAnalysisHr = hr || null;
  window._lastAnalysisType = s.type || null;
  fetchCoachAnalysis(s, km, pace, hr, analysisContext, historyData);
}

