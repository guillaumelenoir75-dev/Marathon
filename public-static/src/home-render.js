let _whoopAlertScheduled = false;

function homeNavToday(){
  homeViewWeek = getEffectiveCW();
  rendered.home = false;
  renderHome();
}

function sendGoalChip(){
  const ob = state.onboarding || {};
  const course = ob.course || 'Marathon';
  const target = ob.target_time || '';
  const q = target
    ? `🏃 Suis-je en bonne voie pour finir en ${target} ?`
    : `🏃 Suis-je en bonne voie pour mon objectif ${course} ?`;
  sendShortcut(q);
}

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
  const todayBtn = document.getElementById('home-today-btn');
  if(todayBtn) todayBtn.style.display = isCurrent ? 'none' : 'inline-block';
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
    // Masquer toute la section progression si 0 km courus
    const progBlock=document.getElementById('home-progression-block');
    if(td===0){
      // Rien couru : masquer barre et totaux, garder seulement la section semaine
      const progGlobal=document.getElementById('h-prog-label')?.closest('div');
      if(progGlobal) progGlobal.style.display='none';
      if(barEl) barEl.parentElement.style.display='none';
      const kmRow=document.getElementById('h-done-km')?.closest('div[style*="justify-content"]');
      if(kmRow) kmRow.style.display='none';
    } else {
      // Barre qui grandit tous les 100km (ou 50km si < 100km courus)
      const step=td<100?50:100;
      const pct=Math.min(100,Math.round((td%step)/step*100));
      if(barEl) barEl.style.width=pct+'%';
      const progLabel=document.getElementById('h-prog-label'); if(progLabel) progLabel.textContent='Km parcourus';
      const doneKmEl=document.getElementById('h-done-km'); if(doneKmEl) doneKmEl.textContent=td.toLocaleString('fr-FR')+' km';
    }
    const gtEl=document.getElementById('h-grand-total'); if(gtEl) gtEl.textContent='';
    const gtLabel=document.getElementById('h-grand-total-label'); if(gtLabel) gtLabel.textContent='';
    const sepEl=document.getElementById('h-sep'); if(sepEl) sepEl.style.display='none';
    const gtBlock=document.getElementById('h-grand-total-block'); if(gtBlock) gtBlock.style.display='none';
  } else {
    const pct=gt>0?Math.round(td/gt*100):0;
    const pctEl=document.getElementById('h-pct'); if(pctEl) pctEl.textContent=gt>0?(pct+'%'):'—';
    const barEl=document.getElementById('h-bar'); if(barEl) barEl.style.width=pct+'%';
    const progLabel=document.getElementById('h-prog-label'); if(progLabel) progLabel.textContent='Progression du plan';
    const doneKmEl=document.getElementById('h-done-km'); if(doneKmEl) doneKmEl.textContent=td.toLocaleString('fr-FR')+' km';
    const gtEl=document.getElementById('h-grand-total'); if(gtEl) gtEl.textContent=gt.toLocaleString('fr-FR')+' km';
    const gtLabel=document.getElementById('h-grand-total-label'); if(gtLabel) gtLabel.textContent='plan complet';
  }
  const kpiRestEl=document.getElementById('kpi-rest'); if(kpiRestEl) kpiRestEl.textContent=gt>0?Math.max(0,gt-td).toLocaleString('fr-FR')+' km':'—';
  const weeksLeftEl=document.getElementById('kpi-weeks-left'); if(weeksLeftEl){
    let wVal;
    if(isAdmin()){
      wVal=Math.max(0,32-CW);
    } else {
      let maxW=0;
      for(let ws=1;ws<=52;ws++){ if(state['extra_w'+ws+'_s0']) maxW=ws; }
      const ACW=getAthleteCW();
      wVal=maxW>0?Math.max(0,maxW-ACW+1):null;
    }
    weeksLeftEl.textContent=wVal!=null?wVal+' sem.':'—';
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
  // ── Infos semaine dans le header ─────────────────────────────────────────────
  const allSessW=getOrderedWeekSessions(w).filter(({s})=>s.type!=='rest');
  const doneCountW=allSessW.filter(({s,si,extra,ei})=>extra?!!state[`extra_w${w}_s${ei}_done`]:!!state[gk(w,si)+'done']).length;
  const weekSessionsEl=document.getElementById('h-week-sessions-label');
  const weekKmEl=document.getElementById('h-week-km-label');
  const allDone=allSessW.length>0&&doneCountW===allSessW.length;
  if(weekSessionsEl){
    weekSessionsEl.textContent=doneCountW+'/'+allSessW.length+' séance'+(allSessW.length!==1?'s':'');
    if(allDone&&isCurrent) weekSessionsEl.textContent+=' ✅';
  }
  if(weekKmEl) weekKmEl.textContent=(weekDoneKm||0)+' / '+getWeekTotalKm(w)+' km';
  // Masquer le bloc semaine si pas de plan
  const weekRow=document.getElementById('h-week-row');
  if(weekRow) weekRow.style.display=allSessW.length===0?'none':'flex';
  // ── Prochaine séance planifiée ───────────────────────────────────────────────
  const nextSchedEl=document.getElementById('h-next-sched');
  const nextSchedTextEl=document.getElementById('h-next-sched-text');
  if(nextSchedEl&&nextSchedTextEl&&isCurrent){
    const rfDaysFull=['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
    let nextSched=null;
    const todayDay=(new Date()).getDay()===0?7:(new Date()).getDay();
    allSessW.forEach(({s,si,extra,ei})=>{
      const done=extra?!!state[`extra_w${w}_s${ei}_done`]:!!state[gk(w,si)+'done'];
      if(done) return;
      let sched=null;try{const sk=extra?`extra_w${w}_s${ei}_sched`:gk(w,si)+'sched';sched=state[sk]?JSON.parse(state[sk]):null;}catch(e){}
      if(!sched||!sched.day) return;
      if(sched.day<todayDay) return; // passé
      if(!nextSched||sched.day<nextSched.day||(sched.day===nextSched.day&&(sched.time||'')>(nextSched.time||'')))
        nextSched={day:sched.day,time:sched.time,title:s.title||'Séance'};
    });
    if(nextSched){
      nextSchedTextEl.textContent=nextSched.title+' · '+rfDaysFull[nextSched.day]+(nextSched.time?' '+nextSched.time:'');
      nextSchedEl.style.display='flex';
    } else {
      nextSchedEl.style.display='none';
    }
  } else if(nextSchedEl) nextSchedEl.style.display='none';
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
    const courseLabels={'5 km':'5 km','10 km':'10 km','Semi-marathon':'Semi','Marathon':'Marathon','Autre':'Course'};
    if(raceDateStr){
      const rd=new Date(raceDateStr);
      const courseName=courseLabels[ob.course]||'Course';
      raceDateEl.textContent='🏁 '+courseName+' · '+rd.toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'});
      raceDateEl.style.display='block';
    } else if(isAdmin()){
      raceDateEl.textContent='🏁 Marathon · 18/10/2026';
      raceDateEl.style.display='block';
    } else {
      raceDateEl.style.display='none';
    }
  }
  // KPI cartes KM restants / Semaines restantes : masquées si pas de course
  const extraStatsRow=document.getElementById('h-extra-stats-row');
  if(extraStatsRow) extraStatsRow.style.display=isPlaisir?'none':'flex';
  // Bloc KPI course : masqué si Plaisir ou pas de course
  const raceKpiBlock=document.getElementById('home-race-kpi-block');
  const noRaceBtn=document.getElementById('home-no-race-btn');
  const marathonTimeBlock=document.getElementById('home-marathon-time-block');
  if(isPlaisir){
    if(raceKpiBlock) raceKpiBlock.style.display='none';
    if(noRaceBtn) noRaceBtn.style.display='block';
    if(marathonTimeBlock) marathonTimeBlock.style.display='none';
    // Masquer la ligne principale (temps marathon / KPIs) — inutile pour Plaisir
    const mainRow=document.getElementById('home-header-main-row');
    if(mainRow) mainRow.style.display='none';
    // Remplir le bloc "Ma pratique" : deux états selon les stats
    const totalSessDone=Object.keys(state).filter(k=>k.endsWith('_done')&&state[k]===true).length;
    const welcomeBlock=document.getElementById('plaisir-welcome-block');
    const statsBlock=document.getElementById('plaisir-stats-block');
    if(totalSessDone===0&&td===0){
      if(welcomeBlock) welcomeBlock.style.display='flex';
      if(statsBlock) statsBlock.style.display='none';
    } else {
      if(welcomeBlock) welcomeBlock.style.display='none';
      if(statsBlock) statsBlock.style.display='block';
      const plaisirKmEl=document.getElementById('plaisir-km-total');
      if(plaisirKmEl) plaisirKmEl.textContent=(td>0?td.toLocaleString('fr-FR'):0)+' km';
      const plaisirSessEl=document.getElementById('plaisir-sess-total');
      if(plaisirSessEl) plaisirSessEl.textContent=totalSessDone;
    }
  } else {
    if(raceKpiBlock) raceKpiBlock.style.display='block';
    if(noRaceBtn) noRaceBtn.style.display='none';
    if(marathonTimeBlock) marathonTimeBlock.style.display='block';
    const mainRowEl=document.getElementById('home-header-main-row');
    if(mainRowEl) mainRowEl.style.display='flex';
    // Curseur uniquement admin
    const predBtn=document.getElementById('home-pred-btn');
    const amTrainBtn=document.getElementById('home-am-train-btn');
    if(predBtn) predBtn.style.cursor=isAdmin()?'pointer':'default';
    if(amTrainBtn){ amTrainBtn.style.cursor=isAdmin()?'pointer':'default'; amTrainBtn.style.display=isAdmin()?'flex':'none'; }
  }
  // Label objectif dynamique selon la course
  const goalLabelEl=document.getElementById('home-goal-label');
  if(goalLabelEl){
    if(isAdmin()) goalLabelEl.textContent='🎯 Objectif marathon';
    else if(isPlaisir) goalLabelEl.textContent='🎯 Mon objectif';
    else{
      const lbl={'5 km':'🎯 Objectif 5 km','10 km':'🎯 Objectif 10 km','Semi-marathon':'🎯 Objectif semi','Marathon':'🎯 Objectif marathon','Autre':'🎯 Mon objectif'}[userCourse]||'🎯 Mon objectif';
      goalLabelEl.textContent=lbl;
    }
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
    const _htb=document.getElementById('home-marathon-time-block');if(_htb)_htb.style.cursor='pointer';
  } else {
    if(predLabelEl) predLabelEl.textContent='/km prédit';
    if(amTrainLabelEl) amTrainLabelEl.textContent='/km AM entr.';
    // Temps marathon projeté (admin)
    const pred = buildMarathonPrediction();
    const mtEl=document.getElementById('kpi-marathon-time');
    if(mtEl) mtEl.textContent = pred.tempsStr || (isAdmin()?(calcMarathonTime(am)||'—'):'—');
    const amPredEl = document.getElementById('h-am-pred');
    if(amPredEl) amPredEl.textContent = pred.amPaceRecoStr || '—';
    const _htb2=document.getElementById('home-marathon-time-block');if(_htb2)_htb2.style.cursor=isAdmin()?'pointer':'default';
  }
  const amRefEl=document.getElementById('kpi-am-ref');
  if(amRefEl) amRefEl.textContent=am;
  const amTrainEl = document.getElementById('kpi-am-training');
  if(amTrainEl) amTrainEl.textContent = state._am_training_pace || (isAdmin()?"5'20":'—');
  const vo2El = document.getElementById('kpi-vo2max');
  if(vo2El) vo2El.textContent = state['vo2max_current'] || (isAdmin()?52:'—');
  const wakeupBtn = document.getElementById('wakeup-btn');
  if (wakeupBtn) {
    if (!isAdmin()) {
      wakeupBtn.style.display = 'none';
    } else {
      wakeupBtn.style.display = 'flex';
      const wakeupDate = (typeof _getWakeupDate === 'function') ? _getWakeupDate() : new Date().toISOString().slice(0, 10);
      if (state['_wakeup_' + wakeupDate]) {
        if (typeof _setWakeupBtnDone === 'function') _setWakeupBtnDone(wakeupBtn);
      }
    }
  }
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
      let renfoSched=null;try{renfoSched=state[rfk(w,rd.r)+'sched']?JSON.parse(state[rfk(w,rd.r)+'sched']):null;}catch(e){}
      const todayDayRenfo=(new Date()).getDay()===0?7:(new Date()).getDay();
      const isRenfoToday=isCurrent&&renfoSched&&renfoSched.day===todayDayRenfo&&!done;
      const rfDays=['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
      const hasSched=renfoSched&&(renfoSched.day||renfoSched.time);
      const rfSchedBadge=hasSched
        ?`<span style="font-size:10px;color:#0C447C;font-weight:700;background:#EEF2FD;padding:2px 8px;border-radius:10px;margin-top:4px;display:inline-flex;align-items:center;gap:3px;">📅 ${[renfoSched.day?rfDays[renfoSched.day]:'',renfoSched.time||''].filter(Boolean).join(' ')}</span>`
        :'';
      const renfoEmoji=getRenfoData(rd.r).emoji||'💪';
      const accentColor=done?'#3B6D11':'#0C447C';
      card.style.cssText='border-radius:14px;display:flex;align-items:center;gap:12px;padding:11px 14px;background:var(--bg);position:relative;'
        +(isCurrent||!isPast?'cursor:pointer;':'cursor:default;')
        +(isRenfoToday?`border:2px solid #0C447C;box-shadow:0 0 0 4px #0C447C15,inset 3px 0 0 #0C447C;`
        :done?`border:1px solid #3B6D1130;background:linear-gradient(90deg,#EAF3DE50,var(--bg));box-shadow:inset 3px 0 0 #3B6D11;`
        :'border:1px solid #d0dff5;box-shadow:inset 3px 0 0 #0C447C;');
      if(isCurrent) card.onclick=()=>showScreen('renfo',rd.r);
      card.innerHTML=`
      ${isRenfoToday?'<span style="position:absolute;top:-1px;right:12px;background:#0C447C;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:0 0 8px 8px;letter-spacing:0.03em;">Aujourd\'hui</span>':''}
      <div style="width:40px;height:40px;border-radius:12px;background:${done?'#EAF3DE':'#E6F0FA'};border:1.5px solid ${done?'#3B6D1125':'#0C447C20'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        ${done
          ?'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B6D11" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
          :`<span style="font-size:18px;line-height:1;">${renfoEmoji}</span>`
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
        ${done
          ?`<div style="width:32px;height:32px;border-radius:50%;background:#3B6D11;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>`
          :isCurrent
          ?`<div style="display:flex;align-items:center;gap:5px;flex-shrink:0;">
              ${(isCurrent||isFuture)?`<span onclick="event.stopPropagation();openRenfoSchedModal(${rd.r},${w})" style="font-size:15px;cursor:pointer;opacity:${hasSched?0.9:0.3};line-height:1;" title="Planifier">📅</span>`:''}
              <button onclick="event.stopPropagation();showScreen('renfo',${rd.r})" style="background:rgba(12,68,124,0.10);color:#0C447C;border:1.5px solid rgba(12,68,124,0.25);border-radius:20px;padding:6px 11px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">
                ${doneSeries>0?`${pct}% →`:'Commencer →'}
              </button>
            </div>`
          :`${hasSched?`<span style="font-size:13px;opacity:0.4;line-height:1;">📅</span>`:''}`
        }
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
          let sched={};try{sched=state[schedKey]?JSON.parse(state[schedKey]):{};}catch(e){}
          const schedTxt = [sched.day?rfDays[sched.day]:'', sched.time||''].filter(Boolean).join(' ')||'À planifier';
          const isPlanned=schedTxt!=='À planifier';
          const nextEmoji=getRenfoData(rd.r).emoji||'💪';
          const btn = document.createElement('div');
          btn.style.cssText=`display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg);border:1px solid ${isPlanned?'#C0CDF5':'#d0dff5'};border-radius:12px;margin-bottom:6px;cursor:pointer;box-shadow:inset 3px 0 0 #0C447C40;`;
          btn.onclick=()=>openRenfoSchedModal(rd.r, cwNext);
          btn.innerHTML=`
            <span style="font-size:16px;line-height:1;">${nextEmoji}</span>
            <span style="font-size:12px;color:var(--text);font-weight:600;flex:1;">${rd.name}</span>
            <span style="font-size:11px;color:${isPlanned?'#1B4FD8':'#9B9B9B'};font-weight:${isPlanned?700:500};background:${isPlanned?'#EEF2FD':'var(--bg2)'};padding:3px 9px;border-radius:8px;">${schedTxt}</span>`;
          renfoNextEl.appendChild(btn);
        });
      }
    }
  }

  // ── Bannière EF auto-calculée (S1) ──────────────────────────────────────────
  if(!isAdmin()){
    const efAutoEl=document.getElementById('home-ef-auto-banner');
    if(efAutoEl){
      if(state.ef_pace_auto==='true'&&!state.ef_pace_auto_seen){
        efAutoEl.style.display='flex';
        const msgEl=document.getElementById('home-ef-auto-msg');
        if(msgEl) msgEl.innerHTML=`Allure EF estimée : <b>${state.ef_pace}/km</b> — calculée d'après ta première semaine. Tu peux l'ajuster dans les paramètres.`;
      } else {
        efAutoEl.style.display='none';
      }
    }
    // Tentative auto-calcul EF au chargement (si S1 validée et EF pas encore défini)
    if(!state.ef_pace&&!window._autoEFChecked){
      window._autoEFChecked=true;
      tryAutoCalculateEF().then(newEF=>{
        if(newEF){ rendered.home=false; rendered.plan=false; renderHome(); }
      });
    }
  }

  // ── Bannière adaptation plan ─────────────────────────────────────────────────
  if(!isAdmin()){
    let adapted=null;try{adapted=state._plan_adapted?JSON.parse(state._plan_adapted):null;}catch(e){}
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
  if(!el) return;
  el.innerHTML='';
  getOrderedWeekSessions(w).forEach(({s:s2,si,extra,ei},i)=>{
    const done=extra?!!state[`extra_w${w}_s${ei}_done`]:!!state[gk(w,si)+'done'];
    const skip=extra?!!state[`extra_w${w}_s${ei}_skip`]:!!state[gk(w,si)+'skip'];
    const skipReason=extra?state[`extra_w${w}_s${ei}_skip_reason`]||'':state[gk(w,si)+'skip_reason']||''
    const rv=extra?state[`extra_w${w}_s${ei}_km`]:state[gk(w,si)+'km'];
    const typeC=typeColor[s2.type]||'#888';
    const typeBgC=typeBg[s2.type]||'#f5f5f5';
    const lbl=typeLabel[s2.type]||'EF';
    const parts=s2.d.split('|');
    const title=normalizeSessionTitle(parts[0], s2.type);
    const detail=filterDetailDisplay(title,parts[1]||null);
    // Horaire planifié
    const _schedDays=['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
    let schedHtml='';
    if(!extra){
      const edRaw=state['edit_w'+w+'_s'+si];
      if(edRaw){let ed;try{ed=JSON.parse(edRaw);}catch(e){}if(ed&&(ed.sched_day||ed.sched_time)){
        schedHtml=`<span style="font-size:10px;color:#9BA8C0;font-weight:600;background:var(--bg2);padding:2px 8px;border-radius:10px;margin-top:4px;display:inline-flex;align-items:center;gap:3px;">📅 ${[ed.sched_day?_schedDays[ed.sched_day]:'',ed.sched_time||''].filter(Boolean).join(' ')}</span>`;
      }}
    } else if(s2.sched_day||s2.sched_time){
      schedHtml=`<span style="font-size:10px;color:#9BA8C0;font-weight:600;background:var(--bg2);padding:2px 8px;border-radius:10px;margin-top:4px;display:inline-flex;align-items:center;gap:3px;">📅 ${[s2.sched_day?_schedDays[s2.sched_day]:'',s2.sched_time||''].filter(Boolean).join(' ')}</span>`;
    }
    // "Aujourd'hui" seulement sur semaine en cours
    const runEdRaw=extra?null:state['edit_w'+w+'_s'+si];
    let runEd=null;try{runEd=runEdRaw?JSON.parse(runEdRaw):null;}catch(e){}
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
    div.style.cssText='border-radius:14px;margin-bottom:8px;display:flex;align-items:center;gap:12px;padding:'+(done?'8px':'11px')+' 14px;background:var(--bg);position:relative;cursor:default;'
      +(isRunToday?`border:2px solid ${typeC};box-shadow:0 0 0 4px ${typeC}15,inset 3px 0 0 ${typeC};`
      :done?`border:1px solid ${typeC}30;background:linear-gradient(90deg,${typeBgC}50,var(--bg));box-shadow:inset 3px 0 0 ${typeC};`
      :skip?'border:1px solid #e5c6c6;background:linear-gradient(90deg,#fff5f550,var(--bg));box-shadow:inset 3px 0 0 #C0392B;'
      :`border:1px solid var(--border);box-shadow:inset 3px 0 0 ${typeC};`)
      +(isPast&&!done&&!skip?'opacity:0.65;':'');
    div.innerHTML=`
      ${isRunToday?`<span style="position:absolute;top:-1px;right:12px;background:${typeC};color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:0 0 8px 8px;letter-spacing:0.03em;">Aujourd'hui</span>`:''}
      ${skip?`<span style="position:absolute;top:-1px;right:12px;background:#C0392B;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:0 0 8px 8px;letter-spacing:0.03em;">✕ ${skipReason||'Non réalisée'}</span>`
      :isPast&&!done?`<span style="position:absolute;top:-1px;right:12px;background:#aaa;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:0 0 8px 8px;letter-spacing:0.03em;">Non faite</span>`:''}
      <div style="width:40px;height:40px;border-radius:12px;background:${skip?'#FDECEA':typeBgC};border:1.5px solid ${skip?'#C0392B':typeC}25;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        ${done
          ?`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${typeC}" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`
          :skip
          ?`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C0392B" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
          :`<span style="font-size:18px;line-height:1;">${(typeof typeEmoji!=='undefined'&&typeEmoji[s2.type])||lbl}</span>`
        }
      </div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
          <span style="font-size:13px;font-weight:600;color:${done?typeC:'#1a2e4a'};">${title}</span>
          
        </div>
        ${!done&&detail?`<p style="font-size:11px;color:${typeC};font-weight:500;opacity:1;margin-top:1px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${detail}</p>`:''}
        ${(()=>{
          if(!done){
            const dur=estimateDuration(s2);
            return dur?`<span style="font-size:10px;color:#6B8DB5;font-weight:500;">⏱ ~${dur}</span>`:'';
          }
          const perfRaw = extra ? state[`extra_w${w}_s${ei}_perf`] : state[gk(w,si)+'perf'];
          let perf2={};try{perf2=perfRaw?JSON.parse(perfRaw):{}}catch(e){}
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
        ${canEdit&&!done?`<button onclick="${editFn}" style="background:transparent;color:#6B8DB5;border:1.5px solid #d0dff5;border-radius:20px;padding:6px 10px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:4px;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Éditer
        </button>`:''}
        ${isCurrent?`<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
          ${done
            ?`<div onclick="${doneFn}" style="width:32px;height:32px;border-radius:50%;background:${typeC};display:flex;align-items:center;justify-content:center;cursor:pointer;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>`
            :skip
            ?`<div onclick="${doneFn}" style="width:32px;height:32px;border-radius:50%;border:2px solid #C0392B;background:#FDECEA;display:flex;align-items:center;justify-content:center;cursor:pointer;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C0392B" stroke-width="2.5"><line x1="17" y1="7" x2="7" y2="17"/><line x1="7" y1="7" x2="17" y2="17"/></svg>
            </div>`
            :`<button onclick="${doneFn}" style="background:${typeC};color:#fff;border:none;border-radius:20px;padding:7px 12px;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap;box-shadow:0 2px 8px ${typeC}55;letter-spacing:0.01em;">✓ Valider</button>`
          }
        </div>`:done?`<div style="width:32px;height:32px;border-radius:50%;border:2px solid ${typeC};background:${typeC};display:flex;align-items:center;justify-content:center;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        </div>`:skip?`<div style="width:32px;height:32px;border-radius:50%;border:2px solid #C0392B;background:#FDECEA;display:flex;align-items:center;justify-content:center;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C0392B" stroke-width="2.5"><line x1="17" y1="7" x2="7" y2="17"/><line x1="7" y1="7" x2="17" y2="17"/></svg>
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
  // Bannière réveil (6h–14h, non encore enregistré)
  if (typeof checkWakeupBanner === 'function') checkWakeupBanner();
  // Alerte token WHOOP expiré — délai 25s pour laisser la sync rafraîchir le token (1 seul timer par session)
  if (!_whoopAlertScheduled) { _whoopAlertScheduled = true; setTimeout(_checkWhoopTokenAlert, 25000); }
}

function _checkWhoopTokenAlert() {
  if (!isAdmin()) return;
  const token = state.whoop_token;
  if (!token || !token.access_token) return; // pas connecté → pas d'alerte
  if (state.whoop_data) return; // sync récente OK → pas d'alerte
  const existing = document.getElementById('whoop-token-alert');
  const isExpired = token.expires_at && (Date.now() / 1000 > token.expires_at - 60);
  if (!isExpired) { if (existing) existing.remove(); return; }
  if (existing) return; // déjà affiché
  const banner = document.createElement('div');
  banner.id = 'whoop-token-alert';
  banner.style.cssText = 'margin:0 0 10px;background:linear-gradient(135deg,#fff7ed,#ffedd5);border:1.5px solid #fb923c;border-radius:14px;padding:12px 14px;display:flex;align-items:center;gap:12px;cursor:pointer;box-shadow:0 2px 8px rgba(251,146,60,0.25);';
  banner.innerHTML = '<span style="font-size:22px;flex-shrink:0;">⚡</span>'
    + '<div style="flex:1;">'
    + '<p style="font-size:13px;font-weight:700;color:#c2410c;margin:0 0 2px;">Connexion WHOOP expirée</p>'
    + '<p style="font-size:11px;color:#9a3412;margin:0;">Touche ici pour te reconnecter dans Compte → WHOOP</p>'
    + '</div>'
    + '<span style="font-size:16px;color:#fb923c;">›</span>';
  banner.onclick = () => showScreen('compte');
  const progressionBlock = document.getElementById('home-progression-block');
  if (progressionBlock && progressionBlock.parentElement) progressionBlock.parentElement.insertBefore(banner, progressionBlock);
}

function toggleDoneExtra(w,ei){
  const k=`extra_w${w}_s${ei}`;
  const doneK=k+'_done';
  const wasDone=!!state[doneK];
  const wasSkip=!!state[k+'_skip'];
  if(!wasDone&&!wasSkip){
    openValidationModalExtra(w,ei);
  } else if(wasSkip){
    // Clic sur une séance non-réalisée → rouvrir la validation pour modifier
    openValidationModalExtra(w,ei);
  } else {
    confirmUndoSession(()=>{
    state[doneK]=false;
    delete state[k+'_km'];
    delete state[k+'_perf'];
    delete state[k+'_skip'];
    delete state[k+'_skip_reason'];
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
    });
  }
}

function openValidationModalExtra(w,ei){
  // Reset Strava, météo et WHOOP comme pour openValidationModal
  window._meteoValidationData = null;
  window._stravaActivityData = null;
  window._whoopChargeData = null;
  let s={};try{s=JSON.parse(state[`extra_w${w}_s${ei}`]||'{}');}catch(e){}
  const parts=(s.d||'').split('|');
  const title=normalizeSessionTitle(parts[0], s.type);
  const detail=filterDetailDisplay(title, parts[1]||null);
  const _headerColor={ef:'#3B6D11',tempo:'#E8530A',frac:'#C4141B',long:'#534AB7',race:'#0C447C'}[s.type]||'#0C447C';
  const kmVal=state[`extra_w${w}_s${ei}_km`]!=null?state[`extra_w${w}_s${ei}_km`]:s.km||0;
  let prev={};try{prev=state[`extra_w${w}_s${ei}_perf`]?JSON.parse(state[`extra_w${w}_s${ei}_perf`]):{};}catch(e){}
  const isAlreadySkipped=!!state[`extra_w${w}_s${ei}_skip`];
  // Stocker le contexte pour Strava (_applyStravaToValidation)
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
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;margin-top:2px;">
          <button onclick="closeModal()" style="background:rgba(255,255,255,0.2);border:none;cursor:pointer;color:#fff;font-size:18px;line-height:1;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">×</button>
        </div>
      </div>
    </div>
    <!-- Zone scrollable identique -->
    <div class="modal-scroll-body">
    <div style="padding:16px 16px 0;">
    <!-- Bannière import -->
    <div style="background:#FFF8F0;border:1px solid #F0A070;border-radius:12px;padding:10px 12px;margin-bottom:12px;">
      <p style="font-size:11px;font-weight:700;color:#7A3B00;margin:0 0 8px;">⚡ Remplis automatiquement</p>
      <div style="display:flex;gap:7px;">
        <div style="flex:1;display:flex;flex-direction:column;align-items:stretch;gap:3px;">
          <button id="strava-val-btn" onclick="importFromStrava()" style="padding:8px 6px;background:#FC4C02;border:none;border-radius:10px;color:#fff;font-size:12px;font-weight:800;cursor:pointer;">🔶 Strava</button>
          <span style="font-size:9px;color:#7A3B00;text-align:center;line-height:1.2;">Remplit km, durée<br>et allure auto</span>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;align-items:stretch;gap:3px;">
          <button id="meteo-val-btn" onclick="importMeteoValidation()" style="padding:8px 6px;background:#1B4FD8;border:none;border-radius:10px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">🌤 Météo</button>
          <span style="font-size:9px;color:#7A3B00;text-align:center;line-height:1.2;">Ajoute météo pour<br>analyser la séance</span>
        </div>
        ${isAdmin()?`<div style="flex:1;display:flex;flex-direction:column;align-items:stretch;gap:3px;"><button id="whoop-val-btn" onclick="importWhoopForPerfEditExtra(${w},${ei})" style="padding:8px 6px;background:#000;border:none;border-radius:10px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">⚫ WHOOP</button><span style="font-size:9px;color:#7A3B00;text-align:center;line-height:1.2;">FC & récupération<br>depuis WHOOP</span></div>`:''}
      </div>
    </div>
    <div id="meteo-val-preview" style="display:none;background:linear-gradient(135deg,#EDF2FB,#dce8f8);border:1px solid rgba(12,68,124,0.2);border-radius:10px;padding:10px 14px;margin-bottom:12px;"></div>
    <div id="whoop-val-preview" style="display:none;margin-bottom:12px;"></div>
    <div style="background:#F0F4FF;border:1px solid #C0CDF5;border-radius:10px;padding:8px 12px;font-size:12px;font-weight:600;color:#2B4AAA;margin-bottom:10px;">💡 Si tu as couru <b>moins que prévu</b>, modifie le champ km — le plan s'adapte automatiquement.</div>
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
          <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Durée <span style="font-size:10px;font-weight:400;">(h:mm:ss)</span></p>
          <input type="text" inputmode="numeric" id="val-dur" value="${prev.dur||''}" placeholder="1:05:30" maxlength="8" oninput="onDurInput(this)"
            style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:11px;font-size:20px;font-weight:800;color:var(--text);width:100%;outline:none;text-align:center;">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Allure moy. <span style="font-size:10px;font-weight:400;">(calculée auto)</span></p>
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
        let html='<div id="val-blocs-container" style="margin-top:12px;"><p style="font-size:12px;font-weight:600;color:'+_bColor+';margin-bottom:4px;">'+_bLabel+'</p><p style="font-size:10px;color:#888;margin-bottom:8px;">Facultatif — renseigne l\'allure de chaque bloc d\'après ta montre.</p>';
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
      ${isAlreadySkipped
        ?`<button onclick="clearSkipExtra(${w},${ei})" style="width:100%;margin-top:10px;padding:11px;background:#FEF3F2;border:1.5px solid #C0392B;border-radius:14px;font-size:13px;font-weight:700;color:#C0392B;cursor:pointer;">↩ Annuler — Remettre en attente</button>`
        :`<button onclick="toggleSkipReasonPicker()" style="width:100%;margin-top:10px;padding:11px;background:transparent;border:1.5px dashed #C0392B;border-radius:14px;font-size:13px;font-weight:700;color:#C0392B;cursor:pointer;">✕ Séance non réalisée</button>`
      }
      <div id="skip-reason-picker" style="display:none;margin-top:10px;">
        <p style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:8px;text-align:center;">Pourquoi cette séance n'a pas été réalisée ?</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;" id="skip-reason-chips"></div>
        <button id="skip-confirm-btn" onclick="saveSkipExtra(${w},${ei})" disabled style="width:100%;margin-top:12px;padding:11px;background:#C0392B;border:none;border-radius:14px;font-size:13px;font-weight:800;color:#fff;cursor:pointer;opacity:0.4;">Confirmer — Non réalisée</button>
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

const _SKIP_REASONS=['Malade','Blessé(e)','Fatigue','Manque de temps','Météo','Travail','Flemme','Autre'];

function toggleSkipReasonPicker(){
  const picker=document.getElementById('skip-reason-picker');
  if(!picker) return;
  const isOpen=picker.style.display!=='none';
  picker.style.display=isOpen?'none':'block';
  if(!isOpen){
    const chipsEl=document.getElementById('skip-reason-chips');
    chipsEl.innerHTML=_SKIP_REASONS.map(r=>`
      <button onclick="selectSkipReason(this,'${r}')" style="padding:6px 14px;background:var(--bg2);border:1.5px solid var(--border);border-radius:20px;font-size:12px;font-weight:600;color:var(--text);cursor:pointer;" data-reason="${r}">${r}</button>
    `).join('');
  }
}

function selectSkipReason(btn, reason){
  document.querySelectorAll('#skip-reason-chips button').forEach(b=>{
    b.style.background='var(--bg2)';b.style.borderColor='var(--border)';b.style.color='var(--text)';
  });
  btn.style.background='#FDECEA';btn.style.borderColor='#C0392B';btn.style.color='#C0392B';
  const confirmBtn=document.getElementById('skip-confirm-btn');
  if(confirmBtn){confirmBtn.disabled=false;confirmBtn.style.opacity='1';}
  window._selectedSkipReason=reason;
}

async function saveSkipExtra(w,ei){
  const reason=window._selectedSkipReason||'';
  if(!reason) return;
  const k=`extra_w${w}_s${ei}`;
  // Effacer done/km/perf si la séance était précédemment validée
  state[k+'_done']=false;
  delete state[k+'_km'];
  delete state[k+'_perf'];
  state[k+'_skip']=true;
  state[k+'_skip_reason']=reason;
  window._selectedSkipReason=null;
  save();
  closeModal();
  renderHome();
  rendered.plan=false;
  if(document.getElementById('sc-plan').style.display!=='none') renderPlan();
}

async function saveSkipValidation(idx){
  const reason=window._selectedSkipReason||'';
  if(!reason) return;
  const k=gk(CW,idx);
  state[k+'done']=false; delete state[k+'km']; delete state[k+'perf'];
  state[k+'skip']=true; state[k+'skip_reason']=reason;
  window._selectedSkipReason=null;
  save(); closeModal(); renderHome();
  rendered.plan=false;
  if(document.getElementById('sc-plan').style.display!=='none') renderPlan();
}

function clearSkipValidation(idx){
  const k=gk(CW,idx);
  delete state[k+'skip']; delete state[k+'skip_reason'];
  save(); closeModal(); renderHome();
  rendered.plan=false;
  if(document.getElementById('sc-plan').style.display!=='none') renderPlan();
}

function clearSkipExtra(w,ei){
  const k=`extra_w${w}_s${ei}`;
  delete state[k+'_skip']; delete state[k+'_skip_reason'];
  save(); closeModal(); renderHome();
  rendered.plan=false;
  if(document.getElementById('sc-plan').style.display!=='none') renderPlan();
}

function dismissEFAutoBanner(){
  state.ef_pace_auto_seen='true';
  if(dbRef) dbRef.child('ef_pace_auto_seen').set('true').catch(()=>{});
  const el=document.getElementById('home-ef-auto-banner');
  if(el) el.style.display='none';
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
  Object.keys(state).filter(k=>/^extra_w\d+_s\d+$/.test(k)&&k.startsWith(wStr)).forEach(k=>{
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
  delete state[k+'_skip'];
  delete state[k+'_skip_reason'];
  const perf={};
  if(dur) perf.dur=dur;
  if(pace) perf.pace=pace;
  if(hr) perf.hr=hr;
  if(dateVal) perf.date=dateVal;
  // Blocs Tempo/Frac
  let sExtra={};try{sExtra=JSON.parse(state[k]||'{}');}catch(e){}
  if(sExtra.type==='tempo'||sExtra.type==='frac'){
    const tmatch=(sExtra.d||'').split('|')[0].match(/(\d+)[x\u00d7]/i);
    const nbB=tmatch?parseInt(tmatch[1]):2;
    const blocsAllure=[];
    for(let i=0;i<nbB;i++){const el=document.getElementById('val-bloc-'+i);blocsAllure.push(el&&el.value.trim()?el.value.trim():'');}
    if(blocsAllure.some(b=>b)) perf.blocsAllure=blocsAllure;
  }
  // Strava — même logique que saveValidation
  if(window._stravaActivityData){
    const g=window._stravaActivityData;
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
      let ex={};try{ex=state[k+'_perf']?JSON.parse(state[k+'_perf']):{}}catch(e){}
      Object.assign(perf,ex);
      perf.strava=stravaData;
    }
    window._stravaActivityData=null;
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
  // Rappel shaker 30 min après la validation d'une séance (admin uniquement)
  if(isAdmin() && dbRef && sExtra.type !== 'rest') {
    dbRef.child('_shaker_run_ts').set(Date.now() + 30 * 60 * 1000).catch(()=>{});
  }
  // Supprimer le brief du matin si la séance validée est celle du jour (admin)
  if(isAdmin() && dbRef && sExtra.type !== 'rest') {
    const _todaySchedX=(d=>{return d===0?7:d;})(new Date().getDay());
    if(sExtra.sched_day===_todaySchedX) {
      dbRef.child('_brief_pending').remove().catch(()=>{});
    }
  }
  renderHome();
  rendered.plan=false;
  rendered.stats=false;
  if(document.getElementById('sc-plan').style.display!=='none') renderPlan();
  if(document.getElementById('sc-stats').style.display!=='none') renderStats();
  const amImproved=updateMarathonPace();
  // Auto-calcul EF depuis S1 si jamais renseigné
  if(w===1&&!state.ef_pace&&!isAdmin()){
    window._autoEFChecked=true; // éviter doublon dans renderHome
    tryAutoCalculateEF().then(newEF=>{
      if(newEF){ rendered.plan=false; renderHome(); }
    });
  }
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
    let existing={};try{existing=state[perfKey]?JSON.parse(state[perfKey]):{}}catch(e){}
    existing.meteo=meteoSeance;
    state[perfKey]=JSON.stringify(existing);
    if(dbRef) dbRef.child(perfKey).set(state[perfKey]).catch(()=>{});
    rendered.stats=false;
  }
  // Sauvegarder la charge WHOOP dans perf
  const whoopChargeExtra = window._whoopChargeData || null;
  window._whoopChargeData = null;
  if(whoopChargeExtra){
    const perfKey=k+'_perf';
    let existing={};try{existing=state[perfKey]?JSON.parse(state[perfKey]):{}}catch(e){}
    existing.whoop=whoopChargeExtra;
    state[perfKey]=JSON.stringify(existing);
    if(dbRef) dbRef.child(perfKey).set(state[perfKey]).catch(()=>{});
    rendered.stats=false;
  }
  if(isAdmin()){ closeModal(); showCoachFeedback(sExtra,km,pace,hr,amImproved,null,meteoSeance,whoopChargeExtra); }
  else { closeModal(); showAthleteFeedback(sExtra,km,pace,hr,perf,meteoSeance); }
}

function openValidationModal(idx){
  // Réinitialiser météo, Strava et WHOOP précédents
  window._meteoValidationData = null;
  window._stravaActivityData = null;
  window._whoopChargeData = null;
  // Reset les previews pour ne pas afficher les résultats d'une session précédente
  const _prevReset = document.getElementById('meteo-val-preview');
  if (_prevReset) { _prevReset.style.display = 'none'; _prevReset.innerHTML = ''; }
  const _whoopPrevReset = document.getElementById('whoop-val-preview');
  if (_whoopPrevReset) { _whoopPrevReset.style.display = 'none'; _whoopPrevReset.innerHTML = ''; }
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
  const title=normalizeSessionTitle(parts[0], s.type);
  const detail=filterDetailDisplay(title, parts[1]||null);
  const c=typeColor[s.type]||'#888';
  const bg=typeBg[s.type]||'#f5f5f5';
  const lbl=typeLabel[s.type]||'EF';
  let prev={};try{prev=state[gk(CW,idx)+'perf']?JSON.parse(state[gk(CW,idx)+'perf']):{}}catch(e){}
  const kmVal=state[gk(CW,idx)+'km']!=null?state[gk(CW,idx)+'km']:s.km;
  const isAlreadySkipped=!!state[gk(CW,idx)+'skip'];
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
        <button onclick="closeModal()" style="background:rgba(255,255,255,0.2);border:none;cursor:pointer;color:#fff;font-size:18px;line-height:1;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">×</button>
      </div>
    </div>
    <!-- Zone scrollable -->
    <div class="modal-scroll-body">
    <div style="padding:16px 16px 0;">
    <!-- Bannière import -->
    <div style="background:#FFF8F0;border:1px solid #F0A070;border-radius:12px;padding:10px 12px;margin-bottom:12px;">
      <p style="font-size:11px;font-weight:700;color:#7A3B00;margin:0 0 8px;">⚡ Remplis automatiquement</p>
      <div style="display:flex;gap:7px;">
        <div style="flex:1;display:flex;flex-direction:column;align-items:stretch;gap:3px;">
          <button id="strava-val-btn" onclick="importFromStrava()" style="padding:8px 6px;background:#FC4C02;border:none;border-radius:10px;color:#fff;font-size:12px;font-weight:800;cursor:pointer;">🔶 Strava</button>
          <span style="font-size:9px;color:#7A3B00;text-align:center;line-height:1.2;">Remplit km, durée<br>et allure auto</span>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;align-items:stretch;gap:3px;">
          <button id="meteo-val-btn" onclick="importMeteoValidation()" style="padding:8px 6px;background:#1B4FD8;border:none;border-radius:10px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">🌤 Météo</button>
          <span style="font-size:9px;color:#7A3B00;text-align:center;line-height:1.2;">Ajoute météo pour<br>analyser la séance</span>
        </div>
        ${isAdmin()?`<div style="flex:1;display:flex;flex-direction:column;align-items:stretch;gap:3px;"><button id="whoop-val-btn" onclick="importWhoopForValidation()" style="padding:8px 6px;background:#000;border:none;border-radius:10px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">⚫ WHOOP</button><span style="font-size:9px;color:#7A3B00;text-align:center;line-height:1.2;">FC & récupération<br>depuis WHOOP</span></div>`:''}
      </div>
    </div>
    <div id="meteo-val-preview" style="display:none;background:linear-gradient(135deg,#EDF2FB,#dce8f8);border:1px solid rgba(12,68,124,0.2);border-radius:10px;padding:10px 14px;margin-bottom:12px;"></div>
    <div id="whoop-val-preview" style="display:none;margin-bottom:12px;"></div>
    <div style="background:#F0F4FF;border:1px solid #C0CDF5;border-radius:10px;padding:8px 12px;font-size:12px;font-weight:600;color:#2B4AAA;margin-bottom:10px;">💡 Si tu as couru <b>moins que prévu</b>, modifie le champ km — le plan s'adapte automatiquement.</div>
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
          <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Durée <span style="font-size:10px;font-weight:400;">(h:mm:ss)</span></p>
          <input type="text" inputmode="numeric" id="val-dur" value="${prev.dur||''}" placeholder="1:05:30" maxlength="8" oninput="onDurInput(this)"
            style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:11px;font-size:20px;font-weight:800;color:var(--text);width:100%;outline:none;text-align:center;">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Allure moy. <span style="font-size:10px;font-weight:400;">(calculée auto)</span></p>
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
      ${isAlreadySkipped
        ?`<button onclick="clearSkipValidation(${idx})" style="width:100%;margin-top:10px;padding:11px;background:#FEF3F2;border:1.5px solid #C0392B;border-radius:14px;font-size:13px;font-weight:700;color:#C0392B;cursor:pointer;">↩ Annuler — Remettre en attente</button>`
        :`<button onclick="toggleSkipReasonPicker()" style="width:100%;margin-top:10px;padding:11px;background:transparent;border:1.5px dashed #C0392B;border-radius:14px;font-size:13px;font-weight:700;color:#C0392B;cursor:pointer;">✕ Séance non réalisée</button>`
      }
      <div id="skip-reason-picker" style="display:none;margin-top:10px;">
        <p style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:8px;text-align:center;">Pourquoi cette séance n'a pas été réalisée ?</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;" id="skip-reason-chips"></div>
        <button id="skip-confirm-btn" onclick="saveSkipValidation(${idx})" disabled style="width:100%;margin-top:12px;padding:11px;background:#C0392B;border:none;border-radius:14px;font-size:13px;font-weight:800;color:#fff;cursor:pointer;opacity:0.4;">Confirmer — Non réalisée</button>
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
  else if(digits.length===5) fmt=digits.slice(0,1)+':'+digits.slice(1,3)+':'+digits.slice(3);
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
  delete state[k+'skip']; delete state[k+'skip_reason'];
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
  if(window._stravaActivityData) {
    const g = window._stravaActivityData;
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
      let existing={};try{existing=state[k+'perf']?JSON.parse(state[k+'perf']):{}}catch(e){}
      existing.strava = stravaData;
      state[k+'perf'] = JSON.stringify(existing);
    }
    window._stravaActivityData = null;
  }
  save();
  // Enregistrer le timestamp de dernière validation pour les félicitations
  if(dbRef) dbRef.child('_last_validation_w'+CW).set(Date.now()).catch(()=>{});
  // Rappel shaker 30 min après la validation d'une séance de course (admin uniquement)
  if(isAdmin() && dbRef && s.type !== 'rest') {
    dbRef.child('_shaker_run_ts').set(Date.now() + 30 * 60 * 1000).catch(()=>{});
  }
  // Supprimer le brief du matin si la séance validée est celle du jour (admin)
  if(isAdmin() && dbRef && s.type !== 'rest') {
    const _todaySched=(d=>{return d===0?7:d;})(new Date().getDay());
    let _ed=null;try{_ed=state['edit_w'+CW+'_s'+idx]?JSON.parse(state['edit_w'+CW+'_s'+idx]):null;}catch(e){}
    if(_ed && _ed.sched_day===_todaySched) {
      dbRef.child('_brief_pending').remove().catch(()=>{});
      dbRef.child('_brief_kept').remove().catch(()=>{});
      // Supprimer aussi du DOM et de l'historique coach
      if(typeof dismissBrief === 'function') dismissBrief();
    }
  }
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
        let _ed=null;try{_ed=state['edit_w'+CW+'_s'+idx]?JSON.parse(state['edit_w'+CW+'_s'+idx]):null;}catch(e){}
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
    let existing={};try{existing=state[perfKey]?JSON.parse(state[perfKey]):{}}catch(e){}
    existing.meteo=meteoSeance;
    state[perfKey]=JSON.stringify(existing);
    if(dbRef) dbRef.child(perfKey).set(state[perfKey]).catch(()=>{});
    rendered.stats=false;
  }
  // Sauvegarder la charge WHOOP dans perf
  const whoopCharge = window._whoopChargeData || null;
  window._whoopChargeData = null;
  if(whoopCharge){
    const perfKey=k+'perf';
    let existing={};try{existing=state[perfKey]?JSON.parse(state[perfKey]):{}}catch(e){}
    existing.whoop=whoopCharge;
    state[perfKey]=JSON.stringify(existing);
    if(dbRef) dbRef.child(perfKey).set(state[perfKey]).catch(()=>{});
    rendered.stats=false;
  }
  if(isAdmin()) showCoachFeedback(s, km, pace, hr, amImproved, idx, meteoSeance, whoopCharge);
  else showAthleteFeedback(s, km, pace, hr, perf, meteoSeance);
}

// ── MODIFICATION MANUELLE DE L'ALLURE EF ─────────────────────────────────────
function openEditEFModal(){
  if(document.getElementById('ef-edit-overlay')) return;
  const current = state.ef_pace || getBestEfPace() || "6'40";
  const overlay = document.createElement('div');
  overlay.id = 'ef-edit-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:flex-end;padding:0;';
  overlay.innerHTML = `
    <div style="width:100%;background:#fff;border-radius:20px 20px 0 0;padding:24px 20px max(20px,env(safe-area-inset-bottom));box-shadow:0 -4px 30px rgba(0,0,0,0.15);">
      <div style="width:36px;height:4px;background:#E0E0E0;border-radius:2px;margin:0 auto 20px;"></div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#0C447C,#1565C0);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        </div>
        <div>
          <p style="font-size:16px;font-weight:800;color:#0C447C;margin:0;">Allure EF</p>
          <p style="font-size:12px;color:#888;margin:2px 0 0;">Endurance fondamentale — FC 140-148 bpm</p>
        </div>
      </div>
      <p style="font-size:13px;color:#666;margin:12px 0 6px;">Saisir l'allure cible (ex : <b>5'45</b> ou <b>6'10</b>)</p>
      <input id="ef-pace-input" type="text" inputmode="text" placeholder="ex : 5'45" value="${current}"
        style="width:100%;box-sizing:border-box;font-size:28px;font-weight:800;color:#0C447C;text-align:center;border:2px solid #E0E0E0;border-radius:14px;padding:14px;outline:none;background:#F8FAFF;font-family:inherit;"
        oninput="this.style.borderColor='#0C447C'">
      <p id="ef-edit-err" style="color:#E24B4A;font-size:12px;text-align:center;margin:6px 0 0;min-height:18px;"></p>
      <button onclick="saveEditEF()" style="margin-top:12px;width:100%;padding:16px;background:linear-gradient(135deg,#0C447C,#1565C0);color:#fff;border:none;border-radius:14px;font-size:16px;font-weight:800;cursor:pointer;box-shadow:0 4px 14px rgba(12,68,124,0.35);">Enregistrer</button>
    </div>`;
  overlay.onclick = e => { if(e.target === overlay) closeEditEFModal(); };
  document.getElementById('modal-container').appendChild(overlay);
  setTimeout(() => { const inp = document.getElementById('ef-pace-input'); if(inp){ inp.focus(); inp.select(); } }, 300);
  if(typeof _lockBodyScroll === 'function') _lockBodyScroll();
}

function closeEditEFModal(){
  const o = document.getElementById('ef-edit-overlay');
  if(o) o.remove();
  if(typeof _unlockBodyScroll === 'function') _unlockBodyScroll();
}

function saveEditEF(){
  const raw = (document.getElementById('ef-pace-input')?.value || '').trim();
  const err = document.getElementById('ef-edit-err');
  // Normaliser : accepte "5:45", "5'45", "5′45", "545", "5.45" et toute variante typographique
  const norm = raw.replace(/[^0-9]/g, ':').replace(/:+/g, ':').replace(/^:|:$/g, '');
  const m = norm.match(/^(\d):([0-5]\d)$|^(\d{1,2}):([0-5]\d)$/);
  let mins, secs;
  if(m){
    mins = parseInt(m[1]||m[3]); secs = parseInt(m[2]||m[4]);
  } else if(/^\d{3,4}$/.test(raw.replace(/[':]/g,''))){
    const digits = raw.replace(/[':]/g,'');
    mins = parseInt(digits.slice(0,-2)); secs = parseInt(digits.slice(-2));
  } else {
    if(err) err.textContent = 'Format invalide — essaie 5\'45 ou 6\'10';
    document.getElementById('ef-pace-input')?.style && (document.getElementById('ef-pace-input').style.borderColor='#E24B4A');
    return;
  }
  const total = mins * 60 + secs;
  if(total < 240 || total > 540){
    if(err) err.textContent = 'Allure hors plage (entre 4\'00 et 9\'00/km)';
    return;
  }
  const formatted = mins + "'" + String(secs).padStart(2,'0');
  state.ef_pace = formatted;
  save();
  closeEditEFModal();
  rendered.home = false;
  renderHome();
  if(document.getElementById('sc-plan')?.style.display !== 'none'){ rendered.plan=false; renderPlan(); }
}

