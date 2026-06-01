// Extracted from inline script in account.html to satisfy CSP (no inline scripts)

document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status')
  const ordersTbody = document.getElementById('orders')
  const modal = document.getElementById('modal')
  const details = document.getElementById('details')

  const nameEl = document.getElementById('name')
  const phoneEl = document.getElementById('phone')
  const avatarUrlEl = document.getElementById('avatarUrl')
  const companyEl = document.getElementById('company')
  const addressEl = document.getElementById('address')

  const profileMsg = document.getElementById('profileMsg')
  const passMsg = document.getElementById('passMsg')
  const delMsg = document.getElementById('delMsg')
  const ordersMsg = document.getElementById('ordersMsg')

  function esc (s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[c])
  }

  function setMsg (el, type, text) {
    if (!el) return
    if (!text) {
      el.innerHTML = ''
      return
    }
    el.innerHTML = `<div class="${type === 'ok' ? 'ok' : 'err'}">${esc(text)}</div>`
  }

  async function api (url, opts) {
    const res = await fetch(url, Object.assign({
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin'
    }, opts || {}))

    let data = null
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      try { data = await res.json() } catch { data = null }
    } else {
      try { data = await res.text() } catch { data = null }
    }

    if (!res.ok) {
      const msg = (data && data.error) || (data && data.message) || (typeof data === 'string' ? data : '') || `Request failed (${res.status})`
      const err = new Error(msg)
      err.status = res.status
      err.data = data
      throw err
    }
    return data
  }

  async function getMe () {
    return api('/api/auth/me', { method: 'GET', headers: {} })
  }

  function fillProfile (me) {
    if (nameEl) nameEl.value = me.name || ''
    if (phoneEl) phoneEl.value = me.phone || ''
    if (avatarUrlEl) avatarUrlEl.value = (me.profile && me.profile.avatarUrl) || ''
    if (companyEl) companyEl.value = (me.profile && me.profile.company) || ''
    if (addressEl) addressEl.value = (me.profile && me.profile.address) || ''
  }

  async function loadOrders () {
    setMsg(ordersMsg, 'ok', 'Loading orders...')
    const list = await api('/api/account/orders', { method: 'GET', headers: {} })
    renderOrders(list)
    setMsg(ordersMsg, 'ok', list.length ? '' : 'No orders found.')
  }

  async function loadTracking (orderId, me) {
    const payload = { orderId }
    if (me && me.phone) payload.phone = me.phone
    else if (me && me.email) payload.email = me.email
    return api('/api/orders/track', { method: 'POST', body: JSON.stringify(payload) })
  }

  function renderTrackingBlock (tracking) {
    if (!tracking) return '<div class="muted">Tracking is not available yet.</div>'

    const carrier = tracking.tracking?.carrier || ''
    const tn = tracking.tracking?.trackingNumber || ''
    const url = tracking.tracking?.trackingUrl || ''
    const hist = Array.isArray(tracking.statusHistory) ? tracking.statusHistory : []

    const linkHtml = url
      ? `<a class="btn secondary" href="${esc(url)}" target="_blank" rel="noopener">Open tracking</a>`
      : ''

    const rows = hist.length
      ? `<ul>${hist
          .slice()
          .reverse()
          .map(h => {
            const when = h.at ? new Date(h.at).toLocaleString() : ''
            const note = h.note ? ` — ${esc(h.note)}` : ''
            return `<li><strong>${esc(h.status || '')}</strong> <span class="muted">${esc(when)}</span>${note}</li>`
          })
          .join('')}</ul>`
      : '<div class="muted">No tracking updates yet.</div>'

    return `
      <div style="margin-top:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <div>
            <div><strong>Carrier:</strong> ${esc(carrier || '-')}</div>
            <div><strong>Tracking #:</strong> ${esc(tn || '-')}</div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            ${linkHtml}
          </div>
        </div>
        <div class="hr"></div>
        <div><strong>Status Updates</strong></div>
        ${rows}
      </div>
    `
  }

  function openOrder (o, tracking) {
    const idVal = o.orderId ?? o.id ?? ''
    const dateVal = o.orderDate ?? o.createdAt ?? o.created ?? ''
    const status = o.orderStatus ?? o.status ?? 'New'
    const total = o.totalAmount ?? o.amount ?? 0

    const addr = o.address || {}
    const addressText = [addr.building, addr.street, addr.area, addr.city, addr.country].filter(Boolean).join(', ')

    const items = Array.isArray(o.items) ? o.items : []
    const itemsHtml = items.map(i => {
      const name = i.productName ?? i.name ?? ''
      const pn = i.partNumber ? ` (${i.partNumber})` : ''
      const qty = Number(i.quantity || 0)
      const price = Number(i.price || 0)
      return `<li>${esc(name)}${esc(pn)} x ${qty} - AED ${price.toFixed(2)}</li>`
    }).join('')

    const trackingHtml = tracking ? renderTrackingBlock(tracking) : ''

    if (details) {
      details.innerHTML = `
        <div><strong>Order:</strong> ${esc(idVal || '-')}</div>
        <div><strong>Date:</strong> ${dateVal ? esc(new Date(dateVal).toLocaleString()) : '-'}</div>
        <div><strong>Status:</strong> ${esc(status)}</div>
        <div style="margin-top:8px"><strong>Delivery Address:</strong> ${esc(addressText || '-')}</div>
        <div class="hr"></div>
        <div><strong>Items</strong></div>
        <ul>${itemsHtml || '<li>-</li>'}</ul>
        <div style="margin-top:8px"><strong>Total:</strong> AED ${Number(total || 0).toFixed(2)}</div>
        ${trackingHtml ? `<div class="hr"></div><div><strong>Tracking</strong></div>${trackingHtml}` : ''}
      `
    }

    if (modal) modal.style.display = 'flex'
  }

  function renderOrders (list) {
    if (!ordersTbody) return
    ordersTbody.innerHTML = ''

    if (!Array.isArray(list) || list.length === 0) {
      ordersTbody.innerHTML = '<tr><td colspan="5" class="muted">No orders found.</td></tr>'
      return
    }

    list.forEach(o => {
      const id = o.orderId ?? o.id ?? ''
      const dateVal = o.orderDate ?? o.createdAt ?? o.created ?? ''
      const status = o.orderStatus ?? o.status ?? 'New'
      const total = o.totalAmount ?? o.amount ?? 0

      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td>${esc(id || '-')}</td>
        <td>${dateVal ? esc(new Date(dateVal).toLocaleString()) : '-'}</td>
        <td>AED ${Number(total || 0).toFixed(2)}</td>
        <td><span class="badge">${esc(status)}</span></td>
        <td style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn secondary" data-action="view" data-id="${esc(id)}" type="button">View</button>
          <button class="btn secondary" data-action="track" data-id="${esc(id)}" type="button">Track</button>
        </td>
      `

      tr.querySelector('[data-action="view"]').addEventListener('click', async () => {
        try {
          const me = window.__me || null
          if (modal) modal.style.display = 'flex'
          if (details) details.innerHTML = `<div><strong>Order:</strong> ${esc(id || '-')}</div><div class="muted" style="margin-top:6px">Loading order details...</div>`

          let tracking = null
          try {
            tracking = await loadTracking(id, me)
          } catch {
            tracking = null
          }

          openOrder(o, tracking)
        } catch (e) {
          if (modal) modal.style.display = 'flex'
          if (details) details.innerHTML = `<div class="err">${esc(e.message || 'Failed to load order')}</div>`
        }
      })

      tr.querySelector('[data-action="track"]').addEventListener('click', async () => {
        try {
          const me = window.__me || null
          if (modal) modal.style.display = 'flex'
          if (details) details.innerHTML = `<div><strong>Order:</strong> ${esc(id || '-')}</div><div class="muted" style="margin-top:6px">Loading tracking...</div>`

          const tracking = await loadTracking(id, me)
          openOrder(o, tracking)
        } catch (e) {
          if (modal) modal.style.display = 'flex'
          if (details) details.innerHTML = `<div class="err">${esc(e.message || 'Failed to load tracking')}</div>`
        }
      })

      ordersTbody.appendChild(tr)
    })
  }

  document.getElementById('close')?.addEventListener('click', () => {
    if (modal) modal.style.display = 'none'
  })

  modal?.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none'
  })

  document.getElementById('logout')?.addEventListener('click', async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }) } catch {}
    window.location.href = '/login.html'
  })

  document.getElementById('saveProfile')?.addEventListener('click', async () => {
    setMsg(profileMsg, 'ok', 'Saving...')
    try {
      const payload = {
        name: nameEl?.value,
        phone: phoneEl?.value,
        avatarUrl: avatarUrlEl?.value,
        company: companyEl?.value,
        address: addressEl?.value
      }
      const out = await api('/api/account/profile', { method: 'PUT', body: JSON.stringify(payload) })
      setMsg(profileMsg, 'ok', 'Profile updated successfully.')
      if (out && out.user && statusEl) {
        statusEl.innerHTML = `Logged in as <strong>${esc(out.user.name || out.user.email || 'Customer')}</strong> (${esc(out.user.email || '-')})`
      }
    } catch (e) {
      setMsg(profileMsg, 'err', e.message || 'Profile update failed')
    }
  })

  document.getElementById('changePassword')?.addEventListener('click', async () => {
    setMsg(passMsg, 'ok', 'Updating...')
    try {
      const payload = {
        currentPassword: document.getElementById('currentPassword')?.value,
        newPassword: document.getElementById('newPassword')?.value
      }
      await api('/api/account/password', { method: 'PUT', body: JSON.stringify(payload) })
      const cur = document.getElementById('currentPassword')
      const nw = document.getElementById('newPassword')
      if (cur) cur.value = ''
      if (nw) nw.value = ''
      setMsg(passMsg, 'ok', 'Password changed successfully.')
    } catch (e) {
      setMsg(passMsg, 'err', e.message || 'Password update failed')
    }
  })

  document.getElementById('deleteAccount')?.addEventListener('click', async () => {
    setMsg(delMsg, 'err', '')
    const pw = document.getElementById('deletePassword')?.value
    if (!pw) {
      setMsg(delMsg, 'err', 'Password is required to delete your account.')
      return
    }
    if (!confirm('This will permanently delete your account. Continue?')) return

    setMsg(delMsg, 'ok', 'Deleting...')
    try {
      await api('/api/account', { method: 'DELETE', body: JSON.stringify({ password: pw }) })
      setMsg(delMsg, 'ok', 'Account deleted. Redirecting...')
      setTimeout(() => window.location.href = '/register.html', 1000)
    } catch (e) {
      setMsg(delMsg, 'err', e.message || 'Account deletion failed')
    }
  })

  document.getElementById('refreshOrders')?.addEventListener('click', async () => {
    try {
      await loadOrders()
    } catch (e) {
      setMsg(ordersMsg, 'err', e.message || 'Failed to load orders')
    }
  })

  ;(async function init () {
    try {
      if (statusEl) statusEl.textContent = 'Loading...'
      const me = await getMe()
      window.__me = me
      if (statusEl) statusEl.innerHTML = `Logged in as <strong>${esc(me.name || me.email || 'Customer')}</strong> (${esc(me.email || '-')})`
      fillProfile(me)
      await loadOrders()
    } catch (e) {
      if (statusEl) {
        statusEl.innerHTML = `<div class="err">${esc(e.message || 'Please login')}</div><div class="muted" style="margin-top:6px">Redirecting to login...</div>`
      }
      setTimeout(() => window.location.href = '/login.html', 1200)
    }
  })()
})
