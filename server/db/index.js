const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'vale_a_corrida',
};

const pool = mysql.createPool({
  ...config,
  connectionLimit: 10,
  decimalNumbers: true, // DECIMAL volta como number, não string
  dateStrings: ['DATE'], // DATE volta como "AAAA-MM-DD", sem conversão de fuso
});

// Cria o banco (se não existir) e aplica o schema.sql.
async function initDatabase() {
  const conn = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    multipleStatements: true,
  });
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await conn.query(`USE \`${config.database}\``);
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await conn.query(schema);
  } finally {
    await conn.end();
  }
}

module.exports = { pool, initDatabase, config };
