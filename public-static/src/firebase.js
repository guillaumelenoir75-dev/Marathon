let state={};
let firebaseReady=false;
let dbRef=null;
let currentUserRole=null;
let currentUserId=null;
let _visibilityListenerAdded=false;
function isAdmin(){return currentUserRole==='admin'||firebase.auth().currentUser?.email===ADMIN_EMAIL;}

const ADMIN_EMAIL='guillaumelenoir75@gmail.com';
const FUNCTIONS_BASE='https://us-central1-prepa-marathon.cloudfunctions.net';

async function getAuthToken(){
  const user=firebase.auth().currentUser;
  if(!user) return null;
  return user.getIdToken();
}

async function authHeaders(stream){
  const token=await getAuthToken();
  const h={'Content-Type':'application/json'};
  if(stream) h['Accept']='text/event-stream';
  if(token) h['Authorization']='Bearer '+token;
  return h;
}

function initFirebase(){
  const globalTimeout=setTimeout(()=>{
    if(!firebaseReady){
      console.warn('Firebase timeout, mode démo');
      migrateState();
      firebaseReady=true;
      const lo=document.getElementById('loading-overlay');
      if(lo){
        lo.innerHTML='<p style="font-size:13px;color:#888;font-family:sans-serif;text-align:center;padding:20px;">⚠️ Mode aperçu<br><span style="font-size:11px;">Firebase non disponible</span></p>';
        setTimeout(()=>{lo.remove();showScreen('home');},1200);
      } else showScreen('home');
    }
  },10000);

  // Charger Firebase App + Auth + Database
  const script=document.createElement('script');
  script.src='https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js';
  script.onerror=()=>{clearTimeout(globalTimeout);migrateState();firebaseReady=true;const lo=document.getElementById('loading-overlay');if(lo)lo.remove();showScreen('home');};
  script.onload=()=>{
    const script2=document.createElement('script');
    script2.src='https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js';
    script2.onload=()=>{
      const script3=document.createElement('script');
      script3.src='https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js';
      script3.onerror=()=>{clearTimeout(globalTimeout);migrateState();firebaseReady=true;const lo=document.getElementById('loading-overlay');if(lo)lo.remove();showScreen('home');};
      script3.onload=()=>{
        const firebaseConfig={
          apiKey:"AIzaSyA1yOzyqcrIM4fYOJh5DCBFPQXCSV7X5uw",
          authDomain:"prepa-marathon.firebaseapp.com",
          databaseURL:"https://prepa-marathon-default-rtdb.europe-west1.firebasedatabase.app",
          projectId:"prepa-marathon",
          storageBucket:"prepa-marathon.firebasestorage.app",
          messagingSenderId:"1068433254929",
          appId:"1:1068433254929:web:63147befb9b51dd2f95fb0"
        };
        firebase.initializeApp(firebaseConfig);

        // Observer d'authentification
        firebase.auth().onAuthStateChanged(async user=>{
          if(user){
            clearTimeout(globalTimeout);
            currentUserId=user.uid;
            const db=firebase.database();

            // Charger ou initialiser le rôle
            let roleSnap=await db.ref('users/'+user.uid+'/role').once('value');
            currentUserRole=roleSnap.val();

            // Auto-attribution admin à la première connexion de l'admin
            if(!currentUserRole && user.email===ADMIN_EMAIL){
              currentUserRole='admin';
              await db.ref('users/'+user.uid+'/role').set('admin');
            }

            if(!currentUserRole){
              firebase.auth().signOut();
              showLoginScreen('Compte non autorisé. Contacte l\'administrateur.');
              return;
            }

            // Chemin des données isolé par utilisateur
            dbRef=db.ref('users/'+user.uid+'/state');

            // Listener temps-réel sur _open_coach : mécanisme le plus fiable sur iOS.
            // Quand l'app revient du background, Firebase RTDB se reconnecte et ce listener
            // se déclenche immédiatement si _open_coach=true, sans dépendre de visibilitychange
            // ou du postMessage SW (les deux sont peu fiables sur iOS après suspension).
            dbRef.child('_open_coach').on('value', function(_ocSnap) {
              if (!_ocSnap.val() || !firebaseReady) return;
              openCoachFromNotif();
            });

            // Migration one-time : admin récupère ses données depuis marathon/state
            if(isAdmin()){
              const existingSnap=await dbRef.once('value');
              if(!existingSnap.val()){
                const oldSnap=await db.ref('marathon/state').once('value');
                if(oldSnap.val()){
                  await dbRef.set(oldSnap.val());
                  console.log('Migration admin depuis marathon/state effectuée');
                }
              }
            }

            dbRef.once('value',(snapshot)=>{
              const data=snapshot.val();
              if(data) state=data;
              migrateState();
              if(dbRef) dbRef.set(state).catch(()=>{}); // persister les migrations
              firebaseReady=true;
              hideLoginScreen();
              applyRoleUI();
              showScreen('home');
              if(currentUserRole==='athlete' && !state.onboarding) showOnboarding(false);
              // Message SW reçu avant init → ouvrir le coach maintenant
              if (window._pendingCoachOpen) { window._pendingCoachOpen = false; openCoachFromNotif(); }
              // Récupérer la météo réelle pour les séances passées (silencieux)
              setTimeout(() => autoFetchMissingMeteo(), 2000);
              // Vérifier les notifications coach dès l'ouverture de l'app
              checkCoachUnread();
              // Init Service Worker et push notifications
              initNotifications();
              // Sync WHOOP au démarrage si connecté
              setTimeout(() => {
                if (state.whoop_token && state.whoop_token.access_token && typeof syncWhoop === 'function' && !_whoopSyncing) syncWhoop();
              }, 3000);
              // Vérifier _open_coach au démarrage (app rouverte depuis notif quand elle était fermée)
              (async () => {
                try {
                  const snap = await dbRef.child('_open_coach').once('value');
                  if (snap.val()) { await dbRef.child('_open_coach').remove(); await openCoachFromNotif(); return; }
                } catch(e) {}
                // Fallback URL ?action=brief (openWindow depuis SW si app vraiment fermée)
                try {
                  if (window.location.search.includes('action=brief')) {
                    const _urlParams = new URLSearchParams(window.location.search);
                    window._pendingNotifTag = _urlParams.get('tag') || '';
                    history.replaceState({}, '', '/');
                    await openCoachFromNotif();
                  }
                } catch(e) {}
              })();

              // visibilitychange : tap notification quand app en arrière-plan
              // (seul mécanisme fiable sur iOS — lit _open_coach au retour au premier plan)
              if(!_visibilityListenerAdded){_visibilityListenerAdded=true;
              document.addEventListener('visibilitychange', async function() {
                if (document.visibilityState !== 'visible' || !dbRef || !firebaseReady) return;
                try {
                  const snap = await dbRef.child('_open_coach').once('value');
                  if (snap.val()) {
                    await dbRef.child('_open_coach').remove();
                    await openCoachFromNotif();
                    return;
                  }
                  // _open_coach peut avoir été consommé par le timer 2s (app au premier plan) ;
                  // _brief_pending persiste jusqu'à ce que checkPendingBrief() le traite → fallback fiable
                  const bSnap = await dbRef.child('_brief_pending').once('value');
                  const bp = bSnap.val();
                  if (bp && (bp.needs_full_bilan || bp.needs_full_brief)) {
                    await openCoachFromNotif();
                  }
                } catch(e) {}
              });
              } // fin guard _visibilityListenerAdded

            },(error)=>{
              migrateState();
              firebaseReady=true;
              hideLoginScreen();
              showScreen('home');
              checkCoachUnread();
            });
          } else {
            clearTimeout(globalTimeout);
            currentUserRole=null;
            currentUserId=null;
            showLoginScreen();
          }
        });
      };
      document.head.appendChild(script3);
    };
    document.head.appendChild(script2);
  };
  document.head.appendChild(script);
}


// Guard : évite la double invocation concurrente (visibilitychange + postMessage)
let _openCoachFromNotifActive = false;

// Ouvre le coach et affiche le brief (depuis notif ou flag Firebase)
async function openCoachFromNotif() {
  if (!dbRef || !firebaseReady) return;
  if (_openCoachFromNotifActive) return;
  _openCoachFromNotifActive = true;
  // Sécurité : libérer le guard après 30s max (évite un blocage permanent si Firebase ne répond pas)
  const _guardTimeout = setTimeout(() => { _openCoachFromNotifActive = false; }, 30000);

  // ── SWITCH TAB IMMÉDIAT — avant tout await Firebase ──
  // Sur iOS, le WebSocket Firebase est coupé quand l'app est en background.
  // Les awaits Firebase ci-dessous peuvent bloquer plusieurs secondes pendant la reconnexion.
  // Le tab switch doit s'exécuter SANS attendre Firebase pour que l'utilisateur voie le Coach.
  window._coachInitDone = false;
  _briefShownToday = false;
  // Vider le container pour éviter l'accumulation de messages lors d'un re-déclenchement
  const _coachContainer = document.getElementById('coach-messages');
  if (_coachContainer) _coachContainer.innerHTML = '';
  // Fermer le modal de préférences s'il est ouvert (sinon il couvre le Coach)
  const _prefModal = document.getElementById('prefs-modal-overlay');
  if (_prefModal) _prefModal.remove();
  window._coachOpenedFromNotif = true;
  ['home','plan','renfo','stats','coach','compte'].forEach(s => {
    const el = document.getElementById('sc-'+s);
    if (el) el.style.display = s === 'coach' ? 'flex' : 'none';
    const btn = document.getElementById('nav-'+s);
    if (btn) btn.className = 'nav-btn' + (s === 'coach' ? ' active' : '');
  });
  const badge = document.getElementById('coach-alert-badge');
  if (badge) badge.style.display = 'none';
  window._coachHasUnread = false;
  if (dbRef) dbRef.child('_coach_unread').set(false);

  // ── Nettoyage Firebase et refresh state (après le switch tab) ──
  // Consommer _open_coach (le chemin postMessage ne le supprime pas,
  // ce qui pourrait déclencher un visibilitychange parasite au prochain retour au premier plan)
  try { await dbRef.child('_open_coach').remove(); } catch(e) {}
  try {
    const stateSnap = await dbRef.once('value');
    if (stateSnap.val()) state = stateSnap.val();
  } catch(e) {}

  try { await loadCoachHistory(); } catch(e) {}
  clearTimeout(_guardTimeout);
  _openCoachFromNotifActive = false; // Libérer après loadCoachHistory — évite qu'un 2e appel concurrent flipe _coachInitDone pendant le streaming
}

// SW → client postMessage (notification tap quand app déjà ouverte en arrière-plan)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', function(ev) {
    if (!ev.data || ev.data.action !== 'open_coach') return;
    window._pendingNotifTag = ev.data.tag || '';
    if (dbRef && firebaseReady) {
      openCoachFromNotif();
    } else {
      window._pendingCoachOpen = true;
    }
  });
}

let rendered={};
let coachHistory=[];
let chartKm=null;
let chartFcRepos=null;
