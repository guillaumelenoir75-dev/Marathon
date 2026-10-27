// Km cumulés d'une paire. Plan Seine-Eure écrit en dur : tableau de référence + séances cochées de la semaine.
// Prépa générée : km reportés des prépas précédentes (shoe_km_*, figés par prepApplyNew) + séances faites de la prépa en cours.
const SHOE_KM_HARD=[[16,46,69,87,110,126,142,157,174,192,211,228,247,267,287,305,325,346,367,386,396,416,439,459,479,488,498,508,516,533,541,546],[0,0,0,0,0,9,20,29,39,51,65,77,93,110,128,142,160,180,202,216,230,230,230,245,263,263,263,287,287,303,315,315],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,25,56,66,106,106,115,161]];
function _shoeDoneKm(name, ws){
  let t=0;
  getOrderedWeekSessions(ws).forEach(({s,ei})=>{
    if(s.shoe!==name||!state[`extra_w${ws}_s${ei}_done`]) return;
    const v=parseFloat(state[`extra_w${ws}_s${ei}_km`]);
    t+=isNaN(v)?(parseFloat(s.km)||0):v;
  });
  return t;
}
function shoeKmTotal(name){
  const idx=[P,S,Z].indexOf(name);
  let base=parseFloat(state['shoe_km_'+name]), t;
  if(usesHardPlan()){
    t=(idx>=0?(SHOE_KM_HARD[idx][CW-2]||0):(isNaN(base)?0:base))+_shoeDoneKm(name,CW);
  } else {
    // admin passé à une prépa générée sans report figé : km de fin de Seine-Eure
    if(isNaN(base)) base=(isAdmin()&&idx>=0)?SHOE_KM_HARD[idx][SHOE_KM_HARD[idx].length-1]:0;
    t=base;
    for(let ws=1;ws<=getEffectiveCW();ws++) t+=_shoeDoneKm(name,ws);
  }
  return Math.round(t*10)/10;
}

// Paire attribuée par type de séance (state._shoe_rules, ex. EF → GRVL, séances rapides → Adios) ; null si pas de règle
function shoeForType(type){
  let r={}; try{ r=JSON.parse(state._shoe_rules||'{}')||{}; }catch(e){}
  const name=r[type]||null;
  return name&&getShoes().some(sh=>sh.name===name&&!sh.retired)?name:null;
}
// Applique les règles aux séances de la prépa en cours (toutes, ou seulement celles sans paire) ; renvoie les clés modifiées
function applyShoeRules(onlyEmpty){
  const up={};
  Object.keys(state).forEach(k=>{
    if(!/^extra_w\d+_s\d+$/.test(k)) return;
    let x; try{ x=JSON.parse(state[k]); }catch(e){ return; }
    if(!x||(onlyEmpty&&x.shoe)) return;
    const sh=shoeForType(x.type);
    if(sh&&x.shoe!==sh){ x.shoe=sh; up[k]=state[k]=JSON.stringify(x); }
  });
  return up;
}
// Règles de chaussures pour le Coach (prépa générée)
function shoeRulesText(){
  let r={}; try{ r=JSON.parse(state._shoe_rules||'{}')||{}; }catch(e){}
  const lab={ef:'EF',long:'sorties longues',frac:'fractionné',tempo:'tempo',race:'course'}, by={};
  Object.keys(r).forEach(t=>{ (by[r[t]]=by[r[t]]||[]).push(lab[t]||t); });
  const parts=Object.keys(by).map(n=>n+' : '+by[n].join(', '));
  const ret=getShoes().filter(sh=>sh.retired).map(sh=>sh.name);
  if(!parts.length&&!ret.length) return undefined;
  return (parts.length?'Paire attribuée par type de séance — '+parts.join(' · ')+'.':'')+(ret.length?' Paires retirées, à ne plus conseiller : '+ret.join(', ')+'.':'');
}
// Chaussures d'octobre 2026 (km Strava au 27/10) : GRVL pour l'endurance, Adios Pro 4 pour le rapide,
// Pegasus et Kiprun retirées. Appliqué une fois sur la prépa en cours de l'admin.
const SHOES_OCT_2026=[
  {name:'Salomon Aero Glide 4 GRVL',short:'GRVL',color:'#3B6D11',max:800,km:183.6},
  {name:'Adidas Adios Pro 4',short:'Adios',color:'#E8530A',max:500,km:112.9},
  {name:'Salomon Aero Glide 4',short:'Aero Glide',color:'#D4537E',max:800,km:405.4},
  {name:'Nike Pegasus 41',short:'Pegasus',color:'#1438A8',max:800,km:427.3,retired:true},
  {name:'Kiprun TR2',short:'Kiprun',color:'#888780',max:800,km:180.4,retired:true}];
function shoesUpdateOct2026(){
  if(!isAdmin()||usesHardPlan()||(typeof _prepView!=='undefined'&&_prepView)||state._shoes_v2) return;
  const G=SHOES_OCT_2026[0].name, A=SHOES_OCT_2026[1].name;
  const up={_shoes_v2:true};
  up._shoes=state._shoes=JSON.stringify(SHOES_OCT_2026.map(({km,...sh})=>sh));
  up._shoe_rules=state._shoe_rules=JSON.stringify({ef:G,long:G,frac:A,tempo:A,race:A});
  Object.assign(up,applyShoeRules(false));
  // report = km Strava − km déjà comptés dans la prépa en cours : le total affiché est celui de Strava
  SHOES_OCT_2026.forEach(sh=>{
    let done=0; for(let ws=1;ws<=getEffectiveCW();ws++) done+=_shoeDoneKm(sh.name,ws);
    up['shoe_km_'+sh.name]=state['shoe_km_'+sh.name]=Math.round((sh.km-done)*100)/100;
  });
  state._shoes_v2=true;
  try{ if(dbRef) dbRef.update(up).catch(()=>{}); }catch(e){}
  if(typeof rendered!=='undefined'){ rendered.stats=false; rendered.plan=false; }
}
function updateShoeMax(name, val){
  const arr=getShoes();
  const sh=arr.find(s=>s.name===name);
  if(sh){sh.max=parseInt(val)||600;saveShoes(arr);rendered.stats=false;renderStats();}
}
let _pendingDeleteShoe=null;
function deleteShoe(name){
  _pendingDeleteShoe=name;
  const mc=document.getElementById('modal-container');
  const ov=document.createElement('div');
  ov.className='modal-overlay';
  ov.style.setProperty('--_overlay-bg','rgba(0,0,0,0.45)');
  ov.innerHTML=`<div class="modal-box" style="padding:28px 20px 20px;text-align:center;">
    <div style="width:36px;height:4px;background:var(--border);border-radius:4px;margin:0 auto 20px;"></div>
    <div style="width:48px;height:48px;background:#FEF2F2;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>
    </div>
    <p style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:6px;">Supprimer cette paire ?</p>
    <p style="font-size:13px;color:var(--muted);margin-bottom:22px;">${name}</p>
    <button onclick="_doDeleteShoe()" style="width:100%;padding:13px;background:#FEF2F2;color:#DC2626;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:8px;">Supprimer</button>
    <button onclick="closeModal()" style="width:100%;padding:13px;background:var(--bg2);color:var(--muted);border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;">Annuler</button>
  </div>`;
  ov.onclick=e=>{if(e.target===ov)closeModal();};
  _lockBodyScroll();
  mc.appendChild(ov);
  _initSwipeToDismiss(ov,ov.querySelector('.modal-box'));
}
function _doDeleteShoe(){
  const name=_pendingDeleteShoe; _pendingDeleteShoe=null;
  closeModal();
  const arr=getShoes().filter(s=>s.name!==name);
  saveShoes(arr);
  rendered.stats=false;
  renderStats();
  renderHome();
  showToast('Paire supprimée','🗑️');
}
function _shoeModalHtml({title, namePlaceholder='ex: Nike Pegasus 41', nameVal='', color='#1438A8', maxVal=600, saveBtn, colors=['#1438A8','#E8530A','#3B6D11','#534AB7','#D4537E','#C4960A','#888780','#0C447C']}){
  const colorBtns=colors.map(c=>`<button type="button" onclick="selectShoeColor('${c}')" id="sc-${c.replace('#','')}"
    style="width:36px;height:36px;border-radius:50%;background:${c};border:3px solid ${c===color?'#fff':'transparent'};cursor:pointer;transition:all 0.15s;box-shadow:${c===color?'0 0 0 2px '+c:'none'};flex-shrink:0;"
    ></button>`).join('');
  const maxOptions=[400,500,600,700,800,1000];
  const maxBtns=maxOptions.map(v=>`<button type="button" onclick="selectShoeMax(${v})" id="sm-${v}"
    style="flex:1;padding:8px 4px;border-radius:10px;border:1.5px solid ${v===maxVal?'#1B4FD8':'var(--border)'};background:${v===maxVal?'#EEF2FD':'var(--bg2)'};color:${v===maxVal?'#1B4FD8':'var(--muted)'};font-size:12px;font-weight:700;cursor:pointer;">
    ${v}</button>`).join('');
  return `<div class="modal-box" style="max-height:90vh;overflow-y:auto;">
    <div style="background:linear-gradient(135deg,#0C447C,#1B4FD8);padding:20px 20px 16px;border-radius:var(--radius) var(--radius) 0 0;flex-shrink:0;">
      <div style="width:36px;height:4px;border-radius:4px;background:rgba(255,255,255,0.3);margin:0 auto 14px;"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <p style="font-size:10px;font-weight:800;opacity:0.7;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px;color:#fff;">👟 Chaussures</p>
          <p style="font-size:20px;font-weight:900;letter-spacing:-0.02em;color:#fff;">${title}</p>
        </div>
        <button onclick="closeModal()" style="background:rgba(255,255,255,0.2);border:none;cursor:pointer;color:#fff;font-size:18px;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">×</button>
      </div>
      <div id="shoe-preview-strip" style="margin-top:14px;height:6px;border-radius:4px;background:rgba(255,255,255,0.2);overflow:hidden;">
        <div id="shoe-preview-bar" style="height:100%;width:100%;background:${color};border-radius:4px;transition:background 0.2s;"></div>
      </div>
    </div>
    <div style="padding:16px;display:flex;flex-direction:column;gap:14px;">
      <div>
        <p style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;">Nom</p>
        <input type="text" id="new-shoe-name" placeholder="${namePlaceholder}" value="${nameVal}"
          style="background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:12px 14px;font-size:16px;font-weight:600;color:var(--text);width:100%;outline:none;box-sizing:border-box;"
          oninput="document.getElementById('shoe-preview-bar')&&(document.getElementById('shoe-preview-bar').style.background=document.getElementById('new-shoe-color').value)">
      </div>
      <div>
        <p style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em;">Couleur</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;" id="shoe-color-picker">${colorBtns}</div>
        <input type="hidden" id="new-shoe-color" value="${color}">
      </div>
      <div>
        <p style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Durée de vie (km)</p>
        <p style="font-size:11px;color:var(--muted);margin-bottom:8px;">Distance maximale recommandée par le fabricant</p>
        <div style="display:flex;gap:6px;" id="shoe-max-picker">${maxBtns}</div>
        <input type="hidden" id="new-shoe-max" value="${maxVal}">
      </div>
      <p id="shoe-add-error" style="display:none;color:var(--error,#DC2626);font-size:12px;text-align:center;margin:0;"></p>
      <button onclick="${saveBtn}" style="width:100%;padding:14px;background:#1B4FD8;border:none;border-radius:14px;font-size:15px;font-weight:800;color:#fff;cursor:pointer;letter-spacing:-0.01em;">${title}</button>
    </div>
  </div>`;
}

function openAddShoeModal(){
  const mc=document.getElementById('modal-container');
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.style.setProperty('--_overlay-bg','rgba(0,0,0,0.4)');
  overlay.innerHTML=_shoeModalHtml({title:'Nouvelle paire', saveBtn:'saveNewShoe()'});
  overlay.onclick=e=>{if(e.target===overlay)closeModal();};
  _lockBodyScroll();
  mc.appendChild(overlay);
  _initSwipeToDismiss(overlay, overlay.querySelector('.modal-box'));
  selectShoeColor('#1438A8');
}

function selectShoeColor(c){
  document.getElementById('new-shoe-color').value=c;
  document.querySelectorAll('[id^="sc-"]').forEach(btn=>{
    btn.style.border='3px solid transparent';
    btn.style.boxShadow='none';
  });
  const btn=document.getElementById('sc-'+c.replace('#',''));
  if(btn){ btn.style.border='3px solid #fff'; btn.style.boxShadow='0 0 0 2px '+c; }
  const bar=document.getElementById('shoe-preview-bar');
  if(bar) bar.style.background=c;
}

function selectShoeMax(v){
  document.getElementById('new-shoe-max').value=v;
  document.querySelectorAll('[id^="sm-"]').forEach(btn=>{
    btn.style.background='var(--bg2)'; btn.style.color='var(--muted)'; btn.style.borderColor='var(--border)';
  });
  const btn=document.getElementById('sm-'+v);
  if(btn){ btn.style.background='#EEF2FD'; btn.style.color='#1B4FD8'; btn.style.borderColor='#1B4FD8'; }
}
function openShoeHistory(shoeName){
  const sh=getShoes().find(s=>s.name===shoeName);
  if(!sh) return;
  const sessions=[];
  const _cw=getEffectiveCW();
  for(let ws=1;ws<_cw;ws++){
    getOrderedWeekSessions(ws).forEach(({s,ei})=>{
      if(s.shoe!==shoeName||s.km===0||!state[`extra_w${ws}_s${ei}_done`]) return;
      const kmReal=state[`extra_w${ws}_s${ei}_km`]!=null?state[`extra_w${ws}_s${ei}_km`]:s.km;
      sessions.push({title:sessionTitle(s),km:kmReal,ws});
    });
  }
  // Semaine en cours : séances déjà cochées
  getOrderedWeekSessions(_cw).forEach(({s,ei})=>{
    if(s.shoe!==shoeName||s.km===0) return;
    const done=state[`extra_w${_cw}_s${ei}_done`]||state[`extra_w${_cw}_s${ei}_km`]!=null;
    if(!done) return;
    const kmReal=state[`extra_w${_cw}_s${ei}_km`]!=null?state[`extra_w${_cw}_s${ei}_km`]:s.km;
    sessions.push({title:sessionTitle(s),km:kmReal,ws:_cw});
  });

  const mc=document.getElementById('modal-container');
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';

  // Grouper par mois
  const byMonth={};
  sessions.forEach(s=>{
    const month=weeks[s.ws-1].month;
    if(!byMonth[month]) byMonth[month]=[];
    byMonth[month].push(s);
  });

  const rows=sessions.length===0
    ?`<p style="text-align:center;color:var(--muted);font-size:13px;padding:20px 0;">Aucune séance réalisée pour l'instant</p>`
    :Object.entries(byMonth).map(([month,seances])=>`
      <div style="font-size:10px;font-weight:700;color:var(--orange);text-transform:uppercase;letter-spacing:0.08em;padding:10px 0 4px;border-bottom:1px solid var(--border);">${month}</div>
      ${seances.map((s,i)=>`
        <div style="display:grid;grid-template-columns:40px 1fr 45px;align-items:center;gap:8px;padding:9px 0;${i<seances.length-1?'border-bottom:1px solid var(--border)':''}">
          <span style="font-size:11px;font-weight:600;color:var(--muted);">S${s.ws}</span>
          <span style="font-size:13px;color:var(--text);font-weight:500;">${s.title}</span>
          <span style="font-size:13px;font-weight:700;color:var(--text);text-align:right;">${s.km} km</span>
        </div>`).join('')}
    `).join('');
  const totalKm=Math.round(sessions.reduce((a,s)=>a+s.km,0)*10)/10;
  overlay.innerHTML=`<div class="modal-box" style="max-height:85vh;overflow-y:auto;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="width:12px;height:12px;border-radius:50%;background:${sh.color};display:inline-block;"></span>
        <p style="font-size:16px;font-weight:600;color:var(--text);">${shoeName}</p>
      </div>
      <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:24px;line-height:1;">×</button>
    </div>
    <p style="font-size:12px;color:var(--muted);margin-bottom:16px;">${sessions.length} séance${sessions.length>1?'s':''} · ${totalKm} km total</p>
    <div>${rows}</div>
  </div>`;
  overlay.onclick=e=>{if(e.target===overlay)closeModal();};
  _lockBodyScroll();
  mc.appendChild(overlay);
}

function openEditShoeModal(name){
  const arr=getShoes();
  const sh=arr.find(s=>s.name===name);
  if(!sh) return;
  const mc=document.getElementById('modal-container');
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.style.setProperty('--_overlay-bg','rgba(0,0,0,0.4)');
  overlay.innerHTML=_shoeModalHtml({
    title:'Modifier la paire',
    nameVal:sh.name,
    color:sh.color,
    maxVal:sh.max,
    saveBtn:`saveEditShoe('${name}')`
  });
  // Remplacer le hidden id="new-shoe-name" par id="edit-shoe-name" pour saveEditShoe
  const nameInput=overlay.querySelector('#new-shoe-name');
  if(nameInput) nameInput.id='edit-shoe-name';
  overlay.onclick=e=>{if(e.target===overlay)closeModal();};
  _lockBodyScroll();
  mc.appendChild(overlay);
  _initSwipeToDismiss(overlay, overlay.querySelector('.modal-box'));
  selectShoeColor(sh.color);
  selectShoeMax(sh.max);
}

function saveEditShoe(oldName){
  const newName=document.getElementById('edit-shoe-name').value.trim();
  const color=document.getElementById('new-shoe-color').value;
  const max=parseInt(document.getElementById('new-shoe-max').value)||600;
  if(!newName) return;
  const arr=getShoes();
  const sh=arr.find(s=>s.name===oldName);
  if(!sh) return;
  sh.name=newName; sh.color=color; sh.max=max;
  saveShoes(arr);
  if(oldName !== newName){
    if(state['shoe_km_'+oldName]!=null) state['shoe_km_'+newName]=state['shoe_km_'+oldName];
    try{ const r=JSON.parse(state._shoe_rules||'{}')||{}; Object.keys(r).forEach(t=>{ if(r[t]===oldName) r[t]=newName; }); state._shoe_rules=JSON.stringify(r); }catch(e){}
    Object.keys(state).forEach(k=>{
      if(/^edit_w\d+_s\d+$/.test(k)||/^extra_w\d+_s\d+$/.test(k)){
        try{
          const entry = typeof state[k]==='string' ? JSON.parse(state[k]) : state[k];
          if(entry && entry.shoe === oldName){
            entry.shoe = newName;
            state[k] = typeof state[k]==='string' ? JSON.stringify(entry) : entry;
          }
        }catch(e){}
      }
    });
    save();
  }
  closeModal();
  rendered.stats=false;
  renderStats();
  renderHome();
  showToast('Chaussure modifiée','👟');
}

function saveNewShoe(){
  const name=document.getElementById('new-shoe-name').value.trim();
  if(!name){
    const err=document.getElementById('shoe-add-error');
    if(err){err.textContent='Donne un nom à la chaussure.';err.style.display='block';}
    return;
  }
  const color=document.getElementById('new-shoe-color').value;
  const max=parseInt(document.getElementById('new-shoe-max').value)||600;
  const arr=getShoes();
  if(arr.find(s=>s.name===name)){
    const err=document.getElementById('shoe-add-error');
    if(err){err.textContent='Cette chaussure existe déjà.';err.style.display='block';}
    return;
  }
  arr.push({name,color,max});
  saveShoes(arr);
  closeModal();
  rendered.stats=false;
  renderStats();
  renderHome();
  showToast('Paire ajoutée','👟');
  setTimeout(checkCoachAlerts, 500);
}

let perfFilter='all';
function setPerfFilter(f){
  perfFilter=f;
  ['all','ef','tempo','frac','long'].forEach(k=>{
    const btn=document.getElementById('pf-'+k);
    if(!btn) return;
    const active=k===f;
    const color=k==='ef'?'#3B6D11':k==='tempo'?'#E8530A':k==='frac'?'#C4141B':k==='long'?'#534AB7':'var(--blue)';
    btn.style.background=active?color:'transparent';
    btn.style.borderColor=active?color:'var(--border)';
    btn.style.color=active?'#fff':'var(--muted)';
  });
  rendered.stats=false;
  renderStats();
}

function togglePerfMonth(id){
  const el=document.getElementById(id);
  const arr=document.getElementById('arr-'+id);
  if(!el) return;
  const open=el.style.display==='none';
  el.style.display=open?'block':'none';
  if(arr) arr.style.transform=open?'rotate(180deg)':'rotate(0)';
}
