// Images à partager — dessin, fenêtres, partage (à la demande : groupe « share », points d'entrée dans config.js) — sortis de
// week-share.js ; les données (weekShareData, sessionShareData, wsPickWeek…) restent dans week-share.js.
function wsDraw(D){
  const c = document.createElement('canvas'); c.width = WS_W; c.height = WS_H;
  const g = c.getContext('2d'), F = 'system-ui, -apple-system, "SF Pro Display", "Segoe UI", Roboto, sans-serif';
  const P = D.mode === 'plan', A1 = P ? '#FBBF24' : '#34D399', A2 = P ? '#F472B6' : '#818CF8', M = 72;
  const sp = function(px){ try { g.letterSpacing = px + 'px'; } catch(e) {} };
  const txt = function(t, x, y, size, col, w, align, ls){ sp(ls || 0); g.font = (w || 600) + ' ' + size + 'px ' + F; g.fillStyle = col; g.textAlign = align || 'left'; g.fillText(t, x, y); sp(0); };
  const fit = function(t, size, w, max){ t = String(t || ''); g.font = w + ' ' + size + 'px ' + F; while(g.measureText(t).width > max && t.length > 4) t = t.slice(0, -2) + '…'; return t; };
  const width = function(t, size, w, ls){ sp(ls || 0); g.font = w + ' ' + size + 'px ' + F; const v = g.measureText(t).width; sp(0); return v; };
  const grad = function(x0, y0, x1, y1){ const q = g.createLinearGradient(x0, y0, x1, y1); q.addColorStop(0, A1); q.addColorStop(1, A2); return q; };
  const fmtD = function(d){ return d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''; };
  const col = function(t){ return WS_TYPE_COL[t] || '#CBD5E1'; };
  const alpha = function(hex, a){ const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; };
  // ── fond : dégradé nuit, halos du mode, lignes de niveau (comme une carte de parcours)
  const bg = g.createLinearGradient(0, 0, WS_W * 0.35, WS_H); bg.addColorStop(0, '#070D24'); bg.addColorStop(0.5, '#121A44'); bg.addColorStop(1, '#1D1240'); g.fillStyle = bg; g.fillRect(0, 0, WS_W, WS_H);
  const halo = function(x, y, r, hex, a){ const h = g.createRadialGradient(x, y, 10, x, y, r); h.addColorStop(0, alpha(hex, a)); h.addColorStop(1, alpha(hex, 0)); g.fillStyle = h; g.fillRect(0, 0, WS_W, WS_H); };
  halo(980, 260, 700, A2, 0.30); halo(60, 1500, 760, A1, 0.18); halo(1000, 1850, 520, A2, 0.12);
  const seed = (D.w || 1) * 1.7 + (P ? 3.1 : 0);
  g.lineWidth = 2;
  for(let i = 0; i < 22; i++){
    const y0 = -60 + i * 92, ph = seed + i * 0.83, amp = 26 + (i % 5) * 9;
    g.strokeStyle = 'rgba(255,255,255,' + (i % 4 === 0 ? 0.075 : 0.04) + ')'; g.beginPath();
    for(let x = -20; x <= WS_W + 20; x += 18){ const y = y0 + amp * Math.sin(x / 210 + ph) + 18 * Math.sin(x / 83 + ph * 1.9) + 10 * Math.sin(x / 41 + i); if(x === -20) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
  }
  // ── en-tête : pastilles semaine + mode
  const pill = function(t, x, y, fill, stroke, color, align){ const w = width(t, 26, 800, 3) + 44; const x0 = align === 'right' ? x - w : x;
    g.fillStyle = fill; _wsRound(g, x0, y, w, 54, 27); g.fill(); if(stroke){ g.strokeStyle = stroke; g.lineWidth = 2; _wsRound(g, x0 + 1, y + 1, w - 2, 52, 26); g.stroke(); }
    txt(t, x0 + w / 2, y + 37, 26, color, 800, 'center', 3); return w; };
  pill(('Semaine ' + D.w + (D.total ? ' / ' + D.total : '')).toUpperCase(), M, 120, 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.18)', '#E2E8F0');
  const full = D.nDone >= D.nPlan && D.nPlan;
  pill(P ? (D.now ? 'CETTE SEMAINE' : 'À VENIR') : full ? '✓ BOUCLÉE' : D.now ? 'EN COURS' : '✓ RÉALISÉE', WS_W - M, 120, grad(WS_W - 360, 0, WS_W - M, 0), null, '#0B1020', 'right');
  if(D.prep) txt(fit(D.prep.toUpperCase(), 26, 700, 936), M, 252, 26, 'rgba(255,255,255,0.55)', 700, 'left', 4);
  const title = P ? 'Au programme' : D.nDone >= D.nPlan && D.nPlan ? 'Semaine bouclée' : 'Ma semaine';
  txt(title, M, 330, 68, '#FFFFFF', 900);
  txt([D.who, fmtD(D.from) + ' – ' + fmtD(D.to), D.kind].filter(Boolean).join('  ·  '), M + 2, 386, 32, 'rgba(255,255,255,0.72)', 600);
  // ── héros : km en dégradé + anneau
  const big = _wsKm(P ? D.kmPlan : D.kmDone), bigW = Math.min(560, width(big, 220, 900));
  g.save(); g.font = '900 220px ' + F; g.textAlign = 'left'; g.fillStyle = grad(M, 450, M + bigW, 650); g.shadowColor = alpha(A2, 0.45); g.shadowBlur = 40; g.fillText(big, M - 4, 640); g.restore();
  txt('km', M + bigW + 14, 640, 64, 'rgba(255,255,255,0.9)', 800);
  txt(P ? 'prévus cette semaine' : 'sur ' + _wsKm(D.kmPlan) + ' km prévus', M + 2, 700, 34, 'rgba(255,255,255,0.75)', 600);
  const cx = 846, cy = 560, R = 122;
  g.lineCap = 'round'; g.lineWidth = 26; g.strokeStyle = 'rgba(255,255,255,0.09)'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  if(!P){
    const pct = Math.max(0, Math.min(1, D.pct || 0));
    if(pct > 0){ g.save(); g.strokeStyle = grad(cx - R, cy - R, cx + R, cy + R); g.shadowColor = alpha(A1, 0.6); g.shadowBlur = 24; g.beginPath(); g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, pct)); g.stroke(); g.restore(); }
    txt(Math.round((D.pct || 0) * 100) + '%', cx, cy + 14, 60, '#FFFFFF', 900, 'center');
    txt(D.nDone + '/' + D.nPlan + ' séances', cx, cy + 56, 24, 'rgba(255,255,255,0.65)', 700, 'center');
  } else {
    const tot = D.sessions.reduce(function(a, s){ return a + (s.km || 0); }, 0) || 1; let a0 = -Math.PI / 2;
    D.sessions.forEach(function(s){ const da = Math.PI * 2 * (s.km || 0) / tot; g.strokeStyle = col(s.type); g.lineCap = 'butt'; g.beginPath(); g.arc(cx, cy, R, a0 + 0.05, a0 + da - 0.05); g.stroke(); a0 += da; });
    g.lineCap = 'round';
    txt(String(D.nPlan), cx, cy + 18, 72, '#FFFFFF', 900, 'center');
    txt(D.nPlan > 1 ? 'séances' : 'séance', cx, cy + 58, 24, 'rgba(255,255,255,0.65)', 700, 'center');
  }
  g.lineCap = 'butt';
  // ── jours : barres aux couleurs des séances (faite = pleine, prévue = pointillés)
  txt('PAR JOUR', M, 800, 24, 'rgba(255,255,255,0.5)', 800, 'left', 4);
  const base = 1080, maxH = 210, colW = (WS_W - 2 * M) / 7, mx = Math.max.apply(null, D.days.map(function(d){ return Math.max(d.km || 0, d.plan || 0); }).concat([1]));
  D.days.forEach(function(d, i){
    const w = 66, x = M + i * colW + (colW - w) / 2, tc = col(d.type);
    g.fillStyle = 'rgba(255,255,255,0.05)'; _wsRound(g, x, base - maxH, w, maxH, 33); g.fill();
    const showDone = !P && d.km > 0, showPlan = (P ? d.km > 0 : !d.km && d.plan > 0);
    if(showDone){ const h = Math.max(40, d.km / mx * maxH), q = g.createLinearGradient(0, base - h, 0, base); q.addColorStop(0, tc); q.addColorStop(1, alpha(tc, 0.55));
      g.save(); g.shadowColor = alpha(tc, 0.55); g.shadowBlur = 22; g.fillStyle = q; _wsRound(g, x, base - h, w, h, 33); g.fill(); g.restore();
      txt(_wsKm(d.km), x + w / 2, base - h - 16, 30, '#FFFFFF', 800, 'center'); }
    if(showPlan){ const v = P ? d.km : d.plan, h = Math.max(40, v / mx * maxH);
      g.fillStyle = alpha(tc, 0.16); _wsRound(g, x, base - h, w, h, 33); g.fill();
      g.strokeStyle = tc; g.lineWidth = 4; g.setLineDash([12, 9]); _wsRound(g, x + 2, base - h + 2, w - 4, h - 4, 31); g.stroke(); g.setLineDash([]);
      txt(_wsKm(v), x + w / 2, base - h - 16, 30, P ? '#FFFFFF' : 'rgba(255,255,255,0.5)', 800, 'center'); }
    txt(d.l, x + w / 2, base + 50, 30, d.today ? '#FFFFFF' : 'rgba(255,255,255,0.55)', 800, 'center');
    if(d.today){ g.fillStyle = A1; g.beginPath(); g.arc(x + w / 2, base + 70, 5, 0, Math.PI * 2); g.fill(); }
  });
  // ── séances en cartes (4 au plus), séance phare marquée
  const list = D.sessions.slice(0, 4); let y = 1196 + (4 - list.length) * 40;
  list.forEach(function(s){
    const h = 94, tc = col(s.type), on = P || s.done || !!(D.today && s.date && s.date >= D.today);
    g.fillStyle = s.star ? alpha(A2, 0.14) : 'rgba(255,255,255,0.06)'; _wsRound(g, M, y, WS_W - 2 * M, h, 26); g.fill();
    if(s.star){ g.strokeStyle = alpha(A2, 0.7); g.lineWidth = 2.5; _wsRound(g, M + 1, y + 1, WS_W - 2 * M - 2, h - 2, 25); g.stroke(); }
    g.fillStyle = on ? tc : alpha(tc, 0.35); _wsRound(g, M + 16, y + 20, 8, h - 40, 4); g.fill();
    const chip = WS_TYPE_NAME[s.type] || 'Run', cw = width(chip, 22, 800, 1) + 26;
    g.fillStyle = alpha(tc, on ? 0.22 : 0.1); _wsRound(g, M + 44, y + 16, cw, 34, 17); g.fill(); txt(chip, M + 44 + cw / 2, y + 40, 22, on ? tc : alpha(tc, 0.6), 800, 'center', 1);
    const kmT = _wsKm(s.km) + ' km', kmW = width(kmT, 40, 900);
    txt((s.star ? '★ ' : '') + fit(s.title, 34, 800, WS_W - 2 * M - 44 - cw - 30 - kmW - 40), M + 44 + cw + 16, y + 44, 34, on ? '#FFFFFF' : 'rgba(255,255,255,0.45)', 800);
    const meta = P ? [s.when, s.pace].filter(Boolean).join('  ·  ') : s.done ? ['✓ ' + (s.when || ''), s.sec ? _wsDur(s.sec, true) : '', s.pace ? s.pace + ' /km' : ''].filter(Boolean).join('  ·  ') : (s.when ? s.when + '  ·  ' : '') + (D.today && s.date && s.date >= D.today ? 'à venir' : 'non faite');
    txt(fit(meta, 26, 600, WS_W - 2 * M - 44 - kmW - 60), M + 44, y + 80, 26, on ? 'rgba(255,255,255,0.68)' : 'rgba(255,255,255,0.38)', 600);
    txt(kmT, WS_W - M - 26, y + 60, 40, on ? '#FFFFFF' : 'rgba(255,255,255,0.4)', 900, 'right');
    y += h + 14;
  });
  if(D.sessions.length > 4) txt('+ ' + (D.sessions.length - 4) + ' autre' + (D.sessions.length > 5 ? 's' : ''), WS_W / 2, y + 24, 26, 'rgba(255,255,255,0.55)', 700, 'center');
  // ── pastilles
  const chips = [];
  if(P){ if(D.sec) chips.push('⏱ ~' + _wsDur(D.sec)); if(D.longest) chips.push('↗ ' + _wsKm(D.longest) + ' km max'); }
  else { if(D.streak) chips.push('🔥 ' + D.streak + ' d\'affilée'); if(D.form != null) chips.push('💪 forme ' + D.form); if(D.sec) chips.push('⏱ ' + _wsDur(D.sec)); }
  if(chips.length){
    const ws = chips.map(function(t){ return width(t, 26, 700) + 44; }), gap = 14, tot = ws.reduce(function(a, b){ return a + b; }, 0) + gap * (ws.length - 1);
    let x = Math.max(M, (WS_W - tot) / 2); const cy2 = 1648;
    chips.forEach(function(t, i){ g.fillStyle = 'rgba(255,255,255,0.08)'; _wsRound(g, x, cy2, ws[i], 58, 29); g.fill(); txt(t, x + ws[i] / 2, cy2 + 39, 26, 'rgba(255,255,255,0.9)', 700, 'center'); x += ws[i] + gap; });
  }
  // ── course : compte à rebours + avancement de la prépa
  if(D.race){
    const top = 1732, h = 128;
    g.fillStyle = 'rgba(255,255,255,0.07)'; _wsRound(g, M, top, WS_W - 2 * M, h, 32); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2; _wsRound(g, M + 1, top + 1, WS_W - 2 * M - 2, h - 2, 31); g.stroke();
    const jx = D.race.days === 0 ? 'Jour J' : 'J-' + D.race.days, jw = width(jx, 76, 900);
    g.save(); g.font = '900 76px ' + F; g.textAlign = 'left'; g.fillStyle = grad(M + 30, top, M + 30 + jw, top + h); g.fillText(jx, M + 32, top + 90); g.restore();
    const rx = M + 32 + jw + 34, rw = WS_W - M - 32 - rx;
    txt(fit(D.race.name, 32, 800, rw), rx, top + 52, 32, '#FFFFFF', 800);
    txt(fit([D.goal ? 'objectif ' + D.goal : '', D.total ? 'sem. ' + D.w + ' / ' + D.total : ''].filter(Boolean).join('  ·  '), 24, 600, rw), rx, top + 86, 24, 'rgba(255,255,255,0.65)', 600);
    if(D.total){ const n = D.total, gw = 6, sw = (rw - gw * (n - 1)) / n;
      for(let k = 1; k <= n; k++){ g.fillStyle = k < D.w ? alpha(A1, 0.85) : k === D.w ? A2 : 'rgba(255,255,255,0.14)'; _wsRound(g, rx + (k - 1) * (sw + gw), top + 100, sw, 8, 4); g.fill(); } }
  }
  txt((typeof planBrand === 'function' ? planBrand() : 'Plan course').toUpperCase(), WS_W / 2, 1896, 22, 'rgba(255,255,255,0.4)', 800, 'center', 5);
  return c;
}
function _wsRound(g, x, y, w, h, r){ r = Math.min(r, h / 2, w / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
// fenêtre : la semaine EN COURS d'abord ; ‹ › pour les semaines précédentes et à venir (w = semaine voulue, sinon en cours)
function openWeekShare(w){
  _wsCss();
  const today = prTodayIso(), L = wsWeekList(today);
  const cur = wsCurrentWeek(today);
  let target = w != null && L.indexOf(+w) >= 0 ? +w : cur;
  if(target == null || !wsDataFor(target, today)){ if(typeof showToast === 'function') showToast('Aucune semaine à partager pour l\'instant', '📸'); return; }
  _wsNav = { list: L, i: L.indexOf(target), cur: cur, today: today };
  _wsSet(wsDataFor(target, today));
  const D = _wsData;
  const old = document.getElementById('ws-share'); if(old) old.remove();
  const mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'ws-share'; ov.style.zIndex = '740'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.6)');
  const can = _wsCanShare(), ios = _wsIos();
  const nav = '<div class="ws-nav"><button type="button" class="ws-arr" data-d="-1" onclick="wsGo(-1)" aria-label="Semaine précédente">‹</button>'
    + '<div class="ws-lbl" aria-live="polite"><b></b><span></span></div>'
    + '<button type="button" class="ws-arr" data-d="1" onclick="wsGo(1)" aria-label="Semaine suivante">›</button></div>';
  ov.innerHTML = '<div class="modal-box" style="max-height:94vh;"><div class="ws-head">' + nav + '<button class="ws-x" onclick="document.getElementById(\'ws-share\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body" style="background:#0F172A;"><div style="padding:14px 16px 22px;display:flex;flex-direction:column;gap:12px;align-items:center;">'
    + '<img class="ws-img" alt="' + _wsAlt(D) + '" src="' + _wsUrl + '">'
    + '<button type="button" class="ws-today" onclick="wsGoCurrent()" hidden>↩ Semaine en cours</button>'
    + '<div class="ws-btns">' + (can ? '<button class="ws-b main" onclick="wsShare()">Partager</button>' : '') + '<button class="ws-b' + (can ? '' : ' main') + '" onclick="wsDownload()">' + (ios ? 'Enregistrer' : 'Télécharger') + '</button></div>'
    + (ios ? '<p class="ws-n">Ou appui long sur l\'image › « Enregistrer dans Photos »</p>' : '')
    + '<p class="ws-n">Pour ta famille, tes amis ou ton club : l\'image ne contient ni ta position ni tes données de santé détaillées.</p></div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  mc.appendChild(ov);
  _wsNavRender();
}
function _wsAlt(D){ return D.mode === 'plan' ? 'Semaine ' + D.w + (D.now ? ' en cours' : ' à venir') + ' : ' + D.kmPlan + ' km prévus' : 'Récapitulatif de la semaine ' + D.w + ' : ' + D.kmDone + ' km sur ' + D.kmPlan + ' prévus'; }
function _wsSet(D){ _wsData = D; _wsCanvas = wsDraw(D); _wsUrl = _wsCanvas.toDataURL('image/png'); _wsFile = _wsFileOf(_wsUrl); }
// libellé « Semaine 2 · en cours · 2 – 8 nov. », flèches grisées aux bouts, retour à la semaine en cours
function _wsNavRender(){
  const ov = document.getElementById('ws-share'); if(!ov || !_wsNav || !_wsData) return;
  const D = _wsData, w = _wsNav.list[_wsNav.i];
  const fmt = function(d){ return d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).replace('.', '') : ''; };
  const st = w === _wsNav.cur ? 'en cours' : w < _wsNav.cur ? (D.nDone >= D.nPlan && D.nPlan ? 'bouclée' : 'faite') : 'à venir';
  ov.querySelector('.ws-lbl b').textContent = 'Semaine ' + w;
  ov.querySelector('.ws-lbl span').textContent = st + (D.from ? ' · ' + fmt(D.from) + ' – ' + fmt(D.to) : '');
  ov.querySelector('.ws-lbl').className = 'ws-lbl' + (w === _wsNav.cur ? ' cur' : '');
  ov.querySelector('.ws-arr[data-d="-1"]').disabled = _wsNav.i <= 0;
  ov.querySelector('.ws-arr[data-d="1"]').disabled = _wsNav.i >= _wsNav.list.length - 1;
  const b = ov.querySelector('.ws-today'); if(b) b.hidden = w === _wsNav.cur;
  const im = ov.querySelector('.ws-img'); if(im){ im.src = _wsUrl; im.alt = _wsAlt(D); }
}
// semaine précédente (-1) / suivante (+1) : nouvelle image, mêmes boutons
function wsGo(d){
  if(!_wsNav) return;
  let i = _wsNav.i + d;
  while(i >= 0 && i < _wsNav.list.length && !wsDataFor(_wsNav.list[i], _wsNav.today)) i += d;
  if(i < 0 || i >= _wsNav.list.length) return;
  _wsNav.i = i; _wsSet(wsDataFor(_wsNav.list[i], _wsNav.today)); _wsNavRender();
}
function wsGoCurrent(){ if(!_wsNav) return; const i = _wsNav.list.indexOf(_wsNav.cur); if(i < 0) return; _wsNav.i = i; _wsSet(wsDataFor(_wsNav.cur, _wsNav.today)); _wsNavRender(); }
function _wsName(){ return 'semaine-' + (_wsData ? _wsData.w : '') + (_wsData && _wsData.mode === 'plan' && !_wsData.now ? '-a-venir' : '') + '.png'; }
// image → fichier, sans attente (data URL décodée sur place)
function _wsFileOf(url, name){
  try {
    const bin = atob(String(url).split(',')[1] || ''), u = new Uint8Array(bin.length);
    for(let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new File([u], name || _wsName(), { type: 'image/png' });
  } catch(e) { return null; }
}
function _wsIos(){ return typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)); }
function _wsCanShare(){ try { return !!(_wsFile && navigator.share && navigator.canShare && navigator.canShare({ files: [_wsFile] })); } catch(e) { return false; } }
// Partager : appelé directement dans le toucher (iOS refuse un partage lancé après une attente)
function wsShare(){
  if(!_wsFile) return wsDownload();
  if(!_wsCanShare()) return wsDownload();
  navigator.share({ files: [_wsFile], title: 'Ma semaine', text: _wsData.mode === 'plan' ? 'Semaine ' + _wsData.w + (_wsData.now ? '' : ' à venir') + ' : ' + _wsKm(_wsData.kmPlan) + ' km au programme 🏃' : 'Semaine ' + _wsData.w + ' : ' + _wsKm(_wsData.kmDone) + ' km 🏃' })
    .catch(function(e){ if(e && e.name !== 'AbortError' && typeof showToast === 'function') showToast('Partage impossible : appui long sur l\'image pour l\'enregistrer', '📸'); });
}
// Télécharger / Enregistrer : sur iPhone, la feuille de partage (« Enregistrer l'image » → Photos) ; ailleurs, fichier téléchargé
function wsDownload(){
  if(!_wsUrl) return;
  if(_wsIos()){
    if(_wsCanShare()) return wsShare();
    if(typeof showToast === 'function') showToast('Appui long sur l\'image › « Enregistrer dans Photos »', '📸');
    return;
  }
  let href = _wsUrl, rev = null;
  try { if(_wsFile && typeof URL !== 'undefined' && URL.createObjectURL){ href = rev = URL.createObjectURL(_wsFile); } } catch(e) {}
  const a = document.createElement('a'); a.download = _wsName(); a.href = href; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
  if(rev) setTimeout(function(){ URL.revokeObjectURL(rev); }, 4000);
}
function ssDraw(D){
  const S = 1080, c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d'), F = 'system-ui, -apple-system, "SF Pro Display", "Segoe UI", Roboto, sans-serif', M = 64;
  const A1 = WS_TYPE_COL[D.type] || '#34D399', A2 = '#818CF8';
  const sp = function(px){ try { g.letterSpacing = px + 'px'; } catch(e) {} };
  const txt = function(t, x, y, size, col, w, align, ls){ sp(ls || 0); g.font = (w || 600) + ' ' + size + 'px ' + F; g.fillStyle = col; g.textAlign = align || 'left'; g.fillText(t, x, y); sp(0); };
  const fit = function(t, size, w, max){ t = String(t || ''); g.font = w + ' ' + size + 'px ' + F; while(g.measureText(t).width > max && t.length > 4) t = t.slice(0, -2) + '…'; return t; };
  const width = function(t, size, w, ls){ sp(ls || 0); g.font = w + ' ' + size + 'px ' + F; const v = g.measureText(t).width; sp(0); return v; };
  const alpha = function(hex, a){ const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; };
  const grad = function(x0, y0, x1, y1){ const q = g.createLinearGradient(x0, y0, x1, y1); q.addColorStop(0, A1); q.addColorStop(1, A2); return q; };
  const pace = function(sec){ return Math.floor(sec / 60) + "'" + String(Math.round(sec % 60)).padStart(2, '0'); };
  // fond : nuit, halos, lignes de niveau (comme la carte de la semaine)
  const bg = g.createLinearGradient(0, 0, S * 0.4, S); bg.addColorStop(0, '#070D24'); bg.addColorStop(0.55, '#121A44'); bg.addColorStop(1, '#1D1240'); g.fillStyle = bg; g.fillRect(0, 0, S, S);
  const halo = function(x, y, r, hex, a){ const h = g.createRadialGradient(x, y, 10, x, y, r); h.addColorStop(0, alpha(hex, a)); h.addColorStop(1, alpha(hex, 0)); g.fillStyle = h; g.fillRect(0, 0, S, S); };
  halo(960, 160, 560, A1, 0.26); halo(80, 980, 600, A2, 0.20);
  g.lineWidth = 2; const seed = (D.w || 1) * 2.3 + (D.km || 0);
  for(let i = 0; i < 13; i++){
    const y0 = -40 + i * 90, ph = seed + i * 0.77, amp = 22 + (i % 4) * 8;
    g.strokeStyle = 'rgba(255,255,255,' + (i % 4 === 0 ? 0.07 : 0.035) + ')'; g.beginPath();
    for(let x = -20; x <= S + 20; x += 18){ const y = y0 + amp * Math.sin(x / 200 + ph) + 14 * Math.sin(x / 79 + ph * 1.7); if(x === -20) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
  }
  // en-tête : semaine + type de séance
  const pill = function(t, x, y, fill, stroke, color, align){ const w = width(t, 24, 800, 3) + 40, x0 = align === 'right' ? x - w : x;
    g.fillStyle = fill; _wsRound(g, x0, y, w, 50, 25); g.fill(); if(stroke){ g.strokeStyle = stroke; g.lineWidth = 2; _wsRound(g, x0 + 1, y + 1, w - 2, 48, 24); g.stroke(); }
    txt(t, x0 + w / 2, y + 34, 24, color, 800, 'center', 3); };
  pill(('Semaine ' + D.w + (D.total ? ' / ' + D.total : '')).toUpperCase(), M, 60, 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.18)', '#E2E8F0');
  pill('✓ ' + (SS_TYPE_LBL[D.type] || 'SÉANCE'), S - M, 60, grad(S - 380, 0, S - M, 0), null, '#0B1020', 'right');
  if(D.prep) txt(fit(D.prep.toUpperCase(), 24, 700, S - 2 * M), M, 160, 24, 'rgba(255,255,255,0.55)', 700, 'left', 4);
  txt(fit(D.title, 62, 900, S - 2 * M), M, 230, 62, '#FFFFFF', 900);
  const dTxt = D.date ? new Date(D.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  txt(fit([D.who, dTxt].filter(Boolean).join('  ·  '), 30, 600, S - 2 * M), M + 2, 278, 30, 'rgba(255,255,255,0.72)', 600);
  if(D.detail) txt(fit('Consigne : ' + D.detail, 26, 600, S - 2 * M), M + 2, 320, 26, 'rgba(255,255,255,0.5)', 600);
  // héros : km en dégradé ; à droite durée, allure, FC (ou temps officiel d'une course)
  const big = _wsKm(D.km), bigW = Math.min(470, width(big, 190, 900));
  g.save(); g.font = '900 190px ' + F; g.textAlign = 'left'; g.fillStyle = grad(M, 360, M + bigW, 540); g.shadowColor = alpha(A1, 0.45); g.shadowBlur = 36; g.fillText(big, M - 4, 520); g.restore();
  txt('km', M + bigW + 12, 520, 56, 'rgba(255,255,255,0.9)', 800);
  const stats = [];
  if(D.official) stats.push(['TEMPS OFFICIEL', D.official]);
  if(D.dur) stats.push(['DURÉE', _wsDur(D.dur, true)]);
  if(D.pace) stats.push(['ALLURE', D.pace + ' /km']);
  if(D.hr) stats.push(['FC MOY.', D.hr + ' bpm']);
  stats.slice(0, 3).forEach(function(st, i){ const y = 400 + i * 62; txt(st[0], S - M, y - 30, 18, 'rgba(255,255,255,0.5)', 800, 'right', 3); txt(st[1], S - M, y + 4, 36, '#FFFFFF', 800, 'right'); });
  // détail : blocs (fractionné, tempo) ou allure kilomètre par kilomètre
  const top = 600, bot = 820;
  if(D.blocs.length){
    txt('BLOCS', M, top, 22, 'rgba(255,255,255,0.5)', 800, 'left', 4);
    const n = Math.min(D.blocs.length, 8), cols = n > 4 ? 4 : n, rows = Math.ceil(n / cols), gw = 14, bw = (S - 2 * M - gw * (cols - 1)) / cols, bh = rows > 1 ? 86 : 120;
    D.blocs.slice(0, 8).forEach(function(b, i){ const r = Math.floor(i / cols), k = i % cols, x = M + k * (bw + gw), y = top + 22 + r * (bh + 14);
      g.fillStyle = alpha(A1, 0.16); _wsRound(g, x, y, bw, bh, 22); g.fill(); g.strokeStyle = alpha(A1, 0.55); g.lineWidth = 2; _wsRound(g, x + 1, y + 1, bw - 2, bh - 2, 21); g.stroke();
      txt('Bloc ' + (i + 1), x + bw / 2, y + (rows > 1 ? 30 : 40), 20, 'rgba(255,255,255,0.6)', 700, 'center');
      txt(b + ' /km', x + bw / 2, y + (rows > 1 ? 68 : 88), rows > 1 ? 32 : 38, '#FFFFFF', 900, 'center'); });
  } else if(D.splits.length >= 2){
    txt('ALLURE PAR KM', M, top, 22, 'rgba(255,255,255,0.5)', 800, 'left', 4);
    const L = D.splits.slice(0, 30), n = L.length, gw = n > 20 ? 4 : 8, bw = (S - 2 * M - gw * (n - 1)) / n;
    const secs = L.map(function(x){ return x.sec; }), mn = Math.min.apply(null, secs), mx = Math.max.apply(null, secs), base = bot, hMax = 170;
    const best = secs.indexOf(mn);
    L.forEach(function(x, i){ const h = 36 + (mx > mn ? (mx - x.sec) / (mx - mn) : 0.6) * (hMax - 36), xx = M + i * (bw + gw);
      const q = g.createLinearGradient(0, base - h, 0, base); q.addColorStop(0, i === best ? A1 : alpha(A1, 0.85)); q.addColorStop(1, alpha(A2, 0.55));
      g.fillStyle = x.part ? alpha(A1, 0.3) : q; _wsRound(g, xx, base - h, bw, h, Math.min(14, bw / 2)); g.fill();
      if(n <= 12 || i === best) txt(pace(x.sec), xx + bw / 2, base - h - 12, n <= 12 ? 22 : 24, i === best ? '#FFFFFF' : 'rgba(255,255,255,0.7)', 800, 'center');
      if(n <= 15 || (i + 1) % 5 === 0) txt(String(x.km || i + 1), xx + bw / 2, base + 30, 20, 'rgba(255,255,255,0.5)', 700, 'center'); });
  } else {
    g.fillStyle = 'rgba(255,255,255,0.06)'; _wsRound(g, M, top - 20, S - 2 * M, 160, 28); g.fill();
    txt(fit(D.detail || D.title, 34, 800, S - 2 * M - 60), S / 2, top + 50, 34, '#FFFFFF', 800, 'center');
    txt(D.kmPlan ? 'prévu ' + _wsKm(D.kmPlan) + ' km · fait ' + _wsKm(D.km) + ' km' : '', S / 2, top + 100, 26, 'rgba(255,255,255,0.6)', 600, 'center');
  }
  // pastilles : météo, cadence, dénivelé (ni donnée WHOOP ni effort ressenti sur l'image)
  const chips = [];
  if(D.temp != null) chips.push('🌡 ' + D.temp + '°');
  if(D.cad) chips.push('👟 cadence ' + D.cad);
  if(D.up != null && D.up >= 20) chips.push('⛰ ' + D.up + ' m D+');
  if(chips.length){
    const L = chips.slice(0, 4), ws = L.map(function(t){ return width(t, 24, 700) + 40; }), gap = 12, tot = ws.reduce(function(a, b){ return a + b; }, 0) + gap * (L.length - 1);
    let x = Math.max(M, (S - tot) / 2); const y = 878;
    L.forEach(function(t, i){ g.fillStyle = 'rgba(255,255,255,0.08)'; _wsRound(g, x, y, ws[i], 54, 27); g.fill(); txt(t, x + ws[i] / 2, y + 36, 24, 'rgba(255,255,255,0.92)', 700, 'center'); x += ws[i] + gap; });
  }
  // pied : course visée (sans l'objectif de temps) + signature
  if(D.race) txt(fit((D.race.days === 0 ? 'Jour J' : 'J-' + D.race.days) + '  ·  ' + D.race.name, 26, 700, S - 2 * M - 260), M, 1010, 26, 'rgba(255,255,255,0.75)', 700);
  txt((typeof planBrand === 'function' ? planBrand() : 'Plan course').toUpperCase(), S - M, 1010, 22, 'rgba(255,255,255,0.42)', 800, 'right', 5);
  return c;
}
function _ssName(){ return 'seance-' + (_ssData && _ssData.date ? _ssData.date : '') + '.png'; }
function openSessionShare(key){
  _wsCss();
  const D = sessionShareData(key);
  if(!D){ if(typeof showToast === 'function') showToast('Valide la séance pour créer son image', '📸'); return; }
  _ssData = D; _ssUrl = ssDraw(D).toDataURL('image/png'); _ssFile = _wsFileOf(_ssUrl, _ssName());
  const old = document.getElementById('ss-share'); if(old) old.remove();
  const off = document.getElementById('ss-offer'); if(off) off.remove();
  const can = (function(){ try { return !!(_ssFile && navigator.share && navigator.canShare && navigator.canShare({ files: [_ssFile] })); } catch(e) { return false; } })(), ios = _wsIos();
  const mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'ss-share'; ov.style.zIndex = '760'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.6)');
  const dTxt = D.date ? new Date(D.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
  ov.innerHTML = '<div class="modal-box" style="max-height:94vh;"><div class="ws-head"><div class="ws-lbl" style="align-items:flex-start;"><b>📸 Ta séance en image</b><span>' + prEsc(D.title) + (dTxt ? ' · ' + prEsc(dTxt) : '') + '</span></div>'
    + '<button class="ws-x" onclick="document.getElementById(\'ss-share\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body" style="background:#0F172A;"><div style="padding:14px 16px 22px;display:flex;flex-direction:column;gap:12px;align-items:center;">'
    + '<img class="ss-img" alt="' + prEsc(D.title + ' : ' + _wsKm(D.km) + ' km' + (D.pace ? ' à ' + D.pace + ' /km' : '')) + '" src="' + _ssUrl + '">'
    + '<div class="ws-btns">' + (can ? '<button class="ws-b main" onclick="ssShare()">Partager</button>' : '') + '<button class="ws-b' + (can ? '' : ' main') + '" onclick="ssDownload()">' + (ios ? 'Enregistrer' : 'Télécharger') + '</button></div>'
    + '<p class="ws-n">Format carré, prêt pour Strava' + (ios ? ' · ou appui long sur l\'image › « Enregistrer dans Photos »' : '') + '</p></div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  mc.appendChild(ov);
}
function ssShare(){
  const ok = (function(){ try { return !!(_ssFile && navigator.share && navigator.canShare && navigator.canShare({ files: [_ssFile] })); } catch(e) { return false; } })();
  if(!ok) return ssDownload();
  navigator.share({ files: [_ssFile], title: _ssData.title, text: _ssData.title + ' : ' + _wsKm(_ssData.km) + ' km 🏃' })
    .catch(function(e){ if(e && e.name !== 'AbortError' && typeof showToast === 'function') showToast('Partage impossible : appui long sur l\'image pour l\'enregistrer', '📸'); });
}
function ssDownload(){
  if(!_ssUrl) return;
  if(_wsIos()){
    try { if(_ssFile && navigator.share && navigator.canShare && navigator.canShare({ files: [_ssFile] })) return ssShare(); } catch(e) {}
    if(typeof showToast === 'function') showToast('Appui long sur l\'image › « Enregistrer dans Photos »', '📸');
    return;
  }
  let href = _ssUrl, rev = null;
  try { if(_ssFile && URL.createObjectURL){ href = rev = URL.createObjectURL(_ssFile); } } catch(e) {}
  const a = document.createElement('a'); a.download = _ssName(); a.href = href; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
  if(rev) setTimeout(function(){ URL.revokeObjectURL(rev); }, 4000);
}
