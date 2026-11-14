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
// réglages (par téléphone) : vitesse, voix, sons, écoute automatique après la réponse
const CV_RATES = [['Lente', 0.92], ['Normale', 1.05], ['Rapide', 1.2]];
function _cvPrefs(){ let p = {}; try { p = JSON.parse(localStorage.getItem('pm_cv') || '{}') || {}; } catch(e) {} return { rate: +p.rate || 1.05, voice: p.voice || '', sounds: p.sounds !== false, auto: p.auto !== false }; }
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
  const s = document.createElement('style'); s.id = 'cv-css';
  s.textContent = '#cv-ov{position:fixed;inset:0;z-index:9000;display:flex;flex-direction:column;align-items:center;color:#fff;background:radial-gradient(120% 80% at 50% 0%,#312e81 0%,#0f172a 55%,#020617 100%);padding:calc(env(safe-area-inset-top) + 14px) 20px calc(env(safe-area-inset-bottom) + 18px);box-sizing:border-box;font-family:inherit;}'
    + '#cv-ov .cv-top{width:100%;display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;}'
    + '#cv-ov .cv-top span{opacity:.75;flex:1;}'
    + '#cv-ov .cv-x,#cv-ov .cv-gear{background:rgba(255,255,255,.12);border:none;color:#fff;width:38px;height:38px;border-radius:50%;font-size:18px;cursor:pointer;}'
    + '#cv-ov .cv-log{width:100%;max-width:520px;max-height:24vh;overflow:auto;display:flex;flex-direction:column;gap:6px;margin-top:10px;-webkit-mask-image:linear-gradient(to bottom,transparent,#000 30%);mask-image:linear-gradient(to bottom,transparent,#000 30%);}'
    + '#cv-ov .cv-log p{margin:0;font-size:13px;line-height:1.45;opacity:.55;}#cv-ov .cv-log p.u{text-align:right;font-weight:700;}'
    + '#cv-ov .cv-mid{flex:1;width:100%;max-width:520px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;min-height:0;}'
    + '#cv-ov .cv-orb{position:relative;width:150px;height:150px;flex-shrink:0;border-radius:50%;border:none;cursor:pointer;background:radial-gradient(circle at 35% 30%,#a5b4fc,#6366f1 45%,#4338ca 75%);box-shadow:0 0 60px rgba(99,102,241,.45);transition:transform .25s ease,box-shadow .25s ease;-webkit-tap-highlight-color:transparent;}'
    + '#cv-ov .cv-orb::before,#cv-ov .cv-orb::after{content:"";position:absolute;inset:-14px;border-radius:50%;border:2px solid rgba(165,180,252,.35);opacity:0;}'
    + '#cv-ov.listen .cv-orb{background:radial-gradient(circle at 35% 30%,#99f6e4,#14b8a6 45%,#0f766e 78%);box-shadow:0 0 70px rgba(20,184,166,.5);}'
    + '#cv-ov.listen .cv-orb::before{animation:cvRing 1.6s ease-out infinite;}#cv-ov.listen .cv-orb::after{animation:cvRing 1.6s ease-out .8s infinite;}'
    + '#cv-ov.listen.hear .cv-orb{transform:scale(1.07);}'
    + '#cv-ov.think .cv-orb{animation:cvBreath 1.2s ease-in-out infinite;background:conic-gradient(from 0deg,#6366f1,#a855f7,#6366f1);}'
    + '#cv-ov.speak .cv-orb{animation:cvTalk .5s ease-in-out infinite alternate;background:radial-gradient(circle at 35% 30%,#fde68a,#f59e0b 45%,#c2410c 80%);box-shadow:0 0 70px rgba(245,158,11,.45);}'
    + '@keyframes cvRing{0%{transform:scale(.9);opacity:.8}100%{transform:scale(1.35);opacity:0}}@keyframes cvBreath{50%{transform:scale(.94)}}@keyframes cvTalk{to{transform:scale(1.06)}}'
    + '@media (prefers-reduced-motion: reduce){#cv-ov .cv-orb,#cv-ov .cv-orb::before,#cv-ov .cv-orb::after{animation:none!important;transition:none!important}}'
    + '#cv-ov .cv-st{font-size:15px;font-weight:700;opacity:.85;text-align:center;min-height:20px;margin:0;}'
    + '#cv-ov .cv-you{font-size:21px;font-weight:700;line-height:1.35;text-align:center;min-height:28px;max-height:20vh;overflow:auto;margin:0;}'
    + '#cv-ov .cv-you.interim{opacity:.6;}'
    + '#cv-ov .cv-co{font-size:15.5px;line-height:1.55;opacity:.92;text-align:center;max-height:24vh;overflow:auto;margin:0;cursor:pointer;}'
    + '#cv-ov .cv-co:not(:empty)::after{content:"  🔁";opacity:.5;font-size:12px;}'
    + '#cv-ov .cv-sug{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;}'
    + '#cv-ov .cv-sug button{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff;border-radius:999px;padding:9px 14px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit;}'
    + '#cv-ov .cv-bot{width:100%;max-width:520px;display:flex;gap:8px;align-items:center;}'
    + '#cv-ov .cv-bot input{flex:1;min-width:0;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff;border-radius:999px;padding:11px 16px;font-size:15px;font-family:inherit;outline:none;}'
    + '#cv-ov .cv-bot input::placeholder{color:rgba(255,255,255,.55);}'
    + '#cv-ov .cv-bot button{background:rgba(255,255,255,.14);border:none;color:#fff;border-radius:999px;padding:11px 14px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;}'
    + '#cv-ov .cv-set{position:absolute;left:16px;right:16px;top:calc(env(safe-area-inset-top) + 62px);max-width:520px;margin:0 auto;background:rgba(15,23,42,.97);border:1px solid rgba(255,255,255,.15);border-radius:18px;padding:14px;display:flex;flex-direction:column;gap:12px;z-index:2;}'
    + '#cv-ov .cv-set b{font-size:11px;letter-spacing:.1em;text-transform:uppercase;opacity:.7;}'
    + '#cv-ov .cv-seg{display:flex;gap:6px;flex-wrap:wrap;}#cv-ov .cv-seg button{flex:1;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#fff;border-radius:10px;padding:8px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;}'
    + '#cv-ov .cv-seg button[aria-pressed=true]{background:#6366f1;border-color:#6366f1;}'
    + '#cv-ov .cv-set select{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:8px;font-size:14px;font-family:inherit;}'
    + '#cv-ov :focus-visible{outline:2px solid #a5b4fc;outline-offset:3px;}';
  document.head.appendChild(s);
}
function _cvSet(st, label){
  if(!_cv) return; _cv.st = st;
  const ov = document.getElementById('cv-ov'); if(!ov) return;
  ov.classList.remove('listen', 'think', 'speak', 'idle', 'hear'); ov.classList.add(st);
  const L = { listen: 'Je t\'écoute…', think: 'Je réfléchis…', speak: 'Touche pour m\'interrompre', idle: _cv.canListen ? 'Touche pour parler' : 'Écris ta question en bas' };
  const el = ov.querySelector('.cv-st'); if(el) el.textContent = label || L[st] || '';
  const orb = ov.querySelector('.cv-orb'); if(orb) orb.setAttribute('aria-label', L[st] || 'Parler');
}
function openCoachVoice(){
  if(typeof coachAI === 'function' && !coachAI()) return;
  if(document.getElementById('cv-ov')) return;
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
  ov.innerHTML = '<div class="cv-top"><span>🎙️ Coach · à la voix</span><button type="button" class="cv-gear" aria-label="Réglages de la voix" onclick="cvSettings()">⚙️</button><button type="button" class="cv-x" aria-label="Fermer" onclick="closeCoachVoice()">×</button></div>'
    + '<div class="cv-log" aria-label="Échanges précédents"></div>'
    + '<div class="cv-mid"><button type="button" class="cv-orb" onclick="cvOrbTap()"></button><p class="cv-st"></p><p class="cv-you"></p><p class="cv-co" aria-live="polite" onclick="cvRepeat()" title="Relire"></p>'
    + '<div class="cv-sug">' + sug.map(function(t, i){ return '<button type="button" onclick="cvAsk(_cv.sug[' + i + '])">' + t.replace(/</g, '&lt;') + '</button>'; }).join('') + '</div></div>'
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
    + '<b>Réécouter après chaque réponse</b>' + seg('auto', [['Oui', true], ['Non', false]]);
  ov.appendChild(box);
}
function cvRepeat(){ if(!_cv || !_cv.reply || _cv.st === 'think') return; try { if(_cv.rec) _cv.rec.abort(); } catch(e) {} _cvHush(); _cv.mute = false; _cv.streamDone = true; cvSentences(_cv.reply, true).out.forEach(_cvQueue); }
function cvOrbTap(){
  if(!_cv) return;
  if(_cv.st === 'speak'){ _cvHush(); cvListen(); return; }        // interrompre et parler
  if(_cv.st === 'listen'){ try { _cv.rec && _cv.rec.stop(); } catch(e) {} return; }   // j'ai fini de parler
  if(_cv.st === 'idle'){ if(_cv.canListen) cvListen(); else { const i = document.getElementById('cv-in'); if(i) i.focus(); } }
}
function _cvHush(){ if(!_cv) return; _cv.q = []; _cv.speaking = false; _cv.mute = true; try { speechSynthesis.cancel(); } catch(e) {} }
// écoute : texte en direct ; fin de tour = silence (cvTurnWait : plus long si la phrase n'est pas finie) ou fin de la dictée
// auto = relance après la réponse (hors d'un toucher : l'iPhone peut la refuser → « Touche pour parler », micro gardé)
function cvListen(auto){
  if(!_cv || _cv.closed) return;
  const R = _cvRecClass(); if(!R){ _cvSet('idle'); return; }
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
    if(!rec._spoke && _cv.heard){ rec._spoke = true; const co = ov && ov.querySelector('.cv-co'); if(co) co.textContent = ''; }
    if(ov){ ov.classList.add('hear'); clearTimeout(rec._hearT); rec._hearT = setTimeout(function(){ ov.classList.remove('hear'); }, 260); }
    if(you){ you.textContent = _cv.heard; you.classList.toggle('interim', !!tmp); }
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
function _cvLogPush(){
  if(!_cv) return;
  const ov = document.getElementById('cv-ov'), you = ov && ov.querySelector('.cv-you'), log = ov && ov.querySelector('.cv-log');
  if(!log || !you || !you.textContent || !_cv.reply) return;
  _cv.log.push({ u: you.textContent, c: _cv.reply.replace(/[*#`_]/g, '') }); _cv.log = _cv.log.slice(-4);
  log.innerHTML = _cv.log.map(function(x){ const e = function(t){ return String(t).replace(/[&<>]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }; return '<p class="u">' + e(x.u) + '</p><p>' + e(x.c) + '</p>'; }).join('');
  log.scrollTop = log.scrollHeight;
}
// question → Coach (mode voix) ; chaque phrase reçue part tout de suite à la lecture
function cvAsk(text){
  if(!_cv || !text) return;
  try { if(_cv.rec) _cv.rec.abort(); } catch(e) {}
  _cvHush(); _cv.mute = false;
  _cvLogPush();
  const ov = document.getElementById('cv-ov'), you = ov && ov.querySelector('.cv-you'), co = ov && ov.querySelector('.cv-co'), sug = ov && ov.querySelector('.cv-sug'), set = ov && ov.querySelector('.cv-set');
  if(you){ you.textContent = text; you.classList.remove('interim'); } if(co) co.textContent = ''; if(sug) sug.style.display = 'none'; if(set) set.remove();
  _cv.buf = ''; _cv.reply = ''; _cv.streamDone = false; const turn = _cv.turn = (_cv.turn || 0) + 1;
  _cvSet('think'); _cvTone('send');
  if(typeof sendCoachMessage !== 'function'){ _cvSet('idle', 'Coach indisponible'); return; }
  const opts = { voice: true,
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
    } };
  if(typeof _cv.memos === 'string') opts.memos = _cv.memos;
  sendCoachMessage(text, opts);
}
function _cvQueue(sentence){ if(!_cv) return; const t = cvSpeakable(sentence); if(t.replace(/[\s.,;:!?]/g, '').length < 2) return; _cv.q.push(t); _cvNext(); }
function _cvNext(){
  if(!_cv || _cv.closed || _cv.speaking) return;
  const t = _cv.q.shift();
  if(!t){
    if(_cv.streamDone && _cv.st !== 'listen' && _cv.st !== 'idle'){
      if(_cv.canListen && _cv.prefs.auto) setTimeout(function(){ if(_cv && !_cv.speaking && _cv.streamDone && !_cv.q.length) cvListen(true); }, 350);
      else _cvSet('idle');
    }
    return;
  }
  if(typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined'){ _cv.q = []; _cvSet('idle'); return; }
  const u = new SpeechSynthesisUtterance(t); u.lang = 'fr-FR'; if(_cv.voice) u.voice = _cv.voice; u.rate = _cv.prefs.rate || 1.05; u.pitch = 1;
  const turn = _cv.turn;
  let done = false; const next = function(){ if(done) return; done = true; clearTimeout(guard); if(!_cv || _cv.turn !== turn) return; _cv.speaking = false; _cvNext(); };
  const guard = setTimeout(next, 2500 + t.length * 110 / (u.rate || 1));   // filet : certains navigateurs n'appellent pas onend
  u.onend = next; u.onerror = next;
  _cv.speaking = true; _cvSet('speak');
  try { speechSynthesis.speak(u); } catch(e) { next(); }
}
