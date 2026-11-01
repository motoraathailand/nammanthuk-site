// น้ำมันถูก — pure logic (no DOM). Loaded as a classic script in the browser (window.NMT) and with require() in Node unit tests.
(function (root) {
  'use strict';
  // 'premium' was split into premium_gas (premium petrol) and premium_diesel on 2026-11-01. The old id 'premium' (saved fuel, old stock reports, old prices documents) always means premium_gas.
  var FUELS = ['gsh95', 'gsh91', 'e20', 'e85', 'b7', 'b20', 'premium_gas', 'premium_diesel'];
  function normFuel(f) { return f === 'premium' ? 'premium_gas' : f; }
  var STATUSES = ['ok', 'low', 'out', 'unknown'];
  var SORTS = ['near', 'cheap'];

  function haversineKm(a, b) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  // distance text: { unit: 'm'|'km', value } -> caller formats with i18n (กม. / เมตร)
  function distanceParts(km) {
    if (km < 1) return { unit: 'm', value: Math.max(10, Math.round(km * 100) * 10) };
    return { unit: 'km', value: Math.round(km * 10) / 10 };
  }

  // price info for a brand+fuel from a prices document ({brands:{ptt:{gsh95:{price,prev}}}})
  function priceFor(prices, brand, fuel) {
    var b = prices && prices.brands && prices.brands[brand];
    fuel = normFuel(fuel);
    var e = b && (b[fuel] || (fuel === 'premium_gas' ? b.premium : null));   // a cached prices document from before the split only has 'premium' (= premium petrol)
    if (!e || typeof e.price !== 'number') return null;
    var diff = typeof e.prev === 'number' ? Math.round((e.price - e.prev) * 100) / 100 : null;
    return { price: e.price, prev: typeof e.prev === 'number' ? e.prev : null, diff: diff, product: typeof e.product === 'string' ? e.product : '' };
  }

  // Premium products as sold (prices.products from the Worker, 2026-11-01): grouped by grade, cheapest first inside a grade. -> [{ group, items:[{ id, brand, fuel, octaneText, name:{en,th}, price, prev, diff }] }]
  var PREMIUM_GROUPS = ['gas99', 'gas98', 'gas97', 'gas95', 'diesel'];
  function premiumGroups(prices) {
    var list = prices && Array.isArray(prices.products) ? prices.products : [];
    var items = list.filter(function (p) { return p && typeof p === 'object' && typeof p.price === 'number' && isFinite(p.price) && typeof p.brand === 'string' && PREMIUM_GROUPS.indexOf(p.group) >= 0 && p.display && (p.display.en || p.display.th); }).map(function (p) {
      var prev = typeof p.prev === 'number' ? p.prev : null;
      return { id: String(p.id || p.brand + '-' + p.group), brand: p.brand, fuel: p.fuel, group: p.group, octaneText: p.octaneText || '', name: { en: p.display.en || p.display.th, th: p.display.th || p.display.en }, price: p.price, prev: prev, diff: prev === null ? null : Math.round((p.price - prev) * 100) / 100 };
    });
    return PREMIUM_GROUPS.map(function (g) {
      var it = items.filter(function (x) { return x.group === g; }).sort(function (a, b) { return a.price - b.price || (a.brand < b.brand ? -1 : a.brand > b.brand ? 1 : 0); });
      return { group: g, items: it };
    }).filter(function (g) { return g.items.length; });
  }

  function fuelsOfBrand(prices, brand) {
    var b = (prices && prices.brands && prices.brands[brand]) || {};
    return FUELS.filter(function (f) { return priceFor(prices, brand, f); });
  }

  // Build list rows for the home screen.
  // opts: { stations, prices, loc:{lat,lng}, fuel, brand:'all'|id, sort:'near'|'cheap', radiusKm, stock (fn(stationId,fuel)->stockInfo) }
  function buildRows(o) {
    var rows = [];
    (o.stations || []).forEach(function (s) {
      if (o.brand && o.brand !== 'all' && s.brand !== o.brand) return;
      var d = haversineKm(o.loc, s);
      if (o.radiusKm && d > o.radiusKm) return;
      var p = priceFor(o.prices, s.brand, o.fuel);
      rows.push({ station: s, km: d, price: p, stock: o.stock ? o.stock(s.id, o.fuel) : null });
    });
    return sortRows(rows, o.sort || 'near');
  }

  function sortRows(rows, sort) {
    var out = rows.slice();
    out.sort(function (a, b) {
      if (sort === 'cheap') {
        var pa = a.price ? a.price.price : Infinity, pb = b.price ? b.price.price : Infinity;
        if (pa !== pb) return pa - pb;
      }
      if (a.km !== b.km) return a.km - b.km;
      return a.station.id < b.station.id ? -1 : 1;
    });
    return out;
  }

  // Brand price board for a fuel: cheapest first, brands without that fuel last.
  function boardRows(prices, brands, fuel) {
    var rows = brands.map(function (br) { return { brand: br, p: priceFor(prices, br.id, fuel) }; });
    rows.sort(function (a, b) {
      var pa = a.p ? a.p.price : Infinity, pb = b.p ? b.p.price : Infinity;
      if (pa !== pb) return pa - pb;
      return a.brand.id < b.brand.id ? -1 : 1;
    });
    return rows;
  }

  // ---- crowd stock ----
  // reports: [{stationId, fuel, status, ts(ms)}]; returns latest per station+fuel. Local (device) reports and server reports are merged; newest wins.
  function mergeReports() {
    var map = {};
    for (var i = 0; i < arguments.length; i++) {
      (arguments[i] || []).forEach(function (r) {
        if (!r || !r.stationId || !r.fuel || STATUSES.indexOf(r.status) < 0 || typeof r.ts !== 'number') return;
        r = Object.assign({}, r, { fuel: normFuel(r.fuel) });   // old reports with 'premium' count as premium_gas
        var k = r.stationId + '|' + r.fuel;
        if (!map[k] || map[k].ts < r.ts) map[k] = r;
      });
    }
    return map;
  }

  // -> { status: ok|low|out|unknown, ts: ms|null, fresh: bool }
  function stockInfo(map, stationId, fuel, nowMs, freshHours) {
    var r = map[stationId + '|' + normFuel(fuel)];
    if (!r) return { status: 'unknown', ts: null, fresh: false };
    var fresh = nowMs - r.ts <= freshHours * 3600 * 1000;
    return { status: fresh ? r.status : 'unknown', ts: r.ts, fresh: fresh };
  }

  // minutes ago -> { key, n } for i18n ("just now", "{n} min ago", "{n} h ago", "{n} d ago")
  function agoParts(nowMs, ts) {
    var m = Math.max(0, Math.floor((nowMs - ts) / 60000));
    if (m < 1) return { key: 'ago.now', n: 0 };
    if (m < 60) return { key: 'ago.min', n: m };
    var h = Math.floor(m / 60);
    if (h < 24) return { key: 'ago.hour', n: h };
    return { key: 'ago.day', n: Math.floor(h / 24) };
  }

  function formatPrice(n) { return (Math.round(n * 100) / 100).toFixed(2); }
  function formatDiff(d) { return (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d).toFixed(2); }

  // Every API call goes through this (protocol §3): base '' => null (no backend configured).
  function apiUrl(base, path) {
    if (!base) return null;
    return String(base).replace(/\/+$/, '') + '/' + String(path).replace(/^\/+/, '');
  }

  function navLinks(s, name) {
    var ll = s.lat + ',' + s.lng;
    return {
      geo: 'geo:' + ll + '?q=' + ll + '(' + encodeURIComponent(name) + ')',
      google: 'https://www.google.com/maps/dir/?api=1&destination=' + ll + '&travelmode=driving',
      waze: 'https://waze.com/ul?ll=' + ll + '&navigate=yes',
    };
  }

  var api = {
    FUELS: FUELS, normFuel: normFuel, PREMIUM_GROUPS: PREMIUM_GROUPS, premiumGroups: premiumGroups, STATUSES: STATUSES, SORTS: SORTS,
    haversineKm: haversineKm, distanceParts: distanceParts, priceFor: priceFor, fuelsOfBrand: fuelsOfBrand,
    buildRows: buildRows, sortRows: sortRows, boardRows: boardRows, mergeReports: mergeReports, stockInfo: stockInfo,
    agoParts: agoParts, formatPrice: formatPrice, formatDiff: formatDiff, apiUrl: apiUrl, navLinks: navLinks,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NMT = Object.assign(root.NMT || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
