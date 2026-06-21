function openAmTrainingModal(){
  const current = state._am_training_pace || "5'20";
  const paceVal = current.replace("'",":");
  const overlay = document.createElement('div');
  overlay.id = 'modal-container-am';
  overlay.style.cssText = 'position:fixed;inset:0;background:transparent;z-index:9999;display:flex;align-items:flex-end;justify-content:center;';
  const chips = ["5:00","5:05","5:10","5:15","5:20","5:25","5:30","5:35","5:40"].map(p =>
    `<button onclick="document.getElementById('am-training-input').value='${p}'" style="padding:7px 12px;border-radius:20px;font-size:12px;font-weight:600;border:1.5px solid var(--border);background:var(--bg2);color:var(--muted);cursor:pointer;">${p}</button>`
  ).join('');
  overlay.innerHTML = `<div style="background:var(--bg);border-radius:20px 20px 0 0;padding:20px 20px 32px;width:100%;max-width:440px;">
    <p style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:6px;">Allure AM entraînement</p>
    <p style="font-size:12px;color:var(--muted);margin-bottom:16px;">Allure cible pour les blocs AM dans tes séances Longues. Indépendante du prédicteur.</p>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
      <input type="text" id="am-training-input" value="${paceVal}" placeholder="5:20" maxlength="5" style="background:var(--bg2);border:2px solid #1B4FD8;border-radius:10px;padding:12px 16px;font-size:24px;font-weight:700;color:var(--text);width:110px;outline:none;text-align:center;">
      <span style="font-size:14px;color:var(--muted);">/km</span>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;">${chips}</div>
    <div style="display:flex;gap:10px;">
      <button onclick="_closeAmModal()" style="flex:1;padding:13px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;color:var(--muted);cursor:pointer;">Annuler</button>
      <button onclick="saveAmTrainingPace()" style="flex:2;padding:13px;background:#1B4FD8;border:none;border-radius:var(--radius-sm);font-size:14px;font-weight:700;color:#fff;cursor:pointer;">Enregistrer</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.onclick = e => { if(e.target === overlay) overlay.remove(); };
}

function saveAmTrainingPace(){
  const val = (document.getElementById('am-training-input')?.value||'').trim().replace("'",":");
  const m = val.match(/^(\d+):(\d{2})$/);
  if(!m){ alert("Format invalide. Ex: 5:20"); return; }
  state._am_training_pace = m[1]+"'"+m[2];
  save();
  _closeAmModal();
  renderHome();
}

function _closeAmModal(){
  const ov=document.getElementById('modal-container-am');
  if(!ov) return;
  ov.style.animation='none';
  void ov.offsetHeight;
  ov.style.transition='transform 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.4s ease';
  ov.style.transform='translateY(100%)';
  ov.style.opacity='0';
  setTimeout(()=>ov.remove(),520);
}
function openVo2maxModal() {
  const current = parseFloat(state['vo2max_current']) || 52;
  const history = state['vo2max_history'] ? JSON.parse(state['vo2max_history']) : [];
  const mc = document.getElementById('modal-container');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  let histHtml = '';
  if(history.length > 0) {
    histHtml = '<div style="background:var(--bg);border-radius:10px;border:1px solid var(--border);overflow:hidden;margin-top:12px;">';
    histHtml += '<div style="display:grid;grid-template-columns:1fr 80px;padding:7px 12px;background:var(--bg2);border-bottom:1px solid var(--border);"><span style="font-size:11px;font-weight:600;color:var(--muted);">Date</span><span style="font-size:11px;font-weight:600;color:var(--muted);text-align:right;">VO2max</span></div>';
    [...history].reverse().slice(0,5).forEach(e => {
      const d = new Date(e.date+'T12:00:00');
      const dateStr = d.toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'});
      histHtml += `<div style="display:grid;grid-template-columns:1fr 80px;padding:9px 12px;border-bottom:1px solid var(--border);align-items:center;">
        <span style="font-size:13px;color:var(--text);">${dateStr}</span>
        <span style="font-size:14px;font-weight:700;color:#1B4FD8;text-align:right;">${e.val}</span>
      </div>`;
    });
    histHtml += '</div>';
  }

  overlay.innerHTML = `<div class="modal-box">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div>
        <p style="font-size:16px;font-weight:700;color:var(--text);">VO2max</p>
        <p style="font-size:12px;color:var(--muted);margin-top:2px;">Mesurée par Garmin (ml/kg/min)</p>
      </div>
      <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:24px;line-height:1;">×</button>
    </div>
    <p style="font-size:12px;color:var(--muted);margin-bottom:8px;">Valeur actuelle — mise à jour par Garmin toutes les quelques semaines</p>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1B4FD8" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      <input id="vo2max-input" type="number" min="20" max="85" step="0.5" value="${current}" placeholder="52"
        style="flex:1;padding:12px 14px;border-radius:10px;border:1.5px solid var(--border);background:var(--bg2);font-size:22px;font-weight:700;color:var(--text);text-align:center;-moz-appearance:textfield;">
      <span style="font-size:16px;color:var(--muted);font-weight:600;">ml/kg/min</span>
    </div>
    <p style="font-size:11px;color:var(--muted);margin-bottom:16px;">Utilisée par le modèle VDOT pour prédire ton temps marathon.</p>
    <button onclick="saveVo2max()" style="width:100%;padding:13px;background:#1B4FD8;border:none;border-radius:var(--radius-sm);font-size:15px;font-weight:700;color:#fff;cursor:pointer;">Enregistrer</button>
    ${histHtml}
  </div>`;
  overlay.onclick = e => { if(e.target===overlay) closeModal(); };
  _lockBodyScroll();
  mc.appendChild(overlay);
  setTimeout(() => { const inp=document.getElementById('vo2max-input'); if(inp) inp.focus(); }, 100);
}

function saveVo2max() {
  const val = parseFloat(document.getElementById('vo2max-input')?.value);
  if(!val || val < 20 || val > 85) { alert('Valeur invalide (entre 20 et 85 ml/kg/min)'); return; }
  const today = new Date().toISOString().slice(0,10);
  // Sauvegarder valeur courante
  state['vo2max_current'] = val;
  // Ajouter à l'historique
  const history = state['vo2max_history'] ? JSON.parse(state['vo2max_history']) : [];
  // Éviter doublons même jour
  const filtered = history.filter(e => e.date !== today);
  filtered.push({ date: today, val });
  filtered.sort((a,b) => a.date.localeCompare(b.date));
  state['vo2max_history'] = JSON.stringify(filtered);
  save();
  closeModal();
  renderHome();
}

function getRecord10kmPredictions() {
  const r10raw = state['record_10km'];
  if (!r10raw) return null;
  // Parse "mm:ss" ou "hh:mm:ss" ou "mm'ss" 
  const clean = String(r10raw).replace(/'/g, ':').replace(/\s/g, '');
  const parts = clean.split(':').map(Number);
  let secTotal = 0;
  if (parts.length === 3) secTotal = parts[0]*3600 + parts[1]*60 + parts[2];
  else if (parts.length === 2) secTotal = parts[0]*60 + parts[1];
  else return null;
  if (!secTotal || secTotal < 1200 || secTotal > 7200) return null; // sanity check 20min-2h

  // Semi : 10km × 2.1
  const semiSec = Math.round(secTotal * 2.15);
  const semiH = Math.floor(semiSec / 3600);
  const semiM = Math.floor((semiSec % 3600) / 60);
  const semiS = semiSec % 60;
  const semiStr = semiH > 0
    ? semiH + 'h' + String(semiM).padStart(2,'0')
    : semiM + ':' + String(semiS).padStart(2,'0');

  // Vitesse moyenne semi (km/h)
  const semiDistKm = 21.097;
  const semiSpeedKmh = (semiDistKm / semiSec) * 3600;

  // Marathon : vitesse semi - 1 km/h
  const marSpeedKmh = semiSpeedKmh - 1;
  const marDistKm = 42.195;
  const marSec = Math.round((marDistKm / marSpeedKmh) * 3600);
  const marH = Math.floor(marSec / 3600);
  const marM = Math.floor((marSec % 3600) / 60);
  const marStr = marH + 'h' + String(marM).padStart(2,'0');

  // Allure marathon (sec/km)
  const marPaceSec = Math.round(3600 / marSpeedKmh);
  const marPaceStr = Math.floor(marPaceSec/60) + "'" + String(marPaceSec%60).padStart(2,'0');

  // Allure semi
  const semiPaceSec = Math.round(3600 / semiSpeedKmh);
  const semiPaceStr = Math.floor(semiPaceSec/60) + "'" + String(semiPaceSec%60).padStart(2,'0');

  // Format 10km
  const r10H = Math.floor(secTotal/3600);
  const r10M = Math.floor((secTotal%3600)/60);
  const r10S = secTotal%60;
  const r10Str = r10H > 0
    ? r10H + 'h' + String(r10M).padStart(2,'0') + ':' + String(r10S).padStart(2,'0')
    : String(r10M).padStart(2,'0') + ':' + String(r10S).padStart(2,'0');

  // Allure 10km
  const r10PaceSec = Math.round(secTotal / 10);
  const r10PaceStr = Math.floor(r10PaceSec/60) + "'" + String(r10PaceSec%60).padStart(2,'0');

  const r10SpeedKmh = Math.round((10 / secTotal) * 3600 * 10) / 10;

  return {
    record10kmStr: r10Str,
    record10kmSec: secTotal,
    record10kmPaceStr: r10PaceStr,
    record10kmSpeedKmh: r10SpeedKmh,
    semiStr, semiSec, semiPaceStr,
    semiSpeedKmh: Math.round(semiSpeedKmh * 10) / 10,
    marStr, marSec, marPaceStr,
    marSpeedKmh: Math.round(marSpeedKmh * 10) / 10,
    sub4h: marSec < 14400,
    sub4hEcartMin: Math.round((marSec - 14400) / 60)
  };
}

function openRecord10kmModal() {
  const current = state['record_10km'] || '';
  const pred = getRecord10kmPredictions();
  const mc = document.getElementById('modal-container');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const predHtml = pred ? `
    <div style="margin-top:16px;border-radius:12px;overflow:hidden;border:1px solid var(--border);">
      <div style="background:var(--bg2);padding:8px 14px;border-bottom:1px solid var(--border);">
        <p style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;">Prédictions calculées</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;padding:10px 14px;gap:8px;background:var(--bg);">
        <div style="text-align:center;">
          <p style="font-size:10px;color:var(--muted);margin-bottom:4px;">Record 10km</p>
          <p style="font-size:16px;font-weight:800;color:var(--text);">${pred.record10kmStr}</p>
          <p style="font-size:9px;color:var(--muted);margin-top:2px;">${pred.record10kmPaceStr}/km</p>
        </div>
        <div style="text-align:center;border-left:1px solid var(--border);border-right:1px solid var(--border);padding:0 8px;">
          <p style="font-size:10px;color:var(--muted);margin-bottom:4px;">Semi estimé</p>
          <p style="font-size:16px;font-weight:800;color:#1B4FD8;">${pred.semiStr}</p>
          <p style="font-size:9px;color:var(--muted);margin-top:2px;">${pred.semiPaceStr}/km</p>
        </div>
        <div style="text-align:center;">
          <p style="font-size:10px;color:var(--muted);margin-bottom:4px;">Marathon estimé</p>
          <p style="font-size:16px;font-weight:800;color:#1B4FD8;">${pred.marStr}</p>
          <p style="font-size:9px;color:var(--muted);margin-top:2px;">${pred.marPaceStr}/km</p>
        </div>
      </div>
      <div style="background:var(--bg2);padding:8px 14px;border-top:1px solid var(--border);">
        <p style="font-size:10px;color:var(--muted);line-height:1.5;">Semi = 10km × 2.15 · Vitesse semi = <strong>${pred.semiSpeedKmh} km/h</strong> · Vitesse marathon = ${pred.semiSpeedKmh} − 1 = <strong>${pred.marSpeedKmh} km/h</strong> → ${pred.marPaceStr}/km</p>
      </div>
    </div>` : '';

  overlay.innerHTML = `<div class="modal-box">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div>
        <p style="font-size:16px;font-weight:700;color:var(--text);">Record 10km</p>
        <p style="font-size:12px;color:var(--muted);margin-top:2px;">Ton meilleur temps sur 10km</p>
      </div>
      <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:24px;line-height:1;">×</button>
    </div>
    <p style="font-size:12px;color:var(--muted);margin-bottom:8px;">Format mm:ss (ex : 48:30) ou hh:mm:ss</p>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1B4FD8" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <input id="record10km-input" type="text" value="${current}" placeholder="48:30"
        style="flex:1;padding:12px 14px;border-radius:10px;border:1.5px solid var(--border);background:var(--bg2);font-size:22px;font-weight:700;color:var(--text);text-align:center;"
        oninput="previewRecord10km(this.value)">
    </div>
    <div id="record10km-preview">${predHtml}</div>
    <button onclick="saveRecord10km()" style="width:100%;padding:13px;background:#1B4FD8;border:none;border-radius:var(--radius-sm);font-size:15px;font-weight:700;color:#fff;cursor:pointer;margin-top:12px;">Enregistrer</button>
  </div>`;
  overlay.onclick = e => { if(e.target===overlay) closeModal(); };
  _lockBodyScroll();
  mc.appendChild(overlay);
  setTimeout(() => { const inp=document.getElementById('record10km-input'); if(inp) inp.focus(); }, 100);
}

function previewRecord10km(val) {
  const prev = state['record_10km'];
  state['record_10km'] = val;
  const pred = getRecord10kmPredictions();
  state['record_10km'] = prev; // restore
  const container = document.getElementById('record10km-preview');
  if (!container) return;
  if (!pred) { container.innerHTML = ''; return; }
  container.innerHTML = `
    <div style="margin-top:16px;border-radius:12px;overflow:hidden;border:1px solid var(--border);">
      <div style="background:var(--bg2);padding:8px 14px;border-bottom:1px solid var(--border);">
        <p style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;">Prédictions calculées</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;padding:10px 14px;gap:8px;background:var(--bg);">
        <div style="text-align:center;">
          <p style="font-size:10px;color:var(--muted);margin-bottom:4px;">Record 10km</p>
          <p style="font-size:16px;font-weight:800;color:var(--text);">${pred.record10kmStr}</p>
          <p style="font-size:9px;color:var(--muted);margin-top:2px;">${pred.record10kmPaceStr}/km</p>
        </div>
        <div style="text-align:center;border-left:1px solid var(--border);border-right:1px solid var(--border);padding:0 8px;">
          <p style="font-size:10px;color:var(--muted);margin-bottom:4px;">Semi estimé</p>
          <p style="font-size:16px;font-weight:800;color:#1B4FD8;">${pred.semiStr}</p>
          <p style="font-size:9px;color:var(--muted);margin-top:2px;">${pred.semiPaceStr}/km</p>
        </div>
        <div style="text-align:center;">
          <p style="font-size:10px;color:var(--muted);margin-bottom:4px;">Marathon estimé</p>
          <p style="font-size:16px;font-weight:800;color:#1B4FD8;">${pred.marStr}</p>
          <p style="font-size:9px;color:var(--muted);margin-top:2px;">${pred.marPaceStr}/km</p>
        </div>
      </div>
      <div style="background:var(--bg2);padding:8px 14px;border-top:1px solid var(--border);">
        <p style="font-size:10px;color:var(--muted);line-height:1.5;">Semi = 10km × 2.15 · Vitesse semi <strong>${pred.semiSpeedKmh} km/h</strong> · Marathon ${pred.semiSpeedKmh} − 1 = <strong>${pred.marSpeedKmh} km/h</strong> → ${pred.marPaceStr}/km</p>
      </div>
    </div>`;
}

function saveRecord10km() {
  const val = document.getElementById('record10km-input')?.value?.trim();
  if (!val) return;
  const clean = val.replace(/'/g, ':').replace(/\s/g, '');
  const parts = clean.split(':').map(Number);
  let sec = 0;
  if (parts.length === 3) { if(parts[1]>=60||parts[2]>=60){alert('Format invalide. Exemples : 48:30 ou 1:02:15');return;} sec = parts[0]*3600 + parts[1]*60 + parts[2]; }
  else if (parts.length === 2) { if(parts[1]>=60){alert('Format invalide. Les secondes doivent être < 60. Exemple : 48:30');return;} sec = parts[0]*60 + parts[1]; }
  if (!sec || sec < 1200 || sec > 7200) { alert('Format invalide. Exemples : 48:30 ou 1:02:15'); return; }
  state['record_10km'] = val;
  save();
  closeModal();
  renderHome();
  const b10 = document.getElementById('badge-record10km');
  if (b10) b10.textContent = val + ' 10km';
}

function openTargetTimeModal(){
  if(isAdmin()) return;
  const ob=state.onboarding||{};
  const course=ob.course||state.race_distance||'Marathon';
  const current=ob.target_time||state.target_time||'';
  const parts=current.split(':').map(Number);
  const curH=parts[0]||0, curM=parts[1]||0, curS=parts[2]||0;
  const existing=document.getElementById('target-time-modal');
  if(existing) existing.remove();
  const overlay=document.createElement('div');
  overlay.id='target-time-modal';
  overlay.className='modal-overlay';
  overlay.style.setProperty('--_overlay-bg','rgba(0,0,0,0.5)');
  overlay.innerHTML=`<div class="modal-box" style="max-width:340px;">
    <div style="background:linear-gradient(135deg,#0C447C,#1B4FD8);padding:18px 18px 14px;border-radius:24px 24px 0 0;color:#fff;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <p style="font-size:10px;font-weight:800;opacity:0.75;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:3px;">🎯 Temps cible</p>
          <p style="font-size:18px;font-weight:900;letter-spacing:-0.02em;">${course}</p>
        </div>
        <button onclick="document.getElementById('target-time-modal').remove()" style="background:rgba(255,255,255,0.2);border:none;cursor:pointer;color:#fff;font-size:18px;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;">×</button>
      </div>
    </div>
    <div style="padding:20px 18px 24px;">
      <p style="font-size:13px;color:var(--muted);margin-bottom:16px;text-align:center;">Modifie ton objectif de temps pour la course</p>
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:20px;">
        <div style="text-align:center;">
          <p style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">H</p>
          <input id="tt-h" type="number" min="0" max="9" value="${curH}" style="width:62px;text-align:center;font-size:28px;font-weight:800;color:var(--text);background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:10px 4px;outline:none;">
        </div>
        <p style="font-size:28px;font-weight:800;color:var(--muted);margin-top:18px;">:</p>
        <div style="text-align:center;">
          <p style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">MIN</p>
          <input id="tt-m" type="number" min="0" max="59" value="${String(curM).padStart(2,'0')}" style="width:62px;text-align:center;font-size:28px;font-weight:800;color:var(--text);background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:10px 4px;outline:none;">
        </div>
        <p style="font-size:28px;font-weight:800;color:var(--muted);margin-top:18px;">:</p>
        <div style="text-align:center;">
          <p style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">SEC</p>
          <input id="tt-s" type="number" min="0" max="59" value="${String(curS).padStart(2,'0')}" style="width:62px;text-align:center;font-size:28px;font-weight:800;color:var(--text);background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:10px 4px;outline:none;">
        </div>
      </div>
      <button onclick="_saveTargetTime()" style="width:100%;padding:14px;background:linear-gradient(135deg,#0C447C,#1B4FD8);border:none;border-radius:14px;font-size:15px;font-weight:800;color:#fff;cursor:pointer;box-shadow:0 4px 14px rgba(27,79,216,0.3);">✅ Enregistrer</button>
      <button onclick="_clearTargetTime()" style="width:100%;padding:11px;background:none;border:none;font-size:13px;color:var(--muted);cursor:pointer;margin-top:8px;">⏭️ Supprimer le temps cible</button>
    </div>
  </div>`;
  document.getElementById('modal-container').appendChild(overlay);
  setTimeout(()=>document.getElementById('tt-h')?.select(),100);
}

function _saveTargetTime(){
  const h=parseInt(document.getElementById('tt-h')?.value)||0;
  const m=parseInt(document.getElementById('tt-m')?.value)||0;
  const s=parseInt(document.getElementById('tt-s')?.value)||0;
  if(h===0&&m===0&&s===0) return _clearTargetTime();
  const tt=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
  state.target_time=tt;
  if(state.onboarding) state.onboarding.target_time=tt;
  if(dbRef){
    dbRef.child('target_time').set(tt).catch(()=>{});
    if(state.onboarding) dbRef.child('onboarding/target_time').set(tt).catch(()=>{});
  }
  document.getElementById('target-time-modal')?.remove();
  renderHome();
}

function _clearTargetTime(){
  delete state.target_time;
  if(state.onboarding) delete state.onboarding.target_time;
  if(dbRef){
    dbRef.child('target_time').remove().catch(()=>{});
    if(state.onboarding) dbRef.child('onboarding/target_time').remove().catch(()=>{});
  }
  document.getElementById('target-time-modal')?.remove();
  renderHome();
}

function openFcReposModal(dateParam){
  const today = new Date().toISOString().slice(0,10);
  const targetDate = dateParam || today;
  const d = new Date(targetDate + 'T12:00:00');
  const isToday = targetDate === today;
  const existing = state['fc_repos_'+targetDate] || '';

  // Calcul moyenne 7j pour contexte
  let fcSum=0,fcCount=0;
  for(let i=0;i<7;i++){const dd=new Date(d.getTime()-i*86400000);const ds=dd.toISOString().slice(0,10);const v=parseFloat(state['fc_repos_'+ds]);if(v&&!isNaN(v)&&ds!==targetDate){fcSum+=v;fcCount++;}}
  const moy7j = fcCount>0 ? Math.round(fcSum/fcCount) : null;

  // Heure pour le message d'accueil
  const hNow = new Date().getHours();
  const greeting = hNow < 9 ? 'Bonjour !' : hNow < 12 ? 'Bonne matinée !' : 'Bonne journée !';

  // Jour en français court
  const joursNoms = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const moisNoms = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const dateLabel = isToday ? `${joursNoms[d.getDay()]} ${d.getDate()} ${moisNoms[d.getMonth()]}` : d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});

  const mc=document.getElementById('modal-container');
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.style.cssText='align-items:flex-end;padding:0;';
  overlay.innerHTML=`
  <div style="
    background:#fff;
    border-radius:24px 24px 0 0;
    width:100%;
    max-width:480px;
    padding:0 0 max(20px,env(safe-area-inset-bottom)) 0;
    box-shadow:0 -8px 40px rgba(0,0,0,0.18);
    overflow:hidden;
    animation:slideUpSheet 0.3s cubic-bezier(0.32,0.72,0,1) both;
  ">
    <!-- En-tête dégradé -->
    <div style="background:linear-gradient(135deg,#B91C1C 0%,#E24B4A 60%,#F87171 100%);padding:24px 20px 28px;position:relative;overflow:hidden;">
      <div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;background:rgba(255,255,255,0.08);border-radius:50%;"></div>
      <div style="position:absolute;bottom:-20px;right:40px;width:80px;height:80px;background:rgba(255,255,255,0.06);border-radius:50%;"></div>
      <button onclick="closeModal()" style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.2);border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;line-height:1;">×</button>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">
        <div style="width:44px;height:44px;background:rgba(255,255,255,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;">❤️</div>
        <div>
          <p style="font-size:19px;font-weight:800;color:#fff;margin:0;line-height:1.1;">${greeting}</p>
          <p style="font-size:13px;color:rgba(255,255,255,0.8);margin:2px 0 0;font-weight:500;">${isToday?dateLabel:dateLabel+' — modification'}</p>
        </div>
      </div>
    </div>

    <!-- Corps -->
    <div style="padding:24px 20px 8px;">
      <p style="font-size:13px;color:#6B7280;margin:0 0 16px;text-align:center;font-weight:500;">Mesurée au réveil, <strong>avant de te lever</strong></p>

      <!-- Input principal -->
      <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:${moy7j?'12px':'20px'};">
        <input id="fc-repos-input" type="number" min="30" max="100" value="${existing}" placeholder="—"
          style="width:130px;padding:14px 10px;border-radius:16px;border:2.5px solid #F3F4F6;background:#FAFAFA;font-size:36px;font-weight:800;color:#111827;text-align:center;-moz-appearance:textfield;outline:none;transition:border-color 0.2s;"
          onfocus="this.style.borderColor='#E24B4A'"
          onblur="this.style.borderColor='#F3F4F6'">
        <span style="font-size:18px;color:#9CA3AF;font-weight:700;">bpm</span>
      </div>

      ${moy7j ? `
      <!-- Contexte 7j -->
      <div style="background:#FEF2F2;border-radius:12px;padding:10px 14px;margin-bottom:20px;display:flex;align-items:center;gap:8px;">
        <span style="font-size:14px;">📊</span>
        <p style="font-size:13px;color:#991B1B;margin:0;font-weight:500;">Moyenne 7 derniers jours : <strong>${moy7j} bpm</strong></p>
      </div>` : '<div style="height:8px;"></div>'}

      <!-- Bouton -->
      <button onclick="saveFcRepos('${targetDate}')"
        style="width:100%;padding:15px;background:linear-gradient(135deg,#B91C1C,#E24B4A);border:none;border-radius:16px;font-size:16px;font-weight:800;color:#fff;cursor:pointer;letter-spacing:0.02em;box-shadow:0 4px 16px rgba(226,75,74,0.35);transition:opacity 0.15s;"
        onmousedown="this.style.opacity='0.85'" onmouseup="this.style.opacity='1'"
        ontouchstart="this.style.opacity='0.85'"
        ontouchend="this.style.opacity='1'; event.preventDefault(); saveFcRepos('${targetDate}')">
        Enregistrer ma FC ❤️
      </button>
    </div>
  </div>
  <style>
    @keyframes slideUpSheet{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
    #fc-repos-input::-webkit-inner-spin-button,#fc-repos-input::-webkit-outer-spin-button{-webkit-appearance:none;}
  </style>`;
  overlay.onclick=e=>{if(e.target===overlay)closeModal();};
  _lockBodyScroll();
  mc.appendChild(overlay);
  setTimeout(()=>{ const inp=document.getElementById('fc-repos-input'); if(inp){inp.focus();inp.select();} },350);
}

function saveFcRepos(dateParam){
  const val = parseInt(document.getElementById('fc-repos-input')?.value);
  if(!val || val < 30 || val > 100) {
    alert('Valeur invalide (entre 30 et 100 bpm)');
    return;
  }
  const today = new Date().toISOString().slice(0,10);
  const targetDate = dateParam || today;
  state['fc_repos_'+targetDate] = val;
  if(targetDate === today) state['fc_repos'] = val; // valeur globale uniquement pour aujourd'hui
  save();
  closeModal();
  renderHome();
  if(document.getElementById('sc-stats').style.display!=='none') renderStats();
  if(targetDate === today && dbRef) {
    dbRef.child("_brief_trigger").set({date: today, ts: Date.now()}).catch(()=>{});
  }
}

// ── FC REPOS CONTEXT BUILDER ─────────────────────────────────────────────────
// Fonction centralisée — injecter dans TOUS les contextes coach
function buildFcReposContext() {
  // Collecter toutes les entrées datées fc_repos_YYYY-MM-DD
  const entries = [];
  Object.keys(state).forEach(k => {
    if(k.startsWith('fc_repos_') && k.match(/fc_repos_\d{4}-\d{2}-\d{2}/)) {
      const date = k.replace('fc_repos_', '');
      entries.push({ date, val: state[k] });
    }
  });
  entries.sort((a, b) => a.date.localeCompare(b.date));

  // Dernière mesure datée
  const derniere = entries.length > 0 ? entries[entries.length - 1] : null;
  const valeurActuelle = derniere ? derniere.val : (state['fc_repos'] || 51);

  // Date lisible de la dernière mesure
  let dateLabel = null;
  if(derniere) {
    const d = new Date(derniere.date + 'T12:00:00');
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const diffDays = Math.round((today - d) / (1000 * 60 * 60 * 24));
    const jours = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
    const mois = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'];
    const label = d.getDate()+' '+mois[d.getMonth()];
    if(diffDays === 0) dateLabel = 'aujourd\'hui ('+label+')';
    else if(diffDays === 1) dateLabel = 'hier ('+label+')';
    else if(diffDays <= 6) dateLabel = 'il y a '+diffDays+' jours ('+jours[d.getDay()]+' '+label+')';
    else dateLabel = label+' (il y a '+diffDays+' jours)';
  }

  // Statistiques sur les 7 / 14 / 30 dernières mesures
  const last7  = entries.slice(-7);
  const last14 = entries.slice(-14);
  const last30 = entries.slice(-30);

  function stats(arr) {
    if(arr.length === 0) return null;
    const vals = arr.map(e => e.val);
    const avg = Math.round(vals.reduce((a,b) => a+b, 0) / vals.length * 10) / 10;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    // Tendance : compare première moitié vs seconde moitié
    let tendance = 'stable';
    if(vals.length >= 4) {
      const mid = Math.floor(vals.length / 2);
      const avgFirst = vals.slice(0, mid).reduce((a,b) => a+b, 0) / mid;
      const avgLast  = vals.slice(mid).reduce((a,b) => a+b, 0) / (vals.length - mid);
      const diff = Math.round((avgLast - avgFirst) * 10) / 10;
      if(diff > 1.5) tendance = 'en hausse (+'+diff+' bpm)';
      else if(diff < -1.5) tendance = 'en baisse ('+diff+' bpm)';
      else tendance = 'stable ('+diff+' bpm)';
    }
    return { nb_mesures: arr.length, moyenne: avg, min, max, tendance };
  }

  // Alerte fatigue
  let alerte = null;
  if(valeurActuelle > 55) {
    if(valeurActuelle > 60) alerte = 'ALERTE FATIGUE ÉLEVÉE : '+valeurActuelle+' bpm (>60) — risque de surmenage, envisager repos';
    else alerte = 'FC repos élevée : '+valeurActuelle+' bpm (>55) — surveiller la fatigue accumulée';
  }

  return {
    valeur_actuelle: valeurActuelle,
    date_mesure: dateLabel || 'date inconnue (valeur par défaut)',
    nb_mesures_total: entries.length,
    derniers_jours: last7.map(e => ({ date: e.date, bpm: e.val })),
    stats_7j:  stats(last7),
    stats_14j: stats(last14),
    stats_30j: stats(last30),
    alerte_fatigue: alerte,
    note: valeurActuelle > 55
      ? 'FC repos > 55 bpm = signal de fatigue possible — à mentionner en priorité'
      : 'FC repos normale — bon état de récupération'
  };
}

