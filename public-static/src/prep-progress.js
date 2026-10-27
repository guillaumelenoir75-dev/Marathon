// Mes prépas › « Comparer mes prépas » : progression d'une prépa à l'autre
// (volume par semaine aligné sur la course, allure EF à FC égale, bilan chiffré, records).
// Les prépas enregistrées sont lues dans leur copie (users/{uid}/preps/{id}), la prépa en cours dans state,
// la prépa à venir dans prep_next (programme prévu uniquement).

const PROG_COLORS = ['#0C447C', '#E8530A', '#15803D', '#7C3AED', '#0891B2', '#B45309'];
const PROG_EF_HR = 148;                                   // EF comparable : FC moyenne ≤ 148 bpm

const _progPace = function(p){ const m = String(p || '').replace(/['’]/g, ':').match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
const _progPaceTxt = function(s){ s = Math.round(s); return Math.floor(s / 60) + "'" + String(s % 60).padStart(2, '0'); };
const _progIso = function(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

// Mesures d'une prépa à partir de son état (copie, état en cours ou programme à venir)
function progMetrics(st, opts){
  opts = opts || {};
  const hard = !st._plan_engine;                          // copie du plan Seine-Eure
  const start = st.plan_start_date || (hard ? '2026-03-09' : null);
  const t0 = start ? new Date(String(start).slice(0, 10) + 'T12:00:00') : null;
  const weeks = [], ef = [];
  let longest = 0, longestPlan = 0, quality = 0, done = 0, kmDone = 0, kmPlan = 0;
  for(let w = 1, empty = 0; w <= 80 && empty < 5; w++){
    let ei = 0, pk = 0, dk = 0, any = false;
    while(ei <= 50 && st['extra_w' + w + '_s' + ei] !== undefined){
      const k = 'extra_w' + w + '_s' + ei; let x = {}; any = true;
      try { x = JSON.parse(st[k]) || {}; } catch(e) {}
      const km = parseFloat(x.km) || 0; pk += km; if(x.type === 'long') longestPlan = Math.max(longestPlan, km);
      const isDone = !!(st[k + '_done'] || st[k + '_km'] != null);
      if(isDone){
        const v = parseFloat(st[k + '_km']), real = v > 0 ? v : km;
        dk += real; done++;
        if(x.type === 'long') longest = Math.max(longest, real);
        if(x.type === 'tempo' || x.type === 'frac') quality++;
        let perf = {}; try { perf = JSON.parse(st[k + '_perf'] || '{}') || {}; } catch(e) {}
        const sec = _progPace(perf.pace), hr = parseInt(perf.hr);
        if((x.type === 'ef' || x.type === 'long') && sec && sec > 240 && sec < 480 && hr && hr <= PROG_EF_HR){
          let date = perf.date || x.sched_date || null;
          if(!date && t0){ const d = new Date(t0); d.setDate(d.getDate() + (w - 1) * 7 + ((parseInt(x.sched_day) || 1) - 1)); date = _progIso(d); }
          if(date) ef.push({ t: new Date(String(date).slice(0, 10) + 'T12:00:00').getTime(), sec: sec, hr: hr, w: w });
        }
      }
      ei++;
    }
    if(!any){ empty++; weeks.push({ plan: 0, done: 0 }); continue; }
    empty = 0; weeks.push({ plan: pk, done: dk }); kmDone += dk; kmPlan += pk;
  }
  while(weeks.length && !weeks[weeks.length - 1].plan) weeks.pop();
  const doneWeeks = weeks.filter(function(x){ return x.done > 0; });
  ef.sort(function(a, b){ return a.t - b.t; });
  const avg = function(a){ return a.length ? a.reduce(function(s, x){ return s + x.sec; }, 0) / a.length : null; };
  return { weeks: weeks, ef: ef, n: weeks.length, done: done, kmDone: Math.round(kmDone), kmPlan: Math.round(kmPlan),
    avgWeek: doneWeeks.length ? Math.round(kmDone / doneWeeks.length) : 0, peak: Math.round(Math.max.apply(null, weeks.map(function(x){ return opts.planned ? x.plan : x.done; }).concat([0]))),
    longest: Math.round((opts.planned ? longestPlan : longest) * 10) / 10, quality: quality, efAvg: avg(ef), efFirst: avg(ef.slice(0, 4)), efLast: avg(ef.slice(-4)), start: start };
}

// Prépas à comparer : enregistrées (sauf la copie de la prépa en cours), en cours, à venir — dans l'ordre chronologique
async function _progCollect(){
  const idx = _prepIndex || {}, cur = _prepCurrentInfo(state), out = [];
  for(const id of Object.keys(idx)){
    const p = idx[id];
    if(!usesHardPlan() && (id === state._prep_id || p.title === cur.title)) continue;
    let st = null; try { st = await _prepGetSnap(id); } catch(e) {}
    if(!st) continue;
    out.push({ id: id, title: p.title, date: p.date, dist: p.dist, result: p.result || '', kind: 'done', m: progMetrics(st) });
  }
  if(_prepStats(state).planned) out.push({ id: '#cur', title: cur.title, date: cur.date, dist: cur.dist, result: cur.result || '', kind: 'now', m: progMetrics(state) });
  if(_prepNext){
    let snap = null; try { snap = await _prepGetSnap('#next'); } catch(e) {}
    if(snap && snap.state) out.push({ id: '#next', title: _prepNext.title, date: _prepNext.date, dist: _prepNext.dist, result: '', kind: 'next', m: progMetrics(snap.state, { planned: true }) });
  }
  out.sort(function(a, b){ return String(a.m.start || a.date || '').localeCompare(String(b.m.start || b.date || '')); });
  out.forEach(function(p, i){ p.color = PROG_COLORS[i % PROG_COLORS.length]; });
  return out;
}

let _progCharts = [];
function closeProgress(){
  _progCharts.forEach(function(c){ try { c.destroy(); } catch(e) {} }); _progCharts = [];
  const ov = document.getElementById('prog-panel'); if(!ov) return;
  const box = ov.querySelector('.modal-box'); if(box) box.classList.add('pp-closing');
  ov.style.transition = 'background .22s'; ov.style.background = 'transparent'; ov.style.pointerEvents = 'none';
  setTimeout(function(){ ov.remove(); }, 230);
}
async function openProgress(){
  if(typeof _prepFxCss === 'function') _prepFxCss();
  const mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'prog-panel'; ov.style.zIndex = '600';
  ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.35)');
  ov.innerHTML = '<div class="modal-box" style="max-height:94vh;">'
    + '<div style="background:linear-gradient(135deg,#0C447C,#1D4ED8);padding:16px;border-radius:24px 24px 0 0;color:#fff;flex-shrink:0;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">'
    +   '<div><p style="font-size:10px;font-weight:800;opacity:.8;letter-spacing:.1em;text-transform:uppercase;margin:0 0 2px;">Mes prépas</p><p style="font-size:21px;font-weight:900;margin:0;">📈 Progression</p>'
    +   '<p style="font-size:12.5px;font-weight:600;opacity:.85;margin:3px 0 0;">Tes prépas comparées, de la plus ancienne à la prochaine</p></div>'
    +   '<button onclick="closeProgress()" aria-label="Fermer" style="background:rgba(255,255,255,.2);border:none;cursor:pointer;color:#fff;font-size:18px;width:32px;height:32px;border-radius:50%;">×</button></div>'
    + '<div class="modal-scroll-body" style="background:#F3F6FC;"><div id="prog-body" style="padding:14px 16px 26px;display:flex;flex-direction:column;gap:12px;"><p style="color:#64748B;font-size:13px;">Lecture de tes prépas…</p></div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) closeProgress(); });
  mc.appendChild(ov);
  const preps = await _progCollect();
  _progRender(preps);
}

function _progRender(preps){
  const box = document.getElementById('prog-body'); if(!box) return;
  if(!document.getElementById('prep-css') && typeof _PREP_CSS !== 'undefined'){ const st = document.createElement('style'); st.id = 'prep-css'; st.textContent = _PREP_CSS; document.head.appendChild(st); }
  const esc = _prepEsc, label = { done: 'terminée', now: 'en cours', next: 'à venir' };
  const leg = preps.map(function(p){ return '<span><i style="background:' + p.color + '"></i>' + esc(p.title) + ' <span style="color:#94A3B8;">· ' + label[p.kind] + '</span></span>'; }).join('');
  let h = '';
  // Records
  const recs = ['5 km', '10 km', 'Semi-marathon', 'Marathon'].map(function(c){ const b = prepBestTime(c, _prepIndex || {}); return b ? { c: c, b: b } : null; }).filter(Boolean);
  if(recs.length) h += '<p class="pp-sec"><span>Records</span></p><section class="pp-card" aria-label="Records"><div class="pp-stats" style="grid-template-columns:repeat(' + Math.min(recs.length, 3) + ',1fr);">'
    + recs.map(function(r){ return '<div class="pp-stat"><b style="color:#B45309;">' + r.b.time + '</b><span>' + (r.c === 'Semi-marathon' ? 'semi' : r.c.toLowerCase()) + '</span></div>'; }).join('') + '</div></section>';
  // Volume
  h += '<p class="pp-sec"><span>Volume par semaine</span></p><section class="pp-card"><p class="pp-sub" style="font-size:12px;">Km réalisés, semaines alignées sur la course (0 = semaine de course). En pointillés : programme prévu.</p>'
    + '<div style="position:relative;height:210px;"><canvas id="prog-vol" aria-label="Volume par semaine de chaque prépa" role="img"></canvas></div><div class="pp-leg">' + leg + '</div></section>';
  // Allure EF
  const withEf = preps.filter(function(p){ return p.m.ef.length; });
  h += '<p class="pp-sec"><span>Allure EF à FC égale</span></p><section class="pp-card"><p class="pp-sub" style="font-size:12px;">Sorties EF et longues courues à ' + PROG_EF_HR + ' bpm de moyenne ou moins : plus le point est haut, plus tu vas vite pour le même effort.</p>'
    + (withEf.length ? '<div style="position:relative;height:210px;"><canvas id="prog-ef" aria-label="Allure EF au fil du temps" role="img"></canvas></div>'
      + '<div class="pp-chips">' + withEf.map(function(p){ const d = p.m.efFirst && p.m.efLast && p.m.ef.length >= 6 ? p.m.efLast - p.m.efFirst : null;
          return '<span class="pp-chip"><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' + p.color + ';"></i>' + _progPaceTxt(p.m.efAvg) + '/km'
            + (d != null && Math.abs(d) >= 2 ? ' <b style="color:' + (d < 0 ? '#15803D' : '#B91C1C') + ';">' + (d < 0 ? '−' : '+') + Math.abs(Math.round(d)) + ' s</b>' : '') + '</span>'; }).join('') + '</div>'
      + '<p class="pp-sub" style="font-size:11.5px;color:#7A8597;">Moyenne de chaque prépa ; en vert, le gain entre ses 4 premières et ses 4 dernières sorties EF.</p>'
      : '<p class="pp-empty">Pas encore de sortie EF avec fréquence cardiaque enregistrée.</p>') + '</section>';
  // Bilan comparé
  h += '<p class="pp-sec"><span>Bilan comparé</span></p><section class="pp-card" style="padding:12px 0;"><div style="overflow-x:auto;"><table style="border-collapse:collapse;width:100%;min-width:' + (104 + preps.length * 80) + 'px;font-size:12px;font-variant-numeric:tabular-nums;">'
    + '<thead><tr><th style="text-align:left;padding:6px 12px;color:#64748B;font-size:11px;font-weight:700;"></th>'
    + preps.map(function(p){ return '<th scope="col" style="text-align:right;padding:6px 10px;font-size:11px;color:' + p.color + ';font-weight:850;line-height:1.25;vertical-align:bottom;">' + esc(String(p.title).replace(/\s+20\d\d$/, '')).replace(/-/g, '‑') + '<br><span style="color:#94A3B8;font-weight:600;font-size:10.5px;">' + label[p.kind] + '</span></th>'; }).join('') + '</tr></thead><tbody>';
  const row = function(name, f){ return '<tr style="border-top:1px solid #EEF2F8;"><th scope="row" style="text-align:left;padding:8px 6px 8px 12px;color:#334155;font-weight:700;white-space:nowrap;">' + name + '</th>'
    + preps.map(function(p){ return '<td style="text-align:right;padding:8px 10px;color:#0F172A;font-weight:700;white-space:nowrap;">' + f(p) + '</td>'; }).join('') + '</tr>'; };
  const dash = '<span style="color:#CBD5E1;">—</span>';
  h += row('Résultat', function(p){ return p.result ? '<span style="color:#B45309;">' + esc(p.result) + '</span>' : dash; })
    + row('Course', function(p){ return esc(({ 'Semi-marathon': 'Semi' })[p.dist] || p.dist || '') || dash; })
    + row('Semaines', function(p){ return p.m.n; })
    + row('Km réalisés', function(p){ return p.kind === 'next' ? dash : _ppNum(p.m.kmDone); })
    + row('Km prévus', function(p){ return _ppNum(p.m.kmPlan); })
    + row('Moyenne / sem.', function(p){ return p.kind === 'next' ? Math.round(p.m.kmPlan / Math.max(1, p.m.n)) + ' <span style="color:#94A3B8;font-weight:600;">prévu</span>' : (p.m.avgWeek ? p.m.avgWeek + ' km' : dash); })
    + row('Pic', function(p){ return p.m.peak ? p.m.peak + ' km' : dash; })
    + row('Sortie la + longue', function(p){ return p.m.longest ? String(p.m.longest).replace('.', ',') + ' km' : dash; })
    + row('Séances qualité', function(p){ return p.kind === 'next' ? dash : p.m.quality; })
    + row('Allure EF moy.', function(p){ return p.m.efAvg ? _progPaceTxt(p.m.efAvg) + '/km' : dash; });
  h += '</tbody></table></div></section>';
  box.innerHTML = h;
  _progDraw(preps);
}

function _progDraw(preps){
  if(typeof Chart === 'undefined') return;
  _progCharts.forEach(function(c){ try { c.destroy(); } catch(e) {} }); _progCharts = [];
  const grid = 'rgba(12,68,124,0.07)', tick = { color: '#64748B', font: { size: 10 } };
  // Volume : x = semaines avant la course
  const L = Math.max.apply(null, preps.map(function(p){ return p.m.n; }).concat([1]));
  const labels = []; for(let i = L - 1; i >= 0; i--) labels.push(i ? '-' + i : '0');
  const ds = [];
  preps.forEach(function(p){
    const pad = function(arr){ return new Array(L - arr.length).fill(null).concat(arr); };
    if(p.kind !== 'next') ds.push({ label: p.title, data: pad(p.m.weeks.map(function(w){ return w.done || (p.kind === 'now' ? null : 0); })), borderColor: p.color, backgroundColor: p.color, borderWidth: 2.2, pointRadius: 0, tension: .3, spanGaps: false });
    if(p.kind !== 'done') ds.push({ label: p.title + ' (prévu)', data: pad(p.m.weeks.map(function(w){ return w.plan; })), borderColor: p.color, borderDash: [5, 4], borderWidth: 1.6, pointRadius: 0, tension: .3 });
  });
  const cv = document.getElementById('prog-vol');
  if(cv) _progCharts.push(new Chart(cv, { type: 'line', data: { labels: labels, datasets: ds },
    options: { responsive: true, maintainAspectRatio: false, animation: { duration: 350 }, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: function(it){ return 'Semaine ' + it[0].label + ' (avant la course)'; }, label: function(c){ return c.raw == null ? null : c.dataset.label + ' : ' + Math.round(c.raw) + ' km'; } } } },
      scales: { x: { ticks: Object.assign({ maxTicksLimit: 9, autoSkip: true }, tick), grid: { display: false } }, y: { beginAtZero: true, ticks: Object.assign({ callback: function(v){ return v + ' km'; } }, tick), grid: { color: grid } } } } }));
  // Allure EF : x = date, y = allure (plus rapide en haut)
  const ce = document.getElementById('prog-ef');
  if(ce){
    const eds = preps.filter(function(p){ return p.m.ef.length; }).map(function(p){
      return { label: p.title, data: p.m.ef.map(function(e){ return { x: e.t, y: e.sec, hr: e.hr }; }), borderColor: p.color, backgroundColor: p.color + 'B3', pointRadius: 3.2, pointHoverRadius: 5, showLine: false };
    });
    _progCharts.push(new Chart(ce, { type: 'scatter', data: { datasets: eds },
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 350 },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c){ return c.dataset.label + ' · ' + new Date(c.raw.x).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' · ' + _progPaceTxt(c.raw.y) + '/km · ' + c.raw.hr + ' bpm'; } } } },
        scales: { x: { type: 'linear', ticks: Object.assign({ maxTicksLimit: 6, callback: function(v){ return new Date(v).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }); } }, tick), grid: { color: grid } },
          y: { reverse: true, ticks: Object.assign({ callback: function(v){ return _progPaceTxt(v); } }, tick), grid: { color: grid } } } } }));
  }
}
