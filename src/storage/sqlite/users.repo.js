"use strict"

const db = require("./db")

function rowToUser(r) {
  if (!r) return null
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    passwordHash: r.passwordHash,
    profile: r.profileJson ? JSON.parse(r.profileJson) : {},
    resetToken: r.resetToken || undefined,
    resetTokenExpiresAt: r.resetTokenExpiresAt || undefined,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  }
}

function findById(id) {
  const r = db.prepare("SELECT * FROM users WHERE id = ?").get(id)
  return rowToUser(r)
}

function findByEmail(emailNorm) {
  const r = db.prepare("SELECT * FROM users WHERE lower(email) = lower(?)").get(emailNorm)
  return rowToUser(r)
}

function create(user) {
  db.prepare(
    `INSERT INTO users (id, name, email, phone, passwordHash, profileJson, resetToken, resetTokenExpiresAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    user.id,
    user.name,
    user.email,
    user.phone,
    user.passwordHash,
    JSON.stringify(user.profile || {}),
    user.resetToken || null,
    user.resetTokenExpiresAt || null,
    user.createdAt || null,
    user.updatedAt || null
  )
  return user
}

function updateById(id, patch) {
  const existing = findById(id)
  if (!existing) return null
  const next = { ...existing, ...patch }

  db.prepare(
    `UPDATE users SET name=?, email=?, phone=?, passwordHash=?, profileJson=?, resetToken=?, resetTokenExpiresAt=?, createdAt=?, updatedAt=? WHERE id=?`
  ).run(
    next.name,
    next.email,
    next.phone,
    next.passwordHash,
    JSON.stringify(next.profile || {}),
    next.resetToken || null,
    next.resetTokenExpiresAt || null,
    next.createdAt || null,
    next.updatedAt || null,
    id
  )

  return findById(id)
}

function deleteById(id) {
  const info = db.prepare("DELETE FROM users WHERE id = ?").run(id)
  return info.changes > 0
}

module.exports = {
  findById,
  findByEmail,
  create,
  updateById,
  deleteById
}
