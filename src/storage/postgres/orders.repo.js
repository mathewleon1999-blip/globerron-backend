"use strict"

const { pool, init } = require("./db")

let inited = false
async function ensure() {
  if (inited) return
  await init()
  inited = true
}

function rowToOrder(r) {
  if (!r) return null
  return {
    id: r.id,
    userId: r.user_id ? Number(r.user_id) : null,
    amount: r.amount != null ? Number(r.amount) : 0,
    currency: r.currency,
    status: r.status,
    createdAt: r.created_at,
    customer: r.customer_json || {},
    address: r.address_json || {},
    items: r.items_json || [],
    paidItems: r.paid_items_json || [],
    stripe: r.stripe_json || {},
    tracking: r.tracking_json || { carrier: '', trackingNumber: '', trackingUrl: '' },
    statusHistory: r.status_history_json || []
  }
}

async function findById(id) {
  await ensure()
  const { rows } = await pool.query("SELECT * FROM orders WHERE id = $1", [String(id)])
  return rowToOrder(rows[0])
}

async function list({ status } = {}) {
  await ensure()
  const params = []
  let sql = 'SELECT * FROM orders'
  if (status) {
    params.push(String(status))
    sql += ` WHERE status = ${params.length}`
  }
  sql += ' ORDER BY created_at DESC'
  const { rows } = await pool.query(sql, params)
  return rows.map(rowToOrder)
}

function toJsonb(value) {
  if (value == null) return null
  if (typeof value === "string") {
    // If upstream accidentally sends stringified JSON, accept it.
    // If it isn't valid JSON, store it as a JSON string to avoid query failure.
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

async function create(order) {
  await ensure()
  await pool.query(
    `INSERT INTO orders (id, user_id, amount, currency, status, created_at, customer_json, address_json, items_json, paid_items_json, stripe_json, tracking_json, status_history_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      String(order.id),
      order.userId || null,
      Number(order.amount || 0),
      order.currency || null,
      order.status || null,
      order.createdAt || null,
      toJsonb(order.customer) ?? {},
      toJsonb(order.address) ?? {},
      toJsonb(order.items) ?? [],
      toJsonb(order.paidItems) ?? [],
      toJsonb(order.stripe) ?? {},
      toJsonb(order.tracking) ?? { carrier: '', trackingNumber: '', trackingUrl: '' },
      toJsonb(order.statusHistory) ?? []
    ]
  )
  return order
}

async function updateById(id, patch) {
  await ensure()
  const existing = await findById(id)
  if (!existing) return null
  const next = { ...existing, ...patch }

  await pool.query(
    `UPDATE orders SET user_id=$1, amount=$2, currency=$3, status=$4, created_at=$5, customer_json=$6, address_json=$7, items_json=$8, paid_items_json=$9, stripe_json=$10, tracking_json=$11, status_history_json=$12 WHERE id=$13`,
    [
      next.userId || null,
      Number(next.amount || 0),
      next.currency || null,
      next.status || null,
      next.createdAt || null,
      toJsonb(next.customer) ?? {},
      toJsonb(next.address) ?? {},
      toJsonb(next.items) ?? [],
      toJsonb(next.paidItems) ?? [],
      toJsonb(next.stripe) ?? {},
      toJsonb(next.tracking) ?? { carrier: '', trackingNumber: '', trackingUrl: '' },
      toJsonb(next.statusHistory) ?? [],
      String(id)
    ]
  )

  return findById(id)
}

async function listByUser(user) {
  await ensure()
  const { rows } = await pool.query("SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC", [user.id])
  return rows.map(rowToOrder)
}

module.exports = {
  list,
  findById,
  create,
  updateById,
  listByUser
}
