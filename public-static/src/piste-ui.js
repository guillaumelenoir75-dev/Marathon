// ─── « Piste de nuit » : le détail de la forme du jour, seulement au toucher (chargé à la demande, groupe pisteui) ──
// Feuille du bas : la note + une phrase, « ce qui fait ta note » (récupération, sommeil, pouls au repos, variabilité,
// chacun avec sa phrase comparée à tes 30 dernières nuits — phMeasures / phMeasureBase, piste-home.js), les ajustements
// de l'entraînement, l'alcool d'hier soir (« Modifier ») et « Voir l'évolution sur 7 jours ».

function phFormOpen(){
  try {
    phFormClose();
    const today = prTodayIso(), F = phFormNow(today);
    const N = typeof wellnessNight === 'function' ? wellnessNight() : {}, B = phMeasureBase(state, N.day || today), M = phMeasures(N, B);
    const E = _phEsc, cls = F ? (F.score >= 67 ? 'ok' : F.score >= 34 ? 'mid' : 'low') : '';
    const H = F ? phFormHead(F.score, _phSessToday) : { t: 'Forme du jour', s: 'Pas encore de note aujourd\'hui.' };
    _phUiCss();
    let h = '<div class="pfo-sh" role="dialog" aria-modal="true" aria-labelledby="pfo-t" tabindex="-1"><div class="pfo-grab" aria-hidden="true"></div>'
      + '<div class="pfo-hd">' + (F ? _phRing(F.score, cls, 72) : '') + '<div class="pfo-ht"><p id="pfo-t">' + E(H.t) + '</p><span>' + E(H.s) + '</span></div>'
      + '<button type="button" class="pfo-x" onclick="phFormClose()" aria-label="Fermer"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>';
    if(M.length) h += '<p class="pfo-h">Ce qui fait ta note</p><div class="pfo-rows">' + M.map(function(m){
      return '<div class="pfo-r"><span class="pfo-rt"><b>' + E(m.t) + '</b><span>' + E(m.txt) + '</span></span><b class="pfo-v ' + m.c + '">' + E(m.v) + '</b></div>'; }).join('') + '</div>';
    // ajustements de l'entraînement (charge, effort ressenti, douleur) : tout ce qui n'est pas une mesure de la nuit
    const adj = F ? (F.why || []).filter(function(x){ return !/^(récup|sommeil|FC repos|VFC) /.test(x); }) : [];
    if(adj.length) h += '<div class="pfo-adj">' + adj.map(function(x){ return '<p>' + E(_phCap(x)) + '</p>'; }).join('') + '</div>';
    // alcool d'hier soir (compte admin : même question que le réveil)
    if(typeof isAdmin === 'function' && isAdmin() && typeof alcEntry === 'function' && typeof alcDay === 'function'){
      const e = alcEntry(alcDay());
      let lost = '';
      try { const S = F && typeof alcFormSplit === 'function' ? alcFormSplit({ score: F.score, why: F.why }) : null; if(S && S.lost >= 3) lost = ' · −' + S.lost + ' pts (~' + S.without + ' sans alcool)'; } catch(err) { diagSilent(err, 'piste-ui:alc'); }
      h += '<div class="pfo-alc"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5FB3F2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/></svg>'
        + '<span>' + E(e ? (+e.l > 0 ? 'Alcool hier soir : ' + e.l + '/10' + lost : 'Pas d\'alcool hier soir' + lost) : 'Alcool hier soir : pas encore dit') + '</span>'
        + '<button type="button" onclick="phFormClose();alcAsk()">' + (e ? 'Modifier' : 'Répondre') + '</button></div>';
    }
    const wh = state.whoop_data && typeof whoopChartOpen === 'function';
    h += '<button type="button" class="pfo-go" onclick="phFormClose();' + (wh ? 'whoopChartOpen()' : 'showScreen(\'stats\')') + '">' + (wh ? 'Voir l\'évolution sur 7 jours' : 'Voir mes statistiques') + '</button></div>';
    const ov = document.createElement('div'); ov.id = 'ph-fo'; ov.className = 'pfo';
    ov.innerHTML = h;
    ov.addEventListener('click', function(ev){ if(ev.target === ov) phFormClose(); });
    document.addEventListener('keydown', _phFormKey);
    document.body.appendChild(ov);
    const sh = ov.querySelector('.pfo-sh'); if(sh && sh.focus) sh.focus({ preventScroll: true });
  } catch(e) { diagSilent(e, 'piste-ui:phFormOpen'); }
}
function phFormClose(){ const o = document.getElementById('ph-fo'); if(o) o.remove(); document.removeEventListener('keydown', _phFormKey); }
function _phFormKey(ev){ if(ev.key === 'Escape') phFormClose(); }

function _phUiCss(){
  if(document.getElementById('pfo-css')) return;
  if(typeof _phCss === 'function') _phCss();                         // anneau de la note (piste-home.js)
  const st = document.createElement('style'); st.id = 'pfo-css'; st.dataset.th = '1';
  const BS = "'Big Shoulders Display',Manrope,sans-serif";
  st.textContent = '.pfo{position:fixed;inset:0;z-index:400;background:rgba(3,6,14,.62);display:flex;align-items:flex-end;justify-content:center;font-family:Manrope,system-ui,sans-serif;color:#EEF1F8;}'
    + '.pfo-sh{width:100%;max-width:520px;max-height:88vh;overflow-y:auto;box-sizing:border-box;border-radius:30px 30px 0 0;background:#111A2E;box-shadow:0 -18px 40px rgba(0,0,0,.5);padding:12px 20px calc(env(safe-area-inset-bottom,0px) + 24px);display:flex;flex-direction:column;gap:16px;animation:pfoUp .22s ease-out;}'
    + '@keyframes pfoUp{from{transform:translateY(30px);opacity:.4;}}@media (prefers-reduced-motion:reduce){.pfo-sh{animation:none;}}'
    + '.pfo-grab{align-self:center;width:40px;height:5px;border-radius:3px;background:#2A3A63;}'
    + '.pfo-hd{display:flex;align-items:center;gap:16px;}.pfo-hd .ph-fring b{font-size:32px;}.pfo-ht{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;}'
    + '.pfo-ht p{margin:0;font-size:20px;font-weight:800;}.pfo-ht span{font-size:14px;color:#9AA4BF;line-height:1.4;}'
    + '.pfo-x{width:44px;height:44px;border-radius:50%;border:1px solid #1E2944;background:transparent;color:#9AA4BF;display:flex;align-items:center;justify-content:center;cursor:pointer;align-self:flex-start;flex-shrink:0;padding:0;}'
    + '.pfo-h{margin:0;font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#C9D1E4;}'
    + '.pfo-rows{display:flex;flex-direction:column;gap:10px;}'
    + '.pfo-r{border-radius:18px;background:#0A1020;padding:14px 16px;display:flex;align-items:center;gap:14px;}'
    + '.pfo-rt{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;}.pfo-rt b{font-size:15px;font-weight:700;}.pfo-rt span{font-size:13px;color:#9AA4BF;line-height:1.4;}'
    + '.pfo-v{font-family:' + BS + ';font-weight:800;font-size:26px;white-space:nowrap;color:#EEF1F8;}.pfo-v.ok{color:#6EE7A0;}.pfo-v.mid{color:#F2C14E;}.pfo-v.low{color:#F28B6E;}'
    + '.pfo-adj{display:flex;flex-direction:column;gap:4px;padding:0 4px;}.pfo-adj p{margin:0;font-size:13px;color:#9AA4BF;}'
    + '.pfo-alc{display:flex;align-items:center;gap:10px;padding:0 4px;}.pfo-alc span{flex:1;min-width:0;font-size:14px;color:#C9D1E4;}'
    + '.pfo-alc button{border:none;background:none;padding:8px 0;font:inherit;font-size:14px;font-weight:700;color:#E0603A;cursor:pointer;}'
    + '.pfo-go{min-height:50px;border-radius:25px;border:1px solid #2A3A63;background:transparent;color:#EEF1F8;font:inherit;font-size:15px;font-weight:700;cursor:pointer;}'
    + '.pfo-sh:focus{outline:none;}.pfo button:focus-visible{outline:2px solid #E0603A;outline-offset:2px;}';
  document.head.appendChild(st);
}
