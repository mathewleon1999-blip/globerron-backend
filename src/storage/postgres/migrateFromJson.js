"use strict"

const path = require("path")
const fs = require("fs")

// Load .env when running as a standalone script
try {
  require("dotenv").config({ path: path.join(__dirname, "../../../.env") })
} catch {}

process.env.DB_PROVIDER = "postgres"

const pgStore = require("./index")

function readJson(file, fallback) {
  try {
    const raw = fs.readFileSync(file, "utf8")
    if (!raw.trim()) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

async function main() {
  const usersFile = path.join(__dirname, "../../users.json")
  const ordersFile = path.join(__dirname, "../../orders.json")
  const productsFile = path.join(__dirname, "../../products.json")

  const users = readJson(usersFile, [])
  const orders = readJson(ordersFile, [])
  const products = readJson(productsFile, [])

  for (const u of users) {
    try {
      const existing = await pgStore.users.findById(u.id)
      if (!existing) {
        await pgStore.users.create({
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          passwordHash: u.passwordHash,
          profile: u.profile || {},
          resetToken: u.resetToken,
          resetTokenExpiresAt: u.resetTokenExpiresAt,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt
        })
      }
    } catch {
      // ignore duplicates
    }
  }

  for (const o of orders) {
    try {
      const existing = await pgStore.orders.findById(o.id)
      if (!existing) {
        await pgStore.orders.create({ ...o, id: String(o.id) })
      }
    } catch {
      // ignore duplicates
    }
  }

  for (const p of products) {
    try {
      const existing = await pgStore.products.findById(p.id)
      if (!existing) {
        await pgStore.products.create(p)
      }
    } catch {
      // ignore duplicates
    }
  }

  console.log(`Postgres migration complete. users=${users.length} orders=${orders.length} products=${products.length}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
