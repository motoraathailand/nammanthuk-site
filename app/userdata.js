// น้ำมันถูก — per-user data (favourite stations, chosen fuel, alert settings, fuel log) + its offline-first sync with Firestore (free tier).
// Everything is stored on the phone first (localStorage, keys nmt.u.*). Sync = ONE document per user: users/{uid} (REST API, Firebase ID token as bearer).
// "Local wins until sync": a local change marks the data dirty; the next sync pushes it, remote data only replaces local data that is NOT dirty.
// UMD: window.NMT.User in the browser, require() in Node tests (fetch/storage are injected).
(function (root) {
  'use strict';
  var K = { favs: 'nmt.u.favs', log: 'nmt.u.log', alerts: 'nmt.u.alerts', meta: 'nmt.u.meta', notes: 'nmt.u.notes', snap: 'nmt.u.snap' };
  var FIELDS = ['fuel', 'favorites', 'alerts', 'fuelLog', 'deleted', 'updatedAt'];   // the whole Firestore document (see firebase/firestore.rules)
  var LIMITS = { favs: 50, log: 800, deleted: 200, notes: 50, liters: 200, amount: 20000 };

  function nf(f) { return f === 'premium' ? 'premium_gas' : f; }   // 'premium' (before 2026-11-01) = premium_gas
  function jget(st, k) { try { return JSON.parse(st.getItem(k)); } catch (e) { return null; } }
  function jset(st, k, v) { try { st.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function newId() {
    var c = (typeof crypto !== 'undefined' && crypto) || null;
    if (c && c.randomUUID) return c.randomUUID();
    return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  // ---- meta (dirty flag, tombstones of deleted log entries, last sync) ----
  function getMeta(st) { var m = jget(st, K.meta); return m && typeof m === 'object' ? { dirty: !!m.dirty, deleted: Array.isArray(m.deleted) ? m.deleted : [], syncedAt: m.syncedAt || null, uid: m.uid || null, updatedAt: m.updatedAt || 0 } : { dirty: false, deleted: [], syncedAt: null, uid: null, updatedAt: 0 }; }
  function setMeta(st, m) { jset(st, K.meta, m); }
  function markDirty(st, nowMs) { var m = getMeta(st); m.dirty = true; m.updatedAt = nowMs || Date.now(); setMeta(st, m); }

  // ---- favourites ----
  function listFavs(st) { var a = jget(st, K.favs); return Array.isArray(a) ? a.filter(function (x) { return typeof x === 'string'; }) : []; }
  function isFav(st, id) { return listFavs(st).indexOf(id) >= 0; }
  function toggleFav(st, id, nowMs) {
    var l = listFavs(st), i = l.indexOf(id);
    if (i >= 0) l.splice(i, 1); else l.unshift(id);
    jset(st, K.favs, l.slice(0, LIMITS.favs)); markDirty(st, nowMs); return i < 0;
  }

  // ---- alert settings ----
  function defaultAlerts() { return { on: true, price: true, stock: true }; }
  function getAlerts(st) { var a = jget(st, K.alerts), d = defaultAlerts(); if (!a || typeof a !== 'object') return d; return { on: a.on !== false, price: a.price !== false, stock: a.stock !== false }; }
  function setAlerts(st, patch, nowMs) { var a = Object.assign(getAlerts(st), patch || {}); jset(st, K.alerts, { on: !!a.on, price: !!a.price, stock: !!a.stock }); markDirty(st, nowMs); return getAlerts(st); }

  // ---- fuel log ----
  function listLog(st) { var a = jget(st, K.log); return Array.isArray(a) ? a.filter(function (e) { return e && e.id && /^\d{4}-\d{2}-\d{2}$/.test(e.date); }) : []; }
  function sortLog(l) { return l.slice().sort(function (a, b) { return a.date === b.date ? (b.ts || 0) - (a.ts || 0) : (a.date < b.date ? 1 : -1); }); }
  function num(v) { var n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.').trim()); return isFinite(n) ? n : NaN; }
  function round2(n) { return Math.round(n * 100) / 100; }
  // -> { ok:true, entry } | { ok:false, error:'date'|'liters'|'amount' }   (today = 'YYYY-MM-DD' of the phone's clock)
  function validateEntry(e, today) {
    if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(e.date || '') || isNaN(Date.parse(e.date + 'T00:00:00Z')) || e.date > today || e.date < '2000-01-01') return { ok: false, error: 'date' };
    var l = num(e.liters), a = num(e.amount);
    if (!(l >= 0.1 && l <= LIMITS.liters)) return { ok: false, error: 'liters' };
    if (!(a >= 1 && a <= LIMITS.amount)) return { ok: false, error: 'amount' };
    return { ok: true, entry: { date: e.date, liters: round2(l), amount: round2(a), stationId: e.stationId ? String(e.stationId).slice(0, 80) : '', stationName: e.stationName ? String(e.stationName).slice(0, 80) : '', fuel: e.fuel ? nf(String(e.fuel).slice(0, 20)) : '' } };
  }
  function addLog(st, e, today, nowMs) {
    var v = validateEntry(e, today); if (!v.ok) return v;
    var entry = Object.assign({ id: newId(), ts: nowMs || Date.now() }, v.entry), l = listLog(st); l.push(entry);
    jset(st, K.log, sortLog(l).slice(0, LIMITS.log)); markDirty(st, nowMs); return { ok: true, entry: entry };
  }
  function removeLog(st, id, nowMs) {
    var l = listLog(st), n = l.filter(function (e) { return e.id !== id; });
    if (n.length === l.length) return false;
    jset(st, K.log, n); var m = getMeta(st); m.deleted = m.deleted.concat([id]).slice(-LIMITS.deleted); setMeta(st, m); markDirty(st, nowMs); return true;
  }
  function monthOf(date) { return date.slice(0, 7); }
  function monthTotals(list, ym) {
    var r = { liters: 0, amount: 0, count: 0, avg: null };
    list.forEach(function (e) { if (monthOf(e.date) === ym) { r.liters += e.liters; r.amount += e.amount; r.count++; } });
    r.liters = round2(r.liters); r.amount = round2(r.amount); r.avg = r.liters > 0 ? round2(r.amount / r.liters) : null; return r;
  }
  function shiftMonth(ym, d) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + d; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + (m < 9 ? '0' : '') + (m + 1); }

  // ---- in-app alert notes (device-local; derived from favourites + price/stock data) ----
  function listNotes(st) { var a = jget(st, K.notes); return Array.isArray(a) ? a : []; }
  function unreadCount(st) { return listNotes(st).filter(function (n) { return !n.read; }).length; }
  function markNotesRead(st) { var l = listNotes(st), ch = false; l.forEach(function (n) { if (!n.read) { n.read = true; ch = true; } }); if (ch) jset(st, K.notes, l); }
  function clearNotes(st) { jset(st, K.notes, []); }
  // Compare the data now with the last snapshot, for the FAVOURITE stations and MY fuel only.
  //   price drop   = the brand's price for my fuel is lower than at the last look
  //   back in stock = the station's last known status for my fuel was "out" and a fresh report now says "ok"
  // o: { st, stations, prices, favs, fuel, prefs, stockFn(id,fuel)->{status}, now, today }  ->  new notes (also stored); the snapshot is always updated.
  function detectAlerts(o) {
    var snap = jget(o.st, K.snap), fresh = !snap || snap.fuel !== o.fuel; snap = fresh ? { fuel: o.fuel, p: {}, s: {} } : snap;
    var out = [], byId = {}; (o.stations || []).forEach(function (s) { byId[s.id] = s; });
    var existing = listNotes(o.st), ids = {}; existing.forEach(function (n) { ids[n.id] = 1; });
    (o.favs || []).forEach(function (id) {
      var s = byId[id]; if (!s) return;
      var b = o.prices && o.prices.brands && o.prices.brands[s.brand], e = b && b[o.fuel], pk = s.brand + '|' + o.fuel, sk = id + '|' + o.fuel;
      if (e && typeof e.price === 'number') {
        var prev = snap.p[pk];
        if (!fresh && typeof prev === 'number' && e.price < prev - 0.004 && o.prefs.on && o.prefs.price) out.push({ type: 'price', stationId: id, fuel: o.fuel, from: prev, to: e.price });
        snap.p[pk] = e.price;
      }
      var si = o.stockFn ? o.stockFn(id, o.fuel) : null;
      if (si && si.status !== 'unknown') {
        if (!fresh && snap.s[sk] === 'out' && si.status === 'ok' && o.prefs.on && o.prefs.stock) out.push({ type: 'stock', stationId: id, fuel: o.fuel, from: 'out', to: 'ok' });
        snap.s[sk] = si.status;
      }
    });
    jset(o.st, K.snap, snap);
    var made = [];
    out.forEach(function (n) {
      n.id = n.type + '|' + n.stationId + '|' + n.fuel + '|' + n.to + '|' + (o.today || ''); n.ts = o.now || Date.now(); n.read = false;
      if (!ids[n.id]) { ids[n.id] = 1; made.push(n); }
    });
    if (made.length) jset(o.st, K.notes, made.concat(existing).slice(0, LIMITS.notes));
    return made;
  }

  // ---- wipe everything that belongs to the signed-in user (sign-out / account deletion) ----
  function wipeUserData(st) { Object.keys(K).forEach(function (k) { try { st.removeItem(K[k]); } catch (e) {} }); }

  // ---- Firestore REST value codec (so the document has real typed fields: strings, arrays, maps) ----
  function encodeValue(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === 'string') return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(encodeValue) } : {} };
    var f = {}; Object.keys(v).forEach(function (k) { f[k] = encodeValue(v[k]); }); return { mapValue: { fields: f } };
  }
  function decodeValue(x) {
    if (!x || typeof x !== 'object') return null;
    if ('stringValue' in x) return x.stringValue; if ('integerValue' in x) return Number(x.integerValue); if ('doubleValue' in x) return x.doubleValue;
    if ('booleanValue' in x) return x.booleanValue; if ('nullValue' in x) return null;
    if ('arrayValue' in x) return ((x.arrayValue && x.arrayValue.values) || []).map(decodeValue);
    if ('mapValue' in x) { var o = {}, f = (x.mapValue && x.mapValue.fields) || {}; Object.keys(f).forEach(function (k) { o[k] = decodeValue(f[k]); }); return o; }
    return null;
  }
  function toFields(doc) { var f = {}; FIELDS.forEach(function (k) { if (doc[k] !== undefined) f[k] = encodeValue(doc[k]); }); return f; }
  function fromFields(fields) { var d = {}; Object.keys(fields || {}).forEach(function (k) { if (FIELDS.indexOf(k) >= 0) d[k] = decodeValue(fields[k]); }); return d; }

  // ---- local document <-> merge ----
  function localDoc(st, fuel) {
    var m = getMeta(st);
    return { fuel: nf(fuel || ''), favorites: listFavs(st), alerts: getAlerts(st), fuelLog: listLog(st), deleted: m.deleted, updatedAt: m.updatedAt || 0 };
  }
  function unionLog(a, b, deleted) {
    var dead = {}; deleted.forEach(function (i) { dead[i] = 1; });
    var map = {}; (b || []).concat(a || []).forEach(function (e) { if (e && e.id && !dead[e.id]) map[e.id] = e; });   // a (local) listed last = wins
    return sortLog(Object.keys(map).map(function (k) { var e = map[k]; return e.fuel === 'premium' ? Object.assign({}, e, { fuel: 'premium_gas' }) : e; })).slice(0, LIMITS.log);
  }
  // local: localDoc + dirty flag; remote: decoded doc or null  ->  { doc (what both sides should now hold), push:bool }
  function mergeDocs(local, dirty, remote) {
    if (!remote) return { doc: local, push: true };
    var remoteRaw = remote; remote = Object.assign({}, remote, { fuel: nf(remote.fuel || '') }); local = Object.assign({}, local, { fuel: nf(local.fuel || '') });   // old saved fuel 'premium' -> premium_gas (written back to Firestore by the push below)
    var deleted = (local.deleted || []).concat(remote.deleted || []).filter(function (x, i, a) { return a.indexOf(x) === i; }).slice(-LIMITS.deleted);
    var pickLocal = dirty;
    var doc = {
      fuel: pickLocal ? (local.fuel || remote.fuel || '') : (remote.fuel || local.fuel || ''),
      favorites: (pickLocal ? local.favorites : (remote.favorites || local.favorites || [])).slice(0, LIMITS.favs),
      alerts: pickLocal ? local.alerts : Object.assign(defaultAlerts(), remote.alerts || {}),
      fuelLog: unionLog(local.fuelLog, remote.fuelLog, deleted), deleted: deleted,
      updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0),
    };
    var same = JSON.stringify(doc) === JSON.stringify({ fuel: remoteRaw.fuel || '', favorites: remote.favorites || [], alerts: Object.assign(defaultAlerts(), remote.alerts || {}), fuelLog: sortLog(remote.fuelLog || []), deleted: remote.deleted || [], updatedAt: remote.updatedAt || 0 });
    return { doc: doc, push: dirty || !same };
  }
  function applyDoc(st, doc) {
    jset(st, K.favs, doc.favorites || []); jset(st, K.log, doc.fuelLog || []); jset(st, K.alerts, Object.assign(defaultAlerts(), doc.alerts || {}));
    var m = getMeta(st); m.deleted = doc.deleted || []; m.updatedAt = doc.updatedAt || 0; setMeta(st, m);
  }

  function docUrl(cfg, uid, mask) {
    var fb = cfg.firebase || {}; if (!fb.projectId || !uid) return null;
    var base = (fb.firestoreBase || 'https://firestore.googleapis.com/v1').replace(/\/+$/, '');
    return base + '/projects/' + encodeURIComponent(fb.projectId) + '/databases/(default)/documents/users/' + encodeURIComponent(uid) + (mask ? '?' + FIELDS.map(function (f) { return 'updateMask.fieldPaths=' + f; }).join('&') : '');
  }
  function request(env, url, init) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, ms = env.cfg.apiTimeoutMs || 6000;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, ms) : null; var o = Object.assign({}, init); if (ctl) o.signal = ctl.signal;
    return env.fetch(url, o).then(function (r) { if (t) clearTimeout(t); return r; }, function (e) { if (t) clearTimeout(t); throw e; });
  }
  // One sync round: GET the doc, merge (local wins while dirty), PATCH if needed. Resolves { ok, pulled, pushed, fuel, doc } — never rejects.
  // getFuel() -> the phone's chosen fuel; setFuel(f) is called when the remote fuel replaces a non-dirty local one.
  function sync(env, user, getToken, getFuel, setFuel) {
    var url = docUrl(env.cfg, user && user.uid);
    if (!url) return Promise.resolve({ ok: false, reason: 'no-config' });
    return getToken(false).then(function (token) {
      if (!token) return { ok: false, reason: 'no-token' };
      var H = { Authorization: 'Bearer ' + token, Accept: 'application/json' };
      return request(env, url, { headers: H }).then(function (r) {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json().then(function (j) { return fromFields(j.fields); });
      }).then(function (remote) {
        var st = env.storage, meta = getMeta(st), local = localDoc(st, getFuel()), res = mergeDocs(local, meta.dirty, remote);
        applyDoc(st, res.doc); if (res.doc.fuel && res.doc.fuel !== getFuel()) setFuel(res.doc.fuel);
        var pulled = !!remote;
        if (!res.push) { var m0 = getMeta(st); m0.dirty = m0.updatedAt !== meta.updatedAt && m0.dirty;   // a change made while this round trip was in flight stays dirty
           m0.syncedAt = Date.now(); m0.uid = user.uid; setMeta(st, m0); return { ok: true, pulled: pulled, pushed: false, fuel: res.doc.fuel }; }
        var body = JSON.stringify({ fields: toFields(Object.assign({}, res.doc, { updatedAt: Math.max(res.doc.updatedAt || 0, meta.updatedAt || 0) || Date.now() })) });
        return request(env, docUrl(env.cfg, user.uid, true), { method: 'PATCH', headers: Object.assign({ 'Content-Type': 'application/json' }, H), body: body }).then(function (r) {
          if (!r.ok) throw new Error('http ' + r.status);
          var m = getMeta(st); m.dirty = m.updatedAt !== meta.updatedAt && m.dirty;   // same: only what was pushed counts as clean
          m.syncedAt = Date.now(); m.uid = user.uid; setMeta(st, m);
          return { ok: true, pulled: pulled, pushed: true, fuel: res.doc.fuel };
        });
      });
    }).catch(function (e) { return { ok: false, reason: 'network', error: e && e.message }; });
  }
  // Delete the user's Firestore document (404 = already gone = fine). Resolves true/false.
  function deleteRemote(env, user, getToken) {
    var url = docUrl(env.cfg, user.uid);
    if (!url) return Promise.resolve(true);   // no Firebase configured -> nothing stored remotely
    return getToken(false).then(function (token) {
      if (!token) return false;
      return request(env, url, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } }).then(function (r) { return r.ok || r.status === 404; });
    }).catch(function () { return false; });
  }

  var api = {
    KEYS: K, FIELDS: FIELDS, LIMITS: LIMITS, getMeta: getMeta, setMeta: setMeta, markDirty: markDirty,
    listFavs: listFavs, isFav: isFav, toggleFav: toggleFav, defaultAlerts: defaultAlerts, getAlerts: getAlerts, setAlerts: setAlerts,
    listLog: listLog, validateEntry: validateEntry, addLog: addLog, removeLog: removeLog, monthTotals: monthTotals, monthOf: monthOf, shiftMonth: shiftMonth, sortLog: sortLog,
    listNotes: listNotes, unreadCount: unreadCount, markNotesRead: markNotesRead, clearNotes: clearNotes, detectAlerts: detectAlerts, wipeUserData: wipeUserData,
    encodeValue: encodeValue, decodeValue: decodeValue, toFields: toFields, fromFields: fromFields, localDoc: localDoc, mergeDocs: mergeDocs, applyDoc: applyDoc, docUrl: docUrl,
    sync: sync, deleteRemote: deleteRemote,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.NMT = root.NMT || {}; root.NMT.User = api; }
})(typeof window !== 'undefined' ? window : globalThis);
