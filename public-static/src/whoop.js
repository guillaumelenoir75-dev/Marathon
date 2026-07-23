// ── WHOOP INTEGRATION ─────────────────────────────────────────────────────────

const WHOOP_SYNC_URL = FUNCTIONS_BASE + '/whoopSync';
const WHOOP_AUTH_URL = FUNCTIONS_BASE + '/whoopAuth';

let _whoopSyncing = false;

// Appelé au chargement de l'écran compte (admin uniquement)
async function initWhoopStatus() {
  if (!isAdmin()) return;
  const btn = document.getElementById('whoop-connect-btn');
  const disBtn = document.getElementById('whoop-disconnect-btn');
  const status = document.getElementById('whoop-status');
  if (!btn || !status) return;

  const token = state.whoop_token;
  const whoopDisconnected = state._whoop_disconnected;
  if (token && token.access_token) {
    const data = state.whoop_data;
    const updatedAt = data && data.updatedAt ? new Date(data.updatedAt) : null;
    const minutesAgo = updatedAt ? Math.round((Date.now() - updatedAt.getTime()) / 60000) : null;
    if (whoopDisconnected) {
      // Le backend a détecté que le token est invalide — afficher alerte reconnexion
      status.textContent = '⚠️ Reconnexion nécessaire';
      status.style.color = '#f59e0b';
      btn.innerHTML = '⚡ Reconnecter WHOOP';
      btn.onclick = connectWhoop;
    } else {
      status.textContent = minutesAgo !== null
        ? `Sync il y a ${minutesAgo < 60 ? minutesAgo + ' min' : Math.round(minutesAgo/60) + 'h'}`
        : 'Connecté';
      status.style.color = minutesAgo !== null && minutesAgo > 90 ? '#f59e0b' : '#22c55e';
      btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.2"/></svg> Synchroniser';
      btn.onclick = syncWhoop;
    }
    if (disBtn) disBtn.style.display = 'block';
  } else {
    status.textContent = 'Non connecté';
    status.style.color = '#f59e0b';
    btn.innerHTML = '⚡ Connecter';
    btn.onclick = connectWhoop;
    if (disBtn) disBtn.style.display = 'none';
  }
}

async function disconnectWhoop() {
  if (!confirm('Déconnecter WHOOP ? Tu devras te reconnecter pour synchroniser.')) return;
  if (dbRef) {
    await dbRef.child('whoop_token').remove();
    await dbRef.child('whoop_data').remove();
    state.whoop_token = null;
    state.whoop_data = null;
  }
  document.getElementById('whoop-stats-section')?.style && (document.getElementById('whoop-stats-section').style.display = 'none');
  initWhoopStatus();
}

function connectWhoop() {
  const popup = window.open(WHOOP_AUTH_URL, 'whoop_auth', 'width=500,height=700,left=100,top=100');
  if (!popup) { alert('Autorise les pop-ups pour connecter WHOOP'); return; }

  // Polling : attendre que la popup se ferme puis re-syncer
  const poll = setInterval(() => {
    if (!popup || popup.closed) {
      clearInterval(poll);
      setTimeout(() => {
        // Recharger l'état Firebase pour récupérer le token
        if (dbRef) {
          dbRef.child('whoop_token').once('value').then(snap => {
            const token = snap.val();
            if (token && token.access_token) {
              Object.assign(state, { whoop_token: token });
              // Effacer le flag de déconnexion si une reconnexion vient d'être faite
              dbRef.child('_whoop_disconnected').remove().catch(()=>{});
              state._whoop_disconnected = null;
              initWhoopStatus();
              syncWhoop();
            }
          });
        }
      }, 1000);
    }
  }, 1500);
}

// Relit whoop_data ET fc_repos_today depuis Firebase et met à jour state
async function _pullWhoopStateFromFirebase() {
  if (!dbRef) return null;
  const today = new Date().toISOString().slice(0, 10);
  const [wdSnap, fcSnap] = await Promise.all([
    dbRef.child('whoop_data').once('value'),
    dbRef.child('fc_repos_' + today).once('value')
  ]);
  const wd = wdSnap.val();
  if (wd) {
    state.whoop_data = wd;
    if (typeof renderWhoopStats === 'function') renderWhoopStats();
  }
  const fcVal = fcSnap.val();
  if (fcVal && fcVal >= 30 && fcVal <= 100) {
    state['fc_repos_' + today] = fcVal;
    state['fc_repos'] = fcVal;
    if (typeof renderHome === 'function') renderHome();
  }
  return wd || null;
}

// Sync WHOOP — retourne { wd, serverData } ou { wd: null, serverData, error }
async function syncWhoopFresh() {
  if (_whoopSyncing) {
    await new Promise(r => { const t = setInterval(() => { if (!_whoopSyncing) { clearInterval(t); r(); } }, 300); setTimeout(() => { clearInterval(t); r(); }, 20000); });
  }
  try {
    const resp = await fetch(WHOOP_SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const serverData = await resp.json();
    if (serverData.needsAuth) return { wd: null, serverData, error: 'needsAuth' };
    if (!serverData.success) return { wd: null, serverData, error: serverData.error || 'sync_failed' };
    const wd = await _pullWhoopStateFromFirebase();
    return { wd, serverData };
  } catch(e) {
    console.error('syncWhoopFresh error:', e);
    return { wd: null, serverData: null, error: e.message };
  }
}

async function syncWhoop() {
  if (_whoopSyncing) return;
  _whoopSyncing = true;

  const btn = document.getElementById('whoop-connect-btn');
  const status = document.getElementById('whoop-status');
  const panel = document.getElementById('whoop-data-panel');
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Sync…'; }

  try {
    const resp = await fetch(WHOOP_SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await resp.json();

    if (data.needsAuth) {
      const status = document.getElementById('whoop-status');
      if (status) { status.textContent = '⚠️ Reconnexion nécessaire'; status.style.color = '#f59e0b'; }
      // Afficher un bouton de reconnexion si on est sur l'écran Compte
      const btn2 = document.getElementById('whoop-connect-btn');
      if (btn2) { btn2.innerHTML = '⚡ Reconnecter WHOOP'; btn2.onclick = connectWhoop; btn2.disabled = false; }
      return;
    }

    if (!data.success) throw new Error(data.error || 'Erreur inconnue');

    // Mettre à jour l'état local depuis Firebase (whoop_data + fc_repos_today)
    await _pullWhoopStateFromFirebase();

    if (status) { status.textContent = 'Sync à l\'instant'; status.style.color = '#22c55e'; }

  } catch(e) {
    console.error('whoopSync error:', e);
    if (status) { status.textContent = 'Erreur sync'; status.style.color = '#ef4444'; }
  } finally {
    _whoopSyncing = false;
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.2"/></svg> Synchroniser'; btn.onclick = syncWhoop; }
  }
}

function _autoFillFcRepos(rhr) {
  const today = new Date().toISOString().slice(0, 10);
  // WHOOP est la source autoritaire pour la FC repos — toujours écraser avec la valeur du jour
  if (dbRef) {
    dbRef.child('fc_repos_' + today).set(rhr).then(() => {
      state['fc_repos_' + today] = rhr;
      const el = document.getElementById('kpi-fc-repos');
      if (el) el.textContent = rhr + ' bpm';
      if (typeof renderFcReposChart === 'function') renderFcReposChart();
    });
  }
}

function _renderWhoopPanel(wd, panel) {
  if (!panel) return;
  const r = wd.recoveries && wd.recoveries[0];
  const s = wd.sleeps && wd.sleeps[0];
  const cy = wd.cycles && wd.cycles[0];

  const scoreColor = (score) => score >= 67 ? '#22c55e' : score >= 34 ? '#f59e0b' : '#ef4444';
  const scoreLabel = (score) => score >= 67 ? 'Vert' : score >= 34 ? 'Jaune' : 'Rouge';

  let html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">';

  // Recovery
  if (r) {
    const sc = r.score != null ? r.score : null;
    html += `<div style="background:#f0fdf4;border-radius:10px;padding:10px;">
      <p style="font-size:10px;font-weight:700;color:#166534;margin:0 0 4px;text-transform:uppercase;">Recovery</p>
      ${sc != null ? `<p style="font-size:22px;font-weight:800;color:${scoreColor(sc)};margin:0;">${sc}%</p><p style="font-size:10px;color:#555;margin:0;">${scoreLabel(sc)}</p>` : '<p style="font-size:13px;color:#888;margin:0;">—</p>'}
      ${r.rhr ? `<p style="font-size:11px;color:#555;margin:4px 0 0;">FC repos : <strong>${r.rhr} bpm</strong></p>` : ''}
      ${r.hrv ? `<p style="font-size:11px;color:#555;margin:2px 0 0;">HRV : <strong>${Math.round(r.hrv)} ms</strong></p>` : ''}
    </div>`;
  }

  // Sleep
  if (s) {
    const sp = s.performance_pct;
    html += `<div style="background:#eff6ff;border-radius:10px;padding:10px;">
      <p style="font-size:10px;font-weight:700;color:#1e40af;margin:0 0 4px;text-transform:uppercase;">Sommeil</p>
      ${sp != null ? `<p style="font-size:22px;font-weight:800;color:${scoreColor(sp)};margin:0;">${sp}%</p><p style="font-size:10px;color:#555;margin:0;">Performance</p>` : '<p style="font-size:13px;color:#888;margin:0;">—</p>'}
      ${s.duration_hours ? `<p style="font-size:11px;color:#555;margin:4px 0 0;">Durée : <strong>${s.duration_hours}</strong></p>` : ''}
      ${s.rem_pct ? `<p style="font-size:11px;color:#555;margin:2px 0 0;">REM : <strong>${s.rem_pct}%</strong></p>` : ''}
    </div>`;
  }

  // Strain / FC proxy
  if (cy) {
    html += `<div style="background:#fefce8;border-radius:10px;padding:10px;">
      <p style="font-size:10px;font-weight:700;color:#854d0e;margin:0 0 4px;text-transform:uppercase;">Charge du jour</p>
      ${cy.strain != null ? `<p style="font-size:22px;font-weight:800;color:#d97706;margin:0;">${Math.round(cy.strain * 10) / 10}</p><p style="font-size:10px;color:#555;margin:0;">Strain</p>` : '<p style="font-size:13px;color:#888;margin:0;">—</p>'}
      ${cy.calories ? `<p style="font-size:11px;color:#555;margin:4px 0 0;">Calories : <strong>${cy.calories} kcal</strong></p>` : ''}
      ${!r && cy.avg_hr ? `<p style="font-size:11px;color:#888;margin:4px 0 0;">FC moy : <strong>${cy.avg_hr} bpm</strong></p>` : ''}
    </div>`;
  }

  // Historique récupération (mini sparkline textuel)
  if (wd.recoveries && wd.recoveries.length > 1) {
    const last7 = wd.recoveries.slice(0, 7).reverse();
    html += `<div style="background:#faf5ff;border-radius:10px;padding:10px;">
      <p style="font-size:10px;font-weight:700;color:#6b21a8;margin:0 0 6px;text-transform:uppercase;">7 derniers jours</p>
      <div style="display:flex;align-items:flex-end;gap:3px;height:32px;">
        ${last7.map(rec => {
          const sc = rec.score || 0;
          const h = Math.max(4, Math.round(sc * 0.32));
          const col = scoreColor(sc);
          return `<div title="${rec.date} : ${sc}%" style="flex:1;background:${col};border-radius:2px;height:${h}px;opacity:0.85;"></div>`;
        }).join('')}
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:2px;">
        <span style="font-size:9px;color:#888;">${last7[0]?.date?.slice(5) || ''}</span>
        <span style="font-size:9px;color:#888;">${last7[last7.length-1]?.date?.slice(5) || ''}</span>
      </div>
    </div>`;
  }

  html += '</div>';

  // Date de synchro
  if (wd.updatedAt) {
    const d = new Date(wd.updatedAt);
    html += `<p style="font-size:10px;color:#999;margin:6px 0 0;text-align:right;">Dernière sync : ${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})}</p>`;
  }

  panel.innerHTML = html;
  panel.style.display = 'block';
}

function _getWakeupDate() {
  const now = new Date();
  if (now.getUTCHours() < 3) {
    const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
    return yesterday.toISOString().slice(0, 10);
  }
  return now.toISOString().slice(0, 10);
}

function _setWakeupBtnDone(btn) {
  if (!btn) return;
  btn.disabled = true;
  btn.style.cursor = 'default';
  btn.style.background = 'rgba(127,212,168,0.20)';
  btn.style.border = '1px solid rgba(127,212,168,0.35)';
  btn.style.borderRadius = '20px';
  btn.style.padding = '3px 9px';
  btn.style.boxShadow = 'none';
  btn.style.opacity = '1';
  btn.innerHTML = '<span style="font-size:11px;line-height:1;">✅</span><span style="font-size:10px;font-weight:700;color:#7FD4A8;margin-left:4px;white-space:nowrap;">Réveil</span>';
}

// Bouton "Je suis réveillé" : enregistre le réveil, sync WHOOP, déclenche le brief
// force=true : bypass le check disabled (utilisé en mode test depuis Compte)
async function onWakeup(force) {
  const btn = document.getElementById('wakeup-btn');
  if (!force && btn && btn.disabled) return;
  if (btn) { btn.disabled = true; btn.style.opacity = '0.7'; btn.innerHTML = '<span style="font-size:15px;line-height:1;">⏳</span><span style="font-size:12px;font-weight:800;color:#fff;">Enregistrement…</span>'; }

  const wakeupDate = _getWakeupDate();
  const wakeupKey = '_wakeup_' + wakeupDate;

  try {
    // 1. Sauvegarder le réveil en Firebase
    if (dbRef) {
      await dbRef.child(wakeupKey).set(true);
      state[wakeupKey] = true;
    }

    // 2. Mettre à jour le bouton immédiatement
    _setWakeupBtnDone(btn);

    // 3. Synchroniser WHOOP
    if (state.whoop_token && state.whoop_token.access_token) {
      await syncWhoop();
    }

    // 4. Rafraîchir la subscription push avant de déclencher le brief
    if (typeof subscribeToPush === 'function' && Notification.permission === 'granted') {
      try { await subscribeToPush(); } catch(eSub) { console.warn('subscribeToPush onWakeup:', eSub); }
    }

    // 5. Déclencher le brief côté serveur (génération IA + push notif)
    if (dbRef) {
      // En mode test : réinitialiser les clés "déjà fait" pour forcer la régénération complète
      if (force) {
        await dbRef.child('_brief_matin_' + wakeupDate).remove();
        await dbRef.child('_brief_fc_notif_' + wakeupDate).remove();
      }
      await dbRef.child('_brief_trigger').set({ ts: Date.now(), date: wakeupDate });
    }

  } catch(e) {
    console.error('onWakeup error:', e);
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; btn.innerHTML = '<span style="font-size:15px;line-height:1;">☀️</span><span style="font-size:12px;font-weight:800;color:#fff;letter-spacing:0.2px;">Je suis réveillé</span>'; btn.style.background = 'linear-gradient(135deg,#f97316,#fbbf24)'; }
  }
}

// ── Bannière réveil au lancement ───────────────────────────────────────────

var _wakeupBannerIsTest = false;

function _isWakeupWindowNow() {
  const h = new Date().getHours();
  return h >= 6 && h < 14;
}

function _wakeupAlreadyDoneToday() {
  const key = '_wakeup_' + _getWakeupDate();
  return !!(state && state[key]);
}

// Appelée par home-render après chaque rendu de l'accueil
// forceShow=true depuis le bouton test Compte → active aussi le mode force sur onWakeup
function checkWakeupBanner(forceShow) {
  if (!isAdmin()) return;
  const banner = document.getElementById('wakeup-banner');
  if (!banner) return;
  _wakeupBannerIsTest = !!forceShow;
  const shouldShow = forceShow || (_isWakeupWindowNow() && !_wakeupAlreadyDoneToday());
  if (shouldShow) {
    // Mise à jour du sous-titre heure
    const sub = document.getElementById('wakeup-banner-sub');
    if (sub) {
      const h = new Date().getHours();
      sub.textContent = h < 9 ? 'Bonne matinée !' : h < 12 ? 'Bonne matinée !' : 'Bon après-midi !';
    }
    // Statut WHOOP
    const whoopLine = document.getElementById('wakeup-banner-whoop');
    if (whoopLine) {
      const hasWhoop = !!(state && state.whoop_token && state.whoop_token.access_token);
      whoopLine.textContent = hasWhoop ? '📡 WHOOP connecté — sync auto au clic' : '(WHOOP non connecté)';
      whoopLine.style.opacity = hasWhoop ? '1' : '0.5';
    }
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}

function dismissWakeupBanner() {
  const banner = document.getElementById('wakeup-banner');
  if (banner) banner.style.display = 'none';
}

async function onWakeupFromBanner() {
  const isTest = _wakeupBannerIsTest;
  _wakeupBannerIsTest = false;
  const banner = document.getElementById('wakeup-banner');
  if (banner) {
    const whoopLine = isTest ? '' : '<div style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.12);border-radius:12px;padding:10px 18px;"><div style="width:8px;height:8px;border-radius:50%;background:#4ade80;animation:_pulseDot 1.2s ease-in-out infinite;"></div><span style="font-size:13px;color:rgba(255,255,255,0.8);font-weight:600;">Sync WHOOP en cours…</span></div>';
    const testLine = isTest ? '<div style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.12);border-radius:12px;padding:10px 18px;"><div style="width:8px;height:8px;border-radius:50%;background:#facc15;animation:_pulseDot 1.2s ease-in-out infinite;"></div><span style="font-size:13px;color:rgba(255,255,255,0.8);font-weight:600;">Mode test — brief + push en route…</span></div>' : '';
    banner.innerHTML = `
      <div style="width:100%;max-width:340px;display:flex;flex-direction:column;align-items:center;gap:0;padding:32px 24px;">
        <div style="font-size:72px;line-height:1;margin-bottom:20px;animation:_sunPulse 2.5s ease-in-out infinite;">✅</div>
        <p style="font-size:26px;font-weight:900;color:#fff;letter-spacing:-0.5px;text-align:center;margin:0 0 10px;">Réveil enregistré !</p>
        <p style="font-size:15px;color:rgba(255,255,255,0.85);font-weight:500;margin:0 0 28px;text-align:center;line-height:1.5;">Ton brief matinal est en cours de<br>préparation — tu le recevras<br>dans quelques instants. 🚀</p>
        ${whoopLine}${testLine}
      </div>
      <style>@keyframes _pulseDot{0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.4;transform:scale(0.7);}}</style>
    `;
    setTimeout(() => dismissWakeupBanner(), 2800);
  }
  await onWakeup(isTest);
}

// Auto-sync WHOOP toutes les 30 min si connecté + au retour en foreground
(function _initWhoopAutoSync() {
  setInterval(() => {
    if (state.whoop_token && state.whoop_token.access_token && !_whoopSyncing) syncWhoop();
  }, 30 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.whoop_token && state.whoop_token.access_token && !_whoopSyncing) {
      const wd = state.whoop_data;
      const updatedAt = wd && wd.updatedAt ? new Date(wd.updatedAt) : null;
      const minAgo = updatedAt ? (Date.now() - updatedAt.getTime()) / 60000 : Infinity;
      if (minAgo > 5) syncWhoop();
    }
  });
})();

async function showCalendarUrl() {
  const btn = document.getElementById('cal-url-btn');
  const sub = btn ? btn.querySelector('p:last-child') : null;
  if (sub) sub.textContent = 'Chargement…';
  try {
    const token = await firebase.auth().currentUser.getIdToken();
    const resp = await fetch(FUNCTIONS_BASE + '/calendarToken', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await resp.json();
    if (!data.url) throw new Error('Pas d\'URL');
    await navigator.clipboard.writeText(data.url);
    if (sub) sub.textContent = '✅ URL copiée !';
    setTimeout(() => { if (sub) sub.textContent = 'Copier l\'URL pour Outlook / Google'; }, 3000);
  } catch(e) {
    if (sub) sub.textContent = 'Erreur : ' + e.message;
    setTimeout(() => { if (sub) sub.textContent = 'Copier l\'URL pour Outlook / Google'; }, 3000);
  }
}

function openNotifTestModal() {
  const m = document.getElementById('notif-test-modal');
  if (m) { m.style.display = 'flex'; }
}
function closeNotifTestModal() {
  const m = document.getElementById('notif-test-modal');
  if (m) m.style.display = 'none';
}

async function adminTestNotif(type, btn) {
  if (!btn) return;
  const labelEl = btn.querySelector('div > div:first-child');
  const subEl = btn.querySelector('div > div:last-child');
  const origLabel = labelEl ? labelEl.textContent : '';
  const origSub = subEl ? subEl.textContent : '';
  btn.disabled = true; btn.style.opacity = '0.65';
  if (subEl) subEl.textContent = '⏳ Envoi en cours…';
  try {
    const token = await firebase.auth().currentUser?.getIdToken();
    const resp = await fetch(FUNCTIONS_BASE + '/adminTestNotif', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ type })
    });
    const data = await resp.json();
    if (!resp.ok || !data.success) throw new Error(data.error || 'Erreur serveur');
    if (subEl) subEl.textContent = type === 'brief-matin' ? '✅ Déclenché ! Push dans ~2 min…' : '✅ Push envoyée !';
    setTimeout(() => {
      btn.disabled = false; btn.style.opacity = '1';
      if (subEl) subEl.textContent = origSub;
    }, type === 'brief-matin' ? 15000 : 4000);
  } catch(e) {
    if (subEl) subEl.textContent = '❌ ' + e.message;
    btn.disabled = false; btn.style.opacity = '1';
    setTimeout(() => { if (subEl) subEl.textContent = origSub; }, 5000);
  }
}

// Enrichir le contexte coach avec les données WHOOP
function buildWhoopContext() {
  const wd = state.whoop_data;
  if (!wd || (!wd.cycles?.length && !wd.recoveries?.length)) return null;

  const r = wd.recoveries[0];
  const s = wd.sleeps && wd.sleeps[0];
  const cy = wd.cycles && wd.cycles[0];

  return {
    recovery: r ? {
      date: r.date,
      score: r.score,
      label: r.score >= 67 ? 'vert' : r.score >= 34 ? 'jaune' : 'rouge',
      rhr: r.rhr,
      hrv_ms: r.hrv ? Math.round(r.hrv) : null,
      spo2_pct: r.spo2 ? Math.round(r.spo2 * 10) / 10 : null
    } : null,
    sleep: s ? {
      date: s.date,
      duration_hours: s.duration_hours,
      performance_pct: s.performance_pct,
      efficiency_pct: s.efficiency_pct,
      rem_pct: s.rem_pct
    } : null,
    strain_today: cy ? { date: cy.date, strain: cy.strain, calories: cy.calories, avg_hr: cy.avg_hr } : null,
    historique_cycles_7j: (wd.cycles || []).slice(0, 7).map(c => ({
      date: c.date, strain: c.strain, avg_hr: c.avg_hr, calories: c.calories
    })),
    historique_recovery_7j: (wd.recoveries || []).slice(0, 7).map(rec => ({
      date: rec.date,
      recovery_score: rec.score,
      rhr: rec.rhr,
      hrv: rec.hrv ? Math.round(rec.hrv) : null
    }))
  };
}
