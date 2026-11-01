// น้ำมันถูก — PREVIEW MODE, for the hosted web preview ONLY (scripts/publish-app-preview.sh copies this next to index.html and loads it BEFORE app-config.js).
// It is not part of the app root and not copied into any Android build. It does three things:
//   1) real Google sign-in does not exist on the web (the app signs in through the native Android plugin), so the preview uses the fake sign-in (auth-mock.js) and
//      opens with a session already in place: the login gate is skipped. The visitor is "Preview", no real account, nothing is sent to Firebase (firebase: {}).
//   2) no ads (adsEnabled false: ads.js is not even published).
//   3) a small "Preview" badge so nobody mistakes it for the real app.
(function () {
  window.NMT_CONFIG_OVERRIDE = Object.assign({ preview: true, adsEnabled: false, firebase: {}, auth: { provider: 'mock', mockUser: { uid: 'preview-visitor', displayName: 'Preview', email: '', photoUrl: '' } } }, window.NMT_CONFIG_OVERRIDE || {});
  try {
    var ls = window.localStorage;
    if (!ls.getItem('nmt.mock.session')) { ls.setItem('nmt.mock.session', 'preview-visitor'); ls.setItem('nmt.auth', JSON.stringify({ uid: 'preview-visitor', name: 'Preview', email: '', photo: '' })); }
  } catch (e) { /* storage blocked: the gate shows and the fake sign-in button works */ }
  document.addEventListener('DOMContentLoaded', function () {
    var b = document.createElement('div'); b.id = 'preview-badge'; b.setAttribute('role', 'note'); b.textContent = 'Preview';
    b.style.cssText = 'position:fixed;z-index:2147483000;left:6px;bottom:6px;padding:2px 9px;border-radius:999px;background:#b45309;color:#fff;font:600 13px/20px system-ui,sans-serif;letter-spacing:.02em;opacity:.92;pointer-events:none';
    b.title = 'Web preview, not the real app: demo sign-in, no ads'; document.body.appendChild(b);
  });
})();
