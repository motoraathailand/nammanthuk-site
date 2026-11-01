// น้ำมันถูก — data layer: bundled sample/seed -> optional backend API -> local cache. Works offline from the last cached data.
// UMD: window.NMT.Data in the browser, require() in Node tests (fetch/storage are injected so it is testable).
(function (root) {
  'use strict';
  var K = { prices: 'nmt.cache.prices', stations: 'nmt.cache.stations', stock: 'nmt.cache.stock', reports: 'nmt.reports', device: 'nmt.deviceId' };

  function jget(storage, key) { try { return JSON.parse(storage.getItem(key)); } catch (e) { return null; } }
  function jset(storage, key, v) { try { storage.setItem(key, JSON.stringify(v)); return true; } catch (e) { return false; } }

  function withTimeout(fetchFn, url, init, ms) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, ms) : null;
    var o = Object.assign({}, init || {}); if (ctl) o.signal = ctl.signal;
    return fetchFn(url, o).then(function (r) { if (t) clearTimeout(t); return r; }, function (e) { if (t) clearTimeout(t); throw e; });
  }

  function getJson(env, path) {
    var url = env.apiUrl(env.cfg.apiBase, path);
    if (!url) return Promise.reject(new Error('no-api'));
    return withTimeout(env.fetch, url, { headers: { Accept: 'application/json' } }, env.cfg.apiTimeoutMs || 6000).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    });
  }

  function loadBundled(env, file) {
    return env.fetch(file).then(function (r) { if (!r.ok) throw new Error('bundled ' + file + ' ' + r.status); return r.json(); });
  }

  // Generic: live (API) -> cache -> bundled.  Returns { data, source: 'live'|'cache'|'sample', fetchedAt, liveFailed }
  // Same basic sanity checks as the server's price guard (nammanthuk-server/src/guard.js): a payload that fails them is ignored and the cached prices are used.
  // Every price must be a number 15-80 THB/litre; a brand with 3+ fuels must not have them all identical (EPPO's table once showed every price as 30.00); at least one brand needs 3+ fuels.
  function pricesLookSane(d) {
    if (!d || !d.brands || typeof d.brands !== 'object') return false;
    var rich = 0;
    for (var b in d.brands) {
      var fuels = d.brands[b]; if (!fuels || typeof fuels !== 'object') return false;
      var vals = [];
      for (var f in fuels) { var p = fuels[f] && fuels[f].price; if (typeof p !== 'number' || !isFinite(p) || p < 15 || p > 80) return false; vals.push(p); }
      if (vals.length >= 3) { rich++; if (vals.every(function (v) { return v === vals[0]; })) return false; }
    }
    return rich > 0;
  }

  function loadWithFallback(env, o) {
    var liveFailed = false;
    return getJson(env, o.path).then(function (d) {
      if (!o.valid(d)) throw new Error('invalid');
      var stamp = Date.now();
      jset(env.storage, o.cacheKey, { data: d, fetchedAt: stamp });
      return { data: d, source: 'live', fetchedAt: stamp, liveFailed: false };
    }).catch(function (e) {
      liveFailed = !!env.cfg.apiBase;
      var c = jget(env.storage, o.cacheKey);
      if (c && c.data && o.valid(c.data)) return { data: c.data, source: 'cache', fetchedAt: c.fetchedAt, liveFailed: liveFailed };
      return loadBundled(env, o.bundled).then(function (d) {
        return { data: d, source: 'sample', fetchedAt: d.fetchedAt ? Date.parse(d.fetchedAt) : null, liveFailed: liveFailed };
      });
    });
  }

  // Every OpenStreetMap fuel station in Thailand ships inside the app (data/stations.osm.json, compact rows, ODbL) so "near me" works anywhere, offline.
  // Row: [ref 'n123'|'w45'|'r6', brandIndex, name, lat, lng, amphoe?].  Never blocks the app: a missing/broken file just means the seed stations only.
  function loadOsmStations(env) {
    var file = env.cfg.osmFile === undefined ? 'data/stations.osm.json' : env.cfg.osmFile;   // '' = off (tests)
    if (!file) return Promise.resolve([]);
    return loadBundled(env, file).then(function (j) {
      var br = j.brands || [], T = { n: 'node', w: 'way', r: 'relation' };
      return (j.s || []).map(function (r) { return { id: 'osm-' + (T[r[0].charAt(0)] || 'node') + '-' + r[0].slice(1), brand: br[r[1]] || 'other', name: r[2], tambon: '', amphoe: r[5] || '', province: '', lat: r[3], lng: r[4], source: 'osm' }; });
    }).catch(function () { return []; });
  }
  // live/seed stations win over an OSM row with the same id; OSM rows within ~60 m of one of them with the same brand were already dropped when the file was built
  function mergeStations(base, osm) {
    var have = {}; base.forEach(function (s) { have[s.id] = 1; });
    return base.concat(osm.filter(function (s) { return !have[s.id]; }));
  }
  // a rebranded brand (brands.json `aliasOf`, e.g. Esso -> Bangchak, announced complete nationwide in Dec 2024) is shown and priced as the brand it became; old OSM rows still say Esso
  function applyAliases(stations, brands) {
    var al = {}; (brands || []).forEach(function (b) { if (b.aliasOf) al[b.id] = b.aliasOf; });
    if (!Object.keys(al).length) return stations;
    return stations.map(function (s) { return al[s.brand] ? Object.assign({}, s, { brand: al[s.brand], formerBrand: s.brand }) : s; });
  }
  function loadAll(env) {
    return Promise.all([
      loadBundled(env, 'data/brands.json'),
      loadWithFallback(env, { path: 'api/stations', cacheKey: K.stations, bundled: 'data/stations.seed.json', valid: function (d) { return d && Array.isArray(d.stations) && d.stations.length > 0; } }),
      loadOsmStations(env),
      loadWithFallback(env, { path: 'api/prices', cacheKey: K.prices, bundled: 'data/prices.sample.json', valid: pricesLookSane }),
      loadWithFallback(env, { path: 'api/stock', cacheKey: K.stock, bundled: 'data/stock.sample.json', valid: function (d) { return d && Array.isArray(d.reports); } }),
    ]).then(function (a) {
      var now = Date.now();
      var stock = a[4];
      // bundled sample stock stores relative times; convert once at load
      var reports = (stock.data.reports || []).map(function (r) {
        var ts = typeof r.ts === 'number' ? r.ts : (typeof r.minutesAgo === 'number' ? now - r.minutesAgo * 60000 : null);
        return { stationId: r.stationId, fuel: r.fuel === 'premium' ? 'premium_gas' : r.fuel, status: r.status, ts: ts };
      }).filter(function (r) { return r.ts != null; });
      return {
        brands: a[0].brands, stations: applyAliases(mergeStations(a[1].data.stations, a[2]), a[0].brands), prices: a[3].data, reports: reports,
        source: { stations: a[1].source, prices: a[3].source, stock: stock.source },
        pricesFetchedAt: a[3].fetchedAt,
        liveFailed: a[1].liveFailed || a[3].liveFailed || stock.liveFailed,
        isSample: a[3].source === 'sample',
      };
    });
  }

  // Notices / update log: backend (api/notices, api/changelog) -> cache -> bundled JSON. Never blocks the main screen.
  function loadExtras(env) {
    return Promise.all([
      loadWithFallback(env, { path: 'api/notices', cacheKey: 'nmt.cache.notices', bundled: 'data/notices.json', valid: function (d) { return d && Array.isArray(d.notices); } }),
      loadWithFallback(env, { path: 'api/changelog', cacheKey: 'nmt.cache.changelog', bundled: 'data/changelog.json', valid: function (d) { return d && Array.isArray(d.entries); } }),
    ]).then(function (a) {
      var byNewest = function (x, y) { return (y.date + '|' + y.id) < (x.date + '|' + x.id) ? -1 : 1; };
      return { notices: a[0].data.notices.slice().sort(byNewest), entries: a[1].data.entries.slice().sort(byNewest), version: a[1].data.version || {} };
    });
  }

  // ---- remote ads switch (release builds only) ---------------------------------------------------------------------------
  // Hosted next to the notices: GET <apiBase>/api/config -> { "ads": { "enabled": true|false } }.  FAIL-CLOSED: ads are on ONLY when a readable response
  // says exactly ads.enabled === true (or a fresh cached copy of such a response exists while offline). Missing apiBase, network error, timeout, http error,
  // invalid JSON, missing field, string "true", false, stale cache -> NO ads. Only a network-level failure (offline/timeout) may fall back to a fresh cached TRUE. Never read in test builds (app.js does not call this unless cfg.adsEnabled).
  var ADS_KEY = 'nmt.cache.adsSwitch';
  function adsSwitchFromCache(storage, nowMs, maxAgeHours) {
    var c = jget(storage, ADS_KEY);
    if (!c || c.enabled !== true || typeof c.fetchedAt !== 'number') return false;
    var age = (nowMs || Date.now()) - c.fetchedAt;
    return age >= 0 && age <= (maxAgeHours || 168) * 3600000;
  }
  function loadAdsSwitch(env) {
    var url = env.apiUrl(env.cfg.apiBase, 'api/config'), maxAge = (env.cfg.ads && env.cfg.ads.switchMaxAgeHours) || 168;
    if (!url) return Promise.resolve({ enabled: false, source: 'none' });   // no backend configured -> there is nothing to read -> off
    var answered = function (on) { jset(env.storage, ADS_KEY, { enabled: on, fetchedAt: Date.now() }); return { enabled: on, source: 'live' }; };
    return withTimeout(env.fetch, url, { headers: { Accept: 'application/json' } }, env.cfg.apiTimeoutMs || 6000).then(function (r) {
      // The server ANSWERED. Whatever it said decides (and replaces the cache): anything but a readable ads.enabled === true is OFF
      // (http error, garbage, missing field, string "true", false).
      if (!r.ok) return answered(false);
      return r.json().then(function (d) { return answered(!!(d && typeof d === 'object' && d.ads && d.ads.enabled === true)); }, function () { return answered(false); });
    }, function () {
      // Could not reach the server at all (offline / DNS / timeout): fall back to the last GOOD live answer if it is fresh; never to a guess.
      return { enabled: adsSwitchFromCache(env.storage, Date.now(), maxAge), source: 'cache' };
    });
  }

  // ---- feedback queue (stored on device; sent to api/feedback when a backend is configured) ----
  var FB = 'nmt.feedback';
  function listFeedback(storage) { var a = jget(storage, FB); return Array.isArray(a) ? a : []; }
  function addFeedback(storage, type, message, diag, nowMs) {
    var list = listFeedback(storage);
    var f = { id: newId(), type: type, message: String(message).slice(0, 2000), ts: nowMs || Date.now(), synced: false };
    if (diag) f.diag = diag;
    list.push(f); jset(storage, FB, list.slice(-50)); return f;
  }
  function flushFeedback(env) {
    var url = env.apiUrl(env.cfg.apiBase, 'api/feedback');
    var todo = listFeedback(env.storage).filter(function (f) { return !f.synced; });
    if (!url || !todo.length) return Promise.resolve({ sent: 0, pending: todo.length });
    var done = 0;
    return todo.reduce(function (p, f) {
      return p.then(function () {
        return withTimeout(env.fetch, url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId(env.storage) }, body: JSON.stringify({ id: f.id, type: f.type, message: f.message, ts: f.ts, diag: f.diag }) }, env.cfg.apiTimeoutMs || 6000)
          .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); done++; var ids = f.id; jset(env.storage, FB, listFeedback(env.storage).map(function (x) { return x.id === ids ? Object.assign({}, x, { synced: true }) : x; })); })
          .catch(function () {});
      });
    }, Promise.resolve()).then(function () { return { sent: done, pending: todo.length - done }; });
  }

  // ---- local report queue (stored on device, flushed to backend when possible) ----
  function newId() {
    var c = (typeof crypto !== 'undefined' && crypto) || null;
    if (c && c.randomUUID) return c.randomUUID();
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function deviceId(storage) {
    var d = null; try { d = storage.getItem(K.device); } catch (e) {}
    if (!d) { d = newId(); try { storage.setItem(K.device, d); } catch (e) {} }
    return d;
  }
  function listReports(storage) { var a = jget(storage, K.reports); return Array.isArray(a) ? a : []; }
  function addReport(storage, stationId, fuel, status, nowMs) {
    var list = listReports(storage);
    var r = { id: newId(), stationId: stationId, fuel: fuel === 'premium' ? 'premium_gas' : fuel, status: status, ts: nowMs || Date.now(), synced: false };
    list.push(r);
    if (list.length > 300) list = list.slice(-300);   // keep the log bounded
    jset(storage, K.reports, list);
    return r;
  }
  function pendingCount(storage) { return listReports(storage).filter(function (r) { return !r.synced; }).length; }

  // POST unsynced reports to the backend (Cloudflare Worker) with the user's Firebase ID token; the Worker verifies it, rate-limits per account and answers per report:
  //   { ok, results:[{ id, ok:true } | { id, ok:false, reason:'invalid' }] }.
  // Answered reports are marked synced (a rejected one is never re-sent); no token / no network / 401 / 5xx keep them queued. Resolves { sent, pending, rejected } (never rejects). There are NO per-station / per-day limits (owner decision 2026-10-30): a repeat report for the same station+fuel replaces the account's earlier one on the server.
  function flushReports(env) {
    var url = env.apiUrl(env.cfg.apiBase, 'api/reports');
    var list = listReports(env.storage);
    var todo = list.filter(function (r) { return !r.synced; });
    if (!url || !todo.length) return Promise.resolve({ sent: 0, pending: todo.length, rejected: 0 });
    var batch = todo.slice(0, 20), left = todo.length - batch.length;
    var body = JSON.stringify({ reports: batch.map(function (r) { return { id: r.id, stationId: r.stationId, fuel: r.fuel === 'premium' ? 'premium_gas' : r.fuel, status: r.status, ts: r.ts }; }) });   // reports queued by an older build say 'premium' = premium_gas
    var tok = env.getToken ? env.getToken(false) : Promise.resolve(null);
    return tok.then(function (token) {
      if (!token) return { sent: 0, pending: todo.length, rejected: 0 };   // signed out / token unavailable (offline, first run): stay queued
      return withTimeout(env.fetch, url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body }, env.cfg.apiTimeoutMs || 6000)
        .then(function (r) {
          if (!r.ok) throw new Error('http ' + r.status);
          return r.json().catch(function () { return {}; });
        }).then(function (j) {
          var res = {}; (Array.isArray(j.results) ? j.results : []).forEach(function (x) { if (x && x.id) res[x.id] = x; });
          var sent = 0, rejected = 0, done = {};
          batch.forEach(function (r) { var x = res[r.id]; if (!x || x.ok) { sent++; done[r.id] = 'ok'; } else { rejected++; done[r.id] = x.reason || 'rejected'; } });
          var cur = listReports(env.storage).map(function (x) { return done[x.id] ? Object.assign({}, x, { synced: true }, done[x.id] === 'ok' ? {} : { rejected: done[x.id] }) : x; });
          jset(env.storage, K.reports, cur);
          return { sent: sent, pending: left, rejected: rejected };
        });
    }).catch(function () { return { sent: 0, pending: todo.length, rejected: 0 }; });
  }

  // DELETE api/account (Worker): removes the account's trust record and unlinks its reports. 404/2xx = done. No backend configured = nothing to delete. Resolves true/false.
  function deleteAccount(env) {
    var url = env.apiUrl(env.cfg.apiBase, 'api/account');
    if (!url) return Promise.resolve(true);
    return (env.getToken ? env.getToken(false) : Promise.resolve(null)).then(function (token) {
      if (!token) return false;
      return withTimeout(env.fetch, url, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } }, env.cfg.apiTimeoutMs || 6000).then(function (r) { return r.ok || r.status === 404; });
    }).catch(function () { return false; });
  }

  var api = { applyAliases: applyAliases, KEYS: K, deleteAccount: deleteAccount, loadAdsSwitch: loadAdsSwitch, adsSwitchFromCache: adsSwitchFromCache, loadAll: loadAll, loadExtras: loadExtras, listFeedback: listFeedback, addFeedback: addFeedback, flushFeedback: flushFeedback, deviceId: deviceId, listReports: listReports, addReport: addReport, pendingCount: pendingCount, flushReports: flushReports };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.NMT = root.NMT || {}; root.NMT.Data = api; }
})(typeof window !== 'undefined' ? window : globalThis);
