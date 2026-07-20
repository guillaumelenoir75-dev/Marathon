
function onEditTypeChange(){
  const type=document.getElementById('hm-type').value;
  const container=document.getElementById('hm-detail-container');
  const nameContainer=document.querySelector('#hm-detail-container')?.previousElementSibling;
  if(!container) return;
  if(type==='long'){
    // Récupérer le détail existant pour parser les blocs
    const detailInput=document.getElementById('hm-detail');
    const existingDetail=detailInput?detailInput.value:'';
    container.innerHTML=buildLongModalHtml(existingDetail);
    renderLongBlocks();
    // Masquer le champ nom standard
    const hmName=document.getElementById('hm-name');
    if(hmName) hmName.closest('div').style.display='none';
  } else if(type==='tempo'){
    container.innerHTML=buildTempoFieldsHtml('hm',2,8,'3:00','5:00','5:20');
    const hmName=document.getElementById('hm-name');
    if(hmName) hmName.closest('div').style.display='none';
    setTimeout(()=>selectTempoEfPace('hm', document.getElementById('hm-ef-pace')?.value||getBestEfPace()||'6:40'),50);
  } else if(type==='frac'){
    container.innerHTML=buildTempoFieldsHtml('hm',6,2,'2:00','4:30','4:50','#C4141B');
    const hmName=document.getElementById('hm-name');
    if(hmName) hmName.closest('div').style.display='none';
    setTimeout(()=>selectTempoEfPace('hm', document.getElementById('hm-ef-pace')?.value||getBestEfPace()||'6:40'),50);
  } else {
    container.innerHTML=`<div>
      <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;">Détail allure (optionnel)</p>
      <input type="text" id="hm-detail" value="" placeholder="ex: 10 EF · 3 AM @ 5:40/km" style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 12px;font-size:14px;color:var(--text);width:100%;outline:none;">
    </div>`;
    const hmName=document.getElementById('hm-name');
    if(hmName) hmName.closest('div').style.display='block';
  }
}

function buildTempoFieldsHtml(prefix, reps, dur, recup, pMin, pMax, accentColor, efPaceDefault){
  const showRecup = reps > 1;
  const O = accentColor || '#E8530A';
  const icon = O === '#C4141B' ? '⚡' : '🔥';
  const efPaceVal = efPaceDefault || getBestEfPace() || '6:40';
  return `
    <!-- Format blocs : grand et lisible -->
    <div class="modal-section">
      <div class="modal-section-label" style="color:${O};">${icon} Blocs d'effort</div>
      <div style="display:flex;align-items:center;gap:0;background:var(--bg);border-radius:16px;overflow:hidden;border:2px solid ${O}25;">
        <div style="flex:1;padding:16px 12px;text-align:center;border-right:1.5px solid ${O}20;">
          <p style="font-size:10px;font-weight:800;color:${O};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Répétitions</p>
          <input type="number" id="${prefix}-reps" value="${reps}" min="1" max="10" step="1"
            onchange="onTempoRepsChange('${prefix}')"
            style="background:none;border:none;outline:none;font-size:42px;font-weight:900;color:${O};width:100%;text-align:center;padding:0;">
        </div>
        <div style="padding:16px 6px;font-size:28px;font-weight:900;color:${O}50;">×</div>
        <div style="flex:1;padding:16px 12px;text-align:center;border-left:1.5px solid ${O}20;">
          <p style="font-size:10px;font-weight:800;color:${O};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Minutes</p>
          <input type="number" id="${prefix}-dur" value="${dur}" min="1" max="60" step="1"
            oninput="onTempoInputChange('${prefix}')"
            style="background:none;border:none;outline:none;font-size:42px;font-weight:900;color:${O};width:100%;text-align:center;padding:0;">
        </div>
      </div>
    </div>

    <!-- Récupération -->
    <div id="${prefix}-recup-container" class="modal-section" style="display:${showRecup?'block':'none'};">
      <div class="modal-section-label">⏸ Récupération entre les blocs</div>
      <div style="display:flex;align-items:center;gap:12px;">
        <input type="text" id="${prefix}-recup" value="${recup}" placeholder="3:00" maxlength="5"
          oninput="onTempoInputChange('${prefix}')"
          style="background:var(--bg);border:2px solid var(--border);border-radius:14px;padding:13px;font-size:28px;font-weight:800;color:var(--text);width:110px;outline:none;text-align:center;flex-shrink:0;">
        <div>
          <p style="font-size:13px;font-weight:700;color:var(--text);">min : sec</p>
          <p style="font-size:11px;color:var(--muted);margin-top:2px;">Footing léger entre chaque répét.</p>
        </div>
      </div>
    </div>

    <!-- Allure cible -->
    <div class="modal-section">
      <div class="modal-section-label" style="color:${O};">🎯 Allure cible /km</div>
      <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:end;gap:10px;">
        <div style="text-align:center;">
          <p style="font-size:10px;font-weight:800;color:${O};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">⚡ Rapide</p>
          <input type="text" id="${prefix}-pace-min" value="${pMin}" placeholder="5:00" maxlength="5"
            oninput="onTempoInputChange('${prefix}')"
            style="background:var(--bg);border:3px solid ${O};border-radius:14px;padding:14px 10px;font-size:28px;font-weight:900;color:${O};width:100%;outline:none;text-align:center;">
        </div>
        <div style="padding-bottom:14px;color:var(--muted);font-size:20px;font-weight:700;">—</div>
        <div style="text-align:center;">
          <p style="font-size:10px;font-weight:800;color:${O}80;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">🐢 Lente</p>
          <input type="text" id="${prefix}-pace-max" value="${pMax}" placeholder="5:20" maxlength="5"
            oninput="onTempoInputChange('${prefix}')"
            style="background:var(--bg);border:3px solid ${O}50;border-radius:14px;padding:14px 10px;font-size:28px;font-weight:900;color:${O};width:100%;outline:none;text-align:center;">
        </div>
      </div>
    </div>

    <!-- EF allure — échauffement · récup · fin -->
    <div class="modal-section">
      <div class="modal-section-label" style="color:#3B6D11;">🟢 Allure EF — échauffement · récup · fin</div>
      <div style="display:flex;align-items:stretch;gap:12px;margin-bottom:14px;">
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;">
          <input type="text" id="${prefix}-ef-pace" value="${efPaceVal}" maxlength="5"
            oninput="calcEfRestantForPrefix('${prefix}')"
            style="background:var(--bg);border:3px solid #3B6D11;border-radius:14px;padding:13px 10px;font-size:30px;font-weight:900;color:#3B6D11;width:104px;outline:none;text-align:center;line-height:1;">
          <p style="font-size:9px;color:#3B6D11;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;">/km</p>
        </div>
        <div style="flex:1;display:flex;flex-wrap:wrap;align-content:center;gap:6px;">
          ${['6:20','6:10','6:00','5:50','5:40','5:30'].map(p=>`<button type="button" id="${prefix}-ef-chip-${p.replace(':','-')}" onclick="selectTempoEfPace('${prefix}','${p}')" style="padding:6px 10px;border-radius:20px;font-size:12px;font-weight:700;border:1.5px solid var(--border);background:var(--bg);color:var(--muted);cursor:pointer;transition:all 0.15s;">${p}</button>`).join('')}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="modal-stat-card" style="background:#EEF2FD;border:none;">
          <div class="modal-stat-label" style="color:#1B4FD8;">⏱ Durée totale</div>
          <div class="modal-stat-value" style="color:#1B4FD8;" id="${prefix}-tempo-duration">—</div>
        </div>
        <div class="modal-stat-card" style="background:#EAF3DE;border:none;">
          <div class="modal-stat-label" style="color:#3B6D11;">🏁 EF de fin</div>
          <div class="modal-stat-value" style="color:#3B6D11;" id="${prefix}-ef-fin">—</div>
        </div>
      </div>
    </div>
    <div id="${prefix}-ef-restant-display" style="display:none;"></div>`;
}

function calcEfRestantForPrefix(prefix){
  // Cherche d'abord l'ID standardisé, sinon le fallback hérité (_buildTempoEditFields)
  const displayId = document.getElementById(prefix+'-ef-restant-display')
    ? prefix+'-ef-restant-display'
    : 'ef-restant-display';
  calcEfRestantGeneric(prefix, displayId);
}

function onTempoInputChange(prefix){
  calcEfRestantForPrefix(prefix);
}

function onTempoRepsChange(prefix){
  const repsEl=document.getElementById(prefix+'-reps');
  const recupContainer=document.getElementById(prefix+'-recup-container');
  if(repsEl&&recupContainer){
    recupContainer.style.display=parseInt(repsEl.value)>1?'block':'none';
  }
  calcEfRestantForPrefix(prefix);
}

// Alias for backward compatibility
function calcSessionDuration(s){ return estimateDuration(s); }

// Estime la durée d'une séance en secondes, retourne une string formatée
function estimateDuration(s) {
  if(!s || s.type==='rest') return '';
  const parts = s.d.split('|');
  const title = parts[0];
  const detail = parts[1]||'';
  const km = s.km;

  // Parser une allure 'M:SS' ou "M'SS" → min/km
  const parsePaceMin = (p) => {
    if(!p) return null;
    const m = p.replace("'",":").match(/(\d+):(\d+)/);
    return m ? parseInt(m[1]) + parseInt(m[2])/60 : null;
  };

  // Formater des minutes totales → '52'30"' ou '1h08'30"'
  const fmtDur = (totalMin) => {
    if(totalMin <= 0) return '';
    const totalSec = Math.round(totalMin * 60);
    const h = Math.floor(totalSec/3600);
    const m = Math.floor((totalSec%3600)/60);
    const s = totalSec%60;
    const base = h > 0 ? h+'h'+String(m).padStart(2,'0')+"'" : m+"'";
    return base + (s > 0 ? String(s).padStart(2,'0')+'"' : '');
  };

  if(s.type === 'ef' || s.type === 'long') {
    // Allure EF : chercher "EF @ X:XX" d'abord, sinon getBestEfPace
    // Ne jamais prendre l'allure AM (@ 5'40/km) comme allure EF
    const efAtMatch = detail.match(/EF\s*[@\s]\s*(\d+)['':](\d+)/i);
    let paceMin = efAtMatch ? parsePaceMin(efAtMatch[1]+':'+efAtMatch[2]) : null;
    if(!paceMin && s.type === 'ef') {
      // EF simple : chercher X:XX/km explicitement
      const efKmMatch = detail.match(/(\d+)[':](\d+)\/km/);
      paceMin = efKmMatch ? parsePaceMin(efKmMatch[1]+':'+efKmMatch[2]) : null;
    }
    if(!paceMin) {
      // Fallback : dernière allure EF validée
      const efStr = getBestEfPace()||"6'40";
      paceMin = parsePaceMin(efStr.replace("'",":")) || 5.8;
    }
    if(s.type === 'long') {
      // Long : blocs EF × paceMin + blocs AM × allure AM entraînement
      const amStr = getAmTrainingPace();
      const amMin = parsePaceMin((amStr||"5:40").replace("'",":")) || 5.67;
      let totalMin = 0;
      detail.split('·').forEach(part => {
        const m2 = part.trim().match(/^(\d+(?:\.\d+)?)\s*(EF|AM)/i);
        if(m2) totalMin += parseFloat(m2[1]) * (/AM/i.test(m2[2]) ? amMin : paceMin);
      });
      if(totalMin === 0) totalMin = km * paceMin; // fallback
      return fmtDur(totalMin);
    }
    return fmtDur(km * paceMin);
  }

  if(s.type === 'tempo' || s.type === 'frac') {
    const isFrac = s.type === 'frac';
    const repMatch = title.match(/(\d+)[×x×](\d+)/);
    const reps = repMatch ? parseInt(repMatch[1]) : (isFrac ? 6 : 2);
    const durMin = repMatch ? parseInt(repMatch[2]) : (isFrac ? 2 : 8);

    const efDetailMatch = detail.match(/EF\s*[@\s]\s*(\d+)['':](\d+)/i);
    const paceEf = efDetailMatch
      ? (parsePaceMin(efDetailMatch[1]+':'+efDetailMatch[2]) || 6.67)
      : (parsePaceMin((getBestEfPace()||"6'40").replace("'",":")) || 6.67);

    // 1ère allure dans le detail = allure des blocs
    const paceMatch2 = detail.match(/(\d+)[':](\d+)/);
    const paceBlocMin = paceMatch2 ? parsePaceMin(paceMatch2[1]+':'+paceMatch2[2]) : (isFrac ? 4.5 : 4.92);

    const recupMatch = detail.match(/([\d:]+)\s*min\s*r[eé]cup/i);
    const recupMinutes = recupMatch ? (()=>{
      const rp = recupMatch[1].split(':');
      return rp.length>1 ? parseInt(rp[0])+parseInt(rp[1])/60 : parseFloat(rp[0])||(isFrac?2:3);
    })() : (isFrac ? 2 : 3);

    const KM_ECHA = isFrac ? 2.0 : 3.0;
    const kmBlocs = paceBlocMin ? (reps * durMin) / paceBlocMin : 0;
    const kmRecup = (reps * recupMinutes) / paceEf;
    const kmEfRestantRaw = km - KM_ECHA - kmBlocs - kmRecup;
    const kmEfRestant = kmEfRestantRaw <= 0 ? kmEfRestantRaw : Math.ceil(kmEfRestantRaw * 2) / 2;
    const totalMin = (KM_ECHA * paceEf) + (reps * durMin) + (reps * recupMinutes) + (Math.max(0,kmEfRestant) * paceEf);
    return fmtDur(totalMin);
  }

  return '';
}
// ── Calcul durée estimée d'une séance ────────────────────────────────────
function calcEfRestant(){ calcEfRestantGeneric('edit', 'ef-restant-display'); }
function calcEfRestantGeneric(prefix, displayId){
  const display = document.getElementById(displayId);
  if(!display) return;

  // Lire les valeurs des champs
  const reps = parseInt(document.getElementById(prefix+'-reps')?.value)||2;
  const durMin = parseInt(document.getElementById(prefix+'-dur')?.value)||8;
  const kmTotal = parseFloat(document.getElementById(prefix+'-km')?.value)||0;
  const recupRaw = (document.getElementById(prefix+'-recup')?.value||'3').trim();
  const paceMinRaw = (document.getElementById(prefix+'-pace-min')?.value||'5:00').trim();

  if(!kmTotal || kmTotal <= 0) { display.innerHTML = '<span style="color:var(--muted);font-size:12px;">Renseigne la distance totale pour voir le calcul.</span>'; return; }

  // Parser allure tempo (ex: "4:55" ou "4'55")
  const parsePace = (p) => {
    const clean = p.replace("'",":").replace(",",":");
    const parts = clean.split(':');
    if(parts.length<2) return null;
    return parseInt(parts[0]) + parseInt(parts[1])/60; // en min/km
  };

  // Parser récupération (ex: "3" ou "3:00" ou "2:30")
  const parseRecup = (r) => {
    if(!r) return 3;
    const clean = r.replace("'",":").replace(",",":");
    const parts = clean.split(':');
    if(parts.length===1) return parseFloat(parts[0])||3;
    return parseInt(parts[0]) + parseInt(parts[1])/60;
  };

  const paceTempoMin = parsePace(paceMinRaw); // allure min des blocs (la plus rapide)
  const efPaceField = document.getElementById(prefix+'-ef-pace');
  const efPaceStr = (efPaceField && efPaceField.value.trim()) || getBestEfPace() || "6'00";
  const paceEfMin = parsePace(efPaceStr.replace("'",":")) || 6.0;
  const recupMinutes = parseRecup(recupRaw);

  if(!paceTempoMin) { display.innerHTML = '<span style="color:var(--muted);">Allure tempo invalide.</span>'; return; }

  // Calculs
  const KM_ECHAUFFEMENT = 3.0;
  const kmBlocs = (reps * durMin) / paceTempoMin;                        // km sur les blocs tempo
  const kmRecup = (reps * recupMinutes) / paceEfMin; // km sur les récups EF (1 récup après chaque bloc)
  const kmEfRestantRaw = kmTotal - KM_ECHAUFFEMENT - kmBlocs - kmRecup;
  // Arrondi au 0.5 supérieur
  const kmEfRestant = kmEfRestantRaw <= 0 ? kmEfRestantRaw : Math.ceil(kmEfRestantRaw * 2) / 2;

  // Affichage
  const fmt = (km) => km >= 1
    ? Math.round(km*100)/100 + ' km'
    : Math.round(km*1000) + ' m';

  const couleur = kmEfRestant < 0 ? '#ef4444' : '#3B6D11';
  const emoji = kmEfRestant < 0 ? '⚠️' : '✓';

  // Remplir les nouveaux champs compacts si présents
  const durEl1 = document.getElementById(prefix+'-tempo-duration');
  const efFinEl1 = document.getElementById(prefix+'-ef-fin');
  if(durEl1) {
    // Utiliser la même formule que le header (estimateDuration via le contexte actuel)
    const totalMin2 = (KM_ECHAUFFEMENT*paceEfMin) + (reps*durMin) + (reps*recupMinutes) + (Math.max(0,kmEfRestant)*paceEfMin);
    const ts2=Math.round(totalMin2*60), h2=Math.floor(ts2/3600), m2=Math.floor((ts2%3600)/60), s2=ts2%60;
    const base2 = h2>0 ? h2+'h'+String(m2).padStart(2,'0')+"'" : m2+"'";
    const durStr2 = base2 + (s2>0 ? String(s2).padStart(2,'0')+'"' : '');
    durEl1.textContent = durStr2;
    // Synchroniser le header modal
    const hdrTempo=document.querySelector('.modal-box p[style*="color:var(--blue)"][style*="font-weight:600"]');
    if(hdrTempo&&hdrTempo.textContent.includes('estimées')) hdrTempo.textContent='⏱ ~'+durStr2+' estimées';
  }
  if(efFinEl1) {
    efFinEl1.textContent = kmEfRestant < 0 ? '⚠️ -'+Math.abs(Math.round(kmEfRestant*10)/10)+'km' : Math.round(kmEfRestant*10)/10+' km';
    efFinEl1.style.color = kmEfRestant < 0 ? '#ef4444' : '#3B6D11';
  }
  display.innerHTML =
    '<div style="display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:12px;">'
    + '<span style="color:var(--muted);">Échauffement EF</span><span style="font-weight:600;">'+KM_ECHAUFFEMENT+' km</span>'
    + '<span style="color:var(--muted);">'+reps+'×'+durMin+'min tempo ('+paceMinRaw+'/km)</span><span style="font-weight:600;">'+fmt(kmBlocs)+'</span>'
    + '<span style="color:var(--muted);">'+reps+'×'+recupRaw+'min récup EF ('+efPaceStr+'/km)</span><span style="font-weight:600;">'+fmt(kmRecup)+'</span>'
    + '<span style="color:var(--muted);">Total utilisé</span><span style="font-weight:600;">'+fmt(KM_ECHAUFFEMENT+kmBlocs+kmRecup)+'</span>'
    + '</div>'
    + '<div style="margin-top:8px;padding:8px 10px;background:white;border-radius:6px;border:1.5px solid '+couleur+';display:flex;align-items:center;justify-content:space-between;">'
    + '<span style="font-size:12px;font-weight:600;color:'+couleur+';">'+emoji+' EF de fin</span>'
    + '<span style="font-size:18px;font-weight:800;color:'+couleur+';">'+(kmEfRestant<0?'⚠️ -'+fmt(Math.abs(kmEfRestant)):fmt(kmEfRestant))+'</span>'
    + '</div>'
    + (kmEfRestant < 0 ? '<p style="font-size:11px;color:#ef4444;margin-top:4px;">Distance totale insuffisante pour ce format — augmente les km.</p>' : '');
}

function buildLongModalHtml(detail, totalKm){
  totalKm=totalKm||0;
  // Infos course depuis onboarding
  let ob={};try{ob=state.onboarding?(typeof state.onboarding==='string'?JSON.parse(state.onboarding):state.onboarding):{};}catch(e){}
  const course=ob.course||'Marathon';
  const raceLabelMap={'5 km':'A5','10 km':'A10','Semi-marathon':'SEMI','Marathon':'AM','Plaisir':'EF'};
  const raceLabel=raceLabelMap[course]||'AM';
  const raceNameMap={'5 km':'5km','10 km':'10km','Semi-marathon':'semi','Marathon':'marathon','Plaisir':'—'};
  // Calculer l'allure de course cible
  let racePace=getAmTrainingPace();
  if(ob.target_time){
    const tp=ob.target_time.split(':').map(Number);
    const ts=tp[0]*3600+tp[1]*60+(tp[2]||0);
    const dist={'5 km':5,'10 km':10,'Semi-marathon':21.1,'Marathon':42.195}[course]||42.195;
    if(ts>0){const sec=ts/dist;const m=Math.floor(sec/60),s=Math.round(sec%60);racePace=`${m}'${String(s).padStart(2,'0')}`;}
  }
  // Extraire l'allure EF si déjà sauvegardée dans le detail
  const efPaceMatch=(detail||'').match(/EF\s*[@\s]\s*(\d+)['':](\d+)/);
  const currentEfPace=efPaceMatch?efPaceMatch[1]+':'+efPaceMatch[2]:(getBestEfPace()||'6:40').replace("'",'::').replace(/:(\d{3}).*/,'').replace('::',"'");
  const blocks=[];
  // Parser 1 : format généré "X km EF → finir Y km à Z/km (allure W)"
  const detailStr=detail||'';
  let parsedSpecific=false;
  detailStr.split('·').forEach(part=>{
    const p=part.trim();
    const specMatch=p.match(/(\d+)\s+km\s+EF.*finir\s+(\d+)\s+km\s+à\s*[\d':\s]+\/km\s*\(allure\s+([\w\s-]+)\)/i);
    if(specMatch){
      blocks.push({km:parseInt(specMatch[1]),type:'EF'});
      const ct=specMatch[3].trim().toLowerCase();
      const rt=ct.includes('marathon')&&!ct.includes('semi')?'AM':ct.includes('semi')?'SEMI':ct.includes('10')?'A10':ct.includes('5')?'A5':'AM';
      blocks.push({km:parseInt(specMatch[2]),type:rt});
      parsedSpecific=true;
      return;
    }
    if(parsedSpecific) return;
    // Parser 2 : format sauvegardé "X EF" ou "X AM/A10/A5/SEMI @ pace"
    const m=p.match(/^(\d+(?:\.\d+)?)\s*(EF|AM|A10|A5|ASEMI|SEMI)\b/i);
    if(m) blocks.push({km:parseFloat(m[1]),type:m[2].toUpperCase()});
  });
  // Fallback : si aucun bloc parsé, détecter si la séance est spécifique (allure course)
  // Pour les séances EF pures (Phase 1/2), on crée un seul bloc EF — jamais de bloc race par défaut
  if(blocks.length===0){
    const km=totalKm||8;
    const hasRacePace=/finir\s+\d+\s+km|allure\s*(marathon|semi|10\s*km|5\s*km|course)|\b(A10|AM|ASEMI|SEMI|A5)\b/i.test(detailStr);
    if(hasRacePace){
      const specKm=course==='Marathon'?(km>=28?10:km>=24?8:6)
        :course==='Semi-marathon'?(km>=18?6:km>=14?4:3)
        :course==='10 km'?(km>=14?4:km>=12?3:2)
        :course==='5 km'?(km>=10?2:1):3;
      const efKm=Math.max(km-specKm,1);
      blocks.push({km:efKm,type:'EF'});
      blocks.push({km:specKm,type:raceLabel});
    } else {
      // Séance EF pure (Phase 1/2 ou nouvelle séance vide) → un seul bloc EF
      blocks.push({km:km,type:'EF'});
    }
  }
  const blocksJson=JSON.stringify(blocks).replace(/"/g,'&quot;');
  const efPaces=['6:25','6:20','6:15','6:10','6:05','6:00','5:55','5:50','5:45','5:40','5:35','5:30'];
  const efChips=efPaces.map(p=>`<button type="button" id="long-ef-chip-${p.replace(':','-')}" onclick="selectLongEfPace('${p}')" style="padding:5px 9px;border-radius:20px;font-size:11px;font-weight:600;border:1.5px solid var(--border);background:var(--bg2);color:var(--muted);cursor:pointer;transition:all 0.15s;">${p}</button>`).join('');
  return '<div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">'
    +'<div style="background:#EAF3DE;border-radius:8px;padding:9px 12px;">'
    +'<p style="font-size:10px;color:#3B6D11;margin-bottom:4px;">Allure EF</p>'
    +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">'
    +'<input type="text" id="long-ef-pace" value="'+currentEfPace+'" maxlength="5" oninput="updateLongDuration();highlightLongEfChip(this.value)" style="background:var(--bg);border:2px solid #3B6D11;border-radius:8px;padding:6px 8px;font-size:17px;font-weight:700;color:#3B6D11;width:72px;outline:none;text-align:center;">'
    +'<span style="font-size:11px;color:var(--muted);">/km</span>'
    +'</div>'
    +'<div style="display:flex;flex-wrap:wrap;gap:4px;">'+efChips+'</div>'
    +'</div>'
    +'<div style="display:flex;flex-direction:column;gap:6px;">'
    +'<div style="background:#EEF2FD;border-radius:8px;padding:9px 12px;">'
    +'<p style="font-size:10px;color:var(--muted);margin-bottom:3px;">Allure '+raceLabel+'</p>'
    +'<p style="font-size:15px;font-weight:700;color:var(--blue);">'+racePace+' /km</p>'
    +'</div>'
    +'<div style="background:#F0FDF4;border-radius:8px;padding:9px 12px;" id="long-duration-box">'
    +'<p style="font-size:10px;color:#3B6D11;margin-bottom:3px;">Durée estimée</p>'
    +'<p style="font-size:15px;font-weight:700;color:#3B6D11;" id="long-duration-val">—</p>'
    +'</div>'
    +'</div>'
    +'</div>'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;"><p style="font-size:10px;font-weight:800;color:#534AB7;text-transform:uppercase;letter-spacing:0.1em;">🗓 Organisation de la séance</p></div>'
    +'<div id="long-blocks" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px;"></div>'
    +'<div id="long-blocks-total" style="font-size:13px;font-weight:800;padding:10px 14px;border-radius:12px;border:2px solid;margin-bottom:10px;"></div>'
    +'<button onclick="addLongBlock()" style="width:100%;padding:11px;background:var(--bg);border:2px dashed #534AB750;border-radius:12px;font-size:13px;font-weight:700;color:#534AB7;cursor:pointer;">+ Ajouter un bloc</button>'
    +'<input type="hidden" id="long-blocks-data" value="'+blocksJson+'">'
    +'</div>';
}

function openHomeModal(idx){
  openEditModal(CW, idx);
}
function saveHomeModal(idx){
  saveEdit(CW, idx);
}
function clearHomeModal(idx){
  resetSession(CW, idx);
}
function openModal(idx){
  const s=weeks[CW-1].sessions[idx],cur=state[gk(CW,idx)+'km']||'';
  const mc=document.getElementById('modal-container');
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.innerHTML=`<div class="modal-box">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <p style="font-size:16px;font-weight:600;color:var(--text);">${s.d}</p>
      <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:24px;line-height:1;">×</button>
    </div>
    ${s.shoe?`<div style="margin-bottom:12px;">${shoeFullBadge(s.shoe)}</div>`:''}
    <p style="font-size:13px;color:var(--muted);margin-bottom:14px;">Planifié : <strong style="color:var(--text);">${s.km} km</strong> — saisissez vos km réels :</p>
    <input type="number" id="modal-input" min="0" max="99" step="1" value="${cur}" placeholder="${s.km}" style="margin-bottom:16px;font-size:22px;text-align:center;font-weight:700;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <button class="btn-secondary" onclick="clearKm(${idx})">Effacer</button>
      <button style="padding:12px;background:#1B4FD8;border:none;border-radius:var(--radius-sm);font-size:14px;font-weight:600;color:#fff;cursor:pointer;" onclick="saveKm(${idx})">Enregistrer</button>
    </div>
  </div>`;
  overlay.onclick=e=>{if(e.target===overlay)closeModal();};
  _lockBodyScroll();
  mc.appendChild(overlay);
}
function _lockBodyScroll(){
  if(document.body.dataset.scrollLocked) return; // déjà verrouillé
  const sy = window.scrollY || 0;
  document.body.dataset.scrollLocked = '1';
  document.body.dataset.scrollY = sy;
  document.body.style.position = 'fixed';
  document.body.style.top = '-' + sy + 'px';
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.overflow = 'hidden';
}
function _unlockBodyScroll(){
  if(!document.body.dataset.scrollLocked) return;
  const sy = parseInt(document.body.dataset.scrollY || '0', 10);
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.overflow = '';
  delete document.body.dataset.scrollLocked;
  delete document.body.dataset.scrollY;
  window.scrollTo(0, sy);
}
function closeModal(){
  _unlockBodyScroll();
  const mc=document.getElementById('modal-container');
  if(!mc) return;
  const overlay=mc.firstElementChild;
  const box=overlay&&overlay.querySelector('.modal-box');
  if(overlay && box){
    // Stopper les animations CSS en cours
    overlay.style.animation='none';
    box.style.animation='none';
    // Forcer reflow pour figer l'état actuel
    void overlay.offsetHeight;
    // Animer l'overlay entier vers le bas (pas limité par overflow/clip)
    // Même durée que l'ouverture (0.32s), easing identique
    overlay.style.transition='transform 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.4s ease';
    overlay.style.transform='translateY(100%)';
    overlay.style.opacity='0';
    setTimeout(()=>{mc.innerHTML='';_prefilledModif=null;_selectedModifSi=null;},520);
  } else if(mc){
    mc.innerHTML='';_prefilledModif=null;_selectedModifSi=null;
  }
}
function _initSwipeToDismiss(overlay, box) {
  let startY = 0, startX = 0, startScrollTop = 0, dragging = false, currentY = 0, directionLocked = false, isHorizontal = false;
  const THRESHOLD = 120; // px pour déclencher la fermeture
  const VELOCITY_THRESHOLD = 0.5; // px/ms

  box.addEventListener('touchstart', function(e) {
    // Permettre le swipe seulement si on est tout en haut du scroll
    const scrollable = box.querySelector('.modal-scroll-body') || box.querySelector('[style*="overflow-y:auto"]') || box;
    startScrollTop = scrollable.scrollTop || 0;
    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
    currentY = 0;
    dragging = false;
    directionLocked = false;
    isHorizontal = false;
  }, {passive: true});

  let lastY = 0, lastTime = 0;
  box.addEventListener('touchmove', function(e) {
    const dy = e.touches[0].clientY - startY;
    const dx = e.touches[0].clientX - startX;
    const now = Date.now();

    // Déterminer la direction dominante dès qu'on a assez de déplacement
    if (!directionLocked && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      directionLocked = true;
      isHorizontal = Math.abs(dx) > Math.abs(dy);
    }

    // Si geste horizontal : bloquer complètement
    if (isHorizontal) {
      e.preventDefault();
      return;
    }

    const scrollable = box.querySelector('.modal-scroll-body') || box.querySelector('[style*="overflow-y:auto"]') || box;
    const atTop = (scrollable.scrollTop || 0) <= 0;

    // Commencer le drag seulement si on tire vers le bas ET qu'on est en haut
    if (!dragging && dy > 8 && atTop) {
      dragging = true;
      box.style.transition = 'none';
    }
    if (!dragging) return;

    currentY = Math.max(0, dy); // pas vers le haut
    box.style.transform = `translateY(${currentY}px)`;
    // Assombrir proportionnellement
    const ratio = Math.min(currentY / 300, 1);
    overlay.style.background = `rgba(0,0,0,${0.4 * (1 - ratio * 0.7)})`;

    lastY = e.touches[0].clientY;
    lastTime = now;
    if (currentY > 20) e.preventDefault();
  }, {passive: false});

  box.addEventListener('touchend', function(e) {
    if (!dragging) return;
    dragging = false;

    const velocity = lastTime ? (currentY / (Date.now() - (lastTime - 50))) : 0;
    const shouldClose = currentY > THRESHOLD || velocity > VELOCITY_THRESHOLD;

    if (shouldClose) {
      // Animer depuis la position actuelle du doigt jusqu'en bas
      // durée proportionnelle à la distance restante, min 600ms max 1200ms
      const boxH = box.offsetHeight;
      const remaining = Math.max(boxH - currentY, 80);
      const swipeDuration = Math.round(Math.min(Math.max(remaining / 600 * 1000, 600), 1200));
      // Figer overlay à sa position, puis animer vers le bas
      overlay.style.animation = 'none';
      overlay.style.transition = 'none';
      void overlay.offsetHeight;
      overlay.style.transition = `transform ${swipeDuration}ms cubic-bezier(0.22,1,0.36,1), opacity ${Math.round(swipeDuration * 0.75)}ms ease`;
      overlay.style.transform = 'translateY(100%)';
      overlay.style.opacity = '0';
      setTimeout(() => {
        _unlockBodyScroll();
        const mc = document.getElementById('modal-container');
        if (mc) { mc.innerHTML = ''; _prefilledModif = null; _selectedModifSi = null; }
      }, swipeDuration + 30);
    } else {
      // Snap back
      box.style.transition = 'transform 0.3s cubic-bezier(0.32,0.72,0,1)';
      box.style.transform = 'translateY(0)';
      overlay.style.transition = 'background 0.2s ease';
      overlay.style.background = 'var(--_overlay-bg, rgba(0,0,0,0.4))';
      setTimeout(() => { box.style.transition = ''; }, 320);
    }
    currentY = 0;
  }, {passive: true});
}

function saveKm(idx){
  const v=parseFloat(document.getElementById('modal-input').value);
  if(!isNaN(v)&&v>=0){state[gk(CW,idx)+'km']=v;state[gk(CW,idx)+'done']=true;save();if(dbRef) dbRef.child('_last_validation_w'+CW).set(Date.now()).catch(()=>{});}
  closeModal();renderHome();rendered.stats=false;if(document.getElementById('sc-stats').style.display!=='none')renderStats();
}
function clearKm(idx){delete state[gk(CW,idx)+'km'];save();closeModal();renderHome();rendered.stats=false;if(document.getElementById('sc-stats').style.display!=='none')renderStats();}
function confirmUndoSession(onConfirm){
  const mc=document.getElementById('modal-container');
  if(!mc) return;
  mc.innerHTML=`<div onclick="this.parentElement.innerHTML=''" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9000;display:flex;align-items:flex-end;justify-content:center;padding-bottom:env(safe-area-inset-bottom,0px);">
    <div onclick="event.stopPropagation()" style="background:#fff;border-radius:20px 20px 0 0;padding:24px 20px 20px;width:100%;max-width:480px;box-shadow:0 -8px 32px rgba(0,0,0,0.18);">
      <div style="text-align:center;margin-bottom:16px;">
        <div style="font-size:32px;margin-bottom:8px;">↩️</div>
        <p style="font-size:16px;font-weight:800;color:#0C447C;margin-bottom:6px;">Annuler la validation ?</p>
        <p style="font-size:13px;color:#6B8DB5;line-height:1.4;">Les données enregistrées (km, allure, perf)<br>seront supprimées.</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <button id="_undo-confirm-btn" style="background:#C0392B;color:#fff;border:none;border-radius:14px;padding:14px;font-size:15px;font-weight:800;cursor:pointer;width:100%;">Oui, annuler la validation</button>
        <button onclick="document.getElementById('modal-container').innerHTML=''" style="background:#EDF2FB;color:#0C447C;border:none;border-radius:14px;padding:13px;font-size:15px;font-weight:700;cursor:pointer;width:100%;">Non, garder</button>
      </div>
    </div>
  </div>`;
  document.getElementById('_undo-confirm-btn').onclick=()=>{
    mc.innerHTML='';
    onConfirm();
  };
}

function toggleDone(idx){
  const k=gk(CW,idx)+'done';
  const wasDone=!!state[k];
  const wasSkip=!!state[gk(CW,idx)+'skip'];
  if(!wasDone&&!wasSkip){
    openValidationModal(idx);
  } else if(wasSkip){
    openValidationModal(idx);
  } else {
    confirmUndoSession(()=>{
      state[k]=false;
      delete state[gk(CW,idx)+'km'];
      delete state[gk(CW,idx)+'perf'];
      delete state[gk(CW,idx)+'skip'];
      delete state[gk(CW,idx)+'skip_reason'];
      save();
      renderHome();
      rendered.stats=false;
      if(document.getElementById('sc-stats').style.display!=='none')renderStats();
    });
  }
}

const openWeeks=new Set();
function getAthleteCW(){
  if(!state.plan_start_date) return 1;
  const now=new Date();
  let startDate=new Date(state.plan_start_date);
  const diffDays=Math.floor((now-startDate)/(1000*60*60*24));
  let cw=Math.max(1,Math.floor(diffDays/7)+1);
  // Auto-correction : si CW dépasse le nombre de semaines du plan,
  // recalculer plan_start_date depuis le sched_date de la première séance.
  // Couvre les plans créés avant le fix du 06/07/2026 (plan_start_date = jour de création au lieu du lundi de départ).
  const maxW=getAthleteMaxWeek();
  if(cw>maxW&&maxW>0){
    for(let w=1;w<=52;w++){
      if(!state['extra_w'+w+'_s0']) continue;
      try{
        const s=JSON.parse(state['extra_w'+w+'_s0']);
        if(!s.sched_date) break;
        const d=new Date(s.sched_date+'T00:00:00'); const dw=d.getDay();
        const mon=new Date(d); mon.setDate(d.getDate()+(dw===0?-6:1-dw));
        const iso=mon.toISOString().split('T')[0];
        if(iso!==state.plan_start_date){
          state.plan_start_date=iso;
          if(dbRef) dbRef.child('plan_start_date').set(iso).catch(()=>{});
        }
        startDate=mon;
        const d2=Math.floor((now-startDate)/(1000*60*60*24));
        cw=Math.max(1,Math.floor(d2/7)+1);
        break;
      }catch(e){ break; }
    }
  }
  return cw;
}

function renderAthletePlan(el){
  const ACW=getAthleteCW();
  // Collecter toutes les semaines avec séances extra
  const weekNums=new Set();
  for(let ws=1;ws<=52;ws++){if(state['extra_w'+ws+'_s0']) weekNums.add(ws);}

  if(weekNums.size===0){
    el.innerHTML=`<div style="text-align:center;padding:48px 24px;color:#888;">
      <div style="font-size:40px;margin-bottom:12px;">📋</div>
      <p style="font-size:15px;font-weight:600;color:#444;margin-bottom:8px;">Ton plan est vide</p>
      <p style="font-size:13px;color:#888;margin-bottom:20px;">Ajoute tes premières séances pour construire ton plan.</p>
      <button onclick="openAddModal(1)" style="padding:12px 24px;background:#1B4FD8;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;">+ Ajouter une séance</button>
      <div style="margin-top:10px;">
        <button onclick="showOnboarding(true)" style="padding:12px 24px;background:#EAF3DE;color:#3B6D11;border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;">✨ Générer un plan</button>
      </div>
    </div>`;
    return;
  }

  // Précalculer km par semaine pour détecter les semaines de décharge
  const weekKmMap={};
  for(let ws=1;ws<=52;ws++){
    if(!state['extra_w'+ws+'_s0']) continue;
    let t=0,ei=0;
    while(ei<=20&&state[`extra_w${ws}_s${ei}`]){try{t+=parseFloat(JSON.parse(state[`extra_w${ws}_s${ei}`]).km)||0;}catch(e){}ei++;}
    weekKmMap[ws]=Math.round(t*10)/10;
  }
  const sortedWeeks=[...weekNums].sort((a,b)=>a-b);

  // Trouver la semaine de course finale : priorité 1) _isRace:true, 2) d contenant '🏆', 3) dernière race trouvée
  let raceWeekNum=null,raceSessionData=null;
  let fallbackWeekNum=null,fallbackSessionData=null;
  for(const ws of sortedWeeks){
    let ei=0;
    while(ei<=20&&state[`extra_w${ws}_s${ei}`]){
      try{
        const s=JSON.parse(state[`extra_w${ws}_s${ei}`]);
        if(s.type==='race'){
          if(s._isRace||(s.d&&s.d.includes('🏆'))){
            // Race finale confirmée
            raceWeekNum=ws;raceSessionData=s;
          } else {
            // Course test ou race sans flag — garder comme fallback (la dernière gagne)
            fallbackWeekNum=ws;fallbackSessionData=s;
          }
        }
      }catch(e){}
      ei++;
    }
  }
  // Si aucune race finale confirmée, utiliser la dernière race du plan
  if(!raceSessionData&&fallbackSessionData){raceWeekNum=fallbackWeekNum;raceSessionData=fallbackSessionData;}
  // Boutons de gestion du plan
  const actionBanner=document.createElement('div');
  actionBanner.style.cssText='display:flex;justify-content:flex-end;gap:8px;margin-bottom:12px;';
  const regenBtn=_adminPreviewUid?'':`<button onclick="confirmModifyPlan()" style="background:#EEF2FD;border:1px solid #c7d7f8;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;color:#1B4FD8;cursor:pointer;">✏️ Modifier mon plan</button>`;
  const updateBtn=_adminPreviewUid?`<button onclick="cvRegeneratePlan()" style="background:#EBF0FF;border:1px solid #b3c5f5;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;color:#1B4FD8;cursor:pointer;">🔄 Mettre à jour</button>`:'';
  const regenDateBtn=_adminPreviewUid?`<button onclick="openRegenFromDateModal()" style="background:#FFF7ED;border:1px solid #fed7aa;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;color:#C2610A;cursor:pointer;">📅 Regen. date</button>`:'';
  const delBtn=_adminPreviewUid?`<button onclick="cvDeletePlan()" style="background:#fff0f0;border:1px solid #ffcdd2;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;color:#c0392b;cursor:pointer;">🗑 Supprimer</button>`:'';
  const legendBtn=`<button onclick="openGlossary()" style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:6px 10px;font-size:12px;font-weight:600;color:var(--muted);cursor:pointer;display:inline-flex;align-items:center;gap:4px;" title="Comprendre les types de séances et les phases">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
    Légende
  </button>`;
  actionBanner.style.cssText='display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-bottom:12px;';
  actionBanner.innerHTML=legendBtn+regenBtn+updateBtn+regenDateBtn+delBtn;
  el.appendChild(actionBanner);

  let currentRenderMonth=-1; // pour séparateurs de mois
  const maxWeekKm=Math.max(...sortedWeeks.map(w=>weekKmMap[w]||0),1);

  sortedWeeks.forEach((ws,wsIdx)=>{
    const isCur=ws===ACW, isPast=ws<ACW;
    const prevWs=wsIdx>0?sortedWeeks[wsIdx-1]:null;
    const prevKm=prevWs!=null?weekKmMap[prevWs]:null;
    const thisKm=weekKmMap[ws]||0;
    const isDecharge=prevKm!=null&&thisKm>0&&thisKm<prevKm*0.92;
    const isRaceWeekCard=ws===raceWeekNum;
    const isAffutage=!isRaceWeekCard&&raceWeekNum!=null&&ws>=raceWeekNum-3&&ws<raceWeekNum&&isDecharge;

    // Collecter séances de cette semaine
    const sessions=[];
    let ei=0;
    while(ei<=20&&state[`extra_w${ws}_s${ei}`]){
      try{
        const s=JSON.parse(state[`extra_w${ws}_s${ei}`]);
        const done=!!state[`extra_w${ws}_s${ei}_done`];
        const skip=!!state[`extra_w${ws}_s${ei}_skip`];
        const skipReason=state[`extra_w${ws}_s${ei}_skip_reason`]||'';
        const kmDone=state[`extra_w${ws}_s${ei}_km`]!=null?parseFloat(state[`extra_w${ws}_s${ei}_km`]):null;
        const perf=state[`extra_w${ws}_s${ei}_perf`]?JSON.parse(state[`extra_w${ws}_s${ei}_perf`]):{};
        sessions.push({s,ei,done,skip,skipReason,kmDone,perf});
      }catch(e){}
      ei++;
    }

    const kmTotal=sessions.reduce((t,{s})=>t+(parseFloat(s.km)||0),0);
    const doneCnt=sessions.filter(x=>x.done).length;
    const allDone=doneCnt===sessions.length&&sessions.length>0;
    const weekDone=sessions.length?Math.round(doneCnt/sessions.length*100):0;

    // Extraire la date du lundi depuis la première séance
    let weekDateLabel='',weekMonthIdx=-1,weekMonthName='';
    if(sessions.length&&sessions[0].s&&sessions[0].s.sched_date){
      try{
        const sd=new Date(sessions[0].s.sched_date+'T00:00:00');
        const d=sd.getDay();
        const mon=new Date(sd); mon.setDate(sd.getDate()+(d===0?-6:1-d));
        const mC=['jan','fév','mar','avr','mai','juin','juil','aoû','sep','oct','nov','déc'];
        const mL=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
        weekDateLabel='lun. '+mon.getDate()+' '+mC[mon.getMonth()];
        weekMonthIdx=mon.getMonth(); weekMonthName=mL[mon.getMonth()];
      }catch(e){}
    }

    // Lire les métadonnées de semaine AVANT les calculs visuels
    let metaW={};
    try{if(state['meta_w'+ws]) metaW=JSON.parse(state['meta_w'+ws]);}catch(e){}
    const phaseLabels={1:{l:'Base',bg:'#F3F4F6',c:'#4B5563'},2:{l:'Construction',bg:'#FEF3EE',c:'#C2410C'},3:{l:'Spécifique',bg:'#EEF2FD',c:'#1B4FD8'},4:{l:'Affûtage',bg:'#EDF7EF',c:'#2F6E44'}};
    const phaseInfo=metaW.phase?phaseLabels[metaW.phase]:null;
    const isPeakWeek=metaW.isPeak&&!isRaceWeekCard&&!metaW.isTaper;
    const planPeakWeek=parseInt(state['plan_peak_week'])||0;

    // Couleurs par phase pour les semaines non-courantes
    const phaseAccents={1:{accent:'#475569',num:'rgba(71,85,105,0.14)',hdr:'rgba(71,85,105,0.055)'},2:{accent:'#EA580C',num:'rgba(234,88,12,0.14)',hdr:'rgba(234,88,12,0.055)'},3:{accent:'#1B4FD8',num:'rgba(27,79,216,0.14)',hdr:'rgba(27,79,216,0.055)'},4:{accent:'#16A34A',num:'rgba(22,163,74,0.14)',hdr:'rgba(22,163,74,0.055)'}};
    const phaseCol=metaW.phase&&!isCur&&!isRaceWeekCard?phaseAccents[metaW.phase]:null;

    const numBg=isCur?'rgba(255,255,255,0.20)':isPast?'#D8DEE8':phaseCol?phaseCol.num:'rgba(27,79,216,0.1)';
    const numColor=isCur?'#fff':isPast?'#5e6a7e':phaseCol?phaseCol.accent:'#1B4FD8';
    const _kmC=isCur?'rgba(255,255,255,0.95)':allDone?'#3B6D11':'var(--text)';
    const _kmSubC=isCur?'rgba(255,255,255,0.60)':allDone?'#3B6D11aa':'var(--muted)';

    // Micro-pills de composition de la semaine (type de chaque séance)
    const totalSess=sessions.length;
    const doneSess=sessions.filter(({done})=>done).length;
    const skipSess=sessions.filter(({skip})=>skip).length;
    const typeAbbr={ef:'EF',tempo:'T',frac:'F',long:'L',race:'🏆'};
    const dotsHtml=totalSess>0?`<div style="display:flex;gap:3px;align-items:center;margin-top:5px;flex-wrap:nowrap;overflow:hidden;">${sessions.map(({s,done,skip})=>{const tc=typeColor[s.type]||'#888';const tbg=typeBg[s.type]||'#f5f5f5';const abbr=typeAbbr[s.type]||'?';const bg=done?'#D4EDBC':skip?'#FDECEA':isCur?'rgba(255,255,255,0.2)':tbg;const color=done?'#2E6B10':skip?'#C0392B':isCur?'rgba(255,255,255,0.9)':tc;return `<span style="font-size:8px;font-weight:800;padding:2px 5px;border-radius:5px;background:${bg};color:${color};letter-spacing:0.03em;">${done?'✓ ':skip?'✕ ':''}${abbr}</span>`;}).join('')}</div>`:'';

    // Barre de volume relative au pic
    const _volPct=Math.round((thisKm/maxWeekKm)*100);
    const _volBarColor=isCur?'rgba(255,255,255,0.55)':isRaceWeekCard?'rgba(255,255,255,0.5)':allDone?'#3B6D11':phaseCol?phaseCol.accent:'#1B4FD8';
    const _volBar=`<div style="width:54px;height:3px;background:${isCur||isRaceWeekCard?'rgba(255,255,255,0.2)':'var(--border)'};border-radius:2px;overflow:hidden;margin-bottom:4px;"><div style="width:${_volPct}%;height:100%;background:${_volBarColor};border-radius:2px;transition:width 0.5s ease;"></div></div>`;
    const statusHtml=`<div style="text-align:right;line-height:1;">${_volBar}<span style="font-size:20px;font-weight:900;color:${_kmC};">${kmTotal}</span><span style="font-size:10px;font-weight:700;color:${_kmSubC};"> km${allDone?' ✓':''}</span></div>`;
    const progressHtml=isCur
      ?`<div class="plan-progress-bar"><div class="plan-progress-fill" style="width:${weekDone}%;background:rgba(255,255,255,0.55);"></div></div>`
      :isPast?`<div class="plan-progress-bar"><div class="plan-progress-fill" style="width:100%;background:#3B6D11;opacity:0.35;"></div></div>`:phaseCol?`<div class="plan-progress-bar"><div class="plan-progress-fill" style="width:0%;background:${phaseCol.accent};opacity:0.3;"></div></div>`:'';

    const isOpen=openWeeks.has(ws);
    const chevron=`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${isCur?'rgba(255,255,255,0.7)':'var(--muted)'}" stroke-width="2.5" style="transform:${isOpen?'rotate(180deg)':'rotate(0)'};transition:transform 0.25s;flex-shrink:0;"><polyline points="6 9 12 15 18 9"/></svg>`;

    const badges=[];
    if(isCur) badges.push(`<span class="plan-badge" style="background:rgba(255,255,255,0.22);color:#fff;font-weight:800;backdrop-filter:blur(4px);">En cours</span>`);
    if(isRaceWeekCard) badges.push(`<span class="plan-badge" style="background:#FEF9E7;color:#B7791F;">🏆 Course</span>`);
    else if(isAffutage||metaW.isTaper) badges.push(`<span class="plan-badge" style="background:${isCur?'rgba(255,255,255,0.15)':'#EDF7EF'};color:${isCur?'#fff':'#2F6E44'};" title="Semaine d'affûtage : charge réduite pour arriver frais en course">Affûtage (↘️ charge)</span>`);
    else if(isDecharge||metaW.isRecov) badges.push(`<span class="plan-badge" style="background:${isCur?'rgba(255,255,255,0.15)':'#FEF3EE'};color:${isCur?'#fff':'#E8530A'};" title="Semaine de décharge : récupération active pour assimiler les charges précédentes">Décharge (récup.)</span>`);
    if(isPeakWeek) badges.push(`<span class="plan-badge" style="background:${isCur?'rgba(255,100,100,0.3)':'#FEF2F2'};color:${isCur?'#fca5a5':'#DC2626'};" title="Semaine de pic : volume maximum du plan">Pic (volume max)</span>`);
    if(phaseInfo&&!isRaceWeekCard) badges.push(`<span class="plan-badge" style="background:${isCur?'rgba(255,255,255,0.12)':phaseInfo.bg};color:${isCur?'rgba(255,255,255,0.8)':phaseInfo.c};opacity:0.85;">${phaseInfo.l}</span>`);

    const _nextIdx=isCur?sessions.findIndex(({done,skip})=>!done&&!skip):-1;
    const sessionRowsHtml=isOpen?sessions.map(({s,ei:eid,done,skip,skipReason,kmDone,perf},rowIdx)=>{
      const isNext=rowIdx===_nextIdx;
      const typeC=typeColor[s.type]||'#888';
      const typeBgC=typeBg[s.type]||'#f5f5f5';
      const lbl=typeLabel[s.type]||s.type;
      const title=normalizeSessionTitle(s.d?s.d.split('|')[0]:'', s.type);
      const detail=s.d&&s.d.includes('|')?s.d.split('|')[1]:null;
      const clickFn=done?`openPerfEditExtraModal(${ws},${eid})`:`openEditExtraModal(${ws},${eid})`;
      const iconContent=done
        ?`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B6D11" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`
        :skip
        ?`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C0392B" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
        :`<span style="font-size:18px;line-height:1;">${(typeof typeEmoji!=='undefined'&&typeEmoji[s.type])||lbl}</span>`;
      const iconBg=done?'#EAF3DE':skip?'#FDECEA':typeBgC;
      const iconBorder=done?'#3B6D11':skip?'#C0392B':typeC;
      const kmShow=done&&kmDone!=null?kmDone:s.km;
      const kmSub=done&&kmDone!=null?`<span style="font-size:9px;font-weight:400;color:#3B6D11aa;"> /&nbsp;${s.km}</span>`:'';
      const canUp=rowIdx>0, canDown=rowIdx<sessions.length-1;
      const durHtml=(()=>{
        if(done){
          const parts=[];
          if(perf.dur) parts.push(`<span style="font-size:10px;font-weight:600;color:#3B6D11;">⏱ ${perf.dur}</span>`);
          if(perf.pace) parts.push(`<span style="font-size:10px;color:#3B6D11;font-weight:600;">🏃 ${perf.pace}/km</span>`);
          return parts.length?`<div style="display:flex;gap:6px;align-items:center;margin-top:2px;">${parts.join('<span style="color:var(--border);"> · </span>')}</div>`:'';
        }
        const dur=calcSessionDuration(s,getBestEfPace(),getMarathonPaceStr());
        return dur?`<span style="font-size:10px;color:var(--muted);font-weight:500;">⏱ ~${dur}</span>`:'';
      })();
      const schedHtml=(()=>{
        if(s.sched_day||s.sched_time){
          const days=['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
          return `<span style="font-size:10px;color:${typeC};font-weight:700;background:${typeBgC};padding:2px 8px;border-radius:10px;border:1px solid ${typeC}22;display:inline-flex;align-items:center;gap:3px;"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="6" x2="12" y2="12"/><line x1="12" y1="12" x2="16" y2="14"/></svg>${[s.sched_day?days[s.sched_day]:'',s.sched_time||''].filter(Boolean).join(' ')}</span>`;
        }
        // Afficher la date de l'onboarding si disponible
        const dateKey=state[`extra_w${ws}_s${eid}_date`];
        const timeKey=state[`extra_w${ws}_s${eid}_time`];
        if(dateKey){
          try{
            const d=new Date(dateKey+'T00:00:00');
            const jours=['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
            const mois=['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'];
            const label=`${jours[d.getDay()]} ${d.getDate()} ${mois[d.getMonth()]}${timeKey?' · '+timeKey:''}`;
            return `<span style="font-size:10px;color:#9BA8C0;font-weight:600;background:var(--bg2);padding:1px 6px;border-radius:10px;margin-top:3px;display:inline-block;">${label}</span>`;
          }catch(e){}
        }
        return '';
      })();
      const sessionExplain=(()=>{
        if(s.type==='tempo'){
          const m=title.match(/(\d+)×(\d+)/);
          return m?`3 km d'échauffement EF → ${m[1]}×${m[2]} min à allure seuil (effort soutenu) → EF de fin`:"3 km d'échauffement EF → bloc tempo → EF de fin";
        }
        if(s.type==='frac'){
          const m=title.match(/(\d+)×(\d+)/);
          return m?`3 km d'échauffement EF → ${m[1]}×${m[2]} min à haute intensité → EF de fin`:"3 km d'échauffement EF → blocs fractionnés → EF de fin";
        }
        if(s.type==='ef') return 'Allure confort du début à la fin — tu dois pouvoir parler sans effort.';
        if(s.type==='long') return 'Sortie longue à allure confort — construire l\'endurance de fond.';
        if(s.type==='race') return 'Jour de course — exécute ta stratégie d\'allure !';
        return '';
      })();
      const _rowGrad=done?'linear-gradient(to right,rgba(59,109,17,0.10),rgba(59,109,17,0.03) 55%,transparent)':skip?'linear-gradient(to right,rgba(192,57,43,0.08),rgba(192,57,43,0.02) 55%,transparent)':isNext?`linear-gradient(to right,${typeBgC}88,${typeBgC}30 65%,transparent)`:`linear-gradient(to right,${typeBgC}55,${typeBgC}18 55%,transparent)`;
      const _emoji=(typeof typeEmoji!=='undefined'&&typeEmoji[s.type])||'';
      const _nextBadge=isNext?`<span style="font-size:8px;font-weight:900;background:#1B4FD8;color:#fff;padding:1px 6px;border-radius:8px;letter-spacing:0.04em;margin-left:4px;">NEXT →</span>`:'';
      const _typePill=done?`<span style="font-size:9px;font-weight:800;background:#D4EDBC;color:#2E6B10;padding:2px 8px;border-radius:10px;border-left:2px solid #3B6D11;letter-spacing:0.03em;">✓ Validé</span>`:skip?`<span style="font-size:9px;font-weight:800;background:#FDECEA;color:#C0392B;padding:2px 8px;border-radius:10px;border-left:2px solid #C0392B;">✕ ${skipReason||'Passée'}</span>`:`<span style="font-size:9px;font-weight:800;background:${isNext?typeBgC+'cc':typeBgC};color:${typeC};padding:2px 8px;border-radius:10px;border-left:2px solid ${typeC};text-transform:uppercase;letter-spacing:0.04em;">${_emoji?_emoji+' ':''}${lbl}</span>${_nextBadge}`;
      return `<div class="plan-session-card" style="background:${_rowGrad};${isNext?`box-shadow:inset 0 0 0 1.5px ${typeC}22;`:''}">\n        <div style="width:4px;background:linear-gradient(180deg,${done?'#3B6D11':skip?'#C0392B':typeC} 0%,${done?'#3B6D1160':skip?'#C0392B60':typeC+'60'} 100%);flex-shrink:0;"></div>
        <div onclick="${clickFn}" style="display:flex;align-items:center;gap:11px;flex:1;min-width:0;padding:12px 0 12px 12px;">
          <div style="width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${iconBg};box-shadow:0 2px 8px ${done?'rgba(59,109,17,0.18)':skip?'rgba(192,57,43,0.15)':typeC+'28'},0 0 0 1.5px ${done?'rgba(59,109,17,0.2)':skip?'rgba(192,57,43,0.18)':typeC+'22'};">
            ${iconContent}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="margin-bottom:4px;">${_typePill}</div>
            <div style="font-size:14px;font-weight:700;color:${done?'#2E6B10':skip?'#C0392B':'var(--text)'};">${title}</div>
            ${detail?`<div style="font-size:12px;color:${done?'#5a8f2e':typeC};font-weight:600;margin-top:1px;line-height:1.35;">${detail}</div>`:''}
            ${durHtml}
            <div style="display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap;">
              ${schedHtml}
              ${s.shoe?shoeBadge(s.shoe):''}
            </div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:2px;padding:12px 12px 12px 0;flex-shrink:0;">
          <div style="text-align:right;min-width:40px;">
            <div style="font-size:17px;font-weight:800;color:${done?'#2E6B10':'var(--text)'};">${kmShow}</div>
            <div style="font-size:9px;font-weight:500;color:var(--muted);">${kmSub?'/'+s.km+' km':'km'}</div>
          </div>
          <div class="plan-session-move">
            <button onclick="event.stopPropagation();moveExtraSession(${ws},${rowIdx},-1)" ${canUp?'':'disabled'}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
            </button>
            <button onclick="event.stopPropagation();moveExtraSession(${ws},${rowIdx},1)" ${canDown?'':'disabled'}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
        </div>
      </div>`;
    }).join(''):'';

    const addRowHtml=isOpen?`<div class="plan-add-row" onclick="openAddModal(${ws})" style="opacity:0.85;transition:opacity 0.15s;">
      <div class="plan-session-icon" style="background:#EEF3FD;border:1.5px dashed #1B4FD855;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1B4FD8" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </div>
      <span style="font-size:12px;color:#1B4FD8;font-weight:600;">Ajouter une séance</span>
    </div>`:'';

    // Épine de phase (barre gauche pleine hauteur)
    const _spineColor=isCur?'#1B4FD8':isRaceWeekCard?'#D97706':phaseCol?phaseCol.accent:isPast?'#CBD5E1':'#E2E8F0';
    const card=document.createElement('div');
    card.className='plan-week-card'+(isCur?' is-current':isPast?' is-past':'')+(isRaceWeekCard?' is-race':'');
    card.style.cssText=`border-left:4px solid ${_spineColor};`;
    const _hStyle=isCur?'background:linear-gradient(135deg,#0C2D6A 0%,#1048C0 100%);':isRaceWeekCard?'background:linear-gradient(135deg,#78350F 0%,#D97706 100%);':phaseCol?`background:${phaseCol.hdr};`:'';
    const _dateColor=isCur||isRaceWeekCard?'rgba(255,255,255,0.9)':'var(--text)';
    card.innerHTML=`
      <div class="plan-week-header" onclick="toggleAthleteWeek(${ws})" style="${_hStyle}">
        <div class="plan-week-num" style="background:${isRaceWeekCard?'rgba(255,255,255,0.22)':numBg};color:${isRaceWeekCard?'#fff':numColor};">S${ws}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:700;color:${_dateColor};">${weekDateLabel||'Semaine '+ws}</div>
          ${badges.length?`<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:3px;">${badges.join('')}</div>`:''}
          ${dotsHtml}
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          ${statusHtml}
          ${chevron}
        </div>
      </div>
      ${progressHtml}
      ${sessionRowsHtml}${addRowHtml}`;
    // Séparateur de mois (inséré avant la carte si changement de mois)
    if(weekMonthIdx>=0&&weekMonthIdx!==currentRenderMonth){
      currentRenderMonth=weekMonthIdx;
      const sepEl=document.createElement('div');
      sepEl.style.cssText='display:flex;align-items:center;gap:8px;padding:10px 2px 4px;';
      sepEl.innerHTML=`<span style="font-size:10px;font-weight:800;color:var(--orange);text-transform:uppercase;letter-spacing:0.12em;background:rgba(232,83,10,0.09);padding:3px 11px;border-radius:20px;">${weekMonthName}</span><div style="flex:1;height:1px;background:var(--border);opacity:0.4;"></div>`;
      el.appendChild(sepEl);
    }
    el.appendChild(card);
  });

  // Hero bar — progression globale
  const _totalW=sortedWeeks.length;
  const _pastW=sortedWeeks.filter(w=>w<ACW).length;
  const _pct=_totalW?Math.round(_pastW/_totalW*100):0;
  const _heroBar=document.getElementById('plan-hero-bar');
  const _heroLbl=document.getElementById('plan-hero-label');
  if(_heroBar) _heroBar.style.width=_pct+'%';
  if(_heroLbl) _heroLbl.textContent=_totalW?`S${ACW} sur ${_totalW} · ${_pct}% réalisé`:'';

  // Carte Jour J (si une séance de course est trouvée dans le plan)
  if(raceSessionData){
    try{
      const rd=raceSessionData.sched_date?new Date(raceSessionData.sched_date+'T00:00:00'):null;
      let _obParsed={};try{_obParsed=state.onboarding?(typeof state.onboarding==='string'?JSON.parse(state.onboarding):state.onboarding):{};}catch(e){}
      const courseName=(_obParsed.race_name)||((raceSessionData.d?raceSessionData.d.split('|')[0]:'Course').replace('🏆 ',''));
      const distKm=raceSessionData.km||'';
      const joursL=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
      const moisL=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
      const dateStr=rd?`${joursL[rd.getDay()]} ${rd.getDate()} ${moisL[rd.getMonth()]} ${rd.getFullYear()}`:'';
      const jourJEl=document.createElement('div');
      jourJEl.style.cssText='margin:8px 0 4px;border:2px solid #D97706;border-radius:var(--radius);background:linear-gradient(135deg,#FFFBEB,#FEF3C7);overflow:hidden;';
      jourJEl.innerHTML=`
        <div style="padding:14px 16px;display:flex;align-items:center;gap:14px;">
          <div style="font-size:36px;line-height:1;">🏆</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:11px;font-weight:700;color:#D97706;text-transform:uppercase;letter-spacing:0.08em;">Jour J</div>
            <div style="font-size:16px;font-weight:800;color:#92400E;margin-top:2px;">${courseName}</div>
            ${dateStr?`<div style="font-size:12px;color:#B45309;font-weight:600;margin-top:3px;">${dateStr}</div>`:''}
          </div>
          ${distKm?`<div style="background:#D97706;color:#fff;border-radius:12px;padding:8px 14px;text-align:center;flex-shrink:0;"><div style="font-size:22px;font-weight:900;line-height:1;">${distKm}</div><div style="font-size:10px;font-weight:600;opacity:0.9;">km</div></div>`:''}
        </div>
        <div style="height:3px;background:linear-gradient(90deg,#FCD34D,#D97706,#92400E);"></div>`;
      el.appendChild(jourJEl);
    }catch(e){}
  }

  // Bouton ajouter une semaine
  const nextWs=(weekNums.size>0?Math.max(...weekNums):CW)+1;
  const addEl=document.createElement('div');
  addEl.innerHTML=`<div class="plan-add-row" onclick="openAddModal(${nextWs})" style="border:1.5px dashed var(--border);border-radius:var(--radius);background:var(--bg);">
    <div class="plan-session-icon" style="background:var(--bg2);border:1.5px dashed var(--border);">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </div>
    <span style="font-size:12px;color:var(--muted);">Nouvelle semaine S${nextWs}</span>
  </div>`;
  el.appendChild(addEl);

  // Scroll automatique vers la semaine en cours (seulement si pas encore ouvert)
  if(!_adminPreviewUid && !renderPlan._noScroll){
    setTimeout(()=>{
      const curCard=el.querySelector('.plan-week-card.is-current');
      if(curCard) curCard.scrollIntoView({behavior:'smooth',block:'nearest'});
    },120);
  }
  renderPlan._noScroll=false;
}

function toggleAthleteWeek(ws){
  const sy=window.scrollY||0;
  if(openWeeks.has(ws))openWeeks.delete(ws);else openWeeks.add(ws);
  if(_adminPreviewUid){ _refreshAthleteCoachView(); return; }
  renderPlan._noScroll=true;
  renderPlan();
  setTimeout(()=>window.scrollTo({top:sy,behavior:'instant'}),0);
}

function moveExtraSession(ws,rowIdx,dir){
  // Collecter les indices existants
  const keys=[];
  let ei=0;
  while(ei<=20&&state[`extra_w${ws}_s${ei}`]){keys.push(ei);ei++;}
  const target=rowIdx+dir;
  if(target<0||target>=keys.length) return;
  // Échanger les deux séances (toutes leurs clés associées)
  const suffixes=['','_done','_km','_perf','_skip','_skip_reason'];
  suffixes.forEach(suf=>{
    const a=state[`extra_w${ws}_s${rowIdx}${suf}`];
    const b=state[`extra_w${ws}_s${target}${suf}`];
    if(b!=null) state[`extra_w${ws}_s${rowIdx}${suf}`]=b; else delete state[`extra_w${ws}_s${rowIdx}${suf}`];
    if(a!=null) state[`extra_w${ws}_s${target}${suf}`]=a; else delete state[`extra_w${ws}_s${target}${suf}`];
  });
  save();
  rendered.plan=false;
  if(_adminPreviewUid) _refreshAthleteCoachView(); else renderPlan();
}

function renderPlan(){
  const ptEl=document.getElementById('plan-total-km');
  const el=document.getElementById('plan-list'); el.innerHTML='';
  // Plan vide pour les athlètes — seulement les séances qu'ils ajoutent eux-mêmes
  if(!isAdmin()){
    if(ptEl) ptEl.textContent='Ton plan personnalisé';
    openWeeks.add(getAthleteCW());
    renderAthletePlan(el);
    return;
  }
  // Garantir que le rôle admin est bien enregistré si l'email correspond
  if(currentUserRole!=='admin'){
    currentUserRole='admin';
    firebase.database().ref('users/'+firebase.auth().currentUser.uid+'/role').set('admin').catch(()=>{});
  }

  if(ptEl) ptEl.textContent='32 semaines · '+getGrandTotal()+' km';

  // Auto-ouvrir la semaine courante
  openWeeks.add(CW);

  const maxAdminKm=Math.max(...weeks.map(w=>getWeekTotalKm(w.s)||0),1);
  let currentMonth='';
  weeks.forEach(w=>{
    try {
    const isCur=w.s===CW, isPast=w.s<CW, isOpen=openWeeks.has(w.s);
    const isDecharge=[8,12,16,20,26,30].includes(w.s);
    const isSemi=w.s===28, isMarathon=w.s===32;

    // Calcul avancement semaine courante
    const weekDone=(()=>{
      if(!isCur) return 0;
      const total=weeks[w.s-1].sessions.length;
      if(total===0) return 0;
      const done=weeks[w.s-1].sessions.filter((_,si)=>state[gk(w.s,si)+'done']||state[gk(w.s,si)+'km']!=null).length;
      return total>0?Math.round(done/total*100):0;
    })();
    const isCurrentAllDone=(()=>{
      if(!isCur) return false;
      const base=weeks[w.s-1].sessions.filter((_,si)=>!state[`del_w${w.s}_s${si}`]);
      if(base.length===0) return false;
      return weeks[w.s-1].sessions.every((_,si)=>state[`del_w${w.s}_s${si}`]||!!state[gk(w.s,si)+'done']);
    })();

    // Séparateur de mois
    if(w.month!==currentMonth){
      currentMonth=w.month;
      const sep=document.createElement('div');
      sep.className='plan-month-sep';
      sep.innerHTML=`<span style="font-size:10px;font-weight:800;color:var(--orange);text-transform:uppercase;letter-spacing:0.12em;background:rgba(232,83,10,0.09);padding:3px 11px;border-radius:20px;">${w.month}</span><div style="flex:1;height:1px;background:var(--border);opacity:0.4;"></div>`;
      el.appendChild(sep);
    }

    // Card
    const card=document.createElement('div');
    card.className='plan-week-card'+(isCur?' is-current':isPast?' is-past':'');
    // Épine gauche (appliquée après calcul de phaseColA — définie juste après)

    // ── Header ──
    // Métadonnées de la semaine (phase, pic, décharge…)
    let metaWA={};
    try{if(state['meta_w'+w.s]) metaWA=JSON.parse(state['meta_w'+w.s]);}catch(e){}
    const phaseAccentsA={1:{accent:'#475569',num:'rgba(71,85,105,0.14)',hdr:'rgba(71,85,105,0.055)'},2:{accent:'#EA580C',num:'rgba(234,88,12,0.14)',hdr:'rgba(234,88,12,0.055)'},3:{accent:'#1B4FD8',num:'rgba(27,79,216,0.14)',hdr:'rgba(27,79,216,0.055)'},4:{accent:'#16A34A',num:'rgba(22,163,74,0.14)',hdr:'rgba(22,163,74,0.055)'}};
    const phaseColA=metaWA.phase&&!isCur?phaseAccentsA[metaWA.phase]:null;

    // Couleur du numéro de semaine
    const numBg = isCur ? 'var(--blue)' : isPast ? '#D8DEE8' : phaseColA?phaseColA.num:'rgba(27,79,216,0.1)';
    const numColor = isCur ? '#fff' : isPast ? '#5e6a7e' : phaseColA?phaseColA.accent:'#1B4FD8';

    // Badges
    const badges = [];
    if(isCur) badges.push(`<span class="plan-badge" style="background:#1B4FD8;color:#fff;font-weight:800;">En cours</span>`);
    if(isDecharge) badges.push(`<span class="plan-badge" style="background:#FEF3EE;color:#E8530A;">Décharge</span>`);
    if(isSemi) badges.push(`<span class="plan-badge" style="background:#E1F5EE;color:#085041;">Semi</span>`);
    if(isMarathon) badges.push(`<span class="plan-badge" style="background:#EEEDFE;color:#3C3489;">🏆 Marathon</span>`);

    // Statut km
    const kmTotal = getWeekTotalKm(w.s);
    // Calculer les km réels pour les semaines passées
    const realWeekKm = (isPast || (isCur && isCurrentAllDone)) ? (()=>{
      let total = 0;
      weeks[w.s-1].sessions.forEach((_,si)=>{
        if(state[`del_w${w.s}_s${si}`]) return;
        const rv = state[gk(w.s,si)+'km'];
        const done = !!state[gk(w.s,si)+'done'];
        if(rv!=null) total += parseFloat(rv);
        else if(done) total += getSession(w.s,si).km;
      });
      // Ajouter les séances extra validées
      let ei=0;
      while(ei<=20&&state[`extra_w${w.s}_s${ei}`]){
        if(state[`extra_w${w.s}_s${ei}_done`]){
          const rv=state[`extra_w${w.s}_s${ei}_km`];
          let es;try{es=JSON.parse(state[`extra_w${w.s}_s${ei}`]);}catch(e){ei++;continue;}
          if(!es){ei++;continue;}
          total += rv!=null ? parseFloat(rv) : es.km;
        }
        ei++;
      }
      return Math.round(total*10)/10;
    })() : null;

    const _aKmC=isCur?'rgba(255,255,255,0.95)':(isPast||(isCur&&isCurrentAllDone))?'#3B6D11':'var(--text)';
    const _aKmSubC=isCur?'rgba(255,255,255,0.60)':(isPast||(isCur&&isCurrentAllDone))?'#3B6D11aa':'var(--muted)';
    const _aKmVal=(isPast||(isCur&&isCurrentAllDone))?realWeekKm:kmTotal;
    const _aKmSuffix=(isPast||(isCur&&isCurrentAllDone))?' km ✓':' km';
    const _aVolPct=Math.round((kmTotal/maxAdminKm)*100);
    const _aVolBarC=isCur?'rgba(255,255,255,0.55)':(isPast||(isCur&&isCurrentAllDone))?'#3B6D11':phaseColA?phaseColA.accent:'#1B4FD8';
    const _aVolBar=`<div style="width:54px;height:3px;background:${isCur?'rgba(255,255,255,0.2)':'var(--border)'};border-radius:2px;overflow:hidden;margin-bottom:4px;"><div style="width:${_aVolPct}%;height:100%;background:${_aVolBarC};border-radius:2px;"></div></div>`;
    const statusHtml = `<div style="text-align:right;line-height:1;">${_aVolBar}<span style="font-size:20px;font-weight:900;color:${_aKmC};">${_aKmVal}</span><span style="font-size:10px;font-weight:700;color:${_aKmSubC};">${_aKmSuffix}</span></div>`;

    // Barre de progression (semaine en cours uniquement)
    const progressHtml = isCur
      ? `<div class="plan-progress-bar"><div class="plan-progress-fill" style="width:${weekDone}%;background:rgba(255,255,255,0.55);"></div></div>`
      : isPast
      ? `<div class="plan-progress-bar"><div class="plan-progress-fill" style="width:100%;background:#3B6D11;opacity:0.35;"></div></div>`
      : '';

    // Séances
    const allSessions=[];
    const baseOrder=weeks[w.s-1].sessions.map((_,si)=>({si,extra:false})).filter(({si})=>!state[`del_w${w.s}_s${si}`]);
    let ei=0;
    while(ei<=20&&state[`extra_w${w.s}_s${ei}`]){baseOrder.push({si:'x'+ei,extra:true,ei});ei++;}

    // Comparaison stable — ne pas utiliser JSON.stringify (sensible à l'ordre des clés)
    // sessionMatch tolère les anciens formats (sans champ extra:false explicite)
    const sessionMatch = (a, b) => !!a.extra === !!b.extra && (a.extra ? a.ei === b.ei : a.si === b.si);

    let savedOrder=null;try{savedOrder=state[`order_w${w.s}`]?JSON.parse(state[`order_w${w.s}`]).filter(Boolean):null;}catch(e){}
    const orderedSessions = savedOrder
      ? savedOrder.map(o => baseOrder.find(b => sessionMatch(b, o))).filter(Boolean)
      : [...baseOrder];
    // Ajouter les séances manquantes (ex: extra ajoutée après enregistrement de l'ordre)
    baseOrder.forEach(b=>{if(!orderedSessions.find(o=>sessionMatch(o,b)))orderedSessions.push(b);});
    orderedSessions.forEach(({si,extra,ei:eid})=>{
      let s;try{s=extra?JSON.parse(state[`extra_w${w.s}_s${eid}`]):getSession(w.s,si);}catch(e){return;}
      if(!s)return;
      allSessions.push({s,si,extra,ei:eid});
    });
    const totalRows=allSessions.length;

    const sessionRowsHtml = isOpen ? allSessions.map(({s:s2,si,extra,ei:eid},rowIdx)=>{
      const typeC=typeColor[s2.type]||'#888';
      const typeBgC=typeBg[s2.type]||'#f5f5f5';
      const lbl=typeLabel[s2.type]||'EF';
      const parts=s2.d.split('|');
      const title=normalizeSessionTitle(parts[0], s2.type);
      const detail=filterDetailDisplay(title, parts[1]||null);
      const edited=!extra&&state[`edit_w${w.s}_s${si}`];
      const isDone=extra ? !!state[`extra_w${w.s}_s${eid}_done`] : !!state[gk(w.s,si)+'done'];
      const isSkip=extra ? !!state[`extra_w${w.s}_s${eid}_skip`] : !!state[gk(w.s,si)+'skip'];
      const skipReason=extra ? (state[`extra_w${w.s}_s${eid}_skip_reason`]||'') : (state[gk(w.s,si)+'skip_reason']||'');
      const clickFn=extra
        ? (isDone ? `openPerfEditExtraModal(${w.s},${eid})` : `openEditExtraModal(${w.s},${eid})`)
        : (isDone ? `openPerfEditModal(${w.s},${si})` : `openEditModal(${w.s},${si})`);

      // Horaire planifié
      let schedHtml='';
      if(!extra){
        const edRaw=state[`edit_w${w.s}_s${si}`];
        if(edRaw){
          let ed;try{ed=JSON.parse(edRaw);}catch(e){}
          if(ed&&(ed.sched_day||ed.sched_time)){
            const days=['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
            const dayStr=ed.sched_day?days[ed.sched_day]:'';
            const timeStr=ed.sched_time||'';
            schedHtml=`<span style="font-size:10px;color:${typeC};font-weight:700;background:${typeBgC};padding:2px 8px;border-radius:10px;border:1px solid ${typeC}22;display:inline-flex;align-items:center;gap:3px;"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="6" x2="12" y2="12"/><line x1="12" y1="12" x2="16" y2="14"/></svg>${[dayStr,timeStr].filter(Boolean).join(' ')}</span>`;
          }
        }
      } else {
        // Séance extra : lire sched_day/sched_time depuis l'objet extra lui-même
        if(s2.sched_day||s2.sched_time){
          const days=['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
          const dayStr=s2.sched_day?days[s2.sched_day]:'';
          const timeStr=s2.sched_time||'';
          schedHtml=`<span style="font-size:10px;color:#9BA8C0;font-weight:600;background:var(--bg2);padding:1px 6px;border-radius:10px;margin-top:3px;display:inline-block;">${[dayStr,timeStr].filter(Boolean).join(' ')}</span>`;
        }
      }

      const iconContent = isDone
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B6D11" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`
        : isSkip
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C0392B" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
        : `<span style="font-size:18px;line-height:1;">${(typeof typeEmoji!=='undefined'&&typeEmoji[s2.type])||lbl}</span>`;
      const iconBg = isDone ? '#EAF3DE' : isSkip ? '#FDECEA' : typeBgC;
      const iconBorder = isDone ? '#3B6D11' : isSkip ? '#C0392B' : typeC;

      const canUp=rowIdx>0, canDown=rowIdx<totalRows-1;

      const _rowGrad2=isDone?'linear-gradient(to right,rgba(59,109,17,0.10),rgba(59,109,17,0.03) 55%,transparent)':isSkip?'linear-gradient(to right,rgba(192,57,43,0.08),rgba(192,57,43,0.02) 55%,transparent)':`linear-gradient(to right,${typeBgC}55,${typeBgC}18 55%,transparent)`;
      const _emoji2=(typeof typeEmoji!=='undefined'&&typeEmoji[s2.type])||'';
      const _typePill2=isDone?`<span style="font-size:9px;font-weight:800;background:#D4EDBC;color:#2E6B10;padding:2px 8px;border-radius:10px;border-left:2px solid #3B6D11;letter-spacing:0.03em;">✓ Validé</span>`:isSkip?`<span style="font-size:9px;font-weight:800;background:#FDECEA;color:#C0392B;padding:2px 8px;border-radius:10px;border-left:2px solid #C0392B;">✕ ${skipReason||'Passée'}</span>`:`<span style="font-size:9px;font-weight:800;background:${typeBgC};color:${typeC};padding:2px 8px;border-radius:10px;border-left:2px solid ${typeC};text-transform:uppercase;letter-spacing:0.04em;">${_emoji2?_emoji2+' ':''}${lbl}</span>`;
      return `<div class="plan-session-card" style="background:${_rowGrad2};">
        <div style="width:4px;background:linear-gradient(180deg,${isDone?'#3B6D11':isSkip?'#C0392B':typeC} 0%,${isDone?'#3B6D1160':isSkip?'#C0392B60':typeC+'60'} 100%);flex-shrink:0;"></div>
        <div onclick="${clickFn}" style="display:flex;align-items:center;gap:11px;flex:1;min-width:0;padding:12px 0 12px 12px;">
          <div style="width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${iconBg};box-shadow:0 2px 8px ${isDone?'rgba(59,109,17,0.18)':isSkip?'rgba(192,57,43,0.15)':typeC+'28'},0 0 0 1.5px ${isDone?'rgba(59,109,17,0.2)':isSkip?'rgba(192,57,43,0.18)':typeC+'22'};">
            ${iconContent}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="margin-bottom:4px;">${_typePill2}${(edited||extra)?`&ensp;<span style="font-size:9px;color:var(--blue);font-weight:700;">✎ modifié</span>`:''}</div>
            <div style="font-size:14px;font-weight:700;color:${isDone?'#2E6B10':isSkip?'#C0392B':'var(--text)'};">${title}</div>
            ${detail?`<div style="font-size:12px;color:${isDone?'#5a8f2e':typeC};font-weight:600;margin-top:1px;line-height:1.35;">${detail}</div>`:''}
            ${(()=>{
              if(isDone){
                const perfRaw = extra ? state[`extra_w${w.s}_s${eid}_perf`] : state[gk(w.s,si)+'perf'];
                let perf2={};try{perf2=perfRaw?JSON.parse(perfRaw):{};}catch(e){}
                const rp = perf2.pace || null;
                const rd = perf2.dur || null;
                const parts=[];
                if(rd) parts.push(`⏱ ${rd}`);
                if(rp) parts.push(`🏃 ${rp}/km`);
                return parts.length?`<div style="font-size:11px;font-weight:600;color:#3B6D11;margin-top:3px;display:flex;gap:8px;">${parts.join('<span style="opacity:0.4;"> · </span>')}</div>`:'';
              }
              const dur=calcSessionDuration(s2,getBestEfPace(),getMarathonPaceStr());
              return dur?`<div style="font-size:11px;color:var(--muted);font-weight:500;margin-top:2px;">⏱ ~${dur}</div>`:'';
            })()}
            <div style="display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap;">
              ${schedHtml}
              ${s2.shoe?shoeBadge(s2.shoe):''}
            </div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:2px;padding:12px 12px 12px 0;flex-shrink:0;">
          ${(()=>{
            const rvPlan = extra ? state[`extra_w${w.s}_s${eid}_km`] : state[gk(w.s,si)+'km'];
            const kmShow = isDone && rvPlan!=null ? rvPlan : s2.km;
            return `<div style="text-align:right;min-width:40px;">
              <div style="font-size:17px;font-weight:800;color:${isDone?'#3B6D11':'var(--text)'};">${kmShow}</div>
              <div style="font-size:9px;font-weight:500;color:var(--muted);">${isDone&&rvPlan!=null?'/'+s2.km+' km':'km'}</div>
            </div>`;
          })()}
          <div class="plan-session-move">
            <button onclick="event.stopPropagation();moveSession(${w.s},${rowIdx},-1)" ${canUp?'':'disabled'} title="Monter">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
            </button>
            <button onclick="event.stopPropagation();moveSession(${w.s},${rowIdx},1)" ${canDown?'':'disabled'} title="Descendre">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
        </div>
      </div>`;
    }).join('') : '';

    const addRowHtml = isOpen ? `<div class="plan-add-row" onclick="openAddModal(${w.s})" style="opacity:0.85;transition:opacity 0.15s;">
      <div class="plan-session-icon" style="background:#EEF3FD;border:1.5px dashed #1B4FD855;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1B4FD8" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </div>
      <span style="font-size:12px;color:#1B4FD8;font-weight:600;">Ajouter une séance</span>
    </div>` : '';

    // Chevron
    const chevron = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${isCur?'rgba(255,255,255,0.7)':'var(--muted)'}" stroke-width="2.5" style="transform:${isOpen?'rotate(180deg)':'rotate(0)'};transition:transform 0.25s;flex-shrink:0;"><polyline points="6 9 12 15 18 9"/></svg>`;
    const _hStyleA=isCur?'background:linear-gradient(135deg,#0C2D6A 0%,#1048C0 100%);':phaseColA?`background:${phaseColA.hdr};`:'';
    const _dateCa=isCur?'rgba(255,255,255,0.9)':'var(--text)';
    const _topBarA='';
    const _spineColorA=isCur?'#1B4FD8':isDecharge?'#EA580C':phaseColA?phaseColA.accent:isPast?'#CBD5E1':'#E2E8F0';
    card.style.cssText=`border-left:4px solid ${_spineColorA};`;
    const _typeAbbrA={ef:'EF',tempo:'T',frac:'F',long:'L',race:'🏆'};
    const _adminDotsHtml=allSessions.length>0?`<div style="display:flex;gap:3px;align-items:center;margin-top:5px;flex-wrap:nowrap;overflow:hidden;">${allSessions.map(({s:ss,si:xsi,extra:xe,ei:xe_i})=>{const isDoneA=xe?!!state[`extra_w${w.s}_s${xe_i}_done`]:!!state[gk(w.s,xsi)+'done'];const isSkipA=xe?!!state[`extra_w${w.s}_s${xe_i}_skip`]:!!state[gk(w.s,xsi)+'skip'];const tc=typeColor[ss.type]||'#888';const tbg=typeBg[ss.type]||'#f5f5f5';const abbr=_typeAbbrA[ss.type]||'?';const bg=isDoneA?'#D4EDBC':isSkipA?'#FDECEA':isCur?'rgba(255,255,255,0.2)':tbg;const color=isDoneA?'#2E6B10':isSkipA?'#C0392B':isCur?'rgba(255,255,255,0.9)':tc;return `<span style="font-size:8px;font-weight:800;padding:2px 5px;border-radius:5px;background:${bg};color:${color};letter-spacing:0.03em;">${isDoneA?'✓ ':isSkipA?'✕ ':''}${abbr}</span>`;}).join('')}</div>`:'';

    card.innerHTML = `
      ${_topBarA}
      <div class="plan-week-header" onclick="toggleWeek(${w.s})" style="${_hStyleA}">
        <div class="plan-week-num" style="background:${numBg};color:${numColor};">S${w.s}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:700;color:${_dateCa};letter-spacing:-0.1px;">lun. ${w.date}</div>
          ${badges.length?`<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:3px;">${badges.join('')}</div>`:''}
          ${_adminDotsHtml}
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          ${statusHtml}
          ${chevron}
        </div>
      </div>
      ${progressHtml}
      ${sessionRowsHtml}
      ${addRowHtml}
    `;
    el.appendChild(card);
    } catch(e) { console.error('renderPlan error S'+w.s+':', e); }
  });

  // Scroll vers la semaine en cours au premier affichage
  if(!renderPlan._noScroll){
    setTimeout(()=>{
      const curCard=el.querySelector('.plan-week-card.is-current');
      if(curCard) curCard.scrollIntoView({behavior:'smooth',block:'nearest'});
    },120);
  }
  renderPlan._noScroll=false;

  // Carte Jour J — Marathon 18 octobre 2026
  const jourJCard=document.createElement('div');
  jourJCard.style.cssText='margin:8px 0 4px;border:2px solid #D97706;border-radius:var(--radius);background:linear-gradient(135deg,#FFFBEB,#FEF3C7);overflow:hidden;';
  jourJCard.innerHTML=`
    <div style="padding:14px 16px;display:flex;align-items:center;gap:14px;">
      <div style="font-size:36px;line-height:1;">🏆</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:11px;font-weight:700;color:#D97706;text-transform:uppercase;letter-spacing:0.08em;">Jour J</div>
        <div style="font-size:16px;font-weight:800;color:#92400E;margin-top:2px;">Marathon</div>
        <div style="font-size:12px;color:#B45309;font-weight:600;margin-top:3px;">Dimanche 18 octobre 2026</div>
      </div>
      <div style="background:#D97706;color:#fff;border-radius:12px;padding:8px 14px;text-align:center;flex-shrink:0;">
        <div style="font-size:22px;font-weight:900;line-height:1;">42</div>
        <div style="font-size:10px;font-weight:600;opacity:0.9;">km</div>
      </div>
    </div>
    <div style="height:3px;background:linear-gradient(90deg,#FCD34D,#D97706,#92400E);"></div>`;
  el.appendChild(jourJCard);
}

function confirmModifyPlan(){
  const mc=document.getElementById("modal-container");
  const ov=document.createElement("div");
  ov.className="modal-overlay";
  ov.style.setProperty("--_overlay-bg","rgba(0,0,0,0.45)");
  ov.innerHTML=`<div class="modal-box" style="padding:28px 20px 20px;">
    <div style="width:36px;height:4px;background:var(--border);border-radius:4px;margin:0 auto 20px;"></div>
    <p style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:8px;">Recalculer ton plan ?</p>
    <p style="font-size:13px;color:var(--muted);line-height:1.5;margin-bottom:20px;">Cela va relancer la configuration du plan (distance, niveau, disponibilités…) et <strong>régénérer toutes les semaines</strong>. Tes séances validées et tes performances sont conservées.</p>
    <button onclick="closeModal();showOnboarding(true);" style="width:100%;padding:13px;background:#EEF2FD;color:#1B4FD8;border:1.5px solid #c7d7f8;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:8px;">✏️ Continuer</button>
    <button onclick="closeModal()" style="width:100%;padding:13px;background:var(--bg2);color:var(--muted);border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;">Annuler</button>
  </div>`;
  ov.onclick=e=>{if(e.target===ov)closeModal();};
  _lockBodyScroll();
  mc.appendChild(ov);
  _initSwipeToDismiss(ov,ov.querySelector(".modal-box"));
}

