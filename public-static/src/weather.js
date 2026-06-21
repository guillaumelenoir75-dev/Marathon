function _wmoLabel(code, isDay) {
  // isDay : 1=jour, 0=nuit, undefined=utiliser l'heure locale (6h-21h = jour)
  const night = isDay === 0 || (isDay === undefined && (new Date().getHours() < 7 || new Date().getHours() >= 20));
  const labels = night ? _WMO_LABELS_NIGHT : _WMO_LABELS_DAY;
  return labels[code] || 'Conditions variables';
}

function _fcElevation(tempActuelle, humidity) {
  // Mora-Rodriguez 2010 — tableau exact :
  // Référence : TEMPÉRATURE (pas ressenti), seuil 25°C, +2 bpm par °C au-dessus de 25°C
  // On tronque (Math.floor) sans arrondir : 32.5°C → 32°C → +14 bpm
  const t = Math.floor(tempActuelle);
  if (t < 25) return 0;
  return (t - 25) * 2; // +2 bpm/°C
}

function _weatherImpact(temp, humidity, apparent) {
  // Impact chaleur — Mora-Rodriguez 2010 (J Appl Physiol)
  // Référence : chaque +1°C au-dessus de 25°C = -2% de performance à effort identique
  // 30°C = +5°C au-dessus du seuil = -10% perf ; 35°C = -20% perf
  const t = temp; // Référence : température réelle (pas ressenti) — Mora-Rodriguez
  const elevFC = _fcElevation(t, humidity || 0);
  // Zone EF ajustée : 140-148 + élévation due à la chaleur
  const zoneBas  = 140 + elevFC;
  const zoneHaut = 148 + elevFC;

  // Perte de performance Mora-Rodriguez (%) — appliquée seulement > 25°C
  const pertePerfPct = t >= 25 ? Math.min(Math.round((t - 25) * 2), 40) : 0;
  // Ralentissement allure EF à 6:00/km (360 sec/km) : -2% perf ≈ +7 sec/km
  const ralentSecKm = t >= 25 ? Math.round((t - 25) * 7) : 0;
  // Formater le ralentissement en texte lisible
  const ralentStr = ralentSecKm === 0 ? '0 sec/km'
    : ralentSecKm <= 10 ? `~${ralentSecKm} sec/km`
    : ralentSecKm <= 20 ? `${Math.round(ralentSecKm/5)*5}-${Math.round(ralentSecKm/5)*5+5} sec/km`
    : `${Math.floor(ralentSecKm/10)*10}-${Math.floor(ralentSecKm/10)*10+10} sec/km`;

  let niveau, ralentissement, conseil;
  if (t >= 35) {
    niveau = 'EXTREME'; ralentissement = ralentStr;
    conseil = "Conditions extrêmes — réduire fortement l'intensité, courir tôt le matin ou ne pas courir.";
  } else if (t >= 30) {
    niveau = 'ELEVE'; ralentissement = ralentStr;
    conseil = "Forte chaleur — allures ralenties normales, hydratation toutes les 20 min, éviter les heures chaudes.";
  } else if (t >= 25) {
    niveau = 'MODERE'; ralentissement = ralentStr;
    conseil = "Chaleur modérée — allures naturellement plus lentes, bien s'hydrater avant et pendant.";
  } else if (t >= 20 && (humidity || 0) > 75) {
    niveau = 'HUMIDE'; ralentissement = '5-10 sec/km';
    conseil = "Humidité élevée — le corps transpire mais ne refroidit pas bien, surveiller la FC.";
  } else if (t <= 0) {
    niveau = 'FROID'; ralentissement = '5-10 sec/km';
    conseil = "Froid — bien s'échauffer, couches, attention au verglas.";
  } else {
    niveau = 'IDEAL'; ralentissement = '0 sec/km';
    conseil = 'Conditions idéales pour courir.';
  }

  return {
    niveau, ralentissement, conseil,
    elevation_fc_bpm: elevFC,
    perte_perf_pct: pertePerfPct,
    ralent_sec_km: ralentSecKm,
    zone_ef_ajustee: elevFC > 0 ? `${zoneBas}-${zoneHaut} bpm` : null,
    note_fc: elevFC > 0
      ? `RÈGLE FC CHALEUR (Mora-Rodriguez) : à ${Math.round(t)}°C, la FC s'élève de +${elevFC} bpm. ` +
        `Zone EF effective = ${zoneBas}-${zoneHaut} bpm (au lieu de 140-148 bpm). ` +
        `FC effective corrigée = FC mesurée - ${elevFC} bpm. ` +
        `EXEMPLE : FC 155 bpm mesurée → FC effective ${155 - elevFC} bpm → ` +
        (155 - elevFC <= 148 ? `DANS la zone EF ✅ — NE PAS pénaliser.` : `hors zone de ${155 - elevFC - 148} bpm.`)
      : null
  };
}

let _posCache = null, _posCacheTs = 0;
let _weatherCache = null, _weatherCacheTs = 0; // cache météo 30 min
async function _getPosition() {
  // Cache mémoire 30 min — évite toute re-demande iOS dans la même session
  if (_posCache && Date.now() - _posCacheTs < 30 * 60 * 1000) return _posCache;
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    const timeout = setTimeout(() => resolve(null), 10000);
    navigator.geolocation.getCurrentPosition(
      pos => {
        clearTimeout(timeout);
        _posCache = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        _posCacheTs = Date.now();
        // Persister dans Firebase avec timestamp — valable 30 jours
        if (typeof dbRef !== 'undefined' && dbRef) {
          dbRef.child('_geo_granted').set(true).catch(()=>{});
          dbRef.child('_last_location').set({
            lat: Math.round(pos.coords.latitude*1000)/1000,
            lng: Math.round(pos.coords.longitude*1000)/1000,
            ts: Date.now()
          }).catch(()=>{});
        }
        resolve(_posCache);
      },
      () => {
        clearTimeout(timeout);
        // Basse précision (réseau/wifi) — maximumAge 60 min pour éviter re-demande
        navigator.geolocation.getCurrentPosition(
          pos => {
            _posCache = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            _posCacheTs = Date.now();
            resolve(_posCache);
          },
          () => resolve(null),
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 3600000 }
        );
      },
      // maximumAge: 30 min — iOS peut utiliser une position récente sans re-demander
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 1800000 }
    );
  });
}

async function _isGeolocationGranted() {
  // Cache mémoire (30 min)
  if (_posCache && Date.now() - _posCacheTs < 30 * 60 * 1000) return true;
  // Localisation en state local (< 30 jours) = permission accordée dans le passé
  try {
    const locRaw = state && state['_last_location'];
    if (locRaw) {
      const loc = typeof locRaw === 'string' ? JSON.parse(locRaw) : locRaw;
      if (loc && loc.lat && loc.ts && (Date.now() - loc.ts < 30 * 24 * 60 * 60 * 1000)) return true;
    }
  } catch(e) {}
  // Firebase direct
  if (typeof dbRef !== 'undefined' && dbRef) {
    try {
      const snap = await dbRef.child('_last_location').once('value');
      const loc = snap.val();
      if (loc && loc.lat && loc.ts && (Date.now() - loc.ts < 30 * 24 * 60 * 60 * 1000)) return true;
    } catch(e) {}
    try {
      const snap = await dbRef.child('_geo_granted').once('value');
      if (snap.val() === true) return true;
    } catch(e) {}
  }
  // API Permissions (Android/desktop)
  if (navigator.permissions) {
    try {
      const perm = await navigator.permissions.query({ name: 'geolocation' });
      if (perm.state === 'granted') return true;
    } catch(e) {}
  }
  return false;
}

async function fetchWeatherIfGranted(targetHourStr, targetDate) {
  // Version "silencieuse" : utilise le cache si dispo, sinon vérifie la permission
  // Cache récent (< 2h) → retourne directement sans aucune géoloc
  if (!targetHourStr && !targetDate && _weatherCache && Date.now() - _weatherCacheTs < 2 * 60 * 60 * 1000) {
    return Object.assign({}, _weatherCache, { depuis_cache: true });
  }
  // Sinon : vérifie permission sans popup
  const granted = await _isGeolocationGranted();
  if (!granted) return null;
  return fetchWeatherForContext(targetHourStr, targetDate);
}

// ── MÉTÉO ACCUEIL ─────────────────────────────────────────────────────────────
let _homeWeatherTs = 0;

async function _updateHomeWeather() {
  // Utilise fetchWeatherIfGranted : ne déclenche PAS de popup géoloc
  const loading = document.getElementById('home-weather-loading');
  if (loading) loading.style.display = 'flex';
  try {
    const meteo = await fetchWeatherIfGranted(null, null);
    if (loading) loading.style.display = 'none';
    if (!meteo) return;
    _homeWeatherTs = Date.now();
    window._lastHomeMeteo = meteo; // stocker pour le modal détail
    const strip  = document.getElementById('home-weather-strip');
    const iconEl = document.getElementById('home-weather-icon');
    const tempEl = document.getElementById('home-weather-temp');
    if (!strip || !iconEl || !tempEl) return;
    iconEl.textContent = meteo.conditions?.split(' ').pop() || '🌤️';
    tempEl.textContent = meteo.temperature.toFixed(1) + '°';
    strip.style.opacity = '0';
    strip.style.transition = 'opacity 0.5s ease';
    strip.style.display = 'flex';
    requestAnimationFrame(() => { strip.style.opacity = '1'; });
  } catch(e) {
    if (loading) loading.style.display = 'none';
  }
}

// ── MODAL DÉTAIL MÉTÉO ACCUEIL ───────────────────────────────────────────────
async function openHomeWeatherModal() {
  const mc = document.getElementById('modal-container');
  if (!mc) return;

  // Quand l'utilisateur clique explicitement → toujours récupérer la vraie position
  // et mettre à jour Firebase (corrige le bug ville Villiers-Saint-Georges)
  const tmpOverlay = document.createElement('div');
  tmpOverlay.className = 'modal-overlay';
  tmpOverlay.innerHTML = '<div class="modal-box" style="padding:32px 16px;text-align:center;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0C447C" stroke-width="2" stroke-linecap="round" style="animation:_spin 1s linear infinite;margin:0 auto 12px;display:block;"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg><p style="font-size:13px;color:#666;margin:0;">Récupération météo…</p></div>';
  mc.appendChild(tmpOverlay);

  // Tenter d'obtenir position réelle (met à jour Firebase automatiquement)
  const freshPos = await _getPosition();
  if (freshPos && dbRef) {
    try {
      const city = await _getCityFromCoords(freshPos.lat, freshPos.lng);
      await dbRef.child('_last_location').set({
        lat: Math.round(freshPos.lat*1000)/1000,
        lng: Math.round(freshPos.lng*1000)/1000,
        ville: city,
        ts: Date.now()
      });
      // Mettre à jour le state local pour fetchWeatherForContext
      if(typeof state !== 'undefined') state['_last_location'] = {
        lat: Math.round(freshPos.lat*1000)/1000,
        lng: Math.round(freshPos.lng*1000)/1000,
        ville: city,
        ts: Date.now()
      };
    } catch(e) {}
  }

  // Toujours refetcher la météo (pas de cache stale)
  window._lastHomeMeteo = null;
  const meteo = await fetchWeatherForContext(null, null);
  mc.removeChild(tmpOverlay);
  if (!meteo) return;
  window._lastHomeMeteo = meteo;

  const impactColors = { IDEAL:'#2E7D32', MODERE:'#E65100', ELEVE:'#C62828', EXTREME:'#B71C1C', HUMIDE:'#1565C0', FROID:'#37474F' };
  const impactLabels = { IDEAL:'Idéal', MODERE:'Chaleur modérée', ELEVE:'Forte chaleur', EXTREME:'Chaleur extrême', HUMIDE:'Humide', FROID:'Froid' };
  const niveau      = meteo.impact_performance?.niveau || 'IDEAL';
  const impactColor = impactColors[niveau] || '#2E7D32';
  const impactLabel = impactLabels[niveau] || niveau;
  const condIcon    = meteo.conditions?.split(' ').pop() || '🌤️';
  const elevFC      = meteo.impact_performance?.elevation_fc_bpm || 0;
  const city        = meteo.ville || 'Position actuelle';
  const now         = new Date();
  const heureStr    = now.getHours() + 'h' + String(now.getMinutes()).padStart(2,'0');
  const condTxt     = (meteo.conditions||'').replace(/\p{Emoji_Presentation}/gu,'').replace(/\p{Extended_Pictographic}/gu,'').trim();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const pertePerfPct = meteo.impact_performance?.perte_perf_pct || 0;
  const ralentSecKm  = meteo.impact_performance?.ralent_sec_km || 0;

  const fcBlock = elevFC > 0
    ? '<div style="background:#FF6F0010;border-radius:12px;padding:10px;text-align:center;"><p style="font-size:16px;margin:0 0 2px;">❤️</p><p style="font-size:15px;font-weight:700;color:#E65100;margin:0;">+' + elevFC + ' bpm</p><p style="font-size:10px;color:var(--muted);margin:2px 0 0;">FC chaleur</p></div>'
    : '<div style="background:var(--bg2);border-radius:12px;padding:10px;text-align:center;"><p style="font-size:16px;margin:0 0 2px;">🌡️</p><p style="font-size:15px;font-weight:700;color:var(--text);margin:0;">' + meteo.ressenti.toFixed(1) + '°</p><p style="font-size:10px;color:var(--muted);margin:2px 0 0;">Ressenti</p></div>';

  // Bloc Mora-Rodriguez (uniquement si > 25°C) — données exactes du tableau
  const moraBlock = pertePerfPct > 0 ? (()=>{
    const tDisplay = Math.floor(meteo.temperature); // Température réelle tronquée (32.5 → 32)
    const degAuDessus = Math.max(0, tDisplay - 25);

    // ── Allure EF dynamique (celle affichée en haut à droite de l'accueil) ──
    const _efPaceStr = getBestEfPace(); // ex: "5'39" ou "5'56"
    const _efBaseSec = _efPaceStr ? paceStrToSec(_efPaceStr.replace("'",":")) : 339; // 339s = 5'39
    // Tableau exact Mora-Rodriguez : +7 sec/km et +2 bpm par °C au-dessus de 25°C
    const _efAjusteSec = _efBaseSec + degAuDessus * 7;
    const _efAjusteMin = Math.floor(_efAjusteSec / 60);
    const _efAjusteSec2 = _efAjusteSec % 60;
    const _efAjusteStr = `${_efAjusteMin}'${String(_efAjusteSec2).padStart(2,'0')}`;
    const _fcAjustee = 148 + degAuDessus * 2; // FC cible à cet effort EF = 148 + 2/°C

    const barPct = Math.min(100, pertePerfPct * 5); // 20% perte = 100% barre
    const barColor = pertePerfPct <= 4 ? '#E65100' : pertePerfPct <= 10 ? '#C62828' : '#B71C1C';
    const minutes_perdues = Math.round(ralentSecKm * 42.195 / 60);

    // Ligne de référence base EF
    const efBaseLabel = _efPaceStr ? `Base EF (25°C) : ${_efPaceStr}/km · 148 bpm` : '';

    return `<div style="background:#FFF3E0;border-radius:14px;padding:12px 14px;margin-bottom:12px;border:1.5px solid #FF6D0030;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:14px;">🔬</span>
          <p style="font-size:11px;font-weight:700;color:#E65100;text-transform:uppercase;letter-spacing:0.05em;margin:0;">🌡️ Performance vs Météo ☀️🥵</p>
        </div>
        <span style="background:${barColor}18;border-radius:20px;padding:3px 10px;font-size:12px;font-weight:700;color:${barColor};">-${pertePerfPct}% perf</span>
      </div>

      <!-- Barre de chaleur -->
      <div style="background:rgba(0,0,0,0.06);border-radius:6px;height:7px;overflow:hidden;margin-bottom:4px;">
        <div style="height:100%;width:${barPct}%;background:linear-gradient(90deg,#FF9800,${barColor});border-radius:6px;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:9px;color:#bbb;margin-bottom:10px;">
        <span>25°C</span><span>30°C (−10%)</span><span>35°C (−20%)</span>
      </div>

      <!-- Bloc principal : allure EF + FC prédites -->
      <div style="background:white;border-radius:10px;padding:10px 12px;margin-bottom:8px;border:1.5px solid ${barColor}25;">
        <p style="font-size:9px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.04em;margin:0 0 8px;">À ${tDisplay}°C — ton EF aujourd'hui</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div style="text-align:center;">
            <p style="font-size:10px;color:var(--muted);margin:0 0 3px;">Allure EF cible</p>
            <p style="font-size:22px;font-weight:800;color:${barColor};margin:0;line-height:1;">${_efAjusteStr}</p>
            <p style="font-size:9px;color:#aaa;margin:2px 0 0;">/km · +${ralentSecKm}s vs base</p>
          </div>
          <div style="text-align:center;border-left:1px solid #f0f0f0;">
            <p style="font-size:10px;color:var(--muted);margin:0 0 3px;">FC équivalente</p>
            <p style="font-size:22px;font-weight:800;color:#E24B4A;margin:0;line-height:1;">~${_fcAjustee}</p>
            <p style="font-size:9px;color:#aaa;margin:2px 0 0;">bpm · +${degAuDessus * 2} vs 148</p>
          </div>
        </div>
        ${efBaseLabel ? `<p style="font-size:9px;color:#ccc;margin:8px 0 0;text-align:center;border-top:1px solid #f5f5f5;padding-top:6px;">${efBaseLabel}</p>` : ''}
      </div>

    </div>`;
  })() : '';

  overlay.innerHTML = '<div class="modal-box" style="max-height:90vh;overflow-y:auto;">'
    // Handle bar
    + '<div style="width:36px;height:4px;background:rgba(0,0,0,0.15);border-radius:4px;margin:12px auto 0;flex-shrink:0;"></div>'
    // Contenu avec padding correct
    + '<div style="padding:16px 20px 32px;">'
    // Header : ville + heure + bouton fermer
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:18px;">'
    +   '<div style="flex:1;min-width:0;">'
    +     '<p style="font-size:18px;font-weight:800;color:var(--text);margin:0 0 2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📍 ' + city + '</p>'
    +     '<p style="font-size:12px;color:#aaa;margin:0;">Aujourd\'hui · ' + heureStr + '</p>'
    +   '</div>'
    +   '<button onclick="_unlockBodyScroll();this.closest(\'.modal-overlay\').remove()" style="background:var(--bg2);border:1px solid var(--border);cursor:pointer;color:var(--muted);font-size:18px;line-height:1;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">×</button>'
    + '</div>'
    + '<div style="display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,#EDF2FB,#dce8f8);border-radius:16px;padding:16px 18px;margin-bottom:12px;">'
    +   '<div style="display:flex;align-items:center;gap:12px;">'
    +     '<span style="font-size:48px;line-height:1;">' + condIcon + '</span>'
    +     '<div><p style="font-size:42px;font-weight:800;color:#0C447C;margin:0;line-height:1;">' + meteo.temperature.toFixed(1) + '°</p>'
    +     '<p style="font-size:12px;color:#6B8DB5;margin:4px 0 0;">Ressenti <b>' + meteo.ressenti.toFixed(1) + '°C</b></p></div>'
    +   '</div>'
    +   '<div style="text-align:right;">'
    +     '<p style="font-size:13px;color:#0C447C;font-weight:600;margin:0 0 4px;">' + condTxt + '</p>'
    +     '<span style="background:' + impactColor + '18;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:700;color:' + impactColor + ';">' + impactLabel + '</span>'
    +   '</div>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px;">'
    +   '<div style="background:var(--bg2);border-radius:12px;padding:10px;text-align:center;"><p style="font-size:18px;margin:0 0 2px;">💧</p><p style="font-size:15px;font-weight:700;color:var(--text);margin:0;">' + meteo.humidite + '%</p><p style="font-size:10px;color:var(--muted);margin:2px 0 0;">Humidité</p></div>'
    +   '<div style="background:var(--bg2);border-radius:12px;padding:10px;text-align:center;"><p style="font-size:18px;margin:0 0 2px;">💨</p><p style="font-size:15px;font-weight:700;color:var(--text);margin:0;">' + meteo.vent_kmh + '</p><p style="font-size:10px;color:var(--muted);margin:2px 0 0;">km/h vent</p></div>'
    +   fcBlock
    + '</div>'
    + moraBlock
    + '<div id="weather-coach-section" style="border-radius:14px;overflow:hidden;">'
    +   '<button onclick="_triggerWeatherCoachAdvice()" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 16px;background:' + impactColor + '12;border:1.5px solid ' + impactColor + '30;border-radius:14px;cursor:pointer;">'
    +     '<span style="font-size:16px;">🤖</span>'
    +     '<span style="font-size:13px;font-weight:600;color:' + impactColor + ';">Conseils Coach IA</span>'
    +     '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + impactColor + '" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>'
    +   '</button>'
    +   '<div id="weather-coach-advice" style="display:none;"></div>'
    + '</div>'
    + '</div>' // ferme padding wrapper
    + '</div>'; // ferme modal-box

  overlay.onclick = e => { if (e.target === overlay) { _unlockBodyScroll(); overlay.remove(); } };
  _lockBodyScroll();
  mc.appendChild(overlay);
  const box = overlay.querySelector('.modal-box');
  box.style.opacity = '0';
  box.style.transition = 'opacity 0.25s ease';
  requestAnimationFrame(() => { box.style.opacity = '1'; });

}

function _triggerWeatherCoachAdvice() {
  const btn = document.querySelector('#weather-coach-section button');
  const div = document.getElementById('weather-coach-advice');
  if (!div || !btn) return;
  // Afficher le div, cacher le bouton, lancer la génération
  btn.style.display = 'none';
  div.style.display = 'block';
  div.innerHTML = '<div style="padding:14px 16px;background:rgba(12,68,124,0.05);border:1.5px solid rgba(12,68,124,0.15);border-radius:14px;margin-top:2px;"><div class="coach-typing"><span>Le Coach analyse la météo</span><div class="coach-typing-dots"><i></i><i></i><i></i></div></div></div>';
  // Récupérer la météo stockée
  const meteo = window._lastHomeMeteo;
  const impactColors = { IDEAL:"#2E7D32", MODERE:"#E65100", ELEVE:"#C62828", EXTREME:"#B71C1C", HUMIDE:"#1565C0", FROID:"#37474F" };
  const impactColor = impactColors[meteo?.impact_performance?.niveau || 'IDEAL'] || '#2E7D32';
  _fetchWeatherCoachAdvice(meteo, impactColor);
}

async function _fetchWeatherCoachAdvice(meteo, impactColor) {
  const adviceEl = document.getElementById('weather-coach-advice');
  if (!adviceEl) return;

  // Construire le contexte COMPLET comme pour coachChat normal
  const now = new Date();
  const joursSemaine = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const joursNoms = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  const moisNoms = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const heureActuelle = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  const jourActuel = joursSemaine[now.getDay()];
  const jourActuelLower = joursNoms[now.getDay()];
  const todayDayNum = now.getDay() === 0 ? 7 : now.getDay();
  const dateStr = jourActuelLower + ' ' + now.getDate() + ' ' + moisNoms[now.getMonth()] + ' ' + now.getFullYear();

  // Séances du jour
  const seancesAujourdhui = [];
  getOrderedWeekSessions(CW).forEach(({s, si, extra, ei}) => {
    if (extra) {
      // Séances extra : lire sched_day directement sur l'objet extra
      const done = !!state[`extra_w${CW}_s${ei}_done`];
      if(done) return;
      if(s.sched_day === todayDayNum)
        seancesAujourdhui.push({type: s.type, titre: s.d.split('|')[0], km: s.km, heure: s.sched_time||null});
      return;
    }
    const edRaw = state['edit_w' + CW + '_s' + si];
    if (!edRaw) return;
    const ed = JSON.parse(edRaw);
    if (ed.sched_day === todayDayNum && !state[gk(CW, si) + 'done'])
      seancesAujourdhui.push({type: ed.type||s.type, titre: ed.d ? ed.d.split('|')[0] : s.d.split('|')[0], km: ed.km||s.km, heure: ed.sched_time||null});
  });

  // Mémos coach
  let coachMemos = '';
  try { const ms = await dbRef.child('_coach_memos').once('value'); coachMemos = ms.val() || ''; } catch(e) {}

  // Contexte compact complet (plan, nutrition, progression, FC repos...)
  const compactCtx = buildCompactContext(coachMemos, seancesAujourdhui, jourActuel, heureActuelle);

  // Prochaines séances
  const seancesAVenir = [];
  const joursC = ['','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  const tDow = todayDayNum;
  getOrderedWeekSessions(CW).forEach(({s, si, extra, ei}) => {
    if (seancesAVenir.length >= 3) return;
    const done = extra ? !!state['extra_w'+CW+'_s'+ei+'_done'] : !!state[gk(CW,si)+'done'];
    if (done) return;
    const edRaw = !extra && state['edit_w'+CW+'_s'+si];
    const ed = edRaw ? JSON.parse(edRaw) : null;
    const titre = ed ? ed.d.split('|')[0] : s.d.split('|')[0];
    const type = ed ? ed.type : s.type;
    const km = ed ? ed.km : s.km;
    const jourC = ed && ed.sched_day ? joursC[ed.sched_day] : '';
    const heure = ed && ed.sched_time ? ed.sched_time : '';
    seancesAVenir.push({type, titre, km, quand: jourC + (heure ? ' à ' + heure : '')});
  });

  const elevFC = meteo.impact_performance?.elevation_fc_bpm || 0;

  const stateContext = Object.assign({}, compactCtx, {
    date_reelle: { complet: dateStr, jour: jourActuelLower, numero: now.getDate(), mois: moisNoms[now.getMonth()], heure: heureActuelle },
    seances_a_venir: seancesAVenir,
    meteo_actuelle: meteo,
  });

  const msg = 'Météo : ' + Math.round(meteo.temperature) + '°C (ressenti ' + Math.round(meteo.ressenti) + '°C), '
    + meteo.humidite + '% humidité, ' + meteo.conditions
    + (elevFC > 0 ? '. FC +' + elevFC + ' bpm attendus.' : '.')
    + (seancesAujourdhui.length > 0
      ? ' Séance : ' + seancesAujourdhui.map(s => s.titre + ' ' + s.km + 'km' + (s.heure ? ' à ' + s.heure : '')).join(' + ') + '.'
      : ' Pas de séance planifiée.')
    + ' Donne 3 conseils courts et concrets pour courir dans ces conditions.';

  try {
    const resp = await fetch('https://us-central1-prepa-marathon.cloudfunctions.net/coachChat', {
      method: 'POST',
      headers: await authHeaders(true),
      body: JSON.stringify({ message: msg, history: [], stateContext, responseMode: 'meteo' })
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);

    // Lire tout le stream sans affichage intermédiaire
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let full = '', buf = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const d = line.slice(6).trim();
        if (d === '[DONE]') continue;
        try { const p = JSON.parse(d); if (p.token) full += p.token; } catch(e2) {}
      }
    }

    // Afficher tout d'un coup avec un fade-in
    const el = document.getElementById('weather-coach-advice');
    if (!el) return;
    const html = full ? renderCoachText(fixAccents(cleanTruncated(full))) : '<span style="color:#aaa;font-style:italic;">Pas de conseil disponible.</span>';
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.4s ease';
    el.innerHTML = '<div style="padding:14px 16px;background:rgba(12,68,124,0.05);border:1.5px solid rgba(12,68,124,0.15);border-radius:14px;margin-top:2px;font-size:13px;color:var(--text);line-height:1.7;">' + html + '</div>';
    requestAnimationFrame(() => { el.style.opacity = '1'; });

  } catch(e) {
    const el = document.getElementById('weather-coach-advice');
    if (el) el.innerHTML = '<span style="color:#aaa;font-style:italic;">Conseil indisponible — vérifie ta connexion.</span>';
  }
}



// ── MAJ AUTOMATIQUE LOCALISATION ────────────────────────────────────────────
let _lastAutoLocTs = 0;

async function _autoUpdateLocation() {
  // Mettre à jour la position au maximum une fois par semaine
  // (et seulement si la permission a déjà été accordée)
  if (Date.now() - _lastAutoLocTs < 7 * 24 * 60 * 60 * 1000) return;

  // Vérifier via Firebase si une localisation récente existe déjà (< 7 jours)
  if (typeof dbRef !== 'undefined' && dbRef) {
    try {
      const snap = await dbRef.child('_last_location').once('value');
      const loc = snap.val();
      if (loc && loc.ts && (Date.now() - loc.ts < 7 * 24 * 60 * 60 * 1000)) {
        _lastAutoLocTs = Date.now();
        return; // Position récente en Firebase — pas besoin de re-demander
      }
    } catch(e) {}
  }

  const granted = await _isGeolocationGranted();
  if (!granted) return;
  try {
    const pos = await _getPosition();
    if (!pos || !dbRef) return;
    const city = await _getCityFromCoords(pos.lat, pos.lng);
    await dbRef.child('_last_location').set({
      lat: Math.round(pos.lat*1000)/1000,
      lng: Math.round(pos.lng*1000)/1000,
      ville: city,
      ts: Date.now()
    });
    _lastAutoLocTs = Date.now();
  } catch(e) {}
}

// ── FETCH AUTO MÉTÉO HISTORIQUE ─────────────────────────────────────────────
// Récupère la vraie météo depuis Open-Meteo archive pour toutes les séances
// passées qui n'ont pas encore de météo — s'exécute depuis le navigateur client
async function autoFetchMissingMeteo() {
  // Ne tourner qu'une fois par session
  if (window._meteoAutoFetchDone) return;
  window._meteoAutoFetchDone = true;

  // ── Localisation des séances rétroactives ─────────────────────────────────
  // Pour les séances passées sans météo (validées sans appuyer sur le bouton météo),
  // on ne connaît pas le lieu exact. Paris est utilisé comme défaut.
  // Pour les nouvelles validations : le bouton météo capture le GPS précis au moment de la séance.
  function _getLocForDate(_date) {
    return { lat: 48.8566, lng: 2.3522, ville: 'Paris' };
  }

  // Collecter les séances passées SANS météo, avec une date connue
  const missing = [];
  for (let ws = 1; ws <= CW; ws++) {
    weeks[ws-1].sessions.forEach((sess, si) => {
      const k = gk(ws, si);
      if (!state[k + 'done']) return;
      const perfRaw = state[k + 'perf'];
      if (!perfRaw) return;
      let perf = {};
      try { perf = typeof perfRaw === 'string' ? JSON.parse(perfRaw) : perfRaw; } catch(e) { return; }
      if (!perf.date || perf.meteo) return; // déjà une météo ou pas de date
      // Heure de la séance depuis les edits
      const edRaw = state['edit_w' + ws + '_s' + si];
      const ed = edRaw ? (typeof edRaw === 'string' ? JSON.parse(edRaw) : edRaw) : null;
      const heureStr = ed && ed.sched_time ? ed.sched_time : '10:00'; // défaut 10h
      const loc = _getLocForDate(perf.date);
      // Surcharge ville pour séances connues (lieu précis mémorisé)
      let villeOverride = null;
      if (perf.date === '2026-05-26') villeOverride = 'Porte de Seine';
      missing.push({ ws, si, k, perf, date: perf.date, heure: heureStr, lat: loc.lat, lng: loc.lng, ville: villeOverride || loc.ville });
    });
  }

  if (missing.length === 0) return;

  // Grouper par date pour minimiser les requêtes API
  const byDate = {};
  missing.forEach(m => {
    if (!byDate[m.date]) byDate[m.date] = [];
    byDate[m.date].push(m);
  });

  for (const [date, sessions] of Object.entries(byDate)) {
    const today = new Date().toISOString().slice(0, 10);
    if (date > today) continue; // pas de données future

    // Localisation pour cette date (toutes les sessions du même jour ont la même loc)
    const loc = _getLocForDate(date);
    const lat = loc.lat, lng = loc.lng;

    try {
      // Utiliser l'API historique (past_days) ou archive selon l'ancienneté
      const diffDays = Math.round((new Date(today) - new Date(date)) / 86400000);
      let url;
      if (diffDays <= 92) {
        // Dans les 3 mois : forecast avec past_days
        url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&timezone=auto&past_days=${Math.min(diffDays + 1, 92)}&forecast_days=1`;
      } else {
        // Plus ancien : archive
        url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${date}&end_date=${date}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`;
      }

      const resp = await fetch(url, { credentials: 'omit', cache: 'no-store', mode: 'cors' });
      if (!resp.ok) continue;
      const data = await resp.json();
      const h = data.hourly;
      if (!h || !h.temperature_2m) continue;

      // Pour chaque session ce jour-là, injecter la météo
      for (const sess of sessions) {
        const targetH = parseInt(sess.heure.split(':')[0]);
        // Trouver l'index de l'heure dans le tableau (peut ne pas commencer à 0)
        let idx = targetH;
        if (data.hourly.time) {
          const timeArr = data.hourly.time;
          // Chercher l'index correspondant à cette date + heure
          const target = date + 'T' + String(targetH).padStart(2,'0') + ':00';
          const foundIdx = timeArr.findIndex(t => t === target);
          if (foundIdx >= 0) idx = foundIdx;
        }

        const temp = h.temperature_2m?.[idx];
        const apparent = h.apparent_temperature?.[idx];
        const humidity = h.relative_humidity_2m?.[idx];
        const weatherCode = h.weather_code?.[idx];
        const windSpeed = h.wind_speed_10m?.[idx];
        const isDay = h.is_day?.[idx] ?? 1;

        if (temp == null) continue;

        // Ville connue selon la date (pas besoin de reverse geocoding)
        const ville = loc.ville || null;

        const impact = _weatherImpact(temp, humidity, apparent);
        const meteo = {
          date: date,
          heure_cible: sess.heure,
          ville: ville || null,
          temperature: Math.round(temp * 10) / 10,
          ressenti: Math.round((apparent || temp) * 10) / 10,
          humidite: Math.round(humidity || 0),
          vent_kmh: Math.round((windSpeed || 0) * 10) / 10,
          conditions: _wmoLabel(weatherCode, isDay),
          impact_performance: impact,
          note: `MÉTÉO${ville ? ' à ' + ville : ''} : ${Math.round(temp)}°C (ressenti ${Math.round(apparent||temp)}°C), ${Math.round(humidity||0)}% humidité.` +
                (impact.elevation_fc_bpm > 0 ? ` FC effective = FC mesurée - ${impact.elevation_fc_bpm} bpm.` : '') +
                (impact.perte_perf_pct > 0 ? ` Perte perf Mora-Rodriguez : -${impact.perte_perf_pct}%.` : ' Conditions idéales.')
        };

        // Sauvegarder dans state + Firebase
        const updated = { ...sess.perf, meteo };
        state[sess.k + 'perf'] = JSON.stringify(updated);
        if (dbRef) dbRef.child(sess.k + 'perf').set(state[sess.k + 'perf']).catch(() => {});

        console.log(`[AutoMeteo] ${date} ${sess.heure} → ${temp}°C ressenti ${apparent}°C (${impact.niveau})`);
      }

    } catch (e) {
      console.warn('[AutoMeteo] Erreur pour', date, e.message);
    }

    // Petite pause entre les requêtes
    await new Promise(r => setTimeout(r, 300));
  }
}

async function fetchWeatherForContext(targetHourStr, targetDate) {
  try {
    // ── Position : priorité absolue au cache Firebase (30 jours) ──────────────
    // Ne jamais appeler _getPosition() automatiquement — seulement si l'utilisateur
    // a cliqué sur un bouton Météo explicite (importMeteoValidation, openHomeWeatherModal)
    let pos = null;

    // 1. Cache mémoire (30 min)
    if (_posCache && Date.now() - _posCacheTs < 30 * 60 * 1000) {
      pos = _posCache;
    }

    // 2. State local (chargé au démarrage depuis Firebase)
    if (!pos) {
      try {
        const locRaw = state && state['_last_location'];
        if (locRaw) {
          const loc = typeof locRaw === 'string' ? JSON.parse(locRaw) : locRaw;
          // TTL : 30 jours (on se déplace peu — Paris reste Paris)
          if (loc && loc.lat && loc.ts && (Date.now() - loc.ts < 30 * 24 * 60 * 60 * 1000)) {
            pos = { lat: loc.lat, lng: loc.lng };
          }
        }
      } catch(e) {}
    }

    // 3. Firebase direct (si state pas encore chargé)
    if (!pos && typeof dbRef !== 'undefined' && dbRef) {
      try {
        const snap = await dbRef.child('_last_location').once('value');
        const loc = snap.val();
        if (loc && loc.lat && loc.ts && (Date.now() - loc.ts < 30 * 24 * 60 * 60 * 1000)) {
          pos = { lat: loc.lat, lng: loc.lng };
        }
      } catch(e) {}
    }

    // 4. Fallback Paris — JAMAIS de popup géoloc automatique
    if (!pos) pos = { lat: 48.8417, lng: 2.2945 };

    const { lat, lng } = pos;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const dateStr = targetDate || todayStr;
    const isToday = (dateStr === todayStr);
    const isPast = (dateStr < todayStr);

    // Heure cible (entier 0-23)
    let targetH;
    if (targetHourStr) {
      targetH = parseInt(targetHourStr.split(':')[0]);
    } else {
      targetH = now.getHours();
    }

    let temp, humidity, apparent, weatherCode, windSpeed, isDay = 1;

    if (isPast) {
      // API historique pour les séances validées en décalé
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`;
      let _toId;
      const _timeoutP = new Promise((_,rej) => { _toId = setTimeout(() => rej(new Error('timeout')), 15000); });
      const r = await Promise.race([fetch(url, {credentials:'omit', cache:'no-store', mode:'cors'}), _timeoutP]);
      clearTimeout(_toId);
      const d = await r.json();
      if (!d.hourly) return null;
      temp       = d.hourly.temperature_2m?.[targetH];
      humidity   = d.hourly.relative_humidity_2m?.[targetH];
      apparent   = d.hourly.apparent_temperature?.[targetH];
      weatherCode= d.hourly.weather_code?.[targetH];
      windSpeed  = d.hourly.wind_speed_10m?.[targetH];
    } else if (isToday && !targetHourStr) {
      // Temps réel : endpoint "current" pour la température exacte maintenant
      // (évite le bug de l'index horaire qui donne la valeur du début de l'heure)
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&timezone=auto`;
      let _toId;
      const _timeoutP = new Promise((_,rej) => { _toId = setTimeout(() => rej(new Error('timeout')), 15000); });
      const r = await Promise.race([fetch(url, {credentials:'omit', cache:'no-store', mode:'cors'}), _timeoutP]);
      clearTimeout(_toId);
      const d = await r.json();
      if (!d.current) return null;
      temp        = d.current.temperature_2m;
      humidity    = d.current.relative_humidity_2m;
      apparent    = d.current.apparent_temperature;
      weatherCode = d.current.weather_code;
      windSpeed   = d.current.wind_speed_10m;
      isDay       = d.current.is_day ?? ((new Date().getHours() >= 7 && new Date().getHours() < 21) ? 1 : 0); // 1=jour, 0=nuit
    } else {
      // Prévision horaire : pour les séances planifiées (brief matin, notif)
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto&forecast_days=2`;
      let _toId;
      const _timeoutP = new Promise((_,rej) => { _toId = setTimeout(() => rej(new Error('timeout')), 15000); });
      const r = await Promise.race([fetch(url, {credentials:'omit', cache:'no-store', mode:'cors'}), _timeoutP]);
      clearTimeout(_toId);
      const d = await r.json();
      if (!d.hourly) return null;
      const idx = isToday ? targetH : 24 + targetH;
      temp        = d.hourly.temperature_2m?.[idx];
      humidity    = d.hourly.relative_humidity_2m?.[idx];
      apparent    = d.hourly.apparent_temperature?.[idx];
      weatherCode = d.hourly.weather_code?.[idx];
      windSpeed   = d.hourly.wind_speed_10m?.[idx];
    }

    if (temp == null) return null;

    // Reverse geocoding pour avoir la ville (non bloquant)
    let ville = null;
    try { ville = await _getCityFromCoords(lat, lng); } catch(e) {}

    const impact = _weatherImpact(temp, humidity, apparent);
    const _result = {
      date: dateStr,
      heure_cible: targetHourStr ? (targetH + 'h00') : 'maintenant',
      ville: ville || null,
      temperature: Math.round(temp * 10) / 10,
      ressenti: Math.round((apparent || temp) * 10) / 10,
      humidite: Math.round(humidity || 0),
      vent_kmh: Math.round((windSpeed || 0) * 10) / 10,  // Open-Meteo retourne déjà km/h
      conditions: _wmoLabel(weatherCode, isDay),
      impact_performance: impact,
      note_meteo: `MÉTÉO${ville ? ' — ' + ville : ''} : ${Math.round(temp)}°C (ressenti ${Math.round(apparent||temp)}°C), ${Math.round(humidity||0)}% humidité, ${_wmoLabel(weatherCode)}.`,
      note_allures: `PLANNING CHALEUR : à ${Math.round(apparent||temp)}°C ressenti, un coureur perd environ ${impact.ralentissement} vs ses allures par temps frais. ` +
                    `ATTENTION : ce chiffre est une estimation de planification, PAS la différence entre l'allure réalisée et l'allure cible. ` +
                    `La vraie différence allure réalisée vs cible doit TOUJOURS être calculée directement depuis les chiffres fournis (allure_réalisée - allure_cible en secondes). ` +
                    `Ne JAMAIS écrire "tu es X sec/km plus lent que ta cible" en utilisant la valeur ${impact.ralentissement}.`,
      note_fc: impact.note_fc || null,
      note: `MÉTÉO${ville ? ' à ' + ville : ''} : ${Math.round(temp)}°C (ressenti ${Math.round(apparent||temp)}°C), ${Math.round(humidity||0)}% humidité. ` +
            (impact.elevation_fc_bpm > 0
              ? `IMPACT FC : +${impact.elevation_fc_bpm} bpm attendus → zone EF effective ${impact.zone_ef_ajustee}. ` +
                `FC effective = FC mesurée - ${impact.elevation_fc_bpm} bpm. NE JAMAIS critiquer une FC > 148 bpm sans appliquer cette correction. `
              : '') +
            `CONTEXTE CHALEUR : ralentissement attendu vs conditions fraîches = ${impact.ralentissement} (estimation planning uniquement). ` +
            `RÈGLE ABSOLUE : pour comparer l'allure réalisée avec l'allure cible, utiliser UNIQUEMENT les secondes réelles des deux allures — jamais la fourchette ci-dessus. ` +
            impact.conseil
    };
    // Mettre en cache la météo (30 min) pour usage hors réseau
    _weatherCache = _result;
    _weatherCacheTs = Date.now();
    return _result;
  } catch(e) {
    // Plan B : essayer wttr.in (API météo alternative, si open-meteo bloqué)
    try {
      const pos2 = _posCache || { lat: 48.8417, lng: 2.2945 };
      const r2 = await fetch(`https://wttr.in/${pos2.lat},${pos2.lng}?format=j1`, {credentials:'omit',cache:'no-store',mode:'cors'});
      if (r2.ok) {
        const d2 = await r2.json();
        const cc = d2.current_condition?.[0];
        if (cc) {
          const temp2 = parseFloat(cc.temp_C);
          const feels2 = parseFloat(cc.FeelsLikeC);
          const hum2 = parseFloat(cc.humidity);
          const wind2 = parseFloat(cc.windspeedKmph);
          const wcode2 = parseInt(cc.weatherCode);
          const isNight = (new Date().getHours() >= 21 || new Date().getHours() < 6);
          // Table complète wttr.in → WMO (les codes wttr.in ≠ codes WMO)
          const _wttrToWmo = {113:0,116:2,119:3,122:3,143:45,176:80,179:71,182:77,185:51,200:95,227:71,230:75,248:45,260:48,263:51,266:53,281:55,284:55,293:61,296:61,299:63,302:65,305:65,308:65,311:77,314:77,317:77,320:73,323:71,326:71,329:73,332:73,335:75,338:75,350:77,353:80,356:81,359:82,362:80,365:80,368:71,371:71,374:77,377:77,386:95,389:95,392:96,395:99};
          const wmoCode2 = _wttrToWmo[wcode2] ?? 0;
          const cond2 = _wmoLabel(wmoCode2, isNight ? 0 : 1);
          const impact2 = _weatherImpact(temp2, hum2, feels2);
          const res2 = { date: new Date().toISOString().slice(0,10), heure_cible:'maintenant', ville: null,
            temperature: Math.round(temp2*10)/10, ressenti: Math.round(feels2*10)/10,
            humidite: Math.round(hum2), vent_kmh: Math.round(wind2*10)/10,
            conditions: cond2, impact_performance: impact2 };
          _weatherCache = res2; _weatherCacheTs = Date.now();
          return res2;
        }
      }
    } catch(e2) { /* wttr.in aussi indispo */ }
    // Cache si récent (< 2h)
    if (_weatherCache && Date.now() - _weatherCacheTs < 2 * 60 * 60 * 1000) {
      return Object.assign({}, _weatherCache, { depuis_cache: true });
    }
    return null;
  }
}


function calcWeekDoneKm(){
  let t=0;
  getOrderedWeekSessions(CW).forEach(({s,si,extra,ei})=>{
    if(extra){
      const k=`extra_w${CW}_s${ei}`;
      if(state[k+'_done']){const rv=state[k+'_km'];t+=(rv!=null?rv:s.km);}
      return;
    }
    const dn=state[gk(CW,si)+'done'],rv=state[gk(CW,si)+'km'];
    if(dn) t+=(rv!=null?rv:s.km);
  });
  return Math.round(t*10)/10;
}

function calcTotalDone(){
  // Pour les athlètes : seulement les km de leurs séances extra validées
  if(!isAdmin()){
    let t=0;
    for(let ws=1;ws<=52;ws++){
      let ei=0;
      while(state[`extra_w${ws}_s${ei}`]){
        if(state[`extra_w${ws}_s${ei}_done`]){
          const rv=state[`extra_w${ws}_s${ei}_km`];
          try{t+=rv!=null?parseFloat(rv):(parseFloat(JSON.parse(state[`extra_w${ws}_s${ei}`]).km)||0);}catch(e){}
        }
        ei++;
      }
    }
    return Math.round(t);
  }
  // Base = km historiques avant le début du tracking dans l'app
  let kmBase = 0;
  if(state['_km_historique'] != null) {
    kmBase = parseFloat(state['_km_historique']);
  } else {
    kmBase = KM_HISTORIQUE_BASE; // 243 km au 04/05/2026
  }
  const FIRST_TRACKED_WEEK = 9;
  let t = kmBase;
  for(let ws = FIRST_TRACKED_WEEK; ws <= CW; ws++){
    if(!weeks[ws-1]) continue;
    getOrderedWeekSessions(ws).forEach(({s,si,extra,ei})=>{
      if(extra){
        const k=`extra_w${ws}_s${ei}`;
        if(state[k+'_done']){const rv=state[k+'_km'];t+=(rv!=null?parseFloat(rv):s.km);}
        return;
      }
      const dn=state[gk(ws,si)+'done'], rv=state[gk(ws,si)+'km'];
      if(dn||rv!=null) t+=(rv!=null?parseFloat(rv):s.km);
    });
  }
  return Math.round(t);
}

function getNbSeries(seriesStr){
  const m = seriesStr.match(/^(\d+)/);
  return m ? parseInt(m[1]) : 3;
}

// Formate un temps cible "H:MM:SS" ou "MM:SS" en affichage court 4 chiffres
// Avec heures → "XhMM" (ex: "2h58"), sans heures → "MM:SS" (ex: "43:24")
function formatTargetTime(t){
  if(!t) return '—';
  const parts=t.split(':').map(Number);
  let h,m,s;
  if(parts.length===3){h=parts[0];m=parts[1];s=parts[2];}
  else if(parts.length===2){h=0;m=parts[0];s=parts[1];}
  else return t;
  if(h>0) return h+'h'+(m<10?'0':'')+m;
  return m+':'+(s<10?'0':'')+s;
}


function openRenfoSchedModal(r, targetWeek){
  const tw = targetWeek || CW;
  const key = rfk(tw,r)+'sched';
  const existing = state[key] ? JSON.parse(state[key]) : {};
  const renfoNames = ['','Ischio-fessiers','Bas du dos'];
  const renfoSubs  = ['','Fémoro-patellaire · 6 exos','Core stabilisation · 5 exos'];
  const name = renfoNames[r] || 'Renforcement';
  const sub  = renfoSubs[r]  || '';
  const isNextWeek = tw !== CW;
  const weekLabel = isNextWeek ? `S${tw} · Planification` : `S${tw} · Modifier le créneau`;

  // ── Champs jour ──
  const days = ['','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  const dayEmojis = ['','😴','💪','🔥','💪','🏃','🏔','😴'];
  const selDay = existing.day || '';
  const dayOpts = days.map((d,i) => i===0
    ? `<option value="">Choisir...</option>`
    : `<option value="${i}" ${selDay==i?'selected':''}>${dayEmojis[i]} ${d}</option>`
  ).join('');

  // ── Champs heure ──
  const tp = (existing.time||'08:00').split(':');
  const selH = parseInt(tp[0])||8;
  const selM = parseInt(tp[1])||0;
  const hourOpts = Array.from({length:24},(_,i)=>`<option value="${i}" ${selH===i?'selected':''}>${String(i).padStart(2,'0')}h</option>`).join('');
  const minOpts  = ['00','15','30','45'].map(m=>`<option value="${m}" ${String(selM).padStart(2,'0')===m?'selected':''}>${m}</option>`).join('');

  const mc = document.getElementById('modal-container');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.setProperty('--_overlay-bg','rgba(0,0,0,0.4)');

  overlay.innerHTML = `<div class="modal-box" style="max-height:92vh;">

    <!-- HEADER — même style que modal edit séance -->
    <div style="background:linear-gradient(145deg,#082050 0%,#0C447C 55%,#1560A8 100%);padding:16px 16px 18px;border-radius:24px 24px 0 0;flex-shrink:0;">
      <!-- Handle bar -->
      <div style="width:36px;height:4px;border-radius:4px;background:rgba(255,255,255,0.3);margin:0 auto 12px;"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div style="flex:1;min-width:0;">
          <p style="font-size:10px;font-weight:800;opacity:0.7;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:3px;color:#fff;">💪 ${weekLabel}</p>
          <p style="font-size:22px;font-weight:900;letter-spacing:-0.03em;line-height:1.1;color:#fff;">${name}</p>
          ${sub ? `<p style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:4px;font-weight:500;">${sub}</p>` : ''}
        </div>
        <button onclick="closeModal()" style="background:rgba(255,255,255,0.2);border:none;cursor:pointer;color:#fff;font-size:18px;line-height:1;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;">×</button>
      </div>
    </div>

    <!-- BODY scrollable -->
    <div class="modal-scroll-body">
    <div class="modal-body" style="gap:0;">

      <!-- Section planification -->
      <div class="modal-section" style="background:linear-gradient(135deg,#EEF2FD,#E8EDFF);">
        <div class="modal-section-label" style="color:#1B4FD8;">📅 Planification</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <p style="font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:7px;">📆 Jour</p>
            <select id="rf-sched-day" style="background:var(--bg);border:2px solid var(--border);border-radius:12px;padding:11px 12px;font-size:14px;font-weight:700;color:var(--text);width:100%;outline:none;cursor:pointer;">${dayOpts}</select>
          </div>
          <div>
            <p style="font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:7px;">⏰ Heure</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
              <select id="rf-sched-hour" style="background:var(--bg);border:2px solid var(--border);border-radius:12px;padding:11px 8px;font-size:14px;font-weight:700;color:var(--text);width:100%;outline:none;text-align:center;cursor:pointer;">${hourOpts}</select>
              <select id="rf-sched-min"  style="background:var(--bg);border:2px solid var(--border);border-radius:12px;padding:11px 8px;font-size:14px;font-weight:700;color:var(--text);width:100%;outline:none;text-align:center;cursor:pointer;">${minOpts}</select>
            </div>
          </div>
        </div>
      </div>

      <!-- Boutons action -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px;">
        <button onclick="clearRenfoSched(${r},${tw})" style="padding:14px;background:var(--bg2);border:2px solid var(--border);border-radius:14px;font-size:13px;font-weight:700;color:var(--muted);cursor:pointer;">↺ Effacer</button>
        <button onclick="saveRenfoSched(${r},${tw})" class="modal-btn-primary" style="background:#0C447C;">Enregistrer ✓</button>
      </div>

    </div>
    </div><!-- /modal-scroll-body -->
  </div>`;

  overlay.onclick = e => { if(e.target===overlay) closeModal(); };
  _lockBodyScroll();
  mc.appendChild(overlay);
  _initSwipeToDismiss(overlay, overlay.querySelector('.modal-box'));
}

function saveRenfoSched(r, targetWeek){
  const tw = targetWeek || CW;
  const day=parseInt(document.getElementById('rf-sched-day').value)||null;
  const rfH=document.getElementById('rf-sched-hour')?document.getElementById('rf-sched-hour').value:'08';
  const rfM=document.getElementById('rf-sched-min')?document.getElementById('rf-sched-min').value:'00';
  const time=day?(String(rfH).padStart(2,'0')+':'+String(rfM).padStart(2,'0')):null;
  if(day||time){
    state[rfk(tw,r)+'sched']=JSON.stringify({day:day||undefined,time:time||undefined});
  } else {
    delete state[rfk(tw,r)+'sched'];
  }
  save();
  closeModal();
  renderHome();
}

function clearRenfoSched(r,tw){
  const w=tw||CW;
  delete state[rfk(w,r)+'sched'];
  save();
  closeModal();
  renderHome();
}
// ── BADGE ALERTE COACH ────────────────────────────────────────────────────────
function checkCoachAlerts(){
  // Badge supprimé définitivement
  const badge = document.getElementById('coach-alert-badge');
  if(badge) badge.style.display = 'none';
}

function setCoachUnread(){
  // Badge supprimé — plus de point rouge sur le coach
  // window._coachHasUnread = true;
  // if(dbRef) dbRef.child('_coach_unread').set(true);
}

async function checkCoachUnread(){
  // Badge supprimé définitivement — cette fonction ne fait plus rien
  const badge = document.getElementById('coach-alert-badge');
  if(badge) badge.style.display = 'none';
  window._coachHasUnread = false;
}

// Re-vérifier le badge quand l'utilisateur revient sur l'app (depuis l'arrière-plan)
document.addEventListener('visibilitychange', function(){
  if(document.visibilityState === 'visible' && dbRef) {
    checkCoachUnread();
  }
});

