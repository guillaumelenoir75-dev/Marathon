// Écran et image de l'analyse de course (à la demande : groupe « raui », point d'entrée dans config.js) — sortis de
// race-analysis.js ; l'analyse (raAnalyze, raStore, raHomeLine…) reste dans race-analysis.js.
// ─── Écran ───
function _raChart(A){
  const K = A.kms; if(K.length < 3) return '';
  const W = 340, H = 150, padL = 34, padR = 8, padT = 10, padB = 22;
  const vals = K.map(function(k){ return k.pace; }).concat(K.map(function(k){ return k.plan; }).filter(Boolean));
  let lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals); const m = Math.max(4, (hi - lo) * 0.15); lo -= m; hi += m;
  const x = function(i){ return padL + (W - padL - padR) * (K.length === 1 ? 0.5 : i / (K.length - 1)); }, y = function(v){ return padT + (H - padT - padB) * (v - lo) / (hi - lo); };   // plus rapide en haut
  const ln = function(arr){ return arr.map(function(v, i){ return v == null ? null : (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).filter(Boolean).join(' '); };
  const ticks = [lo + m, (lo + hi) / 2, hi - m];
  let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="ra-svg" role="img" aria-label="Allure km par km : réalisé et prévu">';
  ticks.forEach(function(t){ s += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '" class="ra-grid"/><text x="' + (padL - 4) + '" y="' + (y(t) + 3).toFixed(1) + '" class="ra-ax" text-anchor="end">' + prPace(t) + '</text>'; });
  if(A.halves) s += '<line x1="' + x((A.dist / 2) - 1).toFixed(1) + '" x2="' + x((A.dist / 2) - 1).toFixed(1) + '" y1="' + padT + '" y2="' + (H - padB) + '" class="ra-mid"/>';
  if(K.some(function(k){ return k.plan; })) s += '<path d="' + ln(K.map(function(k){ return k.plan; })) + '" class="ra-plan"/>';
  s += '<path d="' + ln(K.map(function(k){ return k.pace; })) + '" class="ra-real"/>';
  K.forEach(function(k, i){ const bad = A.fade && k.km >= A.fade.km; s += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(k.pace).toFixed(1) + '" r="2.6" class="' + (bad ? 'ra-dot bad' : 'ra-dot') + '"/>'; });
  [0, Math.floor((K.length - 1) / 2), K.length - 1].forEach(function(i, j){ s += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 6) + '" class="ra-ax" text-anchor="' + ['start', 'middle', 'end'][j] + '">km ' + K[i].km + '</text>'; });
  return s + '</svg><p class="ra-leg"><span class="r"></span>ton allure' + (K.some(function(k){ return k.plan; }) ? ' <span class="p"></span>plan de course' : '') + (A.halves ? ' <span class="m"></span>mi-course' : '') + '</p>';
}
function openRaceAnalysis(A){
  A = A || state._race_analysis || raCurrent();
  if(!A){ alert('Valide ta course avec son temps officiel pour obtenir son analyse.'); return; }
  _raCss(); window._raShown = A;
  const old = document.getElementById('ra-modal'); if(old) old.remove();
  const tile = function(l, v, s, cls){ return '<div class="ra-t ' + (cls || '') + '"><small>' + l + '</small><b>' + v + '</b>' + (s ? '<span>' + s + '</span>' : '') + '</div>'; };
  const tiles = [];
  if(A.target) tiles.push(tile(A.target.src === 'plan' ? 'Plan de course' : 'Objectif', prTime(A.target.sec), (A.delta <= 0 ? '−' : '+') + prTime(Math.abs(A.delta)), A.delta <= 0 ? 'ok' : 'ko'));
  if(A.pred) tiles.push(tile('Niveau la veille', prTime(A.pred), (A.predDelta <= 0 ? '−' : '+') + prTime(Math.abs(A.predDelta)), A.predDelta <= 0 ? 'ok' : A.predDelta > A.pred * 0.02 ? 'ko' : ''));
  if(A.start) tiles.push(tile('Départ (' + A.start.n + ' km)', prPace(A.start.pace) + '/km', (A.start.refSrc === 'plan' ? 'prévu ' : 'moy. ') + prPace(A.start.ref), A.start.pct <= -2 ? 'ko' : 'ok'));
  if(A.halves) tiles.push(tile('2e moitié', (A.halves.pct > 0 ? '+' : '') + String(A.halves.pct).replace('.', ',') + ' %', prPace(A.halves.p1) + ' → ' + prPace(A.halves.p2), A.pacing === 'fade' ? 'ko' : A.pacing === 'positive' ? '' : 'ok'));
  if(A.drift) tiles.push(tile('Dérive cardio', String(A.drift.pct).replace('.', ',') + ' %', 'FC ' + A.drift.fc1 + ' → ' + A.drift.fc2, A.drift.pct >= 8 ? 'ko' : A.drift.pct <= 4 ? 'ok' : ''));
  if(A.heat) tiles.push(tile('Météo', '+' + String(A.heat.pct).replace('.', ',') + ' %', A.heat.why || '', 'ko'));
  const d = A.date ? new Date(A.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'ra-modal'; ov.style.zIndex = '510';   // au-dessus du bilan de prépa (#modal-container, 500) ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  ov.innerHTML = '<div class="modal-box" style="max-height:92vh;"><div class="ra-head"><div><p class="ra-eb">Analyse de course' + (d ? ' · ' + d : '') + '</p><p class="ra-name">' + prEsc(A.name || A.cat) + '</p>'
    + '<p class="ra-time">' + A.time + '<small> · ' + prPace(A.avg) + '/km</small></p></div><button class="ra-x" onclick="document.getElementById(\'ra-modal\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body" style="background:#F5F7FB;"><div class="ra-body">'
    + '<div class="ra-v"><span>' + A.verdict.e + '</span><div><b>' + prEsc(A.verdict.t) + '</b><p>' + prEsc(A.verdict.s) + '</p></div></div>'
    + (tiles.length ? '<div class="ra-tiles">' + tiles.join('') + '</div>' : '')
    + (A.kms.length >= 3 ? '<p class="ra-sec">Allure km par km</p><div class="ra-card">' + _raChart(A) + '</div>' : '')
    + (A.lessons.length ? '<p class="ra-sec">Ce que tu en retiens</p><div class="ra-card ra-les">' + A.lessons.map(function(l){ return '<p>' + prEsc(l) + '</p>'; }).join('') + '</div>' : '')
    + (A.startAdvice === 'slower' ? '<p class="ra-n">Retenu dans ta recette : ton prochain plan de course partira un peu plus prudemment.</p>' : '')
    + '<button type="button" class="ra-share" onclick="raShare()">📤 Partager mon bilan</button>'
    + (typeof openNextRace === 'function' ? '<button type="button" class="ra-share" style="background:#0F766E;" onclick="document.getElementById(\'ra-modal\').remove();openNextRace()">🧭 Et ensuite ? Ta prochaine course</button>' : '')
    + '</div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
}
// ─── Bilan à partager (image 1080 × 1350) ───
function raDraw(A, cv){
  cv.width = 1080; cv.height = 1350; const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 1080, 1350); g.addColorStop(0, '#0B1F4D'); g.addColorStop(1, '#1B4FD8'); c.fillStyle = g; c.fillRect(0, 0, 1080, 1350);
  c.fillStyle = 'rgba(255,255,255,.7)'; c.font = '700 34px system-ui, -apple-system, sans-serif'; c.fillText(((A.name || A.cat) + (A.date ? ' · ' + new Date(A.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '')).slice(0, 52), 80, 130);
  c.fillStyle = '#fff'; c.font = '900 190px system-ui, -apple-system, sans-serif'; c.fillText(A.time, 74, 330);
  c.font = '600 40px system-ui, -apple-system, sans-serif'; c.fillStyle = 'rgba(255,255,255,.85)'; c.fillText(prPace(A.avg) + '/km' + (A.target ? '   ·   ' + (A.target.src === 'plan' ? 'plan ' : 'objectif ') + prTime(A.target.sec) : ''), 80, 400);
  c.fillStyle = '#fff'; c.font = '800 54px system-ui, -apple-system, sans-serif'; c.fillText(A.verdict.e + ' ' + A.verdict.t, 80, 510);
  // allure km par km : barres (plus haute = plus rapide)
  const K = A.kms;
  if(K.length >= 3){
    const x0 = 80, x1 = 1000, yb = 1010, hMax = 380, ps = K.map(function(k){ return k.pace; }), lo = Math.min.apply(null, ps), hi = Math.max.apply(null, ps), bw = (x1 - x0) / K.length;
    K.forEach(function(k, i){ const h = 120 + (hMax - 120) * (hi === lo ? 0.5 : (hi - k.pace) / (hi - lo)); c.fillStyle = A.fade && k.km >= A.fade.km ? '#FDBA74' : 'rgba(255,255,255,.9)'; c.fillRect(x0 + i * bw + bw * 0.15, yb - h, bw * 0.7, h); });
    c.fillStyle = 'rgba(255,255,255,.7)'; c.font = '600 30px system-ui, -apple-system, sans-serif'; c.fillText('Allure km par km', 80, yb - hMax - 30);
    c.fillText('km 1', 80, yb + 44); c.textAlign = 'right'; c.fillText('km ' + K[K.length - 1].km, 1000, yb + 44); c.textAlign = 'left';
  }
  c.font = '600 36px system-ui, -apple-system, sans-serif'; c.fillStyle = '#fff';
  const facts = [];
  if(A.halves) facts.push('2e moitié ' + (A.halves.pct > 0 ? '+' : '') + String(A.halves.pct).replace('.', ',') + ' %');
  if(A.drift) facts.push('dérive cardio ' + String(A.drift.pct).replace('.', ',') + ' %');
  if(A.heat) facts.push(A.heat.why);
  c.fillText(facts.join('   ·   ').slice(0, 60), 80, 1150);
  c.fillStyle = 'rgba(255,255,255,.55)'; c.font = '600 28px system-ui, -apple-system, sans-serif'; c.fillText(typeof planBrand === 'function' ? planBrand(A.dist, A.cat) : 'Plan course', 80, 1270);
  return cv;
}
function raShare(){
  const A = window._raShown || state._race_analysis; if(!A || typeof document === 'undefined') return;
  const cv = raDraw(A, document.createElement('canvas'));
  cv.toBlob(function(b){
    if(!b) return;
    const f = new File([b], 'course-' + (A.date || 'bilan') + '.png', { type: 'image/png' });
    if(navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f], title: 'Ma course', text: (A.name || A.cat) + ' : ' + A.time + ' 🏁' }).catch(function(){});
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); }
  }, 'image/png');
}
