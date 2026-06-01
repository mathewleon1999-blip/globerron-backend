const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
const compression = require("compression")
const rateLimit = require("express-rate-limit")
// const pino = require("pino")
const cookieParser = require("cookie-parser")
const path = require("path")
const fs = require("fs")
const multer = require("multer")
const sharp = require("sharp")
const session = require("express-session")
const bcrypt = require("bcryptjs")
const Stripe = require("stripe")
const crypto = require("crypto")

// Load env vars deterministically.
// 1) Prefer project-root .env (../.env relative to this file)
// 2) Fallback to process.cwd() (useful for local dev / alternate launch dirs)
// NOTE: dotenv only sets variables that are not already set, so a hosting panel can override.
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), override: false })
require("dotenv").config({ path: path.resolve(process.cwd(), ".env"), override: false })

// Optional (recommended in production): Redis-backed sessions
let RedisStore
let redisClient
try {
  RedisStore = require("connect-redis").default
  const { createClient } = require("redis")
  if (process.env.REDIS_URL) {
    redisClient = createClient({ url: process.env.REDIS_URL })
    redisClient.on("error", err => console.error("Redis error:", err))
    // Connect lazily (don't block startup if Redis isn't available)
    redisClient.connect().catch(err => console.error("Redis connect failed:", err))
  }
} catch {
  // connect-redis/redis not installed or not desired
}

const productsRoutes = require("./routes/products.routes")

// Pluggable persistence (json/sqlite/postgres)
const store = require("./storage")

const app = express()
const PORT = Number(process.env.PORT) || 5000
const HOST = process.env.HOST || "0.0.0.0"

// If behind a reverse proxy (Render/Heroku/Nginx), this allows secure cookies to work.
// Safe locally as well.
app.set("trust proxy", 1)

/* ---------- STRIPE ---------- */
let stripe = null
if (!process.env.STRIPE_SECRET_KEY) {
  // Don't crash the whole server; allow non-payment pages to load.
  // Stripe routes will return a clear error instead.
  console.error("STRIPE_SECRET_KEY missing")
} else {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
}

/* ---------- DATA FILES ---------- */
const PRODUCTS_FILE = path.join(__dirname, "products.json")
const ORDERS_FILE = path.join(__dirname, "orders.json")
const ENQUIRIES_FILE = path.join(__dirname, "enquiries.json")
const USERS_FILE = path.join(__dirname, "users.json")

/* ---------- HELPERS ---------- */
function loadJson(file, fallback = []) {
  try {
    if (!fs.existsSync(file)) return fallback
    const data = fs.readFileSync(file, "utf8")
    return JSON.parse(data)
  } catch (err) {
    console.error("Failed to load JSON:", file)
    return fallback
  }
}

function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
}

/* ---------- MIDDLEWARE ---------- */
app.disable("x-powered-by")

// Security headers
// Enable CSP + Permissions-Policy in a compatible way for this site.
// NOTE: We allow unpkg.com for three.js, and Google endpoints for OAuth.
app.use(helmet({
  // HSTS is set at Nginx level (for SSL Labs / A+). Disable Helmet HSTS to avoid duplicate headers.
  hsts: false,

  // Allow OAuth popups (Google login) while keeping isolation benefits.
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },

  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      // Helmet defaults include: default-src 'self'; base-uri 'self'; etc.
      "default-src": ["'self'"],
      "script-src": [
        "'self'",
        "https://unpkg.com"
      ],
      "style-src": [
        "'self'",
        // NOTE: index.html still contains a large inline <style> block.
        // We keep unsafe-inline for styles until we extract it.
        "'unsafe-inline'"
      ],
      "img-src": ["'self'", "data:", "blob:", "https:", "https://*.googleusercontent.com"],
      "font-src": ["'self'", "data:", "https:"],
      "connect-src": [
        "'self'",
        // Google OAuth/token/userinfo
        "https://accounts.google.com",
        "https://oauth2.googleapis.com",
        "https://www.googleapis.com",
        // Gemini API
        "https://generativelanguage.googleapis.com"
      ],
      "frame-src": [
        "'self'",
        "https://accounts.google.com",
        // Google Maps embed on /contact.html
        "https://www.google.com",
        "https://www.google.com/maps",
        "https://maps.google.com"
      ],
      "media-src": ["'self'", "blob:", "https:"],
      "object-src": ["'none'"],
      "upgrade-insecure-requests": []
    }
  },
  // Permissions-Policy (formerly Feature-Policy)
  // Disable sensitive APIs you don't use; keep it conservative.
  permissionsPolicy: {
    features: {
      camera: [],
      microphone: [],
      geolocation: [],
      payment: [],
      usb: [],
      bluetooth: [],
      accelerometer: [],
      autoplay: ["self"],
      "clipboard-read": [],
      "clipboard-write": ["self"],
      fullscreen: ["self"],
      "picture-in-picture": ["self"],
      "screen-wake-lock": [],
      "web-share": ["self"],
    }
  }
}))

// Enable gzip compression for text-based responses
app.use(compression())

app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : undefined, credentials: true }))
app.use(express.json({ limit: "1mb" }))
app.use(express.urlencoded({ extended: true }))
// cookie-parser must not depend on effectiveSessionSecret here because it's defined later.
// We don't need signed cookies for OAuth state; plain httpOnly cookies are sufficient.
app.use(cookieParser())

// Cache static assets aggressively (images/css/js). Keep HTML non-cached to avoid stale deploys.
const publicDir = path.join(__dirname, "../public")
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next()
  // Don't cache HTML documents
  if (req.path === "/" || req.path.endsWith(".html")) {
    res.setHeader("Cache-Control", "no-store")
  }
  next()
})

app.use(express.static(publicDir, {
  etag: true,
  lastModified: true,
  maxAge: "30d"
}))

// SEO: Avoid duplicate home URLs.
// Redirect /index.html -> / so Google indexes the canonical homepage.
app.get(["/index.html", "/home", "/home.html"], (req, res) => {
  res.redirect(301, "/")
})

/* ---------- SESSION ---------- */
// SESSION_SECRET should always be set in production.
// In development, fall back to a deterministic local secret to avoid crashing `npm start`.
const sessionSecret = process.env.SESSION_SECRET || process.env.ADMIN_SESSION_SECRET
const effectiveSessionSecret = sessionSecret || (app.get("env") === "production" ? "" : "dev-session-secret")
if (!effectiveSessionSecret) {
  throw new Error("Missing SESSION_SECRET (or ADMIN_SESSION_SECRET) environment variable")
}

const sessionOptions = {
  name: process.env.SESSION_COOKIE_NAME || "globerron.sid",
  secret: effectiveSessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,

    // Mobile + OAuth redirects:
    // Google OAuth callback must receive the same session cookie that was set on /api/auth/google.
    // Some mobile browsers/in-app webviews drop Lax cookies on cross-site redirects.
    // `SameSite=None; Secure` is the most reliable for OAuth flows.
    sameSite: "none",
    secure: true,

    maxAge: Number(process.env.SESSION_TTL_MS || 7 * 24 * 60 * 60 * 1000) // 7 days
  }
}

// Use Redis store when REDIS_URL is configured
if (RedisStore && redisClient) {
  sessionOptions.store = new RedisStore({ client: redisClient, prefix: "sess:" })
}

app.use(session(sessionOptions))

/* ---------- IMAGE UPLOAD ---------- */
const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 }
})

const IMAGE_DIR = path.join(__dirname, "../public/images/products")
if (!fs.existsSync(IMAGE_DIR)) {
  fs.mkdirSync(IMAGE_DIR, { recursive: true })
}

/* ---------- LOAD DATA ---------- */
let products = loadJson(PRODUCTS_FILE, [])
let orders = loadJson(ORDERS_FILE, [])
let enquiries = loadJson(ENQUIRIES_FILE, [])

// Users should come from the configured store; fall back to legacy JSON only if needed.
let users = []
try {
  if (store && store.users && typeof store.users.list === "function") {
    // If provider supports listing, keep an in-memory copy for legacy endpoints.
    Promise.resolve(store.users.list())
      .then(all => {
        users = Array.isArray(all) ? all : []
      })
      .catch(() => {
        users = loadJson(USERS_FILE, [])
      })
  } else {
    users = loadJson(USERS_FILE, [])
  }
} catch {
  users = loadJson(USERS_FILE, [])
}

/* ---------- ADMIN PASSWORD ---------- */
// Kept for legacy endpoint /api/login. Prefer /api/admin/login which uses env directly.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123"

/* ---------- AUTH ---------- */
function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) {
    return res.status(401).json({ message: "Not authorised" })
  }
  next()
}

function requireUser(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ requiresAuth: true })
  }
  next()
}

/* ---------- ADMIN LOGIN (legacy) ---------- */
app.post("/api/login", (req, res) => {
  const { password } = req.body
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true
    return res.json({ success: true })
  }
  res.status(401).json({ message: "Invalid password" })
})

/* ---------- ADMIN LOGIN (2FA via Email OTP) ---------- */
const ADMIN_OTP_TTL_MS = 10 * 60 * 1000

function adminOtpRecipient(){
  // For this setup, OTP is sent to a fixed personal email.
  // Fallback to ADMIN_EMAIL if ADMIN_OTP_EMAIL is not provided.
  return String(process.env.ADMIN_OTP_EMAIL || process.env.ADMIN_EMAIL || '').trim().toLowerCase()
}

function adminOtpStorePut(req, otp){
  req.session.adminOtpHash = otp ? bcrypt.hashSync(String(otp), 10) : null
  req.session.adminOtpExpiresAt = otp ? (Date.now() + ADMIN_OTP_TTL_MS) : null
  req.session.adminOtpPending = true
}

function adminOtpStoreClear(req){
  req.session.adminOtpHash = null
  req.session.adminOtpExpiresAt = null
  req.session.adminOtpPending = false
}

function generateAdminOtp(){
  return String(Math.floor(100000 + Math.random() * 900000))
}

// Step 1: verify password and send OTP
app.post('/api/admin/login/start', async (req, res) => {
  try {
    const { email, password } = req.body || {}

    const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase()
    const adminPassword = String(process.env.ADMIN_PASSWORD || "")

    if (!adminEmail || !adminPassword) {
      return res.status(500).json({ message: 'Admin credentials are not configured' })
    }

    const emailNorm = String(email || '').trim().toLowerCase()
    const passwordRaw = String(password || '')

    if (emailNorm !== adminEmail || passwordRaw !== adminPassword) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    const otpTo = adminOtpRecipient()
    if (!otpTo) {
      return res.status(500).json({ message: 'Admin OTP email is not configured (ADMIN_OTP_EMAIL)' })
    }

    const otp = generateAdminOtp()
    adminOtpStorePut(req, otp)

    const { sendMail } = require('./services/mailer')
    await sendMail({
      to: otpTo,
      subject: 'Admin OTP (JIEDIZHEN)',
      text:
        `Your admin login OTP is: ${otp}\n` +
        `This code expires in 10 minutes.\n\n` +
        `If you did not request this, you can ignore this email.\n`
    })

    console.log('Admin OTP sent:', { to: otpTo })

    return res.json({ success: true, otpSentTo: otpTo })
  } catch (e) {
    console.error('Admin OTP send failed:', {
      code: e?.code,
      responseCode: e?.responseCode,
      message: e?.message || String(e)
    })
    return res.status(500).json({ message: 'Failed to send admin OTP' })
  }
})

// Step 2: verify OTP and establish admin session
app.post('/api/admin/login/verify-otp', async (req, res) => {
  try {
    const otp = String(req.body?.otp || '').trim()
    if (!otp) return res.status(400).json({ message: 'OTP is required' })

    const exp = Number(req.session.adminOtpExpiresAt || 0)
    if (!req.session.adminOtpPending || !req.session.adminOtpHash || !exp || Date.now() > exp) {
      return res.status(401).json({ message: 'OTP expired. Please login again.' })
    }

    const ok = await bcrypt.compare(otp, req.session.adminOtpHash)
    if (!ok) return res.status(401).json({ message: 'Invalid OTP' })

    adminOtpStoreClear(req)

    req.session.isAdmin = true
    const token = Buffer.from(`admin:${Date.now()}`).toString('base64')
    req.session.adminToken = token

    return res.json({ token, success: true })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ message: 'OTP verification failed' })
  }
})

// Backwards compatibility: keep /api/admin/login but require 2FA by default
app.post("/api/admin/login", async (req, res) => {
  return res.status(400).json({
    message: 'Use /api/admin/login/start then /api/admin/login/verify-otp'
  })
})

/* ---------- CUSTOMER AUTH ---------- */
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, phone, password, confirmPassword } = req.body
    if (!name || !email || !phone || !password || !confirmPassword) {
      return res.status(400).json({ error: "All fields are required" })
    }
    const emailNorm = String(email).trim().toLowerCase()
    const phoneNorm = String(phone).trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      return res.status(400).json({ error: "Invalid email" })
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" })
    }

    const existing = await store.users.findByEmail(emailNorm)
    if (existing) {
      return res.status(409).json({ error: "Email already registered" })
    }

    const hash = await bcrypt.hash(password, 10)
    const user = {
      id: Date.now(),
      name: name.trim(),
      email: emailNorm,
      phone: phoneNorm,
      passwordHash: hash,
      createdAt: new Date().toISOString()
    }

    await store.users.create(user)

    req.session.userId = user.id
    res.json({ id: user.id, name: user.name, email: user.email, phone: user.phone })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: "Registration failed" })
  }
})

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body
    const emailNorm = String(email || "").trim().toLowerCase()
    const user = await store.users.findByEmail(emailNorm)
    if (!user) return res.status(401).json({ error: "Invalid credentials" })
    const ok = await bcrypt.compare(String(password || ""), user.passwordHash)
    if (!ok) return res.status(401).json({ error: "Invalid credentials" })
    req.session.userId = user.id
    res.json({ id: user.id, name: user.name, email: user.email, phone: user.phone })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: "Login failed" })
  }
})

/* ---------- CUSTOMER PASSWORD RESET (simple token + email) ---------- */
function generateResetToken(){
  return require("crypto").randomBytes(32).toString("hex")
}

function generateOtp(){
  // 6-digit numeric OTP
  return String(Math.floor(100000 + Math.random() * 900000))
}

app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const emailNorm = String(req.body?.email || "").trim().toLowerCase()
    // Always respond with success to avoid leaking which emails exist
    if (!emailNorm) return res.json({ success: true })

    let user = null
    if (store && store.users && typeof store.users.findByEmail === "function") {
      user = await store.users.findByEmail(emailNorm)
    } else {
      user = users.find(u => u.email === emailNorm)
    }

    if (!user) return res.json({ success: true })

    // Create both: OTP (for fast login) + reset token (for full reset page)
    const otp = generateOtp()
    const otpHash = await bcrypt.hash(otp, 10)
    const token = generateResetToken()

    const patch = {
      resetOtpHash: otpHash,
      resetOtpExpiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
      resetToken: token,
      resetTokenExpiresAt: Date.now() + 30 * 60 * 1000 // 30 minutes
    }

    if (store && store.users && typeof store.users.updateById === "function") {
      await store.users.updateById(user.id, patch)
    } else {
      user.resetOtpHash = patch.resetOtpHash
      user.resetOtpExpiresAt = patch.resetOtpExpiresAt
      user.resetToken = patch.resetToken
      user.resetTokenExpiresAt = patch.resetTokenExpiresAt
      saveJson(USERS_FILE, users)
    }

    const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`
    const resetUrl = `${baseUrl}/reset-password.html?token=${encodeURIComponent(token)}&email=${encodeURIComponent(emailNorm)}`

    // Send OTP + reset link (OTP supports quick login; link supports changing password)
    // Security: never log OTPs in production.
    try {
      const { sendMail } = require("./services/mailer")
      const text =
        `Your OTP code is: ${otp}\n` +
        `This code expires in 10 minutes.\n\n` +
        `Alternatively, you can reset your password using this link (valid for 30 minutes):\n${resetUrl}\n\n` +
        `If you did not request this, you can ignore this email.\n`

      if (typeof sendMail !== "function") {
        // If mailer isn't available, this is a configuration problem.
        return res.status(500).json({ error: "Email service is not available" })
      }

      await sendMail({
        to: emailNorm,
        subject: "Your OTP code (password help)",
        text
      })

      // Non-sensitive success log (do not log OTP).
      console.log("OTP email sent:", { email: emailNorm })

      return res.json({ success: true })
    } catch (e) {
      // Don't expose SMTP internals, but DO tell the client that sending failed.
      // This allows the UI/admin to know it's a server config problem (EMAIL_USER/EMAIL_PASS).
      console.error("OTP email send failed:", {
        email: emailNorm,
        code: e?.code,
        responseCode: e?.responseCode,
        message: e?.message || String(e)
      })

      return res.status(500).json({ error: "Failed to send OTP email" })
    }
  } catch (e) {
    console.error(e)
    return res.json({ success: true })
  }
})

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const emailNorm = String(req.body?.email || "").trim().toLowerCase()
    const token = String(req.body?.token || "").trim()
    const newPassword = String(req.body?.newPassword || "")

    if (!emailNorm || !token || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Invalid request" })
    }

    let user = null
    if (store && store.users && typeof store.users.findByEmail === "function") {
      user = await store.users.findByEmail(emailNorm)
    } else {
      user = users.find(u => u.email === emailNorm)
    }

    if (!user) return res.status(400).json({ error: "Invalid or expired token" })

    if (!user.resetToken || user.resetToken !== token) {
      return res.status(400).json({ error: "Invalid or expired token" })
    }
    if (!user.resetTokenExpiresAt || Date.now() > Number(user.resetTokenExpiresAt)) {
      return res.status(400).json({ error: "Invalid or expired token" })
    }

    const patch = {
      passwordHash: await bcrypt.hash(newPassword, 10),
      resetToken: null,
      resetTokenExpiresAt: null,
      resetOtpHash: null,
      resetOtpExpiresAt: null
    }

    if (store && store.users && typeof store.users.updateById === "function") {
      await store.users.updateById(user.id, patch)
    } else {
      user.passwordHash = patch.passwordHash
      delete user.resetToken
      delete user.resetTokenExpiresAt
      delete user.resetOtpHash
      delete user.resetOtpExpiresAt
      saveJson(USERS_FILE, users)
    }

    return res.json({ success: true })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: "Reset failed" })
  }
})

// Verify OTP and log user in (fast path)
app.post("/api/auth/verify-otp", async (req, res) => {
  try {
    const emailNorm = String(req.body?.email || "").trim().toLowerCase()
    const otp = String(req.body?.otp || "").trim()

    if (!emailNorm || !otp) return res.status(400).json({ error: "Invalid request" })

    const user = await store.users.findByEmail(emailNorm)
    if (!user) return res.status(401).json({ error: "Invalid OTP" })

    if (!user.resetOtpHash || !user.resetOtpExpiresAt || Date.now() > Number(user.resetOtpExpiresAt)) {
      return res.status(401).json({ error: "OTP expired" })
    }

    const ok = await bcrypt.compare(otp, user.resetOtpHash)
    if (!ok) return res.status(401).json({ error: "Invalid OTP" })

    // Clear OTP after use
    await store.users.updateById(user.id, { resetOtpHash: null, resetOtpExpiresAt: null })

    req.session.userId = user.id
    return res.json({ success: true })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: "OTP verification failed" })
  }
})

function requireGoogleEnv(){
  const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim()
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || "").trim()
  const callbackUrl = String(process.env.GOOGLE_CALLBACK_URL || "").trim()
  return { clientId, clientSecret, callbackUrl }
}

// ---- Google OAuth state store (server-side, TTL) ----
// Goal: make OAuth robust even when browsers/webviews drop cookies during redirects.
// We store state->next mapping server-side for 10 minutes and verify on callback.
// NOTE: In-memory is fine for a single VPS instance. If you scale to multiple instances,
// switch this to Redis.
const GOOGLE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000
const googleOAuthStateStore = new Map()

function googleStatePut(state, next) {
  googleOAuthStateStore.set(state, { next, exp: Date.now() + GOOGLE_OAUTH_STATE_TTL_MS })
}

function googleStateTake(state) {
  const rec = googleOAuthStateStore.get(state)
  if (!rec) return null
  googleOAuthStateStore.delete(state)
  if (Date.now() > Number(rec.exp || 0)) return null
  return rec
}

// Periodic cleanup (best-effort)
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of googleOAuthStateStore.entries()) {
    if (!v || now > Number(v.exp || 0)) googleOAuthStateStore.delete(k)
  }
}, 60 * 1000).unref?.()

// Google OAuth (no passport): redirects to Google, then exchanges code for tokens.
app.get("/api/auth/google", async (req, res) => {
  const { clientId, callbackUrl } = requireGoogleEnv()
  if (!clientId || !callbackUrl) return res.status(500).send("Google OAuth not configured")

  const next = String(req.query.next || "/")
  const state = crypto.randomBytes(16).toString("hex")

  // Primary: server-side store (cookie-independent)
  googleStatePut(state, next)

  // Secondary: keep cookies/session as best-effort (helps some clients)
  const cookieCommon = {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
    maxAge: GOOGLE_OAUTH_STATE_TTL_MS
  }
  res.cookie("g_oauth_state", state, cookieCommon)
  res.cookie("g_oauth_next", next, cookieCommon)

  req.session.googleOAuthState = state
  req.session.googleOAuthNext = next

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  authUrl.searchParams.set("client_id", clientId)
  authUrl.searchParams.set("redirect_uri", callbackUrl)
  authUrl.searchParams.set("response_type", "code")
  authUrl.searchParams.set("scope", "openid email profile")
  authUrl.searchParams.set("state", state)
  authUrl.searchParams.set("prompt", "select_account")

  return res.redirect(authUrl.toString())
})

app.get("/api/auth/google/callback", async (req, res) => {
  try {
    const { clientId, clientSecret, callbackUrl } = requireGoogleEnv()
    if (!clientId || !clientSecret || !callbackUrl) return res.status(500).send("Google OAuth not configured")

    const code = String(req.query.code || "")
    const state = String(req.query.state || "")

    // Primary: server-side store lookup
    const rec = state ? googleStateTake(state) : null

    // Secondary: fallback to cookie/session values
    const stateExpected = req.cookies?.g_oauth_state || req.session.googleOAuthState
    const next = (rec && rec.next) || req.cookies?.g_oauth_next || req.session.googleOAuthNext || "/"

    // Clear one-time client values
    try {
      res.clearCookie("g_oauth_state", { path: "/" })
      res.clearCookie("g_oauth_next", { path: "/" })
    } catch {}
    req.session.googleOAuthState = null
    req.session.googleOAuthNext = null

    if (!code) return res.redirect("/login.html")

    // Validate state using store when possible; otherwise fall back to cookie/session.
    const ok = Boolean(rec) || (stateExpected && state === stateExpected)
    if (!ok) return res.status(400).send("Invalid OAuth state")

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code"
      })
    })

    const tokenJson = await tokenRes.json().catch(() => ({}))
    if (!tokenRes.ok) {
      console.error("Google token exchange failed:", tokenJson)
      return res.redirect("/login.html")
    }

    const accessToken = tokenJson.access_token

    // Get user info
    const meRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    const me = await meRes.json().catch(() => ({}))
    if (!meRes.ok || !me.email) {
      console.error("Google userinfo failed:", me)
      return res.redirect("/login.html")
    }

    const emailNorm = String(me.email).trim().toLowerCase()

    // Find or create user
    let user = await store.users.findByEmail(emailNorm)
    if (!user) {
      user = {
        id: Date.now(),
        name: String(me.name || me.given_name || "Customer").trim(),
        email: emailNorm,
        phone: "",
        passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 10),
        profile: { avatarUrl: String(me.picture || "").trim() },
        googleId: String(me.id || ""),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await store.users.create(user)
    } else {
      // Keep Google identity info up-to-date (important for mobile where users may switch accounts)
      const patch = {}

      if (me.id) patch.googleId = String(me.id)

      // Always refresh avatarUrl when Google provides it so the header shows the real picture.
      if (me.picture) {
        const p = (user.profile && typeof user.profile === 'object') ? user.profile : {}
        patch.profile = { ...p, avatarUrl: String(me.picture).trim() }
      }

      // Keep name updated (but don't overwrite a custom name unless it's missing/default)
      if (me.name && (!user.name || user.name === "Customer")) patch.name = String(me.name).trim()

      if (Object.keys(patch).length) {
        try {
          await store.users.updateById(user.id, {
            ...user,
            ...patch,
            updatedAt: new Date().toISOString()
          })
        } catch {}
      }
    }

    req.session.userId = user.id
    return res.redirect(next)
  } catch (e) {
    console.error(e)
    return res.redirect("/login.html")
  }
})

app.post("/api/auth/logout", (req, res) => {
  req.session.userId = null
  req.session.destroy(() => res.json({ success: true }))
})

app.get("/api/auth/me", async (req, res) => {
  const user = await store.users.findById(req.session.userId)
  if (!user) return res.status(401).json({ requiresAuth: true })
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    profile: user.profile || {}
  })
})

/* ---------- GARAGE (sync vehicles across devices) ---------- */
// Stored on the user profile so it works with json/sqlite/postgres providers.
// Shape:
//  user.profile.garage = { vehicles: [{id,make,model,year,engine}], defaultVehicleId }
app.get('/api/garage', requireUser, async (req, res) => {
  try {
    const user = await store.users.findById(req.session.userId)
    if (!user) return res.status(401).json({ requiresAuth: true })

    const garage = user?.profile?.garage || {}
    const vehicles = Array.isArray(garage.vehicles) ? garage.vehicles : []
    const defaultVehicleId = garage.defaultVehicleId || null

    return res.json({ vehicles, defaultVehicleId })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to load garage' })
  }
})

app.put('/api/garage', requireUser, async (req, res) => {
  try {
    const user = await store.users.findById(req.session.userId)
    if (!user) return res.status(401).json({ requiresAuth: true })

    const body = req.body || {}
    const vehicles = Array.isArray(body.vehicles) ? body.vehicles : []
    const defaultVehicleId = body.defaultVehicleId || null

    // Basic sanitization
    const cleanVehicles = vehicles
      .map(v => ({
        id: Number(v?.id) || Date.now(),
        make: String(v?.make || '').trim(),
        model: String(v?.model || '').trim(),
        year: String(v?.year || '').trim(),
        engine: String(v?.engine || '').trim(),
      }))
      .filter(v => v.make && v.model && v.year && v.engine)
      .slice(0, 30)

    const nextProfile = { ...(user.profile || {}) }
    nextProfile.garage = { vehicles: cleanVehicles, defaultVehicleId }

    const saved = await store.users.updateById(user.id, {
      ...user,
      profile: nextProfile,
      updatedAt: new Date().toISOString(),
    })

    const garage = saved?.profile?.garage || {}
    return res.json({
      vehicles: Array.isArray(garage.vehicles) ? garage.vehicles : [],
      defaultVehicleId: garage.defaultVehicleId || null,
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to save garage' })
  }
})

/* ---------- USER ACCOUNT ---------- */
// Update profile (name/phone + basic profile fields)
app.put("/api/account/profile", requireUser, async (req, res) => {
  try {
    const user = await store.users.findById(req.session.userId)
    if (!user) return res.status(401).json({ requiresAuth: true })

    const body = req.body || {}

    const next = { ...user }

    if (body.name !== undefined) next.name = String(body.name || "").trim()
    if (body.phone !== undefined) next.phone = String(body.phone || "").trim()

    if (!next.profile) next.profile = {}
    if (body.avatarUrl !== undefined) next.profile.avatarUrl = String(body.avatarUrl || "").trim()
    if (body.address !== undefined) next.profile.address = String(body.address || "").trim()
    if (body.company !== undefined) next.profile.company = String(body.company || "").trim()

    next.updatedAt = new Date().toISOString()

    const saved = await store.users.updateById(user.id, next)

    return res.json({
      success: true,
      user: {
        id: saved.id,
        name: saved.name,
        email: saved.email,
        phone: saved.phone,
        profile: saved.profile || {}
      }
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: "Profile update failed" })
  }
})

// Change password
app.put("/api/account/password", requireUser, async (req, res) => {
  try {
    const user = await store.users.findById(req.session.userId)
    if (!user) return res.status(401).json({ requiresAuth: true })

    const currentPassword = String(req.body?.currentPassword || "")
    const newPassword = String(req.body?.newPassword || "")

    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Invalid request" })
    }

    const ok = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!ok) return res.status(401).json({ error: "Current password is incorrect" })

    const patch = {
      passwordHash: await bcrypt.hash(newPassword, 10),
      updatedAt: new Date().toISOString()
    }

    await store.users.updateById(user.id, patch)

    return res.json({ success: true })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: "Password update failed" })
  }
})

// Delete account
app.delete("/api/account", requireUser, async (req, res) => {
  try {
    const user = await store.users.findById(req.session.userId)
    if (!user) return res.status(401).json({ requiresAuth: true })

    const password = String(req.body?.password || "")
    if (!password) return res.status(400).json({ error: "Password is required" })

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ error: "Invalid password" })

    await store.users.deleteById(user.id)

    // Best-effort: detach orders from this user (keep order record for admin/accounting)
    // Only implemented for json/sqlite providers currently via updateById.
    // For postgres, orders are linked by userId so account orders remain private.
    try {
      // If provider supports listing orders for user, we can detach them.
      const myOrders = await store.orders.listByUser(user)
      for (const o of myOrders) {
        await store.orders.updateById(o.id, { userId: null, deletedUserId: user.id })
      }
    } catch {}

    req.session.userId = null
    req.session.destroy(() => res.json({ success: true }))
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: "Account deletion failed" })
  }
})

// User order history (stored orders can be linked by userId, or fallback to email/phone match)
app.get("/api/account/orders", requireUser, async (req, res) => {
  try {
    const user = await store.users.findById(req.session.userId)
    if (!user) return res.status(401).json({ requiresAuth: true })

    const userOrders = await store.orders.listByUser(user)
    return res.json(userOrders)
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: "Failed to load order history" })
  }
})

/* ---------- LOGOUT ---------- */
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }))
})

/* ---------- RATE LIMITING ---------- */
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 })
app.use("/api/auth/", authLimiter)
app.use("/api/admin/login", authLimiter)

/* ---------- ADMIN AUTH (Bearer header support) ---------- */
function bearerAdmin(req, res, next){
  const h = req.headers["authorization"] || ""
  const m = /^Bearer\s+(.+)$/i.exec(h)
  if (m && req.session && req.session.adminToken && m[1] === req.session.adminToken) {
    req.session.isAdmin = true
  }
  next()
}

app.use(bearerAdmin)

/* ---------- ADMIN PAGE ---------- */
app.get("/admin.html", (req, res) => {
  if (!req.session.isAdmin) {
    return res.redirect("/admin-login.html")
  }
  res.sendFile(path.join(__dirname, "../public/admin.html"))
})

/* ---------- PRODUCTS ---------- */
// Controller-based product routes (includes AI endpoints like /ai/part-finder)
// Mount under /api/products so the frontend can call /api/products/ai/part-finder.
// This is mounted BEFORE the legacy JSON CRUD below, so the CRUD in this file remains the source of truth.
app.use("/api/products", productsRoutes)



// List products (public)
app.get("/api/products", (req, res) => {
  return res.json(products)
})

app.post(
  "/api/products",
  requireAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      const {
        name,
        partNumber,
        price,
        category,
        compatibleVehicles
      } = req.body

      let parsedVehicles = []
      if (compatibleVehicles) {
        try {
          parsedVehicles = JSON.parse(compatibleVehicles)
        } catch {
          parsedVehicles = compatibleVehicles
            .split(",")
            .map(v => v.trim())
        }
      }

      let imageUrl = ""
      if (req.file) {
        const filename =
          Date.now() + "-" + req.file.originalname.replace(/\s+/g, "-")
        const outputPath = path.join(IMAGE_DIR, filename)

        await sharp(req.file.buffer)
          .resize({ width: 800, withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toFile(outputPath)

        imageUrl = `/images/products/${filename}`
      }

      const product = {
        id: Date.now(),
        name,
        partNumber,
        price: Number(price),
        category,

        // Stock management (qty-based)
        stockQty: Math.max(0, Number(req.body.stockQty || 0) || 0),
        lowStockThreshold: Math.max(0, Number(req.body.lowStockThreshold || 5) || 0),

        stockStatus: {
          availableToday: req.body.availableToday === "true",
          shipsIn1to2Days: req.body.shipsIn1to2Days === "true",
          preOrderDate: req.body.preOrderDate || null
        },
        imageUrl,
        compatibleVehicles: parsedVehicles,
        warrantyDuration: req.body.warrantyDuration || "",
        returnEligibility: req.body.returnEligibility || "",
        conditions: req.body.conditions || "",
        supplier: req.body.supplier || "",
        internalNotes: req.body.internalNotes || "",
        priceHistory: [],
        mostEnquiredThisWeek: req.body.mostEnquiredThisWeek === "true",
        popularWithBrands: req.body.popularWithBrands ? req.body.popularWithBrands.split(",").map(b => b.trim()) : [],
        frequentlyOrderedWith: req.body.frequentlyOrderedWith ? req.body.frequentlyOrderedWith.split(",").map(p => p.trim()) : []
      }

      products.push(product)
      saveJson(PRODUCTS_FILE, products)
      res.json(product)
    } catch (err) {
      console.error(err)
      res.status(500).json({ message: "Failed to add product" })
    }
  }
)

/* ---------- UPDATE PRODUCT ---------- */
app.put(
  "/api/products/:id",
  requireAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      const id = Number(req.params.id)
      const product = products.find(p => p.id === id)
      if (!product) {
        return res.status(404).json({ message: "Product not found" })
      }

      const {
        name,
        partNumber,
        price,
        category,
        inStock,
        compatibleVehicles,
        removeImage,
        availableToday,
        shipsIn1to2Days,
        preOrderDate,
        warrantyDuration,
        returnEligibility,
        conditions,
        supplier,
        internalNotes,
        mostEnquiredThisWeek,
        popularWithBrands,
        frequentlyOrderedWith
      } = req.body

      if (name !== undefined) product.name = name
      if (partNumber !== undefined) product.partNumber = partNumber
      if (price !== undefined) product.price = Number(price)
      if (category !== undefined) product.category = category
      if (inStock !== undefined) {
        product.inStock = inStock === "true" || inStock === true
      }

      // Stock management (qty-based)
      if (req.body.stockQty !== undefined) {
        product.stockQty = Math.max(0, Number(req.body.stockQty || 0) || 0)
      }
      if (req.body.lowStockThreshold !== undefined) {
        product.lowStockThreshold = Math.max(0, Number(req.body.lowStockThreshold || 5) || 0)
      }

      if (compatibleVehicles) {
        try {
          product.compatibleVehicles = JSON.parse(compatibleVehicles)
        } catch {
          product.compatibleVehicles = compatibleVehicles
            .split(",")
            .map(v => v.trim())
        }
      }

      if (removeImage === "true") {
        product.imageUrl = ""
      }

      // New fields
      if (availableToday !== undefined) {
        if (!product.stockStatus) product.stockStatus = {}
        product.stockStatus.availableToday = availableToday === "true"
      }
      if (shipsIn1to2Days !== undefined) {
        if (!product.stockStatus) product.stockStatus = {}
        product.stockStatus.shipsIn1to2Days = shipsIn1to2Days === "true"
      }
      if (preOrderDate !== undefined) {
        if (!product.stockStatus) product.stockStatus = {}
        product.stockStatus.preOrderDate = preOrderDate || null
      }
      if (warrantyDuration !== undefined) product.warrantyDuration = warrantyDuration
      if (returnEligibility !== undefined) product.returnEligibility = returnEligibility
      if (conditions !== undefined) product.conditions = conditions
      if (supplier !== undefined) product.supplier = supplier
      if (internalNotes !== undefined) product.internalNotes = internalNotes
      if (mostEnquiredThisWeek !== undefined) product.mostEnquiredThisWeek = mostEnquiredThisWeek === "true"
      if (popularWithBrands !== undefined) {
        product.popularWithBrands = popularWithBrands ? popularWithBrands.split(",").map(b => b.trim()) : []
      }
      if (frequentlyOrderedWith !== undefined) {
        product.frequentlyOrderedWith = frequentlyOrderedWith ? frequentlyOrderedWith.split(",").map(p => p.trim()) : []
      }

      if (req.file) {
        const filename =
          Date.now() + "-" + req.file.originalname.replace(/\s+/g, "-")
        const outputPath = path.join(IMAGE_DIR, filename)

        await sharp(req.file.buffer)
          .resize({ width: 800, withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toFile(outputPath)

        product.imageUrl = `/images/products/${filename}`
      }

      saveJson(PRODUCTS_FILE, products)

      // Refresh in-memory products array from disk to avoid stale writes
      // in long-running processes (admin edits should persist reliably).
      products = loadJson(PRODUCTS_FILE, products)

      res.json(product)
    } catch (err) {
      console.error(err)
      res.status(500).json({ message: "Failed to update product" })
    }
  }
)

/* ---------- DELETE PRODUCT ---------- */
app.delete("/api/products/:id", requireAdmin, (req, res) => {
  products = products.filter(p => p.id !== Number(req.params.id))
  saveJson(PRODUCTS_FILE, products)
  res.json({ success: true })
})

/* ---------- STRIPE CHECKOUT ROUTES ---------- */
// New checkout router used by frontend: /api/checkout/create-checkout-session
// If Stripe is not configured, block the router with a clear error.
const checkoutRoutes = require("./routes/checkout.routes.cjs")
app.use("/api/checkout", (req, res, next) => {
  if (!stripe) return res.status(500).json({ error: "Stripe is not configured" })
  next()
}, checkoutRoutes)

/* ---------- STRIPE CHECKOUT (legacy endpoint) ---------- */
app.post("/api/checkout", requireUser, async (req, res) => {
  try {
    const { items, customerName, customerPhone } = req.body

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Cart is empty" })
    }

    const lineItems = items.map(item => ({
      price_data: {
        currency: "aed",
        product_data: { name: item.name },
        unit_amount: Math.round(Number(item.price) * 100)
      },
      quantity: item.quantity || 1
    }))

    if (!stripe) {
      return res.status(500).json({ error: "Stripe is not configured" })
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: lineItems,
      success_url:
        "http://localhost:5000/success.html?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "http://localhost:5000/cancel.html",
      metadata: {
        customerName: customerName || "",
        customerPhone: customerPhone || ""
      }
    })

    res.json({ url: session.url })
  } catch (err) {
    console.error("Stripe checkout error:", err.message)
    res.status(500).json({ error: "Payment failed" })
  }
})

/* ---------- SAVE ORDER ---------- */
app.post("/api/checkout/success", requireUser, async (req, res) => {
  try {
    const { sessionId, order: orderPayload } = req.body || {}

    if (!sessionId) {
      return res.status(400).json({ error: "Missing sessionId" })
    }

    // If already saved, treat as success (idempotent)
    const existingOrder = await store.orders.findById(sessionId)
    if (existingOrder) {
      return res.json({ success: true })
    }

    if (!stripe) {
      return res.status(500).json({ error: "Stripe is not configured" })
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items"]
    })

    // Build items from Stripe line items (source of truth for paid amounts)
    const paidItems = (session.line_items?.data || []).map(i => ({
      name: i.description,
      quantity: i.quantity,
      price: (i.amount_total || 0) / 100
    }))

    // Ensure customer identity fields exist so /api/orders/track can validate
    // (orderId + phone/email). Stripe metadata may not include email.
    let me = null
    try {
      me = await store.users.findById(req.session.userId)
    } catch {}

    const customerFromPayload = (orderPayload && orderPayload.customer && typeof orderPayload.customer === 'object')
      ? orderPayload.customer
      : null

    const customer = {
      fullName: String(customerFromPayload?.fullName || session.metadata.customerName || '').trim(),
      phone: String(customerFromPayload?.phone || session.metadata.customerPhone || me?.phone || '').trim(),
      email: String(customerFromPayload?.email || me?.email || '').trim().toLowerCase()
    }

    const enrichedOrder = {
      id: session.id,
      userId: req.session.userId,
      amount: (session.amount_total || 0) / 100,
      currency: session.currency,
      status: session.payment_status === "paid" ? "paid" : session.payment_status || "paid",
      createdAt: new Date().toISOString(),

      // Customer identity is required for tracking lookup.
      customer,

      // Prefer full order details coming from checkout page (stored in localStorage)
      // NOTE: legacy orders service expects address to be an object, not null.
      // When address is null, admin table will show location as "-".
      address: orderPayload?.address || {},

      // Keep both: original payload items (if provided) + paidItems
      items: orderPayload?.items || paidItems,
      paidItems,

      // Compatibility fields used by older UIs
      orderStatus: session.payment_status === "paid" ? "paid" : session.payment_status || "paid",
      orderDate: new Date().toISOString(),
      totalAmount: (session.amount_total || 0) / 100,

      // Useful for debugging
      stripe: {
        sessionId: session.id
      }
    }

    await store.orders.create(enrichedOrder)

    // ---------- STOCK DEDUCTION (idempotent) ----------
    // Reduce product stockQty only once per Stripe session.
    // We store a small marker file under /src/.stock-deductions to avoid double-deduct
    // if /api/checkout/success is retried.
    try {
      const markDir = path.join(__dirname, '.stock-deductions')
      if (!fs.existsSync(markDir)) fs.mkdirSync(markDir, { recursive: true })

      const markFile = path.join(markDir, `${session.id}.json`)
      if (!fs.existsSync(markFile)) {
        const itemsToDeduct = Array.isArray(enrichedOrder.items) && enrichedOrder.items.length
          ? enrichedOrder.items
          : paidItems

        // Map line items to products primarily by id, fallback to partNumber, then by name.
        const byId = new Map(products.map(p => [String(p.id), p]))
        const byPart = new Map(products.map(p => [String(p.partNumber || '').trim().toLowerCase(), p]).filter(([k]) => k))

        for (const it of (itemsToDeduct || [])) {
          const qty = Math.max(0, Number(it.quantity || 1) || 1)
          if (!qty) continue

          const idKey = (it.id != null) ? String(it.id) : ''
          const partKey = String(it.partNumber || it.part_number || '').trim().toLowerCase()
          const nameKey = String(it.name || it.productName || '').trim().toLowerCase()

          const p =
            (idKey && byId.get(idKey)) ||
            (partKey && byPart.get(partKey)) ||
            (nameKey ? products.find(x => String(x.name || '').trim().toLowerCase() === nameKey) : null)

          if (!p) continue

          const cur = Math.max(0, Number(p.stockQty ?? 0) || 0)
          p.stockQty = Math.max(0, cur - qty)
        }

        saveJson(PRODUCTS_FILE, products)
        products = loadJson(PRODUCTS_FILE, products)

        fs.writeFileSync(markFile, JSON.stringify({
          orderId: enrichedOrder.id,
          sessionId: session.id,
          deductedAt: new Date().toISOString()
        }, null, 2))

        console.log('Stock deducted for order:', { sessionId: session.id })
      }
    } catch (e) {
      console.error('Stock deduction failed:', e?.message || e)
      // Do not fail checkout success on stock deduction errors.
    }

    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Order save failed" })
  }
})

/* ---------- LEGACY ADMIN ORDERS (kept for backward compatibility) ---------- */
app.get("/api/orders-legacy", requireAdmin, (req, res) => {
  res.json(orders)
})

/* ---------- ORDERS (NEW) ---------- */
const ordersRoutes = require("./routes/orders.routes")
app.use("/api/orders", ordersRoutes)

/* ---------- MY ORDERS (CUSTOMER) ---------- */
const myOrdersRoutes = require("./routes/my-orders.routes")
app.use("/api/my/orders", myOrdersRoutes)

/* ---------- ENQUIRIES / QUOTES (Pack C) ---------- */
function sanitizeStr(v) {
  if (v === null || v === undefined) return ""
  return String(v).trim()
}

function normalizeEnquiryStatus(s) {
  const v = String(s || "").trim().toLowerCase()
  if (!v) return "New"
  if (["new"].includes(v)) return "New"
  if (["contacted"].includes(v)) return "Contacted"
  if (["quoted"].includes(v)) return "Quoted"
  if (["closed", "resolved", "done"].includes(v)) return "Closed"
  return "New"
}

function formatVehicle(v) {
  if (!v || typeof v !== 'object') return ""
  const make = sanitizeStr(v.make)
  const model = sanitizeStr(v.model)
  const year = sanitizeStr(v.year)
  const engine = sanitizeStr(v.engine)
  return [make, model, year, engine].filter(Boolean).join(' ')
}

function buildEnquiryEmailText(enquiry) {
  const vehicleText = enquiry.vehicle ? formatVehicle(enquiry.vehicle) : ""
  const itemsText = (enquiry.items || [])
    .map(i => `- ${i.name}${i.partNumber ? ` (${i.partNumber})` : ""} x${i.quantity} @ AED ${i.price}`)
    .join("\n")

  return (
    `New enquiry received\n` +
    `Reference: ${enquiry.id}\n` +
    `Status: ${enquiry.status}\n` +
    `Created: ${enquiry.createdAt}\n\n` +
    `Customer\n` +
    `Name: ${enquiry.customer?.name || ""}\n` +
    `Email: ${enquiry.customer?.email || ""}\n` +
    `Phone: ${enquiry.customer?.phone || ""}\n\n` +
    (vehicleText ? `Vehicle\n${vehicleText}\n\n` : "") +
    `Items\n${itemsText}\n\n` +
    (enquiry.notes ? `Notes\n${enquiry.notes}\n\n` : "")
  )
}

async function sendEnquiryEmails(enquiry) {
  // Uses existing Gmail env vars already present in this project.
  const emailUser = process.env.EMAIL_USER
  const emailPass = process.env.EMAIL_PASS
  const adminTo = process.env.ENQUIRY_RECEIVER || process.env.ADMIN_EMAIL

  if (!emailUser || !emailPass || !adminTo) {
    // Email is optional; don't fail the enquiry creation.
    console.warn("Enquiry email not configured (EMAIL_USER/EMAIL_PASS/ENQUIRY_RECEIVER). Skipping email.")
    return
  }

  const nodemailer = require("nodemailer")
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: emailUser, pass: emailPass }
  })

  const subject = `New Enquiry #${enquiry.id}`
  const text = buildEnquiryEmailText(enquiry)

  await transporter.sendMail({
    from: `"JIEDIZHEN Enquiry" <${emailUser}>`,
    to: adminTo,
    subject,
    text
  })

  // Optional customer confirmation
  const sendCustomer = String(process.env.SEND_CUSTOMER_ENQUIRY_CONFIRMATION || "").toLowerCase() === "true"
  const customerEmail = sanitizeStr(enquiry.customer?.email)
  if (sendCustomer && customerEmail) {
    await transporter.sendMail({
      from: `"JIEDIZHEN" <${emailUser}>`,
      to: customerEmail,
      subject: `We received your enquiry (#${enquiry.id})`,
      text:
        `Thanks for your enquiry. Our team will contact you shortly.\n\n` +
        `Reference: ${enquiry.id}\n` +
        (enquiry.vehicle ? `Vehicle: ${formatVehicle(enquiry.vehicle)}\n` : "") +
        `Items:\n${(enquiry.items || []).map(i => `- ${i.name} x${i.quantity}`).join("\n")}\n`
    })
  }
}

app.post("/api/enquiries", async (req, res) => {
  try {
    const { customer, items, vehicle, notes } = req.body || {}

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Enquiry is empty" })
    }

    const custName = sanitizeStr(customer?.name)
    const custPhone = sanitizeStr(customer?.phone)
    const custEmail = sanitizeStr(customer?.email)

    if (!custName || !custPhone) {
      return res.status(400).json({ error: "Customer name and phone are required" })
    }

    const enquiry = {
      id: Date.now(),
      customer: {
        name: custName,
        phone: custPhone,
        email: custEmail
      },
      vehicle: vehicle && typeof vehicle === 'object' ? {
        make: sanitizeStr(vehicle.make),
        model: sanitizeStr(vehicle.model),
        year: sanitizeStr(vehicle.year),
        engine: sanitizeStr(vehicle.engine)
      } : null,
      items: items.map(item => ({
        id: item.id,
        name: sanitizeStr(item.name),
        partNumber: sanitizeStr(item.partNumber),
        quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
        price: Number(item.price) || 0
      })),
      notes: sanitizeStr(notes),
      status: "New",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    enquiries.push(enquiry)
    saveJson(ENQUIRIES_FILE, enquiries)

    // Email notification (optional)
    try {
      await sendEnquiryEmails(enquiry)
    } catch (e) {
      console.error("Failed to send enquiry email:", e)
    }

    res.json({ success: true, referenceId: enquiry.id })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Enquiry failed" })
  }
})

app.get("/api/enquiries/:id", (req, res) => {
  const id = Number(req.params.id)
  const enquiry = enquiries.find(e => e.id === id)
  if (!enquiry) {
    return res.status(404).json({ error: "Enquiry not found" })
  }
  res.json(enquiry)
})

app.get("/api/enquiries", requireAdmin, (req, res) => {
  res.json(enquiries)
})

app.put("/api/enquiries/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id)
  const enquiry = enquiries.find(e => e.id === id)
  if (!enquiry) {
    return res.status(404).json({ error: "Enquiry not found" })
  }

  if (req.body.status !== undefined) {
    enquiry.status = normalizeEnquiryStatus(req.body.status)
  }
  if (req.body.notes !== undefined) {
    enquiry.notes = sanitizeStr(req.body.notes)
  }

  enquiry.updatedAt = new Date().toISOString()
  saveJson(ENQUIRIES_FILE, enquiries)
  res.json(enquiry)
})

/* ---------- VEHICLES ---------- */
app.get("/api/vehicles", (req, res) => {
  const vehicles = loadJson(path.join(__dirname, "vehicles.json"), [])
  res.json(vehicles)
})

app.post("/api/vehicles", requireAdmin, (req, res) => {
  const vehicles = loadJson(path.join(__dirname, "vehicles.json"), [])
  const vehicle = { id: Date.now(), ...req.body }
  vehicles.push(vehicle)
  saveJson(path.join(__dirname, "vehicles.json"), vehicles)
  res.json(vehicle)
})

app.put("/api/vehicles/:id", requireAdmin, (req, res) => {
  const vehicles = loadJson(path.join(__dirname, "vehicles.json"), [])
  const id = Number(req.params.id)
  const vehicle = vehicles.find(v => v.id === id)
  if (!vehicle) return res.status(404).json({ error: "Vehicle not found" })
  Object.assign(vehicle, req.body)
  saveJson(path.join(__dirname, "vehicles.json"), vehicles)
  res.json(vehicle)
})

app.delete("/api/vehicles/:id", requireAdmin, (req, res) => {
  let vehicles = loadJson(path.join(__dirname, "vehicles.json"), [])
  vehicles = vehicles.filter(v => v.id !== Number(req.params.id))
  saveJson(path.join(__dirname, "vehicles.json"), vehicles)
  res.json({ success: true })
})

/* ---------- ERROR HANDLING (CENTRALIZED) ---------- */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500
  const isProd = app.get("env") === "production"
  const payload = {
    error: status >= 500 ? "Internal Server Error" : err.message || "Request failed"
  }
  if (!isProd) {
    payload.details = {
      name: err.name,
      message: err.message,
      stack: err.stack
    }
  }
  console.error("Unhandled error:", err)
  res.status(status).json(payload)
})

/* ---------- FRONTEND FALLBACK ---------- */
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"))
})

// Only start server if not in serverless environment (Vercel, Netlify Functions, etc.)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`)
  })
}

module.exports = app