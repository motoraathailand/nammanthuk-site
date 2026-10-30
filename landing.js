/* น้ำมันถูก intro page script (vanilla, no dependencies): language switch with crossfade, staggered hero entrance, scroll reveal (IntersectionObserver),
   animated counters, floating/tilting phone, screenshot carousel, fuel gauge, 3-step tabs, ripple, scroll progress. prefers-reduced-motion: no animation, no autoplay, final numbers at once. */
(function () {
  'use strict';
  var LS = window.LS || {}, doc = document, root = doc.documentElement;
  var rmq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false }, reduce = rmq.matches;
  if (rmq.addEventListener) rmq.addEventListener('change', function (e) { reduce = e.matches; });
  var $ = function (s, r) { return (r || doc).querySelector(s); }, $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };
  var lang = window.__L || 'th', ready = false;
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var shotLang = function (l) { return l === 'th' ? 'th' : 'en'; };   // Thai screenshots for Thai, English screenshots for the others
  function start() { root.classList.add('ready'); ready = true; $$('.hero .cnt').forEach(function (c) { runCount(c, 300); }); }
  if (doc.readyState === 'complete') requestAnimationFrame(start); else addEventListener('load', function () { requestAnimationFrame(start); });
  setTimeout(function () { if (!ready) start(); }, 2500);   // never leave the hero hidden if "load" is slow

  /* ---- animated counters: count up once when they first scroll into view (or at once in reduced motion) ---- */
  var nf = new Intl.NumberFormat('en-US');
  function fmt(c, v) { var d = +c.getAttribute('data-dec') || 0; return c.hasAttribute('data-sep') ? nf.format(Math.round(v)) : v.toFixed(d); }
  function runCount(c, delay) {
    if (c.__done) return; c.__done = true;
    var to = +c.getAttribute('data-to'), from = c.hasAttribute('data-from') ? +c.getAttribute('data-from') : 0;
    if (reduce) { c.textContent = fmt(c, to); return; }
    var dur = 1400, t0 = null; c.textContent = fmt(c, from);
    function step(t) { if (t0 === null) t0 = t + (delay || 0); var p = Math.min(1, Math.max(0, (t - t0) / dur)), e = 1 - Math.pow(1 - p, 4); c.textContent = fmt(c, from + (to - from) * e); if (p < 1) requestAnimationFrame(step); else c.textContent = fmt(c, to); }
    requestAnimationFrame(step);
  }
  $$('.cnt').forEach(function (c) { if (!c.closest('.hero')) c.textContent = fmt(c, c.hasAttribute('data-from') ? +c.getAttribute('data-from') : 0); });   // start from the "before" value; the real number is already in the HTML if JS is off

  /* ---- language (crossfade) ---- */
  function setShots(l) { $$('[data-shot]').forEach(function (img) { var src = 'img/' + shotLang(l) + '-' + img.getAttribute('data-shot') + '.webp'; if (img.getAttribute('src') !== src) img.src = src; }); }
  function paintLang(l) {
    var D = LS[l] || LS.th; if (!D) return; lang = l; root.lang = l;
    $$('[data-t]').forEach(function (el) { var k = el.getAttribute('data-t'); if (k in D) el.textContent = D[k]; });
    $$('[data-alt]').forEach(function (el) { var k = el.getAttribute('data-alt'); if (k in D) el.alt = D[k]; });
    $$('[data-alt-label]').forEach(function (el) { var k = el.getAttribute('data-alt-label'); if (k in D) el.setAttribute('aria-label', D[k]); });
    $$('[data-gp]').forEach(function (el) { el.setAttribute('aria-label', 'Google Play — ' + D.gpSoon); });
    setShots(l); doc.title = D.title; var m = $('meta[name=description]'); if (m) m.setAttribute('content', D.desc);
    var chip = function (q) { return '<span class="mq-chip">' + esc(q) + '</span>'; }, a = D.mq.slice(0, Math.ceil(D.mq.length / 2)), b = D.mq.slice(Math.ceil(D.mq.length / 2));
    $('#mq1').innerHTML = a.concat(a).map(chip).join(''); $('#mq2').innerHTML = b.concat(b).map(chip).join('');
    $('#mqList').innerHTML = D.mq.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('');
    $('#lang').value = l; setStep(step, true);
  }
  function applyLang(l, quick) {
    try { localStorage.setItem('nmt.site.lang', l); } catch (e) {}
    if (reduce || quick) return paintLang(l);
    root.classList.add('lsw'); setTimeout(function () { paintLang(l); requestAnimationFrame(function () { root.classList.remove('lsw'); }); }, 170);   // fade out, swap text, fade in (~340 ms in total)
  }
  $('#lang').addEventListener('change', function () { applyLang(this.value); });

  /* ---- scroll reveal ---- */
  $$('.stg').forEach(function (g) { $$(':scope > .rv', g).forEach(function (el, i) { el.style.setProperty('--d', (i * 0.09).toFixed(2) + 's'); }); });
  var rv = $$('.rv, .feat-vis');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (!e.isIntersecting) return; e.target.classList.add('in'); $$('.cnt', e.target).forEach(function (c) { runCount(c, 150); }); io.unobserve(e.target); }); }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    rv.forEach(function (el) { io.observe(el); });
  } else rv.forEach(function (el) { el.classList.add('in'); $$('.cnt', el).forEach(function (c) { runCount(c, 0); }); });

  /* ---- progress bar, header shadow, back-to-top, mobile bar, light parallax (one rAF per frame) ---- */
  var hd = $('#hd'), bar = $('#progress'), top = $('#totop'), stick = $('#stick'), tick = false;
  function onScroll() {
    tick = false; var y = window.pageYOffset || root.scrollTop, h = Math.max(1, root.scrollHeight - window.innerHeight);
    bar.style.transform = 'scaleX(' + Math.min(1, y / h).toFixed(4) + ')'; hd.classList.toggle('scrolled', y > 4);
    top.hidden = false; top.classList.toggle('show', y > 700); stick.classList.toggle('show', y > 420);
  }
  addEventListener('scroll', function () { if (!tick) { tick = true; requestAnimationFrame(onScroll); } }, { passive: true }); addEventListener('resize', onScroll); onScroll();
  top.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); });

  /* ---- hero phone: tilts toward the pointer (mouse/pen only) ---- */
  var box = $('#tiltBox'), tilt = $('#tilt');
  box.addEventListener('pointermove', function (e) { if (reduce || e.pointerType === 'touch') return; var r = box.getBoundingClientRect(); tilt.style.setProperty('--ry', (((e.clientX - r.left) / r.width - .5) * 16).toFixed(2) + 'deg'); tilt.style.setProperty('--rx', ((.5 - (e.clientY - r.top) / r.height) * 12).toFixed(2) + 'deg'); });
  box.addEventListener('pointerleave', function () { tilt.style.setProperty('--ry', '0deg'); tilt.style.setProperty('--rx', '0deg'); });

  /* ---- hero screenshot carousel: crossfade, dots, pauses off-screen / when the tab is hidden / after a tap ---- */
  var hs = $$('#heroStack > img'), hdots = $$('#heroDots button'), hcur = 0, htouched = false, hvis = true;
  function showHero(i) { hcur = i; hs.forEach(function (im, k) { if (k === i && im.loading === 'lazy') im.loading = 'eager'; im.classList.toggle('on', k === i); }); hdots.forEach(function (d, k) { d.classList.toggle('on', k === i); d.setAttribute('aria-current', k === i ? 'true' : 'false'); }); }
  hdots.forEach(function (d) { d.addEventListener('click', function () { htouched = true; showHero(+d.getAttribute('data-i')); }); });
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { hvis = es[0].isIntersecting; }, { threshold: 0.2 }).observe($('.hero-vis'));
  if (!reduce) setInterval(function () { if (!reduce && hvis && !htouched && !doc.hidden) showHero((hcur + 1) % hs.length); }, 3200);
  showHero(0);

  /* ---- fuel gauge: needle springs between มี / ใกล้หมด / หมด ---- */
  var needle = $('#needle'), chips = $$('#gChips .gc'), gcur = 0, gtouched = false, gvis = false, ANG = [-62, 0, 62];
  function setGauge(i) { gcur = i; needle.style.transform = 'rotate(' + ANG[i] + 'deg)'; chips.forEach(function (c, k) { c.classList.toggle('on', k === i); c.setAttribute('aria-pressed', k === i ? 'true' : 'false'); }); }
  chips.forEach(function (c) { c.addEventListener('click', function () { gtouched = true; setGauge(+c.getAttribute('data-i')); }); });
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { gvis = es[0].isIntersecting; }, { threshold: 0.5 }).observe($('.gauge-card'));
  if (!reduce) setInterval(function () { if (!reduce && gvis && !gtouched && !doc.hidden) setGauge((gcur + 1) % 3); }, 2400);
  setGauge(0);

  /* ---- 3 steps: icon tiles + progress bars, auto-advance while visible, tap = manual ---- */
  var tabs = $$('.tab'), tabsBox = $('#tabs'), panelText = $('.panel-text'), simgs = $$('#stepStack > img'), step = 0, manual = reduce, stepsVisible = false;
  function setStep(i, quiet) {
    step = i; var D = LS[lang] || LS.th, n = i + 1;
    tabs.forEach(function (t, k) { t.classList.toggle('on', k === i); t.classList.toggle('done', k < i); t.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
    simgs.forEach(function (im, k) { if (k === i && im.loading === 'lazy') im.loading = 'eager'; im.classList.toggle('on', k === i); });
    $('#stepNo').textContent = n; var h = $('#stepH'), p = $('#stepP'); h.setAttribute('data-t', 'st' + n + 'h'); p.setAttribute('data-t', 'st' + n + 'p'); h.textContent = D['st' + n + 'h']; p.textContent = D['st' + n + 'p'];
    $('#panel').setAttribute('aria-labelledby', 'tab' + i);
    if (!quiet && !reduce) { panelText.classList.remove('sw'); void panelText.offsetWidth; panelText.classList.add('sw'); }
  }
  tabs.forEach(function (t) { t.addEventListener('click', function () { manual = true; tabsBox.classList.add('manual'); setStep(+t.getAttribute('data-i')); }); t.querySelector('.bar b').addEventListener('animationend', function () { if (!manual && stepsVisible) setStep((step + 1) % 3); }); });
  tabsBox.addEventListener('keydown', function (e) { var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return; var n = (step + d + 3) % 3; manual = true; tabsBox.classList.add('manual'); setStep(n); tabs[n].focus(); });
  if (reduce) tabsBox.classList.add('manual');
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { stepsVisible = es[0].isIntersecting; $$('.tab .bar b').forEach(function (b) { b.style.animationPlayState = stepsVisible ? 'running' : 'paused'; }); }, { threshold: 0.4 }).observe($('#panel'));

  /* ---- press ripple on buttons (skipped in reduced motion) ---- */
  doc.addEventListener('pointerdown', function (e) {
    if (reduce) return; var b = e.target.closest && e.target.closest('.btn:not(.off), .gc, .lang, .tab .tile, .totop'); if (!b) return;
    var r = b.getBoundingClientRect(), s = doc.createElement('span'); s.className = 'rip'; s.style.left = (e.clientX - r.left) + 'px'; s.style.top = (e.clientY - r.top) + 'px';
    if (getComputedStyle(b).position === 'static') b.style.position = 'relative'; b.style.overflow = 'hidden'; b.appendChild(s); s.addEventListener('animationend', function () { s.remove(); }); setTimeout(function () { s.remove(); }, 900);
  }, { passive: true });

  if (lang !== 'th') paintLang(lang); else { $('#lang').value = 'th'; setShots('th'); }
  setStep(0, true);
  window.__landing = { setLang: function (l) { applyLang(l, true); }, reduce: function () { return reduce; } };
})();
