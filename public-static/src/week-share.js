// « Ta semaine en image » : une carte (image PNG portrait plein écran iPhone 1080 × 1920) qui récapitule la semaine — km faits / prévus, km par jour,
// séances, séance phare, série, forme, J-x — à partager (feuille de partage du téléphone) ou à télécharger.
// Bouton « 📸 Partager ma semaine » toujours visible dans l'en-tête de l'accueil, sous la météo : wsHeaderBtn().
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
// semaines de la prépa qui ont des séances ; semaine en cours (avant le début : la 1re, après la fin : la dernière)
function wsWeekList(today){
  today = today || prTodayIso();
  const W = prWeeks(state, today);
  return Object.keys(W).map(Number).filter(function(w){ return W[w].sess.some(function(s){ return s.type !== 'rest'; }); }).sort(function(a, b){ return a - b; });
}
function wsCurrentWeek(today){
  today = today || prTodayIso();
  const W = prWeeks(state, today), L = wsWeekList(today); if(!L.length) return null;
  const cur = L.find(function(w){ return W[w].now; }); if(cur != null) return cur;
  return W[L[0]].from && today < W[L[0]].from ? L[0] : L[L.length - 1];
}
// vue d'une semaine : passée = faite, à venir = programme, en cours = faite dès qu'une séance est validée, sinon programme
function wsModeFor(w, today){
  today = today || prTodayIso();
  const o = prWeeks(state, today)[w]; if(!o) return null;
  if(o.now) return o.sess.some(function(s){ return s.done; }) ? 'done' : 'plan';
  return o.to && o.to < today ? 'done' : 'plan';
}
function wsDataFor(w, today){ today = today || prTodayIso(); const m = wsModeFor(w, today); return m ? weekShareData(w, today, m) : null; }
function weekShareData(w, today, mode){
  today = today || prTodayIso();
  if(mode === 'plan') return weekPlanData(w, today);
  const W = prWeeks(state, today), o = W[w]; if(!o) return null;
  const sess = o.sess.filter(function(s){ return s.type !== 'rest'; });
  const done = sess.filter(function(s){ return s.done; });
  const kmDone = Math.round(done.reduce(function(a, s){ return a + s.km; }, 0) * 10) / 10;
  const kmPlan = Math.round(sess.reduce(function(a, s){ return a + s.kmPlan; }, 0) * 10) / 10;
  const days = WS_DAYS.map(function(l, i){ const d = o.from ? prAddDays(o.from, i) : null, all = sess.filter(function(s){ return s.date === d; }), main = all.slice().sort(function(a, b){ return (b.kmPlan || 0) - (a.kmPlan || 0); })[0];
    return { l: l, date: d, km: Math.round(done.filter(function(s){ return s.date === d; }).reduce(function(a, s){ return a + s.km; }, 0) * 10) / 10, plan: Math.round(all.reduce(function(a, s){ return a + (s.kmPlan || 0); }, 0) * 10) / 10, type: main ? main.type : null, today: d === today }; });
  // séance phare : la course, sinon la séance de qualité (allure des blocs), sinon la plus longue
  const mean = function(a){ return a.length ? a.reduce(function(x, y){ return x + y; }, 0) / a.length : null; };
  let star = null;
  const race = done.find(function(s){ return s.type === 'race'; });
  if(race) star = { key: race.key, title: race.title, line: (race.perf.official || race.perf.dur || '') + (race.km ? ' · ' + _wsKm(race.km) + ' km' : ''), kind: 'race' };
  if(!star){
    const q = done.filter(function(s){ return (s.type === 'tempo' || s.type === 'frac') && (s.perf.blocsAllure || []).some(Boolean); })[0];
    if(q){ const p = mean((q.perf.blocsAllure || []).map(prPaceSec).filter(Boolean)); star = { key: q.key, title: q.title, line: (p ? prPace(p) + ' /km en moyenne sur les blocs' : _wsKm(q.km) + ' km'), kind: 'q' }; }
  }
  if(!star && done.length){ const l = done.slice().sort(function(a, b){ return b.km - a.km; })[0]; star = { key: l.key, title: l.title, line: _wsKm(l.km) + ' km' + (l.perf.pace ? ' à ' + String(l.perf.pace).replace(':', "'") + ' /km' : ''), kind: 'long' }; }
  const R = typeof prepRace === 'function' ? prepRace() : null;
  const end = o.to && o.to < today ? o.to : today, dR = R && R.date ? prDays(end, R.date) : null;
  const F = o.now && typeof prFormScore === 'function' ? prFormScore() : null;
  const rpes = done.map(function(s){ return s.perf.rpe; }).filter(Boolean);
  const total = Object.keys(W).map(Number).reduce(function(a, b){ return Math.max(a, b); }, 0);
  return { mode: 'done', today: today, w: w, total: total, from: o.from, to: o.to, kind: _wsKind(o.kind), now: o.now, kmDone: kmDone, kmPlan: kmPlan, pct: kmPlan ? Math.min(1.5, kmDone / kmPlan) : null,
    nDone: done.length, nPlan: sess.length, sessions: sess.map(function(s){ const sec = s.done && s.perf && typeof prTimeSec === 'function' ? prTimeSec(s.perf.dur) : null;
      return { title: s.title, type: s.type, km: s.done ? s.km : s.kmPlan, done: s.done, date: s.date, star: !!(star && star.key === s.key), sec: sec,
        pace: s.done && s.perf && s.perf.pace ? String(s.perf.pace).replace(':', "'") : '', when: _wsDay(s.date) }; }),
    sec: done.reduce(function(a, s){ const t = typeof prTimeSec === 'function' ? prTimeSec(s.perf && s.perf.dur) : null; return a + (t || 0); }, 0), who: _wsAthlete(), goal: _wsGoal(R),
    days: days, star: star, streak: typeof prStreak === 'function' ? prStreak() : 0, form: F ? F.score : null, rpe: rpes.length ? Math.round(mean(rpes) * 10) / 10 : null,
    race: R && R.date && dR != null && dR >= 0 ? { name: R.name, days: dR } : null, prep: R && R.name ? R.name : '' };
}

// jour court (« Mar »), prénom (compte Firebase, jamais écrit en dur), objectif de la course (« 41'50 »)
function _wsKind(k){ return ({ race: 'semaine de course', taper: 'affûtage', recov: 'récupération', peak: 'semaine de pic' })[k] || ''; }
function _wsDay(d){ const t = d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '') : ''; return t.charAt(0).toUpperCase() + t.slice(1); }
function _wsAthlete(){
  try { const u = typeof firebase !== 'undefined' && firebase.auth ? firebase.auth().currentUser : null, n = u && u.displayName ? String(u.displayName).trim().split(/\s+/)[0] : '';
    return n ? n.charAt(0).toUpperCase() + n.slice(1) : ''; } catch(e) { return ''; }
}
function _wsGoal(R){ const sec = R && R.objectif && typeof prTimeSec === 'function' ? prTimeSec(String(R.objectif).replace(/^sub\s*/i, '')) : null; return sec ? _wsDur(sec, true) : ''; }
function _wsDur(sec, race){ sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), x = sec % 60;
  return race ? (h ? h + 'h' + String(m).padStart(2, '0') + "'" + String(x).padStart(2, '0') : m + "'" + String(x).padStart(2, '0')) : (h ? h + 'h' + String(m).padStart(2, '0') : m + ' min'); }
// semaine à venir : km prévus, km par jour prévus, séances (jour, heure), séance clé, J-x
function weekPlanData(w, today){
  const W = prWeeks(state, today), o = W[w]; if(!o) return null;
  const sess = o.sess.filter(function(s){ return s.type !== 'rest'; }).slice().sort(function(a, b){ return (a.date || '') < (b.date || '') ? -1 : 1; });
  if(!sess.length) return null;
  const kmPlan = Math.round(sess.reduce(function(a, s){ return a + (s.kmPlan || 0); }, 0) * 10) / 10;
  const days = WS_DAYS.map(function(l, i){ const d = o.from ? prAddDays(o.from, i) : null, all = sess.filter(function(s){ return s.date === d; }), main = all.slice().sort(function(a, b){ return (b.kmPlan || 0) - (a.kmPlan || 0); })[0];
    const km = Math.round(all.reduce(function(a, s){ return a + (s.kmPlan || 0); }, 0) * 10) / 10; return { l: l, date: d, km: km, plan: km, type: main ? main.type : null, today: d === today }; });
  const time = function(s){ let sc = {}; try { sc = JSON.parse(state[s.key + '_sched'] || '{}') || {}; } catch(e) {} return sc.time || (s.x && s.x.sched_time) || ''; };
  const dayLbl = _wsDay;
  const line = function(s){ return [s.kmPlan ? _wsKm(s.kmPlan) + ' km' : '', s.pace ? s.pace.text.replace(/\s+/g, ' ') : ''].filter(Boolean).join(' · '); };
  const key = sess.find(function(s){ return s.type === 'race'; }) || sess.find(function(s){ return s.type === 'tempo' || s.type === 'frac'; }) || sess.slice().sort(function(a, b){ return (b.kmPlan || 0) - (a.kmPlan || 0); })[0];
  const R = typeof prepRace === 'function' ? prepRace() : null, dR = R && R.date ? prDays(o.from && o.from > today ? o.from : today, R.date) : null;
  const total = Object.keys(W).map(Number).reduce(function(a, b){ return Math.max(a, b); }, 0);
  const longest = sess.reduce(function(a, s){ return Math.max(a, s.kmPlan || 0); }, 0);
  const kindLbl = _wsKind(o.kind);
  // durée prévue : allure de chaque séance, sinon allure moyenne des séances de la semaine qui en ont une
  const known = sess.filter(function(s){ return s.pace && s.kmPlan; }), kKm = known.reduce(function(a, s){ return a + s.kmPlan; }, 0);
  const avgP = kKm ? known.reduce(function(a, s){ return a + (s.pace.lo + s.pace.hi) / 2 * s.kmPlan; }, 0) / kKm : null;
  const secT = avgP ? Math.round(sess.reduce(function(a, s){ return a + (s.pace ? (s.pace.lo + s.pace.hi) / 2 : avgP) * (s.kmPlan || 0); }, 0)) : null;
  return { mode: 'plan', now: !!o.now, today: today, sec: secT, w: w, total: total, from: o.from, to: o.to, kind: kindLbl, kmPlan: kmPlan, kmDone: 0, nPlan: sess.length, nDone: 0, days: days, longest: longest,
    sessions: sess.map(function(s){ const t = time(s); return { title: s.title, type: s.type, km: s.kmPlan, done: s.done, date: s.date, star: s === key, pace: s.pace ? s.pace.text.replace(/\s+/g, ' ') : '',
      sec: s.pace && s.kmPlan ? Math.round((s.pace.lo + s.pace.hi) / 2 * s.kmPlan) : null, when: (dayLbl(s.date) + (t ? ' ' + t.replace(/^0(\d)/, '$1').replace(':', 'h') : '')).trim() }; }),
    star: key ? { title: key.title, line: line(key) || (key.detail || ''), kind: 'key' } : null, who: _wsAthlete(), goal: _wsGoal(R),
    race: R && R.date && dR != null && dR >= 0 ? { name: R.name, days: dR } : null, prep: R && R.name ? R.name : '' };
}

// signature des images partagées selon la course préparée : « Plan 10 km », « Plan semi-marathon », « Plan marathon »…
function planBrand(km, course){
  if(km == null && course == null){ const R = (typeof prepRace === 'function' ? prepRace() : null) || {}; km = R.km; course = R.course; }
  km = parseFloat(km);
  if(!(km > 0)) km = ({ '5 km': 5, '10 km': 10, 'Semi-marathon': 21.1, 'Semi': 21.1, 'Marathon': 42.195 })[course] || null;
  if(!km) return 'Plan course';
  return km < 7 ? 'Plan 5 km' : km < 15 ? 'Plan 10 km' : km < 30 ? 'Plan semi-marathon' : 'Plan marathon';
}
// ─── Dessin (canvas) ────────────────────────────────────────────────────────
const WS_TYPE_COL = { ef: '#4ADE80', long: '#A78BFA', tempo: '#FB923C', frac: '#F87171', race: '#FACC15' };
// format portrait plein écran iPhone (9:16, 1080 × 1920) — style « carte de course » :
// fond à lignes de niveau aux couleurs du mode (faite = vert → bleu, à venir = ambre → rose), titre et prénom,
// km en dégradé + anneau (réalisé, ou répartition des séances), barres par jour aux couleurs des séances,
// séances en cartes (séance phare marquée), pastilles (série, forme, durée), compte à rebours de la course + avancement de la prépa
const WS_W = 1080, WS_H = 1920;
const WS_TYPE_NAME = { ef: 'EF', long: 'Longue', tempo: 'Tempo', frac: 'Fract.', race: 'Course' };
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
function _wsKm(v){ return String(Math.round((+v || 0) * 10) / 10).replace('.', ','); }
function _wsRound(g, x, y, w, h, r){ r = Math.min(r, h / 2, w / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// ─── Aperçu et partage ──────────────────────────────────────────────────────
let _wsCanvas = null, _wsData = null;
let _wsNav = null;
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
let _wsUrl = null, _wsFile = null;
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
// bouton de l'en-tête de l'accueil (sous la météo) : toujours visible dès qu'il y a une semaine faite ou prévue à partager
function wsHeaderBtn(){
  const b = typeof document !== 'undefined' ? document.getElementById('home-share-btn') : null; if(!b) return;
  let ok = false;
  try { const w = wsCurrentWeek(); ok = w != null && !!wsDataFor(w); } catch(e) {}
  b.style.display = ok ? 'inline-flex' : 'none';
}
function _wsCss(){
  if(document.getElementById('ws-css')) return;
  const st = document.createElement('style'); st.id = 'ws-css';
  st.textContent = '.ws-head{flex-shrink:0;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:14px 16px;background:#0F172A;color:#fff;border-radius:24px 24px 0 0;}.ws-head p{margin:0;font-size:16px;font-weight:800;}'
    + '.ws-nav{display:flex;align-items:center;gap:6px;min-width:0;flex:1;}.ws-arr{flex-shrink:0;width:38px;height:38px;border-radius:50%;border:none;background:rgba(255,255,255,.12);color:#fff;font-size:24px;font-weight:700;line-height:1;cursor:pointer;font-family:inherit;}.ws-arr:disabled{opacity:.25;cursor:default;}'
    + '.ws-lbl{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;}.ws-lbl b{font-size:16px;font-weight:900;}.ws-lbl span{font-size:12px;font-weight:700;color:rgba(255,255,255,.65);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;}.ws-lbl.cur span{color:#A5B4FC;}'
    + '.ws-today{border:1px solid rgba(255,255,255,.3);background:transparent;color:#fff;border-radius:20px;padding:6px 14px;font-size:12.5px;font-weight:800;cursor:pointer;font-family:inherit;}.ws-today[hidden]{display:none;}'
    + '.ws-x{background:rgba(255,255,255,.15);border:none;color:#fff;width:34px;height:34px;border-radius:50%;font-size:20px;cursor:pointer;}'
    + '.ws-img{display:block;width:auto;max-width:100%;max-height:66vh;aspect-ratio:9/16;border-radius:18px;-webkit-touch-callout:default;-webkit-user-select:auto;user-select:auto;box-shadow:0 10px 30px rgba(0,0,0,.4);}.ws-btns{display:flex;gap:8px;width:100%;max-width:420px;}'
    + '.ws-b{flex:1;padding:12px;border-radius:14px;border:1.5px solid rgba(255,255,255,.3);background:transparent;color:#fff;font-weight:800;font-size:14px;cursor:pointer;font-family:inherit;}.ws-b.main{background:#6366F1;border-color:#6366F1;}'
    + '.ws-n{font-size:11px;color:rgba(255,255,255,.55);text-align:center;margin:0;max-width:420px;}'
    + '.ws-home{display:block;width:100%;text-align:left;margin-top:8px;border-radius:12px;padding:9px 12px;font-size:12.5px;border:1px solid #C7D2FE;background:linear-gradient(90deg,#EEF2FF,#F5F3FF);color:#3730A3;cursor:pointer;font-family:inherit;}';
  document.head.appendChild(st);
}
