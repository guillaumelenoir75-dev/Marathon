// Détail « Alcool » plein écran (à la demande : groupe « alcui », point d'entrée dans config.js) — sorti de alcohol.js.
function openAlcoholInsights(){
  _alcCss();
  const M = alcModel(), I = alcImpact(alcDay(), M), A = state._alcohol || {};
  // 7 dernières soirées toujours listées (même non renseignées), puis les plus anciennes saisies
  const last7 = []; for(let k = 0; k < 7; k++) last7.push(prAddDays(alcDay(), -k));
  const days = last7.concat(Object.keys(A).filter(function(d){ return last7.indexOf(d) < 0; }).sort().reverse()).slice(0, 24);
  const old = document.getElementById('alc-ins'); if(old) old.remove();
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'alc-ins'; ov.style.zIndex = '510'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  const rec = {}; ((state.whoop_data || {}).recoveries || []).forEach(function(r){ if(r && r.date) rec[r.date] = r; });
  const chk = {}; (M.check || []).forEach(function(c){ chk[c.date] = c; });
  const close = 'document.getElementById(\'alc-ins\').remove();';
  let h = '<div class="modal-box" style="max-height:90vh;"><div class="alc-ihead"><div><p class="alc-t">🍷 Alcool et récupération</p><p class="alc-sub">' + (M.personal ? 'Modèle perso · ' + M.nAlc + ' soirée' + (M.nAlc > 1 ? 's' : '') : 'Estimation générale') + '</p></div>'
    + '<button class="alc-x" onclick="' + close + '" aria-label="Fermer">×</button></div><div class="modal-scroll-body" style="background:#F5F3FA;"><div class="alc-ibody">';
  // ce matin : 3 chiffres + mesuré → sans alcool
  if(I){
    const F = typeof prFormScore === 'function' ? prFormScore() : null, SP = F ? alcFormSplit(F, alcDay(), M) : null, BL = alcBlood(I.l);
    h += '<div class="alc-today"><p class="alc-k">Ce matin · ' + (I.l ? I.l + '/10 hier' : '0 hier') + (I.prev ? ' · ' + I.prev + '/10 avant-hier' : '') + '</p>';
    if(SP) h += '<div class="alc-big"><div><small>Forme</small><b>' + SP.obs + '</b></div><div class="m"><small>Alcool</small><b>−' + SP.lost + '</b></div><div><small>Sans alcool</small><b>~' + SP.without + '</b>' + (SP.hi - SP.lo >= 2 ? '<em>' + SP.lo + '-' + SP.hi + '</em>' : '') + '</div></div>'
      + '<div class="alc-sp-bar alc-bigbar" aria-hidden="true"><i class="' + (SP.obs >= 67 ? 'ok' : SP.obs >= 34 ? 'mid' : 'low') + '" style="width:' + SP.obs + '%"></i><i class="alc" style="width:' + Math.max(0, SP.without - SP.obs) + '%"></i></div>'
      + '<table class="alc-tab"><thead><tr><th></th><th>Mesuré</th><th>Sans alcool</th><th>Écart</th></tr></thead><tbody>' + SP.comps.map(function(c){ return '<tr><td>' + c.lab + '</td><td>' + c.o + '</td><td>' + c.w + '</td><td>' + c.d + '</td></tr>'; }).join('') + '</tbody></table>';
    else h += '<div class="alc-big"><div class="m"><small>Récup</small><b>' + I.rec + '</b></div><div><small>VFC</small><b>' + I.hrv + ' %</b></div><div><small>FC</small><b>+' + _alcN(I.rhr) + '</b></div></div>';
    const meta = [];
    if(BL) meta.push('🥃 ≈ ' + _alcN(BL.drinks) + ' verres', '⏱ éliminé en ' + _alcN(BL.hours) + ' h');
    if(I.prev && I.l) meta.push('−' + Math.abs(I.recPrev) + ' pts d\'avant-hier');
    meta.push('✓ plan non allégé');
    h += '<div class="alc-pills">' + meta.map(function(x){ return '<span>' + x + '</span>'; }).join('') + '</div></div>';
  }
  // soirées à vérifier
  if(M.suspects && M.suspects.length) h += '<p class="alc-sec">À vérifier <span>réveil type lendemain d\'alcool</span></p><div class="alc-list">' + M.suspects.map(function(x){ return '<button type="button" class="alc-row sus" onclick="' + close + 'alcAsk({day:\'' + x.date + '\'})"><span>' + _alcEve(x.date, true) + '</span><b class="q">Alcool ?</b><small>FC +' + x.rhrUp + ' · VFC ' + x.hrvPct + ' %</small><em>' + x.rec + ' %</em></button>'; }).join('') + '</div>';
  // profil
  h += '<p class="alc-sec">Ton profil</p><div class="alc-card">' + _alcProfileHtml(M);
  const bb = M.bands.filter(function(x){ return x.n && x.lab !== 'Sans alcool'; }), mx = Math.max.apply(null, [M.base.rec || 0].concat(bb.map(function(x){ return x.rec || 0; })).concat([1]));
  if(bb.length && M.base.rec != null) h += '<div class="alc-bars">' + [{ lab: 'Sans alcool', n: M.base.n, rec: M.base.rec }].concat(bb).map(function(x){ return '<div class="alc-bar"><small>' + x.lab.replace(/ \(.*\)/, '') + '</small><i style="width:' + Math.round((x.rec || 0) / mx * 100) + '%"></i><b>' + x.rec + ' %</b></div>'; }).join('') + '</div>';
  h += '</div>';
  // 14 derniers réveils : récupération, soirées avec alcool en violet, base en pointillé
  const days14 = []; for(let k = 13; k >= 0; k--) days14.push(prAddDays(alcDay(), -k));
  if(days14.some(function(d){ return rec[d] && rec[d].score != null; })){
    const W = 320, H = 96, bw = W / 14, y = function(v){ return H - 14 - (v / 100) * (H - 22); };
    let g = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="alc-chart" role="img" aria-label="Récupération des 14 derniers réveils">';
    days14.forEach(function(d, i){
      const r = rec[d], e = A[d], ds = alcDose(d, M.carry) || 0, v = r && r.score != null ? +r.score : null;
      if(v != null) g += '<rect x="' + (i * bw + 3).toFixed(1) + '" y="' + y(v).toFixed(1) + '" width="' + (bw - 6).toFixed(1) + '" height="' + (H - 14 - y(v)).toFixed(1) + '" rx="3" class="' + (ds > 0 ? (e && e.l > 0 ? 'a' : 'c') : (M.suspects || []).some(function(x){ return x.date === d; }) ? 's' : 'n') + '"/>';
      g += '<text x="' + (i * bw + bw / 2).toFixed(1) + '" y="' + (H - 2) + '" text-anchor="middle">' + new Date(prAddDays(d, -1) + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'narrow' }) + '</text>';
    });
    if(M.base.rec != null) g += '<line x1="0" x2="' + W + '" y1="' + y(M.base.rec).toFixed(1) + '" y2="' + y(M.base.rec).toFixed(1) + '" class="b"/>';
    h += '<p class="alc-sec">Récup après chaque soirée <span>14 j</span></p><div class="alc-card">' + g + '</svg><div class="alc-leg"><span><i class="a"></i>alcool la veille</span><span><i class="c"></i>avant-hier</span><span><i class="n"></i>sans</span><span><i class="b"></i>ta base</span></div></div>';
  }
  // soirées : alcool, récup mesurée au réveil, récup prévue par le modèle
  h += '<p class="alc-sec">Tes soirées</p><div class="alc-list"><div class="alc-row ev hd"><span>Soirée</span><b>Alcool</b><small>Récup</small><em>Prévu</em></div>' + days.map(function(d){
    const e = A[d], r = rec[d], c = chk[d];
    return '<button type="button" class="alc-row ev" onclick="' + close + 'alcAsk({day:\'' + d + '\'})"><span>' + _alcEve(d, true) + '</span><b class="' + (!e ? 'q' : e.l > 0 ? 'y' : 'n') + '">' + (!e ? 'À remplir' : e.l > 0 ? e.l + '/10 ' + _alcIco(e.t) : 'Aucun') + '</b><small class="' + (r && r.score != null ? (r.score >= 67 ? 'g' : r.score >= 34 ? 'o' : 'r') : '') + '">' + (r && r.score != null ? r.score + ' %' : '—') + '</small><em>' + (c ? c.attendu + ' %' : '') + '</em></button>';
  }).join('') + '</div><p class="alc-note">Récup = au réveil le lendemain · toucher pour corriger</p>';
  // gabarit (replié) + copie des données
  const BD = alcBody();
  h += '<details class="alc-gab"><summary>Gabarit : ' + (BD ? BD.cm + ' cm · ' + _alcN(BD.kg) + ' kg' : 'à renseigner') + '</summary><div class="alc-body-f"><label>Taille <input id="alc-cm" type="number" inputmode="numeric" min="120" max="230" placeholder="cm" value="' + (BD ? BD.cm : '') + '"></label><label>Poids <input id="alc-kg" type="number" inputmode="decimal" step="0.1" min="30" max="250" placeholder="kg" value="' + (BD ? BD.kg : '') + '"></label>'
    + '<label>Sexe <select id="alc-sex"><option value="m"' + (!BD || BD.sex === 'm' ? ' selected' : '') + '>Homme</option><option value="f"' + (BD && BD.sex === 'f' ? ' selected' : '') + '>Femme</option></select></label><button type="button" onclick="alcSaveBody()">OK</button></div></details>'
    + '<button type="button" class="alc-copy" onclick="alcCopyDiag(this)">📋 Copier les données</button></div></div></div>';
  ov.innerHTML = h;
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
}
