function checkForPlanProposal(text, bubble){
  if(!bubble) return;
  _lastCoachProposalText = text;

  // ── STRATÉGIE : 2 cas distincts ──────────────────────────────────────────
  // CAS 1 : CONFIRMATION — le coach confirme qu'il a déjà appliqué la modif
  //         → bouton vert "✅ Confirmer dans le plan"
  // CAS 2 : PROPOSITION — le coach propose une modification
  //         → bouton bleu "✏️ Modifier le plan"

  // Contexte : est-ce que l'utilisateur venait de demander une modification ?
  const userMsg = (_lastUserMessageBeforeProposal || '').toLowerCase();
  const userAskedModif = /modif|change|décal|déplac|planifi|horaire|heure|à \d{1,2}h|passer à|mettre à|déplacer|décaler/i.test(userMsg);
  const userAskedSchedule = /quand|heure|jour|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|planifi|à \d{1,2}h/i.test(userMsg);

  // ── CAS 1 : CONFIRMATION ─────────────────────────────────────────────────
  const confirmPatterns = [
    // Formulations directes du coach (sujet = je)
    /je (te )?(planifie|note|programme|bloque|déplace|décale|modifie|change|fixe)/i,
    /c[''`]est (noté|planifié|programmé|dans le plan|enregistré|fait|calé|modifié)/i,
    /je (l[''`]ai|l\u2019ai) (noté|planifié|programmé|enregistré|déplacé|décalé|modifié|calé)/i,
    /(noté|planifié|calé|modifié|enregistré) dans ton plan/i,
    /^[\s\S]{0,15}(modifié|déplacé|décalé)\s*:/im,
    /\d{1,2}h\d{2}\s*\(au lieu de/i,
    // Si contexte de modification + coach confirme avec une heure
    ...(userAskedModif ? [
      /est (déjà )?(programmée?|planifiée?|calée?|fixée?|notée?) (à|le|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/i,
      /est calée? .* à \d{1,2}h/i,
      /(programmée?|calée?|fixée?|planifiée?) (lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/i,
      /\d{1,2}h\d{2}( depuis ta demande| comme demandé| comme prévu| suite à| tel que demandé)/i,
      /^déjà fait/im,
      /c[''`]est (déjà )?fait/i,
      /déjà (été )?(planifié|programmé|modifié|calé|noté)/i,
    ] : []),
  ];

  if(confirmPatterns.some(p => p.test(text))) {
    _lastCoachProposalText = text;
    const btn = document.createElement('div');
    btn.style.cssText = 'margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;';
    btn.innerHTML = '<button onclick="openPlanModifModal()" style="background:#3B6D11;color:#fff;border:none;border-radius:20px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">✅ Confirmer dans le plan</button>'
      + '<button onclick="this.parentElement.remove()" style="background:var(--bg2);color:var(--muted);border:1px solid var(--border);border-radius:20px;padding:6px 12px;font-size:12px;cursor:pointer;">Ignorer</button>';
    bubble.appendChild(btn);
    return;
  }

  // ── CAS 2 : PROPOSITION ──────────────────────────────────────────────────
  const seance = '(tempo|séance|ef|ef long|long|sortie|entraînement|run|course|renfo|récup|récupération)';
  const proposalPatterns = [
    // Je propose / je suggère (avec mots intercalaires)
    new RegExp('je (te )?(suggère|propose)([\s\w]{0,30})\s+de (réduire|passer|supprimer|remplacer|décaler|déplacer|changer|annuler|raccourcir|allonger|transformer|convertir|couper|sauter|faire|ajouter|mettre)', 'i'),
    new RegExp('je (te )?(suggère|propose) (une modification|un changement|quand même|tout de même|néanmoins)', 'i'),
    new RegExp('je (te )?(suggère|propose) (qu\'on|que tu) (modifies?|changes?|remplaces?|supprimes?|annules?|décales?|passes?|réduises?|sautes?)', 'i'),
    // Impératifs directs
    new RegExp('(passe|transforme|convertis) (ta|cette|la|ton|ce|les) ' + seance + ' en', 'i'),
    new RegExp('(réduis|diminue|raccourcis|coupe|baisse) (ta|cette|la|ton|les) ' + seance, 'i'),
    new RegExp('(supprime|annule|saute|enlève|retire|vire) (ta|cette|la|ton|ce|les) ' + seance, 'i'),
    new RegExp('(décale|déplace|reporte|avance|repousse|mets|change) (ta|cette|la|ton|ce|les) ' + seance, 'i'),
    new RegExp('(allonge|augmente|étends|rallonge) (ta|cette|la|ton|ce|les) ' + seance, 'i'),
    // Changement heure direct
    /je (te )?(mets|programme|fixe|planifie) (ta|cette|la|ton|ce) .{0,30} à \d{1,2}h/i,
    /(passe|mets|décale|déplace) (ta|cette|la|ton) .{0,30} à \d{1,2}h/i,
    // Au lieu de / plutôt que
    new RegExp('(au lieu de|plutôt que de|à la place de) (faire|ta|ton|cette|les|la) ' + seance, 'i'),
    /[0-9]+\s*[×x]\s*[0-9]+\s*(min|km)\s*(au lieu|plutôt|à la place)/i,
    /[0-9]+\s*km (au lieu de|plutôt que) [0-9]+/i,
    // Recommandations
    /je (te )?(recommande|conseille) de (modifier|changer|réduire|supprimer|décaler|remplacer|sauter|passer|annuler)/i,
    /modifie (ta|ton|cette|la|le|les) (séance|semaine|tempo|ef|long|plan|programme)/i,
    /change (ta|ton|cette|la|le|les) (séance|tempo|ef|long|programme|plan)/i,
  ];

  if(!proposalPatterns.some(p => p.test(text))) return;

  const btn2 = document.createElement('div');
  btn2.style.cssText = 'margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;';
  btn2.innerHTML = '<button onclick="openPlanModifModal()" style="background:#1B4FD8;color:#fff;border:none;border-radius:20px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">✏️ Modifier le plan</button>'
    + '<button onclick="this.parentElement.remove()" style="background:var(--bg2);color:var(--muted);border:1px solid var(--border);border-radius:20px;padding:6px 12px;font-size:12px;cursor:pointer;">Ignorer</button>';
  bubble.appendChild(btn2);
}


function openPlanModifModal(){
  const mc = document.getElementById('modal-container');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const joursAbr = ['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

  // Détecter la semaine cible depuis les textes récents
  let targetWS = CW;
  const searchTxt = (_lastCoachProposalText||'')+' '+(_lastUserMessageBeforeProposal||'');
  const wsMatch = searchTxt.match(/[Ss](?:emaine\s*|\s*)(\d{1,2})/);
  if(wsMatch){ const ws=parseInt(wsMatch[1]); if(ws>=CW&&ws<=32) targetWS=ws; }

  // Contexte global : l'utilisateur voulait-il modifier une séance spécifique ?
  const userAskedModifGlobal = /modif|change|décal|déplac|planifi|horaire|heure|à \d{1,2}h/i
    .test((_lastUserMessageBeforeProposal||'').toLowerCase());

  let sessionsHtml = '';
  const sessionsForWS = targetWS===CW
    ? getOrderedWeekSessions(CW).filter(({extra})=>!extra).map(({s,si})=>({s,si,ws:CW}))
    : weeks[targetWS-1].sessions.map((s,si)=>({s,si,ws:targetWS}));

  // Si un type est ciblé, ne montrer que les séances de ce type
  const searchForDisplay = ((_lastUserMessageBeforeProposal||'').toLowerCase()+' '+(_lastCoachProposalText||'').toLowerCase());
  const typeKWDisplay = {ef:[/\bef\b/i,/seance ef/i], tempo:[/\btempo\b/i], frac:[/\bfrac\b/i,/fractionn[eé]/i], long:[/longue/i]};
  let targetTypeDisplay = null;
  for(const [t,keys] of Object.entries(typeKWDisplay)){if(keys.some(k=>k.test(searchForDisplay))){targetTypeDisplay=t;break;}}

  sessionsForWS.forEach(({s,si,ws})=>{
    const done = ws===CW ? !!state[gk(ws,si)+'done'] : false;
    // Ne pas sauter les séances done si l'utilisateur demande explicitement une modif
    // (ex: changer l'heure d'une séance déjà faite cette semaine)
    if(done && !userAskedModifGlobal) return;
    if(targetTypeDisplay && s.type !== targetTypeDisplay) return;
    const titre = s.d.split('|')[0];
    const ed = state['edit_w'+ws+'_s'+si]?JSON.parse(state['edit_w'+ws+'_s'+si]):null;
    const jourActuelSess = ed&&ed.sched_day?joursAbr[ed.sched_day]:'';
    const heureActuelSess = ed&&ed.sched_time?ed.sched_time:'';
    const schedStr = [jourActuelSess, heureActuelSess].filter(Boolean).join(' ');
    const c = typeColor[s.type]||'#888';
    // Détecter si cette séance est la cible de la modification
    const searchForTarget = ((_lastUserMessageBeforeProposal||'').toLowerCase()+' '+(_lastCoachProposalText||'').toLowerCase());
    const typeKW = {ef:['\bef\b','endurance fondamentale','séance ef'], tempo:['\btempo\b'], frac:['\bfrac\b','fractionn'], long:['longue','sortie longue'], rest:['\brepos\b'], race:['\bcourse\b']};
    let targetType = null;
    for(const [t,keys] of Object.entries(typeKW)){
      if(keys.some(k=>new RegExp(k,'i').test(searchForTarget))){ targetType=t; break; }
    }
    const isTargeted = !targetType || s.type === targetType;
    const proposed = isTargeted ? extractSuggestionsFromCoach(si, s, ed) : {};
    const propJour = (isTargeted && proposed.day) ? joursAbr[proposed.day] : '';
    const propTime = (isTargeted && proposed.time) ? proposed.time : '';
    const propSchedule = [propJour, propTime].filter(Boolean).join(' ');
    const propKm = (isTargeted && proposed.km && proposed.km !== s.km) ? proposed.km+'km' : '';
    const hasChange = isTargeted && (propSchedule !== schedStr || propKm);
    const doneLabel = done ? ' <span style="font-size:10px;color:#22c55e;font-weight:600;">✓ faite</span>' : '';
    sessionsHtml += '<div style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer;'+(done?'opacity:0.75;':'')
      +'" onclick="selectSessionToModif('+si+',this,'+ws+')" id="modif-sess-'+si+'">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;">'
      +'<span style="font-size:13px;font-weight:600;color:var(--text);">'+titre+doneLabel+'</span>'
      +'<span style="font-size:11px;color:var(--muted);">'+s.km+'km'+(schedStr?' · '+schedStr:'')+'</span>'
      +'</div>'
      +(hasChange?'<div style="display:flex;justify-content:flex-end;margin-top:4px;">'
        +'<span style="font-size:12px;color:#3B6D11;font-weight:700;">→ '+(propKm||s.km+'km')+' · '+propSchedule+'</span>'
        +'</div>':'')
      +'</div>';
  });
  // Si aucune séance dans la liste (toutes done + pas de type match), fallback sur toutes les séances
  if(!sessionsHtml) {
    sessionsForWS.forEach(({s,si,ws})=>{
      const titre = s.d.split('|')[0];
      const ed2 = state['edit_w'+ws+'_s'+si]?JSON.parse(state['edit_w'+ws+'_s'+si]):null;
      const jour2 = ed2&&ed2.sched_day?joursAbr[ed2.sched_day]:'';
      const heure2 = ed2&&ed2.sched_time?ed2.sched_time:'';
      const sched2 = [jour2,heure2].filter(Boolean).join(' ');
      const done2 = ws===CW ? !!state[gk(ws,si)+'done'] : false;
      const doneL2 = done2 ? ' <span style="font-size:10px;color:#22c55e;font-weight:600;">✓ faite</span>' : '';
      sessionsHtml += '<div style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer;'+(done2?'opacity:0.75;':'')+'"'
        +' onclick="selectSessionToModif('+si+',this,'+ws+')" id="modif-sess-'+si+'">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;">'
        +'<span style="font-size:13px;font-weight:600;color:var(--text);">'+titre+doneL2+'</span>'
        +'<span style="font-size:11px;color:var(--muted);">'+s.km+'km'+(sched2?' · '+sched2:'')+'</span>'
        +'</div></div>';
    });
  }

  overlay.innerHTML = '<div class="modal-box" style="max-height:90vh;overflow-y:auto;">'
    +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
    +'<p style="font-size:16px;font-weight:700;color:var(--text);">✏️ Modifier le plan S'+targetWS+'</p>'
    +'<button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:24px;line-height:1;">×</button>'
    +'</div>'
    +'<p style="font-size:12px;color:var(--muted);margin-bottom:12px;">Sélectionne la séance à modifier :</p>'
    +sessionsHtml
    +'<div id="modif-form" style="display:none;margin-top:12px;"></div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px;">'
    +'<button onclick="closeModal()" style="padding:11px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;color:var(--muted);cursor:pointer;">Annuler</button>'
    +'<button onclick="applyPlanModif()" style="padding:11px;background:#1B4FD8;border:none;border-radius:var(--radius-sm);font-size:13px;font-weight:600;color:#fff;cursor:pointer;">Appliquer</button>'
    +'</div></div>';
  overlay.onclick=e=>{if(e.target===overlay)closeModal();};
  _lockBodyScroll();
  mc.appendChild(overlay);

  _targetModifWS = targetWS;
  // Auto-sélectionner en arrière-plan (sans ouvrir le formulaire)
  // mais pré-remplir _selectedModifSi et extraire les suggestions du coach
  const availableSessions = [];
  sessionsForWS.forEach(({s,si,ws:wsItem})=>{
    const isDone = wsItem===CW ? !!state[gk(wsItem,si)+'done'] : false;
    if(!isDone || userAskedModifGlobal) availableSessions.push({si,ws:wsItem,type:s.type,done:isDone});
  });
  const searchAuto = ((_lastUserMessageBeforeProposal||'').toLowerCase()+' '+(_lastCoachProposalText||'').toLowerCase());
  const typeAutoMap = {ef:[/\bef\b/i,/seance ef/i], tempo:[/\btempo\b/i], frac:[/\bfrac\b/i,/fractionn[eé]/i], long:[/longue/i]};
  let targetTypeAuto = null;
  for(const [t,keys] of Object.entries(typeAutoMap)){ if(keys.some(k=>k.test(searchAuto))){ targetTypeAuto=t; break; } }
  // Priorité au type détecté dans l'écran (targetTypeDisplay) sur le type auto
  const typeForAuto = targetTypeDisplay || targetTypeAuto;
  const filteredSess = typeForAuto ? availableSessions.filter(x=>x.type===typeForAuto) : availableSessions;
  const filteredWithDone = typeForAuto ? availableSessions.filter(x=>x.type===typeForAuto) : availableSessions;
  const autoSess = filteredWithDone.length>0 ? filteredWithDone : (filteredSess.length>0 ? filteredSess : availableSessions);

  if(autoSess.length === 1){
    _selectedModifSi = autoSess[0].si;
    _targetModifWS = autoSess[0].ws || targetWS;
    // Pré-remplir les valeurs suggérées silencieusement
    setTimeout(()=>{
      const autoEl = document.getElementById('modif-sess-'+autoSess[0].si);
      if(autoEl){
        autoEl.style.background='var(--bg2)';
        autoEl.style.borderColor='#1B4FD8';
      }
      // Pré-remplir le formulaire mais le garder caché
      // Les valeurs sont extraites et stockées pour Appliquer
      const autoItem = autoSess[0];
      const autoWS = autoItem.ws || targetWS;
      const s = getSession(autoWS, autoItem.si);
      const edRaw = state['edit_w'+autoWS+'_s'+autoItem.si];
      const ed = edRaw ? JSON.parse(edRaw) : null;
      _prefilledModif = extractSuggestionsFromCoach(autoItem.si, s, ed);
    }, 50);
  }
}

let _selectedModifSi = null;
let _prefilledModif = null;
let _targetModifWS = null;

function extractSuggestionsFromCoach(si, s, ed){
  const txt = _lastCoachProposalText || '';
  const txtL = txt.toLowerCase();
  let day = ed&&ed.sched_day ? ed.sched_day : null;
  let time = ed&&ed.sched_time ? ed.sched_time : '';

  // Heure - chercher D'ABORD dans le message de l'utilisateur (plus fiable)
  const userTxt = _lastUserMessageBeforeProposal || '';
  const tryExtractTime = (source) => {
    const matches = [...source.matchAll(/\b(\d{1,2})h(\d{2})?\b/gi),
                     ...source.matchAll(/\b(\d{1,2}):(\d{2})\b/g)]
      .sort((a,b)=>a.index-b.index);
    if(matches.length>0){
      const last=matches[matches.length-1];
      return last[1].padStart(2,'0')+':'+(last[2]||'00').padStart(2,'0');
    }
    return null;
  };
  const userTime = tryExtractTime(userTxt);
  const coachTime = tryExtractTime(txt);
  if(userTime) time = userTime;
  else if(coachTime) time = coachTime;

  // Jour - chercher D'ABORD dans le message utilisateur (plus fiable)
  const joursNames=['','lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
  const tryExtractDay = (source) => {
    const srcL = source.toLowerCase();
    let lastIdx=-1, lastPos=-1;
    for(let d=1;d<=7;d++){
      const pos=srcL.lastIndexOf(joursNames[d]);
      if(pos>lastPos){lastPos=pos;lastIdx=d;}
    }
    if(lastIdx>0) return lastIdx;
    if(srcL.includes('demain')){
      const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
      return tomorrow.getDay()===0?7:tomorrow.getDay();
    }
    return null;
  };
  const userDay = tryExtractDay(userTxt);
  const coachDay = tryExtractDay(txt);
  if(userDay) day=userDay;
  else if(coachDay) day=coachDay;

  // KM - préférer le km cible ('à X km', 'passer à X km') plutôt que le km actuel
  const kmNums=[...txt.matchAll(/\b(\d+(?:\.\d+)?)\s*km\b/gi)]
    .filter(m=>{
      const before=txt.substring(Math.max(0,m.index-25),m.index).toLowerCase();
      const after=txt.substring(m.index+m[0].length,m.index+m[0].length+5).toLowerCase();
      if(after.startsWith('/h')||after.startsWith('h')) return false;
      if(/heures?|recup|repos/.test(before)) return false;
      return true;
    })
    .map(m=>({val:parseFloat(m[1]),idx:m.index,before:txt.substring(Math.max(0,m.index-10),m.index).toLowerCase()}))
    .filter(m=>m.val>=3&&m.val<=50);
  // Préférer km précédé de 'à/a', 'passer à', 'réduire à', 'de' (= km cible)
  // Exclure ceux précédés de 'au lieu de' (= km actuel à remplacer)
  const kmExcludeAuLieu = kmNums.filter(m=>!/lieu de\s*$/.test(m.before));
  const targetKm = kmExcludeAuLieu.find(m=>/\b(à|a|de|jusqu.à)\s*$/.test(m.before)) || kmExcludeAuLieu[0];
  const km = targetKm ? targetKm.val : kmNums.length>0 ? kmNums[0].val : (ed?ed.km:s.km);

  // Type
  let type = s.type;
  if(/\bef\b|endurance fondamentale/i.test(txt)) type='ef';
  else if(/fractionn[eé]|\bfrac\b|intervalles?/i.test(txt)) type='frac';
  else if(/\btempo\b/i.test(txt)) type='tempo';
  else if(/sortie longue/i.test(txt)) type='long';
  else if(/\brepos\b|récupération complète/i.test(txt)) type='rest';

  // Blocs/répétitions - prendre le PREMIER (= nouvelle valeur cible)
  let reps = null, dur = null;
  const blocsMatches = [...[...txt.matchAll(/(\d+)\s*[×x]\s*(\d+)\s*min/gi)]].sort((a,b)=>a.index-b.index);
  if(blocsMatches.length>0){
    // Si 'au lieu de' présent, prendre avant; sinon prendre le premier
    const auLieuIdx = txt.toLowerCase().indexOf('au lieu de');
    const targetBloc = auLieuIdx>0 ? blocsMatches.find(m=>m.index<auLieuIdx) || blocsMatches[0] : blocsMatches[0];
    reps=parseInt(targetBloc[1]);dur=parseInt(targetBloc[2]);
  }

  // Allures
  let paceMin = null, paceMax = null;
  const paceMatches=[...txt.matchAll(/\b(\d)['':]?(\d{2})(?:\s*\/km)?\b/g)]
    .filter(m=>{const s2=parseInt(m[1])*60+parseInt(m[2]);return s2>=240&&s2<=480;})
    .sort((a,b)=>a.index-b.index);
  const fastPaces=paceMatches.filter(m=>parseInt(m[1])*60+parseInt(m[2])<330);
  if(fastPaces.length>=2){paceMin=fastPaces[0][1]+':'+fastPaces[0][2];paceMax=fastPaces[fastPaces.length-1][1]+':'+fastPaces[fastPaces.length-1][2];}
  else if(fastPaces.length===1){paceMin=fastPaces[0][1]+':'+fastPaces[0][2];}
  else if(paceMatches.length>=2){const l2=paceMatches.slice(-2);paceMin=l2[0][1]+':'+l2[0][2];paceMax=l2[1][1]+':'+l2[1][2];}
  else if(paceMatches.length===1){paceMin=paceMatches[0][1]+':'+paceMatches[0][2];}

  // Récupération
  let recup = null;
  const recupMatches=[...[...txt.matchAll(/(\d+(?:[:']\d+)?)\s*min(?:utes?)?\s*(?:de\s*)?r[eé]cup/gi)],
    ...[...txt.matchAll(/r[eé]cup[a-z]*\s*(?:de\s*)?(\d+(?:[:']\d+)?)\s*min/gi)]].sort((a,b)=>a.index-b.index);
  if(recupMatches.length>0) recup=recupMatches[recupMatches.length-1][1];

  return {km, type, day, time, reps, dur, paceMin, paceMax, recup};
}
function selectSessionToModif(si, el, ws){
  const resolvedWS = ws || _targetModifWS || CW;
  _targetModifWS = resolvedWS;
  _selectedModifSi = si;
  document.querySelectorAll('[id^="modif-sess-"]').forEach(e=>e.style.background='');
  el.style.background='var(--bg2)';
  const s = getSession(resolvedWS, si);
  const ed = state['edit_w'+resolvedWS+'_s'+si]?JSON.parse(state['edit_w'+resolvedWS+'_s'+si]):null;
  const form = document.getElementById('modif-form');
  form.style.display='block';
  const jours = ['','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];

  // Extraire heure et jour depuis le dernier message du coach si disponible
  let suggestedDay = ed&&ed.sched_day ? ed.sched_day : '';
  let suggestedTime = ed&&ed.sched_time ? ed.sched_time : '';
  if(_lastCoachProposalText) {
    // Détecter heure : "12h00", "12h", "12:00", "à 12h", "à 12h00"
    // Extraire TOUS les horaires et prendre le dernier (= nouvel horaire proposé)
    const allTimes = [..._lastCoachProposalText.matchAll(/\b(\d{1,2})h(\d{2})?\b/gi)];
    const allTimes2 = [..._lastCoachProposalText.matchAll(/\b(\d{1,2}):(\d{2})\b/g)];
    const allTimesCombined = [...allTimes, ...allTimes2].sort((a,b)=>a.index-b.index);
    // Chercher D'ABORD dans le message utilisateur (plus fiable)
    const userAllTimes = [...(_lastUserMessageBeforeProposal||'').matchAll(/\b(\d{1,2})h(\d{2})?\b/gi)];
    if(userAllTimes.length > 0) {
      const ul = userAllTimes[userAllTimes.length-1];
      suggestedTime = ul[1].padStart(2,'0')+':'+(ul[2]||'00').padStart(2,'0');
    } else if(allTimesCombined.length > 0) {
      // Prendre le dernier horaire du coach = nouvelle heure suggérée
      const last = allTimesCombined[allTimesCombined.length-1];
      const h = last[1].padStart(2,'0');
      const m = (last[2]||'00').padStart(2,'0');
      suggestedTime = h+':'+m;
    }
    // Détecter jour : "lundi", "mardi", etc.
    const joursNames = ['','lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
    const textLower = _lastCoachProposalText.toLowerCase();
    // Prendre le DERNIER jour mentionné (= jour suggéré, pas le jour actuel)
    let lastDayPos = -1;
    for(let d=1; d<=7; d++){
      const pos = textLower.lastIndexOf(joursNames[d]);
      if(pos > lastDayPos){ lastDayPos=pos; suggestedDay=d; }
    }
    // Aussi vérifier le message utilisateur en priorité
    const userTxtLower = (_lastUserMessageBeforeProposal||'').toLowerCase();
    let userDayFound = 0;
    for(let d=1; d<=7; d++){
      if(userTxtLower.includes(joursNames[d])){ userDayFound=d; }
    }
    if(userDayFound) suggestedDay = userDayFound;
    // Détecter "demain"
    if(textLower.includes('demain') && !suggestedDay){
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
      suggestedDay = tomorrow.getDay()===0?7:tomorrow.getDay();
    }
  }
  const currentDay = suggestedDay;
  const currentTime = suggestedTime;
  const jourOptions = ['<option value="">— Jour —</option>']
    .concat([1,2,3,4,5,6,7].map(d=>'<option value="'+d+'"'+(currentDay===d?' selected':'')+'>'+jours[d]+'</option>')).join('');

  // ── Extraire toutes les infos depuis le texte du coach ──────────────────────
  const txt = _lastCoachProposalText || '';
  const txtL = txt.toLowerCase();

  // KM suggéré : "9 km", "10km", "réduire à 8km"
  let suggestedKm = ed?ed.km:s.km;
  const kmMatches = [...txt.matchAll(/\b(\d+(?:\.\d+)?)\s*km\b/gi)]
    .filter(m=>{ const a=txt.substring(m.index+m[0].length,m.index+m[0].length+4).toLowerCase(); return !a.startsWith('/h')&&!a.startsWith('h'); })
    .map(m=>({val:parseFloat(m[1]),before:txt.substring(Math.max(0,m.index-10),m.index).toLowerCase()}))
    .filter(m=>m.val>=3&&m.val<=50);
  if(kmMatches.length>0){
    const targetKm2 = kmMatches.find(m=>/\b(à|de|jusqu\'à)\s*$/.test(m.before));
    suggestedKm = targetKm2 ? targetKm2.val : kmMatches[0].val;
  }

  // Type suggéré
  let suggestedType = s.type;
  if(/\bef\b|endurance fondamentale|récup/i.test(txt)) suggestedType='ef';
  else if(/fractionn[eé]|\bfrac\b|intervalles?/i.test(txt)) suggestedType='frac';
  else if(/\btempo\b/i.test(txt)) suggestedType='tempo';
  else if(/\blong\b|sortie longue/i.test(txt)) suggestedType='long';
  else if(/\brepos\b|\brest\b|récupération complète/i.test(txt)) suggestedType='rest';

  // Blocs/répétitions : prendre le DERNIER match = nouvelle valeur suggérée
  let suggestedReps = null, suggestedDur = null;
  const allBlocsMatches = [
    ...[...txt.matchAll(/(\d+)\s*[×x]\s*(\d+)\s*min/gi)],
    ...[...txt.matchAll(/(\d+)\s*blocs?\s*de\s*(\d+)\s*min/gi)],
  ].sort((a,b)=>a.index-b.index);
  if(allBlocsMatches.length>0){
    // Prendre le premier bloc avant 'au lieu de' = valeur cible
    const auLieuIdx2 = txt.toLowerCase().indexOf('au lieu de');
    const targetBloc2 = auLieuIdx2>0 ? allBlocsMatches.find(m=>m.index<auLieuIdx2)||allBlocsMatches[0] : allBlocsMatches[0];
    suggestedReps = parseInt(targetBloc2[1]);
    suggestedDur = parseInt(targetBloc2[2]);
  }

  // Allure tempo : prendre les DERNIÈRES allures mentionnées = valeurs suggérées
  // Exclure les allures EF (>5'50) sauf si c'est une séance EF
  let suggestedPaceMin = null, suggestedPaceMax = null;
  const allPaceMatches = [...txt.matchAll(/\b(\d)['':]?(\d{2})(?:\s*\/km|\s*min\/km)?\b/g)]
    .filter(m => {
      const sec = parseInt(m[1])*60 + parseInt(m[2]);
      return sec >= 240 && sec <= 480; // entre 4'00 et 8'00/km
    })
    .sort((a,b)=>a.index-b.index);
  if(allPaceMatches.length >= 2){
    // Si la séance est EF : prendre toutes les allures
    // Si Tempo : ignorer les allures lentes (>5'30) qui sont l'allure actuelle
    const isTempoContext = /\btempo\b/i.test(txt);
    if(isTempoContext){
      // Filtrer les allures rapides (<5'30 = <330 sec)
      const fastPaces = allPaceMatches.filter(m => parseInt(m[1])*60+parseInt(m[2]) < 330);
      if(fastPaces.length >= 2){
        suggestedPaceMin = fastPaces[0][1]+':'+fastPaces[0][2];
        suggestedPaceMax = fastPaces[fastPaces.length-1][1]+':'+fastPaces[fastPaces.length-1][2];
      } else if(fastPaces.length === 1){
        suggestedPaceMin = fastPaces[0][1]+':'+fastPaces[0][2];
      } else {
        // Prendre les 2 dernières allures
        const last2 = allPaceMatches.slice(-2);
        suggestedPaceMin = last2[0][1]+':'+last2[0][2];
        suggestedPaceMax = last2[1][1]+':'+last2[1][2];
      }
    } else {
      const last2 = allPaceMatches.slice(-2);
      suggestedPaceMin = last2[0][1]+':'+last2[0][2];
      suggestedPaceMax = last2[1][1]+':'+last2[1][2];
    }
  } else if(allPaceMatches.length === 1){
    suggestedPaceMin = allPaceMatches[0][1]+':'+allPaceMatches[0][2];
  }

  // Récupération : prendre la DERNIÈRE valeur mentionnée = valeur suggérée
  let suggestedRecup = null;
  const allRecupMatches = [
    ...[...txt.matchAll(/(\d+(?:[:']\d+)?)\s*min(?:utes?)?\s*(?:de\s*)?r[eé]cup/gi)],
    ...[...txt.matchAll(/r[eé]cup[a-z]*\s*(?:de\s*)?(\d+(?:[:']\d+)?)\s*min/gi)],
  ].sort((a,b)=>a.index-b.index);
  if(allRecupMatches.length>0) suggestedRecup = allRecupMatches[allRecupMatches.length-1][1];

  // Construire les champs tempo si type tempo et infos détectées
  const showTempoExtra = suggestedType==='tempo' && (suggestedReps||suggestedPaceMin||suggestedRecup);
  let tempoExtraHtml = '';
  if(showTempoExtra){
    const curEd = state['edit_w'+resolvedWS+'_s'+si]?JSON.parse(state['edit_w'+resolvedWS+'_s'+si]):null;
    const curTitle = (curEd?curEd.d:s.d).split('|')[0];
    const curRepsM = curTitle.match(/(\d+)[×x](\d+)/i);
    const repsVal = suggestedReps || (curRepsM?parseInt(curRepsM[1]):2);
    const durVal = suggestedDur || (curRepsM?parseInt(curRepsM[2]):8);
    const pMinVal = suggestedPaceMin || (curEd&&curEd.d.split('|')[1]?curEd.d.split('|')[1].match(/(\d+:\d+)/)?.[0]:'5:00');
    const pMaxVal = suggestedPaceMax || pMinVal;
    const recupVal = suggestedRecup || '3';
    tempoExtraHtml = '<div style="margin-top:8px;background:#EEF2FD;border-radius:6px;padding:8px 10px;">'
      +'<p style="font-size:11px;font-weight:600;color:#1B4FD8;margin-bottom:6px;">⚡ Format tempo</p>'
      +'<div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:6px;margin-bottom:6px;">'
      +'<div><p style="font-size:10px;color:var(--muted);margin-bottom:3px;text-align:center;">Rép.</p>'
      +'<input type="number" id="modif-reps" value="'+repsVal+'" min="1" max="10" style="background:white;border:1px solid var(--border);border-radius:4px;padding:6px;font-size:15px;font-weight:700;color:var(--text);width:100%;outline:none;text-align:center;"></div>'
      +'<span style="color:var(--muted);padding-top:16px;">×</span>'
      +'<div><p style="font-size:10px;color:var(--muted);margin-bottom:3px;text-align:center;">Durée (min)</p>'
      +'<input type="number" id="modif-dur" value="'+durVal+'" min="1" max="60" style="background:white;border:1px solid var(--border);border-radius:4px;padding:6px;font-size:15px;font-weight:700;color:var(--text);width:100%;outline:none;text-align:center;"></div>'
      +'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">'
      +'<div><p style="font-size:10px;color:var(--muted);margin-bottom:3px;">Allure (min:sec)</p>'
      +'<input type="text" id="modif-pace" value="'+pMinVal+'" placeholder="4:55" maxlength="5" style="background:white;border:1px solid var(--border);border-radius:4px;padding:6px;font-size:14px;font-weight:700;color:#1B4FD8;width:100%;outline:none;text-align:center;"></div>'
      +'<div><p style="font-size:10px;color:var(--muted);margin-bottom:3px;">Récup (min)</p>'
      +'<input type="text" id="modif-recup" value="'+recupVal+'" placeholder="3:00" maxlength="5" style="background:white;border:1px solid var(--border);border-radius:4px;padding:6px;font-size:14px;font-weight:700;color:var(--text);width:100%;outline:none;text-align:center;"></div>'
      +'</div></div>';
  }

  form.innerHTML = '<p style="font-size:12px;font-weight:600;color:#1B4FD8;margin-bottom:8px;">Modifier la séance :</p>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
    +'<div><p style="font-size:11px;color:var(--muted);margin-bottom:4px;">KM</p>'
    +'<input type="number" id="modif-km" value="'+suggestedKm+'" min="1" max="50" step="0.5" style="background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:8px;font-size:16px;font-weight:700;color:var(--text);width:100%;outline:none;text-align:center;"></div>'
    +'<div><p style="font-size:11px;color:var(--muted);margin-bottom:4px;">Type</p>'
    +'<select id="modif-type" style="background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:8px;font-size:14px;color:var(--text);width:100%;outline:none;">'
    +['ef','tempo','frac','long','rest','race'].map(t=>'<option value="'+t+'"'+(suggestedType===t?' selected':'')+'>'+typeLabel[t]+'</option>').join('')
    +'</select></div></div>'
    +tempoExtraHtml
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">'
    +'<div><p style="font-size:11px;color:var(--muted);margin-bottom:4px;">Jour</p>'
    +'<select id="modif-day" style="background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:8px;font-size:13px;color:var(--text);width:100%;outline:none;">'+jourOptions+'</select></div>'
    +'<div><p style="font-size:11px;color:var(--muted);margin-bottom:4px;">Heure</p>'
    +'<input type="time" id="modif-time" value="'+currentTime+'" style="background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:8px;font-size:13px;font-weight:600;color:var(--text);width:100%;outline:none;"></div>'
    +'</div>'
    +'<div style="margin-top:8px;"><p style="font-size:11px;color:var(--muted);margin-bottom:4px;">Raison (mémorisée dans les mémos)</p>'
    +'<input type="text" id="modif-reason" placeholder="ex: ajusté selon conseils coach" style="background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:8px;font-size:13px;color:var(--text);width:100%;outline:none;"></div>';
}

async function applyPlanModif(){
  console.log("[ModifDebug] CALLED, si=", _selectedModifSi, "lastText=", (_lastCoachProposalText||"").substring(0,60));
  if(_selectedModifSi===null){ alert("Sélectionne une séance."); return; }

  const formOpen = !!document.getElementById('modif-km');
  const modifWS = _targetModifWS || CW;
  const s0 = getSession(modifWS, _selectedModifSi);
  const ed0Raw = state['edit_w'+modifWS+'_s'+_selectedModifSi];
  const ed0 = ed0Raw ? JSON.parse(ed0Raw) : {...s0};

  let km, type, day, time, reason;
  if(formOpen){
    km = parseFloat(document.getElementById('modif-km').value);
    type = document.getElementById('modif-type').value;
    day = parseInt(document.getElementById('modif-day')?.value)||null;
    time = (document.getElementById('modif-time')?.value||'').trim();
    reason = (document.getElementById('modif-reason').value||'').trim();
  } else {
    // Extraire directement depuis le texte du coach au moment du clic
    const extracted = extractSuggestionsFromCoach(_selectedModifSi, s0, ed0);
    console.log('[ModifDebug] lastCoachText:', (_lastCoachProposalText||'').substring(0,80));
    console.log('[ModifDebug] extracted:', JSON.stringify(extracted));
    km = extracted.km || s0.km;
    type = extracted.type || s0.type;
    day = extracted.day || ed0.sched_day || null;
    time = extracted.time || ed0.sched_time || '';
    reason = '';
  }
  const s = getSession(modifWS, _selectedModifSi);
  const edRaw = state['edit_w'+modifWS+'_s'+_selectedModifSi];
  const ed = edRaw ? JSON.parse(edRaw) : {...s};
  ed.km = km;
  ed.type = type;
  if(day) ed.sched_day = day;
  if(time) ed.sched_time = time;

  // Appliquer les champs tempo
  let extFull = null;
  if(!formOpen && (type==='tempo'||type==='frac')) extFull = extractSuggestionsFromCoach(_selectedModifSi, s0, ed0);
  if(type==='tempo'||type==='frac'){
    const isFracMod = type==='frac';
    let reps, dur, pace, paceMax, recup;
    if(formOpen){
      const repsEl=document.getElementById('modif-reps');
      const durEl=document.getElementById('modif-dur');
      const paceEl=document.getElementById('modif-pace');
      const recupEl=document.getElementById('modif-recup');
      reps=repsEl?parseInt(repsEl.value)||(isFracMod?6:2):(isFracMod?6:2);
      dur=durEl?parseInt(durEl.value)||(isFracMod?2:8):(isFracMod?2:8);
      pace=(paceEl?paceEl.value||'':'').trim();
      paceMax=pace;
      recup=(recupEl?recupEl.value||'':'').trim();
    } else {
      const curTitle=(ed.d||s.d).split('|')[0];
      const curMatch=curTitle.match(/(\d+)[×x](\d+)/i);
      reps = (extFull&&extFull.reps) || (curMatch?parseInt(curMatch[1]):(isFracMod?6:2));
      dur = (extFull&&extFull.dur) || (curMatch?parseInt(curMatch[2]):(isFracMod?2:8));
      pace = (extFull&&extFull.paceMin) || '';
      paceMax = (extFull&&extFull.paceMax) || pace;
      recup = (extFull&&extFull.recup) || '';
    }
    let newTitle=(isFracMod?'Fractionné ':'Tempo ')+reps+'×'+dur+' min';
    let newDetail='';
    if(pace) newDetail=pace+(paceMax&&paceMax!==pace?' — '+paceMax:'')+' /km';
    if(recup&&recup!=='0'&&reps>1) newDetail=newDetail+(newDetail?' · ':'')+recup+' min récup';
    ed.d = newDetail ? newTitle+'|'+newDetail : newTitle;
  } else {
    ed.d = s.d;
  }

  const savedSi = _selectedModifSi;
  console.log('[ModifDebug] SAVING key=edit_w'+modifWS+'_s'+savedSi+' time='+ed.sched_time+' day='+ed.sched_day);
  state['edit_w'+modifWS+'_s'+savedSi] = JSON.stringify(ed);
  save();
  console.log('[ModifDebug] SAVED:', state['edit_w'+modifWS+'_s'+savedSi]);
  rendered.plan=false;
  rendered.stats=false;
  closeModal();
  setTimeout(()=>{
    if(document.getElementById('sc-plan') && document.getElementById('sc-plan').style.display!=='none') renderPlan();
    renderHome();
  }, 50);
  // Mémoriser la raison si fournie
  if(reason && dbRef){
    const memoNote = 'Modification plan S'+modifWS+' séance '+s.d.split('|')[0]+' : '+km+'km ('+type+')'+( reason?' — '+reason:'');
    const ms = await dbRef.child('_coach_memos').once('value');
    const existing = ms.val()||'';
    const today = new Date().toLocaleDateString('fr-FR');
    const updated = existing + (existing?'\n':'') + '- '+memoNote+' ('+today+')';
    dbRef.child('_coach_memos').set(updated);
  }
  addCoachMessage('coach', 'Modification appliquée. La séance a été mise à jour dans ton plan.');
}

// ── MÉMORISER UNE REMARQUE ───────────────────────────────────────────────────
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

function buildCoachChartData(type) {
  const points = [];
  for(let ws=Math.max(1,CW-11); ws<=CW; ws++) {
    weeks[ws-1].sessions.forEach((sess,si) => {
      if(!state[gk(ws,si)+'done']) return;
      const perf = state[gk(ws,si)+'perf'] ? JSON.parse(state[gk(ws,si)+'perf']) : null;
      if(!perf) return;
      if(type==='ef' && (sess.type==='ef'||sess.type==='long') && perf.pace) {
        const sec=paceStrToSec(perf.pace.replace("'",":"));
        if(sec>200&&sec<600) points.push({ws,val:sec,label:'S'+ws});
      } else if(type==='km') {
        const km=state[gk(ws,si)+'km']||sess.km;
        if(km>0) points.push({ws,val:parseFloat(km),label:'S'+ws});
      } else if(type==='fc' && perf.hr && (sess.type==='ef'||sess.type==='long')) {
        points.push({ws,val:parseInt(perf.hr),label:'S'+ws});
      }
    });
  }
  const byWeek={};
  points.forEach(p=>{ if(!byWeek[p.ws]) byWeek[p.ws]={sum:0,count:0}; byWeek[p.ws].sum+=p.val; byWeek[p.ws].count++; });
  return Object.keys(byWeek).sort((a,b)=>+a-+b).map(ws=>({val:byWeek[ws].sum/byWeek[ws].count,label:'S'+ws})).slice(-10);
}

function renderCoachChartSVG(data, type) {
  if(!data||data.length<2) return '';
  const W=320,H=88,PT=8,PB=22,PL=30,PR=8;
  const iW=W-PL-PR, iH=H-PT-PB;
  const vals=data.map(d=>d.val);
  let mn=Math.min(...vals), mx=Math.max(...vals);
  const rng=(mx-mn)||1; mn-=rng*0.12; mx+=rng*0.12;
  const R=mx-mn;
  const px=i=>PL+(i/(data.length-1))*iW;
  const py=v=>PT+iH-((v-mn)/R)*iH;
  const color=type==='ef'?'#1B4FD8':type==='fc'?'#E8530A':'#3B6D11';
  let path='',area='';
  data.forEach((d,i)=>{
    const x=px(i),y=py(d.val);
    if(i===0){path='M'+x+','+y;area='M'+x+','+(PT+iH)+' L'+x+','+y;}
    else{
      const ox=px(i-1),oy=py(data[i-1].val),cp=iW/(data.length-1)*0.45;
      path+=' C'+(ox+cp)+','+oy+' '+(x-cp)+','+y+' '+x+','+y;
      area+=' C'+(ox+cp)+','+oy+' '+(x-cp)+','+y+' '+x+','+y;
    }
  });
  area+=' L'+px(data.length-1)+','+(PT+iH)+' Z';
  const grid=[0,0.5,1].map(t=>{
    const v=mn+R*t,yp=py(v);
    const lbl=type==='ef'?secToPace(Math.round(v)):Math.round(v)+'';
    return '<line x1="'+PL+'" y1="'+yp+'" x2="'+(W-PR)+'" y2="'+yp+'" stroke="#e8e8e8" stroke-width="0.8"/>'+
      '<text x="'+(PL-3)+'" y="'+(yp+3)+'" text-anchor="end" font-size="8" fill="#bbb">'+lbl+'</text>';
  }).join('');
  const dots=data.map((d,i)=>{
    const isL=i===data.length-1;
    return '<circle cx="'+px(i)+'" cy="'+py(d.val)+'" r="'+(isL?4:2.5)+'" fill="'+(isL?color:'#fff')+'" stroke="'+color+'" stroke-width="'+(isL?0:1.5)+'"/>';
  }).join('');
  const xlbls=[0,Math.floor(data.length/2),data.length-1].filter((v,i,a)=>a.indexOf(v)===i).map(i=>
    '<text x="'+px(i)+'" y="'+(H-5)+'" text-anchor="middle" font-size="9" fill="#aaa">'+data[i].label+'</text>'
  ).join('');
  const fmt=v=>type==='ef'?secToPace(Math.round(v)):Math.round(v)+(type==='fc'?' bpm':' km');
  const better=type==='ef'?(data[data.length-1].val<data[0].val):(data[data.length-1].val>data[0].val);
  const trend=(better?'\u2197':'\u2198')+' '+fmt(data[0].val)+' \u2192 '+fmt(data[data.length-1].val);
  const tc=better?'#22c55e':'#ef4444';
  return '<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;">'
    +'<defs><linearGradient id="cg'+type+'" x1="0" y1="0" x2="0" y2="1">'
    +'<stop offset="0%" stop-color="'+color+'" stop-opacity="0.18"/>'
    +'<stop offset="100%" stop-color="'+color+'" stop-opacity="0.02"/></linearGradient></defs>'
    +grid+'<path d="'+area+'" fill="url(#cg'+type+')"/>'
    +'<path d="'+path+'" fill="none" stroke="'+color+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
    +dots+xlbls+'</svg>'
    +'<div style="font-size:10px;display:flex;justify-content:space-between;margin-top:3px;">'
    +'<span style="color:'+tc+';font-weight:600;">'+trend+'</span>'
    +'<span style="color:#bbb;">'+data.length+' s\u00e9ances</span></div>';
}

function buildCoachChart(type, title) {
  const data = buildCoachChartData(type);
  if(data.length < 1) return ''; // Aucune donnée
  if(data.length < 2) {
    return '<div class="coach-chart-wrap"><div class="coach-chart-title">📊 '+title+'</div>'
      +'<p style="font-size:12px;color:var(--muted);padding:8px 0;">Pas encore assez de séances enregistrées pour tracer ce graphe.</p></div>';
  }
  return '<div class="coach-chart-wrap"><div class="coach-chart-title">📊 '+title+'</div>'+renderCoachChartSVG(data,type)+'</div>';
}

function detectChartNeeds(msg) {
  const m = msg.toLowerCase();
  const charts = [];

  // Détecter FC/fréquence cardiaque EN PREMIER (priorité haute)
  const wantsFC = /\bfc\b|fr[eé]quence|cardio|\bbpm\b|cardiaque|fq\b|coeur|rythme/i.test(m);
  // Détecter KM/volume
  const wantsKM = /\bkm\b|kilom[eè]|volume|charge|total km|distance/i.test(m);
  // Détecter allure EF — seulement si pas de FC demandée explicitement
  const wantsEF = !wantsFC && /\bef\b|endurance|allure ef|allure|vite|progression|sub.?4/i.test(m);

  if(wantsFC) charts.push({type:'fc', title:'FC moyenne EF — évolution'});
  if(wantsKM) charts.push({type:'km', title:'Volume par séance'});
  if(wantsEF) charts.push({type:'ef', title:'Allure EF — évolution'});

  // Fallback si rien détecté → allure EF par défaut
  if(charts.length === 0) charts.push({type:'ef', title:'Allure EF — évolution'});

  return charts.slice(0, 2);
}

let _lastShortcutTime = 0;
function sendShortcut(text){
  const now = Date.now();
  if(now - _lastShortcutTime < 500) return; // anti-double-tap
  _lastShortcutTime = now;
  const input = document.getElementById('coach-input');
  if(!input) return;
  input.value = text;
  sendCoachMessage();
}

function sendNextRun(){
  const now = Date.now();
  if(now - _lastShortcutTime < 500) return;
  _lastShortcutTime = now;

  const jours = ['','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  const dowToSched = [7,1,2,3,4,5,6];
  const todaySched = dowToSched[new Date().getDay()];
  let nextSession = null;

  for(let ws = CW; ws <= Math.min(CW+1, 32); ws++){
    weeks[ws-1].sessions.forEach((sess, si) => {
      if(nextSession) return;
      if(sess.type === 'rest') return;
      if(state['del_w'+ws+'_s'+si]) return;
      if(state[gk(ws,si)+'done']) return;
      const edRaw = state['edit_w'+ws+'_s'+si];
      const ed = edRaw ? JSON.parse(edRaw) : null;
      const schedDay = ed ? ed.sched_day : null;
      if(ws === CW && schedDay && schedDay < todaySched) return;
      nextSession = {
        ws, si,
        type: ed ? ed.type : sess.type,
        titre: ed ? ed.d.split('|')[0] : sess.d.split('|')[0],
        detail: ed ? (ed.d.split('|')[1]||'') : (sess.d.split('|')[1]||''),
        km: ed ? ed.km : sess.km,
        jour: schedDay ? jours[schedDay] : null,
        heure: ed && ed.sched_time ? ed.sched_time : null,
        semaine: ws
      };
    });
    if(nextSession) break;
  }

  // Le message est simple — sendCoachMessage() ajoutera automatiquement tout le stateContext
  // (allure EF réelle, consignes, planning, mémos, etc.)
  let msg;
  if(nextSession){
    const quand = nextSession.jour ? nextSession.jour + (nextSession.heure ? ' à ' + nextSession.heure : '') : 'prochainement';
    msg = '🏃 Next Run — conseils pour ma prochaine séance : ' + nextSession.titre + ' ' + nextSession.km + 'km · ' + quand + ' (S' + nextSession.semaine + ')';
  } else {
    msg = '🏃 Next Run — conseils pour ma prochaine séance';
  }

  const input = document.getElementById('coach-input');
  if(!input) return;
  input.value = msg;
  sendCoachMessage();
}

async function sendCoachMeteo() {
  const chip = document.getElementById('coach-meteo-chip');
  function resetChip() {
    if (chip) { chip.textContent = '🌤️ Météo'; chip.style.opacity = '1'; chip.disabled = false; }
  }
  if (chip) { chip.textContent = '📍…'; chip.style.opacity = '0.6'; chip.disabled = true; }

  try {
    const pos = await _getPosition();
    if (!pos) {
      resetChip();
      const inp = document.getElementById('coach-input');
      if (inp) { inp.value = '🌤️ Météo — géolocalisation non disponible. Donne-moi des conseils généraux pour courir par temps chaud.'; sendCoachMessage(); }
      return;
    }
    if (chip) chip.textContent = '🌡️…';

    const { lat, lng } = pos;
    const [city, meteo] = await Promise.all([
      _getCityFromCoords(lat, lng),
      fetchWeatherForContext(null, null)
    ]);
    resetChip();

    let msg;
    if (meteo) {
      meteo.ville = city;
      window._lastCoachMeteo = meteo;
      const elevFC = meteo.impact_performance?.elevation_fc_bpm || 0;
      const niveau = meteo.impact_performance?.niveau || 'IDEAL';
      const niveauLabels = { IDEAL:'idéales', MODERE:'chaudes (chaleur modérée)', ELEVE:'très chaudes', EXTREME:'extrêmes — effort à limiter', HUMIDE:'humides', FROID:'froides' };
      msg = '🌤️ Météo actuelle à ' + city + ' : ' + meteo.temperature + '°C (ressenti ' + meteo.ressenti + '°C), '
          + meteo.humidite + '% humidité, ' + meteo.conditions + '. '
          + 'Conditions ' + (niveauLabels[niveau] || niveau) + '. '
          + (elevFC > 0 ? 'Ma FC sera naturellement +' + elevFC + ' bpm plus haute. ' : '')
          + 'Que me conseilles-tu pour courir dans ces conditions ?';
    } else {
      msg = "🌤️ Météo à " + city + " : données météo indisponibles. Donne-moi des conseils pour courir aujourd'hui.";
    }

    const inp = document.getElementById('coach-input');
    if (!inp) return;
    inp.value = msg;
    sendCoachMessage();
  } catch(e) {
    console.error('sendCoachMeteo error:', e);
    resetChip();
  }
}

function isAtBottom(el){ return el.scrollHeight - el.scrollTop - el.clientHeight < 80; }
function smartScroll(el){ if(isAtBottom(el)) el.scrollTo({top:el.scrollHeight,behavior:"smooth"}); }

async function sendCoachMessage(){
  const input = document.getElementById('coach-input');
  const msg = input.value.trim();
  if(!msg) return;
  input.value = '';
  input.style.height='auto';
  setTimeout(()=>input.focus(),100);
  addCoachMessage('user', msg);
  coachHistory.push({role:'user', content: msg, date: new Date().toISOString().slice(0,10)});
  _lastUserMessageBeforeProposal = msg; // stocker pour extraction
  const container = document.getElementById('coach-messages');
  const loader = document.createElement('div');
  loader.id = 'coach-loader';
  loader.style.cssText = 'display:flex;align-items:center;gap:8px;';
  // Fix 7: désactiver bouton envoi pendant génération
  const sendBtn = document.getElementById('coach-send-btn');
  if(sendBtn){ sendBtn.disabled=true; sendBtn.style.opacity='0.35'; sendBtn.style.cursor='not-allowed'; }
  // Fix 1: loader avec message texte au lieu des 3 points
  loader.innerHTML = '<div style="width:32px;height:32px;border-radius:50%;background:#0C447C;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span style="font-size:14px;">🤖</span></div>'
    + '<div style="background:var(--bg);border-radius:4px 14px 14px 14px;padding:10px 14px;border-left:3px solid rgba(27,79,216,0.2);">'
    + '<div class="coach-typing"><span>Le Coach écrit</span><div class="coach-typing-dots"><i></i><i></i><i></i></div></div>'
    + '</div>';
  container.appendChild(loader);
  container.scrollTo({top:container.scrollHeight, behavior:"smooth"});
  // Always scroll on new message send
  try {
    // ── Détecter ce que la question nécessite ──
    const needs = detectContextNeeds(msg);
    const responseMode = detectResponseMode(msg);

    // ── Construire l'historique complet (réutilisé si besoin) ──
    const fullHistory = [];
    for(let ws=1; ws<=CW; ws++){
      const weekSessions = [];
      weeks[ws-1].sessions.forEach((sess,si)=>{
        if(state[`del_w${ws}_s${si}`]) return;
        const ed = state['edit_w'+ws+'_s'+si] ? JSON.parse(state['edit_w'+ws+'_s'+si]) : null;
        const k = gk(ws,si);
        const done = !!state[k+'done'];
        const perf = state[k+'perf'] ? JSON.parse(state[k+'perf']) : null;
        weekSessions.push({
          type: ed?ed.type:sess.type,
          titre: ed?ed.d.split('|')[0]:sess.d.split('|')[0],
          detail: ed?ed.d.split('|')[1]||(sess.d.split('|')[1]||''):(sess.d.split('|')[1]||''),
          kmPlan: ed?ed.km:sess.km,
          chaussures: ed?ed.shoe:null,
          done, kmRealise: done?(state[k+'km']||null):null,
          perf: perf||null
        });
      });
      let ei=0;
      while(state[`extra_w${ws}_s${ei}`]){
        const es=JSON.parse(state[`extra_w${ws}_s${ei}`]);
        const done=!!state[`extra_w${ws}_s${ei}_done`];
        const perfExtra=state[`extra_w${ws}_s${ei}_perf`]?JSON.parse(state[`extra_w${ws}_s${ei}_perf`]):null;
        weekSessions.push({type:es.type,titre:es.d.split('|')[0],extra:true,kmPlan:es.km,chaussures:es.shoe||null,done,kmRealise:done?(state[`extra_w${ws}_s${ei}_km`]||null):null,perf:perfExtra});
        ei++;
      }
      if(weekSessions.length>0) fullHistory.push({semaine:ws,date_debut:weeks[ws-1].date,sessions:weekSessions});
    }

    // ── Plan futur (si nécessaire) ──
    const futurPlan = [];
    if(needs.plan_futur || needs.historique_complet) {
      for(let ws=CW; ws<=32; ws++){
        // Séances du plan de base
        const weekSessions = weeks[ws-1].sessions.map((sess, si) => {
          if(state['del_w'+ws+'_s'+si]) return null;
          const ed = state['edit_w'+ws+'_s'+si] ? JSON.parse(state['edit_w'+ws+'_s'+si]) : null;
          const d = ed ? ed.d : sess.d;
          const parts = d.split('|');
          const type = ed ? ed.type : sess.type;
          const sessionData = getSession(ws, si);
          const km = parseFloat(sessionData.km) || 0;
          return {
            type,
            titre: parts[0],
            detail_allure: parts[1] || null,
            kmPlan: km,
            chaussures: ed ? ed.shoe : null,
            planifie: ed && ed.sched_day
              ? ((['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'][ed.sched_day]||'') + (ed.sched_time ? ' '+ed.sched_time : ''))
              : 'non planifié'
          };
        }).filter(Boolean);

        // ── Séances extra (ajoutées via "Ajouter une séance") ──
        let ei = 0;
        while(state[`extra_w${ws}_s${ei}`]) {
          const es = JSON.parse(state[`extra_w${ws}_s${ei}`]);
          const done = !!state[`extra_w${ws}_s${ei}_done`];
          const km = parseFloat(es.km) || 0;
          const parts = (es.d||'').split('|');
          weekSessions.push({
            type: es.type,
            titre: parts[0],
            detail_allure: parts[1] || null,
            kmPlan: km,
            chaussures: es.shoe || null,
            planifie: es.sched_day
              ? ((['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'][es.sched_day]||'') + (es.sched_time ? ' '+es.sched_time : ''))
              : 'non planifié',
            extra: true,
            fait: done
          });
          ei++;
        }

        // TOTAUX via getWeekTotalKm — source de vérité unique
        const kmTotal   = getWeekTotalKm(ws);
        const kmEF      = Math.round(weekSessions.filter(s=>s.type==='ef').reduce((a,s)=>a+s.kmPlan,0)*10)/10;
        const kmTempo   = Math.round(weekSessions.filter(s=>s.type==='tempo').reduce((a,s)=>a+s.kmPlan,0)*10)/10;
        const kmFrac    = Math.round(weekSessions.filter(s=>s.type==='frac').reduce((a,s)=>a+s.kmPlan,0)*10)/10;
        const kmLong    = Math.round(weekSessions.filter(s=>s.type==='long').reduce((a,s)=>a+s.kmPlan,0)*10)/10;
        const nbSeances = weekSessions.filter(s=>s.type!=='rest').length;
        const typeSemaine = [8,12,16,20,26,30].includes(ws) ? 'DÉCHARGE' : 'CHARGE';

        // Comparer avec la dernière semaine NON-DÉCHARGE (sauter les semaines de décharge)
        // Ex: S15=38km, S16=décharge 33km, S17=41km → S17 se compare à S15, pas S16
        let kmPrevSemaine = null;
        let semainePrevRef = null;
        if(ws > 1) {
          for(let prevWs = ws-1; prevWs >= 1; prevWs--) {
            const isDecharge = [8,12,16,20,26,30].includes(prevWs);
            if(!isDecharge) {
              kmPrevSemaine = getWeekTotalKm(prevWs);
              semainePrevRef = prevWs;
              break;
            }
          }
        }
        const hausse = (kmPrevSemaine && kmPrevSemaine > 0)
          ? Math.round((kmTotal - kmPrevSemaine) / kmPrevSemaine * 100)
          : null;

        futurPlan.push({
          semaine: ws,
          date_debut: weeks[ws-1].date,
          type_semaine: typeSemaine,
          km_total: kmTotal,
          km_ef: kmEF,
          km_tempo: kmTempo,
          km_frac: kmFrac,
          km_long: kmLong,
          nb_seances: nbSeances,
          km_semaine_precedente: kmPrevSemaine,
          semaine_ref_precedente: semainePrevRef, // semaine non-décharge utilisée pour la comparaison
          hausse_vs_precedente_pct: hausse,
          sessions: weekSessions
        });
      }
    }

    // ── Charger les mémos ──
    let coachMemos = '';
    try { const ms = await dbRef.child('_coach_memos').once('value'); coachMemos = ms.val()||''; } catch(e){}

    // ── Date / heure / séances du jour ──
    const now = new Date();
    const joursSemaine = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
    const heureActuelle = now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
    const jourActuel = joursSemaine[now.getDay()];
    const todayDayNum = now.getDay()===0?7:now.getDay();
    const seancesAujourdhui = [];
    getOrderedWeekSessions(CW).forEach(({s,si,extra,ei})=>{
      if(extra){
        const done=!!state[`extra_w${CW}_s${ei}_done`];
        if(done) return;
        if(s.sched_day===todayDayNum)
          seancesAujourdhui.push({type:s.type,titre:s.d.split('|')[0],km:s.km,heure:s.sched_time||null});
        return;
      }
      const edRaw=state['edit_w'+CW+'_s'+si]; if(!edRaw) return;
      const ed=JSON.parse(edRaw);
      if(ed.sched_day===todayDayNum&&!state[gk(CW,si)+'done'])
        seancesAujourdhui.push({type:ed.type||s.type,titre:ed.d?ed.d.split('|')[0]:s.d.split('|')[0],km:ed.km||s.km,heure:ed.sched_time||null});
    });
    [{r:1,name:'Ischio-fessiers'},{r:2,name:'Bas du dos'}].forEach(rd=>{
      const sched=state[rfk(CW,rd.r)+'sched']?JSON.parse(state[rfk(CW,rd.r)+'sched']):null;
      if(sched&&sched.day===todayDayNum&&!state[rfk(CW,rd.r)+'done'])
        seancesAujourdhui.push({type:'renfo',titre:'Renfo '+rd.name,heure:sched.time||null});
    });

    // ── Assembler le contexte final ──
    const compactCtx = buildCompactContext(coachMemos, seancesAujourdhui, jourActuel, heureActuelle);
    const detailedSections = buildDetailedSections(needs, fullHistory, futurPlan);
    // Date réelle du jour pour le coach
    const _now = new Date();
    const _jNoms = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
    const _mNoms = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    const _dateStr = _jNoms[_now.getDay()]+' '+_now.getDate()+' '+_mNoms[_now.getMonth()]+' '+_now.getFullYear();
    const _seancesAvChat = [];
    (()=>{
      const joursC=['','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
      const tDow=now.getDay()===0?7:now.getDay(); const hA=heureActuelle;
      getOrderedWeekSessions(CW).forEach(({s:s2,si,extra,ei})=>{
        if(_seancesAvChat.length>=3)return;
        const done=extra?!!state['extra_w'+CW+'_s'+ei+'_done']:!!state[gk(CW,si)+'done'];
        if(done)return;
        const edRaw=!extra&&state['edit_w'+CW+'_s'+si];
        const ed=edRaw?JSON.parse(edRaw):null;
        const titre=ed?ed.d.split('|')[0]:s2.d.split('|')[0];
        const type=ed?ed.type:s2.type; const km=ed?ed.km:s2.km;
        const jourC=ed&&ed.sched_day?joursC[ed.sched_day]:'';
        const heure=ed&&ed.sched_time?ed.sched_time:'';
        let hAvant=null;
        if(ed&&ed.sched_day){const dJ=((ed.sched_day-tDow)+7)%7;const hS=heure?parseInt(heure.split(':')[0])+parseInt(heure.split(':')[1]||0)/60:12;hAvant=Math.round(dJ*24+(hS-hA));}
        _seancesAvChat.push({type,titre,km,quand:jourC+(heure?' à '+heure:'non planifié'),heures_avant_seance:hAvant!==null?hAvant+'h':'?'});
      });
    })();
    const stateContext = Object.assign({}, compactCtx, detailedSections, {
      date_reelle: {
        complet: _dateStr,
        jour: _jNoms[_now.getDay()],
        numero: _now.getDate(),
        mois: _mNoms[_now.getMonth()],
        heure: _now.getHours()+'h'+String(_now.getMinutes()).padStart(2,'0')
      },
      charge_semaine: (()=>{const kmF=calcWeekDoneKm();const kmP=getWeekTotalKm(CW);const kmPrev=CW>1?getWeekTotalKm(CW-1):kmP;return {realise:kmF,planifie:kmP,ratio_vs_precedente:kmPrev>0?Math.round(kmP/kmPrev*100)/100:null,statut:kmF<kmP?'EN_COURS':'TERMINÉE'};})(),
      seances_a_venir: _seancesAvChat,
    });

    // ── Enrichir le message avec les données de planning si question sur horaires ──
    const mLower = msg.toLowerCase();
    const isAboutTiming = /quand|prochaine|séance|horaire|planifié|prévu|ce soir|demain|semaine|jour|heure|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche/.test(mLower);
    // Injecter le contexte de la séance récemment validée (< 30 min)
    let enrichedMsg = msg;
    const lastSession = window._lastValidatedSession;
    if(lastSession && (Date.now() - lastSession.timestamp) < 30*60*1000){
      let sessionCtx = '[Contexte: Guillaume vient de valider une séance '
        + lastSession.type.toUpperCase() + ' - ' + lastSession.titre
        + ' (' + lastSession.km + 'km'
        + (lastSession.pace ? ' @' + lastSession.pace : '')
        + (lastSession.hr ? ' FC' + lastSession.hr : '')
        + ') il y a moins de 30 minutes.';
      // Ajouter les données Garmin enrichies si disponibles
      if(lastSession.garmin) {
        const g = lastSession.garmin;
        if(g.cadence) sessionCtx += ` Cadence: ${g.cadence} pas/min.`;
        if(g.fcMax) sessionCtx += ` FC max: ${g.fcMax} bpm.`;
        if(g.denivele_pos != null) sessionCtx += ` Dénivelé: +${g.denivele_pos}m/-${g.denivele_neg||0}m.`;
        if(g.puissance_moy) sessionCtx += ` Puissance moy: ${g.puissance_moy}W.`;
        if(g.zones_fc && g.zones_fc.length > 0) {
          const zonesStr = g.zones_fc.map(z => `${z.nom}: ${Math.floor(z.temps_sec/60)}min`).join(', ');
          sessionCtx += ` Zones FC: ${zonesStr}.`;
        }
        if(g.splits && g.splits.length > 0) {
          const splitsStr = g.splits.map(sp => `km${sp.km}:${sp.allure||'—'}${sp.fc?' FC'+sp.fc:''}`).join(' | ');
          sessionCtx += ` Splits: ${splitsStr}.`;
        }
      }
      sessionCtx += ' Sa question porte probablement sur cette séance.]';
      enrichedMsg = msg + '\n\n' + sessionCtx;
    }
    if(isAboutTiming && compactCtx.seances_restantes_semaine && compactCtx.seances_restantes_semaine.length > 0){
      const planning = compactCtx.seances_restantes_semaine.join(', ');
      // Calculer le nb de jours jusqu'à chaque séance
      const todayIdx = now.getDay() === 0 ? 7 : now.getDay(); // 1=Lun...7=Dim
      const joursComplets = ['','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
      const planningAvecDelai = compactCtx.seances_restantes_semaine.map(s => {
        const match = s.match(/→ (Lun|Mar|Mer|Jeu|Ven|Sam|Dim) (\d{2}:\d{2})/);
        if(match){
          const joursAbr = ['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
          const sessDayIdx = joursAbr.indexOf(match[1]);
          const diff = sessDayIdx - todayIdx;
          const label = diff === 0 ? "aujourd'hui" : diff === 1 ? 'demain' : `dans ${diff} jours (${joursComplets[sessDayIdx]})`;
          return s + ` [${label} à ${match[2]}]`;
        }
        return s;
      }).join(', ');
      // Calculer les dates exactes de chaque séance
      const _msDay = 86400000;
      const _moisNoms2 = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
      const planningDates = compactCtx.seances_restantes_semaine.map(s => {
        const m2 = s.match(/\u2192 (Lun|Mar|Mer|Jeu|Ven|Sam|Dim) (\d{2}:\d{2})/);
        if(m2) {
          const joursAbr2 = ['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
          const sdi = joursAbr2.indexOf(m2[1]);
          const d2 = ((sdi - todayIdx) + 7) % 7;
          const sd = new Date(now.getTime() + d2 * _msDay);
          const dateExacte = sd.getDate() + ' ' + _moisNoms2[sd.getMonth()];
          const lbl = d2===0 ? "aujourd'hui" : d2===1 ? 'demain' : joursComplets[sdi];
          return s + ' [' + lbl + ' ' + dateExacte + ' à ' + m2[2] + ']';
        }
        return s;
      }).join(', ');
      const _dateAuj = now.getDate() + ' ' + _moisNoms2[now.getMonth()] + ' ' + now.getFullYear();
      const _efDynMsg = getBestEfPace() || "6'40";
      const planningDatesFinal = planningDates.replace(/\d:\d{2}\/km/g, _efDynMsg + '/km')
                                              .replace(/EF @ \d:\d{2}\/km/g, 'EF @ ' + _efDynMsg + '/km');
      enrichedMsg = msg + '\n\n[Dates exactes séances: ' + planningDatesFinal + '. AUJOURD\'HUI = ' + jourActuel + ' ' + _dateAuj + '. Utilise UNIQUEMENT ces dates, ne calcule jamais toi-même.]';
    }

    const response = await fetch('https://us-central1-prepa-marathon.cloudfunctions.net/coachChat', {
      method:'POST',
      headers:await authHeaders(true),
      body:JSON.stringify({message:enrichedMsg, history:coachHistory.slice(-20), stateContext, responseMode})
    });

    // NE PAS supprimer loader ici — il reste visible pendant la lecture du stream

    // Préparer la bulle réponse (PAS encore dans le DOM)
    const container = document.getElementById('coach-messages');
    const bubbleWrap = document.createElement('div');
    bubbleWrap.style.cssText = 'display:flex;align-items:flex-start;gap:8px;opacity:0;transition:opacity 0.3s ease;';
    const avatar = document.createElement('div');
    avatar.style.cssText = 'width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#1B4FD8,#6B21A8);display:flex;align-items:center;justify-content:center;flex-shrink:0;';
    avatar.innerHTML = '<span style="font-size:14px;">🤖</span>';
    const bubble = document.createElement('div');
    bubble.style.cssText = 'background:var(--bg);border-radius:4px 14px 14px 14px;padding:12px 14px;max-width:85%;border-left:3px solid rgba(27,79,216,0.2);box-shadow:0 1px 6px rgba(0,0,0,0.07);';
    const textEl = document.createElement('div');
    textEl.style.cssText = 'font-size:14px;color:var(--text);line-height:1.7;';
    bubble.appendChild(textEl);
    bubbleWrap.appendChild(avatar);
    bubbleWrap.appendChild(bubble);
    // NE PAS ajouter au DOM ici — seulement quand on a le contenu

    // Lire tout le stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '', buffer = '';

    while(true) {
      const {done, value} = await reader.read();
      if(done) break;
      buffer += decoder.decode(value, {stream: true});
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for(const line of lines) {
        if(!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if(data === '[DONE]') continue;
        try { const parsed = JSON.parse(data); if(parsed.token) fullText += parsed.token; } catch(e) {}
      }
    }

    // Injecter le texte dans la bulle (encore hors DOM)
    const cleanedFullText = cleanTruncated(fullText);

    // Si réponse vide → retry automatique silencieux (1 seule fois)
    if(!cleanedFullText && !window._coachRetrying) {
      window._coachRetrying = true;
      loader.remove();
      if(sendBtn){ sendBtn.disabled=false; sendBtn.style.opacity='1'; sendBtn.style.cursor='pointer'; }
      // Retry après 2 secondes
      setTimeout(() => {
        window._coachRetrying = false;
        sendCoachMessage(msg);
      }, 2000);
      return;
    }
    window._coachRetrying = false;

    textEl.innerHTML = cleanedFullText
      ? renderCoachText(cleanedFullText)
      : '<p style="margin:0;color:var(--muted);font-style:italic;">Je suis momentanément indisponible, réessaie dans quelques secondes.</p>';

    // Crossfade atomique : ajouter bulle au DOM opacity:0, puis fade-in/out simultané
    container.appendChild(bubbleWrap); // ajoute avec opacity:0 déjà défini
    container.scrollTo({top:container.scrollHeight, behavior:'smooth'});

    // Un seul requestAnimationFrame pour les deux animations simultanées
    requestAnimationFrame(() => {
      bubbleWrap.style.opacity = '1';                     // bulle apparaît
      loader.style.transition = 'opacity 0.25s ease';
      loader.style.opacity = '0';                         // loader disparaît
      setTimeout(() => loader.remove(), 250);              // suppression après fade
    });

    if(sendBtn){ sendBtn.disabled=false; sendBtn.style.opacity='1'; sendBtn.style.cursor='pointer'; }

    coachHistory.push({role:'assistant', content: cleanedFullText||'', date: new Date().toISOString().slice(0,10)});
    saveCoachHistory();
    if(cleanedFullText) checkForPlanProposal(cleanedFullText, bubble);
    if(responseMode==='analyse'||responseMode==='rapport'){
      setTimeout(()=>{
        const chartQuery = _lastUserMessageBeforeProposal || msg;
        detectChartNeeds(chartQuery).forEach(ch=>{
          const html=buildCoachChart(ch.type,ch.title);
          if(html){ const d=document.createElement('div'); d.innerHTML=html; bubble.appendChild(d.firstChild); smartScroll(container); }
        });
      },250);
    }
  } catch(e) {
    loader.remove();
    if(sendBtn){ sendBtn.disabled=false; sendBtn.style.opacity='1'; sendBtn.style.cursor='pointer'; }
    addCoachMessage('coach', 'Désolé, je suis temporairement indisponible.');
  }
}
function saveCoachHistory(){
  if(!dbRef) return;
  const toSave = coachHistory.slice(-50);
  dbRef.child('_coach_history').set(JSON.stringify(toSave));
  // Extraire les mémos tous les 6 messages
  if(coachHistory.length % 6 === 0) extractAndSaveMemos();
}

async function extractAndSaveMemosWithContext(extraMessages) {
  // Appelé après un débrief de séance — force la mise à jour des mémos
  // même si le seuil de 6 messages n'est pas atteint
  const existingMemos = await _loadMemos();
  if(!existingMemos && !extraMessages) return;
  try {
    // Récupérer les performances récentes
    const recentPerfs = [];
    for(let ws=Math.max(1,CW-7); ws<=CW; ws++) {
      if(!weeks[ws-1]) continue;
      weeks[ws-1].sessions.forEach((sess,si) => {
        const dk = gk(ws,si);
        if(!state[dk+'done']) return;
        const perf = state[dk+'perf'] ? JSON.parse(state[dk+'perf']) : {};
        const parts = [];
        if(perf.pace) parts.push('allure:'+perf.pace+'/km');
        if(perf.hr) parts.push('FC:'+perf.hr+'bpm');
        if(state[dk+'km']) parts.push(state[dk+'km']+'km');
        if(parts.length) recentPerfs.push('S'+ws+' '+sess.type+': '+parts.join(', '));
      });
    }
    const historyToSend = [...(extraMessages||[]), ...coachHistory.slice(-10)];
    const response = await fetch('https://us-central1-prepa-marathon.cloudfunctions.net/extractMemos', {
      method:'POST', headers:await authHeaders(false),
      body: JSON.stringify({
        history: historyToSend,
        existingMemos,
        recentPerfs: recentPerfs.join('\n')
      })
    });
    const data = await response.json();
    if(data.memos && data.memos !== existingMemos) {
      _setMemos(data.memos);
    }
  } catch(e) { console.log('memo update after debrief failed:', e); }
}

async function extractAndSaveMemos(){
  try {
    // Vérifier si les derniers échanges contiennent des infos importantes
    const lastMessages = coachHistory.slice(-6);
    const hasPersonalInfo = lastMessages.some(m => {
      const t = m.content.toLowerCase();
      return /blessure|douleur|fatigue|kin[eé]|m[eé]decin|vacances|voyage|travail|stress|sommeil|nutrition|poids|mollet|genou|cheville|hanche|dos|tendon|pr[eé]f[eè]re|j.aime|d[eé]teste|objectif|sous-/.test(t)
        // Résolutions de problèmes — allures, rythme, progression
        || /respect[eé]|allure|tempo|km|vitesse|rythme|j.ai fait|j.ai couru|bien couru|progress|amélio|mieux|corrig|cette semaine|cette s[eé]ance|réussi|maintenu|tenu/.test(t)
        // Bilan séance ou semaine → toujours pertinent
        || /bilan|s[0-9]|semaine [0-9]|séance.*fait|fait.*séance/.test(t);
    });
    // Forcer aussi si les mémos contiennent un problème qui pourrait être résolu
    const memosHaveProblem = (_currentMemos||'').toLowerCase().match(
      /ne respecte pas|acc[eé]l[eè]re|trop vite|au lieu de|probl[eè]me|attention|trop rapide|trop lent/
    );
    if(!hasPersonalInfo && !memosHaveProblem) return; // Pas d'info utile

    // Charger les mémos existants pour les passer à extractMemos
    let existingMemos = '';
    try { const ms = await dbRef.child('_coach_memos').once('value'); existingMemos = ms.val()||''; } catch(e){}

    // Récupérer les dernières performances pour contexte
    const recentPerfs = [];
    for(let ws=Math.max(1,CW-3); ws<=CW; ws++) {
      if(!weeks[ws-1]) continue;
      weeks[ws-1].sessions.forEach((sess,si) => {
        const dk = gk(ws,si);
        if(!state[dk+'done']) return;
        const perf = state[dk+'perf'] ? JSON.parse(state[dk+'perf']) : {};
        const parts = [];
        if(perf.pace) parts.push('allure:'+perf.pace+'/km');
        if(perf.hr) parts.push('FC:'+perf.hr+'bpm');
        if(state[dk+'km']) parts.push(state[dk+'km']+'km');
        if(parts.length) recentPerfs.push('S'+ws+' '+sess.type+': '+parts.join(', '));
      });
    }
    const response = await fetch('https://us-central1-prepa-marathon.cloudfunctions.net/extractMemos', {
      method:'POST', headers:await authHeaders(false),
      body: JSON.stringify({
        history: coachHistory.slice(-20),
        existingMemos,
        recentPerfs: recentPerfs.join('\n') // Données réelles pour vérifier résolution
      })
    });
    const data = await response.json();
    if(data.memos && data.memos !== existingMemos && dbRef){
      _setMemos(data.memos);
    }
  } catch(e) { console.log('memo extraction failed', e); }
}

// Génère le brief complet après affichage du teaser de notification
async function generateFullBriefFromNotif(memos) {
  const container = document.getElementById('coach-messages');

  // Guard : si state est vide (race condition depuis notification), recharger Firebase
  if (dbRef && (!state || Object.keys(state).length === 0)) {
    try {
      const stateSnap = await dbRef.once('value');
      if (stateSnap.val()) state = stateSnap.val();
    } catch(e) {}
  }

  // Message de chargement visible
  addCoachMessage('coach', 'Je prépare ton brief du jour...');
  const loadingMsg = container ? container.lastElementChild : null;
  const textEl = loadingMsg ? loadingMsg.querySelector('[data-coach-text]') : null;
  if(container) container.scrollTop = container.scrollHeight;

  try {
    // Construire le même contexte riche que pour le brief matinal normal
    const now = new Date();
    const joursNoms = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
    const dow = now.getDay();
    const dowToSched = [7,1,2,3,4,5,6];
    const todaySched = dowToSched[dow];
    const todayStr = now.toISOString().slice(0,10);

    const seancesAujourdHui = [];
    const seancesJoursSuivants = [];
    weeks[CW-1].sessions.forEach((sess, si) => {
      if(sess.type === 'rest' || state['del_w'+CW+'_s'+si]) return;
      const edRaw = state['edit_w'+CW+'_s'+si];
      const ed = edRaw ? JSON.parse(edRaw) : null;
      const done = !!state[gk(CW,si)+'done'];
      if(done) return;
      const schedDay = (ed && ed.sched_day) || null;
      const entry = {
        type: sess.type,
        titre: (ed||sess).d.split('|')[0],
        km: (ed||sess).km,
        heure: ed && ed.sched_time ? ed.sched_time : '',
        allure: (ed||sess).d.split('|')[1] || ''
      };
      if(schedDay === todaySched) seancesAujourdHui.push(entry);
      else if(schedDay > todaySched) seancesJoursSuivants.push({...entry, jour: joursNoms[schedDay] || ''});
    });

    // Météo : seulement si permission déjà accordée (pas de dialog au réveil)
    const _meteoHeure = seancesAujourdHui.length > 0 && seancesAujourdHui[0].heure
      ? seancesAujourdHui[0].heure
      : null;
    const meteoCtx = await fetchWeatherIfGranted(_meteoHeure, todayStr);

    // ── Ajouter le renfo d'aujourd'hui s'il est planifié ──
    const renfoAujourdHui = [];
    [{r:1,name:'Ischio-fessiers'},{r:2,name:'Bas du dos'}].forEach(rd => {
      const sched = state[rfk(CW,rd.r)+'sched'] ? JSON.parse(state[rfk(CW,rd.r)+'sched']) : null;
      if(sched && sched.day === todaySched && !state[rfk(CW,rd.r)+'done'])
        renfoAujourdHui.push({type:'renfo', titre:'Renfo '+rd.name, heure: sched.time||'', km: null});
    });
    const toutesSeancesAujourdHui = [...seancesAujourdHui, ...renfoAujourdHui];

    // ── Contexte MINIMAL — uniquement aujourd'hui ──
    const fcCtxNotif = buildFcReposContext();
    const ctx = {
      INSTRUCTION: 'Brief UNIQUEMENT sur AUJOURD\'HUI. 5 à 8 phrases max. Structure stricte : 1) FC repos 2) Météo si disponible 3) Conseils UNIQUEMENT pour les séances listées dans seances_today_liste. NE JAMAIS mentionner ni inventer de séances absentes de seances_today_liste. NE PAS résumer la semaine ni les performances passées.',
      type: 'brief_matin_court',
      date: todayStr,
      jour: joursNoms[dow] || '',
      fc_repos_bpm: state['fc_repos_' + todayStr] || state['fc_repos'] || null,
      fc_repos_moyenne_7j: fcCtxNotif.stats_7j ? fcCtxNotif.stats_7j.moyenne : null,
      fc_repos_note: fcCtxNotif.alerte_fatigue || null,
      meteo: meteoCtx || null,
      instruction_meteo: meteoCtx && meteoCtx.impact_performance && meteoCtx.impact_performance.elevation_fc_bpm > 0
        ? `CHALEUR AUJOURD'HUI ${meteoCtx.temperature}°C : impact FC +${meteoCtx.impact_performance.elevation_fc_bpm} bpm, perte perf -${meteoCtx.impact_performance.perte_perf_pct}%, ralentissement +${meteoCtx.impact_performance.ralent_sec_km} sec/km. ` +
          `Zone EF à viser : ${meteoCtx.impact_performance.zone_ef_ajustee}. CONSEIL OBLIGATOIRE : mentionner la chaleur et ses conséquences concrètes sur l'allure et la FC attendue.`
        : null,
      seances_today_liste: toutesSeancesAujourdHui.length > 0
        ? toutesSeancesAujourdHui.map(s => `${s.type.toUpperCase()}: ${s.titre}${s.km ? ' '+s.km+'km' : ''}${s.heure ? ' à '+s.heure : ''}${s.allure ? ' (allure: '+s.allure+')' : ''}`)
        : ['AUCUNE SÉANCE PLANIFIÉE AUJOURD\'HUI — ne pas inventer de séance'],
      seances_today_count: toutesSeancesAujourdHui.length,
      demain_premier_apercu: seancesJoursSuivants.length > 0 ? {
        titre: seancesJoursSuivants[0].titre,
        type: seancesJoursSuivants[0].type,
        km: seancesJoursSuivants[0].km,
        jour: seancesJoursSuivants[0].jour,
        heure: seancesJoursSuivants[0].heure || '',
        allure: seancesJoursSuivants[0].allure || null,
      } : null,
      type_semaine: [8,12,16,20,26,30].includes(CW) ? 'DÉCHARGE' : 'NORMALE',
      allure_ef_actuelle: getBestEfPace(),
      consigne_allure_aujourd_hui: [8,12,16,20,26,30].includes(CW)
        ? 'Semaine DÉCHARGE — allure EF lente, FC < 140 bpm'
        : 'Semaine normale — allure EF, FC 140-148 bpm',
      infos_importantes: memos || undefined,
    };

    // Supprimer le message "Je prépare ton brief..."
    if(loadingMsg) loadingMsg.remove();

    // Appeler morningBrief — brief complet avec allures, conseils, nutrition
    const resp = await fetch('https://us-central1-prepa-marathon.cloudfunctions.net/morningBrief', {
      method: 'POST',
      headers: await authHeaders(true),
      body: JSON.stringify({context: ctx})
    });

    if(!resp.ok) throw new Error('HTTP ' + resp.status);

    // Accumuler tout le stream puis afficher d'un coup (comme les messages coach)
    let full = '', buf = '';
    const reader = resp.body.getReader();
    const dec = new TextDecoder();

    while(true) {
      const {value, done} = await reader.read();
      if(done) break;
      buf += dec.decode(value, {stream: true});
      const lines = buf.split('\n'); buf = lines.pop();
      for(const line of lines) {
        if(!line.startsWith('data: ')) continue;
        const d = line.slice(6).trim();
        if(d === '[DONE]') continue;
        try { const p = JSON.parse(d); if(p.token) full += p.token; } catch(e) {}
      }
    }

    if(full) {
      addCoachMessage('coach', full);
      coachHistory.push({role: 'assistant', content: full, date: todayStr});
      saveCoachHistory();
      try { await dbRef.child('_brief_pending').set({content: full, date: todayStr, type:'morning_brief'}); } catch(e){}
    } else {
      // Fallback si le serveur ne répond pas
      const fallbackSeances = seancesAujourdHui.length > 0
        ? seancesAujourdHui.map(s => {
            const t = {ef:'EF', tempo:'Tempo', frac:'Fractionné', long:'EF Longue', race:'Course'}[s.type] || s.type;
            return t + ' ' + s.km + 'km' + (s.heure ? ' à ' + s.heure : '');
          }).join(' + ')
        : 'Pas de séance prévue ce matin';
      const fallback = '💪 Bonjour Guillaume ! ' + fallbackSeances + '. Pose-moi tes questions directement.';
      addCoachMessage('coach', fallback);
      coachHistory.push({role: 'assistant', content: fallback, date: todayStr});
      saveCoachHistory();
    }
  } catch(e) {
    console.error('generateFullBriefFromNotif error:', e);
    // En cas d'erreur, tenter un message de secours construit localement
    const errFallback = '💪 Bonjour Guillaume ! Ouvre le Coach IA pour ton brief du jour — je suis prêt pour tes questions !';
    if(textEl) textEl.innerHTML = renderCoachText(errFallback);
  }
}
async function checkPendingBrief() {
  // Retourne {shown:true, type:'...', content:'...'} ou false
  if (!dbRef) return false;
  const today = new Date().toISOString().slice(0, 10);

  // Lire TOUJOURS depuis Firebase — le state local peut être obsolète
  let p = null;
  try {
    const snap = await dbRef.child('_brief_pending').once('value');
    p = snap.val();
  } catch(e) {}

  // Fallback sur state local si Firebase échoue
  if (!p || !p.content) {
    try {
      const raw = state['_brief_pending'];
      if (raw) p = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch(e) {}
  }

  if (!p || !p.content) return false;

  // Vérifier que c'est bien le brief d'aujourd'hui
  if (p.date && p.date !== today) {
    try { await dbRef.child('_brief_pending').remove(); } catch(e) {}
    delete state['_brief_pending'];
    return false;
  }

  // Si le serveur a marqué needs_full_brief → supprimer le pending et laisser
  // checkMorningBrief générer le brief complet (via morningBrief CF)
  if (p.needs_full_brief) {
    try { await dbRef.child('_brief_pending').remove(); } catch(e) {}
    delete state['_brief_pending'];
    // Remettre le flag _brief_matin_ à false pour que checkMorningBrief puisse tourner
    try { await dbRef.child('_brief_matin_' + today).remove(); } catch(e) {}
    // Retourner un objet spécial pour signaler à loadCoachHistory d'appeler checkMorningBrief(force=true)
    return { needs_full_brief: true };
  }

  _briefShownToday = true;
  return { shown: true, type: p.type || 'morning_brief', content: p.content };
}

async function checkMorningBrief(memos, force) {
  if(_briefShownToday) return false;
  if(!getPref('notif_brief_matin')) return false;
  const now = new Date();
  const h = now.getHours();
  const dow = now.getDay(); // 0=dim,1=lun,...,6=sam

  // Dimanche : bilan géré séparément → pas de brief matin
  if(!force && dow === 0) return false;

  // Lundi : le briefing semaine gère l'affichage → pas de brief matin standard
  // SAUF si force=true (déclenché par notif)
  if(!force && dow === 1) return false;

  // Si on ouvre l'app AVANT 8h00 → programmer un setTimeout pour 8h00 pile
  if(!force && h < 8) {
    const target8h = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0);
    const msUntil8h = target8h - now;
    setTimeout(() => checkMorningBrief(memos), msUntil8h);
    return false;
  }

  const todayStr = now.toISOString().slice(0,10);
  const briefKey = '_brief_matin_' + todayStr;

  // Vérifier si déjà affiché aujourd'hui (Firebase — source de vérité)
  try {
    const snap = await dbRef.child(briefKey).once('value');
    const val = snap.val();
    // 'push_sent' = notif envoyée mais brief complet pas encore généré → OK, on continue
    // true ou 'read' = brief complet déjà généré → stop
    if (val === true || val === 'read') return false;
  } catch(e) { return false; }

  // Chercher séances d'aujourd'hui
  const dowToSched = [7,1,2,3,4,5,6]; // JS day → sched_day
  const todaySched = dowToSched[dow];
  const todaySessions = [];
  weeks[CW-1].sessions.forEach((sess, si) => {
    if(sess.type === 'rest') return;
    if(state['del_w'+CW+'_s'+si]) return;
    if(state[gk(CW,si)+'done']) return;
    const edRaw = state['edit_w'+CW+'_s'+si];
    const ed = edRaw ? JSON.parse(edRaw) : null;
    if(ed && ed.sched_day === todaySched) {
      todaySessions.push({
        type: sess.type,
        titre: (ed||sess).d.split('|')[0],
        km: (ed||sess).km,
        heure: ed && ed.sched_time ? ed.sched_time : '',
        allure: (ed||sess).d.split('|')[1] || ''
      });
    }
  });

  // Renfo prévu aujourd'hui
  const renfoTodayGate = [];
  [{r:1,name:'Ischio-fessiers'},{r:2,name:'Bas du dos'}].forEach(rd => {
    const raw = state[rfk(CW,rd.r)+'sched'];
    if(!raw) return;
    // Firebase peut retourner soit un objet soit une string JSON
    let sched;
    try { sched = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { return; }
    console.log('[brief] renfo', rd.r, 'sched:', JSON.stringify(sched), 'todaySched:', todaySched, 'done:', !!state[rfk(CW,rd.r)+'done']);
    if(sched && sched.day === todaySched && !state[rfk(CW,rd.r)+'done'])
      renfoTodayGate.push(rd.name);
  });

  // Lundi : bodyhit compte comme activité du jour même sans séance planifiée
  const bodyhitToday = (dow === 1);

  if(!force && todaySessions.length === 0 && renfoTodayGate.length === 0 && !bodyhitToday) return false;

  // Marquer comme brief complet généré
  try { await dbRef.child(briefKey).set(true); } catch(e){}
  _briefShownToday = true; // empêche tout double affichage

  const joursNoms = ['','lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];

  // Appel IA pour le conseil personnalisé
  // Séances des jours suivants (pour que le coach ne les invente pas)
  const seancesJoursSuivants = [];
  weeks[CW-1].sessions.forEach((sess, si) => {
    if(sess.type === 'rest') return;
    if(state['del_w'+CW+'_s'+si]) return;
    if(state[gk(CW,si)+'done']) return;
    const edRaw = state['edit_w'+CW+'_s'+si];
    const ed = edRaw ? JSON.parse(edRaw) : null;
    if(ed && ed.sched_day > todaySched) {
      const jourNom = joursNoms[ed.sched_day] || ('jour '+ed.sched_day);
      seancesJoursSuivants.push({
        type: sess.type,
        titre: (ed||sess).d.split('|')[0],
        km: (ed||sess).km,
        jour: jourNom,
        heure: ed.sched_time || '',
      });
    }
  });

  // Récupérer la dernière séance validée
  let derniereSeanceInfo = null;
  for(let ws=CW; ws>=Math.max(1,CW-2); ws--) {
    let found = false;
    weeks[ws-1].sessions.forEach((sess,si) => {
      if(found) return;
      const k = gk(ws,si);
      if(!state[k+'done']) return;
      const perf = state[k+'perf'] ? JSON.parse(state[k+'perf']) : {};
      derniereSeanceInfo = {
        type: sess.type,
        titre: sess.d.split('|')[0],
        km: state[k+'km'] || sess.km,
        allure: perf.pace || null,
        fc: perf.hr || null,
        date: perf.date || null,
        semaine: ws,
        strava: perf.strava || null,
      };
      found = true;
    });
    if(derniereSeanceInfo) break;
  }

  // Alerte récupération
  let alerteRecup = null;
  if(derniereSeanceInfo && todaySessions.length > 0) {
    const s0 = todaySessions[0];
    const heureSeance = s0.heure ? parseInt(s0.heure.split(':')[0]) : 12;
    // Estimation simple basée sur le jour
    alerteRecup = (derniereSeanceInfo.type === 'tempo' || derniereSeanceInfo.type === 'frac') ? 'Séance intense hier → vérifier que 36h minimum écoulées avant EF' : null;
  }

  // Météo : seulement si permission déjà accordée (pas de dialog au réveil)
  const _meteoHeureMatin = todaySessions.length > 0 && todaySessions[0].heure
    ? todaySessions[0].heure
    : null;
  const meteoBrief = await fetchWeatherIfGranted(_meteoHeureMatin, todayStr);

  // ── Ajouter le renfo d'aujourd'hui ──
  const renfoAujourdHuiBrief = [];
  [{r:1,name:'Ischio-fessiers'},{r:2,name:'Bas du dos'}].forEach(rd => {
    const raw = state[rfk(CW,rd.r)+'sched'];
    if(!raw) return;
    let sched;
    try { sched = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { return; }
    console.log('[brief] renfoList', rd.r, 'sched:', JSON.stringify(sched), 'todaySched:', todaySched);
    if(sched && sched.day === todaySched && !state[rfk(CW,rd.r)+'done'])
      renfoAujourdHuiBrief.push({type:'renfo', titre:'Renfo '+rd.name, heure: sched.time||'', km: null});
  });
  console.log('[brief] toutesSeances:', JSON.stringify([...todaySessions, ...renfoAujourdHuiBrief]));
  const toutesSeancesAujourdHuiBrief = [...todaySessions, ...renfoAujourdHuiBrief];

  // ── Contexte STRICT — uniquement aujourd'hui, rien sur la semaine ──
  const fcCtxBrief = buildFcReposContext();
  const ctx = {
    type: 'brief_matin',
    date: todayStr,
    jour: joursNoms[todaySched] || '',
    // FC repos du jour
    fc_repos_bpm: state['fc_repos_' + todayStr] || state['fc_repos'] || null,
    fc_repos_moyenne_7j: fcCtxBrief.stats_7j ? fcCtxBrief.stats_7j.moyenne : null,
    fc_repos_alerte: fcCtxBrief.alerte_fatigue || null,
    // Météo
    meteo: meteoBrief ? {
      temperature: meteoBrief.temperature,
      conditions: meteoBrief.conditions,
      ressenti: meteoBrief.ressenti,
      vent_kmh: meteoBrief.vent_kmh,
      zone_ef_ajustee: meteoBrief.impact_performance ? meteoBrief.impact_performance.zone_ef_ajustee : null,
      elevation_fc_bpm: meteoBrief.impact_performance ? meteoBrief.impact_performance.elevation_fc_bpm : null,
      conseil_chaleur: meteoBrief.impact_performance && meteoBrief.impact_performance.elevation_fc_bpm > 0
        ? `Chaleur ${meteoBrief.temperature}°C : FC +${meteoBrief.impact_performance.elevation_fc_bpm} bpm. Zone EF effective : ${meteoBrief.impact_performance.zone_ef_ajustee||'143-154 bpm'}.`
        : null,
    } : null,
    // Séances du jour uniquement
    seances_du_jour: toutesSeancesAujourdHuiBrief.map(s => ({
      type: s.type,
      titre: s.titre,
      km: s.km || null,
      heure: s.heure || null,
      allure_cible: s.allure || null,
    })),
    // Consignes allure pour les séances du jour
    consignes_ef: [8,12,16,20,26,30].includes(CW)
      ? `Semaine DÉCHARGE : allure EF lente, FC < 140 bpm`
      : `Allure EF : ${getBestEfPace()||"6'40"}/km — FC 140-148 bpm`,
  };
  try {
    // ── Afficher le loader "Le Coach écrit" immédiatement ──
    const container = document.getElementById('coach-messages');
    const loader = document.createElement('div');
    loader.id = 'brief-loader';
    loader.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;';
    loader.innerHTML = '<div style="width:32px;height:32px;border-radius:50%;background:#0C447C;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span style="font-size:14px;">🤖</span></div>'
      + '<div style="background:#fff;border-radius:4px 14px 14px 14px;padding:10px 14px;border-left:3px solid rgba(12,68,124,0.15);">'
      + '<div class="coach-typing"><span>Le Coach prépare ton brief</span><div class="coach-typing-dots"><i></i><i></i><i></i></div></div>'
      + '</div>';
    if(container) { container.appendChild(loader); container.scrollTo({top:container.scrollHeight,behavior:'smooth'}); }

    const resp = await fetch('https://us-central1-prepa-marathon.cloudfunctions.net/morningBrief', {
      method:'POST',
      headers:await authHeaders(true),
      body: JSON.stringify({context: ctx})
    });

    // ── Collecter tout le stream silencieusement ──
    let full = '', buf = '';
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    while(true) {
      const {value, done} = await reader.read();
      if(done) break;
      buf += dec.decode(value, {stream:true});
      const lines = buf.split('\n'); buf = lines.pop();
      for(const line of lines) {
        if(!line.startsWith('data: ')) continue;
        const d = line.slice(6).trim();
        if(d==='[DONE]') continue;
        try { const token = JSON.parse(d)?.token||''; if(token) full+=token; } catch(e){}
      }
    }

    // ── Retirer le loader et afficher le message d'un coup ──
    if(loader && loader.parentNode) loader.remove();
    if(full) {
      addCoachMessage('coach', full);
      coachHistory.push({role:'assistant', content: full, date: new Date().toISOString().slice(0,10)});
      saveCoachHistory();
      try { await dbRef.child('_brief_pending').set({content: full, date: todayStr, type:'morning_brief'}); } catch(e){}
    }
    return true;
  } catch(e) { console.error('morningBrief error:', e); }
  return true;
}

async function loadCoachHistory(){
  const container = document.getElementById('coach-messages');
  if(!container){
 return; }
  if(window._coachInitDone){
 return; }
  window._coachInitDone = true;
  updateCoachHeader();
  const coachInp=document.getElementById('coach-input');
  if(coachInp&&!coachInp._placeholderSet){
    coachInp._placeholderSet=true;
    const phs=['Dis-moi tout Guillaume…','Une question sur ta prochaine séance ?',
      'Comment tu te sens aujourd’hui ?','On parle de ta semaine ?',
      'Pose-moi n’importe quelle question…'];
    let _pi=0;coachInp.placeholder=phs[0];
    setInterval(()=>{_pi=(_pi+1)%phs.length;if(document.activeElement!==coachInp)coachInp.placeholder=phs[_pi];},4000);
  }

  // Charger les mémos persistants
  let memos = '';
  try {
    const memoSnap = await dbRef.child('_coach_memos').once('value');
    if(memoSnap.val()) memos = memoSnap.val();
  } catch(e) {}

  // Vérifier d'abord si un brief push est en attente (priorité absolue, sans condition)
  const _pendingResult = await checkPendingBrief();
  // needs_full_brief : le serveur a envoyé la notif mais délègue la génération du brief complet au client
  const _needsFullBrief = _pendingResult && _pendingResult.needs_full_brief;
  // On mémorise si on vient d'une notif pour ne pas afficher le message de bienvenue parasite
  const _fromPushNotif = window._coachOpenedFromNotif || false;
  window._coachOpenedFromNotif = false; // reset
  if (_pendingResult && !_needsFullBrief) {
    try {
      const _h = await dbRef.child('_coach_history').once('value');
      if (_h.val()) coachHistory = JSON.parse(_h.val());
    } catch(e) {}
    let _memos = '';
    try { const _ms = await dbRef.child('_coach_memos').once('value'); _memos = _ms.val()||''; } catch(e) {}
    const _todayStr = new Date().toISOString().slice(0,10);
    try { await dbRef.child('_brief_matin_'+_todayStr).set(true); } catch(e){}
    // NE PAS supprimer _brief_pending ici — on le supprime APRÈS affichage réussi

    const _pendingType = _pendingResult.type || 'morning_brief';

    if (_pendingType === 'week_complete') {
      try { await dbRef.child('_brief_pending').remove(); } catch(e){}
      const _container = document.getElementById('coach-messages');
      if (_container) {
        const _div = document.createElement('div');
        _div.style.cssText = 'display:flex;justify-content:center;margin:8px 0 4px;';
        _div.innerHTML = '<button onclick="sendShortcut(&apos;📊 Fais-moi le bilan complet de ma semaine&apos;)" '
          + 'style="background:#0C447C;color:#fff;border:none;border-radius:20px;padding:9px 18px;'
          + 'font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">'
          + '📊 Voir le bilan complet</button>';
        _container.appendChild(_div);
        _container.scrollTop = _container.scrollHeight;
      }
      return;
    }

    // morning_brief / weekly_debrief : afficher le brief stocké
    if (_pendingType === 'morning_brief' || _pendingType === 'weekly_debrief') {
      if (_pendingResult.content) {
        // Attendre que le DOM coach soit totalement rendu
        await new Promise(r => setTimeout(r, 400));
        // Fonction d'affichage avec retry
        const _showBrief = () => {
          const _msgContainer = document.getElementById('coach-messages');
          if (!_msgContainer) return false;
          addCoachMessage('coach', _pendingResult.content);
          coachHistory.push({role:'assistant', content: _pendingResult.content, date: new Date().toISOString().slice(0,10)});
          saveCoachHistory();
          // Nettoyer après affichage réussi
          try { dbRef.child('_brief_pending').remove(); } catch(e){}
          delete state['_brief_pending'];
          return true;
        };
        if (!_showBrief()) {
          // Retry toutes les 300ms jusqu'à 5 tentatives
          let _tries = 0;
          const _retryInterval = setInterval(() => {
            _tries++;
            if (_showBrief() || _tries >= 5) clearInterval(_retryInterval);
          }, 300);
        } else {
          try { await dbRef.child('_brief_pending').remove(); } catch(e){}
          delete state['_brief_pending'];
        }
      }
      return;
    }
    // weekly_briefing → re-générer
    try { await dbRef.child('_brief_pending').remove(); } catch(e){}
    await generateFullBriefFromNotif(_memos);
    return;
  }

  // Charger l'historique
  try {
    const snap = await dbRef.child('_coach_history').once('value');
    if(snap.val()){
      coachHistory = JSON.parse(snap.val());

      // Message de bienvenue lundi matin / bilan dimanche soir
      const now = new Date();
      const isMonday = now.getDay() === 1;
      const isSunday = now.getDay() === 0;
      const isMorning = now.getHours() < 13;
      const isEvening = now.getHours() >= 17;
      const lastVisitKey = '_coach_last_visit';
      let lastVisit = '';
      try { const lv = await dbRef.child(lastVisitKey).once('value'); lastVisit = lv.val()||''; } catch(e) {}
      const todayStr = now.toISOString().slice(0,10);

      if(isMonday && isMorning && lastVisit !== todayStr) {
        try { dbRef.child(lastVisitKey).set(todayStr); } catch(e) {}

        // Construire le briefing semaine sans backticks
        const jours = ['','Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
        const seancesSemaine = [];
        weeks[CW-1].sessions.forEach((sess,si) => {
          if(state['del_w'+CW+'_s'+si]) return;
          const edRaw = state['edit_w'+CW+'_s'+si];
          const ed = edRaw ? JSON.parse(edRaw) : null;
          const titre = ed ? ed.d.split('|')[0] : sess.d.split('|')[0];
          const km = ed ? ed.km : sess.km;
          const jour = (ed && ed.sched_day) ? jours[ed.sched_day] : '';
          const heure = (ed && ed.sched_time) ? ed.sched_time : '';
          seancesSemaine.push(sess.type.toUpperCase()+' - '+titre+' '+km+'km'+(jour?' → '+jour:'')+(heure?' '+heure:''));
        });
        const kmTotal = getWeekTotalKm(CW);
        const isDechargeW = [8,12,16,20,26,30].includes(CW);
        // Données semaine précédente pour contexte IA
        let seancesPrecFaites = 0, seancesPrecTotal = 0;
        if(CW > 1){
          weeks[CW-2].sessions.forEach((sess,si)=>{
            if(sess.type==='rest') return;
            seancesPrecTotal++;
            if(state[gk(CW-1,si)+'done']) seancesPrecFaites++;
          });
        }
        const contextWeek = {
          semaine: CW,
          km_planifie: kmTotal,
          type_semaine: isDechargeW ? 'DÉCHARGE' : 'NORMALE',
          semaines_restantes: 32-CW,
          date_marathon: '18 octobre 2026',
          semi_marathon: CW >= 20 ? {date:'07/09/2026', semaine:27, km:21, semaines_avant:27-CW} : undefined,
          seances: seancesSemaine,
          bodyhit_lundi: 'lundi 12h30 — électrostimulation full body',
          renfo_semaine_precedente: CW>1 ? [1,2].filter(r=>!!state['rf'+(CW-1)+'r'+r+'done']).length+'/2 faits S'+(CW-1) : null,
          semaine_precedente: CW>1 ? {
            numero: CW-1,
            seances_faites: seancesPrecFaites,
            total: seancesPrecTotal,
            type: [8,12,16,20,26,30].includes(CW-1)?'DÉCHARGE':'CHARGE'
          } : null,
          semaine_suivante: CW < 32 ? {
            numero: CW+1,
            km: getWeekTotalKm(CW+1),
            type: [8,12,16,20,26,30].includes(CW+1)?'DÉCHARGE':'CHARGE'
          } : null,
          allure_ef_actuelle: getBestEfPace(),
          consignes_ef_semaine: [8,12,16,20,26,30].includes(CW)
            ? 'DÉCHARGE — allure EF entre '+(()=>{const s=paceStrToSec(getBestEfPace()||"6'40");return Math.floor((s+30)/60)+"'"+(((s+30)%60)+'').padStart(2,'0')+' et '+Math.floor((s+50)/60)+"'"+(((s+50)%60)+'').padStart(2,'0')})()+'  /km, FC < 140 bpm'
            : 'NORMALE — allure EF entre '+(()=>{const s=paceStrToSec(getBestEfPace()||"6'40");return Math.floor((s+20)/60)+"'"+(((s+20)%60)+'').padStart(2,'0')+' et '+Math.floor((s+40)/60)+"'"+(((s+40)%60)+'').padStart(2,'0')})()+'  /km, FC 140-148 bpm',
          prediction_marathon: buildPredictionForCoach(),
          allure_marathon_cible: (()=>{ const p=buildMarathonPrediction(); return p&&p.amPaceRecoStr ? p.amPaceRecoStr : getMarathonPaceStr(); })(),
          temps_marathon_estime: (()=>{ const p=buildMarathonPrediction(); return p&&p.tempsStr ? p.tempsStr : calcMarathonTime(getMarathonPaceStr()); })(),
          fc_repos: state['fc_repos'] || 51,
          fc_repos_context: buildFcReposContext(),
          chaussures: shoesSummary,
          memos: memos||undefined,
          bodyhit_semaine: (()=>{const _d=new Date();const _dow=_d.getDay()===0?7:_d.getDay();const _h=_d.getHours()+_d.getMinutes()/60;const _m=memos||'';const _rm=_m.match(/bodyhit[^,.]*?(lundi|mardi|mercredi|jeudi|vendredi)/i)||_m.match(/(lundi|mardi|mercredi|jeudi|vendredi)[^,.]*?bodyhit/i);const _jr=_rm?_rm[1].toLowerCase():null;const _jd={lundi:1,mardi:2,mercredi:3,jeudi:4,vendredi:5,samedi:6,dimanche:7};const _dw=_jr?_jd[_jr]:1;const _fait=_dow>_dw||(_dow===_dw&&_h>=12.5);return {fait:_fait,statut:_fait?'FAIT ('+(_jr||'lundi')+' 12h30)':'À VENIR ('+(_jr||'lundi')+' 12h30)',jour:_jr||'lundi',note:_jr?'Report détecté dans mémos: '+_jr:'Horaire normal lundi 12h30.'};})(),
          renfoStatus: [{r:1,name:'Ischio-fessiers'},{r:2,name:'Bas du dos'}].map(rd=>`${rd.name}: ${!!state[rfk(CW,rd.r)+'done']?'✓ fait':'à faire'}`).join(' | '),
          seances_supprimees: (()=>{const d=[];weeks[CW-1].sessions.forEach((s,si)=>{if(state['del_w'+CW+'_s'+si])d.push(s.d.split('|')[0]);});return d.length?d:null;})(),
    seances_recentes_detail: (()=>{const detail=[];for(let ws=CW; ws>=1; ws--){weeks[ws-1].sessions.forEach((sess,si)=>{const k=gk(ws,si);if(!state[k+"done"]) return;const perf=state[k+"perf"]?JSON.parse(state[k+"perf"]):{};const st=perf.strava||null;detail.push({semaine:ws,type:sess.type,titre:sess.d.split("|")[0],date:perf.date||null,km:state[k+"km"]||sess.km,allure:perf.pace||null,fc_moy:perf.hr||null,blocs_tempo:perf.blocsAllure||null,strava:st?{cadence_moy:st.cadence||st.cadence_moy||null,fc_max:st.fcMax||st.fc_max||null,denivele_pos:st.denivele_pos!=null?st.denivele_pos:null,best_400m:st.best_400m||null,calories:st.calories||null,splits_par_km:(st.splits||st.splits_par_km)?((st.splits||st.splits_par_km).filter(sp=>sp.distanceKm&&sp.distanceKm>=0.5).map(sp=>({km:sp.km,allure:sp.allure,fc:sp.fc}))):null}:null});});let ei=0;while(state["extra_w"+ws+"_s"+ei]){if(state["extra_w"+ws+"_s"+ei+"_done"]){const es=JSON.parse(state["extra_w"+ws+"_s"+ei]);const perf=state["extra_w"+ws+"_s"+ei+"_perf"]?JSON.parse(state["extra_w"+ws+"_s"+ei+"_perf"]):{};detail.push({semaine:ws,type:es.type,titre:es.d.split("|")[0],extra:true,date:perf.date||null,km:state["extra_w"+ws+"_s"+ei+"_km"]||es.km,allure:perf.pace||null,fc_moy:perf.hr||null,blocs_tempo:perf.blocsAllure||null,strava:null});}ei++;}}return detail.slice(0,30);})(),
          resume_dernieres_semaines: (()=>{const rs=[];for(let ws=Math.max(1,CW-8);ws<CW;ws++){const sess=[];let kF=0,kP=0;weeks[ws-1].sessions.forEach((s,si)=>{if(state['del_w'+ws+'_s'+si])return;const k=gk(ws,si);const done=!!state[k+'done'];const p=state[k+'perf']?JSON.parse(state[k+'perf']):{};const kr=state[k+'km']!=null?state[k+'km']:s.km;if(done)kF+=kr;kP+=s.km;sess.push(s.type+(done?(' '+kr+'km'+(p.pace?'@'+p.pace:'')+(p.hr?'FC'+p.hr:'')):(ws<CW?' NON_FAITE':' à_faire')));});let exi=0;while(state["extra_w"+ws+"_s"+exi]){const es=JSON.parse(state["extra_w"+ws+"_s"+exi]);if(es.km>0&&es.type!=='rest'){kP+=es.km;if(state["extra_w"+ws+"_s"+exi+"_done"]){const ekm=state["extra_w"+ws+"_s"+exi+"_km"]||es.km;kF+=ekm;const ep=state["extra_w"+ws+"_s"+exi+"_perf"]?JSON.parse(state["extra_w"+ws+"_s"+exi+"_perf"]):null;sess.push(es.type+' '+ekm+'km'+(ep&&ep.pace?'@'+ep.pace:''));}}exi++;}rs.push({semaine:ws,type:[8,12,16,20,26,30].includes(ws)?'DÉCHARGE':'CHARGE',km_fait:Math.round(kF*10)/10,km_plan:Math.round(kP*10)/10,renfo:[1,2].filter(r=>!!state['rf'+ws+'r'+r+'done']).length+'/2',seances:sess.join('|')});}return rs;})(),
          tendance_fc_ef: (()=>{const pts=[];for(let ws=Math.max(1,CW-6);ws<CW;ws++){weeks[ws-1].sessions.forEach((s,si)=>{if(s.type!=='ef')return;const k=gk(ws,si);const p=state[k+'perf']?JSON.parse(state[k+'perf']):null;if(p&&p.hr&&parseInt(p.hr)<=148)pts.push({ws,hr:parseInt(p.hr)});});}if(pts.length<3)return null;const f=pts.slice(0,3).reduce((a,b)=>a+b.hr,0)/3;const l=pts.slice(-3).reduce((a,b)=>a+b.hr,0)/3;const d=Math.round(l-f);return {tendance:d>3?'MONTANTE (+'+d+' bpm)':d<-3?'DESCENDANTE ('+d+' bpm)':'STABLE ('+d+' bpm)',nb:pts.length};})(),
          projection_sub4h: (()=>{const amSec=paceStrToSec(getMarathonPaceStr());const obj=Math.ceil(4*3600/42.195);return amSec?{ecart_sec:Math.round(amSec-obj),statut:amSec<=obj?'ATTEINT':amSec-obj<=10?'TRES_PROCHE':amSec-obj<=30?'DANS_CIBLE':'EN_COURS'}:null;})(),
          absences_semaine: state['absences_cw'+CW]||null,
          infos_importantes_Guillaume: memos||undefined
        };
        // Afficher un message provisoire pendant le chargement IA
        setCoachUnread();
        addCoachMessage('coach', 'Bonjour Guillaume ! Je prépare ton briefing S'+CW+'...');
        // Appel IA pour générer le message de bienvenue
        authHeaders(true).then(h=>fetch('https://us-central1-prepa-marathon.cloudfunctions.net/weeklyBriefing', {
          method: 'POST',
          headers: h,
          body: JSON.stringify({contextWeek})
        })).then(async response => {
          // Remplacer le message provisoire par le stream
          const container = document.getElementById('coach-messages');
          const lastMsg = container.lastElementChild;
          const textEl = lastMsg ? lastMsg.querySelector('[data-coach-text]') : null;
          if(textEl) textEl.textContent = '';
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let fullText = '', displayedText = '', tokenQueue = [], streamDone = false, buf = '';
          const MS = 18;
          function flush(){
            if(tokenQueue.length>0){const b=tokenQueue.length>20?3:1;for(let i=0;i<b&&tokenQueue.length>0;i++)displayedText+=tokenQueue.shift();if(textEl)textEl.innerHTML=renderCoachText(displayedText, true);if(container)container.scrollTop=container.scrollHeight;}
            if(!streamDone||tokenQueue.length>0)setTimeout(flush,MS);
            else if(textEl)textEl.innerHTML=renderCoachText(fixAccents(fullText));
          }
          setTimeout(flush,MS);
          while(true){
            const {done,value}=await reader.read();if(done)break;
            buf+=decoder.decode(value,{stream:true});
            const lines=buf.split('\n');buf=lines.pop();
            for(const line of lines){
              if(!line.startsWith('data: '))continue;
              const data=line.slice(6).trim();if(data==='[DONE]')continue;
              try{const p=JSON.parse(data);if(p.token){fullText+=p.token;for(const c of p.token)tokenQueue.push(c);}}catch(e){}
            }
          }
          streamDone=true;
          // Sauvegarder le briefing comme non lu jusqu'à ouverture Coach
          if(fullText) {
            coachHistory.push({role:'assistant', content: fullText, date: new Date().toISOString().slice(0,10)});
            saveCoachHistory();
            try { dbRef.child('_brief_pending').set({content: fullText, date: todayStr, type:'weekly_briefing'}); } catch(e){}
          }
        }).catch(()=>{
          const container=document.getElementById('coach-messages');
          const lastMsg=container?container.lastElementChild:null;
          const textEl=lastMsg?lastMsg.querySelector('[data-coach-text]'):null;
          const fallback='Bonne semaine S'+CW+' ! '+kmTotal+' km au programme. Des questions ?';
          if(textEl) textEl.textContent=fallback;
        });
      } else if(isSunday && isEvening && lastVisit !== todayStr) {
        // Bilan hebdomadaire dimanche soir — généré par l'IA
        try { dbRef.child(lastVisitKey).set(todayStr); } catch(e) {}
        let seancesFaites = 0, seancesTotal = 0, kmFaits = 0, kmPlan = 0, seancesManquees = [], seancesFaitesDetail = [];
        weeks[CW-1].sessions.forEach((sess,si) => {
          if(state['del_w'+CW+'_s'+si]) return;
          if(sess.type === 'rest') return;
          seancesTotal++;
          kmPlan += sess.km;
          const done = !!state[gk(CW,si)+'done'];
          const perf = state[gk(CW,si)+'perf'] ? JSON.parse(state[gk(CW,si)+'perf']) : null;
          if(done){
            seancesFaites++;
            kmFaits += state[gk(CW,si)+'km']||sess.km;
            seancesFaitesDetail.push({type:sess.type,titre:sess.d.split('|')[0],km:state[gk(CW,si)+'km']||sess.km,allure:perf?perf.pace:null,fc:perf?perf.hr:null});
          } else seancesManquees.push(sess.d.split('|')[0]);
        });
        // Inclure les séances extra validées cette semaine
        {let ei=0;while(state[`extra_w${CW}_s${ei}`]){
          const es=JSON.parse(state[`extra_w${CW}_s${ei}`]);
          if(es.type!=='rest'&&es.km>0){
            seancesTotal++;
            kmPlan+=es.km;
            if(state[`extra_w${CW}_s${ei}_done`]){
              seancesFaites++;
              const ekm=state[`extra_w${CW}_s${ei}_km`]||es.km;
              const eperf=state[`extra_w${CW}_s${ei}_perf`]?JSON.parse(state[`extra_w${CW}_s${ei}_perf`]):null;
              kmFaits+=ekm;
              seancesFaitesDetail.push({type:es.type,titre:es.d.split('|')[0],km:ekm,allure:eperf?eperf.pace:null,fc:eperf?eperf.hr:null,extra:true});
            }
          }
          ei++;
        }}
        const contextBilan = {
          semaine: CW,
          type_semaine: [8,12,16,20,26,30].includes(CW) ? 'DÉCHARGE' : 'CHARGE',
          date_marathon: '18 octobre 2026',
          semaines_restantes: 32-CW,
          semi_marathon: CW >= 20 ? {date:'07/09/2026', semaine:27, km:21, semaines_avant:27-CW} : undefined,
          seances_faites: seancesFaites,
          seances_total: seancesTotal,
          km_faits: Math.round(kmFaits*10)/10,
          km_plan: kmPlan,
          seances_manquees: seancesManquees,
          detail_seances: seancesFaitesDetail,
          renfo_semaine: [1,2].filter(r=>!!state[rfk(CW,r)+'done']).length + '/2 renfo faits',
          bodyhit_semaine_fait: (()=>{const _d=new Date();const _dow=_d.getDay()===0?7:_d.getDay();const _h=_d.getHours()+_d.getMinutes()/60;const _m=memos||'';const _rm=_m.match(/bodyhit[^,.]*?(lundi|mardi|mercredi|jeudi|vendredi)/i)||_m.match(/(lundi|mardi|mercredi|jeudi|vendredi)[^,.]*?bodyhit/i);const _jr=_rm?_rm[1].toLowerCase():null;const _jd={lundi:1,mardi:2,mercredi:3,jeudi:4,vendredi:5,samedi:6,dimanche:7};const _dw=_jr?_jd[_jr]:1;return _dow>_dw||(_dow===_dw&&_h>=12.5)?'OUI ('+(_jr||'lundi')+' 12h30)'+(_jr?' — report mémos':''):'NON';})(),
          semaine_suivante: CW < 32 ? {
            numero: CW+1,
            km: getWeekTotalKm(CW+1),
            type: [8,12,16,20,26,30].includes(CW+1)?'DÉCHARGE':'CHARGE',
            nb_seances: weeks[CW].sessions.length
          } : null,
          allure_ef_semaine: getBestEfPace(),
          prediction_marathon: buildPredictionForCoach(),
          allure_marathon_cible: (()=>{ const p=buildMarathonPrediction(); return p&&p.amPaceRecoStr ? p.amPaceRecoStr : getMarathonPaceStr(); })(),
          temps_marathon_estime: (()=>{ const p=buildMarathonPrediction(); return p&&p.tempsStr ? p.tempsStr : calcMarathonTime(getMarathonPaceStr()); })(),
          fc_repos: state['fc_repos'] || 51,
          fc_repos_context: buildFcReposContext(),
          chaussures: shoesSummary,
          memos: memos||undefined,
          seances_supprimees: (()=>{const d=[];weeks[CW-1].sessions.forEach((s,si)=>{if(state['del_w'+CW+'_s'+si])d.push(s.d.split('|')[0]);});return d.length?d:null;})(),
    seances_recentes_detail: (()=>{const detail=[];for(let ws=CW; ws>=1; ws--){weeks[ws-1].sessions.forEach((sess,si)=>{const k=gk(ws,si);if(!state[k+"done"]) return;const perf=state[k+"perf"]?JSON.parse(state[k+"perf"]):{};const st=perf.strava||null;detail.push({semaine:ws,type:sess.type,titre:sess.d.split("|")[0],date:perf.date||null,km:state[k+"km"]||sess.km,allure:perf.pace||null,fc_moy:perf.hr||null,blocs_tempo:perf.blocsAllure||null,strava:st?{cadence_moy:st.cadence||st.cadence_moy||null,fc_max:st.fcMax||st.fc_max||null,denivele_pos:st.denivele_pos!=null?st.denivele_pos:null,best_400m:st.best_400m||null,calories:st.calories||null,splits_par_km:(st.splits||st.splits_par_km)?((st.splits||st.splits_par_km).filter(sp=>sp.distanceKm&&sp.distanceKm>=0.5).map(sp=>({km:sp.km,allure:sp.allure,fc:sp.fc}))):null}:null});});let ei=0;while(state["extra_w"+ws+"_s"+ei]){if(state["extra_w"+ws+"_s"+ei+"_done"]){const es=JSON.parse(state["extra_w"+ws+"_s"+ei]);const perf=state["extra_w"+ws+"_s"+ei+"_perf"]?JSON.parse(state["extra_w"+ws+"_s"+ei+"_perf"]):{};detail.push({semaine:ws,type:es.type,titre:es.d.split("|")[0],extra:true,date:perf.date||null,km:state["extra_w"+ws+"_s"+ei+"_km"]||es.km,allure:perf.pace||null,fc_moy:perf.hr||null,blocs_tempo:perf.blocsAllure||null,strava:null});}ei++;}}return detail.slice(0,30);})(),
          resume_dernieres_semaines: (()=>{const rs=[];for(let ws=Math.max(1,CW-8);ws<CW;ws++){const sess=[];let kF=0,kP=0;weeks[ws-1].sessions.forEach((s,si)=>{if(state['del_w'+ws+'_s'+si])return;const k=gk(ws,si);const done=!!state[k+'done'];const p=state[k+'perf']?JSON.parse(state[k+'perf']):{};const kr=state[k+'km']!=null?state[k+'km']:s.km;if(done)kF+=kr;kP+=s.km;sess.push(s.type+(done?(' '+kr+'km'+(p.pace?'@'+p.pace:'')+(p.hr?'FC'+p.hr:'')):(ws<CW?' NON_FAITE':' à_faire')));});let exi=0;while(state["extra_w"+ws+"_s"+exi]){const es=JSON.parse(state["extra_w"+ws+"_s"+exi]);if(es.km>0&&es.type!=='rest'){kP+=es.km;if(state["extra_w"+ws+"_s"+exi+"_done"]){const ekm=state["extra_w"+ws+"_s"+exi+"_km"]||es.km;kF+=ekm;const ep=state["extra_w"+ws+"_s"+exi+"_perf"]?JSON.parse(state["extra_w"+ws+"_s"+exi+"_perf"]):null;sess.push(es.type+' '+ekm+'km'+(ep&&ep.pace?'@'+ep.pace:''));}}exi++;}rs.push({semaine:ws,type:[8,12,16,20,26,30].includes(ws)?'DÉCHARGE':'CHARGE',km_fait:Math.round(kF*10)/10,km_plan:Math.round(kP*10)/10,renfo:[1,2].filter(r=>!!state['rf'+ws+'r'+r+'done']).length+'/2',seances:sess.join('|')});}return rs;})(),
          allure_ef_actuelle: getBestEfPace(),
          consignes_ef_semaine: [8,12,16,20,26,30].includes(CW)?'DÉCHARGE — récup prioritaire':'NORMALE — '+getBestEfPace()+'/km FC 140-148',
          projection_sub4h: (()=>{const amSec=paceStrToSec(getMarathonPaceStr());const obj=Math.ceil(4*3600/42.195);return amSec?{ecart_sec:Math.round(amSec-obj),statut:amSec<=obj?'ATTEINT':amSec-obj<=10?'TRES_PROCHE':amSec-obj<=30?'DANS_CIBLE':'EN_COURS'}:null;})(),
          tendance_fc_ef: (()=>{const pts=[];for(let ws=Math.max(1,CW-6);ws<=CW;ws++){weeks[ws-1].sessions.forEach((s,si)=>{if(s.type!=='ef')return;const k=gk(ws,si);const p=state[k+'perf']?JSON.parse(state[k+'perf']):null;if(p&&p.hr&&parseInt(p.hr)<=148)pts.push({ws,hr:parseInt(p.hr)});});}if(pts.length<3)return null;const f=pts.slice(0,3).reduce((a,b)=>a+b.hr,0)/3;const l=pts.slice(-3).reduce((a,b)=>a+b.hr,0)/3;const d=Math.round(l-f);return {tendance:d>3?'MONTANTE (+'+d+' bpm)':d<-3?'DESCENDANTE ('+d+' bpm)':'STABLE ('+d+' bpm)',nb:pts.length};})(),
          absences_semaine: state['absences_cw'+CW]||null,
          infos_importantes_Guillaume: memos||undefined
        };
        setCoachUnread();
        addCoachMessage('coach', 'Bilan de ta semaine S'+CW+' en cours...');
        authHeaders(true).then(h=>fetch('https://us-central1-prepa-marathon.cloudfunctions.net/weeklyReport', {
          method: 'POST',
          headers: h,
          body: JSON.stringify({contextBilan})
        })).then(async response => {
          const container = document.getElementById('coach-messages');
          const lastMsg = container.lastElementChild;
          const textEl = lastMsg ? lastMsg.querySelector('[data-coach-text]') : null;
          if(textEl) textEl.textContent = '';
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let fullText = '', displayedText = '', tokenQueue = [], streamDone = false, buf = '';
          const MS = 18;
          function flushR(){
            if(tokenQueue.length>0){const b=tokenQueue.length>20?3:1;for(let i=0;i<b&&tokenQueue.length>0;i++)displayedText+=tokenQueue.shift();if(textEl)textEl.textContent=fixAccents(displayedText);if(container)container.scrollTop=container.scrollHeight;}
            if(!streamDone||tokenQueue.length>0)setTimeout(flushR,MS);
            else if(textEl)textEl.innerHTML=renderCoachText(fixAccents(fullText));
          }
          setTimeout(flushR,MS);
          while(true){
            const {done,value}=await reader.read();if(done)break;
            buf+=decoder.decode(value,{stream:true});
            const lines=buf.split('\n');buf=lines.pop();
            for(const line of lines){
              if(!line.startsWith('data: '))continue;
              const data=line.slice(6).trim();if(data==='[DONE]')continue;
              try{const p=JSON.parse(data);if(p.token){fullText+=p.token;for(const c of p.token)tokenQueue.push(c);}}catch(e){}
            }
          }
          streamDone=true;
          if(fullText) {
            coachHistory.push({role:'assistant', content: fullText, date: new Date().toISOString().slice(0,10)});
            saveCoachHistory();
            try { dbRef.child('_brief_pending').set({content: fullText, date: todayStr, type:'weekly_report'}); } catch(e){}
          }
        }).catch(()=>{
          const container=document.getElementById('coach-messages');
          const lastMsg=container?container.lastElementChild:null;
          const textEl=lastMsg?lastMsg.querySelector('[data-coach-text]'):null;
          if(textEl) textEl.textContent='Bonne semaine S'+CW+' ! '+seancesFaites+'/'+seancesTotal+' séances réalisées.';
        });
      } else {
        // Pas de lundi, pas dimanche : message normal sauf si on vient d'une notif
        if (!_fromPushNotif) {
          addCoachMessage('coach', 'Content de te retrouver ! Je me souviens de nos échanges. Que puis-je faire pour toi ?');
        }
      }
    } else {
      // Pas d'historique
      if (!_fromPushNotif) {
        addCoachMessage('coach', "Bonjour Guillaume ! Je suis ton coach IA. J'ai accès à tout ton plan et ton historique de séances. Pose-moi toutes tes questions sur ta prépa marathon !");
      }
    }
  } catch(e) {
    addCoachMessage('coach', "Bonjour Guillaume ! Je suis ton coach IA. Pose-moi toutes tes questions sur ta prépa marathon !");
  }
  // ── TOUJOURS vérifier le brief du matin en fin de loadCoachHistory ──
  // (sauf si un brief pending a déjà été affiché via checkPendingBrief)
  if (!_briefShownToday) {
    // force=true si on vient d'une notif (needs_full_brief ou _coachOpenedFromNotif)
    const _forceBrief = _needsFullBrief || _fromPushNotif;
    try { await checkMorningBrief(memos, _forceBrief); } catch(_e) {}
  }
}
// Afficher un overlay de chargement jusqu'à ce que Firebase soit prêt
// ── PUSH NOTIFICATIONS ────────────────────────────────────────────────────────
// Clé publique VAPID — à remplacer après avoir généré la paire de clés
// (voir instructions dans index.js)
const VAPID_PUBLIC_KEY = 'BBuZrddbAa1bRVH27VTuKV5cUpAVa6tOQ5oznjLHcQ0iQBJ5afidjJOLTSmebGdi1v2vdnnPjR022492YoIH4J0';

