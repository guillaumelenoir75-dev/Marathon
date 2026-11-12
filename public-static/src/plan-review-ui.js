// Écran « MAJ le plan » et « Mes records » (à la demande : groupe « review », points d'entrée dans config.js) — sortis de
// plan-review.js pour alléger le démarrage ; le moteur (prAnalyze, prApplyChanges, prCoachBody…) reste dans plan-review.js.
function openRecordsModal(onDone){
  _prCss();
  const meta = state._records || {}, mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'records-modal'; ov.style.zIndex = '720'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  const best = function(c){ return typeof prepBestTime === 'function' ? prepBestTime(c) : null; };
  const ph = ['mm:ss', 'mm:ss', 'h:mm:ss', 'h:mm:ss'];
  ov.innerHTML = '<div class="modal-box" style="max-height:94vh;"><div class="pr-head"><div><p class="pr-eb">Entraînement</p><p class="pr-title">🏆 Mes records</p><p class="pr-sub">Ils fixent ton niveau et les allures de ton plan</p></div><button class="pr-x" onclick="document.getElementById(\'records-modal\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body pr-body"><div style="padding:14px 16px 18px;display:flex;flex-direction:column;gap:10px;">'
    + '<div class="pr-card rec-list">'
    + PR_CATS.map(function(c, i){
        const k = PR_RECORD_KEY[c], m = meta[c] || {}, b = best(c), v = state[k] || '';
        return '<div class="rec-row">'
          + '<div class="rec-dist"><b>' + prCatLabel(c) + '</b><span id="rec-v-' + i + '"></span></div>'
          + '<div class="rec-fields">'
          +   '<input id="rec-t-' + i + '" class="rec-time" inputmode="numeric" autocomplete="off" aria-label="Temps ' + prCatLabel(c) + '" placeholder="' + ph[i] + '" value="' + prEsc(v) + '" oninput="prFmtTimeInput(this);prRecLive(' + i + ')">'
          +   '<label class="rec-date"><input id="rec-d-' + i + '" type="date" aria-label="Date du record ' + prCatLabel(c) + '" max="' + prTodayIso() + '" value="' + prEsc(m.date || '') + '" onchange="prRecLive(' + i + ')"><span id="rec-dp-' + i + '" class="rec-dph"' + (m.date ? ' hidden' : '') + '>Date</span></label>'
          + '</div>'
          + '<input id="rec-r-' + i + '" class="rec-race" aria-label="Course ' + prCatLabel(c) + '" placeholder="Nom de la course (facultatif)" value="' + prEsc(m.race || '') + '">'
          + (!v && b ? '<button type="button" class="pr-link rec-sugg" onclick="const t=document.getElementById(\'rec-t-' + i + '\');t.value=\'' + b.time + '\';prRecLive(' + i + ');this.remove()">↺ Reprendre ' + b.time + ' (' + prEsc(b.src === 'record' ? 'record' : b.src) + ')</button>' : '')
          + '</div>';
      }).join('')
    + '</div><p class="pr-note" style="padding:0 2px;">Tape seulement les chiffres : 4423 → 44:23 · 13700 → 1:37:00. Un record sans date ou de plus de 6 mois compte moins.</p></div></div>'
    + '<div class="pr-foot"><button type="button" class="pr-btn pri" onclick="saveRecordsModal()">Enregistrer mes records</button></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  mc.appendChild(ov);
  PR_CATS.forEach(function(c, i){ prRecLive(i); });
  window._recordsDone = onDone || null;
}
function saveRecordsModal(){
  const meta = Object.assign({}, state._records || {}), up = {};
  for(let i = 0; i < PR_CATS.length; i++){
    const c = PR_CATS[i], k = PR_RECORD_KEY[c], raw = document.getElementById('rec-t-' + i).value.trim();
    const sec = raw ? prTimeSec(raw) : null, km = PR_RACE_M[c] / 1000;
    if(raw && (!sec || sec / km < 150 || sec / km > 600)){ alert(prCatLabel(c) + ' : temps invalide (ex. ' + (i < 2 ? '42:30' : '1:35:00') + ').'); return; }
    up[k] = sec ? prTime(sec) : null;
    const d = document.getElementById('rec-d-' + i).value, r = document.getElementById('rec-r-' + i).value.trim();
    if(sec) meta[c] = { date: d || null, race: r || null }; else delete meta[c];
  }
  Object.keys(up).forEach(function(k){ if(up[k]) state[k] = up[k]; else delete state[k]; });
  state._records = meta;
  save();
  const ov = document.getElementById('records-modal'); if(ov) ov.remove();
  renderRecordsRow();
  if(typeof showToast === 'function') showToast('Records enregistrés 🏆');
  if(typeof window._recordsDone === 'function') window._recordsDone();
}
function openPlanReview(opts){
  _prCss(); opts = opts || {};
  if(document.getElementById('plan-review')) return;
  const R0 = typeof prepRace === 'function' ? prepRace() : {};
  const a = { race: R0 };
  const mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'plan-review'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  ov.innerHTML = '<div class="modal-box" style="max-height:94vh;"><div class="pr-head"><div><p class="pr-eb">Plan</p><p class="pr-title">🔄 Mise à jour du plan</p><p class="pr-sub">' + prEsc(a.race.name || 'Prépa en cours') + (a.race.objectif && a.race.objectif !== 'non défini' ? ' · objectif ' + prEsc(a.race.objectif) : '') + '</p></div>'
    + '<button class="pr-x" onclick="closePlanReview()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body pr-body"><div id="pr-content" style="padding:14px 16px 18px;display:flex;flex-direction:column;gap:12px;"></div></div>'
    + '<div class="pr-foot"><button type="button" id="pr-apply" class="pr-btn ok" onclick="applyPlanReview()"></button></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) closePlanReview(); });
  mc.appendChild(ov);
  const box = document.getElementById('pr-content'); if(box) box.innerHTML = '<div class="pr-load"><div class="pr-load-h"><b>Analyse de ton plan…</b><span>0 %</span></div><div class="pr-bar indet"><i></i></div></div>';
  const b = document.getElementById('pr-apply'); if(b){ b.disabled = true; b.textContent = 'Analyse en cours…'; }
  (async function(){
    if(typeof prPrefetch === 'function'){ try { await prPrefetch(); } catch(e) {} }
    if(ov !== document.getElementById('plan-review')) return;
    const an = prAnalyze();
    _prReview = { a: an, items: an.proposals.map(function(p){ return Object.assign({ on: true }, p); }), held: an.held.slice(), coach: null, autoCoach: !!opts.autoCoach };
    _prReview.items.forEach(function(x){ const d = prRevertOf(x); if(d){ x.revert = d; x.on = false; } });
    _prReview.auto = _prReview.items.slice();
    _prRestoreCoach(_prReview);
    state._review_seen = prSig(an.proposals);
    if(dbRef) dbRef.child('_review_seen').set(state._review_seen).catch(function(){});
    _prLoading(an);
  })();
  try { if(typeof renderPlan === 'function'){ rendered.plan = false; } } catch(e) { diagSilent(e, 'plan-review:openPlanReview'); }
}
function closePlanReview(){ const ov = document.getElementById('plan-review'); if(ov) ov.remove(); if(_prReview && _prReview.clTimer) clearInterval(_prReview.clTimer); _prReview = null; try { renderPlan(); } catch(e) { diagSilent(e, 'plan-review:closePlanReview'); } }
// Analyse affichée étape par étape, avec les chiffres réellement calculés (records, séances, base, plan), puis le résultat
function _prLoading(a){
  const box = document.getElementById('pr-content'); if(!box) return;
  const f = a.fit, sess = prSessions(state), today = a.opt.today, pl = function(n, w){ return n + ' ' + w + (n > 1 ? 's' : ''); };
  const done = sess.filter(function(x){ return x.done; }).length, next = sess.filter(function(x){ return !x.done && (!x.date || x.date >= today); }).length;
  const nW = Object.keys(sess.reduce(function(o, x){ o[x.w] = 1; return o; }, {})).length;
  const races = (f.sources || []).filter(function(x){ return x.kind === 'course'; }).length, qual = (f.sources || []).filter(function(x){ return x.kind === 'séance'; }).length;
  const n = a.proposals.length, nv = a.warnings.filter(function(x){ return x.w != null; }).length;
  const steps = [
    ['🏆', 'Tes records et tes courses', races ? pl(races, 'résultat') + ' → niveau ' + prV(f.vdot) : f.vdot ? 'niveau ' + prV(f.vdot) + ' d\'après tes ' + prEsc(f.basis) : 'aucun record daté'],
    ['✅', 'Tes séances réalisées', pl(done, 'séance') + ' validée' + (done > 1 ? 's' : '') + (qual ? ' · ' + pl(qual, 'séance') + ' de qualité mesurée' + (qual > 1 ? 's' : '') : '')],
    ['🏋️', 'Ta base d\'entraînement', a.opt.habitual ? '~' + a.opt.habitual + ' km/sem (' + prEsc(a.opt.habitualFrom) + ')' : 'pas de prépa précédente enregistrée'],
    ['📈', 'Ta charge réelle', a.load ? a.load.k7 + ' km sur 7 jours · ~' + a.load.chronic + ' km/sem sur 28 jours' + (a.drift ? ' · dérive cardiaque ' + prV(a.drift.avg) + ' %' : '') : 'non disponible'],
    ['💚', 'Ta récupération', a.whoop ? 'WHOOP : ' + a.whoop.avg3 + ' % en moyenne sur 3 jours' + (a.whoop.hrvDrop != null ? ' · VFC ' + (a.whoop.hrvDrop > 0 ? '+' : '') + a.whoop.hrvDrop + ' %' : '') : 'pas de données WHOOP récentes'],
    ['📅', 'Ton plan, semaine par semaine', pl(nW, 'semaine') + ' · ' + pl(next, 'séance') + ' à venir contrôlée' + (next > 1 ? 's' : '')],
    ['🎯', 'Propositions', (n ? pl(n, 'ajustement') + ' proposé' + (n > 1 ? 's' : '') : 'rien à ajuster') + (nv ? ' · ' + pl(nv, 'point') + ' de vigilance' : '')]
  ];
  box.innerHTML = '<div class="pr-load"><div class="pr-load-h"><b>Analyse de ton plan…</b><span id="pr-load-pct">0 %</span></div><div class="pr-bar"><i id="pr-load-bar"></i></div>'
    + steps.map(function(st, i){ return '<div class="pr-step" id="pr-step-' + i + '"><span class="pr-step-ic">' + st[0] + '</span><span class="pr-step-t"><b>' + st[1] + '</b><small>' + st[2] + '</small></span><span class="pr-step-ok">✓</span></div>'; }).join('') + '</div>';
  const b = document.getElementById('pr-apply'); if(b){ b.disabled = true; b.textContent = 'Analyse en cours…'; }
  const fast = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches, T = fast ? 90 : 300, R = _prReview;
  steps.forEach(function(st, i){
    setTimeout(function(){
      if(_prReview !== R) return;
      const el = document.getElementById('pr-step-' + i); if(el) el.classList.add('run');
      setTimeout(function(){
        if(_prReview !== R) return;
        if(el){ el.classList.remove('run'); el.classList.add('ok'); }
        const pct = Math.round((i + 1) / steps.length * 100), bar = document.getElementById('pr-load-bar'), t = document.getElementById('pr-load-pct');
        if(bar) bar.style.width = pct + '%'; if(t) t.textContent = pct + ' %';
      }, T * 0.75);
    }, i * T);
  });
  setTimeout(function(){
    if(_prReview !== R) return;
    const c = document.getElementById('pr-content'); if(c){ c.classList.add('pr-in'); }
    _prRender();
    // ouverture depuis la notification du dimanche : avis du Coach s'il y a du nouveau
    if(R.autoCoach && typeof isAdmin === 'function' && isAdmin() && !(state._coach_review && state._coach_review.sig === prDataSig())) setTimeout(function(){ if(_prReview === R) askCoachPlanReview(); }, 400);
  }, steps.length * T + (fast ? 100 : 450));
}
function _prGo(w){ const el = document.getElementById('pr-wk-' + w); if(el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
// séance mise en attente (début de récupération) : l'athlète choisit de l'accélérer quand même
function _prUnhold(i){
  const R = _prReview; if(!R || !R.held || !R.held[i]) return;
  const p = Object.assign({}, R.held.splice(i, 1)[0], { on: true, held: false });
  p.short = 'Accélérée à ta demande malgré la récupération : écoute tes sensations.';
  R.items.push(p); if(R.auto) R.auto.push(p); R.items.sort(function(x, y){ return (x.date || '').localeCompare(y.date || '') || x.w - y.w; });
  _prRender();
  const k = R.items.indexOf(p), el = document.getElementById('pr-it-' + k); if(el){ el.classList.add('pr-pop'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}
function _prToggle(i){
  const it = _prReview && _prReview.items[i]; if(!it) return;
  it.on = !it.on;
  const el = document.getElementById('pr-it-' + i); if(el){ el.classList.toggle('off', !it.on); const t = el.querySelector('.pr-tick'); t.setAttribute('aria-pressed', it.on ? 'true' : 'false'); }
  _prFoot();
}
// une proposition : séance, changement en grand (allure, km, titre), raison en une phrase
function _prItem(p, i, wo){
  const ty = p.type || 'ef', col = (typeof typeColor !== 'undefined' && typeColor[ty]) || '#1B4FD8', bg = (typeof typeBg !== 'undefined' && typeBg[ty]) || '#EEF3FC';
  const title = typeof normalizeSessionTitle === 'function' ? normalizeSessionTitle(p.title, p.type, p.before) || p.title : p.title;
  let swap = '', full = '', delta = '';
  if(p.field === 'detail' && !p.pb){                                       // consigne du Coach : allures extraites si elles changent
    const m1 = String(p.before).match(PR_PACE_RE), m2 = String(p.after).match(PR_PACE_RE);
    if(m1 && m2 && m1[0] !== m2[0]){
      const mid = function(m){ const x = prParsePace(m[1], m[2]), y = m[3] ? prParsePace(m[3], m[4]) : x; return (x + y) / 2; };
      p = Object.assign({}, p, { pb: m1[0].replace(/\s*\/\s*km$/, ''), pa: m2[0].replace(/\s*\/\s*km$/, ''), delta: Math.round(mid(m2) - mid(m1)) });
    }
  }
  if(p.pb && p.pa){
    const d = p.delta || 0;
    swap = '<div class="pr-swap"><span class="pr-p old">' + prEsc(p.pb) + '</span><span class="pr-arr">→</span><span class="pr-p new">' + prEsc(p.pa) + '</span><span class="pr-u">/km</span></div>';
    if(d) delta = '<span class="pr-d ' + (d < 0 ? 'fast' : 'slow') + '">' + (d < 0 ? '⚡ ' + (-d) + ' s/km plus vite' : '🐢 ' + d + ' s/km plus lent') + '</span>';
    full = '<details class="pr-full"><summary>Consigne complète</summary><p class="pr-old">' + prEsc(p.before) + '</p><p class="pr-new">' + prEsc(p.after) + '</p></details>';
  } else if(p.field === 'session'){
    swap = '<div class="pr-swap"><span class="pr-p old">' + prEsc(p.before.t) + ' · ' + prEsc(p.before.km) + ' km</span><span class="pr-arr">→</span><span class="pr-p new">' + prEsc(p.after.t) + ' · ' + prEsc(p.after.km) + ' km</span></div>';
    full = '<details class="pr-full"><summary>Consigne</summary><p class="pr-old">' + prEsc(p.before.d) + '</p><p class="pr-new">' + prEsc(p.after.d) + '</p></details>';
  } else if(p.field === 'km'){
    swap = '<div class="pr-swap"><span class="pr-p old">' + prEsc(p.before) + ' km</span><span class="pr-arr">→</span><span class="pr-p new">' + prEsc(p.after) + ' km</span></div>';
  } else if(p.field === 'type'){
    const L = function(t){ return (typeof typeLabel !== 'undefined' && typeLabel[t]) || t; };
    swap = '<div class="pr-swap"><span class="pr-p old">' + prEsc(L(p.before)) + '</span><span class="pr-arr">→</span><span class="pr-p new">' + prEsc(L(p.after)) + '</span></div>';
  } else {
    swap = '<div class="pr-txt"><p class="pr-old">' + (p.field === 'title' ? 'Titre : ' : '') + prEsc(p.before) + '</p><p class="pr-new">' + (p.field === 'title' ? 'Titre : ' : '') + prEsc(p.after) + '</p></div>';
  }
  const kindTag = p.kind === 'pain' ? ' · <span class="pr-tag rev">🩹 Douleur</span>' : p.kind === 'whoop' ? ' · <span class="pr-tag wh">💚 WHOOP</span>' : p.kind === 'test' ? ' · <span class="pr-tag ts">🎯 Test</span>' : p.kind === 'volume' ? ' · <span class="pr-tag vo">Volume</span>' : '';
  const why = _prShortWhy(p.short || p.reason || '');
  const K = wo && PR_KIND[wo.kind], wk = 'S' + p.w + (K && wo.kind !== 'load' ? ' · ' + K[1] + ' ' + K[0] : '');
  return '<div class="pr-chg' + (p.on ? '' : ' off') + '" id="pr-it-' + i + '">'
    + '<div class="pr-chg-h"><span class="pr-dot" style="background:' + bg + ';color:' + col + ';">' + ((typeof typeEmoji !== 'undefined' && typeEmoji[ty]) || '•') + '</span>'
    + '<div class="pr-chg-t"><b>' + prEsc(title) + '</b><small>' + (p.date ? prFmtDate(p.date, { weekday: 'short', day: 'numeric', month: 'short' }) : '') + ' · ' + wk + (p.src === 'coach' ? ' · <span class="pr-tag coach">Coach</span>' : '') + kindTag + (p.revert ? ' · <span class="pr-tag rev">↩ annule ' + prFmtDate(p.revert) + '</span>' : '') + '</small></div>'
    + '<button type="button" class="pr-tick" aria-pressed="' + (p.on ? 'true' : 'false') + '" aria-label="Retenir ce changement" onclick="_prToggle(' + i + ')"></button></div>'
    + swap + '<p class="pr-why">' + delta + (why ? '<span class="pr-why-t">' + prEsc(why) + '</span>' : '') + '</p>' + full + '</div>';
}
// raison d'une proposition en quelques mots : 1re phrase, sans la partie « type : » redondante, 70 caractères au plus
function _prShortWhy(t){
  t = String(t || '').trim(); if(!t) return '';
  t = t.split(/[.!]\s/)[0].replace(/[.!]$/, '').split(' (')[0];
  for(let k = 0; k < 2; k++) t = t.replace(/^(Moins de volume|Plus de volume|Volume|Fractionné|Seuil|Tempo|Footing|Sortie longue|Allure course|EF|Endurance)\s*:\s*/i, '');
  t = t.replace(/^semaine \d+\s*→\s*(\d+) km conseillés/i, '$1 km conseillés sur la semaine');
  if(t.length > 70) t = t.slice(0, 68).replace(/\s+\S*$/, '') + '…';
  return t.charAt(0).toUpperCase() + t.slice(1);
}
// volume par semaine : prévu (gris), conseillé (trait bleu), fait (vert) ; après les changements proposés (bleu)
function _prVolChart(V){
  const allW = V.weeks.filter(function(x){ return x.past ? x.done > 0 : true; }), i0 = allW.findIndex(function(x){ return !x.past; });
  const from = Math.max(0, Math.min((i0 < 0 ? allW.length : i0) - 4, allW.length - 16)), ws = allW.slice(from, from + 16); if(ws.length < 2) return '';
  const W = 320, H = 116, B = 18, T = 14, n = ws.length, bw = Math.min(22, (W - 16) / n * 0.62), gap = (W - 16) / n;
  const max = Math.max.apply(null, ws.map(function(x){ return Math.max(x.plan, x.target || 0, x.done || 0, x.after || 0); }).concat([10]));
  const Y = function(v){ return T + (1 - v / max) * (H - T - B); };
  let g = '';
  ws.forEach(function(x, i){
    const cx = 8 + gap * i + gap / 2, l = cx - bw / 2;
    if(x.past) g += '<rect x="' + l + '" y="' + Y(x.done) + '" width="' + bw + '" height="' + (H - B - Y(x.done)) + '" rx="3" class="vc-done"><title>S' + x.w + ' : ' + x.done + ' km faits</title></rect>';
    else {
      g += '<rect x="' + l + '" y="' + Y(x.plan) + '" width="' + bw + '" height="' + (H - B - Y(x.plan)) + '" rx="3" class="vc-plan"><title>S' + x.w + ' : ' + x.plan + ' km prévus</title></rect>';
      if(x.changed && x.after !== x.plan) g += '<rect x="' + (l + bw * 0.22) + '" y="' + Y(x.after) + '" width="' + bw * 0.56 + '" height="' + (H - B - Y(x.after)) + '" rx="2" class="vc-after"><title>S' + x.w + ' : ' + x.after + ' km après changements</title></rect>';
      if(x.target) g += '<line x1="' + (l - 3) + '" x2="' + (l + bw + 3) + '" y1="' + Y(x.target) + '" y2="' + Y(x.target) + '" class="vc-tgt"><title>S' + x.w + ' : ' + x.target + ' km conseillés</title></line>';
    }
    g += '<text x="' + cx + '" y="' + (H - 5) + '" class="vc-ax" text-anchor="middle">S' + x.w + '</text>';
  });
  return '<div class="pr-card pr-vol"><p class="pr-vol-h">Volume par semaine <span>base ~' + V.base + ' km · pic visé ~' + V.peak + ' km</span></p>'
    + '<svg viewBox="0 0 ' + W + ' ' + H + '" class="vc-svg" role="img" aria-label="Volume prévu, conseillé et réalisé par semaine">' + g + '</svg>'
    + '<p class="pr-tj-leg"><span><i class="lg-plan"></i>prévu</span><span><i class="lg-tgt"></i>conseillé</span><span><i class="lg-after"></i>avec les changements</span><span><i class="lg-done"></i>fait</span></p></div>';
}
function _prRender(){
  const box = document.getElementById('pr-content'); if(!box || !_prReview) return;
  const a = _prReview.a, f = a.fit, R = _prReview, today = a.opt.today;
  const W = prWeeks(state, today), wk = Object.keys(W).map(Number).sort(function(x, y){ return x - y; }).map(function(w){ return W[w]; }).filter(function(o){ return !o.past; });
  const byW = {}, warnW = {};
  R.items.forEach(function(p, i){ (byW[p.w] = byW[p.w] || []).push(i); });
  a.warnings.forEach(function(x){ if(x.w != null && W[x.w] && !W[x.w].past) (warnW[x.w] = warnW[x.w] || []).push(x); });
  const heldW = {}; (R.held || []).forEach(function(p, i){ (heldW[p.w] = heldW[p.w] || []).push(i); });
  const nW = Object.keys(warnW).reduce(function(n, k){ return n + warnW[k].length; }, 0), nI = R.items.length;
  const goal = a.warnings.filter(function(x){ return x.goal; })[0];
  let h = '';
  const admin = typeof isAdmin === 'function' && isAdmin();
  const fold = function(id, ico, title, sub, body, open){ return '<details class="pr-more" id="pr-more-' + id + '"' + (open ? ' open' : '') + '><summary><span class="pr-more-i">' + ico + '</span><span class="pr-more-t"><b>' + title + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</span><span class="pr-more-c" aria-hidden="true">›</span></summary><div class="pr-more-b">' + body + '</div></details>'; };

  // ── 1. Les changements proposés, tout en haut (ou « plan à jour »)
  const nH = (R.held || []).length;
  if(nI || nH){
    h += '<div class="pr-top"><span class="pr-top-n">' + (nI || '⏳') + '</span><b>' + (nI ? 'séance' + (nI > 1 ? 's' : '') + ' à ajuster' : 'en attente') + '</b>'
      + (nI > 1 ? '<button class="pr-link" onclick="const on=_prReview.items.some(function(x){return !x.on;});_prReview.items.forEach(function(x){x.on=on;});_prRender()">' + (R.items.every(function(x){ return x.on; }) ? 'Tout décocher' : 'Tout cocher') + '</button>' : '') + '</div>';
    const ord = R.items.map(function(p, i){ return [p, i]; }).sort(function(x, y){ return (x[0].date || '').localeCompare(y[0].date || '') || x[0].w - y[0].w; });
    ord.slice(0, 4).forEach(function(x){ h += _prItem(x[0], x[1], W[x[0].w]); });
    if(ord.length > 4){ const rest = ord.slice(4), ws = rest.map(function(x){ return x[0].w; });
      h += '<details class="pr-rest"' + (R.restOpen ? ' open' : '') + ' ontoggle="if(_prReview)_prReview.restOpen=this.open"><summary>+ ' + rest.length + ' autre' + (rest.length > 1 ? 's' : '') + ' · S' + Math.min.apply(null, ws) + (Math.max.apply(null, ws) !== Math.min.apply(null, ws) ? '–S' + Math.max.apply(null, ws) : '') + '</summary><div class="pr-rest-b">'
        + rest.map(function(x){ return _prItem(x[0], x[1], W[x[0].w]); }).join('') + '</div></details>'; }
    (R.held || []).forEach(function(p, i){
      const title = typeof normalizeSessionTitle === 'function' ? normalizeSessionTitle(p.title, p.type, p.before) || p.title : p.title;
      h += '<div class="pr-held"><div class="pr-held-t"><b>⏳ ' + prEsc(title) + '</b><small>' + (p.date ? prFmtDate(p.date, { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' : '') + 'en attente (récup)</small></div>'
        + '<div class="pr-swap"><span class="pr-p cur">' + prEsc(p.pb) + '</span><span class="pr-arr">→</span><span class="pr-p sug">' + prEsc(p.pa) + '</span><span class="pr-u">/km</span></div>'
        + '<button type="button" class="pr-btn sec pr-held-b" onclick="_prUnhold(' + i + ')">⚡ Accélérer quand même</button></div>';
    });
  } else h += '<div class="pr-card pr-uptodate"><span class="pr-big ok">✓</span><div><b>Ton plan est à jour</b><span>Rien à changer pour l\'instant</span></div></div>';

  // ── 2. Points clés : 4 tuiles au plus
  const tiles = [], TJ = a.trajectory;
  if(f.vdot){
    const gap = a.planVdot ? f.vdot - a.planVdot : 0;
    tiles.push({ ico: gap > 0.4 ? '📈' : gap < -0.4 ? '🧭' : '👌', v: prV(f.vdot), l: a.planVdot ? 'niveau · plan ' + prV(a.planVdot) : 'ton niveau', c: gap > 0.4 ? 'ok' : gap < -0.4 ? 'mid' : 'ok' });
  }
  const tq = function(sec){ return prTime(sec).replace(/:(\d\d)$/, "'$1").replace(/^(\d+):(\d\d)'/, '$1h$2\''); };
  if(TJ && TJ.race) tiles.push({ ico: '🏁', v: tq(TJ.race.lo) + '–' + tq(TJ.race.hi), l: 'prévu · objectif ' + (a.opt.goalSec ? tq(a.opt.goalSec) : prEsc(a.race.objectif || '')), c: TJ.verdict === 'atteignable' ? 'ok' : TJ.verdict === 'à portée' ? 'mid' : 'low', sm: true });
  else if(goal && f.vdot && a.opt.raceCat) tiles.push({ ico: '🎯', v: prTime(f.preds[a.opt.raceCat]), l: 'aujourd\'hui · objectif ' + prTime(a.opt.goalSec), c: 'mid' });
  if(a.load && a.load.k7 != null) tiles.push({ ico: '📊', v: a.load.k7 + ' km', l: '7 jours' + (a.load.acwr ? ' · ratio ' + prV(a.load.acwr) : ''), c: a.load.acwr > 1.5 ? 'low' : a.load.acwr > 1.3 ? 'mid' : 'ok' });
  const alcX = a.whoop && a.whoop.alc && a.whoop.alc.explained;              // récup basse due à l'alcool : valeur « hors alcool » + mesurée, plan non allégé
  if(a.whoop) tiles.push({ ico: alcX ? '🍷' : a.whoop.tired ? '😮‍💨' : '💚', v: a.whoop.avg3 + ' %', l: alcX ? 'hors alcool · ' + a.whoop.alc.rawAvg3 + ' % mesuré' : 'récup WHOOP 3 j', c: a.whoop.tired ? 'low' : a.whoop.fresh ? 'ok' : 'mid' });
  if(tiles.length) h += '<div class="pr-keys">' + tiles.slice(0, 4).map(function(t){ return '<div class="pr-key ' + t.c + '"><span class="pr-key-i">' + t.ico + '</span><b' + (t.sm ? ' class="sm"' : '') + '>' + t.v + '</b><small>' + t.l + '</small></div>'; }).join('') + '</div>';
  if(!f.vdot) h += '<button class="pr-btn sec" onclick="' + prReload + '">🏆 Saisir mes records pour calculer ton niveau</button>';

  // ── 3. À surveiller : seulement ce qui compte (3 au plus, une ligne chacun)
  const alerts = [];
  const pn = a.internal && a.internal.pains[0];
  if(pn && pn.level >= 2) alerts.push(['🩹', 'Douleur ' + ['', 'légère', 'gênante', 'forte'][pn.level] + ' · ' + pn.zone.toLowerCase() + ' → allégé', 'low']);
  if(a.opt.postRace && wk.length && (!wk[0].from || a.opt.postRaceUntil >= wk[0].from)) alerts.push(['🛌', 'Récup jusqu\'au ' + prFmtDate(a.opt.postRaceUntil, { day: 'numeric', month: 'short' }) + (a.opt.noFasterUntil ? ' · allures gardées' : ''), 'mid']);
  if(a.stride && a.stride.level >= 2) alerts.push(['⚠️', 'Foulée fatiguée → pas de hausse de volume', 'low']);
  a.warnings.filter(function(x){ return !x.goal && x.level === 'warn'; }).forEach(function(x){ alerts.push(['⚠️', x.short || x.text, 'low']); });
  if(alerts.length) h += '<div class="pr-alerts">' + alerts.slice(0, 3).map(function(x){ return '<p class="' + x[2] + '"><i>' + x[0] + '</i><span>' + prEsc(x[1]) + '</span></p>'; }).join('') + '</div>';

  // ── 4. Coach (admin) : avis replié + deux boutons côte à côte
  if(R.coach) h += fold('coach', '🤖', 'Avis du Coach', 'lire', '<p class="pr-coach-t">' + prEsc(R.coach) + '</p>');
  const lastC = state._coach_review, same = !R.coach && lastC && lastC.sig === prDataSig();
  if(admin){
    h += '<div class="pr-actions">'
      + (same ? '<button type="button" id="pr-coach-btn" class="pr-btn sec" onclick="askCoachPlanReview(true)">🤖 Relancer le Coach</button>'
        : '<button type="button" id="pr-coach-btn" class="pr-btn pri" onclick="askCoachPlanReview()">🤖 ' + (R.coach ? 'Redemander' : 'Avis du Coach') + '</button>')
      + (typeof openPlanChat === 'function' ? '<button type="button" class="pr-btn pr-chat-b" onclick="openPlanChat(_prReview && _prReview.items.length ? \'À propos des ajustements proposés par la mise à jour : \' : \'\')">💬 En parler</button>' : '') + '</div>';
    if(same) h += '<p class="pr-mini">🤖 Relu ' + (lastC.date === a.opt.today ? 'aujourd\'hui' : 'le ' + prFmtDate(lastC.date, { day: 'numeric', month: 'short' })) + ' · rien de nouveau depuis</p>';
  }

  // ── 5. Détails, repliés
  h += '<p class="pr-sec"><span>Détails</span></p>';
  if(TJ && TJ.race){
    h += fold('tj', '📈', 'Trajectoire', tq(TJ.race.lo) + '–' + tq(TJ.race.hi) + (TJ.verdict ? ' · ' + TJ.verdict : '') + ' · et si… ?',
      prTrajectorySvg(TJ) + '<p class="pr-tj-leg"><span><i class="lg-race"></i>courses</span><span><i class="lg-ses"></i>séances</span><span><i class="lg-proj"></i>projection</span></p>'
      + '<p class="pr-mini">' + (TJ.assumed ? 'Progression type : +0,1 / sem.' : 'Tendance 4 mois : ' + (TJ.slope >= 0 ? '+' : '') + prV(TJ.slope * 7) + ' / sem.') + ' · ± 0,6</p>'
      + (typeof openWhatIf === 'function' ? '<button type="button" class="pr-btn sec pr-whatif-b" onclick="openWhatIf()">🔮 Et si… ? Teste un scénario</button>' : ''));
  }
  if(wk.length){
    let wb = a.volume ? _prVolChart(a.volume) : '';
    wb += '<div class="pr-strip">' + wk.map(function(o){
        const ni = (byW[o.w] || []).length, nv = (warnW[o.w] || []).length + (heldW[o.w] || []).length, st = ni ? 'chg' : nv ? 'vig' : 'ok';
        return '<button type="button" class="pr-wk ' + st + (o.now ? ' now' : '') + '"' + (nv ? ' onclick="_prGo(' + o.w + ')"' : ' disabled') + '>'
          + '<span class="pr-wk-s">S' + o.w + '</span><span class="pr-wk-d">' + (o.now ? 'en cours' : o.from ? prFmtDate(o.from) : '') + '</span>'
          + '<span class="pr-wk-i">' + (ni ? ni + ' ✎' : nv ? '!' : (o.race ? '🏁' : '✓')) + '</span></button>';
      }).join('') + '</div>';
    wk.forEach(function(o){
      const ws = warnW[o.w] || []; if(!ws.length) return;
      wb += '<div class="pr-vig" id="pr-wk-' + o.w + '"><p class="pr-vig-h">S' + o.w + ' · ' + PR_KIND[o.kind][1] + ' ' + PR_KIND[o.kind][0] + '</p>' + ws.map(function(x){ return '<p><i>' + (x.level === 'warn' ? '⚠️' : '💡') + '</i><span>' + prEsc(x.short || x.text) + '</span></p>'; }).join('') + '</div>';
    });
    const nV = Object.keys(warnW).reduce(function(n, k){ return n + warnW[k].length; }, 0);
    h += fold('wk', '🗂️', 'Semaine par semaine', wk.length + ' sem.' + (nV ? ' · ' + nV + ' vigilance' + (nV > 1 ? 's' : '') : ''), wb);
  }
  const pills = [];
  if(a.opt.habitual) pills.push('🏋️ Base ~' + a.opt.habitual + ' km/sem (' + prEsc(a.opt.habitualFrom) + ')');
  if(a.load && a.load.chronic) pills.push('📈 ~' + a.load.chronic + ' km/sem sur 28 j');
  if(a.whoop) pills.push((a.whoop.tired ? '😮‍💨' : '💚') + ' WHOOP ' + a.whoop.avg3 + ' %' + (a.whoop.hrvDrop != null ? ' · VFC ' + (a.whoop.hrvDrop > 0 ? '+' : '') + a.whoop.hrvDrop + ' %' : ''));
  if(pn) pills.push('🩹 Douleur ' + ['', 'légère', 'gênante', 'forte'][pn.level] + ' · ' + prEsc(pn.zone.toLowerCase()) + ' · ' + prFmtDate(pn.date));
  if(a.internal && a.internal.ratio) pills.push('💪 Charge ressentie ' + prV(a.internal.ratio) + '×');
  if(a.recette) pills.push('🧬 Ta recette : +' + Math.round((a.recette.progression - 1) * 100) + ' %/sem max' + (a.recette.calib ? ' · ' + a.recette.calib : ''));
  if(a.stride && a.stride.level) pills.push((a.stride.level >= 2 ? '⚠️' : '👀') + ' Foulée à surveiller');
  if(a.drift) pills.push('❤️ Dérive ' + prV(a.drift.avg) + ' % · ' + a.drift.label);
  if(a.calib && a.calib.n) pills.push('🎯 Allures tenues ' + a.calib.k + '/' + a.calib.n + (a.calib.mode ? ' · ' + a.calib.mode : ''));
  if(pills.length) h += fold('sig', '🔎', 'Tous les signaux', pills.length + ' repères', '<div class="pr-pills">' + pills.map(function(t){ return '<span class="pr-pill base">' + t + '</span>'; }).join('') + '</div>');
  if(f.vdot){
    h += fold('lvl', '🎚️', 'Ton niveau', prV(f.vdot) + ' · d\'après tes ' + prEsc(f.basis),
      '<table class="pr-tab"><thead><tr><th></th><th>Record</th><th>À ton niveau</th></tr></thead><tbody>'
      + PR_CATS.map(function(c){
          const rec = state[PR_RECORD_KEY[c]], rs = prTimeSec(rec), rv = rs ? prResultVdot(c, rs, ((state._records || {})[c] || {}).date || null) : null;
          return '<tr><th>' + prCatLabel(c) + '</th><td>' + (rec ? '<b>' + prEsc(prTime(rs)) + '</b><small>' + (rv ? prV(rv.vdot) : 'ancien') + '</small>' : '<small>—</small>') + '</td><td><b>' + prTime(f.preds[c]) + '</b></td></tr>';
        }).join('') + '</tbody></table>'
      + '<p class="pr-mini">Seuil <b>' + prPace(f.paces.T) + '</b> · fractionné <b>' + prPace(f.paces.I) + '</b>' + (a.opt.efPace ? ' · EF <b>' + prPace(a.opt.efPace) + '</b>' : '') + ' /km' + (a.planVdot ? ' · plan écrit pour ' + prV(a.planVdot) : '') + '</p>'
      + '<details class="pr-hist"><summary class="pr-mini">Sur quoi c\'est calculé</summary><ul>' + f.sources.map(function(x){ return '<li>' + prEsc(x.label) + ' — ' + (x.time || x.pace + '/km' + (x.hr ? ', FC ' + x.hr : '')) + (x.date ? ' (' + prFmtDate(x.date, { day: 'numeric', month: 'short', year: 'numeric' }) + ')' : '') + ' → <b>' + prV(x.vdot) + '</b></li>'; }).join('') + '</ul></details>'
      + '<button class="pr-link" onclick="' + prReload + '">🏆 Mes records</button>');
  }
  const allH = state._plan_reviews || [], hist = allH.slice(-3).reverse();
  const short = function(c, v){ if(c.field === 'km') return v + ' km'; if(c.field === 'skip') return v ? 'non réalisée' : 'prévue'; if(c.field === 'date') return v ? prFmtDate(v, { weekday: 'short', day: 'numeric' }) : ''; if(c.field === 'session') return v && v.t ? v.t + ' · ' + v.km + ' km' : ''; const m = String(v).match(PR_PACE_RE); return c.field === 'detail' && m ? m[0].replace(/\s*\/\s*km$/, '') : String(v); };
  if(hist.length) h += fold('hist', '🕘', 'Dernières mises à jour', prFmtDate(hist[0].date, { day: 'numeric', month: 'short' }) + ' · ' + hist[0].n + ' séance' + (hist[0].n > 1 ? 's' : ''), hist.map(function(x){
      const idx = allH.indexOf(x);
      const line = (x.undone ? '↩ ' : x.imprevu ? '🧳 ' : '✓ ') + prFmtDate(x.date, { day: 'numeric', month: 'short' }) + ' · ' + (x.imprevu ? ({ indispo: 'indisponible', charge: 'semaine chargée', malade: 'malade' }[x.imprevu] || 'imprévu') + ' · ' : '') + x.n + ' séance' + (x.n > 1 ? 's' : '') + (x.coach ? ' · Coach' : '') + (x.vdot ? ' · niveau ' + String(x.vdot).replace('.', ',') : '');
      if(!(x.changes || []).length) return '<p class="pr-mini">' + line + '</p>';
      return '<details class="pr-hist"><summary class="pr-mini">' + line + '</summary><ul>' + x.changes.map(function(c){ return '<li><b>' + prEsc(typeof normalizeSessionTitle === 'function' && c.type ? normalizeSessionTitle(c.title, c.type, typeof c.before === 'string' ? c.before : '') || c.title : c.title) + '</b>' + (c.date ? ' · ' + prFmtDate(c.date) : '') + ' : ' + prEsc(short(c, c.before)) + ' → <b>' + prEsc(short(c, c.after)) + '</b></li>'; }).join('') + '</ul>'
        + (x.undone ? '<p class="pr-mini">Annulée le ' + prFmtDate(x.undone, { day: 'numeric', month: 'short' }) + '</p>' : '<button type="button" class="pr-link pr-undo" onclick="if(confirm(\'Annuler cette mise à jour ? Les séances pas encore faites retrouvent leur ancienne version.\')) prUndoReview(' + idx + ')">↩ Annuler</button>') + '</details>';
    }).join(''));
  // repère invisible pour les tests et l'ouverture : la carte principale
  if(!/pr-card/.test(h)) h = '<div class="pr-card" style="display:none"></div>' + h;
  box.innerHTML = h;
  _prFoot();
}
function _prFoot(){
  const b = document.getElementById('pr-apply'); if(!b || !_prReview) return;
  const n = _prReview.items.filter(function(x){ return x.on; }).length;
  b.disabled = !n; b.textContent = n ? '✓ Appliquer ' + n + ' changement' + (n > 1 ? 's' : '') + ' au plan' : (_prReview.items.length ? 'Aucun changement retenu' : 'Rien à appliquer');
}
// Coach IA : relecture complète du plan (fonction planReview)
async function askCoachPlanReview(force){
  if(typeof coachAI === 'function' && !coachAI()) return;   // Coach IA : compte admin seulement (le serveur refuse aussi)
  if(!_prReview) return;
  const a = _prReview.a, today = a.opt.today, R = _prReview;
  force = !!force || !!(state._coach_review && state._coach_review.sig === prDataSig());   // redemande sans donnée nouvelle
  const ask = document.querySelector('#pr-content .pr-ask');
  const nW = Object.keys(prSessions(state).reduce(function(o, x){ o[x.w] = 1; return o; }, {})).length;
  const msgs = ['Il relit tes ' + nW + ' semaines de plan, séance par séance…', 'Il regarde tes séances réalisées : allures, FC, ressenti…']
    .concat(a.opt.habitual ? ['Il compare avec ta prépa ' + a.opt.habitualFrom + ' (~' + a.opt.habitual + ' km/sem)…'] : [])
    .concat(a.fit.vdot ? ['Il vérifie tes allures par rapport à ton niveau ' + prV(a.fit.vdot) + '…'] : [])
    .concat(a.opt.postRace ? ['Il tient compte de ta récupération après ta dernière course…'] : [])
    .concat(['Il prépare ses propositions…']);
  if(ask){
    ask.innerHTML = '<div class="pr-cl"><div class="pr-cl-h"><span class="pr-cl-ic">🤖</span><div><b>Le Coach relit ton plan</b><small id="pr-cl-t">0 s · en général 15 à 40 s</small></div></div>'
      + '<p id="pr-cl-msg" class="pr-cl-msg">' + prEsc(msgs[0]) + '</p><div class="pr-bar indet"><i></i></div></div>';
    ask.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  let k = 0; const t0 = Date.now();
  R.clTimer = setInterval(function(){
    const m = document.getElementById('pr-cl-msg'), t = document.getElementById('pr-cl-t'), sec = Math.round((Date.now() - t0) / 1000);
    if(t) t.textContent = sec + ' s · en général 15 à 40 s';
    if(sec && sec % 3 === 0 && m && k < msgs.length - 1){ k++; m.classList.remove('sw'); void m.offsetWidth; m.classList.add('sw'); m.textContent = msgs[k]; }
  }, 1000);
  const body = await prCoachBody(a, R, force);
  try {
    const token = await getAuthToken();
    const r = await fetch(FUNCTIONS_BASE + '/planReview', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify(body) });
    const j = await r.json();
    if(!r.ok || !j.success) throw new Error(j.error || 'HTTP ' + r.status);
    const items = prCoachItems(j.changes);
    clearInterval(R.clTimer); if(_prReview !== R) return;
    _prMergeCoach(R, items, j.rejected || [], j.assessment || '');
    // avis mémorisé avec ses changements : réaffiché tant qu'ils ne sont pas appliqués
    state._coach_review = { date: today, at: new Date().toISOString(), sig: prDataSig(), assessment: R.coach, rejected: (j.rejected || []).slice(0, 30),
      changes: items.map(function(x){ return { key: x.key, w: x.w, date: x.date, field: x.field, title: x.title, type: x.type, before: x.before, after: x.after, reason: x.reason }; }), applied: !items.length };
    if(dbRef) dbRef.child('_coach_review').set(state._coach_review).catch(function(){});
    _prRender();
    const cc = document.querySelector('#pr-content .pr-coach'); if(cc){ cc.classList.add('pr-pop'); cc.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  } catch(e) {
    clearInterval(R.clTimer); if(_prReview !== R) return;
    alert('Le Coach n\'a pas pu relire le plan (' + e.message + '). Réessaie dans un instant.');
    _prRender();
  }
}
// Application des propositions cochées (séances à venir uniquement)
function applyPlanReview(){
  if(!_prReview) return;
  const sel = _prReview.items.filter(function(x){ return x.on; }); if(!sel.length) return;
  const r = prApplyChanges(sel, { coach: sel.some(function(p){ return p.src === 'coach'; }), vdot: _prReview.a.fit.vdot || null });
  if(state._coach_review && sel.some(function(p){ return p.src === 'coach'; })) state._coach_review.applied = true;
  save();
  if(typeof rendered !== 'undefined'){ rendered.plan = false; rendered.stats = false; }
  const k = r.n;
  closePlanReview();
  try { renderHome(); } catch(e) { diagSilent(e, 'plan-review:applyPlanReview'); }
  if(typeof showToast === 'function') showToast(k + ' séance' + (k > 1 ? 's' : '') + ' mise' + (k > 1 ? 's' : '') + ' à jour');
}
