const { Pool } = require('pg');

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false }
    : {
        host:     process.env.DB_HOST     || 'auth-db',
        port:     parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME     || 'authdb',
        user:     process.env.DB_USER     || 'admin',
        password: process.env.DB_PASSWORD || 'secret123',
      }
);

module.exports = { pool };
