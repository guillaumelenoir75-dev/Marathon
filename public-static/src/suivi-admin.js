// Page /suivi-admin : réservée au compte administrateur. Démarre la course, envoie la position GPS de Guillaume
// dans /live (pos, trace, passages), déclare l'arrivée. Lue en direct par /suivi-guillaume.

const SuiviAdmin = (function(){
  let ref = null, live = {}, offset = 0, watch = null, wakeLock = null;
  let lastS = null, lastAccT = 0, lastWrite = 0, lastTrack = 0, lastTrackS = -1, sent = 0, lastFix = null;
  const $ = function(id){ return document.getElementById(id); };
  const now = function(){ return Date.now() + offset; };
  const PLAN_SPEED = 42195 / (3.55 * 3600);        // ≈ 3,3 m/s (9h15 → 12h48)

  function show(id){ ['login', 'panel'].forEach(function(x){ $(x).hidden = x !== id; }); }
  function msg(t, err){ const m = $('msg'); m.textContent = t; m.className = 'msg' + (err ? ' err' : ''); m.hidden = !t; }

  async function init(){
    try { ref = await suiviFirebase(true); } catch(e) { msg('Impossible de charger Firebase. Vérifiez la connexion.', true); return; }
    firebase.database().ref('.info/serverTimeOffset').on('value', function(s){ offset = s.val() || 0; });
    firebase.auth().onAuthStateChanged(function(u){
      if(!u){ show('login'); return; }
      if(u.uid !== SUIVI_ADMIN_UID){ show('login'); msg('Ce compte n\'est pas le compte administrateur.', true); return; }
      show('panel'); listen();
    });
    $('login-form').onsubmit = async function(e){
      e.preventDefault(); msg('');
      try { await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL); await firebase.auth().signInWithEmailAndPassword($('email').value.trim(), $('pwd').value); }
      catch(err){ msg('Connexion impossible : ' + (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential' ? 'mot de passe incorrect.' : err.message), true); }
    };
    setInterval(render, 1000);
    document.addEventListener('visibilitychange', function(){ if(watch !== null && document.visibilityState === 'visible') wake(); });
  }

  function listen(){
    ref.on('value', function(s){
      live = s.val() || {};
      if(live.pos && typeof live.pos.s === 'number' && lastS === null) lastS = live.pos.s;
      if(live.garmin !== undefined && document.activeElement !== $('garmin')) $('garmin').value = live.garmin || '';
      render();
    });
  }

  // ─── Commandes ────────────────────────────────────────────────────────────
  async function start(at){
    const label = at ? 'à ' + suiviFmt.hhmm(at) : 'maintenant';
    if(live.status === 'running' && !confirm('Une course est déjà en cours. Redémarrer le chrono ' + label + ' et effacer la trace ?')) return;
    if(live.status !== 'running' && !confirm('Démarrer la course ' + label + ' ? Le suivi devient visible par tous.')) return;
    lastS = at ? null : 0; lastAccT = 0; lastTrackS = -1;
    await ref.update({ status: 'running', startedAt: at || firebase.database.ServerValue.TIMESTAMP, finishedAt: null, passages: null, track: null, pos: null });
    startGps();
  }
  async function finish(){
    if(!confirm('Déclarer l\'arrivée maintenant ? Le chrono s\'arrête pour tout le monde.')) return;
    const t = now();
    const up = { status: 'finished', finishedAt: t };
    if(!(live.passages && live.passages.finish)) up['passages/finish'] = t;
    await ref.update(up); stopGps();
  }
  async function reset(){
    if(!confirm('Réinitialiser le suivi (statut « pas encore parti », trace effacée) ?')) return;
    stopGps(); lastS = null;
    await ref.update({ status: 'idle', startedAt: null, finishedAt: null, passages: null, track: null, pos: null });
  }
  async function saveGarmin(){
    const v = $('garmin').value.trim();
    if(v && !/^https:\/\/(livetrack\.garmin\.com|share\.garmin\.com)\//.test(v)){ msg('Collez un lien Garmin LiveTrack (https://livetrack.garmin.com/…).', true); return; }
    await ref.update({ garmin: v || null }); msg(v ? 'Lien Garmin enregistré : il apparaît sur la page de suivi.' : 'Lien Garmin retiré.');
  }

  // ─── GPS ──────────────────────────────────────────────────────────────────
  function startGps(){
    if(!navigator.geolocation){ msg('La localisation n\'est pas disponible sur cet appareil.', true); return; }
    if(watch !== null) return;
    watch = navigator.geolocation.watchPosition(onFix, function(e){
      msg(e.code === 1 ? 'Localisation refusée : autorisez-la pour ce site (Réglages › Safari › Position).' : 'Recherche du signal GPS…', e.code === 1);
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
    wake(); render();
  }
  function stopGps(){
    if(watch !== null) navigator.geolocation.clearWatch(watch);
    watch = null;
    try { if(wakeLock) wakeLock.release(); } catch(e) {}
    wakeLock = null; render();
  }
  async function wake(){
    try { if('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch(e) { wakeLock = null; }
    render();
  }
  function onFix(p){
    const c = p.coords, t = now();
    lastFix = { lat: c.latitude, lon: c.longitude, acc: Math.round(c.accuracy || 0), spd: c.speed === null ? null : +c.speed.toFixed(2), ts: t };
    if(live.status !== 'running'){ render(); return; }
    // distance le long du parcours : projection dans une fenêtre autour de la dernière position connue
    const el = live.startedAt ? (t - live.startedAt) / 1000 : 0;
    let pr;
    if(lastS === null){ const exp = el * PLAN_SPEED; pr = SuiviGeo.project([c.latitude, c.longitude], exp - 6000, exp + 6000); }
    else pr = SuiviGeo.project([c.latitude, c.longitude], lastS - 300, lastS + Math.max(2500, (t - lastAccT) / 1000 * 6));
    let s = lastS === null ? 0 : lastS;
    const dt = lastAccT ? Math.max(1, (t - lastAccT) / 1000) : 1e6;
    if(pr.d < 120 && (c.accuracy || 0) < 80 && (lastS === null || pr.s - s < dt * 8 + 150)){ s = lastS === null ? pr.s : Math.max(s, pr.s); lastAccT = t; }
    else if(lastS === null){ render(); return; }        // pas encore sur le parcours : on attend une position fiable
    lastFix.s = Math.round(s); lastFix.off = Math.round(pr.d);
    // passages
    const up = {};
    SUIVI_DATA.points.forEach(function(pt){ if(lastS !== null && lastS < pt.s && s >= pt.s && !(live.passages && live.passages[pt.id])) up['passages/' + pt.id] = t; });
    lastS = s;
    if(t - lastWrite >= 5000 || Object.keys(up).length){
      lastWrite = t; up.pos = lastFix;
      ref.update(up).then(function(){ sent++; render(); }, function(e){ msg('Envoi refusé : ' + e.message, true); });
    }
    if(t - lastTrack >= 45000 || Math.abs(s - lastTrackS) >= 400){
      lastTrack = t; lastTrackS = s;
      ref.child('track').push([+c.latitude.toFixed(5), +c.longitude.toFixed(5), t, Math.round(s)]);
    }
    render();
  }

  // ─── Affichage ────────────────────────────────────────────────────────────
  function render(){
    if($('panel').hidden) return;
    const st = live.status || 'idle', t = now();
    $('st').textContent = st === 'running' ? 'En course' : st === 'finished' ? 'Arrivé' : 'Pas encore parti';
    $('st').className = 'pill ' + st;
    $('chrono').textContent = live.startedAt ? suiviFmt.dur((live.finishedAt || t) - live.startedAt) : '–';
    $('dist').textContent = live.pos ? suiviFmt.km(live.pos.s * SuiviGeo.scale) + ' km' : '–';
    $('gps').textContent = watch === null ? 'arrêté sur ce téléphone' : lastFix ? 'actif · précision ' + lastFix.acc + ' m' + (lastFix.off > 120 ? ' · hors parcours (' + lastFix.off + ' m)' : '') : 'recherche du signal…';
    $('gps').className = watch === null ? 'bad' : 'ok';
    $('last').textContent = live.pos ? suiviFmt.ago(t - live.pos.ts) + ' · ' + sent + ' envois' : '–';
    $('wake').textContent = watch === null ? '–' : wakeLock ? 'écran maintenu allumé' : 'non garanti : réglez le verrouillage auto sur « Jamais »';
    $('wake').className = watch === null ? '' : wakeLock ? 'ok' : 'bad';
    $('b-start').hidden = st === 'running';
    $('b-resume').hidden = !(st === 'running' && watch === null);
    $('b-finish').hidden = st !== 'running';
    $('b-black').hidden = watch === null;
  }

  // écran noir anti-touches (économise la batterie sur écran OLED) ; appui long pour revenir
  function black(on){
    const o = $('black'); o.hidden = !on;
    if(on){
      let tm = null;
      o.onpointerdown = function(){ o.classList.add('hold'); tm = setTimeout(function(){ black(false); }, 1500); };
      o.onpointerup = o.onpointercancel = function(){ o.classList.remove('hold'); clearTimeout(tm); };
    }
  }

  return {
    init: init, start: function(){ start(null); }, startAt: function(){ const v = $('t-start').value || '09:15'; start(suiviFmt.planned(v)); },
    resume: startGps, finish: finish, reset: reset, saveGarmin: saveGarmin, black: black,
    logout: function(){ stopGps(); firebase.auth().signOut(); },
  };
})();
document.addEventListener('DOMContentLoaded', function(){ SuiviAdmin.init(); });
