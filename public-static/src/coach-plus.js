// coach-plus.js — ce que le Coach (fil écrit et voix) partage :
// 1 · points à suivre (_coach_threads) : ouverts par le Coach (outil suivi_ouvrir, serveur) ou par l'app (douleur à la
//     validation), relancés une fois quand la relance est due (« Au fait, mollet gauche qui tire : ça va mieux ? »), fermés par
//     le Coach (suivi_fermer) ou à la main (Mes mémos) ; expirés après 21 jours.
// 4 · chiffres vérifiés (cvVerify) : avant d'être lus ou affichés, les chiffres d'une réponse sont comparés aux données de l'app
//     (séance passée citée par son jour, temps prévu, records, temps ↔ allure, allure EF, séance de demain) et corrigés.
// 9 · notes 👍 / 👎 (+ raison) sur chaque réponse (_coach_fb, lues par le serveur) et relevé local de qualité (pm_cq).
// + style commun des cartes (cfCardCss) pour l'écran vocal et le fil écrit.

// ─── jetons du relief (maquette « Coach à la voix ») ───
const CF_LIFT = 'background:linear-gradient(180deg,#1C2645,#141D36);border:1px solid #2A3760;box-shadow:inset 0 1px 0 rgba(255,255,255,.10),0 18px 40px rgba(0,0,0,.6);';
const CF_CARD = 'background:#111A2E;border:1px solid #1E2944;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 8px 20px rgba(0,0,0,.42);';
const CF_WELL = 'background:#0A1020;box-shadow:inset 0 2px 6px rgba(0,0,0,.65),inset 0 -1px 0 rgba(255,255,255,.04);';
function cfCardCss(S){
  return S + ' .cv-cd{border-radius:20px;padding:12px 14px;display:flex;flex-direction:column;gap:6px;text-align:left;' + CF_LIFT + '}'
    + S + ' .cv-cd.act{border-color:rgba(224,96,58,.55);background:radial-gradient(120% 90% at 0% 0%,rgba(224,96,58,.16),rgba(224,96,58,0) 55%),linear-gradient(180deg,#1C2645,#141D36);}'
    + S + ' .cv-cdh{margin:0;display:flex;justify-content:space-between;align-items:baseline;gap:10px;}' + S + ' .cv-cdh span{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#8C98B4;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' + S + ' .cv-cd.act .cv-cdh span{color:#E0603A;}' + S + ' .cv-cdh b{font-size:17px;font-weight:900;white-space:nowrap;font-variant-numeric:tabular-nums;color:#EEF1F7;}'
    + S + ' .cv-cdl{margin:0;font-size:13.5px;line-height:1.45;color:#C3CBDC;}' + S + ' .cv-cdl b{color:#EEF1F7;}'
    + S + ' .cv-sp{display:grid;grid-template-columns:42px 1fr 42px 48px;align-items:center;gap:8px;font-size:12.5px;font-variant-numeric:tabular-nums;min-height:18px;color:#EEF1F7;}' + S + ' .cv-sp span{color:#8C98B4;white-space:nowrap;}' + S + ' .cv-sp b{font-weight:800;}'
    + S + ' .cv-sp i{height:7px;border-radius:4px;' + CF_WELL + 'overflow:hidden;display:block;}' + S + ' .cv-sp u{display:block;height:100%;border-radius:4px;background:#F2B544;}' + S + ' .cv-sp.f u{background:#4FB3D9;}' + S + ' .cv-sp.l u{background:#E0603A;}' + S + ' .cv-sp small{color:#7C88A4;text-align:right;}'
    + S + ' .cv-tl{display:grid;grid-template-columns:repeat(auto-fit,minmax(70px,1fr));gap:6px;}' + S + ' .cv-tl div{border-radius:12px;padding:6px 8px;' + CF_WELL + '}' + S + ' .cv-tl small{display:block;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#8C98B4;}' + S + ' .cv-tl b{font-size:16px;font-weight:800;font-variant-numeric:tabular-nums;color:#EEF1F7;}'
    + S + ' .ok{color:#5BD08A!important;}' + S + ' .mid{color:#F2B544!important;}' + S + ' .low{color:#F06A5A!important;}'
    + S + ' .cv-ok{display:flex;gap:8px;margin-top:4px;}' + S + ' .cv-ok button{flex:1;height:42px;border-radius:13px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;color:#C3CBDC;background:transparent;border:1px solid #2A3760;}' + S + ' .cv-ok button:first-child{background:#E0603A;border-color:#E0603A;color:#0B1020;box-shadow:0 6px 16px rgba(224,96,58,.35);}'
    + S + ' .cf-fix{text-decoration:underline dotted #5BD08A;text-underline-offset:3px;}'
    + S + ' .cf-v{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:6px;}' + S + ' .cf-v button{border-radius:999px;border:1px solid #2A3760;background:transparent;color:#C3CBDC;font-size:12.5px;font-weight:700;padding:5px 10px;cursor:pointer;font-family:inherit;line-height:1.2;}'
    + S + ' .cf-v button[aria-pressed=true]{background:#1C2645;border-color:#4FB3D9;color:#EEF1F7;}' + S + ' .cf-v small{font-size:12px;color:#7C88A4;}';
}

// ─── 1 · Points à suivre ───
const CF_TTL = 21;
function _cfDays(a, b){ return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
function _cfIso(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function _cfAdd(iso, n){ const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return _cfIso(d); }
function cfThreads(st, today){
  const T = (st && st._coach_threads) || {}, t0 = new Date(today + 'T12:00:00').getTime();
  return Object.keys(T).map(function(id){ return Object.assign({ id: id }, T[id]); })
    .filter(function(x){ return x && x.t && !x.done && x.at && (t0 - x.at) / 86400000 <= CF_TTL; }).sort(function(a, b){ return a.at - b.at; });
}
// point dont la relance est due et pas encore demandée aujourd'hui (le plus ancien)
function cfThreadDue(st, today){ return cfThreads(st, today).filter(function(x){ return (!x.due || x.due <= today) && x.asked !== today; })[0] || null; }
function cfFollowQ(x){
  const t = String(x.t || '').replace(/\.$/, ''), lc = t.charAt(0).toLowerCase() + t.slice(1);
  if(x.k === 'douleur' || x.k === 'fatigue') return 'Au fait, ' + lc + ' : ça va mieux ?';
  if(x.k === 'essai') return 'Au fait, ' + lc + ' : alors, ça donne quoi ?';
  return 'Au fait, on devait en reparler : ' + lc + '.';
}
// douleur notée à la validation (3 derniers jours) → point à suivre de l'app, une fois par séance et par zone
const CF_PAIN = ['', 'légère', 'gênante', 'forte'];
function cfPainThreads(st, today, done){
  const T = (st && st._coach_threads) || {}, out = {};
  (done || []).forEach(function(s){
    const p = s.perf || {}, pn = p.pain;
    if(!pn || !(pn.level >= 1) || !s.date || _cfDays(s.date, today) > 3 || _cfDays(s.date, today) < 0) return;
    const z = pn.zone || 'Autre', id = ('p_' + s.date + '_' + z).replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60);
    if(T[id] || out[id]) return;
    const jour = new Date(s.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long' });
    out[id] = { t: 'Douleur ' + (z === 'Autre' ? '' : z.toLowerCase() + ' ') + (CF_PAIN[pn.level] || '') + ' après ' + String(s.title || 'la séance').replace(/\s+/g, ' ') + ' de ' + jour, k: 'douleur', at: new Date(s.date + 'T20:00:00').getTime(), due: _cfAdd(s.date, 1), src: 'app' };
    out[id].t = out[id].t.replace(/\s{2,}/g, ' ');
  });
  return out;
}
function _cfToday(){ return typeof prTodayIso === 'function' ? prTodayIso() : _cfIso(new Date()); }
function _cfWrite(path, v){ if(typeof syncSetPath === 'function') syncSetPath(path, v); }
function cfThreadsSync(){
  try {
    if(typeof state === 'undefined' || !state || (typeof coachAI === 'function' && !coachAI())) return;
    const today = _cfToday(), add = cfPainThreads(state, today, typeof prAllDone === 'function' ? prAllDone(today) : []);
    Object.keys(add).forEach(function(id){ _cfWrite(['_coach_threads', id], add[id]); });
  } catch(e) { diagSilent(e, 'coach-plus:cfThreadsSync'); }
}
function cfThreadClose(id, c){ _cfWrite(['_coach_threads', id, 'done'], { at: Date.now(), c: String(c || 'Réglé').slice(0, 120) }); }
function cfThreadAsked(id){ _cfWrite(['_coach_threads', id, 'asked'], _cfToday()); }
// changements envoyés par le serveur pendant une réponse (outil suivi_ouvrir / suivi_fermer) : gardés sans réécriture
function cfThreadsAdopt(ch){
  if(!ch || typeof state === 'undefined' || !state) return;
  const T = Object.assign({}, state._coach_threads || {}); Object.keys(ch).forEach(function(id){ T[id] = ch[id]; });
  if(typeof syncAdopt === 'function') syncAdopt('_coach_threads', T); else state._coach_threads = T;
}

// ─── 4 · Chiffres vérifiés ───
function _cfPs(p){ const m = String(p || '').match(/(\d{1,2})\s*['’:]\s*(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; }
function _cfP(sec){ return Math.floor(sec / 60) + '\'' + String(Math.round(sec % 60)).padStart(2, '0'); }
function _cfT(sec){ sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return h ? h + 'h' + String(m).padStart(2, '0') + (s ? '\'' + String(s).padStart(2, '0') : '') : m + '\'' + String(s).padStart(2, '0'); }
function _cfKm(v){ return String(Math.round(v * 10) / 10).replace('.', ','); }
// données de l'app pour la vérification (calculées une fois par réponse)
function cfFacts(today){
  today = today || _cfToday();
  const F = { today: today, done: [], plan: [], pred: null, raceKm: null, rec: {}, ef: null };
  try { F.done = (typeof prAllDone === 'function' ? prAllDone(today) : []).filter(function(s){ return s.date && _cfDays(s.date, today) <= 21; })
    .map(function(s){ const p = s.perf || {}; return { date: s.date, km: s.km, pace: _cfPs(p.pace), hr: parseInt(p.hr) || null, type: s.type }; }); } catch(e) { diagSilent(e, 'coach-plus:cfFacts'); }
  try { const st = typeof prRealState === 'function' ? prRealState() : state;
    F.plan = (typeof prSessions === 'function' ? prSessions(st) : []).filter(function(s){ return !s.done && !s.skip && s.type !== 'rest' && s.date >= today && _cfDays(today, s.date) <= 7; }).map(function(s){ return { date: s.date, km: s.kmPlan, type: s.type }; }); } catch(e) { diagSilent(e, 'coach-plus:cfFacts'); }
  try { const R = typeof prepRace === 'function' ? (prepRace() || {}) : {}; F.raceKm = R.km || null;
    const cat = typeof predRaceCat === 'function' ? predRaceCat(R) : null, P = cat && typeof predRace === 'function' ? predRace(cat, today) : null; if(P) F.pred = P.sec; } catch(e) { diagSilent(e, 'coach-plus:cfFacts'); }
  try { [['5', 'record_5km'], ['10', 'record_10km'], ['semi', 'record_semi'], ['marathon', 'record_marathon']].forEach(function(r){ const v = state[r[1]]; const s = v && typeof prTimeSec === 'function' ? prTimeSec(v) : null; if(s) F.rec[r[0]] = s; }); } catch(e) {}
  try { F.ef = _cfPs(typeof getBestEfPace === 'function' ? getBestEfPace() : null); } catch(e) { diagSilent(e, 'coach-plus:cfFacts'); }
  return F;
}
const CF_PACE_RE = /(\d{1,2})\s?['’](\d{2})(?:\s?(?:\/\s?km|min\/km|au kilom[eè]tre|par km|au km))/gi;
const CF_TIME_RE = /(\d{1,2})\s?h\s?(\d{2})(?:\s?['’]\s?(\d{2}))?|(\d{1,2}):(\d{2}):(\d{2})|\b(\d{2,3})\s?['’]\s?(\d{2})\b(?!\s?(?:\/\s?km|min\/km|au kilom|par km|au km))/g;
const CF_KM_RE = /(\d{1,3}(?:[.,]\d{1,2})?)\s?(?:km|kilom[eè]tres?)\b(?!\s?\/)/gi;
const CF_HR_RE = /(?:\bfc\b(?:\s(?:moyenne|de|à|a))?\s?|fr[ée]quence cardiaque\s(?:de\s|à\s)?)(\d{2,3})|(\d{2,3})\s?(?:bpm|pulsations)/gi;
const CF_DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const CF_TARGET = /\b(vis(?:e[rsz]?|ais|ait|ions)|cible|pr[ée]vue?s?|objectif|consigne|au lieu|plut[oô]t|devrai[st]?|zone|plafond|max|pic|demain|prochaine?|ce soir|cette semaine)\b/;
function _cfAll(re, s){ const out = []; let m; re.lastIndex = 0; while((m = re.exec(s))) out.push(m); return out; }
function _cfTimeOf(m){ if(m[1] != null) return +m[1] * 3600 + +m[2] * 60 + (m[3] ? +m[3] : 0); if(m[4] != null) return +m[4] * 3600 + +m[5] * 60 + +m[6]; return +m[7] * 60 + +m[8]; }
// jour d'une séance passée cité dans la phrase (hier, avant-hier, aujourd'hui / ce matin, lundi…, le 12)
function _cfDayRef(n, today){
  if(/avant[- ]hier/.test(n)) return _cfAdd(today, -2);
  if(/\bhier\b/.test(n)) return _cfAdd(today, -1);
  if(/aujourd['’]hui|ce matin|ce midi|tout [àa] l['’]heure/.test(n)) return today;
  const dm = n.match(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/);
  if(dm){ const want = CF_DAYS.indexOf(dm[1]); for(let i = 0; i <= 6; i++){ const d = _cfAdd(today, -i); if(new Date(d + 'T12:00:00').getDay() === want) return d; } }
  const dn = n.match(/\ble (\d{1,2})(?:er)?\b(?!\s?(?:km|h|min|'|’|bpm|%))/);
  if(dn){ for(let i = 0; i <= 31; i++){ const d = _cfAdd(today, -i); if(+d.slice(8) === +dn[1]) return d; } }
  return null;
}
function _cfSwap(s, m, to, fixes, why){ const from = m[0]; fixes.push({ from: from.trim(), to: String(to).trim(), why: why }); return s.slice(0, m.index) + to + s.slice(m.index + from.length); }
function cvVerifySentence(s, F){
  const fixes = [], n = ' ' + String(s).toLowerCase().replace(/[’]/g, "'") + ' ';
  if(!F || !/\d/.test(s)) return { text: s, fixes: fixes };
  let out = s;
  const target = CF_TARGET.test(n);
  // A · séance passée citée par son jour : allure, km, FC comparés à la séance faite ce jour-là (une seule)
  const day = _cfDayRef(n, F.today);
  if(day && !target && /s[ée]ance|sortie|footing|fractionn|tempo|longue|couru|run\b|course/.test(n)){
    const S = (F.done || []).filter(function(x){ return x.date === day; });
    if(S.length === 1){
      const x = S[0], P = _cfAll(CF_PACE_RE, out);
      if(P.length === 1 && x.pace){ const v = +P[0][1] * 60 + +P[0][2]; if(Math.abs(v - x.pace) > 3) out = _cfSwap(out, P[0], _cfP(x.pace) + P[0][0].replace(/^\d{1,2}\s?['’]\d{2}/, ''), fixes, 'allure de la séance'); }
      const K = _cfAll(CF_KM_RE, out);
      if(K.length === 1 && x.km){ const v = parseFloat(K[0][1].replace(',', '.')); if(Math.abs(v - x.km) > Math.max(0.3, x.km * 0.03)) out = _cfSwap(out, K[0], K[0][0].replace(K[0][1], _cfKm(x.km)), fixes, 'km de la séance'); }
      const H = _cfAll(CF_HR_RE, out);
      if(H.length === 1 && x.hr && !/\bmax|pic|plafond/.test(n)){ const v = +(H[0][1] || H[0][2]); if(Math.abs(v - x.hr) > 2) out = _cfSwap(out, H[0], H[0][0].replace(String(v), String(x.hr)), fixes, 'FC de la séance'); }
    }
  }
  // B · temps prévu sur la course (prédiction unique de l'app)
  const T = _cfAll(CF_TIME_RE, out);
  const predCtx = /pr[ée]di|tu vaux|temps pr[ée]vu|temps estim|[ée]quivalent/.test(n) || (/pr[ée]vu|estim|projet/.test(n) && /course|marathon|semi|jour j|\b10 ?km\b|\b5 ?km\b/.test(n));
  if(F.pred && predCtx && !/objectif|record/.test(n) && T.length === 1){
    const v = _cfTimeOf(T[0]); if(v > 600 && Math.abs(v - F.pred) / F.pred > 0.015) out = _cfSwap(out, T[0], _cfT(F.pred), fixes, 'temps prévu');
  }
  // C · records
  if(/record/.test(n)){
    const cats = [['marathon', /marathon/], ['semi', /\bsemi\b/], ['10', /\b10 ?km\b/], ['5', /\b5 ?km\b/]].filter(function(c){ return c[0] === 'marathon' ? c[1].test(n.replace(/semi[- ]?marathon/g, '')) : c[1].test(n); });
    const T2 = _cfAll(CF_TIME_RE, out);
    if(cats.length === 1 && T2.length === 1 && F.rec[cats[0][0]]){ const v = _cfTimeOf(T2[0]), r = F.rec[cats[0][0]]; if(Math.abs(v - r) > 1) out = _cfSwap(out, T2[0], _cfT(r), fixes, 'record'); }
  }
  // D · temps ↔ allure annoncés ensemble (« 42'00, soit 4'12/km »)
  const T3 = _cfAll(CF_TIME_RE, out), P3 = _cfAll(CF_PACE_RE, out);
  if(T3.length === 1 && P3.length === 1 && T3[0].index < P3[0].index && /soit|ce qui (fait|donne)|c'est[- ][àa][- ]dire|ça (fait|donne)|=/.test(n.slice(0))){
    const dm = n.match(/sur (?:les |un |une )?(\d{1,2}(?:[.,]\d)?) ?km/), d = /marathon/.test(n) && !/semi/.test(n) ? 42.195 : /\bsemi\b/.test(n) ? 21.0975 : dm ? parseFloat(dm[1].replace(',', '.')) : /\b10 ?km\b/.test(n) ? 10 : /\b5 ?km\b/.test(n) ? 5 : F.raceKm;
    const t = _cfTimeOf(T3[0]), p = +P3[0][1] * 60 + +P3[0][2];
    if(d > 0 && t > 600){ const want = Math.round(t / d); if(want >= 150 && want <= 600 && Math.abs(want - p) > 2) out = _cfSwap(out, P3[0], _cfP(want) + P3[0][0].replace(/^\d{1,2}\s?['’]\d{2}/, ''), fixes, 'allure de ce temps'); }
  }
  // E · ton allure EF actuelle
  if(F.ef && /\b(ef|endurance fondamentale)\b/.test(n) && /\b(ton|ta|tes) allure|actuelle|en ce moment|r[ée]elle/.test(n) && !/vise|cible|consigne|entre|fourchette/.test(n)){
    const P4 = _cfAll(CF_PACE_RE, out), all = _cfAll(/\d{1,2}\s?['’]\d{2}/g, out);
    if(P4.length === 1 && all.length === 1){ const v = +P4[0][1] * 60 + +P4[0][2]; if(Math.abs(v - F.ef) > 6) out = _cfSwap(out, P4[0], _cfP(F.ef) + P4[0][0].replace(/^\d{1,2}\s?['’]\d{2}/, ''), fixes, 'allure EF'); }
  }
  // F · séance de demain (km)
  if(/\bdemain\b/.test(n) && /s[ée]ance|sortie|footing|fractionn|tempo|longue|au programme|tu as|t'as/.test(n) && !/plut[oô]t|au lieu|propose|r[ée]dui|all[eè]g|ajoute|passe[rz]? [àa]/.test(n)){
    const tm = (F.plan || []).filter(function(x){ return x.date === _cfAdd(F.today, 1); }), K = _cfAll(CF_KM_RE, out);
    if(tm.length === 1 && tm[0].km && K.length === 1){ const v = parseFloat(K[0][1].replace(',', '.')); if(Math.abs(v - tm[0].km) > 0.3) out = _cfSwap(out, K[0], K[0][0].replace(K[0][1], _cfKm(tm[0].km)), fixes, 'km de la séance de demain'); }
  }
  return { text: out, fixes: fixes };
}
// texte entier (fil écrit) : phrase par phrase, retours à la ligne gardés
function cvVerify(text, F){
  const fixes = [];
  const out = String(text || '').split(/(\n+)/).map(function(line){
    if(/^\n+$/.test(line)) return line;
    return line.replace(/([.!?])\s+/g, '$1\u0001').split('\u0001').map(function(s){ const r = cvVerifySentence(s, F); fixes.push.apply(fixes, r.fixes); return r.text; }).join(' ');
  }).join('');
  return { text: out, fixes: fixes };
}
// corrections marquées dans le HTML rendu (soulignées, « corrigé par l'app »)
function cfMarkFixes(html, fixes){
  (fixes || []).forEach(function(f){ const i = html.indexOf(f.to); if(i >= 0) html = html.slice(0, i) + '<span class="cf-fix" title="Corrigé par l\'app (le Coach avait dit ' + String(f.from).replace(/"/g, '') + ')">' + f.to + '</span>' + html.slice(i + f.to.length); });
  return html;
}

// ─── 9 · Notes 👍 / 👎 et relevé de qualité ───
const CF_WHY = [['long', 'Trop long'], ['faux', 'Faux'], ['inutile', 'Pas utile'], ['flou', 'Pas clair']];
const _cfReplies = {};
function _cfLs(){ try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch(e) { return null; } }
function cfLogGet(){ const L = _cfLs(); try { return L ? JSON.parse(L.getItem('pm_cq') || '[]') || [] : []; } catch(e) { return []; } }
function _cfLogSet(a){ const L = _cfLs(); try { if(L) L.setItem('pm_cq', JSON.stringify(a.slice(-150))); } catch(e) {} }
// une réponse du Coach : relevé local (mode, coupée, délai, chiffres corrigés, recherches) + id pour la noter
function cfLog(o){
  const id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  _cfReplies[id] = { q: String(o.q || '').slice(0, 200), a: String(o.a || '').slice(0, 400), m: o.m || 'chat' };
  const a = cfLogGet(); a.push({ id: id, at: Date.now(), m: o.m || 'chat', cut: o.cut ? 1 : 0, lat: o.lat || null, fix: o.fix || 0, tools: o.tools || 0 }); _cfLogSet(a);
  return id;
}
function cfVoteHtml(id){ return '<div class="cf-v" data-id="' + id + '"><button type="button" aria-label="Bonne réponse" onclick="event.stopPropagation();cfVote(\'' + id + '\',1,this)">👍</button><button type="button" aria-label="Réponse à revoir" onclick="event.stopPropagation();cfVote(\'' + id + '\',-1,this)">👎</button></div>'; }
function _cfVoteSave(id, v, why){
  const r = _cfReplies[id] || {}, a = cfLogGet(), it = a.find(function(x){ return x.id === id; });
  if(it){ it.v = v; if(why) it.why = why; _cfLogSet(a); }
  const fb = { at: Date.now(), v: v, m: r.m || 'chat', q: r.q || '', a: r.a || '' }; if(why) fb.why = why;
  _cfWrite(['_coach_fb', id], fb);
  // 60 notes gardées au plus dans la base
  try { const all = Object.keys((state && state._coach_fb) || {}).sort(); if(all.length > 60) all.slice(0, all.length - 60).forEach(function(k){ _cfWrite(['_coach_fb', k], null); }); } catch(e) {}
}
function cfVote(id, v, btn){
  const box = btn && btn.closest ? btn.closest('.cf-v') : null;
  _cfVoteSave(id, v, null);
  if(!box) return;
  if(v > 0){ box.innerHTML = '<small>Merci 👍</small>'; return; }
  box.innerHTML = '<small>Pourquoi ?</small>' + CF_WHY.map(function(w){ return '<button type="button" onclick="event.stopPropagation();cfWhy(\'' + id + '\',\'' + w[0] + '\',this)">' + w[1] + '</button>'; }).join('');
}
function cfWhy(id, why, btn){ _cfVoteSave(id, -1, why); const box = btn && btn.closest ? btn.closest('.cf-v') : null; if(box) box.innerHTML = '<small>Merci, le Coach en tiendra compte.</small>'; }
// statistiques (30 jours) : réponses, notes, raisons, coupées, délai médian du 1er mot (voix), chiffres corrigés, recherches
function cfStats(log, fb, now){
  now = now || Date.now();
  const L = (log || []).filter(function(x){ return x && now - x.at < 30 * 86400000; });
  const V = Object.keys(fb || {}).map(function(k){ return fb[k]; }).filter(function(x){ return x && now - x.at < 30 * 86400000; });
  const why = {}; V.forEach(function(x){ if(x.v < 0 && x.why) why[x.why] = (why[x.why] || 0) + 1; });
  const lat = L.filter(function(x){ return x.m === 'voix' && x.lat > 0; }).map(function(x){ return x.lat; }).sort(function(a, b){ return a - b; });
  const voice = L.filter(function(x){ return x.m === 'voix'; });
  return { n: L.length, voice: voice.length, up: V.filter(function(x){ return x.v > 0; }).length, down: V.filter(function(x){ return x.v < 0; }).length, why: why,
    cut: voice.filter(function(x){ return x.cut; }).length, latMed: lat.length ? lat[Math.floor(lat.length / 2)] : null,
    fixes: L.reduce(function(a, x){ return a + (x.fix || 0); }, 0), tools: L.filter(function(x){ return x.tools > 0; }).length,
    recentDown: V.filter(function(x){ return x.v < 0; }).sort(function(a, b){ return b.at - a.at; }).slice(0, 5) };
}

// ─── 8 · Fil écrit du Coach au style « relief » de l'écran vocal (même page sombre, mêmes cartes, chiffres en pastilles) ───
// une feuille marquée data-th (jamais convertie par l'adaptateur du thème) ; les styles en ligne de l'écran sont recouverts
function cfChatCss(){
  if(typeof document === 'undefined' || !document.head || document.getElementById('cc-css')) return;
  const S = '#sc-coach', M = '#coach-messages';
  const st = document.createElement('style'); st.id = 'cc-css'; st.dataset.th = '1';
  st.textContent = S + '{background:#070B16!important;color:#EEF1F7;font-family:Manrope,system-ui,-apple-system,sans-serif;}'
    + '#coach-head{background:#070B16!important;border-bottom:1px solid #1E2944!important;}#coach-head .cc-ava{' + CF_CARD + 'border-radius:50%!important;}#coach-head .cc-title{color:#EEF1F7!important;}#coach-header-status{color:#8C98B4!important;}'
    + '#coach-head .cc-mic{width:38px;height:38px;flex-shrink:0;border-radius:50%;' + CF_CARD + 'color:#4FB3D9;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;}'
    + S + ' .cm-tog{' + CF_WELL + 'border-radius:12px;}' + S + ' .cm-tog button{color:#8C98B4;}' + S + ' .cm-tog button.on{background:#E0603A;color:#0B1020;}'
    + M + ',#pc-panel,#pc-messages{background:#070B16!important;}'
    + M + ' .chat-date-sep{background:transparent!important;color:#7C88A4!important;font-size:11px!important;font-weight:800!important;letter-spacing:.12em;text-transform:uppercase;text-align:center;border:none!important;}'
    + M + ' .cc-msg{display:flex;align-items:flex-start;gap:8px;}' + M + ' .cc-msg.cc-u{flex-direction:row-reverse;}'
    + M + ' .cc-av{width:30px;height:30px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:14px;' + CF_CARD + '}'
    + M + ' .cc-b{max-width:88%;padding:11px 13px;border-radius:6px 18px 18px 18px;' + CF_CARD + 'color:#EEF1F7;}'
    + M + ' .cc-u .cc-b{border-radius:18px 6px 18px 18px;background:rgba(224,96,58,.14);border:1px solid rgba(224,96,58,.35);box-shadow:none;color:#F7D6CA;}'
    + M + ' .cc-tx{font-size:15px;line-height:1.6;color:inherit!important;}' + M + ' .cc-tx p{color:inherit!important;}'
    + M + ' .cc-c .cc-tx strong{display:inline-block;padding:0 6px;border-radius:7px;' + CF_WELL + 'color:#F2B544!important;font-weight:800!important;line-height:1.45;font-variant-numeric:tabular-nums;}'
    + M + ' .cc-tm{font-size:10.5px;color:#7C88A4;margin:4px 0 0;text-align:right;}' + M + ' .cc-u .cc-tm{color:rgba(247,214,202,.6);}'
    + M + ' .cc-card{margin-top:9px;}'
    + M + ' .coach-typing span{color:#C3CBDC!important;}' + M + ' .coach-typing-dots i{background:#A78BFA!important;}'
    + M + ' .cc-bo{border-radius:20px!important;overflow:hidden;border:1px solid #2A3760!important;box-shadow:0 18px 40px rgba(0,0,0,.55)!important;}'
    + M + ' .cc-bb{background:#111A2E!important;color:#EEF1F7!important;}' + M + ' .cc-bb [data-coach-text]{color:#EEF1F7!important;}' + M + ' .cc-bb p{color:#E2E7F1!important;}' + M + ' .cc-bb strong{color:#F2B544!important;}'
    + M + ' .cc-bb div[style*="border-left"]{background:rgba(224,96,58,.12)!important;color:#F2B544!important;border-left-color:#E0603A!important;}'
    + M + ' button[style]{border-color:#2A3760!important;}'
    + M + ' div[style*="background:#fff"],' + M + ' div[style*="background:var(--bg)"],' + M + ' div[style*="background: rgb(255, 255, 255)"]{background:#111A2E!important;color:#EEF1F7!important;border-color:#1E2944!important;}'
    + '#coach-chat-foot,#pc-foot{background:linear-gradient(180deg,#1C2645,#141D36)!important;border-top:1px solid #2A3760!important;border-radius:22px 22px 0 0;}'
    + '#coach-input,#pc-input{background:#0A1020!important;box-shadow:inset 0 2px 6px rgba(0,0,0,.65)!important;border:1px solid #1E2944!important;color:#EEF1F7!important;}#coach-input::placeholder,#pc-input::placeholder{color:#7C88A4;}'
    + '#coach-send-btn,#pc-send{background:#E0603A!important;color:#0B1020!important;box-shadow:0 6px 16px rgba(224,96,58,.35);}#coach-voice-btn{background:#111A2E!important;border:1px solid #1E2944!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 8px 20px rgba(0,0,0,.42)!important;color:#4FB3D9!important;}'
    + S + ' .shortcut-chip{background:#111A2E!important;border:1px solid #1E2944!important;color:#C3CBDC!important;border-radius:999px!important;}'
    + '#coach-chat-foot button[onclick*="emo"]{background:transparent!important;border:1px solid #2A3760!important;color:#C3CBDC!important;}'
    + S + ' .pc-sum{' + CF_CARD + 'color:#EEF1F7;}' + S + ' .pc-sum-g b{color:#EEF1F7;}' + S + ' .pc-sum-g small,' + S + ' .pc-sum-g i,' + S + ' .pc-sum-n{color:#8C98B4;}'
    + S + ' .pc-sum-a{background:#0A1020;border-color:#2A3760;color:#C3CBDC;}'
    + S + ' .pc-m{color:#EEF1F7;}' + S + ' .pc-m.c{' + CF_CARD + '}' + S + ' .pc-m.c.soft{background:#0E1628;border-style:dashed;}' + S + ' .pc-m.u{background:rgba(224,96,58,.14);border:1px solid rgba(224,96,58,.35);color:#F7D6CA;}'
    + S + ' .pc-sys{background:#111A2E;color:#8C98B4;}' + S + ' .pc-card{background:#0E1628;border-color:#2A3760;}' + S + ' .pc-card.applied{background:rgba(91,208,138,.08);border-color:rgba(91,208,138,.35);}' + S + ' .pc-card-h{color:#F2B544;}'
    + S + ' .pc-ba{color:#C3CBDC;}' + S + ' .pc-ba em{color:#F2B544;}' + S + ' .pc-ch small{color:#8C98B4;}' + S + ' .pc-go{background:#E0603A;color:#0B1020;}' + S + ' .pc-no{background:transparent;border-color:#2A3760;color:#C3CBDC;}' + S + ' .pc-done{color:#5BD08A;}' + S + ' .pc-done button{background:transparent;}'
    + cfCardCss(M);
  document.head.appendChild(st);
}
try { cfChatCss(); } catch(e) { diagSilent(e, 'coach-plus:cfChatCss'); }
