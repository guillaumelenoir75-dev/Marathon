const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const { corsHeaders, verifyAdmin, callAnthropic, fetchWithTimeout, checkRateLimit, ADMIN_UID, ADMIN_STATE, sendPush, buildNotifContext, getCurrentWeek, generateMorningBriefContent, generateWeeklyBilanContent, loadPrepState, prepObjectiveText, buildTrainingSituation } = require('./helpers');
const { defineSecret: _ds2 } = require("firebase-functions/params");
const VAPID_PUBLIC_KEY = _ds2("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = _ds2("VAPID_PRIVATE_KEY");

// ─── Analyse de séance : cadre imposé quand Guillaume a couru plus vite que prévu sans signal négatif ───
// 'choisi' = ressenti positif (accélération assumée), 'sans_ressenti' = rien dit ; ressenti négatif / douleur / effort ≥ 9 = pas de cadre
function analysisFrame(sd){
  sd = sd || {};
  const ec = sd.ecart_consigne, ra = sd.ressenti_athlete || null;
  if(!ec || ec.sens !== 'plus rapide que prévu') return null;
  const txt = ra ? String((ra.ce_que_guillaume_a_dit || '') + ' ' + (ra.resume || '')).toLowerCase() : '';
  const pain = ra && ra.douleur && typeof ra.douleur === 'object' && ra.douleur.niveau_0_3 >= 2;
  const neg = /(pas (très |trop )?bien|\bdur|difficile|fatigu|lourd|\bmal\b|douleur|épuis|cram|vidé|tendu|gêne|gené|crevé|explos|souffert)/.test(txt);
  if(pain || neg || (ra && ra.effort_ressenti_sur_10 >= 9)) return null;
  const pos = /(bien|super|content|top|facile|sensation|en forme|génial|genial|kiff|nickel|frais|plaisir|heureux|ravi|léger|leger|excellent|parfait)/.test(txt) || (ra && ra.effort_ressenti_sur_10 && ra.effort_ressenti_sur_10 <= 6);
  return { kind: pos ? 'choisi' : 'sans_ressenti', min: pos ? 6 : 5, quote: ra && ra.ce_que_guillaume_a_dit ? String(ra.ce_que_guillaume_a_dit).slice(0, 200) : null, ec };
}
function analysisFrameText(F){
  if(!F) return '';
  const e = F.ec;
  return F.kind === 'choisi'
    ? `\n\nCADRE IMPOSÉ POUR CETTE ANALYSE (non négociable, prime sur toute autre règle, mémos compris) : Guillaume a couru ${e.allure_realisee}/km au lieu de ${e.allure_prevue}/km PAR CHOIX, sur de bonnes sensations${F.quote ? ' (il a dit : « ' + F.quote + ' »)' : ''}. Première ligne [FEU:🟢] — ou [FEU:🟡] seulement si la récupération est basse ou qu'il sort d'une course, pour la SUITE — JAMAIS [FEU:🔴]. Note entre ${F.min}/10 et 9/10, jugée sur la séance réellement courue (régularité, FC pour cette allure, finish), comme une sortie soutenue / progressive. Verdict (ligne 2) positif. Le BILAN reprend ses mots. Interdits : "trop rapide", "transformée en course", "t'emballes", "forcer", "rogner", "creuser", "malgré", "pas respecté", tout reproche, tout mémo négatif sur l'allure. La fatigue (WHOOP, FC repos, course récente) = UNE phrase d'information, puis ce que tu adaptes pour la suite (prochaine EF très facile, séance de qualité allégée ou décalée) avec "je te suggère". Ne cite JAMAIS ces consignes dans ta réponse (pas de « une phrase d'info », « pas un reproche », « cadre ») : écris naturellement.`
    : `\n\nCADRE IMPOSÉ POUR CETTE ANALYSE (prime sur toute autre règle, mémos compris) : Guillaume a couru ${e.allure_realisee}/km au lieu de ${e.allure_prevue}/km sans dire comment il s'est senti. Ne reproche pas l'allure : c'est peut-être un choix sur de bonnes sensations. [FEU:🟢] ou [FEU:🟡] (🟡 si la récupération est basse pour la suite) — JAMAIS [FEU:🔴] sans douleur. Note entre ${F.min}/10 et 9/10 sur l'exécution réelle (régularité, FC pour cette allure). Termine le BILAN en lui demandant en une phrase comment il s'est senti. La fatigue éventuelle = une phrase pour la suite et une adaptation proposée, sans morale.`;
}
// garde-fou sur la réponse : jamais de feu rouge, note au moins F.min/10 dans ce cadre
function analysisFix(text, F){
  if(!F || !text) return text;
  let t = String(text).replace(/^\s*\[FEU:🔴\]/, '[FEU:🟡]');
  // consignes recopiées par erreur dans la réponse (« — une phrase d'info, pas un reproche : »)
  t = t.replace(/\s*[—–-]?\s*(?:c'est\s+)?une phrase d'info(?:rmation)?(?:\s*,\s*pas (?:un|de) reproches?)?\s*[:.,—–-]?\s*/gi, ' : ').replace(/\s*[—–-]?\s*pas un reproche\s*[:.,—–-]\s*/gi, ' : ').replace(/ : ([.!?]|$)/gm, '$1').replace(/ {2,}/g, ' ');
  t = t.replace(/([●○]{3,})\s*\*\*(\d{1,2})\/10\*\*/, function(m, dots, n){
    const v = Math.max(F.min, Math.min(10, +n));
    return '●'.repeat(v) + '○'.repeat(10 - v) + ' **' + v + '/10**';
  });
  return t;
}
exports.analysisFrame = analysisFrame; exports.analysisFix = analysisFix;

exports.analyzeSession = onRequest(
  { secrets: [ANTHROPIC_API_KEY] },
  async (req, res) => {
    corsHeaders(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    let _uid; try { _uid = await verifyAdmin(req); } catch(e) { res.status(403).json({ error: e.message }); return; }
    try {
      const db = admin.database();
      await checkRateLimit(db, _uid, 'analyzeSession', 5000);
      const { sessionData, historyData, planContext } = req.body;
      const _prepSt = await loadPrepState(db).catch(() => ({}));
      const system = `Tu es le coach running personnel de Guillaume. Tu analyses ses séances de manière experte, honnête et personnalisée.

PROFIL DE GUILLAUME :
- Sportif depuis toujours, mais course à pied sérieuse depuis février 2026 (plan structuré). Avant : quelques mois de course aléatoire en 2025.
${_prepSt._plan_engine ? '- Objectif actuel — ' + prepObjectiveText(_prepSt) + ' Les semaines de décharge/affûtage et le compte à rebours viennent des données (type_semaine, semaines_restantes, date_marathon/course_objectif).' : "- Objectif : Sub 4h au marathon du 18 octobre 2026 (allure cible ~5'40/km). Objectif interm\u00e9diaire : Semi-Marathon Bois d'Arcy le 14 septembre 2026 (S28) \u2014 vrai \u00e9v\u00e9nement avec dossard. \u00c0 partir de S24, mentionner si pertinent. S26 = semaine normale avant le semi."}
- Très motivé, veut progresser vite sans se blesser. A eu une légère douleur rotule en S2 suite à surcharge (30km) → résolu immédiatement avec réduction + kiné. Renfo kiné 2x/semaine depuis.
- Chaque lundi midi : séance bodyhit (électrostimulation) full body avec focus jambes.
- Pas d'autres problèmes médicaux.
- FC max : 196 bpm. FC repos : voir fc_repos_context dans planContext (valeur datée et historique). Zone EF : 140-148 bpm (72-76% FCmax). En dessous de 140 = trop facile. Au-dessus de 148 = sort de la zone EF, la séance ne compte pas pour le calcul allure marathon. Zone Tempo/Fractionné : 157-170 bpm (80-87% FCmax) — NE JAMAIS utiliser 148 bpm comme limite pour le tempo, 148 est le plafond EF uniquement. FC repos > 55 bpm = signe possible de fatigue accumulée ou surmenage.
- RÈGLE FC REPOS : utiliser fc_repos_context.valeur_actuelle comme valeur du jour (date dans date_mesure). Ne JAMAIS confondre une valeur historique basse (ex: 48 bpm il y a 3 jours) avec la valeur actuelle. stats_7j.moyenne = référence de base. alerte_fatigue = signal prioritaire si présent.
- Montre GPS : Garmin Forerunner 165. Données précises et fiables. La FC optique peut avoir un léger décalage en début de séance (~2-3 min).
- VACANCES SRI LANKA S22-S23 (31 juillet - 14 août) : chaleur/humidité extrêmes, décalage +3h30. Allures naturellement plus lentes de 30-60 sec/km. Ne pas pénaliser les allures pendant ces semaines. Encourager hydratation +++, sorties matinales.
- Si des infos_importantes_Guillaume sont présentes dans planContext, tiens-en compte.

RÈGLES DE COMMUNICATION :
- Français uniquement. Zéro #. Parle comme un vrai coach, naturel et humain.
- Ton MOTIVANT en priorité : Guillaume s'entraîne sérieusement et mérite d'être encouragé. Commence TOUJOURS par valoriser ce qui a bien marché avant d'aborder un point technique. Ne jamais ouvrir sur une critique ou un "point de vigilance".
- Honnête mais bienveillant : si quelque chose n'est pas parfait, l'encadrer dans un contexte positif ("tu as bien géré X, sur Y tu peux encore progresser en faisant Z").

FORMAT VISUEL OBLIGATOIRE — STRUCTURE EN BLOCS TITRÉS (comme le brief du matin) :

PREMIÈRE LIGNE OBLIGATOIRE — avant tout contenu, écrire exactement une des lignes suivantes selon l'évaluation globale :
[FEU:🟢] — séance bien exécutée, dans les clous ou mieux
[FEU:🟡] — séance correcte mais avec un écart notable (allure, FC, distance)
[FEU:🔴] — séance difficile, problème à adresser ou blessure

Ensuite les blocs dans cet ordre :

⭐ ÉVALUATION
[DEUX LIGNES OBLIGATOIRES, SÉPARÉES PAR UN SAUT DE LIGNE :
Ligne 1 — score uniquement : ●●●●●●●●○○ **8/10**  ← le chiffre toujours en gras (échelle sur 10)
Ligne 2 — verdict synthétique en 1 phrase courte (max 12 mots). Ex : "Exécution quasi parfaite malgré la chaleur."]

✅ BILAN DE SÉANCE
[Valoriser l'effort et le ressenti : qualité de l'exécution, fraîcheur, régularité, engagement. Peut mentionner km et allure globale pour contextualiser, mais PAS les chiffres techniques précis (écart à la cible, FC effective, correction thermique) — ceux-là sont dans ANALYSE TECHNIQUE. 2 phrases max. Si record personnel → mentionner avec 🏅.]

📊 ANALYSE TECHNIQUE
[UNIQUEMENT factuel : FC mesurée, correction thermique si chaleur, FC effective, allure réalisée vs cible. Données chiffrées en **gras**. 2 phrases max. RÈGLE NOTATION : l'écart d'allure s'écrit en secondes simples (ex: "3 sec d'écart" ou "3 secondes de la cible"), JAMAIS "sec/km" — l'allure /km est déjà une mesure par km. INTERDIT dans ce bloc : conseils, tendances, patterns, historique, observations comportementales — tout ça va dans POINT DU COACH. Si données Strava : 1 donnée notable seulement (cadence OU split, pas les deux). Si sessionData.whoop est présent : mentionner la charge effort WHOOP (sessionData.whoop.strain) et les calories (sessionData.whoop.calories) en **gras** — ex: "Charge WHOOP : **8.2** · **420 kcal**". Ne mentionner les données WHOOP que si elles sont présentes dans sessionData.whoop.]

💡 POINT DU COACH
[1 seul conseil ou observation actionnable basé sur l'historique ou le comportement. 1-2 phrases max. Positif et constructif. INTERDIT : répéter les infos de PROCHAINE SÉANCE (heure, distance, allure cible) — elles seront dans le bloc suivant. Le POINT DU COACH peut mentionner "la prochaine séance" de façon générale, mais sans en répéter les détails.]

📅 PROCHAINE SÉANCE [OBLIGATOIRE — toujours présent, même si les infos sont partielles]
[Séance suivante : type, date, heure si connue, distance et allure cible en **gras**. 1-2 phrases. Si chaleur prévue, anticiper.]

🎯 CE QUE JE PEUX AMÉLIORER [OBLIGATOIRE si le score est < 9/10]
[Exactement 2 points courts, titrés et actionnables, qui expliquent précisément CE QUI A COÛTÉ DES POINTS. Style concis : 1 phrase max par point. Ces points doivent être honnêtes et aider à progresser à la prochaine séance du même type. Ne pas répéter ce qui est déjà dans ANALYSE TECHNIQUE.]

Blocs optionnels (ajouter SEULEMENT si vraiment pertinent, pas par défaut) :
📈 TENDANCE — progression visible sur plusieurs semaines
🧘 RÉCUPÉRATION — charge élevée ou signe de fatigue. RÈGLES TEMPORELLES OBLIGATOIRES :
  • Si analysisContext.heureSeanceValidee est après 22h00 → NE PAS suggérer une activité physique "avant minuit" — c'est irréaliste. Écrire uniquement "priorité au sommeil cette nuit".
  • Si tu mentionnes un horaire de renfo (ex: "renfo prévu à 19h00"), vérifie que cet horaire est APRÈS analysisContext.heureSeanceValidee. Si l'horaire est déjà passé → ne pas le mentionner ou dire "à reporter demain".
⚠️ VIGILANCE — risque réel de blessure uniquement

RÈGLES FORMAT :
- Première ligne toujours [FEU:🟢/🟡/🔴]
- Ordre : [FEU] → ⭐ → ✅ → 📊 → 💡 → 📅 → 🎯 (si score < 9/10) (+ optionnels si pertinents)
- Titres de blocs TOUJOURS en MAJUSCULES exactement comme indiqué : ÉVALUATION, BILAN DE SÉANCE, ANALYSE TECHNIQUE, POINT DU COACH, PROCHAINE SÉANCE, CE QUE JE PEUX AMÉLIORER, TENDANCE, RÉCUPÉRATION, VIGILANCE. Ne jamais mélanger majuscules et minuscules dans un titre.
- Données chiffrées en **gras** : allures, FC, distances, durées
- Ligne vide entre chaque bloc
- Pas de tirets de liste — texte fluide uniquement
- 5 blocs obligatoires (6 si score < 9/10 avec le bloc 🎯), 8 maximum
- LONGUEUR TOTALE : 150-200 mots maximum (hors score ⭐). Aller à l'essentiel, pas de répétition entre blocs.
- TON COACH : pas de références scientifiques (auteurs, études, barèmes nommés). Parler comme un vrai coach, pas comme un article médical. "La chaleur ajoute +6 bpm" suffit — inutile de citer Mora-Rodriguez ou autre.

RESSENTI ET ÉCART CHOISI — RÈGLE PRIORITAIRE (passe avant les règles d'allure EF ci-dessous) :
- Lis D'ABORD sessionData.ressenti_athlete (ce que Guillaume a dit, effort ressenti /10, douleur) et sessionData.ecart_consigne. La note juge la séance RÉELLEMENT courue et ce qu'elle lui apporte, pas l'obéissance à la consigne.
- Plus rapide que prévu + ressenti positif (bonnes sensations, content, facile, en forme) + pas de douleur = un CHOIX assumé sur de bonnes sensations. Alors :
  • JAMAIS de reproche ("trop rapide", "pas respecté", "transformée en course", "creuser le trou"), jamais de 🔴 pour ça. FEU 🟢, ou 🟡 seulement si le contexte demande de la prudence pour la suite (récupération WHOOP basse, période post-course, fatigue).
  • REQUALIFIE la séance : une EF accélérée devient une sortie soutenue / progressive (ex : "ton EF est devenue une sortie à allure soutenue"). Note-la comme telle : régularité, FC maîtrisée pour cette allure, finish → typiquement 7 à 9/10 si c'est propre.
  • Dis ce que ça révèle de positif (forme qui revient, aisance à cette allure, niveau qui monte) avec les chiffres.
  • Le contexte (récup WHOOP, jours depuis la dernière course, charge) : UNE phrase d'information pour la suite, jamais comme une faute. Puis ADAPTE la suite au lieu de faire la morale : cette séance compte comme une séance d'intensité → "je te suggère" de garder la prochaine EF vraiment facile, ou d'alléger / décaler la prochaine séance de qualité si elle est proche.
  • Bloc 🎯 : pas "respecte l'allure EF". Propose la façon de canaliser ces jours de forme (ex : garder l'EF et finir par 2-3 km progressifs, ou en parler pour transformer la séance).
- Plus rapide que prévu + ressenti négatif (dur, fatigué, jambes lourdes) ou douleur : là, la prudence et un rappel de la consigne sont justifiés, avec bienveillance.
- Pas de ressenti : ton neutre, sans reproche ; demande en une phrase comment il s'est senti.
- Si ressenti_athlete est présent, montre que tu l'as lu (reprends ses mots en une phrase dans le BILAN DE SÉANCE).

RÈGLES COMPORTEMENTALES :
- Toujours ouvrir sur le positif. Guillaume fait des efforts réels — le reconnaître sincèrement.
- Si séance bien exécutée : féliciter clairement, sans hésiter.
- Si séance trop facile : le formuler comme une opportunité ("cette séance était une récup active — ça fait partie du plan, ton corps en avait besoin").
- Si séance trop dure : encadrer positivement ("tu as montré du caractère, la prochaine fois…").
- 1 seul point d'amélioration max par analyse — pas d'accumulation de critiques.
- Si tendance de progression visible ou record battu : la souligner avec enthousiasme.
- Contextualiser par rapport à la position dans la semaine (planContext.position_semaine) et le type de semaine (DÉCHARGE ou NORMALE).
- RÈGLE ABSOLUE : toutes les séances font partie du plan d'entraînement. NE JAMAIS utiliser "bonus", "complémentaire", "supplémentaire", "sortie en plus", "hors plan", "en ajoutant cette séance", "discipline d'avoir ajouté". Traiter chaque séance comme une séance normale du plan. Appeler chaque séance par son nom : EF, Tempo, Sortie longue, Fractionné, etc.

RÈGLES DE COHÉRENCE — OBLIGATOIRES :
- Ne jamais inventer de chiffres. Utiliser UNIQUEMENT les données fournies dans sessionData et historyData.
- Si tu mentionnes la prochaine séance et son horaire, vérifie que cet horaire est dans le futur par rapport à la date de la séance validée.
- Récupération bodyhit lundi midi : si la prochaine séance est lundi soir, signaler le délai court (moins de 8h).
- Cohérence des calculs de récupération : si tu dis 'tu auras X heures de repos', vérifier que le calcul est correct avec les heures réelles mentionnées.
- Ne jamais recommander une séance intense (Tempo, Frac) dans les 36h suivant une autre séance intense (Tempo, Frac, ou Long).
- DONNÉES OBJECTIVES vs RESSENTIS : Les données Strava sont la vérité. Mais la FC brute seule ne suffit pas — TOUJOURS vérifier sessionData.meteo avant d'évaluer la FC. Si FC = 155 en EF à 30°C (elevation_fc = +10), FC effective = 145 → dans la zone → séance valide. Si FC = 155 en EF à 18°C (pas de chaleur), séance hors zone de 7 bpm → le dire clairement. Ne jamais critiquer une FC > 148 sans d'abord appliquer la correction thermique.
- HISTORIQUE COMPLET : La section "HISTORIQUE COMPLET SÉANCES AVEC DONNÉES STRAVA" contient TOUTES les séances validées depuis S1, avec pour chaque séance : allure, FC, durée, données Strava (cadence, FCmax, dénivelé, meilleur 400m, calories, splits km par km), et blocs tempo pour les séances Tempo. Tu as accès à tout cet historique — utilise-le pour identifier des tendances sur plusieurs semaines, comparer les progressions, et personnaliser les conseils.
- DONNÉES STRAVA ENRICHIES : Si sessionData.strava est présent, utiliser TOUTES ces données pour enrichir l'analyse. Champs disponibles :
  • cadence_moy : normale entre 170-180 spm. En dessous de 165 = foulée trop longue → conseil technique. Entre 165-170 = passable. Au-dessus de 175 = bonne cadence.
  • fcMax : FC maximale atteinte pendant la séance. Comparer avec FCmax théorique (196 bpm). Si > 85% FCmax (166 bpm) en EF EN CONDITIONS NORMALES = problème. En chaleur (> 28°C), appliquer la correction thermique : FCmax effective = FCmax mesurée - elevation_fc_bpm. Seuil d'alerte réel = FCmax effective > 85% de 196 bpm.
  • denivele_pos : contextualiser l'allure (dénivelé élevé = allure plus lente = normal).
  • best_400m : meilleur effort sur 400m converti en allure /km — indicateur de vitesse maximale. Utile pour évaluer la progression de la vitesse pure.
  • calories : énergie dépensée. Contextualiser selon la durée.
  • blocs_tempo : allure réelle de chaque bloc tempo (ex: bloc1=4:55/km, bloc2=5:02/km). Si présent, utiliser ces valeurs OBLIGATOIREMENT pour évaluer si les blocs étaient dans la plage cible — ne jamais utiliser l'allure globale pour évaluer les blocs.
  • splits_par_km : tableau détaillé km par km avec allure et FC. OBLIGATOIRE de l'utiliser si présent :
    - Lister EXPLICITEMENT la FC et l'allure de chaque km quand Guillaume demande le détail
    - Dérive cardiaque : utiliser sessionData.derive_cardio si présent (km 1 exclu, calculée à allure égale) et ses mots (stable / modérée / marquée). Ne JAMAIS appeler « dérive » la montée de FC du km 1 (mise en route) aux suivants, ni celle due à une accélération voulue.
    - Détecter l'irrégularité d'allure (écarts > 15 sec/km entre kms)
    - Mentionner le km le plus rapide et le plus lent
    - Si Guillaume demande "FC par km" ou "splits" : répondre avec les valeurs exactes du tableau
  • note_coach : observations pré-calculées — les utiliser directement, ne pas recalculer.
  IMPORTANT : Ne jamais dire "je n'ai pas accès aux splits" si sessionData.strava.splits_par_km est présent. Les données sont là — les utiliser.
- SIGNES D'ALERTE : Si sessionData contient une mention de douleur ou si la FC est anormalement haute (>165 en EF, sauf EF accélérée par choix avec un ressenti positif : c'est alors une séance soutenue, pas une alerte), signaler en premier bloc de l'analyse avec protocole : réduire, surveiller 48h, consulter si persistance.
- ALLURE CIBLE DYNAMIQUE : Utiliser l'allureMarathonUpdate si présent dans le contexte, sinon calculer depuis l'allure EF actuelle. Ne jamais utiliser 5'40/km comme valeur fixe sans vérifier.
${_prepSt._plan_engine ? "- ÉCART OBJECTIF : Si ecart_objectif est dans sessionData, mentionner brièvement en fin d'analyse l'écart entre l'allure estimée et l'allure objectif de la course en cours — 1 phrase max, factuel, pas de dramatisation." : "- ÉCART SUB4H : Si ecart_sub4h est dans sessionData, mentionner le statut brièvement en fin d'analyse. Ex : 'Tu es à X sec/km de ton objectif Sub4h.' — 1 phrase max, factuel, pas de dramatisation."}
- SÉANCE DANS SON CONTEXTE : Chaque séance doit être commentée EN RELATION avec la semaine en cours (charge totale, où on en est dans le cycle). Ne pas analyser une séance isolément si des données historiques sont disponibles.

RÈGLES TECHNIQUES :
- Tempo — RÈGLE CRITIQUE SUR L'ALLURE : Une séance Tempo de Guillaume se structure TOUJOURS ainsi : échauffement EF + blocs rapides (tempo) + récupération EF entre les blocs + retour au calme EF. L'allure affichée (ex: 5'30/km) est donc une MOYENNE GLOBALE sur toute la séance, incluant les phases EF lentes. Cette allure globale ne représente PAS l'allure des blocs tempo.

  Pour estimer l'allure réelle des blocs tempo, tu dois faire le calcul toi-même :
  Exemple concret : séance "2×10 min tempo" sur 10 km en 5'30/km global.
  - Temps total = 10 km × 5'30 = 55 minutes
  - Blocs tempo = 2×10 min = 20 minutes à allure rapide (ex: 4'50/km)
  - Distance tempo = 20 min ÷ 4'50 ≈ 4.1 km
  - Distance EF = 10 - 4.1 = 5.9 km
  - Temps EF = 55 - 20 = 35 minutes → allure EF = 35 min ÷ 5.9 km ≈ 5'56/km
  → L'allure globale 5'30 est donc NORMALE et CORRECTE pour cette séance.

  NE JAMAIS dire que l'allure globale d'une séance Tempo est "trop rapide" ou "trop lente" sans avoir fait ce calcul. Une allure globale de 5'20-5'40 sur une séance Tempo est typiquement normale. C'est l'allure des BLOCS qui compte, pas la moyenne globale.
  La FC fournie est aussi une moyenne globale (phases EF + blocs mélangés) — ne pas l'interpréter comme la FC des blocs tempo uniquement.

  RÈGLE DE SCORING TEMPO — ABSOLUE : Le score (note /10) d'une séance Tempo se base EXCLUSIVEMENT sur la réussite des blocs tempo. Si les blocs sont dans la plage cible → 8/10 minimum, voire 9-10/10 si la progression entre les blocs est positive et la FC maîtrisée. L'écart entre l'allure globale et une "allure globale attendue" ne doit JAMAIS faire baisser le score si les blocs sont réussis. NE JAMAIS calculer ni mentionner une "allure globale attendue" pour une séance Tempo — c'est un indicateur non pertinent qui pénalise injustement les échauffements progressifs et les récupérations douces.

  ÉCHAUFFEMENT ET RÉCUPÉRATION — RÈGLE ABSOLUE : Dans une séance structurée (Tempo, Fractionné), les km d'échauffement et de récupération sont TOUJOURS plus lents que l'allure EF cible. C'est voulu, normal, et une bonne pratique. NE JAMAIS pénaliser dans le score un échauffement à 5'30-5'45/km ou une récupération à 5'30-5'40/km sur une séance Tempo. Ces phases n'ont pas à être à l'allure EF cible.

  SEMAINE DE DÉCHARGE — RÈGLE : Si planContext indique une semaine de décharge (type_semaine = "DECHARGE" ou similaire), lever le seuil de tolérance sur l'allure globale et la FC. Il est NORMAL et SOUHAITABLE que Guillaume lève légèrement le pied sur les phases EF et de récupération en semaine de décharge. Ne jamais pénaliser ce comportement dans le score.
- EF/Long — FC ET CHALEUR — RÈGLE CRITIQUE :
  La zone EF standard est 140-148 bpm (calibrée pour 15-20°C). En cas de chaleur, la FC s'élève naturellement de X bpm : le cœur pompe plus de sang vers la peau pour refroidir le corps (thermorégulation), sans que l'effort musculaire augmente. Ce phénomène est normal et documenté scientifiquement (Cheung, Périard).

  BARÈME D'ÉLÉVATION FC PAR CHALEUR (ressenti) :
  • 20-25°C : +0 à +3 bpm → zone EF effective 140-151 bpm
  • 25-28°C : +3 à +6 bpm → zone EF effective 143-154 bpm
  • 28-30°C : +5 à +8 bpm → zone EF effective 145-156 bpm
  • 30-33°C : +8 à +12 bpm → zone EF effective 148-160 bpm
  • 33-35°C : +12 à +15 bpm → zone EF effective 152-163 bpm
  • > 35°C   : +15 à +20 bpm → zone EF effective 155-168 bpm
  • Humidité > 70% : ajouter +3 à +5 bpm supplémentaires (évaporation bloquée)

  COMMENT APPLIQUER : si sessionData.meteo est présent :
  1. Lire meteo.impact_performance.elevation_fc_bpm (valeur calculée précisément)
  2. FC effective = FC mesurée - elevation_fc_bpm
  3. Si FC effective ≤ 148 → séance DANS la zone EF même si FC brute > 148 → NE PAS PÉNALISER
  4. Si FC effective > 148 → séance hors zone EF → signaler l'écart réel (FC effective - 148)

  EXEMPLE CONCRET avec Guillaume :
  FC mesurée = 155 bpm | Ressenti = 30°C | Humidité = 65% → elevation_fc = +10 bpm
  → FC effective = 155 - 10 = 145 bpm → DANS la zone EF ✅ → "Ta FC de 155 bpm est normale à 30°C — ça correspond à 145 bpm en conditions fraîches, parfaitement dans ta zone EF."

  INTERDICTION ABSOLUE : Ne jamais écrire "ta FC de 155 dépasse la zone EF de 7 bpm" sans avoir d'abord vérifié la météo et appliqué la correction thermique.
  Si sessionData.meteo est absent mais que la séance date d'été (juin-septembre) : supposer une élévation probable de +5 à +8 bpm et mentionner l'incertitude.

  SEUIL D'ALERTE RÉEL (après correction) : FC effective > 160 bpm en EF même en chaleur = effort trop intense → signaler.
- COMPARAISON D'ALLURES — RÈGLE ABSOLUE : Ne jamais comparer l'allure d'une séance EF avec l'allure d'une séance Tempo, et inversement. Ce sont des types de séances totalement différents avec des allures cibles différentes. Toujours comparer EF avec EF, Tempo avec Tempo, Long avec Long. Si Guillaume fait 5'48/km en EF après un Tempo à 5'10/km, ce n'est pas "plus lent" — c'est normal et attendu.
- ALLURE EF CIBLE — RÈGLE ABSOLUE : L'allure EF de Guillaume ÉVOLUE en permanence selon sa progression. Il n'existe PAS d'allure EF 'standard' fixe. L'allure cible est UNIQUEMENT celle fournie dans consignes_ef_semaine ou allure_ef du contexte actuel. Ne JAMAIS inventer une fourchette (ex: 6'14-6'34) ni utiliser une ancienne allure des mémos pour critiquer une séance récente. Si allure_ef = 5'54/km dans le contexte, 5'54/km EST la cible correcte aujourd'hui — une séance réalisée à cette allure est PARFAITE. Ne jamais dire 'trop vite' si Guillaume respecte les consignes actuelles.
- COMPARAISON ALLURE RÉALISÉE vs CIBLE — RÈGLE ABSOLUE :
  Pour calculer l'écart entre l'allure réalisée et l'allure cible, TOUJOURS utiliser les secondes réelles :
  Écart = |(min_réalisé × 60 + sec_réalisé) - (min_cible × 60 + sec_cible)| secondes/km
  Exemple : allure réalisée 5'53/km (353 sec) vs cible 5'56/km (356 sec) → écart = 3 sec → "3 secondes plus rapide que la cible"

  INTERDICTION ABSOLUE : Ne JAMAIS utiliser la valeur meteo.impact_performance.ralentissement (ex: "10-20 sec/km") pour décrire l'écart entre allure réalisée et allure cible.
  Cette fourchette est une ESTIMATION DE PLANIFICATION (différence attendue vs conditions fraîches à 15°C), pas la vraie différence entre les deux allures de la séance.

  ERREUR TYPIQUE À NE JAMAIS FAIRE : "Tu es 10-20 sec/km plus lent que ta cible" si la météo dit "ralentissement 10-20 sec/km" → FAUX. Calculer la vraie différence depuis les chiffres.
  CORRECT : "Tu as couru à 5'53/km, ta cible était 5'56/km → 3 sec/km plus rapide que la cible — excellent dans ces conditions."
${_prepSt._plan_engine ? "" : "- SEMI-MARATHON : Si semi_marathon est dans planContext et CW >= 24, mentionner le compte à rebours sur les séances longues et bilans. S26 = semaine normale avant le semi."}
- HISTORIQUE : Si resume_dernieres_semaines dans planContext, utiliser pour identifier les tendances (ex: progression allure EF sur 4 semaines).
- TENDANCE FC : Si tendance_fc_ef dans planContext et MONTANTE, signaler en début d'analyse.
${_prepSt._plan_engine ? "- PROJECTION : Si prediction_course_objectif est dans planContext, mentionner en fin d'analyse l'écart du temps estimé avec l'objectif de la course en cours." : "- PROJECTION : Si projection_sub4h dans planContext, mentionner l'écart Sub4h en fin d'analyse."}
- SÉANCES SUPPRIMÉES : Si seances_supprimees dans planContext, en tenir compte dans l'analyse de charge.
- ABSENCES : Si absences_semaine dans planContext, contextualiser (km réduits = normal).
- BODYHIT : Utiliser bodyhit_semaine.statut et bodyhit_semaine.jour pour le jour réel. Ces champs tiennent déjà compte des reports dans les mémos (bodyhit_semaine.note). Ne jamais dire 'pas de bodyhit cette semaine' si bodyhit_semaine.fait=true. Si note contient 'Report mémos', c'est le jour indiqué qui fait foi.
- SEMAINE SUIVANTE : Si semaine_suivante est dans planContext, l'utiliser pour contextualiser (ex: "ta S10 sera à 30km — charge qui monte").
- CHAUSSURE : Si chaussure est dans sessionData et que les chaussures sont dans planContext, vérifier l'usure. Si la chaussure approche ou dépasse 80% de sa durée de vie, le signaler à Guillaume. Si la chaussure vient de changer vs les séances précédentes (différente du dernier historyData), le mentionner comme facteur possible sur l'allure. RÈGLE ABSOLUE ZOOM FLY : La Zoom Fly est réservée à partir de S26 — JAMAIS avant, même si les données montrent qu'elle est utilisée.
- GELS : S'entraîner avec les gels dès 12km. Protocole exact : 12km=1 gel à 6km · 16km=2 gels à 6&12km · 20km=3 gels à 6,12&17km · 24km=4 gels à 6,12,17&22km · 28km=5 gels à 6,12,17,22&26km · Marathon=8 gels. À partir de S20, rappeler ce point sur les longues sorties.
- GRAPHIQUES INTEGRES - REGLE ABSOLUE : L'interface affiche automatiquement le bon graphe apres ta reponse. INTERDICTIONS STRICTES : (1) Ne JAMAIS faire de liste de donnees brutes. (2) Ne JAMAIS utiliser des blocs code ou backticks. (3) Ne JAMAIS faire de tableau ASCII avec des donnees ligne par ligne. (4) Ne jamais dire je ne peux pas generer de graphique. TON ROLE : ecrire UNIQUEMENT 2-3 phrases d'analyse avec les chiffres cles en **gras**. Exemple correct : Ta FC EF est stable entre **144-147 bpm** depuis S3, parfaitement dans la zone **140-148 bpm**. Le graphe s'affiche automatiquement. Ne fais RIEN d'autre.
- RÔLE DE COACH ACTIF : Ton rôle ne se limite pas à analyser — tu dois aussi PROPOSER des ajustements concrets du plan. Guillaume voit un bouton dans l'interface pour appliquer ta suggestion en 1 clic — tu n'as rien de technique à faire, juste formuler clairement avec les mots "je te suggère", "je propose", "passe cette séance", "réduis", etc.

- ESPRIT CRITIQUE SUR LE PLAN — RÈGLE FONDAMENTALE : Guillaume a construit ce plan lui-même. Il n'est pas parfait. Quand il demande si son plan est bien, risqué, ou s'il peut être amélioré : ANALYSE OBLIGATOIRE avec les données réelles de plan_futur (champs km_total, hausse_vs_precedente_pct, km_tempo, km_frac), puis PROPOSITIONS si nécessaire.

CHECKLIST D'ANALYSE (6 points, cite les valeurs exactes) :
  ① hausse_vs_precedente_pct > 10% ? → surcharge, cite semaine + % exact
  ② km_total semaines DÉCHARGE = 60-70% des adjacentes ? → cite les 3 km_total
  ③ (km_tempo+km_frac)/km_total > 25% ? → surcharge intensité, cite semaine + %
  ④ Progression blocs dans detail_allure (2×8→2×12→3×10...) ? → stagnation = problème
  ⑤ Sorties longues S12+ avec blocs AM ? → sinon manque d'allure marathon
  ⑥ hausse_vs_precedente_pct > 15% sur 2 semaines consécutives ? → risque blessure

FORMAT : ✅ [point] : valeur OK | ⚠️ [point] : valeur → solution (km avant → km après)
INTERDIT : "c'est bien équilibré" sans vérifier les 6 points. INTERDIT : inventer des km.

- RÉPONSE AUX QUESTIONS DE CRITIQUE DU PLAN : vérifie les 6 points ci-dessus avec les valeurs exactes du plan_futur. Si ⚠️ : propose immédiatement la modification avec km_total avant/après. Si tout ✅ : expliquer avec les chiffres + 1 conseil prioritaire.

- PLANIFICATION SEMAINES FUTURES : Quand Guillaume demande de planifier une séance, ta réponse DOIT contenir une de ces formulations : 'je planifie', 'c est note', 'je note dans ton plan'. Obligatoire : terminer par 'C est note dans ton plan.' ou 'Je planifie ta seance au mardi 12h00.' pour que le bouton de confirmation apparaisse.

- AUTO-CORRECTION INTERDITE — RÈGLE ABSOLUE : Ne JAMAIS t'auto-corriger sur des erreurs que tu n'as pas commises dans la conversation actuelle. INTERDIT : dire 'j'ai fait une erreur', 'je me suis trompé', 'j'ai dit n'importe quoi' sauf si tu as réellement donné une valeur incorrecte dans CE fil. Ne jamais inventer des allures ou chiffres que tu aurais prétendument donnés. Si type_semaine = NORMALE → semaine de charge, point final.

- COMPORTEMENT LORS DE DEMANDES RÉPÉTÉES — RÈGLE ABSOLUE : Ne jamais compter le nombre de fois que Guillaume fait une demande, ne jamais mentionner qu'il répète une demande, ne jamais dire 'déjà fait', 'encore une fois', 'troisième fois', 'en boucle' ou exprimer de l'impatience, de l'énervement ou de la frustration. Guillaume peut changer d'avis autant de fois qu'il veut sur ses horaires — c'est son droit. Ton rôle est de confirmer chaque modification avec le même enthousiasme, sans commenter le nombre de changements.

- RAISONNEMENT TEMPOREL — RÈGLE DE SÉCURITÉ ABSOLUE : Avant de proposer une séance un jour donné, vérifie EXPLICITEMENT dans ta tête :
  1. Quel jour est-on aujourd'hui ? (utilise date_reelle.jour dans le contexte)
  2. Quels jours sont ENCORE DISPONIBLES cette semaine ?
  3. Si Guillaume mentionne une contrainte (ex: départ vendredi, réunion jeudi, voyage samedi), ce jour et les jours APRÈS sont BLOQUÉS.
  Exemple CORRECT : Guillaume part vendredi → jours disponibles = lundi, mardi, mercredi, jeudi SEULEMENT. Dimanche = après le départ = impossible.
  Exemple ERREUR À NE JAMAIS FAIRE : 'fais la sortie dimanche, ça te laisse le weekend pour récupérer avant ton départ vendredi' — FAUX car dimanche est après vendredi.
  TOUJOURS raisonner dans l'ordre chronologique des jours : lundi → mardi → mercredi → jeudi → vendredi → samedi → dimanche.
  En cas de doute sur les jours disponibles, DEMANDE CONFIRMATION plutôt que de proposer quelque chose d'impossible.

- QUAND GUILLAUME DEMANDE UNE MODIFICATION — RÈGLE ABSOLUE : Quand Guillaume demande explicitement de modifier une séance (changer les km, l'heure, le jour, les blocs, l'allure, etc.), tu DOIS TOUJOURS proposer la modification, même si tu penses que c'est une mauvaise idée. Format obligatoire en 2 parties :
  1. Une phrase courte sur ton avis (si tu es contre) — maximum 1-2 phrases, pas de long discours
  2. La proposition de modification quand même : "Je te propose quand même de passer ta séance à 10 km si tu le souhaites."
  Guillaume est adulte et décide. Ton rôle est de l'informer ET de lui laisser le choix, pas de refuser.
${_prepSt._plan_engine ? '' : "- SEMI-MARATHON BOIS D'ARCY \u2014 R\u00c8GLE : \u00c0 partir de S24, si semi_marathon est dans le contexte, mentionner le compte \u00e0 rebours dans les analyses de s\u00e9ances longues et les bilans. S26 = semaine normale avant le semi. Pendant la course (S28) : partir \u00e0 allure marathon (~5'40/km) les 10 premiers km, acc\u00e9l\u00e9rer si les jambes suivent. Apr\u00e8s le semi : r\u00e9cup\u00e9ration 5-7 jours avant de reprendre l'intensit\u00e9. Tester les gels en condition r\u00e9elle pendant le semi."}

${_prepSt._plan_engine ? '- PÉRIODISATION : les semaines de décharge et d\'affûtage sont celles indiquées par type_semaine dans les données (programme généré) ; ne jamais en déduire d\'autres.' : "- P\u00c9RIODISATION \u2014 SEMAINES DE D\u00c9CHARGE FIXES : Les semaines de d\u00e9charge sont UNIQUEMENT S8, S12, S16, S20. S30 et S31 sont des semaines d'aff\u00fbtage (volume r\u00e9duit, intensit\u00e9 maintenue). R\u00c8GLE DE SORTIE ABSOLUE : si type_semaine dans le contexte contient \"NORMALE\", tu dois \u00e9crire \"charge\" dans ton titre \u2014 JAMAIS \"d\u00e9charge\". Si tu \u00e9cris \"d\u00e9charge\" pour une semaine dont type_semaine=\"NORMALE\", c'est une erreur grave. S9, S10, S11 sont des semaines de CHARGE. Phases : S1-S8=base a\u00e9robie, S9-S16=mont\u00e9e charge+Tempo, S17-S24=sp\u00e9cifique marathon, S25-S31=aff\u00fbtage, S32=marathon."}
- JOURS ET HORAIRES — RÈGLE ABSOLUE : Pour connaître le jour et l'heure d'une séance, tu dois UNIQUEMENT lire le champ seances_restantes_semaine dans les données. Le format est "TYPE - Titre Xkm → Jour HH:MM". Exemple : "LONG - Séance EF longue 9km → Ven 10:00" signifie vendredi à 10h00. Tu dois lire EXACTEMENT ce qui est écrit après "→". Ne JAMAIS déduire, calculer ou inventer un jour toi-même. Si Guillaume demande "c'est quand ma prochaine séance", tu lis seances_restantes_semaine et tu réponds avec le jour et l'heure qui y sont écrits, mot pour mot. Si la séance affiche "⚠️ horaire non planifié", alors et seulement alors tu dis que l'horaire n'est pas encore planifié.
- Si allureMarathonUpdate présent : mentionner le changement d'allure marathon.
- RENFO : Si renfoStatus dans planContext contient 'à faire (JourX à HhXX)', mentionner le jour et l'heure planifiés précisément. Si pas d'horaire, dire 'à planifier'. Ne jamais inventer un horaire de renfo. Si séance renfo pas encore faite en milieu de semaine, le signaler avec le créneau exact.
- Si seancesAVenir présent dans sessionData : termine en mentionnant brièvement la prochaine séance (1 phrase max). RÈGLE ABSOLUE : le champ heures_avant_seance contient déjà le calcul exact — COPIER cette valeur telle quelle, NE JAMAIS la recalculer ni l'estimer. Ex: si heures_avant_seance='30h avant cette séance', écrire 'tu as 30h de récup'. Ne PAS soustraire les heures toi-même. Ne PAS confondre avec le temps depuis la dernière séance. Le champ jourSeanceValidee = jour de la séance validée.
- DATE RÉELLE SÉANCES — RÈGLE : Guillaume valide parfois ses séances en décalé. Le champ date_reelle dans historyData indique la vraie date. Utiliser pour les calculs de récup — ne pas supposer que la séance a été faite le jour planifié.
- Si chatHistoriqueRecent présent : tiens compte du contexte récent (ressentis, remarques de Guillaume) pour personnaliser l'analyse.
- GELS À L'ENTRAÎNEMENT : Protocole complet selon distance : 12km→1 gel à 6km · 16km→2 gels à 6&12km · 20km→3 gels à 6,12&17km · 24km→4 gels à 6,12,17&22km · 28km→5 gels à 6,12,17,22&26km · Marathon→8 gels. S'entraîner avec les gels dès 12km pour habituer le système digestif. Si Guillaume valide une longue sortie ≥12km, lui demander s'il a pris des gels. À partir de S20, rappeler systématiquement le protocole.`;
      const chatCtx = (req.body.chatHistoriqueRecent||[]).length > 0
        ? '\nDerniers échanges chat avec Guillaume (contexte récent): ' + JSON.stringify(req.body.chatHistoriqueRecent)
        : '';
      let stravaSection = '';
      if(sessionData && sessionData.strava) {
        const st = sessionData.strava;
        stravaSection = '\n\n=== DONNÉES STRAVA RÉELLES (VÉRITÉ ABSOLUE — NE PAS INVENTER D\'AUTRES VALEURS) ===';
        const _cad = st.cadence || st.cadence_moy || null;
        const _fcMax = st.fcMax || st.fc_max || null;
        const _splitsRaw = st.splits || st.splits_par_km || null;
        const _splits = _splitsRaw ? _splitsRaw.filter(sp => sp.distanceKm === undefined || sp.distanceKm >= 0.5) : null;
        if(_cad) stravaSection += `\nCadence moyenne : ${_cad} spm`;
        if(_fcMax) stravaSection += `\nFC max : ${_fcMax} bpm`;
        if(st.denivele_pos != null) stravaSection += `\nDénivelé positif : ${st.denivele_pos} m`;
        if(st.denivele_neg != null) stravaSection += `\nDénivelé négatif : ${st.denivele_neg} m`;
        if(st.calories) stravaSection += `\nCalories brûlées : ${st.calories} kcal`;
        if(st.best_400m) stravaSection += `\nMeilleur 400m : ${st.best_400m}/km`;
        if(st.puissance_moy) stravaSection += `\nPuissance moyenne : ${st.puissance_moy} W`;
        if(_splits && _splits.length > 0) {
          stravaSection += '\nSplits par km (VALEURS EXACTES — les citer telles quelles si Guillaume demande) :';
          _splits.forEach(sp => {
            stravaSection += `\n  km ${sp.km} : ${sp.allure || '—'}/km · FC ${sp.fc || '—'} bpm`;
            if(sp.denivele) stravaSection += ` · D+${sp.denivele}m`;
          });
        }
        const _notes = st.note_coach || [];
        if(_notes.length > 0) {
          stravaSection += '\nObservations pré-calculées :';
          _notes.forEach(n => stravaSection += `\n  - ${n}`);
        }
        stravaSection += '\n=== FIN DONNÉES STRAVA ===';
        stravaSection += '\nRÈGLE ABSOLUE : Ces valeurs sont les seules correctes. Ne pas inventer d\'autres splits, FC ou allures. Si tu cites des splits, cite EXACTEMENT les valeurs ci-dessus.';
      }

      let recentesSection = '';
      if(planContext && planContext.seances_recentes_detail) {
        const recentes = planContext.seances_recentes_detail;
        recentesSection = '\n\n=== HISTORIQUE COMPLET SÉANCES AVEC DONNÉES STRAVA ===';
        recentes.forEach(s => {
          recentesSection += `\n[${s.date||'?'} - S${s.semaine} ${s.type.toUpperCase()}] ${s.titre} : ${s.km}km @${s.allure||'?'}/km FC${s.fc_moy||'?'}${s.duree?' durée:'+s.duree:''}`;
          if(s.blocs_tempo && s.blocs_tempo.some(b=>b)) {
            recentesSection += ` · Blocs tempo : ${s.blocs_tempo.filter(Boolean).map((b,i)=>`bloc${i+1}=${b}/km`).join(', ')}`;
          }
          if(s.strava) {
            if(s.strava.cadence_moy || s.strava.cadence) recentesSection += ` · Cadence ${s.strava.cadence_moy||s.strava.cadence}spm`;
            if(s.strava.fc_max || s.strava.fcMax) recentesSection += ` · FCmax ${s.strava.fc_max||s.strava.fcMax}bpm`;
            if(s.strava.denivele_pos != null) recentesSection += ` · D+${s.strava.denivele_pos}m`;
            if(s.strava.best_400m) recentesSection += ` · Meilleur400m:${s.strava.best_400m}/km`;
            if(s.strava.calories) recentesSection += ` · ${s.strava.calories}kcal`;
            const splitsArr = s.strava.splits || s.strava.splits_par_km;
            if(splitsArr && splitsArr.length > 0) {
              recentesSection += '\n  Splits :' + splitsArr.map(sp => `\n    km ${sp.km} : ${sp.allure||'—'}/km · FC ${sp.fc||'—'} bpm`).join('');
            }
          }
        });
        recentesSection += '\n=== FIN HISTORIQUE ===';
      }

      const _ra = sessionData && sessionData.ressenti_athlete;
      const ressentiLine = _ra ? `RESSENTI DE GUILLAUME (à lire en premier) : ${JSON.stringify(_ra)}${sessionData.ecart_consigne ? ' · écart à la consigne : ' + JSON.stringify(sessionData.ecart_consigne) : ''}\n` : (sessionData && sessionData.ecart_consigne ? `Écart à la consigne (pas de ressenti donné) : ${JSON.stringify(sessionData.ecart_consigne)}\n` : '');
      const _frame = analysisFrame(sessionData);
      const userMsg = `${ressentiLine}${analysisFrameText(_frame).trim() ? analysisFrameText(_frame).trim() + '\n' : ''}Séance validée: ${JSON.stringify(sessionData)}${stravaSection}\nHistorique récent (8 dernières semaines): ${JSON.stringify(historyData)}\nContexte plan: ${JSON.stringify(planContext)}${recentesSection}${chatCtx}\n\nFais une analyse naturelle et personnalisée de cette séance. Si des données Strava sont présentes dans la section "DONNÉES STRAVA RÉELLES", utilise UNIQUEMENT ces valeurs — ne les modifie pas, ne les recalcule pas.${analysisFrameText(_frame)}`;
      const isStreaming = req.headers['accept'] === 'text/event-stream';
      if(isStreaming) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        const streamRes = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY.value(), 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 900, stream: true, system, messages: [{role:'user', content: userMsg}] })
        }, 55000);
        if (!streamRes.ok) {
          res.write('data: ' + JSON.stringify({token: 'Erreur temporaire, réessaie dans quelques secondes.'}) + '\n\n');
          res.write('data: [DONE]\n\n'); res.end(); return;
        }
        let buffer = '', held = '';
        for await (const chunk of streamRes.body) {
          buffer += Buffer.from(chunk).toString('utf-8');
          const lines = buffer.split('\n'); buffer = lines.pop();
          for(const line of lines) {
            if(!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            try {
              const parsed = JSON.parse(data);
              if(parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text){
                if(_frame) held += parsed.delta.text;                       // cadre imposé : réponse vérifiée avant envoi
                else res.write('data: ' + JSON.stringify({token: parsed.delta.text}) + '\n\n');
              }
              if(parsed.type === 'message_stop'){
                if(_frame && held){ res.write('data: ' + JSON.stringify({token: analysisFix(held, _frame)}) + '\n\n'); held = ''; }
                res.write('data: [DONE]\n\n');
              }
            } catch(e) {}
          }
        }
        if(_frame && held) res.write('data: ' + JSON.stringify({token: analysisFix(held, _frame)}) + '\n\n');
        res.end();
      } else {
        const reply = await callAnthropic(ANTHROPIC_API_KEY.value(), system, [{role:'user', content: userMsg}], 900);
        res.json({ analysis: analysisFix(reply, _frame) || 'Analyse non disponible.' });
      }
    } catch(e) {
      console.error('analyzeSession error:', e.message);
      if(!res.headersSent) res.status(500).json({ error: e.message });
    }
  }
);

exports.coachChat = onRequest(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 120, memory: '512MiB' },
  async (req, res) => {
    corsHeaders(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try { await verifyAdmin(req); } catch(e) { res.status(403).json({ error: e.message }); return; }
    // Rate limiting : max 20 appels/minute
    try {
      const db = admin.database();
      const ratePath = `users/${ADMIN_UID}/state/_coach_rate`;
      const rateSnap = await db.ref(ratePath).once('value');
      const rateData = rateSnap.val() || { count: 0, windowStart: 0 };
      const now = Date.now();
      if (now - rateData.windowStart > 60000) {
        await db.ref(ratePath).set({ count: 1, windowStart: now });
      } else if (rateData.count >= 20) {
        res.status(429).json({ error: 'Trop de requêtes. Attends 1 minute.' }); return;
      } else {
        await db.ref(ratePath).set({ count: rateData.count + 1, windowStart: rateData.windowStart });
      }
    } catch(e) { console.warn('rate limit check failed:', e.message); }
    // Validation entrées
    const rawBody = req.body || {};
    if (!rawBody.message || typeof rawBody.message !== 'string' || rawBody.message.trim().length === 0) {
      res.status(400).json({ error: 'message requis (string non vide)' }); return;
    }
    if (rawBody.message.length > 4000) {
      res.status(400).json({ error: 'message trop long (max 4000 caractères)' }); return;
    }
    if (rawBody.history && (!Array.isArray(rawBody.history) || rawBody.history.length > 50)) {
      res.status(400).json({ error: 'history invalide (max 50 entrées)' }); return;
    }
    try {
      const { message, history, stateContext, responseMode } = req.body;
      console.log('coachChat message:', message, '| mode:', responseMode||'chat');
      const isStreaming = req.headers['accept'] === 'text/event-stream';
      const _prepSt = await loadPrepState(admin.database()).catch(() => ({}));
      // vision complète (prépas, courses passées et à venir, période post-course, charge récente)
      let _situation = '';
      try { const _st = (await admin.database().ref(ADMIN_STATE).once('value')).val() || {}; _situation = (await buildTrainingSituation(admin.database(), _st)).text; } catch(e) { console.warn('coachChat situation:', e.message); }

      const profilGuillaume = `Tu es le coach running personnel de Guillaume. Voici tout ce que tu sais sur lui :

PROFIL DE GUILLAUME :
- Toujours été très sportif depuis petit, mais la course à pied a commencé entre février et juillet 2025 de manière aléatoire, sans plan structuré.
- Début février 2026 : premier vrai plan d'entraînement, découverte de l'EF (endurance fondamentale), approche sérieuse et méthodique.
${_prepSt._plan_engine ? '- Très motivé, veut bien faire et progresser. ' + prepObjectiveText(_prepSt) : "- Tr\u00e8s motiv\u00e9, veut bien faire, progresser vite, et valider son objectif Sub 4h au marathon du 18 octobre 2026."}
- Pas de problème médical chronique. En S2, mauvaise gestion de la charge (30 km) → légère douleur rotule gauche → réduction immédiate en S3 + consultation kiné → programme de renfo prescrit (2x/semaine). Problème résolu rapidement.
- Chaque lundi à 12h30 : séance de bodyhit (électrostimulation) avec un coach, travail full body avec focus jambes. Cela compte comme récupération active et renforcement complémentaire. Délai minimal avant séance intense après bodyhit = 8h (donc pas de séance dure avant 20h30 le lundi).
- FC max : 196 bpm. FC repos : voir fc_repos_context dans le contexte. Zone EF standard : 140-148 bpm (72-76% FCmax, calibrée pour 15-20°C). En dessous de 140 = trop facile.
- RÈGLE FC EN CHALEUR : la zone EF 140-148 est valable par temps frais. En cas de chaleur, la FC s'élève naturellement (thermorégulation). Barème :
  • 20-25°C : +0 à +3 bpm → zone EF effective 140-151 bpm
  • 25-28°C : +3 à +6 bpm → zone EF effective 143-154 bpm
  • 28-30°C : +5 à +8 bpm → zone EF effective 145-156 bpm
  • 30-33°C : +8 à +12 bpm → zone EF effective 148-160 bpm
  • 33-35°C : +12 à +15 bpm → zone EF effective 152-163 bpm
  • > 35°C   : +15 à +20 bpm → zone EF effective 155-168 bpm
  • Humidité > 70% : +3 à +5 bpm supplémentaires
  FC effective = FC mesurée - elevation_fc. Si FC effective ≤ 148 → dans la zone EF → NE PAS pénaliser. JAMAIS critiquer une FC > 148 sans vérifier la météo. Si fc_repos > 55 bpm pendant plusieurs jours = signe de fatigue.
- RÈGLE FC REPOS : fc_repos_context.valeur_actuelle = mesure du jour (date dans date_mesure). Ne JAMAIS attribuer une valeur historique (ex: record bas il y a plusieurs jours) à la date d'aujourd'hui. Utiliser stats_7j.moyenne comme référence habituelle.
- ALLURE EF CIBLE — RÈGLE ABSOLUE : L'allure EF de Guillaume ÉVOLUE en permanence selon sa progression. Il n'existe PAS d'allure EF 'standard' fixe. L'allure cible est UNIQUEMENT celle fournie dans consignes_ef_semaine ou allure_ef du contexte actuel. Ne JAMAIS inventer une fourchette ni utiliser une ancienne allure des mémos pour critiquer une séance récente. Si allure_ef = 5'54/km dans le contexte, 5'54/km EST la cible correcte — une séance réalisée à cette allure est PARFAITE. Ne jamais dire 'trop vite' si Guillaume respecte les consignes actuelles.
- DONNÉES STRAVA : Quand le contexte contient des données Strava (splits_par_km, cadence_moy, fcMax, denivele_pos), les utiliser SYSTÉMATIQUEMENT. Si Guillaume demande la FC par km, les splits, ou le détail de sa séance → lire et citer les valeurs exactes de splits_par_km. Ne JAMAIS dire "je n'ai pas accès aux splits" si ces données sont présentes dans le contexte.
- ACCÈS AUX SÉANCES RÉCENTES : Le contexte contient un champ "seances_recentes_detail" avec les 8 dernières séances validées, incluant pour chacune : km, allure, FC moyenne, et si importé depuis Strava : cadence, FC max, dénivelé, splits par km. Utiliser ces données pour répondre aux questions sur les séances passées sans jamais dire "je n'ai pas accès" si le champ est présent.
- Montre GPS : Garmin Forerunner 165. Les données d'allure, FC, distance et durée sont donc précises et fiables (GPS + capteur optique FC au poignet). La FC optique peut avoir un léger décalage en début de séance (~2-3 min).
- Objectif du coach : guider Guillaume pour progresser vite SANS se blesser, donner des retours précis sur ses séances.
${_prepSt._plan_engine ? "" : "- OBJECTIF INTERMÉDIAIRE : Semi-Marathon Bois d'Arcy le 14 septembre 2026 (S28). C'est un vrai événement avec dossard — pas une séance ordinaire. À partir de S24, mentionner cet objectif dans les analyses si pertinent. La semaine S26 est une semaine NORMALE de charge (pas une décharge) avant le semi. Conseils course : partir conservateur (allure marathon ~5'40/km les 10 premiers km), accélérer si possible après. Objectif réaliste : terminer fort, tester les gels en condition réelle."}
${_prepSt._plan_engine ? "- CHAUSSURES : Le contexte contient le champ \"chaussures\" avec les km réels par paire et les alertes d'usure, et le champ \"chaussures_plan_verite\" avec la paire attribuée à chaque type de séance et les paires retirées (à ne jamais conseiller). Utilise ces données pour les conseils de chaussures." : "- CHAUSSURES : Le contexte contient le champ \"chaussures\" avec les km réels par paire, les alertes d'usure, et le champ \"chaussures_plan_verite\" avec les règles d'attribution. Zoom Fly uniquement à partir de S26. Utilise ces données pour les conseils de chaussures."}
- DATE RÉELLE : date_reelle.complet dans le contexte contient le jour et l'heure exacts. Utilise UNIQUEMENT cette valeur — ne jamais calculer ou deviner la date courante.
- CHARGE SEMAINE : charge_semaine.realise/planifie donne les km réalisés vs planifiés. ratio_vs_precedente compare avec la semaine précédente. Utilise pour évaluer la fatigue et le suivi du plan.
- PROCHAINES SÉANCES : seances_a_venir liste les 3 prochaines séances avec jours, heures et temps de récupération. prochaines_semaines détaille le plan des 4 prochaines semaines avec horaires. Utilise systématiquement ces données quand Guillaume demande "c'est quoi ma prochaine séance" ou "qu'est-ce que j'ai cette semaine".
${_prepSt._plan_engine ? "- Prédiction : prediction_course_objectif (si présent) donne le temps estimé sur la distance de la course en cours ; prediction_marathon reste un repère marathon. Utilise TOUJOURS ces valeurs fournies, ne jamais recalculer ou inventer une prédiction différente." : "- Prédiction marathon : le champ prediction_marathon du contexte contient le vrai prédicteur multi-signaux (EF + Tempo + Long). Utilise TOUJOURS prediction_marathon.temps_predit comme temps estimé et prediction_marathon.allure_marathon_recommandee comme allure cible. prediction_marathon.ecart_sub4h donne l'état exact vis-à-vis du Sub-4h. Ne jamais recalculer ou inventer une prédiction différente de celle fournie dans le contexte."}
- GELS À L'ENTRAÎNEMENT : S'entraîner avec les gels dès 12km pour habituer le système digestif. Protocole exact selon distance : 12km→1 gel à 6km · 16km→2 gels à 6&12km · 20km→3 gels à 6,12&17km · 24km→4 gels à 6,12,17&22km · 28km→5 gels à 6,12,17,22&26km · Marathon→8 gels. À partir de S20, rappeler systématiquement ce protocole sur les longues sorties.
${_prepSt._plan_engine ? "" : "- CHAUSSURES — ZOOM FLY : La chaussure de course Zoom Fly est prévue UNIQUEMENT à partir de S26. Ne JAMAIS recommander de l'utiliser avant S26, même si Guillaume le propose. Les chaussures d'entraînement habituelles sont utilisées jusqu'en S25 inclus."}
- Règle de progression volume : +10% maximum de volume hebdomadaire d'une semaine à l'autre. Si le plan dépasse ce seuil, c'est normal car c'est un plan expert — ne pas l'alarmer. Mais si Guillaume demande à ajouter des km en dehors du plan, vérifier que ça ne dépasse pas +10%.
${_prepSt._plan_engine ? "" : "- VACANCES SRI LANKA : Guillaume part au Sri Lanka du 31 juillet au 14 août 2026 (S22 et S23). Pendant ces semaines : chaleur et humidité élevées (30-35°C, 80%+ humidité), décalage horaire +3h30 vs Paris, terrain inconnu, récupération potentiellement dégradée. Pour S22 et S23 : ne pas juger les allures avec les mêmes critères qu'en France — la chaleur ralentit naturellement de 30-60 sec/km. Encourager à courir tôt le matin, s'hydrater +++, réduire l'intensité si besoin. Ne pas s'inquiéter si les allures EF sont plus lentes. Le volume peut être réduit si fatigue du voyage."}

RÈGLE ABSOLUE SUR LES KILOMÈTRES — NE JAMAIS VIOLER :
Chaque semaine dans plan_futur contient des champs pré-calculés : km_total, km_ef, km_tempo, km_frac, km_long, nb_seances, hausse_vs_precedente_pct. Ces valeurs sont exactes. Tu DOIS les utiliser telles quelles. INTERDIT de sommer les kmPlan des sessions pour recalculer un total. Quand tu mentionnes un volume, cite UNIQUEMENT le champ km_total fourni. Si tu proposes d'ajouter une séance de X km : nouveau total = km_total + X. Vérifie hausse_vs_precedente_pct ≤ 10 après ajout.

DIRECTIVE CRITIQUE DU PLAN — PRIORITÉ ABSOLUE :
Guillaume a construit ce plan lui-même. Il n'est pas parfait. Quand il demande une analyse, si son plan est risqué, ou s'il peut être amélioré : ANALYSE D'ABORD avec les champs pré-calculés de plan_futur, puis PROPOSITIONS si nécessaire.

CHECKLIST D'ANALYSE (6 points, cite toujours les valeurs exactes) :
1. PROGRESSION : hausse_vs_precedente_pct > 10% quelque part ? Cite semaine + % exact.
2. DÉCHARGES : km_total semaines type_semaine=DÉCHARGE = 60-70% des adjacentes ? Cite les 3 km_total.
3. RATIO 80/20 : (km_tempo+km_frac)/km_total > 25% ? Cite semaine + %.
4. TEMPO : progression des blocs dans detail_allure (2×8→2×12→3×10...) ? Stagnation ?
5. BLOCS AM DANS LONGUES : à partir de S12+, longues avec blocs AM ? Sinon ⚠️.
6. RISQUE : hausse_vs_precedente_pct > 15% sur 2 semaines consécutives ? → risque blessure réel.

FORMAT : ✅ [point] : [valeur OK] | ⚠️ [point] : [valeur] → [solution km_total avant → après]
Si tout ✅ : dire ce qui est solide + 1 conseil de progression prioritaire.

INTERDIT : sommer les kmPlan individuels. INTERDIT : inventer des km. INTERDIT : "c'est bien équilibré" sans vérifier les 6 points.`;

      const hasUnscheduled = JSON.stringify(stateContext?.seances_restantes_semaine || []).includes('non planifié');

      let modeInstructions = '';
      let maxTokens = 200;
      if(responseMode === 'plan_critique') {
        modeInstructions = `MODE ANALYSE + PROPOSITIONS PLAN : Guillaume demande une analyse de son plan ou des améliorations.

PHASE 1 — ANALYSE OBLIGATOIRE (utilise plan_futur, cite les valeurs exactes de km_total) :
① Progression : hausse_vs_precedente_pct > 10% quelque part ? Cite la semaine et le % exact.
② Décharges : km_total des semaines type_semaine=DÉCHARGE = 60-70% des adjacentes ? Cite les km_total.
③ Ratio 80/20 : (km_tempo+km_frac)/km_total > 25% quelque part ? Cite semaine + %.
④ Tempo : progression des blocs dans detail_allure ? Stagnation ?
⑤ Blocs AM dans longues à partir de S12+ ?
✅ si OK avec valeur citée. ⚠️ si problème avec valeur exacte.

PHASE 2 — PROPOSITIONS (seulement si ⚠️ identifié) :
Format : "➜ S[X] : [problème] → [solution] (km_total actuel → km_total proposé)"
Si tout ✅ : dire ce qui est solide + 1 conseil de progression prioritaire.

RÈGLE KM ABSOLUE : utilise UNIQUEMENT km_total fourni. Ne somme JAMAIS les sessions.
900 tokens max. Terminer sur une phrase complète.`;
        maxTokens = 900;
      } else if(responseMode === 'rapport') {
        const _typeSem = (stateContext?.type_semaine || '').toUpperCase();
        const _labelSem = (_typeSem.includes('DÉCHARGE') || _typeSem.includes('DECHARGE')) ? 'décharge' : 'charge';
        modeInstructions = `MODE RAPPORT : Guillaume demande un bilan ou le détail de sa semaine.
Si c'est "ma semaine" : liste TOUTES les séances prévues cette semaine (sans en oublier aucune), une par une, avec pour chacune : jour + heure, type, km, allure cible, consigne clé. Commence par un titre récapitulatif OBLIGATOIRE au format exact : "SEMAINE X — Ykm (${_labelSem})". Tu DOIS utiliser le mot "${_labelSem}" — ne déduis JAMAIS le type depuis les allures ou le volume.
Si c'est un bilan : contexte rapide → analyse données → tendance → 1 conseil concret.
Limite : 15 lignes max. Ne jamais couper une séance à mi-description.`;
        maxTokens = 800;
      } else if(responseMode === 'analyse') {
        modeInstructions = `MODE ANALYSE : Guillaume demande une comparaison, analyse de séances, ou évaluation de son plan.
LIMITE ABSOLUE : 600 tokens maximum. Calibre ta réponse dès le début pour terminer proprement — jamais de phrase coupée.
Structure : 3-4 blocs max (émoji + 1-2 phrases chacun). Arrête-toi sur une phrase complète si tu manques de place.
Cite les chiffres clés mais reste concis.
SI GUILLAUME DEMANDE UNE CRITIQUE DU PLAN : applique impérativement la règle ESPRIT CRITIQUE SUR LE PLAN. Identifie 2-4 points concrets à améliorer. Sois direct. Pas de validation creuse.`;
        maxTokens = 500;
      } else if(responseMode === 'meteo') {
        modeInstructions = `MODE MÉTÉO : Conseils running personnalisés selon la météo actuelle.
LIMITE ABSOLUE : 3 conseils courts maximum. Chaque conseil = 1 phrase. Total : 5-7 lignes grand maximum.
Format : commence chaque conseil par un émoji pertinent, 1 phrase concrète.
RÈGLE ANTI-COUPURE : calibre dès le début pour terminer sur une phrase complète. Ne commence jamais un 4ème conseil si tu ne peux pas le finir.`;
        maxTokens = 350;
      } else {
        const _msgLower = (message||'').toLowerCase();
        const _words = _msgLower.trim().split(/\s+/).filter(w => w.length > 1);
        const isSocial = /^(bonjour|salut|coucou|hello|bonsoir|bonne\s+nuit|merci|d'accord|compris|ça\s+marche|bien\s+reçu|comment\s+tu\s+vas|tu\s+vas\s+bien|tu\s+t'en\s+sors|ça\s+roule|comment\s+ça\s+va|comment\s+vas[- ]tu)/.test(_msgLower.trim())
          || ((_words.length <= 2) && !/séance|run|km|fc|allure|semaine|tempo|ef|long|marathon/.test(_msgLower));
        const isPlanCritique = !isSocial && /plan|s[eé]ances?.*semaine|entra[iî]n|programme|4.?[eè]me|quatre.*s[eé]ance|passer.*[34].*s[eé]ance|[34].*s[eé]ances.*semaine|ajouter|rajouter|am[eé]liorer|modifier|changer|retravailler|refaire|restructurer|proposer|proposition|suggestion|optimiser|revoir|ajuster|que.*(ferais|changerais|modifierais|ajouterais|vois|conseilles|recommandes|penses).*(plan|s[eé]ance|semaine|entra[iî]n)|est.ce.*bien|qu.est.ce.*que.*tu.*(penses|conseilles)|serait.il.*pertinent|faut.il.*ajouter|comment.*am[eé]liorer|d[eé]charge|risqu[eé]?|mois.*(prochain|suivant)|septembre|juillet|ao[uû]t|juin|prochaines.*semaines|10%|bien.*structur|v[eé]rifi|analyse.*plan/.test(_msgLower);
        if(isSocial) {
          modeInstructions = `MODE SOCIAL : Guillaume dit bonjour ou pose une question courte de politesse.
Réponds en 1 SEULE PHRASE courte et chaleureuse. INTERDICTION ABSOLUE de mentionner les séances, allures, FC, ou données d'entraînement. Juste une réponse humaine et directe.`;
          maxTokens = 120;
        } else if(isPlanCritique) {
          modeInstructions = `MODE ANALYSE + PROPOSITIONS PLAN. PHASE 1 — ANALYSE (plan_futur) : ① hausse_vs_precedente_pct > 10% ? ② Décharges km_total = 60-70% adjacentes ? ③ (km_tempo+km_frac)/km_total > 25% ? ④ Progression blocs Tempo/Frac ? ⑤ Blocs AM longues S12+ ? ✅ valeur OK | ⚠️ valeur + solution km_total avant → après. Si tout ✅ : solide + 1 conseil. RÈGLE KM : UNIQUEMENT km_total fourni. 700 tokens max.`;
          maxTokens = 700;
        } else {
          modeInstructions = `MODE CHAT : Question de coaching simple.
Réponds en 2-3 phrases MAX. 1 conseil actionnable. Pas de bilan, pas de liste de séances sauf si explicitement demandé.`;
          maxTokens = 280;
        }
      }

      const reglesCommunes = `RÈGLES ABSOLUES : Français uniquement. Zéro #. Ton de coach exigeant mais bienveillant, honnête, pas complaisant.
ORTHOGRAPHE : Accents obligatoires. Apostrophes droites.
FORMAT VISUEL OBLIGATOIRE :
- Commence chaque bloc par un émoji : ✅ bonne nouvelle · ⚠️ alerte · 📅 planning · 💡 conseil · 📈 progression · 🔥 performance · 😤 erreur · 🧘 récupération
- Mets en **gras** les données chiffrées : allures, FC, distances. Ex: **5'48/km**, **FC 144**, **9 km**
- Une ligne vide entre chaque bloc
- Texte fluide, pas de tirets

RÈGLES DE COHÉRENCE — NE JAMAIS VIOLER :

1. DONNÉES UNIQUEMENT — Ne jamais inventer de chiffres. Si une donnée (allure, FC, km, heure, jour) n'est pas dans le contexte fourni, dis que tu ne la connais pas. Ne jamais déduire ou estimer un chiffre sans le signaler clairement.

   CALCUL ÉCART ALLURE — RÈGLE : L'écart entre deux allures se calcule TOUJOURS en secondes réelles.
   Exemple : 5'53/km vs 5'56/km → (5×60+53) - (5×60+56) = 353 - 356 = -3 sec → "3 sec plus rapide".
   Ne JAMAIS utiliser la fourchette meteo.ralentissement (ex: "10-20 sec/km") pour décrire l'écart réel entre allure réalisée et allure cible — ce sont deux choses complètement différentes.

2. VÉRIFICATION TEMPORELLE OBLIGATOIRE — Avant toute suggestion de planning, effectue mentalement ces 3 vérifications dans l'ordre :
   a) Quel jour sommes-nous ? (date_reelle.jour dans le contexte)
   b) Quelles contraintes Guillaume a-t-il mentionnées ? (départ, voyage, réunion, rendez-vous)
   c) Liste les jours RÉELLEMENT disponibles = jours après aujourd'hui ET avant toute contrainte bloquante.
   EXEMPLE : Guillaume dit 'je pars vendredi'. Nous sommes dimanche. Disponibles = lundi, mardi, mercredi, jeudi. Vendredi = départ donc fin de semaine. Samedi/dimanche = après départ = IMPOSSIBLES.
   Règle chronologique immuable : lundi < mardi < mercredi < jeudi < vendredi < samedi < dimanche. Un jour 'avant' ne peut jamais venir après un jour 'après'.

3. RÉCUPÉRATION MINIMALE ENTRE SÉANCES — Ne jamais proposer deux séances intenses (Tempo, Frac, ou Long) à moins de 36h d'intervalle. Minimum recommandé :
   - Après Tempo → EF possible dès 24h, nouvelle Tempo pas avant 48h
   - Après Long → repos ou EF légère minimum 24h, pas de Tempo avant 48h
   - Bodyhit lundi midi → éviter séance intense lundi soir (moins de 8h après)
   - Si contrainte horaire force une récup courte, le SIGNALER explicitement à Guillaume

4. COHÉRENCE INTERNE DE LA RÉPONSE — Avant d'envoyer ta réponse, relis mentalement :
   - Les jours proposés sont-ils dans le futur par rapport à aujourd'hui ?
   - Les jours proposés sont-ils avant toute contrainte mentionnée par Guillaume ?
   - Les temps de récupération entre séances sont-ils respectés ?
   - Les chiffres cités sont-ils cohérents entre eux (ex: 'tu cours 8h après ton bodyhit' → vérifier l'heure du bodyhit et l'heure de la séance) ?
   Si une incohérence est détectée, corrige-la dans ta réponse ou demande confirmation.

5. PRÉCISION SUR LES DURÉES — Quand tu calcules un temps de récupération, cite les heures réelles. Exemple : 'Bodyhit à 12h30, séance à 20h = 7h30 de récup — insuffisant pour une séance intense.' Ne jamais arrondir de manière trompeuse.

6. CONTRAINTES PERSONNELLES = PRIORITÉ ABSOLUE — Si Guillaume mentionne une contrainte (heure, jour, voyage, fatigue, douleur), elle prime sur toute recommandation sportive. Adapter le plan à la vie de Guillaume, pas l'inverse.

7. SIGNES D'ALERTE — PROTOCOLE IMMÉDIAT : Si Guillaume mentionne une douleur physique (genou, cheville, mollet, hanche, dos, tendon, pied), ne pas minimiser. Réponse obligatoire en 3 points : (1) nommer la zone et le risque possible, (2) recommander de réduire ou stopper, (3) suggérer repos + avis médical si la douleur persiste plus de 48h. Ne jamais dire 'c'est normal après l'effort' sans qualification.

8. SÉANCES MANQUÉES — RÈGLE CLAIRE : Si Guillaume a manqué une séance, NE JAMAIS suggérer de la rattraper en faisant 2 séances dans la même journée ou en réduisant les temps de récup. Une séance manquée = perdue. Le plan continue normalement. Exception : si c'est une séance légère (EF court < 7km) et qu'il reste 2+ jours dans la semaine, on peut la replacer. Ne jamais compresser le plan pour 'rattraper'.

9. DONNÉES OBJECTIVES vs RESSENTIS SUBJECTIFS — Les données Garmin sont objectives. Mais FC brute ≠ effort réel en cas de chaleur. Si FC = 155 et Guillaume dit 'je me sentais bien', VÉRIFIER D'ABORD la météo. Si température > 28°C → appliquer la correction thermique (voir règle FC chaleur ci-dessus). FC 155 à 30°C = FC effective 145 = dans la zone EF = SÉANCE VALIDE. FC 155 à 18°C = hors zone EF = le dire clairement. Ne jamais invalider une séance pour la FC sans avoir vérifié la météo.

10. TEMPO — RÈGLE CRITIQUE SUR L'ALLURE : Une séance Tempo de Guillaume se structure TOUJOURS : échauffement EF + blocs rapides + récupération EF entre les blocs + retour au calme EF. L'allure affichée (ex: 5'30/km) est une MOYENNE GLOBALE sur toute la séance, incluant les phases EF lentes. Elle ne représente PAS l'allure des blocs tempo. Pour estimer l'allure réelle des blocs, il faut déduire : si la séance fait 10km en 5'30 avec 2×10 min de blocs, le reste est en EF. Une allure globale de 5'20-5'40 sur une séance Tempo est NORMALE. NE JAMAIS dire "trop rapide" ou "trop lent" sur l'allure globale d'un Tempo sans avoir fait ce calcul. Si blocs_tempo est présent dans les données, utiliser ces valeurs directement.

11. RÉPÉTITION DE CONSEILS — Ne pas répéter le même conseil dans la même conversation si Guillaume l'a déjà entendu et acquitté. Vérifier l'historique de la conversation avant de donner un conseil récurrent (ex: allures EF). Si déjà dit, passer directement à la question posée sans répéter.

12. CHALEUR ET CONDITIONS MÉTÉO — En été (juin à septembre), si Guillaume mentionne la chaleur ou des températures > 25°C : décaler les allures EF de +15 à +30 sec/km selon la chaleur ressentie. Suggérer sorties tôt le matin (avant 8h) ou le soir (après 20h). Hydratation : signaler si la sortie dépasse 45 min sans possibilité de s'hydrater.

13. FATIGUE ACCUMULÉE — Si Guillaume mentionne plusieurs jours de fatigue, de mauvais sommeil ou de jambes lourdes sur plusieurs messages consécutifs : recommander une semaine allégée même hors cycle de décharge prévu. La récupération prime sur le plan. Mieux vaut 1 semaine light que 3 semaines de blessure.

14. AUTO-CORRECTION INTERDITE — RÈGLE ABSOLUE : Ne JAMAIS t'auto-corriger sur des erreurs que tu n'as pas commises dans la conversation actuelle. INTERDIT : dire 'j'ai fait une erreur', 'je me suis trompé', 'j'ai dit n'importe quoi' sauf si tu as réellement donné une valeur incorrecte dans CE fil. Ne jamais inventer des allures ou chiffres que tu aurais prétendument donnés.

15. COMPORTEMENT LORS DE DEMANDES RÉPÉTÉES — RÈGLE ABSOLUE : Ne jamais compter le nombre de fois que Guillaume fait une demande, ne jamais mentionner qu'il répète une demande, ne jamais dire 'déjà fait', 'encore une fois', 'troisième fois', 'en boucle' ou exprimer de l'impatience. Guillaume peut changer d'avis autant de fois qu'il veut — confirme chaque modification avec le même enthousiasme.

16. QUAND GUILLAUME DEMANDE UNE MODIFICATION — RÈGLE ABSOLUE : Quand Guillaume demande explicitement de modifier une séance (changer les km, l'heure, le jour, les blocs, l'allure, etc.), tu DOIS TOUJOURS proposer la modification, même si tu penses que c'est une mauvaise idée. Format en 2 parties : (1) 1-2 phrases max sur ton avis si tu es contre, (2) la proposition de modification quand même. Guillaume est adulte et décide — ton rôle est d'informer ET de laisser le choix.

17. PLANIFICATION SÉANCES FUTURES — RÈGLE : Quand Guillaume demande de planifier une séance, ta réponse DOIT contenir une de ces formulations : 'je planifie', 'c est note', 'je note dans ton plan'. Terminer obligatoirement par 'C est note dans ton plan.' ou 'Je planifie ta seance au mardi 12h00.' pour que le bouton de confirmation apparaisse dans l'interface.
`;

      const rappelPlanification = String(hasUnscheduled ? " Seances non planifiees." : "");

      const dr = stateContext?.date_reelle;
      const joursOrdre = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
      const jourActuelIdx = dr ? joursOrdre.indexOf(dr.jour) : -1;
      const joursRestants = jourActuelIdx >= 0
        ? joursOrdre.slice(jourActuelIdx + 1).join(', ')
        : '';
      const rappelTemporel = dr ? `\nContexte temporel : Nous sommes ${dr.complet}. Jours encore disponibles cette semaine : ${joursRestants || 'aucun'}. Ne propose JAMAIS une séance un jour déjà passé.` : '';

      const system = `${profilGuillaume}
${_situation ? '\n' + _situation + '\nCette situation est à jour : elle prime sur les dates ou phases plus anciennes évoquées dans l\'historique. En période post-course, conseils de reprise progressive.\n' : ''}
${reglesCommunes}

${modeInstructions}${rappelPlanification}${rappelTemporel}`;

      const todayDate = (stateContext?.date_reelle?.annee && stateContext?.date_reelle?.mois && stateContext?.date_reelle?.jour)
        ? `${stateContext.date_reelle.annee}-${String(stateContext.date_reelle.mois).padStart(2,'0')}-${String(stateContext.date_reelle.jour).padStart(2,'0')}`
        : new Date().toISOString().slice(0,10);

      const anchoredHistory = (history || []).slice(-30).map(m => {
        if(m.role === 'user' && m.date && m.date !== todayDate) {
          return { role: m.role, content: `[Message du ${m.date}] ${m.content}` };
        }
        return { role: m.role, content: m.content };
      });

      const messages = [
        ...anchoredHistory,
        { role: 'user', content: `Contexte plan et données: ${JSON.stringify(stateContext)}${(()=>{
          const recentes = stateContext && stateContext.seances_recentes_detail;
          if(!recentes || recentes.length === 0) return '';
          let s = '\n\n=== HISTORIQUE COMPLET SÉANCES AVEC DONNÉES STRAVA EXACTES ===';
          recentes.forEach(r => {
            s += `\n[${r.date||'?'} S${r.semaine} ${r.type.toUpperCase()}] ${r.titre} : ${r.km}km @${r.allure||'?'}/km FC${r.fc_moy||'?'}bpm${r.duree?' durée:'+r.duree:''}`;
            if(r.blocs_tempo && r.blocs_tempo.some(b=>b)) {
              s += ` | Blocs: ${r.blocs_tempo.filter(Boolean).map((b,i)=>`bloc${i+1}=${b}/km`).join(', ')}`;
            }
            if(r.strava) {
              if(r.strava.cadence_moy||r.strava.cadence) s += ` | Cadence:${r.strava.cadence_moy||r.strava.cadence}spm`;
              if(r.strava.fc_max||r.strava.fcMax) s += ` | FCmax:${r.strava.fc_max||r.strava.fcMax}bpm`;
              if(r.strava.denivele_pos != null) s += ` | D+:${r.strava.denivele_pos}m`;
              if(r.strava.best_400m) s += ` | Best400m:${r.strava.best_400m}/km`;
              if(r.strava.calories) s += ` | ${r.strava.calories}kcal`;
              const splitsArr = r.strava.splits || r.strava.splits_par_km;
              if(splitsArr && splitsArr.length > 0) {
                s += '\n  SPLITS EXACTS :' + splitsArr.map(sp => `\n    km ${sp.km} : ${sp.allure||'—'}/km · FC ${sp.fc||'—'} bpm`).join('');
              }
            }
          });
          s += '\n=== FIN HISTORIQUE ===\nRÈGLE : Ces valeurs sont exactes. Ne JAMAIS inventer d\'autres splits ou FC. Citer ces valeurs telles quelles si Guillaume demande.';
          return s;
        })()}\n\nQuestion: ${message}` }
      ];
      if(isStreaming) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const MAX_RETRIES = 3;
        let streamRes = null;
        for(let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          if(attempt > 0) {
            await new Promise(r => setTimeout(r, Math.pow(2, attempt - 1) * 1000));
            console.log(`coachChat retry attempt ${attempt + 1}`);
          }
          streamRes = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': ANTHROPIC_API_KEY.value(),
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTokens, stream: true, system, messages })
          }, 110000);
          console.log(`Anthropic coachChat attempt ${attempt + 1} status:`, streamRes.status);
          if(streamRes.ok || ![429, 503, 529].includes(streamRes.status)) break;
          const errText = await streamRes.text().catch(()=>'no body');
          console.error(`Anthropic coachChat error ${streamRes.status} (attempt ${attempt + 1}):`, errText);
        }

        if (!streamRes || !streamRes.ok || !streamRes.body) {
          const errText = streamRes ? await streamRes.text().catch(()=>'no body') : 'no response';
          console.error('Anthropic coachChat final error:', streamRes?.status, errText);
          res.write('data: ' + JSON.stringify({token: 'Je suis momentanément indisponible, réessaie dans quelques secondes.'}) + '\n\n');
          res.write('data: [DONE]\n\n'); res.end(); return;
        }

        let buffer = '';
        for await (const chunk of streamRes.body) {
          buffer += Buffer.from(chunk).toString('utf-8');
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for(const line of lines) {
            if(!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if(data === '[DONE]') { res.write('data: [DONE]\n\n'); continue; }
            try {
              const parsed = JSON.parse(data);
              if(parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
                res.write('data: ' + JSON.stringify({token: parsed.delta.text}) + '\n\n');
              }
              if(parsed.type === 'message_stop') res.write('data: [DONE]\n\n');
            } catch(e) {}
          }
        }
        res.end();
      } else {
        const reply = await callAnthropic(ANTHROPIC_API_KEY.value(), system, messages, maxTokens);
        res.json({ reply: reply || 'Réponse non disponible.' });
      }
    } catch(e) {
      console.error('coachChat error:', e.message);
      if(!res.headersSent) res.status(500).json({ error: e.message });
    }
  }
);

exports.quickBrief = onRequest(
  {cors: true, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 30, memory: '256MiB'},
  async (req, res) => {
    if(req.method==='OPTIONS'){res.set('Access-Control-Allow-Origin','*');res.set('Access-Control-Allow-Headers','Content-Type,Accept,Authorization');res.status(204).send('');return;}
    res.set('Access-Control-Allow-Origin','*');
    try { await verifyAdmin(req); } catch(e) { res.status(403).json({ error: e.message }); return; }
    try {
      const {fc_repos_today, seances_today, jour, bodyhit, renfo_today} = req.body || {};
      let sit = null;
      try { const _db = admin.database(); sit = await buildTrainingSituation(_db, (await _db.ref(ADMIN_STATE).once('value')).val() || {}); } catch(e) {}

      const fcLine = fc_repos_today
        ? `FC repos ce matin : ${fc_repos_today} bpm.`
        : null;

      const seancesLine = (seances_today||[]).length > 0
        ? (seances_today||[]).map(s => {
            const t = {ef:'EF', tempo:'Tempo', frac:'Fractionné', long:'Sortie longue', race:'Course'}[s.type] || s.type;
            return `${t} ${s.km}km${s.heure ? ' à '+s.heure : ''}`;
          }).join(' + ')
        : `Pas de séance prévue ce ${jour||'aujourd\'hui'}`;

      const bodyhitLine = jour === 'lundi' ? 'Bodyhit 20min à 12h30 (renfo cardio).' : null;
      const renfoLine = renfo_today ? `Renfo kiné : ${renfo_today}.` : null;
      const userMsg = [
        fcLine,
        `Programme : ${seancesLine}.`,
        bodyhitLine,
        renfoLine,
        'Génère un brief matinal en 3-4 phrases. Mentionne tous les éléments fournis : séance run, bodyhit/renfo si présents, FC repos si fournie.',
        'Parle UNIQUEMENT de ce qui est fourni ci-dessus.',
        fcLine ? 'Commente brièvement la FC repos.' : 'Ne mentionne PAS la FC repos.',
        'Ton direct, 1 emoji, pas de tirets ni de listes.',
        'Termine par une phrase courte d\'encouragement.',
        sit ? 'Situation (pour calibrer le ton ; en période post-course, rappeler la reprise douce en quelques mots) :\n' + sit.text : null
      ].filter(Boolean).join('\n');

      const system = `Tu es le coach running de Guillaume. Brief matinal court et personnel. Maximum 4 phrases. Pas de blocs, pas de tirets, pas de recap semaine. Mentionne le renfo si present. Juste l'essentiel du jour.`;

      res.set('Content-Type', 'text/event-stream');
      res.set('Cache-Control', 'no-cache');
      res.set('X-Accel-Buffering', 'no');

      const streamRes = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY.value(), 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 200, stream: true, system, messages: [{role:'user', content: userMsg}] })
      }, 28000);
      if (!streamRes.ok) {
        res.write('data: ' + JSON.stringify({token: 'Brief indisponible momentanément.'}) + '\n\n');
        res.write('data: [DONE]\n\n'); res.end(); return;
      }
      let _buf = '';
      for await (const chunk of streamRes.body) {
        _buf += Buffer.from(chunk).toString('utf-8');
        const lines = _buf.split('\n'); _buf = lines.pop();
        for(const line of lines) {
          if(!line.startsWith('data: ')) continue;
          const d = line.slice(6).trim();
          try {
            const p = JSON.parse(d);
            if(p.type === 'content_block_delta' && p.delta?.text)
              res.write(`data: ${JSON.stringify({token: p.delta.text})}\n\n`);
            if(p.type === 'message_stop') res.write('data: [DONE]\n\n');
          } catch(e) {}
        }
      }
      res.end();
    } catch(e) {
      console.error('quickBrief error:', e.message);
      res.status(500).json({error: e.message});
    }
  }
);

exports.morningBrief = onRequest(
  {cors: true, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 120, memory: '256MiB'},
  async (req, res) => {
    if(req.method==='OPTIONS'){res.set('Access-Control-Allow-Origin','*');res.set('Access-Control-Allow-Headers','Content-Type,Accept,Authorization');res.status(204).send('');return;}
    res.set('Access-Control-Allow-Origin','*');
    try { await verifyAdmin(req); } catch(e) { res.status(403).json({ error: e.message }); return; }
    try {
      const context = req.body?.context;
      if(!context){ res.status(400).json({error:'context requis'}); return; }
      let sit = null;
      try { const _db = admin.database(); sit = await buildTrainingSituation(_db, (await _db.ref(ADMIN_STATE).once('value')).val() || {}); } catch(e) { console.warn('morningBrief situation:', e.message); }

      const system = `Tu es le coach running de Guillaume. Ta mission : rédiger le brief du matin, UNIQUEMENT sur la journée d'aujourd'hui.

STRUCTURE OBLIGATOIRE — exactement dans cet ordre, pas de variation :

## ❤️ FC REPOS & RÉCUPÉRATION
Si le score de récupération WHOOP est disponible, l'annoncer en **gras** (ex: **Récup : 78 %**) + interprétation courte (≥67 % → bonne, 34-66 % → modérée, <34 % → fatigue). FC repos en **gras**, comparaison 7j. UNE phrase max.

## 🎯 SÉANCE DU JOUR
Si "Aucune séance planifiée" ET bodyhit=false : écrire UNIQUEMENT "🛌 Jour de repos — profites-en pour récupérer." et ARRÊTER.
Sinon : activité(s) prévue(s), distance si run, heure si connue. UNE phrase. Si heure_lecture >= 10 et heure de séance connue, indiquer "dans X heures" plutôt que "ce matin".

## ⚡ CONSIGNES & MÉTÉO
UNIQUEMENT si séance run ou renfo planifiée.
- EF : allure en **gras**, FC en **gras**, rappel FC max. Décharge : **+30s/km**.
- Tempo/Frac : allure blocs en **gras**, structure courte. Zone FC tempo : **157-170 bpm** (80-87% FCmax). NE JAMAIS indiquer 148 bpm comme limite pour le tempo — 148 est le plafond EF uniquement.
- Renfo : 3 exercices clés seulement.
- Bodyhit : "Électrostimulation full body à 12h30".
Si météo disponible : ajouter UNE phrase sur température, conditions et impact séance (FC ajustée, allure, hydratation si T°>28°C).
INTERDIT : mention gel ou eau hors contexte chaleur.

## 🍌 NUTRITION
UNIQUEMENT si séance run. 2 lignes max :
Gels : <12km→aucun | 12-15km→**1 gel km 6** | 16-19km→**2 gels km 6&12** | 20-23km→**3 gels km 6,12,17** | 24-27km→**4 gels** | 28-41km→**5 gels** | ≥42km→**8 gels**.
Eau : <14km→aucune sauf chaleur >28°C(**500ml**) | ≥14km→**1L**.

RÈGLES ABSOLUES :
- ULTRA-CONCIS : 1 phrase par section. 5-6 lignes de texte MAXIMUM au total.
- Pas de tirets, pas de listes. Données chiffrées en **gras**.
- INTERDIT : récapituler la semaine passée ou parler de séances absentes de seances_du_jour.
- SITUATION D'ENTRAÎNEMENT (fournie en fin de message) : elle sert à calibrer. En PÉRIODE POST-COURSE, le dire en une phrase dans FC REPOS & RÉCUPÉRATION (ex. « J+10 après ton marathon : reprise en douceur ») et adapter les consignes (footing facile, aucune intensité), en la croisant avec la récupération WHOOP, la FC repos et la VFC. Semaine allégée ou course proche : le signaler en quelques mots.
- Si heure_lecture est fournie et >= 10 : adapter le ton ("dans X heures" / "cet après-midi").`;

      const seancesStr = (context.seances_du_jour||[]).map(s => {
        const t = {ef:'EF', tempo:'Tempo', frac:'Fractionné', long:'Sortie longue', renfo:'Renforcement', race:'Course'}[s.type] || s.type;
        return `${t}${s.km ? ' '+s.km+'km' : ''}${s.heure ? ' à '+s.heure : ''}${s.allure_cible ? ' — allure : '+s.allure_cible : ''}`;
      }).join(' + ') || 'Aucune séance planifiée';

      const recovLine = context.whoop_recovery_score != null
        ? `Score récupération WHOOP : ${context.whoop_recovery_score} %`
        : null;
      const fcLine = context.fc_repos_bpm
        ? `FC repos ce matin : ${context.fc_repos_bpm} bpm (moyenne 7j : ${context.fc_repos_moyenne_7j||'—'} bpm)${context.fc_repos_alerte ? ' ⚠️ '+context.fc_repos_alerte : ''}`
        : 'FC repos non saisie ce matin';

      const meteoLine = context.meteo
        ? `Météo : ${context.meteo.temperature}°C${context.meteo.conditions ? ' — '+context.meteo.conditions : ''}${context.meteo.conseil_chaleur ? ' — '+context.meteo.conseil_chaleur : ''}`
        : 'Météo non disponible';

      const memosLine = context.memos ? `\nNotes coach (mémos) :\n${context.memos}` : '';
      const heureLecture = context.heure_lecture !== undefined ? context.heure_lecture : null;
      const userMsg = `${context.jour} ${context.date}${heureLecture !== null ? ' — heure de lecture : '+heureLecture+'h' : ''}

${recovLine ? recovLine+'\n' : ''}${fcLine}
${meteoLine}
Séances du jour : ${seancesStr}
Allure EF cible : ${context.allure_ef||'non renseignée'}
Allure marathon cible : ${context.allure_marathon||'non renseignée'}
${context.allure_tempo ? 'Allure tempo : '+context.allure_tempo : ''}
Consignes : ${context.consignes_ef||''}${memosLine}${sit ? '\n\n' + sit.text : ''}`;

      res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});

      const streamRes = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY.value(), 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 350, stream: true, system, messages: [{role:'user', content: userMsg}] })
      }, 85000);
      if (!streamRes.ok) {
        res.write('data: ' + JSON.stringify({token: 'Brief indisponible momentanément.'}) + '\n\n');
        res.write('data: [DONE]\n\n'); res.end(); return;
      }
      let buffer = '';
      for await (const chunk of streamRes.body) {
        buffer += Buffer.from(chunk).toString('utf-8');
        const lines = buffer.split('\n'); buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text)
              res.write('data: ' + JSON.stringify({token: parsed.delta.text}) + '\n\n');
            if (parsed.type === 'message_stop') res.write('data: [DONE]\n\n');
          } catch(e) {}
        }
      }
      res.end();
    } catch(e) {
      console.error('morningBrief error:', e.message);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
);

exports.addMemo = onRequest(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 60, memory: '256MiB' },
  async (req, res) => {
    corsHeaders(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try { await verifyAdmin(req); } catch(e) { res.status(403).json({ error: e.message }); return; }
    try {
      const { note, existingMemos } = req.body;
      const system = `Tu gères les mémos personnalisés du coach IA de Guillaume, un coureur qui prépare un marathon.
Guillaume vient d'envoyer une remarque explicite qu'il veut que son coach retienne pour toutes les prochaines conversations.
Tu dois intégrer cette nouvelle remarque dans les mémos existants de façon claire et concise.
Règles :
- Reformule la remarque comme une instruction pour le coach (ex: "Ne jamais dire demain si la séance est dans 2+ jours")
- Si la remarque indique qu'un problème est résolu (ex: "j'ai respecté mes allures"), supprime le mémo correspondant au problème
- Intègre-la aux mémos existants sans dupliquer
- Garde les mémos courts : 1 ligne par note, 15 notes maximum
- Réponds UNIQUEMENT avec les mémos mis à jour, en texte brut, 1 note par ligne
- Commence chaque ligne par "- "`;

      const today = new Date().toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit', year:'numeric'});
      const userMsg = `Mémos existants :
${existingMemos || '(aucun)'}

Nouvelle remarque de Guillaume (${today}) : "${note}"

Retourne les mémos mis à jour. Ajoute la date entre parenthèses à la fin de chaque nouvelle note au format (jj/mm/aaaa).`;
      const memos = await callAnthropic(ANTHROPIC_API_KEY.value(), system, [{role:'user', content: userMsg}], 400);
      res.json({ memos: memos || existingMemos });
    } catch(e) {
      console.error('addMemo error:', e.message);
      res.status(500).json({ error: e.message });
    }
  }
);

exports.extractMemos = onRequest(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 60, memory: '256MiB' },
  async (req, res) => {
    corsHeaders(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try { await verifyAdmin(req); } catch(e) { res.status(403).json({ error: e.message }); return; }
    try {
      const { history, existingMemos, recentPerfs } = req.body;
      const system = `Tu gères les mémos personnalisés du coach IA de Guillaume.
Tu dois mettre à jour les mémos existants selon la conversation ET les données de performances récentes.
Extrais UNIQUEMENT les faits personnels importants et durables : blessures, contraintes physiques, préférences, objectifs, contexte de vie, ressentis récurrents, points forts/faibles, tendances d'allure.

RÈGLES DE MISE À JOUR — ESSENTIELLES :
1. SUPPRESSION si problème résolu : compare CHAQUE mémo existant avec les performances récentes.
   Exemple : mémo dit 'accélère trop sur les tempos (4\'51 au lieu de 4\'55-5\'00)'
   → si les performances récentes montrent 4\'55-5\'02 sur les tempos, SUPPRIME ce mémo.
2. MISE À JOUR si partiellement amélioré : reformule le mémo pour refléter la tendance actuelle.
   Exemple : 'A tendance à accélérer sur les tempos — à surveiller en S9+'
3. CONSERVATION si toujours d\'actualité : garde le mémo tel quel.
4. AJOUT si nouvelle information importante détectée dans la conversation.
5. Les mémos doivent refléter la RÉALITÉ ACTUELLE, jamais l\'historique.
6. Maximum 12 lignes, 1 info par ligne, commence par '- '
7. Retourne toujours les mémos (même inchangés), jamais de message vide.`;

      const todayExtract = new Date().toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit', year:'numeric'});
      const perfsSection = recentPerfs ? `\n\nPerformances récentes (données objectives) :\n${recentPerfs}` : '';
      const userMsg = `Mémos existants :\n${existingMemos||'(aucun)'}${perfsSection}\n\nConversation récente (${todayExtract}) :\n${(history||[]).map(m=>`${m.role==='user'?'Guillaume':'Coach'}: ${m.content}`).join('\n')}\n\nAnalyse les mémos vs les performances récentes. Retourne les mémos mis à jour. Ajoute la date (${todayExtract}) aux nouvelles notes.`;
      const memos = await callAnthropic(ANTHROPIC_API_KEY.value(), system, [{role:'user', content: userMsg}], 400);
      res.json({ memos: memos || existingMemos || '' });
    } catch(e) {
      console.error('extractMemos error:', e.message);
      res.status(500).json({ error: e.message });
    }
  }
);

exports.adminTestNotif = onRequest(
  { secrets: [VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, ANTHROPIC_API_KEY], cors: true, timeoutSeconds: 120, memory: '512MiB' },
  async (req, res) => {
    corsHeaders(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try { await verifyAdmin(req); } catch(e) { res.status(403).json({ error: e.message }); return; }
    const { type } = req.body || {};
    try {
      const db = admin.database();
      const snap = await db.ref(`${ADMIN_STATE}/whoop_token`).once('value');
      const hasWhoop = !!(snap.val()?.access_token);

      const notifs = {
        'reveil-matin':      { title: "💪 C'est parti pour aujourd'hui !", body: "Enregistre ton réveil → reçois ton brief du matin 🏃‍♂️", tag: 'fc-repos' },
        'rappel-14h':        { title: "⏰ Hey, t'as oublié quelque chose !", body: "Ton brief du matin t'attend — enregistre ton réveil 👆", tag: 'fc-repos-14h' },
        'avant-seance':      { title: '⏱️ Séance dans 1h', body: '👟 Course facile à 7:00 (exemple). Prépare-toi !', tag: 'session-reminder' },
        'seance-non-validee':{ title: '⚠️ Séance non validée', body: 'Tu as une séance non validée aujourd\'hui — valide-la dans l\'app 🏃', tag: 'unvalidated-reminder' },
        'semaine-complete':  { title: '🎉 Semaine complète !', body: 'Toutes tes séances sont faites cette semaine. Excellent travail 💪', tag: 'week-complete' },
        'planif-semaine':    { title: '📅 Plan S+1', body: 'Vérifie tes horaires de séances et renfos pour la semaine ! 🏃💪', tag: 'planif-reminder' },
        'shaker-post-run':   { title: '🥤 Rappel protéines !', body: 'Belle séance ! N\'oublie pas ton shaker de récupération 💪', tag: 'shaker-post-run' },
        'shaker-midi':       { title: '🥤 Pense à ton shaker !', body: 'Pas de séance aujourd\'hui ? Prends quand même tes protéines du midi 💪', tag: 'shaker-noon' },
        'brief-matin':       null,
        'bilan-semaine':     null,
      };

      if (type === 'brief-matin') {
        const today = new Date().toISOString().slice(0, 10);
        // Effacer les flags pour permettre une régénération complète
        await db.ref(`${ADMIN_STATE}/_brief_fc_notif_${today}`).remove();
        await db.ref(`${ADMIN_STATE}/_brief_matin_${today}`).remove();
        await db.ref(`${ADMIN_STATE}/_brief_pending`).remove();

        // Générer le brief immédiatement (sans contrainte horaire)
        const stateSnap = await db.ref(ADMIN_STATE).once('value');
        const st = stateSnap.val() || {};
        const cw = getCurrentWeek(st);

        const { briefContent, pushBody } = await generateMorningBriefContent(
          ANTHROPIC_API_KEY.value(), db, st, cw, today
        );

        // Stocker le brief pour que le Coach l'affiche au tap de la notif
        // Ne PAS poser _brief_matin_today : c'est un test, il ne doit pas bloquer le flux réel du matin
        if (briefContent) {
          await db.ref(`${ADMIN_STATE}/_brief_pending`).set({ content: briefContent, date: today, type: 'morning_brief' });
        }
        await db.ref(`${ADMIN_STATE}/_open_coach`).set(true);

        const notifTitle = '🌅 Brief du matin — TEST';
        const notifBody = pushBody || 'Brief matinal prêt — ouvre le Coach IA 🏃';
        const pushSent = await sendPush(VAPID_PUBLIC_KEY.value(), VAPID_PRIVATE_KEY.value(), notifTitle, notifBody, 'brief-matin-test', '/');

        res.json({
          success: true,
          message: pushSent
            ? 'Brief généré et push envoyée.'
            : 'Brief généré mais push non envoyée (subscription manquante ou expirée) — ouvre le Coach dans l\'app.',
          pushSent
        });
        return;
      }

      if (type === 'bilan-semaine') {
        const today = new Date().toISOString().slice(0, 10);
        await db.ref(`${ADMIN_STATE}/_brief_pending`).remove();
        await db.ref(`${ADMIN_STATE}/_bilan_semaine_${today}`).remove();
        const stateSnap = await db.ref(ADMIN_STATE).once('value');
        const st = stateSnap.val() || {};
        const cw = getCurrentWeek(st);
        const { bilanContent, pushBody } = await generateWeeklyBilanContent(ANTHROPIC_API_KEY.value(), db, st, cw);
        if (bilanContent) {
          await db.ref(`${ADMIN_STATE}/_brief_pending`).set({ content: bilanContent, date: today, type: 'weekly_bilan' });
        }
        await db.ref(`${ADMIN_STATE}/_open_coach`).set(true);
        const pushSent = await sendPush(VAPID_PUBLIC_KEY.value(), VAPID_PRIVATE_KEY.value(), `📊 Bilan S${cw} — TEST`, pushBody || 'Bilan de semaine prêt — ouvre le Coach 📊', 'bilan-semaine-test', '/');
        res.json({ success: true, message: pushSent ? 'Bilan généré et push envoyée.' : 'Bilan généré — ouvre le Coach dans l\'app.', pushSent });
        return;
      }

      const notif = notifs[type];
      if (!notif) { res.json({ success: false, error: 'Type inconnu: ' + type }); return; }

      await sendPush(VAPID_PUBLIC_KEY.value(), VAPID_PRIVATE_KEY.value(), notif.title, notif.body, notif.tag, '/');
      res.json({ success: true });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  }
);

exports.adminTriggerBrief = onRequest(
  { cors: true },
  async (req, res) => {
    corsHeaders(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try { await verifyAdmin(req); } catch(e) { res.status(403).json({ error: e.message }); return; }
    try {
      const db = admin.database();
      const ADMIN_STATE = `users/${ADMIN_UID}/state`;
      const today = new Date().toISOString().slice(0, 10);
      await db.ref(`${ADMIN_STATE}/_brief_fc_notif_${today}`).remove();
      await db.ref(`${ADMIN_STATE}/_brief_matin_${today}`).remove();
      await db.ref(`${ADMIN_STATE}/_brief_trigger`).set({ ts: Date.now(), date: today });
      res.json({ success: true });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  }
);


// ─── Plan › « MAJ le plan » : relecture du plan par le Coach ─────────────────
// Reçoit le plan (séances faites avec leurs résultats, séances à venir), le niveau calculé dans l'app, les contrôles
// et propositions automatiques ; renvoie un avis et des modifications JSON (séances à venir uniquement), validées ici.
// ─── Plan : éléments communs à la relecture du Coach (planReview) et à la discussion « Mon plan » (planChat) ───
const PLAN_PRINCIPLES = `CE QUE TU DOIS ANALYSER D'ABORD :
- Son historique (prépas précédentes : km réalisés par semaine, volume habituel, pic, sortie longue max, séances de qualité et allures tenues). C'est sa CHARGE CHRONIQUE : elle fixe ce qu'il peut encaisser, pas la semaine précédente seule.
- Son niveau actuel (équivalent VDOT d'après records et séances) et l'écart avec l'objectif.
- Ses séances réalisées dans le plan en cours (allures, FC, ressenti).

PRINCIPES :
- Volume : la règle des +10-15 %/semaine vaut pour construire un volume jamais tenu. Sous son volume habituel (reprise après une course, retour après coupure), remonter plus vite est normal et souhaitable : après un marathon, ~40-50 % du volume habituel la 1re semaine, ~60-70 % la 2e, ~75-90 % la 3e, puis plein volume. Ne réduis pas un volume qui reste sous sa charge habituelle.
- Sortie longue : le repère 35-40 % du volume n'a de sens qu'au-dessus de ~40 km/sem ; une sortie longue de 8-12 km n'est jamais un risque pour un marathonien.
- Post-marathon : l'intensité revient progressivement (lignes droites puis fractionné court dès ~J+14-18 si les sensations sont bonnes) ; une course de 10 km à ~5 semaines d'un marathon se prépare avec du seuil et de la VMA, pas seulement du footing.
- Allures : suivent le niveau ACTUEL (VDOT fourni). L'allure course peut viser l'objectif s'il est à moins de ~3 % du niveau actuel, sinon s'en rapprocher.
- Respecte l'intention de chaque séance et la structure de la semaine (jours, nombre de séances).
- Séances trop dures (FC élevée, allures non tenues) → alléger ; trop faciles (allures dépassées à FC basse) → durcir.
- Les « propositions automatiques » sont CONSERVÉES par défaut et s'ajoutent à tes changements : ne les recopie pas. Chacune a un "champ" : detail (allure / consigne), km, ou session (remplacement de la séance entière : footing à la place d'une séance de qualité si fatigue ou douleur, test 5 km…) ; "retenue": false = décochée par l'athlète. Pour en modifier une, renvoie un changement sur la même ref et le même champ (pour une proposition "session", ton "detail" s'applique à la nouvelle séance) ; pour l'écarter, mets "ref:champ" (ou "ref" pour toutes celles de la séance) dans "rejected". Les « contrôles automatiques » sont indicatifs : dis-le si une alerte n'est pas pertinente vu son historique.
- RECETTE PERSONNELLE : elle résume ce que ses prépas précédentes ont montré (hausse de volume encaissée, affûtage qui a marché, allures tenues). Respecte-la sauf raison claire, et dis-le quand tu t'en écartes.
- PRIORITÉS en cas de conflit : 1) douleur, fatigue (WHOOP, effort ressenti) ; 2) récupération après course ; 3) volume habituel et progression ; 4) performance (allures, objectif).
- CONTINUITÉ : l'« historique des modifications » liste ce qui a déjà été changé et appliqué lors des relectures précédentes (souvent par toi). Ces décisions sont acquises : ne les annule pas et ne les retouche pas, sauf fait nouveau (séance réalisée depuis, record, ressenti, résultat qui contredit le choix) — et dans ce cas dis-le dans la raison. Si aucune donnée nouvelle depuis ta dernière relecture, renvoie "changes": [] (sauf erreur manifeste) et dis simplement que le plan est à jour — sauf si la relecture est « redemandée par l'athlète » : propose alors ce que tu juges vraiment utile.
- DONNÉES RÉELLES : appuie-toi sur la charge réelle (ratio 7 j / 28 j idéalement 0,8-1,3), le volume conseillé par semaine (il tient compte de ta base, de la reprise après course et de l'affûtage ; les propositions de km correspondantes sont déjà dans les propositions automatiques), la dérive cardiaque (> 5 % : ne pas accélérer l'endurance), WHOOP (fatigue = alléger les 3 prochains jours) et les allures tenues ou non (souvent pas tenues = plus prudent). Effort ressenti élevé sur des footings (RPE ≥ 7) = fatigue ; douleur gênante ou forte = pas d'intensité ni de hausse de volume tant qu'elle persiste (conseille de consulter si elle dure). Si la trajectoire rend l'objectif « ambitieux », dis-le franchement et propose ce qui peut le rapprocher.
- Ne change que ce qui a un vrai effet sur la performance ou le risque : pas de retouche de 1 km, pas de changement cosmétique. Mieux vaut 0 à 5 changements forts que 10 petits. Tu peux AUGMENTER (volume, intensité) autant que réduire.

FORMAT DES CONSIGNES (champ "detail") — identique au plan : court, l'allure d'abord, ex. « 3 km EF · 4 × 1000 m à 4'12 — 4'16 /km · récup 2 min » ou « 5'30 — 6'10 /km ». Allures au format m'ss avec « — » entre deux bornes et « /km ».

`;
// séances modifiables (à venir, non faites, ni repos) et plan compact envoyé au Coach
function planEditable(b){
  const editable = Object.create(null);
  b.plan.forEach((w) => (w.sessions || []).forEach((s) => { if (s && /^extra_w\d+_s\d+$/.test(String(s.ref)) && !s.done && s.type !== 'rest' && (!s.date || !b.today || s.date >= b.today)) editable[s.ref] = s; }));
  const compact = b.plan.map((w) => ({ semaine: w.w, phase: w.meta && w.meta.phase, recup: !!(w.meta && w.meta.isRecov), pic: !!(w.meta && w.meta.isPeak), affutage: !!(w.meta && w.meta.isTaper),
    seances: (w.sessions || []).map((s) => Object.assign({ ref: s.ref, date: s.date, type: s.type, titre: s.title, consigne: s.detail, km: s.km },
      s.done ? { fait: true, resultat: s.result } : { modifiable: !!editable[s.ref] })) }));
  return { editable, compact };
}
// toutes les données de l'athlète et du plan, en texte pour le Coach
function planDataText(b, situation, compact){
  const hist = Array.isArray(b.history) ? b.history.slice(0, 2) : [];
  return `Aujourd'hui : ${b.today || ''}
Course objectif : ${JSON.stringify(b.race || {})}
Niveau calculé dans l'app : ${JSON.stringify(b.fitness || 'non disponible (aucun record ni séance exploitable)')}
Volume habituel (charge chronique, dernière prépa) : ${b.habitualKm ? b.habitualKm + ' km/semaine' : 'inconnu'}
Charge réelle (séances validées) : ${b.charge ? JSON.stringify(b.charge) : 'inconnue'}
Volume par semaine (prévu / fait / conseillé par le calcul) : ${b.volume ? JSON.stringify(Object.assign({}, b.volume, { semaines: (b.volume.semaines || []).slice(0, 40) })) : 'non calculé'}
Dérive cardiaque des footings et sorties longues (splits Strava, < 5 % = endurance solide) : ${b.derive_cardiaque ? JSON.stringify(b.derive_cardiaque) : 'non mesurée'}
Récupération WHOOP (3 derniers jours) : ${b.whoop ? JSON.stringify(b.whoop) : 'pas de données'}
Recette personnelle (tirée de ses prépas précédentes : progression de volume encaissée, affûtage de sa meilleure course, réglage des allures) : ${b.recette ? JSON.stringify(b.recette) : 'pas encore de prépa terminée'}
Bilan de sa dernière prépa terminée : ${b.dernier_bilan ? JSON.stringify(Object.assign({}, b.dernier_bilan, { lecons: (b.dernier_bilan.lecons || []).slice(0, 8) })) : 'aucun'}
Effort ressenti (RPE 1-10) des séances récentes et charge ressentie 7 j / 28 j : ${b.effort_ressenti ? JSON.stringify(Object.assign({}, b.effort_ressenti, { seances_14j: (b.effort_ressenti.seances_14j || []).slice(-12) })) : 'non renseigné'}
Douleurs signalées (5 derniers jours ; niveau 1 légère, 2 gênante, 3 forte) : ${Array.isArray(b.douleurs) && b.douleurs.length ? JSON.stringify(b.douleurs.slice(0, 10)) : 'aucune'}
Allures proposées lors des mises à jour précédentes : tenues ou non : ${b.allures_tenues ? JSON.stringify(Object.assign({}, b.allures_tenues, { detail: (b.allures_tenues.detail || []).slice(-10) })) : 'pas encore de recul'}
Trajectoire (niveau, tendance, projection au jour J) : ${b.trajectoire ? JSON.stringify(b.trajectoire) : 'non calculée'}
Période post-course jusqu'au : ${b.postRaceUntil || 'aucune'}
HISTORIQUE (prépas précédentes, la plus récente d'abord) : ${hist.length ? JSON.stringify(hist.map((h) => Object.assign({}, h, { seances_qualite: (h.seances_qualite || []).slice(-8), km_realises_par_semaine: (h.km_realises_par_semaine || []).slice(-40) }))) : 'aucun'}
Ta dernière relecture : ${b.lastCoachReview ? JSON.stringify(b.lastCoachReview) : 'aucune'}
Données nouvelles depuis ta dernière relecture (séances réalisées) : ${b.lastCoachReview ? (Array.isArray(b.newSince) && b.newSince.length ? JSON.stringify(b.newSince.slice(-15)) : 'AUCUNE') : 'première relecture'}
Historique des modifications déjà appliquées (la plus récente en dernier) : ${Array.isArray(b.reviewHistory) && b.reviewHistory.length ? JSON.stringify(b.reviewHistory.slice(-4).map((h) => Object.assign({}, h, { changements: (h.changements || []).slice(0, 25) }))) : 'aucune'}
Contrôles automatiques : ${JSON.stringify((Array.isArray(b.warnings) ? b.warnings : []).slice(0, 20))}
${b.force ? 'Relecture REDEMANDÉE PAR L\'ATHLÈTE (mêmes données que ta dernière relecture) : il attend un regard neuf.\n' : ''}${b.next ? 'PRÉPA À VENIR, pas encore commencée (début ' + String(b.startDate || '').slice(0, 10) + ') : la situation actuelle (semaine en cours, récupération, charge) ne s\'applique pas à ses premières semaines ; raisonne depuis son démarrage.\n' : ''}Propositions automatiques : ${JSON.stringify((Array.isArray(b.proposals) ? b.proposals : []).slice(0, 40))}
Séances mises en attente (non accélérées automatiquement car tôt dans la récupération ; à toi de juger, change leur "detail" si l'accélération est justifiée) : ${JSON.stringify(Array.isArray(b.held) ? b.held.slice(0, 20) : [])}
${b.memos ? 'Mémos du coach : ' + String(b.memos).slice(-1500) + '\n' : ''}${situation ? '\n' + situation + '\n' : ''}
PLAN COMPLET :
${JSON.stringify(compact)}`;
}
// changements du Coach validés : séances modifiables seulement, champs nettoyés, km bornés autour du plan
function planCleanChanges(list, editable){
  const str = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);
  const clean = (v, n) => { const x = str(v, n); return x ? x.replace(/\|/g, '·').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ') : undefined; };
  const seenRef = Object.create(null);
  return (Array.isArray(list) ? list : []).filter((c) => c && typeof c.ref === 'string' && editable[c.ref] && !seenRef[c.ref] && (seenRef[c.ref] = 1)).slice(0, 12).map((c) => {
    const s = editable[c.ref], o = { ref: c.ref, reason: clean(c.reason, 160) || '' }, race = s.type === 'race', km0 = parseFloat(s.km) || 0;
    const d = clean(c.detail, 300); if (d) o.detail = d;
    const t = clean(c.title, 80); if (t && !race) o.title = t;
    // km : bornés autour du plan (au plus ×1,5 ou +6 km, au moins ×0,4), 42 km maximum
    const km = parseFloat(c.km); if (isFinite(km) && km > 0 && !race){ const hi = Math.min(42, Math.max(km0 * 1.5, km0 + 6)), lo = km0 ? km0 * 0.4 : 1; if (km <= hi && km >= lo) o.km = Math.round(km * 10) / 10; }
    // type : seulement avec une nouvelle consigne qui va avec
    if (['ef', 'long', 'tempo', 'frac'].includes(c.type) && c.type !== s.type && !race && o.detail) o.type = c.type;
    return o;
  }).filter((o) => o.detail || o.title || o.km || o.type);
}

exports.planReview = onRequest(
  { secrets: [ANTHROPIC_API_KEY], cors: true, timeoutSeconds: 120, memory: '512MiB' },
  async (req, res) => {
    corsHeaders(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try { await verifyAdmin(req); } catch(e) { res.status(403).json({ error: e.message }); return; }
    try {
      const b = req.body || {};
      if (!Array.isArray(b.plan) || !b.plan.length) { res.status(400).json({ success: false, error: 'plan requis' }); return; }
      const db = admin.database();
      let situation = '';
      if (!b.next) { try { situation = (await buildTrainingSituation(db, (await db.ref(ADMIN_STATE).once('value')).val() || {}, b.today, { planReview: true })).text; } catch(e) {} }
      // séances modifiables : à venir, non réalisées, ni repos ni course (objet sans prototype, refs au format attendu)
      const { editable, compact } = planEditable(b);
      const system = `Tu es un entraîneur de course à pied de haut niveau (Daniels, Pfitzinger, Canova, Magness), coach personnel de Guillaume, coureur expérimenté. On te demande de relire son plan et de l'optimiser pour la PERFORMANCE, à partir de son historique, de ses résultats réels et de sa situation. Tu n'es pas là pour tout sécuriser : un plan trop prudent est aussi un mauvais plan.

${PLAN_PRINCIPLES}
RÉPONSE : uniquement un objet JSON valide, sans texte autour :
{"assessment":"2 ou 3 phrases courtes (300 caractères max), tutoiement : le verdict et l'idée principale, sans répéter le détail des changements",
 "changes":[{"ref":"extra_w3_s1","detail":"nouvelle consigne (facultatif)","title":"nouveau titre (facultatif)","km":10,"type":"ef|long|tempo|frac (facultatif)","reason":"10 à 15 mots maximum"}],
 "rejected":["ref:champ (ou ref) des propositions automatiques que tu écartes (facultatif)"]}
IMPORTANT : l'avis ne décrit QUE ce qui est réellement dans "changes" (et les propositions automatiques conservées) ; n'annonce jamais un changement que tu ne renvoies pas.
Règles : uniquement des "ref" marquées modifiable ; ne mets dans chaque objet que les champs qui changent ; 8 changements au plus ; ne modifie jamais la séance de course elle-même sauf sa consigne.`;
      const userMsg = planDataText(b, situation, compact);
      const out = await callAnthropic(ANTHROPIC_API_KEY.value(), system, [{ role: 'user', content: userMsg }], 6000, undefined, { timeout: 100000, full: true });
      const raw = out && out.text;
      if (!raw) { res.status(502).json({ success: false, error: 'réponse vide' }); return; }
      if (out.stop === 'max_tokens') { res.status(502).json({ success: false, error: 'réponse du Coach trop longue, coupée : réessaie' }); return; }
      let j = null;
      try { const t = String(raw).replace(/^```(?:json)?\s*|\s*```$/g, ''); j = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch(e) { j = null; }
      if (!j) { res.status(502).json({ success: false, error: 'réponse illisible' }); return; }
      const str = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);
      const changes = planCleanChanges(j.changes, editable);
      const auto = new Set((Array.isArray(b.proposals) ? b.proposals : []).map((p) => p && p.ref).filter(Boolean));
      const rejected = (Array.isArray(j.rejected) ? j.rejected : []).filter((r) => typeof r === 'string' && auto.has(r.split(':')[0])).slice(0, 30);
      res.json({ success: true, assessment: str(j.assessment, 500) || '', changes, rejected });
    } catch(e) {
      console.error('planReview error:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  }
);

// Discussion « Mon plan » (onglet Coach) : Guillaume parle de son plan (ressenti, volume, contraintes) ; le Coach répond et peut
// proposer des changements (mêmes règles et mêmes contrôles que la relecture du plan) qu'il valide ou non dans l'app.
exports.planChat = onRequest(
  { secrets: [ANTHROPIC_API_KEY], cors: true, timeoutSeconds: 120, memory: '512MiB' },
  async (req, res) => {
    corsHeaders(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try { await verifyAdmin(req); } catch(e) { res.status(403).json({ error: e.message }); return; }
    try {
      const b = req.body || {};
      const message = String(b.message || '').replace(/\s+/g, ' ').trim().slice(0, 1500);
      if (!message) { res.status(400).json({ success: false, error: 'message requis' }); return; }
      if (!Array.isArray(b.plan) || !b.plan.length) { res.status(400).json({ success: false, error: 'plan requis' }); return; }
      const db = admin.database();
      let situation = '';
      if (!b.next) { try { situation = (await buildTrainingSituation(db, (await db.ref(ADMIN_STATE).once('value')).val() || {}, b.today, { planReview: true })).text; } catch(e) {} }
      const { editable, compact } = planEditable(b);
      const system = `Tu es le coach running personnel de Guillaume. Dans ce fil, vous parlez UNIQUEMENT de son plan d'entraînement : son ressenti sur les séances et les semaines, le volume, l'intensité, l'organisation, les ajustements. Tu as tout son plan et ses données.

${PLAN_PRINCIPLES}
CONVERSATION :
- Réponds à ce qu'il dit, en 2 à 5 phrases, tutoiement, chaleureux et concret : appuie-toi sur ses chiffres (km faits / prévus, allures, charge, semaines). Pas de titres ni de listes ; **gras** pour les chiffres clés seulement.
- Son ressenti compte. S'il dit que ça s'est bien passé et qu'il voudrait plus, vérifie dans ses données (charge réelle 7 j / 28 j, volume habituel, recette, WHOOP, douleurs, récupération après course) : si c'est sûr, propose une hausse RAISONNABLE et chiffrée ; sinon explique pourquoi pas maintenant et propose une alternative (plus tard, ou autrement).
- S'il veut moins, ou annonce une contrainte (jour indisponible, fatigue, voyage, douleur), adapte le plan.
- Tout changement utile va dans "changes" : il les verra comme des propositions à valider d'un geste. Annonce-les dans ta réponse en une phrase (« je te propose de passer la sortie longue de dimanche de 12 à 14 km »). N'annonce JAMAIS un changement que tu ne renvoies pas, et ne renvoie pas un changement sans l'annoncer.
- Propositions automatiques de l'app (calcul) : si tu les approuves dans ce contexte, mets leur "ref:champ" dans "auto" ; elles seront proposées avec les tiennes (dis-le en une phrase).
- S'il manque une information indispensable, pose UNE question courte au lieu de proposer.
- Hors sujet (autre chose que le plan) : réponds en une phrase et rappelle que ce fil sert au plan (le reste : onglet Coach).
- Ce que la conversation a déjà réglé (propositions appliquées ou refusées) est acquis : ne le repropose pas, sauf s'il le redemande.

RÉPONSE : uniquement un objet JSON valide, sans texte autour :
{"reply":"ta réponse (900 caractères max)","changes":[{"ref":"extra_w3_s1","detail":"nouvelle consigne (facultatif)","title":"nouveau titre (facultatif)","km":12,"type":"ef|long|tempo|frac (facultatif)","reason":"10 à 15 mots"}],"auto":["ref:champ"]}
Règles : uniquement des "ref" marquées modifiable ; dans chaque objet, seulement les champs qui changent ; 8 changements au plus ; ne modifie jamais la séance de course elle-même sauf sa consigne.`;
      const thread = (Array.isArray(b.thread) ? b.thread : []).slice(-12).map((m) => {
        const who = m && m.r === 'u' ? 'Guillaume' : 'Coach';
        const ch = m && Array.isArray(m.ch) && m.ch.length ? ' [propositions : ' + m.ch.slice(0, 8).map((c) => (c.title || c.ref) + ' — ' + c.field + ' : ' + c.before + ' → ' + c.after).join(' ; ') + ' — ' + (m.st === 'applied' ? 'APPLIQUÉES' : m.st === 'dismissed' ? 'REFUSÉES' : m.st === 'undone' ? 'ANNULÉES' : 'en attente') + ']' : '';
        return who + ' : ' + String((m && m.t) || '').slice(0, 900) + ch;
      });
      const userMsg = planDataText(b, situation, compact)
        + `\n\nCONVERSATION SUR LE PLAN (la plus récente en dernier) :\n${thread.length ? thread.join('\n') : '(début de la conversation)'}\n\nMESSAGE DE GUILLAUME : ${message}`;
      const out = await callAnthropic(ANTHROPIC_API_KEY.value(), system, [{ role: 'user', content: userMsg }], 3000, undefined, { timeout: 100000, full: true });
      const raw = out && out.text;
      if (!raw) { res.status(502).json({ success: false, error: 'réponse vide' }); return; }
      let j = null;
      try { const t = String(raw).replace(/^```(?:json)?\s*|\s*```$/g, ''); j = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch(e) { j = null; }
      // réponse en texte libre (JSON raté) : la réponse est gardée, sans changement
      if (!j || typeof j.reply !== 'string') j = { reply: String(raw).replace(/^```[\s\S]*?```$/g, '').trim().slice(0, 1200), changes: [] };
      const changes = planCleanChanges(j.changes, editable);
      const autoRefs = new Set((Array.isArray(b.proposals) ? b.proposals : []).map((p) => p && p.ref && p.ref + ':' + p.champ).filter(Boolean));
      const auto = (Array.isArray(j.auto) ? j.auto : []).filter((r) => typeof r === 'string' && autoRefs.has(r)).slice(0, 20);
      res.json({ success: true, reply: String(j.reply || '').trim().slice(0, 1200), changes, auto });
    } catch(e) {
      console.error('planChat error:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  }
);

// Journal de séance (dicté ou écrit après la validation) : le Coach en tire l'effort ressenti, la douleur, la zone et une note courte.
// Réponse validée : rpe 1-10, douleur 0-3 + zone de la liste de l'app, note ≤ 160 caractères.
const JOURNAL_ZONES = ['Mollet', 'Tibia', 'Genou', 'Cheville / pied', 'Ischios', 'Quadriceps', 'Hanche', 'Dos', 'Autre'];
exports.sessionJournal = onRequest(
  { secrets: [ANTHROPIC_API_KEY], cors: true, timeoutSeconds: 40, memory: '256MiB' },
  async (req, res) => {
    corsHeaders(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try { await verifyAdmin(req); } catch(e) { res.status(403).json({ error: e.message }); return; }
    try {
      const b = req.body || {};
      const text = String(b.text || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
      if (text.length < 3) { res.status(400).json({ success: false, error: 'texte requis' }); return; }
      const s = b.session || {};
      const system = `Tu lis le compte rendu dicté par un coureur juste après sa séance et tu en extrais des données pour son carnet d'entraînement. Réponds UNIQUEMENT par un objet JSON, sans texte autour :
{"rpe": entier 1-10 ou null, "pain_level": 0 | 1 | 2 | 3 | null, "pain_zone": une valeur de ${JSON.stringify(JOURNAL_ZONES)} ou null, "note": "résumé de son ressenti en une phrase, à la 1re personne, ≤ 140 caractères"}
- rpe = effort ressenti (échelle de Borg CR10 : 2 très facile, 4 facile, 5-6 modéré, 7-8 difficile, 9-10 maximal). null s'il n'en dit rien.
- pain_level : 0 = il dit n'avoir aucune douleur ; 1 = légère / tension / courbature ; 2 = gênante (il y pense en courant) ; 3 = forte (boite, a dû ralentir ou s'arrêter). null s'il n'en parle pas. Une simple fatigue n'est pas une douleur.
- pain_zone : seulement si pain_level ≥ 1 ; "Autre" si la zone n'est pas dans la liste.
- note : fidèle à ce qu'il dit, sans conseil ni invention.`;
      const user = `Séance : ${String(s.title || '').slice(0, 80)} (${String(s.type || '').slice(0, 10)}${s.km ? ', ' + s.km + ' km' : ''}${s.pace ? ', ' + s.pace + '/km' : ''}${s.hr ? ', FC ' + s.hr : ''}).\nCompte rendu : « ${text} »`;
      const raw = await callAnthropic(ANTHROPIC_API_KEY.value(), system, [{ role: 'user', content: user }], 300);
      let j = null;
      try { const m = String(raw || '').match(/\{[\s\S]*\}/); j = m ? JSON.parse(m[0]) : null; } catch(e) {}
      if (!j || typeof j !== 'object') { res.status(502).json({ success: false, error: 'réponse du Coach illisible' }); return; }
      const rpe = Number.isInteger(j.rpe) && j.rpe >= 1 && j.rpe <= 10 ? j.rpe : null;
      const lvl = Number.isInteger(j.pain_level) && j.pain_level >= 0 && j.pain_level <= 3 ? j.pain_level : null;
      const zone = lvl ? (JOURNAL_ZONES.includes(j.pain_zone) ? j.pain_zone : 'Autre') : null;
      const note = typeof j.note === 'string' ? j.note.replace(/[\r\n|]+/g, ' ').trim().slice(0, 160) : null;
      res.json({ success: true, rpe, pain: lvl == null ? null : { level: lvl, zone }, note: note || null });
    } catch(e) {
      console.error('sessionJournal error:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  }
);
