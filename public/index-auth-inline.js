// Extracted from inline script in index.html (account UI)
;(function () {
  const loginLink = document.getElementById("auth-login")
  const menu = document.getElementById("account-menu")
  const btn = document.getElementById("account-btn")
  const dd = document.getElementById("account-dropdown")
  const avatar = document.getElementById("account-avatar")
  const nameEl = document.getElementById("account-name")
  const logoutBtn = document.getElementById("auth-logout")

  function esc(s) {
    return String(s ?? "").replace(/[&<>\"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[c])
  }

  function setAvatar(me) {
    const url = me && me.profile && me.profile.avatarUrl ? String(me.profile.avatarUrl).trim() : ""
    if (url) {
      avatar.innerHTML = `<img alt="Avatar" src="${esc(url)}" />`
      return
    }
    const base = me && (me.name || me.email) ? String(me.name || me.email).trim() : "U"
    const letter = base ? base[0].toUpperCase() : "U"
    avatar.textContent = letter
  }

  function openDropdown() {
    if (!dd || !btn) return
    dd.style.display = "block"
    btn.setAttribute("aria-expanded", "true")
  }

  function closeDropdown() {
    if (!dd || !btn) return
    dd.style.display = "none"
    btn.setAttribute("aria-expanded", "false")
  }

  async function loadMe() {
    try {
      const res = await fetch("/api/auth/me", { credentials: "same-origin" })

      // 401 for guests is expected; do not treat as an error or log noise.
      if (res.status === 401) {
        if (loginLink) loginLink.style.display = "inline-flex"
        if (menu) menu.style.display = "none"
        return
      }

      if (!res.ok) throw new Error("auth check failed")

      const me = await res.json()

      if (loginLink) loginLink.style.display = "none"
      if (menu) menu.style.display = "inline-flex"
      if (nameEl) nameEl.textContent = me.name ? me.name : "My Account"
      if (avatar) setAvatar(me)
    } catch {
      // Network/server errors: fail closed to logged-out UI.
      if (loginLink) loginLink.style.display = "inline-flex"
      if (menu) menu.style.display = "none"
    }
  }

  // On desktop: click navigates to account page.
  // The chevron can still be used to open dropdown.
  btn && btn.addEventListener("click", e => {
    if (e.target && e.target.closest && e.target.closest(".chev")) {
      e.preventDefault()
      const isOpen = dd && dd.style.display === "block"
      if (isOpen) closeDropdown()
      else openDropdown()
      return
    }
    closeDropdown()
  })

  document.addEventListener("click", e => {
    if (!menu) return
    if (!menu.contains(e.target)) closeDropdown()
  })

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeDropdown()
  })

  logoutBtn && logoutBtn.addEventListener("click", async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } catch {}
    window.location.reload()
  })

  loadMe()
})()
