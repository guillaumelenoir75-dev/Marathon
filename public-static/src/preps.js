// Mes prépas (Compte) : une prépa terminée est enregistrée comme une copie figée de l'état
// (users/{uid}/preps/{id}) avec sa fiche (users/{uid}/prep_index/{id}). « Consulter » rouvre toute l'app
// sur cette copie, en lecture seule : aucune écriture ne peut partir vers la base pendant la consultation.

// clés non archivées : historique du coach, jetons et données d'appareils (volumineux ou personnels)
const _PREP_SKIP = /^(_coach_history|_coach_unread|_brief|whoop_|strava_token|_push_sub|_ratelimit|_open_coach|_last_location|_wakeup_|_geo_granted|_shaker_run_ts)/;
let _prepIndex = null, _prepView = null, _prepPendingNew = false, _prepNext = null;
// clés propres à une prépa (retirées au démarrage d'une nouvelle) ; profil, chaussures, FC, VO2max, Strava… sont conservés
const _PREP_RESET = /^(extra_w\d+_s\d+|_last_validation_w|meta_w|edit_w|del_w|order_w|s\d+i\d+|rf\d+(r\d+|skip)|_congrats_sent_w|absences_cw|plan_config$|plan_version$|plan_peak_week$|plan_start_date$|_plan_adapted|onboarding$|goal_type$|target_time$|race_distance_km$|_am_pace$|_am_training_pace$|_prep_id$|_prep_autosave$|_race_result$|_plan_reviews$|_review_seen$|_coach_review$|_badges$|_badges_init$)/;

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
           date: date, start: st.plan_start_date || ob.plan_start_date || '', dist: ob.course || '', replay: '', result: (st._race_result || {}).time || '', note: '' };
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

// Profil d'une prépa, semaine par semaine : [km prévus, km faits, type] (type : r récup, p pic, t affûtage, c course)
function _prepShape(st){
  const out = []; let empty = 0;
  for(let w = 1; w <= 80 && empty < 5; w++){
    let ei = 0, pk = 0, dk = 0, race = false, any = false;
    while(ei <= 50 && st['extra_w' + w + '_s' + ei] !== undefined){
      const k = 'extra_w' + w + '_s' + ei; let x = {}; any = true;
      try { x = JSON.parse(st[k]) || {}; } catch(e) {}
      const km = parseFloat(x.km) || 0; pk += km; if(x.type === 'race') race = true;
      if(st[k + '_done'] || st[k + '_km'] != null){ const v = parseFloat(st[k + '_km']); dk += v > 0 ? v : km; }
      ei++;
    }
    if(!any){ empty++; out.push([0, 0, '']); continue; }
    empty = 0;
    let m = {}; try { m = JSON.parse(st['meta_w' + w] || '{}') || {}; } catch(e) {}
    out.push([Math.round(pk * 10) / 10, Math.round(dk * 10) / 10, race ? 'c' : m.isRecov ? 'r' : m.isPeak ? 'p' : m.isTaper ? 't' : '']);
  }
  while(out.length && !out[out.length - 1][0]) out.pop();
  return out;
}

// ─── Ligne « Mes prépas » de l'écran Compte ────────────────────────────────
async function renderPrepsRow(){
  const lr = document.getElementById('live-row'); if(lr) lr.style.display = isAdmin() ? 'flex' : 'none';
  if(_prepUid() && !_prepView) _prepRef('prep_next/meta').once('value').then(function(x){ _prepNext = x.val(); renderCompteHero(); }).catch(function(){});
  const sub = document.getElementById('preps-subtitle'); if(!sub || !_prepUid()) return;
  try {
    _prepIndex = (await _prepRef('prep_index').once('value')).val() || {};
    const n = Object.keys(_prepIndex).length;
    sub.textContent = 'Prépa en cours' + (n ? ' · ' + n + ' prépa' + (n > 1 ? 's' : '') + ' enregistrée' + (n > 1 ? 's' : '') : ' · aucune archivée');
  } catch(e) { sub.textContent = 'Prépa en cours et prépas archivées'; }
}

// ─── Panneau « Mes prépas » ────────────────────────────────────────────────
async function openPrepsPanel(opts){
  opts = opts || {};
  closePrepsPanel(true);
  const mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'preps-panel';
  ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  ov.innerHTML = '<div class="modal-box" style="max-height:92vh;">'
    + '<div style="background:linear-gradient(135deg,#0C447C,#1D4ED8);padding:16px;border-radius:24px 24px 0 0;color:#fff;flex-shrink:0;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">'
    +   '<div><p style="font-size:10px;font-weight:800;opacity:.8;letter-spacing:.1em;text-transform:uppercase;margin:0 0 2px;">Compte</p><p style="font-size:21px;font-weight:900;margin:0;">🏅 Mes prépas</p><p id="preps-head-sub" style="font-size:12.5px;font-weight:600;opacity:.85;margin:3px 0 0;"></p></div>'
    +   '<button onclick="closePrepsPanel()" aria-label="Fermer" style="background:rgba(255,255,255,.2);border:none;cursor:pointer;color:#fff;font-size:18px;width:32px;height:32px;border-radius:50%;">×</button></div>'
    + '<div class="modal-scroll-body" style="background:#F3F6FC;"><div id="preps-body" style="padding:14px 16px 24px;display:flex;flex-direction:column;gap:12px;"><p style="color:#888;font-size:13px;">Chargement…</p></div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) closePrepsPanel(); });
  if(opts.instant){                                         // retour d'une prépa : le panneau est déjà là, sans glissement
    ov.style.animation = 'none'; ov.style.background = 'rgba(0,0,0,0.45)';
    ov.querySelector('.modal-box').style.animation = 'none';
  }
  mc.appendChild(ov);
  if(_prepIndex) _renderPrepsBody();                        // dernières données connues : affichage immédiat
  if(opts.scroll){ const sb = ov.querySelector('.modal-scroll-body'); if(sb) sb.scrollTop = opts.scroll; }
  const r = await Promise.all([
    _prepRef('prep_index').once('value').then(function(x){ return x.val() || {}; }).catch(function(){ return _prepIndex || {}; }),
    _prepRef('prep_next/meta').once('value').then(function(x){ return x.val(); }).catch(function(){ return _prepNext; })]);
  const shown = !!document.querySelector('#preps-body .pp-card');
  const changed = JSON.stringify([r[0], r[1]]) !== JSON.stringify([_prepIndex, _prepNext]);
  _prepIndex = r[0]; _prepNext = r[1];
  if(changed || !shown) _renderPrepsBody();
  _prepFillShapes();
}
// ─── Copies des prépas : gardées en mémoire, préchargées dès que le doigt se pose sur « Consulter » ───
const _prepSnapCache = {};
function _prepGetSnap(id){
  if(!_prepSnapCache[id]) _prepSnapCache[id] = _prepRef(id === '#next' ? 'prep_next' : 'preps/' + id).once('value').then(function(x){ return x.val(); })
    .catch(function(e){ delete _prepSnapCache[id]; throw e; });
  return _prepSnapCache[id];
}
document.addEventListener('pointerdown', function(e){
  const b = e.target && e.target.closest && e.target.closest('[data-prep-open]'); if(!b) return;
  try { _prepGetSnap(b.getAttribute('data-prep-open')).catch(function(){}); } catch(err) {}
}, { passive: true });

// ─── Transitions d'ouverture / fermeture d'une prépa ───────────────────────
const _PREP_FX_CSS = '#prep-veil{position:fixed;inset:0;z-index:9500;background:#EDF2FB;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .16s ease-out;}'
  + '#prep-veil.on{opacity:1;}#prep-veil.out{transition:opacity .24s ease-in;opacity:0;}'
  + '#prep-veil .pv{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #DCE5F3;border-radius:999px;padding:10px 16px;font:700 13.5px -apple-system,BlinkMacSystemFont,sans-serif;color:#0C447C;box-shadow:0 6px 24px rgba(12,68,124,.12);opacity:0;animation:_pvIn .2s ease-out .28s forwards;max-width:84vw;}'
  + '#prep-veil .pv span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
  + '#prep-veil .sp{width:16px;height:16px;border-radius:50%;border:2.5px solid #C7D7F8;border-top-color:#1B4FD8;animation:_pvSpin .7s linear infinite;flex-shrink:0;}'
  + '@keyframes _pvIn{to{opacity:1;}}@keyframes _pvSpin{to{transform:rotate(360deg);}}'
  + '#prep-view-bar{transform:translateY(-100%);transition:transform .28s cubic-bezier(.32,.72,0,1);}#prep-view-bar.on{transform:none;}'
  + '.modal-box.pp-closing{animation:_sheetSlideDown .22s ease-in forwards !important;}'
  + '@media (prefers-reduced-motion:reduce){#prep-veil,#prep-veil.out,#prep-view-bar{transition:none;}#prep-veil .pv{animation-delay:.4s;}.modal-box.pp-closing{animation:none !important;}}';
function _prepFxCss(){ if(!document.getElementById('prep-fx-css')){ const st = document.createElement('style'); st.id = 'prep-fx-css'; st.textContent = _PREP_FX_CSS; document.head.appendChild(st); } }
const _prepWait = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
const _prepFrame = function(){ return new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); }); };
// voile : couvre l'écran pendant l'échange (le message n'apparaît que si l'attente dure)
async function _prepVeilIn(label){
  _prepFxCss();
  let v = document.getElementById('prep-veil');
  if(!v){ v = document.createElement('div'); v.id = 'prep-veil'; v.setAttribute('role', 'status'); document.body.appendChild(v); }
  v.innerHTML = '<div class="pv"><span class="sp" aria-hidden="true"></span><span>' + _prepEsc(label) + '</span></div>';
  v.className = ''; void v.offsetWidth; v.className = 'on';
  await _prepWait(170);
}
async function _prepVeilOut(){
  const v = document.getElementById('prep-veil'); if(!v) return;
  await _prepFrame();                                       // laisser le nouvel écran se peindre sous le voile
  v.className = 'out';
  setTimeout(function(){ if(v.parentNode && v.className === 'out') v.remove(); }, 260);
}
function _prepBarIn(bar){
  _prepFxCss();
  document.body.appendChild(bar);
  document.body.style.paddingTop = bar.offsetHeight + 'px';
  requestAnimationFrame(function(){ requestAnimationFrame(function(){ bar.classList.add('on'); }); });
}
// écrans à redessiner à la demande (le contenu vient de changer)
function _prepInvalidate(){ if(typeof rendered !== 'undefined'){ rendered.plan = false; rendered.stats = false; rendered.renfo = false; rendered.home = false; } }
let _prepPanelScroll = 0;
function _prepRememberScroll(){ const sb = document.querySelector('#preps-panel .modal-scroll-body'); _prepPanelScroll = sb ? sb.scrollTop : 0; }
async function _prepFillShapes(){
  let changed = false;
  try {
    if(_prepNext && !_prepNext.shape){
      const st = ((await _prepGetSnap('#next')) || {}).state;
      if(st){ _prepNext.shape = _prepShape(st); await _prepRef('prep_next/meta/shape').set(_prepNext.shape); changed = true; }
    }
    for(const id of Object.keys(_prepIndex || {})){
      if(_prepIndex[id].shape || id === state._prep_id) continue;
      const st = await _prepGetSnap(id);
      if(st){ _prepIndex[id].shape = _prepShape(st); await _prepRef('prep_index/' + id + '/shape').set(_prepIndex[id].shape); changed = true; }
    }
  } catch(e) { console.warn('[prépa] profils', e); }
  if(changed) _renderPrepsBody();
}
function closePrepsPanel(immediate){
  const ov = document.getElementById('preps-panel'); if(!ov) return;
  if(immediate){ ov.remove(); return; }
  _prepFxCss(); ov.id = ''; ov.style.pointerEvents = 'none';
  const box = ov.querySelector('.modal-box'); if(box) box.classList.add('pp-closing');
  ov.style.animation = 'none'; ov.style.transition = 'background .22s'; ov.style.background = 'transparent';
  setTimeout(function(){ ov.remove(); }, 230);
}

// Styles du panneau (injectés une fois) : palette de l'app, cartes blanches sur fond bleuté
const _PREP_CSS = '#preps-body{background:#F3F6FC;}'
  + '.pp-sec{display:flex;justify-content:space-between;align-items:baseline;font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#64748B;margin:6px 2px -4px;}'
  + '.pp-card{background:#fff;border:1px solid #DCE5F3;border-radius:18px;padding:16px;display:flex;flex-direction:column;gap:12px;box-shadow:0 1px 2px rgba(12,68,124,.04);}'
  + '.pp-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;}.pp-top>div:first-child{min-width:0;flex:1;}'
  + '.pp-pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:3px 9px;font-size:11.5px;font-weight:800;white-space:nowrap;}'
  + '.pp-pill.now{background:#DCFCE7;color:#15803D;}.pp-pill.next{background:#E0E9FF;color:#1B4FD8;}.pp-pill.ready{background:#FEF3C7;color:#92400E;}'
  + '.pp-dot{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 0 3px rgba(21,128,61,.18);}'
  + '.pp-title{font-size:19px;font-weight:850;color:#0C447C;line-height:1.2;margin:7px 0 3px;text-wrap:balance;}'
  + '.pp-sub{font-size:13px;color:#5B6675;line-height:1.45;margin:0;}'
  + '.pp-big{text-align:right;flex-shrink:0;}.pp-big b{display:block;font-size:27px;font-weight:900;color:#0C447C;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.01em;}'
  + '.pp-big span{display:block;font-size:11px;color:#64748B;font-weight:700;margin-top:4px;}.pp-big.gold b{color:#B45309;}.pp-big.gold span{color:#B45309;}'
  + '.pp-chart{display:flex;flex-direction:column;gap:5px;}'
  + '.pp-chart-h{display:flex;justify-content:space-between;font-size:12px;color:#5B6675;font-weight:700;font-variant-numeric:tabular-nums;}'
  + '.pp-bars{display:flex;align-items:flex-end;gap:3px;height:46px;}'
  + '.pp-b{flex:1 1 0;min-width:3px;border-radius:4px 4px 2px 2px;background:#E3EAF5;position:relative;overflow:hidden;}'
  + '.pp-b i{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(180deg,#2F63E6,#0C447C);border-radius:inherit;}'
  + '.pp-b.cur{box-shadow:inset 0 0 0 1.5px #1B4FD8;}.pp-b.n.k-c{background:#FCE7BC;}.pp-b.n.k-c i{background:#F59E0B;}'
  + '.pp-b.k-{background:#A9BEE6;}.pp-b.k-r{background:#D5DEEC;}.pp-b.k-p{background:#1B4FD8;}.pp-b.k-t{background:#7FA2EE;}.pp-b.k-c{background:#F59E0B;}'
  + '.pp-b.d{background:#7B98CF;}.pp-b.d.k-c{background:#F59E0B;}'
  + '.pp-axis{display:flex;justify-content:space-between;font-size:11px;color:#7A8597;font-weight:600;}'
  + '.pp-leg{display:flex;gap:10px;flex-wrap:wrap;font-size:11px;color:#64748B;font-weight:600;}.pp-leg i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px;vertical-align:0;}'
  + '.pp-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}'
  + '.pp-stat{background:#F5F8FD;border-radius:12px;padding:9px 6px;text-align:center;}.pp-stat b{display:block;font-size:17px;font-weight:850;color:#0F172A;font-variant-numeric:tabular-nums;}'
  + '.pp-stat span{font-size:10.5px;color:#64748B;font-weight:700;}'
  + '.pp-chips{display:flex;flex-wrap:wrap;gap:6px;}.pp-chip{display:inline-flex;align-items:center;gap:5px;background:#F1F5FB;color:#334155;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:700;}'
  + '.pp-note{font-size:12.5px;color:#1E40AF;font-weight:700;margin:0;display:flex;gap:7px;align-items:flex-start;line-height:1.4;}.pp-note svg{flex-shrink:0;margin-top:1px;}'
  + '.pp-note.muted{color:#5B6675;font-weight:600;font-size:12px;}'
  + '.pp-acts{display:flex;gap:8px;align-items:stretch;}'
  + '.pp-btn{flex:1 1 0;min-width:0;display:inline-flex;align-items:center;justify-content:center;gap:7px;border-radius:12px;padding:11px 12px;font-size:13.5px;font-weight:800;cursor:pointer;border:1px solid transparent;text-decoration:none;font-family:inherit;line-height:1.1;}'
  + '.pp-btn:focus-visible,.pp-new:focus-visible{outline:2px solid #1B4FD8;outline-offset:2px;}'
  + '.pp-btn.pri{background:#1B4FD8;color:#fff;}.pp-btn.ok{background:#15803D;color:#fff;}.pp-btn.sec{background:#EEF3FC;color:#1B4FD8;border-color:#D3DFF5;}'
  + '.pp-btn.warm{background:#FFF7ED;color:#C2410C;border-color:#FED7AA;}'
  + '.pp-btn.icon{flex:0 0 46px;padding:0;background:#fff;color:#94A3B8;border-color:#E2E8F0;}.pp-btn.icon:active{color:#B91C1C;border-color:#FAD4D4;}'
  + '.pp-new{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;background:transparent;border:1.5px dashed #9DB4E0;color:#1B4FD8;border-radius:16px;padding:13px;font-size:14.5px;font-weight:800;cursor:pointer;font-family:inherit;}'
  + '.pp-form{display:none;flex-direction:column;gap:8px;border-top:1px solid #E6ECF5;padding-top:12px;}'
  + '.pp-form label{font-size:12px;font-weight:700;color:#5B6675;}.pp-form input{display:block;width:100%;margin-top:3px;padding:9px 10px;border:1px solid #D6DFEC;border-radius:9px;font-size:14px;box-sizing:border-box;font-family:inherit;}'
  + '.pp-empty{font-size:13px;color:#64748B;margin:0 2px;}';
// Icônes (traits, couleur du texte) : plus nettes que les emojis sur iPhone
const _ppI = function(d, sz){ return '<svg width="' + (sz || 16) + '" height="' + (sz || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
const PP_ICON = {
  trash: _ppI('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>', 17),
  edit: _ppI('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>'),
  book: _ppI('<path d="M2 4h7a3 3 0 013 3v13a2 2 0 00-2-2H2zM22 4h-7a3 3 0 00-3 3v13a2 2 0 012-2h8z"/>'),
  play: _ppI('<path d="M7 4l13 8-13 8z" fill="currentColor"/>', 14),
  next: _ppI('<circle cx="12" cy="12" r="9"/><path d="M10 8l4 4-4 4"/>', 15),
  plus: _ppI('<path d="M12 5v14M5 12h14"/>', 17),
  cal: _ppI('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>', 13),
  check: _ppI('<path d="M5 12l5 5L20 7"/>', 14),
};
const _ppS = function(n, w){ return n + ' ' + w + (n > 1 ? 's' : ''); };                        // 1 séance, 2 séances
const _ppDays = function(d){ if(!d) return null; const a = new Date(_prepToday() + 'T12:00:00'), b = new Date(String(d).slice(0, 10) + 'T12:00:00'); return Math.round((b - a) / 86400000); };
const _ppNum = function(n){ return Number(n || 0).toLocaleString('fr-FR'); };
const _ppTime = function(t){ return String(t || '').replace(/^00:/, '').replace(/^0(?=\d:)/, ''); };
const _ppTitle = function(t){ return _prepEsc(t).replace(/-/g, '‑'); };                     // pas de coupure au tiret (Seine‑Eure)
const _ppShort = function(d){ return _prepDate(d, { day: 'numeric', month: 'short' }); };
// Mini-graphique du volume par semaine. mode : now (fait / prévu, semaine en cours), next (prévu, par type), done (réalisé)
function _ppBars(shape, mode, cw){
  if(!shape || !shape.length) return '';
  const val = function(w){ return mode === 'done' ? (w[1] || w[0]) : w[0]; };
  const max = Math.max.apply(null, shape.map(val).concat([1]));
  const kind = { r: 'récupération', p: 'pic', t: 'affûtage', c: 'course' };
  return '<div class="pp-bars" role="img" aria-label="Volume par semaine : ' + shape.map(function(w, i){ return 'S' + (i + 1) + ' ' + Math.round(val(w)) + ' km'; }).join(', ') + '">'
    + shape.map(function(w, i){
      const h = Math.max(6, Math.round(val(w) / max * 100));
      const tip = 'S' + (i + 1) + ' · ' + Math.round(val(w)) + ' km' + (kind[w[2]] ? ' · ' + kind[w[2]] : '') + (mode === 'now' && w[1] ? ' (' + Math.round(w[1]) + ' faits)' : '');
      if(mode === 'now') return '<span class="pp-b n' + (i + 1 === cw ? ' cur' : '') + (w[2] === 'c' ? ' k-c' : '') + '" style="height:' + h + '%" title="' + tip + '"><i style="height:' + Math.min(100, Math.round((w[1] || 0) / (w[0] || 1) * 100)) + '%"></i></span>';
      return '<span class="pp-b ' + (mode === 'done' ? 'd ' : '') + 'k-' + w[2] + '" style="height:' + h + '%" title="' + tip + '"></span>';
    }).join('') + '</div>';
}

function _renderPrepsBody(){
  const box = document.getElementById('preps-body'); if(!box) return;
  if(!document.getElementById('prep-css')){ const st = document.createElement('style'); st.id = 'prep-css'; st.textContent = _PREP_CSS; document.head.appendChild(st); }
  const cur = _prepCurrentInfo(state), cs = _prepStats(state);
  const isCur = function(p){ return !usesHardPlan() && (p.id === state._prep_id || p.title === cur.title); };
  const all = Object.keys(_prepIndex || {}).map(function(k){ return Object.assign({ id: k }, _prepIndex[k]); });
  const already = all.find(function(p){ return p.id === state._prep_id || p.title === cur.title; });
  const saved = all.filter(function(p){ return _prepView || !isCur(p); })                       // la prépa en cours n'est pas listée deux fois
    .sort(function(a, b){ return String(b.date || '').localeCompare(String(a.date || '')); });
  const ready = _prepView ? [] : prepReadyFor(state);
  let h = '';
  if(_prepView){
    const nx = _prepView.next;
    h += '<div class="pp-card" style="background:' + (nx ? '#EEF3FC;border-color:#C7D7F8' : '#FFF7ED;border-color:#FED7AA') + ';"><p class="pp-sub" style="color:' + (nx ? '#1B4FD8' : '#92400E') + ';">'
      + (nx ? '<b>Prépa à venir ouverte</b> : « ' : '<b>Consultation en cours</b> : « ') + _prepEsc(_prepView.meta.title || 'prépa archivée') + ' ».<br>Touche <b>Quitter</b> dans le bandeau pour revenir à ta prépa en cours'
      + (nx ? '.' : ' et gérer tes prépas.') + '</p></div>';
  } else {
    // ── Maintenant
    h += '<p class="pp-sec"><span>Maintenant</span></p>';
    const R = usesHardPlan() ? null : prepRace(), j = _ppDays(cur.date), tot = Math.max(1, cs.weeks);
    const cw = Math.min(tot, Math.max(1, typeof getEffectiveCW === 'function' ? getEffectiveCW() : 1));
    const shape = _prepShape(state), kmPlan = Math.round(shape.reduce(function(a, w){ return a + w[0]; }, 0));
    h += '<section class="pp-card" aria-label="Prépa en cours"><div class="pp-top"><div>'
      +   '<span class="pp-pill now"><span class="pp-dot"></span>En cours' + (cs.planned ? ' · semaine ' + cw + '/' + tot : '') + '</span>'
      +   '<p class="pp-title">' + _ppTitle(cur.title) + '</p>'
      +   '<p class="pp-sub">' + [cur.dist, cur.date ? _prepDate(cur.date, { weekday: 'long', day: 'numeric', month: 'long' }) : 'sans date de course', R && R.objectif && R.objectif !== 'non défini' ? 'objectif ' + _prepEsc(R.objectif) : ''].filter(Boolean).join(' · ') + '</p></div>'
      +   (cur.result ? '<div class="pp-big gold"><b>' + _prepEsc(cur.result) + '</b><span>temps officiel</span></div>'
          : j != null && j >= 0 ? '<div class="pp-big"><b>' + (j === 0 ? 'Jour J' : 'J-' + j) + '</b><span>' + (j === 0 ? 'c\'est aujourd\'hui' : 'avant la course') + '</span></div>' : '') + '</div>';
    if(cs.planned){
      h += '<div class="pp-chart"><div class="pp-chart-h"><span>Volume par semaine</span><span>' + cs.done + '/' + cs.planned + ' séances</span></div>'
        +   _ppBars(shape, 'now', cw)
        +   '<div class="pp-axis"><span>' + _ppShort(cur.start) + '</span><span>' + _ppShort(cur.date) + '</span></div></div>'
        + '<div class="pp-stats"><div class="pp-stat"><b>' + cs.done + '</b><span>' + (cs.done > 1 ? 'séances faites' : 'séance faite') + '</span></div>'
        +   '<div class="pp-stat"><b>' + _ppNum(cs.km) + '</b><span>km réalisés</span></div>'
        +   '<div class="pp-stat"><b>' + _ppNum(kmPlan) + '</b><span>km prévus</span></div></div>';
    }
    h += (already ? '<p class="pp-note muted"><span style="color:#15803D;">' + PP_ICON.check + '</span><span>Enregistrée ' + (already.savedAt === _prepToday() ? 'aujourd\'hui' : 'le ' + _prepDate(already.savedAt, { day: 'numeric', month: 'long' })) + (already.auto && !usesHardPlan() ? ' · mise à jour chaque jour' : '') + '</span></p>' : '')
      + '<div class="pp-acts">'
      +   '<button class="pp-btn ' + (already ? 'sec' : 'pri') + '" onclick="prepShowForm()">' + (already ? PP_ICON.edit + 'Modifier la fiche' : '📦 Enregistrer cette prépa') + '</button>'
      +   (!usesHardPlan() && cs.planned > 0 ? '<button class="pp-btn icon" onclick="prepDiscardCurrent()" aria-label="Supprimer cette prépa" title="Supprimer cette prépa">' + PP_ICON.trash + '</button>' : '') + '</div>'
      + '<div id="prep-form" class="pp-form">'
      +   '<label>Nom<input id="pf-title" value="' + _prepEsc(already ? already.title : cur.title) + '"></label>'
      +   '<label>Date de la course<input id="pf-date" type="date" value="' + _prepEsc(cur.date) + '"></label>'
      +   '<label>Temps officiel<input id="pf-result" inputmode="numeric" placeholder="ex. 41:30" value="' + _prepEsc(already ? already.result : cur.result) + '"></label>'
      +   '<label>Note<input id="pf-note" placeholder="Record personnel, sensations…" value="' + _prepEsc(already ? already.note : cur.note) + '"></label>'
      +   '<button class="pp-btn ok" onclick="prepSaveCurrent()" id="pf-save">Enregistrer dans Mes prépas</button>'
      +   '<p class="pp-sub" style="font-size:11.5px;color:#7A8597;">Une copie figée du programme et de tes séances est conservée. Ta prépa en cours n\'est pas modifiée.</p>'
      + '</div></section>';
    // ── Ensuite : prépa à venir, prépas prêtes à installer, nouvelle prépa
    h += '<p class="pp-sec"><span>Ensuite</span></p>';
    if(_prepNext){
      const N = _prepNext, js = _ppDays(N.start), sh = N.shape || [];
      const peak = sh.reduce(function(a, w){ return Math.max(a, w[0]); }, 0), kinds = {};
      sh.forEach(function(w){ kinds[w[2]] = 1; });
      h += '<section class="pp-card" aria-label="Prépa à venir"><div class="pp-top"><div>'
        +   '<span class="pp-pill next">À venir' + (js > 0 ? ' · dans ' + _ppS(js, 'jour') : '') + '</span>'
        +   '<p class="pp-title">' + _ppTitle(N.title) + '</p>'
        +   '<p class="pp-sub">' + [N.dist, _prepDate(N.date)].filter(Boolean).join(' · ') + '</p></div>'
        +   (N.target ? '<div class="pp-big"><b>' + _prepEsc(_ppTime(N.target)) + '</b><span>objectif</span></div>' : '') + '</div>';
      if(sh.length) h += '<div class="pp-chart"><div class="pp-chart-h"><span>' + _ppS(N.weeks || sh.length, 'semaine') + ' · ' + _ppS(N.sessions, 'séance') + '</span><span>pic ' + _ppNum(Math.round(peak)) + ' km</span></div>'
        +   _ppBars(sh, 'next')
        +   '<div class="pp-axis"><span>' + _ppShort(N.start) + '</span><span>' + _ppShort(N.date) + '</span></div>'
        +   '<div class="pp-leg">' + [['', 'charge', '#A9BEE6'], ['r', 'récup', '#D5DEEC'], ['p', 'pic', '#1B4FD8'], ['t', 'affûtage', '#7FA2EE'], ['c', 'course', '#F59E0B']]
              .filter(function(k){ return kinds[k[0]]; }).map(function(k){ return '<span><i style="background:' + k[2] + '"></i>' + k[1] + '</span>'; }).join('') + '</div></div>';
      else h += '<div class="pp-chips"><span class="pp-chip">' + _ppS(N.weeks, 'semaine') + '</span><span class="pp-chip">' + _ppS(N.sessions, 'séance') + '</span></div>';
      h += '<p class="pp-note">' + PP_ICON.next + '<span>Démarre seule le ' + _prepDate(N.start, { weekday: 'long', day: 'numeric', month: 'long' }) + ', dès ta course validée.</span></p>'
        + '<div class="pp-acts"><button class="pp-btn pri" data-prep-open="#next" onclick="prepNextOpen()">' + PP_ICON.edit + 'Voir et modifier</button>'
        +   '<button class="pp-btn icon" onclick="prepNextDelete()" aria-label="Supprimer la prépa à venir" title="Supprimer la prépa à venir">' + PP_ICON.trash + '</button></div></section>';
    }
    ready.forEach(function(R){
      const n = R.weeks.reduce(function(a, W){ return a + W.sessions.length; }, 0);
      h += '<section class="pp-card"><div><span class="pp-pill ready">Prête à installer</span><p class="pp-title">' + _ppTitle(R.title) + '</p>'
        + '<p class="pp-sub">Course le ' + _prepDate(R.date) + ' · ' + _ppS(R.weeks.length, 'semaine') + ' · ' + _ppS(n, 'séance') + ' · objectif ' + _ppTime(R.target) + '</p></div>'
        + '<div class="pp-acts"><button class="pp-btn ok" onclick="prepInstallReady(\'' + R.id + '\')">Installer cette prépa</button></div></section>';
    });
    if(typeof openNextRace === 'function') h += '<button class="pp-new" style="background:#0F766E;" onclick="openNextRace()">🧭 Choisir ma prochaine course</button>';
    h += '<button class="pp-new" onclick="prepNew()">' + PP_ICON.plus + 'Nouvelle prépa</button>';
  }
  // ── Comparer (dès 2 prépas)
  if(!_prepView && saved.length + (cs.planned ? 1 : 0) + (_prepNext ? 1 : 0) >= 2)
    h += '<button class="pp-btn sec" style="flex:none;width:100%;padding:13px;margin-top:2px;" onclick="openProgress()">📈 Comparer mes prépas</button>';
  // ── Ta recette (tirée des bilans des prépas terminées)
  if(!_prepView && typeof prepRecetteCard === 'function') h += prepRecetteCard();
  // ── Terminées
  h += '<p class="pp-sec"><span>Terminées</span>' + (saved.length ? '<span>' + saved.length + '</span>' : '') + '</p>';
  if(!saved.length) h += '<p class="pp-empty">Aucune pour l\'instant : ta prépa en cours y sera enregistrée automatiquement.</p>';
  saved.forEach(function(p){
    const s = p.stats || {}, shortNote = p.note && p.note.length <= 22;
    h += '<section class="pp-card"><div class="pp-top"><div>'
      +   '<p class="pp-title" style="margin-top:0;font-size:17px;">' + _ppTitle(p.title) + '</p>'
      +   '<p class="pp-sub">' + [p.date ? _prepDate(p.date) : '', s.weeks ? _ppS(s.weeks, 'semaine') : '', s.weeks ? _ppS(s.done, 'séance') : '', s.weeks ? _ppNum(s.km) + ' km' : ''].filter(Boolean).join(' · ') + '</p></div>'
      +   (p.result ? '<div class="pp-big gold"><b>' + _prepEsc(p.result) + '</b>' + (shortNote ? '<span>' + _prepEsc(p.note) + '</span>' : '') + '</div>' : '') + '</div>'
      + (p.note && !(p.result && shortNote) ? '<p class="pp-note" style="color:#B45309;">🏅 <span>' + _prepEsc(p.note) + '</span></p>' : '')
      + (p.shape && p.shape.length ? '<div class="pp-chart">' + _ppBars(p.shape, 'done') + '</div>' : '')
      + '<div class="pp-acts"><button class="pp-btn sec" data-prep-open="' + p.id + '" onclick="prepView(\'' + p.id + '\')">' + PP_ICON.book + 'Consulter</button>'
      +   (typeof openPrepDebrief === 'function' && p.date && p.date < _prepToday() ? '<button class="pp-btn sec" onclick="openPrepDebrief(\'' + p.id + '\')">📋 Bilan</button>' : '')
      +   (p.replay ? '<a class="pp-btn warm" href="' + _prepEsc(p.replay) + '" target="_blank" rel="noopener">' + PP_ICON.play + 'Revoir</a>' : '')
      +   (_prepView ? '' : '<button class="pp-btn icon" onclick="prepDelete(\'' + p.id + '\')" aria-label="Supprimer ' + _prepEsc(p.title) + '" title="Supprimer">' + PP_ICON.trash + '</button>') + '</div></section>';
  });
  box.innerHTML = h;
  // bilans des prépas terminées pas encore calculés : en arrière-plan, puis réaffichage
  if(!_prepView && typeof prepDebriefAll === 'function' && !window._pdbRendering) prepDebriefAll().then(function(ch){ if(ch && document.getElementById('preps-body')){ window._pdbRendering = true; try { _renderPrepsBody(); } finally { window._pdbRendering = false; } } });
  // en-tête : résumé
  const hs = document.getElementById('preps-head-sub');
  if(hs) hs.textContent = _prepView ? (_prepView.next ? 'Prépa à venir ouverte' : 'Consultation en cours')
    : ['1 en cours', _prepNext ? '1 à venir' : '', saved.length ? saved.length + ' terminée' + (saved.length > 1 ? 's' : '') : ''].filter(Boolean).join(' · ');
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
    stats: _prepStats(state), shape: _prepShape(state), savedAt: new Date().toISOString().slice(0, 10), admin: isAdmin() && !state._plan_engine };
  try {
    await _prepRef('preps/' + id).set(snap);
    await _prepRef('prep_index/' + id).set(meta);
    delete _prepSnapCache[id];
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
      await _prepRef('preps/' + id).remove(); await _prepRef('prep_index/' + id).remove(); delete _prepSnapCache[id];
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
  const meta = (_prepIndex || {})[id] || {};
  _prepRememberScroll();
  const load = _prepGetSnap(id);
  closePrepsPanel();
  await _prepVeilIn('Ouverture de « ' + (meta.title || 'la prépa') + ' »');
  let snap; try { snap = await load; } catch(e) { snap = null; }
  if(!snap){ await _prepVeilOut(); alert('Impossible d\'ouvrir cette prépa (connexion ?).'); openPrepsPanel({ instant: true, scroll: _prepPanelScroll }); return; }
  _prepView = { state: state, dbRef: dbRef, meta: meta, scroll: _prepPanelScroll };
  state = JSON.parse(JSON.stringify(snap)); dbRef = _prepNullRef;     // copie : la version gardée en mémoire reste intacte
  syncPlanCompat();                                      // semaines et semaine en cours de la prépa consultée
  _prepInvalidate();
  const bar = document.createElement('div'); bar.id = 'prep-view-bar';
  bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:9000;padding:calc(env(safe-area-inset-top) + 8px) 12px 8px;background:#92400E;color:#fff;display:flex;align-items:center;gap:10px;box-shadow:0 2px 10px rgba(0,0,0,.25);font-family:inherit;';
  bar.innerHTML = '<span style="flex:1;min-width:0;font-size:13px;line-height:1.3;"><b>📖 ' + _prepEsc(meta.title || 'Prépa archivée') + '</b><br><span style="opacity:.85;">Consultation · lecture seule</span></span>'
    + '<button onclick="prepViewExit()" style="flex-shrink:0;background:#fff;color:#92400E;border:none;border-radius:999px;padding:8px 14px;font-weight:800;font-size:13px;cursor:pointer;">Quitter</button>';
  _prepBarIn(bar);
  showScreen('home');
  await _prepVeilOut();
}
function prepViewExit(silent){
  if(!_prepView) return;
  const V = _prepView;
  if(V.next){
    const sh = _prepShape(state), n = _prepStats(state).planned, up = { shape: sh, sessions: n, weeks: sh.length };
    _prepNext = Object.assign({}, V.meta, up);
    _prepRef('prep_next/meta').update(up).catch(function(){});
    _prepSnapCache['#next'] = Promise.resolve({ meta: _prepNext, state: _prepKeysOf(state) });   // réouverture instantanée
  }
  const restore = function(){
    state = V.state; dbRef = V.dbRef; _prepView = null;
    syncPlanCompat();
    _prepInvalidate();
    const bar = document.getElementById('prep-view-bar'); if(bar) bar.remove();
    document.body.style.paddingTop = '';
  };
  if(silent){ restore(); return; }
  (async function(){
    const bar = document.getElementById('prep-view-bar'); if(bar) bar.classList.remove('on');
    await _prepVeilIn('Retour à ta prépa en cours');
    restore();
    showScreen('compte');
    try { renderCompteScreen(); } catch(e) {}
    openPrepsPanel({ instant: true, scroll: V.scroll || 0 });
    await _prepVeilOut();
  })();
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
    const meta = Object.assign(_prepNextMeta(R), { shape: _prepShape(keys) });
    await _prepRef('prep_next').set({ meta: meta, state: keys }); delete _prepSnapCache['#next'];
    state._next_seed = R.id; await dbRef.update({ _next_seed: R.id });
    _prepNext = meta;
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
    result: old.result || cur.result || '', note: old.note || '', replay: old.replay || '', stats: cs, shape: _prepShape(state), savedAt: today, auto: true, admin: false };
  await _prepRef('preps/' + id).set(snap);
  await _prepRef('prep_index/' + id).set(meta);
  delete _prepSnapCache[id];
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
  await _prepRef('prep_next').remove(); _prepNext = null; delete _prepSnapCache['#next'];
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
  try { if(typeof prepDebriefAll === 'function') await prepDebriefAll(); } catch(e) { console.warn('[prépa] bilan', e); }   // bilan des prépas terminées + recette
  try {
    if(typeof stravaHistSync === 'function') await stravaHistSync();            // courses Strava : toutes les années, puis les nouvelles chaque jour
    if(typeof prPrefetch === 'function') await prPrefetch();                    // historique complet (toutes les prépas) pour les analyses
    // allure EF de référence calculée sur tout l'historique : reprise telle quelle par les briefs du Coach (serveur : efRefOf)
    if(!_prepView && typeof getBestEfPace === 'function'){
      const p = getBestEfPace(), r = state._ef_ref || {}, t = _prepToday();
      if(p && (r.pace !== p || r.at !== t)){ state._ef_ref = { pace: p, at: t }; if(dbRef) dbRef.child('_ef_ref').set(state._ef_ref).catch(function(){}); }
    }
    // effet personnel de l'alcool sur la récupération : recalculé chaque jour pour le brief du matin (serveur)
    if(!_prepView && typeof alcStoreModel === 'function' && state._alcohol){
      const b = JSON.stringify(state._alcohol_model || null); alcStoreModel();
      if(JSON.stringify(state._alcohol_model) !== b && dbRef) dbRef.child('_alcohol_model').set(state._alcohol_model).catch(function(){});
    }
  } catch(e) {}
  _prepDailyBusy = false;
  // réveil déclaré, alcool d'hier soir pas encore renseigné : on demande
  if(typeof alcMaybeAsk === 'function') alcMaybeAsk();
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
  _prepRememberScroll();
  const load = _prepGetSnap('#next');
  closePrepsPanel();
  await _prepVeilIn('Ouverture de « ' + ((_prepNext || {}).title || 'la prépa à venir') + ' »');
  let snap; try { snap = await load; } catch(e) { snap = null; }
  if(!snap || !snap.state){ delete _prepSnapCache['#next']; await _prepVeilOut(); alert('Impossible d\'ouvrir la prépa à venir (connexion ?).'); openPrepsPanel({ instant: true, scroll: _prepPanelScroll }); return; }
  const base = {};
  Object.keys(state).forEach(function(k){ if(!_PREP_RESET.test(k)) base[k] = state[k]; });   // réglages actuels + programme à venir
  const meta = snap.meta || {};
  _prepView = { state: state, dbRef: dbRef, meta: meta, next: true, scroll: _prepPanelScroll };
  state = Object.assign(base, JSON.parse(JSON.stringify(_prepKeysOf(snap.state)))); dbRef = _prepRef('prep_next/state');
  syncPlanCompat();
  _prepInvalidate();
  const bar = document.createElement('div'); bar.id = 'prep-view-bar';
  bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:9000;padding:calc(env(safe-area-inset-top) + 8px) 12px 8px;background:#1B4FD8;color:#fff;display:flex;align-items:center;gap:10px;box-shadow:0 2px 10px rgba(0,0,0,.25);font-family:inherit;';
  bar.innerHTML = '<span style="flex:1;min-width:0;font-size:13px;line-height:1.3;"><b>✏️ ' + _prepEsc(meta.title || 'Prépa à venir') + '</b><br><span style="opacity:.85;">Prépa à venir · démarre le ' + _prepDate(meta.start, { day: 'numeric', month: 'long' }) + ' · modifications enregistrées</span></span>'
    + '<button onclick="prepViewExit()" style="flex-shrink:0;background:#fff;color:#1B4FD8;border:none;border-radius:999px;padding:8px 14px;font-weight:800;font-size:13px;cursor:pointer;">Quitter</button>';
  _prepBarIn(bar);
  showScreen('plan');
  await _prepVeilOut();
}
function prepNextDelete(){
  const m = _prepNext || {};
  _showConfirmModal({ icon: '🗑', title: 'Supprimer « ' + (m.title || 'la prépa à venir') + ' » ?', message: 'Le programme à venir et tes modifications sont supprimés. Ta prépa en cours n\'est pas touchée.',
    confirmLabel: 'Supprimer', confirmStyle: 'background:#e53e3e;color:#fff;', onConfirm: async function(){
      await _prepRef('prep_next').remove(); _prepNext = null; delete _prepSnapCache['#next']; _renderPrepsBody();
    } });
}

// ─── Résultat de course : temps officiel → fiche de la prépa + records personnels ───
const PREP_RECORD_KEYS = { '5 km': 'record_5km', '10 km': 'record_10km', 'Semi-marathon': 'record_semi', 'Marathon': 'record_marathon' };
function prepTimeSec(t){
  const p = String(t || '').trim().replace(/\s/g, '').replace(/[’'h]/g, ':').replace(/"$/, '').split(':').filter(function(x){ return x !== ''; }).map(Number);
  if(!p.length || p.some(isNaN)) return null;
  const s = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : null;
  return s > 0 ? s : null;
}
function prepTimeFmt(sec){
  sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
}
// catégorie de record d'après la distance de la course
function prepRaceCategory(km, course){
  km = parseFloat(km);
  if(km > 4.5 && km < 5.5) return '5 km'; if(km > 9.5 && km < 10.5) return '10 km';
  if(km > 20.5 && km < 21.6) return 'Semi-marathon'; if(km > 41.5 && km < 43) return 'Marathon';
  return PREP_RECORD_KEYS[course] ? course : null;
}
// meilleur temps connu sur une distance : records saisis + temps des prépas enregistrées
function prepBestTime(cat, index, skipDate){
  let best = null;
  const take = function(t, src){ const sec = prepTimeSec(t); if(sec && (!best || sec < best.sec)) best = { sec: sec, time: prepTimeFmt(sec), src: src }; };
  const key = PREP_RECORD_KEYS[cat]; if(key) take(state[key], 'record');
  const idx = index || _prepIndex || {};
  Object.keys(idx).forEach(function(k){ const p = idx[k]; if(p.result && p.dist === cat) take(p.result, p.title); });
  // courses de l'historique Strava (sauf la course qu'on est en train d'enregistrer)
  if(typeof prStravaRaces === 'function') prStravaRaces().forEach(function(r){ if(r.cat === cat && r.date !== skipDate) take(r.time, r.label); });
  return best;
}
// enregistre le temps officiel de la course de la prépa en cours ; renvoie { time, cat, pr, prev }
async function prepSaveRaceResult(time, date){
  const sec = prepTimeSec(time); if(!sec) return null;
  const R = prepRace(), cat = prepRaceCategory(R.km, R.course);
  let idx = _prepIndex; try { idx = (await _prepRef('prep_index').once('value')).val() || {}; _prepIndex = idx; } catch(e) {}
  const mine = state._prep_id && idx[state._prep_id] ? state._prep_id : null;
  const others = {}; Object.keys(idx || {}).forEach(function(k){ if(k !== mine) others[k] = idx[k]; });
  const prevRes = state._race_result && prepTimeSec(state._race_result.time);
  const key = PREP_RECORD_KEYS[cat];
  // record précédent : sans le temps de cette même course (en cas de correction)
  const saved = key ? state[key] : null; if(key && prevRes && prepTimeSec(saved) === prevRes && state._race_record_prev !== undefined) state[key] = state._race_record_prev;
  const prev = cat ? prepBestTime(cat, others, date || R.date) : null;
  const txt = prepTimeFmt(sec), pr = !!cat && (!prev || sec < prev.sec);
  const up = { _race_result: { time: txt, date: date || _prepToday(), dist: cat || R.course || '' } };
  if(key){
    up._race_record_prev = state[key] || null;
    if(pr) up[key] = txt; else if(state[key] !== saved) up[key] = state[key] || null;
    if(pr){ const rm = Object.assign({}, state._records || {}); rm[cat] = { date: date || _prepToday(), race: R.name || null }; up._records = rm; }   // record daté (niveau, Mes records)
  }
  Object.keys(up).forEach(function(k){ if(up[k] === null) delete state[k]; else state[k] = up[k]; });
  try { await dbRef.update(up); } catch(e) {}
  try {
    await prepAutoSave(true);                                // fiche de la prépa à jour (temps, bilan)
    const id = state._prep_id;
    if(id){
      const f = { result: txt }; const cur = (_prepIndex || {})[id] || {};
      if(pr && (!cur.note || cur.note === 'Record personnel')) f.note = 'Record personnel';
      await _prepRef('prep_index/' + id).update(f);
      if(_prepIndex && _prepIndex[id]) Object.assign(_prepIndex[id], f);
    }
  } catch(e) { console.warn('[prépa] résultat', e); }
  // suivi en direct de cette course : rejeu d'après les temps au km Strava de la séance « course »
  let replay = false;
  if(typeof liveStoreReplay === 'function'){
    let perf = null;
    Object.keys(state).forEach(function(k){ if(/^extra_w\d+_s\d+$/.test(k) && state[k + '_done']){ try { if(JSON.parse(state[k]).type === 'race') perf = JSON.parse(state[k + '_perf'] || '{}'); } catch(e) {} } });
    replay = await liveStoreReplay(sec, perf, pr ? 'record personnel' : '');
  }
  return { time: txt, cat: cat, pr: pr, prev: prev, replay: replay };
}

// Compte › en-tête : prépa en cours (J-x) et prochaine prépa ; ligne « Course en direct » : prochaine course
function renderCompteHero(){
  const box = document.getElementById('compte-hero-meta'); if(!box) return;
  const cur = _prepCurrentInfo(state), cs = _prepStats(state), j = _ppDays(cur.date), chips = [];
  if(!usesHardPlan() && cs.planned){
    chips.push('<span>🏁 ' + _prepEsc(cur.race || cur.title) + (cur.result ? ' · <b>' + _prepEsc(cur.result) + '</b>' : j != null && j >= 0 ? ' · <b>' + (j === 0 ? 'Jour J' : 'J-' + j) + '</b>' : '') + '</span>');
  }
  if(_prepNext && !_prepView) chips.push('<span>⏭ ' + _prepEsc(_prepNext.title) + ' · ' + _prepDate(_prepNext.date, { day: 'numeric', month: 'short' }) + '</span>');
  box.innerHTML = chips.join(''); box.hidden = !chips.length;
  const ls = document.getElementById('live-row-sub');
  if(ls && isAdmin() && !usesHardPlan() && cur.date && j != null && j >= 0) ls.textContent = 'Prochaine : ' + (cur.race || cur.title) + ' · ' + _prepDate(cur.date, { weekday: 'short', day: 'numeric', month: 'short' });
}
