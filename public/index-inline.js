// Extracted from inline script in index.html (hero video autoplay helper)
;(function () {
  const v = document.getElementById("heroVideo")
  if (!v) return

  const tryPlay = async () => {
    try {
      const p = v.play()
      if (p && typeof p.catch === "function") await p
    } catch (_) {}
  }

  // Try immediately and after metadata loads
  tryPlay()
  v.addEventListener("loadedmetadata", tryPlay, { once: true })
  v.addEventListener("canplay", tryPlay, { once: true })

  // Retry on first user interaction (still no UI)
  const onFirstGesture = () => {
    tryPlay()
    window.removeEventListener("touchstart", onFirstGesture)
    window.removeEventListener("click", onFirstGesture)
    window.removeEventListener("scroll", onFirstGesture)
  }

  window.addEventListener("touchstart", onFirstGesture, { passive: true, once: true })
  window.addEventListener("click", onFirstGesture, { passive: true, once: true })
  window.addEventListener("scroll", onFirstGesture, { passive: true, once: true })
})()
