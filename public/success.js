// success.js (CSP-safe) - handles order persistence after Stripe checkout
(() => {
  const params = new URLSearchParams(window.location.search)
  const sessionId = params.get('session_id') || params.get('sessionId')
  const content = document.getElementById('content')

  async function ensureOrderSaved() {
    // If a previous flow saved already, nothing to do.
    try {
      const existing = await fetch('/api/checkout/success', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      })

      if (existing.ok) {
        localStorage.removeItem('pendingOrder')
        return
      }
    } catch {
      // ignore and try with full payload below
    }

    // New flow: pass pending order payload so the server can attach customer/address/items.
    const pending = localStorage.getItem('pendingOrder')
    if (!pending) {
      throw new Error('Missing pending order details')
    }

    const payload = JSON.parse(pending)

    const res = await fetch('/api/checkout/success', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, order: payload })
    })

    if (!res.ok) throw new Error('Order save failed')

    localStorage.removeItem('pendingOrder')
  }

  function showSuccess() {
    localStorage.removeItem('cart')

    if (content) {
      content.innerHTML = `
        <h1>Order saved successfully</h1>
        <p>Thank you for your purchase. You will be redirected to the home page shortly.</p>
        <a href="/" class="btn">Return to home</a>
        <div class="note">Redirecting automatically</div>
      `
    }

    setTimeout(() => {
      window.location.href = '/'
    }, 4000)
  }

  function escapeHtml(s) {
    return String(s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  }

  function showError(message) {
    if (content) {
      content.innerHTML = `
        <h1>Something went wrong</h1>
        <p>${escapeHtml(message)}</p>
        <a href="/" class="btn">Return to home</a>
      `
    }
  }

  if (!sessionId) {
    showError('Missing payment session')
  } else {
    ensureOrderSaved()
      .then(showSuccess)
      .catch(e => {
        showError(
          e?.message ||
            'Your payment was received, but the order could not be saved. Please contact support.'
        )
      })
  }
})()
