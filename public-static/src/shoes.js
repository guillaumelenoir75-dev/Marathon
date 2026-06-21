function updateShoeMax(name, val){
  const arr=getShoes();
  const sh=arr.find(s=>s.name===name);
  if(sh){sh.max=parseInt(val)||600;saveShoes(arr);rendered.stats=false;renderStats();}
}
function deleteShoe(name){
  if(!confirm(`Supprimer "${name}" ?`)) return;
  const arr=getShoes().filter(s=>s.name!==name);
  saveShoes(arr);
  rendered.stats=false;
  renderStats();
  renderHome();
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
      <p id="shoe-add-error" style="display:none;color:#E24B4A;font-size:12px;text-align:center;margin:0;"></p>
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
  for(let ws=1;ws<CW;ws++){  // semaines passées uniquement
    const w=weeks[ws-1];
    weeks[ws-1].sessions.forEach((baseSess,si)=>{
      if(state[`del_w${ws}_s${si}`]) return;
      // Récupérer la session (avec modifications éventuelles)
      const s=getSession(ws,si);
      if(s.shoe!==shoeName) return;
      if(s.km===0) return; // ignorer repos
      const dk=gk(ws,si);
      const kmReal=state[dk+'km']!=null?state[dk+'km']:s.km;
      const title=s.d.split('|')[0];
      sessions.push({title,km:kmReal,ws});
    });
    // séances extra
    let ei=0;
    while(ei<=20&&state[`extra_w${ws}_s${ei}`]){
      const s=JSON.parse(state[`extra_w${ws}_s${ei}`]);
      if(s.shoe===shoeName && s.km>0 && state[`extra_w${ws}_s${ei}_done`]){
        const kmReal=state[`extra_w${ws}_s${ei}_km`]!=null?state[`extra_w${ws}_s${ei}_km`]:s.km;
        sessions.push({title:s.d.split('|')[0],km:kmReal,ws});
      }
      ei++;
    }
  }
  // S7 en cours : séances déjà cochées
  const w=weeks[CW-1];
  getOrderedWeekSessions(CW).forEach(({s,si,extra,ei})=>{
    if(s.shoe!==shoeName||s.km===0) return;
    const doneKey = extra ? `extra_w${CW}_s${ei}` : gk(CW,si);
    const done = extra
      ? (state[doneKey+'_done']||state[doneKey+'_km']!=null)
      : (state[doneKey+'done']||state[doneKey+'km']!=null);
    if(!done) return;
    const kmReal = extra
      ? (state[doneKey+'_km']!=null ? state[doneKey+'_km'] : s.km)
      : (state[doneKey+'km']!=null ? state[doneKey+'km'] : s.km);
    sessions.push({title:s.d.split('|')[0],km:kmReal,ws:CW});
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
  closeModal();
  rendered.stats=false;
  renderStats();
  renderHome();
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
