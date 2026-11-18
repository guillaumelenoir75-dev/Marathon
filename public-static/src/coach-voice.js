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
    if(/^(d[ée]brief|on (fait|d[ée]marre) le d[ée]brief|je (te|vais te) raconte|raconte|je veux (te )?raconter)\b/.test(t) && /s[ée]ance|sortie|footing|run|course|d[ée]brief/.test(t) && words <= 9) return { k: 'debrief' };
  }
  return null;
}
const ALC_DRINKS_CV = typeof ALC_DRINKS !== 'undefined' ? ALC_DRINKS : [0, 1, 2, 3, 3.5, 5, 6, 7.5, 9, 11, 13];
// réglages (par téléphone) : vitesse, voix, sons, écoute automatique après la réponse
const CV_RATES = [['Lente', 0.92], ['Normale', 1.05], ['Rapide', 1.2]];
function _cvPrefs(){ let p = {}; try { p = JSON.parse(localStorage.getItem('pm_cv') || '{}') || {}; } catch(e) {} return { rate: +p.rate || 1.05, voice: p.voice || '', sounds: p.sounds !== false, auto: p.auto !== false, greet: p.greet !== false, filler: p.filler !== false, tone: p.tone || '', barge: p.barge === true, engine: p.engine === 'native' ? 'native' : 'google', gvoice: p.gvoice || '', stt: p.stt === 'native' ? 'native' : 'google' }; }
function _cvPrefsSet(k, v){
  const p = _cvPrefs(); p[k] = v; try { localStorage.setItem('pm_cv', JSON.stringify(p)); } catch(e) {}
  if(_cv){ _cv.prefs = p; if(k === 'voice') _cv.voice = _cvVoice();
    if(k === 'engine' && v === 'google'){ _cv.ttsDown = false; _cv.ttsFails = 0; if(!_cv.ac) try { _cv.ac = new (window.AudioContext || window.webkitAudioContext)(); if(_cv.ac.resume) _cv.ac.resume(); } catch(e) {} }   // toucher = son débloqué
    if(k === 'gvoice' || k === 'rate') _cvTtsMem = null;
    if(k === 'stt'){ _cv.sttDown = false; _cv.sttFails = 0; _cv.canListen = !!_cvRecClass() || _cvSttAvail(); } }
}
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
    + '#cv-ov .cv-x,#cv-ov .cv-gear,#cv-ov .cv-txt{width:40px;height:40px;flex-shrink:0;border-radius:50%;' + CARD + 'color:#C3CBDC;font-size:16px;cursor:pointer;font-family:inherit;}'
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
    + (typeof cfCardCss === 'function' ? cfCardCss('#cv-ov') : '')   // cartes, notes 👍 / 👎, chiffres corrigés (coach-plus.js)
    + '#cv-ov .cv-log .cv-cd{opacity:.8;}#cv-ov .cv-vote:empty{display:none;}#cv-ov .cv-log .cf-v small{opacity:.8;}'
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
  _cv = { st: 'idle', q: [], buf: '', speaking: false, streamDone: true, rec: null, closed: false, canListen: !!_cvRecClass() || _cvSttAvail(), heard: '', reply: '', lock: null, empty: 0, prefs: _cvPrefs(), memos: null, log: [] };
  // déverrouille la voix et les sons sur iPhone : 1re lecture dans le geste qui ouvre l'écran
  try { if(typeof speechSynthesis !== 'undefined'){ speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); speechSynthesis.onvoiceschanged = function(){ if(_cv) _cv.voice = _cvVoice(); }; } } catch(e) {}
  try { if((_cv.prefs.sounds || _cv.prefs.engine === 'google') && (window.AudioContext || window.webkitAudioContext)){ _cv.ac = new (window.AudioContext || window.webkitAudioContext)(); if(_cv.ac.resume) _cv.ac.resume();
    const b = _cv.ac.createBuffer(1, 1, 22050), src = _cv.ac.createBufferSource(); src.buffer = b; src.connect(_cv.ac.destination); src.start(0); } } catch(e) {}   // son débloqué dans le toucher (voix Google sur iPhone)
  _cv.voice = _cvVoice();
  // mémos du Coach lus une fois (au lieu d'une lecture par question)
  try { if(typeof dbRef !== 'undefined' && dbRef) dbRef.child('_coach_memos').once('value').then(function(s){ if(_cv) _cv.memos = s.val() || ''; }).catch(function(){}); } catch(e) {}
  const sug = cvSuggest(typeof state !== 'undefined' ? state : null, new Date());
  _cv.sug = sug;
  const ov = document.createElement('div'); ov.id = 'cv-ov'; ov.className = 'idle'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Parler au Coach');
  let ctx = []; try { ctx = cvContext(typeof state !== 'undefined' ? state : null, new Date()); } catch(e) { diagSilent(e, 'coach-voice:cvContext'); }
  ov.innerHTML = '<div class="cv-top"><span>🎙️ Coach · à la voix</span><button type="button" class="cv-txt" aria-label="Fil écrit du Coach (briefs, Mon plan)" title="Fil écrit" onclick="cvOpenText()">💬</button><button type="button" class="cv-gear" aria-label="Réglages de la voix" onclick="cvSettings()">⚙︎</button><button type="button" class="cv-x" aria-label="Fermer" onclick="closeCoachVoice()">✕</button></div>'
    + '<div class="cv-ctx">' + ctx.map(function(c){ return '<span' + (c.c ? ' class="' + c.c + '"' : '') + '>' + _cvE(c.t) + '</span>'; }).join('') + '</div>'
    + '<div class="cv-th" aria-label="Conversation"><div class="cv-log" aria-label="Échanges précédents"></div>'
    + '<p class="cv-you" onclick="cvEditYou()" title="Toucher pour corriger"></p><p class="cv-co" aria-live="polite" onclick="cvRepeat()" title="Relire"></p><div class="cv-vote"></div><div class="cv-card" aria-live="polite"></div>'
    + '<div class="cv-sug">' + sug.map(function(t, i){ return '<button type="button" onclick="cvAsk(_cv.sug[' + i + '])">' + t.replace(/</g, '&lt;') + '</button>'; }).join('') + '</div></div>'
    + '<div class="cv-dock"><div class="cv-dr"><button type="button" class="cv-orb" onclick="cvOrbTap()"></button><div class="cv-sl"><p class="cv-st"></p><p class="cv-ss"></p></div></div>'
    + '<form class="cv-bot" onsubmit="event.preventDefault();cvTyped()"><input id="cv-in" type="text" enterkeyhint="send" placeholder="Ou écris ici…" aria-label="Écrire au Coach"><button type="submit">Envoyer</button></form></div>';
  document.body.appendChild(ov);
  try { if(navigator.wakeLock) navigator.wakeLock.request('screen').then(function(l){ if(_cv) _cv.lock = l; }).catch(function(){}); } catch(e) {}
  _cvSet('idle');
  _cvWarm();                                                      // serveur réveillé + contexte préparé pendant que tu parles
  if(opts.brief) cvAsk('Lis mon brief');                         // 🎧 de « Ma journée » : le brief lu tout de suite
  else if(opts.debrief) _cvDebriefStart(opts.debrief === true ? null : opts.debrief);   // « Le raconter au Coach »
  else if(_cv.prefs.greet && typeof speechSynthesis !== 'undefined'){   // le Coach ouvre la conversation (sans IA, instantané)
    let G = null; try { G = cvGreeting(typeof state !== 'undefined' ? state : null, new Date(), typeof athleteFirstName === 'function' ? athleteFirstName() : ''); } catch(e) { diagSilent(e, 'coach-voice:greeting'); }
    try { if(G && !G.offer) G = _cvOpening(G); } catch(e) { diagSilent(e, 'coach-voice:opening'); }   // séance à débriefer, point à suivre
    if(G){ _cv.offer = G.offer; _cvSay(G.text, function(){ if(_cv && !_cv.closed){ if(_cv.canListen) cvListen(true); else _cvSet('idle'); } }); }
    else if(_cv.canListen) cvListen();
  }
  else if(_cv.canListen) cvListen();
}
function closeCoachVoice(){
  if(!_cv) return;
  _cv.closed = true;
  _cvBargeStop();
  _cvStopGoogle();
  _cvMicStop();
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
  const GV = _cvGVoices();
  box.innerHTML = '<b>Voix</b>' + seg('engine', [['Google (naturelle)', 'google'], ['iPhone', 'native']])
    + (p.engine === 'google' && GV.length ? '<select aria-label="Voix Google" onchange="_cvPrefsSet(\'gvoice\', this.value)">' + GV.map(function(v){ return '<option value="' + v.name + '"' + ((p.gvoice || _cvGDef) === v.name ? ' selected' : '') + '>' + _cvGLabel(v) + '</option>'; }).join('') + '</select>' : '')
    + '<b>Reconnaissance de ta voix</b>' + seg('stt', [['Google (précise)', 'google'], ['iPhone', 'native']])
    + '<b>Vitesse de la voix</b>' + seg('rate', CV_RATES)
    + (p.engine === 'native' && V.length > 1 ? '<b>Voix de l\'iPhone</b><select aria-label="Voix" onchange="_cvPrefsSet(\'voice\', this.value)">' + V.map(function(v){ return '<option' + (v.name === cur ? ' selected' : '') + '>' + v.name.replace(/</g, '&lt;') + '</option>'; }).join('') + '</select>' : '')
    + '<b>Sons d\'écoute</b>' + seg('sounds', [['Oui', true], ['Non', false]])
    + '<b>Réécouter après chaque réponse</b>' + seg('auto', [['Oui', true], ['Non', false]])
    + '<b>Ton du Coach</b>' + seg('tone', [['Normal', ''], ['Direct', 'direct'], ['Encourageant', 'encourageant']])
    + '<b>Le Coach parle en premier</b>' + seg('greet', [['Oui', true], ['Non', false]])
    + '<b>Couper la parole à la voix (essai)</b>' + seg('barge', [['Oui', true], ['Non', false]])
    + '<b>L\'onglet Coach ouvre</b><div class="cv-seg">' + [['La voix', 'voice'], ['Le fil écrit', 'text']].map(function(o){ return '<button type="button" aria-pressed="' + ((typeof coachTabMode === 'function' ? coachTabMode() : 'voice') === o[1]) + '" onclick="cvTabPref(\'' + o[1] + '\')">' + o[0] + '</button>'; }).join('') + '</div>';
  ov.appendChild(box);
}
function cvRepeat(){ if(!_cv || !_cv.reply || _cv.st === 'think') return; try { if(_cv.rec) _cv.rec.abort(); } catch(e) {} _cvHush(); _cv.mute = false; _cv.streamDone = true; cvSentences(_cv.reply, true).out.forEach(_cvQueue); }
function cvOrbTap(){
  if(!_cv) return;
  if(_cv.st === 'speak'){ _cvHush(); cvListen(); return; }        // interrompre et parler
  if(_cv.st === 'listen'){ if(_cv.finish) _cv.finish(); else try { _cv.rec && _cv.rec.stop(); } catch(e) {} return; }   // j'ai fini de parler
  if(_cv.st === 'idle'){ if(_cv.canListen) cvListen(); else { const i = document.getElementById('cv-in'); if(i) i.focus(); } }
}
function _cvHush(){ if(!_cv) return; _cvBargeStop(); _cvStopGoogle(); _cv.q = []; _cv.speaking = false; _cv.mute = true; _cv.after = null; try { speechSynthesis.cancel(); } catch(e) {} }
// écoute : texte en direct ; fin de tour = silence (cvTurnWait : plus long si la phrase n'est pas finie) ou fin de la dictée
// auto = relance après la réponse (hors d'un toucher : l'iPhone peut la refuser → « Touche pour parler », micro gardé)
// Reconnaissance Google (réglage, par défaut) : ta phrase est aussi enregistrée et, à la fin du tour, transcrite par la fonction
// coachStt (vocabulaire de la course) ; la dictée de l'iPhone affiche le texte en direct et sert de repli. Si la dictée ne
// renvoie rien alors que tu parles, la fin du tour vient du silence mesuré au micro.
function cvListen(auto){
  if(!_cv || _cv.closed) return;
  const R = _cvRecClass(), G = _cvSttOn();
  if(!R && !G){ _cvSet('idle'); return; }
  _cvBargeStop(); _cvMicStop();
  try { if(_cv.rec) _cv.rec.abort(); } catch(e) {}
  const rec = R ? new R() : { start: function(){}, stop: function(){}, abort: function(){} }; _cv.rec = rec; _cv.heard = '';
  if(R){ rec.lang = 'fr-FR'; rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 1; }
  const ov = document.getElementById('cv-ov'), you = ov && ov.querySelector('.cv-you');
  let quiet = null, sent = false, M = null, idle = null, cap = null;
  const hear = function(){ if(!rec._spoke){ rec._spoke = true; _cvLogPush(); } if(ov){ ov.classList.add('hear'); clearTimeout(rec._hearT); rec._hearT = setTimeout(function(){ ov.classList.remove('hear'); }, 260); } };
  const nothing = function(){ _cv.empty++; _cvSet('idle', _cv.empty > 1 ? 'Touche pour parler' : 'Je n\'ai rien entendu — touche pour parler'); };
  const finish = function(){
    if(sent || !_cv || _cv.rec !== rec) return; sent = true; _cv.finish = null; clearTimeout(quiet); clearTimeout(idle); clearTimeout(cap);
    try { rec.stop(); } catch(e) {}
    const t = _cv.heard.trim();
    if(M && M.ok && M.voice){                                         // phrase enregistrée : transcrite par Google
      _cvSet('think', 'Je t\'ai entendu…');
      const sec = (Date.now() - M.t0) / 1000, turn = _cv.turn;
      _cvMicStop(M).then(function(b){ return b ? _cvStt(b, sec) : null; }).then(function(g){
        if(!_cv || _cv.closed || _cv.turn !== turn) return;
        const txt = g && g.replace(/[\s.?!,]/g, '').length >= 2 ? g : t;
        if(txt){ _cv.empty = 0; cvAsk(txt); } else nothing();
      });
      return;
    }
    _cvMicStop(M);
    if(t){ _cv.empty = 0; cvAsk(t); } else nothing();
  };
  _cv.finish = finish;
  if(R){
    rec.onresult = function(e){
      let fin = '', tmp = '';
      for(let i = 0; i < e.results.length; i++){ const r = e.results[i]; if(r.isFinal) fin += r[0].transcript + ' '; else tmp += r[0].transcript; }
      _cv.heard = (fin + ' ' + tmp).replace(/\s+/g, ' ').trim();
      if(_cv.heard) hear();                                           // tu parles : l'échange précédent rejoint le fil
      if(you){ you.textContent = _cv.heard; you.classList.toggle('interim', !!tmp); _cvScroll(); }
      clearTimeout(quiet); quiet = setTimeout(finish, cvTurnWait(_cv.heard, !tmp));
    };
    rec.onerror = function(e){
      if(!e || !/not-allowed|service-not-allowed/.test(e.error || '')) return;
      if(M && M.ok) return;                                           // micro Google ouvert : il prend le relais
      sent = true; _cv.finish = null; _cvMicStop(M);
      if(auto) _cvSet('idle', 'Touche pour parler');
      else { _cv.canListen = !!G; _cvSet('idle', G ? 'Touche pour parler' : 'Micro refusé — écris ta question en bas'); }
    };
    rec.onend = function(){
      if(!sent && _cv && _cv.rec === rec && _cv.heard && quiet) return;   // la dictée s'arrête seule : on attend la fin du délai en cours
      if(!sent && M && M.ok && M.voice && !_cv.heard) return;          // la dictée n'a rien compris mais tu parles : fin au silence
      finish();
    };
  }
  _cvSet('listen');                                               // la réponse précédente reste affichée jusqu'à ce que tu parles
  _cvTone('listen');
  const go = function(){
    if(!_cv || _cv.rec !== rec || sent) return;
    if(G){ M = _cvMicStart(); M.onVoice = hear; M.onSilence = function(){ if(!_cv.heard && !sent) finish(); }; }
    if(R) try { rec.start(); } catch(e) { if(!G){ sent = true; _cv.finish = null; _cvSet('idle'); return; } }   // iPhone : relance refusée hors d'un toucher → « Touche pour parler »
    idle = setTimeout(function(){ if(!_cv.heard && !(M && M.voice)) finish(); }, R ? 12000 : 9000);   // personne ne parle
    cap = setTimeout(finish, 45000);                              // tour de parole de 45 s au plus
  };
  if(_cv.prefs.sounds && _cv.ac) setTimeout(go, 180); else go();  // micro ouvert après le son (pas capté)
}

// ─── 6 · Reconnaissance vocale Google (fonction coachStt) ───
function _cvSttAvail(){ return !!(_cvPrefs().stt !== 'native' && typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof MediaRecorder !== 'undefined' && typeof authHeaders === 'function'); }
function _cvSttOn(){ return !!(_cv && _cv.prefs.stt !== 'native' && !_cv.sttDown && _cvSttAvail()); }
function _cvMicStart(){
  const M = { chunks: [], t0: Date.now(), voice: false, lastVoice: 0, ok: false, stopped: false };
  _cv.mic = M;
  try {
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } }).then(function(stream){
      if(!_cv || _cv.mic !== M || M.stopped){ stream.getTracks().forEach(function(t){ t.stop(); }); return; }
      M.stream = stream;
      const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].filter(function(m){ try { return MediaRecorder.isTypeSupported(m); } catch(e) { return false; } })[0];
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
      M.rec = rec; M.mime = rec.mimeType || mime || '';
      rec.ondataavailable = function(e){ if(e.data && e.data.size) M.chunks.push(e.data); };
      rec.start(250); M.ok = true; M.t0 = Date.now();
      // niveau sonore : la bulle réagit ; fin du tour au silence si la dictée de l'iPhone ne renvoie rien
      try { if(_cv.ac){ const src = _cv.ac.createMediaStreamSource(stream), an = _cv.ac.createAnalyser(); an.fftSize = 1024; src.connect(an); M.src = src;
        const buf = new Float32Array(an.fftSize);
        M.iv = setInterval(function(){
          an.getFloatTimeDomainData(buf); let q = 0; for(let i = 0; i < buf.length; i++) q += buf[i] * buf[i];
          if(Math.sqrt(q / buf.length) > 0.03){ M.voice = true; M.lastVoice = Date.now(); if(M.onVoice) M.onVoice(); }
          else if(M.voice && M.onSilence && Date.now() - M.lastVoice > 1300) M.onSilence();
        }, 100); } } catch(e) {}
    }).catch(function(){ M.failed = true; if(_cv){ _cv.sttFails = (_cv.sttFails || 0) + 1; if(_cv.sttFails >= 2) _cv.sttDown = true; } });
  } catch(e) { M.failed = true; }
  return M;
}
function _cvMicStop(M){
  M = M || (_cv && _cv.mic); if(!M) return Promise.resolve(null);
  if(_cv && _cv.mic === M) _cv.mic = null;
  if(M._done) return M._done;
  M.stopped = true; clearInterval(M.iv); try { if(M.src) M.src.disconnect(); } catch(e) {}
  M._done = new Promise(function(ok){
    let f = false;
    const fin = function(){ if(f) return; f = true; try { if(M.stream) M.stream.getTracks().forEach(function(t){ t.stop(); }); } catch(e) {} ok(M.chunks.length ? new Blob(M.chunks, { type: M.mime || 'audio/mp4' }) : null); };
    if(M.rec && M.rec.state !== 'inactive'){ M.rec.onstop = fin; try { M.rec.stop(); } catch(e) { fin(); } setTimeout(fin, 900); } else fin();
  });
  return M._done;
}
function _cvHints(){
  const H = [];
  try { (typeof getShoes === 'function' ? getShoes() : []).forEach(function(x){ if(x && x.name) H.push(String(x.name)); }); } catch(e) {}
  try { const R = typeof prepRace === 'function' ? prepRace() : null; if(R && R.name) H.push(String(R.name)); } catch(e) {}
  try { const n = typeof athleteFirstName === 'function' ? athleteFirstName() : ''; if(n) H.push(n); } catch(e) {}
  return H.slice(0, 20);
}
async function _cvStt(blob, sec){
  const base = typeof FUNCTIONS_BASE !== 'undefined' ? FUNCTIONS_BASE : 'https://us-central1-prepa-marathon.cloudfunctions.net';
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, to = setTimeout(function(){ try { if(ctl) ctl.abort(); } catch(e) {} }, 4500);
  try {
    const b64 = await new Promise(function(ok, ko){ const r = new FileReader(); r.onload = function(){ ok(String(r.result).split(',')[1] || ''); }; r.onerror = ko; r.readAsDataURL(blob); });
    const r = await fetch(base + '/coachStt', { method: 'POST', headers: await authHeaders(false), body: JSON.stringify({ audio: b64, sec: Math.round(sec * 10) / 10, hints: _cvHints() }), signal: ctl ? ctl.signal : undefined });
    const j = await r.json().catch(function(){ return {}; });
    if(!r.ok || j.fallback) throw new Error(j.reason || 'HTTP ' + r.status);
    if(_cv) _cv.sttFails = 0;
    return String(j.text || '').trim();
  } catch(e) { if(_cv){ _cv.sttFails = (_cv.sttFails || 0) + 1; if(_cv.sttFails >= 2) _cv.sttDown = true; } return null; }   // 2 échecs : dictée de l'iPhone pour la suite
  finally { clearTimeout(to); }
}
function cvTyped(){ const i = document.getElementById('cv-in'); const t = i ? i.value.trim() : ''; if(!t) return; i.value = ''; i.blur(); cvAsk(t); }
// l'échange terminé (ta phrase, sa réponse, sa carte) rejoint le fil au-dessus ; la zone « en cours » est vidée
function _cvLogPush(){
  if(!_cv) return;
  const ov = document.getElementById('cv-ov'), you = ov && ov.querySelector('.cv-you'), co = ov && ov.querySelector('.cv-co'), card = ov && ov.querySelector('.cv-card'), log = ov && ov.querySelector('.cv-log'), vote = ov && ov.querySelector('.cv-vote');
  if(!log || !_cv.reply) return;
  _cv.log.push({ u: you ? you.textContent : '', c: _cv.reply.replace(/[*#`_]/g, ''), k: card ? card.innerHTML.replace(/<div class="cv-ok">[\s\S]*?<\/div>/g, '') : '', f: vote ? vote.innerHTML : '' }); _cv.log = _cv.log.slice(-6);
  log.innerHTML = _cv.log.map(function(x){ return (x.u ? '<p class="u">' + _cvE(x.u) + '</p>' : '') + '<p class="c">' + cvRich(x.c) + '</p>' + (x.f ? x.f : '') + (x.k ? '<div class="k">' + x.k + '</div>' : ''); }).join('');
  if(you){ you.textContent = ''; you.classList.remove('interim'); } if(co) co.innerHTML = ''; if(card) card.innerHTML = ''; if(vote) vote.innerHTML = '';
  _cv.reply = ''; _cv.hl = null; _cvScroll();
}
function _cvScroll(){ const th = document.querySelector('#cv-ov .cv-th'); if(th) th.scrollTop = th.scrollHeight; }
// réponse en cours : chiffres en pastilles, phrase lue surlignée
function _cvCo(text){ const co = document.querySelector('#cv-ov .cv-co'); if(co){ co.innerHTML = cvRich(text, _cv && _cv.hl); _cvScroll(); } }
// question → Coach (mode voix) ; chaque phrase reçue part tout de suite à la lecture
function cvAsk(text, shown, direct){
  if(!_cv || !text) return;
  try { if(_cv.rec) _cv.rec.abort(); } catch(e) {}
  _cv.finish = null; _cvMicStop();
  _cvHush(); _cv.mute = false;
  _cvLogPush();
  const ov = document.getElementById('cv-ov'), you = ov && ov.querySelector('.cv-you'), co = ov && ov.querySelector('.cv-co'), sug = ov && ov.querySelector('.cv-sug'), set = ov && ov.querySelector('.cv-set');
  text = cvFixTranscript(text);                                   // vocabulaire course (EF, VMA, 4'12…)
  if(you){ you.textContent = shown || text; you.classList.remove('interim'); } if(co) co.innerHTML = ''; if(sug) sug.style.display = 'none'; if(set) set.remove();
  _cv.hl = null; _cvScroll();
  const card = ov && ov.querySelector('.cv-card'); if(card) card.innerHTML = '';
  _cv.lastQ = text;
  const yes = CV_YES_RE.test(text.trim().replace(/[’]/g, "'")), no = CV_NO_RE.test(text.trim().replace(/[’]/g, "'"));
  const offer = _cv.offer, pend = _cv.pending, applied = _cv.lastApplied; _cv.offer = null; _cv.pending = null;
  if(offer === 'brief' && yes) text = 'Lis mon brief';            // « Ton brief est prêt, je te le lis ? » → « oui »
  if(pend && (yes || no)){ _cvTone('send'); _cvPlanAnswer(pend, yes); return; }   // « Je valide ? » → oui / non
  if(_cv.deb && !_cv.deb.done && !(cvIntent(text) || {}).k){ _cvTone('send'); if(_cvDebriefTurn(text)) return; }   // débrief de séance en cours
  if(applied && CV_UNDO_RE.test(text.trim())){ _cvTone('send'); _cvPlanUndo(applied); return; }
  _cv.lastApplied = null;
  const long = !direct && cvWantsLong(text, _cv.lastCut); _cv.lastCut = false;   // détail demandé : réponse complète
  _cv.buf = ''; _cv.reply = ''; _cv.said = ''; _cv.nS = 0; _cv.nW = 0; _cv.cut = false; _cv.streamDone = false; const turn = _cv.turn = (_cv.turn || 0) + 1;
  const clean = function(t){ return String(t).replace(/[*#`_]/g, '').replace(/\s{2,}/g, ' ').trim(); };
  _cv.nFix = 0; _cv.toolSaid = false; _cv.F = null;
  try { if(typeof cfFacts === 'function') _cv.F = cfFacts(); } catch(e) { diagSilent(e, 'coach-voice:facts'); }
  const take = function(x){                                       // phrase gardée → lue tout de suite ; trop long → coupé
    if(_cv.cut) return;
    if(_cv.F && typeof cvVerifySentence === 'function'){ try { const V = cvVerifySentence(x, _cv.F); if(V.fixes.length){ x = V.text; _cv.nFix += V.fixes.length; } } catch(e) { diagSilent(e, 'coach-voice:verify'); } }   // chiffres vérifiés avant d'être lus (une phrase n'est jamais perdue)
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
  if(!direct && _cvLocal(text)) return;                                      // commande vocale : réponse immédiate, sans le Coach
  const memo = !direct && cvMemoIntent(text); if(memo){ _cvMemo(memo, turn); return; }   // « note que… » → mémo du Coach
  if(!direct && cvActionIntent(text) && typeof pcSend === 'function'){ _cvPlanAction(text, turn); return; }   // « décale ma séance… » → plan
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
    onTool: function(o){                                          // il va chercher une séance, la météo… : une petite phrase en attendant
      if(!_cv || _cv.turn !== turn || _cv.mute || _cv.cut) return;
      clearTimeout(_cv.fillT);
      if(!_cv.said && !_cv.speaking && !_cv.q.length && !_cv.toolSaid && o && o.say){ _cv.toolSaid = true; _cvQueue(o.say); }
    },
    onDone: function(full, meta){
      if(!_cv || _cv.turn !== turn) return;
      clearTimeout(_cv.fillT);
      if(full == null){ _cv.streamDone = true; _cvSet('idle', 'Le Coach n\'a pas pu répondre — touche pour réessayer'); return; }
      if(!_cv.said && full) _cv.buf = full;                      // réponse arrivée d'un bloc, ou rien encore lu : la réponse entière
      if(!_cv.said && !String(_cv.buf || '').trim()){              // réponse vide : jamais de silence
        _cv.streamDone = true; _cvSay('Je n\'ai pas eu de réponse. Tu peux me reposer ta question ?', _cvListenAfter); return;
      }
      if(!_cv.mute && !_cv.cut){ const S = cvSentences(_cv.buf, true); S.out.forEach(takeT); }
      _cv.buf = ''; show();
      _cvLatPush({ at: Date.now(), tok: tTok, say: tSay, long: long ? 1 : 0 });   // délai jusqu'au 1er mot (Diagnostic)
      if(typeof cfLog === 'function'){ const fid = cfLog({ q: text, a: _cv.said, m: 'voix', cut: _cv.cut, lat: tSay, fix: _cv.nFix, tools: meta && meta.tools }); const vb = document.querySelector('#cv-ov .cv-vote'); if(vb) vb.innerHTML = cfVoteHtml(fid); }   // note 👍 / 👎
      _cvShowCard(cvCardKind(text), _cv.said);                    // montrer en parlant : plan de course, séance, forme, prédiction
      if(!long && /d[ée]taill?e?\b[^.?!]*\?\s*$/i.test(_cv.said)) _cv.lastCut = true;   // « Tu veux que je détaille ? » → « oui » = détail
      _cv.streamDone = true; _cvNext();
    } };
  if(typeof _cv.memos === 'string') opts.memos = _cv.memos;
  sendCoachMessage(text, opts);
}
function _cvQueue(sentence){ if(!_cv) return; const t = cvSpeakable(sentence); if(t.replace(/[\s.,;:!?]/g, '').length < 2) return; const it = { t: t, raw: sentence }; if(_cvUseGoogle()){ it.ap = _cvTtsFetch(t); it.ap.catch(function(){}); } _cv.q.push(it); _cvNext(); }
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
  _cv.spoken = ((_cv.spoken || '') + ' ' + t).slice(-600);        // ce que dit le haut-parleur (écho ignoré par « couper la parole »)
  if(_cvUseGoogle()){ _cv.speaking = true; _cvSet('speak'); _cvBargeStart(); _cvPlayGoogle(it, t, _cv.turn); return; }   // voix Google
  _cvSpeakNative(t, _cv.turn);
}
// voix de l'iPhone (et repli de la voix Google)
function _cvSpeakNative(t, turn){
  if(!_cv) return;
  if(typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined'){ _cv.q = []; _cv.speaking = false; _cvSet('idle'); return; }
  const u = new SpeechSynthesisUtterance(t); u.lang = 'fr-FR'; if(_cv.voice) u.voice = _cv.voice; u.rate = _cv.prefs.rate || 1.05; u.pitch = 1;
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
function _cvAddDays(iso, n){ const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return _cvIso(d); }
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
  if(I.k === 'debrief'){ _cvDebriefStart(null); return true; }
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

// ouverture complétée (hors brief) : séance du jour validée sans ressenti → débrief ; sinon point à suivre dont la relance est due
function _cvOpening(G){
  const st = typeof state !== 'undefined' ? state : null, today = _cvToday();
  const hi = (String(G.text).match(/^(?:Salut|Bonsoir)[^.]*\./) || [''])[0];
  const deb = _cvDebriefSession(true);
  if(deb){ _cv.deb = { key: deb.key, s: deb, parts: [], asked: {} }; return { text: (hi ? hi + ' ' : '') + cvDebriefOpening(deb), offer: null }; }
  const th = typeof cfThreadDue === 'function' && st ? cfThreadDue(st, today) : null;
  if(th){
    const t = String(G.text).replace(/\s*Une question \?$/, '') + ' ' + cfFollowQ(th);
    if(typeof cfThreadAsked === 'function') cfThreadAsked(th.id);
    if(typeof coachHistory !== 'undefined') coachHistory.push({ role: 'assistant', content: t, date: today });   // le Coach sait à quoi tu réponds
    return { text: t, offer: null };
  }
  return G;
}

// ─── 2 · Débrief de séance à la voix : « comment c'était ? », une ou deux relances, puis effort, douleur et ressenti enregistrés ───
const CV_DEB_Q = { rpe: 'Et l\'effort, sur 10 ?', pain: 'Une douleur ou une gêne quelque part ?' };
function cvDebriefOpening(s){
  const p = (s && s.perf) || {}, km = s && s.km ? String(Math.round(s.km * 10) / 10).replace('.', ',') + ' km' : '', pace = p.pace ? String(p.pace).replace(':', '\'') + '/km' : '';
  return 'Bravo pour ' + (km ? 'tes ' + km : 'ta séance') + (pace ? ' à ' + pace : '') + ' ! Raconte-moi : comment c\'était ?';
}
// ce qui manque après tes réponses : {ask: 'rpe' | 'pain' | null, rpe, pain, note} (lecture locale jvParse + réponses courtes)
function cvDebriefNext(parts, asked){
  asked = asked || {};
  // asked.rpe / asked.pain = rang de la réponse à cette question dans parts
  const all = (parts || []).join('. '), ans = function(i){ return String((parts || [])[i] || '').toLowerCase().replace(/[’]/g, "'").trim(); };
  const P = typeof jvParse === 'function' ? jvParse(all) : { rpe: null, pain: null, note: all };
  let rpe = P.rpe, pain = P.pain;
  if(!rpe && asked.rpe != null){ const m = ans(asked.rpe).match(/\b(10|[1-9])\b|\b(un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\b/); if(m) rpe = m[1] ? +m[1] : CV_NUM[m[2]]; }
  if(pain == null && asked.pain != null && /^(non|nan|rien|aucune?|pas (de|du tout)|tout va bien|nickel|ras)\b/.test(ans(asked.pain))) pain = { level: 0, zone: null };
  const ask = !rpe && asked.rpe == null ? 'rpe' : pain == null && asked.pain == null ? 'pain' : null;
  return { ask: ask, rpe: rpe || null, pain: pain, note: P.note || null };
}
// séance à débriefer : validée automatiquement sans ressenti (aujourd'hui seulement à l'ouverture), sinon la dernière faite (≤ 1 jour)
function _cvDebriefSession(todayOnly){
  const today = _cvToday();
  try {
    const L = typeof avPendingFeel === 'function' ? avPendingFeel() : [];
    const a = L.filter(function(s){ return !todayOnly || s.date === today; }).sort(function(x, y){ return x.date < y.date ? 1 : -1; })[0];
    if(a || todayOnly) return a || null;
    const st = typeof prRealState === 'function' ? prRealState() : state;
    return (typeof prSessions === 'function' ? prSessions(st) : []).filter(function(s){ return s.done && s.type !== 'rest' && s.date && s.date <= today && s.date >= _cvAddDays(today, -1); })
      .sort(function(x, y){ return x.date < y.date ? 1 : -1; })[0] || null;
  } catch(e) { diagSilent(e, 'coach-voice:_cvDebriefSession'); return null; }
}
function _cvDebriefStart(key){
  if(!_cv) return;
  let s = null;
  try { if(key && typeof prSessions === 'function') s = prSessions(typeof prRealState === 'function' ? prRealState() : state).filter(function(x){ return x.key === key && x.done; })[0] || null; } catch(e) { diagSilent(e, 'coach-voice:_cvDebriefStart'); }
  s = s || _cvDebriefSession(false);
  if(!s){ _cvSay('Je ne trouve pas de séance récente à débriefer. Pose-moi ta question !'); return; }
  _cv.deb = { key: s.key, s: s, parts: [], asked: {} };
  _cvSay(cvDebriefOpening(s), _cvListenAfter);
}
function _cvListenAfter(){ if(_cv && !_cv.closed){ if(_cv.canListen && _cv.prefs.auto) cvListen(true); else _cvSet('idle'); } }
// une réponse du débrief : relance (effort, douleur) ou enregistrement ; false = ce n'était pas un débrief (une question)
function _cvDebriefTurn(text){
  const d = _cv.deb;
  if(!d.parts.length && (/\?\s*$/.test(text) || /^(est-ce|pourquoi|comment je|quel|quelle|combien|qu'est-ce)/i.test(text.trim()))){ _cv.deb = null; return false; }
  d.parts.push(text);
  const N = cvDebriefNext(d.parts, d.asked);
  _cvLogPush();
  const you = document.querySelector('#cv-ov .cv-you'); if(you) you.textContent = text;
  if(N.ask){ d.asked[N.ask] = d.parts.length; _cvSay(CV_DEB_Q[N.ask], _cvListenAfter); return true; }   // la prochaine réponse répond à cette question
  d.done = true; _cvDebriefSave(N);
  return true;
}
async function _cvDebriefSave(N){
  const d = _cv.deb, k = d.key, s = d.s, text = d.parts.join(' ').slice(0, 1200);
  _cvSet('think', 'Je note ton ressenti…');
  let p = {}; try { p = JSON.parse(state[k + '_perf'] || '{}') || {}; } catch(e) {}
  let rpe = N.rpe, pain = N.pain, note = N.note;
  try {   // lecture fine par le Coach (même fonction que « Raconte ta séance ») ; la lecture locale reste le repli
    const base = typeof FUNCTIONS_BASE !== 'undefined' ? FUNCTIONS_BASE : 'https://us-central1-prepa-marathon.cloudfunctions.net';
    const r = await fetch(base + '/sessionJournal', { method: 'POST', headers: await authHeaders(false), body: JSON.stringify({ text: text, session: { title: s.title, type: s.type, km: s.km, pace: p.pace, hr: p.hr } }) });
    const j = await r.json();
    if(j && j.success){ if(j.rpe) rpe = j.rpe; if(j.pain) pain = j.pain; if(j.note) note = j.note; }
  } catch(e) {}
  if(!_cv) return;
  if(rpe) p.rpe = rpe; if(pain) p.pain = pain; p.journal = text; if(note) p.note = note; delete p.feelSkip;
  try { state[k + '_perf'] = JSON.stringify(p); save(); if(typeof sessionChanged === 'function') sessionChanged({ now: true }); } catch(e) { diagSilent(e, 'coach-voice:_cvDebriefSave'); }
  _cv.deb = null;
  if(typeof showToast === 'function') showToast('Ressenti enregistré' + (rpe ? ' · effort ' + rpe + '/10' : ''), '🎙️');
  const km = s.km ? String(Math.round(s.km * 10) / 10).replace('.', ',') + ' km' : '';
  const msg = 'Débrief de ma séance « ' + s.title + ' » (' + km + (p.pace ? ' à ' + String(p.pace).replace(':', '\'') + '/km' : '') + (p.hr ? ', FC ' + p.hr : '') + ') : « ' + text + ' ».'
    + (rpe ? ' Effort ' + rpe + '/10.' : '') + (pain && pain.level ? ' Douleur ' + pain.level + '/3' + (pain.zone ? ' (' + pain.zone + ')' : '') + '.' : pain ? ' Aucune douleur.' : '')
    + ' Réagis en 1 ou 2 phrases, comme un coach qui écoute.';
  cvAsk(msg, d.parts[d.parts.length - 1], true);
}

// ─── 4 · Montrer en parlant : une carte sous la réponse ───
function cvCardKind(q){
  const t = String(q || '').toLowerCase().replace(/[’]/g, "'");
  if(/plan de course|km par km|kilom[eè]tres? par kilom[eè]tre|strat[ée]gie de course|allures? (de|pour) (la |ma )?course|d[ée]coupage/.test(t)) return 'race';
  if(/pr[ée]diction|pr[ée]vu|quel temps|chrono|en combien|temps (pour|de|à) (ma |la )?course|viser/.test(t)) return 'pred';
  if(/allure (ef|d'endurance|endurance)|\bef\b|endurance fondamentale|progress/.test(t)) return 'ef';
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
    if(kind === 'ef'){
      const P = cvEfPoints(typeof prAllDone === 'function' ? prAllDone(_cvIso(new Date())) : []); if(P.length < 2) return '';
      const slow = Math.max.apply(null, P.map(function(x){ return x.p; })), fast = Math.min.apply(null, P.map(function(x){ return x.p; }));
      const ef = typeof getBestEfPace === 'function' ? getBestEfPace() : null;
      return '<div class="cv-cd"><p class="cv-cdh"><span>📈 Allure EF · sur plat</span><b>' + (ef ? _cvE(String(ef).replace(':', '\'')) + '/km' : '') + '</b></p>'
        + P.map(function(x, i){ return '<div class="cv-sp' + (i === P.length - 1 ? ' l' : '') + '"><span>' + _cvE(x.d.slice(8) + '/' + x.d.slice(5, 7)) + '</span><i><u style="width:' + (slow > fast ? Math.round(35 + 65 * (slow - x.p) / (slow - fast)) : 70) + '%"></u></i><b>' + _cvP(x.p) + '</b><small>' + (x.hr ? '♥' + x.hr : '') + '</small></div>'; }).join('')
        + '<p class="cv-cdl">' + (P[P.length - 1].p < P[0].p ? '↗ ' + (P[0].p - P[P.length - 1].p) + ' s/km plus rapide qu\'au début' : P[P.length - 1].p > P[0].p ? '↘ ' + (P[P.length - 1].p - P[0].p) + ' s/km plus lent qu\'au début' : '= stable') + ' · barre longue = plus rapide</p></div>';
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
// tes 6 dernières sorties EF / longues : allure sur plat (pente et météo retirées), FC
function cvEfPoints(done){
  return (done || []).filter(function(s){ return (s.type === 'ef' || s.type === 'long') && s.perf && s.perf.pace; }).slice(-6).map(function(s){
    let p = null; try { const E = typeof prEqPace === 'function' ? prEqPace(s.perf, s.km) : null; if(E && E.eq) p = Math.round(E.eq); } catch(e) {}
    if(!p){ const m = String(s.perf.pace).match(/(\d{1,2})[:'’](\d{2})/); p = m ? +m[1] * 60 + +m[2] : null; }
    return { d: s.date, p: p, hr: parseInt(s.perf.hr) || null };
  }).filter(function(x){ return x.p; });
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
  if(!_cv) return;
  const you = document.querySelector('#cv-ov .cv-you'); if(!you || !you.textContent.trim()) return;
  if(_cv.st === 'listen'){ try { if(_cv.rec){ const r = _cv.rec; _cv.rec = null; r.abort(); } } catch(e) {} _cv.finish = null; _cvMicStop(); _cvSet('idle'); }   // micro rouvert : on l'arrête pour corriger
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

// ─── Voix Google (fonction coachTts : voix neuronale française, offre gratuite) ; repli automatique sur la voix de l'iPhone ───
let _cvTtsMem = null, _cvGDef = '';
function _cvUseGoogle(){ return !!(_cv && _cv.prefs.engine !== 'native' && !_cv.ttsDown && _cv.ac && typeof fetch === 'function' && typeof authHeaders === 'function'); }
// vitesse de l'app → vitesse de la voix Google
function cvTtsRate(r){ return r <= 0.95 ? 0.95 : r >= 1.15 ? 1.15 : 1.05; }
function _cvTtsFetch(text){
  const p = _cv.prefs, rate = cvTtsRate(p.rate || 1.05), key = (p.gvoice || '') + '|' + rate + '|' + text, ac = _cv.ac;
  _cvTtsMem = _cvTtsMem || new Map();
  if(_cvTtsMem.has(key)) return _cvTtsMem.get(key);
  const base = typeof FUNCTIONS_BASE !== 'undefined' ? FUNCTIONS_BASE : 'https://us-central1-prepa-marathon.cloudfunctions.net';
  const pr = (async function(){
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, to = setTimeout(function(){ try { if(ctl) ctl.abort(); } catch(e) {} }, 6000);
    try {
      const r = await fetch(base + '/coachTts', { method: 'POST', headers: await authHeaders(false), body: JSON.stringify({ text: text, voice: p.gvoice || undefined, rate: rate }), signal: ctl ? ctl.signal : undefined });
      const j = await r.json().catch(function(){ return {}; });
      if(!r.ok || !j.audio) throw new Error(j.reason || 'HTTP ' + r.status);
      const bin = atob(j.audio), u = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return await new Promise(function(ok, ko){ const q = ac.decodeAudioData(u.buffer, ok, ko); if(q && q.then) q.then(ok, ko); });
    } finally { clearTimeout(to); }
  })();
  pr.catch(function(){ if(_cvTtsMem) _cvTtsMem.delete(key); });
  _cvTtsMem.set(key, pr); if(_cvTtsMem.size > 60) _cvTtsMem.delete(_cvTtsMem.keys().next().value);
  return pr;
}
async function _cvPlayGoogle(it, t, turn){
  let buf = null;
  try { buf = await (it.ap || (it.ap = _cvTtsFetch(t))); if(_cv) _cv.ttsFails = 0; }
  catch(e) { if(_cv){ _cv.ttsFails = (_cv.ttsFails || 0) + 1; if(_cv.ttsFails >= 2) _cv.ttsDown = true; } }   // 2 échecs : voix de l'iPhone pour la suite
  if(!_cv || _cv.closed || _cv.turn !== turn || _cv.mute) return;
  if(!buf){ _cvSpeakNative(t, turn); return; }
  try {
    if(_cv.ac.state === 'suspended' && _cv.ac.resume) _cv.ac.resume();
    const src = _cv.ac.createBufferSource(); src.buffer = buf; src.connect(_cv.ac.destination); _cv.src = src;
    let done = false;
    const end = function(){ if(done) return; done = true; clearTimeout(g); if(!_cv || _cv.turn !== turn || _cv.mute || _cv.src !== src) return; _cv.src = null; _cv.speaking = false; _cvNext(); };
    const g = setTimeout(end, buf.duration * 1000 + 1500);
    src.onended = end; src.start(0);
  } catch(e) { _cvSpeakNative(t, turn); }
}
function _cvStopGoogle(){ if(!_cv || !_cv.src) return; const s = _cv.src; _cv.src = null; try { s.onended = null; s.stop(); } catch(e) {} }
// voix Google proposées dans les réglages (liste gardée 1 jour sur le téléphone)
function _cvGLabel(v){ return (v.gender === 'FEMALE' ? 'Femme' : v.gender === 'MALE' ? 'Homme' : 'Voix') + ' ' + String(v.name).replace(/^fr-FR-(Neural2|Wavenet|Chirp3-HD)-/, '') + ' · ' + v.kind; }
function _cvGVoices(){
  let c = null; try { c = JSON.parse(localStorage.getItem('pm_cv_gv') || 'null'); } catch(e) {}
  if(c && c.def) _cvGDef = c.def;
  if(!c || Date.now() - (c.at || 0) > 86400000){
    (async function(){
      try {
        const base = typeof FUNCTIONS_BASE !== 'undefined' ? FUNCTIONS_BASE : 'https://us-central1-prepa-marathon.cloudfunctions.net';
        const r = await fetch(base + '/coachTts', { method: 'POST', headers: await authHeaders(false), body: JSON.stringify({ list: true }) });
        const j = await r.json(); if(!r.ok || !Array.isArray(j.voices)) return;
        try { localStorage.setItem('pm_cv_gv', JSON.stringify({ at: Date.now(), v: j.voices, def: j.def })); } catch(e) {}
        _cvGDef = j.def || '';
        const ov = document.getElementById('cv-ov'); if(ov && ov.querySelector('.cv-set')){ cvSettings(); cvSettings(); }   // réglages ouverts : liste affichée
      } catch(e) {}
    })();
  }
  return c && Array.isArray(c.v) ? c.v : [];
}

// fil écrit du Coach (briefs longs, « Mon plan », historique) depuis l'écran vocal ; préférence de l'onglet Coach
function cvOpenText(){ closeCoachVoice(); if(typeof showScreen === 'function') showScreen('coach'); }
function cvTabPref(v){ try { localStorage.setItem('pm_coach_tab', v === 'text' ? 'text' : 'voice'); } catch(e) {} cvSettings(); cvSettings(); }
