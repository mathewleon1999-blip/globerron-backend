"use strict"

const path = require("path")
const Database = require("better-sqlite3")

const dbFile = process.env.SQLITE_FILE
  ? path.isAbsolute(process.env.SQLITE_FILE)
    ? process.env.SQLITE_FILE
    : path.join(process.cwd(), process.env.SQLITE_FILE)
  : path.join(process.cwd(), "src", "data.sqlite")

const db = new Database(dbFile)

db.pragma("journal_mode = WAL")

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  phone TEXT,
  passwordHash TEXT,
  profileJson TEXT,
  resetToken TEXT,
  resetTokenExpiresAt INTEGER,
  createdAt TEXT,
  updatedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  userId INTEGER,
  amount REAL,
  currency TEXT,
  status TEXT,
  createdAt TEXT,
  customerJson TEXT,
  addressJson TEXT,
  itemsJson TEXT,
  paidItemsJson TEXT,
  stripeJson TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_userId ON orders(userId);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  json TEXT
);
`)

module.exports = db
