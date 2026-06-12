function showLoginScreen(msg){
  let lo=document.getElementById('loading-overlay');
  if(!lo){
    lo=document.createElement('div');
    lo.id='loading-overlay';
    lo.style.cssText='position:fixed;inset:0;background:#fff;z-index:9999;display:flex;align-items:center;justify-content:center;';
    document.body.appendChild(lo);
  }
  lo.innerHTML=`<form id="login-form" onsubmit="loginWithEmail();return false;" style="text-align:center;padding:32px 24px;font-family:sans-serif;max-width:360px;width:100%;">
    <div style="font-size:44px;margin-bottom:12px;">🏃</div>
    <p style="font-size:20px;font-weight:700;color:#1B4FD8;margin:0 0 6px;">En Piste</p>
    <p style="font-size:13px;color:#888;margin:0 0 28px;">${msg||'Connecte-toi pour accéder à ton plan'}</p>
    <input id="login-email" type="email" name="email" placeholder="Adresse e-mail" autocomplete="username"
      style="width:100%;padding:13px 14px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:14px;margin-bottom:10px;box-sizing:border-box;outline:none;font-family:sans-serif;">
    <div style="position:relative;margin-bottom:18px;">
      <input id="login-password" type="password" name="password" placeholder="Mot de passe" autocomplete="current-password"
        style="width:100%;padding:13px 44px 13px 14px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:14px;box-sizing:border-box;outline:none;font-family:sans-serif;">
      <button type="button" onclick="togglePwd('login-password',this)" tabindex="-1"
        style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;padding:4px;color:#888;">
        <svg id="eye-login" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      </button>
    </div>
    <button type="submit"
      style="width:100%;padding:14px;background:#1B4FD8;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;font-family:sans-serif;">
      Se connecter
    </button>
    <p id="login-error" style="font-size:12px;color:#e53e3e;margin-top:14px;display:none;"></p>
  </form>`;
}

function loginWithEmail(){
  const email=(document.getElementById('login-email')?.value||'').trim();
  const password=document.getElementById('login-password')?.value||'';
  const errEl=document.getElementById('login-error');
  if(!email||!password){
    if(errEl){errEl.textContent='Remplis tous les champs.';errEl.style.display='block';}
    return;
  }
  const btn=document.querySelector('#loading-overlay button');
  if(btn){btn.textContent='Connexion...';btn.disabled=true;}
  firebase.auth().signInWithEmailAndPassword(email,password).catch(e=>{
    if(btn){btn.textContent='Se connecter';btn.disabled=false;}
    if(errEl){
      errEl.textContent=(e.code==='auth/invalid-credential'||e.code==='auth/wrong-password'||e.code==='auth/user-not-found'||e.code==='auth/invalid-email')
        ?'Email ou mot de passe incorrect.':'Erreur de connexion. Réessaie.';
      errEl.style.display='block';
    }
  });
}

function hideLoginScreen(){
  const lo=document.getElementById('loading-overlay');
  if(lo) lo.remove();
}

function applyRoleUI(){
  const navCoach=document.getElementById('nav-coach');
  const scCoach=document.getElementById('sc-coach');
  const calSec=document.getElementById('stats-calories-section');
  const gelSec=document.getElementById('stats-gels-section');
  if(!isAdmin()){
    if(navCoach) navCoach.style.display='none';
    if(scCoach) scCoach.style.display='none';
    if(calSec) calSec.style.display='none';
    if(gelSec) gelSec.style.display='none';
  } else {
    if(navCoach) navCoach.style.display='';
    if(calSec) calSec.style.display='';
    if(gelSec) gelSec.style.display='';
  }
}

function _showConfirmModal({icon,title,message,confirmLabel,confirmStyle,onConfirm}){
  const existing=document.getElementById('confirm-modal-overlay');
  if(existing) existing.remove();
  const overlay=document.createElement('div');
  overlay.id='confirm-modal-overlay';
  overlay.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
  overlay.innerHTML=`
  <div style="background:#fff;border-radius:22px;width:100%;max-width:340px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.25);">
    <div style="padding:28px 24px 20px;text-align:center;">
      <div style="font-size:42px;margin-bottom:14px;">${icon}</div>
      <p style="font-size:18px;font-weight:800;color:#1a1a1a;margin-bottom:10px;letter-spacing:-0.02em;">${title}</p>
      <p style="font-size:14px;color:#666;line-height:1.5;">${message}</p>
    </div>
    <div style="display:flex;gap:0;border-top:1px solid #f0f0f0;">
      <button id="cm-cancel" style="flex:1;padding:16px;background:#fff;border:none;border-right:1px solid #f0f0f0;font-size:14px;font-weight:600;color:#666;cursor:pointer;border-radius:0 0 0 22px;">Annuler</button>
      <button id="cm-confirm" style="flex:1;padding:16px;border:none;font-size:14px;font-weight:700;cursor:pointer;border-radius:0 0 22px 0;${confirmStyle}">${confirmLabel}</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  const close=()=>overlay.remove();
  document.getElementById('cm-cancel').onclick=close;
  overlay.onclick=e=>{if(e.target===overlay)close();};
  document.getElementById('cm-confirm').onclick=()=>{close();onConfirm();};
}

function getPrefs(){
  try{ return JSON.parse(state._prefs||'{}'); }catch(e){ return {}; }
}
function savePrefs(prefs){
  state._prefs=JSON.stringify(prefs);
  if(dbRef) dbRef.child('_prefs').set(state._prefs).catch(()=>{});
}
function getPref(key, defaultVal=true){
  const p=getPrefs();
  if(p[key]!==undefined) return p[key];
  // FC repos et VO2max désactivés par défaut pour les athlètes
  if(!isAdmin()&&(key==='show_fc_repos'||key==='show_vo2max')) return false;
  return defaultVal;
}

function openPrefsModal(){
  const existing=document.getElementById('prefs-modal-overlay');
  if(existing) existing.remove();
  const ov=document.createElement('div');
  ov.id='prefs-modal-overlay';
  ov.style.cssText='position:fixed;inset:0;z-index:800;background:rgba(0,0,0,0.45);display:flex;align-items:flex-end;justify-content:center;';
  const p=getPrefs();
  const tog=(key,defaultVal=true)=>{
    const on=p[key]!==undefined?p[key]:defaultVal;
    return `<div onclick="togglePref('${key}',${defaultVal})" style="width:44px;height:26px;border-radius:13px;background:${on?'#1B4FD8':'#D1D5DB'};position:relative;cursor:pointer;transition:background 0.2s;flex-shrink:0;">
      <div style="position:absolute;top:3px;left:${on?'21':'3'}px;width:20px;height:20px;border-radius:50%;background:#fff;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2);"></div>
    </div>`;
  };
  const row=(label,sub,key,defaultVal=true)=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:13px 0;border-bottom:1px solid #f5f5f5;">
      <div><p style="font-size:14px;font-weight:600;color:#1a1a1a;margin:0;">${label}</p>${sub?`<p style="font-size:12px;color:#888;margin:2px 0 0;">${sub}</p>`:''}</div>
      ${tog(key,defaultVal)}
    </div>`;

  ov.innerHTML=`
  <div style="background:#f5f7fb;border-radius:24px 24px 0 0;width:100%;max-width:420px;box-sizing:border-box;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;">
    <div style="background:#fff;border-radius:24px 24px 0 0;padding:16px 20px 14px;flex-shrink:0;border-bottom:1px solid #f0f0f0;">
      <div style="width:36px;height:4px;border-radius:4px;background:#e0e0e0;margin:0 auto 14px;"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <p style="font-size:17px;font-weight:800;color:#1a1a1a;margin:0;">Préférences</p>
        <button onclick="document.getElementById('prefs-modal-overlay').remove()" style="background:#f5f5f5;border:none;width:32px;height:32px;border-radius:50%;font-size:18px;cursor:pointer;color:#666;">×</button>
      </div>
    </div>
    <div style="overflow-y:auto;flex:1;padding:16px;display:flex;flex-direction:column;gap:12px;">

      <!-- Affichage accueil -->
      <div style="background:#fff;border-radius:14px;padding:16px;border:1px solid #e8e8e8;">
        <p style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 4px;">🏠 Accueil</p>
        ${row('FC de repos','Afficher le bloc fréquence cardiaque','show_fc_repos')}
        ${row('VO2max','Afficher la valeur VO2max','show_vo2max')}
      </div>

      <!-- Notifications -->
      <div style="background:#fff;border-radius:14px;padding:16px;border:1px solid #e8e8e8;">
        <p style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;">🔔 Notifications</p>
        ${(()=>{
          const perm=('Notification' in window)?Notification.permission:'unavailable';
          const pushOk='PushManager' in window && 'serviceWorker' in navigator;
          if(!pushOk) return '<p style="font-size:12px;color:#888;padding:8px 0;">Les notifications push nécessitent iOS 16.4+ et l\'app installée sur l\'écran d\'accueil.</p>';
          const ctaBanner = perm !== 'granted' ? `<div onclick="handleNotifBtn();document.getElementById('prefs-modal-overlay')?.remove()" style="background:${perm==='denied'?'#FFF0F0':'#FEF3EE'};border:1.5px solid ${perm==='denied'?'#E24B4A40':'#E8530A40'};border-radius:12px;padding:10px 14px;margin-bottom:12px;cursor:pointer;display:flex;align-items:center;gap:10px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${perm==='denied'?'#E24B4A':'#E8530A'}" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
            <div style="flex:1;">
              <p style="font-size:13px;font-weight:700;color:${perm==='denied'?'#E24B4A':'#E8530A'};margin:0;">${perm==='denied'?'Notifications bloquées':'Notifications non activées'}</p>
              <p style="font-size:11px;color:#888;margin:2px 0 0;">${perm==='denied'?"Va dans Réglages > Marathon pour les débloquer":"Appuie ici pour les activer — obligatoire"}</p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${perm==='denied'?'#E24B4A':'#E8530A'}" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </div>` : '';
          const rowN=(label,sub,key,defVal=true)=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:11px 0;border-bottom:1px solid #f5f5f5;gap:8px;">
            <div style="flex:1;min-width:0;"><p style="font-size:14px;font-weight:600;color:#1a1a1a;margin:0;">${label}</p>${sub?`<p style="font-size:11px;color:#888;margin:2px 0 0;">${sub}</p>`:''}</div>
            <button id="test-notif-btn-${key}" onclick="event.stopPropagation();testLocalNotif('${key}')" style="padding:4px 10px;background:#EEF2FD;border:1.5px solid #d0dff5;border-radius:10px;font-size:11px;font-weight:700;color:#1B4FD8;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:all 0.2s;">Tester</button>
            ${tog(key,defVal)}
          </div>`;
          return ctaBanner
            + rowN('Brief du matin','Résumé chaque matin avant de courir','notif_brief_matin')
            + rowN('Rappel 1h avant séance','Notification avant chaque entraînement','notif_seance')
            + rowN('Débrief hebdomadaire','Bilan de fin de semaine','notif_debrief_semaine')
            + rowN('Planification semaine','Rappel de planification le dimanche','notif_planif')
            + rowN('Félicitations semaine','Notification quand la semaine est complète','notif_congrats')
            + (isAdmin()?rowN('Rappel FC de repos','Mesure FC repos le matin','notif_fc_repos'):'')
            + rowN('Séances non validées','Rappel si des séances ne sont pas cochées','notif_unvalidated');
        })()}
      </div>
    </div>
  </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove();});
}

function togglePref(key, defaultVal=true){
  const p=getPrefs();
  const current=p[key]!==undefined?p[key]:defaultVal;
  p[key]=!current;
  savePrefs(p);
  // Mettre à jour le toggle visuellement
  openPrefsModal(); // rerendre le modal avec le nouvel état
}

function logoutUser(){
  _showConfirmModal({
    icon:'👋',
    title:'Se déconnecter ?',
    message:'Tu seras redirigé vers l\'écran de connexion.',
    confirmLabel:'Se déconnecter',
    confirmStyle:'background:#1B4FD8;color:#fff;',
    onConfirm:async()=>{
      // Nettoyer les subscriptions push avant déconnexion
      // → évite que le serveur tente d'envoyer des notifs vers un endpoint mort
      try{
        const uid=firebase.auth().currentUser?.uid;
        if(uid){
          const db=firebase.database();
          await Promise.all([
            dbRef?dbRef.child('_push_sub').remove():Promise.resolve(),
            db.ref('_push_subscribers/'+uid).remove(),
          ]);
        }
      }catch(e){console.warn('Cleanup push sub:',e);}
      firebase.auth().signOut();
    },
  });
}

function renderCompteScreen(){
  const user=firebase.auth().currentUser;
  const greetEl=document.getElementById('compte-greeting');
  const tagEl=document.getElementById('compte-tagline');
  if(greetEl&&user){
    // Prénom = displayName ou première partie du mail
    const prenom=(user.displayName||user.email||'').split(/[@\s]/)[0];
    const prenomCap=prenom.charAt(0).toUpperCase()+prenom.slice(1);
    const h=new Date().getHours();
    const salut=h<12?'Bonjour':h<18?'Bon après-midi':'Bonsoir';
    // Pour l'admin Guillaume, on sait que c'est un homme
    const gender=state.gender||(isAdmin()?'M':null);
    const genderEmoji=gender==='F'?'👩‍🏃':gender==='M'?'🏃':'🏃';
    greetEl.textContent=salut+' '+prenomCap+' '+genderEmoji;
    // Mettre à jour l'avatar aussi
    const avatarEl=document.getElementById('compte-avatar');
    if(avatarEl) avatarEl.textContent=genderEmoji;
    // Tagline selon rôle et heure
    const taglines=isAdmin()
      ?['Coach en chef 💪','On va les faire progresser ! 🚀','Ton équipe compte sur toi 🏆']
      :['Chaque km compte 🏃','Continue comme ça, tu assures ! 💪','La régularité fait la différence ⚡','Un pas après l\'autre 🌟'];
    tagEl.textContent=taglines[Math.floor(Math.random()*taglines.length)];
  }
  // Mettre à jour le sous-titre du bouton infos
  const sub=document.getElementById('info-subtitle');
  if(sub&&user){const prenom=user.displayName||user.email?.split('@')[0]||'';sub.textContent=prenom?prenom+' · '+user.email:user.email;}
  const adminPanel=document.getElementById('admin-panel');
  if(adminPanel) adminPanel.style.display=isAdmin()?'block':'none';
  const adminIntegrations=document.getElementById('admin-integrations');
  if(adminIntegrations) adminIntegrations.style.display=isAdmin()?'block':'none';
  if(isAdmin()) { loadAdminUsersList(); checkStravaStatus(); }
  renderAthletePanel();
}

async function loadAdminUsersList(){
  const listEl=document.getElementById('admin-users-list');
  if(!listEl) return;
  try {
    const token=await getAuthToken();
    const resp=await fetch(FUNCTIONS_BASE+'/listUsers',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:'{}'});
    const users=await resp.json();
    if(!Array.isArray(users)){listEl.textContent='Erreur chargement.';return;}
    listEl.innerHTML=users.map(u=>`
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f0f0f0;">
        <div ${u.role!=='admin'?`onclick="openAthleteCoachView('${u.uid}','${u.displayName||u.email||u.uid}')" style="cursor:pointer;flex:1;"`:'style="flex:1;"'}>
          <div style="font-weight:600;font-size:14px;">${u.displayName||u.email||u.uid}</div>
          <div style="font-size:11px;color:#888;">${u.email||''} · ${u.role==='admin'?'Admin':'Athlète'}</div>
          ${u.role!=='admin'?'<div style="font-size:11px;color:#1B4FD8;margin-top:2px;">Voir le plan →</div>':''}
        </div>
        ${u.role!=='admin'?`<button onclick="event.stopPropagation();adminDeleteUser('${u.uid}','${u.email||u.uid}')" style="background:none;border:1px solid #ffcdd2;border-radius:8px;padding:4px 10px;font-size:11px;color:#e53e3e;cursor:pointer;flex-shrink:0;">Suppr.</button>`:''}
      </div>`).join('');
  } catch(e){listEl.textContent='Erreur : '+e.message;}
}

let _adminNewGender='';
function selectGender(g){
  _adminNewGender=g;
  ['M','F'].forEach(x=>{
    const b=document.getElementById('gender-btn-'+x);
    if(!b) return;
    const sel=x===g;
    b.style.borderColor=sel?'#1B4FD8':'#e0e0e0';
    b.style.background=sel?'#EBF0FF':'#f5f5f5';
    b.style.color=sel?'#1B4FD8':'#666';
  });
}

async function adminCreateUser(){
  const email=(document.getElementById('admin-new-email')?.value||'').trim();
  const password=document.getElementById('admin-new-password')?.value||'';
  const displayName=(document.getElementById('admin-new-name')?.value||'').trim();
  const gender=_adminNewGender||null;
  const msgEl=document.getElementById('admin-create-msg');
  if(!email||!password){if(msgEl){msgEl.textContent='Email et mot de passe requis.';msgEl.style.color='#e53e3e';msgEl.style.display='block';}return;}
  const btn=document.querySelector('#admin-panel button[onclick="adminCreateUser()"]');
  if(btn){btn.textContent='Création...';btn.disabled=true;}
  try {
    const token=await getAuthToken();
    const resp=await fetch(FUNCTIONS_BASE+'/createUser',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({email,password,displayName,gender})});
    const data=await resp.json();
    if(data.error) throw new Error(data.error);
    // Sauvegarder le genre dans la DB de l'utilisateur créé
    if(gender&&data.uid){
      await fetch(FUNCTIONS_BASE+'/dbAdmin',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({action:'write',path:`users/${data.uid}/state/gender`,value:gender})}).catch(()=>{});
    }
    if(msgEl){msgEl.textContent='✅ Compte créé pour '+data.email;msgEl.style.color='#2d7d46';msgEl.style.display='block';}
    document.getElementById('admin-new-email').value='';
    document.getElementById('admin-new-password').value='';
    document.getElementById('admin-new-name').value='';
    _adminNewGender='';selectGender('');
    loadAdminUsersList();
  } catch(e){
    if(msgEl){msgEl.textContent='Erreur : '+e.message;msgEl.style.color='#e53e3e';msgEl.style.display='block';}
  }
  if(btn){btn.textContent='Créer le compte';btn.disabled=false;}
}

async function adminDeleteUser(uid,label){
  await new Promise(resolve=>{
    _showConfirmModal({
      icon:'🗑️',
      title:'Supprimer ce compte ?',
      message:`Le compte <b>${label}</b> et toutes ses données seront définitivement supprimés. Cette action est irréversible.`,
      confirmLabel:'Supprimer',
      confirmStyle:'background:#DC2626;color:#fff;',
      onConfirm:resolve,
    });
  });
  try {
    const token=await getAuthToken();
    const resp=await fetch(FUNCTIONS_BASE+'/deleteUser',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({uid})});
    const data=await resp.json();
    if(data.error) throw new Error(data.error);
    loadAdminUsersList();
  } catch(e){alert('Erreur : '+e.message);}
}



// ── STRAVA ADMIN ─────────────────────────────────────────────────────────────
async function checkStravaStatus() {
  const label = document.getElementById('strava-status-label');
  const btn = document.getElementById('strava-connect-btn');
  if (!label || !btn) return;
  try {
    const resp = await fetch(FUNCTIONS_BASE + '/stravaFetch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
    });
    const data = await resp.json();
    if (data.needsAuth) {
      label.textContent = 'Non connecté';
      label.style.color = '#e53e3e';
      btn.style.display = 'block';
    } else {
      label.textContent = 'Connecté ✓';
      label.style.color = '#3B6D11';
      btn.textContent = 'Reconnecter';
      btn.style.background = '#888';
      btn.style.display = 'block';
    }
  } catch(e) {
    label.textContent = 'Statut inconnu';
  }
}

async function adminConnectStrava() {
  const btn = document.getElementById('strava-connect-btn');
  const label = document.getElementById('strava-status-label');
  if (btn) { btn.textContent = '⏳ Connexion…'; btn.disabled = true; }
  const authWin = window.open(FUNCTIONS_BASE + '/stravaAuth', '_blank', 'width=600,height=700');
  const check = setInterval(async () => {
    try {
      const resp = await fetch(FUNCTIONS_BASE + '/stravaFetch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
      });
      const data = await resp.json();
      if (!data.needsAuth) {
        clearInterval(check);
        if (authWin) authWin.close();
        if (label) { label.textContent = 'Connecté ✓'; label.style.color = '#3B6D11'; }
        if (btn) { btn.textContent = 'Reconnecter'; btn.style.background = '#888'; btn.disabled = false; }
      }
    } catch(e) {}
  }, 2000);
  setTimeout(() => { clearInterval(check); if (btn) { btn.textContent = 'Connecter'; btn.disabled = false; } }, 120000);
}

// ── ONBOARDING ────────────────────────────────────────────────────────────────
