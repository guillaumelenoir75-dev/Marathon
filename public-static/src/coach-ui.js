function buildCoachChartData(type) {
  const points = [];
  for(let ws=Math.max(1,CW-11); ws<=CW; ws++) {
    weeks[ws-1].sessions.forEach((sess,si) => {
      if(!state[gk(ws,si)+'done']) return;
      let perf=null;try{perf=state[gk(ws,si)+'perf']?JSON.parse(state[gk(ws,si)+'perf']):null;}catch(e){}
      if(!perf) return;
      if(type==='ef' && (sess.type==='ef'||sess.type==='long') && perf.pace) {
        const sec=paceStrToSec(perf.pace.replace("'",":"));
        if(sec>200&&sec<600) points.push({ws,val:sec,label:'S'+ws});
      } else if(type==='km') {
        const km=state[gk(ws,si)+'km']||sess.km;
        if(km>0) points.push({ws,val:parseFloat(km),label:'S'+ws});
      } else if(type==='fc' && perf.hr && (sess.type==='ef'||sess.type==='long')) {
        points.push({ws,val:parseInt(perf.hr),label:'S'+ws});
      }
    });
  }
  const byWeek={};
  points.forEach(p=>{ if(!byWeek[p.ws]) byWeek[p.ws]={sum:0,count:0}; byWeek[p.ws].sum+=p.val; byWeek[p.ws].count++; });
  return Object.keys(byWeek).sort((a,b)=>+a-+b).map(ws=>({val:byWeek[ws].sum/byWeek[ws].count,label:'S'+ws})).slice(-10);
}

function renderCoachChartSVG(data, type) {
  if(!data||data.length<2) return '';
  const W=320,H=88,PT=8,PB=22,PL=30,PR=8;
  const iW=W-PL-PR, iH=H-PT-PB;
  const vals=data.map(d=>d.val);
  let mn=Math.min(...vals), mx=Math.max(...vals);
  const rng=(mx-mn)||1; mn-=rng*0.12; mx+=rng*0.12;
  const R=mx-mn;
  const px=i=>PL+(i/(data.length-1))*iW;
  const py=v=>PT+iH-((v-mn)/R)*iH;
  const color=type==='ef'?'#1B4FD8':type==='fc'?'#E8530A':'#3B6D11';
  let path='',area='';
  data.forEach((d,i)=>{
    const x=px(i),y=py(d.val);
    if(i===0){path='M'+x+','+y;area='M'+x+','+(PT+iH)+' L'+x+','+y;}
    else{
      const ox=px(i-1),oy=py(data[i-1].val),cp=iW/(data.length-1)*0.45;
      path+=' C'+(ox+cp)+','+oy+' '+(x-cp)+','+y+' '+x+','+y;
      area+=' C'+(ox+cp)+','+oy+' '+(x-cp)+','+y+' '+x+','+y;
    }
  });
  area+=' L'+px(data.length-1)+','+(PT+iH)+' Z';
  const grid=[0,0.5,1].map(t=>{
    const v=mn+R*t,yp=py(v);
    const lbl=type==='ef'?secToPace(Math.round(v)):Math.round(v)+'';
    return '<line x1="'+PL+'" y1="'+yp+'" x2="'+(W-PR)+'" y2="'+yp+'" stroke="#e8e8e8" stroke-width="0.8"/>'+
      '<text x="'+(PL-3)+'" y="'+(yp+3)+'" text-anchor="end" font-size="8" fill="#bbb">'+lbl+'</text>';
  }).join('');
  const dots=data.map((d,i)=>{
    const isL=i===data.length-1;
    return '<circle cx="'+px(i)+'" cy="'+py(d.val)+'" r="'+(isL?4:2.5)+'" fill="'+(isL?color:'#fff')+'" stroke="'+color+'" stroke-width="'+(isL?0:1.5)+'"/>';
  }).join('');
  const xlbls=[0,Math.floor(data.length/2),data.length-1].filter((v,i,a)=>a.indexOf(v)===i).map(i=>
    '<text x="'+px(i)+'" y="'+(H-5)+'" text-anchor="middle" font-size="9" fill="#aaa">'+data[i].label+'</text>'
  ).join('');
  const fmt=v=>type==='ef'?secToPace(Math.round(v)):Math.round(v)+(type==='fc'?' bpm':' km');
  const better=type==='ef'?(data[data.length-1].val<data[0].val):(data[data.length-1].val>data[0].val);
  const trend=(better?'\u2197':'\u2198')+' '+fmt(data[0].val)+' \u2192 '+fmt(data[data.length-1].val);
  const tc=better?'#22c55e':'#ef4444';
  return '<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;">'
    +'<defs><linearGradient id="cg'+type+'" x1="0" y1="0" x2="0" y2="1">'
    +'<stop offset="0%" stop-color="'+color+'" stop-opacity="0.18"/>'
    +'<stop offset="100%" stop-color="'+color+'" stop-opacity="0.02"/></linearGradient></defs>'
    +grid+'<path d="'+area+'" fill="url(#cg'+type+')"/>'
    +'<path d="'+path+'" fill="none" stroke="'+color+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
    +dots+xlbls+'</svg>'
    +'<div style="font-size:10px;display:flex;justify-content:space-between;margin-top:3px;">'
    +'<span style="color:'+tc+';font-weight:600;">'+trend+'</span>'
    +'<span style="color:#bbb;">'+data.length+' s\u00e9ances</span></div>';
}

function buildCoachChart(type, title) {
  const data = buildCoachChartData(type);
  if(data.length < 1) return ''; // Aucune donnée
  if(data.length < 2) {
    return '<div class="coach-chart-wrap"><div class="coach-chart-title">📊 '+title+'</div>'
      +'<p style="font-size:12px;color:var(--muted);padding:8px 0;">Pas encore assez de séances enregistrées pour tracer ce graphe.</p></div>';
  }
  return '<div class="coach-chart-wrap"><div class="coach-chart-title">📊 '+title+'</div>'+renderCoachChartSVG(data,type)+'</div>';
}

function detectChartNeeds(msg) {
  const m = msg.toLowerCase();
  const charts = [];

  // Détecter FC/fréquence cardiaque EN PREMIER (priorité haute)
  const wantsFC = /\bfc\b|fr[eé]quence|cardio|\bbpm\b|cardiaque|fq\b|coeur|rythme/i.test(m);
  // Détecter KM/volume
  const wantsKM = /\bkm\b|kilom[eè]|volume|charge|total km|distance/i.test(m);
  // Détecter allure EF — seulement si pas de FC demandée explicitement
  const wantsEF = !wantsFC && /\bef\b|endurance|allure ef|allure|vite|progression|sub.?4/i.test(m);

  if(wantsFC) charts.push({type:'fc', title:'FC moyenne EF — évolution'});
  if(wantsKM) charts.push({type:'km', title:'Volume par séance'});
  if(wantsEF) charts.push({type:'ef', title:'Allure EF — évolution'});

  // Fallback si rien détecté → allure EF par défaut
  if(charts.length === 0) charts.push({type:'ef', title:'Allure EF — évolution'});

  return charts.slice(0, 2);
}

let _lastShortcutTime = 0;
function sendShortcut(text){
  const now = Date.now();
  if(now - _lastShortcutTime < 500) return; // anti-double-tap
  _lastShortcutTime = now;
  const input = document.getElementById('coach-input');
  if(!input) return;
  input.value = text;
  sendCoachMessage();
}

function sendNextRun(){
  const now = Date.now();
  if(now - _lastShortcutTime < 500) return;
  _lastShortcutTime = now;

  const jours = ['','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  const dowToSched = [7,1,2,3,4,5,6];
  const todaySched = dowToSched[new Date().getDay()];
  let nextSession = null;

  for(let ws = CW; ws <= Math.min(CW+1, 32); ws++){
    weeks[ws-1].sessions.forEach((sess, si) => {
      if(nextSession) return;
      if(sess.type === 'rest') return;
      if(state['del_w'+ws+'_s'+si]) return;
      if(state[gk(ws,si)+'done']) return;
      const edRaw = state['edit_w'+ws+'_s'+si];
      let ed=null;try{ed=edRaw?JSON.parse(edRaw):null;}catch(e){}
      const schedDay = ed ? ed.sched_day : null;
      if(ws === CW && schedDay && schedDay < todaySched) return;
      nextSession = {
        ws, si,
        type: ed ? ed.type : sess.type,
        titre: ed ? ed.d.split('|')[0] : sess.d.split('|')[0],
        detail: ed ? (ed.d.split('|')[1]||'') : (sess.d.split('|')[1]||''),
        km: ed ? ed.km : sess.km,
        jour: schedDay ? jours[schedDay] : null,
        heure: ed && ed.sched_time ? ed.sched_time : null,
        semaine: ws
      };
    });
    if(nextSession) break;
  }

  // Le message est simple — sendCoachMessage() ajoutera automatiquement tout le stateContext
  // (allure EF réelle, consignes, planning, mémos, etc.)
  let msg;
  if(nextSession){
    const quand = nextSession.jour ? nextSession.jour + (nextSession.heure ? ' à ' + nextSession.heure : '') : 'prochainement';
    msg = '🏃 Next Run — conseils pour ma prochaine séance : ' + nextSession.titre + ' ' + nextSession.km + 'km · ' + quand + ' (S' + nextSession.semaine + ')';
  } else {
    msg = '🏃 Next Run — conseils pour ma prochaine séance';
  }

  const input = document.getElementById('coach-input');
  if(!input) return;
  input.value = msg;
  sendCoachMessage();
}

async function sendCoachMeteo() {
  const chip = document.getElementById('coach-meteo-chip');
  function resetChip() {
    if (chip) { chip.textContent = '🌤️ Météo'; chip.style.opacity = '1'; chip.disabled = false; }
  }
  if (chip) { chip.textContent = '📍…'; chip.style.opacity = '0.6'; chip.disabled = true; }

  try {
    const pos = await _getPosition();
    if (!pos) {
      resetChip();
      const inp = document.getElementById('coach-input');
      if (inp) { inp.value = '🌤️ Météo — géolocalisation non disponible. Donne-moi des conseils généraux pour courir par temps chaud.'; sendCoachMessage(); }
      return;
    }
    if (chip) chip.textContent = '🌡️…';

    const { lat, lng } = pos;
    const [city, meteo] = await Promise.all([
      _getCityFromCoords(lat, lng),
      fetchWeatherForContext(null, null)
    ]);
    resetChip();

    let msg;
    if (meteo) {
      meteo.ville = city;
      window._lastCoachMeteo = meteo;
      const elevFC = meteo.impact_performance?.elevation_fc_bpm || 0;
      const niveau = meteo.impact_performance?.niveau || 'IDEAL';
      const niveauLabels = { IDEAL:'idéales', MODERE:'chaudes (chaleur modérée)', ELEVE:'très chaudes', EXTREME:'extrêmes — effort à limiter', HUMIDE:'humides', FROID:'froides' };
      msg = '🌤️ Météo actuelle à ' + city + ' : ' + meteo.temperature + '°C (ressenti ' + meteo.ressenti + '°C), '
          + meteo.humidite + '% humidité, ' + meteo.conditions + '. '
          + 'Conditions ' + (niveauLabels[niveau] || niveau) + '. '
          + (elevFC > 0 ? 'Ma FC sera naturellement +' + elevFC + ' bpm plus haute. ' : '')
          + 'Que me conseilles-tu pour courir dans ces conditions ?';
    } else {
      msg = "🌤️ Météo à " + city + " : données météo indisponibles. Donne-moi des conseils pour courir aujourd'hui.";
    }

    const inp = document.getElementById('coach-input');
    if (!inp) return;
    inp.value = msg;
    sendCoachMessage();
  } catch(e) {
    console.error('sendCoachMeteo error:', e);
    resetChip();
  }
}

function isAtBottom(el){ return el.scrollHeight - el.scrollTop - el.clientHeight < 80; }
function smartScroll(el){ if(isAtBottom(el)) el.scrollTo({top:el.scrollHeight,behavior:"smooth"}); }

async function sendCoachMessage(retryMsg){
  const input = document.getElementById('coach-input');
  const msg = retryMsg || (input ? input.value.trim() : '');
  if(!msg) return;
  if(input){ input.value = ''; input.style.height='auto'; }
  if(input) setTimeout(()=>input.focus(),100);
  addCoachMessage('user', msg);
  coachHistory.push({role:'user', content: msg, date: new Date().toISOString().slice(0,10)});
  _lastUserMessageBeforeProposal = msg; // stocker pour extraction
  const container = document.getElementById('coach-messages');
  const loader = document.createElement('div');
  loader.id = 'coach-loader';
  loader.style.cssText = 'display:flex;align-items:center;gap:8px;';
  // Fix 7: désactiver bouton envoi pendant génération
  const sendBtn = document.getElementById('coach-send-btn');
  if(sendBtn){ sendBtn.disabled=true; sendBtn.style.opacity='0.35'; sendBtn.style.cursor='not-allowed'; }
  // Fix 1: loader avec message texte au lieu des 3 points
  loader.innerHTML = '<div style="width:32px;height:32px;border-radius:50%;background:#0C447C;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span style="font-size:14px;">🤖</span></div>'
    + '<div style="background:var(--bg);border-radius:4px 14px 14px 14px;padding:10px 14px;border-left:3px solid rgba(27,79,216,0.2);">'
    + '<div class="coach-typing"><span>Le Coach écrit</span><div class="coach-typing-dots"><i></i><i></i><i></i></div></div>'
    + '</div>';
  container.appendChild(loader);
  container.scrollTo({top:container.scrollHeight, behavior:"smooth"});
  // Always scroll on new message send
  try {
    // ── Détecter ce que la question nécessite ──
    const needs = detectContextNeeds(msg);
    const responseMode = detectResponseMode(msg);

    // ── Construire l'historique complet (réutilisé si besoin) ──
    const fullHistory = [];
    for(let ws=1; ws<=CW; ws++){
      const weekSessions = [];
      weeks[ws-1].sessions.forEach((sess,si)=>{
        if(state[`del_w${ws}_s${si}`]) return;
        let ed=null;try{ed=state['edit_w'+ws+'_s'+si]?JSON.parse(state['edit_w'+ws+'_s'+si]):null;}catch(e){}
        const k = gk(ws,si);
        const done = !!state[k+'done'];
        let perf=null;try{perf=state[k+'perf']?JSON.parse(state[k+'perf']):null;}catch(e){}
        weekSessions.push({
          type: ed?ed.type:sess.type,
          titre: ed?ed.d.split('|')[0]:sess.d.split('|')[0],
          detail: ed?ed.d.split('|')[1]||(sess.d.split('|')[1]||''):(sess.d.split('|')[1]||''),
          kmPlan: ed?ed.km:sess.km,
          chaussures: ed?ed.shoe:null,
          done, kmRealise: done?(state[k+'km']||null):null,
          perf: perf||null
        });
      });
      let ei=0;
      while(ei<=20&&state[`extra_w${ws}_s${ei}`]){
        let es;try{es=JSON.parse(state[`extra_w${ws}_s${ei}`]);}catch(e){ei++;continue;}
        if(!es){ei++;continue;}
        const done=!!state[`extra_w${ws}_s${ei}_done`];
        let perfExtra=null;try{perfExtra=state[`extra_w${ws}_s${ei}_perf`]?JSON.parse(state[`extra_w${ws}_s${ei}_perf`]):null;}catch(e){}
        weekSessions.push({type:es.type,titre:es.d.split('|')[0],extra:true,kmPlan:es.km,chaussures:es.shoe||null,done,kmRealise:done?(state[`extra_w${ws}_s${ei}_km`]||null):null,perf:perfExtra});
        ei++;
      }
      if(weekSessions.length>0) fullHistory.push({semaine:ws,date_debut:weeks[ws-1].date,sessions:weekSessions});
    }

    // ── Plan futur (si nécessaire) ──
    const futurPlan = [];
    if(needs.plan_futur || needs.historique_complet) {
      for(let ws=CW; ws<=32; ws++){
        // Séances du plan de base
        const weekSessions = weeks[ws-1].sessions.map((sess, si) => {
          if(state['del_w'+ws+'_s'+si]) return null;
          let ed=null;try{ed=state['edit_w'+ws+'_s'+si]?JSON.parse(state['edit_w'+ws+'_s'+si]):null;}catch(e){}
          const d = ed ? ed.d : sess.d;
          const parts = d.split('|');
          const type = ed ? ed.type : sess.type;
          const sessionData = getSession(ws, si);
          const km = parseFloat(sessionData.km) || 0;
          return {
            type,
            titre: parts[0],
            detail_allure: parts[1] || null,
            kmPlan: km,
            chaussures: ed ? ed.shoe : null,
            planifie: ed && ed.sched_day
              ? ((['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'][ed.sched_day]||'') + (ed.sched_time ? ' '+ed.sched_time : ''))
              : 'non planifié'
          };
        }).filter(Boolean);

        // ── Séances extra (ajoutées via "Ajouter une séance") ──
        let ei = 0;
        while(ei<=20&&state[`extra_w${ws}_s${ei}`]) {
          let es;try{es=JSON.parse(state[`extra_w${ws}_s${ei}`]);}catch(e){ei++;continue;}
          if(!es){ei++;continue;}
          const done = !!state[`extra_w${ws}_s${ei}_done`];
          const km = parseFloat(es.km) || 0;
          const parts = (es.d||'').split('|');
          weekSessions.push({
            type: es.type,
            titre: parts[0],
            detail_allure: parts[1] || null,
            kmPlan: km,
            chaussures: es.shoe || null,
            planifie: es.sched_day
              ? ((['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'][es.sched_day]||'') + (es.sched_time ? ' '+es.sched_time : ''))
              : 'non planifié',
            extra: true,
            fait: done
          });
          ei++;
        }

        // TOTAUX via getWeekTotalKm — source de vérité unique
        const kmTotal   = getWeekTotalKm(ws);
        const kmEF      = Math.round(weekSessions.filter(s=>s.type==='ef').reduce((a,s)=>a+s.kmPlan,0)*10)/10;
        const kmTempo   = Math.round(weekSessions.filter(s=>s.type==='tempo').reduce((a,s)=>a+s.kmPlan,0)*10)/10;
        const kmFrac    = Math.round(weekSessions.filter(s=>s.type==='frac').reduce((a,s)=>a+s.kmPlan,0)*10)/10;
        const kmLong    = Math.round(weekSessions.filter(s=>s.type==='long').reduce((a,s)=>a+s.kmPlan,0)*10)/10;
        const nbSeances = weekSessions.filter(s=>s.type!=='rest').length;
        const typeSemaine = [8,12,16,20,26,30].includes(ws) ? 'DÉCHARGE' : 'CHARGE';

        // Comparer avec la dernière semaine NON-DÉCHARGE (sauter les semaines de décharge)
        // Ex: S15=38km, S16=décharge 33km, S17=41km → S17 se compare à S15, pas S16
        let kmPrevSemaine = null;
        let semainePrevRef = null;
        if(ws > 1) {
          for(let prevWs = ws-1; prevWs >= 1; prevWs--) {
            const isDecharge = [8,12,16,20,26,30].includes(prevWs);
            if(!isDecharge) {
              kmPrevSemaine = getWeekTotalKm(prevWs);
              semainePrevRef = prevWs;
              break;
            }
          }
        }
        const hausse = (kmPrevSemaine && kmPrevSemaine > 0)
          ? Math.round((kmTotal - kmPrevSemaine) / kmPrevSemaine * 100)
          : null;

        futurPlan.push({
          semaine: ws,
          date_debut: weeks[ws-1].date,
          type_semaine: typeSemaine,
          km_total: kmTotal,
          km_ef: kmEF,
          km_tempo: kmTempo,
          km_frac: kmFrac,
          km_long: kmLong,
          nb_seances: nbSeances,
          km_semaine_precedente: kmPrevSemaine,
          semaine_ref_precedente: semainePrevRef, // semaine non-décharge utilisée pour la comparaison
          hausse_vs_precedente_pct: hausse,
          sessions: weekSessions
        });
      }
    }

    // ── Charger les mémos ──
    let coachMemos = '';
    try { const ms = await dbRef.child('_coach_memos').once('value'); coachMemos = ms.val()||''; } catch(e){}

    // ── Date / heure / séances du jour ──
    const now = new Date();
    const joursSemaine = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
    const heureActuelle = now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
    const jourActuel = joursSemaine[now.getDay()];
    const todayDayNum = now.getDay()===0?7:now.getDay();
    const seancesAujourdhui = [];
    getOrderedWeekSessions(CW).forEach(({s,si,extra,ei})=>{
      if(extra){
        const done=!!state[`extra_w${CW}_s${ei}_done`];
        if(done) return;
        if(s.sched_day===todayDayNum)
          seancesAujourdhui.push({type:s.type,titre:s.d.split('|')[0],km:s.km,heure:s.sched_time||null});
        return;
      }
      const edRaw=state['edit_w'+CW+'_s'+si];
      let ed=null;try{ed=edRaw?JSON.parse(edRaw):null;}catch(e){}
      const schedDay=(ed&&ed.sched_day)||s.sched_day;
      if(!schedDay) return;
      if(schedDay===todayDayNum&&!state[gk(CW,si)+'done'])
        seancesAujourdhui.push({type:(ed&&ed.type)||s.type,titre:ed&&ed.d?ed.d.split('|')[0]:s.d.split('|')[0],km:(ed&&ed.km)||s.km,heure:(ed&&ed.sched_time)||s.sched_time||null});
    });
    [{r:1,name:'Ischio-fessiers'},{r:2,name:'Bas du dos'}].forEach(rd=>{
      let sched=null;try{sched=state[rfk(CW,rd.r)+'sched']?JSON.parse(state[rfk(CW,rd.r)+'sched']):null;}catch(e){}
      if(sched&&sched.day===todayDayNum&&!state[rfk(CW,rd.r)+'done'])
        seancesAujourdhui.push({type:'renfo',titre:'Renfo '+rd.name,heure:sched.time||null});
    });

    // ── Assembler le contexte final ──
    const compactCtx = buildCompactContext(coachMemos, seancesAujourdhui, jourActuel, heureActuelle);
    const detailedSections = buildDetailedSections(needs, fullHistory, futurPlan);
    // Date réelle du jour pour le coach
    const _now = new Date();
    const _jNoms = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
    const _mNoms = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    const _dateStr = _jNoms[_now.getDay()]+' '+_now.getDate()+' '+_mNoms[_now.getMonth()]+' '+_now.getFullYear();
    const _seancesAvChat = [];
    (()=>{
      const joursC=['','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
      const tDow=now.getDay()===0?7:now.getDay(); const _haParts=heureActuelle?heureActuelle.split(':'):[0,0]; const hA=parseInt(_haParts[0])+parseInt(_haParts[1]||0)/60;
      getOrderedWeekSessions(CW).forEach(({s:s2,si,extra,ei})=>{
        if(_seancesAvChat.length>=3)return;
        const done=extra?!!state['extra_w'+CW+'_s'+ei+'_done']:!!state[gk(CW,si)+'done'];
        if(done)return;
        const edRaw=!extra&&state['edit_w'+CW+'_s'+si];
        let ed=null;try{ed=edRaw?JSON.parse(edRaw):null;}catch(e){}
        const titre=ed?ed.d.split('|')[0]:s2.d.split('|')[0];
        const type=ed?ed.type:s2.type; const km=ed?ed.km:s2.km;
        const jourC=ed&&ed.sched_day?joursC[ed.sched_day]:'';
        const heure=ed&&ed.sched_time?ed.sched_time:'';
        let hAvant=null;
        if(ed&&ed.sched_day){const dJ=((ed.sched_day-tDow)+7)%7;const hS=heure?parseInt(heure.split(':')[0])+parseInt(heure.split(':')[1]||0)/60:12;hAvant=Math.round(dJ*24+(hS-hA));}
        _seancesAvChat.push({type,titre,km,quand:jourC+(heure?' à '+heure:'non planifié'),heures_avant_seance:hAvant!==null?hAvant+'h':'?'});
      });
    })();
    const stateContext = Object.assign({}, compactCtx, detailedSections, {
      date_reelle: {
        complet: _dateStr,
        jour: _jNoms[_now.getDay()],
        numero: _now.getDate(),
        mois: _mNoms[_now.getMonth()],
        heure: _now.getHours()+'h'+String(_now.getMinutes()).padStart(2,'0')
      },
      charge_semaine: (()=>{const kmF=calcWeekDoneKm();const kmP=getWeekTotalKm(CW);const kmPrev=CW>1?getWeekTotalKm(CW-1):kmP;return {realise:kmF,planifie:kmP,ratio_vs_precedente:kmPrev>0?Math.round(kmP/kmPrev*100)/100:null,statut:kmF<kmP?'EN_COURS':'TERMINÉE'};})(),
      seances_a_venir: _seancesAvChat,
    });

    // ── Enrichir le message avec les données de planning si question sur horaires ──
    const mLower = msg.toLowerCase();
    const isAboutTiming = /quand|prochaine|séance|horaire|planifié|prévu|ce soir|demain|semaine|jour|heure|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche/.test(mLower);
    // Injecter le contexte de la séance récemment validée (< 30 min)
    let enrichedMsg = msg;
    const lastSession = window._lastValidatedSession;
    if(lastSession && (Date.now() - lastSession.timestamp) < 30*60*1000){
      let sessionCtx = '[Contexte: Guillaume vient de valider une séance '
        + lastSession.type.toUpperCase() + ' - ' + lastSession.titre
        + ' (' + lastSession.km + 'km'
        + (lastSession.pace ? ' @' + lastSession.pace : '')
        + (lastSession.hr ? ' FC' + lastSession.hr : '')
        + ') il y a moins de 30 minutes.';
      // Ajouter les données Strava enrichies si disponibles
      if(lastSession.garmin) {
        const g = lastSession.garmin;
        if(g.cadence) sessionCtx += ` Cadence: ${g.cadence} pas/min.`;
        if(g.fcMax) sessionCtx += ` FC max: ${g.fcMax} bpm.`;
        if(g.denivele_pos != null) sessionCtx += ` Dénivelé: +${g.denivele_pos}m/-${g.denivele_neg||0}m.`;
        if(g.puissance_moy) sessionCtx += ` Puissance moy: ${g.puissance_moy}W.`;
        if(g.zones_fc && g.zones_fc.length > 0) {
          const zonesStr = g.zones_fc.map(z => `${z.nom}: ${Math.floor(z.temps_sec/60)}min`).join(', ');
          sessionCtx += ` Zones FC: ${zonesStr}.`;
        }
        if(g.splits && g.splits.length > 0) {
          const splitsStr = g.splits.map(sp => `km${sp.km}:${sp.allure||'—'}${sp.fc?' FC'+sp.fc:''}`).join(' | ');
          sessionCtx += ` Splits: ${splitsStr}.`;
        }
      }
      sessionCtx += ' Sa question porte probablement sur cette séance.]';
      enrichedMsg = msg + '\n\n' + sessionCtx;
    }
    if(isAboutTiming && compactCtx.seances_restantes_semaine && compactCtx.seances_restantes_semaine.length > 0){
      const planning = compactCtx.seances_restantes_semaine.join(', ');
      // Calculer le nb de jours jusqu'à chaque séance
      const todayIdx = now.getDay() === 0 ? 7 : now.getDay(); // 1=Lun...7=Dim
      const joursComplets = ['','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
      const planningAvecDelai = compactCtx.seances_restantes_semaine.map(s => {
        const match = s.match(/→ (Lun|Mar|Mer|Jeu|Ven|Sam|Dim) (\d{2}:\d{2})/);
        if(match){
          const joursAbr = ['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
          const sessDayIdx = joursAbr.indexOf(match[1]);
          const diff = sessDayIdx - todayIdx;
          const label = diff === 0 ? "aujourd'hui" : diff === 1 ? 'demain' : `dans ${diff} jours (${joursComplets[sessDayIdx]})`;
          return s + ` [${label} à ${match[2]}]`;
        }
        return s;
      }).join(', ');
      // Calculer les dates exactes de chaque séance
      const _msDay = 86400000;
      const _moisNoms2 = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
      const planningDates = compactCtx.seances_restantes_semaine.map(s => {
        const m2 = s.match(/\u2192 (Lun|Mar|Mer|Jeu|Ven|Sam|Dim) (\d{2}:\d{2})/);
        if(m2) {
          const joursAbr2 = ['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
          const sdi = joursAbr2.indexOf(m2[1]);
          const d2 = ((sdi - todayIdx) + 7) % 7;
          const sd = new Date(now.getTime() + d2 * _msDay);
          const dateExacte = sd.getDate() + ' ' + _moisNoms2[sd.getMonth()];
          const lbl = d2===0 ? "aujourd'hui" : d2===1 ? 'demain' : joursComplets[sdi];
          return s + ' [' + lbl + ' ' + dateExacte + ' à ' + m2[2] + ']';
        }
        return s;
      }).join(', ');
      const _dateAuj = now.getDate() + ' ' + _moisNoms2[now.getMonth()] + ' ' + now.getFullYear();
      const _efDynMsg = getBestEfPace() || "6'40";
      const planningDatesFinal = planningDates.replace(/\d:\d{2}\/km/g, _efDynMsg + '/km')
                                              .replace(/EF @ \d:\d{2}\/km/g, 'EF @ ' + _efDynMsg + '/km');
      enrichedMsg = msg + '\n\n[Dates exactes séances: ' + planningDatesFinal + '. AUJOURD\'HUI = ' + jourActuel + ' ' + _dateAuj + '. Utilise UNIQUEMENT ces dates, ne calcule jamais toi-même.]';
    }

    const response = await fetch('https://us-central1-prepa-marathon.cloudfunctions.net/coachChat', {
      method:'POST',
      headers:await authHeaders(true),
      body:JSON.stringify({message:enrichedMsg, history:coachHistory.slice(-20), stateContext, responseMode})
    });

    // NE PAS supprimer loader ici — il reste visible pendant la lecture du stream

    // Préparer la bulle réponse (PAS encore dans le DOM)
    const container = document.getElementById('coach-messages');
    const bubbleWrap = document.createElement('div');
    bubbleWrap.style.cssText = 'display:flex;align-items:flex-start;gap:8px;opacity:0;transition:opacity 0.3s ease;';
    const avatar = document.createElement('div');
    avatar.style.cssText = 'width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#1B4FD8,#6B21A8);display:flex;align-items:center;justify-content:center;flex-shrink:0;';
    avatar.innerHTML = '<span style="font-size:14px;">🤖</span>';
    const bubble = document.createElement('div');
    bubble.style.cssText = 'background:var(--bg);border-radius:4px 14px 14px 14px;padding:12px 14px;max-width:85%;border-left:3px solid rgba(27,79,216,0.2);box-shadow:0 1px 6px rgba(0,0,0,0.07);';
    const textEl = document.createElement('div');
    textEl.style.cssText = 'font-size:14px;color:var(--text);line-height:1.7;';
    bubble.appendChild(textEl);
    bubbleWrap.appendChild(avatar);
    bubbleWrap.appendChild(bubble);
    // NE PAS ajouter au DOM ici — seulement quand on a le contenu

    // Lire tout le stream
    if(!response.ok || !response.body) throw new Error('HTTP ' + response.status);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '', buffer = '';

    while(true) {
      const {done, value} = await reader.read();
      if(done) break;
      buffer += decoder.decode(value, {stream: true});
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for(const line of lines) {
        if(!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if(data === '[DONE]') continue;
        try { const parsed = JSON.parse(data); if(parsed.token) fullText += parsed.token; } catch(e) {}
      }
    }

    // Injecter le texte dans la bulle (encore hors DOM)
    const cleanedFullText = cleanTruncated(fullText);

    // Si réponse vide → retry automatique silencieux (1 seule fois)
    if(!cleanedFullText && !window._coachRetrying) {
      window._coachRetrying = true;
      loader.remove();
      if(sendBtn){ sendBtn.disabled=false; sendBtn.style.opacity='1'; sendBtn.style.cursor='pointer'; }
      // Retry après 2 secondes
      setTimeout(() => {
        window._coachRetrying = false;
        sendCoachMessage(msg);
      }, 2000);
      return;
    }
    window._coachRetrying = false;

    textEl.innerHTML = cleanedFullText
      ? renderCoachText(cleanedFullText)
      : '<p style="margin:0;color:var(--muted);font-style:italic;">Je suis momentanément indisponible, réessaie dans quelques secondes.</p>';

    // Crossfade atomique : ajouter bulle au DOM opacity:0, puis fade-in/out simultané
    container.appendChild(bubbleWrap); // ajoute avec opacity:0 déjà défini
    container.scrollTo({top:container.scrollHeight, behavior:'smooth'});

    // Un seul requestAnimationFrame pour les deux animations simultanées
    requestAnimationFrame(() => {
      bubbleWrap.style.opacity = '1';                     // bulle apparaît
      loader.style.transition = 'opacity 0.25s ease';
      loader.style.opacity = '0';                         // loader disparaît
      setTimeout(() => loader.remove(), 250);              // suppression après fade
    });

    if(sendBtn){ sendBtn.disabled=false; sendBtn.style.opacity='1'; sendBtn.style.cursor='pointer'; }

    coachHistory.push({role:'assistant', content: cleanedFullText||'', date: new Date().toISOString().slice(0,10)});
    saveCoachHistory();
    if(cleanedFullText) checkForPlanProposal(cleanedFullText, bubble);
    if(responseMode==='analyse'||responseMode==='rapport'){
      setTimeout(()=>{
        const chartQuery = _lastUserMessageBeforeProposal || msg;
        detectChartNeeds(chartQuery).forEach(ch=>{
          const html=buildCoachChart(ch.type,ch.title);
          if(html){ const d=document.createElement('div'); d.innerHTML=html; bubble.appendChild(d.firstChild); smartScroll(container); }
        });
      },250);
    }
  } catch(e) {
    loader.remove();
    if(sendBtn){ sendBtn.disabled=false; sendBtn.style.opacity='1'; sendBtn.style.cursor='pointer'; }
    addCoachMessage('coach', 'Désolé, je suis temporairement indisponible.');
  }
}
function saveCoachHistory(){
  if(!dbRef) return;
  const toSave = coachHistory.slice(-50);
  dbRef.child('_coach_history').set(JSON.stringify(toSave)).catch(e => console.warn('saveCoachHistory:', e.message));
  // Extraire les mémos tous les 6 messages
  if(coachHistory.length % 6 === 0) extractAndSaveMemos();
}

async function extractAndSaveMemosWithContext(extraMessages) {
  // Appelé après un débrief de séance — force la mise à jour des mémos
  // même si le seuil de 6 messages n'est pas atteint
  const existingMemos = await _loadMemos();
  if(!existingMemos && !extraMessages) return;
  try {
    // Récupérer les performances récentes
    const recentPerfs = [];
    for(let ws=Math.max(1,CW-7); ws<=CW; ws++) {
      if(!weeks[ws-1]) continue;
      weeks[ws-1].sessions.forEach((sess,si) => {
        const dk = gk(ws,si);
        if(!state[dk+'done']) return;
        let perf={};try{perf=state[dk+'perf']?JSON.parse(state[dk+'perf']):{}}catch(e){}
        const parts = [];
        if(perf.pace) parts.push('allure:'+perf.pace+'/km');
        if(perf.hr) parts.push('FC:'+perf.hr+'bpm');
        if(state[dk+'km']) parts.push(state[dk+'km']+'km');
        if(parts.length) recentPerfs.push('S'+ws+' '+sess.type+': '+parts.join(', '));
      });
    }
    const historyToSend = [...(extraMessages||[]), ...coachHistory.slice(-10)];
    const response = await fetch('https://us-central1-prepa-marathon.cloudfunctions.net/extractMemos', {
      method:'POST', headers:await authHeaders(false),
      body: JSON.stringify({
        history: historyToSend,
        existingMemos,
        recentPerfs: recentPerfs.join('\n')
      })
    });
    const data = await response.json();
    if(data.memos && data.memos !== existingMemos) {
      _setMemos(data.memos);
    }
  } catch(e) { console.log('memo update after debrief failed:', e); }
}

async function extractAndSaveMemos(){
  try {
    // Vérifier si les derniers échanges contiennent des infos importantes
    const lastMessages = coachHistory.slice(-6);
    const hasPersonalInfo = lastMessages.some(m => {
      const t = m.content.toLowerCase();
      return /blessure|douleur|fatigue|kin[eé]|m[eé]decin|vacances|voyage|travail|stress|sommeil|nutrition|poids|mollet|genou|cheville|hanche|dos|tendon|pr[eé]f[eè]re|j.aime|d[eé]teste|objectif|sous-/.test(t)
        // Résolutions de problèmes — allures, rythme, progression
        || /respect[eé]|allure|tempo|km|vitesse|rythme|j.ai fait|j.ai couru|bien couru|progress|amélio|mieux|corrig|cette semaine|cette s[eé]ance|réussi|maintenu|tenu/.test(t)
        // Bilan séance ou semaine → toujours pertinent
        || /bilan|s[0-9]|semaine [0-9]|séance.*fait|fait.*séance/.test(t);
    });
    // Forcer aussi si les mémos contiennent un problème qui pourrait être résolu
    const memosHaveProblem = (_currentMemos||'').toLowerCase().match(
      /ne respecte pas|acc[eé]l[eè]re|trop vite|au lieu de|probl[eè]me|attention|trop rapide|trop lent/
    );
    if(!hasPersonalInfo && !memosHaveProblem) return; // Pas d'info utile

    // Charger les mémos existants pour les passer à extractMemos
    let existingMemos = '';
    try { const ms = await dbRef.child('_coach_memos').once('value'); existingMemos = ms.val()||''; } catch(e){}

    // Récupérer les dernières performances pour contexte
    const recentPerfs = [];
    for(let ws=Math.max(1,CW-3); ws<=CW; ws++) {
      if(!weeks[ws-1]) continue;
      weeks[ws-1].sessions.forEach((sess,si) => {
        const dk = gk(ws,si);
        if(!state[dk+'done']) return;
        let perf={};try{perf=state[dk+'perf']?JSON.parse(state[dk+'perf']):{}}catch(e){}
        const parts = [];
        if(perf.pace) parts.push('allure:'+perf.pace+'/km');
        if(perf.hr) parts.push('FC:'+perf.hr+'bpm');
        if(state[dk+'km']) parts.push(state[dk+'km']+'km');
        if(parts.length) recentPerfs.push('S'+ws+' '+sess.type+': '+parts.join(', '));
      });
    }
    const response = await fetch('https://us-central1-prepa-marathon.cloudfunctions.net/extractMemos', {
      method:'POST', headers:await authHeaders(false),
      body: JSON.stringify({
        history: coachHistory.slice(-20),
        existingMemos,
        recentPerfs: recentPerfs.join('\n') // Données réelles pour vérifier résolution
      })
    });
    const data = await response.json();
    if(data.memos && data.memos !== existingMemos && dbRef){
      _setMemos(data.memos);
    }
  } catch(e) { console.log('memo extraction failed', e); }
}

let _briefOverlayShownAt = 0;
const _BRIEF_OVERLAY_MIN_MS = 2000; // durée minimale d'affichage

function showBriefOverlay(type) {
  const el = document.getElementById('brief-loading-overlay');
  if (!el) return;
  const isWeekly = type === 'weekly';
  document.getElementById('brief-overlay-icon').textContent = isWeekly ? '📊' : '☀️';
  document.getElementById('brief-overlay-title').textContent = isWeekly ? 'Bilan de semaine' : 'Brief du matin';
  document.getElementById('brief-overlay-sub').textContent = isWeekly ? 'Le Coach prépare ton bilan…' : 'Le Coach prépare ton brief matinal…';
  _briefOverlayShownAt = Date.now();
  el.style.display = 'flex';
}
function hideBriefOverlay() {
  const el = document.getElementById('brief-loading-overlay');
  if (!el || el.style.display === 'none') return;
  // Attendre le temps minimum, puis continuer la barre à la même vitesse jusqu'à 100%, puis masquer
  const remaining = Math.max(0, _BRIEF_OVERLAY_MIN_MS - (Date.now() - _briefOverlayShownAt));
  setTimeout(() => {
    const bar = document.getElementById('brief-bar-fill');
    let fillDurationMs = 400;
    if (bar) {
      // Lire la largeur visuelle actuelle AVANT d'arrêter l'animation (évite le saut à 0)
      const barRect = bar.getBoundingClientRect();
      const parentRect = bar.parentElement ? bar.parentElement.getBoundingClientRect() : barRect;
      const currentPct = parentRect.width > 0 ? (barRect.width / parentRect.width) * 100 : 0;
      // Figer la barre à sa position actuelle, puis stopper l'animation
      bar.style.width = currentPct + '%';
      bar.style.animation = 'none';
      bar.offsetWidth; // force reflow
      // Continuer jusqu'à 100% à la même vitesse (90% en 4000ms = 22.5%/s)
      const missingPct = 100 - currentPct;
      fillDurationMs = Math.round((missingPct / 22.5) * 1000);
      bar.style.transition = 'width ' + fillDurationMs + 'ms linear';
      bar.style.width = '100%';
    }
    setTimeout(() => {
      el.style.transition = 'opacity 0.35s ease';
      el.style.opacity = '0';
      setTimeout(() => { el.style.display = 'none'; el.style.opacity = '1'; el.style.transition = ''; if(bar){bar.style.width='';bar.style.transition='';} }, 360);
    }, fillDurationMs + 200);
  }, remaining);
}

// Convertit les conditions météo en emoji pour l'affichage dans le header du brief
function _meteoEmoji(conditions){
  if(!conditions) return null;
  const c = conditions.toLowerCase();
  if(c.includes('soleil')||c.includes('ensoleillé')||c.includes('dégagé')) return '☀️';
  if(c.includes('pluie')||c.includes('pluvieux')||c.includes('averse')) return '🌧️';
  if(c.includes('neige')) return '❄️';
  if(c.includes('orage')) return '⛈️';
  if(c.includes('brouillard')||c.includes('brume')) return '🌫️';
  if(c.includes('nuage')||c.includes('nuageux')||c.includes('voilé')||c.includes('couvert')) return '⛅';
  return '🌡️';
}
// Génère le brief complet après affichage du teaser de notification
async function generateFullBriefFromNotif(memos) {
  const container = document.getElementById('coach-messages');

  // Guard : si state est vide (race condition depuis notification), recharger Firebase
  if (dbRef && (!state || Object.keys(state).length === 0)) {
    try {
      const stateSnap = await dbRef.once('value');
      if (stateSnap.val()) state = stateSnap.val();
    } catch(e) {}
  }

  // Message de chargement visible
  addCoachMessage('coach', 'Je prépare ton brief du jour...');
  const loadingMsg = container ? container.lastElementChild : null;
  const textEl = loadingMsg ? loadingMsg.querySelector('[data-coach-text]') : null;
  if(container) container.scrollTop = container.scrollHeight;

  try {
    // Construire le même contexte riche que pour le brief matinal normal
    const now = new Date();
    const joursNoms = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
    const dow = now.getDay();
    const dowToSched = [7,1,2,3,4,5,6];
    const todaySched = dowToSched[dow];
    const todayStr = now.toISOString().slice(0,10);

    const seancesAujourdHui = [];
    const seancesJoursSuivants = [];
    weeks[CW-1].sessions.forEach((sess, si) => {
      if(sess.type === 'rest' || state['del_w'+CW+'_s'+si]) return;
      const edRaw = state['edit_w'+CW+'_s'+si];
      let ed=null;try{ed=edRaw?JSON.parse(edRaw):null;}catch(e){}
      const done = !!state[gk(CW,si)+'done'];
      if(done) return;
      const schedDay = (ed && ed.sched_day) || null;
      const entry = {
        type: sess.type,
        titre: (ed||sess).d.split('|')[0],
        km: (ed||sess).km,
        heure: ed && ed.sched_time ? ed.sched_time : '',
        allure: (ed||sess).d.split('|')[1] || ''
      };
      if(schedDay === todaySched) seancesAujourdHui.push(entry);
      else if(schedDay > todaySched) seancesJoursSuivants.push({...entry, jour: joursNoms[schedDay % 7] || ''});
    });

    // Météo : seulement si permission déjà accordée (pas de dialog au réveil)
    const _meteoHeure = seancesAujourdHui.length > 0 && seancesAujourdHui[0].heure
      ? seancesAujourdHui[0].heure
      : null;
    const meteoCtx = await fetchWeatherIfGranted(_meteoHeure, todayStr);

    // ── Ajouter le renfo d'aujourd'hui s'il est planifié ──
    const renfoAujourdHui = [];
    [{r:1,name:'Ischio-fessiers'},{r:2,name:'Bas du dos'}].forEach(rd => {
      let sched=null;try{sched=state[rfk(CW,rd.r)+'sched']?JSON.parse(state[rfk(CW,rd.r)+'sched']):null;}catch(e){}
      if(sched && sched.day === todaySched && !state[rfk(CW,rd.r)+'done'])
        renfoAujourdHui.push({type:'renfo', titre:'Renfo '+rd.name, heure: sched.time||'', km: null});
    });
    const toutesSeancesAujourdHui = [...seancesAujourdHui, ...renfoAujourdHui];

    // ── Contexte — clés alignées sur ce qu'attend le CF morningBrief ──
    const fcCtxNotif = buildFcReposContext();
    const _whoopDataNotif = state.whoop_data || null;
    const ctx = {
      type: 'brief_matin',
      date: todayStr,
      jour: joursNoms[dow] || '',
      heure_lecture: now.getHours(),
      fc_repos_bpm: state['fc_repos_' + todayStr] || state['fc_repos'] || null,
      fc_repos_moyenne_7j: fcCtxNotif.stats_7j ? fcCtxNotif.stats_7j.moyenne : null,
      fc_repos_alerte: fcCtxNotif.alerte_fatigue || null,
      whoop_recovery_score: _whoopDataNotif ? (_whoopDataNotif.latest_recovery_score ?? null) : null,
      meteo: meteoCtx ? {
        temperature: meteoCtx.temperature,
        conditions: meteoCtx.conditions,
        ressenti: meteoCtx.ressenti,
        vent_kmh: meteoCtx.vent_kmh,
        zone_ef_ajustee: meteoCtx.impact_performance ? meteoCtx.impact_performance.zone_ef_ajustee : null,
        elevation_fc_bpm: meteoCtx.impact_performance ? meteoCtx.impact_performance.elevation_fc_bpm : null,
        conseil_chaleur: meteoCtx.impact_performance && meteoCtx.impact_performance.elevation_fc_bpm > 0
          ? `Chaleur ${meteoCtx.temperature}°C : FC +${meteoCtx.impact_performance.elevation_fc_bpm} bpm. Zone EF effective : ${meteoCtx.impact_performance.zone_ef_ajustee||'143-154 bpm'}.`
          : null,
      } : null,
      seances_du_jour: toutesSeancesAujourdHui.map(s => ({
        type: s.type,
        titre: s.titre,
        km: s.km || null,
        heure: s.heure || null,
        allure_cible: s.allure || null,
      })),
      memos: memos || null,
      consignes_ef: [8,12,16,20,26,30].includes(CW)
        ? 'Semaine DÉCHARGE : allure EF lente, FC < 140 bpm'
        : `Allure EF : ${getBestEfPace()||"6'40"}/km — FC 140-148 bpm`,
      allure_ef: getBestEfPace() || null,
      allure_marathon: (()=>{ const p=buildMarathonPrediction(); return p&&p.amPaceRecoStr ? p.amPaceRecoStr : getMarathonPaceStr(); })() || null,
      allure_tempo: (()=>{
        const ef=paceStrToSec(getBestEfPace()||"6'40");
        const t=Math.max(ef-70,ef*0.85);
        return Math.floor(t/60)+"'"+(Math.round(t%60)+'').padStart(2,'0')+'/km';
      })(),
    };

    // Supprimer le message "Je prépare ton brief..."
    if(loadingMsg) loadingMsg.remove();

    // Appeler morningBrief — brief complet avec allures, conseils, nutrition
    const resp = await fetch('https://us-central1-prepa-marathon.cloudfunctions.net/morningBrief', {
      method: 'POST',
      headers: await authHeaders(true),
      body: JSON.stringify({context: ctx})
    });

    if(!resp.ok) throw new Error('HTTP ' + resp.status);

    // Accumuler tout le stream puis afficher d'un coup (comme les messages coach)
    let full = '', buf = '';
    const reader = resp.body.getReader();
    const dec = new TextDecoder();

    while(true) {
      const {value, done} = await reader.read();
      if(done) break;
      buf += dec.decode(value, {stream: true});
      const lines = buf.split('\n'); buf = lines.pop();
      for(const line of lines) {
        if(!line.startsWith('data: ')) continue;
        const d = line.slice(6).trim();
        if(d === '[DONE]') continue;
        try { const p = JSON.parse(d); if(p.token) full += p.token; } catch(e) {}
      }
    }

    const _notifMeteoIcon = meteoCtx ? _meteoEmoji(meteoCtx.conditions) : null;
    const _notifMeteoTemp = meteoCtx ? meteoCtx.temperature : null;
    const _notifSessionTime = toutesSeancesAujourdHui.length > 0 && toutesSeancesAujourdHui[0].heure ? toutesSeancesAujourdHui[0].heure : null;
    const _notifBriefOpts = {isBrief:true, briefType:'morning', meteoIcon:_notifMeteoIcon, meteoTemp:_notifMeteoTemp, sessionTime:_notifSessionTime};
    hideBriefOverlay();
    if(full) {
      addCoachMessage('coach', full, _notifBriefOpts);
      coachHistory.push({role: 'assistant', content: full, date: todayStr, isBrief:true, briefType:'morning', meteoIcon:_notifMeteoIcon, meteoTemp:_notifMeteoTemp, sessionTime:_notifSessionTime});
      saveCoachHistory();
      try { await dbRef.child('_brief_pending').set({content: full, date: todayStr, type:'morning_brief'}); } catch(e){}
    } else {
      // Fallback si le serveur ne répond pas
      const fallbackSeances = seancesAujourdHui.length > 0
        ? seancesAujourdHui.map(s => {
            const t = {ef:'EF', tempo:'Tempo', frac:'Fractionné', long:'EF Long', race:'Course'}[s.type] || s.type;
            return t + ' ' + s.km + 'km' + (s.heure ? ' à ' + s.heure : '');
          }).join(' + ')
        : 'Pas de séance prévue ce matin';
      const fallback = '💪 Bonjour Guillaume ! ' + fallbackSeances + '. Pose-moi tes questions directement.';
      hideBriefOverlay();
      addCoachMessage('coach', fallback);
      coachHistory.push({role: 'assistant', content: fallback, date: todayStr});
      saveCoachHistory();
    }
  } catch(e) {
    console.error('generateFullBriefFromNotif error:', e);
    // En cas d'erreur, tenter un message de secours construit localement
    hideBriefOverlay();
    const errFallback = '💪 Bonjour Guillaume ! Ouvre le Coach IA pour ton brief du jour — je suis prêt pour tes questions !';
    if(textEl) textEl.innerHTML = renderCoachText(errFallback);
  }
}
async function checkPendingBrief() {
  // Retourne {shown:true, type:'...', content:'...'} ou false
  if (!dbRef) return false;
  const today = new Date().toISOString().slice(0, 10);

  // Lire TOUJOURS depuis Firebase — le state local peut être obsolète
  let p = null;
  try {
    const snap = await dbRef.child('_brief_pending').once('value');
    p = snap.val();
  } catch(e) {}

  // Fallback sur state local uniquement si Firebase a échoué (null)
  if (!p) {
    try {
      const raw = state['_brief_pending'];
      if (raw) p = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch(e) {}
  }

  // needs_weekly_bilan : flag test local — pas de contenu pré-généré, appel CF à la volée
  if (p && p.needs_weekly_bilan) {
    if (p.date && (new Date(today) - new Date(p.date)) / 86400000 > 2) {
      try { await dbRef.child('_brief_pending').remove(); } catch(e) {}
      delete state['_brief_pending'];
      return false;
    }
    try { await dbRef.child('_brief_pending').remove(); } catch(e) {}
    delete state['_brief_pending'];
    return { needs_weekly_bilan: true };
  }

  if (!p || !p.content) return false;

  // Vérifier que le brief n'est pas trop vieux
  // morning_brief : jour même ; weekly_bilan : valable 2 jours (dimanche → lundi)
  if (p.date) {
    const briefDate = new Date(p.date);
    const todayDate = new Date(today);
    const diffDays = (todayDate - briefDate) / 86400000;
    const maxAge = (p.type === 'weekly_bilan') ? 2 : 0;
    if (diffDays > maxAge) {
      try { await dbRef.child('_brief_pending').remove(); } catch(e) {}
      delete state['_brief_pending'];
      return false;
    }
  }

  // Si le serveur a marqué needs_full_brief → supprimer le pending et laisser
  // checkMorningBrief générer le brief complet (via morningBrief CF)
  if (p.needs_full_brief) {
    try { await dbRef.child('_brief_pending').remove(); } catch(e) {}
    delete state['_brief_pending'];
    // Remettre le flag _brief_matin_ à false pour que checkMorningBrief puisse tourner
    try { await dbRef.child('_brief_matin_' + today).remove(); } catch(e) {}
    // Retourner un objet spécial pour signaler à loadCoachHistory d'appeler checkMorningBrief(force=true)
    return { needs_full_brief: true };
  }

  _briefShownToday = true;
  return { shown: true, type: p.type || 'morning_brief', content: p.content };
}

async function generateAndShowWeeklyBilan() {
  try { if (typeof showBriefOverlay === 'function') showBriefOverlay('weekly'); } catch(e) {}
  const container = document.getElementById('coach-messages');
  const loader = document.createElement('div');
  loader.id = 'bilan-loader';
  loader.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;';
  loader.innerHTML = '<div style="width:32px;height:32px;border-radius:50%;background:#0C447C;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span style="font-size:14px;">🤖</span></div>'
    + '<div style="background:#fff;border-radius:4px 14px 14px 14px;padding:10px 14px;border-left:3px solid rgba(12,68,124,0.15);">'
    + '<div class="coach-typing"><span>Le Coach prépare ton bilan de semaine</span><div class="coach-typing-dots"><i></i><i></i><i></i></div></div>'
    + '</div>';
  if (container) { container.appendChild(loader); container.scrollTo({top:container.scrollHeight,behavior:'smooth'}); }
  try {
    const h = await authHeaders(true);
    const resp = await fetch(`${FUNCTIONS_BASE}/adminTestNotif`, {
      method: 'POST', headers: h, body: JSON.stringify({type:'bilan-semaine'})
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    // Récupérer le bilan stocké dans _brief_pending
    const snap = await dbRef.child('_brief_pending').once('value');
    const p = snap.val();
    if (loader && loader.parentNode) loader.remove();
    hideBriefOverlay();
    if (p && p.content) {
      const todayStr = new Date().toISOString().slice(0,10);
      addCoachMessage('coach', p.content, {isBrief:true, briefType:'weekly'});
      const _lastWeeklyMsg = container ? container.lastElementChild : null;
      if (_lastWeeklyMsg) _lastWeeklyMsg.dataset.briefDate = todayStr;
      coachHistory.push({role:'assistant', content: p.content, date: todayStr, isBrief: true, briefType:'weekly'});
      saveCoachHistory();
      _addBriefActionButtons();
      try { await dbRef.child('_brief_pending').remove(); } catch(e) {}
    } else {
      addCoachMessage('coach', '📊 Bilan généré — retrouve-le dans le Coach IA.');
    }
  } catch(e) {
    if (loader && loader.parentNode) loader.remove();
    hideBriefOverlay();
    addCoachMessage('coach', '📊 Bilan de semaine temporairement indisponible. Réessaie dans quelques secondes.');
  }
  _briefShownToday = true;
}

async function checkMorningBrief(memos, force) {
  if(_briefShownToday) return false;
  // force=true (depuis notif) : on génère le brief même si la préf est désactivée côté client
  if(!force && !getPref('notif_brief_matin')) return false;
  const now = new Date();
  const h = now.getHours();
  const dow = now.getDay(); // 0=dim,1=lun,...,6=sam

  // Dimanche : bilan géré séparément → pas de brief matin
  if(!force && dow === 0) return false;

  // Lundi : le briefing semaine gère l'affichage → pas de brief matin standard
  // SAUF si force=true (déclenché par notif)
  if(!force && dow === 1) return false;

  // Si on ouvre l'app AVANT 8h00 → programmer un setTimeout pour 8h00 pile
  if(!force && h < 8) {
    const target8h = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0);
    const msUntil8h = target8h - now;
    setTimeout(() => checkMorningBrief(memos), msUntil8h);
    return false;
  }

  const todayStr = now.toISOString().slice(0,10);
  const briefKey = '_brief_matin_' + todayStr;

  // Vérifier si déjà affiché aujourd'hui (Firebase — source de vérité)
  try {
    const snap = await dbRef.child(briefKey).once('value');
    const val = snap.val();
    // 'push_sent' = notif envoyée mais brief complet pas encore généré → OK, on continue
    // true ou 'read' = brief complet déjà généré → stop
    if (val === true || val === 'read') return false;
  } catch(e) { return false; }

  // Chercher séances d'aujourd'hui
  const dowToSched = [7,1,2,3,4,5,6]; // JS day → sched_day
  const todaySched = dowToSched[dow];
  const todaySessions = [];
  // Nouveau format de plan (extra_w) : séances avec sched_date ou sched_day
  const useExtraFormat = !!state['extra_w'+CW+'_s0'];
  if(useExtraFormat){
    let ei=0;
    while(ei<=20&&state['extra_w'+CW+'_s'+ei]){
      try{
        const s=JSON.parse(state['extra_w'+CW+'_s'+ei]);
        if(s.type==='rest'){ei++;continue;}
        if(state[gk(CW,ei)+'done']){ei++;continue;}
        const matchDate = s.sched_date && s.sched_date===todayStr;
        const matchDay = !s.sched_date && s.sched_day===todaySched;
        if(matchDate||matchDay){
          todaySessions.push({type:s.type,titre:s.d.split('|')[0],km:s.km,heure:s.sched_time||'',allure:s.d.split('|')[1]||''});
        }
      }catch(e){}
      ei++;
    }
  } else {
    // Ancien format (weeks hardcodé) avec overrides edit_w
    weeks[CW-1].sessions.forEach((sess, si) => {
      if(sess.type === 'rest') return;
      if(state['del_w'+CW+'_s'+si]) return;
      if(state[gk(CW,si)+'done']) return;
      const edRaw = state['edit_w'+CW+'_s'+si];
      const ed = edRaw ? JSON.parse(edRaw) : null;
      if(ed && ed.sched_day === todaySched) {
        todaySessions.push({
          type: sess.type,
          titre: (ed||sess).d.split('|')[0],
          km: (ed||sess).km,
          heure: ed && ed.sched_time ? ed.sched_time : '',
          allure: (ed||sess).d.split('|')[1] || ''
        });
      }
    });
  }

  // Renfo prévu aujourd'hui
  const renfoTodayGate = [];
  [{r:1,name:'Ischio-fessiers'},{r:2,name:'Bas du dos'}].forEach(rd => {
    const raw = state[rfk(CW,rd.r)+'sched'];
    if(!raw) return;
    // Firebase peut retourner soit un objet soit une string JSON
    let sched;
    try { sched = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { return; }
    console.log('[brief] renfo', rd.r, 'sched:', JSON.stringify(sched), 'todaySched:', todaySched, 'done:', !!state[rfk(CW,rd.r)+'done']);
    if(sched && sched.day === todaySched && !state[rfk(CW,rd.r)+'done'])
      renfoTodayGate.push(rd.name);
  });

  // Lundi : bodyhit compte comme activité du jour même sans séance planifiée
  const bodyhitToday = (dow === 1);

  if(!force && todaySessions.length === 0 && renfoTodayGate.length === 0 && !bodyhitToday) return false;

  _briefShownToday = true; // empêche tout double affichage dans la même session
  // Note : briefKey (_brief_matin_DATE) sera posé en DB APRÈS génération réussie
  // pour permettre une re-tentative si l'appel IA échoue ou timeout

  const joursNoms = ['','lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];

  // Appel IA pour le conseil personnalisé
  // Séances des jours suivants (pour que le coach ne les invente pas)
  const seancesJoursSuivants = [];
  if(useExtraFormat){
    let ei=0;
    while(ei<=20&&state['extra_w'+CW+'_s'+ei]){
      try{
        const s=JSON.parse(state['extra_w'+CW+'_s'+ei]);
        if(s.type==='rest'){ei++;continue;}
        if(state[gk(CW,ei)+'done']){ei++;continue;}
        const afterToday = s.sched_date ? s.sched_date>todayStr : (s.sched_day&&s.sched_day>todaySched);
        if(afterToday){
          const d=s.sched_date?new Date(s.sched_date+'T00:00:00'):null;
          const jourNom=d?joursNoms[d.getDay()===0?7:d.getDay()]:(joursNoms[s.sched_day]||('jour '+s.sched_day));
          seancesJoursSuivants.push({type:s.type,titre:s.d.split('|')[0],km:s.km,jour:jourNom,heure:s.sched_time||''});
        }
      }catch(e){}
      ei++;
    }
  } else {
    weeks[CW-1].sessions.forEach((sess, si) => {
      if(sess.type === 'rest') return;
      if(state['del_w'+CW+'_s'+si]) return;
      if(state[gk(CW,si)+'done']) return;
      const edRaw = state['edit_w'+CW+'_s'+si];
      const ed = edRaw ? JSON.parse(edRaw) : null;
      if(ed && ed.sched_day > todaySched) {
        const jourNom = joursNoms[ed.sched_day] || ('jour '+ed.sched_day);
        seancesJoursSuivants.push({
          type: sess.type,
          titre: (ed||sess).d.split('|')[0],
          km: (ed||sess).km,
          jour: jourNom,
          heure: ed.sched_time || '',
        });
      }
    });
  }

  // Récupérer la dernière séance validée
  let derniereSeanceInfo = null;
  for(let ws=CW; ws>=Math.max(1,CW-2); ws--) {
    let found = false;
    weeks[ws-1].sessions.forEach((sess,si) => {
      if(found) return;
      const k = gk(ws,si);
      if(!state[k+'done']) return;
      let perf={};try{perf=state[k+'perf']?JSON.parse(state[k+'perf']):{}}catch(e){}
      derniereSeanceInfo = {
        type: sess.type,
        titre: sess.d.split('|')[0],
        km: state[k+'km'] || sess.km,
        allure: perf.pace || null,
        fc: perf.hr || null,
        date: perf.date || null,
        semaine: ws,
        strava: perf.strava || null,
      };
      found = true;
    });
    if(derniereSeanceInfo) break;
  }

  // Alerte récupération
  let alerteRecup = null;
  if(derniereSeanceInfo && todaySessions.length > 0) {
    const s0 = todaySessions[0];
    const heureSeance = s0.heure ? parseInt(s0.heure.split(':')[0]) : 12;
    // Estimation simple basée sur le jour
    alerteRecup = (derniereSeanceInfo.type === 'tempo' || derniereSeanceInfo.type === 'frac') ? 'Séance intense hier → vérifier que 36h minimum écoulées avant EF' : null;
  }

  // Météo : seulement si permission déjà accordée (pas de dialog au réveil)
  const _meteoHeureMatin = todaySessions.length > 0 && todaySessions[0].heure
    ? todaySessions[0].heure
    : null;
  const meteoBrief = await fetchWeatherIfGranted(_meteoHeureMatin, todayStr);

  // ── Ajouter le renfo d'aujourd'hui ──
  const renfoAujourdHuiBrief = [];
  [{r:1,name:'Ischio-fessiers'},{r:2,name:'Bas du dos'}].forEach(rd => {
    const raw = state[rfk(CW,rd.r)+'sched'];
    if(!raw) return;
    let sched;
    try { sched = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { return; }
    console.log('[brief] renfoList', rd.r, 'sched:', JSON.stringify(sched), 'todaySched:', todaySched);
    if(sched && sched.day === todaySched && !state[rfk(CW,rd.r)+'done'])
      renfoAujourdHuiBrief.push({type:'renfo', titre:'Renfo '+rd.name, heure: sched.time||'', km: null});
  });
  console.log('[brief] toutesSeances:', JSON.stringify([...todaySessions, ...renfoAujourdHuiBrief]));
  const toutesSeancesAujourdHuiBrief = [...todaySessions, ...renfoAujourdHuiBrief];

  // ── Contexte STRICT — uniquement aujourd'hui, rien sur la semaine ──
  const fcCtxBrief = buildFcReposContext();
  const ctx = {
    type: 'brief_matin',
    date: todayStr,
    jour: joursNoms[todaySched] || '',
    // FC repos du jour
    fc_repos_bpm: state['fc_repos_' + todayStr] || state['fc_repos'] || null,
    fc_repos_moyenne_7j: fcCtxBrief.stats_7j ? fcCtxBrief.stats_7j.moyenne : null,
    fc_repos_alerte: fcCtxBrief.alerte_fatigue || null,
    // Score de récupération WHOOP du jour
    whoop_recovery_score: state.whoop_data ? (state.whoop_data.latest_recovery_score ?? null) : null,
    // Météo
    meteo: meteoBrief ? {
      temperature: meteoBrief.temperature,
      conditions: meteoBrief.conditions,
      ressenti: meteoBrief.ressenti,
      vent_kmh: meteoBrief.vent_kmh,
      zone_ef_ajustee: meteoBrief.impact_performance ? meteoBrief.impact_performance.zone_ef_ajustee : null,
      elevation_fc_bpm: meteoBrief.impact_performance ? meteoBrief.impact_performance.elevation_fc_bpm : null,
      conseil_chaleur: meteoBrief.impact_performance && meteoBrief.impact_performance.elevation_fc_bpm > 0
        ? `Chaleur ${meteoBrief.temperature}°C : FC +${meteoBrief.impact_performance.elevation_fc_bpm} bpm. Zone EF effective : ${meteoBrief.impact_performance.zone_ef_ajustee||'143-154 bpm'}.`
        : null,
    } : null,
    // Séances du jour uniquement
    seances_du_jour: toutesSeancesAujourdHuiBrief.map(s => ({
      type: s.type,
      titre: s.titre,
      km: s.km || null,
      heure: s.heure || null,
      allure_cible: s.allure || null,
    })),
    // Consignes allure pour les séances du jour
    memos: memos || null,
    consignes_ef: [8,12,16,20,26,30].includes(CW)
      ? `Semaine DÉCHARGE : allure EF lente, FC < 140 bpm`
      : `Allure EF : ${getBestEfPace()||"6'40"}/km — FC 140-148 bpm`,
    // Allures explicites pour que le coach puisse donner des chiffres précis
    allure_ef: getBestEfPace() || null,
    allure_marathon: (()=>{ const p=buildMarathonPrediction(); return p&&p.amPaceRecoStr ? p.amPaceRecoStr : getMarathonPaceStr(); })() || null,
    allure_tempo: (()=>{
      const ef=paceStrToSec(getBestEfPace()||"6'40");
      const t=Math.max(ef-70,ef*0.85); // tempo ~70s plus vite que EF (approx)
      return Math.floor(t/60)+"'"+(Math.round(t%60)+'').padStart(2,'0')+'/km';
    })(),
    heure_lecture: now.getHours(),
  };
  try {
    // ── Afficher le loader "Le Coach écrit" immédiatement ──
    const container = document.getElementById('coach-messages');
    const loader = document.createElement('div');
    loader.id = 'brief-loader';
    loader.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;';
    loader.innerHTML = '<div style="width:32px;height:32px;border-radius:50%;background:#0C447C;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span style="font-size:14px;">🤖</span></div>'
      + '<div style="background:#fff;border-radius:4px 14px 14px 14px;padding:10px 14px;border-left:3px solid rgba(12,68,124,0.15);">'
      + '<div class="coach-typing"><span>Le Coach prépare ton brief</span><div class="coach-typing-dots"><i></i><i></i><i></i></div></div>'
      + '</div>';
    if(container) { container.appendChild(loader); container.scrollTo({top:container.scrollHeight,behavior:'smooth'}); }

    const resp = await fetch('https://us-central1-prepa-marathon.cloudfunctions.net/morningBrief', {
      method:'POST',
      headers:await authHeaders(true),
      body: JSON.stringify({context: ctx})
    });

    // ── Collecter tout le stream silencieusement ──
    let full = '', buf = '';
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    while(true) {
      const {value, done} = await reader.read();
      if(done) break;
      buf += dec.decode(value, {stream:true});
      const lines = buf.split('\n'); buf = lines.pop();
      for(const line of lines) {
        if(!line.startsWith('data: ')) continue;
        const d = line.slice(6).trim();
        if(d==='[DONE]') continue;
        try { const token = JSON.parse(d)?.token||''; if(token) full+=token; } catch(e){}
      }
    }

    // ── Retirer le loader et afficher le message d'un coup ──
    if(loader && loader.parentNode) loader.remove();
    const _cmMeteoIcon = meteoBrief ? _meteoEmoji(meteoBrief.conditions) : null;
    const _cmMeteoTemp = meteoBrief ? meteoBrief.temperature : null;
    const _cmSessionTime = toutesSeancesAujourdHuiBrief.length > 0 && toutesSeancesAujourdHuiBrief[0].heure ? toutesSeancesAujourdHuiBrief[0].heure : null;
    const _cmBriefOpts = {isBrief:true, briefType:'morning', meteoIcon:_cmMeteoIcon, meteoTemp:_cmMeteoTemp, sessionTime:_cmSessionTime};
    hideBriefOverlay();
    if(full) {
      addCoachMessage('coach', full, _cmBriefOpts);
      coachHistory.push({role:'assistant', content: full, date: new Date().toISOString().slice(0,10), isBrief:true, briefType:'morning', meteoIcon:_cmMeteoIcon, meteoTemp:_cmMeteoTemp, sessionTime:_cmSessionTime});
      saveCoachHistory();
      try { await dbRef.child('_brief_pending').set({content: full, date: todayStr, type:'morning_brief'}); } catch(e){}
      // Marquer en DB maintenant que le brief est généré (après succès, pas avant)
      try { await dbRef.child(briefKey).set(true); } catch(e){}
      // Boutons Conserver / Effacer sous le brief
      _addBriefActionButtons();
    }
    return true;
  } catch(e) { console.error('morningBrief error:', e); }
  return true;
}

function _addBriefActionButtons(keepOnly){
  const container=document.getElementById('coach-messages');
  if(!container) return;
  if(document.getElementById('brief-actions')) return; // déjà présent
  const div=document.createElement('div');
  div.id='brief-actions';
  div.style.cssText='display:flex;gap:6px;padding:0 0 14px 0;justify-content:center;animation:msg-enter 0.3s ease;';
  if(keepOnly){
    div.innerHTML=`<button onclick="dismissBrief()" style="padding:6px 14px;background:transparent;color:#aaa;border:1px solid #e0e0e0;border-radius:16px;font-size:12px;font-weight:500;cursor:pointer;">🗑️ Effacer</button>`;
  } else {
    div.innerHTML=`<button onclick="dismissBrief()" style="padding:6px 16px;background:transparent;color:#bbb;border:1px solid #e8e8e8;border-radius:16px;font-size:12px;font-weight:500;cursor:pointer;">🗑️ Supprimer</button>`
      +`<button onclick="keepBrief()" style="padding:6px 16px;background:linear-gradient(135deg,#1B4FD8,#0C447C);color:#fff;border:none;border-radius:16px;font-size:12px;font-weight:600;cursor:pointer;box-shadow:0 2px 6px rgba(12,68,124,0.25);">📌 Garder</button>`;
  }
  container.appendChild(div);
  container.scrollTo({top:container.scrollHeight,behavior:'smooth'});
}

function dismissBrief(){
  if(dbRef){
    dbRef.child('_brief_pending').remove().catch(()=>{});
    dbRef.child('_brief_kept').remove().catch(()=>{});
  }
  const btns=document.getElementById('brief-actions');
  if(btns) btns.remove();
  // Supprimer le message du DOM (brief principal + météo)
  const container=document.getElementById('coach-messages');
  if(container){
    const briefEl=container.querySelector('[data-brief-date]');
    if(briefEl) briefEl.remove();
    const weatherEl=container.querySelector('[data-weather-brief]');
    if(weatherEl) weatherEl.remove();
    // Supprimer le séparateur de date si plus de messages après lui
    const seps=container.querySelectorAll('.chat-date-sep');
    seps.forEach(sep=>{
      let next=sep.nextElementSibling;
      if(!next||next.classList.contains('chat-date-sep')) sep.remove();
    });
  }
  // Supprimer de l'historique (brief + météo)
  let changed=false;
  for(let i=coachHistory.length-1;i>=0;i--){
    if(coachHistory[i].isBrief||coachHistory[i].isWeatherBrief){coachHistory.splice(i,1);changed=true;}
  }
  if(changed) saveCoachHistory();
}

function keepBrief(){
  // Calculer l'expiration : 20h00 du jour courant, ou validation de séance (gérée séparément)
  const _today = new Date().toISOString().slice(0,10);
  const _expires = _today + 'T20:00:00';
  if(dbRef) dbRef.child('_brief_kept').set({date: _today, expires_at: _expires}).catch(()=>{});
  const btns=document.getElementById('brief-actions');
  if(btns) btns.remove();
  // Remplacer par un seul bouton Effacer discret
  _addBriefActionButtons(true);
}

async function _appendWeatherMessageAfterBrief() {
  // Fetch météo silencieusement (utilise cache ou géoloc déjà accordée)
  // Chercher l'heure de la séance du jour pour cibler la météo
  const _todayDow = new Date().getDay();
  const _todaySched = [7,1,2,3,4,5,6][_todayDow];
  let _seanceHeure = null;
  for(let si=0;si<5;si++){
    const edRaw=state['edit_w'+CW+'_s'+si];
    if(!edRaw)continue;
    try{const ed=JSON.parse(edRaw);if(ed.sched_day===_todaySched&&ed.sched_time&&!state[gk(CW,si)+'done']){_seanceHeure=ed.sched_time;break;}}catch(e){}
  }
  let meteo=null;
  try{ meteo=await fetchWeatherIfGranted(_seanceHeure, new Date().toISOString().slice(0,10)); }catch(e){}
  if(!meteo||!meteo.temperature) return;

  // Construire le message météo formaté
  const temp=meteo.temperature;
  const ressenti=meteo.ressenti||temp;
  const conditions=meteo.conditions||'';
  const impact=meteo.impact_performance||null;
  const vent=meteo.vent_kmh||0;
  const pluie=meteo.pluie_mm||0;

  let msg='';

  // En-tête météo
  const icone=conditions.split(' ').pop()||'🌤️';
  msg+=`${icone} **${temp}°C` + (ressenti!==temp?` (ressenti ${ressenti}°C)`:'') + `** — ${conditions||'conditions normales'}`;
  if(vent>20) msg+=`, vent **${vent} km/h**`;
  if(pluie>0.5) msg+=`, pluie **${Math.round(pluie*10)/10} mm**`;
  msg+='\n\n';

  // Impact sur la séance
  if(impact&&impact.elevation_fc_bpm>0){
    const elev=impact.elevation_fc_bpm;
    const efAjust=impact.zone_ef_ajustee||`${140+elev}-${148+elev} bpm`;
    msg+=`⚠️ Chaleur : ta FC sera naturellement **+${elev} bpm** plus haute. Zone EF effective : **${efAjust}**. Allure naturellement plus lente de **+${impact.ralent_sec_km||'?'} sec/km** — c'est normal, ne force pas.\n\n`;
    if(temp>=28) msg+=`💧 Hydratation +++ : emporte de l'eau, bois **toutes les 20 min** même sans soif.`;
    else msg+=`💡 Pars tôt si possible pour profiter des heures fraîches.`;
  } else if(impact&&impact.elevation_fc_bpm<0){
    const gain=Math.abs(impact.elevation_fc_bpm);
    msg+=`✅ Conditions fraîches idéales — FC **${gain} bpm** plus basse qu'en été. Tu peux viser le bas de ta zone EF (**140-144 bpm**). Bonne séance !`;
  } else if(pluie>1){
    msg+=`🌧️ Pluie prévue — chaussures trail ou grip. Réduis un peu l'allure sur sol mouillé.`;
  } else {
    msg+=`✅ Conditions normales — pas d'ajustement nécessaire. Lance-toi !`;
  }

  // Délai court pour que le message apparaisse progressivement après le brief
  await new Promise(r=>setTimeout(r,1800));
  const container=document.getElementById('coach-messages');
  if(!container) return;
  addCoachMessage('coach', msg);
  const _weatherEl = container.lastElementChild;
  if(_weatherEl) _weatherEl.dataset.weatherBrief = 'true';
  coachHistory.push({role:'assistant', content:msg, date:new Date().toISOString().slice(0,10), isWeatherBrief:true});
  saveCoachHistory();
}


async function loadCoachHistory(){
  const container = document.getElementById('coach-messages');
  if(!container){
 return; }
  if(window._coachInitDone){
 return; }
  window._coachInitDone = true;
  updateCoachHeader();
  const coachInp=document.getElementById('coach-input');
  if(coachInp&&!coachInp._placeholderSet){
    coachInp._placeholderSet=true;
    const phs=['Dis-moi tout Guillaume…','Une question sur ta prochaine séance ?',
      'Comment tu te sens aujourd’hui ?','On parle de ta semaine ?',
      'Pose-moi n’importe quelle question…'];
    let _pi=0;coachInp.placeholder=phs[0];
    setInterval(()=>{_pi=(_pi+1)%phs.length;if(document.activeElement!==coachInp)coachInp.placeholder=phs[_pi];},4000);
  }

  // Charger les mémos persistants
  let memos = '';
  try {
    const memoSnap = await dbRef.child('_coach_memos').once('value');
    if(memoSnap.val()) memos = memoSnap.val();
  } catch(e) {}

  // Vérifier d'abord si un brief push est en attente (priorité absolue, sans condition)
  const _pendingResult = await checkPendingBrief();
  // needs_full_brief : le serveur a envoyé la notif mais délègue la génération du brief complet au client
  const _needsFullBrief = _pendingResult && _pendingResult.needs_full_brief;
  const _needsWeeklyBilan = _pendingResult && _pendingResult.needs_weekly_bilan;
  // On mémorise si on vient d'une notif pour ne pas afficher le message de bienvenue parasite
  const _fromPushNotif = window._coachOpenedFromNotif || false;
  window._coachOpenedFromNotif = false; // reset
  if (_pendingResult && !_needsFullBrief && !_needsWeeklyBilan) {
    try {
      const _h = await dbRef.child('_coach_history').once('value');
      if (_h.val()) coachHistory = JSON.parse(_h.val());
    } catch(e) {}
    let _memos = '';
    try { const _ms = await dbRef.child('_coach_memos').once('value'); _memos = _ms.val()||''; } catch(e) {}
    const _todayStr = new Date().toISOString().slice(0,10);
    try { await dbRef.child('_brief_matin_'+_todayStr).set(true); } catch(e){}
    // NE PAS supprimer _brief_pending ici — on le supprime APRÈS affichage réussi

    const _pendingType = _pendingResult.type || 'morning_brief';

    // morning_brief / weekly_bilan : afficher le contenu pré-généré
    if (_pendingType === 'morning_brief' || _pendingType === 'weekly_bilan') {
      if (_pendingResult.content) {
        // Attendre que le DOM coach soit totalement rendu
        await new Promise(r => setTimeout(r, 400));
        // Fonction d'affichage avec retry
        const _briefDate = new Date().toISOString().slice(0,10);
        // Heure de séance du jour pour le badge header (calculée depuis state)
        let _pendingSessionTime = null;
        if (_pendingType === 'morning_brief') {
          const _pDow = new Date().getDay();
          const _pTodaySched = [7,1,2,3,4,5,6][_pDow];
          if (typeof weeks !== 'undefined' && weeks[CW-1]) {
            weeks[CW-1].sessions.forEach((sess, si) => {
              if (_pendingSessionTime) return;
              if (sess.type === 'rest' || state['del_w'+CW+'_s'+si] || state[gk(CW,si)+'done']) return;
              const edRaw = state['edit_w'+CW+'_s'+si];
              let ed = null; try { ed = edRaw ? JSON.parse(edRaw) : null; } catch(e) {}
              if (ed && ed.sched_day === _pTodaySched && ed.sched_time) _pendingSessionTime = ed.sched_time;
            });
          }
        }
        const _showBrief = () => {
          const _msgContainer = document.getElementById('coach-messages');
          if (!_msgContainer) return false;
          const _briefTypeOpt = _pendingType === 'weekly_bilan' ? 'weekly' : 'morning';
          hideBriefOverlay();
          addCoachMessage('coach', _pendingResult.content, {isBrief:true, briefType:_briefTypeOpt, sessionTime:_pendingSessionTime});
          // Tagger le dernier élément pour pouvoir le retrouver/supprimer
          const _lastMsg = _msgContainer.lastElementChild;
          if (_lastMsg) _lastMsg.dataset.briefDate = _briefDate;
          coachHistory.push({role:'assistant', content: _pendingResult.content, date: _briefDate, isBrief: true, briefType:_briefTypeOpt, sessionTime:_pendingSessionTime});
          saveCoachHistory();
          // Nettoyer après affichage réussi
          try { dbRef.child('_brief_pending').remove(); } catch(e){}
          delete state['_brief_pending'];
          // Afficher les boutons Garder / Supprimer
          setTimeout(() => _addBriefActionButtons(), 200);
          // Ouverture depuis notification → afficher le DÉBUT du brief (pas la fin)
          if (_fromPushNotif && _lastMsg) {
            setTimeout(() => {
              // Remonter au séparateur de date si présent juste avant, sinon au message
              const _scrollTarget = (_lastMsg.previousElementSibling && _lastMsg.previousElementSibling.classList.contains('chat-date-sep'))
                ? _lastMsg.previousElementSibling
                : _lastMsg;
              _msgContainer.scrollTo({ top: Math.max(0, _scrollTarget.offsetTop - 12), behavior: 'smooth' });
            }, 350);
          }
          return true;
        };
        if (!_showBrief()) {
          // Retry toutes les 300ms jusqu'à 5 tentatives
          let _tries = 0;
          const _retryInterval = setInterval(() => {
            _tries++;
            if (_showBrief() || _tries >= 5) clearInterval(_retryInterval);
          }, 300);
        } else {
          try { await dbRef.child('_brief_pending').remove(); } catch(e){}
          delete state['_brief_pending'];
        }
      }
      return;
    }
    try { await dbRef.child('_brief_pending').remove(); } catch(e){}
    await generateFullBriefFromNotif(_memos);
    return;
  }

  // Charger l'historique
  try {
    const snap = await dbRef.child('_coach_history').once('value');
    if(snap.val()){
      coachHistory = JSON.parse(snap.val());

      // Message de bienvenue lundi matin / bilan dimanche soir
      const now = new Date();
      const isMonday = now.getDay() === 1;
      const isSunday = now.getDay() === 0;
      const isMorning = now.getHours() < 13;
      const isEvening = now.getHours() >= 17;
      const lastVisitKey = '_coach_last_visit';
      let lastVisit = '';
      try { const lv = await dbRef.child(lastVisitKey).once('value'); lastVisit = lv.val()||''; } catch(e) {}
      const todayStr = now.toISOString().slice(0,10);

      if(isMonday && isMorning && lastVisit !== todayStr && !_needsFullBrief) {
        try { dbRef.child(lastVisitKey).set(todayStr); } catch(e) {}
        addCoachMessage('coach', 'Bonne semaine S'+CW+' ! Des questions sur ta prépa ?');
      } else {
        // Pas de lundi, pas dimanche : message normal sauf si on vient d'une notif
        if (!_fromPushNotif) {
          addCoachMessage('coach', 'Content de te retrouver ! Je me souviens de nos échanges. Que puis-je faire pour toi ?');
        }
      }
    } else {
      // Pas d'historique
      if (!_fromPushNotif) {
        addCoachMessage('coach', "Bonjour Guillaume ! Je suis ton coach IA. J'ai accès à tout ton plan et ton historique de séances. Pose-moi toutes tes questions sur ta prépa marathon !");
      }
    }
  } catch(e) {
    addCoachMessage('coach', "Bonjour Guillaume ! Je suis ton coach IA. Pose-moi toutes tes questions sur ta prépa marathon !");
  }
  // ── TOUJOURS vérifier le brief du matin en fin de loadCoachHistory ──
  // (sauf si un brief pending a déjà été affiché via checkPendingBrief)
  if (!_briefShownToday) {
    if (_needsWeeklyBilan) {
      try { await generateAndShowWeeklyBilan(); } catch(_e) {}
    } else {
      const _forceBrief = _needsFullBrief || _fromPushNotif;
      try { await checkMorningBrief(memos, _forceBrief); } catch(_e) {}
    }
  }
  if (dbRef) {
    try {
      const keptSnap = await dbRef.child('_brief_kept').once('value');
      const keptVal = keptSnap.val();
      if (keptVal) {
        const _now = new Date();
        const _todayStr = _now.toISOString().slice(0,10);
        // Ancienne structure (booléen) ou nouvelle structure ({date, expires_at})
        const _keptDate = typeof keptVal === 'object' ? keptVal.date : null;
        const _expiresAt = typeof keptVal === 'object' ? keptVal.expires_at : null;
        // Vérifier que le brief gardé est d'aujourd'hui et pas encore expiré
        const _sameDay = !_keptDate || _keptDate === _todayStr;
        const _notExpired = !_expiresAt || _now < new Date(_expiresAt);
        // Vérifier si la séance du jour est déjà validée
        const _todayDow = _now.getDay();
        const _todaySched = [7,1,2,3,4,5,6][_todayDow];
        let _todaySessionDone = false;
        weeks[CW-1].sessions.forEach((sess,si)=>{
          if(!_todaySessionDone && sess.type!=='rest' && !state['del_w'+CW+'_s'+si]){
            const edRaw=state['edit_w'+CW+'_s'+si]; let ed=null;
            try{ed=edRaw?JSON.parse(edRaw):null;}catch(e){}
            if((ed&&ed.sched_day||sess.sched_day)===_todaySched && state[gk(CW,si)+'done']) _todaySessionDone=true;
          }
        });
        if (_sameDay && _notExpired && !_todaySessionDone) {
          // Forcer le remplacement : si checkMorningBrief a déjà posé Supprimer+Garder, les remplacer par Effacer seul
          const _existingBtns = document.getElementById('brief-actions');
          if (_existingBtns) _existingBtns.remove();
          // Si le brief n'est pas dans le DOM (fermeture/réouverture app), le re-rendre depuis coachHistory
          const _coachMsgs = document.getElementById('coach-messages');
          const _briefInDom = _coachMsgs && _coachMsgs.querySelector('[data-brief-date]');
          if (!_briefInDom && coachHistory.length > 0) {
            const _briefItem = [...coachHistory].reverse().find(m => m.isBrief && m.date === _keptDate);
            if (_briefItem && _coachMsgs) {
              addCoachMessage('coach', _briefItem.content, {isBrief:true, briefType:(_briefItem.briefType||'morning'), meteoIcon:(_briefItem.meteoIcon||null), meteoTemp:(_briefItem.meteoTemp!=null?_briefItem.meteoTemp:null), sessionTime:(_briefItem.sessionTime||null)});
              const _lastMsg = _coachMsgs.lastElementChild;
              if (_lastMsg) _lastMsg.dataset.briefDate = _keptDate;
              _briefShownToday = true;
            }
          }
          _addBriefActionButtons(true);
        } else {
          // Expiré ou séance validée → nettoyer
          dbRef.child('_brief_kept').remove().catch(()=>{});
        }
      }
    } catch(e) {}
  }

  // ── Recharger la dernière analyse de séance si elle date d'aujourd'hui ──
  if(dbRef) {
    try {
      const _laSnap = await dbRef.child('_last_analysis').once('value');
      const _la = _laSnap.val();
      const _todayStr = new Date().toISOString().slice(0,10);
      if(_la && _la.content && _la.date === _todayStr) {
        const _laContainer = document.getElementById('coach-messages');
        // BUG 1 fix : ne pas afficher si une carte live existe déjà dans le DOM
        if(_laContainer && !_laContainer.querySelector('#coach-analysis-card')) {
          const _laWrap = document.createElement('div');
          _laWrap.style.cssText = 'display:block;margin:4px 0 8px;';
          const _feuBadge = _la.feu ? '<span style="background:rgba(255,255,255,0.22);border-radius:8px;padding:2px 8px;font-size:11px;font-weight:700;color:#fff;">'+_la.feu+' '+(_la.feu==='🟢'?'Feu vert':_la.feu==='🔴'?'Feu rouge':'Feu jaune')+'</span>' : '';
          const _statsRow = _la.stats_html ? '<div style="display:flex;flex-wrap:wrap;gap:6px;">'+_la.stats_html+'</div>' : '';
          _laWrap.innerHTML = '<div style="border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(22,101,52,0.13);border:1px solid rgba(22,101,52,0.12);">'
            + '<div style="background:linear-gradient(135deg,#166534,#16a34a);padding:10px 14px;">'
              + '<div style="display:flex;align-items:center;justify-content:space-between;'+ (_statsRow ? 'margin-bottom:8px;' : '') +'">'
                + '<div style="display:flex;align-items:center;gap:8px;">'
                  + '<div style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span style="font-size:13px;">🤖</span></div>'
                  + '<span style="font-size:13px;font-weight:700;color:#fff;">✅ Analyse de séance</span>'
                + '</div>'
                + '<div style="display:flex;align-items:center;gap:4px;">'+_feuBadge+'</div>'
              + '</div>'
              + _statsRow
            + '</div>'
            + '<div style="background:var(--bg,#fff);padding:14px 16px;color:var(--text,#1a1a1a);">'
              + renderBriefText(_la.content, 'green')
            + '</div>'
            + '<div style="padding:10px 14px;border-top:1px solid rgba(22,101,52,0.1);background:var(--bg2,#f9fefb);text-align:center;">'
              + '<button onclick="showScreen(\'plan\')" style="background:none;border:1.5px solid #16a34a;color:#166534;border-radius:10px;padding:6px 16px;font-size:12px;font-weight:700;cursor:pointer;">📅 Voir dans le plan</button>'
            + '</div>'
            + '</div>';
          _laContainer.appendChild(_laWrap);
          _laContainer.scrollTop = _laContainer.scrollHeight;
        }
      }
    } catch(e) {}
  }
}
// Afficher un overlay de chargement jusqu'à ce que Firebase soit prêt
// ── PUSH NOTIFICATIONS ────────────────────────────────────────────────────────
// Clé publique VAPID — à remplacer après avoir généré la paire de clés
// (voir instructions dans index.js)
const VAPID_PUBLIC_KEY = 'BBuZrddbAa1bRVH27VTuKV5cUpAVa6tOQ5oznjLHcQ0iQBJ5afidjJOLTSmebGdi1v2vdnnPjR022492YoIH4J0';

