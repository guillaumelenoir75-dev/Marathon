// Fausse Firebase (app + auth + Realtime Database) pour les tests de bout en bout : données en mémoire dans window.__DB
(function () {
  const DB = window.__DB || (window.__DB = {});
  const listeners = [];
  const split = (p) => String(p || '').split('/').filter(Boolean);
  const clone = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));
  function get(p) { let o = DB; for (const k of split(p)) { if (o == null || typeof o !== 'object') return null; o = o[k]; } return o === undefined ? null : o; }
  function setAt(p, v) {
    const ks = split(p);
    if (!ks.length) { Object.keys(DB).forEach((k) => delete DB[k]); Object.assign(DB, clone(v) || {}); return; }
    let o = DB; for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null || typeof o[ks[i]] !== 'object') o[ks[i]] = {}; o = o[ks[i]]; }
    if (v == null) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = clone(v);
  }
  function snap(p) { const v = clone(get(p)), ks = split(p); return { val: () => v, exists: () => v != null, key: ks[ks.length - 1] || null, forEach(fn) { if (v && typeof v === 'object') Object.keys(v).forEach((k) => fn(snap(p + '/' + k))); }, child: (c) => snap(p + '/' + c) }; }
  function notify(p) { listeners.slice().forEach((l) => { if (l.path === p || p.startsWith(l.path + '/') || l.path.startsWith(p + '/')) { try { l.cb(snap(l.path)); } catch (e) {} } }); }
  let pushN = 0;
  // réseau simulé : window.__HOLD = écritures en attente (envoyées par window.__flush()), window.__NO_NET = lectures sans réponse
  const held = [];
  const write = (fn) => { if (!window.__HOLD) { fn(); return Promise.resolve(); } return new Promise((res) => held.push(() => { fn(); res(); })); };
  window.__flush = () => { window.__HOLD = false; held.splice(0).forEach((f) => f()); };
  function ref(path) {
    const p = split(path).join('/');
    const r = {
      key: split(p).pop() || null,
      toString: () => 'mock://db/' + p,
      child: (c) => ref(p + '/' + c),
      once: (ev, cb) => { if (window.__NO_NET) return new Promise(() => {}); const s = snap(p); if (typeof cb === 'function') cb(s); return Promise.resolve(s); },
      on: (ev, cb) => { listeners.push({ path: p, cb }); setTimeout(() => cb(snap(p)), 0); return cb; },
      off: (ev, cb) => { for (let i = listeners.length - 1; i >= 0; i--) if (listeners[i].path === p && (!cb || listeners[i].cb === cb)) listeners.splice(i, 1); },
      set: (v) => write(() => { setAt(p, v); notify(p); }),
      update: (o) => write(() => { Object.keys(o || {}).forEach((k) => setAt(p + '/' + k, o[k])); notify(p); }),
      remove: () => { setAt(p, null); notify(p); return Promise.resolve(); },
      push: (v) => { const c = ref(p + '/k' + String(++pushN).padStart(6, '0')); if (v !== undefined) c.set(v); return c; },
      transaction: (fn) => { const nv = fn(clone(get(p))); if (nv !== undefined) setAt(p, nv); notify(p); return Promise.resolve({ committed: true, snapshot: snap(p) }); },
      onDisconnect: () => ({ set: () => Promise.resolve(), remove: () => Promise.resolve(), update: () => Promise.resolve() }),
    };
    ['orderByChild', 'orderByKey', 'orderByValue', 'limitToLast', 'limitToFirst', 'equalTo', 'startAt', 'endAt'].forEach((m) => { r[m] = () => r; });
    return r;
  }
  const user = { uid: window.__UID || 'ADMINUID', email: window.__EMAIL || 'guillaumelenoir75@gmail.com', getIdToken: () => Promise.resolve('test-token') };
  const authObj = { currentUser: user, onAuthStateChanged(cb) { setTimeout(() => cb(user), 0); return () => {}; }, signOut: () => Promise.resolve(), signInWithEmailAndPassword: () => Promise.resolve({ user }), setPersistence: () => Promise.resolve() };
  const auth = () => authObj; auth.EmailAuthProvider = { credential: () => ({}) }; auth.Auth = { Persistence: { LOCAL: 'local', SESSION: 'session' } };
  const database = () => ({ ref }); database.ServerValue = { TIMESTAMP: 0 };
  window.firebase = { initializeApp: () => ({}), apps: [1], auth, database, messaging: () => ({ getToken: () => Promise.resolve(null), onMessage() {} }) };
})();
