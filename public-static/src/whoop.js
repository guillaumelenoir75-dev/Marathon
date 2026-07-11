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
  if (token && token.access_token) {
    const data = state.whoop_data;
    const updatedAt = data && data.updatedAt ? new Date(data.updatedAt) : null;
    const minutesAgo = updatedAt ? Math.round((Date.now() - updatedAt.getTime()) / 60000) : null;
    status.textContent = minutesAgo !== null
      ? `Sync il y a ${minutesAgo < 60 ? minutesAgo + ' min' : Math.round(minutesAgo/60) + 'h'}`
      : 'Connecté';
    status.style.color = '#22c55e';
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.2"/></svg> Synchroniser';
    btn.onclick = syncWhoop;
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
              initWhoopStatus();
              syncWhoop();
            }
          });
        }
      }, 1000);
    }
  }, 1500);
}

// Sync WHOOP et attend que les données soient chargées — retourne les données WHOOP ou null
async function syncWhoopFresh() {
  // Attendre que syncWhoop() en cours se termine avant de lancer le nôtre
  if (_whoopSyncing) {
    await new Promise(r => { const t = setInterval(() => { if (!_whoopSyncing) { clearInterval(t); r(); } }, 300); setTimeout(() => { clearInterval(t); r(); }, 20000); });
  }
  try {
    const resp = await fetch(WHOOP_SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await resp.json();
    if (data.needsAuth || !data.success) return null;
    if (dbRef) {
      const snap = await dbRef.child('whoop_data').once('value');
      const wd = snap.val();
      if (wd) {
        state.whoop_data = wd;
        if (typeof renderWhoopStats === 'function') renderWhoopStats();
      }
      return wd || null;
    }
  } catch(e) { console.error('syncWhoopFresh error:', e); }
  return null;
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
      // Token expiré : nettoyer le state local et repasser en mode "non connecté"
      state.whoop_token = null;
      state.whoop_data = null;
      _whoopSyncing = false;
      initWhoopStatus();
      return;
    }

    if (!data.success) throw new Error(data.error || 'Erreur inconnue');

    // Mettre à jour l'état local et afficher les données
    if (dbRef) {
      dbRef.child('whoop_data').once('value').then(snap => {
        const wd = snap.val();
        if (wd) {
          state.whoop_data = wd;
          if (typeof renderWhoopStats === 'function') renderWhoopStats();
          // Auto-remplir la FC repos uniquement si les données WHOOP sont d'aujourd'hui
          // (évite de polluer fc_repos avec les valeurs de la veille au démarrage)
          const today = new Date().toISOString().slice(0, 10);
          const recovDate = wd.recoveries && wd.recoveries[0] && wd.recoveries[0].date
            ? wd.recoveries[0].date.slice(0, 10) : null;
          const rhrValue = data.rhr || data.rhr_proxy;
          if (rhrValue && recovDate === today) {
            _autoFillFcRepos(rhrValue);
          }
        }
      });
    }

    if (status) { status.textContent = 'Sync à l\'instant'; status.style.color = '#22c55e'; }
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.2"/></svg> Synchroniser'; btn.onclick = syncWhoop; }

  } catch(e) {
    console.error('whoopSync error:', e);
    if (status) { status.textContent = 'Erreur sync'; status.style.color = '#ef4444'; }
    if (btn) { btn.disabled = false; btn.innerHTML = '🔄 Réessayer'; btn.onclick = syncWhoop; }
  }
  _whoopSyncing = false;
}

function _autoFillFcRepos(rhr) {
  const today = new Date().toISOString().slice(0, 10);
  if (!state['fc_repos_' + today]) {
    // Pas encore de mesure manuelle aujourd'hui → auto-fill
    if (dbRef) {
      dbRef.child('fc_repos_' + today).transaction(existing => existing === null ? rhr : existing)
        .then(() => {
          state['fc_repos_' + today] = rhr;
          // Mettre à jour l'affichage du KPI FC repos
          const el = document.getElementById('kpi-fc-repos');
          if (el && el.textContent === '—') el.textContent = rhr + ' bpm';
        });
    }
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
  if (now.getHours() < 3) {
    const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
    return yesterday.toISOString().slice(0, 10);
  }
  return now.toISOString().slice(0, 10);
}

function _setWakeupBtnDone(btn) {
  if (!btn) return;
  btn.disabled = true;
  btn.style.cursor = 'default';
  btn.style.background = 'linear-gradient(135deg,#16a34a,#22c55e)';
  btn.style.boxShadow = 'none';
  btn.style.opacity = '1';
  btn.innerHTML = '<span style="font-size:15px;line-height:1;">✅</span><span style="font-size:12px;font-weight:800;color:#fff;letter-spacing:0.2px;">Réveil enregistré</span>';
}

// Bouton "Je suis réveillé" : enregistre le réveil, sync WHOOP, déclenche le brief
async function onWakeup() {
  const btn = document.getElementById('wakeup-btn');
  if (btn && btn.disabled) return;
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

    // 4. Déclencher le brief côté serveur (génération IA + push notif)
    if (dbRef) {
      await dbRef.child('_brief_trigger').set({ ts: Date.now(), date: wakeupDate });
    }

  } catch(e) {
    console.error('onWakeup error:', e);
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; btn.innerHTML = '<span style="font-size:15px;line-height:1;">☀️</span><span style="font-size:12px;font-weight:800;color:#fff;letter-spacing:0.2px;">Je suis réveillé</span>'; btn.style.background = 'linear-gradient(135deg,#f97316,#fbbf24)'; }
  }
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
