const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();

Object.assign(exports, require('./strava'));
Object.assign(exports, require('./garmin'));
Object.assign(exports, require('./calendar'));
Object.assign(exports, require('./coach'));
Object.assign(exports, require('./admin'));
Object.assign(exports, require('./notifs'));
