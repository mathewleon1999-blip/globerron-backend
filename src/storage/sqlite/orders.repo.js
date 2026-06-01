"use strict"

const db = require("./db")

function rowToOrder(r) {
  if (!r) return null
  return {
    id: r.id,
    userId: r.userId,
    amount: r.amount,
    currency: r.currency,
    status: r.status,
    createdAt: r.createdAt,
    customer: r.customerJson ? JSON.parse(r.customerJson) : undefined,
    address: r.addressJson ? JSON.parse(r.addressJson) : undefined,
    items: r.itemsJson ? JSON.parse(r.itemsJson) : undefined,
    paidItems: r.paidItemsJson ? JSON.parse(r.paidItemsJson) : undefined,
    stripe: r.stripeJson ? JSON.parse(r.stripeJson) : undefined
  }
}

function findById(id) {
  const r = db.prepare("SELECT * FROM orders WHERE id = ?").get(String(id))
  return rowToOrder(r)
}

function create(order) {
  db.prepare(
    `INSERT INTO orders (id, userId, amount, currency, status, createdAt, customerJson, addressJson, itemsJson, paidItemsJson, stripeJson)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    String(order.id),
    order.userId || null,
    Number(order.amount || 0),
    order.currency || null,
    order.status || null,
    order.createdAt || null,
    JSON.stringify(order.customer || {}),
    JSON.stringify(order.address || {}),
    JSON.stringify(order.items || []),
    JSON.stringify(order.paidItems || []),
    JSON.stringify(order.stripe || {})
  )
  return order
}

function updateById(id, patch) {
  const existing = findById(id)
  if (!existing) return null
  const next = { ...existing, ...patch }

  db.prepare(
    `UPDATE orders SET userId=?, amount=?, currency=?, status=?, createdAt=?, customerJson=?, addressJson=?, itemsJson=?, paidItemsJson=?, stripeJson=? WHERE id=?`
  ).run(
    next.userId || null,
    Number(next.amount || 0),
    next.currency || null,
    next.status || null,
    next.createdAt || null,
    JSON.stringify(next.customer || {}),
    JSON.stringify(next.address || {}),
    JSON.stringify(next.items || []),
    JSON.stringify(next.paidItems || []),
    JSON.stringify(next.stripe || {}),
    String(id)
  )

  return findById(id)
}

function listByUser(user) {
  const rows = db.prepare("SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC").all(user.id)
  return rows.map(rowToOrder)
}

module.exports = {
  findById,
  create,
  updateById,
  listByUser
}
