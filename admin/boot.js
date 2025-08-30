// Must run before decap-cms.js
window.CMS_MANUAL_INIT = true;

(function () {
  var PREFIX = 'authorization:github:success:';
  function done() {
    // reload so CMS boots with stored token
    location.replace(location.pathname + location.search + location.hash);
  }

  // A) Token via postMessage
  window.addEventListener('message', function (e) {
    var msg = e && e.data;
    if (typeof msg === 'string' && msg.indexOf(PREFIX) === 0) {
      try {
        var payload = JSON.parse(msg.slice(PREFIX.length));
        if (payload && payload.token) {
          var userObj = { token: payload.token };
          localStorage.setItem('decap-cms-user', JSON.stringify(userObj));
          localStorage.setItem('netlify-cms-user', JSON.stringify(userObj));
          console.log('[decap] token received via postMessage');
          done();
        }
      } catch (err) {
        console.error('[decap] OAuth token parse error:', err);
      }
    }
  }, false);

  // B) Token via localStorage change from popup
  window.addEventListener('storage', function (e) {
    if (e.key === 'decap-cms-user' || e.key === 'netlify-cms-user') {
      try {
        var v = JSON.parse(e.newValue || 'null');
        if (v && v.token) {
          console.log('[decap] token received via storage event');
          done();
        }
      } catch(_) {}
    }
  });

  // C) If the popup already wrote storage before this page loaded
  try {
    var cached = JSON.parse(localStorage.getItem('decap-cms-user') || localStorage.getItem('netlify-cms-user') || 'null');
    if (cached && cached.token) {
      console.log('[decap] token already present in storage');
    }
  } catch(_) {}
})();
