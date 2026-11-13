// ─── Parler au Coach à la voix (compte admin, à la demande : groupe « voice », point d'entrée openCoachVoice) ───
// Conversation mains libres plein écran : tu parles (dictée fr-FR), le Coach répond en mode « voix » (réponse courte faite
// pour être écoutée, responseMode 'voix' de coachChat) et commence à parler dès sa 1re phrase reçue (cvSentences) ; à la fin
// de sa réponse, l'écoute reprend toute seule. Toucher la bulle pendant qu'il parle = l'interrompre et parler. Les échanges
// restent dans le fil du Coach (sendCoachMessage, même historique). Textes rendus prononçables (cvSpeakable : allures, FC,
// abréviations, sans émojis ni markdown). Sans dictée dans le navigateur : on peut quand même écrire, le Coach répond à voix haute.
const CV_SUGGEST = ['Comment je me sens pour ma séance ?', 'Qu\'est-ce que je fais demain ?', 'Fais-moi le point sur ma semaine'];
let _cv = null;

// texte du Coach → texte à prononcer
function cvSpeakable(t){
  return String(t || '')
    .replace(/\[FEU:[^\]]*\]/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ').replace(/[`*_#>|]/g, ' ')
    .replace(/\p{Extended_Pictographic}|️|‍|[●○★☆✓✅⚠️➜→•▪︎·]/gu, ' ')
    .replace(/(\d{1,2})\s*h\s*(\d{2})(?:\s*min)?(?:\s*['’]\s*(\d{2}))?/g, function(m, h, mi, se){ return h + ' heure' + (+h > 1 ? 's ' : ' ') + mi + (se ? ' et ' + se + ' secondes' : ''); })
    .replace(/(\d{1,2})\s*['’]\s*(\d{2})(?:["”]|'')?(\s*\/\s*km)?/g, function(m, mi, se, km){ return mi + ' minute' + (+mi > 1 ? 's ' : ' ') + se + (km ? ' au kilomètre' : ''); })
    .replace(/\/\s*km\b/g, ' au kilomètre')
    .replace(/(\d)\s*km\b/g, '$1 kilomètres').replace(/\bkm\b/g, 'kilomètres')
    .replace(/(\d)\s*bpm\b/gi, '$1 pulsations').replace(/\bbpm\b/gi, 'pulsations')
    .replace(/\bFC\s*max\b/g, 'fréquence cardiaque max').replace(/\bFC\b/g, 'fréquence cardiaque')
    .replace(/\bVFC\b/g, 'variabilité cardiaque').replace(/\bEF\b/g, 'endurance fondamentale').replace(/\bVMA\b/g, 'V M A')
    .replace(/\bS(\d{1,2})\b/g, 'semaine $1').replace(/\bJ\s*-\s*(\d+)\b/g, 'J moins $1')
    .replace(/(\d),(\d)/g, '$1 virgule $2')
    .replace(/\s*\n+\s*/g, '. ').replace(/\.(\s*\.)+/g, '.').replace(/\s{2,}/g, ' ').trim();
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
function _cvRecClass(){ return typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition || null) : null; }
function _cvVoice(){
  if(typeof speechSynthesis === 'undefined') return null;
  const V = speechSynthesis.getVoices().filter(function(v){ return /^fr(-|_|$)/i.test(v.lang); });
  const score = function(v){ return (/fr-FR/i.test(v.lang) ? 4 : 0) + (/premium|enhanced|améliorée|neural|natural/i.test(v.name) ? 3 : 0) + (/Amélie|Thomas|Audrey|Aurélie|Google/i.test(v.name) ? 2 : 0) + (v.localService ? 1 : 0); };
  return V.sort(function(a, b){ return score(b) - score(a); })[0] || null;
}
function _cvCss(){
  if(document.getElementById('cv-css')) return;
  const s = document.createElement('style'); s.id = 'cv-css';
  s.textContent = '#cv-ov{position:fixed;inset:0;z-index:9000;display:flex;flex-direction:column;align-items:center;color:#fff;background:radial-gradient(120% 80% at 50% 0%,#312e81 0%,#0f172a 55%,#020617 100%);padding:calc(env(safe-area-inset-top) + 14px) 20px calc(env(safe-area-inset-bottom) + 18px);box-sizing:border-box;font-family:inherit;}'
    + '#cv-ov .cv-top{width:100%;display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.75;}'
    + '#cv-ov .cv-x{background:rgba(255,255,255,.12);border:none;color:#fff;width:38px;height:38px;border-radius:50%;font-size:20px;cursor:pointer;}'
    + '#cv-ov .cv-mid{flex:1;width:100%;max-width:520px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;min-height:0;}'
    + '#cv-ov .cv-orb{position:relative;width:150px;height:150px;border-radius:50%;border:none;cursor:pointer;background:radial-gradient(circle at 35% 30%,#a5b4fc,#6366f1 45%,#4338ca 75%);box-shadow:0 0 60px rgba(99,102,241,.45);transition:transform .25s ease,box-shadow .25s ease;-webkit-tap-highlight-color:transparent;}'
    + '#cv-ov .cv-orb::before,#cv-ov .cv-orb::after{content:"";position:absolute;inset:-14px;border-radius:50%;border:2px solid rgba(165,180,252,.35);opacity:0;}'
    + '#cv-ov.listen .cv-orb{background:radial-gradient(circle at 35% 30%,#99f6e4,#14b8a6 45%,#0f766e 78%);box-shadow:0 0 70px rgba(20,184,166,.5);}'
    + '#cv-ov.listen .cv-orb::before{animation:cvRing 1.6s ease-out infinite;}#cv-ov.listen .cv-orb::after{animation:cvRing 1.6s ease-out .8s infinite;}'
    + '#cv-ov.think .cv-orb{animation:cvBreath 1.2s ease-in-out infinite;background:conic-gradient(from 0deg,#6366f1,#a855f7,#6366f1);}'
    + '#cv-ov.speak .cv-orb{animation:cvTalk .5s ease-in-out infinite alternate;background:radial-gradient(circle at 35% 30%,#fde68a,#f59e0b 45%,#c2410c 80%);box-shadow:0 0 70px rgba(245,158,11,.45);}'
    + '@keyframes cvRing{0%{transform:scale(.9);opacity:.8}100%{transform:scale(1.35);opacity:0}}@keyframes cvBreath{50%{transform:scale(.94)}}@keyframes cvTalk{to{transform:scale(1.06)}}'
    + '@media (prefers-reduced-motion: reduce){#cv-ov .cv-orb,#cv-ov .cv-orb::before,#cv-ov .cv-orb::after{animation:none!important}}'
    + '#cv-ov .cv-st{font-size:15px;font-weight:700;opacity:.85;text-align:center;min-height:20px;}'
    + '#cv-ov .cv-you{font-size:21px;font-weight:700;line-height:1.35;text-align:center;min-height:28px;max-height:22vh;overflow:auto;}'
    + '#cv-ov .cv-you.interim{opacity:.6;}'
    + '#cv-ov .cv-co{font-size:15.5px;line-height:1.55;opacity:.9;text-align:center;max-height:26vh;overflow:auto;}'
    + '#cv-ov .cv-sug{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;}'
    + '#cv-ov .cv-sug button{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff;border-radius:999px;padding:9px 14px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit;}'
    + '#cv-ov .cv-bot{width:100%;max-width:520px;display:flex;gap:8px;align-items:center;}'
    + '#cv-ov .cv-bot input{flex:1;min-width:0;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff;border-radius:999px;padding:11px 16px;font-size:15px;font-family:inherit;outline:none;}'
    + '#cv-ov .cv-bot input::placeholder{color:rgba(255,255,255,.55);}'
    + '#cv-ov .cv-bot button{background:rgba(255,255,255,.14);border:none;color:#fff;border-radius:999px;padding:11px 14px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;}'
    + '#cv-ov :focus-visible{outline:2px solid #a5b4fc;outline-offset:3px;}';
  document.head.appendChild(s);
}
function _cvSet(st, label){
  if(!_cv) return; _cv.st = st;
  const ov = document.getElementById('cv-ov'); if(!ov) return;
  ov.classList.remove('listen', 'think', 'speak', 'idle'); ov.classList.add(st);
  const L = { listen: 'Je t\'écoute…', think: 'Je réfléchis…', speak: 'Touche pour m\'interrompre', idle: _cv.canListen ? 'Touche pour parler' : 'Écris ta question en bas' };
  const el = ov.querySelector('.cv-st'); if(el) el.textContent = label || L[st] || '';
  const orb = ov.querySelector('.cv-orb'); if(orb) orb.setAttribute('aria-label', L[st] || 'Parler');
}
function openCoachVoice(){
  if(typeof coachAI === 'function' && !coachAI()) return;
  if(document.getElementById('cv-ov')) return;
  _cvCss();
  _cv = { st: 'idle', q: [], buf: '', speaking: false, streamDone: true, rec: null, closed: false, canListen: !!_cvRecClass(), heard: '', reply: '', lock: null, empty: 0 };
  // déverrouille la voix sur iPhone : 1re lecture dans le geste qui ouvre l'écran
  try { if(typeof speechSynthesis !== 'undefined'){ speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); speechSynthesis.onvoiceschanged = function(){ if(_cv) _cv.voice = _cvVoice(); }; } } catch(e) {}
  _cv.voice = _cvVoice();
  const ov = document.createElement('div'); ov.id = 'cv-ov'; ov.className = 'idle'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Parler au Coach');
  ov.innerHTML = '<div class="cv-top"><span>🎙️ Coach · à la voix</span><button type="button" class="cv-x" aria-label="Fermer" onclick="closeCoachVoice()">×</button></div>'
    + '<div class="cv-mid"><button type="button" class="cv-orb" onclick="cvOrbTap()"></button><p class="cv-st"></p><p class="cv-you"></p><p class="cv-co" aria-live="polite"></p>'
    + '<div class="cv-sug">' + CV_SUGGEST.map(function(t, i){ return '<button type="button" onclick="cvAsk(CV_SUGGEST[' + i + '])">' + t + '</button>'; }).join('') + '</div></div>'
    + '<form class="cv-bot" onsubmit="event.preventDefault();cvTyped()"><input id="cv-in" type="text" enterkeyhint="send" placeholder="Ou écris ici…" aria-label="Écrire au Coach"><button type="submit">Envoyer</button></form>';
  document.body.appendChild(ov);
  try { if(navigator.wakeLock) navigator.wakeLock.request('screen').then(function(l){ if(_cv) _cv.lock = l; }).catch(function(){}); } catch(e) {}
  _cvSet('idle');
  if(_cv.canListen) cvListen();
}
function closeCoachVoice(){
  if(!_cv) return;
  _cv.closed = true;
  try { if(_cv.rec) _cv.rec.abort(); } catch(e) {}
  try { if(typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch(e) {}
  try { if(_cv.lock) _cv.lock.release(); } catch(e) {}
  const ov = document.getElementById('cv-ov'); if(ov) ov.remove();
  _cv = null;
}
function cvOrbTap(){
  if(!_cv) return;
  if(_cv.st === 'speak'){ _cvHush(); cvListen(); return; }        // interrompre et parler
  if(_cv.st === 'listen'){ try { _cv.rec && _cv.rec.stop(); } catch(e) {} return; }   // j'ai fini de parler
  if(_cv.st === 'idle'){ if(_cv.canListen) cvListen(); else { const i = document.getElementById('cv-in'); if(i) i.focus(); } }
}
function _cvHush(){ if(!_cv) return; _cv.q = []; _cv.speaking = false; _cv.mute = true; try { speechSynthesis.cancel(); } catch(e) {} }
// écoute : texte en direct, fin de phrase = envoi (silence de 1,4 s après la dernière parole, ou fin de la dictée)
// auto = relance après la réponse (hors d'un toucher : l'iPhone peut la refuser → « Touche pour parler », micro gardé)
function cvListen(auto){
  if(!_cv || _cv.closed) return;
  const R = _cvRecClass(); if(!R){ _cvSet('idle'); return; }
  try { if(_cv.rec) _cv.rec.abort(); } catch(e) {}
  const rec = new R(); _cv.rec = rec; _cv.heard = '';
  rec.lang = 'fr-FR'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  const you = document.querySelector('#cv-ov .cv-you');
  let quiet = null, sent = false;
  const finish = function(){ if(sent || !_cv || _cv.rec !== rec) return; sent = true; clearTimeout(quiet); try { rec.stop(); } catch(e) {} const t = _cv.heard.trim(); if(t){ _cv.empty = 0; cvAsk(t); } else { _cv.empty++; _cvSet('idle', _cv.empty > 1 ? 'Touche pour parler' : 'Je n\'ai rien entendu — touche pour parler'); } };
  rec.onresult = function(e){
    let fin = '', tmp = '';
    for(let i = 0; i < e.results.length; i++){ const r = e.results[i]; if(r.isFinal) fin += r[0].transcript; else tmp += r[0].transcript; }
    _cv.heard = (fin + ' ' + tmp).replace(/\s+/g, ' ').trim();
    if(!rec._spoke && _cv.heard){ rec._spoke = true; const co = document.querySelector('#cv-ov .cv-co'); if(co) co.textContent = ''; }
    if(you){ you.textContent = _cv.heard; you.classList.toggle('interim', !!tmp); }
    clearTimeout(quiet); quiet = setTimeout(finish, fin && !tmp ? 700 : 1400);
  };
  rec.onerror = function(e){
    if(!e || !/not-allowed|service-not-allowed/.test(e.error || '')) return;
    sent = true;
    if(auto) _cvSet('idle', 'Touche pour parler');
    else { _cv.canListen = false; _cvSet('idle', 'Micro refusé — écris ta question en bas'); }
  };
  rec.onend = finish;
  try { rec.start(); _cvSet('listen'); }   // la réponse précédente reste affichée jusqu'à ce que tu parles
  catch(e) { sent = true; _cvSet('idle'); }   // iPhone : relance refusée hors d'un toucher → « Touche pour parler »
}
function cvTyped(){ const i = document.getElementById('cv-in'); const t = i ? i.value.trim() : ''; if(!t) return; i.value = ''; i.blur(); cvAsk(t); }
// question → Coach (mode voix) ; chaque phrase reçue part tout de suite à la lecture
function cvAsk(text){
  if(!_cv || !text) return;
  try { if(_cv.rec) _cv.rec.abort(); } catch(e) {}
  _cvHush(); _cv.mute = false;
  const ov = document.getElementById('cv-ov'), you = ov && ov.querySelector('.cv-you'), co = ov && ov.querySelector('.cv-co'), sug = ov && ov.querySelector('.cv-sug');
  if(you){ you.textContent = text; you.classList.remove('interim'); } if(co) co.textContent = ''; if(sug) sug.style.display = 'none';
  _cv.buf = ''; _cv.reply = ''; _cv.streamDone = false; const turn = _cv.turn = (_cv.turn || 0) + 1;
  _cvSet('think');
  if(typeof sendCoachMessage !== 'function'){ _cvSet('idle', 'Coach indisponible'); return; }
  sendCoachMessage(text, { voice: true,
    onToken: function(tok){
      if(!_cv || _cv.turn !== turn || _cv.mute) return;
      _cv.reply += tok; if(co) co.textContent = _cv.reply.replace(/[*#`_]/g, '');
      _cv.buf += tok; const S = cvSentences(_cv.buf, false); _cv.buf = S.rest; S.out.forEach(_cvQueue);
    },
    onDone: function(full){
      if(!_cv || _cv.turn !== turn) return;
      if(full == null){ _cv.streamDone = true; _cvSet('idle', 'Le Coach n\'a pas pu répondre — touche pour réessayer'); return; }
      if(!_cv.reply && full){ _cv.reply = full; if(co) co.textContent = full.replace(/[*#`_]/g, ''); _cv.buf = full; }   // réponse arrivée d'un bloc
      if(!_cv.mute){ const S = cvSentences(_cv.buf, true); _cv.buf = ''; S.out.forEach(_cvQueue); }
      _cv.streamDone = true; _cvNext();
    } });
}
function _cvQueue(sentence){ if(!_cv) return; const t = cvSpeakable(sentence); if(t.replace(/[\s.,;:!?]/g, '').length < 2) return; _cv.q.push(t); _cvNext(); }
function _cvNext(){
  if(!_cv || _cv.closed || _cv.speaking) return;
  const t = _cv.q.shift();
  if(!t){
    if(_cv.streamDone && _cv.st !== 'listen' && _cv.st !== 'idle'){ if(_cv.canListen) setTimeout(function(){ if(_cv && !_cv.speaking && _cv.streamDone && !_cv.q.length) cvListen(true); }, 350); else _cvSet('idle'); }
    return;
  }
  if(typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined'){ _cv.q = []; _cvSet('idle'); return; }
  const u = new SpeechSynthesisUtterance(t); u.lang = 'fr-FR'; if(_cv.voice) u.voice = _cv.voice; u.rate = 1.05; u.pitch = 1;
  const turn = _cv.turn;
  let done = false; const next = function(){ if(done) return; done = true; clearTimeout(guard); if(!_cv || _cv.turn !== turn) return; _cv.speaking = false; _cvNext(); };
  const guard = setTimeout(next, 2500 + t.length * 110);   // filet : certains navigateurs n'appellent pas onend
  u.onend = next; u.onerror = next;
  _cv.speaking = true; _cvSet('speak');
  try { speechSynthesis.speak(u); } catch(e) { next(); }
}
