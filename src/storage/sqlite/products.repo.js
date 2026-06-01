"use strict"

const db = require("./db")

function list() {
  const rows = db.prepare("SELECT json FROM products").all()
  return rows.map(r => JSON.parse(r.json))
}

function findById(id) {
  const r = db.prepare("SELECT json FROM products WHERE id = ?").get(Number(id))
  return r ? JSON.parse(r.json) : null
}

function create(product) {
  db.prepare("INSERT INTO products (id, json) VALUES (?, ?)").run(Number(product.id), JSON.stringify(product))
  return product
}

function updateById(id, patch) {
  const existing = findById(id)
  if (!existing) return null
  const next = { ...existing, ...patch }
  db.prepare("UPDATE products SET json = ? WHERE id = ?").run(JSON.stringify(next), Number(id))
  return next
}

function deleteById(id) {
  const info = db.prepare("DELETE FROM products WHERE id = ?").run(Number(id))
  return info.changes > 0
}

module.exports = {
  list,
  findById,
  create,
  updateById,
  deleteById
}
