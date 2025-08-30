(function boot() {
  if (window.CMS && CMS.init) {
    CMS.init({ config: '/admin/config.yml' });
  } else {
    setTimeout(boot, 50);
  }
})();
