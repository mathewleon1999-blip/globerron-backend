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

  const otpWrap = qs('otp-wrap');
  const otpEl = qs('otp');
  let otpStep = false;

  async function login() {
    setError('');
    const email = (emailEl && emailEl.value || '').trim();
    const password = (passEl && passEl.value) || '';

    const vErr = validate(email, password);
    if (vErr) { setError(vErr); return; }

    try {
      if (submitBtn) submitBtn.disabled = true;

      if (!otpStep) {
        if (submitBtn) submitBtn.textContent = 'Sending OTP...';

        const res = await fetch('/api/admin/login/start', {
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

        otpStep = true;
        if (otpWrap) otpWrap.style.display = 'block';
        if (otpEl) otpEl.focus();
        if (submitBtn) submitBtn.textContent = 'Verify OTP';
        return;
      }

      // OTP step
      const otp = String(otpEl?.value || '').trim();
      if (!otp) {
        setError('Enter the OTP sent to your admin email');
        return;
      }

      if (submitBtn) submitBtn.textContent = 'Verifying...';

      const res2 = await fetch('/api/admin/login/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ otp })
      });

      const data2 = await res2.json().catch(() => ({}));
      if (!res2.ok) {
        setError(data2.message || 'Invalid OTP');
        return;
      }

      location.href = '/admin.html';

    } catch (err) {
      setError('Network error. Try again.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      if (submitBtn && !otpStep) submitBtn.textContent = 'Login';
    }
  }

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      login();
    });
  }
})();
