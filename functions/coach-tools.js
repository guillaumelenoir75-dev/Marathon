// Outils du Coach (coachChat) : au lieu de tout recevoir d'avance, le Coach va chercher ce dont il a besoin —
// une séance précise (splits, blocs, météo, ressenti), une comparaison, les séances faites ou prévues sur une période,
// la météo d'un jour, son niveau et ses records — et tient la liste des points à suivre (suivi_ouvrir / suivi_fermer).
// Les données viennent du moteur de l'app (functions/engine.js) sur tout l'historique (prépas, Strava), comme dans l'app.
'use strict';
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();
const helpers = require('./helpers');
const { loadEngine } = require('./engine');

const D = { type: 'string', description: 'Date AAAA-MM-JJ' };
const COACH_TOOLS = [
  { name: 'detail_seance', description: 'Détail complet d\'une séance faite : consigne, km, allure, FC, durée, allure sur plat, dénivelé, cadence, météo, effort ressenti, douleur, ressenti écrit, blocs du fractionné / tempo et allure + FC km par km. À appeler dès qu\'on parle d\'une séance précise (« mardi », « hier », « ma dernière longue ») ou de ses splits.',
    input_schema: { type: 'object', properties: { date: D, titre: { type: 'string', description: 'Facultatif : type ou titre (ex. « longue », « fractionné ») si plusieurs séances ce jour-là' } }, required: ['date'] } },
  { name: 'comparer_seances', description: 'Compare deux séances faites (allure, FC, km, allure sur plat, météo, effort) avec les écarts calculés.',
    input_schema: { type: 'object', properties: { date_a: D, date_b: D, titre: { type: 'string', description: 'Facultatif : type de séance à prendre ces jours-là' } }, required: ['date_a', 'date_b'] } },
  { name: 'seances_faites', description: 'Liste des séances faites sur une période (40 au plus, les plus récentes) : date, titre, type, km, allure, FC, effort, douleur. Pour retrouver « ma dernière longue », « mes fractionnés du mois »…',
    input_schema: { type: 'object', properties: { du: D, au: D, type: { type: 'string', enum: ['tous', 'ef', 'long', 'tempo', 'frac', 'race'] } }, required: ['du', 'au'] } },
  { name: 'seances_prevues', description: 'Séances prévues du plan sur une période (25 au plus) : date, heure, titre, type, km, consigne.',
    input_schema: { type: 'object', properties: { du: D, au: D }, required: ['du', 'au'] } },
  { name: 'meteo', description: 'Météo prévue (16 jours au plus) ou des 3 derniers jours, à l\'heure donnée, à la dernière position connue du téléphone : température, ressenti, humidité, vent, pluie.',
    input_schema: { type: 'object', properties: { date: D, heure: { type: 'string', description: 'HH:MM (facultatif, sinon l\'heure de la séance prévue ce jour-là, sinon 12:00)' } }, required: ['date'] } },
  { name: 'niveau_et_records', description: 'Niveau du moment (VDOT), temps prévu sur la course objectif, temps équivalents 5 km → marathon, records, allure EF réelle, plafond FC de l\'EF, allures par zone.',
    input_schema: { type: 'object', properties: {} } },
  { name: 'suivi_ouvrir', description: 'Ouvre un point à suivre (douleur ou gêne, essai d\'une chaussure / d\'un gel / d\'une routine, fatigue inhabituelle, question à revoir) : tu en reprendras des nouvelles plus tard.',
    input_schema: { type: 'object', properties: { texte: { type: 'string', description: 'Court, ≤ 100 caractères (ex. « Mollet gauche qui tire depuis la sortie longue »)' }, type: { type: 'string', enum: ['douleur', 'essai', 'fatigue', 'question', 'autre'] }, relancer_le: D }, required: ['texte', 'type'] } },
  { name: 'suivi_fermer', description: 'Ferme un point à suivre réglé (id de la liste « Points à suivre »), avec une conclusion courte.',
    input_schema: { type: 'object', properties: { id: { type: 'string' }, conclusion: { type: 'string' } }, required: ['id'] } },
  { name: 'modifier_plan', description: 'Prépare une modification du plan d\'entraînement (déplacer, alléger, découper, changer la consigne, les km, ajouter un échauffement, retirer une séance…). L\'app calcule les changements et les montre à valider (Valider / Non merci) : c\'est la SEULE façon de changer le plan. À appeler dès qu\'une modification est demandée ou acceptée (« oui », « fais-le »).',
    input_schema: { type: 'object', properties: { demande: { type: 'string', description: 'La modification complète et autonome, avec la séance, son jour et ce qui change (ex. « Séance course de dimanche 22 novembre : 2,5 km d\'échauffement EF + 3 accélérations, puis 10 km de course à 4\'12/km, soit 12,5 km au total »)' } }, required: ['demande'] } }
];
// libellé court annoncé à l'app pendant la recherche (petite phrase d'attente du Coach à la voix)
const TOOL_SAY = { modifier_plan: 'Je prépare le changement.', detail_seance: 'Je regarde ta séance.', comparer_seances: 'Je compare les deux.', seances_faites: 'Je regarde tes séances.', seances_prevues: 'Je regarde ton plan.', meteo: 'Je regarde la météo.', niveau_et_records: 'Je regarde ton niveau.' };

const pace = (sec) => sec > 0 ? Math.floor(sec / 60) + "'" + String(Math.round(sec % 60)).padStart(2, '0') : null;
const paceSec = (p) => { const m = String(p || '').match(/(\d{1,2})\s*[:'’]\s*(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
const DOW = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const dow = (d) => DOW[new Date(d + 'T12:00:00Z').getUTCDay()];
const isoOk = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : null; };
const r1 = (v) => v == null ? null : Math.round(v * 10) / 10;

// ─── chargement : état + prépas + historique Strava → moteur ; gardé 90 s (une conversation) ───
let _ct = null;
async function ctLoad(db, uid, today) {
  if (_ct && _ct.uid === uid && _ct.today === today && Date.now() - _ct.at < 90000) return _ct;
  const base = `users/${uid}`;
  const state = (await db.ref(base + '/state').once('value')).val() || {};
  const idx = (await db.ref(base + '/prep_index').once('value')).val() || {};
  const ids = Object.keys(idx).filter((id) => id !== state._prep_id);
  const snapsArr = await Promise.all(ids.map((id) => db.ref(base + '/preps/' + id).once('value').then((s) => s.val()).catch(() => null)));
  const snaps = {}; ids.forEach((id, i) => { const s = snapsArr[i]; if (s) snaps[id] = (!s._plan_engine && !s.plan_start_date) ? Object.assign({}, s, { plan_start_date: '2026-03-09' }) : s; });
  const strava = (await db.ref(base + '/strava_history').once('value').catch(() => null));
  const E = loadEngine({ state, now: today + 'T12:00:00Z', prepIndex: idx, snaps, strava: strava ? strava.val() : null, admin: true });
  _ct = { uid, today, at: Date.now(), E, state, db, base };
  return _ct;
}
function ctReset() { _ct = null; }
// points à suivre : seulement la liste, sans charger tout l'historique (réponse immédiate)
async function ctLight(db, uid, today) {
  if (_ct && _ct.uid === uid && _ct.today === today && Date.now() - _ct.at < 90000) return _ct;
  const base = `users/${uid}`;
  const th = (await db.ref(base + '/state/_coach_threads').once('value')).val() || {};
  return { uid, today, db, base, state: { _coach_threads: th }, light: true };
}
const LIGHT_TOOLS = ['suivi_ouvrir', 'suivi_fermer', 'modifier_plan'];
// modification du plan : transmise à l'app (événement planAsk), qui la fait préparer par « Mon plan » (fonction planChat) et la montre à valider
function ctPlanAsk(input) {
  const d = String((input && input.demande) || '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 400);
  if (d.length < 6) return { erreur: 'demande trop vague : précise la séance, le jour et ce qui change' };
  return { planAsk: d, transmis: true, consigne: 'L\'app prépare ce changement et le montre à valider (Valider / Non merci). Dis seulement, en une phrase, que tu prépares le changement à valider. Ne dis JAMAIS que c\'est fait, noté ou mis à jour : c\'est la validation qui l\'applique.' };
}

// ─── séances ───
function ctLine(s, E) {
  const p = s.perf || {};
  const o = { date: s.date, jour: dow(s.date), titre: s.title || s.type, type: s.type, km: r1(s.km), allure: p.pace ? pace(paceSec(p.pace)) : null, fc: parseInt(p.hr) || null, duree: p.dur || null };
  try { const L = E && E.prEqPaceLabel ? E.prEqPaceLabel(p, s.km) : ''; if (L) o.sur_plat = L.replace(/^≈\s*/, ''); } catch (e) {}
  if (p.rpe) o.effort = p.rpe + '/10';
  if (p.pain && p.pain.level) o.douleur = p.pain.level + '/3' + (p.pain.zone ? ' ' + p.pain.zone : '');
  if (p.note) o.ressenti = String(p.note).slice(0, 140);
  if (s.ext) o.source = 'Strava (hors plan)';
  return o;
}
function ctDetail(s, E) {
  const o = ctLine(s, E), p = s.perf || {}, st = p.strava || {};
  if (s.detail) o.consigne = String(s.detail).slice(0, 200);
  if (s.kmPlan && Math.abs(s.kmPlan - s.km) > 0.2) o.km_prevus = r1(s.kmPlan);
  const fm = parseInt(st.fcMax || st.fc_max) || null; if (fm) o.fc_max = fm;
  const cad = parseInt(st.cadence_moy || st.cadence) || null; if (cad) o.cadence = cad;
  const dp = num(st.denivele_pos); if (dp != null) o.d_plus = Math.round(dp) + ' m';
  if (p.meteo) o.meteo = { temperature: num(p.meteo.temperature) != null ? Math.round(p.meteo.temperature) + '°C' : null, humidite: p.meteo.humidity != null ? Math.round(p.meteo.humidity) + ' %' : undefined, vent: p.meteo.wind != null ? Math.round(p.meteo.wind) + ' km/h' : undefined };
  if (p.journal) o.journal = String(p.journal).slice(0, 400);
  const B = (p.blocsAllure || []).filter(Boolean); if (B.length) o.blocs = B.map((b, i) => 'bloc ' + (i + 1) + ' : ' + String(b).replace(':', "'") + '/km');
  try { const C = E && E.slCheck ? E.slCheck(s) : null; if (C) o.controle = { verdict: C.label, resume: C.line, notes: C.notes }; } catch (e) { /* contrôle facultatif */ }
  if (p.whoop && p.whoop.workout_strain != null) o.whoop_effort = r1(p.whoop.workout_strain);
  const sp = st.splits || st.splits_par_km;
  if (Array.isArray(sp) && sp.length) o.splits = sp.slice(0, 45).map((x) => ({ km: x.km, allure: x.allure ? pace(paceSec(x.allure)) : null, fc: x.fc || null, sur_plat: x.gap ? pace(x.gap) : undefined, denivele: x.dz != null ? x.dz : undefined }));
  if ((s.type === 'frac' || s.type === 'tempo') && Array.isArray(st.laps) && st.laps.length > 1) o.tours = st.laps.slice(0, 30).map((l) => ({ n: l.index, km: l.distanceKm, allure: l.allure ? pace(paceSec(l.allure)) : null, fc: l.fc || null }));
  return o;
}
function ctDone(T) { try { return T.E.prAllDone(T.today) || []; } catch (e) { return []; } }
// séance faite à une date (le titre départage, sinon la plus longue)
function ctFind(T, date, titre) {
  const L = ctDone(T).filter((s) => s.date === date);
  if (!L.length) return null;
  if (titre) {
    const q = String(titre).toLowerCase(), M = { longue: 'long', long: 'long', fractionn: 'frac', vma: 'frac', tempo: 'tempo', seuil: 'tempo', footing: 'ef', ef: 'ef', endurance: 'ef', course: 'race' };
    const ty = Object.keys(M).find((k) => q.includes(k));
    const hit = L.find((s) => (ty && s.type === M[ty]) || String(s.title || '').toLowerCase().includes(q));
    if (hit) return hit;
  }
  return L.sort((a, b) => b.km - a.km)[0];
}
function ctNear(T, date) {
  const t = new Date(date + 'T12:00:00Z').getTime();
  return ctDone(T).filter((s) => Math.abs(new Date(s.date + 'T12:00:00Z').getTime() - t) <= 4 * 86400000).map((s) => s.date + ' (' + dow(s.date) + ') ' + (s.title || s.type) + ' ' + r1(s.km) + ' km');
}

// ─── météo (Open-Meteo, dernière position du téléphone) ───
async function ctMeteo(T, input, deps) {
  let loc = T.state._last_location; try { if (typeof loc === 'string') loc = JSON.parse(loc); } catch (e) { loc = null; }
  if (!loc || !loc.lat) return { erreur: 'Position inconnue : ouvre la météo dans l\'app une fois pour la donner.' };
  const date = input.date; if (!isoOk(date)) return { erreur: 'date invalide' };
  let h = /^\d{1,2}:\d{2}$/.test(String(input.heure || '')) ? String(input.heure) : null;
  if (!h) { try { const s = (T.E.prSessions(T.state) || []).find((x) => x.date === date && !x.done && x.x && x.x.sched_time); if (s) h = s.x.sched_time; } catch (e) {} }
  h = h || '12:00';
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + loc.lat + '&longitude=' + loc.lng + '&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,weather_code&timezone=Europe%2FParis&start_date=' + date + '&end_date=' + date;
  const f = (deps && deps.fetch) || helpers.fetchWithTimeout;
  const r = await f(url, {}, 8000);
  if (!r || !r.ok) return { erreur: 'Météo indisponible pour cette date (prévisions à 16 jours au plus).' };
  const j = await r.json(), H = j.hourly || {}, i = (H.time || []).indexOf(date + 'T' + String(h).padStart(5, '0').slice(0, 2) + ':00');
  if (i < 0) return { erreur: 'Heure introuvable' };
  const WMO = { 0: 'ciel clair', 1: 'plutôt dégagé', 2: 'nuageux', 3: 'couvert', 45: 'brouillard', 48: 'brouillard', 51: 'bruine', 53: 'bruine', 55: 'bruine', 61: 'pluie faible', 63: 'pluie', 65: 'forte pluie', 71: 'neige', 80: 'averses', 81: 'averses', 82: 'fortes averses', 95: 'orage' };
  return { date, jour: dow(date), heure: h, temperature: Math.round(H.temperature_2m[i]) + '°C', ressenti: Math.round(H.apparent_temperature[i]) + '°C', humidite: Math.round(H.relative_humidity_2m[i]) + ' %', vent: Math.round(H.wind_speed_10m[i]) + ' km/h', pluie: r1(H.precipitation[i]) + ' mm', ciel: WMO[H.weather_code[i]] || null, lieu: 'dernière position du téléphone' };
}

// ─── niveau, prédiction, records ───
function ctLevel(T) {
  const E = T.E, st = T.state, o = {};
  try {
    const fit = E.prFitness(st, { today: T.today, races: E.prKnownRaces ? E.prKnownRaces() : [] });
    if (fit && fit.vdot) {
      o.niveau_vdot = r1(fit.vdot);
      o.temps_equivalents_aujourd_hui = {};
      [['5 km', 5000], ['10 km', 10000], ['semi', 21097.5], ['marathon', 42195]].forEach(([k, m]) => { o.temps_equivalents_aujourd_hui[k] = E.prTime(E.raceTimeFromVdot(fit.vdot, m)); });
    }
  } catch (e) {}
  try {
    const R = E.ctx.prepRace ? E.ctx.prepRace() : {}, cat = E.predRaceCat(R);
    const P = cat ? E.predRace(cat, T.today) : null;
    if (P) o.prediction = { course: R.name || cat, temps_prevu: E.prTime(P.sec), allure: pace(P.pace), au: P.race ? 'jour de la course (' + P.date + ')' : 'aujourd\'hui', fourchette: P.lo ? E.prTime(P.lo) + ' – ' + E.prTime(P.hi) : undefined, objectif: R.objectif || undefined };
  } catch (e) {}
  const rec = {}; [['5 km', 'record_5km'], ['10 km', 'record_10km'], ['semi', 'record_semi'], ['marathon', 'record_marathon']].forEach(([k, f]) => { if (st[f]) rec[k] = String(st[f]); });
  if (Object.keys(rec).length) o.records = rec;
  try { const ef = E.prObservedEf(st, T.today); if (ef) o.allure_ef_reelle = pace(ef) + '/km'; } catch (e) {}
  try { o.plafond_fc_ef = E.hrEfMax(st); } catch (e) {}
  try { const Z = E.bsZonePaces(T.today); if (Z) o.allures_par_zone = Z; } catch (e) {}
  return o;
}

// ─── points à suivre ───
async function ctThreadOpen(T, input) {
  const t = String(input.texte || '').replace(/\s+/g, ' ').trim().slice(0, 120); if (t.length < 3) return { erreur: 'texte requis' };
  const T0 = T.state._coach_threads || {};
  const dup = Object.keys(T0).find((id) => !T0[id].done && String(T0[id].t).toLowerCase() === t.toLowerCase()); if (dup) return { ok: true, id: dup, deja: true };
  const tm = new Date(T.today + 'T12:00:00Z'); tm.setUTCDate(tm.getUTCDate() + 1);
  const due = isoOk(input.relancer_le) && input.relancer_le > T.today ? input.relancer_le : tm.toISOString().slice(0, 10);
  const id = 'c' + Date.now().toString(36);
  const x = { t, k: ['douleur', 'essai', 'fatigue', 'question', 'autre'].includes(input.type) ? input.type : 'autre', at: Date.now(), due, src: 'coach' };
  await T.db.ref(T.base + '/state/_coach_threads/' + id).set(x);
  T.state._coach_threads = Object.assign({}, T0, { [id]: x });
  return { ok: true, id, relance: due, changed: { [id]: x } };
}
async function ctThreadClose(T, input) {
  const id = String(input.id || ''), T0 = T.state._coach_threads || {};
  if (!T0[id]) return { erreur: 'point inconnu : ' + id };
  const done = { at: Date.now(), c: String(input.conclusion || '').slice(0, 120) };
  await T.db.ref(T.base + '/state/_coach_threads/' + id + '/done').set(done);
  const x = Object.assign({}, T0[id], { done }); T.state._coach_threads = Object.assign({}, T0, { [id]: x });
  return { ok: true, changed: { [id]: x } };
}

// exécute un outil → { out } (objet renvoyé au Coach) ; erreurs rendues comme { erreur } (le Coach le dit, rien ne casse)
async function ctRun(T, name, input, deps) {
  input = input || {};
  try {
    if (name === 'detail_seance') {
      if (!isoOk(input.date)) return { erreur: 'date invalide (AAAA-MM-JJ)' };
      const s = ctFind(T, input.date, input.titre);
      return s ? ctDetail(s, T.E) : { erreur: 'aucune séance faite le ' + input.date + ' (' + dow(input.date) + ')', seances_proches: ctNear(T, input.date) };
    }
    if (name === 'comparer_seances') {
      if (!isoOk(input.date_a) || !isoOk(input.date_b)) return { erreur: 'dates invalides' };
      const a = ctFind(T, input.date_a, input.titre), b = ctFind(T, input.date_b, input.titre);
      if (!a || !b) return { erreur: 'séance introuvable le ' + (!a ? input.date_a : input.date_b), seances_proches: ctNear(T, !a ? input.date_a : input.date_b) };
      const A = ctDetail(a, T.E), B = ctDetail(b, T.E); delete A.splits; delete B.splits; delete A.tours; delete B.tours;
      const pa = paceSec(A.allure), pb = paceSec(B.allure), ec = {};
      if (pa && pb) ec.allure = (pb - pa > 0 ? '+' : '') + (pb - pa) + ' s/km (B ' + (pb < pa ? 'plus rapide' : pb > pa ? 'plus lente' : 'identique') + ')';
      if (A.fc && B.fc) ec.fc = (B.fc - A.fc > 0 ? '+' : '') + (B.fc - A.fc) + ' bpm';
      if (A.km != null && B.km != null) ec.km = (B.km - A.km > 0 ? '+' : '') + r1(B.km - A.km) + ' km';
      const qa = paceSec(A.sur_plat), qb = paceSec(B.sur_plat); if (qa && qb) ec.allure_sur_plat = (qb - qa > 0 ? '+' : '') + (qb - qa) + ' s/km';
      return { a: A, b: B, ecarts_b_moins_a: ec };
    }
    if (name === 'seances_faites') {
      if (!isoOk(input.du) || !isoOk(input.au)) return { erreur: 'dates invalides' };
      const ty = input.type && input.type !== 'tous' ? input.type : null;
      const L = ctDone(T).filter((s) => s.date >= input.du && s.date <= input.au && (!ty || s.type === ty));
      return { nombre: L.length, km_total: r1(L.reduce((a, s) => a + (s.km || 0), 0)), seances: L.slice(-40).map((s) => ctLine(s, T.E)) };
    }
    if (name === 'seances_prevues') {
      if (!isoOk(input.du) || !isoOk(input.au)) return { erreur: 'dates invalides' };
      const L = (T.E.prSessions(T.state) || []).filter((s) => !s.done && !s.skip && s.type !== 'rest' && s.date >= input.du && s.date <= input.au).sort((a, b) => a.date.localeCompare(b.date));
      return { seances: L.slice(0, 25).map((s) => ({ date: s.date, jour: dow(s.date), heure: (s.x && s.x.sched_time) || null, titre: s.title, type: s.type, km: r1(s.kmPlan), consigne: String(s.detail || '').slice(0, 160) })) };
    }
    if (name === 'meteo') return await ctMeteo(T, input, deps);
    if (name === 'niveau_et_records') return ctLevel(T);
    if (name === 'suivi_ouvrir') return await ctThreadOpen(T, input);
    if (name === 'suivi_fermer') return await ctThreadClose(T, input);
    if (name === 'modifier_plan') return ctPlanAsk(input);
    return { erreur: 'outil inconnu' };
  } catch (e) {
    console.warn('coach tool', name, e.message);
    return { erreur: 'donnée indisponible' };
  }
}

module.exports = { COACH_TOOLS, TOOL_SAY, LIGHT_TOOLS, ctLoad, ctLight, ctReset, ctRun, ctFind, ctDetail, ctLine, ctPlanAsk };
