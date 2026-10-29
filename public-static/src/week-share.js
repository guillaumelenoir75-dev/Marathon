// « Ta semaine en image » : une carte (image PNG 1080 × 1350) qui récapitule la semaine — km faits / prévus, km par jour,
// séances, séance phare, série, forme, J-x — à partager (feuille de partage du téléphone) ou à télécharger.
// Bouton sur l'accueil le dimanche après-midi et le lundi / mardi (semaine écoulée) : wsHomeButton() dans la carte « Forme du jour ».
// weekShareData(w, today) : données de la carte (testable) ; openWeekShare(w) : aperçu + partage.

const WS_DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
// semaine à résumer : en cours, sauf lundi / mardi si rien n'y est encore fait (on résume celle qui vient de finir)
function wsPickWeek(today){
  today = today || prTodayIso();
  const W = prWeeks(state, today), ks = Object.keys(W).map(Number).sort(function(a, b){ return a - b; });
  const cur = ks.find(function(w){ return W[w].now; });
  if(cur == null) return null;
  const wd = prWeekday(today), doneCur = W[cur].sess.some(function(s){ return s.done; });
  if(wd <= 2 && !doneCur && W[cur - 1] && W[cur - 1].sess.some(function(s){ return s.done; })) return cur - 1;
  return cur;
}
function weekShareData(w, today){
  today = today || prTodayIso();
  const W = prWeeks(state, today), o = W[w]; if(!o) return null;
  const sess = o.sess.filter(function(s){ return s.type !== 'rest'; });
  const done = sess.filter(function(s){ return s.done; });
  const kmDone = Math.round(done.reduce(function(a, s){ return a + s.km; }, 0) * 10) / 10;
  const kmPlan = Math.round(sess.reduce(function(a, s){ return a + s.kmPlan; }, 0) * 10) / 10;
  const days = WS_DAYS.map(function(l, i){ const d = o.from ? prAddDays(o.from, i) : null; return { l: l, date: d, km: Math.round(done.filter(function(s){ return s.date === d; }).reduce(function(a, s){ return a + s.km; }, 0) * 10) / 10, today: d === today }; });
  // séance phare : la course, sinon la séance de qualité (allure des blocs), sinon la plus longue
  const mean = function(a){ return a.length ? a.reduce(function(x, y){ return x + y; }, 0) / a.length : null; };
  let star = null;
  const race = done.find(function(s){ return s.type === 'race'; });
  if(race) star = { title: race.title, line: (race.perf.official || race.perf.dur || '') + (race.km ? ' · ' + _wsKm(race.km) + ' km' : ''), kind: 'race' };
  if(!star){
    const q = done.filter(function(s){ return (s.type === 'tempo' || s.type === 'frac') && (s.perf.blocsAllure || []).some(Boolean); })[0];
    if(q){ const p = mean((q.perf.blocsAllure || []).map(prPaceSec).filter(Boolean)); star = { title: q.title, line: (p ? prPace(p) + ' /km en moyenne sur les blocs' : _wsKm(q.km) + ' km'), kind: 'q' }; }
  }
  if(!star && done.length){ const l = done.slice().sort(function(a, b){ return b.km - a.km; })[0]; star = { title: l.title, line: _wsKm(l.km) + ' km' + (l.perf.pace ? ' à ' + l.perf.pace + ' /km' : ''), kind: 'long' }; }
  const R = typeof prepRace === 'function' ? prepRace() : null;
  const end = o.to && o.to < today ? o.to : today, dR = R && R.date ? prDays(end, R.date) : null;
  const F = o.now && typeof prFormScore === 'function' ? prFormScore() : null;
  const rpes = done.map(function(s){ return s.perf.rpe; }).filter(Boolean);
  const total = Object.keys(W).map(Number).reduce(function(a, b){ return Math.max(a, b); }, 0);
  return { w: w, total: total, from: o.from, to: o.to, kind: o.kind, now: o.now, kmDone: kmDone, kmPlan: kmPlan, pct: kmPlan ? Math.min(1.5, kmDone / kmPlan) : null,
    nDone: done.length, nPlan: sess.length, sessions: sess.map(function(s){ return { title: s.title, type: s.type, km: s.done ? s.km : s.kmPlan, done: s.done, date: s.date }; }),
    days: days, star: star, streak: typeof prStreak === 'function' ? prStreak() : 0, form: F ? F.score : null, rpe: rpes.length ? Math.round(mean(rpes) * 10) / 10 : null,
    race: R && R.date && dR != null && dR >= 0 ? { name: R.name, days: dR } : null, prep: R && R.name ? R.name : '' };
}

// ─── Dessin (canvas) ────────────────────────────────────────────────────────
const WS_TYPE_COL = { ef: '#4ADE80', long: '#A78BFA', tempo: '#FB923C', frac: '#F87171', race: '#FACC15' };
function wsDraw(D){
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
  const g = c.getContext('2d'), F = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const bg = g.createLinearGradient(0, 0, 1080, 1350); bg.addColorStop(0, '#0B1739'); bg.addColorStop(1, '#2A1B6E'); g.fillStyle = bg; g.fillRect(0, 0, 1080, 1350);
  // halo
  const hl = g.createRadialGradient(900, 160, 10, 900, 160, 520); hl.addColorStop(0, 'rgba(129,140,248,0.35)'); hl.addColorStop(1, 'rgba(129,140,248,0)'); g.fillStyle = hl; g.fillRect(0, 0, 1080, 800);
  const txt = function(t, x, y, size, col, w, align){ g.font = (w || 600) + ' ' + size + 'px ' + F; g.fillStyle = col; g.textAlign = align || 'left'; g.fillText(t, x, y); };
  const fmtD = function(d){ return d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''; };
  txt(('Semaine ' + D.w + (D.total ? ' / ' + D.total : '') + (D.prep ? '  ·  ' + D.prep : '')).toUpperCase(), 80, 120, 30, 'rgba(255,255,255,0.72)', 800);
  txt(fmtD(D.from) + ' – ' + fmtD(D.to), 80, 168, 34, 'rgba(255,255,255,0.9)', 600);
  // km
  txt(_wsKm(D.kmDone), 80, 360, 190, '#FFFFFF', 900);
  g.font = '900 190px ' + F; const wKm = g.measureText(_wsKm(D.kmDone)).width;
  txt('km', 100 + wKm, 360, 64, 'rgba(255,255,255,0.85)', 800);
  txt('sur ' + _wsKm(D.kmPlan) + ' km prévus  ·  ' + D.nDone + '/' + D.nPlan + ' séances', 84, 425, 34, 'rgba(255,255,255,0.75)', 600);
  // barre de réalisation
  const bw = 920, pct = Math.min(1, D.pct || 0);
  g.fillStyle = 'rgba(255,255,255,0.14)'; _wsRound(g, 80, 460, bw, 22, 11); g.fill();
  const pg = g.createLinearGradient(80, 0, 80 + bw, 0); pg.addColorStop(0, '#34D399'); pg.addColorStop(1, '#818CF8'); g.fillStyle = pg; _wsRound(g, 80, 460, Math.max(22, bw * pct), 22, 11); g.fill();
  // km par jour
  const mx = Math.max.apply(null, D.days.map(function(d){ return d.km; }).concat([1])), x0 = 80, colW = 920 / 7;
  D.days.forEach(function(d, i){
    const h = d.km ? Math.max(14, d.km / mx * 230) : 6, x = x0 + i * colW + colW * 0.2, w = colW * 0.6, y = 790 - h;
    g.fillStyle = d.km ? '#A5B4FC' : 'rgba(255,255,255,0.18)'; _wsRound(g, x, y, w, h, 14); g.fill();
    if(d.km) txt(_wsKm(d.km), x + w / 2, y - 14, 28, '#E0E7FF', 800, 'center');
    txt(d.l, x + w / 2, 840, 30, d.today ? '#FFFFFF' : 'rgba(255,255,255,0.6)', 800, 'center');
  });
  // séances
  let y = 920;
  D.sessions.slice(0, 5).forEach(function(s){
    g.fillStyle = WS_TYPE_COL[s.type] || '#CBD5E1'; g.beginPath(); g.arc(98, y - 11, 11, 0, Math.PI * 2); g.fill();
    const t = s.title.length > 34 ? s.title.slice(0, 33) + '…' : s.title;
    txt(t, 128, y, 34, s.done ? '#FFFFFF' : 'rgba(255,255,255,0.45)', s.done ? 700 : 500);
    txt((s.done ? '✓ ' : '') + _wsKm(s.km) + ' km', 1000, y, 32, s.done ? '#A7F3D0' : 'rgba(255,255,255,0.45)', 700, 'right');
    y += 56;
  });
  // séance phare
  if(D.star){
    const top = Math.max(y + 10, 1140);
    g.fillStyle = 'rgba(255,255,255,0.10)'; _wsRound(g, 64, top - 52, 952, 104, 26); g.fill();
    txt('★  ' + (D.star.title.length > 30 ? D.star.title.slice(0, 29) + '…' : D.star.title), 96, top - 6, 32, '#FDE68A', 800);
    txt(D.star.line, 96, top + 34, 28, 'rgba(255,255,255,0.8)', 600);
  }
  // pied : série, forme, J-x
  const foot = [D.streak ? D.streak + (D.streak > 1 ? ' séances d\'affilée' : ' séance d\'affilée') : '', D.form != null ? 'forme ' + D.form + '/100' : '', D.race ? 'J-' + D.race.days + ' ' + D.race.name : ''].filter(Boolean).join('   ·   ');
  txt(foot, 80, 1290, 28, 'rgba(255,255,255,0.8)', 700);
  txt('Plan Marathon', 1000, 1290, 26, 'rgba(255,255,255,0.45)', 700, 'right');
  return c;
}
function _wsKm(v){ return String(Math.round((+v || 0) * 10) / 10).replace('.', ','); }
function _wsRound(g, x, y, w, h, r){ r = Math.min(r, h / 2, w / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// ─── Aperçu et partage ──────────────────────────────────────────────────────
let _wsCanvas = null, _wsData = null;
function openWeekShare(w){
  _wsCss();
  w = w != null ? w : wsPickWeek();
  const D = w != null ? weekShareData(w) : null;
  if(!D || !D.nDone){ if(typeof showToast === 'function') showToast('Valide au moins une séance de la semaine pour créer ta carte', '📸'); return; }
  _wsData = D; _wsCanvas = wsDraw(D);
  const mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'ws-share'; ov.style.zIndex = '740'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.6)');
  const can = typeof navigator !== 'undefined' && navigator.share && navigator.canShare;
  ov.innerHTML = '<div class="modal-box" style="max-height:94vh;"><div class="ws-head"><p>📸 Ta semaine en image</p><button class="ws-x" onclick="document.getElementById(\'ws-share\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body" style="background:#0F172A;"><div style="padding:14px 16px 22px;display:flex;flex-direction:column;gap:12px;align-items:center;">'
    + '<img class="ws-img" alt="Récapitulatif de la semaine ' + D.w + ' : ' + D.kmDone + ' km sur ' + D.kmPlan + ' prévus" src="' + _wsCanvas.toDataURL('image/png') + '">'
    + '<div class="ws-btns">' + (can ? '<button class="ws-b main" onclick="wsShare()">Partager</button>' : '') + '<button class="ws-b' + (can ? '' : ' main') + '" onclick="wsDownload()">Télécharger</button></div>'
    + '<p class="ws-n">Pour ta famille, tes amis ou ton club : l\'image ne contient ni ta position ni tes données de santé détaillées.</p></div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  mc.appendChild(ov);
}
function _wsName(){ return 'semaine-' + (_wsData ? _wsData.w : '') + '.png'; }
function wsShare(){
  if(!_wsCanvas) return;
  _wsCanvas.toBlob(function(b){
    try {
      const f = new File([b], _wsName(), { type: 'image/png' });
      if(navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f], title: 'Ma semaine', text: 'Semaine ' + _wsData.w + ' : ' + _wsKm(_wsData.kmDone) + ' km 🏃' }).catch(function(){});
      else wsDownload();
    } catch(e) { wsDownload(); }
  }, 'image/png');
}
function wsDownload(){
  if(!_wsCanvas) return;
  const a = document.createElement('a'); a.download = _wsName(); a.href = _wsCanvas.toDataURL('image/png'); document.body.appendChild(a); a.click(); a.remove();
}
// bouton de l'accueil : dimanche après 12h, lundi et mardi (semaine écoulée)
function wsHomeButton(){
  try {
    const now = new Date(), wd = now.getDay();
    if(!(wd === 0 && now.getHours() >= 12) && wd !== 1 && wd !== 2) return '';
    const w = wsPickWeek(); if(w == null) return '';
    const D = weekShareData(w); if(!D || !D.nDone) return '';
    _wsCss();
    return '<button type="button" class="ws-home" onclick="openWeekShare(' + w + ')">📸 <b>Ta semaine ' + D.w + ' en image</b> · ' + _wsKm(D.kmDone) + ' km · à partager ›</button>';
  } catch(e) { return ''; }
}
function _wsCss(){
  if(document.getElementById('ws-css')) return;
  const st = document.createElement('style'); st.id = 'ws-css';
  st.textContent = '.ws-head{flex-shrink:0;display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:#0F172A;color:#fff;border-radius:24px 24px 0 0;}.ws-head p{margin:0;font-size:16px;font-weight:800;}'
    + '.ws-x{background:rgba(255,255,255,.15);border:none;color:#fff;width:34px;height:34px;border-radius:50%;font-size:20px;cursor:pointer;}'
    + '.ws-img{width:100%;max-width:420px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.4);}.ws-btns{display:flex;gap:8px;width:100%;max-width:420px;}'
    + '.ws-b{flex:1;padding:12px;border-radius:14px;border:1.5px solid rgba(255,255,255,.3);background:transparent;color:#fff;font-weight:800;font-size:14px;cursor:pointer;font-family:inherit;}.ws-b.main{background:#6366F1;border-color:#6366F1;}'
    + '.ws-n{font-size:11px;color:rgba(255,255,255,.55);text-align:center;margin:0;max-width:420px;}'
    + '.ws-home{display:block;width:100%;text-align:left;margin-top:8px;border-radius:12px;padding:9px 12px;font-size:12.5px;border:1px solid #C7D2FE;background:linear-gradient(90deg,#EEF2FF,#F5F3FF);color:#3730A3;cursor:pointer;font-family:inherit;}';
  document.head.appendChild(st);
}
