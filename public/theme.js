/* Theme toggle: Light Thunder Blue <-> Dark Thunder Blue
   - Persists selection in localStorage
   - Applies to all pages that include this script
*/

(function () {
  const STORAGE_KEY = 'site-theme'; // 'light' | 'dark'
  const root = document.body;

  function applyTheme(theme) {
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');

    // Update any toggle labels/icons if present
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      const next = theme === 'dark' ? 'light' : 'dark';
      btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
      btn.dataset.theme = theme;
      btn.title = theme === 'dark' ? 'Switch to Light Thunder Blue' : 'Switch to Dark Thunder Blue';

      // Button label should describe the action (what user will switch to)
      btn.textContent = next === 'dark' ? 'Dark Mode' : 'Light Mode';
      btn.dataset.nextTheme = next;
      btn.setAttribute('aria-label', btn.textContent);
    });
  }

  function getInitialTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;

    // default: light, but respect OS preference
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  }

  function setTheme(theme) {
    localStorage.setItem(STORAGE_KEY, theme);
    applyTheme(theme);
  }

  // Init
  applyTheme(getInitialTheme());

  // Bind clicks (works for any button/link with data-theme-toggle)
  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest && e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    e.preventDefault();

    const current = document.body.classList.contains('dark') ? 'dark' : 'light';
    setTheme(current === 'dark' ? 'light' : 'dark');
  });
})();
