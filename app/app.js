// น้ำมันถูก — UI. Plain JS, no build step. Same code runs in the browser and inside the Capacitor wrapper (bundled, no remote URL).
// Senior-friendly rules: one primary action per screen, every sub-screen has a labelled back button, no gestures needed,
// choices hidden behind a single tap (progressive disclosure), status = colour + icon + word.
(function () {
  'use strict';
  var cfg = window.NMT_CONFIG, N = window.NMT, I = N.i18n, D = N.Data, t = I.t;
  var LS = { lang: 'nmt.lang', tut: 'nmt.tutorial', fuel: 'nmt.fuel', onboarded: 'nmt.onboarded', sort: 'nmt.sort' };
  var $ = function (id) { return document.getElementById(id); };
  var store = (function () { try { localStorage.setItem('nmt.t', '1'); localStorage.removeItem('nmt.t'); return localStorage; } catch (e) { var m = {}; return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; } }; } })();
  // saved fuel from an older build: 'premium' -> 'premium_gas' (rewritten once so it is also what syncs to the account)
  function savedFuel() { var f = store.getItem(LS.fuel); if (f === 'premium') { f = 'premium_gas'; try { store.setItem(LS.fuel, f); } catch (e) {} } return f; }
  var COMMON_FUELS = ['gsh95', 'gsh91', 'e20', 'b7'];        // shown first; the rest sit behind "other fuels"
  var FUEL_HINT = { premium_gas: 'fuel.hint.premium_gas', premium_diesel: 'fuel.hint.premium_diesel' };   // a short example under the name, only for the two premium fuels
  var OTHER_FUELS = N.FUELS.filter(function (f) { return COMMON_FUELS.indexOf(f) < 0; });
  // outline icons from the sprite in index.html (same style as AAAi). Status icons differ in SHAPE, not only colour.
  function ico(n, cls) { return '<svg class="' + (cls || 'ic') + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; }
  function sIco(st) { return '<i class="si" aria-hidden="true"><svg><use href="#s-' + st + '"/></svg></i>'; }
  function setHtml(id, h) { var e = $(id); if (e) e.innerHTML = h; }
  var SORT_ICON = { near: 'pin', cheap: 'tag' };   // every option shows its own icon (v20); the selected one also gets the check mark
  var VIEWS = ['howto', 'gate', 'onboarding', 'home', 'map', 'board', 'premium', 'pick', 'settings'];

  var S = {
    fuel: savedFuel(), brand: 'all', sort: store.getItem(LS.sort) === 'cheap' ? 'cheap' : 'near',
    loc: { lat: cfg.fallbackCenter.lat, lng: cfg.fallbackCenter.lng, state: 'wait' },
    data: null, stockMap: {}, route: 'home', stationId: null, navDepth: 0, programmatic: false, reportFuel: null,
    showAll: false, onbMore: false, otherReport: false, allFuels: false, homeY: 0,
    map: null, markers: {}, userMarker: null, lastMapKey: '',
    adsRemote: false, adsScript: false, lastView: null, navDir: 'fade', numSeen: {}, pillSeen: {}, rollSeen: {}, popSort: false, heroId: null,
  };
  I.setLang(I.resolve(store.getItem(LS.lang), I.phoneLangs()));   // saved menu choice > phone language (th/en/ko/zh/hi) > English; the automatic choice is never written to storage
  // sign-in: Google only (auth.js). The native plugin object exists only inside the Android app.
  var auth = N.Auth.create({ cfg: cfg, store: store, plugin: window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FirebaseAuthentication });
  var acct = null;
  var officialPrice = function (id) { var b = (S.data && S.data.brands || []).filter(function (x) { return x.id === id; })[0]; return !b || b.priceSource !== 'crowd'; };   // brands.json priceSource 'crowd' = no official price exists for the brand (independent / unknown stations)
  var brandById = function (id) { var r = (S.data && S.data.brands || []).filter(function (b) { return b.id === id; })[0]; return r || { id: id, name: { th: id, en: id, ko: id }, color: '#3f4d45', ink: '#ffffff' }; };
  var brandName = function (b) { return (b.name[I.lang()] || b.name.en || b.name.th); };

  // ---------- motion helpers (CSS does the animating; prefers-reduced-motion switches it all off in CSS and here) ----------
  var RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function reduced() { return !!RM.matches; }
  // shared motion standard (motion.js / motion.css, copied from /workspace/shared/motion): window.Motion. Stubs keep the app working if it is missing.
  var M = window.Motion || { reduced: function () { return true; }, play: function () {}, stagger: function () {}, roll: function () {}, langFade: function () {}, scrollTo: function () {}, use: function () {} };
  window.NMT = window.NMT || {}; NMT.motion = M;
  M.use({ ripple: '.btn, .rowbtn, .bigopt, .opt, .tile, .row, .rep-btn, .navbtn, .seg button, .dr-item, .nt-item, .gbtn, .favgo, .favrm, .gc' });
  function play(el, cls, ms) { M.play(el, cls, ms); }   // (re)start a one-shot CSS animation class; it is removed again so nothing stays hidden or shifted
  function stagger(els, ms, cap) { M.stagger(els, { cap: cap || 9 }); }   // cards flow in one after another, 36 ms apart (max 10 steps)
  function numClass(key, val) {   // 'tick-up' / 'tick-down' when a displayed number changed since the last render, else ''
    var prev = S.numSeen[key]; S.numSeen[key] = val;
    if (prev === undefined || prev === val || reduced()) return '';
    return val > prev ? ' tick-up' : ' tick-down';
  }
  function pillPop(root, key, status, sel) {   // status pill pops when its status changed since last render
    var prev = S.pillSeen[key]; S.pillSeen[key] = status;
    if (prev !== undefined && prev !== status && root) { var p = root.querySelector(sel); if (p) play(p, 'pop', 700); }
  }
  function rollNum(el, key, val, fmt, firstFrom) {   // number roll-up: counts from the last shown value (or a little below on first sight) to the new one; the real text is already final
    var prev = S.rollSeen[key]; S.rollSeen[key] = val;
    if (!el || typeof val !== 'number') return;
    M.roll(el, prev === undefined ? firstFrom : prev, val, fmt);
  }
  var CHECK_SVG = '<svg class="sent-ic" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15"/><path d="M9 16.5l4.8 4.8L23 11.5"/></svg>';

  // ---------- ad slots (only when the BUILD enables ads: cfg.adsEnabled; test builds render nothing, reserve nothing, load nothing) ----------
  // Allowed places ONLY: bottom banner of the price board, a native-style card after every cfg.ads.nativeEvery stations in the "see all" list.
  // Two gates, BOTH must be open: (1) build flag cfg.adsEnabled (test builds: false, ads.js not even packaged), (2) remote switch api/config ads.enabled === true
  // (fail-closed, see data.js loadAdsSwitch). Nothing ad-related is fetched, loaded or rendered while either gate is closed.
  function adsOn() { return !!cfg.adsEnabled && S.adsRemote === true; }
  function adHtml(kind) {
    if (!adsOn()) return '';
    return '<aside class="ad-slot ad-' + kind + '" data-ad="' + kind + '" aria-label="' + esc(t('ad.label')) + '"><span class="ad-tag">' + esc(t('ad.label')) + '</span><div class="ad-body"></div></aside>';
  }
  function adsMount() { if (adsOn() && window.NMT && NMT.ads) NMT.ads.mount(document); }
  function adsLoadScript() {   // first time the switch is on: load ads.js (never requested otherwise)
    if (S.adsScript) return; S.adsScript = true;
    var sc = document.createElement('script'); sc.src = 'ads.js';
    sc.onload = function () { NMT.ads.init({ t: t, esc: esc }); }; sc.onerror = function () { S.adsScript = false; };
    document.head.appendChild(sc);
  }
  function adsApply() {   // (re)draw the screens that can carry slots, or remove every slot when the switch went off
    if (adsOn()) adsLoadScript();
    else { var b = $('ad-board'); if (b) b.parentNode.removeChild(b); if (window.NMT && NMT.ads && NMT.ads.disable) NMT.ads.disable(); }
    if (!$('view-home').hidden && S.data) renderHome();
    if (!$('view-board').hidden && S.data) renderBoard();
    if (!$('view-premium').hidden && S.data) renderPremium();
  }
  function adsRefresh() {   // ask the remote switch; the answer (or its absence) decides, fail-closed
    D.loadAdsSwitch(env).then(function (r) { var was = S.adsRemote; S.adsRemote = r.enabled === true; if (S.adsRemote !== was || S.adsRemote) adsApply(); }).catch(function () { S.adsRemote = false; adsApply(); });
  }
  function adsBoot() {
    if (!cfg.adsEnabled) return;   // test build: no cache read, no api/config request, no ads.js, no listeners, nothing
    S.adsRemote = D.adsSwitchFromCache(store, Date.now(), cfg.ads && cfg.ads.switchMaxAgeHours);   // last known good answer (fresh), else off
    if (S.adsRemote) adsLoadScript();
    adsRefresh();
    document.addEventListener('visibilitychange', function () { if (!document.hidden) adsRefresh(); });   // the owner can switch ads off remotely: re-read when the app comes back
    window.addEventListener('online', adsRefresh);
  }

  // ---------- helpers ----------
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function setText(id, s) { var e = $(id); if (e) e.textContent = s; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function loc() { return I.lang() === 'th' ? 'th-TH-u-ca-gregory' : I.lang() === 'zh' ? 'zh-CN' : I.lang() === 'hi' ? 'hi-IN' : I.lang(); }
  function fmtTime(ms) {
    var d = new Date(ms), n = new Date(), th = I.lang() === 'th';
    var hm = pad(d.getHours()) + ':' + pad(d.getMinutes()) + (th ? ' น.' : '');
    if (d.toDateString() === n.toDateString()) return hm;
    return d.toLocaleDateString(loc(), { day: 'numeric', month: 'short' }) + ' ' + hm;
  }
  function fmtDate(iso) { return new Date(iso + 'T00:00:00').toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: 'numeric' }); }
  function fmtDist(km) { var p = N.distanceParts(km); return t('dist.' + p.unit, { n: p.value }); }
  function distNum(km) { return String(N.distanceParts(km).value); }
  function distUnit(km) { return t('dist.' + N.distanceParts(km).unit, { n: '' }).trim(); }
  function fmtAgo(ts) { var a = N.agoParts(Date.now(), ts); return t(a.key, { n: a.n }); }
  function fuelName(f) { return t('fuel.' + N.normFuel(f)); }
  function lastText(si) { return si.ts == null ? t('detail.noReport') : (si.fresh ? t('detail.lastReport', { ago: fmtAgo(si.ts) }) : t('detail.stale', { ago: fmtAgo(si.ts) })); }
  function pillHtml(status, extra) { return '<span class="pill st-' + status + '"' + (extra || '') + ' data-status="' + status + '">' + sIco(status) + '<span>' + esc(t('status.' + status)) + '</span></span>'; }
  function toast(msg) {
    var el = $('toast'); el.hidden = true; void el.offsetWidth; el.innerHTML = (arguments[1] ? CHECK_SVG : '') + '<span></span>'; el.lastChild.textContent = msg; el.hidden = false; clearTimeout(toast.t);
    el.classList.remove('out'); clearTimeout(toast.t); clearTimeout(toast.t2);
    toast.t = setTimeout(function () { if (reduced()) { el.hidden = true; return; } el.classList.add('out'); toast.t2 = setTimeout(function () { el.hidden = true; el.classList.remove('out'); }, 280); }, 3600);   // slides back down before it goes
  }
  function backLabels() { Array.prototype.forEach.call(document.querySelectorAll('.btn.back .bl'), function (e) { e.textContent = t('common.back'); }); }
  var env = { cfg: cfg, storage: store, fetch: function (u, o) { return window.fetch(u, o); }, apiUrl: N.apiUrl, getToken: function (force) { return auth.getToken(force); } };

  // ---------- routing (hash; works with the Android back button through history) ----------
  function parseRoute() {
    var h = location.hash || '', m;
    if ((m = /^#\/station\/(.+)$/.exec(h))) return { name: 'station', station: decodeURIComponent(m[1]) };
    if ((m = /^#\/pick\/(fuel|lang|brand)$/.exec(h))) return { name: 'pick', kind: m[1] };
    if ((m = new RegExp('^#/(' + N.OVERLAYS.join('|') + ')$').exec(h))) return { name: 'home', overlay: m[1] };
    if (h === '#/board') return { name: 'board' };
    if (h === '#/premium') return { name: 'premium' };
    if (h === '#/map') return { name: 'map' };
    if (h === '#/settings') return { name: 'settings' };
    if (h === '#/howto') return { name: 'howto' };
    return { name: 'home' };
  }
  function replace(hash) { history.replaceState(null, '', location.pathname + location.search + hash); route(); }
  function go(hash) { if (S.route === 'home' && !menuOpen()) S.homeY = window.scrollY; S.navDir = 'push'; S.programmatic = true; S.navDepth++; location.hash = hash; }
  function back() {
    if (S.navDepth > 0) { S.navDir = 'pop'; S.programmatic = true; S.navDepth--; history.back(); }
    else { history.replaceState(null, '', location.pathname + location.search + '#/'); route(); }
  }
  function menuOpen() { return !!(menu && menu.current()); }
  window.addEventListener('hashchange', function () {
    if (S.programmatic) S.programmatic = false; else { S.navDepth = Math.max(0, S.navDepth - 1); S.navDir = 'pop'; }
    route();
  });

  function route() {
    var onboarded = store.getItem(LS.onboarded) === '1' && S.fuel;
    var r = parseRoute();
    VIEWS.concat(['sheet']).forEach(function (v) { var e = $(v === 'sheet' ? 'sheet' : 'view-' + v); e.hidden = true; });
    var dir = S.navDir; S.navDir = 'fade';
    // first run: the tutorial comes FIRST (before the sign-in gate), once. Anyone who already finished onboarding (older install) never sees it unasked.
    var tutSeen = store.getItem(LS.tut) === '1';
    if (!tutSeen && store.getItem(LS.onboarded) === '1') { store.setItem(LS.tut, '1'); tutSeen = true; }
    if (!tutSeen) {
      if (S.lastView !== 'howto') S.tutI = 0;
      S.tutMode = 'first'; S.route = 'howto'; $('view-howto').hidden = false; if (menu) menu.hide(); document.body.classList.remove('noscroll');
      renderTutorial(); enterView($('view-howto'), 'howto', dir); return;
    }
    if (!auth.signedIn()) {   // the sign-in gate: no other way in
      $('view-gate').hidden = false; if (menu) menu.hide(); document.body.classList.remove('noscroll'); acct.renderGate(); document.documentElement.lang = I.lang(); S.route = 'gate';
      enterView($('view-gate'), 'gate', dir); return;
    }
    var langPick = r.name === 'pick' && r.kind === 'lang';
    if (!onboarded && !langPick) { $('view-onboarding').hidden = false; if (menu) menu.hide(); renderOnboarding(); enterView($('view-onboarding'), 'onboarding', dir); return; }
    if (!S.data && r.name !== 'home' && r.name !== 'pick' && r.name !== 'settings' && r.name !== 'howto') r = { name: 'home' };
    S.route = r.name;
    if (r.name === 'station') {
      if (menu) menu.hide();
      if (!openStation(r.station)) { replace('#/'); return; }
      window.scrollTo(0, 0); enterView($('sheet'), 'station:' + r.station, 'up'); return;
    }
    $('view-' + r.name).hidden = false;
    document.body.classList.toggle('noscroll', false);
    if (r.name === 'home') {
      renderHome();
      if (menu) { if (r.overlay) menu.show(r.overlay); else { menu.hide(); window.scrollTo(0, S.homeY || 0); } }
    } else {
      if (menu) menu.hide();
      if (r.name === 'board') renderBoard();
      else if (r.name === 'premium') renderPremium();
      else if (r.name === 'settings') renderSettings();
      else if (r.name === 'pick') renderPick(r.kind);
      else if (r.name === 'map') renderMapView();
      else if (r.name === 'howto') { if (S.lastView !== 'howto') S.tutI = 0; S.tutMode = 'replay'; renderTutorial(); if (dir === 'fade') dir = 'push'; }
      window.scrollTo(0, 0);
    }
    if (!r.overlay || S.lastView !== 'home') enterView($('view-' + r.name), r.name, dir);
    if (adsOn() && window.NMT && NMT.ads) NMT.ads.onRoute(r.name);
  }
  function enterView(el, name, dir) {   // animate only when the screen actually changed (not on data refreshes / language switches)
    var changed = S.lastView !== name; S.lastView = name;
    if (!changed || reduced()) return;
    var cls = dir === 'push' ? 'go-push' : dir === 'pop' ? 'go-pop' : dir === 'up' ? 'go-up' : 'go-fade';
    if (name.indexOf('station:') === 0) cls = 'go-up';
    play(el, cls, 800);
    if (name === 'gate') stagger(el.querySelectorAll('#gate-title, #gate-lead, .gate-why, #gate-btn, #gate-note'));
    if (name === 'howto') stagger(el.querySelectorAll('#tut-art, #tut-title, #tut-text, #tut-next, .tut-row'));
    if (name === 'onboarding') stagger(el.querySelectorAll('#onb-title, #onb-sub, #onb-fuels .bigopt, #onb-more, #onb-loc'));
    if (name === 'board') stagger(el.querySelectorAll('#board-list .brow'));
    if (name === 'premium') stagger(el.querySelectorAll('#premium-list > *'));
    if (name === 'pick') stagger(el.querySelectorAll('#pick-list .bigopt'));
    if (name === 'settings') stagger(el.querySelectorAll('main.pad > *'));
    if (name.indexOf('station:') === 0) stagger($('sheet-body').children, 1100, 7);
    if (name === 'home' && dir === 'fade') stagger(homeCards());
  }
  function rollDist(el, key, km) {   // distance rolls only while the unit stays the same (m -> m, km -> km)
    var prev = S.rollSeen[key], unit = N.distanceParts(km).unit, from = prev === undefined ? km * 0.85 : prev;
    S.rollSeen[key] = km; if (!el || N.distanceParts(from).unit !== unit) return;
    M.roll(el, from, km, function (v) { return String(N.distanceParts(v).value); });
  }
  function homeCards() { var v = $('view-home'); return Array.prototype.slice.call(v.querySelectorAll('main.pad > :not(#home-skel):not(.list-head):not(#station-list), #station-list > .row')); }


  // ---------- first-run tutorial / "How to use": 4 pages, one idea each (owner rule v18). Same screen for the first run and the menu replay. ----------
  // First run: shown once BEFORE the sign-in gate (Skip / Next both end at the gate; flag nmt.tutorial). Replay: menu > How to use (#/howto), closes back to where you were.
  var TUT_N = 4;
  function tutArt(i) {   // simple illustrated cards made of the app's own icons and words (no screenshots: nothing to translate or go stale)
    if (i === 0) return '<span class="tut-ic">' + ico('pin') + '</span><span class="tut-chip">' + ico('pin') + '<span>' + esc(t('home.locate')) + '</span></span>';
    if (i === 1) return '<span class="tut-ic">' + ico('tag') + '</span><span class="tut-seg"><span class="on">' + esc(t('home.sort.near')) + '</span><span>' + esc(t('home.sort.cheap')) + '</span></span>';
    if (i === 2) return ['ok', 'low', 'out'].map(function (st) { return '<span class="pill st-' + st + '">' + sIco(st) + '<span>' + esc(t('status.' + st)) + '</span></span>'; }).join('');
    return '<span class="tut-chip pri">' + ico('nav') + '<span>' + esc(t('detail.navigate')) + '</span></span><span class="tut-duo"><span class="tut-ic sm">' + ico('star') + '</span><span class="tut-ic sm">' + ico('bell') + '</span></span>';
  }
  function renderTutorial(dir) {
    var i = Math.max(0, Math.min(TUT_N - 1, S.tutI || 0)), first = S.tutMode === 'first', last = i === TUT_N - 1;
    S.tutI = i; document.documentElement.lang = I.lang();
    setText('tut-brand', t('app.name')); setText('tut-title', t('tut.' + (i + 1) + '.t')); setText('tut-text', t('tut.' + (i + 1) + '.p'));
    $('tut-art').innerHTML = tutArt(i); $('tut-art').setAttribute('data-p', String(i + 1));
    var dots = ''; for (var k = 0; k < TUT_N; k++) dots += '<i' + (k === i ? ' class="on"' : '') + '></i>';
    $('tut-dots').innerHTML = dots; $('tut-dots').setAttribute('aria-label', t('tut.page', { n: i + 1, m: TUT_N })); $('tut-dots').setAttribute('data-i', String(i + 1));
    $('tut-next').innerHTML = '<span>' + esc(t(last ? (first ? 'tut.start' : 'tut.done') : 'tut.next')) + '</span>' + ico(last ? 'check' : 'chev');
    var bk = $('tut-back'); bk.hidden = i === 0; bk.innerHTML = ico('back') + '<span>' + esc(t('common.back')) + '</span>';
    var sk = $('tut-skip'); sk.hidden = last; sk.innerHTML = ico(first ? 'skip' : 'close') + '<span>' + esc(t(first ? 'tut.skip' : 'common.close')) + '</span>';
    $('tut-page').setAttribute('data-p', String(i + 1)); $('tut-page').classList.remove('m-screen-fwd', 'm-screen-back');
    if (dir) play($('tut-page'), dir === 'back' ? 'm-screen-back' : 'm-screen-fwd', 520);
  }
  function tutGo(d, gesture) {   // d = +1 / -1; only the last page's button finishes (a swipe or arrow key past the end does nothing, so it can never end it by accident)
    var n = (S.tutI || 0) + d;
    if (n >= TUT_N) return gesture ? undefined : tutFinish();
    if (n < 0) return;
    S.tutI = n; renderTutorial(d > 0 ? 'fwd' : 'back');
  }
  function tutFinish() {
    store.setItem(LS.tut, '1');
    if (S.tutMode === 'first') { S.tutI = 0; S.navDir = 'push'; history.replaceState(null, '', location.pathname + location.search + '#/'); route(); }
    else back();
  }
  $('tut-next').onclick = function () { tutGo(1); }; $('tut-back').onclick = function () { tutGo(-1); }; $('tut-skip').onclick = tutFinish;
  (function () {   // swipe left/right on the page (touch or mouse); the buttons always work too
    var pg = $('tut-page'), x0 = null, y0 = 0;
    pg.addEventListener('pointerdown', function (e) { x0 = e.clientX; y0 = e.clientY; });
    pg.addEventListener('pointerup', function (e) { if (x0 === null) return; var dx = e.clientX - x0, dy = e.clientY - y0; x0 = null; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) tutGo(dx < 0 ? 1 : -1, true); });
    pg.addEventListener('pointercancel', function () { x0 = null; });
    document.addEventListener('keydown', function (e) { if (S.route === 'howto' && !$('view-howto').hidden && !(window.NMT && $('lang-sheet') && !$('lang-sheet').hidden)) { if (e.key === 'ArrowRight') tutGo(1, true); else if (e.key === 'ArrowLeft') tutGo(-1, true); } });
  })();

  // ---------- onboarding: one tap on the fuel ----------
  var menu = null, upd = null;
  function fuelButton(f, cls, selected) {
    var hint = FUEL_HINT[f] ? '<small>' + esc(t(FUEL_HINT[f])) + '</small>' : '';
    return '<button type="button" role="radio" aria-checked="' + (selected === f) + '" class="' + cls + (selected === f ? ' on' : '') + '" data-fuel="' + f + '">' + ico('fuel') + '<span class="lbl">' + esc(fuelName(f)) + hint + '</span><svg class="ic rb-go" aria-hidden="true"><use href="#i-chev"/></svg></button>';
  }
  function renderOnboarding() {
    setText('onb-title', t('onb.title')); setText('onb-sub', t('onb.sub')); setHtml('onb-loc', ico('pin') + '<span>' + esc(t('onb.loc')) + '</span>');
    var list = COMMON_FUELS.concat(S.onbMore ? OTHER_FUELS : []);
    $('onb-fuels').innerHTML = list.map(function (f) { return fuelButton(f, 'bigopt', null); }).join('');
    Array.prototype.forEach.call($('onb-fuels').querySelectorAll('[data-fuel]'), function (b) { b.onclick = function () { finishOnboarding(b.getAttribute('data-fuel')); }; });
    var more = $('onb-more'); more.hidden = S.onbMore; more.innerHTML = ico('plus') + '<span>' + esc(t('onb.more')) + '</span>' + ico('down');
    document.documentElement.lang = I.lang();
  }
  function finishOnboarding(f) {
    S.fuel = f; store.setItem(LS.fuel, f); store.setItem(LS.onboarded, '1'); S.navDepth = 0; acct.localChange();
    history.replaceState(null, '', location.pathname + location.search + '#/'); route(); startLocation();
  }
  $('onb-more').onclick = function () { S.onbMore = true; renderOnboarding(); };

  // ---------- language button (in EVERY header) + language sheet ----------
  // The sheet is not a route: choosing a language re-renders the current screen in place (setLang -> route()), so no screen/state is lost.
  var ls = { open: false, opener: null, pushed: false };
  function paintLangButtons() {
    var cur = I.LANGS.filter(function (l) { return l.id === I.lang(); })[0];
    Array.prototype.forEach.call(document.querySelectorAll('[data-langbtn]'), function (b) {
      b.querySelector('.lb-t').textContent = cur.short; b.setAttribute('aria-label', t('lang.change') + ': ' + cur.label);
    });
    setText('onb-brand', t('app.name'));
  }
  function renderLangSheet() {
    setText('ls-title', t('lang.pick')); setText('ls-close-l', t('common.close'));
    $('ls-list').innerHTML = I.LANGS.map(function (l) {
      var on = l.id === I.lang();
      return '<button type="button" role="radio" aria-checked="' + on + '" class="opt' + (on ? ' on' : '') + '" data-l="' + l.id + '" lang="' + l.id + '">' + ico('globe') + '<span class="opt-l">' + esc(l.label) + '</span>' + (on ? sIco('ok') : '') + '</button>';
    }).join('');
    Array.prototype.forEach.call($('ls-list').querySelectorAll('[data-l]'), function (b) { b.onclick = function () { chooseLang(b.getAttribute('data-l')); }; });
  }
  function openLang(opener) {
    if (ls.open) return;
    ls.open = true; ls.opener = opener || null; renderLangSheet();
    var el = $('lang-sheet'); el.classList.remove('closing'); el.hidden = false; document.body.classList.add('noscroll');
    try { history.pushState({ nmtLang: 1 }, '', location.href); ls.pushed = true; } catch (e) { ls.pushed = false; }
    var cur = $('ls-list').querySelector('.on'); if (cur) cur.focus();
  }
  function closeLang(fromPop) {
    if (!ls.open) return;
    ls.open = false;
    var el = $('lang-sheet'), done = function () { el.hidden = true; el.classList.remove('closing'); };
    if (reduced()) done(); else { el.classList.add('closing'); setTimeout(done, 280); }
    if (!menuOpen()) document.body.classList.remove('noscroll');
    if (ls.pushed && !fromPop) { ls.pushed = false; history.back(); } else ls.pushed = false;
    var o = ls.opener; ls.opener = null; if (o && document.body.contains(o)) { try { o.focus({ preventScroll: true }); } catch (e) {} }
  }
  function chooseLang(l) {
    var changed = l !== I.lang();
    if (changed) setLang(l);
    closeLang();
  }
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-langbtn]'); if (b) { e.preventDefault(); openLang(b); } });
  $('ls-scrim').onclick = function () { closeLang(); }; $('ls-close').onclick = function () { closeLang(); };
  window.addEventListener('popstate', function () { if (ls.open) closeLang(true); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ls.open) { e.stopImmediatePropagation(); closeLang(); } }, true);

  function setLang(l) {
    I.setLang(l); store.setItem(LS.lang, l); applyStaticText(); if (menu) menu.onLang(); if (upd) upd.onLang(); route(); M.langFade(document.querySelector('.view:not([hidden])') || $('sheet'));
  }
  function applyStaticText() {
    document.documentElement.lang = I.lang(); document.title = t('app.name');
    paintLangButtons(); setText('brand-t', t('app.name')); setText('btn-menu-l', t('menu.open')); setText('btn-settings-l', t('home.settings'));
    setText('btn-map-l', t('home.map')); setText('btn-board-l', t('board.title')); setText('btn-premium-l', t('prem.title'));
    $('map').setAttribute('aria-label', t('map.attr'));
    backLabels();
  }

  // ---------- location ----------
  // Flow: permission status -> (plain-language ask card, only if not yet decided) -> OS permission -> position. Failures are named, never silent,
  // and always offer a retry; the app keeps working from the Pattaya fallback centre meanwhile. The position stays on the phone.
  var geo = N.Locate.create({
    plugin: window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Geolocation,
    geo: navigator.geolocation, perms: navigator.permissions, timeoutMs: cfg.locateTimeoutMs || 15000,
  });
  var locGen = 0;
  function fallbackLoc(state) { return { lat: cfg.fallbackCenter.lat, lng: cfg.fallbackCenter.lng, state: state }; }
  function startLocation(userTap) {
    var gen = ++locGen;
    S.loc = { lat: S.loc.lat, lng: S.loc.lng, state: 'wait' }; S.waitExpired = !!S.locFix; clearTimeout(S.waitT);
    if (!S.waitExpired) S.waitT = setTimeout(function () { S.waitExpired = true; if (S.loc.state === 'wait') repaintLoc(); }, 5000);
    repaintLoc();
    geo.status().then(function (st) {
      if (gen !== locGen) return;
      if (st === 'unsupported') return locFail('unsupported');
      if (st === 'granted') return locFind(gen);
      if (!userTap) { if (st === 'denied') return locFail('denied'); S.loc.state = 'ask'; repaintLoc(); return; }   // undecided: explain first
      return locAllow(gen);
    });
  }
  function locAllow(gen) {   // the user agreed (pressed allow / my-location): now ask the OS
    geo.request().then(function (st) { if (gen !== locGen) return; if (st === 'denied') locFail('denied'); else locFind(gen); });
  }
  function locFind(gen) {
    geo.locate().then(function (p) {
      if (gen !== locGen) return;
      var near = Infinity;
      ((S.data && S.data.stations) || []).forEach(function (s) { near = Math.min(near, N.haversineKm(p, s)); });
      if (S.data && near > cfg.coverageKm) { S.locFix = null; return locFail('far'); }
      S.locFix = { lat: p.lat, lng: p.lng }; S.mapToUser = true; S.loc = { lat: p.lat, lng: p.lng, state: 'gps' }; S.showAll = false; repaintLoc();
    }, function (e) { if (gen === locGen) locFail(e && e.code ? e.code : 'unavailable'); });
  }
  function locFail(why) {
    if (['denied', 'off', 'timeout', 'unavailable', 'unsupported', 'far', 'later'].indexOf(why) < 0) why = 'unavailable';
    S.locFix = null; S.loc = fallbackLoc(why); repaintLoc();
  }
  function repaintLoc() { if (S.route === 'map') renderMapView(); else renderHome(); }
  function renderLocNote() {
    var st = S.loc.state, failed = ['denied', 'off', 'timeout', 'unavailable', 'unsupported', 'far', 'later'].indexOf(st) >= 0;
    var key = { gps: 'loc.gps', wait: 'loc.wait' }[st] || ('loc.' + st);
    var e = $('loc-note'); e.textContent = t(key); e.setAttribute('data-state', st); e.hidden = !(failed || st === 'wait');
    var ask = $('loc-ask'); ask.hidden = st !== 'ask';
    if (st === 'ask') { setText('loc-ask-t', t('loc.ask.title')); setText('loc-ask-p', t('loc.ask.text')); $('loc-ask-yes').innerHTML = ico('pin') + '<span>' + esc(t('loc.ask.allow')) + '</span>'; setHtml('loc-ask-no', ico('clock') + '<span>' + esc(t('loc.ask.later')) + '</span>'); }
    var b = $('btn-locate'); b.hidden = st === 'ask'; b.disabled = st === 'wait';
    b.innerHTML = ico('pin') + '<span>' + esc(t(st === 'wait' ? 'loc.finding' : failed ? 'loc.retry' : 'home.locate')) + '</span>';
  }
  $('btn-locate').onclick = function () { startLocation(true); };
  $('map-locate').onclick = function () { S.mapToUser = true; startLocation(true); };
  $('loc-ask-yes').onclick = function () { S.loc.state = 'wait'; repaintLoc(); locAllow(locGen); };
  $('loc-ask-no').onclick = function () { locFail('later'); };

  // ---------- data ----------
  function refreshStock() { S.stockMap = N.mergeReports(S.data ? S.data.reports : [], D.listReports(store)); }
  function stockFn(id, fuel) { return N.stockInfo(S.stockMap, id, fuel, Date.now(), cfg.stockFreshHours); }
  function load() {
    return D.loadAll(env).then(function (d) {
      S.data = d; refreshStock(); route(); acct.checkAlerts(); acct.scheduleSync(800); return D.flushReports(env).then(function () { if (S.route === 'settings') renderSettings(); });
    }).catch(function (e) {
      console.error('load failed', e);
      $('home-skel').hidden = true; $('hero').hidden = false; $('hero').innerHTML = '<p class="lead">' + esc(t('err.load')) + '</p><button class="btn primary xl" id="btn-retry">' + ico('refresh') + '<span>' + esc(t('common.retry')) + '</span></button>';
      var b = $('btn-retry'); if (b) b.onclick = load;
    });
  }
  function isOffline() { return navigator.onLine === false || !!(S.data && S.data.liveFailed); }
  function renderBanners() {
    var show = !!S.data && isOffline(), text = '';
    if (show) {
      var src = S.data.source.prices, time = S.data.pricesFetchedAt ? fmtTime(S.data.pricesFetchedAt) : '';
      var key = src === 'sample' ? 'offline.sample' : (navigator.onLine === false ? 'offline.cache' : 'offline.server');
      text = t(key, { time: time });
    }
    ['offline-banner', 'offline-banner-2', 'offline-banner-3'].forEach(function (id) {
      var e = $(id); e.hidden = !show; e.innerHTML = show ? ico('wifi-off') + '<span>' + esc(text) + '</span>' : ''; e.setAttribute('data-source', S.data ? S.data.source.prices : '');
    });
  }
  window.addEventListener('online', function () { load(); });
  window.addEventListener('offline', function () { renderBanners(); });

  // ---------- home ----------
  function rows() {
    var o = { stations: S.data.stations, prices: S.data.prices, loc: S.loc, fuel: S.fuel, brand: S.brand, sort: S.sort, radiusKm: cfg.nearbyRadiusKm, stock: stockFn };
    var rs = N.buildRows(o);
    if (!rs.length) rs = N.buildRows(Object.assign(o, { radiusKm: cfg.coverageKm }));   // quiet area: widen the search instead of showing nothing
    return rs.slice(0, cfg.maxRows || 60);
  }
  function navHref(s) { return N.navLinks(s, s.name).geo; }
  function renderHome() {
    if (!S.data || $('view-home').hidden) return;
    var firstPaint = !$('home-skel').hidden; $('home-skel').hidden = true; $('view-home').removeAttribute('aria-busy');
    applyStaticText(); renderBanners(); renderLocNote();
    setText('fuel-row-l', t('home.myFuel')); setText('fuel-pill-name', fuelName(S.fuel)); setHtml('fuel-row-go', esc(t('home.change')) + ico('chev'));
    $('fuel-row').setAttribute('aria-label', t('home.myFuel') + ': ' + fuelName(S.fuel) + ' — ' + t('home.change'));
    $('sort-seg').innerHTML = N.SORTS.map(function (s) { return '<button type="button" role="radio" data-sort="' + s + '" class="' + (S.sort === s ? 'on' : '') + '" aria-checked="' + (S.sort === s) + '">' + ico(SORT_ICON[s]) + '<span>' + esc(t('home.sort.' + s)) + '</span>' + (S.sort === s ? sIco('ok') : '') + '</button>'; }).join('');
    Array.prototype.forEach.call($('sort-seg').querySelectorAll('[data-sort]'), function (b) { b.onclick = function () { S.sort = b.getAttribute('data-sort'); S.showAll = false; S.popSort = true; store.setItem(LS.sort, S.sort); renderHome(); }; });
    var sortChanged = S.popSort;
    if (S.popSort) { S.popSort = false; var on = $('sort-seg').querySelector('button.on'); if (on) play(on, 'pop', 600); }
    var sn = $('sample-note'); sn.hidden = !S.data.isSample; sn.innerHTML = ico('flask') + '<span>' + esc(t('sample.note')) + '</span>';

    var rs = rows(), hero = rs[0];
    var he = $('hero');
    if (!hero) { he.hidden = false; he.removeAttribute('data-id'); he.innerHTML = '<p class="lead">' + esc(t('home.empty')) + '</p>'; }
    else {
      var s = hero.station, b = brandById(s.brand), st = hero.stock;
      var swapped = S.heroId !== null && S.heroId !== s.id; S.heroId = s.id;
      var tp = hero.price ? numClass('hp:' + s.id + ':' + S.fuel, hero.price.price) : '', td = numClass('hd:' + s.id, Math.round(hero.km * 10));
      tp = ''; td = '';   // v15: the digits roll (NMT.motion.roll) instead of sliding
      he.hidden = false; he.setAttribute('data-id', s.id); he.style.setProperty('--c', b.color);
      var price = hero.price
        ? '<div class="num"><b class="big' + tp + '" id="hero-price" data-price="' + hero.price.price + '">' + N.formatPrice(hero.price.price) + '</b><span class="unit">' + esc(t('home.unitL')) + '</span></div>'
        : '<div class="num"><b class="big none" id="hero-price">–</b><span class="unit">' + esc(t('home.noPrice')) + '</span></div>';
      he.innerHTML =
        '<p class="hero-k" id="hero-kind">' + esc(t(S.sort === 'cheap' ? 'home.hero.cheap' : 'home.hero.near')) + '</p>' +
        '<h2 class="hero-name" id="hero-name">' + esc(s.name) + '</h2>' +
        '<p class="sub"><span class="bchip" style="background:' + b.color + ';color:' + (b.ink || '#fff') + '">' + esc(brandName(b)) + '</span> ' + esc(s.tambon) + '</p>' +
        '<div class="nums"><div class="num"><b class="big' + td + '" id="hero-dist" data-km="' + hero.km.toFixed(3) + '">' + esc(distNum(hero.km)) + '</b><span class="unit">' + esc(distUnit(hero.km)) + '</span></div>' + price + '</div>' +
        '<p class="stline">' + pillHtml(st.status, ' id="hero-status"') + '<span class="last">' + esc(lastText(st)) + '</span></p>' +
        '<a class="btn primary xl" id="hero-nav" href="' + esc(navHref(s)) + '">' + ico('nav') + '<span>' + esc(t('detail.navigate')) + '</span></a>' +
        '<button type="button" class="btn outline wide" id="hero-detail">' + ico('info') + '<span>' + esc(t('home.details')) + '</span></button>';
      $('hero-detail').onclick = function () { go('#/station/' + encodeURIComponent(s.id)); };
      if (hero.price) rollNum($('hero-price'), 'rp:' + s.id + ':' + S.fuel, hero.price.price, function (v) { return N.formatPrice(Math.round(v * 100) / 100); }, Math.round(hero.price.price * 93) / 100);
      rollDist($('hero-dist'), 'rd:' + s.id, hero.km);
      pillPop(he, 'h:' + s.id + ':' + S.fuel, st.status, '#hero-status');
      if (swapped) play(he, 'swap', 600);
    }
    // other stations: a short list first, the rest on request
    setText('list-title', t('home.others'));
    setText('btn-brand-l', t('home.brand')); setText('btn-brand-v', S.brand === 'all' ? t('home.brand.all') : brandName(brandById(S.brand)));
    var others = rs.slice(1), shown = S.showAll ? others : others.slice(0, 4);
    var every = (cfg.ads && cfg.ads.nativeEvery) || 5;
    $('station-list').innerHTML = others.length ? shown.map(function (r, idx) {
      var s = r.station, b = brandById(s.brand), st = r.stock;
      var price = r.price ? '<b class="pv">' + N.formatPrice(r.price.price) + '</b><small>' + esc(t('home.unitL')) + '</small>' : '<b class="pv none">–</b><small>' + esc(t(officialPrice(s.brand) ? 'home.noPrice' : 'home.noOfficial')) + '</small>';
      return '<button type="button" class="row" style="--c:' + b.color + '" data-id="' + esc(s.id) + '" data-price="' + (r.price ? r.price.price : '') + '" data-km="' + r.km.toFixed(3) + '">' +
        '<span class="info"><b class="name">' + esc(s.name) + '</b>' +
        '<span class="sub">' + esc(brandName(b)) + '</span>' + pillHtml(st.status) + '</span>' +
        '<span class="pr"><b class="dist">' + esc(fmtDist(r.km)) + '</b>' + price + '</span></button>' +
        (S.showAll && (idx + 1) % every === 0 && idx < shown.length - 1 ? adHtml('native') : '');   // never right after the last row (the "show less" button follows)
    }).join('') : '';
    var sa = $('btn-showall'); sa.hidden = others.length <= 4;
    sa.innerHTML = S.showAll ? ico('up') + '<span>' + esc(t('home.showLess')) + '</span>' : ico('list') + '<span>' + esc(t('home.showAll', { n: others.length })) + '</span>' + ico('down');
    Array.prototype.forEach.call($('station-list').querySelectorAll('.row'), function (b) { b.onclick = function () { go('#/station/' + encodeURIComponent(b.getAttribute('data-id'))); }; });
    var holdSt = S.loc.state, holding = (holdSt === 'wait' && !S.waitExpired) || holdSt === 'ask';   // do not show Pattaya rows while we are still finding / asking
    ['hero', 'station-list', 'btn-showall', 'list-title', 'btn-brand'].forEach(function (id) { if (holding) $(id).hidden = true; else if (id !== 'hero' && id !== 'btn-showall') $(id).hidden = false; });
    $('home-skel').hidden = !(holding && holdSt === 'wait');
    adsMount();
    if (firstPaint && !holding) stagger(homeCards());
    else if (sortChanged && !holding) { play($('hero'), 'swap', 600); stagger($('station-list').querySelectorAll('.row')); }   // tab-like switch Nearest <-> Cheapest: the new order glides in
  }
  $('btn-showall').onclick = function () { S.showAll = !S.showAll; renderHome(); if (S.showAll) stagger($('station-list').querySelectorAll('.row:nth-child(n+5)')); else M.scrollTo($('sort-seg'), 'nearest'); };   // collapsing glides back up to the list top
  $('fuel-row').onclick = function () { go('#/pick/fuel'); };
  $('btn-brand').onclick = function () { go('#/pick/brand'); };
  $('btn-map').onclick = function () { go('#/map'); };
  $('btn-board').onclick = function () { go('#/board'); };
  $('btn-premium').onclick = function () { go('#/premium'); };
  $('btn-settings').onclick = function () { go('#/settings'); };

  // ---------- map (separate screen) ----------
  function renderMapView() {
    setText('map-title', t('map.title')); applyStaticText();
    var ms = S.loc.state, mfailed = ['denied', 'off', 'timeout', 'unavailable', 'unsupported', 'far', 'later'].indexOf(ms) >= 0, mb = $('map-locate');
    var mn = $('map-note'); mn.hidden = !(mfailed || ms === 'wait' || ms === 'ask'); mn.textContent = t(ms === 'ask' ? 'loc.later' : ms === 'wait' ? 'loc.wait' : 'loc.' + ms); mn.setAttribute('data-state', ms);
    mb.disabled = ms === 'wait'; mb.innerHTML = ico('pin') + '<span>' + esc(t(ms === 'wait' ? 'loc.finding' : mfailed || ms === 'ask' ? 'loc.retry' : 'home.locate')) + '</span>';
    if (typeof L === 'undefined' || !S.data) return;
    var rs = rows();
    if (!S.map) {
      S.map = L.map('map', { zoomControl: true, attributionControl: true, tap: true, zoomAnimation: !reduced(), fadeAnimation: !reduced(), markerZoomAnimation: !reduced(), easeLinearity: 0.2 }).setView([S.loc.lat, S.loc.lng], cfg.mapZoom);
      S.map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
      var tiles = L.tileLayer(cfg.tileUrl, { maxZoom: cfg.tileMaxZoom, attribution: cfg.tileAttribution }).addTo(S.map), mapEl = $('map'), mapDone = function () { mapEl.classList.remove('map-loading'); };
      if (!reduced()) { mapEl.classList.add('map-loading'); tiles.once('load', mapDone); setTimeout(mapDone, 4000); }   // shimmer behind the tiles until they arrive (never longer than 4 s)
    }
    S.map.invalidateSize();
    Object.keys(S.markers).forEach(function (k) { S.map.removeLayer(S.markers[k]); }); S.markers = {};
    var pts = [[S.loc.lat, S.loc.lng]];
    rs.slice().sort(function (a, b) { return a.km - b.km; }).forEach(function (r) { pts.push([r.station.lat, r.station.lng]); });
    rs.slice(0, 40).forEach(function (r, idx) {
      var s = r.station, b = brandById(s.brand);
      var label = r.price ? N.formatPrice(r.price.price) : '–';
      var icon = L.divIcon({ className: 'nmt-pin-wrap', iconSize: null, html: '<span class="nmt-pin" data-id="' + esc(s.id) + '" style="--c:' + b.color + ';--ink:' + (b.ink || '#fff') + ';--d:' + Math.min(idx, 10) * 36 + 'ms">' + label + '</span>' });
      var m = L.marker([s.lat, s.lng], { icon: icon, keyboard: false, title: s.name }).addTo(S.map);
      m.on('click', function () { go('#/station/' + encodeURIComponent(s.id)); });
      S.markers[s.id] = m;
    });
    if (S.userMarker) S.map.removeLayer(S.userMarker);
    S.userMarker = null;
    if (ms === 'gps') {   // "you are here" only for a real GPS fix, never for the Pattaya fallback centre
      S.userMarker = L.marker([S.loc.lat, S.loc.lng], { icon: L.divIcon({ className: 'nmt-me-wrap', iconSize: null, html: '<span class="nmt-me" data-me="1"><i></i><b>' + esc(t('map.you')) + '</b></span>' }), keyboard: false, interactive: false, zIndexOffset: 1000, title: t('map.you') }).addTo(S.map);
    }
    var key = S.loc.lat.toFixed(4) + ',' + S.loc.lng.toFixed(4) + '|' + S.brand + '|' + rs.length;
    if (ms === 'gps' && S.mapToUser) { S.mapToUser = false; S.lastMapKey = key; S.map.setView([S.loc.lat, S.loc.lng], 14, { animate: !reduced() }); }
    else if (ms !== 'wait' && key !== S.lastMapKey) { S.lastMapKey = key; S.map.fitBounds(pts.slice(0, 6), { padding: [60, 60], maxZoom: 15 }); }
  }
  $('map-back').onclick = back;

  // ---------- price board ----------
  function chgHtml(x) {   // "down 1.00" / "same" / "no yesterday data" with arrow + colour class (board and premium view)
    var cls = 'same', txt = t('board.same'), mk = '';
    if (x.diff == null) { cls = 'unk'; txt = t('board.unknownChange'); }
    else if (x.diff > 0) { cls = 'up'; txt = t('board.up') + ' ' + N.formatDiff(x.diff).replace('+', ''); mk = ico('up'); }
    else if (x.diff < 0) { cls = 'down'; txt = t('board.down') + ' ' + N.formatDiff(x.diff).replace('−', ''); mk = ico('down'); }
    return '<span class="chg ' + cls + '" data-dir="' + cls + '">' + mk + '<span>' + esc(txt) + '</span></span>';
  }
  // ---------- premium products: every premium product as sold, by grade (owner request 2026-11-01) ----------
  // Data: prices.products from the Worker. Brands without data are simply not there (no invented rows). Reports/favourites stay at premium_gas / premium_diesel level (see docs/decisions.md #36).
  function renderPremium() {
    if (!S.data) return;
    applyStaticText(); renderBanners();
    setText('premium-title', t('prem.title')); setText('premium-lead', t('prem.lead'));
    var p = S.data.prices, th = I.lang() === 'th', groups = N.premiumGroups(p);
    setText('premium-date', t('board.date', { date: p.date ? fmtDate(p.date) : '' }) + (S.data.isSample ? ' · ' + t('sample.badge') : ''));
    $('premium-list').innerHTML = groups.length ? groups.map(function (g) {
      var min = g.items[0].price;
      return '<section class="pgroup" data-group="' + g.group + '"><h2 class="prem-h">' + esc(t('prem.g.' + g.group)) + '</h2><div class="stack">' + g.items.map(function (x) {
        var b = brandById(x.brand), tag = g.items.length > 1 && x.price === min ? '<span class="tag">' + sIco('ok') + esc(t('board.cheapest')) + '</span>' : '';
        return '<div class="brow prow" style="--c:' + b.color + '" data-brand="' + esc(x.brand) + '" data-product="' + esc(x.id) + '"><div class="bn"><b>' + esc(brandName(b)) + '</b><span class="pname">' + esc(th ? x.name.th : x.name.en) + '</span>' + tag + '</div>' +
          '<div class="bv"><b class="bp" data-price="' + x.price + '">' + N.formatPrice(x.price) + '</b><small>' + esc(t('home.unitL')) + '</small></div>' + chgHtml(x) + '</div>';
      }).join('') + '</div></section>';
    }).join('') : '<p class="lead" id="premium-none">' + esc(t('prem.none')) + '</p>';
    setText('premium-note', t('prem.note') + ' ' + t('board.note'));
  }
  function renderBoard() {
    if (!S.data) return;
    applyStaticText(); renderBanners();
    setText('board-title', t('board.title'));
    setText('board-fuel-l', t('home.myFuel')); setText('board-fuel-v', fuelName(S.fuel)); setHtml('board-fuel-go', esc(t('home.change')) + ico('chev'));
    var p = S.data.prices;
    setText('board-date', t('board.date', { date: p.date ? fmtDate(p.date) : '' }) + (S.data.isSample ? ' · ' + t('sample.badge') : ''));
    var br = N.boardRows(p, S.data.brands.filter(function (b) { return !b.noBoard; }), S.fuel), minBoard = br[0] && br[0].p ? br[0].p.price : null;
    var boardEnter = S.lastView !== 'board';
    $('board-list').innerHTML = br.map(function (r) {
      var b = r.brand, x = r.p, right = '', chg = '';
      if (x) {
        chg = chgHtml(x);
        right = '<b class="bp" data-price="' + x.price + '">' + N.formatPrice(x.price) + '</b><small>' + esc(t('home.unitL')) + '</small>';
      } else right = '<span class="muted">' + esc(t('board.none')) + '</span>';
      var tag = (x && x.price === minBoard) ? '<span class="tag">' + sIco('ok') + esc(t('board.cheapest')) + '</span>' : '';
      return '<div class="brow' + (x ? '' : ' na') + '" style="--c:' + b.color + '" data-brand="' + esc(b.id) + '"><div class="bn"><b>' + esc(brandName(b)) + '</b>' + tag + (x && x.product ? '<small class="prod">' + esc(x.product) + '</small>' : '') + '</div><div class="bv">' + right + '</div>' + chg + '</div>';
    }).join('');
    if (boardEnter) Array.prototype.forEach.call($('board-list').querySelectorAll('.bp'), function (el) {   // yesterday's price -> today's price
      var to = parseFloat(el.getAttribute('data-price')), row = br.filter(function (r) { return r.brand.id === el.closest('.brow').getAttribute('data-brand'); })[0], d = row && row.p ? row.p.diff : null;
      if (d) M.roll(el, Math.round((to - d) * 100) / 100, to, function (v) { return N.formatPrice(Math.round(v * 100) / 100); });
    });
    if (adsOn()) {   // bottom banner bar: created once, space reserved from the first paint (no layout jump)
      var ab = $('ad-board'); if (!ab) { $('view-board').insertAdjacentHTML('beforeend', adHtml('banner').replace('<aside class="ad-slot', '<aside id="ad-board" class="ad-slot')); ab = $('ad-board'); }
      ab.setAttribute('aria-label', t('ad.label')); ab.querySelector('.ad-tag').textContent = t('ad.label');
      var bd = ab.querySelector('.ad-body b'); if (bd) bd.textContent = t('ad.sample');
      adsMount();
    }
    setText('board-note', t('board.note'));
    var stale = S.data.pricesFetchedAt && !S.data.isSample && (Date.now() - S.data.pricesFetchedAt > cfg.priceStaleHours * 3600000);
    var se = $('board-stale'); se.hidden = !stale; se.textContent = t('board.stale');
  }
  $('board-fuel').onclick = function () { go('#/pick/fuel'); };
  $('board-back').onclick = back; $('premium-back').onclick = back; $('set-back').onclick = back; $('pick-back').onclick = back;

  // ---------- pickers: fuel / language / brand ----------
  function renderPick(kind) {
    applyStaticText();
    var opts, cur, attr, title = t('pick.' + kind);
    if (kind === 'fuel') { opts = N.FUELS.map(function (f) { return { v: f, label: fuelName(f), hint: FUEL_HINT[f] ? t(FUEL_HINT[f]) : '' }; }); cur = S.fuel; attr = 'data-fuel'; }
    else if (kind === 'lang') { opts = I.LANGS.map(function (l) { return { v: l.id, label: l.label }; }); cur = I.lang(); attr = 'data-lang'; }
    else {
      var present = {}; ((S.data && S.data.stations) || []).forEach(function (s) { present[s.brand] = 1; });
      opts = [{ v: 'all', label: t('home.brand.all') }].concat(((S.data && S.data.brands) || []).filter(function (b) { return present[b.id]; }).map(function (b) { return { v: b.id, label: brandName(b), color: b.color }; }));
      cur = S.brand; attr = 'data-brand';
    }
    setText('pick-title', title);
    $('pick-list').innerHTML = opts.map(function (o) {
      return '<button type="button" role="radio" aria-checked="' + (cur === o.v) + '" class="bigopt' + (cur === o.v ? ' on' : '') + '" ' + attr + '="' + esc(o.v) + '"' + (o.color ? ' style="--c:' + o.color + '"' : '') + '>' + ico(kind === 'fuel' ? 'fuel' : kind === 'lang' ? 'globe' : o.v === 'all' ? 'list' : 'tag') + '<span class="lbl">' + esc(o.label) + (o.hint ? '<small>' + esc(o.hint) + '</small>' : '') + '</span>' + (cur === o.v ? sIco('ok') : '') + '</button>';
    }).join('');
    Array.prototype.forEach.call($('pick-list').querySelectorAll('[' + attr + ']'), function (b) {
      b.onclick = function () {
        var v = b.getAttribute(attr);
        if (kind === 'fuel') { S.fuel = v; store.setItem(LS.fuel, v); S.reportFuel = null; acct.localChange(); }
        else if (kind === 'brand') { S.brand = v; S.showAll = false; }
        else setLang(v);
        back();
      };
    });
  }

  // ---------- settings ----------
  function renderSettings() {
    applyStaticText();
    setText('set-title', t('set.title')); setText('set-lang-h', t('set.language')); setText('set-fuel-h', t('set.fuel'));
    setText('set-lang-v', I.LANGS.filter(function (l) { return l.id === I.lang(); })[0].label); setText('set-fuel-v', fuelName(S.fuel));
    setText('set-pending', t('set.pending', { n: D.pendingCount(store) }));
    setText('set-acct-h', t('set.account')); var au = auth.user(); setText('set-acct-v', au ? (au.name || au.email) : '');
  }
  $('set-acct-row').onclick = function () { go('#/account'); };
  $('set-lang-row').onclick = function () { go('#/pick/lang'); };
  $('set-fuel-row').onclick = function () { go('#/pick/fuel'); };

  // ---------- station detail (full screen) ----------
  function openStation(id) {
    var s = S.data && S.data.stations.filter(function (x) { return x.id === id; })[0];
    if (!s) return false;
    if (S.stationId !== id) { S.reportFuel = null; S.otherReport = false; S.allFuels = false; }
    S.stationId = id; renderStation(s); $('sheet').hidden = false; applyStaticText();
    return true;
  }
  function renderStation(s) {
    var b = brandById(s.brand), d = N.haversineKm(S.loc, s), nav = N.navLinks(s, s.name);
    var fuels = N.fuelsOfBrand(S.data.prices, s.brand);
    if (!S.reportFuel || fuels.indexOf(S.reportFuel) < 0) S.reportFuel = fuels.indexOf(S.fuel) >= 0 ? S.fuel : (fuels[0] || S.fuel);
    var mine = N.priceFor(S.data.prices, s.brand, S.fuel), ms = stockFn(s.id, S.fuel);
    var priceBox = mine
      ? '<div class="num"><b class="big" id="detail-price">' + N.formatPrice(mine.price) + '</b><span class="unit">' + esc(t('home.unitL')) + '</span></div>'
      : '<div class="num"><span class="lead" id="detail-price-none">' + esc(t(officialPrice(s.brand) ? 'detail.noPrice' : 'detail.noOfficial', { fuel: fuelName(S.fuel) })) + '</span></div>';
    var stockRows = fuels.map(function (f) {
      var si = stockFn(s.id, f), pr = N.priceFor(S.data.prices, s.brand, f);
      return '<div class="srow" data-fuel="' + f + '"><div class="sf"><b>' + esc(fuelName(f)) + '</b><span class="last">' + esc(lastText(si)) + '</span></div>' +
        '<b class="pv2">' + (pr ? N.formatPrice(pr.price) : '–') + '</b>' + pillHtml(si.status) + '</div>';
    }).join('');
    var other = fuels.filter(function (f) { return f !== S.reportFuel; });
    var otherPick = S.otherReport ? '<div class="stack" id="report-fuels" role="radiogroup">' + fuels.map(function (f) { return '<button type="button" role="radio" aria-checked="' + (S.reportFuel === f) + '" class="opt' + (S.reportFuel === f ? ' on' : '') + '" data-rf="' + f + '">' + ico('fuel') + '<span class="opt-l">' + esc(fuelName(f)) + '</span>' + (S.reportFuel === f ? sIco('ok') : '') + '</button>'; }).join('') + '</div>' : '';
    $('sheet-body').innerHTML =
      '<h1 id="detail-name" class="st-name">' + esc(s.name) + '</h1>' +
      '<p class="sub"><span class="bchip" style="background:' + b.color + ';color:' + (b.ink || '#fff') + '">' + esc(brandName(b)) + '</span> ' + esc(s.tambon) + '</p>' +
      '<button type="button" id="fav-toggle" class="btn outline wide fav-btn' + (acct.isFav(s.id) ? ' on' : '') + '" aria-pressed="' + acct.isFav(s.id) + '">' + ico(acct.isFav(s.id) ? 'star-on' : 'star') + '<span>' + esc(t(acct.isFav(s.id) ? 'fav.remove' : 'fav.add')) + '</span></button>' +
      (S.data.isSample ? '<p class="note info">' + ico('flask') + '<span>' + esc(t('sample.badge')) + '</span></p>' : '') +
      '<section class="card key">' +
        '<div class="nums"><div class="num"><b class="big" id="detail-dist">' + esc(distNum(d)) + '</b><span class="unit">' + esc(distUnit(d)) + '</span></div>' + priceBox + '</div>' +
        (mine ? '<p class="note">' + esc(t('detail.price', { fuel: fuelName(S.fuel) }) + (mine.product ? ' · ' + mine.product : '')) + '</p><p class="stline">' + pillHtml(ms.status, ' id="detail-status"') + '<span class="last" id="detail-last">' + esc(lastText(ms)) + '</span></p>' : '') +
        '<a class="btn primary xl" id="nav-geo" href="' + esc(nav.geo) + '">' + ico('nav') + '<span>' + esc(t('detail.navigate')) + '</span></a>' +
        '<p class="note center">' + esc(t('detail.apps')) + '</p>' +
        '<div class="grid2"><a class="btn outline" id="nav-google" href="' + esc(nav.google) + '">' + ico('map') + '<span>' + esc(t('detail.google')) + '</span></a><a class="btn outline" id="nav-waze" href="' + esc(nav.waze) + '">' + ico('route') + '<span>' + esc(t('detail.waze')) + '</span></a></div>' +
      '</section>' +
      '<section class="card"><h2>' + esc(t('detail.reportTitle')) + '</h2><p class="lead">' + esc(t('detail.reportNow', { fuel: fuelName(S.reportFuel) })) + '</p>' +
      '<div class="stack">' + ['ok', 'low', 'out'].map(function (k) { return '<button type="button" class="rep-btn st-' + k + '" data-status="' + k + '">' + sIco(k) + '<span>' + esc(t('status.' + k)) + '</span></button>'; }).join('') + '</div>' +
      (fuels.length > 1 ? '<button type="button" class="btn outline wide" id="rf-toggle">' + ico('fuel') + '<span>' + esc(t('detail.otherFuel')) + '</span>' + (S.otherReport ? ico('up') : ico('down')) + '</button>' : '') + otherPick +
      '<p class="note">' + esc(t('detail.reportNote')) + '</p></section>' +
      '<button type="button" class="btn outline wide" id="allfuels-toggle">' + ico('list') + '<span>' + esc(t('detail.allFuels')) + '</span>' + (S.allFuels ? ico('up') : ico('down')) + '</button>' +
      '<div class="stock" id="stock-rows"' + (S.allFuels ? '' : ' hidden') + '>' + stockRows + '</div>';
    fuels.forEach(function (f) { pillPop($('sheet-body'), 'd:' + s.id + ':' + f, stockFn(s.id, f).status, '.srow[data-fuel="' + f + '"] .pill'); });
    pillPop($('sheet-body'), 'dm:' + s.id + ':' + S.fuel, ms.status, '#detail-status');
    $('fav-toggle').onclick = function () { var on = acct.toggleFavorite(s.id); renderStation(s); if (on) { var fb = $('fav-toggle'); play(fb, 'burst', 600); play(fb.querySelector('.ic'), 'starpop', 600); } toast(t(on ? 'fav.added' : 'fav.removed'), on); };
    var rt = $('rf-toggle'); if (rt) rt.onclick = function () { S.otherReport = !S.otherReport; renderStation(s); };
    $('allfuels-toggle').onclick = function () { S.allFuels = !S.allFuels; renderStation(s); };
    Array.prototype.forEach.call($('sheet-body').querySelectorAll('[data-rf]'), function (c) { c.onclick = function () { S.reportFuel = c.getAttribute('data-rf'); S.otherReport = false; renderStation(s); }; });
    Array.prototype.forEach.call($('sheet-body').querySelectorAll('.rep-btn'), function (btn) {
      btn.onclick = function () {
        D.addReport(store, s.id, S.reportFuel, btn.getAttribute('data-status'));
        var st = btn.getAttribute('data-status');
        refreshStock(); renderStation(s);
        var nb = $('sheet-body').querySelector('.rep-btn[data-status="' + st + '"]'); if (nb && !reduced()) nb.insertAdjacentHTML('beforeend', CHECK_SVG);
        D.flushReports(env).then(function (r) { toast(r.sent ? t('detail.reportSent') : t('detail.reportQueued'), true); if (S.route === 'settings') renderSettings(); });
      };
    });
  }
  $('sheet-close').onclick = back;
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menuOpen() && S.route !== 'home') back(); });

  // ---------- boot ----------
  function setFuelFromAccount(f) { f = N.normFuel(f); if (N.FUELS.indexOf(f) < 0) return; S.fuelBySync = true; S.fuel = f; store.setItem(LS.fuel, f); store.setItem(LS.onboarded, '1'); }
  function afterAuth() {   // signed in / signed out / account deleted: start again from the right screen
    S.navDepth = 0; S.lastView = null; S.homeY = 0; S.showAll = false; S.fuel = savedFuel(); S.heroId = null; S.numSeen = {}; S.pillSeen = {}; S.rollSeen = {};
    history.replaceState(null, '', location.pathname + location.search + '#/'); route(); menu.paintDots();
    if (auth.signedIn()) { if (store.getItem(LS.onboarded) === '1' && S.fuel) startLocation(); acct.checkAlerts(); acct.scheduleSync(3000); D.flushReports(env); }
  }
  function userLoc() { return { lat: S.loc.lat, lng: S.loc.lng }; }
  menu = N.menuInit({ t: t, esc: esc, store: store, cfg: cfg, env: env, go: go, back: back, replace: replace, openStore: function () { return upd ? upd.openStore() : undefined; }, alertCount: function () { return acct ? acct.alertCount() : 0; } });
  acct = N.acctInit({
    t: t, esc: esc, store: store, cfg: cfg, env: env, auth: auth, go: go, back: back, replace: replace, ico: ico, sIco: sIco, toast: toast, afterAuth: afterAuth,
    getData: function () { return S.data; }, getFuel: function () { return S.fuel; }, setFuel: setFuelFromAccount, stockFn: stockFn, menu: function () { return menu; }, userLoc: userLoc,
    fuelName: fuelName, brandById: brandById, brandName: brandName, fmtTime: fmtTime, fmtDate: fmtDate, fmtAgo: fmtAgo, loc: loc,
    onSynced: function () { if (S.fuelBySync) { S.fuelBySync = false; if (!menu.current()) route(); } if (menu.current() === 'account') menu.rerender(); menu.paintDots(); },
  });
  menu.setExtra(acct.panels);
  applyStaticText();
  route();
  upd = N.updateInit({ t: t, esc: esc, store: store, cfg: cfg, env: env, menuOpen: menuOpen, langOpen: function () { return ls.open; } });   // update notice + what's new (update.js); stays off while cfg.appVersionCode is 0
  adsBoot();
  auth.verify().then(function (ok) { if (!ok) afterAuth(); });
  window.addEventListener('online', function () { acct.scheduleSync(500); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { acct.scheduleSync(800); acct.checkAlerts(); } });
  load().then(function () { if (store.getItem(LS.onboarded) === '1' && auth.signedIn()) startLocation(); });
  window.__NMT = { state: S, reload: load, update: upd };   // handy for tests and debugging only
})();
