const list = document.getElementById("product-list")
const form = document.getElementById("add-form")

const nameInput = document.getElementById("product-name")
const partNumberInput = document.getElementById("product-part-number")
const priceInput = document.getElementById("product-price")
const categoryInput = document.getElementById("product-category")
const imageInput = document.getElementById("product-image")
const vehicleInput = document.getElementById("product-vehicles")
// Legacy checkbox removed from admin.html; keep as optional.
const stockInput = document.getElementById("product-stock")

// Stock management (qty-based)
const stockQtyInput = document.getElementById('product-stock-qty')
const lowStockInput = document.getElementById('product-low-stock')

const addPreview = document.getElementById("add-preview")
const removeAddImage = document.getElementById("remove-add-image")

const editPreview = document.getElementById("edit-preview")
const editImageInput = document.getElementById("edit-image")
const removeEditImage = document.getElementById("remove-edit-image")
const editPartNumberInput = document.getElementById("edit-part-number")

let editProductId = null
let allOrders = []

/* ---------- PRODUCTS (PAGINATION) ---------- */
let allProductsAdmin = []
let filteredProductsAdmin = []
let productsCurrentPage = 1
let productsPageSize = Number(document.getElementById('product-page-size')?.value || 25)

/* ---------- ENQUIRIES (Pack C) ---------- */
let allEnquiries = []
let filteredEnquiries = []

/* ---------- PAGINATION ---------- */
let filteredOrders = []
let currentPage = 1
let pageSize = 10

// Orders page size selector exists in admin.html (#page-size)
window.changePageSize = function () {
  const v = Number(document.getElementById('page-size')?.value || 10)
  pageSize = Number.isFinite(v) && v > 0 ? v : 10
  currentPage = 1
  renderPaginatedOrders()
}

/* ---------- AUTH FETCH ---------- */
async function authFetch(url, options = {}) {
  // Ensure admin session cookie is sent for all admin API calls
  // (without this, edits like price update will 401 and appear to "not save").
  const opts = { credentials: "same-origin", ...options }
  const res = await fetch(url, opts)
  if (res.status === 401 || res.status === 403) {
    // Admin area should redirect to the admin login screen
    window.location.href = "/admin-login.html"
    return null
  }
  return res
}

/* ---------- LOAD PRODUCTS ---------- */
function renderProductsAdminPage() {
  if (!list) return

  const start = (productsCurrentPage - 1) * productsPageSize
  const end = start + productsPageSize
  const pageItems = filteredProductsAdmin.slice(start, end)

  list.innerHTML = ""

  pageItems.forEach(p => {
    const div = document.createElement("div")
    div.className = "admin-product"

    const imgSrc = p.imageUrl
      ? `${p.imageUrl}?v=${p.id}`
      : "/images/placeholder.png"

    div.innerHTML = `
      <strong>${p.name}</strong><br>
      Part Number ${p.partNumber || "N A"}<br>
      Price AED ${p.price} (${p.category})<br>

      <img
        src="${imgSrc}"
        style="width:80px;margin:8px 0;border-radius:6px"
      ><br>

      Vehicles ${(p.compatibleVehicles || []).join(", ") || "None"}<br>

      <button type="button" data-action="edit" data-id="${p.id}">Edit</button>
      <button type="button" data-action="delete" data-id="${p.id}">Delete</button>
    `

    // Bind actions (CSP-safe; no inline onclick)
    const editBtn = div.querySelector('[data-action="edit"]')
    const delBtn = div.querySelector('[data-action="delete"]')
    editBtn?.addEventListener('click', () => openEdit(p.id))
    delBtn?.addEventListener('click', () => deleteProduct(p.id))

    list.appendChild(div)
  })

  const totalPages = Math.max(1, Math.ceil(filteredProductsAdmin.length / productsPageSize))
  const indicator = document.getElementById('products-page-indicator')
  if (indicator) indicator.textContent = `Page ${productsCurrentPage} / ${totalPages}`

  const countEl = document.getElementById('products-count')
  if (countEl) countEl.textContent = String(filteredProductsAdmin.length)
}

function nextProductsPage() {
  const totalPages = Math.max(1, Math.ceil(filteredProductsAdmin.length / productsPageSize))
  if (productsCurrentPage < totalPages) {
    productsCurrentPage++
    renderProductsAdminPage()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function prevProductsPage() {
  if (productsCurrentPage > 1) {
    productsCurrentPage--
    renderProductsAdminPage()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function changeProductsPageSize() {
  const v = Number(document.getElementById('product-page-size')?.value || 25)
  productsPageSize = Number.isFinite(v) && v > 0 ? v : 25
  productsCurrentPage = 1
  renderProductsAdminPage()
}

function filterProducts() {
  const q = String(document.getElementById('product-search')?.value || '').toLowerCase().trim()
  if (!q) {
    filteredProductsAdmin = [...allProductsAdmin]
  } else {
    filteredProductsAdmin = allProductsAdmin.filter(p => {
      const hay = [p.name, p.partNumber, p.category].filter(Boolean).join(' | ').toLowerCase()
      return hay.includes(q)
    })
  }
  productsCurrentPage = 1
  renderProductsAdminPage()
}

async function loadProducts() {
  const res = await authFetch("/api/products")
  if (!res) return

  allProductsAdmin = await res.json()
  filteredProductsAdmin = [...allProductsAdmin]
  productsCurrentPage = 1
  renderProductsAdminPage()
}

/* ---------- ADD IMAGE PREVIEW ---------- */
if (imageInput && addPreview && removeAddImage) {
  imageInput.addEventListener("change", e => {
  const file = e.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = () => {
    addPreview.src = reader.result
    addPreview.style.display = "block"
    removeAddImage.checked = false
  }
  reader.readAsDataURL(file)
  })

  removeAddImage.addEventListener("change", () => {
    if (removeAddImage.checked) {
      imageInput.value = ""
      addPreview.style.display = "none"
    }
  })
}

/* ---------- EDIT IMAGE PREVIEW ---------- */
if (editImageInput && editPreview && removeEditImage) {
  editImageInput.addEventListener("change", e => {
  const file = e.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = () => {
    editPreview.src = reader.result
    editPreview.style.display = "block"
    removeEditImage.checked = false
  }
  reader.readAsDataURL(file)
  })

  removeEditImage.addEventListener("change", () => {
    if (removeEditImage.checked) {
      editImageInput.value = ""
      editPreview.src = "/images/placeholder.png"
    }
  })
}

/* ---------- ADD PRODUCT ---------- */
if (form) {
  form.addEventListener("submit", async e => {
  e.preventDefault()

  const vehicles = vehicleInput.value
    .split(",")
    .map(v => v.trim())
    .filter(Boolean)

  const formData = new FormData()
  formData.append("name", nameInput.value)
  formData.append("partNumber", partNumberInput.value)
  formData.append("price", priceInput.value)
  formData.append("category", categoryInput.value)

  // Stock management (qty-based). Keep inStock compatible with older schema.
  const qty = Math.max(0, Number(stockQtyInput?.value || 0) || 0)
  const low = Math.max(0, Number(lowStockInput?.value || 5) || 0)
  formData.append('stockQty', String(qty))
  formData.append('lowStockThreshold', String(low))
  formData.append("inStock", String(qty > 0))

  formData.append("compatibleVehicles", JSON.stringify(vehicles))

  if (!removeAddImage.checked && imageInput.files.length > 0) {
    formData.append("image", imageInput.files[0])
  }

  const res = await authFetch("/api/products", {
    method: "POST",
    body: formData
  })
  if (!res) return

  if (!res.ok) {
    let details = ""
    try {
      const ct = String(res.headers.get("content-type") || "")
      if (ct.includes("application/json")) {
        const j = await res.json()
        details = j && (j.message || j.error) ? String(j.message || j.error) : JSON.stringify(j)
      } else {
        details = await res.text()
      }
    } catch {}
    alert(`Failed to add product (HTTP ${res.status}). ${details || ""}`.trim())
    return
  }

  form.reset()
  if (addPreview) addPreview.style.display = "none"
  loadProducts()
  })
}

/* ---------- OPEN EDIT ---------- */
async function openEdit(id) {
  const res = await authFetch("/api/products")
  if (!res) return

  const products = await res.json()
  const product = products.find(p => p.id === id)
  if (!product) return

  editProductId = id

  document.getElementById("edit-name").value = product.name
  editPartNumberInput.value = product.partNumber || ""
  document.getElementById("edit-price").value = product.price
  document.getElementById("edit-category").value = product.category
  document.getElementById("edit-vehicles").value =
    (product.compatibleVehicles || []).join(", ")

  // Stock management (qty-based)
  const editQtyEl = document.getElementById('edit-stock-qty')
  const editLowEl = document.getElementById('edit-low-stock')
  if (editQtyEl) editQtyEl.value = String(Math.max(0, Number(product.stockQty ?? 0) || 0))
  if (editLowEl) editLowEl.value = String(Math.max(0, Number(product.lowStockThreshold ?? 5) || 0))

  editPreview.src = product.imageUrl
    ? `${product.imageUrl}?v=${product.id}`
    : "/images/placeholder.png"

  editPreview.style.display = "block"
  removeEditImage.checked = false
  editImageInput.value = ""

  document.getElementById("edit-modal").classList.remove("hidden")
}

/* ---------- SAVE EDIT ---------- */
const saveEditBtn = document.getElementById("save-edit")
if (saveEditBtn) saveEditBtn.onclick = async () => {
  if (!editProductId) return

  const vehicles = document
    .getElementById("edit-vehicles")
    .value.split(",")
    .map(v => v.trim())
    .filter(Boolean)

  const formData = new FormData()
  formData.append("name", document.getElementById("edit-name").value)
  formData.append("partNumber", editPartNumberInput.value)
  formData.append("price", document.getElementById("edit-price").value)
  formData.append("category", document.getElementById("edit-category").value)

  // Stock management (qty-based)
  const editQtyEl = document.getElementById('edit-stock-qty')
  const editLowEl = document.getElementById('edit-low-stock')
  const qty = Math.max(0, Number(editQtyEl?.value || 0) || 0)
  const low = Math.max(0, Number(editLowEl?.value || 5) || 0)
  formData.append('stockQty', String(qty))
  formData.append('lowStockThreshold', String(low))
  formData.append("inStock", String(qty > 0))

  formData.append("compatibleVehicles", JSON.stringify(vehicles))

  if (removeEditImage.checked) {
    formData.append("removeImage", "true")
  } else if (editImageInput.files.length > 0) {
    formData.append("image", editImageInput.files[0])
  }

  const res = await authFetch(`/api/products/${editProductId}`, {
    method: "PUT",
    body: formData
  })
  if (!res) return

  if (!res.ok) {
    let details = ""
    try {
      const ct = String(res.headers.get("content-type") || "")
      if (ct.includes("application/json")) {
        const j = await res.json()
        details = j && (j.message || j.error) ? String(j.message || j.error) : JSON.stringify(j)
      } else {
        details = await res.text()
      }
    } catch {}
    alert(`Failed to save product changes (HTTP ${res.status}). ${details || ""}`.trim())
    return
  }

  closeEditModal()
  loadProducts()
}

/* ---------- CLOSE EDIT ---------- */
function closeEditModal() {
  editProductId = null
  editImageInput.value = ""
  removeEditImage.checked = false
  document.getElementById("edit-modal").classList.add("hidden")
}

const closeEditBtn = document.getElementById("close-edit")
if (closeEditBtn) closeEditBtn.onclick = closeEditModal

// Stock adjust helpers (used by buttons in admin.html)
window.adjustEditStock = function (delta) {
  const el = document.getElementById('edit-stock-qty')
  if (!el) return
  const cur = Math.max(0, Number(el.value || 0) || 0)
  el.value = String(Math.max(0, cur + Number(delta || 0)))
}
window.setEditStock = function (val) {
  const el = document.getElementById('edit-stock-qty')
  if (!el) return
  el.value = String(Math.max(0, Number(val || 0) || 0))
}

/* ---------- STOCK CSV EXPORT (Excel compatible) ---------- */
function csvEscape(v){
  const s = String(v ?? '')
  if (/[\n\r,\"]/g.test(s)) return '"' + s.replaceAll('"', '""') + '"'
  return s
}

window.exportStockCSV = async function () {
  // Ensure latest list
  const res = await authFetch('/api/products')
  if (!res) return
  const products = await res.json().catch(() => [])

  const rows = []
  rows.push([
    'ID','Name','Part Number','Category','Price','Image URL','Compatible Vehicles',
    'Stock Qty','Low Stock Threshold','Stock Status',
    'Available Today','Ships in 1-2 Days','PreOrder Date',
    'Trending','Popular With Brands','Frequently Ordered With'
  ])

  ;(products || []).forEach(p => {
    const qty = Math.max(0, Number(p.stockQty ?? 0) || 0)
    const low = Math.max(0, Number(p.lowStockThreshold ?? 5) || 0)
    const status = qty <= 0 ? 'Out of Stock' : (qty <= low ? 'Low Stock' : 'In Stock')
    const s = p.stockStatus || {}

    rows.push([
      p.id,
      p.name,
      p.partNumber || '',
      p.category || '',
      p.price ?? '',
      p.imageUrl || '',
      Array.isArray(p.compatibleVehicles) ? p.compatibleVehicles.join(' | ') : '',
      qty,
      low,
      status,
      s.availableToday ? 'Yes' : 'No',
      s.shipsIn1to2Days ? 'Yes' : 'No',
      s.preOrderDate || '',
      p.mostEnquiredThisWeek ? 'Yes' : 'No',
      Array.isArray(p.popularWithBrands) ? p.popularWithBrands.join(' | ') : '',
      Array.isArray(p.frequentlyOrderedWith) ? p.frequentlyOrderedWith.join(' | ') : ''
    ])
  })

  const csv = rows.map(r => r.map(csvEscape).join(',')).join('\n') + '\n'
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'jiedzhen_stock_export.csv'
  a.click()
}

/* ---------- DELETE PRODUCT ---------- */
async function deleteProduct(id) {
  if (!confirm("Delete this product")) return
  const res = await authFetch(`/api/products/${id}`, { method: "DELETE" })
  if (!res) return
  loadProducts()
}

/* ---------- ORDERS ---------- */
const ordersTableBody = document.getElementById("orders-table-body")

function renderStatusBadge(status) {
  // Normalize known backend statuses to the CSS classes used
  const map = {
    New: 'pending',
    Packed: 'processing',
    Shipped: 'shipped',
    Delivered: 'completed'
  }
  const normalized = map[status] || status || 'pending'
  const s = String(normalized).toLowerCase()
  return `<span class="status-badge status-${s}">${s}</span>`
}

function normalizeOrderForAdmin(o) {
  // Support multiple backend schemas:
  // - Legacy admin schema: { orderId, totalAmount, orderStatus, orderDate }
  // - Unified store.orders schema (Stripe): { id, amount, status, createdAt, customer, address, items, tracking, stripe }
  // - Older Stripe schema variants where ID is stored under stripe/session fields
  if (!o || typeof o !== 'object') return o

  // If it already has legacy fields, keep them.
  if (o.orderId || o.totalAmount != null || o.orderStatus || o.orderDate) return o

  const stripe = o.stripe && typeof o.stripe === 'object' ? o.stripe : {}

  // Try multiple possible identifiers
  const id = o.id || o.order_id || stripe.sessionId || stripe.session_id || stripe.id || stripe.payment_intent || null
  const orderId = o.orderId || id

  // Amount can be under amount/total/totalAmount
  const totalAmount =
    o.totalAmount != null ? o.totalAmount :
    (o.amount != null ? o.amount :
    (o.total != null ? o.total : 0))

  // Status can be under status/orderStatus
  const orderStatus = o.orderStatus || o.status || stripe.status || 'pending'

  // Date can be createdAt/orderDate/created or stripe created timestamps
  const orderDate = o.orderDate || o.createdAt || o.created || stripe.createdAt || stripe.created_at || null

  return {
    ...o,
    orderId,
    totalAmount,
    orderStatus,
    orderDate,
    // keep originals too
    id,
    amount: o.amount,
    status: o.status,
    createdAt: o.createdAt,
    stripe
  }
}

function orderSortTime(o) {
  if (!o || typeof o !== 'object') return 0
  const stripe = o.stripe && typeof o.stripe === 'object' ? o.stripe : {}

  const v =
    o.orderDate ||
    o.createdAt ||
    o.created ||
    stripe.createdAt ||
    stripe.created_at ||
    null

  const t = Date.parse(v || '')
  return Number.isFinite(t) ? t : 0
}

async function loadOrders() {
  const res = await authFetch("/api/orders")
  if (!res) return
  const raw = await res.json()

  allOrders = Array.isArray(raw)
    ? raw.map(normalizeOrderForAdmin).sort((a, b) => orderSortTime(b) - orderSortTime(a))
    : []

  filteredOrders = [...allOrders]
  currentPage = 1
  renderPaginatedOrders()
}

function renderOrders(orders) {
  ordersTableBody.innerHTML = ""

  orders.forEach(order => {
    const tr = document.createElement("tr")

    // Stripe/legacy orders may store customer fields at top-level or under customer{}
    const customerName =
      (order.customer && (order.customer.fullName || order.customer.name)) ||
      order.fullName ||
      order.customerName ||
      order.name ||
      "-"

    const customerPhone =
      (order.customer && (order.customer.phone || order.customer.mobile || order.customer.contact)) ||
      order.phone ||
      order.mobile ||
      order.contact ||
      order.customerPhone ||
      "-"

    const addr = order.address || {}
    const loc = [addr.area, addr.city, addr.country].filter(Boolean).join(', ') || '-'

    const oid = adminOrderKey(order)
    const amountVal = (order.totalAmount != null ? order.totalAmount : (order.amount != null ? order.amount : 0))
    const dateVal = order.orderDate || order.createdAt || order.created || null

    tr.innerHTML = `
      <td><input type="checkbox" class="order-check" value="${oid}"></td>
      <td>${oid || '-'}</td>
      <td>${customerName}</td>
      <td>${customerPhone}</td>
      <td>${loc}</td>
      <td>AED ${amountVal != null ? amountVal : 0}</td>
      <td>${renderStatusBadge(order.orderStatus || order.status)}</td>
      <td>${dateVal ? new Date(dateVal).toLocaleString() : '-'}</td>
      <td><button type="button" class="order-view" data-order-id="${String(oid).replaceAll('"', '&quot;')}">View</button></td>
    `
    ordersTableBody.appendChild(tr)
  })
}

/* ---------- PAGINATION ---------- */
function renderPaginatedOrders() {
  const start = (currentPage - 1) * pageSize
  const end = start + pageSize
  renderOrders(filteredOrders.slice(start, end))

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize))
  const indicator = document.getElementById('page-indicator')
  if (indicator) indicator.textContent = `Page ${currentPage} / ${totalPages}`
}

window.nextPage = function () {
  const totalPages = Math.ceil(filteredOrders.length / pageSize)
  if (currentPage < totalPages) {
    currentPage++
    renderPaginatedOrders()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

window.prevPage = function () {
  if (currentPage > 1) {
    currentPage--
    renderPaginatedOrders()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

/* ---------- SEARCH AND FILTER ---------- */
window.filterOrders = function () {
  const q = document.getElementById("order-search").value.toLowerCase()
  const s = document.getElementById("order-filter").value

  filteredOrders = allOrders.filter(o => {
    const nameStr =
      ((o.customer && (o.customer.fullName || o.customer.name)) || o.fullName || o.customerName || o.name || '')
    const phoneStr =
      ((o.customer && (o.customer.phone || o.customer.mobile || o.customer.contact)) || o.phone || o.mobile || o.contact || o.customerPhone || '')

    const textMatch =
      (o.orderId || "").toLowerCase().includes(q) ||
      String(nameStr).toLowerCase().includes(q) ||
      String(phoneStr).toLowerCase().includes(q)

    // Map frontend filter values to backend statuses
    const statusMap = {
      pending: 'New',
      processing: 'Packed',
      shipped: 'Shipped',
      completed: 'Delivered',
      cancelled: 'Cancelled' // in case used later
    }
    const backendStatus = statusMap[s] || s

    const statusMatch = !s || o.orderStatus === backendStatus
    return textMatch && statusMatch
  })

  currentPage = 1
  renderPaginatedOrders()
}

/* ---------- BULK UPDATE ---------- */
function adminOrderKey(o) {
  if (!o || typeof o !== 'object') return ''
  const stripe = o.stripe && typeof o.stripe === 'object' ? o.stripe : {}
  return String(
    o.orderId ||
    o.id ||
    o.order_id ||
    stripe.sessionId ||
    stripe.session_id ||
    stripe.id ||
    stripe.payment_intent ||
    ''
  )
}

window.bulkUpdate = async function () {
  const statusUi = document.getElementById("bulk-status").value
  if (!statusUi) return alert("Select status")

  // Backend now persists whatever status string you send.
  // Keep your UI labels but send the exact value.
  const status = String(statusUi)

  const selected = [...document.querySelectorAll(".order-check:checked")]
    .map(c => String(c.value || '').trim())
    .filter(Boolean)

  if (!selected.length) return alert("No orders selected")

  for (const id of selected) {
    await authFetch(`/api/orders/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    })
  }
  loadOrders()
}

/* ---------- ORDER MODAL ---------- */
let __openOrderId = null

window.openOrder = function (id) {
  const order = allOrders.find(o => adminOrderKey(o) === String(id))
  if (!order) return

  __openOrderId = adminOrderKey(order) || String(id)

  const modal = document.getElementById("order-modal")
  const body = document.getElementById("order-modal-body")

  const customerName =
    (order.customer && (order.customer.fullName || order.customer.name)) ||
    order.fullName ||
    order.customerName ||
    order.name ||
    '-'

  const customerPhone =
    (order.customer && (order.customer.phone || order.customer.mobile || order.customer.contact)) ||
    order.phone ||
    order.mobile ||
    order.contact ||
    order.customerPhone ||
    '-'

  const addr = order.address || {}
  const addressLine = [
    addr.building,
    addr.street,
    addr.area,
    addr.city,
    addr.country,
    addr.postalCode
  ].filter(Boolean).join(', ')

  const lat = addr.latitude
  const lng = addr.longitude
  const hasCoords = lat !== undefined && lat !== null && lng !== undefined && lng !== null && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng))

  const mapsLink = hasCoords
    ? `https://www.google.com/maps?q=${encodeURIComponent(String(lat))},${encodeURIComponent(String(lng))}`
    : (addr.mapUrl || '')

  body.innerHTML = `
    <strong>Order</strong> ${order.orderId || order.id || '-'}<br>
    Customer ${customerName}<br>
    Phone ${customerPhone}<br><br>

    <strong>Address</strong><br>
    ${addressLine || '-'}<br>
    ${hasCoords ? `Coords: ${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}<br>` : ''}
    ${mapsLink ? `<a href="${mapsLink}" target="_blank" rel="noopener">Open in Google Maps</a><br>` : ''}

    <br>
    <strong>Items</strong><br>
    ${(order.items || []).map(i => `${i.productName || i.name || ''} x${i.quantity}`).join("<br>")}<br><br>
    Total AED ${order.totalAmount != null ? order.totalAmount : (order.amount != null ? order.amount : 0)}
  `

  // Prefill tracking form
  const carrierEl = document.getElementById('track-carrier')
  const numberEl = document.getElementById('track-number')
  const urlEl = document.getElementById('track-url')
  const msgEl = document.getElementById('track-msg')

  if (carrierEl) carrierEl.value = (order.tracking && order.tracking.carrier) ? order.tracking.carrier : ''
  if (numberEl) numberEl.value = (order.tracking && order.tracking.trackingNumber) ? order.tracking.trackingNumber : ''
  if (urlEl) urlEl.value = (order.tracking && order.tracking.trackingUrl) ? order.tracking.trackingUrl : ''
  if (msgEl) msgEl.textContent = ''

  modal.classList.remove("hidden")
}

// Save tracking for the currently opened order
window.saveTracking = async function () {
  if (!__openOrderId) return alert('Open an order first')

  const carrier = String(document.getElementById('track-carrier')?.value || '').trim()
  const trackingNumber = String(document.getElementById('track-number')?.value || '').trim()
  const trackingUrl = String(document.getElementById('track-url')?.value || '').trim()
  const msgEl = document.getElementById('track-msg')

  try {
    if (msgEl) msgEl.textContent = 'Saving...'

    // Order IDs can include characters like "cs_test_...".
    // Use encodeURIComponent but NOT double-encode or append stray quotes.
    const res = await authFetch(`/api/orders/${encodeURIComponent(String(__openOrderId))}/tracking`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ carrier, trackingNumber, trackingUrl })
    })
    if (!res) return

    // Update local cache
    const updated = await res.json()
    const idx = allOrders.findIndex(o => adminOrderKey(o) === String(__openOrderId))
    if (idx !== -1) allOrders[idx] = normalizeOrderForAdmin(updated)

    if (msgEl) msgEl.textContent = 'Tracking saved.'
  } catch (e) {
    if (msgEl) msgEl.textContent = 'Failed to save tracking.'
  }
}

window.closeOrderModal = function () {
  document.getElementById("order-modal").classList.add("hidden")
}

/* ---------- CSV EXPORT ---------- */
window.exportCSV = function () {
  let csv = "Order ID,Customer,Phone,Amount,Status,Created\n"
  allOrders.forEach(o => {
    const id = o.orderId || o.id || ''
    const name = (o.customer && (o.customer.fullName || o.customer.name)) || ''
    const phone = (o.customer && o.customer.phone) || ''
    const amount = (o.totalAmount != null ? o.totalAmount : (o.amount != null ? o.amount : 0))
    const status = o.orderStatus || o.status || ''
    const created = o.orderDate || o.createdAt || ''
    csv += `${id},${name},${phone},${amount},${status},${created}\n`
  })
  const blob = new Blob([csv], { type: "text/csv" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = "jiedzhen_orders.csv"
  a.click()
}

/* ---------- ENQUIRIES UI ---------- */
const enquiriesTableBody = document.getElementById('enquiries-table-body')

function renderEnquiryStatusBadge(status) {
  const s = String(status || 'New')
  const cls = s.toLowerCase()
  // Reuse existing badge styling; class names may not exist for these statuses, but base badge still renders.
  return `<span class="status-badge status-${cls}">${s}</span>`
}

function fmtVehicle(v) {
  if (!v) return '-'
  const parts = [v.make, v.model, v.year, v.engine].filter(Boolean)
  return parts.length ? parts.join(' ') : '-'
}

async function loadEnquiries() {
  if (!enquiriesTableBody) return
  const res = await authFetch('/api/enquiries')
  if (!res) return
  allEnquiries = await res.json()
  filteredEnquiries = [...allEnquiries]
  renderEnquiries(filteredEnquiries)
}

function renderEnquiries(enquiries) {
  if (!enquiriesTableBody) return
  enquiriesTableBody.innerHTML = ''

  enquiries.forEach(e => {
    const tr = document.createElement('tr')
    const c = e.customer || {}
    tr.innerHTML = `
      <td><input type="checkbox" class="enquiry-check" value="${e.id}"></td>
      <td>${e.id}</td>
      <td>${c.name || '-'}</td>
      <td>${c.phone || '-'}</td>
      <td>${c.email || '-'}</td>
      <td>${fmtVehicle(e.vehicle)}</td>
      <td>${renderEnquiryStatusBadge(e.status)}</td>
      <td>${e.createdAt ? new Date(e.createdAt).toLocaleString() : '-'}</td>
      <td><button type="button" class="enquiry-view" data-enquiry-id="${e.id}">View</button></td>
    `
    enquiriesTableBody.appendChild(tr)
  })
}

window.filterEnquiries = function () {
  if (!enquiriesTableBody) return
  const q = (document.getElementById('enquiry-search')?.value || '').toLowerCase()
  const s = (document.getElementById('enquiry-filter')?.value || '').trim()

  filteredEnquiries = allEnquiries.filter(e => {
    const c = e.customer || {}
    const textMatch =
      String(e.id || '').toLowerCase().includes(q) ||
      String(c.name || '').toLowerCase().includes(q) ||
      String(c.phone || '').toLowerCase().includes(q) ||
      String(c.email || '').toLowerCase().includes(q)

    const statusMatch = !s || String(e.status || '') === s
    return textMatch && statusMatch
  })

  renderEnquiries(filteredEnquiries)
}

window.bulkUpdateEnquiries = async function () {
  const status = (document.getElementById('enquiry-bulk-status')?.value || '').trim()
  if (!status) return alert('Select status')

  const selected = [...document.querySelectorAll('.enquiry-check:checked')].map(c => Number(c.value))
  if (!selected.length) return alert('No enquiries selected')

  for (const id of selected) {
    await authFetch(`/api/enquiries/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    })
  }
  await loadEnquiries()
}

window.openEnquiry = function (id) {
  const enquiry = allEnquiries.find(e => Number(e.id) === Number(id))
  if (!enquiry) return

  const modal = document.getElementById('enquiry-modal')
  const body = document.getElementById('enquiry-modal-body')
  if (!modal || !body) return

  const c = enquiry.customer || {}

  body.innerHTML = `
    <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;">
      <div>
        <strong>Enquiry</strong> #${enquiry.id}<br>
        Status: ${renderEnquiryStatusBadge(enquiry.status)}<br>
        Created: ${enquiry.createdAt ? new Date(enquiry.createdAt).toLocaleString() : '-'}<br>
        Updated: ${enquiry.updatedAt ? new Date(enquiry.updatedAt).toLocaleString() : '-'}
      </div>
      <div>
        <label style="display:block; font-size:12px; opacity:.8;">Update status</label>
        <select id="enquiry-status-select">
          <option ${enquiry.status === 'New' ? 'selected' : ''}>New</option>
          <option ${enquiry.status === 'Contacted' ? 'selected' : ''}>Contacted</option>
          <option ${enquiry.status === 'Quoted' ? 'selected' : ''}>Quoted</option>
          <option ${enquiry.status === 'Closed' ? 'selected' : ''}>Closed</option>
        </select>
        <button type="button" style="margin-left:6px;" id="enquiry-status-save" data-enquiry-id="${enquiry.id}">Save</button>
      </div>
    </div>
    <hr>
    <strong>Customer</strong><br>
    ${c.name || '-'}<br>
    ${c.phone || '-'}<br>
    ${c.email || '-'}
    <br><br>
    <strong>Vehicle</strong><br>
    ${fmtVehicle(enquiry.vehicle)}
    <br><br>
    <strong>Items</strong><br>
    ${(enquiry.items || []).map(i => `${i.name || ''}${i.partNumber ? ` (${i.partNumber})` : ''} x${i.quantity || 1} — AED ${i.price || 0}`).join('<br>')}
    ${enquiry.notes ? `<br><br><strong>Notes</strong><br>${enquiry.notes}` : ''}
  `

  modal.classList.remove('hidden')
}

window.saveEnquiryStatus = async function (id) {
  const status = document.getElementById('enquiry-status-select')?.value
  if (!status) return

  const res = await authFetch(`/api/enquiries/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  })
  if (!res) return

  await loadEnquiries()
}

window.closeEnquiryModal = function () {
  document.getElementById('enquiry-modal')?.classList.add('hidden')
}

/* ---------- INIT ---------- */
// Bind product toolbar actions without inline event handlers (CSP-safe)
document.getElementById('product-search')?.addEventListener('input', filterProducts)
document.getElementById('product-page-size')?.addEventListener('change', changeProductsPageSize)
// Pagination buttons live in the toolbar
;(() => {
  const indicator = document.getElementById('products-page-indicator')
  const toolbar = indicator?.closest('.order-toolbar')
  const btns = toolbar ? [...toolbar.querySelectorAll('button')] : []
  // We can't rely on button text in all locales, but current markup uses these labels.
  btns.forEach(b => {
    const t = String(b.textContent || '').trim().toLowerCase()
    if (t === 'previous') b.addEventListener('click', prevProductsPage)
    if (t === 'next') b.addEventListener('click', nextProductsPage)
  })
})()

// Stock export button (added to toolbar)
;(() => {
  const btn = [...document.querySelectorAll('button')].find(b => String(b.textContent || '').toLowerCase().includes('download stock'))
  btn?.addEventListener('click', (e) => {
    e.preventDefault()
    exportStockCSV()
  })
})()

loadProducts()
loadOrders()
loadEnquiries()