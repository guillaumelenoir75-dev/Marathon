// plan-chat.js — Onglet Coach › « Mon plan » : une discussion réservée au plan.
// Tu racontes ta semaine, ton ressenti, ce que tu changerais ; le Coach (fonction planChat) répond avec tes données et peut proposer
// des changements de séances à venir (mêmes règles et contrôles que la relecture du plan). Chaque proposition s'affiche avant → après,
// cochable ; « Appliquer » passe par prApplyChanges (historique _plan_reviews, kind 'chat') et reste annulable depuis le fil.
// Fil gardé dans state._plan_chat = { msgs: [{ id, r: 'u'|'c'|'s', t, at, ch: [proposition], st: 'pending'|'applied'|'dismissed'|'undone', applyAt }] }.
const PC_MAX = 60;
let _pcBusy = false, _pcA = null;

function _pcMsgs(){ const c = state._plan_chat; return c && Array.isArray(c.msgs) ? c.msgs : []; }
function _pcPush(m){
  const msgs = _pcMsgs().concat([Object.assign({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: new Date().toISOString() }, m)]).slice(-PC_MAX);
  state._plan_chat = { msgs: msgs }; return msgs[msgs.length - 1];
}
function _pcFind(id){ return _pcMsgs().find(function(m){ return m.id === id; }) || null; }
function _pcAnalysis(){ try { _pcA = prAnalyze(); } catch(e) { _pcA = null; } return _pcA; }

// ─── Mode de l'onglet Coach : « Coach » (discussion libre) ou « Mon plan » ───
function coachMode(m){
  m = m === 'plan' ? 'plan' : 'chat';
  _pcCss();
  const plan = m === 'plan', show = function(id, on, disp){ const el = document.getElementById(id); if(el) el.style.display = on ? (disp || '') : 'none'; };
  show('coach-messages', !plan, 'flex'); show('coach-chat-foot', !plan); show('pc-panel', plan, 'flex');
  document.querySelectorAll('#coach-mode button').forEach(function(b){ const on = b.dataset.m === m; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
  try { localStorage.setItem('coach_mode', m); } catch(e) {}
  if(plan){
    _pcAnalysis(); pcRender(true);
    if(typeof prPrefetch === 'function') prPrefetch().then(function(){ if(!_pcBusy){ _pcAnalysis(); pcRender(false); } }).catch(function(){});   // historique complet : résumé à jour
  }
}
function coachModeInit(){ let m = 'chat'; try { m = localStorage.getItem('coach_mode') || 'chat'; } catch(e) {} coachMode(m); }
// depuis « MAJ le plan », la carte du pilote automatique… : ouvre « Mon plan », message pré-rempli
function openPlanChat(prefill){
  try { if(typeof closePlanReview === 'function' && document.getElementById('plan-review')) closePlanReview(); } catch(e) {}
  if(typeof showScreen === 'function') showScreen('coach');
  setTimeout(function(){
    coachMode('plan');
    const ta = document.getElementById('pc-input');
    if(ta && prefill){ ta.value = prefill; ta.focus(); try { ta.setSelectionRange(prefill.length, prefill.length); } catch(e) {} }
  }, 80);
}

// ─── Affichage ───
const _pcFieldLabel = { detail: 'consigne', km: 'km', title: 'titre', type: 'type', session: 'séance' };
const _pcTypeLabel = { ef: 'Footing', long: 'Sortie longue', tempo: 'Tempo', frac: 'Fractionné', race: 'Course', rest: 'Repos' };
const _pcVal = function(f, v){ if(v && typeof v === 'object') return (v.t || 'Séance') + (v.km ? ' · ' + v.km + ' km' : ''); if(f === 'km') return String(v).replace('.', ',') + ' km'; if(f === 'type') return _pcTypeLabel[v] || v; return String(v == null ? '' : v); };
const _pcDay = function(d){ if(!d) return ''; const s = new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, ''); return s.charAt(0).toUpperCase() + s.slice(1); };
function _pcText(t){ return prEsc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>'); }

// en-tête du fil : où en est le plan (semaine en cours, la suivante, niveau, ajustements calculés en attente)
function _pcSummary(){
  const a = _pcA; if(!a) return '';
  let cur = null, nxt = null;
  try {
    const W = prWeeks(state, a.opt.today), ks = Object.keys(W).map(Number).sort(function(x, y){ return x - y; });
    const sum = function(o){ return { w: o.w, plan: o.km, done: o.sess.reduce(function(t, x){ return t + (x.done && x.type !== 'race' ? (+x.km || 0) : 0); }, 0) }; };
    ks.forEach(function(w){ if(!cur && W[w].now) cur = sum(W[w]); });
    if(cur) ks.forEach(function(w){ if(!nxt && w > cur.w) nxt = sum(W[w]); });
  } catch(e) {}
  const cells = [];
  if(cur) cells.push('<div><small>Semaine ' + cur.w + '</small><b>' + Math.round(cur.done || 0) + '<i> / ' + Math.round(cur.plan || 0) + ' km</i></b></div>');
  if(nxt) cells.push('<div><small>Semaine ' + nxt.w + '</small><b>' + Math.round(nxt.plan || 0) + '<i> km prévus</i></b></div>');
  if(a.fit && a.fit.vdot) cells.push('<div><small>Niveau</small><b>' + prV(a.fit.vdot) + '</b></div>');
  const n = (a.proposals || []).length;
  return '<div class="pc-sum">' + (cells.length ? '<div class="pc-sum-g">' + cells.join('') + '</div>' : '')
    + (n ? '<button type="button" class="pc-sum-a" onclick="pcSend(\'Que penses-tu des ajustements proposés par la mise à jour du plan ?\')">🔄 ' + n + ' ajustement' + (n > 1 ? 's' : '') + ' calculé' + (n > 1 ? 's' : '') + ' en attente · <u>en parler</u></button>' : '')
    + '<p class="pc-sum-n">Ici on parle uniquement de ton plan. Je peux modifier les séances à venir : tu valides ou non.</p></div>';
}
function _pcChanges(m){
  if(!m.ch || !m.ch.length) return '';
  const st = m.st || 'pending', lines = m.ch.map(function(c, i){
    return '<label class="pc-ch' + (c.off ? ' off' : '') + '">' + (st === 'pending' ? '<input type="checkbox"' + (c.off ? '' : ' checked') + ' onchange="pcToggle(\'' + m.id + '\',' + i + ',this.checked)">' : '')
      + '<span><b>' + prEsc(_pcDay(c.date)) + ' · ' + prEsc(c.title || '') + '</b>'
      + '<span class="pc-ba">' + (_pcFieldLabel[c.field] || c.field) + ' : <s>' + prEsc(_pcVal(c.field, c.before)) + '</s> → <em>' + prEsc(_pcVal(c.field, c.after)) + '</em></span>'
      + (c.reason ? '<small>' + prEsc(c.reason) + (c.src === 'auto' ? ' · calcul de l\'app' : '') + '</small>' : '') + '</span></label>';
  }).join('');
  const nOn = m.ch.filter(function(c){ return !c.off; }).length;
  const foot = st === 'pending' ? '<div class="pc-act"><button type="button" class="pc-go" ' + (nOn ? '' : 'disabled ') + 'onclick="pcApply(\'' + m.id + '\')">Appliquer' + (nOn ? ' (' + nOn + ')' : '') + '</button><button type="button" class="pc-no" onclick="pcDismiss(\'' + m.id + '\')">Non merci</button></div>'
    : st === 'applied' ? '<div class="pc-done">✅ Appliqué à ton plan <button type="button" onclick="pcUndo(\'' + m.id + '\')">Annuler</button></div>'
    : st === 'undone' ? '<div class="pc-done muted">↩ Annulé : plan d\'origine rétabli</div>' : '<div class="pc-done muted">Proposition écartée</div>';
  return '<div class="pc-card ' + st + '"><p class="pc-card-h">📋 ' + m.ch.length + ' changement' + (m.ch.length > 1 ? 's' : '') + ' proposé' + (m.ch.length > 1 ? 's' : '') + '</p>' + lines + foot + '</div>';
}
function pcRender(scroll){
  const box = document.getElementById('pc-messages'); if(!box) return;
  const msgs = _pcMsgs();
  let h = _pcSummary();
  if(!msgs.length) h += '<div class="pc-m c"><p>Parle-moi de ton plan : comment s\'est passée ta semaine, ce que tu ressens, ce que tu aimerais changer (volume, jours, intensité…). Je regarde tes données et je te propose des ajustements que tu valides.</p></div>';
  // fin de semaine : invitation au bilan si rien dit depuis 5 jours
  const dow = new Date().getDay(), last = msgs.filter(function(m){ return m.r === 'u'; }).pop();
  if(msgs.length && (dow === 0 || dow === 1) && (!last || (Date.now() - new Date(last.at).getTime()) > 5 * 864e5)) h += '<div class="pc-m c soft"><p>C\'est la fin de semaine : comment ça s\'est passé ? Dis-moi et on ajuste la suite si besoin.</p></div>';
  msgs.forEach(function(m){
    if(m.r === 's'){ h += '<p class="pc-sys">' + prEsc(m.t) + '</p>'; return; }
    h += '<div class="pc-m ' + (m.r === 'u' ? 'u' : 'c') + '"><p>' + _pcText(m.t || '') + '</p>' + (m.r === 'c' ? _pcChanges(m) : '') + '</div>';
  });
  if(_pcBusy) h += '<div class="pc-m c pc-typing"><span></span><span></span><span></span><small>Le Coach regarde ton plan…</small></div>';
  box.innerHTML = h;
  const chips = document.getElementById('pc-chips');
  if(chips) chips.innerHTML = ['Bilan de ma semaine', 'Je me sens bien : un peu plus de volume la semaine prochaine ?', 'Je suis fatigué, on allège ?', 'Je ne peux pas courir un jour cette semaine', 'Plus de fractionné ?']
    .map(function(t){ return '<button type="button" class="shortcut-chip" onclick="pcChip(this)">' + prEsc(t) + '</button>'; }).join('');
  if(scroll !== false) box.scrollTop = box.scrollHeight;
}
function pcChip(b){ const ta = document.getElementById('pc-input'); const t = b.textContent; if(/un jour/.test(t)){ if(ta){ ta.value = 'Je ne peux pas courir '; ta.focus(); } return; } pcSend(t); }

// ─── Envoi ───
async function pcSend(text){
  const ta = document.getElementById('pc-input');
  text = String(text != null ? text : (ta ? ta.value : '')).trim();
  if(!text || _pcBusy) return;
  if(typeof _prepView !== 'undefined' && _prepView && !_prepView.next){ alert('Copie en lecture seule : reviens sur ta prépa en cours pour parler de ton plan.'); return; }
  if(ta){ ta.value = ''; ta.style.height = 'auto'; }
  const thread = _pcMsgs().filter(function(m){ return m.r !== 's'; }).slice(-12).map(function(m){
    return { r: m.r, t: m.t, st: m.st || null, ch: (m.ch || []).map(function(c){ return { ref: c.key, title: c.title, field: c.field, before: _pcVal(c.field, c.before), after: _pcVal(c.field, c.after) }; }) };
  });
  _pcPush({ r: 'u', t: text }); save();
  _pcBusy = true; pcRender();
  try {
    if(typeof prPrefetch === 'function') try { await prPrefetch(); } catch(e) {}          // tout l'historique avant l'analyse
    const a = _pcAnalysis(); if(!a) throw new Error('analyse du plan indisponible');
    const R = { items: (a.proposals || []).map(function(p){ return Object.assign({ on: true }, p); }), held: a.held || [] };
    const body = await prCoachBody(a, R, false);
    body.message = text; body.thread = thread;
    const token = await getAuthToken();
    const r = await fetch(FUNCTIONS_BASE + '/planChat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify(body) });
    const j = await r.json();
    if(!r.ok || !j.success) throw new Error(j.error || 'HTTP ' + r.status);
    const items = prCoachItems(j.changes).map(function(x){ return Object.assign(x, { src: 'coach' }); });
    // ajustements calculés approuvés par le Coach : proposés avec les siens
    const autoSet = {}; (j.auto || []).forEach(function(k){ autoSet[k] = 1; });
    (a.proposals || []).forEach(function(p){ if(autoSet[p.key + ':' + p.field] && !items.some(function(x){ return x.key === p.key && x.field === p.field; })) items.push({ on: true, src: 'auto', key: p.key, w: p.w, date: p.date, field: p.field, title: p.title, type: p.type, kind: p.kind || null, before: p.before, after: p.after, reason: p.short || p.reason || '' }); });
    items.sort(function(x, y){ return String(x.date || '').localeCompare(String(y.date || '')); });
    _pcPush({ r: 'c', t: j.reply || '…', ch: items.map(function(x){ return { key: x.key, w: x.w, date: x.date, field: x.field, title: x.title, type: x.type || null, kind: x.kind || null, before: x.before, after: x.after, reason: x.reason || '', src: x.src }; }), st: items.length ? 'pending' : null });
  } catch(e) {
    _pcPush({ r: 's', t: 'Le Coach n\'a pas pu répondre (' + e.message + '). Réessaie dans un instant.' });
  }
  _pcBusy = false; save(); pcRender();
}

// ─── Propositions : cocher, appliquer, écarter, annuler ───
function pcToggle(id, i, on){ const m = _pcFind(id); if(!m || !m.ch[i]) return; if(on) delete m.ch[i].off; else m.ch[i].off = true; save(); pcRender(false); }
function pcApply(id){
  const m = _pcFind(id); if(!m || m.st !== 'pending') return;
  const byKey = {}; prSessions(state).forEach(function(s){ byKey[s.key] = s; });
  const cur = function(s, f){ return f === 'detail' ? s.detail : f === 'title' ? s.title : f === 'km' ? s.kmPlan : f === 'type' ? s.type : null; };
  // toujours valable : séance pas encore faite, valeur inchangée depuis la proposition
  const sel = m.ch.filter(function(c){ const s = byKey[c.key]; return !c.off && s && !s.done && (c.field === 'session' || String(cur(s, c.field)) === String(c.before)); })
    .map(function(c){ return Object.assign({}, c); });
  if(!sel.length){ alert('Ces séances ont changé depuis (faites ou déjà modifiées) : demande au Coach de refaire sa proposition.'); return; }
  const at = new Date().toISOString();
  const r = prApplyChanges(sel, { coach: true, kind: 'chat', at: at, vdot: _pcA && _pcA.fit ? _pcA.fit.vdot || null : null });
  m.st = 'applied'; m.applyAt = at;
  _pcPush({ r: 's', t: '✅ Plan mis à jour : ' + r.n + ' séance' + (r.n > 1 ? 's' : '') + (sel.length < m.ch.filter(function(c){ return !c.off; }).length ? ' (les autres avaient déjà changé)' : '') + '.' });
  save();
  if(typeof rendered !== 'undefined'){ rendered.plan = false; rendered.stats = false; }
  try { renderHome(); } catch(e) {}
  _pcAnalysis(); pcRender();
  if(typeof showToast === 'function') showToast('Plan mis à jour', '📅');
}
function pcDismiss(id){ const m = _pcFind(id); if(!m || m.st !== 'pending') return; m.st = 'dismissed'; save(); pcRender(false); }
function pcUndo(id){
  const m = _pcFind(id); if(!m || m.st !== 'applied') return;
  const hist = state._plan_reviews || []; let i = -1;
  for(let k = hist.length - 1; k >= 0; k--) if(hist[k].at === m.applyAt){ i = k; break; }
  if(i < 0){ alert('Cette modification n\'est plus dans l\'historique récent : modifie la séance directement dans le plan.'); return; }
  prUndoReview(i);
  m.st = 'undone'; _pcPush({ r: 's', t: '↩ Changements annulés : ton plan d\'origine est rétabli.' }); save();
  if(typeof rendered !== 'undefined'){ rendered.plan = false; rendered.stats = false; }
  try { renderHome(); } catch(e) {}
  _pcAnalysis(); pcRender();
}

function _pcCss(){
  if(typeof document === 'undefined' || document.getElementById('pc-css')) return;
  const st = document.createElement('style'); st.id = 'pc-css';
  st.textContent = '.cm-tog{display:flex;flex-shrink:0;background:rgba(255,255,255,.14);border-radius:12px;padding:3px;gap:2px;}'
    + '.cm-tog button{border:none;background:transparent;color:rgba(255,255,255,.8);font:inherit;font-size:12px;font-weight:700;padding:6px 10px;border-radius:9px;cursor:pointer;white-space:nowrap;}'
    + '.cm-tog button.on{background:#fff;color:#0C447C;}.cm-tog button:focus-visible{outline:2px solid #fff;outline-offset:1px;}'
    + '.pc-sum{background:#fff;border:1px solid #DDE3F0;border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:8px;}'
    + '.pc-sum-g{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}.pc-sum-g div{display:flex;flex-direction:column;gap:1px;}'
    + '.pc-sum-g small{font-size:10.5px;font-weight:800;color:#64748B;text-transform:uppercase;letter-spacing:.05em;}.pc-sum-g b{font-size:17px;font-weight:900;color:#0F172A;font-variant-numeric:tabular-nums;}.pc-sum-g i{font-style:normal;font-size:11.5px;font-weight:700;color:#64748B;}'
    + '.pc-sum-a{border:1.5px solid #C7D2FE;background:#EEF2FF;color:#3730A3;border-radius:10px;padding:8px 10px;font:inherit;font-size:12.5px;font-weight:700;text-align:left;cursor:pointer;}'
    + '.pc-sum-n{margin:0;font-size:11.5px;color:#64748B;line-height:1.4;}'
    + '.pc-m{max-width:88%;border-radius:16px;padding:10px 13px;font-size:14px;line-height:1.5;color:#0F172A;}.pc-m p{margin:0;}'
    + '.pc-m.c{align-self:flex-start;background:#fff;border:1px solid #DDE3F0;border-bottom-left-radius:5px;}.pc-m.c.soft{background:#F8FAFF;border-style:dashed;}'
    + '.pc-m.u{align-self:flex-end;background:#4338CA;color:#fff;border-bottom-right-radius:5px;}'
    + '.pc-sys{align-self:center;margin:0;font-size:12px;font-weight:700;color:#475569;background:#E2E8F0;border-radius:20px;padding:5px 12px;text-align:center;}'
    + '.pc-card{margin-top:10px;border:1.5px solid #C7D2FE;border-radius:14px;background:#F8FAFF;padding:10px;display:flex;flex-direction:column;gap:8px;}.pc-card.applied{border-color:#BBF7D0;background:#F0FDF4;}.pc-card.dismissed,.pc-card.undone{border-color:#E2E8F0;background:#F8FAFC;opacity:.85;}'
    + '.pc-card-h{margin:0;font-size:12.5px;font-weight:800;color:#3730A3;}'
    + '.pc-ch{display:flex;gap:8px;align-items:flex-start;font-size:13px;cursor:pointer;}.pc-ch input{margin-top:3px;width:17px;height:17px;accent-color:#4338CA;flex-shrink:0;}.pc-ch.off>span{opacity:.5;}'
    + '.pc-ch>span{display:flex;flex-direction:column;gap:1px;min-width:0;}.pc-ch b{font-size:13px;}.pc-ba{color:#334155;}.pc-ba s{color:#94A3B8;}.pc-ba em{font-style:normal;font-weight:800;color:#3730A3;}.pc-ch small{font-size:11.5px;color:#64748B;}'
    + '.pc-act{display:flex;gap:8px;}.pc-go{flex:1;padding:10px;border:none;border-radius:11px;background:#4338CA;color:#fff;font:inherit;font-size:13.5px;font-weight:800;cursor:pointer;}.pc-go:disabled{opacity:.45;}'
    + '.pc-no{padding:10px 12px;border:1px solid #CBD5E1;border-radius:11px;background:#fff;color:#475569;font:inherit;font-size:13px;font-weight:700;cursor:pointer;}'
    + '.pc-done{font-size:12.5px;font-weight:800;color:#15803D;display:flex;align-items:center;gap:8px;}.pc-done.muted{color:#64748B;font-weight:700;}.pc-done button{margin-left:auto;border:1px solid #BBF7D0;background:#fff;color:#15803D;border-radius:9px;padding:5px 10px;font:inherit;font-size:12px;font-weight:800;cursor:pointer;}'
    + '.pc-go:focus-visible,.pc-no:focus-visible,.pc-done button:focus-visible,.pc-sum-a:focus-visible{outline:2px solid #4338CA;outline-offset:2px;}'
    + '.pc-typing{display:flex;align-items:center;gap:4px;}.pc-typing span{width:6px;height:6px;border-radius:50%;background:#94A3B8;animation:pcDot 1s infinite;}.pc-typing span:nth-child(2){animation-delay:.15s;}.pc-typing span:nth-child(3){animation-delay:.3s;}.pc-typing small{margin-left:6px;font-size:12px;color:#64748B;}'
    + '@keyframes pcDot{0%,80%,100%{opacity:.3;transform:translateY(0);}40%{opacity:1;transform:translateY(-3px);}}@media (prefers-reduced-motion:reduce){.pc-typing span{animation:none;}}';
  document.head.appendChild(st);
}
