"use strict"

/**
 * Storage provider facade.
 *
 * Select provider via env:
 *  - DB_PROVIDER=json (default)
 *  - DB_PROVIDER=sqlite
 *  - DB_PROVIDER=postgres
 */

function getProviderName() {
  return String(process.env.DB_PROVIDER || "json").trim().toLowerCase()
}

function loadProvider() {
  const provider = getProviderName()

  if (provider === "sqlite") {
    return require("./sqlite")
  }

  if (provider === "postgres" || provider === "postgresql" || provider === "pg") {
    return require("./postgres")
  }

  return require("./json")
}

module.exports = loadProvider()
module.exports.provider = getProviderName()
