function renderCoachText(t, streaming){
  if(!t) return '';
  // Supprimer TOUS les blocs ```...``` et inline `code` avant affichage
  let cleaned = t;
  cleaned = cleaned.replace(/```[\s\S]*?```/g, ''); // Supprimer blocs code
  cleaned = cleaned.replace(/`([^`\n]*)`/g, '$1');   // Supprimer backticks inline
  // Convertir les titres markdown ## → texte stylé (supprimer les # mais garder le contenu)
  cleaned = cleaned.replace(/^#{1,3}\s*/gm, '');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim(); // Nettoyer lignes vides
  const f = fixAccents(cleaned);
  let h = f.replace(/\*\*([^*\n]+)\*\*/g, '<strong style="font-weight:700;">$1</strong>');
  const blocks = h.split(/\n{2,}/);
  if(blocks.length > 1){
    h = blocks.map(b=>b.trim()).filter(b=>b.length>0).map(b=>{
      const mt = /^[\u2705\u26a0\ud83d\udcc5\ud83d\udca1\ud83d\udcc8\ud83d\udd25\ud83d\ude24\ud83e\uddd8]/.test(b) ? 'margin:0 0 14px 0;' : 'margin:0 0 12px 0;';
      const anim = streaming ? '' : ' animation:fadeSlideIn 0.25s ease-out forwards;';
      return '<p style="'+mt+anim+'">'+b.replace(/\n/g,'<br>')+'</p>';
    }).join('');
  } else {
    h = '<p style="margin:0;">'+h.replace(/\n/g,'<br>')+'</p>';
  }
  return h;
}
function addCoachMessage(role, text){
  const container = document.getElementById('coach-messages');
  if(!container) return;
  const isCoach = role === 'coach';
  if(isCoach) text = fixAccents(text);
  // Date separator
  const nowD=new Date();
  const dStr=nowD.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
  const lastSep=container.querySelector('.chat-date-sep:last-of-type');
  if(!lastSep||lastSep.dataset.date!==dStr){
    const sep=document.createElement('div');sep.className='chat-date-sep';
    sep.dataset.date=dStr;sep.textContent=dStr.charAt(0).toUpperCase()+dStr.slice(1);
    container.appendChild(sep);
  }
  const div = document.createElement('div');
  div.className = 'msg-enter';
  div.style.cssText = 'display:flex;align-items:flex-start;gap:8px;'+(isCoach?'':'flex-direction:row-reverse;');

  div.innerHTML = (isCoach?'<div style="width:32px;height:32px;border-radius:50%;background:#0C447C;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span style="font-size:14px;">🤖</span></div>':'')
    +'<div style="max-width:85%;background:'+(isCoach?'#fff':'#0C447C')+';border-radius:'+(isCoach?'4px 14px 14px 14px':'14px 4px 14px 14px')+';padding:12px 14px;border-left:'+(isCoach?'3px solid rgba(12,68,124,0.15)':'0')+';">'
    +'<'+(isCoach?'div':'p')+' data-coach-text="1" style="font-size:14px;color:'+(isCoach?'var(--text)':'#fff')+';line-height:1.7;">'+(isCoach?renderCoachText(text):text.replace(/\n/g,'<br>'))+'</'+(isCoach?'div':'p')+'>'
    +'<p style="font-size:10px;color:'+(isCoach?'var(--muted)':'rgba(255,255,255,0.55)')+';margin-top:4px;text-align:right;">'
    +new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})+'</p></div>';
  container.appendChild(div);
  if(isAtBottom(container)||!container._hasScrolled) container.scrollTo({top:container.scrollHeight,behavior:'smooth'});
  container._hasScrolled = true;
}

// ── DÉTECTION DU TYPE DE QUESTION ────────────────────────────────────────────
function detectContextNeeds(msg) {
  const m = msg.toLowerCase();

  // Détecter si c'est une question de critique/amélioration du plan
  const isPlanCritique = /plan|s[eé]ances?|entra[iî]n|programme|structure|4.?[eè]me|quatre.*s[eé]ance|passer.*[34]|[34].*s[eé]ance|ajouter|rajouter|am[eé]liorer|modifier|changer|retravailler|refaire|restructurer|proposer|proposition|suggestion|conseil|recommandation|optimiser|revoir|ajuster|ajustement|qu.est.ce.*que.*tu|est.ce.*bien|ce.*que.*tu.*penses|que.*ferais|que.*changerais|que.*modifierais|que.*ajouterais|que.*vois|comment.*voir|peut.on|pourrait.on|serait.il|faut.il|devrait|progression|intensit[eé]|volume|tempo|ef|long|allure|marathon|sub.?4|d[eé]charge|risqu[eé]?|s[1-3][0-9]\b|mois.*(prochain|suivant)|septembre|juillet|ao[uû]t|juin|prochaines.*semaines|semaines.*suivantes|10%|bien.*structur|v[eé]rifi|analyse.*plan|plan.*analyse/.test(m);

  const needs = {
    // Pour une critique du plan : on a besoin de l'historique ET du plan futur
    historique_complet:  isPlanCritique || /histori|compare|progress|toutes? mes|depuis le début|tendance|bilan|retour|semaine [1-9]|s[1-9][0-9]?\b|évolution|régress|stagna|premier tempo|première fois|déjà fait|j'ai fait/.test(m),
    plan_futur:          isPlanCritique || /plan|futur|prochain|semaine|a venir|suite|programme|prevu|s[1-9]/.test(m),
    chaussures_detail:   /chaussure|usure|km|pega|salom|zoom|paire/.test(m),
    renfo_detail:        /renfo|kiné|exercice|série|ischio|dos|gainage|bird|pont|superman|battement/.test(m),
    gels_nutrition:      /gel|nutrition|calorie|manger|ravitaillement|sucre|energie/.test(m),
    charge_detail:       /charge|surcharge|fatigue|récup|intensité|volume/.test(m),
    is_plan_critique:    isPlanCritique,  // flag pour le mode de réponse
  };
  return needs;
}

// ── DÉTECTION DU MODE DE RÉPONSE ─────────────────────────────────────────────
function detectResponseMode(msg) {
  const m = msg.toLowerCase();

  // Mode critique plan : évaluation/amélioration du plan → rapport enrichi
  const isPlanCritique = /plan|s[eé]ances?.*semaine|entra[iî]n|programme|4.?[eè]me|quatre.*s[eé]ance|passer.*[34].*s[eé]ance|[34].*s[eé]ances.*semaine|ajouter.*(s[eé]ance|ef|tempo|long)|rajouter|am[eé]liorer|modifier|changer|retravailler|refaire|restructurer|proposer|proposition|suggestion|optimiser|revoir|ajuster|que.*(ferais|changerais|modifierais|ajouterais|vois|conseilles|recommandes|penses).*(plan|s[eé]ance|semaine|entra[iî]n)|est.ce.*bien.*(construit|[eé]quilibr)|qu.est.ce.*que.*tu.*(penses|conseilles|recommandes)|serait.il.*pertinent|faut.il.*ajouter|devrait.*avoir|comment.*am[eé]liorer|peut.on.*am[eé]liorer|d[eé]charge|risqu[eé]?|s[1-3][0-9]\b|mois.*(prochain|suivant)|septembre|juillet|ao[uû]t|juin|prochaines.*semaines|10%|bien.*structur|v[eé]rifi|analyse.*plan/.test(m);
  if(isPlanCritique) return 'plan_critique';

  // Mode rapport : questions complexes multi-semaines, bilan global, projection
  const isRapportStrong = /\bmeilleur\s+bloc|pire\s+bloc|sur\s+[0-9]+\s+semaines?|bonne\s+voie|sub\s*4|objectif.*marathon|marathon.*objectif|progression\s+depuis|depuis\s+le\s+d[ée]but|bilan\s+(global|complet|g[ée]n[ée]ral|de\s+ma)|analyse\s+(compl[eè]te|globale|g[ée]n[ée]rale)|point\s+sur\s+ma|r[ée]sum[ée]\s+de\s+ma|[ée]tat\s+de\s+ma|rapport|synth[eè]se/.test(m);
  const isSemaineMain = /^[^?!.]{0,30}(ma|cette|la)\s+semaine\b|^(programme|planning|séances?|détail|liste)\s+(de\s+la\s+)?semaine/.test(m.trim());
  if(isRapportStrong || isSemaineMain) return 'rapport';

  // Mode analyse : comparaisons, séries de séances, tendances
  const isAnalyse = /compar|toutes?\s+mes|toutes?\s+les|mes\s+(tempo|ef|long|s[ée]ances)|[ée]volution|tendance|progression|r[ée]gression|stagna|analyse|comment\s+s'est|comment\s+se\s+passent|mes\s+derni[eè]res|sur\s+les\s+derni[eè]res|semaines?\s+[0-9]|entre\s+s[0-9]+|mes\s+perfs|mes\s+performances|mes\s+allures|mes\s+fc|statistiques|stats/.test(m);
  if(isAnalyse) return 'analyse';

  return 'chat';
}

// ── CONTEXTE COMPACT (toujours envoyé) ───────────────────────────────────────
// Sérialise buildMarathonPrediction() pour les contextes Coach
function buildPredictionForCoach() {
  try {
    const pred = buildMarathonPrediction();
    if(!pred) return null;
    const fmtTime = s => { const hh=Math.floor(s/3600),mm=Math.floor((s%3600)/60); return `${hh}h${String(mm).padStart(2,'0')}`; };
    const fmtPace = s => s ? `${Math.floor(s/60)}'${String(Math.round(s%60)).padStart(2,'0')}` : null;
    return {
      temps_predit: pred.tempsStr,
      allure_marathon_recommandee: pred.amPaceRecoStr || fmtPace(Math.round(pred.tempsSec/42.195)),
      intervalle: `${pred.intervalMinStr} → ${pred.intervalMaxStr}`,
      confiance: pred.confiance + '%',
      ecart_sub4h: pred.sub4hEcartSec <= 0
        ? `Sub-4h atteint (${Math.abs(Math.round(pred.sub4hEcartSec/60))} min d'avance)`
        : `+${Math.round(pred.sub4hEcartSec/60)} min du Sub-4h`,
      methode: pred.methode,
      signaux: {
        ef: pred.details.amFromEf ? fmtTime(pred.details.amFromEf) : null,
        tempo: pred.details.amFromTempo ? fmtTime(pred.details.amFromTempo) : null,
        long: pred.details.amFromLong ? fmtTime(pred.details.amFromLong) : null,
        nb_seances_ef: pred.details.nbEf,
        nb_seances_tempo: pred.details.nbTempo,
        nb_seances_long: pred.details.nbLong,
      },
      progression: pred.tendanceSec < -0.5
        ? `amélioration de ${Math.round(Math.abs(pred.tendanceSec*10))/10}s/km/semaine`
        : pred.tendanceSec > 0.5 ? `légère régression ${Math.round(pred.tendanceSec*10)/10}s/km/semaine`
        : 'stable',
      drift_cardiaque: pred.details.cardiacDrift !== null
        ? `${pred.details.cardiacDrift}% (${pred.details.driftPenaltySec > 0 ? '+'+Math.round(pred.details.driftPenaltySec/60)+' min pénalité' : pred.details.driftPenaltySec < 0 ? Math.round(pred.details.driftPenaltySec/60)+' min bonus' : 'neutre'})`
        : null,
      historique_recents: pred.historique.slice(-6).map(h => ({semaine: h.ws, temps: fmtTime(h.tempsSec)})),
    };
  } catch(e) { return null; }
}

function buildCompactContext(coachMemos, seancesAujourdhui, jourActuel, heureActuelle) {
  // Résumé des 4 dernières semaines : 1 ligne par semaine
  const recentSummary = [];
  for(let ws = Math.max(1, CW-8); ws <= CW; ws++) {
    const sessions = [];
    weeks[ws-1].sessions.forEach((sess, si) => {
      if(state[`del_w${ws}_s${si}`]) return;
      const k = gk(ws, si);
      const done = !!state[k+'done'];
      const perf = state[k+'perf'] ? JSON.parse(state[k+'perf']) : null;
      const kmReel = state[k+'km'] != null ? state[k+'km'] : sess.km;
      sessions.push({
        type: sess.type,
        km: done ? kmReel : sess.km,
        fait: done,
        allure: perf ? perf.pace : null,
        fc: perf ? perf.hr : null,
        blocsAllure: (perf && perf.blocsAllure && perf.blocsAllure.some(b=>b)) ? perf.blocsAllure : null
      });
    });
    const kmFait = sessions.filter(s=>s.fait).reduce((a,s)=>a+s.km,0);
    const kmPlan = sessions.reduce((a,s)=>a+s.km,0);
    const renfoFaitSemaine = [1,2].filter(r => !!state['rf'+ws+'r'+r+'done']).length;
    recentSummary.push({
      semaine: ws,
      km_fait: Math.round(kmFait*10)/10,
      km_plan: Math.round(kmPlan*10)/10,
      type: [8,12,16,20,26,30].includes(ws) ? 'DÉCHARGE' : 'CHARGE',
      renfo: renfoFaitSemaine + '/2 renfo faits',
      seances: sessions.map(s=>`${s.type}${s.fait?(' '+s.km+'km'+(s.allure?' @'+s.allure:'')+(s.fc?' FC'+s.fc:'')+(s.blocsAllure?' [blocs:'+s.blocsAllure.filter(Boolean).join('/')+']':'')):' (à faire)'}`).join(' | ')
    });
  }

  // Charge courante
  const coeff = {ef:1, long:1.1, tempo:1.5, frac:1.5, race:1.6, rest:0};
  let chargeCW = 0, chargePrev = 0;
  weeks[CW-1].sessions.forEach((sess,si)=>{
    if(state[`del_w${CW}_s${si}`]) return;
    const k = gk(CW,si);
    if(!state[k+'done']) return;
    chargeCW += (state[k+'km']!=null?state[k+'km']:sess.km) * (coeff[sess.type]||1);
  });
  if(CW > 1) {
    weeks[CW-2].sessions.forEach((sess,si)=>{
      const k = gk(CW-1,si);
      if(!state[k+'done']) return;
      chargePrev += (state[k+'km']!=null?state[k+'km']:sess.km) * (coeff[sess.type]||1);
    });
  }
  const ratioCroissance = chargePrev > 0 ? Math.round(chargeCW/chargePrev*100)/100 : null;

  // Chaussures résumé
  const shoes = getShoes();
  const defaultNames = [P, S, Z];
  const shoeKmTable = [[16,46,69,87,110,126,142,157,174,192,211,228,247,267,287,305,325,346,367,386,396,416,439,459,479,488,498,508,516,533,541,546],[0,0,0,0,0,9,20,29,39,51,65,77,93,110,128,142,160,180,202,216,230,230,230,245,263,263,263,287,287,303,315,315],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,25,56,66,106,106,115,161]];
  const shoesSummary = shoes.map(sh => {
    const defaultIdx = defaultNames.indexOf(sh.name);
    const baseKm = defaultIdx >= 0 ? (shoeKmTable[defaultIdx][CW-2]||0) : (state['shoe_km_'+sh.name]||0);
    let thisWeekKm = 0;
    getOrderedWeekSessions(CW).forEach(({s:s2,si,extra,ei})=>{
      if(s2.shoe===sh.name){
        if(extra){ const done=!!state[`extra_w${CW}_s${ei}_done`]; if(done) thisWeekKm+=(state[`extra_w${CW}_s${ei}_km`]!=null?state[`extra_w${CW}_s${ei}_km`]:s2.km); }
        else { const done=state[gk(CW,si)+'done']||state[gk(CW,si)+'km']!=null; if(done) thisWeekKm+=(state[gk(CW,si)+'km']!=null?state[gk(CW,si)+'km']:s2.km); }
      }
    });
    const kmReel = baseKm + thisWeekKm;
    const pct = Math.round(kmReel/sh.max*100);
    return `${sh.name}: ${kmReel}/${sh.max}km (${pct}%${pct>90?' ⚠️':pct>75?' surveiller':''})`;
  }).join(' | ');

  // Renfo semaine en cours résumé
  const renfoStatus = [
    {r:1,name:'Ischio-fessiers'},{r:2,name:'Bas du dos'}
  ].map(rd=>{
    const done = !!state[rfk(CW,rd.r)+'done'];
    return `${rd.name}: ${done?'✓ fait':'à faire'}`;
  }).join(' | ');

  // Prochaine séance à faire cette semaine
  const jours = ['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  const prochaineSeance = [];
  getOrderedWeekSessions(CW).forEach(({s,si,extra,ei})=>{
    const done = extra ? !!state[`extra_w${CW}_s${ei}_done`] : !!state[gk(CW,si)+'done'];
    if(!done){
      const titre = s.d.split('|')[0];
      const detail = s.d.split('|')[1]||'';
      // Récupérer le jour et l'heure planifiés
      // s vient de getSession() qui lit déjà edit_w — utiliser s directement
      let planifie = '';
      if(!extra){
        // Lire directement depuis state pour avoir les données les plus fraîches
        const edRaw = state['edit_w'+CW+'_s'+si];
        const ed = edRaw ? JSON.parse(edRaw) : s;
        if(ed.sched_day && ed.sched_time) planifie = ` → ${jours[ed.sched_day]} ${ed.sched_time}`;
        else if(ed.sched_day) planifie = ` → ${jours[ed.sched_day]}`;
        else if(s.sched_day && s.sched_time) planifie = ` → ${jours[s.sched_day]} ${s.sched_time}`;
        else if(s.sched_day) planifie = ` → ${jours[s.sched_day]}`;
      }
      const nonPlanifie = planifie === '';
      let detailFinal = detail;
      if((s.type === 'ef' || s.type === 'long') && detail) {
        const efDyn = getBestEfPace() || "6'40";
        detailFinal = detail.replace(/\d:\d{2}\/km/g, efDyn + '/km')
                            .replace(/EF @ \d:\d{2}\/km/g, 'EF @ ' + efDyn + '/km');
      }
      prochaineSeance.push(`${s.type.toUpperCase()} - ${titre}${detailFinal?' ('+detailFinal+')':''} ${s.km}km${planifie || ' → ⚠️ horaire non planifié'}`);
    }
  });

  // ── Type de semaine et consignes EF ────────────────────────────────────────
  const kmCW = weeks[CW-1].km;
  const kmPrev = CW > 1 ? weeks[CW-2].km : kmCW;
  const kmNext = CW < 32 ? weeks[CW].km : kmCW;
  const hasLegere = weeks[CW-1].sessions.some(s => s.d.toLowerCase().includes('légère') || s.d.toLowerCase().includes('legere'));
  const ratioDecharge = kmCW / Math.max(kmPrev, kmNext);
  const isDecharge = [8,12,16,20,26,30].includes(CW);
  const efActuelle = getBestEfPace() || "6'00";
  // La consigne EF = allure EF actuelle validée (pas de fourchette inventée)
  const efParts = efActuelle.split("'");
  const efSec = parseInt(efParts[0])*60 + parseInt((efParts[1]||'0').replace(/[^0-9]/g,''));
  // zoneMin/zoneMax = légèrement autour de l'allure actuelle (±3 sec seulement)
  const zoneMin = efActuelle; // allure cible = allure EF actuelle
  const zoneMax = Math.floor((efSec+6)/60)+"'"+(((efSec+6)%60)+'').padStart(2,'0'); // max +6 sec
  const zoneEfDecharge = Math.floor((efSec+10)/60)+"'"+(((efSec+10)%60)+'').padStart(2,'0')+" à "+Math.floor((efSec+20)/60)+"'"+(((efSec+20)%60)+'').padStart(2,'0');

  return {
    semaine_actuelle: CW,
    date_marathon: '18 octobre 2026',
    semi_marathon: CW >= 24 ? {date:'07/09/2026', semaine:27, nom:"Semi-Marathon Bois d'Arcy", km:21, semaines_avant: 27-CW} : undefined,
    semaines_restantes: 32-CW,
    infos_importantes_Guillaume: coachMemos||undefined,
    type_semaine: isDecharge
      ? `DÉCHARGE (${kmCW}km vs ${Math.max(kmPrev,kmNext)}km semaine adjacente) — objectif récupération, pas de performance`
      : `NORMALE (${kmCW}km)`,
    consignes_ef_semaine: isDecharge
      ? `Semaine de décharge : allure EF obligatoirement entre ${zoneEfDecharge} /km. FC < 140 bpm idéalement (correction thermique applicable si > 25°C : ajouter +3 à +12 bpm selon la chaleur). Si Guillaume court plus vite, ce n'est PAS une bonne séance.`
      : `Allure EF normale : entre ${zoneMin} et ${zoneMax} /km. FC < 148 bpm.`,
    maintenant: {
      jour: jourActuel,
      heure: heureActuelle,
      seances_prevues_aujourd_hui: seancesAujourdhui.length > 0 ? seancesAujourdhui : null,
      bodyhit_lundi: '12h30 — électrostimulation full body focus jambes'
    },
    fc_repos: state['fc_repos'] || 51,
    fc_repos_context: buildFcReposContext(),
    // ── Prédiction marathon complète (multi-signaux) ───────────────────────────
    prediction_marathon: buildPredictionForCoach(),
    allure_marathon_cible: (()=>{ const p=buildMarathonPrediction(); return p&&p.amPaceRecoStr ? p.amPaceRecoStr : getMarathonPaceStr(); })(),
    temps_marathon_estime: (()=>{ const p=buildMarathonPrediction(); return p&&p.tempsStr ? p.tempsStr : calcMarathonTime(getMarathonPaceStr()); })(),
    allure_ef_actuelle: getBestEfPace()||"6'40",
    allure_ef_logique: "Fenêtre glissante 3 dernières séances EF valides (FC ≤ 148 bpm). Si ≥1 des 3 est meilleure que la référence précédente → meilleure des 3. Si les 3 sont toutes plus lentes → médiane des 3 (adaptation chaleur/fatigue).",
    note_comparaison_allures: "IMPORTANT — convention allure : une allure s'exprime en min:sec PAR KILOMÈTRE. Plus le nombre est GRAND (plus de secondes/km), plus c'est LENT. Ex: 5'46/km est PLUS LENT que 5'30/km. Ne jamais confondre sens de comparaison : réalisé > cible en sec/km = plus lent, pas plus rapide.",
    projection_sub4h: (()=>{
      const objectifSec = 4*3600; // 4h00
      const objectifAllureSec = Math.ceil(objectifSec / 42.195); // ~341 sec = 5'41/km
      // Tendance EF → projection allure marathon
      const efPoints = [];
      for(let ws=1; ws<=CW; ws++){
        weeks[ws-1].sessions.forEach((sess,si)=>{
          if(sess.type!=='ef' && sess.type!=='long') return;
          const k = gk(ws,si);
          const perf = state[k+'perf'] ? JSON.parse(state[k+'perf']) : null;
          if(!perf||!perf.pace||!perf.hr||parseInt(perf.hr)>148) return;
          efPoints.push({ws, sec: paceStrToSec(perf.pace)});
        });
      }
      const amStr = getMarathonPaceStr();
      const amSec = amStr ? paceStrToSec(amStr.replace("'",":")) : null;
      const tempsActuel = amSec ? calcMarathonTime(amStr) : null;
      const ecartSecondes = amSec ? amSec - objectifAllureSec : null;
      let tendanceProjection = null;
      if(efPoints.length >= 4){
        const last6 = efPoints.slice(-6);
        const n = last6.length;
        const sumX = last6.reduce((a,_,i)=>a+i,0);
        const sumY = last6.reduce((a,p)=>a+p.sec,0);
        const sumXY = last6.reduce((a,p,i)=>a+i*p.sec,0);
        const sumX2 = last6.reduce((a,_,i)=>a+i*i,0);
        const slope = (n*sumXY-sumX*sumY)/(n*sumX2-sumX*sumX); // sec/séance
        // Projeter : combien de séances EF restantes avant marathon ?
        const seancesRestantes = (32-CW)*2; // ~2 EF par semaine
        const projectedEfSec = (efPoints[efPoints.length-1].sec) + slope*seancesRestantes;
        // EF → AM : écart moyen ~20 sec/km
        const projectedAmSec = projectedEfSec - 20;
        const projectedTemps = calcMarathonTime(secToPace(projectedAmSec));
        const gainParSemaine = Math.round(Math.abs(slope)*2*7)/10; // sec/semaine
        tendanceProjection = {
          allure_ef_projetee: secToPace(projectedEfSec),
          allure_marathon_projetee: secToPace(projectedAmSec),
          temps_projete: projectedTemps,
          progression_sec_par_semaine: Math.round(slope*2*10)/10,
        };
      }
      return {
        objectif: 'Sub 4h00',
        objectif_allure_km: secToPace(objectifAllureSec),
        temps_actuel: tempsActuel,
        ecart_avec_objectif_sec: ecartSecondes,
        ecart_avec_objectif_str: ecartSecondes!==null ? (ecartSecondes>0?'+':'') + Math.floor(Math.abs(ecartSecondes)/60)+'min'+(Math.abs(ecartSecondes)%60)+'s '+(ecartSecondes>0?'au-dessus':'en dessous')+" de l'objectif" : null,
        projection_tendance: tendanceProjection,
        semaines_restantes: 32-CW,
        jours_restants: Math.round((new Date('2026-10-18') - new Date()) / (1000*60*60*24))
      };
    })(),
    km_semaine_en_cours: {planifie: getWeekTotalKm(CW), realise: calcWeekDoneKm()},
    chaussures: shoesSummary,
    seances_supprimees_semaine: (()=>{
      const del=[];
      weeks[CW-1].sessions.forEach((sess,si)=>{ if(state['del_w'+CW+'_s'+si]) del.push(sess.d.split('|')[0]); });
      return del.length > 0 ? del : null;
    })(),
    seances_restantes_semaine: prochaineSeance,
    regularite_horaires: (()=>{
      // Analyser si Guillaume court à heure régulière
      const heures = [];
      for(let ws=Math.max(1,CW-6); ws<=CW; ws++){
        weeks[ws-1].sessions.forEach((sess,si)=>{
          const k=gk(ws,si);
          if(!state[k+'done']) return;
          const edRaw=state['edit_w'+ws+'_s'+si];
          const ed=edRaw?JSON.parse(edRaw):null;
          if(ed&&ed.sched_time){
            const h=parseInt(ed.sched_time.split(':')[0]);
            if(!isNaN(h)) heures.push({h, type:sess.type});
          }
        });
      }
      if(heures.length < 4) return null;
      const matin = heures.filter(h=>h.h<12).length;
      const midijour = heures.filter(h=>h.h>=12&&h.h<17).length;
      const soir = heures.filter(h=>h.h>=17).length;
      const total = heures.length;
      const dominant = matin>=midijour&&matin>=soir?'matin':(soir>=matin&&soir>=midijour?'soir':'milieu de journée');
      const pctDominant = Math.round(Math.max(matin,midijour,soir)/total*100);
      const moy = Math.round(heures.reduce((a,h)=>a+h.h,0)/total);
      const ecartType = Math.round(Math.sqrt(heures.reduce((a,h)=>a+(h.h-moy)*(h.h-moy),0)/total)*10)/10;
      return {
        creneaux: {matin, midijour, soir},
        creneau_dominant: dominant,
        pct_regularite: pctDominant,
        ecart_type_heures: ecartType,
        regularite: ecartType<2?'très régulier':ecartType<3?'assez régulier':'variable',
        note: pctDominant>=70?'Guillaume court principalement le '+dominant+' ('+pctDominant+'% des séances)':'Horaires variables — pas de créneau fixe identifié'
      };
    })(),
    delai_inter_seances: (()=>{
      // Calculer le délai depuis la dernière séance ET détecter deux séances intenses proches
      const seancesDates = [];
      for(let ws=Math.max(1,CW-2); ws<=CW; ws++){
        weeks[ws-1].sessions.forEach((sess,si)=>{
          const k=gk(ws,si);
          if(!state[k+'done']) return;
          const perf=state[k+'perf']?JSON.parse(state[k+'perf']):null;
          const dateStr=perf&&perf.date?perf.date:null;
          if(dateStr) seancesDates.push({date:new Date(dateStr),type:sess.type,ws});
        });
      }
      seancesDates.sort((a,b)=>a.date-b.date);
      if(seancesDates.length < 2) return null;
      const derniere = seancesDates[seancesDates.length-1];
      const avantDerniere = seancesDates[seancesDates.length-2];
      const heuresDepuis = Math.round((new Date()-derniere.date)/(1000*3600));
      const heuresEntreDeux = Math.round((derniere.date-avantDerniere.date)/(1000*3600));
      let alerte = null;
      if((derniere.type==='tempo'||derniere.type==='frac') && (avantDerniere.type==='tempo'||avantDerniere.type==='frac') && heuresEntreDeux < 48)
        alerte = 'Deux séances intenses en moins de 48h — risque de surmenage élevé';
      else if((derniere.type==='tempo'||derniere.type==='frac'||derniere.type==='long') && heuresDepuis < 24)
        alerte = 'Séance intense il y a moins de 24h — corps encore en récupération';
      return {
        derniere_seance_il_y_a_heures: heuresDepuis,
        heures_entre_deux_dernieres: heuresEntreDeux,
        type_derniere: derniere.type,
        alerte_recuperation: alerte
      };
    })(),
    resume_4_dernieres_semaines: recentSummary,
    charge: (()=>{
      // Détecter surmenage : charge > 1.3x ET FC EF montante
      let alerteSurmenage = null;
      if(ratioCroissance !== null && ratioCroissance > 1.3) {
        // Vérifier si la FC EF monte aussi
        const efFCRecent = [];
        for(let ws=Math.max(1,CW-3); ws<=CW; ws++){
          weeks[ws-1].sessions.forEach((sess,si)=>{
            if(sess.type!=='ef'&&sess.type!=='long') return;
            const k=gk(ws,si);
            const perf=state[k+'perf']?JSON.parse(state[k+'perf']):null;
            if(perf&&perf.hr&&parseInt(perf.hr)<=148) efFCRecent.push({ws,hr:parseInt(perf.hr)});
          });
        }
        const fcMontante = efFCRecent.length>=3 &&
          efFCRecent[efFCRecent.length-1].hr > efFCRecent[0].hr + 3;
        if(fcMontante){
          alerteSurmenage = 'ALERTE SURMENAGE : charge +'+Math.round((ratioCroissance-1)*100)+'% ET FC EF en hausse de '+
            (efFCRecent[efFCRecent.length-1].hr - efFCRecent[0].hr)+' bpm. Risque élevé — réduire la charge.';
        } else {
          alerteSurmenage = 'Charge +'+Math.round((ratioCroissance-1)*100)+'% vs semaine précédente (seuil 30% dépassé).';
        }
      }
      return {
        semaine_actuelle: Math.round(chargeCW*10)/10,
        semaine_precedente: Math.round(chargePrev*10)/10,
        ratio: ratioCroissance,
        alerte: alerteSurmenage
      };
    })(),
    chaussures_resume: shoesSummary,
    renfo_semaine: renfoStatus,
    progression_plan: Math.round(calcTotalDone()/getGrandTotal()*100)+'% ('+calcTotalDone()+'/'+getGrandTotal()+'km)',
    analyse_blocs_tempo: (()=>{
      // Analyser la dégradation/progression entre les blocs sur les dernières Tempo
      const tempoAvecBlocs = [];
      for(let ws=1; ws<=CW; ws++){
        weeks[ws-1].sessions.forEach((sess,si)=>{
          if(sess.type!=='tempo'&&sess.type!=='frac') return;
          const k=gk(ws,si);
          const perf=state[k+'perf']?JSON.parse(state[k+'perf']):null;
          if(!perf||!perf.blocsAllure||!perf.blocsAllure.some(b=>b)) return;
          const blocs=perf.blocsAllure.filter(Boolean).map(a=>paceStrToSec(a.replace("'",":")));
          if(blocs.length>=2&&blocs.every(b=>b>0)) tempoAvecBlocs.push({ws,blocs,titre:sess.d.split('|')[0]});
        });
      }
      if(tempoAvecBlocs.length===0) return null;
      const results = tempoAvecBlocs.slice(-4).map(t=>{
        const degradation = t.blocs[t.blocs.length-1]-t.blocs[0]; // positif = dégradation, négatif = progression
        const moy = Math.round(t.blocs.reduce((a,b)=>a+b,0)/t.blocs.length);
        return {
          semaine: t.ws,
          titre: t.titre,
          blocs: t.blocs.map(secToPace),
          degradation_sec: degradation,
          allure_moy_blocs: secToPace(moy),
          tendance: degradation>8?'dégradation (essoufflement en fin de séance)':degradation<-5?'progression (plus fort en fin)':'régulier'
        };
      });
      const derniere = results[results.length-1];
      return {
        historique_blocs: results,
        derniere_seance: derniere,
        conseil: derniere.degradation_sec>8
          ? 'Dégradation de '+derniere.degradation_sec+'s entre premier et dernier bloc — partir moins vite sur le 1er bloc'
          : derniere.degradation_sec<-5
          ? "Progression entre les blocs — bonne gestion de l'effort, tu peux légèrement augmenter l'allure"
          : "Blocs réguliers — excellente gestion de l'intensité" 
      };
    })(),
    derive_cardiaque_ef: (()=>{
      // Comparer FC pour la même allure sur les dernières EF → détecter progression aérobie
      const efData = [];
      for(let ws=1; ws<=CW; ws++){
        weeks[ws-1].sessions.forEach((sess,si)=>{
          if(sess.type!=='ef' && sess.type!=='long') return;
          const k = gk(ws,si);
          const perf = state[k+'perf'] ? JSON.parse(state[k+'perf']) : null;
          if(!perf || !perf.pace || !perf.hr) return;
          const sec = paceStrToSec(perf.pace);
          const hr = parseInt(perf.hr);
          if(sec>0 && hr>0 && hr<=148) efData.push({ws, sec, hr});
        });
      }
      if(efData.length < 4) return null;
      const last6 = efData.slice(-6);
      const first3 = last6.slice(0,3);
      const last3 = last6.slice(-3);
      const avgHrFirst = Math.round(first3.reduce((a,p)=>a+p.hr,0)/first3.length);
      const avgHrLast = Math.round(last3.reduce((a,p)=>a+p.hr,0)/last3.length);
      const avgPaceFirst = Math.round(first3.reduce((a,p)=>a+p.sec,0)/first3.length);
      const avgPaceLast = Math.round(last3.reduce((a,p)=>a+p.sec,0)/last3.length);
      const hrDiff = avgHrFirst - avgHrLast;
      const paceDiff = avgPaceFirst - avgPaceLast;
      let interpretation = '';
      if(hrDiff >= 3 && Math.abs(paceDiff) <= 10)
        interpretation = `Progression aérobie : FC baisse de ${hrDiff} bpm à allure similaire → le cœur travaille moins pour la même vitesse`;
      else if(hrDiff <= -3 && Math.abs(paceDiff) <= 10)
        interpretation = `Attention : FC monte de ${Math.abs(hrDiff)} bpm à allure similaire → possible fatigue cumulée`;
      else if(paceDiff >= 5 && hrDiff >= -2)
        interpretation = `Progression vitesse : ${paceDiff}s/km plus rapide à FC similaire`;
      else
        interpretation = 'Pas de tendance claire sur la dérive cardiaque';
      return { allure_moy_debut: secToPace(avgPaceFirst), fc_moy_debut: avgHrFirst, allure_moy_fin: secToPace(avgPaceLast), fc_moy_fin: avgHrLast, interpretation };
    })(),
    tendance_ef: (()=>{
      // Régression linéaire sur les 8 dernières séances EF valides (FC < 148)
      const efPoints = [];
      for(let ws=1; ws<=CW; ws++){
        weeks[ws-1].sessions.forEach((sess,si)=>{
          if(sess.type!=='ef' && sess.type!=='long') return;
          const k = gk(ws,si);
          const perf = state[k+'perf'] ? JSON.parse(state[k+'perf']) : null;
          if(!perf || !perf.pace || !perf.hr) return;
          if(parseInt(perf.hr) > 148) return;
          const sec = paceStrToSec(perf.pace);
          if(sec > 0) efPoints.push({ws, sec});
        });
      }
      if(efPoints.length < 3) return 'Pas assez de données EF valides (<3 séances)';
      const last8 = efPoints.slice(-8);
      // Régression linéaire y=sec, x=index
      const n = last8.length;
      const sumX = last8.reduce((a,_,i)=>a+i,0);
      const sumY = last8.reduce((a,p)=>a+p.sec,0);
      const sumXY = last8.reduce((a,p,i)=>a+i*p.sec,0);
      const sumX2 = last8.reduce((a,_,i)=>a+i*i,0);
      const slope = (n*sumXY - sumX*sumY) / (n*sumX2 - sumX*sumX);
      const slopePerWeek = Math.round(slope * 10) / 10; // sec/séance
      const lastPace = last8[last8.length-1];
      const firstPace = last8[0];
      const totalGain = Math.round(firstPace.sec - lastPace.sec);
      const trend = slopePerWeek < -1 ? 'progression' : slopePerWeek > 1 ? 'régression' : 'stable';
      return {
        nb_seances_analysees: n,
        derniere_allure_ef: secToPace(lastPace.sec),
        premiere_allure_ef_periode: secToPace(firstPace.sec),
        gain_total_secondes: totalGain,
        tendance: trend,
        pente_sec_par_seance: slopePerWeek,
        interpretation: trend==='progression'
          ? `Progression de ~${Math.abs(slopePerWeek).toFixed(1)} sec/séance (${totalGain>0?'+':'-'}${Math.abs(totalGain)}s au total)`
          : trend==='régression'
          ? `Régression de ~${Math.abs(slopePerWeek).toFixed(1)} sec/séance — surveiller la fatigue`
          : 'Allure EF stable sur la période'
      };
    })(),
    logique_allure_marathon: "EF<148bpm → table: 6'00=5'40 | 5'55=5'35 | 5'50=5'30 | 5'45=5'25 | 5'40=5'20 | 5'35=5'15 | 5'30=5'10 | 5'25=5'05 | 5'20=5'00",
    chaussures_plan_verite: `Zoom Fly : première utilisation planifiée S26 (31/08/2026). JAMAIS avant S26, même si un échange précédent dit le contraire — l'échange précédent était une erreur. Avant S26 : Pegasus + Salomon uniquement.`,
    contexte_semaines_speciales: {S21:'Paris', S22:'Sri Lanka', S23:'Sri Lanka', S27:'Semi-Marathon Bois d\'Arcy', S32:'MARATHON'},
    note: "Pour avoir plus de détails, précise ta question.",
    bodyhit_semaine: (()=>{
      const _now=new Date(); const _dow=_now.getDay()===0?7:_now.getDay();
      const _h=_now.getHours()+_now.getMinutes()/60;
      const _fait=_dow>1||(_dow===1&&_h>=12.5);
      return {fait:_fait,statut:_fait?'FAIT (lundi 12h30)':'À VENIR (lundi 12h30)',jour:'lundi',note:'Horaire normal lundi 12h30.'};
    })(),
    semaine_suivante: CW < 32 ? {numero:CW+1, km:getWeekTotalKm(CW+1), type:[8,12,16,20,26,30].includes(CW+1)?'DÉCHARGE':'CHARGE'} : null,
    seances_recentes_detail: (()=>{
      const det=[];
      for(let ws=CW;ws>=Math.max(1,CW-8);ws--){
        weeks[ws-1].sessions.forEach((sess,si)=>{
          const k=gk(ws,si); if(!state[k+'done']) return;
          const perf=state[k+'perf']?JSON.parse(state[k+'perf']):{};
          det.push({semaine:ws,type:sess.type,titre:sess.d.split('|')[0],km:state[k+'km']||sess.km,allure:perf.pace||null,fc_moy:perf.hr||null,dur:perf.dur||null,strava:perf.strava||null});
        });
        let ei=0;
        while(state[`extra_w${ws}_s${ei}`]){
          if(state[`extra_w${ws}_s${ei}_done`]){
            const es=JSON.parse(state[`extra_w${ws}_s${ei}`]);
            const perf=state[`extra_w${ws}_s${ei}_perf`]?JSON.parse(state[`extra_w${ws}_s${ei}_perf`]):{};
            det.push({semaine:ws,type:es.type,titre:es.d.split('|')[0],extra:true,km:state[`extra_w${ws}_s${ei}_km`]||es.km,allure:perf.pace||null,fc_moy:perf.hr||null,dur:perf.dur||null,strava:null});
          }
          ei++;
        }
      }
      return det.slice(0,15);
    })(),
    absences_semaine: state['absences_cw'+CW]||null,
    prochaines_semaines: (()=>{
      const r = [];
      const joursAbr=['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
      for(let ws=CW+1; ws<=Math.min(CW+4, 32); ws++){
        const sl = weeks[ws-1].sessions.map((sess,si)=>{
          const edRaw = state["edit_w"+ws+"_s"+si];
          const ed = edRaw ? JSON.parse(edRaw) : null;
          const d = (ed?ed.d:sess.d).split("|");
          return {type:ed?ed.type:sess.type, titre:d[0], detail:d[1]||'', km:ed?ed.km:sess.km,
            planifie: ed&&ed.sched_day?(joursAbr[ed.sched_day]||'')+(ed.sched_time?' '+ed.sched_time:''):null};
        });
        r.push({semaine:ws, km_total:weeks[ws-1].km, sessions:sl, note_chaussures:'chaussures non communiquées pour éviter erreurs — ne pas mentionner de modèles spécifiques'});
      }
      return r;
    })()
  };
}

// ── CONTEXTE DÉTAILLÉ (sections ajoutées selon la question) ──────────────────
function buildDetailedSections(needs, fullHistory, futurPlan) {
  const extra = {};

  // TOUJOURS inclure les séances récentes avec données Strava
  extra.seances_recentes_detail = (()=>{
    const detail = [];
    for(let ws = CW; ws >= 1; ws--) {
      // Séances de base
      weeks[ws-1].sessions.forEach((sess, si) => {
        const k = gk(ws, si);
        if(!state[k+'done']) return;
        const perf = state[k+'perf'] ? JSON.parse(state[k+'perf']) : {};
        const st = perf.strava || null;
        detail.push({
          semaine: ws, type: sess.type, titre: sess.d.split('|')[0],
          date: perf.date||null, km: state[k+'km']||sess.km,
          allure: perf.pace||null, fc_moy: perf.hr||null, duree: perf.dur||null,
          blocs_tempo: perf.blocsAllure||null,
          strava: st ? {
            cadence: st.cadence||st.cadence_moy||null,
            fcMax: st.fcMax||st.fc_max||null,
            denivele_pos: st.denivele_pos!=null?st.denivele_pos:null,
            calories: st.calories||null,
            best_400m: st.best_400m||null,
            splits: (st.splits||st.splits_par_km||[])
              .filter(sp => sp.distanceKm===undefined||sp.distanceKm>=0.5)
              .map(sp => ({km:sp.km, allure:sp.allure, fc:sp.fc, denivele:sp.denivele||null}))
          } : null
        });
      });
      // Séances extra validées
      let ei=0;
      while(state[`extra_w${ws}_s${ei}`]){
        if(state[`extra_w${ws}_s${ei}_done`]){
          const es=JSON.parse(state[`extra_w${ws}_s${ei}`]);
          const perf=state[`extra_w${ws}_s${ei}_perf`]?JSON.parse(state[`extra_w${ws}_s${ei}_perf`]):{};
          detail.push({
            semaine: ws, type: es.type, titre: es.d.split('|')[0], extra: true,
            date: perf.date||null, km: state[`extra_w${ws}_s${ei}_km`]||es.km,
            allure: perf.pace||null, fc_moy: perf.hr||null, duree: perf.dur||null,
            blocs_tempo: perf.blocsAllure||null, strava: null
          });
        }
        ei++;
      }
    }
    return detail.slice(0, 30);
  })();

  if(needs.historique_complet) {
    extra.historique_complet = fullHistory;
    extra.note_dates_seances = "Guillaume complète souvent ses séances le jour de la semaine précédente. perf.date = date réelle si disponible.";
  }

  if(needs.plan_futur) {
    extra.plan_futur = futurPlan;
    extra.seances_supprimees = (()=>{
      const deleted=[];
      for(let ws=1;ws<=32;ws++) weeks[ws-1].sessions.forEach((sess,si)=>{ if(state['del_w'+ws+'_s'+si]) deleted.push({semaine:ws,titre:sess.d.split('|')[0],type:sess.type,km:sess.km}); });
      return deleted;
    })();
  }

  if(needs.chaussures_detail) {
    const shoes=getShoes(); const defaultNames=[P,S,Z];
    const shoeKmTable=[[16,46,69,87,110,126,142,157,174,192,211,228,247,267,287,305,325,346,367,386,396,416,439,459,479,488,498,508,516,533,541,546],[0,0,0,0,0,9,20,29,39,51,65,77,93,110,128,142,160,180,202,216,230,230,230,245,263,263,263,287,287,303,315,315],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,25,56,66,106,106,115,161]];
    extra.chaussures_detail = shoes.map(sh=>{
      const defaultIdx=defaultNames.indexOf(sh.name);
      const baseKm=defaultIdx>=0?(shoeKmTable[defaultIdx][CW-2]||0):(state['shoe_km_'+sh.name]||0);
      let thisWeekKm=0;
      getOrderedWeekSessions(CW).forEach(({s:s2,si,extra:ex,ei})=>{
        if(s2.shoe===sh.name){ if(ex){const d=!!state[`extra_w${CW}_s${ei}_done`];if(d)thisWeekKm+=(state[`extra_w${CW}_s${ei}_km`]!=null?state[`extra_w${CW}_s${ei}_km`]:s2.km);}else{const d=state[gk(CW,si)+'done']||state[gk(CW,si)+'km']!=null;if(d)thisWeekKm+=(state[gk(CW,si)+'km']!=null?state[gk(CW,si)+'km']:s2.km);} }
      });
      const kmReel=baseKm+thisWeekKm;
      return {nom:sh.name, km_parcourus:kmReel, km_max:sh.max, km_restants:Math.max(0,sh.max-kmReel), usure:Math.round(kmReel/sh.max*100)+'%', alerte:kmReel>sh.max*0.9?'Proche limite!':kmReel>sh.max*0.75?'A surveiller':'OK'};
    });
  }

  if(needs.renfo_detail) {
    const renfoDataLocal=[{r:1,name:'Ischio-fessiers',exercises:renfo1},{r:2,name:'Bas du dos',exercises:renfo2}];
    extra.renforcement_detail = {
      programmes: [{nom:'Ischio-fessiers',exercices:renfo1.map(e=>({nom:e.nom,series:e.series}))},{nom:'Bas du dos',exercices:renfo2.map(e=>({nom:e.nom,series:e.series}))}],
      semaine_actuelle: renfoDataLocal.map(rd=>{
        const done=!!state[rfk(CW,rd.r)+'done'];
        const seriesDetail={};
        rd.exercises&&rd.exercises.forEach((ex,ei)=>{ const s=state[rfk(CW,rd.r)+'e'+ei+'_series']; seriesDetail[ex.nom]={fait:s||0,objectif:parseInt((ex.series||'').match(/\d+/)?.[0])||0}; });
        return {nom:rd.name, fait:done, progression_series:seriesDetail};
      }),
      historique: (()=>{
        const hist=[];
        for(let ws=1;ws<CW;ws++){
          renfoDataLocal.forEach(rd=>{ if(!!state['rf'+ws+'r'+rd.r+'done']) hist.push({semaine:ws,nom:rd.name,fait:true}); });
        }
        return hist;
      })()
    };
  }

  if(needs.gels_nutrition) {
    extra.protocole_gels = gels.map(g=>({distance:g.km+'km',nb_gels:g.nb,timing:g.t}));
    extra.nutrition_indicatif = {note:'Données STATIQUES non trackées', calories_cibles:{Lundi:2800,Mardi:2900,Mercredi:2500,Jeudi:3000,Vendredi:2500,Samedi:3300,Dimanche:2500}, calories_consommees_moy:2100};
  }

  if(needs.charge_detail) {
    const coeff={ef:1,long:1.1,tempo:1.5,frac:1.5,race:1.6,rest:0};
    const chargeHist=[];
    for(let ws=Math.max(1,CW-7);ws<=CW;ws++){
      let charge=0;
      weeks[ws-1].sessions.forEach((sess,si)=>{ if(state[`del_w${ws}_s${si}`])return; const k=gk(ws,si); if(!state[k+'done'])return; charge+=(state[k+'km']!=null?state[k+'km']:sess.km)*(coeff[sess.type]||1); });
      chargeHist.push({semaine:ws,charge:Math.round(charge*10)/10});
    }
    extra.charge_detail_8_semaines = chargeHist;
  }

  return extra;
}

// ── PROPOSITIONS DE MODIFICATION DU PLAN ────────────────────────────────────
let _lastCoachProposalText = '';
let _lastUserMessageBeforeProposal = '';
let _currentMemos = null; // Cache local mémos — null = pas encore chargé


