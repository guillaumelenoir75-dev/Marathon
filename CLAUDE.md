# Plan Marathon — contexte projet

PWA personnelle de préparation marathon, en cours de passage en multi-utilisateur.

## Stack
- **Frontend** : `public/index.html` — application mono-fichier, tout le HTML/CSS/JS est inline (~12 000 lignes). PWA installable (service worker dans `public/`).
- **Backend** : `functions/index.js` — Cloud Functions Firebase (Node 24). Gère le Coach IA (API Anthropic), l'intégration Strava/Garmin, et les notifications push (VAPID).
- **Données** : Firebase Realtime Database, projet `prepa-marathon` (région europe-west1). Données isolées par utilisateur sous `users/{uid}/state`.
- **Auth** : email / mot de passe. La création de comptes est réservée à l'administrateur (constante ADMIN_UID).
- **Hébergement** : Firebase Hosting → https://prepa-marathon.web.app

## Déploiement
- Le déploiement est AUTOMATIQUE : tout commit sur `main` déclenche le workflow `.github/workflows/deploy.yml` qui lance `firebase deploy` (functions + hosting) via un compte de service Google Cloud.
- Ne PAS modifier `.github/workflows/deploy.yml` sans raison explicite.
- Pour livrer une modification : commiter sur `main`. Le déploiement part seul.

## Secrets (déjà configurés, ne jamais les écrire en dur)
- Côté Firebase Functions : ANTHROPIC_API_KEY, GARMIN_EMAIL, GARMIN_PASSWORD, STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (déclarés via defineSecret).
- Côté GitHub Actions : GCP_SA_KEY (clé du compte de service de déploiement).
- Ne JAMAIS mettre une vraie clé/valeur de secret dans le code ou dans un fichier commité.

## Règles de travail
- Avant de livrer une modification du backend, vérifier la syntaxe : `node --check functions/index.js`.
- Le frontend est un fichier unique très volumineux : faire des modifications ciblées et précises, ne pas réécrire des blocs entiers inutilement.
- Toujours répondre et commenter en français.
- Privilégier des commits petits et clairs, directement sur `main`.
- Ne pas committer le dossier `node_modules/` ni aucun fichier de secret.

## Suivi de déploiement (OBLIGATOIRE après chaque push sur main)
Après chaque `git push` vers `main`, TOUJOURS :
1. Attendre ~10 secondes, puis appeler `mcp__github__actions_list` (method: `list_workflow_runs`, owner: `guillaumelenoir75-dev`, repo: `Marathon`, per_page: 1) pour récupérer l'ID du dernier run.
2. Appeler `mcp__github__actions_get` (method: `get_workflow_run`) en boucle toutes les 15 secondes jusqu'à ce que `status === "completed"`.
3. Conclure en français : déploiement **vert ✅** ou **rouge ❌** avec le commit SHA, et indiquer que l'app est testable sur https://prepa-marathon.web.app.
Ne jamais terminer un tour après un push sans avoir attendu et rapporté le statut du déploiement.
