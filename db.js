const { Pool } = require("pg");

const pool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "certificate_db",
    password: "Yashu2003",
    port: 5432
});

pool.connect()
    .then(() => console.log("PostgreSQL Connected Successfully"))
    .catch(err => console.error("PostgreSQL Connection Error:", err));

module.exports = pool;
