const { Pool } = require("pg")

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "JIEDIZHEN",
  password: "globe",
  port: 5432
})

module.exports = pool
