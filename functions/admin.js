const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();

const { corsHeaders, verifyAdmin, ADMIN_EMAIL, ADMIN_UID } = require('./helpers');

exports.initAdminPassword = onRequest(
  { cors: true },
  async (req, res) => {
    corsHeaders(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    const { uid, password, secret } = req.body || {};
    if (secret !== 'marathon2026-init') { res.status(403).json({ error: 'Secret invalide' }); return; }
    if (!uid || !password) { res.status(400).json({ error: 'uid et password requis' }); return; }
    try {
      await admin.auth().updateUser(uid, { password, email: ADMIN_EMAIL });
      const db = admin.database();
      await db.ref(`users/${uid}/role`).set('admin');
      res.json({ success: true, message: 'Mot de passe ajouté au compte existant' });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  }
);

exports.createUser = onRequest(
  { cors: true },
  async (req, res) => {
    corsHeaders(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try { await verifyAdmin(req); } catch(e) { res.status(403).json({ error: e.message }); return; }
    const { email, password, displayName } = req.body || {};
    if (!email || !password) { res.status(400).json({ error: 'Email et mot de passe requis' }); return; }
    try {
      const userRecord = await admin.auth().createUser({ email, password, displayName: displayName || email });
      const db = admin.database();
      await db.ref(`users/${userRecord.uid}/role`).set('athlete');
      res.json({ uid: userRecord.uid, email: userRecord.email });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  }
);

exports.listUsers = onRequest(
  { cors: true },
  async (req, res) => {
    corsHeaders(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try { await verifyAdmin(req); } catch(e) { res.status(403).json({ error: e.message }); return; }
    try {
      const db = admin.database();
      const snap = await db.ref('users').once('value');
      const usersData = snap.val() || {};
      const result = await Promise.all(
        Object.entries(usersData).map(async ([uid, data]) => {
          try {
            const authUser = await admin.auth().getUser(uid);
            return { uid, email: authUser.email, displayName: authUser.displayName, role: data.role || 'athlete' };
          } catch(e) {
            return { uid, role: data.role || 'athlete' };
          }
        })
      );
      res.json(result);
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  }
);

exports.deleteUser = onRequest(
  { cors: true },
  async (req, res) => {
    corsHeaders(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try { await verifyAdmin(req); } catch(e) { res.status(403).json({ error: e.message }); return; }
    const { uid } = req.body || {};
    if (!uid) { res.status(400).json({ error: 'UID requis' }); return; }
    if (uid === ADMIN_UID) { res.status(403).json({ error: 'Impossible de supprimer le compte administrateur' }); return; }
    try {
      await admin.auth().deleteUser(uid);
      const db = admin.database();
      await db.ref(`users/${uid}`).remove();
      res.json({ success: true });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  }
);

exports.dbAdmin = onRequest(
  {cors:true,timeoutSeconds:30,memory:'256MiB'},
  async(req,res)=>{
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
    if(req.method==='OPTIONS'){res.status(204).send('');return;}
    try{await verifyAdmin(req);}catch(e){res.status(403).json({error:e.message});return;}
    const{action,path:dbPath,value}=req.body||{};
    const ALLOWED_PREFIXES=['users/','_push_subscribers/'];
    if(!dbPath||!ALLOWED_PREFIXES.some(p=>dbPath.startsWith(p))){res.status(403).json({error:'Chemin non autorisé'});return;}
    try{
      const db=admin.database();
      const ref=db.ref(dbPath);
      if(action==='read'){
        const snap=await ref.once('value');
        res.json({data:snap.val()});
      }else if(action==='write'){
        await ref.set(value);
        res.json({success:true});
      }else if(action==='update'){
        await ref.update(value);
        res.json({success:true});
      }else if(action==='delete'){
        await ref.remove();
        res.json({success:true});
      }else{
        res.status(400).json({error:'action invalide (read|write|update|delete)'});
      }
    }catch(e){
      res.status(500).json({error:e.message});
    }
  }
);
