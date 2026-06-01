import Stripe from "stripe"

// Strictly require the Stripe secret from environment and fail fast in dev.
// Do not log the actual key to avoid accidental exposure in logs.
const key = process.env.STRIPE_SECRET_KEY
if (!key) {
  throw new Error("STRIPE_SECRET_KEY is not set. Configure it in environment variables.")
}

const stripe = new Stripe(key, {
  apiVersion: "2024-06-20",
})

export default stripe
