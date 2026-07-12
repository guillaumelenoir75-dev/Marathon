const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const VAPID_PUBLIC_KEY = defineSecret("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = defineSecret("VAPID_PRIVATE_KEY");

const {
  ADMIN_UID,
  ADMIN_STATE,
  getUserPref,
  sendPush,
  sendPushToAll,
  sendPushToUser,
  getCurrentWeek,
  buildNotifContext,
  callAnthropic,
} = require('./helpers');

exports.fcReposReminderWeekday = onSchedule(
  {schedule:'58 7 * * 1-5',timeZone:'Europe/Paris',secrets:[VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY]},
  async()=>{try{const db=admin.database();const today=new Date().toISOString().slice(0,10);if(await getUserPref(db,ADMIN_STATE,'notif_fc_repos')){const snap=await db.ref(`${ADMIN_STATE}/_wakeup_${today}`).once('value');if(!snap.val())await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'💪 C\'est parti pour aujourd\'hui !',"Enregistre ton réveil → reçois ton brief du matin 🏃‍♂️",'fc-repos','/');}await sendPushToAll(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'☀️ Bonne journée !','Pense à rentrer ta FC repos ce matin ❤️','fc-repos','/',ADMIN_UID,'notif_fc_repos');}catch(e){console.error('fcReposReminderWeekday:',e.message);}}
);

exports.fcReposReminderWeekend = onSchedule(
  {schedule:'30 9 * * 0,6',timeZone:'Europe/Paris',secrets:[VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY]},
  async()=>{try{const db=admin.database();const today=new Date().toISOString().slice(0,10);if(await getUserPref(db,ADMIN_STATE,'notif_fc_repos')){const snap=await db.ref(`${ADMIN_STATE}/_wakeup_${today}`).once('value');if(!snap.val())await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'💪 C\'est parti pour aujourd\'hui !',"Enregistre ton réveil → reçois ton brief du matin 🏃‍♂️",'fc-repos','/');}await sendPushToAll(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'☀️ Bonne journée !','Pense à rentrer ta FC repos ce matin ❤️','fc-repos','/',ADMIN_UID,'notif_fc_repos');}catch(e){console.error('fcReposReminderWeekend:',e.message);}}
);

exports.fcReposReminder14hWeekday = onSchedule(
  {schedule:'0 14 * * 1-5',timeZone:'Europe/Paris',secrets:[VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY]},
  async()=>{try{const db=admin.database();const today=new Date().toISOString().slice(0,10);if(await getUserPref(db,ADMIN_STATE,'notif_fc_repos')){const snap=await db.ref(`${ADMIN_STATE}/_wakeup_${today}`).once('value');if(!snap.val())await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'⏰ Hey, t\'as oublié quelque chose !',"Ton brief du matin t'attend — enregistre ton réveil 👆",'fc-repos-14h','/');}await sendPushToAll(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'⏰ Rappel FC repos',"Pense à rentrer ta FC avant la fin de journée ❤️",'fc-repos-14h','/',ADMIN_UID,'notif_fc_repos');}catch(e){console.error('fcReposReminder14hWeekday:',e.message);}}
);

exports.fcReposReminder14hWeekend = onSchedule(
  {schedule:'0 14 * * 0,6',timeZone:'Europe/Paris',secrets:[VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY]},
  async()=>{try{const db=admin.database();const today=new Date().toISOString().slice(0,10);if(await getUserPref(db,ADMIN_STATE,'notif_fc_repos')){const snap=await db.ref(`${ADMIN_STATE}/_wakeup_${today}`).once('value');if(!snap.val())await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'⏰ Hey, t\'as oublié quelque chose !',"Ton brief du matin t'attend — enregistre ton réveil 👆",'fc-repos-14h','/');}await sendPushToAll(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'⏰ Rappel FC repos',"Pense à rentrer ta FC avant la fin de journée ❤️",'fc-repos-14h','/',ADMIN_UID,'notif_fc_repos');}catch(e){console.error('fcReposReminder14hWeekend:',e.message);}}
);

exports.sessionReminder = onSchedule(
  {schedule:'*/30 7-21 * * *',timeZone:'Europe/Paris',secrets:[VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY]},
  async()=>{
    const db=admin.database();
    const cw=getCurrentWeek();
    const now=new Date();
    const parisStr=now.toLocaleString('en-US',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',hour12:false});
    const parisH=parseInt(parisStr.split(':')[0]);
    const parisM=parseInt(parisStr.split(':')[1]);
    const parisDate=new Date(now.toLocaleString('en-US',{timeZone:'Europe/Paris'}));
    const dayOfWeek=parisDate.getDay()===0?7:parisDate.getDay();
    const nowMinutes=parisH*60+parisM;
    const ts=now.toISOString().slice(0,10);
    try{
      if(await getUserPref(db,ADMIN_STATE,'notif_seance')){
        const state=(await db.ref(`${ADMIN_STATE}`).once('value')).val()||{};
        for(let si=0;si<5;si++){
          const done=!!state[`s${cw}i${si}done`];if(done)continue;
          const edRaw=state[`edit_w${cw}_s${si}`];if(!edRaw)continue;
          let ed;try{ed=JSON.parse(edRaw);}catch(e){continue;}
          if(Number(ed.sched_day)!==dayOfWeek||!ed.sched_time)continue;
          const[h,m]=ed.sched_time.split(':').map(Number);
          const sm=h*60+m;
          if(sm<nowMinutes+45||sm>nowMinutes+75)continue;
          const rk=`_rappel_sent_w${cw}_s${si}`;
          if(state[rk]===ts)continue;
          const titre=ed.d?ed.d.split('|')[0]:(ed.type||'').toUpperCase();
          const isRunSession=['ef','tempo','frac','long','race'].includes((ed.type||'').toLowerCase());
          let meteoStr='';
          if(isRunSession){
            try{
              const locSnap=await db.ref(`${ADMIN_STATE}/_last_location`).once('value');
              const loc=locSnap.val();
              const tsMs = loc && loc.ts ? (loc.ts < 1e10 ? loc.ts*1000 : loc.ts) : 0;
              const locFresh = loc && loc.lat && tsMs && (Date.now()-tsMs)<30*24*3600*1000;
              const lat=locFresh?loc.lat:48.8417;
              const lng=locFresh?loc.lng:2.2945;
              const seanceH=parseInt(ed.sched_time.split(':')[0]);
              const meteoResp=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,apparent_temperature,weather_code&timezone=Europe%2FParis&forecast_days=1`);
              const meteoData=await meteoResp.json();
              if(meteoData.hourly){
                const temp=meteoData.hourly.temperature_2m?.[seanceH];
                const apparent=meteoData.hourly.apparent_temperature?.[seanceH];
                const wcode=meteoData.hourly.weather_code?.[seanceH];
                const wmoEmoji=wcode===0?'☀️':wcode<=2?'⛅':wcode<=3?'☁️':wcode<=48?'🌫️':wcode<=67?'🌧️':wcode<=77?'🌨️':wcode<=82?'🌦️':wcode<=99?'⛈️':'🌤️';
                const wmoLabel=wcode===0?'Ensoleillé':wcode<=2?'Peu nuageux':wcode<=3?'Couvert':wcode<=48?'Brouillard':wcode<=55?'Bruine':wcode<=67?'Pluie':wcode<=77?'Neige':wcode<=82?'Averses':wcode<=99?'Orage':'Variable';
                const t=Math.round(apparent??temp??0);
                meteoStr=` ${wmoEmoji} ${wmoLabel}, ${t}°C.`;
              }
            }catch(e){}
          }
          const body=`🏃 ${titre}${ed.km?' — '+ed.km+'km':''} à ${ed.sched_time}.${meteoStr} Prépare ton équipement ! 💪`;
          await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'⏱️ Séance dans 1h',body,'session-reminder','/');
          await db.ref(`${ADMIN_STATE}/${rk}`).set(ts);
          break;
        }
        let extraRi=0;
        while(extraRi<=20&&state[`extra_w${cw}_s${extraRi}`]){
          const done=!!state[`extra_w${cw}_s${extraRi}_done`];
          if(!done){
            let es;try{es=JSON.parse(state[`extra_w${cw}_s${extraRi}`]);}catch(e){extraRi++;continue;}
            if(Number(es.sched_day)===dayOfWeek&&es.sched_time){
              const[h,m]=es.sched_time.split(':').map(Number);
              const sm=h*60+m;
              if(sm>=nowMinutes+45&&sm<=nowMinutes+75){
                const rk=`_rappel_extra_sent_w${cw}_s${extraRi}`;
                if(state[rk]!==ts){
                  const titre=es.d?es.d.split('|')[0]:(es.type||'').toUpperCase();
                  const body=`🏃 ${titre}${es.km?' — '+es.km+'km':''} à ${es.sched_time}. Prépare ton équipement ! 💪`;
                  await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'⏱️ Séance dans 1h',body,'session-reminder','/');
                  await db.ref(`${ADMIN_STATE}/${rk}`).set(ts);
                  break;
                }
              }
            }
          }
          extraRi++;
        }
      }
    }catch(e){console.error('sessionReminder admin run/extra:',e.message);}
    try{
      if(await getUserPref(db,ADMIN_STATE,'notif_seance')){
        const state=(await db.ref(`${ADMIN_STATE}`).once('value')).val()||{};
        const allRenfoNames={1:'Ischio-fessiers',2:'Bas du dos',3:'Gainage & Core',4:'Mollets & Chevilles',5:'Haut du corps'};
        const renfoNames={1:allRenfoNames[parseInt(state.renfo_prog1)||1]||'Ischio-fessiers',2:allRenfoNames[parseInt(state.renfo_prog2)||2]||'Bas du dos'};
        for(let ri=1;ri<=2;ri++){
          const schedRaw=state[`rf${cw}r${ri}sched`];if(!schedRaw)continue;
          let sched;try{sched=JSON.parse(schedRaw);}catch(e){continue;}
          if(!sched.day||!sched.time)continue;
          if(Number(sched.day)!==dayOfWeek)continue;
          const[h,m]=sched.time.split(':').map(Number);
          const sm=h*60+m;
          if(sm<nowMinutes+45||sm>nowMinutes+75)continue;
          const rk=`_rappel_renfo_sent_w${cw}_r${ri}`;
          if(state[rk]===ts)continue;
          const done=!!state[`rf${cw}r${ri}done`];if(done)continue;
          console.log(`sessionReminder: renfo R${ri} planifié ${sched.time} J${sched.day} → push envoyé`);
          await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'⏱️ Renfo dans 1h',`💪 ${renfoNames[ri]} à ${sched.time}. Prépare-toi !`,'session-reminder','/');
          await db.ref(`${ADMIN_STATE}/${rk}`).set(ts);
          break;
        }
      }
    }catch(e){console.error('sessionReminder admin renfo:',e.message);}
    // ── Athlètes : rappel séances normales + extra 1h avant ──────────────────
    try{
      const subsSnap=await db.ref('_push_subscribers').once('value');
      const allSubs=subsSnap.val()||{};
      const uids=Object.keys(allSubs).filter(uid=>uid!==ADMIN_UID);
      const userStates=await Promise.all(uids.map(uid=>db.ref(`users/${uid}/state`).once('value').then(s=>s.val()||{})));
      for(let i=0;i<uids.length;i++){
        const uid=uids[i];const sub=allSubs[uid];
        const uState=userStates[i];
        const prefs=uState._prefs?(typeof uState._prefs==='string'?JSON.parse(uState._prefs):uState._prefs):{};
        if(prefs.notif_seance===false)continue;
        const ucw=getCurrentWeek(uState.plan_start_date);
        let sent=false;
        for(let si=0;si<5;si++){
          const done=!!uState[`s${ucw}i${si}done`];if(done)continue;
          const edRaw=uState[`edit_w${ucw}_s${si}`];if(!edRaw)continue;
          let ed;try{ed=JSON.parse(edRaw);}catch(e){continue;}
          if(ed.type==='rest')continue;
          if(Number(ed.sched_day)!==dayOfWeek||!ed.sched_time)continue;
          const[h,m]=ed.sched_time.split(':').map(Number);
          const sm=h*60+m;
          if(sm<nowMinutes+45||sm>nowMinutes+75)continue;
          const rk=`_rappel_sent_w${ucw}_s${si}`;
          if(uState[rk]===ts)continue;
          const titre=ed.d?ed.d.split('|')[0]:(ed.type||'').toUpperCase();
          const body=`🏃 ${titre}${ed.km?' — '+ed.km+'km':''} à ${ed.sched_time}. Prépare ton équipement ! 💪`;
          await sendPushToUser(db,uid,sub,VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'⏱️ Séance dans 1h',body,'session-reminder');
          await db.ref(`users/${uid}/state/${rk}`).set(ts);
          sent=true;break;
        }
        if(sent)continue;
        let extraRi=0;
        while(extraRi<=20&&uState[`extra_w${ucw}_s${extraRi}`]){
          const done=!!uState[`extra_w${ucw}_s${extraRi}_done`];
          if(!done){
            let es;try{es=JSON.parse(uState[`extra_w${ucw}_s${extraRi}`]);}catch(e){extraRi++;continue;}
            if(Number(es.sched_day)===dayOfWeek&&es.sched_time){
              const[h,m]=es.sched_time.split(':').map(Number);
              const sm=h*60+m;
              if(sm>=nowMinutes+45&&sm<=nowMinutes+75){
                const rk=`_rappel_extra_sent_w${ucw}_s${extraRi}`;
                if(uState[rk]!==ts){
                  const titre=es.d?es.d.split('|')[0]:(es.type||'').toUpperCase();
                  const body=`🏃 ${titre}${es.km?' — '+es.km+'km':''} à ${es.sched_time}. Prépare ton équipement ! 💪`;
                  await sendPushToUser(db,uid,sub,VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'⏱️ Séance dans 1h',body,'session-reminder');
                  await db.ref(`users/${uid}/state/${rk}`).set(ts);
                  break;
                }
              }
            }
          }
          extraRi++;
        }
      }
    }catch(e){console.error('sessionReminder athletes:',e.message);}
  }
);

exports.briefAfterFcRepos = onSchedule(
  {schedule:'*/2 6-22 * * *',timeZone:'Europe/Paris',timeoutSeconds:120,secrets:[VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY,ANTHROPIC_API_KEY]},
  async()=>{
    try{
      const db=admin.database();
      if(!await getUserPref(db,ADMIN_STATE,'notif_brief_matin'))return;
      const state=(await db.ref(`${ADMIN_STATE}`).once('value')).val()||{};
      const trigger=state['_brief_trigger'];
      if(!trigger||!trigger.ts)return;

      const ageMin=(Date.now()-trigger.ts)/60000;
      if(ageMin>60){ await db.ref(`${ADMIN_STATE}/_brief_trigger`).remove(); return; }

      const todayStr=trigger.date||new Date().toISOString().slice(0,10);
      const fcNotifKey='_brief_fc_notif_'+todayStr;
      if(state[fcNotifKey]===true){ await db.ref(`${ADMIN_STATE}/_brief_trigger`).remove(); return; }

      // Si le brief a déjà été généré aujourd'hui (par le client ou le test),
      // ne pas rappeler l'IA mais envoyer quand même la push avec le brief existant.
      if(state['_brief_matin_'+todayStr]===true){
        console.log('briefAfterFcRepos: brief déjà généré — envoi push avec brief existant');
        await db.ref(`${ADMIN_STATE}/${fcNotifKey}`).set(true);
        await db.ref(`${ADMIN_STATE}/_brief_trigger`).remove();
        // Envoyer la push avec le brief existant dans _brief_pending
        try{
          const pending=state['_brief_pending'];
          const existingBody=pending?`Brief du matin prêt — ouvre le Coach 🏃`:'Brief prêt';
          const subSnap=await db.ref(`${ADMIN_STATE}/_push_sub`).once('value');
          if(subSnap.val()){
            await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),`🏃 Brief du matin — S${getCurrentWeek()}`,existingBody,'brief-matinal','/');
          }else{
            console.log('briefAfterFcRepos: pas de subscription — brief disponible dans l\'app');
          }
        }catch(ePush){console.warn('briefAfterFcRepos push (existing brief):',ePush.message);}
        return;
      }

      // Note: on ne bloque plus sur _push_sub avant la génération.
      // Le brief est toujours généré et sauvegardé dans _brief_pending.
      // La push n'est tentée qu'après (si subscription dispo).

      const cw=getCurrentWeek();
      const ctx=await buildNotifContext(state,cw);

      // ── Récupérer les données WHOOP ───────────────────────────────────────────
      const wd=state['whoop_data']||(state.whoop_data)||null;

      // Vérifier si les données WHOOP sont d'aujourd'hui
      const whoopRecov=wd&&wd.recoveries&&wd.recoveries[0]?wd.recoveries[0]:null;
      const whoopDate=whoopRecov&&whoopRecov.date?whoopRecov.date.slice(0,10):null;
      const whoopToday=(whoopDate===todayStr);

      // Si WHOOP est connecté mais les données ne sont pas encore d'aujourd'hui,
      // attendre jusqu'à 10 min que WHOOP finisse de traiter le sommeil avant de générer le brief.
      const whoopConnected=!!(state.whoop_token&&(typeof state.whoop_token==='object'?state.whoop_token.access_token:state.whoop_token));
      if(whoopConnected&&!whoopToday&&ageMin<10){
        console.log(`briefAfterFcRepos: WHOOP connecté mais données pas encore d'aujourd'hui (${whoopDate||'aucune'}) — on attend (${Math.round(ageMin)} min / 10 min max)`);
        return; // conserver le trigger, réessayer au prochain tick (2 min)
      }

      // FC repos : priorité WHOOP RHR d'aujourd'hui > valeur manuelle du jour
      const fcWhoopRhr=(whoopToday&&whoopRecov&&whoopRecov.rhr)?whoopRecov.rhr:null;
      const fcToday=fcWhoopRhr||state['fc_repos_'+todayStr]||null;

      let whoopBlock='';
      if(wd){
        const r=whoopRecov;
        const s=wd.sleeps&&wd.sleeps[0];
        const cy=wd.cycles&&wd.cycles[0];
        const lines=[];
        if(r){
          if(r.score!=null)lines.push(`Score de récupération WHOOP : ${r.score}% (${r.score>=67?'VERT — bonne forme':r.score>=34?'JAUNE — modéré':'ROUGE — fatigue'})`);
          if(r.rhr)lines.push(`FC repos WHOOP : ${r.rhr} bpm`);
          if(r.hrv)lines.push(`HRV : ${Math.round(r.hrv)} ms`);
          if(r.spo2)lines.push(`SpO2 : ${Math.round(r.spo2*10)/10}%`);
        }
        if(s){
          if(s.duration_hours)lines.push(`Durée de sommeil : ${s.duration_hours}`);
          if(s.performance_pct!=null)lines.push(`Performance sommeil : ${s.performance_pct}%`);
          if(s.rem_pct)lines.push(`REM : ${s.rem_pct}%`);
          if(s.efficiency_pct)lines.push(`Efficacité sommeil : ${s.efficiency_pct}%`);
        }
        if(cy&&cy.strain!=null)lines.push(`Charge WHOOP (strain) : ${Math.round(cy.strain*10)/10}`);
        // Historique 7j pour comparaison
        const hist7=(wd.recoveries||[]).slice(0,7);
        if(hist7.length>1){
          const scores=hist7.filter(x=>x.score!=null).map(x=>x.score);
          if(scores.length>1){const avg7=Math.round(scores.reduce((a,b)=>a+b,0)/scores.length);lines.push(`Moyenne récup 7 derniers jours : ${avg7}%`);}
        }
        if(lines.length>0)whoopBlock='\nDonnées WHOOP du matin :\n'+lines.join('\n');
      }

      // Score global synthétique (même calcul que stats.js — données les plus récentes, pas seulement aujourd'hui)
      const r0=whoopRecov;
      const s0=wd&&wd.sleeps?wd.sleeps[0]:null;
      const globalComps=[];
      if(r0?.score!=null)globalComps.push(r0.score);
      if(s0?.performance_pct!=null)globalComps.push(s0.performance_pct);
      if(fcToday!=null){
        const fcScore=fcToday<=44?100:fcToday<=50?Math.round(100-(fcToday-44)*3):fcToday<=60?Math.round(82-(fcToday-50)*3.7):fcToday<=70?Math.round(45-(fcToday-60)*4.5):0;
        globalComps.push(fcScore);
      }
      if(r0?.hrv!=null){const hrvScore=Math.max(0,Math.min(100,Math.round((r0.hrv-40)/50*100)));globalComps.push(hrvScore);}
      const globalScore=globalComps.length?Math.round(globalComps.reduce((a,b)=>a+b,0)/globalComps.length):null;
      const globalEmoji=globalScore===null?'':globalScore>=67?'🟢':globalScore>=34?'🟡':'🔴';
      const globalLabel=globalScore===null?'':globalScore>=67?'Bonne forme':globalScore>=34?'Forme moyenne':'Récupération insuffisante';
      const globalScoreLine=globalScore!==null?`Score du jour (synthétique) : ${globalScore}% ${globalEmoji} ${globalLabel} [moyenne récup+sommeil+FC${r0?.hrv!=null?'+VFC':''}]`:'';

      const now=new Date();
      const dow=now.getDay();
      const joursLong=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
      const moisNoms=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
      const dateComplet=`${joursLong[dow]} ${now.getDate()} ${moisNoms[now.getMonth()]} ${now.getFullYear()}`;

      // FC repos : moyenne 7 jours
      let fcSum=0,fcCount=0;
      for(let d=0;d<7;d++){
        const dd=new Date(now.getTime()-d*86400000);
        const ds=dd.toISOString().slice(0,10);
        const v=parseFloat(state['fc_repos_'+ds]);
        if(v&&!isNaN(v)){fcSum+=v;fcCount++;}
      }
      const fcMoy7j=fcCount>0?Math.round(fcSum/fcCount):null;

      // Allure EF : dernière séance EF valide (FC ≤ 148)
      let efPace=null;
      const paceStrToSec=p=>{if(!p)return null;const m=p.replace("'",':').split(':');if(m.length<2)return null;const s=parseInt(m[0])*60+parseInt(m[1]);return isNaN(s)?null:s;};
      const efPaces=[];
      if(state.ef_pace){const s=paceStrToSec(state.ef_pace.replace("'",':'));if(s)efPaces.push(s);}
      for(let ws=1;ws<=cw;ws++){
        for(let si=0;si<5;si++){
          const pr=state[`w${ws}_s${si}perf`]||state[`s${ws}i${si}perf`];
          if(!pr)continue;
          try{const p=JSON.parse(pr);if((p.type==='ef'||(!p.type&&state[`edit_w${ws}_s${si}`]&&JSON.parse(state[`edit_w${ws}_s${si}`]).type==='ef'))&&p.pace&&p.hr&&parseInt(p.hr)<=148){const s=paceStrToSec(p.pace);if(s)efPaces.push(s);}}catch(e){}
        }
      }
      if(efPaces.length>0){
        let refSec;
        if(efPaces.length<3){refSec=Math.min(...efPaces);}
        else{const last3=efPaces.slice(-3);const before3=efPaces.slice(0,-3);const prevBest=before3.length>0?Math.min(...before3):last3[0];const minL=Math.min(...last3);const medL=[...last3].sort((a,b)=>a-b)[1];refSec=minL<=prevBest?minL:medL;}
        let _em=Math.floor(refSec/60);let _es=Math.round(refSec%60);if(_es===60){_em++;_es=0;}efPace=`${_em}'${(_es+'').padStart(2,'0')}`;
      }
      efPace=efPace||"6'40";

      const isDecharge=[8,12,16,20,26,30].includes(cw);
      const consignesEf=isDecharge?`Semaine DÉCHARGE : allure EF lente, FC < 140 bpm`:`Allure EF de référence : ${efPace}/km — FC 140-148 bpm`;
      const memos=state['_coach_memos']||'';
      const seancesStr=ctx.seancesAujourdHui.length>0?ctx.seancesAujourdHui.join(' + '):'Récupération';
      const fcSource=fcWhoopRhr?'WHOOP RHR':'saisie manuelle';
      const fcLine=fcToday?`FC repos ce matin : ${fcToday} bpm [${fcSource}] (moyenne 7j : ${fcMoy7j||'—'} bpm)`:'FC repos non saisie ce matin';
      const memosLine=memos?`\nNotes coach (mémos) :\n${memos}`:'';

      // Séance run du jour — provient directement de buildNotifContext (gère suppressions, done, etc.)
      const seanceRunAujourdhui=ctx.seanceRunAujourdhui||null;
      const seanceHeure=seanceRunAujourdhui?.sched_time||null;
      const seanceHeureDig=seanceHeure?parseInt(seanceHeure.split(':')[0]):null;
      const estMatin=seanceHeureDig!==null?seanceHeureDig<12:true; // si pas d'heure, on suppose matin

      // ── Fetch météo côté serveur à l'heure de la séance ──────────────────────
      let meteoStr='';
      let tempSeance=null;
      try{
        const locSnap=await db.ref(`${ADMIN_STATE}/_last_location`).once('value');
        const loc=locSnap.val();
        const _tsBrief=loc&&loc.ts?(loc.ts<1e10?loc.ts*1000:loc.ts):0;
        const locFresh=loc&&loc.lat&&_tsBrief&&(Date.now()-_tsBrief)<30*24*3600*1000;
        const lat=locFresh?loc.lat:48.8417;
        const lng=locFresh?loc.lng:2.2945;
        const targetH=seanceHeureDig!==null?seanceHeureDig:8;
        const meteoResp=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,apparent_temperature,weather_code,precipitation_probability&timezone=Europe%2FParis&forecast_days=1`);
        const meteoData=await meteoResp.json();
        if(meteoData.hourly){
          const nowH=now.getHours();
          const tempCurrent=meteoData.hourly.temperature_2m?.[nowH];
          const temp=meteoData.hourly.temperature_2m?.[targetH];
          const apparent=meteoData.hourly.apparent_temperature?.[targetH];
          const wcode=meteoData.hourly.weather_code?.[targetH];
          const rainProb=meteoData.hourly.precipitation_probability?.[targetH]||0;
          // Prendre le max entre temp actuelle et temp prévue à la séance
          // (évite de sous-estimer la chaleur si le brief est généré pendant la canicule)
          const tempEffective=Math.max(temp||0,tempCurrent||0);
          tempSeance=Math.round(tempEffective);
          const ressenti=Math.round(apparent||temp||0);
          const wmoLabel=wcode===0?'Ensoleillé':wcode<=2?'Peu nuageux':wcode<=3?'Couvert':wcode<=48?'Brouillard':wcode<=55?'Bruine':wcode<=67?'Pluie':wcode<=77?'Neige':wcode<=82?'Averses':wcode<=99?'Orage':'Variable';
          meteoStr=`Météo prévue à ${seanceHeure||targetH+'h'} : ${tempSeance}°C (ressenti ${ressenti}°C), ${wmoLabel}${rainProb>40?', risque pluie '+rainProb+'%':''}`;
        }
      }catch(e){console.warn('briefAfterFcRepos météo:',e.message);}

      // ── Calcul gels et eau (pré-calculé selon km de la séance) ──────────────
      const seanceKm=seanceRunAujourdhui&&seanceRunAujourdhui.km>0?parseFloat(seanceRunAujourdhui.km):0;
      // Gels : seulement si ≥12km
      let gelInfo='Pas de gel (sortie <12km)';
      if(seanceKm>=42){gelInfo='8 gels aux km 6, 12, 17, 22, 26, 30, 34 & 38';}
      else if(seanceKm>=28){gelInfo='5 gels aux km 6, 12, 17, 22 & 26';}
      else if(seanceKm>=24){gelInfo='4 gels aux km 6, 12, 17 & 22';}
      else if(seanceKm>=20){gelInfo='3 gels aux km 6, 12 & 17';}
      else if(seanceKm>=16){gelInfo='2 gels aux km 6 & 12';}
      else if(seanceKm>=12){gelInfo='1 gel au km 6';}
      // Eau : <10km → pas d'eau sauf chaleur >28°C (500ml min) · ≥14km → 1L obligatoire
      let eauInfo;
      if(seanceKm>=14){eauInfo='1L d\'eau (sortie longue ≥14km)';}
      else if(seanceKm>0&&seanceKm<10){
        eauInfo=tempSeance!==null&&tempSeance>=28?`Chaleur ${tempSeance}°C : minimum 500ml d'eau`:'Pas d\'eau (sortie <10km, <1h)';
      }else{
        eauInfo=tempSeance!==null&&tempSeance>=28?`Chaleur ${tempSeance}°C : minimum 500ml d'eau`:'Pas d\'eau nécessaire';
      }

      // ── Calcul allure ajustée chaleur ─────────────────────────────────────────
      let allureAjusteeStr='';
      if(tempSeance!==null&&tempSeance>=25&&efPace){
        const efSec=parseInt(efPace.split("'")[0])*60+parseInt(efPace.split("'")[1]||'0');
        // +8 sec/km par 3°C au-dessus de 22°C, plafonné à +60 sec
        const deltaT=Math.max(0,tempSeance-22);
        const ajout=Math.min(60,Math.round((deltaT/3)*8));
        const ajustSec=efSec+ajout;
        const am=Math.floor(ajustSec/60);const as=ajustSec%60;
        allureAjusteeStr=`Allure AJUSTÉE chaleur (${tempSeance}°C) : ${am}'${String(as).padStart(2,'0')}/km (+${ajout} sec/km vs allure de référence)`;
      }

      // ── Générer le brief complet côté serveur ──────────────────────────────
      const system=`Tu es le coach running de Guillaume. Ta mission : rédiger un brief complet et personnalisé du matin, centré uniquement sur la journée d'aujourd'hui. Tu t'adresses DIRECTEMENT à Guillaume en le tutoyant ("tu", jamais "Guillaume" dans le corps du texte).

PROFIL :
- Prépare un marathon (18 octobre 2026), objectif Sub 4h. Plan structuré depuis février 2026.
- FC max 196 bpm. Zone EF : 140-148 bpm. FC repos > 55 bpm = signe de fatigue.
- Montre Garmin Forerunner 165.
- Lundi midi : séance bodyhit (électrostimulation).

STRUCTURE OBLIGATOIRE — dans cet ordre exact :

1. 😴 NUIT & RÉCUPÉRATION — bloc unique fusion sommeil + FC repos. Format OBLIGATOIRE : commencer par le Score du jour en **gras** sur sa propre ligne, puis chaque valeur détaillée sur sa propre ligne, puis UNE phrase d'analyse. Exemple de format attendu :
Score du jour : **76%** 🟢 Bonne forme
Score de récupération WHOOP : **71%** 🟢
FC repos WHOOP : **48 bpm**
VFC : **72 ms**
Durée de sommeil : **7h47**
Performance sommeil : **88%**
[une phrase d'analyse : compare avec moyenne 7j, charge veille, conclusion frais/modéré/fatigué]
Si le Score du jour n'est pas fourni dans le contexte (données insuffisantes), ne pas l'afficher.
Si une valeur n'est pas disponible dans le contexte (ex : VFC non mesurée), ne pas afficher sa ligne.

2. ✅ PRÊT POUR AUJOURD'HUI ? — synthèse de l'état du jour : es-tu bien reposé ? Quelque chose à surveiller ? Vert = feu vert total. Jaune = séance ok mais vigilance. Rouge = séance à adapter. 1-2 phrases directes. Tu t'adresses à moi directement : "Tu arrives...", "Ta récupération...", etc.

3. 🎯 PROGRAMME DU JOUR — lister les activités avec distance et heure. Si run + renfo, tout mentionner. Si repos : dire explicitement "Récupération active" et ce que ça implique.

4. ⚡ ALLURES & CONSIGNES — MAX 3 LIGNES au total, ultra-concis, chiffres en **gras** :
   Ligne 1 : allure cible en **gras** + FC cible en **gras** (si chaleur ≥25°C : allure ajustée en **gras** + delta en **gras** à la place).
   Ligne 2 : météo à l'heure de la séance en 1 phrase courte.
   Ligne 3 (optionnel) : 1 consigne technique seulement (si décharge : allure +30sec ; si récup rouge : réduire l'intensité). Rien d'autre.
   NE PAS dire que la temp est sous 25°C si les données météo indiquent ≥25°C.
   INTERDIT dans ce bloc : toute mention de gel, d'eau ou d'hydratation.

5. 🍌 NUTRITION — UNIQUEMENT si une séance run est planifiée. 2 points UNIQUEMENT, rien d'autre :
   GELS : recopier exactement la valeur du champ "Gels" fourni dans le contexte. Si "Pas de gel", ne pas écrire cette ligne.
   EAU : recopier exactement la valeur du champ "Eau" fourni dans le contexte.
   Format : 2 lignes courtes, valeurs en **gras**. Aucun commentaire supplémentaire sur la nutrition.

RÈGLES :
- Zéro #. Données chiffrées en **gras**. Ton de coach direct, personnel, naturel.
- Jamais de tirets en début de paragraphe — texte fluide.
- Jamais "Guillaume" dans le corps du texte — toujours "tu/ton/ta".
- Si pas de séance run aujourd'hui (repos ou renfo seul) : sauter blocs 4 et 5.
- INTERDIT : parler du reste de la semaine, des séances passées, des objectifs à long terme.`;

      const userMsg=`${dateComplet}
${globalScoreLine?globalScoreLine+'\n':''}${fcLine}${whoopBlock}
Séances du jour : ${seancesStr}
Heure de la séance : ${seanceHeure||'non définie'}
${meteoStr||'Météo : non disponible'}
${allureAjusteeStr||'Pas d\'ajustement chaleur nécessaire'}
Allure EF de référence (conditions normales) : ${efPace}/km
Consignes générales : ${consignesEf}
Gels : ${gelInfo}
Eau : ${eauInfo}
${memosLine}`;

      let briefContent='';
      try{
        const resp=await callAnthropic(ANTHROPIC_API_KEY.value(),system,[{role:'user',content:userMsg}],1100);
        briefContent=resp||'';
      }catch(e){console.error('briefAfterFcRepos AI error:',e.message);}

      // Fallback si l'IA échoue
      if(!briefContent){
        const fcMsg=fcToday?`FC repos : ${fcToday} bpm. `:'';
        briefContent=`❤️ ${fcMsg}\n\n🎯 ${seancesStr}`;
      }

      // Notification push : résumé enrichi
      const dayOfWeekNum=dow===0?7:dow;
      const _rAllN={1:'Ischio-fessiers',2:'Bas du dos'};
      const renfoNoms={1:'Renfo '+(_rAllN[parseInt(state.renfo_prog1)||1]||'Ischio-fessiers'),2:'Renfo '+(_rAllN[parseInt(state.renfo_prog2)||2]||'Bas du dos')};
      const renfoAujourdHui=[];
      for(let ri=1;ri<=2;ri++){
        const done=!!state[`rf${cw}r${ri}done`];if(done)continue;
        const schedRaw=state[`rf${cw}r${ri}sched`];if(!schedRaw)continue;
        let sched;try{sched=JSON.parse(schedRaw);}catch(e){continue;}
        if(Number(sched.day)===dayOfWeekNum)renfoAujourdHui.push(renfoNoms[ri]);
      }
      // Emoji couleur récupération — uniquement si données WHOOP d'aujourd'hui
      const recovScore=whoopToday&&whoopRecov&&whoopRecov.score!=null?whoopRecov.score:null;
      const recovEmoji=recovScore===null?'':recovScore>=67?'🟢':recovScore>=34?'🟡':'🔴';
      // Emoji météo
      const meteoEmoji=tempSeance===null?'':tempSeance>=28?'🔥':tempSeance>=25?'☀️':tempSeance>=15?'⛅':'🌥️';
      // FC repos dans la notif : RHR WHOOP d'aujourd'hui en priorité (jamais une valeur stale)
      const recovPart=recovScore!=null?`Récup ${recovScore}%${recovEmoji?' '+recovEmoji:''}`:recovEmoji?`Récup ${recovEmoji}`:'';
      const fcPart=fcToday?`FC ${fcToday} bpm`:'';
      // Séance run du jour (uniquement run, pas renfo)
      let seancePart='';
      if(seanceRunAujourdhui){
        const typeLabel={ef:'EF',tempo:'Tempo',seuil:'Seuil',vma:'VMA',long:'Sortie longue',ef_long:'EF Long',repos:'Repos'}[seanceRunAujourdhui.type]||seanceRunAujourdhui.type.toUpperCase();
        const km=seanceRunAujourdhui.km>0?` ${seanceRunAujourdhui.km}km`:'';
        const heure=seanceHeure?` à ${seanceHeure}`:'';
        seancePart=`Séance ${typeLabel}${km} 🏃${heure}`;
      }else{
        seancePart='Pas de séance run';
      }
      // Corps push : score global en priorité, sinon récup WHOOP seule
      let pushBody;
      if(globalScore!==null){
        pushBody=`Score ${globalScore}% ${globalEmoji}${fcPart?' · '+fcPart:''}${seancePart?' · '+seancePart:''}${meteoEmoji?' '+meteoEmoji:''}`.trim();
      }else{
        pushBody=`${recovPart}${recovPart&&(fcPart||seancePart)?' · ':''}${fcPart}${fcPart&&seancePart?' · ':''}${seancePart}${meteoEmoji?' '+meteoEmoji:''}`.trim();
      }
      if(pushBody.length>180)pushBody=pushBody.slice(0,177)+'...';

      // Stocker brief COMPLET → affichage instantané au clic notif ou à la prochaine ouverture
      await db.ref(`${ADMIN_STATE}/_brief_pending`).set({content:briefContent,date:todayStr,type:'morning_brief'});
      await db.ref(`${ADMIN_STATE}/_open_coach`).set(true);

      // Marquer fait et nettoyer le trigger AVANT d'envoyer la push.
      // Ainsi, même si la push échoue, l'IA ne sera pas rappelée en boucle.
      await db.ref(`${ADMIN_STATE}/${fcNotifKey}`).set(true);
      await db.ref(`${ADMIN_STATE}/_brief_trigger`).remove();

      // Envoyer la push (non-bloquant) — vérifier la subscription au dernier moment
      try{
        const subSnap=await db.ref(`${ADMIN_STATE}/_push_sub`).once('value');
        if(!subSnap.val()){
          console.log('briefAfterFcRepos: pas de subscription push — brief disponible dans l\'app via _brief_pending');
        }else{
          const pushSent=await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),`🏃 Brief du matin — S${cw}`,pushBody,'brief-matinal','/');
          if(!pushSent)console.log('briefAfterFcRepos: push non envoyée (subscription expirée) — brief disponible dans l\'app');
        }
      }catch(ePush){
        console.warn('briefAfterFcRepos: push échouée (erreur technique) — brief disponible dans l\'app:',ePush.message);
      }
    }catch(e){console.error('briefAfterFcRepos:',e.message);}
  }
);

exports.unvalidatedSessionReminder = onSchedule(
  {schedule:'30 20 * * *',timeZone:'Europe/Paris',secrets:[VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY]},
  async()=>{
    try{
      const db=admin.database();
      const cw=getCurrentWeek();
      const now=new Date();
      const dayOfWeek=now.getDay()===0?7:now.getDay();
      if(await getUserPref(db,ADMIN_STATE,'notif_unvalidated')){
        const state=(await db.ref(`${ADMIN_STATE}`).once('value')).val()||{};
        const manquees=[];
        for(let si=0;si<5;si++){
          const done=!!state[`s${cw}i${si}done`];if(done)continue;
          const edRaw=state[`edit_w${cw}_s${si}`];if(!edRaw)continue;
          let ed;try{ed=JSON.parse(edRaw);}catch(e){continue;}
          if(Number(ed.sched_day)!==dayOfWeek)continue;
          const titre=ed.d?ed.d.split('|')[0]:(ed.type||'').toUpperCase();
          manquees.push(`🏃 ${titre} ${ed.km||''}km`);
        }
        const _rAllNames={1:'Ischio-fessiers',2:'Bas du dos',3:'Gainage & Core',4:'Mollets & Chevilles',5:'Haut du corps'};
        const renfoNames={1:_rAllNames[parseInt(state.renfo_prog1)||1]||'Ischio-fessiers',2:_rAllNames[parseInt(state.renfo_prog2)||2]||'Bas du dos'};
        for(let ri=1;ri<=2;ri++){
          const done=!!state[`rf${cw}r${ri}done`];if(done)continue;
          const schedRaw=state[`rf${cw}r${ri}sched`];if(!schedRaw)continue;
          let sched;try{sched=JSON.parse(schedRaw);}catch(e){continue;}
          if(!sched.day||Number(sched.day)!==dayOfWeek)continue;
          manquees.push(`💪 ${renfoNames[ri]}`);
        }
        let extraI=0;
        while(extraI<=20&&state[`extra_w${cw}_s${extraI}`]){
          const done=!!state[`extra_w${cw}_s${extraI}_done`];
          if(!done){
            let es;try{es=JSON.parse(state[`extra_w${cw}_s${extraI}`]);}catch(e){extraI++;continue;}
            if(Number(es.sched_day)===dayOfWeek){
              const titre=es.d?es.d.split('|')[0]:(es.type||'').toUpperCase();
              manquees.push(`🏃 ${titre} ${es.km||''}km`);
            }
          }
          extraI++;
        }
        if(manquees.length>0){
          const body=`${manquees.join(' + ')} pas encore validé${manquees.length>1?'s':''} aujourd'hui. Tu l'as fait ? Pense à valider dans l'app ! ✅`;
          await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'⚠️ Séance non validée',body,'unvalidated-reminder','/');
        }
      }
      const subsSnap=await db.ref('_push_subscribers').once('value');
      const allSubs=subsSnap.val()||{};
      for(const [uid,sub] of Object.entries(allSubs)){
        if(uid===ADMIN_UID)continue;
        if(!await getUserPref(db,`users/${uid}/state`,'notif_unvalidated'))continue;
        const uState=(await db.ref(`users/${uid}/state`).once('value')).val()||{};
        const manquees=[];
        // Séances normales du plan
        for(let si=0;si<5;si++){
          const done=!!uState[`s${cw}i${si}done`];if(done)continue;
          const edRaw=uState[`edit_w${cw}_s${si}`];if(!edRaw)continue;
          let ed;try{ed=JSON.parse(edRaw);}catch(e){continue;}
          if(Number(ed.sched_day)!==dayOfWeek)continue;
          const titre=ed.d?ed.d.split('|')[0]:(ed.type||'').toUpperCase();
          manquees.push(`🏃 ${titre} ${ed.km||''}km`);
        }
        // Séances extra
        let extraI=0;
        while(extraI<=20&&uState[`extra_w${cw}_s${extraI}`]){
          const done=!!uState[`extra_w${cw}_s${extraI}_done`];
          if(!done){
            let es;try{es=JSON.parse(uState[`extra_w${cw}_s${extraI}`]);}catch(e){extraI++;continue;}
            if(Number(es.sched_day)===dayOfWeek){
              const titre=es.d?es.d.split('|')[0]:(es.type||'').toUpperCase();
              manquees.push(`🏃 ${titre} ${es.km||''}km`);
            }
          }
          extraI++;
        }
        if(manquees.length===0)continue;
        const body=`${manquees.join(' + ')} pas encore validé${manquees.length>1?'s':''} aujourd'hui. Tu l'as fait ? Pense à valider dans l'app ! ✅`;
        await sendPushToUser(db,uid,sub,VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'⚠️ Séance non validée',body,'unvalidated-reminder');
      }
    }catch(e){console.error('unvalidatedSessionReminder:',e.message);}
  }
);

exports.weekCompleteCongrats = onSchedule(
  {schedule:'*/15 7-22 * * *',timeZone:'Europe/Paris',secrets:[VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY,ANTHROPIC_API_KEY]},
  async()=>{
    try{
      const db=admin.database();
      const cw=getCurrentWeek();
      const now=Date.now();
      if(await getUserPref(db,ADMIN_STATE,'notif_congrats')){
        const state=(await db.ref(`${ADMIN_STATE}`).once('value')).val()||{};
        const congratsKey=`_congrats_sent_w${cw}`;
        if(!state[congratsKey]){
          let totalRun=0, doneRun=0;
          for(let si=0;si<5;si++){
            const edRaw=state[`edit_w${cw}_s${si}`];
            const deleted=!!state[`del_w${cw}_s${si}`];
            if(deleted)continue;
            if(!edRaw)continue;
            let ed;try{ed=JSON.parse(edRaw);}catch(e){continue;}
            if(ed.type==='rest')continue;
            totalRun++;
            if(!!state[`s${cw}i${si}done`])doneRun++;
          }
          let ei=0;while(ei<=20&&state[`extra_w${cw}_s${ei}`]){let ed2;try{ed2=JSON.parse(state[`extra_w${cw}_s${ei}`]);}catch(e){ei++;continue;}if(ed2&&ed2.type!=='rest'){totalRun++;if(!!state[`extra_w${cw}_s${ei}_done`])doneRun++;}ei++;}
          const renfo1Done=!!state[`rf${cw}r1done`];
          const renfo2Done=!!state[`rf${cw}r2done`];
          const lastValid=state[`_last_validation_w${cw}`]||0;
          const ageMin=(now-lastValid)/1000/60;
          if(totalRun>0&&doneRun>=totalRun&&renfo1Done&&renfo2Done&&ageMin<=20){
            const ctx=await buildNotifContext(state,cw);
            const perfsDetail=[];
            for(let si=0;si<5;si++){
              const perfRaw=state[`s${cw}i${si}perf`];if(!perfRaw)continue;
              const edRaw=state[`edit_w${cw}_s${si}`];if(!edRaw)continue;
              let perf,ed;try{perf=JSON.parse(perfRaw);ed=JSON.parse(edRaw);}catch(e){continue;}
              const titre=ed.d?ed.d.split('|')[0]:(ed.type||'').toUpperCase();
              const km=state[`s${cw}i${si}km`]||ed.km||'';
              perfsDetail.push(`${titre} ${km}km${perf.pace?' @'+perf.pace+'/km':''}${perf.hr?' FC'+perf.hr:''}`);
            }
            const perfsStr=perfsDetail.length>0?perfsDetail.join(', '):`${doneRun} séances`;
            const prompt=`Félicitations à Guillaume pour la semaine S${cw} (${ctx.typeSem}) complète : ${perfsStr} + 2 renfos. Km : ${ctx.kmSemaine>0?ctx.kmSemaine+'km':'semaine complète'}. EF : ${ctx.efPace||'?'}. ${ctx.semainesRestantes} sem. avant le marathon.\nÉcris EXACTEMENT 2 phrases courtes de félicitations. Maximum 180 caractères au total. Termine toujours sur une phrase complète. 1 emoji max.`;
            const msg=await callAnthropic(ANTHROPIC_API_KEY.value(),'Tu es un coach running enthousiaste. Réponds en 2 phrases courtes, maximum 180 caractères, jamais de phrase coupée.',[{role:'user',content:prompt}],180,'claude-haiku-4-5-20251001');
            let body = msg || `S${cw} 100% complète ! Run + renfo : tout validé. Belle semaine Guillaume 💪`;
            const lastPunct = Math.max(body.lastIndexOf('.'), body.lastIndexOf('!'), body.lastIndexOf('?'));
            if (lastPunct > 0 && lastPunct < body.length - 1) body = body.slice(0, lastPunct + 1);
            const today = new Date().toISOString().slice(0,10);
            await db.ref(`${ADMIN_STATE}/_brief_pending`).set({content: body, date: today, type: 'week_complete'});
            await db.ref(`${ADMIN_STATE}/_open_coach`).set(true);
            await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),`🎉 Semaine S${cw} complète !`,body,'week-complete','/');
            await db.ref(`${ADMIN_STATE}/${congratsKey}`).set(true);
          }
        }
      }
      const subsSnap=await db.ref('_push_subscribers').once('value');
      const allSubs=subsSnap.val()||{};
      for(const [uid,sub] of Object.entries(allSubs)){
        if(uid===ADMIN_UID)continue;
        if(!await getUserPref(db,`users/${uid}/state`,'notif_congrats'))continue;
        const uState=(await db.ref(`users/${uid}/state`).once('value')).val()||{};
        const uCongratsKey=`_congrats_sent_w${cw}`;
        if(uState[uCongratsKey])continue;
        let totalSessions=0,doneSessions=0;
        // Séances normales du plan
        for(let si=0;si<5;si++){
          const deleted=!!uState[`del_w${cw}_s${si}`];if(deleted)continue;
          const edRaw=uState[`edit_w${cw}_s${si}`];if(!edRaw)continue;
          let ed;try{ed=JSON.parse(edRaw);}catch(e){continue;}
          if(ed.type==='rest')continue;
          totalSessions++;
          if(!!uState[`s${cw}i${si}done`])doneSessions++;
        }
        // Séances extra
        let si=0;
        while(si<=20&&uState[`extra_w${cw}_s${si}`]!==undefined&&uState[`extra_w${cw}_s${si}`]!==null){
          let es;try{es=JSON.parse(uState[`extra_w${cw}_s${si}`]);}catch(e){si++;continue;}
          if(es&&es.type!=='rest'){totalSessions++;if(!!uState[`extra_w${cw}_s${si}_done`])doneSessions++;}
          si++;
        }
        if(totalSessions===0||doneSessions<totalSessions)continue;
        const lastValid=uState[`_last_validation_w${cw}`]||0;
        const ageMin=(now-lastValid)/1000/60;
        if(ageMin>20)continue;
        const body=`S${cw} complète ! ${doneSessions} séance${doneSessions>1?'s':''} validée${doneSessions>1?'s':''}. Belle semaine, continue ! 💪`;
        await sendPushToUser(db,uid,sub,VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),`🎉 Semaine S${cw} complète !`,body,'week-complete');
        await db.ref(`users/${uid}/state/${uCongratsKey}`).set(true);
      }
    }catch(e){console.error('weekCompleteCongrats:',e.message);}
  }
);

exports.weeklyPlanifReminder = onSchedule(
  {schedule:'0 20 * * 0',timeZone:'Europe/Paris',secrets:[VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY]},
  async()=>{
    try{
      const db=admin.database();
      const cw=getCurrentWeek();
      const cwNext=Math.min(cw+1,32);
      if(await getUserPref(db,ADMIN_STATE,'notif_planif')){
        const body=`Vérifie tes horaires de séances et renfos pour la semaine ! 🏃💪`;
        await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'📅 Plan S'+cwNext,body,'planif-reminder','/');
      }
      const subsSnap=await db.ref('_push_subscribers').once('value');
      const allSubs=subsSnap.val()||{};
      for(const [uid,sub] of Object.entries(allSubs)){
        if(uid===ADMIN_UID)continue;
        if(!await getUserPref(db,`users/${uid}/state`,'notif_planif'))continue;
        const body=`Prends 2 min pour planifier tes séances de la semaine S${cwNext} à venir 🏃`;
        await sendPushToUser(db,uid,sub,VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'📅 Plan S'+cwNext,body,'planif-reminder');
      }
    }catch(e){console.error('weeklyPlanifReminder:',e.message);}
  }
);

exports.weeklyDebriefNotif = onSchedule(
  {schedule:'0 18 * * 0',timeZone:'Europe/Paris',timeoutSeconds:120,secrets:[VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY,ANTHROPIC_API_KEY]},
  async()=>{
    try{
      const db=admin.database();
      const cw=getCurrentWeek();
      const cwNext=Math.min(cw+1,32);
      if(await getUserPref(db,ADMIN_STATE,'notif_debrief_semaine')){
        const state=(await db.ref(`${ADMIN_STATE}`).once('value')).val()||{};
        const ctx=await buildNotifContext(state,cw);
        const wd=state['whoop_data']||null;

        // ── Bloc WHOOP 7 jours ──────────────────────────────────────────────────
        let whoopBlock='';
        if(wd){
          const recoveries=(wd.recoveries||[]).slice(0,7);
          const sleeps=(wd.sleeps||[]).slice(0,7);
          const lines=[];

          // Moyenne récup 7j
          const scores=recoveries.filter(r=>r.score!=null).map(r=>r.score);
          if(scores.length>0){
            const avg=Math.round(scores.reduce((a,b)=>a+b,0)/scores.length);
            const best=Math.max(...scores);const worst=Math.min(...scores);
            lines.push(`Score de récupération moyen (${scores.length}j) : ${avg}% (min ${worst}% / max ${best}%)`);
          }
          // Moyenne HRV 7j
          const hrvs=recoveries.filter(r=>r.hrv!=null).map(r=>Math.round(r.hrv));
          if(hrvs.length>0){const avgH=Math.round(hrvs.reduce((a,b)=>a+b,0)/hrvs.length);lines.push(`HRV moyen : ${avgH} ms`);}
          // Moyenne FC repos 7j
          const rhrs=recoveries.filter(r=>r.rhr!=null).map(r=>r.rhr);
          if(rhrs.length>0){const avgR=Math.round(rhrs.reduce((a,b)=>a+b,0)/rhrs.length);lines.push(`FC repos moyenne : ${avgR} bpm`);}
          // Sommeil 7j — durée et perf moyennes
          const sleepPerfs=sleeps.filter(s=>s.performance_pct!=null).map(s=>s.performance_pct);
          if(sleepPerfs.length>0){const avgP=Math.round(sleepPerfs.reduce((a,b)=>a+b,0)/sleepPerfs.length);lines.push(`Performance sommeil moyenne : ${avgP}%`);}
          // Strain total semaine
          const strains=(wd.cycles||[]).slice(0,7).filter(c=>c.strain!=null).map(c=>c.strain);
          if(strains.length>0){const total=Math.round(strains.reduce((a,b)=>a+b,0)*10)/10;lines.push(`Charge totale semaine (strain WHOOP) : ${total}`);}
          if(lines.length>0)whoopBlock='\nDonnées WHOOP sur la semaine :\n'+lines.join('\n');
        }

        // ── FC repos manuelle 7j ────────────────────────────────────────────────
        const now=new Date();
        let fcSum=0,fcCount=0,fcMin=999,fcMax=0;
        const fcJours=[];
        for(let d=0;d<7;d++){
          const dd=new Date(now.getTime()-d*86400000);
          const ds=dd.toISOString().slice(0,10);
          const v=parseFloat(state['fc_repos_'+ds]);
          if(v&&!isNaN(v)){fcSum+=v;fcCount++;if(v<fcMin)fcMin=v;if(v>fcMax)fcMax=v;fcJours.push(v);}
        }
        const fcMoyBlock=fcCount>=3?`\nFC repos manuelle sur la semaine (${fcCount}j) : moy ${Math.round(fcSum/fcCount)} bpm, min ${fcMin}, max ${fcMax}`:'';

        const system=`Tu es le coach running de Guillaume. Ta mission : rédiger un bilan de semaine complet, structuré et personnalisé. Tu t'adresses DIRECTEMENT à lui en le tutoyant ("tu", jamais "Guillaume" dans le corps du texte).

PROFIL :
- Prépare un marathon (18 octobre 2026), objectif Sub 4h. ${32-cw} semaines restantes.
- FC max 196 bpm. Zone EF : 140-148 bpm. FC repos > 55 bpm = signe de fatigue.

STRUCTURE OBLIGATOIRE — dans cet ordre exact :

1. 📊 BILAN DE LA SEMAINE S${cw}
Séances réalisées vs prévues, km totaux, ton général de la semaine (charge / décharge). 2-3 phrases directes.

2. 😴 RÉCUPÉRATION & SOMMEIL — analyse WHOOP sur la semaine
Format OBLIGATOIRE : chaque valeur sur sa propre ligne, valeur en **gras**, puis UNE phrase d'analyse globale après toutes les valeurs. Exemple :
Score récup moyen : **62%** 🟡
HRV moyen : **45 ms**
FC repos moyenne : **49 bpm**
Sommeil moyen : **78%**
[phrase d'analyse : tendance de fatigue ou bonne récup ? comparaison entre début et fin de semaine si possible, conclusion claire]

3. 📈 POINT CLÉ DE LA SEMAINE
1 seule observation importante : progression, signal de fatigue, allure EF qui évolue, point technique. 1-2 phrases.

4. 🔭 SEMAINE S${cwNext} À VENIR
Programme de la semaine prochaine en 1 phrase. Type de semaine (charge/décharge). Ce qui change ou ce sur quoi mettre le focus.

5. 💬 MOT DU COACH
1 phrase courte de conclusion motivante, personnelle, directe.

RÈGLES :
- Zéro #. Données chiffrées en **gras**. Ton de coach direct, naturel.
- Jamais de tirets en début de paragraphe.
- Jamais "Guillaume" dans le corps du texte.`;

        const userMsg=`Semaine S${cw} (${ctx.typeSem}) — ${ctx.semainesRestantes} semaines restantes avant le marathon.
Séances réalisées : ${ctx.seancesDone.length} — ${ctx.seancesDone.join(', ')||'aucune'}
Séances manquées : ${ctx.seancesRestantes.length} — ${ctx.seancesRestantes.join(', ')||'aucune'}
Km totaux : ${ctx.kmSemaine}km
Allure EF de référence : ${ctx.efPace||'non définie'}
${whoopBlock}${fcMoyBlock}
Semaine prochaine S${cwNext} (${ctx.typeSemNext}) : ${ctx.seancesNext.join(', ')||'à planifier'}
${state['_coach_memos']?'Notes coach : '+state['_coach_memos']:''}`;

        const fullDebrief=await callAnthropic(ANTHROPIC_API_KEY.value(),system,[{role:'user',content:userMsg}],900)||
          `📊 S${cw} terminée : ${ctx.seancesDone.length} séances${ctx.kmSemaine>0?', '+ctx.kmSemaine+'km':''}. S${cwNext} arrive. Ouvre l'app pour le détail 👇`;

        const today=new Date().toISOString().slice(0,10);
        await db.ref(`${ADMIN_STATE}/_brief_pending`).set({content:fullDebrief,date:today,type:'weekly_debrief'});
        await db.ref(`${ADMIN_STATE}/_open_coach`).set(true);

        // Push : résumé court
        const scores7=wd?(wd.recoveries||[]).slice(0,7).filter(r=>r.score!=null).map(r=>r.score):[];
        const avgRecov=scores7.length>0?Math.round(scores7.reduce((a,b)=>a+b,0)/scores7.length):null;
        const recovEmoji=avgRecov===null?'':avgRecov>=67?'🟢':avgRecov>=34?'🟡':'🔴';
        const pushBody=`S${cw} : ${ctx.seancesDone.length} séances, ${ctx.kmSemaine}km${avgRecov!==null?' — récup moy '+avgRecov+'% '+recovEmoji:''} — Ouvre le Coach 👇`;
        await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),`📊 Bilan S${cw}`,pushBody,'weekly-debrief','/');
      }
      const subsSnap=await db.ref('_push_subscribers').once('value');
      const allSubs=subsSnap.val()||{};
      for(const [uid,sub] of Object.entries(allSubs)){
        if(uid===ADMIN_UID)continue;
        if(!await getUserPref(db,`users/${uid}/state`,'notif_debrief_semaine'))continue;
        const uState=(await db.ref(`users/${uid}/state`).once('value')).val()||{};
        let totalSessions=0,doneSessions=0;
        // Séances normales du plan
        for(let si=0;si<5;si++){
          const deleted=!!uState[`del_w${cw}_s${si}`];if(deleted)continue;
          const edRaw=uState[`edit_w${cw}_s${si}`];if(!edRaw)continue;
          let ed;try{ed=JSON.parse(edRaw);}catch(e){continue;}
          if(ed.type==='rest')continue;
          totalSessions++;
          if(!!uState[`s${cw}i${si}done`])doneSessions++;
        }
        // Séances extra
        let si=0;
        while(si<=20&&uState[`extra_w${cw}_s${si}`]!==undefined&&uState[`extra_w${cw}_s${si}`]!==null){
          let es;try{es=JSON.parse(uState[`extra_w${cw}_s${si}`]);}catch(e){si++;continue;}
          if(es&&es.type!=='rest'){totalSessions++;if(!!uState[`extra_w${cw}_s${si}_done`])doneSessions++;}
          si++;
        }
        const body=totalSessions>0?
          `S${cw} : ${doneSessions}/${totalSessions} séance${totalSessions>1?'s':''} validée${doneSessions>1?'s':''}. S${cwNext} arrive, prépare-toi ! 🏃`:
          `S${cw} terminée ! Ouvre l'app pour voir le programme S${cwNext} 👇`;
        await sendPushToUser(db,uid,sub,VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),`📊 Bilan S${cw}`,body,'weekly-debrief');
      }
    }catch(e){console.error('weeklyDebriefNotif:',e.message);}
  }
);

// Rappel shaker post-run — vérifie toutes les 5 min si le délai de 30 min est écoulé
exports.shakerAfterRun = onSchedule(
  {schedule:'*/5 6-23 * * *',timeZone:'Europe/Paris',secrets:[VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY]},
  async()=>{
    try{
      const db=admin.database();
      const snap=await db.ref(`${ADMIN_STATE}/_shaker_run_ts`).once('value');
      const ts=snap.val();
      if(!ts) return;
      const now=Date.now();
      if(now<ts) return; // pas encore 30 min
      if(now-ts>90*60*1000){ await db.ref(`${ADMIN_STATE}/_shaker_run_ts`).remove(); return; } // expiré
      await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),
        '🥤 Rappel protéines !',
        'Belle séance ! N\'oublie pas ton shaker de récupération 💪',
        'shaker-post-run','/');
      await db.ref(`${ADMIN_STATE}/_shaker_run_ts`).remove();
    }catch(e){console.error('shakerAfterRun:',e.message);}
  }
);

// Rappel shaker à 14h si aucun run n'est planifié aujourd'hui dans le plan admin
exports.shakerNoon = onSchedule(
  {schedule:'0 14 * * *',timeZone:'Europe/Paris',secrets:[VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY]},
  async()=>{
    try{
      const db=admin.database();
      const cw=getCurrentWeek();
      // Jour de la semaine Paris : 1=lundi … 7=dimanche (même convention que sched_day)
      const _parisDate=new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/Paris'}));
      const todayDay=_parisDate.getDay()===0?7:_parisDate.getDay();
      // Lire le plan de la semaine courante
      const stateSnap=await db.ref(ADMIN_STATE).once('value');
      const st=stateSnap.val()||{};
      let runPlanifieAujourdhui=false;
      for(let si=0;si<5;si++){
        const edRaw=st[`edit_w${cw}_s${si}`];
        if(!edRaw||st[`del_w${cw}_s${si}`]) continue;
        try{
          const ed=JSON.parse(edRaw);
          if(ed.type==='rest') continue;
          if(Number(ed.sched_day)===todayDay){runPlanifieAujourdhui=true;break;}
        }catch(e){}
      }
      if(runPlanifieAujourdhui) return; // run prévu au planning → pas de notif shaker
      await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),
        '🥤 Pense à ton shaker !',
        'Pas de séance aujourd\'hui ? Prends quand même tes protéines du midi 💪',
        'shaker-noon','/');
    }catch(e){console.error('shakerNoon:',e.message);}
  }
);

// Purge mensuelle des subscriptions push inactives (> 90 jours sans re-subscribe)
exports.cleanupPushSubscribers = onSchedule(
  { schedule: '0 3 1 * *', timeZone: 'Europe/Paris' },
  async () => {
    try {
      const admin = require('firebase-admin');
      if (!admin.apps.length) admin.initializeApp();
      const db = admin.database();
      const snap = await db.ref('_push_subscribers').once('value');
      const subs = snap.val() || {};
      const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
      let purged = 0;
      for (const [uid, sub] of Object.entries(subs)) {
        const subscribedAt = sub && sub.subscribedAt ? sub.subscribedAt : null;
        if (subscribedAt !== null && subscribedAt < cutoff) {
          await db.ref(`_push_subscribers/${uid}`).remove().catch(() => {});
          await db.ref(`users/${uid}/state/_push_sub`).remove().catch(() => {});
          purged++;
        }
      }
      console.log(`cleanupPushSubscribers : ${purged} subscription(s) purgée(s) sur ${Object.keys(subs).length}`);
    } catch (e) {
      console.error('cleanupPushSubscribers:', e.message);
    }
  }
);
