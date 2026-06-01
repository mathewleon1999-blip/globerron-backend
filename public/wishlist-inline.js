// Wishlist page (CSP-safe)
(() => {
  // Keys used across the app
  const WISHLIST_KEY = 'wishlist'
  const CART_KEY = 'cart'

  // Fetch products from backend JSON/endpoint used across the site
  async function fetchProducts() {
    // Prefer the backend route if available, otherwise fall back to static JSON
    try {
      const res = await fetch('/api/products')
      if (res.ok) return res.json()
      throw new Error('api/products not available')
    } catch (_) {
      const res = await fetch('/src/products.json')
      return res.json()
    }
  }

  // Read raw wishlist from localStorage
  function getWishlistRaw() {
    try {
      const raw = localStorage.getItem(WISHLIST_KEY)
      return raw ? JSON.parse(raw) : []
    } catch (_) {
      return []
    }
  }

  // Persist wishlist (always as full product objects for consistency with homepage)
  function setWishlist(products) {
    try {
      localStorage.setItem(WISHLIST_KEY, JSON.stringify(products))
    } catch (_) {}
  }

  // Normalize wishlist to an array of product objects.
  // Accepts legacy formats where wishlist is an array of IDs.
  function normalizeWishlist(rawItems, allProducts) {
    if (!Array.isArray(rawItems)) return []

    // If items already look like product objects with an id and a name/price, keep them
    if (rawItems.length && typeof rawItems[0] === 'object' && rawItems[0] !== null && 'id' in rawItems[0]) {
      return rawItems
    }

    // Otherwise treat as an array of ids and map to products
    const byId = new Map(allProducts.map(p => [String(p.id), p]))
    return rawItems.map(id => byId.get(String(id))).filter(Boolean)
  }

  function removeFromWishlist(id) {
    const raw = getWishlistRaw()
    const filtered = raw.filter(item => {
      if (typeof item === 'object' && item !== null) return String(item.id) !== String(id)
      return String(item) !== String(id)
    })
    setWishlist(filtered.map(item => (typeof item === 'object' ? item : { id: item })))
  }

  function addToCart(product) {
    const cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]')
    const idx = cart.findIndex(i => String(i.id) === String(product.id))
    if (idx >= 0) cart[idx].quantity = (cart[idx].quantity || 1) + 1
    else cart.push({ ...product, quantity: 1 })
    localStorage.setItem(CART_KEY, JSON.stringify(cart))
  }

  function productToCard(product) {
    const tpl = document.getElementById('wishlist-item-template')
    const node = tpl.content.cloneNode(true)
    const article = node.querySelector('article.product-card')
    article.dataset.productId = product.id

    const img = node.querySelector('.product-image')
    img.src = product.imageUrl || product.image || (product.images && product.images[0]) || '/images/products/0001.png'
    img.alt = product.name || 'Product image'

    node.querySelector('.product-title').textContent = product.name || product.title || 'Unnamed product'
    node.querySelector('.product-vehicle').textContent = product.partNumber || product.category || ''

    node.querySelector('.remove-btn').addEventListener('click', () => {
      removeFromWishlist(product.id)
      render()
    })

    node.querySelector('.add-to-cart-btn').addEventListener('click', () => {
      addToCart(product)
      removeFromWishlist(product.id)
      render()
    })

    return node
  }

  async function render() {
    const grid = document.getElementById('wishlist-items')
    const emptyState = document.getElementById('wishlist-empty')
    if (!grid || !emptyState) return

    grid.innerHTML = ''

    const products = await fetchProducts()
    const raw = getWishlistRaw()
    const items = normalizeWishlist(raw, products)

    // If we converted from IDs to full objects, persist normalized format
    if (items.length && raw.length && (typeof raw[0] !== 'object' || raw[0] === null)) {
      setWishlist(items)
    }

    if (!items.length) {
      emptyState.hidden = false
      return
    }

    emptyState.hidden = true
    items.forEach(p => grid.appendChild(productToCard(p)))

    if (!grid.children.length) emptyState.hidden = false
  }

  // Clear-all button
  document.getElementById('wishlist-clear')?.addEventListener('click', () => {
    try {
      localStorage.removeItem(WISHLIST_KEY)
    } catch {}
    render()
  })

  // Set footer year and initial render
  const yearEl = document.getElementById('year')
  if (yearEl) yearEl.textContent = String(new Date().getFullYear())

  // Ensure DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render, { once: true })
  } else {
    render()
  }
})()
