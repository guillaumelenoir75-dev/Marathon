// renfo-guide.js — Renfo › « ▶ Séance guidée » : renforcement pas à pas (minuteur, séries, repos, voix) qui s'adapte.
//   rgParse(series)       : « 4 séries × 10 rép. (2 à gauche · 2 à droite) », « 3 × 30 sec (chaque côté) », « 5 cycles × 1min20s »…
//                           → { sets, reps | sec, side: 'alt' | 'each' | null, rest }
//   rgDose(base, lvl)     : progression (rép. +2, durée +10 s par niveau, 1 série de plus dès le niveau 4)
//   rgAdapt(st, today)    : séance adaptée au plan — veille de séance clé ou affûtage (1 série de moins, sans sauts),
//                           récupération WHOOP basse, douleur récente (exercice ciblé ajouté, sauts retirés), foulée
//   rgPlan(exos, st, today) : exercices avec dose du jour, raisons
//   rgProgress(st, keys, feel, hard) : niveaux après la séance (facile +1 ; bien +1 si la séance d'avant l'était aussi ;
//                           dur −1 ; « trop dur » sur un exercice −1 ; jamais de hausse en affûtage)
// Niveaux par exercice : state._renfo_lvl = { <exercice>: { lvl, feel, at } } (gardé d'une prépa à l'autre). La séance guidée
// remplit les mêmes clés que l'écran Renfo (rf<sem>r<n>e<i>_series, …done). Module chargé à la demande (groupe « renfo »).
const RG_PLYO = /saut|mountain climber/i;
const RG_FOCUS = { 'Genou': 'Extension de jambe', 'Quadriceps': 'Extension de jambe', 'Mollet': 'Montées excentriques', 'Cheville / pied': 'Montées excentriques',
  'Tibia': 'Montées sur pointe de pieds', 'Ischios': 'Pont fessier', 'Hanche': 'Ouvertures de hanche', 'Dos': 'Bird dog' };
function rgKey(nom){ return String(nom || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40); }
function rgParse(series){
  const s = String(series || '').toLowerCase().replace(/\s+/g, ' ');
  const sets = parseInt((s.match(/^(\d+)/) || [])[1]) || 3;
  let sec = null, reps = null;
  const mm = s.match(/(\d+)\s*min\s*(\d+)?\s*s?/), ss = s.match(/×\s*(\d+)\s*(?:sec|s\b)/), rr = s.match(/×\s*(\d+)\s*r[ée]p/);
  if(mm) sec = parseInt(mm[1]) * 60 + (parseInt(mm[2]) || 0); else if(ss) sec = parseInt(ss[1]); else if(rr) reps = parseInt(rr[1]);
  if(!sec && !reps) reps = 10;
  const side = /à gauche/.test(s) ? 'alt' : /chaque (côté|jambe|pied|cheville|sens)|par (jambe|côté|pied)/.test(s) ? 'each' : null;
  const rc = s.match(/r[ée]cup\s*(\d+)\s*s/);
  const rest = rc ? parseInt(rc[1]) : sec ? (sec >= 60 ? 40 : 30) : 45;
  return { sets: sets, reps: reps, sec: sec, side: side, rest: rest };
}
function rgDose(base, lvl){
  lvl = Math.max(-2, Math.min(8, +lvl || 0));
  const o = Object.assign({}, base);
  if(o.reps) o.reps = Math.max(6, Math.min(base.reps * 2, base.reps + 2 * lvl));
  if(o.sec) o.sec = Math.max(15, Math.min(base.sec * 2, base.sec + 10 * lvl));
  if(lvl >= 4) o.sets = base.sets + 1;
  return o;
}
function rgDoseText(d){
  return d.sets + ' × ' + (d.sec ? (d.sec >= 60 ? Math.floor(d.sec / 60) + ' min' + (d.sec % 60 ? ' ' + (d.sec % 60) + ' s' : '') : d.sec + ' s') : d.reps + ' rép.') + (d.side === 'each' ? ' (chaque côté)' : d.side === 'alt' ? ' (côtés alternés)' : '');
}
// séance du jour adaptée au plan et au corps
function rgAdapt(st, today){
  st = st || {}; today = today || prTodayIso();
  const out = { setsDelta: 0, noPlyo: false, frozen: false, reasons: [], focus: [] };
  const S = typeof prSessions === 'function' ? prSessions(st) : [];
  const tom = prAddDays(today, 1), key = S.find(function(s){ return s.date === tom && !s.done && !s.skip && ['frac', 'tempo', 'long', 'race'].indexOf(s.type) >= 0; });
  if(key){ out.setsDelta = -1; out.noPlyo = true; out.reasons.push('Demain : ' + key.title + ' → 1 série de moins, sans sauts'); }
  const race = S.find(function(s){ return s.type === 'race' && !s.done && s.date >= today && prDays(today, s.date) <= 10; });
  let taper = false; try { const cw = S.find(function(s){ return s.date >= today; }); taper = !!(cw && JSON.parse(st['meta_w' + cw.w] || '{}').isTaper); } catch(e) {}
  if(race || taper){ out.setsDelta = -1; out.noPlyo = true; out.frozen = true; out.reasons.push((race ? 'Course dans ' + prDays(today, race.date) + ' j' : 'Affûtage') + ' → séance légère, sans progression'); }
  const rec = (((st.whoop_data || {}).recoveries) || []).find(function(r){ return r && r.date === today; });
  if(rec && +rec.score < 34){ out.setsDelta = -1; out.reasons.push('Récup WHOOP ' + rec.score + ' % → 1 série de moins'); }
  // douleur signalée ces 14 derniers jours : exercice ciblé, pas de sauts sur une douleur des jambes
  S.filter(function(s){ return s.done && s.perf && s.perf.pain && +s.perf.pain.level >= 1 && s.date && prDays(s.date, today) <= 14 && prDays(s.date, today) >= 0; })
    .sort(function(a, b){ return b.date.localeCompare(a.date); }).forEach(function(s){
      const z = s.perf.pain.zone || 'Autre';
      if(out.focus.indexOf(z) < 0){ out.focus.push(z); out.reasons.push('Douleur ' + z.toLowerCase() + ' le ' + prFmtDay(s.date) + (RG_FOCUS[z] ? ' → ' + RG_FOCUS[z] + ' ajouté' : '')); }
      if(z !== 'Dos' && z !== 'Autre') out.noPlyo = true;
    });
  try { const sig = st._body_signals; if(sig && +sig.level >= 1 && sig.at && prDays(String(sig.at).slice(0, 10), today) <= 7 && out.focus.indexOf('Hanche') < 0){ out.focus.push('Hanche'); out.reasons.push('Foulée à surveiller → hanches renforcées'); } } catch(e) { diagSilent(e, 'renfo-guide:rgAdapt'); }
  return out;
}
// exercices du jour : dose de progression, adaptation, exercice ciblé ajouté (1 au plus)
function rgPlan(exos, st, today){
  const A = rgAdapt(st, today), L = (st && st._renfo_lvl) || {}, out = [];
  (exos || []).forEach(function(ex, i){
    if(A.noPlyo && RG_PLYO.test(ex.nom)) return;
    const base = rgParse(ex.series), k = rgKey(ex.nom), lvl = (L[k] || {}).lvl || 0, d = rgDose(base, lvl);
    d.sets = Math.max(Math.min(2, base.sets), d.sets + A.setsDelta);
    out.push({ i: i, ex: ex, key: k, lvl: lvl, base: base, dose: d });
  });
  const all = typeof RENFO_PROGRAMS !== 'undefined' ? Object.keys(RENFO_PROGRAMS).reduce(function(a, p){ return a.concat(RENFO_PROGRAMS[p].exos); }, []) : [];
  const add = A.focus.map(function(z){ return RG_FOCUS[z]; }).filter(Boolean).find(function(n){ return !out.some(function(o){ return o.ex.nom === n; }); });
  const ex = add && all.find(function(e){ return e.nom === add; });
  if(ex){ const base = rgParse(ex.series), k = rgKey(ex.nom), lvl = (L[k] || {}).lvl || 0, d = rgDose(base, lvl); d.sets = Math.max(2, Math.min(3, d.sets + A.setsDelta)); out.push({ i: -1, ex: ex, key: k, lvl: lvl, base: base, dose: d, extra: true }); }
  return { items: out, adapt: A };
}
// niveaux après la séance
function rgProgress(st, keys, feel, hard, today){
  const L = Object.assign({}, (st && st._renfo_lvl) || {}), A = rgAdapt(st, today), at = today || prTodayIso();
  (keys || []).forEach(function(k){
    const cur = L[k] || { lvl: 0 }, h = (hard || []).indexOf(k) >= 0;
    let d = 0;
    if(h || feel === 'dur') d = -1;
    else if(!A.frozen && feel === 'facile') d = 1;
    else if(!A.frozen && feel === 'bien' && (cur.feel === 'bien' || cur.feel === 'facile')) d = 1;
    L[k] = { lvl: Math.max(-2, Math.min(8, (cur.lvl || 0) + d)), feel: h ? 'dur' : feel, at: at };
  });
  return L;
}

// ─── Séance guidée (écran plein) ───
let _rg = null;
function _rgCss(){
  if(document.getElementById('rg-css')) return;
  const s = document.createElement('style'); s.id = 'rg-css';
  s.textContent = '#rg-ov{position:fixed;inset:0;z-index:600;background:#0B1F3A;color:#fff;display:flex;flex-direction:column;padding:calc(env(safe-area-inset-top,0px) + 14px) 18px calc(env(safe-area-inset-bottom,0px) + 18px);box-sizing:border-box;}'
    + '.rg-top{display:flex;align-items:center;gap:10px;}.rg-top b{flex:1;font-size:15px;}.rg-x{background:rgba(255,255,255,.15);border:none;color:#fff;width:36px;height:36px;border-radius:50%;font-size:18px;cursor:pointer;}'
    + '.rg-bar{height:5px;border-radius:3px;background:rgba(255,255,255,.15);overflow:hidden;margin:10px 0 14px;}.rg-bar i{display:block;height:100%;background:#38BDF8;}'
    + '.rg-mid{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;overflow-y:auto;}'
    + '.rg-n{font-size:22px;font-weight:900;margin:0;}.rg-d{font-size:13.5px;opacity:.8;margin:0;max-width:440px;line-height:1.45;}.rg-s{font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#7DD3FC;margin:0;}'
    + '.rg-big{font-size:84px;font-weight:900;line-height:1;font-variant-numeric:tabular-nums;margin:6px 0;}.rg-big small{font-size:20px;opacity:.7;margin-left:6px;}'
    + '.rg-rest .rg-big{color:#FCD34D;}.rg-btns{display:flex;gap:10px;width:100%;}.rg-btns button{flex:1;padding:16px;border-radius:16px;border:none;font:inherit;font-size:16px;font-weight:800;cursor:pointer;}'
    + '.rg-go{background:#22C55E;color:#06210F;}.rg-sec{background:rgba(255,255,255,.14);color:#fff;}.rg-mini{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;}'
    + '.rg-mini button{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff;border-radius:20px;padding:7px 12px;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;}.rg-mini button.on{background:#F87171;border-color:#F87171;}'
    + '.rg-list{width:100%;max-width:460px;display:flex;flex-direction:column;gap:6px;text-align:left;}.rg-li{display:flex;justify-content:space-between;gap:10px;background:rgba(255,255,255,.07);border-radius:12px;padding:9px 12px;font-size:13.5px;}'
    + '.rg-li span{opacity:.75;white-space:nowrap;}.rg-why{width:100%;max-width:460px;display:flex;flex-direction:column;gap:6px;}.rg-why p{margin:0;background:rgba(56,189,248,.15);color:#BAE6FD;border-radius:10px;padding:8px 10px;font-size:12.5px;text-align:left;}'
    + '.rg-feel{display:flex;gap:8px;width:100%;max-width:460px;}.rg-feel button{flex:1;padding:16px 6px;border-radius:14px;border:none;font:inherit;font-weight:800;font-size:15px;cursor:pointer;}';
  document.head.appendChild(s);
}
function _rgSay(t){ try { if(!_rg || !_rg.voice || typeof speechSynthesis === 'undefined') return; speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'fr-FR'; u.rate = 1.05; speechSynthesis.speak(u); } catch(e) {} }
function _rgBeep(){ try { const C = window.AudioContext || window.webkitAudioContext; if(!C) return; const c = _rg.ac || (_rg.ac = new C()), o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.18); } catch(e) {} }
// séance affichée dans l'écran Renfo (programme du créneau, ou affûtage)
function _rgCurrent(){
  let exos, slot, name;
  if(typeof affutageMode !== 'undefined' && affutageMode){
    exos = curRenfo === 1 ? renfoEchauffement : renfoAffutageUnique; name = curRenfo === 1 ? 'Échauffement' : 'Séance unique';
    if(curRenfo === 1){ const n = new Date(); slot = 'a1_' + (n.getFullYear() * 10000 + (n.getMonth() + 1) * 100 + n.getDate()); } else slot = 'a2';
  } else { const p = getRenfoData(curRenfo); exos = p.exos; name = p.name; slot = curRenfo; }
  return { exos: exos, dk: rfk(CW, slot), name: name };
}
function openRenfoGuide(){
  _rgCss();
  const C = _rgCurrent(), P = rgPlan(C.exos, state, prTodayIso());
  _rg = { C: C, P: P, i: 0, set: 1, side: 0, phase: 'intro', t: 0, timer: null, hard: [], voice: true, done: {} };
  const ov = document.createElement('div'); ov.id = 'rg-ov'; document.body.appendChild(ov);
  try { if(navigator.wakeLock) navigator.wakeLock.request('screen').then(function(l){ if(_rg) _rg.lock = l; }).catch(function(){}); } catch(e) {}
  _rgRender();
}
function rgClose(){
  if(_rg){ clearInterval(_rg.timer); try { if(_rg.lock) _rg.lock.release(); } catch(e) {} try { speechSynthesis.cancel(); } catch(e) {} }
  _rg = null; const o = document.getElementById('rg-ov'); if(o) o.remove();
  if(typeof renderRenfoExercises === 'function') try { renderRenfoExercises(); } catch(e) { diagSilent(e, 'renfo-guide:rgClose'); }
}
function _rgSides(d){ return d.side === 'each' ? 2 : 1; }
function _rgSideLabel(d){ if(d.side === 'each') return _rg.side ? 'côté droit' : 'côté gauche'; if(d.side === 'alt') return _rg.set % 2 ? 'côté gauche' : 'côté droit'; return ''; }
function _rgRender(){
  const ov = document.getElementById('rg-ov'); if(!ov || !_rg) return;
  const R = _rg, items = R.P.items, it = items[R.i], tot = items.length;
  const pct = Math.round((R.i + (R.phase === 'end' ? 1 : 0)) / Math.max(1, tot) * 100);
  let mid = '', btns = '';
  if(R.phase === 'intro'){
    mid = '<p class="rg-s">' + _seEscRg(R.C.name) + ' · ' + tot + ' exercices</p>'
      + (R.P.adapt.reasons.length ? '<div class="rg-why">' + R.P.adapt.reasons.map(function(r){ return '<p>' + _seEscRg(r) + '</p>'; }).join('') + '</div>' : '')
      + '<div class="rg-list">' + items.map(function(x){ return '<div class="rg-li"><b>' + _seEscRg(x.ex.nom) + (x.extra ? ' ✚' : '') + '</b><span>' + rgDoseText(x.dose) + (x.lvl ? ' · niv. ' + (x.lvl > 0 ? '+' : '') + x.lvl : '') + '</span></div>'; }).join('') + '</div>';
    btns = '<button class="rg-go" onclick="rgStart()">▶ Commencer</button>';
  } else if(R.phase === 'end'){
    mid = '<p class="rg-n">💪 Séance terminée</p><p class="rg-d">Comment c\'était ? Les prochaines séances s\'ajustent.</p>'
      + '<div class="rg-feel"><button style="background:#22C55E;color:#06210F;" onclick="rgFinish(\'facile\')">😌 Facile</button><button style="background:#38BDF8;color:#082F49;" onclick="rgFinish(\'bien\')">🙂 Bien</button><button style="background:#F87171;color:#450A0A;" onclick="rgFinish(\'dur\')">🥵 Dur</button></div>';
  } else {
    const d = it.dose, sideL = _rgSideLabel(d), rest = R.phase === 'rest';
    mid = '<p class="rg-s">Exercice ' + (R.i + 1) + '/' + tot + ' · série ' + R.set + '/' + d.sets + (sideL ? ' · ' + sideL : '') + '</p>'
      + '<p class="rg-n">' + (rest ? 'Repos' : _seEscRg(it.ex.nom)) + '</p>'
      + (rest ? '<p class="rg-d">Ensuite : ' + _seEscRg(_rgNextLabel()) + '</p>' : '<p class="rg-d">' + _seEscRg(it.ex.desc || '') + '</p>')
      + '<div class="' + (rest ? 'rg-rest' : '') + '"><p class="rg-big">' + (rest || d.sec ? _rgClock(R.t) : d.reps + '<small>rép.</small>') + '</p></div>'
      + (rest ? '' : '<div class="rg-mini"><button class="' + (R.hard.indexOf(it.key) >= 0 ? 'on' : '') + '" onclick="rgHard()">Trop dur</button><button onclick="rgSkipEx()">Passer l\'exercice</button><button onclick="rgVoice()">' + (R.voice ? '🔊' : '🔇') + '</button></div>');
    btns = rest ? '<button class="rg-sec" onclick="rgNext()">Passer le repos</button>'
      : d.sec ? (R.timer ? '<button class="rg-sec" onclick="rgPause()">⏸ Pause</button>' : '<button class="rg-go" onclick="rgRun()">▶ ' + (R.t < d.sec ? 'Reprendre' : 'Go') + '</button>') + '<button class="rg-sec" onclick="rgNext()">✓ Fait</button>'
      : '<button class="rg-go" onclick="rgNext()">✓ Série faite</button>';
  }
  ov.innerHTML = '<div class="rg-top"><b>' + _seEscRg(R.C.name) + '</b><button class="rg-x" onclick="rgClose()" aria-label="Fermer">×</button></div><div class="rg-bar"><i style="width:' + pct + '%"></i></div>'
    + '<div class="rg-mid">' + mid + '</div><div class="rg-btns">' + btns + '</div>';
}
function _seEscRg(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function _rgClock(s){ s = Math.max(0, Math.round(s)); return s >= 60 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : String(s); }
function _rgNextLabel(){ const R = _rg, it = R.P.items[R.i]; if(!it) return 'fin'; return it.ex.nom + ' · série ' + R.set + (_rgSideLabel(it.dose) ? ' · ' + _rgSideLabel(it.dose) : ''); }
function rgStart(){ _rg.phase = 'work'; _rgArm(); _rgRender(); _rgSay(_rgNextLabel()); }
function _rgArm(){ const it = _rg.P.items[_rg.i]; clearInterval(_rg.timer); _rg.timer = null; _rg.t = it && it.dose.sec ? it.dose.sec : 0; }
function rgRun(){
  const R = _rg; if(!R || R.timer) return;
  R.timer = setInterval(function(){
    if(!_rg) return; _rg.t -= 1;
    if(_rg.t === 3 && _rg.phase === 'work') _rgSay('3');
    if(_rg.t <= 0){ clearInterval(_rg.timer); _rg.timer = null; _rgBeep(); rgNext(); return; }
    _rgRender();
  }, 1000);
  _rgRender();
}
function rgPause(){ if(_rg){ clearInterval(_rg.timer); _rg.timer = null; _rgRender(); } }
function rgVoice(){ _rg.voice = !_rg.voice; _rgRender(); }
function rgHard(){ const k = _rg.P.items[_rg.i].key, j = _rg.hard.indexOf(k); if(j >= 0) _rg.hard.splice(j, 1); else _rg.hard.push(k); _rgRender(); }
// une série (ou un côté) faite → repos / côté suivant / série suivante / exercice suivant
function rgNext(){
  const R = _rg; if(!R) return; clearInterval(R.timer); R.timer = null;
  const it = R.P.items[R.i]; if(!it) return;
  if(R.phase === 'rest'){ R.phase = 'work'; _rgArm(); _rgRender(); _rgSay(_rgNextLabel()); if(it.dose.sec) rgRun(); return; }
  if(_rgSides(it.dose) === 2 && R.side === 0){ R.side = 1; _rgArm(); _rgRender(); _rgSay('Côté droit'); if(it.dose.sec) rgRun(); return; }
  R.side = 0;
  _rgMark(it, R.set);
  if(R.set < it.dose.sets){ R.set++; return _rgRest(it.dose.rest); }
  R.done[it.key] = true; R.i++; R.set = 1;
  if(R.i >= R.P.items.length){ R.phase = 'end'; _rgRender(); _rgSay('Séance terminée, bravo !'); return; }
  _rgRest(Math.max(30, it.dose.rest));
}
function _rgRest(sec){ const R = _rg; R.phase = 'rest'; R.t = sec; _rgRender(); _rgSay('Repos ' + sec + ' secondes'); R.timer = setInterval(function(){ if(!_rg) return; _rg.t -= 1; if(_rg.t <= 0){ _rgBeep(); rgNext(); return; } _rgRender(); }, 1000); }
function rgSkipEx(){ const R = _rg; clearInterval(R.timer); R.timer = null; R.i++; R.set = 1; R.side = 0; if(R.i >= R.P.items.length){ R.phase = 'end'; _rgRender(); return; } R.phase = 'work'; _rgArm(); _rgRender(); _rgSay(_rgNextLabel()); }
// séries cochées dans l'écran Renfo au fil de la séance (mêmes clés)
function _rgMark(it, set){
  if(it.i < 0) return;
  const k = _rg.C.dk + 'e' + it.i + '_series', nb = getNbSeries(it.ex.series);
  // dernière série du jour = exercice complet (le nombre de séries du jour peut différer du programme)
  state[k] = set >= it.dose.sets ? nb : Math.min(nb - 1, Math.max(state[k] || 0, set));
  save();
}
function rgFinish(feel){
  const R = _rg; if(!R) return;
  const keys = R.P.items.filter(function(x){ return R.done[x.key]; }).map(function(x){ return x.key; });
  state._renfo_lvl = rgProgress(state, keys, feel, R.hard, prTodayIso());
  if(keys.length >= Math.ceil(R.P.items.length / 2)){ state[R.C.dk + 'done'] = true; state[R.C.dk + 'guided'] = { at: new Date().toISOString(), feel: feel, n: keys.length }; }
  save();
  if(typeof showToast === 'function') showToast(feel === 'dur' ? 'Noté : la prochaine sera plus douce' : feel === 'facile' ? 'Noté : la prochaine montera d\'un cran' : 'Séance enregistrée', '💪');
  rgClose();
  try { renderHome(); } catch(e) { diagSilent(e, 'renfo-guide:rgFinish'); }
}
