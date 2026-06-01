"use strict"

const { pool, init } = require("./db")

let inited = false
async function ensure() {
  if (inited) return
  await init()
  inited = true
}

async function list() {
  await ensure()
  const { rows } = await pool.query("SELECT json FROM products")
  return rows.map(r => r.json)
}

async function findById(id) {
  await ensure()
  const { rows } = await pool.query("SELECT json FROM products WHERE id = $1", [Number(id)])
  return rows[0]?.json || null
}

async function create(product) {
  await ensure()
  await pool.query("INSERT INTO products (id, json) VALUES ($1, $2)", [Number(product.id), product])
  return product
}

async function updateById(id, patch) {
  await ensure()
  const existing = await findById(id)
  if (!existing) return null
  const next = { ...existing, ...patch }
  await pool.query("UPDATE products SET json = $1 WHERE id = $2", [next, Number(id)])
  return next
}

async function deleteById(id) {
  await ensure()
  const info = await pool.query("DELETE FROM products WHERE id = $1", [Number(id)])
  return info.rowCount > 0
}

module.exports = {
  list,
  findById,
  create,
  updateById,
  deleteById
}
