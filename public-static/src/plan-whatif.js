// « Et si… » : avant de décider, tu testes un scénario (sauter une semaine, être malade, changer de volume, déplacer la course)
// et tu vois l'effet sur ta trajectoire et ton temps prévu. Ouvert depuis la trajectoire de « MAJ le plan » (openWhatIf).
// prWhatIf(a, sc) part de la projection de prTrajectory (niveau actuel + tendance × jours) avec des hypothèses simples, affichées :
//   jours sans entraînement = pas de progression ; au-delà d'une semaine sans courir, ≈ −0,35 de niveau par semaine ;
//   volume : la moitié de l'écart joue sur la progression (±20 % au plus) ; course déplacée = plus ou moins de jours pour progresser.

const WI_DETRAIN = 0.35;   // niveau (VDOT) perdu par semaine d'arrêt au-delà de la première
function prWhatIf(a, sc){
  const T = a && a.trajectory, m = a && PR_RACE_M[a.opt.raceCat];
  if(!T || !T.race || !m) return null;
  sc = sc || {};
  const today = a.opt.today, skipW = Math.max(0, sc.skipWeeks || 0), sick = Math.max(0, sc.sickDays || 0), shift = sc.shiftWeeks || 0, volPct = sc.volPct || 0;
  const days = T.race.days + shift * 7;
  if(days < 3) return { error: 'La course ne peut pas être avancée autant : elle serait déjà passée.' };
  // volume moyen prévu d'ici la course (séances non faites)
  const left = prSessions(state).filter(function(s){ return !s.done && !s.skip && s.type !== 'rest' && s.type !== 'race' && s.date && s.date >= today && s.date <= T.race.date; });
  const weeksLeft = Math.max(1, T.race.days / 7), avgWeek = left.reduce(function(x, s){ return x + s.kmPlan; }, 0) / weeksLeft;
  const lost = Math.min(days, skipW * 7 + sick);
  const mult = Math.max(0.6, Math.min(1.2, 1 + 0.5 * volPct / 100));
  const detrain = (Math.max(0, skipW * 7 - 7) + Math.max(0, sick - 7)) / 7 * WI_DETRAIN;
  const gain = Math.max(-1.5, Math.min(3, T.slope * (days - lost) * mult)) - detrain;
  const v = T.now + gain;
  const out = { v: v, gain: gain, days: days, date: prAddDays(today, days), mid: raceTimeFromVdot(v, m), lo: raceTimeFromVdot(v + 0.6, m), hi: raceTimeFromVdot(v - 0.6, m), base: T.race, avgWeek: Math.round(avgWeek), risks: [], notes: [] };
  out.delta = Math.round(out.mid - T.race.mid);
  if(T.need) out.verdict = v - 0.6 >= T.need ? 'atteignable' : v + 0.6 >= T.need ? 'à portée' : 'ambitieux';
  // risques et rappels
  const prog = a.recette && a.recette.progression ? a.recette.progression - 1 : 0.12;
  if(volPct > 0){
    if(volPct / 100 > prog) out.risks.push('Hausse de +' + volPct + ' % d\'un coup : au-delà de ta progression habituelle (+' + Math.round(prog * 100) + ' %/sem). Étale-la sur ' + Math.ceil(volPct / 100 / prog) + ' semaines.');
    if(a.stride && a.stride.level) out.risks.push('Ta foulée montre déjà un signal de fatigue : ajouter du volume maintenant est risqué.');
    if(a.internal && a.internal.pains && a.internal.pains.some(function(p){ return p.level >= 2; })) out.risks.push('Douleur récente : pas de hausse de volume tant qu\'elle persiste.');
    if(a.whoop && a.whoop.tired) out.risks.push('WHOOP indique une fatigue : attends le retour au vert avant d\'augmenter.');
  }
  if(volPct < 0) out.notes.push('Moins de volume = progression plus lente, mais un corps plus frais : utile si tu manques de récupération.');
  if(skipW >= 2 || sick >= 10) out.notes.push('Après l\'arrêt, reprends à ~60-70 % du volume la 1re semaine, sans intensité.');
  if(sick > 0) out.notes.push('Malade : pas de course avec de la fièvre ou des symptômes sous le cou ; reprise 1-2 jours après la fin des symptômes.');
  if(shift < 0 && days < 21) out.risks.push('Course dans moins de 3 semaines : il faut refaire l\'affûtage tout de suite (−30 à −50 % de volume).');
  if(shift > 0) out.notes.push('Course plus tard : le plan devra être prolongé (semaines de charge ajoutées avant l\'affûtage).');
  return out;
}

// ─── Fenêtre ────────────────────────────────────────────────────────────────
let _wiSc = { skipWeeks: 0, sickDays: 0, volPct: 0, shiftWeeks: 0 };
const WI_OPTS = [
  { k: 'skipWeeks', t: '⏸️ Je saute', o: [[0, 'Non'], [1, '1 sem.'], [2, '2 sem.'], [3, '3 sem.']] },
  { k: 'sickDays', t: '🤒 Je suis malade', o: [[0, 'Non'], [3, '3 j'], [7, '7 j'], [14, '14 j']] },
  { k: 'volPct', t: '📈 Mon volume', o: [[-20, '−20 %'], [0, 'Prévu'], [10, '+10 %'], [20, '+20 %']] },
  { k: 'shiftWeeks', t: '🏁 Ma course', o: [[-2, '−2 sem.'], [0, 'Prévue'], [2, '+2 sem.'], [4, '+4 sem.']] }];
function openWhatIf(){
  const a = typeof _prReview !== 'undefined' && _prReview && _prReview.a;
  if(!a || !a.trajectory || !a.trajectory.race){ if(typeof showToast === 'function') showToast('Il faut une course objectif datée et un niveau calculé', '🔮'); return; }
  _wiCss(); _wiSc = { skipWeeks: 0, sickDays: 0, volPct: 0, shiftWeeks: 0 };
  const mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'pr-whatif'; ov.style.zIndex = '740'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  ov.innerHTML = '<div class="modal-box" style="max-height:92vh;"><div class="wi-head"><div><p class="wi-eb">Simulateur</p><p class="wi-title">🔮 Et si… ?</p><p class="wi-sub">Teste un scénario avant de décider : l\'effet sur ton temps le jour J</p></div>'
    + '<button class="wi-x" onclick="document.getElementById(\'pr-whatif\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body" style="background:#F5F7FB;"><div style="padding:14px 16px 24px;display:flex;flex-direction:column;gap:12px;">'
    + WI_OPTS.map(function(g){ return '<div class="wi-g"><p>' + g.t + '</p><div class="wi-seg" data-k="' + g.k + '">' + g.o.map(function(o){ return '<button type="button" class="' + (_wiSc[g.k] === o[0] ? 'on' : '') + '" onclick="_wiPick(\'' + g.k + '\',' + o[0] + ')">' + o[1] + '</button>'; }).join('') + '</div></div>'; }).join('')
    + '<div id="wi-res"></div></div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  mc.appendChild(ov); _wiRender();
}
function _wiPick(k, v){
  _wiSc[k] = v;
  document.querySelectorAll('#pr-whatif .wi-seg[data-k="' + k + '"] button').forEach(function(b, i){ b.classList.toggle('on', WI_OPTS.find(function(g){ return g.k === k; }).o[i][0] === v); });
  _wiRender();
}
function _wiRender(){
  const el = document.getElementById('wi-res'); if(!el) return;
  const a = _prReview && _prReview.a, R = prWhatIf(a, _wiSc); if(!R){ el.innerHTML = ''; return; }
  if(R.error){ el.innerHTML = '<div class="wi-card"><p class="wi-n">' + prEsc(R.error) + '</p></div>'; return; }
  const same = !_wiSc.skipWeeks && !_wiSc.sickDays && !_wiSc.volPct && !_wiSc.shiftWeeks;
  const d = R.delta, dTxt = Math.abs(d) < 5 ? 'pareil' : (d > 0 ? '+' : '−') + (Math.abs(d) < 60 ? Math.abs(d) + ' s' : prTime(Math.abs(d)));
  const col = R.verdict === 'atteignable' ? 'ok' : R.verdict === 'à portée' ? 'mid' : R.verdict ? 'hard' : '';
  // barre : temps prévu sans rien changer vs scénario, sur l'échelle de la fourchette
  const t0 = Math.min(R.base.lo, R.lo) - 30, t1 = Math.max(R.base.hi, R.hi) + 30, X = function(t){ return Math.max(0, Math.min(100, (t - t0) / (t1 - t0) * 100)); };
  let h = '<div class="wi-card"><p class="wi-l">' + (same ? 'Si tu suis le plan' : 'Avec ce scénario') + ', le ' + prFmtDate(R.date, { day: 'numeric', month: 'long' }) + '</p>'
    + '<p class="wi-big">' + prTime(R.mid) + (same ? '' : ' <span class="wi-d ' + (d > 4 ? 'up' : d < -4 ? 'down' : '') + '">' + dTxt + '</span>') + '</p>'
    + '<p class="wi-n">fourchette ' + prTime(R.lo) + ' – ' + prTime(R.hi) + (R.verdict ? ' · <span class="wi-v ' + col + '">objectif : ' + R.verdict + '</span>' : '') + '</p>'
    + '<div class="wi-bar"><i class="base" style="left:' + X(R.base.lo) + '%;width:' + (X(R.base.hi) - X(R.base.lo)) + '%"></i><i class="sc" style="left:' + X(R.lo) + '%;width:' + (X(R.hi) - X(R.lo)) + '%"></i>'
    + '<b style="left:' + X(R.base.mid) + '%" title="plan suivi"></b><b class="sc" style="left:' + X(R.mid) + '%" title="scénario"></b></div>'
    + '<p class="wi-leg"><span><i class="base"></i>plan suivi ' + prTime(R.base.mid) + '</span>' + (same ? '' : '<span><i class="sc"></i>scénario</span>') + '<span>← plus rapide</span></p></div>';
  if(R.risks.length) h += '<div class="wi-card risk"><p class="wi-l">⚠️ Attention</p><ul>' + R.risks.map(function(t){ return '<li>' + prEsc(t) + '</li>'; }).join('') + '</ul></div>';
  if(R.notes.length) h += '<div class="wi-card"><p class="wi-l">💡 À savoir</p><ul>' + R.notes.map(function(t){ return '<li>' + prEsc(t) + '</li>'; }).join('') + '</ul></div>';
  h += '<p class="wi-hyp">Estimation simple, pas une prédiction : niveau actuel ' + prV(a.trajectory.now) + ' et tendance ' + (a.trajectory.slope >= 0 ? '+' : '') + prV(a.trajectory.slope * 7) + '/semaine ; un jour sans entraînement ne fait pas progresser ; au-delà d\'une semaine d\'arrêt ≈ −' + String(WI_DETRAIN).replace('.', ',') + ' de niveau par semaine ; la moitié d\'un écart de volume (~' + R.avgWeek + ' km/sem prévus) joue sur la progression.</p>';
  el.innerHTML = h;
}
function _wiCss(){
  if(document.getElementById('wi-css')) return;
  const st = document.createElement('style'); st.id = 'wi-css';
  st.textContent = '.wi-head{flex-shrink:0;color:#fff;padding:16px;border-radius:24px 24px 0 0;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;background:linear-gradient(135deg,#312E81,#4F46E5);}'
    + '.wi-eb{font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;opacity:.75;margin:0;}.wi-title{font-size:20px;font-weight:900;margin:2px 0;}.wi-sub{font-size:12.5px;opacity:.85;margin:0;}'
    + '.wi-x{background:rgba(255,255,255,.18);border:none;color:#fff;width:34px;height:34px;border-radius:50%;font-size:20px;cursor:pointer;flex-shrink:0;}'
    + '.wi-g p{font-size:12.5px;font-weight:800;color:#1E293B;margin:0 0 6px;}.wi-seg{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;background:#E2E8F0;border-radius:12px;padding:3px;}'
    + '.wi-seg button{border:none;background:transparent;border-radius:9px;padding:8px 2px;font-size:12.5px;font-weight:700;color:#475569;cursor:pointer;font-family:inherit;}.wi-seg button.on{background:#fff;color:#312E81;box-shadow:0 1px 3px rgba(15,23,42,.15);}'
    + '.wi-card{background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:12px 14px;}.wi-card.risk{background:#FFF7ED;border-color:#FED7AA;}.wi-card ul{margin:4px 0 0;padding-left:18px;font-size:12.5px;color:#334155;line-height:1.45;}'
    + '.wi-l{font-size:12px;font-weight:800;color:#475569;margin:0;}.wi-big{font-size:34px;font-weight:900;color:#0F172A;margin:2px 0;font-variant-numeric:tabular-nums;letter-spacing:-.02em;}'
    + '.wi-d{font-size:15px;font-weight:800;border-radius:20px;padding:3px 9px;vertical-align:middle;background:#E2E8F0;color:#334155;}.wi-d.up{background:#FEE2E2;color:#B91C1C;}.wi-d.down{background:#DCFCE7;color:#15803D;}'
    + '.wi-n{font-size:12px;color:#64748B;margin:0;}.wi-v.ok{color:#15803D;font-weight:800;}.wi-v.mid{color:#B45309;font-weight:800;}.wi-v.hard{color:#B91C1C;font-weight:800;}'
    + '.wi-bar{position:relative;height:22px;margin:12px 0 6px;background:#F1F5F9;border-radius:11px;}.wi-bar i{position:absolute;top:5px;height:12px;border-radius:6px;}.wi-bar i.base{background:#CBD5E1;}.wi-bar i.sc{background:#818CF8;opacity:.7;top:7px;height:8px;}'
    + '.wi-bar b{position:absolute;top:1px;width:4px;height:20px;margin-left:-2px;border-radius:2px;background:#64748B;}.wi-bar b.sc{background:#4F46E5;}'
    + '.wi-leg{display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:#64748B;margin:0;}.wi-leg i{display:inline-block;width:10px;height:8px;border-radius:3px;margin-right:4px;}.wi-leg i.base{background:#CBD5E1;}.wi-leg i.sc{background:#818CF8;}'
    + '.wi-hyp{font-size:11px;color:#64748B;line-height:1.45;margin:0;}';
  document.head.appendChild(st);
}
