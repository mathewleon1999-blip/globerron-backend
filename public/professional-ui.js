/**
 * Professional UI Enhancements
 * - Page loader, Scroll to top, Toast notifications
 */
(function() {
  'use strict';

  // Page Loader
  const loader = document.createElement('div');
  loader.className = 'page-loader';
  loader.id = 'page-loader';
  loader.innerHTML = '<div class="loader-content"><div class="loader-spinner"></div><div class="loader-text">Loading...</div></div>';
  document.body.appendChild(loader);

  window.addEventListener('load', () => {
    setTimeout(() => {
      loader.classList.add('hidden');
      setTimeout(() => loader.remove(), 400);
    }, 300);
  });

  setTimeout(() => { if (loader.parentNode) { loader.classList.add('hidden'); setTimeout(() => loader.remove(), 400); } }, 3000);

  // Scroll to Top
  const btn = document.createElement('button');
  btn.className = 'scroll-to-top';
  btn.id = 'scroll-to-top';
  btn.setAttribute('aria-label', 'Scroll to top');
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18,15 12,9 6,15"></polyline></svg>';
  document.body.appendChild(btn);

  let ticking = false;
  function updateButton() {
    btn.classList.toggle('visible', window.scrollY > 300);
    ticking = false;
  }
  window.addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(updateButton); ticking = true; } }, { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  // Toast Notifications
  const Toast = {
    container: null,
    init() {
      if (this.container) return;
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      document.body.appendChild(this.container);
    },
    show(message, options = {}) {
      this.init();
      const { title = '', type = 'info', duration = 4000 } = options;
      const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      toast.setAttribute('role', 'alert');
      toast.innerHTML = `<div class="toast-icon">${icons[type]}</div><div class="toast-content">${title ? `<div class="toast-title">${title}</div>` : ''}<div class="toast-message">${message}</div></div><button class="toast-close" aria-label="Close">✕</button>`;
      this.container.appendChild(toast);
      toast.querySelector('.toast-close').addEventListener('click', () => this.remove(toast));
      if (duration > 0) setTimeout(() => this.remove(toast), duration);
      return toast;
    },
    remove(toast) {
      toast.style.animation = 'none';
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    },
    success(m, o) { return this.show(m, { ...o, type: 'success' }); },
    error(m, o) { return this.show(m, { ...o, type: 'error' }); },
    warning(m, o) { return this.show(m, { ...o, type: 'warning' }); },
    info(m, o) { return this.show(m, { ...o, type: 'info' }); }
  };

  // Skip Link
  const skipLink = document.createElement('a');
  skipLink.href = '#main-content';
  skipLink.className = 'skip-link';
  skipLink.textContent = 'Skip to main content';
  document.body.insertBefore(skipLink, document.body.firstChild);
  const main = document.querySelector('main') || document.querySelector('.container');
  if (main && !main.id) { main.id = 'main-content'; main.setAttribute('tabindex', '-1'); }

  // Expose API
  window.ProUI = { Toast };
})();
// Usage: ProUI.Toast.success('Added!', {title:'Success'})
// ProUI.Toast.error('Failed', {title:'Error'})
// ProUI.Toast.warning('Check this', {title:'Warning'})
// ProUI.Toast.info('FYI', {title:'Info'})
