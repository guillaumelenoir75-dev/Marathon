const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();
const { Resend } = require("resend");

const { corsHeaders, verifyAdmin, ADMIN_EMAIL, ADMIN_UID } = require('./helpers');

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

async function sendWelcomeEmail(toEmail, displayName, password, gender) {
  const resend = new Resend(RESEND_API_KEY.value());
  const prenom = (displayName || '').trim().split(' ')[0] || null;
  const salut = prenom
    ? `Bienvenue ${prenom} !`
    : (gender === 'F' ? 'Bienvenue !' : 'Bienvenu !');
  const sub4 = gender === 'F' ? 'une future marathonienne' : 'un futur marathonien';

  await resend.emails.send({
    from: 'En Piste <contact@enpiste.net>',
    replyTo: 'contact@enpiste.net',
    to: toEmail,
    subject: `${salut} Ton accès En Piste est prêt 🏃`,
    html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#EDF2FB;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#EDF2FB;padding:32px 16px;">
  <tr><td align="center">
  <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <tr><td style="background:linear-gradient(135deg,#1B4FD8 0%,#2563EB 100%);padding:36px 32px;text-align:center;">
      <div style="font-size:52px;line-height:1;">🏃</div>
      <h1 style="margin:14px 0 6px;font-size:26px;font-weight:800;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${salut}</h1>
      <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.82);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">Ton plan marathon personnalisé t'attend.</p>
    </td></tr>

    <!-- Body -->
    <tr><td style="padding:32px 32px 0;">

      <p style="font-size:15px;color:#1a1a1a;line-height:1.6;margin:0 0 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        Guillaume t'a créé un compte sur <strong>En Piste</strong> — l'app qui va faire de toi ${sub4} !<br>
        Voici comment te connecter en 2 minutes ⬇️
      </p>

      <!-- Steps -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#EDF2FB;border-radius:14px;padding:0;margin-bottom:20px;">
        <tr><td style="padding:20px 22px;">
          <p style="margin:0 0 14px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#1B4FD8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">📱 Installation sur iPhone</p>
          <table cellpadding="0" cellspacing="0">
            ${['Ouvre <strong>Safari</strong> (pas Chrome)','Va sur <a href="https://enpiste.net" style="color:#1B4FD8;font-weight:700;text-decoration:none;">enpiste.net</a>','Appuie sur le bouton <strong>Partager</strong> ⎋ en bas','Choisis <strong>« Sur l\'écran d\'accueil »</strong>','Ouvre l\'app et connecte-toi avec tes identifiants ci-dessous'].map((s,i)=>`
            <tr>
              <td valign="top" style="padding:5px 12px 5px 0;font-size:22px;line-height:1.2;color:#1B4FD8;font-weight:800;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${i+1}</td>
              <td valign="top" style="padding:5px 0;font-size:14px;color:#1a1a1a;line-height:1.5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${s}</td>
            </tr>`).join('')}
          </table>
          <p style="margin:14px 0 0;font-size:12px;color:#6b6b6b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">Sur Android : ouvre Chrome → menu ⋮ → <strong>Ajouter à l'écran d'accueil</strong></p>
        </td></tr>
      </table>

      <!-- Credentials -->
      <table width="100%" cellpadding="0" cellspacing="0" style="border:2px solid #E8530A;border-radius:14px;margin-bottom:24px;">
        <tr><td style="padding:18px 22px;text-align:center;">
          <p style="margin:0 0 12px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#E8530A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">🔑 Tes identifiants</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:6px 10px;background:#f9f9f9;border-radius:8px 8px 0 0;font-size:13px;color:#6b6b6b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">Email</td>
              <td style="padding:6px 10px;background:#f9f9f9;border-radius:8px 8px 0 0;font-size:13px;font-weight:700;color:#1a1a1a;text-align:right;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${toEmail}</td>
            </tr>
            <tr><td colspan="2" style="height:2px;background:#fff;"></td></tr>
            <tr>
              <td style="padding:6px 10px;background:#f9f9f9;border-radius:0 0 8px 8px;font-size:13px;color:#6b6b6b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">Mot de passe</td>
              <td style="padding:6px 10px;background:#f9f9f9;border-radius:0 0 8px 8px;font-size:20px;font-weight:900;color:#E8530A;text-align:right;letter-spacing:0.12em;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${password}</td>
            </tr>
          </table>
          <p style="margin:10px 0 0;font-size:11px;color:#888;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">Tu pourras changer ton mot de passe dans les paramètres de l'app.</p>
        </td></tr>
      </table>

      <!-- CTA -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
        <tr><td align="center">
          <a href="https://enpiste.net" style="display:inline-block;background:#E8530A;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:16px;font-weight:800;text-decoration:none;padding:16px 40px;border-radius:14px;letter-spacing:0.02em;">Ouvrir l'app →</a>
        </td></tr>
      </table>

    </td></tr>

    <!-- Footer -->
    <tr><td style="padding:20px 32px 28px;border-top:1px solid #f0f0f0;text-align:center;">
      <p style="margin:0;font-size:12px;color:#aaa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        Des questions ? Réponds directement à cet email.<br>
        <strong style="color:#1a1a1a;">Bonne prépa, et en piste ! 🏃💪</strong>
      </p>
    </td></tr>

  </table>
  </td></tr>
</table>
</body>
</html>
    `
  });
}


exports.createUser = onRequest(
  { cors: true, secrets: [RESEND_API_KEY] },
  async (req, res) => {
    corsHeaders(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try { await verifyAdmin(req); } catch(e) { res.status(403).json({ error: e.message }); return; }
    const { email, password, displayName, gender } = req.body || {};
    if (!email || !password) { res.status(400).json({ error: 'Email et mot de passe requis' }); return; }
    try {
      const userRecord = await admin.auth().createUser({ email, password, displayName: displayName || email });
      const db = admin.database();
      await db.ref(`users/${userRecord.uid}/role`).set('athlete');
      // Envoi email de bienvenue (non bloquant)
      sendWelcomeEmail(email, displayName, password, gender).catch(e =>
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
