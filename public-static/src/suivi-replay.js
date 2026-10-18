// Page /suivi-guillaume : rejeu accéléré de la course à partir des temps au km de la montre (Strava),
// calé sur le temps officiel. Le point avance sur le tracé officiel, chrono, km et allure défilent.

const SUIVI_REPLAY = {
  gun: '09:15',                 // départ (heure de la montre)
  official: 3 * 3600 + 37 * 60 + 5,   // temps officiel 3:37:05
  watchKm: 42.41,               // distance mesurée par la montre
  // allure de chaque km (s/km), km 1 → 42, puis les 410 derniers mètres
  splits: [328, 307, 311, 310, 313, 311, 311, 307, 311, 307, 312, 310, 312, 307, 311, 311, 304, 305, 312, 313, 303,
           306, 304, 308, 305, 301, 303, 304, 305, 303, 309, 301, 305, 302, 303, 296, 302, 313, 309, 311, 296, 302],
  last: { km: 0.41, pace: 272 },
};

const SuiviReplay = (function(){
  const R = SUIVI_REPLAY, $ = function(id){ return document.getElementById(id); };
  const seg = R.splits.map(function(p){ return { km: 1, pace: p }; }).concat([{ km: R.last.km, pace: R.last.pace }]);
  const raw = seg.reduce(function(a, x){ return a + x.km * x.pace; }, 0), f = R.official / raw;   // temps montre → officiel
  const cumT = [0], cumD = [0];
  seg.forEach(function(x, i){ cumT.push(cumT[i] + x.km * x.pace * f); cumD.push(cumD[i] + x.km); });
  const K = 42195 / (R.watchKm * 1000);                  // km montre → mètres du tracé officiel
  const SPEEDS = [30, 60, 120, 300];
  let tau = 0, playing = false, speed = 60, lastTick = 0, timer = null, active = false;

  function at(t){
    t = Math.max(0, Math.min(R.official, t));
    let i = 0; while(i < seg.length - 1 && cumT[i + 1] < t) i++;
    const frac = (t - cumT[i]) / ((cumT[i + 1] - cumT[i]) || 1);
    return { i: i, dw: cumD[i] + seg[i].km * frac };
  }
  const paceTxt = function(p){ return suiviFmt.pace(p); };

  function build(){
    const box = $('replay'); if(!box) return;
    const ps = R.splits, mn = Math.min.apply(null, ps.concat(R.last.pace)), mx = Math.max.apply(null, ps);
    const bars = seg.map(function(x, i){
      const h = 28 + 72 * (mx - x.pace) / ((mx - mn) || 1);             // plus rapide = plus haut
      return '<button type="button" class="rp-bar" data-i="' + i + '" style="flex:' + x.km + ';height:' + h.toFixed(0) + '%" aria-label="' + (i < R.splits.length ? 'km ' + (i + 1) : 'derniers 410 m') + ' en ' + paceTxt(x.pace) + '"></button>';
    }).join('');
    box.innerHTML = '<section class="card rp" aria-labelledby="rp-title">'
      + '<div class="rp-head"><h2 id="rp-title">🎬 Revoir la course</h2><span>3:37:05 · record personnel</span></div>'
      + '<p class="rp-sub">Rejouez les 42,195 km en accéléré, avec l\'allure de chaque kilomètre.</p>'
      + '<div class="rp-chart" id="rp-chart">' + bars + '</div>'
      + '<div class="rp-axis"><span>km 1</span><span>10</span><span>20</span><span>30</span><span>🏁</span></div>'
      + '<input type="range" id="rp-seek" min="0" max="' + R.official + '" step="1" value="0" aria-label="Moment de la course">'
      + '<div class="rp-ctl"><button type="button" id="rp-play" class="rp-play">▶ Revoir la course</button>'
      +   '<div class="rp-speeds" role="group" aria-label="Vitesse">' + SPEEDS.map(function(v){ return '<button type="button" data-v="' + v + '"' + (v === speed ? ' aria-pressed="true"' : '') + '>×' + v + '</button>'; }).join('') + '</div></div>'
      + '<button type="button" id="rp-exit" class="rp-exit" hidden>✕ Revenir au suivi en direct</button>'
      + '</section>';
    $('rp-play').onclick = toggle;
    $('rp-exit').onclick = exit;
    $('rp-seek').oninput = function(){ start(); tau = +this.value; frame(); };
    box.querySelectorAll('.rp-speeds button').forEach(function(b){ b.onclick = function(){ speed = +b.dataset.v; box.querySelectorAll('.rp-speeds button').forEach(function(x){ x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); frame(); }; });
    box.querySelectorAll('.rp-bar').forEach(function(b){ b.onclick = function(){ start(); tau = cumT[+b.dataset.i] + 0.5; frame(); }; });
  }

  function start(){
    if(active) return;
    active = true; $('rp-exit').hidden = false;
    frame(); SuiviView.center();
  }
  function toggle(){
    if(!active) start();
    if(tau >= R.official) tau = 0;
    playing = !playing; lastTick = Date.now();
    clearInterval(timer);
    if(playing) timer = setInterval(tick, 100);
    frame();
  }
  function tick(){
    const n = Date.now(); tau += (n - lastTick) / 1000 * speed; lastTick = n;
    if(tau >= R.official){ tau = R.official; playing = false; clearInterval(timer); }
    frame();
  }
  function exit(){
    playing = false; clearInterval(timer); active = false; tau = 0;
    $('rp-exit').hidden = true; $('rp-seek').value = 0;
    $('rp-play').textContent = '▶ Revoir la course';
    paint(-1);
    SuiviView.replay(null);
  }
  function paint(cur){
    document.querySelectorAll('#rp-chart .rp-bar').forEach(function(b, i){ b.className = 'rp-bar' + (i < cur ? ' done' : i === cur ? ' cur' : ''); });
  }

  function frame(){
    if(!active) return;
    const a = at(tau), done = tau >= R.official;
    const dOff = Math.min(42195, a.dw * 1000 * K), s = done ? SuiviGeo.len : Math.min(SuiviGeo.len, dOff / SuiviGeo.scale);
    const x = seg[a.i], wall = suiviFmt.planned(R.gun) + tau * 1000;
    SuiviView.replay({
      replay: true, st: done ? 'finished' : 'running', chrono: tau * 1000, d: done ? 42195 : dOff, s: s, ll: SuiviGeo.pointAt(s),
      known: a.dw > 0.2, speed: a.dw > 0 ? a.dw * 1000 / tau : 0,
      pill: done ? '🏁 Arrivé · rejeu' : playing ? '▶ Rejeu ×' + speed : '❚❚ Rejeu en pause',
      status: done ? 'Arrivé en 3:37:05 · record personnel 🎉' : 'Revoir la course · ×' + speed,
      sub: 'il était ' + suiviFmt.hhmm(wall),
      kmLabel: done ? 'Allure du dernier km' : 'Allure du km ' + (a.i < R.splits.length ? a.i + 1 : '42,2'),
      kmPace: paceTxt(x.pace), kmSub: done ? 'derniers 410 m' : a.i < R.splits.length ? 'km ' + (a.i + 1) + ' sur 42' : 'derniers 410 m',
    });
    $('rp-seek').value = Math.round(tau);
    $('rp-play').textContent = playing ? '❚❚ Pause' : done ? '↺ Revoir depuis le départ' : '▶ Reprendre';
    paint(done ? seg.length : a.i);
  }

  return { init: build };
})();
document.addEventListener('DOMContentLoaded', function(){ SuiviReplay.init(); });
