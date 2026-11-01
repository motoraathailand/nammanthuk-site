// น้ำมันถูก — account screens: sign-in gate, "My account" (sign out / delete account), fuel log, favourites + alerts, and the sync glue.
// Plain JS like the rest of the app. app.js hands in what it owns (see `app`); this file never touches routing except through app.go/replace/back.
(function (root) {
  'use strict';
  root.NMT = root.NMT || {};
  root.NMT.acctInit = function (app) {
    var N = root.NMT, t = app.t, esc = app.esc, store = app.store, cfg = app.cfg, env = app.env, U = N.User, D = N.Data, I = N.i18n, auth = app.auth, ico = app.ico, sIco = app.sIco;
    var $ = function (id) { return document.getElementById(id); };
    var GLOGO = '<svg class="glogo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
    var gate = { busy: false, err: null, msg: null };
    var syncState = { running: false, again: false, timer: null, last: null };
    var firebaseOn = function () { return !!(cfg.firebase && cfg.firebase.projectId); };
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var todayStr = function () { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
    var fmtNum = function (n, d) { return Number(n).toLocaleString(app.loc(), { minimumFractionDigits: d === undefined ? 2 : d, maximumFractionDigits: d === undefined ? 2 : d }); };
    var privacyHref = function () { return cfg.privacyUrl || 'site/privacy.html'; };
    var deletionHref = function () { return cfg.deletionUrl || 'site/delete-account.html'; };
    var extLink = function (href) { return /^https?:/.test(href) ? ' target="_blank" rel="noopener"' : ''; };

    // ================= sync (Firestore, offline-first) =================
    function syncNow() {
      var u = auth.user();
      if (!u || !firebaseOn() || navigator.onLine === false) return Promise.resolve({ ok: false, reason: 'offline' });
      if (syncState.running) { syncState.again = true; return Promise.resolve({ ok: false, reason: 'busy' }); }
      syncState.running = true;
      return U.sync(env, u, auth.getToken, app.getFuel, app.setFuel).then(function (r) {
        syncState.running = false; if (r.ok) syncState.last = Date.now();
        if (syncState.again) { syncState.again = false; scheduleSync(300); }
        if (r.ok && app.onSynced) app.onSynced(r);
        return r;
      });
    }
    function scheduleSync(ms) { clearTimeout(syncState.timer); syncState.timer = setTimeout(syncNow, ms === undefined ? 1500 : ms); }
    function changed() { scheduleSync(); }   // local data changed (already marked dirty by userdata.js)
    function localChange() { U.markDirty(store); scheduleSync(); }

    // ================= sign-in gate =================
    var GATE_ERR = { cancelled: 'gate.err.cancelled', network: 'gate.err.network', 'not-configured': 'gate.err.notConfigured', unsupported: 'gate.err.unsupported' };
    function renderGate() {
      $('gate-brand').textContent = t('app.name');
      $('gate-title').textContent = t('gate.title'); $('gate-lead').textContent = t('gate.lead'); $('gate-why-h').textContent = t('gate.why');
      ['1', '2', '3'].forEach(function (n) { $('gate-why' + n).textContent = t('gate.why' + n); });
      $('gate-btn-t').textContent = t(gate.busy ? 'gate.busy' : 'gate.btn'); var b = $('gate-btn'); b.disabled = gate.busy; b.setAttribute('aria-busy', String(gate.busy)); b.classList.toggle('busy', gate.busy);
      var e = $('gate-err'); e.hidden = !gate.err; e.textContent = gate.err ? t(GATE_ERR[gate.err] || 'gate.err.failed') : ''; e.setAttribute('data-code', gate.err || '');
      var m = $('gate-msg'); m.hidden = !gate.msg || !!gate.err; m.textContent = gate.msg ? t(gate.msg) : '';
      $('gate-note').textContent = t('gate.note'); var p = $('gate-privacy'); p.textContent = t('gate.privacy'); p.href = privacyHref();
      if (/^https?:/.test(privacyHref())) { p.target = '_blank'; p.rel = 'noopener'; } else { p.removeAttribute('target'); }
    }
    function pullAfterSignIn(user) {
      var m = U.getMeta(store); if (m.uid && m.uid !== user.uid) U.wipeUserData(store);   // data of another account must never leak into this one
      var race = new Promise(function (res) { setTimeout(function () { res({ ok: false, reason: 'slow' }); }, 4500); });
      return Promise.race([syncNow(), race]);
    }
    function signIn() {
      if (gate.busy) return;
      gate.err = null; gate.msg = null;
      if (auth.provider === 'firebase' && navigator.onLine === false) { gate.err = 'network'; renderGate(); return; }
      gate.busy = true; renderGate();
      auth.signIn().then(function (user) { return pullAfterSignIn(user); }).then(function () { gate.busy = false; app.afterAuth(); }, function (e) {
        gate.busy = false; gate.err = (e && e.code) || 'failed'; if (!GATE_ERR[gate.err]) gate.err = 'failed'; renderGate();
      });
    }
    $('gate-btn').onclick = signIn;

    // ================= My account =================
    var ac = { step: 'main', sub: 0, fail: false, reauthErr: false };
    function initial(u) { return esc(((u.name || u.email || '?').trim().charAt(0) || '?').toUpperCase()); }
    function avatar(u) { return '<span class="avatar" aria-hidden="true">' + (u.photo ? '<img src="' + esc(u.photo) + '" alt="" referrerpolicy="no-referrer">' : '') + '<b>' + initial(u) + '</b></span>'; }
    function unsyncedWarn() { return firebaseOn() && U.getMeta(store).dirty; }
    function renderAccount() {
      $('ac-title').textContent = t('acct.title'); var u = auth.user(), b = $('ac-body'); if (!u) { b.innerHTML = ''; return; }
      var closeBtn = $('ac-close'); closeBtn.disabled = ac.step === 'prog';
      var h = '';
      if (ac.step === 'main') {
        var sy = !firebaseOn() ? t('acct.sync.off') : (U.getMeta(store).syncedAt && !U.getMeta(store).dirty ? t('acct.sync.ok', { time: app.fmtTime(U.getMeta(store).syncedAt) }) : t('acct.sync.never'));
        h = '<section class="card acct-card" id="ac-card">' + avatar(u) + '<div class="acct-who"><b id="ac-name" class="acct-name">' + esc(u.name || u.email) + '</b><p id="ac-email" class="acct-mail">' + esc(u.email) + '</p><p class="note">' + esc(t('acct.via')) + '</p></div></section>' +
          '<p id="ac-sync" class="note">' + esc(sy) + '</p>' +
          '<button type="button" id="ac-signout" class="btn outline wide">' + ico('logout') + '<span>' + esc(t('acct.signout')) + '</span></button>' +
          '<button type="button" id="ac-delete" class="btn danger wide">' + ico('trash') + '<span>' + esc(t('acct.delete')) + '</span></button>' +
          '<a id="ac-privacy" class="btn outline wide" href="' + esc(privacyHref()) + '"' + extLink(privacyHref()) + '>' + esc(t('acct.privacy')) + '</a>' +
          '<a id="ac-delweb" class="textlink" href="' + esc(deletionHref()) + '"' + extLink(deletionHref()) + '>' + esc(t('acct.deleteWeb')) + '</a>';
      } else if (ac.step === 'out') {
        h = '<section class="card confirm" id="ac-out"><h2>' + esc(t('acct.signout.q')) + '</h2><p class="lead">' + esc(t('acct.signout.body')) + '</p>' + (unsyncedWarn() ? '<p class="err" id="ac-out-warn">' + esc(t('acct.signout.unsynced')) + '</p>' : '') +
          '<button type="button" id="ac-out-yes" class="btn primary xl">' + ico('logout') + '<span>' + esc(t('acct.signout.yes')) + '</span></button>' +
          '<button type="button" id="ac-out-no" class="btn outline wide">' + esc(t('acct.keep')) + '</button></section>';
      } else if (ac.step === 'del1') {
        h = '<section class="card confirm" id="ac-del1"><h2>' + esc(t('acct.del1.title')) + '</h2><p class="lead">' + esc(t('acct.del1.body')) + '</p><ul class="del-list">' +
          [1, 2, 3, 4].map(function (n) { return '<li>' + esc(t('acct.del1.l' + n)) + '</li>'; }).join('') + '</ul>' +
          '<button type="button" id="ac-del1-no" class="btn primary xl">' + esc(t('acct.keep')) + '</button>' +
          '<button type="button" id="ac-del1-next" class="btn danger wide">' + esc(t('acct.del1.next')) + '</button></section>';
      } else if (ac.step === 'del2') {
        h = '<section class="card confirm danger-card" id="ac-del2"><h2>' + esc(t('acct.del2.title')) + '</h2><p class="lead">' + esc(t('acct.del2.body')) + '</p>' +
          '<button type="button" id="ac-del2-no" class="btn primary xl">' + esc(t('acct.del2.no')) + '</button>' +
          '<button type="button" id="ac-del2-yes" class="btn dangerfill wide">' + ico('trash') + '<span>' + esc(t('acct.del2.yes')) + '</span></button></section>';
      } else if (ac.step === 'prog') {
        h = '<section class="card confirm" id="ac-prog" role="status" aria-live="polite"><h2>' + esc(t('acct.del.progress')) + '</h2><ol class="del-steps">' +
          [1, 2, 3, 4].map(function (n) { return '<li class="' + (ac.sub > n ? 'done' : ac.sub === n ? 'now' : '') + '" data-s="' + n + '">' + (ac.sub > n ? sIco('ok') : '<i class="si" aria-hidden="true"></i>') + '<span>' + esc(t('acct.del.s' + n)) + '</span></li>'; }).join('') + '</ol></section>';
      } else if (ac.step === 'reauth') {
        h = '<section class="card confirm" id="ac-reauth"><h2>' + esc(t('acct.del.reauth.title')) + '</h2><p class="lead">' + esc(t('acct.del.reauth.body')) + '</p>' + (ac.reauthErr ? '<p class="err" role="alert">' + esc(t('gate.err.failed')) + '</p>' : '') +
          '<button type="button" id="ac-reauth-go" class="gbtn">' + GLOGO + '<span>' + esc(t('gate.btn')) + '</span></button>' +
          '<button type="button" id="ac-del2-no" class="btn outline wide">' + esc(t('acct.del2.no')) + '</button></section>';
      } else if (ac.step === 'fail') {
        h = '<section class="card confirm" id="ac-fail"><h2>' + esc(t('acct.del1.title')) + '</h2><p class="err" role="alert" id="ac-fail-msg">' + esc(t('acct.del.fail')) + '</p>' +
          '<button type="button" id="ac-retry" class="btn danger wide">' + esc(t('acct.del.retry')) + '</button>' +
          '<button type="button" id="ac-del2-no" class="btn primary xl">' + esc(t('acct.keep')) + '</button></section>';
      }
      b.innerHTML = h;
      var img = b.querySelector('.avatar img'); if (img) { img.addEventListener('error', function () { img.remove(); }); img.addEventListener('load', function () { var bb = img.parentNode.querySelector('b'); if (bb) bb.hidden = true; }); }
      var on = function (id, f) { var e = $(id); if (e) e.onclick = f; };
      var to = function (s) { return function () { ac.step = s; ac.fail = false; renderAccount(); var f = $('ac-body').querySelector('h2'); if (f) { f.setAttribute('tabindex', '-1'); f.focus({ preventScroll: true }); } }; };
      on('ac-signout', to('out')); on('ac-out-no', to('main')); on('ac-delete', to('del1')); on('ac-del1-no', to('main')); on('ac-del1-next', to('del2')); on('ac-del2-no', to('main'));
      on('ac-out-yes', doSignOut); on('ac-del2-yes', runDelete); on('ac-retry', runDelete);
      on('ac-reauth-go', function () { ac.reauthErr = false; $('ac-reauth-go').disabled = true; auth.signIn().then(function () { runDelete(); }, function () { ac.reauthErr = true; renderAccount(); }); });
    }
    function wipeLocalAll() {   // everything on the phone that belongs to the account; only the language choice and the 'tutorial seen' flag stay (both belong to the phone, not the account)
      var keep = { 'nmt.lang': 1, 'nmt.tutorial': 1 }, del = [];
      try { for (var i = 0; i < store.length; i++) { var k = store.key(i); if (k && k.indexOf('nmt.') === 0 && !keep[k]) del.push(k); } } catch (e) {}
      del.forEach(function (k) { try { store.removeItem(k); } catch (e) {} });
    }
    function doSignOut() {
      var pre = (auth.user() && firebaseOn() && navigator.onLine !== false) ? Promise.race([syncNow().then(function () { return D.flushReports(env); }), new Promise(function (r) { setTimeout(r, 3000); })]) : Promise.resolve();
      pre.catch(function () {}).then(function () { return auth.signOut(); }).then(function () {
        U.wipeUserData(store); try { store.removeItem(D.KEYS.reports); } catch (e) {}
        gate.msg = 'gate.signedOut'; gate.err = null; ac.step = 'main'; app.afterAuth();
      });
    }
    function runDelete() {
      var u = auth.user(); if (!u) return;
      ac.step = 'prog'; ac.sub = 1; renderAccount();
      var fail = function () { ac.step = 'fail'; renderAccount(); };
      D.deleteAccount(env).then(function (ok) {
        if (!ok) throw new Error('worker');
        ac.sub = 2; renderAccount(); return U.deleteRemote(env, u, auth.getToken);
      }).then(function (ok) {
        if (!ok) throw new Error('firestore');
        ac.sub = 3; renderAccount(); return auth.deleteAuthUser();
      }).then(function () {
        ac.sub = 4; renderAccount(); wipeLocalAll(); auth.forget();
        gate.msg = 'gate.deleted'; gate.err = null; ac.step = 'main'; app.afterAuth();
      }).catch(function (e) {
        if (e && e.code === 'requires-recent-login') { ac.step = 'reauth'; renderAccount(); return; }
        fail();
      });
    }

    // ================= favourites + alerts =================
    var al = { fresh: {} };
    function alertCount() { return auth.signedIn() ? U.unreadCount(store) : 0; }
    function checkAlerts() {
      var d = app.getData(); if (!d || !auth.signedIn() || !app.getFuel()) return;
      U.detectAlerts({ st: store, stations: d.stations, prices: d.prices, favs: U.listFavs(store), fuel: app.getFuel(), prefs: U.getAlerts(store), stockFn: app.stockFn, now: Date.now(), today: todayStr() });
      app.menu().paintDots();
    }
    function stationById(id) { var d = app.getData(); return d && d.stations.filter(function (s) { return s.id === id; })[0]; }
    function noteText(n) {
      var s = stationById(n.stationId), name = s ? s.name : n.stationId;
      return n.type === 'price' ? t('al.note.price', { station: name, fuel: app.fuelName(n.fuel), from: N.formatPrice(n.from), to: N.formatPrice(n.to) }) : t('al.note.stock', { station: name, fuel: app.fuelName(n.fuel) });
    }
    function switchRow(k, label, on, disabled) {
      return '<button type="button" role="switch" class="switchrow' + (on ? ' on' : '') + '" id="al-sw-' + k + '" data-k="' + k + '" aria-checked="' + on + '"' + (disabled ? ' aria-disabled="true"' : '') + '><span class="sw-l">' + esc(label) + '</span><span class="sw-s" aria-hidden="true"><i></i></span><b class="sw-v">' + esc(t(on ? 'al.state.on' : 'al.state.off')) + '</b></button>';
    }
    function renderAlerts() {
      $('al-title').textContent = t('al.title'); var a = U.getAlerts(store), favs = U.listFavs(store), notes = U.listNotes(store), d = app.getData();
      var seen = al.fresh;
      var h = '<section class="card" id="al-settings"><h2>' + esc(t('al.settings')) + '</h2>' + switchRow('on', t('al.on'), a.on, false) + switchRow('price', t('al.price'), a.price && a.on, !a.on) + switchRow('stock', t('al.stock'), a.stock && a.on, !a.on) + '<p class="note" id="al-push">' + esc(t('al.pushNote')) + '</p></section>';
      h += '<h2 class="sec-h">' + esc(t('al.notes')) + '</h2>';
      h += notes.length ? '<ul class="al-notes" id="al-notes">' + notes.map(function (n) { var nw = seen[n.id]; return '<li><button type="button" class="note-item' + (nw ? ' new' : '') + '" data-id="' + esc(n.stationId) + '" data-type="' + n.type + '">' + ico(n.type === 'price' ? 'tag' : 'fuel') + '<span class="ni-t">' + esc(noteText(n)) + '<time>' + esc(app.fmtAgo(n.ts)) + '</time></span>' + (nw ? '<span class="new-badge">' + esc(t('al.new')) + '</span>' : '') + '</button></li>'; }).join('') + '</ul><button type="button" id="al-clear" class="btn outline wide">' + esc(t('al.clear')) + '</button>'
        : '<p class="lead" id="al-notes-empty">' + esc(t('al.notes.empty')) + '</p>';
      h += '<h2 class="sec-h">' + esc(t('al.favs')) + '</h2>';
      var fs = favs.map(stationById).filter(Boolean);
      h += fs.length ? '<div class="stack" id="al-favs">' + fs.map(function (s) { var b = app.brandById(s.brand); return '<div class="favrow" style="--c:' + b.color + '"><button type="button" class="favgo" data-id="' + esc(s.id) + '"><b>' + esc(s.name) + '</b><span class="sub">' + esc(app.brandName(b)) + ' · ' + esc(s.tambon) + '</span></button><button type="button" class="favrm" data-id="' + esc(s.id) + '" aria-label="' + esc(t('al.remove') + ': ' + s.name) + '">' + ico('star-on') + '<span>' + esc(t('al.remove')) + '</span></button></div>'; }).join('') + '</div>'
        : '<p class="lead" id="al-favs-empty">' + esc(t('al.favs.empty')) + '</p>';
      $('al-body').innerHTML = h;
      Array.prototype.forEach.call($('al-body').querySelectorAll('.switchrow'), function (b) {
        b.onclick = function () { if (b.getAttribute('aria-disabled') === 'true') return; var k = b.getAttribute('data-k'), cur = U.getAlerts(store), p = {}; p[k] = !cur[k]; U.setAlerts(store, p); changed(); renderAlerts(); var nb = $('al-sw-' + k); if (nb) nb.focus({ preventScroll: true }); };
      });
      Array.prototype.forEach.call($('al-body').querySelectorAll('.favgo, .note-item'), function (b) { b.onclick = function () { app.go('#/station/' + encodeURIComponent(b.getAttribute('data-id'))); }; });
      Array.prototype.forEach.call($('al-body').querySelectorAll('.favrm'), function (b) { b.onclick = function () { U.toggleFav(store, b.getAttribute('data-id')); changed(); renderAlerts(); }; });
      var cl = $('al-clear'); if (cl) cl.onclick = function () { U.clearNotes(store); al.fresh = {}; renderAlerts(); app.menu().paintDots(); };
    }
    function openAlerts() { al.fresh = {}; U.listNotes(store).forEach(function (n) { if (!n.read) al.fresh[n.id] = 1; }); U.markNotesRead(store); app.menu().paintDots(); }
    function toggleFavorite(id) { var on = U.toggleFav(store, id); changed(); return on; }

    // ================= fuel log =================
    var fl = { ym: null, form: { date: '', liters: '', amount: '', station: '' }, errs: {}, delId: null, saved: false };
    function openLog() { var d = todayStr(); fl.ym = d.slice(0, 7); fl.form = { date: d, liters: '', amount: '', station: '' }; fl.errs = {}; fl.delId = null; fl.saved = false; }
    function stationOptions() {
      var d = app.getData(); if (!d) return [];
      var loc = app.userLoc(); return d.stations.map(function (s) { return { id: s.id, name: s.name, km: N.haversineKm(loc, s) }; }).sort(function (a, b) { return a.km - b.km; }).slice(0, 60);
    }
    function monthLabel(ym) { return new Date(ym + '-01T00:00:00').toLocaleDateString(app.loc(), { month: 'long', year: 'numeric' }); }
    function renderLog() {
      $('fl-title').textContent = t('log.title'); var list = U.listLog(store), tot = U.monthTotals(list, fl.ym), today = todayStr(), isNow = fl.ym === today.slice(0, 7);
      var h = '<div class="monthbar"><button type="button" id="fl-prev" class="btn outline" aria-label="' + esc(t('log.prev')) + '">' + ico('back') + '<span>' + esc(t('log.prev')) + '</span></button>' +
        '<button type="button" id="fl-next" class="btn outline" aria-label="' + esc(t('log.next')) + '"' + (isNow ? ' disabled' : '') + '><span>' + esc(t('log.next')) + '</span>' + ico('chev') + '</button></div>';
      h += '<section class="card sumcard" id="fl-sum"><p class="note" id="fl-month">' + esc(isNow ? t('log.total') : t('log.totalOf', { m: monthLabel(fl.ym) })) + ' · ' + esc(monthLabel(fl.ym)) + '</p>' +
        '<div class="num"><b class="big" id="fl-total" data-amount="' + tot.amount + '">' + esc(fmtNum(tot.amount)) + '</b><span class="unit">' + esc(t('log.baht')) + '</span></div>' +
        '<p class="sumline"><span id="fl-liters" data-liters="' + tot.liters + '"><b>' + esc(fmtNum(tot.liters)) + '</b> ' + esc(t('log.liters')) + '</span><span id="fl-count"><b>' + esc(t('log.count', { n: tot.count })) + '</b></span>' + (tot.avg ? '<span id="fl-avg">' + esc(t('log.avg', { p: fmtNum(tot.avg) })) + '</span>' : '') + '</p></section>';
      var f = fl.form, er = fl.errs;
      h += '<form id="fl-form" class="card" novalidate autocomplete="off"><h2>' + esc(t('log.add')) + '</h2>' +
        '<label for="fl-date" class="flabel">' + esc(t('log.date')) + '</label><input id="fl-date" name="date" type="date" max="' + today + '" value="' + esc(f.date) + '" required aria-invalid="' + !!er.date + '">' + (er.date ? '<p class="err" role="alert">' + esc(t('log.err.date')) + '</p>' : '') +
        '<label for="fl-liters-in" class="flabel">' + esc(t('log.litersL')) + '</label><input id="fl-liters-in" name="liters" type="text" inputmode="decimal" value="' + esc(f.liters) + '" aria-invalid="' + !!er.liters + '" placeholder="30.5">' + (er.liters ? '<p class="err" role="alert">' + esc(t('log.err.liters')) + '</p>' : '') +
        '<label for="fl-amount" class="flabel">' + esc(t('log.amountL')) + '</label><input id="fl-amount" name="amount" type="text" inputmode="decimal" value="' + esc(f.amount) + '" aria-invalid="' + !!er.amount + '" placeholder="1200">' + (er.amount ? '<p class="err" role="alert">' + esc(t('log.err.amount')) + '</p>' : '') +
        '<p class="note" id="fl-calc" aria-live="polite"></p>' +
        '<label for="fl-station" class="flabel">' + esc(t('log.station')) + '</label><select id="fl-station" name="station"><option value="">' + esc(t('log.noStation')) + '</option>' +
        stationOptions().map(function (s) { return '<option value="' + esc(s.id) + '"' + (f.station === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') + '</select>' +
        '<button type="submit" id="fl-save" class="btn primary xl">' + ico('plus') + '<span>' + esc(t('log.save')) + '</span></button><p class="note">' + esc(t('log.hint')) + '</p></form>';
      var mine = U.sortLog(list.filter(function (e) { return U.monthOf(e.date) === fl.ym; }));
      h += mine.length ? '<ul class="fl-list" id="fl-list">' + mine.map(function (e) {
        var confirm = fl.delId === e.id;
        return '<li class="fl-item" data-id="' + esc(e.id) + '"><div class="fl-main"><b class="fl-date">' + esc(app.fmtDate(e.date)) + '</b><span class="fl-st">' + esc(e.stationName || t('log.noStation')) + (e.fuel ? ' · ' + esc(app.fuelName(e.fuel)) : '') + '</span>' +
          '<span class="fl-nums"><b>' + esc(fmtNum(e.amount)) + '</b> ' + esc(t('log.baht')) + ' · ' + esc(fmtNum(e.liters)) + ' ' + esc(t('log.liters')) + ' · ' + esc(t('log.perLiter', { p: fmtNum(e.amount / e.liters) })) + '</span></div>' +
          (confirm ? '<div class="fl-confirm" role="group" aria-label="' + esc(t('log.delete.q')) + '"><p class="lead">' + esc(t('log.delete.q')) + '</p><button type="button" class="btn dangerfill wide fl-del-yes" data-id="' + esc(e.id) + '">' + esc(t('log.delete.yes')) + '</button><button type="button" class="btn outline wide fl-del-no">' + esc(t('acct.keep')) + '</button></div>'
            : '<button type="button" class="btn outline fl-del" data-id="' + esc(e.id) + '" aria-label="' + esc(t('log.delete') + ' ' + app.fmtDate(e.date)) + '">' + ico('trash') + '<span>' + esc(t('log.delete')) + '</span></button>') + '</li>'; }).join('') + '</ul>'
        : '<p class="lead" id="fl-empty">' + esc(t('log.empty')) + '</p>';
      $('fl-body').innerHTML = h;
      if (window.NMT && NMT.motion) { NMT.motion.roll($('fl-total'), fl.prevTotal == null ? 0 : fl.prevTotal, tot.amount, function (v) { return fmtNum(Math.round(v)); }); } fl.prevTotal = tot.amount;   // month total rolls up when the screen opens or the total changes
      var calc = function () { var l = parseFloat(String($('fl-liters-in').value).replace(',', '.')), a = parseFloat(String($('fl-amount').value).replace(',', '.')); $('fl-calc').textContent = l > 0 && a > 0 ? t('log.perLiter', { p: fmtNum(a / l) }) : ''; };
      var keep = function () { fl.form = { date: $('fl-date').value, liters: $('fl-liters-in').value, amount: $('fl-amount').value, station: $('fl-station').value }; calc(); };
      ['fl-date', 'fl-liters-in', 'fl-amount', 'fl-station'].forEach(function (id) { $(id).addEventListener('input', keep); $(id).addEventListener('change', keep); }); calc();
      $('fl-prev').onclick = function () { fl.ym = U.shiftMonth(fl.ym, -1); fl.delId = null; renderLog(); };
      $('fl-next').onclick = function () { if (fl.ym < todayStr().slice(0, 7)) { fl.ym = U.shiftMonth(fl.ym, 1); fl.delId = null; renderLog(); } };
      $('fl-form').onsubmit = function (ev) {
        ev.preventDefault(); keep(); var s = stationById(fl.form.station);
        var r = U.addLog(store, { date: fl.form.date, liters: fl.form.liters, amount: fl.form.amount, stationId: s ? s.id : '', stationName: s ? s.name : '', fuel: app.getFuel() }, todayStr());
        if (!r.ok) { fl.errs = {}; fl.errs[r.error] = true; renderLog(); var bad = $(r.error === 'liters' ? 'fl-liters-in' : r.error === 'amount' ? 'fl-amount' : 'fl-date'); if (bad) bad.focus(); return; }
        fl.errs = {}; fl.ym = r.entry.date.slice(0, 7); fl.form = { date: todayStr(), liters: '', amount: '', station: fl.form.station }; changed(); renderLog(); app.toast(t('log.saved'), true);
      };
      Array.prototype.forEach.call($('fl-body').querySelectorAll('.fl-del'), function (b) { b.onclick = function () { fl.delId = b.getAttribute('data-id'); renderLog(); var y = $('fl-body').querySelector('.fl-del-no'); if (y) y.focus({ preventScroll: true }); }; });
      Array.prototype.forEach.call($('fl-body').querySelectorAll('.fl-del-no'), function (b) { b.onclick = function () { fl.delId = null; renderLog(); }; });
      Array.prototype.forEach.call($('fl-body').querySelectorAll('.fl-del-yes'), function (b) { b.onclick = function () { U.removeLog(store, b.getAttribute('data-id')); fl.delId = null; changed(); renderLog(); }; });
    }

    return {
      panels: { account: { render: renderAccount, open: function () { ac.step = 'main'; ac.sub = 0; }, close: function () { if (ac.step !== 'prog') ac.step = 'main'; } }, fuellog: { render: renderLog, open: function () { fl.prevTotal = null; openLog(); } }, alerts: { render: renderAlerts, open: openAlerts } },
      renderGate: renderGate, gateState: gate, syncNow: syncNow, scheduleSync: scheduleSync, localChange: localChange, checkAlerts: checkAlerts, alertCount: alertCount, toggleFavorite: toggleFavorite,
      isFav: function (id) { return U.isFav(store, id); }, deleting: function () { return ac.step === 'prog'; },
    };
  };
})(window);
