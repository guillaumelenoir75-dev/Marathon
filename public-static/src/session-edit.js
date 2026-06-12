function openEditModal(ws, si){
  const s = getSession(ws, si);
  const parts = s.d.split('|');
  const title = parts[0];
  const detail = parts[1]||'';
  const mc = document.getElementById('modal-container');
  const shoeOptions=getShoeOptions(s.shoe);
  const typeOptions = ['ef','tempo','frac','long','rest','race'].map(t=>
    `<option value="${t}" ${s.type===t?'selected':''}>${typeLabel[t]}</option>`
  ).join('');

  // Pre-calculate tempo/frac fields
  const isFrac=s.type==='frac';
  const repMatch=title.match(/(\d+)×(\d+)/);
  const editReps=repMatch?repMatch[1]:(isFrac?'6':'2');
  const editDur=repMatch?repMatch[2]:(isFrac?'2':'8');
  // Extraire l'allure cible depuis "X'XX/km", "X:XX/km", "X:XX — Y:YY /km" ou "X:XX /km"
  const paceRangeMatch=detail.match(/(\d+)['':](\d+)\s*[–—-]\s*(\d+)['':](\d+)\s*\/km/);
  const paceKmMatch=paceRangeMatch?null:detail.match(/(\d+)['':](\d+)\s*\/km/);
  const editPMin=paceRangeMatch?paceRangeMatch[1]+':'+paceRangeMatch[2]:paceKmMatch?paceKmMatch[1]+':'+paceKmMatch[2]:(isFrac?'4:30':'5:00');
  const editPMax=paceRangeMatch?paceRangeMatch[3]+':'+paceRangeMatch[4]:(()=>{const s=paceKmMatch?parseInt(paceKmMatch[1])*60+parseInt(paceKmMatch[2]):null;return s?Math.floor((s+10)/60)+':'+((s+10)%60<10?'0':'')+((s+10)%60):(isFrac?'4:50':'5:20');})();
  const editPMinSec=paceRangeMatch?parseInt(paceRangeMatch[1])*60+parseInt(paceRangeMatch[2]):paceKmMatch?parseInt(paceKmMatch[1])*60+parseInt(paceKmMatch[2]):null;
  const editPMaxSec=null; // unused, kept for compat
  const editRecupMatch=detail.match(/([\d:]+)\s*min\s*r[eé]cup/i);
  const editRecup=editRecupMatch?editRecupMatch[1]:(isFrac?'2':'3');

  const editEfPaceMatch = detail.match(/EF\s*[@\s]\s*(\d+)[''\':](\d+)/i);
  const editEfPaceVal = editEfPaceMatch ? editEfPaceMatch[1]+':'+editEfPaceMatch[2] : getBestEfPace()||'6:40';
  const tempoFields = s.type==='tempo' ? _buildTempoEditFields(ws, editReps, editDur, editRecup, editPMin, editPMax, detail)
  :s.type==='frac' ? buildTempoFieldsHtml('edit',parseInt(editReps),parseInt(editDur),editRecup,editPMin,editPMax,'#C4141B',editEfPaceVal)
  :s.type==='long'?buildLongModalHtml(detail)
  :(()=>{
    // Extraire l'allure depuis le detail existant
    const paceMatch2 = detail.match(/(\d+)[':](\d+)/);
    const efPaceVal = paceMatch2 ? paceMatch2[1]+":"+paceMatch2[2] : getBestEfPace()||'6:40';
    const ed2 = state['edit_w'+ws+'_s'+si]?JSON.parse(state['edit_w'+ws+'_s'+si]):{};
    // Allures suggérées (plage EF Guillaume)
    const efPaces = ["6:25","6:20","6:15","6:10","6:05","6:00","5:55","5:50","5:45","5:40","5:35","5:30"];
    const paceChips = efPaces.map(p=>`<button type="button" id="pace-chip-${p.replace(':','-')}" onclick="selectEfPace('${p}')" style="padding:7px 11px;border-radius:20px;font-size:12px;font-weight:600;border:1.5px solid var(--border);background:var(--bg2);color:var(--muted);cursor:pointer;transition:all 0.15s;">${p}</button>`).join('');
    return `
    <!-- EF : planning inclus ici (pas en section séparée) -->
    <div class="modal-section" style="background:linear-gradient(135deg,#EEF2FD,#E8EDFF);">
      <div class="modal-section-label" style="color:#1B4FD8;">📅 Planification</div>
      ${buildSchedFieldsHtml(ed2.sched_day||'',ed2.sched_time||'')}
    </div>
    <div class="modal-section" style="--_accent:#3B6D11;">
      <div class="modal-section-label" style="color:#3B6D11;">🟢 Allure cible</div>
      <!-- Grande input allure + badge durée -->
      <div style="display:flex;align-items:stretch;gap:12px;margin-bottom:16px;">
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
          <input type="text" id="edit-ef-pace" value="${efPaceVal}" placeholder="6:40" maxlength="5"
            oninput="updateEfPreview()"
            style="background:var(--bg);border:3px solid #3B6D11;border-radius:14px;padding:14px 12px;font-size:32px;font-weight:900;color:#3B6D11;width:108px;outline:none;text-align:center;line-height:1;">
          <p style="font-size:9px;color:#3B6D11;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;">/km</p>
        </div>
        <div style="flex:1;background:#EAF3DE;border-radius:14px;padding:14px;display:flex;flex-direction:column;justify-content:center;gap:6px;">
          <div>
            <p style="font-size:9px;font-weight:800;color:#3B6D11;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">💓 Zone cible</p>
            <p style="font-size:16px;font-weight:900;color:#2D5A0E;">140 – 148 bpm</p>
          </div>
          <div>
            <p style="font-size:9px;font-weight:800;color:#3B6D11;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">⏱ Durée estimée</p>
            <p style="font-size:18px;font-weight:900;color:#2D5A0E;" id="ef-preview-time">—</p>
          </div>
        </div>
      </div>
      <!-- Chips allure -->
      <p style="font-size:9px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Raccourcis allure</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">${paceChips}</div>
    </div>
    <input type="hidden" id="edit-detail" value="${detail}">
    `;
  })()
  ;

  const overlay = document.createElement('div');
  overlay.className='modal-overlay';
  // Couleur et icône par type
  const _typeColors={ef:{bg:'modal-header-ef',icon:'🟢',label:'Endurance Fondamentale'},tempo:{bg:'modal-header-tempo',icon:'🔥',label:'Tempo'},frac:{bg:'modal-header-frac',icon:'⚡',label:'Fractionné'},long:{bg:'modal-header-long',icon:'💜',label:'Repos'},rest:{bg:'modal-header-default',icon:'😴',label:'Repos'},race:{bg:'modal-header-default',icon:'🏁',label:'Course'}};
  const _tc=_typeColors[s.type]||_typeColors.rest;
  // Calculer la durée header avec la même allure que le champ
  const _editPaceMatch = detail.match(/(\d+)[':](\d+)/);
  const _editEfPace = _editPaceMatch ? _editPaceMatch[1]+':'+_editPaceMatch[2] : (getBestEfPace()||'6:40');
  const _modalDur = (()=>{
    if(s.type==='ef'){
      const pm=_editEfPace.match(/(\d+)[':](\d+)/);
      if(!pm) return estimateDuration(s);
      const paceMin=parseInt(pm[1])+parseInt(pm[2])/60;
      const totalSec=Math.round(paceMin*s.km*60);
      const h=Math.floor(totalSec/3600),m=Math.floor((totalSec%3600)/60),sec=totalSec%60;
      const base=h>0?h+'h'+String(m).padStart(2,"0")+"'":m+"'";
      return base+(sec?String(sec).padStart(2,"0")+'"':'');
    }
    return estimateDuration(s);
  })();
  const _hcls  = {ef:'modal-header-ef',tempo:'modal-header-tempo',frac:'modal-header-frac',long:'modal-header-long'}[s.type]||'modal-header-default';
  const _hacc  = {ef:'#3B6D11',tempo:'#E8530A',frac:'#C4141B',long:'#534AB7'}[s.type]||'#1B4FD8';
  const _hlbl  = {ef:'Endurance Fondamentale',tempo:'Intervalles Tempo',frac:'Fractionné',long:'Sortie Longue'}[s.type]||title;
  const _hemj  = {ef:'🟢',tempo:'🔥',frac:'⚡',long:'💜'}[s.type]||'📅';
  overlay.style.setProperty('--_overlay-bg','rgba(0,0,0,0.4)');
  // Couleur gradient de transition header→body
  const _gradColors = {ef:'#3B6D11',tempo:'#E8530A',frac:'#C4141B',long:'#534AB7'};
  const _gc = _gradColors[s.type] || '#0C447C';
  overlay.innerHTML=`<div class="modal-box" style="max-height:92vh;">

    <!-- HEADER sticky en haut -->
    <div class="modal-header ${_hcls}" style="position:sticky;top:0;z-index:10;flex-shrink:0;padding-top:10px;">
      <!-- Handle bar -->
      <div style="width:36px;height:4px;border-radius:4px;background:rgba(255,255,255,0.3);margin:0 auto 12px;"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div style="flex:1;min-width:0;">
          <p style="font-size:10px;font-weight:800;opacity:0.7;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:3px;">S${ws} · Modifier la séance</p>
          <p style="font-size:22px;font-weight:900;letter-spacing:-0.03em;line-height:1.1;">${_hemj} ${_hlbl}</p>
          <div style="display:flex;align-items:center;gap:10px;margin-top:6px;flex-wrap:wrap;">
            ${_modalDur?`<span style="background:rgba(255,255,255,0.2);border-radius:20px;padding:3px 10px;font-size:12px;font-weight:700;">⏱ ~${_modalDur}</span>`:''}
            <span style="background:rgba(255,255,255,0.2);border-radius:20px;padding:3px 10px;font-size:12px;font-weight:700;">${s.km} km</span>
          </div>
        </div>
        <button onclick="closeModal()" style="background:rgba(255,255,255,0.25);border:none;cursor:pointer;color:#fff;font-size:18px;line-height:1;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;">×</button>
      </div>
    </div>

    <!-- BODY scrollable -->
    <div class="modal-scroll-body">
    <div class="modal-body" style="gap:0;">

      <!-- Planning (Tempo, Frac & Long) -->
      ${s.type==='tempo'||s.type==='frac'||s.type==='long'?`
      <div class="modal-section" style="background:linear-gradient(135deg,#EEF2FD,#E8EDFF);">
        <div class="modal-section-label" style="color:#1B4FD8;">📅 Planification</div>
        ${(()=>{const ed=state['edit_w'+ws+'_s'+si]?JSON.parse(state['edit_w'+ws+'_s'+si]):{};return buildSchedFieldsHtml(ed.sched_day||'',ed.sched_time||'');})()}
      </div>`:''}

      <!-- Champs principaux (tempo/long/ef) -->
      <div id="edit-fields-container">${tempoFields}</div>

      <!-- Distance + Type + Chaussures -->
      <div class="modal-section" style="margin-top:4px;">
        <div class="modal-section-label">⚙️ Configuration</div>
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">
          <!-- Km stepper -->
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;">
            <div style="display:flex;align-items:center;gap:4px;">
              <button type="button" onclick="const el=document.getElementById('edit-km');el.value=Math.max(0,parseFloat(el.value||0)-1);el.dispatchEvent(new Event('input'))" style="width:32px;height:32px;border-radius:50%;border:2px solid var(--border);background:var(--bg);font-size:18px;color:var(--text);cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:700;">−</button>
              <input type="number" id="edit-km" value="${s.km}" min="0" max="99" step="1" oninput="if(document.getElementById('ef-restant-display'))calcEfRestant();updateEfPreview();" style="background:${_hacc}12;border:2.5px solid ${_hacc};border-radius:12px;padding:8px 4px;font-size:26px;font-weight:900;color:${_hacc};width:68px;outline:none;text-align:center;-moz-appearance:textfield;">
              <button type="button" onclick="const el=document.getElementById('edit-km');el.value=Math.min(99,parseFloat(el.value||0)+1);el.dispatchEvent(new Event('input'))" style="width:32px;height:32px;border-radius:50%;border:2px solid var(--border);background:var(--bg);font-size:18px;color:var(--text);cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:700;">+</button>
            </div>
            <p style="font-size:9px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">km</p>
          </div>
          <!-- Type pills + chaussures -->
          <div style="flex:1;display:flex;flex-direction:column;gap:10px;">
            <div>
              <p style="font-size:9px;font-weight:800;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.07em;">Type de séance</p>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${[['ef','🟢 EF','#3B6D11'],['tempo','🔥 Tempo','#E8530A'],['frac','⚡ Frac','#C4141B'],['long','💜 Long','#534AB7']].map(([v,lbl,col])=>`<button type="button" onclick="document.getElementById('edit-type').value='${v}';onEditTypeChange();document.querySelectorAll('.edit-type-pill').forEach(b=>{const isV=b.dataset.type==='${v}';b.style.background=isV?'${col}':'var(--bg)';b.style.color=isV?'#fff':'var(--muted)';b.style.borderColor=isV?'${col}':'var(--border)';})" class="edit-type-pill" data-type="${v}" style="flex:1;min-width:60px;padding:9px 4px;border-radius:12px;font-size:12px;font-weight:800;border:2px solid ${s.type===v?col:'var(--border)'};background:${s.type===v?col:'var(--bg)'};color:${s.type===v?'#fff':'var(--muted)'};cursor:pointer;transition:all 0.15s;text-align:center;">${lbl}</button>`).join('')}
                <select id="edit-type" onchange="onEditTypeChange()" style="display:none;">${typeOptions}</select>
              </div>
            </div>
            <div>
              <p style="font-size:9px;font-weight:800;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.07em;">👟 Chaussures</p>
              <select id="edit-shoe" style="background:var(--bg);border:2px solid var(--border);border-radius:12px;padding:10px 12px;font-size:13px;font-weight:700;color:var(--text);width:100%;outline:none;cursor:pointer;">${shoeOptions}</select>
            </div>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px;">
        <button onclick="resetSession(${ws},${si})" style="padding:14px;background:var(--bg2);border:2px solid var(--border);border-radius:14px;font-size:13px;font-weight:700;color:var(--muted);cursor:pointer;">↺ Réinit.</button>
        <button onclick="saveEdit(${ws},${si})" class="modal-btn-primary" style="background:${_hacc};">Enregistrer ✓</button>
      </div>
      <button onclick="deleteSession(${ws},${si})" style="width:100%;margin-top:10px;padding:13px;background:transparent;border:2px solid #E24B4A33;border-radius:14px;font-size:13px;font-weight:700;color:#E24B4A;cursor:pointer;">🗑 Supprimer cette séance</button>
    </div>
    </div><!-- /modal-scroll-body -->
  </div>`;
  overlay.onclick=e=>{if(e.target===overlay)closeModal();};
  _lockBodyScroll();
  mc.appendChild(overlay);

  _initSwipeToDismiss(overlay, overlay.querySelector('.modal-box'));
  // Init blocs long si nécessaire
  if(s.type==='long') { renderLongBlocks(); setTimeout(()=>{ updateLongDuration(); const ef=document.getElementById('long-ef-pace'); if(ef) highlightLongEfChip(ef.value); }, 50); }
  if(s.type==='tempo') setTimeout(()=>{ calcEfRestant(); }, 50);
  if(s.type==='frac') setTimeout(()=>{ calcEfRestantForPrefix('edit'); selectTempoEfPace('edit', document.getElementById('edit-ef-pace')?.value||getBestEfPace()||'6:40'); }, 50);
  if(s.type==='ef') setTimeout(()=>{
    updateEfPreview();
    // Highlight current pace chip
    const paceEl=document.getElementById('edit-ef-pace');
    if(paceEl) selectEfPace(paceEl.value);
  }, 50);
}

function selectTempoEfPace(prefix, pace){
  const inp=document.getElementById(prefix+'-ef-pace');
  if(inp){inp.value=pace;}
  calcEfRestantForPrefix(prefix);
  // Highlight chip sélectionné
  document.querySelectorAll('[id^="'+prefix+'-ef-chip-"]').forEach(btn=>{
    const sel=btn.id===prefix+'-ef-chip-'+pace.replace(':','-');
    btn.style.background=sel?'#3B6D11':'var(--bg2)';
    btn.style.color=sel?'#fff':'var(--muted)';
    btn.style.borderColor=sel?'#3B6D11':'var(--border)';
  });
}

function selectHmEfPace(pace){
  const inp=document.getElementById('edit-ef-pace');
  if(inp){inp.value=pace;updateEfPreview();}
  document.querySelectorAll('[id^="edit-pace-chip-"]').forEach(btn=>{
    const sel=btn.id==='edit-ef-chip-'+pace.replace(':','-');
    btn.style.background=sel?'var(--blue)':'var(--bg2)';
    btn.style.color=sel?'#fff':'var(--muted)';
    btn.style.borderColor=sel?'var(--blue)':'var(--border)';
  });
}

function updateEfPreview(){
  const paceEl=document.getElementById('edit-ef-pace');
  const kmEl=document.getElementById('edit-km');
  const timeEl=document.getElementById('edit-ef-preview-time');
  if(!paceEl||!kmEl||!timeEl) return;
  const m=paceEl.value.match(/(\d+)[':](\d+)/);
  const km=parseFloat(kmEl.value)||0;
  if(!m||km===0){timeEl.textContent='—';return;}
  const totalSec=(parseInt(m[1])*60+parseInt(m[2]))*km;
  const h=Math.floor(totalSec/3600);
  const min=Math.floor((totalSec%3600)/60);
  const sec=Math.round(totalSec%60);
  timeEl.textContent=h>0?h+'h'+String(min).padStart(2,'0'):min+"'"+(sec?String(sec).padStart(2,'0')+'"':'');
  document.querySelectorAll('[id^="edit-pace-chip-"]').forEach(btn=>{
    const sel=btn.id==='edit-ef-chip-'+paceEl.value.replace(':','-');
    btn.style.background=sel?'var(--blue)':'var(--bg2)';
    btn.style.color=sel?'#fff':'var(--muted)';
    btn.style.borderColor=sel?'var(--blue)':'var(--border)';
  });
  // Synchroniser le header modal
  const hdrElHm=document.querySelector('.modal-box p[style*="color:var(--blue)"][style*="font-weight:600"]');
  if(hdrElHm&&hdrElHm.textContent.includes('estimées')&&km>0&&m){
    const dur=h>0?h+'h'+String(min).padStart(2,'0')+"'"+( sec?String(sec).padStart(2,'0')+'"':''):min+"'"+(sec?String(sec).padStart(2,'0')+'"':'');
    hdrElHm.textContent='⏱ ~'+dur+' estimées';
  }
}

function selectEfPace(pace){
  const inp = document.getElementById('edit-ef-pace');
  if(inp){ inp.value = pace; updateEfPreview(); }
  // Highlight selected chip
  document.querySelectorAll('[id^="pace-chip-"]').forEach(btn=>{
    const isSelected = btn.id === 'pace-chip-'+pace.replace(':','-');
    btn.style.background = isSelected ? 'var(--blue)' : 'var(--bg2)';
    btn.style.color = isSelected ? '#fff' : 'var(--muted)';
    btn.style.borderColor = isSelected ? 'var(--blue)' : 'var(--border)';
  });
}

function updateEfPreview(){
  const paceEl = document.getElementById('edit-ef-pace');
  const kmEl = document.getElementById('edit-km');
  const timeEl = document.getElementById('ef-preview-time');
  if(!paceEl || !kmEl || !timeEl) return;
  const paceStr = paceEl.value;
  const km = parseFloat(kmEl.value) || 0;
  const m = paceStr.match(/(\d+)[':](\d+)/);
  if(!m || km === 0){ timeEl.textContent = '—'; return; }
  const totalSec = (parseInt(m[1])*60 + parseInt(m[2])) * km;
  const h = Math.floor(totalSec/3600);
  const min = Math.floor((totalSec%3600)/60);
  const sec = Math.round(totalSec%60);
  timeEl.textContent = h>0 ? h+'h'+String(min).padStart(2,'0') : min+"'"+(sec?String(sec).padStart(2,'0')+'\"':'');
  // Highlight matching chip
  document.querySelectorAll('[id^="pace-chip-"]').forEach(btn=>{
    const isSelected = btn.id === 'pace-chip-'+paceStr.replace(':','-');
    btn.style.background = isSelected ? 'var(--blue)' : 'var(--bg2)';
    btn.style.color = isSelected ? '#fff' : 'var(--muted)';
    btn.style.borderColor = isSelected ? 'var(--blue)' : 'var(--border)';
  });
  // Synchroniser le header modal
  const hdrElEdit=document.querySelector('.modal-box p[style*="color:var(--blue)"][style*="font-weight:600"]');
  if(hdrElEdit&&hdrElEdit.textContent.includes('estimées')&&km>0&&m){
    const dur=h>0?h+'h'+String(min).padStart(2,'0')+"'"+( sec?String(sec).padStart(2,'0')+'"':''):min+"'"+(sec?String(sec).padStart(2,'0')+'"':'');
    hdrElEdit.textContent='⏱ ~'+dur+' estimées';
  }
}

function saveEdit(ws, si){
  const typeEl = document.getElementById('edit-type');
  const type = typeEl ? typeEl.value : getSession(ws,si).type;
  const km = parseFloat(document.getElementById('edit-km').value);
  const shoe = document.getElementById('edit-shoe').value || null;
  const applyAll = document.getElementById('edit-apply-all');
  const applyFormat = document.getElementById('edit-apply-format');
  let name = '', detail = '';
  if(type==='ef'||type==='long'&&document.getElementById('edit-ef-pace')){
    // Cas EF simple : récupérer l'allure
    if(type==='ef'){
      const paceEl2=document.getElementById('edit-ef-pace');
      const nameEl2=document.getElementById('edit-name');
      // Prendre le titre depuis le champ s'il existe, sinon depuis la séance existante
      const existingTitle = getSession(ws,si).d.split('|')[0];
      name = nameEl2 && nameEl2.value.trim() ? nameEl2.value.trim() : existingTitle;
      const efPaceStr=paceEl2?paceEl2.value.trim():'';
      detail=efPaceStr?efPaceStr+'/km':'';
    }
  }
  if(type==='tempo'||type==='frac'){
    const repsEl=document.getElementById('edit-reps');
    const durEl=document.getElementById('edit-dur');
    const pMinEl=document.getElementById('edit-pace-min');
    const pMaxEl=document.getElementById('edit-pace-max');
    const recupEl=document.getElementById('edit-recup');
    const reps=repsEl?parseInt(repsEl.value)||(type==='frac'?6:2):(type==='frac'?6:2);
    const dur=durEl?parseInt(durEl.value)||(type==='frac'?2:8):(type==='frac'?2:8);
    name=type==='frac'?`Fractionné ${reps}×${dur} min`:`Tempo ${reps}×${dur} min`;
    const pMin=pMinEl?(pMinEl.value||'').trim():'';
    const pMax=pMaxEl?(pMaxEl.value||'').trim():'';
    if(pMin&&pMax) detail=`${pMin} — ${pMax} /km`;
    else if(pMin) detail=`${pMin} /km`;
    const recup=(recupEl?recupEl.value||'':'').trim();
    if(recup&&recup!=='0'&&reps>1) detail=detail+(detail?' · ':'')+`${recup} min récup`;
    const editEfPaceEl=document.getElementById('edit-ef-pace');
    const editEfPaceStr=(editEfPaceEl?editEfPaceEl.value.trim():'').replace("'",":");
    if(editEfPaceStr&&editEfPaceStr.match(/\d+:\d+/)) detail=detail+` · EF @ ${editEfPaceStr}`;
  } else if(type==='ef'){
    // Déjà traité ci-dessus — ne rien faire ici, name+detail sont déjà définis
  } else if(type==='long'){
    const existing=getSession(ws,si);
    const nameElLong=document.getElementById('edit-name');
    name=(nameElLong&&nameElLong.value.trim())||existing.d.split('|')[0]||'Séance EF longue';
    const blocks=getLongBlocksData();
    if(blocks.length>0){
      const bTotal=Math.round(blocks.reduce((a,b)=>a+b.km,0)*10)/10;
      if(Math.abs(bTotal-km)>=0.1){alert('Total des blocs ('+bTotal+' km) ≠ distance planifiée ('+km+' km). Ajuste les blocs.');return;}
      detail=buildLongDetail(blocks);
    }
  } else {
    const nameEl=document.getElementById('edit-name');
    if(nameEl) name=nameEl.value.trim();
    const detailEl=document.getElementById('edit-detail');
    if(detailEl) detail=detailEl.value.trim();
  }
  const d = detail ? `${name}|${detail}` : name;
  const schedDay=parseInt(document.getElementById('sched-day').value)||null;
  const schedH=document.getElementById('sched-hour')?document.getElementById('sched-hour').value:'08';
  const schedM=document.getElementById('sched-min')?document.getElementById('sched-min').value:'00';
  const schedTime=schedDay?(String(schedH).padStart(2,'0')+':'+String(schedM).padStart(2,'0')):null;
  const key = `edit_w${ws}_s${si}`;
  state[key] = JSON.stringify({d, km: isNaN(km)?0:km, type, shoe, sched_day:schedDay||undefined, sched_time:schedTime||undefined});
  // Appliquer le format (reps×dur) à toutes les Tempo suivantes
  if(applyFormat && applyFormat.checked && type==='tempo'){
    const reps=parseInt(document.getElementById('edit-reps').value)||2;
    const dur=parseInt(document.getElementById('edit-dur').value)||8;
    for(let w=ws+1;w<=32;w++){
      weeks[w-1].sessions.forEach((s2,si2)=>{
        if(s2.type==='tempo'){
          const existing=state[`edit_w${w}_s${si2}`]?JSON.parse(state[`edit_w${w}_s${si2}`]):s2;
          const existingDetail=existing.d.split('|')[1]||'';
          state[`edit_w${w}_s${si2}`]=JSON.stringify({...existing,d:`Tempo ${reps}×${dur} min${existingDetail?'|'+existingDetail:''}`});
        }
      });
    }
  }
  // Appliquer l'allure à toutes les Tempo suivantes
  if(applyAll && applyAll.checked && detail){
    for(let w=ws+1;w<=32;w++){
      weeks[w-1].sessions.forEach((s2,si2)=>{
        if(s2.type==='tempo'){
          const existing=state[`edit_w${w}_s${si2}`]?JSON.parse(state[`edit_w${w}_s${si2}`]):s2;
          const existingTitle=existing.d.split('|')[0];
          state[`edit_w${w}_s${si2}`]=JSON.stringify({...existing,d:`${existingTitle}|${detail}`});
        }
      });
    }
  }
  save();
  closeModal();
  rendered.plan=false;
  rendered.stats=false;
  renderPlan();
  renderHome();
}

function resetSession(ws, si){
  const key = `edit_w${ws}_s${si}`;
  delete state[key];
  save();
  closeModal();
  rendered.plan=false;
  rendered.stats=false;
  renderPlan();
  renderHome();
}

function deleteSession(ws, si){
  state[`del_w${ws}_s${si}`]=true;
  delete state[`edit_w${ws}_s${si}`];
  save();
  closeModal();
  rendered.plan=false;
  rendered.stats=false;
  renderPlan();
  renderHome();
}

function getWeekSessions(ws){
  const base=weeks[ws-1].sessions;
  const result=[];
  base.forEach((s,si)=>{
    if(!state[`del_w${ws}_s${si}`]) result.push({...getSession(ws,si),_si:si,_extra:false});
  });
  let ei=0;
  while(state[`extra_w${ws}_s${ei}`]){
    result.push({...JSON.parse(state[`extra_w${ws}_s${ei}`]),_si:'x'+ei,_extra:true,_ei:ei});
    ei++;
  }
  return result;
}

function openAddModal(ws){
  const mc = document.getElementById('modal-container');
  const shoeOptions = getShoeOptions(null);
  const typeOptions = ['ef','tempo','frac','long'].map(t =>
    `<option value="${t}">${typeLabel[t]}</option>`
  ).join('');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal-box" style="max-height:90vh;overflow-y:auto;">
    <!-- HEADER dynamique — se met à jour via JS après onAddTypeChange -->
    <div id="add-modal-header" class="modal-header modal-header-default">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <p style="font-size:11px;font-weight:600;opacity:0.75;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:2px;">S${ws} · Nouvelle séance</p>
          <p id="add-header-title" style="font-size:19px;font-weight:800;letter-spacing:-0.02em;">Endurance Fondamentale</p>
          <p style="font-size:12px;opacity:0.75;margin-top:3px;">Sélectionne le type ci-dessous</p>
        </div>
        <button onclick="closeModal()" style="background:rgba(255,255,255,0.2);border:none;cursor:pointer;color:#fff;font-size:20px;line-height:1;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">×</button>
      </div>
    </div>
    <div class="modal-body">
      <!-- Sélecteur de type en pills -->
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        ${[['ef','🟢 EF','#3B6D11'],['tempo','🔥 Tempo','#E8530A'],['frac','⚡ Frac','#C4141B'],['long','💜 Long','#534AB7']].map(([v,lbl,col])=>`<button type="button" onclick="onAddTypePill('${v}',${ws})" id="add-pill-${v}" style="flex:1;padding:10px 6px;border-radius:12px;font-size:12px;font-weight:700;border:2px solid ${v==='ef'?col:'var(--border)'};background:${v==='ef'?col:'var(--bg2)'};color:${v==='ef'?'#fff':'var(--muted)'};cursor:pointer;transition:all 0.15s;text-align:center;">${lbl}</button>`).join('')}
        <input type="hidden" id="add-type" value="ef">
      </div>
      <div id="add-fields-container"></div>
      <div class="modal-section" style="margin-top:12px;">
        <div class="modal-section-label">📏 Distance & chaussures</div>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:14px;align-items:center;">
          <div style="text-align:center;">
            <div style="display:flex;align-items:center;gap:6px;">
              <button type="button" onclick="const el=document.getElementById('add-km');el.value=Math.max(0,parseFloat(el.value||0)-1);el.dispatchEvent(new Event('input'))" style="width:30px;height:30px;border-radius:50%;border:1.5px solid var(--border);background:var(--bg);font-size:16px;color:var(--text);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">−</button>
              <input type="number" id="add-km" value="10" min="0" max="99" step="1" oninput="updateAddEfPreview();calcEfRestantForPrefix('add')"
                style="background:var(--bg);border:2px solid #1B4FD840;border-radius:10px;padding:8px;font-size:22px;font-weight:800;color:#1B4FD8;width:66px;outline:none;text-align:center;">
              <button type="button" onclick="const el=document.getElementById('add-km');el.value=Math.min(99,parseFloat(el.value||0)+1);el.dispatchEvent(new Event('input'))" style="width:30px;height:30px;border-radius:50%;border:1.5px solid var(--border);background:var(--bg);font-size:16px;color:var(--text);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">+</button>
            </div>
            <p style="font-size:9px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-top:4px;">km</p>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;flex:1;">
            <p style="font-size:9px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:2px;">👟 Chaussures</p>
            <select id="add-shoe" style="background:var(--bg);border:2px solid var(--border);border-radius:10px;padding:9px 10px;font-size:12px;font-weight:700;color:var(--text);width:100%;outline:none;cursor:pointer;">${shoeOptions}</select>
          </div>
        </div>
      </div>
      <div id="add-error" style="display:none;color:#E24B4A;font-size:12px;margin-top:8px;padding:12px;background:#FEF2F2;border-radius:12px;font-weight:600;"></div>
      <button onclick="saveAdd(${ws})" id="add-submit-btn" class="modal-btn-primary" style="margin-top:16px;background:#3B6D11;">✓ Ajouter la séance</button>
    </div>
  </div>`;
  overlay.onclick = e => { if(e.target === overlay) closeModal(); };
  _lockBodyScroll();
  mc.appendChild(overlay);
  // Déclencher l'affichage du bon formulaire dès l'ouverture
  onAddTypeChange(ws);
}

function onAddTypeChange(ws){
  const type = (document.getElementById('add-type') || {}).value || 'ef';
  if(!ws) { const t=document.getElementById('add-type'); if(!t) return; }
  const container = document.getElementById('add-fields-container');
  if (!container) return;

  if (type === 'tempo') {
    container.innerHTML = `
      <div class="modal-section" style="background:linear-gradient(135deg,#EEF2FD,#E8EDFF);">
        <div class="modal-section-label" style="color:#1B4FD8;">📅 Planification</div>
        ${buildSchedFieldsHtml('', '')}
      </div>`
      + buildTempoFieldsHtml('add', 2, 8, '3:00',
          getBestEfPace() ? '5:00' : '5:00',
          getBestEfPace() ? '5:20' : '5:20', '#E8530A');
    setTimeout(() => { calcEfRestantForPrefix('add'); selectTempoEfPace('add', document.getElementById('add-ef-pace')?.value||getBestEfPace()||'6:40'); }, 50);

  } else if (type === 'frac') {
    container.innerHTML = `
      <div class="modal-section" style="background:linear-gradient(135deg,#EEF2FD,#E8EDFF);">
        <div class="modal-section-label" style="color:#1B4FD8;">📅 Planification</div>
        ${buildSchedFieldsHtml('', '')}
      </div>`
      + buildTempoFieldsHtml('add', 6, 2, '2:00',
          getBestEfPace() ? '4:30' : '4:30',
          getBestEfPace() ? '4:50' : '4:50', '#C4141B');
    setTimeout(() => { calcEfRestantForPrefix('add'); selectTempoEfPace('add', document.getElementById('add-ef-pace')?.value||getBestEfPace()||'6:40'); }, 50);

  } else if (type === 'long') {
    container.innerHTML = `
      <div class="modal-section" style="background:linear-gradient(135deg,#EEF2FD,#E8EDFF);">
        <div class="modal-section-label" style="color:#1B4FD8;">📅 Planification</div>
        ${buildSchedFieldsHtml('', '')}
      </div>`
      + buildLongModalHtml('');
    setTimeout(() => renderLongBlocks(), 0);

  } else {
    // EF — section redesignée
    const efPace = getBestEfPace() || '6:40';
    const efPaces = ["6:20","6:10","6:00","5:50","5:40","5:30"];
    const paceChips = efPaces.map(p =>
      `<button type="button" id="add-ef-chip-${p.replace(':','-')}" onclick="selectAddEfPace('${p}')" class="modal-chip">${p}</button>`
    ).join('');
    container.innerHTML = `
      <div class="modal-section" style="background:linear-gradient(135deg,#EEF2FD,#E8EDFF);">
        <div class="modal-section-label" style="color:#1B4FD8;">📅 Planification</div>
        ${buildSchedFieldsHtml('', '')}
      </div>
      <div class="modal-section" style="--_accent:#3B6D11;">
        <div class="modal-section-label" style="color:#3B6D11;">🟢 Allure cible</div>
        <div style="display:flex;align-items:stretch;gap:12px;margin-bottom:16px;">
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;">
            <input type="text" id="add-ef-pace" value="${efPace}" placeholder="6:40" maxlength="5"
              oninput="updateAddEfPreview()"
              style="background:var(--bg);border:3px solid #3B6D11;border-radius:14px;padding:14px 12px;font-size:32px;font-weight:900;color:#3B6D11;width:108px;outline:none;text-align:center;line-height:1;">
            <p style="font-size:9px;color:#3B6D11;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;">/km</p>
          </div>
          <div style="flex:1;background:#EAF3DE;border-radius:14px;padding:14px;display:flex;flex-direction:column;justify-content:center;gap:6px;">
            <div>
              <p style="font-size:9px;font-weight:800;color:#3B6D11;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">💓 Zone cible</p>
              <p style="font-size:16px;font-weight:900;color:#2D5A0E;">${(()=>{const z=getFcMaxZone();return z?z.min+'–'+z.max+' bpm':'—';})()}</p>
            </div>
            <div>
              <p style="font-size:9px;font-weight:800;color:#3B6D11;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">⏱ Durée estimée</p>
              <p style="font-size:18px;font-weight:900;color:#2D5A0E;" id="add-ef-preview-time">—</p>
            </div>
          </div>
        </div>
        <p style="font-size:9px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Raccourcis allure</p>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">${paceChips}</div>
      </div>
      <input type="hidden" id="add-detail" value="">`;
    setTimeout(() => updateAddEfPreview(), 50);
  }
}

function onAddTypePill(type, ws) {
  // Mettre à jour l'input caché
  const typeInput = document.getElementById('add-type');
  if(typeInput) typeInput.value = type;

  // Mettre à jour les pills
  const colors = {ef:'#3B6D11', tempo:'#E8530A', frac:'#C4141B', long:'#534AB7'};
  ['ef','tempo','frac','long'].forEach(t => {
    const pill = document.getElementById('add-pill-'+t);
    if(!pill) return;
    const active = t === type;
    pill.style.background = active ? colors[t] : 'var(--bg2)';
    pill.style.color = active ? '#fff' : 'var(--muted)';
    pill.style.borderColor = active ? colors[t] : 'var(--border)';
  });

  // Mettre à jour le header
  const hdr = document.getElementById('add-modal-header');
  const hdrTitle = document.getElementById('add-header-title');
  const submitBtn = document.getElementById('add-submit-btn');
  const titles = {ef:'Endurance Fondamentale', tempo:'Tempo — Intervalles', frac:'Fractionné', long:'Sortie Longue'};
  const headerClasses = {ef:'modal-header-ef', tempo:'modal-header-tempo', frac:'modal-header-frac', long:'modal-header-long'};
  const btnColors = {ef:'#3B6D11', tempo:'#E8530A', frac:'#C4141B', long:'#534AB7'};
  if(hdr) {
    hdr.className = 'modal-header ' + (headerClasses[type] || 'modal-header-default');
  }
  if(hdrTitle) hdrTitle.textContent = titles[type] || type;
  if(submitBtn) submitBtn.style.background = btnColors[type] || '#1B4FD8';

  // Mettre à jour les champs
  onAddTypeChange(ws);
}

function selectAddEfPace(p){
  const inp = document.getElementById('add-ef-pace');
  if(inp){ inp.value = p; updateAddEfPreview(); }
  // Mettre à jour les chips
  document.querySelectorAll('[id^="add-ef-chip-"]').forEach(b => {
    b.style.background = 'var(--bg2)'; b.style.color = 'var(--muted)';
    b.style.borderColor = 'var(--border)';
  });
  const chip = document.getElementById('add-ef-chip-' + p.replace(':','-'));
  if(chip){ chip.style.background='var(--blue)'; chip.style.color='#fff'; chip.style.borderColor='var(--blue)'; }
}

function updateAddEfPreview(){
  const paceInp = document.getElementById('add-ef-pace');
  const kmInp = document.getElementById('add-km');
  const timeEl = document.getElementById('add-ef-preview-time');
  if(!paceInp || !timeEl) return;
  const parts = paceInp.value.split(':');
  const km = parseFloat(kmInp ? kmInp.value : 0) || 0;
  const sec = parseInt(parts[0]||0)*60 + parseInt(parts[1]||0);
  if(sec > 0 && km > 0){
    const total = Math.round(km * sec);
    const m = Math.floor(total/60), s = total%60;
    timeEl.textContent = m + 'min' + (s>0?' '+String(s).padStart(2,'0')+'s':'');
  } else {
    timeEl.textContent = '—';
  }
  // Mettre à jour le detail caché
  const detailEl = document.getElementById('add-detail');
  if(detailEl) detailEl.value = paceInp.value + ' /km';
}


function onEditTypeChange(){
  const type=document.getElementById('edit-type').value;
  const container=document.getElementById('edit-fields-container');
  if(!container) return;
  if(type==='tempo'){
    container.innerHTML=buildTempoFieldsHtml('edit',2,8,'3:00','5:00','5:20','#E8530A')
      +`<div style="background:var(--bg2);border-radius:var(--radius-sm);padding:8px 12px;display:flex;align-items:center;gap:10px;">
        <input type="checkbox" id="edit-apply-format" style="width:18px;height:18px;cursor:pointer;accent-color:#E8530A;">
        <label for="edit-apply-format" style="font-size:12px;color:var(--text);cursor:pointer;">Appliquer ce format à toutes les Tempo suivantes</label>
      </div>
      <div style="background:var(--bg2);border-radius:var(--radius-sm);padding:8px 12px;display:flex;align-items:center;gap:10px;">
        <input type="checkbox" id="edit-apply-all" style="width:18px;height:18px;cursor:pointer;accent-color:#E8530A;">
        <label for="edit-apply-all" style="font-size:12px;color:var(--text);cursor:pointer;">Appliquer cette allure à toutes les Tempo suivantes</label>
      </div>`;
  } else if(type==='frac'){
    container.innerHTML=buildTempoFieldsHtml('edit',6,2,'2:00','4:30','4:50','#C4141B');
  } else if(type==='long'){
    container.innerHTML=buildLongModalHtml('');
    setTimeout(()=>renderLongBlocks(),0);
  } else {
    container.innerHTML=`<div>
      <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Nom de la séance</p>
      <input type="text" id="edit-name" value="" style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 12px;font-size:14px;color:var(--text);width:100%;outline:none;">
    </div>
    <div>
      <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Détail allure (optionnel)</p>
      <input type="text" id="edit-detail" value="" placeholder="ex: 10 EF · 3 AM @ 5:40/km" style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 12px;font-size:14px;color:var(--text);width:100%;outline:none;">
    </div>`;
  }
}


function saveAdd(ws){
  const typeEl = document.getElementById('add-type');
  const kmEl   = document.getElementById('add-km');
  const shoeEl = document.getElementById('add-shoe');
  const type = typeEl ? typeEl.value : 'ef';
  const km   = parseFloat(kmEl ? kmEl.value : 0) || 0;
  const shoe = shoeEl && shoeEl.value ? shoeEl.value : null;

  if(!type){ showAddError('Choisissez un type.'); return; }
  if(!km || km <= 0){ showAddError('Entrez une distance en km.'); return; }
  if(!shoe && getShoes().length>0){ showAddError('Choisissez une paire de chaussures.'); return; }

  // Planning (sched_day + sched_time) — commun à tous les types
  const schedDay  = parseInt((document.getElementById('sched-day')  || {}).value) || undefined;
  const schedHour = (document.getElementById('sched-hour') || {}).value;
  const schedMin  = (document.getElementById('sched-min')  || {}).value;
  const schedTime = schedDay && schedHour!=null
    ? (String(schedHour).padStart(2,'0') + ':' + String(schedMin||'00').padStart(2,'0'))
    : undefined;

  let name = '', detail = '';
  if(type === 'long'){
    const blocks = getLongBlocksData();
    name = 'EF longue';
    if(blocks.length > 0){
      const total = Math.round(blocks.reduce((a,b) => a+b.km, 0) * 10) / 10;
      if(Math.abs(total - km) >= 0.1){ showAddError('Total des blocs (' + total + ' km) ≠ distance (' + km + ' km). Ajuste les blocs.'); return; }
      detail = buildLongDetail(blocks);
    }
  } else if(type === 'tempo'){
    const reps = parseInt((document.getElementById('add-reps')     || {}).value) || 2;
    const dur  = parseInt((document.getElementById('add-dur')      || {}).value) || 8;
    const pMin = ((document.getElementById('add-pace-min') || {}).value || '5:00').trim();
    const pMax = ((document.getElementById('add-pace-max') || {}).value || '5:20').trim();
    const recup = ((document.getElementById('add-recup')   || {}).value || '3:00').trim();
    const efP  = ((document.getElementById('add-ef-pace')  || {}).value || '').trim();
    name   = 'Tempo ' + reps + '×' + dur + ' min';
    detail = pMin + ' — ' + pMax + ' /km';
    if(recup && recup !== '0' && reps > 1) detail += ' · ' + recup + ' min récup';
    if(efP) detail += ' · EF @ ' + efP;
  } else if(type === 'frac'){
    const reps = parseInt((document.getElementById('add-reps')     || {}).value) || 6;
    const dur  = parseInt((document.getElementById('add-dur')      || {}).value) || 2;
    const pMin = ((document.getElementById('add-pace-min') || {}).value || '4:30').trim();
    const pMax = ((document.getElementById('add-pace-max') || {}).value || '4:50').trim();
    const recup = ((document.getElementById('add-recup')   || {}).value || '3:00').trim();
    const efP  = ((document.getElementById('add-ef-pace')  || {}).value || '').trim();
    name   = 'Fractionné ' + reps + '×' + dur + ' min';
    detail = pMin + ' — ' + pMax + ' /km';
    if(recup && recup !== '0' && reps > 1) detail += ' · ' + recup + ' min récup';
    if(efP) detail += ' · EF @ ' + efP;
  } else {
    // EF
    const efPaceEl = document.getElementById('add-ef-pace');
    const efPace = efPaceEl ? efPaceEl.value.trim() : (getBestEfPace() || '6:40');
    name   = 'Footing EF';
    detail = efPace + '/km';
  }

  const d = detail ? (name + '|' + detail) : name;
  let ei = 0;
  while(state['extra_w' + ws + '_s' + ei]) ei++;
  const extraData = { d, km, type, shoe };
  if(schedDay)  extraData.sched_day  = schedDay;
  if(schedTime) extraData.sched_time = schedTime;
  state['extra_w' + ws + '_s' + ei] = JSON.stringify(extraData);
  save();
  closeModal();
  rendered.plan=false;
  rendered.stats=false;
  renderPlan();
  renderHome();
  if(_adminPreviewUid) _refreshAthleteCoachView();
}

function showAddError(msg){
  const existing=document.getElementById('add-error');
  if(existing) existing.remove();
  const btn=document.querySelector('[onclick^="saveAdd"]');
  if(!btn) return;
  const err=document.createElement('p');
  err.id='add-error';
  err.style.cssText='color:#E24B4A;font-size:12px;text-align:center;margin-top:8px;';
  err.textContent='⚠ '+msg;
  btn.parentNode.insertBefore(err,btn.nextSibling);
}

function onExEditTypeChange(){
  const type=document.getElementById('exedit-type').value;
  const container=document.getElementById('exedit-fields-container');
  if(!container) return;
  if(type==='long'){
    const detailInput=document.getElementById('exedit-detail');
    const existingDetail=detailInput?detailInput.value:'';
    container.innerHTML=buildLongModalHtml(existingDetail);
    renderLongBlocks();
  } else if(type==='tempo'){
    container.innerHTML=buildTempoFieldsHtml('exedit',2,8,'3:00','5:00','5:20','#E8530A');
  } else if(type==='frac'){
    container.innerHTML=buildTempoFieldsHtml('exedit',6,2,'2:00','4:30','4:50','#C4141B');
  } else {
    // EF — même pace picker que openEditModal
    const efPaceVal=getBestEfPace()||'6:40';
    const efPaces=["6:25","6:20","6:15","6:10","6:05","6:00","5:55","5:50","5:45","5:40","5:35","5:30"];
    const paceChips=efPaces.map(p=>`<button type="button" id="exedit-ef-chip-${p.replace(':','-')}" onclick="selectExEditEfPace('${p}')" style="padding:7px 11px;border-radius:20px;font-size:12px;font-weight:600;border:1.5px solid var(--border);background:var(--bg2);color:var(--muted);cursor:pointer;transition:all 0.15s;">${p}</button>`).join('');
    container.innerHTML=`
      <div class="modal-section" style="--_accent:#3B6D11;">
        <div class="modal-section-label" style="color:#3B6D11;">🟢 Allure cible</div>
        <div style="display:flex;align-items:stretch;gap:12px;margin-bottom:16px;">
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
            <input type="text" id="exedit-ef-pace" value="${efPaceVal}" placeholder="6:40" maxlength="5"
              oninput="updateExEditEfPreview()"
              style="background:var(--bg);border:3px solid #3B6D11;border-radius:14px;padding:14px 12px;font-size:32px;font-weight:900;color:#3B6D11;width:108px;outline:none;text-align:center;line-height:1;">
            <p style="font-size:9px;color:#3B6D11;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;">/km</p>
          </div>
          <div style="flex:1;background:#EAF3DE;border-radius:14px;padding:14px;display:flex;flex-direction:column;justify-content:center;gap:6px;">
            <div>
              <p style="font-size:9px;font-weight:800;color:#3B6D11;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">💓 Zone cible</p>
              <p style="font-size:16px;font-weight:900;color:#2D5A0E;">${(()=>{const z=getFcMaxZone();return z?z.min+'–'+z.max+' bpm':'—';})()}</p>
            </div>
            <div>
              <p style="font-size:9px;font-weight:800;color:#3B6D11;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">⏱ Durée estimée</p>
              <p style="font-size:18px;font-weight:900;color:#2D5A0E;" id="exedit-ef-preview-time">—</p>
            </div>
          </div>
        </div>
        <p style="font-size:9px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Raccourcis allure</p>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">${paceChips}</div>
      </div>`;
  }
}

function openEditExtraModal(ws, ei){
  const s=JSON.parse(state[`extra_w${ws}_s${ei}`]);
  const parts=s.d.split('|');
  const title=parts[0], detail=parts[1]||'';
  const mc=document.getElementById('modal-container');
  const shoeOptions=getShoeOptions(s.shoe);
  const typeOptions=['ef','tempo','frac','long','race'].map(t=>
    `<option value="${t}" ${s.type===t?'selected':''}>${typeLabel[t]}</option>`
  ).join('');

  // Champs selon le type
  let fieldsHtml='';
  if(s.type==='long'){
    fieldsHtml=buildLongModalHtml(detail);
  } else if(s.type==='tempo'||s.type==='frac'){
    const repMatch=title.match(/(\d+)×(\d+)/);
    const defReps=s.type==='frac'?6:2;
    const defDur=s.type==='frac'?2:8;
    const defPMin=s.type==='frac'?'4:30':'5:00';
    const defPMax=s.type==='frac'?'4:50':'5:20';
    const exReps=repMatch?parseInt(repMatch[1]):defReps;
    const exDur=repMatch?parseInt(repMatch[2]):defDur;
    // Extraire l'allure cible depuis "X'XX/km", "X:XX/km", "X:XX — Y:YY /km" ou "X:XX /km"
    const paceRangeMatchEx=detail.match(/(\d+)['':](\d+)\s*[–—-]\s*(\d+)['':](\d+)\s*\/km/);
    const paceKmMatchEx=paceRangeMatchEx?null:detail.match(/(\d+)['':](\d+)\s*\/km/);
    const exPMin=paceRangeMatchEx?paceRangeMatchEx[1]+':'+paceRangeMatchEx[2]:paceKmMatchEx?paceKmMatchEx[1]+':'+paceKmMatchEx[2]:defPMin;
    const exPMax=paceRangeMatchEx?paceRangeMatchEx[3]+':'+paceRangeMatchEx[4]:(()=>{const sx=paceKmMatchEx?parseInt(paceKmMatchEx[1])*60+parseInt(paceKmMatchEx[2]):null;return sx?Math.floor((sx+10)/60)+':'+((sx+10)%60<10?'0':'')+((sx+10)%60):defPMax;})();
    const recupMatch=detail.match(/([\d:]+)\s*min\s*r[eé]cup/i);
    const exRecup=recupMatch?parseInt(recupMatch[1]):'3:00';
    const accentCol=s.type==='frac'?'#C4141B':'#E8530A';
    fieldsHtml=buildTempoFieldsHtml('exedit',exReps,exDur,exRecup,exPMin,exPMax,accentCol);
  } else {
    // EF — même pace picker que openEditModal
    const paceMatch2=detail.match(/(\d+)[':](\d+)/);
    const efPaceVal=paceMatch2?paceMatch2[1]+':'+paceMatch2[2]:(getBestEfPace()||'6:40');
    const efPaces=["6:25","6:20","6:15","6:10","6:05","6:00","5:55","5:50","5:45","5:40","5:35","5:30"];
    const paceChips=efPaces.map(p=>`<button type="button" id="exedit-ef-chip-${p.replace(':','-')}" onclick="selectExEditEfPace('${p}')" style="padding:7px 11px;border-radius:20px;font-size:12px;font-weight:600;border:1.5px solid var(--border);background:var(--bg2);color:var(--muted);cursor:pointer;transition:all 0.15s;">${p}</button>`).join('');
    fieldsHtml=`
      <div class="modal-section" style="--_accent:#3B6D11;">
        <div class="modal-section-label" style="color:#3B6D11;">🟢 Allure cible</div>
        <div style="display:flex;align-items:stretch;gap:12px;margin-bottom:16px;">
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
            <input type="text" id="exedit-ef-pace" value="${efPaceVal}" placeholder="6:40" maxlength="5"
              oninput="updateExEditEfPreview()"
              style="background:var(--bg);border:3px solid #3B6D11;border-radius:14px;padding:14px 12px;font-size:32px;font-weight:900;color:#3B6D11;width:108px;outline:none;text-align:center;line-height:1;">
            <p style="font-size:9px;color:#3B6D11;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;">/km</p>
          </div>
          <div style="flex:1;background:#EAF3DE;border-radius:14px;padding:14px;display:flex;flex-direction:column;justify-content:center;gap:6px;">
            <div>
              <p style="font-size:9px;font-weight:800;color:#3B6D11;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">💓 Zone cible</p>
              <p style="font-size:16px;font-weight:900;color:#2D5A0E;">${(()=>{const z=getFcMaxZone();return z?z.min+'–'+z.max+' bpm':'—';})()}</p>
            </div>
            <div>
              <p style="font-size:9px;font-weight:800;color:#3B6D11;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">⏱ Durée estimée</p>
              <p style="font-size:18px;font-weight:900;color:#2D5A0E;" id="exedit-ef-preview-time">—</p>
            </div>
          </div>
        </div>
        <p style="font-size:9px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Raccourcis allure</p>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">${paceChips}</div>
      </div>`;
  }

  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.style.setProperty('--_overlay-bg','rgba(0,0,0,0.4)');
  const _typeColors={ef:'modal-header-ef',tempo:'modal-header-tempo',frac:'modal-header-frac',long:'modal-header-long'};
  const _hcls=_typeColors[s.type]||'modal-header-default';
  const _hacc={ef:'#3B6D11',tempo:'#E8530A',frac:'#C4141B',long:'#534AB7'}[s.type]||'#1B4FD8';
  overlay.innerHTML=`<div class="modal-box" style="max-height:92vh;">
    <div class="modal-header ${_hcls}" style="flex-shrink:0;">
      <div style="width:36px;height:4px;border-radius:4px;background:rgba(255,255,255,0.3);margin:0 auto 12px;"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div style="flex:1;min-width:0;">
          <p style="font-size:10px;font-weight:800;opacity:0.7;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:3px;color:#fff;">S${ws} · Modifier la séance</p>
          <p style="font-size:20px;font-weight:900;letter-spacing:-0.02em;line-height:1.1;color:#fff;">${title}</p>
          ${detail?`<p style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:3px;">${detail}</p>`:''}
        </div>
        <button onclick="closeModal()" style="background:rgba(255,255,255,0.2);border:none;cursor:pointer;color:#fff;font-size:18px;line-height:1;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">×</button>
      </div>
    </div>
    <div class="modal-scroll-body">
    <div class="modal-body" style="gap:0;">
      <div class="modal-section" style="background:linear-gradient(135deg,#EEF2FD,#E8EDFF);">
        <div class="modal-section-label" style="color:#1B4FD8;">📅 Planification</div>
        ${buildSchedFieldsHtml(s.sched_day||'', s.sched_time||'')}
      </div>
      <div id="exedit-fields-container" class="modal-section">${fieldsHtml}</div>
      <div class="modal-section">
        <div class="modal-section-label">📏 Distance & chaussures</div>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:14px;align-items:center;margin-bottom:10px;">
          <div style="text-align:center;">
            <div style="display:flex;align-items:center;gap:6px;">
              <button type="button" onclick="const el=document.getElementById('exedit-km');el.value=Math.max(0,parseFloat(el.value||0)-1);" style="width:30px;height:30px;border-radius:50%;border:1.5px solid var(--border);background:var(--bg);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">−</button>
              <input type="number" id="exedit-km" value="${s.km}" min="0" max="99" step="1" oninput="calcEfRestantForPrefix('exedit')" style="background:var(--bg);border:2px solid ${_hacc}40;border-radius:10px;padding:8px;font-size:22px;font-weight:800;color:${_hacc};width:66px;outline:none;text-align:center;">
              <button type="button" onclick="const el=document.getElementById('exedit-km');el.value=Math.min(99,parseFloat(el.value||0)+1);" style="width:30px;height:30px;border-radius:50%;border:1.5px solid var(--border);background:var(--bg);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">+</button>
            </div>
            <p style="font-size:9px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-top:4px;">km</p>
          </div>
          <div>
            <p style="font-size:9px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:6px;">👟 Chaussures</p>
            <select id="exedit-shoe" style="background:var(--bg);border:2px solid var(--border);border-radius:12px;padding:10px 12px;font-size:13px;font-weight:700;color:var(--text);width:100%;outline:none;cursor:pointer;">${shoeOptions}</select>
          </div>
        </div>
        <div>
          <p style="font-size:9px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:6px;">🏷 Type</p>
          <select id="exedit-type" onchange="onExEditTypeChange()" style="background:var(--bg);border:2px solid var(--border);border-radius:12px;padding:10px 12px;font-size:13px;font-weight:700;color:var(--text);width:100%;outline:none;cursor:pointer;">${typeOptions}</select>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px;">
        <button onclick="closeModal()" style="padding:14px;background:var(--bg2);border:2px solid var(--border);border-radius:14px;font-size:13px;font-weight:700;color:var(--muted);cursor:pointer;">Annuler</button>
        <button onclick="saveExtraEdit(${ws},${ei})" class="modal-btn-primary" style="background:${_hacc};">Enregistrer ✓</button>
      </div>
      <button onclick="deleteExtra(${ws},${ei})" style="width:100%;margin-top:10px;padding:13px;background:transparent;border:2px solid #E24B4A33;border-radius:14px;font-size:13px;font-weight:700;color:#E24B4A;cursor:pointer;">🗑 Supprimer cette séance</button>
    </div>
    </div><!-- /modal-scroll-body -->
  </div>`;
  overlay.onclick=e=>{if(e.target===overlay)closeModal();};
  _lockBodyScroll();
  mc.appendChild(overlay);
  _initSwipeToDismiss(overlay, overlay.querySelector('.modal-box'));
  if(s.type==='long') renderLongBlocks();
  if(s.type==='tempo'||s.type==='frac') setTimeout(()=>{ calcEfRestantForPrefix('exedit'); selectTempoEfPace('exedit', document.getElementById('exedit-ef-pace')?.value||getBestEfPace()||'6:40'); }, 50);
}

function saveExtraEdit(ws, ei){
  const type=document.getElementById('exedit-type').value;
  const km=parseFloat(document.getElementById('exedit-km').value)||0;
  const shoe=document.getElementById('exedit-shoe').value||null;
  let name='', detail='';
  if(type==='long'){
    const existing=JSON.parse(state[`extra_w${ws}_s${ei}`]);
    name=existing.d.split('|')[0]||'EF longue';
    const blocks=getLongBlocksData();
    if(blocks.length>0){
      const bTotal=Math.round(blocks.reduce((a,b)=>a+b.km,0)*10)/10;
      if(Math.abs(bTotal-km)>=0.1){alert('Total des blocs ('+bTotal+' km) ≠ distance planifiée ('+km+' km). Ajuste les blocs.');return;}
      detail=buildLongDetail(blocks);
    }
  } else if(type==='tempo'||type==='frac'){
    const reps=parseInt((document.getElementById('exedit-reps')||{}).value)||(type==='frac'?6:2);
    const dur=parseInt((document.getElementById('exedit-dur')||{}).value)||(type==='frac'?2:8);
    name=type==='frac'?`Fractionné ${reps}×${dur} min`:`Tempo ${reps}×${dur} min`;
    const pMin=((document.getElementById('exedit-pace-min')||{}).value||'').trim();
    const pMax=((document.getElementById('exedit-pace-max')||{}).value||'').trim();
    if(pMin&&pMax) detail=`${pMin} — ${pMax} /km`;
    else detail=type==='frac'?'4:30 — 4:50 /km':'5:00 — 5:20 /km';
    const recup=((document.getElementById('exedit-recup')||{}).value||'').trim();
    if(recup&&recup!=='0'&&reps>1) detail=detail+` · ${recup} min récup`;
    const exEditEfPace=((document.getElementById('exedit-ef-pace')||{}).value||'').trim().replace("'",":");
    if(exEditEfPace&&exEditEfPace.match(/\d+:\d+/)) detail=detail+` · EF @ ${exEditEfPace}`;
  } else {
    // EF — lire depuis le pace picker (exedit-ef-pace), format identique à saveEdit
    const efPaceEl=document.getElementById('exedit-ef-pace');
    const efPaceStr=efPaceEl?efPaceEl.value.trim():'';
    const existing3=JSON.parse(state[`extra_w${ws}_s${ei}`]||'{}');
    name=existing3.d.split('|')[0]||'Footing EF';
    detail=efPaceStr?efPaceStr+'/km':'';  // même format que saveEdit
  }
  const d=detail?`${name}|${detail}`:name;
  const existing2 = JSON.parse(state[`extra_w${ws}_s${ei}`]||'{}');
  const updatedExtra = {d, km, type, shoe};
  // Sauvegarder le créneau depuis le formulaire (buildSchedFieldsHtml génère sched-day/sched-hour/sched-min)
  const newSchedDay = parseInt((document.getElementById('sched-day')||{}).value)||undefined;
  const newSchedH   = (document.getElementById('sched-hour')||{}).value;
  const newSchedM   = (document.getElementById('sched-min') ||{}).value;
  if(newSchedDay){
    updatedExtra.sched_day  = newSchedDay;
    updatedExtra.sched_time = String(newSchedH||'08').padStart(2,'0')+':'+String(newSchedM||'00').padStart(2,'0');
  } else if(existing2.sched_day) {
    // Pas de nouveau créneau saisi → conserver l'ancien
    updatedExtra.sched_day  = existing2.sched_day;
    updatedExtra.sched_time = existing2.sched_time;
  }
  state[`extra_w${ws}_s${ei}`]=JSON.stringify(updatedExtra);
  save();closeModal();rendered.plan=false;rendered.stats=false;renderPlan();renderHome();
  if(_adminPreviewUid) _refreshAthleteCoachView();
}

function selectExEditEfPace(p){
  const inp=document.getElementById('exedit-ef-pace');
  if(inp){inp.value=p;updateExEditEfPreview();}
  document.querySelectorAll('[id^="exedit-ef-chip-"]').forEach(b=>{
    const sel=b.id==='exedit-ef-chip-'+p.replace(':','-');
    b.style.background=sel?'#3B6D11':'var(--bg2)';
    b.style.color=sel?'#fff':'var(--muted)';
    b.style.borderColor=sel?'#3B6D11':'var(--border)';
  });
}

function updateExEditEfPreview(){
  const paceInp=document.getElementById('exedit-ef-pace');
  const kmInp=document.getElementById('exedit-km');
  const timeEl=document.getElementById('exedit-ef-preview-time');
  if(!paceInp||!timeEl) return;
  const parts2=paceInp.value.split(':');
  const km2=parseFloat(kmInp?kmInp.value:0)||0;
  const sec2=parseInt(parts2[0]||0)*60+parseInt(parts2[1]||0);
  if(sec2>0&&km2>0){
    const total=Math.round(km2*sec2);
    const m2=Math.floor(total/60),s2=total%60;
    timeEl.textContent=m2+'min'+(s2>0?' '+String(s2).padStart(2,'0')+'s':'');
  } else { timeEl.textContent='—'; }
}

function deleteExtra(ws, ei){
  delete state[`extra_w${ws}_s${ei}`];
  save();closeModal();rendered.plan=false;rendered.stats=false;renderPlan();renderHome();
  if(_adminPreviewUid) _refreshAthleteCoachView();
}
