// Native-only glue for the Capacitor app. Injected into www/index.html by
// scripts/sync-web.mjs after the app's own script, so it can see its globals
// (panelState, activeRouteLayer, isDark, toggleTheme, ...). Never loaded on the web.
(function () {
  const cap = window.Capacitor;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;
  const P = cap.Plugins || {};
  document.documentElement.classList.add('native');

  // Status bar: light icons on the dark theme, dark icons on the light theme.
  function syncStatusBar() {
    if (!P.StatusBar) return;
    P.StatusBar.setStyle({ style: isDark ? 'DARK' : 'LIGHT' }).catch(() => {});
  }
  syncStatusBar();
  const origToggleTheme = window.toggleTheme;
  if (typeof origToggleTheme === 'function') {
    window.toggleTheme = function () {
      origToggleTheme.apply(this, arguments);
      syncStatusBar();
    };
  }

  // Android hardware back button: close whatever is open, else minimize.
  if (P.App && cap.getPlatform() === 'android') {
    P.App.addListener('backButton', () => {
      const results = document.getElementById('searchResults');
      const panel = document.getElementById('panel');
      if (results && results.classList.contains('open')) {
        results.classList.remove('open');
        document.getElementById('searchInput').blur();
      } else if (panel && panelState === 'expanded') {
        panel.classList.remove('expanded', 'collapsed');
        panelState = 'half';
        setTimeout(() => map && map.invalidateSize(), 320);
      } else if (activeRouteLayer) {
        clearRoute();
      } else {
        P.App.minimizeApp();
      }
    });
  }
})();
