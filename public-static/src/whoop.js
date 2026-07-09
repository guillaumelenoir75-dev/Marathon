// ── WHOOP INTEGRATION ─────────────────────────────────────────────────────────

const WHOOP_SYNC_URL = FUNCTIONS_BASE + '/whoopSync';
const WHOOP_AUTH_URL = FUNCTIONS_BASE + '/whoopAuth';

let _whoopSyncing = false;

// Appelé au chargement de l'écran compte (admin uniquement)
async function initWhoopStatus() {
  if (!isAdmin()) return;
  const btn = document.getElementById('whoop-connect-btn');
  const status = document.getElementById('whoop-status');
  if (!btn || !status) return;

  // Vérifier si un token existe dans l'état Firebase
  const token = state.whoop_token;
  if (token && token.access_token) {
    const data = state.whoop_data;
    const updatedAt = data && data.updatedAt ? new Date(data.updatedAt) : null;
    const minutesAgo = updatedAt ? Math.round((Date.now() - updatedAt.getTime()) / 60000) : null;
    status.textContent = minutesAgo !== null
      ? `Connecté · sync il y a ${minutesAgo < 60 ? minutesAgo + ' min' : Math.round(minutesAgo/60) + 'h'}`
      : 'Connecté';
    status.style.color = '#22c55e';
    btn.textContent = '🔄 Synchroniser WHOOP';
    btn.onclick = syncWhoop;
    // Bouton déconnecter
    if (!document.getElementById('whoop-disconnect-btn')) {
      const dis = document.createElement('button');
      dis.id = 'whoop-disconnect-btn';
      dis.textContent = 'Déconnecter';
      dis.style.cssText = 'background:none;border:none;color:#9ca3af;font-size:11px;cursor:pointer;padding:4px 0;text-decoration:underline;display:block;margin-top:4px;';
      dis.onclick = disconnectWhoop;
      btn.parentNode.insertBefore(dis, btn.nextSibling);
    }
  } else {
    status.textContent = 'Non connecté';
    status.style.color = '#f59e0b';
    btn.textContent = '⚡ Connecter WHOOP';
    btn.onclick = connectWhoop;
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
  document.getElementById('whoop-disconnect-btn')?.remove();
  document.getElementById('whoop-data-panel').style.display = 'none';
  document.getElementById('whoop-data-panel').innerHTML = '';
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

async function syncWhoop() {
  if (_whoopSyncing) return;
  _whoopSyncing = true;

  const btn = document.getElementById('whoop-connect-btn');
  const status = document.getElementById('whoop-status');
  const panel = document.getElementById('whoop-data-panel');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Sync…'; }

  try {
    const resp = await fetch(WHOOP_SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await resp.json();

    if (data.needsAuth) {
      if (status) { status.textContent = 'Session expirée — reconnecte-toi'; status.style.color = '#ef4444'; }
      if (btn) { btn.disabled = false; btn.textContent = '⚡ Connecter WHOOP'; btn.onclick = connectWhoop; }
      _whoopSyncing = false;
      return;
    }

    if (!data.success) throw new Error(data.error || 'Erreur inconnue');

    // Mettre à jour l'état local et afficher les données
    if (dbRef) {
      dbRef.child('whoop_data').once('value').then(snap => {
        const wd = snap.val();
        if (wd) {
          state.whoop_data = wd;
          _renderWhoopPanel(wd, panel);
        }
        // Debug affiché APRÈS le render pour ne pas être écrasé
        if (data._debug) {
          const d = data._debug;
          const debugDiv = document.createElement('div');
          debugDiv.style.cssText = 'background:#f1f5f9;border-radius:8px;padding:10px;font-size:10px;font-family:monospace;color:#334155;margin-top:8px;word-break:break-all;';
          debugDiv.innerHTML = `<p style="margin:0 0 4px;font-weight:700;font-size:11px;">🔍 DEBUG WHOOP</p>
            <p style="margin:2px 0;">profil: ${d.profile ? JSON.stringify(d.profile).slice(0,100) : (d.profile_error ? '❌ '+d.profile_error : '—')}</p>
            <p style="margin:2px 0;">recovery: ${d.recovery_fetched ?? 0} fetched | sample status=${d.recovery_sample_status ?? '?'} ${d.recovery_sample_body ? '| '+d.recovery_sample_body.slice(0,60) : ''}</p>
            <p style="margin:2px 0;">/activity/sleep: ${d.sleep_status ?? '?'} ${d.sleep_error ? '❌ '+d.sleep_error.slice(0,50) : (d.sleep_raw_count > 0 ? '✅ '+d.sleep_raw_count+' records' : '')}</p>
            <p style="margin:2px 0;">/sleep (no param): ${d.sleep2_status ?? '?'} ${d.sleep2_error ? '❌ '+d.sleep2_error.slice(0,50) : (d.sleep2_raw_count > 0 ? '✅ '+d.sleep2_raw_count+' records' : '')}</p>
            <p style="margin:2px 0;">/activity/workout: ${d.workout_status ?? '?'} ${d.workout_error ? '❌ '+d.workout_error.slice(0,50) : (d.workout_raw_count > 0 ? '✅ '+d.workout_raw_count+' records' : '')}</p>
            <p style="margin:2px 0;">/workout: ${d.workout2_status ?? '?'} ${d.workout2_error ? '❌ '+d.workout2_error.slice(0,50) : (d.workout2_raw_count > 0 ? '✅ '+d.workout2_raw_count+' records' : '')}</p>
            <p style="margin:2px 0;">cycle: status=${d.cycle_status ?? '?'} | ${d.cycle_raw_count ?? 0} records</p>
            ${d.cycle_first ? `<p style="margin:2px 0;color:#0ea5e9;">cycle[0] raw: ${d.cycle_raw_full ? d.cycle_raw_full.slice(0,200) : (d.single_cycle_error || '?')}</p>` : ''}
            <p style="margin:2px 0;">cycle[1]/recovery: ${d.cycle1_recovery_status ?? '?'} ${d.cycle1_recovery ? '✅ '+d.cycle1_recovery.slice(0,80) : (d.cycle1_recovery_error ? '❌ '+d.cycle1_recovery_error.slice(0,60) : '')}</p>
            ${d.cycle1_raw ? `<p style="margin:2px 0;color:#f59e0b;">cycle[1] raw: ${d.cycle1_raw.slice(0,200)}</p>` : ''}
            <p style="margin:2px 0;">/recovery/collection: ${d.recovery_collection_status ?? '?'} ${d.recovery_collection_data ? '✅ '+d.recovery_collection_data.slice(0,80) : (d.recovery_collection_error ? '❌ '+d.recovery_collection_error.slice(0,60) : '')}</p>
            <p style="margin:2px 0;">/user/measurement/body: ${d.body_meas_status ?? '?'} ${d.body_meas_error ? '❌ '+d.body_meas_error.slice(0,40) : '✅'}</p>
            ${d.recovery_first ? `<p style="margin:4px 0;color:#0ea5e9;">rec[0]: ${JSON.stringify(d.recovery_first).slice(0,150)}</p>` : ''}
            ${d.sleep_first ? `<p style="margin:2px 0;color:#0ea5e9;">sleep[0]: ${JSON.stringify(d.sleep_first).slice(0,150)}</p>` : ''}`;
          if (panel) { panel.style.display = 'block'; panel.appendChild(debugDiv); }
        }
      });
    }

    if (status) { status.textContent = 'Synchronisé à l\'instant'; status.style.color = '#22c55e'; }
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Synchroniser WHOOP'; btn.onclick = syncWhoop; }

    // Auto-remplir la FC repos si disponible
    if (data.rhr) {
      _autoFillFcRepos(data.rhr);
    }

  } catch(e) {
    console.error('whoopSync error:', e);
    if (status) { status.textContent = 'Erreur : ' + e.message; status.style.color = '#ef4444'; }
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Réessayer'; btn.onclick = syncWhoop; }
    // Afficher un lien "Reconnecter" en cas d'erreur
    const reconnectId = 'whoop-reconnect-link';
    if (!document.getElementById(reconnectId)) {
      const link = document.createElement('button');
      link.id = reconnectId;
      link.textContent = '🔗 Reconnecter WHOOP';
      link.style.cssText = 'background:none;border:none;color:#1B4FD8;font-size:11px;cursor:pointer;padding:4px 0;text-decoration:underline;display:block;margin-top:4px;';
      link.onclick = () => { document.getElementById(reconnectId)?.remove(); connectWhoop(); };
      btn.parentNode.insertBefore(link, btn.nextSibling);
    }
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
      ${s.duration_hours ? `<p style="font-size:11px;color:#555;margin:4px 0 0;">Durée : <strong>${s.duration_hours}h</strong></p>` : ''}
      ${s.rem_pct ? `<p style="font-size:11px;color:#555;margin:2px 0 0;">REM : <strong>${s.rem_pct}%</strong></p>` : ''}
    </div>`;
  }

  // Strain
  if (cy) {
    html += `<div style="background:#fefce8;border-radius:10px;padding:10px;">
      <p style="font-size:10px;font-weight:700;color:#854d0e;margin:0 0 4px;text-transform:uppercase;">Charge du jour</p>
      ${cy.strain != null ? `<p style="font-size:22px;font-weight:800;color:#d97706;margin:0;">${Math.round(cy.strain * 10) / 10}</p><p style="font-size:10px;color:#555;margin:0;">Strain</p>` : '<p style="font-size:13px;color:#888;margin:0;">—</p>'}
      ${cy.calories ? `<p style="font-size:11px;color:#555;margin:4px 0 0;">Calories : <strong>${cy.calories} kcal</strong></p>` : ''}
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

// Enrichir le contexte coach avec les données WHOOP
function buildWhoopContext() {
  const wd = state.whoop_data;
  if (!wd || !wd.recoveries || wd.recoveries.length === 0) return null;

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
    strain_today: cy ? { date: cy.date, strain: cy.strain, calories: cy.calories } : null,
    historique_7j: wd.recoveries.slice(0, 7).map(rec => ({
      date: rec.date,
      recovery_score: rec.score,
      rhr: rec.rhr,
      hrv: rec.hrv ? Math.round(rec.hrv) : null
    }))
  };
}
