// admin/boot.js
// REMOVE: window.CMS_MANUAL_INIT = true;

// Token shim (keep this)
(function () {
  var PREFIX = 'authorization:github:success:';
  function reload() {
    location.replace(location.pathname + location.search + location.hash);
  }
  window.addEventListener('message', function (e) {
    var msg = e && e.data;
    if (typeof msg === 'string' && msg.indexOf(PREFIX) === 0) {
      try {
        var payload = JSON.parse(msg.slice(PREFIX.length));
        if (payload && payload.token) {
          var user = { token: payload.token };
          localStorage.setItem('decap-cms-user', JSON.stringify(user));
          localStorage.setItem('netlify-cms-user', JSON.stringify(user));
          reload();
        }
      } catch (err) { console.error('[decap] OAuth token parse error:', err); }
    }
  }, false);

  // Also react if the popup wrote to storage first
  window.addEventListener('storage', function (e) {
    if (e.key === 'decap-cms-user' || e.key === 'netlify-cms-user') reload();
  });
})();
