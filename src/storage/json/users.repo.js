"use strict"

const path = require("path")
const { readJsonSync, updateJson } = require("./fileStore")

const USERS_FILE = path.join(__dirname, "../../users.json")

function list() {
  return readJsonSync(USERS_FILE, [])
}

async function create(user) {
  await updateJson(USERS_FILE, [], users => {
    users.push(user)
    return users
  })
  return user
}

function findById(id) {
  const users = list()
  return users.find(u => u.id === id) || null
}

function findByEmail(emailNorm) {
  const users = list()
  return users.find(u => String(u.email || "").toLowerCase() === String(emailNorm || "").toLowerCase()) || null
}

async function updateById(id, patch) {
  let updated = null
  await updateJson(USERS_FILE, [], users => {
    const idx = users.findIndex(u => u.id === id)
    if (idx === -1) return users
    users[idx] = { ...users[idx], ...patch }
    updated = users[idx]
    return users
  })
  return updated
}

async function deleteById(id) {
  let deleted = false
  await updateJson(USERS_FILE, [], users => {
    const before = users.length
    const next = users.filter(u => u.id !== id)
    deleted = next.length !== before
    return next
  })
  return deleted
}

module.exports = {
  list,
  create,
  findById,
  findByEmail,
  updateById,
  deleteById
}
