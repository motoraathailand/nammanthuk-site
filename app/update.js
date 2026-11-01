// น้ำมันถูก — update notices (v20, AA common rule "업데이트 안내" 2026-11-01). Pattern copied from AAAi (/workspace/project-reborn/public/update-prompt.js, read-only), adapted to this app's plain-JS UI.
//  1) Launch + resume check: Google Play In-App Update API (@capawesome/capacitor-app-update@7, window.Capacitor.Plugins.AppUpdate, Play installs only) when it answers,
//     otherwise / additionally the server's GET /api/config { latestVersionCode, minVersionCode } compared with this app's versionCode (cfg.appVersionCode, written at build time from build.gradle).
//     The server numbers make it work during closed testing and for side-loaded builds, where Play's API says nothing.
//  2) A newer version -> popup "Update now" (store page: market:// -> https fallback) / "Later" (hides THAT version for 24 h). Below minVersionCode -> forced popup: no "Later", scrim/Esc do nothing.
//  3) "What's new" popup on the first launch after an update: the changelog entry of the current versionCode (5 languages), once per version (nmt.lastSeenVersionCode).
//     A fresh install (not onboarded when the app starts) never sees it. Opening a popup never blocks a tap: the scrim covers the screen only while it is open (exit animation is pointer-events:none).
// cfg.appVersionCode = 0 (plain web / dev) -> everything stays off. Pure decision functions are exported for tests (tests/core.test.mjs).
(function (root) {
  'use strict';
  var SNOOZE_KEY = 'nmt.update.snooze', SEEN_KEY = 'nmt.lastSeenVersionCode', H = 3600 * 1000;
  var nat = function (v) { var n = parseInt(v, 10); return isFinite(n) && n > 0 ? n : 0; };

  // show the new-version popup? current = this app's versionCode; playAvailable = versionCode Play says is available (0 = unknown); serverLatest / serverMin from /api/config; snooze = { code, until }
  function decide(o) {
    var current = nat(o.current), latest = Math.max(nat(o.serverLatest), nat(o.playAvailable)), min = nat(o.serverMin), now = o.now || Date.now();
    if (!current) return { show: false, reason: 'unknown-current', latest: latest, forced: false };
    var forced = min > current;
    if (!forced && latest <= current) return { show: false, reason: 'up-to-date', latest: latest, forced: false };
    var sn = o.snooze;
    if (!forced && sn && nat(sn.code) >= latest && Number(sn.until) > now) return { show: false, reason: 'snoozed', latest: latest, forced: false };
    return { show: true, reason: forced ? 'forced' : 'newer', latest: Math.max(latest, min), forced: forced };
  }
  function readSnooze(st) { try { var v = JSON.parse(st.getItem(SNOOZE_KEY) || 'null'); return v && nat(v.code) ? v : null; } catch (e) { return null; } }
  function writeSnooze(st, code, hours, now) { try { st.setItem(SNOOZE_KEY, JSON.stringify({ code: nat(code), until: (now || Date.now()) + (hours || 24) * H })); } catch (e) { /* storage blocked: the popup just comes back next time */ } }

  // "What's new": show once per versionCode. raw = stored value (null = never stored), onboarded = nmt.onboarded was '1' when the app STARTED.
  //  - never stored + not onboarded = fresh install -> remember silently, show nothing (the user has just been through onboarding / the tutorial)
  //  - never stored + onboarded     = an install from before this feature (v19 or older) that just updated -> show
  //  - stored < current             = updated -> show;  stored >= current -> nothing
  function whatsNewDecision(o) {
    var cur = nat(o.current), has = o.raw !== null && o.raw !== undefined && o.raw !== '', last = nat(o.raw);
    if (!cur) return { show: false, mark: false, reason: 'unknown-current' };
    if (!has) return o.onboarded ? { show: true, mark: true, reason: 'updated-from-old' } : { show: false, mark: true, reason: 'fresh-install' };
    if (last < cur) return { show: true, mark: true, reason: 'updated' };
    return { show: false, mark: false, reason: 'seen' };
  }
  // changelog entries carry the build in their version label: "1.0.0 (20)" -> 20
  function entryCode(e) { var m = /\((\d+)\)\s*$/.exec(String(e && e.version || '')); return m ? nat(m[1]) : 0; }
  function pickEntry(entries, code) { var c = nat(code), r = (entries || []).filter(function (e) { return entryCode(e) === c; }); return r[0] || null; }

  var api = { decide: decide, readSnooze: readSnooze, writeSnooze: writeSnooze, whatsNewDecision: whatsNewDecision, entryCode: entryCode, pickEntry: pickEntry, SNOOZE_KEY: SNOOZE_KEY, SEEN_KEY: SEEN_KEY };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.NMT = root.NMT || {}; root.NMT.Update = api;

  root.NMT.updateInit = function (app) {
    var t = app.t, store = app.store, cfg = app.cfg, env = app.env, D = root.NMT.Data, I = root.NMT.i18n, doc = document;
    var $ = function (id) { return doc.getElementById(id); };
    var ico = function (n) { return '<svg class="ic" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; };
    var RM = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    var u = cfg.update || {}, SNOOZE_H = u.snoozeHours || 24, RECHECK = (u.recheckMinutes || 10) * 60000;
    var cap = root.Capacitor, native = false;
    try { native = !!(cap && cap.isNativePlatform && cap.isNativePlatform()); } catch (e) { native = false; }
    var plugin = function () { return native && cap.Plugins && cap.Plugins.AppUpdate ? cap.Plugins.AppUpdate : null; };
    var lastCheck = 0, busy = false, cur = null, wnEntry = null, openName = null, pushed = false;
    var pkg = cfg.playPackage || cfg.appId;
    var MARKET = 'market://details?id=' + pkg, HTTPS = 'https://play.google.com/store/apps/details?id=' + pkg;

    function tmo(p, ms) { return new Promise(function (res, rej) { var x = setTimeout(function () { rej(new Error('timeout')); }, ms); p.then(function (v) { clearTimeout(x); res(v); }, function (e) { clearTimeout(x); rej(e); }); }); }
    function currentCode() { return nat(cfg.appVersionCode); }
    function versionLabel() { return 'v' + cfg.appVersion + (currentCode() ? ' (' + currentCode() + ')' : ''); }

    // ---------- opening the store ----------
    // Native: the plugin opens market:// itself and falls back to https. Everywhere else: a market:// link first; when the page is still in front a moment later
    // (no Play app handled it, e.g. a desktop browser) the https store page is opened instead.
    function anchorOpen(href, blank) { var a = doc.createElement('a'); a.href = href; a.rel = 'noopener'; if (blank) a.target = '_blank'; a.style.display = 'none'; doc.body.appendChild(a); a.click(); doc.body.removeChild(a); }
    function openStore() {
      var p = plugin();
      if (p && p.openAppStore) { return Promise.resolve().then(function () { return p.openAppStore({ androidPackageName: pkg }); }).then(function () { return 'plugin'; }, function () { return webOpen(); }); }
      return Promise.resolve(webOpen());
    }
    function webOpen() {
      try { anchorOpen(MARKET, false); } catch (e) { try { anchorOpen(HTTPS, true); return 'https'; } catch (e2) { return 'failed'; } }
      setTimeout(function () { if (!doc.hidden) { try { anchorOpen(HTTPS, true); } catch (e) { /* nothing else to try */ } } }, 1500);
      return 'market';
    }

    // ---------- popup plumbing (shared by both popups) ----------
    function freeNow() { return ['view-howto', 'view-gate', 'view-onboarding'].every(function (id) { var e = $(id); return !e || e.hidden; }) && $('lang-sheet').hidden; }
    function whenFree(maxMs) { var t0 = Date.now(); return new Promise(function (res) { (function poll() { if (freeNow() || Date.now() - t0 > maxMs) return res(freeNow()); setTimeout(poll, 800); })(); }); }
    function open(id, name, focusId, modal) {
      var el = $(id); el.classList.remove('closing'); el.hidden = false; openName = name; doc.body.classList.add('noscroll');
      if (!modal) { try { history.pushState({ nmtPopup: 1 }, '', location.href); pushed = true; } catch (e) { pushed = false; } }   // Android back closes a normal popup
      setTimeout(function () { var f = $(focusId); if (f) { try { f.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } }, 60);
    }
    function close(id, fromPop) {
      var el = $(id); if (el.hidden) return; openName = null;
      var done = function () { el.hidden = true; el.classList.remove('closing'); };
      if (RM.matches) done(); else { el.classList.add('closing'); setTimeout(done, 280); }
      if (!app.menuOpen() && !app.langOpen()) doc.body.classList.remove('noscroll');
      if (pushed && !fromPop) { pushed = false; try { history.back(); } catch (e) { /* ignore */ } } else pushed = false;
    }

    // ---------- 1) update popup ----------
    function paintUpdate() {
      if (!cur) return;
      var forced = !!cur.forced; $('update-modal').classList.toggle('forced', forced);
      $('upd-title').textContent = t('upd.title'); $('upd-body').textContent = t(forced ? 'upd.force' : 'upd.body');
      $('upd-go').innerHTML = ico('download') + '<span>' + app.esc(t('upd.go')) + '</span>';
      var lt = $('upd-later'); lt.hidden = forced; lt.innerHTML = ico('clock') + '<span>' + app.esc(t('upd.later')) + '</span>';
      var nw = $('upd-new'); nw.hidden = !currentCode() || !cur.latest; nw.innerHTML = ico('info') + '<span>' + app.esc(versionLabel() + ' → ' + (cur.latest || '')) + '</span>';
    }
    function showUpdate(d) { cur = d; paintUpdate(); open('update-modal', 'update', 'upd-go', d.forced); }
    function later() { if (!cur || cur.forced) return; writeSnooze(store, cur.latest, SNOOZE_H); close('update-modal'); }
    function getServerConfig() {
      var url = env.apiUrl(cfg.apiBase, 'api/config'); if (!url) return Promise.resolve(null);
      return tmo(env.fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } }), cfg.apiTimeoutMs || 6000).then(function (r) { return r && r.ok ? r.json() : null; }).catch(function () { return null; });
    }
    function check(opts) {
      opts = opts || {};
      var cc = currentCode(), p = plugin();
      if (busy || (openName && !opts.force)) return Promise.resolve({ show: false, reason: 'busy' });
      if (!opts.force && Date.now() - lastCheck < RECHECK) return Promise.resolve({ show: false, reason: 'throttled' });
      busy = true; lastCheck = Date.now();
      var playInfo = p && p.getAppUpdateInfo ? tmo(Promise.resolve().then(function () { return p.getAppUpdateInfo(); }), 6000).catch(function () { return null; }) : Promise.resolve(null);   // no Play services / side-loaded -> null -> server numbers decide
      return Promise.all([playInfo, getServerConfig()]).then(function (a) {
        var play = a[0], c = a[1] || {}, current = cc || nat(play && play.currentVersionCode), avail = play && Number(play.updateAvailability) === 2 ? nat(play.availableVersionCode) : 0;
        var d = decide({ current: current, playAvailable: avail, serverLatest: c.latestVersionCode, serverMin: c.minVersionCode, snooze: readSnooze(store) });
        if (!d.show) return d;
        return whenFree(d.forced ? 20000 : 90000).then(function (free) {
          if (!free && !d.forced) return { show: false, reason: 'busy-screen' };
          if (openName && openName !== 'update') return { show: false, reason: 'busy' };
          showUpdate(d); return d;
        });
      }).catch(function () { return { show: false, reason: 'error' }; }).then(function (r) { busy = false; return r; });
    }

    // ---------- 2) what's new ----------
    function paintWhatsNew() {
      if (!wnEntry) return;
      var lang = I.lang(), items = (wnEntry.items && (wnEntry.items[lang] || wnEntry.items.th || wnEntry.items.en)) || [];
      $('wn-title').textContent = t('wn.title'); $('wn-ver').innerHTML = ico('info') + '<span>' + app.esc(t('wn.version', { v: wnEntry.version || versionLabel() })) + '</span>';
      $('wn-list').innerHTML = items.map(function (s) { return '<li><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg><span>' + app.esc(s) + '</span></li>'; }).join('');
      $('wn-ok').innerHTML = ico('check') + '<span>' + app.esc(t('wn.ok')) + '</span>';
    }
    function loadEntries() {   // backend/cache first (D.loadExtras), plus the entries bundled in this app: the bundled file always knows the version that is running
      var bundled = env.fetch('data/changelog.json').then(function (r) { return r.ok ? r.json() : { entries: [] }; }).catch(function () { return { entries: [] }; });
      var remote = D.loadExtras(env).catch(function () { return { entries: [] }; });
      return Promise.all([remote, bundled]).then(function (a) { return (a[0].entries || []).concat(a[1].entries || []); });
    }
    function whatsNew() {
      var cc = currentCode(); if (!cc) return Promise.resolve({ show: false, reason: 'unknown-current' });
      var raw = null; try { raw = store.getItem(SEEN_KEY); } catch (e) { raw = null; }
      var d = whatsNewDecision({ current: cc, raw: raw, onboarded: bootOnboarded });
      if (!d.show) { if (d.mark) try { store.setItem(SEEN_KEY, String(cc)); } catch (e) { /* ignore */ } return Promise.resolve(d); }
      return loadEntries().then(function (list) {
        var e = pickEntry(list, cc);
        if (!e) { try { store.setItem(SEEN_KEY, String(cc)); } catch (x) { /* ignore */ } return { show: false, reason: 'no-entry' }; }
        return whenFree(90000).then(function (free) {
          if (!free) return { show: false, reason: 'busy-screen' };   // not marked: the next launch tries again
          if (openName) return { show: false, reason: 'busy' };
          wnEntry = e; paintWhatsNew(); try { store.setItem(SEEN_KEY, String(cc)); } catch (x) { /* once per version, even if the app is closed with the popup open */ }
          open('whatsnew-modal', 'whatsnew', 'wn-ok', false); return d;
        });
      }).catch(function () { return { show: false, reason: 'error' }; });
    }

    // ---------- wiring ----------
    var bootOnboarded = false; try { bootOnboarded = store.getItem('nmt.onboarded') === '1'; } catch (e) { bootOnboarded = false; }
    $('upd-go').onclick = function () { api.lastOpen = openStore(); };
    $('upd-later').onclick = later;
    $('wn-ok').onclick = function () { close('whatsnew-modal'); };
    Array.prototype.forEach.call(doc.querySelectorAll('#update-modal .pp-scrim'), function (s) { s.onclick = later; });
    Array.prototype.forEach.call(doc.querySelectorAll('#whatsnew-modal .pp-scrim'), function (s) { s.onclick = function () { close('whatsnew-modal'); }; });
    doc.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (openName === 'update' && cur && !cur.forced) { e.stopImmediatePropagation(); later(); } else if (openName === 'whatsnew') { e.stopImmediatePropagation(); close('whatsnew-modal'); }
    }, true);
    // landing on the popup's own history entry (e.g. the language sheet above it just closed) does not close it
    root.addEventListener('popstate', function (ev) { if (pushed && !(ev.state && ev.state.nmtPopup)) { if (openName === 'update') { if (cur && !cur.forced) { writeSnooze(store, cur.latest, SNOOZE_H); } close('update-modal', true); } else if (openName === 'whatsnew') close('whatsnew-modal', true); } });
    doc.addEventListener('visibilitychange', function () { if (!doc.hidden) check(); });   // back from the Play Store or the home screen
    if (currentCode() || plugin()) { setTimeout(function () { whatsNew().then(function () { return check(); }); }, 1200); }   // app start: what's new first (only after an update), then the version check

    return {
      check: check, openStore: openStore, whatsNew: whatsNew, versionLabel: versionLabel, isOpen: function () { return openName; },
      onLang: function () { if (openName === 'update') paintUpdate(); else if (openName === 'whatsnew') paintWhatsNew(); },
      paintFooter: function () { return versionLabel(); },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
