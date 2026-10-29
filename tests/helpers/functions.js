// Charge les modules des Cloud Functions avec des doublures (Firebase Admin, secrets, IA, push) pour les tests serveur.
'use strict';
const Module = require('module');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', 'functions');

// fausse Realtime Database en mémoire : ref(path).once/set/update/transaction
function memDb(data) {
  const split = (p) => String(p || '').split('/').filter(Boolean);
  const get = (p) => split(p).reduce((o, k) => (o == null ? null : o[k] === undefined ? null : o[k]), data);
  const setAt = (p, v) => { const ks = split(p); let o = data; ks.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; }); if (v == null) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = v; };
  return { data, ref: (p) => ({
    once: async () => ({ val: () => { const v = get(p); return v == null ? null : JSON.parse(JSON.stringify(v)); } }),
    set: async (v) => setAt(p, v), update: async (o) => Object.keys(o).forEach((k) => setAt(p + '/' + k, o[k])), remove: async () => setAt(p, null),
    transaction: async (fn) => setAt(p, fn(get(p))), child: (c) => memDb(data).ref(p + '/' + c) }) };
}

function loadFunctions(opts) {
  opts = opts || {};
  const db = memDb(opts.data || {});
  const calls = { push: [], ai: [] };
  const mocks = {
    'firebase-functions/v2/https': { onRequest: (o, h) => (typeof o === 'function' ? o : h) },
    'firebase-functions/v2/scheduler': { onSchedule: (o, h) => (typeof o === 'function' ? o : h) },
    'firebase-functions/params': { defineSecret: () => ({ value: () => 'test-secret' }) },
    'firebase-admin': { apps: [1], initializeApp() {}, database: () => db, auth: () => ({ verifyIdToken: async () => ({ uid: 'ADMIN', email: 'admin@test' }) }), messaging: () => ({}) },
    'web-push': { setVapidDetails() {}, sendNotification: async () => {} },
  };
  const load0 = Module._load;
  Module._load = function (req) { return mocks[req] || load0.apply(this, arguments); };
  Object.keys(require.cache).forEach((k) => { if (k.startsWith(ROOT)) delete require.cache[k]; });
  const helpers = require(path.join(ROOT, 'helpers.js'));
  helpers.verifyAdmin = async () => 'ADMIN';
  helpers.sendPush = async (a, b, title, body, tag, url) => { calls.push.push({ title, body, tag, url }); };
  helpers.callAnthropic = async (key, system, msgs, maxTokens, model, o) => {
    calls.ai.push({ system, user: msgs[0].content, maxTokens });
    const r = typeof opts.ai === 'function' ? opts.ai(msgs[0].content) : opts.ai || { text: '{"assessment":"ok","changes":[]}' };
    const res = typeof r === 'string' ? { text: r, stop: 'end_turn' } : r;
    return o && o.full ? res : res.text;
  };
  const mod = {};
  (opts.modules || ['coach.js', 'notifs.js']).forEach((f) => { mod[f.replace('.js', '')] = require(path.join(ROOT, f)); });
  Module._load = load0;
  return { helpers, ...mod, db, calls };
}

// appel d'une fonction HTTP (onRequest) avec un corps JSON
async function callHttp(fn, body) {
  let out = null, status = 200;
  const res = { set() { return res; }, setHeader() {}, header() {}, status(s) { status = s; return res; }, json(j) { out = j; }, send(x) { out = x; } };
  await fn({ method: 'POST', body, headers: { authorization: 'Bearer test' } }, res);
  return { status, out };
}

module.exports = { loadFunctions, callHttp };
