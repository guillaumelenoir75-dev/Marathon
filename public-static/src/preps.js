// Mes prépas (Compte) : une prépa terminée est enregistrée comme une copie figée de l'état
// (users/{uid}/preps/{id}) avec sa fiche (users/{uid}/prep_index/{id}). « Consulter » rouvre toute l'app
// sur cette copie, en lecture seule : aucune écriture ne peut partir vers la base pendant la consultation.

// clés non archivées : historique du coach, jetons et données d'appareils (volumineux ou personnels)
const _PREP_SKIP = /^(_coach_history|_coach_unread|_brief|whoop_|strava_token|_push_sub|_ratelimit|_open_coach|_last_location|_wakeup_|_geo_granted|_shaker_run_ts)/;
let _prepIndex = null, _prepView = null, _prepPendingNew = false;
// clés propres à une prépa (retirées au démarrage d'une nouvelle) ; profil, chaussures, FC, VO2max, Strava… sont conservés
const _PREP_RESET = /^(extra_w\d+_s\d+|_last_validation_w|meta_w|edit_w|del_w|order_w|s\d+i\d+|rf\d+(r\d+|skip)|_congrats_sent_w|absences_cw|plan_config$|plan_version$|plan_peak_week$|plan_start_date$|_plan_adapted|onboarding$|goal_type$|target_time$|race_distance_km$|_am_pace$|_am_training_pace$)/;

function _prepUid(){ const u = firebase.auth().currentUser; return u ? u.uid : null; }
function _prepRef(path){ return firebase.database().ref('users/' + _prepUid() + '/' + path); }
const _prepEsc = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
const _prepDate = function(d, opt){ if(!d) return ''; const x = new Date(d + (String(d).length === 10 ? 'T12:00:00' : '')); return isNaN(x) ? '' : x.toLocaleDateString('fr-FR', opt || { day: 'numeric', month: 'long', year: 'numeric' }); };

// Prépa en cours : nom, course, dates
function _prepCurrentInfo(st){
  if(isAdmin() && !st._plan_engine){                     // plan Seine-Eure (programme écrit dans l'app)
    return { title: 'Marathon Seine-Eure 2026', race: 'Marathon Seine-Eure', date: '2026-10-18', start: '2026-03-09', dist: 'Marathon',
             replay: 'https://prepa-marathon.web.app/suivi-guillaume', result: '3:37:05', note: 'Record personnel' };
  }
  const ob = st.onboarding || {}, date = ob.date || '';
  return { title: (ob.race_name || ob.course || 'Ma prépa') + (date ? ' ' + String(date).slice(0, 4) : ''), race: ob.race_name || ob.course || '',
           date: date, start: st.plan_start_date || ob.plan_start_date || '', dist: ob.course || '', replay: '', result: '', note: '' };
}
// Bilan : semaines, séances réalisées / prévues, km réalisés
function _prepStats(st){
  let weeks = 0, done = 0, planned = 0, km = 0;
  for(let w = 1; w <= 80; w++){
    let ei = 0, any = false;
    while(ei <= 50 && st['extra_w' + w + '_s' + ei] !== undefined){
      const k = 'extra_w' + w + '_s' + ei; any = true; planned++;
      if(st[k + '_done'] || st[k + '_km'] != null){
        done++;
        let v = parseFloat(st[k + '_km']);
        if(!(v > 0)){ try { v = parseFloat(JSON.parse(st[k]).km) || 0; } catch(e){ v = 0; } }
        km += v;
      }
      ei++;
    }
    if(any) weeks = w;
  }
  return { weeks: weeks, done: done, planned: planned, km: Math.round(km) };
}

// ─── Ligne « Mes prépas » de l'écran Compte ────────────────────────────────
async function renderPrepsRow(){
  const lr = document.getElementById('live-row'); if(lr) lr.style.display = isAdmin() ? 'flex' : 'none';
  const sub = document.getElementById('preps-subtitle'); if(!sub || !_prepUid()) return;
  try {
    _prepIndex = (await _prepRef('prep_index').once('value')).val() || {};
    const n = Object.keys(_prepIndex).length;
    sub.textContent = 'Prépa en cours' + (n ? ' · ' + n + ' prépa' + (n > 1 ? 's' : '') + ' enregistrée' + (n > 1 ? 's' : '') : ' · aucune archivée');
  } catch(e) { sub.textContent = 'Prépa en cours et prépas archivées'; }
}

// ─── Panneau « Mes prépas » ────────────────────────────────────────────────
async function openPrepsPanel(){
  closePrepsPanel();
  const mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'preps-panel';
  ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  ov.innerHTML = '<div class="modal-box" style="max-height:92vh;">'
    + '<div style="background:linear-gradient(135deg,#0C447C,#1D4ED8);padding:16px;border-radius:24px 24px 0 0;color:#fff;flex-shrink:0;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">'
    +   '<div><p style="font-size:10px;font-weight:800;opacity:.8;letter-spacing:.1em;text-transform:uppercase;margin:0 0 2px;">Compte</p><p style="font-size:21px;font-weight:900;margin:0;">🏅 Mes prépas</p></div>'
    +   '<button onclick="closePrepsPanel()" aria-label="Fermer" style="background:rgba(255,255,255,.2);border:none;cursor:pointer;color:#fff;font-size:18px;width:32px;height:32px;border-radius:50%;">×</button></div>'
    + '<div class="modal-scroll-body"><div id="preps-body" style="padding:14px 16px 18px;display:flex;flex-direction:column;gap:12px;"><p style="color:#888;font-size:13px;">Chargement…</p></div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) closePrepsPanel(); });
  mc.appendChild(ov);
  try { _prepIndex = (await _prepRef('prep_index').once('value')).val() || {}; } catch(e) { _prepIndex = {}; }
  _renderPrepsBody();
}
function closePrepsPanel(){ const ov = document.getElementById('preps-panel'); if(ov) ov.remove(); }

function _renderPrepsBody(){
  const box = document.getElementById('preps-body'); if(!box) return;
  const cur = _prepCurrentInfo(state), cs = _prepStats(state);
  const saved = Object.keys(_prepIndex || {}).map(function(k){ return Object.assign({ id: k }, _prepIndex[k]); })
    .sort(function(a, b){ return String(b.date || '').localeCompare(String(a.date || '')); });
  const already = saved.find(function(p){ return p.title === cur.title; });
  const card = 'background:#fff;border:1px solid #e0e8f5;border-radius:14px;padding:14px;';
  const btn = 'border-radius:10px;padding:10px 12px;font-size:13px;font-weight:800;cursor:pointer;';
  let h = '';
  if(_prepView){
    h += '<div style="' + card + 'background:#FFF7ED;border-color:#fed7aa;"><p style="font-size:13px;color:#92400E;margin:0;line-height:1.45;"><b>📖 Consultation en cours</b> : « ' + _prepEsc(_prepView.meta.title || 'prépa archivée') + ' ».<br>Touche <b>Quitter</b> dans le bandeau pour revenir à ta prépa en cours et gérer tes prépas.</p></div>';
  } else
  // prépa en cours
  h += '<div style="' + card + '"><p style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#15803D;margin:0 0 4px;">● Prépa en cours</p>'
    + '<p style="font-size:16px;font-weight:800;color:#0C447C;margin:0;">' + _prepEsc(cur.title) + '</p>'
    + '<p style="font-size:12.5px;color:#5b6675;margin:3px 0 10px;">' + (cur.date ? 'Course le ' + _prepDate(cur.date) : 'Sans date de course') + ' · ' + cs.weeks + ' semaines · ' + cs.done + ' séances réalisées · ' + cs.km + ' km</p>'
    + (already ? '<p style="font-size:12.5px;color:#15803D;font-weight:700;margin:0 0 8px;">✓ Enregistrée le ' + _prepDate(already.savedAt) + '</p>' : '')
    + '<button onclick="prepShowForm()" style="width:100%;background:#0C447C;color:#fff;border:none;' + btn + '">' + (already ? '🔄 Mettre à jour l\'enregistrement' : '📦 Enregistrer cette prépa') + '</button>'
    + (!usesHardPlan() && cs.planned > 0 ? '<button onclick="prepDiscardCurrent()" style="width:100%;margin-top:8px;background:#fff;color:#c0392b;border:1px solid #ffcdd2;' + btn + '">🗑 Supprimer cette prépa (sans l\'enregistrer)</button>' : '')
    + '<div id="prep-form" style="margin-top:12px;display:none;flex-direction:column;gap:8px;">'
    +   '<label style="font-size:12px;font-weight:700;color:#5b6675;">Nom<input id="pf-title" value="' + _prepEsc(already ? already.title : cur.title) + '" style="display:block;width:100%;margin-top:3px;padding:9px 10px;border:1px solid #d6dfec;border-radius:9px;font-size:14px;box-sizing:border-box;"></label>'
    +   '<label style="font-size:12px;font-weight:700;color:#5b6675;">Date de la course<input id="pf-date" type="date" value="' + _prepEsc(cur.date) + '" style="display:block;width:100%;margin-top:3px;padding:9px 10px;border:1px solid #d6dfec;border-radius:9px;font-size:14px;box-sizing:border-box;"></label>'
    +   '<label style="font-size:12px;font-weight:700;color:#5b6675;">Temps officiel<input id="pf-result" inputmode="numeric" placeholder="3:37:05" value="' + _prepEsc(already ? already.result : cur.result) + '" style="display:block;width:100%;margin-top:3px;padding:9px 10px;border:1px solid #d6dfec;border-radius:9px;font-size:14px;box-sizing:border-box;"></label>'
    +   '<label style="font-size:12px;font-weight:700;color:#5b6675;">Note<input id="pf-note" placeholder="Record personnel, sensations…" value="' + _prepEsc(already ? already.note : cur.note) + '" style="display:block;width:100%;margin-top:3px;padding:9px 10px;border:1px solid #d6dfec;border-radius:9px;font-size:14px;box-sizing:border-box;"></label>'
    +   '<button onclick="prepSaveCurrent()" id="pf-save" style="background:#15803D;color:#fff;border:none;' + btn + '">Enregistrer dans Mes prépas</button>'
    +   '<p style="font-size:11.5px;color:#888;margin:0;line-height:1.4;">Une copie complète et figée du programme, des séances réalisées et de leurs données est conservée. Ta prépa en cours n\'est pas modifiée.</p>'
    + '</div></div>';
  if(!_prepView) prepReadyFor(state).forEach(function(R){
    const n = R.weeks.reduce(function(a, W){ return a + W.sessions.length; }, 0);
    h += '<div style="' + card + 'border:2px solid #15803D;background:#F0FDF4;"><p style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#15803D;margin:0 0 4px;">📥 Prépa prête à installer</p>'
      + '<p style="font-size:16px;font-weight:800;color:#0C447C;margin:0;">' + _prepEsc(R.title) + '</p>'
      + '<p style="font-size:12.5px;color:#5b6675;margin:3px 0 10px;">Course le ' + _prepDate(R.date) + ' · ' + R.weeks.length + ' semaines · ' + n + ' séances · objectif ' + R.target.replace(/^00:/, '') + '</p>'
      + '<button onclick="prepInstallReady(\'' + R.id + '\')" style="width:100%;background:#15803D;color:#fff;border:none;' + btn + 'padding:13px;font-size:15px;">Installer cette prépa</button></div>';
  });
  if(!_prepView) h += '<button onclick="prepNew()" style="width:100%;background:#15803D;color:#fff;border:none;' + btn + 'padding:14px;font-size:15px;">＋ Nouvelle prépa</button>'
    + '<p style="font-size:11.5px;color:#888;margin:-4px 2px 0;line-height:1.4;">Choisis ta prochaine course objectif et crée ton programme.</p>';
  // prépas enregistrées
  h += '<p style="font-size:13px;font-weight:800;color:#0C447C;margin:4px 2px 0;">Prépas enregistrées</p>';
  if(!saved.length) h += '<p style="font-size:13px;color:#888;margin:0 2px;">Aucune pour l\'instant : enregistre ta prépa en cours pour la retrouver ici.</p>';
  saved.forEach(function(p){
    const s = p.stats || {};
    h += '<div style="' + card + '">'
      + '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;"><div style="min-width:0;">'
      +   '<p style="font-size:15.5px;font-weight:800;color:#0C447C;margin:0;">' + _prepEsc(p.title) + '</p>'
      +   '<p style="font-size:12.5px;color:#5b6675;margin:3px 0 0;">' + (p.date ? _prepDate(p.date) : '') + (s.weeks ? ' · ' + s.weeks + ' sem. · ' + s.done + ' séances · ' + s.km + ' km' : '') + '</p></div>'
      +   (p.result ? '<span style="flex-shrink:0;background:#FEF3C7;color:#92400E;border-radius:999px;padding:5px 10px;font-size:13px;font-weight:900;font-variant-numeric:tabular-nums;">⏱ ' + _prepEsc(p.result) + '</span>' : '') + '</div>'
      + (p.note ? '<p style="font-size:12.5px;color:#B45309;font-weight:700;margin:6px 0 0;">🏅 ' + _prepEsc(p.note) + '</p>' : '')
      + '<div style="display:flex;gap:8px;margin-top:10px;">'
      +   '<button onclick="prepView(\'' + p.id + '\')" style="flex:1 1 0;min-width:0;background:#EBF0FF;color:#1B4FD8;border:1px solid #c7d7f8;' + btn + '">📖 Consulter</button>'
      +   (p.replay ? '<a href="' + _prepEsc(p.replay) + '" target="_blank" rel="noopener" style="flex:1 1 0;min-width:0;text-align:center;text-decoration:none;background:#FFF7ED;color:#C2410C;border:1px solid #fed7aa;' + btn + '">🎬 Revoir la course</a>' : '')
      +   (_prepView ? '' : '<button onclick="prepDelete(\'' + p.id + '\')" aria-label="Supprimer" style="flex-shrink:0;background:#fff0f0;color:#c0392b;border:1px solid #ffcdd2;' + btn + '">🗑</button>')
      + '</div></div>';
  });
  box.innerHTML = h;
}
function prepShowForm(){ const f = document.getElementById('prep-form'); if(f) f.style.display = f.style.display === 'none' ? 'flex' : 'none'; }

async function prepSaveCurrent(){
  if(_prepView) return;
  const title = document.getElementById('pf-title').value.trim();
  if(!title){ alert('Donne un nom à cette prépa.'); return; }
  const b = document.getElementById('pf-save'); b.disabled = true; b.textContent = 'Enregistrement…';
  const cur = _prepCurrentInfo(state);
  const existing = Object.keys(_prepIndex || {}).find(function(k){ return _prepIndex[k].title === title; });
  const id = existing || _prepRef('prep_index').push().key;
  const snap = {};
  Object.keys(state).forEach(function(k){ if(!_PREP_SKIP.test(k) && state[k] !== undefined) snap[k] = state[k]; });
  const meta = { title: title, race: cur.race, dist: cur.dist, date: document.getElementById('pf-date').value || cur.date || '', start: cur.start || '',
    result: document.getElementById('pf-result').value.trim(), note: document.getElementById('pf-note').value.trim(), replay: cur.replay || '',
    stats: _prepStats(state), savedAt: new Date().toISOString().slice(0, 10), admin: isAdmin() && !state._plan_engine };
  try {
    await _prepRef('preps/' + id).set(snap);
    await _prepRef('prep_index/' + id).set(meta);
    _prepIndex[id] = meta;
    _renderPrepsBody(); renderPrepsRow();
    if(typeof showToast === 'function') showToast('Prépa enregistrée dans Mes prépas ✓');
  } catch(e) {
    alert('Enregistrement impossible (' + e.message + '). Vérifie ta connexion.');
    b.disabled = false; b.textContent = 'Enregistrer dans Mes prépas';
  }
}
function prepDelete(id){
  const p = (_prepIndex || {})[id]; if(!p) return;
  _showConfirmModal({ icon: '🗑', title: 'Supprimer « ' + p.title + ' » ?', message: 'La copie enregistrée de cette prépa sera définitivement supprimée. Ta prépa en cours n\'est pas touchée.',
    confirmLabel: 'Supprimer', confirmStyle: 'background:#e53e3e;color:#fff;', onConfirm: async function(){
      await _prepRef('preps/' + id).remove(); await _prepRef('prep_index/' + id).remove();
      delete _prepIndex[id]; _renderPrepsBody(); renderPrepsRow();
    } });
}

// ─── Nouvelle prépa ────────────────────────────────────────────────────────
// L'assistant de création s'ouvre ; l'ancienne prépa n'est retirée qu'à la validation (prepApplyNew, appelé par saveOnboarding)
// Prépa en cours abandonnée (ex. un essai) : programme retiré sans copie ; tes réglages sont conservés
function prepDiscardCurrent(){
  if(_prepView || usesHardPlan()) return;
  const cur = _prepCurrentInfo(state);
  _showConfirmModal({ icon: '🗑', title: 'Supprimer « ' + cur.title + ' » ?', message: 'Le programme et ses séances sont supprimés définitivement, sans être enregistrés dans Mes prépas. Tes réglages (FC, VO2max, chaussures, Strava…) et tes prépas enregistrées sont conservés.',
    confirmLabel: 'Supprimer', confirmStyle: 'background:#e53e3e;color:#fff;', onConfirm: async function(){
      try {
        await prepApplyNew();
        syncPlanCompat();
        if(typeof rendered !== 'undefined') rendered.plan = false;
        try { renderHome(); renderPlan(); } catch(e) {}
        _renderPrepsBody();
        if(typeof showToast === 'function') showToast('Prépa supprimée');
      } catch(e) { alert('Suppression impossible (' + e.message + ').'); }
    } });
}
function prepNew(){
  if(_prepView) return;
  const cur = _prepCurrentInfo(state), cs = _prepStats(state);
  const saved = Object.keys(_prepIndex || {}).some(function(k){ return _prepIndex[k].title === cur.title; });
  if(cs.planned > 0 && !saved){
    _showConfirmModal({ icon: '📦', title: 'Enregistre d\'abord ta prépa en cours', message: '« ' + cur.title + ' » n\'est pas encore dans Mes prépas. Enregistre-la pour pouvoir la revoir ensuite, puis crée ta nouvelle prépa.',
      confirmLabel: 'Enregistrer maintenant', confirmStyle: 'background:#0C447C;color:#fff;', onConfirm: function(){ const f = document.getElementById('prep-form'); if(f) f.style.display = 'flex'; } });
    return;
  }
  _showConfirmModal({ icon: '🏁', title: 'Créer une nouvelle prépa ?', message: (cs.planned > 0 ? '« ' + cur.title + ' » est enregistrée dans Mes prépas : à la validation du nouveau programme, elle sera retirée de l\'app (tu pourras toujours la consulter). ' : '')
      + 'Tes réglages sont conservés : FC, VO2max, allure EF, chaussures, Strava, notifications.', confirmLabel: 'Choisir ma course', confirmStyle: 'background:#15803D;color:#fff;', onConfirm: prepOpenWizard });
}
function prepOpenWizard(){
  closePrepsPanel();
  // assistant pré-rempli avec le profil (pas la course ni le programme précédents)
  const prev = state.onboarding, p = prev || {};
  state.onboarding = { sessions: p.sessions || null, niveau: p.niveau || null, km_semaine: p.km_semaine || null, fc_max: state.fc_max || p.fc_max || null,
    ef_pace: state.ef_pace || p.ef_pace || null, run_days: p.run_days || null, run_times: p.run_times || null, run_time: p.run_time || null };
  _prepPendingNew = true;
  showOnboarding(true);
  if(prev === undefined) delete state.onboarding; else state.onboarding = prev;      // rien n'est modifié tant que l'assistant n'est pas validé
}
// Prépa installée avant la remise à zéro complète : retire les « renfo sauté » et « félicitations envoyées » hérités de Seine-Eure
function prepLegacyCleanup(){
  if(!isAdmin() || usesHardPlan() || _prepView || state._prep_clean_v1) return;
  const up = { _prep_clean_v1: true };
  Object.keys(state).forEach(function(k){ if(/^(rf\d+skip|_congrats_sent_w\d+)$/.test(k)){ up[k] = null; delete state[k]; } });
  state._prep_clean_v1 = true;
  try { if(dbRef) dbRef.update(up).catch(function(){}); } catch(e) {}
}
async function prepApplyNew(){
  const up = {};
  // km des chaussures figés avant la remise à zéro : la nouvelle prépa repart de leur total réel
  try { getShoes().forEach(function(sh){ if(!/[.#$\/\[\]]/.test(sh.name)) up['shoe_km_' + sh.name] = shoeKmTotal(sh.name); }); } catch(e) {}
  Object.keys(state).forEach(function(k){ if(_PREP_RESET.test(k)){ up[k] = null; delete state[k]; } });
  Object.keys(up).forEach(function(k){ if(up[k] !== null) state[k] = up[k]; });
  up._plan_engine = 'generated'; state._plan_engine = 'generated';
  up._plan_migrated = true; state._plan_migrated = true;
  up._prep_clean_v1 = true; state._prep_clean_v1 = true;                          // l'ancien plan Seine-Eure ne doit jamais être régénéré
  await dbRef.update(up);
}

// ─── Prépas prêtes à installer (programme fourni, installé en un appui depuis Mes prépas) ────────────
const _EF_TXT = 'Endurance facile, repère 5’45–6’10/km. Pouvoir parler aisément.';
const PREPS_READY = [{
  id: 'novembrun-2026', title: "10km Novemb'Run", course: '10 km', date: '2026-11-22', start: '2026-10-26', target: '00:42:00', km: 10, raceTime: '09:00',
  weeks: [
    { phase: 'Reprise', sessions: [
      { date: '2026-10-27', type: 'ef', km: 5, t: 'Footing de reprise', x: 'Reprise en douceur. ' + _EF_TXT,
        done: { km: 5.02, dur: '28:36', pace: "5'42", hr: 143, note: 'Très bonnes sensations, aucune douleur.' } },
      { date: '2026-10-29', type: 'ef', km: 7, t: 'Footing facile', x: _EF_TXT },
      { date: '2026-11-01', type: 'long', km: 9, t: 'Endurance prolongée', x: _EF_TXT + ' Sans accélération finale.' } ] },
    { phase: 'Consolidation', sessions: [
      { date: '2026-11-03', type: 'ef', km: 8, t: 'Footing facile', x: _EF_TXT },
      { date: '2026-11-05', type: 'ef', km: 9, t: 'Footing facile', x: _EF_TXT },
      { date: '2026-11-08', type: 'long', km: 11, t: 'Sortie longue', x: _EF_TXT + ' Sans bloc rapide.' } ] },
    { phase: 'Reprise du fractionné', peak: true, sessions: [
      { date: '2026-11-10', type: 'ef', km: 8, t: 'Footing + accélérations', x: _EF_TXT + ' Inclure 4 × 15 s progressives, sans sprint ; récupération 1 min.' },
      { date: '2026-11-12', type: 'frac', km: 10, t: '4×1000 m', x: '3 km faciles, puis 4 × 1 000 m en 4’18–4’22. Récupération 2 min au trot entre les répétitions. Retour au calme jusqu’à 10 km au total.' },
      { date: '2026-11-14', type: 'ef', km: 6, t: 'Footing de récupération', x: _EF_TXT + ' Très facile.' },
      { date: '2026-11-15', type: 'long', km: 12, t: 'Sortie longue', x: _EF_TXT + ' Sans bloc rapide ni finish accéléré.' } ] },
    { phase: 'Allègement et course', taper: true, sessions: [
      { date: '2026-11-17', type: 'frac', km: 8, t: '3×1000 m', x: '2–3 km faciles, puis 3 × 1 000 m en 4’12–4’15. Récupération 2 min au trot entre les répétitions. Retour au calme jusqu’à 8 km au total.' },
      { date: '2026-11-19', type: 'ef', km: 6, t: 'Footing facile', x: _EF_TXT },
      { date: '2026-11-21', type: 'ef', km: 3, t: 'Mise en jambes', x: '3 km très faciles au total, avec 3 × 15 s progressives, sans sprint ; récupération complète.' },
      { date: '2026-11-22', type: 'race', km: 12.5, t: "NOVEMB'RUN – 10 km", x: 'Objectif : moins de 42 min, à confirmer selon les sensations. Avant : 12–15 min faciles et 3 accélérations. Distance du jour estimée : 10 km + 2,5 km d’échauffement.' } ] },
  ],
  memo: "Prépa 10km Novemb'Run (22/11/2026) : objectif moins de 42 min ; record 10 km 44'23 ; marathon Seine-Eure 3:37:05. Jours sans séance : repos course, marche et mobilité douce. Si fatigue inhabituelle le lendemain, réduire la séance suivante. Si la douleur de cheville revient, interrompre la sortie.",
}];
// clés d'état de la prépa (programme au format du moteur de plan : extra_w*, meta_w*, onboarding…)
// horaire habituel de chaque jour (1 = lundi … 7 = dimanche), d'après les séances de la prépa en cours
function _prepUsualTimes(){
  const cnt = {};
  for(let w = 1; w <= 60; w++){
    let ei = 0;
    while(ei <= 50 && state['extra_w' + w + '_s' + ei] !== undefined){
      try {
        const x = JSON.parse(state['extra_w' + w + '_s' + ei]);
        if(x.sched_time && x.type !== 'race'){                // jour connu → par jour ; toujours → horaire global ('*')
          [x.sched_day, '*'].forEach(function(d){ if(!d) return; const c = cnt[d] = cnt[d] || {}; c[x.sched_time] = (c[x.sched_time] || 0) + 1; });
        }
      } catch(e) {}
      ei++;
    }
  }
  const out = {};
  Object.keys(cnt).forEach(function(d){ out[d] = Object.keys(cnt[d]).sort(function(a, b){ return cnt[d][b] - cnt[d][a]; })[0]; });
  return out;
}
function _prepReadyUpdates(R, usual){
  const ob0 = state.onboarding || {}, up = {}, days = new Set();
  const time = function(day){ if(usual && (usual[day] || usual['*'])) return usual[day] || usual['*']; const rt = state.run_times; let t = null; try { t = (typeof rt === 'string' ? JSON.parse(rt) : rt || {})[day - 1]; } catch(e) {} return t || state.run_time || '12:00'; };
  R.weeks.forEach(function(W, wi){
    const w = wi + 1;
    up['meta_w' + w] = JSON.stringify({ phase: W.phase, isRecov: false, isPeak: !!W.peak, isTaper: !!W.taper });
    W.sessions.forEach(function(S, i){
      const d = new Date(S.date + 'T12:00:00'), day = d.getDay() === 0 ? 7 : d.getDay();
      if(S.type !== 'race') days.add(day - 1);
      const k = 'extra_w' + w + '_s' + i;
      up[k] = JSON.stringify({ d: S.t + '|' + S.x, km: S.km, type: S.type, shoe: null, sched_date: S.date, sched_day: day, sched_time: S.type === 'race' ? R.raceTime : time(day) });
      if(S.done){
        up[k + '_done'] = true; up[k + '_km'] = S.done.km;
        up[k + '_perf'] = JSON.stringify({ dur: S.done.dur, pace: S.done.pace, hr: S.done.hr, date: S.date });
      }
    });
  });
  const runDays = Array.from(days).sort(), runTimes = {}; runDays.forEach(function(d){ runTimes[d] = time(d + 1); });
  const nbSess = Math.max.apply(null, R.weeks.map(function(W){ return W.sessions.length; }));
  up.onboarding = { course: R.course, date: R.date, race_name: R.title, sessions: String(nbSess), niveau: ob0.niveau || 'Confirmé', km_semaine: '30', generate_plan: 'oui',
    target_time: R.target, race_distance_km: R.km, fc_max: state.fc_max || ob0.fc_max || null, ef_pace: state.ef_pace || ob0.ef_pace || null,
    run_days: runDays, run_times: runTimes, run_time: state.run_time || '12:00', plan_start_date: R.start, _import: R.id };
  up.plan_config = JSON.stringify({ course: R.course, niveau: up.onboarding.niveau, nbSess: nbSess, numWeeks: R.weeks.length, baseKm: 21, date: R.date });
  up.plan_version = 'import-' + R.id; up.plan_peak_week = R.weeks.findIndex(function(W){ return W.peak; }) + 1 || R.weeks.length;
  up.plan_start_date = R.start; up.goal_type = 'race'; up.target_time = R.target; up.race_distance_km = R.km;
  return up;
}
function prepReadyFor(st){ return PREPS_READY.filter(function(R){ return !((st.onboarding || {})._import === R.id) && R.date >= new Date().toISOString().slice(0, 10); }); }
function prepInstallReady(id){
  const R = PREPS_READY.find(function(x){ return x.id === id; }); if(!R || _prepView) return;
  const cur = _prepCurrentInfo(state), cs = _prepStats(state);
  const saved = Object.keys(_prepIndex || {}).some(function(k){ return _prepIndex[k].title === cur.title; });
  if(cs.planned > 0 && !saved){
    _showConfirmModal({ icon: '📦', title: 'Enregistre d\'abord ta prépa en cours', message: '« ' + cur.title + ' » n\'est pas encore dans Mes prépas. Enregistre-la, puis installe ' + R.title + '.', confirmLabel: 'Enregistrer maintenant', confirmStyle: 'background:#0C447C;color:#fff;', onConfirm: function(){ const f = document.getElementById('prep-form'); if(f) f.style.display = 'flex'; } });
    return;
  }
  const n = R.weeks.reduce(function(a, W){ return a + W.sessions.length; }, 0);
  _showConfirmModal({ icon: '🏁', title: 'Installer « ' + R.title + ' » ?', message: n + ' séances sur ' + R.weeks.length + ' semaines jusqu\'au ' + _prepDate(R.date) + '. '
      + (cs.planned > 0 ? '« ' + cur.title + ' » est enregistrée dans Mes prépas et sera retirée de l\'app. ' : '') + 'Tes réglages sont conservés.',
    confirmLabel: 'Installer la prépa', confirmStyle: 'background:#15803D;color:#fff;', onConfirm: async function(){
      try {
        const usual = _prepUsualTimes();                // à lire avant de retirer l'ancienne prépa
        await prepApplyNew();
        const up = _prepReadyUpdates(R, usual);
        if(R.memo && String(state._coach_memos || '').indexOf(R.memo) < 0) up._coach_memos = (state._coach_memos ? state._coach_memos + '\n' : '') + R.memo;
        Object.assign(state, up);
        await dbRef.update(up);
        syncPlanCompat();
        closePrepsPanel();
        if(typeof rendered !== 'undefined') rendered.plan = false;
        showScreen('home'); try { renderPlan(); } catch(e) {}
        if(typeof showToast === 'function') showToast(R.title + ' installée 🏁');
      } catch(e) { alert('Installation impossible (' + e.message + '). Vérifie ta connexion et réessaie.'); }
    } });
}

// ─── Consultation en lecture seule ─────────────────────────────────────────
// référence factice : toutes les écritures sont ignorées pendant la consultation
const _prepNullRef = (function(){
  const ok = function(){ return Promise.resolve(); };
  const r = { child: function(){ return r; }, set: ok, update: ok, remove: ok, transaction: ok, on: function(){}, off: function(){},
    push: function(){ const p = Promise.resolve(); p.key = 'lecture-seule'; return p; },
    once: function(){ return Promise.resolve({ val: function(){ return null; }, exists: function(){ return false; } }); } };
  return r;
})();
async function prepView(id){
  if(_prepView) prepViewExit(true);
  let snap;
  try { snap = (await _prepRef('preps/' + id).once('value')).val(); } catch(e) { snap = null; }
  if(!snap){ alert('Impossible d\'ouvrir cette prépa (connexion ?).'); return; }
  const meta = (_prepIndex || {})[id] || {};
  _prepView = { state: state, dbRef: dbRef, meta: meta };
  state = snap; dbRef = _prepNullRef;
  syncPlanCompat();                                      // semaines et semaine en cours de la prépa consultée
  closePrepsPanel();
  const bar = document.createElement('div'); bar.id = 'prep-view-bar';
  bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:9000;padding:calc(env(safe-area-inset-top) + 8px) 12px 8px;background:#92400E;color:#fff;display:flex;align-items:center;gap:10px;box-shadow:0 2px 10px rgba(0,0,0,.25);font-family:inherit;';
  bar.innerHTML = '<span style="flex:1;min-width:0;font-size:13px;line-height:1.3;"><b>📖 ' + _prepEsc(meta.title || 'Prépa archivée') + '</b><br><span style="opacity:.85;">Consultation · lecture seule</span></span>'
    + '<button onclick="prepViewExit()" style="flex-shrink:0;background:#fff;color:#92400E;border:none;border-radius:999px;padding:8px 14px;font-weight:800;font-size:13px;cursor:pointer;">Quitter</button>';
  document.body.appendChild(bar);
  document.body.style.paddingTop = bar.offsetHeight + 'px';
  showScreen('home');
  try { if(typeof renderPlan === 'function') renderPlan(); } catch(e) {}
}
function prepViewExit(silent){
  if(!_prepView) return;
  state = _prepView.state; dbRef = _prepView.dbRef; _prepView = null;
  syncPlanCompat();
  const bar = document.getElementById('prep-view-bar'); if(bar) bar.remove();
  document.body.style.paddingTop = '';
  if(silent) return;
  try { if(typeof renderPlan === 'function') renderPlan(); } catch(e) {}
  showScreen('compte');
  try { renderCompteScreen(); } catch(e) {}
  openPrepsPanel();
}
