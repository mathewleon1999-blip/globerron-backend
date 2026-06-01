import express from "express"
import stripe from "../services/stripe.js"

const router = express.Router()

router.post("/create-checkout-session", async (req, res) => {
  try {
    const { items } = req.body

    if (!items || !items.length) {
      return res.status(400).json({ error: "Cart is empty" })
    }

    const lineItems = items.map(item => ({
      price_data: {
        currency: "aed",
        product_data: {
          name: item.name
        },
        unit_amount: Math.round(item.price * 100)
      },
      quantity: item.quantity || 1
    }))

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: "http://localhost:5000/success.html?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "http://localhost:5000/cancel.html"
    })

    res.json({ url: session.url })
  } catch (error) {
    console.error("Stripe error:", error)
    res.status(500).json({ error: "Unable to create checkout session" })
  }
})

export default router
