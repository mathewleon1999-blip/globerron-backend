"use strict"

const path = require("path")
const fs = require("fs")

process.env.DB_PROVIDER = "sqlite"

const sqlite = require("./index")

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

  // Users
  for (const u of users) {
    try {
      if (!sqlite.users.findById(u.id)) {
        sqlite.users.create({
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
    } catch (e) {
      // ignore duplicates
    }
  }

  // Orders
  for (const o of orders) {
    try {
      if (!sqlite.orders.findById(o.id)) {
        sqlite.orders.create({
          ...o,
          id: String(o.id)
        })
      }
    } catch (e) {
      // ignore duplicates
    }
  }

  // Products
  for (const p of products) {
    try {
      if (!sqlite.products.findById(p.id)) {
        sqlite.products.create(p)
      }
    } catch (e) {
      // ignore duplicates
    }
  }

  console.log(`SQLite migration complete. users=${users.length} orders=${orders.length} products=${products.length}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
