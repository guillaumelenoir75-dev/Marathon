# Plan Marathon — contexte projet

PWA de préparation marathon, multi-utilisateur. L'admin crée les comptes et a accès au Coach IA. Les athlètes suivent leur plan.

## Stack
- **Frontend** : `public/index.html` — HTML + CSS inline, charge 23 scripts JS via `<script defer>`.  
  Build : Vite (`root: 'public'`, `publicDir: '../public-static'`) → `dist/`. Les fichiers `public-static/src/*.js` sont copiés verbatim (pas de hash), chargés en scripts classiques (pas de modules ES). Toutes les fonctions doivent être en scope global.
- **Backend** : Cloud Functions Firebase v2 (Node 24), modulaires dans `functions/`.
- **Données** : Firebase Realtime Database, projet `prepa-marathon` (europe-west1). Structure : `users/{uid}/state`, `users/{uid}/role`, `_push_subscribers/{uid}`.
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

## Modules backend (`functions/`)

| Fichier | Exports principaux |
|---|---|
| `index.js` | Re-exporte tous les modules (9 lignes) |
| `helpers.js` | ADMIN_UID, corsHeaders, verifyAdmin, callAnthropic, sendPush, sendPushToAll, getWeekFromDB… |
| `strava.js` | stravaAuth, stravaCallback, stravaFetch, stravaFetchDetail |
| `garmin.js` | garminFetch, garminProxy, garminSync |
| `calendar.js` | calendar (export ICS) |
| `coach.js` | analyzeSession, coachChat, weeklyBriefing, weeklyReport, quickBrief, morningBrief, addMemo, extractMemos |
| `admin.js` | initAdminPassword, createUser, listUsers, deleteUser, dbAdmin |
| `notifs.js` | Toutes les fonctions `onSchedule` (rappels, briefings automatiques) |

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
Après chaque `git push` vers `main`, TOUJOURS :
1. Attendre ~10 secondes, puis appeler `mcp__github__actions_list` (method: `list_workflow_runs`, owner: `guillaumelenoir75-dev`, repo: `Marathon`, per_page: 1) pour récupérer l'ID du run "Deploy to Firebase" (ignorer "pages build and deployment").
2. Appeler `mcp__github__actions_get` (method: `get_workflow_run`) en boucle toutes les 15 secondes jusqu'à `status === "completed"`. Si `updated_at` ne bouge plus après 2 min, le run est probablement terminé (bug de cache API GitHub connu) — lister les runs pour trouver un run complété sur le même SHA.
3. Conclure en français : déploiement **vert ✅** ou **rouge ❌** avec le commit SHA, et indiquer que l'app est testable sur https://prepa-marathon.web.app.
Ne jamais terminer un tour après un push sans avoir attendu et rapporté le statut du déploiement.
