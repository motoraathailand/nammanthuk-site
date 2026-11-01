// น้ำมันถูก — device location. The position never leaves the phone (it is only used to sort/show stations on screen).
// Native (Android app): @capacitor/geolocation with an explicit runtime permission request. Plain browser: navigator.geolocation.
// Every failure is classified so the UI can say what is wrong and offer a retry:  denied | off | timeout | unavailable | unsupported.
// UMD: window.NMT.Locate / require() in Node tests (both the plugin and navigator.geolocation are injected, so tests fake them).
(function (root) {
  'use strict';
  function errOf(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
  function classify(e) {
    var m = String((e && (e.message || e.code)) || e || ''), c = e && e.code;
    if (c === 'denied' || c === 'off' || c === 'timeout' || c === 'unavailable' || c === 'unsupported') return c;
    if (c === 1 || /denied|not.?allowed|permission/i.test(m) && !/not enabled|disabled|services/i.test(m)) return 'denied';
    if (/location services|not enabled|disabled|gps|settings|turned off|provider/i.test(m)) return 'off';
    if (c === 3 || /time.?out|timed out/i.test(m)) return 'timeout';
    if (c === 2 || /unavailable|unable|position/i.test(m)) return 'unavailable';
    return 'unavailable';
  }
  function ok(p) { var c = p && p.coords; if (!c || typeof c.latitude !== 'number' || typeof c.longitude !== 'number' || isNaN(c.latitude) || isNaN(c.longitude)) throw errOf('unavailable', 'no coordinates'); return { lat: c.latitude, lng: c.longitude, accuracy: c.accuracy }; }

  // opts: { plugin (Capacitor Geolocation or null), geo (navigator.geolocation or null), perms (navigator.permissions or null), timeoutMs }
  function create(o) {
    o = o || {}; var plugin = o.plugin || null, geo = o.geo || null, perms = o.perms || null, TMO = o.timeoutMs || 15000;
    function wrapErr(e) { var c = classify(e); return errOf(c, String((e && e.message) || c)); }

    // 'granted' | 'prompt' | 'denied' | 'unsupported'  (never throws)
    function status() {
      if (plugin && plugin.checkPermissions) {
        return Promise.resolve(plugin.checkPermissions()).then(function (r) {
          var v = (r && (r.location || r.coarseLocation)) || 'prompt';
          if (r && (r.location === 'granted' || r.coarseLocation === 'granted')) return 'granted';
          return v === 'denied' ? 'denied' : 'prompt';
        }, function () { return 'prompt'; });
      }
      if (!geo) return Promise.resolve('unsupported');
      if (perms && perms.query) return Promise.resolve(perms.query({ name: 'geolocation' })).then(function (r) { return r.state === 'granted' ? 'granted' : r.state === 'denied' ? 'denied' : 'prompt'; }, function () { return 'prompt'; });
      return Promise.resolve('prompt');
    }

    function nativeOnce(high) { return Promise.resolve(plugin.getCurrentPosition({ enableHighAccuracy: high, timeout: TMO, maximumAge: 60000 })).then(ok); }
    function webOnce(high) {
      return new Promise(function (res, rej) {
        var done = false, tm = setTimeout(function () { if (!done) { done = true; rej(errOf('timeout', 'timeout')); } }, TMO + 3000);
        geo.getCurrentPosition(function (p) { if (done) return; done = true; clearTimeout(tm); try { res(ok(p)); } catch (e) { rej(e); } },
          function (e) { if (done) return; done = true; clearTimeout(tm); rej(wrapErr(e)); }, { enableHighAccuracy: high, timeout: TMO, maximumAge: 60000 });
      });
    }
    function once(high) { return plugin ? nativeOnce(high) : webOnce(high); }

    // Ask the OS for permission (only call this after the user pressed the "allow" button) and resolve with the same states as status().
    function request() {
      if (plugin && plugin.requestPermissions) {
        return Promise.resolve(plugin.requestPermissions({ permissions: ['location'] })).then(function (r) { return (r && (r.location === 'granted' || r.coarseLocation === 'granted')) ? 'granted' : 'denied'; }, function () { return 'denied'; });
      }
      return status();   // browser: the prompt is shown by getCurrentPosition itself
    }

    // Resolve { lat, lng, accuracy }.  Rejects with an Error whose .code is one of denied|off|timeout|unavailable|unsupported.
    // Network/coarse fix first (fast, indoors), then one GPS-grade retry when that times out or is unavailable.
    function locate() {
      if (!plugin && !geo) return Promise.reject(errOf('unsupported', 'no geolocation'));
      return once(false).catch(function (e) {
        var c = classify(e);
        if (c === 'denied' || c === 'off') throw errOf(c, e.message);
        return once(true).catch(function (e2) { throw wrapErr(e2); });
      });
    }
    return { status: status, request: request, locate: locate, native: !!plugin };
  }
  var api = { create: create, classify: classify };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NMT = Object.assign(root.NMT || {}, { Locate: api });
})(typeof window !== 'undefined' ? window : globalThis);
