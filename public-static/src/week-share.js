// « Ta semaine en image » : une carte (image PNG portrait plein écran iPhone 1080 × 1920) qui récapitule la semaine — km faits / prévus, km par jour,
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
  const wd = prWeekday(today);
  if(wd <= 2 && W[cur - 1] && W[cur - 1].sess.some(function(s){ return s.done; })) return cur - 1;
  return cur;
}
// les deux images proposées : la semaine faite (terminée) et la semaine prévue qui suit
function wsPickWeeks(today){
  today = today || prTodayIso();
  const done = wsPickWeek(today); if(done == null) return { done: null, plan: null };
  const W = prWeeks(state, today), nx = W[done + 1];
  return { done: done, plan: nx && nx.sess.some(function(s){ return s.type !== 'rest' && !s.done; }) ? done + 1 : null };
}
function weekShareData(w, today, mode){
  today = today || prTodayIso();
  if(mode === 'plan') return weekPlanData(w, today);
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

// semaine à venir : km prévus, km par jour prévus, séances (jour, heure), séance clé, J-x
function weekPlanData(w, today){
  const W = prWeeks(state, today), o = W[w]; if(!o) return null;
  const sess = o.sess.filter(function(s){ return s.type !== 'rest'; }).slice().sort(function(a, b){ return (a.date || '') < (b.date || '') ? -1 : 1; });
  if(!sess.length) return null;
  const kmPlan = Math.round(sess.reduce(function(a, s){ return a + (s.kmPlan || 0); }, 0) * 10) / 10;
  const days = WS_DAYS.map(function(l, i){ const d = o.from ? prAddDays(o.from, i) : null; return { l: l, date: d, km: Math.round(sess.filter(function(s){ return s.date === d; }).reduce(function(a, s){ return a + (s.kmPlan || 0); }, 0) * 10) / 10 }; });
  const time = function(s){ let sc = {}; try { sc = JSON.parse(state[s.key + '_sched'] || '{}') || {}; } catch(e) {} return sc.time || (s.x && s.x.sched_time) || ''; };
  const dayLbl = function(d){ const t = d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '') : ''; return t.charAt(0).toUpperCase() + t.slice(1); };
  const line = function(s){ return [s.kmPlan ? _wsKm(s.kmPlan) + ' km' : '', s.pace ? s.pace.text.replace(/\s+/g, ' ') : ''].filter(Boolean).join(' · '); };
  const key = sess.find(function(s){ return s.type === 'race'; }) || sess.find(function(s){ return s.type === 'tempo' || s.type === 'frac'; }) || sess.slice().sort(function(a, b){ return (b.kmPlan || 0) - (a.kmPlan || 0); })[0];
  const R = typeof prepRace === 'function' ? prepRace() : null, dR = R && R.date ? prDays(o.from && o.from > today ? o.from : today, R.date) : null;
  const total = Object.keys(W).map(Number).reduce(function(a, b){ return Math.max(a, b); }, 0);
  const longest = sess.reduce(function(a, s){ return Math.max(a, s.kmPlan || 0); }, 0);
  const kindLbl = ({ race: 'semaine de course', taper: 'affûtage', recov: 'récupération', peak: 'semaine de pic' })[o.kind] || '';
  return { mode: 'plan', w: w, total: total, from: o.from, to: o.to, kind: kindLbl, kmPlan: kmPlan, kmDone: 0, nPlan: sess.length, nDone: 0, days: days, longest: longest,
    sessions: sess.map(function(s){ const t = time(s); return { title: s.title, type: s.type, km: s.kmPlan, done: s.done, date: s.date, when: (dayLbl(s.date) + (t ? ' ' + t.replace(/^0(\d)/, '$1').replace(':', 'h') : '')).trim() }; }),
    star: key ? { title: key.title, line: line(key) || (key.detail || ''), kind: 'key' } : null,
    race: R && R.date && dR != null && dR >= 0 ? { name: R.name, days: dR } : null, prep: R && R.name ? R.name : '' };
}

// ─── Dessin (canvas) ────────────────────────────────────────────────────────
const WS_TYPE_COL = { ef: '#4ADE80', long: '#A78BFA', tempo: '#FB923C', frac: '#F87171', race: '#FACC15' };
// format portrait plein écran iPhone (9:16, 1080 × 1920) : en-tête, km, barre, km par jour, séances, séance phare, 3 tuiles, signature
const WS_W = 1080, WS_H = 1920;
function wsDraw(D){
  const c = document.createElement('canvas'); c.width = WS_W; c.height = WS_H;
  const g = c.getContext('2d'), F = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const bg = g.createLinearGradient(0, 0, WS_W * 0.4, WS_H); bg.addColorStop(0, '#0B1739'); bg.addColorStop(0.55, '#1E1B5E'); bg.addColorStop(1, '#2E1A6E'); g.fillStyle = bg; g.fillRect(0, 0, WS_W, WS_H);
  // halos
  const hl = g.createRadialGradient(900, 300, 10, 900, 300, 640); hl.addColorStop(0, 'rgba(129,140,248,0.38)'); hl.addColorStop(1, 'rgba(129,140,248,0)'); g.fillStyle = hl; g.fillRect(0, 0, WS_W, 1000);
  const h2 = g.createRadialGradient(120, 1650, 10, 120, 1650, 560); h2.addColorStop(0, 'rgba(52,211,153,0.16)'); h2.addColorStop(1, 'rgba(52,211,153,0)'); g.fillStyle = h2; g.fillRect(0, 1000, WS_W, 920);
  const txt = function(t, x, y, size, col, w, align){ g.font = (w || 600) + ' ' + size + 'px ' + F; g.fillStyle = col; g.textAlign = align || 'left'; g.fillText(t, x, y); };
  const fit = function(t, size, w, max){ g.font = w + ' ' + size + 'px ' + F; while(g.measureText(t).width > max && t.length > 4) t = t.slice(0, -2) + '…'; return t; };
  const fmtD = function(d){ return d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''; };
  // en-tête
  const P = D.mode === 'plan';
  if(P){ g.fillStyle = 'rgba(165,180,252,0.22)'; _wsRound(g, 80, 128, 200, 52, 26); g.fill(); txt('À VENIR', 180, 164, 28, '#C7D2FE', 800, 'center'); }
  txt(fit(('Semaine ' + D.w + (D.total ? ' / ' + D.total : '') + (D.prep ? '  ·  ' + D.prep : '')).toUpperCase(), 32, 800, 920), 80, 230, 32, 'rgba(255,255,255,0.72)', 800);
  txt(fmtD(D.from) + ' – ' + fmtD(D.to), 80, 290, 40, 'rgba(255,255,255,0.92)', 600);
  // km
  const big = _wsKm(P ? D.kmPlan : D.kmDone);
  txt(big, 76, 560, 250, '#FFFFFF', 900);
  g.font = '900 250px ' + F; const wKm = g.measureText(big).width;
  txt('km', 100 + wKm, 560, 80, 'rgba(255,255,255,0.85)', 800);
  txt(P ? 'prévus  ·  ' + D.nPlan + ' séance' + (D.nPlan > 1 ? 's' : '') + (D.kind ? '  ·  ' + D.kind : '') : 'sur ' + _wsKm(D.kmPlan) + ' km prévus  ·  ' + D.nDone + '/' + D.nPlan + ' séances', 84, 640, 38, 'rgba(255,255,255,0.78)', 600);
  // barre de réalisation (semaine faite)
  const bw = 920, pct = Math.min(1, D.pct || 0);
  if(!P){
    g.fillStyle = 'rgba(255,255,255,0.14)'; _wsRound(g, 80, 685, bw, 26, 13); g.fill();
    const pg = g.createLinearGradient(80, 0, 80 + bw, 0); pg.addColorStop(0, '#34D399'); pg.addColorStop(1, '#818CF8'); g.fillStyle = pg; _wsRound(g, 80, 685, Math.max(26, bw * pct), 26, 13); g.fill();
  }
  // km par jour
  const mx = Math.max.apply(null, D.days.map(function(d){ return d.km; }).concat([1])), x0 = 80, colW = 920 / 7, base = 1090;
  D.days.forEach(function(d, i){
    const h = d.km ? Math.max(16, d.km / mx * 270) : 7, x = x0 + i * colW + colW * 0.2, w = colW * 0.6, y = base - h;
    g.fillStyle = d.km ? (P ? 'rgba(165,180,252,0.35)' : '#A5B4FC') : 'rgba(255,255,255,0.18)'; _wsRound(g, x, y, w, h, 16); g.fill();
    if(P && d.km){ g.strokeStyle = '#A5B4FC'; g.lineWidth = 4; g.setLineDash([12, 8]); _wsRound(g, x + 2, y + 2, w - 4, h - 4, 14); g.stroke(); g.setLineDash([]); }
    if(d.km) txt(_wsKm(d.km), x + w / 2, y - 16, 32, '#E0E7FF', 800, 'center');
    txt(d.l, x + w / 2, base + 56, 34, d.today ? '#FFFFFF' : 'rgba(255,255,255,0.6)', 800, 'center');
  });
  // séances
  let y = 1260;
  D.sessions.slice(0, 5).forEach(function(s){
    g.fillStyle = WS_TYPE_COL[s.type] || '#CBD5E1'; g.beginPath(); g.arc(100, y - 13, 13, 0, Math.PI * 2); g.fill();
    if(P){
      g.font = '800 34px ' + F; const wd2 = s.when ? g.measureText(s.when).width + 22 : 0;
      if(s.when) txt(s.when, 134, y, 34, '#C7D2FE', 800);
      txt(fit(s.title, 38, 700, 640 - wd2), 134 + wd2, y, 38, '#FFFFFF', 700);
      txt(_wsKm(s.km) + ' km', 1000, y, 36, '#E0E7FF', 700, 'right');
    } else {
    txt(fit(s.title, 38, s.done ? 700 : 500, 640), 134, y, 38, s.done ? '#FFFFFF' : 'rgba(255,255,255,0.45)', s.done ? 700 : 500);
    txt((s.done ? '✓ ' : '') + _wsKm(s.km) + ' km', 1000, y, 36, s.done ? '#A7F3D0' : 'rgba(255,255,255,0.45)', 700, 'right');
    }
    y += 64;
  });
  // séance phare
  if(D.star){
    const top = y + 6;
    g.fillStyle = 'rgba(255,255,255,0.10)'; _wsRound(g, 64, top, 952, 124, 30); g.fill();
    txt('★  ' + fit((P ? 'Séance clé : ' : '') + D.star.title, 36, 800, 820), 100, top + 54, 36, '#FDE68A', 800);
    txt(fit(D.star.line, 31, 600, 860), 100, top + 100, 31, 'rgba(255,255,255,0.82)', 600);
  }
  // tuiles : série, forme, J-x
  const T = [];
  if(P){
    if(D.longest) T.push({ v: _wsKm(D.longest) + ' km', l: 'la plus longue', c: '#C4B5FD' });
  }
  if(!P && D.streak) T.push({ v: String(D.streak), l: D.streak > 1 ? 'séances d\'affilée' : 'séance d\'affilée', c: '#FDBA74' });
  if(!P && D.form != null) T.push({ v: String(D.form), l: 'forme /100', c: D.form >= 67 ? '#6EE7B7' : D.form >= 34 ? '#FCD34D' : '#FCA5A5' });
  if(D.race) T.push({ v: D.race.days === 0 ? 'Jour J' : 'J-' + D.race.days, l: D.race.name, c: '#C4B5FD' });
  if(T.length){
    const gap = 20, tw = (920 - gap * (T.length - 1)) / T.length, ty = 1690;
    T.forEach(function(t, i){
      const x = 80 + i * (tw + gap);
      g.fillStyle = 'rgba(255,255,255,0.09)'; _wsRound(g, x, ty, tw, 130, 26); g.fill();
      txt(t.v, x + tw / 2, ty + 66, 54, t.c, 900, 'center');
      txt(fit(t.l, 26, 700, tw - 30), x + tw / 2, ty + 106, 26, 'rgba(255,255,255,0.7)', 700, 'center');
    });
  }
  txt('Plan Marathon', WS_W / 2, 1878, 28, 'rgba(255,255,255,0.45)', 700, 'center');
  return c;
}
function _wsKm(v){ return String(Math.round((+v || 0) * 10) / 10).replace('.', ','); }
function _wsRound(g, x, y, w, h, r){ r = Math.min(r, h / 2, w / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// ─── Aperçu et partage ──────────────────────────────────────────────────────
let _wsCanvas = null, _wsData = null;
let _wsWeeks = null;
function openWeekShare(w, mode){
  _wsCss();
  const PW = wsPickWeeks();
  _wsWeeks = { done: w != null ? w : PW.done, plan: w != null ? (PW.plan != null && PW.plan === w + 1 ? PW.plan : (prWeeks(state, prTodayIso())[w + 1] ? w + 1 : null)) : PW.plan };
  const Dd = _wsWeeks.done != null ? weekShareData(_wsWeeks.done) : null, okDone = !!(Dd && Dd.nDone);
  const Dp = _wsWeeks.plan != null ? weekShareData(_wsWeeks.plan, null, 'plan') : null;
  mode = mode === 'plan' && Dp ? 'plan' : okDone ? 'done' : Dp ? 'plan' : null;
  if(!mode){ if(typeof showToast === 'function') showToast('Valide au moins une séance de la semaine pour créer ta carte', '📸'); return; }
  _wsSet(mode === 'plan' ? Dp : Dd);
  const D = _wsData;
  const mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'ws-share'; ov.style.zIndex = '740'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.6)');
  const can = _wsCanShare(), ios = _wsIos();
  const seg = '<div class="ws-seg" role="tablist" aria-label="Semaine à partager">'
    + '<button type="button" role="tab" data-m="done"' + (okDone ? '' : ' disabled') + ' aria-selected="' + (mode === 'done') + '" class="' + (mode === 'done' ? 'on' : '') + '" onclick="wsSwitch(\'done\')">✅ Semaine faite</button>'
    + '<button type="button" role="tab" data-m="plan"' + (Dp ? '' : ' disabled') + ' aria-selected="' + (mode === 'plan') + '" class="' + (mode === 'plan' ? 'on' : '') + '" onclick="wsSwitch(\'plan\')">📅 À venir</button></div>';
  ov.innerHTML = '<div class="modal-box" style="max-height:94vh;"><div class="ws-head">' + seg + '<button class="ws-x" onclick="document.getElementById(\'ws-share\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body" style="background:#0F172A;"><div style="padding:14px 16px 22px;display:flex;flex-direction:column;gap:12px;align-items:center;">'
    + '<img class="ws-img" alt="' + _wsAlt(D) + '" src="' + _wsUrl + '">'
    + '<div class="ws-btns">' + (can ? '<button class="ws-b main" onclick="wsShare()">Partager</button>' : '') + '<button class="ws-b' + (can ? '' : ' main') + '" onclick="wsDownload()">' + (ios ? 'Enregistrer' : 'Télécharger') + '</button></div>'
    + (ios ? '<p class="ws-n">Ou appui long sur l\'image › « Enregistrer dans Photos »</p>' : '')
    + '<p class="ws-n">Pour ta famille, tes amis ou ton club : l\'image ne contient ni ta position ni tes données de santé détaillées.</p></div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  mc.appendChild(ov);
}
let _wsUrl = null, _wsFile = null;
function _wsAlt(D){ return D.mode === 'plan' ? 'Semaine ' + D.w + ' à venir : ' + D.kmPlan + ' km prévus' : 'Récapitulatif de la semaine ' + D.w + ' : ' + D.kmDone + ' km sur ' + D.kmPlan + ' prévus'; }
function _wsSet(D){ _wsData = D; _wsCanvas = wsDraw(D); _wsUrl = _wsCanvas.toDataURL('image/png'); _wsFile = _wsFileOf(_wsUrl); }
// bascule « Semaine faite » / « À venir » dans la fenêtre : nouvelle image, mêmes boutons
function wsSwitch(mode){
  if(!_wsWeeks) return;
  const D = mode === 'plan' ? (_wsWeeks.plan != null ? weekShareData(_wsWeeks.plan, null, 'plan') : null) : (_wsWeeks.done != null ? weekShareData(_wsWeeks.done) : null);
  if(!D) return;
  _wsSet(D);
  const ov = document.getElementById('ws-share'); if(!ov) return;
  const im = ov.querySelector('.ws-img'); if(im){ im.src = _wsUrl; im.alt = _wsAlt(D); }
  ov.querySelectorAll('.ws-seg button').forEach(function(b){ const on = b.getAttribute('data-m') === mode; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
}
function _wsName(){ return 'semaine-' + (_wsData ? _wsData.w : '') + (_wsData && _wsData.mode === 'plan' ? '-a-venir' : '') + '.png'; }
// image → fichier, sans attente (data URL décodée sur place)
function _wsFileOf(url){
  try {
    const bin = atob(String(url).split(',')[1] || ''), u = new Uint8Array(bin.length);
    for(let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new File([u], _wsName(), { type: 'image/png' });
  } catch(e) { return null; }
}
function _wsIos(){ return typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)); }
function _wsCanShare(){ try { return !!(_wsFile && navigator.share && navigator.canShare && navigator.canShare({ files: [_wsFile] })); } catch(e) { return false; } }
// Partager : appelé directement dans le toucher (iOS refuse un partage lancé après une attente)
function wsShare(){
  if(!_wsFile) return wsDownload();
  if(!_wsCanShare()) return wsDownload();
  navigator.share({ files: [_wsFile], title: 'Ma semaine', text: _wsData.mode === 'plan' ? 'Semaine ' + _wsData.w + ' à venir : ' + _wsKm(_wsData.kmPlan) + ' km au programme 🏃' : 'Semaine ' + _wsData.w + ' : ' + _wsKm(_wsData.kmDone) + ' km 🏃' })
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
    + '.ws-seg{display:flex;gap:3px;background:rgba(255,255,255,.1);border-radius:12px;padding:3px;}.ws-seg button{border:none;background:transparent;color:rgba(255,255,255,.7);font:inherit;font-size:13px;font-weight:800;padding:7px 11px;border-radius:9px;cursor:pointer;white-space:nowrap;}'
    + '.ws-seg button.on{background:#6366F1;color:#fff;}.ws-seg button:disabled{opacity:.35;cursor:default;}'
    + '.ws-x{background:rgba(255,255,255,.15);border:none;color:#fff;width:34px;height:34px;border-radius:50%;font-size:20px;cursor:pointer;}'
    + '.ws-img{display:block;width:auto;max-width:100%;max-height:66vh;aspect-ratio:9/16;border-radius:18px;-webkit-touch-callout:default;-webkit-user-select:auto;user-select:auto;box-shadow:0 10px 30px rgba(0,0,0,.4);}.ws-btns{display:flex;gap:8px;width:100%;max-width:420px;}'
    + '.ws-b{flex:1;padding:12px;border-radius:14px;border:1.5px solid rgba(255,255,255,.3);background:transparent;color:#fff;font-weight:800;font-size:14px;cursor:pointer;font-family:inherit;}.ws-b.main{background:#6366F1;border-color:#6366F1;}'
    + '.ws-n{font-size:11px;color:rgba(255,255,255,.55);text-align:center;margin:0;max-width:420px;}'
    + '.ws-home{display:block;width:100%;text-align:left;margin-top:8px;border-radius:12px;padding:9px 12px;font-size:12.5px;border:1px solid #C7D2FE;background:linear-gradient(90deg,#EEF2FF,#F5F3FF);color:#3730A3;cursor:pointer;font-family:inherit;}';
  document.head.appendChild(st);
}
