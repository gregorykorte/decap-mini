(function boot() {
  if (window.CMS && CMS.init) {
    CMS.init({ config: '/admin/config.yml' });  // <-- note the leading slash
  } else {
    setTimeout(boot, 50);
  }
})();
