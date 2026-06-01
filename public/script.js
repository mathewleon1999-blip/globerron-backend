// PWA: register service worker (safe no-op on unsupported browsers)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {})
  })
}

/* =========================================================
   AUTH HEADER (shared across pages)
   Supports BOTH:
     - New account dropdown: #account-menu / #account-btn / #account-dropdown
     - Legacy simple links:  #auth-user / #auth-login / #auth-logout
========================================================= */
function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
}

function getInitials(user){
  const base = (user && (user.name || user.email)) ? String(user.name || user.email).trim() : 'User'
  const parts = base.split(/\s+/).filter(Boolean)
  const first = (parts[0]?.[0] || 'U').toUpperCase()
  const second = (parts.length > 1 ? (parts[1]?.[0] || '') : '').toUpperCase()
  return (first + second) || 'U'
}

function setupAccountDropdownBehavior(){
  const menu = document.getElementById('account-menu')
  const btn = document.getElementById('account-btn')
  const dd = document.getElementById('account-dropdown')

  if (!menu || !btn || !dd) return null

  // Ensure button semantics even if implemented as <a>
  btn.setAttribute('aria-haspopup', 'menu')
  btn.setAttribute('aria-expanded', 'false')

  const open = () => {
    dd.style.display = 'block'
    btn.setAttribute('aria-expanded', 'true')
  }
  const close = () => {
    dd.style.display = 'none'
    btn.setAttribute('aria-expanded', 'false')
  }
  const toggle = () => (dd.style.display === 'block' ? close() : open())

  // Make the whole chip toggle dropdown.
  // If the user clicks directly on the name/avatar area, navigate to /account.html.
  btn.addEventListener('click', (e) => {
    const target = e.target
    const clickedNameOrAvatar = !!(target && (target.closest('#account-name') || target.closest('#account-avatar') || target.closest('img')))

    // Allow normal navigation to account page when clicking the text/avatar.
    if (clickedNameOrAvatar) return

    e.preventDefault()
    toggle()
  })

  // Close on outside click / Escape
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target)) close()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close()
  })

  // Prevent click inside dropdown from bubbling and closing before action
  dd.addEventListener('click', (e) => e.stopPropagation())

  return { open, close }
}

const __dropdownApi = setupAccountDropdownBehavior()

async function refreshAuthUI() {
  const userEl = document.getElementById('auth-user')
  const loginEl = document.getElementById('auth-login')
  const logoutEl = document.getElementById('auth-logout')

  const menu = document.getElementById('account-menu')
  const avatar = document.getElementById('account-avatar')
  const nameEl = document.getElementById('account-name')

  // If there is no auth UI on this page, do nothing.
  if (!loginEl && !menu && !userEl && !logoutEl) return

  const setLoggedOut = () => {
    if (menu) menu.style.display = 'none'
    if (loginEl) {
      loginEl.style.display = 'inline-flex'
      const next = location.pathname + location.search + location.hash
      try { loginEl.href = '/login.html?next=' + encodeURIComponent(next) } catch {}
    }
    if (userEl) userEl.style.display = 'none'
    if (logoutEl) logoutEl.style.display = 'none'
    __dropdownApi?.close?.()
  }

  const setLoggedIn = (user) => {
    if (loginEl) loginEl.style.display = 'none'

    if (menu) menu.style.display = 'inline-flex'
    if (nameEl) nameEl.textContent = user?.name || user?.email || 'My Account'

    if (avatar) {
      const url = user?.profile?.avatarUrl ? String(user.profile.avatarUrl).trim() : ''
      if (url) avatar.innerHTML = `<img alt="Avatar" src="${escapeHtml(url)}" />`
      else avatar.textContent = getInitials(user)
    }

    if (userEl) {
      userEl.textContent = `Hello, ${user?.name || user?.email || 'User'}`
      userEl.style.display = 'inline'
    }
    if (logoutEl) logoutEl.style.display = 'inline-block'
  }

  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
    // 401 is expected for guests; don't treat as an error.
    if (res.status === 401) return setLoggedOut()
    if (!res.ok) return setLoggedOut()
    const user = await res.json().catch(() => ({}))
    setLoggedIn(user)
  } catch {
    setLoggedOut()
  }
}

// Shared logout handler (works for both legacy + dropdown button)
document.getElementById('auth-logout')?.addEventListener('click', async (e) => {
  e?.preventDefault?.()
  try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }) } catch {}
  await refreshAuthUI()
  try { window.location.reload() } catch {}
})

document.addEventListener("DOMContentLoaded", () => {

  const API_URL = "/api/products"
  const CHECKOUT_URL = "/api/checkout"

  let allProducts = []
  let currentCategory = "All"
  let searchTerm = ""
  let selectedVehicle = null
  let sortOption = ""   // ✅ ADDED

  // AI / semantic search (frontend wiring)
  let semanticEnabled = true
  let semanticResultsById = new Map() // id -> { score }
  let semanticQuery = ''
  let semanticLoading = false
  let semanticError = ''
  let semanticDebounce = null

  // Pack A: advanced filters (persisted in URL)
  let priceMin = ""
  let priceMax = ""
  let stockFilter = "" // availableToday | shipsIn1to2Days | preOrder
  let compatibleOnly = false

  let cart = JSON.parse(localStorage.getItem("cart") || "[]")
  let selectedProduct = null

  /* ---------- CUSTOMER PAGINATION ---------- */
  let productsCurrentPage = 1
  let productsPageSize = Number(document.getElementById('products-page-size')?.value || 24)

  let recentlyViewed = JSON.parse(localStorage.getItem("recentlyViewed") || "[]")
  // Vehicle garage:
  // - If logged in, we sync with backend so it works across devices.
  // - If logged out, we fall back to localStorage.
  let vehicleGarage = JSON.parse(localStorage.getItem("vehicleGarage") || "[]")
  let compareList = JSON.parse(localStorage.getItem("compareList") || "[]")
  let wishlist = JSON.parse(localStorage.getItem("wishlist") || "[]")

  // Pack B: persisted default vehicle for the "Garage" (local fallback)
  let defaultVehicleId = Number(localStorage.getItem("defaultVehicleId") || "0") || null

  async function fetchGarageFromServer() {
    try {
      const res = await fetch('/api/garage', { credentials: 'same-origin' })
      // Guests will get 401 here; treat as "no garage" without logging noise.
      if (res.status === 401) return null
      if (!res.ok) return null
      const data = await res.json().catch(() => null)
      return data
    } catch {
      return null
    }
  }

  async function saveGarageToServer(payload) {
    try {
      const res = await fetch('/api/garage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload || {}),
      })
      if (!res.ok) return null
      return await res.json().catch(() => null)
    } catch {
      return null
    }
  }

  async function garageSyncIfLoggedIn() {
    // If user is authenticated, prefer backend garage
    try {
      const meRes = await fetch('/api/auth/me', { credentials: 'same-origin' })
      if (meRes.status === 401) return false
      if (!meRes.ok) return false

      const serverGarage = await fetchGarageFromServer()
      if (serverGarage && Array.isArray(serverGarage.vehicles)) {
        vehicleGarage = serverGarage.vehicles
        defaultVehicleId = serverGarage.defaultVehicleId || null
        localStorage.setItem('vehicleGarage', JSON.stringify(vehicleGarage))
        localStorage.setItem('defaultVehicleId', String(defaultVehicleId || ''))
        return true
      }

      // No garage on server yet: seed it from local storage
      await saveGarageToServer({ vehicles: vehicleGarage, defaultVehicleId })
      return true
    } catch {
      return false
    }
  }

  // Wishlist helpers (standardized)
  const getWishlist = () => JSON.parse(localStorage.getItem("wishlist") || "[]")
  const setWishlist = (items) => { wishlist = items; localStorage.setItem("wishlist", JSON.stringify(wishlist)) }
  const addToWishlist = (product) => {
    const items = getWishlist()
    if (!items.find(p => p.id === product.id)) {
      items.push(product)
      setWishlist(items)
      updateWishlistBadge()
    }
    return items
  }

  const productsContainer = document.getElementById("products")
  const modal = document.getElementById("product-modal")
  const cartDrawer = document.getElementById("cart-drawer")
  const compareModal = document.getElementById("compare-modal")
  const compareTable = document.getElementById("compare-table")
  const compareCount = document.getElementById("compare-count")
  const compareOpenBtn = document.getElementById("compare-open")

  const wishlistOpenBtn = document.getElementById("wishlist-open")
  const wishlistCountEl = document.getElementById("wishlist-count")
  // Ensure header wishlist button opens wishlist page
  if (wishlistOpenBtn) {
    wishlistOpenBtn.addEventListener('click', (e) => {
      e.preventDefault()
      // Prefer dedicated page if present
      window.location.href = "/wishlist.html"
    })
  }
  const wishlistSection = document.getElementById("wishlist")
  const wishlistList = document.getElementById("wishlist-list")
  const wishlistClearBtn = document.getElementById("wishlist-clear")

  // Close modal when clicking outside
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden")
      }
    })
  }

  // Close modal on escape key
  document.addEventListener("keydown", (e) => {
    if (modal && e.key === "Escape" && !modal.classList.contains("hidden")) {
      modal.classList.add("hidden")
    }
  })

  const makeSelect = document.getElementById("vehicle-make")
  const modelSelect = document.getElementById("vehicle-model")
  const yearSelect = document.getElementById("vehicle-year")
  const engineSelect = document.getElementById("vehicle-engine")
  const applyVehicleBtn = document.getElementById("apply-vehicle")

  const saveVehicleBtn = document.getElementById("save-vehicle")

  const vehicleBanner = document.getElementById("selected-vehicle-banner")
  const vehicleText = document.getElementById("selected-vehicle-text")
  const changeVehicleBtn = document.getElementById("change-vehicle")

  /* ===============================
     Pack A helpers
  ================================ */
  function parseNumberOrEmpty(v) {
    const s = String(v ?? '').trim()
    if (s === '') return ''
    const n = Number(s)
    return Number.isFinite(n) ? n : ''
  }

  function stockMatches(product) {
    if (!stockFilter) return true
    const s = product.stockStatus || {}
    if (stockFilter === 'availableToday') return !!s.availableToday
    if (stockFilter === 'shipsIn1to2Days') return !!s.shipsIn1to2Days
    if (stockFilter === 'preOrder') return !!s.preOrderDate
    return true
  }

  function applyFiltersFromUrl() {
    const params = new URLSearchParams(location.search)
    if (params.has('q')) searchTerm = (params.get('q') || '').trim()
    if (params.has('cat')) currentCategory = params.get('cat') || 'All'
    if (params.has('sort')) sortOption = params.get('sort') || ''

    priceMin = parseNumberOrEmpty(params.get('min'))
    priceMax = parseNumberOrEmpty(params.get('max'))
    stockFilter = (params.get('stock') || '').trim()
    compatibleOnly = (params.get('compat') || '') === '1'

    // Apply to UI
    const searchInput = document.getElementById("search-input")
    const sortSelect = document.getElementById("sort-select")
    const priceMinInput = document.getElementById('price-min')
    const priceMaxInput = document.getElementById('price-max')
    const stockFilterSelect = document.getElementById('stock-filter')
    const compatibleOnlyInput = document.getElementById('compatible-only')

    if (searchInput) searchInput.value = searchTerm
    if (sortSelect) sortSelect.value = sortOption
    if (priceMinInput) priceMinInput.value = priceMin === '' ? '' : String(priceMin)
    if (priceMaxInput) priceMaxInput.value = priceMax === '' ? '' : String(priceMax)
    if (stockFilterSelect) stockFilterSelect.value = stockFilter
    if (compatibleOnlyInput) compatibleOnlyInput.checked = !!compatibleOnly

    // Category active button
    document.querySelectorAll('[data-category]').forEach(b => {
      b.classList.toggle('active', (b.dataset.category || 'All') === currentCategory)
    })
  }

  function syncFiltersToUrl() {
    const params = new URLSearchParams()

    if (searchTerm) params.set('q', searchTerm)
    if (currentCategory && currentCategory !== 'All') params.set('cat', currentCategory)
    if (sortOption) params.set('sort', sortOption)

    const minN = parseNumberOrEmpty(priceMin)
    const maxN = parseNumberOrEmpty(priceMax)
    if (minN !== '') params.set('min', String(minN))
    if (maxN !== '') params.set('max', String(maxN))

    if (stockFilter) params.set('stock', stockFilter)
    if (compatibleOnly) params.set('compat', '1')

    const next = params.toString()
    const newUrl = location.pathname + (next ? `?${next}` : '') + location.hash
    history.replaceState(null, '', newUrl)
  }

  /* ===============================
     SEARCH INPUT + SUGGESTIONS (Pack A)
  ================================ */
  const searchInput = document.getElementById("search-input")
  const suggestionsEl = document.getElementById("search-suggestions")

  function getSearchSuggestions(term) {
    const t = (term || "").trim().toLowerCase()
    if (!t) return []

    const matches = allProducts
      .filter(p => {
        const name = (p.name || "").toLowerCase()
        const pn = (p.partNumber || "").toLowerCase()
        return name.includes(t) || pn.includes(t)
      })
      .sort((a, b) => {
        const apn = (a.partNumber || "").toLowerCase()
        const bpn = (b.partNumber || "").toLowerCase()
        const aScore = apn === t ? 3 : apn.startsWith(t) ? 2 : apn.includes(t) ? 1 : 0
        const bScore = bpn === t ? 3 : bpn.startsWith(t) ? 2 : bpn.includes(t) ? 1 : 0
        if (aScore !== bScore) return bScore - aScore
        return (a.name || "").localeCompare(b.name || "")
      })

    const seen = new Set()
    const out = []
    for (const p of matches) {
      if (seen.has(p.id)) continue
      seen.add(p.id)
      out.push(p)
      if (out.length >= 8) break
    }
    return out
  }

  function hideSuggestions() {
    if (!suggestionsEl) return
    suggestionsEl.classList.add('hidden')
    suggestionsEl.innerHTML = ''
  }

  function showSuggestions(items) {
    if (!suggestionsEl) return
    if (!items.length) return hideSuggestions()

    suggestionsEl.innerHTML = items.map(p => {
      const pn = (p.partNumber || '').trim()
      const name = (p.name || '').trim()
      const label = pn && name ? `${pn} — ${name}` : (pn || name)
      const img = (p.imageUrl || "").trim() || "/images/placeholder.png"

      return `
        <button type="button" class="suggestion-item" data-id="${p.id}" role="option" title="${label.replaceAll('"', '&quot;')}">
          <img class="suggestion-thumb" src="${img}" alt="" loading="lazy" />
          <div class="suggestion-meta">
            <div class="suggestion-name">${name || pn || ''}</div>
          </div>
        </button>
      `.trim()
    }).join('')

    suggestionsEl.classList.remove('hidden')

    suggestionsEl.querySelectorAll('[data-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id')
        const product = allProducts.find(x => String(x.id) === String(id))
        if (!product) return
        searchTerm = product.partNumber || product.name
        if (searchInput) searchInput.value = searchTerm
        hideSuggestions()
        syncFiltersToUrl()
        triggerSearchPipeline(searchTerm)
        openModal(product)
      })
    })
  }

  if (searchInput) {
    searchInput.addEventListener("input", e => {
      searchTerm = e.target.value.trim()
      showSuggestions(getSearchSuggestions(searchTerm))
      syncFiltersToUrl()
      triggerSearchPipeline(searchTerm)
    })

    searchInput.addEventListener('focus', () => {
      if (searchTerm) showSuggestions(getSearchSuggestions(searchTerm))
    })

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideSuggestions()
    })

    document.addEventListener('click', (e) => {
      if (!suggestionsEl) return
      if (e.target === searchInput) return
      if (suggestionsEl.contains(e.target)) return
      hideSuggestions()
    })
  }

  /* ===============================
     SORT DROPDOWN FIX  ✅
  ================================ */
  const sortSelect = document.getElementById("sort-select")
  if (sortSelect) {
    sortSelect.addEventListener("change", e => {
      sortOption = e.target.value
      syncFiltersToUrl()
      renderProducts()
    })
  }

  /* ===============================
     CATEGORY FILTER
  ================================ */
  document.querySelectorAll("[data-category]").forEach(btn => {
    btn.addEventListener("click", () => {
      currentCategory = btn.dataset.category

      document.querySelectorAll("[data-category]").forEach(b =>
        b.classList.remove("active")
      )
      btn.classList.add("active")

      syncFiltersToUrl()
      renderProducts()
    })
  })

  /* ===============================
     PACK A FILTER CONTROLS
  ================================ */
  const priceMinInput = document.getElementById('price-min')
  const priceMaxInput = document.getElementById('price-max')
  const stockFilterSelect = document.getElementById('stock-filter')
  const compatibleOnlyInput = document.getElementById('compatible-only')
  const clearFiltersBtn = document.getElementById('clear-filters')

  function bindFilterInputs() {
    const onAnyChange = () => {
      priceMin = parseNumberOrEmpty(priceMinInput?.value)
      priceMax = parseNumberOrEmpty(priceMaxInput?.value)
      stockFilter = (stockFilterSelect?.value || '').trim()
      compatibleOnly = !!compatibleOnlyInput?.checked
      syncFiltersToUrl()
      renderProducts()
    }

    priceMinInput?.addEventListener('input', onAnyChange)
    priceMaxInput?.addEventListener('input', onAnyChange)
    stockFilterSelect?.addEventListener('change', onAnyChange)
    compatibleOnlyInput?.addEventListener('change', onAnyChange)

    clearFiltersBtn?.addEventListener('click', () => {
      searchTerm = ''
      sortOption = ''
      priceMin = ''
      priceMax = ''
      stockFilter = ''
      compatibleOnly = false

      if (searchInput) searchInput.value = ''
      hideSuggestions()
      if (sortSelect) sortSelect.value = ''
      if (priceMinInput) priceMinInput.value = ''
      if (priceMaxInput) priceMaxInput.value = ''
      if (stockFilterSelect) stockFilterSelect.value = ''
      if (compatibleOnlyInput) compatibleOnlyInput.checked = false

      syncFiltersToUrl()
      triggerSearchPipeline(searchTerm)
    })
  }

  /* ===============================
     AI UI + semantic helpers
  ================================ */
  function ensureAiUi() {
    // Floating AI bot anchored near WhatsApp button
    if (document.getElementById('ai-float')) return

    const wa = document.getElementById('whatsapp-float')
    if (!wa) return

    // Floating button
    const btn = document.createElement('button')
    btn.id = 'ai-float'
    btn.type = 'button'
    btn.setAttribute('aria-label', 'AI Assistant')
    btn.style.position = 'fixed'
    btn.style.right = '24px'
    btn.style.bottom = '110px'
    btn.style.width = '56px'
    btn.style.height = '56px'
    btn.style.borderRadius = '999px'
    btn.style.border = '1px solid rgba(255,255,255,0.18)'
    btn.style.background = 'linear-gradient(135deg, rgba(59,130,246,0.95), rgba(99,102,241,0.95))'
    btn.style.boxShadow = '0 18px 45px rgba(59,130,246,0.35)'
    btn.style.color = '#fff'
    btn.style.cursor = 'pointer'
    btn.style.zIndex = '9999'
    btn.style.display = 'flex'
    btn.style.alignItems = 'center'
    btn.style.justifyContent = 'center'
    btn.style.fontSize = '22px'
    btn.textContent = 'AI'

    // Chat drawer
    const drawer = document.createElement('div')
    drawer.id = 'ai-drawer'
    drawer.style.position = 'fixed'
    drawer.style.right = '24px'
    drawer.style.bottom = '170px'
    drawer.style.width = 'min(420px, calc(100vw - 48px))'
    drawer.style.maxHeight = '60vh'
    drawer.style.overflow = 'hidden'
    drawer.style.borderRadius = '16px'
    drawer.style.border = '1px solid rgba(255,255,255,0.14)'
    drawer.style.background = 'rgba(11,18,32,0.92)'
    drawer.style.backdropFilter = 'blur(10px)'
    drawer.style.boxShadow = '0 24px 60px rgba(0,0,0,0.45)'
    drawer.style.zIndex = '9999'
    drawer.style.display = 'none'

    drawer.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 12px; border-bottom:1px solid rgba(255,255,255,0.10);">
        <div>
          <div style="font-weight:800;">AI Assistant</div>
          <div style="opacity:.8; font-size:12px;">Ask for parts, symptoms, compatibility.</div>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <label style="display:flex; align-items:center; gap:8px; font-size:12px; opacity:.9;">
            <input id="semantic-toggle" type="checkbox" checked />
            Smart search
          </label>
          <button id="ai-close" type="button" style="border-radius:10px; padding:8px 10px;">Close</button>
        </div>
      </div>
      <div id="ai-chat" style="padding:12px; overflow:auto; max-height:38vh;"></div>
      <div style="display:flex; gap:8px; padding:12px; border-top:1px solid rgba(255,255,255,0.10);">
        <input id="ai-query" type="text" placeholder="e.g. Mercedes W221 air suspension leaking" style="flex:1; padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,0.14); background:rgba(255,255,255,0.06); color:#fff;" />
        <button id="ai-ask" type="button" style="padding:10px 14px; border-radius:12px;">Send</button>
      </div>
      <div id="ai-status" style="padding:0 12px 12px; font-size:12px; opacity:.85;"></div>
    `.trim()

    document.body.appendChild(btn)
    document.body.appendChild(drawer)

    const chatEl = drawer.querySelector('#ai-chat')
    const statusEl = drawer.querySelector('#ai-status')
    const queryEl = drawer.querySelector('#ai-query')
    const askBtn = drawer.querySelector('#ai-ask')
    const closeBtn = drawer.querySelector('#ai-close')

    function addBubble(text, who) {
      if (!chatEl) return
      const b = document.createElement('div')
      b.style.margin = '0 0 10px 0'
      b.style.display = 'flex'
      b.style.justifyContent = who === 'user' ? 'flex-end' : 'flex-start'
      b.innerHTML = `
        <div style="max-width:85%; padding:10px 12px; border-radius:14px; border:1px solid rgba(255,255,255,0.10); background:${who === 'user' ? 'rgba(59,130,246,0.18)' : 'rgba(148,163,184,0.12)'};">
          <div style="white-space:pre-wrap; font-size:13px;">${String(text).replaceAll('<','&lt;').replaceAll('>','&gt;')}</div>
        </div>
      `.trim()
      chatEl.appendChild(b)
      chatEl.scrollTop = chatEl.scrollHeight
    }

    function toggle(open) {
      drawer.style.display = open ? 'block' : 'none'
      if (open) {
        queryEl?.focus()
        if (chatEl && chatEl.childElementCount === 0) {
          addBubble('Tell me your car (make/model/year) and what part you need, or describe the symptom.', 'bot')
        }
      }
    }

    btn.addEventListener('click', () => toggle(drawer.style.display === 'none'))
    closeBtn?.addEventListener('click', () => toggle(false))

    const semanticToggle = drawer.querySelector('#semantic-toggle')
    if (semanticToggle) {
      semanticToggle.checked = !!semanticEnabled
      semanticToggle.addEventListener('change', () => {
        semanticEnabled = !!semanticToggle.checked
        triggerSearchPipeline(searchTerm)
      })
    }

    const send = async () => {
      const q = String(queryEl?.value || '').trim()
      if (!q) return
      queryEl.value = ''
      addBubble(q, 'user')
      if (statusEl) statusEl.textContent = 'Thinking…'

      let resp = null
      try {
        resp = await runAiPartFinder(q, { renderToChat: true })
      } catch (_) {
        resp = null
      }

      if (statusEl) statusEl.textContent = ''

      // If backend AI is down/misconfigured, still respond with something useful.
      if (!resp) {
        addBubble(
          'I\'m not available right now. Try describing: (1) car make/model/year/engine, (2) part name/part number, (3) symptoms. You can also use the catalog search above.',
          'bot'
        )
        return
      }

      if (resp?.diagnosis) addBubble(resp.diagnosis, 'bot')

      const items = Array.isArray(resp?.results) ? resp.results : []
      if (items.length) {
        const lines = items.slice(0, 5).map(r => {
          const p = r.product || {}
          const conf = Math.round(Number(r.confidence || 0) * 100)
          const title = (p.name || '').trim() || 'Product'
          const pn = (p.partNumber || p.part_number || '').trim()
          return `- (${conf}%) ${title}${pn ? ` [${pn}]` : ''}`
        }).join('\n')
        addBubble('Top matches:\n' + lines + '\n\nTap a product card in the catalog to open details.', 'bot')
      } else {
        addBubble('No matches found. Try a part number, or include your car make/model/year.', 'bot')
      }
    }

    askBtn?.addEventListener('click', send)
    queryEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') send()
    })
  }

  async function runAiPartFinder(q, opts = {}) {
    const { renderToChat = false } = opts

    // When used by the floating bot, it will render bubbles itself.
    // Keep the legacy elements optional.
    const statusEl = document.getElementById('ai-status')
    const resultsEl = document.getElementById('ai-results')

    if (!renderToChat) {
      if (statusEl) statusEl.textContent = 'Thinking…'
      if (resultsEl) resultsEl.innerHTML = ''
    }

    try {
      const payload = {
        message: q,
        vehicle: selectedVehicle ? {
          make: selectedVehicle.make,
          model: selectedVehicle.model,
          year: selectedVehicle.year,
          engine: selectedVehicle.engine,
        } : null,
        maxResults: 8,
      }

      const res = await fetch('/api/products/ai/part-finder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = data?.details
          ? `${data.error || data.message || 'AI request failed'}: ${String(data.details)}`
          : (data.error || data.message || 'AI request failed')
        // When used by the floating bot, show a visible error instead of failing silently.
        if (renderToChat) throw new Error(msg)
        if (statusEl) statusEl.textContent = msg
        return null
      }

      if (!renderToChat) {
        const diag = data.diagnosis ? String(data.diagnosis) : ''
        const qs = Array.isArray(data.suggestedQuestions) ? data.suggestedQuestions : []
        const items = Array.isArray(data.results) ? data.results : []

        if (statusEl) {
          statusEl.textContent = diag || (items.length ? 'Top matches found.' : 'No matches found.')
        }

        if (resultsEl) {
          const qHtml = qs.length
            ? `<div style="margin-top:6px; opacity:.9;"><strong>AI questions:</strong> ${qs.map(x => `<span style="margin-right:6px;">${String(x)}</span>`).join(' ')}</div>`
            : ''

          const listHtml = items.map(r => {
            const p = r.product || {}
            const conf = Math.round(Number(r.confidence || 0) * 100)
            const why = String(r.why || '')
            const img = (p.imageUrl || p.image || '').trim() || '/images/placeholder.png'
            const title = (p.name || '').trim() || 'Product'
            const price = (p.price != null) ? `AED ${p.price}` : ''
            const pn = (p.partNumber || p.part_number || '').trim()

            return `
              <div class="product-card" data-ai-product-id="${p.id}" style="cursor:pointer;">
                <div class="product-image-wrapper">
                  <img src="${img}" alt="${title}" loading="lazy" />
                </div>
                <div class="product-content">
                  <div class="product-header">
                    <h3>${title}</h3>
                    <span class="part-number">${pn || 'N/A'}</span>
                  </div>
                  <div class="product-tags">
                    <span class="promo-tag" style="background:#0b3b60; border:1px solid rgba(59,130,246,0.35);">Confidence: ${conf}%</span>
                  </div>
                  <div style="font-size:13px; opacity:.9; margin-top:6px;">${why ? why : ''}</div>
                  <div class="product-footer" style="margin-top:8px;">
                    <p class="price">${price}</p>
                    <span class="view-details">View →</span>
                  </div>
                </div>
              </div>
            `.trim()
          }).join('')

          resultsEl.innerHTML = qHtml + (listHtml || '')

          resultsEl.querySelectorAll('[data-ai-product-id]').forEach(el => {
            el.addEventListener('click', () => {
              const id = el.getAttribute('data-ai-product-id')
              const product = allProducts.find(p => String(p.id) === String(id))
              if (product) openModal(product)
            })
          })
        }
      }

      return data
    } catch (e) {
      console.error(e)
      if (!renderToChat && statusEl) statusEl.textContent = 'AI request failed.'
      return null
    }
  }

  async function fetchSemanticResults(term) {
    const q = String(term || '').trim()
    if (!q) {
      semanticResultsById = new Map()
      semanticQuery = ''
      semanticError = ''
      semanticLoading = false
      return
    }

    clearTimeout(semanticDebounce)
    semanticDebounce = setTimeout(async () => {
      semanticLoading = true
      semanticError = ''
      semanticQuery = q

      try {
        const res = await fetch(`/api/products/semantic-search?q=${encodeURIComponent(q)}&k=50`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          semanticError = data.error || data.message || 'Semantic search failed'
          semanticResultsById = new Map()
          semanticLoading = false
          renderProducts()
          return
        }

        const results = Array.isArray(data.results) ? data.results : []
        const map = new Map()
        results.forEach(r => {
          if (r && r.id != null) map.set(String(r.id), { score: Number(r.score || 0) })
        })
        semanticResultsById = map
        semanticLoading = false
        renderProducts()
      } catch (e) {
        console.error(e)
        semanticError = 'Semantic search failed'
        semanticResultsById = new Map()
        semanticLoading = false
        renderProducts()
      }
    }, 250)
  }

  function triggerSearchPipeline(term) {
    if (semanticEnabled && String(term || '').trim()) {
      fetchSemanticResults(term)
    } else {
      semanticResultsById = new Map()
      semanticQuery = ''
      semanticError = ''
      semanticLoading = false
      renderProducts()
    }
  }

  let vehicleData = {}

  function validateCustomerDetails() {
    const name = document.getElementById("customer-name")?.value.trim()
    const phone = document.getElementById("customer-phone")?.value.trim()

    if (!name || !phone) {
      alert("Please enter your name and phone number")
      return false
    }
    return true
  }

  async function loadProducts() {
    // Sync garage across devices when logged in.
    await garageSyncIfLoggedIn()

    const res = await fetch(API_URL)
    allProducts = await res.json()
    vehicleData = buildVehicleData(allProducts)
    initVehicleSelector()
    restoreVehicle()

    // Pack A
    applyFiltersFromUrl()
    bindFilterInputs()

    ensureAiUi()

    bindProductsPagination()

    renderProducts()
    restoreCustomerDetails()
    updateCart()
    renderGarage()

    // Optional features (only run if implemented)
    if (typeof renderRecentlyViewed === 'function') renderRecentlyViewed()
    if (typeof updateCompareBadge === 'function') updateCompareBadge()
    updateWishlistBadge()
    renderWishlist()
    bindWishlistHeader()

    // Initial semantic run if q was passed in URL
    if (semanticEnabled && searchTerm) triggerSearchPipeline(searchTerm)
  }

  function buildVehicleData(products) {
    const data = {}
    products.forEach(p => {
      p.compatibleVehicles?.forEach(v => {
        const parts = v.split("|").map(x => x.trim())
        if (parts.length !== 4) return
        const [make, model, year, engine] = parts
        data[make] ??= {}
        data[make][model] ??= {}
        data[make][model][year] ??= new Set()
        data[make][model][year].add(engine)
      })
    })
    return data
  }

  function resetSelect(select, label) {
    select.innerHTML = `<option value="">${label}</option>`
    select.disabled = true
  }

  function populateSelect(select, values) {
    values.forEach(v => {
      const opt = document.createElement("option")
      opt.value = v
      opt.textContent = v
      select.appendChild(opt)
    })
    select.disabled = false
  }

  function initVehicleSelector() {
    // Some pages (admin, etc.) don't have the vehicle selector.
    if (!makeSelect || !modelSelect || !yearSelect || !engineSelect) return

    resetSelect(modelSelect, "Select model")
    resetSelect(yearSelect, "Select year")
    resetSelect(engineSelect, "Select engine")

    // Always reset action buttons until a full vehicle is selected
    if (applyVehicleBtn) applyVehicleBtn.disabled = true
    if (saveVehicleBtn) saveVehicleBtn.disabled = true

    // Populate makes in stable order
    populateSelect(makeSelect, Object.keys(vehicleData).sort((a, b) => a.localeCompare(b)))
  }

  function syncVehicleButtons() {
    const ready = !!(makeSelect?.value && modelSelect?.value && yearSelect?.value && engineSelect?.value)
    if (applyVehicleBtn) applyVehicleBtn.disabled = !ready
    if (saveVehicleBtn) saveVehicleBtn.disabled = !ready
  }

  if (makeSelect) makeSelect.onchange = () => {
    if (!modelSelect || !yearSelect || !engineSelect) return

    resetSelect(modelSelect, "Select model")
    resetSelect(yearSelect, "Select year")
    resetSelect(engineSelect, "Select engine")

    // Some UI state can get stuck after changing make; always re-sync.
    syncVehicleButtons()

    const make = (makeSelect.value || '').trim()
    if (make && vehicleData[make]) {
      populateSelect(modelSelect, Object.keys(vehicleData[make]).sort((a, b) => a.localeCompare(b)))
    }
  }

  if (modelSelect) modelSelect.onchange = () => {
    if (!makeSelect || !yearSelect || !engineSelect) return

    resetSelect(yearSelect, "Select year")
    resetSelect(engineSelect, "Select engine")
    syncVehicleButtons()

    const make = (makeSelect.value || '').trim()
    const model = (modelSelect.value || '').trim()
    if (make && model && vehicleData[make]?.[model]) {
      // Years should be displayed newest-first when numeric.
      const years = Object.keys(vehicleData[make][model])
      years.sort((a, b) => {
        const an = Number(a), bn = Number(b)
        if (Number.isFinite(an) && Number.isFinite(bn)) return bn - an
        return a.localeCompare(b)
      })
      populateSelect(yearSelect, years)
    }
  }

  if (yearSelect) yearSelect.onchange = () => {
    if (!makeSelect || !modelSelect || !engineSelect) return

    resetSelect(engineSelect, "Select engine")
    syncVehicleButtons()

    const make = (makeSelect.value || '').trim()
    const model = (modelSelect.value || '').trim()
    const year = (yearSelect.value || '').trim()

    const engines = vehicleData?.[make]?.[model]?.[year]
    if (make && model && year && engines) {
      populateSelect(engineSelect, Array.from(engines).sort((a, b) => a.localeCompare(b)))
    }
  }

  if (engineSelect) engineSelect.onchange = () => {
    syncVehicleButtons()
  }

  if (applyVehicleBtn) applyVehicleBtn.onclick = () => {
    if (!makeSelect || !modelSelect || !yearSelect || !engineSelect) return

    if (!(makeSelect.value && modelSelect.value && yearSelect.value && engineSelect.value)) {
      alert('Please select Make, Model, Year and Engine')
      return
    }

    selectedVehicle = {
      make: makeSelect.value,
      model: modelSelect.value,
      year: yearSelect.value,
      engine: engineSelect.value
    }

    localStorage.setItem("selectedVehicle", JSON.stringify(selectedVehicle))

    if (vehicleText) {
      vehicleText.textContent =
        `Showing parts for ${selectedVehicle.make} ${selectedVehicle.model} ${selectedVehicle.year} ${selectedVehicle.engine}`
    }
    if (vehicleBanner) vehicleBanner.classList.remove("hidden")

    // Turn on compatibility-only filtering (this matches the user's intent of the button)
    compatibleOnly = true
    const compatibleOnlyInput2 = document.getElementById('compatible-only')
    if (compatibleOnlyInput2) compatibleOnlyInput2.checked = true
    syncFiltersToUrl()

    renderProducts()
  }

  if (saveVehicleBtn) saveVehicleBtn.onclick = async () => {
    if (!makeSelect || !modelSelect || !yearSelect || !engineSelect) return
    if (!(makeSelect.value && modelSelect.value && yearSelect.value && engineSelect.value)) {
      alert('Please select Make, Model, Year and Engine')
      return
    }

    const vehicle = {
      id: Date.now(),
      make: makeSelect.value,
      model: modelSelect.value,
      year: yearSelect.value,
      engine: engineSelect.value
    }

    vehicleGarage.push(vehicle)
    localStorage.setItem("vehicleGarage", JSON.stringify(vehicleGarage))

    // If it's the first saved vehicle, make it default automatically
    if (!defaultVehicleId) {
      defaultVehicleId = vehicle.id
      localStorage.setItem("defaultVehicleId", String(defaultVehicleId))
    }

    // Best-effort server sync
    await saveGarageToServer({ vehicles: vehicleGarage, defaultVehicleId })

    renderGarage()
  }

  async function setDefaultVehicle(id) {
    const v = vehicleGarage.find(x => x.id === id)
    if (!v) return
    defaultVehicleId = id
    localStorage.setItem("defaultVehicleId", String(id))
    await saveGarageToServer({ vehicles: vehicleGarage, defaultVehicleId })

    // Premium behaviour: setting default also applies it immediately
    selectedVehicle = v
    localStorage.setItem("selectedVehicle", JSON.stringify(selectedVehicle))
    vehicleBanner?.classList.remove("hidden")
    if (vehicleText) vehicleText.textContent = `Showing parts for ${v.make} ${v.model} ${v.year} ${v.engine}`

    renderGarage()
    renderProducts()
  }

  function renderGarage() {
    const list = document.getElementById("garage-list")
    if (!list) return
    list.innerHTML = ""

    if (!vehicleGarage.length) {
      list.innerHTML = `<li style="opacity:.8;">No saved vehicles yet.</li>`
      return
    }

    vehicleGarage.forEach(v => {
      const isDefault = defaultVehicleId && v.id === defaultVehicleId
      const li = document.createElement("li")
      li.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div>
            <strong>${v.make} ${v.model}</strong> ${v.year} ${v.engine}
            ${isDefault ? '<span style="margin-left:8px; font-size:12px; padding:2px 6px; border-radius:999px; background:#111827; color:#fff;">Default</span>' : ''}
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button type="button" onclick="selectGarageVehicle(${v.id})">Select</button>
            <button type="button" onclick="setDefaultGarageVehicle(${v.id})">Make default</button>
            <button type="button" onclick="removeGarageVehicle(${v.id})">Remove</button>
          </div>
        </div>
      `
      list.appendChild(li)
    })
  }

  window.setDefaultGarageVehicle = id => { setDefaultVehicle(id) }

  window.selectGarageVehicle = id => {
    const v = vehicleGarage.find(v => v.id === id)
    if (v) {
      selectedVehicle = v
      localStorage.setItem("selectedVehicle", JSON.stringify(selectedVehicle))
      vehicleBanner?.classList.remove("hidden")
      if (vehicleText) vehicleText.textContent = `Showing parts for ${v.make} ${v.model} ${v.year} ${v.engine}`
      renderProducts()
      renderGarage()
    }
  }

  window.removeGarageVehicle = async id => {
    vehicleGarage = vehicleGarage.filter(v => v.id !== id)
    localStorage.setItem("vehicleGarage", JSON.stringify(vehicleGarage))

    if (defaultVehicleId === id) {
      defaultVehicleId = null
      localStorage.removeItem("defaultVehicleId")
    }

    // If user removed currently-selected vehicle, fall back to default (or clear)
    if (selectedVehicle && selectedVehicle.id === id) {
      selectedVehicle = null
      localStorage.removeItem("selectedVehicle")
    }

    // Best-effort server sync
    await saveGarageToServer({ vehicles: vehicleGarage, defaultVehicleId })

    renderGarage()
    restoreVehicle()
    renderProducts()
  }

  if (changeVehicleBtn) {
    changeVehicleBtn.onclick = () => {
      selectedVehicle = null
      localStorage.removeItem("selectedVehicle")
      if (vehicleBanner) vehicleBanner.classList.add("hidden")
      renderGarage()
      renderProducts()
    }
  }

  function restoreVehicle() {
    // Priority: last selected vehicle -> default vehicle -> none
    const saved = localStorage.getItem("selectedVehicle")
    if (saved) {
      selectedVehicle = JSON.parse(saved)
    } else if (defaultVehicleId) {
      const dv = vehicleGarage.find(v => v.id === defaultVehicleId)
      if (dv) selectedVehicle = dv
    }

    if (selectedVehicle) {
      vehicleBanner?.classList.remove("hidden")
      if (vehicleText) vehicleText.textContent =
        `Showing parts for ${selectedVehicle.make} ${selectedVehicle.model} ${selectedVehicle.year} ${selectedVehicle.engine}`
      // Keep selectedVehicle persisted if it came from default
      localStorage.setItem("selectedVehicle", JSON.stringify(selectedVehicle))
    }
  }

  function getVehicleKey(v) {
    if (!v) return ''
    return `${v.make}|${v.model}|${v.year}|${v.engine}`
  }

  // Pack B: fitment evaluation for cards + modal
  function evaluateFitment(product, vehicle) {
    if (!vehicle) {
      return { status: 'none', reasons: ['Select a vehicle to check fitment.'] }
    }

    const key = getVehicleKey(vehicle)
    const list = product.compatibleVehicles || []

    const exactMatch = list.includes(key)
    if (exactMatch) {
      return { status: 'guaranteed', reasons: [] }
    }

    // If product doesn't declare fitment, we can't confirm.
    if (!Array.isArray(list) || list.length === 0) {
      return { status: 'warning', reasons: ['No fitment data provided for this product.'] }
    }

    const desired = {
      make: String(vehicle.make || '').trim(),
      model: String(vehicle.model || '').trim(),
      year: String(vehicle.year || '').trim(),
      engine: String(vehicle.engine || '').trim(),
    }

    const parsed = list
      .map(s => String(s).split('|').map(x => (x || '').trim()))
      .filter(parts => parts.length === 4)
      .map(([make, model, year, engine]) => ({ make, model, year, engine }))

    const hasMake = parsed.some(x => x.make === desired.make)
    const hasModel = parsed.some(x => x.make === desired.make && x.model === desired.model)
    const hasYear = parsed.some(x => x.make === desired.make && x.model === desired.model && x.year === desired.year)
    const hasEngine = parsed.some(x => x.make === desired.make && x.model === desired.model && x.year === desired.year && x.engine === desired.engine)

    const reasons = []
    if (!hasMake) reasons.push(`Not listed for make: ${desired.make}`)
    else if (!hasModel) reasons.push(`Not listed for model: ${desired.model}`)
    else if (!hasYear) reasons.push(`Not listed for year: ${desired.year}`)
    else if (!hasEngine) reasons.push(`Not listed for engine: ${desired.engine}`)

    // Fallback
    if (!reasons.length && !hasEngine) reasons.push('Compatibility not confirmed for your exact configuration.')

    return { status: 'warning', reasons }
  }

  function bindProductsPagination() {
    const sizeSel = document.getElementById('products-page-size')
    const prevBtn = document.getElementById('products-prev')
    const nextBtn = document.getElementById('products-next')

    if (sizeSel) {
      sizeSel.addEventListener('change', () => {
        const v = Number(sizeSel.value || 24)
        productsPageSize = Number.isFinite(v) && v > 0 ? v : 24
        productsCurrentPage = 1
        renderProducts()
        document.getElementById('products')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }

    prevBtn?.addEventListener('click', () => {
      if (productsCurrentPage > 1) {
        productsCurrentPage--
        renderProducts()
        document.getElementById('products')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    })

    nextBtn?.addEventListener('click', () => {
      // total pages computed inside renderProducts; here we just attempt next.
      productsCurrentPage++
      renderProducts()
      document.getElementById('products')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function renderProducts() {
    // If the products container doesn't exist on the page, avoid crashing the script.
    if (!productsContainer) return

    productsContainer.innerHTML = ""
    let filtered = [...allProducts]

    if (currentCategory !== "All") {
      filtered = filtered.filter(p => p.category === currentCategory)
    }

    if (searchTerm) {
      const t = searchTerm.toLowerCase()
      const semanticActive = semanticEnabled && semanticQuery && semanticQuery.toLowerCase() === t && semanticResultsById.size > 0

      if (semanticActive) {
        filtered = filtered.filter(p => semanticResultsById.has(String(p.id)))
      } else {
        filtered = filtered.filter(p =>
          (p.name || '').toLowerCase().includes(t) ||
          (p.partNumber || '').toLowerCase().includes(t)
        )
      }
    }

    // Pack A: price range
    const minN = parseNumberOrEmpty(priceMin)
    const maxN = parseNumberOrEmpty(priceMax)
    if (minN !== '') filtered = filtered.filter(p => Number(p.price) >= minN)
    if (maxN !== '') filtered = filtered.filter(p => Number(p.price) <= maxN)

    // Pack A: stock
    filtered = filtered.filter(stockMatches)

    // Pack B: "Only show compatible" is a toggle (filter only when enabled)
    if (selectedVehicle && compatibleOnly) {
      const key = getVehicleKey(selectedVehicle)
      filtered = filtered.filter(p => p.compatibleVehicles?.includes(key))
    }

    // Semantic ranking
    if (semanticEnabled && searchTerm) {
      const t = searchTerm.toLowerCase()
      const semanticActive = semanticQuery && semanticQuery.toLowerCase() === t && semanticResultsById.size > 0
      if (semanticActive) {
        filtered.sort((a, b) => {
          const as = semanticResultsById.get(String(a.id))?.score || 0
          const bs = semanticResultsById.get(String(b.id))?.score || 0
          return bs - as
        })
      }
    }

    // ✅ SORT LOGIC
    if (sortOption === "price-asc") {
      filtered.sort((a, b) => a.price - b.price)
    }

    if (sortOption === "price-desc") {
      filtered.sort((a, b) => b.price - a.price)
    }

    if (sortOption === "name-asc") {
      filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    }

    // Semantic status line (optional)
    if (semanticEnabled && searchTerm) {
      const statusEl = document.getElementById('ai-status')
      if (statusEl) {
        if (semanticLoading) statusEl.textContent = 'Smart search is loading…'
        else if (semanticError) statusEl.textContent = semanticError
      }
    }

    // Pagination calculations
    const totalItems = filtered.length
    const totalPages = Math.max(1, Math.ceil(totalItems / productsPageSize))
    if (productsCurrentPage > totalPages) productsCurrentPage = totalPages
    if (productsCurrentPage < 1) productsCurrentPage = 1

    const start = (productsCurrentPage - 1) * productsPageSize
    const end = start + productsPageSize
    const paged = filtered.slice(start, end)

    // Update pagination UI
    const countEl = document.getElementById('products-count')
    if (countEl) countEl.textContent = `${totalItems} products`

    const indicatorEl = document.getElementById('products-page-indicator')
    if (indicatorEl) indicatorEl.textContent = `Page ${productsCurrentPage} / ${totalPages}`

    const prevBtn = document.getElementById('products-prev')
    const nextBtn = document.getElementById('products-next')
    if (prevBtn) prevBtn.disabled = productsCurrentPage <= 1
    if (nextBtn) nextBtn.disabled = productsCurrentPage >= totalPages

    paged.forEach(product => {
      let stockText = "In Stock"
      if (product.stockStatus) {
        if (product.stockStatus.availableToday) stockText = "Available Today"
        else if (product.stockStatus.shipsIn1to2Days) stockText = "Ships in 1-2 Days"
        else if (product.stockStatus.preOrderDate) stockText = `Pre-order: ${product.stockStatus.preOrderDate}`
      }

      const card = document.createElement("div")
      card.className = "product-card"
      const isInWishlist = !!wishlist.find(p => p.id === product.id)

      const fitment = evaluateFitment(product, selectedVehicle)
      const showFitmentInfo = !!selectedVehicle && !compatibleOnly

      card.innerHTML = `
        <div class="product-image-wrapper is-loading">
          <img src="${product.imageUrl || "/images/placeholder.png"}" alt="${product.name}" loading="lazy" decoding="async">
        </div>
        <div class="product-content">
          <div class="product-header">
            <h3>${product.name}</h3>
            <span class="part-number">${product.partNumber || "N/A"}</span>
          </div>
          <div class="product-tags">
            <span class="stock-tag">${stockText}</span>
            ${product.mostEnquiredThisWeek ? '<span class="promo-tag">🔥 Trending</span>' : ''}
            ${product.popularWithBrands && product.popularWithBrands.length ? `<span class="brand-tag">Popular with ${product.popularWithBrands.join(', ')}</span>` : ''}
            ${fitment.status === 'guaranteed' ? '<span class="promo-tag" style="background:#064e3b; color:#ecfdf5; border:1px solid #10b981;">Guaranteed fit</span>' : ''}
            ${showFitmentInfo && fitment.status === 'warning' ? '<span class="promo-tag" style="background:#7c2d12; color:#ffedd5; border:1px solid #fb923c;">Fitment warning</span>' : ''}
          </div>
          <div class="product-footer">
            <p class="price">AED ${product.price}</p>
            <span class="view-details">View &rarr;</span>
          </div>
          <div class="product-actions" style="display:flex; gap:8px; margin-top:8px;">
            <button type="button" class="wishlist-toggle" data-id="${product.id}">${isInWishlist ? '❤️ In Wishlist' : '🤍 Add to Wishlist'}</button>
          </div>
        </div>
      `
      // Image skeleton
      const imgWrap = card.querySelector('.product-image-wrapper')
      const img = card.querySelector('.product-image-wrapper img')
      if (imgWrap && img) {
        const done = () => imgWrap.classList.remove('is-loading')
        if (img.complete && img.naturalWidth > 0) done()
        else {
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
        }
      }

      card.querySelector('.wishlist-toggle').addEventListener('click', (e) => {
        e.stopPropagation()
        toggleWishlist(product)
      })
      // Card click opens modal, but allow inner controls (buttons/links/inputs) to work
      card.addEventListener('click', (e) => {
        const interactive = e.target.closest('button, a, input, select, textarea, label')
        if (interactive) return
        openModal(product)
      })
      productsContainer.appendChild(card)
    })
  }

  function openModal(product) {
    // Guard: if modal markup isn't present, don't throw.
    if (!modal) return

    selectedProduct = product

    // Add to recently viewed (optional)
    if (typeof addToRecentlyViewed === 'function') {
      try { addToRecentlyViewed(product) } catch {}
    }
    if (typeof renderRecentlyViewed === 'function') {
      try { renderRecentlyViewed() } catch {}
    }

    // Related products engine (optional)
    if (typeof renderRelatedProducts === 'function') {
      try { renderRelatedProducts(product) } catch {}
    }

    const imgEl = document.getElementById("modal-image")
    if (imgEl) imgEl.src = product.imageUrl || "/images/placeholder.png"

    const nameEl = document.getElementById("modal-name")
    if (nameEl) nameEl.textContent = product.name

    const priceEl = document.getElementById("modal-price")
    if (priceEl) priceEl.textContent = `AED ${product.price}`

    const pnEl = document.getElementById("modal-part-number")
    const toggleBtn = document.getElementById("toggle-part-btn")

    if (pnEl) {
      pnEl.textContent = product.partNumber || "N A"

      // Show toggle only if long
      if ((product.partNumber || "").length > 80) {
        pnEl.classList.remove("expanded")
        if (toggleBtn) {
          toggleBtn.hidden = false
          toggleBtn.textContent = "Show more"
          toggleBtn.onclick = () => {
            const expanded = pnEl.classList.toggle("expanded")
            toggleBtn.textContent = expanded ? "Show less" : "Show more"
          }
        }
      } else {
        if (toggleBtn) toggleBtn.hidden = true
        pnEl.classList.remove("expanded")
      }
    }

    // Pack B: fitment summary (guaranteed/warning + reasons)
    const modalBody = document.getElementById("modal-body")
    if (modalBody) {
      let fitmentBox = document.getElementById('modal-fitment')
      if (!fitmentBox) {
        fitmentBox = document.createElement('div')
        fitmentBox.id = 'modal-fitment'
        fitmentBox.style.marginTop = '10px'
        fitmentBox.style.padding = '10px'
        fitmentBox.style.borderRadius = '10px'
        fitmentBox.style.border = '1px solid rgba(255,255,255,0.1)'
        modalBody.insertBefore(fitmentBox, modalBody.firstChild)
      }

      const fitment = evaluateFitment(product, selectedVehicle)
      if (!selectedVehicle) {
        fitmentBox.style.background = 'rgba(148,163,184,0.12)'
        fitmentBox.innerHTML = `<strong>Fitment:</strong> Select a vehicle to see compatibility.`
      } else if (fitment.status === 'guaranteed') {
        fitmentBox.style.background = 'rgba(16,185,129,0.12)'
        fitmentBox.innerHTML = `<strong>Fitment:</strong> Guaranteed fit for your selected vehicle.`
      } else {
        fitmentBox.style.background = 'rgba(251,146,60,0.12)'
        const reasons = (fitment.reasons || []).map(r => `<li>${r}</li>`).join('')
        fitmentBox.innerHTML = `<strong>Fitment warning:</strong> This may not fit your selected vehicle.${reasons ? `<ul style="margin:8px 0 0 18px;">${reasons}</ul>` : ''}`
      }
    }

    const list = document.getElementById("modal-compatible")
    if (list) {
      list.innerHTML = ""
      product.compatibleVehicles?.forEach(v => {
        const li = document.createElement("li")
        li.textContent = v.replaceAll("|", " ")
        list.appendChild(li)
      })
    }

    // New fields
    const catEl = document.getElementById("modal-category")
    if (catEl) catEl.textContent = `Category: ${product.category || "N/A"}`

    const stockEl = document.getElementById("modal-stock")
    if (stockEl) {
      stockEl.textContent = product.stockStatus ?
        (product.stockStatus.availableToday ? "Available Today" :
         product.stockStatus.shipsIn1to2Days ? "Ships in 1-2 Days" :
         product.stockStatus.preOrderDate ? `Pre-order: ${product.stockStatus.preOrderDate}` : "In Stock") : "In Stock"
    }

    modal.classList.remove("hidden")

    // Ensure modal is actually on top (defensive against CSS regressions)
    modal.style.zIndex = '10000'
  }

  const closeModalBtn = document.getElementById("close-modal")
  if (closeModalBtn && modal) {
    closeModalBtn.onclick = (e) => {
      // Ensure the click doesn't bubble to modal/backdrop handlers
      e?.preventDefault?.()
      e?.stopPropagation?.()
      modal.classList.add("hidden")
    }
  }

  const addToCartBtn = document.getElementById("add-to-cart-btn")
  if (addToCartBtn && modal) {
    addToCartBtn.onclick = () => {
      if (!selectedProduct) return
      const existing = cart.find(p => p.id === selectedProduct.id)
      if (existing) existing.quantity++
      else cart.push({ ...selectedProduct, quantity: 1 })
      updateCart()
      modal.classList.add("hidden")
    }
  }

  const compareBtn = document.getElementById("compare-btn")
  if (compareBtn && modal) {
    compareBtn.onclick = () => {
      if (!selectedProduct) return

      // Keep compareList in sync with storage (in case multiple tabs/pages)
      try {
        compareList = JSON.parse(localStorage.getItem("compareList") || "[]") || []
      } catch {
        compareList = []
      }

      if (compareList.find(p => String(p.id) === String(selectedProduct.id))) {
        alert("Already in compare list")
        return
      }

      compareList.push(selectedProduct)
      localStorage.setItem("compareList", JSON.stringify(compareList))
      modal.classList.add("hidden")

      // Preferred behaviour: go to compare page that shows the table
      const ids = compareList.map(p => p.id).join(',')
      window.location.href = `/compare.html?ids=${encodeURIComponent(ids)}`
    }
  }

  function updateWishlistBadge() {
    if (!wishlistCountEl) return
    const count = (getWishlist && setWishlist) ? getWishlist().length : wishlist.length
    wishlistCountEl.textContent = count
    if (wishlistCountEl.classList) {
      wishlistCountEl.classList.toggle('hidden', count === 0)
    }
  }

  function toggleWishlist(product) {
    let items = getWishlist()
    const idx = items.findIndex(p => p.id === product.id)
    if (idx >= 0) {
      items.splice(idx, 1)
      setWishlist(items)
    } else {
      items.push(product)
      setWishlist(items)
    }
    updateWishlistBadge()
    renderProducts()
    renderWishlist()
  }

  function renderWishlist() {
    if (!wishlistSection || !wishlistList) return

    // Always read from storage so badge/page stay consistent across tabs/pages.
    wishlist = getWishlist()

    wishlistSection.classList.toggle('hidden', wishlist.length === 0)
    wishlistList.innerHTML = ''

    wishlist.forEach((p, i) => {
      const li = document.createElement('div')
      li.className = 'product-card'
      li.innerHTML = `
        <div class="product-image-wrapper">
          <img src="${p.imageUrl || '/images/placeholder.png'}" alt="${p.name}">
        </div>
        <div class="product-content">
          <div class="product-header">
            <h3>${p.name}</h3>
            <span class="part-number">${p.partNumber || 'N/A'}</span>
          </div>
          <div class="product-footer">
            <p class="price">AED ${p.price}</p>
          </div>
          <div class="product-actions" style="display:flex; gap:8px; margin-top:8px;">
            <button type="button" data-action="move-to-cart" data-index="${i}">Add to Enquiry</button>
            <button type="button" data-action="remove" data-index="${i}">Remove</button>
          </div>
        </div>
      `
      li.querySelector('[data-action="move-to-cart"]').addEventListener('click', (e) => {
        e.stopPropagation()
        const item = wishlist[i]
        const existing = cart.find(c => c.id === item.id)
        if (existing) existing.quantity++
        else cart.push({ ...item, quantity: 1 })
        updateCart()
      })
      li.querySelector('[data-action="remove"]').addEventListener('click', (e) => {
        e.stopPropagation()
        wishlist.splice(i, 1)
        localStorage.setItem('wishlist', JSON.stringify(wishlist))
        updateWishlistBadge()
        renderWishlist()
        renderProducts()
      })
      li.addEventListener('click', () => openModal(p))
      wishlistList.appendChild(li)
    })
  }

  function bindWishlistHeader() {
    if (wishlistOpenBtn) {
      wishlistOpenBtn.onclick = (e) => {
        e.preventDefault()
        window.location.href = "/wishlist.html"
      }
    }
    if (wishlistClearBtn) {
      wishlistClearBtn.onclick = () => {
        if (!wishlist.length) return
        if (!confirm('Clear all items from wishlist?')) return
        wishlist = []
        localStorage.setItem('wishlist', JSON.stringify(wishlist))
        updateWishlistBadge()
        renderWishlist()
        renderProducts()
      }
    }
  }

  function updateCart() {
    cart = cart.map(p => ({
      ...p,
      imageUrl: p.imageUrl && p.imageUrl.trim() !== ""
        ? p.imageUrl
        : "/images/placeholder.png"
    }))

    localStorage.setItem("cart", JSON.stringify(cart))

    const cartCountEl = document.getElementById("cart-count")
    if (cartCountEl) {
      cartCountEl.textContent = String(cart.reduce((s, p) => s + p.quantity, 0))
    }

    const list = document.getElementById("cart-items")
    if (list) list.innerHTML = ""

    let total = 0

    cart.forEach((p, i) => {
      total += p.price * p.quantity

      const li = document.createElement("li")
      li.innerHTML = `
        <div class="cart-item">
          <img src="${p.imageUrl}">
          <div>
            <strong>${p.name}</strong><br>
            Qty ${p.quantity}<br>
            AED ${p.price}
            <div class="cart-item-controls">
              <button type="button" data-cart-action="dec" data-cart-index="${i}" aria-label="Decrease quantity">−</button>
              <button type="button" data-cart-action="inc" data-cart-index="${i}" aria-label="Increase quantity">+</button>
              <button type="button" data-cart-action="remove" data-cart-index="${i}">Remove</button>
            </div>
          </div>
        </div>
      `

      // Bind listeners directly (more reliable than inline onclick in some builds)
      li.querySelectorAll('[data-cart-action]')?.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          const idx = Number(btn.getAttribute('data-cart-index'))
          const action = btn.getAttribute('data-cart-action')
          if (action === 'inc') window.increaseQty(idx)
          if (action === 'dec') window.decreaseQty(idx)
          if (action === 'remove') window.removeItem(idx)
        })
      })

      list?.appendChild(li)
    })

    const totalEl = document.getElementById("cart-total")
    if (totalEl) totalEl.textContent = total.toFixed(2)
  }

  // Cart item controls (defensive: handle stale indices after re-render)
  window.increaseQty = (i) => {
    i = Number(i)
    if (!Number.isInteger(i)) return
    if (!Array.isArray(cart) || !cart[i]) return
    cart[i].quantity = (Number(cart[i].quantity) || 0) + 1
    updateCart()
  }

  window.decreaseQty = (i) => {
    i = Number(i)
    if (!Number.isInteger(i)) return
    if (!Array.isArray(cart) || !cart[i]) return

    const q = Number(cart[i].quantity) || 1
    if (q > 1) cart[i].quantity = q - 1
    else cart.splice(i, 1)

    updateCart()
  }

  window.removeItem = (i) => {
    i = Number(i)
    if (!Number.isInteger(i)) return
    if (!Array.isArray(cart) || !cart[i]) return
    cart.splice(i, 1)
    updateCart()
  }

  document.getElementById("cart-btn")?.addEventListener('click', (e) => {
    e?.preventDefault?.()
    cartDrawer?.classList.remove("hidden")
  })
  updateWishlistBadge()

  document.getElementById("close-cart")?.addEventListener('click', () => {
    cartDrawer?.classList.add("hidden")
  })

  // Pack C: enquiry/quote request (cart + customer + selected vehicle)
  const proceedBtn = document.getElementById("enquiry-btn")
  const requestQuoteBtn = document.getElementById("request-quote-btn")

  const WHATSAPP_NUMBER = "971586852620"

  function buildCartEnquiryMessage() {
    const name = document.getElementById("customer-name")?.value?.trim() || ""
    const phone = document.getElementById("customer-phone")?.value?.trim() || ""

    let message = "Hi, I would like to enquire about these auto spare parts from JIEDIZHEN."

    if (name || phone) {
      message += "\n\nCustomer details:"
      if (name) message += `\nName: ${name}`
      if (phone) message += `\nPhone: ${phone}`
    }

    if (selectedVehicle) {
      message +=
        "\n\nVehicle details:\n" +
        `${selectedVehicle.make} ${selectedVehicle.model} ${selectedVehicle.year} ${selectedVehicle.engine}`
    }

    message += "\n\nItems:"
    cart.forEach((i, idx) => {
      const pn = (i.partNumber || "").trim()
      const line1 = `${idx + 1}. ${i.name}`
      const line2 = pn ? `   Part No: ${pn}` : ""
      const line3 = `   Qty: ${i.quantity || 1}  Price: AED ${i.price}`
      message += `\n${line1}`
      if (line2) message += `\n${line2}`
      message += `\n${line3}`
    })

    const total = cart.reduce((s, p) => s + (Number(p.price) || 0) * (Number(p.quantity) || 1), 0)
    message += `\n\nTotal: AED ${total.toFixed(2)}`

    message += "\n\nPlease confirm availability and best price."
    return message
  }

  function openWhatsAppWithMessage(message) {
    const url =
      "https://api.whatsapp.com/send?phone=" +
      WHATSAPP_NUMBER +
      "&text=" +
      encodeURIComponent(message)
    window.open(url, "_blank")
  }

  function sendEnquiryToWhatsApp(e) {
    e?.preventDefault?.()

    if (!validateCustomerDetails()) return
    if (cart.length === 0) {
      alert("Your cart is empty")
      return
    }

    const message = buildCartEnquiryMessage()
    openWhatsAppWithMessage(message)
  }

  async function requestQuote(e) {
    e?.preventDefault?.()

    if (!validateCustomerDetails()) return
    if (cart.length === 0) {
      alert("Your cart is empty")
      return
    }

    const payload = {
      customer: {
        name: document.getElementById("customer-name").value,
        phone: document.getElementById("customer-phone").value,
        email: ''
      },
      vehicle: selectedVehicle ? {
        make: selectedVehicle.make,
        model: selectedVehicle.model,
        year: selectedVehicle.year,
        engine: selectedVehicle.engine
      } : null,
      items: cart.map(i => ({
        id: i.id,
        name: i.name,
        partNumber: i.partNumber,
        quantity: i.quantity || 1,
        price: i.price
      }))
    }

    try {
      const me = await fetch('/api/auth/me', { credentials: 'same-origin' })
      // Guests will see 401; this is normal.
      if (me.ok) {
        const u = await me.json()
        payload.customer.email = u.email || ''
      }
    } catch {}

    // Use an absolute URL to avoid mobile/webview base-path issues (common in Capacitor/Electron builds)
    const ENQUIRY_URL = new URL('/api/enquiries', window.location.origin).toString()

    try {
      const res = await fetch(ENQUIRY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error('Enquiry failed:', { status: res.status, data })
        alert(data.error || data.message || 'Failed to submit enquiry')
        return
      }

      cart = []
      localStorage.setItem('cart', JSON.stringify(cart))
      updateCart()

      alert(`Enquiry submitted. Reference: ${data.referenceId}`)
    } catch (err) {
      console.error('Enquiry request error:', err)
      alert('Failed to submit enquiry')
    }
  }

  if (proceedBtn) {
    proceedBtn.textContent = "Send Enquiry"
    proceedBtn.onclick = sendEnquiryToWhatsApp
  }

  if (requestQuoteBtn) {
    requestQuoteBtn.textContent = "Request Quote"
    requestQuoteBtn.onclick = requestQuote
  }

  const whatsappFloat = document.getElementById("whatsapp-float")

  if (whatsappFloat) {
    whatsappFloat.onclick = e => {
      e.preventDefault()

      let message = "Hi, I am enquiring about auto spare parts from JIEDIZHEN."

      if (selectedVehicle) {
        message +=
          "\n\nVehicle details:\n" +
          `${selectedVehicle.make} ${selectedVehicle.model} ${selectedVehicle.year} ${selectedVehicle.engine}`
      }

      const url =
        "https://api.whatsapp.com/send?phone=" +
        WHATSAPP_NUMBER +
        "&text=" +
        encodeURIComponent(message)

      window.open(url, "_blank")
    }
  }

  async function ensureAuthenticatedForCheckout(){
    try{
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
      if (res.status === 401) return false
      if(res.ok) return true
    }catch{}
    return false
  }

  async function createCheckoutSession() {
    // Security: do NOT send client-side prices. Server derives from id/partNumber.
    const payload = {
      items: cart.map(i => ({
        id: i.id,
        partNumber: i.partNumber,
        quantity: i.quantity || 1,
      }))
    }

    const res = await fetch('/api/checkout/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data?.error || data?.message || 'Checkout failed')
    }
    if (!data?.url) throw new Error('Checkout failed: missing session url')
    return data.url
  }

  const checkoutBtn = document.getElementById("checkout-btn")
  if (checkoutBtn) {
    checkoutBtn.style.display = "inline-block"
    checkoutBtn.disabled = false
    checkoutBtn.onclick = async (e) => {
      e.preventDefault()

      if (cart.length === 0) {
        alert("Your cart is empty")
        return
      }

      const authed = await ensureAuthenticatedForCheckout()
      if (!authed) {
        alert('Please log in to checkout')
        const next = '/checkout.html'
        window.location.href = '/login.html?next=' + encodeURIComponent(next)
        return
      }

      try {
        const url = await createCheckoutSession()
        window.location.href = url
      } catch (err) {
        console.error(err)
        alert(err?.message || 'Checkout failed')
      }
    }
  }

  function restoreCustomerDetails() {
    const nameEl = document.getElementById("customer-name")
    const phoneEl = document.getElementById("customer-phone")
    if (nameEl) nameEl.value = localStorage.getItem("customerName") || ""
    if (phoneEl) phoneEl.value = localStorage.getItem("customerPhone") || ""
  }

  document.getElementById("customer-name")
    ?.addEventListener("input", e =>
      localStorage.setItem("customerName", e.target.value)
    )

  document.getElementById("customer-phone")
    ?.addEventListener("input", e =>
      localStorage.setItem("customerPhone", e.target.value)
    )

  loadProducts()
  setTimeout(async () => { await refreshAuthUI() }, 0)
})

/* =========================================
   PARTICLE TEXT
========================================= */
document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("particle-text")
  if (!canvas) return

  const ctx = canvas.getContext("2d")
  let width, height, particles = []

  function resize() {
    width = canvas.width = canvas.offsetWidth
    height = canvas.height = canvas.offsetHeight
    createParticles()
  }

  function createParticles() {
    particles = []
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = "#ffffff"
    ctx.font = "bold 38px Arial"
    ctx.textAlign = "right"
    ctx.textBaseline = "middle"
    ctx.fillText("JIEDIZHEN", width - 2, height / 2)

    const data = ctx.getImageData(0, 0, width, height).data

    for (let y = 0; y < height; y += 5) {
      for (let x = 0; x < width; x += 5) {
        const i = (y * width + x) * 4
        if (data[i + 3] > 140) {
          particles.push({ x, y, tx: x, ty: y })
        }
      }
    }

    ctx.clearRect(0, 0, width, height)
  }

  function animate() {
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = "rgba(255,255,255,0.6)"
    particles.forEach(p => {
      p.x += (p.tx - p.x) * 0.1
      p.y += (p.ty - p.y) * 0.1
      ctx.fillRect(p.x, p.y, 1.3, 1.3)
    })
    requestAnimationFrame(animate)
  }

  window.addEventListener("resize", resize)
  resize()
  animate()
})
