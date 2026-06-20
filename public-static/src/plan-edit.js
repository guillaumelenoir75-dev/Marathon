function getWeekTotalKm(ws){
  if(!isAdmin()){
    // Pour les athlètes : seulement leurs séances extra
    let total=0;
    let ei=0;
    while(state[`extra_w${ws}_s${ei}`]){try{total+=parseFloat(JSON.parse(state[`extra_w${ws}_s${ei}`]).km)||0;}catch(e){}ei++;}
    return Math.round(total*10)/10;
  }
  const w=weeks[ws-1];
  let total=0;
  w.sessions.forEach((_,si)=>{
    if(!state[`del_w${ws}_s${si}`]){
      const s=getSession(ws,si);
      total+=s.km;
    }
  });
  let ei=0;
  while(state[`extra_w${ws}_s${ei}`]){
    total+=JSON.parse(state[`extra_w${ws}_s${ei}`]).km||0;
    ei++;
  }
  return Math.round(total*10)/10;
}

function getOrderedWeekSessions(ws){
  // Athlètes : seulement leurs séances extra, pas le plan hardcodé de Guillaume
  if(!isAdmin()){
    const res=[];
    let ei=0;
    while(state[`extra_w${ws}_s${ei}`]){
      try{res.push({s:JSON.parse(state[`extra_w${ws}_s${ei}`]),si:'x'+ei,extra:true,ei});}catch(e){}
      ei++;
    }
    return res;
  }
  const baseOrder=weeks[ws-1].sessions.map((_,si)=>({si,extra:false})).filter(({si})=>!state[`del_w${ws}_s${si}`]);
  let ei=0;
  while(state[`extra_w${ws}_s${ei}`]){baseOrder.push({si:'x'+ei,extra:true,ei});ei++;}
  const sessionMatch=(a,b)=>!!a.extra===!!b.extra&&(a.extra?a.ei===b.ei:a.si===b.si);
  const savedOrder=state[`order_w${ws}`]?JSON.parse(state[`order_w${ws}`]).filter(Boolean):null;
  const ordered=savedOrder?savedOrder.map(o=>baseOrder.find(b=>sessionMatch(b,o))).filter(Boolean):[...baseOrder];
  // Add any new sessions not in saved order
  baseOrder.forEach(b=>{
    if(!ordered.find(o=>sessionMatch(o,b))) ordered.push(b);
  });
  return ordered.map(({si,extra,ei})=>{
    let s=extra?JSON.parse(state[`extra_w${ws}_s${ei}`]):getSession(ws,si);
    // Frac extra sauvées avec mauvais titre : correction à la volée
    if(s && s.type==='frac' && s.d && !s.d.startsWith('Fractionné')){
      const parts=s.d.split('|');
      const m=parts[0].match(/(\d+)[×x](\d+)/);
      const ft=m?`Fractionné ${m[1]}×${m[2]} min`:'Fractionné 6×2 min';
      s=Object.assign({},s,{d:parts.length>1?`${ft}|${parts[1]}`:ft});
    }
    return {s,si,extra,ei};
  });
}

function moveSession(ws, rowIdx, dir){
  const orderKey=`order_w${ws}`;
  const baseOrder=weeks[ws-1].sessions.map((_,si)=>({si,extra:false})).filter(({si})=>!state[`del_w${ws}_s${si}`]);
  let ei=0;
  while(state[`extra_w${ws}_s${ei}`]){baseOrder.push({si:'x'+ei,extra:true,ei});ei++;}

  // Utiliser baseOrder comme source de vérité pour les objets (structure normalisée)
  // sessionMatch tolère les anciens formats (sans champ extra:false explicite)
  const sessionMatch = (a, b) => !!a.extra === !!b.extra && (a.extra ? a.ei === b.ei : a.si === b.si);
  const savedRaw = state[orderKey] ? JSON.parse(state[orderKey]).filter(Boolean) : null;
  // Re-mapper sur baseOrder pour garantir la structure normalisée
  const current = savedRaw
    ? savedRaw.map(o => baseOrder.find(b => sessionMatch(b, o))).filter(Boolean)
    : [...baseOrder];
  // Ajouter les séances manquantes
  baseOrder.forEach(b => { if(!current.find(o => sessionMatch(o, b))) current.push(b); });

  const newOrder=[...current];
  const swapIdx=rowIdx+dir;
  if(swapIdx<0||swapIdx>=newOrder.length) return;
  [newOrder[rowIdx],newOrder[swapIdx]]=[newOrder[swapIdx],newOrder[rowIdx]];
  state[orderKey]=JSON.stringify(newOrder);
  save();
  rendered.plan=false;
  rendered.stats=false;
  renderPlan();
  renderHome();
}

function toggleWeek(s){if(openWeeks.has(s))openWeeks.delete(s);else openWeeks.add(s);renderPlan();}

function scrollToCurrentWeek(){
  const currentCard = document.querySelector('.plan-week-card.is-current');
  if(!currentCard) return;
  // getBoundingClientRect donne la position relative au viewport
  const rect = currentCard.getBoundingClientRect();
  const margin = 12;
  // Scroller la window (c'est elle qui scrolle, pas sc-plan)
  window.scrollBy({ top: rect.top - margin, behavior: 'smooth' });
}

function getRaceBlockInfo(){
  const ob = state.onboarding ? (typeof state.onboarding === 'string' ? JSON.parse(state.onboarding) : state.onboarding) : {};
  const course = ob.course || 'Marathon';
  const labelMap = {'5 km':'A5','10 km':'A10','Semi-marathon':'SEMI','Marathon':'AM'};
  const raceLabel = labelMap[course] || 'AM';
  if(ob.target_time){
    const tp = ob.target_time.split(':').map(Number);
    const ts = tp[0]*3600+tp[1]*60+(tp[2]||0);
    const dist = {'5 km':5,'10 km':10,'Semi-marathon':21.1,'Marathon':42.195}[course]||42.195;
    if(ts>0){const sec=ts/dist;const m=Math.floor(sec/60),s=Math.round(sec%60);return {label:raceLabel,pace:`${m}'${String(s).padStart(2,'0')}`,course};}
  }
  return {label:raceLabel, pace:getAmTrainingPace(), course};
}

function getSession(ws, si){
  const key = `edit_w${ws}_s${si}`;
  const sess = state[key] ? JSON.parse(state[key]) : weeks[ws-1].sessions[si];
  // Pour les séances Long : mettre à jour l'allure du bloc course dans le detail
  if(sess && sess.type === 'long' && sess.d && /(?:AM|A10|A5|ASEMI|SEMI)\s*@/.test(sess.d)) {
    const {label:raceLabel, pace:racePace} = getRaceBlockInfo();
    const updated = Object.assign({}, sess, {
      d: sess.d.replace(/(?:AM|A10|A5|ASEMI|SEMI)\s*@\s*[\d'':]+\/km/g, `${raceLabel} @ ${racePace}/km`)
    });
    return updated;
  }
  // Pour les séances Frac sauvées avec un mauvais titre : corriger à la volée
  if(sess && sess.type === 'frac' && sess.d && !sess.d.startsWith('Fractionné')) {
    const parts = sess.d.split('|');
    const repMatch = parts[0].match(/(\d+)[×x](\d+)/);
    const fixedTitle = repMatch ? `Fractionné ${repMatch[1]}×${repMatch[2]} min` : 'Fractionné 6×2 min';
    return Object.assign({}, sess, { d: parts.length > 1 ? `${fixedTitle}|${parts[1]}` : fixedTitle });
  }
  return sess;
}

function selectLongEfPace(pace){
  const inp=document.getElementById('long-ef-pace');
  if(inp){inp.value=pace;updateLongDuration();}
  highlightLongEfChip(pace);
}
function highlightLongEfChip(pace){
  document.querySelectorAll('[id^="long-ef-chip-"]').forEach(btn=>{
    const sel=btn.id==='long-ef-chip-'+pace.replace(':','-');
    btn.style.background=sel?'#3B6D11':'var(--bg2)';
    btn.style.color=sel?'#fff':'var(--muted)';
    btn.style.borderColor=sel?'#3B6D11':'var(--border)';
  });
}
function updateLongDuration(){
  const durEl=document.getElementById('long-duration-val');
  if(!durEl) return;
  const blocks=getLongBlocksData();
  if(!blocks||blocks.length===0){durEl.textContent='—';return;}
  const efField=document.getElementById('long-ef-pace');
  const efPaceRaw=(efField&&efField.value.trim())||getBestEfPace()||"6'40";
  const parsePaceStr=p=>{const m=(p||'').replace("'",'!').replace(':','!').match(/(\d+)!(\d+)/);return m?parseInt(m[1])+parseInt(m[2])/60:null;};
  const efPace=parsePaceStr(efPaceRaw);
  const {pace:racePaceRaw}=getRaceBlockInfo();
  const racePace=parsePaceStr(racePaceRaw)||parsePaceStr(getAmTrainingPace());
  if(!efPace||!racePace){durEl.textContent='—';return;}
  let totalMin=0;
  blocks.forEach(b=>totalMin+=(b.type!=='EF'?racePace:efPace)*b.km);
  const tsL=Math.round(totalMin*60),h=Math.floor(tsL/3600),m=Math.floor((tsL%3600)/60),sL=tsL%60;
  const baseL=h>0?h+'h'+String(m).padStart(2,'0')+"'":m+"'";
  durEl.textContent=baseL+(sL>0?String(sL).padStart(2,'0')+'"':'');
  // Synchroniser le header modal
  const hdrEl=document.querySelector('.modal-box p[style*="color:var(--blue)"][style*="font-weight:600"]');
  if(hdrEl&&hdrEl.textContent.includes('estimées')){
    hdrEl.textContent='⏱ ~'+(baseL+(sL>0?String(sL).padStart(2,'0')+'"':''))+' estimées';
  }
}

function renderLongBlocks(){
  const container=document.getElementById('long-blocks');
  const dataEl=document.getElementById('long-blocks-data');
  if(!container||!dataEl) return;
  let blocks=[];
  try{blocks=JSON.parse(dataEl.value.replace(/&quot;/g,'"'));}catch(e){return;}
  const {label:raceLabel,pace:racePace}=getRaceBlockInfo();
  container.innerHTML=blocks.map((b,i)=>{
    const isRace=b.type!=='EF';
    const dispLabel=isRace?raceLabel:'EF';
    const dispPace=isRace?racePace+'/km':'EF';
    const bg=isRace?'#534AB730':'#3B6D1130';
    const btnBg=isRace?'#EEEDFE':'#EAF3DE';
    const btnColor=isRace?'#1B4FD8':'#3B6D11';
    return `<div style="display:flex;align-items:center;gap:6px;">
      <div style="flex:1;display:flex;align-items:center;gap:8px;background:var(--bg);border-radius:12px;padding:10px 12px;border:2px solid ${bg};">
        <button onclick="toggleLongBlockType(${i})" style="padding:5px 12px;border-radius:20px;border:none;cursor:pointer;font-size:11px;font-weight:800;background:${btnBg};color:${btnColor};flex-shrink:0;">${dispLabel}</button>
        <div style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;">
          <button onclick="stepLongBlockKm(${i},-1)" style="width:28px;height:28px;border-radius:50%;border:1.5px solid var(--border);background:var(--bg);cursor:pointer;font-size:16px;color:var(--text);display:flex;align-items:center;justify-content:center;flex-shrink:0;">−</button>
          <span id="lb-km-${i}" style="font-size:20px;font-weight:700;color:var(--text);min-width:32px;text-align:center;">${b.km}</span>
          <button onclick="stepLongBlockKm(${i},1)" style="width:28px;height:28px;border-radius:50%;border:1.5px solid var(--border);background:var(--bg);cursor:pointer;font-size:16px;color:var(--text);display:flex;align-items:center;justify-content:center;flex-shrink:0;">+</button>
        </div>
        <span style="font-size:10px;color:var(--muted);flex-shrink:0;">${dispPace}</span>
      </div>
      <button onclick="removeLongBlock(${i})" style="background:none;border:none;cursor:pointer;color:#E24B4A;font-size:20px;padding:0 4px;flex-shrink:0;">×</button>
    </div>`;}).join('');
  updateLongBlocksTotal(blocks);
}

function updateLongBlocksTotal(blocks){
  const totalEl=document.getElementById('long-blocks-total');
  if(!totalEl) return;
  const total=Math.round(blocks.reduce((a,b)=>a+b.km,0)*10)/10;
  const kmEl=document.getElementById('edit-km')||document.getElementById('hm-km')||document.getElementById('add-km')||document.getElementById('exedit-km');
  const planned=parseFloat(kmEl?kmEl.value:0)||0;
  const diff=Math.round((total-planned)*10)/10;
  const ok=Math.abs(diff)<0.1;
  const color=ok?'#3B6D11':diff>0?'#E8530A':'#E24B4A';
  totalEl.style.color=color;
  totalEl.style.background=ok?'#EAF3DE':'#FDF0EB';
  totalEl.style.borderColor=color+'30';
  totalEl.textContent=ok?`✓ ${total} km — correspond à la distance planifiée`
    :diff>0?`⚠ ${total} km — ${diff} km de trop (prévu : ${planned} km)`
    :`⚠ ${total} km — il manque ${Math.abs(diff)} km (prévu : ${planned} km)`;
}

function getLongBlocksData(){
  const dataEl=document.getElementById('long-blocks-data');
  if(!dataEl) return [];
  try{return JSON.parse(dataEl.value.replace(/&quot;/g,'"'));}catch(e){return [];}
}
function setLongBlocksData(blocks){
  const dataEl=document.getElementById('long-blocks-data');
  if(dataEl) dataEl.value=JSON.stringify(blocks);
  renderLongBlocks();
}
function stepLongBlockKm(i, delta){
  const blocks=getLongBlocksData();
  blocks[i].km=Math.max(1, (blocks[i].km||1)+delta);
  // Mettre à jour juste l'affichage du km sans re-render complet
  const dataEl=document.getElementById('long-blocks-data');
  if(dataEl) dataEl.value=JSON.stringify(blocks);
  const kmEl=document.getElementById('lb-km-'+i);
  if(kmEl) kmEl.textContent=blocks[i].km;
  updateLongBlocksTotal(blocks);
}
function toggleLongBlockType(i){
  const blocks=getLongBlocksData();
  const {label:raceLabel}=getRaceBlockInfo();
  blocks[i].type=blocks[i].type==='EF'?raceLabel:'EF';
  setLongBlocksData(blocks);
}
function updateLongBlockKm(i,val){
  const blocks=getLongBlocksData();
  blocks[i].km=parseFloat(val)||1;
  const dataEl=document.getElementById('long-blocks-data');
  if(dataEl) dataEl.value=JSON.stringify(blocks);
  updateLongBlocksTotal(blocks);
}
function addLongBlock(){
  const blocks=getLongBlocksData();
  blocks.push({km:2,type:'EF'});
  setLongBlocksData(blocks);
}
function removeLongBlock(i){
  const blocks=getLongBlocksData();
  blocks.splice(i,1);
  setLongBlocksData(blocks);
}
function buildLongDetail(blocks){
  const {label:raceLabel,pace:racePace}=getRaceBlockInfo();
  const efField=document.getElementById('long-ef-pace');
  const efPace=efField&&efField.value.trim()?efField.value.trim():null;
  const detail=blocks.map(b=>`${b.km} ${b.type==='EF'?'EF':raceLabel}${b.type!=='EF'?' @ '+racePace+'/km':''}`).join(' · ');
  if(efPace && efPace !== (getBestEfPace()||'6:40')) return detail+' · EF @ '+efPace+'/km';
  return detail;
}


function buildSchedFieldsHtml(day, time){
  const days=['','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  const dayEmojis=['','😴','💪','🔥','💪','🏃','🏔','😴'];
  const opts=days.map((d,i)=>i===0
    ?`<option value="">Choisir...</option>`
    :`<option value="${i}" ${day==i?'selected':''}>${dayEmojis[i]} ${d}</option>`
  ).join('');
  const timeParts=(time||'08:00').split(':');
  const selH=parseInt(timeParts[0])||8;
  const selM=parseInt(timeParts[1])||0;
  const hourOpts=Array.from({length:24},(_,i)=>`<option value="${i}" ${selH===i?'selected':''}>${String(i).padStart(2,'0')}h</option>`).join('');
  const minOpts=['00','15','30','45'].map(m=>`<option value="${m}" ${String(selM).padStart(2,'0')===m?'selected':''}>${m}</option>`).join('');
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <div>
        <p style="font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:7px;">📆 Jour</p>
        <select id="sched-day" style="background:var(--bg);border:2px solid var(--border);border-radius:12px;padding:11px 12px;font-size:14px;font-weight:700;color:var(--text);width:100%;outline:none;cursor:pointer;">${opts}</select>
      </div>
      <div>
        <p style="font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:7px;">⏰ Heure</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <select id="sched-hour" style="background:var(--bg);border:2px solid var(--border);border-radius:12px;padding:11px 8px;font-size:14px;font-weight:700;color:var(--text);width:100%;outline:none;text-align:center;cursor:pointer;">${hourOpts}</select>
          <select id="sched-min" style="background:var(--bg);border:2px solid var(--border);border-radius:12px;padding:11px 8px;font-size:14px;font-weight:700;color:var(--text);width:100%;outline:none;text-align:center;cursor:pointer;">${minOpts}</select>
        </div>
      </div>
    </div>`;
}
function openPerfEditModal(ws, si){
  const s = getSession(ws, si);
  const k = gk(ws, si);
  let prev = state[k+'perf'] ? JSON.parse(state[k+'perf']) : {};
  // Injecter la météo à la volée si absente pour s11i2 (23/05 Villiers-Saint-Georges)
  if(ws===11 && si===2 && !prev.meteo){
    prev.meteo = {
      date:"2026-05-23",heure_cible:"11h00",ville:"Villiers-Saint-Georges",
      temperature:29.8,ressenti:32.1,humidite:58,vent_kmh:8.2,
      conditions:"Ciel dégagé ☀️",
      impact_performance:{
        niveau:"ELEVE",ralentissement:"20-40 sec/km",
        conseil:"Forte chaleur — allures ralenties normales.",
        elevation_fc_bpm:23,zone_ef_ajustee:"163-171 bpm",perte_perf_pct:14,ralent_sec_km:50,
        note_fc:"FC effective = FC mesurée − 23 bpm (Mora-Rodriguez). Zone EF chaleur : 163-171 bpm."
      }
    };
  }
  const kmVal = state[k+'km'] != null ? state[k+'km'] : s.km;
  const c = typeColor[s.type]||'#888';
  const bg = typeBg[s.type]||'#f5f5f5';
  const lbl = typeLabel[s.type]||'EF';
  const title = s.d.split('|')[0];
  const detail = s.d.split('|')[1]||'';
  const mc = document.getElementById('modal-container');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  // Champs blocs pour Tempo
  const titleMatch = title.match(/(\d+)[x\u00d7]/i);
  const nbBlocs = (s.type==='tempo'||s.type==='frac') ? (titleMatch?parseInt(titleMatch[1]):(s.type==='frac'?6:2)) : 0;
  const prevBlocs = prev.blocsAllure||[];
  let blocsHtml = '';
  if((s.type==='tempo'||s.type==='frac') && nbBlocs>0){
    const nbRows = Math.ceil(nbBlocs/3);
    blocsHtml = '<div style="margin-top:4px;"><p style="font-size:12px;font-weight:600;color:#1B4FD8;margin-bottom:8px;">\u26a1 Allure par bloc tempo</p>';
    for(let row=0;row<nbRows;row++){
      const start=row*3; const end=Math.min(start+3,nbBlocs); const count=end-start;
      blocsHtml += '<div style="display:grid;grid-template-columns:repeat('+count+',1fr);gap:8px;'+(row>0?'margin-top:8px;':'')+'">';
      for(let i=start;i<end;i++){
        blocsHtml += '<div><p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Bloc '+(i+1)+'</p>';
        blocsHtml += '<input type="text" id="pedit-bloc-'+i+'" value="'+(prevBlocs[i]||'')+'" placeholder="4:50" maxlength="5" style="background:var(--bg2);border:1.5px solid #1B4FD830;border-radius:var(--radius-sm);padding:10px;font-size:18px;font-weight:700;color:#1B4FD8;width:100%;outline:none;text-align:center;">';
        blocsHtml += '<p style="font-size:10px;color:var(--muted);margin-top:3px;text-align:center;">/km</p></div>';
      }
      blocsHtml += '</div>';
    }
    blocsHtml += '</div>';
  }

  overlay.innerHTML = `<div class="modal-box" style="max-height:90vh;overflow-y:auto;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:36px;height:36px;border-radius:9px;background:${bg};border:1.5px solid ${c}30;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span style="font-size:10px;font-weight:700;color:${c};">${lbl}</span>
        </div>
        <div>
          <p style="font-size:15px;font-weight:600;color:var(--text);">S${ws} · ${title}</p>
          <p style="font-size:11px;color:#3B6D11;font-weight:600;">✓ Séance validée — modifier les données</p>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <button id="strava-pedit-btn" onclick="importFromStravaForPerfEdit(${ws},${si})" style="display:flex;align-items:center;gap:5px;padding:7px 11px;background:${prev.strava?'#3B6D11':'#FC4C02'};border:none;border-radius:20px;color:#fff;font-size:11px;font-weight:700;cursor:pointer;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          ${prev.strava ? '✅ Strava' : '🟠 Strava'}
        </button>
        <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:24px;line-height:1;">×</button>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px;">
      <div>
        <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Date de la séance</p>
        <input type="date" id="pedit-date" value="${prev.date||''}"
          style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;font-size:15px;font-weight:600;color:var(--text);width:100%;outline:none;">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">KM réels</p>
          <input type="number" id="pedit-km" value="${kmVal}" min="0" max="99" step="0.5" oninput="calcPerfEditPace()"
            style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:11px;font-size:20px;font-weight:800;color:var(--text);width:100%;outline:none;text-align:center;">
          <p style="font-size:10px;color:var(--muted);margin-top:3px;text-align:center;">Prévu : ${s.km} km</p>
        </div>
        <div>
          <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Durée</p>
          <input type="text" inputmode="numeric" id="pedit-dur" value="${prev.dur||''}" placeholder="mm:ss" maxlength="7" oninput="onDurInput(this)"
            style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:11px;font-size:20px;font-weight:800;color:var(--text);width:100%;outline:none;text-align:center;">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Allure moy. <span style="font-size:10px;font-weight:400;">(auto ou manuel)</span></p>
          <input type="text" id="pedit-pace" value="${prev.pace||''}" placeholder="5:40" maxlength="5"
            style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:11px;font-size:20px;font-weight:800;color:var(--text);width:100%;outline:none;text-align:center;">
          <p style="font-size:10px;color:var(--muted);margin-top:3px;text-align:center;">/km</p>
        </div>
        <div>
          <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">FC moy. <span style="font-size:10px;font-weight:400;color:#aaa;">(optionnel)</span></p>
          <input type="number" id="pedit-hr" value="${prev.hr||''}" placeholder="—" min="50" max="220"
            style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:11px;font-size:20px;font-weight:800;color:var(--text);width:100%;outline:none;text-align:center;">
          <p style="font-size:10px;color:var(--muted);margin-top:3px;text-align:center;">bpm</p>
        </div>
      </div>
      ${blocsHtml}
      ${(()=>{
        // ── Bandeau météo de la séance ───────────────────────────────────────
        const mt = prev.meteo;
        if(!mt) return '';
        const impactColors  = {IDEAL:'#2E7D32',MODERE:'#E65100',ELEVE:'#C62828',EXTREME:'#B71C1C',HUMIDE:'#1565C0',FROID:'#37474F'};
        const impactLabels  = {IDEAL:'Idéal ✅',MODERE:'Chaleur modérée',ELEVE:'Forte chaleur',EXTREME:'Chaleur extrême ⚠️',HUMIDE:'Humide',FROID:'Froid'};
        const niveau        = mt.impact_performance?.niveau || 'IDEAL';
        const impactColor   = impactColors[niveau] || '#2E7D32';
        const impactLabel   = impactLabels[niveau] || niveau;
        const condIcon      = mt.conditions?.split(' ').pop() || '🌤️';
        const elevFC        = mt.impact_performance?.elevation_fc_bpm || 0;
        let html2 = '<div style="background:#FFF8E7;border-radius:12px;padding:12px 14px;border:1.5px solid #F5A62330;margin-top:4px;">';
        html2 += '<p style="font-size:11px;font-weight:700;color:#E65100;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">🌤️ Météo de la séance' + (mt.ville ? ' — ' + mt.ville : '') + (mt.heure_cible && mt.heure_cible !== "maintenant" ? ' à ' + mt.heure_cible : '') + '</p>';
        html2 += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">';
        html2 += '<div style="display:flex;align-items:center;gap:8px;"><span style="font-size:20px;">' + condIcon + '</span><div>';
        html2 += '<p style="font-size:13px;font-weight:700;color:#1a2e4a;margin:0;">' + mt.temperature + '°C</p>';
        html2 += '<p style="font-size:10px;color:#6B8DB5;margin:2px 0 0;">Ressenti ' + mt.ressenti + '°C</p>';
        html2 += '</div></div>';
        html2 += '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">';
        html2 += '<span style="background:rgba(12,68,124,0.08);border-radius:12px;padding:3px 9px;font-size:11px;color:#0C447C;">💧 ' + mt.humidite + '%</span>';
        html2 += '<span style="background:rgba(12,68,124,0.08);border-radius:12px;padding:3px 9px;font-size:11px;color:#0C447C;">💨 ' + mt.vent_kmh + ' km/h</span>';
        html2 += '<span style="background:' + impactColor + '18;border-radius:12px;padding:3px 9px;font-size:11px;font-weight:700;color:' + impactColor + ';">' + impactLabel + '</span>';
        if(elevFC > 0) html2 += '<span style="background:#FF6F0018;border-radius:12px;padding:3px 9px;font-size:11px;font-weight:600;color:#E65100;">❤️ FC +' + elevFC + ' bpm</span>';
        html2 += '</div></div>';
        html2 += '</div>';
        return html2;
      })()}
      ${(()=>{
        const st = prev.strava;
        if(!st) return '';
        let html = '<div style="background:#EDF5FF;border-radius:12px;padding:12px 14px;border:1.5px solid #1382E430;margin-top:4px;">';
        html += '<p style="font-size:11px;font-weight:700;color:#1382E4;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">📡 Données Strava importées</p>';
        const extras = [];
        if(st.cadence) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Cadence</p><p style="font-size:15px;font-weight:700;color:#1a2e4a;">${st.cadence} <span style="font-size:10px;font-weight:400;">pas/min</span></p></div>`);
        if(st.denivele_pos != null) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Dénivelé +</p><p style="font-size:15px;font-weight:700;color:#3B6D11;">${st.denivele_pos} <span style="font-size:10px;font-weight:400;">m</span></p></div>`);
        if(st.fcMax) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">FC max</p><p style="font-size:15px;font-weight:700;color:#E24B4A;">${st.fcMax} <span style="font-size:10px;font-weight:400;">bpm</span></p></div>`);
        if(st.calories) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Calories</p><p style="font-size:15px;font-weight:700;color:#E8530A;">${st.calories} <span style="font-size:10px;font-weight:400;">kcal</span></p></div>`);
        if(st.best_400m) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Meilleur 400m</p><p style="font-size:15px;font-weight:700;color:#1B4FD8;">${st.best_400m} <span style="font-size:10px;font-weight:400;">/km</span></p></div>`);
        if(st.puissance_moy) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Puissance</p><p style="font-size:15px;font-weight:700;color:#6B21A8;">${st.puissance_moy} <span style="font-size:10px;font-weight:400;">W</span></p></div>`);
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
        return html;
      })()}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:20px;">
      <button onclick="closeModal()" style="padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;color:var(--muted);cursor:pointer;">Annuler</button>
      <button onclick="savePerfEdit(${ws},${si})" style="padding:12px;background:#3B6D11;border:none;border-radius:var(--radius-sm);font-size:14px;font-weight:600;color:#fff;cursor:pointer;">✓ Enregistrer</button>
    </div>
  </div>`;
  overlay.onclick = e => { if(e.target===overlay) closeModal(); };
  _lockBodyScroll();
  mc.appendChild(overlay);
}

function calcPerfEditPace(){
  const kmEl = document.getElementById('pedit-km');
  const durEl = document.getElementById('pedit-dur');
  const paceEl = document.getElementById('pedit-pace');
  if(!kmEl||!durEl||!paceEl) return;
  const km = parseFloat(kmEl.value);
  const durStr = durEl.value.trim();
  if(!km||km<=0||!durStr) return;
  const parts = durStr.split(':');
  let totalMin;
  if(parts.length===3){ totalMin=parseInt(parts[0])*60+parseInt(parts[1])+(parseInt(parts[2])||0)/60; }
  else if(parts.length===2){ const l=parseInt(parts[0])||0,r=parseInt(parts[1])||0; totalMin=l>=10?l+r/60:l*60+r; }
  else return;
  if(totalMin<=0) return;
  const pMin=Math.floor(totalMin/km);
  const pSec=Math.round(((totalMin/km)-pMin)*60);
  paceEl.value=pMin+':'+(pSec+'').padStart(2,'0');
  paceEl.style.borderColor='#3B6D11';
}

function savePerfEdit(ws, si){
  const km = parseFloat(document.getElementById('pedit-km').value);
  const dur = (document.getElementById('pedit-dur').value||'').trim();
  const pace = (document.getElementById('pedit-pace').value||'').trim();
  const hr = parseInt(document.getElementById('pedit-hr').value)||null;
  const dateVal = (document.getElementById('pedit-date').value||'').trim();
  const k = gk(ws, si);
  const s = getSession(ws, si);
  if(!isNaN(km)&&km>=0) state[k+'km']=km;
  const perf = {};
  if(dur) perf.dur=dur;
  if(pace) perf.pace=pace;
  if(hr) perf.hr=hr;
  if(dateVal) perf.date=dateVal;
  // Conserver la météo existante si présente
  try {
    const existing = state[k+'perf'] ? (typeof state[k+'perf']==='string' ? JSON.parse(state[k+'perf']) : state[k+'perf']) : {};
    if(existing.meteo) perf.meteo = existing.meteo;
  } catch(e) {}
  // Blocs tempo/frac
  if(s.type==='tempo'||s.type==='frac'){
    const titleMatch=s.d.split('|')[0].match(/(\d+)[x\u00d7]/i);
    const nbBlocs=titleMatch?parseInt(titleMatch[1]):2;
    const blocsAllure=[];
    for(let i=0;i<nbBlocs;i++){
      const el=document.getElementById('pedit-bloc-'+i);
      blocsAllure.push(el&&el.value.trim()?el.value.trim():'');
    }
    if(blocsAllure.some(b=>b)) perf.blocsAllure=blocsAllure;
  }
  if(Object.keys(perf).length>0) {
    // Merger avec l'existant pour ne pas perdre les données Strava
    const existing = state[k+'perf'] ? JSON.parse(state[k+'perf']) : {};
    state[k+'perf'] = JSON.stringify({...existing, ...perf});
  }
  save();
  closeModal();
  rendered.plan=false;
  rendered.stats=false;
  if(document.getElementById('sc-plan').style.display!=='none') renderPlan();
  if(document.getElementById('sc-stats').style.display!=='none') renderStats();
}

function _buildTempoEditFields(ws, editReps, editDur, editRecup, editPMin, editPMax, detail) {
  const O = '#E8530A';
  return `
    <div class="modal-section">
      <div class="modal-section-label">🔥 Format des blocs</div>
      <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;">
        <div>
          <p style="font-size:10px;color:var(--muted);margin-bottom:6px;text-align:center;font-weight:600;">Répétitions</p>
          <input type="number" id="edit-reps" value="${editReps}" min="1" max="10" step="1" onchange="onTempoRepsChange('edit')"
            style="background:var(--bg);border:3px solid ${O};border-radius:12px;padding:12px;font-size:28px;font-weight:800;color:${O};width:100%;outline:none;text-align:center;">
        </div>
        <span style="font-size:26px;font-weight:800;color:${O};padding-top:22px;">×</span>
        <div>
          <p style="font-size:10px;color:var(--muted);margin-bottom:6px;text-align:center;font-weight:600;">Minutes</p>
          <input type="number" id="edit-dur" value="${editDur}" min="1" max="60" step="1" oninput="calcEfRestant()"
            style="background:var(--bg);border:3px solid ${O}60;border-radius:12px;padding:12px;font-size:28px;font-weight:800;color:${O};width:100%;outline:none;text-align:center;">
        </div>
      </div>
    </div>
    <div id="edit-recup-container" class="modal-section" style="display:${parseInt(editReps)>1?'block':'none'};">
      <div class="modal-section-label">⏱ Récupération</div>
      <div style="display:flex;align-items:center;gap:12px;">
        <input type="text" id="edit-recup" value="${editRecup}" placeholder="3:00" maxlength="5" oninput="calcEfRestant()"
          style="background:var(--bg);border:2px solid var(--border);border-radius:12px;padding:12px;font-size:26px;font-weight:800;color:var(--text);width:110px;outline:none;text-align:center;flex-shrink:0;">
        <span style="font-size:13px;color:var(--muted);line-height:1.4;">min:sec<br>entre les blocs</span>
      </div>
    </div>
    <div class="modal-section">
      <div class="modal-section-label" style="display:flex;justify-content:space-between;align-items:center;">
        <span>🎯 Allure cible /km</span>
        <label style="display:flex;align-items:center;gap:6px;font-weight:400;text-transform:none;letter-spacing:0;font-size:11px;color:var(--muted);cursor:pointer;">
          <input type="checkbox" id="edit-apply-format" style="width:14px;height:14px;cursor:pointer;accent-color:${O};"> Appliquer S${ws+1}→S32
        </label>
      </div>
      <div style="display:grid;grid-template-columns:1fr 28px 1fr;align-items:center;gap:8px;">
        <div>
          <p style="font-size:10px;color:var(--muted);margin-bottom:6px;text-align:center;font-weight:600;">Rapide</p>
          <input type="text" id="edit-pace-min" value="${editPMin}" placeholder="5:00" maxlength="5" oninput="calcEfRestant()"
            style="background:var(--bg);border:3px solid ${O};border-radius:12px;padding:12px;font-size:22px;font-weight:800;color:${O};width:100%;outline:none;text-align:center;">
        </div>
        <div style="text-align:center;color:var(--muted);font-size:18px;font-weight:700;padding-top:22px;">—</div>
        <div>
          <p style="font-size:10px;color:var(--muted);margin-bottom:6px;text-align:center;font-weight:600;">Lente</p>
          <input type="text" id="edit-pace-max" value="${editPMax}" placeholder="5:20" maxlength="5"
            style="background:var(--bg);border:3px solid ${O}50;border-radius:12px;padding:12px;font-size:22px;font-weight:800;color:${O};width:100%;outline:none;text-align:center;">
        </div>
      </div>
      <div style="margin-top:10px;display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="edit-apply-all" style="width:14px;height:14px;cursor:pointer;accent-color:${O};">
        <label for="edit-apply-all" style="font-size:11px;color:var(--muted);cursor:pointer;">Appliquer cette allure aux Tempo suivantes</label>
      </div>
    </div>
    <div class="modal-section">
      <div class="modal-section-label" style="color:#3B6D11;">🟢 Allure EF — échauffement · récup · fin</div>
      <div style="display:flex;align-items:stretch;gap:12px;margin-bottom:14px;">
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;">
          <input type="text" id="edit-ef-pace" value="${(()=>{const m=detail.match(/EF\s*[@\s]\s*(\d+)[''\':](\d+)/i);return m?m[1]+':'+m[2]:getBestEfPace()||'6:40';})()}" maxlength="5" oninput="calcEfRestant()"
            style="background:var(--bg);border:3px solid #3B6D11;border-radius:14px;padding:13px 10px;font-size:30px;font-weight:900;color:#3B6D11;width:104px;outline:none;text-align:center;line-height:1;">
          <p style="font-size:9px;color:#3B6D11;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;">/km</p>
        </div>
        <div style="flex:1;display:flex;flex-wrap:wrap;align-content:center;gap:6px;">
          ${['6:20','6:10','6:00','5:50','5:40','5:30'].map(p=>'<button type="button" id="edit-ef-chip-'+p.replace(':','-')+'" onclick="selectTempoEfPace(&quot;edit&quot;,&quot;'+p+'&quot;)" style="padding:6px 10px;border-radius:20px;font-size:12px;font-weight:700;border:1.5px solid var(--border);background:var(--bg);color:var(--muted);cursor:pointer;transition:all 0.15s;">'+p+'</button>').join('')}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="modal-stat-card" style="background:#EEF2FD;border:none;">
          <div class="modal-stat-label" style="color:#1B4FD8;">⏱ Durée totale</div>
          <div class="modal-stat-value" style="color:#1B4FD8;" id="edit-tempo-duration">—</div>
        </div>
        <div class="modal-stat-card" style="background:#EAF3DE;border:none;">
          <div class="modal-stat-label" style="color:#3B6D11;">🏁 EF de fin</div>
          <div class="modal-stat-value" style="color:#3B6D11;" id="edit-ef-fin">—</div>
        </div>
      </div>
    </div>
    <div id="ef-restant-display" style="display:none;"></div>
  `;
}

function openPerfEditExtraModal(ws, ei){
  const s = JSON.parse(state[`extra_w${ws}_s${ei}`]||'{}');
  const prev = state[`extra_w${ws}_s${ei}_perf`] ? JSON.parse(state[`extra_w${ws}_s${ei}_perf`]) : {};
  const title = (s.d||'').split('|')[0];
  const _hacc = {ef:'#3B6D11',tempo:'#E8530A',frac:'#C4141B',long:'#534AB7'}[s.type]||'#1B4FD8';
  const _hcls = {ef:'modal-header-ef',tempo:'modal-header-tempo',frac:'modal-header-frac',long:'modal-header-long'}[s.type]||'modal-header-default';
  const mc = document.getElementById('modal-container');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.setProperty('--_overlay-bg','rgba(0,0,0,0.4)');
  overlay.innerHTML = `<div class="modal-box" style="max-height:92vh;">
    <div class="modal-header ${_hcls}" style="flex-shrink:0;">
      <div style="width:36px;height:4px;border-radius:4px;background:rgba(255,255,255,0.3);margin:0 auto 12px;"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <p style="font-size:10px;font-weight:800;opacity:0.7;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:3px;color:#fff;">S${ws} · Séance extra validée</p>
          <p style="font-size:20px;font-weight:900;letter-spacing:-0.02em;color:#fff;">${title}</p>
          <p style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:3px;">${s.km} km planifiés</p>
        </div>
        <button onclick="closeModal()" style="background:rgba(255,255,255,0.2);border:none;cursor:pointer;color:#fff;font-size:18px;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">×</button>
      </div>
    </div>
    <div class="modal-scroll-body">
    <div style="padding:16px 16px 0;">
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">KM réels</p>
            <input type="number" id="pex-km" value="${state[`extra_w${ws}_s${ei}_km`]||s.km}" min="0" max="99" step="1"
              style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:11px;font-size:20px;font-weight:800;color:var(--text);width:100%;outline:none;text-align:center;">
          </div>
          <div>
            <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Durée</p>
            <input type="text" id="pex-dur" value="${prev.dur||''}" placeholder="47:53" maxlength="7"
              style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:11px;font-size:20px;font-weight:800;color:var(--text);width:100%;outline:none;text-align:center;">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Allure moy.</p>
            <input type="text" id="pex-pace" value="${prev.pace||''}" placeholder="5:40" maxlength="5"
              style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:11px;font-size:20px;font-weight:800;color:var(--text);width:100%;outline:none;text-align:center;">
            <p style="font-size:10px;color:var(--muted);margin-top:3px;text-align:center;">/km</p>
          </div>
          <div>
            <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">FC moyenne</p>
            <input type="number" id="pex-hr" value="${prev.hr||''}" placeholder="145" min="50" max="220"
              style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:11px;font-size:20px;font-weight:800;color:var(--text);width:100%;outline:none;text-align:center;">
            <p style="font-size:10px;color:var(--muted);margin-top:3px;text-align:center;">bpm</p>
          </div>
        </div>
      </div>
      <div style="padding:0 0 28px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:20px;">
          <button onclick="closeModal()" style="padding:13px;background:var(--bg2);border:1.5px solid var(--border);border-radius:14px;font-size:13px;font-weight:700;color:var(--muted);cursor:pointer;">Annuler</button>
          <button onclick="_savePerfExtra(${ws},${ei})" style="padding:13px;background:${_hacc};border:none;border-radius:14px;font-size:14px;font-weight:800;color:#fff;cursor:pointer;">✅ Enregistrer</button>
        </div>
      </div>
    </div>
    </div>
  </div>`;
  overlay.onclick = e => { if(e.target===overlay) closeModal(); };
  _lockBodyScroll();
  mc.appendChild(overlay);
  _initSwipeToDismiss(overlay, overlay.querySelector('.modal-box'));
}

function _savePerfExtra(ws, ei){
  const km = parseFloat((document.getElementById('pex-km')||{}).value);
  const dur = ((document.getElementById('pex-dur')||{}).value||'').trim();
  const pace = ((document.getElementById('pex-pace')||{}).value||'').trim();
  const hr = parseInt((document.getElementById('pex-hr')||{}).value)||null;
  const k = `extra_w${ws}_s${ei}`;
  if(!isNaN(km)&&km>=0) state[k+'_km'] = km;
  const perf = state[k+'_perf'] ? JSON.parse(state[k+'_perf']) : {};
  if(dur) perf.dur=dur; else delete perf.dur;
  if(pace) perf.pace=pace; else delete perf.pace;
  if(hr) perf.hr=hr; else delete perf.hr;
  if(Object.keys(perf).length>0) state[k+'_perf']=JSON.stringify(perf);
  else delete state[k+'_perf'];
  save(); closeModal(); rendered.plan=false; rendered.stats=false; renderPlan(); renderHome();
  if(_adminPreviewUid) _refreshAthleteCoachView();
}
