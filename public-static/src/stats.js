function renderStats(){
  const isDark=window.matchMedia('(prefers-color-scheme:dark)').matches;
  if(chartKm)chartKm.destroy();
  renderFcReposChart();
  if(isAdmin()){ renderWhoopStats(); _initStatsPTR(); }
  if(typeof bsRenderStatsCard === 'function') bsRenderStatsCard();         // signaux du corps : foulée, zones FC (body-signals.js)
  if(typeof fmRenderStatsCard === 'function') fmRenderStatsCard();         // forme / fatigue, jour J, affûtage (fitness-model.js)
  { const _ac = document.getElementById('alc-stats-card'); if(_ac) _ac.innerHTML = typeof alcStatsHtml === 'function' ? alcStatsHtml() : ''; }   // alcool et récupération (alcohol.js)
  const monthNames=['JANV.','FÉVR.','MARS','AVR.','MAI','JUIN','JUIL.','AOÛT','SEPT.','OCT.','NOV.','DÉC.'];

  let kmLabels, kmRealized, kmProjected, pointFillR, pointBorderR, pointRadiiR, pointRadiiP, yMax, eCW;

  if(usesHardPlan()){
    const _cwSess=getOrderedWeekSessions(CW);const cwDoneCount=_cwSess.filter(({ei})=>state[`extra_w${CW}_s${ei}_done`]||state[`extra_w${CW}_s${ei}_km`]!=null).length;
    const cwTotal=weeks[CW-1].sessions.length;
    eCW=CW;
    kmLabels = weeks.map((w, i) => {
      const parts = w.date.split('/');
      const wDate = new Date(2026, parseInt(parts[1])-1, parseInt(parts[0]));
      const month = wDate.getMonth();
      if(i === 0) return monthNames[month];
      const prevParts = weeks[i-1].date.split('/');
      const prevDate = new Date(2026, parseInt(prevParts[1])-1, parseInt(prevParts[0]));
      return prevDate.getMonth() !== month ? monthNames[month] : '';
    });
    kmRealized = weeks.map(w => w.s <= CW ? getWeekTotalKm(w.s) : null);
    kmProjected = weeks.map(w => w.s >= CW ? getWeekTotalKm(w.s) : null);
    pointFillR = weeks.map(w => w.s === CW ? '#E8530A' : '#fff');
    pointBorderR = weeks.map(w => w.s <= CW ? '#E8530A' : 'transparent');
    pointRadiiR = weeks.map(w => w.s < CW ? 3 : w.s === CW ? 7 : 0);
    pointRadiiP = weeks.map(w => w.s > CW ? 3 : 0);
    yMax = Math.max(50, ...weeks.map(w=>getWeekTotalKm(w.s)));
  } else {
    // Plan athlète : utilise extra_w* et plan_start_date
    eCW=getAthleteCW();
    const maxW=getAthleteMaxWeek();
    const wsNums=Array.from({length:maxW},(_, i)=>i+1);
    const startDate=state.plan_start_date?new Date(state.plan_start_date):null;
    kmLabels=wsNums.map((ws,i)=>{
      if(!startDate) return ws===1?'S1':'';
      const d=new Date(startDate);
      d.setDate(d.getDate()+(ws-1)*7);
      const dow=d.getDay(); d.setDate(d.getDate()+(dow===0?-6:1-dow));
      const month=d.getMonth();
      if(i===0) return monthNames[month];
      const pd=new Date(startDate);
      pd.setDate(pd.getDate()+(ws-2)*7);
      const pdow=pd.getDay(); pd.setDate(pd.getDate()+(pdow===0?-6:1-pdow));
      return pd.getMonth()!==month?monthNames[month]:'';
    });
    const allKm=wsNums.map(ws=>getAthleteWeekKm(ws));
    kmRealized=wsNums.map((ws,i)=>ws<=eCW?allKm[i]:null);
    kmProjected=wsNums.map((ws,i)=>ws>=eCW?allKm[i]:null);
    pointFillR=wsNums.map(ws=>ws===eCW?'#E8530A':'#fff');
    pointBorderR=wsNums.map(ws=>ws<=eCW?'#E8530A':'transparent');
    pointRadiiR=wsNums.map(ws=>ws<eCW?3:ws===eCW?7:0);
    pointRadiiP=wsNums.map(ws=>ws>eCW?3:0);
    yMax=Math.max(50,...allKm);
  }

  chartKm = new Chart(document.getElementById('chart-km'), {
    type: 'line',
    data: {
      labels: kmLabels,
      datasets: [
        {
          label: 'Réalisé',
          // Réalisé — ligne pleine orange avec fill
          data: kmRealized,
          borderColor: '#E8530A',
          backgroundColor: 'rgba(232,83,10,0.10)',
          borderWidth: 2.5,
          pointBackgroundColor: pointFillR,
          pointBorderColor: pointBorderR,
          pointBorderWidth: 2,
          pointRadius: pointRadiiR,
          pointHoverRadius: pointRadiiR.map(r=>r>0?6:0),
          fill: true,
          tension: 0.35,
          spanGaps: false,
        },
        {
          label: 'Plan',
          // Projeté — ligne bleue pointillée avec fill léger
          data: kmProjected,
          borderColor: '#1B4FD8',
          backgroundColor: 'rgba(27,79,216,0.07)',
          borderWidth: 2,
          borderDash: [6, 3],
          pointBackgroundColor: '#fff',
          pointBorderColor: '#1B4FD8',
          pointBorderWidth: 2,
          pointRadius: pointRadiiP,
          pointHoverRadius: pointRadiiP.map(r=>r>0?5:0),
          fill: true,
          tension: 0.35,
          spanGaps: false,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: isDark ? '#bbb' : '#555',
            font: { size: 11, weight: '600' },
            boxWidth: 24,
            padding: 12,
            usePointStyle: true,
          }
        },
        tooltip: {
          callbacks: {
            label: c => c.raw + ' km' + (c.datasetIndex === 1 ? ' (plan)' : '')
          }
        }
      },
      scales: {
        x: {
          ticks: { color: isDark?'#888':'#666', font: { size: 9 }, maxRotation: 0 },
          grid: { color: isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)' }
        },
        y: {
          min: 0,
          max: Math.ceil(yMax/10)*10,
          ticks: { color: isDark?'#888':'#666', font: { size: 9 }, stepSize: 10, callback: v => v + ' km' },
          grid: { color: isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)' }
        }
      }
    }
  });
  // Badge km semaine en cours
  const badge = document.getElementById('chart-km-badge');
  if(badge) badge.textContent = (usesHardPlan() ? getWeekTotalKm(CW) : getAthleteWeekKm(getEffectiveCW())) + ' km';
  renderShoesList();   // Compte › Mes chaussures (si ouvert)
  // Tableau performances
  const pr=document.getElementById('perf-rows');
  if(pr){
    // toutes les séances réalisées, toutes prépas confondues (prAllDone, plan-optim.js), dans l'ordre des dates
    // (courses importées de Strava : 12 derniers mois dans la liste, tout l'historique dans les analyses)
    const perfRows=(typeof prAllDone==='function'?prAllDone():[]).filter(h=>h.km>0&&(!h.ext||prDays(h.date,prTodayIso())<=365)).map((h,i)=>({
      ws:h.cur?h.w:h.gw, si:i, wl:h.cur?'S'+h.w:new Date(h.date+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'}),
      title:sessionTitle(h.x), km:h.km, perf:Object.assign({},h.perf,{date:h.date}), c:typeColor[h.type]||'#888', type:h.type, extra:true, cur:h.cur }));
    // Apply filter
    const filtered=perfFilter==='all'?perfRows:perfRows.filter(r=>r.type===perfFilter);
    const moisFr=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    perfRows.forEach(row=>{
      row.bg=typeBg[row.type]||'#f5f5f5';
      if(row.perf.date){
        const d=new Date(row.perf.date);
        row.month=moisFr[d.getMonth()]+(d.getFullYear()!==new Date().getFullYear()?' '+d.getFullYear():'');
      } else {
        row.month=(weeks[row.ws-1]||{}).month||'';
      }
    });
    if(filtered.length===0){
      pr.innerHTML='<p style="padding:16px;text-align:center;font-size:13px;color:var(--muted);">Aucune séance pour ce filtre</p>';
    } else {
      const byMonth={};
      [...filtered].reverse().forEach(row=>{
        if(!byMonth[row.month]) byMonth[row.month]=[];
        byMonth[row.month].push(row);
      });
      pr.innerHTML='';
      Object.entries(byMonth).forEach(([month,rows],mi)=>{
        const totalKm=rows.reduce((a,r)=>a+Number(r.km),0);
        const hid='pm_'+month.replace(/[^a-zA-Z]/g,'_');
        const card=document.createElement('div');
        card.style.cssText='background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;';
        // une ligne par séance (type, date · km · allure · FC, effort WHOOP) ; toucher = détail
        const detail=rows.map((row,i)=>`
          <div style="${i<rows.length-1?'border-bottom:1px solid var(--border)':''};">
            ${_perfLine(row, hid+'_'+i)}
            <div id="prd_${hid}_${i}" style="display:none;padding:0 14px 12px;">
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;">
              <div style="background:var(--bg2);border-radius:6px;padding:6px;text-align:center;"><p style="font-size:10px;color:var(--muted);margin-bottom:2px;">KM</p><p style="font-size:14px;font-weight:700;color:var(--text);">${row.km}</p></div>
              <div style="background:var(--bg2);border-radius:6px;padding:6px;text-align:center;"><p style="font-size:10px;color:var(--muted);margin-bottom:2px;">Durée</p><p style="font-size:12px;font-weight:700;color:var(--text);">${row.perf.dur||'—'}</p></div>
              <div style="background:var(--bg2);border-radius:6px;padding:6px;text-align:center;"><p style="font-size:10px;color:var(--muted);margin-bottom:2px;">Allure</p><p style="font-size:12px;font-weight:700;color:var(--text);">${row.perf.pace||'—'}</p></div>
              <div style="background:var(--bg2);border-radius:6px;padding:6px;text-align:center;"><p style="font-size:10px;color:var(--muted);margin-bottom:2px;">FC</p><p style="font-size:14px;font-weight:700;color:var(--text);">${row.perf.hr||'—'}</p></div>
            </div>
            ${(row.type==='tempo'||row.type==='frac')&&row.perf.blocsAllure&&row.perf.blocsAllure.some(b=>b)?`
            <div style="margin-top:7px;display:flex;align-items:center;gap:6px;">
              <span style="font-size:10px;font-weight:700;color:#1B4FD8;">⚡ Blocs :</span>
              <span style="font-size:12px;font-weight:700;color:#1B4FD8;">${row.perf.blocsAllure.filter(Boolean).join(' · ')}</span>
              <span style="font-size:10px;color:var(--muted);">/km</span>
            </div>`:''}
            ${(()=>{
              const wh = row.perf.whoop || null;
              if(!wh || (!wh.workout_strain && !wh.workout_calories && !wh.calories)) return '';
              const strain = wh.workout_strain != null ? parseFloat(wh.workout_strain).toFixed(1) : null;
              const cals = (wh.workout_calories ?? wh.calories) != null ? Math.round(wh.workout_calories ?? wh.calories) : null;
              let cols = [];
              if(strain) cols.push(`<div style="text-align:center;"><p style="font-size:10px;color:#7B5EA7;margin-bottom:2px;font-weight:600;">Effort</p><p style="font-size:14px;font-weight:700;color:#7B5EA7;">${strain}</p></div>`);
              if(cals) cols.push(`<div style="text-align:center;"><p style="font-size:10px;color:#E8A000;margin-bottom:2px;font-weight:600;">Calories</p><p style="font-size:14px;font-weight:700;color:#E8A000;">${cals}<span style="font-size:10px;"> kcal</span></p></div>`);
              if(!cols.length) return '';
              return `<div style="margin-top:8px;background:rgba(123,94,167,0.08);border-radius:10px;padding:8px 10px;">
                <p style="font-size:9px;font-weight:700;color:#7B5EA7;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">⚡ WHOOP</p>
                <div style="display:grid;grid-template-columns:repeat(${cols.length},1fr);gap:8px;">${cols.join('')}</div>
              </div>`;
            })()}
            ${(()=>{
              // Météo récupérée dynamiquement (autoFetchMissingMeteo) ou via le bouton météo au moment de la validation
              const mt = row.perf.meteo || null;
              if(!mt) return '';
              const mid = 'meteo_' + row.ws + '_' + row.si;
              const impactColors={IDEAL:'#2E7D32',MODERE:'#E65100',ELEVE:'#C62828',EXTREME:'#B71C1C',HUMIDE:'#1565C0',FROID:'#37474F'};
              const impactLabels={IDEAL:'Idéal ✅',MODERE:'Chaleur modérée',ELEVE:'Forte chaleur',EXTREME:'Extrême ⚠️',HUMIDE:'Humide',FROID:'Froid'};
              const niveau=mt.impact_performance?.niveau||'IDEAL';
              const impactColor=impactColors[niveau]||'#2E7D32';
              const impactLabel=impactLabels[niveau]||niveau;
              const condIcon=mt.conditions?.split(' ').pop()||'🌤️';
              const elevFC=mt.impact_performance?.elevation_fc_bpm||0;
              let mh=`<div style="margin-top:8px;background:#FFF8E7;border-radius:10px;border:1px solid #F5A62330;overflow:hidden;">`;
              mh+=`<div onclick="(()=>{const el=document.getElementById('${mid}');const arr=document.getElementById('arr_${mid}');el.style.display=el.style.display==='none'?'block':'none';arr.style.transform=el.style.display==='none'?'':'rotate(180deg)';})()" style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;cursor:pointer;user-select:none;">`;
              mh+=`<div style="display:flex;align-items:center;gap:5px;"><span style="font-size:13px;">${condIcon}</span><p style="font-size:9px;font-weight:700;color:#E65100;text-transform:uppercase;letter-spacing:0.05em;margin:0;">Météo${mt.ville?' — '+mt.ville:''}</p></div>`;
              const _mtDate = mt.date ? (() => { const d = mt.date.split('-'); return d[2]+'/'+d[1]; })() : '';
              mh+=`<div style="display:flex;align-items:center;gap:6px;">${_mtDate ? `<span style="font-size:9px;color:#aaa;font-weight:500;">${_mtDate}</span>` : ''}<span style="font-size:12px;font-weight:700;color:#E65100;">${mt.temperature}°C</span><svg id="arr_${mid}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E65100" stroke-width="2.5" style="transition:transform 0.2s;flex-shrink:0;"><polyline points="6 9 12 15 18 9"/></svg></div>`;
              mh+=`</div><div id="${mid}" style="display:none;padding:8px 10px;border-top:1px solid #F5A62320;">`;
              mh+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">`;
              mh+=`<div><p style="font-size:11px;font-weight:700;color:#1a2e4a;margin:0;">${mt.temperature}°C <span style="font-size:10px;font-weight:400;color:#6B8DB5;">ressenti ${mt.ressenti}°C</span></p></div>`;
              mh+=`<div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;">`;
              mh+=`<span style="background:rgba(12,68,124,0.08);border-radius:10px;padding:2px 8px;font-size:10px;color:#0C447C;">💧${mt.humidite}%</span>`;
              mh+=`<span style="background:rgba(12,68,124,0.08);border-radius:10px;padding:2px 8px;font-size:10px;color:#0C447C;">💨${mt.vent_kmh}km/h</span>`;
              mh+=`<span style="background:${impactColor}18;border-radius:10px;padding:2px 8px;font-size:10px;font-weight:700;color:${impactColor};">${impactLabel}</span>`;
              if(elevFC>0) mh+=`<span style="background:#FF6F0018;border-radius:10px;padding:2px 8px;font-size:10px;font-weight:600;color:#E65100;">❤️FC+${elevFC}bpm</span>`;
              mh+=`</div></div>`;
              if(mt.impact_performance?.conseil) mh+=`<p style="font-size:9px;color:#888;margin:0;font-style:italic;">${mt.impact_performance.conseil}</p>`;
              mh+=`</div></div>`;
              return mh;
            })()}
            ${(()=>{
              const st = row.perf.strava;
              if(!st) return '';
              const sid = 'strava_' + row.ws + '_' + row.si;
              let sh = `<div style="margin-top:8px;background:#EDF5FF;border-radius:10px;border:1px solid #1382E420;overflow:hidden;">`;
              sh += `<div onclick="(()=>{const el=document.getElementById('${sid}');const arr=document.getElementById('arr_${sid}');el.style.display=el.style.display==='none'?'block':'none';arr.style.transform=el.style.display==='none'?'':'rotate(180deg)'})()" style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;cursor:pointer;user-select:none;">`;
              sh += `<p style="font-size:9px;font-weight:700;color:#FC4C02;text-transform:uppercase;letter-spacing:0.05em;margin:0;">🟠 Strava</p>`;
              sh += `<svg id="arr_${sid}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FC4C02" stroke-width="2.5" style="transition:transform 0.2s;flex-shrink:0;"><polyline points="6 9 12 15 18 9"/></svg>`;
              sh += `</div>`;
              sh += `<div id="${sid}" style="display:none;padding:8px 10px;border-top:1px solid #1382E420;">`;
              const ex = [];
              if(st.cadence) ex.push(`<div style="text-align:center;"><p style="font-size:9px;color:#6B8DB5;margin-bottom:1px;">Cadence</p><p style="font-size:12px;font-weight:700;color:#1a2e4a;">${st.cadence}<span style="font-size:9px;"> spm</span></p></div>`);
              if(st.fcMax) ex.push(`<div style="text-align:center;"><p style="font-size:9px;color:#6B8DB5;margin-bottom:1px;">FC max</p><p style="font-size:12px;font-weight:700;color:#E24B4A;">${st.fcMax}<span style="font-size:9px;"> bpm</span></p></div>`);
              if(st.denivele_pos != null) ex.push(`<div style="text-align:center;"><p style="font-size:9px;color:#6B8DB5;margin-bottom:1px;">D+</p><p style="font-size:12px;font-weight:700;color:#3B6D11;">${st.denivele_pos}<span style="font-size:9px;"> m</span></p></div>`);
              if(st.calories) ex.push(`<div style="text-align:center;"><p style="font-size:9px;color:#6B8DB5;margin-bottom:1px;">Calories</p><p style="font-size:12px;font-weight:700;color:#E8530A;">${st.calories}<span style="font-size:9px;"> kcal</span></p></div>`);
              if(st.best_400m) ex.push(`<div style="text-align:center;"><p style="font-size:8px;color:#6B8DB5;margin-bottom:1px;white-space:nowrap;">Meilleur 400m</p><p style="font-size:12px;font-weight:700;color:#1B4FD8;">${st.best_400m}<span style="font-size:9px;"> /km</span></p></div>`);
              if(ex.length > 0) sh += `<div style="display:grid;grid-template-columns:repeat(${ex.length},1fr);gap:6px;${st.splits&&st.splits.length?'margin-bottom:8px;':''}">${ex.join('')}</div>`;
              if(st.splits && st.splits.filter(sp=>sp.allure!=null).length > 0) {
                sh += '<p style="font-size:9px;font-weight:700;color:#6B8DB5;margin-bottom:4px;text-transform:uppercase;">Splits</p>';
                sh += '<table style="width:100%;border-collapse:collapse;font-size:10px;">';
                sh += '<tr style="color:#6B8DB5;"><th style="text-align:left;padding:1px 3px;">Km</th><th style="text-align:center;padding:1px 3px;">Allure</th><th style="text-align:center;padding:1px 3px;">FC</th></tr>';
                st.splits.filter(sp=>sp.allure!=null).forEach(sp => {
                  sh += `<tr style="border-top:1px solid #d0dff5;"><td style="padding:2px 3px;font-weight:700;color:#1a2e4a;">${sp.km}</td><td style="padding:2px 3px;text-align:center;color:#1B4FD8;font-weight:600;">${sp.allure||'—'}</td><td style="padding:2px 3px;text-align:center;color:#E24B4A;">${sp.fc||'—'}</td></tr>`;
                });
                sh += '</table>';
              }
              sh += '</div></div>';
              return sh;
            })()}
            </div>
          </div>`).join('');
        card.innerHTML=`<div onclick="togglePerfMonth('${hid}')" style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;cursor:pointer;user-select:none;"><div style="display:flex;align-items:center;gap:8px;"><span style="font-size:12px;font-weight:700;color:var(--orange);text-transform:uppercase;letter-spacing:0.06em;">${month}</span><span style="font-size:11px;color:var(--muted);">${rows.length} séance${rows.length>1?'s':''}</span></div><div style="display:flex;align-items:center;gap:10px;"><span style="font-size:13px;font-weight:600;color:var(--text);">${Math.round(totalKm*10)/10} km</span><svg id="arr-${hid}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" style="transition:transform 0.2s;flex-shrink:0;${mi===0?'transform:rotate(180deg);':''}"><polyline points="6 9 12 15 18 9"/></svg></div></div><div id="${hid}" style="display:${mi===0?'block':'none'};border-top:1px solid var(--border);">${detail}</div>`;
        pr.appendChild(card);
      });
    }
  }
}

// Historique (Statistiques) : ligne compacte d'une séance, qui ouvre son détail
const _PERF_SHORT={ef:'EF',tempo:'Tempo',frac:'Frac.',long:'SL',race:'Course',sortie:'SL',marathon:'Course',cac:'CAC'};
function _perfLine(row, id){
  const p=row.perf||{}, wh=p.whoop||{}, strain=wh.workout_strain!=null?+wh.workout_strain:wh.cycle_strain!=null?+wh.cycle_strain:null;
  const sc=strain==null?'':strain>=18?'#dc2626':strain>=14?'#f59e0b':strain>=8?'#16a34a':strain>=4?'#3b82f6':'#6b7280';
  const dt=p.date?new Date(p.date+'T12:00:00'):null;
  const d=dt?['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'][dt.getDay()]+' '+dt.getDate()+' '+['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'][dt.getMonth()]:(row.wl||'S'+row.ws);
  const meta=[d, row.km+' km']; if(p.pace) meta.push(p.pace+'/km'); if(p.hr) meta.push('FC '+p.hr);
  return `<button type="button" class="ph-row" onclick="togglePerfRow('${id}')"><span class="ph-b" style="color:${row.c};background:${row.bg};">${_PERF_SHORT[row.type]||(typeLabel[row.type]||'EF')}</span>`
    +`<span class="ph-m"><b>${row.title}</b><small>${meta.join(' · ')}</small></span>`
    +(strain!=null?`<span class="ph-e"><small>Effort</small><b style="color:${sc};">${strain.toFixed(1)}</b></span>`:'')
    +`<svg id="arr-prd_${id}" class="ph-c" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></button>`;
}
function togglePerfRow(id){
  const el=document.getElementById('prd_'+id), a=document.getElementById('arr-prd_'+id); if(!el) return;
  const open=el.style.display==='none'; el.style.display=open?'block':'none'; if(a) a.style.transform=open?'rotate(180deg)':'';
}

// ── Statistiques en onglets : Forme · Entraînement · Historique (dernier onglet mémorisé) ──
function statsTab(t){
  if(['forme','train','hist'].indexOf(t)<0) t='forme';
  document.querySelectorAll('#sc-stats .st-pane').forEach(el=>{ el.style.display=el.dataset.st===t?'':'none'; });
  document.querySelectorAll('#st-tabs button').forEach(b=>{ const on=b.dataset.st===t; b.classList.toggle('on',on); b.setAttribute('aria-selected',on?'true':'false'); });
  try{ localStorage.setItem('stats_tab',t); }catch(e){}
  // graphiques dessinés dans un onglet caché : remis à la bonne taille
  setTimeout(()=>{ try{ if(chartKm) chartKm.resize(); if(_whoopChart) _whoopChart.resize(); }catch(e){} },30);
}
function statsTabInit(){ let t='forme'; try{ t=localStorage.getItem('stats_tab')||'forme'; }catch(e){} statsTab(t); }
// récupération WHOOP : le graphique 7 jours s'ouvre en touchant le score ou une tuile, sur la bonne courbe
function whoopChartOpen(mode){
  const box=document.getElementById('whoop-chart-box'), lnk=document.getElementById('whoop-chart-link'); if(!box) return;
  const same=box.style.display!=='none'&&mode===_whoopChartMode;
  box.style.display=same?'none':''; if(lnk) lnk.textContent=same?'Voir l\'évolution sur 7 jours ›':'Masquer l\'évolution';
  if(!same){ switchUnifiedChart(mode||_whoopChartMode); setTimeout(()=>box.scrollIntoView({behavior:'smooth',block:'nearest'}),60); }
}

// Liste des chaussures (km, historique, modifier / supprimer, ajout, Strava) : Compte › « Mes chaussures » (openShoesPanel, shoes.js)
function renderShoesList(){
  const sb=document.getElementById('shoes-bars');if(!sb) return;sb.innerHTML='';
  const dynamicShoes=getShoes();
  if(dynamicShoes.length===0){
    sb.innerHTML='<div style="text-align:center;padding:16px 12px 20px;border:1.5px dashed var(--border);border-radius:14px;"><p style="font-size:13px;color:var(--muted);margin:0 0 10px;line-height:1.4;">👟 Aucune chaussure renseignée.<br><span style="font-size:11px;">Ajoute tes paires pour suivre leur kilométrage et savoir quand les remplacer.</span></p><button onclick="openAddShoeModal()" style="padding:9px 18px;background:#1B4FD8;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">+ Ajouter une chaussure</button></div>';
    const sm=document.getElementById('shoes-manage');
    if(sm) sm.innerHTML='';
    return;
  }
  dynamicShoes.forEach((sh)=>{
    const km=shoeKmTotal(sh.name);
    const pct=Math.min(100,Math.round(km/sh.max*100));
    const row=document.createElement('div');
    row.style.cssText='margin-bottom:14px;';
    // ligne : nom complet (touche → historique) · km à droite · actions en icônes
    const _icoBtn='width:32px;height:32px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border-radius:9px;cursor:pointer;';
    row.innerHTML=`<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:7px;">
      <button type="button" onclick="openShoeHistory('${sh.name}')" title="Voir l'historique des séances" style="flex:1;min-width:0;display:flex;align-items:flex-start;gap:8px;background:none;border:none;padding:0;text-align:left;cursor:pointer;font-family:inherit;">
        <span style="width:10px;height:10px;border-radius:50%;background:${sh.color};flex-shrink:0;margin-top:4px;"></span>
        <span style="min-width:0;">
          <span style="display:block;font-size:13.5px;font-weight:700;color:var(--text);line-height:1.3;">${sh.name}</span>
          <span style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-top:3px;font-size:10.5px;color:var(--muted);font-weight:600;">
            <span style="text-decoration:underline dotted;">Historique</span>
            ${sh.retired?'<span style="color:#92400E;background:#FEF3C7;border-radius:10px;padding:1px 6px;">retirée</span>':''}
            ${shoeStravaFor(sh.name)?'<span title="Kilométrage Strava" style="font-weight:800;color:#FC4C02;background:#FFF1EA;border-radius:6px;padding:1px 5px;">STRAVA</span>':''}
          </span>
        </span>
      </button>
      <span style="flex-shrink:0;font-size:14px;font-weight:800;color:var(--text);font-variant-numeric:tabular-nums;white-space:nowrap;margin-top:1px;">${km}<span style="color:var(--muted);font-weight:600;font-size:12px;"> / ${sh.max} km</span></span>
      <button onclick="openEditShoeModal('${sh.name}')" aria-label="Modifier ${sh.name}" title="Modifier" style="${_icoBtn}background:var(--bg2);border:1px solid var(--border);color:var(--muted);">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>
      </button>
      <button onclick="deleteShoe('${sh.name}')" aria-label="Supprimer ${sh.name}" title="Supprimer" style="${_icoBtn}background:#fff;border:1px solid #F1D4D4;color:#C0392B;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>
      </button>
    </div>
    <div style="background:var(--bg2);border-radius:4px;height:8px;">
      <div style="background:${sh.color};border-radius:4px;height:8px;width:${pct}%;transition:width 0.5s;"></div>
    </div>`;
    sb.appendChild(row);
  });

  // Shoe management section
  const sm=document.getElementById('shoes-manage');
  if(sm) sm.innerHTML=`<button onclick="openAddShoeModal()" style="width:100%;padding:14px;background:linear-gradient(135deg,#0C447C,#1B4FD8);border:none;border-radius:14px;font-size:14px;font-weight:700;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 14px rgba(27,79,216,0.35);">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    👟 Ajouter une paire de chaussures
  </button>${state.strava_token?`<button onclick="openShoesStravaModal()" style="width:100%;margin-top:8px;padding:12px;background:#fff;border:1.5px solid #FDBA9A;border-radius:14px;font-size:13.5px;font-weight:800;color:#C2410C;cursor:pointer;">🔗 Relier mes chaussures à Strava</button>`:''}`;
  if(typeof shoesStravaSync==='function') shoesStravaSync();
}

// ── Pull-to-refresh WHOOP sur l'écran Stats ───────────────────────────────
let _ptrActive = false;
let _ptrStartY = 0;

function _initStatsPTR() {
  if (window._statsPtrReady) return;
  window._statsPtrReady = true;

  document.addEventListener('touchstart', e => {
    _ptrStartY = e.touches[0].clientY;
    _ptrActive = false;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    const sc = document.getElementById('sc-stats');
    if (!sc || sc.style.display === 'none') return;
    if (window.scrollY > 5) return;
    const dy = e.touches[0].clientY - _ptrStartY;
    if (dy > 0) {
      _ptrActive = true;
      const ratio = Math.min(1, dy / 70);
      const sp = document.getElementById('stats-ptr-spinner');
      if (sp) sp.style.opacity = String(ratio);
    }
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (!_ptrActive) return;
    _ptrActive = false;
    const sp = document.getElementById('stats-ptr-spinner');
    if (!sp) return;
    const triggered = parseFloat(sp.style.opacity) >= 0.85;
    if (triggered) {
      sp.style.opacity = '1';
      _ptrSyncWhoop(sp);
    } else {
      sp.style.opacity = '0';
    }
  });
}

async function _ptrSyncWhoop(spinner) {
  try {
    // syncWhoopFresh est awaitable et ne clear pas state.whoop_data en cas d'erreur auth
    if (typeof syncWhoopFresh === 'function' && state.whoop_token?.access_token) {
      await syncWhoopFresh();
    }
  } catch(e) {}
  await new Promise(r => setTimeout(r, 400));
  if (spinner) spinner.style.opacity = '0';
}

let _whoopChart = null;
let _whoopChartMode = 'fc';

// Score de forme du jour (récupération WHOOP, sommeil, FC repos, VFC) : même valeur dans Statistiques et sur l'accueil
function wellnessScore(rRec, sSleep, fcV){
  const sc = [];
  if (rRec && rRec.score != null) sc.push(rRec.score);
  if (sSleep && sSleep.performance_pct != null) sc.push(sSleep.performance_pct);
  if (fcV != null) sc.push(fcV <= 44 ? 100 : fcV <= 50 ? Math.round(100 - (fcV - 44) * 3) : fcV <= 60 ? Math.round(82 - (fcV - 50) * 3.7) : fcV <= 70 ? Math.round(45 - (fcV - 60) * 4.5) : 0);
  if (rRec && rRec.hrv != null) sc.push(Math.max(0, Math.min(100, Math.round((rRec.hrv - 40) / 50 * 100))));
  return sc.length ? Math.round(sc.reduce((a, b) => a + b, 0) / sc.length) : null;
}
function wellnessWaiting(){
  const wd = state.whoop_data;
  if (!wd || typeof _getWakeupDate !== 'function') return false;
  return !wellnessNight().r;
}
// ─── Données de la nuit : UNIQUEMENT celles du jour (jamais la veille) ───
// jour de la nuit = même règle que le bouton Réveil (_getWakeupDate, date UTC ; avant 3 h UTC = veille)
function wellnessDay(){ return typeof _getWakeupDate === 'function' ? _getWakeupDate() : new Date().toISOString().slice(0, 10); }
function wellnessNight(){
  const wd = state.whoop_data || null, day = wellnessDay();
  const r = wd && wd.recoveries ? wd.recoveries.find(x => x && x.date === day) || null : null;
  const s = wd && wd.sleeps ? wd.sleeps.find(x => x && x.date === day) || null : null;
  const fcv = parseInt(state['fc_repos_' + day]) || parseInt(state['fc_repos_' + (typeof prTodayIso === 'function' ? prTodayIso() : day)]) || null;
  return { day: day, r: r, s: s, fc: fcv >= 30 && fcv <= 100 ? fcv : null, whoop: !!(wd || (state.whoop_token && state.whoop_token.access_token)) };
}
// état de la carte « Forme du jour » : ok | loading | waiting (avant le réveil) | failed (synchro en échec) | pending (nuit pas encore chez WHOOP)
function wellnessState(){
  const N = wellnessNight();
  if(!N.whoop || N.r) return { kind: 'ok', N: N };
  if((typeof whoopStartupLoading === 'function' && whoopStartupLoading()) || (typeof _whoopSyncing !== 'undefined' && _whoopSyncing)) return { kind: 'loading', N: N };
  const last = typeof window !== 'undefined' ? window._whoopLastSync : null;
  if(last && !last.ok) return { kind: 'failed', N: N, auth: !!last.needsAuth, error: last.error || '' };
  if(!state['_wakeup_' + N.day]) return { kind: 'waiting', N: N };
  return { kind: 'pending', N: N, at: last ? last.at : null };
}
function wellnessScoreToday(){
  const N = wellnessNight();
  if(N.whoop && !N.r) return null;                                                  // WHOOP connecté sans la nuit du jour : pas de score
  const r0 = N.r, s0 = N.s, fcToday = N.fc, score = wellnessScore(r0, s0, fcToday);
  if (score == null) return null;
  const parts = [];
  if (r0 && r0.score != null) parts.push('récup ' + r0.score + ' %');
  if (s0 && s0.performance_pct != null) parts.push('sommeil ' + s0.performance_pct + ' %');
  if (fcToday != null) parts.push('FC repos ' + fcToday);
  if (r0 && r0.hrv != null) parts.push('VFC ' + Math.round(r0.hrv) + ' ms');
  return { score: score, parts: parts };
}

function renderWhoopStats() {
  const wd = state.whoop_data;
  const section = document.getElementById('whoop-stats-section');
  if (!section) return;

  // ── Fallback : WHOOP importé via validation de séance (charge/calories) ──
  const perfKeys = Object.keys(state).filter(k => k.match(/^w\d+_s\d+_?perf$|^s\d+i\d+perf$/));
  let bestWhoopPerf = null;
  for (const k of perfKeys) {
    try {
      const p = JSON.parse(state[k]);
      if (p.whoop && (p.whoop.workout_strain != null || p.whoop.cycle_strain != null)) {
        const d = p.date || p.whoop.date || null;
        if (!bestWhoopPerf || (d && (!bestWhoopPerf._date || d > bestWhoopPerf._date))) {
          bestWhoopPerf = { ...p.whoop, _date: d };
        }
      }
    } catch(e) {}
  }

  // Masquer la section seulement si ni whoop_data ni WHOOP importé via séance
  const hasWhoopSync = wd && (wd.recoveries?.length || wd.cycles?.length);
  if (!hasWhoopSync && !bestWhoopPerf) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';

  const isDark = window.matchMedia('(prefers-color-scheme:dark)').matches;
  const scoreColor = s => s >= 67 ? '#22c55e' : s >= 34 ? '#f59e0b' : '#ef4444';
  const rhrColor = v => v == null ? 'var(--muted)' : v <= 50 ? '#16a34a' : v <= 60 ? '#ca8a04' : '#dc2626';

  // ── KPIs du jour ──────────────────────────────────────────────────────────
  const r0 = wd?.recoveries?.[0] || null;
  const s0 = wd?.sleeps?.[0] || null;
  let cy0 = wd?.cycles?.[0] || null;

  // Appliquer le fallback séance si cy0 absent ou sans strain
  if (bestWhoopPerf && (!cy0 || cy0.strain == null)) {
    cy0 = { ...(cy0 || {}), strain: bestWhoopPerf.workout_strain ?? bestWhoopPerf.cycle_strain ?? null, calories: bestWhoopPerf.workout_calories ?? bestWhoopPerf.cycle_calories ?? null };
  }

  // Flèche tendance FC repos : compare aujourd'hui vs moyenne 7j
  const allFcEntries = Object.keys(state)
    .filter(k => k.match(/^fc_repos_\d{4}-\d{2}-\d{2}$/))
    .map(k => ({ date: k.replace('fc_repos_',''), val: parseInt(state[k]) }))
    .filter(e => e.val >= 30 && e.val <= 100)
    .sort((a,b) => a.date.localeCompare(b.date));
  const fcToday = allFcEntries.length ? allFcEntries[allFcEntries.length-1].val : null;
  const fc7 = allFcEntries.slice(-8,-1);
  const fcAvg7 = fc7.length ? Math.round(fc7.reduce((s,e)=>s+e.val,0)/fc7.length) : null;
  const fcTrend = fcToday != null && fcAvg7 != null
    ? (fcToday <= fcAvg7 - 2 ? '↓ forme' : fcToday >= fcAvg7 + 2 ? '↑ fatigue' : '→ stable')
    : null;
  const fcTrendColor = fcTrend === '↓ forme' ? '#16a34a' : fcTrend === '↑ fatigue' ? '#dc2626' : '#ca8a04';

  // Alerte surcharge : charge élevée + récup faible
  const strainHigh = cy0?.strain != null && cy0.strain >= 14;
  const recupLow = r0?.score != null && r0.score < 34;
  const surchargeAlert = strainHigh && recupLow;

  // Label contextuel charge + moyenne 14j
  const strainVal = cy0?.strain != null ? Math.round(cy0.strain * 10) / 10 : null;
  // Échelle WHOOP réelle 0-21 : Repos<4, Léger 4-7.9, Modéré 8-13.9, Intense 14-17.9, Maximum ≥18
  const strainLabel = strainVal == null ? null : strainVal >= 18 ? 'Maximum' : strainVal >= 14 ? 'Intense' : strainVal >= 8 ? 'Modéré' : strainVal >= 4 ? 'Léger' : 'Repos';
  const strainLabelColor = strainVal == null ? 'var(--muted)' : strainVal >= 18 ? '#dc2626' : strainVal >= 14 ? '#f59e0b' : strainVal >= 8 ? '#16a34a' : strainVal >= 4 ? '#3b82f6' : '#6b7280';
  const strain14Data = wd?.cycles ? [...wd.cycles].filter(c => c.strain != null).slice(1, 15) : [];
  const strain14Avg = strain14Data.length >= 3 ? Math.round(strain14Data.reduce((s,c)=>s+c.strain,0)/strain14Data.length * 10)/10 : null;
  const strainVsAvg = strainVal != null && strain14Avg != null ? Math.round((strainVal - strain14Avg) * 10)/10 : null;

  // VFC data
  const hrvVal = r0?.hrv != null ? Math.round(r0.hrv) : null;
  const hrvColor2 = v => v == null ? 'var(--muted)' : v >= 85 ? '#16a34a' : v >= 60 ? '#ca8a04' : '#dc2626';

  const kpis = [
    {
      label: 'Récupération',
      value: r0?.score != null ? r0.score + '%' : '—',
      sub: r0?.rhr ? `<span style="color:${rhrColor(r0.rhr)};font-weight:700;">${r0.rhr}</span> bpm repos (nuit)` : (cy0?.avg_hr ? cy0.avg_hr + ' bpm moy' : ''),
      color: r0?.score != null ? scoreColor(r0.score) : 'var(--muted)',
      bg: isDark ? 'rgba(34,197,94,0.12)' : '#f0fdf4',
      border: isDark ? 'rgba(34,197,94,0.25)' : '#bbf7d0'
    },
    {
      label: 'VFC',
      value: hrvVal != null ? hrvVal + ' ms' : '—',
      sub: hrvVal != null ? (hrvVal >= 85 ? 'Excellent' : hrvVal >= 60 ? 'Bon' : 'Bas') : '',
      color: hrvColor2(hrvVal),
      bg: isDark ? 'rgba(139,92,246,0.12)' : '#f5f3ff',
      border: isDark ? 'rgba(139,92,246,0.25)' : '#ddd6fe'
    },
    {
      label: 'Sommeil',
      value: s0?.performance_pct != null ? s0.performance_pct + '%' : '—',
      sub: s0?.duration_hours ? (()=>{
        const durH=parseFloat(s0.duration_hours);
        const durColor=isNaN(durH)?'var(--muted)':durH>=8?'#16a34a':durH>=6.5?'#ca8a04':'#dc2626';
        return `<span style="color:${durColor};font-weight:700;">${s0.duration_hours}</span>`;
      })() : '',
      color: s0?.performance_pct != null ? scoreColor(s0.performance_pct) : 'var(--muted)',
      bg: isDark ? 'rgba(59,130,246,0.12)' : '#eff6ff',
      border: isDark ? 'rgba(59,130,246,0.25)' : '#bfdbfe'
    },
    {
      label: 'Effort',
      value: strainVal != null ? strainVal.toString() : '—',
      sub: (()=>{
        const parts = [];
        if (strainLabel) parts.push(`<span style="color:${strainLabelColor};font-weight:700;">${strainLabel}</span>`);
        if (strain14Avg != null) {
          parts.push(`<span style="color:var(--muted);">moy ${strain14Avg}</span>`);
        } else if (cy0?.calories) { parts.push(cy0.calories + ' kcal'); }
        return parts.join(' · ');
      })(),
      color: strainLabelColor,
      bg: strainVal == null ? (isDark ? 'rgba(107,114,128,0.12)' : '#f9fafb') : strainVal >= 18 ? (isDark ? 'rgba(220,38,38,0.12)' : '#fef2f2') : strainVal >= 14 ? (isDark ? 'rgba(245,158,11,0.12)' : '#fefce8') : strainVal >= 8 ? (isDark ? 'rgba(22,163,74,0.12)' : '#f0fdf4') : strainVal >= 4 ? (isDark ? 'rgba(59,130,246,0.12)' : '#eff6ff') : (isDark ? 'rgba(107,114,128,0.12)' : '#f9fafb'),
      border: strainVal == null ? (isDark ? 'rgba(107,114,128,0.25)' : '#e5e7eb') : strainVal >= 18 ? (isDark ? 'rgba(220,38,38,0.3)' : '#fca5a5') : strainVal >= 14 ? (isDark ? 'rgba(245,158,11,0.3)' : '#fde68a') : strainVal >= 8 ? (isDark ? 'rgba(22,163,74,0.3)' : '#bbf7d0') : strainVal >= 4 ? (isDark ? 'rgba(59,130,246,0.3)' : '#bfdbfe') : (isDark ? 'rgba(107,114,128,0.25)' : '#e5e7eb')
    }
  ];

  // ── Score synthétique du jour (commun avec « Forme du jour » de l'accueil : wellnessScore) ──
  const _calcSyntheticScore = (rRec, sSleep, fcV) => wellnessScore(rRec, sSleep, fcV);

  const syntheticEl = document.getElementById('whoop-synthetic-score');
  if (syntheticEl) {
    const avg = _calcSyntheticScore(r0, s0, fcToday, allFcEntries);
    // Score d'hier pour la tendance
    const r1 = wd?.recoveries?.[1] || null;
    const s1 = wd?.sleeps?.[1] || null;
    const fcYesterday = allFcEntries.length >= 2 ? allFcEntries[allFcEntries.length-2].val : null;
    const avgYesterday = _calcSyntheticScore(r1, s1, fcYesterday, allFcEntries);
    const trendDiff = avg != null && avgYesterday != null ? avg - avgYesterday : null;

    // Moyenne score 7j (jours précédents)
    const avg7jScores = [];
    for (let i = 1; i <= 7; i++) {
      const ri = wd?.recoveries?.[i] || null;
      const si = wd?.sleeps?.[i] || null;
      const fci = allFcEntries.length > i ? allFcEntries[allFcEntries.length-1-i].val : null;
      const s = _calcSyntheticScore(ri, si, fci, allFcEntries);
      if (s != null) avg7jScores.push(s);
    }
    const avg7j = avg7jScores.length >= 3 ? Math.round(avg7jScores.reduce((a,b)=>a+b,0)/avg7jScores.length) : null;

    if (avg != null) {
      const col = scoreColor(avg);
      const emoji = avg >= 67 ? '🟢' : avg >= 34 ? '🟡' : '🔴';
      const label = avg >= 67 ? 'Bonne forme' : avg >= 34 ? 'Forme moyenne' : 'Récupération insuffisante';
      const components = ['récup', 'sommeil', 'FC repos'];
      if (r0?.hrv != null) components.push('VFC');
      let trendHtml = '';
      if (trendDiff != null) {
        const tCol = trendDiff > 0 ? '#16a34a' : trendDiff < 0 ? '#dc2626' : '#ca8a04';
        const tArrow = trendDiff > 0 ? '↑' : trendDiff < 0 ? '↓' : '→';
        const tSign = trendDiff > 0 ? '+' : '';
        trendHtml = `<span style="font-size:11px;color:${tCol};font-weight:700;margin-left:8px;">${tArrow} ${tSign}${trendDiff} pts vs hier</span>`;
      }
      const avg7jHtml = avg7j != null ? `<div style="font-size:10px;color:var(--muted);margin-top:1px;">Moy 7j : <span style="font-weight:700;color:${scoreColor(avg7j)};">${avg7j}%</span></div>` : '';
      syntheticEl.innerHTML = `
        <div role="button" tabindex="0" onclick="whoopChartOpen('fc')" style="cursor:pointer;background:${isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)'};border:1px solid ${isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.07)'};border-radius:14px;padding:12px 16px;display:flex;align-items:center;gap:14px;margin-bottom:12px;">
          <div style="font-size:36px;font-weight:900;color:${col};line-height:1;">${avg}<span style="font-size:16px;">%</span></div>
          <div>
            <div style="font-size:13px;font-weight:700;color:${col};">${emoji} ${label}${trendHtml}</div>
            <div style="font-size:10px;color:var(--muted);margin-top:2px;">${wellnessWaiting() ? '💤 Score de la nuit précédente · en attente du réveil' : 'Score du jour · ' + components.join(' + ')}</div>
            ${avg7jHtml}
          </div>
        </div>`;
      syntheticEl.style.display = 'block';
    } else {
      syntheticEl.style.display = 'none';
    }
  }

  const _kMode={'Récupération':'recovery','VFC':'hrv','Sommeil':'sleep','Effort':'strain'};
  document.getElementById('whoop-kpi-row').innerHTML = kpis.map(k => `
    <div role="button" tabindex="0" onclick="whoopChartOpen('${_kMode[k.label]||'fc'}')" style="cursor:pointer;background:${k.bg};border:1px solid ${k.border};border-radius:12px;padding:12px 10px;text-align:center;">
      <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">${k.label}</div>
      <div style="font-size:24px;font-weight:800;color:${k.color};line-height:1;">${k.value}</div>
      ${k.sub ? `<div style="font-size:10px;color:var(--muted);margin-top:4px;">${k.sub}</div>` : ''}
    </div>
  `).join('');

  _renderUnifiedWhoopChart(_whoopChartMode);
}

function _renderUnifiedWhoopChart(mode) {
  const isDark = window.matchMedia('(prefers-color-scheme:dark)').matches;
  const isFcMode = mode === 'fc' || mode === 'hrv';

  // Afficher/masquer le KPI row FC/VFC
  const fcKpiRow = document.getElementById('fc-repos-kpi-row');
  const fcTrend = document.getElementById('fc-repos-trend');
  const fcDetail = document.getElementById('fc-repos-detail');
  const alertEl = document.getElementById('whoop-chart-alert');
  if (fcKpiRow) fcKpiRow.style.display = isFcMode ? 'grid' : 'none';
  if (fcTrend) fcTrend.style.display = 'none';
  if (fcDetail) fcDetail.innerHTML = '';

  const canvas = document.getElementById('chart-whoop-unified');
  if (!canvas) return;
  if (_whoopChart) { _whoopChart.destroy(); _whoopChart = null; }
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

  if (mode === 'fc' || mode === 'hrv') {
    // Déléguer à renderFcReposChart pour les données FC/VFC
    _fcReposChartType = mode === 'hrv' ? 'vfc' : 'fc';
    renderFcReposChart();
    return;
  }

  const wd = state.whoop_data;
  if (!wd) return;

  const dedupeByDate = (arr) => {
    const seen = new Map();
    for (const item of arr) { if (!seen.has(item.date)) seen.set(item.date, item); }
    return [...seen.values()];
  };
  const scoreCol = s => s >= 67 ? '#22c55e' : s >= 34 ? '#f59e0b' : '#ef4444';
  let points, color, unit, yMin, yMax, pointColors;

  if (mode === 'recovery') {
    const data = dedupeByDate([...(wd.recoveries || [])].sort((a,b) => a.date.localeCompare(b.date))).slice(-7);
    points = data.map(r => ({ x: new Date(r.date + 'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'}), y: r.score }));
    pointColors = points.map(p => scoreCol(p.y));
    color = '#22c55e'; unit = '%'; yMin = 0; yMax = 100;
  } else if (mode === 'sleep') {
    const data = dedupeByDate([...(wd.sleeps || [])].sort((a,b) => a.date.localeCompare(b.date))).slice(-7);
    points = data.map(s => ({ x: new Date(s.date + 'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'}), y: s.performance_pct }));
    pointColors = points.map(p => scoreCol(p.y));
    color = '#3b82f6'; unit = '%'; yMin = 0; yMax = 100;
  } else {
    const data = dedupeByDate([...(wd.cycles || [])].filter(c => c.strain != null).sort((a,b) => a.date.localeCompare(b.date))).slice(-7);
    points = data.map(c => ({ x: new Date(c.date + 'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'}), y: Math.round(c.strain * 10) / 10 }));
    const strainCol = v => v >= 18 ? '#dc2626' : v >= 14 ? '#f59e0b' : v >= 8 ? '#16a34a' : v >= 4 ? '#3b82f6' : '#6b7280';
    pointColors = points.map(p => strainCol(p.y));
    color = '#f59e0b'; unit = ''; yMin = 0; yMax = 21;
    // Alerte surcharge intégrée
    const cy0 = wd?.cycles?.[0];
    const r0 = wd?.recoveries?.[0];
    if (alertEl) {
      if (cy0?.strain >= 14 && r0?.score != null && r0.score < 34) {
        alertEl.innerHTML = `<div style="font-size:11px;color:#991b1b;font-weight:600;padding:6px 10px;background:#fef2f2;border-radius:8px;border:1px solid #fca5a5;margin-bottom:6px;">⚠️ Effort élevé avec récupération faible — privilégie du repos.</div>`;
        alertEl.style.display = 'block';
      } else { alertEl.style.display = 'none'; }
    }
  }

  if (!points || !points.length) return;

  _whoopChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: points.map(p => p.x),
      datasets: [{ data: points.map(p => p.y), borderColor: 'rgba(150,150,150,0.45)', backgroundColor: 'rgba(150,150,150,0.07)', borderWidth: 2.5, pointBackgroundColor: pointColors, pointBorderColor: '#fff', pointBorderWidth: 1.5, pointRadius: 5, pointHoverRadius: 7, fill: true, tension: 0.35 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.raw + unit } } },
      scales: {
        x: { ticks: { color: isDark ? '#888' : '#999', font: { size: 9 } }, grid: { display: false } },
        y: { min: yMin, max: yMax, ticks: { color: isDark ? '#888' : '#999', font: { size: 9 }, callback: v => v + unit }, grid: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' } }
      }
    },
    plugins: [{ id: 'ptLabels', afterDatasetsDraw(chart) {
      const ctx = chart.ctx, area = chart.chartArea;
      const positions = chart.getDatasetMeta(0).data.map((pt, i) => ({ x: pt.x, baseY: pt.y, y: pt.y - 22, above: true, val: points[i].y, col: pointColors[i] })).filter(p => p.val != null);
      for (let i = 1; i < positions.length; i++) {
        const prev = positions[i-1], cur = positions[i];
        if (Math.abs(cur.x - prev.x) < 48) { cur.above = !prev.above; } else { cur.above = true; }
        cur.y = cur.above ? cur.baseY - 22 : cur.baseY + 8;
      }
      positions.forEach(({ x, y, val, col }) => {
        ctx.save(); ctx.font = '600 9px -apple-system,sans-serif';
        const text = String(val), tw = ctx.measureText(text).width, pw = tw + 10, ph = 16, r = 8;
        let tx = x;
        if (tx - pw/2 < area.left) tx = area.left + pw/2;
        if (tx + pw/2 > area.right) tx = area.right - pw/2;
        const ty = Math.max(area.top + 2, y);
        ctx.beginPath(); ctx.roundRect(tx-pw/2, ty, pw, ph, r);
        ctx.fillStyle = isDark ? 'rgba(30,30,46,0.92)' : 'rgba(255,255,255,0.95)'; ctx.fill();
        ctx.strokeStyle = col + '66'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text, tx, ty + ph/2); ctx.restore();
      });
    }}]
  });

  if (alertEl && mode !== 'strain') alertEl.style.display = 'none';
}

function switchUnifiedChart(mode) {
  _whoopChartMode = mode;
  const tabColors = { fc: '#E24B4A', hrv: '#8b5cf6', recovery: '#22c55e', sleep: '#3b82f6', strain: '#f59e0b' };
  Object.entries(tabColors).forEach(([k, col]) => {
    const t = document.getElementById('utab-' + k);
    if (!t) return;
    if (k === mode) { t.style.background = col; t.style.color = '#fff'; }
    else { t.style.background = 'var(--bg2)'; t.style.color = 'var(--muted)'; }
  });
  _renderUnifiedWhoopChart(mode);
}

// Compatibilité anciens appels (ne plus utiliser)
function switchWhoopChart(mode) { switchUnifiedChart(mode === 'hrv' ? 'hrv' : mode); }
function switchFcReposChart(type) { switchUnifiedChart(type === 'vfc' ? 'hrv' : 'fc'); }

let curRenfo=1;
let affutageMode=false;

function toggleAffutageMode(){
  affutageMode=!affutageMode;
  const btn=document.getElementById('affutage-toggle');
  const sub=document.getElementById('renfo-subtitle');
  if(btn){
    btn.style.background=affutageMode?'#FF6B35':'transparent';
    btn.style.color=affutageMode?'#fff':'#FF6B35';
  }
  if(sub) sub.textContent=affutageMode?'Mode affûtage · S'+CW+' · 3 dernières semaines':'2 séances / semaine · Prescrit par kiné';
  updateRenfoTabs();
  curRenfo=1;
  renderRenfoExercises();
}

function updateRenfoTabs(){
  const t1=document.getElementById('renfo-tab-1');
  const t2=document.getElementById('renfo-tab-2');
  if(!t1||!t2) return;
  if(affutageMode){
    const ps1=t1.querySelectorAll('p');
    if(ps1[0]) ps1[0].textContent='Échauffement';
    if(ps1[1]) ps1[1].textContent='Avant chaque sortie · 5 exos';
    const ps2=t2.querySelectorAll('p');
    if(ps2[0]) ps2[0].textContent='Séance unique';
    if(ps2[1]) ps2[1].textContent='1 fois / semaine · 7 exos';
  } else {
    [1,2].forEach(x=>{
      const t=document.getElementById('renfo-tab-'+x);
      if(!t) return;
      const prog=getRenfoData(x);
      const ps=t.querySelectorAll('p');
      if(ps[0]) ps[0].textContent=prog.name;
      if(ps[1]) ps[1].textContent=prog.sub;
    });
  }
  // Highlight active tab
  [1,2].forEach(x=>{
    const t=document.getElementById('renfo-tab-'+x);
    if(!t) return;
    const active=x===curRenfo;
    t.style.background=active?'#1B4FD8':'var(--bg2)';
    t.style.border=active?'none':'1px solid var(--border)';
    const ps=t.querySelectorAll('p');
    if(ps[0]) ps[0].style.color=active?'#fff':'var(--text)';
    if(ps[1]) ps[1].style.color=active?'rgba(255,255,255,0.8)':'var(--muted)';
  });
}

function initAffutageBtn(){
  const btn=document.getElementById('affutage-toggle');
  if(!btn) return;
  const isAff=isAffutageWeek();
  btn.style.display=isAff?'block':'none';
  // Activer automatiquement le mode affûtage en S30-S32
  if(isAff&&!affutageMode){
    affutageMode=true;
    btn.style.background='#FF6B35';
    btn.style.color='#fff';
    const sub=document.getElementById('renfo-subtitle');
    if(sub) sub.textContent='Mode affûtage · S'+CW+' · 3 dernières semaines';
    updateRenfoTabs();
    // Précharger toutes les images affûtage en avance
    [...renfoEchauffement,...renfoAffutageUnique].forEach(ex=>{if(ex.img){const i=new Image();i.src=ex.img;}});
  }
}
let _fcReposChartType = 'fc';

function renderFcReposChart(){
  const isDark=window.matchMedia('(prefers-color-scheme:dark)').matches;
  const rhrColor2 = v => v <= 50 ? '#16a34a' : v <= 60 ? '#ca8a04' : '#dc2626';
  const vfcColor  = v => v >= 85  ? '#16a34a' : v >= 60  ? '#ca8a04' : '#dc2626';
  const isVfc = _fcReposChartType === 'vfc';

  const kpiRow = document.getElementById('fc-repos-kpi-row');
  const canvas  = document.getElementById('chart-whoop-unified');
  const detail  = document.getElementById('fc-repos-detail');
  const trendEl = document.getElementById('fc-repos-trend');

  // ── Mode FC repos ─────────────────────────────────────────────────────────
  if (!isVfc) {
    let allFc = [];
    Object.keys(state).forEach(k=>{
      if(k.match(/^fc_repos_\d{4}-\d{2}-\d{2}$/)){
        const val=parseInt(state[k]);
        if(val>=30&&val<=100) allFc.push({date:k.replace('fc_repos_',''),val});
      }
    });
    allFc.sort((a,b)=>a.date.localeCompare(b.date));

    // Tendance vs moyenne 7j précédents
    const fcToday=allFc.length?allFc[allFc.length-1].val:null;
    const fc7prev=allFc.slice(-8,-1);
    const fcAvg7=fc7prev.length?Math.round(fc7prev.reduce((s,e)=>s+e.val,0)/fc7prev.length):null;
    const fcTrend=fcToday!=null&&fcAvg7!=null
      ?(fcToday<=fcAvg7-2?'↓ forme':fcToday>=fcAvg7+2?'↑ fatigue':'→ stable'):null;
    const fcTrendColor=fcTrend==='↓ forme'?'#16a34a':fcTrend==='↑ fatigue'?'#dc2626':'#ca8a04';

    const entries=allFc.slice(-7);
    if(entries.length===0){
      if(kpiRow)kpiRow.innerHTML='';
      if(_whoopChart){_whoopChart.destroy();_whoopChart=null;}
      if(canvas)canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
      if(trendEl)trendEl.style.display='none';
      if(detail)detail.innerHTML='<p style="font-size:13px;color:var(--muted);text-align:center;padding:20px;">Aucune donnée</p>';
      return;
    }
    const vals=entries.map(e=>e.val);
    const avg=Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
    const minV=Math.min(...vals), maxV=Math.max(...vals);
    const latest=fcToday??vals[vals.length-1];

    if(kpiRow)kpiRow.innerHTML=`
      <div style="background:var(--bg);border-radius:10px;padding:8px 12px;border:1px solid var(--border);display:flex;align-items:center;gap:0;justify-content:space-around;grid-column:1/-1;">
        <div style="text-align:center;flex:1;">
          <div style="font-size:18px;font-weight:800;color:${rhrColor2(latest)};line-height:1;">${latest}</div>
          <div style="font-size:9px;color:var(--muted);margin-top:2px;">Auj. bpm</div>
        </div>
        <div style="width:1px;height:28px;background:var(--border);"></div>
        <div style="text-align:center;flex:1;">
          <div style="font-size:18px;font-weight:800;color:${rhrColor2(avg)};line-height:1;">${avg}</div>
          <div style="font-size:9px;color:var(--muted);margin-top:2px;">Moy 7j</div>
        </div>
        <div style="width:1px;height:28px;background:var(--border);"></div>
        <div style="text-align:center;flex:1;">
          <div style="font-size:18px;font-weight:800;color:${rhrColor2(minV)};line-height:1;">${minV}</div>
          <div style="font-size:9px;color:var(--muted);margin-top:2px;">Min</div>
        </div>
      </div>`;

    // Tendance 30j
    const fc30=allFc.slice(-31,-1);
    if(trendEl&&fc30.length>=5){
      const fc30avg=Math.round(fc30.reduce((s,e)=>s+e.val,0)/fc30.length);
      const diff=latest-fc30avg;
      const col=diff<=-2?'#16a34a':diff>=2?'#dc2626':'#ca8a04';
      const msg=diff<=-2?`Ta FC repos a baissé de ${Math.abs(diff)} bpm vs ta moyenne 30j — bonne progression.`
        :diff>=2?`Ta FC repos a augmenté de ${diff} bpm vs ta moyenne 30j — signe de fatigue accumulée.`
        :`Ta FC repos est stable par rapport à ta moyenne 30j (${fc30avg} bpm).`;
      trendEl.innerHTML=`<div style="font-size:10px;color:${col};font-weight:500;margin-bottom:8px;">📈 ${msg}</div>`;
      trendEl.style.display='block';
    } else if(trendEl) trendEl.style.display='none';

    if(_whoopChart)_whoopChart.destroy();
    if(!canvas)return;
    const ptColors=vals.map(v=>rhrColor2(v));
    _whoopChart=new Chart(canvas,_fcLineConfig(entries,vals,'#E24B4A',ptColors,' bpm',isDark,Math.max(30,minV-5),maxV+5,v=>v+' bpm'));
    if(detail)detail.innerHTML='';

  // ── Mode VFC ──────────────────────────────────────────────────────────────
  } else {
    const wd=state.whoop_data;
    const recs=wd?[...(wd.recoveries||[])].filter(r=>r.hrv!=null).sort((a,b)=>a.date.localeCompare(b.date)).slice(-7):[];
    if(recs.length===0){
      if(kpiRow)kpiRow.innerHTML='';
      if(_whoopChart){_whoopChart.destroy();_whoopChart=null;}
      if(canvas)canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
      if(trendEl)trendEl.style.display='none';
      if(detail)detail.innerHTML='<p style="font-size:13px;color:var(--muted);text-align:center;padding:20px;">Aucune donnée VFC — synchronise WHOOP.</p>';
      return;
    }
    const entries=recs.map(r=>({date:r.date,val:Math.round(r.hrv)}));
    const vals=entries.map(e=>e.val);
    const avg=Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
    const minV=Math.min(...vals), maxV=Math.max(...vals);
    const latest=vals[vals.length-1];

    if(kpiRow)kpiRow.innerHTML=`
      <div style="background:var(--bg);border-radius:10px;padding:8px 12px;border:1px solid var(--border);display:flex;align-items:center;justify-content:space-around;grid-column:1/-1;">
        <div style="text-align:center;flex:1;">
          <div style="font-size:18px;font-weight:800;color:${vfcColor(latest)};line-height:1;">${latest}</div>
          <div style="font-size:9px;color:var(--muted);margin-top:2px;">Auj. ms</div>
        </div>
        <div style="width:1px;height:28px;background:var(--border);"></div>
        <div style="text-align:center;flex:1;">
          <div style="font-size:18px;font-weight:800;color:${vfcColor(avg)};line-height:1;">${avg}</div>
          <div style="font-size:9px;color:var(--muted);margin-top:2px;">Moy 7j</div>
        </div>
        <div style="width:1px;height:28px;background:var(--border);"></div>
        <div style="text-align:center;flex:1;">
          <div style="font-size:18px;font-weight:800;color:${vfcColor(minV)};line-height:1;">${minV}</div>
          <div style="font-size:9px;color:var(--muted);margin-top:2px;">Min</div>
        </div>
      </div>`;
    if(trendEl)trendEl.style.display='none';
    if(_whoopChart)_whoopChart.destroy();
    if(!canvas)return;
    const ptColors=vals.map(v=>vfcColor(v));
    _whoopChart=new Chart(canvas,_fcLineConfig(entries,vals,'#8b5cf6',ptColors,' ms',isDark,Math.max(0,minV-10),maxV+10,v=>v+' ms'));
    if(detail)detail.innerHTML='';
  }
}

function _fcLineConfig(entries,vals,color,ptColors,unit,isDark,yMin,yMax,yCallback){
  return {
    type:'line',
    data:{
      labels:entries.map(e=>{const d=new Date(e.date+'T12:00:00');return d.toLocaleDateString('fr-FR',{day:'numeric',month:'short'});}),
      datasets:[{
        data:vals,
        borderColor:'rgba(150,150,150,0.45)',
        backgroundColor:'rgba(150,150,150,0.07)',
        borderWidth:2.5,
        pointBackgroundColor:ptColors,
        pointBorderColor:'#fff',
        pointBorderWidth:1.5,
        pointRadius:5,
        pointHoverRadius:7,
        fill:true,
        tension:0.35
      }]
    },
    plugins:[{
      id:'fcLabels',
      afterDatasetsDraw(chart){
        const ctx=chart.ctx, area=chart.chartArea;
        const positions=chart.data.datasets[0]&&chart.getDatasetMeta(0).data.map((pt,i)=>({
          x:pt.x, baseY:pt.y, y:pt.y-22, above:true, val:vals[i], col:ptColors[i]
        })).filter(p=>p.val!=null);
        for(let i=1;i<positions.length;i++){
          const prev=positions[i-1],cur=positions[i];
          if(Math.abs(cur.x-prev.x)<48){cur.above=!prev.above;}else{cur.above=true;}
          cur.y=cur.above?cur.baseY-22:cur.baseY+8;
        }
        positions.forEach(({x,y,val,col})=>{
          ctx.save();
          ctx.font='600 9px -apple-system,sans-serif';
          const text=String(val);
          const tw=ctx.measureText(text).width;
          const pw=tw+10,ph=16,r=8;
          let tx=x;
          if(tx-pw/2<area.left)tx=area.left+pw/2;
          if(tx+pw/2>area.right)tx=area.right-pw/2;
          const ty=Math.max(area.top+2,y);
          ctx.beginPath();ctx.roundRect(tx-pw/2,ty,pw,ph,r);
          ctx.fillStyle=isDark?'rgba(30,30,46,0.92)':'rgba(255,255,255,0.95)';
          ctx.fill();
          ctx.strokeStyle=col+'66';ctx.lineWidth=1.2;ctx.stroke();
          ctx.fillStyle=col;ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.fillText(text,tx,ty+ph/2);
          ctx.restore();
        });
      }
    }],
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.raw+unit}}},
      scales:{
        x:{ticks:{color:isDark?'#888':'#666',font:{size:9}},grid:{display:false},border:{display:false}},
        y:{min:yMin,max:yMax,ticks:{color:isDark?'#888':'#666',font:{size:9},callback:yCallback},grid:{color:isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)'},border:{display:false}}
      }
    }
  };
}


function switchRenfo(n){
  curRenfo=n;
  updateRenfoTabs();
  renderRenfoExercises();
}

function toggleRenfoSkip(){
  const skipKey='rf'+CW+'skip';
  if(state[skipKey]){
    delete state[skipKey];
  } else {
    state[skipKey]=true;
    // Effacer les progressions déjà enregistrées pour cette semaine si skip
    [1,2].forEach(r=>{
      const dk=rfk(CW,r);
      const exos=getRenfoData(r).exos;
      exos.forEach((_,i)=>delete state[dk+'e'+i+'_series']);
      delete state[dk+'done'];
    });
  }
  save();
  renderRenfoExercises();
  renderHome();
}

function renderRenfoExercises(){
  let exos, dkSlot;
  if(affutageMode){
    exos=curRenfo===1?renfoEchauffement:renfoAffutageUnique;
    // Échauffement : clé quotidienne (réinitialisation par jour de sortie)
    if(curRenfo===1){const n=new Date();dkSlot='a1_'+(n.getFullYear()*10000+(n.getMonth()+1)*100+n.getDate());}
    else dkSlot='a2';
  } else {
    const prog=getRenfoData(curRenfo);
    exos=prog.exos;
    dkSlot=curRenfo;
  }
  updateRenfoTabs();
  const el=document.getElementById('renfo-exercises');el.innerHTML='';

  // Bouton skip (admin only) — affiché sous les onglets
  let skipBtn=document.getElementById('renfo-skip-btn');
  if(!skipBtn && isAdmin()){                 // « pas de renfo cette semaine » : fonction admin, toutes prépas
    skipBtn=document.createElement('button');
    skipBtn.id='renfo-skip-btn';
    skipBtn.style.cssText='width:100%;padding:10px;background:transparent;border:1px dashed #aaa;border-radius:var(--radius);font-size:12px;color:var(--muted);cursor:pointer;margin-bottom:16px;';
    skipBtn.onclick=toggleRenfoSkip;
    const exArea=document.getElementById('renfo-exercises');
    exArea.parentNode.insertBefore(skipBtn, exArea);
  }
  const skipKey='rf'+CW+'skip';
  const isSkipped=!!state[skipKey];
  if(skipBtn){
    skipBtn.textContent=isSkipped?'↩ Réactiver le renfo S'+CW:'⏸ Pas de renfo cette semaine (S'+CW+')';
    skipBtn.style.borderColor=isSkipped?'#1B4FD8':'#aaa';
    skipBtn.style.color=isSkipped?'#1B4FD8':'var(--muted)';
  }

  // Si skip actif : afficher message et masquer le reste
  const renfoBanner=document.getElementById('renfo-done-banner');
  const renfoBtn=document.getElementById('renfo-btn');
  if(isSkipped){
    if(renfoBanner) renfoBanner.style.display='none';
    if(renfoBtn) renfoBtn.style.display='none';
    const cancelBtn2=document.getElementById('renfo-cancel-btn');
    if(cancelBtn2) cancelBtn2.style.display='none';
    el.innerHTML=`<div style="text-align:center;padding:32px 16px;color:var(--muted);">
      <div style="font-size:28px;margin-bottom:10px;">⏸</div>
      <p style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:6px;">Renfo désactivé — S${CW}</p>
      <p style="font-size:12px;">Profite de tes vacances, la reprise sera pour la semaine prochaine !</p>
    </div>`;
    return;
  }
  if(renfoBtn) renfoBtn.style.display='';
  const dk=rfk(CW,dkSlot),isDone=!!state[dk+'done'];
  const banner=document.getElementById('renfo-done-banner');
  banner.style.display=isDone?'flex':'none';
  const doneLabel=affutageMode?(curRenfo===1?'Échauffement':'Séance unique'):(getRenfoData(curRenfo).name);
  if(isDone)document.getElementById('renfo-done-text').textContent=`${doneLabel} validé — S${CW}`;
  const btn=document.getElementById('renfo-btn');
  btn.textContent=isDone?'Séance déjà validée':'Valider la séance';
  btn.style.background=isDone?'#639922':'#1B4FD8';
  let cancelBtn=document.getElementById('renfo-cancel-btn');
  if(!cancelBtn){
    cancelBtn=document.createElement('button');
    cancelBtn.id='renfo-cancel-btn';
    cancelBtn.style.cssText='width:100%;padding:11px;background:transparent;border:1px solid var(--border);border-radius:var(--radius);font-size:13px;color:var(--muted);cursor:pointer;margin-top:8px;';
    cancelBtn.textContent='Annuler la validation';
    cancelBtn.onclick=()=>{
      let _slot;if(affutageMode){if(curRenfo===1){const n=new Date();_slot='a1_'+(n.getFullYear()*10000+(n.getMonth()+1)*100+n.getDate());}else _slot='a2';}else _slot=curRenfo;
      const _exos=affutageMode?(curRenfo===1?renfoEchauffement:renfoAffutageUnique):getRenfoData(curRenfo).exos;
      const _dk=rfk(CW,_slot);
      _exos.forEach((_,i)=>{ delete state[_dk+'e'+i+'_series']; });
      delete state[_dk+'done'];
      save();
      renderRenfoExercises();
      renderHome();
    };
    btn.parentNode.appendChild(cancelBtn);
  }
  cancelBtn.style.display=isDone?'block':'none';

  exos.forEach((ex,i)=>{
    const nb=getNbSeries(ex.series);
    const doneSeries=state[dk+'e'+i+'_series']||0;
    const allDone=doneSeries>=nb;
    const div=document.createElement('div');

    if(affutageMode){
      div.style.cssText=`background:var(--bg);border:2px solid ${allDone?'#3B6D11':'var(--border)'};border-radius:var(--radius);overflow:hidden;transition:border-color 0.2s;`;
      const imgHtml=ex.img?`<div style="position:relative;background:#e8edf5;min-height:180px;overflow:hidden;"><img src="${ex.img}" alt="${ex.nom}" style="width:100%;display:block;opacity:0;transition:opacity 0.25s;" loading="eager" onload="this.style.opacity=1"></div>`:'';
      if(curRenfo===1){
        // Échauffement : cercles par série (3 séries)
        let seriesBtns='';
        for(let s=1;s<=nb;s++){
          const done=s<=doneSeries;
          seriesBtns+=`<button onclick="toggleSerie('${dk}','${i}',${s},${nb})" style="width:38px;height:38px;border-radius:50%;border:2px solid ${done?'#FF6B35':'var(--border)'};background:${done?'#FF6B35':'transparent'};color:${done?'#fff':'var(--muted)'};font-size:13px;font-weight:700;cursor:pointer;transition:all 0.15s;">${done?'✓':s}</button>`;
        }
        div.innerHTML=`${imgHtml}
        <div style="padding:12px 14px;">
          <p style="font-size:14px;font-weight:700;color:${allDone?'#3B6D11':'var(--text)'};margin-bottom:3px;">${ex.nom} ${allDone?'<span style="font-size:11px;color:#3B6D11;">✓</span>':''}</p>
          <p style="font-size:12px;color:var(--muted);margin-bottom:8px;line-height:1.4;">${ex.desc}</p>
          <span style="font-size:12px;font-weight:700;background:${allDone?'#EAF3DE':'#EEF2FD'};color:${allDone?'#27500A':'#1438A8'};padding:3px 10px;border-radius:20px;">${ex.series}</span>
          <div style="display:flex;gap:8px;align-items:center;margin-top:10px;">
            <span style="font-size:11px;color:var(--muted);">Séries :</span>
            ${seriesBtns}
          </div>
        </div>`;
      } else {
        // Séance unique : bouton toggle unique
        div.innerHTML=`${imgHtml}
        <div style="padding:12px 14px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
            <div style="flex:1;min-width:0;">
              <p style="font-size:14px;font-weight:700;color:${allDone?'#3B6D11':'var(--text)'};margin-bottom:3px;">${ex.nom}</p>
              <p style="font-size:12px;color:var(--muted);margin-bottom:8px;line-height:1.4;">${ex.desc}</p>
              <span style="font-size:12px;font-weight:700;background:${allDone?'#EAF3DE':'#EEF2FD'};color:${allDone?'#27500A':'#1438A8'};padding:3px 10px;border-radius:20px;">${ex.series}</span>
            </div>
            <button onclick="toggleAffutageExo('${dk}','${i}',${nb})" style="flex-shrink:0;width:48px;height:48px;border-radius:50%;border:none;background:${allDone?'#3B6D11':'var(--bg2)'};color:${allDone?'#fff':'var(--muted)'};font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s;">${allDone?'✓':'○'}</button>
          </div>
        </div>`;
      }
    } else {
      // Mode normal : boutons par série
      div.style.cssText=`background:var(--bg);border:1px solid ${allDone?'#3B6D11':'var(--border)'};border-radius:var(--radius);padding:12px 14px;`;
      let seriesBtns='';
      for(let s=1;s<=nb;s++){
        const done=s<=doneSeries;
        seriesBtns+=`<button onclick="toggleSerie('${dk}','${i}',${s},${nb})" style="width:32px;height:32px;border-radius:50%;border:2px solid ${done?'#1B4FD8':'var(--border)'};background:${done?'#1B4FD8':'transparent'};color:${done?'#fff':'var(--muted)'};font-size:12px;font-weight:700;cursor:pointer;transition:all 0.15s;">${done?'✓':s}</button>`;
      }
      div.innerHTML=`<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">
        <div style="flex:1;min-width:0;">
          <p style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:3px;${allDone?'opacity:0.5;':''}">${ex.nom} ${allDone?'<span style="font-size:11px;color:#3B6D11;">✓ terminé</span>':''}</p>
          <p style="font-size:12px;color:var(--muted);margin-bottom:5px;${allDone?'opacity:0.5;':''}">${ex.desc}</p>
          <span style="font-size:11px;background:#EEF2FD;color:#1438A8;padding:2px 8px;border-radius:20px;font-weight:600;">${ex.series}</span>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <span style="font-size:11px;color:var(--muted);margin-right:2px;">Séries :</span>
        ${seriesBtns}
        ${doneSeries>0&&!allDone?`<span style="font-size:11px;color:#1B4FD8;font-weight:600;">${doneSeries}/${nb}</span>`:''}
      </div>`;
    }
    el.appendChild(div);
  });

  // Check if all exercises done → auto-suggest validate
  const allComplete=exos.every((_,i)=>{
    const nb=getNbSeries(exos[i].series);
    return (state[dk+'e'+i+'_series']||0)>=nb;
  });
  if(allComplete&&!isDone){
    state[dk+'done']=true;
    save();
    renderRenfoExercises();
    renderHome();
    return;
  }
}

function toggleAffutageExo(dk,exoIdx,nb){
  const key=dk+'e'+exoIdx+'_series';
  const isDone=(state[key]||0)>=nb;
  if(isDone){ delete state[key]; } else { state[key]=nb; }
  save();
  renderRenfoExercises();
}

function toggleSerie(dk,exoIdx,serieNum,total){
  const key=dk+'e'+exoIdx+'_series';
  const current=state[key]||0;
  // Click on already done serie = reset to serie-1
  if(serieNum<=current){
    state[key]=serieNum-1;
  } else {
    state[key]=serieNum;
  }
  if(state[key]<=0) delete state[key];
  save();
  renderRenfoExercises();
}

function markRenfoDone(){
  let exos,slot;
  if(affutageMode){
    exos=curRenfo===1?renfoEchauffement:renfoAffutageUnique;
    if(curRenfo===1){const n=new Date();slot='a1_'+(n.getFullYear()*10000+(n.getMonth()+1)*100+n.getDate());}else slot='a2';
  } else {
    exos=curRenfo===1?renfo1:renfo2;
    slot=curRenfo;
  }
  const dk=rfk(CW,slot);
  exos.forEach((_,i)=>{
    const nb=getNbSeries(exos[i].series);
    state[dk+'e'+i+'_series']=nb;
  });
  state[dk+'done']=true;
  save();
  renderRenfoExercises();
  renderHome();
}

// Date du jour sur accueil
const now = new Date();
const joursArr = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
const moisFrArr = ['jan','fév','mar','avr','mai','juin','juil','août','sep','oct','nov','déc'];
const todayEl = document.getElementById('today-date');
if(todayEl) todayEl.textContent = joursArr[now.getDay()]+' '+now.getDate()+' '+moisFrArr[now.getMonth()]+' '+now.getFullYear();

initFirebase();


function showScreen(name, renfoTab){
  ['home','plan','renfo','stats','coach','compte'].forEach(s=>{
    const el=document.getElementById('sc-'+s);
    if(el) el.style.display=s===name?(s==='coach'?'flex':'block'):'none';
    const btn=document.getElementById('nav-'+s);
    if(btn) btn.className='nav-btn'+(s===name?' active':'');
  });
  if(name==='home'){homeViewWeek=getEffectiveCW();renderHome();window.scrollTo({top:0,behavior:'instant'});}
  if(name==='coach'){
    const badge=document.getElementById('coach-alert-badge');
    if(badge) badge.style.display='none';
    window._coachHasUnread = false;
    if(dbRef) dbRef.child('_coach_unread').set(false);
  }
  if(name==='plan'){
    if(!rendered.plan){
      rendered.plan=true;
      renderPlan();
      requestAnimationFrame(()=>requestAnimationFrame(scrollToCurrentWeek));
    } else {
      setTimeout(scrollToCurrentWeek, 50);
    }
  }
  if(name==='stats'){
    rendered.stats=true;
    if(typeof statsTabInit==='function') statsTabInit();   // dernier onglet ouvert (Forme / Entraînement / Historique)
    setTimeout(renderStats,50);
    window.scrollTo({top:0,behavior:'instant'});
    // Auto-sync WHOOP si données > 5 min (syncWhoopFresh ne clear pas state.whoop_data en cas d'erreur)
    if(typeof syncWhoopFresh === 'function' && state.whoop_token?.access_token && !_whoopSyncing) {
      const updatedAt = state.whoop_data?.updatedAt ? new Date(state.whoop_data.updatedAt) : null;
      const minAgo = updatedAt ? (Date.now() - updatedAt.getTime()) / 60000 : Infinity;
      if(minAgo > 5) syncWhoopFresh();
    }
  }
  if(name==='renfo'){
    if(!rendered.renfo)rendered.renfo=true;
    initAffutageBtn();
    if(renfoTab&&renfoTab!==curRenfo) switchRenfo(renfoTab);
    else renderRenfoExercises();
  }
  if(name==='coach'){
    loadCoachHistory();
    if(typeof coachModeInit==='function') coachModeInit();   // « Coach » ou « Mon plan » (plan-chat.js)
  }
  if(name==='compte'){
    renderCompteScreen();
    window.scrollTo({top:0,behavior:'instant'});
  }
}

// ── CORRECTION AUTOMATIQUE DES ACCENTS ──────────────────────────────────────
function fixAccents(text) {
  let result = text;

  // ── Étape 1 : apostrophes courbes → droites
  result = result.replace(/[\u2018\u2019]/g, "'");

  // ── Étape 2 : mots collés sans apostrophe (ex: cetait, dhier, leffort)
  // On utilise une simple map et replace sur mot exact (insensible casse)
  const apos = [
    ["cetait",   "c'était"],   ["cetaient",  "c'étaient"],
    ["cest",     "c'est"],     ["cestait",   "c'était"],
    ["jai",      "j'ai"],      ["javais",    "j'avais"],
    ["jallais",  "j'allais"],  ["jirais",    "j'irais"],
    ["aujourdhui","aujourd'hui"],
    ["leffort",  "l'effort"],  ["lallure",   "l'allure"],
    ["lenergie", "l'énergie"], ["lobjectif", "l'objectif"],
    ["lentrainement","l'entraînement"],
    ["lorganisme","l'organisme"], ["lideal",  "l'idéal"],
    ["lidee",    "l'idée"],    ["lefficacite","l'efficacité"],
    ["dhier",    "d'hier"],    ["dabord",    "d'abord"],
    ["dune",     "d'une"],     ["dun",       "d'un"],
    ["dautant",  "d'autant"],  ["dailleurs", "d'ailleurs"],
    ["daccord",  "d'accord"],  ["dentrainement","d'entraînement"],
    ["nest",     "n'est"],     ["quil",      "qu'il"],
    ["quon",     "qu'on"],     ["sest",      "s'est"],
    ["sil",      "s'il"],
  ];
  apos.forEach(([bad, good]) => {
    // Remplace le mot entier, insensible à la casse, préserve majuscule initiale
    result = result.replace(new RegExp('(?<![a-zA-ZÀ-ÿ])' + bad + '(?![a-zA-ZÀ-ÿ])', 'gi'), (m) =>
      m[0] === m[0].toUpperCase() ? good.charAt(0).toUpperCase() + good.slice(1) : good
    );
  });

  // ── Étape 3 : accents manquants
  // Ça/ca : traitement séparé pour éviter les bugs de casse
  result = result.replace(/\bCa\b/g, "Ça");
  result = result.replace(/\bca\b/g, "ça");

  const acc = [
    // (Ca/ca traités séparément au-dessus)
    // Très / tres
    ["\\btres\\b", "très"],
    // Après / apres
    ["\\bapres\\b","après"],
    // Récupérer et dérivés
    ["\\brecuperer\\b",    "récupérer"],
    ["\\brecuperation\\b", "récupération"],
    ["\\brecupere\\b",     "récupère"],
    ["\\brecuperes\\b",    "récupères"],
    ["\\brecupere\\b",     "récupéré"],
    // Séance / séances
    ["\\bseance\\b",  "séance"],
    ["\\bseances\\b", "séances"],
    // Décharge
    ["\\bdecharge\\b",  "décharge"],
    ["\\bdecharger\\b", "décharger"],
    // Bénéfice
    ["\\bbenefice\\b",  "bénéfice"],
    ["\\bbenefices\\b", "bénéfices"],
    // Progrès
    ["\\bprogres\\b", "progrès"],
    // Légère / léger
    ["\\blegere\\b",  "légère"],
    ["\\blegeres\\b", "légères"],
    ["\\bleger\\b",   "léger"],
    ["\\blegers\\b",  "légers"],
    // Fatigué
    ["\\bfatigue\\b(?!\\s*(musculaire|cardiaque|de|du|des))", "fatigué"],
    ["\\bfatigues\\b", "fatigués"],
    ["\\bfatiguee\\b", "fatiguée"],
    // Énergie
    ["\\benergie\\b",  "énergie"],
    ["\\benergies\\b", "énergies"],
    // Entraînement
    ["\\bentrainement\\b", "entraînement"],
    ["\\bentrainer\\b",    "entraîner"],
    // Préparation
    ["\\bpreparation\\b", "préparation"],
    ["\\bpreparer\\b",    "préparer"],
    ["\\bprepare\\b",     "prépare"],
    // Améliorer
    ["\\bameliorer\\b",    "améliorer"],
    ["\\bamelioration\\b", "amélioration"],
    ["\\bameliore\\b",     "amélioré"],
    // Réaliser
    ["\\brealiser\\b", "réaliser"],
    ["\\brealise\\b",  "réalisé"],
    // Réduire
    ["\\breduire\\b", "réduire"],
    ["\\breduit\\b",  "réduit"],
    // Éviter
    ["\\beviter\\b", "éviter"],
    ["\\bevite\\b",  "évite"],
    // Gérer
    ["\\bgerer\\b", "gérer"],
    ["\\bgere\\b",  "gère"],
    // Prévu
    ["\\bprevu\\b",  "prévu"],
    ["\\bprevue\\b", "prévue"],
    ["\\bprevus\\b", "prévus"],
    // Également
    ["\\begalement\\b", "également"],
    // Intensité / difficulté / capacité
    ["\\bintensite\\b",   "intensité"],
    ["\\bdifficulte\\b",  "difficulté"],
    ["\\bcapacite\\b",    "capacité"],
    ["\\bregularite\\b",  "régularité"],
    // Côté
    ["\\bcote\\b", "côté"],
    // Été (passé)
    ["\\bete\\b(?=\\s|$|[.,!?])", "été"],
    // Répétition
    ["\\brepetition\\b",  "répétition"],
    ["\\brepetitions\\b", "répétitions"],
    // Résister
    ["\\bresister\\b", "résister"],
    ["\\bresiste\\b",  "résiste"],
    // Vérifier
    ["\\bverifier\\b", "vérifier"],
    ["\\bverifie\\b",  "vérifie"],
    // Maîtrise
    ["\\bmaitrise\\b", "maîtrise"],
    // Départ / arrivée
    ["\\bdepart\\b",   "départ"],
    ["\\bdeparts\\b",  "départs"],
    ["\\barrivee\\b",  "arrivée"],
    ["\\barrivees\\b", "arrivées"],
    // Préférer
    ["\\bpreferes\\b", "préfères"],
    ["\\bprefere\\b",  "préfère"],
    ["\\bpreferer\\b", "préférer"],
    ["\\bpreferable\\b","préférable"],
    // Tôt / tard
    ["\\btot\\b", "tôt"],
    // Problème
    ["\\bprobleme\\b",  "problème"],
    ["\\bproblemes\\b", "problèmes"],
    // Dernière
    ["\\bderniere\\b",  "dernière"],
    ["\\bdernieres\\b", "dernières"],
    ["\\bdernier\\b",   "dernier"],
    ["\\bderniers\\b",  "derniers"],
    // Nécessaire
    ["\\bnecessaire\\b",  "nécessaire"],
    ["\\bnecessaires\\b", "nécessaires"],
    // Décaler / déplacer
    ["\\bdecaler\\b",   "décaler"],
    ["\\bdecale\\b",    "décalé"],
    ["\\bdecalee\\b",   "décalée"],
    ["\\bdeplacer\\b",  "déplacer"],
    ["\\bdeplacement\\b","déplacement"],
    // Enchaîner
    ["\\benchaîner\\b", "enchaîner"],
    ["\\benchainer\\b", "enchaîner"],
    ["\\benchainement\\b","enchaînement"],
    // Hydraté
    ["\\bhydrate\\b",   "hydraté"],
    ["\\bhydratee\\b",  "hydratée"],
    ["\\bhydrater\\b",  "hydrater"],
    ["\\bhydratation\\b","hydratation"],
    // Était / étaient
    ["\\betait\\b",    "était"],
    ["\\betaient\\b",  "étaient"],
    // Régulier
    ["\\bregulier\\b",   "régulier"],
    ["\\breguliers\\b",  "réguliers"],
    ["\\breguliere\\b",  "régulière"],
    ["\\brégulieres\\b", "régulières"],
    // Objectif / spécifique
    ["\\bspecifique\\b",  "spécifique"],
    ["\\bspecifiques\\b", "spécifiques"],
    // Compléter / réussir
    ["\\bcompleter\\b",  "compléter"],
    ["\\bcomplete\\b",   "complète"],
    ["\\breussir\\b",    "réussir"],
    ["\\breussi\\b",     "réussi"],
    ["\\breussie\\b",    "réussie"],
    // Créneau / période
    ["\\bcreneau\\b",  "créneau"],
    ["\\bcréneaux\\b", "créneaux"],
    ["\\bperiode\\b",  "période"],
    ["\\bperiodes\\b", "périodes"],
    // Idéal
    ["\\bideal\\b",  "idéal"],
    ["\\bideale\\b", "idéale"],
    // Protéger / blesser
    ["\\bproteger\\b",  "protéger"],
    ["\\bprotege\\b",   "protège"],
    ["\\bblessure\\b",  "blessure"],
    ["\\bblessures\\b", "blessures"],
    // Récent / passé
    ["\\brecent\\b",   "récent"],
    ["\\brecente\\b",  "récente"],
    ["\\brecents\\b",  "récents"],
    ["\\brecentes\\b", "récentes"],
    ["\\bpasse\\b(?!\\s*partout)",    "passé"],
    ["\\bpassee\\b",   "passée"],
    // Méfier / méfiance
    ["\\bmefie\\b",    "méfie"],
    ["\\bmefier\\b",   "méfier"],
    // Allégé / allegé
    ["\\ballege\\b",   "allégé"],
    ["\\ballegee\\b",  "allégée"],
    ["\\balleger\\b",  "alléger"],
    // Numéro / numéros
    ["\\bnumero\\b",   "numéro"],
    ["\\bnumeros\\b",  "numéros"],
    // Réparer / reprendre
    ["\\breprendre\\b","reprendre"],
    ["\\breprise\\b",  "reprise"],
    // Résultat
    ["\\bresultat\\b",  "résultat"],
    ["\\bresultats\\b", "résultats"],
    // Élément
    ["\\belement\\b",  "élément"],
    ["\\belements\\b", "éléments"],
    // Immédiatement / immédiat
    ["\\bimmediatement\\b","immédiatement"],
    ["\\bimmédiat\\b",     "immédiat"],
    // Même
    ["\\bmeme\\b",  "même"],
    ["\\bmemes\\b", "mêmes"],
    // Système
    ["\\bsysteme\\b",  "système"],
    ["\\bsystemes\\b", "systèmes"],
    // Être (collé : detre, assure-toi detre)
    ["\\bdetre\\b",    "d'être"],
    ["\\bpeutre\\b",   "peut-être"],
    // Féliciter / félicitations
    ["\\bfeliciter\\b",      "féliciter"],
    ["\\bfelicite\\b",       "félicite"],
    ["\\bfelicitations\\b",  "félicitations"],
    // Télécharger / accéder
    ["\\btelecharger\\b", "télécharger"],
    ["\\bacceder\\b",     "accéder"],
    // Créer / générer
    ["\\bcreer\\b",  "créer"],
    ["\\bcree\\b",   "créé"],
    ["\\bcreee\\b",  "créée"],
    // Début / fin
    ["\\bdebut\\b",  "début"],
    ["\\bdebuts\\b", "débuts"],
    // Arrêter / arrêt
    ["\\barreter\\b", "arrêter"],
    ["\\barrete\\b",  "arrête"],
    ["\\barret\\b",   "arrêt"],
    // Forêt / intérêt
    ["\\binteret\\b",  "intérêt"],
    ["\\binterets\\b", "intérêts"],
    // Côté / côte
    ["\\bcote\\b", "côté"],
    // Plutôt
    ["\\bplutot\\b", "plutôt"],
    // Grâce
    ["\\bgrace\\b", "grâce"],
    // Fenêtre / tête
    ["\\btete\\b",  "tête"],
    ["\\btetes\\b", "têtes"],
    ["\\betre\\b", "être"],
    ["\\bchargee\\b", "chargée"],
    ["\\bchargees\\b", "chargées"],
    ["\\bdonne\\b", "donne"], 
    ["\\bsuivi\\b", "suivi"],
    ["\\bpresent\\b", "présent"],
    ["\\bprecedent\\b", "précédent"],
    ["\\bprecedente\\b", "précédente"],
    ["\\bprochaine\\b", "prochaine"],
    ["\\binteressant\\b", "intéressant"],
    ["\\binteressante\\b", "intéressante"],
    ["\\bmerite\\b", "mérite"],
    ["\\bmeriter\\b", "mériter"],
    ["\\bgenere\\b", "génère"],
    ["\\bgeneralement\\b", "généralement"],
    ["\\bpeut-etre\\b", "peut-être"],
    ["\\bexagere\\b", "exagère"],
    ["\\bexagerer\\b", "exagérer"],
    ["\\bsucces\\b", "succès"],
    ["\\bregulierement\\b", "régulièrement"],
  ];
  acc.forEach(([pat, rep]) => {
    result = result.replace(new RegExp(pat, 'gi'), (m) =>
      // préserver majuscule si le mot original commençait par une majuscule
      m[0] === m[0].toUpperCase() && m[0].toLowerCase() !== m[0]
        ? rep.charAt(0).toUpperCase() + rep.slice(1)
        : rep
    );
  });

  return result;
}
// ── HISTORIQUE SÉANCES VALIDÉES ───────────────────────────────────────────────

// Nettoyer une réponse tronquée : retirer tout ce qui suit le dernier . ! ? ou bloc complet
function cleanTruncated(text) {
  if(!text) return text;
  const trimmed = text.trimEnd();
  // Si la réponse se termine par . ! ? → c'est complet
  if(/[.!?]\s*$/.test(trimmed)) return trimmed;
  // Chercher le dernier . ! ? et couper là
  const lastPunct = Math.max(
    trimmed.lastIndexOf('.'),
    trimmed.lastIndexOf('!'),
    trimmed.lastIndexOf('?')
  );
  if(lastPunct > trimmed.length * 0.4) {
    // Il y a une phrase complète dans les 60% finaux — couper proprement
    return trimmed.slice(0, lastPunct + 1).trimEnd();
  }
  return trimmed;
}

