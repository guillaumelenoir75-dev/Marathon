let _obStep=0;
let _obData={course:null,date:null,sessions:null,niveau:null,km_semaine:null,generate_plan:null};
let _obEditMode=false;
let _obSaving=false; // garde contre double-save
const _OB_SESS_MIN={
  'Semi-marathon':{Débutant:2,Intermédiaire:3,Confirmé:3},
  'Marathon':     {Débutant:3,Intermédiaire:3,Confirmé:3},
};
const _OB_KM_MIN_WARN={
  'Marathon':     {Débutant:15,Intermédiaire:25,Confirmé:40},
  'Semi-marathon':{Débutant:10,Intermédiaire:20,Confirmé:30},
  '10 km':        {Débutant:5, Intermédiaire:10,Confirmé:20},
  '5 km':         {Débutant:5, Intermédiaire:8, Confirmé:15},
};
var KNOWN_RACES = {
  'Marathon': [
    {name:'Marathon du Médoc', date:'2026-09-05', emoji:'🍷'},
    {name:'Berlin Marathon', date:'2026-09-27', emoji:'🇩🇪'},
    {name:'Lyon Marathon', date:'2026-10-04', emoji:'🏙️'},
    {name:'Amsterdam Marathon', date:'2026-10-18', emoji:'🇳🇱'},
    {name:'Toulouse Marathon', date:'2026-10-18', emoji:'🌸'},
    {name:'Lausanne Marathon', date:'2026-10-25', emoji:'🇨🇭'},
    {name:'Frankfurt Marathon', date:'2026-10-25', emoji:'🇩🇪'},
    {name:'Paris Marathon', date:'2027-04-11', emoji:'🗼'},
    {name:'Rotterdam Marathon', date:'2027-04-11', emoji:'🇳🇱'},
  ],
  'Semi-marathon': [
    {name:'Semi Tours', date:'2026-09-13', emoji:'🏰'},
    {name:'Semi Boulogne', date:'2026-09-20', emoji:'🌊'},
    {name:'Semi de Paris', date:'2027-03-07', emoji:'🗼'},
    {name:'Semi de Lyon', date:'2027-01-17', emoji:'🏙️'},
    {name:'Semi Bordeaux', date:'2027-02-07', emoji:'🍇'},
  ],
  '10 km': [
    {name:'10 km de Paris', date:'2026-11-01', emoji:'🗼'},
    {name:'10 km de Lyon', date:'2026-10-11', emoji:'🏙️'},
  ],
  '5 km': [
    {name:'5 km parkrun', date:'2026-07-04', emoji:'🌳'},
  ],
};

function _obShowAdaptiveTip(field) {
  if (field === 'sessions') {
    var el = document.getElementById('ob-sessions-tip');
    if (!el) return;
    var v = String(_obData.sessions);
    var msgs = {
      '1': '⚠️ 1 séance/semaine : progression lente mais possible pour commencer.',
      '2': '✓ 2 séances : bon équilibre, progression régulière.',
      '3': '✓ 3 séances : format optimal — EF, tempo et sortie longue bien répartis.',
      '4': '✓ 4 séances : programme intensif idéal pour viser un chrono précis.'
    };
    var msg = msgs[v];
    if (msg) { el.textContent = msg; el.style.display = ''; }
    else { el.style.display = 'none'; }
  } else if (field === 'niveau') {
    var el = document.getElementById('ob-niveau-tip');
    if (!el) return;
    var msgs = {
      'Découverte': '🌱 Programme marche-course progressif sur 8-12 semaines, sans pression de chrono.',
      'Débutant': '🏁 Plan axé sur la régularité et l\'arrivée confortable — premier objectif atteint !',
      'Intermédiaire': '📈 Plan EF + tempo équilibré pour progresser sur ton chrono.',
      'Confirmé': '🏆 Plan structuré avec intervalles, tempos et sorties longues — objectif chrono.'
    };
    var msg = msgs[_obData.niveau];
    if (msg) { el.textContent = msg; el.style.display = ''; }
    else { el.style.display = 'none'; }
  } else if (field === 'km_semaine') {
    var el = document.getElementById('ob-km-tip');
    if (!el) return;
    var v = String(_obData.km_semaine);
    var presets = {
      '10': '📦 Base modeste : le plan progressera doucement pour éviter les blessures.',
      '20': '✓ Bonne base pour démarrer. Le plan pourra viser un pic de 45-55 km/sem.',
      '30': '✓ Solide ! Avec 30 km/sem de base, les séances de qualité seront bien assimilées.',
      '40': '⚡ Excellent volume de base. Plan ambitieux avec des séances longues bien chargées.'
    };
    if (presets[v]) {
      el.textContent = presets[v];
      el.style.display = '';
    } else {
      var km = parseInt(v, 10);
      if (!isNaN(km) && km > 0) {
        var mult = (_obData.course === 'Marathon') ? 1.8 : 1.5;
        var peak = Math.round(km * mult);
        el.textContent = '✓ Avec ' + km + ' km/sem de base, le plan pourra viser un pic estimé à ~' + peak + ' km/sem.';
        el.style.display = '';
      } else {
        el.style.display = 'none';
      }
    }
  }
}

function _obShowDateContext() {
  var el = document.getElementById('ob-date-context');
  if (!el || !_obData.date) { if(el) el.style.display='none'; return; }
  var today = new Date(); today.setHours(0,0,0,0);
  var race = new Date(_obData.date);
  if (isNaN(race.getTime()) || race <= today) { el.style.display='none'; return; }
  var diffDays = Math.round((race - today) / 86400000);
  var weeks = Math.round(diffDays / 7);
  var course = _obData.course || 'Marathon';
  var msg = '';
  if (course === 'Marathon') {
    if (weeks >= 22) msg = '📅 ' + weeks + ' semaines : longue préparation — tu auras le temps de bâtir une vraie base.';
    else if (weeks >= 18) msg = '📅 ' + weeks + ' semaines : durée idéale pour une préparation marathon complète.';
    else if (weeks >= 14) msg = '📅 ' + weeks + ' semaines : plan compact mais faisable pour un marathon. Chaque séance compte !';
    else msg = '📅 ' + weeks + ' semaines avant le marathon.';
  } else if (course === 'Semi-marathon') {
    if (weeks >= 14) msg = '📅 ' + weeks + ' semaines : excellente base pour un semi-marathon.';
    else if (weeks >= 10) msg = '📅 ' + weeks + ' semaines : durée standard pour un semi-marathon, parfait !';
    else msg = '📅 ' + weeks + ' semaines avant le semi-marathon.';
  } else if (course === '10 km') {
    if (weeks >= 8) msg = '📅 ' + weeks + ' semaines : bonne préparation pour un 10 km.';
    else msg = '📅 ' + weeks + ' semaines avant ton 10 km.';
  } else {
    msg = '📅 ' + weeks + ' semaines avant la course.';
  }
  if (msg) { el.textContent = msg; el.style.display = ''; }
  else el.style.display = 'none';
}

function _obEstimateWeekProgression(numWeeks, baseKm, peakKm) {
  var taperW = numWeeks >= 12 ? 2 : 1;
  var buildW = numWeeks - taperW;
  var weeks = [];
  for (var w = 1; w <= numWeeks; w++) {
    if (w > buildW) {
      var t = w - buildW;
      weeks.push(Math.round(peakKm * (t === 1 ? 0.85 : 0.70)));
    } else {
      var cycle = (w - 1) % 4;
      var blockNum = Math.floor((w - 1) / 4);
      var totalBlocks = Math.ceil(buildW / 4);
      var blockProgress = totalBlocks > 1 ? blockNum / (totalBlocks - 1) : 1;
      var blockPeak = Math.round(baseKm + (peakKm - baseKm) * blockProgress);
      if (cycle === 3) {
        weeks.push(Math.round(blockPeak * 0.75));
      } else {
        var intraProgress = cycle / 2;
        weeks.push(Math.round(baseKm + (blockPeak - baseKm) * (blockProgress * 0.7 + intraProgress * 0.3)));
      }
    }
  }
  return weeks;
}

function showOnboarding(editMode){
  _obEditMode=!!editMode;
  _obSaving=false; // reset au cas où la précédente sauvegarde avait planté
  _obData={course:null,date:null,sessions:null,niveau:null,km_semaine:null,generate_plan:null};
  if(editMode && state.onboarding) Object.assign(_obData,state.onboarding);
  // En vue coach admin, l'onboarding doit passer au-dessus de l'overlay (z-index 400)
  const obOv=document.getElementById('onboarding-overlay');
  if(obOv) obOv.style.zIndex=_adminPreviewUid?'500':'300';
  // Remplir les jours (1-31)
  const dayEl=document.getElementById('ob-date-day');
  if(dayEl && dayEl.options.length<=1){
    for(let d=1;d<=31;d++){const o=document.createElement('option');o.value=String(d).padStart(2,'0');o.textContent=d;dayEl.appendChild(o);}
  }
  // Nettoyer les champs FC max et EF pace
  const fcValEl=document.getElementById('ob-fcmax-val');
  const fcAgeEl=document.getElementById('ob-fcmax-age');
  const fcAgeRes=document.getElementById('ob-fcmax-age-result');
  const efMinEl=document.getElementById('ob-ef-min');
  const efSecEl=document.getElementById('ob-ef-sec');
  if(fcValEl) fcValEl.value='';
  if(fcAgeEl) fcAgeEl.value='';
  if(fcAgeRes) fcAgeRes.textContent='';
  if(efMinEl) efMinEl.value='';
  if(efSecEl) efSecEl.value='';
  // En mode édition : restaurer les valeurs dans les inputs
  if(editMode && _obData.fc_max){
    // FC max : selon si elle vient de l'âge ou directement
    if(_obData._fc_max_from_age){
      if(fcAgeEl) fcAgeEl.value=_obData._fc_max_from_age;
      if(fcAgeRes) fcAgeRes.textContent='→ FC max estimée : '+_obData.fc_max+' bpm';
    } else {
      if(fcValEl) fcValEl.value=_obData.fc_max;
    }
  }
  if(editMode && _obData.ef_pace){
    const parts=_obData.ef_pace.replace("'",":").split(':');
    if(efMinEl) efMinEl.value=parts[0]||'';
    if(efSecEl) efSecEl.value=parts[1]||'';
  }
  // Bouton fermer visible seulement en mode édition
  const closeBtn=document.getElementById('ob-btn-close');
  if(closeBtn) closeBtn.style.display=editMode?'flex':'none';
  _obGoTo(0);
  // Restore chip selections
  ['course','sessions','niveau','generate_plan'].forEach(f=>{
    document.querySelectorAll('[id^="ob-'+f+'-"]').forEach(el=>el.classList.remove('selected'));
    if(_obData[f]){const c=document.getElementById('ob-'+f+'-'+_obData[f]);if(c)c.classList.add('selected');}
  });
  // Restore km_semaine (y compris valeur custom)
  document.querySelectorAll('[id^="ob-km_semaine-"]').forEach(el=>el.classList.remove('selected'));
  const knownKmVals=['10','20','30','40'];
  if(_obData.km_semaine){
    if(knownKmVals.includes(_obData.km_semaine)){
      const c=document.getElementById('ob-km_semaine-'+_obData.km_semaine);
      if(c) c.classList.add('selected');
    } else {
      // Valeur custom : ouvrir la boîte
      const customBtn=document.getElementById('ob-km_semaine-custom');
      const customBox=document.getElementById('ob-km-custom-box');
      const customInput=document.getElementById('ob-km-custom-input');
      if(customBtn) customBtn.classList.add('selected');
      if(customBox) customBox.style.display='block';
      if(customInput) customInput.value=_obData.km_semaine;
    }
  }
  // Restore date selects
  if(_obData.date){
    const parts=_obData.date.split('-');
    if(parts.length===3){
      const dy=document.getElementById('ob-date-day');
      const dm=document.getElementById('ob-date-month');
      const dyr=document.getElementById('ob-date-year');
      if(dy) dy.value=parts[2];
      if(dm) dm.value=parts[1];
      if(dyr) dyr.value=parts[0];
    }
  } else {
    ['ob-date-day','ob-date-month','ob-date-year'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  }
  const el=document.getElementById('onboarding-overlay');
  if(el) el.style.display='flex';
}

function obDateChanged(){
  const d=document.getElementById('ob-date-day')?.value;
  const m=document.getElementById('ob-date-month')?.value;
  const y=document.getElementById('ob-date-year')?.value;
  const errEl=document.getElementById('ob-date-error');
  // Durée minimale ajustée selon le nombre de séances : moins de séances = plus de semaines nécessaires
  const sess=parseInt(_obData.sessions)||3;
  const minWByCourse={
    Plaisir:8,
    '5 km':6,
    '10 km':sess<=2?10:8,
    'Semi-marathon':sess<=2?14:sess===3?10:8,
    'Marathon':sess<=2?18:sess===3?14:12,
  };
  if(d&&m&&y){
    const chosen=new Date(y+'-'+m+'-'+d);
    const now=new Date(); now.setHours(0,0,0,0);
    const diffW=Math.floor((chosen-now)/(7*24*3600*1000));
    const minW=minWByCourse[_obData.course]||8;
    const maxW=24;
    const showErr=(msg)=>{
      if(errEl){errEl.textContent=msg;errEl.style.display='block';}
      _obData.date=null;
      const next=document.getElementById('ob-btn-next');
      if(next){next.disabled=true;next.style.opacity='0.4';}
    };
    if(diffW<minW){
      showErr(`⚠️ La date est trop proche : il faut au minimum ${minW} semaines de préparation pour ${_obData.course||'cette distance'}. Choisissez une date après le ${new Date(now.getTime()+minW*7*24*3600*1000).toLocaleDateString('fr-FR')}.`);
    } else if(diffW>maxW){
      showErr(`⚠️ La date est trop loin : les plans sont limités à ${maxW} semaines (6 mois). Choisissez une date avant le ${new Date(now.getTime()+maxW*7*24*3600*1000).toLocaleDateString('fr-FR')}.`);
    } else {
      if(errEl) errEl.style.display='none';
      onboardingSelect('date',y+'-'+m+'-'+d);
      _obShowDateContext();
    }
  } else {
    if(errEl) errEl.style.display='none';
    _obData.date=null;
    var _dcEl=document.getElementById('ob-date-context'); if(_dcEl) _dcEl.style.display='none';
  }
}

function hideOnboarding(){
  const el=document.getElementById('onboarding-overlay');
  if(el) el.style.display='none';
}

function _obGoTo(step){
  ['ob-sessions-tip','ob-niveau-tip','ob-km-tip','ob-date-context'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.style.display='none';
  });
  _obStep=step;
  // Restaurer les tips si on revient sur une étape avec une sélection déjà faite
  if(step===1&&_obData.date) setTimeout(()=>_obShowDateContext(),50);
  if(step===2&&_obData.sessions) setTimeout(()=>_obShowAdaptiveTip('sessions'),50);
  if(step===3&&_obData.niveau) setTimeout(()=>_obShowAdaptiveTip('niveau'),50);
  if(step===4&&_obData.km_semaine) setTimeout(()=>_obShowAdaptiveTip('km_semaine'),50);
  const OB_STEPS=9;
  for(let i=0;i<OB_STEPS;i++){
    const s=document.getElementById('ob-step-'+i);
    if(s) s.style.display=i===step?'block':'none';
    const p=document.getElementById('ob-prog-'+i);
    if(p) p.style.background=i<=step?'#1B4FD8':'#e0e0e0';
  }
  // Initialiser l'étape jours avec la bonne limite
  if(step===5) setTimeout(initObDaysStep, 0);
  if(step===1) setTimeout(_obPopulateDateShortcuts,0);
  if(step===4) setTimeout(()=>_obCheckAndShowKmConstraint(_obData.km_semaine||0),0);
  if(step===8) setTimeout(_initObTargetTime, 0);
  if(step===2) setTimeout(_obCheckAndShowSessionsConstraint,0);
  if(step===3) setTimeout(_obCheckAndShowNiveauConstraint,0);
  if(step===8) setTimeout(_obCheckAndShowTargetTimeConstraint,0);
  if(step===8) setTimeout(_obShowRecap,0);
  if(step===8){
    const _npInfo=document.getElementById('ob-no-plan-info');
    if(_npInfo) _npInfo.style.display=_obData.generate_plan==='non'?'block':'none';
  }
  // Step 2 (sessions) : chip 1 visible uniquement pour Découverte ; chips 3,4 masquées pour Découverte
  if(step===2){
    const isDecouv=_obData.niveau==='Découverte';
    const el1=document.getElementById('ob-sessions-1');
    if(el1) el1.style.display=isDecouv?'':'none';
    ['3','4'].forEach(n=>{
      const el=document.getElementById('ob-sessions-'+n);
      if(el) el.style.display=isDecouv?'none':'';
    });
  }
  // Étape 6 (EF) : gérer l'état du champ selon si EF déjà saisie ou non
  if(step===6){
    const wrap=document.getElementById('ob-ef-input-wrap');
    document.querySelectorAll('[id^="ob-ef-"]').forEach(el=>el.classList.remove('selected'));
    if(_obData.ef_pace===null) delete _obData.ef_pace;
    if(_obData.ef_pace){
      // Restaurer la sélection "oui" et les valeurs saisies
      if(wrap) wrap.style.display='block';
      const oui=document.getElementById('ob-ef-oui'); if(oui) oui.classList.add('selected');
      const parts=String(_obData.ef_pace).replace("'",":").split(':');
      const efMin=document.getElementById('ob-ef-min'); if(efMin) efMin.value=parts[0]||'';
      const efSec=document.getElementById('ob-ef-sec'); if(efSec) efSec.value=parts[1]||'';
    } else if(_obData._ef_skipped){
      // Restaurer la sélection "non"
      if(wrap) wrap.style.display='none';
      const non=document.getElementById('ob-ef-non'); if(non) non.classList.add('selected');
    } else {
      if(wrap) wrap.style.display='none';
    }
  }
  const back=document.getElementById('ob-btn-back');
  if(back) back.style.display=step>0?'flex':'none';
  const next=document.getElementById('ob-btn-next');
  if(next){
    next.textContent=step===OB_STEPS-1?'Terminer ✓':'Suivant →';
    // Étape 6 (EF) et 7 (FC max) : toujours activés (optionnels); étape 5 (jours) : activé si nb jours correct
    const keys=['course','date','sessions','niveau','km_semaine','run_days',null,null,'generate_plan'];
    const enabled=step===1||step===6||step===7?true:
      step===5?(_obData.run_days&&_obData.run_days.length===_obMaxDays()):
      !!_obData[keys[step]];
    next.disabled=!enabled;
    next.style.opacity=enabled?'1':'0.4';
  }
}

function onboardingSelect(field,val){
  _obData[field]=val;
  // Revalider la date si la distance change (les minima de semaines varient)
  if((field==='course'||field==='sessions')&&_obData.date) setTimeout(obDateChanged,0);
  // Niveau Découverte : si sessions > 2, on ramène à 2
  if(field==='niveau'&&val==='Découverte'){
    if(_obData.sessions&&!['1','2'].includes(_obData.sessions)){
      _obData.sessions='2';
    }
  }
  if(field!=='date'){
    document.querySelectorAll('[id^="ob-'+field+'-"]').forEach(el=>el.classList.remove('selected'));
    const c=document.getElementById('ob-'+field+'-'+val);
    if(c) c.classList.add('selected');
    if(field==='sessions'||field==='course'){
      if(_obCheckAndShowSessionsConstraint()) return;
      if(field==='sessions') _obShowAdaptiveTip('sessions');
    }
    if(field==='niveau'){
      if(_obCheckAndShowNiveauConstraint()) return;
      _obShowAdaptiveTip('niveau');
    }
    if(field==='km_semaine'){
      if(_obCheckAndShowKmConstraint(val)) return;
      _obShowAdaptiveTip('km_semaine');
      // Ne pas auto-avancer si un warning est affiché (laisser l'user lire)
      const _kmWarn=document.getElementById('ob-km-base-warn');
      if(_kmWarn&&_kmWarn.style.display!=='none') return;
    }
    // generate_plan : gérer l'affichage du message selon le choix
    if(field==='generate_plan'){
      const infoEl=document.getElementById('ob-no-plan-info');
      if(infoEl) infoEl.style.display=val==='non'?'block':'none';
    }
    if(field==='generate_plan'&&val==='non'){
      const next=document.getElementById('ob-btn-next');
      if(next){next.disabled=false;next.style.opacity='1';}
      return;
    }
    setTimeout(()=>onboardingNext(),350);
  }
  const next=document.getElementById('ob-btn-next');
  if(next){next.disabled=false;next.style.opacity='1';}
}

function toggleKmCustom(){
  const box = document.getElementById('ob-km-custom-box');
  const btn = document.getElementById('ob-km_semaine-custom');
  const isOpen = box.style.display !== 'none';
  if(isOpen){
    box.style.display = 'none';
    btn.classList.remove('selected');
    delete _obData.km_semaine; // toujours vider (la valeur est le nombre, jamais 'custom')
  } else {
    box.style.display = 'block';
    document.querySelectorAll('[id^="ob-km_semaine-"]').forEach(el=>el.classList.remove('selected'));
    btn.classList.add('selected');
    const input = document.getElementById('ob-km-custom-input');
    if(input) setTimeout(()=>input.focus(), 50);
  }
  const next = document.getElementById('ob-btn-next');
  if(next){ next.disabled=true; next.style.opacity='0.4'; }
}

function _initObTargetTime(){
  const course=_obData.course||'';
  const wrap=document.getElementById('ob-target-time-wrap');
  const lbl=document.getElementById('ob-target-time-label');
  const distMap={'5 km':5,'10 km':10,'Semi-marathon':21.1,'Marathon':42.195};
  const dist=distMap[course]||null;
  if(wrap){
    const hasRace=!!dist;
    wrap.style.display=hasRace?'block':'none';
    if(lbl&&dist){
      const distStr=course==='Semi-marathon'?'semi-marathon':course;
      lbl.textContent='Quel est ton objectif de temps pour le '+distStr+' ?';
      _obData.race_distance_km=dist;
    }
  }
  // Restaurer valeur si déjà saisie
  if(_obData.target_time){
    const p=_obData.target_time.split(':');
    const hEl=document.getElementById('ob-target-h');
    const mEl=document.getElementById('ob-target-min');
    const sEl=document.getElementById('ob-target-sec');
    if(hEl) hEl.value=p[0]||'';
    if(mEl) mEl.value=p[1]||'';
    if(sEl) sEl.value=p[2]||'';
  } else if(dist){
    // Temps par défaut selon la distance si pas d'allure EF ni de temps déjà saisi
    const efPaceSrc=_obData.ef_pace;
    if(efPaceSrc){
    // Suggérer un temps réaliste basé sur l'allure EF
    const parts=(efPaceSrc).replace("'",":").split(':');
    if(parts.length===2){
      const efSec=parseInt(parts[0])*60+parseInt(parts[1]);
      // Delta EF → allure course selon distance (s/km plus rapide que EF)
      const delta={'5 km':90,'10 km':72,'Semi-marathon':48,'Marathon':32}[course]||40;
      const racePaceSec=Math.max(efSec-delta,150); // minimum 2:30/km
      const totalSec=Math.round(racePaceSec*dist);
      const sh=Math.floor(totalSec/3600);
      const sm=Math.floor((totalSec%3600)/60);
      const ss=totalSec%60;
      const hEl=document.getElementById('ob-target-h');
      const mEl=document.getElementById('ob-target-min');
      const sEl=document.getElementById('ob-target-sec');
      if(hEl) hEl.value=sh>0?sh:'';
      if(mEl) mEl.value=sm;
      if(sEl) sEl.value=ss>0?String(ss).padStart(2,'0'):'';
      onTargetTimeInput(); // enregistrer la suggestion dans _obData
    }
    } else {
      // Valeurs par défaut selon la distance
      const defaults={'5 km':[0,30,0],'10 km':[0,55,0],'Semi-marathon':[1,50,0],'Marathon':[4,0,0]};
      const def=defaults[course];
      if(def){
        const hEl=document.getElementById('ob-target-h');
        const mEl=document.getElementById('ob-target-min');
        const sEl=document.getElementById('ob-target-sec');
        if(hEl) hEl.value=def[0]>0?def[0]:'';
        if(mEl) mEl.value=def[1]>0?String(def[1]).padStart(2,'0'):'';
        if(sEl) sEl.value=def[2]>0?String(def[2]).padStart(2,'0'):'';
        onTargetTimeInput();
      }
    }
  }
}

function clearTargetTime(){
  const hEl=document.getElementById('ob-target-h');
  const mEl=document.getElementById('ob-target-min');
  const sEl=document.getElementById('ob-target-sec');
  if(hEl) hEl.value='';
  if(mEl) mEl.value='';
  if(sEl) sEl.value='';
  delete _obData.target_time;
  // Mettre en évidence visuellement le bouton actif
  const btn=document.getElementById('ob-no-target-btn');
  if(btn){ btn.style.background='#EEF2FD'; btn.style.color='#1B4FD8'; btn.style.borderColor='#1B4FD8'; }
}


function onTargetTimeInput(){
  const h=parseInt(document.getElementById('ob-target-h')?.value)||0;
  const m=parseInt(document.getElementById('ob-target-min')?.value)||0;
  const s=parseInt(document.getElementById('ob-target-sec')?.value)||0;
  const _ntb=document.getElementById('ob-no-target-btn');
  if(h>0||m>0||s>0){
    _obData.target_time=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
    // Remettre le bouton "Pas de temps cible" en style neutre si un temps est saisi
    if(_ntb) _ntb.style.cssText='width:100%;padding:9px;background:#f5f5f5;border:1.5px solid #e0e0e0;border-radius:10px;font-size:13px;font-weight:600;color:#888;cursor:pointer;';
  } else {
    delete _obData.target_time;
    // Remettre le bouton "Pas de temps cible" en style actif si tous les champs sont vides
    if(_ntb) _ntb.style.cssText='width:100%;padding:9px;background:#EEF2FD;border:1.5px solid #1B4FD8;border-radius:10px;font-size:13px;font-weight:600;color:#1B4FD8;cursor:pointer;';
  }
  _obCheckAndShowTargetTimeConstraint();
}

function _obCheckAndShowTargetTimeConstraint(){
  const errEl=document.getElementById('ob-target-time-error');
  const warnEl=document.getElementById('ob-target-time-warn');
  if(errEl) errEl.style.display='none';
  if(warnEl) warnEl.style.display='none';
  if(!_obData.target_time) return;

  const course=_obData.course;
  const niveau=_obData.niveau;
  const p=_obData.target_time.split(':').map(Number);
  const totalSec=p.length===3?p[0]*3600+p[1]*60+p[2]:p.length===2?p[0]*60+p[1]:0;
  if(!totalSec||!course) return;

  // Seuils de temps impossibles (records mondiaux arrondis à la baisse)
  const impossibleSec={'5 km':720,'10 km':1600,'Semi-marathon':3480,'Marathon':7260}; // 12', 26'40", 58', 2h01'
  // Seuils de temps trop lents (au-delà, le plan ne peut plus être utile)
  const tooSlowSec={'5 km':2700,'10 km':5400,'Semi-marathon':12600,'Marathon':28800}; // 45', 1h30, 3h30, 8h
  // Fenêtres de cohérence par niveau (min/max en secondes)
  const niveauRange={
    'Marathon':    {Débutant:[14400,21600],Intermédiaire:[10800,16200],Confirmé:[7200,12600]},  // 4h-6h / 3h-4h30 / 2h-3h30
    'Semi-marathon':{Débutant:[5400,10800],Intermédiaire:[4500,7200],Confirmé:[3600,5400]},     // 1h30-3h / 1h15-2h / 1h-1h30
    '10 km':       {Débutant:[2700,5400],Intermédiaire:[2100,3600],Confirmé:[1620,2700]},       // 45'-1h30 / 35'-60' / 27'-45'
    '5 km':        {Débutant:[1200,2700],Intermédiaire:[900,1800],Confirmé:[720,1200]},         // 20'-45' / 15'-30' / 12'-20'
  };
  const courseName=course==='Semi-marathon'?'semi-marathon':course;
  const fmtTime=sec=>{const h=Math.floor(sec/3600);const m=Math.floor((sec%3600)/60);const s=sec%60;return h>0?`${h}h${String(m).padStart(2,'0')}`:`${m}'${String(s).padStart(2,'0')}"`};

  // Contrainte 3 : temps absolument impossible
  const minSec=impossibleSec[course];
  if(minSec&&totalSec<minSec){
    if(errEl){errEl.textContent=`🚫 Ce temps (${fmtTime(totalSec)}) est physiquement impossible sur ${courseName}. Le record du monde est de ${fmtTime(minSec)}. Vérifie ta saisie.`;errEl.style.display='block';}
    return; // Le bouton Suivant reste activé (le temps cible est optionnel — l'utilisateur peut cliquer "Pas de temps cible")
  }

  // Temps trop lent : warning
  const maxSec=tooSlowSec[course];
  if(maxSec&&totalSec>maxSec){
    if(warnEl){warnEl.textContent=`💡 Un temps de ${fmtTime(totalSec)} sur ${courseName} est très conservateur. Le plan sera adapté, mais assure-toi que cet objectif correspond bien à tes capacités actuelles — si c'est ton premier objectif, c'est parfaitement OK.`;warnEl.style.display='block';}
    return;
  }

  // Contraintes 4 & 5 : cohérence temps / niveau
  if(niveau&&niveauRange[course]&&niveauRange[course][niveau]){
    const [rMin,rMax]=niveauRange[course][niveau];
    if(totalSec<rMin){
      if(warnEl){warnEl.textContent=`💡 Un objectif de ${fmtTime(totalSec)} sur ${courseName} dépasse le niveau ${niveau} — c'est une performance de niveau supérieur. Soit tu es trop modeste sur ton niveau, soit cet objectif est ambitieux. Un plan sera généré, mais les allures seront exigeantes.`;warnEl.style.display='block';}
    } else if(totalSec>rMax){
      if(warnEl){warnEl.textContent=`💡 Un objectif de ${fmtTime(totalSec)} sur ${courseName} est en-dessous de ce qu'un coureur ${niveau} peut généralement espérer. Tu es peut-être trop modeste — un objectif plus ambitieux te poussera davantage.`;warnEl.style.display='block';}
    }
  }
}

function onKmCustomInput(val){
  const km=parseInt(val);
  if(km>0&&km<=300){
    _obData.km_semaine=String(km);
    const isBlock=_obCheckAndShowKmConstraint(km);
    const next=document.getElementById('ob-btn-next');
    if(!isBlock&&next){next.disabled=false;next.style.opacity='1';}
  } else {
    delete _obData.km_semaine;
    const next=document.getElementById('ob-btn-next');
    if(next){next.disabled=true;next.style.opacity='0.4';}
    ['ob-km-plaisir-block','ob-km-base-warn'].forEach(id=>{
      const el=document.getElementById(id);if(el)el.style.display='none';
    });
  }
}

function onObFcMaxInput(){
  const v=parseInt(document.getElementById('ob-fcmax-val').value);
  if(v>=140&&v<=220){
    _obData.fc_max=v;
    // effacer age si on saisit fcmax directement
    document.getElementById('ob-fcmax-age').value='';
    document.getElementById('ob-fcmax-age-result').textContent='';
    delete _obData._fc_max_from_age;
  } else {
    delete _obData.fc_max;
  }
}
function onObFcMaxAgeInput(){
  const age=parseInt(document.getElementById('ob-fcmax-age').value);
  const resEl=document.getElementById('ob-fcmax-age-result');
  if(age>=10&&age<=90){
    const fc=220-age;
    _obData.fc_max=fc;
    _obData._fc_max_from_age=age;
    resEl.textContent='→ FC max estimée : '+fc+' bpm';
    // effacer le champ fc_max direct
    document.getElementById('ob-fcmax-val').value='';
  } else {
    delete _obData.fc_max;
    delete _obData._fc_max_from_age;
    resEl.textContent='';
  }
}
function onboardingSkipFcMax(){
  delete _obData.fc_max;
  delete _obData._fc_max_from_age;
  onboardingNext();
}
function getFcMaxZone(){
  // Zone EF = 70–75% FC max
  const fc=state.fc_max||null;
  if(!fc||fc<100) return null;
  return {min:Math.floor(fc*0.70), max:Math.floor(fc*0.75)};
}

function onboardingSelectEf(val){
  if(val==='oui'){
    // Afficher le champ de saisie, désactiver l'auto-avance
    delete _obData._ef_skipped; // efface le flag "non"
    const wrap=document.getElementById('ob-ef-input-wrap');
    if(wrap) wrap.style.display='block';
    document.querySelectorAll('[id^="ob-ef-"]').forEach(el=>el.classList.remove('selected'));
    const c=document.getElementById('ob-ef-oui');
    if(c) c.classList.add('selected');
    const next=document.getElementById('ob-btn-next');
    if(next){next.disabled=false;next.style.opacity='1';}
    // Focus sur le premier champ
    setTimeout(()=>{ const f=document.getElementById('ob-ef-min'); if(f) f.focus(); },100);
  } else {
    // Pas d'EF — fermer le champ et avancer directement
    const wrap=document.getElementById('ob-ef-input-wrap');
    if(wrap) wrap.style.display='none';
    _obData.ef_pace=null;
    _obData._ef_skipped=true; // mémorise le choix "non" pour restauration si retour
    document.querySelectorAll('[id^="ob-ef-"]').forEach(el=>el.classList.remove('selected'));
    const c=document.getElementById('ob-ef-non');
    if(c) c.classList.add('selected');
    setTimeout(()=>onboardingNext(),350);
  }
}

function onboardingNext(){
  // Dernière étape → sauvegarder
  if(_obStep===8){saveOnboarding();return;}
  // Étape 5 (jours) : lire l'horaire avant de passer
  if(_obStep===5){
    const timeEl=document.getElementById('ob-run-time');
    if(timeEl&&timeEl.value) _obData.run_time=timeEl.value;
  }
  // Étape 6 (EF) : lire la valeur saisie avant de passer
  if(_obStep===6){
    const minEl=document.getElementById('ob-ef-min');
    const secEl=document.getElementById('ob-ef-sec');
    const wrap=document.getElementById('ob-ef-input-wrap');
    if(wrap && wrap.style.display!=='none' && minEl && minEl.value){
      const m=parseInt(minEl.value)||5;
      const s=Math.min(59,parseInt(secEl&&secEl.value)||0);
      _obData.ef_pace=m+':'+(s<10?'0':'')+s;
    }
  }
  let next=_obStep+1;
  // Sauter l'étape date si "Plaisir" (pas de course, pas de date butoir)
  if(next===1&&_obData.course==='Plaisir'){
    _obData.date=null;
    next=2;
  }
  // Niveau Découverte : sauter km_semaine (step 4), fixer km à 6, limiter sessions à 2 max
  if(_obStep===3&&_obData.niveau==='Découverte'){
    _obData.km_semaine='6';
    if(!_obData.sessions||!['1','2'].includes(_obData.sessions)) _obData.sessions='2';
    next=5;
  }
  _obGoTo(next);
}

function onboardingBack(){
  let prev=_obStep-1;
  // Sauter l'étape date au retour aussi
  if(prev===1&&_obData.course==='Plaisir') prev=0;
  // Sauter km_semaine au retour si niveau Découverte
  if(prev===4&&_obData.niveau==='Découverte') prev=3;
  _obGoTo(prev);
}

function _obMaxDays(){
  const s=_obData.sessions||'3';
  return s==='4'?4:parseInt(s)||3;
}

function _makeTimeOptions(defaultVal){
  const sel = document.createElement('select');
  sel.style.cssText='flex:1;padding:8px 12px;border:1.5px solid #e0e8f5;border-radius:10px;font-size:16px;font-weight:700;color:#1a1a1a;background:#f8faff;outline:none;';
  for(let h=5;h<=22;h++){
    for(let m=0;m<60;m+=15){
      if(h===22&&m>0) break;
      const val=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
      const opt=document.createElement('option');
      opt.value=val; opt.textContent=val;
      if(val===(defaultVal||'12:00')) opt.selected=true;
      sel.appendChild(opt);
    }
  }
  return sel;
}

function _renderDayTimeRows(){
  const container=document.getElementById('ob-day-times');
  if(!container) return;
  const arr=[...(_obData.run_days||[])].sort((a,b)=>a-b);
  const names=['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  const times=_obData.run_times||{};
  container.innerHTML='';
  arr.forEach(d=>{
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:10px;background:#fff;border-radius:12px;padding:10px 14px;border:1.5px solid #e0e8f5;';
    const lbl=document.createElement('span');
    lbl.style.cssText='font-size:14px;font-weight:800;color:#0C447C;width:32px;flex-shrink:0;';
    lbl.textContent=names[d];
    const icon=document.createElement('span');
    icon.style.cssText='font-size:18px;flex-shrink:0;';
    icon.textContent='🕐';
    const sel=_makeTimeOptions(times[d]||'12:00');
    sel.onchange=()=>{
      if(!_obData.run_times) _obData.run_times={};
      _obData.run_times[d]=sel.value;
      // run_time = heure du premier jour (rétrocompat)
      const first=[...(_obData.run_days||[])].sort((a,b)=>a-b)[0];
      if(d===first) _obData.run_time=sel.value;
    };
    row.appendChild(lbl);
    row.appendChild(icon);
    row.appendChild(sel);
    container.appendChild(row);
  });
}

function initObDaysStep(){
  const max=_obMaxDays();
  const hint=document.getElementById('ob-days-count');
  if(hint) hint.textContent=max;
  if(_obData.run_days && _obData.run_days.length>max) _obData.run_days=[];
  // Pré-sélection par défaut selon le nombre de séances
  if(!_obData.run_days || _obData.run_days.length===0){
    const defaults=max===1?[1]:max===2?[1,3]:max>=4?[1,3,5,6]:[1,3,5];
    _obData.run_days=[...defaults];
    if(!_obData.run_times) _obData.run_times={};
    _obData.run_days.forEach(d=>{ if(!_obData.run_times[d]) _obData.run_times[d]='12:00'; });
    _obData.run_time='12:00';
  }
  _updateObDaysUI();
}

function _updateObDaysUI(){
  const arr=_obData.run_days||[];
  const max=_obMaxDays();
  for(let d=0;d<7;d++){
    const btn=document.getElementById('ob-day-'+d);
    if(!btn) continue;
    const selected=arr.includes(d);
    btn.classList.toggle('selected',selected);
    btn.disabled=false;
    btn.style.opacity=selected?'1':'0.5';
  }
  _renderDayTimeRows();
  const next=document.getElementById('ob-btn-next');
  if(next){
    const ok=arr.length===max;
    next.disabled=!ok;
    next.style.opacity=ok?'1':'0.4';
  }
}

function toggleObDay(dayIdx){
  if(!_obData.run_days) _obData.run_days=[];
  const arr=_obData.run_days;
  const max=_obMaxDays();
  const i=arr.indexOf(dayIdx);
  if(i>=0){
    arr.splice(i,1);
  } else {
    if(arr.length>=max){
      // Afficher un toast explicatif au lieu d'effacer silencieusement
      let _toast=document.getElementById('ob-days-toast');
      if(!_toast){
        _toast=document.createElement('div');
        _toast.id='ob-days-toast';
        _toast.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1B4FD8;color:#fff;padding:10px 18px;border-radius:20px;font-size:13px;font-weight:700;z-index:9999;pointer-events:none;transition:opacity 0.3s;';
        document.body.appendChild(_toast);
      }
      _toast.textContent=`${max} jour${max>1?'s':''} maximum — retire un jour avant d'en ajouter un autre`;
      _toast.style.opacity='1';
      clearTimeout(_toast._t);
      _toast._t=setTimeout(()=>{_toast.style.opacity='0';},2200);
      return;
    }
    _obData.run_days.push(dayIdx);
  }
  _updateObDaysUI();
}

function _obCheckAndShowSessionsConstraint(){
  const errEl=document.getElementById('ob-sessions-constraint');
  const course=_obData.course;
  const niveau=_obData.niveau;
  const sess=parseInt(_obData.sessions)||0;
  let msg=null;
  let isWarn=false; // true = warning non-bloquant, false = erreur bloquante
  if(course==='Marathon'&&sess>0&&sess<3){
    msg=`⚠️ Préparer un marathon nécessite au minimum 3 séances par semaine, quel que soit ton niveau. Avec ${sess} séance${sess>1?'s':''}, le corps n'a pas assez de stimuli pour s'adapter correctement — le risque de blessure ou d'abandon le jour J est très élevé. Choisis 3 ou 4 séances.`;
  } else if(course==='Semi-marathon'&&sess===1){
    msg=`⚠️ Un semi-marathon nécessite au minimum 2 séances par semaine pour une préparation sécurisée. Avec 1 séance, le corps ne peut pas s'adapter à la distance. Choisis 2 séances ou plus.`;
  } else if(niveau==='Confirmé'&&sess===1){
    // Contrainte 7 : Confirmé + 1 séance = warning non-bloquant
    msg=`💡 En tant que coureur Confirmé, 1 séance par semaine est insuffisant pour progresser — à ce volume, les performances vont stagner ou régresser. Un Confirmé a besoin de 3-4 séances pour maintenir et développer sa condition. Tu peux continuer, mais tu es prévenu(e).`;
    isWarn=true;
  }
  if(errEl){
    if(msg){
      errEl.textContent=msg;
      errEl.style.display='block';
      errEl.style.background=isWarn?'#FFFDE7':'#fff0f0';
      errEl.style.color=isWarn?'#5C6C00':'#C4141B';
      errEl.style.border=isWarn?'1px solid #E6D800':'none';
    } else {
      errEl.style.display='none';
    }
  }
  if(msg&&!isWarn){
    const next=document.getElementById('ob-btn-next');
    if(next){next.disabled=true;next.style.opacity='0.4';}
    return true;
  }
  return false;
}

function _obCheckAndShowNiveauConstraint(){
  const errEl=document.getElementById('ob-niveau-constraint');
  const course=_obData.course;
  const niveau=_obData.niveau;
  const sess=parseInt(_obData.sessions)||0;
  let msg=null;

  // Contrainte 1 : Découverte + Marathon = impossible
  if(niveau==='Découverte'&&course==='Marathon'){
    msg=`🚫 Le niveau Découverte correspond à quelqu'un qui commence tout juste la course à pied. Un marathon est impossible à ce stade — il faut au minimum 2-3 ans de pratique régulière avant d'envisager cette distance. Commence par préparer un 5 km ou 10 km pour construire des bases solides.`;
  }
  // Contrainte 2 : Découverte + Semi = bloqué
  else if(niveau==='Découverte'&&course==='Semi-marathon'){
    msg=`🚫 Le niveau Découverte correspond à un débutant absolu. Un semi-marathon (21 km) est une distance sérieuse qui nécessite une base d'au minimum 6-12 mois de course régulière. Commence par un 5 km ou 10 km — tu pourras viser le semi l'année prochaine.`;
  }
  // Contrainte 3 : sessions insuffisantes pour course+niveau
  else if(course&&niveau&&sess){
    const minMap=_OB_SESS_MIN[course];
    if(minMap){
      const minSess=minMap[niveau]||0;
      if(minSess>0&&sess<minSess){
        const courseName=course==='Semi-marathon'?'semi-marathon':course;
        if(niveau==='Débutant'){
          msg=`⚠️ Pour finir un ${courseName} en tant que Débutant, il faut au minimum ${minSess} séance${minSess>1?'s':''} par semaine. Avec seulement ${sess} séance${sess>1?'s':''}, le corps n'aura pas le temps de s'adapter à la distance — risque de blessure élevé. Reviens en arrière et choisis ${minSess} séances ou plus.`;
        } else {
          msg=`⚠️ Pour viser un chrono sur ${courseName} (niveau ${niveau}), il faut au minimum ${minSess} séances par semaine. Les séances qualité (tempo, fractionné) + la sortie longue ne peuvent pas tenir en ${sess} séance${sess>1?'s':''}. Reviens en arrière et sélectionne ${minSess} séances ou plus.`;
        }
      }
    }
  }
  if(errEl){
    if(msg){errEl.textContent=msg;errEl.style.display='block';}
    else errEl.style.display='none';
  }
  if(msg){
    const next=document.getElementById('ob-btn-next');
    if(next){next.disabled=true;next.style.opacity='0.4';}
    return true;
  }
  return false;
}

function _obCheckAndShowKmConstraint(kmVal){
  const blockEl=document.getElementById('ob-km-plaisir-block');
  const warnEl=document.getElementById('ob-km-base-warn');
  const course=_obData.course;
  const niveau=_obData.niveau;
  const sess=parseInt(_obData.sessions)||3;
  const km=parseInt(kmVal)||parseInt(_obData.km_semaine)||0;
  if(blockEl) blockEl.style.display='none';
  if(warnEl) warnEl.style.display='none';
  if(!km) return false;
  if(course==='Plaisir'){
    const maxKm=sess*10;
    if(km>maxKm){
      const needed=Math.ceil(km/10);
      const msg=`🚫 Avec ${sess} séance${sess>1?'s':''}/semaine, le volume maximum pour un plan plaisir est de ${maxKm} km/semaine (soit ${sess}×10 km max par séance). Dépasser ce seuil avec peu de séances expose à un risque élevé de surmenage et de blessure. Soit tu augmentes à ${needed} séances, soit tu réduis ton volume à ${maxKm} km maximum.`;
      if(blockEl){blockEl.textContent=msg;blockEl.style.display='block';}
      const next=document.getElementById('ob-btn-next');
      if(next){next.disabled=true;next.style.opacity='0.4';}
      return true;
    }
  }
  if(course&&niveau&&_OB_KM_MIN_WARN[course]){
    const minKm=_OB_KM_MIN_WARN[course][niveau]||0;
    if(minKm>0&&km<minKm){
      const courseName=course==='Semi-marathon'?'semi-marathon':course;
      const msg=`💡 Pour préparer un ${courseName} niveau ${niveau}, un volume de base d'au moins ${minKm} km/semaine est recommandé. Avec ${km} km actuellement, le plan sera adapté mais la progression sera plus exigeante. Tu peux continuer, mais envisage de choisir un niveau inférieur ou d'allonger la durée de préparation.`;
      if(warnEl){warnEl.textContent=msg;warnEl.style.display='block';}
    }
  }
  return false;
}

function onObEfPaceChange(){
  const minEl=document.getElementById('ob-ef-min');
  const secEl=document.getElementById('ob-ef-sec');
  const warnEl=document.getElementById('ob-ef-niveau-warn');
  const errEl=document.getElementById('ob-ef-pace-error');
  const nextBtn=document.getElementById('ob-btn-next');
  if(!warnEl) return;
  const m=parseInt(minEl?.value)||0;
  const s=parseInt(secEl?.value)||0;
  if(warnEl) warnEl.style.display='none';
  if(errEl) errEl.style.display='none';
  if(!m){
    if(nextBtn){nextBtn.disabled=false;nextBtn.style.opacity='1';}
    return;
  }
  const paceSec=m*60+s;
  const paceStr=`${m}'${String(s).padStart(2,'0')}/km`;
  const niveau=_obData.niveau;

  // Contrainte 6 bloquante : allure hors plage réaliste
  if(paceSec<210){ // < 3'30"/km
    if(errEl){errEl.textContent=`🚫 Une allure EF de ${paceStr} est physiquement irréaliste — même les champions courent leur EF à 3'30"/km minimum. Vérifie ta saisie (ex : 5'30" s'écrit 5 minutes et 30 secondes).`;errEl.style.display='block';}
    if(nextBtn){nextBtn.disabled=true;nextBtn.style.opacity='0.4';}
    return;
  }
  if(paceSec>660){ // > 11'00"/km
    if(errEl){errEl.textContent=`🚫 À ${paceStr}, c'est une allure de marche rapide, pas de course. Si tu marches encore, le niveau Découverte (marche-course) est parfaitement adapté. Reviens en arrière pour changer ton niveau.`;errEl.style.display='block';}
    if(nextBtn){nextBtn.disabled=true;nextBtn.style.opacity='0.4';}
    return;
  }
  if(nextBtn){nextBtn.disabled=false;nextBtn.style.opacity='1';}

  // Warnings non-bloquants : cohérence allure / niveau
  let msg=null;
  if(niveau==='Confirmé'&&paceSec>450){
    msg=`💡 Ton allure EF de ${paceStr} est plutôt celle d'un coureur Intermédiaire (un Confirmé court généralement son EF sous 7'30"/km). Si c'est bien ton allure de confort actuelle, un plan Intermédiaire sera mieux calibré.`;
  } else if(niveau==='Débutant'&&paceSec<330){
    msg=`💡 Ton allure EF de ${paceStr} (sous 5'30"/km) est rapide pour un Débutant. Si c'est ton allure de confort habituelle, tu es peut-être Intermédiaire — un plan adapté à ton vrai niveau sera plus efficace.`;
  } else if(niveau==='Intermédiaire'&&paceSec<270){
    msg=`💡 Ton allure EF de ${paceStr} (sous 4'30"/km) est celle d'un coureur Confirmé. Si c'est bien ton allure de confort, un plan Confirmé sera plus adapté à ta performance.`;
  }
  if(msg&&warnEl){warnEl.textContent=msg;warnEl.style.display='block';}
}

function _obPopulateDateShortcuts(){
  const container=document.getElementById('ob-date-shortcuts');
  if(!container) return;
  const sess=parseInt(_obData.sessions)||3;
  const minWByCourse={Plaisir:8,'5 km':6,'10 km':sess<=2?10:8,'Semi-marathon':sess<=2?14:sess===3?10:8,'Marathon':sess<=2?18:sess===3?14:12};
  const minW=minWByCourse[_obData.course]||8;
  const raw=[minW,Math.round(minW*1.3),Math.min(24,Math.round(minW*1.6))];
  const suggestions=raw.filter((v,i,a)=>a.indexOf(v)===i);
  container.innerHTML='';
  const label=document.createElement('p');
  label.style.cssText='font-size:12px;color:#666;margin:10px 0 8px;font-weight:600;';
  label.textContent='Ou choisis une durée :';
  container.appendChild(label);
  const row=document.createElement('div');
  row.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px;';
  suggestions.forEach(w=>{
    const d=new Date(); d.setHours(0,0,0,0);
    d.setDate(d.getDate()+w*7);
    const dow=d.getDay(); if(dow!==0) d.setDate(d.getDate()+(7-dow));
    const yy=d.getFullYear();
    const mm=String(d.getMonth()+1).padStart(2,'0');
    const dd=String(d.getDate()).padStart(2,'0');
    const btn=document.createElement('button');
    btn.style.cssText='padding:8px 14px;background:#EEF2FD;border:1.5px solid #1B4FD8;border-radius:20px;font-size:13px;font-weight:700;color:#1B4FD8;cursor:pointer;white-space:nowrap;';
    btn.textContent=`Dans ${w} sem.`;
    btn.onclick=()=>{
      const dy=document.getElementById('ob-date-day');
      const dm=document.getElementById('ob-date-month');
      const dyr=document.getElementById('ob-date-year');
      if(dy) dy.value=dd;
      if(dm) dm.value=mm;
      if(dyr) dyr.value=String(yy);
      obDateChanged();
    };
    row.appendChild(btn);
  });
  container.appendChild(row);

  // Courses connues pour la distance sélectionnée
  var knownList = KNOWN_RACES[_obData.course] || [];
  var today2 = new Date(); today2.setHours(0,0,0,0);
  var filtered = knownList.filter(function(r) {
    var rDate = new Date(r.date);
    var diffD = Math.round((rDate - today2) / 86400000);
    return diffD > 0 && diffD <= 168;
  });
  if (filtered.length > 0) {
    var raceLabel = document.createElement('p');
    raceLabel.style.cssText = 'font-size:12px;color:#666;margin:12px 0 8px;font-weight:600;';
    raceLabel.textContent = 'Ou choisis une course :';
    container.appendChild(raceLabel);
    var raceRow = document.createElement('div');
    raceRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px;';
    filtered.forEach(function(r) {
      var rDate = new Date(r.date);
      var rYY = rDate.getFullYear();
      var rMM = String(rDate.getMonth()+1).padStart(2,'0');
      var rDD = String(rDate.getDate()).padStart(2,'0');
      var btn = document.createElement('button');
      btn.style.cssText = 'padding:8px 14px;background:#fff7ed;border:1.5px solid #f97316;border-radius:20px;font-size:12px;font-weight:700;color:#c2410c;cursor:pointer;white-space:nowrap;';
      btn.textContent = r.emoji + ' ' + r.name;
      btn.onclick = function() {
        var dy = document.getElementById('ob-date-day');
        var dm = document.getElementById('ob-date-month');
        var dyr = document.getElementById('ob-date-year');
        if(dy) dy.value = rDD;
        if(dm) dm.value = rMM;
        if(dyr) dyr.value = String(rYY);
        obDateChanged();
      };
      raceRow.appendChild(btn);
    });
    container.appendChild(raceRow);
  }
}

function _obShowRecap(){
  const el=document.getElementById('ob-recap');
  if(!el) return;
  const course=_obData.course||'—';
  const niveau=_obData.niveau||'—';
  const sess=_obData.sessions||'—';
  const km=_obData.km_semaine||'—';
  const nbSess=parseInt(sess)||3;
  const isPlaisir=course==='Plaisir';
  // Calculer la durée du plan (même logique que generateAthletePlan)
  const minW=(()=>{
    if(isPlaisir) return 8;
    if(course==='5 km') return 6;
    if(course==='10 km') return nbSess<=2?10:8;
    if(course==='Semi-marathon') return nbSess<=2?14:nbSess===3?10:8;
    if(course==='Marathon') return nbSess<=2?18:nbSess===3?14:12;
    return 8;
  })();
  let numWeeks=isPlaisir?16:minW;
  if(_obData.date){
    const diff=Math.floor((new Date(_obData.date)-new Date())/(7*24*3600*1000));
    if(diff>0) numWeeks=Math.min(Math.max(diff,minW),24);
  }
  const dateStr=_obData.date?new Date(_obData.date+'T00:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}):'Sans date fixe';
  // Estimation du volume de pointe (même logique que generateAthletePlan)
  const _baseKm=parseInt(_obData.km_semaine)||20;
  let _peakKm;
  if(isPlaisir){
    const weekCap=nbSess*9;
    const growthCap=Math.round(Math.max(_baseKm*1.3,_baseKm+6));
    _peakKm=Math.min(weekCap,growthCap);
  } else {
    const absMax={'5 km':{2:32,3:42,4:52},'10 km':{2:38,3:52,4:65},'Semi-marathon':{2:50,3:65,4:82},'Marathon':{2:60,3:82,4:105}}[course]||{2:50,3:70,4:90};
    const baseMult={'5 km':1.55,'10 km':1.75,'Semi-marathon':2.0,'Marathon':2.2}[course]||1.8;
    const sessMult={2:0.90,3:1.0,4:1.18}[nbSess]||1.0;
    _peakKm=Math.min(Math.round(_baseKm*baseMult*sessMult),(absMax[nbSess]||70));
  }
  const niveauEmoji={'Découverte':'🌱','Débutant':'🟢','Intermédiaire':'🔵','Confirmé':'🟠'}[niveau]||'';
  const courseLabel=course==='Semi-marathon'?'Semi-marathon':course;
  // Calcul des allures clés pour l'aperçu
  const _fmtPace=sec=>{const m=Math.floor(sec/60);const s=sec%60;return `${m}'${String(s).padStart(2,'0')}"/km`;};
  let _efSec=null;
  if(_obData.ef_pace){
    const _p=_obData.ef_pace.replace("'",":").split(':');
    if(_p.length===2) _efSec=parseInt(_p[0])*60+parseInt(_p[1]);
  }
  let _racePaceSec=null;
  if(_obData.target_time&&_obData.race_distance_km){
    const _tp=_obData.target_time.split(':').map(Number);
    const _ts=_tp.length===3?_tp[0]*3600+_tp[1]*60+_tp[2]:_tp.length===2?_tp[0]*60+_tp[1]:0;
    if(_ts>0) _racePaceSec=_ts/parseFloat(_obData.race_distance_km);
  }
  if(!_efSec&&_racePaceSec){
    const _efM={'Marathon':{Débutant:1.40,Intermédiaire:1.36,Confirmé:1.32},'Semi-marathon':{Débutant:1.38,Intermédiaire:1.34,Confirmé:1.30},'10 km':{Débutant:1.35,Intermédiaire:1.31,Confirmé:1.28},'5 km':{Débutant:1.32,Intermédiaire:1.28,Confirmé:1.25}}[course]||{Débutant:1.38,Intermédiaire:1.36,Confirmé:1.32};
    _efSec=Math.round(_racePaceSec*(_efM[niveau]||1.36));
  }
  let _tempoPaceSec=null;
  if(_racePaceSec){
    const _tm={'Marathon':{Débutant:0.965,Intermédiaire:0.952,Confirmé:0.940},'Semi-marathon':{Débutant:0.960,Intermédiaire:0.945,Confirmé:0.930},'10 km':{Débutant:0.965,Intermédiaire:0.950,Confirmé:0.940},'5 km':{Débutant:0.980,Intermédiaire:0.972,Confirmé:0.962}}[course]||{Débutant:0.965,Intermédiaire:0.952,Confirmé:0.940};
    _tempoPaceSec=Math.round(_racePaceSec*(_tm[niveau]||0.952));
  } else if(_efSec){
    _tempoPaceSec=_efSec+(niveau==='Débutant'?-52:niveau==='Confirmé'?-78:-62);
  }
  if(_tempoPaceSec&&_efSec&&_tempoPaceSec>_efSec-25) _tempoPaceSec=_efSec-30;
  const _pacesHtml=(_efSec||_tempoPaceSec)&&!isPlaisir?`
    <div style="background:rgba(255,255,255,0.10);border-radius:10px;padding:10px;margin-top:8px;">
      <p style="font-size:10px;opacity:0.7;margin-bottom:6px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Tes allures d'entraînement</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${_efSec?`<span style="background:rgba(255,255,255,0.15);border-radius:8px;padding:4px 10px;font-size:12px;font-weight:800;">🟦 EF ${_fmtPace(_efSec)}</span>`:''}
        ${_tempoPaceSec?`<span style="background:rgba(255,255,255,0.15);border-radius:8px;padding:4px 10px;font-size:12px;font-weight:800;">🟠 Tempo ${_fmtPace(_tempoPaceSec)}</span>`:''}
        ${_racePaceSec?`<span style="background:rgba(255,255,255,0.15);border-radius:8px;padding:4px 10px;font-size:12px;font-weight:800;">🏁 Objectif ${_fmtPace(Math.round(_racePaceSec))}</span>`:''}
      </div>
    </div>`:'';

  // Build target time encart if target_time defined
  let _targetHtml = '';
  if (_obData.target_time) {
    const tt = _obData.target_time;
    let totalSec = 0;
    const parts = tt.split(':');
    if (parts.length === 3) totalSec = parseInt(parts[0])*3600 + parseInt(parts[1])*60 + parseInt(parts[2]);
    else if (parts.length === 2) totalSec = parseInt(parts[0])*3600 + parseInt(parts[1])*60;
    const distKm = _obData.race_distance_km || (course === 'Marathon' ? 42.195 : course === 'Semi-marathon' ? 21.0975 : course === '10 km' ? 10 : 5);
    const paceSecPerKm = totalSec / distKm;
    const paceMin = Math.floor(paceSecPerKm / 60);
    const paceSec = Math.round(paceSecPerKm % 60);
    const paceStr = paceMin + "'" + String(paceSec).padStart(2,'0') + '"';
    const niveaux = ['Découverte','Débutant','Intermédiaire','Confirmé'];
    const nIdx = Math.max(0, niveaux.indexOf(_obData.niveau || 'Intermédiaire'));
    const barFill = Math.round(((nIdx + 1) / niveaux.length) * 100);
    _targetHtml = `<div style="background:#EEF2FD;border-radius:12px;padding:14px 16px;margin-bottom:12px;">
  <div style="font-size:15px;font-weight:700;color:#1B4FD8;margin-bottom:8px;">🎯 Objectif : ${tt} &middot; ${paceStr}/km</div>
  <div style="background:#d1d5db;border-radius:6px;height:10px;overflow:hidden;margin-bottom:4px;">
    <div style="width:${barFill}%;background:#1B4FD8;height:100%;border-radius:6px;"></div>
  </div>
  <div style="font-size:12px;color:#374151;">Niveau ${_obData.niveau || 'Intermédiaire'} ✓</div>
</div>`;
  }

  // Build SVG progression chart
  let _chartHtml = '';
  if (_obData.km_semaine) {
    const today2 = new Date(); today2.setHours(0,0,0,0);
    const race2 = _obData.date ? new Date(_obData.date) : null;
    const diffDays2 = race2 ? Math.round((race2 - today2) / 86400000) : 0;
    const numWeeks2 = race2 ? Math.max(4, Math.round(diffDays2 / 7)) : 16;
    const baseKm2 = parseInt(_obData.km_semaine, 10) || 20;
    const mult2 = (course === 'Marathon') ? 1.8 : (course === 'Semi-marathon') ? 1.5 : 1.3;
    const peakKm2 = Math.round(baseKm2 * mult2);
    const wks = _obEstimateWeekProgression(numWeeks2, baseKm2, peakKm2);
    const maxKm = Math.max.apply(null, wks);
    const svgH = 60;
    const barW = Math.max(4, Math.floor(280 / numWeeks2) - 1);
    const taperW2 = numWeeks2 >= 12 ? 2 : 1;
    let bars = '';
    wks.forEach(function(km, i) {
      const barH = Math.round((km / maxKm) * svgH * 0.85);
      const x = i * (barW + 1);
      const y = svgH - barH;
      const isTaper = i >= numWeeks2 - taperW2;
      const isPeak = km === maxKm;
      const fill = isTaper ? '#f97316' : isPeak ? '#1e3a8a' : '#1B4FD8';
      const opacity = isTaper ? '0.85' : isPeak ? '1' : '0.65';
      bars += '<rect x="'+x+'" y="'+y+'" width="'+barW+'" height="'+barH+'" fill="'+fill+'" opacity="'+opacity+'" rx="1"/>';
    });
    _chartHtml = '<div style="margin-top:14px;background:#EEF2FD;border-radius:12px;padding:12px 14px;">'
      + '<div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">📊 Progression hebdomadaire estimée</div>'
      + '<svg viewBox="0 0 '+numWeeks2*(barW+1)+' '+svgH+'" style="width:100%;height:'+svgH+'px;display:block;">'+bars+'</svg>'
      + '<div style="display:flex;justify-content:space-between;font-size:11px;color:#6b7280;margin-top:4px;">'
      + '<span>S1 : '+wks[0]+' km</span><span>Pic : '+peakKm2+' km</span><span>Race 🏁</span>'
      + '</div></div>';
  }

  el.innerHTML=`<div style="background:linear-gradient(135deg,#1B4FD8,#0C447C);border-radius:14px;padding:16px;margin-bottom:16px;color:#fff;">
    <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;opacity:0.7;margin-bottom:12px;">✅ Récapitulatif</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div style="background:rgba(255,255,255,0.12);border-radius:10px;padding:10px;">
        <p style="font-size:10px;opacity:0.7;margin-bottom:3px;">Distance</p>
        <p style="font-size:14px;font-weight:800;">${courseLabel}</p>
      </div>
      <div style="background:rgba(255,255,255,0.12);border-radius:10px;padding:10px;">
        <p style="font-size:10px;opacity:0.7;margin-bottom:3px;">Niveau</p>
        <p style="font-size:14px;font-weight:800;">${niveauEmoji} ${niveau}</p>
      </div>
      <div style="background:rgba(255,255,255,0.12);border-radius:10px;padding:10px;">
        <p style="font-size:10px;opacity:0.7;margin-bottom:3px;">Séances / sem.</p>
        <p style="font-size:14px;font-weight:800;">${sess} séances</p>
      </div>
      <div style="background:rgba(255,255,255,0.12);border-radius:10px;padding:10px;">
        <p style="font-size:10px;opacity:0.7;margin-bottom:3px;">Volume actuel</p>
        <p style="font-size:14px;font-weight:800;">${km} km/sem.</p>
      </div>
      <div style="background:rgba(255,255,255,0.12);border-radius:10px;padding:10px;grid-column:1/-1;">
        <p style="font-size:10px;opacity:0.7;margin-bottom:3px;">📈 Volume de pointe estimé</p>
        <p style="font-size:14px;font-weight:800;">${_peakKm} km/sem.</p>
      </div>
    </div>
    <div style="background:rgba(255,255,255,0.18);border-radius:10px;padding:10px;margin-top:8px;display:flex;justify-content:space-between;align-items:center;border:1px solid rgba(255,255,255,0.3);">
      <span style="font-size:13px;opacity:0.9;">📅 ${dateStr}</span>
      <span style="font-size:15px;font-weight:900;">${numWeeks} semaines</span>
    </div>
    ${_targetHtml}${_pacesHtml}
  </div>${_chartHtml}`;
  el.style.display='block';
}

async function saveOnboarding(){
  if(_obSaving) return; // évite le double-save (chip click + bouton Terminer en <220ms)
  _obSaving=true;
  const generatePlan=_obData.generate_plan==='oui';

  // Écran de chargement
  let loadEl=null;
  if(generatePlan){
    try {
      loadEl=document.createElement('div');
      loadEl.style.cssText='position:fixed;inset:0;z-index:9999;background:#0C447C;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;';
      loadEl.innerHTML=`
        <div style="font-size:48px;">🏃</div>
        <p style="color:#fff;font-size:20px;font-weight:800;letter-spacing:-0.02em;">Génération du plan…</p>
        <p id="ob-gen-msg" style="color:rgba(255,255,255,0.7);font-size:14px;font-weight:500;">Calcul des semaines d'entraînement</p>
        <div style="width:260px;background:rgba(255,255,255,0.2);border-radius:8px;height:8px;overflow:hidden;">
          <div id="ob-gen-bar" style="height:8px;background:#fff;border-radius:8px;width:0%;transition:width 0.4s ease;"></div>
        </div>
        <p id="ob-gen-pct" style="color:#fff;font-size:13px;font-weight:700;">0%</p>`;
      document.body.appendChild(loadEl);

      const setProgress=(pct,msg)=>{
        const bar=document.getElementById('ob-gen-bar');
        const pctEl=document.getElementById('ob-gen-pct');
        const msgEl=document.getElementById('ob-gen-msg');
        if(bar) bar.style.width=pct+'%';
        if(pctEl) pctEl.textContent=pct+'%';
        if(msg&&msgEl) msgEl.textContent=msg;
      };

      // Générer le plan
      setProgress(10,'Calcul des semaines d\'entraînement…');
      await new Promise(r=>setTimeout(r,300));
      const plan=generateAthletePlan(_obData);
      const entries=Object.entries(plan||{});
      setProgress(30,'Plan calculé — enregistrement…');
      await new Promise(r=>setTimeout(r,200));

      // Sauvegarder onboarding
      if(dbRef){
        state.onboarding=_obData;
        if(_adminPreviewUid){
          const _t=await getAuthToken();
          await fetch(FUNCTIONS_BASE+'/dbAdmin',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+_t},body:JSON.stringify({action:'write',path:`users/${_adminPreviewUid}/state/onboarding`,value:_obData})}).catch(()=>{});
        } else {
          await dbRef.child('onboarding').set(_obData).catch(()=>{});
        }
      }
      setProgress(50,'Profil sauvegardé…');
      await new Promise(r=>setTimeout(r,200));

      // Sauvegarder tout le plan en un seul update Firebase
      if(dbRef && entries.length>0){
        const updates={};
        // Enregistrer la date de début du plan (= aujourd'hui)
        const startDate=new Date().toISOString().split('T')[0];
        state.plan_start_date=startDate;
        updates.plan_start_date=startDate;
        // EF pace — déclarée en priorité, sinon dérivée depuis le temps cible
        if(_obData.ef_pace){
          state.ef_pace=_obData.ef_pace;
          updates.ef_pace=_obData.ef_pace;
        } else if(_obData.target_time&&_obData.race_distance_km){
          const _rDist=parseFloat(_obData.race_distance_km)||42.195;
          const _tp=_obData.target_time.split(':').map(Number);
          const _ts=_tp.length===3?_tp[0]*3600+_tp[1]*60+_tp[2]:_tp.length===2?_tp[0]*60+_tp[1]:0;
          if(_ts>0){
            const _rps=_ts/_rDist;
            const _niv=_obData.niveau||'Intermédiaire';
            const _crs=_obData.course||'Marathon';
            const _efM={'Marathon':{Débutant:1.40,Intermédiaire:1.36,Confirmé:1.32},'Semi-marathon':{Débutant:1.38,Intermédiaire:1.34,Confirmé:1.30},'10 km':{Débutant:1.35,Intermédiaire:1.31,Confirmé:1.28},'5 km':{Débutant:1.32,Intermédiaire:1.28,Confirmé:1.25}}[_crs]||{Débutant:1.38,Intermédiaire:1.36,Confirmé:1.32};
            const _efSec=Math.round(_rps*(_efM[_niv]||1.36));
            const _efStr=Math.floor(_efSec/60)+":"+String(_efSec%60).padStart(2,'0');
            state.ef_pace=_efStr; updates.ef_pace=_efStr;
          }
        }
        // Jours et horaire de course
        if(_obData.run_days){ state.run_days=_obData.run_days; updates.run_days=JSON.stringify(_obData.run_days); }
        if(_obData.run_time){ state.run_time=_obData.run_time; updates.run_time=_obData.run_time; }
        if(_obData.run_times){ state.run_times=_obData.run_times; updates.run_times=JSON.stringify(_obData.run_times); }
        if(_obData.target_time){ state.target_time=_obData.target_time; updates.target_time=_obData.target_time; }
        if(_obData.race_distance_km){ state.race_distance_km=_obData.race_distance_km; updates.race_distance_km=_obData.race_distance_km; }
        if(_obData.fc_max){ state.fc_max=_obData.fc_max; updates.fc_max=_obData.fc_max; }
        entries.forEach(([k,v])=>{ state[k]=v; updates[k]=v; });
        if(_adminPreviewUid){
          const _t=await getAuthToken();
          await fetch(FUNCTIONS_BASE+'/dbAdmin',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+_t},body:JSON.stringify({action:'update',path:`users/${_adminPreviewUid}/state`,value:updates})}).catch(()=>{});
        } else {
          await dbRef.update(updates).catch(()=>{});
        }
      }
      setProgress(85,'Séances créées…');
      await new Promise(r=>setTimeout(r,300));
      setProgress(100,'Prêt ! 🎉');
      await new Promise(r=>setTimeout(r,600));
      loadEl.remove();
    } catch(e){
      console.error('[plan] Erreur génération:', e);
      if(loadEl){ try{loadEl.remove();}catch(_){} }
      _obSaving=false;
      const _errOv=document.createElement('div');
      _errOv.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:24px;';
      _errOv.innerHTML=`<div style="background:#fff;border-radius:16px;padding:24px;max-width:320px;text-align:center;"><p style="font-size:18px;font-weight:800;margin-bottom:12px;">⚠️ Erreur</p><p style="font-size:14px;color:#555;margin-bottom:20px;line-height:1.5;">Une erreur est survenue lors de la génération du plan. Réessaie ou reviens en arrière pour vérifier tes paramètres.</p><button onclick="this.closest('div[style]').remove()" style="padding:12px 24px;background:#1B4FD8;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;">OK</button></div>`;
      document.body.appendChild(_errOv);
      return;
    }
  } else {
    // Plan non généré : sauvegarder quand même le profil et les préférences
    if(dbRef){
      state.onboarding=_obData;
      await dbRef.child('onboarding').set(_obData).catch(()=>{});
      const updates={};
      if(_obData.fc_max){ state.fc_max=_obData.fc_max; updates.fc_max=_obData.fc_max; }
      if(_obData.ef_pace){ state.ef_pace=_obData.ef_pace; updates.ef_pace=_obData.ef_pace; }
      if(_obData.run_days){ state.run_days=_obData.run_days; updates.run_days=JSON.stringify(_obData.run_days); }
      if(_obData.run_time){ state.run_time=_obData.run_time; updates.run_time=_obData.run_time; }
      if(_obData.run_times){ state.run_times=_obData.run_times; updates.run_times=JSON.stringify(_obData.run_times); }
      if(_obData.target_time){ state.target_time=_obData.target_time; updates.target_time=_obData.target_time; }
      if(_obData.race_distance_km){ state.race_distance_km=_obData.race_distance_km; updates.race_distance_km=_obData.race_distance_km; }
      if(Object.keys(updates).length>0) await dbRef.update(updates).catch(()=>{});
    }
  }

  _obSaving=false;
  hideOnboarding();
  rendered.plan=false; // Force re-render plan tab quel que soit l'état du cache
  if(_obEditMode) renderCompteScreen();
  else renderHome();
  renderPlan();
  if(_adminPreviewUid) _refreshAthleteCoachView();
}

