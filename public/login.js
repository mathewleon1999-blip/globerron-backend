document.addEventListener("DOMContentLoaded", () => {
  const loginBtn = document.getElementById("login-btn")
  const errorBox = document.getElementById("login-error")

  loginBtn.addEventListener("click", async () => {
    const username = document.getElementById("username").value.trim()
    const password = document.getElementById("password").value.trim()

    errorBox.textContent = ""

    if (!username || !password) {
      errorBox.textContent = "Please enter username and password"
      return
    }

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, password })
      })

      const data = await res.json()

      if (!res.ok) {
        errorBox.textContent = data.message || "Invalid admin credentials"
        return
      }

      // Admin login success
      window.location.href = "/admin.html"

    } catch (err) {
      errorBox.textContent = "Server error. Please try again"
    }
  })
})
