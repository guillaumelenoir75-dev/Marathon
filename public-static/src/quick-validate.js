// Validation express : un raccourci (iPhone : app Raccourcis › « Ouvrir l'URL », ou l'écran d'accueil) ouvre
// https://prepa-marathon.web.app/?action=validate → la dernière activité Strava est rattachée à la bonne séance du plan
// (même jour de préférence, km les plus proches) et la validation s'ouvre déjà remplie : il ne reste qu'à relire et valider.
// qvMatch(activité, today) : séance à valider (testable) ; quickValidate() : enchaînement ; openQuickValidateHelp() : mode d'emploi.

const QV_URL = 'https://prepa-marathon.web.app/?action=validate';
function qvMatch(act, today){
  today = today || prTodayIso();
  if(!act || !act.date) return null;
  const st = typeof prRealState === 'function' ? prRealState() : state;
  // déjà validée (même jour, mêmes km à 300 m près) ?
  const done = typeof prAllDone === 'function' ? prAllDone(today) : [];
  const already = done.find(function(s){ return s.date === act.date && Math.abs(s.km - (act.distanceKm || 0)) <= 0.3; });
  if(already) return { already: already };
  const c = prSessions(st).filter(function(s){ return !s.done && !s.skip && s.type !== 'rest' && s.date && prDays(act.date, s.date) >= -3 && prDays(act.date, s.date) <= 1; })
    .map(function(s){ return { s: s, score: Math.abs(prDays(act.date, s.date)) * 10 + Math.abs((s.kmPlan || 0) - (act.distanceKm || 0)) + (s.type === 'race' && Math.abs(s.kmPlan - act.distanceKm) > 2 ? 50 : 0) }; })
    .sort(function(a, b){ return a.score - b.score; });
  return c.length ? { s: c[0].s } : null;
}
let _qvBusy = false;
async function quickValidate(){
  if(_qvBusy || (typeof _prepView !== 'undefined' && _prepView)) return;
  _qvBusy = true;
  const toast = function(t, i){ if(typeof showToast === 'function') showToast(t, i || '⚡'); };
  try {
    if(typeof showScreen === 'function') showScreen('home');
    toast('Recherche de ta dernière sortie Strava…', '🟠');
    let data = null; try { data = await _stravaFetch(); } catch(e) {}
    if(!data || data.needsAuth || !data.success || !(data.activities || []).length){
      toast(data && data.needsAuth ? 'Connecte Strava (Compte) pour la validation express' : 'Aucune sortie Strava récente trouvée', '🟠');
      return;
    }
    const act = data.activities[0], m = qvMatch(act);
    const dl = new Date(act.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
    if(m && m.already){ toast('Ta sortie du ' + dl + ' (' + String(act.distanceKm).replace('.', ',') + ' km) est déjà validée', '✅'); return; }
    if(!m){ toast('Aucune séance du plan autour du ' + dl + ' : valide-la depuis le Plan', '📅'); return; }
    openValidationModalExtra(m.s.w, m.s.ei);
    await new Promise(function(r){ setTimeout(r, 350); });
    const dEl = document.getElementById('val-date'); if(dEl) dEl.value = act.date;
    const btn = document.getElementById('strava-val-btn'); if(btn) btn.innerHTML = '⏳ Détails…';
    await _fetchAndApplyStravaDetail(act, 'validation');
    toast(String(act.distanceKm).replace('.', ',') + ' km importés pour « ' + m.s.title + ' » : relis et valide', '⚡');
  } catch(e) { console.warn('[validation express] ', e); }
  finally { _qvBusy = false; }
}
function openQuickValidateHelp(){
  const mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'qv-help'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  ov.innerHTML = '<div class="modal-box" style="max-height:90vh;"><div style="flex-shrink:0;padding:16px;border-radius:24px 24px 0 0;color:#fff;background:linear-gradient(135deg,#C2410C,#FC4C02);display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">'
    + '<div><p style="font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;opacity:.8;margin:0;">Compte</p><p style="font-size:20px;font-weight:900;margin:2px 0;">⚡ Validation express</p><p style="font-size:12.5px;opacity:.9;margin:0;">Ta dernière sortie Strava, rattachée à la bonne séance, en un geste</p></div>'
    + '<button onclick="document.getElementById(\'qv-help\').remove()" aria-label="Fermer" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:34px;height:34px;border-radius:50%;font-size:20px;cursor:pointer;flex-shrink:0;">×</button></div>'
    + '<div class="modal-scroll-body" style="background:#FFF7F3;"><div style="padding:14px 16px 24px;display:flex;flex-direction:column;gap:12px;font-size:13.5px;color:#431407;line-height:1.5;">'
    + '<button type="button" onclick="document.getElementById(\'qv-help\').remove();quickValidate()" style="padding:13px;border:none;border-radius:14px;background:#FC4C02;color:#fff;font-weight:900;font-size:14.5px;cursor:pointer;font-family:inherit;">⚡ Valider ma dernière sortie maintenant</button>'
    + '<div style="background:#fff;border:1px solid #FED7AA;border-radius:14px;padding:12px 14px;"><b>Raccourci iPhone (une fois)</b><ol style="margin:6px 0 0;padding-left:20px;">'
    + '<li>Ouvre l\'app <b>Raccourcis</b> › <b>+</b></li><li>Ajoute l\'action <b>« Ouvrir les URL »</b> et colle le lien ci-dessous</li><li>Nomme-le <b>« Valider ma séance »</b> : Siri, l\'écran d\'accueil ou le bouton Action le lancent</li></ol></div>'
    + '<div style="display:flex;gap:6px;"><input readonly value="' + QV_URL + '" style="flex:1;min-width:0;border:1.5px solid #FED7AA;border-radius:10px;padding:9px 10px;font-size:12.5px;font-family:inherit;background:#fff;color:#7C2D12;">'
    + '<button type="button" onclick="navigator.clipboard&&navigator.clipboard.writeText(QV_URL).then(function(){showToast(\'Lien copié\',\'📋\')})" style="border:none;border-radius:10px;background:#7C2D12;color:#fff;font-weight:800;padding:0 12px;cursor:pointer;font-family:inherit;">Copier</button></div>'
    + '<p style="font-size:12px;color:#9A3412;margin:0;">La séance du jour (ou la plus proche des 3 derniers jours) est choisie d\'après la date et les km. Rien n\'est enregistré sans ton « Valider ».</p></div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  mc.appendChild(ov);
}
