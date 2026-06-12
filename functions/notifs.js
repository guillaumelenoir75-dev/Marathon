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
  async()=>{try{const db=admin.database();const today=new Date().toISOString().slice(0,10);if(await getUserPref(db,ADMIN_STATE,'notif_fc_repos')){const snap=await db.ref(`${ADMIN_STATE}/fc_repos_${today}`).once('value');if(!snap.val())await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'Rappel ☀️','Rentre ta FC repos avant de te lever ❤️','fc-repos','/');}await sendPushToAll(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'Rappel ☀️','Rentre ta FC repos avant de te lever ❤️','fc-repos','/',ADMIN_UID,'notif_fc_repos');}catch(e){console.error('fcReposReminderWeekday:',e.message);}}
);

exports.fcReposReminderWeekend = onSchedule(
  {schedule:'30 9 * * 0,6',timeZone:'Europe/Paris',secrets:[VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY]},
  async()=>{try{const db=admin.database();const today=new Date().toISOString().slice(0,10);if(await getUserPref(db,ADMIN_STATE,'notif_fc_repos')){const snap=await db.ref(`${ADMIN_STATE}/fc_repos_${today}`).once('value');if(!snap.val())await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'Rappel ☀️','Rentre ta FC repos avant de te lever ❤️','fc-repos','/');}await sendPushToAll(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'Rappel ☀️','Rentre ta FC repos avant de te lever ❤️','fc-repos','/',ADMIN_UID,'notif_fc_repos');}catch(e){console.error('fcReposReminderWeekend:',e.message);}}
);

exports.fcReposReminder14hWeekday = onSchedule(
  {schedule:'0 14 * * 1-5',timeZone:'Europe/Paris',secrets:[VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY]},
  async()=>{try{const db=admin.database();const today=new Date().toISOString().slice(0,10);if(await getUserPref(db,ADMIN_STATE,'notif_fc_repos')){const snap=await db.ref(`${ADMIN_STATE}/fc_repos_${today}`).once('value');if(!snap.val())await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'Rappel',"Tu n'as pas encore rentré ta FC repos aujourd'hui ❤️",'fc-repos-14h','/');}await sendPushToAll(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'Rappel',"N'oublie pas de rentrer ta FC repos aujourd'hui ❤️",'fc-repos-14h','/',ADMIN_UID,'notif_fc_repos');}catch(e){console.error('fcReposReminder14hWeekday:',e.message);}}
);

exports.fcReposReminder14hWeekend = onSchedule(
  {schedule:'0 14 * * 0,6',timeZone:'Europe/Paris',secrets:[VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY]},
  async()=>{try{const db=admin.database();const today=new Date().toISOString().slice(0,10);if(await getUserPref(db,ADMIN_STATE,'notif_fc_repos')){const snap=await db.ref(`${ADMIN_STATE}/fc_repos_${today}`).once('value');if(!snap.val())await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'Rappel',"Tu n'as pas encore rentré ta FC repos aujourd'hui ❤️",'fc-repos-14h','/');}await sendPushToAll(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),'Rappel',"N'oublie pas de rentrer ta FC repos aujourd'hui ❤️",'fc-repos-14h','/',ADMIN_UID,'notif_fc_repos');}catch(e){console.error('fcReposReminder14hWeekend:',e.message);}}
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
          if(ed.sched_day!==dayOfWeek||!ed.sched_time)continue;
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
              const locFresh = loc && loc.lat && (Date.now()-loc.ts)<30*24*3600*1000;
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
        while(state[`extra_w${cw}_s${extraRi}`]){
          const done=!!state[`extra_w${cw}_s${extraRi}_done`];
          if(!done){
            let es;try{es=JSON.parse(state[`extra_w${cw}_s${extraRi}`]);}catch(e){extraRi++;continue;}
            if(es.sched_day===dayOfWeek&&es.sched_time){
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
          if(ed.sched_day!==dayOfWeek||!ed.sched_time)continue;
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
        while(uState[`extra_w${ucw}_s${extraRi}`]){
          const done=!!uState[`extra_w${ucw}_s${extraRi}_done`];
          if(!done){
            let es;try{es=JSON.parse(uState[`extra_w${ucw}_s${extraRi}`]);}catch(e){extraRi++;continue;}
            if(es.sched_day===dayOfWeek&&es.sched_time){
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
  {schedule:'*/2 6-22 * * *',timeZone:'Europe/Paris',secrets:[VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY,ANTHROPIC_API_KEY]},
  async()=>{
    try{
      const db=admin.database();
      if(!await getUserPref(db,ADMIN_STATE,'notif_brief_matin'))return;
      const state=(await db.ref(`${ADMIN_STATE}`).once('value')).val()||{};
      const trigger=state['_brief_trigger'];
      if(!trigger||!trigger.ts)return;
      const now=Date.now();
      const age=(now-trigger.ts)/1000/60;
      if(age<2||age>30){
        if(age>30) await db.ref(`${ADMIN_STATE}/_brief_trigger`).remove();
        return;
      }
      const todayStr=trigger.date||new Date().toISOString().slice(0,10);
      const briefKey='_brief_matin_'+todayStr;
      const briefSnap=await db.ref(`${ADMIN_STATE}/`+briefKey).once('value');
      if(briefSnap.val()){
        await db.ref(`${ADMIN_STATE}/_brief_trigger`).remove();
        return;
      }
      let triggerClaimed = false;
      await db.ref(`${ADMIN_STATE}/_brief_trigger`).transaction(current => {
        if (!current) { triggerClaimed = false; return; }
        triggerClaimed = true;
        return null;
      });
      if (!triggerClaimed) return;
      const cw=getCurrentWeek();
      const ctx=await buildNotifContext(state,cw);
      const fcToday=state['fc_repos_'+todayStr]||null;

      const seanceRunMsg=ctx.seancesAujourdHui.length>0?`Run : ${ctx.seancesAujourdHui.join(' + ')}.`:'';

      const jours2=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
      const dow=new Date().getDay();
      const dayOfWeekNum=dow===0?7:dow;
      const _rAllN={1:'Ischio-fessiers',2:'Bas du dos',3:'Gainage & Core',4:'Mollets & Chevilles',5:'Haut du corps'};
      const renfoNoms={1:_rAllN[parseInt(state.renfo_prog1)||1]||'Ischio-fessiers',2:_rAllN[parseInt(state.renfo_prog2)||2]||'Bas du dos'};
      const renfoAujourdHui=[];
      for(let ri=1;ri<=2;ri++){
        const done=!!state[`rf${cw}r${ri}done`];
        if(done)continue;
        const schedRaw=state[`rf${cw}r${ri}sched`];
        if(!schedRaw)continue;
        let sched;try{sched=JSON.parse(schedRaw);}catch(e){continue;}
        if(sched.day===dayOfWeekNum) renfoAujourdHui.push(`${renfoNoms[ri]}${sched.time?' à '+sched.time:''}`);
      }
      const renfoMsg=renfoAujourdHui.length>0?`Renfo : ${renfoAujourdHui.join(' + ')}.`:'';

      const bodyhitMsg=dow===1?'Bodyhit à 12h30.':'';

      const programmeItems=[seanceRunMsg,renfoMsg,bodyhitMsg].filter(Boolean);
      const programmeMsg=programmeItems.length>0?programmeItems.join(' '):'Journée de récupération ce '+(jours2[dow]||"aujourd'hui")+'.';

      let meteoMsg = '';
      try {
        const locSnap = await db.ref(`${ADMIN_STATE}/_last_location`).once('value');
        const loc = locSnap.val();
        const lat = (loc && loc.lat && (Date.now()-loc.ts)<30*24*3600*1000) ? loc.lat : 48.8417;
        const lng = (loc && loc.lng && (Date.now()-loc.ts)<30*24*3600*1000) ? loc.lng : 2.2945;
        let seanceH = new Date().getHours() + 1;
        if(ctx.seancesAujourdHui.length > 0) {
          const match = ctx.seancesAujourdHui[0].match(/(\d{1,2})h|(\d{1,2}):(\d{2})/);
          if(match) seanceH = parseInt(match[1] || match[2]);
        }
        seanceH = Math.min(23, Math.max(0, seanceH));
        const meteoResp = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,apparent_temperature,weather_code&timezone=Europe%2FParis&forecast_days=1`);
        const meteoData = await meteoResp.json();
        if(meteoData.hourly) {
          const temp     = meteoData.hourly.temperature_2m?.[seanceH];
          const apparent = meteoData.hourly.apparent_temperature?.[seanceH];
          const wcode    = meteoData.hourly.weather_code?.[seanceH];
          const wmoEmoji = wcode===0?'☀️':wcode<=2?'⛅':wcode<=3?'☁️':wcode<=48?'🌫️':wcode<=67?'🌧️':wcode<=77?'🌨️':wcode<=82?'🌦️':wcode<=99?'⛈️':'🌤️';
          const t = Math.round(temp ?? 0);
          const r = Math.round(apparent ?? t);
          const diff = r - t;
          meteoMsg = `Météo à ${seanceH}h : ${wmoEmoji} ${t}°C${diff >= 2 ? ' (ressenti '+r+'°C)' : ''}.`;
        }
      } catch(e) {}

      const fcMsg=fcToday?`FC repos : ${fcToday} bpm.`:'';
      const activitesMsg=[fcMsg,programmeMsg,meteoMsg].filter(Boolean).join(' ');
      const prompt=`Une seule phrase courte et COMPLÈTE (max 100 caractères) pour Guillaume : ${activitesMsg}. Pas de virgule finale. Pas de tirets.`;

      let brief = null;
      try {
        brief = await callAnthropic(ANTHROPIC_API_KEY.value(),'Coach running. 1 phrase courte complète, jamais coupée, max 100 caractères.',[{role:'user',content:prompt}],60,'claude-haiku-4-5-20251001');
      } catch(aiErr) { console.error('briefAfterFcRepos AI error:',aiErr.message); }

      let body = (brief || activitesMsg).trim();
      if(body.length > 180) body = body.slice(0, 177) + '...';
      if(!body.endsWith('.') && !body.endsWith('!') && !body.endsWith('?')) body += '.';

      await db.ref(`${ADMIN_STATE}/_brief_pending`).set({
        content: body,
        date: todayStr,
        type: 'morning_brief',
        needs_full_brief: true
      });
      await db.ref(`${ADMIN_STATE}/`+briefKey).set('push_sent');
      await db.ref(`${ADMIN_STATE}/_open_coach`).set(true);
      await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),`🏃 Brief du matin — S${cw}`,body,'brief-matinal','/');
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
          if(ed.sched_day!==dayOfWeek)continue;
          const titre=ed.d?ed.d.split('|')[0]:(ed.type||'').toUpperCase();
          manquees.push(`🏃 ${titre} ${ed.km||''}km`);
        }
        const _rAllNames={1:'Ischio-fessiers',2:'Bas du dos',3:'Gainage & Core',4:'Mollets & Chevilles',5:'Haut du corps'};
        const renfoNames={1:_rAllNames[parseInt(state.renfo_prog1)||1]||'Ischio-fessiers',2:_rAllNames[parseInt(state.renfo_prog2)||2]||'Bas du dos'};
        for(let ri=1;ri<=2;ri++){
          const done=!!state[`rf${cw}r${ri}done`];if(done)continue;
          const schedRaw=state[`rf${cw}r${ri}sched`];if(!schedRaw)continue;
          let sched;try{sched=JSON.parse(schedRaw);}catch(e){continue;}
          if(!sched.day||sched.day!==dayOfWeek)continue;
          manquees.push(`💪 ${renfoNames[ri]}`);
        }
        let extraI=0;
        while(state[`extra_w${cw}_s${extraI}`]){
          const done=!!state[`extra_w${cw}_s${extraI}_done`];
          if(!done){
            let es;try{es=JSON.parse(state[`extra_w${cw}_s${extraI}`]);}catch(e){extraI++;continue;}
            if(es.sched_day===dayOfWeek){
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
        let extraI=0;
        while(uState[`extra_w${cw}_s${extraI}`]){
          const done=!!uState[`extra_w${cw}_s${extraI}_done`];
          if(!done){
            let es;try{es=JSON.parse(uState[`extra_w${cw}_s${extraI}`]);}catch(e){extraI++;continue;}
            if(es.sched_day===dayOfWeek){
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
          const renfo1Done=!!state[`rf${cw}r1done`];
          const renfo2Done=!!state[`rf${cw}r2done`];
          const lastValid=state[`_last_validation_w${cw}`]||0;
          const ageMin=(now-lastValid)/1000/60;
          if(totalRun>0&&doneRun>=totalRun&&renfo1Done&&renfo2Done&&ageMin<=20){
            const ctx=await buildNotifContext(state,cw);
            const perfsDetail=[];
            for(let si=0;si<5;si++){
              const perfRaw=state[`w${cw}_s${si}perf`];if(!perfRaw)continue;
              const edRaw=state[`edit_w${cw}_s${si}`];if(!edRaw)continue;
              let perf,ed;try{perf=JSON.parse(perfRaw);ed=JSON.parse(edRaw);}catch(e){continue;}
              const titre=ed.d?ed.d.split('|')[0]:(ed.type||'').toUpperCase();
              const km=state[`w${cw}_s${si}km`]||ed.km||'';
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
        let si=0;
        while(uState[`extra_w${cw}_s${si}`]!==undefined&&uState[`extra_w${cw}_s${si}`]!==null){
          let es;try{es=JSON.parse(uState[`extra_w${cw}_s${si}`]);}catch(e){si++;continue;}
          if(es&&es.type!=='rest'){totalSessions++;if(!!uState[`extra_w${cw}_s${si}_done`])doneSessions++;}
          si++;
          if(si>20)break;
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
  {schedule:'0 18 * * 0',timeZone:'Europe/Paris',secrets:[VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY,ANTHROPIC_API_KEY]},
  async()=>{
    try{
      const db=admin.database();
      const cw=getCurrentWeek();
      const cwNext=Math.min(cw+1,32);
      if(await getUserPref(db,ADMIN_STATE,'notif_debrief_semaine')){
        const state=(await db.ref(`${ADMIN_STATE}`).once('value')).val()||{};
        const ctx=await buildNotifContext(state,cw);
        const prompt=`Tu es le coach running de Guillaume. Débrief fin de semaine en 3 phrases max pour notification iPhone.\nBilan S${cw} (${ctx.typeSem}) : ${ctx.seancesDone.length} séances${ctx.kmSemaine>0?' — '+ctx.kmSemaine+'km':''}. ${ctx.seancesRestantes.length>0?'Manquées : '+ctx.seancesRestantes.join(', ')+'.':'Toutes faites 🎉'} EF : ${ctx.efPace||'?'}.\nS${ctx.cwNext} (${ctx.typeSemNext}) : ${ctx.seancesNext.join(', ')||'à planifier'}.\nPhrase 1 = bilan 📊, phrase 2 = point clé 📈 ou ⚠️, phrase 3 = aperçu S${ctx.cwNext} + "Ouvre le Coach pour le détail 👇"`;
        const debrief=await callAnthropic(ANTHROPIC_API_KEY.value(),'Tu es un coach running concis et motivant.',[{role:'user',content:prompt}],200,'claude-haiku-4-5-20251001');
        const body=debrief||`📊 S${cw} terminée : ${ctx.seancesDone.length} séances${ctx.kmSemaine>0?', '+ctx.kmSemaine+'km':''}. S${ctx.cwNext} arrive. Ouvre l'app pour le détail 👇`;
        const today=new Date().toISOString().slice(0,10);
        await db.ref(`${ADMIN_STATE}/_brief_pending`).set({content:body,date:today,type:'weekly_debrief'});
        await db.ref(`${ADMIN_STATE}/_open_coach`).set(true);
        await sendPush(VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),`📊 Bilan S${cw}`,body,'weekly-debrief','/');
      }
      const subsSnap=await db.ref('_push_subscribers').once('value');
      const allSubs=subsSnap.val()||{};
      for(const [uid,sub] of Object.entries(allSubs)){
        if(uid===ADMIN_UID)continue;
        if(!await getUserPref(db,`users/${uid}/state`,'notif_debrief_semaine'))continue;
        const uState=(await db.ref(`users/${uid}/state`).once('value')).val()||{};
        let totalSessions=0,doneSessions=0;
        let si=0;
        while(uState[`extra_w${cw}_s${si}`]!==undefined&&uState[`extra_w${cw}_s${si}`]!==null){
          let es;try{es=JSON.parse(uState[`extra_w${cw}_s${si}`]);}catch(e){si++;continue;}
          if(es&&es.type!=='rest'){totalSessions++;if(!!uState[`extra_w${cw}_s${si}_done`])doneSessions++;}
          si++;
          if(si>20)break;
        }
        const body=totalSessions>0?
          `S${cw} : ${doneSessions}/${totalSessions} séance${totalSessions>1?'s':''} validée${doneSessions>1?'s':''}. S${cwNext} arrive, prépare-toi ! 🏃`:
          `S${cw} terminée ! Ouvre l'app pour voir le programme S${cwNext} 👇`;
        await sendPushToUser(db,uid,sub,VAPID_PUBLIC_KEY.value(),VAPID_PRIVATE_KEY.value(),`📊 Bilan S${cw}`,body,'weekly-debrief');
      }
    }catch(e){console.error('weeklyDebriefNotif:',e.message);}
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
        const subscribedAt = sub && sub.subscribedAt ? sub.subscribedAt : 0;
        if (subscribedAt < cutoff) {
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
