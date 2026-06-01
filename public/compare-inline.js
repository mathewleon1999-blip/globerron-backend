// Extracted from inline script in compare.html to satisfy CSP (no inline scripts)

document.addEventListener('DOMContentLoaded', () => {
  const API_URL_PRIMARY = '/api/products'
  const API_URL_FALLBACK = '/src/products.json'

  const qs = new URLSearchParams(location.search)

  function getIdsParam() {
    const p = new URLSearchParams(location.search)
    return p.get('ids')
  }

  function getStoredCompareIds () {
    try {
      return (JSON.parse(localStorage.getItem('compareList') || '[]') || []).map(p => p.id)
    } catch {
      return []
    }
  }

  function setStoredCompare (list) {
    localStorage.setItem('compareList', JSON.stringify(list))
  }

  async function fetchProducts () {
    try {
      const r = await fetch(API_URL_PRIMARY)
      if (!r.ok) throw new Error('primary failed')
      return await r.json()
    } catch {
      const r2 = await fetch(API_URL_FALLBACK)
      if (!r2.ok) throw new Error('fallback failed')
      return await r2.json()
    }
  }

  function buildAttrRows () {
    return [
      { key: 'image', label: 'Image' },
      { key: 'name', label: 'Name' },
      { key: 'partNumber', label: 'Part Number' },
      { key: 'price', label: 'Price' },
      { key: 'category', label: 'Category' },
      { key: 'stock', label: 'Stock' },
      { key: 'compatibleVehicles', label: 'Compatible Vehicles' },
      { key: 'warrantyDuration', label: 'Warranty' },
      { key: 'returnEligibility', label: 'Return Eligibility' },
    ]
  }

  function stockText (p) {
    if (!p.stockStatus) return 'In Stock'
    if (p.stockStatus.availableToday) return 'Available Today'
    if (p.stockStatus.shipsIn1to2Days) return 'Ships in 1-2 Days'
    if (p.stockStatus.preOrderDate) return 'Pre-order: ' + p.stockStatus.preOrderDate
    return 'In Stock'
  }

  function render (products) {
    const wrap = document.getElementById('content')
    const count = document.getElementById('count')
    if (count) count.textContent = products.length + ' selected'

    if (!wrap) return

    if (!products.length) {
      wrap.innerHTML = '<div class="empty">No products selected for comparison. Go back and add some items.</div>'
      return
    }

    const headers = products.map(p => `
      <th>
        <div class="product-head">
          <img alt="" src="${(p.imageUrl && String(p.imageUrl).trim() !== '' ? p.imageUrl : '/images/placeholder.png')}">
          <div class="name">${p.name || 'Unnamed'}</div>
          <div class="price">AED ${Number(p.price || 0).toFixed(2)}</div>
          <button type="button" class="remove" data-id="${p.id}">Remove</button>
        </div>
      </th>
    `).join('')

    const attrs = buildAttrRows()

    const rows = attrs.map(attr => {
      const cells = products.map(p => {
        switch (attr.key) {
          case 'image':
            return `<td><img alt="" src="${(p.imageUrl && String(p.imageUrl).trim() !== '' ? p.imageUrl : '/images/placeholder.png')}" style="width:90px;height:90px;object-fit:contain;border:1px solid rgba(148,191,255,0.28);border-radius:12px;background:color-mix(in srgb, var(--surface) 86%, #ffffff);padding:8px"/></td>`
          case 'name':
            return `<td>${p.name || ''}</td>`
          case 'partNumber':
            return `<td style="word-break:break-word;white-space:normal;">${p.partNumber || 'N/A'}</td>`
          case 'price':
            return `<td>AED ${Number(p.price || 0).toFixed(2)}</td>`
          case 'category':
            return `<td>${p.category || 'N/A'}</td>`
          case 'stock':
            return `<td>${stockText(p)}</td>`
          case 'compatibleVehicles': {
            const list = (p.compatibleVehicles || []).slice(0, 6).map(v => `<li>${String(v).replaceAll('|', ' ')}</li>`).join('')
            return `<td>${list ? `<ul class="compact">${list}</ul>` : 'N/A'}</td>`
          }
          case 'warrantyDuration':
            return `<td>${p.warrantyDuration || 'Not specified'}</td>`
          case 'returnEligibility':
            return `<td>${p.returnEligibility || 'Not specified'}</td>`
          default:
            return '<td></td>'
        }
      }).join('')

      return `<tr><th class="attr-col">${attr.label}</th>${cells}</tr>`
    }).join('')

    wrap.innerHTML = `
      <div class="compare-grid">
        <table class="compare-table">
          <thead>
            <tr>
              <th class="attr-col"></th>
              ${headers}
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `

    // Wire remove buttons
    wrap.querySelectorAll('button.remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id')
        const stored = JSON.parse(localStorage.getItem('compareList') || '[]')
        const next = stored.filter(p => String(p.id) !== String(id))
        setStoredCompare(next)

        // Remove from URL as well
        const currentIds = new Set((new URLSearchParams(location.search).get('ids') || '').split(',').filter(Boolean))
        currentIds.delete(String(id))
        const nextIds = Array.from(currentIds)

        const newQs = new URLSearchParams(location.search)
        if (nextIds.length) newQs.set('ids', nextIds.join(','))
        else newQs.delete('ids')
        history.replaceState(null, '', location.pathname + (nextIds.length ? `?${newQs.toString()}` : ''))

        init()
      })
    })
  }

  async function init () {
    const all = await fetchProducts()
    const idsParam = getIdsParam()

    const ids = new Set(
      (idsParam ? idsParam.split(',') : getStoredCompareIds()).map(String)
    )

    // Ensure localStorage has objects (not only ids)
    const stored = JSON.parse(localStorage.getItem('compareList') || '[]')
    const enriched = Array.from(ids)
      .map(id => stored.find(p => String(p.id) === String(id)) || all.find(p => String(p.id) === String(id)))
      .filter(Boolean)
    setStoredCompare(enriched)

    const selected = Array.from(ids).map(id => all.find(p => String(p.id) === String(id))).filter(Boolean)
    render(selected)
  }

  document.getElementById('back-btn')?.addEventListener('click', () => {
    window.location.href = '/index.html#products'
  })

  document.getElementById('clear-btn')?.addEventListener('click', () => {
    try { localStorage.removeItem('compareList') } catch {}

    // Reset querystring
    const newQs = new URLSearchParams(location.search)
    newQs.delete('ids')
    history.replaceState(null, '', location.pathname)

    const wrap = document.getElementById('content')
    const count = document.getElementById('count')
    if (count) count.textContent = '0 selected'
    if (wrap) wrap.innerHTML = '<div class="empty">No products selected for comparison. Go back and add some items.</div>'
  })

  init().catch(() => {
    const wrap = document.getElementById('content')
    if (wrap) wrap.innerHTML = '<div class="empty">Failed to load products for comparison.</div>'
  })
})
