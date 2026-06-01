// Extracted from inline script in index.html (conditional Three.js loader)
;(function () {
  try {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const isMobile = window.matchMedia && window.matchMedia("(max-width: 768px)").matches
    if (reduce || isMobile) return

    const s1 = document.createElement("script")
    s1.src = "https://unpkg.com/three@0.160.0/build/three.min.js"
    s1.defer = true
    s1.onload = function () {
      const s2 = document.createElement("script")
      s2.src = "three-hero.js"
      s2.defer = true
      document.body.appendChild(s2)
    }
    document.body.appendChild(s1)
  } catch (_) {}
})()
