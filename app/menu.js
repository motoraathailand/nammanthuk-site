// น้ำมันถูก — app menu (side drawer) with: Notices (ประกาศ), Updates (อัปเดต), Send feedback (ส่งความคิดเห็น), About (เกี่ยวกับแอป).
// Mirrors AAAi's pattern (drawer -> notices list/detail with red dot, update log with "new" marker, feedback sheet, about) — see /workspace/project-reborn/public/{notices,changelog,feedback}.js.
// Notices + update log: backend (api/notices, api/changelog) -> local cache -> bundled data/*.json.  Feedback: queued on the device, POSTed to api/feedback when a backend exists.
// Menu overlays are hash routes (#/menu, #/notices, #/updates, #/feedback, #/about) so the Android back button closes them.
(function (root) {
  'use strict';
  root.NMT = root.NMT || {};
  root.NMT.OVERLAYS = ['menu', 'notices', 'updates', 'feedback', 'about', 'account', 'fuellog', 'alerts'];
  root.NMT.menuInit = function (app) {
    var t = app.t, esc = app.esc, store = app.store, cfg = app.cfg, D = root.NMT.Data, I = root.NMT.i18n;
    function ico(n) { return '<svg class="ic" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; }
    function sIco(st) { return '<i class="si" aria-hidden="true"><svg><use href="#s-' + st + '"/></svg></i>'; }
    var $ = function (id) { return document.getElementById(id); };
    var SEEN = { n: 'nmt.notices.seen', u: 'nmt.updates.seen' };
    var X = { notices: [], entries: [], version: {}, loaded: false }, since = { n: null, u: null }, current = null, fbType = 'question';
    var key = function (x) { return x.date + '|' + x.id; };
    var seen = function (k) { try { return store.getItem(k) || ''; } catch (e) { return ''; } };
    var pick = function (o) { return (o && (o[I.lang()] || o.th || o.en || Object.values(o).find(Boolean))) || (Array.isArray(o) ? [] : ''); };
    var unseenN = function () { return X.notices.length > 0 && key(X.notices[0]) > seen(SEEN.n); };
    var unseenU = function () { return X.entries.length > 0 && key(X.entries[0]) > seen(SEEN.u); };

    function paintDots() {
      var n = unseenN(), u = unseenU();
      $('dr-notices-dot').textContent = t('notices.new'); $('dr-updates-dot').textContent = t('updates.new');
      $('dr-notices-dot').hidden = !n; $('dr-updates-dot').hidden = !u;
      var a = (app.alertCount ? app.alertCount() : 0) > 0;
      $('dr-alerts-dot').textContent = t('al.new'); $('dr-alerts-dot').hidden = !a;
      $('btn-menu').classList.toggle('has-dot', n || u || a);
      $('btn-menu').setAttribute('data-unseen', String((n ? 1 : 0) + (u ? 1 : 0) + (a ? 1 : 0)));
    }
    function load() {
      return D.loadExtras(app.env).then(function (x) { X.notices = x.notices; X.entries = x.entries; X.version = x.version; X.loaded = true; paintDots(); if (current === 'notices' || current === 'updates') render(current); }).catch(function (e) { console.warn('menu data', e && e.message); });
    }

    // ---- drawer ----
    function renderDrawer() {
      $('dr-title').textContent = t('menu.title');
      $('dr-close-l').textContent = t('common.close');
      $('dr-account-l').textContent = t('menu.account'); $('dr-fuellog-l').textContent = t('menu.fuellog'); $('dr-alerts-l').textContent = t('menu.alerts');
      $('dr-notices-l').textContent = t('menu.notices'); $('dr-updates-l').textContent = t('menu.updates'); $('dr-feedback-l').textContent = t('menu.feedback'); $('dr-howto-l').textContent = t('menu.howto'); $('dr-about-l').textContent = t('menu.about');
      $('dr-update-l').textContent = t('menu.update');
      $('dr-foot').textContent = 'v' + cfg.appVersion + (cfg.appVersionCode ? ' (' + cfg.appVersionCode + ')' : '');   // "v1.0.0 (20)": versionCode is written into app-config.js at build time from build.gradle
      $('btn-menu').setAttribute('aria-label', t('menu.open'));
    }
    // ---- notices ----
    function renderNotices() {
      $('nt-title').textContent = t('notices.title'); $('nt-back').innerHTML = ico('back') + '<span>' + t('notices.back') + '</span>';
      var last = since.n === null ? seen(SEEN.n) : since.n;
      $('nt-list').innerHTML = X.notices.map(function (n) { return '<li><button type="button" class="nt-item' + (key(n) > last ? ' new' : '') + '" data-id="' + esc(n.id) + '"><time>' + ico('bell') + '<span>' + esc(n.date) + '</span></time><span class="nt-t">' + esc(pick(n.title)) + '</span>' + (key(n) > last ? '<span class="new-badge">' + esc(t('notices.new')) + '</span>' : '') + '</button></li>'; }).join('');
      $('nt-empty').textContent = t('notices.empty'); $('nt-empty').hidden = X.notices.length > 0;
      var open = !$('nt-detail').hidden && X.notices.filter(function (n) { return n.id === $('nt-detail').getAttribute('data-id'); })[0];
      if (open) fillNotice(open); else showNoticeList();
      Array.prototype.forEach.call($('nt-list').querySelectorAll('.nt-item'), function (b) { b.onclick = function () { var n = X.notices.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0]; if (n) { fillNotice(n); $('nt-list').hidden = true; $('nt-detail').hidden = false; $('nt-back').hidden = false; } }; });
    }
    function showNoticeList() { $('nt-detail').hidden = true; $('nt-back').hidden = true; $('nt-list').hidden = !X.notices.length; }
    function fillNotice(n) { $('nt-detail').setAttribute('data-id', n.id); $('nt-date').textContent = n.date; $('nt-dtitle').textContent = pick(n.title); $('nt-body').textContent = pick(n.body); }
    // ---- updates ----
    function renderUpdates() {
      $('up-title').textContent = t('updates.title'); 
      var last = since.u === null ? seen(SEEN.u) : since.u;
      $('up-ver').textContent = t('updates.version', { v: cfg.appVersion });
      $('up-list').innerHTML = X.entries.map(function (e) { return '<section class="up-entry" data-id="' + esc(e.id) + '"><time datetime="' + esc(e.date) + '">' + esc(e.date) + (e.version ? ' <span class="up-v">v' + esc(e.version) + '</span>' : '') + (key(e) > last ? ' <span class="up-new">' + esc(t('updates.new')) + '</span>' : '') + '</time><ul>' + pick(e.items).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></section>'; }).join('');
      $('up-empty').textContent = t('updates.empty'); $('up-empty').hidden = X.entries.length > 0;
    }
    // ---- feedback ----
    var FB_TYPES = ['question', 'bug', 'idea', 'other'], FB_ICON = { question: 'help', bug: 'bug', idea: 'bulb', other: 'chat' };
    function renderFeedback() {
      $('fb-title').textContent = t('fb.title'); $('fb-done-close').innerHTML = ico('check') + '<span>' + esc(t('common.close')) + '</span>';
      $('fb-types').innerHTML = FB_TYPES.map(function (k) { return '<button type="button" role="radio" aria-checked="' + (k === fbType) + '" class="opt' + (k === fbType ? ' on' : '') + '" data-t="' + k + '">' + ico(FB_ICON[k]) + '<span class="opt-l">' + esc(t('fb.type.' + k)) + '</span>' + (k === fbType ? sIco('ok') : '') + '</button>'; }).join('');
      Array.prototype.forEach.call($('fb-types').querySelectorAll('[data-t]'), function (b) { b.onclick = function () { fbType = b.getAttribute('data-t'); renderFeedback(); }; });
      $('fb-label').textContent = t('fb.label'); $('fb-msg').placeholder = t('fb.ph'); $('fb-send').innerHTML = ico('mail') + '<span>' + t('fb.sendMail') + '</span>'; $('fb-hint').textContent = t('fb.mailHint'); $('fb-note').textContent = t('fb.noPersonal');
      $('fb-count').textContent = $('fb-msg').value.length + '/2000';
    }
    function openFeedback() { fbType = 'question'; $('fb-msg').value = ''; $('fb-err').hidden = true; $('fb-form').hidden = false; $('fb-done').hidden = true; renderFeedback(); setTimeout(function () { $('fb-msg').focus(); }, 40); }
    // mailto with the message + device/app info prefilled (the user can edit/delete before sending)
    function mailtoUrl(msg, dg) {
      var info = ['App: ' + cfg.appName + ' ' + dg.app + ' (' + dg.appId + ')', 'Lang: ' + dg.lang, 'Screen: ' + dg.screen, 'Device: ' + dg.ua].join('\n');
      return 'mailto:' + cfg.contactEmail + '?subject=' + encodeURIComponent(cfg.appName + ' ' + dg.app + ' — ' + t('fb.type.' + fbType)) + '&body=' + encodeURIComponent(msg + '\n\n----\n' + info);
    }
    function diag() { return { app: cfg.appVersion, appId: cfg.appId, lang: I.lang(), screen: window.innerWidth + 'x' + window.innerHeight + '@' + window.devicePixelRatio, ua: navigator.userAgent }; }
    $('fb-msg').addEventListener('input', function () { $('fb-count').textContent = $('fb-msg').value.length + '/2000'; $('fb-err').hidden = true; });
    $('fb-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var msg = $('fb-msg').value.trim();
      if (msg.length < 5) { $('fb-err').textContent = t('fb.tooShort'); $('fb-err').hidden = false; $('fb-msg').focus(); if (window.Motion) Motion.scrollTo($('fb-err'), 'center'); return; }
      var dg = diag(), f = D.addFeedback(store, fbType, msg, dg);
      $('fb-send').disabled = true;
      D.flushFeedback(app.env).then(function (r) {
        $('fb-send').disabled = false;
        var sent = r.pending === 0;
        $('fb-done-title').textContent = t('fb.doneTitle'); $('fb-done-body').textContent = t(sent ? 'fb.doneSent' : 'fb.doneQueued'); $('fb-done').setAttribute('data-state', sent ? 'sent' : 'queued');
        var m = $('fb-mail'); m.hidden = !cfg.contactEmail;
        if (cfg.contactEmail) { m.innerHTML = ico('mail') + '<span>' + t('fb.open') + '</span>'; m.href = mailtoUrl(msg, dg); }
        $('fb-form').hidden = true; $('fb-done').hidden = false;
        if (cfg.contactEmail) m.click();   // open the phone's mail app right away (the button stays for a second try)
      });
    });
    // ---- about ----
    function renderAbout() {
      $('ab-title').textContent = t('menu.about'); 
      $('ab-name').textContent = cfg.appName; $('ab-tagline').textContent = t('app.tagline');
      $('ab-version').textContent = t('set.version', { v: cfg.appVersion });
      $('ab-operator').textContent = t('set.operator', { name: cfg.operatorName });
      $('ab-contact').hidden = !cfg.contactEmail; if (cfg.contactEmail) $('ab-contact').textContent = t('about.contact', { email: cfg.contactEmail });
      $('ab-privacy-text').textContent = t('set.privacyText');
      var pl = $('ab-privacy-link'); pl.hidden = !cfg.privacyUrl; if (cfg.privacyUrl) { pl.href = cfg.privacyUrl; pl.innerHTML = ico('shield') + '<span>' + esc(t('set.privacy')) + '</span>'; }
      $('ab-src-h').textContent = t('set.sources'); $('ab-src').textContent = t('set.sourcesText'); $('ab-osm').textContent = t('about.osm');
      $('ab-lic-h').textContent = t('about.licenses'); $('ab-lic-btn').innerHTML = ico('doc') + '<span>' + esc(t($('ab-lic-text').hidden ? 'about.licensesShow' : 'about.licensesHide')) + '</span>';
    }
    $('ab-lic-btn').addEventListener('click', function () {
      var pre = $('ab-lic-text');
      if (!pre.hidden) { pre.hidden = true; renderAbout(); return; }
      var done = function (txt) { pre.textContent = txt; pre.hidden = false; renderAbout(); };
      if (pre.textContent) return done(pre.textContent);
      app.env.fetch('LICENSES').then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.text(); }).then(done).catch(function () { done(t('about.licensesFail')); });
    });

    // ---- show / hide (called by app.js route()) ----
    var PANELS = { menu: 'drawer', notices: 'modal-notices', updates: 'modal-updates', feedback: 'modal-feedback', about: 'modal-about', account: 'modal-account', fuellog: 'modal-fuellog', alerts: 'modal-alerts' };
    var EXTRA = {};   // account / fuel log / alerts screens live in acct.js: { name: { render(), open(), close() } }
    var RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    function ghostDrawer() {   // drawer closes instantly (state/tests); a non-interactive copy slides out + backdrop fades, then removes itself
      var d = $('drawer'); if (RM.matches || d.hidden) return;
      var g = d.cloneNode(true); g.removeAttribute('id'); g.classList.add('ghost'); g.setAttribute('aria-hidden', 'true'); g.setAttribute('inert', '');
      Array.prototype.forEach.call(g.querySelectorAll('[id]'), function (e) { e.removeAttribute('id'); });
      Array.prototype.forEach.call(g.querySelectorAll('button, a'), function (e) { e.tabIndex = -1; });
      document.body.appendChild(g);
      var done = function () { if (g.parentNode) g.parentNode.removeChild(g); };
      g.querySelector('.drawer-panel').addEventListener('animationend', done); setTimeout(done, 500);
    }
    function hideAll() { var was = current; ghostDrawer(); Object.keys(PANELS).forEach(function (k) { $(PANELS[k]).hidden = true; }); current = null; since.n = since.u = null; if (was && EXTRA[was] && EXTRA[was].close) EXTRA[was].close(); }
    function render(name) { if (EXTRA[name]) return EXTRA[name].render(); ({ menu: renderDrawer, notices: renderNotices, updates: renderUpdates, feedback: renderFeedback, about: renderAbout })[name](); }
    function show(name) {
      if (current !== name) {
        hideAll(); current = name;
        if (name === 'notices') { since.n = seen(SEEN.n); showNoticeList(); }
        if (name === 'updates') since.u = seen(SEEN.u);
        if (name === 'feedback') openFeedback();
        if (name === 'about') { $('ab-lic-text').hidden = true; }
        if (EXTRA[name] && EXTRA[name].open) EXTRA[name].open();
      }
      var el = $(PANELS[name]), wasHidden = el.hidden;
      render(name); el.hidden = false; document.body.classList.add('noscroll');
      if (wasHidden && name !== 'menu' && !RM.matches) { el.classList.remove('go-push'); void el.offsetWidth; el.classList.add('go-push'); setTimeout(function () { el.classList.remove('go-push'); }, 800); }
      if (wasHidden && !RM.matches && window.NMT && NMT.motion) NMT.motion.stagger(name === 'menu' ? el.querySelectorAll('.dr-item, .dr-foot') : el.querySelectorAll('.pad > *, .pad .nt-item, .pad .up-item'), { cap: 8 });   // list items glide in one after another
      // opening a list marks the newest item as read (the "new" markers stay for this visit, like AAAi)
      if (name === 'notices' && X.notices.length) { store.setItem(SEEN.n, key(X.notices[0])); paintDots(); }
      if (name === 'updates' && X.entries.length) { store.setItem(SEEN.u, key(X.entries[0])); paintDots(); }
    }
    function hide() { if (current) hideAll(); document.body.classList.remove('noscroll'); }

    // ---- wiring ----
    $('btn-menu').onclick = function () { app.go('#/menu'); };
    $('dr-howto').onclick = function () { app.replace('#/howto'); };   // the tutorial is a full screen (view-howto), not an overlay
    $('dr-close').onclick = app.back; $('dr-scrim').onclick = app.back;
    $('dr-update').onclick = function () { if (app.openStore) app.openStore(); };   // Play Store page of this app (market:// -> https), see update.js
    ['account', 'fuellog', 'alerts', 'notices', 'updates', 'feedback', 'about'].forEach(function (k) { $('dr-' + k).onclick = function () { app.replace('#/' + k); }; });
    ['nt', 'up', 'fb', 'ab', 'ac', 'fl', 'al'].forEach(function (p) { $(p + '-close').onclick = app.back; });
    $('fb-done-close').onclick = app.back;
    $('nt-back').onclick = function () { showNoticeList(); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && current) app.back(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
    renderDrawer(); load();
    return { show: show, hide: hide, reload: load, paintDots: paintDots, setExtra: function (x) { EXTRA = x; }, rerender: function () { if (current && current !== 'menu') render(current); }, onLang: function () { renderDrawer(); }, current: function () { return current; } };
  };
})(window);
