// น้ำมันถูก /join — language, 3 progress ticks (remembered on this phone), share, copy, reset. No tracking, no network calls. Motion comes from motion.js (shared v16).
(function () {
  'use strict';
  var I = window.JOIN_I18N || {}, LANGS = ['th', 'en', 'ko', 'zh', 'hi'], KEY = 'nmt.join.steps', LKEY = 'nmt.site.lang';
  var M = window.Motion, lang = window.__L || 'en';
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var done = { 1: false, 2: false, 3: false };
  try { var s = JSON.parse(localStorage.getItem(KEY) || '{}'); [1, 2, 3].forEach(function (n) { done[n] = !!s[n]; }); } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(done)); } catch (e) {} }
  function t(k) { return (I[lang] && I[lang][k] != null ? I[lang][k] : (I.th || {})[k]) || ''; }
  function count() { return [1, 2, 3].filter(function (n) { return done[n]; }).length; }

  function paintText() {
    $$('[data-t]').forEach(function (e) { var v = t(e.getAttribute('data-t')); if (e.textContent !== v) e.textContent = v; });
    $$('[data-alt]').forEach(function (e) { e.setAttribute('alt', t(e.getAttribute('data-alt'))); });
    $$('[data-aria]').forEach(function (e) { e.setAttribute('aria-label', t(e.getAttribute('data-aria'))); });
    var T = t('title'); document.title = T;
    [['meta[name=description]', t('desc')], ['meta[property="og:title"]', T], ['meta[property="og:description"]', t('desc')], ['meta[name="twitter:title"]', T], ['meta[name="twitter:description"]', t('desc')]].forEach(function (p) { var m = $(p[0]); if (m) m.setAttribute('content', p[1]); });
    $('#lang').value = lang;
    paintState();
  }
  function paintState() {
    var n = count();
    $$('.card').forEach(function (c) {
      var k = +c.getAttribute('data-step'); c.classList.toggle('done', done[k]);
      var b = $('.num', c); b.setAttribute('aria-pressed', done[k] ? 'true' : 'false'); b.setAttribute('aria-label', t('step').replace('{n}', k) + ' — ' + t(done[k] ? 'doneLab' : 'todoLab'));
    });
    $('#progTxt').textContent = t('prog').replace('{n}', n);
    $('#barFill').style.transform = 'scaleX(' + (n / 3) + ')';
    $('#all').hidden = n < 3;
  }
  function setLang(l, fade) {
    if (LANGS.indexOf(l) < 0) return; lang = l; document.documentElement.lang = l;
    try { localStorage.setItem(LKEY, l); } catch (e) {}
    paintText(); if (fade && M) M.langFade($('main'));
  }
  function mark(k, v) { var was = done[k]; done[k] = v; save(); paintState(); if (v && !was && M) { var b = $('#c' + k + ' .num'); M.pop(b); } }

  $('#lang').addEventListener('change', function () { setLang(this.value, true); });
  $$('.num').forEach(function (b) { b.addEventListener('click', function () { var k = +b.getAttribute('data-chk'); mark(k, !done[k]); }); });
  $$('[data-go]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var c = a.closest('.card');
      if (c && c.hasAttribute('data-locked')) { e.preventDefault(); var p = $('#pend'); if (p) { p.classList.remove('nudge'); void p.offsetWidth; p.classList.add('nudge'); if (M) M.scrollTo(p, 'center'); } return; }
      // the link opens in a new tab; when they come back we tick the step (they can untick with the number)
      setTimeout(function () { mark(+a.getAttribute('data-go'), true); }, 600);
    });
  });
  $('#reset').addEventListener('click', function () { done = { 1: false, 2: false, 3: false }; save(); paintState(); if (M) M.scrollTo($('#steps'), 'start'); });

  var url = location.origin + location.pathname.replace(/[^/]*$/, '') + 'join.html', note = $('#shareNote');
  function say(k) { note.textContent = t(k); clearTimeout(say._t); say._t = setTimeout(function () { note.textContent = ''; }, 3500); }
  $('#share').addEventListener('click', function () {
    var data = { title: t('shareTitle'), text: t('shareText'), url: url };
    if (navigator.share) { navigator.share(data).catch(function () {}); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { say('copied'); }, function () { say('copyFail'); });
    else say('copyFail');
  });
  // Facebook / Instagram / LINE / Messenger in-app browser (or any Android WebView): Google sign-in often fails there, so ask to open the page in Chrome first (fbclid alone is not enough: it also stays in the URL after Chrome opens it).
  var ua = navigator.userAgent || '', iab = $('#iab');
  if (iab && /Android/i.test(ua) && /FBAN|FBAV|FB_IAB|Instagram|\bLine\/|MessengerLite|; wv\)/i.test(ua)) {
    var pageUrl = location.href.split('#')[0];
    iab.hidden = false;
    $('#iabOpen').setAttribute('href', 'intent://' + pageUrl.replace(/^https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(pageUrl) + ';end');
    $('#iabCopy').addEventListener('click', function () {
      var n = $('#iabNote'), ok = function () { n.textContent = t('iabOk'); }, bad = function () { n.textContent = t('copyFail'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(pageUrl).then(ok, bad); else bad();
    });
  }
  paintText();
  document.documentElement.classList.remove('pl');   // text is final: show the page (the CSS also un-hides it after 1.5 s if this script ever fails)
})();
