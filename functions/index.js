const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();

Object.assign(exports, require('./strava'));
Object.assign(exports, require('./calendar'));
Object.assign(exports, require('./coach'));
Object.assign(exports, require('./admin'));
Object.assign(exports, require('./notifs'));
Object.assign(exports, require('./whoop'));
Object.assign(exports, require('./live'));
Object.assign(exports, require('./autopilot'));
Object.assign(exports, require('./autovalidate'));
Object.assign(exports, require('./proactive'));
Object.assign(exports, require('./health'));
