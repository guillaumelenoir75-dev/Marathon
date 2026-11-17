// ─── Parler au Coach à la voix (compte admin, à la demande : groupe « voice », point d'entrée openCoachVoice) ───
// Conversation mains libres plein écran : tu parles (dictée fr-FR), le Coach répond en mode « voix » (réponse courte faite
// pour être écoutée, responseMode 'voix' de coachChat) et commence à parler dès sa 1re phrase reçue (cvSentences) ; à la fin
// de sa réponse, l'écoute reprend toute seule. Toucher la bulle pendant qu'il parle = l'interrompre et parler. Les échanges
// restent dans le fil du Coach (sendCoachMessage, même historique). Textes rendus prononçables (cvSpeakable : allures, FC,
// abréviations, sans émojis ni markdown). Sans dictée dans le navigateur : on peut quand même écrire, le Coach répond à voix haute.
// Fin de tour intelligente (cvTurnWait : phrase visiblement pas finie → on attend plus), petits sons d'écoute / d'envoi (yeux
// libres), fil des derniers échanges, réglages (vitesse, voix, sons, écoute automatique — localStorage pm_cv), suggestions
// selon le moment (cvSuggest : séance du jour, matin, soir, dimanche), toucher la réponse = la relire, mémos chargés une fois.
let _cv = null;

// texte du Coach → texte à prononcer
function cvSpeakable(t){
  return String(t || '')
    .replace(/\[FEU:[^\]]*\]/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ').replace(/[`*_#>|]/g, ' ')
    .replace(/\p{Extended_Pictographic}|️|‍|[●○★☆✓✅⚠️➜→•▪︎·]/gu, ' ')
    .replace(/(\d{1,2})\s*h\s*(\d{2})(?:\s*min)?(?:\s*['’]\s*(\d{2}))?/g, function(m, h, mi, se){ return h + ' heure' + (+h > 1 ? 's ' : ' ') + mi + (se ? ' et ' + se + ' secondes' : ''); })
    .replace(/(\d{1,2})\s*['’]\s*(\d{2})(?:["”]|'')?(\s*\/\s*km)?/g, function(m, mi, se, km){ return mi + ' minute' + (+mi > 1 ? 's' : '') + (se === '00' ? '' : ' ' + se) + (km ? ' au kilomètre' : ''); })
    .replace(/(\d{1,3})\s*['’](?!\d)/g, function(m, mi){ return mi + ' minute' + (+mi > 1 ? 's' : ''); })
    .replace(/(\d)\s*%/g, '$1 pour cent')
    .replace(/\/\s*km\b/g, ' au kilomètre')
    .replace(/(\d)\s*km\b/g, '$1 kilomètres').replace(/\bkm\b/g, 'kilomètres')
    .replace(/(\d)\s*bpm\b/gi, '$1 pulsations').replace(/\bbpm\b/gi, 'pulsations')
    .replace(/\bFC\s*max\b/g, 'fréquence cardiaque max').replace(/\bFC\b/g, 'fréquence cardiaque')
    .replace(/\bVFC\b/g, 'variabilité cardiaque').replace(/\bEF\b/g, 'endurance fondamentale').replace(/\bVMA\b/g, 'V M A')
    .replace(/\bS(\d{1,2})\b/g, 'semaine $1').replace(/\bJ\s*-\s*(\d+)\b/g, 'J moins $1')
    .replace(/(\d),(\d)/g, '$1 virgule $2')
    .replace(/\s*\n+\s*/g, '. ').replace(/\.(\s*\.)+/g, '.').replace(/\s{2,}/g, ' ').trim();
}
// tour de parole court (conversation) : 1re phrase toujours, 2e si le total reste ≤ 40 mots, 3e seulement une courte question
// de relance ; au-delà, la réponse est coupée (ni lue ni affichée). Détail demandé (long) : jusqu'à 14 phrases / 170 mots.
const CV_MAX_WORDS = 40, CV_LONG_WORDS = 170, CV_LONG_SENT = 14;
function cvKeep(n, words, s, long){
  const w = String(s || '').trim().split(/\s+/).filter(Boolean).length;
  if(n === 0) return true;
  if(long) return n < CV_LONG_SENT && words + w <= CV_LONG_WORDS;
  if(words + w > CV_MAX_WORDS) return false;
  if(n === 1) return true;
  return n === 2 && /\?\s*$/.test(s) && w <= 10;
}
// la question demande-t-elle le détail ? (plan km par km, liste, explication…) ; « oui » juste après une réponse coupée aussi
const CV_LONG_RE = /(km|kilom[eè]tres?)\s+(par|apr[eè]s)\s+(km|kilom[eè]tre)|d[ée]tail|plan de course|strat[ée]gie de course|toutes? les|chaque (km|kilom|s[ée]ance|jour|bloc)|\bliste\b|[ée]tape par [ée]tape|\bprogramme\b|explique|r[ée]sum[ée]|\bbilan\b|\bcompl[eè]te?\b|ma semaine|cette semaine|la semaine prochaine/i;
const CV_YES_RE = /^(oui|ouais|ouep|yes|vas[- ]y|ok|okay|d'accord|go|je veux bien|volontiers|carr[ée]ment|bien s[uû]r|continue|la suite|dis[- ]moi|avec plaisir)\b/i;
function cvWantsLong(text, prevCut){
  const t = String(text || '').trim().replace(/[’]/g, "'");
  return CV_LONG_RE.test(t) || (!!prevCut && CV_YES_RE.test(t));
}
// découpe le flux en phrases complètes : {out: [phrases prêtes], rest: début de la suivante} ; final = tout ce qui reste
function cvSentences(buf, final){
  const out = []; let rest = String(buf || ''), m;
  const re = /^([\s\S]*?[.!?…:](?=\s)|[\s\S]*?\n)\s*/;
  while((m = rest.match(re))){
    const s = m[1].trim(); rest = rest.slice(m[0].length);
    if(!s) continue;
    if(out.length && out[out.length - 1].length < 18) out[out.length - 1] += ' ' + s;   // pas de bout de phrase isolé
    else out.push(s);
  }
  if(final && rest.trim()){ out.push(rest.trim()); rest = ''; }
  return { out: out, rest: rest };
}
// délai de silence avant d'envoyer : plus long si la phrase est visiblement inachevée (« et », « parce que », « euh »…)
const CV_UNFINISHED = /(?:^|\s)(et|mais|donc|or|car|parce que|puisque|alors|ensuite|puis|euh+|heu+|hum+|ben|bah|genre|enfin|de|du|des|le|la|les|l|un|une|à|au|aux|pour|avec|sans|sur|sous|dans|en|par|que|qu|qui|quoi|si|ou|où|comme|quand|comment|pourquoi|combien|est-ce que|est-ce qu|mon|ma|mes|ton|ta|tes|son|sa|ses|ce|cette|ces|je|tu|il|on|j|c|d|n|s|t|plus|moins|très|trop|assez|vers|entre|après|avant|depuis)$/i;
function cvTurnWait(text, settled){
  const t = String(text || '').trim().toLowerCase().replace(/[’]/g, "'").replace(/[.,;:!]+$/, '');
  if(!t) return 1400;
  if(CV_UNFINISHED.test(t.replace(/'$/, ''))) return 2600;          // « … parce que » : il continue
  if(/\?$/.test(String(text).trim()) || /^(est-ce|comment|pourquoi|quand|combien|quel|quelle|qu'est|que dois|dois-je|peux-tu|tu peux)\b/.test(t) && t.split(/\s+/).length >= 4) return settled ? 600 : 1000;
  return settled ? 750 : 1350;
}
// suggestions selon le moment : séance du jour pas encore faite, matin, soir, dimanche
function cvSuggest(st, now){
  now = now || new Date();
  const h = now.getHours(), dow = now.getDay(), out = [];
  const iso = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  let today = null;
  try { if(typeof prSessions === 'function') today = prSessions(st || state).filter(function(s){ return s.date === iso && !s.done && !s.skip; })[0] || null; } catch(e) { diagSilent(e, 'coach-voice:cvSuggest'); }
  if(today){
    const hr = parseInt(String((today.x && today.x.sched_time) || ''), 10);
    const when = hr >= 17 ? 'de ce soir' : hr >= 0 && hr < 12 ? 'de ce matin' : 'du jour';
    out.push(h < 20 ? 'Comment j\'aborde ma séance ' + when + ' ?' : 'Pas encore fait ma séance, je fais quoi ?');
  }
  if(h < 11) out.push('Qu\'est-ce que j\'ai aujourd\'hui ?');
  if(dow === 0) out.push('Fais-moi le bilan de ma semaine');
  if(h >= 18) out.push('Qu\'est-ce que je fais demain ?');
  if(!today && h >= 11 && h < 18) out.push('Comment je récupère aujourd\'hui ?');
  ['Où j\'en suis pour mon objectif ?', 'Fais-moi le point sur ma semaine', 'Qu\'est-ce que je fais demain ?'].forEach(function(x){ if(out.indexOf(x) < 0) out.push(x); });
  return out.slice(0, 3);
}
// ─── Commandes vocales traitées sur le téléphone (instantané, sans le Coach) ───
// alcool d'hier soir, lire le brief, « j'ai fini » (validation), ouvrir un écran, répéter, vitesse de la voix, fin de conversation.
// Une question (« est-ce que l'alcool… ? ») n'est jamais prise pour une commande.
const CV_NUM = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12 };
const CV_SCREENS = [[/plan|programme/, 'plan', 'ton plan'], [/stat/, 'stats', 'tes statistiques'], [/accueil|journ[ée]e/, 'home', 'l\'accueil'], [/compte|r[ée]glage/, 'compte', 'ton compte'], [/renfo|renforcement/, 'renfo', 'le renfo']];
function cvIntent(text){
  const raw = String(text || '').trim(), t = raw.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').replace(/[.!]+$/, '');
  if(!t) return null;
  const question = /\?$/.test(raw) || /^(est-ce|est ce|pourquoi|comment|combien|quel|quelle|qu'est-ce|que penses|tu penses|à ton avis|dis-moi si)/.test(t);
  const words = t.split(' ').length;
  if(!question){
    if(/^(pas d'alcool|aucun alcool|z[ée]ro alcool|rien bu|je n'ai (rien|pas) bu|j'ai rien bu|pas bu)/.test(t)) return { k: 'alc', l: 0, t: [] };
    let m = t.match(/^(?:hier soir,? )?(?:j'ai bu|j'ai pris|j ai bu)\s+(\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze)\s+(verres? de vin|verres? d'alcool|verres?|bi[èe]res?|demis?|pintes?|coupes?|ballons?|cocktails?|shots?|whisky)/);
    if(m){
      let n = /^\d+$/.test(m[1]) ? +m[1] : CV_NUM[m[1]] || 0; const w = m[2];
      if(/pinte/.test(w)) n *= 2;                                  // une pinte ≈ 2 verres standard
      let l = 0; while(l < ALC_DRINKS_CV.length - 1 && ALC_DRINKS_CV[l] < n) l++;
      const ty = /bi[èe]re|demi|pinte/.test(w) ? ['beer'] : /vin|coupe|ballon/.test(w) ? ['wine'] : /whisky|shot|cocktail|alcool/.test(w) ? ['spirits'] : [];
      return { k: 'alc', l: l, t: ty, n: n };
    }
    m = t.match(/^(?:alcool|j'ai bu)\s*:?\s*(\d{1,2})\s*(?:sur|\/)\s*10$/); if(m && +m[1] <= 10) return { k: 'alc', l: +m[1], t: [] };
    if(/^(lis|lit|relis|lire|lis-moi|lit-moi|relis-moi|tu peux lire|tu me lis)\b.*\bbrief\b/.test(t) || /^(mon|le) brief( du matin)?$/.test(t)) return { k: 'brief' };
    if(/^(j'ai fini|j'ai termin[ée]|je viens de finir|je viens de terminer|valide ma s[ée]ance|valider ma s[ée]ance|s[ée]ance termin[ée]e)/.test(t)) return { k: 'fin' };
    if(/^(ouvre|montre|affiche|va (sur|dans|à|au)|emm[eè]ne-moi)/.test(t) && words <= 6){ for(const S of CV_SCREENS){ if(S[0].test(t)) return { k: 'go', s: S[1], label: S[2] }; } }
    if(/^(r[ée]p[èe]te|tu peux r[ée]p[ée]ter|redis|redis-le|encore une fois)/.test(t) && words <= 5) return { k: 'repeat' };
    if(/(parle|parles|lis|va) (un peu )?(plus )?(lentement|moins vite|doucement)/.test(t) && words <= 7) return { k: 'rate', d: -1 };
    if(/(parle|parles|lis|va) (un peu )?plus vite|acc[ée]l[eè]re/.test(t) && words <= 7) return { k: 'rate', d: 1 };
    if(/^(stop|arr[êe]te|c'est tout|merci,? c'est tout|ce sera tout|au revoir|à plus|ciao|bonne (nuit|soir[ée]e|journ[ée]e)|merci coach)\b/.test(t) && words <= 5) return { k: 'bye' };
  }
  return null;
}
const ALC_DRINKS_CV = typeof ALC_DRINKS !== 'undefined' ? ALC_DRINKS : [0, 1, 2, 3, 3.5, 5, 6, 7.5, 9, 11, 13];
// réglages (par téléphone) : vitesse, voix, sons, écoute automatique après la réponse
const CV_RATES = [['Lente', 0.92], ['Normale', 1.05], ['Rapide', 1.2]];
function _cvPrefs(){ let p = {}; try { p = JSON.parse(localStorage.getItem('pm_cv') || '{}') || {}; } catch(e) {} return { rate: +p.rate || 1.05, voice: p.voice || '', sounds: p.sounds !== false, auto: p.auto !== false, greet: p.greet !== false, filler: p.filler !== false, tone: p.tone || '', barge: p.barge === true }; }
function _cvPrefsSet(k, v){ const p = _cvPrefs(); p[k] = v; try { localStorage.setItem('pm_cv', JSON.stringify(p)); } catch(e) {} if(_cv){ _cv.prefs = p; if(k === 'voice') _cv.voice = _cvVoice(); } }
function _cvRecClass(){ return typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition || null) : null; }
function _cvVoices(){ if(typeof speechSynthesis === 'undefined') return []; return speechSynthesis.getVoices().filter(function(v){ return /^fr(-|_|$)/i.test(v.lang); }); }
function _cvVoice(){
  const V = _cvVoices(), want = (_cv && _cv.prefs && _cv.prefs.voice) || _cvPrefs().voice;
  if(want){ const w = V.filter(function(v){ return v.name === want; })[0]; if(w) return w; }
  const score = function(v){ return (/fr-FR/i.test(v.lang) ? 4 : 0) + (/premium|enhanced|améliorée|neural|natural/i.test(v.name) ? 3 : 0) + (/Amélie|Thomas|Audrey|Aurélie|Google/i.test(v.name) ? 2 : 0) + (v.localService ? 1 : 0); };
  return V.slice().sort(function(a, b){ return score(b) - score(a); })[0] || null;
}
// petits sons (yeux libres) : écoute ouverte = deux notes montantes, question envoyée = une note
function _cvTone(kind){
  if(!_cv || !_cv.prefs.sounds) return;
  try {
    const A = _cv.ac || (_cv.ac = new (window.AudioContext || window.webkitAudioContext)());
    const notes = kind === 'listen' ? [[660, 0], [880, 0.09]] : [[520, 0]];
    notes.forEach(function(n){
      const o = A.createOscillator(), g = A.createGain(), t0 = A.currentTime + n[1];
      o.type = 'sine'; o.frequency.value = n[0]; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
      o.connect(g); g.connect(A.destination); o.start(t0); o.stop(t0 + 0.16);
    });
  } catch(e) {}
}
function _cvCss(){
  if(document.getElementById('cv-css')) return;
  // maquette « Coach à la voix » : fil de discussion en relief (page #070B16, cartes posées, carte en avant, creux),
  // une couleur par état (écoute bleu, réflexion violet, parole ambre, à valider orange) ; écran sombre dans tous les thèmes
  const s = document.createElement('style'); s.id = 'cv-css'; s.dataset.th = '1';   // déjà sombre : jamais convertie
  const LIFT = 'background:linear-gradient(180deg,#1C2645,#141D36);border:1px solid #2A3760;box-shadow:inset 0 1px 0 rgba(255,255,255,.10),0 18px 40px rgba(0,0,0,.6);';
  const CARD = 'background:#111A2E;border:1px solid #1E2944;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 8px 20px rgba(0,0,0,.42);';
  const WELL = 'background:#0A1020;box-shadow:inset 0 2px 6px rgba(0,0,0,.65),inset 0 -1px 0 rgba(255,255,255,.04);';
  s.textContent = '#cv-ov{position:fixed;inset:0;z-index:9000;display:flex;flex-direction:column;color:#EEF1F7;background:#070B16;padding-top:calc(env(safe-area-inset-top) + 12px);box-sizing:border-box;font-family:Manrope,system-ui,-apple-system,sans-serif;}#cv-ov *{box-sizing:border-box;}'
    + '#cv-ov .cv-top{display:flex;align-items:center;gap:10px;padding:0 16px;}#cv-ov .cv-top span{flex:1;min-width:0;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#8C98B4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '#cv-ov .cv-x,#cv-ov .cv-gear{width:40px;height:40px;flex-shrink:0;border-radius:50%;' + CARD + 'color:#C3CBDC;font-size:16px;cursor:pointer;font-family:inherit;}'
    + '#cv-ov .cv-ctx{display:flex;gap:6px;overflow-x:auto;padding:10px 16px 2px;scrollbar-width:none;flex-shrink:0;}#cv-ov .cv-ctx::-webkit-scrollbar{display:none;}#cv-ov .cv-ctx:empty{display:none;}'
    + '#cv-ov .cv-ctx span{flex-shrink:0;display:inline-flex;align-items:center;height:30px;padding:0 11px;border-radius:15px;' + CARD + 'font-size:12.5px;font-weight:700;color:#C3CBDC;white-space:nowrap;}'
    + '#cv-ov .cv-th{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;gap:9px;padding:12px 16px 16px;}'
    + '#cv-ov .cv-log{display:flex;flex-direction:column;gap:9px;}#cv-ov .cv-log:empty{display:none;}'
    + '#cv-ov .cv-log .u,#cv-ov .cv-you{align-self:flex-end;max-width:86%;margin:0;padding:10px 13px;border-radius:18px 6px 18px 18px;background:rgba(224,96,58,.14);border:1px solid rgba(224,96,58,.35);color:#F7D6CA;font-size:15px;font-weight:600;line-height:1.4;cursor:text;}'
    + '#cv-ov .cv-log .c,#cv-ov .cv-co{align-self:flex-start;max-width:90%;margin:0;padding:10px 13px;border-radius:6px 18px 18px 18px;' + CARD + 'font-size:15px;line-height:1.5;}'
    + '#cv-ov .cv-log .c::before,#cv-ov .cv-co::before{content:"Coach";display:block;font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#7C88A4;margin-bottom:3px;}'
    + '#cv-ov .cv-log .c{color:#C3CBDC;}#cv-ov .cv-co{cursor:pointer;}#cv-ov .cv-you:empty,#cv-ov .cv-co:empty,#cv-ov .cv-card:empty{display:none;}#cv-ov .cv-you.interim{opacity:.65;}'
    + '#cv-ov .cv-num{display:inline-block;padding:0 6px;border-radius:7px;' + WELL + 'font-weight:800;color:#F2B544;font-variant-numeric:tabular-nums;line-height:1.4;}'
    + '#cv-ov .cv-co mark{background:linear-gradient(180deg,transparent 55%,rgba(242,181,68,.35) 55%);color:#fff;}'
    + '#cv-ov .cv-card,#cv-ov .cv-log .k{width:100%;}'
    + '#cv-ov .cv-cd{border-radius:20px;padding:12px 14px;display:flex;flex-direction:column;gap:6px;text-align:left;' + LIFT + '}'
    + '#cv-ov .cv-cd.act{border-color:rgba(224,96,58,.55);background:radial-gradient(120% 90% at 0% 0%,rgba(224,96,58,.16),rgba(224,96,58,0) 55%),linear-gradient(180deg,#1C2645,#141D36);}'
    + '#cv-ov .cv-log .cv-cd{opacity:.8;}'
    + '#cv-ov .cv-cdh{margin:0;display:flex;justify-content:space-between;align-items:baseline;gap:10px;}#cv-ov .cv-cdh span{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#8C98B4;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}#cv-ov .cv-cd.act .cv-cdh span{color:#E0603A;}#cv-ov .cv-cdh b{font-size:17px;font-weight:900;white-space:nowrap;font-variant-numeric:tabular-nums;}'
    + '#cv-ov .cv-cdl{margin:0;font-size:13.5px;line-height:1.45;color:#C3CBDC;}#cv-ov .cv-cdl b{color:#EEF1F7;}'
    + '#cv-ov .cv-sp{display:grid;grid-template-columns:42px 1fr 42px 48px;align-items:center;gap:8px;font-size:12.5px;font-variant-numeric:tabular-nums;min-height:18px;}#cv-ov .cv-sp span{color:#8C98B4;}#cv-ov .cv-sp b{font-weight:800;}'
    + '#cv-ov .cv-sp i{height:7px;border-radius:4px;' + WELL + 'overflow:hidden;display:block;}#cv-ov .cv-sp u{display:block;height:100%;border-radius:4px;background:#F2B544;}#cv-ov .cv-sp.f u{background:#4FB3D9;}#cv-ov .cv-sp.l u{background:#E0603A;}#cv-ov .cv-sp small{color:#7C88A4;text-align:right;}'
    + '#cv-ov .cv-tl{display:grid;grid-template-columns:repeat(auto-fit,minmax(70px,1fr));gap:6px;}#cv-ov .cv-tl div{border-radius:12px;padding:6px 8px;' + WELL + '}#cv-ov .cv-tl small{display:block;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#8C98B4;}#cv-ov .cv-tl b{font-size:16px;font-weight:800;font-variant-numeric:tabular-nums;}'
    + '#cv-ov .ok{color:#5BD08A;}#cv-ov .mid{color:#F2B544;}#cv-ov .low{color:#F06A5A;}'
    + '#cv-ov .cv-ok{display:flex;gap:8px;margin-top:4px;}#cv-ov .cv-ok button{flex:1;height:42px;border-radius:13px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;color:#C3CBDC;background:transparent;border:1px solid #2A3760;}#cv-ov .cv-ok button:first-child{background:#E0603A;border-color:#E0603A;color:#0B1020;box-shadow:0 6px 16px rgba(224,96,58,.35);}'
    + '#cv-ov .cv-sug{display:flex;flex-wrap:wrap;gap:8px;}#cv-ov .cv-sug button{border-radius:999px;padding:9px 13px;font-size:13.5px;font-weight:700;color:#C3CBDC;cursor:pointer;font-family:inherit;' + CARD + '}'
    + '#cv-ov .cv-dock{flex-shrink:0;border-radius:24px 24px 0 0;padding:12px 16px calc(env(safe-area-inset-bottom) + 12px);display:flex;flex-direction:column;gap:10px;' + LIFT + 'border-bottom:none;}'
    + '#cv-ov .cv-dr{display:flex;align-items:center;gap:14px;}#cv-ov .cv-sl{flex:1;min-width:0;}'
    + '#cv-ov .cv-orb{--o:#5B6886;position:relative;width:52px;height:52px;flex-shrink:0;border-radius:50%;border:none;cursor:pointer;background:radial-gradient(circle at 35% 30%,#fff6 0%,var(--o) 45%,var(--o) 100%);box-shadow:0 0 26px color-mix(in srgb,var(--o) 45%,transparent),inset 0 2px 0 rgba(255,255,255,.3);transition:transform .2s ease;-webkit-tap-highlight-color:transparent;}'
    + '#cv-ov .cv-orb::before{content:"";position:absolute;inset:-7px;border-radius:50%;border:2px dashed var(--o);opacity:.55;}'
    + '#cv-ov.listen .cv-orb{--o:#4FB3D9;}#cv-ov.think .cv-orb{--o:#A78BFA;}#cv-ov.speak .cv-orb{--o:#F2B544;}#cv-ov.ask .cv-orb{--o:#E0603A;}'
    + '#cv-ov.listen .cv-orb::before{animation:cvRing 1.6s ease-out infinite;}#cv-ov.listen.hear .cv-orb{transform:scale(1.08);}#cv-ov.think .cv-orb{animation:cvBreath 1.2s ease-in-out infinite;}#cv-ov.speak .cv-orb{animation:cvTalk .5s ease-in-out infinite alternate;}#cv-ov.speak .cv-orb::before{border-style:solid;}'
    + '@keyframes cvRing{0%{transform:scale(.9);opacity:.9}100%{transform:scale(1.35);opacity:0}}@keyframes cvBreath{50%{transform:scale(.92)}}@keyframes cvTalk{to{transform:scale(1.06)}}'
    + '@media (prefers-reduced-motion: reduce){#cv-ov .cv-orb,#cv-ov .cv-orb::before{animation:none!important;transition:none!important}}'
    + '#cv-ov .cv-st{margin:0;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#8C98B4;}#cv-ov.listen .cv-st{color:#4FB3D9;}#cv-ov.think .cv-st{color:#A78BFA;}#cv-ov.speak .cv-st{color:#F2B544;}#cv-ov.ask .cv-st{color:#E0603A;}'
    + '#cv-ov .cv-ss{margin:2px 0 0;font-size:13px;color:#C3CBDC;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}#cv-ov .cv-ss:empty{display:none;}'
    + '#cv-ov .cv-bot{display:flex;gap:8px;align-items:center;}#cv-ov .cv-bot input{flex:1;min-width:0;border:1px solid #1E2944;color:#EEF1F7;border-radius:999px;padding:11px 16px;font-size:15px;font-family:inherit;outline:none;' + WELL + '}#cv-ov .cv-bot input::placeholder{color:#7C88A4;}'
    + '#cv-ov .cv-bot button{border:1px solid #2A3760;background:transparent;color:#EEF1F7;border-radius:999px;padding:11px 15px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap;}'
    + '#cv-ov .cv-set{position:absolute;left:16px;right:16px;top:calc(env(safe-area-inset-top) + 60px);max-width:520px;margin:0 auto;border-radius:20px;padding:14px;display:flex;flex-direction:column;gap:11px;z-index:2;max-height:70vh;overflow:auto;' + LIFT + '}'
    + '#cv-ov .cv-set b{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#8C98B4;}'
    + '#cv-ov .cv-seg{display:flex;gap:6px;flex-wrap:wrap;}#cv-ov .cv-seg button{flex:1;border:1px solid #2A3760;background:transparent;color:#C3CBDC;border-radius:11px;padding:8px;font-size:13.5px;font-weight:800;cursor:pointer;font-family:inherit;}'
    + '#cv-ov .cv-seg button[aria-pressed=true]{background:#E0603A;border-color:#E0603A;color:#0B1020;}'
    + '#cv-ov .cv-set select{border:1px solid #1E2944;color:#EEF1F7;border-radius:11px;padding:8px;font-size:14px;font-family:inherit;' + WELL + '}'
    + '#cv-ov :focus-visible{outline:2px solid #E0603A;outline-offset:3px;}';
  document.head.appendChild(s);
}
function _cvSet(st, label){
  if(!_cv) return; _cv.st = st;
  const ov = document.getElementById('cv-ov'); if(!ov) return;
  ov.classList.remove('listen', 'think', 'speak', 'idle', 'hear'); ov.classList.add(st);
  ov.classList.toggle('ask', !!_cv.pending && st !== 'think');          // un changement de plan attend ton « oui »
  const V = cvStateLabels(st, { canListen: _cv.canListen, ask: !!_cv.pending });
  const el = ov.querySelector('.cv-st'); if(el) el.textContent = label || V.t;
  const sub = ov.querySelector('.cv-ss'); if(sub) sub.textContent = label ? '' : V.s;
  const orb = ov.querySelector('.cv-orb'); if(orb) orb.setAttribute('aria-label', V.a);
}
function openCoachVoice(opts){
  opts = opts || {};
  if(typeof coachAI === 'function' && !coachAI()) return;
  if(document.getElementById('cv-ov')){ if(opts.brief) cvAsk('Lis mon brief'); return; }
  _cvCss();
  _cv = { st: 'idle', q: [], buf: '', speaking: false, streamDone: true, rec: null, closed: false, canListen: !!_cvRecClass(), heard: '', reply: '', lock: null, empty: 0, prefs: _cvPrefs(), memos: null, log: [] };
  // déverrouille la voix et les sons sur iPhone : 1re lecture dans le geste qui ouvre l'écran
  try { if(typeof speechSynthesis !== 'undefined'){ speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); speechSynthesis.onvoiceschanged = function(){ if(_cv) _cv.voice = _cvVoice(); }; } } catch(e) {}
  try { if(_cv.prefs.sounds && (window.AudioContext || window.webkitAudioContext)){ _cv.ac = new (window.AudioContext || window.webkitAudioContext)(); if(_cv.ac.resume) _cv.ac.resume(); } } catch(e) {}
  _cv.voice = _cvVoice();
  // mémos du Coach lus une fois (au lieu d'une lecture par question)
  try { if(typeof dbRef !== 'undefined' && dbRef) dbRef.child('_coach_memos').once('value').then(function(s){ if(_cv) _cv.memos = s.val() || ''; }).catch(function(){}); } catch(e) {}
  const sug = cvSuggest(typeof state !== 'undefined' ? state : null, new Date());
  _cv.sug = sug;
  const ov = document.createElement('div'); ov.id = 'cv-ov'; ov.className = 'idle'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Parler au Coach');
  let ctx = []; try { ctx = cvContext(typeof state !== 'undefined' ? state : null, new Date()); } catch(e) { diagSilent(e, 'coach-voice:cvContext'); }
  ov.innerHTML = '<div class="cv-top"><span>🎙️ Coach · à la voix</span><button type="button" class="cv-gear" aria-label="Réglages de la voix" onclick="cvSettings()">⚙︎</button><button type="button" class="cv-x" aria-label="Fermer" onclick="closeCoachVoice()">✕</button></div>'
    + '<div class="cv-ctx">' + ctx.map(function(c){ return '<span' + (c.c ? ' class="' + c.c + '"' : '') + '>' + _cvE(c.t) + '</span>'; }).join('') + '</div>'
    + '<div class="cv-th" aria-label="Conversation"><div class="cv-log" aria-label="Échanges précédents"></div>'
    + '<p class="cv-you" onclick="cvEditYou()" title="Toucher pour corriger"></p><p class="cv-co" aria-live="polite" onclick="cvRepeat()" title="Relire"></p><div class="cv-card" aria-live="polite"></div>'
    + '<div class="cv-sug">' + sug.map(function(t, i){ return '<button type="button" onclick="cvAsk(_cv.sug[' + i + '])">' + t.replace(/</g, '&lt;') + '</button>'; }).join('') + '</div></div>'
    + '<div class="cv-dock"><div class="cv-dr"><button type="button" class="cv-orb" onclick="cvOrbTap()"></button><div class="cv-sl"><p class="cv-st"></p><p class="cv-ss"></p></div></div>'
    + '<form class="cv-bot" onsubmit="event.preventDefault();cvTyped()"><input id="cv-in" type="text" enterkeyhint="send" placeholder="Ou écris ici…" aria-label="Écrire au Coach"><button type="submit">Envoyer</button></form></div>';
  document.body.appendChild(ov);
  try { if(navigator.wakeLock) navigator.wakeLock.request('screen').then(function(l){ if(_cv) _cv.lock = l; }).catch(function(){}); } catch(e) {}
  _cvSet('idle');
  _cvWarm();                                                      // serveur réveillé + contexte préparé pendant que tu parles
  if(opts.brief) cvAsk('Lis mon brief');                         // 🎧 de « Ma journée » : le brief lu tout de suite
  else if(_cv.prefs.greet && typeof speechSynthesis !== 'undefined'){   // le Coach ouvre la conversation (sans IA, instantané)
    let G = null; try { G = cvGreeting(typeof state !== 'undefined' ? state : null, new Date(), typeof athleteFirstName === 'function' ? athleteFirstName() : ''); } catch(e) { diagSilent(e, 'coach-voice:greeting'); }
    if(G){ _cv.offer = G.offer; _cvSay(G.text, function(){ if(_cv && !_cv.closed){ if(_cv.canListen) cvListen(true); else _cvSet('idle'); } }); }
    else if(_cv.canListen) cvListen();
  }
  else if(_cv.canListen) cvListen();
}
function closeCoachVoice(){
  if(!_cv) return;
  _cv.closed = true;
  _cvBargeStop();
  // fin de conversation : l'essentiel de l'échange rejoint les mémos du Coach (« on a dit : 42'00 dimanche… »)
  if(_cv.aiTurns > 0 && typeof extractAndSaveMemosWithContext === 'function'){ try { extractAndSaveMemosWithContext([]); } catch(e) { diagSilent(e, 'coach-voice:close'); } if(typeof showToast === 'function') showToast('Le Coach garde l\'essentiel de votre échange', '🧠'); }
  try { if(_cv.rec) _cv.rec.abort(); } catch(e) {}
  try { if(typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch(e) {}
  try { if(_cv.lock) _cv.lock.release(); } catch(e) {}
  try { if(_cv.ac && _cv.ac.close) _cv.ac.close(); } catch(e) {}
  const ov = document.getElementById('cv-ov'); if(ov) ov.remove();
  _cv = null;
}
// réglages : vitesse, voix française, sons, écoute automatique
function cvSettings(){
  const ov = document.getElementById('cv-ov'); if(!ov || !_cv) return;
  const old = ov.querySelector('.cv-set'); if(old){ old.remove(); return; }
  const p = _cv.prefs, V = _cvVoices(), cur = _cv.voice ? _cv.voice.name : '';
  const box = document.createElement('div'); box.className = 'cv-set'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Réglages de la voix');
  const seg = function(k, opts){ return '<div class="cv-seg">' + opts.map(function(o){ return '<button type="button" aria-pressed="' + (p[k] === o[1]) + '" onclick="_cvPrefsSet(\'' + k + '\',' + JSON.stringify(o[1]).replace(/"/g, '&quot;') + ');cvSettings();cvSettings()">' + o[0] + '</button>'; }).join('') + '</div>'; };
  box.innerHTML = '<b>Vitesse de la voix</b>' + seg('rate', CV_RATES)
    + (V.length > 1 ? '<b>Voix</b><select aria-label="Voix" onchange="_cvPrefsSet(\'voice\', this.value)">' + V.map(function(v){ return '<option' + (v.name === cur ? ' selected' : '') + '>' + v.name.replace(/</g, '&lt;') + '</option>'; }).join('') + '</select>' : '')
    + '<b>Sons d\'écoute</b>' + seg('sounds', [['Oui', true], ['Non', false]])
    + '<b>Réécouter après chaque réponse</b>' + seg('auto', [['Oui', true], ['Non', false]])
    + '<b>Ton du Coach</b>' + seg('tone', [['Normal', ''], ['Direct', 'direct'], ['Encourageant', 'encourageant']])
    + '<b>Le Coach parle en premier</b>' + seg('greet', [['Oui', true], ['Non', false]])
    + '<b>Couper la parole à la voix (essai)</b>' + seg('barge', [['Oui', true], ['Non', false]]);
  ov.appendChild(box);
}
function cvRepeat(){ if(!_cv || !_cv.reply || _cv.st === 'think') return; try { if(_cv.rec) _cv.rec.abort(); } catch(e) {} _cvHush(); _cv.mute = false; _cv.streamDone = true; cvSentences(_cv.reply, true).out.forEach(_cvQueue); }
function cvOrbTap(){
  if(!_cv) return;
  if(_cv.st === 'speak'){ _cvHush(); cvListen(); return; }        // interrompre et parler
  if(_cv.st === 'listen'){ try { _cv.rec && _cv.rec.stop(); } catch(e) {} return; }   // j'ai fini de parler
  if(_cv.st === 'idle'){ if(_cv.canListen) cvListen(); else { const i = document.getElementById('cv-in'); if(i) i.focus(); } }
}
function _cvHush(){ if(!_cv) return; _cvBargeStop(); _cv.q = []; _cv.speaking = false; _cv.mute = true; _cv.after = null; try { speechSynthesis.cancel(); } catch(e) {} }
// écoute : texte en direct ; fin de tour = silence (cvTurnWait : plus long si la phrase n'est pas finie) ou fin de la dictée
// auto = relance après la réponse (hors d'un toucher : l'iPhone peut la refuser → « Touche pour parler », micro gardé)
function cvListen(auto){
  if(!_cv || _cv.closed) return;
  const R = _cvRecClass(); if(!R){ _cvSet('idle'); return; }
  _cvBargeStop();
  try { if(_cv.rec) _cv.rec.abort(); } catch(e) {}
  const rec = new R(); _cv.rec = rec; _cv.heard = '';
  rec.lang = 'fr-FR'; rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 1;
  const ov = document.getElementById('cv-ov'), you = ov && ov.querySelector('.cv-you');
  let quiet = null, sent = false;
  const finish = function(){ if(sent || !_cv || _cv.rec !== rec) return; sent = true; clearTimeout(quiet); try { rec.stop(); } catch(e) {} const t = _cv.heard.trim(); if(t){ _cv.empty = 0; cvAsk(t); } else { _cv.empty++; _cvSet('idle', _cv.empty > 1 ? 'Touche pour parler' : 'Je n\'ai rien entendu — touche pour parler'); } };
  rec.onresult = function(e){
    let fin = '', tmp = '';
    for(let i = 0; i < e.results.length; i++){ const r = e.results[i]; if(r.isFinal) fin += r[0].transcript + ' '; else tmp += r[0].transcript; }
    _cv.heard = (fin + ' ' + tmp).replace(/\s+/g, ' ').trim();
    if(!rec._spoke && _cv.heard){ rec._spoke = true; _cvLogPush(); }   // tu parles : l'échange précédent rejoint le fil
    if(ov){ ov.classList.add('hear'); clearTimeout(rec._hearT); rec._hearT = setTimeout(function(){ ov.classList.remove('hear'); }, 260); }
    if(you){ you.textContent = _cv.heard; you.classList.toggle('interim', !!tmp); _cvScroll(); }
    clearTimeout(quiet); quiet = setTimeout(finish, cvTurnWait(_cv.heard, !tmp));
  };
  rec.onerror = function(e){
    if(!e || !/not-allowed|service-not-allowed/.test(e.error || '')) return;
    sent = true;
    if(auto) _cvSet('idle', 'Touche pour parler');
    else { _cv.canListen = false; _cvSet('idle', 'Micro refusé — écris ta question en bas'); }
  };
  rec.onend = function(){ if(!sent && _cv && _cv.rec === rec && _cv.heard && quiet) return; finish(); };   // la dictée s'arrête seule : on attend la fin du délai en cours
  _cvSet('listen');                                               // la réponse précédente reste affichée jusqu'à ce que tu parles
  _cvTone('listen');
  const go = function(){ if(!_cv || _cv.rec !== rec || sent) return; try { rec.start(); } catch(e) { sent = true; _cvSet('idle'); } };   // iPhone : relance refusée hors d'un toucher → « Touche pour parler »
  if(_cv.prefs.sounds && _cv.ac) setTimeout(go, 180); else go();  // micro ouvert après le son (pas capté)
}
function cvTyped(){ const i = document.getElementById('cv-in'); const t = i ? i.value.trim() : ''; if(!t) return; i.value = ''; i.blur(); cvAsk(t); }
// l'échange terminé (ta phrase, sa réponse, sa carte) rejoint le fil au-dessus ; la zone « en cours » est vidée
function _cvLogPush(){
  if(!_cv) return;
  const ov = document.getElementById('cv-ov'), you = ov && ov.querySelector('.cv-you'), co = ov && ov.querySelector('.cv-co'), card = ov && ov.querySelector('.cv-card'), log = ov && ov.querySelector('.cv-log');
  if(!log || !_cv.reply) return;
  _cv.log.push({ u: you ? you.textContent : '', c: _cv.reply.replace(/[*#`_]/g, ''), k: card ? card.innerHTML.replace(/<div class="cv-ok">[\s\S]*?<\/div>/g, '') : '' }); _cv.log = _cv.log.slice(-6);
  log.innerHTML = _cv.log.map(function(x){ return (x.u ? '<p class="u">' + _cvE(x.u) + '</p>' : '') + '<p class="c">' + cvRich(x.c) + '</p>' + (x.k ? '<div class="k">' + x.k + '</div>' : ''); }).join('');
  if(you){ you.textContent = ''; you.classList.remove('interim'); } if(co) co.innerHTML = ''; if(card) card.innerHTML = '';
  _cv.reply = ''; _cv.hl = null; _cvScroll();
}
function _cvScroll(){ const th = document.querySelector('#cv-ov .cv-th'); if(th) th.scrollTop = th.scrollHeight; }
// réponse en cours : chiffres en pastilles, phrase lue surlignée
function _cvCo(text){ const co = document.querySelector('#cv-ov .cv-co'); if(co){ co.innerHTML = cvRich(text, _cv && _cv.hl); _cvScroll(); } }
// question → Coach (mode voix) ; chaque phrase reçue part tout de suite à la lecture
function cvAsk(text){
  if(!_cv || !text) return;
  try { if(_cv.rec) _cv.rec.abort(); } catch(e) {}
  _cvHush(); _cv.mute = false;
  _cvLogPush();
  const ov = document.getElementById('cv-ov'), you = ov && ov.querySelector('.cv-you'), co = ov && ov.querySelector('.cv-co'), sug = ov && ov.querySelector('.cv-sug'), set = ov && ov.querySelector('.cv-set');
  text = cvFixTranscript(text);                                   // vocabulaire course (EF, VMA, 4'12…)
  if(you){ you.textContent = text; you.classList.remove('interim'); } if(co) co.innerHTML = ''; if(sug) sug.style.display = 'none'; if(set) set.remove();
  _cv.hl = null; _cvScroll();
  const card = ov && ov.querySelector('.cv-card'); if(card) card.innerHTML = '';
  _cv.lastQ = text;
  const yes = CV_YES_RE.test(text.trim().replace(/[’]/g, "'")), no = CV_NO_RE.test(text.trim().replace(/[’]/g, "'"));
  const offer = _cv.offer, pend = _cv.pending, applied = _cv.lastApplied; _cv.offer = null; _cv.pending = null;
  if(offer === 'brief' && yes) text = 'Lis mon brief';            // « Ton brief est prêt, je te le lis ? » → « oui »
  if(pend && (yes || no)){ _cvTone('send'); _cvPlanAnswer(pend, yes); return; }   // « Je valide ? » → oui / non
  if(applied && CV_UNDO_RE.test(text.trim())){ _cvTone('send'); _cvPlanUndo(applied); return; }
  _cv.lastApplied = null;
  const long = cvWantsLong(text, _cv.lastCut); _cv.lastCut = false;   // détail demandé : réponse complète
  _cv.buf = ''; _cv.reply = ''; _cv.said = ''; _cv.nS = 0; _cv.nW = 0; _cv.cut = false; _cv.streamDone = false; const turn = _cv.turn = (_cv.turn || 0) + 1;
  const clean = function(t){ return String(t).replace(/[*#`_]/g, '').replace(/\s{2,}/g, ' ').trim(); };
  const take = function(x){                                       // phrase gardée → lue tout de suite ; trop long → coupé
    if(_cv.cut) return;
    if(!cvKeep(_cv.nS, _cv.nW, x, long)){
      _cv.cut = true; _cv.buf = '';
      if(!long && !/\?\s*$/.test(_cv.said)){ const q = 'Tu veux le détail ?'; _cv.said += ' ' + q; _cvQueue(q); }   // « oui » → version complète
      _cv.lastCut = !long; return;
    }
    _cv.said += (_cv.said ? ' ' : '') + x; if(!/:\s*$/.test(x)) _cv.nS++;   // « Km 1 : » n'est pas une phrase
    _cv.nW += x.split(/\s+/).filter(Boolean).length; _cvQueue(x);
  };
  const show = function(){ _cv.reply = clean(_cv.said + (_cv.cut ? '' : ' ' + _cv.buf)); _cvCo(_cv.reply); };
  _cvTone('send');
  if(_cvLocal(text)) return;                                      // commande vocale : réponse immédiate, sans le Coach
  const memo = cvMemoIntent(text); if(memo){ _cvMemo(memo, turn); return; }   // « note que… » → mémo du Coach
  if(cvActionIntent(text) && typeof pcSend === 'function'){ _cvPlanAction(text, turn); return; }   // « décale ma séance… » → plan
  _cvSet('think');
  if(typeof sendCoachMessage !== 'function'){ _cvSet('idle', 'Coach indisponible'); return; }
  _cv.aiTurns = (_cv.aiTurns || 0) + 1;
  const t0 = Date.now(); let tTok = 0, tSay = 0;
  clearTimeout(_cv.fillT);                                        // attente : une petite phrase si rien n'arrive en 1,6 s
  if(_cv.prefs.filler) _cv.fillT = setTimeout(function(){ if(_cv && _cv.turn === turn && !_cv.said && !_cv.speaking && !_cv.mute && !_cv.streamDone) _cvQueue(CV_FILLERS[turn % CV_FILLERS.length]); }, 1600);
  const take0 = take; const takeT = function(x){ if(!tSay && !_cv.cut) tSay = Date.now() - t0; take0(x); };
  const opts = { voice: true, voiceLong: long, tone: _cv.prefs.tone || undefined,
    onToken: function(tok){
      if(!tTok) tTok = Date.now() - t0;
      if(!_cv || _cv.turn !== turn || _cv.mute || _cv.cut) return;
      _cv.buf += tok; const S = cvSentences(_cv.buf, false); _cv.buf = S.rest; S.out.forEach(takeT); show();
    },
    onDone: function(full){
      if(!_cv || _cv.turn !== turn) return;
      clearTimeout(_cv.fillT);
      if(full == null){ _cv.streamDone = true; _cvSet('idle', 'Le Coach n\'a pas pu répondre — touche pour réessayer'); return; }
      if(!_cv.said && !_cv.buf && full) _cv.buf = full;          // réponse arrivée d'un bloc
      if(!_cv.mute && !_cv.cut){ const S = cvSentences(_cv.buf, true); S.out.forEach(takeT); }
      _cv.buf = ''; show();
      _cvLatPush({ at: Date.now(), tok: tTok, say: tSay, long: long ? 1 : 0 });   // délai jusqu'au 1er mot (Diagnostic)
      _cvShowCard(cvCardKind(text), _cv.said);                    // montrer en parlant : plan de course, séance, forme, prédiction
      if(!long && /d[ée]taill?e?\b[^.?!]*\?\s*$/i.test(_cv.said)) _cv.lastCut = true;   // « Tu veux que je détaille ? » → « oui » = détail
      _cv.streamDone = true; _cvNext();
    } };
  if(typeof _cv.memos === 'string') opts.memos = _cv.memos;
  sendCoachMessage(text, opts);
}
function _cvQueue(sentence){ if(!_cv) return; const t = cvSpeakable(sentence); if(t.replace(/[\s.,;:!?]/g, '').length < 2) return; _cv.q.push({ t: t, raw: sentence }); _cvNext(); }
function _cvNext(){
  if(!_cv || _cv.closed || _cv.speaking) return;
  const it = _cv.q.shift(), t = it && (typeof it === 'string' ? it : it.t);
  if(_cv.reply){ const h = it && it.raw ? it.raw : null; if(h !== _cv.hl){ _cv.hl = h; _cvCo(_cv.reply.replace(/[*#`_]/g, '')); } }   // phrase lue surlignée
  if(!t){
    if(_cv.streamDone) _cvBargeStop();
    if(_cv.streamDone && _cv.after){ const f = _cv.after; _cv.after = null; f(); return; }   // commande : action après la phrase
    if(_cv.streamDone && _cv.st !== 'listen' && _cv.st !== 'idle'){
      if(_cv.canListen && _cv.prefs.auto) setTimeout(function(){ if(_cv && !_cv.speaking && _cv.streamDone && !_cv.q.length) cvListen(true); }, 350);
      else _cvSet('idle');
    }
    return;
  }
  if(typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined'){ _cv.q = []; _cvSet('idle'); return; }
  _cv.spoken = ((_cv.spoken || '') + ' ' + t).slice(-600);        // ce que dit le haut-parleur (écho ignoré par « couper la parole »)
  const u = new SpeechSynthesisUtterance(t); u.lang = 'fr-FR'; if(_cv.voice) u.voice = _cv.voice; u.rate = _cv.prefs.rate || 1.05; u.pitch = 1;
  const turn = _cv.turn;
  let done = false; const next = function(){ if(done) return; done = true; clearTimeout(guard); if(!_cv || _cv.turn !== turn) return; _cv.speaking = false; _cvNext(); };
  const guard = setTimeout(next, 2500 + t.length * 110 / (u.rate || 1));   // filet : certains navigateurs n'appellent pas onend
  u.onend = next; u.onerror = next;
  _cv.speaking = true; _cvSet('speak');
  try { speechSynthesis.speak(u); } catch(e) { next(); }
  _cvBargeStart();                                                // couper la parole à la voix (réglage, essai)
}

// réponse prononcée sans le Coach (commandes) ; after() une fois la phrase dite
function _cvSay(text, after){
  if(!_cv) return;
  _cv.reply = String(text); _cv.hl = null; _cvCo(String(text).replace(/[*#`_]/g, ''));
  _cv.mute = false; _cv.streamDone = true; _cv.after = after || null;
  cvSentences(text, true).out.forEach(_cvQueue);
  if(!_cv.q.length && !_cv.speaking){ const f = _cv.after; _cv.after = null; if(f) f(); else _cvNext(); }
}
function _cvToday(){ return typeof prTodayIso === 'function' ? prTodayIso() : new Date().toISOString().slice(0, 10); }
// texte du brief du matin : en attente de lecture, sinon le dernier brief du jour dans le fil du Coach
function cvBriefText(st, today, hist){
  const p = st && st._brief_pending;
  if(p && p.content && (!p.date || p.date === today)) return String(p.content);
  const H = (hist || []).filter(function(m){ return m && m.role === 'assistant' && m.date === today && String(m.content || '').length > 250 && /(FC REPOS|S[ÉE]ANCE DU JOUR|brief|récup)/i.test(m.content); });
  return H.length ? String(H[H.length - 1].content) : null;
}
function _cvLocal(text){
  const I = cvIntent(text); if(!I) return false;
  if(I.k === 'alc'){
    if(typeof alcSave !== 'function'){ return false; }
    try { alcSave(null, I.l, I.t); } catch(e) { diagSilent(e, 'coach-voice:_cvLocal'); return false; }
    try { if(typeof renderHome === 'function') renderHome(); } catch(e) { diagSilent(e, 'coach-voice:_cvLocal'); }
    _cvSay(I.l === 0 ? 'C\'est noté : pas d\'alcool hier soir.' : 'C\'est noté : ' + (I.n ? I.n + ' verre' + (I.n > 1 ? 's' : '') + ', soit ' : '') + I.l + ' sur 10 hier soir. J\'en tiens compte pour ta forme du jour.');
    return true;
  }
  if(I.k === 'brief'){
    const b = cvBriefText(typeof state !== 'undefined' ? state : null, _cvToday(), typeof coachHistory !== 'undefined' ? coachHistory : []);
    if(!b){ _cvSay('Ton brief du matin n\'est pas encore prêt. Pose-moi ta question, je te réponds.'); return true; }
    try { const k = '_brief_matin_' + _cvToday(); state[k] = true; if(typeof dbRef !== 'undefined' && dbRef) dbRef.child(k).set(true).catch(function(){}); } catch(e) { diagSilent(e, 'coach-voice:_cvLocal'); }
    _cvSay(b);
    return true;
  }
  if(I.k === 'fin'){
    const auto = typeof avFinish === 'function' && typeof avOn === 'function' && avOn();
    _cvSay(auto ? 'Bravo ! Je vérifie Strava, WHOOP et la météo pour valider ta séance.' : 'Bravo ! J\'ouvre la validation de ta séance.', function(){
      closeCoachVoice();
      if(auto) avFinish(); else if(typeof quickValidate === 'function') quickValidate();
    });
    return true;
  }
  if(I.k === 'go'){ _cvSay('J\'ouvre ' + I.label + '.', function(){ closeCoachVoice(); if(typeof showScreen === 'function') showScreen(I.s); }); return true; }
  if(I.k === 'repeat'){
    const last = _cv.log.length ? _cv.log[_cv.log.length - 1].c : '';
    if(!last){ _cvSay('Je n\'ai encore rien dit. Pose-moi ta question !'); return true; }
    _cvSay(last); return true;
  }
  if(I.k === 'rate'){
    const i = CV_RATES.map(function(r){ return r[1]; }), cur = i.indexOf(_cv.prefs.rate), n = Math.max(0, Math.min(i.length - 1, (cur < 0 ? 1 : cur) + I.d));
    _cvPrefsSet('rate', i[n]);
    _cvSay(I.d < 0 ? (n === 0 && cur === 0 ? 'Je parle déjà au plus lent.' : 'D\'accord, je parle plus lentement.') : (n === i.length - 1 && cur === n ? 'Je parle déjà au plus vite.' : 'D\'accord, je parle plus vite.'));
    return true;
  }
  if(I.k === 'bye'){ _cvSay(_cv.aiTurns ? 'À plus tard ! Je garde l\'essentiel de ce qu\'on s\'est dit.' : 'À plus tard !', function(){ closeCoachVoice(); }); return true; }
  return false;
}

// ─── 1 · Vitesse : préchauffage du serveur, petite phrase d'attente, délai jusqu'au 1er mot (Diagnostic) ───
async function _cvWarm(){
  try {
    if(typeof authHeaders !== 'function') return;
    const base = typeof FUNCTIONS_BASE !== 'undefined' ? FUNCTIONS_BASE : 'https://us-central1-prepa-marathon.cloudfunctions.net';
    fetch(base + '/coachChat', { method: 'POST', headers: await authHeaders(false), body: JSON.stringify({ warm: true }) }).catch(function(){});
  } catch(e) {}
}
const CV_FILLERS = ['Je regarde.', 'Voyons ça.', 'Deux secondes.', 'Je vérifie.'];
function _cvLatPush(o){ try { const L = JSON.parse(localStorage.getItem('pm_cv_lat') || '[]'); L.push(o); localStorage.setItem('pm_cv_lat', JSON.stringify(L.slice(-20))); } catch(e) {} }
// médiane du délai jusqu'au 1er mot lu (ms) sur les réponses courtes
function cvLatMedian(L){ const v = (L || []).filter(function(x){ return x && !x.long && x.say > 0; }).map(function(x){ return x.say; }).sort(function(a, b){ return a - b; }); return v.length ? v[Math.floor(v.length / 2)] : null; }

// ─── 5 · Le Coach ouvre la conversation (sans IA) ───
function _cvIso(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function cvGreeting(st, now, name){
  now = now || new Date(); st = st || {};
  const h = now.getHours(), iso = _cvIso(now), tm = new Date(now.getTime() + 86400000), tIso = _cvIso(tm);
  const hi = (h >= 18 || h < 4 ? 'Bonsoir' : 'Salut') + (name ? ' ' + name : '') + '.';
  let S = []; try { if(typeof prSessions === 'function') S = prSessions(st).filter(function(s){ return !s.skip && s.type !== 'rest'; }); } catch(e) { diagSilent(e, 'coach-voice:cvGreeting'); }
  const km = function(s){ return s.kmPlan ? ' de ' + String(Math.round(s.kmPlan * 10) / 10).replace('.', ',') + ' km' : ''; };
  const at = function(s){ const t = s.x && s.x.sched_time; return t ? ' à ' + String(t).replace(':', 'h').replace(/h00$/, 'h') : ''; };
  const today = S.filter(function(s){ return s.date === iso; }), todo = today.filter(function(s){ return !s.done; })[0], done = today.filter(function(s){ return s.done; })[0];
  const P = st._brief_pending;
  if(P && P.content && (!P.date || P.date === iso) && !st['_brief_matin_' + iso] && !(typeof briefTooLate === 'function' && briefTooLate(now)))
    return { text: hi + ' Ton brief du matin est prêt, je te le lis ?', offer: 'brief' };
  let mid;
  if(todo) mid = (h >= 17 ? 'Ce soir' : h < 12 ? 'Ce matin' : 'Aujourd\'hui') + ' : ' + todo.title + km(todo) + at(todo) + '.';
  else if(done) mid = 'Bravo pour ta séance du jour.';
  else {
    const nx = S.filter(function(s){ return s.date > iso && !s.done; }).sort(function(a, b){ return a.date < b.date ? -1 : 1; })[0];
    const jour = nx ? (nx.date === tIso ? 'demain' : new Date(nx.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long' })) : '';
    mid = 'Repos aujourd\'hui.' + (nx ? ' Prochaine séance ' + jour + ' : ' + nx.title + km(nx) + '.' : '');
  }
  return { text: hi + ' ' + mid + ' Une question ?', offer: null };
}

// ─── 4 · Montrer en parlant : une carte sous la réponse ───
function cvCardKind(q){
  const t = String(q || '').toLowerCase().replace(/[’]/g, "'");
  if(/plan de course|km par km|kilom[eè]tres? par kilom[eè]tre|strat[ée]gie de course|allures? (de|pour) (la |ma )?course|d[ée]coupage/.test(t)) return 'race';
  if(/pr[ée]diction|pr[ée]vu|quel temps|chrono|en combien|temps (pour|de|à) (ma |la )?course|viser/.test(t)) return 'pred';
  if(/\bforme\b|r[ée]cup|fatigu|sommeil|whoop|en forme/.test(t)) return 'form';
  if(/s[ée]ance|aujourd'hui|ce soir|ce matin|demain|footing|fractionn|tempo|sortie longue/.test(t)) return 'sess';
  return null;
}
// temps visé lu dans la réponse du Coach (« 42'00 », « 1h35 », « 3h45'00 »), en secondes ; null si aucun.
// Seul un temps cohérent avec la distance compte (allure entre 2'30 et 10'00/km) : une heure de départ (« à 9h00 ») n'est
// jamais prise pour un temps de course
function cvTimeIn(text, distKm){
  const t = String(text || ''), re = /(\d{1,2})\s*h\s*(\d{2})(?:\s*['’]\s*(\d{2}))?|\b(\d{2,3})\s*['’]\s*(\d{2})\b(?!\s*\/\s*km)/g;
  let m;
  while((m = re.exec(t))){
    const before = t.slice(Math.max(0, m.index - 12), m.index).toLowerCase();
    let sec;
    if(m[1] != null){
      if(/(?:^|\s)(à|a|vers|dès|des|depuis|avant|après|apres|départ|depart)\s*$/.test(before)) continue;   // heure de la journée
      sec = +m[1] * 3600 + +m[2] * 60 + (m[3] ? +m[3] : 0);
    } else { if(+m[4] < 12) continue; sec = +m[4] * 60 + +m[5]; }
    if(distKm > 0){ const p = sec / distKm; if(p < 150 || p > 600) continue; }
    return sec;
  }
  return null;
}
// plan de course en lignes : km, allure, temps cumulé (5 km / 10 km : chaque km ; au-delà : regroupé tous les 5 km)
function cvRaceCard(totalSec, distKm){
  if(!(totalSec > 0) || !(distKm > 0) || typeof prRaceSplits !== 'function') return null;
  if(totalSec / distKm < 150 || totalSec / distKm > 600) return null;   // allure impossible : pas de carte plutôt qu'un plan faux
  const sp = prRaceSplits(totalSec, distKm), n = sp.length;
  const keep = sp.filter(function(x, i){ return n <= 12 || i === 0 || i === n - 1 || (Math.round(x.km) % 5 === 0 && x.km === Math.round(x.km)); });
  const slow = Math.max.apply(null, sp.map(function(x){ return x.pace; })), fast = Math.min.apply(null, sp.map(function(x){ return x.pace; }));
  return { pace: totalSec / distKm, rows: keep.map(function(x){ return { km: String(x.km).replace('.', ','), pace: x.pace, cum: x.cum, w: slow > fast ? Math.round(40 + 60 * (slow - x.pace) / (slow - fast)) : 70 }; }) };
}
function _cvE(t){ return String(t == null ? '' : t).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function _cvT(sec){ return typeof phTime === 'function' ? phTime(sec) : typeof prTime === 'function' ? prTime(sec) : Math.round(sec) + ' s'; }
function _cvP(sec){ return typeof prPace === 'function' ? prPace(sec) : Math.floor(sec / 60) + '\'' + String(Math.round(sec % 60)).padStart(2, '0'); }
function cvCardHtml(kind, reply){
  try {
    const st = typeof state !== 'undefined' ? state : {}, R = typeof prepRace === 'function' ? (prepRace() || {}) : {};
    if(kind === 'race'){
      const cat = typeof predRaceCat === 'function' ? predRaceCat(R) : null, P = cat && typeof predRace === 'function' ? predRace(cat) : null;
      const tgt = cvTimeIn(reply, R.km) || (P && P.sec) || null, C = cvRaceCard(tgt, R.km);
      if(!C) return '';
      return '<div class="cv-cd"><p class="cv-cdh"><span>🏁 ' + _cvE(R.name || 'Plan de course') + '</span><b>' + _cvT(tgt) + ' · ' + _cvP(C.pace) + '/km</b></p>'
        + C.rows.map(function(r, i){ return '<div class="cv-sp' + (i === 0 ? ' f' : i === C.rows.length - 1 ? ' l' : '') + '"><span>km ' + r.km + '</span><i><u style="width:' + r.w + '%"></u></i><b>' + _cvP(r.pace) + '</b><small>' + _cvT(r.cum) + '</small></div>'; }).join('') + '</div>';
    }
    if(kind === 'pred'){
      const cat = typeof predRaceCat === 'function' ? predRaceCat(R) : null, P = cat && typeof predRace === 'function' ? predRace(cat) : null;
      if(!P) return '';
      return '<div class="cv-cd"><p class="cv-cdh"><span>🎯 ' + _cvE(R.name || cat) + '</span><b>' + _cvT(P.sec) + '</b></p><div class="cv-tl">'
        + '<div><small>Prévu</small><b>' + _cvT(P.sec) + '</b></div>' + (P.lo && P.hi ? '<div><small>Fourchette</small><b>' + _cvT(P.lo) + ' – ' + _cvT(P.hi) + '</b></div>' : '')
        + (R.objectif && R.objectif !== 'non défini' ? '<div><small>Objectif</small><b>' + _cvE(R.objectif) + '</b></div>' : '') + '<div><small>Allure</small><b>' + _cvP(P.pace) + '/km</b></div></div></div>';
    }
    if(kind === 'form'){
      const F = typeof prFormScore === 'function' ? prFormScore() : null;
      if(!F || F.score == null) return '';
      const T = typeof wellnessTiles === 'function' ? wellnessTiles().filter(function(t){ return t.v !== '—'; }) : [];
      return '<div class="cv-cd"><p class="cv-cdh"><span>💚 Forme du jour</span><b class="' + _cvE(F.tone || '') + '">' + F.score + '</b></p>' + (F.label ? '<p class="cv-cdl">' + _cvE(F.label) + '</p>' : '')
        + (T.length ? '<div class="cv-tl">' + T.map(function(t){ return '<div><small>' + _cvE(t.lab) + '</small><b class="' + _cvE(t.c || '') + '">' + _cvE(t.v) + '</b></div>'; }).join('') + '</div>' : '') + '</div>';
    }
    if(kind === 'sess'){
      const now = new Date(), iso = _cvIso(now), tIso = _cvIso(new Date(now.getTime() + 86400000));
      const want = /demain/i.test(_cv && _cv.lastQ || '') ? tIso : iso;
      const S = typeof prSessions === 'function' ? prSessions(st).filter(function(s){ return !s.skip && s.type !== 'rest' && s.date >= want; }).sort(function(a, b){ return a.date < b.date ? -1 : 1; }) : [];
      const s = S.filter(function(x){ return !x.done; })[0] || S[0]; if(!s) return '';
      const when = s.date === iso ? 'Aujourd\'hui' : s.date === tIso ? 'Demain' : new Date(s.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
      return '<div class="cv-cd"><p class="cv-cdh"><span>🏃 ' + _cvE(when) + (s.x && s.x.sched_time ? ' · ' + _cvE(String(s.x.sched_time).replace(':', 'h')) : '') + '</span><b>' + (s.kmPlan ? String(s.kmPlan).replace('.', ',') + ' km' : '') + '</b></p>'
        + '<p class="cv-cdl"><b>' + _cvE(s.title) + '</b>' + (s.detail ? ' · ' + _cvE(String(s.detail).slice(0, 120)) : '') + (s.done ? ' · ✓ faite' : '') + '</p></div>';
    }
  } catch(e) { diagSilent(e, 'coach-voice:cvCardHtml'); }
  return '';
}
function _cvShowCard(kind, reply){
  const el = document.querySelector('#cv-ov .cv-card'); if(!el) return;
  el.innerHTML = kind ? cvCardHtml(kind, reply) : '';
}

// ─── 3 · Le Coach agit : modifier le plan à la voix, avec confirmation (annulable), « note que… » → mémo ───
const CV_NO_RE = /^(non|nan|pas maintenant|laisse|laisse tomber|non merci|surtout pas|oublie|pas la peine)\b/i;
const CV_UNDO_RE = /^(annule|annuler|reviens en arri[eè]re|remets comme avant|finalement non|non finalement|d[ée]fais)\b/i;
const CV_ACT_VERB = /\b(d[ée]cal(e|er|es)|d[ée]plac(e|er|es)|repouss(e|er|es)|avanc(e|er|es)|all[eè]g(e|er|es)|all[ée]ger|supprim(e|er|es)|retir(e|er|es)|enl[eè]v(e|er|es)|remplac(e|er|es)|ajout(e|er|es)|rajout(e|er|es)|chang(e|er|es)|modifi(e|er|es)|transform(e|er|es)|raccourci(s|r)|rallong(e|er|es)|r[ée]dui(s|re)|intervertis|inverse|mets|mettre)\b/i;
const CV_ACT_OBJ = /(s[ée]ance|footing|sortie|fractionn|tempo|longue|seuil|vma|plan|semaine|repos|renfo|\bkm\b|kilom[eè]tre|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain|apr[eè]s-demain)/i;
function cvActionIntent(text){
  const t = String(text || '').trim().toLowerCase().replace(/[’]/g, "'");
  if(!t || /^(pourquoi|comment|quel|quelle|est-ce que je dois|faut-il|c'est quoi)/.test(t)) return false;
  return CV_ACT_VERB.test(t) && CV_ACT_OBJ.test(t);
}
function cvMemoIntent(text){
  const m = String(text || '').trim().replace(/[’]/g, "'").match(/^(?:note|notes|retiens|souviens-toi|rappelle-toi|n'oublie pas|m[ée]morise|garde en t[eê]te)(?: bien)?(?: que| qu'|\s*:)?\s+(.{4,})$/i);
  return m ? m[1].replace(/[.!]+$/, '').trim() : null;
}
// une ligne prononçable par changement proposé (« Footing EF de jeudi : 6 km au lieu de 8 »)
function cvChangeLine(c){
  const day = c.date ? new Date(c.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long' }) : '';
  const v = function(x){ return typeof _pcVal === 'function' ? _pcVal(c.field, x) : String(x == null ? '' : x); };
  const head = (c.title || 'Séance') + (day ? ' de ' + day : '');
  if(c.field === 'km') return head + ' : ' + v(c.after) + (/km/.test(v(c.after)) ? '' : ' km') + ' au lieu de ' + v(c.before) + (/km/.test(v(c.before)) ? '' : ' km');
  if(c.field === 'date' || c.field === 'session') return head + ' : déplacée' + (c.after && /^\d{4}-/.test(String(c.after)) ? ' au ' + new Date(String(c.after).slice(0, 10) + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long' }) : '');
  if(c.field === 'skip') return head + ' : retirée';
  if(c.field === 'detail') return head + ' : ' + String(v(c.after)).slice(0, 80);
  return head + ' : ' + String(v(c.after)).slice(0, 60);
}
function _cvShort(t, n){ const S = cvSentences(String(t || '').replace(/[*#`_]/g, '').replace(/\n+/g, ' '), true).out; return S.slice(0, n || 2).join(' '); }
async function _cvPlanAction(text, turn){
  _cvSet('think', 'Je regarde ton plan…');
  _cv.aiTurns = (_cv.aiTurns || 0) + 1;
  try {
    await pcSend(text);
    if(!_cv || _cv.turn !== turn) return;
    const M = typeof _pcMsgs === 'function' ? _pcMsgs() : [], m = M[M.length - 1];
    if(!m || m.r === 's'){ _cvSay(m ? _cvShort(m.t) : 'Je n\'ai pas pu regarder ton plan. Réessaie.'); return; }
    const ch = (m.ch || []).filter(function(c){ return !c.off; });
    if(!ch.length){ _cvSay(_cvShort(m.t, 2)); return; }
    _cv.pending = { id: m.id };
    const L = ch.slice(0, 3).map(cvChangeLine);
    const el = document.querySelector('#cv-ov .cv-card');
    if(el) el.innerHTML = '<div class="cv-cd act"><p class="cv-cdh"><span>📋 ' + ch.length + ' changement' + (ch.length > 1 ? 's' : '') + '</span><b>à valider</b></p>' + ch.map(function(c){ return '<p class="cv-cdl">' + _cvE(cvChangeLine(c)) + '</p>'; }).join('') + '<div class="cv-ok"><button type="button" onclick="cvAsk(\'Oui\')">✓ Valider</button><button type="button" onclick="cvAsk(\'Non\')">Non merci</button></div></div>';
    _cvSay(_cvShort(m.t, 1) + ' ' + L.join('. ') + (ch.length > 3 ? '. Et ' + (ch.length - 3) + ' autre' + (ch.length > 4 ? 's' : '') + ' changement' + (ch.length > 4 ? 's' : '') : '') + '. Je valide ?', function(){ if(_cv && _cv.canListen && _cv.prefs.auto) cvListen(true); else _cvSet('idle'); });
  } catch(e) { diagSilent(e, 'coach-voice:_cvPlanAction'); if(_cv) _cvSay('Je n\'ai pas pu regarder ton plan. Réessaie dans un instant.'); }
}
function _cvPlanAnswer(p, yes){
  const el = document.querySelector('#cv-ov .cv-card');
  if(!yes){ try { if(typeof pcDismiss === 'function') pcDismiss(p.id); } catch(e) { diagSilent(e, 'coach-voice:_cvPlanAnswer'); } if(el) el.innerHTML = ''; _cvSay('D\'accord, je ne touche à rien.'); return; }
  try { if(typeof pcApply === 'function') pcApply(p.id); } catch(e) { diagSilent(e, 'coach-voice:_cvPlanAnswer'); }
  const m = typeof _pcFind === 'function' ? _pcFind(p.id) : null;
  if(m && m.st === 'applied'){ _cv.lastApplied = p.id; if(el) el.innerHTML = '<div class="cv-cd"><p class="cv-cdh"><span>✅ Plan mis à jour</span><b>annulable</b></p></div>'; _cvSay('C\'est fait. Dis « annule » si tu changes d\'avis.'); }
  else _cvSay('Je n\'ai pas pu modifier le plan : ces séances ont changé entre-temps.');
}
function _cvPlanUndo(id){
  try { if(typeof pcUndo === 'function') pcUndo(id); } catch(e) { diagSilent(e, 'coach-voice:_cvPlanUndo'); }
  _cv.lastApplied = null;
  const m = typeof _pcFind === 'function' ? _pcFind(id) : null;
  _cvSay(m && m.st === 'undone' ? 'C\'est annulé, ton plan est revenu comme avant.' : 'Je n\'ai pas pu annuler : regarde dans Mon plan.');
}
async function _cvMemo(note, turn){
  _cvSet('think', 'Je note…');
  try {
    const existing = typeof _loadMemos === 'function' ? await _loadMemos() : '';
    const base = typeof FUNCTIONS_BASE !== 'undefined' ? FUNCTIONS_BASE : 'https://us-central1-prepa-marathon.cloudfunctions.net';
    const r = await fetch(base + '/addMemo', { method: 'POST', headers: await authHeaders(false), body: JSON.stringify({ note: note, existingMemos: existing }) });
    const d = await r.json();
    if(!_cv || _cv.turn !== turn) return;
    if(d && d.memos){ if(typeof _setMemos === 'function') _setMemos(d.memos); _cv.memos = d.memos; _cvSay('C\'est noté, je m\'en souviendrai.'); }
    else _cvSay('Je n\'ai pas pu le noter. Réessaie.');
  } catch(e) { if(_cv) _cvSay('Je n\'ai pas pu le noter. Réessaie.'); }
}

// ─── 7 · Plus naturel : vocabulaire course, toucher pour corriger, couper la parole à la voix ───
function cvFixTranscript(t){
  return String(t || '')
    .replace(/\b(\d{1,2}) ?(?:minutes?|min) ?(\d{1,2})\b(?! ?(?:secondes?|s\b))/gi, function(m, a, b){ return a + '\'' + String(b).padStart(2, '0'); })
    .replace(/\b(\d) (\d{2}) (?:au|du|par) (?:kilom[eè]tre|km)\b/gi, "$1'$2/km")
    .replace(/\b(?:e f|e-f|é f|eff|euh f)\b/gi, 'EF')
    .replace(/\b(?:v m a|vé m a|v\.m\.a\.?)\b/gi, 'VMA')
    .replace(/\b(?:f c|effe c|f\.c\.)\b/gi, 'FC')
    .replace(/\bfraction[ée]s?\b/gi, function(m){ return /s$/i.test(m) ? 'fractionnés' : 'fractionné'; })
    .replace(/\s{2,}/g, ' ').trim();
}
function cvEditYou(){
  if(!_cv || _cv.st === 'listen') return;
  const you = document.querySelector('#cv-ov .cv-you'); if(!you || !you.textContent.trim()) return;
  const i = document.getElementById('cv-in'); if(!i) return;
  i.value = you.textContent; i.focus(); try { i.setSelectionRange(0, i.value.length); } catch(e) {}
  _cvSet(_cv.st === 'speak' ? 'speak' : 'idle', 'Corrige ta phrase en bas puis Envoyer');
}
// couper la parole sans toucher (essai) : pendant que le Coach parle, une écoute discrète ; ce qui ne ressemble pas à sa
// propre phrase (écho du haut-parleur) l'interrompt
function cvEcho(heard, spoken){
  const w = function(x){ return String(x || '').toLowerCase().replace(/[^a-zà-ÿ0-9' ]/g, ' ').split(/\s+/).filter(function(y){ return y.length > 2; }); };
  const H = w(heard), S = w(spoken); if(H.length < 2) return true;   // trop court pour décider : on n'interrompt pas
  const inS = H.filter(function(x){ return S.indexOf(x) >= 0; }).length;
  return inS / H.length >= 0.5;
}
function _cvBargeStart(){
  if(!_cv || !_cv.prefs.barge || !_cv.canListen || _cv.barge) return;
  const R = _cvRecClass(); if(!R) return;
  try {
    const b = new R(); _cv.barge = b; b.lang = 'fr-FR'; b.interimResults = true; b.continuous = true;
    b.onresult = function(e){
      let t = ''; for(let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript + ' ';
      if(!_cv || !_cv.speaking || cvEcho(t, (_cv.spoken || '') + ' ' + _cv.said)) return;
      _cvBargeStop(); _cvHush(); cvListen();
    };
    b.onend = function(){ if(_cv && _cv.barge === b) _cv.barge = null; };
    b.onerror = function(){ if(_cv && _cv.barge === b) _cv.barge = null; };
    b.start();
  } catch(e) { _cv.barge = null; }
}
function _cvBargeStop(){ if(!_cv || !_cv.barge) return; const b = _cv.barge; _cv.barge = null; try { b.abort(); } catch(e) {} }

// ─── Écran (maquette « fil de discussion ») : libellés des états, pastilles de contexte, chiffres mis en valeur ───
function cvStateLabels(st, o){
  o = o || {};
  if(o.ask && st !== 'think') return st === 'listen' ? { t: 'Je valide ?', s: 'Dis « oui » ou « non »', a: 'Réponds oui ou non' } : { t: 'Je valide ?', s: 'Oui / non à la voix, ou touche Valider', a: 'Parler' };
  return ({
    listen: { t: 'Je t\'écoute…', s: 'Parle, ta phrase s\'écrit en direct', a: 'J\'ai fini de parler' },
    think: { t: 'Je réfléchis…', s: 'Réponse dans un instant', a: 'Le Coach réfléchit' },
    speak: { t: 'Le Coach parle', s: 'Touche la bulle pour l\'interrompre', a: 'Interrompre le Coach' }
  })[st] || (o.canListen ? { t: 'Touche pour parler', s: 'Ou écris ta question en bas', a: 'Parler' } : { t: 'Écris ta question', s: 'Micro indisponible sur cet appareil', a: 'Parler' });
}
// pastilles du haut : course (J-x), forme du jour, séance du jour
function cvContext(st, now){
  st = st || {}; now = now || new Date();
  const out = [], iso = _cvIso(now), h = now.getHours();
  try {
    const R = typeof prepRace === 'function' ? prepRace() : null;
    if(R && R.date && R.date >= iso){
      const d = Math.round((new Date(R.date + 'T12:00:00') - new Date(iso + 'T12:00:00')) / 86400000);
      const lab = R.km ? (Math.abs(R.km - 42.2) < 0.6 ? 'Marathon' : Math.abs(R.km - 21.1) < 0.6 ? 'Semi' : String(Math.round(R.km * 10) / 10).replace('.', ',') + ' km') : (R.course || R.name || 'Course');
      out.push({ t: '🏁 ' + (d === 0 ? 'Jour J' : 'J-' + d) + ' · ' + lab });
    }
  } catch(e) { diagSilent(e, 'coach-voice:cvContext'); }
  const F = st._form_today;
  if(F && F.date === iso && F.score != null) out.push({ t: '💛 Forme ' + F.score, c: F.score >= 67 ? 'ok' : F.score >= 34 ? 'mid' : 'low' });
  try {
    const S = typeof prSessions === 'function' ? prSessions(st).filter(function(s){ return s.date === iso && !s.skip && s.type !== 'rest'; }) : [];
    const todo = S.filter(function(s){ return !s.done; })[0], done = S.filter(function(s){ return s.done; })[0];
    const km = function(s){ return s.kmPlan ? ' ' + String(Math.round(s.kmPlan * 10) / 10).replace('.', ',') + ' km' : ''; };
    const short = function(t){ return String(t || '').replace(/^Footing\s+/i, '').replace(/^Sortie\s+longue/i, 'Longue'); };
    if(todo) out.push({ t: '🏃 ' + (h >= 17 ? 'Ce soir' : h < 12 ? 'Ce matin' : 'Aujourd\'hui') + ' · ' + short(todo.title) + km(todo) });
    else if(done) out.push({ t: '✓ ' + short(done.title) + km(done), c: 'ok' });
    else out.push({ t: '😴 Repos aujourd\'hui' });
  } catch(e) { diagSilent(e, 'coach-voice:cvContext'); }
  return out;
}
// texte du Coach → HTML : chiffres en pastilles (42'00, 4'12/km, 8 km, 145 bpm, 80 %), phrase lue surlignée (hl)
const CV_NUM_RE = /(\d{1,2}h\d{2}(?:['’]\d{2})?|\d{1,3}['’]\d{2}(?:\s?\/\s?km)?|\d+(?:[.,]\d+)?\s?(?:km|bpm|ms)\b|\d+(?:[.,]\d+)?\s?%)/g;
function cvRich(text, hl){
  const T = String(text || ''), pills = function(x){ return _cvE(x).replace(CV_NUM_RE, '<span class="cv-num">$1</span>'); };
  const h = hl ? String(hl).replace(/[*#`_]/g, '').replace(/\s{2,}/g, ' ').trim() : '', i = h ? T.indexOf(h) : -1;
  if(i < 0) return pills(T);
  return pills(T.slice(0, i)) + '<mark>' + pills(h) + '</mark>' + pills(T.slice(i + h.length));
}
