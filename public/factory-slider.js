// Factory slider (CSP-safe: no inline scripts)
(() => {
  const imgEl = document.getElementById('factory-slide')
  const prevBtn = document.getElementById('factory-prev')
  const nextBtn = document.getElementById('factory-next')
  const dotsWrap = document.getElementById('factory-dots')

  // If the slider isn't on the page, do nothing.
  if (!imgEl || !prevBtn || !nextBtn || !dotsWrap) return

  // Edit this list if you add/remove images.
  const slides = [
    '/images/factory/01.jpg',
    '/images/factory/02.jpg',
    '/images/factory/03.jpg',
  ]

  let idx = 0

  const setActiveDot = () => {
    dotsWrap.querySelectorAll('[data-factory-dot]').forEach(btn => {
      const i = Number(btn.getAttribute('data-factory-dot'))
      btn.style.background = (i === idx) ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)'
    })
  }

  const show = (i) => {
    idx = (Number(i) + slides.length) % slides.length
    imgEl.src = slides[idx]
    setActiveDot()
  }

  prevBtn.addEventListener('click', (e) => {
    e.preventDefault()
    show(idx - 1)
  })

  nextBtn.addEventListener('click', (e) => {
    e.preventDefault()
    show(idx + 1)
  })

  dotsWrap.querySelectorAll('[data-factory-dot]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      show(Number(btn.getAttribute('data-factory-dot')))
    })
  })

  // Auto rotate every 5 seconds (pause on hover + when tab hidden)
  const intervalMs = 5000
  let timer = null

  const start = () => {
    if (timer) return
    timer = setInterval(() => show(idx + 1), intervalMs)
  }

  const stop = () => {
    if (!timer) return
    clearInterval(timer)
    timer = null
  }

  const root = document.getElementById('factory-slider')
  root?.addEventListener('mouseenter', stop)
  root?.addEventListener('mouseleave', start)

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop()
    else start()
  })

  // Init
  show(0)
  start()
})()
