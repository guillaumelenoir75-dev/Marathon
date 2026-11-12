// ─── Ce que le Coach sait de toi (compte admin) ─────────────────────────────────────────────────────────────
// Fiche modifiable state._coach_profile = { story, injuries, fixed: [{n, d, day (1 = lundi), t 'HH:MM', min, gap (h)}], gear, notes, at }
// lue par le Coach, les briefs et l'analyse de séance (serveur : coachProfileText / coachFixedRules / coachFixedToday,
// helpers.js) et par le contexte envoyé depuis l'app (activites_fixes_semaine, coach-context.js) — plus aucun fait
// personnel écrit en dur dans les consignes. Créée une fois à partir de ce que le Coach savait déjà (cpSeed, prepDailyTasks).
// Le prénom du compte (displayName Firebase) est recopié dans state._athlete_name pour les textes du serveur ({{PRENOM}}).
// Compte › Mon entraînement › « 🧠 Ce que le Coach sait de moi » (openCoachProfile).
const CP_DAYS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const CP_MAX = 600;
const CP_SEED = {
  story: 'Sportif depuis toujours. Course à pied au hasard en 2025, premier plan structuré en février 2026. Très motivé, veut progresser sans se blesser.',
  injuries: '1re prépa, S2 : légère douleur à la rotule gauche après une surcharge (30 km) → réduction + kiné, renfo kiné 2×/semaine depuis. Pas d\'autre problème médical.',
  fixed: [{ n: 'Bodyhit', d: 'électrostimulation full body avec un coach, focus jambes', day: 1, t: '12:30', min: 20, gap: 8 }],
  gear: 'Montre Garmin Forerunner 165',
  notes: ''
};
function cpGet(st){ st = st || (typeof state !== 'undefined' ? state : null); const p = st && st._coach_profile; return p && typeof p === 'object' ? p : null; }
function cpFixed(st){
  const p = cpGet(st);
  return (p && Array.isArray(p.fixed) ? p.fixed : []).filter(function(f){ return f && f.n && f.day >= 1 && f.day <= 7; });
}
function cpHm(t){ return t ? String(t).replace(':', 'h') : ''; }
function cpFixedLabel(f){ return f.n + ' ' + CP_DAYS[f.day] + (f.t ? ' ' + cpHm(f.t) : ''); }
// activités fixes de la semaine pour le Coach : faite / à venir à l'instant `now`
function cpFixedWeek(st, now){
  now = now || new Date();
  const dow = now.getDay() || 7, h = now.getHours() + now.getMinutes() / 60;
  return cpFixed(st).map(function(f){
    const hm = String(f.t || '00:00').split(':'), at = (+hm[0] || 0) + (+hm[1] || 0) / 60;
    const done = dow > f.day || (dow === f.day && h >= at);
    return { activite: f.n, quoi: f.d || null, jour: CP_DAYS[f.day], heure: f.t || null, duree_min: f.min || null, statut: done ? 'FAIT' : 'À VENIR', delai_min_avant_seance_intense_h: f.gap || null };
  });
}
// activités fixes d'un jour (1 = lundi … 7 = dimanche)
function cpFixedOn(st, dow){ return cpFixed(st).filter(function(f){ return f.day === dow; }); }
// nettoyage d'une fiche saisie (textes bornés, activités valides)
function cpClean(p){
  p = p || {};
  const txt = function(v){ return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, CP_MAX); };
  const fixed = (Array.isArray(p.fixed) ? p.fixed : []).map(function(f){
    const day = parseInt(f && f.day, 10), t = /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(f && f.t || '')) ? String(f.t).padStart(5, '0') : '';
    const min = parseInt(f && f.min, 10), gap = parseFloat(f && f.gap);
    const o = { n: txt(f && f.n).slice(0, 40), d: txt(f && f.d).slice(0, 120), day: day >= 1 && day <= 7 ? day : 0, t: t };
    if(min > 0 && min <= 300) o.min = min;
    if(gap > 0 && gap <= 72) o.gap = Math.round(gap * 2) / 2;
    return o;
  }).filter(function(f){ return f.n && f.day; }).slice(0, 8);
  return { story: txt(p.story), injuries: txt(p.injuries), fixed: fixed, gear: txt(p.gear).slice(0, 160), notes: txt(p.notes) };
}
// prénom du compte (displayName, sinon début de l'e-mail) — jamais écrit en dur
function athleteFirstName(){
  try {
    const u = typeof firebase !== 'undefined' && firebase.auth ? firebase.auth().currentUser : null;
    const n = String((u && (u.displayName || u.email)) || '').split(/[@\s.]/)[0];
    return n ? n.charAt(0).toUpperCase() + n.slice(1) : '';
  } catch(e) { return ''; }
}
// une fois (compte admin) : fiche créée à partir de ce que le Coach savait ; prénom tenu à jour pour le serveur
function cpSeed(){
  if((typeof _prepView !== 'undefined' && _prepView) || typeof isAdmin !== 'function' || !isAdmin() || typeof state === 'undefined') return;
  const up = {};
  if(state._coach_profile === undefined){ up._coach_profile = Object.assign(cpClean(CP_SEED), { at: new Date().toISOString(), seed: 1 }); }
  const n = athleteFirstName(); if(n && state._athlete_name !== n) up._athlete_name = n;
  if(!Object.keys(up).length) return;
  Object.assign(state, up);
  if(typeof dbRef !== 'undefined' && dbRef) dbRef.update(up).catch(function(){});
}

// ─── Écran ───
let _cpDraft = null;
const _cpEsc = function(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
function _cpCss(){
  if(document.getElementById('cp-css')) return;
  const s = document.createElement('style'); s.id = 'cp-css';
  s.textContent = '#cp-ov .cp-b{padding:14px 16px 24px;display:flex;flex-direction:column;gap:14px;}'
    + '#cp-ov label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:800;color:var(--ink-2,#334155);text-transform:uppercase;letter-spacing:.05em;}'
    + '#cp-ov label small{font-weight:600;text-transform:none;letter-spacing:0;color:var(--muted-2,#64748b);font-size:11.5px;}'
    + '#cp-ov textarea,#cp-ov input,#cp-ov select{font:inherit;font-size:14px;font-weight:500;text-transform:none;letter-spacing:0;color:var(--ink,#0f172a);background:var(--card,#fff);border:1.5px solid var(--line,#e2e8f0);border-radius:10px;padding:9px 10px;min-width:0;box-sizing:border-box;}'
    + '#cp-ov textarea{min-height:64px;resize:vertical;width:100%;}'
    + '#cp-ov .cp-fx{background:var(--card-2,#f8fafc);border:1px solid var(--line,#e2e8f0);border-radius:12px;padding:10px;display:grid;grid-template-columns:1fr 1fr;gap:6px;}'
    + '#cp-ov .cp-fx .w{grid-column:1/-1;}'
    + '#cp-ov .cp-fx button{grid-column:1/-1;justify-self:end;border:none;background:none;color:var(--bad,#dc2626);font-weight:700;font-size:12.5px;cursor:pointer;padding:2px 0;}'
    + '#cp-ov .cp-add{border:1.5px dashed var(--line,#cbd5e1);background:none;border-radius:12px;padding:10px;font-weight:800;color:var(--brand,#1B4FD8);cursor:pointer;font-size:13px;}'
    + '#cp-ov .cp-save{padding:13px;border:none;border-radius:14px;background:var(--brand,#1B4FD8);color:#fff;font-weight:900;font-size:14.5px;cursor:pointer;}'
    + '#cp-ov .cp-h{font-size:12px;font-weight:800;color:var(--ink-2,#334155);text-transform:uppercase;letter-spacing:.05em;margin:0;}';
  document.head.appendChild(s);
}
function _cpFxHtml(f, i){
  const days = CP_DAYS.map(function(d, k){ return k ? '<option value="' + k + '"' + (f.day === k ? ' selected' : '') + '>' + d + '</option>' : ''; }).join('');
  return '<div class="cp-fx" data-i="' + i + '">'
    + '<input class="w" data-k="n" placeholder="Nom (ex. Bodyhit, natation, vélo…)" maxlength="40" value="' + _cpEsc(f.n) + '" aria-label="Nom de l\'activité">'
    + '<input class="w" data-k="d" placeholder="En quoi ça consiste" maxlength="120" value="' + _cpEsc(f.d) + '" aria-label="Détail">'
    + '<select data-k="day" aria-label="Jour">' + days + '</select>'
    + '<input data-k="t" type="time" value="' + _cpEsc(f.t) + '" aria-label="Heure">'
    + '<input data-k="min" type="number" inputmode="numeric" min="0" max="300" placeholder="Durée (min)" value="' + (f.min || '') + '" aria-label="Durée en minutes">'
    + '<input data-k="gap" type="number" inputmode="decimal" min="0" max="72" step="0.5" placeholder="Pas d\'intensité avant (h)" value="' + (f.gap || '') + '" aria-label="Délai avant une séance intense, en heures">'
    + '<button type="button" onclick="cpFixedDel(' + i + ')">Retirer</button></div>';
}
function _cpRead(){
  const ov = document.getElementById('cp-ov'); if(!ov || !_cpDraft) return _cpDraft;
  ['story', 'injuries', 'gear', 'notes'].forEach(function(k){ const el = ov.querySelector('[data-f="' + k + '"]'); if(el) _cpDraft[k] = el.value; });
  _cpDraft.fixed = Array.prototype.map.call(ov.querySelectorAll('.cp-fx'), function(row){
    const o = {}; Array.prototype.forEach.call(row.querySelectorAll('[data-k]'), function(el){ o[el.getAttribute('data-k')] = el.value; });
    o.day = parseInt(o.day, 10) || 0; return o;
  });
  return _cpDraft;
}
function _cpRender(){
  const ov = document.getElementById('cp-ov'); if(!ov) return;
  const p = _cpDraft, box = ov.querySelector('.cp-b');
  const area = function(k, t, hint){ return '<label>' + t + '<small>' + hint + '</small><textarea data-f="' + k + '" maxlength="' + CP_MAX + '">' + _cpEsc(p[k]) + '</textarea></label>'; };
  box.innerHTML = area('story', 'Ton parcours', 'Depuis quand tu cours, ton niveau, ce qui te motive')
    + area('injuries', 'Santé et blessures', 'Douleurs passées, ce qui a aidé, points à surveiller')
    + '<p class="cp-h">Activités fixes</p>'
    + (p.fixed.length ? p.fixed.map(_cpFxHtml).join('') : '<p style="margin:0;font-size:13px;color:var(--muted-2,#64748b);">Aucune activité fixe</p>')
    + '<button type="button" class="cp-add" onclick="cpFixedAdd()">+ Ajouter une activité fixe</button>'
    + '<label>Matériel<small>Montre, capteurs…</small><input data-f="gear" maxlength="160" value="' + _cpEsc(p.gear) + '"></label>'
    + area('notes', 'À savoir aussi', 'Contraintes d\'horaires, préférences, travail…')
    + '<button type="button" class="cp-save" onclick="cpSave()">Enregistrer</button>';
}
function openCoachProfile(){
  _cpCss();
  const cur = cpGet() || CP_SEED;
  _cpDraft = JSON.parse(JSON.stringify(cpClean(cur)));
  const mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'cp-ov'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  ov.innerHTML = '<div class="modal-box" style="max-height:92vh;"><div style="flex-shrink:0;padding:16px;border-radius:24px 24px 0 0;color:#fff;background:linear-gradient(135deg,#1e3a8a,#4f46e5);display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">'
    + '<div><p style="font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;opacity:.8;margin:0;">Coach</p><p style="font-size:20px;font-weight:900;margin:2px 0;">🧠 Ce que le Coach sait de toi</p><p style="font-size:12.5px;margin:0;opacity:.85;">Lu par le Coach, les briefs et l\'analyse de tes séances</p></div>'
    + '<button onclick="document.getElementById(\'cp-ov\').remove()" aria-label="Fermer" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:34px;height:34px;border-radius:50%;font-size:20px;cursor:pointer;flex-shrink:0;">×</button></div>'
    + '<div class="modal-scroll-body"><div class="cp-b"></div></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  mc.appendChild(ov);
  _cpRender();
}
function cpFixedAdd(){ _cpRead(); _cpDraft.fixed.push({ n: '', d: '', day: 1, t: '', min: '', gap: '' }); _cpRender(); }
function cpFixedDel(i){ _cpRead(); _cpDraft.fixed.splice(i, 1); _cpRender(); }
function cpSave(){
  const p = Object.assign(cpClean(_cpRead()), { at: new Date().toISOString() });
  state._coach_profile = p;
  if(typeof save === 'function') save();
  const ov = document.getElementById('cp-ov'); if(ov) ov.remove();
  if(typeof showToast === 'function') showToast('Le Coach est à jour', '🧠');
  if(typeof renderCompteScreen === 'function') try { renderCompteScreen(); } catch(e) { if(typeof diagSilent === 'function') diagSilent(e, 'coach-profile:cpSave'); }
}
