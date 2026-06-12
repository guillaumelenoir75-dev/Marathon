async function openMemosModal(){
  const memos = await _loadMemos(); // Cache local ou Firebase
  _renderMemosModal(memos);
}

function _renderMemosModal(memosRaw) {
  const lines = _parseMemos(memosRaw);
  const mc = document.getElementById('modal-container');
  // Supprimer modal existante si besoin
  const existing = mc.querySelector('.modal-overlay');
  if(existing) existing.remove();

  let linesHtml = '';
  if(lines.length === 0) {
    linesHtml = '<p style="font-size:13px;color:var(--muted);text-align:center;padding:20px 0;">Aucun mémo enregistré.</p>';
  } else {
    lines.forEach(function(line, i) {
      const text = line.replace(/^[-•]\s*/, '');
      linesHtml += '<div id="memo-line-'+i+'" style="display:flex;align-items:flex-start;gap:8px;padding:10px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;margin-bottom:6px;">'
        +'<span style="font-size:13px;color:var(--text);flex:1;line-height:1.5;">'+text+'</span>'
        +'<div style="display:flex;gap:4px;flex-shrink:0;">'
        +'<button onclick="editMemoLine('+i+')" style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:11px;color:var(--muted);cursor:pointer;">✏️</button>'
        +'<button onclick="deleteMemoLine('+i+')" style="background:none;border:1px solid #ef4444;border-radius:6px;padding:4px 8px;font-size:11px;color:#ef4444;cursor:pointer;">🗑</button>'
        +'</div></div>';
    });
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = '<div class="modal-box" style="max-height:85vh;overflow-y:auto;">'
    +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">'
    +'<p style="font-size:16px;font-weight:700;color:var(--text);">📋 Mes mémos coach</p>'
    +'<button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:24px;line-height:1;">×</button>'
    +'</div>'
    +'<p style="font-size:12px;color:var(--muted);margin-bottom:12px;">'+lines.length+' mémo'+(lines.length>1?'s':'')+' — ce que le coach retient sur toi.</p>'
    +linesHtml
    +'<div style="display:flex;gap:8px;margin-top:14px;">'
    +'<button onclick="closeModal()" style="flex:1;padding:11px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;color:var(--muted);cursor:pointer;">Fermer</button>'
    +(lines.length>0?'<button onclick="clearAllMemos()" style="padding:11px 14px;background:transparent;border:1px solid #ef4444;border-radius:var(--radius-sm);font-size:13px;color:#ef4444;cursor:pointer;">🗑 Tout</button>':'')
    +'</div></div>';
  overlay.onclick = function(e){ if(e.target===overlay) closeModal(); };
  _lockBodyScroll();
  mc.appendChild(overlay);
}

function deleteMemoLine(idx) {
  const lines = _parseMemos(_currentMemos);
  lines.splice(idx, 1);
  const newMemos = lines.join('\n');
  _setMemos(newMemos);
  _renderMemosModal(newMemos); // Rafraîchir la modal
}

function editMemoLine(idx) {
  const lines = _parseMemos(_currentMemos);
  const current = lines[idx].replace(/^[-•]\s*/, '');
  const el = document.getElementById('memo-line-'+idx);
  if(!el) return;
  el.innerHTML = '<input id="memo-edit-'+idx+'" type="text" value="'+current.replace(/"/g,'&quot;')+'"'
    +' style="flex:1;background:var(--bg);border:1px solid #1B4FD8;border-radius:6px;padding:6px 8px;font-size:13px;color:var(--text);outline:none;">'
    +'<div style="display:flex;gap:4px;flex-shrink:0;">'
    +'<button onclick="saveMemoLine('+idx+')" style="background:#1B4FD8;border:none;border-radius:6px;padding:4px 10px;font-size:11px;color:#fff;cursor:pointer;">✓</button>'
    +'<button onclick="_renderMemosModal(_currentMemos)" style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:11px;color:var(--muted);cursor:pointer;">✕</button>'
    +'</div>';
  el.style.display = 'flex';
  document.getElementById('memo-edit-'+idx).focus();
}

function saveMemoLine(idx) {
  const input = document.getElementById('memo-edit-'+idx);
  if(!input) return;
  const val = input.value.trim();
  const lines = _parseMemos(_currentMemos);
  if(val) lines[idx] = '- ' + val;
  else lines.splice(idx, 1);
  const newMemos = lines.join('\n');
  _setMemos(newMemos);
  _renderMemosModal(newMemos);
}



function clearAllMemos(){
  if(!confirm('Supprimer tous les mémos ?')) return;
  _setMemos('');
  closeModal();
  addCoachMessage('coach', 'Tous les mémos ont été supprimés.');
}

function updateCoachHeader(){
  const el=document.getElementById('coach-header-status');if(!el)return;
  const now=new Date(),h=now.getHours();
  const gr=h<12?'Bonjour':h<19?'Bon après-midi':'Bonsoir';
  const ef=getBestEfPace(),am=getMarathonPaceStr();
  const dj=Math.round((new Date('2026-10-18')-now)/(1000*60*60*24));
  const pct=Math.round(calcTotalDone()/getGrandTotal()*100);
  const msgs=[gr+' Guillaume — S'+CW+' · J-'+dj+' avant le marathon',
    'Allure EF : '+(ef||'---')+'/km · Objectif : '+(am||'---')+'/km',
    pct+'% du plan accompli · S'+CW+' en cours',
    gr+' Guillaume — je suis là pour toi'];
  el.textContent=msgs[Math.floor(now.getMinutes()/15)%msgs.length];
}

function animateMemoBtn(){
  const btn=document.getElementById('memo-btn');if(!btn)return;
  const orig=btn.innerHTML;
  btn.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Mémorisé !';
  btn.style.background='rgba(34,197,94,0.1)';btn.style.borderColor='rgba(34,197,94,0.4)';btn.style.color='#16a34a';
  setTimeout(()=>{btn.innerHTML=orig;btn.style.background='';btn.style.borderColor='';btn.style.color='';},2000);
}

function isAtBottom(el){return el.scrollHeight-el.scrollTop-el.clientHeight<80;}
function smartScroll(el){if(isAtBottom(el))el.scrollTo({top:el.scrollHeight,behavior:'smooth'});}

// ── Mémos : helpers ────────────────────────────────────────────────────────
function _setMemos(val) {
  _currentMemos = (val || '').trim();
  if(dbRef) dbRef.child('_coach_memos').set(_currentMemos);
}

async function _loadMemos() {
  if(_currentMemos !== null) return _currentMemos;
  try { const ms = await dbRef.child('_coach_memos').once('value'); _currentMemos = ms.val()||''; }
  catch(e) { _currentMemos = ''; }
  return _currentMemos;
}

function _parseMemos(raw) {
  return (raw||'').split('\n').map(l=>l.trim()).filter(l=>l.length>0 && l!=='Aucun mémo enregistré.');
}

async function memorizeCoachNote(){
  const input = document.getElementById('coach-input');
  const note = input.value.trim();
  if(!note) {
    addCoachMessage('coach', 'Écris ta remarque dans le champ de texte, puis clique sur Mémoriser.');
    return;
  }
  input.value = '';
  input.style.height = 'auto';

  const btn = document.getElementById('memo-btn');
  btn.style.opacity = '0.5';
  btn.style.pointerEvents = 'none';

  // Afficher la remarque côté utilisateur
  addCoachMessage('user', '📌 ' + note);

  // Charger les mémos existants (cache local en priorité)
  const existingMemos = await _loadMemos();

  // Appel IA pour reformuler et intégrer la note
  try {
    const response = await fetch('https://us-central1-prepa-marathon.cloudfunctions.net/addMemo', {
      method: 'POST',
      headers: await authHeaders(false),
      body: JSON.stringify({ note, existingMemos })
    });
    const data = await response.json();
    if(data.memos){
      _setMemos(data.memos); // Sauvegarde Firebase + cache local immédiat
      animateMemoBtn();
      addCoachMessage('coach', "Mémorisé ✅ Je m'en souviendrai dans toutes nos prochaines conversations.");
    } else {
      addCoachMessage('coach', 'Erreur lors de la mémorisation. Réessaie.');
    }
  } catch(e) {
    addCoachMessage('coach', 'Erreur lors de la mémorisation. Réessaie.');
  }

  btn.style.opacity = '1';
  btn.style.pointerEvents = 'auto';
}
