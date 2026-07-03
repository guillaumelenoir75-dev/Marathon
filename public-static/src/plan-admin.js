function togglePwd(inputId, btn){
  const inp=document.getElementById(inputId);
  if(!inp) return;
  const show=inp.type==='password';
  inp.type=show?'text':'password';
  // Swap icon
  const svg=btn.querySelector('svg');
  if(svg) svg.innerHTML=show
    ?'<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
    :'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
}

function _askCurrentPassword(){
  return new Promise(resolve=>{
    const existing=document.getElementById('confirm-pwd-modal');
    if(existing) existing.remove();
    const overlay=document.createElement('div');
    overlay.id='confirm-pwd-modal';
    overlay.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
    overlay.innerHTML=`
    <div style="background:#fff;border-radius:22px;width:100%;max-width:340px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.2);">
      <div style="padding:24px 20px 16px;text-align:center;">
        <div style="font-size:36px;margin-bottom:10px;">🔒</div>
        <p style="font-size:17px;font-weight:800;color:#1a1a1a;margin-bottom:6px;">Confirme ton identité</p>
        <p style="font-size:13px;color:#888;margin-bottom:16px;">Entre ton mot de passe actuel pour valider les modifications.</p>
        <div style="position:relative;">
          <input id="cpwd-input" type="password" autocomplete="current-password" placeholder="Mot de passe actuel"
            style="width:100%;padding:12px 40px 12px 13px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:14px;outline:none;font-family:sans-serif;box-sizing:border-box;">
          <button type="button" onclick="togglePwd('cpwd-input',this)" tabindex="-1"
            style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#888;padding:2px;">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
        <p id="cpwd-err" style="font-size:12px;color:#DC2626;margin:6px 0 0;display:none;"></p>
      </div>
      <div style="display:flex;border-top:1px solid #f0f0f0;">
        <button id="cpwd-cancel" style="flex:1;padding:15px;background:#fff;border:none;border-right:1px solid #f0f0f0;font-size:14px;font-weight:600;color:#666;cursor:pointer;border-radius:0 0 0 22px;">Annuler</button>
        <button id="cpwd-ok" style="flex:1;padding:15px;background:#1B4FD8;border:none;font-size:14px;font-weight:700;color:#fff;cursor:pointer;border-radius:0 0 22px 0;">Valider</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    const input=document.getElementById('cpwd-input');
    setTimeout(()=>input?.focus(),100);
    document.getElementById('cpwd-cancel').onclick=()=>{overlay.remove();resolve(null);};
    const confirm=()=>{
      const v=input?.value||'';
      if(!v){const e=document.getElementById('cpwd-err');if(e){e.textContent='Entre ton mot de passe.';e.style.display='block';}return;}
      overlay.remove();resolve(v);
    };
    document.getElementById('cpwd-ok').onclick=confirm;
    input?.addEventListener('keydown',e=>{if(e.key==='Enter')confirm();});
  });
}

let _infoGender='';
function selectInfoGender(g){
  _infoGender=g;
  ['M','F'].forEach(x=>{
    const b=document.getElementById('info-gender-'+x);
    if(!b) return;
    const sel=x===g;
    b.style.borderColor=sel?'#1B4FD8':'#e0e0e0';
    b.style.background=sel?'#EBF0FF':'#f5f5f5';
    b.style.color=sel?'#1B4FD8':'#666';
  });
}

function openProfileModal(){
  const user=firebase.auth().currentUser;
  const existing=document.getElementById('profile-modal-overlay');
  if(existing) existing.remove();
  const ov=document.createElement('div');
  ov.id='profile-modal-overlay';
  ov.style.cssText='position:fixed;inset:0;z-index:800;background:rgba(0,0,0,0.45);display:flex;align-items:flex-end;justify-content:center;';
  const savedGender=state.gender||(isAdmin()?'M':null);
  _infoGender=savedGender||'';
  const gChip=(g)=>{
    const sel=savedGender===g;
    return `<button type="button" id="info-gender-${g}" onclick="selectInfoGender('${g}')" style="flex:1;padding:11px;border:2px solid ${sel?'#1B4FD8':'#e0e0e0'};border-radius:10px;font-size:13px;font-weight:600;background:${sel?'#EBF0FF':'#f5f5f5'};color:${sel?'#1B4FD8':'#666'};cursor:pointer;">${g==='M'?'🚹 Homme':'🚺 Femme'}</button>`;
  };
  const eyeIcon=`<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const pwdField=(id,label,ac)=>`<div style="position:relative;"><input id="${id}" type="password" autocomplete="${ac}" placeholder="${label}" style="width:100%;padding:11px 40px 11px 13px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:13px;outline:none;font-family:sans-serif;box-sizing:border-box;"><button type="button" onclick="togglePwd('${id}',this)" tabindex="-1" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#888;padding:2px;">${eyeIcon}</button></div>`;

  ov.innerHTML=`
  <div style="background:#f5f7fb;border-radius:24px 24px 0 0;width:100%;max-width:420px;box-sizing:border-box;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;">
    <!-- Handle + titre -->
    <div style="background:#fff;border-radius:24px 24px 0 0;padding:16px 20px 14px;flex-shrink:0;border-bottom:1px solid #f0f0f0;">
      <div style="width:36px;height:4px;border-radius:4px;background:#e0e0e0;margin:0 auto 14px;"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <p style="font-size:17px;font-weight:800;color:#1a1a1a;margin:0;">Mes informations</p>
        <button onclick="document.getElementById('profile-modal-overlay').remove()" style="background:#f5f5f5;border:none;width:32px;height:32px;border-radius:50%;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#666;">×</button>
      </div>
    </div>
    <!-- Body scrollable -->
    <div style="overflow-y:auto;flex:1;padding:16px;display:flex;flex-direction:column;gap:12px;">
      <!-- Profil -->
      <div style="background:#fff;border-radius:14px;padding:16px;border:1px solid #e8e8e8;">
        <p style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 12px;">Profil</p>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <input id="info-prenom" type="text" autocomplete="given-name" placeholder="Prénom"
            value="${(user?.displayName||'').replace(/"/g,'&quot;')}"
            style="width:100%;padding:11px 13px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:14px;outline:none;font-family:sans-serif;box-sizing:border-box;">
          <input id="info-email" type="email" autocomplete="email" placeholder="Adresse e-mail"
            value="${(user?.email||'').replace(/"/g,'&quot;')}"
            style="width:100%;padding:11px 13px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:14px;outline:none;font-family:sans-serif;box-sizing:border-box;">
          <div style="display:flex;gap:8px;">${gChip('M')}${gChip('F')}</div>
          <button onclick="saveProfileInfo()" style="padding:12px;background:#1B4FD8;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;">Enregistrer le profil</button>
          <p id="info-msg" style="font-size:12px;margin:0;display:none;"></p>
        </div>
      </div>
      <!-- Mot de passe -->
      <div style="background:#fff;border-radius:14px;padding:16px;border:1px solid #e8e8e8;">
        <p style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 12px;">Mot de passe</p>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${pwdField('pwd-current','Mot de passe actuel','current-password')}
          ${pwdField('pwd-new','Nouveau mot de passe (min. 6 caractères)','new-password')}
          ${pwdField('pwd-confirm','Confirmer le nouveau mot de passe','new-password')}
          <button onclick="changePassword()" style="padding:12px;background:#1a1a1a;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;">Changer le mot de passe</button>
          <p id="pwd-msg" style="font-size:12px;margin:0;display:none;"></p>
        </div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove();});
}

async function saveProfileInfo(){
  const user=firebase.auth().currentUser;
  const msgEl=document.getElementById('info-msg');
  const prenom=(document.getElementById('info-prenom')?.value||'').trim();
  const email=(document.getElementById('info-email')?.value||'').trim();
  const gender=_infoGender||state.gender||null;
  if(!email){if(msgEl){msgEl.textContent='L\'email est requis.';msgEl.style.color='#e53e3e';msgEl.style.display='block';}return;}
  if(msgEl) msgEl.style.display='none';
  try{
    const pwd=await _askCurrentPassword();
    if(!pwd) return;
    const cred=firebase.auth.EmailAuthProvider.credential(user.email, pwd);
    await user.reauthenticateWithCredential(cred);
    if(prenom!==user.displayName) await user.updateProfile({displayName:prenom||null});
    if(email!==user.email) await user.updateEmail(email);
    if(gender){state.gender=gender;if(dbRef) await dbRef.child('gender').set(gender).catch(()=>{});}
    document.getElementById('profile-modal-overlay')?.remove();
    renderCompteScreen();
  }catch(e){
    if(msgEl){msgEl.textContent='Erreur : '+e.message;msgEl.style.color='#e53e3e';msgEl.style.display='block';}
  }
}

async function changePassword(){
  const current=(document.getElementById('pwd-current')?.value||'').trim();
  const nw=(document.getElementById('pwd-new')?.value||'').trim();
  const conf=(document.getElementById('pwd-confirm')?.value||'').trim();
  const msg=document.getElementById('pwd-msg');
  const show=(txt,ok)=>{if(msg){msg.textContent=txt;msg.style.color=ok?'#2d7d46':'#e53e3e';msg.style.display='block';}};
  if(!current||!nw||!conf){show('Remplis tous les champs.',false);return;}
  if(nw.length<6){show('Le mot de passe doit faire au moins 6 caractères.',false);return;}
  if(nw!==conf){show('Les mots de passe ne correspondent pas.',false);return;}
  try{
    const user=firebase.auth().currentUser;
    const cred=firebase.auth.EmailAuthProvider.credential(user.email,current);
    await user.reauthenticateWithCredential(cred);
    await user.updatePassword(nw);
    document.getElementById('pwd-current').value='';
    document.getElementById('pwd-new').value='';
    document.getElementById('pwd-confirm').value='';
    show('✅ Mot de passe modifié !',true);
    setTimeout(()=>document.getElementById('profile-modal-overlay')?.remove(),1500);
  }catch(e){
    const msg2=e.code==='auth/wrong-password'?'Mot de passe actuel incorrect.'
      :e.code==='auth/too-many-requests'?'Trop de tentatives. Réessaie plus tard.'
      :'Erreur : '+e.message;
    show(msg2,false);
  }
}

let _adminSavedState=null, _adminSavedDbRef=null;
let _adminPreviewUid=null, _adminPreviewName=null;

function _refreshAthleteCoachView(){
  const body=document.getElementById('coach-view-body');
  if(!body) return;
  body.innerHTML='';
  renderAthletePlan(body);
}

function closeAthleteCoachView(){
  const ov=document.getElementById('coach-view-overlay');
  if(ov) ov.style.display='none';
  if(_adminSavedState!==null){ state=_adminSavedState; _adminSavedState=null; }
  if(_adminSavedDbRef!==null){ dbRef=_adminSavedDbRef; _adminSavedDbRef=null; }
  _adminPreviewUid=null;
}

async function openAthleteCoachView(uid, name){
  let ov=document.getElementById('coach-view-overlay');
  if(!ov){
    ov=document.createElement('div');
    ov.id='coach-view-overlay';
    ov.style.cssText='position:fixed;top:0;left:50%;transform:translateX(-50%);width:100%;max-width:390px;height:100%;z-index:400;background:#EDF2FB;display:flex;flex-direction:column;overflow:hidden;';
    document.getElementById('app').appendChild(ov);
  }
  ov.style.display='flex';
  ov.innerHTML=`
    <div style="background:#0C447C;padding:16px 20px;padding-top:calc(16px + env(safe-area-inset-top,0px));color:#fff;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
      <div>
        <div style="font-size:16px;font-weight:700;">${name}</div>
        <div style="font-size:12px;opacity:0.7;">Vue plan</div>
      </div>
      <button onclick="closeAthleteCoachView()" style="background:rgba(255,255,255,0.15);border:none;border-radius:50%;width:34px;height:34px;color:#fff;font-size:18px;cursor:pointer;flex-shrink:0;">✕</button>
    </div>
    <div id="coach-view-body" style="flex:1;overflow-y:auto;padding:16px;">
      <p style="text-align:center;color:#888;padding:40px 0;">Chargement…</p>
    </div>`;

  try {
    const token=await getAuthToken();
    const resp=await fetch(FUNCTIONS_BASE+'/dbAdmin',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({action:'read',path:`users/${uid}`})
    });
    const json=await resp.json();
    if(!resp.ok) throw new Error(`Erreur serveur ${resp.status}: ${json.error||'inconnue'}`);
    const data=json.data;
    const athleteState=(data||{}).state||{};
    // Sauvegarder et remplacer state + dbRef pour que save() écrive chez l'athlète
    _adminSavedState=state;
    _adminSavedDbRef=dbRef;
    _adminPreviewUid=uid;
    _adminPreviewName=name;
    state=athleteState;
    dbRef=firebase.database().ref('users/'+uid+'/state');
    _refreshAthleteCoachView();
  } catch(e){
    document.getElementById('coach-view-body').innerHTML=`<p style="color:#e53e3e;padding:20px;">Erreur : ${e.message}</p>`;
  }
}

// Contexte courant de la vue coach (pour les actions d'édition)
let _cvUid=null, _cvState=null, _cvName=null;

function renderAthleteCoachView(userData, uid, name){
  _cvUid=uid; _cvName=name; _cvState=userData.state||{};
  const body=document.getElementById('coach-view-body');
  if(!body) return;
  const ob=_cvState.onboarding||{};

  // Profil
  const kmLabel={10:'< 15 km',20:'15–25 km',30:'25–35 km',40:'> 35 km'};
  const kmDisplay = v => kmLabel[v] || (v && !isNaN(v) ? v+' km' : v || '—');
  let html=`<div style="background:#fff;border-radius:14px;padding:16px;margin-bottom:16px;border:1px solid #e0e8f5;">
    <p style="font-size:13px;font-weight:700;color:#0C447C;margin:0 0 12px;">Profil</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">
      <div><span style="color:#888;">Course</span><br><b>${ob.course||'—'}</b></div>
      <div><span style="color:#888;">Date course</span><br><b>${ob.date?new Date(ob.date).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'}):'—'}</b></div>
      <div><span style="color:#888;">Séances/sem</span><br><b>${ob.sessions||'—'}</b></div>
      <div><span style="color:#888;">Niveau</span><br><b>${ob.niveau||'—'}</b></div>
      <div><span style="color:#888;">Km actuels</span><br><b>${kmDisplay(ob.km_semaine)}</b></div>
      <div><span style="color:#888;">Plan généré</span><br><b>${ob.generate_plan==='oui'?'✅ Oui':'Non'}</b></div>
    </div>
  </div>`;

  // Construire le plan depuis extra_w{ws}_s{ei}
  const weekData={};
  Object.keys(_cvState).forEach(k=>{
    const m=k.match(/^extra_w(\d+)_s(\d+)$/);
    if(!m) return;
    const w=parseInt(m[1]),si=parseInt(m[2]);
    if(!weekData[w]) weekData[w]={sessions:[],kmPlan:0,done:0,kmDone:0};
    try{
      const s=JSON.parse(_cvState[k]);
      const done=!!_cvState[`extra_w${w}_s${si}_done`];
      const kmDone=parseFloat(_cvState[`extra_w${w}_s${si}_km`]||0)||0;
      const perf=_cvState[`extra_w${w}_s${si}_perf`]?JSON.parse(_cvState[`extra_w${w}_s${si}_perf`]):{};
      weekData[w].sessions.push({s,si,done,kmDone,perf});
      weekData[w].kmPlan+=parseFloat(s.km)||0;
      if(done){weekData[w].done++;weekData[w].kmDone+=kmDone;}
    }catch(e){}
  });

  const weeks=Object.keys(weekData).map(Number).sort((a,b)=>a-b);
  const typeColor={ef:'#1E4A09',tempo:'#9A2D00',frac:'#7A0000',long:'#2A2070'};
  const typeLabel={ef:'EF',tempo:'Tempo',frac:'Frac',long:'Long'};

  if(weeks.length===0){
    html+=`<div style="background:#fff;border-radius:14px;padding:20px;text-align:center;color:#888;border:1px solid #e0e0e0;margin-bottom:12px;">Aucun plan</div>`;
  } else {
    html+=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <p style="font-size:12px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em;margin:0;">Plan — ${weeks.length} semaines</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        <button onclick="cvRegeneratePlan()" style="background:#EBF0FF;border:1px solid #b3c5f5;border-radius:8px;padding:5px 11px;font-size:12px;font-weight:600;color:#1B4FD8;cursor:pointer;">🔄 Mettre à jour</button>
        <button onclick="openRegenFromDateModal()" style="background:#FFF7ED;border:1px solid #fed7aa;border-radius:8px;padding:5px 11px;font-size:12px;font-weight:600;color:#C2610A;cursor:pointer;">📅 Regen. date</button>
        <button onclick="cvDeletePlan()" style="background:#fff0f0;border:1px solid #ffcdd2;border-radius:8px;padding:5px 11px;font-size:12px;font-weight:600;color:#c0392b;cursor:pointer;">🗑 Supprimer</button>
      </div>
    </div>`;
    weeks.forEach(w=>{
      const wd=weekData[w];
      const allDone=wd.done===wd.sessions.length&&wd.sessions.length>0;
      // Sessions triées par si
      const sorted=[...wd.sessions].sort((a,b)=>a.si-b.si);
      html+=`<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:10px;border:1px solid ${allDone?'#c6f0d0':'#e0e0e0'};">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-size:13px;font-weight:700;">Semaine ${w}</span>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:12px;color:${allDone?'#2d7d46':'#888'};">${allDone?'✅':wd.done>0?wd.done+'/'+wd.sessions.length+' ✓':'À faire'} · ${wd.kmPlan} km</span>
            <button onclick="cvAddSession(${w})" style="background:#EBF0FF;border:none;border-radius:8px;padding:4px 8px;font-size:11px;font-weight:700;color:#1B4FD8;cursor:pointer;">+ Séance</button>
          </div>
        </div>
        ${sorted.map(({s,si,done,kmDone,perf})=>{
          const col=typeColor[s.type]||'#333';
          const lbl=typeLabel[s.type]||s.type;
          return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid #f5f5f5;">
            <span style="background:${col}22;color:${col};font-size:10px;font-weight:700;padding:3px 7px;border-radius:6px;flex-shrink:0;">${lbl}</span>
            <span style="flex:1;font-size:13px;">${(s.d||'').split('|')[0]} · <b>${s.km} km</b></span>
            ${done?`<span style="font-size:11px;color:#2d7d46;">✓ ${kmDone}km${perf.pace?' · '+perf.pace:''}</span>`:''}
            <button onclick="cvEditSession(${w},${si})" style="background:#f5f5f5;border:none;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;flex-shrink:0;">✏️</button>
            ${!done?`<button onclick="cvDeleteSession(${w},${si})" style="background:none;border:none;font-size:14px;cursor:pointer;color:#ccc;flex-shrink:0;">✕</button>`:''}
          </div>`;
        }).join('')}
      </div>`;
    });
  }
  // Bouton ajouter semaine
  const nextW=(weeks.length>0?Math.max(...weeks):0)+1;
  html+=`<button onclick="cvAddWeek(${nextW})" style="width:100%;padding:13px;background:#fff;border:1.5px dashed #1B4FD8;border-radius:12px;font-size:13px;font-weight:600;color:#1B4FD8;cursor:pointer;margin-bottom:24px;">+ Ajouter une semaine (S${nextW})</button>`;
  body.innerHTML=html;
}

// ── Helper : construit les updates de régénération de plan ───────────────────
// Décale les clés du nouveau plan pour ne jamais écraser les semaines déjà réalisées.
// Exemple : si w1 est done (15 juin), le nouveau plan (22 juin) sera stocké à partir de w2.
function _buildPlanUpdates(st, newPlan){
  // 1. Collecter TOUTES les sessions done (clé + données) — elles ne seront jamais touchées
  const doneSessions={}; // key → valeur de la session
  Object.keys(st).forEach(k=>{
    if(/^extra_w\d+_s\d+_done$/.test(k)&&st[k]){
      const sk=k.replace(/_done$/,'');
      doneSessions[sk]=st[sk]; // peut être undefined si la session elle-même est absente
    }
  });
  const doneSessionKeys=new Set(Object.keys(doneSessions));

  // Numéro de semaine max parmi les done (0 si aucune)
  const maxDoneWeek=doneSessionKeys.size>0
    ?Math.max(...[...doneSessionKeys].map(k=>parseInt(k.match(/extra_w(\d+)/)?.[1])||0))
    :0;

  // 2. Décaler toutes les clés numérotées du nouveau plan (extra_wN_*, meta_wN)
  const shift=maxDoneWeek;
  const shiftedPlan={};
  Object.keys(newPlan).forEach(k=>{
    const m=k.match(/^(extra_w|meta_w)(\d+)(.*)$/);
    if(m){
      shiftedPlan[`${m[1]}${parseInt(m[2])+shift}${m[3]}`]=newPlan[k];
    } else if(k==='plan_config'){
      try{
        const cfg=typeof newPlan[k]==='string'?JSON.parse(newPlan[k]):newPlan[k];
        cfg.numWeeks=(cfg.numWeeks||0)+shift;
        shiftedPlan[k]=JSON.stringify(cfg);
      }catch(e){shiftedPlan[k]=newPlan[k];}
    } else {
      shiftedPlan[k]=newPlan[k];
    }
  });

  const shiftedSessionKeys=new Set(Object.keys(shiftedPlan).filter(k=>/^extra_w\d+_s\d+$/.test(k)));
  const updates={};

  // 3. Clés meta/config du plan décalé
  Object.keys(shiftedPlan).forEach(k=>{
    if(!/^extra_w\d+_s\d+$/.test(k)) updates[k]=shiftedPlan[k];
  });

  // 4. Sessions futures (décalées) : écrire — elles ne chevauchent jamais les done
  shiftedSessionKeys.forEach(k=>{
    if(!doneSessionKeys.has(k)) updates[k]=shiftedPlan[k];
  });

  // 5. Supprimer les anciennes sessions non-réalisées absentes du nouveau plan
  Object.keys(st).filter(k=>/^extra_w\d+_s\d+$/.test(k)).forEach(k=>{
    if(doneSessionKeys.has(k)) return; // JAMAIS supprimer une session done
    if(!shiftedSessionKeys.has(k)) updates[k]=null;
  });

  // 6. Filet de sécurité : s'assurer que toutes les sessions done sont bien présentes
  doneSessionKeys.forEach(k=>{
    if(updates[k]===null||updates[k]===undefined){
      // Restaurer depuis l'état si accidentellement marquée pour suppression
      if(doneSessions[k]!=null) updates[k]=doneSessions[k];
      else delete updates[k]; // ne pas écrire null
    }
  });

  const nbUpdated=Object.values(updates).filter(v=>v!==null&&/^\{/.test(String(v))).length;
  return {updates, nbUpdated, nbKept:doneSessionKeys.size};
}

// ── Mise à jour du plan athlète (conserve les séances déjà réalisées) ────────
async function cvRegeneratePlan(){
  const hasPlan=Object.keys(state).some(k=>/^extra_w\d+_s\d+$/.test(k));
  if(!hasPlan){ alert('Aucun plan à mettre à jour.'); return; }

  await new Promise(resolve=>{
    _showConfirmModal({
      icon:'🔄',
      title:`Mettre à jour le plan de ${_adminPreviewName||'cet athlète'} ?`,
      message:'Les séances déjà réalisées seront conservées. Les séances à venir seront recalculées avec les dernières améliorations du programme.',
      confirmLabel:'Mettre à jour',
      confirmStyle:'background:#0C447C;color:#fff;',
      onConfirm:resolve,
    });
  });

  let ob=state.onboarding;
  if(typeof ob==='string'){try{ob=JSON.parse(ob);}catch(e){ob={};}}
  ob=ob||{};
  if(!ob.course){ alert('Données onboarding introuvables.'); return; }

  const newPlan=generateAthletePlan(ob);
  const {updates,nbUpdated,nbKept}=_buildPlanUpdates(state,newPlan);

  await dbRef.update(updates).catch(e=>alert('Erreur : '+e.message));
  Object.keys(updates).forEach(k=>{ if(updates[k]===null) delete state[k]; else state[k]=updates[k]; });
  _refreshAthleteCoachView();

  // Modal de succès
  const _sov=document.createElement('div');
  _sov.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
  _sov.innerHTML=`
  <div style="background:#fff;border-radius:22px;width:100%;max-width:340px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.25);">
    <div style="padding:28px 24px 24px;text-align:center;">
      <div style="width:64px;height:64px;border-radius:50%;background:#EBF8F0;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <p style="font-size:18px;font-weight:800;color:#1a1a1a;margin-bottom:10px;letter-spacing:-0.02em;">Plan mis à jour !</p>
      <p style="font-size:14px;color:#555;line-height:1.6;">
        <span style="display:inline-block;background:#EBF0FF;color:#1B4FD8;font-weight:700;border-radius:8px;padding:3px 10px;font-size:13px;margin-bottom:8px;">${nbUpdated} séance${nbUpdated>1?'s':''} recalculée${nbUpdated>1?'s':''}</span>
        ${nbKept>0?`<br><span style="font-size:12px;color:#888;">· ${nbKept} séance${nbKept>1?'s':''} réalisée${nbKept>1?'s':''} conservée${nbKept>1?'s':''}</span>`:''}
      </p>
    </div>
    <div style="border-top:1px solid #f0f0f0;">
      <button id="regen-ok-btn" style="width:100%;padding:16px;background:#fff;border:none;font-size:15px;font-weight:700;color:#1B4FD8;cursor:pointer;border-radius:0 0 22px 22px;">Fermer</button>
    </div>
  </div>`;
  document.body.appendChild(_sov);
  const _closeS=()=>_sov.remove();
  document.getElementById('regen-ok-btn').onclick=_closeS;
  _sov.onclick=e=>{if(e.target===_sov)_closeS();};
}

// ── Régénérer le plan à partir d'une date choisie ────────────────────────────
function openRegenFromDateModal(){
  const hasPlan=Object.keys(state).some(k=>/^extra_w\d+_s\d+$/.test(k));
  if(!hasPlan){ alert('Aucun plan à régénérer.'); return; }

  // Date par défaut = prochain lundi
  const t=new Date(); t.setHours(0,0,0,0);
  const dow=t.getDay(); const offset=dow===0?1:8-dow;
  const defDate=new Date(t); defDate.setDate(t.getDate()+offset);
  const defIso=defDate.toISOString().split('T')[0];

  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.5);display:flex;align-items:flex-end;justify-content:center;padding-bottom:env(safe-area-inset-bottom,0px);';
  ov.innerHTML=`
  <div style="background:#fff;border-radius:22px 22px 0 0;width:100%;max-width:390px;padding:24px 20px 32px;box-sizing:border-box;">
    <div style="width:36px;height:4px;background:#e0e0e0;border-radius:2px;margin:0 auto 20px;"></div>
    <p style="font-size:18px;font-weight:800;color:#1a1a1a;margin:0 0 6px;">📅 Régénérer à partir de...</p>
    <p style="font-size:13px;color:#666;margin:0 0 20px;line-height:1.5;">Choisis une date de début pour régénérer le plan. Les séances déjà réalisées seront conservées.</p>
    <div style="margin-bottom:16px;">
      <p style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Date de début</p>
      <input id="regen-start-date" type="date" value="${defIso}" style="width:100%;padding:12px;border:1.5px solid #d0dff5;border-radius:10px;font-size:16px;font-weight:600;color:#1a1a1a;box-sizing:border-box;" oninput="_regenDateLabel()">
      <p id="regen-date-label" style="font-size:13px;color:#1B4FD8;font-weight:600;margin-top:8px;"></p>
    </div>
    <div style="display:flex;gap:10px;">
      <button id="regen-cancel-btn" style="flex:1;padding:14px;background:#f5f5f5;border:none;border-radius:12px;font-size:14px;font-weight:700;color:#555;cursor:pointer;">Annuler</button>
      <button id="regen-confirm-btn" style="flex:2;padding:14px;background:#E8530A;border:none;border-radius:12px;font-size:14px;font-weight:700;color:#fff;cursor:pointer;">Régénérer →</button>
    </div>
  </div>`;
  document.body.appendChild(ov);

  function _regenDateLabel(){
    const el=document.getElementById('regen-start-date');
    const lbl=document.getElementById('regen-date-label');
    if(!el||!el.value||!lbl){return;}
    const d=new Date(el.value+'T00:00:00'); const dw=d.getDay();
    const mon=new Date(d); mon.setDate(d.getDate()+(dw===0?-6:1-dw));
    lbl.textContent='→ Plan débutera le lundi '+mon.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
  }
  _regenDateLabel();

  const _close=()=>ov.remove();
  document.getElementById('regen-cancel-btn').onclick=_close;
  ov.onclick=e=>{if(e.target===ov)_close();};
  document.getElementById('regen-confirm-btn').onclick=async()=>{
    const dateVal=document.getElementById('regen-start-date')?.value;
    if(!dateVal){alert('Sélectionne une date.');return;}
    _close();
    let ob=state.onboarding;
    if(typeof ob==='string'){try{ob=JSON.parse(ob);}catch(e){ob={};}}
    ob=ob||{};
    if(!ob.course){alert('Données onboarding introuvables.');return;}
    ob={...ob,plan_start_date:dateVal};
    const newPlan=generateAthletePlan(ob);
    const {updates,nbUpdated,nbKept}=_buildPlanUpdates(state,newPlan);
    const targetRef=_adminPreviewUid?firebase.database().ref('users/'+_adminPreviewUid+'/state'):dbRef;
    await targetRef.update(updates).catch(e=>alert('Erreur : '+e.message));
    Object.keys(updates).forEach(k=>{if(updates[k]===null)delete state[k];else state[k]=updates[k];});
    if(_adminPreviewUid) _refreshAthleteCoachView(); else{renderHome();renderPlan();}
    // Succès
    const sv=document.createElement('div');
    sv.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
    sv.innerHTML=`<div style="background:#fff;border-radius:22px;width:100%;max-width:340px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.25);"><div style="padding:28px 24px 24px;text-align:center;"><div style="font-size:40px;margin-bottom:12px;">📅</div><p style="font-size:18px;font-weight:800;color:#1a1a1a;margin-bottom:10px;">Plan régénéré !</p><p style="font-size:14px;color:#555;">${nbUpdated} séance${nbUpdated>1?'s':''} recalculée${nbUpdated>1?'s':''}${nbKept>0?` · ${nbKept} réalisée${nbKept>1?'s':''} conservée${nbKept>1?'s':''}`:''}</p></div><div style="border-top:1px solid #f0f0f0;"><button onclick="this.closest('div[style]').parentElement.remove()" style="width:100%;padding:16px;background:#fff;border:none;font-size:15px;font-weight:700;color:#1B4FD8;cursor:pointer;">Fermer</button></div></div>`;
    document.body.appendChild(sv);
  };
}

// ── Mise à jour de TOUS les plans athlètes ───────────────────────────────────
async function adminUpdateAllPlans(){
  // Confirmation
  await new Promise(resolve=>{
    _showConfirmModal({
      icon:'🔄',
      title:'Mettre à jour tous les plans ?',
      message:'Les plans de tous les athlètes seront recalculés avec les dernières améliorations. Les séances déjà réalisées sont conservées.',
      confirmLabel:'Mettre à jour',
      confirmStyle:'background:#0C447C;color:#fff;',
      onConfirm:resolve
    });
  });

  // Modal de progression
  const _pov=document.createElement('div');
  _pov.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
  _pov.innerHTML=`
  <div style="background:#fff;border-radius:22px;width:100%;max-width:340px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.25);">
    <div style="padding:28px 24px 24px;text-align:center;">
      <div style="font-size:36px;margin-bottom:12px;">🔄</div>
      <p style="font-size:17px;font-weight:800;color:#1a1a1a;margin-bottom:8px;">Mise à jour en cours…</p>
      <p id="aup-status" style="font-size:13px;color:#666;margin-bottom:16px;">Chargement des athlètes…</p>
      <div style="background:#f0f0f0;border-radius:8px;height:6px;overflow:hidden;">
        <div id="aup-bar" style="height:100%;background:#1B4FD8;border-radius:8px;width:0%;transition:width 0.3s;"></div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(_pov);
  const setStatus=(txt,pct)=>{
    const s=document.getElementById('aup-status');if(s)s.textContent=txt;
    const b=document.getElementById('aup-bar');if(b)b.style.width=pct+'%';
  };

  try {
    // 1. Charger la liste des athlètes
    const token=await getAuthToken();
    const resp=await fetch(FUNCTIONS_BASE+'/listUsers',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:'{}'});
    const users=await resp.json();
    const athletes=Array.isArray(users)?users.filter(u=>u.role!=='admin'):[];

    let nbDone=0, nbSkipped=0, nbErrors=0, totalUpdated=0, totalKept=0;

    for(let i=0;i<athletes.length;i++){
      const u=athletes[i];
      setStatus(`${u.displayName||u.email||u.uid} (${i+1}/${athletes.length})…`, Math.round((i/athletes.length)*90));
      try {
        // Lire le state de l'athlète
        const dr=await fetch(FUNCTIONS_BASE+'/dbAdmin',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
          body:JSON.stringify({action:'read',path:`users/${u.uid}/state`})});
        const drJson=await dr.json();
        const st=drJson.data;
        if(!st||typeof st!=='object'){nbSkipped++;continue;}

        // Vérifier qu'il y a un plan et des données onboarding
        const hasPlan=Object.keys(st).some(k=>/^extra_w\d+_s\d+$/.test(k));
        if(!hasPlan){nbSkipped++;continue;}
        let ob=st.onboarding;
        if(typeof ob==='string'){try{ob=JSON.parse(ob);}catch(e){ob={};}}
        if(!ob||!ob.course){nbSkipped++;continue;}

        // Générer le nouveau plan et construire les updates (décalage automatique)
        const newPlan=generateAthletePlan(ob);
        const {updates,nbUpdated:nu,nbKept:nk}=_buildPlanUpdates(st,newPlan);

        // Écrire en DB via dbAdmin
        const writeResp=await fetch(FUNCTIONS_BASE+'/dbAdmin',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
          body:JSON.stringify({action:'update',path:`users/${u.uid}/state`,value:updates})});
        const writeData=await writeResp.json();
        if(writeData.error) throw new Error(writeData.error);

        totalUpdated+=nu;
        totalKept+=nk;
        nbDone++;
      } catch(e){nbErrors++;console.warn('adminUpdateAllPlans: erreur pour '+u.uid, e);}
    }

    _pov.remove();

    // Modal de succès
    const _sov=document.createElement('div');
    _sov.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
    _sov.innerHTML=`
    <div style="background:#fff;border-radius:22px;width:100%;max-width:340px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.25);">
      <div style="padding:28px 24px 24px;text-align:center;">
        <div style="width:64px;height:64px;border-radius:50%;background:#EBF8F0;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <p style="font-size:18px;font-weight:800;color:#1a1a1a;margin-bottom:12px;letter-spacing:-0.02em;">Tous les plans mis à jour !</p>
        <div style="display:flex;flex-direction:column;gap:6px;text-align:left;background:#f7f8fa;border-radius:12px;padding:12px 16px;font-size:13px;">
          <div style="display:flex;justify-content:space-between;"><span style="color:#555;">Athlètes mis à jour</span><span style="font-weight:700;color:#1B4FD8;">${nbDone}</span></div>
          ${nbSkipped>0?`<div style="display:flex;justify-content:space-between;"><span style="color:#555;">Sans plan (ignorés)</span><span style="font-weight:700;color:#888;">${nbSkipped}</span></div>`:''}
          ${nbErrors>0?`<div style="display:flex;justify-content:space-between;"><span style="color:#555;">Erreurs</span><span style="font-weight:700;color:#e53e3e;">${nbErrors}</span></div>`:''}
          <div style="display:flex;justify-content:space-between;border-top:1px solid #e8e8e8;padding-top:6px;margin-top:2px;"><span style="color:#555;">Séances recalculées</span><span style="font-weight:700;color:#1B4FD8;">${totalUpdated}</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="color:#555;">Séances conservées</span><span style="font-weight:700;color:#3B6D11;">${totalKept}</span></div>
        </div>
      </div>
      <div style="border-top:1px solid #f0f0f0;">
        <button id="aup-ok-btn" style="width:100%;padding:16px;background:#fff;border:none;font-size:15px;font-weight:700;color:#1B4FD8;cursor:pointer;border-radius:0 0 22px 22px;">Fermer</button>
      </div>
    </div>`;
    document.body.appendChild(_sov);
    const _close=()=>_sov.remove();
    document.getElementById('aup-ok-btn').onclick=_close;
    _sov.onclick=e=>{if(e.target===_sov)_close();};
  } catch(e){
    _pov.remove();
    alert('Erreur : '+e.message);
  }
}

// ── Suppression du plan athlète ───────────────────────────────────────────────
async function cvDeletePlan(){
  const hasPlan=Object.keys(state).some(k=>/^extra_w\d+_s\d+$/.test(k));
  if(!hasPlan) return;
  await new Promise(resolve=>{
    _showConfirmModal({
      icon:'🗑️',
      title:`Supprimer le plan de ${_adminPreviewName||'cet athlète'} ?`,
      message:'Toutes les séances planifiées seront effacées. Cette action est irréversible.',
      confirmLabel:'Supprimer',
      confirmStyle:'background:#DC2626;color:#fff;',
      onConfirm:resolve,
    });
  });
  const keysToDelete=Object.keys(state).filter(k=>/^extra_w/.test(k)||/^_last_validation_w/.test(k)||k==='plan_start_date');
  keysToDelete.forEach(k=>delete state[k]);
  const updates={};
  keysToDelete.forEach(k=>{ updates[k]=null; });
  await dbRef.update(updates).catch(()=>{});
  _refreshAthleteCoachView();
}

// ── Édition séance coach view ─────────────────────────────────────────────────
function cvEditSession(w, si){
  const key=`extra_w${w}_s${si}`;
  let s={}; try{s=JSON.parse(_cvState[key]||'{}');}catch(e){}
  const parts=(s.d||'').split('|');
  const title=parts[0]||'';
  const detail=parts[1]||'';
  _cvShowSessionModal({w,si,title,detail,km:s.km||0,type:s.type||'ef',isNew:false});
  // Préremplir le champ detail après le rendu
  setTimeout(()=>{const el=document.getElementById('cv-s-detail');if(el)el.value=detail;},50);
}

function cvAddSession(w){
  if(!_cvState) return;
  // Trouver le prochain index libre
  let si=0;
  while(si<=20&&_cvState[`extra_w${w}_s${si}`]) si++;
  _cvShowSessionModal({w,si,title:'',km:0,type:'ef',isNew:true});
}

function cvAddWeek(w){
  // Ouvre le modal en mode "nouvelle semaine" — on peut choisir la semaine et ajouter la 1ère séance
  _cvShowSessionModal({w,si:0,title:'',km:0,type:'ef',isNew:true,newWeek:true});
}

function _cvTypeHeaderStyle(type){
  const cfg={
    ef:{bg:'linear-gradient(135deg,#1E4A09,#2d6b12)',accent:'#3B6D11',icon:'🟢',label:'Endurance Fondamentale'},
    tempo:{bg:'linear-gradient(135deg,#7a1a00,#b83000)',accent:'#E8530A',icon:'🔥',label:'Tempo / Intervalles'},
    frac:{bg:'linear-gradient(145deg,#7A0000,#C4141B,#E03030)',accent:'#C4141B',icon:'⚡',label:'Fractionné'},
    long:{bg:'linear-gradient(135deg,#1a1660,#3a2ea0)',accent:'#534AB7',icon:'💜',label:'Sortie Longue EF'},
    race:{bg:'linear-gradient(135deg,#6b4a00,#b38000)',accent:'#C4960A',icon:'🏁',label:'Course'},
    rest:{bg:'linear-gradient(135deg,#444,#666)',accent:'#888',icon:'😴',label:'Repos'},
  };
  return cfg[type]||cfg.ef;
}

function _cvShowSessionModal({w,si,title,km,type,isNew,newWeek}){
  // Calculer les semaines disponibles pour le sélecteur
  const existingWeeks=new Set();
  Object.keys(_cvState||{}).forEach(k=>{const m=k.match(/^extra_w(\d+)_s\d+$/);if(m)existingWeeks.add(parseInt(m[1]));});
  const nextW=(existingWeeks.size>0?Math.max(...existingWeeks):0)+1;
  const allWeeks=[...Array.from(existingWeeks).sort((a,b)=>a-b),(existingWeeks.has(nextW)?null:nextW)].filter(Boolean);

  let modal=document.getElementById('cv-session-modal');
  if(!modal){
    modal=document.createElement('div');
    modal.id='cv-session-modal';
    modal.style.cssText='position:fixed;inset:0;z-index:900;background:rgba(0,0,0,0.5);display:flex;align-items:flex-end;justify-content:center;';
    document.getElementById('app').appendChild(modal);
  }
  modal.style.display='flex';

  const cfg=_cvTypeHeaderStyle(type||'ef');
  const typeChips=['ef','tempo','frac','long','race'].map(t=>{
    const c=_cvTypeHeaderStyle(t);
    const sel=(type||'ef')===t;
    return `<button type="button" onclick="_cvPickType('${t}')" id="cv-chip-${t}" style="padding:8px 14px;border-radius:20px;font-size:12px;font-weight:700;border:2px solid ${sel?c.accent:'#e0e0e0'};background:${sel?c.accent+'18':'#f5f5f5'};color:${sel?c.accent:'#666'};cursor:pointer;transition:all 0.15s;">${c.icon} ${c.label.split(' ')[0]}</button>`;
  }).join('');

  const weekSelect=isNew?`
    <div style="margin-bottom:16px;">
      <p style="font-size:11px;font-weight:800;color:#666;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Semaine</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">${allWeeks.map(wk=>`<button type="button" onclick="_cvPickWeek(${wk})" id="cv-wk-${wk}" style="padding:7px 13px;border-radius:20px;font-size:13px;font-weight:700;border:2px solid ${wk===w?'#1B4FD8':'#e0e0e0'};background:${wk===w?'#EBF0FF':'#f5f5f5'};color:${wk===w?'#1B4FD8':'#666'};cursor:pointer;">S${wk}</button>`).join('')}</div>
    </div>`:
    `<p style="font-size:12px;color:#888;font-weight:600;margin-bottom:16px;">Semaine ${w}</p>`;

  modal.innerHTML=`
  <div style="background:#fff;border-radius:24px 24px 0 0;width:100%;max-width:420px;box-sizing:border-box;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;">
    <!-- Header coloré -->
    <div id="cv-modal-header" style="background:${cfg.bg};padding:20px 20px 16px;flex-shrink:0;border-radius:24px 24px 0 0;">
      <div style="width:36px;height:4px;border-radius:4px;background:rgba(255,255,255,0.35);margin:0 auto 14px;"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <p style="font-size:10px;font-weight:800;opacity:0.75;letter-spacing:0.1em;text-transform:uppercase;color:#fff;margin-bottom:4px;">${isNew?'Nouvelle séance':'Modifier la séance'}</p>
          <p id="cv-modal-label" style="font-size:20px;font-weight:900;color:#fff;letter-spacing:-0.02em;">${cfg.icon} ${cfg.label}</p>
        </div>
        <button onclick="document.getElementById('cv-session-modal').style.display='none'" style="background:rgba(255,255,255,0.25);border:none;color:#fff;font-size:20px;line-height:1;width:36px;height:36px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>
      </div>
    </div>

    <!-- Body scrollable -->
    <div style="padding:20px;overflow-y:auto;flex:1;">
      ${weekSelect}

      <!-- Type chips -->
      <p style="font-size:11px;font-weight:800;color:#666;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Type de séance</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:18px;">${typeChips}</div>

      <!-- Titre -->
      <p style="font-size:11px;font-weight:800;color:#666;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Titre</p>
      <input id="cv-s-title" placeholder="ex: Séance EF, Tempo 2×8 min…" value="${title.replace(/"/g,'&quot;')}"
        style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #e0e0e0;border-radius:12px;font-size:15px;outline:none;margin-bottom:16px;font-family:inherit;">

      <!-- Structure (detail) -->
      <p style="font-size:11px;font-weight:800;color:#666;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Structure / détail <span style="font-weight:400;text-transform:none;">(optionnel)</span></p>
      <input id="cv-s-detail" placeholder="ex: 5'10 — 5'30/km · 8 EF · 3 AM @ 5'40/km" value=""
        style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #e0e0e0;border-radius:12px;font-size:14px;outline:none;margin-bottom:16px;font-family:inherit;color:#555;">

      <!-- km -->
      <p style="font-size:11px;font-weight:800;color:#666;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Distance (km)</p>
      <input id="cv-s-km" type="number" min="1" max="60" step="0.5" placeholder="0" value="${km||''}"
        style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #e0e0e0;border-radius:12px;font-size:22px;font-weight:700;outline:none;margin-bottom:24px;text-align:center;">

      <!-- Boutons -->
      <div style="display:flex;gap:10px;">
        <button onclick="document.getElementById('cv-session-modal').style.display='none'" style="flex:1;padding:14px;background:#f5f5f5;border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;">Annuler</button>
        <button onclick="cvSaveSession()" style="flex:2;padding:14px;background:#1B4FD8;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;">Enregistrer</button>
      </div>
    </div>
  </div>`;

  // Stocker contexte courant dans le modal
  modal._cvW=w; modal._cvSi=si; modal._cvIsNew=isNew; modal._cvType=type||'ef';
}

function _cvPickType(t){
  const modal=document.getElementById('cv-session-modal');
  if(!modal) return;
  modal._cvType=t;
  ['ef','tempo','frac','long','race'].forEach(x=>{
    const btn=document.getElementById('cv-chip-'+x);
    if(!btn) return;
    const c=_cvTypeHeaderStyle(x);
    const sel=x===t;
    btn.style.borderColor=sel?c.accent:'#e0e0e0';
    btn.style.background=sel?c.accent+'18':'#f5f5f5';
    btn.style.color=sel?c.accent:'#666';
  });
  // Mettre à jour le header
  const cfg=_cvTypeHeaderStyle(t);
  const hdr=document.getElementById('cv-modal-header');
  if(hdr) hdr.style.background=cfg.bg;
  const lbl=document.getElementById('cv-modal-label');
  if(lbl) lbl.textContent=cfg.icon+' '+cfg.label;
}

function _cvPickWeek(wk){
  if(!_cvState) return;
  const modal=document.getElementById('cv-session-modal');
  if(!modal) return;
  const prev=modal._cvW;
  modal._cvW=wk;
  // Recalculer si pour la nouvelle semaine
  let si=0;
  while(si<=20&&_cvState[`extra_w${wk}_s${si}`]) si++;
  modal._cvSi=si;
  // Mettre à jour les boutons
  document.querySelectorAll('[id^="cv-wk-"]').forEach(btn=>{
    const bwk=parseInt(btn.id.replace('cv-wk-',''));
    const sel=bwk===wk;
    btn.style.borderColor=sel?'#1B4FD8':'#e0e0e0';
    btn.style.background=sel?'#EBF0FF':'#f5f5f5';
    btn.style.color=sel?'#1B4FD8':'#666';
  });
}

async function cvSaveSession(){
  if(!_cvState) return;
  const modal=document.getElementById('cv-session-modal');
  const w=modal?._cvW||0;
  const si=modal?._cvSi||0;
  const type=modal?._cvType||'ef';
  const title=(document.getElementById('cv-s-title')?.value||'').trim();
  const detail=(document.getElementById('cv-s-detail')?.value||'').trim();
  const km=parseFloat(document.getElementById('cv-s-km')?.value)||0;
  if(!title||!km){alert('Titre et km obligatoires.');return;}
  const key=`extra_w${w}_s${si}`;
  const fullTitle=detail?`${title}|${detail}`:title;
  const val=JSON.stringify({d:fullTitle,km,type,shoe:null});
  _cvState[key]=val;
  if(modal) modal.style.display='none';
  // Sauvegarder dans Firebase
  try{
    const token=await getAuthToken();
    await fetch(FUNCTIONS_BASE+'/dbAdmin',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({action:'write',path:`users/${_cvUid}/state/${key}`,value:val})});
  }catch(e){alert('Erreur sauvegarde : '+e.message);return;}
  renderAthleteCoachView({state:_cvState},_cvUid,_cvName);
}

async function cvDeleteSession(w, si){
  if(!_cvState) return;
  if(!confirm('Supprimer cette séance ?')) return;
  const suffixesCv=['','_done','_km','_perf','_skip','_skip_reason'];
  suffixesCv.forEach(suf=>delete _cvState[`extra_w${w}_s${si}${suf}`]);
  // Renuméroter les séances suivantes pour combler le trou
  let i=si+1;
  while(i<=20&&_cvState[`extra_w${w}_s${i}`]!==undefined){
    suffixesCv.forEach(suf=>{
      const val=_cvState[`extra_w${w}_s${i}${suf}`];
      if(val!==undefined){_cvState[`extra_w${w}_s${i-1}${suf}`]=val;}
      else{delete _cvState[`extra_w${w}_s${i-1}${suf}`];}
      delete _cvState[`extra_w${w}_s${i}${suf}`];
    });
    i++;
  }
  // Sauvegarder dans Firebase : réécrire tout le state de l'user
  try{
    const token=await getAuthToken();
    await fetch(FUNCTIONS_BASE+'/dbAdmin',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({action:'write',path:`users/${_cvUid}/state`,value:_cvState})});
  }catch(e){alert('Erreur : '+e.message);return;}
  renderAthleteCoachView({state:_cvState},_cvUid,_cvName);
}

function renderAthletePanel(){
  const panel=document.getElementById('athlete-panel');
  if(!panel) return;
  panel.style.display=currentUserRole==='athlete'?'block':'none';
  if(currentUserRole!=='athlete') return;
  let ob=state.onboarding;
  if(typeof ob==='string'){try{ob=JSON.parse(ob);}catch(e){ob={};}}
  ob=ob||{};
  const content=document.getElementById('athlete-profile-content');
  if(!content) return;
  if(!ob.course && !ob.date && !ob.sessions){
    content.innerHTML='<p style="color:#888;font-style:italic;">Profil non renseigné.</p>';
    return;
  }
  const kmLabel={10:'< 15 km',20:'15–25 km',30:'25–35 km',40:'> 35 km'};
  const kmDisplay = v => kmLabel[v] || (v && !isNaN(v) ? v+' km' : v || '—');
  const fcMax=state.fc_max||null;
  const fcZone=getFcMaxZone();
  const rows=[
    {label:'Course',value:ob.course||'—'},
    {label:'Date',value:ob.date?new Date(ob.date).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}):'Non définie'},
    {label:'Séances / semaine',value:ob.sessions||'—'},
    {label:'Niveau',value:ob.niveau||'—'},
    {label:'Km actuels / semaine',value:kmDisplay(ob.km_semaine)},
    {label:'Programme généré',value:ob.generate_plan==='oui'?'✅ Oui':ob.generate_plan==='non'?'Non (manuel)':'—'},
  ];
  const fcRow=`<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f0f0f0;">
    <span style="color:#888;">❤️ FC max</span>
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="font-weight:700;color:#1a1a1a;" id="profile-fcmax-display">${fcMax?fcMax+' bpm'+(fcZone?' → zone EF: '+fcZone.min+'–'+fcZone.max+' bpm':''):'Non renseignée'}</span>
      <button onclick="openFcMaxEdit()" style="background:#EBF0FF;border:none;border-radius:8px;padding:3px 8px;font-size:11px;font-weight:600;color:#1B4FD8;cursor:pointer;">Modifier</button>
    </div>
  </div>`;
  const renfoProgOptions=Object.entries(RENFO_PROGRAMS).map(([id,p])=>`<option value="${id}">${p.name}</option>`).join('');
  const renfoSection=`<div style="padding:12px 0;border-bottom:1px solid #f0f0f0;">
    <div style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">💪 Programme renforcement</div>
    <div style="display:flex;flex-direction:column;gap:10px;">
      ${[1,2].map(slot=>`<div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:12px;color:#888;white-space:nowrap;min-width:58px;">Séance ${slot}</span>
        <select id="renfo-prog${slot}-sel" onchange="saveRenfoProg(${slot},this.value)" style="flex:1;padding:8px 10px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:13px;font-weight:600;color:#1a1a1a;background:#fff;cursor:pointer;">
          ${renfoProgOptions}
        </select>
      </div>`).join('')}
    </div>
  </div>`;
  content.innerHTML=rows.map(r=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0;"><span style="color:#888;">${r.label}</span><span style="font-weight:700;color:#1a1a1a;">${r.value}</span></div>`).join('')+fcRow+renfoSection;
  // Restaurer les sélections depuis l'état
  setTimeout(()=>{[1,2].forEach(slot=>{const s=document.getElementById('renfo-prog'+slot+'-sel');if(s)s.value=String(state['renfo_prog'+slot]||slot);});},0);
  // Afficher le bouton supprimer uniquement si un plan existe
  const hasPlan=Object.keys(state).some(k=>/^extra_w\d+_s\d+$/.test(k));
  const delBtn=document.getElementById('btn-delete-plan');
  const genBtn=document.getElementById('btn-generate-plan');
  const regenBtn=document.getElementById('btn-regen-from-date');
  if(delBtn) delBtn.style.display=hasPlan?'block':'none';
  if(genBtn) genBtn.style.display=hasPlan?'none':'block';
  if(regenBtn) regenBtn.style.display=hasPlan?'block':'none';
}

function openFcMaxEdit(){
  const cur=state.fc_max||'';
  const overlay=document.createElement('div');
  overlay.id='fcmax-overlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:500;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML=`<div style="background:#fff;border-radius:20px;padding:24px;width:min(340px,90vw);display:flex;flex-direction:column;gap:16px;">
    <p style="font-size:17px;font-weight:800;margin:0;">Modifier la FC max</p>
    <div>
      <p style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;">FC max connue (bpm)</p>
      <input id="fcmax-edit-val" type="number" min="140" max="220" value="${cur}" placeholder="185" style="width:100%;padding:12px;border:1.5px solid #d0dff5;border-radius:10px;font-size:20px;font-weight:700;text-align:center;box-sizing:border-box;">
    </div>
    <p style="font-size:12px;color:#888;margin:0;">Ou calcul automatique : <b>220 − âge</b></p>
    <div>
      <p style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;">Mon âge</p>
      <input id="fcmax-edit-age" type="number" min="10" max="90" placeholder="35" style="width:100%;padding:12px;border:1.5px solid #d0dff5;border-radius:10px;font-size:20px;font-weight:700;text-align:center;box-sizing:border-box;" oninput="const a=parseInt(this.value);if(a>=10&&a<=90){document.getElementById('fcmax-edit-val').value=220-a;}">
    </div>
    <div style="display:flex;gap:10px;">
      <button onclick="document.getElementById('fcmax-overlay').remove()" style="flex:1;padding:13px;background:#f5f5f5;border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;">Annuler</button>
      <button onclick="saveFcMax(parseInt(document.getElementById('fcmax-edit-val').value));document.getElementById('fcmax-overlay').remove();" style="flex:1;padding:13px;background:#1B4FD8;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;">Enregistrer</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
}

async function saveRenfoProg(slot,progId){
  const id=parseInt(progId)||slot;
  state['renfo_prog'+slot]=id;
  if(dbRef) await dbRef.child('renfo_prog'+slot).set(id).catch(()=>{});
  renderHome(); // synchroniser l'accueil immédiatement
}

async function saveFcMax(fc){
  if(!fc||fc<100||fc>220){alert('Valeur invalide (100–220 bpm).');return;}
  state.fc_max=fc;
  if(dbRef) await dbRef.child('fc_max').set(fc).catch(()=>{});
  renderAthletePanel();
}

async function deleteAthletePlan(){
  const hasPlan=Object.keys(state).some(k=>/^extra_w\d+_s\d+$/.test(k));
  if(!hasPlan) return;
  await new Promise(resolve=>{
    _showConfirmModal({
      icon:'🗑️',
      title:'Supprimer le plan ?',
      message:'Toutes les séances planifiées seront effacées. Cette action est irréversible.',
      confirmLabel:'Supprimer',
      confirmStyle:'background:#DC2626;color:#fff;',
      onConfirm:resolve,
    });
  });
  // Toutes les clés liées au plan
  const planKeyPatterns=[
    k=>/^extra_w/.test(k),               // séances, done, km, perf
    k=>/^_last_validation_w/.test(k),     // timestamps de validation
    k=>k==='plan_start_date',             // date de début du plan
  ];
  const keysToDelete=Object.keys(state).filter(k=>planKeyPatterns.some(fn=>fn(k)));
  keysToDelete.forEach(k=>delete state[k]);
  if(dbRef){
    const updates={};
    keysToDelete.forEach(k=>{ updates[k]=null; });
    await dbRef.update(updates).catch(()=>{});
  }
  rendered.plan=false;
  renderAthletePanel();
  renderPlan();
  renderHome();
}

