// น้ำมันถูก — ค่าตั้งค่าแอปทั้งหมดอยู่ที่ไฟล์นี้ไฟล์เดียว (protocol §6: config ที่เดียว, ห้ามฝังความลับ/ID โฆษณาในโค้ดอื่น)
// Tests may pre-define window.NMT_CONFIG_OVERRIDE (e.g. { apiBase: 'http://localhost:8787' }) before this file loads.
(function () {
  var cfg = {
    appName: 'น้ำมันถูก',
    appId: 'com.nammanthuk.app',
    appVersion: '1.0.0',           // versionName (versionCode lives in the Android wrapper's build.gradle)
    // Operator name/contact is the same for every app and changeable here in ONE place (protocol §4, §6).
    operatorName: 'Pornnarai Tananchai',
    contactEmail: 'motoraathailand@gmail.com',   // shared operator contact (all apps). Feedback opens the phone's mail app (mailto) to this address; shown in About.
    // Policy + "request account deletion" pages are static files in this repo (site/, publish with GitHub Pages). Before release set the absolute https URLs
    // (Play Console needs both). While '' the app links to the copies bundled inside it (site/privacy.html, site/delete-account.html).
    privacyUrl: 'https://motoraathailand.github.io/nammanthuk-site/privacy.html',
    deletionUrl: 'https://motoraathailand.github.io/nammanthuk-site/delete-account.html',

    // Backend API (price cache + crowd stock reports). '' = no backend yet -> the app runs from bundled sample data + local cache.
    // Must be an absolute https URL in a release build. Every API call goes through NMT.apiUrl() (see core.js).
    apiBase: 'https://nammanthuk-api.motoraathailand.workers.dev',   // Cloudflare Worker (free plan, account motoraathailand): stations, prices (cron), stock, reports, notices, config. See HANDOVER.md
    apiTimeoutMs: 6000,

    // ---- Account (Google sign-in is REQUIRED to use the app; Firebase Auth + Firestore free tier) ----------------------------------------
    // The app's OWN Firebase project "nammanthuk" (created 2026-10-30 under the operator's Google account, Spark plan; see HANDOVER.md "Firebase setup").
    // These are PUBLIC client identifiers (they ship inside every APK/page); security = Firestore rules + server-side token checks, not secrecy.
    // The API key should still be restricted in Google Cloud console -> APIs & Services -> Credentials (HANDOVER step 10). Empty values = the gate says "account system not set up".
    firebase: {
      apiKey: 'AIzaSyDL-Y_31aER0Yrm77oHxzNeJnDxU0lDZ4o', authDomain: 'nammanthuk.firebaseapp.com', projectId: 'nammanthuk', appId: '1:82893625812:web:170326c841bae3d1be1e41',
      messagingSenderId: '82893625812', storageBucket: 'nammanthuk.firebasestorage.app',
      webClientId: '82893625812-7u7843hi9l22nvp7hgh2ph8ptojl9n9c.apps.googleusercontent.com',   // OAuth "Web client ID" (the Android plugin also reads it from google-services.json)
      firestoreBase: 'https://firestore.googleapis.com/v1',   // REST endpoint (tests point it at a local mock)
    },
    // 'firebase' = real Google sign-in through the native plugin. 'mock' = fake account for tests/dev only (auth-mock.js; NOT in Android builds, see prepare-www).
    auth: { provider: 'firebase' },

    // Pattaya centre: used when geolocation is denied/unavailable.
    fallbackCenter: { lat: 12.9276, lng: 100.8771, label: 'พัทยา' },
    nearbyRadiusKm: 15,
    coverageKm: 30,              // if the user is farther than this from every known station, show Pattaya instead
    mapZoom: 13,
    locateTimeoutMs: 15000,      // per attempt (coarse fix first, then one GPS-grade retry)
    maxRows: 60,                 // nearest stations listed/ranked at once (OSM data has thousands)

    // Map tiles. OSM's public tile server is for light use only (https://operations.osmfoundation.org/policies/tiles/).
    // Before a real release switch to a provider/own tile server with a proper agreement, and keep the attribution.
    tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors (ODbL)',
    tileMaxZoom: 19,

    // Crowd stock reports older than this are shown as "unknown" (but the report time is still displayed).
    stockFreshHours: 12,
    // Cached prices older than this get a "may be out of date" hint.
    priceStaleHours: 36,

    // ---- Ads (all apps are free and live on ads — but NOT in test builds) -------------------------------------------------
    // adsEnabled is a BUILD-TIME flag. The Android wrapper's prepare-www step sets it:  NMT_BUILD=test (default) -> false and ads.js is NOT even
    // copied into the app;  NMT_BUILD=release -> true + ads.js copied (see HANDOVER.md "Ads"). Builds given to pre-launch testers MUST be test builds:
    // with false there is no ad script, no ad network request, no ad DOM and no reserved empty space anywhere.
    adsEnabled: false,
    ads: {
      provider: 'admob',          // 'admob' (needs the native plugin, release build only) | 'mock' (labelled placeholder boxes, no network: dev/tests)
      testMode: true,             // true = Google TEST units below; false = realUnits (owner fills them in, see HANDOVER.md). Never ship false without approval.
      nativeEvery: 5,             // one native-style card after every 5 stations in the "see all" list (never first/last, never on the collapsed list)
      testUnits: {                // Google's public sample ad units — safe to publish
        banner: 'ca-app-pub-3940256099942544/6300978111',
        native: 'ca-app-pub-3940256099942544/2247696110',
      },
      realUnits: { banner: '', native: '' },   // intentionally empty. The new owner puts their own AdMob unit ids here (HANDOVER.md).
      // Deliberately NOT supported: full-screen and app-launch ad formats (driving safety + accidental taps). Slots exist ONLY on the price board (bottom banner)
      // and inside the "see all" station list. Never on home hero / navigate area, stock report, onboarding, language sheet, drawer screens.
    },
  };
  var o = (typeof window !== 'undefined' && window.NMT_CONFIG_OVERRIDE) || null;
  if (o) for (var k in o) cfg[k] = o[k];
  if (typeof window !== 'undefined') window.NMT_CONFIG = cfg;
  if (typeof module !== 'undefined' && module.exports) module.exports = cfg;
})();
