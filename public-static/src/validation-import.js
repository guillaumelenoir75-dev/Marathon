async function fetchCoachAnalysis(s, km, pace, hr, analysisContext, historyData) {
  try {
    let coachMemos = '';
    try { const ms = await dbRef.child('_coach_memos').once('value'); coachMemos = ms.val()||''; } catch(e){}
    // Construire le compact context pour accéder aux variables locales
    const _cc = buildCompactContext(coachMemos, [], 'maintenant', new Date().getHours());
    const response = await fetch('https://us-central1-prepa-marathon.cloudfunctions.net/analyzeSession', {
      method: 'POST',
      headers: await authHeaders(true),
      body: JSON.stringify({
        sessionData: analysisContext,
        historyData: historyData || [],
        planContext: Object.assign({}, _cc, {
          // Champs spécifiques au débrief de séance
          semaineActuelle: CW, totalSemaines: 32,
          allureMarathon: getMarathonPaceStr(),
          semaines_restantes: 32-CW,
          type_semaine: [8,12,16,20,26,30].includes(CW) ? 'DÉCHARGE' : 'NORMALE',
          fc_repos: state['fc_repos'] || 51,
          fc_repos_context: buildFcReposContext(),
          date_reelle: (()=>{
            const _n=new Date();
            const _jNoms=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
            const _mNoms=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
            return {complet:_jNoms[_n.getDay()]+' '+_n.getDate()+' '+_mNoms[_n.getMonth()]+' '+_n.getFullYear(),jour:_jNoms[_n.getDay()],numero:_n.getDate(),heure:_n.getHours()+'h'+String(_n.getMinutes()).padStart(2,'0'),note:'Utilise UNIQUEMENT cette date. Ne jamais deviner ou calculer.'};
          })(),
          renfoStatus: [{r:1,name:'Ischio-fessiers'},{r:2,name:'Bas du dos'}].map(rd=>{
            const done=!!state[rfk(CW,rd.r)+'done'];
            const schedRaw=state[rfk(CW,rd.r)+'sched'];
            let sched=null;try{sched=schedRaw?JSON.parse(schedRaw):null;}catch(e){}
            const jours=['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
            const quand=sched&&sched.day?jours[sched.day]+(sched.time?' à '+sched.time:''):'non planifié';
            return `${rd.name}: ${done?'✓ fait':'à faire ('+quand+')'}`;
          }).join(' | '),
          date_marathon: '18 octobre 2026',
          km_semaine_en_cours: {planifie: getWeekTotalKm(CW), realise: calcWeekDoneKm()},
          seances_recentes_detail: (()=>{try{const det=[];for(let ws=CW;ws>=Math.max(1,CW-8);ws--){weeks[ws-1].sessions.forEach((sess,si)=>{const k=gk(ws,si);if(!state[k+'done'])return;const perf=state[k+'perf']?JSON.parse(state[k+'perf']):{};det.push({semaine:ws,type:sess.type,titre:sess.d.split('|')[0],km:state[k+'km']||sess.km,allure:perf.pace||null,fc_moy:perf.hr||null,strava:perf.strava||null});});let ei=0;while(ei<=20&&state["extra_w"+ws+"_s"+ei]){if(state["extra_w"+ws+"_s"+ei+"_done"]){let es;try{es=JSON.parse(state["extra_w"+ws+"_s"+ei]);}catch(e){ei++;continue;}if(!es){ei++;continue;}const perf=state["extra_w"+ws+"_s"+ei+"_perf"]?JSON.parse(state["extra_w"+ws+"_s"+ei+"_perf"]):{};det.push({semaine:ws,type:es.type,titre:es.d.split('|')[0],extra:true,km:state["extra_w"+ws+"_s"+ei+"_km"]||es.km,allure:perf.pace||null,fc_moy:perf.hr||null,strava:null});}ei++;}}return det.slice(0,15);}catch(e){return[];}})(),
          derniere_seance: _cc.derniere_seance || null,
          seances_a_venir: (()=>{
            const av=[]; const joursC=['','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
            const nowD=new Date(); const tDow=nowD.getDay()===0?7:nowD.getDay(); const hA=nowD.getHours()+nowD.getMinutes()/60;
            getOrderedWeekSessions(CW).forEach(({s:s2,si,extra,ei})=>{
              if(av.length>=3)return;
              const done=extra?!!state['extra_w'+CW+'_s'+ei+'_done']:!!state[gk(CW,si)+'done'];
              if(done)return;
              const edRaw=!extra&&state['edit_w'+CW+'_s'+si];
              let ed=null;try{ed=edRaw?JSON.parse(edRaw):null;}catch(e){}
              const titre=ed?ed.d.split('|')[0]:s2.d.split('|')[0];
              const type=ed?ed.type:s2.type; const km=ed?ed.km:s2.km;
              const jourC=ed&&ed.sched_day?joursC[ed.sched_day]:'';
              const heure=ed&&ed.sched_time?ed.sched_time:'';
              let hAvant=null;
              if(ed&&ed.sched_day){const dJ=((ed.sched_day-tDow)+7)%7;const hS=heure?parseInt(heure.split(':')[0])+parseInt(heure.split(':')[1]||0)/60:12;hAvant=Math.round(dJ*24+(hS-hA));}
              av.push({type,titre,km,quand:jourC+(heure?' à '+heure:'non planifié'),heures_avant_seance:hAvant!==null?hAvant+'h':'?'});
            });
            return av;
          })(),
          charge_semaine: (()=>{const kmF=calcWeekDoneKm();const kmP=getWeekTotalKm(CW);const kmPrev=CW>1?getWeekTotalKm(CW-1):kmP;return {realise:kmF,planifie:kmP,ratio_vs_precedente:kmPrev>0?Math.round(kmP/kmPrev*100)/100:null,statut:kmF<kmP?'EN_COURS':'TERMINÉE'};})(),
          infos_importantes_Guillaume: coachMemos||undefined,
          absences_semaine: state['absences_cw'+CW]||null,
          chaussures_plan_verite: "Zoom Fly : première utilisation planifiée S26 (31/08/2026), jamais avant.",
          allure_ef_reference: getBestEfPace(),
          allure_ef_logique: "Fenêtre glissante 3 dernières séances EF valides (FC ≤ 148 bpm). Si ≥1 des 3 est meilleure que la référence précédente → meilleure des 3. Si les 3 sont toutes plus lentes → médiane des 3 (adaptation chaleur/fatigue). Utilise cette allure comme référence EF du moment pour contextualiser les débriefs.",
          note_comparaison_allures: "IMPORTANT — convention allure : une allure s'exprime en min:sec PAR KILOMÈTRE. Plus le nombre est GRAND (plus de secondes/km), plus c'est LENT. Ex: 5'46/km (346 sec/km) est PLUS LENT que 5'30/km (330 sec/km). Ne jamais dire 'plus rapide' si le nombre de secondes réalisé est supérieur à la cible.",
        }),
        chatHistoriqueRecent: coachHistory.slice(-6).map(m=>({
          role: m.role==='user'?'Guillaume':'Coach',
          contenu: m.content.slice(0,200)
        }))
      })
    });
    // Lire tout le stream puis afficher d'un coup avec fade-in
    const container = document.getElementById('coach-messages');
    const textEl = document.getElementById('coach-analysis-stream');
    if(textEl) {
      textEl.style.opacity = '1';
      textEl.innerHTML = '<div class="coach-typing"><span>Le Coach analyse ta séance</span><div class="coach-typing-dots"><i></i><i></i><i></i></div></div>';
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '', buffer = '';

    while(true) {
      const {done, value} = await reader.read();
      if(done) break;
      buffer += decoder.decode(value, {stream:true});
      const lines = buffer.split('\n'); buffer = lines.pop();
      for(const line of lines) {
        if(!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if(data==='[DONE]') continue;
        try { const parsed = JSON.parse(data); if(parsed.token) fullText += parsed.token; } catch(e) {}
      }
    }

    // Afficher d'un coup avec fade-in
    if(textEl) {
      textEl.style.transition = 'opacity 0.35s ease';
      textEl.innerHTML = fullText
        ? renderBriefText(cleanTruncated(fullText), 'green')
        : '<p style="color:var(--muted);font-style:italic;">Analyse non disponible.</p>';
      requestAnimationFrame(() => { textEl.style.opacity = '1'; });
      if(container) container.scrollTop = container.scrollHeight;
    }

        // ── Mise à jour automatique des mémos après débrief ─────────────────
    // Le débrief contient les données réelles de la séance → parfait pour
    // détecter si un problème mémorisé est résolu (ex: allures respectées)
    if(fullText) {
      // Injecter le débrief dans l'historique temporairement pour extractMemos
      const debriefContext = [
        {role:'assistant', content: '[DEBRIEF SÉANCE] ' + fullText}
      ];
      extractAndSaveMemosWithContext(debriefContext);
    }
  } catch(e) {
    const textEl = document.getElementById('coach-analysis-stream');
    if(textEl) textEl.innerHTML = '<p style="color:var(--muted);font-style:italic;">Analyse temporairement indisponible.</p>';
  }
}

// ── MÉTÉO VALIDATION — bouton "Météo" dans le modal ─────────────────────────

// Stocker la météo importée manuellement pour la validation en cours
window._meteoValidationData = null;

async function _getCityFromCoords(lat, lng) {
  // Reverse geocoding via Nominatim (OSM) — gratuit, sans clé
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=fr`, {
      headers: { 'Accept-Language': 'fr', 'User-Agent': 'PrepaMarathonApp/1.0' }
    });
    const d = await r.json();
    // Préférer la ville, puis le village, puis le comté
    const city = d.address?.city || d.address?.town || d.address?.village || d.address?.municipality || d.address?.county || 'Position GPS';
    const country = d.address?.country || '';
    return country && country !== 'France' ? `${city}, ${country}` : city;
  } catch(e) {
    return 'Position GPS';
  }
}

async function importMeteoValidation() {
  const btn = document.getElementById('meteo-val-btn');
  const preview = document.getElementById('meteo-val-preview');
  if (!btn) return;

  // ── Icône soleil SVG réutilisable ─────────────────────────────────────────
  const SVG_SUN = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

  // ── Skeleton loader dans le preview ──────────────────────────────────────
  function showSkeleton(step) {
    if (!preview) return;
    preview.style.display = 'block';
    preview.style.opacity = '1';
    const pulseStyle = 'background:linear-gradient(90deg,rgba(12,68,124,0.07) 25%,rgba(12,68,124,0.13) 50%,rgba(12,68,124,0.07) 75%);background-size:200% 100%;animation:_skPulse 1.4s ease-in-out infinite;border-radius:6px;';
    if (step === 1) {
      preview.innerHTML = `
        <style>@keyframes _skPulse{0%,100%{background-position:200% 0}50%{background-position:0 0}}</style>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="${pulseStyle}width:32px;height:32px;border-radius:50%;"></div>
            <div>
              <div style="${pulseStyle}width:90px;height:13px;margin-bottom:5px;"></div>
              <div style="${pulseStyle}width:60px;height:10px;"></div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="${pulseStyle}width:48px;height:22px;margin-bottom:5px;margin-left:auto;"></div>
            <div style="${pulseStyle}width:70px;height:10px;margin-left:auto;"></div>
          </div>
        </div>
        <div style="display:flex;gap:8px;">
          <div style="${pulseStyle}width:100px;height:22px;"></div>
          <div style="${pulseStyle}width:80px;height:22px;"></div>
          <div style="${pulseStyle}width:120px;height:22px;"></div>
        </div>
        <div style="margin-top:8px;font-size:10px;color:#888;">📍 Localisation en cours…</div>`;
    } else if (step === 2) {
      preview.innerHTML = preview.innerHTML.replace(
        '📍 Localisation en cours…',
        '🌡️ Récupération des données météo…'
      );
    }
  }

  // ── Démarrer ──────────────────────────────────────────────────────────────
  btn.innerHTML = SVG_SUN + ' <span style="opacity:0.7">Localisation…</span>';
  btn.disabled = true;
  showSkeleton(1);

  try {
    const pos = await _getPosition();
    if (!pos) {
      if (preview) {
        preview.innerHTML = '<div style="text-align:center;padding:10px;color:#999;font-size:12px;">📍 Géolocalisation refusée — autorise-la dans les réglages du navigateur</div>';
      }
      btn.innerHTML = SVG_SUN + ' Météo';
      btn.style.background = '#0C447C';
      btn.disabled = false;
      return;
    }

    // Étape 2 : on a la position, on fetch météo + ville
    btn.innerHTML = SVG_SUN + ' <span style="opacity:0.7">Météo…</span>';
    showSkeleton(2);

    const { lat, lng } = pos;
    const [city, meteo] = await Promise.all([
      _getCityFromCoords(lat, lng),
      fetchWeatherForContext(lat, lng)
    ]);

    if (!meteo) {
      if (preview) {
        preview.style.display = 'block';
        preview.innerHTML = '<div style="text-align:center;padding:10px;color:#999;font-size:12px;">📡 Réseau indisponible — <span onclick="importMeteoValidation()" style="color:#0C447C;cursor:pointer;text-decoration:underline;font-weight:600;">Réessayer ↺</span></div>';
      }
      btn.innerHTML = SVG_SUN + ' Météo';
      btn.style.background = '#0C447C';
      btn.disabled = false;
      return;
    }

    meteo.ville = city;
    meteo.coordonnees = { lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 };
    window._meteoValidationData = meteo;

    // ── Couleurs & labels impact ────────────────────────────────────────────
    const impactColors  = { IDEAL:'#2E7D32', MODERE:'#E65100', ELEVE:'#C62828', EXTREME:'#B71C1C', HUMIDE:'#1565C0', FROID:'#37474F' };
    const impactLabels  = { IDEAL:'Idéal ✅', MODERE:'Chaleur modérée', ELEVE:'Forte chaleur', EXTREME:'Chaleur extrême ⚠️', HUMIDE:'Humide', FROID:'Froid' };
    const niveau        = meteo.impact_performance?.niveau || 'IDEAL';
    const impactColor   = impactColors[niveau] || '#2E7D32';
    const impactLabel   = impactLabels[niveau] || niveau;
    const condIcon      = meteo.conditions?.split(' ').pop() || '🌤️';
    const elevFC        = meteo.impact_performance?.elevation_fc_bpm || 0;

    // ── Afficher le résultat avec une légère animation d'entrée ────────────
    if (preview) {
      preview.style.opacity = '0';
      preview.style.transition = 'opacity 0.3s ease';
      preview.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:22px;line-height:1;">${condIcon}</span>
            <div>
              <p style="font-size:13px;font-weight:700;color:#0C447C;margin:0;">${city}</p>
              <p style="font-size:10px;color:#888;margin:2px 0 0;">${meteo.conditions}</p>
            </div>
          </div>
          <div style="text-align:right;">
            <p style="font-size:24px;font-weight:800;color:#0C447C;margin:0;line-height:1;">${meteo.temperature}°C</p>
            <p style="font-size:10px;color:#888;margin:3px 0 0;">Ressenti <b>${meteo.ressenti}°C</b></p>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:${niveau !== 'IDEAL' ? '6px' : '4px'};">
          <span style="background:rgba(12,68,124,0.08);border-radius:12px;padding:4px 10px;font-size:11px;color:#0C447C;">💧 ${meteo.humidite}%</span>
          <span style="background:rgba(12,68,124,0.08);border-radius:12px;padding:4px 10px;font-size:11px;color:#0C447C;">💨 ${meteo.vent_kmh} km/h</span>
          <span style="background:${impactColor}18;border-radius:12px;padding:4px 10px;font-size:11px;font-weight:700;color:${impactColor};">${impactLabel}</span>
          ${elevFC > 0 ? `<span style="background:#FF6F0018;border-radius:12px;padding:4px 10px;font-size:11px;font-weight:600;color:#E65100;">❤️ FC +${elevFC} bpm attendus</span>` : ''}
        </div>
        ${niveau !== 'IDEAL' ? `<p style="font-size:10px;color:#666;margin:0 0 4px;font-style:italic;line-height:1.4;">${meteo.impact_performance?.conseil}</p>` : ''}
        <p style="font-size:9px;color:#aaa;margin:0;">${isAdmin()?'✅ Transmis au Coach IA pour l\'analyse de ta séance':'📊 Météo enregistrée pour cette séance'}</p>`;
      // Fade in
      requestAnimationFrame(() => { preview.style.opacity = '1'; });
    }

    btn.innerHTML = `✅ ${city}`;
    btn.style.background = '#2E7D32';
    btn.disabled = false;

  } catch(e) {
    if (preview) preview.innerHTML = '<div style="padding:8px;color:#c00;font-size:11px;">❌ Erreur : ' + (e.message||'inconnue') + '</div>';
    btn.innerHTML = SVG_SUN + ' Météo';
    btn.style.background = '#0C447C';
    btn.disabled = false;
  }
}


async function _stravaGetToken() {
  const user = firebase.auth().currentUser;
  if (!user) return null;
  return user.getIdToken();
}

async function _stravaFetch(body = {}) {
  const token = await _stravaGetToken();
  return fetch(FUNCTIONS_BASE + '/stravaFetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify(body)
  }).then(r => r.json());
}

async function _stravaOpenAuth() {
  const token = await _stravaGetToken();
  const resp = await fetch(FUNCTIONS_BASE + '/stravaAuth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({})
  });
  const data = await resp.json();
  return data.url ? window.open(data.url, '_blank', 'width=600,height=700') : null;
}

async function importFromStrava() {
  const btn = document.getElementById('strava-val-btn');
  if(btn) { btn.textContent = '⏳ Chargement…'; btn.disabled = true; }

  try {
    const data = await _stravaFetch();

    if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; }

    // Strava non connecté → ouvrir la page d'auth
    if(data.needsAuth) {
      const authWin = await _stravaOpenAuth();
      if(btn) { btn.textContent = '⏳ Connexion Strava…'; btn.disabled = true; }
      const check = setInterval(async () => {
        try {
          const d2 = await _stravaFetch();
          if(d2.success && d2.activities) {
            clearInterval(check);
            if(authWin) authWin.close();
            if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; }
            _showStravaPicker(d2.activities);
          } else if(!d2.needsAuth) {
            clearInterval(check);
            if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; }
          }
        } catch(e) {}
      }, 2000);
      setTimeout(() => { clearInterval(check); if(authWin) authWin.close(); if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; } }, 120000);
      return;
    }

    if(!data.success || !data.activities || data.activities.length === 0) {
      if(btn) { btn.textContent = data.error ? `❌ ${data.error.slice(0,25)}` : '❌ Aucune course'; btn.disabled = false; }
      setTimeout(() => { if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; } }, 3000);
      return;
    }

    _showStravaPicker(data.activities);

  } catch(e) {
    console.error('Strava import error:', e);
    if(btn) { btn.textContent = '❌ Erreur'; btn.disabled = false; }
    setTimeout(() => { if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; } }, 3000);
  }
}

function _showStravaPicker(activities) {
  const today = new Date().toISOString().slice(0, 10);
  const existing = document.getElementById('strava-val-picker');
  if(existing) existing.remove();

  const picker = document.createElement('div');
  picker.id = 'strava-val-picker';
  picker.style.cssText = 'position:fixed;inset:0;z-index:600;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0.4);';
  picker.innerHTML = `<div style="background:var(--bg);border-radius:20px 20px 0 0;padding:20px 16px 40px;width:100%;max-width:390px;">
    <p style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:4px;">Dernières courses Strava</p>
    <p style="font-size:11px;color:var(--muted);margin-bottom:14px;">Sélectionne la séance à importer</p>
    ${activities.slice(0, 3).map(a => {
      const isToday = a.date === today;
      const d = new Date(a.date + 'T12:00:00');
      const days = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
      const months = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'];
      const dateLabel = isToday ? '' : `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
      return `<div onclick="document.getElementById('strava-val-picker').remove();_fetchAndApplyStravaDetail(${JSON.stringify(a).replace(/"/g,'&quot;')},'validation');document.getElementById('strava-val-btn').innerHTML='⏳ Détails…';"
        style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-radius:12px;border:1.5px solid ${isToday?'#FC4C02':'var(--border)'};margin-bottom:8px;cursor:pointer;background:${isToday?'#FFF0EB':'var(--bg2)'};">
        <div>
          <div style="display:flex;align-items:center;gap:6px;">
            <p style="font-size:13px;font-weight:700;color:var(--text);margin:0;">${a.nom}</p>
            ${isToday ? '<span style="background:#FC4C02;color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:10px;">Aujourd\'hui</span>' : ''}
          </div>
          <p style="font-size:11px;color:var(--muted);margin:2px 0 0;">${dateLabel}${dateLabel?' · ':''}${a.duree}</p>
        </div>
        <div style="text-align:right;">
          <p style="font-size:15px;font-weight:700;color:#FC4C02;margin:0;">${a.distanceKm} km</p>
          <p style="font-size:11px;color:var(--muted);margin:2px 0 0;">${a.allure}/km${a.fcMoyenne?' · FC '+a.fcMoyenne:''}</p>
        </div>
      </div>`;
    }).join('')}
    <button onclick="document.getElementById('strava-val-picker').remove();" style="width:100%;padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;font-size:13px;color:var(--muted);cursor:pointer;margin-top:4px;">Annuler</button>
  </div>`;
  document.body.appendChild(picker);
}

// ── FETCH DÉTAIL STRAVA PUIS APPLIQUER ───────────────────────────────────────
async function _fetchAndApplyStravaDetail(activity, mode, ws, si) {
  try {
    const token = await _stravaGetToken();
    const resp = await fetch(FUNCTIONS_BASE + '/stravaFetchDetail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ activityId: activity.activityId })
    });
    const data = await resp.json();
    if (data.success && data.detail) {
      // Fusionner les détails dans l'activité
      Object.assign(activity, data.detail);
    }
  } catch(e) {
    console.warn('stravaFetchDetail failed, applying without details:', e);
  }
  if (mode === 'validation') {
    _applyStravaToValidation(activity);
    const btn = document.getElementById('strava-val-btn');
    if(btn) btn.innerHTML = '✅ Importé';
  } else if (mode === 'perfedit') {
    _applyStravaToPerfEdit(activity, ws, si);
  } else if (mode === 'perfedit-extra') {
    _applyStravaToPerfEditExtra(activity, ws, si);
  }
}

function _applyStravaToValidation(activity) {
  // Stocker l'activité complète pour le coach IA
  window._stravaActivityData = activity;

  // KM réels
  const kmEl = document.getElementById('val-km');
  if(kmEl && activity.distanceKm) {
    kmEl.value = activity.distanceKm;
    kmEl.dispatchEvent(new Event('input'));
  }
  // Durée
  const durEl = document.getElementById('val-dur');
  if(durEl && activity.duree) {
    durEl.value = activity.duree;
    if(typeof calcPace === 'function') calcPace();
  }
  // Allure
  const paceEl = document.getElementById('val-pace');
  if(paceEl && activity.allure) paceEl.value = activity.allure;
  // FC
  const hrEl = document.getElementById('val-hr');
  if(hrEl && activity.fcMoyenne) hrEl.value = activity.fcMoyenne;
  // Date
  const dateEl = document.getElementById('val-date');
  if(dateEl && activity.date) dateEl.value = activity.date;

  // Blocs tempo/frac : message d'aide, saisie manuelle uniquement
  const ctx = window._currentValidationSession;
  if (ctx && ctx.s && (ctx.s.type === 'tempo' || ctx.s.type === 'frac')) {
    const blocsContainer = document.getElementById('val-blocs-container');
    const existing = document.getElementById('val-blocs-strava-msg');
    if (existing) existing.remove();
    if (blocsContainer) {
      const msg = document.createElement('p');
      msg.id = 'val-blocs-strava-msg';
      msg.style.cssText = 'font-size:10px;color:#888;margin-top:6px;text-align:center;';
      msg.textContent = 'Facultatif — renseigne l\'allure de chaque bloc manuellement d\'après ta montre.';
      blocsContainer.appendChild(msg);
    }
  }

  // Feedback visuel — bordure bleue 2s
  ['val-km','val-dur','val-pace','val-hr'].forEach(id => {
    const el = document.getElementById(id);
    if(el && el.value) { el.style.borderColor = '#1382E4'; setTimeout(() => el.style.borderColor = '', 2000); }
  });

  // Afficher le bloc de données enrichies Garmin sous les champs
  const existing = document.getElementById('strava-detail-block');
  if(existing) existing.remove();

  const block = document.createElement('div');
  block.id = 'strava-detail-block';
  block.style.cssText = 'margin-top:12px;background:#EDF5FF;border-radius:12px;padding:12px 14px;border:1.5px solid #1382E430;';

  let html = '<p style="font-size:11px;font-weight:700;color:#1382E4;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">🟠 Données Strava importées</p>';

  // Ligne 1 : cadence + dénivelé + puissance
  const extras = [];
  if(activity.cadence) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Cadence</p><p style="font-size:15px;font-weight:700;color:#1a2e4a;">${activity.cadence} <span style="font-size:10px;font-weight:400;">spm</span></p></div>`);
  if(activity.denivele_pos != null) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Dénivelé +</p><p style="font-size:15px;font-weight:700;color:#3B6D11;">${activity.denivele_pos} <span style="font-size:10px;font-weight:400;">m</span></p></div>`);
  if(activity.fcMax) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">FC max</p><p style="font-size:15px;font-weight:700;color:#E24B4A;">${activity.fcMax} <span style="font-size:10px;font-weight:400;">bpm</span></p></div>`);
  if(activity.calories) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Calories</p><p style="font-size:15px;font-weight:700;color:#E8530A;">${activity.calories} <span style="font-size:10px;font-weight:400;">kcal</span></p></div>`);
  if(activity.best_400m) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Meilleur 400m</p><p style="font-size:15px;font-weight:700;color:#1B4FD8;">${activity.best_400m} <span style="font-size:10px;font-weight:400;">/km</span></p></div>`);

  if(extras.length > 0) {
    html += `<div style="display:grid;grid-template-columns:repeat(${Math.min(extras.length,3)},1fr);gap:8px;margin-bottom:10px;">${extras.join('')}</div>`;
  }

  // Zones FC
  if(activity.zones_fc && activity.zones_fc.length > 0) {
    html += '<p style="font-size:10px;font-weight:700;color:#6B8DB5;margin-bottom:6px;text-transform:uppercase;">Zones FC</p>';
    html += '<div style="display:flex;flex-direction:column;gap:4px;margin-bottom:10px;">';
    const zoneColors = ['#6B8DB5','#3B6D11','#1382E4','#E8530A','#E24B4A'];
    activity.zones_fc.forEach((z, i) => {
      const col = zoneColors[i] || '#888';
      const mins = Math.floor(z.temps_sec / 60);
      const secs = z.temps_sec % 60;
      const timeStr = mins > 0 ? `${mins}min${secs > 0 ? String(secs).padStart(2,'0')+'s' : ''}` : `${secs}s`;
      const _totalSec = activity.zones_fc.reduce((a, z2) => a + (z2.temps_sec || 0), 0);
      const pct = z.pourcentage || (_totalSec > 0 ? Math.round(z.temps_sec / _totalSec * 100) : 0);
      html += `<div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:10px;font-weight:700;color:${col};width:50px;">${z.nom||'Z'+(i+1)}</span>
        <div style="flex:1;background:#e0e0e0;border-radius:4px;height:6px;overflow:hidden;">
          <div style="width:${pct}%;background:${col};height:100%;border-radius:4px;"></div>
        </div>
        <span style="font-size:10px;color:#6B8DB5;width:40px;text-align:right;">${timeStr}</span>
      </div>`;
    });
    html += '</div>';
  }

  // Splits par km
  if(activity.splits && activity.splits.length > 0) {
    html += '<p style="font-size:10px;font-weight:700;color:#6B8DB5;margin-bottom:6px;text-transform:uppercase;">Splits par km</p>';
    html += '<div style="overflow-x:hidden;"><table style="width:100%;border-collapse:collapse;font-size:11px;">';
    html += '<tr style="color:#6B8DB5;"><th style="text-align:left;padding:2px 4px;font-weight:600;">Km</th><th style="text-align:center;padding:2px 4px;font-weight:600;">Allure</th><th style="text-align:center;padding:2px 4px;font-weight:600;">FC</th></tr>';
    activity.splits.filter(sp => sp.distanceKm && sp.distanceKm >= 0.5).forEach(sp => {
      html += `<tr style="border-top:1px solid #d0dff5;"><td style="padding:3px 4px;font-weight:700;color:#1a2e4a;">${sp.km}</td><td style="padding:3px 4px;text-align:center;color:#1B4FD8;font-weight:600;">${sp.allure||'—'}</td><td style="padding:3px 4px;text-align:center;color:#E24B4A;">${sp.fc||'—'}</td></tr>`;
    });
    html += '</table></div>';
  }

  block.innerHTML = html;

  // Insérer avant les boutons Annuler/Valider
  const btnRow = document.querySelector('#modal-container .modal-box div[style*="grid-template-columns:1fr 1fr"]');
  if(btnRow) btnRow.parentNode.insertBefore(block, btnRow);

  // Scroller vers le bas pour rendre les boutons Annuler/Valider visibles
  setTimeout(() => {
    const scrollBody = document.querySelector('#modal-container .modal-scroll-body');
    if(scrollBody) scrollBody.scrollTop = scrollBody.scrollHeight;
  }, 50);
}

// ── STRAVA RESYNC POUR SÉANCES DÉJÀ VALIDÉES ─────────────────────────────────
async function importFromStravaForPerfEdit(ws, si) {
  const btn = document.getElementById('strava-pedit-btn');
  if(btn) { btn.textContent = '⏳…'; btn.disabled = true; }

  try {
    const data = await _stravaFetch();
    if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; }

    if(data.needsAuth) {
      const authWin = await _stravaOpenAuth();
      if(btn) { btn.textContent = '⏳ Connexion…'; btn.disabled = true; }
      const check = setInterval(async () => {
        try {
          const d2 = await _stravaFetch();
          if(d2.success && d2.activities) {
            clearInterval(check);
            if(authWin) authWin.close();
            if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; }
            _showStravaPickerForPerfEdit(d2.activities, ws, si);
          } else if(!d2.needsAuth) { clearInterval(check); if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; } }
        } catch(e) {}
      }, 2000);
      setTimeout(() => { clearInterval(check); if(authWin) authWin.close(); if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; } }, 120000);
      return;
    }
    if(!data.success || !data.activities || data.activities.length === 0) {
      if(btn) { btn.textContent = '❌ Aucune course'; btn.disabled = false; }
      setTimeout(() => { if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; } }, 3000);
      return;
    }
    _showStravaPickerForPerfEdit(data.activities, ws, si);
  } catch(e) {
    if(btn) { btn.textContent = '❌ Erreur'; btn.disabled = false; }
    setTimeout(() => { if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; } }, 3000);
  }
}

function _showStravaPickerForPerfEdit(activities, ws, si) {
  const k = gk(ws, si);
  let prev={};try{prev=state[k+'perf']?JSON.parse(state[k+'perf']):{}}catch(e){}
  const sessionDate = prev.date || ''; // YYYY-MM-DD

  // Trier par proximité de date avec la séance
  const sorted = [...activities].sort((a, b) => {
    const da = sessionDate ? Math.abs(new Date(a.date) - new Date(sessionDate)) : 0;
    const db = sessionDate ? Math.abs(new Date(b.date) - new Date(sessionDate)) : 0;
    return da - db;
  });
  const top3 = sorted.slice(0, 3);

  const existing = document.getElementById('strava-pedit-picker');
  if(existing) existing.remove();

  const picker = document.createElement('div');
  picker.id = 'strava-pedit-picker';
  picker.style.cssText = 'position:fixed;inset:0;z-index:400;display:flex;align-items:flex-end;justify-content:center;background:transparent;';

  picker.innerHTML = `<div style="background:var(--bg);border-radius:20px 20px 0 0;padding:20px 16px 40px;width:100%;max-width:390px;">
    <p style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:2px;">Resync Strava</p>
    <p style="font-size:11px;color:var(--muted);margin-bottom:14px;">3 courses les plus proches de la date de la séance</p>
    ${top3.map(a => {
      const d = new Date(a.date + 'T12:00:00');
      const days = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
      const months = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'];
      const dateLabel = `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
      const diffDays = sessionDate ? Math.round((new Date(a.date) - new Date(sessionDate)) / 86400000) : null;
      const diffLabel = diffDays === 0 ? '<span style="color:#3B6D11;font-size:9px;font-weight:700;background:#EAF3DE;padding:1px 6px;border-radius:8px;">Même jour</span>'
        : diffDays != null ? `<span style="color:#888;font-size:9px;">${diffDays > 0 ? '+' : ''}${diffDays}j</span>` : '';
      return `<div onclick="document.getElementById('strava-pedit-picker').remove();_fetchAndApplyStravaDetail(${JSON.stringify(a).replace(/"/g,'&quot;')},'perfedit',${ws},${si});"
        style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-radius:12px;border:1.5px solid ${diffDays===0?'#3B6D11':'var(--border)'};margin-bottom:8px;cursor:pointer;background:${diffDays===0?'#F0F9E8':'var(--bg2)'};">
        <div>
          <div style="display:flex;align-items:center;gap:6px;">
            <p style="font-size:13px;font-weight:700;color:var(--text);margin:0;">${a.nom}</p>
            ${diffLabel}
          </div>
          <p style="font-size:11px;color:var(--muted);margin:2px 0 0;">${dateLabel} · ${a.duree}</p>
        </div>
        <div style="text-align:right;">
          <p style="font-size:15px;font-weight:700;color:#FC4C02;margin:0;">${a.distanceKm} km</p>
          <p style="font-size:11px;color:var(--muted);margin:2px 0 0;">${a.allure}/km${a.fcMoyenne?' · FC '+a.fcMoyenne:''}</p>
        </div>
      </div>`;
    }).join('')}
    <button onclick="document.getElementById('strava-pedit-picker').remove();" style="width:100%;padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;font-size:13px;color:var(--muted);cursor:pointer;margin-top:4px;">Annuler</button>
  </div>`;
  document.body.appendChild(picker);
}

function _applyStravaToPerfEdit(activity, ws, si) {
  const k = gk(ws, si);
  let existing={};try{existing=state[k+'perf']?JSON.parse(state[k+'perf']):{}}catch(e){}
  const s = getSession(ws, si);

  // Construire les données Strava
  const stravaData = {};
  if(activity.cadence) stravaData.cadence = activity.cadence;
  if(activity.fcMax) stravaData.fcMax = activity.fcMax;
  if(activity.denivele_pos != null) stravaData.denivele_pos = activity.denivele_pos;
  if(activity.calories) stravaData.calories = activity.calories;
  if(activity.best_400m) stravaData.best_400m = activity.best_400m;
  if(activity.splits && activity.splits.length > 0) stravaData.splits = activity.splits;
  if(activity.laps && activity.laps.length > 0) stravaData.laps = activity.laps;
  if(activity.zones_fc && activity.zones_fc.length > 0) stravaData.zones_fc = activity.zones_fc;

  existing.strava = stravaData;
  state[k+'perf'] = JSON.stringify(existing);
  save();



  // Mettre à jour le bouton
  const btn = document.getElementById('strava-pedit-btn');
  if(btn) { btn.innerHTML = '✅ Strava'; btn.style.background = '#3B6D11'; }

  // Rafraîchir le bloc Strava dans le modal sans le fermer
  const stravaBlocExist = document.getElementById('pedit-strava-block');
  if(stravaBlocExist) stravaBlocExist.remove();
  const btnRow = document.querySelector('#modal-container .modal-box div[style*="grid-template-columns:1fr 1fr"][style*="margin-top:20px"]');
  if(btnRow) {
    const block = document.createElement('div');
    block.id = 'pedit-strava-block';
    const st = stravaData;
    let html = '<div style="background:#EDF5FF;border-radius:12px;padding:12px 14px;border:1.5px solid #1382E430;margin-bottom:4px;">';
    html += '<p style="font-size:11px;font-weight:700;color:#1382E4;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">📡 Données Strava importées</p>';
    const extras = [];
    if(st.cadence) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Cadence</p><p style="font-size:15px;font-weight:700;color:#1a2e4a;">${st.cadence} <span style="font-size:10px;font-weight:400;">pas/min</span></p></div>`);
    if(st.denivele_pos != null) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Dénivelé +</p><p style="font-size:15px;font-weight:700;color:#3B6D11;">${st.denivele_pos} <span style="font-size:10px;font-weight:400;">m</span></p></div>`);
    if(st.fcMax) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">FC max</p><p style="font-size:15px;font-weight:700;color:#E24B4A;">${st.fcMax} <span style="font-size:10px;font-weight:400;">bpm</span></p></div>`);
    if(st.calories) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Calories</p><p style="font-size:15px;font-weight:700;color:#E8530A;">${st.calories} <span style="font-size:10px;font-weight:400;">kcal</span></p></div>`);
    if(st.best_400m) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Meilleur 400m</p><p style="font-size:15px;font-weight:700;color:#1B4FD8;">${st.best_400m} <span style="font-size:10px;font-weight:400;">/km</span></p></div>`);
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
    block.innerHTML = html;
    btnRow.parentNode.insertBefore(block, btnRow);
  }
}

function _applyStravaToPerfEditExtra(activity, ws, ei) {
  const ek = `extra_w${ws}_s${ei}`;
  let existing={};try{existing=state[ek+'_perf']?JSON.parse(state[ek+'_perf']):{}}catch(e){}
  const stravaData = {};
  if(activity.cadence) stravaData.cadence = activity.cadence;
  if(activity.fcMax) stravaData.fcMax = activity.fcMax;
  if(activity.denivele_pos != null) stravaData.denivele_pos = activity.denivele_pos;
  if(activity.calories) stravaData.calories = activity.calories;
  if(activity.best_400m) stravaData.best_400m = activity.best_400m;
  if(activity.splits && activity.splits.length > 0) stravaData.splits = activity.splits;
  // Pré-remplir les champs du modal
  const kmEl = document.getElementById('pedit-km');
  if(kmEl && activity.distanceKm) kmEl.value = activity.distanceKm;
  const durEl = document.getElementById('pedit-dur');
  if(durEl && activity.duree) durEl.value = activity.duree;
  const paceEl = document.getElementById('pedit-pace');
  if(paceEl && activity.allure) paceEl.value = activity.allure;
  const hrEl = document.getElementById('pedit-hr');
  if(hrEl && activity.fcMoyenne) hrEl.value = activity.fcMoyenne;
  const dateEl = document.getElementById('pedit-date');
  if(dateEl && activity.date) dateEl.value = activity.date;
  existing.strava = stravaData;
  state[ek+'_perf'] = JSON.stringify(existing);
  if(dbRef) dbRef.child(ek+'_perf').set(state[ek+'_perf']).catch(()=>{});
  const btn = document.getElementById('strava-pedit-btn');
  if(btn) { btn.innerHTML = '✅ Strava'; btn.style.background = '#3B6D11'; }
  const existingBlock = document.getElementById('pedit-strava-block');
  if(existingBlock) existingBlock.remove();
  const btnRow = document.querySelector('#modal-container .modal-box div[style*="grid-template-columns:1fr 1fr"][style*="margin-top:20px"]');
  if(btnRow) {
    const block = document.createElement('div');
    block.id = 'pedit-strava-block';
    const st = stravaData;
    let html = '<div style="background:#EDF5FF;border-radius:12px;padding:12px 14px;border:1.5px solid #1382E430;margin-bottom:4px;">';
    html += '<p style="font-size:11px;font-weight:700;color:#1382E4;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">📡 Données Strava importées</p>';
    const extras = [];
    if(st.cadence) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Cadence</p><p style="font-size:15px;font-weight:700;color:#1a2e4a;">${st.cadence} <span style="font-size:10px;font-weight:400;">pas/min</span></p></div>`);
    if(st.denivele_pos != null) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Dénivelé +</p><p style="font-size:15px;font-weight:700;color:#3B6D11;">${st.denivele_pos} <span style="font-size:10px;font-weight:400;">m</span></p></div>`);
    if(st.fcMax) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">FC max</p><p style="font-size:15px;font-weight:700;color:#E24B4A;">${st.fcMax} <span style="font-size:10px;font-weight:400;">bpm</span></p></div>`);
    if(st.calories) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Calories</p><p style="font-size:15px;font-weight:700;color:#E8530A;">${st.calories} <span style="font-size:10px;font-weight:400;">kcal</span></p></div>`);
    if(st.best_400m) extras.push(`<div style="text-align:center;"><p style="font-size:10px;color:#6B8DB5;margin-bottom:2px;">Meilleur 400m</p><p style="font-size:15px;font-weight:700;color:#1B4FD8;">${st.best_400m} <span style="font-size:10px;font-weight:400;">/km</span></p></div>`);
    if(extras.length > 0) html += `<div style="display:grid;grid-template-columns:repeat(${Math.min(extras.length,3)},1fr);gap:8px;">${extras.join('')}</div>`;
    html += '</div>';
    block.innerHTML = html;
    btnRow.parentNode.insertBefore(block, btnRow);
  }
}

// ── WHOOP CHARGE — bouton "WHOOP" dans le modal de validation ────────────────

window._whoopChargeData = null;

async function importWhoopCharge() {
  const btn = document.getElementById('whoop-val-btn');
  const preview = document.getElementById('whoop-val-preview');
  if (!btn) return;

  btn.textContent = '⏳ WHOOP…';
  btn.disabled = true;

  try {
    const snap = await dbRef.child('whoop_data').once('value');
    const whoopData = snap.val();

    if (!whoopData) {
      if (preview) {
        preview.style.display = 'block';
        preview.innerHTML = '<div style="text-align:center;padding:10px;color:#888;font-size:12px;">Pas de données WHOOP — lance d\'abord une synchronisation WHOOP.</div>';
      }
      btn.textContent = 'WHOOP';
      btn.disabled = false;
      return;
    }

    const dateEl = document.getElementById('val-date');
    const sessionDate = (dateEl && dateEl.value) ? dateEl.value : new Date().toISOString().slice(0, 10);

    const workouts = whoopData.workouts || [];
    const cycles = whoopData.cycles || [];

    const dayWorkouts = workouts.filter(w => w.date === sessionDate);
    const bestWorkout = dayWorkouts.sort((a, b) => (b.strain || 0) - (a.strain || 0))[0] || null;
    const dayCycle = cycles.find(c => c.date === sessionDate) || null;

    if (!bestWorkout && !dayCycle) {
      if (preview) {
        preview.style.display = 'block';
        preview.innerHTML = `<div style="text-align:center;padding:10px;color:#888;font-size:12px;">Aucune donnée WHOOP pour le ${sessionDate}.<br><span style="font-size:10px;">Les données sont disponibles pour les 14 derniers jours.</span></div>`;
      }
      btn.textContent = 'WHOOP';
      btn.disabled = false;
      return;
    }

    window._whoopChargeData = {
      date: sessionDate,
      workout_strain: bestWorkout?.strain ?? null,
      workout_calories: bestWorkout?.calories ?? null,
      cycle_strain: dayCycle?.strain ?? null,
      cycle_calories: dayCycle?.calories ?? null
    };

    const strain = bestWorkout?.strain ?? dayCycle?.strain ?? null;
    const strainColor = strain == null ? '#888'
      : strain >= 18 ? '#dc2626'
      : strain >= 14 ? '#f59e0b'
      : strain >= 10 ? '#22c55e'
      : '#6b7280';
    const strainLabel = strain == null ? '—'
      : strain >= 18 ? 'Très élevée'
      : strain >= 14 ? 'Élevée'
      : strain >= 10 ? 'Modérée'
      : 'Faible';

    if (preview) {
      preview.style.display = 'block';
      preview.style.background = 'linear-gradient(135deg,#f5f3ff,#ede9fe)';
      preview.style.border = '1px solid rgba(139,92,246,0.25)';
      preview.style.borderRadius = '10px';
      preview.style.padding = '10px 14px';
      preview.style.marginBottom = '12px';

      let html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">';
      html += '<p style="font-size:12px;font-weight:700;color:#7c3aed;margin:0;">⚡ Charge WHOOP</p>';
      if (strain != null) html += `<span style="background:${strainColor}22;border-radius:12px;padding:3px 10px;font-size:11px;font-weight:700;color:${strainColor};">${strainLabel}</span>`;
      html += '</div>';

      const cols = [];
      if (strain != null) cols.push(`<div style="text-align:center;"><p style="font-size:9px;color:#9d7bc4;margin-bottom:2px;">Charge séance</p><p style="font-size:20px;font-weight:800;color:${strainColor};margin:0;line-height:1;">${strain.toFixed(1)}</p><p style="font-size:9px;color:#9d7bc4;margin:0;">/21</p></div>`);
      if (bestWorkout?.avg_hr) cols.push(`<div style="text-align:center;"><p style="font-size:9px;color:#9d7bc4;margin-bottom:2px;">FC moy.</p><p style="font-size:20px;font-weight:800;color:#E24B4A;margin:0;line-height:1;">${bestWorkout.avg_hr}</p><p style="font-size:9px;color:#9d7bc4;margin:0;">bpm</p></div>`);
      if (bestWorkout?.duration_min) cols.push(`<div style="text-align:center;"><p style="font-size:9px;color:#9d7bc4;margin-bottom:2px;">Durée</p><p style="font-size:20px;font-weight:800;color:#7c3aed;margin:0;line-height:1;">${bestWorkout.duration_min}</p><p style="font-size:9px;color:#9d7bc4;margin:0;">min</p></div>`);
      if (bestWorkout?.calories) cols.push(`<div style="text-align:center;"><p style="font-size:9px;color:#9d7bc4;margin-bottom:2px;">Calories</p><p style="font-size:20px;font-weight:800;color:#f59e0b;margin:0;line-height:1;">${bestWorkout.calories}</p><p style="font-size:9px;color:#9d7bc4;margin:0;">kcal</p></div>`);

      if (cols.length > 0) html += `<div style="display:grid;grid-template-columns:repeat(${Math.min(cols.length,4)},1fr);gap:6px;margin-bottom:8px;">${cols.join('')}</div>`;
      if (dayCycle?.strain != null && bestWorkout?.strain != null) html += `<p style="font-size:10px;color:#9d7bc4;margin:0;">Charge journalière totale : <strong style="color:#7c3aed;">${dayCycle.strain.toFixed(1)}/21</strong></p>`;
      html += '<p style="font-size:9px;color:#b09ada;margin:4px 0 0;">✅ Enregistré avec la séance</p>';
      preview.innerHTML = html;
    }

    btn.textContent = `⚡ ${strain != null ? strain.toFixed(1) : 'OK'}`;
    btn.style.background = 'rgba(124,58,237,0.85)';
    btn.disabled = false;

  } catch(e) {
    if (preview) {
      preview.style.display = 'block';
      preview.innerHTML = `<div style="padding:8px;color:#c00;font-size:11px;">❌ Erreur : ${e.message||'inconnue'}</div>`;
    }
    btn.textContent = 'WHOOP';
    btn.disabled = false;
  }
}

// ── MÉTÉO POUR SÉANCE DÉJÀ VALIDÉE (modal plan-edit) ─────────────────────────
async function importMeteoForPerfEdit(ws, si) {
  const btn = document.getElementById('meteo-pedit-btn');
  if (btn) { btn.textContent = '⏳ Météo…'; btn.disabled = true; }

  try {
    const pos = await _getPosition();
    if (!pos) {
      if (btn) { btn.textContent = 'Météo'; btn.disabled = false; }
      return;
    }
    const { lat, lng } = pos;
    const [city, meteo] = await Promise.all([
      _getCityFromCoords(lat, lng),
      fetchWeatherForContext(lat, lng)
    ]);
    if (!meteo) {
      if (btn) { btn.textContent = 'Météo'; btn.disabled = false; }
      return;
    }
    meteo.ville = city;
    meteo.coordonnees = { lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 };

    // Sauvegarder directement dans perf
    const k = gk(ws, si);
    let existing = {}; try { existing = state[k+'perf'] ? JSON.parse(state[k+'perf']) : {}; } catch(e) {}
    existing.meteo = meteo;
    state[k+'perf'] = JSON.stringify(existing);
    if (dbRef) dbRef.child(k+'perf').set(state[k+'perf']).catch(()=>{});

    if (btn) { btn.style.background = '#2E7D32'; btn.textContent = '✅ ' + city; btn.disabled = false; }

    // Rafraîchir le bandeau météo dans le modal sans le fermer
    const existing2 = document.getElementById('pedit-meteo-block');
    if (existing2) existing2.remove();
    const btnRow = document.querySelector('#modal-container .modal-box div[style*="grid-template-columns:1fr 1fr"][style*="margin-top:20px"]');
    if (btnRow) {
      const block = document.createElement('div');
      block.id = 'pedit-meteo-block';
      const impactColors = {IDEAL:'#2E7D32',MODERE:'#E65100',ELEVE:'#C62828',EXTREME:'#B71C1C',HUMIDE:'#1565C0',FROID:'#37474F'};
      const impactLabels = {IDEAL:'Idéal ✅',MODERE:'Chaleur modérée',ELEVE:'Forte chaleur',EXTREME:'Chaleur extrême ⚠️',HUMIDE:'Humide',FROID:'Froid'};
      const niveau = meteo.impact_performance?.niveau || 'IDEAL';
      const impactColor = impactColors[niveau] || '#2E7D32';
      const impactLabel = impactLabels[niveau] || niveau;
      const condIcon = meteo.conditions?.split(' ').pop() || '🌤️';
      const elevFC = meteo.impact_performance?.elevation_fc_bpm || 0;
      block.innerHTML = `<div style="background:#FFF8E7;border-radius:12px;padding:12px 14px;border:1.5px solid #F5A62330;margin-bottom:4px;">
        <p style="font-size:11px;font-weight:700;color:#E65100;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">🌤️ Météo importée — ${city}</p>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:8px;"><span style="font-size:20px;">${condIcon}</span>
            <div><p style="font-size:13px;font-weight:700;color:#1a2e4a;margin:0;">${meteo.temperature}°C</p>
            <p style="font-size:10px;color:#888;margin:2px 0 0;">${meteo.conditions}</p></div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
            <span style="background:rgba(12,68,124,0.08);border-radius:12px;padding:3px 9px;font-size:11px;color:#0C447C;">💧 ${meteo.humidite}%</span>
            <span style="background:${impactColor}18;border-radius:12px;padding:3px 9px;font-size:11px;font-weight:700;color:${impactColor};">${impactLabel}</span>
            ${elevFC > 0 ? `<span style="background:#FF6F0018;border-radius:12px;padding:3px 9px;font-size:11px;font-weight:600;color:#E65100;">❤️ FC +${elevFC} bpm</span>` : ''}
          </div>
        </div>
      </div>`;
      btnRow.parentNode.insertBefore(block, btnRow);
    }
  } catch(e) {
    if (btn) { btn.textContent = 'Météo'; btn.disabled = false; }
  }
}

// ── WHOOP PICKER POUR VALIDATION (stocke dans _whoopChargeData) ──────────────
async function importWhoopForValidation(forceSync) {
  const btn = document.getElementById('whoop-val-btn');
  const preview = document.getElementById('whoop-val-preview');
  if (btn) { btn.textContent = '⏳…'; btn.disabled = true; }
  try {
    const snap = await dbRef.child('whoop_data').once('value');
    let whoopData = snap.val();
    if (!whoopData) {
      if (btn) { btn.textContent = 'WHOOP'; btn.disabled = false; }
      if (preview) { preview.style.display = 'block'; preview.innerHTML = '<div style="text-align:center;padding:10px;color:#888;font-size:12px;">Pas de données WHOOP — lance d\'abord une synchronisation WHOOP.</div>'; }
      return;
    }
    const dateEl = document.getElementById('val-date');
    const sessionDate = (dateEl && dateEl.value) ? dateEl.value : new Date().toISOString().slice(0, 10);

    // Auto-sync si pas de workout pour la date demandée (forceSync ignore le délai)
    const hasDateWorkout = (whoopData.workouts || []).some(w => w.date === sessionDate);
    const dataAge = whoopData.updatedAt ? Date.now() - new Date(whoopData.updatedAt).getTime() : Infinity;
    let _syncDiag = null;
    if (!hasDateWorkout && (forceSync || dataAge > 5 * 60 * 1000) && typeof syncWhoopFresh === 'function') {
      if (btn) { btn.textContent = '🔄 Sync…'; btn.disabled = true; }
      const result = await syncWhoopFresh();
      if (result && result.wd) whoopData = result.wd;
      _syncDiag = result;
    }

    // Inclure les workouts même sans strain calculé (WHOOP peut prendre ~20min à scorer)
    const workouts = (whoopData.workouts || []).filter(w => w.duration_min != null || w.strain != null);
    const sorted = [...workouts].sort((a, b) => {
      const da = Math.abs(new Date(a.date) - new Date(sessionDate));
      const db = Math.abs(new Date(b.date) - new Date(sessionDate));
      return da - db;
    });
    const top3 = sorted.slice(0, 3);
    if (btn) { btn.textContent = 'WHOOP'; btn.disabled = false; }
    if (top3.length === 0) { alert('Aucun entraînement WHOOP disponible.'); return; }
    const cycles = whoopData.cycles || [];
    window._whoopValidationPickerData = top3.map(w => {
      const c = cycles.find(cy => cy.date === w.date) || {};
      return { date: w.date, workout_strain: w.strain, workout_calories: w.calories,
               cycle_strain: c.strain ?? null, cycle_calories: c.calories ?? null };
    });
    const existing = document.getElementById('whoop-val-picker');
    if (existing) existing.remove();
    const picker = document.createElement('div');
    picker.id = 'whoop-val-picker';
    picker.style.cssText = 'position:fixed;inset:0;z-index:10001;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0.4);';
    const days = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
    const months = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'];
    picker.innerHTML = `<div style="background:var(--bg);border-radius:20px 20px 0 0;padding:20px 16px 40px;width:100%;max-width:390px;">
      <p style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:4px;">⚡ Entraînements WHOOP</p>
      <p style="font-size:11px;color:var(--muted);margin-bottom:14px;">Sélectionne l'entraînement à associer à cette séance</p>
      ${!top3.some(w => w.date === sessionDate) ? (() => {
        const sd = _syncDiag;
        let msg = '', color = '#9a6700', bg = '#fef9ec', border = '#f5a623';
        if (sd && sd.error === 'needsAuth') {
          msg = '🔑 Token WHOOP expiré — va dans <b>Compte → WHOOP</b> et reconnecte.';
          color = '#b91c1c'; bg = '#fff1f2'; border = '#fca5a5';
        } else if (sd && sd.error) {
          msg = '❌ Sync échouée : ' + sd.error;
          color = '#b91c1c'; bg = '#fff1f2'; border = '#fca5a5';
        } else if (sd && sd.serverData) {
          const wc = sd.serverData.workouts_count ?? '?';
          msg = '⚠️ Sync OK — ' + wc + ' workout(s) récupéré(s) sur WHOOP, aucun pour le ' + sessionDate + '. L\'API WHOOP n\'a pas encore publié cette séance.';
        } else {
          msg = '⏳ Séance du jour non trouvée — l\'API WHOOP n\'a pas encore publié cette séance. Réessaie dans quelques minutes.';
        }
        return `<div style="background:${bg};border:1px solid ${border};border-radius:10px;padding:10px 12px;margin-bottom:12px;font-size:12px;color:${color};line-height:1.5;">${msg}<br><div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;"><button onclick="document.getElementById('whoop-val-picker').remove();importWhoopForValidation(true);" style="padding:5px 14px;background:#7c3aed;color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;">🔄 Rafraîchir</button><button onclick="document.getElementById('whoop-val-picker').remove();" style="padding:5px 14px;background:#f3f4f6;color:#555;border:1px solid #ddd;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;">Valider sans WHOOP</button></div></div>`;
      })() : ''}
      ${top3.map((w, idx) => {
        const dt = new Date(w.date + 'T12:00:00');
        const dateLabel = `${days[dt.getDay()]} ${dt.getDate()} ${months[dt.getMonth()]}`;
        const diffDays = Math.round((new Date(w.date) - new Date(sessionDate)) / 86400000);
        const isSameDay = diffDays === 0;
        const diffLabel = isSameDay ? '<span style="background:#7c3aed;color:#fff;font-size:9px;font-weight:700;padding:1px 8px;border-radius:10px;">Aujourd\'hui</span>'
          : `<span style="color:#888;font-size:9px;">${diffDays > 0 ? '+' : ''}${diffDays}j</span>`;
        const strainColor = w.strain == null ? '#aaa' : w.strain >= 18 ? '#dc2626' : w.strain >= 14 ? '#f59e0b' : w.strain >= 10 ? '#22c55e' : '#6b7280';
        const chargeLabel = w.strain == null ? 'Score en cours…' : w.strain >= 18 ? 'Très élevée' : w.strain >= 14 ? 'Élevée' : w.strain >= 10 ? 'Modérée' : 'Faible';
        return `<div onclick="document.getElementById('whoop-val-picker').remove();_applyWhoopToValidation(${idx});"
          style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-radius:12px;border:1.5px solid ${isSameDay?'#7c3aed':'var(--border)'};margin-bottom:8px;cursor:pointer;background:${isSameDay?'#f5f3ff':'var(--bg2)'};">
          <div>
            <div style="display:flex;align-items:center;gap:6px;">
              <p style="font-size:13px;font-weight:700;color:var(--text);margin:0;">${dateLabel}</p>
              ${diffLabel}
            </div>
            <p style="font-size:11px;color:var(--muted);margin:2px 0 0;">${w.duration_min ? w.duration_min + ' min' : ''}${w.avg_hr ? ' · FC ' + w.avg_hr + ' bpm' : ''}</p>
          </div>
          <div style="text-align:right;">
            <p style="font-size:18px;font-weight:800;color:${strainColor};margin:0;line-height:1;">${w.strain != null ? w.strain.toFixed(1) : '—'}</p>
            <p style="font-size:10px;color:${strainColor};font-weight:600;margin:2px 0 0;">${chargeLabel}</p>
          </div>
        </div>`;
      }).join('')}
      <button onclick="document.getElementById('whoop-val-picker').remove();" style="width:100%;padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;font-size:13px;color:var(--muted);cursor:pointer;margin-top:4px;">Annuler</button>
    </div>`;
    document.body.appendChild(picker);
  } catch(e) {
    if (btn) { btn.textContent = 'WHOOP'; btn.disabled = false; }
  }
}

function _applyWhoopToValidation(idx) {
  const wData = (window._whoopValidationPickerData || [])[idx];
  if (!wData) return;
  window._whoopChargeData = {
    date: wData.date,
    workout_strain: wData.workout_strain,
    workout_calories: wData.workout_calories,
    cycle_strain: wData.cycle_strain,
    cycle_calories: wData.cycle_calories
  };
  const btn = document.getElementById('whoop-val-btn');
  const strain = wData.workout_strain ?? wData.cycle_strain ?? null;
  if (btn) { btn.style.background = 'rgba(124,58,237,0.85)'; btn.textContent = strain != null ? '⚡ ' + strain.toFixed(1) : '⚡ OK'; }
  const preview = document.getElementById('whoop-val-preview');
  if (preview) {
    const strainColor = strain==null?'#888':strain>=18?'#dc2626':strain>=14?'#f59e0b':strain>=10?'#22c55e':'#6b7280';
    const chargeLabel = strain==null?'—':strain>=18?'Très élevée':strain>=14?'Élevée':strain>=10?'Modérée':'Faible';
    preview.style.display = 'block';
    preview.innerHTML = `<div style="background:linear-gradient(135deg,#f5f3ff,#ede9fe);border:1px solid rgba(139,92,246,0.25);border-radius:10px;padding:10px 14px;">
      <p style="font-size:11px;font-weight:700;color:#7c3aed;margin-bottom:6px;">⚡ Charge WHOOP importée</p>
      ${strain!=null?`<p style="font-size:18px;font-weight:800;color:${strainColor};margin:0;">${strain.toFixed(1)} <span style="font-size:11px;font-weight:400;color:#888;">/21 · ${chargeLabel}</span></p>`:''}
    </div>`;
  }
}

// ── WHOOP PICKER POUR SÉANCE DÉJÀ VALIDÉE (modal plan-edit) ──────────────────
async function importWhoopForPerfEdit(ws, si) {
  const btn = document.getElementById('whoop-pedit-btn');
  if (btn) { btn.textContent = '⏳…'; btn.disabled = true; }

  try {
    const snap = await dbRef.child('whoop_data').once('value');
    const whoopData = snap.val();

    if (!whoopData) {
      if (btn) { btn.textContent = '⚡ WHOOP'; btn.disabled = false; }
      return;
    }

    // Date de la séance pour trier les workouts
    const k = gk(ws, si);
    let prev = {}; try { prev = state[k+'perf'] ? JSON.parse(state[k+'perf']) : {}; } catch(e) {}
    const sessionDate = prev.date || null;

    const workouts = (whoopData.workouts || []).filter(w => w.strain != null);
    // Trier par proximité de date avec la séance
    const sorted = [...workouts].sort((a, b) => {
      if (sessionDate) {
        const da = Math.abs(new Date(a.date) - new Date(sessionDate));
        const db = Math.abs(new Date(b.date) - new Date(sessionDate));
        return da - db;
      }
      return b.date.localeCompare(a.date);
    });
    const top3 = sorted.slice(0, 3);

    if (btn) { btn.textContent = '⚡ WHOOP'; btn.disabled = false; }

    if (top3.length === 0) {
      alert('Aucun entraînement WHOOP disponible (les 14 derniers jours).');
      return;
    }

    // Stocker les workouts dans un tableau global pour accès par index depuis onclick
    const cycles = whoopData.cycles || [];
    window._whoopPerfEditData = top3.map(w => {
      const c = cycles.find(cy => cy.date === w.date) || {};
      return { date: w.date, workout_strain: w.strain, workout_calories: w.calories,
               cycle_strain: c.strain ?? null, cycle_calories: c.calories ?? null };
    });

    // Afficher le picker
    const existing = document.getElementById('whoop-pedit-picker');
    if (existing) existing.remove();

    const picker = document.createElement('div');
    picker.id = 'whoop-pedit-picker';
    picker.style.cssText = 'position:fixed;inset:0;z-index:10001;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0.4);';

    const days = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
    const months = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'];

    picker.innerHTML = `<div style="background:var(--bg);border-radius:20px 20px 0 0;padding:20px 16px 40px;width:100%;max-width:390px;">
      <p style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:4px;">⚡ Entraînements WHOOP</p>
      <p style="font-size:11px;color:var(--muted);margin-bottom:14px;">Sélectionne l'entraînement à associer à cette séance</p>
      ${top3.map((w, idx) => {
        const dt = new Date(w.date + 'T12:00:00');
        const dateLabel = `${days[dt.getDay()]} ${dt.getDate()} ${months[dt.getMonth()]}`;
        const diffDays = sessionDate ? Math.round((new Date(w.date) - new Date(sessionDate)) / 86400000) : null;
        const isSameDay = diffDays === 0;
        const diffLabel = isSameDay ? '<span style="color:#3B6D11;font-size:9px;font-weight:700;background:#EAF3DE;padding:1px 6px;border-radius:8px;">Même jour</span>'
          : diffDays != null ? `<span style="color:#888;font-size:9px;">${diffDays > 0 ? '+' : ''}${diffDays}j</span>` : '';
        const strainColor = w.strain >= 18 ? '#dc2626' : w.strain >= 14 ? '#f59e0b' : w.strain >= 10 ? '#22c55e' : '#6b7280';
        const chargeLabel = w.strain >= 18 ? 'Très élevée' : w.strain >= 14 ? 'Élevée' : w.strain >= 10 ? 'Modérée' : 'Faible';
        return `<div onclick="document.getElementById('whoop-pedit-picker').remove();_applyWhoopToPerfEdit(${idx},${ws},${si});"
          style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-radius:12px;border:1.5px solid ${isSameDay?'#7c3aed':'var(--border)'};margin-bottom:8px;cursor:pointer;background:${isSameDay?'#f5f3ff':'var(--bg2)'};">
          <div>
            <div style="display:flex;align-items:center;gap:6px;">
              <p style="font-size:13px;font-weight:700;color:var(--text);margin:0;">${dateLabel}</p>
              ${diffLabel}
            </div>
            <p style="font-size:11px;color:var(--muted);margin:2px 0 0;">${w.duration_min ? w.duration_min + ' min' : ''}${w.avg_hr ? ' · FC ' + w.avg_hr + ' bpm' : ''}</p>
          </div>
          <div style="text-align:right;">
            <p style="font-size:18px;font-weight:800;color:${strainColor};margin:0;line-height:1;">${w.strain.toFixed(1)}</p>
            <p style="font-size:10px;color:${strainColor};font-weight:600;margin:2px 0 0;">${chargeLabel}</p>
          </div>
        </div>`;
      }).join('')}
      <button onclick="document.getElementById('whoop-pedit-picker').remove();" style="width:100%;padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;font-size:13px;color:var(--muted);cursor:pointer;margin-top:4px;">Annuler</button>
    </div>`;
    document.body.appendChild(picker);

  } catch(e) {
    if (btn) { btn.textContent = '⚡ WHOOP'; btn.disabled = false; }
    console.error('importWhoopForPerfEdit error:', e);
  }
}

function _applyWhoopToPerfEdit(idx, ws, si) {
  const wData = (window._whoopPerfEditData || [])[idx];
  if (!wData) return;
  const k = gk(ws, si);
  let existing = {}; try { existing = state[k+'perf'] ? JSON.parse(state[k+'perf']) : {}; } catch(e) {}
  existing.whoop = wData;
  state[k+'perf'] = JSON.stringify(existing);
  if (dbRef) dbRef.child(k+'perf').set(state[k+'perf']).catch(()=>{});

  const btn = document.getElementById('whoop-pedit-btn');
  const strain = wData.workout_strain ?? wData.cycle_strain ?? null;
  if (btn) { btn.style.background = 'rgba(124,58,237,0.85)'; btn.textContent = strain != null ? '⚡ ' + strain.toFixed(1) : '⚡ OK'; }

  // Rafraîchir le bandeau WHOOP dans le modal
  const existingBlock = document.getElementById('pedit-whoop-block');
  if (existingBlock) existingBlock.remove();
  const btnRow = document.querySelector('#modal-container .modal-box div[style*="grid-template-columns:1fr 1fr"][style*="margin-top:20px"]');
  if (btnRow) {
    const block = document.createElement('div');
    block.id = 'pedit-whoop-block';
    const strainColor = strain==null?'#888':strain>=18?'#dc2626':strain>=14?'#f59e0b':strain>=10?'#22c55e':'#6b7280';
    const cols = [];
    if(strain!=null) cols.push(`<div style="text-align:center;"><p style="font-size:10px;color:#9d7bc4;margin-bottom:2px;">Charge</p><p style="font-size:15px;font-weight:700;color:${strainColor};">${strain.toFixed(1)} <span style="font-size:10px;font-weight:400;">/21</span></p></div>`);
    if(wData.workout_calories) cols.push(`<div style="text-align:center;"><p style="font-size:10px;color:#9d7bc4;margin-bottom:2px;">Calories</p><p style="font-size:15px;font-weight:700;color:#f59e0b;">${wData.workout_calories} <span style="font-size:10px;font-weight:400;">kcal</span></p></div>`);
    block.innerHTML = `<div style="background:#f5f3ff;border-radius:12px;padding:12px 14px;border:1.5px solid rgba(139,92,246,0.25);margin-bottom:4px;">
      <p style="font-size:11px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">⚡ Charge WHOOP importée</p>
      <div style="display:grid;grid-template-columns:repeat(${Math.min(cols.length,4)},1fr);gap:8px;">${cols.join('')}</div>
    </div>`;
    btnRow.parentNode.insertBefore(block, btnRow);
  }
}

// ── STRAVA / MÉTÉO / WHOOP POUR SÉANCES EXTRA ────────────────────────────────

async function importFromStravaForPerfEditExtra(ws, ei) {
  const btn = document.getElementById('strava-pedit-btn');
  if(btn) { btn.textContent = '⏳…'; btn.disabled = true; }
  try {
    const data = await _stravaFetch();
    if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; }
    if(data.needsAuth) {
      const authWin = await _stravaOpenAuth();
      if(btn) { btn.textContent = '⏳ Connexion…'; btn.disabled = true; }
      const check = setInterval(async () => {
        try {
          const d2 = await _stravaFetch();
          if(d2.success && d2.activities) {
            clearInterval(check); if(authWin) authWin.close();
            if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; }
            _showStravaPickerForPerfEditExtra(d2.activities, ws, ei);
          } else if(!d2.needsAuth) { clearInterval(check); if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; } }
        } catch(e) {}
      }, 2000);
      setTimeout(() => { clearInterval(check); if(authWin) authWin.close(); if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; } }, 120000);
      return;
    }
    if(!data.success || !data.activities || data.activities.length === 0) {
      if(btn) { btn.textContent = '❌ Aucune course'; btn.disabled = false; }
      setTimeout(() => { if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; } }, 3000);
      return;
    }
    _showStravaPickerForPerfEditExtra(data.activities, ws, ei);
  } catch(e) {
    if(btn) { btn.textContent = '❌ Erreur'; btn.disabled = false; }
    setTimeout(() => { if(btn) { btn.innerHTML = '🟠 Strava'; btn.disabled = false; } }, 3000);
  }
}

function _showStravaPickerForPerfEditExtra(activities, ws, ei) {
  const ek = `extra_w${ws}_s${ei}`;
  let prev={};try{prev=state[ek+'_perf']?JSON.parse(state[ek+'_perf']):{}}catch(e){}
  const sessionDate = prev.date || '';
  const sorted = [...activities].sort((a, b) => {
    const da = sessionDate ? Math.abs(new Date(a.date) - new Date(sessionDate)) : 0;
    const db = sessionDate ? Math.abs(new Date(b.date) - new Date(sessionDate)) : 0;
    return da - db;
  });
  const top3 = sorted.slice(0, 3);
  const existing = document.getElementById('strava-pedit-picker');
  if(existing) existing.remove();
  const picker = document.createElement('div');
  picker.id = 'strava-pedit-picker';
  picker.style.cssText = 'position:fixed;inset:0;z-index:400;display:flex;align-items:flex-end;justify-content:center;background:transparent;';
  picker.innerHTML = `<div style="background:var(--bg);border-radius:20px 20px 0 0;padding:20px 16px 40px;width:100%;max-width:390px;">
    <p style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:2px;">Resync Strava</p>
    <p style="font-size:11px;color:var(--muted);margin-bottom:14px;">3 courses les plus proches de la date de la séance</p>
    ${top3.map(a => {
      const d = new Date(a.date + 'T12:00:00');
      const days = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
      const months = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'];
      const dateLabel = `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
      const diffDays = sessionDate ? Math.round((new Date(a.date) - new Date(sessionDate)) / 86400000) : null;
      const diffLabel = diffDays === 0 ? '<span style="color:#3B6D11;font-size:9px;font-weight:700;background:#EAF3DE;padding:1px 6px;border-radius:8px;">Même jour</span>'
        : diffDays != null ? `<span style="color:#888;font-size:9px;">${diffDays > 0 ? '+' : ''}${diffDays}j</span>` : '';
      return `<div onclick="document.getElementById('strava-pedit-picker').remove();_fetchAndApplyStravaDetail(${JSON.stringify(a).replace(/"/g,'&quot;')},'perfedit-extra',${ws},${ei});"
        style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-radius:12px;border:1.5px solid ${diffDays===0?'#3B6D11':'var(--border)'};margin-bottom:8px;cursor:pointer;background:${diffDays===0?'#F0F9E8':'var(--bg2)'};">
        <div>
          <div style="display:flex;align-items:center;gap:6px;">
            <p style="font-size:13px;font-weight:700;color:var(--text);margin:0;">${a.nom}</p>
            ${diffLabel}
          </div>
          <p style="font-size:11px;color:var(--muted);margin:2px 0 0;">${dateLabel} · ${a.duree}</p>
        </div>
        <div style="text-align:right;">
          <p style="font-size:15px;font-weight:700;color:#FC4C02;margin:0;">${a.distanceKm} km</p>
          <p style="font-size:11px;color:var(--muted);margin:2px 0 0;">${a.allure}/km${a.fcMoyenne?' · FC '+a.fcMoyenne:''}</p>
        </div>
      </div>`;
    }).join('')}
    <button onclick="document.getElementById('strava-pedit-picker').remove();" style="width:100%;padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;font-size:13px;color:var(--muted);cursor:pointer;margin-top:4px;">Annuler</button>
  </div>`;
  document.body.appendChild(picker);
}

async function importMeteoForPerfEditExtra(ws, ei) {
  const btn = document.getElementById('meteo-pedit-btn');
  if (btn) { btn.textContent = '⏳ Météo…'; btn.disabled = true; }
  try {
    const pos = await _getPosition();
    if (!pos) { if (btn) { btn.textContent = 'Météo'; btn.disabled = false; } return; }
    const { lat, lng } = pos;
    const [city, meteo] = await Promise.all([_getCityFromCoords(lat, lng), fetchWeatherForContext(lat, lng)]);
    if (!meteo) { if (btn) { btn.textContent = 'Météo'; btn.disabled = false; } return; }
    meteo.ville = city;
    meteo.coordonnees = { lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 };
    const ek = `extra_w${ws}_s${ei}`;
    let existing = {}; try { existing = state[ek+'_perf'] ? JSON.parse(state[ek+'_perf']) : {}; } catch(e) {}
    existing.meteo = meteo;
    state[ek+'_perf'] = JSON.stringify(existing);
    if (dbRef) dbRef.child(ek+'_perf').set(state[ek+'_perf']).catch(()=>{});
    if (btn) { btn.style.background = '#2E7D32'; btn.textContent = '✅ ' + city; btn.disabled = false; }
    const existingBlock = document.getElementById('pedit-meteo-block');
    if (existingBlock) existingBlock.remove();
    const btnRow = document.querySelector('#modal-container .modal-box div[style*="grid-template-columns:1fr 1fr"][style*="margin-top:20px"]');
    if (btnRow) {
      const block = document.createElement('div');
      block.id = 'pedit-meteo-block';
      const impactColors = {IDEAL:'#2E7D32',MODERE:'#E65100',ELEVE:'#C62828',EXTREME:'#B71C1C',HUMIDE:'#1565C0',FROID:'#37474F'};
      const impactLabels = {IDEAL:'Idéal ✅',MODERE:'Chaleur modérée',ELEVE:'Forte chaleur',EXTREME:'Chaleur extrême ⚠️',HUMIDE:'Humide',FROID:'Froid'};
      const niveau = meteo.impact_performance?.niveau || 'IDEAL';
      const impactColor = impactColors[niveau] || '#2E7D32';
      const impactLabel = impactLabels[niveau] || niveau;
      const condIcon = meteo.conditions?.split(' ').pop() || '🌤️';
      const elevFC = meteo.impact_performance?.elevation_fc_bpm || 0;
      block.innerHTML = `<div style="background:#FFF8E7;border-radius:12px;padding:12px 14px;border:1.5px solid #F5A62330;margin-bottom:4px;">
        <p style="font-size:11px;font-weight:700;color:#E65100;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">🌤️ Météo importée — ${city}</p>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:8px;"><span style="font-size:20px;">${condIcon}</span>
            <div><p style="font-size:13px;font-weight:700;color:#1a2e4a;margin:0;">${meteo.temperature}°C</p>
            <p style="font-size:10px;color:#888;margin:2px 0 0;">${meteo.conditions}</p></div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
            <span style="background:rgba(12,68,124,0.08);border-radius:12px;padding:3px 9px;font-size:11px;color:#0C447C;">💧 ${meteo.humidite}%</span>
            <span style="background:${impactColor}18;border-radius:12px;padding:3px 9px;font-size:11px;font-weight:700;color:${impactColor};">${impactLabel}</span>
            ${elevFC > 0 ? `<span style="background:#FF6F0018;border-radius:12px;padding:3px 9px;font-size:11px;font-weight:600;color:#E65100;">❤️ FC +${elevFC} bpm</span>` : ''}
          </div>
        </div>
      </div>`;
      btnRow.parentNode.insertBefore(block, btnRow);
    }
  } catch(e) {
    if (btn) { btn.textContent = 'Météo'; btn.disabled = false; }
  }
}

async function importWhoopForPerfEditExtra(ws, ei) {
  const btn = document.getElementById('whoop-pedit-btn');
  if (btn) { btn.textContent = '⏳…'; btn.disabled = true; }
  try {
    const snap = await dbRef.child('whoop_data').once('value');
    const whoopData = snap.val();
    if (!whoopData) { if (btn) { btn.textContent = '⚡ WHOOP'; btn.disabled = false; } return; }
    const ek = `extra_w${ws}_s${ei}`;
    let prev = {}; try { prev = state[ek+'_perf'] ? JSON.parse(state[ek+'_perf']) : {}; } catch(e) {}
    const sessionDate = prev.date || null;
    const workouts = (whoopData.workouts || []).filter(w => w.strain != null);
    const sorted = [...workouts].sort((a, b) => {
      if (sessionDate) {
        const da = Math.abs(new Date(a.date) - new Date(sessionDate));
        const db = Math.abs(new Date(b.date) - new Date(sessionDate));
        return da - db;
      }
      return b.date.localeCompare(a.date);
    });
    const top3 = sorted.slice(0, 3);
    if (btn) { btn.textContent = '⚡ WHOOP'; btn.disabled = false; }
    if (top3.length === 0) { alert('Aucun entraînement WHOOP disponible.'); return; }
    const cycles = whoopData.cycles || [];
    window._whoopPerfEditExtraData = top3.map(w => {
      const c = cycles.find(cy => cy.date === w.date) || {};
      return { date: w.date, workout_strain: w.strain, workout_calories: w.calories,
               cycle_strain: c.strain ?? null, cycle_calories: c.calories ?? null };
    });
    const existing = document.getElementById('whoop-pedit-picker');
    if (existing) existing.remove();
    const picker = document.createElement('div');
    picker.id = 'whoop-pedit-picker';
    picker.style.cssText = 'position:fixed;inset:0;z-index:10001;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0.4);';
    const days = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
    const months = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'];
    picker.innerHTML = `<div style="background:var(--bg);border-radius:20px 20px 0 0;padding:20px 16px 40px;width:100%;max-width:390px;">
      <p style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:4px;">⚡ Entraînements WHOOP</p>
      <p style="font-size:11px;color:var(--muted);margin-bottom:14px;">Sélectionne l'entraînement à associer à cette séance</p>
      ${top3.map((w, idx) => {
        const dt = new Date(w.date + 'T12:00:00');
        const dateLabel = `${days[dt.getDay()]} ${dt.getDate()} ${months[dt.getMonth()]}`;
        const diffDays = sessionDate ? Math.round((new Date(w.date) - new Date(sessionDate)) / 86400000) : null;
        const isSameDay = diffDays === 0;
        const diffLabel = isSameDay ? '<span style="color:#3B6D11;font-size:9px;font-weight:700;background:#EAF3DE;padding:1px 6px;border-radius:8px;">Même jour</span>'
          : diffDays != null ? `<span style="color:#888;font-size:9px;">${diffDays > 0 ? '+' : ''}${diffDays}j</span>` : '';
        const strainColor = w.strain >= 18 ? '#dc2626' : w.strain >= 14 ? '#f59e0b' : w.strain >= 10 ? '#22c55e' : '#6b7280';
        const chargeLabel = w.strain >= 18 ? 'Très élevée' : w.strain >= 14 ? 'Élevée' : w.strain >= 10 ? 'Modérée' : 'Faible';
        return `<div onclick="document.getElementById('whoop-pedit-picker').remove();_applyWhoopToPerfEditExtra(${idx},${ws},${ei});"
          style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-radius:12px;border:1.5px solid ${isSameDay?'#7c3aed':'var(--border)'};margin-bottom:8px;cursor:pointer;background:${isSameDay?'#f5f3ff':'var(--bg2)'};">
          <div>
            <div style="display:flex;align-items:center;gap:6px;">
              <p style="font-size:13px;font-weight:700;color:var(--text);margin:0;">${dateLabel}</p>
              ${diffLabel}
            </div>
            <p style="font-size:11px;color:var(--muted);margin:2px 0 0;">${w.duration_min ? w.duration_min + ' min' : ''}${w.avg_hr ? ' · FC ' + w.avg_hr + ' bpm' : ''}</p>
          </div>
          <div style="text-align:right;">
            <p style="font-size:18px;font-weight:800;color:${strainColor};margin:0;line-height:1;">${w.strain.toFixed(1)}</p>
            <p style="font-size:10px;color:${strainColor};font-weight:600;margin:2px 0 0;">${chargeLabel}</p>
          </div>
        </div>`;
      }).join('')}
      <button onclick="document.getElementById('whoop-pedit-picker').remove();" style="width:100%;padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;font-size:13px;color:var(--muted);cursor:pointer;margin-top:4px;">Annuler</button>
    </div>`;
    document.body.appendChild(picker);
  } catch(e) {
    if (btn) { btn.textContent = '⚡ WHOOP'; btn.disabled = false; }
  }
}

function _applyWhoopToPerfEditExtra(idx, ws, ei) {
  const wData = (window._whoopPerfEditExtraData || [])[idx];
  if (!wData) return;
  const ek = `extra_w${ws}_s${ei}`;
  let existing = {}; try { existing = state[ek+'_perf'] ? JSON.parse(state[ek+'_perf']) : {}; } catch(e) {}
  existing.whoop = wData;
  state[ek+'_perf'] = JSON.stringify(existing);
  if (dbRef) dbRef.child(ek+'_perf').set(state[ek+'_perf']).catch(()=>{});
  const btn = document.getElementById('whoop-pedit-btn');
  const strain = wData.workout_strain ?? wData.cycle_strain ?? null;
  if (btn) { btn.style.background = 'rgba(124,58,237,0.85)'; btn.textContent = strain != null ? '⚡ ' + strain.toFixed(1) : '⚡ OK'; }
  const existingBlock = document.getElementById('pedit-whoop-block');
  if (existingBlock) existingBlock.remove();
  const btnRow = document.querySelector('#modal-container .modal-box div[style*="grid-template-columns:1fr 1fr"][style*="margin-top:20px"]');
  if (btnRow) {
    const block = document.createElement('div');
    block.id = 'pedit-whoop-block';
    const strainColor = strain==null?'#888':strain>=18?'#dc2626':strain>=14?'#f59e0b':strain>=10?'#22c55e':'#6b7280';
    const cols = [];
    if(strain!=null) cols.push(`<div style="text-align:center;"><p style="font-size:10px;color:#9d7bc4;margin-bottom:2px;">Charge</p><p style="font-size:15px;font-weight:700;color:${strainColor};">${strain.toFixed(1)} <span style="font-size:10px;font-weight:400;">/21</span></p></div>`);
    if(wData.workout_calories) cols.push(`<div style="text-align:center;"><p style="font-size:10px;color:#9d7bc4;margin-bottom:2px;">Calories</p><p style="font-size:15px;font-weight:700;color:#f59e0b;">${wData.workout_calories} <span style="font-size:10px;font-weight:400;">kcal</span></p></div>`);
    block.innerHTML = `<div style="background:#f5f3ff;border-radius:12px;padding:12px 14px;border:1.5px solid rgba(139,92,246,0.25);margin-bottom:4px;">
      <p style="font-size:11px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">⚡ Charge WHOOP importée</p>
      <div style="display:grid;grid-template-columns:repeat(${Math.min(cols.length,4)},1fr);gap:8px;">${cols.join('')}</div>
    </div>`;
    btnRow.parentNode.insertBefore(block, btnRow);
  }
}

// ── VO2MAX MODAL ─────────────────────────────────────────────────────────────
