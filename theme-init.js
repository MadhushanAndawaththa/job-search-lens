// Loaded synchronously in <head> to apply the saved theme class before first
// paint, preventing a flash of the wrong color scheme.
//
// localStorage is the only source of truth for the theme preference because it
// is the only storage API available synchronously here. chrome.storage.local
// is async and would force the popup to render in the wrong theme briefly
// before the callback fires. popup.js writes localStorage on every change so
// the two stay in lockstep.
(function () {
  try {
    var t = localStorage.getItem('jhv-theme') || 'auto';
    var html = document.documentElement;
    if (t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      html.classList.add('dark');
    }
    // Set data-theme so the CSS ::before icon is correct before first paint.
    html.dataset.theme = t;
  } catch (_) {
    // Silently ignore – popup still works without the anti-flash optimisation.
  }
}());
