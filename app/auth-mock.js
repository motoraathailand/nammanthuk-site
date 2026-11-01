// น้ำมันถูก — FAKE sign-in for tests and local development ONLY (cfg.auth.provider === 'mock'). It never talks to Google.
// Not copied into Android builds by default (prepare-www); the gate cannot be bypassed in a normal build.
(function (root) {
  'use strict';
  if (!root.NMT || !root.NMT.Auth) return;
  var A = root.NMT.Auth;
  A.register('mock', function (cfg, st) {
    var cu = (cfg.auth && cfg.auth.mockUser) || { uid: 'mock-user-1', displayName: 'สมชาย ใจดี', email: 'somchai.test@example.com', photoUrl: '' };
    var get = function (k) { try { return st.getItem('nmt.mock.' + k); } catch (e) { return null; } };
    var set = function (k, v) { try { if (v === null) st.removeItem('nmt.mock.' + k); else st.setItem('nmt.mock.' + k, v); } catch (e) {} };
    var delay = function (v, ms) { return new Promise(function (r) { setTimeout(function () { r(v); }, ms || 120); }); };
    return {
      name: 'mock',
      signIn: function () {
        var act = get('next');                       // tests: 'cancel' | 'network' | 'fail'  (one-shot)
        if (act) { set('next', null); return delay(null).then(function () { throw A.errOf(act === 'cancel' ? 'cancelled' : act === 'network' ? 'network' : 'failed'); }); }
        set('fresh', String(Date.now())); set('session', cu.uid);
        return delay(A.cleanUser({ uid: cu.uid, name: cu.displayName, email: cu.email, photo: cu.photoUrl }));
      },
      current: function () { return Promise.resolve(get('session') ? A.cleanUser({ uid: cu.uid, name: cu.displayName, email: cu.email, photo: cu.photoUrl }) : null); },
      getIdToken: function () { return Promise.resolve(get('session') ? 'mock.' + cu.uid + '.' + (Math.floor(Date.now() / 1000) + 3600) : null); },
      signOut: function () { set('session', null); return delay(true, 30); },
      deleteUser: function () {
        // tests: nmt.mock.reauth = '1' -> Google asks for a fresh sign-in once (signIn() clears it)
        if (get('reauth') === '1' && !get('fresh')) return Promise.reject(A.errOf('requires-recent-login'));
        if (get('reauth') === '1' && Date.now() - Number(get('fresh')) > 600000) return Promise.reject(A.errOf('requires-recent-login'));
        var d = []; try { d = JSON.parse(sessionStorage.getItem('mockDeleted') || '[]'); } catch (e) {} d.push(cu.uid); try { sessionStorage.setItem('mockDeleted', JSON.stringify(d)); } catch (e) {} set('session', null);   // sessionStorage: survives the app wiping its own nmt.* keys
        return delay(true, 60);
      },
    };
  });
})(typeof window !== 'undefined' ? window : globalThis);
