let _obStep=0;
let _obData={course:null,date:null,sessions:null,niveau:null,km_semaine:null,generate_plan:null};
let _obEditMode=false;
let _obSaving=false; // garde contre double-save

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
  const minWByCourse={Plaisir:8,'5 km':8,'10 km':8,'Semi-marathon':10,'Marathon':12};
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
    }
  } else {
    if(errEl) errEl.style.display='none';
    _obData.date=null;
  }
}

function hideOnboarding(){
  const el=document.getElementById('onboarding-overlay');
  if(el) el.style.display='none';
}

function _obGoTo(step){
  _obStep=step;
  const OB_STEPS=9;
  for(let i=0;i<OB_STEPS;i++){
    const s=document.getElementById('ob-step-'+i);
    if(s) s.style.display=i===step?'block':'none';
    const p=document.getElementById('ob-prog-'+i);
    if(p) p.style.background=i<=step?'#1B4FD8':'#e0e0e0';
  }
  // Initialiser l'étape jours avec la bonne limite
  if(step===5) setTimeout(initObDaysStep, 0);
  if(step===8) setTimeout(_initObTargetTime, 0);
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
    setTimeout(()=>onboardingNext(),220);
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
  } else if(dist&&_obData.ef_pace){
    // Suggérer un temps réaliste basé sur l'allure EF
    const parts=(_obData.ef_pace).replace("'",":").split(':');
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
  if(h>0||m>0||s>0){
    _obData.target_time=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
  } else {
    delete _obData.target_time;
  }
}

function onKmCustomInput(val){
  const km = parseInt(val);
  const warn = document.getElementById('ob-km-sessions-warn');
  if(km > 0 && km <= 300){
    _obData.km_semaine = String(km);
    const next = document.getElementById('ob-btn-next');
    if(next){ next.disabled=false; next.style.opacity='1'; }
    // Avertissement si volume trop élevé pour le nb de séances choisi
    const sess = parseInt(_obData.sessions)||3;
    const over = (sess<=2 && km>40) || (sess===3 && km>55);
    if(warn) warn.style.display = over ? 'block' : 'none';
  } else {
    delete _obData.km_semaine;
    const next = document.getElementById('ob-btn-next');
    if(next){ next.disabled=true; next.style.opacity='0.4'; }
    if(warn) warn.style.display='none';
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
    setTimeout(()=>onboardingNext(),220);
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
    if(arr.length>=max) _obData.run_days=[]; // remplace la sélection au lieu de bloquer
    _obData.run_days.push(dayIdx);
  }
  _updateObDaysUI();
}

async function saveOnboarding(){
  if(_obSaving) return; // évite le double-save (chip click + bouton Terminer en <220ms)
  _obSaving=true;
  const generatePlan=_obData.generate_plan==='oui';

  // Écran de chargement
  let loadEl=null;
  if(generatePlan){
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
          const _efStr=Math.floor(_efSec/60)+"'"+String(_efSec%60).padStart(2,'0');
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

