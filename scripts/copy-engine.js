// Copie le moteur de plan de l'app (public-static/src) dans functions/engine-src avant le déploiement des fonctions
// (predeploy de firebase.json) : le pilote automatique de nuit exécute exactement le même code que l'app.
'use strict';
const fs = require('fs');
const path = require('path');
const { ENGINE_FILES } = require('../functions/engine');
const src = path.join(__dirname, '..', 'public-static', 'src'), dst = path.join(__dirname, '..', 'functions', 'engine-src');
fs.mkdirSync(dst, { recursive: true });
ENGINE_FILES.forEach((f) => fs.copyFileSync(path.join(src, f), path.join(dst, f)));
console.log('[moteur] ' + ENGINE_FILES.length + ' fichiers copiés dans functions/engine-src');
