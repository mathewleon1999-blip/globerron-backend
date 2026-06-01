"use strict"

const path = require("path")
const { readJsonSync, updateJson } = require("./fileStore")

const PRODUCTS_FILE = path.join(__dirname, "../../products.json")

function list() {
  return readJsonSync(PRODUCTS_FILE, [])
}

function findById(id) {
  const products = list()
  const pidNum = Number(id)
  return products.find(p => Number(p.id) === pidNum) || products.find(p => String(p.id) === String(id)) || null
}

async function create(product) {
  await updateJson(PRODUCTS_FILE, [], products => {
    products.push(product)
    return products
  })
  return product
}

async function updateById(id, patch) {
  let updated = null
  await updateJson(PRODUCTS_FILE, [], products => {
    const idx = products.findIndex(p => Number(p.id) === Number(id) || String(p.id) === String(id))
    if (idx === -1) return products
    products[idx] = { ...products[idx], ...patch }
    updated = products[idx]
    return products
  })
  return updated
}

async function deleteById(id) {
  let deleted = false
  await updateJson(PRODUCTS_FILE, [], products => {
    const before = products.length
    const next = products.filter(p => !(Number(p.id) === Number(id) || String(p.id) === String(id)))
    deleted = next.length !== before
    return next
  })
  return deleted
}

module.exports = {
  list,
  findById,
  create,
  updateById,
  deleteById
}
