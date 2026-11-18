// Qualité du Coach (à la demande, groupe « cquality » : openCoachQuality — Diagnostic, recherche « qualité du coach »).
// Sur 30 jours : réponses, notes 👍 / 👎 et leurs raisons, réponses vocales coupées, délai jusqu'au 1er mot lu, chiffres
// corrigés par l'app (cvVerify), recherches de données (outils) ; dernières réponses mal notées. Le serveur relit ces notes
// à chaque question (fbText, coach.js) : les défauts relevés sont rappelés au Coach.
function openCoachQuality(){
  const S = typeof cfStats === 'function' ? cfStats(cfLogGet(), (typeof state !== 'undefined' && state && state._coach_fb) || {}) : null;
  if(!S) return;
  const esc = function(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  const mc = document.getElementById('modal-container'); if(!mc) return;
  const old = document.getElementById('cq-modal'); if(old) old.remove();
  if(!document.getElementById('cq-css')){
    const st = document.createElement('style'); st.id = 'cq-css';
    st.textContent = '#cq-modal .cq-h{display:flex;justify-content:space-between;align-items:flex-start;padding:16px 16px 8px;}#cq-modal .cq-eb{margin:0;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#64748B;}#cq-modal .cq-t{margin:2px 0 0;font-size:19px;font-weight:800;color:#0F172A;}'
      + '#cq-modal .cq-x{border:none;background:none;font-size:26px;line-height:1;color:#64748B;cursor:pointer;}#cq-modal .cq-b{padding:4px 16px 22px;display:flex;flex-direction:column;gap:12px;}'
      + '#cq-modal .cq-tl{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}#cq-modal .cq-tl div{background:#F1F5FB;border-radius:12px;padding:9px 10px;}#cq-modal .cq-tl b{display:block;font-size:19px;font-weight:800;color:#0F172A;font-variant-numeric:tabular-nums;}#cq-modal .cq-tl small{font-size:11px;color:#64748B;}'
      + '#cq-modal .cq-s{margin:6px 0 0;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#64748B;}#cq-modal .cq-r{display:grid;grid-template-columns:86px 1fr 26px;align-items:center;gap:8px;font-size:13px;color:#334155;}'
      + '#cq-modal .cq-r i{height:8px;border-radius:4px;background:#E2E8F0;overflow:hidden;display:block;}#cq-modal .cq-r u{display:block;height:100%;background:#E0603A;border-radius:4px;}#cq-modal .cq-r b{text-align:right;font-variant-numeric:tabular-nums;}'
      + '#cq-modal .cq-d{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:9px 11px;font-size:13px;color:#334155;line-height:1.45;}#cq-modal .cq-d small{display:block;color:#64748B;font-size:11.5px;margin-top:3px;}#cq-modal .cq-n{font-size:12.5px;color:#64748B;margin:0;}';
    document.head.appendChild(st);
  }
  const W = { long: 'Trop long', faux: 'Faux', inutile: 'Pas utile', flou: 'Pas clair' }, maxW = Math.max(1, Math.max.apply(null, Object.keys(W).map(function(k){ return S.why[k] || 0; })));
  const pct = function(a, b){ return b ? Math.round(a / b * 100) + ' %' : '—'; };
  const ov = document.createElement('div'); ov.className = 'modal-overlay'; ov.id = 'cq-modal'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  ov.innerHTML = '<div class="modal-box" style="max-height:90vh;padding:0;"><div class="cq-h"><div><p class="cq-eb">30 derniers jours</p><p class="cq-t">📊 Qualité du Coach</p></div><button class="cq-x" onclick="document.getElementById(\'cq-modal\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body"><div class="cq-b"><div class="cq-tl">'
    + '<div><b>' + S.n + '</b><small>réponses</small></div><div><b>' + (S.up + S.down ? pct(S.up, S.up + S.down) : '—') + '</b><small>👍 ' + S.up + ' · 👎 ' + S.down + '</small></div>'
    + '<div><b>' + (S.latMed != null ? (S.latMed / 1000).toFixed(1).replace('.', ',') + ' s' : '—') + '</b><small>1er mot (voix)</small></div>'
    + '<div><b>' + pct(S.cut, S.voice) + '</b><small>coupées (voix)</small></div><div><b>' + S.fixes + '</b><small>chiffres corrigés</small></div><div><b>' + S.tools + '</b><small>données cherchées</small></div></div>'
    + '<p class="cq-s">Raisons des 👎</p>' + Object.keys(W).map(function(k){ const n = S.why[k] || 0; return '<div class="cq-r"><span>' + W[k] + '</span><i><u style="width:' + Math.round(n / maxW * 100) + '%"></u></i><b>' + n + '</b></div>'; }).join('')
    + (S.recentDown.length ? '<p class="cq-s">Dernières réponses à revoir</p>' + S.recentDown.map(function(x){ return '<div class="cq-d">« ' + esc(String(x.q || '').slice(0, 90)) + ' »<small>' + esc(String(x.a || '').slice(0, 160)) + (x.why ? ' · ' + esc(W[x.why] || x.why) : '') + '</small></div>'; }).join('') : '')
    + '<p class="cq-n">Le Coach relit tes notes à chaque question : les défauts relevés lui sont rappelés.</p></div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  mc.appendChild(ov);
}
