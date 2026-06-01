(function () {
  function qs(id) { return document.getElementById(id); }
  const form = qs('admin-login-form');
  const errorEl = qs('error');
  const emailEl = qs('email');
  const passEl = qs('password');
  const submitBtn = form ? form.querySelector('button[type="submit"]') : null;

  function setError(msg) {
    if (!errorEl) return;
    errorEl.textContent = msg || '';
    errorEl.setAttribute('role', 'alert');
    errorEl.setAttribute('aria-live', 'polite');
  }

  function validate(email, password) {
    if (!email || !password) return 'Enter email and password';
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) return 'Enter a valid email address';
    if (password.length < 6) return 'Password must be at least 6 characters';
    return null;
  }

  async function login() {
    setError('');
    const email = (emailEl && emailEl.value || '').trim();
    const password = (passEl && passEl.value) || '';

    const vErr = validate(email, password);
    if (vErr) { setError(vErr); return; }

    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Logging in...';
      }

      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || 'Invalid credentials');
        return;
      }

      // Login successful - redirect to admin panel
      location.href = '/admin.html';

    } catch (err) {
      setError('Network error. Try again.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Login';
      }
    }
  }

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      login();
    });
  }
})();
