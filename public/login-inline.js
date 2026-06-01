// Extracted from inline script in login.html to satisfy CSP (no inline scripts)

document.addEventListener('DOMContentLoaded', () => {
  function getNext () {
    const p = new URLSearchParams(location.search)
    return p.get('next') || '/'
  }

  const next = getNext()

  const createAccount = document.getElementById('create-account')
  if (createAccount) createAccount.href = '/register.html?next=' + encodeURIComponent(next)

  const googleLogin = document.getElementById('google-login')
  if (googleLogin) googleLogin.href = '/api/auth/google?next=' + encodeURIComponent(next)

  function setToast (text) {
    const el = document.getElementById('toast')
    if (!el) return
    el.textContent = text || ''
  }

  async function loginHandler () {
    const email = document.getElementById('email')?.value?.trim() || ''
    const password = document.getElementById('password')?.value || ''
    const error = document.getElementById('error')

    if (error) error.textContent = ''
    setToast('')

    if (!email || !password) {
      if (error) error.textContent = 'Enter email and password'
      return
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      if (res.ok) {
        location.href = next
        return
      }

      const data = await res.json().catch(() => ({ error: 'Invalid credentials' }))
      if (error) error.textContent = data.error || 'Invalid credentials'
    } catch {
      if (error) error.textContent = 'Network error. Try again.'
    }
  }

  const loginBtn = document.getElementById('login')
  if (loginBtn) {
    loginBtn.addEventListener('click', (e) => {
      e.preventDefault()
      loginHandler()
    })
  }

  const form = document.getElementById('login-form')
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      loginHandler()
    })
  }

  const forgot = document.getElementById('forgot-password')
  if (forgot) {
    forgot.addEventListener('click', async (e) => {
      e.preventDefault()

      const email = document.getElementById('email')?.value?.trim() || ''
      const error = document.getElementById('error')
      if (error) error.textContent = ''
      setToast('')

      if (!email) {
        if (error) error.textContent = 'Enter your email first, then click “Forgot password?”'
        return
      }

      const showMsg = () => setToast('If this email is registered, an OTP was sent. Copy it and paste below to login.')

      try {
        await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        })
        showMsg()
      } catch {
        showMsg()
      }

      const otpWrap = document.getElementById('otp-wrap')
      if (otpWrap) otpWrap.style.display = 'block'
    })
  }

  const otpLogin = document.getElementById('otp-login')
  if (otpLogin) {
    otpLogin.addEventListener('click', async () => {
      const email = document.getElementById('email')?.value?.trim() || ''
      const otp = document.getElementById('otp')?.value?.trim() || ''
      const error = document.getElementById('error')

      if (error) error.textContent = ''
      setToast('')

      if (!email) {
        if (error) error.textContent = 'Enter your email first.'
        return
      }
      if (!otp) {
        if (error) error.textContent = 'Enter the OTP sent to your email.'
        return
      }

      try {
        const res = await fetch('/api/auth/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, otp })
        })

        const data = await res.json().catch(() => ({}))

        if (res.ok) {
          location.href = next
          return
        }

        if (error) error.textContent = data.error || 'Invalid OTP'
      } catch {
        if (error) error.textContent = 'Network error. Try again.'
      }
    })
  }

  const guest = document.getElementById('guest')
  if (guest) {
    guest.addEventListener('change', (e) => {
      if (e.target.checked) {
        sessionStorage.setItem('guestCheckout', '1')
        location.href = next
      } else {
        sessionStorage.removeItem('guestCheckout')
      }
    })
  }
})
