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

    // ── Contexte MINIMAL — uniquement aujourd'hui ──
    const fcCtxNotif = buildFcReposContext();
    const ctx = {
      INSTRUCTION: 'Brief UNIQUEMENT sur AUJOURD\'HUI. 5 à 8 phrases max. Structure stricte : 1) FC repos 2) Météo si disponible 3) Conseils UNIQUEMENT pour les séances listées dans seances_today_liste. NE JAMAIS mentionner ni inventer de séances absentes de seances_today_liste. NE PAS résumer la semaine ni les performances passées.',
      type: 'brief_matin_court',
      date: todayStr,
      jour: joursNoms[dow] || '',
      fc_repos_bpm: state['fc_repos_' + todayStr] || state['fc_repos'] || null,
      fc_repos_moyenne_7j: fcCtxNotif.stats_7j ? fcCtxNotif.stats_7j.moyenne : null,
      fc_repos_note: fcCtxNotif.alerte_fatigue || null,
      meteo: meteoCtx || null,
      instruction_meteo: meteoCtx && meteoCtx.impact_performance && meteoCtx.impact_performance.elevation_fc_bpm > 0
        ? `CHALEUR AUJOURD'HUI ${meteoCtx.temperature}°C : impact FC +${meteoCtx.impact_performance.elevation_fc_bpm} bpm, perte perf -${meteoCtx.impact_performance.perte_perf_pct}%, ralentissement +${meteoCtx.impact_performance.ralent_sec_km} sec/km. ` +
          `Zone EF à viser : ${meteoCtx.impact_performance.zone_ef_ajustee}. CONSEIL OBLIGATOIRE : mentionner la chaleur et ses conséquences concrètes sur l'allure et la FC attendue.`
        : null,
      seances_today_liste: toutesSeancesAujourdHui.length > 0
        ? toutesSeancesAujourdHui.map(s => `${s.type.toUpperCase()}: ${s.titre}${s.km ? ' '+s.km+'km' : ''}${s.heure ? ' à '+s.heure : ''}${s.allure ? ' (allure: '+s.allure+')' : ''}`)
        : ['AUCUNE SÉANCE PLANIFIÉE AUJOURD\'HUI — ne pas inventer de séance'],
      seances_today_count: toutesSeancesAujourdHui.length,
      demain_premier_apercu: seancesJoursSuivants.length > 0 ? {
        titre: seancesJoursSuivants[0].titre,
        type: seancesJoursSuivants[0].type,
        km: seancesJoursSuivants[0].km,
        jour: seancesJoursSuivants[0].jour,
        heure: seancesJoursSuivants[0].heure || '',
        allure: seancesJoursSuivants[0].allure || null,
      } : null,
      type_semaine: [8,12,16,20,26,30].includes(CW) ? 'DÉCHARGE' : 'NORMALE',
      allure_ef_actuelle: getBestEfPace(),
      consigne_allure_aujourd_hui: [8,12,16,20,26,30].includes(CW)
        ? 'Semaine DÉCHARGE — allure EF lente, FC < 140 bpm'
        : 'Semaine normale — allure EF, FC 140-148 bpm',
      infos_importantes: memos || undefined,
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

    if(full) {
      addCoachMessage('coach', full);
      coachHistory.push({role: 'assistant', content: full, date: todayStr});
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
      addCoachMessage('coach', fallback);
      coachHistory.push({role: 'assistant', content: fallback, date: todayStr});
      saveCoachHistory();
    }
  } catch(e) {
    console.error('generateFullBriefFromNotif error:', e);
    // En cas d'erreur, tenter un message de secours construit localement
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

  // Fallback sur state local si Firebase échoue
  if (!p || !p.content) {
    try {
      const raw = state['_brief_pending'];
      if (raw) p = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch(e) {}
  }

  if (!p || !p.content) return false;

  // Vérifier que le brief n'est pas trop vieux
  // morning_brief : limité au jour même ; weekly_debrief : valable 2 jours (dimanche → lundi)
  if (p.date) {
    const briefDate = new Date(p.date);
    const todayDate = new Date(today);
    const diffDays = (todayDate - briefDate) / 86400000;
    const maxAge = (p.type === 'weekly_debrief') ? 2 : 0;
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
    if(full) {
      addCoachMessage('coach', full);
      coachHistory.push({role:'assistant', content: full, date: new Date().toISOString().slice(0,10)});
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
  div.style.cssText='display:flex;gap:8px;padding:0 0 12px 44px;animation:msg-enter 0.3s ease;';
  if(keepOnly){
    div.innerHTML=`<button onclick="dismissBrief()" style="padding:8px 18px;background:rgba(226,75,74,0.09);color:#C0392B;border:1.5px solid rgba(226,75,74,0.22);border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;letter-spacing:0.01em;">🗑️ Effacer le brief</button>`;
  } else {
    div.innerHTML=`<button onclick="dismissBrief()" style="padding:8px 18px;background:rgba(226,75,74,0.09);color:#C0392B;border:1.5px solid rgba(226,75,74,0.22);border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;">🗑️ Supprimer</button>`
      +`<button onclick="keepBrief()" style="padding:8px 18px;background:rgba(12,68,124,0.08);color:#0C447C;border:1.5px solid rgba(12,68,124,0.22);border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;">📌 Garder</button>`;
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

async function generateWeeklyBilanComplet(memos) {
  let seancesFaites = 0, seancesTotal = 0, kmFaits = 0, kmPlan = 0, seancesManquees = [], seancesFaitesDetail = [];
  weeks[CW-1].sessions.forEach((sess,si) => {
    if(state['del_w'+CW+'_s'+si]) return;
    if(sess.type === 'rest') return;
    seancesTotal++;
    kmPlan += sess.km;
    const done = !!state[gk(CW,si)+'done'];
    let perf=null;try{perf=state[gk(CW,si)+'perf']?JSON.parse(state[gk(CW,si)+'perf']):null;}catch(e){}
    if(done){
      seancesFaites++;
      kmFaits += state[gk(CW,si)+'km']||sess.km;
      seancesFaitesDetail.push({type:sess.type,titre:sess.d.split('|')[0],km:state[gk(CW,si)+'km']||sess.km,allure:perf?perf.pace:null,fc:perf?perf.hr:null});
    } else seancesManquees.push(sess.d.split('|')[0]);
  });
  {let ei=0;while(ei<=20&&state[`extra_w${CW}_s${ei}`]){
    let es;try{es=JSON.parse(state[`extra_w${CW}_s${ei}`]);}catch(e){ei++;continue;}
    if(!es){ei++;continue;}
    if(es.type!=='rest'&&es.km>0){
      seancesTotal++;
      kmPlan+=es.km;
      if(state[`extra_w${CW}_s${ei}_done`]){
        seancesFaites++;
        const ekm=state[`extra_w${CW}_s${ei}_km`]||es.km;
        let eperf=null;try{eperf=state[`extra_w${CW}_s${ei}_perf`]?JSON.parse(state[`extra_w${CW}_s${ei}_perf`]):null;}catch(e){}
        kmFaits+=ekm;
        seancesFaitesDetail.push({type:es.type,titre:es.d.split('|')[0],km:ekm,allure:eperf?eperf.pace:null,fc:eperf?eperf.hr:null,extra:true});
      }
    }
    ei++;
  }}
  const todayStr = new Date().toISOString().slice(0,10);
  const contextBilan = {
    semaine: CW,
    type_semaine: [8,12,16,20,26,30].includes(CW) ? 'DÉCHARGE' : 'CHARGE',
    date_marathon: '18 octobre 2026',
    semaines_restantes: 32-CW,
    semi_marathon: CW >= 20 ? {date:'07/09/2026', semaine:27, km:21, semaines_avant:27-CW} : undefined,
    seances_faites: seancesFaites,
    seances_total: seancesTotal,
    km_faits: Math.round(kmFaits*10)/10,
    km_plan: kmPlan,
    seances_manquees: seancesManquees,
    detail_seances: seancesFaitesDetail,
    renfo_semaine: [1,2].filter(r=>!!state[rfk(CW,r)+'done']).length + '/2 renfo faits',
    semaine_suivante: CW < 32 ? {numero:CW+1,km:getWeekTotalKm(CW+1),type:[8,12,16,20,26,30].includes(CW+1)?'DÉCHARGE':'CHARGE',nb_seances:weeks[CW].sessions.length} : null,
    allure_ef_semaine: getBestEfPace(),
    prediction_marathon: buildPredictionForCoach(),
    allure_marathon_cible: (()=>{ const p=buildMarathonPrediction(); return p&&p.amPaceRecoStr ? p.amPaceRecoStr : getMarathonPaceStr(); })(),
    temps_marathon_estime: (()=>{ const p=buildMarathonPrediction(); return p&&p.tempsStr ? p.tempsStr : calcMarathonTime(getMarathonPaceStr()); })(),
    fc_repos: state['fc_repos'] || 51,
    fc_repos_context: buildFcReposContext(),
    chaussures: (()=>{try{return getShoes().map(sh=>({name:sh.name,km:sh.km||0,max:sh.max||600}));}catch(e){return null;}})(),
    memos: memos||undefined,
    seances_supprimees: (()=>{const d=[];weeks[CW-1].sessions.forEach((s,si)=>{if(state['del_w'+CW+'_s'+si])d.push(s.d.split('|')[0]);});return d.length?d:null;})(),
    seances_recentes_detail: (()=>{try{const detail=[];for(let ws=CW; ws>=1; ws--){weeks[ws-1].sessions.forEach((sess,si)=>{const k=gk(ws,si);if(!state[k+"done"]) return;const perf=state[k+"perf"]?JSON.parse(state[k+"perf"]):{};const st=perf.strava||null;detail.push({semaine:ws,type:sess.type,titre:sess.d.split("|")[0],date:perf.date||null,km:state[k+"km"]||sess.km,allure:perf.pace||null,fc_moy:perf.hr||null,blocs_tempo:perf.blocsAllure||null,strava:st?{cadence_moy:st.cadence||st.cadence_moy||null,fc_max:st.fcMax||st.fc_max||null,denivele_pos:st.denivele_pos!=null?st.denivele_pos:null,best_400m:st.best_400m||null,calories:st.calories||null}:null});});let ei=0;while(ei<=20&&state["extra_w"+ws+"_s"+ei]){if(state["extra_w"+ws+"_s"+ei+"_done"]){const es=JSON.parse(state["extra_w"+ws+"_s"+ei]);const perf=state["extra_w"+ws+"_s"+ei+"_perf"]?JSON.parse(state["extra_w"+ws+"_s"+ei+"_perf"]):{};detail.push({semaine:ws,type:es.type,titre:es.d.split("|")[0],extra:true,date:perf.date||null,km:state["extra_w"+ws+"_s"+ei+"_km"]||es.km,allure:perf.pace||null,fc_moy:perf.hr||null});}ei++;}}return detail.slice(0,30);}catch(e){return[];}})(),
    resume_dernieres_semaines: (()=>{try{const rs=[];for(let ws=Math.max(1,CW-8);ws<CW;ws++){const sess=[];let kF=0,kP=0;weeks[ws-1].sessions.forEach((s,si)=>{if(state['del_w'+ws+'_s'+si])return;const k=gk(ws,si);const done=!!state[k+'done'];const p=state[k+'perf']?JSON.parse(state[k+'perf']):{};const kr=state[k+'km']!=null?state[k+'km']:s.km;if(done)kF+=kr;kP+=s.km;sess.push(s.type+(done?(' '+kr+'km'+(p.pace?'@'+p.pace:'')+(p.hr?'FC'+p.hr:'')):(ws<CW?' NON_FAITE':' à_faire')));});rs.push({semaine:ws,type:[8,12,16,20,26,30].includes(ws)?'DÉCHARGE':'CHARGE',km_fait:Math.round(kF*10)/10,km_plan:Math.round(kP*10)/10,seances:sess.join('|')});}return rs;}catch(e){return[];}})(),
    allure_ef_actuelle: getBestEfPace(),
    consignes_ef_semaine: [8,12,16,20,26,30].includes(CW)?'DÉCHARGE — récup prioritaire':'NORMALE — '+getBestEfPace()+'/km FC 140-148',
    absences_semaine: state['absences_cw'+CW]||null,
    infos_importantes_Guillaume: memos||undefined
  };
  setCoachUnread();
  addCoachMessage('coach', 'Bilan complet de ta semaine S'+CW+' en cours...');
  try {
    const h = await authHeaders(true);
    const response = await fetch('https://us-central1-prepa-marathon.cloudfunctions.net/weeklyReport', {method:'POST', headers:h, body:JSON.stringify({contextBilan})});
    if(!response.ok || !response.body) throw new Error('HTTP '+response.status);
    const container = document.getElementById('coach-messages');
    const lastMsg = container ? container.lastElementChild : null;
    const textEl = lastMsg ? lastMsg.querySelector('[data-coach-text]') : null;
    if(textEl) textEl.textContent = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText='', displayedText='', tokenQueue=[], streamDone=false, buf='';
    const MS=18;
    function flushBilan(){
      if(tokenQueue.length>0){const b=tokenQueue.length>20?3:1;for(let i=0;i<b&&tokenQueue.length>0;i++)displayedText+=tokenQueue.shift();if(textEl)textEl.textContent=fixAccents(displayedText);if(container)container.scrollTop=container.scrollHeight;}
      if(!streamDone||tokenQueue.length>0)setTimeout(flushBilan,MS);
      else if(textEl)textEl.innerHTML=renderCoachText(fixAccents(fullText));
    }
    setTimeout(flushBilan,MS);
    while(true){const {done,value}=await reader.read();if(done)break;buf+=decoder.decode(value,{stream:true});const lines=buf.split('\n');buf=lines.pop();for(const line of lines){if(!line.startsWith('data: '))continue;const data=line.slice(6).trim();if(data==='[DONE]')continue;try{const p=JSON.parse(data);if(p.token){fullText+=p.token;for(const c of p.token)tokenQueue.push(c);}}catch(e){}}}
    streamDone=true;
    if(fullText){
      coachHistory.push({role:'assistant', content:fullText, date:todayStr});
      saveCoachHistory();
    }
  } catch(e) {
    const container=document.getElementById('coach-messages');
    const lastMsg=container?container.lastElementChild:null;
    const textEl=lastMsg?lastMsg.querySelector('[data-coach-text]'):null;
    if(textEl) textEl.textContent='Bonne semaine S'+CW+' ! '+seancesFaites+'/'+seancesTotal+' séances réalisées.';
  }
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
  // On mémorise si on vient d'une notif pour ne pas afficher le message de bienvenue parasite
  const _fromPushNotif = window._coachOpenedFromNotif || false;
  window._coachOpenedFromNotif = false; // reset
  if (_pendingResult && !_needsFullBrief) {
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

    if (_pendingType === 'week_complete') {
      try { await dbRef.child('_brief_pending').remove(); } catch(e){}
      const _container = document.getElementById('coach-messages');
      if (_container) {
        const _div = document.createElement('div');
        _div.style.cssText = 'display:flex;justify-content:center;margin:8px 0 4px;';
        _div.innerHTML = '<button onclick="sendShortcut(&apos;📊 Fais-moi le bilan complet de ma semaine&apos;)" '
          + 'style="background:#0C447C;color:#fff;border:none;border-radius:20px;padding:9px 18px;'
          + 'font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">'
          + '📊 Voir le bilan complet</button>';
        _container.appendChild(_div);
        _container.scrollTop = _container.scrollHeight;
      }
      return;
    }

    // morning_brief / weekly_debrief : afficher le brief stocké
    if (_pendingType === 'morning_brief' || _pendingType === 'weekly_debrief') {
      if (_pendingResult.content) {
        // Attendre que le DOM coach soit totalement rendu
        await new Promise(r => setTimeout(r, 400));
        // Fonction d'affichage avec retry
        const _briefDate = new Date().toISOString().slice(0,10);
        const _showBrief = () => {
          const _msgContainer = document.getElementById('coach-messages');
          if (!_msgContainer) return false;
          addCoachMessage('coach', _pendingResult.content);
          // Tagger le dernier élément pour pouvoir le retrouver/supprimer
          const _lastMsg = _msgContainer.lastElementChild;
          if (_lastMsg) _lastMsg.dataset.briefDate = _briefDate;
          coachHistory.push({role:'assistant', content: _pendingResult.content, date: _briefDate, isBrief: true});
          saveCoachHistory();
          // Nettoyer après affichage réussi
          try { dbRef.child('_brief_pending').remove(); } catch(e){}
          delete state['_brief_pending'];
          // Afficher les boutons Garder / Supprimer
          setTimeout(() => _addBriefActionButtons(), 200);
          // Ouverture depuis notification → afficher le DÉBUT du brief (pas la fin)
          if (window._coachOpenedFromNotif && _lastMsg) {
            window._coachOpenedFromNotif = false;
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
        // ── Message météo asynchrone (pendant que l'utilisateur lit le brief) ──
        if (_pendingType === 'morning_brief') _appendWeatherMessageAfterBrief();
        // ── Bilan complet après le résumé push weekly_debrief ──
        if (_pendingType === 'weekly_debrief') setTimeout(() => generateWeeklyBilanComplet(_memos), 1500);
      }
      return;
    }
    // weekly_briefing → re-générer
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

      if(isMonday && isMorning && lastVisit !== todayStr) {
        try { dbRef.child(lastVisitKey).set(todayStr); } catch(e) {}

        // Construire le briefing semaine sans backticks
        const jours = ['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
        const seancesSemaine = [];
        weeks[CW-1].sessions.forEach((sess,si) => {
          if(state['del_w'+CW+'_s'+si]) return;
          const edRaw = state['edit_w'+CW+'_s'+si];
          let ed=null;try{ed=edRaw?JSON.parse(edRaw):null;}catch(e){}
          const titre = ed ? ed.d.split('|')[0] : sess.d.split('|')[0];
          const km = ed ? ed.km : sess.km;
          const jour = (ed && ed.sched_day) ? jours[ed.sched_day] : '';
          const heure = (ed && ed.sched_time) ? ed.sched_time : '';
          seancesSemaine.push(sess.type.toUpperCase()+' - '+titre+' '+km+'km'+(jour?' → '+jour:'')+(heure?' '+heure:''));
        });
        const kmTotal = getWeekTotalKm(CW);
        const isDechargeW = [8,12,16,20,26,30].includes(CW);
        // Données semaine précédente pour contexte IA
        let seancesPrecFaites = 0, seancesPrecTotal = 0;
        if(CW > 1){
          weeks[CW-2].sessions.forEach((sess,si)=>{
            if(sess.type==='rest') return;
            seancesPrecTotal++;
            if(state[gk(CW-1,si)+'done']) seancesPrecFaites++;
          });
        }
        const contextWeek = {
          semaine: CW,
          km_planifie: kmTotal,
          type_semaine: isDechargeW ? 'DÉCHARGE' : 'NORMALE',
          semaines_restantes: 32-CW,
          date_marathon: '18 octobre 2026',
          semi_marathon: CW >= 20 ? {date:'07/09/2026', semaine:27, km:21, semaines_avant:27-CW} : undefined,
          seances: seancesSemaine,
          bodyhit_lundi: 'lundi 12h30 — électrostimulation full body',
          renfo_semaine_precedente: CW>1 ? [1,2].filter(r=>!!state['rf'+(CW-1)+'r'+r+'done']).length+'/2 faits S'+(CW-1) : null,
          semaine_precedente: CW>1 ? {
            numero: CW-1,
            seances_faites: seancesPrecFaites,
            total: seancesPrecTotal,
            type: [8,12,16,20,26,30].includes(CW-1)?'DÉCHARGE':'CHARGE'
          } : null,
          semaine_suivante: CW < 32 ? {
            numero: CW+1,
            km: getWeekTotalKm(CW+1),
            type: [8,12,16,20,26,30].includes(CW+1)?'DÉCHARGE':'CHARGE'
          } : null,
          allure_ef_actuelle: getBestEfPace(),
          consignes_ef_semaine: [8,12,16,20,26,30].includes(CW)
            ? 'DÉCHARGE — allure EF entre '+(()=>{const s=paceStrToSec(getBestEfPace()||"6'40");return Math.floor((s+30)/60)+"'"+(((s+30)%60)+'').padStart(2,'0')+' et '+Math.floor((s+50)/60)+"'"+(((s+50)%60)+'').padStart(2,'0')})()+'  /km, FC < 140 bpm'
            : 'NORMALE — allure EF entre '+(()=>{const s=paceStrToSec(getBestEfPace()||"6'40");return Math.floor((s+20)/60)+"'"+(((s+20)%60)+'').padStart(2,'0')+' et '+Math.floor((s+40)/60)+"'"+(((s+40)%60)+'').padStart(2,'0')})()+'  /km, FC 140-148 bpm',
          prediction_marathon: buildPredictionForCoach(),
          allure_marathon_cible: (()=>{ const p=buildMarathonPrediction(); return p&&p.amPaceRecoStr ? p.amPaceRecoStr : getMarathonPaceStr(); })(),
          temps_marathon_estime: (()=>{ const p=buildMarathonPrediction(); return p&&p.tempsStr ? p.tempsStr : calcMarathonTime(getMarathonPaceStr()); })(),
          fc_repos: state['fc_repos'] || 51,
          fc_repos_context: buildFcReposContext(),
          chaussures: (()=>{try{return getShoes().map(sh=>({name:sh.name,km:sh.km||0,max:sh.max||600}));}catch(e){return null;}})(),
          memos: memos||undefined,
          bodyhit_semaine: (()=>{const _d=new Date();const _dow=_d.getDay()===0?7:_d.getDay();const _h=_d.getHours()+_d.getMinutes()/60;const _m=memos||'';const _rm=_m.match(/bodyhit[^,.]*?(lundi|mardi|mercredi|jeudi|vendredi)/i)||_m.match(/(lundi|mardi|mercredi|jeudi|vendredi)[^,.]*?bodyhit/i);const _jr=_rm?_rm[1].toLowerCase():null;const _jd={lundi:1,mardi:2,mercredi:3,jeudi:4,vendredi:5,samedi:6,dimanche:7};const _dw=_jr?_jd[_jr]:1;const _fait=_dow>_dw||(_dow===_dw&&_h>=12.5);return {fait:_fait,statut:_fait?'FAIT ('+(_jr||'lundi')+' 12h30)':'À VENIR ('+(_jr||'lundi')+' 12h30)',jour:_jr||'lundi',note:_jr?'Report détecté dans mémos: '+_jr:'Horaire normal lundi 12h30.'};})(),
          renfoStatus: [{r:1,name:'Ischio-fessiers'},{r:2,name:'Bas du dos'}].map(rd=>`${rd.name}: ${!!state[rfk(CW,rd.r)+'done']?'✓ fait':'à faire'}`).join(' | '),
          seances_supprimees: (()=>{const d=[];weeks[CW-1].sessions.forEach((s,si)=>{if(state['del_w'+CW+'_s'+si])d.push(s.d.split('|')[0]);});return d.length?d:null;})(),
    seances_recentes_detail: (()=>{try{const detail=[];for(let ws=CW; ws>=1; ws--){weeks[ws-1].sessions.forEach((sess,si)=>{const k=gk(ws,si);if(!state[k+"done"]) return;const perf=state[k+"perf"]?JSON.parse(state[k+"perf"]):{};const st=perf.strava||null;detail.push({semaine:ws,type:sess.type,titre:sess.d.split("|")[0],date:perf.date||null,km:state[k+"km"]||sess.km,allure:perf.pace||null,fc_moy:perf.hr||null,blocs_tempo:perf.blocsAllure||null,strava:st?{cadence_moy:st.cadence||st.cadence_moy||null,fc_max:st.fcMax||st.fc_max||null,denivele_pos:st.denivele_pos!=null?st.denivele_pos:null,best_400m:st.best_400m||null,calories:st.calories||null,splits_par_km:(st.splits||st.splits_par_km)?((st.splits||st.splits_par_km).filter(sp=>sp.distanceKm&&sp.distanceKm>=0.5).map(sp=>({km:sp.km,allure:sp.allure,fc:sp.fc}))):null}:null});});let ei=0;while(ei<=20&&state["extra_w"+ws+"_s"+ei]){if(state["extra_w"+ws+"_s"+ei+"_done"]){const es=JSON.parse(state["extra_w"+ws+"_s"+ei]);const perf=state["extra_w"+ws+"_s"+ei+"_perf"]?JSON.parse(state["extra_w"+ws+"_s"+ei+"_perf"]):{};detail.push({semaine:ws,type:es.type,titre:es.d.split("|")[0],extra:true,date:perf.date||null,km:state["extra_w"+ws+"_s"+ei+"_km"]||es.km,allure:perf.pace||null,fc_moy:perf.hr||null,blocs_tempo:perf.blocsAllure||null,strava:null});}ei++;}}return detail.slice(0,30);}catch(e){return[];}})(),
          resume_dernieres_semaines: (()=>{try{const rs=[];for(let ws=Math.max(1,CW-8);ws<CW;ws++){const sess=[];let kF=0,kP=0;weeks[ws-1].sessions.forEach((s,si)=>{if(state['del_w'+ws+'_s'+si])return;const k=gk(ws,si);const done=!!state[k+'done'];const p=state[k+'perf']?JSON.parse(state[k+'perf']):{};const kr=state[k+'km']!=null?state[k+'km']:s.km;if(done)kF+=kr;kP+=s.km;sess.push(s.type+(done?(' '+kr+'km'+(p.pace?'@'+p.pace:'')+(p.hr?'FC'+p.hr:'')):(ws<CW?' NON_FAITE':' à_faire')));});let exi=0;while(exi<=20&&state["extra_w"+ws+"_s"+exi]){const es=JSON.parse(state["extra_w"+ws+"_s"+exi]);if(es.km>0&&es.type!=='rest'){kP+=es.km;if(state["extra_w"+ws+"_s"+exi+"_done"]){const ekm=state["extra_w"+ws+"_s"+exi+"_km"]||es.km;kF+=ekm;const ep=state["extra_w"+ws+"_s"+exi+"_perf"]?JSON.parse(state["extra_w"+ws+"_s"+exi+"_perf"]):null;sess.push(es.type+' '+ekm+'km'+(ep&&ep.pace?'@'+ep.pace:''));}}exi++;}rs.push({semaine:ws,type:[8,12,16,20,26,30].includes(ws)?'DÉCHARGE':'CHARGE',km_fait:Math.round(kF*10)/10,km_plan:Math.round(kP*10)/10,renfo:[1,2].filter(r=>!!state['rf'+ws+'r'+r+'done']).length+'/2',seances:sess.join('|')});}return rs;}catch(e){return[];}})(),
          tendance_fc_ef: (()=>{try{const pts=[];for(let ws=Math.max(1,CW-6);ws<CW;ws++){weeks[ws-1].sessions.forEach((s,si)=>{if(s.type!=='ef')return;const k=gk(ws,si);const p=state[k+'perf']?JSON.parse(state[k+'perf']):null;if(p&&p.hr&&parseInt(p.hr)<=148)pts.push({ws,hr:parseInt(p.hr)});});}if(pts.length<3)return null;const f=pts.slice(0,3).reduce((a,b)=>a+b.hr,0)/3;const l=pts.slice(-3).reduce((a,b)=>a+b.hr,0)/3;const d=Math.round(l-f);return {tendance:d>3?'MONTANTE (+'+d+' bpm)':d<-3?'DESCENDANTE ('+d+' bpm)':'STABLE ('+d+' bpm)',nb:pts.length};}catch(e){return null;}})(),
          projection_sub4h: (()=>{const amSec=paceStrToSec(getMarathonPaceStr());const obj=Math.ceil(4*3600/42.195);return amSec?{ecart_sec:Math.round(amSec-obj),statut:amSec<=obj?'ATTEINT':amSec-obj<=10?'TRES_PROCHE':amSec-obj<=30?'DANS_CIBLE':'EN_COURS'}:null;})(),
          absences_semaine: state['absences_cw'+CW]||null,
          infos_importantes_Guillaume: memos||undefined
        };
        // Afficher un message provisoire pendant le chargement IA
        setCoachUnread();
        addCoachMessage('coach', 'Bonjour Guillaume ! Je prépare ton briefing S'+CW+'...');
        // Appel IA pour générer le message de bienvenue
        authHeaders(true).then(h=>fetch('https://us-central1-prepa-marathon.cloudfunctions.net/weeklyBriefing', {
          method: 'POST',
          headers: h,
          body: JSON.stringify({contextWeek})
        })).then(async response => {
          // Remplacer le message provisoire par le stream
          const container = document.getElementById('coach-messages');
          const lastMsg = container.lastElementChild;
          const textEl = lastMsg ? lastMsg.querySelector('[data-coach-text]') : null;
          if(textEl) textEl.textContent = '';
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let fullText = '', displayedText = '', tokenQueue = [], streamDone = false, buf = '';
          const MS = 18;
          function flush(){
            if(tokenQueue.length>0){const b=tokenQueue.length>20?3:1;for(let i=0;i<b&&tokenQueue.length>0;i++)displayedText+=tokenQueue.shift();if(textEl)textEl.innerHTML=renderCoachText(displayedText, true);if(container)container.scrollTop=container.scrollHeight;}
            if(!streamDone||tokenQueue.length>0)setTimeout(flush,MS);
            else if(textEl)textEl.innerHTML=renderCoachText(fixAccents(fullText));
          }
          setTimeout(flush,MS);
          while(true){
            const {done,value}=await reader.read();if(done)break;
            buf+=decoder.decode(value,{stream:true});
            const lines=buf.split('\n');buf=lines.pop();
            for(const line of lines){
              if(!line.startsWith('data: '))continue;
              const data=line.slice(6).trim();if(data==='[DONE]')continue;
              try{const p=JSON.parse(data);if(p.token){fullText+=p.token;for(const c of p.token)tokenQueue.push(c);}}catch(e){}
            }
          }
          streamDone=true;
          // Sauvegarder le briefing comme non lu jusqu'à ouverture Coach
          if(fullText) {
            coachHistory.push({role:'assistant', content: fullText, date: new Date().toISOString().slice(0,10)});
            saveCoachHistory();
            try { dbRef.child('_brief_pending').set({content: fullText, date: todayStr, type:'weekly_briefing'}); } catch(e){}
          }
        }).catch(()=>{
          const container=document.getElementById('coach-messages');
          const lastMsg=container?container.lastElementChild:null;
          const textEl=lastMsg?lastMsg.querySelector('[data-coach-text]'):null;
          const fallback='Bonne semaine S'+CW+' ! '+kmTotal+' km au programme. Des questions ?';
          if(textEl) textEl.textContent=fallback;
        });
      } else if(isSunday && isEvening && lastVisit !== todayStr) {
        // Bilan hebdomadaire dimanche soir — généré par l'IA
        try { dbRef.child(lastVisitKey).set(todayStr); } catch(e) {}
        let seancesFaites = 0, seancesTotal = 0, kmFaits = 0, kmPlan = 0, seancesManquees = [], seancesFaitesDetail = [];
        weeks[CW-1].sessions.forEach((sess,si) => {
          if(state['del_w'+CW+'_s'+si]) return;
          if(sess.type === 'rest') return;
          seancesTotal++;
          kmPlan += sess.km;
          const done = !!state[gk(CW,si)+'done'];
          let perf=null;try{perf=state[gk(CW,si)+'perf']?JSON.parse(state[gk(CW,si)+'perf']):null;}catch(e){}
          if(done){
            seancesFaites++;
            kmFaits += state[gk(CW,si)+'km']||sess.km;
            seancesFaitesDetail.push({type:sess.type,titre:sess.d.split('|')[0],km:state[gk(CW,si)+'km']||sess.km,allure:perf?perf.pace:null,fc:perf?perf.hr:null});
          } else seancesManquees.push(sess.d.split('|')[0]);
        });
        // Inclure les séances extra validées cette semaine
        {let ei=0;while(ei<=20&&state[`extra_w${CW}_s${ei}`]){
          let es;try{es=JSON.parse(state[`extra_w${CW}_s${ei}`]);}catch(e){ei++;continue;}
          if(!es){ei++;continue;}
          if(es.type!=='rest'&&es.km>0){
            seancesTotal++;
            kmPlan+=es.km;
            if(state[`extra_w${CW}_s${ei}_done`]){
              seancesFaites++;
              const ekm=state[`extra_w${CW}_s${ei}_km`]||es.km;
              let eperf=null;try{eperf=state[`extra_w${CW}_s${ei}_perf`]?JSON.parse(state[`extra_w${CW}_s${ei}_perf`]):null;}catch(e){}
              kmFaits+=ekm;
              seancesFaitesDetail.push({type:es.type,titre:es.d.split('|')[0],km:ekm,allure:eperf?eperf.pace:null,fc:eperf?eperf.hr:null,extra:true});
            }
          }
          ei++;
        }}
        const contextBilan = {
          semaine: CW,
          type_semaine: [8,12,16,20,26,30].includes(CW) ? 'DÉCHARGE' : 'CHARGE',
          date_marathon: '18 octobre 2026',
          semaines_restantes: 32-CW,
          semi_marathon: CW >= 20 ? {date:'07/09/2026', semaine:27, km:21, semaines_avant:27-CW} : undefined,
          seances_faites: seancesFaites,
          seances_total: seancesTotal,
          km_faits: Math.round(kmFaits*10)/10,
          km_plan: kmPlan,
          seances_manquees: seancesManquees,
          detail_seances: seancesFaitesDetail,
          renfo_semaine: [1,2].filter(r=>!!state[rfk(CW,r)+'done']).length + '/2 renfo faits',
          bodyhit_semaine_fait: (()=>{const _d=new Date();const _dow=_d.getDay()===0?7:_d.getDay();const _h=_d.getHours()+_d.getMinutes()/60;const _m=memos||'';const _rm=_m.match(/bodyhit[^,.]*?(lundi|mardi|mercredi|jeudi|vendredi)/i)||_m.match(/(lundi|mardi|mercredi|jeudi|vendredi)[^,.]*?bodyhit/i);const _jr=_rm?_rm[1].toLowerCase():null;const _jd={lundi:1,mardi:2,mercredi:3,jeudi:4,vendredi:5,samedi:6,dimanche:7};const _dw=_jr?_jd[_jr]:1;return _dow>_dw||(_dow===_dw&&_h>=12.5)?'OUI ('+(_jr||'lundi')+' 12h30)'+(_jr?' — report mémos':''):'NON';})(),
          semaine_suivante: CW < 32 ? {
            numero: CW+1,
            km: getWeekTotalKm(CW+1),
            type: [8,12,16,20,26,30].includes(CW+1)?'DÉCHARGE':'CHARGE',
            nb_seances: weeks[CW].sessions.length
          } : null,
          allure_ef_semaine: getBestEfPace(),
          prediction_marathon: buildPredictionForCoach(),
          allure_marathon_cible: (()=>{ const p=buildMarathonPrediction(); return p&&p.amPaceRecoStr ? p.amPaceRecoStr : getMarathonPaceStr(); })(),
          temps_marathon_estime: (()=>{ const p=buildMarathonPrediction(); return p&&p.tempsStr ? p.tempsStr : calcMarathonTime(getMarathonPaceStr()); })(),
          fc_repos: state['fc_repos'] || 51,
          fc_repos_context: buildFcReposContext(),
          chaussures: (()=>{try{return getShoes().map(sh=>({name:sh.name,km:sh.km||0,max:sh.max||600}));}catch(e){return null;}})(),
          memos: memos||undefined,
          seances_supprimees: (()=>{const d=[];weeks[CW-1].sessions.forEach((s,si)=>{if(state['del_w'+CW+'_s'+si])d.push(s.d.split('|')[0]);});return d.length?d:null;})(),
    seances_recentes_detail: (()=>{try{const detail=[];for(let ws=CW; ws>=1; ws--){weeks[ws-1].sessions.forEach((sess,si)=>{const k=gk(ws,si);if(!state[k+"done"]) return;const perf=state[k+"perf"]?JSON.parse(state[k+"perf"]):{};const st=perf.strava||null;detail.push({semaine:ws,type:sess.type,titre:sess.d.split("|")[0],date:perf.date||null,km:state[k+"km"]||sess.km,allure:perf.pace||null,fc_moy:perf.hr||null,blocs_tempo:perf.blocsAllure||null,strava:st?{cadence_moy:st.cadence||st.cadence_moy||null,fc_max:st.fcMax||st.fc_max||null,denivele_pos:st.denivele_pos!=null?st.denivele_pos:null,best_400m:st.best_400m||null,calories:st.calories||null,splits_par_km:(st.splits||st.splits_par_km)?((st.splits||st.splits_par_km).filter(sp=>sp.distanceKm&&sp.distanceKm>=0.5).map(sp=>({km:sp.km,allure:sp.allure,fc:sp.fc}))):null}:null});});let ei=0;while(ei<=20&&state["extra_w"+ws+"_s"+ei]){if(state["extra_w"+ws+"_s"+ei+"_done"]){const es=JSON.parse(state["extra_w"+ws+"_s"+ei]);const perf=state["extra_w"+ws+"_s"+ei+"_perf"]?JSON.parse(state["extra_w"+ws+"_s"+ei+"_perf"]):{};detail.push({semaine:ws,type:es.type,titre:es.d.split("|")[0],extra:true,date:perf.date||null,km:state["extra_w"+ws+"_s"+ei+"_km"]||es.km,allure:perf.pace||null,fc_moy:perf.hr||null,blocs_tempo:perf.blocsAllure||null,strava:null});}ei++;}}return detail.slice(0,30);}catch(e){return[];}})(),
          resume_dernieres_semaines: (()=>{try{const rs=[];for(let ws=Math.max(1,CW-8);ws<CW;ws++){const sess=[];let kF=0,kP=0;weeks[ws-1].sessions.forEach((s,si)=>{if(state['del_w'+ws+'_s'+si])return;const k=gk(ws,si);const done=!!state[k+'done'];const p=state[k+'perf']?JSON.parse(state[k+'perf']):{};const kr=state[k+'km']!=null?state[k+'km']:s.km;if(done)kF+=kr;kP+=s.km;sess.push(s.type+(done?(' '+kr+'km'+(p.pace?'@'+p.pace:'')+(p.hr?'FC'+p.hr:'')):(ws<CW?' NON_FAITE':' à_faire')));});let exi=0;while(exi<=20&&state["extra_w"+ws+"_s"+exi]){const es=JSON.parse(state["extra_w"+ws+"_s"+exi]);if(es.km>0&&es.type!=='rest'){kP+=es.km;if(state["extra_w"+ws+"_s"+exi+"_done"]){const ekm=state["extra_w"+ws+"_s"+exi+"_km"]||es.km;kF+=ekm;const ep=state["extra_w"+ws+"_s"+exi+"_perf"]?JSON.parse(state["extra_w"+ws+"_s"+exi+"_perf"]):null;sess.push(es.type+' '+ekm+'km'+(ep&&ep.pace?'@'+ep.pace:''));}}exi++;}rs.push({semaine:ws,type:[8,12,16,20,26,30].includes(ws)?'DÉCHARGE':'CHARGE',km_fait:Math.round(kF*10)/10,km_plan:Math.round(kP*10)/10,renfo:[1,2].filter(r=>!!state['rf'+ws+'r'+r+'done']).length+'/2',seances:sess.join('|')});}return rs;}catch(e){return[];}})(),
          allure_ef_actuelle: getBestEfPace(),
          consignes_ef_semaine: [8,12,16,20,26,30].includes(CW)?'DÉCHARGE — récup prioritaire':'NORMALE — '+getBestEfPace()+'/km FC 140-148',
          projection_sub4h: (()=>{const amSec=paceStrToSec(getMarathonPaceStr());const obj=Math.ceil(4*3600/42.195);return amSec?{ecart_sec:Math.round(amSec-obj),statut:amSec<=obj?'ATTEINT':amSec-obj<=10?'TRES_PROCHE':amSec-obj<=30?'DANS_CIBLE':'EN_COURS'}:null;})(),
          tendance_fc_ef: (()=>{try{const pts=[];for(let ws=Math.max(1,CW-6);ws<=CW;ws++){weeks[ws-1].sessions.forEach((s,si)=>{if(s.type!=='ef')return;const k=gk(ws,si);const p=state[k+'perf']?JSON.parse(state[k+'perf']):null;if(p&&p.hr&&parseInt(p.hr)<=148)pts.push({ws,hr:parseInt(p.hr)});});}if(pts.length<3)return null;const f=pts.slice(0,3).reduce((a,b)=>a+b.hr,0)/3;const l=pts.slice(-3).reduce((a,b)=>a+b.hr,0)/3;const d=Math.round(l-f);return {tendance:d>3?'MONTANTE (+'+d+' bpm)':d<-3?'DESCENDANTE ('+d+' bpm)':'STABLE ('+d+' bpm)',nb:pts.length};}catch(e){return null;}})(),
          absences_semaine: state['absences_cw'+CW]||null,
          infos_importantes_Guillaume: memos||undefined
        };
        setCoachUnread();
        addCoachMessage('coach', 'Bilan de ta semaine S'+CW+' en cours...');
        authHeaders(true).then(h=>fetch('https://us-central1-prepa-marathon.cloudfunctions.net/weeklyReport', {
          method: 'POST',
          headers: h,
          body: JSON.stringify({contextBilan})
        })).then(async response => {
          const container = document.getElementById('coach-messages');
          const lastMsg = container.lastElementChild;
          const textEl = lastMsg ? lastMsg.querySelector('[data-coach-text]') : null;
          if(textEl) textEl.textContent = '';
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let fullText = '', displayedText = '', tokenQueue = [], streamDone = false, buf = '';
          const MS = 18;
          function flushR(){
            if(tokenQueue.length>0){const b=tokenQueue.length>20?3:1;for(let i=0;i<b&&tokenQueue.length>0;i++)displayedText+=tokenQueue.shift();if(textEl)textEl.textContent=fixAccents(displayedText);if(container)container.scrollTop=container.scrollHeight;}
            if(!streamDone||tokenQueue.length>0)setTimeout(flushR,MS);
            else if(textEl)textEl.innerHTML=renderCoachText(fixAccents(fullText));
          }
          setTimeout(flushR,MS);
          while(true){
            const {done,value}=await reader.read();if(done)break;
            buf+=decoder.decode(value,{stream:true});
            const lines=buf.split('\n');buf=lines.pop();
            for(const line of lines){
              if(!line.startsWith('data: '))continue;
              const data=line.slice(6).trim();if(data==='[DONE]')continue;
              try{const p=JSON.parse(data);if(p.token){fullText+=p.token;for(const c of p.token)tokenQueue.push(c);}}catch(e){}
            }
          }
          streamDone=true;
          if(fullText) {
            coachHistory.push({role:'assistant', content: fullText, date: new Date().toISOString().slice(0,10)});
            saveCoachHistory();
            try { dbRef.child('_brief_pending').set({content: fullText, date: todayStr, type:'weekly_report'}); } catch(e){}
          }
        }).catch(()=>{
          const container=document.getElementById('coach-messages');
          const lastMsg=container?container.lastElementChild:null;
          const textEl=lastMsg?lastMsg.querySelector('[data-coach-text]'):null;
          if(textEl) textEl.textContent='Bonne semaine S'+CW+' ! '+seancesFaites+'/'+seancesTotal+' séances réalisées.';
        });
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
    const _forceBrief = _needsFullBrief || _fromPushNotif;
    const _notifTag = window._pendingNotifTag || '';
    window._pendingNotifTag = '';
    if (_fromPushNotif && _notifTag.includes('debrief')) {
      // Notif bilan hebdo : générer le bilan complet directement (même structure que brief matin)
      try { await generateWeeklyBilanComplet(memos); } catch(_e) {}
    } else {
      try { await checkMorningBrief(memos, _forceBrief); } catch(_e) {}
    }
  }
  // ── Si le brief a été "gardé" (keepBrief), réafficher le bouton Effacer (si pas expiré) ──
  // Indépendant de _briefShownToday : fonctionne aussi en navigation intra-session
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
              addCoachMessage('coach', _briefItem.content);
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
}
// Afficher un overlay de chargement jusqu'à ce que Firebase soit prêt
// ── PUSH NOTIFICATIONS ────────────────────────────────────────────────────────
// Clé publique VAPID — à remplacer après avoir généré la paire de clés
// (voir instructions dans index.js)
const VAPID_PUBLIC_KEY = 'BBuZrddbAa1bRVH27VTuKV5cUpAVa6tOQ5oznjLHcQ0iQBJ5afidjJOLTSmebGdi1v2vdnnPjR022492YoIH4J0';

