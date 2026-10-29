// Journal de séance à la validation : tu dictes (ou écris) comment ça s'est passé, l'app en tire l'effort ressenti,
// la douleur, sa zone et une note courte, et remplit les champs « Effort ressenti » / « Une douleur ? » (plan-daily.js).
// jvParse(texte) : lecture locale, immédiate, sans réseau ; compte admin : affinée par le Coach (fonction sessionJournal).
// Enregistré dans perf.journal (texte) et perf.note (note, lue par le Coach : « ressenti »).

const _jvNorm = function(t){ return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim(); };
const JV_ZONES = [[/mollet|soleaire|jumeau/, 'Mollet'], [/tibia|periost/, 'Tibia'], [/genou|rotule|tendon rotulien|bandelette/, 'Genou'],
  [/cheville|pied|talon|plante|voute|orteil|achille|fascia/, 'Cheville / pied'], [/ischio|arriere de (la )?cuisse/, 'Ischios'],
  [/quadri|cuisse/, 'Quadriceps'], [/hanche|fessier|bassin|psoas|aine/, 'Hanche'], [/dos|lombaire|lombes/, 'Dos']];
const JV_NUM = { un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10 };

function jvParse(text){
  const raw = String(text || '').replace(/\s+/g, ' ').trim(), t = ' ' + _jvNorm(raw) + ' ';
  const out = { rpe: null, pain: null, note: null };
  if(t.trim().length < 3) return out;
  // effort : « 7 sur 10 », « 7/10 », « effort 7 », sinon les mots
  const num = '(10|[1-9]|un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)';
  let m = t.match(new RegExp(num + '\\s*(?:sur|/)\\s*10\\b')) || t.match(new RegExp('(?:effort|rpe|ressenti)\\s*(?:de|a|:)?\\s*' + num + '\\b'));
  if(m){ const v = JV_NUM[m[1]] || parseInt(m[1]); if(v >= 1 && v <= 10) out.rpe = v; }
  if(!out.rpe){
    const W = [[/a bloc|explose|crame|a fond|epuise|mort |vide |a l agonie|horrible/, 9], [/tres (tres )?(dur|difficile|dure)|super dur|vraiment dur|galere/, 8],
      [/pas (si |tres |trop )?(dur|difficile)/, 4], [/pas (si |tres )?facile/, 6],
      [/\bdure?s?\b|difficile|costaud|exigeant|lourde?s?|penible|souffert|compliquee?/, 7], [/correct|modere|moyen|ca allait|normal/, 5],
      [/tres facile|super facile|trop facile|balade|footing de recup/, 2], [/plutot facile|assez facile|ca roulait|bonnes? sensations?/, 4],
      [/facile|tranquille|cool|easy|leger|a l aise|detendu|fluide|en aisance/, 3]];
    for(const [re, v] of W){ if(re.test(t)){ out.rpe = v; break; } }
  }
  // douleur
  const none = /(aucune|pas de|sans|zero|rien comme) (douleur|gene|bobo|souci|probleme)|rien a signaler|aucun (souci|bobo|probleme)|pas mal du tout|tout va bien physiquement/;
  const painWord = /douleur|\bmal\b|gene|gener|tiraille|tire |pique|tendu|tension|contracture|courbature|raide|sensible|lance|elance|crampe|douloureu|bless/;
  // « aucune douleur », « pas eu mal », « pas mal » (= plutôt bien) ne parlent pas d'une douleur
  const t2 = t.replace(new RegExp(none.source, 'g'), ' ').replace(/pas (eu )?(de |du tout )?mal\b/g, ' ');
  if(painWord.test(t2)){
    let lvl = 2;
    if(/tres mal|forte|aigue|boit|arrete|oblige de (ralentir|m arreter|marcher)|insupportable|lancinant|bless/.test(t2)) lvl = 3;
    else if(/un peu|leger|legere|petite?|tendu|tension|tiraille|courbature|raide|sensible|rien de grave|crampe/.test(t2)) lvl = 1;
    let zone = 'Autre';
    for(const [re, z] of JV_ZONES){ if(re.test(t2)){ zone = z; break; } }
    out.pain = { level: lvl, zone: zone };
  } else if(none.test(t)) out.pain = { level: 0, zone: null };
  // note : le texte, en une phrase propre
  const n = raw.replace(/^./, function(c){ return c.toUpperCase(); });
  out.note = n.length > 160 ? n.slice(0, 157).replace(/\s+\S*$/, '') + '…' : n;
  return out;
}

// ─── Validation : bloc « Raconte ta séance » ────────────────────────────────
let _jvSession = null, _jvRec = null;
function jvHtml(prev, sess){
  prev = prev || {}; _jvSession = sess || null; _jvCss();
  const can = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  return '<div class="jv" id="jv"><p class="jv-h">🎙️ Raconte ta séance <span>facultatif</span></p>'
    + '<div class="jv-row"><textarea id="jv-text" rows="2" maxlength="1200" placeholder="« Dur sur la fin, mollet gauche un peu tendu, sinon bonnes jambes »">' + prEsc(prev.journal || '') + '</textarea>'
    + (can ? '<button type="button" class="jv-mic" id="jv-mic" onclick="jvMic()" aria-label="Dicter">🎙️</button>' : '') + '</div>'
    + (can ? '' : '<p class="jv-n">Astuce : le micro de ton clavier permet de dicter.</p>')
    + '<button type="button" class="jv-go" onclick="jvAnalyze()">✨ Remplir l\'effort et la douleur</button><div class="jv-out" id="jv-out"></div></div>';
}
function jvMic(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition, ta = document.getElementById('jv-text'), btn = document.getElementById('jv-mic');
  if(!SR || !ta) return;
  if(_jvRec){ try { _jvRec.stop(); } catch(e) {} return; }
  const base = ta.value ? ta.value.replace(/\s*$/, ' ') : '';
  const r = new SR(); r.lang = 'fr-FR'; r.interimResults = true; r.continuous = true; _jvRec = r;
  r.onresult = function(e){ let s = ''; for(let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript; ta.value = base + s; };
  r.onerror = function(e){ if(e && e.error === 'not-allowed' && typeof showToast === 'function') showToast('Micro refusé : autorise-le dans les réglages, ou écris ton ressenti', '🎙️'); };
  r.onend = function(){ _jvRec = null; if(btn) btn.classList.remove('on'); if(ta.value.trim()) jvAnalyze(); };
  try { r.start(); if(btn) btn.classList.add('on'); } catch(e) { _jvRec = null; }
}
// applique un résultat aux champs effort / douleur du formulaire
function _jvApply(res, by){
  const b = document.getElementById('pd-rpe');
  if(b){
    if(res.rpe && b.dataset.rpe !== String(res.rpe) && typeof prRpePick === 'function') prRpePick(res.rpe);
    if(res.pain && typeof prPainPick === 'function'){
      prPainPick(res.pain.level);
      if(res.pain.level && res.pain.zone){ const z = Array.prototype.find.call(document.querySelectorAll('#pd-zones .pd-c'), function(x){ return x.textContent === res.pain.zone; }); if(z) prZonePick(z); }
    }
  }
  const o = document.getElementById('jv-out'); if(!o) return;
  const P = ['Aucune', 'Légère', 'Gênante', 'Forte'];
  const chips = [];
  if(res.rpe) chips.push('💪 Effort ' + res.rpe + '/10');
  if(res.pain) chips.push('🩹 ' + (res.pain.level ? 'Douleur ' + P[res.pain.level].toLowerCase() + (res.pain.zone ? ' · ' + res.pain.zone.toLowerCase() : '') : 'Aucune douleur'));
  o.dataset.note = res.note || '';
  o.innerHTML = (chips.length ? '<div class="jv-chips">' + chips.map(function(c){ return '<span>' + prEsc(c) + '</span>'; }).join('') + '</div>' : '<p class="jv-n">Rien trouvé sur l\'effort ou une douleur : choisis-les ci-dessous.</p>')
    + (res.note ? '<p class="jv-note">📝 ' + prEsc(res.note) + '</p>' : '') + '<p class="jv-n">' + by + ' · vérifie et corrige ci-dessous si besoin.</p>';
}
async function jvAnalyze(){
  const ta = document.getElementById('jv-text'); if(!ta) return;
  const text = ta.value.trim(); if(text.length < 3) return;
  _jvApply(jvParse(text), 'Lu par l\'app');
  if(!(typeof isAdmin === 'function' && isAdmin()) || typeof getAuthToken !== 'function') return;
  const o = document.getElementById('jv-out'); if(o) o.insertAdjacentHTML('beforeend', '<p class="jv-n" id="jv-wait">🤖 Le Coach relit…</p>');
  try {
    const token = await getAuthToken();
    const r = await fetch(FUNCTIONS_BASE + '/sessionJournal', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ text: text, session: _jvSession }) });
    const j = await r.json();
    if(!r.ok || !j.success) throw new Error(j.error || 'HTTP ' + r.status);
    if(document.getElementById('jv-text') !== ta || ta.value.trim() !== text) return;      // formulaire fermé ou texte modifié entre-temps
    const loc = jvParse(text);
    _jvApply({ rpe: j.rpe || loc.rpe, pain: j.pain || loc.pain, note: j.note || loc.note }, '🤖 Relu par le Coach');
  } catch(e) { const w = document.getElementById('jv-wait'); if(w) w.remove(); }
}
// lu à l'enregistrement de la validation
function jvRead(){
  const ta = document.getElementById('jv-text'); if(!ta) return null;
  const text = ta.value.trim(); if(!text) return { text: '', note: '' };
  const o = document.getElementById('jv-out');
  return { text: text.slice(0, 1200), note: (o && o.dataset.note) || jvParse(text).note };
}
function _jvCss(){
  if(document.getElementById('jv-css')) return;
  const st = document.createElement('style'); st.id = 'jv-css';
  st.textContent = '.jv{margin-top:14px;background:#F5F3FF;border:1px solid #DDD6FE;border-radius:14px;padding:12px;}.jv-h{font-size:12px;font-weight:800;color:#4C1D95;margin:0 0 8px;display:flex;justify-content:space-between;}.jv-h span{font-weight:700;color:#7C3AED;opacity:.7;}'
    + '.jv-row{display:flex;gap:8px;align-items:stretch;}.jv-row textarea{flex:1;min-width:0;border:1.5px solid #DDD6FE;border-radius:11px;padding:9px 10px;font-size:14px;font-family:inherit;color:#1E1B4B;background:#fff;resize:vertical;outline:none;}'
    + '.jv-mic{width:48px;flex-shrink:0;border:none;border-radius:11px;background:#7C3AED;color:#fff;font-size:20px;cursor:pointer;}.jv-mic.on{background:#DC2626;animation:jvp 1s ease-in-out infinite;}@keyframes jvp{50%{opacity:.6;}}@media (prefers-reduced-motion:reduce){.jv-mic.on{animation:none;}}'
    + '.jv-go{margin-top:8px;width:100%;padding:9px;border:1.5px solid #C4B5FD;border-radius:11px;background:#fff;color:#5B21B6;font-weight:800;font-size:12.5px;cursor:pointer;font-family:inherit;}'
    + '.jv-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}.jv-chips span{background:#EDE9FE;color:#4C1D95;border-radius:20px;padding:4px 10px;font-size:12px;font-weight:700;}'
    + '.jv-note{font-size:12.5px;color:#312E81;margin:6px 0 0;line-height:1.4;}.jv-n{font-size:11px;color:#6D28D9;opacity:.8;margin:5px 0 0;}';
  document.head.appendChild(st);
}
