"use strict"

const path = require("path")
const { readJsonSync, updateJson } = require("./fileStore")

const ORDERS_FILE = path.join(__dirname, "../../orders.json")

function list() {
  return readJsonSync(ORDERS_FILE, [])
}

function listFiltered({ status } = {}) {
  let orders = list()
  if (status) {
    orders = orders.filter(o => String(o.status || o.orderStatus || '').toLowerCase() === String(status).toLowerCase())
  }
  return orders
}

function findById(id) {
  const orders = list()
  return orders.find(o => String(o.id) === String(id)) || null
}

async function create(order) {
  await updateJson(ORDERS_FILE, [], orders => {
    orders.push(order)
    return orders
  })
  return order
}

async function updateById(id, patch) {
  let updated = null
  await updateJson(ORDERS_FILE, [], orders => {
    const idx = orders.findIndex(o => String(o.id) === String(id))
    if (idx === -1) return orders
    orders[idx] = { ...orders[idx], ...patch }
    updated = orders[idx]
    return orders
  })
  return updated
}

function listByUser(user) {
  const orders = list()
  const email = String(user?.email || "").trim().toLowerCase()
  const phone = String(user?.phone || "").trim()

  return orders
    .filter(o => {
      if (o.userId && o.userId === user.id) return true
      const cEmail = String(o.customer?.email || "").trim().toLowerCase()
      const cPhone = String(o.customer?.phone || "").trim()
      return (email && cEmail && cEmail === email) || (phone && cPhone && cPhone === phone)
    })
    .sort((a, b) => {
      const ta = Date.parse(a.createdAt || 0)
      const tb = Date.parse(b.createdAt || 0)
      return tb - ta
    })
}

module.exports = {
  list,
  listFiltered,
  findById,
  create,
  updateById,
  listByUser
}
