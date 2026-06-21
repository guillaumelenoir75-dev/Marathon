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
    const targetBloc = auLieuIdx>0
      ? (blocsMatches.filter(m=>m.index<auLieuIdx).at(-1) || blocsMatches[0])
      : blocsMatches[0];
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

