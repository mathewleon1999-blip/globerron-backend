"use strict"

const fs = require("fs")
const path = require("path")

// Simple in-process per-file queue to avoid concurrent write corruption.
const queues = new Map()

function ensureDir(filePath) {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function readJsonSync(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    const raw = fs.readFileSync(filePath, "utf8")
    if (!String(raw).trim()) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function atomicWriteJsonSync(filePath, data) {
  ensureDir(filePath)
  const tmp = `${filePath}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8")
  fs.renameSync(tmp, filePath)
}

function enqueue(filePath, fn) {
  const prev = queues.get(filePath) || Promise.resolve()
  const next = prev
    .catch(() => {})
    .then(() => fn())
    .finally(() => {
      // If no one chained after us, clean up.
      if (queues.get(filePath) === next) queues.delete(filePath)
    })

  queues.set(filePath, next)
  return next
}

async function updateJson(filePath, fallback, mutatorFn) {
  return enqueue(filePath, async () => {
    const current = readJsonSync(filePath, fallback)
    const updated = await mutatorFn(current)
    atomicWriteJsonSync(filePath, updated)
    return updated
  })
}

module.exports = {
  readJsonSync,
  updateJson
}
