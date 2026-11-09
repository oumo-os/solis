// shared/live.js — public bootstrap fetcher for the static site pages.
// Live sections render from api/bootstrap; missing data → honest empty states.
var SolisLive = (function () {
  function load() {
    return fetch('api/bootstrap', { headers: { 'Accept': 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .catch(function () { return null; });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function empty(msg) {
    return '<div class="card" style="text-align:center;padding:18px"><p class="text-xs" style="color:var(--text-tertiary)">' + esc(msg || 'Nothing to show yet.') + '</p></div>';
  }
  return { load: load, esc: esc, empty: empty };
})();
