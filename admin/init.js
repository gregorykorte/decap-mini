// admin/init.js
(function boot() {
  if (window.CMS && typeof CMS.init === 'function') {
    CMS.init({ config: '/admin/config.yml' });
    console.log('[decap] CMS.init called');
  } else {
    setTimeout(boot, 50);
  }
})();
