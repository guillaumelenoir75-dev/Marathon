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

function calcEfRestant(){ calcEfRestantGeneric('hm', 'ef-restant-hm-display'); }

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

function buildLongModalHtml(detail){
  const am=getAmTrainingPace();
  // Extraire l'allure EF si déjà sauvegardée dans le detail
  const efPaceMatch=(detail||'').match(/EF\s*[@\s]\s*(\d+)['':](\d+)/);
  const currentEfPace=efPaceMatch?efPaceMatch[1]+':'+efPaceMatch[2]:(getBestEfPace()||'6:40').replace("'",'::').replace(/:(\d{3}).*/,'').replace('::',"'");
  const blocks=[];
  (detail||'').split('·').forEach(part=>{
    const p=part.trim();
    const m=p.match(/^(\d+(?:\.\d+)?)\s*(EF|AM)/i);
    if(m) blocks.push({km:parseFloat(m[1]),type:m[2].toUpperCase()});
  });
  if(blocks.length===0){blocks.push({km:5,type:'EF'});blocks.push({km:3,type:'AM'});}
  const blocksJson=JSON.stringify(blocks).replace(/"/g,'&quot;');
  const efPaces=['6:25','6:20','6:15','6:10','6:05','6:00','5:55','5:50','5:45','5:40','5:35','5:30'];
  const efChips=efPaces.map(p=>`<button type="button" id="long-ef-chip-${p.replace(':','-')}" onclick="selectLongEfPace('${p}')" style="padding:5px 9px;border-radius:20px;font-size:11px;font-weight:600;border:1.5px solid var(--border);background:var(--bg2);color:var(--muted);cursor:pointer;transition:all 0.15s;">${p}</button>`).join('');
  const curEf=(getBestEfPace()||'6:40').replace("'",'::').split('::')[0] || '5';
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
    +'<p style="font-size:10px;color:var(--muted);margin-bottom:3px;">Allure AM</p>'
    +'<p style="font-size:15px;font-weight:700;color:var(--blue);">'+am+' /km</p>'
    +'</div>'
    +'<div style="background:#F0FDF4;border-radius:8px;padding:9px 12px;" id="long-duration-box">'
    +'<p style="font-size:10px;color:#3B6D11;margin-bottom:3px;">Durée estimée</p>'
    +'<p style="font-size:15px;font-weight:700;color:#3B6D11;" id="long-duration-val">—</p>'
    +'</div>'
    +'</div>'
    +'</div>'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">'+'<p style="font-size:10px;font-weight:800;color:#534AB7;text-transform:uppercase;letter-spacing:0.1em;">🗓 Organisation de la séance</p>'+'</div>'+'<div id="long-blocks" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px;"></div>'+'<div id="long-blocks-total" style="font-size:13px;font-weight:800;padding:10px 14px;border-radius:12px;border:2px solid;margin-bottom:10px;"></div>'+'<button onclick="addLongBlock()" style="width:100%;padding:11px;background:var(--bg);border:2px dashed #534AB750;border-radius:12px;font-size:13px;font-weight:700;color:#534AB7;cursor:pointer;">+ Ajouter un bloc</button>'
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
function toggleDone(idx){
  const k=gk(CW,idx)+'done';
  const wasDone=!!state[k];
  if(!wasDone){
    // Ouvrir le modal de validation
    openValidationModal(idx);
  } else {
    // Décocher — supprimer done, km réels et perf
    state[k]=false;
    delete state[gk(CW,idx)+'km'];
    delete state[gk(CW,idx)+'perf'];
    save();
    renderHome();
    rendered.stats=false;
    if(document.getElementById('sc-stats').style.display!=='none')renderStats();
  }
}

const openWeeks=new Set();
function getAthleteCW(){
  // Semaine courante de l'athlète = semaines écoulées depuis plan_start_date
  if(!state.plan_start_date) return 1;
  const start=new Date(state.plan_start_date);
  const now=new Date();
  const diffDays=Math.floor((now-start)/(1000*60*60*24));
  return Math.max(1, Math.floor(diffDays/7)+1);
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
    while(state[`extra_w${ws}_s${ei}`]){try{t+=parseFloat(JSON.parse(state[`extra_w${ws}_s${ei}`]).km)||0;}catch(e){}ei++;}
    weekKmMap[ws]=Math.round(t*10)/10;
  }
  const sortedWeeks=[...weekNums].sort((a,b)=>a-b);

  // Trouver la semaine de course (type 'race') pour badges et carte Jour J
  let raceWeekNum=null,raceSessionData=null;
  outerRace: for(const ws of sortedWeeks){
    let ei=0;
    while(state[`extra_w${ws}_s${ei}`]){
      try{const s=JSON.parse(state[`extra_w${ws}_s${ei}`]);if(s.type==='race'){raceWeekNum=ws;raceSessionData=s;break outerRace;}}catch(e){}
      ei++;
    }
  }
  // Bouton suppression du plan (vue coach admin uniquement)
  if(_adminPreviewUid){
    const delBanner=document.createElement('div');
    delBanner.style.cssText='display:flex;justify-content:flex-end;margin-bottom:12px;';
    delBanner.innerHTML=`<button onclick="cvDeletePlan()" style="background:#fff0f0;border:1px solid #ffcdd2;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;color:#c0392b;cursor:pointer;">🗑 Supprimer le plan</button>`;
    el.appendChild(delBanner);
  }

  let currentRenderMonth=-1; // pour séparateurs de mois

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
    while(state[`extra_w${ws}_s${ei}`]){
      try{
        const s=JSON.parse(state[`extra_w${ws}_s${ei}`]);
        const done=!!state[`extra_w${ws}_s${ei}_done`];
        const kmDone=state[`extra_w${ws}_s${ei}_km`]!=null?parseFloat(state[`extra_w${ws}_s${ei}_km`]):null;
        const perf=state[`extra_w${ws}_s${ei}_perf`]?JSON.parse(state[`extra_w${ws}_s${ei}_perf`]):{};
        sessions.push({s,ei,done,kmDone,perf});
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

    const numBg=isCur?'var(--blue)':isPast?'var(--bg2)':'var(--bg2)';
    const numColor=isCur?'#fff':isPast?'var(--muted)':'var(--text)';
    const statusHtml=allDone
      ?`<span style="font-size:13px;font-weight:700;color:#3B6D11;">${kmTotal}<span style="font-size:10px;font-weight:500;color:#3B6D11aa;"> km</span> <span style="font-size:11px;">✓</span></span>`
      :`<span style="font-size:13px;font-weight:700;color:${isCur?'var(--blue)':'var(--text)'};">${kmTotal}<span style="font-size:10px;font-weight:500;color:var(--muted);"> km</span></span>`;
    const progressHtml=isCur
      ?`<div class="plan-progress-bar"><div class="plan-progress-fill" style="width:${weekDone}%;background:var(--blue);"></div></div>`
      :isPast?`<div class="plan-progress-bar"><div class="plan-progress-fill" style="width:100%;background:#3B6D11;opacity:0.35;"></div></div>`:'';

    const isOpen=openWeeks.has(ws);
    const chevron=`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2.5" style="transform:${isOpen?'rotate(180deg)':'rotate(0)'};transition:transform 0.25s;flex-shrink:0;"><polyline points="6 9 12 15 18 9"/></svg>`;

    const badges=[];
    if(isCur) badges.push(`<span class="plan-badge" style="background:#EEF2FD;color:#1438A8;">En cours</span>`);
    if(isRaceWeekCard) badges.push(`<span class="plan-badge" style="background:#FEF9E7;color:#B7791F;">🏆 Course</span>`);
    else if(isAffutage) badges.push(`<span class="plan-badge" style="background:#EDF7EF;color:#2F6E44;">🔽 Affûtage</span>`);
    else if(isDecharge) badges.push(`<span class="plan-badge" style="background:#FEF3EE;color:#E8530A;">Décharge</span>`);

    const sessionRowsHtml=isOpen?sessions.map(({s,ei:eid,done,kmDone,perf},rowIdx)=>{
      const typeC=typeColor[s.type]||'#888';
      const typeBgC=typeBg[s.type]||'#f5f5f5';
      const lbl=typeLabel[s.type]||s.type;
      const title=s.d?s.d.split('|')[0]:'';
      const detail=s.d&&s.d.includes('|')?s.d.split('|')[1]:null;
      const clickFn=done?`openPerfEditExtraModal(${ws},${eid})`:`openEditExtraModal(${ws},${eid})`;
      const iconContent=done
        ?`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3B6D11" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`
        :`<span style="font-size:9px;font-weight:800;color:${typeC};">${lbl}</span>`;
      const iconBg=done?'#EAF3DE':typeBgC;
      const iconBorder=done?'#3B6D11':typeC;
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
          return `<span style="font-size:10px;color:var(--blue);font-weight:600;background:#EEF2FD;padding:1px 6px;border-radius:10px;margin-top:3px;display:inline-block;">${[s.sched_day?days[s.sched_day]:'',s.sched_time||''].filter(Boolean).join(' ')}</span>`;
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
            return `<span style="font-size:10px;color:var(--blue);font-weight:600;background:#EEF2FD;padding:1px 6px;border-radius:10px;margin-top:3px;display:inline-block;">${label}</span>`;
          }catch(e){}
        }
        return '';
      })();
      const sessionExplain=(()=>{
        if(s.type==='tempo'){
          const m=title.match(/(\d+)×(\d+)/);
          return m?`3 km d'échauffement EF → ${m[1]}×${m[2]} min à allure seuil → EF de fin`:"3 km d'échauffement EF → bloc tempo → EF de fin";
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
      return `<div class="plan-session-card" style="${done?'background:linear-gradient(90deg,rgba(59,109,17,0.03),transparent);':''}">
        <div onclick="${clickFn}" style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">
          <div class="plan-session-icon" style="background:${iconBg};border:1.5px solid ${iconBorder}22;">${iconContent}</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
              <span style="font-size:13px;font-weight:600;color:${done?'#3B6D11':'var(--text)'};">${title}</span>
              ${done?`<span style="font-size:10px;color:#3B6D11;font-weight:700;">✓</span>`:''}
            </div>
            ${detail?`<p style="font-size:11px;color:${done?'#5a8f2e':typeC};font-weight:500;margin-top:1px;">${detail}</p>`:''}
            ${durHtml}${schedHtml}
            ${sessionExplain?`<p style="font-size:10px;color:var(--muted);font-style:italic;margin-top:3px;line-height:1.4;">${sessionExplain}</p>`:''}
            <div style="margin-top:2px;">${s.shoe?shoeBadge(s.shoe):''}</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;flex-shrink:0;gap:4px;padding-left:8px;">
          <div style="text-align:right;">
            <span style="font-size:13px;font-weight:700;color:${done?'#3B6D11':'var(--text)'};">${kmShow}</span>
            <span style="font-size:10px;font-weight:500;color:${done?'#3B6D11aa':'var(--muted)'};">${kmSub?kmSub+'&thinsp;km':'&thinsp;km'}</span>
          </div>
          <button onclick="event.stopPropagation();openEditModal(${ws},${eid})" style="font-size:10px;color:var(--blue);background:#EEF2FD;border:none;border-radius:8px;padding:2px 7px;cursor:pointer;font-weight:600;white-space:nowrap;">Détails →</button>
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

    const addRowHtml=isOpen?`<div class="plan-add-row" onclick="openAddModal(${ws})">
      <div class="plan-session-icon" style="background:var(--bg2);border:1.5px dashed var(--border);">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </div>
      <span style="font-size:12px;color:var(--muted);">Ajouter une séance</span>
    </div>`:'';

    const card=document.createElement('div');
    card.className='plan-week-card'+(isCur?' is-current':isPast?' is-past':'')+(isRaceWeekCard?' is-race':'');
    card.innerHTML=`
      ${progressHtml}
      <div class="plan-week-header" onclick="toggleAthleteWeek(${ws})" style="${isRaceWeekCard?'background:linear-gradient(90deg,#FFFBEB,transparent);':''}">
        <div class="plan-week-num" style="background:${isRaceWeekCard?'#D97706':numBg};color:${isRaceWeekCard?'#fff':numColor};">S${ws}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
            <span style="font-size:12px;color:var(--muted);">${weekDateLabel||'Semaine '+ws}</span>
            ${badges.join('')}
          </div>
        </div>
        <div style="display:flex;align-items:center;flex-shrink:0;width:75px;">
          <div style="width:52px;text-align:right;">${statusHtml}</div>
          <div style="width:23px;display:flex;justify-content:flex-end;">${chevron}</div>
        </div>
      </div>
      ${sessionRowsHtml}${addRowHtml}`;
    // Séparateur de mois (inséré avant la carte si changement de mois)
    if(weekMonthIdx>=0&&weekMonthIdx!==currentRenderMonth){
      currentRenderMonth=weekMonthIdx;
      const sepEl=document.createElement('div');
      sepEl.style.cssText='display:flex;align-items:center;gap:8px;padding:10px 2px 4px;';
      sepEl.innerHTML=`<span style="font-size:11px;font-weight:700;color:var(--orange);text-transform:uppercase;letter-spacing:0.08em;">${weekMonthName}</span><div style="flex:1;height:1px;background:var(--border);"></div>`;
      el.appendChild(sepEl);
    }
    el.appendChild(card);
  });

  // Carte Jour J (si une séance de course est trouvée dans le plan)
  if(raceSessionData){
    try{
      const rd=raceSessionData.sched_date?new Date(raceSessionData.sched_date+'T00:00:00'):null;
      const courseName=(raceSessionData.d?raceSessionData.d.split('|')[0]:'Course').replace('🏆 ','');
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
}

function toggleAthleteWeek(ws){
  if(openWeeks.has(ws))openWeeks.delete(ws);else openWeeks.add(ws);
  if(_adminPreviewUid) _refreshAthleteCoachView(); else renderPlan();
}

function moveExtraSession(ws,rowIdx,dir){
  // Collecter les indices existants
  const keys=[];
  let ei=0;
  while(state[`extra_w${ws}_s${ei}`]){keys.push(ei);ei++;}
  const target=rowIdx+dir;
  if(target<0||target>=keys.length) return;
  // Échanger les deux séances (toutes leurs clés associées)
  const suffixes=['','_done','_km','_perf'];
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

  let currentMonth='';
  weeks.forEach(w=>{
    try {
    const isCur=w.s===CW, isPast=w.s<CW, isOpen=openWeeks.has(w.s);
    const isDecharge=[8,12,16,20,26,30].includes(w.s);
    const isSemi=w.s===27, isMarathon=w.s===32;

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
      sep.innerHTML=`<span style="font-size:11px;font-weight:700;color:var(--orange);text-transform:uppercase;letter-spacing:0.1em;">${w.month}</span><div style="flex:1;height:1px;background:var(--border);"></div>`;
      el.appendChild(sep);
    }

    // Card
    const card=document.createElement('div');
    card.className='plan-week-card'+(isCur?' is-current':isPast?' is-past':'');

    // ── Header ──
    // Couleur du numéro de semaine
    const numBg = isCur ? 'var(--blue)' : isPast ? 'var(--bg2)' : 'var(--bg2)';
    const numColor = isCur ? '#fff' : isPast ? 'var(--muted)' : 'var(--text)';

    // Badges
    const badges = [];
    if(isCur) badges.push(`<span class="plan-badge" style="background:#EEF2FD;color:#1438A8;">En cours</span>`);
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
        total += rv!=null ? parseFloat(rv) : getSession(w.s,si).km;
      });
      // Ajouter les séances extra validées
      let ei=0;
      while(state[`extra_w${w.s}_s${ei}`]){
        if(state[`extra_w${w.s}_s${ei}_done`]){
          const rv=state[`extra_w${w.s}_s${ei}_km`];
          const es=JSON.parse(state[`extra_w${w.s}_s${ei}`]);
          total += rv!=null ? parseFloat(rv) : es.km;
        }
        ei++;
      }
      return Math.round(total*10)/10;
    })() : null;

    const statusHtml = isPast||(isCur&&isCurrentAllDone)
      ? `<span style="font-size:13px;font-weight:700;color:#3B6D11;">${realWeekKm}<span style="font-size:10px;font-weight:500;color:#3B6D11aa;"> km</span> <span style="font-size:11px;">✓</span></span>`
      : `<span style="font-size:13px;font-weight:700;color:${isCur?'var(--blue)':'var(--text)'};">${kmTotal}<span style="font-size:10px;font-weight:500;color:var(--muted);"> km</span></span>`;

    // Barre de progression (semaine en cours uniquement)
    const progressHtml = isCur
      ? `<div class="plan-progress-bar"><div class="plan-progress-fill" style="width:${weekDone}%;background:var(--blue);"></div></div>`
      : isPast
      ? `<div class="plan-progress-bar"><div class="plan-progress-fill" style="width:100%;background:#3B6D11;opacity:0.35;"></div></div>`
      : '';

    // Séances
    const allSessions=[];
    const baseOrder=weeks[w.s-1].sessions.map((_,si)=>({si,extra:false})).filter(({si})=>!state[`del_w${w.s}_s${si}`]);
    let ei=0;
    while(state[`extra_w${w.s}_s${ei}`]){baseOrder.push({si:'x'+ei,extra:true,ei});ei++;}

    // Comparaison stable — ne pas utiliser JSON.stringify (sensible à l'ordre des clés)
    // sessionMatch tolère les anciens formats (sans champ extra:false explicite)
    const sessionMatch = (a, b) => !!a.extra === !!b.extra && (a.extra ? a.ei === b.ei : a.si === b.si);

    const savedOrder = state[`order_w${w.s}`]
      ? JSON.parse(state[`order_w${w.s}`]).filter(Boolean)  // filter nulls
      : null;
    const orderedSessions = savedOrder
      ? savedOrder.map(o => baseOrder.find(b => sessionMatch(b, o))).filter(Boolean)
      : [...baseOrder];
    // Ajouter les séances manquantes (ex: extra ajoutée après enregistrement de l'ordre)
    baseOrder.forEach(b=>{if(!orderedSessions.find(o=>sessionMatch(o,b)))orderedSessions.push(b);});
    orderedSessions.forEach(({si,extra,ei:eid})=>{
      const s=extra?JSON.parse(state[`extra_w${w.s}_s${eid}`]):getSession(w.s,si);
      allSessions.push({s,si,extra,ei:eid});
    });
    const totalRows=allSessions.length;

    const sessionRowsHtml = isOpen ? allSessions.map(({s:s2,si,extra,ei:eid},rowIdx)=>{
      const typeC=typeColor[s2.type]||'#888';
      const typeBgC=typeBg[s2.type]||'#f5f5f5';
      const lbl=typeLabel[s2.type]||'EF';
      const parts=s2.d.split('|');
      const title=parts[0];
      const detail=filterDetailDisplay(title, parts[1]||null);
      const edited=!extra&&state[`edit_w${w.s}_s${si}`];
      const isDone=extra ? !!state[`extra_w${w.s}_s${eid}_done`] : !!state[gk(w.s,si)+'done'];
      const clickFn=extra
        ? (isDone ? `openPerfEditExtraModal(${w.s},${eid})` : `openEditExtraModal(${w.s},${eid})`)
        : (isDone ? `openPerfEditModal(${w.s},${si})` : `openEditModal(${w.s},${si})`);

      // Horaire planifié
      let schedHtml='';
      if(!extra){
        const edRaw=state[`edit_w${w.s}_s${si}`];
        if(edRaw){
          const ed=JSON.parse(edRaw);
          if(ed.sched_day||ed.sched_time){
            const days=['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
            const dayStr=ed.sched_day?days[ed.sched_day]:'';
            const timeStr=ed.sched_time||'';
            schedHtml=`<span style="font-size:10px;color:var(--blue);font-weight:600;background:#EEF2FD;padding:1px 6px;border-radius:10px;margin-top:3px;display:inline-block;">${[dayStr,timeStr].filter(Boolean).join(' ')}</span>`;
          }
        }
      } else {
        // Séance extra : lire sched_day/sched_time depuis l'objet extra lui-même
        if(s2.sched_day||s2.sched_time){
          const days=['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
          const dayStr=s2.sched_day?days[s2.sched_day]:'';
          const timeStr=s2.sched_time||'';
          schedHtml=`<span style="font-size:10px;color:var(--blue);font-weight:600;background:#EEF2FD;padding:1px 6px;border-radius:10px;margin-top:3px;display:inline-block;">${[dayStr,timeStr].filter(Boolean).join(' ')}</span>`;
        }
      }

      const iconContent = isDone
        ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3B6D11" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`
        : `<span style="font-size:9px;font-weight:800;color:${typeC};">${lbl}</span>`;
      const iconBg = isDone ? '#EAF3DE' : typeBgC;
      const iconBorder = isDone ? '#3B6D11' : typeC;

      const canUp=rowIdx>0, canDown=rowIdx<totalRows-1;

      return `<div class="plan-session-card" style="${isDone?'background:linear-gradient(90deg,rgba(59,109,17,0.03),transparent);':''}">
        <div onclick="${clickFn}" style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">
          <div class="plan-session-icon" style="background:${iconBg};border:1.5px solid ${iconBorder}22;">
            ${iconContent}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
              <span style="font-size:13px;font-weight:600;color:${isDone?'#3B6D11':'var(--text)'};">${title}</span>
              ${edited?`<span style="font-size:10px;color:var(--blue);">✎</span>`:''}
              ${isDone?`<span style="font-size:10px;color:#3B6D11;font-weight:700;">✓</span>`:''}
            </div>
            ${detail?`<p style="font-size:11px;color:${isDone?'#5a8f2e':typeC};font-weight:500;margin-top:1px;">${detail}</p>`:''}
            ${(()=>{
              if(isDone){
                const perfRaw = extra ? state[`extra_w${w.s}_s${eid}_perf`] : state[gk(w.s,si)+'perf'];
                const perf2 = perfRaw ? JSON.parse(perfRaw) : {};
                const rp = perf2.pace || null;
                const rd = perf2.dur || null;
                const parts=[];
                if(rd) parts.push(`<span style="font-size:10px;font-weight:600;color:#3B6D11;">⏱ ${rd}</span>`);
                if(rp) parts.push(`<span style="font-size:10px;color:#3B6D11;font-weight:600;">🏃 ${rp}/km</span>`);
                return parts.length?`<div style="display:flex;gap:6px;align-items:center;margin-top:2px;">${parts.join('<span style="color:var(--border);"> · </span>')}</div>`:'';
              }
              const dur=calcSessionDuration(s2,getBestEfPace(),getMarathonPaceStr());
              return dur?`<span style="font-size:10px;color:var(--muted);font-weight:500;">⏱ ~${dur}</span>`:'';
            })()}
            ${schedHtml}
            <div style="margin-top:2px;">${s2.shoe?shoeBadge(s2.shoe):''}</div>
          </div>
        </div>
        <!-- Colonne droite fixe 75px : km (52px) + flèches (23px) — identique au header -->
        <div style="display:flex;align-items:center;flex-shrink:0;width:75px;">
          ${(()=>{
            const rvPlan = extra ? state[`extra_w${w.s}_s${eid}_km`] : state[gk(w.s,si)+'km'];
            const kmShow = isDone && rvPlan!=null ? rvPlan : s2.km;
            const sub = isDone && rvPlan!=null
              ? `<span style="font-size:9px;font-weight:400;color:#3B6D11aa;"> /&nbsp;${s2.km}</span>`
              : '';
            return `<div style="width:52px;text-align:right;flex-shrink:0;">`
              +`<span style="font-size:13px;font-weight:700;color:${isDone?'#3B6D11':'var(--text)'}">${kmShow}</span>`
              +`<span style="font-size:10px;font-weight:500;color:${isDone?'#3B6D11aa':'var(--muted)'};">${sub ? sub+'&thinsp;km' : '&thinsp;km'}</span>`
              +'</div>';
          })()}
          <div class="plan-session-move">
            <button onclick="moveSession(${w.s},${rowIdx},-1)" ${canUp?'':'disabled'} title="Monter">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
            </button>
            <button onclick="moveSession(${w.s},${rowIdx},1)" ${canDown?'':'disabled'} title="Descendre">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
        </div>
      </div>`;
    }).join('') : '';

    const addRowHtml = isOpen ? `<div class="plan-add-row" onclick="openAddModal(${w.s})">
      <div class="plan-session-icon" style="background:var(--bg2);border:1.5px dashed var(--border);">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </div>
      <span style="font-size:12px;color:var(--muted);">Ajouter une séance</span>
    </div>` : '';

    // Chevron
    const chevron = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2.5" style="transform:${isOpen?'rotate(180deg)':'rotate(0)'};transition:transform 0.25s;flex-shrink:0;"><polyline points="6 9 12 15 18 9"/></svg>`;

    card.innerHTML = `
      ${progressHtml}
      <div class="plan-week-header" onclick="toggleWeek(${w.s})">
        <div class="plan-week-num" style="background:${numBg};color:${numColor};">S${w.s}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
            <span style="font-size:12px;color:var(--muted);">lun. ${w.date}</span>
            ${badges.join('')}
          </div>
        </div>
        <div style="display:flex;align-items:center;flex-shrink:0;width:75px;">
          <div style="width:52px;text-align:right;">
            ${statusHtml}
          </div>
          <div style="width:23px;display:flex;justify-content:center;">
            ${chevron}
          </div>
        </div>
      </div>
      ${sessionRowsHtml}
      ${addRowHtml}
    `;
    el.appendChild(card);
    } catch(e) { console.error('renderPlan error S'+w.s+':', e); }
  });
}

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
  const savedOrder=state[`order_w${ws}`]?JSON.parse(state[`order_w${ws}`]):null;
  const ordered=savedOrder?savedOrder.map(o=>baseOrder.find(b=>JSON.stringify(b)===JSON.stringify(o))).filter(Boolean):baseOrder;
  // Add any new sessions not in saved order
  baseOrder.forEach(b=>{
    if(!ordered.find(o=>JSON.stringify(o)===JSON.stringify(b))) ordered.push(b);
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

function getSession(ws, si){
  const key = `edit_w${ws}_s${si}`;
  const sess = state[key] ? JSON.parse(state[key]) : weeks[ws-1].sessions[si];
  // Pour les séances Long : remplacer l'allure AM du detail par getAmTrainingPace()
  if(sess && sess.type === 'long' && sess.d && sess.d.includes('AM @')) {
    const amPace = getAmTrainingPace();
    const updated = Object.assign({}, sess, {
      d: sess.d.replace(/AM @ [\d'':]+\/km/g, `AM @ ${amPace}/km`)
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
  const amPace=parsePaceStr(getAmTrainingPace());
  if(!efPace||!amPace){durEl.textContent='—';return;}
  let totalMin=0;
  blocks.forEach(b=>totalMin+=(b.type==='AM'?amPace:efPace)*b.km);
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
  container.innerHTML=blocks.map((b,i)=>`
    <div style="display:flex;align-items:center;gap:6px;">
      <div style="flex:1;display:flex;align-items:center;gap:8px;background:var(--bg);border-radius:12px;padding:10px 12px;border:2px solid ${b.type==='EF'?'#3B6D1130':'#534AB730'};">
        <button onclick="toggleLongBlockType(${i})" style="padding:5px 12px;border-radius:20px;border:none;cursor:pointer;font-size:11px;font-weight:800;background:${b.type==='EF'?'#EAF3DE':'#EEEDFE'};color:${b.type==='EF'?'#3B6D11':'#1B4FD8'};flex-shrink:0;">${b.type}</button>
        <div style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;">
          <button onclick="stepLongBlockKm(${i},-1)" style="width:28px;height:28px;border-radius:50%;border:1.5px solid var(--border);background:var(--bg);cursor:pointer;font-size:16px;color:var(--text);display:flex;align-items:center;justify-content:center;flex-shrink:0;">−</button>
          <span id="lb-km-${i}" style="font-size:20px;font-weight:700;color:var(--text);min-width:32px;text-align:center;">${b.km}</span>
          <button onclick="stepLongBlockKm(${i},1)" style="width:28px;height:28px;border-radius:50%;border:1.5px solid var(--border);background:var(--bg);cursor:pointer;font-size:16px;color:var(--text);display:flex;align-items:center;justify-content:center;flex-shrink:0;">+</button>
        </div>
        <span style="font-size:10px;color:var(--muted);flex-shrink:0;">${b.type==='AM'?getAmTrainingPace()+'/km':'EF'}</span>
      </div>
      <button onclick="removeLongBlock(${i})" style="background:none;border:none;cursor:pointer;color:#E24B4A;font-size:20px;padding:0 4px;flex-shrink:0;">×</button>
    </div>`).join('');
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
  blocks[i].type=blocks[i].type==='EF'?'AM':'EF';
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
  const am=getMarathonPaceStr();
  const efField=document.getElementById('long-ef-pace');
  const efPace=efField&&efField.value.trim()?efField.value.trim():null;
  const efDefault=(getBestEfPace()||'6:40').replace("'",'::').split('::')[0];
  const detail=blocks.map(b=>`${b.km} ${b.type}${b.type==='AM'?' @ '+am+'/km':''}`).join(' · ');
  // Sauvegarder l'allure EF si différente de la valeur par défaut
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
        <button id="garmin-pedit-btn" onclick="importFromStravaForPerfEdit(${ws},${si})" style="display:flex;align-items:center;gap:5px;padding:7px 11px;background:${prev.strava?'#3B6D11':'#FC4C02'};border:none;border-radius:20px;color:#fff;font-size:11px;font-weight:700;cursor:pointer;">
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
  const _typeColors={ef:{bg:'modal-header-ef',icon:'🟢',label:'Endurance Fondamentale'},tempo:{bg:'modal-header-tempo',icon:'🔥',label:'Tempo'},frac:{bg:'modal-header-frac',icon:'⚡',label:'Fractionné'},long:{bg:'modal-header-long',icon:'💜',label:'EF Longue'},rest:{bg:'modal-header-default',icon:'😴',label:'Repos'},race:{bg:'modal-header-default',icon:'🏁',label:'Course'}};
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
    name   = 'Séance EF';
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
    name=existing3.d.split('|')[0]||'Séance EF';
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
    while(state[`extra_w${ws}_s${ei}`]){
      const s=JSON.parse(state[`extra_w${ws}_s${ei}`]);
      if(s.shoe===shoeName && s.km>0){
        sessions.push({title:s.d.split('|')[0],km:s.km,ws});
      }
      ei++;
    }
  }
  // S7 en cours : séances déjà cochées
  const w=weeks[CW-1];
  getOrderedWeekSessions(CW).forEach(({s,si,extra})=>{
    if(s.shoe!==shoeName||s.km===0) return;
    const done=!extra&&(state[gk(CW,si)+'done']||state[gk(CW,si)+'km']!=null);
    if(!done) return;
    const kmReal=(!extra&&state[gk(CW,si)+'km']!=null)?state[gk(CW,si)+'km']:s.km;
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

let chartKm=null;
let chartFcRepos=null;
