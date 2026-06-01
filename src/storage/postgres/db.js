"use strict"

const { Pool } = require("pg")

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for postgres provider")
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined
})

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      phone TEXT,
      password_hash TEXT,
      profile_json JSONB,
      reset_token TEXT,
      reset_token_expires_at BIGINT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id BIGINT,
      amount NUMERIC,
      currency TEXT,
      status TEXT,
      created_at TEXT,
      customer_json JSONB,
      address_json JSONB,
      items_json JSONB,
      paid_items_json JSONB,
      stripe_json JSONB
    );
    CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);

    CREATE TABLE IF NOT EXISTS products (
      id BIGINT PRIMARY KEY,
      json JSONB
    );
  `)
}

module.exports = { pool, init }
