// Graphiques plein écran et fenêtres des signaux du corps (à la demande : groupe « charts », points d'entrée dans config.js) —
// sortis de body-signals.js ; les calculs (bsLevelSeries, bsPaceSeries, bsBedtime…) restent dans body-signals.js.
function openSleepPlan(){
  _bsCss();
  const B = bsBedtime(); if(!B) return;
  const SR = bsBedtimeStatus();
  const hm = function(m){ return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0'); };
  const old = document.getElementById('bs-sleep-m'); if(old) old.remove();
  const ov = document.createElement('div'); ov.className = 'modal-overlay'; ov.id = 'bs-sleep-m'; ov.style.zIndex = '510';
  const rows = B.parts.map(function(p){ return [p.lab, p.k === 'need' ? hm(p.min) : (p.min > 0 ? '+' : '−') + Math.abs(p.min) + ' min', p.why]; });
  rows.push(['Endormissement', '+15 min']);
  const close = 'document.getElementById(\'bs-sleep-m\').remove()';
  let h = '<div class="modal-box" style="max-height:90vh;"><div class="bs-sl-head"><div><p class="bs-sl-t">🌙 Ta nuit</p><p class="bs-sl-sub">' + (B.session ? 'Demain : ' + (B.time ? B.time + ' · ' : '') + prEsc(B.session) : 'Pas de séance demain') + '</p></div><button class="bs-sl-x" onclick="' + close + '" aria-label="Fermer">×</button></div><div class="modal-scroll-body"><div class="bs-sl-body">'
    + (!SR.ready ? '<div class="bs-sl-wait"><b>Heure de coucher à venir</b><small>Calculée ' + SR.label + ' : ' + (SR.why === 'night' ? 'il faut la nuit WHOOP d\'aujourd\'hui' : 'la séance du jour change ton besoin de sommeil') + '</small></div>'
    : '<div class="bs-sl-big"><div><small>Coucher</small><b>' + B.bed + '</b></div><div><small>Sommeil</small><b>' + B.sleep + '</b></div><div><small>Réveil</small><b>' + B.wake + '</b></div></div>'
    + '<table class="bs-sl-tab"><tbody>' + rows.map(function(r){ return '<tr><td>' + r[0] + (r[2] ? '<small>' + r[2] + '</small>' : '') + '</td><td>' + r[1] + '</td></tr>'; }).join('') + '<tr class="tot"><td>Au lit</td><td>' + hm(B.sleepMin + 15) + '</td></tr></tbody></table>');
  if(B.nights.length) h += '<p class="bs-sl-k">3 dernières nuits</p><div class="bs-sl-n">' + B.nights.map(function(n){ const d = n.min != null ? n.min - B.target : null;
    return '<div><small>' + new Date(n.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }).replace(/\./g, '') + '</small><b>' + (n.min != null ? hm(n.min) : '—') + '</b>' + (d != null ? '<em class="' + (d >= 0 ? 'ok' : 'low') + '">' + (d >= 0 ? '+' : '−') + hm(Math.abs(d)) + '</em>' : '') + '</div>'; }).join('') + '</div>';
  h += '<p class="bs-sl-k">Réglages</p><div class="bs-sl-set"><span>Besoin de sommeil<small class="bs-sl-src">' + (B.needSrc === 'auto' ? 'auto · ' + B.needN + ' nuits' : B.needSrc === 'manual' ? 'manuel' : 'auto · 8h par défaut') + '</small></span>' + (B.needSrc === 'manual' ? '<button type="button" class="bs-sl-auto" onclick="bsSleepSet(\'auto\',0)">Auto</button>' : '') + '<button type="button" onclick="bsSleepSet(\'need\',-15)" aria-label="Moins">−</button><b>' + hm(B.target) + '</b><button type="button" onclick="bsSleepSet(\'need\',15)" aria-label="Plus">+</button></div>'
    + [['wk', 'Réveil lun-ven', 420], ['we', 'Réveil sam-dim', 540]].map(function(r){ const v = r[0] === 'wk' ? (bsWakeParse(state._wake_week) || bsWakeParse(state._wake_usual) || r[2]) : (bsWakeParse(state._wake_weekend) || r[2]);
      return '<div class="bs-sl-set"><span>' + r[1] + '</span><button type="button" onclick="bsSleepSet(\'' + r[0] + '\',-15)" aria-label="Plus tôt">−</button><b>' + hm(v) + '</b><button type="button" onclick="bsSleepSet(\'' + r[0] + '\',15)" aria-label="Plus tard">+</button></div>'; }).join('')
    + '<p class="bs-sl-note">Auto : appris sur tes nuits bien récupérées, sans alcool · séance le matin : réveil 50 min avant · rappel à 21h</p></div></div></div>';
  ov.innerHTML = h; ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
}
function openDataQuality(){
  _bsCss();
  let ov = document.getElementById('bs-dq');
  if(!ov){
    const mc = document.getElementById('modal-container'); ov = document.createElement('div');
    ov.className = 'modal-overlay'; ov.id = 'bs-dq'; ov.style.zIndex = '740'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.5)');
    ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
    mc.appendChild(ov);
  }
  // à vérifier d'abord, puis les plus récentes
  const L = (typeof dqIssues === 'function' ? dqIssues() : []).slice().sort(function(a, b){ const pa = !a.kept && !a.ack, pb = !b.kept && !b.ack; return pa !== pb ? (pa ? -1 : 1) : b.date.localeCompare(a.date); });
  const act = function(fn, i, v){ return 'onclick="' + fn + '(\'' + i.id + '\'' + (v == null ? '' : ',' + v) + ');openDataQuality();bsRenderStatsCard()"'; };
  const row = function(i){
    const todo = !i.kept && !i.ack;
    const st = todo ? '<span class="dq-st todo">à vérifier</span>' : i.info ? '<span class="dq-st info">comptée une fois</span>' : i.kept ? '<span class="dq-st kept">gardée · valeur juste</span>' : '<span class="dq-st out">écartée · erreur confirmée</span>';
    const btns = (todo ? (i.info ? '<button type="button" class="dq-b ok" ' + act('dqAck', i, true) + '>✓ OK</button>'
        : '<button type="button" class="dq-b ok" ' + act('dqAck', i, true) + '>✓ Erreur, écarter</button><button type="button" class="dq-b" ' + act('dqKeep', i, true) + '>Valeur juste, garder</button>')
      : '<button type="button" class="dq-b sec" ' + act('dqReset', i) + '>Changer</button>')
      + (i.cur && i.w ? '<button type="button" class="dq-b sec" onclick="document.getElementById(\'bs-dq\').remove();openValidationModalExtra(' + i.w + ',' + i.ei + ')">Modifier la séance</button>' : '');
    return '<div class="dq-row"><div class="dq-top"><b>' + DQ_KIND[i.kind] + '</b>' + st + '</div><p class="dq-s">' + prFmtDate(i.date, { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + prEsc(i.title) + '</p>'
      + '<p class="dq-m">' + prEsc(i.msg) + '</p>' + (btns ? '<div class="dq-bs">' + btns + '</div>' : '') + '</div>';
  };
  ov.innerHTML = '<div class="modal-box" style="max-height:92vh;"><div class="lc-head" style="background:linear-gradient(135deg,#0F766E,#14B8A6);"><div><p class="lc-eb">Signaux du corps</p><p class="lc-title">🧹 Données vérifiées</p><p class="lc-sub">Valeur suspecte = écartée des analyses (seule la valeur, pas la séance). Confirme l\'erreur ou garde-la : elle n\'est plus signalée</p></div>'
    + '<button class="lc-x" onclick="document.getElementById(\'bs-dq\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body" style="background:#F5F7FB;"><div class="lc-body">' + (L.length ? L.map(row).join('') : '<p class="bs-n" style="text-align:center;padding:24px;">Rien de suspect dans tes séances.</p>') + '</div></div></div>';
}
function openLevelChart(range){
  _bsCss(); _lcRange = range || _lcRange;
  let ov = document.getElementById('bs-lc');
  if(!ov){
    const mc = document.getElementById('modal-container'); ov = document.createElement('div');
    ov.className = 'modal-overlay'; ov.id = 'bs-lc'; ov.style.zIndex = '740'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.5)');
    ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
    mc.appendChild(ov);
  }
  _lcData = bsLevelSeries(_lcRange); _lcSel = _lcData && _lcData.pts.length ? _lcData.pts.length - 1 : null;
  const seg = [['3m', '3 mois'], ['6m', '6 mois'], ['all', 'Tout']].map(function(r){ return '<button type="button" class="' + (r[0] === _lcRange ? 'on' : '') + '" onclick="openLevelChart(\'' + r[0] + '\')">' + r[1] + '</button>'; }).join('');
  ov.innerHTML = '<div class="modal-box" style="max-height:94vh;"><div class="lc-head"><div><p class="lc-eb">Signaux du corps</p><p class="lc-title">Niveau du moment</p><p class="lc-sub">Équivalent VDOT (Daniels) · recalculé à chaque séance validée</p></div>'
    + '<button class="lc-x" onclick="document.getElementById(\'bs-lc\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body" style="background:#F5F7FB;"><div class="lc-body"><div class="lc-seg">' + seg + '</div>'
    + '<div class="lc-chart" id="lc-chart"></div><p class="lc-leg"><span><i class="r"></i>course / record</span><span><i class="t"></i>test 5 km</span><span><i class="q"></i>séance de qualité</span></p>'
    + '<div id="lc-detail"></div></div></div></div>';
  _lcDraw(); _lcDetail();
}
function _lcDraw(){
  const el = document.getElementById('lc-chart'), D = _lcData; if(!el) return;
  if(!D || D.pts.length < 2){ el.innerHTML = '<p class="bs-n" style="padding:24px 8px;text-align:center;">Pas encore assez de données sur cette période.</p>'; return; }
  const W = 340, H = 230, L = 30, R = 10, T = 12, B = 34;
  const t0 = Date.parse(D.from + 'T12:00:00Z'), t1 = Date.parse(D.today + 'T12:00:00Z'), tx = function(d){ return L + (Date.parse(d + 'T12:00:00Z') - t0) / Math.max(1, t1 - t0) * (W - L - R); };
  const vs = D.pts.map(function(p){ return p.v; }), v0 = Math.floor(Math.min.apply(null, vs) - 0.5), v1 = Math.ceil(Math.max.apply(null, vs) + 0.5);
  const ty = function(v){ return T + (v1 - v) / Math.max(1, v1 - v0) * (H - T - B); };
  let g = '';
  const stepY = v1 - v0 > 6 ? 2 : 1;
  for(let v = v0; v <= v1; v += stepY) g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + ty(v) + '" y2="' + ty(v) + '" class="lc-grid"/><text x="' + (L - 6) + '" y="' + (ty(v) + 3.5) + '" class="lc-ax" text-anchor="end">' + v + '</text>';
  // mois
  const m = new Date(D.from + 'T12:00:00Z'); m.setUTCDate(1); m.setUTCMonth(m.getUTCMonth() + 1);
  const months = []; while(m.getTime() <= t1){ months.push(new Date(m)); m.setUTCMonth(m.getUTCMonth() + 1); }
  const every = Math.ceil(months.length / 6), xEnd = W - R;
  // bornes : date de début à gauche, « auj. » à droite ; mois entre les deux (sans chevauchement)
  g += '<text x="' + L + '" y="' + (H - B + 14) + '" class="lc-ax" text-anchor="start">' + prFmtDate(D.from) + '</text><text x="' + xEnd + '" y="' + (H - B + 14) + '" class="lc-ax" text-anchor="end">auj.</text>';
  months.forEach(function(d, i){ if(i % every) return; const iso = d.toISOString().slice(0, 10), x = tx(iso);
    if(x - L < 34 || xEnd - x < 26) return;
    g += '<line x1="' + x + '" x2="' + x + '" y1="' + T + '" y2="' + (H - B) + '" class="lc-grid v"/><text x="' + x + '" y="' + (H - B + 14) + '" class="lc-ax" text-anchor="middle">' + d.toLocaleDateString('fr-FR', { month: 'short' }) + '</text>'; });
  const line = D.pts.map(function(p){ return tx(p.date).toFixed(1) + ',' + ty(p.v).toFixed(1); }).join(' ');
  g += '<polygon points="' + tx(D.pts[0].date).toFixed(1) + ',' + (H - B) + ' ' + line + ' ' + tx(D.pts[D.pts.length - 1].date).toFixed(1) + ',' + (H - B) + '" class="lc-area"/>';
  g += '<polyline points="' + line + '" class="lc-line"/>';
  // repères : séances de qualité (piste du bas), courses et tests (sur la courbe)
  const yAt = function(d){ let best = D.pts[0]; D.pts.forEach(function(p){ if(Math.abs(Date.parse(p.date) - Date.parse(d)) < Math.abs(Date.parse(best.date) - Date.parse(d))) best = p; }); return ty(best.v); };
  D.ev.forEach(function(e){
    const x = tx(e.date);
    if(e.kind === 'q') g += '<circle cx="' + x.toFixed(1) + '" cy="' + (H - B + 24) + '" r="2.6" class="lc-q"><title>' + prEsc(e.label) + ' · ' + prFmtDate(e.date) + '</title></circle>';
    else g += '<rect x="' + (x - 4.5).toFixed(1) + '" y="' + (yAt(e.date) - 4.5).toFixed(1) + '" width="9" height="9" rx="2" transform="rotate(45 ' + x.toFixed(1) + ' ' + yAt(e.date).toFixed(1) + ')" class="lc-' + (e.kind === 'test' ? 't' : 'r') + '"><title>' + prEsc(e.label) + ' · ' + prFmtDate(e.date) + '</title></rect>';
  });
  // point sélectionné
  const sp = D.pts[_lcSel];
  g += '<line id="lc-cur" x1="' + tx(sp.date) + '" x2="' + tx(sp.date) + '" y1="' + T + '" y2="' + (H - B) + '" class="lc-cur"/><circle id="lc-dot" cx="' + tx(sp.date) + '" cy="' + ty(sp.v) + '" r="5" class="lc-dot"/>';
  el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="lc-svg" role="img" aria-label="Niveau du ' + prFmtDate(D.pts[0].date) + ' au ' + prFmtDate(D.today) + ' : de ' + _bsV(D.pts[0].v) + ' à ' + _bsV(D.pts[D.pts.length - 1].v) + '">' + g + '</svg>';
  const svg = el.querySelector('svg');
  const pick = function(ev){
    const r = svg.getBoundingClientRect(), cx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) / r.width * W;
    let bi = 0, bd = 1e9; D.pts.forEach(function(p, i){ const dd = Math.abs(tx(p.date) - cx); if(dd < bd){ bd = dd; bi = i; } });
    if(bi === _lcSel) return;
    _lcSel = bi; const p = D.pts[bi], x = tx(p.date).toFixed(1);
    const cur = svg.querySelector('#lc-cur'), dot = svg.querySelector('#lc-dot');
    cur.setAttribute('x1', x); cur.setAttribute('x2', x); dot.setAttribute('cx', x); dot.setAttribute('cy', ty(p.v).toFixed(1));
    _lcDetail();
  };
  svg.style.touchAction = 'pan-y';
  svg.addEventListener('pointerdown', pick); svg.addEventListener('pointermove', function(e){ if(e.buttons || e.pointerType === 'mouse') pick(e); });
}
function _lcDetail(){
  const el = document.getElementById('lc-detail'), D = _lcData; if(!el || !D || _lcSel == null || !D.pts[_lcSel]) { if(el) el.innerHTML = ''; return; }
  const p = D.pts[_lcSel], prev = _lcSel > 0 ? D.pts[_lcSel - 1] : null, d = prev ? Math.round((p.v - prev.v) * 10) / 10 : null;
  const isToday = p.date === D.today;
  const eq = typeof PR_RACE_M !== 'undefined' ? ['5 km', '10 km', 'Semi-marathon', 'Marathon'].filter(function(c){ return PR_RACE_M[c]; }).map(function(c){ return '<div><span>' + (c === 'Semi-marathon' ? 'Semi' : c) + '</span><b>' + prTime(raceTimeFromVdot(p.v, PR_RACE_M[c])) + '</b></div>'; }).join('') : '';
  el.innerHTML = '<div class="lc-card"><div class="lc-dh"><div><p class="lc-dd">' + (isToday ? 'Aujourd\'hui' : (function(t){ return t.charAt(0).toUpperCase() + t.slice(1); })(prFmtDate(p.date, { weekday: 'long', day: 'numeric', month: 'long' }))) + '</p>'
    + '<p class="lc-dv">' + _bsV(p.v) + (d != null && Math.abs(d) >= 0.1 ? '<span class="bs-chip ' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '▲ +' : '▼ −') + _bsV(Math.abs(d)) + '</span>' : '') + '</p></div>'
    + '<p class="lc-hint">Touche la courbe pour voir une autre date</p></div>'
    + (p.why.length ? '<p class="lc-sec">Ce qui fait ce niveau</p><ul class="lc-why">' + p.why.map(function(w){ return '<li><span>' + prEsc(w.t) + '</span><b class="' + (w.base ? '' : w.d > 0 ? 'up' : 'down') + '">' + (w.base ? _bsV(w.v) : (w.d > 0 ? '+' : '−') + _bsV(Math.abs(w.d))) + '</b></li>'; }).join('') + '</ul>' : '')
    + (eq ? '<p class="lc-sec">Temps équivalents à ce niveau</p><div class="lc-eq">' + eq + '</div>' : '') + '</div>';
}
function openPaceChart(zone, range){
  _bsCss(); _paZone = zone || _paZone; _paRange = range || _paRange;
  let ov = document.getElementById('bs-pa');
  if(!ov){
    const mc = document.getElementById('modal-container'); ov = document.createElement('div');
    ov.className = 'modal-overlay'; ov.id = 'bs-pa'; ov.style.zIndex = '740'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.5)');
    ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
    mc.appendChild(ov);
  }
  _paData = bsPaceSeries(_paZone, _paRange); _paSel = _paData && _paData.pts.length ? _paData.pts.length - 1 : null;
  const D = _paData, Z = BS_PACE_Z[_paZone];
  const zs = Object.keys(BS_PACE_Z).map(function(k){ return '<button type="button" class="' + (k === _paZone ? 'on' : '') + '" onclick="openPaceChart(\'' + k + '\')">' + BS_PACE_Z[k].t + '</button>'; }).join('');
  const rs = Object.keys(BS_PACE_RANGE).map(function(k){ return '<button type="button" class="' + (k === _paRange ? 'on' : '') + '" onclick="openPaceChart(null,\'' + k + '\')">' + BS_PACE_RANGE[k][2] + '</button>'; }).join('');
  // résumé : allure au début de la période → aujourd'hui, écart en s/km (plus rapide = progrès)
  let sum = '';
  if(D && D.last){
    const dv = D.delta, chip = dv == null || Math.abs(dv) < 2 ? '<span class="bs-chip">stable</span>'
      : '<span class="bs-chip ' + (dv < 0 ? 'up' : 'down') + '">' + (dv < 0 ? '▲ ' : '▼ ') + Math.abs(dv) + ' s/km ' + (dv < 0 ? 'plus rapide' : 'plus lente') + '</span>';
    const when = D.last.date === D.today ? 'aujourd\'hui' : 'au ' + prFmtDate(D.last.date);
    sum = '<div class="pa-sum"><div><p class="pa-l">' + (D.race ? Z.l + ' · projection ' + when : Z.l + ' · ' + when) + '</p><p class="pa-v">' + _bsP(D.last.v) + '<small>/km</small>' + (D.last.t ? '<small class="pa-t">' + prTime(D.last.t) + '</small>' : '') + '</p></div>'
      + '<div class="pa-r">' + chip + (D.first && D.first !== D.last ? '<p class="pa-l">' + _bsP(D.first.v) + ' le ' + prFmtDate(D.first.date) + '</p>' : '') + '</div></div>'
      + (D.record ? '<p class="pa-rec">🏆 Record ' + prTime(D.record.sec) + ' · ' + _bsP(D.record.sec / (PR_RACE_M[D.race] / 1000)) + '/km' + (D.record.date ? ' · ' + prFmtDate(D.record.date, { day: 'numeric', month: 'short', year: 'numeric' }) : '') + '</p>' : '');
  }
  ov.innerHTML = '<div class="modal-box" style="max-height:94vh;"><div class="lc-head" style="background:linear-gradient(135deg,#065F46,#0EA5E9);"><div><p class="lc-eb">Signaux du corps</p><p class="lc-title">📈 Évolution de mes allures</p><p class="lc-sub">' + (_paZone === 'ef' ? 'Allure EF réelle (sur plat, au frais, FC ≤ ' + hrEfMax() + ')' : Z.race ? 'Allure ' + Z.l + ' : tes courses réelles et la projection d\'après ton niveau' : 'Allure ' + Z.l.toLowerCase() + ' d\'après ton niveau à chaque date') + '</p></div>'
    + '<button class="lc-x" onclick="document.getElementById(\'bs-pa\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body" style="background:#F5F7FB;"><div class="lc-body"><div class="lc-seg pa4 pa-z">' + zs + '</div><div class="lc-seg pa4">' + rs + '</div>' + sum
    + '<div class="lc-chart" id="pa-chart"></div><p class="lc-leg"><span><i class="pl" style="background:' + Z.c + '"></i>' + (_paZone === 'ef' ? 'allure EF réelle' : Z.race ? 'projection' : 'allure de la zone') + '</span><span><i class="pd' + (Z.race ? ' rc' : '') + '" style="border-color:' + Z.c + ';color:' + Z.c + '"></i>' + (_paZone === 'ef' ? 'sortie EF / longue' : Z.race ? 'course réelle' : _paZone === 'vma' ? 'fractionné (blocs)' : 'tempo (blocs)') + '</span>' + (_paZone === 'ef' ? '<span><i class="pd o"></i>FC au-dessus</span>' : '') + '</p>'
    + '<div id="pa-detail"></div></div></div></div>';
  _paDraw(); _paDetail();
}
function _paDraw(){
  const el = document.getElementById('pa-chart'), D = _paData; if(!el) return;
  if(!D || (D.pts.length < 2 && D.dots.length < 2)){ el.innerHTML = '<p class="bs-n" style="padding:24px 8px;text-align:center;">Pas encore assez de séances sur cette période.</p>'; return; }
  const Z = BS_PACE_Z[D.zone], W = 340, H = 230, L = 36, R = 10, T = 12, B = 26;
  const t0 = Date.parse(D.from + 'T12:00:00Z'), t1 = Date.parse(D.today + 'T12:00:00Z'), tx = function(d){ return L + (Date.parse(d + 'T12:00:00Z') - t0) / Math.max(1, t1 - t0) * (W - L - R); };
  // échelle : lignes + points, valeurs extrêmes des points coupées (5 %) pour ne pas écraser la courbe
  const dv = D.dots.map(function(p){ return p.v; }).sort(function(a, b){ return a - b; }), cut = Math.floor(dv.length * 0.05);
  const vs = D.pts.map(function(p){ return p.v; }).concat(dv.slice(cut, dv.length - cut));
  let v0 = Math.min.apply(null, vs), v1 = Math.max.apply(null, vs);
  const pad = Math.max(8, (v1 - v0) * 0.12); v0 = Math.floor((v0 - pad) / 5) * 5; v1 = Math.ceil((v1 + pad) / 5) * 5;
  // plus rapide en haut
  const ty = function(v){ return T + (Math.min(v1, Math.max(v0, v)) - v0) / Math.max(1, v1 - v0) * (H - T - B); };
  const stepY = [5, 10, 15, 20, 30, 60].filter(function(s){ return (v1 - v0) / s <= 6; })[0] || 60;
  let g = '';
  for(let v = Math.ceil(v0 / stepY) * stepY; v <= v1; v += stepY) g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + ty(v) + '" y2="' + ty(v) + '" class="lc-grid"/><text x="' + (L - 5) + '" y="' + (ty(v) + 3.5) + '" class="lc-ax" text-anchor="end">' + _bsP(v) + '</text>';
  const m = new Date(D.from + 'T12:00:00Z'); m.setUTCDate(1); m.setUTCMonth(m.getUTCMonth() + 1);
  const months = []; while(m.getTime() <= t1){ months.push(new Date(m)); m.setUTCMonth(m.getUTCMonth() + 1); }
  const every = Math.ceil(months.length / 6), xEnd = W - R;
  g += '<text x="' + L + '" y="' + (H - B + 14) + '" class="lc-ax" text-anchor="start">' + prFmtDate(D.from) + '</text><text x="' + xEnd + '" y="' + (H - B + 14) + '" class="lc-ax" text-anchor="end">auj.</text>';
  months.forEach(function(d, i){ if(i % every) return; const iso = d.toISOString().slice(0, 10), x = tx(iso);
    if(x - L < 34 || xEnd - x < 26) return;
    g += '<line x1="' + x + '" x2="' + x + '" y1="' + T + '" y2="' + (H - B) + '" class="lc-grid v"/><text x="' + x + '" y="' + (H - B + 14) + '" class="lc-ax" text-anchor="middle">' + d.toLocaleDateString('fr-FR', { month: 'short' }) + '</text>'; });
  if(D.pts.length >= 2){
    const line = D.pts.map(function(p){ return tx(p.date).toFixed(1) + ',' + ty(p.v).toFixed(1); }).join(' ');
    g += '<polyline points="' + line + '" fill="none" stroke="' + Z.c + '" stroke-width="2.6"' + (D.race ? ' stroke-dasharray="6 4"' : '') + ' stroke-linejoin="round" stroke-linecap="round"/>';
  }
  D.dots.forEach(function(p){ if(p.date < D.from) return;
    if(p.race){ const x = tx(p.date), y = ty(p.v);
      g += '<rect x="' + (x - 5).toFixed(1) + '" y="' + (y - 5).toFixed(1) + '" width="10" height="10" rx="2" transform="rotate(45 ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')" fill="' + Z.c + '" stroke="#fff" stroke-width="1.5"><title>' + prEsc(p.title) + ' · ' + prFmtDate(p.date) + ' · ' + prTime(p.t) + ' (' + _bsP(p.v) + '/km)</title></rect>'; return; }
    g += '<circle cx="' + tx(p.date).toFixed(1) + '" cy="' + ty(p.v).toFixed(1) + '" r="3" fill="' + (p.ok ? Z.c : '#fff') + '" fill-opacity="' + (p.ok ? '.35' : '1') + '" stroke="' + (p.ok ? Z.c : '#94A3B8') + '" stroke-width="1.2"><title>' + prEsc(p.title) + ' · ' + prFmtDate(p.date) + ' · ' + _bsP(p.v) + '/km</title></circle>'; });
  const sp = _paSel != null ? D.pts[_paSel] : null;
  if(sp) g += '<line id="pa-cur" x1="' + tx(sp.date) + '" x2="' + tx(sp.date) + '" y1="' + T + '" y2="' + (H - B) + '" class="lc-cur"/><circle id="pa-dot" cx="' + tx(sp.date) + '" cy="' + ty(sp.v) + '" r="5" fill="#fff" stroke="' + Z.c + '" stroke-width="2.5"/>';
  el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="lc-svg" role="img" aria-label="Allure ' + Z.l + (D.first && D.last ? ' : de ' + _bsP(D.first.v) + ' à ' + _bsP(D.last.v) + ' par km' : '') + '">' + g + '</svg>';
  if(!sp) return;
  const svg = el.querySelector('svg');
  const pick = function(ev){
    const r = svg.getBoundingClientRect(), cx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) / r.width * W;
    let bi = 0, bd = 1e9; D.pts.forEach(function(p, i){ const dd = Math.abs(tx(p.date) - cx); if(dd < bd){ bd = dd; bi = i; } });
    if(bi === _paSel) return;
    _paSel = bi; const p = D.pts[bi], x = tx(p.date).toFixed(1);
    const cur = svg.querySelector('#pa-cur'), dot = svg.querySelector('#pa-dot');
    cur.setAttribute('x1', x); cur.setAttribute('x2', x); dot.setAttribute('cx', x); dot.setAttribute('cy', ty(p.v).toFixed(1));
    _paDetail();
  };
  svg.style.touchAction = 'pan-y';
  svg.addEventListener('pointerdown', pick); svg.addEventListener('pointermove', function(e){ if(e.buttons || e.pointerType === 'mouse') pick(e); });
}
function _paDetail(){
  const el = document.getElementById('pa-detail'), D = _paData; if(!el) return;
  if(!D || _paSel == null || !D.pts[_paSel]){ el.innerHTML = ''; return; }
  const p = D.pts[_paSel], Z = BS_PACE_Z[D.zone], isToday = p.date === D.today;
  // séances autour de la date choisie (les 3 plus proches, 3 semaines avant au plus)
  const near = D.dots.filter(function(x){ return x.date <= p.date && prDays(x.date, p.date) <= (D.race ? 400 : 21); }).slice(-3).reverse();
  const dd = D.first && D.first !== p ? p.v - D.first.v : null;
  el.innerHTML = '<div class="lc-card"><div class="lc-dh"><div><p class="lc-dd">' + (isToday ? 'Aujourd\'hui' : prFmtDate(p.date, { weekday: 'short', day: 'numeric', month: 'long' })) + '</p>'
    + '<p class="lc-dv">' + _bsP(p.v) + '<small style="font-size:13px;color:#64748B;font-weight:700;">/km</small>' + (dd != null && Math.abs(dd) >= 2 ? '<span class="bs-chip ' + (dd < 0 ? 'up' : 'down') + '">' + (dd < 0 ? '▲ −' : '▼ +') + Math.abs(dd) + ' s</span>' : '') + '</p></div>'
    + '<p class="lc-hint">Touche la courbe pour voir une autre date</p></div>'
    + (p.t ? '<p class="bs-n">Projection ' + Z.l + ' : <b>' + prTime(p.t) + '</b> · niveau ' + _bsV(p.vdot) + '</p>' : p.vdot ? '<p class="bs-n">Niveau ' + _bsV(p.vdot) + ' à cette date</p>' : p.n ? '<p class="bs-n">Médiane de ' + p.n + ' sorties à FC ≤ ' + hrEfMax() + '</p>' : '')
    + (near.length ? '<p class="lc-sec">' + (D.race ? 'Tes courses avant cette date' : 'Séances juste avant') + '</p><ul class="lc-why">' + near.map(function(x){ return '<li><span>' + prFmtDate(x.date, x.race ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' }) + ' · ' + prEsc(x.title) + (x.t ? ' · ' + prTime(x.t) : '') + (x.hr ? ' · ' + x.hr + ' bpm' : '') + '</span><b' + (x.ok ? '' : ' style="color:#94A3B8"') + '>' + _bsP(x.v) + '</b></li>'; }).join('') + '</ul>' : '')
    + '</div>';
}
