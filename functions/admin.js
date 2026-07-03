const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();
const nodemailer = require("nodemailer");

const { corsHeaders, verifyAdmin, ADMIN_EMAIL, ADMIN_UID } = require('./helpers');

const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");

async function sendWelcomeEmail(toEmail, displayName, password) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: ADMIN_EMAIL, pass: GMAIL_APP_PASSWORD.value() }
  });
  const prenom = displayName ? displayName.split(' ')[0] : 'à toi';
  await transporter.sendMail({
    from: `"En Piste 🏃" <${ADMIN_EMAIL}>`,
    to: toEmail,
    subject: "Ton accès En Piste est prêt !",
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;">
        <div style="text-align:center;margin-bottom:28px;">
          <span style="font-size:48px;">🏃</span>
          <h1 style="margin:12px 0 4px;font-size:24px;color:#1a1a1a;">Bienvenue ${prenom} !</h1>
          <p style="color:#6b6b6b;font-size:14px;margin:0;">Ton plan d'entraînement marathon t'attend.</p>
        </div>

        <div style="background:#EDF2FB;border-radius:16px;padding:20px 24px;margin-bottom:20px;">
          <p style="font-size:15px;font-weight:700;color:#1a1a1a;margin:0 0 14px;">Pour accéder à l'app :</p>
          <ol style="margin:0;padding-left:20px;color:#1a1a1a;font-size:14px;line-height:2;">
            <li>Ouvre <strong>Safari</strong> sur ton iPhone</li>
            <li>Va sur <a href="https://enpiste.net" style="color:#1B4FD8;font-weight:700;">enpiste.net</a></li>
            <li>Appuie sur <strong>Partager</strong> puis <strong>« Sur l'écran d'accueil »</strong></li>
            <li>Ouvre l'app depuis ton écran d'accueil</li>
            <li>Connecte-toi avec ton adresse email et le mot de passe ci-dessous</li>
          </ol>
        </div>

        <div style="background:#fff3e0;border:2px solid #E8530A;border-radius:12px;padding:16px 20px;margin-bottom:20px;text-align:center;">
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#E8530A;">Tes identifiants</p>
          <p style="margin:0 0 4px;font-size:14px;color:#1a1a1a;"><strong>Email :</strong> ${toEmail}</p>
          <p style="margin:0;font-size:14px;color:#1a1a1a;"><strong>Mot de passe :</strong> <span style="font-size:20px;font-weight:900;letter-spacing:0.1em;">${password}</span></p>
          <p style="margin:8px 0 0;font-size:11px;color:#6b6b6b;">Tu pourras le changer dans les paramètres.</p>
        </div>

        <p style="font-size:13px;color:#6b6b6b;text-align:center;margin:0;">
          Des questions ? Réponds directement à cet email.<br>
          <strong style="color:#1a1a1a;">Bonne prépa ! 💪</strong>
        </p>
      </div>
    `
  });
}


exports.createUser = onRequest(
  { cors: true, secrets: [GMAIL_APP_PASSWORD] },
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
      // Envoi email de bienvenue (non bloquant)
      sendWelcomeEmail(email, displayName, password).catch(e =>
        console.error('sendWelcomeEmail error:', e.message)
      );
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
      try {
        const db = admin.database();
        await db.ref(`users/${uid}`).remove();
        await db.ref(`_push_subscribers/${uid}`).remove();
      } catch(eDb) {
        console.error(`deleteUser: compte Auth supprimé mais données DB non nettoyées pour ${uid}:`, eDb.message);
      }
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
