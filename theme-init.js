// Loaded synchronously in <head> to apply the saved theme class before first
// paint, preventing a flash of the wrong color scheme.
// Uses localStorage (mirrored by applyTheme in popup.js) for sync access.
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
