/* ======================================================================================================
   AA 앱 공통 모션 표준 — motion.js  (v1, 2026-10-30, 가이드: /workspace/shared/motion-guide.md)
   프레임워크 없음 · 앱 전용 코드 없음 · motion.css 와 한 쌍. window.Motion 으로 노출(앱이 원하면 별칭을 단다).
   데이터 속성 훅(마크업만으로 동작):
     data-ripple            누르면 터치 지점에서 퍼지는 리플 (data-ripple 는 컨트롤 자신에게)
     data-stagger[="36"]    자식들이 위에서 아래로 36ms 간격으로 올라오며 등장 (추가될 때 1번)
     data-rollup="1234.5"   숫자가 data-rollup-from(기본 0)에서 이 값까지 올라감. data-rollup-dec(소수 자리), data-rollup-sep(쉼표)
     data-reveal            스크롤로 보이면 등장 (data-reveal 요소끼리 --i 로 간격)
   API: Motion.reduced() · play(el, cls, ms) · stagger(els, {cap, step}) · ripple(el, event) · roll(el, from, to, fmt, ms)
        pop(el) · ring(el) · langFade(el) · scrollTo(el, block) · toastOut(el, done) · use({ ripple: '선택자', ... }) · scan(root)
   규칙: 탭을 막지 않는다(포인터 이벤트 passive, 래퍼는 pointer-events:none) · 동작 줄이기면 아무것도 하지 않는다 · 실패해도 화면은 그대로.
   ====================================================================================================== */
(function (root) {
  'use strict';
  var doc = root.document;
  var RM = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var cfg = { ripple: '[data-ripple]', stagger: 36, cap: 10 };
  function reduced() { return !!RM.matches; }

  /* 한 번 재생하는 CSS 클래스: 붙였다 다시 뗀다(아무것도 숨겨지거나 밀려 있지 않게). */
  function play(el, cls, ms) {
    if (!el || reduced()) return;
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    clearTimeout(el['_m' + cls]); el['_m' + cls] = setTimeout(function () { el.classList.remove(cls); }, ms || 900);
  }

  /* 목록 흐르듯 등장: 보이는 요소만, 최대 cap 단계, 간격 step ms (기본 36). */
  function stagger(els, o) {
    if (reduced() || !els) return;
    o = o || {}; var i = 0, cap = o.cap || cfg.cap, step = o.step;
    Array.prototype.forEach.call(els, function (e) {
      if (!e || e.hidden || !e.getClientRects().length) return;
      e.style.setProperty('--i', Math.min(i++, cap)); if (step) e.style.setProperty('--m-stagger', step + 'ms');
      play(e, 'm-stagger', 1200);
    });
  }

  /* ---- 리플: 누른 컨트롤 안의 래퍼에서 원이 퍼지고 천천히 사라진다(450ms). 래퍼는 클릭을 가로채지 않는다. ---- */
  function ripple(b, e) {
    if (reduced() || !b) return;
    var r = b.getBoundingClientRect(); if (!r.width || !r.height) return;
    if (root.getComputedStyle(b).position === 'static') b.style.position = 'relative';
    var w = doc.createElement('span'), i = doc.createElement('i'), d = Math.max(r.width, r.height) * 2.2;
    var done = function () { if (w.parentNode) w.parentNode.removeChild(w); };
    w.className = 'm-rip-w'; w.setAttribute('aria-hidden', 'true');
    i.style.cssText = 'width:' + d + 'px;height:' + d + 'px;left:' + ((e && e.clientX != null ? e.clientX : r.left + r.width / 2) - r.left - d / 2) + 'px;top:' + ((e && e.clientY != null ? e.clientY : r.top + r.height / 2) - r.top - d / 2) + 'px';
    w.appendChild(i); b.appendChild(w); i.addEventListener('animationend', done); setTimeout(done, 800);
  }
  doc.addEventListener('pointerdown', function (e) {
    if (reduced() || (e.button && e.button > 0) || !e.target.closest) return;
    var b = e.target.closest(cfg.ripple); if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true') return;
    ripple(b, e);
  }, { passive: true, capture: true });

  /* ---- 숫자 롤업: 진짜 글자(textContent)는 이미 최종값. 장식용 복사본(data-roll → ::after)만 곡선 (.22,1,.36,1) 으로 올라간다. ---- */
  function bez(x1, y1, x2, y2) {   // cubic-bezier 풀이(뉴턴법) — CSS 곡선과 같은 모양
    var cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    var X = function (t) { return ((ax * t + bx) * t + cx) * t; }, Y = function (t) { return ((ay * t + by) * t + cy) * t; }, dX = function (t) { return (3 * ax * t + 2 * bx) * t + cx; };
    return function (x) { var t = x, k, d; for (k = 0; k < 6; k++) { d = X(t) - x; if (Math.abs(d) < 1e-4) break; var s = dX(t); if (Math.abs(s) < 1e-6) break; t -= d / s; } return Y(Math.max(0, Math.min(1, t))); };
  }
  var easeOut = bez(.22, 1, .36, 1);
  function roll(el, from, to, fmt, ms) {
    if (!el || reduced() || typeof from !== 'number' || typeof to !== 'number' || isNaN(from) || isNaN(to) || from === to) return;
    var dur = ms || 450, t0 = null, id = (el.__roll = (el.__roll || 0) + 1);
    fmt = fmt || String;
    function end() { el.classList.remove('m-rolling'); el.removeAttribute('data-roll'); }
    function step(ts) {
      if (el.__roll !== id || !el.isConnected) return;
      if (t0 === null) t0 = ts; var p = Math.min(1, (ts - t0) / dur);
      el.setAttribute('data-roll', fmt(from + (to - from) * easeOut(p)));
      if (p < 1) requestAnimationFrame(step); else end();
    }
    el.setAttribute('data-roll', fmt(from)); el.classList.add('m-rolling'); requestAnimationFrame(step);
    setTimeout(function () { if (el.__roll === id) end(); }, dur + 300);
  }

  /* ---- 작은 조각들 ---- */
  function pop(el) { play(el, 'm-pop', 600); }                       /* 즐겨찾기 별 */
  function ring(el) { play(el, 'm-ring', 600); }                     /* 눌린 버튼 주위로 퍼지는 링(요소에 position 필요 없음: m-ring 이 relative 를 줌) */
  function langFade(el) { play(el || doc.querySelector('[data-lang-root]') || doc.body, 'm-lang', 500); }   /* 언어 바꾼 뒤: 새 글자로 서서히 */
  function scrollTo(el, block) {   /* 모멘텀 없는 부드러운 스크롤(브라우저 기본 smooth). 동작 줄이기면 즉시 */
    if (!el || !el.scrollIntoView) return;
    try { el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: block || 'nearest' }); } catch (e) { el.scrollIntoView(); }
  }
  function toastOut(el, done) {      /* 토스트: 아래로 내려가며 사라진 뒤 done() */
    if (!el) return; if (reduced()) { if (done) done(); return; }
    el.classList.add('m-out'); setTimeout(function () { el.classList.remove('m-out'); if (done) done(); }, 280);
  }

  /* ---- 데이터 속성 훅 ---- */
  var seen = typeof WeakSet === 'function' ? new WeakSet() : { has: function () { return false; }, add: function () {} };
  var io = null;
  function reveal(el) {
    if (!('IntersectionObserver' in root)) { el.classList.add('m-in'); return; }
    io = io || new IntersectionObserver(function (es) { es.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add('m-in'); io.unobserve(x.target); } }); }, { threshold: .12, rootMargin: '0px 0px -6% 0px' });
    io.observe(el);
  }
  function fmtOf(el) {
    var dec = parseInt(el.getAttribute('data-rollup-dec') || '0', 10) || 0, sep = el.hasAttribute('data-rollup-sep');
    return function (v) { var s = v.toFixed(dec); if (sep) { var p = s.split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); s = p.join('.'); } return s; };
  }
  function scan(r) {
    r = r || doc; if (!r.querySelectorAll) return;
    var list = function (sel) { var a = Array.prototype.slice.call(r.querySelectorAll(sel)); if (r.matches && r.matches(sel)) a.unshift(r); return a; };
    list('[data-stagger]').forEach(function (c) {
      if (seen.has(c)) return; seen.add(c);
      var step = parseInt(c.getAttribute('data-stagger'), 10); stagger(c.children, { step: step > 0 ? step : undefined });
    });
    list('[data-rollup]').forEach(function (el) {
      if (seen.has(el)) return; seen.add(el);
      var to = parseFloat(el.getAttribute('data-rollup')), from = parseFloat(el.getAttribute('data-rollup-from') || '0');
      if (!el.textContent.trim()) el.textContent = fmtOf(el)(to);   /* 글자가 비어 있으면 최종값을 채운다 */
      roll(el, from, to, fmtOf(el));
    });
    list('[data-reveal]').forEach(function (el) { if (seen.has(el)) return; seen.add(el); if (reduced()) el.classList.add('m-in'); else reveal(el); });
  }
  function use(o) { for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) cfg[k] = o[k]; }   /* use({ripple:'.btn, .row'}) */

  doc.documentElement.classList.add('m-js');
  var start = function () {
    scan(doc);
    if ('MutationObserver' in root) new MutationObserver(function (ms) {
      ms.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1 && ((n.matches && n.matches('[data-stagger],[data-rollup],[data-reveal]')) || (n.querySelector && n.querySelector('[data-stagger],[data-rollup],[data-reveal]')))) scan(n); }); });
    }).observe(doc.body, { childList: true, subtree: true });
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();

  root.Motion = { reduced: reduced, play: play, stagger: stagger, ripple: ripple, roll: roll, pop: pop, ring: ring, langFade: langFade, scrollTo: scrollTo, toastOut: toastOut, use: use, scan: scan, version: 1 };
})(typeof window !== 'undefined' ? window : globalThis);
