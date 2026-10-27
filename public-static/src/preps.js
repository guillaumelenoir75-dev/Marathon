// Mes prépas (Compte) : une prépa terminée est enregistrée comme une copie figée de l'état
// (users/{uid}/preps/{id}) avec sa fiche (users/{uid}/prep_index/{id}). « Consulter » rouvre toute l'app
// sur cette copie, en lecture seule : aucune écriture ne peut partir vers la base pendant la consultation.

// clés non archivées : historique du coach, jetons et données d'appareils (volumineux ou personnels)
const _PREP_SKIP = /^(_coach_history|_coach_unread|_brief|whoop_|strava_token|_push_sub|_ratelimit|_open_coach|_last_location|_wakeup_|_geo_granted|_shaker_run_ts)/;
let _prepIndex = null, _prepView = null, _prepPendingNew = false, _prepNext = null;
// clés propres à une prépa (retirées au démarrage d'une nouvelle) ; profil, chaussures, FC, VO2max, Strava… sont conservés
const _PREP_RESET = /^(extra_w\d+_s\d+|_last_validation_w|meta_w|edit_w|del_w|order_w|s\d+i\d+|rf\d+(r\d+|skip)|_congrats_sent_w|absences_cw|plan_config$|plan_version$|plan_peak_week$|plan_start_date$|_plan_adapted|onboarding$|goal_type$|target_time$|race_distance_km$|_am_pace$|_am_training_pace$|_prep_id$|_prep_autosave$)/;

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
  const ob = st.onboarding || {}, date = ob.date || '', nm = ob.race_name || ob.course || 'Ma prépa', yr = String(date).slice(0, 4);
  return { title: nm + (date && nm.indexOf(yr) < 0 ? ' ' + yr : ''), race: ob.race_name || ob.course || '',
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
    + '<div class="modal-scroll-body" style="background:#F3F6FC;"><div id="preps-body" style="padding:14px 16px 24px;display:flex;flex-direction:column;gap:12px;"><p style="color:#888;font-size:13px;">Chargement…</p></div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) closePrepsPanel(); });
  mc.appendChild(ov);
  try { _prepIndex = (await _prepRef('prep_index').once('value')).val() || {}; } catch(e) { _prepIndex = {}; }
  try { _prepNext = (await _prepRef('prep_next/meta').once('value')).val(); } catch(e) {}
  _renderPrepsBody();
}
function closePrepsPanel(){ const ov = document.getElementById('preps-panel'); if(ov) ov.remove(); }

// Styles du panneau (injectés une fois) : palette de l'app, cartes blanches sur fond bleuté
const _PREP_CSS = '#preps-body{background:#F3F6FC;}'
  + '.pp-sec{font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#64748B;margin:6px 2px -4px;}'
  + '.pp-card{background:#fff;border:1px solid #DCE5F3;border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:10px;}'
  + '.pp-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;}'
  + '.pp-pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:3px 9px;font-size:11.5px;font-weight:800;white-space:nowrap;}'
  + '.pp-pill.now{background:#DCFCE7;color:#15803D;}.pp-pill.next{background:#E0E9FF;color:#1B4FD8;}.pp-pill.ready{background:#FEF3C7;color:#92400E;}'
  + '.pp-dot{width:7px;height:7px;border-radius:50%;background:currentColor;}'
  + '.pp-title{font-size:18px;font-weight:850;color:#0C447C;line-height:1.2;margin:6px 0 2px;text-wrap:balance;}'
  + '.pp-sub{font-size:13px;color:#5B6675;line-height:1.4;margin:0;}'
  + '.pp-count{text-align:right;flex-shrink:0;}.pp-count b{display:block;font-size:26px;font-weight:900;color:#0C447C;line-height:1;font-variant-numeric:tabular-nums;}'
  + '.pp-count span{font-size:10.5px;color:#64748B;font-weight:700;}'
  + '.pp-prog{display:flex;flex-direction:column;gap:5px;}.pp-prog-l{display:flex;justify-content:space-between;font-size:12px;color:#5B6675;font-weight:700;font-variant-numeric:tabular-nums;}'
  + '.pp-bar{height:7px;border-radius:99px;background:#E6ECF5;overflow:hidden;}.pp-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#1B4FD8,#0C447C);}'
  + '.pp-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}'
  + '.pp-stat{background:#F5F8FD;border-radius:11px;padding:8px 6px;text-align:center;}.pp-stat b{display:block;font-size:16px;font-weight:850;color:#0F172A;font-variant-numeric:tabular-nums;}'
  + '.pp-stat span{font-size:10.5px;color:#64748B;font-weight:700;}'
  + '.pp-chips{display:flex;flex-wrap:wrap;gap:6px;}.pp-chip{background:#F1F5FB;color:#334155;border-radius:8px;padding:4px 8px;font-size:12px;font-weight:700;}'
  + '.pp-note{font-size:12.5px;color:#15803D;font-weight:700;margin:0;display:flex;gap:6px;align-items:flex-start;line-height:1.4;}'
  + '.pp-note.info{color:#1E40AF;}.pp-note.muted{color:#5B6675;font-weight:600;font-size:12px;}'
  + '.pp-acts{display:flex;gap:8px;align-items:center;}'
  + '.pp-btn{flex:1 1 0;min-width:0;border-radius:11px;padding:11px 12px;font-size:13.5px;font-weight:800;cursor:pointer;border:1px solid transparent;text-align:center;text-decoration:none;font-family:inherit;}'
  + '.pp-btn:focus-visible{outline:2px solid #1B4FD8;outline-offset:2px;}'
  + '.pp-btn.pri{background:#1B4FD8;color:#fff;}.pp-btn.ok{background:#15803D;color:#fff;}.pp-btn.sec{background:#EEF3FC;color:#1B4FD8;border-color:#D3DFF5;}'
  + '.pp-btn.warm{background:#FFF7ED;color:#C2410C;border-color:#FED7AA;}'
  + '.pp-btn.ghost{flex:0 0 auto;background:none;color:#64748B;padding:8px 6px;font-weight:700;}.pp-btn.danger{flex:0 0 auto;background:none;color:#B91C1C;padding:8px 6px;font-weight:700;}'
  + '.pp-btn.icon{flex:0 0 44px;padding:10px 0;background:#fff;color:#B91C1C;border-color:#FAD4D4;}'
  + '.pp-new{width:100%;background:transparent;border:1.5px dashed #9DB4E0;color:#1B4FD8;border-radius:14px;padding:13px;font-size:14.5px;font-weight:800;cursor:pointer;font-family:inherit;}'
  + '.pp-res{flex-shrink:0;background:#FEF3C7;color:#92400E;border-radius:999px;padding:5px 10px;font-size:13px;font-weight:900;font-variant-numeric:tabular-nums;}'
  + '.pp-form{display:none;flex-direction:column;gap:8px;border-top:1px solid #E6ECF5;padding-top:12px;}'
  + '.pp-form label{font-size:12px;font-weight:700;color:#5B6675;}.pp-form input{display:block;width:100%;margin-top:3px;padding:9px 10px;border:1px solid #D6DFEC;border-radius:9px;font-size:14px;box-sizing:border-box;font-family:inherit;}'
  + '.pp-empty{font-size:13px;color:#64748B;margin:0 2px;}';
const _ppS = function(n, w){ return n + ' ' + w + (n > 1 ? 's' : ''); };                        // 1 séance, 2 séances
const _ppDays = function(d){ if(!d) return null; const a = new Date(_prepToday() + 'T12:00:00'), b = new Date(String(d).slice(0, 10) + 'T12:00:00'); return Math.round((b - a) / 86400000); };
const _ppNum = function(n){ return Number(n || 0).toLocaleString('fr-FR'); };
const _ppTime = function(t){ return String(t || '').replace(/^00:/, '').replace(/^0(?=\d:)/, ''); };

function _renderPrepsBody(){
  const box = document.getElementById('preps-body'); if(!box) return;
  if(!document.getElementById('prep-css')){ const st = document.createElement('style'); st.id = 'prep-css'; st.textContent = _PREP_CSS; document.head.appendChild(st); }
  const cur = _prepCurrentInfo(state), cs = _prepStats(state);
  const isCur = function(p){ return !usesHardPlan() && (p.id === state._prep_id || p.title === cur.title); };
  const all = Object.keys(_prepIndex || {}).map(function(k){ return Object.assign({ id: k }, _prepIndex[k]); });
  const already = all.find(function(p){ return p.id === state._prep_id || p.title === cur.title; });
  const saved = all.filter(function(p){ return !(_prepView ? false : isCur(p)); })                  // la prépa en cours n'est pas listée deux fois
    .sort(function(a, b){ return String(b.date || '').localeCompare(String(a.date || '')); });
  let h = '';
  if(_prepView){
    const nx = _prepView.next;
    h += '<div class="pp-card" style="background:' + (nx ? '#EEF3FC;border-color:#C7D7F8' : '#FFF7ED;border-color:#FED7AA') + ';"><p class="pp-sub" style="color:' + (nx ? '#1B4FD8' : '#92400E') + ';">'
      + (nx ? '<b>✏️ Prépa à venir ouverte</b> : « ' : '<b>📖 Consultation en cours</b> : « ') + _prepEsc(_prepView.meta.title || 'prépa archivée') + ' ».<br>Touche <b>Quitter</b> dans le bandeau pour revenir à ta prépa en cours'
      + (nx ? '.' : ' et gérer tes prépas.') + '</p></div>';
  } else {
    // ── Maintenant
    h += '<p class="pp-sec">Maintenant</p>';
    const R = usesHardPlan() ? null : prepRace(), j = _ppDays(cur.date), tot = Math.max(1, cs.weeks);
    const cw = Math.min(tot, Math.max(1, typeof getEffectiveCW === 'function' ? getEffectiveCW() : 1));
    const kmPlan = _prepPlannedKm(state);
    h += '<section class="pp-card" aria-label="Prépa en cours"><div class="pp-top"><div style="min-width:0;">'
      +   '<span class="pp-pill now"><span class="pp-dot"></span>En cours' + (cs.planned ? ' · S' + cw + '/' + tot : '') + '</span>'
      +   '<p class="pp-title">' + _prepEsc(cur.title) + '</p>'
      +   '<p class="pp-sub">' + [cur.dist, cur.date ? _prepDate(cur.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'sans date de course', R && R.objectif && R.objectif !== 'non défini' ? 'objectif ' + _prepEsc(R.objectif) : ''].filter(Boolean).join(' · ') + '</p></div>'
      +   (j != null && j >= 0 ? '<div class="pp-count"><b>' + (j === 0 ? 'Jour J' : 'J-' + j) + '</b><span>' + (j === 0 ? 'c\'est aujourd\'hui' : 'avant la course') + '</span></div>' : '') + '</div>';
    if(cs.planned){
      h += '<div class="pp-prog"><div class="pp-prog-l"><span>Semaine ' + cw + ' sur ' + tot + '</span><span>' + cs.done + '/' + cs.planned + ' séances</span></div>'
        +   '<div class="pp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + cs.planned + '" aria-valuenow="' + cs.done + '" aria-label="Séances réalisées"><i style="width:' + Math.round(cs.done / cs.planned * 100) + '%"></i></div></div>'
        + '<div class="pp-stats"><div class="pp-stat"><b>' + cs.done + '</b><span>' + (cs.done > 1 ? 'séances faites' : 'séance faite') + '</span></div>'
        +   '<div class="pp-stat"><b>' + _ppNum(cs.km) + '</b><span>km réalisés</span></div>'
        +   '<div class="pp-stat"><b>' + _ppNum(kmPlan) + '</b><span>km prévus</span></div></div>';
    }
    h += (already ? '<p class="pp-note muted"><span style="color:#15803D;">✓</span> <span>Enregistrée ' + (already.savedAt === _prepToday() ? 'aujourd\'hui' : 'le ' + _prepDate(already.savedAt, { day: 'numeric', month: 'long' })) + (already.auto && !usesHardPlan() ? ' · mise à jour chaque jour' : '') + '</span></p>' : '')
      + '<div class="pp-acts">'
      +   '<button class="pp-btn ' + (already ? 'sec' : 'pri') + '" onclick="prepShowForm()">' + (already ? '✎ Nom, temps, note' : '📦 Enregistrer cette prépa') + '</button>'
      +   (!usesHardPlan() && cs.planned > 0 ? '<button class="pp-btn danger" onclick="prepDiscardCurrent()">Supprimer</button>' : '') + '</div>'
      + '<div id="prep-form" class="pp-form">'
      +   '<label>Nom<input id="pf-title" value="' + _prepEsc(already ? already.title : cur.title) + '"></label>'
      +   '<label>Date de la course<input id="pf-date" type="date" value="' + _prepEsc(cur.date) + '"></label>'
      +   '<label>Temps officiel<input id="pf-result" inputmode="numeric" placeholder="ex. 41:30" value="' + _prepEsc(already ? already.result : cur.result) + '"></label>'
      +   '<label>Note<input id="pf-note" placeholder="Record personnel, sensations…" value="' + _prepEsc(already ? already.note : cur.note) + '"></label>'
      +   '<button class="pp-btn ok" onclick="prepSaveCurrent()" id="pf-save">Enregistrer dans Mes prépas</button>'
      +   '<p class="pp-sub" style="font-size:11.5px;color:#7A8597;">Une copie figée du programme et de tes séances est conservée. Ta prépa en cours n\'est pas modifiée.</p>'
      + '</div></section>';
    // ── Ensuite : prépa à venir, prépas prêtes à installer, nouvelle prépa
    const ready = prepReadyFor(state);
    h += '<p class="pp-sec">Ensuite</p>';
    if(_prepNext){
      const N = _prepNext, js = _ppDays(N.start);
      h += '<section class="pp-card" aria-label="Prépa à venir"><div class="pp-top"><div style="min-width:0;">'
        +   '<span class="pp-pill next">⏭ À venir' + (js > 0 ? ' · dans ' + _ppS(js, 'jour') : '') + '</span>'
        +   '<p class="pp-title">' + _prepEsc(N.title) + '</p>'
        +   '<p class="pp-sub">' + [N.dist, _prepDate(N.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), N.target ? 'objectif ' + _prepEsc(_ppTime(N.target)) : ''].filter(Boolean).join(' · ') + '</p></div></div>'
        + '<div class="pp-chips"><span class="pp-chip">' + _ppS(N.weeks, 'semaine') + '</span><span class="pp-chip">' + _ppS(N.sessions, 'séance') + '</span></div>'
        + '<p class="pp-note info">↪ <span>Démarre seule le ' + _prepDate(N.start, { weekday: 'long', day: 'numeric', month: 'long' }) + ', dès ta course validée.</span></p>'
        + '<div class="pp-acts"><button class="pp-btn pri" onclick="prepNextOpen()">✏️ Voir et modifier</button>'
        +   '<button class="pp-btn icon" onclick="prepNextDelete()" aria-label="Supprimer la prépa à venir">🗑</button></div></section>';
    }
    ready.forEach(function(R){
      const n = R.weeks.reduce(function(a, W){ return a + W.sessions.length; }, 0);
      h += '<section class="pp-card"><div><span class="pp-pill ready">📥 Prête à installer</span><p class="pp-title">' + _prepEsc(R.title) + '</p>'
        + '<p class="pp-sub">Course le ' + _prepDate(R.date) + ' · ' + _ppS(R.weeks.length, 'semaine') + ' · ' + _ppS(n, 'séance') + ' · objectif ' + _ppTime(R.target) + '</p></div>'
        + '<div class="pp-acts"><button class="pp-btn ok" onclick="prepInstallReady(\'' + R.id + '\')">Installer cette prépa</button></div></section>';
    });
    h += '<button class="pp-new" onclick="prepNew()">＋ Nouvelle prépa</button>';
  }
  // ── Terminées
  h += '<p class="pp-sec">Terminées</p>';
  if(!saved.length) h += '<p class="pp-empty">Aucune pour l\'instant : ta prépa en cours y sera enregistrée automatiquement.</p>';
  saved.forEach(function(p){
    const s = p.stats || {};
    h += '<section class="pp-card"><div class="pp-top"><div style="min-width:0;">'
      +   '<p class="pp-title" style="margin-top:0;font-size:16.5px;">' + _prepEsc(p.title) + '</p>'
      +   '<p class="pp-sub">' + [p.date ? _prepDate(p.date) : '', s.weeks ? _ppS(s.weeks, 'semaine') : '', s.weeks ? _ppS(s.done, 'séance') : '', s.weeks ? _ppNum(s.km) + ' km' : ''].filter(Boolean).join(' · ') + '</p></div>'
      +   (p.result ? '<span class="pp-res">⏱ ' + _prepEsc(p.result) + '</span>' : '') + '</div>'
      + (p.note ? '<p class="pp-note" style="color:#B45309;">🏅 <span>' + _prepEsc(p.note) + '</span></p>' : '')
      + '<div class="pp-acts"><button class="pp-btn sec" onclick="prepView(\'' + p.id + '\')">📖 Consulter</button>'
      +   (p.replay ? '<a class="pp-btn warm" href="' + _prepEsc(p.replay) + '" target="_blank" rel="noopener">🎬 Revoir</a>' : '')
      +   (_prepView ? '' : '<button class="pp-btn icon" onclick="prepDelete(\'' + p.id + '\')" aria-label="Supprimer ' + _prepEsc(p.title) + '">🗑</button>') + '</div></section>';
  });
  box.innerHTML = h;
}
// km prévus de la prépa (somme des séances)
function _prepPlannedKm(st){
  let t = 0;
  Object.keys(st).forEach(function(k){ if(/^extra_w\d+_s\d+$/.test(k)){ try { t += parseFloat(JSON.parse(st[k]).km) || 0; } catch(e) {} } });
  return Math.round(t);
}
function prepShowForm(){ const f = document.getElementById('prep-form'); if(!f) return; const open = getComputedStyle(f).display !== 'none'; f.style.display = open ? 'none' : 'flex'; if(!open){ const i = document.getElementById('pf-title'); if(i) i.focus({ preventScroll: true }); f.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } }

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
    if(!usesHardPlan()){ state._prep_id = id; dbRef.update({ _prep_id: id }).catch(function(){}); }
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
const _EF_NR = "5'45 — 6'10 /km";
const PREPS_READY = [{
  id: 'novembrun-2026', title: "10km Novemb'Run", course: '10 km', date: '2026-11-22', start: '2026-10-26', target: '00:42:00', km: 10, raceTime: '09:00',
  weeks: [
    { phase: 'Reprise', sessions: [
      { date: '2026-10-27', type: 'ef', km: 5, t: 'Footing de reprise', x: _EF_NR,
        done: { km: 5.02, dur: '28:36', pace: "5'42", hr: 143, note: 'Très bonnes sensations, aucune douleur.' } },
      { date: '2026-10-29', type: 'ef', km: 7, t: 'Footing facile', x: _EF_NR },
      { date: '2026-11-01', type: 'long', km: 9, t: 'Endurance prolongée', x: _EF_NR } ] },
    { phase: 'Consolidation', sessions: [
      { date: '2026-11-03', type: 'ef', km: 8, t: 'Footing facile', x: _EF_NR },
      { date: '2026-11-05', type: 'ef', km: 9, t: 'Footing facile', x: _EF_NR },
      { date: '2026-11-08', type: 'long', km: 11, t: 'Sortie longue', x: _EF_NR } ] },
    { phase: 'Reprise du fractionné', peak: true, sessions: [
      { date: '2026-11-10', type: 'ef', km: 8, t: 'Footing + accélérations', x: _EF_NR + ' · 4 × 15 s progressives' },
      { date: '2026-11-12', type: 'frac', km: 10, t: '4×1000 m', x: "3 km EF · 4 × 1000 m à 4'18 — 4'22 /km · récup 2 min" },
      { date: '2026-11-14', type: 'ef', km: 6, t: 'Footing de récupération', x: _EF_NR + ' · très facile' },
      { date: '2026-11-15', type: 'long', km: 12, t: 'Sortie longue', x: _EF_NR } ] },
    { phase: 'Allègement et course', taper: true, sessions: [
      { date: '2026-11-17', type: 'frac', km: 8, t: '3×1000 m', x: "2-3 km EF · 3 × 1000 m à 4'12 — 4'15 /km · récup 2 min" },
      { date: '2026-11-19', type: 'ef', km: 6, t: 'Footing facile', x: _EF_NR },
      { date: '2026-11-21', type: 'ef', km: 3, t: 'Mise en jambes', x: 'Très facile · 3 × 15 s progressives' },
      { date: '2026-11-22', type: 'race', km: 12.5, t: "NOVEMB'RUN – 10 km", x: "Objectif 42:00 · 4'12 /km · échauffement 12-15 min + 3 accélérations" } ] },
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
    up['meta_w' + w] = JSON.stringify({ phase: W.phase, isRecov: !!W.recov, isPeak: !!W.peak, isTaper: !!W.taper });
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
        if(typeof applyShoeRules === 'function') Object.assign(up, applyShoeRules(true));   // paires selon le type de séance
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

// ─── Prépa à venir : programme fourni, modifiable avant son début, activé automatiquement après la course en cours ───
// users/{uid}/prep_next = { meta: {id, title, start, first, date, …}, state: clés de la prépa (format extra_w*, meta_w*…) }
const _EF_SP = "5'30 — 6'10 /km", _REC_SP = "Très facile · 6'10 /km ou plus lent";
const _spWeek = function(phase, flags, ef1, ef2, q, lg, d0){              // lundi EF, mercredi EF très facile, jeudi qualité, samedi longue
  const day = function(n){ const d = new Date(d0 + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  return Object.assign({ phase: phase, sessions: [
    { date: day(0), type: 'ef', km: ef1, t: 'Footing facile', x: _EF_SP },
    { date: day(2), type: 'ef', km: ef2, t: 'Footing facile', x: _EF_SP + ' · très facile' },
    { date: day(3), type: q[0], km: q[1], t: q[2], x: q[3] },
    { date: day(5), type: 'long', km: lg, t: 'Sortie longue', x: _EF_SP } ] }, flags);
};
const PREPS_NEXT = [{
  id: 'semi-paris-2027', title: 'Semi Paris 2027', race: 'Semi de Paris', course: 'Semi-marathon', date: '2027-03-07', start: '2026-11-23', after: 'novembrun-2026',
  target: '01:30:00', km: 21.1, raceTime: '09:00',
  weeks: [
    { phase: 'Récupération après le 10 km', recov: true, sessions: [
      { date: '2026-11-25', type: 'ef', km: 5, t: 'Récupération après course', x: _REC_SP },
      { date: '2026-11-26', type: 'ef', km: 6, t: 'Récupération après course', x: _REC_SP },
      { date: '2026-11-28', type: 'ef', km: 7, t: 'Récupération après course', x: _REC_SP },
      { date: '2026-11-29', type: 'ef', km: 8, t: 'Récupération après course', x: _REC_SP } ] },
    _spWeek('Reconstruction', {}, 8, 6, ['frac', 8, '8 × 1 min / 1 min', "3 km EF · 8 × 1 min à 4'20 — 4'30 /km · récup 1 min"], 12, '2026-11-30'),
    _spWeek('Base aérobie', {}, 10, 7, ['tempo', 10, '3 × 6 min tempo', "3 km EF · 3 × 6 min à 4'40 — 4'45 /km · récup 2 min"], 13, '2026-12-07'),
    _spWeek('Base aérobie', {}, 11, 8, ['frac', 11, '5 × 800 m', "3 km EF · 5 × 800 m à 4'20 — 4'30 /km (3'28 — 3'36) · récup 1'30"], 14, '2026-12-14'),
    _spWeek('Semaine allégée', { recov: true }, 8, 7, ['frac', 9, '6 × 400 m', "3 km EF · 6 × 400 m à 4'15 — 4'25 /km (1'42 — 1'46) · récup 1 min"], 12, '2026-12-21'),
    _spWeek('Développement', {}, 12, 8, ['tempo', 11, '3 × 8 min tempo', "3 km EF · 3 × 8 min à 4'35 — 4'40 /km · récup 2 min"], 15, '2026-12-28'),
    _spWeek('Développement', {}, 13, 9, ['frac', 12, '6 × 1 000 m', "3 km EF · 6 × 1000 m à 4'15 — 4'25 /km · récup 1'30"], 16, '2027-01-04'),
    _spWeek('Premiers blocs semi', {}, 14, 10, ['tempo', 12, '2 × 3 000 m', "3 km EF · 2 × 3000 m à 4'25 — 4'30 /km · récup 3 min"], 18, '2027-01-11'),
    _spWeek('Semaine allégée', { recov: true }, 10, 8, ['tempo', 10, '3 × 6 min tempo', "3 km EF · 3 × 6 min à 4'35 — 4'40 /km · récup 2 min"], 16, '2027-01-18'),
    _spWeek('Spécifique semi', {}, 14, 11, ['tempo', 13, '3 × 2 500 m', "3 km EF · 3 × 2500 m à 4'20 — 4'25 /km · récup 2'30"], 20, '2027-01-25'),
    _spWeek('Consolidation du volume', {}, 16, 11, ['tempo', 14, '3 × 3 000 m à AS21', "3 km EF · 3 × 3000 m à 4'15 — 4'20 /km · récup 2 min"], 21, '2027-02-01'),
    _spWeek('Semaine allégée', { recov: true }, 12, 9, ['frac', 12, '5 × 600 m', "3 km EF · 5 × 600 m à 4'10 — 4'20 /km (2'30 — 2'36) · récup 1'30"], 17, '2027-02-08'),
    _spWeek('Pic de volume', { peak: true }, 17, 12, ['tempo', 15, '2 × 3 000 m à AS21', "3 km EF · 2 × 3000 m à 4'15 — 4'20 /km · récup 2 min"], 21, '2027-02-15'),
    _spWeek('Affûtage', { taper: true }, 11, 8, ['tempo', 11, '3 × 1 600 m à AS21', "3 km EF · 3 × 1600 m à 4'15 — 4'18 /km · récup 2 min"], 14, '2027-02-22'),
    { phase: 'Semaine de course', taper: true, sessions: [
      { date: '2027-03-01', type: 'ef', km: 6, t: 'Footing facile', x: _EF_SP },
      { date: '2027-03-03', type: 'ef', km: 4, t: 'Footing facile', x: _EF_SP + ' · très facile' },
      { date: '2027-03-04', type: 'tempo', km: 5, t: '3 × 600 m à AS21', x: "2 km EF · 3 × 600 m à 4'15 — 4'18 /km · récup 1 min" },
      { date: '2027-03-07', type: 'race', km: 23.6, t: 'SEMI DE PARIS – 21,1 km', x: "Objectif 1:30:00 · 4'15 /km · échauffement 12-15 min + 3 accélérations" } ] },
  ],
  memo: "Prépa Semi de Paris (07/03/2027) : objectif moins de 1 h 30 (≈4'15/km, cible à confirmer, pas un niveau acquis) ; record semi 1 h 37 (septembre 2026). Rythme : lundi EF, mercredi EF très facile, jeudi qualité, samedi sortie longue ; repos mardi, vendredi et dimanche. Allures de qualité provisoires : réévaluer après le 10 km et fin janvier ; ralentir de 5-10 s/km si l'effort devient excessif. Renfo facultatif 15-20 min après un footing, allégé les deux dernières semaines.",
}];

const _prepToday = function(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const _prepKeysOf = function(st){ const o = {}; Object.keys(st || {}).forEach(function(k){ if(_PREP_RESET.test(k)) o[k] = st[k]; }); return o; };
function _prepNextMeta(R){
  const n = R.weeks.reduce(function(a, W){ return a + W.sessions.length; }, 0);
  return { id: R.id, title: R.title, race: R.race, dist: R.course, date: R.date, start: R.start, first: R.weeks[0].sessions[0].date, after: R.after || '',
    target: R.target, weeks: R.weeks.length, sessions: n, memo: R.memo || '', createdAt: _prepToday() };
}
// création (une seule fois) de la prépa à venir fournie
async function _prepSeedNext(){
  if(!isAdmin() || usesHardPlan() || _prepView) return;
  for(const R of PREPS_NEXT){
    if(state._next_seed === R.id || (state.onboarding || {})._import === R.id) continue;
    if(R.date < _prepToday()) continue;
    const cur = await _prepRef('prep_next/meta').once('value');
    if(cur.val()){ state._next_seed = R.id; dbRef.update({ _next_seed: R.id }).catch(function(){}); continue; }
    const keys = _prepReadyUpdates(R, _prepUsualTimes());
    // paires selon le type de séance (EF → GRVL, rapide → Adios…)
    Object.keys(keys).forEach(function(k){
      if(!/^extra_w\d+_s\d+$/.test(k) || typeof shoeForType !== 'function') return;
      const x = JSON.parse(keys[k]); x.shoe = shoeForType(x.type); keys[k] = JSON.stringify(x);
    });
    await _prepRef('prep_next').set({ meta: _prepNextMeta(R), state: keys });
    state._next_seed = R.id; await dbRef.update({ _next_seed: R.id });
    _prepNext = _prepNextMeta(R);
  }
}
// Enregistrement automatique quotidien de la prépa en cours dans Mes prépas (copie figée mise à jour)
async function prepAutoSave(force){
  if(_prepView || (typeof _adminPreviewUid !== 'undefined' && _adminPreviewUid) || !_prepUid() || usesHardPlan()) return;
  const cs = _prepStats(state); if(!cs.planned) return;
  const today = _prepToday();
  if(!force && state._prep_autosave === today) return;
  const cur = _prepCurrentInfo(state);
  const idx = (await _prepRef('prep_index').once('value')).val() || {};
  // fiche de cette prépa : même nom, ou même course (fiche renommée à la main)
  const mine = function(k){ return !!idx[k] && (idx[k].title === cur.title || (!!cur.date && idx[k].date === cur.date && !idx[k].admin)); };
  let id = state._prep_id && mine(state._prep_id) ? state._prep_id : (Object.keys(idx).find(mine) || null);
  while(!id || (idx[id] && !mine(id))) id = _prepRef('prep_index').push().key;   // jamais la fiche d'une autre prépa

  const old = idx[id] || {}, snap = {};
  state._prep_id = id; state._prep_autosave = today;
  Object.keys(state).forEach(function(k){ if(!_PREP_SKIP.test(k) && state[k] !== undefined) snap[k] = state[k]; });
  const meta = { title: old.title || cur.title, race: cur.race, dist: cur.dist, date: cur.date || old.date || '', start: cur.start || '',
    result: old.result || '', note: old.note || '', replay: old.replay || '', stats: cs, savedAt: today, auto: true, admin: false };
  await _prepRef('preps/' + id).set(snap);
  await _prepRef('prep_index/' + id).set(meta);
  if(_prepIndex) _prepIndex[id] = meta;
  await dbRef.update({ _prep_id: id, _prep_autosave: today });
}
// Course de la prépa en cours validée ?
function _prepRaceDone(st){
  return Object.keys(st).some(function(k){
    if(!/^extra_w\d+_s\d+$/.test(k) || !(st[k + '_done'] || st[k + '_km'] != null)) return false;
    try { return JSON.parse(st[k]).type === 'race'; } catch(e) { return false; }
  });
}
// Bascule : dès le début de la prépa à venir, une fois la course en cours validée (ou au plus tard à sa première séance)
async function _prepMaybeAdvance(){
  if(_prepView || (typeof _adminPreviewUid !== 'undefined' && _adminPreviewUid) || !_prepUid()) return;
  const meta = (await _prepRef('prep_next/meta').once('value')).val(); _prepNext = meta;
  if(!meta) return;
  const today = _prepToday(), cur = _prepCurrentInfo(state);
  if(today < meta.start || (cur.date && cur.date >= meta.start)) return;
  if(_prepStats(state).planned && !_prepRaceDone(state) && today < meta.first) return;
  await prepActivateNext();
}
async function prepActivateNext(){
  const snap = (await _prepRef('prep_next').once('value')).val();
  if(!snap || !snap.state) return;
  if(_prepStats(state).planned) await prepAutoSave(true);              // la prépa qui se termine est enregistrée telle quelle
  await prepApplyNew();
  const up = _prepKeysOf(snap.state), m = snap.meta || {};
  delete up._prep_id; delete up._prep_autosave;
  if(m.memo && String(state._coach_memos || '').indexOf(m.memo) < 0) up._coach_memos = (state._coach_memos ? state._coach_memos + '\n' : '') + m.memo;
  Object.assign(state, up);
  if(typeof applyShoeRules === 'function') Object.assign(up, applyShoeRules(true));
  await dbRef.update(up);
  await _prepRef('prep_next').remove(); _prepNext = null;
  syncPlanCompat();
  if(typeof rendered !== 'undefined'){ rendered.plan = false; rendered.stats = false; }
  try { renderHome(); renderPlan(); } catch(e) {}
  if(typeof showToast === 'function') showToast((m.title || 'Nouvelle prépa') + ' commence 🏁');
}
// Tâches du jour (au chargement et au retour sur l'app) : consignes courtes, prépa à venir, enregistrement, bascule
let _prepDailyBusy = false;
async function prepDailyTasks(){
  if(_prepDailyBusy || typeof firebaseReady === 'undefined' || !firebaseReady) return;
  _prepDailyBusy = true;
  try { await _prepSeedNext(); } catch(e) { console.warn('[prépa] à venir', e); }
  try { await prepAutoSave(false); } catch(e) { console.warn('[prépa] enregistrement auto', e); }
  try { await _prepMaybeAdvance(); } catch(e) { console.warn('[prépa] bascule', e); }
  _prepDailyBusy = false;
}
document.addEventListener('visibilitychange', function(){ if(document.visibilityState === 'visible') setTimeout(prepDailyTasks, 1500); });

// Consignes courtes (allure d'abord) pour les séances déjà installées de Novemb'Run — une seule fois
function prepShortDescV1(){
  if(!isAdmin() || usesHardPlan() || _prepView || state._desc_short_v1) return;
  const R = PREPS_READY.find(function(x){ return x.id === (state.onboarding || {})._import; });
  state._desc_short_v1 = true;
  if(!R) return;
  const byDate = {};
  R.weeks.forEach(function(W){ W.sessions.forEach(function(S){ byDate[S.date + S.type] = S; }); });
  Object.keys(state).forEach(function(k){
    const m = k.match(/^extra_w(\d+)_s(\d+)$/); if(!m) return;
    let x; try { x = JSON.parse(state[k]); } catch(e) { return; }
    const W = R.weeks[+m[1] - 1], S0 = W && W.sessions[+m[2]];
    const S = (S0 && S0.type === x.type) ? S0 : byDate[(x.sched_date || '') + x.type];
    const parts = String(x.d || '').split('|'), det = parts.slice(1).join('|');
    let nx = null;
    if(S) nx = S.x;
    else if(/Endurance facile|Pouvoir parler/.test(det)) nx = _EF_NR;                     // séance ajoutée avec l'ancienne consigne
    if(nx && det !== nx){ x.d = parts[0] + '|' + nx; state[k] = JSON.stringify(x); }
  });
}

// ─── Voir et modifier la prépa à venir : toute l'app s'ouvre sur son programme, les modifications y sont enregistrées ───
async function prepNextOpen(){
  if(_prepView) prepViewExit(true);
  let snap;
  try { snap = (await _prepRef('prep_next').once('value')).val(); } catch(e) { snap = null; }
  if(!snap || !snap.state){ alert('Impossible d\'ouvrir la prépa à venir (connexion ?).'); return; }
  const base = {};
  Object.keys(state).forEach(function(k){ if(!_PREP_RESET.test(k)) base[k] = state[k]; });   // réglages actuels + programme à venir
  const meta = snap.meta || {};
  _prepView = { state: state, dbRef: dbRef, meta: meta, next: true };
  state = Object.assign(base, _prepKeysOf(snap.state)); dbRef = _prepRef('prep_next/state');
  syncPlanCompat();
  closePrepsPanel();
  const bar = document.createElement('div'); bar.id = 'prep-view-bar';
  bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:9000;padding:calc(env(safe-area-inset-top) + 8px) 12px 8px;background:#1B4FD8;color:#fff;display:flex;align-items:center;gap:10px;box-shadow:0 2px 10px rgba(0,0,0,.25);font-family:inherit;';
  bar.innerHTML = '<span style="flex:1;min-width:0;font-size:13px;line-height:1.3;"><b>✏️ ' + _prepEsc(meta.title || 'Prépa à venir') + '</b><br><span style="opacity:.85;">Prépa à venir · démarre le ' + _prepDate(meta.start, { day: 'numeric', month: 'long' }) + ' · modifications enregistrées</span></span>'
    + '<button onclick="prepViewExit()" style="flex-shrink:0;background:#fff;color:#1B4FD8;border:none;border-radius:999px;padding:8px 14px;font-weight:800;font-size:13px;cursor:pointer;">Quitter</button>';
  document.body.appendChild(bar);
  document.body.style.paddingTop = bar.offsetHeight + 'px';
  if(typeof rendered !== 'undefined'){ rendered.plan = false; rendered.stats = false; }
  showScreen('plan');
  try { if(typeof renderPlan === 'function') renderPlan(); } catch(e) {}
}
function prepNextDelete(){
  const m = _prepNext || {};
  _showConfirmModal({ icon: '🗑', title: 'Supprimer « ' + (m.title || 'la prépa à venir') + ' » ?', message: 'Le programme à venir et tes modifications sont supprimés. Ta prépa en cours n\'est pas touchée.',
    confirmLabel: 'Supprimer', confirmStyle: 'background:#e53e3e;color:#fff;', onConfirm: async function(){
      await _prepRef('prep_next').remove(); _prepNext = null; _renderPrepsBody();
    } });
}
