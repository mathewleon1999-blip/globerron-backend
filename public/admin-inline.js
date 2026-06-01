// Extracted from inline script in admin.html
// Also binds event listeners that were previously inline HTML attributes

document.addEventListener("DOMContentLoaded", () => {
  const logout = document.getElementById("logout-btn")
  if (logout) {
    logout.onclick = async () => {
      localStorage.removeItem("adminToken")
      try {
        await fetch("/api/logout", { method: "POST", credentials: "same-origin" })
      } catch {}
      window.location.href = "/admin-login.html"
    }
  }

  // Theme toggle is handled globally by /theme.js
  window.renderStatusBadge = status => {
    const s = String(status || "pending").toLowerCase()
    return `<span class="status-badge status-${s}">${s}</span>`
  }

  // ---- Replace CSP-blocked inline handlers with addEventListener bindings ----

  // Products search
  const productSearch = document.getElementById("product-search")
  productSearch?.addEventListener("input", () => {
    if (typeof window.filterProducts === "function") window.filterProducts()
  })

  // Products page size
  const productPageSize = document.getElementById("product-page-size")
  productPageSize?.addEventListener("change", () => {
    if (typeof window.changeProductsPageSize === "function") window.changeProductsPageSize()
  })

  // Export stock CSV
  document.getElementById("export-stock-csv")?.addEventListener("click", () => {
    if (typeof window.exportStockCSV === "function") window.exportStockCSV()
  })

  // Products pagination
  document.getElementById("products-prev")?.addEventListener("click", () => {
    if (typeof window.prevProductsPage === "function") window.prevProductsPage()
  })
  document.getElementById("products-next")?.addEventListener("click", () => {
    if (typeof window.nextProductsPage === "function") window.nextProductsPage()
  })

  // Enquiries search/filter/bulk
  document.getElementById("enquiry-search")?.addEventListener("input", () => {
    if (typeof window.filterEnquiries === "function") window.filterEnquiries()
  })
  document.getElementById("enquiry-filter")?.addEventListener("change", () => {
    if (typeof window.filterEnquiries === "function") window.filterEnquiries()
  })
  document.getElementById("enquiry-bulk-apply")?.addEventListener("click", () => {
    if (typeof window.bulkUpdateEnquiries === "function") window.bulkUpdateEnquiries()
  })
  document.getElementById("enquiry-modal-close")?.addEventListener("click", () => {
    if (typeof window.closeEnquiryModal === "function") window.closeEnquiryModal()
    else document.getElementById("enquiry-modal")?.classList.add("hidden")
  })

  // Orders search/filter/bulk/export/pagination
  document.getElementById("order-search")?.addEventListener("input", () => {
    if (typeof window.filterOrders === "function") window.filterOrders()
  })
  document.getElementById("order-filter")?.addEventListener("change", () => {
    if (typeof window.filterOrders === "function") window.filterOrders()
  })
  document.getElementById("orders-bulk-apply")?.addEventListener("click", () => {
    if (typeof window.bulkUpdate === "function") window.bulkUpdate()
  })
  document.getElementById("orders-export-csv")?.addEventListener("click", () => {
    if (typeof window.exportCSV === "function") window.exportCSV()
  })

  // Orders page size
  document.getElementById("page-size")?.addEventListener("change", () => {
    if (typeof window.changePageSize === "function") window.changePageSize()
  })

  // Orders pagination
  document.getElementById("orders-prev")?.addEventListener("click", () => {
    if (typeof window.prevPage === "function") window.prevPage()
  })
  document.getElementById("orders-next")?.addEventListener("click", () => {
    if (typeof window.nextPage === "function") window.nextPage()
  })

  // Order modal close
  document.getElementById("order-modal-close")?.addEventListener("click", () => {
    if (typeof window.closeOrderModal === "function") window.closeOrderModal()
    else document.getElementById("order-modal")?.classList.add("hidden")
  })

  // Save tracking
  document.getElementById("save-tracking-btn")?.addEventListener("click", () => {
    if (typeof window.saveTracking === "function") window.saveTracking()
  })

  // ---- Event delegation for dynamically created table buttons ----

  // Orders table: View button
  document.getElementById('orders-table-body')?.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('.order-view')
    if (!btn) return
    const id = btn.getAttribute('data-order-id')
    if (!id) return
    if (typeof window.openOrder === 'function') window.openOrder(id)
  })

  // Enquiries table: View button
  document.getElementById('enquiries-table-body')?.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('.enquiry-view')
    if (!btn) return
    const id = btn.getAttribute('data-enquiry-id')
    if (!id) return
    if (typeof window.openEnquiry === 'function') window.openEnquiry(Number(id))
  })

  // Enquiry modal: Save status button
  document.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('#enquiry-status-save')
    if (!btn) return
    const id = btn.getAttribute('data-enquiry-id')
    if (!id) return
    if (typeof window.saveEnquiryStatus === 'function') window.saveEnquiryStatus(Number(id))
  })

  // Stock adjustment buttons in edit modal
  document.querySelectorAll('[data-adjust-stock]')?.forEach(btn => {
    btn.addEventListener('click', () => {
      const delta = Number(btn.getAttribute('data-adjust-stock') || '0')
      if (typeof window.adjustEditStock === 'function') window.adjustEditStock(delta)
    })
  })

  document.querySelectorAll('[data-set-stock]')?.forEach(btn => {
    btn.addEventListener('click', () => {
      const v = Number(btn.getAttribute('data-set-stock') || '0')
      if (typeof window.setEditStock === 'function') window.setEditStock(v)
    })
  })
})
