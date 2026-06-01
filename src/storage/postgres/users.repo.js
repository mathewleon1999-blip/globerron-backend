"use strict"

const { pool, init } = require("./db")

let inited = false
async function ensure() {
  if (inited) return
  await init()
  inited = true
}

function rowToUser(r) {
  if (!r) return null
  return {
    id: Number(r.id),
    name: r.name,
    email: r.email,
    phone: r.phone,
    passwordHash: r.password_hash,
    profile: r.profile_json || {},
    resetToken: r.reset_token || undefined,
    resetTokenExpiresAt: r.reset_token_expires_at ? Number(r.reset_token_expires_at) : undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

async function findById(id) {
  await ensure()
  const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id])
  return rowToUser(rows[0])
}

async function findByEmail(emailNorm) {
  await ensure()
  const { rows } = await pool.query("SELECT * FROM users WHERE lower(email) = lower($1)", [emailNorm])
  return rowToUser(rows[0])
}

async function create(user) {
  await ensure()
  await pool.query(
    `INSERT INTO users (id, name, email, phone, password_hash, profile_json, reset_token, reset_token_expires_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`
    ,
    [
      user.id,
      user.name,
      user.email,
      user.phone,
      user.passwordHash,
      user.profile || {},
      user.resetToken || null,
      user.resetTokenExpiresAt || null,
      user.createdAt || null,
      user.updatedAt || null
    ]
  )
  return user
}

async function updateById(id, patch) {
  await ensure()
  const existing = await findById(id)
  if (!existing) return null
  const next = { ...existing, ...patch }

  await pool.query(
    `UPDATE users SET name=$1, email=$2, phone=$3, password_hash=$4, profile_json=$5, reset_token=$6, reset_token_expires_at=$7, created_at=$8, updated_at=$9 WHERE id=$10`,
    [
      next.name,
      next.email,
      next.phone,
      next.passwordHash,
      next.profile || {},
      next.resetToken || null,
      next.resetTokenExpiresAt || null,
      next.createdAt || null,
      next.updatedAt || null,
      id
    ]
  )

  return findById(id)
}

async function deleteById(id) {
  await ensure()
  const info = await pool.query("DELETE FROM users WHERE id = $1", [id])
  return info.rowCount > 0
}

module.exports = {
  findById,
  findByEmail,
  create,
  updateById,
  deleteById
}
