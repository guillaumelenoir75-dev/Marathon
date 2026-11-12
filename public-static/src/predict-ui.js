// Fenêtres de prédiction (à la demande : groupe « predict », point d'entrée dans config.js) — sorties de plan-predict.js
// pour alléger le démarrage ; les calculs (buildMarathonPrediction, predUnify…) restent dans plan-predict.js.
function openMarathonPredModal() {
  const ob = state.onboarding || {};
  const pred = buildMarathonPrediction();
  const mc = document.getElementById('modal-container');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  // Objectif déclaré (formulaire onboarding)
  const targetTimeStr = ob.target_time || state.target_time || null;
  let targetSec = null;
  if(targetTimeStr){const tp=targetTimeStr.split(':').map(Number);targetSec=((tp[0]||0)*3600+(tp[1]||0)*60+(tp[2]||0));}
  const fmtTimeLocal = s=>{const hh=Math.floor(s/3600),mm=Math.floor((s%3600)/60);return`${hh}h${String(mm).padStart(2,'0')}`;};
  // Delta prédiction vs objectif
  let vsObjectifHtml = '';
  if(targetSec && pred.tempsSec){
    const deltaMin = Math.round((pred.tempsSec - targetSec) / 60);
    const deltaAbs = Math.abs(deltaMin);
    const deltaColor = deltaMin <= 0 ? '#3B6D11' : deltaMin <= 10 ? '#E8530A' : '#E24B4A';
    const deltaLabel = deltaMin <= 0
      ? `${deltaAbs} min en avance sur ton objectif ✅`
      : `${deltaAbs} min au-dessus de ton objectif`;
    // Tendance de convergence : 3 derniers points de l'historique
    let tendanceVsObj = '';
    if(pred.historique && pred.historique.length >= 3){
      const last3 = pred.historique.slice(-3).map(h=>h.tempsSec-targetSec);
      if(last3[2] < last3[0] - 120) tendanceVsObj = ' · Tu te rapproches 📉';
      else if(last3[2] > last3[0] + 120) tendanceVsObj = ' · Tu t\'éloignes 📈';
      else tendanceVsObj = ' · Stable';
    }
    vsObjectifHtml = `<div style="font-size:12px;font-weight:700;color:${deltaColor};margin-top:10px;padding:6px 14px;background:${deltaColor}15;border-radius:20px;display:inline-block;">🎯 Objectif ${fmtTimeLocal(targetSec)} · ${deltaLabel}${tendanceVsObj}</div>`;
  }

  const sub4 = pred.sub4hEcartSec != null;
  const sub4Color = pred.sub4hEcartSec <= 0 ? '#3B6D11' : pred.sub4hEcartSec < 300 ? '#E8530A' : '#E24B4A';
  const sub4Text = pred.sub4hEcartSec <= 0
    ? `✅ Sub-4h atteint (+${Math.abs(Math.round(pred.sub4hEcartSec/60))} min d'avance)`
    : pred.sub4hEcartSec < 600
    ? `⚡ À ${Math.round(pred.sub4hEcartSec/60)} min du Sub-4h`
    : `🎯 ${Math.round(pred.sub4hEcartSec/60)} min au-dessus du Sub-4h`;

  const tendanceText = pred.tendanceSec == null ? '—'
    : pred.tendanceSec < -0.5
      ? `📈 −${Math.round(Math.abs(pred.tendanceSec)*10)/10} sec/km/sem`
      : pred.tendanceSec > 0.5
      ? `📉 +${Math.round(pred.tendanceSec*10)/10} sec/km/sem`
      : '↔️ Allure stable';

  const confiancePct = pred.confiance;
  const confianceFill = Math.round(confiancePct / 10);
  const confianceColor = confiancePct >= 70 ? '#3B6D11' : confiancePct >= 40 ? '#E8530A' : '#888';

  // Mini graphique SVG historique
  let svgGraph = '';
  if(pred.historique && pred.historique.length === 0) {
    svgGraph = '<p style="font-size:12px;color:var(--muted);text-align:center;margin:8px 0;">Graphique disponible à partir de la S4 avec des séances validées.</p>';
  } else if(pred.historique && pred.historique.length >= 2) {
    const W = 300, H = 90, PAD_L = 38, PAD_R = 10, PAD_T = 8, PAD_B = 18;
    const times = pred.historique.map(p => p.tempsSec);
    const sub4Sec = 4 * 3600;
    const anchors = [sub4Sec, ...(targetSec ? [targetSec] : [])];
    const rawMin = Math.min(...times, ...anchors) - 600;
    const rawMax = Math.max(...times, ...anchors) + 600;
    const yMin = Math.floor(rawMin/300)*300;
    const yMax = Math.ceil(rawMax/300)*300;
    const yRange = yMax - yMin;
    const toY = v => PAD_T + ((yMax - v) / yRange) * (H - PAD_T - PAD_B);
    const toX = i => PAD_L + (i / (pred.historique.length - 1)) * (W - PAD_L - PAD_R);
    const pts2 = pred.historique.map((p, i) => ({ x: toX(i), y: toY(p.tempsSec), ws: p.ws }));
    const polyline = pts2.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    let yLabels = '';
    for(let t = yMin; t <= yMax; t += 600) {
      const y = toY(t);
      const hh = Math.floor(t/3600), mm = Math.floor((t%3600)/60);
      yLabels += `<line x1="${PAD_L}" y1="${y.toFixed(1)}" x2="${W-PAD_R}" y2="${y.toFixed(1)}" stroke="#ddd" stroke-width="0.7"/>`;
      yLabels += `<text x="${PAD_L-3}" y="${(y+3).toFixed(1)}" text-anchor="end" font-size="7.5" fill="#999">${hh}h${String(mm).padStart(2,'0')}</text>`;
    }
    const sub4Y = toY(sub4Sec);
    // Ligne objectif déclaré
    const targetLineHtml = targetSec ? (()=>{
      const tY = toY(targetSec).toFixed(1);
      const tC = '#E8530A';
      return `<line x1="${PAD_L}" y1="${tY}" x2="${W-PAD_R}" y2="${tY}" stroke="${tC}" stroke-width="1.5" stroke-dasharray="5,3"/>
              <text x="${PAD_L+2}" y="${(parseFloat(tY)-3).toFixed(1)}" font-size="7.5" fill="${tC}" font-weight="700">Objectif</text>`;
    })() : '';
    svgGraph = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:90px;overflow:visible;">
      ${yLabels}
      <line x1="${PAD_L}" y1="${sub4Y.toFixed(1)}" x2="${W-PAD_R}" y2="${sub4Y.toFixed(1)}" stroke="#3B6D11" stroke-width="1.2" stroke-dasharray="4,3"/>
      <text x="${W-PAD_R}" y="${(sub4Y-3).toFixed(1)}" text-anchor="end" font-size="7.5" fill="#3B6D11" font-weight="600">Sub-4h</text>
      ${targetLineHtml}
      <polyline points="${polyline}" fill="none" stroke="#1B4FD8" stroke-width="2" stroke-linejoin="round"/>
      <polygon points="${polyline} ${(W-PAD_R).toFixed(1)},${(H-PAD_B).toFixed(1)} ${PAD_L},${(H-PAD_B).toFixed(1)}" fill="rgba(27,79,216,0.08)"/>
      ${pts2.map((p,i) => i===pts2.length-1
        ? `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#1B4FD8"/>`
        : `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="white" stroke="#1B4FD8" stroke-width="1.5"/>`
      ).join('')}
    </svg>`;
  }

  const methodeNote = `Modèle VDOT (Jack Daniels) · VO2max ${pred.vo2max} · ${pred.details?.nbEf||0} EF + ${pred.details?.nbLong||0} longues + ${pred.details?.nbTempo||0} tempos`;

  overlay.innerHTML = `<div class="modal-box">
    <!-- Header sticky -->
    <div style="padding:20px 20px 14px;border-bottom:1px solid var(--border);flex-shrink:0;display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <p style="font-size:17px;font-weight:800;color:var(--text);letter-spacing:-0.3px;">Prédiction marathon</p>
        <p style="font-size:11px;color:var(--muted);margin-top:3px;">${(()=>{
          const rd=ob.race_date||state.race_date||null;
          const rdStr=rd?new Date(rd).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}):'—';
          return `${rdStr} · Semaine ${CW}`;
        })()}</p>
      </div>
      <button onclick="closeModal()" style="background:var(--bg2);border:none;cursor:pointer;color:var(--muted);font-size:18px;line-height:1;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;">×</button>
    </div>

    <!-- Corps scrollable -->
    <div class="modal-scroll-body" style="padding:20px 20px 48px;">

    <!-- Temps principal -->
    <div style="text-align:center;margin-bottom:20px;padding:8px 0;">
      <div style="font-size:60px;font-weight:900;letter-spacing:-3px;color:var(--text);line-height:1;">${pred.tempsStr}</div>
      ${pred.tempsStrBase ? `<div style="font-size:12px;color:var(--muted);margin-top:6px;">Modèle entraînement · <strong style="color:var(--text);">${pred.tempsStrBase}</strong></div>` : ''}
      ${typeof predExplainHtml==='function'?predExplainHtml(pred):''}
      ${vsObjectifHtml}
      ${sub4 ? `<div style="font-size:13px;font-weight:700;color:${sub4Color};margin-top:8px;padding:6px 14px;background:${sub4Color}18;border-radius:20px;display:inline-block;">${sub4Text}</div>` : ''}
    </div>

    ${(!isAdmin() ? '' : `
    <!-- Saisie record 10km (admin) -->
    <div style="background:var(--bg2);border-radius:14px;padding:14px;margin-bottom:16px;border:1px solid var(--border);">
      <p style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">\u{1F3C3} Record 10km → Semi &amp; Marathon</p>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
        <input id="r10km-top-input" type="text" placeholder="mm:ss  (ex : 48:30)" value="${state['record_10km']||''}"
          style="flex:1;padding:10px 14px;border-radius:10px;border:1.5px solid var(--border);background:var(--bg);color:var(--text);font-size:16px;font-weight:700;text-align:center;"
          oninput="previewRecord10kmInPredict(this.value)" onkeydown="if(event.key==='Enter')saveRecord10kmInPredict(this.value)">
        <button onclick="saveRecord10kmInPredict(document.getElementById('r10km-top-input').value)"
          style="padding:10px 20px;background:#1B4FD8;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;">OK</button>
      </div>
      <div id="r10km-inline-preview">${(()=>{
        const r10 = getRecord10kmPredictions();
        if (!r10) return '<div style="font-size:11px;color:var(--muted);text-align:center;">Format mm:ss (ex : 48:30) ou hh:mm:ss</div>';
        return '<div style="border-radius:10px;overflow:hidden;border:1px solid var(--border);"><div style="display:grid;grid-template-columns:1fr 1fr 1fr;background:var(--bg);"><div style="text-align:center;padding:10px 6px;"><div style="font-size:10px;color:var(--muted);margin-bottom:3px;">Record 10km</div><div style="font-size:17px;font-weight:800;color:var(--text);">' + r10.record10kmStr + '</div><div style="font-size:9px;color:var(--muted);margin-top:2px;">' + r10.record10kmPaceStr + '/km</div></div><div style="text-align:center;padding:10px 6px;border-left:1px solid var(--border);border-right:1px solid var(--border);"><div style="font-size:10px;color:var(--muted);margin-bottom:3px;">Semi estimé</div><div style="font-size:17px;font-weight:800;color:#1B4FD8;">' + r10.semiStr + '</div><div style="font-size:9px;color:var(--muted);margin-top:2px;">' + r10.semiPaceStr + '/km</div></div><div style="text-align:center;padding:10px 6px;"><div style="font-size:10px;color:var(--muted);margin-bottom:3px;">Marathon estimé</div><div style="font-size:17px;font-weight:800;color:#1B4FD8;">' + r10.marStr + '</div><div style="font-size:9px;color:var(--muted);margin-top:2px;">' + r10.marPaceStr + '/km</div></div></div><div style="background:var(--bg2);padding:7px 12px;border-top:1px solid var(--border);font-size:10px;color:var(--muted);">Semi = 10km × 2.15 · Vitesse semi <strong>' + r10.semiSpeedKmh + ' km/h</strong> · Marathon ' + r10.semiSpeedKmh + ' − 1 = <strong>' + r10.marSpeedKmh + ' km/h</strong> → ' + r10.marPaceStr + '/km</div></div>';
      })()}</div>
    </div>`)}

    <!-- Confiance -->
    <div style="background:var(--bg2);border-radius:12px;padding:12px 14px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:12px;font-weight:600;color:var(--muted);">Indice de confiance</span>
        <span style="font-size:14px;font-weight:700;color:${confianceColor};">${confiancePct}%</span>
      </div>
      <div style="background:var(--border);border-radius:4px;height:6px;overflow:hidden;">
        <div style="width:${confiancePct}%;height:100%;background:${confianceColor};border-radius:4px;transition:width 0.5s;"></div>
      </div>
      <p style="font-size:10px;color:var(--muted);margin-top:6px;">${
        confiancePct < 30 ? 'Démarrage — moins de 5 séances analysées · affinage rapide en cours' :
        confiancePct < 50 ? 'Estimation préliminaire — les séances EF et tempo posent la base' :
        confiancePct < 65 ? 'En cours d\'affinage — les prochaines longues vont consolider la prédiction' :
        confiancePct < 75 ? 'Estimation fiable · Monte encore avec chaque longue > 18km' :
        'Estimation solide · converge avec chaque séance validée'
      } · ${pred.nbSeances} séances analysées</p>
    </div>

    <!-- Stats -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
      <div style="background:var(--bg2);border-radius:10px;padding:10px 12px;">
        <p style="font-size:10px;color:var(--muted);margin-bottom:4px;">Tendance allure EF (tout l'historique)</p>
        <p style="font-size:13px;font-weight:700;color:${pred.tendanceSec!=null&&pred.tendanceSec<-0.3?'#3B6D11':pred.tendanceSec!=null&&pred.tendanceSec>0.3?'#E24B4A':'var(--text)'};">${tendanceText}</p>
        <p style="font-size:9px;color:var(--muted);margin-top:3px;">${pred.tendanceSec!=null&&pred.tendanceSec<-0.3?'Tu t\'améliores ✅':pred.tendanceSec!=null&&pred.tendanceSec>0.3?'Régression (fatigue ?)':'Stable'}</p>
      </div>
      <div style="background:var(--bg2);border-radius:10px;padding:10px 12px;">
        <p style="font-size:10px;color:var(--muted);margin-bottom:4px;">Séances analysées</p>
        <p style="font-size:16px;font-weight:800;color:var(--text);margin-bottom:2px;">${pred.nbSeances} séances</p>
        <p style="font-size:10px;color:var(--muted);">${pred.details?.nbEf||0} EF · ${pred.details?.nbLong||0} longues · ${pred.details?.nbTempo||0} tempos</p>
      </div>
      <div style="background:var(--bg2);border-radius:10px;padding:10px 12px;">
        <p style="font-size:10px;color:var(--muted);margin-bottom:4px;">Potentiel théorique (VO2max ${pred.vo2max})</p>
        <p style="font-size:13px;font-weight:700;color:#1B4FD8;">${pred.details ? pred.details.vdotPurLabel : '—'} <span style="font-size:9px;color:var(--muted);font-weight:400;">sans fatigue</span></p>
      </div>
      <div style="background:var(--bg2);border-radius:10px;padding:10px 12px;cursor:pointer;" onclick="closeModal();openVo2maxModal();">
        <p style="font-size:10px;color:var(--muted);margin-bottom:4px;">VO2max · modifier ✎</p>
        <p style="font-size:13px;font-weight:700;color:#1B4FD8;">${pred.vo2max} <span style="font-size:10px;font-weight:400;">ml/kg/min</span></p>
      </div>
    </div>

    <!-- Graphique évolution -->
    ${pred.historique && pred.historique.length >= 2 ? `
    <div style="background:var(--bg2);border-radius:12px;padding:12px 14px;margin-bottom:12px;">
      <p style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Évolution de la prédiction</p>
      ${svgGraph}
      <div style="display:flex;justify-content:space-between;margin-top:4px;">
        <span style="font-size:9px;color:var(--muted);">${pred.historique[0]&&pred.historique[0].date?_ppWk(pred.historique[0]):'début'}</span>
        <span style="font-size:9px;color:var(--muted);">aujourd'hui</span>
      </div>
    </div>` : ''}

    <!-- Tableau record 10km (admin uniquement) -->
    ${(!isAdmin() ? '' : (()=>{
      const r10pred = getRecord10kmPredictions();
      if(!r10pred) return `
    <div style="background:var(--bg2);border-radius:12px;padding:12px 14px;margin-bottom:12px;border:1.5px dashed var(--border);">
      <p style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">&#x1F3C3; Record 10km &rarr; Semi &amp; Marathon</p>
      <div style="display:flex;gap:8px;align-items:center;">
        <input id="r10km-inline-input" type="text" placeholder="mm:ss (ex: 48:30)" value="${state['record_10km']||''}"
          style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:13px;font-weight:600;"
          oninput="previewRecord10kmInPredict(this.value)" onkeydown="if(event.key==='Enter')saveRecord10kmInPredict(this.value)">
        <button onclick="saveRecord10kmInPredict(document.getElementById('r10km-inline-input').value)"
          style="padding:8px 14px;background:#1B4FD8;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">OK</button>
      </div>
      <div id="r10km-inline-preview" style="margin-top:8px;"></div>
    </div>`;
      const marEcartMin = Math.round((r10pred.marSec - 14400) / 60);
      const diffMin = Math.round((r10pred.marSec - pred.tempsSec) / 60);
      const diffLabel = diffMin === 0 ? '= Modèle entraînement' : diffMin > 0 ? `+${diffMin} min vs modèle` : `${diffMin} min vs modèle`;
      const diffColor = Math.abs(diffMin) <= 5 ? '#3B6D11' : Math.abs(diffMin) <= 15 ? '#E8530A' : '#E24B4A';
      return `
    <div style="background:var(--bg2);border-radius:12px;margin-bottom:12px;overflow:hidden;border:1px solid var(--border);">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 14px;border-bottom:1px solid var(--border);">
        <p style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;">\u{1F3C3} Estimation par record 10km</p>
        <button onclick="toggleRecord10kmEditInPredict()" style="background:none;border:none;cursor:pointer;padding:0;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2.5"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;background:var(--bg);">
        <div style="text-align:center;padding:10px 6px;">
          <p style="font-size:10px;color:var(--muted);margin-bottom:3px;">Record 10km</p>
          <p style="font-size:17px;font-weight:800;color:var(--text);">${r10pred.record10kmStr}</p>
          <p style="font-size:9px;color:var(--muted);margin-top:2px;">${r10pred.record10kmPaceStr}/km</p>
          <p style="font-size:9px;font-weight:600;color:var(--muted);margin-top:1px;">${r10pred.record10kmSpeedKmh} km/h</p>
        </div>
        <div style="text-align:center;padding:10px 6px;border-left:1px solid var(--border);border-right:1px solid var(--border);">
          <p style="font-size:10px;color:var(--muted);margin-bottom:3px;">Semi estim\u00e9</p>
          <p style="font-size:17px;font-weight:800;color:#1B4FD8;">${r10pred.semiStr}</p>
          <p style="font-size:9px;color:var(--muted);margin-top:2px;">${r10pred.semiPaceStr}/km</p>
          <p style="font-size:9px;font-weight:600;color:var(--muted);margin-top:1px;">${r10pred.semiSpeedKmh} km/h</p>
        </div>
        <div style="text-align:center;padding:10px 6px;">
          <p style="font-size:10px;color:var(--muted);margin-bottom:3px;">Marathon estim\u00e9</p>
          <p style="font-size:17px;font-weight:800;color:#1B4FD8;">${r10pred.marStr}</p>
          <p style="font-size:9px;color:var(--muted);margin-top:2px;">${r10pred.marPaceStr}/km</p>
          <p style="font-size:9px;font-weight:600;color:var(--muted);margin-top:1px;">${r10pred.marSpeedKmh} km/h</p>
        </div>
      </div>
      <div id="r10km-edit-inline" style="display:none;padding:10px 14px;border-top:1px solid var(--border);background:var(--bg2);">
        <div style="display:flex;gap:8px;align-items:center;">
          <input id="r10km-edit-input" type="text" placeholder="mm:ss (ex: 48:30)" value="${state['record_10km']||''}"
            style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:13px;font-weight:600;"
            oninput="previewRecord10kmInPredict(this.value)" onkeydown="if(event.key==='Enter')saveRecord10kmInPredict(this.value)">
          <button onclick="saveRecord10kmInPredict(document.getElementById('r10km-edit-input').value)"
            style="padding:8px 14px;background:#1B4FD8;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">OK</button>
        </div>
        <div id="r10km-inline-preview" style="margin-top:8px;"></div>
      </div>
    </div>`;
    })())}

    <!-- Tableau décomposition -->
    ${(()=>{
      const d = pred.details || {};
      const fmtTime = s => { const hh=Math.floor(s/3600),mm=Math.floor((s%3600)/60); return `${hh}h${String(mm).padStart(2,'0')}`; };
      const fmtPace = s => s ? `${Math.floor(s/60)}'${String(Math.round(s%60)).padStart(2,'0')}"` : '—';
      const fmtT = s => s ? fmtTime(s) : '—';
      const sub4Sec = 14400;
      const ecart = s => {
        if(!s) return '';
        const diff = Math.round((s-sub4Sec)/60);
        return diff<=0 ? `<span style="color:#3B6D11;font-weight:700;">Sub-4h ✅</span>` : `<span style="color:#E24B4A;">+${diff} min du Sub-4h</span>`;
      };
      const gainIfImprove = (sec, pct) => sec ? fmtTime(Math.round(sec*(1-pct/100))) : '—';

      const rows = [];

      if(d.amFromEf) {
        // Tendance individuelle EF
        let efTrendHtml = '';
        if(d.efHistory && d.efHistory.length > 0) {
          const fmtPaceSec = s => `${Math.floor(s/60)}'${String(Math.round(s%60)).padStart(2,'0')}`;
          const items = d.efHistory.map((h,i) => {
            const prev = i>0 ? d.efHistory[i-1].normPace : null;
            const arrow = prev===null ? '' : h.normPace < prev-3 ? ' ↓' : h.normPace > prev+3 ? ' ↑' : ' →';
            const color = h.normPace < 345 ? '#3B6D11' : h.normPace < 365 ? '#E8530A' : '#E24B4A';
            // Afficher l'allure réelle, FC, et normalisée en petit
            return `<span style="color:${color};font-weight:600;">${_ppWk(h)} ${h.rawPaceStr}/km FC${h.fc}${arrow}</span>`;
          }).join('<span style="color:var(--muted);"> · </span>');
          const first = d.efHistory[0].normPace, last = d.efHistory[d.efHistory.length-1].normPace;
          const trend = last < first-3 ? ' 📉 En progression' : last > first+3 ? ' 📈 En recul' : ' → Stable';
          efTrendHtml = `<div style="margin-top:6px;display:flex;flex-direction:column;gap:4px;">
            ${d.efHistory.map((h,i) => {
              const prev = i>0 ? d.efHistory[i-1].normPace : null;
              const arrow = prev===null ? '' : h.normPace < prev-3 ? '↓' : h.normPace > prev+3 ? '↑' : '→';
              const arrowColor = arrow==='↓' ? '#3B6D11' : arrow==='↑' ? '#E24B4A' : '#888';
              const color = h.normPace < 345 ? '#3B6D11' : h.normPace < 365 ? '#E8530A' : '#E24B4A';
              return `<div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg);border:1px solid var(--border);border-radius:7px;padding:5px 10px;">
                <span style="font-size:11px;font-weight:600;color:var(--muted);">${_ppWk(h)}</span>
                <span style="font-size:13px;font-weight:700;color:${color};">${h.rawPaceStr}/km</span>
                <span style="font-size:11px;color:var(--muted);">FC ${h.fc}</span>
                ${arrow ? `<span style="font-size:13px;font-weight:700;color:${arrowColor};">${arrow}</span>` : '<span style="width:13px;"></span>'}
              </div>`;
            }).join('')}
            <div style="text-align:right;font-size:10px;color:var(--muted);font-style:italic;margin-top:1px;">${last < first-3 ? '📉 En progression' : last > first+3 ? '📈 En recul' : '→ Stable'}</div>
          </div>`;
        }
        // --- EF : textes dynamiques ---
        const efLast = d.efHistory && d.efHistory.length > 0 ? d.efHistory[d.efHistory.length-1] : null;
        const efFirst = d.efHistory && d.efHistory.length > 0 ? d.efHistory[0] : null;
        const efProgressing = efFirst && efLast && efLast.normPace < efFirst.normPace - 5;
        const efRegressing  = efFirst && efLast && efLast.normPace > efFirst.normPace + 5;
        const efStable      = !efProgressing && !efRegressing;
        const efNormSec     = efLast ? efLast.normPace : null;
        const efPaceGood    = efNormSec && efNormSec < 350; // < 5'50
        const efPaceGreat   = efNormSec && efNormSec < 340; // < 5'40

        const efDetail = (() => {
          if(efPaceGreat && efProgressing) return `Allure EF normalisée en nette progression — ton aérobie s'améliore séance après séance`;
          if(efPaceGreat && efStable)      return `Allure EF normalisée solide et stable — base aérobie bien installée`;
          if(efPaceGood  && efProgressing) return `Bonne dynamique EF — allure normalisée en baisse, signal marathon en amélioration`;
          if(efPaceGood  && efRegressing)  return `Légère dégradation de l'allure EF normalisée — surveille la fatigue accumulée`;
          if(efRegressing)                 return `Allure EF normalisée en recul — probable fatigue ou surcharge ; récupération conseillée`;
          if(efStable)                     return `Allure EF normalisée stable sur les 3 dernières séances — phase de consolidation`;
          return `Allure normalisée FC 143 × ratio empirique EF→Marathon`;
        })();

        const efExplication = (() => {
          const ratio = Math.round((1 - 0.961) * 100);
          if(efPaceGreat && efProgressing)
            return `Tes EF progressent clairement : chaque sortie normalise une allure plus rapide à FC identique. C'est le signe que ton cœur travaille plus efficacement. Continue à rester strictement sous FC ${hrEfMax()} — la progression se construit là, pas dans la vitesse.`;
          if(efPaceGreat && efStable)
            return `Ta base aérobie est solide. Les 3 dernières EF montrent une allure normalisée cohérente — le moteur tourne bien. La prochaine progression viendra des longues sorties et des blocs tempo accumulés.`;
          if(efPaceGood && efProgressing)
            return `L'allure EF se normalise à la baisse : à fréquence cardiaque équivalente, tu cours plus vite. C'est exactement ce que le plan cherche à construire. Garde le cap sur les FC cibles (${hrEfMax()-8}-${hrEfMax()} bpm).`;
          if(efRegressing)
            return `L'allure EF normalisée remonte, ce qui peut indiquer une fatigue cardiaque ou un manque de récupération. Vérifie ta FC repos du matin — si elle dépasse 55 bpm, prends une journée de plus. Ce n'est pas une régression durable, juste un signal à ne pas ignorer.`;
          return `L'allure normalisée = ce que tu aurais couru à exactement FC 143. Le ratio ${ratio}% appliqué reflète la marge entre ton EF confortable et ton allure marathon soutenable sur 42km. Il s'affine automatiquement à mesure que ta prépa avance.`;
        })();

        const efLevier = (() => {
          if(!efNormSec) return `Complète tes séances EF sous FC ${hrEfMax()} pour alimenter ce signal`;
          const targetNorm = 330; // ~5'30 normalisée
          if(efNormSec <= targetNorm) return `Signal EF déjà excellent — mise sur les longues pour confirmer`;
          const gainSec = Math.round((efNormSec - targetNorm) * 0.961 * 42.195);
          const gainMin = Math.round(gainSec / 60);
          return `Si allure EF norm → 5'30/km : gain estimé ~${gainMin} min sur le marathon`;
        })();

        rows.push({
          icon:'💚', label:'Séances EF', poids:'3 dernières · Poids 2.5×',
          detail: efDetail,
          explication: efExplication,
          prediction: fmtT(d.amFromEf), ecart: ecart(d.amFromEf),
          trendHtml: efTrendHtml,
          levier: efLevier
        });
      }

      if(d.amFromLong) {
        const maxKm = d.longMaxKm || 0;
        const dynWeightPct = Math.round(Math.min(100, Math.max(7, (maxKm-10)/5*100/3)));
        // Barre de progression : 10km = 0%, 25km = 100%
        const barPct = Math.round(Math.min(100, Math.max(0, (maxKm-10)/15*100)));
        // Jalons sur la barre
        const milestones = [
          {km:10, label:'10km', pct:0},
          {km:15, label:'15km', pct:33},
          {km:20, label:'20km', pct:67},
          {km:25, label:'25km', pct:100},
        ];
        const weightBarHtml = `<div style="margin-top:8px;margin-bottom:4px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <span style="font-size:10px;font-weight:600;color:var(--muted);">Pondération du signal longues</span>
            <span style="font-size:12px;font-weight:800;color:${dynWeightPct<30?'#E24B4A':dynWeightPct<70?'#E8530A':'#3B6D11'};">${dynWeightPct}%</span>
          </div>
          <div style="position:relative;padding-top:16px;margin-bottom:20px;">
            <div style="position:absolute;top:0;left:${barPct}%;transform:translateX(-50%);font-size:9px;font-weight:700;color:${barPct<33?'#E24B4A':barPct<67?'#E8530A':'#3B6D11'};white-space:nowrap;">▼ ${maxKm}km</div>
            <div style="position:relative;height:10px;background:var(--border);border-radius:5px;overflow:hidden;">
              <div style="height:100%;width:${barPct}%;background:${barPct<33?'#E24B4A':barPct<67?'#E8530A':'#3B6D11'};border-radius:5px;"></div>
            </div>
            <div style="position:relative;height:16px;margin-top:2px;">
              ${milestones.map(m => `<div style="position:absolute;left:${m.pct}%;transform:translateX(-50%);font-size:8px;color:${maxKm>=m.km?'#3B6D11':'var(--muted)'};font-weight:${maxKm>=m.km?'700':'400'};white-space:nowrap;">${m.label}</div>`).join('')}
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--muted);">
            <span>Poids minimal</span>
            <span style="color:#3B6D11;font-weight:600;">Poids plein à 25km</span>
          </div>
        </div>`;
        let longTrendHtml = '';
        if(d.longHistory && d.longHistory.length > 0) {
          const fmtPS = s => `${Math.floor(s/60)}'${String(Math.round(s%60)).padStart(2,'0')}`;
          const items = d.longHistory.map((h,i) => {
            const prev = i>0 ? d.longHistory[i-1].riegelAm : null;
            const arrow = prev===null ? '' : h.riegelAm < prev-120 ? ' ↓' : h.riegelAm > prev+120 ? ' ↑' : ' →';
            const fmtH = s => `${Math.floor(s/3600)}h${String(Math.floor((s%3600)/60)).padStart(2,'0')}`;
            const color = h.riegelAm < 14400 ? '#3B6D11' : h.riegelAm < 15000 ? '#E8530A' : '#888';
            return `<span style="color:${color};font-weight:600;">${_ppWk(h)} ${h.paceStr||fmtPS(h.pace)} ${h.km}km→${fmtH(h.riegelAm)}${arrow}</span>`;
          }).join('<span style="color:var(--muted);"> · </span>');
          const first = d.longHistory[0].riegelAm, last = d.longHistory[d.longHistory.length-1].riegelAm;
          const trend = last < first-120 ? ' 📉 En progression' : last > first+120 ? ' 📈 En recul' : ' → Stable';
          longTrendHtml = `<div style="margin-top:6px;display:flex;flex-direction:column;gap:4px;">
            ${d.longHistory.map((h,i) => {
              const prev = i>0 ? d.longHistory[i-1].riegelAm : null;
              const arrow = prev===null ? '' : h.riegelAm < prev-120 ? '↓' : h.riegelAm > prev+120 ? '↑' : '→';
              const arrowColor = arrow==='↓' ? '#3B6D11' : arrow==='↑' ? '#E24B4A' : '#888';
              const fmtH = s => `${Math.floor(s/3600)}h${String(Math.floor((s%3600)/60)).padStart(2,'0')}`;
              const color = h.riegelAm < 14400 ? '#3B6D11' : h.riegelAm < 15000 ? '#E8530A' : '#888';
              return `<div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg);border:1px solid var(--border);border-radius:7px;padding:5px 10px;">
                <span style="font-size:11px;font-weight:600;color:var(--muted);">${_ppWk(h)}</span>
                <span style="font-size:13px;font-weight:700;color:var(--text);">${h.paceStr}/km · ${h.km}km</span>
                <span style="font-size:12px;font-weight:700;color:${color};">${fmtH(h.riegelAm)}</span>
                ${arrow ? `<span style="font-size:13px;font-weight:700;color:${arrowColor};">${arrow}</span>` : '<span style="width:13px;"></span>'}
              </div>`;
            }).join('')}
            <div style="text-align:right;font-size:10px;color:var(--muted);font-style:italic;margin-top:1px;">${last < first-120 ? '📉 En progression' : last > first+120 ? '📈 En recul' : '→ Stable'}</div>
          </div>`;
        }
        // --- LONGUES : textes dynamiques ---
        const longLast  = d.longHistory && d.longHistory.length > 0 ? d.longHistory[d.longHistory.length-1] : null;
        const longFirst = d.longHistory && d.longHistory.length > 0 ? d.longHistory[0] : null;
        const longProgressing = longFirst && longLast && longLast.riegelAm < longFirst.riegelAm - 120;
        const longRegressing  = longFirst && longLast && longLast.riegelAm > longFirst.riegelAm + 120;
        const longNearSub4    = longLast && longLast.riegelAm < 15000 && longLast.riegelAm >= 14400;
        const longAboveSub4   = longLast && longLast.riegelAm >= 15000;

        const longDetail = (() => {
          if(maxKm < 14)       return `Longues encore courtes (${maxKm}km) — signal en construction, poids faible (${dynWeightPct}%)`;
          if(maxKm < 18)       return `Longues en montée de charge (${maxKm}km) — signal qui commence à peser dans la fusion`;
          if(longProgressing)  return `Riegel en amélioration séance après séance — tes longues projettent un meilleur marathon`;
          if(longRegressing)   return `Projection Riegel en légère hausse — surveille l'allure et la FC sur les prochaines longues`;
          if(longNearSub4)     return `Projection Riegel très proche du Sub-4h — encore quelques longues à consolider`;
          return `Formule Riegel · ${maxKm}km max · poids dynamique ${dynWeightPct}%`;
        })();

        const longExplication = (() => {
          if(maxKm < 14)
            return `Tes longues sont encore courtes pour que Riegel soit fiable — en dessous de 18km, l'extrapolation sur 42km a trop d'incertitude. C'est normal à S${CW}. Chaque longue au-delà de 15km double le poids de ce signal dans le calcul final.`;
          if(maxKm < 18)
            return `Le signal commence à prendre de la valeur. À ${maxKm}km, Riegel extrapole avec une marge raisonnable. Dès que tu dépasses 20km en longue, ce signal devient le prédicteur le plus fiable de ta performance marathon réelle.`;
          if(longProgressing)
            return `Tes longues progressent — la projection Riegel baisse séance après séance. C'est le signe le plus solide d'une vraie progression marathon : tu tiens une meilleure allure plus longtemps, à FC contrôlée.`;
          if(longNearSub4)
            return `La projection Riegel est aux portes du Sub-4h. Il reste à confirmer sur une longue de 22-24km avec une allure maîtrisée et une FC stable. Ce serait le signal le plus convaincant pour valider l'objectif.`;
          return `La formule Riegel (t₂ = t₁ × (d₂/d₁)^1.06) extrapole ton temps marathon depuis tes sorties longues. Corrigée par ta FC réelle vs FC référence (145 bpm), elle donne une estimation ancrée dans ta performance terrain — plus fiable que la théorie pure.`;
        })();

        const longLevier = (() => {
          if(maxKm < 18) return `Chaque longue > 18km fait monter ce signal de 15 à 40% de poids — priorité absolue`;
          if(maxKm < 22) return `Prochaine longue > 20km : poids du signal × 2, précision +30%`;
          if(longProgressing) return `Continue : chaque longue confirme et affine le Sub-4h`;
          return `Intégrer 3-5 km à allure AM entraînement (${getAmTrainingPace()}/km) en fin de longue → gain direct sur Riegel`;
        })();

        rows.push({
          icon:'🟣', label:'Séances longues',
          poids:`3 dernières · Poids dynamique (${dynWeightPct}%)`,
          detail: longDetail,
          explication: longExplication,
          prediction: fmtT(d.amFromLong), ecart: ecart(d.amFromLong),
          trendHtml: weightBarHtml + longTrendHtml,
          levier: longLevier
        });
      }

      if(d.amFromTempo) {
        let tempoTrendHtml = '';
        if(d.tempoHistory && d.tempoHistory.length > 0) {
          const fmtPS = s => `${Math.floor(s/60)}'${String(Math.round(s%60)).padStart(2,'0')}`;
          const items = d.tempoHistory.map((h,i) => {
            const prev = i>0 ? d.tempoHistory[i-1].avgPace : null;
            const arrow = prev===null ? '' : h.avgPace < prev-3 ? ' ↓' : h.avgPace > prev+3 ? ' ↑' : ' →';
            const color = h.avgPace < 295 ? '#3B6D11' : h.avgPace < 315 ? '#E8530A' : '#E24B4A';
            return `<span style="color:${color};font-weight:600;">${_ppWk(h)} ${h.avgPaceStr||fmtPS(h.avgPace)}/km${arrow}</span>`;
          }).join('<span style="color:var(--muted);"> · </span>');
          const first = d.tempoHistory[0].avgPace, last = d.tempoHistory[d.tempoHistory.length-1].avgPace;
          const trend = last < first-3 ? ' 📉 En progression' : last > first+3 ? ' 📈 En recul' : ' → Stable';
          tempoTrendHtml = `<div style="margin-top:6px;display:flex;flex-direction:column;gap:4px;">
            ${d.tempoHistory.map((h,i) => {
              const prev = i>0 ? d.tempoHistory[i-1].avgPace : null;
              const arrow = prev===null ? '' : h.avgPace < prev-3 ? '↓' : h.avgPace > prev+3 ? '↑' : '→';
              const arrowColor = arrow==='↓' ? '#3B6D11' : arrow==='↑' ? '#E24B4A' : '#888';
              const color = h.avgPace < 295 ? '#3B6D11' : h.avgPace < 315 ? '#E8530A' : '#E24B4A';
              return `<div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg);border:1px solid var(--border);border-radius:7px;padding:5px 10px;">
                <span style="font-size:11px;font-weight:600;color:var(--muted);">${_ppWk(h)}</span>
                <span style="font-size:13px;font-weight:700;color:${color};">${h.avgPaceStr}/km</span>
                <span style="font-size:11px;color:var(--muted);">${h.blocs} bloc${h.blocs>1?'s':''}</span>
                ${arrow ? `<span style="font-size:13px;font-weight:700;color:${arrowColor};">${arrow}</span>` : '<span style="width:13px;"></span>'}
              </div>`;
            }).join('')}
            <div style="text-align:right;font-size:10px;color:var(--muted);font-style:italic;margin-top:1px;">${last < first-3 ? '📉 En progression' : last > first+3 ? '📈 En recul' : '→ Stable'}</div>
          </div>`;
        }
        // --- TEMPO : textes dynamiques ---
        const tempoLast  = d.tempoHistory && d.tempoHistory.length > 0 ? d.tempoHistory[d.tempoHistory.length-1] : null;
        const tempoFirst = d.tempoHistory && d.tempoHistory.length > 0 ? d.tempoHistory[0] : null;
        const tempoProg  = tempoFirst && tempoLast && tempoLast.avgPace < tempoFirst.avgPace - 4;
        const tempoReg   = tempoFirst && tempoLast && tempoLast.avgPace > tempoFirst.avgPace + 4;
        const tempoSub4  = tempoLast && tempoLast.amPred < 14400;
        const tempoAvgSec = tempoLast ? tempoLast.avgPace : null;
        const tempoStrong = tempoAvgSec && tempoAvgSec < 295; // < 4'55

        const tempoDetail = (() => {
          if(tempoStrong && tempoProg)  return `Blocs tempo puissants et en progression — vitesse anaérobie en hausse`;
          if(tempoStrong && !tempoReg)  return `Blocs tempo solides — vitesse seuil bien au-dessus de l'allure marathon cible`;
          if(tempoProg)                 return `Progression nette sur les blocs tempo — tu gagnes en vitesse à chaque séance`;
          if(tempoReg)                  return `Blocs tempo légèrement ralentis — fatigue possible, ou adaptation en cours`;
          return `Allure moy. par séance × 1.17 · 3 dernières séances · pondération croissante`;
        })();

        const tempoExplication = (() => {
          const nb = d.nbTempo || 0;
          if(nb < 3)
            return `Signal en construction — moins de 3 séances tempo validées. Plus tu accumules de blocs, plus ce signal devient fiable. Il prendra tout son sens à partir de S15+ quand les blocs s'allongent.`;
          if(tempoStrong && tempoProg)
            return `Tes blocs tempo s'accélèrent séance après séance : c'est le signe que ton seuil anaérobie monte. Plus ton seuil est haut par rapport à ton allure marathon cible, plus tu as de la marge le jour J. Le facteur ×1.17 traduit l'écart réaliste entre un bloc de 15 min et 42km de soutien.`;
          if(tempoStrong)
            return `Tes blocs sont bien au-dessus de l'allure marathon cible — tu as une vraie réserve de vitesse. Le ×1.17 appliqué est conservateur : tenir le rythme tempo sur 42km est une toute autre histoire. Ce signal confirme ton potentiel, les longues devront le valider.`;
          if(tempoProg)
            return `La vitesse tempo progresse clairement — chaque séance repousse ton seuil. C'est important : un seuil élevé te permet de courir à allure marathon avec moins d'effort relatif, et donc de mieux tenir en fin de course.`;
          if(tempoReg)
            return `Les blocs tempo ont légèrement ralenti. C'est souvent le signe d'une fatigue en accumulation plutôt qu'une vraie régression. Si la FC est montée mais pas l'allure, surveille ta récupération. Si ça persiste, c'est un signal à prendre au sérieux.`;
          return `La moyenne des blocs par séance est pondérée : la plus récente compte 3×, l'avant-dernière 2×, l'ancienne 1×. Le facteur ×1.17 traduit l'écart réaliste entre tenir une allure 15 min en bloc et la maintenir 42km — un gap qui se réduit avec les longues spécifiques.`;
        })();

        const tempoLevier = (() => {
          if(!tempoAvgSec) return `Valide tes séances tempo avec les blocs renseignés pour alimenter ce signal`;
          const amFromTempoSec = tempoAvgSec * 1.17;
          const amSec = paceStrToSec(getMarathonPaceStr().replace("'",":"));
          if(amSec && amFromTempoSec > amSec + 120) return `Signal tempo encore au-dessus de l'objectif — les longues feront la différence`;
          if(amSec && amFromTempoSec < amSec - 60)  return `Signal tempo très favorable — confirme l'objectif Sub-4h si les longues suivent`;
          return `Allonger les blocs (2×15 min → 2×20 min) à partir de S16 pour renforcer ce signal`;
        })();

        rows.push({
          icon:'🟠', label:'Blocs tempo', poids:'3 dernières séances · Poids 3.0×',
          detail: tempoDetail,
          explication: tempoExplication,
          prediction: fmtT(d.amFromTempo), ecart: ecart(d.amFromTempo),
          trendHtml: tempoTrendHtml,
          levier: tempoLevier
        });
      }

      if(d.cardiacDrift !== null && d.cardiacDrift !== undefined) {
        const drift = d.cardiacDrift;
        const driftLabel = drift < 3 ? '✅ Parfait' : drift < 5 ? '✅ Excellent' : drift < 8 ? '👍 Bon' : drift < 12 ? '⚠️ Moyen' : '❌ Élevé';
        const driftImpact = d.driftPenaltySec < 0
          ? `<span style="color:#3B6D11;font-weight:700;">Bonus −${Math.abs(Math.round(d.driftPenaltySec/60))} min</span>`
          : d.driftPenaltySec > 0
          ? `<span style="color:#E24B4A;font-weight:700;">Pénalité +${Math.round(d.driftPenaltySec/60)} min</span>`
          : '<span style="color:var(--muted);">Neutre (5-8%)</span>';

        let trendHtml = '';
        if(d.driftHistory && d.driftHistory.length > 0) {
          const first = d.driftHistory[0].drift, last = d.driftHistory[d.driftHistory.length-1].drift;
          const globalTrend = last < first-1 ? '📉 En amélioration' : last > first+1 ? '📈 En hausse' : '→ Stable';
          trendHtml = `<div style="margin-top:6px;display:flex;flex-direction:column;gap:4px;">
            ${d.driftHistory.map((h,i) => {
              const prev = i>0 ? d.driftHistory[i-1].drift : null;
              const arrow = prev===null ? '' : h.drift < prev-0.5 ? '↓' : h.drift > prev+0.5 ? '↑' : '→';
              const arrowColor = arrow==='↓' ? '#3B6D11' : arrow==='↑' ? '#E24B4A' : '#888';
              const color = h.drift < 5 ? '#3B6D11' : h.drift < 8 ? '#3B6D11' : h.drift < 12 ? '#E8530A' : '#E24B4A';
              const lbl = h.drift < 3 ? 'Parfait' : h.drift < 5 ? 'Excellent' : h.drift < 8 ? 'Bon' : h.drift < 12 ? 'Moyen' : 'Élevé';
              return `<div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg);border:1px solid var(--border);border-radius:7px;padding:5px 10px;">
                <span style="font-size:11px;font-weight:600;color:var(--muted);">${_ppWk(h)} · ${h.km}km</span>
                <span style="font-size:11px;color:var(--muted);">FC ${h.fcStart}→${h.fcEnd} bpm</span>
                <span style="font-size:12px;font-weight:700;color:${color};">+${h.drift}% · ${lbl}</span>
                ${arrow ? `<span style="font-size:13px;font-weight:700;color:${arrowColor};">${arrow}</span>` : '<span style="width:13px;"></span>'}
              </div>`;
            }).join('')}
            <div style="text-align:right;font-size:10px;color:var(--muted);font-style:italic;margin-top:1px;">${globalTrend}</div>
          </div>`;
        }

        // --- DÉRIVE CARDIAQUE : textes dynamiques ---
        const driftImprovingTrend = d.driftHistory && d.driftHistory.length >= 2 &&
          d.driftHistory[d.driftHistory.length-1].drift < d.driftHistory[0].drift - 1;
        const driftWorseningTrend = d.driftHistory && d.driftHistory.length >= 2 &&
          d.driftHistory[d.driftHistory.length-1].drift > d.driftHistory[0].drift + 1;

        const driftDetailDyn = (() => {
          if(drift < 3 && driftImprovingTrend) return `Dérive quasi nulle et en amélioration — endurance fondamentale exceptionnelle`;
          if(drift < 3)   return `Dérive cardiaque minimale — cœur ultra-stable sur toute la durée de l'effort`;
          if(drift < 5 && driftImprovingTrend) return `Excellente dérive, encore en amélioration — moteur aérobie qui monte en puissance`;
          if(drift < 5)   return `Dérive cardiaque excellente — la FC tient bien sur la durée de la longue`;
          if(drift < 8 && driftImprovingTrend) return `Bonne dérive et tendance à l'amélioration — endurance en progression`;
          if(drift < 8)   return `Dérive cardiaque correcte — stable, neutre sur la prédiction (5-8%)`;
          if(drift < 12 && driftWorseningTrend) return `Dérive en hausse — signe possible de fatigue accumulée ou manque d'hydratation`;
          if(drift < 12)  return `Dérive modérée — pénalité appliquée, à travailler sur les prochaines longues`;
          return `Dérive cardiaque élevée — l'endurance aérobie ne tient pas encore sur la durée`;
        })();

        const driftExplicationDyn = (() => {
          const lastLong = d.driftHistory && d.driftHistory.length > 0 ? d.driftHistory[d.driftHistory.length-1] : null;
          const lastKm = lastLong ? lastLong.km : null;
          if(drift < 3)
            return `Une dérive de ${drift}% du milieu à la fin de ta longue, c'est remarquable — ton cœur maintient une charge quasi constante. C'est la preuve d'une endurance fondamentale très bien construite. Ce niveau justifie un bonus de ${Math.abs(Math.round(d.driftPenaltySec/60))} min sur ta prédiction.`;
          if(drift < 5)
            return `Dérive de ${drift}% : ton cœur accélère légèrement en fin de longue, mais reste dans la zone optimale. C'est le signe d'une bonne endurance aérobie. Cela se consolidera encore avec les longues au-delà de 22km — les efforts prolongés bâtissent l'efficacité cardiaque.`;
          if(drift < 8)
            return `${drift}% de dérive : la FC monte légèrement en seconde moitié, mais c'est dans la norme acceptable pour des longues de ${lastKm||10}km. À ce niveau, la dérive n'entraîne ni bonus ni pénalité. Au-delà de 20km de longue, l'effort aérobie prolongé devrait naturellement réduire cette dérive.`;
          if(drift < 12)
            return `Une dérive de ${drift}% indique que le cœur doit travailler de plus en plus fort pour maintenir la même allure — signe de fatigue progressive ou d'un rythme un peu trop élevé. Pénalité de +${Math.round(d.driftPenaltySec/60)} min appliquée. Conseil : ralentir les 2 premiers km de longue, et rester sous FC 145 tout au long.`;
          return `${drift}% de dérive, c'est élevé : la FC monte nettement en fin de sortie, ce qui suggère soit un début trop rapide, soit un déficit d'endurance fondamentale. Travailler les EF longues strictement sous FC 145 pendant 4-6 semaines devrait réduire ce chiffre significativement.`;
        })();

        const driftLevier = (() => {
          if(drift < 5) return `Très bon niveau — les prochaines longues > 20km vont encore améliorer cette dérive`;
          if(drift < 8) return `Zone neutre : vise < 5% en gardant FC < 145 sur toute la longue (y compris les 2 premiers km)`;
          if(d.driftHistory && d.driftHistory.length >= 2 && driftImprovingTrend)
            return `Bonne trajectoire — continue à démarrer les longues lentement, la dérive baisse naturellement`;
          return `Démarre tes longues 10-15 sec/km plus lentement que d'habitude et bois à chaque point d'eau`;
        })();

        rows.push({
          icon:'💓', label:'Dérive cardiaque', poids:`3 dernières longues`,
          detail: driftDetailDyn,
          explication: driftExplicationDyn,
          prediction: `+${drift}% · ${driftLabel}`,
          ecart: driftImpact,
          trendHtml,
          levier: driftLevier
        });
      }

      // --- VO2MAX : textes dynamiques ---
      const vo2 = pred.vo2max || 52;
      const vo2Gap = d.vdotPurSec && pred.tempsSec ? Math.round((pred.tempsSec - d.vdotPurSec) / 60) : null;
      const vo2DetailDyn = (() => {
        if(vo2 >= 58) return `VO2max ${vo2} ml/kg/min — très bon potentiel physiologique, marge de progression limitée`;
        if(vo2 >= 55) return `VO2max ${vo2} ml/kg/min — bon potentiel physiologique, encore de la marge`;
        if(vo2 >= 52) return `VO2max ${vo2} ml/kg/min — potentiel dans la moyenne, largement suffisant pour Sub-4h`;
        return `VO2max ${vo2} ml/kg/min — potentiel en construction, progressera avec le volume`;
      })();

      const vo2ExplicationDyn = (() => {
        const gapLabel = vo2Gap !== null ? `${vo2Gap} min` : '?';
        if(vo2Gap !== null && vo2Gap > 20)
          return `Ton potentiel théorique (${d.vdotPurLabel}) est bien au-dessus de ta prédiction réelle (${pred.tempsStr}). Cet écart de ${gapLabel} représente ta marge de progression — il se comble avec l'endurance spécifique marathon, les longues sorties et la gestion des efforts. Tu ne cours pas encore à ton plein potentiel, et c'est normal à S${CW}.`;
        if(vo2Gap !== null && vo2Gap <= 10)
          return `Ton potentiel théorique (${d.vdotPurLabel}) est très proche de ta prédiction réelle. Tu exploites déjà une grande partie de ton potentiel VO2max — signe d'une bonne efficacité. Pour aller plus loin, les gains viendront de l'économie de course, des longues spécifiques et de la gestion d'allure.`;
        return `La VO2max est ton plafond physiologique. Ta Garmin la recalcule après chaque sortie intense. Plus elle monte, plus le plafond s'élève. L'écart entre ce plafond (${d.vdotPurLabel||'—'}) et ta prédiction réelle (${pred.tempsStr}) représente la marge que l'entraînement vient combler progressivement.`;
      })();

      const vo2LevierDyn = (() => {
        const v55 = fmtTime(Math.round(vdotMarathonPaceSec(55)*42.195));
        const v58 = fmtTime(Math.round(vdotMarathonPaceSec(58)*42.195));
        if(vo2 < 52) return `VO2max 55 → ${v55} de potentiel · séances tempo et allures variées pour la faire monter`;
        if(vo2 < 55) return `VO2max 55 → ${v55} · VO2max 58 → ${v58} · les blocs tempo y contribuent directement`;
        return `À VO2max ${vo2} : potentiel déjà fort — focus sur l'endurance spécifique plutôt que sur le VO2max pur`;
      })();

      rows.push({
        icon:'🔬', label:'Potentiel VO2max', poids:'Base théorique',
        detail: vo2DetailDyn,
        explication: vo2ExplicationDyn,
        prediction: d.vdotPurLabel||'—', ecart: ecart(d.vdotPurSec),
        levier: vo2LevierDyn
      });

      // --- CADENCE : textes dynamiques ---
      if(d.avgCadence) {
        const cad = d.avgCadence;
        const cadGap = 180 - cad;
        const cadPenaltySec = Math.round(Math.max(0, cadGap / 8));
        const cadPenaltyMin = Math.round(cadPenaltySec * 42.195 / 60);

        const cadDetail = (() => {
          if(cad >= 180) return `Cadence optimale (${cad} spm) — aucune pénalité appliquée, foulée efficace`;
          if(cad >= 175) return `Cadence légèrement sous l'optimal (${cad} spm) — pénalité minime de ${cadPenaltySec} sec/km`;
          if(cad >= 168) return `Cadence à améliorer (${cad} spm) — pénalité de ${cadPenaltySec} sec/km dans la fusion`;
          return `Cadence basse (${cad} spm) — foulée longue, pénalité de ${cadPenaltySec} sec/km appliquée`;
        })();

        const cadExplication = (() => {
          if(cad >= 180)
            return `Ta cadence est dans la zone optimale — entre 178 et 185 spm, tu minimises l'impact au sol et l'énergie gaspillée à chaque foulée. Pas de pénalité dans le calcul. Maintiens ce niveau, en particulier lors des sorties longues où la cadence tend à baisser avec la fatigue.`;
          if(cad >= 175)
            return `Tu es à ${cadGap} spm de la zone optimale (178-182 spm). À ce niveau, l'impact est faible. Pénalité de seulement ${cadPenaltySec} sec/km dans la fusion, soit ~${cadPenaltyMin} min sur le marathon. Un léger travail de conscience de foulée en EF suffirait à l'effacer.`;
          if(cad >= 168)
            return `${cad} spm : ta foulée est un peu trop longue. Chaque foulée plus longue = plus d'impact, plus de travail musculaire excentrique, plus de fatigue en fin de course. La pénalité de ${cadPenaltySec} sec/km représente ~${cadPenaltyMin} min sur le marathon. Exercice concret : compte tes foulées droites pendant 30 sec en EF — tu dois en avoir 45-47.`;
          return `${cad} spm, c'est nettement en-dessous de l'optimal. La foulée longue génère un impact au sol fort, consume plus d'énergie et augmente le risque de blessure sur les longues distances. La pénalité de ${cadPenaltySec} sec/km (${cadPenaltyMin} min sur le marathon) est significative — c'est le levier le plus actionnable de ta prédiction.`;
        })();

        const cadLevier = (() => {
          if(cad >= 180) return `Rien à changer — cadence parfaite, reste attentif en fin de longues quand la fatigue s'installe`;
          if(cad >= 175) return `+${cadGap} spm suffit : pense "petites foulées rapides" pendant 2 min en milieu d'EF`;
          const gainFull = Math.round((Math.min(cad, 178) < 178 ? (180 - cad) / 8 : 0) * 42.195 / 60);
          return `Atteindre 178 spm → économiser ~${gainFull} min · écoute un metronome à 178 bpm pendant les EF`;
        })();

        rows.push({
          icon:'👟', label:'Cadence de foulée', poids:'Correction appliquée',
          detail: cadDetail,
          explication: cadExplication,
          prediction: cad >= 178 ? '✅ Optimal' : `Pénalité −${cadPenaltySec} sec/km`,
          ecart: cad >= 178 ? '<span style="color:#3B6D11;">Aucune pénalité</span>' : '<span style="color:#E8530A;">Pénalité réduite</span>',
          levier: cadLevier
        });
      }

      let html = `<div style="background:var(--bg2);border-radius:12px;padding:12px 14px;margin-bottom:12px;">
        <p style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">🔍 Décomposition du calcul</p>
        <div style="font-size:10px;color:var(--muted);margin-bottom:10px;padding:6px 10px;background:var(--bg);border-radius:8px;line-height:1.5;">
          ${(()=>{
            const allPreds = [d.amFromEf, d.amFromTempo, d.amFromLong].filter(Boolean);
            if(allPreds.length < 2) return `Signal unique — la prédiction sera plus précise quand EF + Tempo + Longues seront tous alimentés.`;
            const spreadSec = Math.round((Math.max(...allPreds) - Math.min(...allPreds)) / 60);
            const sub4All = allPreds.every(s => s < 14400);
            const sub4None = allPreds.every(s => s >= 14400);
            if(spreadSec < 8 && sub4All)    return `Les 3 signaux convergent vers le Sub-4h ✅ — modèle très cohérent, haute confiance.`;
            if(spreadSec < 8)               return `Les 3 signaux convergent en moins de ${spreadSec} min d'écart — modèle très cohérent.`;
            if(spreadSec < 20 && sub4All)   return `Signaux bien alignés (écart max ${spreadSec} min), tous orientés Sub-4h. Résultat fusionné = <strong>moyenne pondérée</strong>.`;
            if(spreadSec < 20)              return `Bonne convergence des signaux (écart ${spreadSec} min). Résultat fusionné = <strong>moyenne pondérée</strong> des 3 sources.`;
            if(sub4All)                     return `Signaux dispersés (${spreadSec} min d'écart) mais tous en zone Sub-4h — l'objectif est accessible. Les longues réduiront cet écart.`;
            return `Écart de ${spreadSec} min entre les signaux — prédiction en cours d'affinage. Les prochaines longues sorties seront déterminantes pour réduire l'incertitude.`;
          })()}
        </div>`;

      rows.forEach(r => {
        html += `<div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px;background:var(--bg);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:5px;">
            <div>
              <span style="font-size:13px;font-weight:700;color:var(--text);">${r.icon} ${r.label}</span>
              <span style="font-size:9px;color:var(--muted);margin-left:5px;background:var(--bg2);padding:1px 5px;border-radius:6px;">${r.poids}</span>
            </div>
            <div style="text-align:right;flex-shrink:0;margin-left:8px;">
              <div style="font-size:15px;font-weight:800;color:#1B4FD8;">${r.prediction}</div>
              <div style="font-size:10px;margin-top:1px;">${r.ecart}</div>
            </div>
          </div>
          <p style="font-size:10px;color:var(--muted);margin-bottom:5px;">${r.detail}</p>
          <p style="font-size:10px;color:var(--text);margin-bottom:5px;line-height:1.4;font-style:italic;">${r.explication}</p>
          ${r.trendHtml||''}
          <div style="background:#F0F4FF;border-radius:6px;padding:4px 8px;font-size:10px;color:#1B4FD8;margin-top:4px;">💡 ${r.levier}</div>
        </div>`;
      });

      html += `<div style="border:2px solid #1B4FD8;border-radius:10px;padding:10px 12px;background:#EEF2FD;">
        ${pred.tempsStrR10 ? `
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #1B4FD830;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:11px;color:var(--muted);">📊 Modèle EF / Tempo / Longues</span>
            <span style="font-size:15px;font-weight:700;color:var(--text);">${pred.tempsStrBase}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:11px;color:var(--muted);">🏃 Record 10km × 2.15 − 1 km/h</span>
            <span style="font-size:15px;font-weight:700;color:var(--text);">${pred.tempsStrR10}</span>
          </div>
        </div>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <p style="font-size:12px;font-weight:700;color:#1B4FD8;margin-bottom:2px;">⚡ ${pred.tempsStrR10 ? 'Moyenne des 2 méthodes' : 'Résultat fusionné'}</p>
            <p style="font-size:10px;color:var(--muted);">${(()=>{
              const slopeOk = pred.tendanceSec && pred.tendanceSec < -0.3;
              const cadOk = d.avgCadence && d.avgCadence >= 175;
              const driftOk = d.cardiacDrift !== null && d.cardiacDrift !== undefined && d.cardiacDrift < 8;
              const parts = [];
              parts.push(pred.tempsStrR10 ? 'EF+Tempo+Longues + Record 10km' : 'Pondération EF+Tempo+Longues');
              if(!cadOk && d.avgCadence) parts.push(`pénalité cadence −${Math.round(Math.max(0,(180-d.avgCadence)/8))} sec/km`);
              if(slopeOk) parts.push(`bonus progression`);
              if(driftOk && d.driftPenaltySec < 0) parts.push(`bonus dérive −${Math.abs(Math.round(d.driftPenaltySec/60))} min`);
              return parts.join(' · ');
            })()}</p>
          </div>
          <div style="text-align:right;">
            <div style="font-size:20px;font-weight:800;color:var(--text);">${pred.tempsStr}</div>
            <div style="font-size:11px;font-weight:700;color:${pred.sub4hEcartSec<=0?'#3B6D11':'#E24B4A'};">${pred.sub4hEcartSec<=0?`Sub-4h ✅ (+${Math.abs(Math.round(pred.sub4hEcartSec/60))} min d'avance)`:`+${Math.round(pred.sub4hEcartSec/60)} min du Sub-4h`}</div>
          </div>
        </div>
      </div></div>`;
      return html;
    })()}

    <!-- Méthode -->
    <p style="font-size:10px;color:var(--muted);text-align:center;">${methodeNote}</p>

    </div><!-- /modal-scroll-body -->
  </div>`;

  overlay.onclick = e => { if(e.target === overlay) closeModal(); };
  _lockBodyScroll();
  mc.appendChild(overlay);
}
function previewRecord10kmInPredict(val) {
  const prev = state['record_10km'];
  state['record_10km'] = val;
  const pred = getRecord10kmPredictions();
  state['record_10km'] = prev;
  const el = document.getElementById('r10km-inline-preview');
  if (!el) return;
  if (!pred) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div style="border-radius:10px;overflow:hidden;border:1px solid var(--border);">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;background:var(--bg);">
        <div style="text-align:center;padding:10px 6px;">
          <div style="font-size:10px;color:var(--muted);margin-bottom:3px;">Record 10km</div>
          <div style="font-size:17px;font-weight:800;color:var(--text);">${pred.record10kmStr}</div>
          <div style="font-size:9px;color:var(--muted);margin-top:2px;">${pred.record10kmPaceStr}/km</div>
        </div>
        <div style="text-align:center;padding:10px 6px;border-left:1px solid var(--border);border-right:1px solid var(--border);">
          <div style="font-size:10px;color:var(--muted);margin-bottom:3px;">Semi estimé</div>
          <div style="font-size:17px;font-weight:800;color:#1B4FD8;">${pred.semiStr}</div>
          <div style="font-size:9px;color:var(--muted);margin-top:2px;">${pred.semiPaceStr}/km</div>
        </div>
        <div style="text-align:center;padding:10px 6px;">
          <div style="font-size:10px;color:var(--muted);margin-bottom:3px;">Marathon estimé</div>
          <div style="font-size:17px;font-weight:800;color:#1B4FD8;">${pred.marStr}</div>
          <div style="font-size:9px;color:var(--muted);margin-top:2px;">${pred.marPaceStr}/km</div>
        </div>
      </div>
      <div style="background:var(--bg2);padding:7px 12px;border-top:1px solid var(--border);">
        <div style="font-size:10px;color:var(--muted);">Semi = 10km × 2.15 · Vitesse semi <strong>${pred.semiSpeedKmh} km/h</strong> · Marathon ${pred.semiSpeedKmh} − 1 = <strong>${pred.marSpeedKmh} km/h</strong> → ${pred.marPaceStr}/km</div>
      </div>
    </div>`;
}
function saveRecord10kmInPredict(val) {
  if (!val) return;
  const sec = _parseRecord10km(val);
  if (!sec) { alert('Format invalide. Exemples : 48:30 ou 1:02:15'); return; }
  state['record_10km'] = val.trim();
  save();
  closeModal();
  renderHome();
}
function toggleRecord10kmEditInPredict() {
  // Cherche la zone d'édition en haut (record existant) ou en bas (record absent)
  const el = document.getElementById('r10km-edit-top') || document.getElementById('r10km-edit-inline');
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
  if (el.style.display === 'block') {
    const inp = el.querySelector('input');
    if (inp) { inp.focus(); inp.select(); }
  }
}
function openDistancePredModal(course) {
  const ob = state.onboarding || {};
  const pred = buildDistancePrediction(course);
  const mc = document.getElementById('modal-container');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const distLabel = {'Semi-marathon':'semi-marathon','10 km':'10 km','5 km':'5 km'}[course]||course;
  const distKm    = {'Semi-marathon':21.097,'10 km':10,'5 km':5}[course]||0;

  // Objectif déclaré
  const targetTimeStrD = ob.target_time||state.target_time||null;
  let targetSecD = null;
  if(targetTimeStrD){const tp=targetTimeStrD.split(':').map(Number);targetSecD=((tp[0]||0)*3600+(tp[1]||0)*60+(tp[2]||0));}
  const fmtTimeD = s=>{const hh=Math.floor(s/3600),mm=Math.floor((s%3600)/60),ss=s%60;if(hh>0)return`${hh}h${String(mm).padStart(2,'0')}`;return`${mm}'${String(ss).padStart(2,'0')}`;};
  // Delta prédiction vs objectif
  let vsObjHtml = '';
  if(targetSecD && pred.tempsSec){
    const delta = Math.round((pred.tempsSec - targetSecD) / 60);
    const dAbs = Math.abs(delta);
    const dColor = delta <= 0 ? '#3B6D11' : delta <= 5 ? '#E8530A' : '#E24B4A';
    const dLabel = delta <= 0 ? `${dAbs} min en avance ✅` : `${dAbs} min au-dessus`;
    let tendVsObj = '';
    if(pred.historique && pred.historique.length >= 3){
      const last3 = pred.historique.slice(-3).map(h=>h.tempsSec - targetSecD);
      if(last3[2] < last3[0] - 60) tendVsObj = ' · Tu te rapproches 📉';
      else if(last3[2] > last3[0] + 60) tendVsObj = ' · Tu t\'éloignes 📈';
      else tendVsObj = ' · Stable';
    }
    vsObjHtml = `<div style="font-size:12px;font-weight:700;color:${dColor};margin-top:10px;padding:6px 14px;background:${dColor}15;border-radius:20px;display:inline-block;">🎯 Objectif ${fmtTimeD(targetSecD)} · ${dLabel}${tendVsObj}</div>`;
  }

  const confiancePct   = pred.confiance||0;
  const confianceColor = confiancePct>=70?'#3B6D11':confiancePct>=40?'#E8530A':'#888';

  const tendanceText = pred.details?.slopeLabel && pred.details.slopeLabel!=='—'
    ? pred.details.slopeLabel : '—';

  // Mini graphique SVG historique
  let svgGraph = '';
  if(pred.historique && pred.historique.length >= 2) {
    const W=300,H=90,PAD_L=38,PAD_R=10,PAD_T=8,PAD_B=18;
    const times = pred.historique.map(p=>p.tempsSec);
    const anchors = targetSecD ? [targetSecD] : [];
    const rawMin=Math.min(...times,...anchors)-300, rawMax=Math.max(...times,...anchors)+300;
    const yMin=Math.floor(rawMin/300)*300, yMax=Math.ceil(rawMax/300)*300;
    const yRange=yMax-yMin;
    const toY=v=>PAD_T+((yMax-v)/yRange)*(H-PAD_T-PAD_B);
    const toX=i=>PAD_L+(i/(pred.historique.length-1))*(W-PAD_L-PAD_R);
    const pts=pred.historique.map((p,i)=>({x:toX(i),y:toY(p.tempsSec),ws:p.ws}));
    const polyline=pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    let yLabels='';
    for(let t=yMin;t<=yMax;t+=300){
      const y=toY(t);
      const hh=Math.floor(t/3600),mm=Math.floor((t%3600)/60);
      yLabels+=`<line x1="${PAD_L}" y1="${y.toFixed(1)}" x2="${W-PAD_R}" y2="${y.toFixed(1)}" stroke="#ddd" stroke-width="0.7"/>`;
      yLabels+=`<text x="${PAD_L-3}" y="${(y+3).toFixed(1)}" text-anchor="end" font-size="7.5" fill="#999">${hh>0?hh+'h':''}${String(mm).padStart(2,'0')}</text>`;
    }
    const targetLineDHtml = targetSecD ? (()=>{
      const tY = toY(targetSecD).toFixed(1);
      return `<line x1="${PAD_L}" y1="${tY}" x2="${W-PAD_R}" y2="${tY}" stroke="#E8530A" stroke-width="1.5" stroke-dasharray="5,3"/>
              <text x="${PAD_L+2}" y="${(parseFloat(tY)-3).toFixed(1)}" font-size="7.5" fill="#E8530A" font-weight="700">Objectif</text>`;
    })() : '';
    svgGraph=`<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:90px;overflow:visible;">
      ${yLabels}
      ${targetLineDHtml}
      <polyline points="${polyline}" fill="none" stroke="#1B4FD8" stroke-width="2" stroke-linejoin="round"/>
      <polygon points="${polyline} ${(W-PAD_R).toFixed(1)},${(H-PAD_B).toFixed(1)} ${PAD_L},${(H-PAD_B).toFixed(1)}" fill="rgba(27,79,216,0.08)"/>
      ${pts.map((p,i)=>i===pts.length-1
        ?`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#1B4FD8"/>`
        :`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="white" stroke="#1B4FD8" stroke-width="1.5"/>`
      ).join('')}
    </svg>`;
  }

  overlay.innerHTML=`<div class="modal-box">
    <div style="padding:20px 20px 14px;border-bottom:1px solid var(--border);flex-shrink:0;display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <p style="font-size:17px;font-weight:800;color:var(--text);letter-spacing:-0.3px;">Prédiction ${distLabel}</p>
        <p style="font-size:11px;color:var(--muted);margin-top:3px;">${pred._method==='blocs_directs'?'Calculée depuis tes blocs d\'allure frac/tempo':'Calculée depuis tes séances d\'entraînement · formule de Riegel'}</p>
      </div>
      <button onclick="closeModal()" style="background:none;border:none;font-size:22px;color:var(--muted);cursor:pointer;padding:0;line-height:1;">×</button>
    </div>
    <div style="padding:20px;overflow-y:auto;flex:1;">

      <!-- Temps principal -->
      <div style="text-align:center;margin-bottom:20px;padding:8px 0;">
        ${pred.tempsStr
          ? `<div style="font-size:60px;font-weight:900;letter-spacing:-3px;color:var(--text);line-height:1;">${pred.tempsStr}</div>
             <div style="font-size:13px;color:var(--muted);margin-top:6px;">${pred.paceStr}/km · ${distKm} km</div>
             ${typeof predExplainHtml==='function'?predExplainHtml(pred):''}
             ${vsObjHtml}`
          : `<div style="font-size:24px;font-weight:700;color:var(--muted);margin:20px 0;">Pas encore assez de données</div>
             <p style="font-size:13px;color:var(--muted);">${pred._method==='blocs_directs'?'Valide des séances frac ou tempo avec des blocs d\'allure renseignés pour débloquer la prédiction.':'Valide quelques séances EF ou tempo pour débloquer la prédiction.'}</p>`
        }
      </div>

      <!-- Confiance -->
      <div style="background:var(--bg2);border-radius:12px;padding:12px 14px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-size:12px;font-weight:600;color:var(--muted);">Indice de confiance</span>
          <span style="font-size:14px;font-weight:700;color:${confianceColor};">${confiancePct}%</span>
        </div>
        <div style="background:var(--border);border-radius:4px;height:6px;overflow:hidden;">
          <div style="width:${confiancePct}%;height:100%;background:${confianceColor};border-radius:4px;"></div>
        </div>
        <p style="font-size:10px;color:var(--muted);margin-top:6px;">${pred._method==='blocs_directs'?(
          confiancePct<40?'Démarrage — valide d\'autres séances frac/tempo pour affiner':
          confiancePct<65?'En cours d\'affinage — continue à enregistrer tes allures':
          'Estimation solide · se consolide avec chaque séance validée'
        ):(
          confiancePct<30?'Démarrage — moins de 5 séances analysées':
          confiancePct<50?'Estimation préliminaire — les séances EF et tempo posent la base':
          confiancePct<65?'En cours d\'affinage — les prochaines longues vont consolider':
          'Estimation solide · converge avec chaque séance validée'
        )} · ${pred.nbSeances||0} séance${(pred.nbSeances||0)>1?'s':''} analysée${(pred.nbSeances||0)>1?'s':''}</p>
      </div>

      <!-- Stats -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
        <div style="background:var(--bg2);border-radius:10px;padding:10px 12px;">
          <p style="font-size:10px;color:var(--muted);margin-bottom:4px;">${pred._method==='blocs_directs'?'Allure moyenne blocs':'Tendance allure EF'}</p>
          <p style="font-size:13px;font-weight:700;color:var(--text);">${pred._method==='blocs_directs'?(pred.paceStr?pred.paceStr+'/km':'—'):tendanceText}</p>
        </div>
        <div style="background:var(--bg2);border-radius:10px;padding:10px 12px;">
          <p style="font-size:10px;color:var(--muted);margin-bottom:4px;">Séances analysées</p>
          <p style="font-size:16px;font-weight:800;color:var(--text);margin-bottom:2px;">${pred.nbSeances||0}</p>
          <p style="font-size:10px;color:var(--muted);">${pred._method==='blocs_directs'?`${pred.nbFrac||0} frac · ${pred.nbTempo||0} tempo`:`${pred.details?.nbEf||0} EF · ${pred.details?.nbLong||0} longues · ${pred.details?.nbTempo||0} tempos`}</p>
        </div>
      </div>

      <!-- Graphique historique -->
      ${pred.historique&&pred.historique.length>=2?`
      <div style="background:var(--bg2);border-radius:12px;padding:12px 14px;margin-bottom:12px;">
        <p style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Évolution de la prédiction</p>
        ${svgGraph}
        <div style="display:flex;justify-content:space-between;margin-top:4px;">
          <span style="font-size:9px;color:var(--muted);">${pred.historique[0]&&pred.historique[0].date?_ppWk(pred.historique[0]):'début'}</span>
          <span style="font-size:9px;color:var(--muted);">aujourd'hui</span>
        </div>
      </div>`:''}

      <!-- Warning 10km sans blocs -->
      ${course==='10 km'&&pred._method==='riegel_fallback'?`
      <div style="background:#FFF3CD;border:1px solid #E8A500;border-radius:10px;padding:10px 12px;margin-bottom:12px;">
        <p style="font-size:11px;font-weight:700;color:#7A5500;margin-bottom:3px;">⚠️ Estimation approximative</p>
        <p style="font-size:10px;color:#7A5500;">Aucun bloc d'allure 10km renseigné — prédiction via Riegel depuis le modèle marathon. Valide des séances fractionné avec blocs d'allure pour une prédiction directe.</p>
      </div>`:''}

      <!-- Note méthode -->
      <p style="font-size:10px;color:var(--muted);text-align:center;margin-bottom:16px;">${
        pred._method==='blocs_directs'?'Basé sur tes blocs d\'allure frac/tempo (modèle direct)':
        pred._method==='riegel_fallback'?'Estimation via Riegel depuis marathon — valide des blocs frac pour plus de précision':
        'Basé sur la prédiction marathon (modèle Jack Daniels) convertie via la formule de Riegel'
      }</p>

      <!-- Modifier manuellement -->
      <button onclick="closeModal();openTargetTimeModal();"
        style="width:100%;padding:12px;background:var(--bg2);border:1.5px solid var(--border);border-radius:12px;color:var(--text);font-size:14px;font-weight:600;cursor:pointer;">
        ✏️ Modifier mon objectif manuellement
      </button>
    </div>
  </div>`;
  mc.appendChild(overlay);
  overlay.addEventListener('click',e=>{if(e.target===overlay)closeModal();});
}
