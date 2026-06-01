const express = require("express")
const Stripe = require("stripe")
const path = require("path")
const fs = require("fs")

// Ensure env vars are loaded when this file is required directly.
// Only load from .env file if it exists (Vercel/Render provide env vars directly)
try {
  const envPath = path.resolve(__dirname, "../../.env")
  if (fs.existsSync(envPath)) {
    require("dotenv").config({ path: envPath })
  }
} catch {
  // Ignore - env vars will come from hosting platform
}

const stripeKey = process.env.STRIPE_SECRET_KEY
const stripe = stripeKey ? new Stripe(stripeKey) : null

const router = express.Router()

function loadProducts() {
  try {
    const productsFile = path.resolve(__dirname, "../products.json")
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(productsFile)
  } catch {
    return []
  }
}

function normalizeKey(v) {
  return String(v || "").trim().toLowerCase()
}

router.post("/create-checkout-session", async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: "Stripe is not configured" })
    }

    const { items } = req.body || {}

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Cart is empty" })
    }

    // Derive pricing server-side to prevent tampering.
    // Accepts: {id} or {partNumber} (preferred), falls back to name match for backwards compatibility.
    const products = loadProducts()
    const byId = new Map(products.map(p => [String(p.id), p]))
    const byPart = new Map(
      products
        .map(p => [normalizeKey(p.partNumber), p])
        .filter(([k]) => k)
    )

    const resolved = items.map((item, idx) => {
      const qty = Math.max(1, Math.min(99, Number(item.quantity || 1) || 1))
      const idKey = item.id != null ? String(item.id) : ""
      const partKey = normalizeKey(item.partNumber || item.part_number)
      const nameKey = normalizeKey(item.productName || item.name)

      const p =
        (idKey && byId.get(idKey)) ||
        (partKey && byPart.get(partKey)) ||
        (nameKey ? products.find(x => normalizeKey(x.name) === nameKey) : null)

      if (!p) {
        const err = new Error(`Unknown product at index ${idx}. Send id or partNumber.`)
        err.status = 400
        throw err
      }

      const unitAmount = Math.round(Math.max(0, Number(p.price || 0)) * 100)
      if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
        const err = new Error(`Invalid product price for ${p.name || p.id}`)
        err.status = 500
        throw err
      }

      return {
        product: p,
        qty,
        unitAmount
      }
    })

    const lineItems = resolved.map(r => ({
      price_data: {
        currency: "aed",
        product_data: {
          name: r.product.name || "Item",
          metadata: {
            productId: String(r.product.id),
            partNumber: String(r.product.partNumber || "")
          }
        },
        unit_amount: r.unitAmount
      },
      quantity: r.qty
    }))

    const baseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:5000"

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel.html`
    })

    return res.json({ url: session.url })
  } catch (error) {
    console.error("Stripe error:", error)
    const status = error.status || 500
    return res.status(status).json({ error: status === 400 ? error.message : "Unable to create checkout session" })
  }
})

module.exports = router
