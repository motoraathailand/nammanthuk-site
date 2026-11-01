// น้ำมันถูก — sign-in (Google only, through Firebase Auth). The app cannot be used without it (see the gate in app.js).
// Providers (cfg.auth.provider):
//   'firebase' : the native Capacitor plugin @capacitor-firebase/authentication (Google sign-in with Android Credential Manager -> Firebase Auth).
//                Needs the owner's Firebase project: fill the `firebase` block in app-config.js and put google-services.json into android/app (HANDOVER.md).
//   'mock'     : auth-mock.js — a fake account for tests/dev ONLY. It is not packaged in Android builds unless the owner explicitly builds NMT_AUTH=mock (internal UI review).
// The session (name/email/photo) is cached on the phone, so the app opens offline after the first sign-in. UMD: window.NMT.Auth / require() in Node tests.
(function (root) {
  'use strict';
  var KEY = 'nmt.auth', registry = {};
  function jget(st, k) { try { return JSON.parse(st.getItem(k)); } catch (e) { return null; } }
  function cleanUser(u) {
    if (!u || typeof u.uid !== 'string' || !u.uid) return null;
    return { uid: u.uid, name: String(u.name || u.displayName || '').slice(0, 120), email: String(u.email || '').slice(0, 160), photo: /^(https:|data:image\/)/.test(u.photo || u.photoUrl || '') ? String(u.photo || u.photoUrl) : '' };
  }
  function errOf(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
  function register(name, factory) { registry[name] = factory; }

  // ---- real provider: Firebase Auth through the native Capacitor plugin (the plugin object is injected, so it can be faked in unit tests) ----
  function firebaseProvider(cfg, plugin) {
    var fb = cfg.firebase || {};
    function ready() {
      if (!fb.projectId || !fb.apiKey || !fb.appId) throw errOf('not-configured', 'Firebase is not configured yet');
      if (!plugin) throw errOf('unsupported', 'Google sign-in needs the Android app');
      return plugin;
    }
    function map(r) { var u = r && r.user; return u ? cleanUser({ uid: u.uid, name: u.displayName, email: u.email, photo: u.photoUrl }) : null; }
    function wrap(p) { return Promise.resolve(p).catch(function (e) { var m = String((e && (e.code || e.message)) || ''); throw errOf(/cancel/i.test(m) ? 'cancelled' : /recent|reauth/i.test(m) ? 'requires-recent-login' : /network/i.test(m) ? 'network' : (e && e.code) || 'failed', e && e.message); }); }
    return {
      name: 'firebase',
      signIn: function () { return new Promise(function (res) { res(ready()); }).then(function (p) { return wrap(p.signInWithGoogle({ scopes: ['email', 'profile'] })); }).then(function (r) { var u = map(r); if (!u) throw errOf('failed', 'no user'); return u; }); },
      current: function () { return plugin ? wrap(plugin.getCurrentUser()).then(map, function () { return undefined; }) : Promise.resolve(undefined); },   // null = signed out natively; undefined = unknown
      getIdToken: function (force) { return new Promise(function (res) { res(ready()); }).then(function (p) { return wrap(p.getIdToken({ forceRefresh: !!force })); }).then(function (r) { return (r && r.token) || null; }); },
      signOut: function () { return plugin && fb.projectId ? wrap(plugin.signOut()).catch(function () {}) : Promise.resolve(); },
      deleteUser: function () { return new Promise(function (res) { res(ready()); }).then(function (p) { return wrap(p.deleteUser()); }).then(function () { return true; }); },
    };
  }

  // cfg, store(localStorage-like), plugin (native plugin or undefined)
  function create(o) {
    var cfg = o.cfg, st = o.store, name = (cfg.auth && cfg.auth.provider) || 'firebase', listeners = [];
    var prov = name === 'firebase' ? firebaseProvider(cfg, o.plugin) : (registry[name] ? registry[name](cfg, st) : null);
    var user = cleanUser(jget(st, KEY));
    function save(u) { user = u; try { if (u) st.setItem(KEY, JSON.stringify(u)); else st.removeItem(KEY); } catch (e) {} listeners.forEach(function (f) { try { f(user); } catch (e) {} }); }
    var api = {
      provider: name, available: !!prov,
      user: function () { return user; },
      signedIn: function () { return !!user; },
      onChange: function (f) { listeners.push(f); },
      // -> user. Rejects with an Error whose .code is: cancelled | not-configured | unsupported | network | no-provider | failed
      signIn: function () {
        if (!prov) return Promise.reject(errOf('no-provider', 'auth provider "' + name + '" is not available'));
        return prov.signIn().then(function (u) { save(u); return u; });
      },
      // Re-check with the provider's own (on-device) session. Signed out natively (e.g. the account was removed) -> the cached session goes too.
      verify: function () {
        if (!user || !prov) return Promise.resolve(!!user);
        return prov.current().then(function (u) { if (u === null) { save(null); return false; } return true; }, function () { return true; });
      },
      getToken: function (force) { if (!user || !prov) return Promise.resolve(null); return prov.getIdToken(force).catch(function () { return null; }); },
      signOut: function () { var p = prov ? prov.signOut() : Promise.resolve(); return p.then(function () { save(null); }, function () { save(null); }); },
      // deletes the Firebase Auth user (the app deletes Firestore + worker data BEFORE this). Rejects with .code 'requires-recent-login' when Google wants a fresh sign-in.
      deleteAuthUser: function () { if (!prov) return Promise.reject(errOf('no-provider')); return prov.deleteUser(); },
      forget: function () { save(null); },
    };
    return api;
  }

  var api = { create: create, register: register, firebaseProvider: firebaseProvider, cleanUser: cleanUser, KEY: KEY, errOf: errOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.NMT = root.NMT || {}; root.NMT.Auth = api; }
})(typeof window !== 'undefined' ? window : globalThis);
