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
  // forme du jour seulement quand la nuit du jour est connue (même règle que l'accueil et Statistiques : jamais en attente de WHOOP)
  const F = o.now && typeof prFormScore === 'function' && !(typeof wellnessState === 'function' && wellnessState().kind !== 'ok') ? prFormScore() : null;
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
function _wsKm(v){ return String(Math.round((+v || 0) * 10) / 10).replace('.', ','); }

// ─── Aperçu et partage ──────────────────────────────────────────────────────
let _wsCanvas = null, _wsData = null;
let _wsNav = null;
let _wsUrl = null, _wsFile = null;
// bouton de l'en-tête de l'accueil (sous la météo) : toujours visible dès qu'il y a une semaine faite ou prévue à partager
function wsHeaderBtn(){
  const b = typeof document !== 'undefined' ? document.getElementById('home-share-btn') : null; if(!b) return;
  let ok = false;
  try { const w = wsCurrentWeek(); ok = w != null && !!wsDataFor(w); } catch(e) { diagSilent(e, 'week-share:wsHeaderBtn'); }
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
    + '.ss-img{display:block;width:100%;max-width:420px;aspect-ratio:1/1;border-radius:18px;-webkit-touch-callout:default;-webkit-user-select:auto;user-select:auto;box-shadow:0 10px 30px rgba(0,0,0,.4);}'
    + '#ss-offer{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(84px + env(safe-area-inset-bottom));z-index:10050;display:flex;align-items:center;gap:4px;background:#0F172A;border-radius:24px;padding:4px 4px 4px 4px;box-shadow:0 8px 24px rgba(0,0,0,.35);max-width:calc(100vw - 32px);}'
    + '#ss-offer .ss-go{border:none;background:linear-gradient(90deg,#10B981,#6366F1);color:#fff;font:inherit;font-size:14px;font-weight:800;padding:10px 16px;border-radius:20px;cursor:pointer;white-space:nowrap;}#ss-offer .ss-go span{opacity:.8;}'
    + '#ss-offer .ss-no{border:none;background:transparent;color:rgba(255,255,255,.7);font-size:20px;width:34px;height:34px;cursor:pointer;}'
    + '.hs-share{border:none;background:#EEF2FF;color:#4338CA;border-radius:20px;padding:3px 8px;font-size:12px;line-height:1.2;cursor:pointer;flex-shrink:0;font-family:inherit;}'
    + '.ws-home{display:block;width:100%;text-align:left;margin-top:8px;border-radius:12px;padding:9px 12px;font-size:12.5px;border:1px solid #C7D2FE;background:linear-gradient(90deg,#EEF2FF,#F5F3FF);color:#3730A3;cursor:pointer;font-family:inherit;}';
  document.head.appendChild(st);
}


// ─── « 📸 Ta séance en image » : image CARRÉE (1080 × 1080, à publier sur Strava) d'une séance VALIDÉE, même style que la semaine ───
// sessionShareData(key) : données (testable, null si la séance n'est pas faite) ; openSessionShare(key) : aperçu + partage ;
// bouton 📸 sur la ligne de la séance faite (accueil) ; proposition « 📸 Image de ta séance » juste après chaque validation (ssOffer)
function sessionShareData(key, today){
  today = today || prTodayIso();
  const s = prSessions(typeof prRealState === 'function' ? prRealState() : state).find(function(x){ return x.key === key; });
  if(!s || !s.done || s.skip) return null;
  const p = s.perf || {}, sv = p.strava || {};
  const W = prWeeks(state, today), total = Object.keys(W).map(Number).reduce(function(a, b){ return Math.max(a, b); }, 0);
  const splits = (sv.splits || []).filter(function(x){ return x && x.allure && (!x.distanceKm || x.distanceKm >= 0.5); })
    .map(function(x){ return { km: x.km, sec: prPaceSec(x.allure), fc: x.fc || null, part: x.distanceKm && x.distanceKm < 0.95 ? x.distanceKm : null }; }).filter(function(x){ return x.sec; });
  const blocs = (p.blocsAllure || []).filter(Boolean).map(function(b){ return String(b).replace(':', "'"); });
  const R = typeof prepRace === 'function' ? prepRace() : null, dR = R && R.date && s.date ? prDays(s.date, R.date) : null;
  const r1 = function(v){ return v != null && isFinite(v) ? Math.round(v * 10) / 10 : null; };
  let title = s.title; try { if(typeof normalizeSessionTitle === 'function') title = normalizeSessionTitle(s.title, s.type, s.detail) || s.title; } catch(e) { diagSilent(e, 'week-share:sessionShareData'); }   // même nom que l'accueil
  return { key: key, w: s.w, total: total, type: s.type, title: title, detail: String(s.detail || '').trim(), date: s.date, km: s.km, kmPlan: s.kmPlan,
    dur: p.dur && typeof prTimeSec === 'function' ? prTimeSec(p.dur) : null, pace: p.pace ? String(p.pace).replace(':', "'") : null, hr: p.hr || null, hrMax: sv.fcMax || null,
    cad: sv.cadence || null, up: sv.denivele_pos != null ? sv.denivele_pos : null, temp: p.meteo && typeof p.meteo.temperature === 'number' ? Math.round(p.meteo.temperature) : null,
    cond: p.meteo ? String(p.meteo.conditions || '') : '', strain: p.whoop && p.whoop.workout_strain != null ? r1(p.whoop.workout_strain) : null,
    rpe: p.rpe || null, splits: splits, blocs: blocs, official: p.official || null, who: _wsAthlete(), goal: _wsGoal(R),
    race: R && R.date && dR != null && dR >= 0 ? { name: R.name, days: dR } : null, prep: R && R.name ? R.name : '' };
}
const SS_TYPE_LBL = { ef: 'FOOTING EF', long: 'SORTIE LONGUE', tempo: 'TEMPO', frac: 'FRACTIONNÉ', race: 'COURSE' };
let _ssData = null, _ssUrl = null, _ssFile = null;
// juste après une validation : petite proposition en bas de l'écran (15 s), seulement si la séance est bien validée
function ssOffer(key){
  if(typeof document === 'undefined' || !sessionShareData(key)) return;
  _wsCss();
  const old = document.getElementById('ss-offer'); if(old) old.remove();
  const b = document.createElement('div'); b.id = 'ss-offer'; b.setAttribute('role', 'status');
  b.innerHTML = '<button type="button" class="ss-go" onclick="openSessionShare(\'' + key + '\')">📸 Image de ta séance <span>›</span></button><button type="button" class="ss-no" aria-label="Fermer" onclick="this.parentNode.remove()">×</button>';
  document.body.appendChild(b);
  setTimeout(function(){ if(b.parentNode) b.remove(); }, 15000);
}
