function renderStats(){
  const isDark=window.matchMedia('(prefers-color-scheme:dark)').matches;
  if(chartKm)chartKm.destroy();
  renderFcReposChart();
  if(isAdmin()){ renderWhoopStats(); _initStatsPTR(); }
  renderSessionsHistory();
  const monthNames=['JANV.','FÉVR.','MARS','AVR.','MAI','JUIN','JUIL.','AOÛT','SEPT.','OCT.','NOV.','DÉC.'];

  let kmLabels, kmRealized, kmProjected, pointFillR, pointBorderR, pointRadiiR, pointRadiiP, yMax, eCW;

  if(isAdmin()){
    const cwDoneCount=weeks[CW-1].sessions.filter((_,si)=>state[gk(CW,si)+'done']||state[gk(CW,si)+'km']!=null).length;
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
        legend: { display: false },
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
  if(badge) badge.textContent = (isAdmin() ? getWeekTotalKm(CW) : getAthleteWeekKm(getEffectiveCW())) + ' km';
  // Badge record 10km (admin uniquement)
  const b10container = document.getElementById('badge-record10km')?.closest('div[onclick]');
  if(b10container) b10container.style.display = isAdmin() ? 'flex' : 'none';
  const b10 = document.getElementById('badge-record10km');
  if(b10 && isAdmin()) {
    const r10 = state['record_10km'];
    b10.textContent = r10 ? r10 + ' 10km' : '— 10km';
  }
  const sb=document.getElementById('shoes-bars');if(!sb) return;sb.innerHTML='';
  const dynamicShoes=getShoes();
  const shoeKm=[[16,46,69,87,110,126,142,157,174,192,211,228,247,267,287,305,325,346,367,386,396,416,439,459,479,488,498,508,516,533,541,546],[0,0,0,0,0,9,20,29,39,51,65,77,93,110,128,142,160,180,202,216,230,230,230,245,263,263,263,287,287,303,315,315],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,25,56,66,106,106,115,161]];
  const defaultNames=[P,S,Z];
  dynamicShoes.forEach((sh)=>{
    const defaultIdx=defaultNames.indexOf(sh.name);
    // Base = km cumulés FIN de la semaine précédente (CW-2)
    const baseKm=defaultIdx>=0?(shoeKm[defaultIdx][CW-2]||0):(state[`shoe_km_${sh.name}`]||0);
    // Ajouter les km réels des séances cochées cette semaine avec cette chaussure
    let thisWeekKm=0;
    getOrderedWeekSessions(CW).forEach(({s:s2,si,extra,ei})=>{
      if(s2.shoe===sh.name){
        if(extra){
          const done=!!state[`extra_w${CW}_s${ei}_done`];
          if(done){const _ekm=parseFloat(state[`extra_w${CW}_s${ei}_km`]);thisWeekKm+=(!isNaN(_ekm)&&state[`extra_w${CW}_s${ei}_km`]!=null)?_ekm:s2.km;}
        } else {
          const done=state[gk(CW,si)+'done']||state[gk(CW,si)+'km']!=null;
          if(done) thisWeekKm+=state[gk(CW,si)+'km']!=null?parseFloat(state[gk(CW,si)+'km']):s2.km;
        }
      }
    });
    const km=baseKm+thisWeekKm;
    const pct=Math.min(100,Math.round(km/sh.max*100));
    const row=document.createElement('div');
    row.style.cssText='margin-bottom:14px;';
    row.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <div style="display:flex;align-items:center;gap:8px;cursor:pointer;" onclick="openShoeHistory('${sh.name}')">
        <span style="width:10px;height:10px;border-radius:50%;background:${sh.color};display:inline-block;flex-shrink:0;"></span>
        <span style="font-size:13px;font-weight:600;color:var(--text);border-bottom:1px dashed var(--border);">${sh.name}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 14 14"/></svg>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:13px;color:var(--text);">${km} <span style="color:var(--muted);">/ ${sh.max} km</span></span>
        <div style="display:flex;gap:4px;">
          <button onclick="openEditShoeModal('${sh.name}')" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:2px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button onclick="deleteShoe('${sh.name}')" style="background:none;border:none;cursor:pointer;color:#E24B4A;padding:2px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>
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
  </button>`;
  // Tableau performances
  const pr=document.getElementById('perf-rows');
  if(pr){
    // Données de perf historiques S1-S6 (fallback si pas dans Firebase)
    const staticPerf={
      's1i0':{dur:'37:51',pace:'5:43',hr:158},
      's1i1':{dur:'45:31',pace:'5:41',hr:159},
      's1i2':{dur:'52:02',pace:'6:30',hr:139},
      's2i0':{dur:'59:24',pace:'6:36',hr:142},
      's2i1':{dur:'1:08:31',pace:'6:51',hr:149},
      's2i2':{dur:'1:16:09',pace:'6:55',hr:148},
      's3i0':{dur:'52:23',pace:'6:09',hr:156},
      's3i1':{dur:'52:33',pace:'6:56',hr:141},
      's3i2':{dur:'44:21',pace:'6:20',hr:145},
      's4i0':{dur:'1:00:10',pace:'6:40',hr:144},
      's4i2':{dur:'58:55',pace:'6:31',hr:152,date:'2026-04-04'},
      's5i0':{dur:'45:50',pace:'6:33',hr:146},
      's5i1':{dur:'41:03',pace:'5:52',hr:154},
      's5i2':{dur:'54:56',pace:'5:59',hr:159},
      's6i0':{dur:'51:30',pace:'6:26',hr:146},
      's6i1':{dur:'44:22',pace:'5:31',hr:162},
      's6i2':{dur:'56:39',pace:'6:17',hr:144},
    };
    const perfRows=[];
    for(let ws=1;ws<=CW;ws++){
      getOrderedWeekSessions(ws).forEach(({s,si,extra,ei})=>{
        if(s.type==='rest'||s.km===0) return;
        if(extra){
          // Séances ajoutées manuellement
          const k=`extra_w${ws}_s${ei}`;
          const done=!!state[k+'_done'];
          if(!done) return;
          const kmReal=state[k+'_km']!=null?state[k+'_km']:s.km;
          let perf={};try{perf=state[k+'_perf']?JSON.parse(state[k+'_perf']):{}}catch(e){}
          const c=typeColor[s.type]||'#888';
          const title=s.d.split('|')[0];
          perfRows.push({ws,si:ei,title,km:kmReal,perf,c,type:s.type,extra:true});
          return;
        }
        const k=gk(ws,si);
        const done=!!state[k+'done']||(ws<CW&&state[k+'km']!=null);
        if(!done) return;
        const kmReal=state[k+'km']!=null?state[k+'km']:s.km;
        let perf=staticPerf[k]||{};try{perf=state[k+'perf']?JSON.parse(state[k+'perf']):(staticPerf[k]||{});}catch(e){}
        const c=typeColor[s.type]||'#888';
        const title=s.d.split('|')[0];
        perfRows.push({ws,si,title,km:kmReal,perf,c,type:s.type});
      });
    }
    // Apply filter
    const filtered=perfFilter==='all'?perfRows:perfRows.filter(r=>r.type===perfFilter);
    const moisFr=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    perfRows.forEach(row=>{
      row.bg=typeBg[row.type]||'#f5f5f5';
      if(row.perf.date){
        const d=new Date(row.perf.date);
        row.month=moisFr[d.getMonth()];
      } else {
        row.month=weeks[row.ws-1].month;
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
      Object.entries(byMonth).forEach(([month,rows])=>{
        const totalKm=rows.reduce((a,r)=>a+Number(r.km),0);
        const hid='pm_'+month.replace(/[^a-zA-Z]/g,'_');
        const card=document.createElement('div');
        card.style.cssText='background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;';
        const detail=rows.map((row,i)=>`
          <div style="padding:10px 14px;${i<rows.length-1?'border-bottom:1px solid var(--border)':''};">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <span style="font-size:10px;font-weight:700;color:${row.c};background:${row.bg};padding:2px 7px;border-radius:20px;">S${row.ws} · ${typeLabel[row.type]||'EF'}</span>
              <span style="font-size:13px;font-weight:600;color:var(--text);">${row.title}</span>
            </div>
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
              if(strain) cols.push(`<div style="text-align:center;"><p style="font-size:10px;color:#7B5EA7;margin-bottom:2px;font-weight:600;">Charge</p><p style="font-size:14px;font-weight:700;color:#7B5EA7;">${strain}</p></div>`);
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
          </div>`).join('');
        card.innerHTML=`<div onclick="togglePerfMonth('${hid}')" style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;cursor:pointer;user-select:none;"><div style="display:flex;align-items:center;gap:8px;"><span style="font-size:12px;font-weight:700;color:var(--orange);text-transform:uppercase;letter-spacing:0.06em;">${month}</span><span style="font-size:11px;color:var(--muted);">${rows.length} séance${rows.length>1?'s':''}</span></div><div style="display:flex;align-items:center;gap:10px;"><span style="font-size:13px;font-weight:600;color:var(--text);">${Math.round(totalKm*10)/10} km</span><svg id="arr-${hid}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" style="transition:transform 0.2s;flex-shrink:0;"><polyline points="6 9 12 15 18 9"/></svg></div></div><div id="${hid}" style="display:none;border-top:1px solid var(--border);">${detail}</div>`;
        pr.appendChild(card);
      });
    }
  }

  const gr=document.getElementById('gels-rows');gr.innerHTML='';
  gels.forEach((g,i)=>{
    const row=document.createElement('div');
    row.style.cssText=`display:grid;grid-template-columns:72px 52px 1fr;padding:10px 12px;border-bottom:${i<gels.length-1?'1px solid var(--border)':'none'};`;
    row.innerHTML=`<span style="font-size:13px;color:var(--text);">${typeof g.km==='number'?g.km+' km':g.km}</span><span style="font-size:13px;font-weight:600;color:#1B4FD8;">${g.nb} gel${g.nb>1?'s':''}</span><span style="font-size:12px;color:var(--muted);">${g.t}</span>`;
    gr.appendChild(row);
  });
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
  const strainLabel = strainVal == null ? null : strainVal >= 18 ? 'Élevé' : strainVal >= 14 ? 'Modéré' : strainVal >= 8 ? 'Léger' : 'Repos';
  const strainLabelColor = strainVal == null ? 'var(--muted)' : strainVal >= 18 ? '#dc2626' : strainVal >= 14 ? '#f59e0b' : strainVal >= 8 ? '#22c55e' : '#3b82f6';
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
      sub: r0?.rhr ? `<span style="color:${rhrColor(r0.rhr)};font-weight:700;">${r0.rhr}</span> bpm repos` : (cy0?.avg_hr ? cy0.avg_hr + ' bpm moy' : ''),
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
      label: 'Charge',
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
      bg: isDark ? 'rgba(251,191,36,0.12)' : '#fefce8',
      border: isDark ? 'rgba(251,191,36,0.25)' : '#fde68a'
    }
  ];

  // ── Score synthétique du jour ──────────────────────────────────────────────
  const _calcSyntheticScore = (rRec, sSleep, fcV, fcArr) => {
    const sc = [];
    if (rRec?.score != null) sc.push(rRec.score);
    if (sSleep?.performance_pct != null) sc.push(sSleep.performance_pct);
    if (fcV != null) {
      const fcScore = fcV <= 44 ? 100
        : fcV <= 50 ? Math.round(100 - (fcV - 44) * 3)
        : fcV <= 60 ? Math.round(82 - (fcV - 50) * 3.7)
        : fcV <= 70 ? Math.round(45 - (fcV - 60) * 4.5)
        : 0;
      sc.push(fcScore);
    }
    if (rRec?.hrv != null) {
      const hrvScore = Math.max(0, Math.min(100, Math.round((rRec.hrv - 40) / 50 * 100)));
      sc.push(hrvScore);
    }
    return sc.length ? Math.round(sc.reduce((a,b)=>a+b,0)/sc.length) : null;
  };

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
        <div style="background:${isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)'};border:1px solid ${isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.07)'};border-radius:14px;padding:12px 16px;display:flex;align-items:center;gap:14px;margin-bottom:12px;">
          <div style="font-size:36px;font-weight:900;color:${col};line-height:1;">${avg}<span style="font-size:16px;">%</span></div>
          <div>
            <div style="font-size:13px;font-weight:700;color:${col};">${emoji} ${label}${trendHtml}</div>
            <div style="font-size:10px;color:var(--muted);margin-top:2px;">Score du jour · ${components.join(' + ')}</div>
            ${avg7jHtml}
          </div>
        </div>`;
      syntheticEl.style.display = 'block';
    } else {
      syntheticEl.style.display = 'none';
    }
  }

  document.getElementById('whoop-kpi-row').innerHTML = kpis.map(k => `
    <div style="background:${k.bg};border:1px solid ${k.border};border-radius:12px;padding:12px 10px;text-align:center;">
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
    const strainCol = v => v >= 18 ? '#dc2626' : v >= 14 ? '#f59e0b' : v >= 8 ? '#22c55e' : '#3b82f6';
    pointColors = points.map(p => strainCol(p.y));
    color = '#f59e0b'; unit = ''; yMin = 0; yMax = 21;
    // Alerte surcharge intégrée
    const cy0 = wd?.cycles?.[0];
    const r0 = wd?.recoveries?.[0];
    if (alertEl) {
      if (cy0?.strain >= 14 && r0?.score != null && r0.score < 34) {
        alertEl.innerHTML = `<div style="font-size:11px;color:#991b1b;font-weight:600;padding:6px 10px;background:#fef2f2;border-radius:8px;border:1px solid #fca5a5;margin-bottom:6px;">⚠️ Charge élevée avec récupération faible — privilégie du repos.</div>`;
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
      trendEl.innerHTML=`<div style="font-size:11px;color:${col};font-weight:600;margin-bottom:8px;">📈 ${msg}</div>`;
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
  [1,2].forEach(x=>{
    const t=document.getElementById('renfo-tab-'+x);
    if(!t) return;
    const prog=getRenfoData(x);
    const ps=t.querySelectorAll('p');
    if(ps[0]) ps[0].textContent=prog.name;
    if(ps[1]) ps[1].textContent=prog.sub;
    t.style.background=x===n?'#1B4FD8':'var(--bg2)';
    t.style.border=x===n?'none':'1px solid var(--border)';
    ps[0].style.color=x===n?'#fff':'var(--text)';
    ps[1].style.color=x===n?'rgba(255,255,255,0.8)':'var(--muted)';
  });
  renderRenfoExercises();
}

function renderRenfoExercises(){
  const prog=getRenfoData(curRenfo);
  const exos=prog.exos;
  // Mettre à jour les libellés des onglets avec les programmes sélectionnés
  [1,2].forEach(r=>{
    const t=document.getElementById('renfo-tab-'+r);
    if(!t) return;
    const prog=getRenfoData(r);
    const ps=t.querySelectorAll('p');
    if(ps[0]) ps[0].textContent=prog.name;
    if(ps[1]) ps[1].textContent=prog.sub;
  });
  const el=document.getElementById('renfo-exercises');el.innerHTML='';
  const dk=rfk(CW,curRenfo),isDone=!!state[dk+'done'];
  const banner=document.getElementById('renfo-done-banner');
  banner.style.display=isDone?'flex':'none';
  if(isDone)document.getElementById('renfo-done-text').textContent=`${prog.name} validé — S${CW}`;
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
      const exos=getRenfoData(curRenfo).exos;
      const dk=rfk(CW,curRenfo);
      exos.forEach((_,i)=>{ delete state[dk+'e'+i+'_series']; });
      delete state[dk+'done'];
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
    div.style.cssText=`background:var(--bg);border:1px solid ${allDone?'#3B6D11':'var(--border)'};border-radius:var(--radius);padding:12px 14px;`;

    // Series buttons
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
    el.appendChild(div);
  });

  // Check if all exercises done → auto-suggest validate
  const total=exos.length;
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
  const exos=curRenfo===1?renfo1:renfo2;
  const dk=rfk(CW,curRenfo);
  // Cocher toutes les séries automatiquement
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
    if(renfoTab&&renfoTab!==curRenfo) switchRenfo(renfoTab);
    else renderRenfoExercises();
  }
  if(name==='coach'){
    loadCoachHistory();
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
function renderSessionsHistory() {
  const container = document.getElementById('stats-sessions-section');
  if (!container) return;

  const sessions = [];
  const maxW = isAdmin() ? weeks.length : getAthleteMaxWeek();

  for (let ws = 1; ws <= maxW; ws++) {
    const weekSessions = weeks[ws-1]?.sessions || [];
    weekSessions.forEach((s, si) => {
      const k = gk(ws, si);
      if (!state[k+'done']) return;
      let perf = {}; try { perf = state[k+'perf'] ? JSON.parse(state[k+'perf']) : {}; } catch(e) {}
      sessions.push({ ws, type: s.type, title: s.d.split('|')[0],
        km: parseFloat(state[k+'km'] || s.km) || null,
        date: perf.date || null, pace: perf.pace || null, hr: perf.hr || null, whoop: perf.whoop || null });
    });
    let ei = 0;
    while (ei <= 20 && state[`extra_w${ws}_s${ei}`]) {
      if (state[`extra_w${ws}_s${ei}_done`]) {
        let es = {}; try { es = JSON.parse(state[`extra_w${ws}_s${ei}`] || '{}'); } catch(e) {}
        let perf = {}; try { perf = state[`extra_w${ws}_s${ei}_perf`] ? JSON.parse(state[`extra_w${ws}_s${ei}_perf`]) : {}; } catch(e) {}
        sessions.push({ ws, type: es.type, title: (es.d||'').split('|')[0] || 'Séance extra',
          km: parseFloat(state[`extra_w${ws}_s${ei}_km`] || es.km) || null,
          date: perf.date || null, pace: perf.pace || null, hr: perf.hr || null, whoop: perf.whoop || null });
      }
      ei++;
    }
  }

  sessions.sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date);
    return b.ws - a.ws;
  });

  if (sessions.length === 0) { container.innerHTML = ''; return; }

  const typeColors = { ef:'#3b82f6', tempo:'#f59e0b', frac:'#ef4444', sortie:'#22c55e', cac:'#8b5cf6', marathon:'#E8530A', repos:'#6b7280' };
  const typeLabels = { ef:'EF', tempo:'Tempo', frac:'Frac.', sortie:'SL', cac:'CAC', marathon:'Marathon', repos:'Repos' };
  const days = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const months = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'];

  function formatDate(d) {
    if (!d) return '';
    const dt = new Date(d + 'T12:00:00');
    return `${days[dt.getDay()]} ${dt.getDate()} ${months[dt.getMonth()]}`;
  }

  let html = '<p style="font-size:11px;font-weight:600;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase;margin-bottom:8px;">Séances validées</p>';
  html += '<div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;">';

  sessions.slice(0, 30).forEach((s, idx) => {
    const col = typeColors[s.type] || '#6b7280';
    const label = typeLabels[s.type] || (s.type||'?').toUpperCase().slice(0,3);
    const strain = s.whoop?.workout_strain ?? s.whoop?.cycle_strain ?? null;
    const strainColor = strain == null ? '#888' : strain >= 18 ? '#dc2626' : strain >= 14 ? '#f59e0b' : strain >= 10 ? '#22c55e' : '#6b7280';

    html += `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;${idx > 0 ? 'border-top:1px solid var(--border);' : ''}">`;
    html += `<span style="background:${col}20;color:${col};font-size:10px;font-weight:700;padding:3px 7px;border-radius:8px;flex-shrink:0;min-width:32px;text-align:center;">${label}</span>`;
    html += `<div style="flex:1;min-width:0;"><p style="font-size:12px;font-weight:600;color:var(--text);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.title}</p>`;
    const meta = [s.date ? formatDate(s.date) : `S${s.ws}`];
    if (s.km) meta.push(`${s.km} km`);
    if (s.pace) meta.push(s.pace + '/km');
    if (s.hr) meta.push('FC ' + s.hr);
    html += `<p style="font-size:10px;color:var(--muted);margin:1px 0 0;">${meta.join(' · ')}</p></div>`;
    if (strain != null) {
      html += `<div style="text-align:right;flex-shrink:0;"><p style="font-size:9px;color:var(--muted);margin:0 0 1px;">Charge</p><p style="font-size:14px;font-weight:700;color:${strainColor};margin:0;line-height:1;">${strain.toFixed(1)}</p></div>`;
    }
    html += `</div>`;
  });

  html += '</div>';
  if (sessions.length > 30) html += `<p style="font-size:10px;color:var(--muted);text-align:center;margin-top:6px;">${sessions.length - 30} séances supplémentaires non affichées</p>`;
  container.innerHTML = html;
}

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

