let state={};
let firebaseReady=false;
let dbRef=null;
let currentUserRole=null;
let currentUserId=null;
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
              // Récupérer la météo réelle pour les séances passées (silencieux)
              setTimeout(() => autoFetchMissingMeteo(), 2000);
              // Vérifier les notifications coach dès l'ouverture de l'app
              checkCoachUnread();
              // Init Service Worker et push notifications
              initNotifications();
              // Quand l'app revient au foreground (depuis notification) → vérifier Firebase
              document.addEventListener('visibilitychange', async function() {
                if (document.visibilityState !== 'visible' || !dbRef) return;
                try {
                  const snap = await dbRef.child('_open_coach').once('value');
                  if (!snap.val()) return;
                  await dbRef.child('_open_coach').remove();
                  try {
                    const stateSnap = await dbRef.once('value');
                    if (stateSnap.val()) state = stateSnap.val();
                  } catch(e) {}
                  // Reset flags
                  window._coachInitDone = false;
                  _briefShownToday = false;
                  window._coachOpenedFromNotif = true;
                  // Afficher l'écran coach (tabs + display)
                  ['home','plan','renfo','stats','coach','compte'].forEach(s=>{
                    const el=document.getElementById('sc-'+s);
                    if(el) el.style.display=s==='coach'?'flex':'none';
                    const btn=document.getElementById('nav-'+s);
                    if(btn) btn.className='nav-btn'+(s==='coach'?' active':'');
                  });
                  const badge=document.getElementById('coach-alert-badge');
                  if(badge) badge.style.display='none';
                  window._coachHasUnread=false;
                  if(dbRef) dbRef.child('_coach_unread').set(false);
                  // Appeler loadCoachHistory directement — pas de setTimeout
                  await loadCoachHistory();
                } catch(e) {}
              });

              // Lire _open_coach depuis Firebase (mis par la notif brief/débrief)
              (async () => {
                try {
                  const ocSnap = await dbRef.child('_open_coach').once('value');
                  if (!ocSnap.val()) return;
                  await dbRef.child('_open_coach').remove();
                  try {
                    const stateSnap = await dbRef.once('value');
                    if (stateSnap.val()) state = stateSnap.val();
                  } catch(e) {}
                  window._coachInitDone = false;
                  _briefShownToday = false;
                  window._coachOpenedFromNotif = true;
                  ['home','plan','renfo','stats','coach','compte'].forEach(s=>{
                    const el=document.getElementById('sc-'+s);
                    if(el) el.style.display=s==='coach'?'flex':'none';
                    const btn=document.getElementById('nav-'+s);
                    if(btn) btn.className='nav-btn'+(s==='coach'?' active':'');
                  });
                  const badge=document.getElementById('coach-alert-badge');
                  if(badge) badge.style.display='none';
                  window._coachHasUnread=false;
                  if(dbRef) dbRef.child('_coach_unread').set(false);
                  await loadCoachHistory();
                } catch(e) {}
              })();

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


let rendered={};
let coachHistory=[];
