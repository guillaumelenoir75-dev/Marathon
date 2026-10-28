# Plan Marathon — contexte projet

PWA de préparation marathon, multi-utilisateur. L'admin crée les comptes et a accès au Coach IA. Les athlètes suivent leur plan.

## Stack
- **Frontend** : `public/index.html` — HTML + CSS inline, charge 23 scripts JS via `<script defer>`.  
  Build : Vite (`root: 'public'`, `publicDir: '../public-static'`) → `dist/`. Les fichiers `public-static/src/*.js` sont copiés verbatim (pas de hash), chargés en scripts classiques (pas de modules ES). Toutes les fonctions doivent être en scope global.
- **Backend** : Cloud Functions Firebase v2 (Node 24), modulaires dans `functions/`.
- **Données** : Firebase Realtime Database, projet `prepa-marathon` (europe-west1). Structure : `users/{uid}/state`, `users/{uid}/role`, `users/{uid}/preps/{id}` (copie figée d'une prépa) + `users/{uid}/prep_index/{id}` (fiche : nom, date, temps, bilan), `users/{uid}/prep_next` (prépa à venir : `meta` + `state` = clés de prépa, modifiable avant son début), `_push_subscribers/{uid}`.
- **Auth** : email / mot de passe. Création de comptes réservée à l'administrateur (ADMIN_UID).
- **Hébergement** : Firebase Hosting → https://prepa-marathon.web.app
- **Sécurité DB** : règles dans `database.rules.json` — chaque user ne lit/écrit que ses propres données, l'admin peut tout lire/écrire.

## Modules frontend (`public-static/src/`)
Chargés dans cet ordre (dépendances respectées) :

| Fichier | Rôle |
|---|---|
| `config.js` | Constantes globales (FUNCTIONS_BASE, typeLabel, typeColor…) |
| `firebase.js` | Init Firebase, auth, dbRef, variables globales partagées |
| `auth.js` | Connexion / déconnexion |
| `onboarding.js` | Écran de bienvenue premier lancement |
| `plan-generate.js` | Génération du plan marathon (semaines/séances) |
| `plan-admin.js` | Interface admin : gestion users, vue Coach sur athlètes |
| `race-map.js` | Carte « Organisation course » (parcours + 3 trajets). Aussi chargé seul par la page publique `/parcours` (`public-static/parcours.html`) — conservé hors bundle via `keepFiles` dans `vite.config.js` |
| `race-nav-data.js` | Données de guidage générées hors ligne (itinéraires sûrs, manœuvres, ponts, voies fermées) — ne pas éditer à la main |
| `race-nav.js` | Guidage GPS intégré (`RaceNav.start(10|20|30)`) : position, manœuvres, voix. Trajets **bloqués** (aucun recalcul dans la zone de course) ; seule exception : hors zone, guidage OSRM libre jusqu'au début des trajets A13 (Flins), puis bascule silencieuse. Chargé aussi par `/parcours` (keepFiles) |
| `secours-data.js`, `secours-map.js`, `secours-nav.js`, `secours-map.css` | Page publique **indépendante** `/secours` (`public-static/secours.html`) : plan de secours famille, GPS 24 route de Portejoie → km 10. Copies autonomes de la carte et du guidage (ne pas les fusionner avec `race-*`) ; hors bundle, non listés dans `vite.config.js` |
| `amis-data.js`, `amis-map.js`, `amis-nav.js`, `amis-map.css` | Page publique **indépendante** `/trajet-amis` (`public-static/trajet-amis.html`) : GPS libre jusqu'à l'A13 à Flins puis itinéraire bloqué jusqu'au 24 route de Portejoie (stationnement route de Tournedos). Copies autonomes (ne pas fusionner) ; hors bundle |
| `suivi-data.js`, `suivi-core.js`, `suivi-view.js`, `suivi-admin.js`, `suivi-replay.js` | Suivi en direct de Guillaume : page publique `/suivi-guillaume` (lecture seule, aussi intégrée en bas de `/parcours` via `suivi-view.js` ; `suivi-replay.js` = rejeu accéléré de la course d'après les temps au km, sur `/suivi-guillaume` seulement) et page `/suivi-admin` (compte admin : démarrer, envoyer la position GPS, arrivée). Données dans `/live` de la RTDB (lecture publique, écriture admin) ; hors bundle. **Course suivie générique** : fiche `/live/race` {id, name, date, start, place, official (m), target (s), route GPX facultatif, points, replay} lue par `suiviOpenRace`/`suiviUseRace` (suivi-core.js) — sans fiche = Marathon Seine-Eure (suivi-data.js). Sans tracé : distance = GPS cumulé, arrivée déclarée à la main. Courses passées : `/live_archive/<id>` (lecture publique), page `/suivi-guillaume?course=<id>` ; `/parcours` reste sur Seine-Eure (`SUIVI_COURSE`) |
| `race-live.js` | Bouton accueil admin « Course en direct » : pilote `/live` depuis l'app (départ, essai, arrivée, annulation, pointages officiels km + temps) ; carte « Course suivie » : prépare le suivi de la course de la prépa en cours (`livePrepareRace` : fiche `/live/race`, archive le suivi précédent dans `/live_archive/<id>`), import GPX, départ/lieu, points de passage ; `liveStoreReplay` crée le rejeu après le temps officiel. Dans le bundle, charge `suivi-data.js`/`suivi-core.js` à la demande |
| `plan-state.js` | État du plan, migration, helpers allure/pace, `save()` |
| `plan-predict.js` | Prédiction marathon, modal prédiction |
| `weather.js` | Météo (WMO), intégration météo dans les séances |
| `home-render.js` | Rendu écran Accueil |
| `plan-render.js` | Rendu écran Plan (semaines/séances) |
| `plan-edit.js` | Édition semaines, utilitaires, modals validation perf |
| `session-edit.js` | Modals édition/ajout/suppression séances classiques |
| `shoes.js` | Gestion chaussures (CRUD, historique km) |
| `stats.js` | Écran Statistiques (graphiques, courbes EF) |
| `coach-context.js` | Construction du contexte envoyé au Coach IA |
| `coach-plan-modif.js` | Coach → proposition de modification de plan |
| `coach-memos.js` | Coach → mémos, notes, mémoire coach |
| `coach-ui.js` | Chat Coach IA, graphiques, briefings |
| `validation-feedback.js` | Validation séance : feedback athlète/coach |
| `validation-import.js` | Validation : import Strava/Garmin, météo |
| `validation-modals.js` | Validation : modals VO2max, FC repos, objectifs |
| `notifs.js` | Notifications push côté client |
| `preps.js` | Compte › « Mes prépas » : enregistrer la prépa en cours (copie figée), liste des prépas, consultation en lecture seule de toute l'app sur une copie (écritures bloquées), suppression ; « Nouvelle prépa » (assistant de création ; l'ancienne prépa n'est retirée qu'à la validation, `state._plan_engine='generated'`). `prepDailyTasks()` (chargement + retour sur l'app) : enregistrement automatique quotidien de la prépa en cours (`_prep_id`), création de la prépa à venir fournie (`PREPS_NEXT`), bascule automatique (`prepActivateNext`) dès le début de la prépa à venir une fois la course validée (au plus tard à sa 1re séance). « Voir et modifier » (`prepNextOpen`) ouvre toute l'app sur `prep_next/state` (écritures réelles) |
| `prep-progress.js` | Mes prépas › « Comparer mes prépas » (`openProgress`) : volume par semaine aligné sur la course, allure EF à FC ≤ 148 bpm au fil du temps, bilan comparé, records (`prepBestTime`). Lit les copies via `_prepGetSnap` |
| `plan-review.js` | Plan › « 🔄 MAJ le plan » (`openPlanReview`) : niveau actuel (équivalent VDOT Daniels, `prFitness`) d'après les records datés (`state.record_5km/10km/semi/marathon` + `state._records`), les courses (`prep_index`, `_race_result`) et les blocs seuil/fractionné validés (`perf.blocsAllure`, FC) ; propositions d'allures (`prPaceProposals` : intensité relative du plan conservée, VDOT implicite du plan `prPlanVdot` calculé sur les allures d'origine `prOrigPaces` (historique) pour ne pas accélérer à chaque mise à jour, allure course ≤ 6 semaines, allures gardées pendant les 3/4 de la récupération post-course (`noFasterUntil`, séances « en attente » avec « Accélérer quand même »), +10 s/km max par mise à jour) ; contrôles (`prChecks`, relatifs au volume habituel de la dernière prépa `prLastPrep`/`prPrepVolume` d'après `prep_index/*/shape`) ; historique des prépas envoyé au Coach (`prHistory`) ; avis du Coach (fonction `planReview` ; fusion avec les propositions calculées `_prMergeCoach` en gardant les choix ; avis mémorisé avec ses changements `_coach_review.changes`, réaffiché tant qu'il n'est pas appliqué `_prRestoreCoach` ; relance avec les mêmes données = `force` ; prépa à venir = `next`, avec l'historique détaillé des modifications appliquées `_plan_reviews[].changes` et les séances réalisées depuis sa dernière relecture ; sans donnée nouvelle — `prDataSig` = séances faites, records, résultat — son dernier avis `_coach_review` est réaffiché au lieu de le rappeler ; retour en arrière signalé et décoché `prRevertOf`) ; écran : verdict (niveau du plan vs le tien), frise « Semaine par semaine » (`prWeeks`) et changements par semaine (allure avant → après) ; application des propositions cochées + historique `_plan_reviews`. « Mes records » (`openRecordsModal`, Compte › Entraînement). Fonctionne aussi sur la prépa à venir ouverte avec « Voir et modifier » |
| `plan-optim.js` | Optimisation de la MAJ du plan (appelé par `prAnalyze`) : copie de la dernière prépa (`prPrefetch` → `_prPrevSnap`), charge réelle 7 j / 28 j (`prLoad`, `prDoneLog`), volume conseillé par semaine (`prVolumePlan` : base habituelle, reprise après marathon/semi, progression ≤ +12 % depuis la dernière semaine de charge (semaine faite ≥ 80 % = le plan sert de référence ; séances des 2 derniers jours non validées comptées comme prévues), tolérance +4 % en construction / ± 15 % ailleurs, jamais de hausse en affûtage ni pendant fatigue / douleur, courses de préparation laissées telles quelles, km proposés sur 4 semaines ; sortie longue pilotée ; consigne « N km EF » ajustée avec les km `prKmDetail`), dérive cardiaque des splits Strava (`prDrift`), séance « Test 5 km » toutes les ~6 semaines sans repère (`prTestProposal`, temps lu par `prTestTime` et compté dans le niveau), WHOOP (`prWhoop` : fatigue → 3 prochains jours allégés), trajectoire vers l'objectif (`prTrajectory` + graphique SVG), bilan des allures proposées (`prCalib` : prudent / confiant), annulation d'une mise à jour (`prUndoReview`), bandeau après validation (`prAfterValidation`), ouverture depuis la notification du dimanche (`prOpenFromNotif`, `?action=review`) |
| `plan-daily.js` | Entraînement au quotidien : blocs fractionné / tempo lus dans les tours Strava (`prBlocsFromLaps`, pré-remplissage `prFillBlocsFromStrava`, appliqué aussi aux séances faites via `prSessions` → `perf._blocsAuto`) ; météo 7 jours Open-Meteo (`prWxLoad`/`prWxAt`, ralentissement `prWxAdj`, ligne « vise … » `prWeatherLine` sous les séances Plan / Accueil, niveau et bilan corrigés de la chaleur via `perf.meteo`) ; effort ressenti 1-10 et douleur à la validation (`prRpeHtml`/`prRpeRead` → `perf.rpe`, `perf.pain`), charge interne (`prInternal`), douleur gênante/forte → 4 jours allégés (`prPainProposals`) ; imprévus (`openImprevu` : indisponible = séances clés déplacées dans la semaine, semaine chargée, malade + reprise ; historique `_plan_reviews` annulable) ; plan de course (`openRacePlan` : objectif / réaliste / mon temps, allures km par km `prRaceSplits`, météo, échauffement, ravitaillement, carte mémo, `state._race_plan`, envoi à `/live/race/plan`) ; forme du jour, série, badges (`prRenderHomeCard` dans `#home-form-card`, `openBadges`, `state._badges`). Une séance faite prend la date réelle `perf.date` ; semaines calées du lundi au dimanche (`prMonday`, `sched_day` = jour de la semaine, 1 = lundi, `prWeekday`) ; séances retirées (`_skip`) exclues des calculs ; allègements WHOOP / douleur jamais cumulés (`prEasedSince`, `kind` dans `_plan_reviews[].changes`) |

**Plan de l'admin** : `usesHardPlan()` (firebase.js) = admin qui suit encore le plan Seine-Eure écrit en dur (config.js : `weeks`, `CW`…). Après « Nouvelle prépa », `state._plan_engine='generated'` : l'admin suit le moteur de plan généré (comme les athlètes) en gardant ses droits (`isAdmin()`). Les tests liés au plan utilisent `usesHardPlan()`, les droits admin `isAdmin()`. Les migrations admin (régénération du plan Seine-Eure) ne tournent que si `usesHardPlan()`. Pour une prépa générée, `syncPlanCompat()` (config.js) remplit `CW`, `weeks` et `weekDates` à partir du programme (extra_w*, meta_w*, plan_start_date) : le Coach IA, les stats et la validation suivent la prépa en cours. Utiliser `prepRace()` (course objectif), `planTotalWeeks()` et `isRecoveryWeek(ws)` au lieu de valeurs Seine-Eure écrites en dur. Km des chaussures : toujours `shoeKmTotal(nom)` (shoes.js) — table Seine-Eure en mode dur, sinon report `shoe_km_*` (figé par `prepApplyNew`) + séances faites de la prépa. Côté serveur : `getCurrentWeek(state)`, `adminCurrentWeek(db)`, `getPrepInfo`/`prepObjectiveText`, `weekTypeFor`, `loadPrepState` (helpers.js). Vision complète pour le Coach : `buildTrainingSituation(db, state, today)` (helpers.js) — prépa en cours (semaine, phase, J-x), dernière course + période post-course (≈ 1 jour par mile : marathon 26 j, semi 13 j, 10 km 6 j), prépa suivante (`prep_next/meta`), courses (`prep_index`), records, charge 7/14 j, séance du jour avec sa consigne ; injectée dans les briefs du matin (`briefAfterFcRepos`, `generateMorningBriefContent`, `morningBrief`, `quickBrief`) et le chat (`coachChat`).

## Modules backend (`functions/`)

| Fichier | Exports principaux |
|---|---|
| `index.js` | Re-exporte tous les modules (9 lignes) |
| `helpers.js` | ADMIN_UID, corsHeaders, verifyAdmin, callAnthropic, sendPush, sendPushToAll, getWeekFromDB… |
| `strava.js` | stravaAuth, stravaCallback, stravaFetch, stravaFetchDetail, stravaGear (chaussures Strava, scope profile:read_all) |
| `garmin.js` | garminFetch, garminProxy, garminSync |
| `calendar.js` | calendar (export ICS) |
| `coach.js` | analyzeSession, coachChat, weeklyBriefing, weeklyReport, quickBrief, morningBrief, addMemo, extractMemos, planReview (relecture du plan par le Coach : JSON validé, séances à venir uniquement) |
| `admin.js` | initAdminPassword, createUser, listUsers, deleteUser, dbAdmin |
| `notifs.js` | Toutes les fonctions `onSchedule` (rappels, briefings automatiques ; `planReviewSunday` dimanche 18h30 : séances validées depuis la dernière relecture du Coach → push `plan-review` → `/?action=review`) |
| `live.js` | owntracksToken (clé + config OwnTracks, admin), owntracks (réception des positions OwnTracks → `/live` ; géométrie d'après la fiche `/live/race`, Seine-Eure `live-course.json` par défaut, mode sans tracé = GPS cumulé) |

## Déploiement
- AUTOMATIQUE : tout commit sur `main` déclenche `.github/workflows/deploy.yml` → `firebase deploy` (functions + hosting + database rules).
- Ne PAS modifier `.github/workflows/deploy.yml` sans raison explicite.
- Avant de livrer une modification du backend : `node --check functions/index.js` (et le module concerné).

## Secrets (déjà configurés, ne jamais les écrire en dur)
- Firebase Functions (via `defineSecret`) : ANTHROPIC_API_KEY, GARMIN_EMAIL, GARMIN_PASSWORD, STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.
- GitHub Actions : GCP_SA_KEY.

## Règles de travail
- Toujours répondre et commenter en français.
- Modifications frontend : ciblées et précises — les fichiers JS sont gros, ne pas réécrire des blocs entiers inutilement.
- Modifications backend : vérifier la syntaxe avant de committer (`node --check`).
- Privilégier des commits petits et clairs, directement sur `main`.
- Ne pas committer `node_modules/` ni aucun fichier de secret.
- Le Coach IA est réservé au compte admin — pas besoin de rate limiting côté users.

## Suivi de déploiement (OBLIGATOIRE après chaque push sur main)
C'est TOUJOURS à Claude de surveiller et rapporter le statut du déploiement. Ne JAMAIS demander à l'utilisateur de vérifier GitHub Actions lui-même. C'est la responsabilité exclusive de Claude.

Après chaque `git push` vers `main`, TOUJOURS :
1. Attendre ~10 secondes, puis appeler `mcp__github__actions_list` (method: `list_workflow_runs`, owner: `guillaumelenoir75-dev`, repo: `Marathon`, per_page: 1) pour récupérer l'ID du run "Deploy to Firebase" (ignorer "pages build and deployment").
2. Appeler `mcp__github__actions_get` (method: `get_workflow_run`) en boucle toutes les 15 secondes jusqu'à `status === "completed"`. Si `updated_at` ne bouge plus après 2 min, le run est probablement terminé (bug de cache API GitHub connu) — lister les runs pour trouver un run complété sur le même SHA.
3. Conclure en français : déploiement **vert ✅** ou **rouge ❌** avec le commit SHA, et indiquer que l'app est testable sur https://prepa-marathon.web.app.
Ne jamais terminer un tour après un push sans avoir attendu et rapporté le statut du déploiement.
Ordre de priorité pour surveiller le déploiement :
1. MCP GitHub (`mcp__github__actions_list` + `mcp__github__actions_get`) — méthode principale.
2. Si MCP indisponible → `curl` Bash sur l'API REST GitHub : `curl -s -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/repos/guillaumelenoir75-dev/Marathon/actions/runs?per_page=1"`.
3. Si l'API REST retourne 403/blocked → vérifier le déploiement via Firebase Hosting : `curl -sI https://prepa-marathon.web.app` et `curl -s https://prepa-marathon.web.app | grep whoop.js` pour confirmer la version.
4. Si tout est bloqué par le proxy réseau de l'environnement → l'indiquer CLAIREMENT en expliquant POURQUOI (blocage proxy/org, pas une erreur de code), confirmer que le push git a réussi, et préciser que le workflow se déclenchera automatiquement. Ne JAMAIS demander à l'utilisateur de vérifier lui-même.
