require("dotenv").config();
const mysql = require("mysql2/promise");

const { MYSQL_HOST, MYSQL_USER, MYSQL_PASS, MYSQL_DB } = process.env;
if (!MYSQL_HOST || !MYSQL_USER || !MYSQL_PASS || !MYSQL_DB) {
    throw new Error("Variáveis de ambiente do MySQL ausentes");
}

const pool = mysql.createPool({
    host: MYSQL_HOST,
    user: MYSQL_USER,
    password: MYSQL_PASS,
    database: MYSQL_DB,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;
